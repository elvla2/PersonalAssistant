import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

// Load environment variables
let envContent = '';
if (fs.existsSync('.env.local')) {
  envContent = fs.readFileSync('.env.local', 'utf-8');
} else if (fs.existsSync('.env')) {
  envContent = fs.readFileSync('.env', 'utf-8');
}

const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceKey) {
  console.error('[FixScript] Missing Supabase credentials in .env / .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);
const now = new Date().toISOString();

async function run() {
  console.log('=== Step 1: Fix data/whatsapp_cache.json Group Contact Names ===');
  const cachePath = path.resolve(process.cwd(), 'data/whatsapp_cache.json');
  let cache = null;
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      let modified = false;

      // Check group JIDs in contacts
      if (cache.contacts) {
        if (cache.contacts['120363312833855066@g.us'] === 'Nitin Narang') {
          console.log('Fixing group 120363312833855066@g.us contact overwrite ("Nitin Narang")...');
          cache.contacts['160932458139813@lid'] = 'Nitin Narang';
          delete cache.contacts['120363312833855066@g.us'];
          modified = true;
        }

        if (cache.contacts['120363142013663639@g.us'] === 'Yes') {
          console.log('Fixing group 120363142013663639@g.us contact overwrite ("Yes")...');
          cache.contacts['173216114942110@lid'] = 'Yes';
          delete cache.contacts['120363142013663639@g.us'];
          modified = true;
        }

        // Clean any other group contact overwrite where contact matches a participant pushName
        for (const [jid, contactName] of Object.entries(cache.contacts)) {
          if (jid.endsWith('@g.us') && cache.chats?.[jid]) {
            const msgs = cache.chats[jid];
            const matchingSender = msgs.find((m) => !m.isFromMe && m.sender === contactName);
            if (matchingSender) {
              console.log(`Fixing participant name leak "${contactName}" on group ${jid}...`);
              if (matchingSender.senderJid && matchingSender.senderJid !== 'me') {
                cache.contacts[matchingSender.senderJid] = contactName;
              }
              delete cache.contacts[jid];
              modified = true;
            }
          }
        }
      }

      if (modified) {
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
        console.log('whatsapp_cache.json updated successfully.');
      } else {
        console.log('No cache contact overwrites needed.');
      }
    } catch (err) {
      console.error('Error reading/updating whatsapp_cache.json:', err.message);
    }
  }

  console.log('\n=== Step 2: Resolve Outgoing-Last Threads & "Nitin Narang" (120363312833855066@g.us) ===');
  // Find threads where is_outgoing_last is true OR external_id is Nitin Narang's group
  const { data: outgoingThreads, error: outgoingErr } = await supabase
    .from('conversation_threads')
    .select('id, external_id, subject_or_title, status, is_outgoing_last, channel')
    .or(`is_outgoing_last.eq.true,external_id.eq.120363312833855066@g.us`);

  if (outgoingErr) {
    console.error('Error fetching outgoing threads:', outgoingErr);
  } else {
    console.log(`Found ${outgoingThreads?.length || 0} outgoing-last or Nitin Narang threads.`);
    const threadIdsToResolve = [];

    for (const t of outgoingThreads || []) {
      threadIdsToResolve.push(t.id);
      console.log(` - Resolving thread: [${t.channel}] "${t.subject_or_title}" (${t.id})`);
    }

    if (threadIdsToResolve.length > 0) {
      const { error: updErr } = await supabase
        .from('conversation_threads')
        .update({
          status: 'RESOLVED',
          is_outgoing_last: true,
          updated_at: now,
        })
        .in('id', threadIdsToResolve);

      if (updErr) {
        console.error('Error updating outgoing threads to RESOLVED:', updErr);
      } else {
        console.log(`Updated ${threadIdsToResolve.length} threads to RESOLVED.`);
      }

      // Auto-resolve corresponding action items
      const { data: resolvedItems, error: actErr } = await supabase
        .from('action_items')
        .update({
          is_completed: true,
          resolved_at: now,
        })
        .in('thread_id', threadIdsToResolve)
        .eq('is_completed', false)
        .select('id, title');

      if (actErr) {
        console.error('Error auto-resolving action items for outgoing threads:', actErr);
      } else {
        console.log(`Auto-resolved ${resolvedItems?.length || 0} pending action items:`, resolvedItems?.map((a) => a.title));
      }
    }
  }

  console.log('\n=== Step 3: Resolve Unmentioned WhatsApp Group Threads (including "Yes" 120363142013663639@g.us) ===');
  const { data: waGroupThreads, error: waGroupErr } = await supabase
    .from('conversation_threads')
    .select('id, external_id, subject_or_title, status')
    .eq('channel', 'whatsapp')
    .like('external_id', '%@g.us');

  if (waGroupErr) {
    console.error('Error fetching WhatsApp group threads:', waGroupErr);
  } else {
    console.log(`Found ${waGroupThreads?.length || 0} WhatsApp group threads in DB.`);
    const userPhones = ['17867686267', '136790446968843'];
    const userAliases = ['vlad', 'vladimir', 'vlady', 'vladi'];

    const unmentionedGroupThreadIds = [];

    for (const gt of waGroupThreads || []) {
      const jid = gt.external_id;
      const cachedMsgs = cache?.chats?.[jid] || [];

      // Check if user is mentioned in unread slice
      let hasUserMention = false;
      if (cachedMsgs.length > 0) {
        let lastOwnIdx = -1;
        for (let i = cachedMsgs.length - 1; i >= 0; i--) {
          if (cachedMsgs[i].isFromMe) {
            lastOwnIdx = i;
            break;
          }
        }
        const unreadSlice = lastOwnIdx !== -1 ? cachedMsgs.slice(lastOwnIdx + 1) : cachedMsgs.slice(-5);

        for (const msg of unreadSlice) {
          if (msg.isFromMe) continue;
          const text = (msg.text || '').toLowerCase();

          // Baileys mentions
          if (Array.isArray(msg.mentions)) {
            for (const m of msg.mentions) {
              const clean = String(m).replace(/\D/g, '');
              if (userPhones.some((p) => clean.includes(p))) hasUserMention = true;
            }
          }
          // Quoted participant
          if (msg.quotedParticipant) {
            const clean = String(msg.quotedParticipant).replace(/\D/g, '');
            if (userPhones.some((p) => clean.includes(p))) hasUserMention = true;
          }
          // @phone in text
          for (const p of userPhones) {
            if (text.includes(`@${p}`)) hasUserMention = true;
          }
          // Name alias
          for (const alias of userAliases) {
            if (new RegExp(`\\b${alias}\\b`, 'i').test(text)) hasUserMention = true;
          }
        }
      }

      if (!hasUserMention) {
        console.log(`Group thread "${gt.subject_or_title}" (${jid}) has NO user mentions -> Marking RESOLVED.`);
        unmentionedGroupThreadIds.push(gt.id);
      } else {
        console.log(`Group thread "${gt.subject_or_title}" (${jid}) HAS active user mention -> Keeping active.`);
      }
    }

    if (unmentionedGroupThreadIds.length > 0) {
      const { error: updGroupErr } = await supabase
        .from('conversation_threads')
        .update({
          status: 'RESOLVED',
          updated_at: now,
        })
        .in('id', unmentionedGroupThreadIds);

      if (updGroupErr) {
        console.error('Error updating unmentioned group threads to RESOLVED:', updGroupErr);
      } else {
        console.log(`Updated ${unmentionedGroupThreadIds.length} group threads to RESOLVED.`);
      }

      const { data: actGroupResolved, error: actGroupErr } = await supabase
        .from('action_items')
        .update({
          is_completed: true,
          resolved_at: now,
        })
        .in('thread_id', unmentionedGroupThreadIds)
        .eq('is_completed', false)
        .select('id, title');

      if (actGroupErr) {
        console.error('Error auto-resolving action items for unmentioned group threads:', actGroupErr);
      } else {
        console.log(`Auto-resolved ${actGroupResolved?.length || 0} action items from unmentioned groups:`, actGroupResolved?.map((a) => a.title));
      }
    }
  }

  console.log('\n=== Step 4: Restore Falsely Purged Invoice / "Buenas Tardes" Email (FACTURA LICENCIA KNOX) ===');
  const { data: knoxThreads, error: knoxErr } = await supabase
    .from('conversation_threads')
    .select('*')
    .ilike('subject_or_title', '%FACTURA LICENCIA KNOX%');

  if (knoxErr) {
    console.error('Error finding Knox thread:', knoxErr);
  } else if (!knoxThreads || knoxThreads.length === 0) {
    console.log('No thread with subject "FACTURA LICENCIA KNOX" found directly. Checking all threads containing "KNOX" or "FACTURA"...');
    const { data: altThreads } = await supabase
      .from('conversation_threads')
      .select('*')
      .or('subject_or_title.ilike.%KNOX%,subject_or_title.ilike.%FACTURA%');
    console.log('Alternative threads found:', altThreads?.map((t) => ({ id: t.id, title: t.subject_or_title, status: t.status })));
  } else {
    for (const knoxThread of knoxThreads) {
      console.log(`Restoring thread "${knoxThread.subject_or_title}" (${knoxThread.id}) to ACTION_NEEDED...`);

      // 1. Update thread status to ACTION_NEEDED
      await supabase
        .from('conversation_threads')
        .update({
          status: 'ACTION_NEEDED',
          updated_at: now,
        })
        .eq('id', knoxThread.id);

      // 2. Upsert active action item
      const suggestedReplies = [
        'Hola Camila, buenas tardes. Recibida la factura de licencia Knox, procedemos a registrarla y tramitarla internamente. Muchas gracias.',
        'Hola Camila, muchas gracias por enviar la factura. ¿Podrías confirmarme si queda alguna factura pendiente de este lote?',
        'Hola Camila, buenas tardes. Recibido debidamente, lo revisamos con el equipo y cualquier consulta te avisamos.'
      ];

      // Check if action item exists for this thread
      const { data: existingAction } = await supabase
        .from('action_items')
        .select('id')
        .eq('thread_id', knoxThread.id)
        .maybeSingle();

      const actionItemPayload = {
        user_id: knoxThread.user_id,
        thread_id: knoxThread.id,
        account_id: knoxThread.account_id,
        channel: 'email',
        type: 'REPLY_NEEDED',
        priority: 'P2_MEDIUM',
        title: 'Factura Licencia Knox — Advance Commercial Service Inc',
        summary: 'Camila Benavides (Samsung SDS) envió las facturas de licencia Knox Guard (SO 1370595361 / Billing 3249766935) para revisión y registro.',
        deadline_text: 'Reply needed',
        suggested_reply: suggestedReplies[0],
        suggested_replies: suggestedReplies,
        is_completed: false,
        detected_at: now,
        last_message_at: knoxThread.last_message_at || now,
      };

      if (existingAction?.id) {
        await supabase
          .from('action_items')
          .update(actionItemPayload)
          .eq('id', existingAction.id);
        console.log(`Updated existing action item ${existingAction.id} for Knox invoice.`);
      } else {
        await supabase
          .from('action_items')
          .insert(actionItemPayload);
        console.log('Inserted new active action item for Knox invoice.');
      }

      // 3. Mark or clean ai_purge_log
      try {
        const { data: purgeLogs } = await supabase
          .from('ai_purge_log')
          .select('id')
          .eq('thread_id', knoxThread.id);

        if (purgeLogs && purgeLogs.length > 0) {
          // Attempt update with restored flag, fallback to delete
          const { error: purgeUpdErr } = await supabase
            .from('ai_purge_log')
            .update({
              restored: true,
              restored_at: now,
            })
            .eq('thread_id', knoxThread.id);

          if (purgeUpdErr) {
            console.log('ai_purge_log restored column not present, deleting purge log entry...');
            await supabase.from('ai_purge_log').delete().eq('thread_id', knoxThread.id);
          } else {
            console.log(`Updated ${purgeLogs.length} ai_purge_log entries to restored = true.`);
          }
        }
      } catch (err) {
        console.error('Error handling purge log for Knox thread:', err.message);
      }
    }
  }

  console.log('\n=== Fix and Reclassification Complete! ===');
}

run().catch((err) => {
  console.error('[FixScript] Unhandled error:', err);
  process.exit(1);
});
