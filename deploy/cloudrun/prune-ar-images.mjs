#!/usr/bin/env node
/**
 * Prunes historical Artifact Registry Docker image versions via Artifact Registry REST API v1,
 * keeping the newest N versions per package plus promoted (qa/rc/live/prod) and protected tags,
 * and optionally configures repository-level Cleanup Policies.
 */
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE = 'https://artifactregistry.googleapis.com/v1';
const DEFAULT_PROTECT_PREFIXES = Object.freeze(['qa', 'rc', 'live', 'prod']);

export function parseDockerImageResource(img) {
  const name = String(img?.name || '');
  const idx = name.lastIndexOf('/dockerImages/');
  if (idx < 0) return null;
  const tail = name.slice(idx + '/dockerImages/'.length);
  const atIdx = tail.indexOf('@');
  if (atIdx <= 0) return null;
  const pkg = decodeURIComponent(tail.slice(0, atIdx));
  const digest = tail.slice(atIdx + 1);
  if (!pkg || !digest) return null;
  const tags = Array.isArray(img.tags) ? img.tags.map(String).filter(Boolean) : [];
  const sizeBytes = Number(img.imageSizeBytes || 0) || 0;
  const ts = Date.parse(img.uploadTime || img.updateTime || '') || 0;
  return {
    name,
    uri: String(img.uri || ''),
    pkg,
    digest,
    tags,
    sizeBytes,
    timestampMs: ts,
    uploadTime: img.uploadTime || img.updateTime || '',
  };
}

export function selectPrunePlan(rawImages, {
  keepCount = 3,
  protectTags = [],
  protectTagPrefixes = DEFAULT_PROTECT_PREFIXES,
} = {}) {
  const safeKeep = Math.max(1, Number(keepCount) || 3);
  const protectedExact = new Set(
    (protectTags || []).map(t => String(t || '').trim()).filter(Boolean)
  );
  const prefixes = (protectTagPrefixes || [])
    .map(p => String(p || '').trim().toLowerCase())
    .filter(Boolean);

  const isProtected = (item) => {
    for (const tag of item.tags) {
      if (protectedExact.has(tag)) return true;
      const lower = tag.toLowerCase();
      if (prefixes.some(pref => lower === pref || lower.startsWith(`${pref}-`) || lower.startsWith(`${pref}_`) || lower.startsWith(`${pref}.`))) {
        return true;
      }
    }
    return false;
  };

  const byPkg = new Map();
  for (const raw of rawImages || []) {
    const parsed = raw?.pkg && raw?.digest ? raw : parseDockerImageResource(raw);
    if (!parsed) continue;
    if (!byPkg.has(parsed.pkg)) byPkg.set(parsed.pkg, []);
    byPkg.get(parsed.pkg).push(parsed);
  }

  const keep = [];
  const remove = [];
  const summaryByPackage = {};

  for (const [pkg, list] of byPkg.entries()) {
    // Newest first; tie-break deterministically by digest
    list.sort((a, b) => (b.timestampMs - a.timestampMs) || a.digest.localeCompare(b.digest));
    const pkgKeep = [];
    const pkgRemove = [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (i < safeKeep || isProtected(item)) {
        pkgKeep.push(item);
        keep.push(item);
      } else {
        pkgRemove.push(item);
        remove.push(item);
      }
    }
    summaryByPackage[pkg] = {
      beforeCount: list.length,
      beforeBytes: list.reduce((s, x) => s + x.sizeBytes, 0),
      keepCount: pkgKeep.length,
      keepBytes: pkgKeep.reduce((s, x) => s + x.sizeBytes, 0),
      deleteCount: pkgRemove.length,
      deleteBytes: pkgRemove.reduce((s, x) => s + x.sizeBytes, 0),
    };
  }

  return {
    keep,
    remove,
    summaryByPackage,
    beforeCount: keep.length + remove.length,
    beforeBytes: [...keep, ...remove].reduce((s, x) => s + x.sizeBytes, 0),
    afterCount: keep.length,
    afterBytes: keep.reduce((s, x) => s + x.sizeBytes, 0),
    deleteCount: remove.length,
    deleteBytes: remove.reduce((s, x) => s + x.sizeBytes, 0),
  };
}

export function buildRepositoryCleanupPatch({ keepCount = 3 } = {}) {
  const safeKeep = Math.max(1, Number(keepCount) || 3);
  return {
    cleanupPolicyDryRun: false,
    cleanupPolicies: {
      'keep-recent-versions': {
        id: 'keep-recent-versions',
        action: 'KEEP',
        mostRecentVersions: {
          keepCount: safeKeep,
        },
      },
      'keep-promoted-tags': {
        id: 'keep-promoted-tags',
        action: 'KEEP',
        condition: {
          tagState: 'TAGGED',
          tagPrefixes: ['qa', 'rc', 'live', 'prod'],
        },
      },
      'delete-old-untagged': {
        id: 'delete-old-untagged',
        action: 'DELETE',
        condition: {
          tagState: 'UNTAGGED',
          olderThan: '86400s',
        },
      },
      'delete-old-dev-images': {
        id: 'delete-old-dev-images',
        action: 'DELETE',
        condition: {
          tagState: 'ANY',
          olderThan: '86400s',
        },
      },
    },
  };
}

