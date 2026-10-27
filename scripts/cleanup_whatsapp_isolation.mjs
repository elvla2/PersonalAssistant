import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Vlad', 'AppData', 'Roaming');
const rootDir = path.join(appData, 'PersonalAssistant');
const masterDbPath = path.join(rootDir, 'master.db');
const usersDir = path.join(rootDir, 'users');

console.log('=== WhatsApp Isolation Cleanup & Migration Script ===');
console.log('Data Root:', rootDir);

if (!fs.existsSync(masterDbPath)) {
  console.error('master.db not found at:', masterDbPath);
  process.exit(1);
}

const masterDb = new DatabaseSync(masterDbPath);
const users = masterDb.prepare('SELECT id, email, display_name FROM users').all();
console.log('Found users:', users);

// Primary user is first user or elvla2 / vladimir
const primaryUser = users.find((u) => u.email.includes('elvla2') || u.email.includes('vladimir')) || users[0];
console.log(`\nPrimary User identified: ${primaryUser.display_name} (${primaryUser.email}, ID: ${primaryUser.id})`);

// 1. Migrate credentials to Primary User folder
const primaryUserDir = path.join(usersDir, primaryUser.id);
const primaryAuthDir = path.join(primaryUserDir, 'whatsapp_auth');
const primaryCachePath = path.join(primaryUserDir, 'whatsapp_cache.json');
const repoAuthDir = path.resolve(process.cwd(), 'data', 'whatsapp_auth');
const repoCachePath = path.resolve(process.cwd(), 'data', 'whatsapp_cache.json');

if (!fs.existsSync(primaryAuthDir)) {
  fs.mkdirSync(primaryAuthDir, { recursive: true });
}

if (fs.existsSync(repoAuthDir)) {
  const credsDest = path.join(primaryAuthDir, 'creds.json');
  if (!fs.existsSync(credsDest)) {
    console.log(`\nCopying WhatsApp Baileys credentials to primary user folder: ${primaryAuthDir}`);
    const files = fs.readdirSync(repoAuthDir);
    let copied = 0;
    for (const f of files) {
      const src = path.join(repoAuthDir, f);
      const dst = path.join(primaryAuthDir, f);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, dst);
        copied++;
      }
    }
    console.log(`Copied ${copied} auth files to primary user.`);
  } else {
    console.log(`Primary user creds already present at: ${credsDest}`);
  }
}

if (fs.existsSync(repoCachePath) && !fs.existsSync(primaryCachePath)) {
  console.log(`Copying WhatsApp cache to primary user: ${primaryCachePath}`);
  fs.copyFileSync(repoCachePath, primaryCachePath);
}

// 2. Clean up secondary users
for (const u of users) {
  if (u.id === primaryUser.id) continue;

  console.log(`\nCleaning accidental WhatsApp data for secondary user: ${u.display_name} (${u.email}, ID: ${u.id})`);
  const uDir = path.join(usersDir, u.id);
  const uDbPath = path.join(uDir, 'data.db');
  const uAuthDir = path.join(uDir, 'whatsapp_auth');
  const uCachePath = path.join(uDir, 'whatsapp_cache.json');

  if (fs.existsSync(uDbPath)) {
    const db = new DatabaseSync(uDbPath);

    const prevThreads = db.prepare("SELECT COUNT(*) as count FROM conversation_threads WHERE channel = 'whatsapp'").get();
    const prevActions = db.prepare("SELECT COUNT(*) as count FROM action_items WHERE channel = 'whatsapp'").get();
    console.log(`  Before: ${prevThreads.count} WhatsApp threads, ${prevActions.count} WhatsApp action items.`);

    db.exec("DELETE FROM conversation_threads WHERE channel = 'whatsapp';");
    db.exec("DELETE FROM action_items WHERE channel = 'whatsapp';");

    try {
      db.exec("DELETE FROM purge_logs WHERE channel = 'whatsapp';");
    } catch {}

    try {
      db.exec("DELETE FROM whatsapp_sessions;");
    } catch {}

    const postThreads = db.prepare("SELECT COUNT(*) as count FROM conversation_threads WHERE channel = 'whatsapp'").get();
    const postActions = db.prepare("SELECT COUNT(*) as count FROM action_items WHERE channel = 'whatsapp'").get();
    console.log(`  After: ${postThreads.count} WhatsApp threads, ${postActions.count} WhatsApp action items.`);
    db.close();
  }

  // Clear auth dir for secondary user
  if (fs.existsSync(uAuthDir)) {
    fs.rmSync(uAuthDir, { recursive: true, force: true });
    fs.mkdirSync(uAuthDir, { recursive: true });
    console.log(`  Cleaned secondary user whatsapp_auth directory: ${uAuthDir}`);
  }

  // Clear cache file for secondary user
  if (fs.existsSync(uCachePath)) {
    fs.rmSync(uCachePath, { force: true });
    console.log(`  Cleaned secondary user whatsapp_cache.json: ${uCachePath}`);
  }
}

console.log('\n=== WhatsApp Isolation Cleanup Complete ===');
