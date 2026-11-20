// HTTP surface for PlayHub-CDN. Mounted from app.mjs only when config.cdn.enabled === true.
// Public routes: /api/cdn/*  (registered Google account, owner-only, CSRF on every mutation)
// Admin routes:  /api/admin/cdn/*  (loopback admin listener, admin session already enforced by app.mjs)
import path from 'node:path';
import { ApiError, json, readJson, assertId } from '../security.mjs';
import { googleIdentityForSession, forgeAccountKey } from '../forge-account.mjs';
import { ensureCdnSchema } from './schema.mjs';
import { createQuota } from './quota.mjs';
import { resolveStoreConfig, createObjectStore } from './object-store.mjs';
import { createLocalS3 } from './local-s3.mjs';
import { createCdnService } from './service.mjs';
import { createCdnGc } from './gc.mjs';

const GB = 1_000_000_000;
const DEFAULTS = {
  plans: { free: 1 * GB, pro: 20 * GB },
  maxFileBytes: 64 * 1024 * 1024,
  maxManifestBytes: 8 * 1024 * 1024,
  maxFilesPerSave: 5000,
  maxProjects: 100,
  maxPins: 200,
  uploadUrlTtlSec: 600,
  downloadUrlTtlSec: 300,
  saveSessionTtlSec: 24 * 60 * 60,
  retentionDays: 30,
  retentionCount: 100,
  gcGraceMs: 60 * 60 * 1000,
  verifyTimeoutMs: 10 * 60 * 1000,
};

export function resolveCdnSettings(cdn) {
  const settings = { ...DEFAULTS, ...cdn, plans: { ...DEFAULTS.plans, ...(cdn.plans || {}) } };
  const positive = ['maxFileBytes', 'maxManifestBytes', 'maxFilesPerSave', 'maxProjects', 'maxPins', 'uploadUrlTtlSec', 'downloadUrlTtlSec', 'saveSessionTtlSec', 'retentionDays', 'retentionCount', 'verifyTimeoutMs'];
  for (const key of positive) if (!Number.isSafeInteger(settings[key]) || settings[key] < 1) throw new Error(`cdn.${key} must be a positive integer`);
  if (!Number.isSafeInteger(settings.gcGraceMs) || settings.gcGraceMs < 0) throw new Error('cdn.gcGraceMs must be a non-negative integer');
  if (settings.uploadUrlTtlSec > 3600 || settings.downloadUrlTtlSec > 3600) throw new Error('cdn signed URL TTL must be at most 3600 seconds');
  return settings;
}

const disabled = { enabled: false, publicRoute: async () => false, adminRoute: async () => false, close: async () => {} };

