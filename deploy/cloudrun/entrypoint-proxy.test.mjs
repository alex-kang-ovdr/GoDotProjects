import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  allowCloudRunSameHostOrigin,
  rewriteProxyLocation,
  buildUpstreamRequestOptions,
  proxyRequest,
  attachEdgeCompressionAndEtag,
  serveStatic,
} from './hub/entrypoint.mjs';
import { loadMergedCatalog } from '../../store/server/index.mjs';
import { buildCatalogSqlite, openCatalogSqlite } from '../../store/server/catalog-sqlite.mjs';
import { createStoreApp } from '../../store/server/store-api.mjs';
import { SAMPLE_CATALOG } from '../../store/web/store-catalog.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createServer: createForgeServer } = require('../../forge/server.cjs');

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

test('attachEdgeCompressionAndEtag strips Transfer-Encoding on chunked proxied JSON and serves gzip + 304 ETag', async t => {
  const payload = JSON.stringify({
    ok: true,
    templates: Array.from({ length: 40 }, (_, i) => ({ id: `tpl-${i}`, title: `Template ${i}`, summary: 'Shared runtime template entry' })),
  });
  const upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.write(payload.slice(0, 500));
    res.end(payload.slice(500));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const upPort = upstream.address().port;

  const proxy = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    attachEdgeCompressionAndEtag(req, res, pathname);
    proxyRequest(req, res, `http://127.0.0.1:${upPort}`, '/forge');
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const proxyPort = proxy.address().port;

  t.after(async () => {
    await new Promise(resolve => proxy.close(resolve));
    await new Promise(resolve => upstream.close(resolve));
  });

  const rawGet = (headers = {}) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${proxyPort}/forge/api/platform/templates`, { method: 'GET', headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });

  const r1 = await rawGet({ 'Accept-Encoding': 'gzip' });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers['content-encoding'], 'gzip');
  assert.equal(r1.headers['transfer-encoding'], undefined, 'Transfer-Encoding must be stripped when Content-Length is set');
  assert.equal(Number(r1.headers['content-length']), r1.body.length);
  assert.ok(r1.body.length < Buffer.byteLength(payload));
  assert.equal(zlib.gunzipSync(r1.body).toString('utf8'), payload);
  assert.ok(r1.headers.etag);

  const r2 = await rawGet({ 'Accept-Encoding': 'gzip', 'If-None-Match': r1.headers.etag });
  assert.equal(r2.status, 304);
  assert.equal(r2.body.length, 0);

  const r3 = await rawGet({ 'Accept-Encoding': 'br, gzip' });
  assert.equal(r3.status, 200);
  assert.equal(r3.headers['content-encoding'], 'br');
  assert.equal(r3.headers['transfer-encoding'], undefined);
  assert.equal(zlib.brotliDecompressSync(r3.body).toString('utf8'), payload);
});

test('serveStatic supports cached Brotli/Gzip and ETag 304 Not Modified', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-static-br-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const content = 'window.LOCALE_DATA=' + JSON.stringify(Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`k${i}`, `Translated text string number ${i}`]))) + ';\n';
  fs.writeFileSync(path.join(tmpDir, 'locale-data.js'), content, 'utf8');

  const srv = http.createServer((req, res) => serveStatic(req, res, tmpDir));
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  t.after(() => new Promise(resolve => srv.close(resolve)));

  const rawGet = (hdrs = {}) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}/locale-data.js`, { headers: hdrs }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });

  const br1 = await rawGet({ 'Accept-Encoding': 'br, gzip' });
  assert.equal(br1.status, 200);
  assert.equal(br1.headers['content-encoding'], 'br');
  assert.ok(br1.headers.etag);
  assert.ok(br1.body.length < Buffer.byteLength(content) * 0.5);
  assert.equal(zlib.brotliDecompressSync(br1.body).toString('utf8'), content);

  const cond = await rawGet({ 'Accept-Encoding': 'br, gzip', 'If-None-Match': br1.headers.etag });
  assert.equal(cond.status, 304);
  assert.equal(cond.body.length, 0);

  const gz = await rawGet({ 'Accept-Encoding': 'gzip' });
  assert.equal(gz.status, 200);
  assert.equal(gz.headers['content-encoding'], 'gzip');
  assert.equal(zlib.gunzipSync(gz.body).toString('utf8'), content);
});

