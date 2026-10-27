import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';

// 1. Point test to an isolated test directory in the scratch directory
const TEST_DIR = path.resolve('C:/Users/Vlad/.gemini/antigravity/brain/5af5d297-5d6f-4dc2-bfe7-0ea9e97c1491/scratch/test_multiuser_data');
if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });
process.env.LOCAL_DB_DIR = TEST_DIR;
process.env.DESKTOP_MODE = 'true';

// Dynamically import compiled / TS transpile or direct module
const {
  registerLocalUser,
  loginLocalUser,
  validateLocalSession,
  logoutLocalUser,
  getLocalUserById,
  listLocalUsers,
  closeMasterDatabase,
} = await import('../src/lib/db/localAuthEngine.ts');

const {
  getUserDbPath,
  getUserDatabase,
  closeAllUserDatabases,
} = await import('../src/lib/db/localDb.ts');

const {
  createLocalDatabaseClient,
} = await import('../src/lib/db/localAdapter.ts');

console.log('🧪 Starting Multi-User Local Database Isolation Test...');
console.log('📁 Test Data Root:', TEST_DIR);

try {
  // Test 1: Register User 1 (Alice)
  console.log('\n--- Test 1: Register Alice ---');
  const aliceRes = registerLocalUser({
    email: 'alice@test.local',
    password: 'AliceSecurePassword123!',
    displayName: 'Alice Architect',
  });

  assert.ok(aliceRes.user.id, 'Alice user ID should be generated');
  assert.strictEqual(aliceRes.user.email, 'alice@test.local');
  assert.strictEqual(aliceRes.user.display_name, 'Alice Architect');
  assert.ok(aliceRes.token, 'Alice session token should be issued');

  const aliceDbPath = getUserDbPath(aliceRes.user.id);
  console.log('Alice DB Path:', aliceDbPath);
  assert.ok(fs.existsSync(aliceDbPath), 'Alice private data.db must exist on disk');

  // Verify Alice's initial seed data in data.db
  const aliceDb = getUserDatabase(aliceRes.user.id);
  const aliceSettings = aliceDb.prepare('SELECT * FROM user_settings WHERE id = ?').get(aliceRes.user.id);
  assert.ok(aliceSettings, 'Alice user_settings row should be provisioned');
  assert.strictEqual(aliceSettings.display_name, 'Alice Architect');
  assert.strictEqual(aliceSettings.primary_email, 'alice@test.local');

  const aliceRulesCount = aliceDb.prepare('SELECT COUNT(*) as count FROM priority_rules').get();
  assert.ok(aliceRulesCount.count > 0, 'Alice priority rules should be seeded');
  console.log(`✅ Alice registered successfully. Priority rules seeded: ${aliceRulesCount.count}`);

  // Test 2: Register User 2 (Bob)
  console.log('\n--- Test 2: Register Bob ---');
  const bobRes = registerLocalUser({
    email: 'bob@test.local',
    password: 'BobSecretPassword456!',
    displayName: 'Bob Builder',
  });

  assert.ok(bobRes.user.id, 'Bob user ID should be generated');
  assert.notStrictEqual(bobRes.user.id, aliceRes.user.id, 'Bob and Alice must have distinct IDs');
  assert.strictEqual(bobRes.user.email, 'bob@test.local');
  assert.strictEqual(bobRes.user.display_name, 'Bob Builder');

  const bobDbPath = getUserDbPath(bobRes.user.id);
  console.log('Bob DB Path:', bobDbPath);
  assert.ok(fs.existsSync(bobDbPath), 'Bob brand-new private data.db must exist on disk');
  assert.notStrictEqual(aliceDbPath, bobDbPath, 'Alice and Bob must have distinct physical SQLite files');

  const bobDb = getUserDatabase(bobRes.user.id);
  const bobSettings = bobDb.prepare('SELECT * FROM user_settings WHERE id = ?').get(bobRes.user.id);
  assert.ok(bobSettings, 'Bob user_settings row should be provisioned');
  assert.strictEqual(bobSettings.display_name, 'Bob Builder');
  console.log('✅ Bob registered successfully with distinct database file.');

  // Test 3: Verify Zero Cross-User Data Leakage (Isolation Test)
  console.log('\n--- Test 3: Physical File Isolation Verification ---');
  const aliceClient = createLocalDatabaseClient(aliceRes.user.id);
  const bobClient = createLocalDatabaseClient(bobRes.user.id);

  // Insert an email account and conversation thread exclusively for Alice
  const accountInsert = await aliceClient.from('accounts').insert({
    id: 'acc-alice-01',
    user_id: aliceRes.user.id,
    name: 'Alice Work Mail',
    email: 'alice@company.com',
    imap_server: 'imap.company.com',
    password: 'encrypted_pass',
  }).select().single();

  assert.strictEqual(accountInsert.data.id, 'acc-alice-01');

  const threadInsert = await aliceClient.from('conversation_threads').insert({
    id: 'thread-alice-01',
    user_id: aliceRes.user.id,
    account_id: 'acc-alice-01',
    channel: 'email',
    external_id: 'ext-101',
    subject_or_title: 'Confidential Executive Strategy',
    sender_email: 'ceo@company.com',
    last_message_at: new Date().toISOString(),
    status: 'PENDING',
  }).select().single();

  assert.strictEqual(threadInsert.data.id, 'thread-alice-01');
  console.log('Inserted account and thread into Alice private database.');

  // Verify Alice sees her data
  const aliceThreads = await aliceClient.from('conversation_threads').select('*');
  assert.strictEqual(aliceThreads.data.length, 1);
  assert.strictEqual(aliceThreads.data[0].subject_or_title, 'Confidential Executive Strategy');
  console.log(`Alice thread count: ${aliceThreads.data.length} (${aliceThreads.data[0].subject_or_title})`);

  // Verify Bob has ZERO accounts and ZERO threads (100% isolated)
  const bobAccounts = await bobClient.from('accounts').select('*');
  const bobThreads = await bobClient.from('conversation_threads').select('*');
  assert.strictEqual(bobAccounts.data.length, 0, "Bob's accounts must be empty");
  assert.strictEqual(bobThreads.data.length, 0, "Bob's threads must be empty (0 rows)");
  console.log(`Bob accounts count: ${bobAccounts.data.length}, threads count: ${bobThreads.data.length}`);
  console.log('🔒 VERIFIED: Bob cannot see ANY data from Alice! Zero cross-user data leakage.');

  // Test 4: Password Authentication
  console.log('\n--- Test 4: Local Authentication Verification ---');
  // Login with Alice correct password
  const aliceLogin = loginLocalUser({
    email: 'alice@test.local',
    password: 'AliceSecurePassword123!',
  });
  assert.strictEqual(aliceLogin.user.id, aliceRes.user.id);
  assert.ok(aliceLogin.token);
  console.log('✅ Alice password login succeeded.');

  // Login with Alice wrong password
  let wrongPassFailed = false;
  try {
    loginLocalUser({
      email: 'alice@test.local',
      password: 'WrongPassword!',
    });
  } catch (e) {
    wrongPassFailed = true;
  }
  assert.ok(wrongPassFailed, 'Login with wrong password must throw error');
  console.log('✅ Wrong password rejected correctly.');

  // Test 5: Session Token Validation
  console.log('\n--- Test 5: Session Validation & Revocation ---');
  const validatedUser = validateLocalSession(aliceLogin.token);
  assert.ok(validatedUser);
  assert.strictEqual(validatedUser.id, aliceRes.user.id);
  assert.strictEqual(validatedUser.email, 'alice@test.local');
  console.log('✅ Session token validated successfully for:', validatedUser.email);

  // Logout / session revocation
  logoutLocalUser(aliceLogin.token);
  const postLogoutValidation = validateLocalSession(aliceLogin.token);
  assert.strictEqual(postLogoutValidation, null, 'Revoked session token must validate to null');
  console.log('✅ Session revocation verified.');

  // Test 6: Duplicate Registration Prevention
  console.log('\n--- Test 6: Duplicate Email Prevention ---');
  let duplicatePrevented = false;
  try {
    registerLocalUser({
      email: 'alice@test.local',
      password: 'AnotherPassword',
    });
  } catch (e) {
    duplicatePrevented = true;
  }
  assert.ok(duplicatePrevented, 'Registering duplicate email must be rejected');
  console.log('✅ Duplicate registration prevented successfully.');

  // Test 7: Master Registry User Listing
  const allUsers = listLocalUsers();
  assert.strictEqual(allUsers.length, 2);
  console.log(`✅ Master registry lists ${allUsers.length} total local users:`, allUsers.map(u => u.email).join(', '));

  // Test 8: Auth API Routes Simulation (POST /api/auth/local-signup, local-login, local-session, logout)
  console.log('\n--- Test 8: Auth API Routes Verification ---');
  const { POST: signupRoute } = await import('../src/app/api/auth/local-signup/route.ts');
  const { POST: loginRoute } = await import('../src/app/api/auth/local-login/route.ts');
  const { GET: sessionRoute } = await import('../src/app/api/auth/local-session/route.ts');
  const { POST: logoutRoute } = await import('../src/app/api/auth/logout/route.ts');
  const { POST: localDbRoute } = await import('../src/app/api/local-db/route.ts');

  // Test signup route
  const signupReq = new Request('http://localhost:3000/api/auth/local-signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'carol@test.local',
      password: 'CarolPassword789!',
      displayName: 'Carol Consultant',
    }),
  });
  const signupRes = await signupRoute(signupReq);
  const signupData = await signupRes.json();
  assert.strictEqual(signupRes.status, 200);
  assert.strictEqual(signupData.user.email, 'carol@test.local');
  assert.ok(signupData.token);
  const carolDbPath = getUserDbPath(signupData.user.id);
  assert.ok(fs.existsSync(carolDbPath), "Carol's data.db must exist after route signup");
  console.log('✅ POST /api/auth/local-signup created user and data.db file on disk.');

  // Test login route
  const loginReq = new Request('http://localhost:3000/api/auth/local-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'carol@test.local',
      password: 'CarolPassword789!',
    }),
  });
  const loginRes = await loginRoute(loginReq);
  const loginData = await loginRes.json();
  assert.strictEqual(loginRes.status, 200);
  assert.strictEqual(loginData.user.email, 'carol@test.local');
  const sessionToken = loginData.token;
  console.log('✅ POST /api/auth/local-login succeeded and issued session token.');

  // Test local-session route
  const sessionReq = {
    cookies: {
      get: (name) => (name === 'pa_session_token' ? { value: sessionToken } : undefined),
    },
  };
  const sessionRes = await sessionRoute(sessionReq);
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.user.email, 'carol@test.local');
  console.log('✅ GET /api/auth/local-session returned authenticated user profile.');

  // Test /api/local-db route with Carol's session cookie
  const dbReq = new Request('http://localhost:3000/api/local-db', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: `pa_session_token=${sessionToken}; pa_user_id=${signupData.user.id}`,
    },
    body: JSON.stringify({
      table: 'user_settings',
      action: 'select',
      select: '*',
    }),
  });
  const dbRes = await localDbRoute(dbReq);
  const dbJson = await dbRes.json();
  assert.strictEqual(dbRes.status, 200);
  assert.ok(Array.isArray(dbJson.data));
  assert.strictEqual(dbJson.data[0].display_name, 'Carol Consultant');
  console.log('✅ POST /api/local-db resolved active user from cookie and queried private data.db.');

  // Test logout route
  const logoutReq = {
    cookies: {
      get: (name) => (name === 'pa_session_token' ? { value: sessionToken } : undefined),
    },
  };
  const logoutRes = await logoutRoute(logoutReq);
  assert.strictEqual(logoutRes.status, 200);
  const postLogoutSession = await sessionRoute(logoutReq);
  const postLogoutJson = await postLogoutSession.json();
  assert.strictEqual(postLogoutJson.user, null, 'User should be null after logout');
  console.log('✅ POST /api/auth/logout invalidated session successfully.');

  console.log('\n🎉 ALL MULTI-USER LOCAL DATABASE TESTS PASSED WITH 100% SUCCESS!');
} finally {
  closeAllUserDatabases();
  closeMasterDatabase();
  // Cleanup test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}
