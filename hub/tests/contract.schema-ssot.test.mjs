import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';
import { ensureAppleIapWalletSchema } from '../server/iap/apple.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';
import { DROP_TABLES, SCHEMA_ALLOWLIST, sanitizeSnapshot } from '../tools/sanitize-snapshot.mjs';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(TESTS_DIR, '..');
const PLATFORM_ROOT = path.resolve(HUB_ROOT, '..');
const SERVER_DIR = path.join(HUB_ROOT, 'server');
const RESTORE_TOOL_PATH = path.join(HUB_ROOT, 'tools', 'restore-data.mjs');

// Tables that live in a separate SQLite file (store-admin.sqlite), not platform.sqlite.
const SEPARATE_DB_TABLES = Object.freeze({
  'store-admin.sqlite': Object.freeze([
    'store_admin_meta',
    'store_admin_packages',
    'store_admin_submissions'
  ])
});
const SEPARATE_DB_TABLE_SET = new Set(Object.values(SEPARATE_DB_TABLES).flat());

function walkMjsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMjsFiles(full));
    else if (entry.isFile() && entry.name.endsWith('.mjs')) out.push(full);
  }
  return out.sort();
}

function stripJsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function extractStaticCreateTables(serverDir) {
  const found = new Map();
  const re = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gi;
  for (const file of walkMjsFiles(serverDir)) {
    const cleaned = stripJsComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(HUB_ROOT, file).replace(/\\/g, '/');
    let match;
    while ((match = re.exec(cleaned)) !== null) {
      found.set(match[1], rel);
    }
  }
  return found;
}

function extractRestoreRegisteredTables(restoreSource) {
  const tables = new Map();
  for (const blockName of ['BASE_COLUMNS', 'VERSION_ONE_TABLES', 'OPTIONAL_TABLES']) {
    const blockMatch = restoreSource.match(new RegExp(`const\\s+${blockName}\\s*=\\s*\\{([\\s\\S]*?)\\};`));
    assert.ok(blockMatch, `Expected ${blockName} definition in restore-data.mjs`);
    for (const entryMatch of blockMatch[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\[([^\]]*)\]/g)) {
      const cols = [...entryMatch[2].matchAll(/'([^']+)'/g)].map(m => m[1]);
      tables.set(entryMatch[1], cols);
    }
  }
  return tables;
}

