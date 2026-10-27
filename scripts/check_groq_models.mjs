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

async function checkGroq() {
  const { data } = await supabase.from('user_settings').select('llm_model, gemini_api_key').single();
  const key = data?.gemini_api_key;

  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: {
      Authorization: `Bearer ${key}`
    }
  });

  const json = await res.json();
  console.log('All models count:', json.data?.length);
  for (const m of json.data || []) {
    console.log(`- ${m.id} (owned_by: ${m.owned_by}, active: ${m.active})`);
  }
}

checkGroq();
