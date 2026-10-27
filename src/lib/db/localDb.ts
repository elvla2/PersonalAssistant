import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

export const LOCAL_USER_ID = '00000000-0000-0000-0000-000000000001';

export const BOOLEAN_COLUMNS = new Set([
  'use_ssl',
  'is_enabled',
  'is_outgoing_last',
  'is_completed',
  'auto_purge_enabled',
  'is_system',
  'is_active',
  'restored',
]);

export const JSON_COLUMNS = new Set([
  'user_aliases',
  'suggested_replies',
]);

/**
 * Returns the root data directory for the Personal Assistant application.
 * Priority:
 * 1. process.env.LOCAL_DB_DIR
 * 2. OS-specific AppData / Application Support directory
 * 3. ./data fallback
 */
export function getLocalDbDir(): string {
  if (process.env.LOCAL_DB_DIR) {
    const customDir = process.env.LOCAL_DB_DIR;
    if (!fs.existsSync(customDir)) {
      try {
        fs.mkdirSync(customDir, { recursive: true });
      } catch {
        // ignore
      }
    }
    return customDir;
  }

  let preferredDir = '';
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    preferredDir = path.join(appData, 'PersonalAssistant');
  } else if (process.platform === 'darwin') {
    preferredDir = path.join(os.homedir(), 'Library', 'Application Support', 'PersonalAssistant');
  } else {
    preferredDir = path.resolve(process.cwd(), 'data');
  }

  try {
    if (!fs.existsSync(preferredDir)) {
      fs.mkdirSync(preferredDir, { recursive: true });
    }
    return preferredDir;
  } catch {
    const fallbackDir = path.resolve(process.cwd(), 'data');
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }
    } catch {
      // ignore
    }
    return fallbackDir;
  }
}

export function getMasterDbPath(): string {
  return path.join(getLocalDbDir(), 'master.db');
}

export function getUserDir(userId: string): string {
  return path.join(getLocalDbDir(), 'users', userId);
}

export function getUserDbPath(userId: string): string {
  return path.join(getUserDir(userId), 'data.db');
}

export function getUserWhatsAppDir(userId: string): string {
  return path.join(getUserDir(userId), 'whatsapp_auth');
}

/**
 * Backward-compatible helper for legacy references
 */
export function getLocalDbPath(): string {
  return getMasterDbPath();
}

/**
 * In-memory connection cache of open DatabaseSync instances keyed by userId
 */
const userDbCache = new Map<string, DatabaseSync>();

export function closeUserDatabase(userId: string): void {
  const db = userDbCache.get(userId);
  if (db) {
    try {
      db.close();
    } catch {
      // ignore
    }
    userDbCache.delete(userId);
  }
}

