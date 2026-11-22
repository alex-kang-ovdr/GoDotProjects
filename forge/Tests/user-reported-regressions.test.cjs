'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {
  createServer,
  inspectWasmReleaseBinary,
} = require('../server.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FORGE_ROOT = path.resolve(__dirname, '..');
const OFFICIAL_GODOT_DIR = path.join(FORGE_ROOT, 'OfficialGodot');

function buildMinimalWasm() {
  return Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
}

function rawRequest(port, route, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function startTempServer(t, options = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-reg-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(tmp, 'Workspace'),
    platformWorkspace: path.join(tmp, 'Platform'),
    buildDirectory: path.join(tmp, 'Builds'),
    ...options,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => server.shutdown());
  return { server, port: server.address().port, tmp };
}

test('TC-REG-001 (ISS-001): multi-origin publicOrigin allows external HTTPS origin and blocks foreign origin', async (t) => {
  const allowedHttps = 'https://verify-playhub.trycloudflare.com';
  const { port } = await startTempServer(t, {
    publicOrigin: `http://127.0.0.1:18230,${allowedHttps}`,
  });

  const okRes = await rawRequest(port, '/api/desktop-downloads', {
    headers: { Origin: allowedHttps },
  });
  assert.equal(okRes.status, 200, 'Allowlisted external HTTPS origin must be accepted');

  const blockedRes = await rawRequest(port, '/api/desktop-downloads', {
    headers: { Origin: 'https://evil-foreign.example.com' },
  });
  assert.equal(blockedRes.status, 403, 'Foreign origin must be rejected with 403');
  assert.match(blockedRes.body.toString('utf8'), /Foreign origin/i);
});

test('TC-REG-002 (ISS-005): slim custom release WASM build profile enforces size/modules and provisioned binary stays slim', () => {
  const slimProfilePath = path.join(REPO_ROOT, 'tools', 'forge', 'web_editor_release_slim.py');
  assert.ok(fs.existsSync(slimProfilePath), 'tools/forge/web_editor_release_slim.py must exist');
  const slimProfile = fs.readFileSync(slimProfilePath, 'utf8');

  for (const required of [
    'optimize = "size_extra"',
    'debug_symbols = "no"',
    'lto = "thin"',
    'deprecated = "yes"',
    'module_playforge_core_enabled = "yes"',
    'module_fbx_enabled = "yes"',
    'module_jolt_physics_enabled = "yes"',
    'module_openxr_enabled = "no"',
    'module_webxr_enabled = "no"',
    'module_mobile_vr_enabled = "no"',
    'module_camera_enabled = "no"',
  ]) {
    assert.ok(slimProfile.includes(required), `web_editor_release_slim.py must enforce ${required}`);
  }

  // When slim custom release WASM is provisioned locally, verify it has not regressed back to 91.9 MiB vanilla.
  const releaseDir = path.join(OFFICIAL_GODOT_DIR, 'vendor-release');
  const releaseWasm = path.join(releaseDir, 'godot.editor.wasm');
  if (fs.existsSync(releaseWasm)) {
    const info = inspectWasmReleaseBinary(releaseWasm);
    assert.equal(info.validWasm, true);
    assert.equal(info.debugSymbolsStripped, true, 'vendor-release WASM must have zero DWARF/debug sections');
    assert.ok(
      info.rawBytes <= 65 * 1024 * 1024,
      `Slim release WASM regressed in size: ${(info.rawBytes / (1024 * 1024)).toFixed(2)} MiB (> 65 MiB)`
    );
    assert.ok(fs.existsSync(releaseWasm + '.br'), 'Precompressed godot.editor.wasm.br sidecar must exist');
    assert.ok(fs.existsSync(releaseWasm + '.gz'), 'Precompressed godot.editor.wasm.gz sidecar must exist');
    const brSize = fs.statSync(releaseWasm + '.br').size;
    assert.ok(brSize < 25 * 1024 * 1024, `Brotli WASM sidecar too large: ${brSize} bytes`);

    const buf = fs.readFileSync(releaseWasm);
    for (const sym of ['PlayForgePlatform', 'JoltPhysicsServer3D', 'EditorSceneFormatImporterUFBX']) {
      assert.ok(buf.includes(Buffer.from(sym, 'ascii')), `Custom release WASM must include symbol ${sym}`);
    }
  }
});

test('TC-REG-003 (ISS-006): Web & Desktop custom profiles keep deprecated=yes (addon compatibility) and disable XR/VR + camera', () => {
  const desktopProfilePath = path.join(REPO_ROOT, 'tools', 'desktop', 'custom.py');
  const buildPs1Path = path.join(REPO_ROOT, 'tools', 'forge', 'build-web-editor-release.ps1');
  assert.ok(fs.existsSync(desktopProfilePath), 'tools/desktop/custom.py must exist');
  assert.ok(fs.existsSync(buildPs1Path), 'tools/forge/build-web-editor-release.ps1 must exist');

  const desktopProfile = fs.readFileSync(desktopProfilePath, 'utf8');
  for (const required of [
    'deprecated = "yes"',
    'module_playforge_core_enabled = "yes"',
    'openxr = "no"',
    'module_openxr_enabled = "no"',
    'module_webxr_enabled = "no"',
    'module_mobile_vr_enabled = "no"',
    'module_camera_enabled = "no"',
  ]) {
    assert.ok(desktopProfile.includes(required), `tools/desktop/custom.py must enforce ${required}`);
  }
  assert.ok(!desktopProfile.includes('module_fbx_enabled = "no"'), 'tools/desktop/custom.py must NOT disable fbx');
  assert.ok(!desktopProfile.includes('module_jolt_physics_enabled = "no"'), 'tools/desktop/custom.py must NOT disable jolt_physics');

  const buildPs1 = fs.readFileSync(buildPs1Path, 'utf8');
  assert.ok(buildPs1.includes('deprecated=yes'), 'build-web-editor-release.ps1 must pass deprecated=yes');
  assert.ok(!buildPs1.includes('deprecated=no'), 'build-web-editor-release.ps1 must NOT pass deprecated=no');
});

test('TC-REG-004 (ISS-007): content-tagged vendor URLs prevent stale 91.9MB cache and inject accurate WASM size metadata', async (t) => {
  const fakeVendorRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-vendor-tag-'));
  t.after(() => fs.rmSync(fakeVendorRoot, { recursive: true, force: true }));

  // Build a self-contained stub vendor directory if real vendor-release is absent in CI,
  // or use the live server's resolved vendor when available.
  const hasLocalVendor = fs.existsSync(path.join(OFFICIAL_GODOT_DIR, 'vendor-release', 'godot.editor.wasm'))
    || fs.existsSync(path.join(OFFICIAL_GODOT_DIR, 'vendor', 'godot.editor.wasm'));

  const envOverrides = {};
  if (!hasLocalVendor) {
    fs.writeFileSync(path.join(fakeVendorRoot, 'godot.editor.js'), 'window.Engine = function(){};');
    fs.writeFileSync(path.join(fakeVendorRoot, 'godot.editor.wasm'), buildMinimalWasm());
    envOverrides.PLAYFORGE_WEB_EDITOR_VENDOR_DIR = fakeVendorRoot;
  }

  const { port } = await startTempServer(t, { env: envOverrides });

  const health = JSON.parse((await rawRequest(port, '/api/health')).body.toString('utf8'));
  assert.equal(health.ok, true);
  assert.equal(health.webEditorWasmRelease, true);
  assert.ok(typeof health.webEditorWasmTag === 'string' && /^\d+-[a-f0-9]{8}$/.test(health.webEditorWasmTag),
    `Expected <bytes>-<sha8> webEditorWasmTag, got: ${health.webEditorWasmTag}`);
  assert.ok(Number.isFinite(health.webEditorWasmBytes) && health.webEditorWasmBytes > 0);
  if (fs.existsSync(path.join(OFFICIAL_GODOT_DIR, 'vendor-release', 'godot.editor.wasm'))) {
    assert.ok(health.webEditorWasmBytes <= 65 * 1024 * 1024, 'Served WASM must not regress to 91.9 MiB');
  }

  const session = JSON.parse((await rawRequest(port, '/api/session')).body.toString('utf8'));
  assert.equal(session.webEditorWasmTag, health.webEditorWasmTag);
  assert.equal(session.webEditorWasmBytes, health.webEditorWasmBytes);

  // HTML pages inject tag/bytes metadata and rewrite vendor script to versioned URL.
  for (const htmlPath of ['/OfficialGodot/index.html', '/OfficialGodot/editor.html', '/OfficialGodot/showcase-game.html']) {
    const res = await rawRequest(port, htmlPath);
    assert.equal(res.status, 200, `${htmlPath} must return 200`);
    assert.equal(res.headers['cache-control'], 'no-cache');
    const html = res.body.toString('utf8');
    assert.ok(html.includes(`window.__PLAYFORGE_WEB_EDITOR_WASM_TAG__=${JSON.stringify(health.webEditorWasmTag)}`),
      `${htmlPath} must inject __PLAYFORGE_WEB_EDITOR_WASM_TAG__`);
    assert.ok(html.includes(`window.__PLAYFORGE_WEB_EDITOR_WASM_BYTES__=${JSON.stringify(health.webEditorWasmBytes)}`),
      `${htmlPath} must inject __PLAYFORGE_WEB_EDITOR_WASM_BYTES__`);
    if (htmlPath !== '/OfficialGodot/index.html') {
      assert.ok(html.includes(`src="vendor/v/${health.webEditorWasmTag}/godot.editor.js"`),
        `${htmlPath} must rewrite vendor/godot.editor.js to versioned vendor/v/<tag>/godot.editor.js`);
    }
  }

  // Current versioned URL -> immutable; unversioned & stale versioned URLs -> no-cache.
  const currentRes = await rawRequest(port, `/OfficialGodot/vendor/v/${health.webEditorWasmTag}/godot.editor.wasm`, { method: 'HEAD' });
  assert.equal(currentRes.status, 200);
  assert.equal(currentRes.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(currentRes.headers['x-playforge-web-editor-wasm'], 'release');

  const unversionedRes = await rawRequest(port, '/OfficialGodot/vendor/godot.editor.wasm', { method: 'HEAD' });
  assert.equal(unversionedRes.status, 200);
  assert.equal(unversionedRes.headers['cache-control'], 'no-cache',
    'Unversioned /vendor/godot.editor.wasm must NEVER use max-age=86400 (caused 91.9MB stale cache)');

  const staleTagRes = await rawRequest(port, '/OfficialGodot/vendor/v/96413171-deadbeef/godot.editor.wasm', { method: 'HEAD' });
  assert.equal(staleTagRes.status, 200);
  assert.equal(staleTagRes.headers['cache-control'], 'no-cache',
    'Stale version tag must NOT be cached as immutable');

  // Client-side JS contracts: versioned URLs + progress total normalization + no TDZ on forgePath.
  const editorBridge = fs.readFileSync(path.join(OFFICIAL_GODOT_DIR, 'editor-bridge.js'), 'utf8');
  assert.ok(editorBridge.includes('/OfficialGodot/vendor/v/'), 'editor-bridge.js must load versioned vendor URL');
  assert.ok(editorBridge.includes('__PLAYFORGE_WEB_EDITOR_WASM_BYTES__'), 'editor-bridge.js must use known WASM bytes for progress total');
  assert.ok(
    editorBridge.indexOf('const forgePath') > 0 && editorBridge.indexOf('const forgePath') < editorBridge.indexOf('const vendorEditorBase'),
    'editor-bridge.js must declare forgePath before vendorEditorBase (avoid TDZ ReferenceError)'
  );

  const showcaseGameJs = fs.readFileSync(path.join(OFFICIAL_GODOT_DIR, 'showcase-game.js'), 'utf8');
  assert.ok(showcaseGameJs.includes('/OfficialGodot/vendor/v/'), 'showcase-game.js must load versioned vendor URL');
});

test('TC-REG-005 (ISS-008): Showcase ("제작과정 보기") filter is always visible and showcase project creation works', async (t) => {
  const indexHtml = fs.readFileSync(path.join(OFFICIAL_GODOT_DIR, 'index.html'), 'utf8');
  const showcaseBtnMatch = indexHtml.match(/<button\b[^>]*data-filter="showcase"[^>]*>/i);
  assert.ok(showcaseBtnMatch, 'index.html must contain button[data-filter="showcase"]');
  assert.ok(!/data-dev-demo-ui/i.test(showcaseBtnMatch[0]),
    'button[data-filter="showcase"] must NOT be gated by data-dev-demo-ui');
  assert.ok(!/\bhidden\b/i.test(showcaseBtnMatch[0]),
    'button[data-filter="showcase"] must NOT be hidden by default');

  const platformJs = fs.readFileSync(path.join(OFFICIAL_GODOT_DIR, 'platform.js'), 'utf8');
  assert.ok(!/playforge:dev-demo-ui-change[\s\S]{0,200}showcase/.test(platformJs),
    'platform.js must NOT reset activeTemplateFilter away from "showcase" on playforge:dev-demo-ui-change');

  const { port } = await startTempServer(t);
  const tplRes = await rawRequest(port, '/api/platform/templates');
  assert.equal(tplRes.status, 200);
  const tplBody = JSON.parse(tplRes.body.toString('utf8'));
  const showcaseIds = new Set((tplBody.templates || []).filter((x) => x.showcase === true).map((x) => x.id));
  for (const expectedId of ['brawllabs', 'fortress-war', 'iron-wood', 'survivor-io', 'tappy-chicken', 'tappy-chicken-mmo']) {
    assert.ok(showcaseIds.has(expectedId), `Expected showcase template "${expectedId}" to have showcase: true`);
  }

  const createRes = await rawRequest(port, '/api/platform/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'BrawlLabs Showcase QA', template: 'brawllabs', mode: 'showcase' }),
  });
  assert.equal(createRes.status, 201, `Showcase project creation must return 201, got ${createRes.status}: ${createRes.body.toString('utf8')}`);
  const created = JSON.parse(createRes.body.toString('utf8'));
  assert.equal(created.project?.mode, 'showcase');
  assert.ok(typeof created.project?.id === 'string' && created.project.id.length > 0);
});

test('TC-REG-006 (ISS-009): PlayForge Desktop download UI and /api/desktop-downloads contract', async (t) => {
  const indexHtml = fs.readFileSync(path.join(OFFICIAL_GODOT_DIR, 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="desktopDownloadBtn"'), 'index.html must expose #desktopDownloadBtn');
  assert.ok(indexHtml.includes('id="desktopDownloadModal"'), 'index.html must expose #desktopDownloadModal');

  const { port } = await startTempServer(t);
  const res = await rawRequest(port, '/api/desktop-downloads');
  assert.equal(res.status, 200);
  const data = JSON.parse(res.body.toString('utf8'));
  assert.equal(data.ok, true);
  assert.equal(data.engineVersion, '4.7.2');
  assert.ok(Array.isArray(data.items) && data.items.length >= 4);

  const ids = new Set(data.items.map((item) => item.id));
  for (const expected of ['windows-editor', 'windows-launcher', 'macos-editor', 'linux-editor']) {
    assert.ok(ids.has(expected), `/api/desktop-downloads must list target "${expected}"`);
  }
  for (const item of data.items) {
    assert.ok(Array.isArray(item.excludedModules), `${item.id} must declare excludedModules`);
    for (const mod of ['openxr', 'webxr', 'mobile_vr', 'camera']) {
      assert.ok(item.excludedModules.includes(mod), `${item.id}.excludedModules must include ${mod}`);
    }
  }
});
