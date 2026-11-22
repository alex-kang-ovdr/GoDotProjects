'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {
  createServer,
  inspectWasmReleaseBinary,
  resolveWebEditorVendor,
  normalizeWebEditorWasmProfile,
} = require('../server.cjs');

const FORGE_ROOT = path.resolve(__dirname, '..');

function buildMinimalWasm(customSectionName = null) {
  const chunks = [Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])];
  if (customSectionName) {
    const nameBytes = Buffer.from(customSectionName, 'utf8');
    const payload = Buffer.concat([Buffer.from([nameBytes.length]), nameBytes, Buffer.from([0x00])]);
    chunks.push(Buffer.from([0x00, payload.length]), payload);
  }
  return Buffer.concat(chunks);
}

test('Web Editor WASM profile defaults to release regardless of UI/Node build mode', () => {
  assert.equal(normalizeWebEditorWasmProfile(undefined), 'release');
  assert.equal(normalizeWebEditorWasmProfile(''), 'release');
  assert.equal(normalizeWebEditorWasmProfile('dev'), 'release');
  assert.equal(normalizeWebEditorWasmProfile('release'), 'release');
  assert.equal(normalizeWebEditorWasmProfile('debug'), 'debug');
  assert.equal(normalizeWebEditorWasmProfile('DEBUG'), 'debug');
});

test('Official Godot 4.7.2 vendor WASM passes release binary inspection (zero debug/DWARF sections)', () => {
  const vendorWasm = path.join(FORGE_ROOT, 'OfficialGodot', 'vendor', 'godot.editor.wasm');
  assert.ok(fs.existsSync(vendorWasm), 'OfficialGodot/vendor/godot.editor.wasm must exist');
  const info = inspectWasmReleaseBinary(vendorWasm);
  assert.equal(info.exists, true);
  assert.equal(info.validWasm, true);
  assert.ok(info.rawBytes > 10 * 1024 * 1024);
  assert.deepEqual(info.debugSections, []);
  assert.equal(info.debugSymbolsStripped, true);
});

test('resolveWebEditorVendor prefers stripped release WASM by default and skips debug-section WASM', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-wasm-profile-'));
  try {
    const releaseDir = path.join(tmp, 'OfficialGodot', 'vendor-release');
    const defaultDir = path.join(tmp, 'OfficialGodot', 'vendor');
    const debugDir = path.join(tmp, 'OfficialGodot', 'vendor-debug');
    for (const dir of [releaseDir, defaultDir, debugDir]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'godot.editor.js'), '// stub');
    }
    fs.writeFileSync(path.join(releaseDir, 'godot.editor.wasm'), buildMinimalWasm(null));
    fs.writeFileSync(path.join(defaultDir, 'godot.editor.wasm'), buildMinimalWasm(null));
    fs.writeFileSync(path.join(debugDir, 'godot.editor.wasm'), buildMinimalWasm('.debug_info'));

    // Default (release) picks vendor-release
    const resDefault = resolveWebEditorVendor({}, { NODE_ENV: 'development', PLAYFORGE_BUILD_MODE: 'debug' }, tmp);
    assert.equal(resDefault.profile, 'release');
    assert.equal(fs.realpathSync(resDefault.dir), fs.realpathSync(releaseDir));
    assert.equal(resDefault.wasmInfo.debugSymbolsStripped, true);

    // If vendor-release accidentally contains a DWARF debug WASM, skip it and pick clean vendor/
    fs.writeFileSync(path.join(releaseDir, 'godot.editor.wasm'), buildMinimalWasm('.debug_info'));
    const resFallbackClean = resolveWebEditorVendor({}, {}, tmp);
    assert.equal(resFallbackClean.profile, 'release');
    assert.equal(fs.realpathSync(resFallbackClean.dir), fs.realpathSync(defaultDir));
    assert.equal(resFallbackClean.wasmInfo.debugSymbolsStripped, true);

    // Explicit opt-in debug profile picks vendor-debug
    const resDebug = resolveWebEditorVendor({}, { PLAYFORGE_WEB_EDITOR_WASM_PROFILE: 'debug' }, tmp);
    assert.equal(resDebug.profile, 'debug');
    assert.equal(fs.realpathSync(resDebug.dir), fs.realpathSync(debugDir));
    assert.equal(resDebug.wasmInfo.debugSymbolsStripped, false);
    assert.deepEqual(resDebug.wasmInfo.debugSections, ['.debug_info']);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('PlayForge server defaults to release WASM on /api/health, /api/session, and WASM response header', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-wasm-http-'));
  const server = createServer({
    hubAuth: false,
    buildMode: 'debug',
    workspace: path.join(tmp, 'Workspace'),
    platformWorkspace: path.join(tmp, 'Platform'),
    buildDirectory: path.join(tmp, 'Builds'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${base}/api/health`).then((r) => r.json());
    assert.equal(health.ok, true);
    assert.equal(health.webEditorWasmProfile, 'release');
    assert.equal(health.webEditorWasmRelease, true);
    assert.ok(health.webEditorWasmBytes > 10 * 1024 * 1024);

    const session = await fetch(`${base}/api/session`).then((r) => r.json());
    assert.equal(session.ok, true);
    assert.equal(session.buildMode, 'debug');
    assert.equal(session.webEditorWasmProfile, 'release');
    assert.equal(session.webEditorWasmRelease, true);

    const wasmHead = await new Promise((resolve, reject) => {
      const req = http.request(`${base}/OfficialGodot/vendor/godot.editor.wasm`, { method: 'HEAD' }, (res) => {
        res.resume();
        resolve({ status: res.statusCode, headers: res.headers });
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(wasmHead.status, 200);
    assert.equal(wasmHead.headers['x-playforge-web-editor-wasm'], 'release');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
