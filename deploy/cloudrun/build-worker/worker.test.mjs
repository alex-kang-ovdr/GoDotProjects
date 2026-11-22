import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buildScrubbedChildEnv, materializeSnapshot, executeIsolatedBuild, rewriteHtmlForSharedRuntime } from './worker.mjs';

test('buildScrubbedChildEnv strips Signed URLs and cloud/PlayHub secrets from child godot process', () => {
  const dirty = {
    PATH: '/usr/bin',
    HOME: '/home/builder',
    BUILD_INPUT_URL: 'https://storage.googleapis.com/secret-signed-get',
    BUILD_OUTPUT_ZIP_URL: 'https://storage.googleapis.com/secret-signed-put',
    BUILD_RESULT_URL: 'https://storage.googleapis.com/secret-result-put',
    PLAYHUB_FORGE_INTERNAL_SECRET: 'super-secret-token',
    GOOGLE_APPLICATION_CREDENTIALS: '/etc/secret.json',
    AWS_SECRET_ACCESS_KEY: 'nope',
  };
  const clean = buildScrubbedChildEnv(dirty, '/tmp/fake-home');
  assert.equal(clean.PATH, '/usr/bin');
  assert.equal(clean.HOME, '/tmp/fake-home');
  assert.equal(clean.BUILD_INPUT_URL, undefined);
  assert.equal(clean.BUILD_OUTPUT_ZIP_URL, undefined);
  assert.equal(clean.BUILD_RESULT_URL, undefined);
  assert.equal(clean.PLAYHUB_FORGE_INTERNAL_SECRET, undefined);
  assert.equal(clean.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(clean.AWS_SECRET_ACCESS_KEY, undefined);
});

test('materializeSnapshot rejects path traversal and absolute paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-snap-'));
  try {
    assert.throws(() => materializeSnapshot({ files: [{ path: '../escape.gd', content: 'x' }] }, dir), /Path traversal/);
    assert.throws(() => materializeSnapshot({ files: [{ path: '/etc/passwd', content: 'x' }] }, dir), /Unsafe snapshot/);
    assert.throws(() => materializeSnapshot({ files: [{ path: 'a\\b.gd', content: 'x' }] }, dir), /Unsafe snapshot/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('executeIsolatedBuild runs scrubbed child, injects playhub shell, validates zip, and computes OwnedBuildPackages hashes', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-mock-godot-'));
  const envLeakCheckFile = path.join(tmp, 'seen-env.json');
  const mockScript = path.join(tmp, 'mock-godot.mjs');

  fs.writeFileSync(mockScript, `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--import')) {
  fs.writeFileSync(${JSON.stringify(envLeakCheckFile)}, JSON.stringify(Object.keys(process.env)));
  process.exit(0);
}
const exportIdx = args.indexOf('--export-release');
if (exportIdx >= 0) {
  const outHtml = args[exportIdx + 2];
  const outDir = path.dirname(outHtml);
  fs.writeFileSync(outHtml, '<!doctype html><html><head><title>Test</title></head><body>ok</body></html>');
  fs.writeFileSync(path.join(outDir, 'index.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  fs.writeFileSync(path.join(outDir, 'index.pck'), Buffer.from('GDPC'));
  process.exit(0);
}
process.exit(1);
`, 'utf8');

  try {
    const files = [
      { path: 'project.godot', content: 'config_version=5\n[application]\nconfig/name="Demo"\n' },
      { path: 'main.gd', content: 'extends Node\n' },
    ];
    const expectedSourceHash = crypto.createHash('sha256').update(
      JSON.stringify([...files].sort((a, b) => a.path.localeCompare(b.path, 'en')))
    ).digest('hex');

    const { result, zipBuffer } = await executeIsolatedBuild(
      { id: '0123456789abcdef01234567', revision: 3, files },
      {
        godotBin: process.execPath,
        godotPrefixArgs: [mockScript],
        baseEnv: { ...process.env, BUILD_INPUT_URL: 'https://signed.invalid/get', PLAYHUB_FORGE_INTERNAL_SECRET: 'secret' },
      }
    );

    assert.equal(result.status, 'succeeded', result.error || result.log);
    assert.equal(result.sourceHash, expectedSourceHash);
    assert.ok(Buffer.isBuffer(zipBuffer) && zipBuffer.length > 0);
    assert.equal(result.artifactSha256, crypto.createHash('sha256').update(zipBuffer).digest('hex'));
    assert.equal(result.sdkBridgeVersion, 'playhub-godot-shell-v1');
    assert.ok(result.files.includes('playhub-godot-shell.js'));
    assert.ok(result.files.includes('PlayForge-Web.zip'));

    const seenKeys = JSON.parse(fs.readFileSync(envLeakCheckFile, 'utf8'));
    assert.ok(!seenKeys.includes('BUILD_INPUT_URL'), 'BUILD_INPUT_URL leaked to child godot process');
    assert.ok(!seenKeys.includes('PLAYHUB_FORGE_INTERNAL_SECRET'), 'PLAYHUB secret leaked to child godot process');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('executeIsolatedBuild rejects symbolic links created in build output directory', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-symlink-godot-'));
  const secretDir = path.join(tmp, 'secret-dir');
  const secretFile = path.join(secretDir, 'secret.txt');
  fs.mkdirSync(secretDir, { recursive: true });
  fs.writeFileSync(secretFile, 'TOP_SECRET_VALUE', 'utf8');
  const mockScript = path.join(tmp, 'mock-godot-symlink.mjs');

  fs.writeFileSync(mockScript, `
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
if (args.includes('--import')) process.exit(0);
const exportIdx = args.indexOf('--export-release');
if (exportIdx >= 0) {
  const outHtml = args[exportIdx + 2];
  const outDir = path.dirname(outHtml);
  fs.writeFileSync(outHtml, '<!doctype html><html><head><title>Test</title></head><body>ok</body></html>');
  fs.writeFileSync(path.join(outDir, 'index.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
  fs.writeFileSync(path.join(outDir, 'index.pck'), Buffer.from('GDPC'));
  try {
    fs.symlinkSync(${JSON.stringify(secretFile)}, path.join(outDir, 'leak.txt'));
  } catch (err) {
    if (process.platform === 'win32' && err && err.code === 'EPERM') {
      fs.symlinkSync(${JSON.stringify(secretDir)}, path.join(outDir, 'leak.txt'), 'junction');
    } else {
      throw err;
    }
  }
  process.exit(0);
}
process.exit(1);
`, 'utf8');

  try {
    const { result, zipBuffer } = await executeIsolatedBuild(
      {
        id: '0123456789abcdef01234567',
        revision: 1,
        files: [{ path: 'project.godot', content: 'config_version=5\n' }],
      },
      { godotBin: process.execPath, godotPrefixArgs: [mockScript] }
    );
    assert.equal(result.status, 'failed');
    assert.equal(zipBuffer, null);
    assert.match(result.error, /Symbolic link rejected/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('executeIsolatedBuild with sharedRuntimeBase produces modular-thin-ugc ZIP without duplicated engine wasm/js', async () => {
  const sampleHtml = '<!doctype html><html><head><title>Thin</title></head><body><script src="index.js"></script><script>\nconst GODOT_CONFIG = {"executable":"index","fileSizes":{"index.pck":1234,"index.wasm":39514754}};\n</script></body></html>';
  const rewritten = rewriteHtmlForSharedRuntime(sampleHtml, '/runtime/godot/4.7.2');
  assert.ok(rewritten.includes('<script src="/runtime/godot/4.7.2/godot.js"></script>'));
  assert.ok(rewritten.includes('"executable":"/runtime/godot/4.7.2/godot"'));
  assert.ok(rewritten.includes('"mainPack":"index.pck"'));
  assert.ok(rewritten.includes('"/runtime/godot/4.7.2/godot.wasm":39514754'));
  assert.ok(!rewritten.includes('"index.wasm"'));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p0-thin-godot-'));
  const mockScript = path.join(tmp, 'mock-godot-thin.mjs');
  fs.writeFileSync(mockScript, `
import fs from 'node:fs';
const args = process.argv.slice(2);
if (args.includes('--import')) process.exit(0);
const packIdx = args.indexOf('--export-pack');
if (packIdx >= 0) {
  const outPck = args[packIdx + 2];
  fs.writeFileSync(outPck, Buffer.from('GDPC-TINY-GAME'));
  process.exit(0);
}
process.exit(1);
`, 'utf8');

  try {
    const { result, zipBuffer } = await executeIsolatedBuild(
      {
        id: '0123456789abcdef01234567',
        name: 'Thin Cloud Game',
        revision: 2,
        files: [{ path: 'project.godot', content: 'config_version=5\n' }],
      },
      {
        godotBin: process.execPath,
        godotPrefixArgs: [mockScript],
        sharedRuntimeBase: '/runtime/godot/4.7.2',
      }
    );
    assert.equal(result.status, 'succeeded');
    assert.equal(result.packaging, 'modular-thin-ugc');
    assert.equal(result.sharedRuntimeBase, '/runtime/godot/4.7.2');
    assert.equal(result.mainPackBytes, 14);
    assert.ok(result.files.includes('index.html'));
    assert.ok(result.files.includes('index.pck'));
    assert.ok(result.files.includes('playhub-godot-shell.js'));
    assert.ok(result.files.includes('ugc.manifest.json'));
    assert.ok(!result.files.includes('index.wasm'));
    assert.ok(!result.files.includes('index.js'));
    assert.ok(!result.files.includes('index.audio.worklet.js'));
    assert.ok(zipBuffer.length < 32 * 1024, `Expected thin ZIP < 32KB (without 1MB wasm), got ${zipBuffer.length}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
