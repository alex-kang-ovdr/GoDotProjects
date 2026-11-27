import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createSpatialRelayService } from '../server/spatial-relay-service.mjs';
import { createUgcMultiplayer } from '../server/ugc-multiplayer.mjs';
import { createForgeTemplatePublisher } from '../server/forge-template-publisher.mjs';

const require = createRequire(import.meta.url);
const WebSocket = require('../../forge/node_modules/ws');
const { RelayTicketAuthority, resolveClientIp } = require('../../tools/ugc-shared/relay-ticket.cjs');
const { GameRuntimeHost } = require('../../forge/Tools/runtime-host/game-runtime-host.cjs');

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HUB_ROOT = path.resolve(REPO_ROOT, 'hub');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function connectWs(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options.protocols || undefined, options.wsOptions || undefined);
    const messages = [];
    ws.on('error', reject);
    ws.on('message', raw => {
      try { messages.push(JSON.parse(raw.toString('utf8'))); } catch { messages.push(raw.toString('utf8')); }
    });
    ws.on('open', () => resolve({ ws, messages }));
  });
}

function expectUpgradeRejection(url, options = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options.protocols || undefined, options.wsOptions || undefined);
    ws.on('open', () => {
      ws.close();
      reject(new Error(`Expected upgrade rejection for ${url}, but connection opened`));
    });
    ws.on('unexpected-response', (_req, res) => {
      res.resume();
      resolve(res.statusCode);
    });
    ws.on('error', () => {});
  });
}

async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = predicate();
    if (v) return v;
    await new Promise(r => setTimeout(r, 20));
  }
  return predicate();
}

test('Contract: new platform Type 1 & Type 2 modules contain ZERO game-specific identifiers and game servers live inside forge/Templates/<game>/server/', () => {
  const platformFiles = [
    'tools/ugc-shared/generic-spatial-room.cjs',
    'tools/ugc-shared/relay-ticket.cjs',
    'hub/server/spatial-relay-service.mjs',
    'forge/Tools/runtime-host/game-runtime-host.cjs',
    'deploy/cloudflare/spatial-relay-worker.mjs',
  ];
  const forbidden = /\b(tappy-chicken|flapTime|runDistance|42071|WALLS|catapult|thruster|reverse_thruster|brawllabs|fortress-war|captain-forever)\b/i;
  for (const rel of platformFiles) {
    const content = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    const hit = forbidden.exec(content);
    assert.equal(hit, null, `Game-specific term "${hit?.[0]}" leaked into platform file ${rel}`);
  }

  // Verify Type 2 game-owned servers now live inside each game template directory
  for (const game of ['brawllabs', 'fortress-war', 'captain-forever-mmo']) {
    const entry = path.join(REPO_ROOT, 'forge', 'Templates', game, 'server', 'entry.cjs');
    assert.ok(fs.existsSync(entry), `Expected game-owned server entry at ${entry}`);
    const meta = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'forge', 'Templates', game, 'metadata.json'), 'utf8'));
    assert.equal(meta.publishDefaults?.deployProfile?.runtimeConfig?.serverEntry, 'server/entry.cjs');
  }
  // Verify forge/Tools/*-multiplayer.cjs shims are thin re-exports (< 400 bytes)
  for (const shim of ['brawllabs-multiplayer.cjs', 'fortress-multiplayer.cjs', 'fortress-engine.cjs', 'captain-forever-mmo-multiplayer.cjs']) {
    const stat = fs.statSync(path.join(REPO_ROOT, 'forge', 'Tools', shim));
    assert.ok(stat.size < 400, `Expected ${shim} to be a thin compatibility shim, got ${stat.size} bytes`);
  }
  // Verify tappy-chicken-mmo declares Type 1 relay-spatial-v1
  const tappyMeta = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'forge', 'Templates', 'tappy-chicken-mmo', 'metadata.json'), 'utf8'));
  assert.equal(tappyMeta.publishDefaults?.deployProfile?.serverRuntime, 'relay-spatial-v1');
  assert.equal(tappyMeta.publishDefaults?.deployProfile?.relayConfig?.dimensions, 1);
});

