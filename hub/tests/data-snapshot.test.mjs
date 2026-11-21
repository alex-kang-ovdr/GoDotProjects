import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createStaticServer } from '../tools/dev.mjs';
import { computeDatabasesChecksum, SNAPSHOT_FORMAT } from '../server/data-snapshot.mjs';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(TESTS_DIR, '..');
const PLATFORM_ROOT = path.resolve(HUB_ROOT, '..');
const DIST_USER = path.join(HUB_ROOT, 'dist', 'user');
const DIST_ADMIN = path.join(HUB_ROOT, 'dist', 'admin');

function makeAdminCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

function listenServer(server, host = '127.0.0.1', port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });
}

async function startAdminInstance(t, { channel = 'dev' } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `playhub-snap-${channel}-`));
  const dataDir = path.join(tmpDir, 'data');
  const creds = makeAdminCreds('SnapshotAdmin!2026');
  const userBaseUrl = `http://127.0.0.1:${channel === 'live' ? 8080 : 18130}`;
  const app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl,
    adminBaseUrl: 'http://127.0.0.1:0',
    userOrigins: [userBaseUrl],
    adminOrigins: ['http://127.0.0.1:0'],
    secureCookies: false,
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    rootDir: DIST_USER,
    platformRoot: PLATFORM_ROOT,
    env: { ...process.env, PLAYHUB_CHANNEL: channel }
  });
  const addrs = await app.listen();
  const adminUrl = `http://127.0.0.1:${addrs.admin.port}`;
  const publicUrl = `http://127.0.0.1:${addrs.public.port}`;

  t.after(async () => {
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  // Login as admin
  const initRes = await fetch(`${adminUrl}/api/admin/session`);
  const initCookie = initRes.headers.get('set-cookie').split(';')[0];
  const initData = await initRes.json();
  const loginRes = await fetch(`${adminUrl}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: initCookie,
      'X-CSRF-Token': initData.csrfToken,
      Origin: 'http://127.0.0.1:0'
    },
    body: JSON.stringify({ username: 'admin', password: 'SnapshotAdmin!2026' })
  });
  assert.equal(loginRes.status, 200);
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const loginData = await loginRes.json();

  const adminFetch = (route, { method = 'GET', body, csrf = loginData.csrfToken } = {}) => fetch(`${adminUrl}${route}`, {
    method,
    headers: {
      Cookie: cookie,
      Origin: 'http://127.0.0.1:0',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });

  return { app, adminUrl, publicUrl, adminFetch, dataDir };
}

test('Live -> Dev latest-version snapshot export & import honors skip vs overwrite conflict modes and excludes secrets/history', async t => {
  const live = await startAdminInstance(t, { channel: 'live' });
  const dev = await startAdminInstance(t, { channel: 'dev' });

  const now = Date.now();
  // Seed Live DB: users, identities, latest save_slots, historical save_backups, secret sessions, l10n (3 releases), datastore (latest + versions), game_overrides
  live.app.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)").run('u-shared', 'registered', 'Live Alice (Latest)', now);
  live.app.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)").run('u-live-only', 'registered', 'Live Bob', now);
  live.app.db.prepare("INSERT INTO identities(provider, subject, user_id) VALUES(?,?,?)").run('google', 'sub-live-alice', 'u-shared');
  live.app.db.prepare("INSERT INTO save_slots(principal_id, game_id, slot, schema_version, revision, payload, updated_at) VALUES(?,?,?,?,?,?,?)")
    .run('u-shared', 'fortress-blue', 'main', 1, 9, JSON.stringify({ level: 99, source: 'live' }), now);
  live.app.db.prepare("INSERT INTO save_backups(id, merge_id, principal_id, game_id, slot, schema_version, revision, payload, created_at, reason) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run('bak-old-1', 'm1', 'u-shared', 'fortress-blue', 'main', 1, 1, '{"level":1}', now - 5000, 'merge_conflict');
  live.app.db.prepare("INSERT INTO game_overrides(game_id, enabled, updated_at) VALUES(?,?,?)").run('fortress-blue', 0, now);
  live.app.db.prepare("INSERT INTO game_overrides(game_id, enabled, updated_at) VALUES(?,?,?)").run('kingdom-rush', 1, now);
  live.app.db.prepare("INSERT INTO l10n_keys(key, namespace, source_text, source_hash, context_id, updated_at) VALUES(?,?,?,?,?,?)")
    .run('portal.live.banner', 'portal', '라이브 공지 최신', 'hash-live-banner', 'ui', now);
  live.app.db.prepare("INSERT INTO l10n_translations(key, locale, value, status, updated_by, updated_at) VALUES(?,?,?,?,?,?)")
    .run('portal.live.banner', 'en', 'Live Banner Latest', 'approved', 'admin', now);
  for (let i = 1; i <= 3; i++) {
    live.app.db.prepare("INSERT INTO l10n_releases(version, tag, sha256, key_count, media_count, coverage_json, bundle_json, notes, is_active, created_by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .run(i, `v1.0.${i}`, `${i}`.repeat(64), 1, 0, '{}', JSON.stringify({ v: i }), `release ${i}`, i === 3 ? 1 : 0, 'admin', now + i * 1000);
  }
  live.app.db.prepare("INSERT INTO datastore_entries(game_id, scope, entry_key, owner_principal_id, revision, value_json, bytes, etag, updated_by, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
    .run('fortress-blue', 'global', 'season_config', null, 5, JSON.stringify({ season: 5 }), 12, 'etag-5', 'live-server', now, now);
  live.app.db.prepare("INSERT INTO datastore_versions(id, game_id, scope, entry_key, revision, value_json, bytes, reason, updated_by, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run('dsv-1', 'fortress-blue', 'global', 'season_config', 1, JSON.stringify({ season: 1 }), 12, 'write', 'live-server', now - 10000);

  // Update a Store Admin package in Live (hide lowpoly-fortress-pack)
  const hideRes = await live.adminFetch('/api/admin/store/packages/lowpoly-fortress-pack/status', {
    method: 'POST',
    body: { status: 'hidden', expectedRevision: 1, reason: 'Live maintenance snapshot test' }
  });
  assert.equal(hideRes.status, 200);

  // 1. Export latest-version snapshot from Live
  const exportRes = await live.adminFetch('/api/admin/system/snapshot/export', { method: 'POST', body: {} });
  assert.equal(exportRes.status, 200);
  const { filename, snapshot } = await exportRes.json();
  assert.match(filename, /^playhub-snapshot-live-/);
  assert.equal(snapshot.format, SNAPSHOT_FORMAT);
  assert.equal(snapshot.sourceEnv.channel, 'live');
  assert.equal(snapshot.sha256, computeDatabasesChecksum(snapshot.databases));

  // Verify strict exclusion of secrets, sessions, and historical bloat
  for (const forbidden of ['sessions', 'oauth_states', 'email_credentials', 'save_backups', 'datastore_versions', 'audit', 'events']) {
    assert.equal(Object.prototype.hasOwnProperty.call(snapshot.databases.platform, forbidden), false, `Must NOT export ${forbidden}`);
  }
  // Verify l10n_releases exported ONLY the latest release (version 3 / v1.0.3)
  assert.equal(snapshot.databases.platform.l10n_releases.rows.length, 1);
  assert.equal(snapshot.databases.platform.l10n_releases.rows[0].version, 3);
  assert.equal(snapshot.databases.platform.l10n_releases.rows[0].tag, 'v1.0.3');

  // 2. Seed Dev DB with conflicting PK rows + a Dev-only row
  dev.app.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)").run('u-shared', 'registered', 'Dev Alice (Old)', now - 1000);
  dev.app.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?,?,?,?)").run('u-dev-only', 'guest', 'Dev Only Guest', now - 1000);
  dev.app.db.prepare("INSERT INTO save_slots(principal_id, game_id, slot, schema_version, revision, payload, updated_at) VALUES(?,?,?,?,?,?,?)")
    .run('u-shared', 'fortress-blue', 'main', 1, 2, JSON.stringify({ level: 2, source: 'dev' }), now - 1000);
  dev.app.db.prepare("INSERT INTO game_overrides(game_id, enabled, updated_at) VALUES(?,?,?)").run('fortress-blue', 1, now - 1000);

  // 3. Dry-Run (skip) on Dev: predicts inserts/skips WITHOUT writing to Dev DB
  const drySkipRes = await dev.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot, conflictMode: 'skip', dryRun: true }
  });
  assert.equal(drySkipRes.status, 200);
  const drySkip = await drySkipRes.json();
  assert.equal(drySkip.dryRun, true);
  assert.equal(drySkip.sourceEnv.channel, 'live');
  assert.equal(drySkip.targetEnv.channel, 'dev');
  assert.ok(drySkip.totals.inserted > 0);
  assert.ok(drySkip.totals.skipped > 0);
  assert.equal(drySkip.totals.overwritten, 0);
  // Confirm Dev DB untouched after dry-run
  assert.equal(dev.app.db.prepare('SELECT id FROM users WHERE id=?').get('u-live-only'), undefined);

  // 4. Real Import with conflictMode: 'skip' on Dev
  const skipRes = await dev.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot, conflictMode: 'skip', dryRun: false, createBackupBeforeImport: true }
  });
  assert.equal(skipRes.status, 200);
  const skipData = await skipRes.json();
  assert.equal(skipData.dryRun, false);
  assert.equal(skipData.conflictMode, 'skip');
  assert.ok(skipData.preImportBackup?.filename, 'Auto pre-import SQLite backup should be created');
  // New Live records inserted
  assert.equal(dev.app.db.prepare('SELECT display_name FROM users WHERE id=?').get('u-live-only')?.display_name, 'Live Bob');
  assert.equal(dev.app.db.prepare('SELECT enabled FROM game_overrides WHERE game_id=?').get('kingdom-rush')?.enabled, 1);
  assert.equal(dev.app.db.prepare('SELECT value FROM l10n_translations WHERE key=? AND locale=?').get('portal.live.banner', 'en')?.value, 'Live Banner Latest');
  // Conflicting Dev records PRESERVED (not overwritten!)
  assert.equal(dev.app.db.prepare('SELECT display_name FROM users WHERE id=?').get('u-shared')?.display_name, 'Dev Alice (Old)');
  assert.equal(JSON.parse(dev.app.db.prepare('SELECT payload FROM save_slots WHERE principal_id=?').get('u-shared').payload).level, 2);
  assert.equal(dev.app.db.prepare('SELECT enabled FROM game_overrides WHERE game_id=?').get('fortress-blue')?.enabled, 1);
  // Dev-only record preserved
  assert.equal(dev.app.db.prepare('SELECT display_name FROM users WHERE id=?').get('u-dev-only')?.display_name, 'Dev Only Guest');
  // Store Admin conflicting package still published in skip mode
  const devStoreSkip = await (await dev.adminFetch('/api/admin/store/packages')).json();
  assert.equal(devStoreSkip.packages.find(p => p.slug === 'lowpoly-fortress-pack').status, 'published');

  // 5. Real Import with conflictMode: 'overwrite' on Dev
  const owRes = await dev.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot, conflictMode: 'overwrite', dryRun: false, createBackupBeforeImport: false }
  });
  assert.equal(owRes.status, 200);
  const owData = await owRes.json();
  assert.equal(owData.conflictMode, 'overwrite');
  assert.ok(owData.totals.overwritten >= 4);
  // Conflicting Dev records NOW OVERWRITTEN with Live's latest snapshot!
  assert.equal(dev.app.db.prepare('SELECT display_name FROM users WHERE id=?').get('u-shared')?.display_name, 'Live Alice (Latest)');
  assert.equal(JSON.parse(dev.app.db.prepare('SELECT payload FROM save_slots WHERE principal_id=?').get('u-shared').payload).level, 99);
  assert.equal(dev.app.db.prepare('SELECT enabled FROM game_overrides WHERE game_id=?').get('fortress-blue')?.enabled, 0);
  // Store Admin package overwritten to Live's hidden status
  const devStoreOw = await (await dev.adminFetch('/api/admin/store/packages')).json();
  const fortressPkg = devStoreOw.packages.find(p => p.slug === 'lowpoly-fortress-pack');
  assert.equal(fortressPkg.status, 'hidden');
  assert.equal(fortressPkg.status_reason, 'Live maintenance snapshot test');
  // Dev-only record still preserved (non-destructive merge!)
  assert.equal(dev.app.db.prepare('SELECT display_name FROM users WHERE id=?').get('u-dev-only')?.display_name, 'Dev Only Guest');
  // Audit trail recorded
  const audits = dev.app.db.prepare("SELECT action, target FROM audit WHERE action='system_snapshot_imported'").all();
  assert.equal(audits.length, 2);
  assert.equal(audits[0].target, 'live->dev');
});

test('Snapshot API enforces auth, CSRF, SHA-256 checksum, table allowlist, and Live target protection', async t => {
  const live = await startAdminInstance(t, { channel: 'live' });

  // Public API must block snapshot routes (404)
  assert.equal((await fetch(`${live.publicUrl}/api/admin/system/snapshot/meta`)).status, 404);
  // Unauthenticated admin request -> 401
  assert.equal((await fetch(`${live.adminUrl}/api/admin/system/snapshot/meta`)).status, 401);
  // Wrong CSRF -> 403
  assert.equal((await live.adminFetch('/api/admin/system/snapshot/export', { method: 'POST', body: {}, csrf: 'bad-csrf' })).status, 403);

  const exported = await (await live.adminFetch('/api/admin/system/snapshot/export', { method: 'POST', body: {} })).json();

  // Tampered checksum -> 422 SNAPSHOT_CHECKSUM_MISMATCH
  const tampered = structuredClone(exported.snapshot);
  tampered.databases.platform.game_overrides = { columns: ['game_id', 'enabled', 'updated_at'], primaryKey: ['game_id'], rows: [{ game_id: 'evil', enabled: 0, updated_at: 1 }] };
  const tamperRes = await live.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot: tampered, conflictMode: 'skip', allowLiveImport: true }
  });
  assert.equal(tamperRes.status, 422);
  assert.equal((await tamperRes.json()).error.code, 'SNAPSHOT_CHECKSUM_MISMATCH');

  // Forbidden table (sessions) with valid checksum -> 422 SNAPSHOT_TABLE_FORBIDDEN
  const evilSnap = structuredClone(exported.snapshot);
  evilSnap.databases.platform.sessions = { columns: ['id_hash'], primaryKey: ['id_hash'], rows: [] };
  evilSnap.sha256 = computeDatabasesChecksum(evilSnap.databases);
  const evilRes = await live.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot: evilSnap, conflictMode: 'skip', allowLiveImport: true }
  });
  assert.equal(evilRes.status, 422);
  assert.equal((await evilRes.json()).error.code, 'SNAPSHOT_TABLE_FORBIDDEN');

  // Importing into LIVE without explicit allowLiveImport=true -> 409 LIVE_IMPORT_CONFIRMATION_REQUIRED
  const guardRes = await live.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot: exported.snapshot, conflictMode: 'skip', dryRun: false }
  });
  assert.equal(guardRes.status, 409);
  assert.equal((await guardRes.json()).error.code, 'LIVE_IMPORT_CONFIRMATION_REQUIRED');

  // Dry-run on LIVE is allowed without allowLiveImport
  const liveDryRes = await live.adminFetch('/api/admin/system/snapshot/import', {
    method: 'POST',
    body: { snapshot: exported.snapshot, conflictMode: 'skip', dryRun: true }
  });
  assert.equal(liveDryRes.status, 200);
});

const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('Admin Backups UI renders Data Migration Snapshot panel with skip/overwrite options and works in Chrome CDP', {
  skip: !fs.existsSync(chromePath),
  timeout: 60000
}, async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-snap-ui-'));
  const dataDir = path.join(tmpDir, 'data');
  const creds = makeAdminCreds('SnapshotAdmin!2026');

  const adminUiServer = createStaticServer(DIST_ADMIN);
  const uiAddr = await listenServer(adminUiServer, '127.0.0.1', 0);
  const adminUiOrigin = `http://127.0.0.1:${uiAddr.port}`;

  const app = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:18130',
    adminBaseUrl: adminUiOrigin,
    userOrigins: ['http://127.0.0.1:18130'],
    adminOrigins: [adminUiOrigin],
    secureCookies: false,
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: true }
  }, {
    rootDir: DIST_USER,
    platformRoot: PLATFORM_ROOT,
    env: { ...process.env, PLAYHUB_CHANNEL: 'dev' }
  });
  const addrs = await app.listen();

  const proxyAdminServer = createStaticServer(DIST_ADMIN, { apiPort: addrs.admin.port });
  // Note: admin UI calls apiPort directly via config.js; test via localAutoLogin URL!
  await new Promise(resolve => { proxyAdminServer.close(resolve); });

  // Serve a temp admin dir whose config.js points to addrs.admin.port
  const tempAdminDir = path.join(tmpDir, 'admin-web');
  fs.cpSync(DIST_ADMIN, tempAdminDir, { recursive: true });
  fs.writeFileSync(path.join(tempAdminDir, 'config.js'), `window.PLAYHUB_ADMIN_CONFIG=${JSON.stringify({ apiPort: addrs.admin.port, apiBaseUrl: '', mode: 'local-iis-poc' })};\n`);
  const servedAdmin = createStaticServer(tempAdminDir);
  const servedAddr = await listenServer(servedAdmin, '127.0.0.1', 0);

  // Re-close first unused server
  await new Promise(resolve => { adminUiServer.close(resolve); });
  // Allow served origin by restarting app with exact adminBaseUrl/adminOrigins
  await app.close();
  const servedOrigin = `http://127.0.0.1:${servedAddr.port}`;
  const app2 = createApp({
    dataDir,
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: 0,
    adminPort: 0,
    userBaseUrl: 'http://127.0.0.1:18130',
    adminBaseUrl: servedOrigin,
    userOrigins: ['http://127.0.0.1:18130'],
    adminOrigins: [servedOrigin],
    secureCookies: false,
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    rootDir: DIST_USER,
    platformRoot: PLATFORM_ROOT,
    env: { ...process.env, PLAYHUB_CHANNEL: 'dev' }
  });
  const addrs2 = await app2.listen();
  fs.writeFileSync(path.join(tempAdminDir, 'config.js'), `window.PLAYHUB_ADMIN_CONFIG=${JSON.stringify({ apiPort: addrs2.admin.port, apiBaseUrl: '', mode: 'local-iis-poc' })};\n`);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-snap-cdp-'));
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' }
  );
  let socket;
  const exceptions = [];

  t.after(async () => {
    socket?.close();
    try { chrome.kill(); } catch {}
    await new Promise(resolve => { servedAdmin.close(resolve); servedAdmin.closeAllConnections(); });
    await app2.close();
    await delay(150);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  const portFile = path.join(profile, 'DevToolsActivePort');
  let port;
  for (let i = 0; i < 100; i += 1) {
    try {
      const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(value) && value > 0) { port = value; break; }
    } catch {}
    await delay(100);
  }
  assert.ok(port);

  const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
  let serial = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails.text);
    if (pending.has(msg.id)) {
      const [resolve, reject] = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    pending.set(id, [resolve, reject]);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 120; i += 1) {
      if (await evaluate(expression)) return;
      await delay(50);
    }
    throw new Error(`Condition timed out: ${expression}`);
  };

  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });

  // Open Admin login page, sign in via UI form, then verify ?tab=system&view=backups
  await send('Page.navigate', { url: `${servedOrigin}/?tab=system&view=backups` });
  await until("!document.querySelector('#login-panel')?.hidden && !!document.querySelector('#password')");
  await evaluate(`(() => {
    document.querySelector('#username').value = 'admin';
    document.querySelector('#password').value = 'SnapshotAdmin!2026';
    document.querySelector('#login-form button[type="submit"]').click();
  })()`);
  await until("!document.querySelector('#dashboard')?.hidden && !!document.querySelector('[data-testid=\"snapshot-export-btn\"]') && !!document.querySelector('[data-testid=\"conflict-overwrite\"]')");
  await delay(300);

  const uiState = await evaluate(`({
    exportBtn: !!document.querySelector('[data-testid="snapshot-export-btn"]'),
    fileInput: !!document.querySelector('[data-testid="snapshot-file-input"]'),
    skipChecked: document.querySelector('[data-testid="conflict-skip"]')?.checked,
    overwritePresent: !!document.querySelector('[data-testid="conflict-overwrite"]'),
    dryRunBtn: !!document.querySelector('[data-testid="snapshot-dryrun-btn"]'),
    importBtn: !!document.querySelector('[data-testid="snapshot-import-btn"]'),
    domainCount: document.querySelectorAll('[data-testid^="snapshot-domain-"]').length
  })`);
  assert.equal(uiState.exportBtn, true);
  assert.equal(uiState.fileInput, true);
  assert.equal(uiState.skipChecked, true);
  assert.equal(uiState.overwritePresent, true);
  assert.equal(uiState.dryRunBtn, true);
  assert.equal(uiState.importBtn, true);
  assert.equal(uiState.domainCount, 7);

  if (process.env.PLAYHUB_SNAPSHOT_UI_SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.env.PLAYHUB_SNAPSHOT_UI_SHOT, Buffer.from(shot.data, 'base64'));
  }

  assert.deepEqual(exceptions, []);
});
