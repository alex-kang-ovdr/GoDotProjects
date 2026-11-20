import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createStoreApp } from '../server/store-api.mjs';
import { formatSha256Digest, parseZipEntries, sha256Hex } from '../server/package-builder.mjs';
import {
  SAMPLE_CATALOG,
  createStoreApiClient,
  fetchCatalogWithFallback
} from '../web/store-catalog.js';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(TESTS_DIR, '..');
const SERVER_ENTRY = path.join(STORE_ROOT, 'server', 'index.mjs');
const WEB_DIR = path.join(STORE_ROOT, 'web');

function makeTempDir(prefix = 'playforge-store-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function startTestApp(t, options = {}) {
  const dataDir = options.dataDir || makeTempDir();
  const app = createStoreApp({ dataDir, ...options });
  const addr = await app.listen(0, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  t.after(async () => {
    await app.close();
    if (!options.keepDataDir) {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
  return { app, dataDir, baseUrl };
}

test('GET /api/store/catalog filters by release_kind, category, and search query q', async (t) => {
  const { baseUrl } = await startTestApp(t);

  const allRes = await fetch(`${baseUrl}/api/store/catalog`);
  assert.equal(allRes.status, 200);
  const allData = await allRes.json();
  assert.equal(allData.total, 4);
  assert.equal(allData.items.length, 4);
  assert.ok(Array.isArray(allData.categories));
  assert.equal(allData.categories.length, 4);

  const pkgRes = await fetch(`${baseUrl}/api/store/catalog?release_kind=package`);
  assert.equal(pkgRes.status, 200);
  const pkgData = await pkgRes.json();
  assert.equal(pkgData.total, 3);
  assert.ok(pkgData.items.every((item) => item.release_kind === 'package'));

  const edRes = await fetch(`${baseUrl}/api/store/catalog?release_kind=editorial`);
  assert.equal(edRes.status, 200);
  const edData = await edRes.json();
  assert.equal(edData.total, 1);
  assert.equal(edData.items[0].asset_id, 'godot-47-dock-guide');

  const catRes = await fetch(`${baseUrl}/api/store/catalog?category=${encodeURIComponent('오디오 · 효과음')}`);
  assert.equal(catRes.status, 200);
  const catData = await catRes.json();
  assert.equal(catData.total, 1);
  assert.equal(catData.items[0].asset_id, 'sfx-siege-audio-pack');

  const qRes = await fetch(`${baseUrl}/api/store/catalog?q=minimap`);
  assert.equal(qRes.status, 200);
  const qData = await qRes.json();
  assert.equal(qData.total, 1);
  assert.equal(qData.items[0].asset_id, 'ui-tactical-hud-kit');

  const combinedRes = await fetch(`${baseUrl}/api/store/catalog?release_kind=package&category=UI&q=tactical`);
  assert.equal(combinedRes.status, 200);
  const combinedData = await combinedRes.json();
  assert.equal(combinedData.total, 1);
  assert.equal(combinedData.items[0].asset_id, 'ui-tactical-hud-kit');

  const invalidRes = await fetch(`${baseUrl}/api/store/catalog?release_kind=unknown`);
  assert.equal(invalidRes.status, 400);
  const invalidData = await invalidRes.json();
  assert.equal(invalidData.error.code, 'INVALID_FILTER');
});

test('GET /api/store/packages/:slug returns contract details and 404 for unknown slug', async (t) => {
  const { baseUrl } = await startTestApp(t);

  const pkgRes = await fetch(`${baseUrl}/api/store/packages/lowpoly-fortress-pack`);
  assert.equal(pkgRes.status, 200);
  const pkg = await pkgRes.json();
  assert.equal(pkg.asset_id, 'lowpoly-fortress-pack');
  assert.equal(pkg.release_kind, 'package');
  assert.equal(pkg.saved, false);
  assert.equal(pkg.library_entry, null);
  assert.equal(pkg.releases.length, 1);
  assert.equal(pkg.releases[0].installable, true);
  assert.equal(
    pkg.releases[0].artifact_url,
    '/api/store/packages/lowpoly-fortress-pack/releases/1.2.0/artifact'
  );

  const edRes = await fetch(`${baseUrl}/api/store/packages/godot-47-dock-guide`);
  assert.equal(edRes.status, 200);
  const ed = await edRes.json();
  assert.equal(ed.release_kind, 'editorial');
  assert.equal(ed.releases[0].installable, false);

  const missingRes = await fetch(`${baseUrl}/api/store/packages/does-not-exist`);
  assert.equal(missingRes.status, 404);
  const missing = await missingRes.json();
  assert.equal(missing.error.code, 'PACKAGE_NOT_FOUND');
});

test('My Assets saves/removes StoreLibraryEntry for local default account and validates errors', async (t) => {
  const { baseUrl } = await startTestApp(t);

  const initialRes = await fetch(`${baseUrl}/api/store/my-assets`);
  assert.equal(initialRes.status, 200);
  const initial = await initialRes.json();
  assert.equal(initial.count, 0);
  assert.deepEqual(initial.entries, []);
  assert.equal(initial.account.auth_mode, 'local_default');
  assert.equal(initial.account.account_label, 'creator-demo@playhub.local');

  const saveRes = await fetch(`${baseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'lowpoly-fortress-pack', action: 'save' })
  });
  assert.equal(saveRes.status, 200);
  const saved = await saveRes.json();
  assert.equal(saved.ok, true);
  assert.equal(saved.saved, true);
  assert.equal(saved.count, 1);
  assert.equal(saved.entry.entry_type, 'StoreLibraryEntry');
  assert.equal(saved.entry.slug, 'lowpoly-fortress-pack');
  assert.equal(saved.entry.store_state, 'saved_to_library');
  assert.equal(saved.entry.installation_record, null);

  // Catalog reflects saved_to_library state for this account
  const catRes = await fetch(`${baseUrl}/api/store/catalog`);
  const cat = await catRes.json();
  const fortress = cat.items.find((x) => x.asset_id === 'lowpoly-fortress-pack');
  const tactical = cat.items.find((x) => x.asset_id === 'ui-tactical-hud-kit');
  assert.equal(fortress.store_state, 'saved_to_library');
  assert.equal(fortress.saved_in_library, true);
  assert.equal(tactical.store_state, 'catalog_listed');
  assert.equal(tactical.saved_in_library, false);

  // Editorial cannot be saved to library as package
  const editorialSave = await fetch(`${baseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'godot-47-dock-guide', action: 'save' })
  });
  assert.equal(editorialSave.status, 422);
  assert.equal((await editorialSave.json()).error.code, 'EDITORIAL_NOT_INSTALLABLE');

  // Validation errors
  const badAction = await fetch(`${baseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'lowpoly-fortress-pack', action: 'install' })
  });
  assert.equal(badAction.status, 422);
  assert.equal((await badAction.json()).error.code, 'INVALID_ACTION');

  const missingPkg = await fetch(`${baseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'missing-pack', action: 'save' })
  });
  assert.equal(missingPkg.status, 404);
  assert.equal((await missingPkg.json()).error.code, 'PACKAGE_NOT_FOUND');

  const nonJson = await fetch(`${baseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'hello'
  });
  assert.equal(nonJson.status, 415);

  // Remove entry
  const removeRes = await fetch(`${baseUrl}/api/store/my-assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug: 'lowpoly-fortress-pack', action: 'remove' })
  });
  assert.equal(removeRes.status, 200);
  const removed = await removeRes.json();
  assert.equal(removed.removed, true);
  assert.equal(removed.count, 0);
});

