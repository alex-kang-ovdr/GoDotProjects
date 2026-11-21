export const STORE_STATES = Object.freeze([
  'catalog_listed',
  'saved_to_library',
  'license_verified',
  'artifact_downloaded',
  'plan_reviewed',
  'applied_to_project',
  'update_available'
]);

export const SAMPLE_CATALOG = Object.freeze([
  {
    schema_version: 1,
    asset_id: 'lowpoly-fortress-pack',
    asset_version_id: '1.2.0',
    release_id: 'rel-lowpoly-fortress-120',
    release_kind: 'package',
    category: '3D 환경 · 요새',
    title: 'Lowpoly Fortress Siege Kit',
    summary: '성벽, 포탑, 탄두 메쉬와 충돌 콜라이더가 포함된 모듈형 3D 에셋 팩입니다.',
    publisher_id: 'pub-playforge-core',
    store_state: 'catalog_listed',
    artifact_id: 'art-lowpoly-fortress-120',
    artifact_digest: 'sha256:6f5a2837d671daeaedad2440c2620cc2ee2a770622ad0f97cac7c6b7c0a61d04',
    dependency_manifest_hash: 'sha256:3eeafaac6f7e9433b233d7faff65060438226cdad81972c03f5d3a359592f416',
    engine_compatibility: {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux']
    },
    file_manifest: [
      {
        path: 'assets/fortress/turret_base.tscn',
        bytes: 60,
        sha256: '2f1a36adb06712fb2f76c93ffa8bea892ca6ccbf5a50aa7ef0bb20e956addb0c',
        executable_addon: false
      },
      {
        path: 'assets/fortress/wall_segment.glb',
        bytes: 172,
        sha256: '23c7520116f0c0eb56aeee09a714cd9457ec57b454d10d849f22bc2a999b81fd',
        executable_addon: false
      }
    ],
    license_snapshot_ref: 'lic-cc0-v1-20261120',
    installation_record: null
  },
  {
    schema_version: 1,
    asset_id: 'ui-tactical-hud-kit',
    asset_version_id: '2.0.1',
    release_id: 'rel-ui-tactical-201',
    release_kind: 'package',
    category: 'UI · 테마 · Addon',
    title: 'Tactical Strategy HUD & Minimap',
    summary: '전략 게임용 체력바, 미니맵 프레임, 입력 힌트 테마와 도크 보조 스크립트 묶음입니다.',
    publisher_id: 'pub-studio-nord',
    store_state: 'catalog_listed',
    artifact_id: 'art-ui-tactical-201',
    artifact_digest: 'sha256:a2bd71db0c03ed995aa5ab5679584a5911bc811493b520830ed95706b8598801',
    dependency_manifest_hash: 'sha256:e0f435b1d0a2f7e5a625d8fd8dfd4ff3dbc87f261bfbd29198bd8e883e7e1839',
    engine_compatibility: {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux']
    },
    file_manifest: [
      {
        path: 'addons/tactical_hud/hud_theme.tres',
        bytes: 71,
        sha256: 'f48d6936aec9fc14ec7ba60728f04f98dc1bb6248c0e3c1aef18b0da1032f73d',
        executable_addon: false
      },
      {
        path: 'addons/tactical_hud/plugin.cfg',
        bytes: 142,
        sha256: 'a8ac43111bac3bf90e5bac244515568713054ce2ca721dfe2a40deb5e8f370bd',
        executable_addon: true
      }
    ],
    license_snapshot_ref: 'lic-mit-v1-20261120',
    installation_record: null
  },
  {
    schema_version: 1,
    asset_id: 'sfx-siege-audio-pack',
    asset_version_id: '1.1.0',
    release_id: 'rel-sfx-siege-110',
    release_kind: 'package',
    category: '오디오 · 효과음',
    title: 'Siege Artillery & UI SFX Pack',
    summary: '포격, 타격, 버튼 피드백용 무손실 OGG 효과음 32종 패키지입니다.',
    publisher_id: 'pub-audio-atelier',
    store_state: 'catalog_listed',
    artifact_id: 'art-sfx-siege-110',
    artifact_digest: 'sha256:7415b4b0c938a4cedc681861b7ad323dcbd279d72ab23675b35a43d33cf6abd4',
    dependency_manifest_hash: 'sha256:2fb36203db57dcd385b91876e695d85db8febf8a670b93a4b69764d18abaf616',
    engine_compatibility: {
      godot_min: '4.3',
      godot_tested: '4.7.2',
      platforms: ['web', 'windows', 'linux', 'macos']
    },
    file_manifest: [
      {
        path: 'assets/audio/cannon_fire.ogg',
        bytes: 69,
        sha256: '00b26790e0e58e721e6e7963d9ce9f52b711c3907a8aeaabc4ece6ebbb10662e',
        executable_addon: false
      }
    ],
    license_snapshot_ref: 'lic-royalty-free-v1-20261120',
    installation_record: null
  },
  {
    schema_version: 1,
    asset_id: 'godot-47-dock-guide',
    asset_version_id: '1.0.0',
    release_id: 'rel-editorial-dock-100',
    release_kind: 'editorial',
    category: '가이드 · 일반 콘텐츠',
    title: 'Godot 에디터 도크 레이아웃 & 안전 적용 가이드',
    summary: '웹 Store에서 라이브러리에 저장한 에셋을 Godot 도크에서 변경 검토 후 프로젝트에 반영하는 권장 흐름 안내입니다.',
    publisher_id: 'pub-playforge-docs',
    store_state: 'catalog_listed',
    license_snapshot_ref: 'lic-editorial-v1',
    installation_record: null,
    article_body: [
      '1. Store 웹(PC 또는 모바일)에서는 원하는 패키지를 내 라이브러리(StoreLibraryEntry)에만 저장합니다.',
      '2. 라이브러리에 저장하거나 기기에 다운로드하는 것만으로는 기존 프로젝트 파일이 바뀌지 않습니다.',
      '3. Godot Store 도크에서 새로고침 후 아티팩트 해시와 파일 충돌을 검토한 뒤 선택한 프로젝트에만 적용하세요.'
    ]
  }
]);