test('TC-1 runtime schema SSOT: all feature modules + IAP schema pass inspectDatabase and sanitizeSnapshot without PII leaks', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-contract-ssot-'));
  const dataDir = path.join(tmpDir, 'data');
  let app = null;

  t.after(async () => {
    if (app) {
      try { if (app.cdn?.ready) await app.cdn.ready; } catch {}
      try { await app.close(); } catch {}
    }
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  // 1) Boot createApp with EVERY supported feature flag enabled + initialize Apple IAP / Shared Wallet schema.
  app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:18130',
    adminBaseUrl: 'http://127.0.0.1:18131',
    userOrigins: ['http://127.0.0.1:18130'],
    adminOrigins: ['http://127.0.0.1:18131'],
    secureCookies: false,
    auth: { emailEnabled: true },
    billing: { enabled: true, allowMockProvider: true },
    mobile: { enabled: true, jwtSecret: 'contract-ssot-mobile-jwt-secret-32chars!' },
    cdn: {
      enabled: true,
      provider: 'local',
      buckets: { quarantine: 'contract-ssot-quarantine', projects: 'contract-ssot-projects' }
    },
    social: { enabled: true },
    adgame: { enabled: true },
    agent: { enabled: true },
    shorts: { enabled: true }
  }, {
    rootDir: HUB_ROOT,
    platformRoot: PLATFORM_ROOT
  });
  ensureAppleIapWalletSchema(app.db);
  if (app.cdn?.ready) await app.cdn.ready;

  // 2) Extract all SQLite tables & columns via sqlite_master + PRAGMA table_info.
  const liveTableNames = app.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map(r => r.name);
  const liveSchema = new Map();
  for (const tableName of liveTableNames) {
    const cols = app.db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
    liveSchema.set(tableName, cols);
  }

  // Verify every major feature domain actually materialized in platform.sqlite.
  for (const expectedTable of [
    'users', 'sessions', 'creator_submissions',
    'billing_orders', 'billing_payment_events',
    'mobile_tokens', 'user_age_compliance', 'parental_consent_logs',
    'cdn_storage', 'cdn_projects',
    'user_profiles', 'social_parties', 'social_messages',
    'email_credentials',
    'ad_partners', 'ad_handoff_tokens',
    'hub_agent_settings', 'hub_agent_usage_logs',
    'shorts_videos', 'shorts_idempotency',
    'iap_transactions', 'player_wallet_accounts',
    'leaderboard_boards', 'datastore_entries',
    'avatar_wallets', 'l10n_keys', 'hub_publications', 'gamerqa_hub_runs', 'qa_runs'
  ]) {
    assert.ok(liveSchema.has(expectedTable), `Expected live platform.sqlite to initialize table '${expectedTable}'`);
  }

  // Exact bidirectional parity between live sqlite_master/table_info and sanitize-snapshot SCHEMA_ALLOWLIST.
  const allowlistTables = Object.keys(SCHEMA_ALLOWLIST).sort();
  assert.deepEqual(
    liveTableNames,
    allowlistTables,
    'Live platform.sqlite tables must match sanitize-snapshot.mjs SCHEMA_ALLOWLIST 1:1'
  );
  for (const [tableName, actualCols] of liveSchema.entries()) {
    const allowedSet = new Set(SCHEMA_ALLOWLIST[tableName]);
    const actualSet = new Set(actualCols);
    const missingInAllowlist = actualCols.filter(c => !allowedSet.has(c));
    const extraInAllowlist = SCHEMA_ALLOWLIST[tableName].filter(c => !actualSet.has(c));
    assert.deepEqual(missingInAllowlist, [], `Table '${tableName}' has live columns missing from SCHEMA_ALLOWLIST`);
    assert.deepEqual(extraInAllowlist, [], `Table '${tableName}' has stale columns in SCHEMA_ALLOWLIST`);
  }

  // Seed realistic live PII & sensitive records before closing app for inspectDatabase + sanitizeSnapshot verification.
  const now = Date.now();
  const PII = {
    displayName: 'Alice PrivateRealName',
    googleSubject: 'google-sub-alice-secret-999',
    email: 'alice.private@example.com',
    sessionHash: 'raw-live-session-hash-secret-abc',
    csrf: 'live-csrf-secret-xyz',
    mobileTokenHash: 'mobile-refresh-token-hash-secret',
    guardianHash: 'raw-guardian-email-hash-secret',
    handle: 'AliceReal#7777',
    partyInviteCode: 'INVITE99',
    stripeEventId: 'evt_live_stripe_999',
    adShortCode: 'ADCODE99',
    shortsHoldId: 'hold-live-secret-1',
    shortsJournalId: 'je-live-secret-1',
    iapStoreTxId: 'apple-tx-secret-999'
  };

  app.db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)')
    .run('u-live-alice', 'registered', PII.displayName, now);
  app.db.prepare('INSERT INTO identities(provider,subject,user_id) VALUES(?,?,?)')
    .run('google', PII.googleSubject, 'u-live-alice');
  app.db.prepare('INSERT INTO email_credentials(user_id,email,password_hash,salt,failed_attempts,locked_until,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('u-live-alice', PII.email, 'pw_hash_secret', 'pw_salt_secret', 0, null, now, now);
  app.db.prepare('INSERT INTO sessions(id_hash,kind,principal_id,analytics_subject,csrf,admin_authenticated,admin_username,created_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(PII.sessionHash, 'public', 'u-live-alice', 'a:live-alice', PII.csrf, 0, null, now, now + 86400000, 'live', null);
  app.db.prepare('INSERT INTO play_sessions(id,session_hash,principal_id,subject_id,game_id,build_id,started_at,ready_at,last_heartbeat_at,last_sequence,active_ms,paused,ended_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('ps-live-1', PII.sessionHash, 'u-live-alice', 'a:live-alice', 'mines-grid', 'b1', now, now, now, 1, 1500, 0, null, now + 3600000, 'live', null);
  app.db.prepare('INSERT INTO oauth_states(state_hash,session_hash,guest_id,source_subject,nonce,verifier,return_to,expires_at,used_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('oauth-state-hash-1', PII.sessionHash, null, 'a:live-alice', 'nonce-secret', 'verifier-secret', '/', now + 600000, null);
  app.db.prepare('INSERT INTO mobile_tokens(id_hash,principal_id,family_id,rotated_from,revoked_at,expires_at,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(PII.mobileTokenHash, 'u-live-alice', 'fam-live-1', null, null, now + 86400000, now);
  app.db.prepare('INSERT INTO parental_consent_logs(id,principal_id,guardian_contact_hash,method,status,created_at) VALUES(?,?,?,?,?,?)')
    .run('pcl-live-1', 'u-live-alice', PII.guardianHash, 'email_otp', 'verified', now);
  app.db.prepare('INSERT INTO user_profiles(principal_id,handle,avatar_color,bio,privacy_level,updated_at) VALUES(?,?,?,?,?,?)')
    .run('u-live-alice', PII.handle, '#00B06F', `contact ${PII.email}`, 'public', now);
  app.db.prepare('INSERT INTO social_parties(id,leader_id,title,target_game_id,room_code,max_members,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('party-live-1', 'u-live-alice', 'Secret Live Party', 'fortress-blue', PII.partyInviteCode, 4, now, now);
  app.db.prepare('INSERT INTO social_party_members(party_id,principal_id,role,ready_state,joined_at) VALUES(?,?,?,?,?)')
    .run('party-live-1', 'u-live-alice', 'leader', 1, now);
  app.db.prepare('INSERT INTO social_messages(id,channel_type,channel_key,sender_id,body,is_quick_message,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('msg-live-1', 'party', 'party-live-1', 'u-live-alice', `Join ${PII.partyInviteCode} or email ${PII.email}`, 0, now);
  app.db.prepare('INSERT INTO billing_payment_events(id,provider,external_event_id,order_id,event_type,payload_sha256,status,received_at,processed_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('bpe-live-1', 'stripe', PII.stripeEventId, null, 'payment_intent.succeeded', 'a'.repeat(64), 'PROCESSED', now, now);
  app.db.prepare('INSERT INTO ad_handoff_tokens(token_hash,short_code,session_id,campaign_id,partner_id,target_game_id,region_tag,snapshot_json,status,claimed_user_id,claimed_device_hash,expires_at,claimed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('ad-tok-hash-1', PII.adShortCode, 'adsess-1', 'camp-1', 'partner-1', 'fortress-blue', '잠실4동', '{}', 'issued', null, null, now + 3600000, null, now);
  app.db.prepare('INSERT INTO hub_agent_quotas(principal_id,free_trial_used,pro_week_key,pro_week_used,updated_at) VALUES(?,?,?,?,?)')
    .run('u-live-alice', 250, '2026-W47', 0, now);
  app.db.prepare('INSERT INTO hub_agent_usage_logs(id,principal_id,feature,auth_mode,plan_tier,provider,model,input_tokens,cached_tokens,output_tokens,thinking_tokens,total_tokens,weighted_tokens,quota_tokens_used,overage_tokens,charged_coins,hold_id,usage_record_id,journal_entry_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('aul-live-1', 'u-live-alice', 'hub_chat', 'hub_managed', 'free', 'gemini-oauth', 'gemini-2.5-flash', 100, 0, 50, 0, 150, 150, 150, 0, 0, null, null, null, 'SUCCEEDED', now);
  app.db.prepare('INSERT INTO shorts_videos(id,creator_id,creator_name,game_id,title,engine_id,resolved_engine_id,status,billing_hold_id,billing_journal_entry_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run('short-live-1', 'u-live-alice', PII.displayName, 'fortress-blue', 'Promo Clip', 'playforge-motion', 'playforge-motion', 'published', PII.shortsHoldId, PII.shortsJournalId, now, now);
  app.db.prepare('INSERT INTO shorts_idempotency(scope,idempotency_key,principal_id,request_hash,status_code,response_json,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('create', 'idem-short-1', 'u-live-alice', 'b'.repeat(64), 201, '{}', now);
  app.db.prepare('INSERT INTO shorts_views(short_id,viewer_key,day_bucket,created_at) VALUES(?,?,?,?)')
    .run('short-live-1', 'viewer-secret-key', '2026-11-22', now);
  app.db.prepare('INSERT INTO iap_transactions(id,principal_id,platform,environment,sku,store_tx_id,original_tx_id,state,raw_receipt_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run('iap-tx-1', 'u-live-alice', 'apple', 'Production', 'coins_100', PII.iapStoreTxId, 'orig-tx-1', 'GRANTED', 'c'.repeat(64), now, now);
  app.db.prepare('INSERT INTO iap_webhook_events(id,platform,event_uuid,event_type,payload_hash,processed_at) VALUES(?,?,?,?,?,?)')
    .run('iap-evt-1', 'apple', 'evt-uuid-secret-1', 'DID_RENEW', 'd'.repeat(64), now);
  app.db.prepare('INSERT INTO audit(id,action,target,detail,created_at) VALUES(?,?,?,?,?)')
    .run('aud-live-1', 'admin_login', 'u-live-alice', JSON.stringify({ email: PII.email }), now);

  await app.close();
  app = null;

  const dbPath = path.join(dataDir, 'platform.sqlite');

  // 3) Verify restore-data.mjs inspectDatabase() passes cleanly on the full live DB.
  const liveInspection = inspectDatabase(dbPath);
  assert.equal(liveInspection.integrity, 'ok');
  assert.equal(liveInspection.foreignKeys, 'ok');
  assert.equal(liveInspection.databaseUserVersion, 1);
  assert.equal(liveInspection.tables, liveTableNames.length);

  // 4) Run sanitizeSnapshot() -> Dev snapshot DB, re-validate with inspectDatabase(), and assert 0-row sensitive tables + zero raw PII.
  const sanitizedPath = path.join(tmpDir, 'dev-sanitized.sqlite');
  const sanitizeReport = await sanitizeSnapshot({
    from: dbPath,
    out: sanitizedPath,
    sourceEnv: 'live',
    targetEnv: 'dev',
    salt: 'contract-ssot-fixed-salt-0123456789abcdef',
    eventsDays: 7
  });
  assert.equal(sanitizeReport.ok, true);
  assert.equal(sanitizeReport.integrity, 'ok');
  assert.equal(sanitizeReport.foreignKeys, 'ok');

  const sanitizedInspection = inspectDatabase(sanitizedPath);
  assert.equal(sanitizedInspection.integrity, 'ok');
  assert.equal(sanitizedInspection.foreignKeys, 'ok');
  assert.equal(sanitizedInspection.tables, liveTableNames.length);

  const sanitizedDb = new DatabaseSync(sanitizedPath, { readOnly: true });
  try {
    // Every DROP_TABLES entry must have 0 rows.
    for (const sensitiveTable of [
      'sessions',
      'oauth_states',
      'mobile_tokens',
      'email_credentials',
      'social_parties',
      'social_party_members',
      'social_messages',
      'billing_payment_events',
      'ad_handoff_tokens',
      'hub_agent_quotas',
      'hub_agent_usage_logs',
      'shorts_idempotency',
      'shorts_views',
      'iap_transactions',
      'iap_webhook_events',
      'audit',
      ...DROP_TABLES
    ]) {
      if (!liveSchema.has(sensitiveTable)) continue;
      const count = sanitizedDb.prepare(`SELECT COUNT(*) AS n FROM ${sensitiveTable}`).get().n;
      assert.equal(count, 0, `Sensitive table '${sensitiveTable}' must be empty (0 rows) after sanitization`);
    }

    // Verify deterministic pseudonymization / scrubbing on retained tables.
    const userRow = sanitizedDb.prepare('SELECT display_name FROM users WHERE id=?').get('u-live-alice');
    assert.match(userRow.display_name, /^DevUser_[a-f0-9]{8}$/);
    const identRow = sanitizedDb.prepare('SELECT subject FROM identities WHERE user_id=?').get('u-live-alice');
    assert.match(identRow.subject, /^devsub_[a-f0-9]{16}$/);
    const playRow = sanitizedDb.prepare('SELECT session_hash, ended_at, paused FROM play_sessions WHERE id=?').get('ps-live-1');
    assert.match(playRow.session_hash, /^sanitized_sess_[a-f0-9]{16}$/);
    assert.notEqual(playRow.ended_at, null);
    assert.equal(playRow.paused, 1);
    const consentRow = sanitizedDb.prepare('SELECT guardian_contact_hash FROM parental_consent_logs WHERE id=?').get('pcl-live-1');
    assert.match(consentRow.guardian_contact_hash, /^sanitized_[a-f0-9]{16}$/);
    const profileRow = sanitizedDb.prepare('SELECT handle, bio FROM user_profiles WHERE principal_id=?').get('u-live-alice');
    assert.match(profileRow.handle, /^DevUser_[a-f0-9]{6}#\d{4}$/);
    assert.equal(profileRow.bio, '');
    const shortRow = sanitizedDb.prepare('SELECT creator_name, billing_hold_id, billing_journal_entry_id FROM shorts_videos WHERE id=?').get('short-live-1');
    assert.match(shortRow.creator_name, /^DevCreator_[a-f0-9]{6}$/);
    assert.equal(shortRow.billing_hold_id, null);
    assert.equal(shortRow.billing_journal_entry_id, null);

    // Exhaustive scan across ALL rows of ALL tables to confirm zero raw PII survives.
    const forbiddenNeedles = Object.values(PII);
    for (const tableName of liveTableNames) {
      const rows = sanitizedDb.prepare(`SELECT * FROM ${tableName}`).all();
      for (const row of rows) {
        const serialized = JSON.stringify(row);
        for (const needle of forbiddenNeedles) {
          assert.equal(
            serialized.includes(needle),
            false,
            `Raw PII '${needle}' leaked in sanitized table '${tableName}'`
          );
        }
      }
    }
  } finally {
    sanitizedDb.close();
  }

  // Also verify VACUUM cleared raw PII bytes from the SQLite binary file itself.
  const rawBytes = fs.readFileSync(sanitizedPath);
  for (const needle of Object.values(PII)) {
    assert.equal(
      rawBytes.includes(Buffer.from(needle, 'utf8')),
      false,
      `Raw PII bytes '${needle}' survived in vacuumed sanitized SQLite file`
    );
  }
});

test('TC-1 static schema SSOT: every CREATE TABLE in hub/server/**/*.mjs is registered in restore-data.mjs and sanitize-snapshot.mjs', () => {
  const declaredTables = extractStaticCreateTables(SERVER_DIR);
  assert.ok(declaredTables.size > 0, 'Static scanner must discover CREATE TABLE declarations under hub/server');

  const restoreSource = fs.readFileSync(RESTORE_TOOL_PATH, 'utf8');
  const restoreTables = extractRestoreRegisteredTables(restoreSource);
  const sanitizeTables = new Set(Object.keys(SCHEMA_ALLOWLIST));

  // Verify separate-DB allowlist (store-admin.sqlite) matches actual declarations and is excluded from platform.sqlite tools.
  for (const sepTable of SEPARATE_DB_TABLE_SET) {
    assert.equal(
      declaredTables.get(sepTable),
      'server/store-admin.mjs',
      `Separate-DB table '${sepTable}' must be declared in server/store-admin.mjs`
    );
    assert.equal(restoreTables.has(sepTable), false, `Separate-DB table '${sepTable}' must not be in platform restore-data.mjs`);
    assert.equal(sanitizeTables.has(sepTable), false, `Separate-DB table '${sepTable}' must not be in platform SCHEMA_ALLOWLIST`);
  }

  const platformDeclared = [...declaredTables.keys()].filter(name => !SEPARATE_DB_TABLE_SET.has(name)).sort();
  const missingInRestore = platformDeclared.filter(name => !restoreTables.has(name));
  const missingInSanitize = platformDeclared.filter(name => !sanitizeTables.has(name));
  const staleInRestore = [...restoreTables.keys()].filter(name => !declaredTables.has(name)).sort();
  const staleInSanitize = [...sanitizeTables].filter(name => !declaredTables.has(name)).sort();

  assert.deepEqual(
    missingInRestore,
    [],
    `Tables missing from hub/tools/restore-data.mjs: ${missingInRestore.map(t => `${t} (${declaredTables.get(t)})`).join(', ')}`
  );
  assert.deepEqual(
    missingInSanitize,
    [],
    `Tables missing from hub/tools/sanitize-snapshot.mjs SCHEMA_ALLOWLIST: ${missingInSanitize.map(t => `${t} (${declaredTables.get(t)})`).join(', ')}`
  );
  assert.deepEqual(staleInRestore, [], 'Stale tables in hub/tools/restore-data.mjs not found in hub/server/**/*.mjs');
  assert.deepEqual(staleInSanitize, [], 'Stale tables in hub/tools/sanitize-snapshot.mjs not found in hub/server/**/*.mjs');
  assert.deepEqual([...restoreTables.keys()].sort(), [...sanitizeTables].sort(), 'restore-data.mjs and sanitize-snapshot.mjs table sets must match');

  const unregisteredDrops = DROP_TABLES.filter(name => !sanitizeTables.has(name));
  assert.deepEqual(unregisteredDrops, [], 'Every DROP_TABLES entry must exist in SCHEMA_ALLOWLIST');
});
