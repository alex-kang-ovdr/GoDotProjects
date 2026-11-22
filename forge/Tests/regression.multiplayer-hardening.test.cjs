'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');

const { attachBrawlLabs, BrawlRoom } = require('../Tools/brawllabs-multiplayer.cjs');
const { attachFortressWar, FortressRoom } = require('../Tools/fortress-multiplayer.cjs');
const { attachTappyChickenMmo } = require('../Tools/tappy-chicken-mmo-multiplayer.cjs');
const { attachCaptainForeverMmo } = require('../Tools/captain-forever-mmo-multiplayer.cjs');
const {
  createMultiplayerCompat,
  COMPAT_DECISIONS,
  COMPAT_REASONS,
  COMPAT_WS_CLOSE_FORCE_UPDATE,
} = require('../Tools/multiplayer-compat.cjs');
const { createMultiplayerServer } = require('../Tools/multiplayer-server.cjs');

const VALID_PROJECT_ID = '0123456789abcdef01234567';
const VALID_BUILD_ID = '0123456789abcdef';
const POISON = Object.freeze({ toString: 1, valueOf: 1 });

function makeValidBuild(buildId = VALID_BUILD_ID, projectId = VALID_PROJECT_ID) {
  return {
    id: buildId,
    projectId,
    revision: 1,
    previewUrl: `/api/builds/${buildId}/files/index.html`,
  };
}

function createCompatGate() {
  return createMultiplayerCompat({
    env: {
      PLAYFORGE_CHANNEL: 'live',
      PLAYFORGE_BUILD_NUM: '100',
      PLAYFORGE_DAILY_SEQ: '1',
      PLAYFORGE_BUILD_DATE: '2026-11-22T00:00:00Z',
      PLAYFORGE_ENGINE_ABI: 'godot-4.7',
      PLAYFORGE_ENGINE_API_REV: '1',
      PLAYFORGE_MIN_ENGINE_API_REV: '1',
      PLAYFORGE_NET_PROTOCOL: '1.0',
      PLAYFORGE_GAMEPLAY_HASH: 'default',
      PLAYFORGE_UPDATE_POLICY: 'optional',
    },
  });
}

const MULTIPLAYER_SERVERS = [
  {
    id: 'brawllabs',
    wsPath: '/brawllabs',
    attach: attachBrawlLabs,
    maxPayload: 4096,
    oversizedExceedsWsLimit: true,
    oversizedBytes: 40 * 1024,
    buildPostJoinPoisonPayloads: () => [
      { type: 'team', team: POISON },
      { type: 'ready', ready: POISON },
      { type: POISON },
    ],
    buildInvalidNumericPayloads: () => [
      '{"type":"team","team":1e309}',
      '{"type":"input","seq":1,"moveX":1e309,"moveY":-1e309,"aimX":1e309,"aimY":null}',
      '{"type":"input","seq":1e309,"moveX":1,"moveY":0,"aimX":100,"aimY":100}',
    ],
    buildRateLimitPayload: i => ({ type: 'spectate', seq: i }),
  },
  {
    id: 'fortress-war',
    wsPath: '/fortress-war',
    attach: attachFortressWar,
    maxPayload: 4096,
    oversizedExceedsWsLimit: true,
    oversizedBytes: 40 * 1024,
    buildPostJoinPoisonPayloads: () => [
      { type: 'config', options: { profile: POISON, map: POISON, seed: POISON } },
      { type: 'team', team: POISON },
      { type: POISON },
    ],
    buildInvalidNumericPayloads: () => [
      '{"type":"config","options":{"seed":1e309,"teamSize":-1e309}}',
      '{"type":"action","seq":1,"turnNumber":1,"action":"aim","angle":1e309,"power":-1e309}',
      '{"type":"team","team":1e309}',
    ],
    buildRateLimitPayload: i => ({ type: 'spectate', seq: i }),
  },
  {
    id: 'tappy-chicken-mmo',
    wsPath: '/tappy-chicken-mmo',
    attach: attachTappyChickenMmo,
    maxPayload: 64 * 1024,
    // Note: tappy-chicken-mmo-multiplayer.cjs uses maxPayload=64KB and does not register ws.on('error')
    // (outside TC-5 editable scope), so we probe a 48KB oversized JSON frame handled inside ws.on('message').
    oversizedExceedsWsLimit: false,
    oversizedBytes: 48 * 1024,
    buildPostJoinPoisonPayloads: () => [
      {
        type: 'rpc',
        method: 'server_player_event',
        params: { eventType: POISON, runDistance: POISON, y: POISON, name: POISON, phase: POISON },
      },
      { type: POISON },
    ],
    buildInvalidNumericPayloads: () => [
      '{"type":"rpc","method":"server_player_event","params":{"eventType":"flap","runDistance":1e309,"y":-1e309,"vy":1e309,"angle":1e309,"score":1e309,"seq":1}}',
      '{"e":[1,1e309,-1e309,1e309,2,2,1e309,1e309,1e309]}',
    ],
    buildRateLimitPayload: i => ({
      type: 'rpc',
      method: 'server_player_event',
      params: { eventType: 'sync', runDistance: 100 + i, y: 260, seq: i },
    }),
  },
  {
    id: 'captain-forever-mmo',
    wsPath: '/captain-forever-mmo',
    attach: attachCaptainForeverMmo,
    maxPayload: 32 * 1024,
    oversizedExceedsWsLimit: true,
    oversizedBytes: 40 * 1024,
    buildPostJoinPoisonPayloads: () => [
      {
        type: 'rpc',
        method: 'server_player_event',
        params: {
          event_type: POISON,
          x: POISON,
          y: POISON,
          name: POISON,
          phase: POISON,
          blueprint: [[POISON, POISON, 0, 0, 1]],
        },
      },
      { type: POISON },
    ],
    buildInvalidNumericPayloads: () => [
      '{"type":"rpc","method":"server_player_event","params":{"event_type":"state","x":1e309,"y":-1e309,"vx":1e309,"vy":-1e309,"rot":1e309,"hullRatio":1e309,"seq":1}}',
      '{"type":"rpc","method":"server_player_event","params":{"event_type":"hit","target_peer_id":"missing","damage":1e309,"impact_x":-1e309,"impact_y":1e309}}',
    ],
    buildRateLimitPayload: i => ({ type: 'ping', seq: i }),
  },
];

