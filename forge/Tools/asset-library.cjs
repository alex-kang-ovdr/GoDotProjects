'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { inflateRawSync } = require('node:zlib');
const { zipFiles } = require('./export-godot-project.cjs');
const { loadAssetStore } = require('./template-catalog.cjs');

const PREFIX = '/api/asset-library';
const STORE_SUBROUTE = '/store';
const SLUG = 'tappy-original';
const LICENSE = 'Local sample';
const PUBLISHER = { name: 'PlayForge Local', slug: 'playforge-local', verified: false };
const TAGS = [{ display_name: '2D Assets', slug: '2d' }];
const MIN_GODOT_VERSION = '4.7';
const ARCHIVE_PATH = `/packs/${SLUG}.zip`;
const ASSET_PATH = `/assets/${PUBLISHER.slug}/${SLUG}`;
const SHORT_ASSET_PATH = `/assets/${SLUG}`;
const RELEASE_PATH = `/releases/${PUBLISHER.slug}/${SLUG}`;

const STORE_STATES = Object.freeze([
  'catalog_listed',
  'saved_to_library',
  'license_verified',
  'artifact_downloaded',
  'plan_reviewed',
  'applied_to_project',
  'update_available',
]);
const RELEASE_KINDS = Object.freeze(['package', 'editorial']);
const PLATFORMS = Object.freeze(['web', 'windows', 'linux', 'macos']);
const INSTALLATION_STATUSES = Object.freeze(['applied', 'superseded', 'removed']);
const INSTALLATION_RECORD_FILENAME = '.playforge-store-installations.json';
const MAX_STORE_BODY_BYTES = 1024 * 1024;

const RE_ASSET_ID = /^[a-z][a-z0-9-]{1,63}$/;
const RE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/;
const RE_RELEASE_ID = /^rel-[a-z0-9-]{4,64}$/;
const RE_ARTIFACT_ID = /^art-[a-z0-9-]{4,64}$/;
const RE_SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const RE_HEX64 = /^[a-f0-9]{64}$/;
const RE_GODOT_COMPAT = /^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/;
const RE_TARGET_ROOT = /^(?:addons|assets)\//;

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function formatDigest(data) {
  return `sha256:${sha256Hex(data)}`;
}

function computeDependencyManifestHash(dependencies = []) {
  const normalized = [...dependencies]
    .map((dep) => ({
      asset_id: String(dep?.asset_id || ''),
      asset_version_id: String(dep?.asset_version_id || ''),
      release_id: String(dep?.release_id || ''),
    }))
    .sort((a, b) => a.asset_id.localeCompare(b.asset_id) || a.release_id.localeCompare(b.release_id));
  return formatDigest(JSON.stringify(normalized));
}

function compareSemver(left, right) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([a-zA-Z0-9.-]+))?$/.exec(String(value || '').trim());
    if (!match) return null;
    return {
      major: Number(match[1]),
      minor: Number(match[2]),
      patch: Number(match[3] || 0),
      pre: match[4] || '',
    };
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
  }
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre.localeCompare(b.pre);
}

function isSafePackageFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false;
  if (filePath.includes('\\') || filePath.includes(':') || filePath.includes('\0')) return false;
  if (filePath.startsWith('/') || filePath.endsWith('/')) return false;
  if (filePath.endsWith('.import') || filePath.endsWith('.remap')) return false;
  const parts = filePath.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  return RE_TARGET_ROOT.test(filePath);
}

function inferTargetRoot(fileManifest) {
  if (!Array.isArray(fileManifest) || fileManifest.length === 0) return 'assets/';
  const firstParts = String(fileManifest[0]?.path || '').split('/');
  const rootKind = firstParts[0] === 'addons' ? 'addons' : 'assets';
  if (firstParts.length >= 2) {
    const candidate = `${rootKind}/${firstParts[1]}/`;
    if (fileManifest.every((item) => String(item?.path || '').startsWith(candidate))) {
      return candidate;
    }
  }
  return `${rootKind}/`;
}

function isEngineCompatible(compat, targetEngine = '4.7.2', targetPlatform = 'windows') {
  if (!compat || typeof compat !== 'object') {
    return { ok: false, reason: 'Missing engine_compatibility metadata.' };
  }
  if (!RE_GODOT_COMPAT.test(String(compat.godot_min || '')) || !RE_GODOT_COMPAT.test(String(compat.godot_tested || ''))) {
    return { ok: false, reason: 'Invalid Godot compatibility version format.' };
  }
  if (compareSemver(targetEngine, compat.godot_min) < 0) {
    return { ok: false, reason: `Godot ${targetEngine} is older than required godot_min ${compat.godot_min}.` };
  }
  const platforms = Array.isArray(compat.platforms) ? compat.platforms : [];
  if (!platforms.includes(targetPlatform)) {
    return { ok: false, reason: `Platform '${targetPlatform}' is not supported (${platforms.join(', ')}).` };
  }
  return { ok: true, godot_min: compat.godot_min, godot_tested: compat.godot_tested, platform: targetPlatform };
}

function rejectEditorialInstall(entry) {
  if (!entry || typeof entry !== 'object') {
    return { ok: false, rejected: true, status: 400, code: 'INVALID_ENTRY', error: 'Store entry must be an object.' };
  }
  if (entry.release_kind === 'editorial') {
    return {
      ok: false,
      rejected: true,
      status: 400,
      code: 'EDITORIAL_NOT_INSTALLABLE',
      error: '일반 콘텐츠(editorial)는 패키지 설치 대상이 아니며 프로젝트에 설치할 수 없습니다.',
    };
  }
  if (entry.release_kind !== 'package') {
    return {
      ok: false,
      rejected: true,
      status: 400,
      code: 'UNSUPPORTED_RELEASE_KIND',
      error: `Unsupported release_kind: ${String(entry.release_kind)}`,
    };
  }
  return { ok: true, rejected: false };
}

function validateInstallationRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return ['installation_record must be an object or null'];
  }
  const allowed = new Set(['project_id', 'installed_release_id', 'installed_digest', 'target_root', 'applied_at', 'status']);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`installation_record has unexpected property: ${key}`);
  }
  if (typeof record.project_id !== 'string' || record.project_id.length < 1) errors.push('installation_record requires project_id');
  if (!RE_RELEASE_ID.test(String(record.installed_release_id || ''))) errors.push('Invalid installation_record.installed_release_id');
  if (!RE_SHA256_DIGEST.test(String(record.installed_digest || ''))) errors.push('Invalid installation_record.installed_digest');
  if (!RE_TARGET_ROOT.test(String(record.target_root || ''))) errors.push('Invalid installation_record.target_root');
  if (typeof record.applied_at !== 'string' || record.applied_at.length < 10) errors.push('Invalid installation_record.applied_at');
  if (!INSTALLATION_STATUSES.includes(record.status)) errors.push('Invalid installation_record.status');
  return errors;
}

function validateStoreContract(entry, { strictAdditionalProperties = false } = {}) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { valid: false, errors: ['Entry must be an object'] };
  }
  if (strictAdditionalProperties) {
    const allowedTop = new Set([
      'schema_version', 'asset_id', 'asset_version_id', 'release_id', 'release_kind',
      'title', 'summary', 'publisher_id', 'store_state', 'artifact_id', 'artifact_digest',
      'dependency_manifest_hash', 'engine_compatibility', 'file_manifest',
      'license_snapshot_ref', 'installation_record',
    ]);
    for (const key of Object.keys(entry)) {
      if (!allowedTop.has(key)) errors.push(`Unexpected contract property: ${key}`);
    }
  }
  if (entry.schema_version !== 1) errors.push('schema_version must be 1');
  if (!RE_ASSET_ID.test(String(entry.asset_id || ''))) errors.push('Invalid asset_id');
  if (!RE_VERSION.test(String(entry.asset_version_id || ''))) errors.push('Invalid asset_version_id');
  if (!RE_RELEASE_ID.test(String(entry.release_id || ''))) errors.push('Invalid release_id');
  if (!RELEASE_KINDS.includes(entry.release_kind)) errors.push('Invalid release_kind');
  if (typeof entry.title !== 'string' || entry.title.length < 1 || entry.title.length > 120) errors.push('Invalid title');
  if (entry.summary !== undefined && (typeof entry.summary !== 'string' || entry.summary.length > 500)) errors.push('Invalid summary');
  if (typeof entry.publisher_id !== 'string' || entry.publisher_id.length < 2 || entry.publisher_id.length > 64) errors.push('Invalid publisher_id');
  if (!STORE_STATES.includes(entry.store_state)) errors.push('Invalid store_state');

  if (entry.release_kind === 'package') {
    if (!RE_ARTIFACT_ID.test(String(entry.artifact_id || ''))) errors.push('package requires valid artifact_id');
    if (!RE_SHA256_DIGEST.test(String(entry.artifact_digest || ''))) errors.push('package requires immutable sha256 artifact_digest');
    if (!RE_SHA256_DIGEST.test(String(entry.dependency_manifest_hash || ''))) errors.push('package requires dependency_manifest_hash');
    const compat = entry.engine_compatibility;
    if (!compat || typeof compat !== 'object' || Array.isArray(compat)) {
      errors.push('package requires engine_compatibility');
    } else {
      const compatKeys = Object.keys(compat);
      if (compatKeys.some((k) => !['godot_min', 'godot_tested', 'platforms'].includes(k))) {
        errors.push('engine_compatibility has unexpected properties');
      }
      if (!RE_GODOT_COMPAT.test(String(compat.godot_min || ''))) errors.push('Invalid engine_compatibility.godot_min');
      if (!RE_GODOT_COMPAT.test(String(compat.godot_tested || ''))) errors.push('Invalid engine_compatibility.godot_tested');
      if (!Array.isArray(compat.platforms) || compat.platforms.length === 0 || compat.platforms.some((p) => !PLATFORMS.includes(p))) {
        errors.push('Invalid engine_compatibility.platforms');
      }
    }
    if (!Array.isArray(entry.file_manifest) || entry.file_manifest.length === 0) {
      errors.push('package requires non-empty file_manifest');
    } else {
      const seenPaths = new Set();
      for (const item of entry.file_manifest) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push('file_manifest item must be an object');
          continue;
        }
        if (Object.keys(item).some((k) => !['path', 'bytes', 'sha256', 'executable_addon'].includes(k))) {
          errors.push(`file_manifest item has unexpected property for ${String(item.path || '')}`);
        }
        if (!isSafePackageFilePath(item.path) || seenPaths.has(item.path)) {
          errors.push(`Unsafe or duplicate file_manifest path: ${String(item.path || '')}`);
        }
        seenPaths.add(item.path);
        if (!Number.isInteger(item.bytes) || item.bytes < 1) errors.push(`Invalid bytes for ${String(item.path || '')}`);
        if (!RE_HEX64.test(String(item.sha256 || ''))) errors.push(`Invalid sha256 for ${String(item.path || '')}`);
        if (typeof item.executable_addon !== 'boolean') errors.push(`Invalid executable_addon flag for ${String(item.path || '')}`);
      }
    }
    if (typeof entry.license_snapshot_ref !== 'string' || entry.license_snapshot_ref.length < 4 || entry.license_snapshot_ref.length > 128) {
      errors.push('package requires valid license_snapshot_ref');
    }
  } else if (entry.release_kind === 'editorial') {
    if (entry.artifact_id !== undefined || entry.artifact_digest !== undefined || entry.file_manifest !== undefined) {
      errors.push('editorial entry must not carry installable package artifact fields');
    }
    if (entry.installation_record !== undefined && entry.installation_record !== null) {
      errors.push('editorial entry must keep installation_record null');
    }
  }

  if (entry.installation_record !== undefined && entry.installation_record !== null) {
    errors.push(...validateInstallationRecord(entry.installation_record));
  }
  return { valid: errors.length === 0, errors };
}

