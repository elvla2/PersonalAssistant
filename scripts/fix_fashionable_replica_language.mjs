import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Read .env.local or .env
function loadEnv() {
  const envPaths = ['.env.local', '.env'];
  for (const envPath of envPaths) {
    const fullPath = path.resolve(envPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const val = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const englishReplies = [
    "Yes, I'm interested. What is the final price including fast shipping?",
    "Could you send a short video of this model showing the movement and details?",
    "Thanks, let me review the catalog and I'll get back to you shortly."
  ];

  const { data, error } = await supabase
    .from('action_items')
    .update({
      suggested_reply: englishReplies[0],
      suggested_replies: englishReplies,
    })
    .ilike('title', '%Fashionable%')
    .select();

  if (error) {
    console.error('Error updating Fashionable Replica action item:', error.message);
  } else {
    console.log('Successfully updated Fashionable Replica to English replies:', data);
  }
}

main();
