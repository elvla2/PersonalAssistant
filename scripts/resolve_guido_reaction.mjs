import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Read .env.local or .env
function loadEnv() {
  const envPaths = ['.env.local', '.env'];
  for (const envPath of envPaths) {
    const fullPath = path.resolve(envPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // 1. Update data/whatsapp_cache.json
  const cachePath = path.resolve('data/whatsapp_cache.json');
  let updatedMessages = [];
  if (fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const guidoJid = '183755947950225@lid';
    if (cache.chats && cache.chats[guidoJid]) {
      const msgs = cache.chats[guidoJid];
      // Attach reaction to last photo
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        lastMsg.myReaction = '👍';
        console.log(`Set myReaction: 👍 on Guido last message (id: ${lastMsg.id})`);
      }
      updatedMessages = msgs;
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
      console.log('Saved data/whatsapp_cache.json successfully.');
    } else {
      console.warn(`Chat ${guidoJid} not found in whatsapp_cache.json`);
    }
  }

  // 2. Update Supabase
  const { data: threads, error: threadsErr } = await supabase
    .from('conversation_threads')
    .select('id, external_id, subject_or_title, status')
    .or('external_id.eq.183755947950225@lid,subject_or_title.ilike.%Guido%');

  if (threadsErr) {
    console.error('Error querying threads:', threadsErr);
  }

  console.log('Found threads for Guido:', threads);

  if (threads && threads.length > 0) {
    for (const t of threads) {
      const updatePayload = {
        status: 'RESOLVED',
        is_outgoing_last: true,
        updated_at: new Date().toISOString(),
      };
      if (updatedMessages.length > 0) {
        updatePayload.body_text = JSON.stringify(updatedMessages);
      }
      const { error: tErr } = await supabase
        .from('conversation_threads')
        .update(updatePayload)
        .eq('id', t.id);

      if (tErr) {
        console.error(`Error updating thread ${t.id}:`, tErr);
      }

      const { error: aErr } = await supabase
        .from('action_items')
        .update({
          is_completed: true,
          resolved_at: new Date().toISOString(),
        })
        .eq('thread_id', t.id);

      if (aErr) {
        console.error(`Error updating action item for thread ${t.id}:`, aErr);
      }

      console.log(`Resolved thread ${t.id} (${t.subject_or_title}) and completed its action items.`);
    }
  }

  console.log('Done resolving Guido thread with reaction.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
