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

async function benchmark() {
  console.log('--- Benchmarking queries ---');

  const t0 = Date.now();
  const { data: countData, count } = await supabase
    .from('conversation_threads')
    .select('id', { count: 'exact' });
  console.log(`Total threads count: ${count} in ${Date.now() - t0}ms`);

  const t1 = Date.now();
  const { data: fullThreads, error: err1 } = await supabase
    .from('conversation_threads')
    .select('*')
    .order('last_message_at', { ascending: false });
  const tFull = Date.now() - t1;
  const fullBytes = Buffer.byteLength(JSON.stringify(fullThreads || ''));
  console.log(`select('*') count: ${fullThreads?.length}, time: ${tFull}ms, payload: ${(fullBytes / 1024).toFixed(1)} KB`);

  const t2 = Date.now();
  const { data: lightweightThreads, error: err2 } = await supabase
    .from('conversation_threads')
    .select('id, user_id, account_id, channel, external_id, subject_or_title, last_message_sender, last_message_at, snippet, status, sender_email, is_outgoing_last')
    .order('last_message_at', { ascending: false });
  const tLight = Date.now() - t2;
  const lightBytes = Buffer.byteLength(JSON.stringify(lightweightThreads || ''));
  console.log(`lightweight select count: ${lightweightThreads?.length}, time: ${tLight}ms, payload: ${(lightBytes / 1024).toFixed(1)} KB`);

  const t3 = Date.now();
  const { data: actions, error: err3 } = await supabase
    .from('action_items')
    .select('id, thread_id, priority, type, deadline_text, suggested_reply, suggested_replies, is_completed');
  const tActions = Date.now() - t3;
  console.log(`action_items select count: ${actions?.length}, time: ${tActions}ms`);

  const t4 = Date.now();
  const { data: accounts, error: err4 } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });
  const tAccounts = Date.now() - t4;
  console.log(`accounts select count: ${accounts?.length}, time: ${tAccounts}ms`);
}

benchmark();
