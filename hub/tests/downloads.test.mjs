import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createDownloads, resolvePlatformDownloads } from '../server/downloads.mjs';
import '../web/user/downloads.js';

const downloadsUi = globalThis.PlayHubDownloads;

test('resolvePlatformDownloads exposes all 6 required Hub & Forge platform items', () => {
  const items = resolvePlatformDownloads({
    publicBaseUrl: 'https://playhub-hub-88778617121.us-west1.run.app',
    env: {},
  });
  assert.deepEqual(
    items.map((x) => x.id),
    ['windows-hub', 'macos-hub', 'android-hub', 'ios-hub', 'windows-forge', 'macos-forge']
  );
  assert.deepEqual(
    items.map((x) => x.title),
    [
      '윈도우 플레이 허브 앱',
      '맥 플레이 허브 앱',
      '안드로이드 플레이 허브 앱',
      'iOS 플레이 허브 앱',
      '윈도우용 포지 에디터',
      '맥용 포지 에디터',
    ]
  );
  for (const item of items) {
    assert.equal(item.available, true);
    assert.equal(item.downloadUrl, `/api/downloads/${item.id}`);
  }
});

test('detectCurrentPlatform and orderDownloadsForPlatform prioritize current OS at top with badge flag', () => {
  assert.equal(downloadsUi.detectCurrentPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32' }), 'windows');
  assert.equal(downloadsUi.detectCurrentPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)', platform: 'MacIntel', maxTouchPoints: 0 }), 'macos');
  assert.equal(downloadsUi.detectCurrentPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-F711N)', platform: 'Linux armv8l' }), 'android');
  assert.equal(downloadsUi.detectCurrentPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone' }), 'ios');
  assert.equal(downloadsUi.detectCurrentPlatform({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }), 'ios');

  const winOrder = downloadsUi.orderDownloadsForPlatform(downloadsUi.DEFAULT_ITEMS, 'windows');
  assert.deepEqual(winOrder.recommended.map((x) => x.id), ['windows-hub', 'windows-forge']);
  assert.ok(winOrder.recommended.every((x) => x.isCurrentPlatform === true));
  assert.equal(winOrder.others.length, 4);
  assert.ok(winOrder.others.every((x) => x.isCurrentPlatform === false));

  const macOrder = downloadsUi.orderDownloadsForPlatform(downloadsUi.DEFAULT_ITEMS, 'macos');
  assert.deepEqual(macOrder.recommended.map((x) => x.id), ['macos-hub', 'macos-forge']);

  const aosOrder = downloadsUi.orderDownloadsForPlatform(downloadsUi.DEFAULT_ITEMS, 'android');
  assert.deepEqual(aosOrder.recommended.map((x) => x.id), ['android-hub']);

  const iosOrder = downloadsUi.orderDownloadsForPlatform(downloadsUi.DEFAULT_ITEMS, 'ios');
  assert.deepEqual(iosOrder.recommended.map((x) => x.id), ['ios-hub']);
});

test('GET /api/downloads and /api/downloads/:id serve all 6 items and redirect when external URL configured', async (t) => {
  const dl = createDownloads({
    config: { publicBaseUrl: 'https://playhub-hub-88778617121.us-west1.run.app' },
    platformRoot: process.cwd(),
    env: { PLAYHUB_DOWNLOAD_IOS_HUB_URL: 'https://testflight.apple.com/join/playhub' },
  });
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const handled = await dl.publicRoute(req, res, url);
    if (!handled) {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  t.after(() => new Promise((resolve) => { srv.close(resolve); srv.closeAllConnections?.(); }));

  const listRes = await fetch(`http://127.0.0.1:${port}/api/downloads`);
  assert.equal(listRes.status, 200);
  const { items } = await listRes.json();
  assert.equal(items.length, 6);

  for (const id of ['windows-hub', 'macos-hub', 'android-hub', 'windows-forge', 'macos-forge']) {
    const r = await fetch(`http://127.0.0.1:${port}/api/downloads/${id}`, { method: 'HEAD' });
    assert.equal(r.status, 200, `${id} should be downloadable`);
    assert.match(String(r.headers.get('content-disposition')), /attachment; filename=/);
  }

  const iosRes = await fetch(`http://127.0.0.1:${port}/api/downloads/ios-hub`, { redirect: 'manual' });
  assert.equal(iosRes.status, 302);
  assert.equal(iosRes.headers.get('location'), 'https://testflight.apple.com/join/playhub');
});
