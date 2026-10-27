import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { DatabaseSync } from 'node:sqlite';

console.log('🧪 Starting WhatsApp Multi-User Session Isolation Verification...\n');

// Set desktop mode
process.env.DESKTOP_MODE = 'true';
process.env.NEXT_PUBLIC_DESKTOP_MODE = 'true';

const {
  whatsAppManager,
  getWhatsAppForUser,
  getWhatsAppUserIdentity,
  getUserWhatsAppAuthDir,
  getUserWhatsAppCachePath,
} = await import('../src/lib/whatsapp.ts');

const { runFullSyncForUser } = await import('../src/lib/syncEngine.ts');
const { createAdminClient } = await import('../src/lib/supabase/admin.ts');

const primaryUserId = 'd93169e2-203a-454f-9f09-c0f1213d7600'; // Vladimir
const secondaryUserId = '8c345d48-3d2b-46b3-888f-25fd551caa8e'; // Jose

console.log('--- Test 1: Storage Path Isolation ---');
const primaryAuthDir = getUserWhatsAppAuthDir(primaryUserId);
const secondaryAuthDir = getUserWhatsAppAuthDir(secondaryUserId);
console.log('Primary Auth Dir:', primaryAuthDir);
console.log('Secondary Auth Dir:', secondaryAuthDir);

assert.notStrictEqual(primaryAuthDir, secondaryAuthDir, 'Auth directories must be completely isolated');
assert.ok(primaryAuthDir.includes(primaryUserId), 'Primary auth dir must contain primary user ID');
assert.ok(secondaryAuthDir.includes(secondaryUserId), 'Secondary auth dir must contain secondary user ID');
assert.ok(fs.existsSync(path.join(primaryAuthDir, 'creds.json')), 'Primary user must have credentials preserved');
assert.strictEqual(fs.existsSync(path.join(secondaryAuthDir, 'creds.json')), false, 'Secondary user auth folder must NOT have creds');
console.log('✅ Test 1 Passed: Directory isolation verified.');

console.log('\n--- Test 2: Service Instance Scoping ---');
const primaryService = whatsAppManager.getServiceForUser(primaryUserId);
const secondaryService = whatsAppManager.getServiceForUser(secondaryUserId);

assert.strictEqual(primaryService.getUserId(), primaryUserId);
assert.strictEqual(secondaryService.getUserId(), secondaryUserId);
assert.notStrictEqual(primaryService, secondaryService, 'Each user must have a unique WhatsAppService instance');

const secondaryStatus = secondaryService.getStatus();
console.log('Secondary User WhatsApp Status:', secondaryStatus);
assert.strictEqual(secondaryStatus.connected, false, 'Secondary user must be disconnected');
assert.strictEqual(secondaryStatus.user, null, 'Secondary user must have null user');
assert.strictEqual(secondaryService.isConnected(), false, 'secondaryService.isConnected() must be false');
assert.deepStrictEqual(secondaryService.getConversations(), [], 'secondaryService.getConversations() must return empty array');
console.log('✅ Test 2 Passed: Service scoping verified.');

console.log('\n--- Test 3: Identity Leakage Prevention ---');
const secondaryIdentity = secondaryService.getUserIdentity();
console.log('Secondary User WhatsApp Identity:', secondaryIdentity);
assert.notStrictEqual(secondaryIdentity.myPhone, '17867686267', 'Secondary user must NEVER leak Vlad\'s phone number');
assert.notStrictEqual(secondaryIdentity.myLid, '136790446968843', 'Secondary user must NEVER leak Vlad\'s LID');
console.log('✅ Test 3 Passed: Zero identity leakage verified.');

console.log('\n--- Test 4: Sync Engine Isolation for Secondary User ---');
const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Vlad', 'AppData', 'Roaming');
const secondaryDbPath = path.join(appData, 'PersonalAssistant', 'users', secondaryUserId, 'data.db');
const secDb = new DatabaseSync(secondaryDbPath);

const preThreads = secDb.prepare("SELECT COUNT(*) as count FROM conversation_threads WHERE channel = 'whatsapp'").get();
const preActions = secDb.prepare("SELECT COUNT(*) as count FROM action_items WHERE channel = 'whatsapp'").get();
console.log(`Secondary DB before sync test: ${preThreads.count} WhatsApp threads, ${preActions.count} WhatsApp action items.`);
assert.strictEqual(preThreads.count, 0, 'Secondary DB must have 0 WhatsApp threads');
assert.strictEqual(preActions.count, 0, 'Secondary DB must have 0 WhatsApp action items');

console.log('Running runFullSyncForUser for secondary user (Jose)...');
const supabase = createAdminClient(secondaryUserId);
const syncResult = await runFullSyncForUser(supabase, secondaryUserId);
console.log('Sync Result for secondary user:', syncResult);

assert.strictEqual(syncResult.whatsappProcessed, 0, 'Sync engine must process exactly 0 WhatsApp messages for disconnected user');

const postThreads = secDb.prepare("SELECT COUNT(*) as count FROM conversation_threads WHERE channel = 'whatsapp'").get();
const postActions = secDb.prepare("SELECT COUNT(*) as count FROM action_items WHERE channel = 'whatsapp'").get();
console.log(`Secondary DB after sync test: ${postThreads.count} WhatsApp threads, ${postActions.count} WhatsApp action items.`);
assert.strictEqual(postThreads.count, 0, 'Secondary DB must retain 0 WhatsApp threads after sync');
assert.strictEqual(postActions.count, 0, 'Secondary DB must retain 0 WhatsApp action items after sync');
secDb.close();
console.log('✅ Test 4 Passed: Sync engine processed 0 WhatsApp threads and added 0 records to secondary user.');

console.log('\n🎉 ALL WHATSAPP ISOLATION TESTS PASSED SUCCESSFULLY! 🎉\n');
process.exit(0);