test('Phase 0 Security: resolveClientIp fixes Caddy loopback 32-player cap bug while blocking untrusted header spoofing', async t => {
  // Unit checks for trusted vs untrusted proxy IP extraction
  assert.equal(resolveClientIp({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'cf-connecting-ip': '203.0.113.5' } }), '203.0.113.5');
  assert.equal(resolveClientIp({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers: { 'x-forwarded-for': '198.51.100.7, 127.0.0.1' } }), '198.51.100.7');
  assert.equal(resolveClientIp({ socket: { remoteAddress: '192.0.2.99' }, headers: { 'cf-connecting-ip': '203.0.113.5', 'x-forwarded-for': '1.2.3.4' } }), '192.0.2.99');

  // Live check behind loopback proxy: maxSocketsPerIp=4 allows 6 distinct real IPs, rejects 5th from same real IP
  const relay = createSpatialRelayService({ requireTicket: false, maxSocketsPerIp: 4, maxTotalSockets: 50 });
  const server = relay.createStandaloneServer();
  const port = await listen(server);
  const opened = [];
  t.after(async () => {
    for (const ws of opened) { try { ws.terminate(); } catch {} }
    await new Promise(r => server.close(r));
  });

  for (let i = 1; i <= 6; i += 1) {
    const c = await connectWs(`ws://127.0.0.1:${port}/ws/relay-spatial`, {
      wsOptions: { headers: { 'CF-Connecting-IP': `203.0.113.${i}` } },
    });
    opened.push(c.ws);
  }
  // Now 4 sockets from same real IP succeed, 5th returns 503
  for (let i = 0; i < 4; i += 1) {
    const c = await connectWs(`ws://127.0.0.1:${port}/ws/relay-spatial`, {
      wsOptions: { headers: { 'CF-Connecting-IP': '198.51.100.42' } },
    });
    opened.push(c.ws);
  }
  const status503 = await expectUpgradeRejection(`ws://127.0.0.1:${port}/ws/relay-spatial`, {
    wsOptions: { headers: { 'CF-Connecting-IP': '198.51.100.42' } },
  });
  assert.equal(status503, 503);
});

