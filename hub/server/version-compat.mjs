import fs from 'node:fs';
import path from 'node:path';
import { ApiError, readJson, json } from './security.mjs';

let bv;
try {
  bv = await import('../../tools/build-version/index.mjs');
} catch {
  // Standalone SEA fallback when repository-level tools/build-version/ is absent.
  const TARGETS = ['aos', 'ios', 'forge-desktop', 'forge-web', 'hub', 'godot-server'];
  bv = {
    resolveBuildInfo(opts = {}) {
      const d = new Date(opts.date ?? Date.now());
      const kst = new Date(d.getTime() + 9 * 3600000);
      const ymd = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, '0')}${String(kst.getUTCDate()).padStart(2, '0')}`;
      const hm = `${String(kst.getUTCHours()).padStart(2, '0')}${String(kst.getUTCMinutes()).padStart(2, '0')}`;
      const semver = opts.semver || '0.3.0';
      const buildNum = Number(opts.buildNum || 0);
      const sha7 = String(opts.commit || '0000000').slice(0, 7);
      const buildCode = Number(`${ymd}${String(Number(opts.dailySeq || 0)).padStart(2, '0')}`);
      return {
        schemaVersion: 1, target: opts.target || 'hub', semver, channel: opts.channel || 'local',
        buildId: `${opts.target || 'hub'}-v${semver}-${ymd}-${hm}-local-g${sha7}-b${buildNum}`,
        buildCode, buildNum, dailySeq: Number(opts.dailySeq || 0),
        builtAtUtc: d.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        builtAtKst: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hm.slice(0, 2)}:${hm.slice(2, 4)}:00+09:00`,
        compat: { engineAbi: opts.engineAbi || 'godot-4.7', engineApiRev: Number(opts.engineApiRev || 1), minEngineApiRev: Number(opts.minEngineApiRev || 1), netProtocol: opts.netProtocol || '1.0', gameplayHash: opts.gameplayHash || 'default' },
        updatePolicy: opts.updatePolicy === 'force' ? 'force' : 'optional',
        minClientBuildCode: Number(opts.minClientBuildCode || 0),
      };
    },
    createDefaultReleasePolicy(opts = {}) {
      const targets = {};
      for (const t of TARGETS) targets[t] = { updatePolicy: opts.updatePolicy === 'force' ? 'force' : 'optional', latestBuildCode: opts.latestBuildCode || 0, minBuildCode: opts.minBuildCode || 0, graceMinutes: 10, storeUrl: null, notice: '' };
      return { schemaVersion: 1, revision: 1, defaultUpdatePolicy: opts.updatePolicy === 'force' ? 'force' : 'optional', updatedAtUtc: opts.updatedAtUtc || new Date().toISOString(), updatedBy: 'system', targets, activePools: [] };
    },
    applyEnvPolicyOverrides(p) { return structuredClone(p); },
    mergeReleasePolicy(cur, patch, meta = {}) { return { ...structuredClone(cur), ...patch, revision: (cur.revision || 0) + 1, updatedAtUtc: new Date(meta.nowMs ?? Date.now()).toISOString(), updatedBy: meta.updatedBy || 'admin' }; },
    loadReleasePolicyFile(fp, fb) { try { return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : structuredClone(fb); } catch { return structuredClone(fb); } },
    saveReleasePolicyFile(fp, p) { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, JSON.stringify(p, null, 2) + '\n', 'utf8'); },
    evaluateCompatibility({ serverBuildInfo }) {
      return { decision: 'COMPAT_ALLOW', reason: 'COMPAT_REASON_OK', httpStatus: 200, wsCloseCode: null, allowed: true, target: serverBuildInfo.target, updatePolicy: serverBuildInfo.updatePolicy || 'optional', updateRecommended: false, updateRequired: false, updateRequiredAfterMatch: false, graceRemainingSec: 0, targetPool: null, action: { kind: 'none', storeUrl: null, notice: '' }, server: { target: serverBuildInfo.target, buildId: serverBuildInfo.buildId, buildCode: serverBuildInfo.buildCode, semver: serverBuildInfo.semver, channel: serverBuildInfo.channel, compat: serverBuildInfo.compat } };
    },
  };
}

const {
  resolveBuildInfo,
  createDefaultReleasePolicy,
  applyEnvPolicyOverrides,
  mergeReleasePolicy,
  loadReleasePolicyFile,
  saveReleasePolicyFile,
  evaluateCompatibility,
} = bv;