function readZipEntries(zipBuffer) {
  const buf = Buffer.isBuffer(zipBuffer) ? zipBuffer : Buffer.from(zipBuffer);
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid ZIP archive: EOCD not found.');
  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const centralOffset = buf.readUInt32LE(eocdOffset + 16);
  const files = new Map();
  let cursor = centralOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory record.');
    }
    const method = buf.readUInt16LE(cursor + 10);
    const compressedSize = buf.readUInt32LE(cursor + 20);
    const uncompressedSize = buf.readUInt32LE(cursor + 24);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOffset = buf.readUInt32LE(cursor + 42);
    const name = buf.toString('utf8', cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header for ${name}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = Buffer.from(raw);
    else if (method === 8) content = inflateRawSync(raw);
    else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
    if (content.length !== uncompressedSize) {
      throw new Error(`ZIP entry size mismatch for ${name}`);
    }
    files.set(name, content);
  }
  return files;
}

function buildPackageArtifact({ entry, files, dependencies = [] }) {
  if (!entry || entry.release_kind !== 'package') {
    throw new Error('buildPackageArtifact requires a release_kind === "package" entry.');
  }
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files || {});
  const sorted = entries
    .map(([filePath, raw]) => {
      if (!isSafePackageFilePath(filePath)) throw new Error(`Unsafe package file path: ${filePath}`);
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw), 'utf8');
      return [filePath, buf];
    })
    .sort((a, b) => a[0].localeCompare(b[0]));

  const manifest = sorted.map(([filePath, buf]) => ({
    path: filePath,
    bytes: buf.length,
    sha256: sha256Hex(buf),
    executable_addon: filePath.startsWith('addons/'),
  }));
  const archive = zipFiles(sorted);
  const fullEntry = {
    ...entry,
    schema_version: 1,
    release_kind: 'package',
    store_state: entry.store_state || 'catalog_listed',
    artifact_digest: formatDigest(archive),
    dependency_manifest_hash: entry.dependency_manifest_hash || computeDependencyManifestHash(dependencies),
    file_manifest: manifest,
    installation_record: entry.installation_record ?? null,
  };
  return {
    entry: fullEntry,
    archive,
    filesMap: new Map(sorted),
  };
}