test('Phase 0+1 Auth: JoinTicket enforces signature, TTL, jti single-use replay protection, gameId binding & Hub /api/multiplayer/match', async t => {
  let fakeNow = 1700000000000;
  const authority = new RelayTicketAuthority({ secret: 'test-relay-secret-key-0123456789abcdef', now: () => fakeNow });

  const issued = authority.issue({ sub: 'user-1', name: 'VerifiedAlice', platform: 'web', gameId: 'alpha-game', runtime: 'relay-spatial-v1', ttlSec: 30 });
  // Wrong gameId fails
  assert.equal(authority.verify(issued.token, { expectedGameId: 'other-game', consume: false }).ok, false);
  // Tampered token fails
  assert.equal(authority.verify(issued.token.slice(0, -4) + 'AAAA', { consume: false }).reason, 'invalid_signature');
  // Valid first consumption succeeds
  const ok1 = authority.verify(issued.token, { expectedGameId: 'alpha-game', consume: true });
  assert.equal(ok1.ok, true);
  assert.equal(ok1.payload.name, 'VerifiedAlice');
  // Replay with same jti fails
  assert.equal(authority.verify(issued.token, { expectedGameId: 'alpha-game', consume: true }).reason, 'ticket_replayed');
  // Expired ticket fails
  const expiring = authority.issue({ sub: 'user-2', gameId: 'alpha-game', ttlSec: 10 });
  fakeNow += 20000;
  assert.equal(authority.verify(expiring.token, { consume: true }).reason, 'ticket_expired');

  // Verify live Hub POST /api/multiplayer/match + strict ugcMultiplayer requireTicket
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mp-match-'));
  const dataDir = path.join(temp, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const app = createApp({
    dataDir,
    dbPath: path.join(dataDir, 'hub.sqlite'),
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    secureCookies: false,
    userBaseUrl: 'http://127.0.0.1',
    userOrigins: ['http://127.0.0.1'],
    adminOrigins: ['http://127.0.0.1'],
    requireWsTicket: true,
    relayTicketSecret: 'hub-live-relay-secret-0123456789abcdef',
  }, { rootDir: HUB_ROOT, platformRoot: REPO_ROOT });
  const addrs = await app.listen();
  const base = `http://127.0.0.1:${addrs.public.port}`;
  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  // Unauthenticated WS connect with tampered ticket gets 401
  const rejected = await expectUpgradeRejection(`ws://127.0.0.1:${addrs.public.port}/ws/relay-spatial?ticket=invalid.token`);
  assert.equal(rejected, 401);

  // Seed a Type 1 game publication and obtain JoinTicket via authenticated session -> POST /api/multiplayer/match
  const sessRes = await fetch(`${base}/api/session`);
  const cookie = sessRes.headers.get('set-cookie')?.split(';')[0] || '';
  const sessBody = await sessRes.json();
  const nowMs = Date.now();
  app.db.prepare(`INSERT INTO hub_publications
    (game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
     visibility, deploy_mode, status, unpublished_by, artifact_sha256, artifact_base_url, manifest_json, deploy_profile_json,
     cas_version, published_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)`).run(
    'neon-glider-mmo', 'pneonglider01', 'a'.repeat(64), 'creator-1', '1'.repeat(24), '2'.repeat(24), null,
    'public', 'mmo', 'published', 'b'.repeat(64), '/play-ugc/pneonglider01/' + '2'.repeat(24),
    JSON.stringify({ schemaVersion: 1, id: 'neon-glider-mmo', title: { en: 'Neon Glider' }, entry: 'index.html', version: '1.0.0' }),
    JSON.stringify({ deployMode: 'mmo', serverRuntime: 'relay-spatial-v1', relayConfig: { dimensions: 2, aoiRadius: 300 } }),
    1, nowMs, nowMs
  );

  const matchRes = await fetch(`${base}/api/multiplayer/match`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
      'X-CSRF-Token': sessBody.csrfToken,
      Origin: 'http://127.0.0.1',
    },
    body: JSON.stringify({ gameId: 'neon-glider-mmo', platform: 'web' }),
  });
  assert.equal(matchRes.status, 201);
  const match = await matchRes.json();
  assert.equal(match.runtime, 'relay-spatial-v1');
  assert.equal(match.wsPath, '/ws/relay-spatial');
  assert.ok(match.joinTicket);

  // Connect with issued JoinTicket -> welcome receives verified session display name (not spoofed name)
  const client = await connectWs(`ws://127.0.0.1:${addrs.public.port}${match.wsPath}?ticket=${encodeURIComponent(match.joinTicket)}`, {
    protocols: ['playhub.v1'],
  });
  t.after(() => client.ws.close());
  client.ws.send(JSON.stringify({ t: 'join', name: 'SpoofedHacker', p: [10, 20] }));
  const welcome = await waitFor(() => client.messages.find(m => m.t === 'welcome'));
  assert.ok(welcome, 'Client with valid JoinTicket must receive welcome');
  assert.equal(welcome.gameId, 'neon-glider-mmo');
  assert.notEqual(welcome.name, 'SpoofedHacker');
});

