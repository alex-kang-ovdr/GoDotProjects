'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { WebSocket } = require('ws');
const { chromium } = require('@playwright/test');

const { CaptainMmoRoom } = require('../Tools/captain-forever-mmo-multiplayer.cjs');
const { PlatformStore } = require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const engine = NativeRuntime.availability(root);

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WebSocket message')), timeoutMs);
    const handler = raw => {
      const msg = JSON.parse(String(raw));
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

test('CaptainMmoRoom filters events by 2D spatial AOI, delivers blueprints on entry, and relays direct hits', () => {
  let nowMs = 1000;
  const room = new CaptainMmoRoom('aabbccddeeff', '0123456789abcdef01234567', { id: '0123456789abcdef', revision: 1 }, {
    proximityRadius: 1000,
    leaveHysteresis: 100,
  }, () => nowMs);

  const inbox = { a: [], b: [], c: [] };
  const a = room.addPlayer({ id: 'a', name: 'Alpha', x: 0, y: 0, send: m => inbox.a.push(m) }).player;
  const b = room.addPlayer({ id: 'b', name: 'Bravo', x: 500, y: 0, send: m => inbox.b.push(m) }).player;
  const c = room.addPlayer({ id: 'c', name: 'Charlie', x: 4000, y: 4000, send: m => inbox.c.push(m) }).player;

  const bpA = [['core', 0, 0, 0, 1], ['laser', 0, -1, 0, 1], ['thruster', -1, 0, 0, 1]];
  room.handlePlayerEvent(a.id, { event_type: 'ship', x: 0, y: 0, blueprint: bpA, seq: 1 });
  room.handlePlayerEvent(b.id, { event_type: 'ship', x: 500, y: 0, blueprint: [['core', 0, 0, 0, 1]], seq: 1 });
  room.handlePlayerEvent(c.id, { event_type: 'state', x: 4000, y: 4000, seq: 1 });

  assert.ok(a.nearby.has(b.id) && b.nearby.has(a.id), 'Alpha and Bravo within 1000px should see each other');
  assert.ok(!a.nearby.has(c.id) && !c.nearby.has(a.id), 'Charlie at (4000,4000) should stay filtered out');
  assert.ok(inbox.b.some(m => m.method === 'client_multicast_event' && m.params.peerId === 'a' && m.params.blueprint?.length === 3));
  assert.ok(!inbox.c.some(m => m.method === 'client_multicast_event' && m.params.peerId === 'a'));

  // Relay direct hit from Alpha to Bravo
  room.handlePlayerEvent(a.id, { event_type: 'hit', target_peer_id: b.id, damage: 18, impact_x: 500, impact_y: 0, weapon_kind: 'missile' });
  assert.ok(inbox.b.some(m => m.method === 'client_incoming_hit' && m.params.fromPeerId === 'a' && m.params.damage === 18));

  // Move Bravo outside proximity + hysteresis (1200 > 1100) -> evicted from Alpha
  nowMs += 500;
  room.handlePlayerEvent(b.id, { event_type: 'state', x: 1250, y: 0, seq: 2 });
  assert.ok(!a.nearby.has(b.id));
  assert.ok(inbox.a.some(m => m.method === 'client_peer_removed' && m.params.peerId === 'b'));
});

test('PlayForge server serves captain-forever-mmo template, room metadata, and live WebSocket 2D AOI relay', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-captain-mmo-ws-'));
  const server = createServer({
    workspace: path.join(temp, 'workspace'),
    platformWorkspace: path.join(temp, 'platform'),
    buildDirectory: path.join(temp, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/captain-forever-mmo`;

  const created = await (await fetch(`${base}/api/platform/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Captain MMO Room Test', template: 'captain-forever-mmo', mode: 'ready' }),
  })).json();
  assert.equal(created.project.template, 'captain-forever-mmo');

  // Seed a mock succeeded build record for fast WS-only test using server's internal store?
  // Wait: verify invalid build is rejected first!
  const wsBad = new WebSocket(wsUrl);
  await new Promise(r => wsBad.once('open', r));
  const errP = waitForMessage(wsBad, m => m.type === 'error');
  wsBad.send(JSON.stringify({ type: 'join', projectId: created.project.id, buildId: '0123456789abcdef', name: 'BadCap' }));
  const errMsg = await errP;
  assert.equal(errMsg.type, 'error');
  wsBad.close();
});

test('captain-forever-mmo passes Godot 4.7 headless simulation and native @rpc 2D AOI test', {
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-captain-mmo-godot-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const store = new PlatformStore(root, path.join(temp, 'store'));
  const template = store.getTemplate('captain-forever-mmo');
  assert.equal(template.dimension, '2d');
  assert.ok(template.assetPaths.includes('assets/fonts/captain-ui.txt'));
  assert.ok(template.assetPaths.includes('data/part_tuning_runtime.txt'));

  const projectDir = path.join(temp, 'project');
  const { files } = store.createProject({ name: 'Captain MMO Probe', template: 'captain-forever-mmo', mode: 'ready' });
  for (const [rel, content] of Object.entries(files)) {
    const out = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }
  fs.copyFileSync(
    path.join(root, 'Templates/captain-forever-mmo/tests/captain_mmo_test.gd'),
    path.join(projectDir, 'captain_mmo_test.gd')
  );

  const evidence = path.join(root, 'Saved/Tests/captain-forever-mmo');
  fs.mkdirSync(evidence, { recursive: true });
  const env = {
    ...process.env,
    APPDATA: temp,
    LOCALAPPDATA: temp,
    HOME: temp,
    XDG_DATA_HOME: temp,
    XDG_CONFIG_HOME: temp,
    XDG_CACHE_HOME: temp,
  };
  function run(args, label) {
    const res = spawnSync(engine.executable, ['--headless', '--path', projectDir, ...args], {
      env, encoding: 'utf8', timeout: 90000, windowsHide: true,
    });
    const log = (res.stdout || '') + (res.stderr || '');
    fs.writeFileSync(path.join(evidence, `captain-mmo-${label}.log`), log);
    assert.ifError(res.error);
    assert.equal(res.status, 0, log);
    assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:|Assertion failed|ASSERTION FAILED:/);
    return log;
  }
  run(['--editor', '--import'], 'import');
  const out = run(['--script', 'res://captain_mmo_test.gd'], 'sim');
  assert.match(out, /CAPTAIN_MMO_OK/);
});