export const PUBLISHER_DRAFTS = Object.freeze([
  {
    draft_id: 'draft-fortress-v130',
    asset_id: 'lowpoly-fortress-pack',
    next_version: '1.3.0',
    release_kind: 'package',
    validator_status: 'passed',
    review_status: 'in_review',
    note: 'Godot 4.7.2 Web/Windows 호환성 및 파일 매니페스트 검증 완료'
  },
  {
    draft_id: 'draft-store-checklist',
    asset_id: 'store-publishing-checklist',
    next_version: '1.0.0',
    release_kind: 'editorial',
    validator_status: 'not_applicable',
    review_status: 'draft',
    note: '일반 콘텐츠(editorial): 빈 패키지를 생성하지 않고 문서 초안으로만 관리'
  }
]);

export function validateReleaseContract(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object') {
    return ['Entry must be an object'];
  }
  if (entry.schema_version !== 1) errors.push('schema_version must be 1');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(String(entry.asset_id || ''))) errors.push('Invalid asset_id');
  if (!/^[0-9]+\.[0-9]+\.[0-9]+/.test(String(entry.asset_version_id || ''))) errors.push('Invalid asset_version_id');
  if (!/^rel-[a-z0-9-]{4,64}$/.test(String(entry.release_id || ''))) errors.push('Invalid release_id');
  if (!['package', 'editorial'].includes(entry.release_kind)) errors.push('Invalid release_kind');
  if (!STORE_STATES.includes(entry.store_state)) errors.push('Invalid store_state');

  if (entry.release_kind === 'package') {
    if (!/^art-[a-z0-9-]{4,64}$/.test(String(entry.artifact_id || ''))) errors.push('package requires artifact_id');
    if (!/^sha256:[a-f0-9]{64}$/.test(String(entry.artifact_digest || ''))) errors.push('package requires immutable sha256 artifact_digest');
    if (!/^sha256:[a-f0-9]{64}$/.test(String(entry.dependency_manifest_hash || ''))) errors.push('package requires dependency_manifest_hash');
    if (!entry.engine_compatibility?.godot_tested || !Array.isArray(entry.engine_compatibility?.platforms) || !entry.engine_compatibility.platforms.length) {
      errors.push('package requires engine_compatibility');
    }
    if (!Array.isArray(entry.file_manifest) || entry.file_manifest.length === 0) {
      errors.push('package requires non-empty file_manifest');
    }
    if (!entry.license_snapshot_ref) errors.push('package requires license_snapshot_ref');
  } else if (entry.release_kind === 'editorial') {
    if (entry.artifact_id || entry.artifact_digest || entry.file_manifest || entry.installation_record) {
      errors.push('editorial entry must not carry installable package artifact fields');
    }
  }
  return errors;
}