function readPackageVersion(rootDir) {
  for (const candidate of [path.join(rootDir, 'package.json'), path.join(rootDir, '..', 'hub', 'package.json')]) {
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim();
    } catch {}
  }
  return '0.3.0';
}

function loadEmbeddedBuildInfo(candidates) {
  for (const filePath of candidates) {
    if (!filePath) continue;
    try {
      if (!fs.existsSync(filePath)) continue;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && typeof parsed.buildId === 'string' && parsed.compat) {
        return parsed;
      }
    } catch {}
  }
  return null;
}

function buildFallbackBuildInfo(rootDir, env, now) {
  const semver = readPackageVersion(rootDir);
  const channel = String(env.PLAYHUB_CHANNEL || (env.NODE_ENV === 'production' ? 'dev' : 'local')).trim().toLowerCase();
  const buildNum = Number.isInteger(Number(env.PLAYHUB_BUILD_NUM)) && env.PLAYHUB_BUILD_NUM !== undefined && env.PLAYHUB_BUILD_NUM !== ''
    ? Number(env.PLAYHUB_BUILD_NUM)
    : 0;
  const dailySeq = Number.isInteger(Number(env.PLAYHUB_DAILY_SEQ)) && env.PLAYHUB_DAILY_SEQ !== undefined && env.PLAYHUB_DAILY_SEQ !== ''
    ? Number(env.PLAYHUB_DAILY_SEQ)
    : 0;
  const info = resolveBuildInfo({
    target: 'hub',
    semver,
    channel: ['local', 'dev', 'qa', 'rc', 'live'].includes(channel) ? channel : 'local',
    buildNum,
    dailySeq,
    date: env.PLAYHUB_BUILD_DATE || new Date(now()),
    branch: env.PLAYHUB_BRANCH || 'playhub-platform',
    commit: env.PLAYHUB_COMMIT || '0000000',
    dirty: false,
    engineAbi: env.PLAYHUB_ENGINE_ABI || 'godot-4.7',
    engineApiRev: env.PLAYHUB_ENGINE_API_REV ? Number(env.PLAYHUB_ENGINE_API_REV) : 1,
    minEngineApiRev: env.PLAYHUB_MIN_ENGINE_API_REV ? Number(env.PLAYHUB_MIN_ENGINE_API_REV) : 1,
    netProtocol: env.PLAYHUB_NET_PROTOCOL || '1.0',
    gameplayHash: env.PLAYHUB_GAMEPLAY_HASH || 'default',
    updatePolicy: env.PLAYHUB_UPDATE_POLICY === 'force' ? 'force' : 'optional',
    minClientBuildCode: env.PLAYHUB_MIN_CLIENT_BUILD_CODE ? Number(env.PLAYHUB_MIN_CLIENT_BUILD_CODE) : 0,
  });
  return info;
}

function applyBuildInfoEnvOverrides(info, env) {
  const next = structuredClone(info);
  if (typeof env.PLAYHUB_BUILD_ID === 'string' && env.PLAYHUB_BUILD_ID.trim()) {
    next.buildId = env.PLAYHUB_BUILD_ID.trim();
  }
  if (env.PLAYHUB_BUILD_CODE && Number.isInteger(Number(env.PLAYHUB_BUILD_CODE))) {
    next.buildCode = Number(env.PLAYHUB_BUILD_CODE);
  }
  if (typeof env.PLAYHUB_CHANNEL === 'string' && ['local', 'dev', 'qa', 'rc', 'live'].includes(env.PLAYHUB_CHANNEL.trim().toLowerCase())) {
    next.channel = env.PLAYHUB_CHANNEL.trim().toLowerCase();
  }
  if (typeof env.PLAYHUB_ENGINE_ABI === 'string' && env.PLAYHUB_ENGINE_ABI.trim()) {
    next.compat.engineAbi = env.PLAYHUB_ENGINE_ABI.trim();
  }
  if (env.PLAYHUB_ENGINE_API_REV && Number.isInteger(Number(env.PLAYHUB_ENGINE_API_REV))) {
    next.compat.engineApiRev = Number(env.PLAYHUB_ENGINE_API_REV);
  }
  if (env.PLAYHUB_MIN_ENGINE_API_REV && Number.isInteger(Number(env.PLAYHUB_MIN_ENGINE_API_REV))) {
    next.compat.minEngineApiRev = Number(env.PLAYHUB_MIN_ENGINE_API_REV);
  }
  if (typeof env.PLAYHUB_NET_PROTOCOL === 'string' && /^\d+\.\d+$/.test(env.PLAYHUB_NET_PROTOCOL.trim())) {
    next.compat.netProtocol = env.PLAYHUB_NET_PROTOCOL.trim();
  }
  if (typeof env.PLAYHUB_GAMEPLAY_HASH === 'string' && env.PLAYHUB_GAMEPLAY_HASH.trim()) {
    next.compat.gameplayHash = env.PLAYHUB_GAMEPLAY_HASH.trim();
  }
  return next;
}