test('My Assets isolates Hub SSO accounts / mock sessions and persists across app restarts', async (t) => {
  const dataDir = makeTempDir('playforge-persist-');
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const aliceHeaders = { 'x-playhub-user': 'alice@playhub.local', 'Content-Type': 'application/json' };
  const bobKey = 'b'.repeat(64);
  const bobHeaders = { 'x-playhub-account-key': bobKey, 'x-playhub-user': 'bob@playhub.local', 'Content-Type': 'application/json' };

  // First server instance
  const app1 = createStoreApp({ dataDir });
  const addr1 = await app1.listen(0, '127.0.0.1');
  const url1 = `http://127.0.0.1:${addr1.port}`;

  try {
    const aliceSave = await fetch(`${url1}/api/store/my-assets`, {
      method: 'POST',
      headers: aliceHeaders,
      body: JSON.stringify({ slug: 'lowpoly-fortress-pack', action: 'save' })
    });
    assert.equal(aliceSave.status, 200);

    const bobSave = await fetch(`${url1}/api/store/my-assets`, {
      method: 'POST',
      headers: bobHeaders,
      body: JSON.stringify({ slug: 'ui-tactical-hud-kit', action: 'save' })
    });
    assert.equal(bobSave.status, 200);

    // Mock session cookie flow
    const mockLogin = await fetch(`${url1}/api/store/session/mock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'mock-creator@playhub.local' })
    });
    assert.equal(mockLogin.status, 200);
    const cookieHeader = mockLogin.headers.get('set-cookie').split(';')[0];

    const mockSave = await fetch(`${url1}/api/store/my-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ slug: 'sfx-siege-audio-pack', action: 'save' })
    });
    assert.equal(mockSave.status, 200);
    const mockData = await mockSave.json();
    assert.equal(mockData.account.auth_mode, 'mock_session');
    assert.equal(mockData.account.account_label, 'mock-creator@playhub.local');
  } finally {
    await app1.close();
  }

  // Second server instance pointing at same dataDir (simulating restart)
  const app2 = createStoreApp({ dataDir });
  const addr2 = await app2.listen(0, '127.0.0.1');
  const url2 = `http://127.0.0.1:${addr2.port}`;

  try {
    const aliceList = await (await fetch(`${url2}/api/store/my-assets`, {
      headers: { 'x-playhub-user': 'alice@playhub.local' }
    })).json();
    assert.equal(aliceList.count, 1);
    assert.equal(aliceList.entries[0].slug, 'lowpoly-fortress-pack');
    assert.equal(aliceList.account.auth_mode, 'hub_sso_header');

    const bobList = await (await fetch(`${url2}/api/store/my-assets`, {
      headers: { 'x-playhub-account-key': bobKey }
    })).json();
    assert.equal(bobList.count, 1);
    assert.equal(bobList.entries[0].slug, 'ui-tactical-hud-kit');
    assert.equal(bobList.account.account_key, bobKey);

    const mockList = await (await fetch(`${url2}/api/store/my-assets`, {
      headers: { 'x-store-mock-user': 'mock-creator@playhub.local' }
    })).json();
    assert.equal(mockList.count, 1);
    assert.equal(mockList.entries[0].slug, 'sfx-siege-audio-pack');

    // Default local account remained unaffected
    const defaultList = await (await fetch(`${url2}/api/store/my-assets`)).json();
    assert.equal(defaultList.count, 0);
  } finally {
    await app2.close();
  }
});

