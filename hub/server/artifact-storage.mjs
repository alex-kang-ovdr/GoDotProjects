// ArtifactStoragePort: stores and serves immutable verified UGC release bundles.
// Phase A implements local-fs (zero-config local / portable mode); Phase B extends to GCS / R2.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const MAX_ZIP_BYTES = 64 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 128 * 1024 * 1024;
const MAX_ENTRIES = 2048;
const HOST_SLUG_RE = /^p[a-z2-7]{16}$/;
const RELEASE_ID_RE = /^[a-f0-9]{24}$/;
const ALLOWED_EXT_RE = /\.(html|js|mjs|css|json|wasm|pck|bin|png|jpg|jpeg|webp|gif|svg|ico|ogg|wav|mp3|mp4|webm|ttf|woff|woff2|glb|gltf|txt)$/i;
const WINDOWS_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8'
});

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32Update(c, buf) {
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

function crc32(buf) {
  return (crc32Update(0xffffffff, buf) ^ 0xffffffff) >>> 0;
}

function readExact(fd, length, position) {
  const buf = Buffer.allocUnsafe(length);
  let got = 0;
  while (got < length) {
    const n = fs.readSync(fd, buf, got, length - got, position + got);
    if (n <= 0) throw unsafeZip();
    got += n;
  }
  return buf;
}

/**
 * Streaming file-backed strict ZIP validator and extractor.
 * Never buffers the full archive or all extracted files in RAM simultaneously.
 */
export function validateAndExtractDeploymentZipFile(zipFilePath, destDir, { expectedSha256 = null, unlimitedSize = false } = {}) {
  const maxZipBytes = unlimitedSize ? Infinity : MAX_ZIP_BYTES;
  const maxExpandedBytes = unlimitedSize ? Infinity : MAX_EXPANDED_BYTES;
  const maxEntries = unlimitedSize ? Infinity : MAX_ENTRIES;
  if (typeof zipFilePath !== 'string' || !zipFilePath) throw unsafeZip();
  const stat = fs.lstatSync(zipFilePath);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size < 22 || stat.size > maxZipBytes) throw unsafeZip();
  const fileSize = stat.size;
  const fd = fs.openSync(zipFilePath, 'r');
  try {
    // 1. Stream whole-file SHA-256 in 256 KB chunks
    const hasher = crypto.createHash('sha256');
    const chunkBuf = Buffer.allocUnsafe(256 * 1024);
    let readOff = 0;
    while (readOff < fileSize) {
      const n = fs.readSync(fd, chunkBuf, 0, Math.min(chunkBuf.length, fileSize - readOff), readOff);
      if (n <= 0) throw unsafeZip();
      hasher.update(n === chunkBuf.length ? chunkBuf : chunkBuf.subarray(0, n));
      readOff += n;
    }
    const sha256 = hasher.digest('hex');
    if (expectedSha256 && expectedSha256.toLowerCase() !== sha256) {
      throw Object.assign(new Error('ARTIFACT_SHA256_MISMATCH'), { code: 'ARTIFACT_SHA256_MISMATCH', status: 409 });
    }

    // 2. Validate strict EOCD + Central Directory
    const end = fileSize - 22;
    const eocd = readExact(fd, 22, end);
    if (eocd.readUInt32LE(0) !== 0x06054b50
        || eocd.readUInt16LE(4) !== 0
        || eocd.readUInt16LE(6) !== 0
        || eocd.readUInt16LE(20) !== 0) {
      throw unsafeZip();
    }
    const count = eocd.readUInt16LE(10);
    const offset = eocd.readUInt32LE(16);
    const size = eocd.readUInt32LE(12);
    if (!count || count > maxEntries || count !== eocd.readUInt16LE(8) || offset + size !== end || (!unlimitedSize && size > 4 * 1024 * 1024)) {
      throw unsafeZip();
    }

    const cdBuf = readExact(fd, size, offset);
    let pos = 0;
    let expandedBytes = 0;
    const seenNormalized = new Set();
    const ranges = [];
    const entries = [];
    const parsedEntries = [];
    let hasIndexHtml = false;

    for (let i = 0; i < count; i++) {
      if (pos + 46 > size || cdBuf.readUInt32LE(pos) !== 0x02014b50) throw unsafeZip();
      const flags = cdBuf.readUInt16LE(pos + 8);
      const method = cdBuf.readUInt16LE(pos + 10);
      const crc = cdBuf.readUInt32LE(pos + 16);
      const compressed = cdBuf.readUInt32LE(pos + 20);
      const length = cdBuf.readUInt32LE(pos + 24);
      const nl = cdBuf.readUInt16LE(pos + 28);
      const extra = cdBuf.readUInt16LE(pos + 30);
      const comment = cdBuf.readUInt16LE(pos + 32);
      const local = cdBuf.readUInt32LE(pos + 42);
      const mode = (cdBuf.readUInt32LE(pos + 38) >>> 16) & 0xf000;

      if ((flags & ~0x800) !== 0
          || ![0, 8].includes(method)
          || extra !== 0
          || comment !== 0
          || cdBuf.readUInt16LE(pos + 34) !== 0
          || ![0, 0x8000, 0x4000].includes(mode)
          || pos + 46 + nl > size) {
        throw unsafeZip();
      }

      const rawName = cdBuf.subarray(pos + 46, pos + 46 + nl);
      let name;
      try {
        name = new TextDecoder('utf-8', { fatal: true }).decode(rawName);
      } catch {
        throw unsafeZip();
      }
      const isDir = name.endsWith('/');
      const parts = (isDir ? name.slice(0, -1) : name).split('/');
      if (!nl || name.length > 240 || /[\\:\x00-\x1f\x7f%?#]/.test(name)
          || parts.some(p => !p || p.startsWith('.') || /[. ]$/.test(p) || WINDOWS_RESERVED_RE.test(p))) {
        throw unsafeZip();
      }
      const normalized = name.normalize('NFC').toLowerCase().replace(/\/$/, '');
      if (seenNormalized.has(normalized)) throw unsafeZip();
      seenNormalized.add(normalized);

      if ((!isDir && !ALLOWED_EXT_RE.test(name)) || (mode === 0x4000 && !isDir)) throw unsafeZip();
      expandedBytes += length;
      if (expandedBytes > maxExpandedBytes || length > maxZipBytes || length > Math.max(compressed * 200, 1024 * 1024)) {
        throw unsafeZip();
      }

      if (local + 30 + nl > offset) throw unsafeZip();
      const lh = readExact(fd, 30 + nl, local);
      if (lh.readUInt32LE(0) !== 0x04034b50
          || lh.readUInt16LE(6) !== flags
          || lh.readUInt16LE(8) !== method
          || lh.readUInt32LE(14) !== crc
          || lh.readUInt32LE(18) !== compressed
          || lh.readUInt32LE(22) !== length
          || lh.readUInt16LE(26) !== nl
          || lh.readUInt16LE(28) !== 0
          || !lh.subarray(30, 30 + nl).equals(rawName)) {
        throw unsafeZip();
      }

      const start = local + 30 + nl;
      const stop = start + compressed;
      if (stop > offset) throw unsafeZip();
      if (isDir && length !== 0) throw unsafeZip();

      ranges.push([local, stop]);
      entries.push(name);
      if (name === 'index.html' && !isDir) hasIndexHtml = true;
      parsedEntries.push({ name, isDir, method, crc, compressed, length, start });
      pos += 46 + nl;
    }

    ranges.sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    for (const [start, stop] of ranges) {
      if (start !== cursor) throw unsafeZip();
      cursor = stop;
    }
    if (cursor !== offset || pos !== size || !hasIndexHtml) throw unsafeZip();

    const fileNames = new Set(entries.filter(n => !n.endsWith('/')).map(n => n.normalize('NFC').toLowerCase()));
    for (const n of entries) {
      const parts = n.toLowerCase().split('/');
      for (let i = 1; i < parts.length; i++) {
        if (fileNames.has(parts.slice(0, i).join('/'))) throw unsafeZip();
      }
    }

    // 3. Stream-extract each entry directly to disk while verifying CRC-32
    if (destDir) {
      for (const entry of parsedEntries) {
        if (entry.isDir) continue;
        const dest = path.join(destDir, entry.name);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        if (entry.method === 0) {
          if (entry.compressed !== entry.length) throw unsafeZip();
          const outFd = fs.openSync(dest, 'w');
          let runningCrc = 0xffffffff;
          let rem = entry.length;
          let srcOff = entry.start;
          try {
            while (rem > 0) {
              const n = fs.readSync(fd, chunkBuf, 0, Math.min(chunkBuf.length, rem), srcOff);
              if (n <= 0) throw unsafeZip();
              const slice = n === chunkBuf.length ? chunkBuf : chunkBuf.subarray(0, n);
              runningCrc = crc32Update(runningCrc, slice);
              fs.writeSync(outFd, slice, 0, n);
              rem -= n;
              srcOff += n;
            }
          } finally {
            fs.closeSync(outFd);
          }
          if (((runningCrc ^ 0xffffffff) >>> 0) !== entry.crc) throw unsafeZip();
        } else {
          const packed = readExact(fd, entry.compressed, entry.start);
          let content;
          try {
            content = zlib.inflateRawSync(packed, { maxOutputLength: Math.max(entry.length, 1) });
          } catch {
            throw unsafeZip();
          }
          if (content.length !== entry.length || crc32(content) !== entry.crc) throw unsafeZip();
          fs.writeFileSync(dest, content);
        }
      }
    }

    return {
      sha256,
      bytes: fileSize,
      expandedBytes,
      entryCount: entries.length,
      entryPoint: 'index.html'
    };
  } finally {
    fs.closeSync(fd);
  }
}

const unsafeZip = (reason = 'UNSAFE_DEPLOYMENT_ZIP') => Object.assign(new Error(reason), { code: 'UNSAFE_DEPLOYMENT_ZIP', status: 400 });

export function validateAndExtractDeploymentZip(buffer, { unlimitedSize = false } = {}) {
  const maxZipBytes = unlimitedSize ? Infinity : MAX_ZIP_BYTES;
  const maxExpandedBytes = unlimitedSize ? Infinity : MAX_EXPANDED_BYTES;
  const maxEntries = unlimitedSize ? Infinity : MAX_ENTRIES;
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer.length > maxZipBytes) throw unsafeZip();
  const end = buffer.length - 22;
  // Strict ZIP profile: no comments, ZIP64, encryption, data descriptors or extra fields.
  if (buffer.readUInt32LE(end) !== 0x06054b50
      || buffer.readUInt16LE(end + 4) !== 0
      || buffer.readUInt16LE(end + 6) !== 0
      || buffer.readUInt16LE(end + 20) !== 0) {
    throw unsafeZip();
  }
  const count = buffer.readUInt16LE(end + 10);
  const offset = buffer.readUInt32LE(end + 16);
  const size = buffer.readUInt32LE(end + 12);
  if (!count || count > maxEntries || count !== buffer.readUInt16LE(end + 8) || offset + size !== end) {
    throw unsafeZip();
  }

  let pos = offset;
  let expandedBytes = 0;
  const seenNormalized = new Set();
  const ranges = [];
  const entries = [];
  const files = new Map();

  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || buffer.readUInt32LE(pos) !== 0x02014b50) throw unsafeZip();
    const flags = buffer.readUInt16LE(pos + 8);
    const method = buffer.readUInt16LE(pos + 10);
    const crc = buffer.readUInt32LE(pos + 16);
    const compressed = buffer.readUInt32LE(pos + 20);
    const length = buffer.readUInt32LE(pos + 24);
    const nl = buffer.readUInt16LE(pos + 28);
    const extra = buffer.readUInt16LE(pos + 30);
    const comment = buffer.readUInt16LE(pos + 32);
    const local = buffer.readUInt32LE(pos + 42);
    const mode = (buffer.readUInt32LE(pos + 38) >>> 16) & 0xf000;

    if ((flags & ~0x800) !== 0
        || ![0, 8].includes(method)
        || extra !== 0
        || comment !== 0
        || buffer.readUInt16LE(pos + 34) !== 0
        || ![0, 0x8000, 0x4000].includes(mode)
        || pos + 46 + nl > end) {
      throw unsafeZip();
    }

    const rawName = buffer.subarray(pos + 46, pos + 46 + nl);
    let name;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(rawName);
    } catch {
      throw unsafeZip();
    }
    const isDir = name.endsWith('/');
    const parts = (isDir ? name.slice(0, -1) : name).split('/');
    if (!nl || name.length > 240 || /[\\:\x00-\x1f\x7f%?#]/.test(name)
        || parts.some(p => !p || p.startsWith('.') || /[. ]$/.test(p) || WINDOWS_RESERVED_RE.test(p))) {
      throw unsafeZip();
    }
    const normalized = name.normalize('NFC').toLowerCase().replace(/\/$/, '');
    if (seenNormalized.has(normalized)) throw unsafeZip();
    seenNormalized.add(normalized);

    if ((!isDir && !ALLOWED_EXT_RE.test(name)) || (mode === 0x4000 && !isDir)) throw unsafeZip();
    expandedBytes += length;
    if (expandedBytes > maxExpandedBytes || length > maxZipBytes || length > Math.max(compressed * 200, 1024 * 1024)) {
      throw unsafeZip();
    }
    if (local + 30 > offset
        || buffer.readUInt32LE(local) !== 0x04034b50
        || buffer.readUInt16LE(local + 6) !== flags
        || buffer.readUInt16LE(local + 8) !== method
        || buffer.readUInt32LE(local + 14) !== crc
        || buffer.readUInt32LE(local + 18) !== compressed
        || buffer.readUInt32LE(local + 22) !== length
        || buffer.readUInt16LE(local + 26) !== nl
        || buffer.readUInt16LE(local + 28) !== 0) {
      throw unsafeZip();
    }

    const start = local + 30 + nl;
    const stop = start + compressed;
    if (stop > offset || !buffer.subarray(local + 30, start).equals(rawName)) throw unsafeZip();

    const packed = buffer.subarray(start, stop);
    let content;
    try {
      content = method === 0
        ? Buffer.from(packed)
        : zlib.inflateRawSync(packed, { maxOutputLength: Math.max(length, 1) });
    } catch {
      throw unsafeZip();
    }
    if (content.length !== length || crc32(content) !== crc || (isDir && length !== 0)) throw unsafeZip();

    ranges.push([local, stop]);
    entries.push(name);
    if (!isDir) files.set(name, content);
    pos += 46 + nl;
  }

  ranges.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, stop] of ranges) {
    if (start !== cursor) throw unsafeZip();
    cursor = stop;
  }
  if (cursor !== offset || pos !== end || !files.has('index.html')) throw unsafeZip();

  const fileNames = new Set(entries.filter(n => !n.endsWith('/')).map(n => n.normalize('NFC').toLowerCase()));
  for (const n of entries) {
    const parts = n.toLowerCase().split('/');
    for (let i = 1; i < parts.length; i++) {
      if (fileNames.has(parts.slice(0, i).join('/'))) throw unsafeZip();
    }
  }

  return {
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    expandedBytes,
    entryCount: entries.length,
    entryPoint: 'index.html',
    files
  };
}

