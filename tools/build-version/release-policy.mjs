import fs from 'node:fs';
import path from 'node:path';
import {
  TARGETS,
  UPDATE_POLICIES,
  MAX_GOOGLE_PLAY_VERSION_CODE,
} from './resolve-build-info.mjs';

export const DEFAULT_GRACE_MINUTES = 10;
export const MAX_GRACE_MINUTES = 1440;

function isValidBuildCode(value) {
  return (
    value === 0 ||
    value === null ||
    (Number.isInteger(value) && value > 0 && value < MAX_GOOGLE_PLAY_VERSION_CODE)
  );
}

function normalizeIsoUtc(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function createDefaultTargetPolicy(options = {}) {
  const updatePolicy = options.updatePolicy === 'force' ? 'force' : 'optional';
  const forceSinceUtc = updatePolicy === 'force' ? normalizeIsoUtc(options.forceSinceUtc) : null;
  return {
    updatePolicy,
    latestBuildCode: Number.isInteger(options.latestBuildCode) ? options.latestBuildCode : 0,
    minBuildCode: Number.isInteger(options.minBuildCode) ? options.minBuildCode : 0,
    graceMinutes: Number.isInteger(options.graceMinutes) ? options.graceMinutes : DEFAULT_GRACE_MINUTES,
    forceSinceUtc,
    storeUrl: typeof options.storeUrl === 'string' && options.storeUrl.trim() ? options.storeUrl.trim() : null,
    notice: typeof options.notice === 'string' ? options.notice : '',
  };
}

export function createDefaultReleasePolicy(options = {}) {
  const defaultUpdatePolicy = options.updatePolicy === 'force' ? 'force' : 'optional';
  const latestBuildCode = Number.isInteger(options.latestBuildCode) ? options.latestBuildCode : 0;
  const minBuildCode = Number.isInteger(options.minBuildCode) ? options.minBuildCode : 0;
  const serverTarget = TARGETS.includes(options.serverTarget) ? options.serverTarget : null;
  const updatedAtUtc =
    normalizeIsoUtc(options.updatedAtUtc) || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const targets = {};
  for (const target of TARGETS) {
    const applyServerDefaults = !serverTarget || target === serverTarget;
    const targetUpdatePolicy = applyServerDefaults ? defaultUpdatePolicy : 'optional';
    targets[target] = createDefaultTargetPolicy({
      updatePolicy: targetUpdatePolicy,
      latestBuildCode: applyServerDefaults ? latestBuildCode : 0,
      minBuildCode: applyServerDefaults ? minBuildCode : 0,
      graceMinutes: options.graceMinutes ?? DEFAULT_GRACE_MINUTES,
      forceSinceUtc: targetUpdatePolicy === 'force' ? (options.forceSinceUtc ?? updatedAtUtc) : null,
    });
  }
  return {
    schemaVersion: 1,
    revision: 1,
    defaultUpdatePolicy,
    updatedAtUtc,
    updatedBy: options.updatedBy || 'system',
    targets,
    activePools: Array.isArray(options.activePools) ? options.activePools : [],
  };
}

export function parseForceTargetsList(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  if (raw.toLowerCase() === 'all' || raw === '*') return [...TARGETS];
  const parsed = [];
  for (const token of raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)) {
    const normalized = token === 'forge' ? 'forge-web' : token;
    if (TARGETS.includes(normalized) && !parsed.includes(normalized)) {
      parsed.push(normalized);
    }
  }
  return parsed;
}

export function applyEnvPolicyOverrides(policy, env = process.env, serverBuildCode = 0, serverTarget = 'hub') {
  const next = structuredClone(policy);
  const envPolicy = String(env.PLAYHUB_UPDATE_POLICY || '').trim().toLowerCase();
  const forceTargets = parseForceTargetsList(env.PLAYHUB_FORCE_TARGETS || '');
  const minCodeEnv = env.PLAYHUB_MIN_CLIENT_BUILD_CODE ? Number(env.PLAYHUB_MIN_CLIENT_BUILD_CODE) : 0;
  const graceEnv = env.PLAYHUB_UPDATE_GRACE_MINUTES !== undefined && env.PLAYHUB_UPDATE_GRACE_MINUTES !== ''
    ? Number(env.PLAYHUB_UPDATE_GRACE_MINUTES)
    : null;
  const resolvedTarget = TARGETS.includes(serverTarget) ? serverTarget : 'hub';
  const nowUtc = normalizeIsoUtc(next.updatedAtUtc) || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (serverBuildCode > 0 && next.targets[resolvedTarget] && !next.targets[resolvedTarget].latestBuildCode) {
    next.targets[resolvedTarget].latestBuildCode = serverBuildCode;
  }

  if (UPDATE_POLICIES.includes(envPolicy)) {
    next.defaultUpdatePolicy = envPolicy;
    if (envPolicy === 'force' && forceTargets.length === 0) {
      if (next.targets[resolvedTarget]) {
        next.targets[resolvedTarget].updatePolicy = 'force';
        next.targets[resolvedTarget].forceSinceUtc = next.targets[resolvedTarget].forceSinceUtc || nowUtc;
      }
    } else if (envPolicy === 'optional' && forceTargets.length === 0) {
      for (const target of TARGETS) {
        next.targets[target].updatePolicy = 'optional';
        next.targets[target].forceSinceUtc = null;
      }
    }
  }

  if (forceTargets.length > 0) {
    for (const target of forceTargets) {
      next.targets[target].updatePolicy = 'force';
      next.targets[target].forceSinceUtc = next.targets[target].forceSinceUtc || nowUtc;
    }
  }

  if (Number.isInteger(minCodeEnv) && minCodeEnv > 0 && minCodeEnv < MAX_GOOGLE_PLAY_VERSION_CODE) {
    const minTargets = forceTargets.length > 0 ? forceTargets : [resolvedTarget];
    for (const target of minTargets) {
      if (next.targets[target]) {
        next.targets[target].minBuildCode = Math.max(next.targets[target].minBuildCode || 0, minCodeEnv);
      }
    }
  }

  if (graceEnv !== null && Number.isInteger(graceEnv) && graceEnv >= 0 && graceEnv <= MAX_GRACE_MINUTES) {
    for (const target of TARGETS) {
      next.targets[target].graceMinutes = graceEnv;
    }
  }

  return next;
}