async function createServerHarness(t, spec, overrides = {}) {
  const fatalErrors = [];
  const onUncaught = err => fatalErrors.push({ kind: 'uncaughtException', err });
  const onRejection = err => fatalErrors.push({ kind: 'unhandledRejection', err });
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);

  const openSockets = new Set();
  const httpServer = http.createServer((_req, res) => {
    res.writeHead(404).end();
  });
  const compat = overrides.compat === undefined ? createCompatGate() : overrides.compat;
  const service = spec.attach(httpServer, {
    originAllowed: () => true,
    compat,
    validateBuild: overrides.validateBuild || (async (buildId, projectId) => makeValidBuild(buildId, projectId)),
    ...(overrides.extraOptions || {}),
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = httpServer.address();
  const wsUrl = `ws://127.0.0.1:${port}${spec.wsPath}`;

  t.after(async () => {
    for (const ws of openSockets) {
      try { ws.terminate(); } catch {}
    }
    service.close();
    if (httpServer.listening) {
      const closed = once(httpServer, 'close');
      httpServer.closeAllConnections?.();
      httpServer.close();
      await closed;
    }
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onRejection);
  });

  function openClient(url = wsUrl) {
    const ws = new WebSocket(url);
    openSockets.add(ws);
    const messages = [];
    const waiters = new Set();
    let closeInfo = null;
    const closePromise = new Promise(resolve => {
      ws.once('close', (code, reasonBuf) => {
        closeInfo = { code, reason: reasonBuf ? reasonBuf.toString('utf8') : '' };
        resolve(closeInfo);
      });
    });
    ws.on('error', () => {});
    ws.on('message', raw => {
      let parsed = null;
      try {
        parsed = JSON.parse(raw.toString('utf8'));
      } catch {
        parsed = { _raw: raw.toString('utf8') };
      }
      messages.push(parsed);
      for (const waiter of waiters) waiter(parsed);
    });

    const waitMessage = (predicate, label = 'message', timeoutMs = 4000) => {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(onMsg);
          reject(new Error(`[${spec.id}] Timed out waiting for ${label}; got ${JSON.stringify(messages.slice(-5))}`));
        }, timeoutMs);
        const onMsg = msg => {
          if (!predicate(msg)) return;
          waiters.delete(onMsg);
          clearTimeout(timer);
          resolve(msg);
        };
        waiters.add(onMsg);
      });
    };

    const waitNextMessage = (predicate, label = 'next message', timeoutMs = 4000) => {
      const startIndex = messages.length;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(onMsg);
          reject(new Error(`[${spec.id}] Timed out waiting for ${label}; got ${JSON.stringify(messages.slice(startIndex))}`));
        }, timeoutMs);
        const onMsg = msg => {
          if (!predicate(msg)) return;
          waiters.delete(onMsg);
          clearTimeout(timer);
          resolve(msg);
        };
        waiters.add(onMsg);
      });
    };

    const openPromise = new Promise((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    return {
      ws,
      messages,
      open: openPromise,
      closed: closePromise,
      getCloseInfo: () => closeInfo,
      sendJson: payload => ws.send(JSON.stringify(payload)),
      sendRaw: (data, opts) => ws.send(data, opts),
      waitMessage,
      waitNextMessage,
      async closeAndWait() {
        if (ws.readyState === WebSocket.CLOSED) return closeInfo;
        ws.close();
        return await closePromise;
      },
    };
  }

  async function verifyHealthyFollowUpJoin(label) {
    const client = openClient();
    await client.open;
    client.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: `Healthy_${label}`,
    });
    const welcome = await client.waitMessage(m => m.type === 'welcome', `healthy follow-up welcome (${label})`);
    assert.equal(welcome.type, 'welcome', `[${spec.id}] server must accept valid join after ${label}`);
    assert.match(welcome.roomId, /^[a-f0-9]{12}$/);
    await client.closeAndWait();
    await new Promise(r => setTimeout(r, 25));
    return welcome;
  }

  return { httpServer, service, wsUrl, fatalErrors, openClient, verifyHealthyFollowUpJoin };
}

