import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createBackup } from '../tools/backup.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

const userOrigin = 'http://127.0.0.1:8080';
const adminOrigin = 'http://127.0.0.1:8081';
const password = 'isolated-test-password';
const internalSecret = 's'.repeat(40);

class Client {
  constructor(port, origin) {
    this.port = port;
    this.origin = origin;
    this.jar = new Map();
    this.csrf = null;
  }

  headers(method, hasBody, csrf = true, extra = {}) {
    const headers = { ...(this.origin ? { Origin: this.origin } : {}), ...extra };
    if (this.jar.size) headers.Cookie = [...this.jar.values()].join('; ');
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (csrf && this.csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    return headers;
  }

  async call(target, { method = 'GET', body, csrf = true, headers = {} } = {}) {
    const response = await fetch('http://127.0.0.1:' + this.port + target, {
      method,
      headers: this.headers(method, body !== undefined, csrf, headers),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const token = value.split(';')[0];
      this.jar.set(token.split('=')[0], token);
    }
    const data = await response.json();
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, headers: response.headers, data };
  }
}

async function fixture(t, initialTime = Date.UTC(2026, 10, 21, 15, 0, 0)) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-ssot-p2-'));
  const dataDir = path.join(root, 'data');
  const configPath = path.join(root, 'config.json');
  const entries = ['one', 'two'].map(id => ({ id, path: 'games/' + id, enabled: true }));
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.writeFileSync(path.join(root, 'catalog/games.json'), JSON.stringify({ schemaVersion: 1, entries }));
  for (const { id, path: relative } of entries) {
    fs.mkdirSync(path.join(root, relative), { recursive: true });
    fs.writeFileSync(path.join(root, relative, 'game.manifest.json'), JSON.stringify({ id, entry: 'index.html', title: { en: id } }));
  }
  const salt = 'c'.repeat(32);
  const config = {
    publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0,
    userOrigins: [userOrigin], adminOrigins: [adminOrigin], userBaseUrl: userOrigin, dataDir,
    admin: { username: 'admin', salt, passwordHash: scryptSync(password, salt, 64).toString('hex') },
    forge: { internalSecret },
  };
  fs.writeFileSync(configPath, JSON.stringify(config));
  let nowMs = initialTime;
  const clock = () => { nowMs += 10; return nowMs; };
  const app = createApp(config, { rootDir: root, clock });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  const { public: publicServer, admin: adminServer } = await app.listen();
  return {
    root, configPath, config, app, db: app.db,
    now: () => nowMs,
    setNow: ms => { nowMs = ms; },
    visitor: () => new Client(publicServer.port, userOrigin),
    admin: new Client(adminServer.port, adminOrigin),
    internal: new Client(adminServer.port, null),
    publicRaw: new Client(publicServer.port, null),
  };
}

async function loginAdmin(admin) {
  assert.equal((await admin.call('/api/admin/session')).status, 200);
  assert.equal((await admin.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })).status, 200);
}

async function startPlay(client, gameId = 'one') {
  assert.equal((await client.call('/api/session')).status, 200);
  const play = await client.call('/api/play-sessions', { method: 'POST', body: { gameId } });
  assert.equal(play.status, 201, JSON.stringify(play.data));
  return play.data.id;
}

