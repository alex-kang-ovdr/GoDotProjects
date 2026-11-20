import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { createStaticServer } from '../tools/dev.mjs';

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const closeServer = server => new Promise(resolve => {
  if (!server) return resolve();
  server.closeAllConnections?.();
  server.close(() => resolve());
});

function rawRequest(port, route, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: text }));
    });
    req.on('error', reject);
    if (body !== undefined) req.end(body);
    else req.end();
  });
}

test('dev same-origin API proxy preserves Origin/ACAO checks and isolates tunnel client rate-limit buckets', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-dev-proxy-'));
  const siteDir = path.join(temp, 'user');
  fs.mkdirSync(path.join(siteDir, 'catalog'), { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<!doctype html><html><body>PlayHub</body></html>');
  fs.writeFileSync(path.join(siteDir, 'catalog', 'games.json'), JSON.stringify({ schemaVersion: 1, entries: [] }));

  const localOrigin = 'http://127.0.0.1:18080';
  const tunnelOrigin = 'https://playhub-test.trycloudflare.com';
  const foreignOrigin = 'https://evil.invalid';
  const trustedProxySecret = crypto.randomBytes(32).toString('hex');

  const app = createApp({
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    secureCookies: false,
    userBaseUrl: localOrigin,
    adminBaseUrl: 'http://127.0.0.1:18081',
    userOrigins: [localOrigin, tunnelOrigin],
    adminOrigins: ['http://127.0.0.1:18081'],
    dataDir: path.join(temp, 'data'),
    admin: { localAutoLogin: false },
  }, { rootDir: siteDir, env: {}, trustedProxySecret });

  const ports = await app.listen();
  const staticServer = createStaticServer(siteDir, {
    apiPort: ports.public.port,
    trustedProxySecret,
    trustProxy: true,
  });
  const staticPort = await listen(staticServer);

  t.after(async () => {
    await closeServer(staticServer);
    await app.close();
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  });

  // 1. Foreign Origin is rejected with 403 and NEVER reflected in ACAO.
  const foreignGet = await rawRequest(staticPort, '/api/games', {
    headers: { Origin: foreignOrigin },
  });
  assert.equal(foreignGet.status, 403);
  assert.equal(foreignGet.headers['access-control-allow-origin'], undefined);

  const foreignPreflight = await rawRequest(staticPort, '/api/qa/session', {
    method: 'OPTIONS',
    headers: { Origin: foreignOrigin },
  });
  assert.equal(foreignPreflight.status, 403);
  assert.equal(foreignPreflight.headers['access-control-allow-origin'], undefined);

  // 2. Explicit tunnel origin in userOrigins is allowed and gets exact ACAO.
  const tunnelGet = await rawRequest(staticPort, '/api/games', {
    headers: { Origin: tunnelOrigin },
  });
  assert.equal(tunnelGet.status, 200);
  assert.equal(tunnelGet.headers['access-control-allow-origin'], tunnelOrigin);

  // 3. Normalized /api/admin paths are NOT proxied.
  for (const adminBypass of ['/api/admin/session', '/api/foo/../admin/session', '/api/%61dmin/session']) {
    const res = await rawRequest(staticPort, adminBypass, { headers: { Origin: localOrigin } });
    assert.notEqual(res.status, 200, `${adminBypass} must not reach admin API`);
  }

  // 4. Tunnel users with different CF-Connecting-IP get separate session rate-limit buckets.
  for (let i = 0; i < 120; i++) {
    const res = await rawRequest(staticPort, '/api/session', {
      headers: { Origin: tunnelOrigin, 'CF-Connecting-IP': '198.51.100.10' },
    });
    assert.equal(res.status, 200);
  }
  const throttled = await rawRequest(staticPort, '/api/session', {
    headers: { Origin: tunnelOrigin, 'CF-Connecting-IP': '198.51.100.10' },
  });
  assert.equal(throttled.status, 429);

  // Another tunnel user on a different IP is unaffected!
  const otherUser = await rawRequest(staticPort, '/api/session', {
    headers: { Origin: tunnelOrigin, 'CF-Connecting-IP': '198.51.100.20' },
  });
  assert.equal(otherUser.status, 200);

  // 5. Rightmost X-Forwarded-For IP is used when CF-Connecting-IP is absent, preventing client-side XFF spoofing.
  for (let i = 0; i < 120; i++) {
    const res = await rawRequest(staticPort, '/api/session', {
      headers: { Origin: tunnelOrigin, 'X-Forwarded-For': `203.0.113.${i % 200}, 198.51.100.30` },
    });
    assert.equal(res.status, 200);
  }
  const spoofedXff = await rawRequest(staticPort, '/api/session', {
    headers: { Origin: tunnelOrigin, 'X-Forwarded-For': '203.0.113.250, 198.51.100.30' },
  });
  assert.equal(spoofedXff.status, 429);

  // 6. Direct caller to public API cannot spoof CF-Connecting-IP / X-Forwarded-For without trustedProxySecret.
  for (let i = 0; i < 120; i++) {
    const res = await rawRequest(ports.public.port, '/api/session', {
      headers: { Origin: localOrigin, 'CF-Connecting-IP': `203.0.113.${(i % 200) + 1}` },
    });
    assert.equal(res.status, 200);
  }
  const directThrottled = await rawRequest(ports.public.port, '/api/session', {
    headers: { Origin: localOrigin, 'CF-Connecting-IP': '198.51.100.99' },
  });
  assert.equal(directThrottled.status, 429);
});
