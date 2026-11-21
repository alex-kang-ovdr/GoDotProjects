'use strict';

const { EventEmitter } = require('node:events');
const http = require('node:http');
const { attachBrawlLabs } = require('./brawllabs-multiplayer.cjs');
const { attachFortressWar } = require('./fortress-multiplayer.cjs');
const { attachTappyChickenMmo } = require('./tappy-chicken-mmo-multiplayer.cjs');
const { attachCaptainForeverMmo } = require('./captain-forever-mmo-multiplayer.cjs');
const { createOriginPolicy } = require('./origin-policy.cjs');
const { createHubSessionAuth, hubAuthConfigFromEnv, validateHubAccountUrl } = require('./hub-session-auth.cjs');
const { createMultiplayerCompat, COMPAT_DECISIONS } = require('./multiplayer-compat.cjs');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const MULTIPLAYER_HTTP_RE = /^\/api\/(brawllabs|fortress-war|tappy-chicken-mmo|captain-forever-mmo)\/rooms\/([a-f0-9]{12})$/;
const MULTIPLAYER_WS_RE = /^\/(brawllabs|fortress-war|tappy-chicken-mmo|captain-forever-mmo)$/;
const ACCOUNT_KEY_RE = /^[a-f0-9]{64}$/;
const PROJECT_ID_RE = /^[a-f0-9]{24}$/;
const BUILD_ID_RE = /^[a-f0-9]{16}$/;

function isMultiplayerHttpRoute(pathname) {
  return typeof pathname === 'string' && MULTIPLAYER_HTTP_RE.test(pathname);
}

function isMultiplayerWsRoute(pathname) {
  return typeof pathname === 'string' && MULTIPLAYER_WS_RE.test(pathname);
}

function normalizeBasePath(raw) {
  const value = String(raw || '').trim();
  if (!value || value === '/') return '';
  if (!/^\/[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('PLAYFORGE_BASE_PATH must be empty or a single path segment like /forge.');
  }
  return value;
}

function parseForgeInternalOrigin(rawUrl) {
  if (!rawUrl) return null;
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error('PLAYFORGE_INTERNAL_URL must be a valid HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('PLAYFORGE_INTERNAL_URL must be an origin without path, query, or credentials.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname) && parsed.protocol !== 'https:') {
    throw new Error('Non-loopback PLAYFORGE_INTERNAL_URL requires HTTPS.');
  }
  return parsed.origin;
}

