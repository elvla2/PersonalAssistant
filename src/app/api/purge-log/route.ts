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
    .from('ai_purge_log')
    .select('*')
    .eq('user_id', user.id)
    .order('purged_at', { ascending: false })
    .limit(100);

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
    const { log_id, thread_id } = body;

    if (!log_id || !thread_id) {
      return NextResponse.json({ error: 'Missing log_id or thread_id' }, { status: 400 });
    }

    // 1. Mark purge log item as restored
    await supabase
      .from('ai_purge_log')
      .update({ restored: true, restored_at: new Date().toISOString() })
      .eq('id', log_id)
      .eq('user_id', user.id);

    // 2. Restore conversation thread status to ACTION_NEEDED
    const { data: thread } = await supabase
      .from('conversation_threads')
      .update({ status: 'ACTION_NEEDED', updated_at: new Date().toISOString() })
      .eq('id', thread_id)
      .eq('user_id', user.id)
      .select()
      .single();

    // 3. Re-activate or create action item
    if (thread) {
      await supabase.from('action_items').upsert(
        {
          user_id: user.id,
          thread_id: thread.id,
          account_id: thread.account_id,
          channel: thread.channel,
          type: 'REPLY_NEEDED',
          priority: 'P2_MEDIUM',
          title: thread.subject_or_title || 'Restored conversation',
          summary: thread.snippet || 'Restored by user from AI Auto-Purge log.',
          deadline_text: 'Restored to Inboxes',
          is_completed: false,
          detected_at: new Date().toISOString(),
          resolved_at: null,
        },
        { onConflict: 'user_id,thread_id' }
      );
    }

    return NextResponse.json({ success: true, message: 'Item restored to active inboxes!' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
