import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';

const dbPath = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'PersonalAssistant',
  'personal_assistant.db'
);

console.log('Database Path:', dbPath);

try {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('\n=== TABLES IN LOCAL SQLITE DB ===');
  console.log(tables.map(t => t.name).join(', '));

  console.log('\n=== USER_SETTINGS ROWS ===');
  const userSettings = db.prepare("SELECT * FROM user_settings").all();
  console.log(`Found ${userSettings.length} user_settings row(s):`);
  console.log(JSON.stringify(userSettings, null, 2));

  console.log('\n=== ACCOUNTS ROWS ===');
  const accounts = db.prepare("SELECT id, user_id, name, email, account_type, last_synced_at FROM accounts").all();
  console.log(`Found ${accounts.length} connected account(s):`);
  console.log(JSON.stringify(accounts, null, 2));

  console.log('\n=== SUMMARY OF DATA ROWS ===');
  for (const t of tables) {
    if (t.name.startsWith('sqlite_')) continue;
    const count = db.prepare(`SELECT COUNT(*) as count FROM "${t.name}"`).get();
    console.log(`- ${t.name}: ${count.count} row(s)`);
  }
} catch (err) {
  console.error('Error reading local db:', err);
}
