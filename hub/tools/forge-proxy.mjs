import http from 'node:http';
import path from 'node:path';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade',
]);
const STRIPPED_IDENTITY_HEADERS = new Set([
  'forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto',
  'x-forwarded-port', 'x-forwarded-user', 'x-forwarded-email', 'x-real-ip',
]);
const FORGE_REDIRECT_PATH = /^\/(?:OfficialGodot|Frontends|api|play|assets|Projects)(?:\/|$|\?)/;
const MULTIPLAYER_HTTP_PATH = /^\/api\/(?:brawllabs|fortress-war|tappy-chicken-mmo)\/rooms\/[a-f0-9]{12}(?:\?|$)/;
const MULTIPLAYER_WS_PATH = /^\/(?:brawllabs|fortress-war|tappy-chicken-mmo)(?:\?|$)/;

function parseUpstream(raw) {
  const url = new URL(String(raw || ''));
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PLAYHUB_FORGE_UPSTREAM must be an explicit loopback HTTP origin without a path or credentials.');
  }
  const port = url.port ? Number(url.port) : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PLAYHUB_FORGE_UPSTREAM must specify a valid port.');
  }
  return { hostname: url.hostname.replace(/^\[|\]$/g, ''), port, host: url.host };
}

function sanitizeHeaders(rawHeaders, upstreamHost, { isUpgrade = false } = {}) {
  const headers = {};
  const connectionTokens = new Set(
    String(rawHeaders.connection || '').toLowerCase().split(',').map(part => part.trim()).filter(Boolean)
  );
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === 'host') continue;
    if (lower.startsWith('x-playhub-') || STRIPPED_IDENTITY_HEADERS.has(lower)) continue;
    if (!isUpgrade && (HOP_BY_HOP.has(lower) || connectionTokens.has(lower))) continue;
    if (isUpgrade && HOP_BY_HOP.has(lower) && lower !== 'upgrade' && lower !== 'connection') continue;
    headers[lower] = value;
  }
  headers.host = upstreamHost;
  if (isUpgrade) {
    headers.connection = 'Upgrade';
    headers.upgrade = rawHeaders.upgrade || 'websocket';
  }
  return headers;
}

function sanitizeResponseHeaders(rawHeaders, basePath) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === 'location' && typeof value === 'string' && FORGE_REDIRECT_PATH.test(value) && !value.startsWith(basePath + '/')) {
      headers[key] = basePath + value;
      continue;
    }
    headers[key] = value;
  }
  return headers;
}

