'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PlatformStore } = require('./platform-store.cjs');
const { createPlatformApi } = require('./platform-api.cjs');
const { OwnedBuildPackages } = require('./owned-build-packages.cjs');
const { DriveSnapshotStore } = require('./drive-snapshot-store.cjs');
const { SubmissionDriveArchive } = require('./submission-drive-archive.cjs');
const { ProjectDriveSync } = require('./project-drive-sync.cjs');
const { createOperatorOAuthToken } = require('./operator-oauth-token.cjs');
const { createExecutionPolicy } = require('./execution-allowlist.cjs');

const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_IDEMPOTENCY_ENTRIES = 1024;
const MAX_IDEMPOTENCY_ENTRY_BYTES = 256 * 1024;
const MAX_IDEMPOTENCY_TOTAL_BYTES = 16 * 1024 * 1024;
const ACCOUNT_KEY_RE = /^[a-f0-9]{64}$/;
const PROJECT_ID_RE = /^[a-f0-9]{24}$/;
const RELEASE_ID_RE = /^[a-f0-9]{24}$/;
const BUILD_ID_RE = /^[a-f0-9]{16}$/;
const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,128}$/;

function maxBodyBytesForInternalRoute(rest) {
  const subpath = rest.startsWith('/platform/') ? rest.slice('/platform'.length) : (rest === '/platform' ? '/' : rest);
  if (/^\/projects\/[a-f0-9]{24}\/activity$/.test(subpath)) return 4096;
  if (/^\/projects\/[a-f0-9]{24}\/session$/.test(subpath)) return 256 * 1024;
  if (/^\/projects\/[a-f0-9]{24}\/remote$/.test(subpath)) return 512 * 1024;
  if (/^\/projects\/[a-f0-9]{24}\/(?:builds|deployments\/[a-f0-9]{24}|submissions\/[a-f0-9]{24}|cloud(?:\/retry\/[1-9][0-9]*)?)$/.test(subpath)) {
    return 64 * 1024;
  }
  return MAX_BODY_BYTES;
}

const fail = (status, code) => Object.assign(new Error(code), { status, code });

function safeStat(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isSymbolicLink() ? null : stat;
  } catch {
    return null;
  }
}

