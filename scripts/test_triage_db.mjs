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

async function main() {
  const threadId = '633a715f5d5483f3daddb41636ebf72d2c8ceb9898c485343909b1254c1d5019';
  const { data: actions, error } = await supabase
    .from('action_items')
    .select('*')
    .eq('thread_id', threadId);

  console.log('Action items for VSL Probiotics:', actions, error);
}

main();
