import { TARGETS, STRICT_CLEAN_CHANNELS } from './resolve-build-info.mjs';

export const COMPAT_DECISIONS = Object.freeze({
  ALLOW: 'COMPAT_ALLOW',
  ALLOW_SOFT_UPDATE: 'COMPAT_ALLOW_SOFT_UPDATE',
  ROUTE_LEGACY_POOL: 'COMPAT_ROUTE_LEGACY_POOL',
  BLOCK_FORCE_UPDATE: 'COMPAT_BLOCK_FORCE_UPDATE',
});

export const COMPAT_REASONS = Object.freeze({
  OK: 'COMPAT_REASON_OK',
  POLICY_OPTIONAL_UPDATE: 'COMPAT_REASON_POLICY_OPTIONAL_UPDATE',
  MINOR_BEHIND: 'COMPAT_REASON_MINOR_BEHIND',
  GAME_RELEASE_DRAIN: 'COMPAT_REASON_GAME_RELEASE_DRAIN',
  ENGINE_ABI_MISMATCH: 'COMPAT_REASON_ENGINE_ABI_MISMATCH',
  ENGINE_API_REV_MISMATCH: 'COMPAT_REASON_ENGINE_API_REV_MISMATCH',
  PROTOCOL_MAJOR_MISMATCH: 'COMPAT_REASON_PROTOCOL_MAJOR_MISMATCH',
  GAMEPLAY_HASH_MISMATCH: 'COMPAT_REASON_GAMEPLAY_HASH_MISMATCH',
  BELOW_MIN_CLIENT_BUILD: 'COMPAT_REASON_BELOW_MIN_CLIENT_BUILD',
  POLICY_FORCE_UPDATE: 'COMPAT_REASON_POLICY_FORCE_UPDATE',
  DIRTY_BUILD_BLOCKED: 'COMPAT_REASON_DIRTY_BUILD_BLOCKED',
});

export const COMPAT_WS_CLOSE_FORCE_UPDATE = 4009;

export function parseNetProtocol(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d+)\.(\d+)$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
}

function actionKindForTarget(target, decision) {
  if (decision === COMPAT_DECISIONS.ALLOW || decision === COMPAT_DECISIONS.ROUTE_LEGACY_POOL) {
    return 'none';
  }
  switch (target) {
    case 'aos':
    case 'ios':
      return 'store_update';
    case 'forge-web':
    case 'hub':
      return 'reload';
    case 'forge-desktop':
      return 'installer';
    case 'godot-server':
      return 'server_upgrade';
    default:
      return 'reload';
  }
}

function findMatchingDrainPool(releasePolicy, gameplayHash, nowMs) {
  const pools = Array.isArray(releasePolicy?.activePools) ? releasePolicy.activePools : [];
  for (const pool of pools) {
    if (pool.gameplayHash !== gameplayHash) continue;
    if (pool.expiresAtUtc) {
      const exp = Date.parse(pool.expiresAtUtc);
      if (Number.isFinite(exp) && exp <= nowMs) continue;
    }
    return pool;
  }
  return null;
}

function computeGraceRemainingSec(releasePolicy, targetPolicy, nowMs) {
  const graceMinutes = Number(targetPolicy?.graceMinutes ?? 0);
  if (!Number.isFinite(graceMinutes) || graceMinutes <= 0) return 0;
  const updatedMs = releasePolicy?.updatedAtUtc ? Date.parse(releasePolicy.updatedAtUtc) : NaN;
  if (!Number.isFinite(updatedMs)) return 0;
  const deadlineMs = updatedMs + graceMinutes * 60 * 1000;
  return Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
}

