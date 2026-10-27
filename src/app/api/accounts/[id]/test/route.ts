import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { testImapConnection } from '@/lib/imap';
import { testSmtpConnection } from '@/lib/smtp';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  // 1. Fetch account including stored password
  const { data: account, error: accError } = await supabase
    .from('accounts')
    .select('id, name, email, password, imap_server, imap_port, smtp_server, smtp_port, use_ssl')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (accError || !account) {
    return NextResponse.json(
      { success: false, message: 'Account not found or access denied.' },
      { status: 404 }
    );
  }

  if (!account.password || !account.imap_server) {
    return NextResponse.json(
      { success: false, message: 'Mailbox configuration is incomplete (missing password or IMAP server).' },
      { status: 400 }
    );
  }

  try {
    // 2. Test IMAP connection
    const imapStart = performance.now();
    const imapRes = await testImapConnection({
      email: account.email,
      password: account.password,
      imap_server: account.imap_server,
      imap_port: account.imap_port ? Number(account.imap_port) : 993,
      use_ssl: account.use_ssl !== false,
    });
    const imapLatencyMs = Math.round(performance.now() - imapStart);

    if (!imapRes.success) {
      return NextResponse.json({
        success: false,
        message: `IMAP Verification Failed: ${imapRes.message}`,
        imap: { success: false, latencyMs: imapLatencyMs, error: imapRes.message },
      });
    }

    // 3. Test SMTP connection if configured
    let smtpLatencyMs: number | undefined;
    if (account.smtp_server) {
      const smtpStart = performance.now();
      const smtpRes = await testSmtpConnection({
        smtp_server: account.smtp_server,
        smtp_port: account.smtp_port ? Number(account.smtp_port) : 587,
        email: account.email,
        password: account.password,
        use_ssl: account.use_ssl !== false,
      });
      smtpLatencyMs = Math.round(performance.now() - smtpStart);

      if (!smtpRes.success) {
        return NextResponse.json({
          success: false,
          message: `IMAP Succeeded (${imapLatencyMs}ms), but SMTP Failed: ${smtpRes.message}`,
          imap: { success: true, latencyMs: imapLatencyMs },
          smtp: { success: false, latencyMs: smtpLatencyMs, error: smtpRes.message },
        });
      }
    }

    const message = smtpLatencyMs !== undefined
      ? `Mailbox verified! IMAP (${imapLatencyMs}ms) & SMTP (${smtpLatencyMs}ms) operational.`
      : `Mailbox verified! IMAP (${imapLatencyMs}ms) operational.`;

    return NextResponse.json({
      success: true,
      message,
      imap: { success: true, latencyMs: imapLatencyMs },
      smtp: smtpLatencyMs !== undefined ? { success: true, latencyMs: smtpLatencyMs } : undefined,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Mailbox connection test failed.' },
      { status: 500 }
    );
  }
}
