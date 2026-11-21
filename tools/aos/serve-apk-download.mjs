import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, relative, dirname, extname, sep, isAbsolute, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../hub/server/app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const BLOCKED_LIVE_HOST_PATTERNS = [
  /(^|\.)live\.playhub\./i,
  /(^|\.)playhub-live-[a-z0-9-]+\./i,
  /^playhub\.example\.com$/i
];

export function isBlockedLiveHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) return false;
  return BLOCKED_LIVE_HOST_PATTERNS.some(re => re.test(normalized));
}

/**
 * Enforces Dev-only remote data source selection (Fail-Closed).
 * Live direct connection from local dev server is strictly forbidden;
 * live data must enter dev via sanitize-snapshot.mjs (live -> dev) first.
 */
export function validateDataSourceOption(dataSource = 'local', devUrl = '') {
  const mode = String(dataSource || 'local').trim().toLowerCase();
  if (mode !== 'local' && mode !== 'dev') {
    const err = new Error(`Unsupported --data-source '${dataSource}'. Only 'local' or 'dev' is allowed (direct 'live' connection is forbidden).`);
    err.code = 'FORBIDDEN_DATA_SOURCE';
    throw err;
  }
  if (mode === 'local') {
    return { mode: 'local', devUrl: null };
  }
  const cleanUrl = String(devUrl || '').trim().replace(/\/$/, '');
  if (!cleanUrl) {
    const err = new Error("--dev-url is required when --data-source=dev.");
    err.code = 'MISSING_DEV_URL';
    throw err;
  }
  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    const err = new Error(`Invalid --dev-url '${cleanUrl}'.`);
    err.code = 'INVALID_DEV_URL';
    throw err;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const err = new Error('--dev-url must use http:// or https://.');
    err.code = 'INVALID_DEV_URL';
    throw err;
  }
  if (isBlockedLiveHost(parsed.hostname)) {
    const err = new Error(`Blocked live host '${parsed.hostname}'. Local dev builds may connect only to 'dev' Farm, never 'live'.`);
    err.code = 'FORBIDDEN_LIVE_HOST';
    throw err;
  }
  return { mode: 'dev', devUrl: cleanUrl };
}

export function sanitizeGameRelPath(rawRel) {
  if (typeof rawRel !== 'string' || !rawRel) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawRel);
  } catch {
    return null;
  }
  if (!decoded || /[\x00-\x1f]/.test(decoded)) return null;
  if (
    decoded.startsWith('/') ||
    decoded.startsWith('\\') ||
    decoded.includes('\\') ||
    decoded.includes(':') ||
    decoded.includes('..')
  ) {
    return null;
  }
  const rawSegments = decoded.split('/');
  if (rawSegments.some(seg => !seg || seg === '.' || seg === '..')) return null;
  const normalized = posix.normalize(decoded);
  if (
    !normalized ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('/') ||
    normalized.startsWith('../') ||
    normalized.includes('..')
  ) {
    return null;
  }
  return normalized;
}

export function resolveWithinRoot(allowedRoot, safeRel) {
  if (!safeRel) return null;
  const rootAbs = resolve(allowedRoot);
  const resolved = resolve(rootAbs, safeRel);
  const rel = relative(rootAbs, resolved);
  if (
    !rel ||
    rel === '.' ||
    rel === '..' ||
    rel.startsWith(`..${sep}`) ||
    rel.startsWith('../') ||
    isAbsolute(rel)
  ) {
    return null;
  }
  return resolved;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.pck': 'application/octet-stream'
};

