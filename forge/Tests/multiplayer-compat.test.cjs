'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocket } = require('ws');
const { createMultiplayerServer } = require('../Tools/multiplayer-server.cjs');
const { COMPAT_WS_CLOSE_FORCE_UPDATE } = require('../Tools/multiplayer-compat.cjs');

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
});
