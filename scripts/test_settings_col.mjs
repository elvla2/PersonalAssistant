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

async function testUpdate() {
  const { data, error } = await supabase
    .from('user_settings')
    .update({ groq_api_key: 'test' })
    .eq('id', '1cd72dfa-249c-4261-bb1b-cb2289e06e71')
    .select();

  console.log('Update groq_api_key result:', data, error);
}

testUpdate();