function readProjectInstallations(projectRoot) {
  if (!projectRoot) return {};
  const receiptPath = path.join(projectRoot, INSTALLATION_RECORD_FILENAME);
  if (!fs.existsSync(receiptPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeProjectInstallations(projectRoot, records) {
  const receiptPath = path.join(projectRoot, INSTALLATION_RECORD_FILENAME);
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(receiptPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
}

function computeProjectFingerprint(projectRoot, fileManifest) {
  const records = [];
  for (const item of fileManifest) {
    const target = path.resolve(projectRoot, item.path);
    const rel = path.relative(projectRoot, target);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      records.push({ path: item.path, state: 'outside' });
      continue;
    }
    if (!fs.existsSync(target)) {
      records.push({ path: item.path, state: 'missing' });
      continue;
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      records.push({ path: item.path, state: 'directory' });
      continue;
    }
    records.push({ path: item.path, state: 'file', sha256: sha256Hex(fs.readFileSync(target)) });
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  return formatDigest(JSON.stringify(records));
}

function saveLibraryEntry({ libraryMap, accountId = 'default', entry }) {
  const validation = validateStoreContract(entry);
  if (!validation.valid) {
    return { ok: false, status: 400, code: 'INVALID_CONTRACT', errors: validation.errors, error: validation.errors.join('; ') };
  }
  const key = String(accountId || 'default');
  if (libraryMap instanceof Map) {
    if (!libraryMap.has(key)) libraryMap.set(key, new Map());
    libraryMap.get(key).set(entry.asset_id, {
      ...entry,
      store_state: 'saved_to_library',
      saved_at: new Date().toISOString(),
    });
  }
  return {
    ok: true,
    store_state: 'saved_to_library',
    account_id: key,
    asset_id: entry.asset_id,
    release_id: entry.release_id,
    release_kind: entry.release_kind,
    project_modified: false,
  };
}

function queryLibraryEntries({ entries = [], projectId = '', projectRoot = '', catalog = [] }) {
  const installed = projectRoot ? readProjectInstallations(projectRoot) : {};
  const catalogByAsset = new Map();
  for (const item of catalog) {
    if (!item?.asset_id) continue;
    const prev = catalogByAsset.get(item.asset_id);
    if (!prev || compareSemver(item.asset_version_id, prev.asset_version_id) > 0) {
      catalogByAsset.set(item.asset_id, item);
    }
  }
  return entries.map((entry) => {
    const record = installed[entry.asset_id] || null;
    const latest = catalogByAsset.get(entry.asset_id) || entry;
    let storeState = entry.store_state === 'catalog_listed' ? 'saved_to_library' : (entry.store_state || 'saved_to_library');
    let updateInfo = null;
    if (entry.release_kind === 'package' && record && (!projectId || record.project_id === projectId) && record.status === 'applied') {
      const check = checkReleaseUpdate({ installationRecord: record, installedEntry: entry, latestEntry: latest });
      storeState = check.store_state;
      updateInfo = check;
    }
    return {
      ...entry,
      store_state: storeState,
      installation_record: record,
      update_info: updateInfo,
    };
  });
}

function verifyUsageLicense({ accountId = 'default', entry, targetEngineVersion = '4.7.2', targetPlatform = 'windows', grants = null }) {
  const editorialCheck = rejectEditorialInstall(entry);
  if (editorialCheck.rejected) return editorialCheck;
  const validation = validateStoreContract(entry);
  if (!validation.valid) {
    return { ok: false, status: 400, code: 'INVALID_CONTRACT', errors: validation.errors, error: validation.errors.join('; '), project_modified: false };
  }
  let grantVerified = Boolean(entry.license_snapshot_ref);
  if (typeof grants === 'function') {
    grantVerified = Boolean(grants(accountId, entry));
  } else if (grants instanceof Set) {
    grantVerified = grants.has(entry.asset_id) || grants.has(`${accountId}:${entry.asset_id}`);
  } else if (grants && typeof grants === 'object') {
    const entryGrant = grants[entry.asset_id] ?? grants[`${accountId}:${entry.asset_id}`];
    grantVerified = Boolean(entryGrant);
  }
  if (!grantVerified) {
    return { ok: false, status: 403, code: 'LICENSE_GRANT_DENIED', error: `No valid UsageGrant for ${entry.asset_id}.`, project_modified: false };
  }
  const compat = isEngineCompatible(entry.engine_compatibility, targetEngineVersion, targetPlatform);
  if (!compat.ok) {
    return { ok: false, status: 422, code: 'ENGINE_INCOMPATIBLE', error: compat.reason, project_modified: false };
  }
  return {
    ok: true,
    store_state: 'license_verified',
    account_id: accountId,
    asset_id: entry.asset_id,
    release_id: entry.release_id,
    license_snapshot_ref: entry.license_snapshot_ref,
    compatibility: compat,
    project_modified: false,
  };
}

function stageVerifiedArtifact({ entry, artifactBytes, filesMap = null, stagingRoot = '' }) {
  const editorialCheck = rejectEditorialInstall(entry);
  if (editorialCheck.rejected) return editorialCheck;
  const validation = validateStoreContract(entry);
  if (!validation.valid) {
    return { ok: false, status: 400, code: 'INVALID_CONTRACT', errors: validation.errors, error: validation.errors.join('; '), project_modified: false };
  }
  if (!artifactBytes || !(Buffer.isBuffer(artifactBytes) || artifactBytes instanceof Uint8Array)) {
    return { ok: false, status: 400, code: 'MISSING_ARTIFACT_BYTES', error: 'artifactBytes buffer is required for SHA-256 verification.', project_modified: false };
  }
  const actualDigest = formatDigest(artifactBytes);
  if (actualDigest !== entry.artifact_digest) {
    return {
      ok: false,
      status: 422,
      code: 'ARTIFACT_DIGEST_MISMATCH',
      expected: entry.artifact_digest,
      actual: actualDigest,
      error: `SHA-256 artifact_digest 불일치 (expected ${entry.artifact_digest}, got ${actualDigest}).`,
      project_modified: false,
    };
  }
  let unpacked;
  try {
    unpacked = filesMap instanceof Map
      ? filesMap
      : (filesMap && typeof filesMap === 'object'
        ? new Map(Object.entries(filesMap).map(([k, v]) => [k, Buffer.isBuffer(v) ? v : Buffer.from(String(v), 'utf8')]))
        : readZipEntries(artifactBytes));
  } catch (error) {
    return { ok: false, status: 422, code: 'INVALID_ARCHIVE', error: error.message, project_modified: false };
  }

  const verifiedFiles = new Map();
  const manifestPaths = entry.file_manifest.map((item) => item.path);
  let stripPrefix = '';
  if (manifestPaths.some((p) => !unpacked.has(p))) {
    const candidates = [...new Set([...unpacked.keys()].map((k) => k.split('/')[0]).filter(Boolean))];
    if (candidates.length === 1 && manifestPaths.every((p) => unpacked.has(`${candidates[0]}/${p}`))) {
      stripPrefix = `${candidates[0]}/`;
    }
  }

  for (const item of entry.file_manifest) {
    const raw = unpacked.get(stripPrefix + item.path);
    if (!raw) {
      return { ok: false, status: 422, code: 'FILE_MANIFEST_MISSING', path: item.path, error: `Missing file in artifact: ${item.path}`, project_modified: false };
    }
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    if (buf.length !== item.bytes) {
      return { ok: false, status: 422, code: 'FILE_SIZE_MISMATCH', path: item.path, error: `Byte size mismatch for ${item.path}`, project_modified: false };
    }
    if (sha256Hex(buf) !== item.sha256) {
      return { ok: false, status: 422, code: 'FILE_HASH_MISMATCH', path: item.path, error: `SHA-256 mismatch for ${item.path}`, project_modified: false };
    }
    verifiedFiles.set(item.path, buf);
  }

  let stagedDir = null;
  if (stagingRoot) {
    stagedDir = path.join(stagingRoot, entry.release_id);
    fs.rmSync(stagedDir, { recursive: true, force: true });
    for (const [relPath, buf] of verifiedFiles.entries()) {
      const dest = path.resolve(stagedDir, relPath);
      const rel = path.relative(stagedDir, dest);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        fs.rmSync(stagedDir, { recursive: true, force: true });
        return { ok: false, status: 400, code: 'UNSAFE_STAGING_PATH', path: relPath, error: `Unsafe staging path: ${relPath}`, project_modified: false };
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
    }
  }

  return {
    ok: true,
    store_state: 'artifact_downloaded',
    release_id: entry.release_id,
    artifact_digest: actualDigest,
    staged_dir: stagedDir,
    verified_files: [...verifiedFiles.keys()],
    files: verifiedFiles,
    project_modified: false,
  };
}

function reviewInstallPlan({ entry, projectId, projectRoot, dependencies = [], installedRecords = null }) {
  const editorialCheck = rejectEditorialInstall(entry);
  if (editorialCheck.rejected) return editorialCheck;
  const validation = validateStoreContract(entry);
  if (!validation.valid) {
    return { ok: false, status: 400, code: 'INVALID_CONTRACT', errors: validation.errors, error: validation.errors.join('; '), project_modified: false };
  }
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return { ok: false, status: 400, code: 'MISSING_PROJECT_ID', error: 'Selected projectId is required.', project_modified: false };
  }
  if (!projectRoot || !fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    return { ok: false, status: 404, code: 'PROJECT_NOT_FOUND', error: `Selected project directory not found: ${projectRoot}`, project_modified: false };
  }

  const diskRecords = readProjectInstallations(projectRoot);
  const effectiveInstalled = { ...diskRecords, ...(installedRecords || {}) };
  if (Array.isArray(dependencies) && dependencies.length > 0) {
    const depHash = computeDependencyManifestHash(dependencies);
    if (depHash !== entry.dependency_manifest_hash) {
      return {
        ok: false,
        status: 422,
        code: 'DEPENDENCY_MANIFEST_MISMATCH',
        expected: entry.dependency_manifest_hash,
        actual: depHash,
        error: 'dependency_manifest_hash does not match declared dependencies.',
        project_modified: false,
      };
    }
  }

  const missingDependencies = [];
  for (const dep of dependencies || []) {
    const depId = String(dep?.asset_id || '');
    if (!depId) continue;
    const rec = effectiveInstalled[depId];
    if (!rec || rec.status !== 'applied' || (dep.release_id && rec.installed_release_id !== dep.release_id)) {
      missingDependencies.push(dep);
    }
  }

  const additions = [];
  const unchanged = [];
  const conflicts = [];
  const executableAddons = [];

  for (const item of entry.file_manifest) {
    if (item.executable_addon || item.path.startsWith('addons/')) {
      executableAddons.push(item.path);
    }
    const target = path.resolve(projectRoot, item.path);
    const rel = path.relative(projectRoot, target);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      return { ok: false, status: 400, code: 'UNSAFE_TARGET_PATH', path: item.path, error: `Unsafe target path: ${item.path}`, project_modified: false };
    }
    if (!fs.existsSync(target)) {
      additions.push({ path: item.path, bytes: item.bytes, executable_addon: item.executable_addon });
      continue;
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      conflicts.push({ path: item.path, reason: 'path_is_directory', existing_sha256: null, incoming_sha256: item.sha256 });
      continue;
    }
    const existingSha = sha256Hex(fs.readFileSync(target));
    if (existingSha === item.sha256) {
      unchanged.push({ path: item.path, bytes: item.bytes });
    } else {
      conflicts.push({ path: item.path, reason: 'file_modified_or_exists', existing_sha256: existingSha, incoming_sha256: item.sha256 });
    }
  }

  const targetRoot = inferTargetRoot(entry.file_manifest);
  const projectFingerprint = computeProjectFingerprint(projectRoot, entry.file_manifest);
  return {
    ok: true,
    store_state: 'plan_reviewed',
    project_id: projectId,
    project_root: projectRoot,
    asset_id: entry.asset_id,
    release_id: entry.release_id,
    artifact_digest: entry.artifact_digest,
    target_root: targetRoot,
    additions,
    unchanged,
    conflicts,
    executable_addons: executableAddons,
    dependencies: [...(dependencies || [])],
    missing_dependencies: missingDependencies,
    project_fingerprint: projectFingerprint,
    can_apply: missingDependencies.length === 0,
    requires_conflict_resolution: conflicts.length > 0,
    project_modified: false,
  };
}

function applyInstallPlan({
  entry,
  plan,
  stagedFiles = null,
  stagingRoot = '',
  projectId,
  projectRoot,
  allowOverwriteConflicts = false,
  now = null,
}) {
  const editorialCheck = rejectEditorialInstall(entry);
  if (editorialCheck.rejected) return editorialCheck;
  const validation = validateStoreContract(entry);
  if (!validation.valid) {
    return { ok: false, status: 400, code: 'INVALID_CONTRACT', errors: validation.errors, error: validation.errors.join('; '), project_modified: false };
  }
  if (!plan || plan.store_state !== 'plan_reviewed') {
    return { ok: false, status: 400, code: 'PLAN_NOT_REVIEWED', error: '설치 계획 검토(plan_reviewed)를 먼저 완료해야 합니다.', project_modified: false };
  }
  if (plan.project_id !== projectId || path.resolve(plan.project_root || '') !== path.resolve(projectRoot || '')) {
    return { ok: false, status: 409, code: 'PROJECT_MISMATCH', error: '검토된 설치 계획의 대상 프로젝트와 적용 대상이 일치하지 않습니다.', project_modified: false };
  }
  if (plan.release_id !== entry.release_id || plan.artifact_digest !== entry.artifact_digest) {
    return { ok: false, status: 409, code: 'RELEASE_MISMATCH', error: '검토된 설치 계획의 릴리스/다이제스트가 일치하지 않습니다.', project_modified: false };
  }
  if (Array.isArray(plan.missing_dependencies) && plan.missing_dependencies.length > 0) {
    return { ok: false, status: 422, code: 'MISSING_DEPENDENCIES', missing_dependencies: plan.missing_dependencies, error: '필수 의존성 패키지가 설치되지 않았습니다.', project_modified: false };
  }
  if (Array.isArray(plan.conflicts) && plan.conflicts.length > 0 && !allowOverwriteConflicts) {
    return {
      ok: false,
      status: 409,
      code: 'CONFLICT_DETECTED',
      conflicts: plan.conflicts,
      error: '충돌 파일이 감지되어 설치가 중단되었습니다. 충돌을 확인하고 덮어쓰기를 허용한 뒤 다시 적용하세요.',
      project_modified: false,
    };
  }
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    return { ok: false, status: 404, code: 'PROJECT_NOT_FOUND', error: `Selected project directory not found: ${projectRoot}`, project_modified: false };
  }

  const currentFingerprint = computeProjectFingerprint(projectRoot, entry.file_manifest);
  if (currentFingerprint !== plan.project_fingerprint) {
    return {
      ok: false,
      status: 409,
      code: 'STALE_INSTALL_PLAN',
      error: '설치 계획 검토 이후 프로젝트 파일이 변경되었습니다. 다시 검토하세요.',
      project_modified: false,
    };
  }

  const stagedDir = stagingRoot ? path.join(stagingRoot, entry.release_id) : '';
  const buffers = new Map();
  for (const item of entry.file_manifest) {
    let buf = null;
    if (stagedFiles instanceof Map && stagedFiles.has(item.path)) {
      buf = stagedFiles.get(item.path);
    } else if (stagedFiles && !(stagedFiles instanceof Map) && Object.hasOwn(stagedFiles, item.path)) {
      buf = stagedFiles[item.path];
    } else if (stagedDir) {
      const stagedPath = path.resolve(stagedDir, item.path);
      if (fs.existsSync(stagedPath) && fs.statSync(stagedPath).isFile()) {
        buf = fs.readFileSync(stagedPath);
      }
    }
    if (buf === null || buf === undefined) {
      return { ok: false, status: 422, code: 'STAGED_FILE_MISSING', path: item.path, error: `Staged file missing: ${item.path}`, project_modified: false };
    }
    const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8');
    if (raw.length !== item.bytes || sha256Hex(raw) !== item.sha256) {
      return { ok: false, status: 422, code: 'STAGED_FILE_CORRUPTED', path: item.path, error: `Staged file integrity mismatch: ${item.path}`, project_modified: false };
    }
    buffers.set(item.path, raw);
  }

  const backups = [];
  const writtenFiles = [];
  try {
    for (const item of entry.file_manifest) {
      const target = path.resolve(projectRoot, item.path);
      const rel = path.relative(projectRoot, target);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`Unsafe target path: ${item.path}`);
      }
      if (fs.existsSync(target)) {
        const stat = fs.statSync(target);
        if (stat.isDirectory()) throw new Error(`Target path is a directory: ${item.path}`);
        backups.push({ target, existed: true, content: fs.readFileSync(target) });
      } else {
        backups.push({ target, existed: false, content: null });
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffers.get(item.path));
      writtenFiles.push(item.path);
    }
  } catch (error) {
    for (const entryBackup of backups.reverse()) {
      try {
        if (entryBackup.existed) fs.writeFileSync(entryBackup.target, entryBackup.content);
        else if (fs.existsSync(entryBackup.target)) fs.rmSync(entryBackup.target, { force: true });
      } catch { /* best-effort rollback */ }
    }
    return { ok: false, status: 500, code: 'APPLY_FAILED', error: error.message, project_modified: false };
  }

  const installationRecord = {
    project_id: projectId,
    installed_release_id: entry.release_id,
    installed_digest: entry.artifact_digest,
    target_root: plan.target_root || inferTargetRoot(entry.file_manifest),
    applied_at: (now ? new Date(now) : new Date()).toISOString(),
    status: 'applied',
  };
  const allRecords = readProjectInstallations(projectRoot);
  allRecords[entry.asset_id] = installationRecord;
  writeProjectInstallations(projectRoot, allRecords);

  return {
    ok: true,
    store_state: 'applied_to_project',
    project_id: projectId,
    asset_id: entry.asset_id,
    release_id: entry.release_id,
    written_files: writtenFiles,
    installation_record: installationRecord,
    project_modified: true,
  };
}