function assertAllNumbersFinite(obj, pathLabel = 'root') {
  if (typeof obj === 'number') {
    assert.ok(Number.isFinite(obj), `Expected finite number at ${pathLabel}, got ${obj}`);
    return;
  }
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) assertAllNumbersFinite(obj[i], `${pathLabel}[${i}]`);
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    assertAllNumbersFinite(v, `${pathLabel}.${k}`);
  }
}

function collectUpgradeOrClose(url, onOpen) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const ws = new WebSocket(url);
    let unexpectedStatus = null;
    ws.on('unexpected-response', (_req, res) => {
      unexpectedStatus = res.statusCode;
      let body = '';
      res.on('data', chunk => { body += chunk.toString('utf8'); });
      res.on('end', () => {
        resolve({
          unexpectedStatus,
          headers: res.headers,
          body: body ? JSON.parse(body) : null,
          messages,
          closeCode: null,
          closeReason: '',
        });
      });
    });
    ws.on('open', () => {
      if (typeof onOpen === 'function') onOpen(ws);
    });
    ws.on('message', raw => {
      try { messages.push(JSON.parse(raw.toString('utf8'))); } catch {}
    });
    ws.on('close', (code, reasonBuf) => {
      if (unexpectedStatus !== null) return;
      resolve({
        unexpectedStatus: null,
        headers: null,
        body: null,
        messages,
        closeCode: code,
        closeReason: reasonBuf ? reasonBuf.toString('utf8') : '',
      });
    });
    ws.on('error', err => {
      if (unexpectedStatus !== null) return;
      reject(err);
    });
  });
}

// ============================================================================
// TC-5 Matrix: Loop all 4 registered Forge multiplayer WebSocket servers
// ============================================================================