export function createCdn({ config, db, requireSession, now, audit, rate, env = process.env, fetchImpl = globalThis.fetch }) {
  const cdn = config.cdn;
  if (!cdn || cdn.enabled !== true) return disabled;
  const settings = resolveCdnSettings(cdn);
  const storeConfig = resolveStoreConfig(cdn, env);
  if (storeConfig.provider === 'local' && config.secureCookies && cdn.allowLocalProvider !== true) throw new Error('cdn.provider "local" is for development only; use "r2" with secure cookies');
  ensureCdnSchema(db);
  const quota = createQuota({ db, plans: settings.plans, now });
  const store = createObjectStore(storeConfig, { fetchImpl, clock: now });
  let localS3 = null, ready = Promise.resolve();
  if (storeConfig.provider === 'local') {
    localS3 = createLocalS3({
      dir: cdn.local?.dir || path.join(config.dataDir, 'cdn-local-s3'),
      buckets: Object.values(storeConfig.buckets),
      credentials: { accessKeyId: storeConfig.accessKeyId, secretAccessKey: storeConfig.secretAccessKey },
      origins: config.userOrigins, clock: now, maxObjectBytes: settings.maxFileBytes * 2,
    });
    ready = localS3.listen(cdn.local?.port || 0, '127.0.0.1').then(endpoint => store.setEndpoint(endpoint));
    ready.catch(() => {});
  }
  const service = createCdnService({ db, store, quota, now, audit, settings });
  const gc = createCdnGc({ db, store, quota, now, audit, settings, readManifest: service.readManifest });

  function ownerFor(req) {
    const session = requireSession(req, 'public');
    let identity;
    try { identity = googleIdentityForSession(db, session); } catch { throw new ApiError(401, 'GOOGLE_LOGIN_REQUIRED'); }
    const owner = forgeAccountKey(identity);
    if (req.method !== 'GET') rate(`cdn:${owner}`, 600, 60000);
    return owner;
  }
  const idemKey = req => req.headers['idempotency-key'] || null;
  const send = (res, result) => json(res, result.status, result.body);

  async function publicRoute(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith('/api/cdn/')) return false;
    await ready;
    const m = (re, method) => req.method === method && re.exec(p);
    let r;
    if (p === '/api/cdn/me/storage' && req.method === 'GET') { json(res, 200, service.storage(ownerFor(req))); return true; }
    if (p === '/api/cdn/projects' && req.method === 'GET') { json(res, 200, { projects: service.listProjects(ownerFor(req)) }); return true; }
    if (p === '/api/cdn/projects' && req.method === 'POST') { const owner = ownerFor(req); json(res, 201, { project: service.createProject(owner, await readJson(req, 4096)) }); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/save-plans$/, 'POST'))) { const owner = ownerFor(req); json(res, 201, service.createSavePlan(owner, assertId(r[1]), await readJson(req, 2 * 1024 * 1024))); return true; }
    if ((r = m(/^\/api\/cdn\/uploads\/([^/]+)$/, 'GET'))) { json(res, 200, service.getUpload(ownerFor(req), assertId(r[1]))); return true; }
    if ((r = m(/^\/api\/cdn\/uploads\/([^/]+)\/renew$/, 'POST'))) { const owner = ownerFor(req); await readJson(req, 1024); json(res, 200, service.renewUpload(owner, assertId(r[1]))); return true; }
    if ((r = m(/^\/api\/cdn\/uploads\/([^/]+)\/complete$/, 'POST'))) { const owner = ownerFor(req); await readJson(req, 1024); json(res, 200, await service.completeUpload(owner, assertId(r[1]))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/commits$/, 'POST'))) { const owner = ownerFor(req); send(res, await service.commit(owner, assertId(r[1]), await readJson(req, 4096), idemKey(req))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/versions$/, 'GET'))) { json(res, 200, service.listVersions(ownerFor(req), assertId(r[1]))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/commits\/([^/]+)\/manifest$/, 'GET'))) { json(res, 200, await service.getManifest(ownerFor(req), assertId(r[1]), assertId(r[2]))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/, 'POST'))) { const owner = ownerFor(req); send(res, await service.restore(owner, assertId(r[1]), assertId(r[2]), await readJson(req, 4096), idemKey(req))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/versions\/([^/]+)\/pin$/, 'POST'))) { const owner = ownerFor(req); json(res, 200, service.pin(owner, assertId(r[1]), assertId(r[2]))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/versions\/([^/]+)\/pin$/, 'DELETE'))) { const owner = ownerFor(req); json(res, 200, service.unpin(owner, assertId(r[1]), assertId(r[2]))); return true; }
    if ((r = m(/^\/api\/cdn\/projects\/([^/]+)\/downloads$/, 'POST'))) { const owner = ownerFor(req); json(res, 200, await service.download(owner, assertId(r[1]), await readJson(req, 4096))); return true; }
    throw new ApiError(404, 'NOT_FOUND');
  }

  async function adminRoute(req, res, url, session) {
    const p = url.pathname;
    if (!p.startsWith('/api/admin/cdn/')) return false;
    await ready;
    if (p === '/api/admin/cdn/status' && req.method === 'GET') {
      const blobs = db.prepare('SELECT state, COUNT(*) AS count, COALESCE(SUM(bytes),0) AS bytes FROM cdn_blobs GROUP BY state').all();
      const ledger = db.prepare('SELECT COUNT(*) AS owners, COALESCE(SUM(used_bytes),0) AS usedBytes, COALESCE(SUM(reserved_bytes),0) AS reservedBytes FROM cdn_storage').get();
      const plans = db.prepare('SELECT state, COUNT(*) AS count FROM cdn_save_plans GROUP BY state').all();
      json(res, 200, { provider: storeConfig.provider, buckets: storeConfig.buckets, blobs, ledger: { ...ledger }, savePlans: plans, settings: { ...settings, plans: settings.plans } });
      return true;
    }
    if (p === '/api/admin/cdn/gc' && req.method === 'POST') {
      await readJson(req, 1024);
      const report = await gc.run();
      audit('cdn_gc_manual', session?.admin_username || null, report);
      json(res, 200, { report });
      return true;
    }
    if (p === '/api/admin/cdn/plan' && req.method === 'POST') {
      const body = await readJson(req, 1024);
      if (typeof body.owner !== 'string' || !/^[a-f0-9]{64}$/.test(body.owner)) throw new ApiError(400, 'INVALID_OWNER');
      const storage = quota.setPlan(body.owner, body.plan);
      audit('cdn_plan_set', session?.admin_username || null, { owner: body.owner, plan: body.plan });
      json(res, 200, { owner: body.owner, storage });
      return true;
    }
    throw new ApiError(404, 'NOT_FOUND');
  }

  return {
    enabled: true, service, gc, quota, store, localS3, ready,
    publicRoute, adminRoute,
    async close() { if (localS3) await localS3.close(); },
  };
}