export function closeAllUserDatabases(): void {
  for (const [userId, db] of userDbCache.entries()) {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
  userDbCache.clear();
}

/**
 * Initializes and provisions a brand-new SQLite database file specifically for the user.
 */
export function initUserDatabase(userId: string, email: string = 'local@assistant.app', displayName: string = 'Local User'): DatabaseSync {
  const uDir = getUserDir(userId);
  if (!fs.existsSync(uDir)) {
    fs.mkdirSync(uDir, { recursive: true });
  }

  const waDir = getUserWhatsAppDir(userId);
  if (!fs.existsSync(waDir)) {
    fs.mkdirSync(waDir, { recursive: true });
  }

  const dbPath = getUserDbPath(userId);
  const db = new DatabaseSync(dbPath);

  // Performance and integrity pragmas
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. User Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      llm_model TEXT DEFAULT 'gemini-2.5-flash',
      gemini_api_key TEXT,
      display_name TEXT DEFAULT '',
      user_aliases TEXT DEFAULT '[]',
      primary_email TEXT,
      digest_hour INTEGER DEFAULT 8,
      digest_minute INTEGER DEFAULT 0,
      auto_purge_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 2. Connected Email Accounts
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      account_type TEXT DEFAULT 'custom_imap',
      email TEXT NOT NULL,
      imap_server TEXT NOT NULL,
      imap_port INTEGER DEFAULT 993,
      smtp_server TEXT,
      smtp_port INTEGER DEFAULT 587,
      password TEXT NOT NULL,
      signature TEXT DEFAULT '',
      use_ssl INTEGER DEFAULT 1,
      is_enabled INTEGER DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 3. Conversation Threads
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      external_id TEXT NOT NULL,
      subject_or_title TEXT,
      participants TEXT,
      sender_email TEXT,
      snippet TEXT,
      body_text TEXT,
      body_html TEXT,
      last_message_at TEXT NOT NULL,
      last_message_sender TEXT,
      is_outgoing_last INTEGER DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 4. Action Items
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      thread_id TEXT NOT NULL REFERENCES conversation_threads(id) ON DELETE CASCADE,
      account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
      channel TEXT NOT NULL,
      type TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P2_MEDIUM',
      title TEXT NOT NULL,
      summary TEXT,
      deadline_text TEXT,
      suggested_reply TEXT,
      suggested_replies TEXT DEFAULT '[]',
      is_completed INTEGER DEFAULT 0,
      detected_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
  `);

  // 5. Exclusion Rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS exclusion_rules (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      channel TEXT NOT NULL DEFAULT 'all',
      rule_type TEXT NOT NULL DEFAULT 'sender',
      pattern TEXT NOT NULL,
      reason TEXT,
      is_system INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 6. AI Purge Log
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_purge_log (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      sender TEXT,
      subject_or_snippet TEXT,
      reason TEXT,
      confidence_score REAL DEFAULT 1.0,
      purged_at TEXT DEFAULT (datetime('now')),
      restored INTEGER DEFAULT 0,
      restored_at TEXT
    );
  `);

  // 7. Priority Rules
  db.exec(`
    CREATE TABLE IF NOT EXISTS priority_rules (
      id TEXT PRIMARY KEY,
      keyword TEXT NOT NULL,
      language TEXT NOT NULL,
      category TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'P1_HIGH',
      channel TEXT NOT NULL DEFAULT 'all',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 8. WhatsApp Sessions
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_sessions (
      user_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'disconnected',
      qr_code TEXT,
      phone_number TEXT,
      last_seen_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Performance indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_threads_user_id ON conversation_threads(user_id);
    CREATE INDEX IF NOT EXISTS idx_threads_status ON conversation_threads(status);
    CREATE INDEX IF NOT EXISTS idx_action_items_user_id ON action_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_action_items_thread_id ON action_items(thread_id);
    CREATE INDEX IF NOT EXISTS idx_ai_purge_log_user_id ON ai_purge_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_exclusion_rules_user_id ON exclusion_rules(user_id);
    CREATE INDEX IF NOT EXISTS idx_priority_rules_keyword ON priority_rules(keyword);
  `);

  // Initial user settings row for this private database
  const userCheck = db.prepare('SELECT id FROM user_settings WHERE id = ?').get(userId);
  if (!userCheck) {
    const aliasJson = JSON.stringify([displayName.trim().toLowerCase()]);
    db.prepare(`
      INSERT INTO user_settings (id, llm_model, display_name, user_aliases, primary_email, auto_purge_enabled, created_at, updated_at)
      VALUES (?, 'gemini-2.5-flash', ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(userId, displayName, aliasJson, email);
  }

  // Seed default system exclusion rules if missing
  const sysRuleCheck = db.prepare('SELECT COUNT(*) as cnt FROM exclusion_rules WHERE is_system = 1').get() as { cnt: number };
  if (!sysRuleCheck || sysRuleCheck.cnt === 0) {
    const insertRule = db.prepare(`
      INSERT INTO exclusion_rules (id, user_id, channel, rule_type, pattern, reason, is_system, is_active)
      VALUES (?, NULL, ?, ?, ?, ?, 1, 1)
    `);

    const defaultRules = [
      { channel: 'email', rule_type: 'sender', pattern: 'no-reply', reason: 'Automated noreply broadcast address' },
      { channel: 'email', rule_type: 'sender', pattern: 'noreply', reason: 'Automated noreply broadcast address' },
      { channel: 'email', rule_type: 'sender', pattern: 'donotreply', reason: 'Automated notification address' },
      { channel: 'email', rule_type: 'sender', pattern: 'notifications@', reason: 'Automated system notifications' },
      { channel: 'email', rule_type: 'sender', pattern: 'notification@', reason: 'Automated system notifications' },
      { channel: 'email', rule_type: 'sender', pattern: 'mailer-daemon', reason: 'Email delivery failure daemon' },
      { channel: 'email', rule_type: 'sender', pattern: 'bounce@', reason: 'Email bounce handler' },
      { channel: 'email', rule_type: 'sender', pattern: 'postmaster@', reason: 'Mail server postmaster' },
      { channel: 'email', rule_type: 'sender', pattern: 'jira@', reason: 'Atlassian Jira issue tracking' },
      { channel: 'email', rule_type: 'sender', pattern: 'calendar-notification@google.com', reason: 'Google Calendar notifications' },
      { channel: 'email', rule_type: 'sender', pattern: 'news@', reason: 'Newsletter / marketing broadcasts' },
      { channel: 'email', rule_type: 'subject', pattern: 'terms of service', reason: 'Legal terms and privacy policy updates' },
      { channel: 'email', rule_type: 'subject', pattern: 'privacy policy', reason: 'Privacy policy updates' },
      { channel: 'email', rule_type: 'subject', pattern: 'automatic reply', reason: 'Out of office automatic response' },
      { channel: 'email', rule_type: 'subject', pattern: 'out of office', reason: 'Out of office automatic response' },
    ];

    for (const r of defaultRules) {
      insertRule.run(randomUUID(), r.channel, r.rule_type, r.pattern, r.reason);
    }
  }

  // Seed default bilingual priority rules if missing
  const prioCheck = db.prepare('SELECT COUNT(*) as cnt FROM priority_rules').get() as { cnt: number };
  if (!prioCheck || prioCheck.cnt === 0) {
    const insertPrio = db.prepare(`
      INSERT INTO priority_rules (id, keyword, language, category, priority, channel)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const defaultPrios = [
      // Financial (English)
      { keyword: 'overdue', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'past due', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'outstanding invoices', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'settle the overdue', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'overdue account', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'payment today', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'process payment today', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'remit payment', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'balance overdue', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'final notice', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'collections', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'credit hold', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'credit line suspended', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'wire transfer today', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'immediate payment required', language: 'en', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      // Financial (Spanish)
      { keyword: 'vencido', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'facturas vencidas', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'saldo vencido', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'cuenta vencida', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'pago hoy', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'procesar pago hoy', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'aviso de cobro', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'último aviso', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'suspensión de crédito', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'bloqueo de cuenta', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'pago inmediato', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'transferir hoy', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'cuenta suspendida', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'cobranza urgente', language: 'es', category: 'financial', priority: 'P1_HIGH', channel: 'all' },
      // Logistics & Customs (English)
      { keyword: 'customs hold', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'cargo on hold', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'shipment on hold', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'held at customs', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'customs detention', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'demurrage', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'detention charges', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'customs exam', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'customs seizure', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'port congestion fee', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'vessel cutoff', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'gate cutoff', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'missed cutoff', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'rollover risk', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'damaged cargo', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'urgent release', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'telex release', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'stop delivery', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'delivery hold', language: 'en', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      // Logistics & Customs (Spanish)
      { keyword: 'carga retenida', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'embarque detenido', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'retenido en aduana', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'detenido por aduana', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'demora', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'estadías', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'almacenaje', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'reconocimiento aduanero', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'inspección física', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'corte de guía', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'corte de zarpe', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'liberación urgente', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'no entregar', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'detener entrega', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'retención aduanera', language: 'es', category: 'logistics', priority: 'P1_HIGH', channel: 'all' },
      // Critical Deadlines (English)
      { keyword: 'urgent', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'asap', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'emergency', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'immediate attention', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'immediately', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'right now', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'today by', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'end of day today', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'eod today', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'before 5pm', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'within 24 hours', language: 'en', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      // Critical Deadlines (Spanish)
      { keyword: 'urgente', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'emergencia', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'de inmediato', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'ahora mismo', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'para hoy', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'hoy mismo', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'a más tardar hoy', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'antes del cierre', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'en las próximas horas', language: 'es', category: 'deadline', priority: 'P1_HIGH', channel: 'all' },
      // Legal (English)
      { keyword: 'legal notice', language: 'en', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'breach of contract', language: 'en', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'service termination', language: 'en', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'lawsuit', language: 'en', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'fraud alert', language: 'en', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      // Legal (Spanish)
      { keyword: 'notificación legal', language: 'es', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'incumplimiento', language: 'es', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'cancelación de servicio', language: 'es', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'demanda', language: 'es', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
      { keyword: 'alerta de fraude', language: 'es', category: 'legal', priority: 'P1_HIGH', channel: 'all' },
    ];

    for (const p of defaultPrios) {
      insertPrio.run(randomUUID(), p.keyword, p.language, p.category, p.priority, p.channel);
    }
  }

  userDbCache.set(userId, db);
  return db;
}

/**
 * Returns the open DatabaseSync instance for a specific user.
 * If not already cached, opens the private data.db file and caches it.
 */
export function getUserDatabase(userId: string): DatabaseSync {
  if (!userId) {
    userId = LOCAL_USER_ID;
  }

  const cached = userDbCache.get(userId);
  if (cached) {
    return cached;
  }

  const dbPath = getUserDbPath(userId);
  if (!fs.existsSync(dbPath)) {
    return initUserDatabase(userId);
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  userDbCache.set(userId, db);
  return db;
}

/**
 * Fallback helper for getting the active user database
 */
export function getDatabase(userId?: string): DatabaseSync {
  return getUserDatabase(userId || LOCAL_USER_ID);
}

export function serializeValue(key: string, val: any): any {
  if (val === undefined || val === null) {
    return null;
  }
  if (typeof val === 'boolean') {
    return val ? 1 : 0;
  }
  if (Array.isArray(val) || (typeof val === 'object' && !(val instanceof Date))) {
    return JSON.stringify(val);
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  return val;
}

export function deserializeValue(key: string, val: any): any {
  if (val === null || val === undefined) {
    return val;
  }
  if (BOOLEAN_COLUMNS.has(key)) {
    return Boolean(val);
  }
  if (JSON_COLUMNS.has(key) && typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return val;
}

export function deserializeRow(row: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    result[k] = deserializeValue(k, v);
  }
  return result;
}
