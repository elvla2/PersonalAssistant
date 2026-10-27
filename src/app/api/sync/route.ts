import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runFullSyncForUser } from '@/lib/syncEngine';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runFullSyncForUser(supabase, user.id);
  return NextResponse.json(result);
}
