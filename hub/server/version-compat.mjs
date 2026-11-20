import fs from 'node:fs';
import path from 'node:path';
import { ApiError, readJson, json } from './security.mjs';

export function createFallbackBuildVersion() {
  const TARGETS = ['aos', 'ios', 'forge-desktop', 'forge-web', 'hub', 'godot-server'];
  const STRICT_CLEAN_CHANNELS = new Set(['qa', 'rc', 'live']);
  const UPDATE_POLICIES = ['optional', 'force'];
  const MAX_BUILD_CODE = 2100000000;
  const MAX_GRACE_MINUTES = 1440;

  const normalizeUtc = (val, fallbackMs = Date.now()) => {
    if (typeof val === 'string' && val.trim()) {
      const ms = Date.parse(val);
      if (Number.isFinite(ms)) return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    return fallbackMs === null ? null : new Date(fallbackMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
  };
  const isValidCode = v => v === 0 || v === null || (Number.isInteger(v) && v > 0 && v < MAX_BUILD_CODE);
  const parseProto = v => {
    const m = String(v || '').trim().match(/^(\d+)\.(\d+)$/);
    return m ? { major: Number(m[1]), minor: Number(m[2]) } : null;
  };
  const parseForceTargets = raw => {
    const s = String(raw || '').trim();
    if (!s) return [];
    if (s.toLowerCase() === 'all' || s === '*') return [...TARGETS];
    const out = [];
    for (const tok of s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)) {
      const norm = tok === 'forge' ? 'forge-web' : tok;
      if (TARGETS.includes(norm) && !out.includes(norm)) out.push(norm);
    }
    return out;
  };

  return {
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
      const defaultUpdatePolicy = opts.updatePolicy === 'force' ? 'force' : 'optional';
      const serverTarget = TARGETS.includes(opts.serverTarget) ? opts.serverTarget : null;
      const updatedAtUtc = normalizeUtc(opts.updatedAtUtc);
      const targets = {};
      for (const t of TARGETS) {
        const apply = !serverTarget || t === serverTarget;
        const up = apply ? defaultUpdatePolicy : 'optional';
        targets[t] = {
          updatePolicy: up,
          latestBuildCode: apply ? (opts.latestBuildCode || 0) : 0,
          minBuildCode: apply ? (opts.minBuildCode || 0) : 0,
          graceMinutes: Number.isInteger(opts.graceMinutes) ? opts.graceMinutes : 10,
          forceSinceUtc: up === 'force' ? updatedAtUtc : null,
          storeUrl: null,
          notice: '',
        };
      }
      return { schemaVersion: 1, revision: 1, defaultUpdatePolicy, updatedAtUtc, updatedBy: opts.updatedBy || 'system', targets, activePools: [] };
    },
    applyEnvPolicyOverrides(p, envObj = process.env, serverBuildCode = 0, serverTarget = 'hub') {
      const next = structuredClone(p);
      const resolved = TARGETS.includes(serverTarget) ? serverTarget : 'hub';
      const nowUtc = normalizeUtc(next.updatedAtUtc);
      if (serverBuildCode > 0 && next.targets?.[resolved] && !next.targets[resolved].latestBuildCode) {
        next.targets[resolved].latestBuildCode = serverBuildCode;
      }
      const envPolicy = String(envObj?.PLAYHUB_UPDATE_POLICY || '').trim().toLowerCase();
      const forceTargets = parseForceTargets(envObj?.PLAYHUB_FORCE_TARGETS || '');
      if (UPDATE_POLICIES.includes(envPolicy)) {
        next.defaultUpdatePolicy = envPolicy;
        if (envPolicy === 'force' && forceTargets.length === 0 && next.targets?.[resolved]) {
          next.targets[resolved].updatePolicy = 'force';
          next.targets[resolved].forceSinceUtc = next.targets[resolved].forceSinceUtc || nowUtc;
        } else if (envPolicy === 'optional' && forceTargets.length === 0) {
          for (const t of TARGETS) {
            if (next.targets?.[t]) { next.targets[t].updatePolicy = 'optional'; next.targets[t].forceSinceUtc = null; }
          }
        }
      }
      for (const t of forceTargets) {
        if (next.targets?.[t]) {
          next.targets[t].updatePolicy = 'force';
          next.targets[t].forceSinceUtc = next.targets[t].forceSinceUtc || nowUtc;
        }
      }
      return next;
    },
    mergeReleasePolicy(cur, rawPatch, meta = {}) {
      if (!rawPatch || typeof rawPatch !== 'object' || Array.isArray(rawPatch)) {
        throw new Error('Release policy patch must be a JSON object');
      }
      const next = structuredClone(cur);
      const nowIso = normalizeUtc(null, meta.nowMs ?? Date.now());
      if (rawPatch.defaultUpdatePolicy !== undefined) {
        if (!UPDATE_POLICIES.includes(rawPatch.defaultUpdatePolicy)) {
          throw new Error(`Invalid defaultUpdatePolicy: ${rawPatch.defaultUpdatePolicy}`);
        }
        next.defaultUpdatePolicy = rawPatch.defaultUpdatePolicy;
      }
      if (rawPatch.forceTargets !== undefined) {
        let list;
        if (Array.isArray(rawPatch.forceTargets)) {
          for (const t of rawPatch.forceTargets) {
            if (!TARGETS.includes(t)) throw new Error(`Unknown force target: ${t}`);
          }
          list = [...new Set(rawPatch.forceTargets)];
        } else if (typeof rawPatch.forceTargets === 'string') {
          list = parseForceTargets(rawPatch.forceTargets);
        } else {
          throw new Error('forceTargets must be an array or comma-separated string');
        }
        const forceSet = new Set(list);
        for (const t of TARGETS) {
          next.targets[t].updatePolicy = forceSet.has(t) ? 'force' : 'optional';
        }
      }
      if (rawPatch.targets !== undefined) {
        if (!rawPatch.targets || typeof rawPatch.targets !== 'object' || Array.isArray(rawPatch.targets)) {
          throw new Error('targets must be an object keyed by target name');
        }
        for (const [t, cfg] of Object.entries(rawPatch.targets)) {
          if (!TARGETS.includes(t)) throw new Error(`Unknown target in release policy: ${t}`);
          if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error(`Policy for target "${t}" must be an object`);
          const targetObj = { ...next.targets[t] };
          if (cfg.updatePolicy !== undefined) {
            if (!UPDATE_POLICIES.includes(cfg.updatePolicy)) throw new Error(`Invalid updatePolicy for "${t}"`);
            targetObj.updatePolicy = cfg.updatePolicy;
          }
          if (cfg.latestBuildCode !== undefined) {
            const val = cfg.latestBuildCode === null ? 0 : Number(cfg.latestBuildCode);
            if (!isValidCode(val)) throw new Error(`Invalid latestBuildCode for "${t}"`);
            targetObj.latestBuildCode = val;
          }
          if (cfg.minBuildCode !== undefined) {
            const val = cfg.minBuildCode === null ? 0 : Number(cfg.minBuildCode);
            if (!isValidCode(val)) throw new Error(`Invalid minBuildCode for "${t}"`);
            targetObj.minBuildCode = val;
          }
          if (cfg.graceMinutes !== undefined) {
            const val = Number(cfg.graceMinutes);
            if (!Number.isInteger(val) || val < 0 || val > MAX_GRACE_MINUTES) throw new Error(`Invalid graceMinutes for "${t}"`);
            targetObj.graceMinutes = val;
          }
          if (cfg.storeUrl !== undefined) {
            if (cfg.storeUrl !== null && (typeof cfg.storeUrl !== 'string' || cfg.storeUrl.length > 512)) throw new Error(`Invalid storeUrl for "${t}"`);
            if (cfg.storeUrl && !/^https?:\/\//i.test(cfg.storeUrl.trim())) throw new Error(`storeUrl for "${t}" must start with http:// or https://`);
            targetObj.storeUrl = cfg.storeUrl ? cfg.storeUrl.trim() : null;
          }
          if (cfg.notice !== undefined) {
            if (typeof cfg.notice !== 'string' || cfg.notice.length > 500) throw new Error(`Invalid notice for "${t}"`);
            targetObj.notice = cfg.notice.trim();
          }
          next.targets[t] = targetObj;
        }
      }
      if (rawPatch.activePools !== undefined) {
        if (!Array.isArray(rawPatch.activePools) || rawPatch.activePools.length > 64) {
          throw new Error('activePools must be an array with at most 64 entries');
        }
        next.activePools = rawPatch.activePools.map((pool, idx) => {
          if (!pool || typeof pool !== 'object' || Array.isArray(pool)) throw new Error(`activePools[${idx}] must be an object`);
          const poolId = String(pool.poolId || '').trim();
          const gameplayHash = String(pool.gameplayHash || '').trim();
          const endpoint = String(pool.endpoint || '').trim();
          if (!poolId || poolId.length > 64) throw new Error(`activePools[${idx}].poolId is required`);
          if (!gameplayHash || gameplayHash.length > 128) throw new Error(`activePools[${idx}].gameplayHash is required`);
          if (!endpoint || !/^(https?|wss?):\/\//i.test(endpoint)) throw new Error(`activePools[${idx}].endpoint must be http(s) or ws(s) URL`);
          let expiresAtUtc = null;
          if (pool.expiresAtUtc) {
            expiresAtUtc = normalizeUtc(pool.expiresAtUtc, null);
            if (!expiresAtUtc) throw new Error(`activePools[${idx}].expiresAtUtc is invalid`);
          }
          return { poolId, gameplayHash, endpoint, drainOnly: pool.drainOnly !== false, expiresAtUtc };
        });
      }
      for (const t of TARGETS) {
        const prevT = cur.targets?.[t];
        if (next.targets[t].updatePolicy === 'force') {
          next.targets[t].forceSinceUtc = (prevT?.updatePolicy === 'force' && normalizeUtc(prevT.forceSinceUtc, null)) || nowIso;
        } else {
          next.targets[t].forceSinceUtc = null;
        }
      }
      next.revision = Number(cur.revision || 0) + 1;
      next.updatedAtUtc = nowIso;
      next.updatedBy = meta.updatedBy || 'admin';
      return next;
    },
    loadReleasePolicyFile(fp, fb) { try { return fs.existsSync(fp) ? JSON.parse(fs.readFileSync(fp, 'utf8')) : structuredClone(fb); } catch { return structuredClone(fb); } },
    saveReleasePolicyFile(fp, p) { fs.mkdirSync(path.dirname(fp), { recursive: true }); fs.writeFileSync(fp, JSON.stringify(p, null, 2) + '\n', 'utf8'); },
    evaluateCompatibility({ serverBuildInfo, client = {}, releasePolicy = null, nowMs = Date.now() }) {
      const clientTarget = TARGETS.includes(client.target) ? client.target : serverBuildInfo.target;
      const targetPolicy = releasePolicy?.targets?.[clientTarget] || null;
      const effectiveUpdatePolicy =
        targetPolicy?.updatePolicy ||
        (clientTarget === serverBuildInfo.target ? serverBuildInfo.updatePolicy : null) ||
        'optional';
      const serverCompat = serverBuildInfo.compat || { engineAbi: 'godot-4.7', engineApiRev: 1, minEngineApiRev: 1, netProtocol: '1.0', gameplayHash: 'default' };
      const mk = (decision, reason, extras = {}) => {
        const blocked = decision === 'COMPAT_BLOCK_FORCE_UPDATE';
        return {
          decision, reason,
          httpStatus: blocked ? 426 : 200,
          wsCloseCode: blocked ? 4009 : null,
          allowed: !blocked,
          target: clientTarget,
          updatePolicy: effectiveUpdatePolicy,
          updateRecommended: decision === 'COMPAT_ALLOW_SOFT_UPDATE',
          updateRequired: blocked,
          updateRequiredAfterMatch: Boolean(extras.updateRequiredAfterMatch),
          graceRemainingSec: extras.graceRemainingSec || 0,
          targetPool: extras.targetPool || null,
          action: { kind: blocked ? 'reload' : 'none', storeUrl: targetPolicy?.storeUrl || null, notice: targetPolicy?.notice || '' },
          server: { target: serverBuildInfo.target, buildId: serverBuildInfo.buildId, buildCode: serverBuildInfo.buildCode, semver: serverBuildInfo.semver, channel: serverBuildInfo.channel, compat: serverCompat },
        };
      };
      const isDirty = client.dirty === true || (typeof client.buildId === 'string' && client.buildId.endsWith('-dirty'));
      if (isDirty && STRICT_CLEAN_CHANNELS.has(serverBuildInfo.channel)) return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_DIRTY_BUILD_BLOCKED');
      if (client.engineAbi && serverCompat.engineAbi && client.engineAbi !== serverCompat.engineAbi) return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_ENGINE_ABI_MISMATCH');
      if (client.engineApiRev !== undefined && client.engineApiRev !== null) {
        const rev = Number(client.engineApiRev);
        const minRev = Number(serverCompat.minEngineApiRev ?? serverCompat.engineApiRev ?? 1);
        const maxRev = Number(serverCompat.engineApiRev ?? 1);
        if (!Number.isInteger(rev) || rev < minRev || rev > maxRev) return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_ENGINE_API_REV_MISMATCH');
      }
      const sp = parseProto(serverCompat.netProtocol);
      const cp = client.netProtocol ? parseProto(client.netProtocol) : null;
      if (client.netProtocol && (!cp || !sp || cp.major !== sp.major)) return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_PROTOCOL_MAJOR_MISMATCH');
      const clientCode = client.buildCode !== undefined && client.buildCode !== null && client.buildCode !== '' ? Number(client.buildCode) : null;
      const serverMin = clientTarget === serverBuildInfo.target ? Number(serverBuildInfo.minClientBuildCode || 0) : 0;
      const effMin = Math.max(serverMin, Number(targetPolicy?.minBuildCode || 0));
      if (clientCode !== null && Number.isFinite(clientCode) && effMin > 0 && clientCode < effMin) {
        return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_BELOW_MIN_CLIENT_BUILD');
      }
      const latest = Number(targetPolicy?.latestBuildCode || (clientTarget === serverBuildInfo.target ? serverBuildInfo.buildCode : 0) || 0);
      const behind = clientCode !== null && Number.isFinite(clientCode) && latest > 0 && clientCode < latest;
      if (effectiveUpdatePolicy === 'force' && behind) {
        const graceMin = Number(targetPolicy?.graceMinutes ?? 0);
        const anchorMs = Date.parse(targetPolicy?.forceSinceUtc || releasePolicy?.updatedAtUtc || '');
        const graceRem = graceMin > 0 && Number.isFinite(anchorMs) ? Math.max(0, Math.ceil((anchorMs + graceMin * 60000 - nowMs) / 1000)) : 0;
        if (client.inMatch === true && graceRem > 0) return mk('COMPAT_ALLOW_SOFT_UPDATE', 'COMPAT_REASON_POLICY_FORCE_UPDATE', { graceRemainingSec: graceRem, updateRequiredAfterMatch: true });
        return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_POLICY_FORCE_UPDATE');
      }
      if (client.gameplayHash && serverCompat.gameplayHash && client.gameplayHash !== serverCompat.gameplayHash) {
        const pools = Array.isArray(releasePolicy?.activePools) ? releasePolicy.activePools : [];
        const pool = pools.find(p => p.gameplayHash === client.gameplayHash && (!p.expiresAtUtc || Date.parse(p.expiresAtUtc) > nowMs));
        if (pool) return mk('COMPAT_ROUTE_LEGACY_POOL', 'COMPAT_REASON_GAME_RELEASE_DRAIN', { targetPool: pool });
        return mk('COMPAT_BLOCK_FORCE_UPDATE', 'COMPAT_REASON_GAMEPLAY_HASH_MISMATCH');
      }
      if (cp && sp && cp.minor < sp.minor) return mk('COMPAT_ALLOW_SOFT_UPDATE', 'COMPAT_REASON_MINOR_BEHIND');
      if (behind) return mk('COMPAT_ALLOW_SOFT_UPDATE', 'COMPAT_REASON_POLICY_OPTIONAL_UPDATE');
      return mk('COMPAT_ALLOW', 'COMPAT_REASON_OK');
    },
  };
}

let bv;
try {
  bv = await import('../../tools/build-version/index.mjs');
} catch (err) {
  // Standalone SEA fallback when repository-level tools/build-version/ is absent.
  console.warn('[version-compat] Failed to import tools/build-version/index.mjs; using minimal fallback gate:', err?.message || err);
  bv = createFallbackBuildVersion();
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
      serverTarget: buildInfo.target,
      updatePolicy: buildInfo.updatePolicy,
      latestBuildCode: buildInfo.buildCode,
      minBuildCode: buildInfo.minClientBuildCode,
      updatedAtUtc: new Date(now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      updatedBy: 'system',
    }),
    env,
    buildInfo.buildCode,
    buildInfo.target,
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
        forceSinceUtc: cfg.forceSinceUtc || null,
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
