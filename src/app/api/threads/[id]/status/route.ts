import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
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
    const body = await request.json().catch(() => ({}));
    const { status } = body;

    const validStatuses = ['RESOLVED', 'ACTION_NEEDED', 'PURGED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of RESOLVED, ACTION_NEEDED, PURGED' },
        { status: 400 }
      );
    }

    // 1. Update conversation_threads
    const { data: thread, error: threadErr } = await supabase
      .from('conversation_threads')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (threadErr) {
      return NextResponse.json({ error: threadErr.message }, { status: 500 });
    }

    // 2. Synchronize associated action_items
    if (status === 'RESOLVED' || status === 'PURGED') {
      await supabase
        .from('action_items')
        .update({
          is_completed: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('thread_id', id)
        .eq('user_id', user.id);
    } else if (status === 'ACTION_NEEDED') {
      await supabase
        .from('action_items')
        .update({
          is_completed: false,
          resolved_at: null,
        })
        .eq('thread_id', id)
        .eq('user_id', user.id);

      await supabase
        .from('ai_purge_log')
        .update({
          restored: true,
          restored_at: new Date().toISOString(),
        })
        .eq('thread_id', id)
        .eq('user_id', user.id);
    }

    return NextResponse.json({ success: true, thread });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
