import makeWASocket, {
  useMultiFileAuthState as initMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import path from 'node:path';
import fs from 'node:fs';
import { createAdminClient } from '@/lib/supabase/admin';
import { isDesktopMode } from '@/lib/db/isDesktop';
import { getUserWhatsAppDir, getUserDir, getLocalDbDir } from '@/lib/db/localDb';
import { getDefaultOrFirstUserId, getLocalUserById } from '@/lib/db/localAuthEngine';
import { LOCAL_USER_ID } from '@/lib/db/localUser';

export interface WAMessage {
  id: string;
  sender: string;
  senderJid: string;
  isFromMe: boolean;
  text: string;
  timestamp: string;
  myReaction?: string;
  mentions?: string[];
  quotedParticipant?: string;
}

export interface ChatMeta {
  unreadCount: number;
  conversationTimestamp?: number;
  markedAsUnread?: boolean;
}

export interface WhatsAppConversation {
  jid: string;
  name: string;
  lastMessage: string;
  lastMessageTime: string;
  isOutgoingLast: boolean;
  isGroup: boolean;
  messages: WAMessage[];
}

export function getUserWhatsAppAuthDir(userId: string): string {
  if (isDesktopMode() || (typeof getLocalDbDir === 'function' && fs.existsSync(getUserDir(userId)))) {
    return getUserWhatsAppDir(userId);
  }
  return path.resolve(process.cwd(), 'data', 'users', userId, 'whatsapp_auth');
}

export function getUserWhatsAppCachePath(userId: string): string {
  if (isDesktopMode() || (typeof getLocalDbDir === 'function' && fs.existsSync(getUserDir(userId)))) {
    return path.join(getUserDir(userId), 'whatsapp_cache.json');
  }
  return path.resolve(process.cwd(), 'data', 'users', userId, 'whatsapp_cache.json');
}

function copyDirRecursiveSync(srcDir: string, destDir: string) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursiveSync(srcPath, destPath);
    } else {
      if (!fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

function extractMessageContent(msg: any): { text: string; mentions: string[]; quotedParticipant?: string } {
  if (!msg) return { text: '', mentions: [] };

  let m = msg;
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message;

  const contextInfo =
    m.extendedTextMessage?.contextInfo ||
    m.imageMessage?.contextInfo ||
    m.videoMessage?.contextInfo ||
    m.documentMessage?.contextInfo ||
    m.audioMessage?.contextInfo;
  const mentions: string[] = contextInfo?.mentionedJid || [];
  const quotedParticipant: string | undefined = contextInfo?.participant;

  if (m.conversation) {
    return { text: m.conversation, mentions, quotedParticipant };
  }
  if (m.extendedTextMessage?.text) {
    return { text: m.extendedTextMessage.text, mentions, quotedParticipant };
  }
  if (m.audioMessage) {
    return { text: m.audioMessage.ptt ? '[Voice Note]' : '[Audio Clip]', mentions, quotedParticipant };
  }
  if (m.ptvMessage) {
    return { text: '[Video Note]', mentions, quotedParticipant };
  }
  if (m.imageMessage) {
    const caption = m.imageMessage.caption ? `[Photo] ${m.imageMessage.caption}` : '[Photo]';
    return { text: caption, mentions, quotedParticipant };
  }
  if (m.videoMessage) {
    const caption = m.videoMessage.caption ? `[Video] ${m.videoMessage.caption}` : '[Video]';
    return { text: caption, mentions, quotedParticipant };
  }
  if (m.documentMessage) {
    const title = m.documentMessage.title || m.documentMessage.fileName || 'File';
    return { text: `[Document: ${title}]`, mentions, quotedParticipant };
  }
  if (m.stickerMessage) {
    return { text: '[Sticker]', mentions, quotedParticipant };
  }
  if (m.contactMessage || m.contactsArrayMessage) {
    return { text: '[Contact Card]', mentions, quotedParticipant };
  }
  if (m.locationMessage || m.liveLocationMessage) {
    return { text: '[Location]', mentions, quotedParticipant };
  }
  if (m.reactionMessage) {
    return { text: '', mentions: [] };
  }

  return { text: '', mentions, quotedParticipant };
}

export function getWhatsAppUserIdentity(service?: WhatsAppService): {
  myPhone: string;
  myLid: string;
  myName: string;
} {
  if (!service) {
    return { myPhone: '', myLid: '', myName: '' };
  }

  const myJid: string | null =
    typeof service.getMyJid === 'function' ? service.getMyJid() : null;

  let myPhone = myJid ? myJid.split('@')[0] : '';
  let myLid = typeof service.getMyLid === 'function' ? service.getMyLid() || '' : '';
  let myName = '';

  const sockUser =
    typeof service.getSockUser === 'function' ? service.getSockUser() : null;

  if (sockUser?.id) {
    myPhone = String(sockUser.id).split(':')[0].split('@')[0];
  }
  if (sockUser?.lid) {
    myLid = String(sockUser.lid).split(':')[0].split('@')[0];
  }
  if (sockUser?.name || sockUser?.notify) {
    myName = String(sockUser.name || sockUser.notify);
  }

  try {
    const authDir = service.getAuthDir();
    const credsPath = path.resolve(authDir, 'creds.json');
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      if (creds?.me?.id) {
        myPhone = String(creds.me.id).split(':')[0].split('@')[0] || myPhone;
      }
      if (creds?.me?.lid) {
        myLid = String(creds.me.lid).split(':')[0].split('@')[0] || myLid;
      }
      if (creds?.me?.name) {
        myName = String(creds.me.name) || myName;
      }
    }
  } catch {}

  // If primary user, retain known defaults if unpopulated
  if (!myPhone && service.isPrimaryUser()) {
    myPhone = '17867686267';
    myLid = myLid || '136790446968843';
    myName = myName || 'Vlad';
  }

  return { myPhone, myLid, myName };
}

export class WhatsAppService {
  private userId: string;
  private authDir: string;
  private cacheFile: string;
  private sock: any = null;
  private isConnectedState: boolean = false;
  private currentQrDataUrl: string | null = null;
  private myJid: string | null = null;
  private myLid: string | null = null;
  private messagesByChat: Map<string, WAMessage[]> = new Map();
  private contactsMap: Map<string, string> = new Map();
  private lidMap: Map<string, string> = new Map();
  private chatsMetadata: Map<string, ChatMeta> = new Map();
  private isStarting: boolean = false;

  constructor(userId?: string) {
    this.userId = userId || getDefaultOrFirstUserId();
    this.authDir = getUserWhatsAppAuthDir(this.userId);
    this.cacheFile = getUserWhatsAppCachePath(this.userId);

    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    this.maybeMigrateLegacyAuth();
    this.loadCache();

    // If credentials already exist on disk, start socket automatically in background
    if (fs.existsSync(path.join(this.authDir, 'creds.json'))) {
      this.ensureStarted().catch((err) => {
        console.warn(`[WhatsApp] Auto-start for user ${this.userId} note:`, err?.message);
      });
    }
  }

  public isPrimaryUser(): boolean {
    if (!isDesktopMode() && this.userId === '1cd72dfa-249c-4261-bb1b-cb2289e06e71') {
      return true;
    }
    return false;
  }

  private maybeMigrateLegacyAuth() {
    if (!this.isPrimaryUser()) {
      return;
    }
    const legacyAuthDir = path.resolve(process.cwd(), 'data', 'whatsapp_auth');
    const legacyCreds = path.join(legacyAuthDir, 'creds.json');
    const targetCreds = path.join(this.authDir, 'creds.json');

    if (fs.existsSync(legacyCreds) && !fs.existsSync(targetCreds)) {
      console.log(`[WhatsApp] Migrating legacy credentials for primary user (${this.userId}) to ${this.authDir}`);
      copyDirRecursiveSync(legacyAuthDir, this.authDir);
    }

    const legacyCache = path.resolve(process.cwd(), 'data', 'whatsapp_cache.json');
    if (fs.existsSync(legacyCache) && !fs.existsSync(this.cacheFile)) {
      try {
        console.log(`[WhatsApp] Migrating legacy cache for primary user (${this.userId}) to ${this.cacheFile}`);
        fs.copyFileSync(legacyCache, this.cacheFile);
      } catch (err) {
        console.warn('[WhatsApp] Could not copy legacy cache:', err);
      }
    }
  }

  public getUserId(): string {
    return this.userId;
  }

  public getAuthDir(): string {
    return this.authDir;
  }

  public isConnected(): boolean {
    return this.isConnectedState;
  }

  public async ensureStarted() {
    // Prevent starting during next build
    if (
      process.env.NEXT_PHASE === 'phase-production-build' ||
      process.env.npm_lifecycle_event === 'build' ||
      process.argv.some((arg) => arg.includes('build'))
    ) {
      return;
    }
    if (this.sock || this.isStarting) return;
    return this.init();
  }

  public loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const raw = JSON.parse(fs.readFileSync(this.cacheFile, 'utf-8'));
        if (raw.contacts) {
          for (const [jid, name] of Object.entries(raw.contacts)) {
            if (name) this.contactsMap.set(jid, name as string);
          }
        }
        if (raw.chats) {
          for (const [jid, msgs] of Object.entries(raw.chats)) {
            if (Array.isArray(msgs)) this.messagesByChat.set(jid, msgs as WAMessage[]);
          }
        }
        if (raw.chatsMetadata) {
          for (const [jid, meta] of Object.entries(raw.chatsMetadata)) {
            this.chatsMetadata.set(jid, meta as ChatMeta);
          }
        }
      }
    } catch (e) {
      console.error(`[WhatsApp] Error loading cache for user ${this.userId}:`, e);
    }
  }

  private saveCache() {
    try {
      const parentDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });

      const chatsObj: Record<string, WAMessage[]> = {};
      for (const [jid, msgs] of this.messagesByChat.entries()) {
        chatsObj[jid] = msgs.slice(-50);
      }
      const contactsObj = Object.fromEntries(this.contactsMap.entries());
      const metaObj = Object.fromEntries(this.chatsMetadata.entries());
      fs.writeFileSync(
        this.cacheFile,
        JSON.stringify({ chats: chatsObj, contacts: contactsObj, chatsMetadata: metaObj }, null, 2),
        'utf-8'
      );
    } catch (e) {
      console.error(`[WhatsApp] Error saving cache for user ${this.userId}:`, e);
    }
  }

  private async syncSessionToSupabase(status: string, qrCode?: string | null, phone?: string | null) {
    try {
      const admin = createAdminClient(this.userId);
      await admin.from('whatsapp_sessions').upsert({
        user_id: this.userId,
        status,
        qr_code: qrCode || null,
        phone_number: phone || null,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      // Non-blocking warning
    }
  }

  public async init() {
    if (this.sock || this.isStarting) return;
    this.isStarting = true;

    try {
      if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });

      const { state, saveCreds } = await initMultiFileAuthState(this.authDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        syncFullHistory: true,
      });

      this.sock.ev.on('creds.update', saveCreds);

      this.sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          try {
            this.currentQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
            await this.syncSessionToSupabase('qr_ready', this.currentQrDataUrl);
          } catch (err) {
            console.error(`[WhatsApp] QR generation error for user ${this.userId}:`, err);
          }
        }

        if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          this.isConnectedState = false;
          this.sock = null;
          this.isStarting = false;
          await this.syncSessionToSupabase('disconnected', null);
          if (shouldReconnect) {
            setTimeout(() => this.init(), 3500);
          }
        } else if (connection === 'open') {
          this.isConnectedState = true;
          this.currentQrDataUrl = null;
          let phone: string | null = null;
          if (this.sock?.user?.id) {
            this.myJid = this.sock.user.id.split(':')[0] + '@s.whatsapp.net';
            phone = this.sock.user.id.split(':')[0];
          }
          if (this.sock?.user?.lid) {
            this.myLid = this.sock.user.lid.split(':')[0].split('@')[0];
          }
          this.isStarting = false;
          await this.syncSessionToSupabase('connected', null, phone);
        }
      });

      this.sock.ev.on('messages.upsert', ({ messages }: any) => {
        for (const m of messages) this.processMessage(m);
        this.saveCache();
      });

      this.sock.ev.on('messages.reaction', (reactions: any) => {
        for (const r of reactions) {
          this.processReactionUpdate(r);
        }
        this.saveCache();
      });

      this.sock.ev.on('contacts.upsert', (contacts: any) => {
        for (const c of contacts) {
          const val = c.name || c.notify;
          if (c.id && val) this.contactsMap.set(c.id, val);
        }
        this.saveCache();
      });
    } catch (e: any) {
      console.error(`[WhatsApp] Init exception for user ${this.userId}:`, e.message);
      this.isStarting = false;
    }
  }

  public getMyJid(): string | null {
    return this.myJid;
  }

  public getMyLid(): string | null {
    return this.myLid;
  }

  public getSockUser(): any {
    return this.sock?.user || null;
  }

  public getUserIdentity(): { myPhone: string; myLid: string; myName: string } {
    return getWhatsAppUserIdentity(this);
  }

  private processReactionUpdate(r: any) {
    if (!r?.reaction) return;
    const targetKey = r.reaction.key;
    const targetJid = targetKey?.remoteJid || r.key?.remoteJid;
    if (!targetJid || !targetKey?.id) return;

    const emoji = (r.reaction.text || '').trim();
    const isFromMe = Boolean(r.key?.fromMe);

    const list = this.messagesByChat.get(targetJid);
    if (!list) return;

    const targetMsg = list.find((m) => m.id === targetKey.id);
    if (targetMsg) {
      if (isFromMe) {
        targetMsg.myReaction = emoji || undefined;
      }
    }
  }

  private processMessage(m: any) {
    if (!m.message) return;
    const jid = m.key.remoteJid;
    if (!jid || jid === 'status@broadcast') return;

    if (m.message?.reactionMessage) {
      const reaction = m.message.reactionMessage;
      const targetKey = reaction.key;
      const targetJid = jid || targetKey?.remoteJid;
      const emoji = (reaction.text || '').trim();
      const isFromMe = Boolean(m.key?.fromMe);

      if (targetJid && targetKey?.id) {
        const list = this.messagesByChat.get(targetJid);
        if (list) {
          const targetMsg = list.find((existing) => existing.id === targetKey.id);
          if (targetMsg && isFromMe) {
            targetMsg.myReaction = emoji || undefined;
          }
        }
      }
      return;
    }

    const isGroup = jid.endsWith('@g.us');
    const isFromMe = Boolean(m.key.fromMe);
    const { text, mentions, quotedParticipant } = extractMessageContent(m.message);
    if (!text) return;

    if (m.pushName && !isFromMe) {
      if (!isGroup) {
        this.contactsMap.set(jid, m.pushName);
      } else if (m.key.participant) {
        this.contactsMap.set(m.key.participant, m.pushName);
      }
    }
    const senderName = isFromMe
      ? 'Me'
      : isGroup
      ? m.pushName || (m.key.participant ? this.resolveContactName(m.key.participant) : this.resolveContactName(jid))
      : this.resolveContactName(jid);
    const timestamp = m.messageTimestamp ? new Date(Number(m.messageTimestamp) * 1000) : new Date();

    if (!this.messagesByChat.has(jid)) {
      this.messagesByChat.set(jid, []);
    }

    const list = this.messagesByChat.get(jid)!;
    if (!list.some((existing) => existing.id === m.key.id)) {
      list.push({
        id: m.key.id,
        sender: senderName,
        senderJid: isFromMe ? (this.myJid || 'me') : (m.key.participant || jid),
        isFromMe,
        text,
        timestamp: timestamp.toISOString(),
        mentions: mentions && mentions.length > 0 ? mentions : undefined,
        quotedParticipant: quotedParticipant || undefined,
      });
      if (list.length > 50) list.shift();
    }
  }

  public getStatus() {
    return {
      connected: this.isConnectedState,
      qrDataUrl: this.currentQrDataUrl,
      user: this.sock?.user
        ? {
            id: this.sock.user.id.split(':')[0],
            name: (this.sock.user as any).name || (this.sock.user as any).notify || 'WhatsApp User',
          }
        : null,
      cachedChatsCount: this.messagesByChat.size,
    };
  }

  public async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch {}
    }
    if (fs.existsSync(this.authDir)) fs.rmSync(this.authDir, { recursive: true, force: true });
    if (fs.existsSync(this.cacheFile)) fs.rmSync(this.cacheFile, { force: true });
    if (!fs.existsSync(this.authDir)) fs.mkdirSync(this.authDir, { recursive: true });

    this.messagesByChat.clear();
    this.contactsMap.clear();
    this.lidMap.clear();
    this.chatsMetadata.clear();
    this.isConnectedState = false;
    this.currentQrDataUrl = null;
    this.sock = null;
    await this.syncSessionToSupabase('disconnected', null);
    setTimeout(() => this.init(), 1000);
    return { success: true };
  }

  public resolveContactName(jid: string): string {
    if (!jid) return 'Unknown';
    if (jid === 'status@broadcast') return 'Status';

    // 1. If it's a LID, check reverse mapping to phone JID in WhatsApp auth directory
    if (jid.endsWith('@lid')) {
      const lidNum = jid.split('@')[0];
      let phone = this.lidMap.get(lidNum);
      if (!phone) {
        const reverseFile = path.resolve(this.authDir, `lid-mapping-${lidNum}_reverse.json`);
        if (fs.existsSync(reverseFile)) {
          try {
            phone = JSON.parse(fs.readFileSync(reverseFile, 'utf-8'));
            if (phone) this.lidMap.set(lidNum, phone);
          } catch {}
        }
      }
      if (phone) {
        const phoneJid = `${phone}@s.whatsapp.net`;
        const phoneContact = this.contactsMap.get(phoneJid);
        if (phoneContact && phoneContact !== phone) {
          return phoneContact;
        }
      }
    }

    // 2. Direct name from contactsMap
    const directName = this.contactsMap.get(jid);
    if (directName) return directName;

    return jid.split('@')[0];
  }

  public async sendMessage(to: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!this.sock || !this.isConnectedState) {
      return { success: false, error: 'WhatsApp is not connected.' };
    }
    try {
      let targetJid = to ? to.trim() : '';
      if (!targetJid || targetJid === 'self' || targetJid === 'me') {
        targetJid = this.myJid || (this.sock.user?.id ? this.sock.user.id.split(':')[0] + '@s.whatsapp.net' : '');
      }

      if (!targetJid.includes('@')) {
        this.loadCache();
        const searchName = targetJid.toLowerCase().trim();
        for (const [jid, name] of this.contactsMap.entries()) {
          if (name && (name.toLowerCase() === searchName || name.toLowerCase().startsWith(searchName))) {
            targetJid = jid;
            break;
          }
        }
      }

      if (!targetJid.includes('@')) {
        const clean = targetJid.replace(/\D/g, '');
        if (!clean) {
          return { success: false, error: `Invalid recipient phone number or contact: "${to}"` };
        }
        targetJid = `${clean}@s.whatsapp.net`;
      }

      const res = await this.sock.sendMessage(targetJid, { text });
      return { success: true, messageId: res?.key?.id };
    } catch (err: any) {
      console.error(`[WhatsApp] Send error for user ${this.userId}:`, err);
      return { success: false, error: err.message };
    }
  }

  public getConversations(lookbackHours = 168): WhatsAppConversation[] {
    if (!this.isConnectedState) {
      return [];
    }
    this.loadCache();
    const cutoff = new Date(Date.now() - lookbackHours * 3600 * 1000);
    const results: WhatsAppConversation[] = [];

    for (const [jid, msgs] of this.messagesByChat.entries()) {
      if (!msgs || msgs.length === 0) continue;

      msgs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const lastMsg = msgs[msgs.length - 1];
      const isGroup = jid.endsWith('@g.us');

      const lastDate = new Date(lastMsg.timestamp);
      if (isNaN(lastDate.getTime()) || lastDate < cutoff) continue;

      const contactName = this.resolveContactName(jid);
      const hasUserAnsweredWithReaction = Boolean(lastMsg.myReaction);
      const isOutgoingLast = Boolean(lastMsg.isFromMe) || hasUserAnsweredWithReaction;

      results.push({
        jid,
        name: contactName,
        lastMessage: lastMsg.text,
        lastMessageTime: lastMsg.timestamp,
        isOutgoingLast,
        isGroup,
        messages: msgs,
      });
    }

    return results;
  }
}

