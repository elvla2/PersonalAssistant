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
    let isCompleted = body.is_completed;

    // If isCompleted not explicitly passed, toggle current value
    if (isCompleted === undefined) {
      const { data: current } = await supabase
        .from('action_items')
        .select('is_completed')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      isCompleted = current ? !current.is_completed : true;
    }

    const { data: updated, error } = await supabase
      .from('action_items')
      .update({
        is_completed: Boolean(isCompleted),
        resolved_at: isCompleted ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also update parent thread status if completed
    if (updated?.thread_id) {
      await supabase
        .from('conversation_threads')
        .update({
          status: isCompleted ? 'RESOLVED' : 'ACTION_NEEDED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', updated.thread_id)
        .eq('user_id', user.id);
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
