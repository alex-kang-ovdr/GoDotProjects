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
  'x-store-mock-user',
]);

function parseUpstream(raw) {
  const url = new URL(String(raw || ''));
  if (url.protocol !== 'http:' || !LOOPBACK.has(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PLAYHUB_STORE_UPSTREAM must be an explicit loopback HTTP origin without a path or credentials.');
  }
  const port = url.port ? Number(url.port) : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PLAYHUB_STORE_UPSTREAM must specify a valid port.');
  }
  return {
    hostname: url.hostname.replace(/^\[|\]$/g, ''),
    port,
    host: url.host,
    origin: `http://${url.host}`
  };
}

function normalizeOrigin(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isOriginAllowed(req, allowedOriginSet) {
  const rawOrigin = req.headers.origin;
  if (!rawOrigin) return { allowed: true, echoOrigin: null };
  const normalized = normalizeOrigin(rawOrigin);
  if (!normalized) return { allowed: false, echoOrigin: null };
  if (allowedOriginSet.size > 0 && allowedOriginSet.has(normalized)) {
    return { allowed: true, echoOrigin: normalized };
  }
  const host = String(req.headers.host || '').trim().toLowerCase();
  if (host && (normalized.toLowerCase() === `http://${host}` || normalized.toLowerCase() === `https://${host}`)) {
    return { allowed: true, echoOrigin: normalized };
  }
  return { allowed: false, echoOrigin: null };
}

function isSafeRelativeTarget(rawTargetPath) {
  if (typeof rawTargetPath !== 'string' || !rawTargetPath.startsWith('/')) return false;
  if (rawTargetPath.includes('\0') || rawTargetPath.includes('\\')) return false;
  let decoded;
  try {
    decoded = decodeURIComponent(rawTargetPath);
  } catch {
    return false;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return false;
  const candidates = [rawTargetPath, decoded];
  try {
    const twice = decodeURIComponent(decoded);
    if (twice !== decoded) candidates.push(twice);
  } catch {}
  for (const candidate of candidates) {
    if (candidate.includes('\0') || candidate.includes('\\')) return false;
    const segments = candidate.split('/');
    if (segments.some(seg => seg === '..')) return false;
    const normalized = path.posix.normalize('/' + candidate.replace(/^\/+/, ''));
    const lower = normalized.toLowerCase();
    if (lower === '/internal' || lower.startsWith('/internal/')) return false;
  }
  return true;
}

function sanitizeHeaders(rawHeaders, upstreamTarget, { identity = null, internalSecret = '', forwardOrigin = false } = {}) {
  const headers = {};
  const connectionTokens = new Set(
    String(rawHeaders.connection || '').toLowerCase().split(',').map(part => part.trim()).filter(Boolean)
  );
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'origin') continue;
    // Strip all client-supplied Hub SSO / mock identity headers to prevent spoofing
    if (lower.startsWith('x-playhub-') || STRIPPED_IDENTITY_HEADERS.has(lower)) continue;
    if (HOP_BY_HOP.has(lower) || connectionTokens.has(lower)) continue;
    headers[lower] = value;
  }
  headers.host = upstreamTarget.host;
  if (forwardOrigin) {
    headers.origin = upstreamTarget.origin;
  }
  if (identity && internalSecret) {
    headers['x-playhub-internal-secret'] = internalSecret;
    if (identity.accountKey) headers['x-playhub-account-key'] = identity.accountKey;
    if (identity.accountLabel) headers['x-playhub-user'] = identity.accountLabel;
  }
  return headers;
}

function sanitizeResponseHeaders(rawHeaders, echoOrigin) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    if (lower === 'access-control-allow-origin') continue;
    headers[key] = value;
  }
  if (echoOrigin) {
    headers['Access-Control-Allow-Origin'] = echoOrigin;
    headers['Vary'] = headers['vary'] ? `${headers['vary']}, Origin` : 'Origin';
  }
  return headers;
}

/**
 * Reverse proxy that mounts PlayForge Asset Store cleanly under PlayHub (`/store/*` and `/api/store/*`)
 * while forwarding verified Hub session identities via server-to-server Hub SSO headers.
 */
export function createStoreProxy({
  upstream,
  basePath = '/store',
  allowedOrigins = [],
  resolveSessionIdentity = null,
  internalSecret = ''
} = {}) {
  if (typeof basePath !== 'string' || !/^\/[a-zA-Z0-9_-]+$/.test(basePath)) {
    throw new Error('Store proxy basePath must be a single path segment like /store.');
  }
  const target = parseUpstream(upstream);
  const prefix = basePath + '/';
  const normalizedSecret = typeof internalSecret === 'string' ? internalSecret.trim() : '';
  const allowedOriginSet = new Set(
    (Array.isArray(allowedOrigins) ? allowedOrigins : [])
      .map(normalizeOrigin)
      .filter(Boolean)
  );

  function matches(pathname) {
    return (
      pathname === basePath
      || pathname.startsWith(prefix)
      || pathname === '/api/store'
      || pathname.startsWith('/api/store/')
    );
  }

  function resolveUpstreamPath(rawUrl) {
    const queryIndex = rawUrl.indexOf('?');
    const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const search = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
    if (pathname === '/api/store' || pathname.startsWith('/api/store/')) {
      if (!isSafeRelativeTarget(pathname)) return null;
      return pathname + search;
    }
    if (pathname === basePath) return '/' + search;
    if (pathname.startsWith(prefix)) {
      const stripped = pathname.slice(basePath.length);
      if (!isSafeRelativeTarget(stripped)) return null;
      return stripped + search;
    }
    return null;
  }

  function handle(req, res) {
    const rawUrl = req.url || '/';
    const queryIndex = rawUrl.indexOf('?');
    const pathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
    const search = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';

    if (pathname === basePath) {
      res.writeHead(308, { Location: prefix + search, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }

    const originCheck = isOriginAllowed(req, allowedOriginSet);
    if (!originCheck.allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({
        error: { code: 'ORIGIN_DENIED', message: '허용되지 않은 Origin의 Store 요청입니다.' }
      }));
      return;
    }

    const upstreamPath = resolveUpstreamPath(rawUrl);
    if (upstreamPath === null) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Store 경로를 찾을 수 없습니다.' } }));
      return;
    }

    const isApiRequest = upstreamPath === '/api/store' || upstreamPath.startsWith('/api/store/');
    let identity = null;
    if (isApiRequest && typeof resolveSessionIdentity === 'function') {
      try {
        identity = resolveSessionIdentity(req) || null;
      } catch {
        identity = null;
      }
    }

    const headers = sanitizeHeaders(req.headers, target, {
      identity,
      internalSecret: normalizedSecret,
      forwardOrigin: Boolean(originCheck.echoOrigin)
    });

    const upstreamReq = http.request({
      hostname: target.hostname,
      port: target.port,
      method: req.method,
      path: upstreamPath,
      headers,
    }, upstreamRes => {
      const responseHeaders = sanitizeResponseHeaders(upstreamRes.headers, originCheck.echoOrigin);
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
        res.end(JSON.stringify({
          error: {
            code: 'STORE_UNAVAILABLE',
            message: 'PlayForge Asset Store 서비스에 연결할 수 없습니다. PlayHub의 다른 기능은 정상 동작합니다.'
          }
        }));
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

  return { basePath, matches, resolveUpstreamPath, handle };
}
