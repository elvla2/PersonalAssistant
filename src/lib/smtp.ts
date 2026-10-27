import nodemailer from 'nodemailer';
import type { Account } from '@/types';
import { resolveMailAuth, isOAuthCredential, type MailAuthResult } from '@/lib/oauth2';

function createSmtpTransporter(options: {
  host: string;
  port: number;
  email: string;
  password?: string;
  accessToken?: string;
  secure?: boolean;
}) {
  const isSecure = options.secure !== undefined ? options.secure : options.port === 465;
  const authConfig = options.accessToken
    ? {
        type: 'OAuth2' as const,
        user: options.email,
        accessToken: options.accessToken,
      }
    : {
        user: options.email,
        pass: options.password,
      };

  return nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: isSecure,
    requireTLS: !isSecure, // Automatically upgrade to STARTTLS on 587/25
    auth: authConfig,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 12000,
  });
}

export async function testSmtpConnection(config: {
  smtp_server?: string | null;
  smtp_port?: number | null;
  email: string;
  password?: string;
  use_ssl?: boolean;
}): Promise<{ success: boolean; message: string }> {
  if (!config.smtp_server || !config.smtp_port || !config.password) {
    return { success: false, message: 'Missing SMTP server, port, or password.' };
  }

  const port = Number(config.smtp_port) || 587;
  const initialSecure = port === 465;

  let authObj: MailAuthResult = { user: config.email, pass: config.password };
  try {
    authObj = await resolveMailAuth(config.email, config.password);
  } catch (authErr: any) {
    return { success: false, message: `SMTP Auth failed: ${authErr?.message || authErr}` };
  }

  try {
    const transporter = createSmtpTransporter({
      host: config.smtp_server,
      port,
      email: config.email,
      password: authObj.pass,
      accessToken: authObj.accessToken,
      secure: initialSecure,
    });

    await transporter.verify();
    return { success: true, message: 'SMTP connection verified successfully!' };
  } catch (err: any) {
    const msg = err?.message || '';
    // Auto-fallback if port protocol mismatch (e.g. STARTTLS vs implicit TLS)
    if (
      msg.includes('wrong version number') ||
      msg.includes('SSL routines') ||
      msg.includes('ECONNRESET') ||
      msg.includes('greeting never received')
    ) {
      try {
        const fallbackTransporter = createSmtpTransporter({
          host: config.smtp_server,
          port,
          email: config.email,
          password: authObj.pass,
          accessToken: authObj.accessToken,
          secure: !initialSecure,
        });
        await fallbackTransporter.verify();
        return { success: true, message: 'SMTP connection verified successfully!' };
      } catch (retryErr: any) {
        return { success: false, message: retryErr?.message || msg };
      }
    }
    return { success: false, message: msg || 'SMTP connection failed' };
  }
}

export async function sendEmailReply({
  account,
  to,
  subject,
  html,
  text,
  inReplyTo,
  references,
}: {
  account: Account;
  to: string;
  subject: string;
  html: string;
  text?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!account.smtp_server || !account.smtp_port || !account.password) {
    return {
      success: false,
      error: `Account ${account.email} has no SMTP configuration configured.`,
    };
  }

  const port = Number(account.smtp_port) || 587;
  const initialSecure = port === 465;

  let authObj: MailAuthResult = { user: account.email, pass: account.password };
  try {
    authObj = await resolveMailAuth(account.email, account.password);
  } catch (authErr: any) {
    return { success: false, error: `Authentication failed: ${authErr?.message || authErr}` };
  }

  // Append signature if present and not already contained in html
  let fullHtml = html;
  if (account.signature && !fullHtml.includes(account.signature.slice(0, 30))) {
    fullHtml += `<br><br><div class="email-signature">${account.signature}</div>`;
  }

  const mailOptions = {
    from: `"${account.name}" <${account.email}>`,
    to,
    subject: subject.startsWith('Re:') ? subject : `Re: ${subject}`,
    html: fullHtml,
    text: text || fullHtml.replace(/<[^>]+>/g, ' '),
    inReplyTo,
    references,
  };

  try {
    const transporter = createSmtpTransporter({
      host: account.smtp_server,
      port,
      email: account.email,
      password: authObj.pass,
      accessToken: authObj.accessToken,
      secure: initialSecure,
    });

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err: any) {
    const msg = err?.message || '';
    if (
      msg.includes('wrong version number') ||
      msg.includes('SSL routines') ||
      msg.includes('ECONNRESET') ||
      msg.includes('greeting never received')
    ) {
      try {
        const fallbackTransporter = createSmtpTransporter({
          host: account.smtp_server,
          port,
          email: account.email,
          password: authObj.pass,
          accessToken: authObj.accessToken,
          secure: !initialSecure,
        });
        const info = await fallbackTransporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
      } catch (retryErr: any) {
        return { success: false, error: retryErr?.message || msg };
      }
    }
    console.error(`[SMTP] Send error for ${account.email}:`, msg);
    return { success: false, error: msg || 'Failed to dispatch email via SMTP' };
  }
}

