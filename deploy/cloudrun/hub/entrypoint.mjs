import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../../hub/server/app.mjs';
import { assertRuntimeOutput } from '../../../hub/tools/runtime-output.cjs';

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

  const forgeEnabled = process.env.PLAYHUB_FORGE_ENABLED === 'true' && isHttps;

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
      directory: FORGE_DIR,
      internalSecret: process.env.PLAYHUB_FORGE_INTERNAL_SECRET || crypto.randomBytes(32).toString('hex'),
    },
  };
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

export function proxyRequest(req, res, targetBase, stripPrefix = '', extraTlsOptions = null) {
  const { isHttps, options } = buildUpstreamRequestOptions(targetBase, req, stripPrefix);
  const transport = isHttps ? https : http;
  const reqOpts = isHttps && extraTlsOptions ? { ...options, ...extraTlsOptions } : options;

  const upstream = transport.request(reqOpts, upRes => {
    const outHeaders = { ...upRes.headers };
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

function serveStatic(req, res, staticRoot) {
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

  const headers = {
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
  };

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  if (req.method !== 'HEAD' && COMPRESSIBLE.has(ext) && acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
    res.writeHead(200, headers);
    fs.createReadStream(real).pipe(zlib.createGzip()).pipe(res);
    return;
  }

  headers['Content-Length'] = fs.statSync(real).size;
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

  const stripSpoofedHeaders = req => {
    for (const key of Object.keys(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === 'x-playhub-internal-secret' && ALLOW_REMOTE_VERIFY) continue;
      if (STRIP_HEADERS.has(lower) || lower.startsWith('x-playhub-')) {
        delete req.headers[key];
      }
    }
  };

  const edge = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://localhost').pathname;

    if (pathname === '/_healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, role: ROLE, revision: process.env.K_REVISION || 'local' }));
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
      stripSpoofedHeaders(req);
      apiHandler(req, res);
      return;
    }

    serveStatic(req, res, staticRoot);
  });

  const EDGE_HOST = process.env.HOST || '0.0.0.0';
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
    remoteVerifyEnabled: ALLOW_REMOTE_VERIFY,
    revision: process.env.K_REVISION || 'local',
  }));

  const shutdown = async () => {
    edge.closeAllConnections?.();
    edge.close();
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