function formatMiB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function ensurePersistentLocalWorkspace(workDir) {
  mkdirSync(join(workDir, 'catalog'), { recursive: true });
  mkdirSync(join(workDir, 'games/survivor-arena-g2/Web'), { recursive: true });
  mkdirSync(join(workDir, 'games/nextgen-godot48/Web'), { recursive: true });
  mkdirSync(join(workDir, 'games/match3-garden/Web'), { recursive: true });
  mkdirSync(join(workDir, 'data'), { recursive: true });
  mkdirSync(join(workDir, 'dev-asset-cache'), { recursive: true });

  const realPck = resolve(repoRoot, 'games/survivor-arena-g2/Web/index.pck');
  const destPck = join(workDir, 'games/survivor-arena-g2/Web/index.pck');
  if (existsSync(realPck) && !existsSync(destPck)) {
    copyFileSync(realPck, destPck);
  }

  const writeIfMissing = (relPath, obj) => {
    const full = join(workDir, relPath);
    if (!existsSync(full)) {
      writeFileSync(full, JSON.stringify(obj, null, 2) + '\n');
    }
  };

  writeIfMissing('catalog/games.json', {
    schemaVersion: 1,
    entries: [
      { id: 'survivor-arena-g2', path: 'games/survivor-arena-g2', enabled: true },
      { id: 'nextgen-godot48', path: 'games/nextgen-godot48', enabled: true },
      { id: 'match3-garden', path: 'games/match3-garden', enabled: true }
    ]
  });
  writeIfMissing('games/survivor-arena-g2/game.manifest.json', {
    id: 'survivor-arena-g2',
    entry: 'index.html',
    title: 'Survivor Arena G2',
    summary: 'Godot 4.7.2 네이티브 3D 서바이벌',
    tags: ['action', 'godot'],
    android: { runtime: 'godot-pck', engineVersion: '4.7.2', minAppVersionCode: 1, bundle: { url: '/games/survivor-arena-g2/index.pck' } }
  });
  writeIfMissing('games/nextgen-godot48/game.manifest.json', {
    id: 'nextgen-godot48',
    entry: 'index.html',
    title: 'NextGen 3D Arena (Godot 4.8)',
    summary: '상위 엔진 4.8.0 요구 호환성 테스트',
    tags: ['action', 'godot'],
    android: { runtime: 'godot-pck', engineVersion: '4.8.0', minAppVersionCode: 1, bundle: { url: '/games/nextgen-godot48/index.pck', bytes: 2048000 } }
  });
  writeIfMissing('games/match3-garden/game.manifest.json', {
    id: 'match3-garden',
    entry: 'index.html',
    title: 'Match-3 Garden',
    summary: '즉시 웹플레이 퍼즐 (HTML5)',
    tags: ['puzzle']
  });
}

function captureLocalHandlerResponse(handler, req) {
  return new Promise((resolveCapture, rejectCapture) => {
    let statusCode = 200;
    const headers = {};
    const chunks = [];
    const mockRes = {
      headersSent: false,
      writeHead(code, hdrs = {}) {
        statusCode = code;
        Object.assign(headers, hdrs);
        this.headersSent = true;
      },
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      getHeader(k) { return headers[k.toLowerCase()]; },
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        this.headersSent = true;
        resolveCapture({ statusCode, headers, body: Buffer.concat(chunks).toString('utf8') });
      }
    };
    Promise.resolve(handler(req, mockRes)).catch(rejectCapture);
  });
}

