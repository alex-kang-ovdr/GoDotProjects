import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createApp } from '../server/app.mjs';
import { forgeAccountKey } from '../server/forge-account.mjs';

const require = createRequire(import.meta.url);
const WebSocket = require('../../forge/node_modules/ws');
const { PlatformStore } = require('../../forge/Tools/platform-store.cjs');
const { zipFiles } = require('../../forge/Tools/export-godot-project.cjs');
const { buildReleaseManifest } = require('../../forge/Tools/release-manifest.cjs');

const HUB_ROOT = path.resolve(import.meta.dirname, '..');
const FORGE_ROOT = path.resolve(HUB_ROOT, '..', 'forge');

function createDummyGodotZip() {
  const html = '<!doctype html><html><head><title>Tappy MMO</title></head><body><canvas></canvas><script src="./playhub-godot-shell.js"></script></body></html>';
  const shell = 'window.__PLAYHUB_GODOT_SHELL__ = "playhub-godot-shell-v1";';
  const wasm = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  const pck = Buffer.concat([Buffer.from('GDPC'), Buffer.alloc(4096, 0x42)]);
  return zipFiles([
    ['index.html', Buffer.from(html, 'utf8')],
    ['playhub-godot-shell.js', Buffer.from(shell, 'utf8')],
    ['index.wasm', wasm],
    ['index.pck', pck],
  ]);
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('error', reject);
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
    });
    ws.on('open', () => resolve({ ws, messages }));
  });
}

async function waitFor(predicate, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = predicate();
    if (val) return val;
    await new Promise(r => setTimeout(r, 25));
  }
  return predicate();
}

