import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { ensureMobileSchema } from '../server/mobile/schema.mjs';
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
