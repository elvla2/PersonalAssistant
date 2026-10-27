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

async function setOllamaModel() {
  const { data, error } = await supabase
    .from('user_settings')
    .update({
      llm_model: 'ollama/llama3.2',
      gemini_api_key: '',
      updated_at: new Date().toISOString()
    })
    .eq('id', '1cd72dfa-249c-4261-bb1b-cb2289e06e71')
    .select();

  if (error) {
    console.error('Error updating user_settings:', error);
    process.exit(1);
  }

  console.log('Successfully updated user_settings for Ollama:');
  console.log(JSON.stringify(data, null, 2));
}

setOllamaModel();