export function mimeTypeForAsset(relativePath) {
  return MIME_TYPES[path.extname(relativePath).toLowerCase()] || 'application/octet-stream';
}

function assertSlugAndRelease(hostSlug, releaseId) {
  if (typeof hostSlug !== 'string' || !HOST_SLUG_RE.test(hostSlug)) {
    throw Object.assign(new Error('INVALID_HOST_SLUG'), { code: 'INVALID_HOST_SLUG', status: 400 });
  }
  if (typeof releaseId !== 'string' || !RELEASE_ID_RE.test(releaseId)) {
    throw Object.assign(new Error('INVALID_RELEASE_ID'), { code: 'INVALID_RELEASE_ID', status: 400 });
  }
}

export function createLocalArtifactStorage({ dataDir, publicBasePrefix = '/play-ugc' } = {}) {
  const rootDir = path.resolve(dataDir || path.join(process.cwd(), 'data'), 'ugc-releases');
  fs.mkdirSync(rootDir, { recursive: true });
  const basePrefix = String(publicBasePrefix || '/play-ugc').replace(/\/+$/, '');

  function releaseDir(hostSlug, releaseId) {
    assertSlugAndRelease(hostSlug, releaseId);
    return path.join(rootDir, hostSlug, releaseId);
  }

  function putReleaseBundle({ hostSlug, releaseId, zipBuffer = null, zipFilePath = null, expectedSha256 = null, releaseManifest = null, gameManifest = null, unlimitedSize = false }) {
    assertSlugAndRelease(hostSlug, releaseId);
    const useFileMode = typeof zipFilePath === 'string' && zipFilePath.length > 0;
    let extracted = null;
    if (!useFileMode) {
      extracted = validateAndExtractDeploymentZip(zipBuffer, { unlimitedSize });
      if (expectedSha256 && expectedSha256.toLowerCase() !== extracted.sha256) {
        throw Object.assign(new Error('ARTIFACT_SHA256_MISMATCH'), { code: 'ARTIFACT_SHA256_MISMATCH', status: 409 });
      }
    }

    const hostDir = path.join(rootDir, hostSlug);
    fs.mkdirSync(hostDir, { recursive: true });
    const targetDir = path.join(hostDir, releaseId);
    const metaPath = path.join(hostDir, `${releaseId}.meta.json`);
    const artifactBaseUrl = `${basePrefix}/${hostSlug}/${releaseId}/`;

    const existingResultIfMatching = sha => {
      if (fs.existsSync(path.join(targetDir, 'index.html')) && fs.existsSync(metaPath)) {
        try {
          const existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          if (existingMeta?.sha256 === sha) {
            return {
              sha256: existingMeta.sha256,
              bytes: existingMeta.bytes,
              expandedBytes: existingMeta.expandedBytes,
              entryCount: existingMeta.entryCount,
              artifactBaseUrl
            };
          }
        } catch {}
      }
      return null;
    };

    const preCheckSha = extracted?.sha256 || (expectedSha256 ? expectedSha256.toLowerCase() : null);
    // Immutable releaseId: idempotently reuse only on identical sha256; never overwrite an existing release.
    if (fs.existsSync(targetDir) || fs.existsSync(metaPath)) {
      if (preCheckSha) {
        const reused = existingResultIfMatching(preCheckSha);
        if (reused) return reused;
      }
      throw Object.assign(new Error('RELEASE_IMMUTABLE_CONFLICT'), {
        code: 'RELEASE_IMMUTABLE_CONFLICT',
        status: 409
      });
    }

    const nonce = crypto.randomBytes(6).toString('hex');
    const tempDir = path.join(hostDir, `.tmp-${releaseId}-${nonce}`);
    const tempMetaPath = path.join(hostDir, `.tmp-${releaseId}-${nonce}.meta.json`);
    fs.mkdirSync(tempDir, { recursive: true });
    try {
      if (useFileMode) {
        extracted = validateAndExtractDeploymentZipFile(zipFilePath, tempDir, { expectedSha256, unlimitedSize });
      } else {
        for (const [relativePath, content] of extracted.files.entries()) {
          const dest = path.join(tempDir, relativePath);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, content);
        }
      }
      fs.writeFileSync(tempMetaPath, JSON.stringify({
        hostSlug,
        releaseId,
        sha256: extracted.sha256,
        bytes: extracted.bytes,
        expandedBytes: extracted.expandedBytes,
        entryCount: extracted.entryCount,
        releaseManifest,
        gameManifest,
        storedAt: new Date().toISOString()
      }, null, 2));
      try {
        fs.renameSync(tempDir, targetDir);
      } catch (renameErr) {
        if (fs.existsSync(targetDir)) {
          const reused = existingResultIfMatching(extracted.sha256);
          if (reused) return reused;
          throw Object.assign(new Error('RELEASE_IMMUTABLE_CONFLICT'), {
            code: 'RELEASE_IMMUTABLE_CONFLICT',
            status: 409
          });
        }
        throw renameErr;
      }
      fs.renameSync(tempMetaPath, metaPath);
    } finally {
      if (fs.existsSync(tempDir)) {
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
      }
      if (fs.existsSync(tempMetaPath)) {
        try { fs.rmSync(tempMetaPath, { force: true }); } catch {}
      }
    }

    return {
      sha256: extracted.sha256,
      bytes: extracted.bytes,
      expandedBytes: extracted.expandedBytes,
      entryCount: extracted.entryCount,
      artifactBaseUrl
    };
  }

  function hasRelease(hostSlug, releaseId) {
    try {
      const dir = releaseDir(hostSlug, releaseId);
      return fs.existsSync(path.join(dir, 'index.html'));
    } catch {
      return false;
    }
  }

  function resolveAssetPath(hostSlug, releaseId, rawAssetPath = 'index.html') {
    assertSlugAndRelease(hostSlug, releaseId);
    const cleaned = String(rawAssetPath || 'index.html').replace(/^\/+/, '') || 'index.html';
    if (cleaned.length > 240 || /[\\:\x00-\x1f\x7f%?#]/.test(cleaned)) return null;
    const parts = cleaned.split('/');
    if (parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.'))) return null;
    if (!ALLOWED_EXT_RE.test(cleaned)) return null;

    const baseDir = releaseDir(hostSlug, releaseId);
    if (!fs.existsSync(baseDir)) return null;
    const candidate = path.resolve(baseDir, cleaned);
    const resolvedBase = path.resolve(baseDir) + path.sep;
    if (!candidate.startsWith(resolvedBase)) return null;
    try {
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) return null;
      return { filePath: candidate, relativePath: cleaned, size: stat.size, contentType: mimeTypeForAsset(cleaned) };
    } catch {
      return null;
    }
  }

  function deleteRelease(hostSlug, releaseId) {
    assertSlugAndRelease(hostSlug, releaseId);
    const dir = releaseDir(hostSlug, releaseId);
    const metaPath = path.join(rootDir, hostSlug, `${releaseId}.meta.json`);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    if (fs.existsSync(metaPath)) fs.rmSync(metaPath, { force: true });
  }

  return {
    mode: 'local-fs',
    rootDir,
    publicBasePrefix: basePrefix,
    putReleaseBundle,
    hasRelease,
    resolveAssetPath,
    deleteRelease
  };
}

export function createArtifactStorage(config = {}) {
  const mode = String(config?.storageMode || 'local-fs').trim().toLowerCase();
  if (mode === 'local-fs') return createLocalArtifactStorage(config);
  throw Object.assign(new Error(`Artifact storage mode '${mode}' is reserved for Phase B`), {
    code: 'UNSUPPORTED_ARTIFACT_STORAGE_MODE',
    status: 503
  });
}
