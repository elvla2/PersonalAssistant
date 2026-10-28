import { SupabaseClient } from '@supabase/supabase-js';
import type { Account, UserSetting, ExclusionRule } from '@/types';
import { fetchAccountThreads } from '@/lib/imap';
import { whatsAppManager, getWhatsAppUserIdentity } from '@/lib/whatsapp';
import { analyzeThread } from '@/lib/triage';
import { fetchActiveRules, isItemExcluded } from '@/lib/rules';
import { generateThreadId } from '@/lib/threadUtils';

export { generateThreadId } from '@/lib/threadUtils';

export interface SyncResult {
  success: boolean;
  emailsProcessed: number;
  whatsappProcessed: number;
  actionItemsDetected: number;
  purgedCount: number;
  error?: string;
  alreadyRunning?: boolean;
  message?: string;
}

async function safeSaveActionItem(
  supabase: SupabaseClient,
  item: {
    user_id: string;
    thread_id: string;
    account_id?: string | null;
    channel: string;
    type: string;
    priority: string;
    title: string;
    summary?: string;
    deadline_text?: string;
    suggested_reply?: string | null;
    suggested_replies?: string[];
    is_completed?: boolean;
    detected_at?: string;
    last_message_at?: string;
  }
) {
  try {
    const { data: existing } = await supabase
      .from('action_items')
      .select('id, is_completed, resolved_at, detected_at')
      .eq('user_id', item.user_id)
      .eq('thread_id', item.thread_id)
      .maybeSingle();

    if (existing?.id) {
      let shouldReopen = false;

      // If already completed/resolved, preserve completed status unless a newer message arrived
      if (existing.is_completed) {
        if (item.is_completed) {
          return;
        }
        const resolvedTime = existing.resolved_at ? new Date(existing.resolved_at).getTime() : 0;
        const msgTime = item.last_message_at ? new Date(item.last_message_at).getTime() : 0;

        // If no newer message arrived after resolution, keep it completed
        if (msgTime <= resolvedTime || !msgTime) {
          return;
        }

        // A new incoming message arrived from the contact AFTER previous resolution: Reopen item!
        shouldReopen = true;
      }

      const { detected_at, is_completed, last_message_at, ...updateFields } = item;
      const payload: any = { ...updateFields };
      if (shouldReopen) {
        payload.is_completed = false;
        payload.resolved_at = null;
        payload.detected_at = new Date().toISOString();
      } else if (item.is_completed) {
        payload.is_completed = true;
        payload.resolved_at = new Date().toISOString();
      }

      const { error: updateErr } = await supabase
        .from('action_items')
        .update(payload)
        .eq('id', existing.id);
      if (updateErr) {
        console.error('[SyncEngine] Update error on action item:', updateErr.message);
      }
    } else {
      const { last_message_at, ...insertFields } = item;
      const { error: insertErr } = await supabase
        .from('action_items')
        .insert(insertFields);
      if (insertErr) {
        console.error('[SyncEngine] Insert error on action item:', insertErr.message);
      }
    }
  } catch (e: any) {
    console.error('[SyncEngine] Error saving action item:', e.message);
  }
}

async function safeSavePurgeLog(
  supabase: SupabaseClient,
  log: {
    user_id: string;
    channel: string;
    thread_id: string;
    sender?: string | null;
    subject_or_snippet?: string | null;
    reason?: string | null;
    confidence_score?: number;
    purged_at?: string;
  }
) {
  try {
    const { data: existing } = await supabase
      .from('ai_purge_log')
      .select('id')
      .eq('user_id', log.user_id)
      .eq('thread_id', log.thread_id)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from('ai_purge_log').update(log).eq('id', existing.id);
    } else {
      await supabase.from('ai_purge_log').insert(log);
    }
  } catch (e: any) {
    console.error('[SyncEngine] Error saving purge log:', e.message);
  }
}

const activeSyncUsers = new Set<string>();