test('Phase 1 Type 1 Relay: ONE game-agnostic SpatialRelayService runs 1D (tappy) and 2D (custom UGC) simultaneously with AOI & opaque payloads', async t => {
  const secret = 'type1-multi-game-secret-0123456789abcdef';
  const authority = new RelayTicketAuthority({ secret });
  const relay = createSpatialRelayService({
    ticketAuthority: authority,
    requireTicket: true,
    flushIntervalMs: 25,
    resolveGameRelayConfig: gameId => (
      gameId === 'tappy-chicken-mmo'
        ? { dimensions: 1, aoiRadius: 500, aoiHysteresis: 50, extrapolateVelocity: true }
        : { dimensions: 2, aoiRadius: 200, aoiHysteresis: 20, extrapolateVelocity: false }
    ),
  });
  const server = relay.createStandaloneServer();
  const port = await listen(server);
  const baseWs = `ws://127.0.0.1:${port}/ws/relay-spatial`;
  const sockets = [];
  t.after(async () => {
    for (const ws of sockets) { try { ws.terminate(); } catch {} }
    await new Promise(r => server.close(r));
  });

  // --- Game A: 1D game (`tappy-chicken-mmo`) ---
  const t1 = authority.issue({ sub: 'u1', name: 'RunnerA', gameId: 'tappy-chicken-mmo', runtime: 'relay-spatial-v1' }).token;
  const t2 = authority.issue({ sub: 'u2', name: 'RunnerB', gameId: 'tappy-chicken-mmo', runtime: 'relay-spatial-v1' }).token;
  const t3 = authority.issue({ sub: 'u3', name: 'RunnerFar', gameId: 'tappy-chicken-mmo', runtime: 'relay-spatial-v1' }).token;

  const a = await connectWs(`${baseWs}?ticket=${encodeURIComponent(t1)}`, { protocols: ['playhub.v1'] });
  const b = await connectWs(`${baseWs}?ticket=${encodeURIComponent(t2)}`, { protocols: ['playhub.v1'] });
  const far = await connectWs(`${baseWs}?ticket=${encodeURIComponent(t3)}`, { protocols: ['playhub.v1'] });
  sockets.push(a.ws, b.ws, far.ws);

  a.ws.send(JSON.stringify({ t: 'join', p: [100], v: [170], m: 1, d: [0, 260, 0] }));
  b.ws.send(JSON.stringify({ t: 'join', p: [200], v: [170], m: 1, d: [0, 280, 0] }));
  far.ws.send(JSON.stringify({ t: 'join', p: [2000], v: [170], m: 1, d: [0, 290, 0] }));

  const wA = await waitFor(() => a.messages.find(m => m.t === 'welcome'));
  const wB = await waitFor(() => b.messages.find(m => m.t === 'welcome'));
  await waitFor(() => far.messages.find(m => m.t === 'welcome'));
  assert.equal(wA.roomId, wB.roomId);

  a.ws.send(JSON.stringify({ t: 'pub', seq: 1, p: [140], v: [170], m: 1, k: 1, d: [1, 225, 3] }));
  const bGotA = await waitFor(() => b.messages.find(m => Array.isArray(m.b) && m.b.some(e => e[0] === wA.shortId && Array.isArray(e[2]) && e[2][2] === 3)));
  assert.ok(bGotA, 'Nearby 1D peer B must receive opaque payload from A');
  assert.equal(far.messages.some(m => Array.isArray(m.b) && m.b.some(e => e[0] === wA.shortId)), false, 'Far 1D peer must be AOI-filtered');

  // --- Game B: Brand-new 2D UGC game (`custom-2d-space-ugc`) on the SAME relay with ZERO platform edits ---
  const s1 = authority.issue({ sub: 'u4', name: 'Pilot1', gameId: 'custom-2d-space-ugc', runtime: 'relay-spatial-v1' }).token;
  const s2 = authority.issue({ sub: 'u5', name: 'Pilot2', gameId: 'custom-2d-space-ugc', runtime: 'relay-spatial-v1' }).token;
  const p1 = await connectWs(`${baseWs}?ticket=${encodeURIComponent(s1)}`, { protocols: ['playhub.v1'] });
  const p2 = await connectWs(`${baseWs}?ticket=${encodeURIComponent(s2)}`, { protocols: ['playhub.v1'] });
  sockets.push(p1.ws, p2.ws);

  p1.ws.send(JSON.stringify({ t: 'join', p: [50, 50], d: { ship: 'viper', hp: 100 } }));
  p2.ws.send(JSON.stringify({ t: 'join', p: [120, 80], d: { ship: 'titan', hp: 250 } }));
  const wP1 = await waitFor(() => p1.messages.find(m => m.t === 'welcome'));
  await waitFor(() => p2.messages.find(m => m.t === 'welcome'));

  p1.ws.send(JSON.stringify({ t: 'pub', seq: 1, p: [60, 60], d: { fire: 'laser', dmg: 15 } }));
  const p2GotFire = await waitFor(() => p2.messages.find(m => Array.isArray(m.b) && m.b.some(e => e[0] === wP1.shortId && e[2]?.fire === 'laser')));
  assert.ok(p2GotFire, '2D UGC peer must receive opaque JSON object untouched');
});

