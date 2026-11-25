import fs from 'node:fs';
import path from 'node:path';
import { ApiError, json } from './security.mjs';

const PLATFORM_LABELS = Object.freeze({
  windows: 'Windows',
  macos: 'macOS',
  android: 'Android',
  ios: 'iOS',
});

function findFirstExistingFile(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = fs.realpathSync(candidate);
      const stat = fs.statSync(resolved);
      if (stat.isFile() && stat.size > 0) {
        return { path: resolved, sizeBytes: stat.size };
      }
    } catch {}
  }
  return null;
}

function buildBootstrapContent(spec, publicBaseUrl) {
  const base = String(publicBaseUrl || 'https://playhub-hub-88778617121.us-west1.run.app').replace(/\/$/, '');
  const targetUrl = spec.category === 'forge' ? `${base}/forge/OfficialGodot/` : `${base}/`;
  if (spec.platform === 'windows') {
    return {
      filename: spec.bootstrapFilename,
      contentType: 'text/plain; charset=utf-8',
      body: [
        '@echo off',
        `echo Opening ${spec.title} (${targetUrl})...`,
        `start "" "${targetUrl}"`,
        '',
      ].join('\r\n'),
    };
  }
  if (spec.platform === 'macos') {
    return {
      filename: spec.bootstrapFilename,
      contentType: 'text/plain; charset=utf-8',
      body: [
        '#!/bin/bash',
        `echo "Opening ${spec.title} (${targetUrl})..."`,
        `open "${targetUrl}"`,
        '',
      ].join('\n'),
    };
  }
  return {
    filename: spec.bootstrapFilename,
    contentType: 'text/plain; charset=utf-8',
    body: [
      `${spec.title} (${PLATFORM_LABELS[spec.platform] || spec.platform})`,
      `연결 서버: ${targetUrl}`,
      `패키지: ${spec.defaultFilename}`,
      '',
      spec.platform === 'android'
        ? '안내: Android 빌드 APK(com.playhub.gamedev.dev)가 릴리스 스토리지에 등록되면 이 버튼에서 APK가 직접 다운로드됩니다. 웹 브라우저에서 바로 접속해 플레이할 수도 있습니다.'
        : '안내: iOS TestFlight / App Store 링크가 설정되면 이 버튼에서 바로 설치 페이지로 연결됩니다. Safari에서 홈 화면에 추가해 바로 플레이할 수도 있습니다.',
      '',
    ].join('\n'),
  };
}

