import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {
  getLocalDbDir,
  getMasterDbPath,
  getUserDbPath,
  getUserWhatsAppDir,
  initUserDatabase,
  LOCAL_USER_ID,
} from './localDb';

export interface LocalUserRecord {
  id: string;
  email: string;
  display_name: string;
  created_at?: string;
}

let masterDbInstance: DatabaseSync | null = null;
let currentMasterDbDir = '';

export function closeMasterDatabase(): void {
  if (masterDbInstance) {
    try {
      masterDbInstance.close();
    } catch {
      // ignore
    }
    masterDbInstance = null;
  }
}

/**
 * Returns the open DatabaseSync instance for the master user registry (master.db).
 */
export function getMasterDatabase(): DatabaseSync {
  const currentDir = getLocalDbDir();
  if (masterDbInstance && currentMasterDbDir === currentDir) {
    return masterDbInstance;
  }

  if (masterDbInstance) {
    try {
      masterDbInstance.close();
    } catch {
      // ignore
    }
    masterDbInstance = null;
  }

  const masterDbPath = getMasterDbPath();
  const dbDir = path.dirname(masterDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(masterDbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);

  masterDbInstance = db;
  currentMasterDbDir = currentDir;
  return masterDbInstance;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  const derived = scryptSync(password, salt, 64).toString('hex');
  const bufA = Buffer.from(derived, 'hex');
  const bufB = Buffer.from(storedHash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Registers a new local user, hashes the password with scryptSync,
 * creates a brand-new private SQLite database file (data.db),
 * and issues a session token.
 */
export function registerLocalUser({
  email,
  password,
  displayName,
}: {
  email: string;
  password: string;
  displayName?: string;
}): { user: LocalUserRecord; token: string } {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const db = getMasterDatabase();
  const normalizedEmail = email.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    throw new Error('User already exists');
  }

  const userId = randomUUID();
  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const finalDisplayName = displayName?.trim() || normalizedEmail.split('@')[0];
  const now = new Date().toISOString();

  // Create isolated user directories
  const userDir = path.join(getLocalDbDir(), 'users', userId);
  const waDir = getUserWhatsAppDir(userId);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  if (!fs.existsSync(waDir)) {
    fs.mkdirSync(waDir, { recursive: true });
  }

  // Provision brand-new private SQLite database file for this user
  initUserDatabase(userId, normalizedEmail, finalDisplayName);

  // Insert user into master database
  db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, display_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, normalizedEmail, passwordHash, salt, finalDisplayName, now);

  // Issue 32-byte session token
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, now);

  return {
    user: {
      id: userId,
      email: normalizedEmail,
      display_name: finalDisplayName,
      created_at: now,
    },
    token,
  };
}

/**
 * Verifies password with stored scrypt hash and salt,
 * and creates a new active session token.
 */
export function loginLocalUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): { user: LocalUserRecord; token: string } {
  if (!email || !password) {
    throw new Error('Email and password are required');
  }

  const db = getMasterDatabase();
  const normalizedEmail = email.trim().toLowerCase();

  const user = db.prepare('SELECT id, email, password_hash, salt, display_name, created_at FROM users WHERE email = ?').get(normalizedEmail) as {
    id: string;
    email: string;
    password_hash: string;
    salt: string;
    display_name: string;
    created_at: string;
  } | undefined;

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isValid = verifyPassword(password, user.salt, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid email or password');
  }

  // Ensure user's data.db exists on disk
  const userDbPath = getUserDbPath(user.id);
  if (!fs.existsSync(userDbPath)) {
    initUserDatabase(user.id, user.email, user.display_name);
  }

  const token = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, user.id, expiresAt, now);

  return {
    user: {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      created_at: user.created_at,
    },
    token,
  };
}

/**
 * Validates a session token from the pa_session_token cookie.
 * Returns the authenticated user or null.
 */
export function validateLocalSession(token: string): LocalUserRecord | null {
  if (!token) return null;

  try {
    const db = getMasterDatabase();
    const row = db.prepare(`
      SELECT s.token, s.user_id, s.expires_at, u.id, u.email, u.display_name, u.created_at
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ?
    `).get(token) as {
      token: string;
      user_id: string;
      expires_at: string;
      id: string;
      email: string;
      display_name: string;
      created_at: string;
    } | undefined;

    if (!row) return null;

    if (new Date(row.expires_at) < new Date()) {
      try {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      } catch {
        // ignore
      }
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      created_at: row.created_at,
    };
  } catch {
    return null;
  }
}

/**
 * Deletes a session token on logout.
 */
export function logoutLocalUser(token: string): void {
  if (!token) return;
  try {
    const db = getMasterDatabase();
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch {
    // ignore
  }
}

/**
 * Returns a user profile from the master registry by userId.
 */
export function getLocalUserById(userId: string): LocalUserRecord | null {
  if (!userId) return null;
  try {
    const db = getMasterDatabase();
    const row = db.prepare('SELECT id, email, display_name, created_at FROM users WHERE id = ?').get(userId) as unknown as LocalUserRecord | undefined;
    return row || null;
  } catch {
    return null;
  }
}

/**
 * Returns all local user accounts registered in master.db.
 */
export function listLocalUsers(): LocalUserRecord[] {
  try {
    const db = getMasterDatabase();
    const rows = db.prepare('SELECT id, email, display_name, created_at FROM users ORDER BY created_at ASC').all() as unknown as LocalUserRecord[];
    return rows;
  } catch {
    return [];
  }
}

/**
 * Returns the default or first registered user ID, or fallback LOCAL_USER_ID.
 */
export function getDefaultOrFirstUserId(): string {
  try {
    const users = listLocalUsers();
    if (users.length > 0) {
      return users[0].id;
    }
  } catch {
    // ignore
  }
  return LOCAL_USER_ID;
}
