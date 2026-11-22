'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { isSealedAvatarPath, loadSealedAvatarBundle } = require('./avatar-seal.cjs');

const PCK_MAGIC = 0x43504447; // "GDPC"
const PCK_FORMAT_V2 = 2;
const PCK_REL_FILEBASE = 1 << 1;

function alignUp(value, alignment) {
  const rem = value % alignment;
  return rem === 0 ? value : value + (alignment - rem);
}

function normalizePckEntryPath(rawPath) {
  let clean = String(rawPath).replaceAll('\\', '/').trim();
  if (clean.includes('\0')) {
    throw new Error(`Invalid PCK entry path (null byte): ${rawPath}`);
  }
  while (/^res:\/\//i.test(clean)) {
    clean = clean.replace(/^res:\/\//i, '');
  }
  while (clean.startsWith('/') || clean.startsWith('./')) {
    if (clean.startsWith('/')) clean = clean.slice(1);
    else if (clean.startsWith('./')) clean = clean.slice(2);
  }
  clean = path.posix.normalize(clean);
  while (clean.startsWith('/') || clean.startsWith('./')) {
    if (clean.startsWith('/')) clean = clean.slice(1);
    else if (clean.startsWith('./')) clean = clean.slice(2);
  }
  if (!clean || clean === '.' || clean.split('/').includes('..')) {
    throw new Error(`Invalid PCK entry path (traversal): ${rawPath}`);
  }
  return clean;
}

/**
 * Pure Node.js Godot 4.7.2 PCK v2 writer.
 * Compatible with PackedSourcePCK::try_open_pack (PCK v2, GODOT 4.7.2, rel_filebase).
 * @param {Array<[string, Buffer|string]>} entries  List of [relativePath, content]
 * @param {{ rejectSealedAvatar?: boolean }} [options]
 * @returns {Buffer}
 */
function writeGodotPck(entries, options = {}) {
  const rejectSealedAvatar = Boolean(options && options.rejectSealedAvatar);
  const normalized = entries
    .map(([rawPath, rawContent]) => {
      const clean = normalizePckEntryPath(rawPath);
      if (rejectSealedAvatar && isSealedAvatarPath(clean)) {
        throw new Error(`Sealed avatar path is forbidden in PCK: ${clean}`);
      }
      const data = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(String(rawContent), 'utf8');
      const pathBytes = Buffer.from(clean, 'utf8');
      const paddedLen = alignUp(pathBytes.length, 4);
      const paddedPath = Buffer.alloc(paddedLen, 0);
      pathBytes.copy(paddedPath);
      const md5 = crypto.createHash('md5').update(data).digest();
      return { clean, paddedPath, data, md5 };
    })
    .sort((a, b) => a.clean.localeCompare(b.clean));

  // Header: 4(magic) + 4(ver) + 12(4.7.2) + 4(flags) + 8(file_base) + 64(reserved) = 96 bytes
  const headerSize = 96;
  let dirSize = 4; // uint32 file_count
  for (const e of normalized) {
    dirSize += 4 + e.paddedPath.length + 8 + 8 + 16 + 4;
  }
  const fileBase = alignUp(headerSize + dirSize, 16);

  let relOffset = 0;
  const offsets = [];
  for (const e of normalized) {
    relOffset = alignUp(relOffset, 16);
    offsets.push(relOffset);
    relOffset += e.data.length;
  }
  const totalSize = fileBase + relOffset;
  const out = Buffer.alloc(totalSize, 0);

  let pos = 0;
  out.writeUInt32LE(PCK_MAGIC, pos); pos += 4;
  out.writeUInt32LE(PCK_FORMAT_V2, pos); pos += 4;
  out.writeUInt32LE(4, pos); pos += 4;
  out.writeUInt32LE(7, pos); pos += 4;
  out.writeUInt32LE(2, pos); pos += 4;
  out.writeUInt32LE(PCK_REL_FILEBASE, pos); pos += 4;
  out.writeBigUInt64LE(BigInt(fileBase), pos); pos += 8;
  pos += 64; // 16 reserved uint32s

  out.writeUInt32LE(normalized.length, pos); pos += 4;
  for (let i = 0; i < normalized.length; i++) {
    const e = normalized[i];
    out.writeUInt32LE(e.paddedPath.length, pos); pos += 4;
    e.paddedPath.copy(out, pos); pos += e.paddedPath.length;
    out.writeBigUInt64LE(BigInt(offsets[i]), pos); pos += 8;
    out.writeBigUInt64LE(BigInt(e.data.length), pos); pos += 8;
    e.md5.copy(out, pos); pos += 16;
    out.writeUInt32LE(0, pos); pos += 4; // flags
  }

  for (let i = 0; i < normalized.length; i++) {
    normalized[i].data.copy(out, fileBase + offsets[i]);
  }
  return out;
}

/**
 * Layer 2: Build shared Platform Core + Avatar Runtime PCK (scripts + catalog + seal manifest ONLY).
 * Deliberately excludes binary .glb skins/accessories so playforge_core.pck stays ~50 KB and
 * individual GLB items stream & cache on-demand by SHA-256 (Layer 3).
 */
function buildCorePack(forgeRoot) {
  const bundle = loadSealedAvatarBundle(forgeRoot);
  const entries = Object.entries(bundle.files).map(([rel, content]) => [
    `addons/playforge_avatar/${rel}`,
    Buffer.from(content, 'utf8'),
  ]);
  const buffer = writeGodotPck(entries);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    buffer,
    sha256,
    bytes: buffer.length,
    fileCount: entries.length,
    catalogVersion: bundle.manifest.catalogVersion,
  };
}