test('Hub SSO internalSecret and header validation enforce security boundaries', async (t) => {
  const { baseUrl } = await startTestApp(t, { internalSecret: 'super-secret-store-key-32-chars!!' });

  const denied = await fetch(`${baseUrl}/api/store/my-assets`, {
    headers: { 'x-playhub-user': 'alice@playhub.local' }
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, 'INTERNAL_SECRET_INVALID');

  const allowed = await fetch(`${baseUrl}/api/store/my-assets`, {
    headers: {
      'x-playhub-user': 'alice@playhub.local',
      'x-playhub-internal-secret': 'super-secret-store-key-32-chars!!'
    }
  });
  assert.equal(allowed.status, 200);

  const badHeader = await fetch(`${baseUrl}/api/store/my-assets`, {
    headers: {
      'x-playhub-user': '../bad/path',
      'x-playhub-internal-secret': 'super-secret-store-key-32-chars!!'
    }
  });
  assert.equal(badHeader.status, 400);
  assert.equal((await badHeader.json()).error.code, 'INVALID_ACCOUNT_HEADER');
});

test('GET /api/store/packages/:slug/releases/:version/artifact serves immutable .playforgepkg matching SHA-256 and rejects editorial', async (t) => {
  const { baseUrl } = await startTestApp(t);

  for (const item of SAMPLE_CATALOG.filter((x) => x.release_kind === 'package')) {
    const res = await fetch(
      `${baseUrl}/api/store/packages/${item.asset_id}/releases/${item.asset_version_id}/artifact`
    );
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') || '', new RegExp(`${item.asset_id}-${item.asset_version_id}\\.playforgepkg`));
    assert.match(res.headers.get('cache-control') || '', /immutable/);
    assert.equal(res.headers.get('x-playforge-artifact-digest'), item.artifact_digest);

    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(formatSha256Digest(bytes), item.artifact_digest, `${item.asset_id} artifact SHA-256 must match catalog`);

    const zipFiles = parseZipEntries(bytes);
    assert.ok(zipFiles.has('playforge-package.json'), 'package archive must include playforge-package.json');
    const pkgMeta = JSON.parse(zipFiles.get('playforge-package.json').toString('utf8'));
    assert.equal(pkgMeta.asset_id, item.asset_id);
    assert.equal(pkgMeta.asset_version_id, item.asset_version_id);
    assert.equal(pkgMeta.dependency_manifest_hash, item.dependency_manifest_hash);

    for (const fileEntry of item.file_manifest) {
      const extracted = zipFiles.get(fileEntry.path);
      assert.ok(extracted, `archive missing manifest file ${fileEntry.path}`);
      assert.equal(extracted.length, fileEntry.bytes);
      assert.equal(sha256Hex(extracted), fileEntry.sha256);
    }
  }

  // Editorial rejection with 422 EDITORIAL_NOT_INSTALLABLE
  const editorialRes = await fetch(
    `${baseUrl}/api/store/packages/godot-47-dock-guide/releases/1.0.0/artifact`
  );
  assert.equal(editorialRes.status, 422);
  const editorialBody = await editorialRes.json();
  assert.equal(editorialBody.error.code, 'EDITORIAL_NOT_INSTALLABLE');

  // Unknown release version -> 404
  const badVersion = await fetch(
    `${baseUrl}/api/store/packages/lowpoly-fortress-pack/releases/9.9.9/artifact`
  );
  assert.equal(badVersion.status, 404);
  assert.equal((await badVersion.json()).error.code, 'RELEASE_NOT_FOUND');

  // Mismatched digest query -> 409
  const badDigest = await fetch(
    `${baseUrl}/api/store/packages/lowpoly-fortress-pack/releases/1.2.0/artifact?digest=sha256:${'0'.repeat(64)}`
  );
  assert.equal(badDigest.status, 409);
  assert.equal((await badDigest.json()).error.code, 'ARTIFACT_DIGEST_MISMATCH');
});

test('static web serving, traversal guard, and store-catalog client fallback work cleanly', async (t) => {
  const { baseUrl } = await startTestApp(t);

  const htmlRes = await fetch(`${baseUrl}/`);
  assert.equal(htmlRes.status, 200);
  assert.match(htmlRes.headers.get('content-type') || '', /text\/html/);
  const html = await htmlRes.text();
  assert.match(html, /PlayForge Store/);

  const jsRes = await fetch(`${baseUrl}/store.js`);
  assert.equal(jsRes.status, 200);
  assert.match(jsRes.headers.get('content-type') || '', /text\/javascript/);

  const traversalRes = await fetch(`${baseUrl}/../server/store-api.mjs`);
  assert.equal(traversalRes.status, 404);

  // Live API client
  const liveClient = createStoreApiClient({ baseUrl });
  const liveResult = await fetchCatalogWithFallback({
    apiClient: liveClient,
    filters: { release_kind: 'package' }
  });
  assert.equal(liveResult.mode, 'live');
  assert.equal(liveResult.items.length, 3);

  // Static server without /api/store/* backend triggers clean fallback
  const staticOnlyServer = http.createServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
  await new Promise((resolve) => staticOnlyServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => staticOnlyServer.close(resolve)));
  const staticBase = `http://127.0.0.1:${staticOnlyServer.address().port}`;

  const fallbackClient = createStoreApiClient({ baseUrl: staticBase });
  const fallbackResult = await fetchCatalogWithFallback({
    apiClient: fallbackClient,
    filters: { release_kind: 'editorial', q: '도크' }
  });
  assert.equal(fallbackResult.mode, 'static');
  assert.equal(fallbackResult.items.length, 1);
  assert.equal(fallbackResult.items[0].asset_id, 'godot-47-dock-guide');
});