async function apiFetchJson(url, { method = 'GET', token, body = null, fetchImpl = fetch } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`Artifact Registry API ${method} ${url} failed (${res.status}): ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function listAllDockerImages({
  project,
  location,
  repository,
  token,
  apiBase = DEFAULT_API_BASE,
  fetchImpl = fetch,
}) {
  const base = `${apiBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/repositories/${encodeURIComponent(repository)}/dockerImages`;
  const all = [];
  let pageToken = '';
  for (let page = 0; page < 50; page += 1) {
    const u = new URL(base);
    u.searchParams.set('pageSize', '200');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const data = await apiFetchJson(u.toString(), { method: 'GET', token, fetchImpl });
    if (Array.isArray(data?.dockerImages)) all.push(...data.dockerImages);
    if (!data?.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return all;
}

export async function applyRepositoryCleanupPolicies({
  project,
  location,
  repository,
  keepCount = 3,
  token,
  apiBase = DEFAULT_API_BASE,
  fetchImpl = fetch,
}) {
  const url = `${apiBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/repositories/${encodeURIComponent(repository)}?updateMask=cleanupPolicies,cleanupPolicyDryRun`;
  const patch = buildRepositoryCleanupPatch({ keepCount });
  return apiFetchJson(url, { method: 'PATCH', token, body: patch, fetchImpl });
}

export async function deletePackageVersion({
  project,
  location,
  repository,
  pkg,
  digest,
  token,
  apiBase = DEFAULT_API_BASE,
  fetchImpl = fetch,
}) {
  const url = `${apiBase}/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/repositories/${encodeURIComponent(repository)}/packages/${encodeURIComponent(pkg)}/versions/${encodeURIComponent(digest)}?force=true`;
  return apiFetchJson(url, { method: 'DELETE', token, fetchImpl });
}

export async function runPrune({
  project,
  location,
  repository,
  keepCount = 3,
  protectTags = [],
  applyPolicy = false,
  dryRun = false,
  token,
  apiBase = DEFAULT_API_BASE,
  fetchImpl = fetch,
  log = console.log,
}) {
  if (!token) throw new Error('AR_ACCESS_TOKEN (or --token) is required');

  let policyApplied = false;
  let policyError = null;
  if (applyPolicy && !dryRun) {
    try {
      await applyRepositoryCleanupPolicies({ project, location, repository, keepCount, token, apiBase, fetchImpl });
      policyApplied = true;
      log(`[ar-prune] Cleanup policy applied (keep recent ${keepCount} + promoted qa/rc/live/prod tags, delete older >24h)`);
    } catch (err) {
      policyError = err.message;
      log(`[ar-prune] Warning: repository cleanupPolicy PATCH skipped (${err.message})`);
    }
  }

  const rawImages = await listAllDockerImages({ project, location, repository, token, apiBase, fetchImpl });
  const plan = selectPrunePlan(rawImages, { keepCount, protectTags });
  const toMb = (b) => (b / 1048576).toFixed(2);

  log(`[ar-prune] Repository ${project}/${location}/${repository}: ${plan.beforeCount} versions (${toMb(plan.beforeBytes)} MB) -> keeping ${plan.afterCount} (${toMb(plan.afterBytes)} MB), pruning ${plan.deleteCount} (${toMb(plan.deleteBytes)} MB)`);
  for (const [pkg, s] of Object.entries(plan.summaryByPackage)) {
    log(`  - ${pkg}: ${s.beforeCount} (${toMb(s.beforeBytes)} MB) -> keep ${s.keepCount} (${toMb(s.keepBytes)} MB), delete ${s.deleteCount} (${toMb(s.deleteBytes)} MB)`);
  }

  let deleted = 0;
  let failed = 0;
  let freedBytes = 0;
  if (!dryRun) {
    for (const item of plan.remove) {
      try {
        await deletePackageVersion({
          project,
          location,
          repository,
          pkg: item.pkg,
          digest: item.digest,
          token,
          apiBase,
          fetchImpl,
        });
        deleted += 1;
        freedBytes += item.sizeBytes;
      } catch (err) {
        failed += 1;
        log(`[ar-prune] Failed to delete ${item.pkg}@${item.digest}: ${err.message}`);
      }
    }
  }

  log(`[ar-prune] Done (dryRun=${dryRun}): deleted=${deleted}, failed=${failed}, freed=${toMb(freedBytes)} MB, remaining=${plan.beforeCount - deleted} (${toMb(plan.beforeBytes - freedBytes)} MB)`);
  return {
    policyApplied,
    policyError,
    plan,
    deleted,
    failed,
    freedBytes,
    remainingBytes: plan.beforeBytes - freedBytes,
  };
}

function parseArgs(argv) {
  const opts = {
    project: process.env.DEV_HUB_PROJECT || 'playhub-dev-2611',
    location: process.env.REGION || 'us-west1',
    repository: 'playhub-containers',
    keepCount: 3,
    protectTags: [],
    applyPolicy: false,
    dryRun: false,
    token: process.env.AR_ACCESS_TOKEN || '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--project' && argv[i + 1]) opts.project = argv[++i];
    else if (a.startsWith('--project=')) opts.project = a.slice('--project='.length);
    else if (a === '--location' && argv[i + 1]) opts.location = argv[++i];
    else if (a.startsWith('--location=')) opts.location = a.slice('--location='.length);
    else if (a === '--repository' && argv[i + 1]) opts.repository = argv[++i];
    else if (a.startsWith('--repository=')) opts.repository = a.slice('--repository='.length);
    else if (a === '--keep' && argv[i + 1]) opts.keepCount = Number(argv[++i]);
    else if (a.startsWith('--keep=')) opts.keepCount = Number(a.slice('--keep='.length));
    else if (a === '--protect-tag' && argv[i + 1]) opts.protectTags.push(argv[++i]);
    else if (a.startsWith('--protect-tag=')) opts.protectTags.push(a.slice('--protect-tag='.length));
    else if (a === '--apply-policy') opts.applyPolicy = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--token' && argv[i + 1]) opts.token = argv[++i];
  }
  return opts;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  runPrune(opts).catch((err) => {
    console.error('[ar-prune] Error:', err?.message || err);
    process.exit(1);
  });
}
