// ForgeGateway: the only place in hub/server that touches Forge code or Forge's disk.
// See docs/architecture/hub-forge-internal-api-design.md (S2–S4).
// - "local" gateway runs Forge's modules in this process.
// - "remote" gateway calls Forge's /internal/v1/* over HTTP(S) with X-PlayHub-Internal-Secret.
// Both expose the same interface:
//   handlePlatform(req, res, url, { accountKey, identity }) -> Promise<boolean>
//   getRelease(accountKey, projectId, releaseId) -> release | Promise<release>
//   enqueueBuild(accountKey, projectId, options) -> build | Promise<build>
//   getBuild(accountKey, projectId, buildId) -> build | Promise<build>
//   archiveDeployment(accountKey, projectId, releaseId) -> status | Promise<status>
//   deploymentStatus(accountKey, projectId, releaseId) -> status | Promise<status>
//   archiveSubmission(accountKey, projectId, releaseId) -> status | Promise<status>
//   submissionStatus(accountKey, projectId, releaseId) -> status | Promise<status>
//   cloudHistory(accountKey, projectId) -> history | Promise<history>
//   cloudSync(accountKey, projectId) -> version | Promise<version>
//   cloudRetry(accountKey, projectId, revision) -> version | Promise<version>
//   adminSnapshot() -> snapshot | Promise<snapshot>
//   close()
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const ACCOUNT_KEY_RE = /^[a-f0-9]{64}$/;
const PROJECT_ID_RE = /^[a-f0-9]{24}$/;
const RELEASE_ID_RE = /^[a-f0-9]{24}$/;
const BUILD_ID_RE = /^[a-f0-9]{16}$/;
const HUB_SPECIAL_SUBROUTE_RE = /^\/projects\/[a-f0-9]{24}\/(?:builds(?:\/[a-f0-9]{16})?|deployments\/[a-f0-9]{24}|submissions\/[a-f0-9]{24}|cloud(?:\/(?:history|retry\/[1-9][0-9]*))?)$/;

const fail = (status, code) => Object.assign(new Error(code), { status, code });
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

function safeStat(filename) {
  try {
    const stat = fs.lstatSync(filename);
    return stat.isSymbolicLink() ? null : stat;
  } catch {
    return null;
  }
}

function emptyAdminSnapshot() {
  const zero = () => ({ total: 0, committed: 0, verified: 0, pending: 0, failed: 0 });
  return {
    templates: [],
    projects: [],
    builds: [],
    driveSync: { snapshots: zero(), submissions: zero(), deployments: zero() },
    serverPresent: false,
    officialEditorPresent: false
  };
}

