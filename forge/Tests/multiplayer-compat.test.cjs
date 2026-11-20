'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { WebSocket } = require('ws');
const { createMultiplayerServer } = require('../Tools/multiplayer-server.cjs');
const { COMPAT_WS_CLOSE_FORCE_UPDATE } = require('../Tools/multiplayer-compat.cjs');
const { attachTappyChickenMmo } = require('../Tools/tappy-chicken-mmo-multiplayer.cjs');

const PROJECT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BUILD_ID = 'bbbbbbbbbbbbbbbb';

async function startServer(envOverrides = {}, policyPatch = null) {
  const server = createMultiplayerServer({
    hubAuth: false,
    publicOrigin: '',
    env: {
      PLAYFORGE_CHANNEL: 'live',
      PLAYFORGE_BUILD_NUM: '42',
      PLAYFORGE_DAILY_SEQ: '10',
      PLAYFORGE_BUILD_DATE: '2026-11-20T16:32:00Z',
      PLAYFORGE_BRANCH: 'PlayHub-Platform',
      PLAYFORGE_COMMIT: '13c70ba',
      PLAYFORGE_ENGINE_ABI: 'godot-4.7',
      PLAYFORGE_ENGINE_API_REV: '2',
      PLAYFORGE_MIN_ENGINE_API_REV: '2',
      PLAYFORGE_NET_PROTOCOL: '1.2',
      PLAYFORGE_GAMEPLAY_HASH: 'rules-v2',
      PLAYFORGE_UPDATE_POLICY: 'optional',
      ...envOverrides,
    },
    validateTemplateBuild: () => async (buildId, projectId) => ({
      id: buildId,
      projectId,
      revision: 1,
      previewUrl: `/api/builds/${buildId}/files/index.html`,
    }),
  });
  if (policyPatch) server.compat.updatePolicy(policyPatch, 'test-ops');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}`, wsBase: `ws://127.0.0.1:${port}` };
}

function collectWsUntilClose(url, onOpen) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const ws = new WebSocket(url);
    let unexpectedStatus = null;
    ws.on('unexpected-response', (_req, res) => {
      unexpectedStatus = res.statusCode;
      let body = '';
      res.on('data', chunk => { body += chunk.toString('utf8'); });
      res.on('end', () => resolve({ unexpectedStatus, headers: res.headers, body: body ? JSON.parse(body) : null, messages, closeCode: null, closeReason: '' }));
    });
    ws.on('open', () => {
      if (typeof onOpen === 'function') onOpen(ws);
    });
    ws.on('message', raw => {
      messages.push(JSON.parse(raw.toString('utf8')));
    });
    ws.on('close', (code, reasonBuf) => {
      if (unexpectedStatus !== null) return;
      resolve({ unexpectedStatus: null, messages, closeCode: code, closeReason: reasonBuf.toString('utf8') });
    });
    ws.on('error', err => {
      if (unexpectedStatus !== null) return;
      reject(err);
    });
  });
}

