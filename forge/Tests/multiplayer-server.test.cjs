'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { WebSocket } = require('ws');
const { createServer: createForgeServer } = require('../server.cjs');
const { createMultiplayerServer, isMultiplayerHttpRoute, isMultiplayerWsRoute } = require('../Tools/multiplayer-server.cjs');

const SECRET = 'multiplayer-separation-secret-0123456789abcdef';
const ORIGIN = 'http://127.0.0.1:18080';
const ALICE_KEY = 'a'.repeat(64);
const BOB_KEY = 'b'.repeat(64);
const CSRF = 'mp-csrf-token';
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const closeServer = server => new Promise(resolve => {
  if (!server) return resolve();
  server.closeAllConnections?.();
  server.close(() => resolve());
});

test('multiplayer route classifiers match only room APIs and game WebSocket endpoints', () => {
  assert.equal(isMultiplayerHttpRoute('/api/brawllabs/rooms/0123456789ab'), true);
  assert.equal(isMultiplayerHttpRoute('/api/fortress-war/rooms/abcdef012345'), true);
  assert.equal(isMultiplayerHttpRoute('/api/tappy-chicken-mmo/rooms/fedcba987654'), true);
  assert.equal(isMultiplayerHttpRoute('/api/platform/projects'), false);
  assert.equal(isMultiplayerWsRoute('/brawllabs'), true);
  assert.equal(isMultiplayerWsRoute('/fortress-war'), true);
  assert.equal(isMultiplayerWsRoute('/tappy-chicken-mmo'), true);
  assert.equal(isMultiplayerWsRoute('/collaboration'), false);
});

