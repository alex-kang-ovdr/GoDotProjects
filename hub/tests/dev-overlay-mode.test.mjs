import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createAosDevServer, validateDataSourceOption } from '../../tools/aos/serve-apk-download.mjs';

function listen(server) {
  return new Promise(resolveListen => {
    server.listen(0, '127.0.0.1', () => resolveListen(server.address().port));
  });
}

test('validateDataSourceOption allows local/dev only and blocks live mode or live hosts', () => {
  assert.deepEqual(validateDataSourceOption('local', ''), { mode: 'local', devUrl: null });
  assert.deepEqual(
    validateDataSourceOption('dev', 'https://playhub-dev-2611.run.app/'),
    { mode: 'dev', devUrl: 'https://playhub-dev-2611.run.app' }
  );

  assert.throws(() => validateDataSourceOption('live', 'https://playhub-live-2611.run.app'), err => err.code === 'FORBIDDEN_DATA_SOURCE');
  assert.throws(() => validateDataSourceOption('dev', 'https://live.playhub.example.com'), err => err.code === 'FORBIDDEN_LIVE_HOST');
  assert.throws(() => validateDataSourceOption('dev', 'https://playhub-live-2611.run.app'), err => err.code === 'FORBIDDEN_LIVE_HOST');
  assert.throws(() => validateDataSourceOption('dev', 'https://playhub.example.com'), err => err.code === 'FORBIDDEN_LIVE_HOST');
});

test('local test data persists across restarts and switching to dev read-only overlay with zero writes to dev farm', async () => {
  const persistentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-aos-persist-'));
  let mockDevWrites = 0;
  let mockDevPckHits = 0;

  const mockDevServer = http.createServer((req, res) => {
    if (req.method !== 'GET') {
      mockDevWrites++;
      res.writeHead(405);
      res.end('Write forbidden');
      return;
    }
    if (req.url.startsWith('/api/mobile/catalog')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        games: [
          {
            id: 'dev-cloud-rpg',
            title: 'Dev Cloud RPG',
            description: 'Live->Dev 복제 테스트 게임',
            genre: 'rpg',
            runtime: 'godot-pck',
            buildId: '1.2.0',
            ageRating: 'ALL',
            pckUrl: '/games/dev-cloud-rpg/index.pck',
            pckBytes: 16,
            requiredEngineVersion: '4.7.2',
            minAppVersionCode: 1
          }
        ]
      }));
      return;
    }
    if (req.url === '/games/dev-cloud-rpg/index.pck') {
      mockDevPckHits++;
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      res.end(Buffer.from('GDPC-MOCK-DEV-PCK'));
      return;
    }
    res.writeHead(404);
    res.end('Not Found');
  });

  const devPort = await listen(mockDevServer);
  const devUrl = `http://127.0.0.1:${devPort}`;

  let savedAccessToken = null;
  try {
    // 1) Run in LOCAL mode -> create guest + age gate + save local test progress
    const localRun = createAosDevServer({ port: 0, dataDir: persistentDir, dataSource: 'local' });
    const localPort = await listen(localRun.server);
    try {
      const authRes = await fetch(`http://127.0.0.1:${localPort}/api/mobile/auth/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'dev-unit-device-1' })
      });
      assert.equal(authRes.status, 201);
      const auth = await authRes.json();
      savedAccessToken = auth.accessToken;

      const saveRes = await fetch(`http://127.0.0.1:${localPort}/api/mobile/saves/survivor-arena-g2`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${savedAccessToken}`,
          'If-None-Match': '*'
        },
        body: JSON.stringify({ slot: 'main', schemaVersion: 1, payload: { level: 42, localMarker: true } })
      });
      assert.equal(saveRes.status, 200);
    } finally {
      await localRun.close();
    }

    // 2) Restart with SAME dataDir in DEV Read-Only Overlay mode
    const overlayRun = createAosDevServer({ port: 0, dataDir: persistentDir, dataSource: 'dev', devUrl });
    const overlayPort = await listen(overlayRun.server);
    try {
      // Existing local save MUST still be intact!
      const readSave = await fetch(`http://127.0.0.1:${overlayPort}/api/mobile/saves/survivor-arena-g2`, {
        headers: { Authorization: `Bearer ${savedAccessToken}` }
      });
      assert.equal(readSave.status, 200);
      const saveJson = await readSave.json();
      assert.equal(saveJson.payload.level, 42);
      assert.equal(saveJson.payload.localMarker, true);

      // Catalog MUST merge remote dev games + preserved local games
      const catRes = await fetch(`http://127.0.0.1:${overlayPort}/api/mobile/catalog`, {
        headers: { Authorization: `Bearer ${savedAccessToken}` }
      });
      assert.equal(catRes.status, 200);
      const catJson = await catRes.json();
      assert.equal(catJson.dataSourceMode, 'dev-overlay');
      assert.equal(catJson.devOverlayConnected, true);
      assert.equal(catJson.localDataPreserved, true);
      const ids = catJson.games.map(g => g.id);
      assert.ok(ids.includes('dev-cloud-rpg'), 'Remote dev game must appear');
      assert.ok(ids.includes('survivor-arena-g2'), 'Local game must be preserved');

      // Asset fetch proxies read-only from dev and caches locally (2nd fetch hits local disk cache)
      const pck1 = await fetch(`http://127.0.0.1:${overlayPort}/games/dev-cloud-rpg/index.pck`);
      assert.equal(pck1.status, 200);
      assert.equal(await pck1.text(), 'GDPC-MOCK-DEV-PCK');
      assert.equal(mockDevPckHits, 1);

      const pck2 = await fetch(`http://127.0.0.1:${overlayPort}/games/dev-cloud-rpg/index.pck`);
      assert.equal(pck2.status, 200);
      assert.equal(mockDevPckHits, 1, 'Second fetch must be served from local cache');

      // Writing save for remote dev game goes ONLY to local SQLite -> 0 writes to Dev Farm!
      const writeDevGameSave = await fetch(`http://127.0.0.1:${overlayPort}/api/mobile/saves/dev-cloud-rpg`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${savedAccessToken}`,
          'If-None-Match': '*'
        },
        body: JSON.stringify({ slot: 'main', schemaVersion: 1, payload: { hp: 100 } })
      });
      assert.equal(writeDevGameSave.status, 200);
      assert.equal(mockDevWrites, 0, 'Dev Farm must receive zero write mutations');
    } finally {
      await overlayRun.close();
    }
  } finally {
    mockDevServer.close();
    fs.rmSync(persistentDir, { recursive: true, force: true });
  }
});