export async function runFullSyncForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<SyncResult> {
  if (activeSyncUsers.has(userId)) {
    return {
      success: true,
      alreadyRunning: true,
      message: 'Sync already in progress. Skipping duplicate execution.',
      emailsProcessed: 0,
      whatsappProcessed: 0,
      actionItemsDetected: 0,
      purgedCount: 0,
    };
  }
  activeSyncUsers.add(userId);

  let emailsProcessed = 0;
  let whatsappProcessed = 0;
  let actionItemsDetected = 0;
  let purgedCount = 0;

  try {
    // 1. Fetch user settings
    const { data: settingsData } = await supabase
      .from('user_settings')
      .select('*')
      .eq('id', userId)
      .single();

    const userSettings: UserSetting = settingsData || {
      id: userId,
      llm_model: 'ollama/llama3.2',
      gemini_api_key: process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || null,
      display_name: 'You',
      user_aliases: [],
      primary_email: null,
      digest_hour: 8,
      digest_minute: 0,
      auto_purge_enabled: true,
    };

    const isOllamaSelected = !userSettings.llm_model || userSettings.llm_model.toLowerCase().includes('ollama') || userSettings.llm_model.toLowerCase().includes('beam');
    const effectiveApiKey = isOllamaSelected
      ? (userSettings.gemini_api_key || process.env.OLLAMA_API_KEY || null)
      : (userSettings.gemini_api_key || process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || null);

    // 2. Fetch enabled email accounts
    const { data: accountsData } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_enabled', true);

    const accounts: Account[] = accountsData || [];

    // 3. Fetch active exclusion rules
    const rules = await fetchActiveRules(supabase, userId);

    const userWhatsApp = whatsAppManager.getServiceForUser(userId);
    const waIdentity = userWhatsApp.isConnected()
      ? userWhatsApp.getUserIdentity()
      : { myPhone: '', myLid: '', myName: userSettings.display_name || '' };

    const triageContext = {
      displayName: userSettings.display_name,
      userAliases: userSettings.user_aliases || [],
      userEmails: accounts.map((a) => a.email),
      geminiApiKey: effectiveApiKey,
      llmModel: userSettings.llm_model || 'ollama/llama3.2',
      myPhone: waIdentity.myPhone,
      myLid: waIdentity.myLid,
    };

    // 4. Process email accounts
    for (const account of accounts) {
      try {
        const threads = await fetchAccountThreads({
          id: account.id,
          name: account.name,
          email: account.email,
          password: account.password,
          imap_server: account.imap_server,
          imap_port: account.imap_port,
          use_ssl: account.use_ssl,
        });

        emailsProcessed += threads.length;

        for (const thread of threads) {
          const threadId = generateThreadId(userId, 'email', thread.external_id);

          // Check manual / system exclusion rules
          const ruleCheck = isItemExcluded(
            rules,
            'email',
            thread.last_message_sender,
            thread.subject,
            '',
            thread.snippet,
            thread.sender_email
          );

          if (ruleCheck.excluded) {
            purgedCount++;
            await supabase.from('conversation_threads').upsert({
              id: threadId,
              user_id: userId,
              account_id: account.id,
              channel: 'email',
              external_id: thread.external_id,
              subject_or_title: thread.subject,
              participants: thread.sender_email,
              sender_email: thread.sender_email,
              snippet: thread.snippet,
              body_text: thread.body_text,
              body_html: thread.body_html,
              last_message_at: thread.last_message_at.toISOString(),
              last_message_sender: thread.last_message_sender,
              is_outgoing_last: thread.is_outgoing_last,
              status: 'PURGED',
              updated_at: new Date().toISOString(),
            });

            await safeSavePurgeLog(supabase, {
              user_id: userId,
              channel: 'email',
              thread_id: threadId,
              sender: thread.last_message_sender,
              subject_or_snippet: thread.subject,
              reason: `Excluded by rule: ${ruleCheck.matchedRule?.pattern}`,
              confidence_score: 1.0,
              purged_at: new Date().toISOString(),
            });

            continue;
          }

          // 1. Check if thread already exists in database
          const { data: existingThread } = await supabase
            .from('conversation_threads')
            .select('id, status, last_message_at')
            .eq('id', threadId)
            .eq('user_id', userId)
            .maybeSingle();

          const currentMsgTime = new Date(thread.last_message_at).getTime();
          const prevMsgTime = existingThread?.last_message_at
            ? new Date(existingThread.last_message_at).getTime()
            : 0;

          // If thread was already processed and NO new message has arrived, skip calling expensive LLMs!
          if (existingThread && currentMsgTime <= prevMsgTime) {
            continue;
          }

          // Run AI / heuristic triage
          const triage = await analyzeThread(
            {
              subject: thread.subject,
              channel: 'email',
              account_name: account.name,
              last_message_sender: thread.last_message_sender,
              is_outgoing_last: thread.is_outgoing_last,
              is_cc_only: (thread as any).is_cc_only,
              external_id: thread.external_id,
              snippet: thread.snippet,
              body_text: thread.body_text,
              messages: thread.messages.map((m) => ({
                sender: m.sender,
                text: m.body,
                isFromMe: m.isFromMe,
              })),
            },
            triageContext
          );

          if (triage.has_action_item && triage.priority !== 'NONE') {
            let targetStatus: 'ACTION_NEEDED' | 'RESOLVED' | 'PURGED' = thread.is_outgoing_last ? 'RESOLVED' : 'ACTION_NEEDED';

            if (existingThread && !thread.is_outgoing_last) {
              if (existingThread.status === 'PURGED') {
                targetStatus = 'PURGED';
              } else if (existingThread.status === 'RESOLVED') {
                const lastMsgTime = new Date(thread.last_message_at).getTime();
                const prevMsgTime = existingThread.last_message_at
                  ? new Date(existingThread.last_message_at).getTime()
                  : 0;
                if (lastMsgTime <= prevMsgTime) {
                  targetStatus = 'RESOLVED';
                }
              }
            }

            if (targetStatus === 'ACTION_NEEDED') {
              actionItemsDetected++;
            }

            // Upsert conversation thread
            await supabase.from('conversation_threads').upsert({
              id: threadId,
              user_id: userId,
              account_id: account.id,
              channel: 'email',
              external_id: thread.external_id,
              subject_or_title: thread.subject,
              participants: thread.sender_email,
              sender_email: thread.sender_email,
              snippet: thread.snippet,
              body_text: thread.body_text,
              body_html: thread.body_html,
              last_message_at: thread.last_message_at.toISOString(),
              last_message_sender: thread.last_message_sender,
              is_outgoing_last: thread.is_outgoing_last,
              status: targetStatus,
              updated_at: new Date().toISOString(),
            });

            // Save action item safely
            await safeSaveActionItem(supabase, {
              user_id: userId,
              thread_id: threadId,
              account_id: account.id,
              channel: 'email',
              type: triage.action_type,
              priority: triage.priority,
              title: triage.title || thread.subject,
              summary: triage.summary || thread.snippet,
              deadline_text: triage.deadline_text || 'Reply needed',
              suggested_reply: triage.suggested_reply || null,
              suggested_replies: triage.suggested_replies || [],
              is_completed: targetStatus === 'RESOLVED' || targetStatus === 'PURGED',
              detected_at: new Date().toISOString(),
              last_message_at: thread.last_message_at.toISOString(),
            });
          } else {
            // Non-actionable, answered, or purged
            purgedCount++;

            // If the user replied or conversation closed, auto-resolve pending action items
            await supabase
              .from('action_items')
              .update({
                is_completed: true,
                resolved_at: new Date().toISOString(),
              })
              .eq('user_id', userId)
              .eq('thread_id', threadId)
              .eq('is_completed', false);

            let elseStatus: 'RESOLVED' | 'PURGED' = thread.is_outgoing_last ? 'RESOLVED' : 'PURGED';
            if (thread.is_outgoing_last) {
              elseStatus = 'RESOLVED';
            } else if (existingThread?.status === 'PURGED') {
              elseStatus = 'PURGED';
            } else if (existingThread?.status === 'RESOLVED') {
              elseStatus = 'RESOLVED';
            }

            await supabase.from('conversation_threads').upsert({
              id: threadId,
              user_id: userId,
              account_id: account.id,
              channel: 'email',
              external_id: thread.external_id,
              subject_or_title: thread.subject,
              participants: thread.sender_email,
              sender_email: thread.sender_email,
              snippet: thread.snippet,
              body_text: thread.body_text,
              body_html: thread.body_html,
              last_message_at: thread.last_message_at.toISOString(),
              last_message_sender: thread.last_message_sender,
              is_outgoing_last: thread.is_outgoing_last,
              status: elseStatus,
              updated_at: new Date().toISOString(),
            });

            if (triage.purge_reason) {
              await safeSavePurgeLog(supabase, {
                user_id: userId,
                channel: 'email',
                thread_id: threadId,
                sender: thread.last_message_sender,
                subject_or_snippet: thread.subject,
                reason: triage.purge_reason,
                confidence_score: 1.0,
                purged_at: new Date().toISOString(),
              });
            }
          }
        }

        // Update account last_synced_at
        await supabase
          .from('accounts')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', account.id);
      } catch (accErr: any) {
        console.error(`[SyncEngine] Account ${account.email} error:`, accErr.message);
      }
    }

    // 5. Process WhatsApp conversations
    try {
      if (!userWhatsApp.isConnected()) {
        whatsappProcessed = 0;
      } else {
        const waConversations = userWhatsApp.getConversations(168);
        whatsappProcessed += waConversations.length;

        for (const conv of waConversations) {
          const threadId = generateThreadId(userId, 'whatsapp', conv.jid);
          const threadSubject = conv.isGroup ? conv.name : `WhatsApp with ${conv.name}`;
          const lastMsgObj = conv.messages[conv.messages.length - 1];
          const snippetText = conv.isGroup && lastMsgObj?.sender && !lastMsgObj?.isFromMe && lastMsgObj?.sender !== conv.name
            ? `${lastMsgObj.sender}: ${conv.lastMessage}`
            : conv.lastMessage;

          // Check exclusion rules
        const ruleCheck = isItemExcluded(
          rules,
          'whatsapp',
          conv.name,
          conv.lastMessage,
          conv.name,
          conv.lastMessage
        );

        if (ruleCheck.excluded) {
          purgedCount++;

          // Auto-resolve any pending action items if excluded by rule
          await supabase
            .from('action_items')
            .update({
              is_completed: true,
              resolved_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('thread_id', threadId)
            .eq('is_completed', false);

          await supabase.from('conversation_threads').upsert({
            id: threadId,
            user_id: userId,
            channel: 'whatsapp',
            external_id: conv.jid,
            subject_or_title: threadSubject,
            participants: conv.name,
            snippet: snippetText,
            body_text: JSON.stringify(conv.messages),
            last_message_at: conv.lastMessageTime,
            last_message_sender: conv.name,
            is_outgoing_last: conv.isOutgoingLast,
            status: 'PURGED',
            updated_at: new Date().toISOString(),
          });

          await safeSavePurgeLog(supabase, {
            user_id: userId,
            channel: 'whatsapp',
            thread_id: threadId,
            sender: conv.name,
            subject_or_snippet: conv.lastMessage,
            reason: `Excluded by rule: ${ruleCheck.matchedRule?.pattern}`,
            confidence_score: 1.0,
            purged_at: new Date().toISOString(),
          });

          continue;
        }

        // 1. Check if thread already exists in database
        const { data: existingThread } = await supabase
          .from('conversation_threads')
          .select('id, status, last_message_at')
          .eq('id', threadId)
          .eq('user_id', userId)
          .maybeSingle();

        const currentMsgTime = new Date(conv.lastMessageTime).getTime();
        const prevMsgTime = existingThread?.last_message_at
          ? new Date(existingThread.last_message_at).getTime()
          : 0;

        // If thread was already processed and NO new message has arrived, skip calling expensive LLMs!
        if (existingThread && currentMsgTime <= prevMsgTime) {
          continue;
        }

        const triage = await analyzeThread(
          {
            subject: threadSubject,
            channel: 'whatsapp',
            contact_name: conv.name,
            last_message_sender: conv.name,
            is_outgoing_last: conv.isOutgoingLast,
            isGroup: conv.isGroup,
            external_id: conv.jid,
            messages: conv.messages.map((m) => ({
              sender: m.sender,
              text: m.text,
              isFromMe: m.isFromMe,
              myReaction: m.myReaction,
              mentions: m.mentions,
              quotedParticipant: m.quotedParticipant,
            })),
          },
          triageContext
        );

        if (triage.has_action_item && triage.priority !== 'NONE') {
          let targetStatus: 'ACTION_NEEDED' | 'RESOLVED' | 'PURGED' = conv.isOutgoingLast ? 'RESOLVED' : 'ACTION_NEEDED';

          if (existingThread && !conv.isOutgoingLast) {
            if (existingThread.status === 'PURGED') {
              targetStatus = 'PURGED';
            } else if (existingThread.status === 'RESOLVED') {
              const lastMsgTime = new Date(conv.lastMessageTime).getTime();
              const prevMsgTime = existingThread.last_message_at
                ? new Date(existingThread.last_message_at).getTime()
                : 0;
              if (lastMsgTime <= prevMsgTime) {
                targetStatus = 'RESOLVED';
              }
            }
          }

          if (targetStatus === 'ACTION_NEEDED') {
            actionItemsDetected++;
          }

          await supabase.from('conversation_threads').upsert({
            id: threadId,
            user_id: userId,
            channel: 'whatsapp',
            external_id: conv.jid,
            subject_or_title: threadSubject,
            participants: conv.name,
            snippet: snippetText,
            body_text: JSON.stringify(conv.messages),
            last_message_at: conv.lastMessageTime,
            last_message_sender: conv.name,
            is_outgoing_last: conv.isOutgoingLast,
            status: targetStatus,
            updated_at: new Date().toISOString(),
          });

          await safeSaveActionItem(supabase, {
            user_id: userId,
            thread_id: threadId,
            channel: 'whatsapp',
            type: triage.action_type,
            priority: triage.priority,
            title: triage.title || `Reply to ${conv.name}`,
            summary: triage.summary || conv.lastMessage,
            deadline_text: triage.deadline_text || 'Reply needed',
            suggested_reply: triage.suggested_reply || null,
            suggested_replies: triage.suggested_replies || [],
            is_completed: targetStatus === 'RESOLVED' || targetStatus === 'PURGED',
            detected_at: new Date().toISOString(),
            last_message_at: conv.lastMessageTime,
          });
        } else {
          // Non-actionable, answered directly on WhatsApp, or purged
          purgedCount++;

          // Auto-resolve any pending action item since conversation is answered/closed
          await supabase
            .from('action_items')
            .update({
              is_completed: true,
              resolved_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('thread_id', threadId)
            .eq('is_completed', false);

          let elseStatus: 'RESOLVED' | 'PURGED' = (conv.isOutgoingLast || conv.isGroup) ? 'RESOLVED' : 'PURGED';
          if (existingThread?.status === 'PURGED' && !conv.isGroup && !conv.isOutgoingLast) {
            elseStatus = 'PURGED';
          } else if (existingThread?.status === 'RESOLVED' || conv.isGroup || conv.isOutgoingLast) {
            elseStatus = 'RESOLVED';
          }

          await supabase.from('conversation_threads').upsert({
            id: threadId,
            user_id: userId,
            channel: 'whatsapp',
            external_id: conv.jid,
            subject_or_title: threadSubject,
            participants: conv.name,
            snippet: snippetText,
            body_text: JSON.stringify(conv.messages),
            last_message_at: conv.lastMessageTime,
            last_message_sender: conv.name,
            is_outgoing_last: conv.isOutgoingLast,
            status: elseStatus,
            updated_at: new Date().toISOString(),
          });

          if (triage.purge_reason) {
            await safeSavePurgeLog(supabase, {
              user_id: userId,
              channel: 'whatsapp',
              thread_id: threadId,
              sender: conv.name,
              subject_or_snippet: conv.lastMessage,
              reason: triage.purge_reason,
              confidence_score: 1.0,
              purged_at: new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch (waErr: any) {
      console.warn('[SyncEngine] WhatsApp sync warning:', waErr.message);
    }

    return {
      success: true,
      emailsProcessed,
      whatsappProcessed,
      actionItemsDetected,
      purgedCount,
    };
  } catch (err: any) {
    console.error('[SyncEngine] Fatal sync error:', err.message);
    return {
      success: false,
      emailsProcessed,
      whatsappProcessed,
      actionItemsDetected,
      purgedCount,
      error: err.message,
    };
  } finally {
    activeSyncUsers.delete(userId);
  }
}