export function resolvePlatformDownloads({ platformRoot, publicBaseUrl = '', env = process.env } = {}) {
  const repoRoot = platformRoot ? path.resolve(platformRoot) : process.cwd();
  const specs = [
    {
      id: 'windows-hub',
      platform: 'windows',
      platformLabel: 'Windows',
      category: 'hub',
      categoryLabel: 'PLAY HUB 앱',
      title: '윈도우 플레이 허브 앱',
      subtitle: 'Windows 10/11 네이티브 데스크톱 런처 · Godot 4.7.2 게임 즉시 실행 및 클라우드 세이브',
      arch: 'Windows 64-bit (x64)',
      version: '0.3.0',
      defaultFilename: 'PlayHub-Setup-win64.exe',
      bootstrapFilename: 'PlayHub-Windows-Launcher.cmd',
      envUrl: env.PLAYHUB_DOWNLOAD_WIN_HUB_URL || env.PLAYFORGE_DESKTOP_BOOTSTRAPPER_WIN_URL || '',
      localPaths: [
        env.PLAYHUB_DOWNLOAD_WIN_HUB_PATH,
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayHub-Setup-win64.exe'),
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayHub-Desktop-win64.zip'),
        path.join(repoRoot, 'artifacts', 'desktop-m0', 'player', 'PlayHubPlayer.exe'),
      ],
    },
    {
      id: 'macos-hub',
      platform: 'macos',
      platformLabel: 'macOS',
      category: 'hub',
      categoryLabel: 'PLAY HUB 앱',
      title: '맥 플레이 허브 앱',
      subtitle: 'Apple Silicon · Intel Universal macOS 앱 · Metal 네이티브 렌더링 및 계정 동기화',
      arch: 'macOS Universal (arm64 · x64)',
      version: '0.3.0',
      defaultFilename: 'PlayHub-macos-universal.dmg',
      bootstrapFilename: 'PlayHub-macOS-Launcher.command',
      envUrl: env.PLAYHUB_DOWNLOAD_MAC_HUB_URL || '',
      localPaths: [
        env.PLAYHUB_DOWNLOAD_MAC_HUB_PATH,
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayHub-macos-universal.dmg'),
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayHub-macos-universal.zip'),
      ],
    },
    {
      id: 'android-hub',
      platform: 'android',
      platformLabel: 'Android',
      category: 'hub',
      categoryLabel: 'PLAY HUB 앱',
      title: '안드로이드 플레이 허브 앱',
      subtitle: 'Android 7.0+ (ARM64) · Godot 4.7.2 네이티브 .pck 런타임 및 모바일 전체화면 지원',
      arch: 'Android ARM64 (APK)',
      version: '0.1.0',
      defaultFilename: 'PlayHub-Android-arm64.apk',
      bootstrapFilename: 'PlayHub-Android-Guide.txt',
      defaultExternalUrl: 'https://github.com/alex-kang-ovdr/GoDotProjects/releases/download/dev-downloads/PlayHub-Android-arm64.apk',
      defaultSizeBytes: 29715832,
      envUrl: env.PLAYHUB_DOWNLOAD_ANDROID_HUB_URL || '',
      localPaths: [
        env.PLAYHUB_DOWNLOAD_ANDROID_HUB_PATH,
        path.join(repoRoot, 'artifacts', 'mobile-release', 'PlayHub-Android-arm64.apk'),
        path.join(repoRoot, 'android', 'app', 'build', 'outputs', 'apk', 'cfgDev', 'debug', 'app-cfgDev-debug.apk'),
      ],
    },
    {
      id: 'ios-hub',
      platform: 'ios',
      platformLabel: 'iOS',
      category: 'hub',
      categoryLabel: 'PLAY HUB 앱',
      title: 'iOS 플레이 허브 앱',
      subtitle: 'iPhone · iPad용 Play Hub 앱 · 터치 최적화 UI, Game Center 및 클라우드 세이브 연동',
      arch: 'iOS 15+ (TestFlight / IPA)',
      version: '0.1.0',
      defaultFilename: 'PlayHub-iOS.ipa',
      bootstrapFilename: 'PlayHub-iOS-Guide.txt',
      envUrl: env.PLAYHUB_DOWNLOAD_IOS_HUB_URL || '',
      localPaths: [
        env.PLAYHUB_DOWNLOAD_IOS_HUB_PATH,
        path.join(repoRoot, 'artifacts', 'mobile-release', 'PlayHub-iOS.ipa'),
      ],
    },
    {
      id: 'windows-forge',
      platform: 'windows',
      platformLabel: 'Windows',
      category: 'forge',
      categoryLabel: 'FORGE 에디터',
      title: '윈도우용 포지 에디터',
      subtitle: '커스텀 Godot 4.7.2 데스크톱 에디터 · 로컬 GPU, Jolt Physics, 원클릭 Hub 배포',
      arch: 'Windows 64-bit (x64)',
      version: '4.7.2',
      defaultFilename: 'PlayForge-Editor-4.7.2-win64.exe',
      bootstrapFilename: 'PlayForge-Windows-Launcher.cmd',
      envUrl: env.PLAYHUB_DOWNLOAD_WIN_FORGE_URL || env.PLAYFORGE_DESKTOP_DOWNLOAD_WIN_URL || '',
      localPaths: [
        env.PLAYHUB_DOWNLOAD_WIN_FORGE_PATH,
        env.PLAYFORGE_DESKTOP_DOWNLOAD_WIN_PATH,
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayForge-Desktop-win64.zip'),
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayForge-Godot-4.7.2-win64.exe'),
      ],
    },
    {
      id: 'macos-forge',
      platform: 'macos',
      platformLabel: 'macOS',
      category: 'forge',
      categoryLabel: 'FORGE 에디터',
      title: '맥용 포지 에디터',
      subtitle: '커스텀 Godot 4.7.2 macOS Universal 에디터 · Apple Silicon Metal 가속 및 원클릭 Hub 배포',
      arch: 'macOS Universal (arm64 · x64)',
      version: '4.7.2',
      defaultFilename: 'PlayForge-Editor-4.7.2-macos-universal.dmg',
      bootstrapFilename: 'PlayForge-macOS-Launcher.command',
      envUrl: env.PLAYHUB_DOWNLOAD_MAC_FORGE_URL || env.PLAYFORGE_DESKTOP_DOWNLOAD_MAC_URL || '',
      localPaths: [
        env.PLAYHUB_DOWNLOAD_MAC_FORGE_PATH,
        env.PLAYFORGE_DESKTOP_DOWNLOAD_MAC_PATH,
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayForge-Desktop-macos-universal.dmg'),
        path.join(repoRoot, 'artifacts', 'desktop-release', 'PlayForge-Desktop-macos-universal.zip'),
      ],
    },
  ];

  return specs.map((spec) => {
    const rawEnvUrl = String(spec.envUrl || '').trim();
    const envExternalUrl = /^https?:\/\//i.test(rawEnvUrl) ? rawEnvUrl : null;
    const localFile = envExternalUrl ? null : findFirstExistingFile(spec.localPaths);
    const defaultExternalUrl = (!envExternalUrl && !localFile && /^https?:\/\//i.test(String(spec.defaultExternalUrl || '').trim()))
      ? String(spec.defaultExternalUrl).trim()
      : null;
    const externalUrl = envExternalUrl || defaultExternalUrl;
    const packageType = externalUrl ? 'external' : (localFile ? 'binary' : 'launcher');
    const filename = localFile
      ? path.basename(localFile.path)
      : (externalUrl ? spec.defaultFilename : spec.bootstrapFilename);
    const sizeBytes = localFile ? localFile.sizeBytes : (defaultExternalUrl ? (spec.defaultSizeBytes || null) : null);
    return {
      id: spec.id,
      platform: spec.platform,
      platformLabel: spec.platformLabel,
      category: spec.category,
      categoryLabel: spec.categoryLabel,
      title: spec.title,
      subtitle: spec.subtitle,
      arch: spec.arch,
      version: spec.version,
      filename,
      sizeBytes,
      packageType,
      available: true,
      downloadUrl: `/api/downloads/${encodeURIComponent(spec.id)}`,
      externalUrl,
      localPath: localFile?.path || null,
      bootstrap: buildBootstrapContent(spec, publicBaseUrl),
    };
  });
}

export function createDownloads({ config, platformRoot, env = process.env } = {}) {
  function getPublicItems() {
    return resolvePlatformDownloads({
      platformRoot,
      publicBaseUrl: config?.publicBaseUrl || config?.userBaseUrl || '',
      env,
    });
  }

  return {
    async publicRoute(req, res, url) {
      const pathname = url.pathname;
      if (pathname === '/api/downloads' && req.method === 'GET') {
        const items = getPublicItems().map(({ localPath, bootstrap, ...pub }) => pub);
        json(res, 200, { items });
        return true;
      }

      const match = pathname.match(/^\/api\/downloads\/([a-z0-9-]+)$/);
      if (match && (req.method === 'GET' || req.method === 'HEAD')) {
        const id = match[1];
        const entry = getPublicItems().find((item) => item.id === id);
        if (!entry) throw new ApiError(404, 'DOWNLOAD_NOT_FOUND');

        if (entry.externalUrl) {
          res.writeHead(302, {
            Location: entry.externalUrl,
            'Cache-Control': 'no-store',
          });
          res.end();
          return true;
        }

        if (entry.localPath && fs.existsSync(entry.localPath)) {
          const stat = fs.statSync(entry.localPath);
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${entry.filename}"`,
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          });
          if (req.method === 'HEAD') {
            res.end();
            return true;
          }
          const stream = fs.createReadStream(entry.localPath);
          stream.on('error', () => { if (!res.writableEnded) res.destroy(); });
          stream.pipe(res);
          return true;
        }

        const buf = Buffer.from(entry.bootstrap.body, 'utf8');
        res.writeHead(200, {
          'Content-Type': entry.bootstrap.contentType,
          'Content-Length': buf.length,
          'Content-Disposition': `attachment; filename="${entry.bootstrap.filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(req.method === 'HEAD' ? undefined : buf);
        return true;
      }

      return false;
    },
  };
}
