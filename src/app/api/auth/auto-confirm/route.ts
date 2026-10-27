import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 });
    }

    const targetUser = data.users.find(
      (u: any) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (targetUser && !targetUser.email_confirmed_at) {
      const { error: updateErr } = await admin.auth.admin.updateUserById(targetUser.id, {
        email_confirm: true,
      });
      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
      return NextResponse.json({ confirmed: true, message: 'Email confirmed automatically' });
    }

    return NextResponse.json({ confirmed: Boolean(targetUser?.email_confirmed_at), message: 'Account ready' });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
