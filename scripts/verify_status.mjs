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
const supabase = createClient(supabaseUrl, serviceKey);

async function verify() {
  const targetIds = [
    '02e3604d0311205bac81a39cccddcc22d00efdf2b273cceffe24a2039582deaf', // DHL
    'a0906414b5c813563f9a6a77b80c0619847d437870d0f51a554e33c0e90781a7', // Cristina Botero
    '633a715f5d5483f3daddb41636ebf72d2c8ceb9898c485343909b1254c1d5019', // VSL Probiotics
  ];

  const { data: threads } = await supabase
    .from('conversation_threads')
    .select('id, subject_or_title, last_message_sender, status')
    .in('id', targetIds);

  const { data: actions } = await supabase
    .from('action_items')
    .select('thread_id, title, priority, deadline_text, is_completed, suggested_reply, suggested_replies')
    .in('thread_id', targetIds);

  const { data: purgeLogs } = await supabase
    .from('ai_purge_log')
    .select('thread_id, reason, confidence_score, purged_at')
    .in('thread_id', targetIds);

  console.log('=== THREADS ===');
  console.log(JSON.stringify(threads, null, 2));

  console.log('=== ACTION ITEMS ===');
  console.log(JSON.stringify(actions, null, 2));

  console.log('=== PURGE LOGS ===');
  console.log(JSON.stringify(purgeLogs, null, 2));
}

verify();