test('loadMergedCatalog reads precompressed collected-catalog.json.gz when uncompressed JSON is absent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-gz-catalog-'));
  try {
    fs.mkdirSync(path.join(tmpDir, 'data'), { recursive: true });
    const gz = zlib.gzipSync(JSON.stringify({ items: [] }));
    fs.writeFileSync(path.join(tmpDir, 'data', 'collected-catalog.json.gz'), gz);
    const catalog = loadMergedCatalog(tmpDir);
    assert.ok(Array.isArray(catalog) && catalog.length > 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('forge/server.cjs serves precompressed-only vendor-release (.br/.gz + wasm-meta.json) with identity fallback', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-precomp-'));

  const jsRaw = Buffer.from('console.log("godot-editor-release");'.repeat(20), 'utf8');
  const wasmRaw = Buffer.concat([Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]), Buffer.alloc(2048, 0x42)]);
  fs.writeFileSync(path.join(tmpDir, 'godot.editor.js.gz'), zlib.gzipSync(jsRaw));
  fs.writeFileSync(path.join(tmpDir, 'godot.editor.js.br'), zlib.brotliCompressSync(jsRaw));
  fs.writeFileSync(path.join(tmpDir, 'godot.editor.wasm.gz'), zlib.gzipSync(wasmRaw));
  fs.writeFileSync(path.join(tmpDir, 'godot.editor.wasm.br'), zlib.brotliCompressSync(wasmRaw));
  const tag = `${wasmRaw.length}-deadbeef`;
  fs.writeFileSync(path.join(tmpDir, 'wasm-meta.json'), JSON.stringify({
    rawBytes: wasmRaw.length,
    validWasm: true,
    debugSymbolsStripped: true,
    contentTag: tag,
  }));

  const srv = createForgeServer({ webEditorVendorDir: tmpDir, hubAuth: false });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  t.after(async () => {
    await new Promise(resolve => { srv.close(resolve); srv.closeAllConnections?.(); });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const rawGet = (p, hdrs = {}) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${p}`, { headers: hdrs }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });

  const healthRes = await rawGet('/api/health');
  const health = JSON.parse(healthRes.body.toString('utf8'));
  assert.equal(health.webEditorWasmRelease, true);
  assert.equal(health.webEditorWasmBytes, wasmRaw.length);
  assert.equal(health.webEditorWasmTag, tag);

  const brRes = await rawGet(`/OfficialGodot/vendor/v/${tag}/godot.editor.wasm`, { 'Accept-Encoding': 'br, gzip' });
  assert.equal(brRes.status, 200);
  assert.equal(brRes.headers['content-encoding'], 'br');
  assert.equal(brRes.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.ok(zlib.brotliDecompressSync(brRes.body).equals(wasmRaw));

  const gzRes = await rawGet('/OfficialGodot/vendor/godot.editor.js', { 'Accept-Encoding': 'gzip' });
  assert.equal(gzRes.status, 200);
  assert.equal(gzRes.headers['content-encoding'], 'gzip');
  assert.ok(zlib.gunzipSync(gzRes.body).equals(jsRaw));

  const plainRes = await rawGet('/OfficialGodot/vendor/godot.editor.js', { 'Accept-Encoding': 'identity' });
  assert.equal(plainRes.status, 200);
  assert.equal(plainRes.headers['content-encoding'], undefined);
  assert.ok(plainRes.body.equals(jsRaw));
});

test('attachEdgeCompressionAndEtag emits public CDN-Cache-Control for anonymous catalogs and private no-store for authenticated requests', async t => {
  const payload = JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `game-${i}` })) });
  const srv = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;
    attachEdgeCompressionAndEtag(req, res, pathname);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
  });
  await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
  const port = srv.address().port;
  t.after(() => new Promise(resolve => { srv.close(resolve); srv.closeAllConnections?.(); }));

  const rawGet = (p, hdrs = {}) => new Promise((resolve, reject) => {
    const req = http.request(`http://127.0.0.1:${port}${p}`, { headers: hdrs }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });

  const anonGames = await rawGet('/api/games', { 'Accept-Encoding': 'br' });
  assert.equal(anonGames.status, 200);
  assert.match(String(anonGames.headers['cache-control']), /public.*s-maxage=300/);
  assert.match(String(anonGames.headers['cdn-cache-control']), /public.*max-age=300/);

  const authStore = await rawGet('/api/store/catalog?limit=12', { 'Accept-Encoding': 'br', Cookie: 'playhub_session=secret' });
  assert.equal(authStore.status, 200);
  assert.equal(authStore.headers['cache-control'], 'private, no-cache');
  assert.equal(authStore.headers['cdn-cache-control'], 'no-store');
});

test('SQLite-backed Store catalog serves filtered queries, slug detail, and SHA-256 verified artifacts with parity', async t => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-sqlite-test-'));
  let app = null;
  t.after(async () => {
    if (app) await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
  const dbPath = path.join(tmpDir, 'collected-catalog.sqlite');
  const built = buildCatalogSqlite({ entries: SAMPLE_CATALOG, collectedCount: 0, dbPath });
  assert.equal(built.count, SAMPLE_CATALOG.length);

  const reader = openCatalogSqlite(dbPath);
  try {
    assert.equal(reader.meta.catalog_total, SAMPLE_CATALOG.length);
    const pkgOnly = reader.query({ release_kind: 'package' }, { paginate: true, page: 1, limit: 10 });
    assert.ok(pkgOnly.total >= 1);
    assert.ok(pkgOnly.items.every(i => i.release_kind === 'package'));
    const qMatch = reader.query({ q: 'fortress' }, { paginate: true, page: 1, limit: 10 });
    assert.ok(qMatch.items.some(i => i.asset_id === 'lowpoly-fortress-pack'));
  } finally {
    reader.close();
  }

  app = createStoreApp({
    dataDir: path.join(tmpDir, 'saved'),
    serveStatic: false,
    catalogDbPath: dbPath,
  });
  const addr = await app.listen(0, '127.0.0.1');

  const health = await (await fetch(`http://127.0.0.1:${addr.port}/api/store/health`)).json();
  assert.equal(health.catalog_backend, 'sqlite');
  assert.equal(health.catalog_count, SAMPLE_CATALOG.length);

  const catRes = await (await fetch(`http://127.0.0.1:${addr.port}/api/store/catalog?release_kind=package&limit=2&page=1`)).json();
  assert.equal(catRes.items.length, 2);
  assert.equal(catRes.catalog_total, SAMPLE_CATALOG.length);

  const detail = await (await fetch(`http://127.0.0.1:${addr.port}/api/store/packages/lowpoly-fortress-pack`)).json();
  assert.equal(detail.asset_id, 'lowpoly-fortress-pack');

  const artRes = await fetch(`http://127.0.0.1:${addr.port}${detail.artifact_url}`);
  assert.equal(artRes.status, 200);
  assert.equal(artRes.headers.get('x-playforge-artifact-digest'), detail.artifact_digest);
});
