#!/usr/bin/env node
/**
 * Zero-dependency Godot 4.7.2 PCK V3 packer for Play Hub iOS minimal bootstrap (data.pck).
 * Produces a ~3-4 KiB binary-compatible GDPC v3 (Godot 4.7.2) pack containing ONLY
 * project.godot, bootstrap.tscn, idle_standby.tscn, and bootstrap.gd (0 starter games).
 * Matches godot-engine/core/io/pck_packer.cpp (PACK_FORMAT_VERSION=3, PACK_REL_FILEBASE=2).
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const PACK_HEADER_MAGIC = 0x43504447; // "GDPC" LE
const PACK_FORMAT_VERSION_V3 = 3;
const GODOT_MAJOR = 4;
const GODOT_MINOR = 7;
const GODOT_PATCH = 2;
const PACK_REL_FILEBASE = 1 << 1; // 2
const ALIGNMENT = 32;

const BOOTSTRAP_FILES = [
  'project.godot',
  'bootstrap.tscn',
  'idle_standby.tscn',
  'bootstrap.gd'
];

function padTo(value, align) {
  const rem = value % align;
  return rem === 0 ? 0 : align - rem;
}

export function buildGodot472PckBuffer(fileMap) {
  // Header layout (104 bytes before alignment -> padded to 128 bytes = file_base):
  //   0..3   magic ("GDPC")
  //   4..7   format_version (3)
  //   8..11  major (4)
  //  12..15  minor (7)
  //  16..19  patch (2)
  //  20..23  pack_flags (PACK_REL_FILEBASE = 2)
  //  24..31  file_base (uint64 LE)
  //  32..39  dir_offset (uint64 LE)
  //  40..103 reserved (16 * uint32 = 64 bytes)
  const headerRawSize = 4 * 6 + 8 * 2 + 16 * 4; // 104 bytes
  const headerPad = padTo(headerRawSize, ALIGNMENT); // 24 bytes
  const fileBase = headerRawSize + headerPad; // 128 bytes

  const dataChunks = [];
  const entries = [];
  let cursor = fileBase;

  for (const [rawPath, content] of Object.entries(fileMap)) {
    const relPath = rawPath.replace(/^res:\/\//, '').replace(/^\/+/, '');
    const dataBuf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const md5 = createHash('md5').update(dataBuf).digest();
    const ofs = cursor;
    dataChunks.push(dataBuf);
    cursor += dataBuf.length;

    const p = padTo(cursor, ALIGNMENT);
    if (p > 0) {
      dataChunks.push(Buffer.alloc(p, 0));
      cursor += p;
    }

    entries.push({
      path: relPath,
      relOffset: ofs - fileBase,
      size: dataBuf.length,
      md5
    });
  }

  const dirOffset = cursor;
  const dirParts = [];
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(entries.length, 0);
  dirParts.push(countBuf);

  for (const entry of entries) {
    const pathBuf = Buffer.from(entry.path, 'utf8');
    const pathPad = padTo(pathBuf.length, 4);
    const meta = Buffer.alloc(4);
    meta.writeUInt32LE(pathBuf.length + pathPad, 0);

    const nums = Buffer.alloc(8 + 8 + 16 + 4);
    nums.writeBigUInt64LE(BigInt(entry.relOffset), 0);
    nums.writeBigUInt64LE(BigInt(entry.size), 8);
    entry.md5.copy(nums, 16);
    nums.writeUInt32LE(0, 32); // file flags = 0

    dirParts.push(meta, pathBuf, Buffer.alloc(pathPad, 0), nums);
  }

  const header = Buffer.alloc(fileBase, 0);
  header.writeUInt32LE(PACK_HEADER_MAGIC, 0);
  header.writeUInt32LE(PACK_FORMAT_VERSION_V3, 4);
  header.writeUInt32LE(GODOT_MAJOR, 8);
  header.writeUInt32LE(GODOT_MINOR, 12);
  header.writeUInt32LE(GODOT_PATCH, 16);
  header.writeUInt32LE(PACK_REL_FILEBASE, 20);
  header.writeBigUInt64LE(BigInt(fileBase), 24);
  header.writeBigUInt64LE(BigInt(dirOffset), 32);

  return Buffer.concat([header, ...dataChunks, ...dirParts]);
}

export function packBootstrapDirectory(bootstrapDir, outPath) {
  const fileMap = {};
  for (const name of BOOTSTRAP_FILES) {
    fileMap[name] = readFileSync(resolve(bootstrapDir, name));
  }
  const pck = buildGodot472PckBuffer(fileMap);
  if (outPath) {
    writeFileSync(outPath, pck);
  }
  return pck;
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('pack-bootstrap.mjs')) {
  const repoRoot = resolve(import.meta.dirname, '..', '..');
  const bootstrapDir = resolve(repoRoot, 'ios/App/Resources/Bootstrap');
  const outPath = process.argv[2] ? resolve(process.argv[2]) : resolve(bootstrapDir, 'data.pck');
  const pck = packBootstrapDirectory(bootstrapDir, outPath);
  const sha = createHash('sha256').update(pck).digest('hex');
  console.log(`OK: packed PlayHub iOS bootstrap -> ${outPath} (${statSync(outPath).size} bytes, GDPC v3 4.7.2, sha256=${sha.slice(0, 16)}...)`);
}
