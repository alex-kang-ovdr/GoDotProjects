import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../../hub/server/app.mjs';
import { assertRuntimeOutput } from '../../../hub/tools/runtime-output.cjs';
import { createStoreProxy } from '../../../hub/tools/store-proxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const hubRoot = path.join(repoRoot, 'hub');

const ROLE = (process.env.PLAYHUB_ROLE || 'public').trim().toLowerCase();
if (!['public', 'admin'].includes(ROLE)) {
  throw new Error('PLAYHUB_ROLE must be "public" or "admin"');
}

function readDistApiPort(surface, globalName, fallback) {
  try {
    const script = fs.readFileSync(path.join(hubRoot, 'dist', surface, 'config.js'), 'utf8');
    const match = script.match(new RegExp('^window\\.' + globalName + '=(.+);\\s*$', 's'));
    const parsed = JSON.parse(match?.[1] || '{}');
    if (Number.isInteger(parsed.apiPort) && parsed.apiPort > 0) return parsed.apiPort;
  } catch {}
  return fallback;
}

const EDGE_PORT = Number(process.env.PORT || 8080);
const DIST_PUBLIC_PORT = Number(process.env.PLAYHUB_DIST_PUBLIC_PORT || readDistApiPort('user', 'PLAYHUB_CONFIG', 8090));
const DIST_ADMIN_PORT = Number(process.env.PLAYHUB_DIST_ADMIN_PORT || readDistApiPort('admin', 'PLAYHUB_ADMIN_CONFIG', 8091));
const PUBLIC_ORIGIN = (process.env.PLAYHUB_PUBLIC_ORIGIN || '').trim().replace(/\/$/, '');
const FORGE_UPSTREAM = (process.env.PLAYHUB_FORGE_UPSTREAM || '').trim().replace(/\/$/, '');
const STORE_UPSTREAM_ENV = (process.env.PLAYHUB_STORE_UPSTREAM || '').trim().replace(/\/$/, '');
const ALLOW_REMOTE_VERIFY = process.env.PLAYHUB_FORGE_REMOTE_VERIFY === '1';
const DATA_DIR = path.resolve(process.env.PLAYHUB_DATA_DIR || '/tmp/playhub-data');
const FORGE_DIR = path.resolve(process.env.PLAYHUB_FORGE_DIR || '/tmp/playhub-forge');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.pck': 'application/octet-stream',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.xml', '.txt', '.wasm']);
const STRIP_HEADERS = new Set([
  'x-playhub-internal-secret',
  'x-playhub-user',
  'x-playhub-account-key',
  'x-forwarded-user',
  'x-forwarded-email',
  'forwarded',
]);

function buildConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(FORGE_DIR, { recursive: true, mode: 0o700 });

  const fallbackOrigin = PUBLIC_ORIGIN || `http://localhost:${EDGE_PORT}`;
  const isHttps = fallbackOrigin.startsWith('https://');
  const origins = [fallbackOrigin];
  if (process.env.PLAYHUB_EXTRA_ORIGINS) {
    for (const o of process.env.PLAYHUB_EXTRA_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)) {
      if (!origins.includes(o)) origins.push(o);
    }
  }

  const adminSalt = process.env.PLAYHUB_ADMIN_SALT || crypto.randomBytes(16).toString('hex');
  const adminPasswordHash = process.env.PLAYHUB_ADMIN_PASSWORD_HASH ||
    crypto.scryptSync(process.env.PLAYHUB_ADMIN_PASSWORD || crypto.randomBytes(24).toString('hex'), adminSalt, 64).toString('hex');

  const google = (process.env.PLAYHUB_GOOGLE_CLIENT_ID && process.env.PLAYHUB_GOOGLE_CLIENT_SECRET && process.env.PLAYHUB_GOOGLE_REDIRECT_URI)
    ? {
        clientId: process.env.PLAYHUB_GOOGLE_CLIENT_ID,
        clientSecret: process.env.PLAYHUB_GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.PLAYHUB_GOOGLE_REDIRECT_URI,
      }
    : {};

  const forgeInternalSecret = String(process.env.PLAYHUB_FORGE_INTERNAL_SECRET || '');
  const remoteForgeConfigured = Boolean(FORGE_UPSTREAM) && forgeInternalSecret.length >= 32;
  const forgeEnabled = (process.env.PLAYHUB_FORGE_ENABLED === 'true' && isHttps) || remoteForgeConfigured;

  return {
    publicHost: '127.0.0.1',
    adminHost: '127.0.0.1',
    publicPort: DIST_PUBLIC_PORT,
    adminPort: DIST_ADMIN_PORT,
    userOrigins: origins,
    adminOrigins: [
      `http://127.0.0.1:${EDGE_PORT}`,
      `http://localhost:${EDGE_PORT}`,
      ...(ROLE === 'admin' && PUBLIC_ORIGIN ? [PUBLIC_ORIGIN] : []),
    ],
    userBaseUrl: fallbackOrigin,
    publicBaseUrl: fallbackOrigin,
    adminBaseUrl: (ROLE === 'admin' && PUBLIC_ORIGIN) ? PUBLIC_ORIGIN : `http://127.0.0.1:${EDGE_PORT}`,
    dataDir: DATA_DIR,
    secureCookies: process.env.PLAYHUB_SECURE_COOKIES ? process.env.PLAYHUB_SECURE_COOKIES === 'true' : isHttps,
    searchIndexingEnabled: process.env.PLAYHUB_SEARCH_INDEXING === 'true',
    google,
    admin: {
      username: process.env.PLAYHUB_ADMIN_USERNAME || 'admin',
      passwordHash: adminPasswordHash,
      salt: adminSalt,
      localAutoLogin: false,
    },
    forge: {
      enabled: forgeEnabled,
      ...(remoteForgeConfigured ? { mode: 'remote', baseUrl: FORGE_UPSTREAM } : {}),
      directory: FORGE_DIR,
      internalSecret: forgeInternalSecret || crypto.randomBytes(32).toString('hex'),
    },
  };
}

export function allowCloudRunSameHostOrigin(req, origins, env = process.env) {
  if (!env?.K_SERVICE || !Array.isArray(origins)) return false;
  const origin = typeof req?.headers?.origin === 'string' ? req.headers.origin.trim() : '';
  const host = typeof req?.headers?.host === 'string' ? req.headers.host.trim().toLowerCase() : '';
  if (!origin || !host) return false;
  if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/i.test(host)) return false;
  const expected = `https://${host}`;
  if (origin !== expected) return false;
  if (!origins.includes(expected) && origins.length < 16) origins.push(expected);
  return true;
}

export function rewriteProxyLocation(location, stripPrefix = '') {
  if (!stripPrefix || typeof location !== 'string') return location;
  if (!location.startsWith('/') || location.startsWith('//') || location.startsWith('/?')) {
    return location;
  }
  if (
    location === stripPrefix ||
    location.startsWith(stripPrefix + '/') ||
    location.startsWith(stripPrefix + '?')
  ) {
    return location;
  }
  return stripPrefix + location;
}

export function buildUpstreamRequestOptions(targetBase, req, stripPrefix = '') {
  const targetUrl = new URL(targetBase);
  const isHttps = targetUrl.protocol === 'https:';
  const rawUrl = req.url || '/';
  const nextUrl = stripPrefix && rawUrl.startsWith(stripPrefix)
    ? (rawUrl.slice(stripPrefix.length) || '/')
    : rawUrl;

  const headers = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    const lower = k.toLowerCase();
    if (STRIP_HEADERS.has(lower) || lower.startsWith('x-playhub-')) continue;
    headers[k] = v;
  }
  headers.host = targetUrl.host;

  return {
    isHttps,
    options: {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: nextUrl,
      method: req.method,
      headers,
      ...(isHttps ? { servername: targetUrl.hostname } : {}),
    },
  };
}

