import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('accounts')
    .select('id, user_id, name, account_type, email, imap_server, imap_port, smtp_server, smtp_port, signature, use_ssl, is_enabled, last_synced_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      name,
      account_type,
      email,
      imap_server,
      imap_port,
      smtp_server,
      smtp_port,
      password,
      signature,
      use_ssl,
      is_enabled,
    } = body;

    if (!name || !email || !imap_server || !password) {
      return NextResponse.json(
        { error: 'Name, email, IMAP server, and password are required.' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        name: name.trim(),
        account_type: account_type || 'custom_imap',
        email: email.trim().toLowerCase(),
        imap_server: imap_server.trim(),
        imap_port: imap_port ? Number(imap_port) : 993,
        smtp_server: smtp_server ? smtp_server.trim() : null,
        smtp_port: smtp_port ? Number(smtp_port) : 587,
        password,
        signature: signature || '',
        use_ssl: use_ssl !== false,
        is_enabled: is_enabled !== false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
