import { SupabaseClient } from '@supabase/supabase-js';
import type { ExclusionRule } from '@/types';

export function isItemExcluded(
  rules: ExclusionRule[],
  channel: string,
  sender: string = '',
  subject: string = '',
  contactName: string = '',
  snippet: string = '',
  senderEmail: string = ''
): { excluded: boolean; matchedRule?: ExclusionRule } {
  if (!rules || rules.length === 0) return { excluded: false };

  const s = (sender || '').toLowerCase();
  const sub = (subject || '').toLowerCase();
  const c = (contactName || '').toLowerCase();
  const snip = (snippet || '').toLowerCase();
  const ch = (channel || '').toLowerCase();
  const se = (senderEmail || '').toLowerCase();

  for (const rule of rules) {
    if (!rule.is_active) continue;

    // Check channel: 'all', or exact channel match
    if (rule.channel && rule.channel !== 'all' && rule.channel.toLowerCase() !== ch) {
      continue;
    }

    const pat = (rule.pattern || '').trim().toLowerCase();
    if (!pat) continue;

    if (rule.rule_type === 'sender') {
      if (s.includes(pat) || c.includes(pat) || se.includes(pat)) {
        return { excluded: true, matchedRule: rule };
      }
    } else if (rule.rule_type === 'domain') {
      if (
        s.endsWith(`@${pat}`) || s.includes(`@${pat}`) || s.includes(pat) ||
        se.endsWith(`@${pat}`) || se.includes(`@${pat}`) || se.includes(pat)
      ) {
        return { excluded: true, matchedRule: rule };
      }
    } else if (rule.rule_type === 'subject') {
      if (sub.includes(pat)) {
        return { excluded: true, matchedRule: rule };
      }
    } else if (rule.rule_type === 'keyword') {
      if (s.includes(pat) || sub.includes(pat) || c.includes(pat) || snip.includes(pat) || se.includes(pat)) {
        return { excluded: true, matchedRule: rule };
      }
    }
  }

  return { excluded: false };
}

export async function fetchActiveRules(
  supabase: SupabaseClient,
  userId: string
): Promise<ExclusionRule[]> {
  const { data, error } = await supabase
    .from('exclusion_rules')
    .select('*')
    .or(`user_id.eq.${userId},is_system.eq.true`)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Rules] Error fetching active exclusion rules:', error.message);
    return [];
  }

  return (data as ExclusionRule[]) || [];
}

export async function purgeExcludedItemsForUser(
  supabase: SupabaseClient,
  userId: string,
  specificRule?: ExclusionRule
): Promise<number> {
  try {
    const rulesToTest = specificRule ? [specificRule] : await fetchActiveRules(supabase, userId);
    if (rulesToTest.length === 0) return 0;

    // 1. Fetch non-purged threads for this user
    const { data: threads, error: threadsErr } = await supabase
      .from('conversation_threads')
      .select('id, channel, subject_or_title, last_message_sender, sender_email, participants, snippet')
      .eq('user_id', userId)
      .neq('status', 'PURGED');

    if (threadsErr || !threads || threads.length === 0) {
      return 0;
    }

    const threadsToPurge: string[] = [];
    const purgeLogEntries: any[] = [];

    for (const thread of threads) {
      const sender = thread.last_message_sender || thread.participants || '';
      const senderEmail = thread.sender_email || '';
      const subject = thread.subject_or_title || '';
      const snippet = thread.snippet || '';

      const match = isItemExcluded(
        rulesToTest,
        thread.channel,
        sender,
        subject,
        thread.participants || '',
        snippet,
        senderEmail
      );

      if (match.excluded) {
        threadsToPurge.push(thread.id);
        purgeLogEntries.push({
          user_id: userId,
          channel: thread.channel,
          thread_id: thread.id,
          sender: senderEmail || sender,
          subject_or_snippet: subject || snippet,
          reason: `Excluded by rule: ${match.matchedRule?.pattern} (${match.matchedRule?.rule_type})`,
          confidence_score: 1.0,
          purged_at: new Date().toISOString(),
        });
      }
    }

    if (threadsToPurge.length > 0) {
      // Batch update threads, complete associated action items, and write audit log
      await Promise.all([
        supabase
          .from('conversation_threads')
          .update({ status: 'PURGED', updated_at: new Date().toISOString() })
          .in('id', threadsToPurge)
          .eq('user_id', userId),
        supabase
          .from('action_items')
          .update({ is_completed: true, resolved_at: new Date().toISOString() })
          .in('thread_id', threadsToPurge)
          .eq('user_id', userId),
        supabase.from('ai_purge_log').insert(purgeLogEntries),
      ]);
    }

    return threadsToPurge.length;
  } catch (err: any) {
    console.error('[Rules] Purge excluded items error:', err.message);
    return 0;
  }
}