const ETAG_CATALOG_PATHS = new Set([
  '/api/games',
  '/api/avatar/catalog',
  '/api/store/catalog',
  '/forge/api/platform/templates',
]);
const MAX_EDGE_COMPRESS_BYTES = 4 * 1024 * 1024;
const COMPRESSIBLE_CT_RE = /^(?:application\/json|application\/javascript|text\/javascript|text\/html|text\/css|text\/plain|image\/svg\+xml)/i;

export function attachEdgeCompressionAndEtag(req, res, pathname) {
  if (req.method !== 'GET') return;
  if (pathname.endsWith('/events')) return;
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const preferredEnc = /\bbr\b/i.test(acceptEncoding)
    ? 'br'
    : (/\bgzip\b/i.test(acceptEncoding) ? 'gzip' : null);
  const allowEtag = ETAG_CATALOG_PATHS.has(pathname);
  if (!preferredEnc && !allowEtag) return;

  const origWriteHead = res.writeHead.bind(res);
  const origWrite = res.write.bind(res);
  const origEnd = res.end.bind(res);
  let intercepted = false;
  let passthrough = false;
  let savedStatus = 200;
  let savedHeaders = {};
  const chunks = [];
  let totalLen = 0;

  const mergeHeaders = (extra) => {
    const merged = {};
    for (const [k, v] of Object.entries(res.getHeaders())) merged[k.toLowerCase()] = v;
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined) merged[k.toLowerCase()] = v;
      }
    }
    return merged;
  };

  const restoreMethods = () => {
    res.writeHead = origWriteHead;
    res.write = origWrite;
    res.end = origEnd;
  };

  const flushPassthrough = () => {
    passthrough = true;
    intercepted = false;
    restoreMethods();
    origWriteHead(savedStatus, savedHeaders);
    for (const c of chunks) origWrite(c);
    chunks.length = 0;
  };

  const decideIntercept = (statusCode, hdrObj) => {
    const merged = mergeHeaders(hdrObj);
    const ct = String(merged['content-type'] || '');
    const hasCe = Boolean(merged['content-encoding']);
    const isSse = ct.toLowerCase().includes('text/event-stream');
    if (statusCode === 200 && !hasCe && !isSse && COMPRESSIBLE_CT_RE.test(ct)) {
      intercepted = true;
      savedStatus = statusCode;
      savedHeaders = merged;
      return true;
    }
    passthrough = true;
    restoreMethods();
    return false;
  };

  res.writeHead = (statusCode, statusMsgOrHeaders, maybeHeaders) => {
    const hdrObj = typeof statusMsgOrHeaders === 'object' ? statusMsgOrHeaders : maybeHeaders;
    if (decideIntercept(statusCode, hdrObj)) return res;
    return origWriteHead(statusCode, statusMsgOrHeaders, maybeHeaders);
  };

  res.write = (chunk, encoding, cb) => {
    if (!intercepted && !passthrough) {
      if (!decideIntercept(res.statusCode || 200, null)) {
        return origWrite(chunk, encoding, cb);
      }
    }
    if (!intercepted || passthrough) return origWrite(chunk, encoding, cb);
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
    totalLen += buf.length;
    if (totalLen > MAX_EDGE_COMPRESS_BYTES) {
      flushPassthrough();
      return origWrite(buf, cb);
    }
    chunks.push(buf);
    if (typeof encoding === 'function') encoding();
    else if (typeof cb === 'function') cb();
    return true;
  };

  res.end = (chunk, encoding, cb) => {
    if (!intercepted && !passthrough) {
      if (!decideIntercept(res.statusCode || 200, null)) {
        return origEnd(chunk, encoding, cb);
      }
    }
    if (!intercepted || passthrough) return origEnd(chunk, encoding, cb);
    if (chunk && typeof chunk !== 'function') {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
      totalLen += buf.length;
      chunks.push(buf);
    }
    const doneCb = typeof chunk === 'function' ? chunk : (typeof encoding === 'function' ? encoding : cb);
    const body = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
    chunks.length = 0;
    passthrough = true;
    intercepted = false;
    restoreMethods();

    for (const name of res.getHeaderNames()) res.removeHeader(name);
    const outHeaders = { ...savedHeaders };
    delete outHeaders['content-length'];
    delete outHeaders['transfer-encoding'];
    delete outHeaders.connection;
    delete outHeaders['keep-alive'];
    delete outHeaders['proxy-connection'];
    if (allowEtag && !outHeaders['set-cookie']) {
      const etag = `W/"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
      outHeaders.etag = etag;
      outHeaders['cache-control'] = 'no-cache';
      const inm = String(req.headers['if-none-match'] || '').trim();
      if (inm === etag) {
        delete outHeaders['content-type'];
        origWriteHead(304, outHeaders);
        return origEnd(doneCb);
      }
    }
    if (preferredEnc && body.length >= 1024) {
      const compressed = preferredEnc === 'br'
        ? zlib.brotliCompressSync(body, {
            params: {
              [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
              [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
            },
          })
        : zlib.gzipSync(body, { level: 6 });
      outHeaders['content-encoding'] = preferredEnc;
      if (!outHeaders.vary) outHeaders.vary = 'Accept-Encoding';
      else if (!/\baccept-encoding\b/i.test(String(outHeaders.vary))) outHeaders.vary = `${outHeaders.vary}, Accept-Encoding`;
      outHeaders['content-length'] = compressed.length;
      origWriteHead(savedStatus, outHeaders);
      return origEnd(compressed, doneCb);
    }
    outHeaders['content-length'] = body.length;
    origWriteHead(savedStatus, outHeaders);
    return origEnd(body, doneCb);
  };
}

export function proxyRequest(req, res, targetBase, stripPrefix = '', extraTlsOptions = null) {
  const { isHttps, options } = buildUpstreamRequestOptions(targetBase, req, stripPrefix);
  const transport = isHttps ? https : http;
  const reqOpts = isHttps && extraTlsOptions ? { ...options, ...extraTlsOptions } : options;

  const upstream = transport.request(reqOpts, upRes => {
    const outHeaders = { ...upRes.headers };
    delete outHeaders.connection;
    delete outHeaders['keep-alive'];
    delete outHeaders['proxy-connection'];
    if (typeof outHeaders.location === 'string') {
      outHeaders.location = rewriteProxyLocation(outHeaders.location, stripPrefix);
    }
    res.writeHead(upRes.statusCode || 502, outHeaders);
    upRes.pipe(res);
  });

  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'UPSTREAM_UNAVAILABLE' }));
    } else {
      res.end();
    }
  });
  req.pipe(upstream);
}

const STATIC_COMPRESS_CACHE = new Map();
const STATIC_COMPRESS_MAX_FILE_BYTES = 1536 * 1024;
const STATIC_COMPRESS_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
let staticCompressCacheBytes = 0;

function getCachedCompressedStatic(realPath, stat, encoding) {
  if (stat.size < 1024 || stat.size > STATIC_COMPRESS_MAX_FILE_BYTES) return null;
  const key = `${realPath}:${stat.size}:${Math.trunc(stat.mtimeMs)}:${encoding}`;
  const hit = STATIC_COMPRESS_CACHE.get(key);
  if (hit) {
    STATIC_COMPRESS_CACHE.delete(key);
    STATIC_COMPRESS_CACHE.set(key, hit);
    return hit;
  }
  const raw = fs.readFileSync(realPath);
  const compressed = encoding === 'br'
    ? zlib.brotliCompressSync(raw, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
          [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
        },
      })
    : zlib.gzipSync(raw, { level: 6 });
  if (compressed.length >= raw.length) return null;
  while (staticCompressCacheBytes + compressed.length > STATIC_COMPRESS_MAX_TOTAL_BYTES && STATIC_COMPRESS_CACHE.size > 0) {
    const oldestKey = STATIC_COMPRESS_CACHE.keys().next().value;
    const oldestVal = STATIC_COMPRESS_CACHE.get(oldestKey);
    STATIC_COMPRESS_CACHE.delete(oldestKey);
    if (oldestVal) staticCompressCacheBytes -= oldestVal.length;
  }
  if (compressed.length <= STATIC_COMPRESS_MAX_TOTAL_BYTES) {
    STATIC_COMPRESS_CACHE.set(key, compressed);
    staticCompressCacheBytes += compressed.length;
  }
  return compressed;
}

export function serveStatic(req, res, staticRoot) {
  if (!['GET', 'HEAD'].includes(req.method || '')) {
    res.writeHead(405);
    res.end();
    return;
  }
  const parsed = new URL(req.url || '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(s => s === '..' || s.startsWith('.'))) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  let target = path.resolve(staticRoot, '.' + pathname);
  if (target !== staticRoot && !target.startsWith(staticRoot + path.sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, 'index.html');
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const real = fs.realpathSync(target);
  const ext = path.extname(real).toLowerCase();
  const mime = MIME[ext];
  if (!real.startsWith(staticRoot + path.sep) || !mime) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const stat = fs.statSync(real);
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600, stale-while-revalidate=86400',
    'ETag': etag,
  };
  if (pathname.startsWith('/games/')) {
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
  }
  const inm = String(req.headers['if-none-match'] || '').trim();
  if (inm === etag) {
    delete headers['Content-Type'];
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const encoding = COMPRESSIBLE.has(ext)
    ? (/\bbr\b/i.test(acceptEncoding) ? 'br' : (/\bgzip\b/i.test(acceptEncoding) ? 'gzip' : null))
    : null;
  if (encoding) {
    headers.Vary = 'Accept-Encoding';
    const cached = getCachedCompressedStatic(real, stat, encoding);
    if (cached) {
      headers['Content-Encoding'] = encoding;
      headers['Content-Length'] = cached.length;
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : cached);
      return;
    }
    if (req.method !== 'HEAD') {
      headers['Content-Encoding'] = encoding;
      res.writeHead(200, headers);
      const compressor = encoding === 'br'
        ? zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } })
        : zlib.createGzip({ level: 6 });
      fs.createReadStream(real).pipe(compressor).pipe(res);
      return;
    }
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(real).pipe(res);
}

const isDirectExecution =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const config = buildConfig();
  const deployed = assertRuntimeOutput(hubRoot, config);
  const app = createApp(config, { rootDir: deployed.user, platformRoot: repoRoot });
  const staticRoot = fs.realpathSync(ROLE === 'admin' ? deployed.admin : deployed.user);
  const apiHandler = ROLE === 'admin' ? app.adminHandler : app.publicHandler;

  let embeddedStore = null;
  let storeProxy = null;
  let storeInitPromise = null;
  const storeInternalSecret = process.env.PLAYHUB_STORE_INTERNAL_SECRET || crypto.randomBytes(32).toString('hex');
  const embeddedStoreScriptExists = fs.existsSync(path.join(repoRoot, 'store', 'server', 'store-api.mjs'));
  const storeProxyEnabled = ROLE === 'public' && (Boolean(STORE_UPSTREAM_ENV) || embeddedStoreScriptExists);
  const isStorePath = p => p === '/store' || p.startsWith('/store/') || p === '/api/store' || p.startsWith('/api/store/');

  if (ROLE === 'public' && STORE_UPSTREAM_ENV) {
    storeProxy = createStoreProxy({
      upstream: STORE_UPSTREAM_ENV,
      allowedOrigins: config.userOrigins,
      resolveSessionIdentity: req => app.resolveStoreIdentity(req),
      internalSecret: storeInternalSecret,
    });
  }

  async function ensureStoreProxy() {
    if (storeProxy) return storeProxy;
    if (!storeProxyEnabled) return null;
    if (!storeInitPromise) {
      storeInitPromise = (async () => {
        try {
          const [{ createStoreApp }, { loadMergedCatalog }] = await Promise.all([
            import('../../../store/server/store-api.mjs'),
            import('../../../store/server/index.mjs'),
          ]);
          const storeRoot = path.join(repoRoot, 'store');
          const storeDataDir = path.join(DATA_DIR, 'store');
          fs.mkdirSync(storeDataDir, { recursive: true, mode: 0o700 });
          embeddedStore = createStoreApp({
            dataDir: storeDataDir,
            webDir: path.join(storeRoot, 'web'),
            serveStatic: true,
            catalog: loadMergedCatalog(storeRoot),
            ownCatalog: true,
            internalSecret: storeInternalSecret,
          });
          const storeAddr = await embeddedStore.listen(0, '127.0.0.1');
          storeProxy = createStoreProxy({
            upstream: `http://127.0.0.1:${storeAddr.port}`,
            allowedOrigins: config.userOrigins,
            resolveSessionIdentity: req => app.resolveStoreIdentity(req),
            internalSecret: storeInternalSecret,
          });
          return storeProxy;
        } catch (err) {
          storeInitPromise = null;
          console.error('[cloudrun_hub] embedded store startup failed:', err?.message || err);
          return null;
        }
      })();
    }
    return storeInitPromise;
  }

  const stripSpoofedHeaders = req => {
    for (const key of Object.keys(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-playhub-internal-secret' && ALLOW_REMOTE_VERIFY) continue;
      if (STRIP_HEADERS.has(lower) || lower.startsWith('x-playhub-')) {
        delete req.headers[key];
      }
    }
  };

  const isCloudRunDev = Boolean(process.env.K_SERVICE) && String(process.env.PLAYHUB_CHANNEL || '').trim().toLowerCase() === 'dev';
  let requestsTotal = 0;
  let bytesOut = 0;

  const edge = http.createServer((req, res) => {
    if (isCloudRunDev) {
      requestsTotal += 1;
      const origWrite = res.write.bind(res);
      const origEnd = res.end.bind(res);
      res.write = (chunk, encoding, cb) => {
        if (chunk) bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
        return origWrite(chunk, encoding, cb);
      };
      res.end = (chunk, encoding, cb) => {
        if (chunk && typeof chunk !== 'function') bytesOut += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk), typeof encoding === 'string' ? encoding : 'utf8');
        return origEnd(chunk, encoding, cb);
      };
    }
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;

    if (pathname === '/_healthz') {
      const payload = { ok: true, role: ROLE, revision: process.env.K_REVISION || 'local' };
      if (isCloudRunDev) {
        const mem = process.memoryUsage();
        const toMb = b => Math.round((b / (1024 * 1024)) * 100) / 100;
        payload.serverMetrics = {
          rssMb: toMb(mem.rss),
          heapUsedMb: toMb(mem.heapUsed),
          heapTotalMb: toMb(mem.heapTotal),
          externalMb: toMb(mem.external),
          uptimeSec: Math.round(process.uptime()),
          requestsTotal,
          bytesOut,
          forgeGatewayMode: config.forge?.mode || 'local',
        };
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
      return;
    }

    if (ROLE === 'public') {
      if (ALLOW_REMOTE_VERIFY && pathname === '/internal/session/verify') {
        stripSpoofedHeaders(req);
        apiHandler(req, res);
        return;
      }
      if (pathname.startsWith('/internal/') || pathname === '/internal' || pathname.startsWith('/api/admin')) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'NOT_FOUND' }));
        return;
      }
      if (pathname === '/config.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('window.PLAYHUB_CONFIG={"apiPort":443,"apiBaseUrl":location.origin,"mode":"cloud-run"};\n');
        return;
      }
      if (pathname === '/PlayForge' || pathname === '/PlayForge/') {
        res.writeHead(302, { Location: '/forge/OfficialGodot/', 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (storeProxyEnabled && isStorePath(pathname)) {
        attachEdgeCompressionAndEtag(req, res, pathname);
        void ensureStoreProxy().then(proxy => {
          if (!proxy) {
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: { code: 'STORE_UNAVAILABLE', message: 'Asset Store unavailable' } }));
            }
            return;
          }
          proxy.handle(req, res);
        });
        return;
      }
      if (pathname.startsWith('/runtime/godot/')) {
        if (!['GET', 'HEAD'].includes(req.method || '')) {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          res.end();
          return;
        }
        const rel = pathname.slice('/runtime/godot/'.length);
        const parts = rel.split('/');
        const runtimeBase = path.join(repoRoot, 'runtime', 'godot');
        if (parts.length !== 2 || parts.some(p => !/^[0-9A-Za-z._-]{1,80}$/.test(p) || p.startsWith('.'))) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const target = path.resolve(runtimeBase, parts[0], parts[1]);
        const gzPath = target + '.gz';
        const hasRaw = target.startsWith(runtimeBase + path.sep) && fs.existsSync(target) && fs.statSync(target).isFile();
        const hasGz = gzPath.startsWith(runtimeBase + path.sep) && fs.existsSync(gzPath) && fs.statSync(gzPath).isFile();
        if (!hasRaw && !hasGz) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(target).toLowerCase();
        const mime = MIME[ext];
        if (!mime) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const acceptEncoding = String(req.headers['accept-encoding'] || '');
        const wantsGzip = acceptEncoding.includes('gzip');
        const headers = {
          'Content-Type': mime,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'X-Content-Type-Options': 'nosniff',
        };
        if (hasGz && wantsGzip) {
          headers['Content-Encoding'] = 'gzip';
          headers.Vary = 'Accept-Encoding';
          headers['Content-Length'] = fs.statSync(gzPath).size;
          res.writeHead(200, headers);
          if (req.method === 'HEAD') res.end();
          else fs.createReadStream(gzPath).pipe(res);
          return;
        }
        if (hasRaw) {
          headers['Content-Length'] = fs.statSync(target).size;
          res.writeHead(200, headers);
          if (req.method === 'HEAD') res.end();
          else fs.createReadStream(target).pipe(res);
          return;
        }
        // Only .gz exists and client did not advertise gzip: stream gunzipped on the fly.
        res.writeHead(200, headers);
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(gzPath).pipe(zlib.createGunzip()).pipe(res);
        return;
      }
      if (pathname === '/forge') {
        res.writeHead(308, { Location: '/forge/' });
        res.end();
        return;
      }
      if (pathname.startsWith('/forge/')) {
        if (!FORGE_UPSTREAM) {
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'FORGE_UPSTREAM_NOT_CONFIGURED' }));
          return;
        }
        if (pathname.startsWith('/forge/api/')) attachEdgeCompressionAndEtag(req, res, pathname);
        proxyRequest(req, res, FORGE_UPSTREAM, '/forge');
        return;
      }
    } else {
      if (pathname === '/config.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('window.PLAYHUB_ADMIN_CONFIG={"apiPort":443,"apiBaseUrl":location.origin,"mode":"cloud-run-admin"};\n');
        return;
      }
    }

    if (pathname.startsWith('/api/') || (ROLE === 'public' && pathname.startsWith('/play-ugc/'))) {
      if (ROLE === 'public') allowCloudRunSameHostOrigin(req, config.userOrigins);
      stripSpoofedHeaders(req);
      if (pathname.startsWith('/api/')) attachEdgeCompressionAndEtag(req, res, pathname);
      apiHandler(req, res);
      return;
    }

    serveStatic(req, res, staticRoot);
  });

  const EDGE_HOST = process.env.HOST || '0.0.0.0';
  if (ROLE === 'public' && app.ugcMultiplayer) {
    edge.on('upgrade', (req, socket, head) => {
      if (app.ugcMultiplayer.handleUpgrade(req, socket, head)) return;
      if (!FORGE_UPSTREAM) socket.destroy();
    });
  }

  await new Promise((resolve, reject) => {
    edge.once('error', reject);
    edge.listen(EDGE_PORT, EDGE_HOST, resolve);
  });

  console.log(JSON.stringify({
    event: 'cloudrun_hub_listening',
    role: ROLE,
    port: EDGE_PORT,
    publicOrigin: config.userBaseUrl,
    forgeProxyEnabled: Boolean(FORGE_UPSTREAM),
    storeProxyEnabled,
    remoteVerifyEnabled: ALLOW_REMOTE_VERIFY,
    revision: process.env.K_REVISION || 'local',
  }));

  const shutdown = async () => {
    edge.closeAllConnections?.();
    edge.close();
    await embeddedStore?.close?.();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
