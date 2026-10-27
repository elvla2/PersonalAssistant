async function testOllamaTriage() {
  console.log('1. Probing Ollama tags on http://127.0.0.1:11434/api/tags ...');
  const tagsRes = await fetch('http://127.0.0.1:11434/api/tags');
  const tagsData = await tagsRes.json();
  console.log('Installed models:', tagsData.models?.map(m => m.name));

  const prompt = `You are the elite Chief of Staff and Executive Assistant to Vladimir.
Evaluate this communication with human-grade executive discretion: surface ONLY items that genuinely require Vladimir's personal attention, decision, or reply.

Thread Details:
- Channel: email (Work)
- Subject: URGENT: Port Demurrage & Customs Clearance Hold - Container MEDU8492014
- Contact / Sender: MSC Shipping <operations@msc.com>
- Conversation Transcript:
[operations@msc.com]: Dear Vlad, container MEDU8492014 is on customs hold at terminal 4. Demurrage charges of $350/day will accrue starting tomorrow morning unless import release documents are submitted today.

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

  console.log('\n2. Sending executive triage prompt to Ollama (model: llama3.2)...');
  const start = Date.now();
  const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ollama'
    },
    body: JSON.stringify({
      model: 'llama3.2',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  const duration = Date.now() - start;
  console.log(`HTTP Status: ${res.status} (Inference time: ${duration}ms)`);
  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content;
  console.log('\nRaw Model Output:\n', rawContent);

  try {
    const parsed = JSON.parse(rawContent);
    console.log('\n✅ Successfully parsed JSON Triage Result:');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.error('Failed to parse JSON:', e);
  }
}

testOllamaTriage().catch(console.error);
