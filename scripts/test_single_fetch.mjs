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

async function testSingleFetch() {
  const { data: firstThread } = await supabase
    .from('conversation_threads')
    .select('id')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .single();

  const id = firstThread.id;
  console.log('Testing single thread body fetch for id:', id);

  const t0 = Date.now();
  const { data: bodyData, error } = await supabase
    .from('conversation_threads')
    .select('body_html, body_text')
    .eq('id', id)
    .single();

  const time = Date.now() - t0;
  console.log(`Single thread body fetch time: ${time}ms, hasHtml: ${Boolean(bodyData?.body_html)}, hasText: ${Boolean(bodyData?.body_text)}`);
}

testSingleFetch();