export function validateReleasePolicyPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Release policy patch must be a JSON object');
  }
  const normalized = {};

  if (patch.defaultUpdatePolicy !== undefined) {
    if (!UPDATE_POLICIES.includes(patch.defaultUpdatePolicy)) {
      throw new Error(`Invalid defaultUpdatePolicy: ${patch.defaultUpdatePolicy}`);
    }
    normalized.defaultUpdatePolicy = patch.defaultUpdatePolicy;
  }

  if (patch.forceTargets !== undefined) {
    if (Array.isArray(patch.forceTargets)) {
      for (const t of patch.forceTargets) {
        if (!TARGETS.includes(t)) throw new Error(`Unknown force target: ${t}`);
      }
      normalized.forceTargets = [...new Set(patch.forceTargets)];
    } else if (typeof patch.forceTargets === 'string') {
      normalized.forceTargets = parseForceTargetsList(patch.forceTargets);
    } else {
      throw new Error('forceTargets must be an array of target names or comma-separated string');
    }
  }

  if (patch.targets !== undefined) {
    if (!patch.targets || typeof patch.targets !== 'object' || Array.isArray(patch.targets)) {
      throw new Error('targets must be an object keyed by target name');
    }
    normalized.targets = {};
    for (const [target, cfg] of Object.entries(patch.targets)) {
      if (!TARGETS.includes(target)) {
        throw new Error(`Unknown target in release policy: ${target}`);
      }
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
        throw new Error(`Policy for target "${target}" must be an object`);
      }
      const clean = {};
      if (cfg.updatePolicy !== undefined) {
        if (!UPDATE_POLICIES.includes(cfg.updatePolicy)) {
          throw new Error(`Invalid updatePolicy for "${target}": ${cfg.updatePolicy}`);
        }
        clean.updatePolicy = cfg.updatePolicy;
      }
      if (cfg.latestBuildCode !== undefined) {
        const val = cfg.latestBuildCode === null ? 0 : Number(cfg.latestBuildCode);
        if (!isValidBuildCode(val)) {
          throw new Error(`Invalid latestBuildCode for "${target}": ${cfg.latestBuildCode}`);
        }
        clean.latestBuildCode = val;
      }
      if (cfg.minBuildCode !== undefined) {
        const val = cfg.minBuildCode === null ? 0 : Number(cfg.minBuildCode);
        if (!isValidBuildCode(val)) {
          throw new Error(`Invalid minBuildCode for "${target}": ${cfg.minBuildCode}`);
        }
        clean.minBuildCode = val;
      }
      if (cfg.graceMinutes !== undefined) {
        const val = Number(cfg.graceMinutes);
        if (!Number.isInteger(val) || val < 0 || val > MAX_GRACE_MINUTES) {
          throw new Error(`Invalid graceMinutes for "${target}": ${cfg.graceMinutes}`);
        }
        clean.graceMinutes = val;
      }
      if (cfg.forceSinceUtc !== undefined) {
        if (cfg.forceSinceUtc === null || cfg.forceSinceUtc === '') {
          clean.forceSinceUtc = null;
        } else {
          const normalizedUtc = normalizeIsoUtc(cfg.forceSinceUtc);
          if (!normalizedUtc) {
            throw new Error(`Invalid forceSinceUtc for "${target}": ${cfg.forceSinceUtc}`);
          }
          clean.forceSinceUtc = normalizedUtc;
        }
      }
      if (cfg.storeUrl !== undefined) {
        if (cfg.storeUrl !== null && (typeof cfg.storeUrl !== 'string' || cfg.storeUrl.length > 512)) {
          throw new Error(`Invalid storeUrl for "${target}"`);
        }
        if (cfg.storeUrl && !/^https?:\/\//i.test(cfg.storeUrl.trim())) {
          throw new Error(`storeUrl for "${target}" must start with http:// or https://`);
        }
        clean.storeUrl = cfg.storeUrl ? cfg.storeUrl.trim() : null;
      }
      if (cfg.notice !== undefined) {
        if (typeof cfg.notice !== 'string' || cfg.notice.length > 500) {
          throw new Error(`Invalid notice for "${target}"`);
        }
        clean.notice = cfg.notice.trim();
      }
      normalized.targets[target] = clean;
    }
  }

  if (patch.activePools !== undefined) {
    if (!Array.isArray(patch.activePools) || patch.activePools.length > 64) {
      throw new Error('activePools must be an array with at most 64 entries');
    }
    normalized.activePools = patch.activePools.map((pool, idx) => {
      if (!pool || typeof pool !== 'object' || Array.isArray(pool)) {
        throw new Error(`activePools[${idx}] must be an object`);
      }
      const poolId = String(pool.poolId || '').trim();
      const gameplayHash = String(pool.gameplayHash || '').trim();
      const endpoint = String(pool.endpoint || '').trim();
      if (!poolId || poolId.length > 64) throw new Error(`activePools[${idx}].poolId is required`);
      if (!gameplayHash || gameplayHash.length > 128) throw new Error(`activePools[${idx}].gameplayHash is required`);
      if (!endpoint || !/^(https?|wss?):\/\//i.test(endpoint)) {
        throw new Error(`activePools[${idx}].endpoint must be an http(s) or ws(s) URL`);
      }
      let expiresAtUtc = null;
      if (pool.expiresAtUtc) {
        const parsed = Date.parse(pool.expiresAtUtc);
        if (!Number.isFinite(parsed)) throw new Error(`activePools[${idx}].expiresAtUtc is invalid`);
        expiresAtUtc = new Date(parsed).toISOString().replace(/\.\d{3}Z$/, 'Z');
      }
      return {
        poolId,
        gameplayHash,
        endpoint,
        drainOnly: pool.drainOnly !== false,
        expiresAtUtc,
      };
    });
  }

  return normalized;
}

