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

async function testSql() {
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  console.log('Project Ref:', projectRef);

  // Test SQL API endpoint if accessible
  const endpoints = [
    `${supabaseUrl}/pg/query`,
    `${supabaseUrl}/rest/v1/`,
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, {
        method: ep.includes('query') ? 'POST' : 'GET',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: ep.includes('query') ? JSON.stringify({ query: 'SELECT 1;' }) : undefined
      });
      console.log(`Endpoint ${ep} status:`, res.status);
      const text = await res.text();
      console.log(`Endpoint ${ep} response:`, text.slice(0, 150));
    } catch (e) {
      console.log(`Endpoint ${ep} error:`, e.message);
    }
  }
}

testSql();
