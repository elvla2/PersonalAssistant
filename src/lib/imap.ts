import { ImapFlow, type ImapFlowOptions } from 'imapflow';
import { simpleParser } from 'mailparser';
import crypto from 'node:crypto';
import { resolveMailAuth, type MailAuthResult } from '@/lib/oauth2';

export interface EmailMessage {
  id: string;
  subject: string;
  sender: string;
  recipients: string;
  to?: string[];
  cc?: string[];
  isCcOnly?: boolean;
  date: Date;
  isFromMe: boolean;
  body: string;
  bodyHtml?: string;
  text?: string;
}

export interface EmailThread {
  thread_id: string;
  external_id: string;
  account_id: string;
  account_name: string;
  channel: 'email';
  subject: string;
  snippet: string;
  body_text: string;
  body_html: string;
  last_message_at: Date;
  last_message_sender: string;
  sender_email: string;
  is_outgoing_last: boolean;
  is_cc_only?: boolean;
  messages: EmailMessage[];
}

export function certificateDnsName(message: string): string | null {
  if (!message || !message.includes('altnames')) return null;
  const match = message.match(/DNS:(?:\*\.)?([^\s,]+)/);
  return match?.[1] || null;
}

export async function connectImap(options: ImapFlowOptions): Promise<ImapFlow> {
  const connectOnce = async (opts: ImapFlowOptions) => {
    const client = new ImapFlow(opts);
    client.on('error', (err: Error) => {
      console.warn('[IMAP] client warning:', err?.message || err);
    });
    try {
      await client.connect();
      return client;
    } catch (err) {
      try {
        client.close();
      } catch {}
      throw err;
    }
  };

  try {
    return await connectOnce(options);
  } catch (err: any) {
    const servername = certificateDnsName(err?.message || '');
    if (!servername || options.servername === servername) throw err;
    return await connectOnce({ ...options, servername });
  }
}

export function normalizeSubject(s: string): string {
  let prev = '';
  let cur = (s || '').trim();
  while (prev !== cur) {
    prev = cur;
    cur = cur.replace(/^(\s*(re|fwd?|fw|rv|res|enc)(\[\d+\])?:\s*)+/gi, '').trim();
    cur = cur.replace(/^\[(urgente|urgent|external|externo|jira|mipa-[^\]]+)\]\s*/gi, '').trim();
  }
  return cur.toLowerCase();
}

export function extractEmailAddress(sender: string): string {
  const trimmed = (sender || '').trim();
  const angleMatch = trimmed.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return trimmed;
  return trimmed;
}

export async function testImapConnection(config: {
  email: string;
  password: string;
  imap_server: string;
  imap_port: number;
  use_ssl?: boolean;
}): Promise<{ success: boolean; message: string }> {
  try {
    const authObj = await resolveMailAuth(config.email, config.password);
    const client = await connectImap({
      host: config.imap_server,
      port: config.imap_port,
      secure: config.use_ssl !== false,
      auth: {
        user: authObj.user,
        pass: authObj.pass,
        accessToken: authObj.accessToken,
      },
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });
    await client.logout();
    return { success: true, message: 'IMAP connection successful! Mailbox verified.' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'IMAP connection failed' };
  }
}