test('Multiplayer server enforces COMPAT_* over HTTP, WS upgrade (4009 / 426), and WS join handshake', async t => {
  const { server, baseUrl, wsBase } = await startServer({}, {
    targets: {
      aos: { updatePolicy: 'force', latestBuildCode: 2026112110, graceMinutes: 0 },
      ios: { updatePolicy: 'optional', latestBuildCode: 2026112110 },
    },
    activePools: [
      {
        poolId: 'drain-v1',
        gameplayHash: 'rules-v1',
        endpoint: 'wss://drain-v1.playforge.example/tappy-chicken-mmo',
        expiresAtUtc: '2099-01-01T00:00:00Z',
      },
    ],
  });
  t.after(() => server.shutdown());

  // 1. HTTP /api/health & /api/version & POST /api/compat/check
  const health = await fetch(`${baseUrl}/api/health`).then(r => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.buildCode, 2026112110);
  assert.match(health.buildId, /^godot-server-v/);

  const ver = await fetch(`${baseUrl}/api/version`).then(r => r.json());
  assert.equal(ver.ok, true);
  assert.equal(ver.buildInfo.target, 'godot-server');
  // /api/version must expose ONLY public policy summary (no activePools endpoints or updatedBy)
  assert.equal(ver.releasePolicy.activePools, undefined);
  assert.equal(ver.releasePolicy.updatedBy, undefined);
  assert.equal(ver.releasePolicy.targets.aos.updatePolicy, 'force');
  assert.equal(ver.releasePolicy.targets['godot-server'].latestBuildCode, 2026112110);

  const checkBlock = await fetch(`${baseUrl}/api/compat/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target: 'aos', buildCode: 2026112105, engineAbi: 'godot-4.7', engineApiRev: 2, netProtocol: '1.2', gameplayHash: 'rules-v2' }),
  });
  assert.equal(checkBlock.status, 426);
  const checkBlockJson = await checkBlock.json();
  assert.equal(checkBlockJson.decision, 'COMPAT_BLOCK_FORCE_UPDATE');
  assert.equal(checkBlockJson.reason, 'COMPAT_REASON_POLICY_FORCE_UPDATE');

  // 2. WS query mismatch (engineAbi=godot-4.6) -> receives compat JSON then closes with WS 4009
  const wsAbiBlock = await collectWsUntilClose(`${wsBase}/tappy-chicken-mmo?engineAbi=godot-4.6`);
  assert.equal(wsAbiBlock.closeCode, COMPAT_WS_CLOSE_FORCE_UPDATE);
  assert.equal(wsAbiBlock.closeReason, 'COMPAT_REASON_ENGINE_ABI_MISMATCH');
  assert.equal(wsAbiBlock.messages[0].type, 'compat');
  assert.equal(wsAbiBlock.messages[0].decision, 'COMPAT_BLOCK_FORCE_UPDATE');

  // 3. WS query mismatch with compatMode=http -> rejected at HTTP upgrade with 426 Upgrade Required
  const wsHttp426 = await collectWsUntilClose(`${wsBase}/brawllabs?engineAbi=godot-4.6&compatMode=http`);
  assert.equal(wsHttp426.unexpectedStatus, 426);
  assert.equal(wsHttp426.headers['x-playhub-compat-decision'], 'COMPAT_BLOCK_FORCE_UPDATE');
  assert.equal(wsHttp426.body.reason, 'COMPAT_REASON_ENGINE_ABI_MISMATCH');

  // 4. Fortress War WS join with forced-outdated AOS client -> receives compat JSON + closes with WS 4009
  const wsJoinForce = await collectWsUntilClose(`${wsBase}/fortress-war`, ws => {
    ws.send(JSON.stringify({
      type: 'join',
      projectId: PROJECT_ID,
      buildId: BUILD_ID,
      name: 'OldAos',
      compat: {
        target: 'aos',
        buildCode: 2026112101,
        engineAbi: 'godot-4.7',
        engineApiRev: 2,
        netProtocol: '1.2',
        gameplayHash: 'rules-v2',
      },
    }));
  });
  assert.equal(wsJoinForce.closeCode, COMPAT_WS_CLOSE_FORCE_UPDATE);
  assert.equal(wsJoinForce.closeReason, 'COMPAT_REASON_POLICY_FORCE_UPDATE');
  assert.equal(wsJoinForce.messages[0].decision, 'COMPAT_BLOCK_FORCE_UPDATE');

  // 5. Soft update (netProtocol=1.1) -> gets compat advisory AND joins room normally
  const softMsgs = await new Promise((resolve, reject) => {
    const got = [];
    const ws = new WebSocket(`${wsBase}/tappy-chicken-mmo?target=ios&buildCode=2026112110&engineAbi=godot-4.7&engineApiRev=2&netProtocol=1.1&gameplayHash=rules-v2`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'MinorClient' }));
    });
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString('utf8'));
      got.push(m);
      if (m.type === 'welcome') {
        ws.close();
        resolve(got);
      }
    });
    ws.on('error', reject);
  });
  assert.equal(softMsgs[0].type, 'compat');
  assert.equal(softMsgs[0].decision, 'COMPAT_ALLOW_SOFT_UPDATE');
  assert.equal(softMsgs[0].reason, 'COMPAT_REASON_MINOR_BEHIND');
  assert.ok(softMsgs.some(m => m.type === 'welcome'));

  // 6. Older gameplayHash -> receives COMPAT_ROUTE_LEGACY_POOL pointing to drain-v1
  const poolMsg = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/tappy-chicken-mmo?target=ios&buildCode=2026112110&engineAbi=godot-4.7&engineApiRev=2&netProtocol=1.2&gameplayHash=rules-v1`);
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString('utf8'));
      ws.close();
      resolve(m);
    });
    ws.on('error', reject);
  });
  assert.equal(poolMsg.type, 'compat');
  assert.equal(poolMsg.decision, 'COMPAT_ROUTE_LEGACY_POOL');
  assert.equal(poolMsg.targetPool.poolId, 'drain-v1');

  // 7. Legacy client without compat metadata still connects and joins normally
  const legacyWelcome = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsBase}/brawllabs`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'LegacyPlayer' }));
    });
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString('utf8'));
      if (m.type === 'welcome') {
        ws.close();
        resolve(m);
      }
    });
    ws.on('error', reject);
  });
  assert.equal(legacyWelcome.type, 'welcome');

  // 8. ROUTE_LEGACY_POOL rejects join (both via join.compat and via WS upgrade query)
  const routeJoinMsgs = await new Promise((resolve, reject) => {
    const got = [];
    const ws = new WebSocket(`${wsBase}/tappy-chicken-mmo`);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'join',
        projectId: PROJECT_ID,
        buildId: BUILD_ID,
        name: 'LegacyRuleBird',
        compat: {
          target: 'ios',
          buildCode: 2026112110,
          engineAbi: 'godot-4.7',
          engineApiRev: 2,
          netProtocol: '1.2',
          gameplayHash: 'rules-v1',
        },
      }));
    });
    ws.on('message', raw => {
      got.push(JSON.parse(raw.toString('utf8')));
    });
    ws.on('error', reject);
    setTimeout(() => {
      ws.close();
      resolve(got);
    }, 150);
  });
  assert.equal(routeJoinMsgs.length, 1);
  assert.equal(routeJoinMsgs[0].type, 'compat');
  assert.equal(routeJoinMsgs[0].decision, 'COMPAT_ROUTE_LEGACY_POOL');
  assert.equal(routeJoinMsgs[0].targetPool.poolId, 'drain-v1');
  assert.equal(routeJoinMsgs.some(m => m.type === 'welcome'), false);

  const routeQueryJoinMsgs = await new Promise((resolve, reject) => {
    const got = [];
    const ws = new WebSocket(`${wsBase}/tappy-chicken-mmo?target=ios&buildCode=2026112110&engineAbi=godot-4.7&engineApiRev=2&netProtocol=1.2&gameplayHash=rules-v1`);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'LegacyQueryBird' }));
    });
    ws.on('message', raw => {
      got.push(JSON.parse(raw.toString('utf8')));
    });
    ws.on('error', reject);
    setTimeout(() => {
      ws.close();
      resolve(got);
    }, 150);
  });
  assert.ok(routeQueryJoinMsgs.some(m => m.type === 'compat' && m.decision === 'COMPAT_ROUTE_LEGACY_POOL'));
  assert.equal(routeQueryJoinMsgs.some(m => m.type === 'welcome'), false);
});

test('Tappy Chicken MMO enforces rate limit, join timeout, heartbeat, and activeRoom rollback on join failure', async t => {
  const srv = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
  const mmo = attachTappyChickenMmo(srv, {
    validateBuild: async (buildId, projectId) => ({
      id: buildId,
      projectId,
      revision: 1,
      previewUrl: `/api/builds/${buildId}/files/index.html`,
    }),
    joinTimeoutMs: 120,
    heartbeatIntervalMs: 80,
    maxMessagesPerSec: 3,
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();
  const wsUrl = `ws://127.0.0.1:${port}/tappy-chicken-mmo`;
  t.after(async () => {
    mmo.close();
    await new Promise(resolve => srv.close(resolve));
  });

  // 1. Join timeout closes idle socket with 1008
  const timeoutRes = await collectWsUntilClose(wsUrl);
  assert.equal(timeoutRes.closeCode, 1008);
  assert.equal(timeoutRes.closeReason, 'Join required');

  // 2. Rate limit rejects burst beyond maxMessagesPerSec
  const rateMsgs = await new Promise((resolve, reject) => {
    const got = [];
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'RateBird' }));
      for (let i = 1; i <= 5; i++) {
        ws.send(JSON.stringify({ type: 'rpc', method: 'server_player_event', params: { eventType: 'sync', seq: i } }));
      }
    });
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString('utf8'));
      got.push(m);
      if (m.type === 'error' && m.error.includes('요청이 너무 빠릅니다')) {
        ws.close();
        resolve(got);
      }
    });
    ws.on('error', reject);
  });
  assert.ok(rateMsgs.some(m => m.type === 'error' && m.error.includes('요청이 너무 빠릅니다')));

  // 3. Join failure (full room) rolls back activeRoom so same socket can join another room
  const hostWs = new WebSocket(wsUrl);
  const fullRoomId = await new Promise((resolve, reject) => {
    hostWs.on('open', () => hostWs.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'Host' })));
    hostWs.on('message', raw => {
      const m = JSON.parse(raw.toString('utf8'));
      if (m.type === 'welcome') resolve(m.roomId);
    });
    hostWs.on('error', reject);
  });
  t.after(() => hostWs.close());

  // Fill room to MAX_PLAYERS (64)
  const room = mmo.rooms.get(fullRoomId);
  for (let i = room.players.size; i < 64; i++) {
    room.join(`Bot${i}`);
  }

  const retryResult = await new Promise((resolve, reject) => {
    const got = [];
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      // First attempt fails because fullRoomId is full
      ws.send(JSON.stringify({ type: 'join', roomId: fullRoomId, name: 'RetryBird' }));
    });
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString('utf8'));
      got.push(m);
      if (m.type === 'error' && got.length === 1) {
        // Retry creating a fresh room on the SAME socket — must succeed (activeRoom rolled back!)
        ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'RetryBird' }));
      } else if (m.type === 'welcome') {
        ws.close();
        resolve(got);
      }
    });
    ws.on('error', reject);
  });
  assert.ok(retryResult.some(m => m.type === 'error' && m.error.includes('가득 찼습니다')));
  assert.ok(retryResult.some(m => m.type === 'welcome' && m.roomId !== fullRoomId));

  // 4. Heartbeat terminates joined client that stops replying with pong
  const hbClosed = await new Promise((resolve, reject) => {
    let gotPing = false;
    const ws = new WebSocket(wsUrl, { autoPong: false });
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', projectId: PROJECT_ID, buildId: BUILD_ID, name: 'SilentBird' }));
    });
    ws.on('ping', () => { gotPing = true; });
    ws.on('close', code => resolve({ gotPing, code }));
    ws.on('error', reject);
  });
  assert.equal(hbClosed.gotPing, true);
  assert.equal(hbClosed.code, 1006);
});
