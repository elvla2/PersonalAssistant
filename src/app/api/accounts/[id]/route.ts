import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.account_type !== undefined) updateData.account_type = body.account_type;
    if (body.email !== undefined) updateData.email = body.email.trim().toLowerCase();
    if (body.imap_server !== undefined) updateData.imap_server = body.imap_server.trim();
    if (body.imap_port !== undefined) updateData.imap_port = Number(body.imap_port);
    if (body.smtp_server !== undefined) updateData.smtp_server = body.smtp_server ? body.smtp_server.trim() : null;
    if (body.smtp_port !== undefined) updateData.smtp_port = body.smtp_port ? Number(body.smtp_port) : null;
    if (body.password) updateData.password = body.password;
    if (body.signature !== undefined) updateData.signature = body.signature;
    if (body.use_ssl !== undefined) updateData.use_ssl = Boolean(body.use_ssl);
    if (body.is_enabled !== undefined) updateData.is_enabled = Boolean(body.is_enabled);

    const { data, error } = await supabase
      .from('accounts')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
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

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