function createRemoteBuildValidator({ forgeOrigin, internalSecret, hubAuth, fetchImpl = globalThis.fetch, timeoutMs = 5000 }) {
  if (!forgeOrigin) return () => () => null;
  if (typeof internalSecret !== 'string' || internalSecret.length < 32) {
    throw new Error('Remote multiplayer build validation requires PLAYHUB_FORGE_INTERNAL_SECRET of at least 32 characters.');
  }
  return template => async (buildId, projectId, ownerKey) => {
    if (!PROJECT_ID_RE.test(projectId || '') || !BUILD_ID_RE.test(buildId || '')) return null;
    if (hubAuth && !ACCOUNT_KEY_RE.test(ownerKey || '')) return null;
    const route = hubAuth
      ? `/internal/v1/accounts/${ownerKey}/template-builds/${encodeURIComponent(template)}/${projectId}/${buildId}`
      : `/internal/v1/template-builds/${encodeURIComponent(template)}/${projectId}/${buildId}`;
    try {
      const response = await fetchImpl(`${forgeOrigin}${route}`, {
        method: 'GET',
        headers: { 'X-PlayHub-Internal-Secret': internalSecret },
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (!data?.ok || !data?.build || data.build.id !== buildId || data.build.projectId !== projectId) return null;
      return data.build;
    } catch {
      return null;
    }
  };
}

function createMultiplayerServer(options = {}) {
  const configuredOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const originAllowed = createOriginPolicy(configuredOrigin);
  const basePath = normalizeBasePath(options.basePath ?? process.env.PLAYFORGE_BASE_PATH ?? '');
  const hubAuthConfig = options.hubAuth === false ? null : (options.hubAuth || hubAuthConfigFromEnv());
  const hubAccountUrl = validateHubAccountUrl(options.hubAccountUrl || hubAuthConfig?.loginUrl || process.env.PLAYHUB_FORGE_HUB_ACCOUNT_URL || '/?view=account');
  const hubAuth = hubAuthConfig ? createHubSessionAuth({ ...hubAuthConfig, loginUrl: hubAuthConfig.loginUrl || hubAccountUrl }) : null;
  const forgeOrigin = parseForgeInternalOrigin(options.forgeInternalUrl ?? process.env.PLAYFORGE_INTERNAL_URL ?? '');
  const internalSecret = String(options.internalSecret ?? hubAuthConfig?.internalSecret ?? process.env.PLAYHUB_FORGE_INTERNAL_SECRET ?? '');

  const validateTemplateBuild = typeof options.validateTemplateBuild === 'function'
    ? options.validateTemplateBuild
    : createRemoteBuildValidator({
        forgeOrigin,
        internalSecret,
        hubAuth: Boolean(hubAuth),
        fetchImpl: options.fetchImpl || globalThis.fetch,
        timeoutMs: options.timeoutMs || 5000
      });

  const stripBasePath = rawUrl => {
    if (!basePath || typeof rawUrl !== 'string') return rawUrl;
    if (rawUrl === basePath) return '/';
    if (rawUrl.startsWith(basePath + '/')) return rawUrl.slice(basePath.length);
    if (rawUrl.startsWith(basePath + '?')) return '/' + rawUrl.slice(basePath.length);
    return rawUrl;
  };

  const compat = createMultiplayerCompat({
    env: options.env || process.env,
    now: options.now,
    serverBuildInfo: options.serverBuildInfo,
    releasePolicy: options.releasePolicy,
  });

  const upgradeBus = new EventEmitter();
  const brawllabs = attachBrawlLabs(upgradeBus, { originAllowed, now: options.now, validateBuild: validateTemplateBuild('brawllabs'), compat });
  const fortressWar = attachFortressWar(upgradeBus, { originAllowed, now: options.now, validateBuild: validateTemplateBuild('fortress-war'), compat });
  const tappyChickenMmo = attachTappyChickenMmo(upgradeBus, { originAllowed, now: options.now, validateBuild: validateTemplateBuild('tappy-chicken-mmo'), compat });
  const captainForeverMmo = attachCaptainForeverMmo(upgradeBus, { originAllowed, now: options.now, validateBuild: validateTemplateBuild('captain-forever-mmo'), compat });
  const services = {
    brawllabs,
    'fortress-war': fortressWar,
    'tappy-chicken-mmo': tappyChickenMmo,
    'captain-forever-mmo': captainForeverMmo
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const json = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      res.end(JSON.stringify(body));
    };

    const requestUrl = stripBasePath(req.url || '/');
    let parsedUrl;
    try {
      parsedUrl = new URL(requestUrl, 'http://localhost');
    } catch {
      return json(400, { ok: false, error: 'Invalid URL' });
    }
    const routePath = parsedUrl.pathname;

    if (routePath === '/api/health' && req.method === 'GET') {
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      return json(200, {
        ok: true,
        service: 'multiplayer',
        brawllabsMultiplayer: true,
        fortressWarMultiplayer: true,
        tappyChickenMmoMultiplayer: true,
        captainForeverMmoMultiplayer: true,
        hubAuth: Boolean(hubAuth),
        buildId: compat.serverBuildInfo.buildId,
        buildCode: compat.serverBuildInfo.buildCode,
        compat: compat.serverBuildInfo.compat,
      });
    }

    if (routePath === '/api/version' && req.method === 'GET') {
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      return json(200, {
        ok: true,
        buildInfo: compat.serverBuildInfo,
        releasePolicy: compat.getPublicPolicySummary(),
      });
    }

    if (routePath === '/api/compat/check' && req.method === 'POST') {
      if (req.headers.origin && !originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      let raw = '';
      try {
        for await (const chunk of req) {
          raw += chunk.toString('utf8');
          if (raw.length > 8192) return json(413, { ok: false, error: 'Payload too large' });
        }
      } catch {
        return json(400, { ok: false, error: 'Invalid body' });
      }
      let body;
      try {
        body = JSON.parse(raw || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
      } catch {
        return json(400, { ok: false, error: 'Invalid JSON' });
      }
      const result = compat.check(body);
      res.setHeader('X-PlayHub-Compat-Decision', result.decision);
      res.setHeader('X-PlayHub-Compat-Reason', result.reason);
      return json(result.httpStatus, result);
    }

    const roomMatch = routePath.match(MULTIPLAYER_HTTP_RE);
    if (roomMatch && req.method === 'GET') {
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      if (hubAuth) {
        const auth = await hubAuth.verify(req, { requireCsrf: false });
        if (!auth.authenticated) return json(auth.status, { ok: false, error: auth.error, loginUrl: auth.loginUrl });
      }
      const [, template, roomId] = roomMatch;
      const metadata = services[template]?.metadata(roomId) || null;
      return metadata ? json(200, { ok: true, room: metadata }) : json(404, { ok: false, error: 'Room not found' });
    }

    return json(404, { ok: false, error: 'Not found' });
  });

  server.on('upgrade', async (req, socket, head) => {
    req.url = stripBasePath(req.url || '');
    let pathname = '';
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (!isMultiplayerWsRoute(pathname)) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!originAllowed(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const extracted = compat.extractClientFromRequest(req);
    if (extracted) {
      const compatResult = compat.check(extracted.client);
      req.compatResult = compatResult;
      if (compatResult.decision === COMPAT_DECISIONS.BLOCK_FORCE_UPDATE && extracted.compatMode === 'http') {
        compat.writeUpgrade426(socket, compatResult);
        return;
      }
    }
    if (!hubAuth) {
      upgradeBus.emit('upgrade', req, socket, head);
      return;
    }
    const auth = await hubAuth.verify(req, { requireCsrf: false });
    if (!auth.authenticated) {
      const reason = auth.status === 401 ? 'Unauthorized' : auth.status === 403 ? 'Forbidden' : 'Service Unavailable';
      socket.end(`HTTP/1.1 ${auth.status} ${reason}\r\nConnection: close\r\n\r\n`);
      return;
    }
    req.hubAuth = auth;
    upgradeBus.emit('upgrade', req, socket, head);
  });

  let closed = false;
  const closeOwned = () => {
    if (closed) return;
    closed = true;
    brawllabs.close();
    fortressWar.close();
    tappyChickenMmo.close();
    captainForeverMmo.close();
  };
  server.on('close', closeOwned);
  server.compat = compat;
  server.shutdown = () => {
    closeOwned();
    server.closeAllConnections?.();
    server.close();
  };
  return server;
}

if (require.main === module) {
  const port = Number(process.env.MULTIPLAYER_PORT || process.env.PORT || 4178);
  const host = process.env.HOST || '127.0.0.1';
  const server = createMultiplayerServer();
  server.listen(port, host, () => {
    console.log(`PlayForge Multiplayer Server: http://${host}:${port}/`);
  });
  process.on('SIGINT', () => server.shutdown());
  process.on('SIGTERM', () => server.shutdown());
}

module.exports = {
  createMultiplayerServer,
  isMultiplayerHttpRoute,
  isMultiplayerWsRoute
};