test('Phase 2 Type 2 RuntimeHost: dynamically launches game-owned BrawlLabs AND a synthetic UGC server in isolated processes with JoinTicket Gateway', async t => {
  const secret = 'type2-runtime-secret-0123456789abcdef';
  const authority = new RelayTicketAuthority({ secret });
  const host = new GameRuntimeHost({
    templatesDir: path.join(REPO_ROOT, 'forge', 'Templates'),
    ticketAuthority: authority,
    requireTicket: true,
  });
  const gateway = host.createStandaloneGatewayServer();
  const port = await listen(gateway);

  // Register a brand-new synthetic Type 2 UGC game in a temp directory (proving zero platform edits needed)
  const tmpGameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ugc-type2-game-'));
  fs.mkdirSync(path.join(tmpGameDir, 'server'), { recursive: true });
  fs.writeFileSync(path.join(tmpGameDir, 'metadata.json'), JSON.stringify({
    id: 'synthetic-arena-ugc',
    publishDefaults: {
      deployProfile: {
        deployMode: 'mo',
        serverRuntime: 'node-wss-v1',
        runtimeConfig: { serverEntry: 'server/entry.cjs', maxPlayersPerSession: 8, idleSleepSec: 60 },
      },
    },
  }));
  fs.writeFileSync(path.join(tmpGameDir, 'server', 'entry.cjs'), `
    'use strict';
    const http = require('node:http');
    const { WebSocketServer } = require('ws');
    const wss = new WebSocketServer({ noServer: true });
    const server = http.createServer((req, res) => {
      if (req.url === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, leakedSecret: Boolean(process.env.PLAYHUB_RELAY_TICKET_SECRET) }));
        return;
      }
      res.writeHead(404).end();
    });
    server.on('upgrade', (req, socket, head) => {
      wss.handleUpgrade(req, socket, head, ws => {
        ws.send(JSON.stringify({
          type: 'hello_ugc',
          sessionId: process.env.PLAYHUB_SESSION_ID,
          verifiedUser: req.headers['x-playhub-display-name'],
          hasHostSecret: Boolean(process.env.PLAYHUB_RELAY_TICKET_SECRET),
        }));
      });
    });
    process.on('SIGTERM', () => { wss.close(); server.close(() => process.exit(0)); });
    server.listen(Number(process.env.PLAYHUB_PORT), '127.0.0.1');
  `);
  host.registerGameDir('synthetic-arena-ugc', tmpGameDir);

  t.after(async () => {
    await host.shutdown();
    await new Promise(r => gateway.close(r));
    fs.rmSync(tmpGameDir, { recursive: true, force: true });
  });

  // 1. Launch migrated game-owned BrawlLabs server (forge/Templates/brawllabs/server/entry.cjs)
  const brawlSession = await host.launchSession('brawllabs', { sessionId: 'brawl01' });
  assert.equal(brawlSession.state, 'running');
  assert.equal(brawlSession.runtime, 'node-wss-v1');

  // Without JoinTicket -> 401 at WSS Gateway
  const unauthStatus = await expectUpgradeRejection(`ws://127.0.0.1:${port}${brawlSession.wsPath}`);
  assert.equal(unauthStatus, 401);

  // With valid JoinTicket -> connects to isolated BrawlLabs process and uses verified name
  const brawlTicket = authority.issue({ sub: 'u-brawl', name: 'BrawlChamp', gameId: 'brawllabs', roomId: 'brawl01', runtime: 'node-wss-v1' }).token;
  const brawlClient = await connectWs(`ws://127.0.0.1:${port}${brawlSession.wsPath}?ticket=${encodeURIComponent(brawlTicket)}`, { protocols: ['playhub.v1'] });
  t.after(() => brawlClient.ws.close());
  brawlClient.ws.send(JSON.stringify({ type: 'join', name: 'FakeName', team: 0 }));
  const brawlWelcome = await waitFor(() => brawlClient.messages.find(m => m.type === 'welcome'));
  assert.ok(brawlWelcome, 'BrawlLabs isolated runtime must reply with welcome');
  assert.equal(brawlWelcome.roomId, 'brawl01');

  // 2. Launch brand-new synthetic UGC Type 2 game dynamically & verify env isolation (no secret leak)
  const ugcSession = await host.launchSession('synthetic-arena-ugc', { sessionId: 'ugc01' });
  const ugcTicket = authority.issue({ sub: 'u-ugc', name: 'CreatorTester', gameId: 'synthetic-arena-ugc', roomId: 'ugc01', runtime: 'node-wss-v1' }).token;
  const ugcClient = await connectWs(`ws://127.0.0.1:${port}${ugcSession.wsPath}?ticket=${encodeURIComponent(ugcTicket)}`, { protocols: ['playhub.v1'] });
  t.after(() => ugcClient.ws.close());
  const hello = await waitFor(() => ugcClient.messages.find(m => m.type === 'hello_ugc'));
  assert.ok(hello);
  assert.equal(hello.sessionId, 'ugc01');
  assert.equal(hello.verifiedUser, 'CreatorTester');
  assert.equal(hello.hasHostSecret, false, 'Isolated Type 2 runtime must NOT inherit host secrets');

  // 3. Graceful SIGTERM stop removes session cleanly
  assert.equal(await host.stopSession('ugc01'), true);
  assert.equal(host.sessions.has('ugc01'), false);
});