export function createAosDevServer({
  port = Number(process.env.PLAYHUB_APK_PORT || 18190),
  dataDir = process.env.PLAYHUB_AOS_DATA_DIR || resolve(repoRoot, 'artifacts/aos-local-data'),
  dataSource = process.env.PLAYHUB_DATA_SOURCE || 'local',
  devUrl = process.env.PLAYHUB_DEV_URL || '',
  fetchImpl = globalThis.fetch
} = {}) {
  const validated = validateDataSourceOption(dataSource, devUrl);
  const workDir = resolve(dataDir);
  ensurePersistentLocalWorkspace(workDir);

  const APKS = {
    '/download/PlayHub-Hub-AOS-release-arm64.apk': {
      file: resolve(repoRoot, 'android/app/build/outputs/apk/cfgRelease/release/app-cfgRelease-release.apk'),
      filename: 'PlayHub-Hub-AOS-release-arm64.apk',
      title: 'Play Hub Release (최소 용량 · arm64-v8a)',
      pkg: 'com.playhub.hub_aos.release',
      note: 'R8 + 리소스 축소 적용 · 스타터 0종 On-Demand · Farm 선택 잠금'
    },
    '/download/PlayHub-Hub-AOS-debug.apk': {
      file: resolve(repoRoot, 'android/app/build/outputs/apk/cfgDebug/debug/app-cfgDebug-debug.apk'),
      filename: 'PlayHub-Hub-AOS-debug.apk',
      title: 'Play Hub Debug (Dev Farm 선택 · 상태 표시 · arm64+x86_64)',
      pkg: 'com.playhub.hub_aos.debug',
      note: '상단/더보기에서 Local·Dev Farm 선택 가능 (Live 직결 차단) · 실기기/에뮬레이터 겸용'
    }
  };

  const hubApp = createApp(
    {
      dataDir: join(workDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: `http://127.0.0.1:${port}`,
      userOrigins: [`http://127.0.0.1:${port}`],
      adminOrigins: ['http://127.0.0.1:18131'],
      mobile: { enabled: true, jwtSecret: 'playhub-aos-live-verify-secret-32-chars!!' }
    },
    { rootDir: workDir }
  );

  function renderIndex() {
    const modeBanner = validated.mode === 'dev'
      ? `DEV READ-ONLY OVERLAY (${validated.devUrl}) + 로컬 테스트 데이터 영구 유지 (${workDir})`
      : `LOCAL 영구 테스트 데이터 모드 (${workDir})`;

    const cards = Object.entries(APKS).map(([route, info]) => {
      const ok = existsSync(info.file);
      const size = ok ? formatMiB(statSync(info.file).size) : '빌드 중...';
      return `
        <div class="card">
          <div class="title">${info.title}</div>
          <div class="meta">Package: <code>${info.pkg}</code> · 크기: <strong>${size}</strong></div>
          <div class="note">${info.note}</div>
          ${ok
            ? `<a class="btn" href="${route}">⬇️ ${info.filename} 다운로드</a>`
            : `<div class="disabled">APK 준비 중</div>`}
        </div>
      `;
    }).join('\n');

    return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Play Hub Android APK 다운로드 (Hub-AOS)</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#191b1d; color:#ffffff; padding:20px; }
    .wrap { max-width:560px; margin:0 auto; }
    h1 { font-size:22px; margin:0 0 8px; }
    .sub { color:#aaabad; font-size:13px; margin-bottom:12px; }
    .mode { background:#232629; border:1px solid #00b06f; color:#c0ffd6; font-size:12px; padding:10px 12px; border-radius:10px; margin-bottom:18px; }
    .card { background:#232629; border:1px solid #34383c; border-radius:14px; padding:16px; margin-bottom:14px; }
    .title { font-size:16px; font-weight:700; margin-bottom:6px; }
    .meta { font-size:13px; color:#d1d5db; margin-bottom:6px; }
    .note { font-size:12px; color:#aaabad; margin-bottom:12px; }
    .btn { display:block; text-align:center; background:#00b06f; color:#002111; text-decoration:none; font-weight:700; padding:12px; border-radius:10px; }
    .disabled { text-align:center; background:#2b2e32; color:#aaabad; padding:10px; border-radius:10px; }
    code { background:#2b2e32; padding:2px 6px; border-radius:6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>▶ PLAYHUB Android APK (Hub-AOS)</h1>
    <div class="sub">Godot 4.7.2 네이티브 내장 · 게임 플레이 런타임 전용 (Forge 제외) · Stitch 디자인 적용</div>
    <div class="mode">데이터 모드: ${modeBanner}</div>
    ${cards}
  </div>
</body>
</html>`;
  }

  async function handleDevMergedCatalog(req, res, urlObj) {
    const localResult = await captureLocalHandlerResponse(hubApp.publicHandler, req);
    if (localResult.statusCode !== 200) {
      res.writeHead(localResult.statusCode, localResult.headers);
      res.end(localResult.body);
      return;
    }
    let localJson;
    try {
      localJson = JSON.parse(localResult.body);
    } catch {
      res.writeHead(localResult.statusCode, localResult.headers);
      res.end(localResult.body);
      return;
    }

    // Read-Only GET from Dev Farm; never forward mutations or auth credentials
    let remoteGames = [];
    let devOverlayConnected = false;
    try {
      const remoteUrl = `${validated.devUrl}${urlObj.pathname}${urlObj.search}`;
      const r = await fetchImpl(remoteUrl, { method: 'GET', headers: { Accept: 'application/json' } });
      if (r.ok) {
        const parsed = await r.json();
        if (Array.isArray(parsed.games)) {
          remoteGames = parsed.games.map(g => ({ ...g, dataSource: 'dev' }));
          devOverlayConnected = true;
          // Register lightweight read-only catalog stubs for remote dev games so local saves & play-sessions work seamlessly
          // without overwriting any local test game entries.
          try {
            const catPath = join(workDir, 'catalog/games.json');
            const cat = JSON.parse(readFileSync(catPath, 'utf8'));
            const existingIds = new Set((cat.entries || []).map(e => e.id));
            let changed = false;
            for (const g of remoteGames) {
              if (!g?.id || !/^[a-z0-9-]+$/.test(g.id) || existingIds.has(g.id)) continue;
              const gDir = join(workDir, 'games', g.id);
              mkdirSync(join(gDir, 'Web'), { recursive: true });
              writeFileSync(
                join(gDir, 'game.manifest.json'),
                JSON.stringify({
                  id: g.id,
                  entry: 'index.html',
                  title: g.title || g.id,
                  summary: g.description || '',
                  tags: g.genre ? [g.genre] : ['dev-overlay'],
                  android: g.runtime === 'godot-pck'
                    ? { runtime: 'godot-pck', engineVersion: g.requiredEngineVersion || '4.7.2', minAppVersionCode: g.minAppVersionCode || 1, bundle: { url: g.pckUrl || `/games/${g.id}/index.pck`, bytes: g.pckBytes || 0 } }
                    : undefined
                }, null, 2) + '\n'
              );
              cat.entries.push({ id: g.id, path: `games/${g.id}`, enabled: true, source: 'dev-overlay' });
              existingIds.add(g.id);
              changed = true;
            }
            if (changed) writeFileSync(catPath, JSON.stringify(cat, null, 2) + '\n');
          } catch {}
        }
      }
    } catch {
      devOverlayConnected = false;
    }

    // Merge: keep ALL local test games + add remote dev games (preserving local-only games!)
    const mergedMap = new Map();
    for (const g of remoteGames) {
      if (g && g.id) mergedMap.set(g.id, g);
    }
    for (const g of (localJson.games || [])) {
      if (g && g.id && !mergedMap.has(g.id)) {
        mergedMap.set(g.id, { ...g, dataSource: 'local' });
      }
    }

    const payload = JSON.stringify({
      ...localJson,
      dataSourceMode: 'dev-overlay',
      devOverlayConnected,
      localDataPreserved: true,
      games: Array.from(mergedMap.values())
    });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(payload);
  }

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, 'http://localhost');
    const urlPath = urlObj.pathname;

    // Read-Only Dev Overlay for GET /api/mobile/catalog (all writes stay strictly in persistent local SQLite)
    if (validated.mode === 'dev' && req.method === 'GET' && urlPath === '/api/mobile/catalog') {
      await handleDevMergedCatalog(req, res, urlObj);
      return;
    }

    if (urlPath.startsWith('/api/')) {
      hubApp.publicHandler(req, res);
      return;
    }

    if (urlPath === '/' || urlPath === '/index.html') {
      const html = renderIndex();
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }

    const entry = APKS[urlPath];
    if (entry) {
      if (!existsSync(entry.file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('APK not built yet');
        return;
      }
      const stat = statSync(entry.file);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${entry.filename}"`,
        'Content-Length': stat.size,
        'Cache-Control': 'no-store'
      });
      createReadStream(entry.file).pipe(res);
      return;
    }

    // Serve local game files first (preserving local test games), then read-only Dev overlay + cache
    const gameMatch = urlPath.match(/^\/games\/([a-z0-9-]+)\/(.+)$/);
    if (gameMatch) {
      const [, gameId, rawRel] = gameMatch;
      const safeRel = sanitizeGameRelPath(rawRel);
      if (!safeRel) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid game asset path');
        return;
      }
      const allowedReadRoots = [
        resolve(workDir, 'games', gameId, 'Web'),
        resolve(repoRoot, 'games', gameId, 'Web'),
        resolve(workDir, 'dev-asset-cache', gameId)
      ];
      for (const root of allowedReadRoots) {
        const candidate = resolveWithinRoot(root, safeRel);
        if (!candidate) continue;
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          const st = statSync(candidate);
          res.writeHead(200, {
            'Content-Type': MIME[extname(candidate).toLowerCase()] || 'application/octet-stream',
            'Content-Length': st.size,
            'Cache-Control': 'no-store'
          });
          createReadStream(candidate).pipe(res);
          return;
        }
      }
      // Fallback Read-Only fetch from Dev Farm and cache locally
      if (validated.mode === 'dev' && req.method === 'GET') {
        try {
          const cacheRoot = resolve(workDir, 'dev-asset-cache', gameId);
          const cacheFile = resolveWithinRoot(cacheRoot, safeRel);
          if (!cacheFile) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Invalid game asset path');
            return;
          }
          const encodedRel = safeRel.split('/').map(encodeURIComponent).join('/');
          const r = await fetchImpl(`${validated.devUrl}/games/${gameId}/${encodedRel}`, { method: 'GET' });
          if (r.ok) {
            const buf = Buffer.from(await r.arrayBuffer());
            mkdirSync(dirname(cacheFile), { recursive: true });
            writeFileSync(cacheFile, buf);
            res.writeHead(200, {
              'Content-Type': r.headers.get('content-type') || MIME[extname(cacheFile).toLowerCase()] || 'application/octet-stream',
              'Content-Length': buf.length,
              'Cache-Control': 'no-store'
            });
            res.end(buf);
            return;
          }
        } catch {}
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });

  return {
    server,
    hubApp,
    workDir,
    mode: validated.mode,
    devUrl: validated.devUrl,
    close: async () => {
      await new Promise(resolveClose => server.close(() => resolveClose()));
      await hubApp.close();
    }
  };
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--port' && v) { opts.port = Number(v); i++; }
    else if (k === '--data-dir' && v) { opts.dataDir = v; i++; }
    else if (k === '--data-source' && v) { opts.dataSource = v; i++; }
    else if (k === '--dev-url' && v) { opts.devUrl = v; i++; }
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const port = opts.port ?? Number(process.env.PLAYHUB_APK_PORT || 18190);
  const instance = createAosDevServer({ ...opts, port });
  instance.server.listen(port, '127.0.0.1', () => {
    console.log(`APK_AND_HUB_SERVER_READY http://127.0.0.1:${port}/ mode=${instance.mode} dataDir=${instance.workDir}`);
  });
}