// ---- local platform (S2) ----
function createLocalPlatform({ config, root, env, fetchImpl }) {
  const { createAccountPlatformApi } = require('../../forge/Tools/account-platform-api.cjs');
  const { OwnedBuildPackages } = require('../../forge/Tools/owned-build-packages.cjs');
  const { PlatformStore } = require('../../forge/Tools/platform-store.cjs');
  const { DriveSnapshotStore } = require('../../forge/Tools/drive-snapshot-store.cjs');
  const { SubmissionDriveArchive } = require('../../forge/Tools/submission-drive-archive.cjs');
  const { ProjectDriveSync } = require('../../forge/Tools/project-drive-sync.cjs');
  const { createOperatorOAuthToken } = require('../../forge/Tools/operator-oauth-token.cjs');
  const { createExecutionPolicy } = require('../../forge/Tools/execution-allowlist.cjs');
  if (!path.isAbsolute(config.directory || '') || !path.isAbsolute(root || '')) throw fail(503, 'FORGE_CONFIGURATION_REQUIRED');
  const rel = path.relative(root, config.directory);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw fail(503, 'PRIVATE_STORAGE_MUST_BE_OUTSIDE_SOURCE');
  const builds = new OwnedBuildPackages({ root: path.resolve(root, 'forge'), directory: config.directory, enabled: config.builds?.enabled === true });
  // P0: Hub-side builds also run Godot on user projects; same fail-closed allowlist as Forge.
  const executionPolicy = createExecutionPolicy(config.executionAllowlist ?? env.PLAYHUB_FORGE_EXECUTION_ALLOWLIST);
  const directory = path.resolve(config.directory, 'accounts');
  const storeFor = key => new PlatformStore(root, path.resolve(directory, key));
  let oauth, sync, submissions, deployments;
  const errors = new Map();
  if (config.drive?.enabled === true) {
    oauth = createOperatorOAuthToken({
      enabled: true,
      fetchImpl,
      secretsProvider: () => ({
        clientId: env.PLAYHUB_DRIVE_CLIENT_ID,
        clientSecret: env.PLAYHUB_DRIVE_CLIENT_SECRET,
        refreshToken: env.PLAYHUB_DRIVE_REFRESH_TOKEN
      })
    });
    const drive = new DriveSnapshotStore({ enabled: true, folderId: config.drive.folderId, getAccessToken: oauth.getAccessToken, fetchImpl });
    sync = new ProjectDriveSync({ enabled: true, directory: path.resolve(config.directory, 'cloud-manifests'), drive });
    if (config.packages?.enabled === true) {
      if (!config.drive.packageFolderId || config.drive.packageFolderId === config.drive.folderId) throw fail(503, 'SEPARATE_PACKAGE_FOLDER_REQUIRED');
      const { DeploymentZipArchive } = require('../../forge/Tools/deployment-zip-archive.cjs');
      const { DriveZipStore } = require('../../forge/Tools/drive-zip-store.cjs');
      const packageDrive = new DriveZipStore({ enabled: true, folderId: config.drive.packageFolderId, getAccessToken: oauth.getAccessToken, fetchImpl });
      deployments = new DeploymentZipArchive({
        enabled: true,
        directory: path.resolve(config.directory, 'deployment-manifests'),
        drive: packageDrive,
        resolveOwnedPackage: (key, id, release) => builds.resolve(key, id, release)
      });
    }
    submissions = new SubmissionDriveArchive({
      enabled: true,
      directory: path.resolve(config.directory, 'submission-manifests'),
      drive,
      resolveOwnedRelease: (key, projectId, releaseId) => {
        const project = storeFor(key).read(projectId);
        const release = project.releases.find(r => r.id === releaseId);
        if (!release) throw fail(404, 'RELEASE_NOT_FOUND');
        return { accountKey: key, projectId, releaseId, revision: release.revision, files: release.files };
      }
    });
  }
  const identities = new WeakMap();
  const api = createAccountPlatformApi({
    root,
    directory,
    verifyIdentity: req => identities.get(req),
    validateBuildForAccount: (key, buildId, id, revision) => builds.validateDetailed ? builds.validateDetailed(key, buildId, id, revision) : builds.validate(key, buildId, id, revision),
    onStore: sync ? (key, store) => sync.attachStore(key, store, { onError: e => errors.set(key + ':' + e.projectId, 'CLOUD_SYNC_FAILED') }) : undefined
  });
  const publicRow = ({ revision, state, bytes, sha256, attempts, lastError }) => ({ revision, state, bytes, sha256, attempts, lastError });

  function enqueueBuild(key, projectId) {
    const project = storeFor(key).getProject(projectId);
    if (builds.enabled && !executionPolicy.allows(key)) throw fail(403, 'EXECUTION_NOT_ALLOWED');
    return builds.enqueue(key, project.id, project.revision);
  }

  function getBuild(key, projectId, buildId) {
    const project = storeFor(key).getProject(projectId);
    return builds.publicJob(builds.job(key, project.id, buildId));
  }

  async function archiveDeployment(key, projectId, releaseId) {
    if (!deployments) throw fail(503, 'DEPLOYMENT_ARCHIVE_DISABLED');
    return await deployments.archive({ accountKey: key, projectId, releaseId });
  }

  async function deploymentStatus(key, projectId, releaseId) {
    if (!deployments) throw fail(503, 'DEPLOYMENT_ARCHIVE_DISABLED');
    return await deployments.status({ accountKey: key, projectId, releaseId });
  }

  async function archiveSubmission(key, projectId, releaseId) {
    if (!submissions) throw fail(503, 'CLOUD_SYNC_DISABLED');
    return await submissions.archive({ accountKey: key, projectId, releaseId });
  }

  async function submissionStatus(key, projectId, releaseId) {
    if (!submissions) throw fail(503, 'CLOUD_SYNC_DISABLED');
    return await submissions.status({ accountKey: key, projectId, releaseId });
  }

  function cloudHistory(key, projectId) {
    if (!sync) throw fail(503, 'CLOUD_SYNC_DISABLED');
    storeFor(key).getProject(projectId);
    return {
      versions: sync.listVersions(key, projectId).map(publicRow),
      lastSyncError: errors.get(key + ':' + projectId) || null
    };
  }

  async function cloudSync(key, projectId) {
    if (!sync) throw fail(503, 'CLOUD_SYNC_DISABLED');
    const store = storeFor(key);
    store.getProject(projectId);
    const row = await sync.syncProject(store, key, projectId);
    return { version: publicRow(row), cloudCommitted: row.state === 'committed' };
  }

  async function cloudRetry(key, projectId, revision) {
    if (!sync) throw fail(503, 'CLOUD_SYNC_DISABLED');
    const store = storeFor(key);
    store.getProject(projectId);
    const row = await sync.retryVersion(key, projectId, Number(revision));
    return { version: publicRow(row), cloudCommitted: row.state === 'committed' };
  }

  async function handlePlatform(req, res, url, { accountKey: key, identity }) {
    if (!url.pathname.startsWith('/api/platform/')) return false;
    const buildRoute = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/builds(?:\/([a-f0-9]{16}))?$/);
    if (buildRoute) {
      if (req.method === 'POST' && !buildRoute[2]) { send(res, 202, { build: enqueueBuild(key, buildRoute[1]) }); return true; }
      if (req.method === 'GET' && buildRoute[2]) { send(res, 200, { build: getBuild(key, buildRoute[1], buildRoute[2]) }); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    const deployment = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/deployments\/([a-f0-9]{24})$/);
    if (deployment) {
      if (req.method === 'POST') { send(res, 200, await archiveDeployment(key, deployment[1], deployment[2])); return true; }
      if (req.method === 'GET') { send(res, 200, await deploymentStatus(key, deployment[1], deployment[2])); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    const submission = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/submissions\/([a-f0-9]{24})$/);
    if (submission) {
      if (req.method === 'POST') { send(res, 200, await archiveSubmission(key, submission[1], submission[2])); return true; }
      if (req.method === 'GET') { send(res, 200, await submissionStatus(key, submission[1], submission[2])); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    const cloud = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/cloud(?:\/(history|retry\/([1-9][0-9]*)))?$/);
    if (cloud) {
      if (req.method === 'GET' && cloud[2] === 'history') { send(res, 200, cloudHistory(key, cloud[1])); return true; }
      if (req.method === 'POST' && (!cloud[2] || cloud[3])) {
        const result = cloud[3] ? await cloudRetry(key, cloud[1], Number(cloud[3])) : await cloudSync(key, cloud[1]);
        send(res, 200, result);
        return true;
      }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    identities.set(req, identity);
    return await api(req, res, url);
  }

  function getRelease(key, projectId, releaseId) {
    let project;
    try {
      project = storeFor(key).read(projectId);
    } catch {
      throw fail(404, 'RELEASE_NOT_FOUND');
    }
    const release = project.releases.find(candidate => candidate.id === releaseId);
    if (!release) throw fail(404, 'RELEASE_NOT_FOUND');
    return release;
  }

  function getReleasePackage(key, projectId, releaseId) {
    const resolved = builds.resolveWithMetadata(key, projectId, releaseId);
    return {
      buffer: resolved.bytes,
      sha256: resolved.sha256,
      release: resolved.release,
      buildId: resolved.job.id
    };
  }

  return {
    handlePlatform,
    getRelease,
    getReleasePackage,
    enqueueBuild,
    getBuild,
    archiveDeployment,
    deploymentStatus,
    archiveSubmission,
    submissionStatus,
    cloudHistory,
    cloudSync,
    cloudRetry,
    close() { api.close(); builds.close(); oauth?.close(); }
  };
}

// platform:false builds an admin-only gateway (no private storage validation), used when the
// caller only needs adminSnapshot (e.g. the admin console without an injected gateway).
export function createLocalForgeGateway({ config = {}, root, env = process.env, fetchImpl = globalThis.fetch, platform = true } = {}) {
  const { inspectForgeTemplates, inspectForgeProjects, inspectForgeBuilds, inspectDriveManifests } = require('../../forge/Tools/internal-api.cjs');
  const enabled = config.enabled === true;
  const platformImpl = enabled && platform ? createLocalPlatform({ config, root, env, fetchImpl }) : null;
  const disabled = () => { throw fail(503, 'FORGE_DISABLED'); };
  return {
    mode: 'local',
    handlePlatform: platformImpl ? platformImpl.handlePlatform : disabled,
    getRelease: platformImpl ? platformImpl.getRelease : disabled,
    getReleasePackage: platformImpl ? platformImpl.getReleasePackage : disabled,
    enqueueBuild: platformImpl ? platformImpl.enqueueBuild : disabled,
    getBuild: platformImpl ? platformImpl.getBuild : disabled,
    archiveDeployment: platformImpl ? platformImpl.archiveDeployment : disabled,
    deploymentStatus: platformImpl ? platformImpl.deploymentStatus : disabled,
    archiveSubmission: platformImpl ? platformImpl.archiveSubmission : disabled,
    submissionStatus: platformImpl ? platformImpl.submissionStatus : disabled,
    cloudHistory: platformImpl ? platformImpl.cloudHistory : disabled,
    cloudSync: platformImpl ? platformImpl.cloudSync : disabled,
    cloudRetry: platformImpl ? platformImpl.cloudRetry : disabled,
    adminSnapshot() {
      const forgeDir = typeof config.directory === 'string' && config.directory ? config.directory : null;
      return {
        templates: inspectForgeTemplates(root),
        projects: inspectForgeProjects(forgeDir),
        builds: inspectForgeBuilds(forgeDir, root),
        driveSync: inspectDriveManifests(forgeDir),
        serverPresent: Boolean(safeStat(path.join(root, 'forge', 'server.cjs'))),
        officialEditorPresent: Boolean(safeStat(path.join(root, 'forge', 'OfficialGodot', 'index.html')))
      };
    },
    close() { platformImpl?.close(); }
  };
}

// ---- remote platform (S4) ----
function parseRemoteBaseUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    throw fail(503, 'FORGE_CONFIGURATION_REQUIRED');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw fail(503, 'FORGE_CONFIGURATION_REQUIRED');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname) && parsed.protocol !== 'https:') {
    throw fail(503, 'FORGE_HTTPS_REQUIRED');
  }
  return parsed.origin;
}