function checkReleaseUpdate({ installationRecord, installedEntry = null, latestEntry }) {
  if (!installationRecord || installationRecord.status !== 'applied') {
    return {
      ok: true,
      update_available: false,
      store_state: 'saved_to_library',
      current_release_id: installationRecord?.installed_release_id || null,
      latest_release_id: latestEntry?.release_id || null,
      latest_version: latestEntry?.asset_version_id || null,
      project_modified: false,
    };
  }
  if (!latestEntry || latestEntry.release_kind !== 'package') {
    return {
      ok: true,
      update_available: false,
      store_state: 'applied_to_project',
      current_release_id: installationRecord.installed_release_id,
      latest_release_id: null,
      latest_version: null,
      project_modified: false,
    };
  }
  const differentRelease = latestEntry.release_id !== installationRecord.installed_release_id;
  const differentDigest = latestEntry.artifact_digest !== installationRecord.installed_digest;
  const versionCmp = installedEntry?.asset_version_id
    ? compareSemver(latestEntry.asset_version_id, installedEntry.asset_version_id)
    : 1;
  const updateAvailable = Boolean(differentRelease && versionCmp >= 0 && (versionCmp > 0 || differentDigest));
  return {
    ok: true,
    update_available: updateAvailable,
    store_state: updateAvailable ? 'update_available' : 'applied_to_project',
    asset_id: latestEntry.asset_id,
    current_release_id: installationRecord.installed_release_id,
    current_digest: installationRecord.installed_digest,
    latest_release_id: latestEntry.release_id,
    latest_version: latestEntry.asset_version_id,
    latest_digest: latestEntry.artifact_digest,
    project_modified: false,
  };
}