test('progression SSOT: stats aggregation, auto-threshold & hidden achievements, idempotency, and guest merge', async t => {
  const f = await fixture(t);
  await loginAdmin(f.admin);

  // Admin configures a sum stat (kills, maxDelta=50) + threshold achievement + hidden manual achievement
  assert.equal((await f.admin.call('/api/admin/games/one/stats/kills', {
    method: 'PUT', body: { aggMode: 'sum', minValue: 0, maxValue: 100000, maxDelta: 50 },
  })).status, 201);
  assert.equal((await f.admin.call('/api/admin/games/one/achievements/slayer_10', {
    method: 'PUT', body: { title: 'Slayer', description: 'Defeat 10 foes', statKey: 'kills', threshold: 10, points: 25 },
  })).status, 201);
  assert.equal((await f.admin.call('/api/admin/games/one/achievements/secret_room', {
    method: 'PUT', body: { title: 'Secret Finder', description: 'Found the hidden vault', hidden: true, points: 50 },
  })).status, 201);

  // Anonymous read masks hidden achievement title & description
  const anonView = await f.visitor().call('/api/games/one/progression');
  assert.equal(anonView.status, 200);
  assert.equal(anonView.data.stats, null);
  const hiddenEntry = anonView.data.achievements.find(a => a.achievementKey === 'secret_room');
  assert.equal(hiddenEntry.title, 'Hidden Achievement');
  assert.equal(hiddenEntry.description, '');

  const guest = f.visitor();
  const playId = await startPlay(guest, 'one');

  // Exceeding maxDelta is rejected
  const overDelta = await guest.call('/api/games/one/stats', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'stat-delta-over-01' },
    body: { playSessionId: playId, updates: [{ statKey: 'kills', value: 999 }] },
  });
  assert.equal(overDelta.status, 422);
  assert.equal(overDelta.data.error.code, 'STAT_DELTA_EXCEEDED');

  // First stat increment (6 kills) -> no unlock yet
  const s1 = await guest.call('/api/games/one/stats', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'stat-kills-run-001' },
    body: { playSessionId: playId, updates: [{ statKey: 'kills', value: 6 }] },
  });
  assert.equal(s1.status, 201);
  assert.equal(s1.data.stats.kills, 6);
  assert.equal(s1.data.newlyUnlocked.length, 0);

  // Exact idempotent replay does not double-count kills
  const replay = await guest.call('/api/games/one/stats', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'stat-kills-run-001' },
    body: { playSessionId: playId, updates: [{ statKey: 'kills', value: 6 }] },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.idempotentReplay, true);
  assert.equal(replay.data.stats.kills, 6);

  // Manual unlock of hidden achievement reveals title/description to owner
  const unlocked = await guest.call('/api/games/one/achievements/secret_room/unlock', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ach-secret-run-001' },
    body: { playSessionId: playId },
  });
  assert.equal(unlocked.status, 201);
  assert.equal(unlocked.data.newlyUnlocked, true);

  // Manual unlock on a stat-driven achievement is rejected (409)
  const badManual = await guest.call('/api/games/one/achievements/slayer_10/unlock', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ach-slayer-bad-001' },
    body: { playSessionId: playId },
  });
  assert.equal(badManual.status, 409);

  // Merge guest (6 kills + secret_room) into account (5 kills) -> combined 11 kills auto-unlocks slayer_10!
  const guestId = f.db.prepare("SELECT id FROM users WHERE kind='guest'").get().id;
  const account = f.visitor();
  await account.call('/api/session');
  const accountId = 'registered-prog-1';
  f.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?, 'registered', 'Hero', ?)").run(accountId, f.now());
  f.db.prepare("UPDATE sessions SET principal_id=? WHERE principal_id IS NULL").run(accountId);
  f.db.prepare("INSERT INTO player_stats VALUES('one','kills',?,5,1,'live',NULL,?)").run(accountId, f.now());
  f.db.prepare("INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)").run('merge-prog-1', guestId, accountId, 's1', 't1', 'pending', f.now() + 60000, null);
  const merged = await account.call('/api/auth/merge', { method: 'POST', body: { consent: true, mergeId: 'merge-prog-1' } });
  assert.equal(merged.status, 200, JSON.stringify(merged.data));

  const prog = await account.call('/api/games/one/progression');
  assert.equal(prog.status, 200);
  assert.equal(prog.data.stats.kills.value, 11);
  const slayer = prog.data.achievements.find(a => a.achievementKey === 'slayer_10');
  const secret = prog.data.achievements.find(a => a.achievementKey === 'secret_room');
  assert.equal(slayer.unlocked, true);
  assert.equal(secret.unlocked, true);
  assert.equal(secret.title, 'Secret Finder');
});