export function mergeReleasePolicy(current, rawPatch, meta = {}) {
  const patch = validateReleasePolicyPatch(rawPatch);
  const next = structuredClone(current);
  const nowIso = new Date(meta.nowMs ?? Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z');

  if (patch.defaultUpdatePolicy !== undefined) {
    next.defaultUpdatePolicy = patch.defaultUpdatePolicy;
  }

  if (patch.forceTargets !== undefined) {
    const forceSet = new Set(patch.forceTargets);
    for (const target of TARGETS) {
      next.targets[target].updatePolicy = forceSet.has(target) ? 'force' : 'optional';
    }
  }

  if (patch.targets) {
    for (const [target, cfg] of Object.entries(patch.targets)) {
      next.targets[target] = {
        ...next.targets[target],
        ...cfg,
      };
    }
  }

  if (patch.activePools !== undefined) {
    next.activePools = patch.activePools;
  }

  for (const target of TARGETS) {
    const prevTarget = current.targets?.[target];
    const nextTarget = next.targets[target];
    const explicitForceSince = patch.targets?.[target]?.forceSinceUtc;
    if (nextTarget.updatePolicy === 'force') {
      if (explicitForceSince !== undefined && explicitForceSince !== null) {
        nextTarget.forceSinceUtc = explicitForceSince;
      } else if (prevTarget?.updatePolicy === 'force' && normalizeIsoUtc(prevTarget.forceSinceUtc)) {
        nextTarget.forceSinceUtc = normalizeIsoUtc(prevTarget.forceSinceUtc);
      } else {
        nextTarget.forceSinceUtc = nowIso;
      }
    } else {
      nextTarget.forceSinceUtc = null;
    }
  }

  next.revision = Number(current.revision || 0) + 1;
  next.updatedAtUtc = nowIso;
  next.updatedBy = meta.updatedBy || 'admin';
  return next;
}

export function loadReleasePolicyFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return structuredClone(fallback);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !parsed.targets) {
      return structuredClone(fallback);
    }
    const base = createDefaultReleasePolicy({
      updatePolicy: parsed.defaultUpdatePolicy,
      updatedAtUtc: parsed.updatedAtUtc,
      updatedBy: parsed.updatedBy,
      activePools: parsed.activePools,
    });
    base.revision = Number.isInteger(parsed.revision) ? parsed.revision : 1;
    for (const target of TARGETS) {
      if (parsed.targets[target]) {
        const rawTarget = parsed.targets[target];
        const mergedTarget = {
          ...base.targets[target],
          ...rawTarget,
        };
        if (mergedTarget.updatePolicy === 'force' && !normalizeIsoUtc(rawTarget.forceSinceUtc)) {
          mergedTarget.forceSinceUtc = base.updatedAtUtc;
        }
        base.targets[target] = createDefaultTargetPolicy(mergedTarget);
      }
    }
    return base;
  } catch {
    return structuredClone(fallback);
  }
}

export function saveReleasePolicyFile(filePath, policy) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(policy, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, filePath);
}