for (const spec of MULTIPLAYER_SERVERS) {
  test(`TC-5 [${spec.id}] ① 악성 원시변환 JSON·잘못된 JSON·바이너리·null 전송 비크래시 및 후속 정상 연결`, async t => {
    const { service, fatalErrors, openClient, verifyHealthyFollowUpJoin } = await createServerHarness(t, spec);

    // 1. Pre-join poison objects, malformed JSON, non-object JSON, binary frame, and null fields
    const attacker = openClient();
    await attacker.open;

    const preJoinMalformedPayloads = [
      JSON.stringify({ type: 'join', projectId: POISON }),
      JSON.stringify({ type: 'join', projectId: POISON, buildId: POISON, name: POISON }),
      JSON.stringify({ type: 'join', roomId: POISON }),
      JSON.stringify({ type: 'join', projectId: VALID_PROJECT_ID, buildId: POISON, name: 'BadBuild' }),
      JSON.stringify({ type: POISON }),
      JSON.stringify({ type: { toString: 1 } }),
      '{broken-json',
      '',
      'null',
      '[]',
      '123',
      '"raw-string"',
      JSON.stringify({ type: 'join', projectId: null, buildId: null, roomId: null, name: null, team: null, options: null }),
    ];

    for (const payload of preJoinMalformedPayloads) {
      const nextErr = attacker.waitNextMessage(m => m.type === 'error', `error for ${payload.slice(0, 40)}`);
      attacker.sendRaw(payload);
      const errMsg = await nextErr;
      assert.equal(errMsg.type, 'error', `[${spec.id}] expected error response for malformed payload`);
      assert.equal(
        String(errMsg.error || '').includes('Cannot convert object to primitive value'),
        false,
        `[${spec.id}] poison payload must be rejected by primitive type guard, not TypeError coercion`,
      );
    }

    // Binary frame
    const binaryErr = attacker.waitNextMessage(m => m.type === 'error', 'binary frame error');
    attacker.sendRaw(Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x80, 0xc0]), { binary: true });
    assert.equal((await binaryErr).type, 'error');
    await attacker.closeAndWait();

    // 2. Poison `name` with valid projectId & buildId must NOT crash AND must NOT leak a room
    const poisonNameClient = openClient();
    await poisonNameClient.open;
    const replyP = poisonNameClient.waitNextMessage(m => m.type === 'error' || m.type === 'welcome', 'poison name reply');
    poisonNameClient.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: POISON,
    });
    const reply = await replyP;
    assert.ok(reply.type === 'error' || reply.type === 'welcome', `[${spec.id}] unexpected reply type ${reply.type}`);
    await poisonNameClient.closeAndWait();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(service.rooms.size, 0, `[${spec.id}] poison name join must not leak rooms`);

    // 3. Post-join poison gameplay payloads must NOT crash
    const joinedAttacker = openClient();
    await joinedAttacker.open;
    joinedAttacker.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'PostJoinPoison',
    });
    await joinedAttacker.waitMessage(m => m.type === 'welcome', 'post-join welcome');
    for (const payload of spec.buildPostJoinPoisonPayloads()) {
      joinedAttacker.sendJson(payload);
    }
    // Wait for at least one error response (from { type: POISON }) to ensure all frames were processed
    await joinedAttacker.waitMessage(m => m.type === 'error', 'post-join poison error');
    await joinedAttacker.closeAndWait();
    await new Promise(r => setTimeout(r, 30));

    // 4. Follow-up normal connection succeeds and zero fatal errors occurred
    await verifyHealthyFollowUpJoin('poison-json');
    assert.equal(service.rooms.size, 0, `[${spec.id}] all rooms must be cleaned up`);
    assert.deepEqual(fatalErrors, [], `[${spec.id}] must not emit uncaughtException/unhandledRejection`);
  });

  test(`TC-5 [${spec.id}] ② NaN / Infinity / 초대형 페이로드 방어 및 안정성 유지`, async t => {
    const { service, fatalErrors, openClient, verifyHealthyFollowUpJoin } = await createServerHarness(t, spec);

    // 1. Send raw JSON with 1e309 (parsed as Infinity) / -1e309 (-Infinity) to joined room
    const numericClient = openClient();
    await numericClient.open;
    numericClient.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'InfTester',
    });
    const welcome = await numericClient.waitMessage(m => m.type === 'welcome', 'numeric test welcome');
    for (const rawJson of spec.buildInvalidNumericPayloads()) {
      numericClient.sendRaw(rawJson);
    }
    await new Promise(r => setTimeout(r, 60));

    // Room snapshot must contain only finite numbers (no NaN/Infinity corruption)
    const activeRoom = service.rooms.get(welcome.roomId);
    assert.ok(activeRoom, `[${spec.id}] active room should remain intact`);
    assertAllNumbersFinite(activeRoom.snapshot(), `${spec.id}.snapshot`);
    await numericClient.closeAndWait();
    await new Promise(r => setTimeout(r, 30));

    // 2. Oversized payload defense
    const giantClient = openClient();
    await giantClient.open;
    const oversizedPayload = JSON.stringify({
      type: 'join',
      projectId: 'bad',
      padding: 'X'.repeat(spec.oversizedBytes),
    });

    if (spec.oversizedExceedsWsLimit) {
      giantClient.sendRaw(oversizedPayload);
      const closed = await Promise.race([
        giantClient.closed,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`[${spec.id}] oversized payload was not closed`)), 4000)),
      ]);
      assert.ok([1009, 1006, 1008].includes(closed.code), `[${spec.id}] expected 1009/1006 close on oversized payload, got ${closed.code}`);
    } else {
      const errP = giantClient.waitNextMessage(m => m.type === 'error', 'oversized JSON error');
      giantClient.sendRaw(oversizedPayload);
      const errMsg = await errP;
      assert.equal(errMsg.type, 'error', `[${spec.id}] oversized JSON must be rejected with error`);
      await giantClient.closeAndWait();
    }

    // 3. Follow-up normal connection proves server process survived completely intact
    await verifyHealthyFollowUpJoin('oversized-and-infinity');
    assert.equal(service.rooms.size, 0, `[${spec.id}] rooms must remain clean after oversized test`);
    assert.deepEqual(fatalErrors, [], `[${spec.id}] must not emit uncaughtException/unhandledRejection`);
  });

  test(`TC-5 [${spec.id}] ③ COMPAT 호환성 게이트 강제 (engineAbi=godot-4.6 차단 및 4009 종료)`, async t => {
    const { service, fatalErrors, wsUrl, verifyHealthyFollowUpJoin } = await createServerHarness(t, spec);

    // 1. join handshake with outdated msg.compat.engineAbi = 'godot-4.6'
    const joinBlocked = await collectUpgradeOrClose(wsUrl, ws => {
      ws.send(JSON.stringify({
        type: 'join',
        projectId: VALID_PROJECT_ID,
        buildId: VALID_BUILD_ID,
        name: 'OutdatedJoiner',
        compat: {
          target: 'web',
          engineAbi: 'godot-4.6',
          engineApiRev: 1,
          netProtocol: '1.0',
          gameplayHash: 'default',
        },
      }));
    });
    assert.equal(joinBlocked.closeCode, COMPAT_WS_CLOSE_FORCE_UPDATE, `[${spec.id}] join compat mismatch must close with 4009`);
    assert.equal(joinBlocked.closeReason, COMPAT_REASONS.ENGINE_ABI_MISMATCH);
    assert.ok(
      joinBlocked.messages.some(m => m.type === 'compat' && m.decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE),
      `[${spec.id}] must send compat BLOCK_FORCE_UPDATE before 4009 close`,
    );
    assert.equal(joinBlocked.messages.some(m => m.type === 'welcome'), false, `[${spec.id}] blocked client must never receive welcome`);
    assert.equal(service.rooms.size, 0, `[${spec.id}] blocked join must not create a room`);

    // 2. explicit compat_check message with outdated engineAbi = 'godot-4.6'
    const checkBlocked = await collectUpgradeOrClose(wsUrl, ws => {
      ws.send(JSON.stringify({
        type: 'compat_check',
        client: {
          target: 'web',
          engineAbi: 'godot-4.6',
        },
      }));
    });
    assert.equal(checkBlocked.closeCode, COMPAT_WS_CLOSE_FORCE_UPDATE, `[${spec.id}] compat_check mismatch must close with 4009`);
    assert.equal(checkBlocked.closeReason, COMPAT_REASONS.ENGINE_ABI_MISMATCH);
    assert.ok(
      checkBlocked.messages.some(m => m.type === 'compat' && m.decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE),
      `[${spec.id}] compat_check must return compat BLOCK_FORCE_UPDATE`,
    );

    await verifyHealthyFollowUpJoin('compat-gate');
    assert.deepEqual(fatalErrors, [], `[${spec.id}] must not emit uncaughtException/unhandledRejection`);
  });

  test(`TC-5 [${spec.id}] ④ 미입장 유휴 소켓 타임아웃·즉시 단절 및 비동기 validateBuild 대기 중 단절 누수 방지`, async t => {
    let buildMode = 'ok';
    let resolvePendingBuild = null;
    let validateStartedResolve = null;
    let validateStarted = new Promise(resolve => { validateStartedResolve = resolve; });

    const { service, fatalErrors, openClient, verifyHealthyFollowUpJoin } = await createServerHarness(t, spec, {
      extraOptions: { joinTimeoutMs: 120 },
      validateBuild: async (buildId, projectId) => {
        if (buildMode === 'pending') {
          validateStartedResolve();
          return await new Promise(resolve => { resolvePendingBuild = resolve; });
        }
        if (buildMode === 'throw') {
          throw new Error('simulated validateBuild transient failure');
        }
        return makeValidBuild(buildId, projectId);
      },
    });

    // 1. Unjoined idle socket is automatically evicted with WS 1008 (Join required)
    const silentIdle = openClient();
    await silentIdle.open;
    const idleClose = await Promise.race([
      silentIdle.closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`[${spec.id}] unjoined idle socket was not closed`)), 2000)),
    ]);
    assert.equal(idleClose.code, 1008, `[${spec.id}] idle unjoined socket must close with 1008`);
    assert.equal(service.rooms.size, 0, `[${spec.id}] evicted idle socket must leave 0 rooms`);

    // 2. Burst of unjoined sockets connecting and disconnecting immediately
    const idleClients = [];
    for (let i = 0; i < 5; i++) {
      const c = openClient();
      await c.open;
      idleClients.push(c);
    }
    await Promise.all(idleClients.map(c => c.closeAndWait()));
    await new Promise(r => setTimeout(r, 30));
    assert.equal(service.rooms.size, 0, `[${spec.id}] immediate unjoined disconnects must leave 0 rooms`);

    // 3. Async validateBuild in-flight: duplicate join rejected by re-entry guard, then early socket disconnect before resolve
    buildMode = 'pending';
    const racer = openClient();
    await racer.open;
    racer.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'AsyncRacer',
    });
    await validateStarted;

    // Second join on same socket while validateBuild is pending must be rejected (re-entry guard)
    const dupErrP = racer.waitNextMessage(m => m.type === 'error', 'duplicate join while pending');
    racer.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'AsyncRacerDup',
    });
    const dupErr = await dupErrP;
    assert.equal(dupErr.type, 'error', `[${spec.id}] duplicate in-flight join must be rejected`);
    assert.match(dupErr.error, /이미/);

    // Close socket BEFORE validateBuild resolves
    await racer.closeAndWait();
    assert.equal(typeof resolvePendingBuild, 'function');
    resolvePendingBuild(makeValidBuild(VALID_BUILD_ID, VALID_PROJECT_ID));
    await new Promise(r => setTimeout(r, 50));

    assert.equal(service.rooms.size, 0, `[${spec.id}] closing during async validateBuild must not leak rooms/players`);

    // 4. Async validateBuild rejection resets joining guard and leaks 0 rooms
    buildMode = 'throw';
    const retryClient = openClient();
    await retryClient.open;
    const throwErrP = retryClient.waitNextMessage(m => m.type === 'error', 'validateBuild throw error');
    retryClient.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'RetryAfterThrow',
    });
    assert.equal((await throwErrP).type, 'error');
    assert.equal(service.rooms.size, 0, `[${spec.id}] failed validateBuild must not leak rooms`);

    // Same socket can retry join after transient validateBuild failure
    buildMode = 'ok';
    const retryWelcomeP = retryClient.waitNextMessage(m => m.type === 'welcome', 'retry welcome after throw');
    retryClient.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'RetryAfterThrow',
    });
    const retryWelcome = await retryWelcomeP;
    assert.equal(service.rooms.size, 1);
    assert.ok(service.metadata(retryWelcome.roomId), `[${spec.id}] room metadata should exist while joined`);
    await retryClient.closeAndWait();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(service.rooms.size, 0, `[${spec.id}] room must be removed after last player disconnects`);
    assert.equal(service.metadata(retryWelcome.roomId), null, `[${spec.id}] metadata must return null after room cleanup`);

    await verifyHealthyFollowUpJoin('leak-guard');
    assert.deepEqual(fatalErrors, [], `[${spec.id}] must not emit uncaughtException/unhandledRejection`);
  });

  test(`TC-5 [${spec.id}] ⑤ Rate Limit / 과도한 메시지 폭주 방어 및 정상 클라이언트 보호`, async t => {
    const { service, fatalErrors, openClient, verifyHealthyFollowUpJoin } = await createServerHarness(t, spec);

    const flooder = openClient();
    await flooder.open;
    flooder.sendJson({
      type: 'join',
      projectId: VALID_PROJECT_ID,
      buildId: VALID_BUILD_ID,
      name: 'Flooder',
    });
    await flooder.waitMessage(m => m.type === 'welcome', 'flooder welcome');

    // Race either a rate-limit error frame OR a 1008 close (both are valid server-side rate defenses)
    const defensePromise = Promise.race([
      flooder.waitNextMessage(
        m => m.type === 'error' && /빠릅니다|too many|rate/i.test(String(m.error || '')),
        'rate limit error',
        4000,
      ).then(msg => ({ kind: 'error', msg })),
      flooder.closed.then(info => ({ kind: 'close', info })),
    ]);

    // Send 120 messages back-to-back (> 80/sec limit across all 4 servers)
    for (let i = 1; i <= 120; i++) {
      if (flooder.ws.readyState !== WebSocket.OPEN) break;
      try {
        flooder.sendJson(spec.buildRateLimitPayload(i));
      } catch {
        break;
      }
    }

    const defense = await defensePromise;
    if (defense.kind === 'error') {
      assert.equal(defense.msg.type, 'error');
      assert.match(defense.msg.error, /빠릅니다|too many|rate/i);
    } else {
      assert.equal(defense.info.code, 1008, `[${spec.id}] rate-limit close must use 1008`);
    }

    await flooder.closeAndWait();
    await new Promise(r => setTimeout(r, 30));

    // A brand-new legitimate client must connect & join smoothly after the flood
    await verifyHealthyFollowUpJoin('rate-limit-flood');
    assert.equal(service.rooms.size, 0, `[${spec.id}] rooms must clean up after flooder disconnects`);
    assert.deepEqual(fatalErrors, [], `[${spec.id}] must not emit uncaughtException/unhandledRejection`);
  });
}

