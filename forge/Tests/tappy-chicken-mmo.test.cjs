'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const WebSocket = require('ws');

const { TappyMmoRoom } = require('../Tools/tappy-chicken-mmo-multiplayer.cjs');
const { PlatformStore } = require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');

function createRecorder() {
  const inbox = [];
  return {
    inbox,
    send: msg => inbox.push(msg),
    rpcs: method => inbox.filter(m => m.type === 'rpc' && (!method || m.method === method)),
  };
}

test('TappyMmoRoom supports instant drop-in and multicasts RPC events ONLY to nearby clients', () => {
  let now = 1000;
  const room = new TappyMmoRoom('aabbccddeeff', '1'.repeat(24), null, {
    courseSeed: 55123,
    proximityRadius: 500,
    leaveHysteresis: 50,
  }, () => now);

  assert.equal(room.phase, 'playing');

  const recA = createRecorder();
  const recB = createRecorder();
  const recC = createRecorder();

  const { player: a, welcome: welcomeA } = room.join('Alpha', { send: recA.send });
  assert.equal(welcomeA.courseSeed, 55123);
  assert.equal(welcomeA.proximityRadius, 500);

  // Alpha flies to distance 100.
  room.handleRpc(a.id, {
    method: 'server_player_event',
    params: { eventType: 'flap', runDistance: 100, y: 260, vy: -345, angle: -0.6, flapTime: 0, phase: 'playing', score: 0, seq: 1 },
  });

  // Bravo drops in near Alpha (distance 200 -> delta 100 <= 500).
  const { player: b } = room.join('Bravo', { send: recB.send, runDistance: 200 });
  // Charlie drops in far away (distance 2000 -> delta 1900 > 500).
  const { player: c } = room.join('Charlie', { send: recC.send, runDistance: 2000 });

  assert.ok(a.nearby.has(b.id));
  assert.ok(b.nearby.has(a.id));
  assert.ok(!a.nearby.has(c.id));
  assert.ok(!c.nearby.has(a.id));

  const bBefore = recB.rpcs('client_multicast_event').length;
  const cBefore = recC.rpcs('client_multicast_event').length;

  // Alpha sends flap RPC -> Server multicasts ONLY to Bravo; Charlie gets ZERO packets.
  const res = room.handleRpc(a.id, {
    method: 'server_player_event',
    params: { eventType: 'flap', runDistance: 140, y: 230, vy: -345, angle: -0.7, flapTime: 0, phase: 'playing', score: 1, seq: 2 },
  });
  assert.deepEqual(res.deliveredTo, [b.id]);
  assert.deepEqual(res.filteredIds, [c.id]);
  assert.equal(recB.rpcs('client_multicast_event').length, bBefore + 1);
  assert.equal(recC.rpcs('client_multicast_event').length, cBefore);
  assert.equal(recB.rpcs('client_multicast_event').at(-1).params.eventType, 'flap');

  // Stale sequence is ignored.
  const stale = room.handleRpc(a.id, {
    method: 'server_player_event',
    params: { eventType: 'flap', runDistance: 150, y: 210, phase: 'playing', seq: 1 },
  });
  assert.equal(stale.ignored, true);

  // Charlie moves into Alpha's proximity (distance 400 -> delta 260 <= 500).
  const enterRes = room.handleRpc(c.id, {
    method: 'server_player_event',
    params: { eventType: 'flap', runDistance: 400, y: 250, phase: 'playing', score: 2, seq: 1 },
  });
  assert.ok(enterRes.enteredIds.includes(a.id));
  assert.ok(enterRes.enteredIds.includes(b.id));
  assert.ok(recA.rpcs('client_multicast_event').some(m => m.params.peerId === c.id));
  assert.ok(recC.rpcs('client_multicast_event').some(m => m.params.peerId === a.id));

  // Charlie moves outside proximity + hysteresis (400 -> 1500, delta > 550).
  const leaveRes = room.handleRpc(c.id, {
    method: 'server_player_event',
    params: { eventType: 'sync', runDistance: 1500, y: 260, phase: 'playing', score: 6, seq: 2 },
  });
  assert.ok(leaveRes.leftIds.includes(a.id));
  assert.ok(leaveRes.leftIds.includes(b.id));
  assert.ok(recA.rpcs('client_peer_removed').some(m => m.params.peerId === c.id));
  assert.ok(recC.rpcs('client_peer_removed').some(m => m.params.peerId === a.id));

  // Bravo leaves -> Alpha gets peer_removed, Charlie does not.
  const cRemBefore = recC.rpcs('client_peer_removed').length;
  const notified = room.leave(b.id);
  assert.deepEqual(notified, [a.id]);
  assert.ok(recA.rpcs('client_peer_removed').some(m => m.params.peerId === b.id));
  assert.equal(recC.rpcs('client_peer_removed').length, cRemBefore);
});