export function canInstallInStoreWeb() {
  return false;
}

export function extractCatalogCategories(entries = SAMPLE_CATALOG) {
  const seen = new Set();
  const categories = [];
  for (const item of entries || []) {
    const category = String(item?.category || '').trim();
    if (category && !seen.has(category)) {
      seen.add(category);
      categories.push(category);
    }
  }
  return categories;
}

export function extractCatalogLicenses(entries = SAMPLE_CATALOG) {
  const seen = new Set();
  const licenses = [];
  for (const item of entries || []) {
    const license = String(item?.license || '').trim();
    if (license && !seen.has(license)) {
      seen.add(license);
      licenses.push(license);
    }
  }
  return licenses;
}

export function extractCatalogSources(entries = SAMPLE_CATALOG) {
  const seen = new Set();
  const sources = [];
  for (const item of entries || []) {
    const source = String(item?.source_provider || '').trim();
    if (source && !seen.has(source)) {
      seen.add(source);
      sources.push(source);
    }
  }
  return sources;
}

export function extractTopTags(entries = SAMPLE_CATALOG, limit = 24) {
  const counts = new Map();
  for (const item of entries || []) {
    for (const rawTag of Array.isArray(item?.tags) ? item.tags : []) {
      const tag = String(rawTag || '').trim();
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

export function filterCatalogEntries(entries = SAMPLE_CATALOG, filters = {}) {
  const releaseKind = String(filters.release_kind ?? '').trim();
  const category = String(filters.category ?? '').trim().toLowerCase();
  const license = String(filters.license ?? '').trim().toLowerCase();
  const source = String(filters.source ?? '').trim().toLowerCase();
  const tag = String(filters.tag ?? '').trim().toLowerCase();
  const q = String(filters.q ?? '').trim().toLowerCase();

  return (entries || []).filter((item) => {
    if (releaseKind && releaseKind !== 'all' && item.release_kind !== releaseKind) {
      return false;
    }
    if (category && category !== 'all') {
      const itemCat = String(item.category || '').toLowerCase();
      if (itemCat !== category && !itemCat.includes(category)) {
        return false;
      }
    }
    if (license && license !== 'all') {
      const itemLic = String(item.license || '').toLowerCase();
      if (itemLic !== license) {
        return false;
      }
    }
    if (source && source !== 'all') {
      const itemSrc = String(item.source_provider || '').toLowerCase();
      if (itemSrc !== source && !itemSrc.includes(source)) {
        return false;
      }
    }
    if (tag && tag !== 'all') {
      const itemTags = Array.isArray(item.tags) ? item.tags : [];
      if (!itemTags.some((t) => String(t).toLowerCase() === tag)) {
        return false;
      }
    }
    if (q) {
      const haystack = [
        item.title,
        item.summary,
        item.category,
        item.asset_id,
        item.publisher_id,
        item.author,
        item.license,
        item.source_provider,
        ...(Array.isArray(item.tags) ? item.tags : []),
        ...(Array.isArray(item.article_body) ? item.article_body : [])
      ];
      if (!haystack.some((field) => String(field ?? '').toLowerCase().includes(q))) {
        return false;
      }
    }
    return true;
  });
}

export function buildCatalogQueryString(filters = {}) {
  const params = new URLSearchParams();
  const category = String(filters.category ?? '').trim();
  const q = String(filters.q ?? '').trim();
  const releaseKind = String(filters.release_kind ?? '').trim();
  const license = String(filters.license ?? '').trim();
  const source = String(filters.source ?? '').trim();
  const tag = String(filters.tag ?? '').trim();
  const page = Number(filters.page || 0);
  const limit = Number(filters.limit || 0);

  if (category && category !== 'all') params.set('category', category);
  if (q) params.set('q', q);
  if (releaseKind && releaseKind !== 'all') params.set('release_kind', releaseKind);
  if (license && license !== 'all') params.set('license', license);
  if (source && source !== 'all') params.set('source', source);
  if (tag && tag !== 'all') params.set('tag', tag);
  if (Number.isInteger(page) && page >= 1) params.set('page', String(page));
  if (Number.isInteger(limit) && limit >= 1) params.set('limit', String(limit));

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function isStaticFileContext() {
  return typeof globalThis.location === 'object' && globalThis.location?.protocol === 'file:';
}

export function isBackendUnavailableError(error) {
  if (!error) return false;
  if (error.code === 'STATIC_FILE_CONTEXT' || error.code === 'NON_JSON_RESPONSE' || error.code === 'FETCH_UNAVAILABLE') {
    return true;
  }
  if (typeof error.status === 'number') {
    return error.status === 404 || error.status === 405 || error.status === 501 || error.status >= 502;
  }
  return error.name === 'TypeError';
}

export function createStoreApiClient({ baseUrl = '', fetchImpl = globalThis.fetch, headers = {} } = {}) {
  const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');

  async function requestJson(apiPath, options = {}) {
    if (!normalizedBase && isStaticFileContext()) {
      const err = new Error('Static file protocol cannot reach HTTP API');
      err.code = 'STATIC_FILE_CONTEXT';
      throw err;
    }
    if (typeof fetchImpl !== 'function') {
      const err = new Error('fetch is unavailable');
      err.code = 'FETCH_UNAVAILABLE';
      throw err;
    }

    const url = `${normalizedBase}${apiPath}`;
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      }
    });

    const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      const err = new Error(`Expected JSON response from ${apiPath} (status ${response.status})`);
      err.code = 'NON_JSON_RESPONSE';
      err.status = response.status;
      throw err;
    }

    const payload = await response.json();
    if (!response.ok) {
      const err = new Error(payload?.error?.message || payload?.error || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = payload?.error?.code || 'HTTP_ERROR';
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  return {
    getCatalog(filters = {}) {
      return requestJson(`/api/store/catalog${buildCatalogQueryString(filters)}`);
    },
    getPackage(slug) {
      return requestJson(`/api/store/packages/${encodeURIComponent(slug)}`);
    },
    getMyAssets() {
      return requestJson('/api/store/my-assets');
    },
    mutateMyAssets({ slug, action }) {
      return requestJson('/api/store/my-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, action })
      });
    },
    getPublisherDrafts() {
      return requestJson('/api/store/publisher/drafts');
    },
    getSession() {
      return requestJson('/api/store/session');
    },
    getArtifactUrl(slug, version) {
      return `${normalizedBase}/api/store/packages/${encodeURIComponent(slug)}/releases/${encodeURIComponent(version)}/artifact`;
    }
  };
}

export async function fetchCatalogWithFallback({
  apiClient = createStoreApiClient(),
  filters = {},
  fallbackCatalog = SAMPLE_CATALOG
} = {}) {
  try {
    const data = await apiClient.getCatalog(filters);
    if (!Array.isArray(data?.items)) {
      const err = new Error('Invalid catalog payload');
      err.code = 'NON_JSON_RESPONSE';
      throw err;
    }
    return {
      mode: 'live',
      items: data.items,
      categories: Array.isArray(data.categories) ? data.categories : extractCatalogCategories(fallbackCatalog),
      licenses: Array.isArray(data.licenses) ? data.licenses : extractCatalogLicenses(fallbackCatalog),
      sources: Array.isArray(data.sources) ? data.sources : extractCatalogSources(fallbackCatalog),
      top_tags: Array.isArray(data.top_tags) ? data.top_tags : extractTopTags(fallbackCatalog),
      category_counts: data.category_counts || null,
      license_counts: data.license_counts || null,
      account: data.account || null,
      total: typeof data.total === 'number' ? data.total : data.items.length,
      catalog_total: typeof data.catalog_total === 'number' ? data.catalog_total : (typeof data.total === 'number' ? data.total : data.items.length),
      page: typeof data.page === 'number' ? data.page : 1,
      limit: typeof data.limit === 'number' ? data.limit : data.items.length,
      total_pages: typeof data.total_pages === 'number' ? data.total_pages : 1
    };
  } catch (error) {
    if (!isBackendUnavailableError(error)) {
      throw error;
    }
    const items = filterCatalogEntries(fallbackCatalog, filters);
    return {
      mode: 'static',
      items,
      categories: extractCatalogCategories(fallbackCatalog),
      account: null,
      total: items.length,
      fallbackReason: error.message
    };
  }
}
