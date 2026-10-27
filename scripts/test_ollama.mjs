async function main() {
  console.log('Testing Ollama on http://127.0.0.1:11434/v1/chat/completions ...');
  try {
    const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        messages: [
          { role: 'system', content: 'You are an email triage assistant. Return a JSON object.' },
          { role: 'user', content: 'Extract status from: "The cargo has arrived at customs." Return JSON: {"has_action_item": true, "summary": "Cargo arrived"}' }
        ],
        response_format: { type: 'json_object' }
      })
    });

    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response content:', data?.choices?.[0]?.message?.content);
  } catch (err) {
    console.error('Error testing Ollama:', err);
  }
}

main();
