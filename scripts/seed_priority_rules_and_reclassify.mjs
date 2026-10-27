import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read environment configuration
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Bilingual P1 Keywords definition
const P1_SEED_KEYWORDS = [
  // Financial (English)
  { keyword: 'overdue', language: 'en', category: 'financial' },
  { keyword: 'past due', language: 'en', category: 'financial' },
  { keyword: 'outstanding invoices', language: 'en', category: 'financial' },
  { keyword: 'settle the overdue', language: 'en', category: 'financial' },
  { keyword: 'overdue account', language: 'en', category: 'financial' },
  { keyword: 'payment today', language: 'en', category: 'financial' },
  { keyword: 'process payment today', language: 'en', category: 'financial' },
  { keyword: 'remit payment', language: 'en', category: 'financial' },
  { keyword: 'balance overdue', language: 'en', category: 'financial' },
  { keyword: 'final notice', language: 'en', category: 'financial' },
  { keyword: 'collections', language: 'en', category: 'financial' },
  { keyword: 'credit hold', language: 'en', category: 'financial' },
  { keyword: 'credit line suspended', language: 'en', category: 'financial' },
  { keyword: 'wire transfer today', language: 'en', category: 'financial' },
  { keyword: 'immediate payment required', language: 'en', category: 'financial' },

  // Financial (Spanish)
  { keyword: 'vencido', language: 'es', category: 'financial' },
  { keyword: 'facturas vencidas', language: 'es', category: 'financial' },
  { keyword: 'saldo vencido', language: 'es', category: 'financial' },
  { keyword: 'cuenta vencida', language: 'es', category: 'financial' },
  { keyword: 'pago hoy', language: 'es', category: 'financial' },
  { keyword: 'procesar pago hoy', language: 'es', category: 'financial' },
  { keyword: 'aviso de cobro', language: 'es', category: 'financial' },
  { keyword: 'último aviso', language: 'es', category: 'financial' },
  { keyword: 'suspensión de crédito', language: 'es', category: 'financial' },
  { keyword: 'bloqueo de cuenta', language: 'es', category: 'financial' },
  { keyword: 'pago inmediato', language: 'es', category: 'financial' },
  { keyword: 'transferir hoy', language: 'es', category: 'financial' },
  { keyword: 'cuenta suspendida', language: 'es', category: 'financial' },
  { keyword: 'cobranza urgente', language: 'es', category: 'financial' },

  // Logistics & Customs (English)
  { keyword: 'customs hold', language: 'en', category: 'logistics' },
  { keyword: 'cargo on hold', language: 'en', category: 'logistics' },
  { keyword: 'shipment on hold', language: 'en', category: 'logistics' },
  { keyword: 'held at customs', language: 'en', category: 'logistics' },
  { keyword: 'customs detention', language: 'en', category: 'logistics' },
  { keyword: 'demurrage', language: 'en', category: 'logistics' },
  { keyword: 'detention charges', language: 'en', category: 'logistics' },
  { keyword: 'customs exam', language: 'en', category: 'logistics' },
  { keyword: 'customs seizure', language: 'en', category: 'logistics' },
  { keyword: 'port congestion fee', language: 'en', category: 'logistics' },
  { keyword: 'vessel cutoff', language: 'en', category: 'logistics' },
  { keyword: 'gate cutoff', language: 'en', category: 'logistics' },
  { keyword: 'missed cutoff', language: 'en', category: 'logistics' },
  { keyword: 'rollover risk', language: 'en', category: 'logistics' },
  { keyword: 'damaged cargo', language: 'en', category: 'logistics' },
  { keyword: 'urgent release', language: 'en', category: 'logistics' },
  { keyword: 'telex release', language: 'en', category: 'logistics' },
  { keyword: 'stop delivery', language: 'en', category: 'logistics' },
  { keyword: 'delivery hold', language: 'en', category: 'logistics' },

  // Logistics & Customs (Spanish)
  { keyword: 'carga retenida', language: 'es', category: 'logistics' },
  { keyword: 'embarque detenido', language: 'es', category: 'logistics' },
  { keyword: 'retenido en aduana', language: 'es', category: 'logistics' },
  { keyword: 'detenido por aduana', language: 'es', category: 'logistics' },
  { keyword: 'demora', language: 'es', category: 'logistics' },
  { keyword: 'estadías', language: 'es', category: 'logistics' },
  { keyword: 'almacenaje', language: 'es', category: 'logistics' },
  { keyword: 'reconocimiento aduanero', language: 'es', category: 'logistics' },
  { keyword: 'inspección física', language: 'es', category: 'logistics' },
  { keyword: 'corte de guía', language: 'es', category: 'logistics' },
  { keyword: 'corte de zarpe', language: 'es', category: 'logistics' },
  { keyword: 'liberación urgente', language: 'es', category: 'logistics' },
  { keyword: 'no entregar', language: 'es', category: 'logistics' },
  { keyword: 'detener entrega', language: 'es', category: 'logistics' },
  { keyword: 'retención aduanera', language: 'es', category: 'logistics' },

  // Critical Deadlines (English)
  { keyword: 'urgent', language: 'en', category: 'deadline' },
  { keyword: 'asap', language: 'en', category: 'deadline' },
  { keyword: 'emergency', language: 'en', category: 'deadline' },
  { keyword: 'immediate attention', language: 'en', category: 'deadline' },
  { keyword: 'immediately', language: 'en', category: 'deadline' },
  { keyword: 'right now', language: 'en', category: 'deadline' },
  { keyword: 'today by', language: 'en', category: 'deadline' },
  { keyword: 'end of day today', language: 'en', category: 'deadline' },
  { keyword: 'eod today', language: 'en', category: 'deadline' },
  { keyword: 'before 5pm', language: 'en', category: 'deadline' },
  { keyword: 'within 24 hours', language: 'en', category: 'deadline' },

  // Critical Deadlines (Spanish)
  { keyword: 'urgente', language: 'es', category: 'deadline' },
  { keyword: 'emergencia', language: 'es', category: 'deadline' },
  { keyword: 'de inmediato', language: 'es', category: 'deadline' },
  { keyword: 'ahora mismo', language: 'es', category: 'deadline' },
  { keyword: 'para hoy', language: 'es', category: 'deadline' },
  { keyword: 'hoy mismo', language: 'es', category: 'deadline' },
  { keyword: 'a más tardar hoy', language: 'es', category: 'deadline' },
  { keyword: 'antes del cierre', language: 'es', category: 'deadline' },
  { keyword: 'en las próximas horas', language: 'es', category: 'deadline' },

  // Legal (English)
  { keyword: 'legal notice', language: 'en', category: 'legal' },
  { keyword: 'breach of contract', language: 'en', category: 'legal' },
  { keyword: 'service termination', language: 'en', category: 'legal' },
  { keyword: 'lawsuit', language: 'en', category: 'legal' },
  { keyword: 'fraud alert', language: 'en', category: 'legal' },

  // Legal (Spanish)
  { keyword: 'notificación legal', language: 'es', category: 'legal' },
  { keyword: 'incumplimiento', language: 'es', category: 'legal' },
  { keyword: 'cancelación de servicio', language: 'es', category: 'legal' },
  { keyword: 'demanda', language: 'es', category: 'legal' },
  { keyword: 'alerta de fraude', language: 'es', category: 'legal' }
];