export function evaluateCompatibility({
  serverBuildInfo,
  client = {},
  releasePolicy = null,
  nowMs = Date.now(),
}) {
  if (!serverBuildInfo || typeof serverBuildInfo !== 'object') {
    throw new Error('serverBuildInfo is required');
  }

  const clientTarget = TARGETS.includes(client.target) ? client.target : serverBuildInfo.target;
  const targetPolicy = releasePolicy?.targets?.[clientTarget] || null;
  const effectiveUpdatePolicy =
    targetPolicy?.updatePolicy || serverBuildInfo.updatePolicy || 'optional';

  const serverCompat = serverBuildInfo.compat || {
    engineAbi: 'godot-4.7',
    engineApiRev: 1,
    minEngineApiRev: 1,
    netProtocol: '1.0',
    gameplayHash: 'default',
  };

  const serverSummary = {
    target: serverBuildInfo.target,
    buildId: serverBuildInfo.buildId,
    buildCode: serverBuildInfo.buildCode,
    semver: serverBuildInfo.semver,
    channel: serverBuildInfo.channel,
    compat: serverCompat,
  };

  const buildResult = (decision, reason, extras = {}) => {
    const blocked = decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE;
    return {
      decision,
      reason,
      httpStatus: blocked ? 426 : 200,
      wsCloseCode: blocked ? COMPAT_WS_CLOSE_FORCE_UPDATE : null,
      allowed: !blocked,
      target: clientTarget,
      updatePolicy: effectiveUpdatePolicy,
      updateRecommended: decision === COMPAT_DECISIONS.ALLOW_SOFT_UPDATE,
      updateRequired: blocked,
      updateRequiredAfterMatch: Boolean(extras.updateRequiredAfterMatch),
      graceRemainingSec: extras.graceRemainingSec || 0,
      targetPool: extras.targetPool || null,
      action: {
        kind: actionKindForTarget(clientTarget, decision),
        storeUrl: targetPolicy?.storeUrl || null,
        notice: targetPolicy?.notice || '',
      },
      server: serverSummary,
    };
  };

  // 1. Hard Technical Guardrail — NEVER overridable by "optional" update policy
  const clientDirty =
    client.dirty === true ||
    (typeof client.buildId === 'string' && client.buildId.endsWith('-dirty'));
  if (clientDirty && STRICT_CLEAN_CHANNELS.has(serverBuildInfo.channel)) {
    return buildResult(COMPAT_DECISIONS.BLOCK_FORCE_UPDATE, COMPAT_REASONS.DIRTY_BUILD_BLOCKED);
  }

  if (client.engineAbi && serverCompat.engineAbi && client.engineAbi !== serverCompat.engineAbi) {
    return buildResult(COMPAT_DECISIONS.BLOCK_FORCE_UPDATE, COMPAT_REASONS.ENGINE_ABI_MISMATCH);
  }

  if (client.engineApiRev !== undefined && client.engineApiRev !== null) {
    const rev = Number(client.engineApiRev);
    const minRev = Number(serverCompat.minEngineApiRev ?? serverCompat.engineApiRev ?? 1);
    const maxRev = Number(serverCompat.engineApiRev ?? 1);
    if (!Number.isInteger(rev) || rev < minRev || rev > maxRev) {
      return buildResult(
        COMPAT_DECISIONS.BLOCK_FORCE_UPDATE,
        COMPAT_REASONS.ENGINE_API_REV_MISMATCH,
      );
    }
  }

  const serverProto = parseNetProtocol(serverCompat.netProtocol);
  const clientProto = client.netProtocol ? parseNetProtocol(client.netProtocol) : null;
  if (client.netProtocol && (!clientProto || !serverProto || clientProto.major !== serverProto.major)) {
    return buildResult(
      COMPAT_DECISIONS.BLOCK_FORCE_UPDATE,
      COMPAT_REASONS.PROTOCOL_MAJOR_MISMATCH,
    );
  }

  // 2. Kill-Switch Floor & Operator Force Policy
  const clientBuildCode =
    client.buildCode !== undefined && client.buildCode !== null && client.buildCode !== ''
      ? Number(client.buildCode)
      : null;

  const effectiveMinBuildCode = Math.max(
    Number(serverBuildInfo.minClientBuildCode || 0),
    Number(targetPolicy?.minBuildCode || 0),
  );
  if (
    clientBuildCode !== null &&
    Number.isFinite(clientBuildCode) &&
    effectiveMinBuildCode > 0 &&
    clientBuildCode < effectiveMinBuildCode
  ) {
    return buildResult(
      COMPAT_DECISIONS.BLOCK_FORCE_UPDATE,
      COMPAT_REASONS.BELOW_MIN_CLIENT_BUILD,
    );
  }

  const latestBuildCode = Number(
    targetPolicy?.latestBuildCode || (clientTarget === serverBuildInfo.target ? serverBuildInfo.buildCode : 0) || 0,
  );
  const isBuildBehind =
    (clientBuildCode !== null &&
      Number.isFinite(clientBuildCode) &&
      latestBuildCode > 0 &&
      clientBuildCode < latestBuildCode) ||
    (clientBuildCode === null &&
      typeof client.buildId === 'string' &&
      client.buildId.length > 0 &&
      clientTarget === serverBuildInfo.target &&
      client.buildId !== serverBuildInfo.buildId);

  if (effectiveUpdatePolicy === 'force' && isBuildBehind) {
    const graceRemainingSec = computeGraceRemainingSec(releasePolicy, targetPolicy, nowMs);
    if (client.inMatch === true && graceRemainingSec > 0) {
      return buildResult(
        COMPAT_DECISIONS.ALLOW_SOFT_UPDATE,
        COMPAT_REASONS.POLICY_FORCE_UPDATE,
        { graceRemainingSec, updateRequiredAfterMatch: true },
      );
    }
    return buildResult(COMPAT_DECISIONS.BLOCK_FORCE_UPDATE, COMPAT_REASONS.POLICY_FORCE_UPDATE);
  }

  // 3. Distributed Game Version (gameplayHash) — Route to Legacy Drain Pool or Block
  if (
    client.gameplayHash &&
    serverCompat.gameplayHash &&
    client.gameplayHash !== serverCompat.gameplayHash
  ) {
    const pool = findMatchingDrainPool(releasePolicy, client.gameplayHash, nowMs);
    if (pool) {
      return buildResult(COMPAT_DECISIONS.ROUTE_LEGACY_POOL, COMPAT_REASONS.GAME_RELEASE_DRAIN, {
        targetPool: pool,
      });
    }
    return buildResult(
      COMPAT_DECISIONS.BLOCK_FORCE_UPDATE,
      COMPAT_REASONS.GAMEPLAY_HASH_MISMATCH,
    );
  }

  // 4. Optional Update / Minor Protocol Behind
  if (clientProto && serverProto && clientProto.minor < serverProto.minor) {
    return buildResult(COMPAT_DECISIONS.ALLOW_SOFT_UPDATE, COMPAT_REASONS.MINOR_BEHIND);
  }

  if (isBuildBehind) {
    return buildResult(
      COMPAT_DECISIONS.ALLOW_SOFT_UPDATE,
      COMPAT_REASONS.POLICY_OPTIONAL_UPDATE,
    );
  }

  // 5. Exact Match
  return buildResult(COMPAT_DECISIONS.ALLOW, COMPAT_REASONS.OK);
}
