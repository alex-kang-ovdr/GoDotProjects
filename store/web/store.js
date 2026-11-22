import {
  SAMPLE_CATALOG,
  PUBLISHER_DRAFTS,
  createStoreApiClient,
  extractCatalogCategories,
  extractCatalogLicenses,
  extractCatalogTiers,
  extractCatalogSources,
  extractTopTags,
  fetchCatalogWithFallback,
  filterCatalogEntries,
  isBackendUnavailableError
} from './store-catalog.js';

const apiClient = createStoreApiClient();
const PAGE_SIZE = 24;

const TIER_META = Object.freeze({
  tier1_cc0: { label: 'Tier 1 · CC0/PD', cls: 'tier1' },
  tier2_attribution: { label: 'Tier 2 · 표기 의무', cls: 'tier2' },
  tier2b_ofl_font: { label: 'Tier 2-B · OFL 폰트', cls: 'tier2b' },
  tier4_external_only: { label: 'Tier 4 · 외부링크 전용', cls: 'tier4' }
});

const state = {
  tab: 'browse',
  query: '',
  category: 'all',
  kind: 'all',
  license: 'all',
  tier: 'all',
  ai: 'all',
  source: 'all',
  tag: 'all',
  sort: 'default',
  page: 1,
  limit: PAGE_SIZE,
  total: SAMPLE_CATALOG.length,
  catalogTotal: SAMPLE_CATALOG.length,
  totalPages: 1,
  mode: 'static',
  catalog: SAMPLE_CATALOG.map((item) => ({ ...item })),
  allCatalog: SAMPLE_CATALOG.map((item) => ({ ...item })),
  categories: extractCatalogCategories(SAMPLE_CATALOG),
  licenses: extractCatalogLicenses(SAMPLE_CATALOG),
  tiers: extractCatalogTiers(SAMPLE_CATALOG),
  sources: extractCatalogSources(SAMPLE_CATALOG),
  topTags: extractTopTags(SAMPLE_CATALOG, 16),
  categoryCounts: null,
  licenseCounts: null,
  tierCounts: null,
  drafts: [...PUBLISHER_DRAFTS],
  selectedId: SAMPLE_CATALOG[0]?.asset_id || null,
  selectedDetail: null,
  savedIds: new Set(),
  libraryEntries: [],
  account: {
    account_label: 'creator-demo@playhub.local',
    auth_mode: 'local_default'
  },
  pendingSaves: new Set(),
  statusMessage: '',
  catalogReqSeq: 0,
  detailReqSeq: 0
};

const el = {
  list: document.getElementById('catalog-list'),
  pagination: document.getElementById('pagination-bar'),
  publisher: document.getElementById('publisher-panel'),
  detail: document.getElementById('detail-pane'),
  libraryCount: document.getElementById('library-count'),
  search: document.getElementById('search-input'),
  categoryFilter: document.getElementById('category-filter'),
  categoryPills: document.getElementById('category-pills'),
  kindFilter: document.getElementById('kind-filter'),
  tierFilter: document.getElementById('tier-filter'),
  licenseFilter: document.getElementById('license-filter'),
  aiFilter: document.getElementById('ai-filter'),
  sourceFilter: document.getElementById('source-filter'),
  tagBar: document.getElementById('tag-bar'),
  sortSelect: document.getElementById('sort-select'),
  resetFiltersBtn: document.getElementById('reset-filters-btn'),
  browseControls: document.getElementById('browse-controls'),
  resultsBar: document.getElementById('results-bar'),
  resultsCount: document.getElementById('results-count'),
  spotlight: document.getElementById('spotlight-hero'),
  workspace: document.getElementById('store-workspace'),
  ssoBadge: document.getElementById('sso-badge'),
  connectionBadge: document.getElementById('connection-badge'),
  tabs: [...document.querySelectorAll('.tab')]
};

const shortDigest = (digest) => (digest ? `${digest.slice(0, 14)}…${digest.slice(-6)}` : '없음 (editorial)');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function hasExecutableAddon(item) {
  return Array.isArray(item?.file_manifest) && item.file_manifest.some((f) => f.executable_addon === true);
}

function isSafeHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}

