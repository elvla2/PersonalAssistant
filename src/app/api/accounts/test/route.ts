import { NextResponse } from 'next/server';
import { testImapConnection } from '@/lib/imap';
import { testSmtpConnection } from '@/lib/smtp';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      email,
      password,
      imap_server,
      imap_port,
      smtp_server,
      smtp_port,
      use_ssl,
    } = body;

    if (!email || !password || !imap_server) {
      return NextResponse.json(
        { success: false, message: 'Email, password, and IMAP server are required.' },
        { status: 400 }
      );
    }

    // 1. Test IMAP
    const imapRes = await testImapConnection({
      email,
      password,
      imap_server,
      imap_port: imap_port ? Number(imap_port) : 993,
      use_ssl: use_ssl !== false,
    });

    if (!imapRes.success) {
      return NextResponse.json({
        success: false,
        message: `IMAP Verification Failed: ${imapRes.message}`,
      });
    }

    // 2. Test SMTP if provided
    if (smtp_server) {
      const smtpRes = await testSmtpConnection({
        smtp_server,
        smtp_port: smtp_port ? Number(smtp_port) : 587,
        email,
        password,
        use_ssl: use_ssl !== false,
      });

      if (!smtpRes.success) {
        return NextResponse.json({
          success: false,
          message: `IMAP Succeeded, but SMTP Failed: ${smtpRes.message}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Connection successful! IMAP and SMTP configurations verified.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
