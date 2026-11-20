import http from 'node:http';
import { createReadStream, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../hub/server/app.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const port = Number(process.env.PLAYHUB_APK_PORT || 18190);

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
    title: 'Play Hub Debug (Farm 서버군 선택 가능 · arm64+x86_64)',
    pkg: 'com.playhub.hub_aos.debug',
    note: '상단/더보기에서 Farm 서버군·Custom URL 선택 가능 · 실기기/에뮬레이터 겸용'
  }
};

// Prepare live Hub Mobile API fixture root with real survivor-arena-g2 .pck + Godot 4.8 incompat test game + match3-garden web game
const workDir = mkdtempSync(join(tmpdir(), 'playhub-aos-live-'));
mkdirSync(join(workDir, 'catalog'), { recursive: true });
mkdirSync(join(workDir, 'games/survivor-arena-g2/Web'), { recursive: true });
mkdirSync(join(workDir, 'games/nextgen-godot48/Web'), { recursive: true });
mkdirSync(join(workDir, 'games/match3-garden/Web'), { recursive: true });
mkdirSync(join(workDir, 'data'), { recursive: true });

const realPck = resolve(repoRoot, 'games/survivor-arena-g2/Web/index.pck');
if (existsSync(realPck)) {
  copyFileSync(realPck, join(workDir, 'games/survivor-arena-g2/Web/index.pck'));
}

writeFileSync(
  join(workDir, 'catalog/games.json'),
  JSON.stringify({
    schemaVersion: 1,
    entries: [
      { id: 'survivor-arena-g2', path: 'games/survivor-arena-g2', enabled: true },
      { id: 'nextgen-godot48', path: 'games/nextgen-godot48', enabled: true },
      { id: 'match3-garden', path: 'games/match3-garden', enabled: true }
    ]
  })
);
writeFileSync(
  join(workDir, 'games/survivor-arena-g2/game.manifest.json'),
  JSON.stringify({
    id: 'survivor-arena-g2',
    entry: 'index.html',
    title: 'Survivor Arena G2',
    summary: 'Godot 4.7.2 네이티브 3D 서바이벌',
    tags: ['action', 'godot'],
    android: { runtime: 'godot-pck', engineVersion: '4.7.2', minAppVersionCode: 1, bundle: { url: '/games/survivor-arena-g2/index.pck' } }
  })
);
writeFileSync(
  join(workDir, 'games/nextgen-godot48/game.manifest.json'),
  JSON.stringify({
    id: 'nextgen-godot48',
    entry: 'index.html',
    title: 'NextGen 3D Arena (Godot 4.8)',
    summary: '상위 엔진 4.8.0 요구 호환성 테스트',
    tags: ['action', 'godot'],
    android: { runtime: 'godot-pck', engineVersion: '4.8.0', minAppVersionCode: 1, bundle: { url: '/games/nextgen-godot48/index.pck', bytes: 2048000 } }
  })
);
writeFileSync(
  join(workDir, 'games/match3-garden/game.manifest.json'),
  JSON.stringify({
    id: 'match3-garden',
    entry: 'index.html',
    title: 'Match-3 Garden',
    summary: '즉시 웹플레이 퍼즐 (HTML5)',
    tags: ['puzzle']
  })
);

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

function renderIndex() {
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
    body { margin:0; font-family: system-ui, sans-serif; background:#0a0f1a; color:#f8fafc; padding:20px; }
    .wrap { max-width:560px; margin:0 auto; }
    h1 { font-size:22px; margin:0 0 8px; }
    .sub { color:#94a3b8; font-size:13px; margin-bottom:20px; }
    .card { background:#131a27; border:1px solid #23304a; border-radius:16px; padding:16px; margin-bottom:14px; }
    .title { font-size:16px; font-weight:700; margin-bottom:6px; }
    .meta { font-size:13px; color:#cbd5e1; margin-bottom:6px; }
    .note { font-size:12px; color:#94a3b8; margin-bottom:12px; }
    .btn { display:block; text-align:center; background:#16a34a; color:#fff; text-decoration:none; font-weight:700; padding:12px; border-radius:12px; }
    .disabled { text-align:center; background:#374151; color:#9ca3af; padding:10px; border-radius:12px; }
    code { background:#1e293b; padding:2px 6px; border-radius:6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>▶ Play Hub Android APK (Hub-AOS)</h1>
    <div class="sub">Godot 4.7.2 네이티브 내장 · 게임 플레이 런타임 전용 (Forge 제외) · Roblox 스타일 5탭 · 온라인 .pck 다운로드 연동 완료</div>
    ${cards}
  </div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;

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

  // Serve real game files (/games/<id>/<file>) from repoRoot/games/<id>/Web/
  const gameMatch = urlPath.match(/^\/games\/([a-z0-9-]+)\/(.+)$/);
  if (gameMatch) {
    const [, gameId, rel] = gameMatch;
    if (!rel.includes('..')) {
      const candidate = resolve(repoRoot, 'games', gameId, 'Web', rel);
      const allowedRoot = resolve(repoRoot, 'games', gameId, 'Web');
      if (candidate.startsWith(allowedRoot) && existsSync(candidate) && statSync(candidate).isFile()) {
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
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(port, '127.0.0.1', () => {
  console.log(`APK_AND_HUB_SERVER_READY http://127.0.0.1:${port}/`);
});
