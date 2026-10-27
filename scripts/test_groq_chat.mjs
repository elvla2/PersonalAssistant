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

async function testGroqChat() {
  const { data } = await supabase.from('user_settings').select('llm_model, gemini_api_key').single();
  const key = data?.gemini_api_key;

  const candidateModels = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'qwen/qwen3.8-27b',
  ];

  for (const model of candidateModels) {
    console.log(`\nTesting model: ${model}...`);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: 'Output a json object with key "status" and value "ok".' }
          ],
          response_format: { type: 'json_object' }
        })
      });

      console.log(`Status: ${res.status}`);
      const text = await res.text();
      console.log('Response:', text.slice(0, 300));
    } catch (e) {
      console.error('Error:', e.message);
    }
  }
}

testGroqChat();
