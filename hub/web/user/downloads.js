/* PlayHub Unified Downloads View (/?view=downloads) */
(function (global) {
  'use strict';

  const PLATFORM_META = {
    windows: { id: 'windows', label: 'Windows', icon: '🪟' },
    macos: { id: 'macos', label: 'macOS', icon: '🍎' },
    android: { id: 'android', label: 'Android', icon: '🤖' },
    ios: { id: 'ios', label: 'iOS', icon: '📱' },
    other: { id: 'other', label: '기타 OS', icon: '💻' },
  };

  const DEFAULT_ITEMS = [
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
      filename: 'PlayHub-Setup-win64.exe',
      packageType: 'launcher',
      downloadUrl: '/api/downloads/windows-hub',
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
      filename: 'PlayHub-macos-universal.dmg',
      packageType: 'launcher',
      downloadUrl: '/api/downloads/macos-hub',
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
      filename: 'PlayHub-Android-arm64.apk',
      packageType: 'launcher',
      downloadUrl: '/api/downloads/android-hub',
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
      filename: 'PlayHub-iOS.ipa',
      packageType: 'launcher',
      downloadUrl: '/api/downloads/ios-hub',
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
      filename: 'PlayForge-Editor-4.7.2-win64.exe',
      packageType: 'launcher',
      downloadUrl: '/api/downloads/windows-forge',
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
      filename: 'PlayForge-Editor-4.7.2-macos-universal.dmg',
      packageType: 'launcher',
      downloadUrl: '/api/downloads/macos-forge',
    },
  ];

  function detectCurrentPlatform(nav) {
    const n = nav || (typeof navigator !== 'undefined' ? navigator : {});
    const ua = String(n.userAgent || '');
    const uaDataPlatform = String(n.userAgentData?.platform || '');
    const platform = String(n.platform || '');
    const maxTouchPoints = Number(n.maxTouchPoints || 0);
    const combined = `${uaDataPlatform} ${platform} ${ua}`.toLowerCase();

    if (/android/.test(combined)) return 'android';
    if (/iphone|ipad|ipod/.test(combined)) return 'ios';
    if (/mac/.test(platform.toLowerCase()) && maxTouchPoints > 1) return 'ios';
    if (/win/.test(uaDataPlatform.toLowerCase()) || /win/.test(platform.toLowerCase()) || /windows/.test(ua.toLowerCase())) {
      return 'windows';
    }
    if (/mac/.test(uaDataPlatform.toLowerCase()) || /mac/.test(platform.toLowerCase()) || /macintosh|mac os x/.test(ua.toLowerCase())) {
      return 'macos';
    }
    return 'other';
  }

  function orderDownloadsForPlatform(items, currentPlatform) {
    const list = Array.isArray(items) ? [...items] : [];
    const recommended = [];
    const others = [];
    for (const item of list) {
      if (currentPlatform && currentPlatform !== 'other' && item.platform === currentPlatform) {
        recommended.push({ ...item, isCurrentPlatform: true });
      } else {
        others.push({ ...item, isCurrentPlatform: false });
      }
    }
    return {
      recommended,
      others,
      ordered: [...recommended, ...others],
    };
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCard(item, { toast } = {}) {
    const pMeta = PLATFORM_META[item.platform] || PLATFORM_META.other;
    const isForge = item.category === 'forge';
    const card = document.createElement('article');
    card.className = `dl-card${item.isCurrentPlatform ? ' is-current' : ''}${isForge ? ' is-forge' : ''}`;
    card.dataset.downloadId = item.id;
    card.dataset.platform = item.platform;
    card.dataset.currentPlatform = String(Boolean(item.isCurrentPlatform));

    const sizeText = formatBytes(item.sizeBytes);
    const metaParts = [item.arch, `v${item.version}`, sizeText].filter(Boolean);

    card.innerHTML = `
      <div class="dl-card-head">
        <span class="dl-cat-pill ${isForge ? 'forge' : 'hub'}">${escapeHtml(item.categoryLabel)}</span>
        <span class="dl-os-chip">${pMeta.icon} ${escapeHtml(item.platformLabel)}</span>
      </div>
      <h3 class="dl-card-title">${escapeHtml(item.title)}</h3>
      <p class="dl-card-sub">${escapeHtml(item.subtitle)}</p>
      <div class="dl-card-meta">
        <span>${escapeHtml(metaParts.join(' · '))}</span>
        <span class="dl-filename">${escapeHtml(item.filename || '')}</span>
      </div>
      <div class="dl-card-actions">
        <a class="button ${item.isCurrentPlatform ? 'primary' : 'secondary'} dl-download-btn"
           href="${escapeHtml(item.downloadUrl)}"
           ${item.packageType === 'external' ? '' : `download="${escapeHtml(item.filename || '')}"`}
           data-testid="download-btn-${escapeHtml(item.id)}">
          <span class="dl-btn-label">다운로드</span>
          ${item.isCurrentPlatform ? `<span class="dl-btn-badge" data-testid="current-platform-badge-${escapeHtml(item.id)}">현재 기기 · ${escapeHtml(pMeta.label)}</span>` : ''}
        </a>
      </div>
    `;

    const link = card.querySelector('.dl-download-btn');
    if (link && typeof toast === 'function') {
      link.addEventListener('click', () => {
        toast(`${item.title} 다운로드를 시작합니다.`);
      });
    }
    return card;
  }

  async function mount(container, { api, toast } = {}) {
    if (!container) return;
    const currentPlatform = detectCurrentPlatform();
    const pMeta = PLATFORM_META[currentPlatform] || PLATFORM_META.other;

    let items = DEFAULT_ITEMS;
    try {
      if (typeof api === 'function') {
        const res = await api('/api/downloads');
        if (Array.isArray(res?.items) && res.items.length > 0) {
          items = res.items;
        }
      }
    } catch (_) {
      // Fallback to built-in 6 download specs if API is temporarily unreachable
    }

    const { recommended, others } = orderDownloadsForPlatform(items, currentPlatform);

    const page = document.createElement('div');
    page.className = 'page downloads-page';
    page.dataset.detectedPlatform = currentPlatform;

    const hero = document.createElement('section');
    hero.className = 'dl-hero';
    hero.innerHTML = `
      <div class="dl-hero-copy">
        <span class="dl-detected-pill" data-testid="detected-platform-pill">
          ${pMeta.icon} 현재 기기 인식: <strong>${escapeHtml(pMeta.label)}</strong>
        </span>
        <h1>PLAY HUB · FORGE 다운로드</h1>
        <p class="dl-hero-desc">
          현재 사용 중인 플랫폼(${escapeHtml(pMeta.label)})에 맞는 설치 파일을 상단에 우선 배치했습니다.
          다른 운영체제 버전도 클릭해서 바로 다운로드할 수 있습니다.
        </p>
      </div>
    `;
    page.appendChild(hero);

    if (recommended.length > 0) {
      const recSection = document.createElement('section');
      recSection.className = 'dl-section dl-section-recommended';
      recSection.dataset.testid = 'downloads-recommended-section';
      recSection.innerHTML = `
        <div class="dl-section-head">
          <h2>${pMeta.icon} 내 기기 추천 (${escapeHtml(pMeta.label)})</h2>
          <span class="dl-section-hint">현재 접속한 플랫폼에 최적화된 앱을 먼저 표시합니다</span>
        </div>
      `;
      const grid = document.createElement('div');
      grid.className = 'dl-grid dl-grid-recommended';
      for (const item of recommended) {
        grid.appendChild(renderCard(item, { toast }));
      }
      recSection.appendChild(grid);
      page.appendChild(recSection);
    }

    const otherSection = document.createElement('section');
    otherSection.className = 'dl-section';
    otherSection.dataset.testid = 'downloads-other-section';
    otherSection.innerHTML = `
      <div class="dl-section-head">
        <h2>${recommended.length > 0 ? '다른 플랫폼 다운로드' : '전체 플랫폼 다운로드'}</h2>
        <span class="dl-section-hint">플랫폼이 달라도 원하는 버전을 클릭해 다운로드할 수 있습니다</span>
      </div>
    `;
    const otherGrid = document.createElement('div');
    otherGrid.className = 'dl-grid';
    for (const item of others) {
      otherGrid.appendChild(renderCard(item, { toast }));
    }
    otherSection.appendChild(otherGrid);
    page.appendChild(otherSection);

    container.replaceChildren(page);
  }

  const exported = {
    PLATFORM_META,
    DEFAULT_ITEMS,
    detectCurrentPlatform,
    orderDownloadsForPlatform,
    mount,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    global.PlayHubDownloads = exported;
  }
})(typeof window !== 'undefined' ? window : globalThis);