export class WhatsAppSessionManager {
  private instances: Map<string, WhatsAppService> = new Map();

  public getServiceForUser(userId: string): WhatsAppService {
    const effectiveUserId = userId || getDefaultOrFirstUserId();
    if (!this.instances.has(effectiveUserId)) {
      this.instances.set(effectiveUserId, new WhatsAppService(effectiveUserId));
    }
    return this.instances.get(effectiveUserId)!;
  }

  public async disconnectUser(userId: string) {
    const effectiveUserId = userId || getDefaultOrFirstUserId();
    const service = this.instances.get(effectiveUserId);
    if (service) {
      return await service.disconnect();
    }
    const transientService = new WhatsAppService(effectiveUserId);
    return await transientService.disconnect();
  }
}

const globalForWhatsApp = globalThis as unknown as {
  whatsappManager?: WhatsAppSessionManager;
  whatsappService?: WhatsAppService;
};

export const whatsAppManager =
  globalForWhatsApp.whatsappManager || new WhatsAppSessionManager();

if (process.env.NODE_ENV !== 'production') {
  globalForWhatsApp.whatsappManager = whatsAppManager;
}

export function getWhatsAppForUser(userId: string): WhatsAppService {
  return whatsAppManager.getServiceForUser(userId);
}

// Backward-compatible export
export const whatsapp = new Proxy({} as WhatsAppService, {
  get(_target, prop) {
    const defaultUserId = getDefaultOrFirstUserId();
    const service = whatsAppManager.getServiceForUser(defaultUserId);
    const value = (service as any)[prop];
    if (typeof value === 'function') {
      return value.bind(service);
    }
    return value;
  },
});