/**
 * Layer 4: Build Thin UGC PCK containing ONLY creator files.
 * Strips addons/playforge_avatar/** and any duplicated avatar GLB binaries.
 */
function buildThinUgcPack(files, extraManifest = {}) {
  const entries = [];
  let strippedCount = 0;
  for (const item of files) {
    const filePath = Array.isArray(item) ? item[0] : item.path;
    const content = Array.isArray(item) ? item[1] : item.content;
    if (typeof filePath !== 'string' || isSealedAvatarPath(filePath)) {
      strippedCount++;
      continue;
    }
    let cleanPath;
    try {
      cleanPath = normalizePckEntryPath(filePath);
    } catch {
      strippedCount++;
      continue;
    }
    if (isSealedAvatarPath(cleanPath)) {
      strippedCount++;
      continue;
    }
    entries.push([cleanPath, content]);
  }
  const hasManifest = entries.some(([p]) => p === 'ugc.manifest.json');
  if (!hasManifest) {
    const manifest = {
      schemaVersion: 2,
      packaging: 'modular-thin-ugc',
      mainScene: extraManifest.mainScene || 'res://scenes/main.tscn',
      worldId: extraManifest.worldId || 'ugc-world',
      worldName: extraManifest.worldName || 'UGC World',
      strippedSealedPaths: strippedCount,
    };
    entries.push(['ugc.manifest.json', JSON.stringify(manifest, null, 2) + '\n']);
  }
  const buffer = writeGodotPck(entries, { rejectSealedAvatar: true });
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    buffer,
    sha256,
    bytes: buffer.length,
    fileCount: entries.length,
    strippedCount,
  };
}

module.exports = {
  PCK_MAGIC,
  PCK_FORMAT_V2,
  writeGodotPck,
  buildCorePack,
  buildThinUgcPack,
};

if (require.main === module) {
  const forgeRoot = path.resolve(__dirname, '..');
  const outPath = process.argv[2] || path.join(forgeRoot, 'Saved', 'Runtime', 'playforge_core.pck');
  const result = buildCorePack(forgeRoot);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, result.buffer);
  console.log(JSON.stringify({ outPath, bytes: result.bytes, sha256: result.sha256, fileCount: result.fileCount, catalogVersion: result.catalogVersion }));
}
