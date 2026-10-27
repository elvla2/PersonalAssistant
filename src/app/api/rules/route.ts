import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { purgeExcludedItemsForUser } from '@/lib/rules';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('exclusion_rules')
    .select('*')
    .or(`user_id.eq.${user.id},is_system.eq.true`)
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: false });

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
    const { channel, rule_type, pattern, reason, thread_id } = body;

    if (!pattern || !pattern.trim()) {
      return NextResponse.json({ error: 'Rule pattern cannot be empty.' }, { status: 400 });
    }

    const { data: newRule, error } = await supabase
      .from('exclusion_rules')
      .insert({
        user_id: user.id,
        channel: channel || 'all',
        rule_type: rule_type || 'sender',
        pattern: pattern.trim(),
        reason: reason ? reason.trim() : null,
        is_system: false,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If explicit thread_id was provided, guarantee immediate purge of that thread
    if (thread_id) {
      await Promise.all([
        supabase
          .from('conversation_threads')
          .update({ status: 'PURGED', updated_at: new Date().toISOString() })
          .eq('id', thread_id)
          .eq('user_id', user.id),
        supabase
          .from('action_items')
          .update({ is_completed: true, resolved_at: new Date().toISOString() })
          .eq('thread_id', thread_id)
          .eq('user_id', user.id),
        supabase.from('ai_purge_log').insert({
          user_id: user.id,
          channel: channel || 'all',
          thread_id,
          sender: pattern.trim(),
          subject_or_snippet: reason || 'Manual exclusion from thread',
          reason: `Excluded by rule: ${pattern.trim()} (${rule_type || 'sender'})`,
          confidence_score: 1.0,
          purged_at: new Date().toISOString(),
        }),
      ]);
    }

    // Immediately purge all other matching items for this user
    const purgedCount = await purgeExcludedItemsForUser(supabase, user.id, newRule);

    return NextResponse.json({
      rule: newRule,
      purgedCount: purgedCount + (thread_id ? 1 : 0),
      success: true,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing rule ID' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('exclusion_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing rule ID' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('exclusion_rules')
      .update({ is_active: Boolean(is_active) })
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