test('Phase 3 Zero-Dep Relay: standalone spatial-relay-service runs cleanly without ws package (slim Hub Docker image compatibility)', async t => {
  const authority = new RelayTicketAuthority({ secret: 'slim-docker-relay-secret-0123456789abcdef' });
  const relay = createSpatialRelayService({
    ticketAuthority: authority,
    requireTicket: true,
    forceNativeWs: true,
    flushIntervalMs: 25,
  });
  const server = relay.createStandaloneServer();
  const port = await listen(server);
  const baseWs = `ws://127.0.0.1:${port}/ws/relay-spatial`;
  const opened = [];
  t.after(async () => {
    for (const ws of opened) { try { ws.terminate(); } catch {} }
    relay.close();
    server.closeAllConnections?.();
    await new Promise(r => server.close(r));
  });

  const rejected = await expectUpgradeRejection(`${baseWs}?ticket=bad.token`);
  assert.equal(rejected, 401);

  const tok1 = authority.issue({ sub: 'm1', name: 'SlimA', gameId: 'slim-demo', runtime: 'relay-spatial-v1' }).token;
  const tok2 = authority.issue({ sub: 'm2', name: 'SlimB', gameId: 'slim-demo', runtime: 'relay-spatial-v1' }).token;
  const c1 = await connectWs(`${baseWs}?ticket=${encodeURIComponent(tok1)}`, { protocols: ['playhub.v1'] });
  const c2 = await connectWs(`${baseWs}?ticket=${encodeURIComponent(tok2)}`, { protocols: ['playhub.v1'] });
  opened.push(c1.ws, c2.ws);

  c1.ws.send(JSON.stringify({ t: 'join', p: [10, 10], d: { tag: 'a' } }));
  c2.ws.send(JSON.stringify({ t: 'join', p: [20, 20], d: { tag: 'b' } }));
  const w1 = await waitFor(() => c1.messages.find(m => m.t === 'welcome'));
  await waitFor(() => c2.messages.find(m => m.t === 'welcome'));

  c1.ws.send(JSON.stringify({ t: 'pub', seq: 1, p: [15, 15], d: { ping: 777 } }));
  const got = await waitFor(() => c2.messages.find(m => Array.isArray(m.b) && m.b.some(e => e[0] === w1.shortId && e[2]?.ping === 777)));
  assert.ok(got, 'Native zero-dependency WS relay must forward batched opaque payloads');
});