function createStoreBridge(options = {}) {
  const catalog = new Map();
  const artifacts = new Map();
  const libraries = new Map();
  const stagedByRelease = new Map();
  const reviewedPlans = new Map();
  const projects = new Map(Object.entries(options.projects || {}));
  const stagingRoot = options.stagingRoot || '';
  const storeWebUrl = options.storeWebUrl || 'http://127.0.0.1:4173/store';
  const grants = options.grants || null;

  function registerEntry(entry, artifactInfo = null) {
    const validation = validateStoreContract(entry);
    if (!validation.valid) {
      throw new Error(`Invalid store contract for ${entry?.asset_id || 'unknown'}: ${validation.errors.join('; ')}`);
    }
    const list = catalog.get(entry.asset_id) || [];
    const idx = list.findIndex((item) => item.release_id === entry.release_id);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    list.sort((a, b) => compareSemver(b.asset_version_id, a.asset_version_id));
    catalog.set(entry.asset_id, list);
    if (artifactInfo) {
      artifacts.set(entry.release_id, {
        entry,
        archive: artifactInfo.archive,
        filesMap: artifactInfo.filesMap,
        dependencies: artifactInfo.dependencies || [],
      });
    }
    if (options.autoSaveAccount) {
      saveLibraryEntry({ libraryMap: libraries, accountId: options.autoSaveAccount, entry });
    }
    return entry;
  }

  for (const item of options.catalog || []) {
    registerEntry(item.entry || item, item.archive ? item : null);
  }

  function registerProject(projectId, projectRoot) {
    projects.set(projectId, projectRoot);
  }

  function findRelease(assetId, releaseId = '') {
    if (releaseId && artifacts.has(releaseId)) return artifacts.get(releaseId).entry;
    const list = catalog.get(assetId) || [];
    if (releaseId) return list.find((item) => item.release_id === releaseId) || null;
    return list[0] || null;
  }

  function resolveEntryFromBody(body) {
    if (body.entry && typeof body.entry === 'object') return body.entry;
    return findRelease(String(body.asset_id || ''), String(body.release_id || ''));
  }

  function getLibrary(accountId = 'default', projectId = '') {
    const savedMap = libraries.get(String(accountId || 'default'));
    const rawEntries = savedMap
      ? [...savedMap.values()]
      : [...catalog.values()].map((releases) => releases[0]).filter(Boolean);
    const allCatalog = [...catalog.values()].flat();
    const projectRoot = projectId ? (projects.get(projectId) || '') : '';
    return queryLibraryEntries({ entries: rawEntries, projectId, projectRoot, catalog: allCatalog });
  }

  async function handleHttp(route, url, request, response) {
    const method = request.method;
    if (method === 'GET' && route === '/library') {
      const accountId = url.searchParams.get('account_id') || 'default';
      const projectId = url.searchParams.get('project_id') || '';
      json(response, 200, {
        ok: true,
        account_id: accountId,
        store_web_url: storeWebUrl,
        entries: getLibrary(accountId, projectId),
      });
      return;
    }
    const releaseMatch = /^\/releases\/([a-z0-9-]+)$/.exec(route);
    if (method === 'GET' && releaseMatch) {
      const entry = findRelease(releaseMatch[1], url.searchParams.get('release_id') || '');
      if (!entry) {
        json(response, 404, { ok: false, error: 'Store release not found.' });
        return;
      }
      json(response, 200, { ok: true, release: entry });
      return;
    }
    const artifactMatch = /^\/artifacts\/(rel-[a-z0-9-]+)$/.exec(route);
    if (method === 'GET' && artifactMatch) {
      const bundle = artifacts.get(artifactMatch[1]);
      if (!bundle) {
        json(response, 404, { ok: false, error: 'Package artifact not found.' });
        return;
      }
      send(response, 200, 'application/zip', bundle.archive, {
        'Content-Length': bundle.archive.length,
        'ETag': `"${bundle.entry.artifact_digest}"`,
        'X-PlayForge-Artifact-Digest': bundle.entry.artifact_digest,
      });
      return;
    }
    if (method === 'GET' && route === '/updates') {
      const projectId = url.searchParams.get('project_id') || '';
      const accountId = url.searchParams.get('account_id') || 'default';
      const entries = getLibrary(accountId, projectId);
      const updates = entries
        .filter((item) => item.update_info && item.update_info.update_available)
        .map((item) => item.update_info);
      json(response, 200, { ok: true, project_id: projectId, updates });
      return;
    }
    if (method !== 'POST') {
      json(response, 405, { ok: false, error: 'Unsupported method on Store API.' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(request, MAX_STORE_BODY_BYTES);
    } catch (error) {
      json(response, error.status || 400, { ok: false, error: error.message });
      return;
    }

    if (route === '/library') {
      const entry = resolveEntryFromBody(body);
      const result = saveLibraryEntry({ libraryMap: libraries, accountId: body.account_id || 'default', entry });
      json(response, result.ok ? 200 : (result.status || 400), result);
      return;
    }
    if (route === '/license') {
      const entry = resolveEntryFromBody(body);
      const result = verifyUsageLicense({
        accountId: body.account_id || 'default',
        entry,
        targetEngineVersion: body.godot_version || '4.7.2',
        targetPlatform: body.platform || 'windows',
        grants,
      });
      json(response, result.ok ? 200 : (result.status || 400), result);
      return;
    }
    if (route === '/stage') {
      const entry = resolveEntryFromBody(body);
      const bundle = entry ? artifacts.get(entry.release_id) : null;
      const bytes = body.artifact_base64 ? Buffer.from(String(body.artifact_base64), 'base64') : bundle?.archive;
      const result = stageVerifiedArtifact({ entry, artifactBytes: bytes, stagingRoot });
      if (result.ok) stagedByRelease.set(entry.release_id, result);
      json(response, result.ok ? 200 : (result.status || 400), result.ok ? { ...result, files: undefined } : result);
      return;
    }
    if (route === '/plan') {
      const entry = resolveEntryFromBody(body);
      const projectId = String(body.project_id || '');
      const projectRoot = projects.get(projectId) || '';
      const bundle = entry ? artifacts.get(entry.release_id) : null;
      const result = reviewInstallPlan({
        entry,
        projectId,
        projectRoot,
        dependencies: body.dependencies || bundle?.dependencies || [],
      });
      if (result.ok) {
        const planToken = `${projectId}:${entry.release_id}:${result.project_fingerprint}`;
        reviewedPlans.set(planToken, result);
        json(response, 200, { ...result, plan_token: planToken });
      } else {
        json(response, result.status || 400, result);
      }
      return;
    }
    if (route === '/apply') {
      const entry = resolveEntryFromBody(body);
      const projectId = String(body.project_id || '');
      const projectRoot = projects.get(projectId) || '';
      const plan = body.plan || reviewedPlans.get(String(body.plan_token || ''));
      const staged = entry ? stagedByRelease.get(entry.release_id) : null;
      const bundle = entry ? artifacts.get(entry.release_id) : null;
      const result = applyInstallPlan({
        entry,
        plan,
        stagedFiles: staged?.files || bundle?.filesMap,
        stagingRoot,
        projectId,
        projectRoot,
        allowOverwriteConflicts: Boolean(body.allow_overwrite_conflicts),
      });
      json(response, result.ok ? 200 : (result.status || 400), result);
      return;
    }
    if (route === '/check-updates') {
      const entry = resolveEntryFromBody(body);
      const projectId = String(body.project_id || '');
      const projectRoot = projects.get(projectId) || '';
      const records = projectRoot ? readProjectInstallations(projectRoot) : {};
      const record = body.installation_record || (entry ? records[entry.asset_id] : null);
      const latest = entry ? findRelease(entry.asset_id) : null;
      const result = checkReleaseUpdate({ installationRecord: record, installedEntry: entry, latestEntry: latest });
      json(response, 200, result);
      return;
    }
    json(response, 404, { ok: false, error: 'Store endpoint not found.' });
  }

  return {
    registerEntry,
    registerProject,
    getLibrary,
    findRelease,
    handleHttp,
    artifacts,
    catalog,
    libraries,
  };
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let aborted = false;
    request.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > maxBytes) {
        aborted = true;
        chunks.length = 0;
        reject(Object.assign(new Error('Request body exceeds limit.'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.once('end', () => {
      if (aborted) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('Expected JSON object body.'), { status: 400 }));
          return;
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Invalid JSON request body.'), { status: 400 }));
      }
    });
    request.once('error', (error) => reject(Object.assign(error, { status: 400 })));
  });
}

