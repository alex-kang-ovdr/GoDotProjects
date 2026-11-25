'use strict';
// Minimal read-only Godot 4 PCK directory reader for reproducibility diagnostics (not a loader).
// Supports pack format v2 (Godot 4.0-4.3) and v3 (4.4+, directory at dir_offset). Encrypted packs are reported, not read.

const crypto = require('node:crypto');

const PACK_DIR_ENCRYPTED = 1 << 0;
const PACK_REL_FILEBASE = 1 << 1;

function readPckDirectory(buf) {
  if (buf.length < 64 || buf.toString('ascii', 0, 4) !== 'GDPC') throw new Error('Not a standalone PCK (missing GDPC magic)');
  let o = 4;
  const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  const u64 = () => { const v = buf.readBigUInt64LE(o); o += 8; return Number(v); };
  const version = u32();
  const engine = `${u32()}.${u32()}.${u32()}`;
  let flags = 0;
  let fileBase = 0;
  let dirOffset = null;
  if (version >= 2) { flags = u32(); fileBase = u64(); }
  if (version >= 3) dirOffset = u64();
  o += 16 * 4; // reserved
  if (dirOffset !== null) o = dirOffset;
  if (flags & PACK_REL_FILEBASE) fileBase += 0; // standalone pack starts at 0
  const header = { version, engine, flags, fileBase, dirOffset };
  if (flags & PACK_DIR_ENCRYPTED) return { header, encrypted: true, files: [] };
  const count = u32();
  const files = [];
  for (let i = 0; i < count; i += 1) {
    const len = u32();
    const name = buf.toString('utf8', o, o + len).replace(/\0+$/, '');
    o += len;
    const offset = u64();
    const size = u64();
    const md5 = buf.toString('hex', o, o + 16); o += 16;
    const fileFlags = version >= 2 ? u32() : 0;
    const start = fileBase + offset;
    const data = start + size <= buf.length ? buf.subarray(start, start + size) : null;
    files.push({ path: name, offset, size, md5, flags: fileFlags, sha256: data ? crypto.createHash('sha256').update(data).digest('hex') : null });
  }
  return { header, encrypted: false, files };
}

/** Compare two PCK buffers: header diffs, entries only in one, entries whose content or position differs. */
function diffPck(bufA, bufB) {
  const a = readPckDirectory(bufA);
  const b = readPckDirectory(bufB);
  const mapA = new Map(a.files.map((f) => [f.path, f]));
  const mapB = new Map(b.files.map((f) => [f.path, f]));
  const onlyA = [...mapA.keys()].filter((k) => !mapB.has(k)).sort();
  const onlyB = [...mapB.keys()].filter((k) => !mapA.has(k)).sort();
  const contentDiffers = [];
  const layoutDiffers = [];
  for (const [k, fa] of mapA) {
    const fb = mapB.get(k);
    if (!fb) continue;
    if (fa.sha256 !== fb.sha256) contentDiffers.push({ path: k, sizeA: fa.size, sizeB: fb.size });
    else if (fa.offset !== fb.offset) layoutDiffers.push({ path: k, offsetA: fa.offset, offsetB: fb.offset });
  }
  const orderA = a.files.map((f) => f.path).join('\n');
  const orderB = b.files.map((f) => f.path).join('\n');
  return {
    headerA: a.header,
    headerB: b.header,
    fileCountA: a.files.length,
    fileCountB: b.files.length,
    sameOrder: orderA === orderB,
    onlyA,
    onlyB,
    contentDiffers: contentDiffers.sort((x, y) => (x.path < y.path ? -1 : 1)),
    layoutDiffers,
  };
}

module.exports = { readPckDirectory, diffPck };