export function createForgeProxy({ upstream, multiplayerUpstream, basePath = '/forge' } = {}) {
  if (typeof basePath !== 'string' || !/^\/[a-zA-Z0-9_-]+$/.test(basePath)) {
    throw new Error('Forge proxy basePath must be a single path segment like /forge.');
  }
  const target = parseUpstream(upstream);
  const multiplayerTarget = multiplayerUpstream ? parseUpstream(multiplayerUpstream) : null;
  const prefix = basePath + '/';
  const activeSockets = new Set();

  function targetForHttp(strippedPath) {
    if (multiplayerTarget && MULTIPLAYER_HTTP_PATH.test(strippedPath)) return multiplayerTarget;
    return target;
  }

  function targetForWs(strippedPath) {
    if (multiplayerTarget && MULTIPLAYER_WS_PATH.test(strippedPath)) return multiplayerTarget;
    return target;
  }

  function trackSocket(socket) {
    activeSockets.add(socket);
    socket.once('close', () => activeSockets.delete(socket));
  }

  function matches(pathname) {
    return pathname === basePath || pathname.startsWith(prefix);
  }

  function isBlockedInternalTarget(rawTargetPath) {
    if (typeof rawTargetPath !== 'string' || !rawTargetPath.startsWith('/')) return true;
    if (rawTargetPath.includes('\0') || rawTargetPath.includes('\\')) return true;
    let decoded;
    try {
      decoded = decodeURIComponent(rawTargetPath);
    } catch {
      return true;
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return true;
    const candidates = [rawTargetPath, decoded];
    try {
      const decodedTwice = decodeURIComponent(decoded);
      if (decodedTwice !== decoded) candidates.push(decodedTwice);
    } catch {}
    const lowerBase = basePath.toLowerCase();
    for (const candidate of candidates) {
      if (candidate.includes('\0') || candidate.includes('\\')) return true;
      const normalized = path.posix.normalize('/' + candidate.replace(/^\/+/, ''));
      const lower = normalized.toLowerCase();
      if (lower === '/internal' || lower.startsWith('/internal/')) return true;
      const withBase = path.posix.normalize(basePath + '/' + candidate.replace(/^\/+/, ''));
      const lowerWithBase = withBase.toLowerCase();
      if (lowerWithBase === '/internal' || lowerWithBase.startsWith('/internal/')) return true;
      if (lowerWithBase !== lowerBase && !lowerWithBase.startsWith(lowerBase + '/')) return true;
    }
    return false;
  }

  function stripPrefix(rawUrl) {
    const queryIndex = rawUrl.indexOf('?');
    const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const search = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
    if (pathname === basePath) return '/' + search;
    if (pathname.startsWith(prefix)) {
      const targetPath = pathname.slice(basePath.length);
      if (isBlockedInternalTarget(targetPath)) return null;
      return targetPath + search;
    }
    return null;
  }

  function handle(req, res) {
    const queryIndex = req.url.indexOf('?');
    const pathname = queryIndex >= 0 ? req.url.slice(0, queryIndex) : req.url;
    const search = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    if (pathname === basePath) {
      res.writeHead(308, { Location: prefix + search, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    const stripped = stripPrefix(req.url);
    if (stripped === null) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
      return;
    }
    const selectedTarget = targetForHttp(stripped);
    const headers = sanitizeHeaders(req.headers, selectedTarget.host);
    const upstreamReq = http.request({
      hostname: selectedTarget.hostname,
      port: selectedTarget.port,
      method: req.method,
      path: stripped,
      headers,
    }, upstreamRes => {
      const responseHeaders = sanitizeResponseHeaders(upstreamRes.headers, basePath);
      res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
      if (req.method === 'HEAD') {
        upstreamRes.resume();
        res.end();
        return;
      }
      upstreamRes.pipe(res);
      upstreamRes.on('error', () => res.destroy());
    });
    upstreamReq.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'FORGE_UNAVAILABLE' }));
      } else {
        res.destroy();
      }
    });
    res.on('close', () => {
      if (!res.writableEnded) upstreamReq.destroy();
    });
    if (['GET', 'HEAD'].includes(req.method)) upstreamReq.end();
    else req.pipe(upstreamReq);
  }

  function upgrade(req, socket, head) {
    const stripped = stripPrefix(req.url || '');
    if (stripped === null) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return;
    }
    const selectedTarget = targetForWs(stripped);
    const headers = sanitizeHeaders(req.headers, selectedTarget.host, { isUpgrade: true });
    const upstreamReq = http.request({
      hostname: selectedTarget.hostname,
      port: selectedTarget.port,
      method: req.method || 'GET',
      path: stripped,
      headers,
    });
    upstreamReq.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      trackSocket(socket);
      trackSocket(upstreamSocket);
      let raw = `HTTP/1.1 ${upstreamRes.statusCode || 101} ${upstreamRes.statusMessage || 'Switching Protocols'}\r\n`;
      for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) {
        raw += `${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}\r\n`;
      }
      raw += '\r\n';
      socket.write(raw);
      if (upstreamHead?.length) socket.write(upstreamHead);
      if (head?.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
      const cleanup = () => { socket.destroy(); upstreamSocket.destroy(); };
      socket.on('error', cleanup);
      upstreamSocket.on('error', cleanup);
    });
    upstreamReq.on('response', upstreamRes => {
      const status = upstreamRes.statusCode || 502;
      const reason = upstreamRes.statusMessage || 'Bad Gateway';
      socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
      upstreamRes.resume();
    });
    upstreamReq.on('error', () => {
      if (!socket.destroyed) socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    });
    socket.on('close', () => upstreamReq.destroy());
    upstreamReq.end();
  }

  function close() {
    for (const socket of activeSockets) {
      try { socket.destroy(); } catch {}
    }
    activeSockets.clear();
  }

  return { basePath, matches, stripPrefix, handle, upgrade, close };
}