test('Phase 3 Mobile + Web Client Flow: /api/mobile/play-sessions and /api/mobile/multiplayer/match issue signed JoinTickets', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-mobile-ticket-'));
  const dataDir = path.join(temp, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const app = createApp({
    dataDir,
    dbPath: path.join(dataDir, 'hub.sqlite'),
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    secureCookies: false,
    userBaseUrl: 'http://127.0.0.1',
    userOrigins: ['http://127.0.0.1'],
    adminOrigins: ['http://127.0.0.1'],
    mobile: { enabled: true },
    requireWsTicket: true,
    relayTicketSecret: 'mobile-ticket-secret-0123456789abcdef',
  }, { rootDir: HUB_ROOT, platformRoot: REPO_ROOT });
  const addrs = await app.listen();
  const base = `http://127.0.0.1:${addrs.public.port}`;
  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  // Seed Type 1 game publication
  const nowMs = Date.now();
  app.db.prepare(`INSERT INTO hub_publications
    (game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
     visibility, deploy_mode, status, unpublished_by, artifact_sha256, artifact_base_url, manifest_json, deploy_profile_json,
     cas_version, published_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)`).run(
    'sky-glide-mmo', 'pskyglidemmoaaaaa', 'c'.repeat(64), 'creator-2', '3'.repeat(24), '4'.repeat(24), null,
    'public', 'mmo', 'published', 'd'.repeat(64), '/play-ugc/pskyglidemmoaaaaa/' + '4'.repeat(24),
    JSON.stringify({ schemaVersion: 1, id: 'sky-glide-mmo', title: { en: 'Sky Glide' }, entry: 'index.html', version: '1.0.0' }),
    JSON.stringify({ deployMode: 'mmo', serverRuntime: 'relay-spatial-v1', relayConfig: { dimensions: 1, aoiRadius: 520 } }),
    1, nowMs, nowMs
  );

  // Mobile guest login -> age-gate -> play-session returns signed joinTicket
  const guestAuth = await (await fetch(`${base}/api/mobile/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
  await fetch(`${base}/api/mobile/age-gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestAuth.accessToken}` },
    body: JSON.stringify({ birthYear: 1995, birthMonth: 6, regionCode: 'KR' }),
  });

  const sessRes = await fetch(`${base}/api/mobile/play-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestAuth.accessToken}` },
    body: JSON.stringify({ gameId: 'sky-glide-mmo', partyCode: 'SQD99' }),
  });
  const sessText = await sessRes.text();
  assert.equal(sessRes.status, 201, sessText);
  const sess = JSON.parse(sessText);
  assert.equal(sess.multiplayer?.runtime, 'relay-spatial-v1');
  assert.equal(sess.multiplayer?.protocol, 'playhub.relay.v1');
  assert.equal(sess.multiplayer?.wsPath, '/ws/relay-spatial');
  assert.ok(sess.multiplayer?.joinTicket, 'Mobile play-session must include signed JoinTicket');

  // Re-match endpoint issues a fresh ticket
  const matchRes = await fetch(`${base}/api/mobile/multiplayer/match`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestAuth.accessToken}` },
    body: JSON.stringify({ gameId: 'sky-glide-mmo', partyCode: 'SQD99' }),
  });
  assert.equal(matchRes.status, 201);
  const refreshed = await matchRes.json();
  assert.ok(refreshed.joinTicket && refreshed.joinTicket !== sess.multiplayer.joinTicket);

  // Connect using the mobile JoinTicket
  const mobWs = await connectWs(`ws://127.0.0.1:${addrs.public.port}${refreshed.wsPath}?ticket=${encodeURIComponent(refreshed.joinTicket)}`, { protocols: ['playhub.v1'] });
  t.after(() => mobWs.ws.close());
  mobWs.ws.send(JSON.stringify({ t: 'join', p: [0] }));
  const welcome = await waitFor(() => mobWs.messages.find(m => m.t === 'welcome'));
  assert.ok(welcome);
  assert.equal(welcome.partyCode, 'SQD99');
  assert.equal(welcome.platform, 'android');

  // Verify Web app.js integrates matchPath + ticket + protocol query params
  const webAppSrc = fs.readFileSync(path.join(REPO_ROOT, 'hub', 'web', 'user', 'app.js'), 'utf8');
  assert.match(webAppSrc, /mpInfo\.matchPath/);
  assert.match(webAppSrc, /&ticket=\$\{encodeURIComponent\(ticketParam\)\}/);
  assert.match(webAppSrc, /&protocol=\$\{encodeURIComponent\(protoParam\)\}/);
});