test('Published Godot UGC template exposes AOS .pck in /api/mobile/catalog and supports Web <-> AOS cross-play over /ws/ugc-mmo', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-crossplay-'));
  const dataDir = path.join(temp, 'hub-data');
  const forgeAccountsDir = path.join(temp, 'forge-accounts');
  const forgeBuildsDir = path.join(temp, 'forge-builds');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(forgeAccountsDir, { recursive: true });
  fs.mkdirSync(forgeBuildsDir, { recursive: true });

  const config = {
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
    forge: {
      enabled: false,
      accountsDir: forgeAccountsDir,
      buildsDir: forgeBuildsDir,
    },
  };

  const app = createApp(config, {
    rootDir: HUB_ROOT,
    platformRoot: path.resolve(HUB_ROOT, '..'),
    env: { ...process.env, PLAYHUB_ALLOW_LOOPBACK_ADMIN: '1' },
  });
  const addrs = await app.listen();
  const pubBase = `http://127.0.0.1:${addrs.public.port}`;
  const adminBase = `http://127.0.0.1:${addrs.admin.port}`;
  const wsUrl = `ws://127.0.0.1:${addrs.public.port}/ws/ugc-mmo`;

  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  // 1. Seed a registered creator user + Forge tappy-chicken-mmo release with index.pck.
  const ownerId = 'user-crossplay-creator';
  const googleSub = 'sub-crossplay-1';
  const nowMs = Date.now();
  app.db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)').run(ownerId, 'registered', 'CrossCreator', nowMs);
  app.db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").run(googleSub, ownerId);
  const ownerKey = forgeAccountKey({ iss: 'https://accounts.google.com', sub: googleSub });

  const accountDir = path.join(forgeAccountsDir, ownerKey);
  const store = new PlatformStore(FORGE_ROOT, accountDir);
  const project = store.createProject({ name: 'Tappy Chicken MMO', template: 'tappy-chicken-mmo', mode: 'ready' });
  const zipBuf = createDummyGodotZip();
  const buildId = '1234567890abcdef';
  const buildDir = path.join(forgeBuildsDir, ownerKey, buildId);
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, 'PlayForge-Web.zip'), zipBuf);
  fs.writeFileSync(path.join(buildDir, 'result.json'), JSON.stringify({
    id: buildId,
    projectId: project.id,
    revision: project.revision,
    status: 'succeeded',
    previewUrl: `/api/builds/${buildId}/files/index.html`,
  }));

  const manifest = buildReleaseManifest({
    releaseId: 'a'.repeat(24),
    projectId: project.id,
    projectName: 'Tappy Chicken MMO',
    sourceRevision: project.revision,
    build: { buildId, bytes: zipBuf.length },
    visibility: 'public',
    deployProfile: { deployMode: 'mmo', serverRuntime: 'node-wss-v1', specTier: 'small' },
    gameMetadata: {
      slug: 'tappy-chicken-mmo',
      title: { ko: '태피 치킨 MMO', en: 'Tappy Chicken MMO' },
      summary: { ko: '크로스플레이 MMO', en: 'Cross-play MMO' },
      tags: ['arcade', 'multiplayer'],
      controls: ['keyboard', 'mouse', 'touch'],
      viewport: { width: 480, height: 640, orientation: 'portrait', resize: 'fit' },
    },
  });
  const createdRel = store.createRelease(project.id, {
    label: 'v1.0.0',
    buildId,
    visibility: 'public',
    deployProfile: manifest.deployProfile,
    gameMetadata: manifest.gameMetadata,
    releaseManifest: manifest,
  });
  const release = createdRel.release || createdRel;

  const releaseId = release.id || release.releaseId || 'a'.repeat(24);

  // Publish directly via Hub storage + hub_publications (simulating approved submission)
  const stored = app.ugcPublish.storage.putReleaseBundle({
    hostSlug: 'ptappycrossplay23',
    releaseId,
    zipBuffer: zipBuf,
    releaseManifest: manifest,
    gameManifest: {
      schemaVersion: 1,
      id: 'tappy-chicken-mmo',
      slug: 'tappy-chicken-mmo',
      title: manifest.gameMetadata.title,
      summary: manifest.gameMetadata.summary,
      instructions: { ko: '플랩', en: 'Flap' },
      entry: 'index.html',
      version: '0.1.1',
      tags: ['arcade', 'multiplayer'],
      controls: ['keyboard', 'mouse', 'touch'],
      viewport: manifest.gameMetadata.viewport,
      capabilities: { webgl: true, wasm: true, workers: false, fullscreen: true, pointerLock: false, externalNetwork: [] },
      save: { enabled: true, schemaVersion: 1, maxSlots: 1 },
      seo: { title: '태피 치킨 MMO | PlayHub', description: '크로스플레이 MMO', indexable: true },
      media: { cover: '', screenshots: [] },
    },
  });
  app.db.prepare(`INSERT INTO hub_publications
    (game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
     visibility, deploy_mode, status, unpublished_by, artifact_sha256, artifact_base_url, manifest_json, deploy_profile_json,
     cas_version, published_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)`)
    .run(
      'tappy-chicken-mmo', 'ptappycrossplay23', ownerKey, ownerId, project.id, releaseId, null,
      'public', 'mmo', 'published', stored.sha256, stored.artifactBaseUrl,
      JSON.stringify({
        schemaVersion: 1, id: 'tappy-chicken-mmo', title: manifest.gameMetadata.title,
        summary: manifest.gameMetadata.summary, entry: 'index.html', version: '0.1.1',
        tags: ['arcade', 'multiplayer'], controls: ['keyboard', 'mouse', 'touch'],
        viewport: manifest.gameMetadata.viewport, save: { schemaVersion: 1 },
      }),
      JSON.stringify(manifest.deployProfile), 1, nowMs, nowMs
    );

  // 2. Verify Web catalog + play-session returns multiplayer WS info
  const webGames = await (await fetch(`${pubBase}/api/games`)).json();
  const webTappy = webGames.games.find(g => g.id === 'tappy-chicken-mmo');
  assert.ok(webTappy, 'tappy-chicken-mmo must appear in Web /api/games');
  assert.equal(webTappy.deployMode, 'mmo');

  // 3. Verify AOS Mobile API: guest login -> age-gate -> catalog (.pck + wsPath) -> play-session -> download index.pck
  const guestRes = await fetch(`${pubBase}/api/mobile/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(guestRes.status, 201);
  const guestAuth = await guestRes.json();
  const ageRes = await fetch(`${pubBase}/api/mobile/age-gate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestAuth.accessToken}` },
    body: JSON.stringify({ birthYear: 1995, birthMonth: 5, regionCode: 'KR' }),
  });
  assert.equal(ageRes.status, 200);

  const mobileCatalog = await (await fetch(`${pubBase}/api/mobile/catalog`, {
    headers: { Authorization: `Bearer ${guestAuth.accessToken}`, 'X-PlayHub-Engine-Version': '4.7.2', 'X-PlayHub-App-Version-Code': '1' },
  })).json();
  const aosTappy = mobileCatalog.games.find(g => g.id === 'tappy-chicken-mmo');
  assert.ok(aosTappy, 'tappy-chicken-mmo must appear in AOS /api/mobile/catalog');
  assert.equal(aosTappy.runtime, 'godot-pck', 'Published Godot UGC bundle must advertise godot-pck runtime to AOS');
  assert.equal(aosTappy.compatibility.compatible, true);
  assert.equal(aosTappy.deployMode, 'mmo');
  assert.equal(aosTappy.multiplayer?.wsPath, '/ws/ugc-mmo');
  assert.match(aosTappy.android.pckUrl, /^\/play-ugc\/ptappycrossplay23\/[a-f0-9]{24}\/index\.pck$/);
  assert.ok(aosTappy.android.pckBytes > 4000);

  const pckDownload = await fetch(`${pubBase}${aosTappy.android.pckUrl}`);
  assert.equal(pckDownload.status, 200);
  const pckBuf = Buffer.from(await pckDownload.arrayBuffer());
  assert.equal(pckBuf.subarray(0, 4).toString('ascii'), 'GDPC', 'Downloaded UGC index.pck must be valid Godot PCK');

  const mobileSession = await (await fetch(`${pubBase}/api/mobile/play-sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestAuth.accessToken}` },
    body: JSON.stringify({ gameId: 'tappy-chicken-mmo' }),
  })).json();
  assert.equal(mobileSession.runtime, 'godot-pck');
  assert.equal(mobileSession.multiplayer?.wsPath, '/ws/ugc-mmo');

  // 4. Live Cross-Play Multiplayer: Web client + Android client auto-channel into the SAME room!
  const webClient = await connectWs(wsUrl);
  t.after(() => webClient.ws.close());
  webClient.ws.send(JSON.stringify({ type: 'join', gameId: 'tappy-chicken-mmo', name: 'WebHero', platform: 'web', compact: true }));
  const webWelcome = await waitFor(() => webClient.messages.find(m => m.type === 'welcome'));
  assert.ok(webWelcome, 'Web client must receive welcome');

  const aosClient = await connectWs(wsUrl);
  t.after(() => aosClient.ws.close());
  aosClient.ws.send(JSON.stringify({ type: 'join', gameId: 'tappy-chicken-mmo', name: 'AndroidHero', platform: 'android', compact: true }));
  const aosWelcome = await waitFor(() => aosClient.messages.find(m => m.type === 'welcome'));
  assert.ok(aosWelcome, 'Android client must receive welcome');
  assert.equal(aosWelcome.roomId, webWelcome.roomId, 'Web and Android clients must auto-channel into the exact same room');

  // Verify Hub telemetry reports BOTH web and android platforms in the same room
  const roomsInfo = await (await fetch(`${pubBase}/api/ugc-multiplayer/tappy-chicken-mmo/rooms`)).json();
  assert.equal(roomsInfo.totalOnline, 2);
  assert.equal(roomsInfo.rooms[0].platforms.web, 1);
  assert.equal(roomsInfo.rooms[0].platforms.android, 1);

  // Bidirectional compact flap events: Web -> Android and Android -> Web
  webClient.ws.send(JSON.stringify({ e: [1, 240, 260, 2, 2, 1] }));
  const aosGotWebFlap = await waitFor(() => aosClient.messages.find(m => Array.isArray(m.b) && m.b.some(t => t[0] === webWelcome.shortId && t[1] === 1 && t[2] === 240)));
  assert.ok(aosGotWebFlap, 'Android client must receive Web client flap tuple in real time');

  aosClient.ws.send(JSON.stringify({ e: [1, 280, 220, 3, 2, 1] }));
  const webGotAosFlap = await waitFor(() => webClient.messages.find(m => Array.isArray(m.b) && m.b.some(t => t[0] === aosWelcome.shortId && t[1] === 1 && t[2] === 280)));
  assert.ok(webGotAosFlap, 'Web client must receive Android client flap tuple in real time');

  // 5. M3 Social Party Co-Entry roomCode (6-char uppercase code like K7P9M2) routes Web + Android into the SAME isolated party channel!
  const partyWeb = await connectWs(wsUrl);
  t.after(() => partyWeb.ws.close());
  partyWeb.ws.send(JSON.stringify({ type: 'join', gameId: 'tappy-chicken-mmo', roomId: 'K7P9M2', name: 'PartyHostWeb', platform: 'web', compact: true }));
  const partyWebWelcome = await waitFor(() => partyWeb.messages.find(m => m.type === 'welcome'));
  assert.ok(partyWebWelcome, 'Party host (web) must create/join Co-Entry room by 6-char roomCode');
  assert.equal(partyWebWelcome.partyCode, 'K7P9M2');
  assert.notEqual(partyWebWelcome.roomId, webWelcome.roomId, 'Party Co-Entry room must be isolated from public auto-channel');

  const partyAos = await connectWs(wsUrl);
  t.after(() => partyAos.ws.close());
  partyAos.ws.send(JSON.stringify({ type: 'join', gameId: 'tappy-chicken-mmo', roomId: 'k7p9m2', name: 'PartyMemberAOS', platform: 'android', compact: true }));
  const partyAosWelcome = await waitFor(() => partyAos.messages.find(m => m.type === 'welcome'));
  assert.ok(partyAosWelcome, 'Party member (android) must join the exact same Co-Entry room regardless of case');
  assert.equal(partyAosWelcome.roomId, partyWebWelcome.roomId);
  assert.equal(partyAosWelcome.courseSeed, partyWebWelcome.courseSeed);

  // Unknown 12-hex channel ID still fails closed
  const badRoom = await connectWs(wsUrl);
  t.after(() => badRoom.ws.close());
  badRoom.ws.send(JSON.stringify({ type: 'join', gameId: 'tappy-chicken-mmo', roomId: 'deadbeefcafe', name: 'Ghost', platform: 'web' }));
  const badRoomErr = await waitFor(() => badRoom.messages.find(m => m.type === 'error'));
  assert.ok(badRoomErr, 'Non-existent 12-hex roomId must still be rejected');

  assert.ok(adminBase.startsWith('http://'));
});

test('SSOT guard: Hub and Forge share tools/ugc-shared room-core and publish-contract modules without duplicating engines', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const hubMp = fs.readFileSync(path.join(repoRoot, 'hub/server/ugc-multiplayer.mjs'), 'utf8');
  const forgeMp = fs.readFileSync(path.join(repoRoot, 'forge/Tools/tappy-chicken-mmo-multiplayer.cjs'), 'utf8');
  const hubPub = fs.readFileSync(path.join(repoRoot, 'hub/server/ugc-publish.mjs'), 'utf8');
  const forgeManifest = fs.readFileSync(path.join(repoRoot, 'forge/Tools/release-manifest.cjs'), 'utf8');

  assert.match(hubMp, /mmo-room-core\.cjs/);
  assert.match(forgeMp, /mmo-room-core\.cjs/);
  assert.doesNotMatch(hubMp, /_compactEventTuple\s*\(/, 'Hub multiplayer must not duplicate _compactEventTuple');
  assert.doesNotMatch(forgeMp, /_compactEventTuple\s*\(/, 'Forge multiplayer must not duplicate _compactEventTuple');

  assert.match(hubPub, /publish-contract\.cjs/);
  assert.match(forgeManifest, /publish-contract\.cjs/);
  assert.doesNotMatch(hubPub, /function slugifyGameId\s*\(/, 'Hub ugc-publish must not duplicate slugifyGameId');
  assert.doesNotMatch(forgeManifest, /function slugifyGameId\s*\(/, 'Forge release-manifest must not duplicate slugifyGameId');
});

test('UGC Multiplayer WS security hardening: CSWSH Origin check, party privacy, room.gameId check, RFC 6455 DoS limits & unknown upgrade cleanup', async t => {
  const net = await import('node:net');
  const crypto = await import('node:crypto');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-ws-sec-'));
  const dataDir = path.join(temp, 'hub-data');
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
    mobile: { enabled: false },
    forge: { enabled: false },
  }, {
    rootDir: HUB_ROOT,
    platformRoot: path.resolve(HUB_ROOT, '..'),
  });
  const addrs = await app.listen();
  const port = addrs.public.port;
  const pubBase = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws/ugc-mmo`;

  t.after(async () => {
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true });
  });

  // 1. Disallowed browser Origin is rejected (CSWSH protection)
  await assert.rejects(
    () => new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { headers: { Origin: 'https://evil.example.com' } });
      ws.on('open', () => { ws.close(); resolve(); });
      ws.on('unexpected-response', (_req, res) => reject(new Error(`HTTP_${res.statusCode}`)));
      ws.on('error', reject);
    }),
    /HTTP_403|403/
  );

  // Allowed Origin succeeds
  const allowedWs = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { Origin: 'http://127.0.0.1' } });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
  t.after(() => allowedWs.close());

  // 2. Unknown upgrade path destroys socket cleanly (does not hang)
  const unknownClosed = await new Promise(resolve => {
    const sock = net.connect(port, '127.0.0.1', () => {
      sock.write(
        'GET /ws/unknown-path HTTP/1.1\r\n' +
        `Host: 127.0.0.1:${port}\r\n` +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
        'Sec-WebSocket-Version: 13\r\n\r\n'
      );
    });
    sock.on('close', () => resolve(true));
    sock.on('error', () => resolve(true));
    setTimeout(() => { sock.destroy(); resolve(false); }, 2000);
  });
  assert.equal(unknownClosed, true, 'Unhandled upgrade socket must be destroyed immediately');

  // 3. Party room hides partyCode, roomId, and players in /api/ugc-multiplayer/:gameId/rooms
  const partyClient = await connectWs(wsUrl);
  t.after(() => partyClient.ws.close());
  partyClient.ws.send(JSON.stringify({ type: 'join', gameId: 'tappy-chicken-mmo', roomId: 'SECRET99', name: 'SecretHost', platform: 'web' }));
  const partyWelcome = await waitFor(() => partyClient.messages.find(m => m.type === 'welcome'));
  assert.ok(partyWelcome);

  const roomsRes = await (await fetch(`${pubBase}/api/ugc-multiplayer/tappy-chicken-mmo/rooms`)).json();
  assert.equal(roomsRes.rooms.length, 1);
  assert.equal(roomsRes.rooms[0].isParty, true);
  assert.equal(roomsRes.rooms[0].partyCode, undefined, 'partyCode must not be leaked');
  assert.equal(roomsRes.rooms[0].roomId, undefined, 'party roomId must not be leaked');
  assert.equal(roomsRes.rooms[0].players, undefined, 'party players list must not be leaked');

  // 4. 12-hex roomId join rejects mismatched gameId
  const wrongGameClient = await connectWs(wsUrl);
  t.after(() => wrongGameClient.ws.close());
  wrongGameClient.ws.send(JSON.stringify({ type: 'join', gameId: 'other-game-id', roomId: partyWelcome.roomId, name: 'CrossGame', platform: 'web' }));
  const wrongGameErr = await waitFor(() => wrongGameClient.messages.find(m => m.type === 'error'));
  assert.ok(wrongGameErr, '12-hex roomId join with mismatched gameId must be rejected');

  // Helper to open raw RFC 6455 socket for frame-level DoS tests
  function buildMaskedFrame(fin, opcode, payloadBuf) {
    const mask = crypto.randomBytes(4);
    const len = payloadBuf.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = (fin ? 0x80 : 0) | opcode;
      header[1] = 0x80 | len;
    } else {
      header = Buffer.alloc(4);
      header[0] = (fin ? 0x80 : 0) | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    }
    const masked = Buffer.from(payloadBuf);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
    return Buffer.concat([header, mask, masked]);
  }

  function openRawWs() {
    return new Promise((resolve, reject) => {
      const sock = net.connect(port, '127.0.0.1', () => {
        sock.write(
          'GET /ws/ugc-mmo HTTP/1.1\r\n' +
          `Host: 127.0.0.1:${port}\r\n` +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      });
      let acc = Buffer.alloc(0);
      const onData = chunk => {
        acc = Buffer.concat([acc, chunk]);
        const idx = acc.indexOf('\r\n\r\n');
        if (idx !== -1) {
          sock.off('data', onData);
          resolve(sock);
        }
      };
      sock.on('data', onData);
      sock.on('error', reject);
    });
  }

  function waitCloseCode(sock) {
    return new Promise(resolve => {
      const chunks = [];
      sock.on('data', c => chunks.push(c));
      sock.on('close', () => {
        const buf = Buffer.concat(chunks);
        // Look for close frame 0x88
        for (let i = 0; i + 3 < buf.length; i++) {
          if (buf[i] === 0x88 && buf[i + 1] >= 2) {
            resolve(buf.readUInt16BE(i + 2));
            return;
          }
        }
        resolve(null);
      });
    });
  }

  // 5a. Control frame (Ping 0x9) with payload > 125 bytes closes with 1002
  const pingSock = await openRawWs();
  const pingCodePromise = waitCloseCode(pingSock);
  pingSock.write(buildMaskedFrame(true, 0x9, Buffer.alloc(200, 0x41)));
  assert.equal(await pingCodePromise, 1002, 'Oversized Ping control frame must close with 1002');

  // 5b. Continuation frame count > 32 closes with 1009
  const fragSock = await openRawWs();
  const fragCodePromise = waitCloseCode(fragSock);
  fragSock.write(buildMaskedFrame(false, 0x1, Buffer.alloc(0)));
  for (let i = 0; i < 35; i++) {
    fragSock.write(buildMaskedFrame(false, 0x0, Buffer.alloc(0)));
  }
  assert.equal(await fragCodePromise, 1009, 'Excessive 0-byte continuation frames must close with 1009');

  // 5c. Sustained rate limit overflow closes with 1008 instead of echoing errors
  const floodCloseCode = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('error', reject);
    ws.on('close', code => resolve(code));
    ws.on('open', () => {
      for (let i = 0; i < 95; i++) {
        ws.send('{"type":"noop"}');
      }
    });
  });
  assert.equal(floodCloseCode, 1008, 'Sustained rate limit violation must close with 1008');
});
