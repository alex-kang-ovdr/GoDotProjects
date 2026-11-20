// ForgeGateway: the only place in hub/server that touches Forge code or Forge's disk.
// See docs/architecture/hub-forge-internal-api-design.md (S2). The "local" gateway runs Forge's
// modules in this process exactly as before; a "remote" gateway (S4) will call Forge over HTTP
// with the same interface:
//   handlePlatform(req, res, url, { accountKey, identity }) -> boolean
//   getRelease(accountKey, projectId, releaseId) -> release (throws status 404 when missing)
//   adminSnapshot() -> { templates, projects, builds, driveSync, serverPresent, officialEditorPresent }
//   close()
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fail = (status, code) => Object.assign(new Error(code), { status, code });
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };

function safeStat(filename) {
  try { const stat = fs.lstatSync(filename); return stat.isSymbolicLink() ? null : stat; } catch { return null; }
}
function safeReadJson(filename, maxBytes = 512 * 1024) {
  const stat = safeStat(filename);
  if (!stat || !stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null;
  try { return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^﻿/, '')); } catch { return null; }
}
function safeReadDir(directory) {
  const stat = safeStat(directory);
  if (!stat || !stat.isDirectory()) return [];
  try { return fs.readdirSync(directory); } catch { return []; }
}

// ---- admin snapshot (moved unchanged from admin-console.mjs) ----
function inspectForgeTemplates(platformRoot) {
  const templatesDir = path.join(platformRoot, 'forge', 'Templates');
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

function inspectForgeProjects(forgeDir) {
  if (!forgeDir) return [];
  const accountsDir = path.join(forgeDir, 'accounts');
  const projects = [];
  for (const accountFolder of safeReadDir(accountsDir).slice(0, 50)) {
    const accountRoot = path.join(accountsDir, accountFolder);
    const projectsDir = path.join(accountRoot, 'projects');
    for (const file of safeReadDir(projectsDir).slice(0, 50)) {
      if (!file.endsWith('.json')) continue;
      const data = safeReadJson(path.join(projectsDir, file), 2 * 1024 * 1024);
      if (!data || typeof data !== 'object' || typeof data.id !== 'string') continue;
      projects.push({
        ownerKeyPrefix: accountFolder.slice(0, 12),
        projectId: data.id,
        name: typeof data.name === 'string' ? data.name : data.id,
        templateId: typeof data.templateId === 'string' ? data.templateId : null,
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

function inspectForgeBuilds(forgeDir, platformRoot) {
  const roots = [];
  if (forgeDir) roots.push({ source: 'hub-owned', dir: path.join(forgeDir, 'builds') });
  roots.push({ source: 'local-forge', dir: path.join(platformRoot, 'forge', 'Saved', 'Builds') });
  const builds = [];
  for (const { source, dir } of roots) {
    for (const entry of safeReadDir(dir).slice(0, 50)) {
      const result = safeReadJson(path.join(dir, entry, 'result.json'), 262144);
      if (!result || typeof result !== 'object') continue;
      builds.push({
        id: typeof result.id === 'string' ? result.id : entry,
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
      });
    }
  }
  builds.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return builds.slice(0, 40);
}

function inspectDriveManifests(forgeDir) {
  const summarize = folder => {
    const summary = { total: 0, committed: 0, verified: 0, pending: 0, failed: 0 };
    if (!forgeDir) return summary;
    const dir = path.join(forgeDir, folder);
    for (const file of safeReadDir(dir).slice(0, 200)) {
      if (!file.endsWith('.json')) continue;
      const doc = safeReadJson(path.join(dir, file), 262144);
      if (!doc || typeof doc !== 'object') continue;
      const rows = Array.isArray(doc.versions) ? doc.versions : [doc];
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        summary.total++;
        const state = row.state || row.status;
        if (state === 'committed' || row.cloudCommitted === true) summary.committed++;
        if (row.cloudVerified === true) summary.verified++;
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

// ---- platform (moved from forge-account.mjs createHubForge) ----
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
    oauth = createOperatorOAuthToken({ enabled: true, fetchImpl, secretsProvider: () => ({ clientId: env.PLAYHUB_DRIVE_CLIENT_ID, clientSecret: env.PLAYHUB_DRIVE_CLIENT_SECRET, refreshToken: env.PLAYHUB_DRIVE_REFRESH_TOKEN }) });
    const drive = new DriveSnapshotStore({ enabled: true, folderId: config.drive.folderId, getAccessToken: oauth.getAccessToken, fetchImpl });
    sync = new ProjectDriveSync({ enabled: true, directory: path.resolve(config.directory, 'cloud-manifests'), drive });
    if (config.packages?.enabled === true) {
      if (!config.drive.packageFolderId || config.drive.packageFolderId === config.drive.folderId) throw fail(503, 'SEPARATE_PACKAGE_FOLDER_REQUIRED');
      const { DeploymentZipArchive } = require('../../forge/Tools/deployment-zip-archive.cjs');
      const { DriveZipStore } = require('../../forge/Tools/drive-zip-store.cjs');
      const packageDrive = new DriveZipStore({ enabled: true, folderId: config.drive.packageFolderId, getAccessToken: oauth.getAccessToken, fetchImpl });
      deployments = new DeploymentZipArchive({ enabled: true, directory: path.resolve(config.directory, 'deployment-manifests'), drive: packageDrive, resolveOwnedPackage: (key, id, release) => builds.resolve(key, id, release) });
    }
    submissions = new SubmissionDriveArchive({ enabled: true, directory: path.resolve(config.directory, 'submission-manifests'), drive,
      resolveOwnedRelease: (key, projectId, releaseId) => {
        const project = storeFor(key).read(projectId);
        const release = project.releases.find(r => r.id === releaseId);
        if (!release) throw fail(404, 'RELEASE_NOT_FOUND');
        return { accountKey: key, projectId, releaseId, revision: release.revision, files: release.files };
      } });
  }
  // The Hub has already verified the session; the identity is handed over per request.
  const identities = new WeakMap();
  const api = createAccountPlatformApi({ root, directory, verifyIdentity: req => identities.get(req),
    validateBuildForAccount: (key, buildId, id, revision) => builds.validate(key, buildId, id, revision),
    onStore: sync ? (key, store) => sync.attachStore(key, store, { onError: e => errors.set(key + ':' + e.projectId, 'CLOUD_SYNC_FAILED') }) : undefined });
  const publicRow = ({ revision, state, bytes, sha256, attempts, lastError }) => ({ revision, state, bytes, sha256, attempts, lastError });

  async function handlePlatform(req, res, url, { accountKey: key, identity }) {
    if (!url.pathname.startsWith('/api/platform/')) return false;
    const buildRoute = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/builds(?:\/([a-f0-9]{16}))?$/);
    if (buildRoute) {
      const project = storeFor(key).getProject(buildRoute[1]);
      if (req.method === 'POST' && !buildRoute[2]) { if (builds.enabled && !executionPolicy.allows(key)) throw fail(403, 'EXECUTION_NOT_ALLOWED'); send(res, 202, { build: builds.enqueue(key, project.id, project.revision) }); return true; }
      if (req.method === 'GET' && buildRoute[2]) { send(res, 200, { build: builds.publicJob(builds.job(key, project.id, buildRoute[2])) }); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    const deployment = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/deployments\/([a-f0-9]{24})$/);
    if (deployment) {
      if (!deployments) throw fail(503, 'DEPLOYMENT_ARCHIVE_DISABLED');
      const input = { accountKey: key, projectId: deployment[1], releaseId: deployment[2] };
      if (req.method === 'POST') { send(res, 200, await deployments.archive(input)); return true; }
      if (req.method === 'GET') { send(res, 200, await deployments.status(input)); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    const submission = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/submissions\/([a-f0-9]{24})$/);
    if (submission) {
      if (!submissions) throw fail(503, 'CLOUD_SYNC_DISABLED');
      const input = { accountKey: key, projectId: submission[1], releaseId: submission[2] };
      if (req.method === 'POST') { send(res, 200, await submissions.archive(input)); return true; }
      if (req.method === 'GET') { send(res, 200, await submissions.status(input)); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    const cloud = url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/cloud(?:\/(history|retry\/([1-9][0-9]*)))?$/);
    if (cloud) {
      if (!sync) throw fail(503, 'CLOUD_SYNC_DISABLED');
      const store = storeFor(key); store.getProject(cloud[1]);
      if (req.method === 'GET' && cloud[2] === 'history') { send(res, 200, { versions: sync.listVersions(key, cloud[1]).map(publicRow), lastSyncError: errors.get(key + ':' + cloud[1]) || null }); return true; }
      if (req.method === 'POST' && (!cloud[2] || cloud[3])) { const row = cloud[3] ? await sync.retryVersion(key, cloud[1], Number(cloud[3])) : await sync.syncProject(store, key, cloud[1]); send(res, 200, { version: publicRow(row), cloudCommitted: row.state === 'committed' }); return true; }
      throw fail(405, 'METHOD_NOT_ALLOWED');
    }
    identities.set(req, identity);
    return await api(req, res, url);
  }

  function getRelease(key, projectId, releaseId) {
    const project = storeFor(key).read(projectId);
    const release = project.releases.find(candidate => candidate.id === releaseId);
    if (!release) throw fail(404, 'RELEASE_NOT_FOUND');
    return release;
  }

  return { handlePlatform, getRelease, close() { api.close(); builds.close(); oauth?.close(); } };
}

// platform:false builds an admin-only gateway (no private storage validation), used when the
// caller only needs adminSnapshot (e.g. the admin console without an injected gateway).
export function createLocalForgeGateway({ config = {}, root, env = process.env, fetchImpl = globalThis.fetch, platform = true } = {}) {
  const enabled = config.enabled === true;
  const platformImpl = enabled && platform ? createLocalPlatform({ config, root, env, fetchImpl }) : null;
  const disabled = () => { throw fail(503, 'FORGE_DISABLED'); };
  return {
    mode: 'local',
    handlePlatform: platformImpl ? platformImpl.handlePlatform : disabled,
    getRelease: platformImpl ? platformImpl.getRelease : disabled,
    adminSnapshot() {
      const forgeDir = enabled && typeof config.directory === 'string' ? config.directory : null;
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
