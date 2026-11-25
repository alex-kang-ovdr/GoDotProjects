'use strict';
// Roadmap 16 (Forge-BuildExport): BuildManifest v1 schema, EngineLock derived from engine-ssot.json,
// build_id reuses existing formats, PCK diagnostics and reproducibility lint. Pure Node (no Godot).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bm = require('../../Tools/build-export/build-manifest.cjs');
const { readPckDirectory, diffPck } = require('../../Tools/build-export/pck-reader.cjs');
const { nodesWithoutUniqueId, lintProject } = require('../../Tools/build-export/repro-lint.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..');
const SSOT = JSON.parse(fs.readFileSync(path.join(REPO, 'tools', 'engine', 'engine-ssot.json'), 'utf8'));
const FIXTURE = path.join(__dirname, 'fixtures', 'minimal');
const FIXTURE_STABLE = path.join(__dirname, 'fixtures', 'minimal-stable-ids');
const NOW = new Date('2026-11-25T00:00:00Z');

function fakeOutput(t) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-out-'));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  fs.writeFileSync(path.join(out, 'index.html'), '<html></html>');
  fs.writeFileSync(path.join(out, 'index.pck'), Buffer.from('GDPC'));
  return out;
}

test('manifest has all v1 fields and validates', (t) => {
  const m = bm.buildManifest({ projectDir: FIXTURE, outputDir: fakeOutput(t), mode: 'pack', templatePath: null, now: NOW, buildId: '0123456789abcdef' });
  for (const k of ['schemaVersion', 'project_id', 'revision', 'build_id', 'engine', 'export', 'content_hash', 'artifacts', 'protocol_hash', 'created_at', 'signatures']) {
    assert.ok(Object.hasOwn(m, k), `missing ${k}`);
  }
  for (const k of ['fork_repo', 'fork_commit', 'release_tag', 'upstream_base', 'binary_path_kind', 'binary_sha256']) assert.ok(Object.hasOwn(m.engine, k), `missing engine.${k}`);
  for (const k of ['preset', 'platform', 'template_sha256']) assert.ok(Object.hasOwn(m.export, k), `missing export.${k}`);
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.project_id, 'buildexport-repro-fixture');
  assert.equal(m.build_id, '0123456789abcdef');
  assert.equal(m.build_id_kind, 'ugc');
  assert.deepEqual(m.signatures, []);
  assert.equal(m.protocol_hash, null);
  assert.equal(m.created_at, NOW.toISOString());
  assert.deepEqual(m.artifacts.map((a) => a.path), ['index.html', 'index.pck']);
  assert.deepEqual(bm.validateManifest(m), []);
});

test('EngineLock is derived from engine-ssot.json, not a second copy', () => {
  const lock = bm.deriveEngineLock({});
  assert.equal(lock.fork_repo, SSOT.forkRepo);
  assert.equal(lock.fork_commit, SSOT.pinnedForkCommit);
  assert.equal(lock.release_tag, SSOT.releaseTag);
  assert.equal(lock.upstream_base, SSOT.upstreamBaseVersion);
  assert.equal(lock.ssot_target.status, SSOT.targets['web-template'].status);
  assert.equal(lock.binary_path_kind, null);
  assert.equal(lock.matches_lock, false);
  const src = fs.readFileSync(path.join(REPO, 'forge', 'Tools', 'build-export', 'build-manifest.cjs'), 'utf8');
  assert.equal(src.includes(SSOT.pinnedForkCommit), false, 'fork commit must not be hard-coded');
  assert.equal(src.includes(SSOT.releaseTag), false, 'release tag must not be hard-coded');
});

test('build_id accepts build-version policy ids and 16-hex UGC ids only', () => {
  assert.equal(bm.classifyBuildId('forge-web-v0.1.0-20261121-0132-playhub-platform-g13c70ba-b42'), 'policy');
  assert.equal(bm.classifyBuildId('godot-server-v0.1.0-20261121-0132-playhub-platform-g13c70ba-b0-dirty'), 'policy');
  assert.equal(bm.classifyBuildId('0123456789abcdef'), 'ugc');
  assert.equal(bm.classifyBuildId('bx-anything'), null);
  assert.equal(bm.classifyBuildId('0123456789ABCDEF'), null);
  assert.throws(() => bm.resolveBuildId('not-a-build-id'), /build_id/);
  assert.match(bm.resolveBuildId(null).build_id, /^[a-f0-9]{16}$/);
});

