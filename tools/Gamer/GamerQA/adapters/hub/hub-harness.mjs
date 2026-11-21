import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MIME_TYPES } from '../../core/fs-utils.mjs';

function serveFile(req, res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function safeResolve(baseDir, relPath) {
  const cleaned = relPath.replace(/^\/+/, '');
  if (cleaned.includes('\0') || cleaned.includes('\\') || cleaned.split('/').some((s) => s === '..')) {
    return null;
  }
  const full = path.resolve(baseDir, cleaned);
  if (full !== baseDir && !full.startsWith(baseDir + path.sep)) return null;
  return full;
}

function stageCatalogRoot(projectRoot, tmpDir) {
  const staged = path.join(tmpDir, 'staged-hub-root');
  fs.mkdirSync(path.join(staged, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(staged, 'games'), { recursive: true });
  const rawCatalog = JSON.parse(fs.readFileSync(path.join(projectRoot, 'games', 'catalog.json'), 'utf8'));
  const entries = [];
  for (const entry of rawCatalog.entries || []) {
    if (!entry?.id) continue;
    const srcManifest = path.join(projectRoot, 'games', entry.id, 'game.manifest.json');
    if (!fs.existsSync(srcManifest)) continue;
    const manifest = JSON.parse(fs.readFileSync(srcManifest, 'utf8'));
    if (manifest.entry !== 'index.html') continue;
    const dstGameDir = path.join(staged, 'games', entry.id);
    fs.mkdirSync(dstGameDir, { recursive: true });
    fs.copyFileSync(srcManifest, path.join(dstGameDir, 'game.manifest.json'));
    entries.push({
      id: entry.id,
      path: `games/${entry.id}`,
      enabled: entry.enabled !== false,
    });
  }
  fs.writeFileSync(
    path.join(staged, 'catalog', 'games.json'),
    JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n',
    'utf8'
  );
  return staged;
}

export async function startIsolatedHubStack({ projectRoot, adminPassword = 'HubUseCase-Admin-2026!' } = {}) {
  const hubRoot = path.join(projectRoot, 'hub');
  const distUser = path.join(hubRoot, 'dist', 'user');
  const distAdmin = path.join(hubRoot, 'dist', 'admin');
  const useDist = fs.existsSync(path.join(distUser, 'index.html')) && fs.existsSync(path.join(distAdmin, 'index.html'));

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-hub-stack-'));
  const dataDir = path.join(tmpDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const catalogRoot = useDist ? distUser : stageCatalogRoot(projectRoot, tmpDir);
  const userStaticDir = useDist ? distUser : path.join(hubRoot, 'web', 'user');
  const adminStaticDir = useDist ? distAdmin : path.join(hubRoot, 'web', 'admin');
  const sharedDir = path.join(hubRoot, 'shared');
  const gamesRoot = path.join(projectRoot, 'games');

  // Synthesize in-memory locale.js / locale-data.js when running from raw source tree without syncLocales output
  let localeRuntimeJs = null;
  let localeDataJs = null;
  if (!useDist && fs.existsSync(path.join(sharedDir, 'locale.js'))) {
    localeRuntimeJs = fs.readFileSync(path.join(sharedDir, 'locale.js'), 'utf8');
    const parts = [];
    for (const rel of ['locales/platform.js', 'locales/community.js']) {
      const f = path.join(sharedDir, rel);
      if (fs.existsSync(f)) parts.push(fs.readFileSync(f, 'utf8'));
    }
    const bundlePath = path.join(sharedDir, 'locales', 'l10n-bundle.json');
    if (fs.existsSync(bundlePath)) {
      try {
        const { compileL10nBundleJs } = await import(pathToFileURL(path.join(hubRoot, 'server', 'l10n-engine.mjs')).href);
        parts.push(compileL10nBundleJs(JSON.parse(fs.readFileSync(bundlePath, 'utf8'))));
      } catch {}
    }
    const metadata = {};
    try {
      const cat = JSON.parse(fs.readFileSync(path.join(gamesRoot, 'catalog.json'), 'utf8'));
      for (const entry of cat.entries || []) {
        const mp = path.join(gamesRoot, entry.id, 'game.manifest.json');
        if (!fs.existsSync(mp)) continue;
        const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
        for (const field of ['title', 'summary', 'instructions', 'rules']) {
          const row = m[field];
          if (row?.ko && typeof row.ko === 'string') metadata[row.ko] = row;
        }
      }
    } catch {}
    parts.push(`PlayHubLocale.register(${JSON.stringify(metadata)});\n`);
    localeDataJs = parts.join('\n');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = crypto.scryptSync(adminPassword, salt, 64).toString('hex');

  let app = null;

  const userEdge = http.createServer((req, res) => {
    const parsed = new URL(req.url || '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400); res.end('Bad Request'); return;
    }

    if (pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('window.PLAYHUB_CONFIG={"apiBaseUrl":location.origin,"mode":"gamerqa-usecase"};\n');
      return;
    }
    if (pathname.startsWith('/api/') || pathname.startsWith('/internal/')) {
      app.publicHandler(req, res);
      return;
    }
    if (!useDist) {
      if (pathname === '/locale.js' && localeRuntimeJs) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(localeRuntimeJs);
        return;
      }
      if (pathname === '/locale-data.js' && localeDataJs) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(localeDataJs);
        return;
      }
      if (pathname === '/catalog/games.json') {
        serveFile(req, res, path.join(catalogRoot, 'catalog', 'games.json'));
        return;
      }
      if (pathname.startsWith('/shared/')) {
        const f = safeResolve(sharedDir, pathname.slice('/shared/'.length));
        if (f) { serveFile(req, res, f); return; }
      }
      const gameMatch = pathname.match(/^\/games\/([a-z0-9-]+)\/(.+)$/);
      if (gameMatch) {
        const [, gameId, rest] = gameMatch;
        if (rest === 'game.manifest.json') {
          serveFile(req, res, path.join(gamesRoot, gameId, 'game.manifest.json'));
          return;
        }
        const f = safeResolve(path.join(gamesRoot, gameId, 'Web'), rest);
        if (f) { serveFile(req, res, f); return; }
      }
    }

    let target = safeResolve(userStaticDir, pathname === '/' ? 'index.html' : pathname);
    if (target && fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if ((!target || !fs.existsSync(target) || !fs.statSync(target).isFile()) && pathname.startsWith('/play/')) {
      target = path.join(userStaticDir, 'index.html');
    }
    if (!target) { res.writeHead(400); res.end('Bad Request'); return; }
    serveFile(req, res, target);
  });

  const adminEdge = http.createServer((req, res) => {
    const parsed = new URL(req.url || '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(parsed.pathname);
    } catch {
      res.writeHead(400); res.end('Bad Request'); return;
    }
    if (pathname === '/config.js') {
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('window.PLAYHUB_ADMIN_CONFIG={"apiBaseUrl":location.origin,"mode":"gamerqa-usecase-admin"};\n');
      return;
    }
    if (pathname.startsWith('/api/')) {
      app.adminHandler(req, res);
      return;
    }
    if (!useDist) {
      if (pathname === '/locale.js' && localeRuntimeJs) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(localeRuntimeJs);
        return;
      }
      if (pathname === '/locale-data.js' && localeDataJs) {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(localeDataJs);
        return;
      }
    }
    let target = safeResolve(adminStaticDir, pathname === '/' ? 'index.html' : pathname);
    if (target && fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!target) { res.writeHead(400); res.end('Bad Request'); return; }
    serveFile(req, res, target);
  });

  const listen = (srv) =>
    new Promise((resolve, reject) => {
      srv.once('error', reject);
      srv.listen(0, '127.0.0.1', () => {
        srv.off('error', reject);
        resolve(srv.address().port);
      });
    });

  const userPort = await listen(userEdge);
  const adminPort = await listen(adminEdge);
  const userBaseUrl = `http://127.0.0.1:${userPort}`;
  const adminBaseUrl = `http://127.0.0.1:${adminPort}`;

  const { createApp } = await import(pathToFileURL(path.join(hubRoot, 'server', 'app.mjs')).href);
  app = createApp(
    {
      publicHost: '127.0.0.1',
      adminHost: '127.0.0.1',
      publicPort: userPort,
      adminPort,
      userOrigins: [userBaseUrl],
      adminOrigins: [adminBaseUrl],
      userBaseUrl,
      publicBaseUrl: userBaseUrl,
      adminBaseUrl,
      dataDir,
      secureCookies: false,
      admin: {
        username: 'admin',
        passwordHash,
        salt,
        localAutoLogin: false,
      },
    },
    { rootDir: catalogRoot, platformRoot: projectRoot }
  );

  return {
    userBaseUrl,
    adminBaseUrl,
    adminCredentials: { username: 'admin', password: adminPassword },
    dataDir,
    app,
    async close() {
      userEdge.closeAllConnections?.();
      adminEdge.closeAllConnections?.();
      await Promise.all([
        new Promise((r) => userEdge.close(r)),
        new Promise((r) => adminEdge.close(r)),
      ]);
      await app.close();
      fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
    },
  };
}
