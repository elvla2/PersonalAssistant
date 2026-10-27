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

async function checkCristhian() {
  const { data: threads } = await supabase
    .from('conversation_threads')
    .select('*')
    .ilike('last_message_sender', '%cristhian%');

  console.log('Cristhian threads:', JSON.stringify(threads, null, 2));

  if (threads && threads.length > 0) {
    const threadId = threads[0].id;
    const { data: actions } = await supabase
      .from('action_items')
      .select('*')
      .eq('thread_id', threadId);
    console.log('Action items:', JSON.stringify(actions, null, 2));
  }
}

checkCristhian();