test('PlayForge registers tappy-chicken-mmo template and serves WebSocket spatial RPC rooms', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tappy-mmo-server-'));
  const buildId = 'd'.repeat(16);
  fs.mkdirSync(path.join(temp, 'builds', buildId), { recursive: true });
  const server = createServer({
    buildDirectory: path.join(temp, 'builds'),
    platformWorkspace: path.join(temp, 'platform'),
    workspace: path.join(temp, 'workspace'),
  });
  t.after(async () => {
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  const base = `http://127.0.0.1:${port}`;

  // Health & template discovery.
  const health = await (await fetch(base + '/api/health')).json();
  assert.equal(health.tappyChickenMmoMultiplayer, true);

  const created = await fetch(base + '/api/platform/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tappy Chicken MMO Test', template: 'tappy-chicken-mmo', mode: 'ready' }),
  });
  assert.equal(created.status, 201);
  const project = (await created.json()).project;
  assert.equal(project.template, 'tappy-chicken-mmo');

  fs.writeFileSync(path.join(temp, 'builds', buildId, 'result.json'), JSON.stringify({
    id: buildId,
    projectId: project.id,
    revision: 1,
    status: 'succeeded',
    previewUrl: `/api/builds/${buildId}/files/index.html`,
  }));

  const connectClient = payload => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/tappy-chicken-mmo`);
    const messages = [];
    ws.on('error', reject);
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (msg.type === 'welcome') resolve({ ws, welcome: msg, messages });
      else if (msg.type === 'error' && !messages.some(m => m.type === 'welcome')) reject(new Error(msg.error));
    });
    ws.on('open', () => ws.send(JSON.stringify(payload)));
  });

  const c1 = await connectClient({ type: 'join', projectId: project.id, buildId, name: 'HostBird', proximityRadius: 500 });
  t.after(() => c1.ws.close());
  const roomId = c1.welcome.roomId;

  const metaRes = await fetch(`${base}/api/tappy-chicken-mmo/rooms/${roomId}`);
  assert.equal(metaRes.status, 200);
  const meta = (await metaRes.json()).room;
  assert.equal(meta.roomId, roomId);
  assert.equal(meta.phase, 'playing');
  assert.equal(meta.players, 1);

  const c2 = await connectClient({ type: 'join', roomId, name: 'NearBird' });
  t.after(() => c2.ws.close());
  const c3 = await connectClient({ type: 'join', roomId, name: 'FarBird' });
  t.after(() => c3.ws.close());

  // Move c3 far away (2500px).
  c3.ws.send(JSON.stringify({
    type: 'rpc',
    method: 'server_player_event',
    params: { eventType: 'sync', runDistance: 2500, y: 260, phase: 'playing', seq: 1 },
  }));
  await new Promise(r => setTimeout(r, 80));

  const c2Before = c2.messages.filter(m => m.type === 'rpc' && m.method === 'client_multicast_event' && m.params?.eventType === 'flap').length;
  const c3Before = c3.messages.filter(m => m.type === 'rpc' && m.method === 'client_multicast_event' && m.params?.eventType === 'flap').length;

  c1.ws.send(JSON.stringify({
    type: 'rpc',
    method: 'server_player_event',
    params: { eventType: 'flap', runDistance: 120, y: 240, vy: -345, angle: -0.6, flapTime: 0, phase: 'playing', score: 1, seq: 1 },
  }));
  await new Promise(r => setTimeout(r, 100));

  const c2After = c2.messages.filter(m => m.type === 'rpc' && m.method === 'client_multicast_event' && m.params?.eventType === 'flap').length;
  const c3After = c3.messages.filter(m => m.type === 'rpc' && m.method === 'client_multicast_event' && m.params?.eventType === 'flap').length;
  assert.equal(c2After, c2Before + 1, 'NearBird should receive HostBird flap RPC');
  assert.equal(c3After, c3Before, 'FarBird must NOT receive HostBird flap RPC');
});

test('TappyMmoRoom caps concurrent nearby ghosts and WebSocket server batches RPCs while isolating observer state', async t => {
  // 1. Unit check: AOI ghost cap bounds fan-out in crowded hotspots.
  const room = new TappyMmoRoom('112233445566', '2'.repeat(24), null, { maxNearbyGhosts: 4 });
  const players = [];
  for (let i = 0; i < 12; i += 1) {
    const rec = createRecorder();
    const { player } = room.join(`Crowded${i}`, { send: rec.send, runDistance: 100 });
    players.push({ player, rec });
  }
  for (const entry of players) {
    assert.ok(entry.player.nearby.size <= 4, `Expected nearby <= 4, got ${entry.player.nearby.size}`);
  }
  const flapRes = room.handleRpc(players[0].player.id, {
    method: 'server_player_event',
    params: { eventType: 'flap', runDistance: 100, y: 240, phase: 'playing', score: 1, seq: 1 },
  });
  assert.ok(flapRes.deliveredTo.length <= 4);
  assert.ok(flapRes.filteredIds.length >= 7);

  // 2. Live WebSocket check: supportsBatch merges multi-event ticks & subscribeState isolates snapshots.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tappy-mmo-opt-'));
  const buildId = 'e'.repeat(16);
  fs.mkdirSync(path.join(temp, 'builds', buildId), { recursive: true });
  const server = createServer({
    buildDirectory: path.join(temp, 'builds'),
    platformWorkspace: path.join(temp, 'platform'),
    workspace: path.join(temp, 'workspace'),
  });
  t.after(async () => {
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  const base = `http://127.0.0.1:${port}`;
  const project = (await (await fetch(base + '/api/platform/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tappy Batch Test', template: 'tappy-chicken-mmo', mode: 'ready' }),
  })).json()).project;
  fs.writeFileSync(path.join(temp, 'builds', buildId, 'result.json'), JSON.stringify({
    id: buildId,
    projectId: project.id,
    revision: 1,
    status: 'succeeded',
    previewUrl: `/api/builds/${buildId}/files/index.html`,
  }));

  const connect = payload => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/tappy-chicken-mmo`);
    const messages = [];
    ws.on('error', reject);
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (msg.type === 'welcome') resolve({ ws, welcome: msg, messages });
    });
    ws.on('open', () => ws.send(JSON.stringify(payload)));
  });

  const observer = await connect({ type: 'join', projectId: project.id, buildId, name: 'Obs', supportsBatch: true, subscribeState: true });
  t.after(() => observer.ws.close());
  const roomId = observer.welcome.roomId;
  const playerA = await connect({ type: 'join', roomId, name: 'PlayerA', supportsBatch: true, subscribeState: false });
  t.after(() => playerA.ws.close());
  const playerB = await connect({ type: 'join', roomId, name: 'PlayerB', supportsBatch: true, subscribeState: false });
  t.after(() => playerB.ws.close());

  // Send 3 rapid events within one 50ms flush window so PlayerB receives a batched frame.
  for (let seq = 1; seq <= 3; seq += 1) {
    playerA.ws.send(JSON.stringify({
      type: 'rpc',
      method: 'server_player_event',
      params: { eventType: seq === 2 ? 'flap' : 'sync', runDistance: 100 + seq * 5, y: 250, phase: 'playing', score: seq, seq },
    }));
  }
  await new Promise(r => setTimeout(r, 150));

  assert.ok(observer.messages.some(m => m.type === 'state'), 'Subscribed observer must receive state snapshots');
  assert.equal(playerA.messages.some(m => m.type === 'state'), false, 'Unsubscribed gameplay client must NOT receive full state snapshots');
  assert.ok(playerB.messages.some(m => m.type === 'rpc_batch' && Array.isArray(m.items) && m.items.length >= 2), 'Batch-capable client must receive rpc_batch frames');
});

test('Event-driven sync estimates linear AOI distance without sync packets and encodes compact 5-element flap tuples', async t => {
  // 1. Linear AOI estimation: Peer A is flying at 170 px/s; 3 seconds later with ZERO sync packets,
  // server estimates Peer A at 100 + 510 = 610 px so Peer B at 1000 px is within 500 px proximity!
  let now = 1000;
  const room = new TappyMmoRoom('a1b2c3d4e5f6', '3'.repeat(24), null, { proximityRadius: 500 }, () => now);
  const recA = createRecorder();
  const recB = createRecorder();
  const { player: a } = room.join('FlyerA', { send: recA.send, runDistance: 100, phase: 'playing', speed: 170 });
  now = 4000; // 3 seconds later -> estimated dist for A is 610 px.
  assert.equal(Math.round(room.estimateDistance(a, now)), 610);
  const { player: b } = room.join('DropInB', { send: recB.send, runDistance: 1000, phase: 'playing', speed: 170 });
  assert.ok(a.nearby.has(b.id), 'Linear AOI estimation must pair DropInB with FlyerA without intermediate sync packets');
  const syncForB = recB.rpcs('client_multicast_event').at(-1);
  assert.equal(syncForB.params.runDistance, 610, 'AOI entry sync must deliver time-compensated runDistance');

  // 2. Compact event-driven wire protocol over live WebSocket.
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tappy-mmo-compact-'));
  const buildId = 'f'.repeat(16);
  fs.mkdirSync(path.join(temp, 'builds', buildId), { recursive: true });
  const server = createServer({
    buildDirectory: path.join(temp, 'builds'),
    platformWorkspace: path.join(temp, 'platform'),
    workspace: path.join(temp, 'workspace'),
  });
  t.after(async () => {
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  const base = `http://127.0.0.1:${port}`;
  const project = (await (await fetch(base + '/api/platform/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Tappy Compact Test', template: 'tappy-chicken-mmo', mode: 'ready' }),
  })).json()).project;
  fs.writeFileSync(path.join(temp, 'builds', buildId, 'result.json'), JSON.stringify({
    id: buildId,
    projectId: project.id,
    revision: 1,
    status: 'succeeded',
    previewUrl: `/api/builds/${buildId}/files/index.html`,
  }));

  const connect = payload => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/tappy-chicken-mmo`);
    const frames = [];
    ws.on('error', reject);
    ws.on('message', raw => {
      const text = raw.toString();
      const msg = JSON.parse(text);
      frames.push({ msg, bytes: Buffer.byteLength(text) });
      if (msg.type === 'welcome') resolve({ ws, welcome: msg, frames });
    });
    ws.on('open', () => ws.send(JSON.stringify(payload)));
  });

  const c1 = await connect({ type: 'join', projectId: project.id, buildId, name: 'CompactA', compact: true });
  t.after(() => c1.ws.close());
  const c2 = await connect({ type: 'join', roomId: c1.welcome.roomId, name: 'CompactB', compact: true });
  t.after(() => c2.ws.close());
  await new Promise(r => setTimeout(r, 80));

  const beforeLen = c2.frames.length;
  // Compact client->server flap event: [evCode=1, dist=420, y=250, score=3, phase=2, seq=1]
  c1.ws.send(JSON.stringify({ e: [1, 420, 250, 3, 2, 1] }));
  await new Promise(r => setTimeout(r, 120));

  const received = c2.frames.slice(beforeLen).find(f => Array.isArray(f.msg.b));
  assert.ok(received, 'Compact receiver must get {"b":[...]} batch frame');
  const flapTuple = received.msg.b.find(t => t[0] === c1.welcome.shortId && t[1] === 1);
  assert.deepEqual(flapTuple, [c1.welcome.shortId, 1, 420, 250, 3], 'Steady-state flap tuple must be compact 5-element array');
  assert.ok(received.bytes < 48, `Expected compact flap frame < 48 bytes, got ${received.bytes}`);
});

const engine = NativeRuntime.availability(root);
test('Godot 4.7 native @rpc spatial multicast, drop-in, and 50% ghost opacity', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-tappy-mmo-godot-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const projectDir = path.join(temp, 'project');
  const store = new PlatformStore(root, path.join(temp, 'store'));
  const { files } = store.createProject({ name: 'Tappy Chicken MMO Probe', template: 'tappy-chicken-mmo', mode: 'ready' });
  for (const [relative, source] of Object.entries(files)) {
    const out = path.join(projectDir, relative);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, source);
  }
  fs.copyFileSync(
    path.join(root, 'Templates/tappy-chicken-mmo/tests/tappy_mmo_rpc_test.gd'),
    path.join(projectDir, 'tappy_mmo_rpc_test.gd')
  );

  const evidence = path.join(root, 'Saved/Tests/tappy-chicken-mmo');
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
    const result = spawnSync(engine.executable, ['--headless', '--path', projectDir, ...args], {
      env,
      encoding: 'utf8',
      timeout: 60000,
      windowsHide: true,
    });
    const log = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(evidence, `tappy-mmo-${label}.log`), log);
    assert.ifError(result.error);
    assert.equal(result.status, 0, log);
    assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error:|Assertion failed|ASSERTION FAILED:/);
    return log;
  }
  run(['--editor', '--import'], 'import');
  const output = run(['--script', 'res://tappy_mmo_rpc_test.gd'], 'rpc-test');
  assert.match(output, /TAPPY_MMO_RPC_OK/);
});