test('P6: dedicated multiplayer server validates builds via Forge /internal/v1 and keeps matches alive when Forge editor restarts', async t => {
  const { createForgeProxy } = await import(pathToFileURL(path.resolve(__dirname, '../../hub/tools/forge-proxy.mjs')).href);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-mp-p6-'));
  const accountsDir = path.join(temp, 'accounts');
  const studiosDir = path.join(temp, 'studios');
  const buildDir = path.join(temp, 'builds');

  const verifyStub = async (_url, init) => {
    const body = JSON.parse(init.body || '{}');
    const cookie = String(body.cookie || '');
    if (cookie.includes('user=alice')) {
      return {
        status: 200,
        json: async () => ({
          authenticated: true,
          userId: 'alice',
          displayName: 'Alice',
          accountKey: ALICE_KEY,
          identity: { iss: 'https://accounts.google.com', sub: 'alice' },
          csrfToken: CSRF,
        }),
      };
    }
    if (cookie.includes('user=bob')) {
      return {
        status: 200,
        json: async () => ({
          authenticated: true,
          userId: 'bob',
          displayName: 'Bob',
          accountKey: BOB_KEY,
          identity: { iss: 'https://accounts.google.com', sub: 'bob' },
          csrfToken: CSRF,
        }),
      };
    }
    return {
      status: 401,
      json: async () => ({ authenticated: false, error: 'SESSION_REQUIRED' }),
    };
  };

  let forgeServer = createForgeServer({
    publicOrigin: ORIGIN,
    basePath: '/forge',
    buildDirectory: buildDir,
    hubAuth: {
      verifyUrl: 'http://127.0.0.1:9/internal/session/verify',
      internalSecret: SECRET,
      accountsDirectory: accountsDir,
      studioDirectory: studiosDir,
      fetchImpl: verifyStub,
    },
  });
  const forgePort = await listen(forgeServer);

  const mpServer = createMultiplayerServer({
    publicOrigin: ORIGIN,
    basePath: '/forge',
    forgeInternalUrl: `http://127.0.0.1:${forgePort}`,
    internalSecret: SECRET,
    hubAuth: {
      verifyUrl: 'http://127.0.0.1:9/internal/session/verify',
      internalSecret: SECRET,
      fetchImpl: verifyStub,
    },
  });
  const mpPort = await listen(mpServer);

  const proxy = createForgeProxy({
    upstream: `http://127.0.0.1:${forgePort}`,
    multiplayerUpstream: `http://127.0.0.1:${mpPort}`,
    basePath: '/forge',
  });
  const proxyServer = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (proxy.matches(pathname)) return proxy.handle(req, res);
    res.writeHead(404).end();
  });
  proxyServer.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (proxy.matches(pathname)) return proxy.upgrade(req, socket, head);
    socket.destroy();
  });
  const proxyPort = await listen(proxyServer);
  const proxyBase = `http://127.0.0.1:${proxyPort}`;
  const openSockets = [];

  t.after(async () => {
    for (const ws of openSockets) {
      try { ws.terminate(); } catch {}
    }
    proxy.close();
    await closeServer(proxyServer);
    mpServer.shutdown();
    forgeServer?.shutdown();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  // 1. Create a BrawlLabs project as Alice on Forge and seed a succeeded build.
  const createRes = await fetch(`${proxyBase}/forge/api/platform/projects`, {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      Cookie: 'user=alice',
      'Content-Type': 'application/json',
      'X-CSRF-Token': CSRF,
    },
    body: JSON.stringify({ name: 'Alice Brawl', template: 'brawllabs', mode: 'ready' }),
  });
  assert.equal(createRes.status, 201);
  const project = (await createRes.json()).project;
  const buildId = 'abcdef0123456789';
  const buildOut = path.join(buildDir, buildId, 'output');
  fs.mkdirSync(buildOut, { recursive: true });
  fs.writeFileSync(path.join(buildOut, 'index.html'), '<html>brawl</html>');
  fs.writeFileSync(path.join(buildDir, buildId, 'result.json'), JSON.stringify({
    id: buildId,
    projectId: project.id,
    revision: 1,
    ownerKey: ALICE_KEY,
    target: 'web',
    status: 'succeeded',
    files: ['index.html'],
    sourceHash: sha256('brawl'),
    previewUrl: `/api/builds/${buildId}/files/index.html`,
  }));

  function connectBrawl(cookie) {
    const ws = new WebSocket(`ws://127.0.0.1:${proxyPort}/forge/brawllabs`, {
      headers: { Origin: ORIGIN, Cookie: cookie },
    });
    openSockets.push(ws);
    const queue = [];
    const waiters = [];
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      const idx = waiters.findIndex(w => w.predicate(msg));
      if (idx >= 0) {
        const [{ resolve, timer }] = waiters.splice(idx, 1);
        clearTimeout(timer);
        resolve(msg);
      } else {
        queue.push(msg);
      }
    });
    const nextMessage = (predicate, timeoutMs = 4000) => {
      const bufferedIdx = queue.findIndex(predicate);
      if (bufferedIdx >= 0) return Promise.resolve(queue.splice(bufferedIdx, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('WebSocket message timeout')), timeoutMs);
        waiters.push({ predicate, resolve, timer });
      });
    };
    return { ws, nextMessage };
  }

  // 2. Bob cannot create a new room using Alice's buildId (Forge internal API enforces ownerKey).
  const bobAttempt = connectBrawl('user=bob');
  await new Promise((resolve, reject) => { bobAttempt.ws.once('open', resolve); bobAttempt.ws.once('error', reject); });
  bobAttempt.ws.send(JSON.stringify({ type: 'join', name: 'Bob', projectId: project.id, buildId }));
  const bobErr = await bobAttempt.nextMessage(m => m.type === 'error');
  assert.match(bobErr.error, /빌드/);
  bobAttempt.ws.close();

  // 3. Alice creates a room; multiplayer server validates build via Forge /internal/v1/accounts/{key}/template-builds/...
  const aliceConn = connectBrawl('user=alice');
  await new Promise((resolve, reject) => { aliceConn.ws.once('open', resolve); aliceConn.ws.once('error', reject); });
  aliceConn.ws.send(JSON.stringify({ type: 'join', name: 'Alice', team: 0, projectId: project.id, buildId }));
  const welcomeAlice = await aliceConn.nextMessage(m => m.type === 'welcome');
  assert.equal(welcomeAlice.projectId, project.id);
  assert.equal(welcomeAlice.buildId, buildId);
  const roomId = welcomeAlice.roomId;

  // 4. Shut down the Forge editor server completely to simulate an editor crash or deployment restart!
  forgeServer.shutdown();
  forgeServer = null;

  // Verify the Forge editor is actually unreachable (502 FORGE_UNAVAILABLE).
  const editorWhileDown = await fetch(`${proxyBase}/forge/api/platform/projects`, {
    headers: { Origin: ORIGIN, Cookie: 'user=alice' },
  });
  assert.equal(editorWhileDown.status, 502);

  // 5. While Forge editor is DOWN, room metadata API and live WebSocket match on multiplayerServer keep working!
  const roomMetaRes = await fetch(`${proxyBase}/forge/api/brawllabs/rooms/${roomId}`, {
    headers: { Origin: ORIGIN, Cookie: 'user=bob' },
  });
  assert.equal(roomMetaRes.status, 200);
  const roomMeta = await roomMetaRes.json();
  assert.equal(roomMeta.room.roomId, roomId);
  assert.equal(roomMeta.room.players, 1);

  // Bob joins the active room by roomId while Forge editor is down, and both players ready up.
  const bobConn = connectBrawl('user=bob');
  await new Promise((resolve, reject) => { bobConn.ws.once('open', resolve); bobConn.ws.once('error', reject); });
  bobConn.ws.send(JSON.stringify({ type: 'join', roomId, name: 'Bob', team: 1, projectId: project.id, buildId }));
  const welcomeBob = await bobConn.nextMessage(m => m.type === 'welcome');
  assert.equal(welcomeBob.roomId, roomId);

  aliceConn.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  bobConn.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  const countdownState = await aliceConn.nextMessage(m => m.type === 'state' && m.phase === 'countdown');
  assert.equal(countdownState.players.length, 2);
});