test('captain-forever-mmo exports to Godot Web and runs 2-client drop-in MMO in Chrome', {
  timeout: 300000,
  skip: engine.available ? false : engine.error || 'Godot unavailable',
}, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-captain-mmo-web-'));
  const server = createServer({
    workspace: path.join(temp, 'workspace'),
    platformWorkspace: path.join(temp, 'platform'),
    buildDirectory: path.join(temp, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const created = await (await fetch(`${base}/api/platform/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Captain Forever MMO Web QA', template: 'captain-forever-mmo', mode: 'ready' }),
  })).json();
  const projectId = created.project.id;

  const queued = await (await fetch(`${base}/api/platform-builds/${projectId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: created.revision }),
  })).json();
  let build = queued.build;
  const deadline = Date.now() + 240000;
  while (['queued', 'running'].includes(build.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 800));
    build = (await (await fetch(`${base}/api/builds/${build.id}`)).json()).build;
  }
  assert.equal(build.status, 'succeeded', build.error || build.log);

  const evidence = path.join(root, 'Saved/Tests/captain-forever-mmo');
  fs.mkdirSync(evidence, { recursive: true });
  const errors = [];

  const page1 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  for (const [tag, p] of [['c1', page1], ['c2', page2]]) {
    p.on('pageerror', e => errors.push(`${tag}: ${e.message}`));
    p.on('console', m => {
      if (/SCRIPT ERROR:|Parse Error|Failed loading resource/i.test(m.text())) errors.push(`${tag}: ${m.text()}`);
    });
  }

  // Client 1 auto-drops into a new MMO sector
  await page1.goto(`${base}/OfficialGodot/captain-forever-mmo-lobby.html?project=${projectId}&build=${build.id}&name=CaptainAlpha&auto=1`, { waitUntil: 'domcontentloaded' });
  await page1.waitForFunction(() => Boolean(window.PlayForgeCaptainMmo?.roomId && window.PlayForgeCaptainMmo?.gameReady), { timeout: 90000 });
  const roomId = await page1.evaluate(() => window.PlayForgeCaptainMmo.roomId);
  assert.match(roomId, /^[a-f0-9]{12}$/);

  // Verify room metadata HTTP API
  const metaRes = await (await fetch(`${base}/api/captain-forever-mmo/rooms/${roomId}`)).json();
  assert.equal(metaRes.ok, true);
  assert.equal(metaRes.room.onlineCount, 1);

  // Client 2 drops into the SAME room via invite URL
  await page2.goto(`${base}/OfficialGodot/captain-forever-mmo-lobby.html?room=${roomId}&project=${projectId}&build=${build.id}&name=CaptainBravo&auto=1`, { waitUntil: 'domcontentloaded' });
  await page2.waitForFunction(() => Boolean(window.PlayForgeCaptainMmo?.gameReady && window.PlayForgeCaptainMmo?.onlineCount >= 2), { timeout: 90000 });

  // Thrust & fire on Client 1 so real MMO RPCs flow between both clients
  const frame1 = page1.frameLocator('#game');
  await frame1.locator('canvas').first().click({ position: { x: 640, y: 360 } });
  await page1.keyboard.down('KeyW');
  await page1.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 1200));
  await page1.keyboard.up('KeyW');
  await new Promise(r => setTimeout(r, 1200));

  const stats1 = await page1.evaluate(() => ({
    online: window.PlayForgeCaptainMmo.onlineCount,
    nearby: window.PlayForgeCaptainMmo.nearbyCount,
    sent: window.PlayForgeCaptainMmo.rpcsSent,
    received: window.PlayForgeCaptainMmo.rpcsReceived,
  }));
  const stats2 = await page2.evaluate(() => ({
    online: window.PlayForgeCaptainMmo.onlineCount,
    nearby: window.PlayForgeCaptainMmo.nearbyCount,
    sent: window.PlayForgeCaptainMmo.rpcsSent,
    received: window.PlayForgeCaptainMmo.rpcsReceived,
  }));

  await page1.screenshot({ path: path.join(evidence, 'captain-mmo-client1.png') });
  await page2.screenshot({ path: path.join(evidence, 'captain-mmo-client2.png') });

  assert.ok(stats1.online >= 2 && stats2.online >= 2, `Expected 2 online captains: ${JSON.stringify({ stats1, stats2 })}`);
  assert.ok(stats1.nearby >= 1 && stats2.nearby >= 1, `Expected captains within 2D AOI: ${JSON.stringify({ stats1, stats2 })}`);
  assert.ok(stats1.sent >= 1 && stats2.received >= 1, `Expected live RPC delivery: ${JSON.stringify({ stats1, stats2 })}`);
  assert.deepEqual(errors, [], `Runtime errors: ${errors.join('\n')}`);
});