function makeThumbDataUri(item) {
  const isEditorial = item.release_kind === 'editorial';
  const isAddon = hasExecutableAddon(item);
  const palettes = [
    ['#1E3A8A', '#004AC6', '#93C5FD'],
    ['#7C2D12', '#C2410C', '#FDBA74'],
    ['#312E81', '#4F46E5', '#C7D2FE'],
    ['#14532D', '#15803D', '#86EFAC']
  ];
  let hash = 0;
  for (const ch of String(item.asset_id || '')) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const [c1, c2, c3] = isEditorial
    ? ['#1E293B', '#334155', '#CBD5E1']
    : isAddon
      ? ['#7C2D12', '#EA580C', '#FED7AA']
      : palettes[hash % palettes.length];
  const label = String(item.title || item.asset_id || 'ASSET').slice(0, 26);
  const cat = String(item.category || '').slice(0, 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><circle cx="540" cy="70" r="130" fill="${c3}" fill-opacity="0.14"/><circle cx="110" cy="310" r="95" fill="#ffffff" fill-opacity="0.06"/><rect x="36" y="218" width="128" height="24" rx="12" fill="#ffffff" fill-opacity="0.16"/><text x="48" y="234" font-family="Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#ffffff">${esc(cat)}</text><text x="36" y="286" font-family="Segoe UI, sans-serif" font-size="30" font-weight="800" fill="#ffffff">${esc(label)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function getThumbImageAttrs(item) {
  const fallback = makeThumbDataUri(item);
  if (isSafeHttpUrl(item?.thumbnail_url)) {
    return `src="${esc(item.thumbnail_url.trim())}" data-fallback-src="${fallback}"`;
  }
  return `src="${fallback}"`;
}

// Graceful fallback when an external thumbnail URL fails to load
document.addEventListener('error', (event) => {
  const target = event.target;
  if (target instanceof HTMLImageElement && target.dataset.fallbackSrc && target.src !== target.dataset.fallbackSrc) {
    target.src = target.dataset.fallbackSrc;
    delete target.dataset.fallbackSrc;
  }
}, true);

function hasActiveFilters() {
  return Boolean(
    state.query.trim()
    || state.category !== 'all'
    || state.kind !== 'all'
    || state.license !== 'all'
    || state.tier !== 'all'
    || state.ai !== 'all'
    || state.source !== 'all'
    || state.tag !== 'all'
  );
}

function currentFilters({ includePagination = true } = {}) {
  const filters = {
    category: state.category,
    q: state.query,
    release_kind: state.kind,
    license: state.license,
    tier: state.tier,
    ai: state.ai,
    source: state.source,
    tag: state.tag
  };
  if (includePagination) {
    filters.page = state.page;
    filters.limit = state.limit;
  }
  return filters;
}

function renderCategoryOptions() {
  const previous = state.category;
  const counts = state.categoryCounts || {};
  if (el.categoryFilter) {
    const options = [
      `<option value="all">전체 카테고리 (${Number(state.catalogTotal || 0).toLocaleString()})</option>`,
      ...state.categories.map((cat) => {
        const cnt = typeof counts[cat] === 'number' ? ` (${counts[cat].toLocaleString()})` : '';
        return `<option value="${esc(cat)}">${esc(cat)}${cnt}</option>`;
      })
    ];
    el.categoryFilter.innerHTML = options.join('');
    el.categoryFilter.value = state.categories.includes(previous) ? previous : 'all';
    if (el.categoryFilter.value !== previous) {
      state.category = 'all';
    }
  }
  if (el.categoryPills) {
    const pills = [
      `<button type="button" class="cat-pill${state.category === 'all' ? ' active' : ''}" data-cat="all">전체 에셋</button>`,
      ...state.categories.map((cat) => `<button type="button" class="cat-pill${state.category === cat ? ' active' : ''}" data-cat="${esc(cat)}">${esc(cat)}</button>`)
    ];
    el.categoryPills.innerHTML = pills.join('');
  }
}

function renderFacetOptions() {
  if (el.tierFilter) {
    const group = el.tierFilter.closest('.filter-group');
    const hasTiers = state.tiers.length > 0;
    if (group) group.classList.toggle('hidden', !hasTiers);
    if (hasTiers) {
      const counts = state.tierCounts || {};
      const opts = [
        '<option value="all">전체 등급 (4-Tier)</option>',
        ...state.tiers.map((tier) => {
          const meta = TIER_META[tier] || { label: tier };
          const cnt = typeof counts[tier] === 'number' ? ` (${counts[tier].toLocaleString()})` : '';
          return `<option value="${esc(tier)}">${esc(meta.label)}${cnt}</option>`;
        })
      ];
      el.tierFilter.innerHTML = opts.join('');
      el.tierFilter.value = state.tiers.includes(state.tier) ? state.tier : 'all';
      if (el.tierFilter.value !== state.tier) state.tier = 'all';
    }
  }

  if (el.aiFilter) {
    const group = el.aiFilter.closest('.filter-group');
    if (group) group.classList.toggle('hidden', state.tiers.length === 0);
    el.aiFilter.value = state.ai;
  }

  if (el.licenseFilter) {
    const group = el.licenseFilter.closest('.filter-group');
    const hasLicenses = state.licenses.length > 0;
    if (group) group.classList.toggle('hidden', !hasLicenses);
    if (hasLicenses) {
      const counts = state.licenseCounts || {};
      const opts = [
        '<option value="all">전체 라이선스</option>',
        ...state.licenses.map((lic) => {
          const cnt = typeof counts[lic] === 'number' ? ` (${counts[lic].toLocaleString()})` : '';
          return `<option value="${esc(lic)}">${esc(lic)}${cnt}</option>`;
        })
      ];
      el.licenseFilter.innerHTML = opts.join('');
      el.licenseFilter.value = state.licenses.includes(state.license) ? state.license : 'all';
      if (el.licenseFilter.value !== state.license) state.license = 'all';
    }
  }

  if (el.sourceFilter) {
    const group = el.sourceFilter.closest('.filter-group');
    const hasSources = state.sources.length > 0;
    if (group) group.classList.toggle('hidden', !hasSources);
    if (hasSources) {
      const opts = [
        '<option value="all">전체 출처</option>',
        ...state.sources.map((src) => `<option value="${esc(src)}">${esc(src)}</option>`)
      ];
      el.sourceFilter.innerHTML = opts.join('');
      el.sourceFilter.value = state.sources.includes(state.source) ? state.source : 'all';
      if (el.sourceFilter.value !== state.source) state.source = 'all';
    }
  }

  if (el.tagBar) {
    const group = el.tagBar.closest('.filter-group');
    const hasTags = state.topTags.length > 0;
    if (group) group.classList.toggle('hidden', !hasTags);
    if (hasTags) {
      el.tagBar.innerHTML = state.topTags.slice(0, 14).map(({ tag }) => {
        const active = state.tag === tag ? ' active' : '';
        return `<button type="button" class="tag-chip${active}" data-tag="${esc(tag)}">#${esc(tag)}</button>`;
      }).join('');
    }
  }
}

function renderConnectionBadges() {
  if (el.ssoBadge) {
    const label = state.account?.account_label || 'creator-demo@playhub.local';
    const prefix = state.account?.auth_mode === 'hub_sso_header' ? 'PlayHub SSO' : 'Hub SSO';
    el.ssoBadge.textContent = `${prefix} · ${label}`;
  }
  if (el.connectionBadge) {
    el.connectionBadge.dataset.mode = state.mode;
    el.connectionBadge.textContent = state.mode === 'live'
      ? '실서버 연동 (/api/store)'
      : '정적 열람 모드';
  }
  const underHub = window.location.pathname.startsWith('/store/') || window.location.pathname === '/store';
  const hubLink = document.getElementById('hub-home-link');
  const forgeLink = document.getElementById('forge-home-link');
  if (hubLink) hubLink.hidden = !underHub;
  if (forgeLink) forgeLink.href = underHub ? '/forge/OfficialGodot/' : '/OfficialGodot/';
}

function sortItems(items) {
  const list = [...items];
  if (state.sort === 'title') {
    list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ko'));
  } else if (state.sort === 'version') {
    list.sort((a, b) => String(b.asset_version_id || '').localeCompare(String(a.asset_version_id || '')));
  }
  return list;
}

function resolveLibraryItems() {
  if (state.mode === 'live' && state.libraryEntries.length > 0) {
    const merged = state.libraryEntries.map((entry) => {
      const slug = entry.slug || entry.asset_id;
      const existing = state.catalog.find((x) => x.asset_id === slug)
        || state.allCatalog.find((x) => x.asset_id === slug);
      if (existing) {
        return { ...existing, saved_in_library: true, store_state: 'saved_to_library', library_entry: entry };
      }
      return {
        asset_id: slug,
        asset_version_id: entry.asset_version_id || '1.0.0',
        release_id: entry.release_id || `rel-${slug}`,
        release_kind: entry.release_kind || 'package',
        category: entry.category || '라이브러리 에셋',
        title: entry.title || slug,
        summary: entry.summary || '내 라이브러리에 저장된 패키지입니다. 클릭하면 상세 계약을 불러옵니다.',
        publisher_id: entry.publisher_id || 'PlayForge',
        license: entry.license || '',
        source_provider: entry.source_provider || '',
        thumbnail_url: entry.thumbnail_url || '',
        tags: Array.isArray(entry.tags) ? entry.tags : [],
        artifact_digest: entry.artifact_digest || '',
        license_snapshot_ref: entry.license_snapshot_ref || '',
        engine_compatibility: entry.engine_compatibility || { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux', 'macos'] },
        file_manifest: Array.isArray(entry.file_manifest) ? entry.file_manifest : [],
        saved_in_library: true,
        store_state: 'saved_to_library',
        library_entry: entry
      };
    });
    return sortItems(filterCatalogEntries(merged, currentFilters({ includePagination: false })));
  }
  const librarySource = state.allCatalog.filter((item) => state.savedIds.has(item.asset_id));
  return sortItems(filterCatalogEntries(librarySource, currentFilters({ includePagination: false })));
}

function visibleCatalog() {
  if (state.tab === 'library') {
    return resolveLibraryItems();
  }
  if (state.mode === 'live') {
    return sortItems(state.catalog);
  }
  return sortItems(filterCatalogEntries(state.allCatalog, currentFilters({ includePagination: false })));
}

function findItemById(assetId) {
  if (!assetId) return null;
  if (state.selectedDetail && state.selectedDetail.asset_id === assetId) {
    return state.selectedDetail;
  }
  return state.catalog.find((x) => x.asset_id === assetId)
    || state.allCatalog.find((x) => x.asset_id === assetId)
    || resolveLibraryItems().find((x) => x.asset_id === assetId)
    || null;
}

function applyMyAssetsPayload(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  state.libraryEntries = entries;
  state.savedIds = new Set(entries.map((entry) => entry.slug || entry.asset_id));
  if (payload?.account) {
    state.account = payload.account;
  }
  for (const list of [state.allCatalog, state.catalog]) {
    for (const item of list) {
      if (item.release_kind === 'package') {
        const saved = state.savedIds.has(item.asset_id);
        item.saved_in_library = saved;
        item.store_state = saved ? 'saved_to_library' : 'catalog_listed';
      }
    }
  }
}

async function hydrateDetail(assetId) {
  if (!assetId || state.mode !== 'live') return;
  const seq = ++state.detailReqSeq;
  try {
    const detail = await apiClient.getPackage(assetId);
    if (seq !== state.detailReqSeq) return;
    if (state.selectedId === assetId) {
      state.selectedDetail = detail;
      renderDetail(visibleCatalog());
    }
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      state.mode = 'static';
      renderConnectionBadges();
    }
  }
}

async function refreshCatalog({ refreshFull = false } = {}) {
  const seq = ++state.catalogReqSeq;
  const filters = currentFilters({ includePagination: true });
  const result = await fetchCatalogWithFallback({
    apiClient,
    filters,
    fallbackCatalog: SAMPLE_CATALOG
  });
  if (seq !== state.catalogReqSeq) return;

  state.mode = result.mode;
  state.catalog = result.items.map((item) => ({ ...item }));
  state.categories = result.categories || extractCatalogCategories(result.items);
  state.licenses = result.licenses || extractCatalogLicenses(result.items);
  state.tiers = result.tiers || extractCatalogTiers(result.items);
  state.sources = result.sources || extractCatalogSources(result.items);
  state.topTags = result.top_tags || extractTopTags(result.items, 16);
  state.categoryCounts = result.category_counts || null;
  state.licenseCounts = result.license_counts || null;
  state.tierCounts = result.tier_counts || null;
  state.total = typeof result.total === 'number' ? result.total : result.items.length;
  state.catalogTotal = typeof result.catalog_total === 'number' ? result.catalog_total : state.total;
  state.page = typeof result.page === 'number' ? result.page : 1;
  state.totalPages = typeof result.total_pages === 'number' ? result.total_pages : 1;
  if (result.account) {
    state.account = result.account;
  }

  if (result.mode === 'live' && (!hasActiveFilters() && state.page === 1 || refreshFull)) {
    state.allCatalog = result.items.map((item) => ({ ...item }));
  }

  renderCategoryOptions();
  renderFacetOptions();
  render();
}

async function refreshMyAssets() {
  if (state.mode !== 'live') return;
  try {
    const payload = await apiClient.getMyAssets();
    applyMyAssetsPayload(payload);
    render();
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      state.mode = 'static';
      render();
    }
  }
}

async function refreshPublisherDrafts() {
  if (state.mode !== 'live') return;
  try {
    const payload = await apiClient.getPublisherDrafts();
    if (Array.isArray(payload?.drafts)) {
      state.drafts = payload.drafts;
      if (state.tab === 'publisher') render();
    }
  } catch {
    // keep static publisher drafts fallback
  }
}

async function toggleLibrary(assetId) {
  const item = findItemById(assetId);
  if (!item || item.release_kind !== 'package') return;
  if (state.pendingSaves.has(assetId)) return;

  const isSaved = state.savedIds.has(assetId);
  const action = isSaved ? 'remove' : 'save';
  state.selectedId = assetId;

  if (state.mode !== 'live') {
    if (isSaved) state.savedIds.delete(assetId);
    else state.savedIds.add(assetId);
    state.statusMessage = '';
    render();
    return;
  }

  state.pendingSaves.add(assetId);
  render();
  try {
    const payload = await apiClient.mutateMyAssets({ slug: assetId, action });
    applyMyAssetsPayload(payload);
    state.statusMessage = action === 'save'
      ? `${item.title} 항목이 내 라이브러리에 영구 저장되었습니다.`
      : `${item.title} 항목이 내 라이브러리에서 제거되었습니다.`;
    if (state.selectedId === assetId) {
      state.selectedDetail = null;
      await hydrateDetail(assetId);
    }
  } catch (error) {
    if (isBackendUnavailableError(error)) {
      state.mode = 'static';
      if (isSaved) state.savedIds.delete(assetId);
      else state.savedIds.add(assetId);
      state.statusMessage = '백엔드 연결이 끊어져 정적 열람 모드로 전환되었습니다.';
    } else {
      state.statusMessage = error.message || '라이브러리 변경에 실패했습니다.';
    }
  } finally {
    state.pendingSaves.delete(assetId);
    render();
  }
}

function selectItem(assetId, scrollToDetail = false) {
  state.selectedId = assetId;
  state.selectedDetail = null;
  state.statusMessage = '';
  render();
  hydrateDetail(assetId);
  if (scrollToDetail) {
    el.detail?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function renderSpotlight() {
  if (!el.spotlight) return;
  const show = state.tab === 'browse' && !hasActiveFilters() && state.page === 1;
  el.spotlight.classList.toggle('hidden', !show);
  if (!show) return;
  const featured = state.allCatalog.find((item) => item.release_kind === 'package') || state.allCatalog[0];
  if (!featured) {
    el.spotlight.classList.add('hidden');
    return;
  }
  const isSaved = state.savedIds.has(featured.asset_id);
  const isPending = state.pendingSaves.has(featured.asset_id);
  const tested = featured.engine_compatibility?.godot_tested || '4.7.2';
  const licBadge = featured.license ? `<span class="license-pill">${esc(featured.license)}</span>` : '';
  el.spotlight.innerHTML = `
    <div class="spotlight-copy">
      <div class="spotlight-badges">
        <span class="badge-tertiary">추천 큐레이션</span>
        <span class="badge-secondary">Godot ${esc(tested)} 검증 완료</span>
        ${licBadge}
      </div>
      <h1>${esc(featured.title)}</h1>
      <p>${esc(featured.summary)}</p>
      <div class="spotlight-actions">
        <button type="button" class="btn btn-primary" data-action="inspect-item" data-id="${esc(featured.asset_id)}">패키지 상세 계약 보기</button>
        <button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-secondary'}" data-action="toggle-library" data-id="${esc(featured.asset_id)}"${isPending ? ' disabled' : ''}>${
          isPending ? '동기화 중…' : (isSaved ? '라이브러리에 저장됨 ✓' : '내 라이브러리에 저장')
        }</button>
      </div>
    </div>
    <div class="spotlight-visual">
      <img ${getThumbImageAttrs(featured)} alt="${esc(featured.title)}" />
    </div>
  `;
}

function renderPagination() {
  if (!el.pagination) return;
  const show = state.tab === 'browse' && state.mode === 'live' && state.totalPages > 1;
  el.pagination.classList.toggle('hidden', !show);
  if (!show) {
    el.pagination.innerHTML = '';
    return;
  }
  const cur = state.page;
  const max = state.totalPages;
  const pages = new Set([1, max]);
  for (let p = Math.max(1, cur - 2); p <= Math.min(max, cur + 2); p += 1) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);

  const buttons = [
    `<button type="button" class="page-btn" data-page="${Math.max(1, cur - 1)}"${cur <= 1 ? ' disabled' : ''}>이전</button>`
  ];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) buttons.push('<span class="page-meta">…</span>');
    buttons.push(`<button type="button" class="page-btn${p === cur ? ' active' : ''}" data-page="${p}">${p}</button>`);
    prev = p;
  }
  buttons.push(`<button type="button" class="page-btn" data-page="${Math.min(max, cur + 1)}"${cur >= max ? ' disabled' : ''}>다음</button>`);
  buttons.push(`<span class="page-meta">${cur.toLocaleString()} / ${max.toLocaleString()} 페이지 · 총 ${state.total.toLocaleString()}개</span>`);
  el.pagination.innerHTML = buttons.join('');
}

function renderCards(items) {
  if (el.resultsCount) {
    if (state.tab === 'library') {
      el.resultsCount.textContent = `내 라이브러리 ${items.length.toLocaleString()}개 에셋`;
    } else if (state.mode === 'live') {
      el.resultsCount.textContent = hasActiveFilters()
        ? `검색 결과 ${state.total.toLocaleString()}개 / 전체 ${state.catalogTotal.toLocaleString()}개 에셋`
        : `총 ${state.total.toLocaleString()}개 에셋`;
    } else {
      el.resultsCount.textContent = `총 ${items.length.toLocaleString()}개 에셋`;
    }
  }

  if (!items.length) {
    el.list.innerHTML = `<div class="card"><div class="card-body"><p>${
      state.tab === 'library'
        ? '내 라이브러리에 저장된 패키지가 없습니다. 탐색 탭에서 패키지를 저장해 보세요.'
        : '검색 조건에 맞는 항목이 없습니다.'
    }</p></div></div>`;
    return;
  }

  el.list.innerHTML = items.map((item) => {
    const isSaved = state.savedIds.has(item.asset_id);
    const isPackage = item.release_kind === 'package';
    const isAddon = hasExecutableAddon(item);
    const isPending = state.pendingSaves.has(item.asset_id);
    const selected = state.selectedId === item.asset_id ? ' selected' : '';
    const tierInfo = item.license_tier ? TIER_META[item.license_tier] : null;
    const isNoAi = /no generative ai|no ai/i.test(String(item.ai_disclosure || ''));
    const isExternalOnly = item.hosting_policy === 'external_link_only';
    const floatBadge = !isPackage
      ? (isExternalOnly ? '<span class="card-badge-float editorial">Tier 4 · 외부 링크 전용</span>' : '<span class="card-badge-float editorial">일반 콘텐츠 · 가이드</span>')
      : isSaved
        ? '<span class="card-badge-float saved">저장됨 ✓</span>'
        : isAddon
          ? '<span class="card-badge-float addon">실행 가능 Addon</span>'
          : `<span class="card-badge-float pkg">${esc(item.category)}</span>`;
    const actionLabel = isPending
      ? '동기화 중…'
      : (isSaved ? '저장됨 ✓' : '라이브러리에 저장');
    const actionRow = isPackage
      ? `<button type="button" class="btn btn-secondary" data-action="inspect-item" data-id="${esc(item.asset_id)}">상세 계약</button>
         <button type="button" class="btn btn-grow ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(item.asset_id)}"${isPending ? ' disabled' : ''}>${esc(actionLabel)}</button>`
      : (isExternalOnly && isSafeHttpUrl(item.source_url)
        ? `<a class="btn btn-primary btn-grow artifact-link" href="${esc(item.source_url)}" target="_blank" rel="noopener noreferrer">공식 사이트 이동 ↗</a>
           <button type="button" class="btn btn-secondary" data-action="inspect-item" data-id="${esc(item.asset_id)}">안내</button>`
        : `<span class="state-tag">editorial · 설치 버튼 없음</span>
           <button type="button" class="btn btn-secondary" data-action="inspect-item" data-id="${esc(item.asset_id)}">읽기</button>`);
    const compatLine = isPackage
      ? `<span class="mono">Godot ${esc(item.engine_compatibility?.godot_tested || '4.7+')}</span>${item.license ? `<span>·</span><span class="license-pill">${esc(item.license)}</span>` : ''}${tierInfo ? `<span class="tier-pill ${tierInfo.cls}">${esc(tierInfo.label)}</span>` : ''}${isNoAi ? '<span class="ai-pill">No AI</span>' : ''}`
      : `<span class="mono">v${esc(item.asset_version_id)}</span><span>·</span><span>${isExternalOnly ? '직접 호스팅 금지 · 외부 링크' : '문서 안내'}</span>`;
    const tags = Array.isArray(item.tags) ? item.tags.slice(0, 4) : [];
    const tagRow = tags.length
      ? `<div class="card-tags">${tags.map((t) => `<span class="card-tag" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}</div>`
      : '';

    return `<article class="card${selected}" data-card-id="${esc(item.asset_id)}">
      <div class="card-thumb">
        <img ${getThumbImageAttrs(item)} alt="${esc(item.title)}" loading="lazy" />
        ${floatBadge}
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span class="card-publisher">${esc(item.author || item.publisher_id || 'PlayForge')}</span>
          <span class="kind-pill ${isPackage ? 'kind-package' : 'kind-editorial'}">${esc(item.release_kind)}</span>
        </div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.summary)}</p>
        ${tagRow}
        <div class="card-compat-row">${compatLine}</div>
        <div class="card-actions">${actionRow}</div>
      </div>
    </article>`;
  }).join('');
}

function renderPublisher() {
  el.publisher.innerHTML = state.drafts.map((draft) => {
    const isReview = draft.review_status === 'in_review';
    return `<article class="publisher-card">
      <div>
        <h3>${esc(draft.draft_id)} (${esc(draft.release_kind)})</h3>
        <p>${esc(draft.note)}</p>
        <div class="publisher-meta">asset_id: ${esc(draft.asset_id)} · v${esc(draft.next_version)} · Validator: ${esc(draft.validator_status)}</div>
      </div>
      <span class="${isReview ? 'status-pill-review' : 'status-pill-draft'}">${isReview ? '심사 중' : esc(draft.review_status)}</span>
    </article>`;
  }).join('');
}

function renderDetail(items) {
  const active = findItemById(state.selectedId) || items[0] || state.allCatalog[0] || SAMPLE_CATALOG[0];
  if (!active) {
    el.detail.innerHTML = '<p>표시할 항목이 없습니다.</p>';
    return;
  }
  const isPackage = active.release_kind === 'package';
  const isSaved = state.savedIds.has(active.asset_id);
  const isPending = state.pendingSaves.has(active.asset_id);
  const libraryEntry = isSaved
    ? (state.libraryEntries.find((entry) => (entry.slug || entry.asset_id) === active.asset_id) || active.library_entry || null)
    : null;

  if (!isPackage) {
    const lines = Array.isArray(active.article_body) ? active.article_body : [];
    const isExtOnly = active.hosting_policy === 'external_link_only';
    const extBtn = isExtOnly && isSafeHttpUrl(active.source_url)
      ? `<div style="margin-top:8px"><a class="btn btn-primary artifact-link" href="${esc(active.source_url)}" target="_blank" rel="noopener noreferrer">공식 배포처로 이동하여 다운로드 ↗</a></div>`
      : '';
    el.detail.innerHTML = `
      <div class="detail-left">
        <div class="detail-badge-row">
          <span class="badge-secondary">선택된 에셋 상세</span>
          <span class="kind-pill kind-editorial">${isExtOnly ? 'Tier 4 · 외부 링크 전용 (직접 호스팅 금지)' : 'editorial · 일반 콘텐츠 (설치 버튼 없음)'}</span>
        </div>
        <h2>${esc(active.title)}</h2>
        <p class="detail-summary">${esc(active.summary)}</p>
        <div class="dock-callout">${lines.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
        <div class="dock-callout">${isExtOnly
          ? '저작권·재배포 금지 약관 준수를 위해 본 리소스는 PlayForge Store 서버에 호스팅하지 않으며 공식 배포처 링크로만 안내합니다.'
          : '일반 콘텐츠(<code>release_kind = editorial</code>)는 패키지 설치 대상이 아니며 빈 패키지를 생성하지 않습니다.'}</div>
        ${extBtn}
      </div>
    `;
    return;
  }

  const manifestChips = (active.file_manifest || [])
    .map((f) => `<span class="manifest-chip">${esc(f.path)} (${Number(f.bytes).toLocaleString()} B)</span>`)
    .join('');
  const tagChips = (Array.isArray(active.tags) ? active.tags : [])
    .map((t) => `<button type="button" class="tag-chip${state.tag === t ? ' active' : ''}" data-tag="${esc(t)}">#${esc(t)}</button>`)
    .join('');
  const artifactUrl = active.artifact_url || apiClient.getArtifactUrl(active.asset_id, active.asset_version_id);
  const externalUrl = isSafeHttpUrl(active.external_download_url)
    ? active.external_download_url
    : (isSafeHttpUrl(active.source_url) ? active.source_url : '');
  const externalAction = externalUrl
    ? `<a class="btn btn-secondary artifact-link" href="${esc(externalUrl)}" target="_blank" rel="noopener noreferrer">공식 외부 다운로드 / 원출처 ↗</a>`
    : '';
  const artifactAction = state.mode === 'live'
    ? `<a class="btn btn-secondary artifact-link" href="${esc(artifactUrl)}" download="${esc(active.asset_id)}-${esc(active.asset_version_id)}.playforgepkg">.playforgepkg 메타 패키지 확인</a>`
    : '';
  const statusBanner = state.statusMessage
    ? `<div class="dock-callout status-callout" role="status">${esc(state.statusMessage)}</div>`
    : '';
  const savedAtRow = libraryEntry?.saved_at
    ? `<tr><th>saved_at</th><td><code>${esc(libraryEntry.saved_at)}</code></td></tr>`
    : '';
  const tierInfo = active.license_tier ? TIER_META[active.license_tier] : null;
  const licenseRow = active.license
    ? `<tr><th>license</th><td><span class="license-pill">${esc(active.license)}</span> ${tierInfo ? `<span class="tier-pill ${tierInfo.cls}">${esc(tierInfo.label)}</span>` : ''}</td></tr>`
    : '';
  const aiRow = active.ai_disclosure
    ? `<tr><th>ai_disclosure</th><td><span class="ai-pill">${esc(active.ai_disclosure)}</span></td></tr>`
    : '';
  const formatsRow = Array.isArray(active.formats) && active.formats.length
    ? `<tr><th>formats</th><td><code>${esc(active.formats.join(', '))}</code></td></tr>`
    : '';
  const authorRow = active.author
    ? `<tr><th>author</th><td>${esc(active.author)}</td></tr>`
    : '';
  const sourceRow = active.source_provider
    ? `<tr><th>source</th><td>${
      isSafeHttpUrl(active.source_url)
        ? `<a class="source-link" href="${esc(active.source_url)}" target="_blank" rel="noopener noreferrer">${esc(active.source_provider)} ↗</a>`
        : esc(active.source_provider)
    }</td></tr>`
    : '';
  const creditText = active.attribution_text || '';
  const creditBox = creditText
    ? `<div class="credit-box">
        <div class="credit-box-head">
          <strong>표준 크레딧 고지 (<code>Third-Party Notices.txt</code> · <code>CREDITS.md</code>)</strong>
          <button type="button" class="btn btn-secondary" data-action="copy-credit" data-id="${esc(active.asset_id)}">크레딧 복사</button>
        </div>
        <code>${esc(creditText)}</code>
      </div>`
    : '';
  const compat = active.engine_compatibility || { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux', 'macos'] };

  el.detail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-left">
        <div class="detail-badge-row">
          <span class="badge-secondary">선택된 에셋 상세</span>
          <span class="kind-pill ${isSaved ? 'card-badge-float saved' : 'kind-package'}" style="position:static">${isSaved ? 'saved_to_library' : esc(active.store_state)}</span>
          ${active.license ? `<span class="license-pill">${esc(active.license)}</span>` : ''}
          ${tierInfo ? `<span class="tier-pill ${tierInfo.cls}">${esc(tierInfo.label)}</span>` : ''}
          ${/no generative ai|no ai/i.test(String(active.ai_disclosure || '')) ? '<span class="ai-pill">No AI</span>' : ''}
          ${hasExecutableAddon(active) ? '<span class="badge-tertiary">executable_addon: true</span>' : ''}
        </div>
        <h2>${esc(active.title)}</h2>
        <p class="detail-summary">${esc(active.summary)}</p>
        ${tagChips ? `<div class="tag-cloud">${tagChips}</div>` : ''}
        ${creditBox}
        <div class="manifest-chips">${manifestChips}</div>
        ${statusBanner}
        <div class="dock-callout">
          <strong>다음 단계 (Godot Store 도크 · 외부 연동 우선):</strong> <strong>공식 외부 다운로드</strong>로 원파일을 바로 받거나, <strong>내 라이브러리 저장</strong> 후 Godot 4.7.2 에디터 도크에서 <code>Third-Party Notices.txt</code>와 함께 6단계 검증 후 프로젝트에 적용하세요.
        </div>
      </div>

      <div class="detail-contract-box">
        <div class="contract-box-head">
          <strong>불변 패키지 계약</strong>
          <span>.playforgepkg</span>
        </div>
        <table class="spec-table">
          <tr><th>asset_id</th><td><code>${esc(active.asset_id)}</code></td></tr>
          <tr><th>release_id</th><td><code>${esc(active.release_id)}</code></td></tr>
          <tr><th>engine_compat</th><td>Godot ${esc(compat.godot_tested)} (min ${esc(compat.godot_min)})</td></tr>
          <tr><th>platforms</th><td>${esc((compat.platforms || []).join(', '))}</td></tr>
          <tr><th>artifact_digest</th><td><code title="${esc(active.artifact_digest)}">${esc(shortDigest(active.artifact_digest))}</code></td></tr>
          ${licenseRow}
          ${aiRow}
          ${formatsRow}
          ${authorRow}
          ${sourceRow}
          <tr><th>license_ref</th><td><code>${esc(active.license_snapshot_ref)}</code></td></tr>
          ${savedAtRow}
        </table>
        <div class="detail-actions">
          <button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(active.asset_id)}"${isPending ? ' disabled' : ''}>${
            isPending
              ? '동기화 중…'
              : (isSaved ? '라이브러리에 저장됨 ✓ (클릭 시 제거)' : '내 라이브러리에 저장')
          }</button>
          ${externalAction}
          ${artifactAction}
        </div>
      </div>
    </div>
  `;
}

function render() {
  renderConnectionBadges();
  el.libraryCount.textContent = String(state.savedIds.size);
  for (const tabBtn of el.tabs) {
    const active = tabBtn.dataset.tab === state.tab;
    tabBtn.classList.toggle('active', active);
    tabBtn.setAttribute('aria-selected', active ? 'true' : 'false');
  }

  const isPublisher = state.tab === 'publisher';
  el.browseControls.classList.toggle('hidden', isPublisher);
  el.resultsBar?.classList.toggle('hidden', isPublisher);
  el.list.classList.toggle('hidden', isPublisher);
  el.publisher.classList.toggle('hidden', !isPublisher);
  el.workspace?.classList.toggle('publisher-mode', isPublisher);

  renderSpotlight();
  const items = visibleCatalog();
  if (isPublisher) {
    renderPublisher();
    el.pagination?.classList.add('hidden');
  } else {
    renderCards(items);
    renderPagination();
  }
  renderDetail(items);
}

function setCategory(nextCategory) {
  state.category = nextCategory || 'all';
  state.page = 1;
  if (el.categoryFilter) el.categoryFilter.value = state.category;
  renderCategoryOptions();
  if (state.mode === 'live') refreshCatalog();
  else render();
}

function setTag(nextTag) {
  state.tag = state.tag === nextTag ? 'all' : (nextTag || 'all');
  state.page = 1;
  renderFacetOptions();
  if (state.mode === 'live') refreshCatalog();
  else render();
}

document.addEventListener('click', (event) => {
  const tabBtn = event.target.closest('.tab');
  if (tabBtn) {
    state.tab = tabBtn.dataset.tab;
    state.statusMessage = '';
    render();
    if (state.tab === 'library') refreshMyAssets();
    else if (state.tab === 'publisher') refreshPublisherDrafts();
    return;
  }
  const catBtn = event.target.closest('.cat-pill');
  if (catBtn) {
    setCategory(catBtn.dataset.cat);
    return;
  }
  const tagBtn = event.target.closest('[data-tag]');
  if (tagBtn) {
    event.stopPropagation();
    setTag(tagBtn.dataset.tag);
    return;
  }
  const pageBtn = event.target.closest('[data-page]');
  if (pageBtn && !pageBtn.disabled) {
    const nextPage = Number(pageBtn.dataset.page);
    if (Number.isInteger(nextPage) && nextPage >= 1 && nextPage !== state.page) {
      state.page = nextPage;
      refreshCatalog();
      el.resultsBar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  const actionBtn = event.target.closest('[data-action]');
  if (actionBtn) {
    event.stopPropagation();
    const { action, id } = actionBtn.dataset;
    if (action === 'toggle-library') toggleLibrary(id);
    else if (action === 'select-item') selectItem(id, false);
    else if (action === 'inspect-item') selectItem(id, true);
    else if (action === 'copy-credit') {
      const target = findItemById(id);
      if (target?.attribution_text) {
        navigator.clipboard?.writeText(target.attribution_text).catch(() => {});
        actionBtn.textContent = '복사됨 ✓';
        setTimeout(() => { actionBtn.textContent = '크레딧 복사'; }, 1800);
      }
    }
    return;
  }
  const card = event.target.closest('[data-card-id]');
  if (card) {
    selectItem(card.dataset.cardId, false);
  }
});

let searchTimer = null;
el.search?.addEventListener('input', (event) => {
  state.query = event.target.value;
  state.page = 1;
  if (state.mode !== 'live') {
    render();
    return;
  }
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    refreshCatalog();
  }, 80);
});

el.categoryFilter?.addEventListener('change', (event) => {
  setCategory(event.target.value);
});

el.kindFilter?.addEventListener('change', (event) => {
  state.kind = event.target.value;
  state.page = 1;
  if (state.mode === 'live') refreshCatalog();
  else render();
});

el.tierFilter?.addEventListener('change', (event) => {
  state.tier = event.target.value;
  state.page = 1;
  if (state.mode === 'live') refreshCatalog();
  else render();
});

el.licenseFilter?.addEventListener('change', (event) => {
  state.license = event.target.value;
  state.page = 1;
  if (state.mode === 'live') refreshCatalog();
  else render();
});

el.aiFilter?.addEventListener('change', (event) => {
  state.ai = event.target.value;
  state.page = 1;
  if (state.mode === 'live') refreshCatalog();
  else render();
});

el.sourceFilter?.addEventListener('change', (event) => {
  state.source = event.target.value;
  state.page = 1;
  if (state.mode === 'live') refreshCatalog();
  else render();
});

el.sortSelect?.addEventListener('change', (event) => {
  state.sort = event.target.value;
  render();
});

el.resetFiltersBtn?.addEventListener('click', () => {
  state.query = '';
  state.category = 'all';
  state.kind = 'all';
  state.tier = 'all';
  state.license = 'all';
  state.ai = 'all';
  state.source = 'all';
  state.tag = 'all';
  state.sort = 'default';
  state.page = 1;
  if (el.search) el.search.value = '';
  if (el.categoryFilter) el.categoryFilter.value = 'all';
  if (el.kindFilter) el.kindFilter.value = 'all';
  if (el.tierFilter) el.tierFilter.value = 'all';
  if (el.licenseFilter) el.licenseFilter.value = 'all';
  if (el.aiFilter) el.aiFilter.value = 'all';
  if (el.sourceFilter) el.sourceFilter.value = 'all';
  if (el.sortSelect) el.sortSelect.value = 'default';
  renderCategoryOptions();
  renderFacetOptions();
  if (state.mode === 'live') refreshCatalog();
  else render();
});

async function init() {
  const params = new URLSearchParams(window.location.search);
  const initialAsset = params.get('asset');
  if (initialAsset) {
    state.selectedId = initialAsset;
  }
  renderCategoryOptions();
  renderFacetOptions();
  render();
  await refreshCatalog({ refreshFull: true });
  if (state.mode === 'live') {
    await Promise.all([
      refreshMyAssets(),
      refreshPublisherDrafts(),
      hydrateDetail(state.selectedId)
    ]);
  }
}

init();