test('MMO DataStore SSOT: internal auth boundary, CAS revision, fencing-token session lock against zombie servers, quotas, and backup', async t => {
  const f = await fixture(t);
  await loginAdmin(f.admin);
  const secretHeader = { 'X-PlayHub-Internal-Secret': internalSecret };
  const keyBase = '/internal/v1/datastore/games/one/scopes/player/keys/inv_u1';

  // Public listener rejects /internal/v1/datastore/* with 404
  assert.equal((await f.publicRaw.call(keyBase, { headers: secretHeader })).status, 404);
  // Missing or wrong internal secret rejected with 403
  assert.equal((await f.internal.call(keyBase)).status, 403);
  // Browser Origin header forbidden on internal endpoint
  assert.equal((await f.internal.call(keyBase, { headers: { ...secretHeader, Origin: userOrigin } })).status, 403);

  // Server A acquires session lock on missing player inventory (creates rev 1, fencingToken 1)
  const lockA = await f.internal.call(`${keyBase}/lock`, {
    method: 'POST',
    headers: secretHeader,
    body: { holderId: 'zone-usw1-a', leaseMs: 10000, initialValue: { gold: 100, items: ['sword'] } },
  });
  assert.equal(lockA.status, 201, JSON.stringify(lockA.data));
  assert.equal(lockA.data.fencingToken, 1);
  assert.equal(lockA.data.entry.revision, 1);

  // Server B cannot acquire lock while Server A lease is active (423 LOCK_HELD)
  const lockBBlocked = await f.internal.call(`${keyBase}/lock`, {
    method: 'POST',
    headers: secretHeader,
    body: { holderId: 'zone-usw1-b', leaseMs: 10000 },
  });
  assert.equal(lockBBlocked.status, 423);
  assert.equal(lockBBlocked.data.error.code, 'DATASTORE_LOCK_HELD');

  // Server A writes with valid fencingToken + If-Match CAS -> rev 2
  const writeA = await f.internal.call(keyBase, {
    method: 'PUT',
    headers: { ...secretHeader, 'If-Match': '"r1"' },
    body: { holderId: 'zone-usw1-a', fencingToken: 1, value: { gold: 250, items: ['sword', 'potion'] } },
  });
  assert.equal(writeA.status, 200, JSON.stringify(writeA.data));
  assert.equal(writeA.data.entry.revision, 2);
  assert.equal(writeA.headers.get('etag'), '"r2"');

  // Stale If-Match revision fails with 412 REVISION_CONFLICT
  const staleRev = await f.internal.call(keyBase, {
    method: 'PUT',
    headers: { ...secretHeader, 'If-Match': '"r1"' },
    body: { holderId: 'zone-usw1-a', fencingToken: 1, value: { gold: 999 } },
  });
  assert.equal(staleRev.status, 412);

  // Simulate Server A stall past lease expiry: Server B takes over lock -> fencingToken advances to 2
  f.setNow(f.now() + 15000);
  const lockB = await f.internal.call(`${keyBase}/lock`, {
    method: 'POST',
    headers: secretHeader,
    body: { holderId: 'zone-usw1-b', leaseMs: 10000 },
  });
  assert.equal(lockB.status, 200);
  assert.equal(lockB.data.fencingToken, 2);

  // Server B saves new inventory and atomically releases lock in one call -> rev 3, fencingToken bumps to 3
  const writeB = await f.internal.call(keyBase, {
    method: 'PUT',
    headers: secretHeader,
    body: { holderId: 'zone-usw1-b', fencingToken: 2, expectedRevision: 2, value: { gold: 500, items: ['shield'] }, releaseLock: true },
  });
  assert.equal(writeB.status, 200);
  assert.equal(writeB.data.entry.revision, 3);
  assert.equal(writeB.data.entry.locked, false);
  assert.equal(writeB.data.entry.fencingToken, 3);

  // Zombie Server A (token 1) and released Server B (stale token 2) cannot overwrite (no item dupe!)
  const zombieWrite = await f.internal.call(keyBase, {
    method: 'PUT',
    headers: secretHeader,
    body: { holderId: 'zone-usw1-a', fencingToken: 1, value: { gold: 1000000 } },
  });
  assert.equal(zombieWrite.status, 409);
  assert.equal(zombieWrite.data.error.code, 'DATASTORE_FENCING_TOKEN_STALE');
  const staleBWrite = await f.internal.call(keyBase, {
    method: 'PUT',
    headers: secretHeader,
    body: { holderId: 'zone-usw1-b', fencingToken: 2, value: { gold: 999999 } },
  });
  assert.equal(staleBWrite.status, 409);
  assert.equal(staleBWrite.data.error.code, 'DATASTORE_FENCING_TOKEN_STALE');

  // Admin tightens per-game quota -> oversized write rejected with 413
  assert.equal((await f.admin.call('/api/admin/games/one/datastore/quota', {
    method: 'PUT', body: { maxKeys: 10, maxValueBytes: 128, maxTotalBytes: 2048 },
  })).status, 200);
  const tooBig = await f.internal.call('/internal/v1/datastore/games/one/scopes/world/keys/chunk_0_0', {
    method: 'PUT',
    headers: secretHeader,
    body: { value: { blob: 'x'.repeat(200) } },
  });
  assert.equal(tooBig.status, 413);

  // Admin stats reflect entries, active locks, and archived versions (rev 1 & rev 2 archived)
  const stats = await f.admin.call('/api/admin/games/one/datastore/stats');
  assert.equal(stats.status, 200);
  assert.equal(stats.data.keyCount, 1);
  assert.equal(stats.data.archivedVersions, 2);

  // Admin force-unlock bumps fencing token so previous holder cannot write back
  const lockC = await f.internal.call(`${keyBase}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-usw1-c', leaseMs: 30000 },
  });
  assert.equal(lockC.data.fencingToken, 4);
  const forced = await f.admin.call('/api/admin/games/one/datastore/scopes/player/keys/inv_u1/force-unlock', {
    method: 'POST', body: { reason: 'Server C crashed' },
  });
  assert.equal(forced.status, 200);
  assert.equal(forced.data.entry.locked, false);
  assert.equal(forced.data.entry.fencingToken, 5);

  const afterForce = await f.internal.call(keyBase, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-usw1-c', fencingToken: 4, value: { gold: 0 } },
  });
  assert.equal(afterForce.status, 409);

  // Prefix scan & backup/restore verification pass cleanly with all Phase 1 + Phase 2 SSOT tables
  const listed = await f.internal.call('/internal/v1/datastore/games/one/scopes/player/keys?prefix=inv', { headers: secretHeader });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.total, 1);

  const backup = await createBackup({ configPath: f.configPath, out: path.join(f.root, 'p2-backup.sqlite') });
  const inspected = inspectDatabase(backup.path);
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');
});

test('MMO DataStore internal auth is fail-closed when unconfigured and honors dedicated datastore secret over forge fallback', async t => {
  async function startWith(configOverrides, env = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-ssot-ds-auth-'));
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(path.join(root, 'catalog'));
    fs.writeFileSync(path.join(root, 'catalog/games.json'), JSON.stringify({ schemaVersion: 1, entries: [{ id: 'one', path: 'games/one', enabled: true }] }));
    fs.mkdirSync(path.join(root, 'games/one'), { recursive: true });
    fs.writeFileSync(path.join(root, 'games/one/game.manifest.json'), JSON.stringify({ id: 'one', entry: 'index.html', title: { en: 'one' } }));
    const salt = 'd'.repeat(32);
    const config = {
      publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0,
      userOrigins: [userOrigin], adminOrigins: [adminOrigin], userBaseUrl: userOrigin, dataDir,
      admin: { username: 'admin', salt, passwordHash: scryptSync(password, salt, 64).toString('hex') },
      ...configOverrides,
    };
    const app = createApp(config, { rootDir: root, env });
    t.after(async () => {
      await app.close();
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    });
    const { admin } = await app.listen();
    return new Client(admin.port, null);
  }

  // 1. No secret configured anywhere -> fail-closed 503
  const noSecretClient = await startWith({});
  const unconfigured = await noSecretClient.call('/internal/v1/datastore/games/one/scopes/player/keys');
  assert.equal(unconfigured.status, 503);
  assert.equal(unconfigured.data.error.code, 'INTERNAL_SECRET_NOT_CONFIGURED');
  const unconfiguredWithHeader = await noSecretClient.call('/internal/v1/datastore/games/one/scopes/player/keys', {
    headers: { 'X-PlayHub-Internal-Secret': 'a'.repeat(40) },
  });
  assert.equal(unconfiguredWithHeader.status, 503);
  assert.equal(unconfiguredWithHeader.data.error.code, 'INTERNAL_SECRET_NOT_CONFIGURED');

  // 2. Dedicated config.datastore.internalSecret takes precedence over forge.internalSecret
  const dsSecret = 'd'.repeat(40);
  const fgSecret = 'f'.repeat(40);
  const dedicatedClient = await startWith({ datastore: { internalSecret: dsSecret }, forge: { internalSecret: fgSecret } });
  const rejectedForge = await dedicatedClient.call('/internal/v1/datastore/games/one/scopes/player/keys', {
    headers: { 'X-PlayHub-Internal-Secret': fgSecret },
  });
  assert.equal(rejectedForge.status, 403);
  assert.equal(rejectedForge.data.error.code, 'INTERNAL_SECRET_INVALID');
  const acceptedDedicated = await dedicatedClient.call('/internal/v1/datastore/games/one/scopes/player/keys', {
    headers: { 'X-PlayHub-Internal-Secret': dsSecret },
  });
  assert.equal(acceptedDedicated.status, 200);

  // 3. Dedicated PLAYHUB_DATASTORE_INTERNAL_SECRET env var works cleanly
  const envSecret = 'e'.repeat(40);
  const envClient = await startWith({}, { PLAYHUB_DATASTORE_INTERNAL_SECRET: envSecret });
  assert.equal((await envClient.call('/internal/v1/datastore/games/one/scopes/player/keys', {
    headers: { 'X-PlayHub-Internal-Secret': envSecret },
  })).status, 200);
});

test('MMO DataStore fencing hardening: unlock bump, same-holder crash separation, DELETE tombstone, and omitted-token rejection', async t => {
  const f = await fixture(t);
  await loginAdmin(f.admin);
  const secretHeader = { 'X-PlayHub-Internal-Secret': internalSecret };

  // A. Unprotected CAS-only key works without fencingToken and keeps monotonic revision across DELETE
  const casKey = '/internal/v1/datastore/games/one/scopes/world/keys/cas_only';
  const cas1 = await f.internal.call(casKey, { method: 'PUT', headers: secretHeader, body: { value: { v: 1 } } });
  assert.equal(cas1.status, 201);
  assert.equal(cas1.data.entry.revision, 1);
  assert.equal(cas1.data.entry.fencingToken, 0);

  const cas2 = await f.internal.call(casKey, {
    method: 'PUT', headers: { ...secretHeader, 'If-Match': '"r1"' }, body: { value: { v: 2 } },
  });
  assert.equal(cas2.status, 200);
  assert.equal(cas2.data.entry.revision, 2);

  const casDel = await f.internal.call(casKey, {
    method: 'DELETE', headers: { ...secretHeader, 'If-Match': '"r2"' },
  });
  assert.equal(casDel.status, 200);
  assert.equal(casDel.data.archivedRevision, 2);
  assert.equal((await f.internal.call(casKey, { headers: secretHeader })).status, 404);
  // Stale If-Match against deleted key fails 412
  assert.equal((await f.internal.call(casKey, {
    method: 'PUT', headers: { ...secretHeader, 'If-Match': '"r2"' }, body: { value: { v: 99 } },
  })).status, 412);
  // Recreating CAS key advances revision monotonically to 3 (never resets to 1)
  const cas3 = await f.internal.call(casKey, { method: 'PUT', headers: secretHeader, body: { value: { v: 3 } } });
  assert.equal(cas3.status, 201);
  assert.equal(cas3.data.entry.revision, 3);
  assert.equal(cas3.data.entry.fencingToken, 0);

  // B. Lock-protected key: same-holder renewal vs crash-reboot zombie separation
  const lockKey = '/internal/v1/datastore/games/one/scopes/player/keys/fenced_u1';
  const l1 = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-1', leaseMs: 10000, initialValue: { gold: 10 } },
  });
  assert.equal(l1.status, 201);
  assert.equal(l1.data.fencingToken, 1);
  assert.equal(l1.data.renewed, false);

  // Matching fencingToken from same active holder renews lease without bumping token
  const renew = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-1', leaseMs: 10000, fencingToken: 1 },
  });
  assert.equal(renew.status, 200);
  assert.equal(renew.data.fencingToken, 1);
  assert.equal(renew.data.renewed, true);

  // Same holderId without fencingToken (crash & reboot) MUST bump fencing_token -> 2
  const reboot = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-1', leaseMs: 10000 },
  });
  assert.equal(reboot.status, 200);
  assert.equal(reboot.data.fencingToken, 2);
  assert.equal(reboot.data.renewed, false);

  // Pre-crash zombie using token 1 is rejected
  const zombie1 = await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-1', fencingToken: 1, value: { gold: 999 } },
  });
  assert.equal(zombie1.status, 409);
  assert.equal(zombie1.data.error.code, 'DATASTORE_FENCING_TOKEN_STALE');

  // Same holderId with mismatched fencingToken also bumps -> 3
  const mismatchLock = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-1', leaseMs: 10000, fencingToken: 1 },
  });
  assert.equal(mismatchLock.status, 200);
  assert.equal(mismatchLock.data.fencingToken, 3);
  assert.equal(mismatchLock.data.renewed, false);

  // C. Explicit unlock bumps fencing_token (3 -> 4) and blocks both stale-token & omitted-token writes
  const unlocked = await f.internal.call(`${lockKey}/unlock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-1', fencingToken: 3 },
  });
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.data.fencingToken, 4);

  const staleAfterUnlock = await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-1', fencingToken: 3, value: { gold: 50 } },
  });
  assert.equal(staleAfterUnlock.status, 409);
  assert.equal(staleAfterUnlock.data.error.code, 'DATASTORE_FENCING_TOKEN_STALE');

  const omittedAfterUnlock = await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-1', value: { gold: 50 } },
  });
  assert.equal(omittedAfterUnlock.status, 409);
  assert.equal(omittedAfterUnlock.data.error.code, 'DATASTORE_FENCING_TOKEN_REQUIRED');

  const omittedDel = await f.internal.call(lockKey, { method: 'DELETE', headers: secretHeader });
  assert.equal(omittedDel.status, 409);
  assert.equal(omittedDel.data.error.code, 'DATASTORE_FENCING_TOKEN_REQUIRED');

  // D. Expired lease rejects expired holder even before anyone else re-locks
  const l5 = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-2', leaseMs: 5000 },
  });
  assert.equal(l5.data.fencingToken, 5);
  f.setNow(f.now() + 10000);
  const expiredWrite = await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-2', fencingToken: 5, value: { gold: 77 } },
  });
  assert.equal(expiredWrite.status, 409);
  assert.equal(expiredWrite.data.error.code, 'DATASTORE_LOCK_EXPIRED');

  // E. DELETE creates tombstone preserving monotonic revision & fencing_token
  const l6 = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-3', leaseMs: 10000 },
  });
  assert.equal(l6.data.fencingToken, 6);
  const w6 = await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-3', fencingToken: 6, value: { gold: 123 } },
  });
  assert.equal(w6.status, 200);
  assert.equal(w6.data.entry.revision, 2);

  const delLocked = await f.internal.call(lockKey, {
    method: 'DELETE', headers: secretHeader, body: { holderId: 'zone-3', fencingToken: 6 },
  });
  assert.equal(delLocked.status, 200);
  assert.equal(delLocked.data.archivedRevision, 2);
  assert.equal(delLocked.data.fencingToken, 7);

  // Deleted key is invisible to GET, list, and stats keyCount
  assert.equal((await f.internal.call(lockKey, { headers: secretHeader })).status, 404);
  const listedPlayer = await f.internal.call('/internal/v1/datastore/games/one/scopes/player/keys', { headers: secretHeader });
  assert.equal(listedPlayer.data.total, 0);
  const stats = await f.admin.call('/api/admin/games/one/datastore/stats');
  assert.equal(stats.data.keyCount, 1); // only cas_only is live

  // Zombie cannot resurrect deleted lock-protected key with old token OR without token
  assert.equal((await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { holderId: 'zone-3', fencingToken: 6, value: { gold: 0 } },
  })).data.error.code, 'DATASTORE_FENCING_TOKEN_STALE');
  assert.equal((await f.internal.call(lockKey, {
    method: 'PUT', headers: secretHeader, body: { value: { gold: 0 } },
  })).data.error.code, 'DATASTORE_FENCING_TOKEN_REQUIRED');

  // Lock with createIfMissing: false sees 404; createIfMissing: true resurrects with rev 3 & fencingToken 8!
  assert.equal((await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-4', createIfMissing: false },
  })).status, 404);
  const resurrected = await f.internal.call(`${lockKey}/lock`, {
    method: 'POST', headers: secretHeader, body: { holderId: 'zone-4', leaseMs: 10000, initialValue: { gold: 5 } },
  });
  assert.equal(resurrected.status, 201);
  assert.equal(resurrected.data.entry.revision, 3);
  assert.equal(resurrected.data.fencingToken, 8);

  // Backup/restore inspection passes cleanly with tombstones & resurrected entries
  const backup = await createBackup({ configPath: f.configPath, out: path.join(f.root, 'tombstone-backup.sqlite') });
  const inspected = inspectDatabase(backup.path);
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');
});