export function createVersionCompat({ config, rootDir, platformRoot, now, audit, env = process.env }) {
  const embedded = loadEmbeddedBuildInfo([
    env.PLAYHUB_BUILD_INFO_PATH || null,
    platformRoot ? path.join(platformRoot, 'BUILD_INFO.json') : null,
    rootDir ? path.join(rootDir, 'BUILD_INFO.json') : null,
  ]);
  const buildInfo = applyBuildInfoEnvOverrides(
    embedded || buildFallbackBuildInfo(rootDir, env, now),
    env,
  );

  const policyPath = path.join(config.dataDir, 'release-policy.json');
  const seedPolicy = applyEnvPolicyOverrides(
    createDefaultReleasePolicy({
      updatePolicy: buildInfo.updatePolicy,
      latestBuildCode: buildInfo.buildCode,
      minBuildCode: buildInfo.minClientBuildCode,
      updatedAtUtc: new Date(now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      updatedBy: 'system',
    }),
    env,
    buildInfo.buildCode,
  );
  let policy = loadReleasePolicyFile(policyPath, seedPolicy);

  function getPublicPolicySummary() {
    const targets = {};
    for (const [target, cfg] of Object.entries(policy.targets)) {
      targets[target] = {
        updatePolicy: cfg.updatePolicy,
        latestBuildCode: cfg.latestBuildCode,
        minBuildCode: cfg.minBuildCode,
        graceMinutes: cfg.graceMinutes,
        storeUrl: cfg.storeUrl,
        notice: cfg.notice,
      };
    }
    return {
      revision: policy.revision,
      defaultUpdatePolicy: policy.defaultUpdatePolicy,
      updatedAtUtc: policy.updatedAtUtc,
      targets,
    };
  }

  function handleVersion(res) {
    json(res, 200, {
      ok: true,
      buildInfo,
      releasePolicy: getPublicPolicySummary(),
    });
  }

  async function publicRoute(req, res, url) {
    if (url.pathname === '/api/version' && req.method === 'GET') {
      handleVersion(res);
      return true;
    }
    if (url.pathname === '/api/compat/check' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(422, 'COMPAT_CLIENT_INVALID', '클라이언트 버전 객체가 필요합니다.');
      }
      const result = evaluateCompatibility({
        serverBuildInfo: buildInfo,
        client: body,
        releasePolicy: policy,
        nowMs: now(),
      });
      res.setHeader('X-PlayHub-Compat-Decision', result.decision);
      res.setHeader('X-PlayHub-Compat-Reason', result.reason);
      json(res, result.httpStatus, result);
      return true;
    }
    return false;
  }

  async function adminRoute(req, res, url, session) {
    if (url.pathname === '/api/admin/release-policy' && req.method === 'GET') {
      json(res, 200, { buildInfo, policy });
      return true;
    }
    if (
      url.pathname === '/api/admin/release-policy' &&
      ['POST', 'PUT', 'PATCH'].includes(req.method)
    ) {
      const body = await readJson(req, 32768);
      let next;
      try {
        next = mergeReleasePolicy(policy, body, {
          nowMs: now(),
          updatedBy: session?.admin_username || 'admin',
        });
      } catch (err) {
        throw new ApiError(422, 'RELEASE_POLICY_INVALID', err.message);
      }
      saveReleasePolicyFile(policyPath, next);
      policy = next;
      const forceTargets = Object.entries(next.targets)
        .filter(([, cfg]) => cfg.updatePolicy === 'force')
        .map(([target]) => target);
      audit('system_release_policy_update', session?.admin_username || 'admin', {
        revision: next.revision,
        defaultUpdatePolicy: next.defaultUpdatePolicy,
        forceTargets,
        activePoolCount: next.activePools.length,
      });
      json(res, 200, { ok: true, policy: next });
      return true;
    }
    return false;
  }

  return {
    buildInfo,
    getPolicy: () => structuredClone(policy),
    handleVersion,
    publicRoute,
    adminRoute,
  };
}