function assertAccountKey(accountKey) {
  if (typeof accountKey !== 'string' || !ACCOUNT_KEY_RE.test(accountKey)) {
    throw fail(400, 'INVALID_ACCOUNT_KEY');
  }
}

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !PROJECT_ID_RE.test(projectId)) {
    throw fail(404, 'PROJECT_NOT_FOUND');
  }
}

function assertReleaseId(releaseId) {
  if (typeof releaseId !== 'string' || !RELEASE_ID_RE.test(releaseId)) {
    throw fail(404, 'RELEASE_NOT_FOUND');
  }
}

function assertBuildId(buildId) {
  if (typeof buildId !== 'string' || !BUILD_ID_RE.test(buildId)) {
    throw fail(404, 'BUILD_NOT_FOUND');
  }
}

async function readIncomingBody(req, maxBytes = MAX_BODY_BYTES) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  if (Number(req.headers?.['content-length']) > maxBytes) {
    throw fail(413, 'PAYLOAD_TOO_LARGE');
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > maxBytes) {
        failed = true;
        chunks.length = 0;
        reject(fail(413, 'PAYLOAD_TOO_LARGE'));
      } else {
        chunks.push(Buffer.from(chunk));
      }
    });
    req.once('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.once('error', reject);
  });
}

export function createRemoteForgeGateway({ config = {}, env = process.env, fetchImpl = globalThis.fetch, platform = true } = {}) {
  const enabled = config.enabled === true;
  const rawBaseUrl = config.baseUrl || env.PLAYHUB_FORGE_BASE_URL || '';
  const internalSecret = String(config.internalSecret ?? env.PLAYHUB_FORGE_INTERNAL_SECRET ?? '');
  const timeoutMs = Number.isSafeInteger(config.timeoutMs) && config.timeoutMs > 0 && config.timeoutMs <= 120000
    ? config.timeoutMs
    : 15000;

  if (!enabled && !rawBaseUrl && !platform) {
    const disabled = async () => { throw fail(503, 'FORGE_DISABLED'); };
    return {
      mode: 'remote',
      handlePlatform: disabled,
      getRelease: disabled,
      getReleasePackage: disabled,
      enqueueBuild: disabled,
      getBuild: disabled,
      archiveDeployment: disabled,
      deploymentStatus: disabled,
      archiveSubmission: disabled,
      submissionStatus: disabled,
      cloudHistory: disabled,
      cloudSync: disabled,
      cloudRetry: disabled,
      async adminSnapshot() { return emptyAdminSnapshot(); },
      close() {}
    };
  }

  if (enabled || rawBaseUrl) {
    if (typeof fetchImpl !== 'function') throw fail(503, 'FORGE_CONFIGURATION_REQUIRED');
    if (internalSecret.length < 32) throw fail(503, 'FORGE_INTERNAL_SECRET_REQUIRED');
  }
  const baseOrigin = (enabled || rawBaseUrl) ? parseRemoteBaseUrl(rawBaseUrl) : null;
  const active = new Set();
  let closed = false;

  function ensureActive() {
    if (closed || !enabled || !baseOrigin) throw fail(503, 'FORGE_DISABLED');
  }

  async function requestInternal(method, routePath, { body, headers = {}, idempotencyKey } = {}) {
    if (closed || !baseOrigin) throw fail(503, 'FORGE_DISABLED');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    active.add(controller);
    try {
      const reqHeaders = {
        'X-PlayHub-Internal-Secret': internalSecret,
        ...headers,
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      };
      let payload;
      if (body !== undefined) {
        if (Buffer.isBuffer(body) || body instanceof Uint8Array || typeof body === 'string') {
          payload = body;
        } else {
          reqHeaders['Content-Type'] = 'application/json';
          payload = JSON.stringify(body);
        }
      }
      let response;
      try {
        response = await fetchImpl(`${baseOrigin}${routePath}`, {
          method,
          headers: reqHeaders,
          body: payload,
          redirect: 'error',
          signal: controller.signal
        });
      } catch {
        throw fail(503, 'SERVICE_UNAVAILABLE');
      }
      let data = null;
      try {
        data = await response.json();
      } catch {
        if (!response.ok) throw fail(response.status >= 500 ? 503 : response.status, 'SERVICE_UNAVAILABLE');
        throw fail(502, 'INVALID_FORGE_RESPONSE');
      }
      if (!response.ok) {
        const errCode = typeof data?.error === 'string' ? data.error : 'SERVICE_UNAVAILABLE';
        throw fail(response.status, errCode);
      }
      return data;
    } finally {
      clearTimeout(timer);
      active.delete(controller);
    }
  }

  async function getRelease(accountKey, projectId, releaseId) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertReleaseId(releaseId);
    const data = await requestInternal('GET', `/internal/v1/accounts/${accountKey}/projects/${projectId}/releases/${releaseId}`);
    if (!data?.release || typeof data.release !== 'object') throw fail(404, 'RELEASE_NOT_FOUND');
    return data.release;
  }

  async function getReleasePackage(accountKey, projectId, releaseId) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertReleaseId(releaseId);
    const release = await getRelease(accountKey, projectId, releaseId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(timeoutMs, 30000));
    active.add(controller);
    try {
      let response;
      try {
        response = await fetchImpl(`${baseOrigin}/internal/v1/accounts/${accountKey}/projects/${projectId}/releases/${releaseId}/package`, {
          method: 'GET',
          headers: { 'X-PlayHub-Internal-Secret': internalSecret },
          redirect: 'error',
          signal: controller.signal
        });
      } catch {
        throw fail(503, 'SERVICE_UNAVAILABLE');
      }
      if (!response.ok) {
        let errBody = null;
        try { errBody = await response.json(); } catch {}
        throw fail(response.status, typeof errBody?.error === 'string' ? errBody.error : 'RELEASE_PACKAGE_UNAVAILABLE');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 64 * 1024 * 1024) throw fail(413, 'PACKAGE_TOO_LARGE');
      const computedSha = crypto.createHash('sha256').update(buffer).digest('hex');
      const headerSha = String(response.headers.get('x-artifact-sha256') || '').toLowerCase();
      if (headerSha && headerSha !== computedSha) throw fail(502, 'PACKAGE_INTEGRITY_MISMATCH');
      return {
        buffer,
        sha256: computedSha,
        release,
        buildId: String(response.headers.get('x-build-id') || release?.build?.buildId || '')
      };
    } finally {
      clearTimeout(timer);
      active.delete(controller);
    }
  }

  async function enqueueBuild(accountKey, projectId, { idempotencyKey } = {}) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    const data = await requestInternal('POST', `/internal/v1/accounts/${accountKey}/projects/${projectId}/builds`, {
      body: {},
      idempotencyKey
    });
    return data.build;
  }

  async function getBuild(accountKey, projectId, buildId) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertBuildId(buildId);
    const data = await requestInternal('GET', `/internal/v1/accounts/${accountKey}/projects/${projectId}/builds/${buildId}`);
    return data.build;
  }

  async function archiveDeployment(accountKey, projectId, releaseId, { idempotencyKey } = {}) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertReleaseId(releaseId);
    return await requestInternal('POST', `/internal/v1/accounts/${accountKey}/projects/${projectId}/deployments/${releaseId}`, {
      body: {},
      idempotencyKey
    });
  }

  async function deploymentStatus(accountKey, projectId, releaseId) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertReleaseId(releaseId);
    return await requestInternal('GET', `/internal/v1/accounts/${accountKey}/projects/${projectId}/deployments/${releaseId}`);
  }

  async function archiveSubmission(accountKey, projectId, releaseId, { idempotencyKey } = {}) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertReleaseId(releaseId);
    return await requestInternal('POST', `/internal/v1/accounts/${accountKey}/projects/${projectId}/submissions/${releaseId}`, {
      body: {},
      idempotencyKey
    });
  }

  async function submissionStatus(accountKey, projectId, releaseId) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    assertReleaseId(releaseId);
    return await requestInternal('GET', `/internal/v1/accounts/${accountKey}/projects/${projectId}/submissions/${releaseId}`);
  }

  async function cloudHistory(accountKey, projectId) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    return await requestInternal('GET', `/internal/v1/accounts/${accountKey}/projects/${projectId}/cloud/history`);
  }

  async function cloudSync(accountKey, projectId, { idempotencyKey } = {}) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    return await requestInternal('POST', `/internal/v1/accounts/${accountKey}/projects/${projectId}/cloud`, {
      body: {},
      idempotencyKey
    });
  }

  async function cloudRetry(accountKey, projectId, revision, { idempotencyKey } = {}) {
    ensureActive();
    assertAccountKey(accountKey);
    assertProjectId(projectId);
    if (!Number.isSafeInteger(revision) || revision < 1) throw fail(400, 'INVALID_REVISION');
    return await requestInternal('POST', `/internal/v1/accounts/${accountKey}/projects/${projectId}/cloud/retry/${revision}`, {
      body: {},
      idempotencyKey
    });
  }

  async function adminSnapshot() {
    if (!baseOrigin || closed) return emptyAdminSnapshot();
    return await requestInternal('GET', '/internal/v1/admin/snapshot');
  }

  async function handlePlatform(req, res, url, { accountKey } = {}) {
    if (!url.pathname.startsWith('/api/platform/')) return false;
    ensureActive();
    assertAccountKey(accountKey);

    const subpath = url.pathname.slice('/api/platform'.length);
    const isHubSpecialRoute = HUB_SPECIAL_SUBROUTE_RE.test(subpath);
    const targetUrl = `${baseOrigin}/internal/v1/accounts/${accountKey}/platform${subpath}${url.search}`;

    let rawBody;
    try {
      rawBody = await readIncomingBody(req);
    } catch (err) {
      if (err.status === 413) {
        send(res, 413, { ok: false, error: 'Request too large' });
        return true;
      }
      throw err;
    }

    const headers = { 'X-PlayHub-Internal-Secret': internalSecret };
    if (req.headers?.['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers?.['idempotency-key']) headers['Idempotency-Key'] = req.headers['idempotency-key'];
    if (req.headers?.accept) headers.Accept = req.headers.accept;

    const isEventStream = subpath.endsWith('/events') && (req.method || 'GET') === 'GET';
    const controller = new AbortController();
    const timer = isEventStream ? null : setTimeout(() => controller.abort(), timeoutMs);
    active.add(controller);
    const onClose = () => controller.abort();
    res.once?.('close', onClose);

    try {
      let response;
      try {
        response = await fetchImpl(targetUrl, {
          method: req.method || 'GET',
          headers,
          body: rawBody && rawBody.length > 0 ? rawBody : undefined,
          redirect: 'error',
          signal: controller.signal
        });
      } catch {
        throw fail(503, 'SERVICE_UNAVAILABLE');
      }

      if (isHubSpecialRoute && !response.ok) {
        let errBody = null;
        try { errBody = await response.json(); } catch {}
        throw fail(response.status, typeof errBody?.error === 'string' ? errBody.error : 'FORGE_UPSTREAM_ERROR');
      }

      if (!isHubSpecialRoute && response.status >= 500) {
        throw fail(503, 'SERVICE_UNAVAILABLE');
      }

      const contentType = response.headers.get('content-type') || 'application/json; charset=utf-8';
      if (contentType.startsWith('text/event-stream') && response.body) {
        res.writeHead(response.status, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no'
        });
        for await (const chunk of response.body) {
          if (res.writableEnded || controller.signal.aborted) break;
          res.write(Buffer.from(chunk));
        }
        if (!res.writableEnded) res.end();
        return true;
      }

      const text = await response.text();
      const responseHeaders = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      };
      const replay = response.headers.get('x-idempotent-replay');
      if (replay) responseHeaders['X-Idempotent-Replay'] = replay;
      res.writeHead(response.status, responseHeaders);
      res.end(text);
      return true;
    } finally {
      if (timer) clearTimeout(timer);
      res.removeListener?.('close', onClose);
      active.delete(controller);
    }
  }

  function close() {
    closed = true;
    for (const controller of active) {
      try { controller.abort(); } catch {}
    }
    active.clear();
  }

  return {
    mode: 'remote',
    handlePlatform,
    getRelease,
    getReleasePackage,
    enqueueBuild,
    getBuild,
    archiveDeployment,
    deploymentStatus,
    archiveSubmission,
    submissionStatus,
    cloudHistory,
    cloudSync,
    cloudRetry,
    adminSnapshot,
    close
  };
}

export function createForgeGateway(options = {}) {
  const env = options.env || process.env;
  const mode = String(options.config?.mode || env.PLAYHUB_FORGE_MODE || 'local').trim().toLowerCase();
  if (mode === 'remote') return createRemoteForgeGateway(options);
  if (mode === 'local') return createLocalForgeGateway(options);
  throw fail(503, 'INVALID_FORGE_GATEWAY_MODE');
}
