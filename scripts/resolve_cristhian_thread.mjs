import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
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
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const THREAD_ID = 'aa04cd224f100320d89c4390d9b43ae0803308c93a5ab6ac67e572e572649dc7';
const ACTION_ITEM_ID = '63948822-a119-4842-a38c-0970bde6807a';

async function resolveCristhianThread() {
  console.log(`Resolving thread ${THREAD_ID}...`);
  const now = new Date().toISOString();

  // 1. Update thread status to 'RESOLVED'
  const { data: threadData, error: threadError } = await supabase
    .from('conversation_threads')
    .update({
      status: 'RESOLVED',
      updated_at: now
    })
    .eq('id', THREAD_ID)
    .select();

  if (threadError) {
    console.error('Error updating thread:', threadError);
  } else {
    console.log('Thread updated successfully:', JSON.stringify(threadData, null, 2));
  }

  // 2. Update action item to is_completed = true, resolved_at = now
  console.log(`Resolving action item ${ACTION_ITEM_ID}...`);
  const { data: actionData, error: actionError } = await supabase
    .from('action_items')
    .update({
      is_completed: true,
      resolved_at: now
    })
    .eq('id', ACTION_ITEM_ID)
    .select();

  if (actionError) {
    console.error('Error updating action item:', actionError);
  } else {
    console.log('Action item updated successfully:', JSON.stringify(actionData, null, 2));
  }

  // 3. Verification query
  const { data: finalThread, error: finalThreadErr } = await supabase
    .from('conversation_threads')
    .select('id, subject_or_title, status, last_message_sender')
    .eq('id', THREAD_ID)
    .single();

  const { data: finalAction, error: finalActionErr } = await supabase
    .from('action_items')
    .select('id, title, priority, is_completed, resolved_at')
    .eq('id', ACTION_ITEM_ID)
    .single();

  console.log('\n--- VERIFICATION RESULT ---');
  console.log('Final Thread Status:', finalThread, finalThreadErr);
  console.log('Final Action Item:', finalAction, finalActionErr);
}

resolveCristhianThread();