test('Phase 3 Single-Game Publisher: preserves deployProfile and packages game-owned Server/ bundle atomically', async t => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-decouple-'));
  fs.mkdirSync(path.join(tempRoot, 'games'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'hub'), { recursive: true });
  // Symlink/junction forge dir into tempRoot so publisher reads real Templates/ without mutating repo games/
  fs.symlinkSync(path.join(REPO_ROOT, 'forge'), path.join(tempRoot, 'forge'), 'junction');
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const publisher = createForgeTemplatePublisher({
    platformRoot: tempRoot,
    exportTemplate: async (_tpl, outDir) => {
      fs.writeFileSync(path.join(outDir, 'index.html'), '<html>ok</html>', 'utf8');
    },
    syncAndBuild: async () => {},
  });

  const started = publisher.startBatchPublish({ templateIds: ['tappy-chicken-mmo', 'brawllabs'], rebuildDist: false });
  const done = await waitFor(() => {
    const st = publisher.getJob(started.id);
    return st && ['completed', 'failed', 'partial'].includes(st.status) ? st : null;
  }, 5000);
  assert.equal(done.status, 'completed', JSON.stringify(done));

  // Type 1: tappy-chicken-mmo manifest carries full deployProfile (relay-spatial-v1 + relayConfig)
  const tappyManifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'games', 'forge-tappy-chicken-mmo', 'game.manifest.json'), 'utf8'));
  assert.equal(tappyManifest.deployProfile?.serverRuntime, 'relay-spatial-v1');
  assert.equal(tappyManifest.deployProfile?.relayConfig?.dimensions, 1);

  // Type 2: brawllabs packages its own Server/entry.cjs and records serverBundle metadata
  const brawlManifest = JSON.parse(fs.readFileSync(path.join(tempRoot, 'games', 'forge-brawllabs', 'game.manifest.json'), 'utf8'));
  assert.equal(brawlManifest.deployProfile?.serverRuntime, 'node-wss-v1');
  assert.equal(brawlManifest.serverBundle?.entry, 'server/entry.cjs');
  assert.ok(fs.existsSync(path.join(tempRoot, 'games', 'forge-brawllabs', 'Server', 'entry.cjs')));
});