export async function fetchAccountThreads(account: {
  id: string;
  name: string;
  email: string;
  password?: string;
  imap_server: string;
  imap_port: number;
  use_ssl?: boolean;
  lookbackHours?: number;
}): Promise<EmailThread[]> {
  if (!account.password) return [];

  const threadsMap = new Map<string, EmailMessage[]>();
  const lookbackHours = account.lookbackHours || 168; // default 7 days
  const sinceDate = new Date(Date.now() - lookbackHours * 3600 * 1000);

  let client: ImapFlow | null = null;
  const attempts = 2;

  let authObj: MailAuthResult = { user: account.email, pass: account.password };
  try {
    authObj = await resolveMailAuth(account.email, account.password);
  } catch (authErr: any) {
    console.error(`[IMAP] Failed to resolve auth credentials for ${account.email}:`, authErr.message);
    return [];
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      client = await connectImap({
        host: account.imap_server,
        port: account.imap_port,
        secure: account.use_ssl !== false,
        auth: {
          user: authObj.user,
          pass: authObj.pass,
          accessToken: authObj.accessToken,
        },
        logger: false,
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 30000,
      });
      break;
    } catch (err: any) {
      if (attempt >= attempts) {
        console.error(`[IMAP] Could not connect to ${account.email}:`, err.message);
        return [];
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  if (!client || !client.usable) {
    return [];
  }

  try {
    const mailboxes = await client.list();
    const sentBox = mailboxes.find(
      (m) => m.specialUse === '\\Sent' || /^(sent(\s*items)?|elementos\s*enviados|enviados)$/i.test(m.path)
    );

    const boxesToScan: Array<{ path: string; isSent: boolean }> = [
      { path: 'INBOX', isSent: false },
    ];
    if (sentBox && sentBox.path !== 'INBOX') {
      boxesToScan.push({ path: sentBox.path, isSent: true });
    }

    for (const box of boxesToScan) {
      try {
        const lock = await client.getMailboxLock(box.path);
        try {
          const totalMessages =
            client.mailbox && typeof client.mailbox === 'object' && 'exists' in client.mailbox
              ? (client.mailbox as any).exists
              : 0;

          if (totalMessages === 0) continue;

          // Fetch the most recent 75 messages per mailbox
          const startSeq = Math.max(1, totalMessages - 75);
          const messages = client.fetch(
            `${startSeq}:*`,
            {
              envelope: true,
              source: { maxLength: 30000 },
              uid: true,
            }
          );

          for await (const msg of messages) {
            const envelope = msg.envelope;
            if (!envelope) continue;

            const date = envelope.date instanceof Date ? envelope.date : new Date(envelope.date || Date.now());
            if (date.getTime() < sinceDate.getTime()) {
              continue;
            }

            const subject = envelope.subject || 'No Subject';
            const senderAddress = envelope.from?.[0]?.address || '';
            const senderName = envelope.from?.[0]?.name;
            const sender = senderName ? `${senderName} <${senderAddress}>` : senderAddress || 'Unknown';
            const recipients = envelope.to?.map((t) => t.address).join(', ') || '';

            const isFromMe = box.isSent || senderAddress.toLowerCase() === account.email.toLowerCase();
            const toAddresses = (envelope.to || []).map((t) => (t.address || '').toLowerCase()).filter(Boolean);
            const ccAddresses = (envelope.cc || []).map((c) => (c.address || '').toLowerCase()).filter(Boolean);
            const myEmail = account.email.toLowerCase();
            const isTo = toAddresses.some((addr) => addr === myEmail);
            const isCc = ccAddresses.some((addr) => addr === myEmail);
            const isCcOnly = isCc && !isTo;

            let bodyText = '';
            let bodyHtml = '';
            if (msg.source) {
              try {
                const parsed = await simpleParser(msg.source);
                bodyText = (parsed.text || '').slice(0, 3000);
                bodyHtml = (parsed.html || '').slice(0, 5000);
                if (!bodyText && bodyHtml) {
                  bodyText = bodyHtml.replace(/<[^>]+>/g, ' ').slice(0, 3000);
                }
              } catch {
                bodyText = '[Body parse error]';
              }
            }

            const cleanSubj = normalizeSubject(subject);
            const key = cleanSubj || `uid_${msg.uid}`;

            if (!threadsMap.has(key)) {
              threadsMap.set(key, []);
            }

            threadsMap.get(key)!.push({
              id: `${box.path}_${msg.uid}`,
              subject,
              sender,
              recipients,
              to: toAddresses,
              cc: ccAddresses,
              isCcOnly,
              date,
              isFromMe,
              body: bodyText,
              bodyHtml,
            });
          }
        } finally {
          lock.release();
        }
      } catch (err: any) {
        console.error(`[IMAP] Could not scan mailbox ${box.path}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error(`[IMAP] Error fetching ${account.email}:`, err.message);
  } finally {
    if (client.usable) {
      await client.logout().catch(() => {});
    } else {
      try {
        client.close();
      } catch {}
    }
  }

  const results: EmailThread[] = [];
  for (const [key, msgs] of threadsMap.entries()) {
    msgs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const lastMsg = msgs[msgs.length - 1];
    const externalId = `imap_${account.id}_${crypto.createHash('sha256').update(key).digest('hex').slice(0, 20)}`;

    results.push({
      thread_id: externalId,
      external_id: externalId,
      account_id: account.id,
      account_name: account.name,
      channel: 'email',
      subject: lastMsg.subject,
      snippet: lastMsg.body.slice(0, 250),
      body_text: lastMsg.body,
      body_html: lastMsg.bodyHtml || '',
      last_message_at: lastMsg.date,
      last_message_sender: lastMsg.sender,
      sender_email: extractEmailAddress(lastMsg.sender),
      is_outgoing_last: lastMsg.isFromMe,
      is_cc_only: lastMsg.isCcOnly ?? false,
      messages: msgs,
    });
  }

  return results;
}