// ============================================================================
// Unit-level NaN / Infinity hardening for BrawlRoom & FortressRoom
// ============================================================================

test('TC-5 [unit] BrawlRoom 및 FortressRoom은 NaN/Infinity 게임 입력과 원시변환 독성 이름을 안전하게 차단한다', () => {
  // BrawlRoom
  let nowBrawl = 0;
  const brawl = new BrawlRoom('abcdef012345', VALID_PROJECT_ID, () => nowBrawl);
  const p1 = brawl.join(POISON, 0);
  const p2 = brawl.join('Beta', 1);
  assert.equal(typeof p1.name, 'string');
  assert.ok(p1.name.length > 0);
  brawl.command(p1.id, { type: 'ready', ready: true });
  brawl.command(p2.id, { type: 'ready', ready: true });
  nowBrawl += 5000;
  brawl.tick();
  assert.equal(brawl.phase, 'playing');
  assert.throws(() => brawl.command(p1.id, { type: 'input', seq: 1, moveX: NaN, moveY: 0, aimX: 100, aimY: 100 }));
  assert.throws(() => brawl.command(p1.id, { type: 'input', seq: 1, moveX: Infinity, moveY: -Infinity, aimX: 100, aimY: 100 }));
  assert.throws(() => brawl.command(p1.id, { type: 'input', seq: 1, moveX: POISON, moveY: 0, aimX: 100, aimY: 100 }));
  assertAllNumbersFinite(brawl.snapshot(), 'brawl.snapshot');

  // FortressRoom
  let nowFort = 1000;
  const fort = new FortressRoom('abcdef012345', VALID_PROJECT_ID, makeValidBuild(), { teamSize: 1 }, () => nowFort);
  const f1 = fort.join({ name: POISON, team: 0 });
  const f2 = fort.join({ name: 'Red', team: 1 });
  assert.equal(typeof f1.name, 'string');
  fort.command(f1, { type: 'ready', ready: true });
  fort.command(f2, { type: 'ready', ready: true });
  nowFort += 5000;
  fort.tick();
  assert.equal(fort.phase, 'playing');
  const active = fort.engine.active;
  const activeController = active.team === 0 ? f1 : f2;
  assert.throws(
    () => fort.command(activeController, { type: 'action', seq: 1, turnNumber: fort.engine.state.turnNumber, action: 'aim', angle: NaN, power: 50 }),
    { code: 'invalid_action' },
  );
  assert.throws(
    () => fort.command(activeController, { type: 'action', seq: 1, turnNumber: fort.engine.state.turnNumber, action: 'aim', angle: Infinity, power: -Infinity }),
    { code: 'invalid_action' },
  );
  assert.throws(
    () => fort.command(activeController, { type: 'action', seq: 1, turnNumber: fort.engine.state.turnNumber, action: 'move', direction: 1, dt: NaN }),
    { code: 'invalid_action' },
  );
  assertAllNumbersFinite(fort.snapshot(), 'fortress.snapshot');
});

