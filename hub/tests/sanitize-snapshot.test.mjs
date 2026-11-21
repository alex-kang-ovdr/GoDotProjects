import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { ensureMobileSchema } from '../server/mobile/schema.mjs';
import { ensureAppleIapWalletSchema } from '../server/iap/apple.mjs';
import { sanitizeSnapshot } from '../tools/sanitize-snapshot.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function seedLiveDb(dir, nowMs) {
  const db = openDatabase(dir);
  ensureMobileSchema(db);
  db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_live_1', 'google', '홍길동 실명', nowMs - 100000);
  db.prepare('INSERT INTO identities(provider, subject, user_id) VALUES(?,?,?)').run('google', 'google-real-sub-998877', 'u_live_1');
  db.prepare('INSERT INTO sessions(id_hash, kind, principal_id, analytics_subject, csrf, created_at, expires_at) VALUES(?,?,?,?,?,?,?)')
    .run('live_sess_hash', 'public', 'u_live_1', 'subj1', 'csrf_real', nowMs, nowMs + 86400000);
  db.prepare('INSERT INTO mobile_tokens(id_hash, principal_id, family_id, expires_at, created_at) VALUES(?,?,?,?,?)')
    .run('live_refresh_hash', 'u_live_1', 'fam1', nowMs + 86400000, nowMs);
  db.prepare('INSERT INTO save_slots(principal_id, game_id, slot, schema_version, revision, payload, updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('u_live_1', 'survivor-arena-g2', 'main', 1, 3, '{"wave":12}', nowMs);
  db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
    .run('u_live_1', 'KR', 'CHILD_PROTECTED', 'verified', nowMs);
  db.prepare('INSERT INTO parental_consent_logs(id, principal_id, guardian_contact_hash, method, status, created_at) VALUES(?,?,?,?,?,?)')
    .run('pcl_1', 'u_live_1', 'real_parent_email_hash_abc', 'email_otp', 'verified', nowMs);
  db.prepare('INSERT INTO game_overrides(game_id, enabled, updated_at) VALUES(?,?,?)')
    .run('survivor-arena-g2', 1, nowMs);
  db.prepare('INSERT INTO audit(id, action, target, detail, created_at) VALUES(?,?,?,?,?)')
    .run('aud_1', 'admin.login', 'admin', 'ip=1.2.3.4', nowMs);
  // Old event (20 days ago -> should be pruned) & recent event (1 day ago -> kept)
  db.prepare('INSERT INTO events(id, fingerprint, name, subject_id, visit_id, occurred_at, received_at, properties, source) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('ev_old', 'fp1', 'play_click', 'subj1', 'v1', nowMs - 20 * 86400000, nowMs - 20 * 86400000, '{}', 'web');
  db.prepare('INSERT INTO events(id, fingerprint, name, subject_id, visit_id, occurred_at, received_at, properties, source) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('ev_new', 'fp2', 'play_click', 'subj1', 'v2', nowMs - 86400000, nowMs - 86400000, '{}', 'web');
  db.close();
  return path.join(dir, 'platform.sqlite');
}

function seedExistingDevLocalDb(dir, nowMs) {
  const db = openDatabase(dir);
  ensureMobileSchema(db);
  // Local/dev test user (prefix local_ -> MUST be preserved verbatim!)
  db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('local_tester_1', 'guest', '내 로컬 테스트 계정', nowMs);
  db.prepare('INSERT INTO save_slots(principal_id, game_id, slot, schema_version, revision, payload, updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('local_tester_1', 'survivor-arena-g2', 'main', 1, 7, '{"wave":99,"godMode":true}', nowMs);
  db.prepare('INSERT INTO user_age_compliance(principal_id, region_code, age_tier, parental_consent_status, updated_at) VALUES(?,?,?,?,?)')
    .run('local_tester_1', 'KR', 'ADULT', 'not_required', nowMs);
  // Local-only unreleased game override (not in live -> MUST be preserved!)
  db.prepare('INSERT INTO game_overrides(game_id, enabled, updated_at) VALUES(?,?,?)')
    .run('local-proto-game', 1, nowMs);
  // Overlapping live game override (live value wins!)
  db.prepare('INSERT INTO game_overrides(game_id, enabled, updated_at) VALUES(?,?,?)')
    .run('survivor-arena-g2', 0, nowMs - 5000);
  db.close();
  return path.join(dir, 'platform.sqlite');
}

test('sanitizeSnapshot scrubs live PII, wipes tokens/sessions, preserves local/dev test data, and passes restore-data inspection', async () => {
  const nowMs = Date.UTC(2026, 10, 21, 3, 0, 0);
  const liveDir = makeTempDir('playhub-live-src-');
  const devDir = makeTempDir('playhub-dev-existing-');
  const outDir = makeTempDir('playhub-sanitized-out-');
  try {
    const liveDbPath = seedLiveDb(liveDir, nowMs);
    const existingDevDbPath = seedExistingDevLocalDb(devDir, nowMs);
    const outPath = path.join(outDir, 'dev-sanitized.sqlite');

    const report = await sanitizeSnapshot({
      from: liveDbPath,
      out: outPath,
      sourceEnv: 'live',
      targetEnv: 'dev',
      salt: 'deterministic-dev-salt-test',
      eventsDays: 7,
      preserveFrom: existingDevDbPath,
      now: () => nowMs
    });

    assert.equal(report.ok, true);
    assert.equal(report.sanitized, true);
    assert.equal(report.sourceEnv, 'live');
    assert.equal(report.targetEnv, 'dev');
    assert.equal(report.integrity, 'ok');
    assert.equal(report.foreignKeys, 'ok');
    assert.equal(report.stats.preserved.users, 1);
    assert.equal(report.stats.preserved.saves, 1);
    assert.equal(report.stats.preserved.overrides, 1);

    // Must pass restore-data.mjs inspectDatabase check!
    const inspected = inspectDatabase(outPath);
    assert.equal(inspected.integrity, 'ok');
    assert.equal(inspected.foreignKeys, 'ok');
    assert.equal(inspected.users, 2); // u_live_1 (pseudonymized) + local_tester_1 (preserved)
    assert.equal(inspected.saves, 2);

    const db = new DatabaseSync(outPath, { readOnly: true });
    try {
      // Sessions, mobile_tokens, audit wiped
      assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n, 0);
      assert.equal(db.prepare('SELECT count(*) n FROM mobile_tokens').get().n, 0);
      assert.equal(db.prepare('SELECT count(*) n FROM audit').get().n, 0);

      // Live user PII pseudonymized
      const liveUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get('u_live_1');
      assert.notEqual(liveUser.display_name, '홍길동 실명');
      assert.match(liveUser.display_name, /^DevUser_[a-f0-9]{8}$/);

      const ident = db.prepare('SELECT subject FROM identities WHERE user_id = ?').get('u_live_1');
      assert.notEqual(ident.subject, 'google-real-sub-998877');
      assert.match(ident.subject, /^devsub_[a-f0-9]{16}$/);

      // Child age tier preserved, guardian hash re-salted
      const comp = db.prepare('SELECT age_tier, parental_consent_status FROM user_age_compliance WHERE principal_id = ?').get('u_live_1');
      assert.equal(comp.age_tier, 'CHILD_PROTECTED');
      assert.equal(comp.parental_consent_status, 'verified');
      const pcl = db.prepare('SELECT guardian_contact_hash FROM parental_consent_logs WHERE id = ?').get('pcl_1');
      assert.notEqual(pcl.guardian_contact_hash, 'real_parent_email_hash_abc');
      assert.match(pcl.guardian_contact_hash, /^sanitized_[a-f0-9]{16}$/);

      // Events pruned to 7 days
      const evIds = db.prepare('SELECT id FROM events').all().map(r => r.id);
      assert.deepEqual(evIds, ['ev_new']);

      // Local test user & save & local-only game override preserved verbatim!
      const localUser = db.prepare('SELECT display_name FROM users WHERE id = ?').get('local_tester_1');
      assert.equal(localUser.display_name, '내 로컬 테스트 계정');
      const localSave = db.prepare('SELECT payload, revision FROM save_slots WHERE principal_id = ?').get('local_tester_1');
      assert.equal(localSave.revision, 7);
      assert.equal(localSave.payload, '{"wave":99,"godMode":true}');
      const localGame = db.prepare('SELECT enabled FROM game_overrides WHERE game_id = ?').get('local-proto-game');
      assert.equal(localGame.enabled, 1);
      // Overlapping live game uses live state (1), not stale local override (0)
      const liveGame = db.prepare('SELECT enabled FROM game_overrides WHERE game_id = ?').get('survivor-arena-g2');
      assert.equal(liveGame.enabled, 1);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(liveDir, { recursive: true, force: true });
    fs.rmSync(devDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('sanitizeSnapshot fails closed on unregistered table or column and blocks live targetEnv', async () => {
  const nowMs = Date.now();
  const badTableDir = makeTempDir('playhub-bad-tbl-');
  const badColDir = makeTempDir('playhub-bad-col-');
  const outDir = makeTempDir('playhub-fail-out-');
  try {
    const db1Path = seedLiveDb(badTableDir, nowMs);
    const db1 = new DatabaseSync(db1Path);
    db1.exec('CREATE TABLE secret_billing_cards(id TEXT PRIMARY KEY, pan TEXT)');
    db1.close();

    const out1 = path.join(outDir, 'bad1.sqlite');
    await assert.rejects(
      () => sanitizeSnapshot({ from: db1Path, out: out1, targetEnv: 'dev' }),
      err => err.code === 'SANITIZE_UNKNOWN_TABLE'
    );
    assert.equal(fs.existsSync(out1), false);

    const db2Path = seedLiveDb(badColDir, nowMs);
    const db2 = new DatabaseSync(db2Path);
    db2.exec('ALTER TABLE users ADD COLUMN phone_number TEXT');
    db2.close();

    const out2 = path.join(outDir, 'bad2.sqlite');
    await assert.rejects(
      () => sanitizeSnapshot({ from: db2Path, out: out2, targetEnv: 'dev' }),
      err => err.code === 'SANITIZE_UNKNOWN_COLUMN'
    );
    assert.equal(fs.existsSync(out2), false);

    // One-way guardrail: targetEnv = 'live' must be rejected
    await assert.rejects(
      () => sanitizeSnapshot({ from: db1Path, out: path.join(outDir, 'bad3.sqlite'), targetEnv: 'live' }),
      err => err.code === 'SANITIZE_FORBIDDEN_TARGET'
    );
  } finally {
    fs.rmSync(badTableDir, { recursive: true, force: true });
    fs.rmSync(badColDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('sanitizeSnapshot handles full integrated createApp() DB (avatar, EOS SSOT, billing, cdn, l10n, mobile, IAP) and scrubs play_sessions, owners & admin IDs', async () => {
  const nowMs = Date.UTC(2026, 10, 21, 5, 0, 0);
  const workDir = makeTempDir('playhub-full-createapp-');
  const outDir = makeTempDir('playhub-full-sanitized-');
  fs.mkdirSync(path.join(workDir, 'data'), { recursive: true });

  const app = createApp(
    {
      dataDir: path.join(workDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'http://127.0.0.1:18130',
      userOrigins: ['http://127.0.0.1:18130'],
      adminOrigins: ['http://127.0.0.1:18131'],
      mobile: { enabled: true, jwtSecret: 'test-mobile-secret-32-chars-minimum!!' },
      cdn: {
        enabled: true,
        provider: 'r2',
        accountId: '0123456789abcdef0123456789abcdef',
        buckets: { quarantine: 'q-bkt', projects: 'p-bkt' }
      },
      billing: { enabled: true, allowDemoAccount: true }
    },
    {
      env: {
        ...process.env,
        PLAYHUB_R2_ACCESS_KEY_ID: 'test-r2-key',
        PLAYHUB_R2_SECRET_ACCESS_KEY: 'test-r2-secret'
      }
    }
  );
  await app.close();

  const liveDbPath = path.join(workDir, 'data', 'platform.sqlite');
  const db = new DatabaseSync(liveDbPath);
  try {
    db.exec('PRAGMA foreign_keys=ON');
    // Seed users + identities + open/closed play_sessions
    db.prepare('INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)').run('u_real_1', 'registered', '김실명', nowMs - 50000);
    db.prepare('INSERT INTO identities(provider, subject, user_id) VALUES(?,?,?)').run('google', 'google-sub-real-123', 'u_real_1');
    db.prepare(
      'INSERT INTO play_sessions(id, session_hash, principal_id, subject_id, game_id, build_id, started_at, ended_at, expires_at, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,?)'
    ).run('ps_open_1', 'live_cookie_hash_secret_1', 'u_real_1', 's1', 'g1', 'b1', nowMs - 1000, null, nowMs + 3600000, 'live');
    db.prepare(
      'INSERT INTO play_sessions(id, session_hash, principal_id, subject_id, game_id, build_id, started_at, ended_at, expires_at, traffic_type) VALUES(?,?,?,?,?,?,?,?,?,?)'
    ).run('ps_closed_1', 'live_cookie_hash_secret_2', 'u_real_1', 's1', 'g1', 'b1', nowMs - 2000, nowMs - 500, nowMs + 3600000, 'live');

    // Seed owner_key, cdn owner, admin actor IDs
    const liveOwnerKey = 'g_unsalted_google_sub_hash_abc';
    db.prepare(
      "INSERT INTO creator_submissions(id, owner_key, owner_id, project_id, release_id, release_revision, release_label, title, description, status, revision, created_at, updated_at) VALUES('sub_1', ?, 'u_real_1', 'proj_1', 'rel_1', 1, 'v1.0.0', 'My Game', 'Desc', 'approved', 1, ?, ?)"
    ).run(liveOwnerKey, nowMs, nowMs);
    db.prepare(
      "INSERT INTO submission_checklists(submission_id, submission_revision, checklist_version, items_json, updated_by, updated_at) VALUES('sub_1', 1, 'v1', '[]', 'admin_alice', ?)"
    ).run(nowMs);
    db.prepare(
      "INSERT INTO hub_publications(game_id, host_slug, owner_key, owner_id, project_id, active_release_id, visibility, deploy_mode, status, unpublished_by, artifact_sha256, artifact_base_url, manifest_json, deploy_profile_json, cas_version, published_at, updated_at) VALUES('g1', 'slug-g1', ?, 'u_real_1', 'proj_1', 'rel_1', 'public', 'singleplay', 'published', 'admin_bob', 'sha', 'https://live.example.com/g/g1', '{}', '{}', 1, ?, ?)"
    ).run(liveOwnerKey, nowMs, nowMs);
    db.prepare(
      "INSERT INTO hub_publication_history(id, game_id, from_release_id, to_release_id, action, actor_id, reason, cas_version, created_at) VALUES('h1', 'g1', NULL, 'rel_1', 'publish', 'admin_alice', 'ok', 1, ?)"
    ).run(nowMs);
    db.prepare("INSERT INTO l10n_keys(key, namespace, source_text, source_hash, revision, updated_at) VALUES('ui.ok', 'ui', 'OK', 'h1', 1, ?)").run(nowMs);
    db.prepare("INSERT INTO l10n_translations(key, locale, value, status, updated_by, updated_at) VALUES('ui.ok', 'ko', '확인', 'approved', 'admin_l10n', ?)").run(nowMs);
    db.prepare("INSERT INTO l10n_releases(version, tag, sha256, key_count, media_count, coverage_json, bundle_json, is_active, created_by, created_at) VALUES(1, 'v1', 'sha', 1, 0, '{}', '{}', 1, 'admin_l10n', ?)").run(nowMs);

    // Seed CDN tables
    db.prepare("INSERT INTO cdn_storage(owner, plan, used_bytes, reserved_bytes, updated_at) VALUES(?, 'free', 100, 0, ?)").run(liveOwnerKey, nowMs);
    db.prepare("INSERT INTO cdn_projects(id, owner, host_slug, name, created_at, updated_at) VALUES('p1', ?, 'slug-p1', 'Proj', ?, ?)").run(liveOwnerKey, nowMs, nowMs);
    db.prepare("INSERT INTO cdn_blobs(id, owner, kind, sha256, bytes, object_key, state, ref_count, lease_until, created_at, state_at) VALUES('bl1', ?, 'manifest', 'abc', 10, 'm/abc/manifest.json', 'LIVE', 1, 0, ?, ?)").run(liveOwnerKey, nowMs, nowMs);
    db.prepare("INSERT INTO cdn_commits(id, project_id, manifest_blob_id, manifest_sha256, file_count, total_bytes, author, message, created_at) VALUES('cm1', 'p1', 'bl1', 'abc', 1, 10, 'real_author_email@example.com', 'init', ?)").run(nowMs);

    // Seed Avatar tables (keep wallets/inventory/loadouts; drop ledger & purchase_idempotency)
    db.prepare("INSERT INTO avatar_wallets(principal_id, paid_balance, bonus_balance, promo_balance, updated_at) VALUES('u_real_1', 500, 50, 0, ?)").run(nowMs);
    db.prepare("INSERT INTO avatar_wallet_ledger(id, principal_id, delta_paid, delta_bonus, delta_promo, kind, ref_id, idempotency_key, created_at) VALUES('al1', 'u_real_1', 500, 0, 0, 'topup', 'r1', 'ik1', ?)").run(nowMs);
    db.prepare("INSERT INTO avatar_inventory(principal_id, item_id, category, acquired_via, price_paid, acquired_at) VALUES('u_real_1', 'hat_1', 'attachment', 'shop', 100, ?)").run(nowMs);
    db.prepare("INSERT INTO avatar_loadouts(principal_id, skin_id, attachments_json, emote_wheel_json, revision, updated_at) VALUES('u_real_1', 'skin_1', '[]', '[]', 1, ?)").run(nowMs);
    db.prepare("INSERT INTO avatar_purchase_idempotency(principal_id, idempotency_key, request_hash, response_json, created_at) VALUES('u_real_1', 'ap1', 'rh', '{}', ?)").run(nowMs);

    // Seed EOS SSOT tables (sanctions/submissions/idempotency dropped; boards/entries/datastore kept with actor pseudonymized)
    db.prepare("INSERT INTO leaderboard_boards(game_id, board_key, created_at, updated_at) VALUES('g1', 'high', ?, ?)").run(nowMs, nowMs);
    db.prepare("INSERT INTO leaderboard_entries(game_id, board_key, period_key, principal_id, score, sort_score, achieved_at, updated_at) VALUES('g1', 'high', 'all', 'u_real_1', 999, 999, ?, ?)").run(nowMs, nowMs);
    db.prepare("INSERT INTO leaderboard_submissions(id, game_id, board_key, period_key, principal_id, request_key, request_hash, raw_score, accepted, response_json, created_at) VALUES('ls1', 'g1', 'high', 'all', 'u_real_1', 'rk1', 'rh1', 999, 1, '{}', ?)").run(nowMs);
    db.prepare("INSERT INTO user_sanctions(id, principal_id, scope, action, reason, evidence_json, active, created_by, created_at, eos_target_puid) VALUES('san1', 'u_real_1', 'all', 'ban', 'sensitive PII report', '{\"ip\":\"1.2.3.4\"}', 1, 'mod_dave', ?, 'puid_secret_123')").run(nowMs);
    db.prepare("INSERT INTO progression_idempotency(game_id, principal_id, request_key, request_hash, response_json, created_at) VALUES('g1', 'u_real_1', 'pk1', 'rh', '{}', ?)").run(nowMs);
    db.prepare("INSERT INTO datastore_entries(game_id, scope, entry_key, owner_principal_id, revision, value_json, bytes, etag, fencing_token, lock_holder, lock_expires_at, updated_by, created_at, updated_at) VALUES('g1', 'world', 'k1', 'u_real_1', 1, '{}', 2, 'e1', 1, 'live-server-1', ?, 'admin_ops', ?, ?)").run(nowMs + 5000, nowMs, nowMs);

    // Seed Billing tables (sensitive payment/giftcard PIN/Stripe Connect dropped in FK order; SKUs/creator_products/spending_limits kept)
    db.prepare("INSERT INTO billing_orders(id, principal_id, channel, provider, sku_id, currency, amount_minor, base_coins, bonus_coins, bonus_bps, state, provider_payment_id, idempotency_key, created_at, updated_at) VALUES('ord1', 'u_real_1', 'web_browser', 'xsolla', 'pc_100', 'KRW', 1000, 100, 25, 2500, 'PAID', 'xsolla_live_pay_1', 'ord-ik-1', ?, ?)").run(nowMs, nowMs);
    db.prepare("INSERT INTO billing_giftcard_batches(id, channel, partner_name, currency, face_value_minor, base_coins, bonus_bps, quantity, state, created_by, created_at) VALUES('gb1', 'gift_card_retail', 'CU', 'KRW', 10000, 1000, 0, 1, 'ACTIVE', 'admin_finance', ?)").run(nowMs);
    db.prepare("INSERT INTO billing_giftcards(id, batch_id, serial_no, pin_hash, pin_hint, currency, face_value_minor, state, redeemed_by, redeemed_order_id) VALUES('gc1', 'gb1', 'SER-001', 'secret_pin_hmac_hash', '****-1234', 'KRW', 10000, 'REDEEMED', 'u_real_1', 'ord1')").run();
    db.prepare("INSERT INTO billing_creator_connections(principal_id, provider, connected_account_id, onboarding_status, country_code, platform_fee_bps, updated_at) VALUES('u_real_1', 'stripe_connect', 'acct_live_secret_123', 'ACTIVE', 'KR', 0, ?)").run(nowMs);
    db.prepare("INSERT INTO billing_creator_products(id, creator_id, game_id, product_key, kind, title, currency, amount_minor, status, created_at, updated_at) VALUES('cp1', 'u_real_1', 'g1', 'vip', 'pass', 'VIP', 'KRW', 5000, 'ACTIVE', ?, ?)").run(nowMs, nowMs);
    db.prepare("INSERT INTO billing_direct_orders(id, buyer_id, creator_id, product_id, game_id, platform, provider, connected_account_id, provider_charge_id, payment_intent_id, charge_id, currency, amount_minor, platform_fee_minor, state, idempotency_key, created_at, updated_at) VALUES('do1', 'u_real_1', 'u_real_1', 'cp1', 'g1', 'web', 'stripe_connect', 'acct_live_secret_123', 'ch_live_1', 'pi_live_1', 'ch_live_1', 'KRW', 5000, 0, 'PAID', 'do-ik-1', ?, ?)").run(nowMs, nowMs);
    db.prepare("INSERT INTO billing_entitlements(id, buyer_id, creator_id, game_id, product_id, product_key, direct_order_id, state, granted_at, updated_at) VALUES('be1', 'u_real_1', 'u_real_1', 'g1', 'cp1', 'vip', 'do1', 'ACTIVE', ?, ?)").run(nowMs, nowMs);
    db.prepare("INSERT INTO billing_spending_limits(principal_id, age_tier, monthly_cap_minor, daily_cap_minor, guardian_approved, updated_by, updated_at) VALUES('u_real_1', 'ADULT', 1000000, 500000, 0, 'admin_compliance', ?)").run(nowMs);
  } finally {
    db.close();
  }

  try {
    // Part A: Pure integrated createApp() DB (81 tables) passes BOTH sanitizeSnapshot AND restore-data inspectDatabase!
    const out1 = path.join(outDir, 'integrated-sanitized.sqlite');
    const report1 = await sanitizeSnapshot({
      from: liveDbPath,
      out: out1,
      sourceEnv: 'live',
      targetEnv: 'dev',
      salt: 'integrated-test-salt',
      eventsDays: 7,
      now: () => nowMs
    });
    assert.equal(report1.ok, true);
    assert.equal(report1.integrity, 'ok');
    assert.equal(report1.foreignKeys, 'ok');

    const inspected1 = inspectDatabase(out1);
    assert.equal(inspected1.integrity, 'ok');
    assert.equal(inspected1.foreignKeys, 'ok');

    const checkDb = new DatabaseSync(out1, { readOnly: true });
    try {
      // Sensitive billing, avatar ledger, sanctions, submissions wiped
      for (const tbl of [
        'billing_orders', 'billing_giftcards', 'billing_giftcard_batches',
        'billing_creator_connections', 'billing_direct_orders', 'billing_entitlements',
        'avatar_wallet_ledger', 'avatar_purchase_idempotency',
        'user_sanctions', 'leaderboard_submissions', 'progression_idempotency'
      ]) {
        assert.equal(checkDb.prepare(`SELECT count(*) n FROM ${tbl}`).get().n, 0, `${tbl} must be wiped`);
      }

      // Safe catalog & non-sensitive tables preserved
      assert.equal(checkDb.prepare('SELECT count(*) n FROM avatar_wallets').get().n, 1);
      assert.equal(checkDb.prepare('SELECT count(*) n FROM billing_creator_products').get().n, 1);
      assert.equal(checkDb.prepare('SELECT count(*) n FROM leaderboard_entries').get().n, 1);

      // play_sessions.session_hash re-salted & open sessions closed
      const psOpen = checkDb.prepare("SELECT session_hash, ended_at, paused FROM play_sessions WHERE id='ps_open_1'").get();
      assert.notEqual(psOpen.session_hash, 'live_cookie_hash_secret_1');
      assert.match(psOpen.session_hash, /^sanitized_sess_[a-f0-9]{16}$/);
      assert.equal(psOpen.ended_at, nowMs);
      assert.equal(psOpen.paused, 1);
      const psClosed = checkDb.prepare("SELECT session_hash, ended_at FROM play_sessions WHERE id='ps_closed_1'").get();
      assert.match(psClosed.session_hash, /^sanitized_sess_[a-f0-9]{16}$/);
      assert.equal(psClosed.ended_at, nowMs - 500);

      // owner_key & cdn owner deterministically HMAC-pseudonymized across tables
      const subOwner = checkDb.prepare("SELECT owner_key FROM creator_submissions WHERE id='sub_1'").get().owner_key;
      const pubRow = checkDb.prepare("SELECT owner_key, unpublished_by FROM hub_publications WHERE game_id='g1'").get();
      const cdnStorageOwner = checkDb.prepare('SELECT owner FROM cdn_storage').get().owner;
      const cdnProjOwner = checkDb.prepare("SELECT owner FROM cdn_projects WHERE id='p1'").get().owner;
      assert.match(subOwner, /^owner_[a-f0-9]{16}$/);
      assert.equal(pubRow.owner_key, subOwner);
      assert.equal(cdnStorageOwner, subOwner);
      assert.equal(cdnProjOwner, subOwner);

      // Admin / actor IDs HMAC-pseudonymized & datastore lock cleared
      const checklistActor = checkDb.prepare("SELECT updated_by FROM submission_checklists WHERE submission_id='sub_1'").get().updated_by;
      const pubHistActor = checkDb.prepare("SELECT actor_id FROM hub_publication_history WHERE id='h1'").get().actor_id;
      const l10nTransActor = checkDb.prepare("SELECT updated_by FROM l10n_translations WHERE key='ui.ok'").get().updated_by;
      const l10nRelActor = checkDb.prepare("SELECT created_by FROM l10n_releases WHERE version=1").get().created_by;
      const spendLimitActor = checkDb.prepare("SELECT updated_by FROM billing_spending_limits WHERE principal_id='u_real_1'").get().updated_by;
      const dsRow = checkDb.prepare("SELECT updated_by, lock_holder, lock_expires_at FROM datastore_entries WHERE game_id='g1'").get();
      const commitAuthor = checkDb.prepare("SELECT author FROM cdn_commits WHERE id='cm1'").get().author;
      assert.match(checklistActor, /^actor_[a-f0-9]{16}$/);
      assert.equal(checklistActor, pubHistActor); // same admin_alice -> deterministic match
      assert.match(pubRow.unpublished_by, /^actor_[a-f0-9]{16}$/);
      assert.notEqual(pubRow.unpublished_by, checklistActor);
      assert.match(l10nTransActor, /^actor_[a-f0-9]{16}$/);
      assert.equal(l10nTransActor, l10nRelActor); // same admin_l10n
      assert.match(spendLimitActor, /^actor_[a-f0-9]{16}$/);
      assert.match(dsRow.updated_by, /^actor_[a-f0-9]{16}$/);
      assert.equal(dsRow.lock_holder, null);
      assert.equal(dsRow.lock_expires_at, null);
      assert.match(commitAuthor, /^actor_[a-f0-9]{16}$/);
    } finally {
      checkDb.close();
    }

    // Part B: Same integrated DB + Apple IAP 7 tables (88 tables total) also passes sanitizeSnapshot cleanly!
    const iapDb = new DatabaseSync(liveDbPath);
    try {
      ensureAppleIapWalletSchema(iapDb);
      iapDb.prepare("INSERT INTO iap_products(sku, platform, store_product_id, kind, coin_amount, active) VALUES('c1', 'apple', 'com.x.c1', 'consumable', 100, 1)").run();
      iapDb.prepare("INSERT INTO iap_transactions(id, principal_id, platform, environment, sku, store_tx_id, state, raw_receipt_hash, created_at, updated_at) VALUES('itx1', 'u_real_1', 'apple', 'Production', 'c1', 'stx1', 'GRANTED', 'rh', ?, ?)").run(nowMs, nowMs);
      iapDb.prepare("INSERT INTO iap_webhook_events(id, platform, event_uuid, event_type, payload_hash, processed_at) VALUES('iw1', 'apple', 'uuid1', 'REFUND', 'ph', ?)").run(nowMs);
      iapDb.prepare("INSERT INTO player_wallet_accounts(principal_id, balance, clawback_deficit, updated_at) VALUES('u_real_1', 100, 0, ?)").run(nowMs);
    } finally {
      iapDb.close();
    }

    const out2 = path.join(outDir, 'integrated-plus-iap-sanitized.sqlite');
    const report2 = await sanitizeSnapshot({
      from: liveDbPath,
      out: out2,
      sourceEnv: 'live',
      targetEnv: 'dev',
      salt: 'integrated-test-salt',
      eventsDays: 7,
      now: () => nowMs
    });
    assert.equal(report2.ok, true);
    assert.equal(report2.integrity, 'ok');
    assert.equal(report2.foreignKeys, 'ok');

    const checkIapDb = new DatabaseSync(out2, { readOnly: true });
    try {
      assert.equal(checkIapDb.prepare('SELECT count(*) n FROM iap_products').get().n, 1);
      assert.equal(checkIapDb.prepare('SELECT count(*) n FROM iap_transactions').get().n, 0);
      assert.equal(checkIapDb.prepare('SELECT count(*) n FROM iap_webhook_events').get().n, 0);
      assert.equal(checkIapDb.prepare('SELECT count(*) n FROM player_wallet_accounts').get().n, 0);
    } finally {
      checkIapDb.close();
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
