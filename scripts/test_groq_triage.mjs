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

async function testTriageWithGroq120b() {
  const { data } = await supabase.from('user_settings').select('llm_model, gemini_api_key').single();
  const key = data?.gemini_api_key;

  const prompt = `You are the elite Chief of Staff and Executive Assistant to Vladimir.
Evaluate this communication with human-grade executive discretion: surface ONLY items that genuinely require Vladimir's personal attention, decision, or reply.

Thread Details:
- Channel: email (Work)
- Subject: RE: SAMSUNG 5300163180 - Overdue Account - DHL Express
- Contact / Sender: June Seok Kim (DHL CSI) <matthew.jskim@dhl.com>
- Conversation Transcript:
[matthew.jskim@dhl.com]: Dear Customer, please be advised that account 5300163180 has overdue invoices. Payment must be processed today to prevent hold.

STRICT LANGUAGE DIRECTIVE & 3-TONE STRUCTURE:
- Detect the language of the incoming communication (English).
- ALL 3 suggested replies in 'suggested_replies' MUST be in the exact same language as the incoming communication.
- Provide EXACTLY 3 distinct replies adhering to these tones:
  - Index 0: ⚡ Decisive / Action (direct decision or immediate authorization)
  - Index 1: 📋 Detailed / Inquire (asking for status, clarification, or supporting documents)
  - Index 2: 🤝 Courteous / Holding (acknowledgment buying time to review)
- 'suggested_reply' MUST match Index 0.

PRIORITY CRITERIA:
- 'P1_HIGH': Urgent / Critical deadline (within 24 hours, customs hold, demurrage, overdue account, immediate payment required).
- 'P2_MEDIUM': Normal action needed, reply required, decision needed (2-3 days).
- 'P3_LOW': Routine attachment deliveries, informational updates, FYIs with no urgent deadline.

Respond strictly in valid JSON format:
{
  "has_action_item": boolean,
  "action_type": "REPLY_NEEDED" | "PROMISED_TO_SEND" | "AWAITING_THEIR_REPLY" | "NONE",
  "priority": "P1_HIGH" | "P2_MEDIUM" | "P3_LOW" | "NONE",
  "title": "Concise executive title",
  "summary": "1-2 sentence contextual briefing",
  "deadline_text": "Always in English (e.g. 'Reply needed', 'Needs reply today', 'Informational', 'Follow-up promised')",
  "suggested_reply": "Primary suggested reply (matches message language)",
  "suggested_replies": [
    "Tone 1 (⚡ Decisive): ...",
    "Tone 2 (📋 Detailed): ...",
    "Tone 3 (🤝 Holding): ..."
  ],
  "purge_reason": "Reason if has_action_item is false"
}`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  console.log('Status:', res.status);
  const data2 = await res.json();
  console.log('Choices message:', JSON.stringify(data2.choices?.[0]?.message, null, 2));
}

testTriageWithGroq120b();