async function main() {
  console.log('🚀 Starting Priority Rules Seed & Thread Reclassification...');

  // 1. Seed public.priority_rules if table exists
  console.log('\n--- 1. Checking table public.priority_rules ---');
  const { data: testRules, error: testErr } = await supabase
    .from('priority_rules')
    .select('id')
    .limit(1);

  if (testErr && testErr.code === 'PGRST205') {
    console.log('ℹ️  Table public.priority_rules not found in schema cache.');
    console.log('📄 SQL migration script is prepared at: supabase_priority_rules.sql');
  } else if (!testErr) {
    console.log('✅ Table public.priority_rules exists. Seeding keywords...');
    const rows = P1_SEED_KEYWORDS.map((k) => ({
      ...k,
      priority: 'P1_HIGH',
      channel: 'all'
    }));
    const { error: insertErr } = await supabase.from('priority_rules').upsert(rows);
    if (insertErr) {
      console.warn('⚠️  Could not bulk insert into priority_rules:', insertErr.message);
    } else {
      console.log(`✅ Successfully seeded ${rows.length} bilingual P1 keywords into priority_rules.`);
    }
  }

  // 2. Reclassify DHL Express Thread to P1_HIGH
  const dhlThreadId = '02e3604d0311205bac81a39cccddcc22d00efdf2b273cceffe24a2039582deaf';
  console.log(`\n--- 2. Reclassifying DHL Thread (${dhlThreadId}) to P1_HIGH ---`);

  const dhlReplies = [
    'Hi, I reviewed the statement. Payment is being processed today, and we will send the confirmation receipt shortly.',
    'Hi, thank you for the details. Could you please confirm the current status and share any related documentation?',
    'Hi, thank you for reaching out. I have received your message and will review it in detail shortly.'
  ];

  const { error: dhlActionErr } = await supabase
    .from('action_items')
    .update({
      priority: 'P1_HIGH',
      deadline_text: 'Needs reply today',
      suggested_reply: dhlReplies[0],
      suggested_replies: dhlReplies,
      is_completed: false
    })
    .eq('thread_id', dhlThreadId);

  if (dhlActionErr) {
    console.error('❌ Error updating DHL action item:', dhlActionErr.message);
  } else {
    console.log('✅ DHL Action Item updated: priority = P1_HIGH, deadline = Needs reply today, 3 English suggested replies.');
  }

  await supabase
    .from('conversation_threads')
    .update({ status: 'ACTION_NEEDED', updated_at: new Date().toISOString() })
    .eq('id', dhlThreadId);

  // 3. Reclassify Cristina Botero Customs Entry to P3_LOW
  const boteroThreadId = 'a0906414b5c813563f9a6a77b80c0619847d437870d0f51a554e33c0e90781a7';
  console.log(`\n--- 3. Reclassifying Cristina Botero Thread (${boteroThreadId}) to P3_LOW ---`);

  const boteroReplies = [
    'Hi, received with thanks. We have filed this for our records.',
    'Hi, thank you for sending this over. Could you confirm if any further action is required on our end?',
    'Hi, received. Thank you for the update.'
  ];

  const { error: boteroActionErr } = await supabase
    .from('action_items')
    .update({
      priority: 'P3_LOW',
      deadline_text: 'Informational',
      suggested_reply: boteroReplies[0],
      suggested_replies: boteroReplies
    })
    .eq('thread_id', boteroThreadId);

  if (boteroActionErr) {
    console.error('❌ Error updating Botero action item:', boteroActionErr.message);
  } else {
    console.log('✅ Cristina Botero Action Item updated: priority = P3_LOW, deadline = Informational, 3 English routine replies.');
  }

  // 4. Reclassify VSL Probiotics Thread to PURGED
  const vslThreadId = '633a715f5d5483f3daddb41636ebf72d2c8ceb9898c485343909b1254c1d5019';
  console.log(`\n--- 4. Reclassifying VSL Probiotics Thread (${vslThreadId}) to PURGED ---`);

  // Update thread status to PURGED
  const { error: vslThreadErr } = await supabase
    .from('conversation_threads')
    .update({
      status: 'PURGED',
      updated_at: new Date().toISOString()
    })
    .eq('id', vslThreadId);

  if (vslThreadErr) {
    console.error('❌ Error purging VSL thread:', vslThreadErr.message);
  } else {
    console.log('✅ VSL Probiotics Thread status updated to PURGED.');
  }

  // Complete any action items
  const { error: vslActionErr } = await supabase
    .from('action_items')
    .update({
      is_completed: true,
      resolved_at: new Date().toISOString()
    })
    .eq('thread_id', vslThreadId);

  if (vslActionErr) {
    console.error('❌ Error completing VSL action items:', vslActionErr.message);
  } else {
    console.log('✅ VSL Action Item marked completed (resolved).');
  }

  // Insert into ai_purge_log
  const purgeRecord = {
    user_id: '1cd72dfa-249c-4261-bb1b-cb2289e06e71',
    channel: 'email',
    thread_id: vslThreadId,
    sender: 'VSL® Probiotics <hello@vsl3usa.com>',
    subject_or_snippet: 'Do I Really Need To Eat 30 Plants a Week? 🤔 🥕',
    reason: 'Marketing promotion / newsletter (VSL Probiotics)',
    confidence_score: 0.98,
    purged_at: new Date().toISOString(),
    restored: false
  };

  const { error: purgeLogErr } = await supabase
    .from('ai_purge_log')
    .insert(purgeRecord);

  if (purgeLogErr) {
    console.error('❌ Error writing to ai_purge_log:', purgeLogErr.message);
  } else {
    console.log('✅ Successfully recorded in ai_purge_log with confidence score 0.98.');
  }

  // 5. Verification Query
  console.log('\n--- 5. Verification Inspection ---');
  const ids = [dhlThreadId, boteroThreadId, vslThreadId];
  for (const id of ids) {
    const { data: t } = await supabase
      .from('conversation_threads')
      .select('id, subject_or_title, status')
      .eq('id', id)
      .single();
    const { data: a } = await supabase
      .from('action_items')
      .select('id, priority, deadline_text, suggested_reply, suggested_replies, is_completed')
      .eq('thread_id', id);

    console.log(`\nThread ID: ${id}`);
    console.log('Subject:', t?.subject_or_title);
    console.log('Thread Status:', t?.status);
    console.log('Action Items count:', a?.length);
    if (a && a.length > 0) {
      console.log('Action Item Priority:', a[0].priority);
      console.log('Action Item Deadline:', a[0].deadline_text);
      console.log('Action Item Completed:', a[0].is_completed);
      console.log('Suggested Replies:', a[0].suggested_replies);
    }
  }

  console.log('\n🎉 Execution completed successfully!');
}

main().catch((err) => {
  console.error('Fatal error in script:', err);
  process.exit(1);
});