test('input_hash is stable for identical inputs and ignores time and build_id', (t) => {
  const a = bm.buildManifest({ projectDir: FIXTURE, outputDir: fakeOutput(t), mode: 'pack', templatePath: null, now: NOW });
  const b = bm.buildManifest({ projectDir: FIXTURE, outputDir: fakeOutput(t), mode: 'pack', templatePath: null, now: new Date() });
  assert.notEqual(a.build_id, b.build_id);
  assert.equal(a.input_hash, b.input_hash);
  const c = bm.buildManifest({ projectDir: FIXTURE, outputDir: fakeOutput(t), mode: 'release', templatePath: null, now: NOW });
  assert.notEqual(a.input_hash, c.input_hash);
});

test('validateManifest rejects tampered content_hash, unsorted artifacts and bad fields', (t) => {
  const m = bm.buildManifest({ projectDir: FIXTURE, outputDir: fakeOutput(t), mode: 'pack', templatePath: null, now: NOW });
  assert.ok(bm.validateManifest({ ...m, content_hash: 'f'.repeat(64) }).some((e) => /content_hash/.test(e)));
  assert.ok(bm.validateManifest({ ...m, artifacts: [...m.artifacts].reverse() }).some((e) => /sorted/.test(e)));
  assert.ok(bm.validateManifest({ ...m, build_id: 'bx-foo' }).some((e) => /build_id/.test(e)));
  assert.ok(bm.validateManifest({ ...m, artifacts: [{ ...m.artifacts[0], path: '../x' }] }).some((e) => /relative POSIX/.test(e)));
  assert.ok(bm.validateManifest({ ...m, engine: { ...m.engine, binary_path_kind: 'other' } }).some((e) => /binary_path_kind/.test(e)));
  assert.ok(bm.validateManifest({ ...m, schemaVersion: 2 }).some((e) => /schemaVersion/.test(e)));
});

function makePck(entries) {
  // Godot 4.7 pack format (v4) layout: header, file data at file_base, directory at dir_offset.
  const header = Buffer.alloc(4 + 4 * 5 + 8 + 8 + 64);
  const datas = entries.map((e) => Buffer.from(e.data));
  const fileBase = header.length;
  const dataBlob = Buffer.concat(datas);
  const dirOffset = fileBase + dataBlob.length;
  header.write('GDPC', 0, 'ascii');
  header.writeUInt32LE(4, 4); header.writeUInt32LE(4, 8); header.writeUInt32LE(7, 12); header.writeUInt32LE(2, 16);
  header.writeUInt32LE(2, 20); header.writeBigUInt64LE(BigInt(fileBase), 24); header.writeBigUInt64LE(BigInt(dirOffset), 32);
  const count = Buffer.alloc(4); count.writeUInt32LE(entries.length);
  const dir = [count];
  let off = 0;
  entries.forEach((e, i) => {
    const name = Buffer.from(e.path);
    const pad = Buffer.alloc((4 - (name.length % 4)) % 4);
    const len = Buffer.alloc(4); len.writeUInt32LE(name.length + pad.length);
    const tail = Buffer.alloc(8 + 8 + 16 + 4);
    tail.writeBigUInt64LE(BigInt(off), 0); tail.writeBigUInt64LE(BigInt(datas[i].length), 8);
    dir.push(len, name, pad, tail);
    off += datas[i].length;
  });
  return Buffer.concat([header, dataBlob, ...dir]);
}

test('PCK reader lists entries and diffPck pinpoints the differing entry', () => {
  const a = makePck([{ path: 'res://a.scn', data: 'AAAA' }, { path: 'res://b.txt', data: 'same' }]);
  const b = makePck([{ path: 'res://a.scn', data: 'AAAB' }, { path: 'res://b.txt', data: 'same' }]);
  const dirA = readPckDirectory(a);
  assert.equal(dirA.header.engine, '4.7.2');
  assert.deepEqual(dirA.files.map((f) => f.path), ['res://a.scn', 'res://b.txt']);
  const d = diffPck(a, b);
  assert.deepEqual(d.contentDiffers.map((x) => x.path), ['res://a.scn']);
  assert.deepEqual(d.onlyA, []);
  assert.equal(d.sameOrder, true);
  assert.throws(() => readPckDirectory(Buffer.alloc(80)), /GDPC/);
});

test('repro lint flags tscn nodes without unique_id (random node ids at export)', () => {
  assert.deepEqual(nodesWithoutUniqueId('[node name="A" type="Node"]\n[node name="B" type="Node" parent="." unique_id=5]\n'), ['A']);
  assert.deepEqual(lintProject(FIXTURE).map((f) => f.path), ['main.tscn']);
  assert.deepEqual(lintProject(FIXTURE_STABLE), []);
});