test('store/server/index.mjs supports --check and persists My Assets across process restarts', async (t) => {
  const dataDir = makeTempDir('playforge-cli-');
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

  const checkRun = spawnSync(process.execPath, [SERVER_ENTRY, '--check', '--data-dir', dataDir], {
    encoding: 'utf8',
    windowsHide: true
  });
  assert.equal(checkRun.status, 0, checkRun.stderr);
  assert.match(checkRun.stdout, /Store ready/);

  const startChild = async () => {
    const child = spawn(
      process.execPath,
      [SERVER_ENTRY, '--port', '0', '--host', '127.0.0.1', '--data-dir', dataDir, '--no-browser'],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
    let output = '';
    const baseUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server start timeout: ${output}`)), 8000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString('utf8');
        const match = output.match(/PlayForge Store ready:\s+(http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1].replace(/\/$/, ''));
        }
      });
      child.stderr.on('data', (chunk) => {
        output += chunk.toString('utf8');
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Server exited early (${code}): ${output}`));
      });
    });
    return { child, baseUrl };
  };

  const stopChild = async (child) => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(3000).then(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      })
    ]);
  };

  const first = await startChild();
  try {
    const res = await fetch(`${first.baseUrl}/api/store/my-assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'ui-tactical-hud-kit', action: 'save' })
    });
    assert.equal(res.status, 200);
  } finally {
    await stopChild(first.child);
  }

  const second = await startChild();
  try {
    const res = await fetch(`${second.baseUrl}/api/store/my-assets`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.count, 1);
    assert.equal(data.entries[0].slug, 'ui-tactical-hud-kit');
  } finally {
    await stopChild(second.child);
  }
});

const chromePath = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

test('Store web UI connects to live server, persists library actions, and preserves static fallback', {
  skip: !fs.existsSync(chromePath),
  timeout: 60000
}, async (t) => {
  const { baseUrl } = await startTestApp(t);

  // Also create a plain static-only server to verify fallback mode in browser
  const staticOnly = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }));
      return;
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const filePath = path.join(WEB_DIR, rel);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end();
      return;
    }
    const ext = path.extname(filePath);
    const type = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type });
    res.end(fs.readFileSync(filePath));
  });
  await new Promise((resolve) => staticOnly.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => staticOnly.close(resolve)));
  const staticUrl = `http://127.0.0.1:${staticOnly.address().port}`;

  const profile = makeTempDir('playforge-chrome-');
  const chrome = spawn(
    chromePath,
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' }
  );
  let socket;
  const exceptions = [];
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    let port;
    for (let i = 0; i < 100; i += 1) {
      try {
        const value = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        if (Number.isInteger(value) && value > 0) {
          port = value;
          break;
        }
      } catch {
        // wait for Chrome port file
      }
      await delay(100);
    }
    assert.ok(port, 'Chrome debugging port should be ready');

    const page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    let serial = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.exceptionThrown') {
        exceptions.push(msg.params.exceptionDetails.text);
      }
      if (pending.has(msg.id)) {
        const [resolve, reject] = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++serial;
      pending.set(id, [resolve, reject]);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
      return res.result.value;
    };
    const until = async (expression) => {
      for (let i = 0; i < 100; i += 1) {
        if (await evaluate(expression)) return;
        await delay(50);
      }
      throw new Error(`Condition timed out: ${expression}`);
    };

    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1365, height: 900, deviceScaleFactor: 1, mobile: false });

    // 1. Live server mode
    await send('Page.navigate', { url: `${baseUrl}/` });
    await until("document.querySelector('#connection-badge')?.dataset.mode === 'live'");
    assert.equal(await evaluate("document.querySelectorAll('#catalog-list .card').length"), 4);

    // Save lowpoly-fortress-pack in UI
    await evaluate("document.querySelector('[data-action=\"toggle-library\"][data-id=\"lowpoly-fortress-pack\"]').click()");
    await until("document.querySelector('#library-count').textContent === '1'");

    // Reload page and confirm persistence from server
    await send('Page.navigate', { url: `${baseUrl}/` });
    await until("document.querySelector('#connection-badge')?.dataset.mode === 'live' && document.querySelector('#library-count').textContent === '1'");

    // Switch to My Library tab and verify saved card is visible
    await evaluate("document.querySelector('.tab[data-tab=\"library\"]').click()");
    await until("document.querySelectorAll('#catalog-list .card').length === 1");
    assert.match(await evaluate("document.querySelector('#catalog-list').textContent"), /Lowpoly Fortress Siege Kit/);

    // Editorial card must never have a save/install button
    await evaluate("document.querySelector('.tab[data-tab=\"browse\"]').click()");
    await until("document.querySelectorAll('#catalog-list .card').length === 4");
    assert.equal(
      await evaluate("!!document.querySelector('[data-card-id=\"godot-47-dock-guide\"] [data-action=\"toggle-library\"]')"),
      false
    );

    // 2. Static fallback mode
    await send('Page.navigate', { url: `${staticUrl}/` });
    await until("document.querySelector('#connection-badge')?.dataset.mode === 'static' && document.querySelectorAll('#catalog-list .card').length === 4");
    await evaluate("document.querySelector('[data-action=\"toggle-library\"][data-id=\"ui-tactical-hud-kit\"]').click()");
    await until("document.querySelector('#library-count').textContent === '1'");

    assert.deepEqual(exceptions, []);
  } finally {
    socket?.close();
    await new Promise((resolve) => {
      chrome.once('exit', resolve);
      if (chrome.exitCode !== null || !chrome.kill()) resolve();
    });
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