function isLoopback(address) {
  return address === '::1' || address === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(address?.replace(/^::ffff:/, ''));
}

function localOrigin(request) {
  if (!isLoopback(request.socket.remoteAddress)) return null;
  try {
    const url = new URL(`http://${request.headers.host}`);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.hostname === 'localhost' || isLoopback(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

function buildPacks(root) {
  const { catalog, sources } = loadAssetStore(root);
  return new Map(catalog.packs.map(pack => {
    // Godot's Store installer strips its ZIP's single top-level folder by default.
    const archive = zipFiles(pack.files.map(file => [`${pack.id}/${file}`, sources[file]]));
    return [pack.id, { pack, archive, sha256: createHash('sha256').update(archive).digest('hex'),
      thumbnail: Buffer.from(sources[pack.files[0]]) }];
  }));
}

function assetDetails(localPack, base) {
  return {
    name: localPack.pack.title,
    slug: SLUG,
    publisher: PUBLISHER,
    license_type: LICENSE,
    license_url: '',
    reviews_score: 0,
    store_url: base + ASSET_PATH,
    thumbnail: base + ASSET_PATH + '/thumbnail.svg',
  };
}

function matchesSearch(params, localPack) {
  if (params.get('type') && params.get('type') !== '0') return false;
  const licenses = params.getAll('licenses');
  if (licenses.length && !licenses.includes(LICENSE)) return false;
  const version = params.get('compatibility');
  if (version) {
    const match = /^(\d+)\.(\d+)(?:\.\d+)?$/.exec(version);
    const [major, minor] = MIN_GODOT_VERSION.split('.').map(Number);
    if (!match || +match[1] < major || (+match[1] === major && +match[2] < minor)) return false;
  }
  const query = (params.get('query') || '').toLowerCase().trim();
  const terms = query.match(/#[\w-]+|[^\s#]+/g) || [];
  const description = `${localPack.pack.title} ${localPack.pack.description} ${SLUG} Epic Games graphics audio 2D assets`.toLowerCase();
  return terms.every(term => term.startsWith('#') ? TAGS.some(tag => term === '#' + tag.slug) : description.includes(term));
}

function send(response, status, type, content, headers = {}) {
  response.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
    ...headers,
  });
  response.end(content);
}

function json(response, status, body) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

function createAssetLibraryHandler(root, options = {}) {
  let packs;
  let storeBridge = options.storeBridge || null;
  return (request, response) => {
    if (!request.url?.startsWith(PREFIX)) return false;
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return false;
    const origin = localOrigin(request);
    if (!origin) {
      json(response, 403, { error: 'Asset library is available on loopback only.' });
      return true;
    }
    const route = url.pathname.slice(PREFIX.length).replace(/\/$/, '');
    if (route === STORE_SUBROUTE || route.startsWith(STORE_SUBROUTE + '/')) {
      storeBridge ||= createStoreBridge(options.storeOptions || {});
      const storeRoute = route.slice(STORE_SUBROUTE.length) || '/';
      storeBridge.handleHttp(storeRoute, url, request, response).catch((error) => {
        if (!response.headersSent) {
          json(response, error.status || 500, { ok: false, error: error.message || 'Store handler error.' });
        }
      });
      return true;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      json(response, 405, { error: 'Asset library is read-only.' });
      return true;
    }
    const base = origin + PREFIX;
    try {
      packs ||= buildPacks(root);
    } catch {
      json(response, 503, { error: 'Asset library unavailable.' });
      return true;
    }
    const localPack = packs.get(SLUG);
    const packSlug = /^\/packs\/([a-z0-9-]+)\.zip$/.exec(route)?.[1];
    const download = packs.get(packSlug);
    if (route === '') {
      json(response, 200, { name: 'PlayForge Local' });
    } else if (route === '/tags') {
      json(response, 200, localPack ? TAGS : []);
    } else if (route === '/licenses') {
      json(response, 200, localPack ? [{ type: LICENSE }] : []);
    } else if (route === '/search/query') {
      const count = localPack && matchesSearch(url.searchParams, localPack) ? 1 : 0;
      const firstPage = (url.searchParams.get('page') || '1') === '1';
      json(response, 200, { count, hits: count && firstPage ? [{ asset: assetDetails(localPack, base) }] : [] });
    } else if (localPack && (route === ASSET_PATH || route === SHORT_ASSET_PATH)) {
      json(response, 200, {
        ...assetDetails(localPack, base),
        body_bbcode: `${localPack.pack.description}\nOriginal artwork and sound by Epic Games.`,
        source: '',
        tags: TAGS,
      });
    } else if (localPack && route === RELEASE_PATH) {
      json(response, 200, [{
        version: '1.0.0',
        stable: true,
        min_godot_version: MIN_GODOT_VERSION,
        max_godot_version: null,
        changes_bbcode: localPack.pack.description,
        download_url: `${base}${ARCHIVE_PATH}?sha256=${localPack.sha256}`,
        sha256: localPack.sha256,
      }]);
    } else if (download && (!url.searchParams.has('sha256') || url.searchParams.get('sha256') === download.sha256)) {
      send(response, 200, 'application/zip', download.archive, {
        'Content-Length': download.archive.length,
        'Content-Disposition': `attachment; filename="${packSlug}.zip"`,
        'ETag': `"${download.sha256}"`,
      });
    } else if (localPack && route === ASSET_PATH + '/thumbnail.svg') {
      send(response, 200, 'image/svg+xml', localPack.thumbnail);
    } else {
      json(response, 404, { error: 'Asset library entry not found.' });
    }
    return true;
  };
}

module.exports = {
  INSTALLATION_RECORD_FILENAME,
  INSTALLATION_STATUSES,
  PLATFORMS,
  RELEASE_KINDS,
  STORE_STATES,
  applyInstallPlan,
  buildPackageArtifact,
  checkReleaseUpdate,
  compareSemver,
  computeDependencyManifestHash,
  computeProjectFingerprint,
  createAssetLibraryHandler,
  createStoreBridge,
  formatDigest,
  inferTargetRoot,
  isEngineCompatible,
  isSafePackageFilePath,
  queryLibraryEntries,
  readProjectInstallations,
  readZipEntries,
  rejectEditorialInstall,
  reviewInstallPlan,
  saveLibraryEntry,
  sha256Hex,
  stageVerifiedArtifact,
  validateInstallationRecord,
  validateStoreContract,
  verifyUsageLicense,
};
