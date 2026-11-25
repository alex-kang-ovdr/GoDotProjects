'use strict';
// BuildManifest v1 generator (roadmap 16 R0 spike, Forge-BuildExport).
// EngineLock is DERIVED from tools/engine/engine-ssot.json via tools/engine/resolve-godot.cjs;
// this module never keeps a second copy of fork repo / commit / tag values.
// Contract: docs/build-export/BUILD_MANIFEST.md

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const engineResolver = require(path.join(REPO_ROOT, 'tools', 'engine', 'resolve-godot.cjs'));

const SCHEMA_VERSION = 1;
const MANIFEST_FILENAME = 'build-manifest.json';
const SHA256_RE = /^[a-f0-9]{64}$/;
const GIT_COMMIT_RE = /^[a-f0-9]{40}$/;
// Platform build-id policy (docs/architecture/build-version-naming-policy.md §2.1), mirrored for validation only.
const POLICY_BUILD_ID_RE = /^(aos|ios|forge-desktop|forge-web|hub|godot-server)-v\d+\.\d+\.\d+-\d{8}-\d{4}-[a-z0-9-]{1,20}-g[0-9a-f]{7}-b\d+(-dirty)?$/;
// Existing UGC web build id (build-queue.cjs job.id / owned-build-packages.cjs): 16 lowercase hex.
// The naming policy keeps this as an independent contract; BuildManifest reuses it, never a new format.
const UGC_BUILD_ID_RE = /^[a-f0-9]{16}$/;
const BINARY_PATH_KINDS = new Set(['fork', 'stock']);

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    let read;
    while ((read = fs.readSync(fd, buf, 0, buf.length, null)) > 0) hash.update(buf.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

// Byte-order comparison on UTF-8 paths: independent of locale and of readdir order.
function comparePaths(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

/** Recursively list regular files under dir as sorted POSIX relative paths. */
function listFiles(dir, { exclude = [] } = {}) {
  const excludeSet = new Set(exclude);
  const out = [];
  const walk = (abs, rel) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (excludeSet.has(childRel) || excludeSet.has(entry.name)) continue;
      const childAbs = path.join(abs, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink not allowed in export output: ${childRel}`);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile()) out.push(childRel);
    }
  };
  walk(dir, '');
  return out.sort(comparePaths);
}

/** Artifacts list [{path, bytes, sha256}] sorted by path. */
function collectArtifacts(dir, options = {}) {
  return listFiles(dir, { exclude: [MANIFEST_FILENAME, ...(options.exclude || [])] }).map((rel) => {
    const abs = path.join(dir, ...rel.split('/'));
    return { path: rel, bytes: fs.statSync(abs).size, sha256: sha256File(abs) };
  });
}

/**
 * content_hash = sha256 over "<sha256>  <path>\n" lines, sorted by path (byte order).
 * Same convention as `sha256sum` output, so it can be recomputed with coreutils:
 *   find . -type f ! -name build-manifest.json | LC_ALL=C sort | xargs sha256sum | sha256sum
 * (with paths stripped of the leading "./").
 */
function computeContentHash(artifacts) {
  const rows = [...artifacts]
    .map((a) => ({ path: a.path, sha256: a.sha256 }))
    .sort((a, b) => comparePaths(a.path, b.path));
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i].path === rows[i - 1].path) throw new Error(`Duplicate artifact path: ${rows[i].path}`);
  }
  return sha256Hex(rows.map((r) => `${r.sha256}  ${r.path}\n`).join(''));
}

function slugify(value, max = 32) {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/g, '');
  return slug || 'project';
}

function readProjectName(projectDir) {
  try {
    const text = fs.readFileSync(path.join(projectDir, 'project.godot'), 'utf8');
    const m = text.match(/^config\/name="([^"]*)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** Source revision of the project directory: { commit, dirty } or { commit:null } outside git. */
function resolveSourceRevision(projectDir) {
  const commit = git(projectDir, ['rev-parse', 'HEAD']);
  if (!commit || !GIT_COMMIT_RE.test(commit)) return { commit: null, dirty: null };
  const status = git(projectDir, ['status', '--porcelain', '--', '.']);
  return { commit, dirty: status === null ? null : status.length > 0 };
}

/**
 * Source tree hash of the project directory (inputs side), excluding Godot's import cache and VCS dirs.
 * This makes build_id track uncommitted edits even when revision is unchanged.
 */
function computeSourceHash(projectDir) {
  const files = listFiles(projectDir, { exclude: ['.godot', '.git', '.import', MANIFEST_FILENAME] });
  return computeContentHash(files.map((rel) => ({ path: rel, sha256: sha256File(path.join(projectDir, ...rel.split('/'))) })));
}

/**
 * EngineLock view derived from engine-ssot.json + the binary actually used.
 * binary_path_kind tells whether the binary is the PlayForge fork (has requiredForkSymbols) or stock Godot;
 * when stock, fork_commit/release_tag still describe the LOCK (what should have been used) and matches_lock=false.
 */
function deriveEngineLock({ ssot = engineResolver.loadEngineSsot(), godotBin = null, ssotTarget = 'web-template', binaryVersion = null, binarySha256 = null } = {}) {
  let binaryPathKind = null;
  let sha = binarySha256;
  if (godotBin) {
    const real = engineResolver.realEngineExecutable(path.resolve(godotBin));
    const inspection = engineResolver.inspectGodotBinary(real);
    binaryPathKind = inspection.hasPlayForgeCore ? 'fork' : 'stock';
    if (!sha && inspection.exists) sha = sha256File(inspection.executable);
  }
  const target = ssot.targets && ssot.targets[ssotTarget] ? ssot.targets[ssotTarget] : null;
  return {
    fork_repo: ssot.forkRepo,
    fork_commit: ssot.pinnedForkCommit,
    release_tag: ssot.releaseTag,
    upstream_base: ssot.upstreamBaseVersion,
    upstream_base_commit: ssot.upstreamBaseCommit,
    binary_path_kind: binaryPathKind,
    binary_sha256: sha || null,
    binary_version: binaryVersion,
    matches_lock: binaryPathKind === 'fork',
    ssot_target: target ? { name: ssotTarget, status: target.status, expected_fork_commit: target.expectedForkCommit || null } : null,
  };
}

function readGodotVersion(godotBin) {
  const r = spawnSync(godotBin, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (r.status !== 0) return null;
  const line = String(r.stdout || '').trim().split(/\r?\n/).pop();
  return line || null;
}

/**
 * build_id rules (documented for TraceSample consumers; no new format is invented):
 *  - platform build (6 targets): tools/build-version resolveBuildInfo().buildId, verbatim (policy §2.1).
 *  - UGC/project build: the build-queue job id (16 hex), verbatim.
 *  - If the caller has neither (standalone CLI spike), a 16-hex UGC-style id is minted once, exactly like
 *    build-queue.cjs does (crypto.randomBytes(8)). A build_id is assigned once and never recomputed.
 * input_hash is separate: sha256 over canonical JSON of the build INPUTS (never outputs or time), so two
 * builds of identical inputs share input_hash even when build_id and Godot output bytes differ.
 */
function classifyBuildId(buildId) {
  if (POLICY_BUILD_ID_RE.test(buildId)) return 'policy';
  if (UGC_BUILD_ID_RE.test(buildId)) return 'ugc';
  return null;
}

function computeInputHash({ projectId, revision, sourceHash, engine, exportInfo }) {
  const inputs = {
    project_id: projectId,
    revision: revision || null,
    source_hash: sourceHash,
    engine_lock: { fork_commit: engine.fork_commit, release_tag: engine.release_tag },
    engine_binary_sha256: engine.binary_sha256,
    preset: exportInfo.preset,
    platform: exportInfo.platform,
    mode: exportInfo.mode,
    template_sha256: exportInfo.template_sha256,
  };
  return sha256Hex(JSON.stringify(inputs));
}

function resolveBuildId(buildId = null, mint = () => crypto.randomBytes(8).toString('hex')) {
  if (buildId) {
    const kind = classifyBuildId(buildId);
    if (!kind) throw new Error(`build_id must be a build-version policy id or a 16-hex UGC build id: ${buildId}`);
    return { build_id: buildId, build_id_kind: kind };
  }
  return { build_id: mint(), build_id_kind: 'ugc' };
}

/** Locate the installed export template file for a Web/pck export (null for pack-only). */
function resolveTemplatePath({ platform, mode, variant = 'web_nothreads_release.zip', versionDir = '4.7.2.stable', env = process.env }) {
  if (mode === 'pack' || platform !== 'Web') return null;
  const base = process.platform === 'win32'
    ? path.join(env.APPDATA || '', 'Godot', 'export_templates', versionDir)
    : path.join(env.HOME || '', '.local', 'share', 'godot', 'export_templates', versionDir);
  const file = path.join(base, variant);
  return fs.existsSync(file) ? file : null;
}

function buildManifest({
  projectDir,
  outputDir,
  projectId = null,
  preset = 'Web',
  platform = 'Web',
  mode = 'release',
  godotBin = null,
  templatePath = undefined,
  buildId = null,
  protocolHash = null,
  ssotTarget = 'web-template',
  now = new Date(),
  engine: engineOverride = null,
}) {
  if (!projectDir || !fs.existsSync(path.join(projectDir, 'project.godot'))) throw new Error(`Not a Godot project dir: ${projectDir}`);
  if (!outputDir || !fs.statSync(outputDir).isDirectory()) throw new Error(`Export output dir not found: ${outputDir}`);
  const resolvedProjectId = projectId || slugify(readProjectName(projectDir) || path.basename(path.resolve(projectDir)));
  const { commit, dirty } = resolveSourceRevision(projectDir);
  const sourceHash = computeSourceHash(projectDir);
  const engine = engineOverride || deriveEngineLock({ godotBin, ssotTarget, binaryVersion: godotBin ? readGodotVersion(godotBin) : null });
  const tpl = templatePath === undefined ? resolveTemplatePath({ platform, mode }) : templatePath;
  const exportInfo = { preset, platform, mode, template_sha256: tpl ? sha256File(tpl) : null };
  const artifacts = collectArtifacts(outputDir);
  if (artifacts.length === 0) throw new Error(`No exported files in ${outputDir}`);
  const ids = resolveBuildId(buildId);
  const inputHash = computeInputHash({ projectId: resolvedProjectId, revision: commit, sourceHash, engine, exportInfo });
  return {
    schemaVersion: SCHEMA_VERSION,
    project_id: resolvedProjectId,
    revision: commit,
    revision_dirty: dirty,
    source_hash: sourceHash,
    build_id: ids.build_id,
    build_id_kind: ids.build_id_kind,
    input_hash: inputHash,
    engine,
    export: exportInfo,
    content_hash: computeContentHash(artifacts),
    artifacts,
    protocol_hash: protocolHash,
    created_at: now.toISOString(),
    signatures: [],
  };
}

/** Structural validation; returns array of error strings (empty = valid). */
function validateManifest(m) {
  const errors = [];
  const req = (cond, msg) => { if (!cond) errors.push(msg); };
  req(m && typeof m === 'object' && !Array.isArray(m), 'manifest must be an object');
  if (errors.length) return errors;
  req(m.schemaVersion === SCHEMA_VERSION, 'schemaVersion must be 1');
  req(typeof m.project_id === 'string' && m.project_id.length > 0, 'project_id required');
  req(m.revision === null || GIT_COMMIT_RE.test(m.revision), 'revision must be 40-hex git commit or null');
  req(typeof m.build_id === 'string' && classifyBuildId(m.build_id) !== null, 'build_id must be a build-version policy id or 16-hex UGC build id');
  req(m.build_id_kind === undefined || m.build_id_kind === classifyBuildId(m.build_id), 'build_id_kind does not match build_id');
  req(m.input_hash === undefined || SHA256_RE.test(m.input_hash), 'input_hash must be sha256');
  const e = m.engine;
  req(e && typeof e === 'object', 'engine required');
  if (e && typeof e === 'object') {
    for (const k of ['fork_repo', 'fork_commit', 'release_tag', 'upstream_base']) req(typeof e[k] === 'string' && e[k].length > 0, `engine.${k} required`);
    req(e.binary_path_kind === null || BINARY_PATH_KINDS.has(e.binary_path_kind), 'engine.binary_path_kind must be fork|stock|null');
    req(e.binary_sha256 === null || SHA256_RE.test(e.binary_sha256), 'engine.binary_sha256 must be sha256 or null');
  }
  const x = m.export;
  req(x && typeof x === 'object', 'export required');
  if (x && typeof x === 'object') {
    req(typeof x.preset === 'string' && x.preset.length > 0, 'export.preset required');
    req(typeof x.platform === 'string' && x.platform.length > 0, 'export.platform required');
    req(x.template_sha256 === null || SHA256_RE.test(x.template_sha256), 'export.template_sha256 must be sha256 or null');
  }
  req(SHA256_RE.test(m.content_hash || ''), 'content_hash must be sha256');
  req(Array.isArray(m.artifacts) && m.artifacts.length > 0, 'artifacts must be a non-empty array');
  if (Array.isArray(m.artifacts)) {
    m.artifacts.forEach((a, i) => {
      req(a && typeof a.path === 'string' && a.path.length > 0 && !a.path.startsWith('/') && !a.path.includes('\\') && !a.path.split('/').includes('..'), `artifacts[${i}].path must be relative POSIX`);
      req(a && Number.isSafeInteger(a.bytes) && a.bytes >= 0, `artifacts[${i}].bytes invalid`);
      req(a && SHA256_RE.test(a.sha256 || ''), `artifacts[${i}].sha256 invalid`);
    });
    if (errors.length === 0) {
      const sorted = [...m.artifacts].sort((a, b) => comparePaths(a.path, b.path)).map((a) => a.path);
      req(sorted.every((p, i) => p === m.artifacts[i].path), 'artifacts must be sorted by path');
      try {
        req(computeContentHash(m.artifacts) === m.content_hash, 'content_hash does not match artifacts');
      } catch (err) {
        errors.push(err.message);
      }
    }
  }
  req(m.protocol_hash === null || SHA256_RE.test(m.protocol_hash), 'protocol_hash must be sha256 or null');
  req(typeof m.created_at === 'string' && !Number.isNaN(Date.parse(m.created_at)), 'created_at must be ISO date');
  req(Array.isArray(m.signatures), 'signatures must be an array');
  return errors;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

module.exports = {
  SCHEMA_VERSION,
  MANIFEST_FILENAME,
  POLICY_BUILD_ID_RE,
  UGC_BUILD_ID_RE,
  sha256Hex,
  sha256File,
  comparePaths,
  listFiles,
  collectArtifacts,
  computeContentHash,
  computeSourceHash,
  slugify,
  resolveSourceRevision,
  deriveEngineLock,
  classifyBuildId,
  computeInputHash,
  resolveBuildId,
  readGodotVersion,
  resolveTemplatePath,
  buildManifest,
  validateManifest,
  parseArgs,
  toPosix,
};

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project || !args.output) {
    console.error('Usage: node forge/Tools/build-export/build-manifest.cjs --project <godot project dir> --output <export output dir> [--godot <bin>] [--project-id <id>] [--preset Web] [--platform Web] [--mode release|pack] [--build-id <policy id | 16-hex UGC id>] [--write]');
    process.exit(2);
  }
  const manifest = buildManifest({
    projectDir: args.project,
    outputDir: args.output,
    projectId: typeof args['project-id'] === 'string' ? args['project-id'] : null,
    preset: typeof args.preset === 'string' ? args.preset : 'Web',
    platform: typeof args.platform === 'string' ? args.platform : 'Web',
    mode: typeof args.mode === 'string' ? args.mode : 'release',
    godotBin: typeof args.godot === 'string' ? args.godot : null,
    buildId: typeof args['build-id'] === 'string' ? args['build-id'] : null,
  });
  const errors = validateManifest(manifest);
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  const text = JSON.stringify(manifest, null, 2) + '\n';
  if (args.write) fs.writeFileSync(path.join(args.output, MANIFEST_FILENAME), text);
  process.stdout.write(text);
}
