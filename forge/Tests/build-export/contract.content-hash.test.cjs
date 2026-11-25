'use strict';
// Roadmap 16 (Forge-BuildExport): content_hash must not depend on file creation order / readdir order.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const bm = require('../../Tools/build-export/build-manifest.cjs');

const FILES = {
  'index.html': '<html></html>',
  'index.pck': Buffer.from([0x47, 0x44, 0x50, 0x43, 1, 2, 3]),
  'sub/b.txt': 'b',
  'sub/a.txt': 'a',
  'Z-upper.txt': 'Z',
  'a-lower.txt': 'a',
  '한글.txt': 'k',
};

function writeTree(dir, order) {
  for (const rel of order) {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, FILES[rel]);
  }
}

function shuffled(list, seed) {
  const out = [...list];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

test('content_hash is identical regardless of file write order', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-hash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const names = Object.keys(FILES);
  const orders = [names, [...names].reverse(), shuffled(names, 7), shuffled(names, 42)];
  const hashes = orders.map((order, i) => {
    const d = path.join(root, String(i));
    writeTree(d, order);
    return bm.computeContentHash(bm.collectArtifacts(d));
  });
  assert.equal(new Set(hashes).size, 1);
});

test('artifacts are sorted by UTF-8 byte order and exclude build-manifest.json', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bx-sort-'));
  t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  writeTree(d, Object.keys(FILES));
  fs.writeFileSync(path.join(d, bm.MANIFEST_FILENAME), '{}');
  const paths = bm.collectArtifacts(d).map((a) => a.path);
  assert.deepEqual(paths, ['Z-upper.txt', 'a-lower.txt', 'index.html', 'index.pck', 'sub/a.txt', 'sub/b.txt', '한글.txt']);
});

test('content_hash equals sha256 of sha256sum-style lines and ignores input array order', () => {
  const arts = [
    { path: 'b', sha256: 'b'.repeat(64) },
    { path: 'a', sha256: 'a'.repeat(64) },
  ];
  const expected = crypto.createHash('sha256').update(`${'a'.repeat(64)}  a\n${'b'.repeat(64)}  b\n`).digest('hex');
  assert.equal(bm.computeContentHash(arts), expected);
  assert.equal(bm.computeContentHash([...arts].reverse()), expected);
});

test('content_hash changes when any byte or path changes, and rejects duplicate paths', () => {
  const base = [{ path: 'a', sha256: 'a'.repeat(64) }];
  assert.notEqual(bm.computeContentHash(base), bm.computeContentHash([{ path: 'a', sha256: 'c'.repeat(64) }]));
  assert.notEqual(bm.computeContentHash(base), bm.computeContentHash([{ path: 'A', sha256: 'a'.repeat(64) }]));
  assert.throws(() => bm.computeContentHash([...base, ...base]), /Duplicate/);
});