// ============================================================================
// Unified multiplayer-server.cjs: /api/version public summary & 4-route COMPAT
// ============================================================================

test('TC-5 [multiplayer-server] /api/version 공개 요약만 노출(내부 엔드포인트·updatedBy 비노출) 및 4종 WS 업그레이드 COMPAT 게이트 검증', async t => {
  const INTERNAL_POOL_ENDPOINT = 'wss://internal-drain-pool.secret.corp/ws';
  const INTERNAL_UPDATED_BY = 'secret-ops-operator@internal.local';
  const FORGE_INTERNAL_URL = 'http://127.0.0.1:49999';
  const INTERNAL_SECRET = 'super-secret-internal-multiplayer-token-0123456789';
  const ALLOWED_ORIGIN = 'http://127.0.0.1:18080';

  const server = createMultiplayerServer({
    hubAuth: false,
    publicOrigin: ALLOWED_ORIGIN,
    forgeInternalUrl: FORGE_INTERNAL_URL,
    internalSecret: INTERNAL_SECRET,
    env: {
      PLAYFORGE_CHANNEL: 'live',
      PLAYFORGE_BUILD_NUM: '77',
      PLAYFORGE_DAILY_SEQ: '3',
      PLAYFORGE_BUILD_DATE: '2026-11-22T09:00:00Z',
      PLAYFORGE_ENGINE_ABI: 'godot-4.7',
      PLAYFORGE_ENGINE_API_REV: '2',
      PLAYFORGE_MIN_ENGINE_API_REV: '2',
      PLAYFORGE_NET_PROTOCOL: '1.2',
      PLAYFORGE_GAMEPLAY_HASH: 'rules-v2',
      PLAYFORGE_UPDATE_POLICY: 'optional',
    },
    validateTemplateBuild: () => async (buildId, projectId) => makeValidBuild(buildId, projectId),
  });

  server.compat.updatePolicy(
    {
      targets: {
        aos: { updatePolicy: 'force', latestBuildCode: 2026112203, graceMinutes: 0 },
      },
      activePools: [
        {
          poolId: 'drain-secret-v1',
          gameplayHash: 'rules-v1',
          endpoint: INTERNAL_POOL_ENDPOINT,
          expiresAtUtc: '2099-01-01T00:00:00Z',
        },
      ],
    },
    INTERNAL_UPDATED_BY,
  );

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    const closed = once(server, 'close');
    server.shutdown();
    await closed;
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBase = `ws://127.0.0.1:${port}`;

  // 1. /api/version must expose only public summary and NEVER leak internal pool endpoints, updatedBy, forgeInternalUrl, or internalSecret
  const versionRes = await fetch(`${baseUrl}/api/version`, {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  assert.equal(versionRes.status, 200);
  const rawVersionText = await versionRes.text();
  const versionJson = JSON.parse(rawVersionText);

  assert.equal(versionJson.ok, true);
  assert.equal(versionJson.buildInfo.target, 'godot-server');
  assert.equal(versionJson.buildInfo.compat.engineAbi, 'godot-4.7');
  assert.ok(versionJson.releasePolicy && typeof versionJson.releasePolicy === 'object');
  assert.deepEqual(
    Object.keys(versionJson.releasePolicy).sort(),
    ['defaultUpdatePolicy', 'revision', 'targets', 'updatedAtUtc'],
    '/api/version releasePolicy must contain ONLY public summary keys',
  );
  assert.equal(versionJson.releasePolicy.activePools, undefined);
  assert.equal(versionJson.releasePolicy.updatedBy, undefined);
  assert.equal(rawVersionText.includes(INTERNAL_POOL_ENDPOINT), false, '/api/version must not leak activePools endpoint');
  assert.equal(rawVersionText.includes(INTERNAL_UPDATED_BY), false, '/api/version must not leak updatedBy');
  assert.equal(rawVersionText.includes(FORGE_INTERNAL_URL), false, '/api/version must not leak forgeInternalUrl');
  assert.equal(rawVersionText.includes(INTERNAL_SECRET), false, '/api/version must not leak internalSecret');

  // Foreign Origin must be rejected with 403
  const foreignVersionRes = await fetch(`${baseUrl}/api/version`, {
    headers: { Origin: 'https://evil.example.invalid' },
  });
  assert.equal(foreignVersionRes.status, 403);

  // 2. /api/health confirms all 4 multiplayer servers registered and does not leak secrets
  const healthRes = await fetch(`${baseUrl}/api/health`, {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  assert.equal(healthRes.status, 200);
  const rawHealthText = await healthRes.text();
  const healthJson = JSON.parse(rawHealthText);
  assert.equal(healthJson.brawllabsMultiplayer, true);
  assert.equal(healthJson.fortressWarMultiplayer, true);
  assert.equal(healthJson.tappyChickenMmoMultiplayer, true);
  assert.equal(healthJson.captainForeverMmoMultiplayer, true);
  assert.equal(rawHealthText.includes(INTERNAL_SECRET), false);
  assert.equal(rawHealthText.includes(FORGE_INTERNAL_URL), false);

  // 3. All 4 WS routes enforce COMPAT on upgrade query (?engineAbi=godot-4.6 -> 4009 & compatMode=http -> 426)
  for (const spec of MULTIPLAYER_SERVERS) {
    const wsBlocked = await new Promise((resolve, reject) => {
      const messages = [];
      const ws = new WebSocket(`${wsBase}${spec.wsPath}?engineAbi=godot-4.6`, {
        headers: { Origin: ALLOWED_ORIGIN },
      });
      ws.on('message', raw => messages.push(JSON.parse(raw.toString('utf8'))));
      ws.on('close', (code, reasonBuf) => resolve({ code, reason: reasonBuf.toString('utf8'), messages }));
      ws.on('error', reject);
    });
    assert.equal(wsBlocked.code, COMPAT_WS_CLOSE_FORCE_UPDATE, `[${spec.id}] upgrade query engineAbi=godot-4.6 must close 4009`);
    assert.equal(wsBlocked.reason, COMPAT_REASONS.ENGINE_ABI_MISMATCH);
    assert.equal(wsBlocked.messages[0]?.type, 'compat');
    assert.equal(wsBlocked.messages[0]?.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);

    const http426 = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}${spec.wsPath}?engineAbi=godot-4.6&compatMode=http`, {
        headers: { Origin: ALLOWED_ORIGIN },
      });
      ws.on('unexpected-response', (_req, res) => {
        let body = '';
        res.on('data', chunk => { body += chunk.toString('utf8'); });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
      });
      ws.on('error', reject);
    });
    assert.equal(http426.status, 426, `[${spec.id}] compatMode=http mismatch must return 426`);
    assert.equal(http426.body.decision, COMPAT_DECISIONS.BLOCK_FORCE_UPDATE);
  }
});
