'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createCompressionCache, createServer } = require('../server.cjs');

const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

function rawRequest(port, route, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method: 'GET', headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('compression cache enforces maxBytes and maxFiles with LRU eviction', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-http-cache-lru-'));
  const cacheDir = path.join(temp, 'cache');
  const srcDir = path.join(temp, 'src');
  fs.mkdirSync(srcDir, { recursive: true });
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  // Create 3 distinct compressible files whose gzip output is ~1.5 KB each (high-entropy prefix + text).
  const files = ['a.js', 'b.js', 'c.js'].map((name, idx) => {
    const file = path.join(srcDir, name);
    // Deterministic incompressible-ish chunk + padding so gzip size is predictable (~1.2 KB each)
    let text = '';
    for (let i = 0; i < 180; i++) text += `var v_${idx}_${i}=${(i * 2654435761 + idx * 97) >>> 0};\n`;
    fs.writeFileSync(file, text, 'utf8');
    return { name, file, info: fs.statSync(file) };
  });

  // Cap at 2 files so inserting the 3rd evicts the least-recently-used entry.
  const cache = createCompressionCache({ dir: cacheDir, maxFiles: 2, maxBytes: 1024 * 1024, env: {} });
  assert.equal(cache.enabled, true);

  const first = await cache.get(files[0].file, files[0].info, 'gzip');
  assert.ok(first);
  const firstPath = first.path;
  first.release();

  const second = await cache.get(files[1].file, files[1].info, 'gzip');
  assert.ok(second);
  const secondPath = second.path;
  second.release();

  // Touch first so second becomes LRU.
  const firstHit = await cache.get(files[0].file, files[0].info, 'gzip');
  assert.ok(firstHit);
  firstHit.release();

  // Insert third -> should evict second (LRU) and keep first + third.
  const third = await cache.get(files[2].file, files[2].info, 'gzip');
  assert.ok(third);
  const thirdPath = third.path;
  third.release();

  assert.equal(fs.existsSync(firstPath), true, 'MRU entry must survive eviction');
  assert.equal(fs.existsSync(secondPath), false, 'LRU entry must be evicted from disk');
  assert.equal(fs.existsSync(thirdPath), true, 'newly inserted entry must exist');
  assert.equal(cache.stats().fileCount, 2);

  // Byte-cap test: maxBytes smaller than two compressed files evicts down to <= maxBytes.
  const tightCacheDir = path.join(temp, 'tight-cache');
  const singleSize = fs.statSync(firstPath).size;
  const tightCache = createCompressionCache({ dir: tightCacheDir, maxFiles: 10, maxBytes: singleSize + 50, env: {} });
  const t1 = await tightCache.get(files[0].file, files[0].info, 'gzip');
  assert.ok(t1);
  t1.release();
  const t2 = await tightCache.get(files[1].file, files[1].info, 'gzip');
  assert.ok(t2);
  t2.release();
  assert.ok(tightCache.stats().totalBytes <= singleSize + 50);
  assert.equal(tightCache.stats().fileCount, 1);

  // Entry larger than maxBytes is not cached and returns null cleanly.
  const tinyCache = createCompressionCache({ dir: path.join(temp, 'tiny'), maxFiles: 10, maxBytes: 16, env: {} });
  const skipped = await tinyCache.get(files[0].file, files[0].info, 'gzip');
  assert.equal(skipped, null);
  assert.equal(tinyCache.stats().fileCount, 0);
});

test('Cloud Run (K_SERVICE) disables runtime compression cache by default and restricts opt-in defaults', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-cloudrun-cache-'));
  const cacheDir = path.join(temp, 'cache');
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  const cloudRunCache = createCompressionCache({ dir: cacheDir, env: { K_SERVICE: 'playforge-prod' } });
  assert.equal(cloudRunCache.enabled, false);
  assert.equal(cloudRunCache.stats().isCloudRun, true);
  assert.equal(cloudRunCache.stats().maxBytes, 32 * 1024 * 1024);
  assert.equal(cloudRunCache.stats().maxFiles, 64);

  // End-to-end check: server with K_SERVICE serves static JS uncompressed and writes nothing to cacheDir.
  const server = createServer({
    hubAuth: false,
    publicOrigin: 'http://127.0.0.1:18080',
    workspace: path.join(temp, 'workspace'),
    platformWorkspace: path.join(temp, 'platform'),
    buildDirectory: path.join(temp, 'builds'),
    env: { K_SERVICE: 'playforge-prod' },
    httpCache: { dir: cacheDir },
  });
  const port = await listen(server);
  t.after(() => server.shutdown());

  assert.equal(server.httpCache.enabled, false);
  const res = await rawRequest(port, '/OfficialGodot/editor-bridge.js', { 'Accept-Encoding': 'br, gzip' });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-encoding'], undefined);
  assert.equal(fs.existsSync(cacheDir), false);

  // Explicit opt-in on Cloud Run respects bounded defaults.
  const optInCache = createCompressionCache({
    dir: cacheDir,
    env: { K_SERVICE: 'playforge-prod', PLAYFORGE_HTTP_CACHE_ENABLED: '1' },
  });
  assert.equal(optInCache.enabled, true);
  assert.equal(optInCache.stats().maxBytes, 32 * 1024 * 1024);
  assert.equal(optInCache.stats().maxFiles, 64);
});
