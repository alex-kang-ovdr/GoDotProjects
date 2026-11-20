'use strict';

const fs = require('node:fs');
const path = require('node:path');

const bv = require('../../tools/build-version/index.mjs');

const {
  resolveBuildInfo,
  createDefaultReleasePolicy,
  applyEnvPolicyOverrides,
  mergeReleasePolicy,
  evaluateCompatibility,
  COMPAT_DECISIONS,
  COMPAT_REASONS,
  COMPAT_WS_CLOSE_FORCE_UPDATE,
} = bv;

function readForgeSemver() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    if (typeof pkg.version === 'string' && pkg.version.trim()) return pkg.version.trim();
  } catch {}
  return '0.1.0';
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

function parseBoolParam(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const s = String(val).trim().toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return undefined;
}

function parseIntParam(val) {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isInteger(n) ? n : undefined;
}

function createMultiplayerCompat(options = {}) {
  const env = options.env || process.env;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const semver = readForgeSemver();
  const embedded = options.serverBuildInfo || loadEmbeddedBuildInfo([
    env.PLAYFORGE_BUILD_INFO_PATH || null,
    path.join(__dirname, '..', 'BUILD_INFO.json'),
  ]);

  const rawChannel = String(env.PLAYFORGE_CHANNEL || env.PLAYHUB_CHANNEL || 'local').trim().toLowerCase();
  const channel = ['local', 'dev', 'qa', 'rc', 'live'].includes(rawChannel) ? rawChannel : 'local';

  const serverBuildInfo = embedded
    ? structuredClone(embedded)
    : resolveBuildInfo({
        target: 'godot-server',
        semver,
        channel,
        buildNum: parseIntParam(env.PLAYFORGE_BUILD_NUM ?? env.PLAYHUB_BUILD_NUM) ?? 0,
        dailySeq: parseIntParam(env.PLAYFORGE_DAILY_SEQ ?? env.PLAYHUB_DAILY_SEQ) ?? 0,
        date: env.PLAYFORGE_BUILD_DATE || env.PLAYHUB_BUILD_DATE || new Date(now()),
        branch: env.PLAYFORGE_BRANCH || env.PLAYHUB_BRANCH || 'playhub-platform',
        commit: env.PLAYFORGE_COMMIT || env.PLAYHUB_COMMIT || '0000000',
        dirty: false,
        engineAbi: env.PLAYFORGE_ENGINE_ABI || env.PLAYHUB_ENGINE_ABI || 'godot-4.7',
        engineApiRev: parseIntParam(env.PLAYFORGE_ENGINE_API_REV ?? env.PLAYHUB_ENGINE_API_REV) ?? 1,
        minEngineApiRev: parseIntParam(env.PLAYFORGE_MIN_ENGINE_API_REV ?? env.PLAYHUB_MIN_ENGINE_API_REV) ?? 1,
        netProtocol: env.PLAYFORGE_NET_PROTOCOL || env.PLAYHUB_NET_PROTOCOL || '1.0',
        gameplayHash: env.PLAYFORGE_GAMEPLAY_HASH || env.PLAYHUB_GAMEPLAY_HASH || 'default',
        updatePolicy: (env.PLAYFORGE_UPDATE_POLICY || env.PLAYHUB_UPDATE_POLICY) === 'force' ? 'force' : 'optional',
        minClientBuildCode: parseIntParam(env.PLAYFORGE_MIN_CLIENT_BUILD_CODE ?? env.PLAYHUB_MIN_CLIENT_BUILD_CODE) ?? 0,
      });

  let releasePolicy = options.releasePolicy
    ? structuredClone(options.releasePolicy)
    : applyEnvPolicyOverrides(
        createDefaultReleasePolicy({
          updatePolicy: serverBuildInfo.updatePolicy,
          latestBuildCode: serverBuildInfo.buildCode,
          minBuildCode: serverBuildInfo.minClientBuildCode,
          updatedAtUtc: new Date(now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        }),
        env,
        serverBuildInfo.buildCode,
      );

  function extractClientFromRequest(req) {
    let params = null;
    try {
      params = new URL(req.url || '/', 'http://localhost').searchParams;
    } catch {
      params = new URLSearchParams();
    }
    const headers = req.headers || {};
    const pick = (queryKeys, headerKey) => {
      for (const qk of queryKeys) {
        const v = params.get(qk);
        if (v !== null && v !== '') return v;
      }
      const hv = headers[headerKey];
      return typeof hv === 'string' && hv.trim() ? hv.trim() : undefined;
    };

    const client = {
      target: pick(['compatTarget', 'target'], 'x-playhub-target'),
      buildId: pick(['compatBuildId', 'clientBuildId'], 'x-playhub-build-id'),
      buildCode: parseIntParam(pick(['compatBuildCode', 'buildCode'], 'x-playhub-build-code')),
      engineAbi: pick(['engineAbi'], 'x-playhub-engine-abi'),
      engineApiRev: parseIntParam(pick(['engineApiRev'], 'x-playhub-engine-api-rev')),
      netProtocol: pick(['netProtocol'], 'x-playhub-net-protocol'),
      gameplayHash: pick(['gameplayHash'], 'x-playhub-gameplay-hash'),
      dirty: parseBoolParam(pick(['dirty'], 'x-playhub-dirty')),
      inMatch: parseBoolParam(pick(['inMatch'], 'x-playhub-in-match')),
    };

    const hasAny = Object.values(client).some(v => v !== undefined);
    if (!hasAny) return null;

    const clean = {};
    for (const [k, v] of Object.entries(client)) {
      if (v !== undefined) clean[k] = v;
    }
    const compatMode = pick(['compatMode'], 'x-playhub-compat-mode') || 'ws';
    return { client: clean, compatMode: compatMode.toLowerCase() };
  }

  function check(client, atMs = now()) {
    return evaluateCompatibility({
      serverBuildInfo,
      client: client || {},
      releasePolicy,
      nowMs: atMs,
    });
  }

  function updatePolicy(patch, updatedBy = 'ops') {
    releasePolicy = mergeReleasePolicy(releasePolicy, patch, { nowMs: now(), updatedBy });
    return structuredClone(releasePolicy);
  }

  function writeUpgrade426(socket, result) {
    const payload = JSON.stringify(result);
    socket.end(
      'HTTP/1.1 426 Upgrade Required\r\n' +
        'Content-Type: application/json; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(payload)}\r\n` +
        `X-PlayHub-Compat-Decision: ${result.decision}\r\n` +
        `X-PlayHub-Compat-Reason: ${result.reason}\r\n` +
        'Connection: close\r\n\r\n' +
        payload,
    );
  }

  function enforceWsConnection(ws, req, sendJson) {
    const result = req?.compatResult;
    if (!result) return true;
    if (result.decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE) {
      sendJson(ws, { type: 'compat', ...result });
      ws.close(COMPAT_WS_CLOSE_FORCE_UPDATE, result.reason);
      return false;
    }
    if (result.decision !== COMPAT_DECISIONS.ALLOW) {
      sendJson(ws, { type: 'compat', ...result });
    }
    return true;
  }

  function enforceWsMessage(ws, message, sendJson) {
    if (!message || typeof message !== 'object') {
      return { handled: false, allowed: true, result: null };
    }
    if (message.type === 'compat_check') {
      const client = message.client && typeof message.client === 'object' ? message.client : message;
      const result = check(client);
      sendJson(ws, { type: 'compat', ...result });
      if (result.decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE) {
        ws.close(COMPAT_WS_CLOSE_FORCE_UPDATE, result.reason);
        return { handled: true, allowed: false, result };
      }
      return { handled: true, allowed: true, result };
    }
    if (message.type === 'join' && message.compat && typeof message.compat === 'object') {
      const result = check(message.compat);
      if (result.decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE) {
        sendJson(ws, { type: 'compat', ...result });
        ws.close(COMPAT_WS_CLOSE_FORCE_UPDATE, result.reason);
        return { handled: true, allowed: false, result };
      }
      if (result.decision !== COMPAT_DECISIONS.ALLOW) {
        sendJson(ws, { type: 'compat', ...result });
      }
      return { handled: false, allowed: true, result };
    }
    return { handled: false, allowed: true, result: null };
  }

  return {
    serverBuildInfo,
    getPolicy: () => structuredClone(releasePolicy),
    updatePolicy,
    extractClientFromRequest,
    check,
    writeUpgrade426,
    enforceWsConnection,
    enforceWsMessage,
    COMPAT_DECISIONS,
    COMPAT_REASONS,
    COMPAT_WS_CLOSE_FORCE_UPDATE,
  };
}

module.exports = {
  createMultiplayerCompat,
  COMPAT_DECISIONS,
  COMPAT_REASONS,
  COMPAT_WS_CLOSE_FORCE_UPDATE,
};
