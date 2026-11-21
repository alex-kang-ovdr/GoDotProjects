import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {
  createAosDevServer,
  resolveWithinRoot,
  sanitizeGameRelPath
} from './serve-apk-download.mjs';

function listen(server) {
  return new Promise(resolveListen => {
    server.listen(0, '127.0.0.1', () => resolveListen(server.address().port));
  });
}

function rawGet(port, rawPath) {
  return new Promise((resolveReq, rejectReq) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'GET', path: rawPath, headers: { Connection: 'close' } },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolveReq({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );
    req.on('error', rejectReq);
    req.end();
  });
}

test('sanitizeGameRelPath & resolveWithinRoot block leading slash, backslash, drive letter, dotdot, NUL, and malformed escapes', () => {
  assert.equal(sanitizeGameRelPath('index.pck'), 'index.pck');
  assert.equal(sanitizeGameRelPath('assets/ui/hero.png'), 'assets/ui/hero.png');

  for (const bad of [
    '/etc/passwd',
    '%2fetc%2fpasswd',
    '\\Windows\\win.ini',
    '%5cWindows%5cwin.ini',
    'C:/Windows/win.ini',
    'C%3A/Windows/win.ini',
    'c:secret.txt',
    '../secret.txt',
    '%2e%2e/secret.txt',
    'assets/%2e%2e/%2e%2e/secret.txt',
    'assets/..%2fsecret.txt',
    'assets//hero.png',
    './index.pck',
    'foo%00bar.png',
    '%E0%A4%A'
  ]) {
    assert.equal(sanitizeGameRelPath(bad), null, `Expected '${bad}' to be rejected`);
  }

  const root = path.resolve(os.tmpdir(), 'playhub-root-boundary-test');
  assert.equal(resolveWithinRoot(root, 'assets/hero.png'), path.resolve(root, 'assets/hero.png'));
  assert.equal(resolveWithinRoot(root, '../escape.txt'), null);
  assert.equal(resolveWithinRoot(root, '/abs/escape.txt'), null);
  assert.equal(resolveWithinRoot(root, 'C:/Windows/win.ini'), null);
});

test('/games/:gameId/:rel enforces root boundary on both local reads and dev-asset-cache writes', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-aos-traversal-'));
  const outsideFile = path.join(workDir, 'top-secret.txt');
  fs.writeFileSync(outsideFile, 'TOP-SECRET-CONTENT');
  const outsideWriteTarget = path.join(workDir, 'pwned-write.txt');

  let remoteHits = 0;
  const mockDevServer = http.createServer((req, res) => {
    remoteHits++;
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    res.end('REMOTE-PAYLOAD');
  });
  const devPort = await listen(mockDevServer);
  const devUrl = `http://127.0.0.1:${devPort}`;

  const aosServer = createAosDevServer({
    port: 0,
    dataDir: workDir,
    dataSource: 'dev',
    devUrl
  });
  const aosPort = await listen(aosServer.server);

  try {
    const posixOutside = outsideFile.replace(/\\/g, '/');
    const posixWriteTarget = outsideWriteTarget.replace(/\\/g, '/');
    const strictBadRequestPaths = [
      `/games/survivor-arena-g2//${posixOutside.replace(/^\//, '')}`,
      `/games/survivor-arena-g2/%2fetc%2fpasswd`,
      `/games/survivor-arena-g2/${encodeURIComponent(outsideFile)}`,
      `/games/survivor-arena-g2/${posixOutside}`,
      `/games/survivor-arena-g2/C:/Windows/win.ini`,
      `/games/survivor-arena-g2/C%3A/Windows/win.ini`,
      `/games/survivor-arena-g2/${posixWriteTarget}`,
      `/games/survivor-arena-g2/sub/%5c..%5c..%5ctop-secret.txt`,
      `/games/survivor-arena-g2/a/..b/secret.txt`,
      `/games/survivor-arena-g2/%E0%A4%A`
    ];
    for (const p of strictBadRequestPaths) {
      const res = await rawGet(aosPort, p);
      assert.equal(res.status, 400, `Attack path '${p}' must return 400, got ${res.status}`);
      assert.ok(!res.body.includes('TOP-SECRET-CONTENT'), `Secret leaked for '${p}'`);
      assert.ok(!res.body.includes('REMOTE-PAYLOAD'), `Remote write/read should be blocked for '${p}'`);
    }
    // Percent-encoded dotdot normalized by URL parser also cannot escape or leak
    const normRes = await rawGet(aosPort, `/games/survivor-arena-g2/%2e%2e/%2e%2e/%2e%2e/top-secret.txt`);
    assert.ok(normRes.status === 400 || normRes.status === 404, `Expected 400 or 404, got ${normRes.status}`);
    assert.ok(!normRes.body.includes('TOP-SECRET-CONTENT'));
    assert.ok(!normRes.body.includes('REMOTE-PAYLOAD'));
    assert.equal(remoteHits, 0, 'Blocked traversal paths must never trigger upstream dev-overlay fetches');
    assert.equal(fs.existsSync(outsideWriteTarget), false, 'Blocked paths must never write outside dev-asset-cache');

    // Legitimate nested asset path still fetches and caches cleanly inside dev-asset-cache/<gameId>
    const validRes = await rawGet(aosPort, '/games/dev-cloud-rpg/assets/hero.png');
    assert.equal(validRes.status, 200);
    assert.equal(validRes.body, 'REMOTE-PAYLOAD');
    assert.equal(remoteHits, 1);
    const expectedCacheFile = path.join(workDir, 'dev-asset-cache', 'dev-cloud-rpg', 'assets', 'hero.png');
    assert.equal(fs.existsSync(expectedCacheFile), true);
  } finally {
    aosServer.server.closeAllConnections?.();
    await aosServer.close();
    mockDevServer.closeAllConnections?.();
    await new Promise(resolveClose => mockDevServer.close(() => resolveClose()));
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
