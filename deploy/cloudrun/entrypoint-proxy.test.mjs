import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  allowCloudRunSameHostOrigin,
  rewriteProxyLocation,
  buildUpstreamRequestOptions,
  proxyRequest,
} from './hub/entrypoint.mjs';

test('buildUpstreamRequestOptions uses HTTPS + SNI servername for https upstreams and strips spoofed headers', () => {
  const { isHttps, options } = buildUpstreamRequestOptions(
    'https://playhub-forge-abc123-uw.a.run.app',
    {
      url: '/forge/api/health?x=1',
      method: 'GET',
      headers: {
        host: 'playhub-hub.a.run.app',
        'x-playhub-user': 'spoofed',
        'x-playhub-internal-secret': 'leak',
        'x-custom': 'ok',
      },
    },
    '/forge',
  );
  assert.equal(isHttps, true);
  assert.equal(options.hostname, 'playhub-forge-abc123-uw.a.run.app');
  assert.equal(options.port, 443);
  assert.equal(options.servername, 'playhub-forge-abc123-uw.a.run.app');
  assert.equal(options.path, '/api/health?x=1');
  assert.equal(options.headers.host, 'playhub-forge-abc123-uw.a.run.app');
  assert.equal(options.headers['x-playhub-user'], undefined);
  assert.equal(options.headers['x-playhub-internal-secret'], undefined);
  assert.equal(options.headers['x-custom'], 'ok');

  const httpRes = buildUpstreamRequestOptions(
    'http://127.0.0.1:4173',
    { url: '/forge/', method: 'GET', headers: {} },
    '/forge',
  );
  assert.equal(httpRes.isHttps, false);
  assert.equal(httpRes.options.port, '4173');
  assert.equal(httpRes.options.servername, undefined);
  assert.equal(httpRes.options.path, '/');
});

test('rewriteProxyLocation avoids double /forge prefix and preserves external/root redirects', () => {
  assert.equal(rewriteProxyLocation('/studio', '/forge'), '/forge/studio');
  assert.equal(rewriteProxyLocation('/forge/studio', '/forge'), '/forge/studio');
  assert.equal(rewriteProxyLocation('/forge', '/forge'), '/forge');
  assert.equal(rewriteProxyLocation('/forge?tab=1', '/forge'), '/forge?tab=1');
  assert.equal(rewriteProxyLocation('/forge-other', '/forge'), '/forge/forge-other');
  assert.equal(rewriteProxyLocation('/?view=account', '/forge'), '/?view=account');
  assert.equal(rewriteProxyLocation('//evil.example/a', '/forge'), '//evil.example/a');
  assert.equal(rewriteProxyLocation('https://accounts.google.com/o/oauth2', '/forge'), 'https://accounts.google.com/o/oauth2');
});

test('proxyRequest rewrites Location headers cleanly without duplicating /forge', async t => {
  const upstream = http.createServer((req, res) => {
    if (req.url === '/already-prefixed') {
      res.writeHead(302, { Location: '/forge/editor' });
      res.end();
      return;
    }
    if (req.url === '/unprefixed') {
      res.writeHead(302, { Location: '/editor' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upPort = upstream.address().port;

  const proxy = http.createServer((req, res) => {
    proxyRequest(req, res, `http://127.0.0.1:${upPort}`, '/forge');
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxy.address().port;

  t.after(async () => {
    await new Promise(resolve => proxy.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  });

  const r1 = await fetch(`http://127.0.0.1:${proxyPort}/forge/already-prefixed`, { redirect: 'manual' });
  assert.equal(r1.status, 302);
  assert.equal(r1.headers.get('location'), '/forge/editor');

  const r2 = await fetch(`http://127.0.0.1:${proxyPort}/forge/unprefixed`, { redirect: 'manual' });
  assert.equal(r2.status, 302);
  assert.equal(r2.headers.get('location'), '/forge/editor');
});

test('allowCloudRunSameHostOrigin permits matching *.run.app same-host origin and rejects external origins', () => {
  const origins = ['https://playhub-hub-hash-uw.a.run.app'];
  const allowed = allowCloudRunSameHostOrigin(
    { headers: { host: 'playhub-hub-88778617121.us-west1.run.app', origin: 'https://playhub-hub-88778617121.us-west1.run.app' } },
    origins,
    { K_SERVICE: 'playhub-hub' },
  );
  assert.equal(allowed, true);
  assert.ok(origins.includes('https://playhub-hub-88778617121.us-west1.run.app'));

  const deniedExternal = allowCloudRunSameHostOrigin(
    { headers: { host: 'playhub-hub-88778617121.us-west1.run.app', origin: 'https://evil.example.com' } },
    origins,
    { K_SERVICE: 'playhub-hub' },
  );
  assert.equal(deniedExternal, false);
  assert.ok(!origins.includes('https://evil.example.com'));

  const deniedLocal = allowCloudRunSameHostOrigin(
    { headers: { host: 'playhub-hub-88778617121.us-west1.run.app', origin: 'https://playhub-hub-88778617121.us-west1.run.app' } },
    ['http://localhost:8080'],
    {},
  );
  assert.equal(deniedLocal, false);
});