function safeReadJson(filename, maxBytes = 512 * 1024) {
  const stat = safeStat(filename);
  if (!stat || !stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null;
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function safeReadDir(directory) {
  const stat = safeStat(directory);
  if (!stat || !stat.isDirectory()) return [];
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

function resolveForgeRoot(root) {
  if (!root) return path.resolve(__dirname, '..');
  const resolved = path.resolve(root);
  if (safeStat(path.join(resolved, 'Templates')) && safeStat(path.join(resolved, 'server.cjs'))) {
    return resolved;
  }
  return path.join(resolved, 'forge');
}

function inspectForgeTemplates(root) {
  const forgeRoot = resolveForgeRoot(root);
  const templatesDir = path.join(forgeRoot, 'Templates');
  const templates = [];
  for (const folder of safeReadDir(templatesDir).sort()) {
    const dir = path.join(templatesDir, folder);
    const meta = safeReadJson(path.join(dir, 'metadata.json'), 131072);
    if (!meta || typeof meta !== 'object') continue;
    templates.push({
      id: typeof meta.id === 'string' ? meta.id : folder,
      name: typeof meta.name === 'string' ? meta.name : folder,
      description: typeof meta.description === 'string' ? meta.description : '',
      dimension: typeof meta.dimension === 'string' ? meta.dimension : 'unknown',
      assetCount: Array.isArray(meta.assetPaths) ? meta.assetPaths.length : 0,
      guideSteps: Array.isArray(meta.guideOrder) ? meta.guideOrder.length : 0,
      hasGuide: Boolean(meta.guide || safeStat(path.join(dir, 'README.md'))),
      hasShowcase: Boolean(safeStat(path.join(dir, 'showcase.json')))
    });
  }
  return templates;
}

function inspectForgeProjects(forgeDir, explicitAccountsDir = null) {
  const accountsDir = explicitAccountsDir || (forgeDir ? path.join(forgeDir, 'accounts') : null);
  if (!accountsDir) return [];
  const projects = [];
  for (const accountFolder of safeReadDir(accountsDir).slice(0, 50)) {
    const accountRoot = path.join(accountsDir, accountFolder);
    const projectsDir = path.join(accountRoot, 'projects');
    for (const entry of safeReadDir(projectsDir).slice(0, 50)) {
      const candidatePath = path.join(projectsDir, entry);
      const jsonPath = entry.endsWith('.json') ? candidatePath : path.join(candidatePath, 'project.json');
      const data = safeReadJson(jsonPath, 2 * 1024 * 1024);
      if (!data || typeof data !== 'object' || typeof data.id !== 'string') continue;
      const templateId = typeof data.template === 'string'
        ? data.template
        : (typeof data.templateId === 'string' ? data.templateId : null);
      projects.push({
        ownerKeyPrefix: accountFolder.slice(0, 12),
        projectId: data.id,
        name: typeof data.name === 'string' ? data.name : data.id,
        templateId,
        revision: Number.isSafeInteger(data.revision) ? data.revision : 0,
        releaseCount: Array.isArray(data.releases) ? data.releases.length : 0,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null
      });
      if (projects.length >= 100) return projects;
    }
  }
  projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return projects;
}

function inspectForgeBuilds(forgeDir, root, explicitBuildDir = null) {
  const forgeRoot = resolveForgeRoot(root);
  const roots = [];
  if (forgeDir) roots.push({ source: 'hub-owned', dir: path.join(forgeDir, 'builds') });
  if (explicitBuildDir) roots.push({ source: 'forge-queue', dir: explicitBuildDir });
  roots.push({ source: 'local-forge', dir: path.join(forgeRoot, 'Saved', 'Builds') });
  const builds = [];
  const seenDirs = new Set();
  for (const { source, dir } of roots) {
    const resolvedDir = path.resolve(dir);
    if (seenDirs.has(resolvedDir)) continue;
    seenDirs.add(resolvedDir);
    for (const entry of safeReadDir(resolvedDir).slice(0, 50)) {
      const entryDir = path.join(resolvedDir, entry);
      const directResult = safeReadJson(path.join(entryDir, 'result.json'), 262144);
      if (directResult && typeof directResult === 'object') {
        builds.push(formatBuildSummary(directResult, entry, source));
        continue;
      }
      if (ACCOUNT_KEY_RE.test(entry)) {
        for (const buildId of safeReadDir(entryDir).slice(0, 50)) {
          const nestedResult = safeReadJson(path.join(entryDir, buildId, 'result.json'), 262144);
          if (nestedResult && typeof nestedResult === 'object') {
            builds.push(formatBuildSummary(nestedResult, buildId, source));
          }
        }
      }
    }
  }
  builds.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return builds.slice(0, 40);
}

function formatBuildSummary(result, fallbackId, source) {
  return {
    id: typeof result.id === 'string' ? result.id : fallbackId,
    source,
    projectId: typeof result.projectId === 'string' ? result.projectId : null,
    revision: Number.isSafeInteger(result.revision) ? result.revision : null,
    target: typeof result.target === 'string' ? result.target : 'web',
    status: typeof result.status === 'string' ? result.status : 'unknown',
    createdAt: typeof result.createdAt === 'string' ? result.createdAt : null,
    startedAt: typeof result.startedAt === 'string' ? result.startedAt : null,
    finishedAt: typeof result.finishedAt === 'string' ? result.finishedAt : null,
    fileCount: Array.isArray(result.files) ? result.files.length : 0,
    error: typeof result.error === 'string' ? result.error.slice(0, 240) : null
  };
}

function inspectDriveManifests(forgeDir) {
  const collectJsonDocs = (dir, depth = 0) => {
    if (!dir || depth > 3) return [];
    const docs = [];
    for (const entry of safeReadDir(dir).slice(0, 200)) {
      const full = path.join(dir, entry);
      if (entry.endsWith('.json')) {
        const doc = safeReadJson(full, 262144);
        if (doc && typeof doc === 'object') docs.push(doc);
      } else if (depth < 3 && safeStat(full)?.isDirectory()) {
        docs.push(...collectJsonDocs(full, depth + 1));
      }
    }
    return docs;
  };
  const summarize = folder => {
    const summary = { total: 0, committed: 0, verified: 0, pending: 0, failed: 0 };
    if (!forgeDir) return summary;
    const docs = collectJsonDocs(path.join(forgeDir, folder));
    for (const doc of docs) {
      const rows = Array.isArray(doc.versions) ? doc.versions : [doc];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        summary.total++;
        const state = row.state || row.status;
        if (state === 'committed' || row.cloudCommitted === true) summary.committed++;
        if (row.cloudVerified === true || state === 'committed') summary.verified++;
        if (state === 'pending' || state === 'reserved' || state === 'uploading') summary.pending++;
        if (state === 'failed') summary.failed++;
      }
    }
    return summary;
  };
  return {
    snapshots: summarize('cloud-manifests'),
    submissions: summarize('submission-manifests'),
    deployments: summarize('deployment-manifests')
  };
}

async function readRawBody(req, maxBytes = MAX_BODY_BYTES) {
  if (Number(req.headers['content-length']) > maxBytes) {
    throw fail(413, 'Request too large');
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let rejected = false;
    req.on('data', chunk => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        rejected = true;
        chunks.length = 0;
        reject(fail(413, 'Request too large'));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    });
    req.once('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.once('error', reject);
  });
}

function createInternalApi(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const forgeRoot = resolveForgeRoot(options.root);
  const platformRoot = path.dirname(forgeRoot);
  const internalSecret = String(options.internalSecret ?? env.PLAYHUB_FORGE_INTERNAL_SECRET ?? '');
  const previousInternalSecret = String(options.previousInternalSecret ?? env.PLAYHUB_FORGE_INTERNAL_SECRET_PREVIOUS ?? '');
  if (previousInternalSecret && previousInternalSecret.length < 32) {
    throw new Error('PLAYHUB_FORGE_INTERNAL_SECRET_PREVIOUS must be at least 32 characters when set');
  }
  const secretConfigured = internalSecret.length >= 32;

  const storageDir = options.directory
    ? path.resolve(options.directory)
    : (options.accountsDirectory ? path.dirname(path.resolve(options.accountsDirectory)) : null);
  const accountsDir = options.accountsDirectory
    ? path.resolve(options.accountsDirectory)
    : (storageDir ? path.join(storageDir, 'accounts') : path.join(forgeRoot, 'Saved', 'HubAccounts'));
  const buildsEnabled = options.builds?.enabled === true || options.buildsEnabled === true;
  const executionPolicy = options.executionPolicy || createExecutionPolicy(options.executionAllowlist ?? env.PLAYHUB_FORGE_EXECUTION_ALLOWLIST);
  const executionAllowed = typeof options.executionAllowed === 'function'
    ? options.executionAllowed
    : key => executionPolicy.allows(key);

  const ownsBuilds = !options.accountBuilds;
  const builds = options.accountBuilds || new OwnedBuildPackages({
    root: forgeRoot,
    directory: storageDir || path.dirname(accountsDir),
    enabled: buildsEnabled
  });

  let oauth = null;
  let sync = null;
  let submissions = null;
  let deployments = null;
  const syncErrors = new Map();

  if (options.drive?.enabled === true && storageDir) {
    oauth = createOperatorOAuthToken({
      enabled: true,
      fetchImpl,
      secretsProvider: () => ({
        clientId: env.PLAYHUB_DRIVE_CLIENT_ID,
        clientSecret: env.PLAYHUB_DRIVE_CLIENT_SECRET,
        refreshToken: env.PLAYHUB_DRIVE_REFRESH_TOKEN
      })
    });
    const drive = new DriveSnapshotStore({
      enabled: true,
      folderId: options.drive.folderId,
      getAccessToken: oauth.getAccessToken,
      fetchImpl
    });
    sync = new ProjectDriveSync({
      enabled: true,
      directory: path.resolve(storageDir, 'cloud-manifests'),
      drive
    });
    if (options.packages?.enabled === true) {
      if (!options.drive.packageFolderId || options.drive.packageFolderId === options.drive.folderId) {
        throw fail(503, 'SEPARATE_PACKAGE_FOLDER_REQUIRED');
      }
      const { DeploymentZipArchive } = require('./deployment-zip-archive.cjs');
      const { DriveZipStore } = require('./drive-zip-store.cjs');
      const packageDrive = new DriveZipStore({
        enabled: true,
        folderId: options.drive.packageFolderId,
        getAccessToken: oauth.getAccessToken,
        fetchImpl
      });
      deployments = new DeploymentZipArchive({
        enabled: true,
        directory: path.resolve(storageDir, 'deployment-manifests'),
        drive: packageDrive,
        resolveOwnedPackage: (key, id, releaseId) => builds.resolve(key, id, releaseId)
      });
    }
    submissions = new SubmissionDriveArchive({
      enabled: true,
      directory: path.resolve(storageDir, 'submission-manifests'),
      drive,
      resolveOwnedRelease: (key, projectId, releaseId) => {
        const project = getEntry(key).store.read(projectId);
        const release = project.releases.find(r => r.id === releaseId);
        if (!release) throw fail(404, 'RELEASE_NOT_FOUND');
        return { accountKey: key, projectId, releaseId, revision: release.revision, files: release.files };
      }
    });
  }

  const localEntries = new Map();
  const disposers = [];
  const attachedStores = new WeakSet();

  function attachStoreSync(key, store) {
    if (!sync || attachedStores.has(store)) return;
    attachedStores.add(store);
    const dispose = sync.attachStore(key, store, {
      onError: e => syncErrors.set(`${key}:${e.projectId}`, 'CLOUD_SYNC_FAILED')
    });
    if (typeof dispose === 'function') disposers.push(dispose);
  }

  function getEntry(accountKey) {
    if (typeof options.getPlatformFor === 'function') {
      const entry = options.getPlatformFor(accountKey);
      attachStoreSync(accountKey, entry.store);
      return entry;
    }
    let entry = localEntries.get(accountKey);
    if (!entry) {
      if (localEntries.size >= 1024) throw fail(503, 'ACCOUNT_CAPACITY_REACHED');
      const store = new PlatformStore(forgeRoot, path.join(accountsDir, accountKey));
      attachStoreSync(accountKey, store);
      const api = createPlatformApi(store, {
        buildMode: options.buildMode,
        validateBuild: (buildId, projectId, revision) => {
          try {
            return builds.validateDetailed ? builds.validateDetailed(accountKey, buildId, projectId, revision) : builds.validate(accountKey, buildId, projectId, revision);
          } catch {
            return null;
          }
        }
      });
      entry = { store, api };
      localEntries.set(accountKey, entry);
    }
    return entry;
  }

  function secretMatches(provided) {
    if (!secretConfigured || typeof provided !== 'string' || !provided) return false;
    const buf = Buffer.from(provided, 'utf8');
    const cur = Buffer.from(internalSecret, 'utf8');
    if (buf.length === cur.length && crypto.timingSafeEqual(buf, cur)) return true;
    if (previousInternalSecret.length >= 32) {
      const prev = Buffer.from(previousInternalSecret, 'utf8');
      if (buf.length === prev.length && crypto.timingSafeEqual(buf, prev)) return true;
    }
    return false;
  }

  const publicRow = ({ revision, state, bytes, sha256, attempts, lastError }) => ({
    revision, state, bytes, sha256, attempts, lastError
  });

  const maxIdempotencyEntries = Number.isInteger(options.maxIdempotencyEntries) && options.maxIdempotencyEntries > 0
    ? options.maxIdempotencyEntries
    : MAX_IDEMPOTENCY_ENTRIES;
  const maxIdempotencyEntryBytes = Number.isInteger(options.maxIdempotencyEntryBytes) && options.maxIdempotencyEntryBytes > 0
    ? options.maxIdempotencyEntryBytes
    : MAX_IDEMPOTENCY_ENTRY_BYTES;
  const maxIdempotencyTotalBytes = Number.isInteger(options.maxIdempotencyTotalBytes) && options.maxIdempotencyTotalBytes > 0
    ? options.maxIdempotencyTotalBytes
    : MAX_IDEMPOTENCY_TOTAL_BYTES;
  const idempotencyCache = new Map();
  let idempotencyTotalBytes = 0;

  function evictOldestCompletedIdempotency(excludeKey = null) {
    for (const [key, entry] of idempotencyCache) {
      if (key === excludeKey || entry.inFlight) continue;
      idempotencyCache.delete(key);
      idempotencyTotalBytes = Math.max(0, idempotencyTotalBytes - (entry.bytes || 0));
      return true;
    }
    return false;
  }

  function sendJson(res, status, body, extraHeaders = {}) {
    if (res.writableEnded) return;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...extraHeaders
    });
    res.end(JSON.stringify(body));
  }

  function adminSnapshot() {
    return {
      templates: inspectForgeTemplates(forgeRoot),
      projects: inspectForgeProjects(storageDir, accountsDir),
      builds: inspectForgeBuilds(storageDir, forgeRoot, options.buildDirectory || null),
      driveSync: inspectDriveManifests(storageDir),
      serverPresent: Boolean(safeStat(path.join(forgeRoot, 'server.cjs'))),
      officialEditorPresent: Boolean(safeStat(path.join(forgeRoot, 'OfficialGodot', 'index.html')))
    };
  }

  function resolveTemplateBuild(template, projectId, buildId, accountKey = null) {
    if (!['brawllabs', 'fortress-war', 'tappy-chicken-mmo', 'captain-forever-mmo'].includes(template)) return null;
    if (!PROJECT_ID_RE.test(projectId) || !BUILD_ID_RE.test(buildId)) return null;
    if (typeof options.validateTemplateBuild === 'function') {
      const checked = options.validateTemplateBuild(template)(buildId, projectId, accountKey);
      if (!checked) return null;
      return {
        id: checked.id || buildId,
        buildId: checked.id || buildId,
        projectId: checked.projectId || projectId,
        revision: checked.revision,
        status: checked.status || 'succeeded',
        target: checked.target || 'web',
        previewUrl: typeof checked.previewUrl === 'string' ? checked.previewUrl : `/api/builds/${buildId}/files/index.html`
      };
    }
    if (!accountKey || !ACCOUNT_KEY_RE.test(accountKey)) return null;
    try {
      const project = getEntry(accountKey).store.getProject(projectId);
      if (project.template !== template) return null;
      const job = builds.job(accountKey, projectId, buildId);
      if (!job || job.status !== 'succeeded' || job.projectId !== projectId) return null;
      return {
        id: job.id,
        buildId: job.id,
        projectId: job.projectId,
        revision: job.revision,
        status: 'succeeded',
        target: job.target || 'web',
        previewUrl: typeof job.previewUrl === 'string' ? job.previewUrl : `/api/builds/${job.id}/files/index.html`
      };
    } catch {
      return null;
    }
  }

  async function dispatchInternal(req, res, parsedUrl, accountKey, rest, providedBody) {
    const subpath = rest.startsWith('/platform/') ? rest.slice('/platform'.length) : (rest === '/platform' ? '/' : rest);
    const method = req.method || 'GET';

    // 0. Template build validation for separated multiplayer server (P6)
    const tplBuildMatch = subpath.match(/^\/template-builds\/([a-z0-9-]{1,40})\/([a-f0-9]{24})\/([a-f0-9]{16})$/);
    if (tplBuildMatch) {
      if (method !== 'GET') return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }), true;
      const build = resolveTemplateBuild(tplBuildMatch[1], tplBuildMatch[2], tplBuildMatch[3], accountKey);
      if (!build) return sendJson(res, 404, { ok: false, error: 'BUILD_NOT_FOUND' }), true;
      return sendJson(res, 200, { ok: true, build }), true;
    }

    // 1a. Verified release package binary stream: GET .../projects/{pid}/releases/{rid}/package
    const releasePkgMatch = subpath.match(/^\/projects\/([a-f0-9]{24})\/releases\/([a-f0-9]{24})\/package$/);
    if (releasePkgMatch) {
      if (method !== 'GET') return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }), true;
      let resolved;
      try {
        resolved = builds.resolveWithMetadata(accountKey, releasePkgMatch[1], releasePkgMatch[2]);
      } catch (err) {
        const status = Number.isSafeInteger(err?.status) ? err.status : 404;
        return sendJson(res, status, { ok: false, error: err?.code || 'RELEASE_PACKAGE_UNAVAILABLE' }), true;
      }
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': resolved.bytes.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Artifact-Sha256': resolved.sha256,
        'X-Release-Id': resolved.release.id,
        'X-Release-Revision': String(resolved.release.revision),
        'X-Build-Id': resolved.job.id
      });
      res.end(resolved.bytes);
      return true;
    }

    // 1. Direct single-release read: GET .../projects/{pid}/releases/{rid}
    const releaseMatch = subpath.match(/^\/projects\/([a-f0-9]{24})\/releases\/([a-f0-9]{24})$/);
    if (releaseMatch) {
      if (method !== 'GET') return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' }), true;
      let project;
      try {
        project = getEntry(accountKey).store.read(releaseMatch[1]);
      } catch {
        return sendJson(res, 404, { ok: false, error: 'RELEASE_NOT_FOUND' }), true;
      }
      const release = Array.isArray(project.releases)
        ? project.releases.find(candidate => candidate.id === releaseMatch[2])
        : null;
      if (!release) return sendJson(res, 404, { ok: false, error: 'RELEASE_NOT_FOUND' }), true;
      return sendJson(res, 200, { ok: true, release }), true;
    }

    // 2. Builds: POST .../projects/{pid}/builds, GET .../projects/{pid}/builds/{bid}
    const buildMatch = subpath.match(/^\/projects\/([a-f0-9]{24})\/builds(?:\/([a-f0-9]{16}))?$/);
    if (buildMatch) {
      const project = getEntry(accountKey).store.getProject(buildMatch[1]);
      if (method === 'POST' && !buildMatch[2]) {
        if (!buildsEnabled) throw fail(503, 'PRIVATE_BUILDS_DISABLED');
        if (!executionAllowed(accountKey)) throw fail(403, 'EXECUTION_NOT_ALLOWED');
        const job = builds.enqueueJob ? builds.publicJob(builds.enqueueJob(accountKey, project.id, project.revision)) : builds.enqueue(accountKey, project.id, project.revision);
        return sendJson(res, 202, { build: job }), true;
      }
      if (method === 'GET' && buildMatch[2]) {
        const job = builds.job(accountKey, project.id, buildMatch[2]);
        return sendJson(res, 200, { build: builds.publicJob(job) }), true;
      }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }

    // 3. Deployment ZIP archive: POST/GET .../projects/{pid}/deployments/{rid}
    const deploymentMatch = subpath.match(/^\/projects\/([a-f0-9]{24})\/deployments\/([a-f0-9]{24})$/);
    if (deploymentMatch) {
      if (!deployments) throw fail(503, 'DEPLOYMENT_ARCHIVE_DISABLED');
      const input = { accountKey, projectId: deploymentMatch[1], releaseId: deploymentMatch[2] };
      if (method === 'POST') return sendJson(res, 200, await deployments.archive(input)), true;
      if (method === 'GET') return sendJson(res, 200, await deployments.status(input)), true;
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }

    // 4. Submission Drive archive: POST/GET .../projects/{pid}/submissions/{rid}
    const submissionMatch = subpath.match(/^\/projects\/([a-f0-9]{24})\/submissions\/([a-f0-9]{24})$/);
    if (submissionMatch) {
      if (!submissions) throw fail(503, 'CLOUD_SYNC_DISABLED');
      const input = { accountKey, projectId: submissionMatch[1], releaseId: submissionMatch[2] };
      if (method === 'POST') return sendJson(res, 200, await submissions.archive(input)), true;
      if (method === 'GET') return sendJson(res, 200, await submissions.status(input)), true;
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }

    // 5. Cloud snapshot sync: GET/POST .../projects/{pid}/cloud[/history|/retry/{n}]
    const cloudMatch = subpath.match(/^\/projects\/([a-f0-9]{24})\/cloud(?:\/(history|retry\/([1-9][0-9]*)))?$/);
    if (cloudMatch) {
      if (!sync) throw fail(503, 'CLOUD_SYNC_DISABLED');
      const store = getEntry(accountKey).store;
      store.getProject(cloudMatch[1]);
      if (method === 'GET' && cloudMatch[2] === 'history') {
        return sendJson(res, 200, {
          versions: sync.listVersions(accountKey, cloudMatch[1]).map(publicRow),
          lastSyncError: syncErrors.get(`${accountKey}:${cloudMatch[1]}`) || null
        }), true;
      }
      if (method === 'POST' && (!cloudMatch[2] || cloudMatch[3])) {
        const row = cloudMatch[3]
          ? await sync.retryVersion(accountKey, cloudMatch[1], Number(cloudMatch[3]))
          : await sync.syncProject(store, accountKey, cloudMatch[1]);
        return sendJson(res, 200, { version: publicRow(row), cloudCommitted: row.state === 'committed' }), true;
      }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }

    // 6. Standard Platform API proxy: ANY /internal/v1/accounts/{accountKey}/platform/*
    if (rest.startsWith('/platform/')) {
      const targetUrl = new URL(`/api${rest}${parsedUrl.search}`, 'http://localhost');
      const handled = await getEntry(accountKey).api(req, res, targetUrl, providedBody);
      if (!handled) sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
      return true;
    }

    sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
    return true;
  }

  async function handle(req, res, inputUrl) {
    const parsedUrl = inputUrl instanceof URL ? inputUrl : new URL(String(inputUrl || req.url || '/'), 'http://localhost');
    const pathname = parsedUrl.pathname;
    if (pathname !== '/internal/v1' && !pathname.startsWith('/internal/v1/')) return false;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');

    if (!secretConfigured) {
      sendJson(res, 503, { ok: false, error: 'INTERNAL_API_DISABLED' });
      return true;
    }
    if (req.headers.origin !== undefined) {
      sendJson(res, 403, { ok: false, error: 'ORIGIN_NOT_ALLOWED' });
      return true;
    }
    if (!secretMatches(req.headers['x-playhub-internal-secret'])) {
      sendJson(res, 403, { ok: false, error: 'INTERNAL_SECRET_INVALID' });
      return true;
    }

    if (pathname === '/internal/v1/admin/snapshot') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
        return true;
      }
      sendJson(res, 200, adminSnapshot());
      return true;
    }

    const standaloneTplMatch = pathname.match(/^\/internal\/v1\/template-builds\/([a-z0-9-]{1,40})\/([a-f0-9]{24})\/([a-f0-9]{16})$/);
    if (standaloneTplMatch) {
      if (req.method !== 'GET') {
        sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
        return true;
      }
      const build = resolveTemplateBuild(standaloneTplMatch[1], standaloneTplMatch[2], standaloneTplMatch[3], null);
      if (!build) {
        sendJson(res, 404, { ok: false, error: 'BUILD_NOT_FOUND' });
        return true;
      }
      sendJson(res, 200, { ok: true, build });
      return true;
    }

    const accountMatch = pathname.match(/^\/internal\/v1\/accounts\/([^/]+)(\/.*)?$/);
    if (!accountMatch) {
      sendJson(res, 404, { ok: false, error: 'NOT_FOUND' });
      return true;
    }
    const [, accountKey, rest = ''] = accountMatch;
    if (!ACCOUNT_KEY_RE.test(accountKey) || !rest) {
      sendJson(res, 400, { ok: false, error: 'INVALID_ACCOUNT_KEY' });
      return true;
    }

    const rawIdempotencyKey = req.headers['idempotency-key'];
    let providedBody;
    let idempotencyScope = null;
    let idempotencyReservation = null;
    let bodyHash = null;

    if (rawIdempotencyKey !== undefined) {
      if (typeof rawIdempotencyKey !== 'string' || !IDEMPOTENCY_KEY_RE.test(rawIdempotencyKey)) {
        sendJson(res, 400, { ok: false, error: 'INVALID_IDEMPOTENCY_KEY' });
        return true;
      }
      if (req.method === 'POST') {
        const routeMaxBytes = maxBodyBytesForInternalRoute(rest);
        let rawBytes;
        try {
          rawBytes = await readRawBody(req, routeMaxBytes);
        } catch (err) {
          sendJson(res, err.status || 413, { ok: false, error: err.code || err.message || 'PAYLOAD_TOO_LARGE' });
          return true;
        }
        bodyHash = crypto.createHash('sha256').update(rawBytes).digest('hex');
        if (rawBytes.length > 0) {
          if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) {
            sendJson(res, 415, { ok: false, error: 'JSON required' });
            return true;
          }
          let parsed;
          try {
            parsed = JSON.parse(rawBytes.toString('utf8'));
          } catch {
            sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
            return true;
          }
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            sendJson(res, 400, { ok: false, error: 'Expected an object' });
            return true;
          }
        }
        providedBody = rawBytes;
        idempotencyScope = `${accountKey}:${req.method}:${pathname}:${rawIdempotencyKey}`;
        const existing = idempotencyCache.get(idempotencyScope);
        if (existing) {
          if (existing.bodyHash !== bodyHash) {
            sendJson(res, 409, { ok: false, error: 'IDEMPOTENCY_KEY_CONFLICT' });
            return true;
          }
          if (existing.inFlight) {
            sendJson(res, 409, { ok: false, error: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
            return true;
          }
          if (existing.response) {
            idempotencyCache.delete(idempotencyScope);
            idempotencyCache.set(idempotencyScope, existing);
            res.writeHead(existing.response.status, {
              'Content-Type': existing.response.contentType || 'application/json; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer',
              'X-Idempotent-Replay': 'true'
            });
            res.end(existing.response.body);
            return true;
          }
        }
        while (idempotencyCache.size >= maxIdempotencyEntries) {
          if (!evictOldestCompletedIdempotency()) {
            sendJson(res, 503, { ok: false, error: 'IDEMPOTENCY_CAPACITY_REACHED' });
            return true;
          }
        }
        idempotencyReservation = { bodyHash, inFlight: true, bytes: 0, response: null };
        idempotencyCache.set(idempotencyScope, idempotencyReservation);
      }
    }

    let capturedStatus = 200;
    let capturedContentType = 'application/json; charset=utf-8';
    const capturedChunks = [];
    let capturedBytes = 0;
    let captureOverflow = false;
    let idempotencyFinalized = false;

    const finalizeIdempotency = (abort = false) => {
      if (!idempotencyScope || idempotencyFinalized) return;
      idempotencyFinalized = true;
      if (idempotencyCache.get(idempotencyScope) !== idempotencyReservation) return;
      if (!abort && capturedStatus >= 200 && capturedStatus < 300 && !captureOverflow) {
        const bodyBuf = Buffer.concat(capturedChunks);
        const entryBytes = bodyBuf.length;
        if (entryBytes <= maxIdempotencyEntryBytes && entryBytes <= maxIdempotencyTotalBytes) {
          while (idempotencyTotalBytes + entryBytes > maxIdempotencyTotalBytes || idempotencyCache.size > maxIdempotencyEntries) {
            if (!evictOldestCompletedIdempotency(idempotencyScope)) break;
          }
          if (idempotencyTotalBytes + entryBytes <= maxIdempotencyTotalBytes && idempotencyCache.size <= maxIdempotencyEntries) {
            idempotencyCache.delete(idempotencyScope);
            idempotencyCache.set(idempotencyScope, {
              bodyHash,
              inFlight: false,
              bytes: entryBytes,
              response: {
                status: capturedStatus,
                contentType: capturedContentType,
                body: bodyBuf
              }
            });
            idempotencyTotalBytes += entryBytes;
            return;
          }
        }
      }
      idempotencyCache.delete(idempotencyScope);
    };

    const appendCapturedChunk = (chunk, encoding) => {
      if (captureOverflow || chunk === undefined || chunk === null) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
      capturedBytes += buf.length;
      if (capturedBytes > maxIdempotencyEntryBytes || capturedBytes > maxIdempotencyTotalBytes) {
        captureOverflow = true;
        capturedChunks.length = 0;
        return;
      }
      capturedChunks.push(buf);
    };

    if (idempotencyScope) {
      const origWriteHead = res.writeHead.bind(res);
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);
      res.writeHead = (...args) => {
        capturedStatus = args[0];
        const hdrs = typeof args[1] === 'object' && args[1] !== null ? args[1] : args[2];
        if (hdrs && typeof hdrs === 'object') {
          for (const [k, v] of Object.entries(hdrs)) {
            if (k.toLowerCase() === 'content-type') capturedContentType = String(v);
          }
        }
        return origWriteHead(...args);
      };
      res.write = (chunk, encoding, cb) => {
        appendCapturedChunk(chunk, encoding);
        return origWrite(chunk, encoding, cb);
      };
      res.end = (chunk, encoding, cb) => {
        appendCapturedChunk(chunk, encoding);
        finalizeIdempotency(false);
        return origEnd(chunk, encoding, cb);
      };
    }

    try {
      await dispatchInternal(req, res, parsedUrl, accountKey, rest, providedBody);
    } catch (err) {
      const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 503;
      const code = typeof err?.code === 'string' ? err.code : (typeof err?.message === 'string' ? err.message : 'INTERNAL_ERROR');
      sendJson(res, status, { ok: false, error: code });
    } finally {
      finalizeIdempotency(true);
    }
    return true;
  }

  function close() {
    for (const entry of localEntries.values()) entry.api.close();
    localEntries.clear();
    for (const dispose of disposers) {
      try { dispose(); } catch {}
    }
    disposers.length = 0;
    if (ownsBuilds) builds.close();
    oauth?.close();
    idempotencyCache.clear();
    idempotencyTotalBytes = 0;
  }

  return {
    handle,
    adminSnapshot,
    attachStoreSync,
    close
  };
}

module.exports = {
  createInternalApi,
  inspectForgeTemplates,
  inspectForgeProjects,
  inspectForgeBuilds,
  inspectDriveManifests,
  ACCOUNT_KEY_RE,
  PROJECT_ID_RE,
  RELEASE_ID_RE,
  BUILD_ID_RE
};
