import {
  SAMPLE_CATALOG,
  PUBLISHER_DRAFTS,
  createStoreApiClient,
  extractCatalogCategories,
  fetchCatalogWithFallback,
  filterCatalogEntries,
  isBackendUnavailableError
} from './store-catalog.js';

const apiClient = createStoreApiClient();

const state = {
  tab: 'browse',
  query: '',
  category: 'all',
  kind: 'all',
  sort: 'default',
  mode: 'static',
  catalog: SAMPLE_CATALOG.map((item) => ({ ...item })),
  allCatalog: SAMPLE_CATALOG.map((item) => ({ ...item })),
  categories: extractCatalogCategories(SAMPLE_CATALOG),
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
  publisher: document.getElementById('publisher-panel'),
  detail: document.getElementById('detail-pane'),
  libraryCount: document.getElementById('library-count'),
  search: document.getElementById('search-input'),
  categoryFilter: document.getElementById('category-filter'),
  categoryPills: document.getElementById('category-pills'),
  kindFilter: document.getElementById('kind-filter'),
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

function currentFilters() {
  return {
    category: state.category,
    q: state.query,
    release_kind: state.kind
  };
}

function renderCategoryOptions() {
  const previous = state.category;
  if (el.categoryFilter) {
    const options = [
      '<option value="all">전체 카테고리</option>',
      ...state.categories.map((cat) => `<option value="${esc(cat)}">${esc(cat)}</option>`)
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

function renderConnectionBadges() {
  if (el.ssoBadge) {
    const label = state.account?.account_label || 'creator-demo@playhub.local';
    el.ssoBadge.textContent = `Hub SSO · ${label}`;
  }
  if (el.connectionBadge) {
    el.connectionBadge.dataset.mode = state.mode;
    el.connectionBadge.textContent = state.mode === 'live'
      ? '실서버 연동 (/api/store)'
      : '정적 열람 모드';
  }
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

function visibleCatalog() {
  if (state.tab === 'library') {
    const librarySource = state.allCatalog.filter((item) => state.savedIds.has(item.asset_id));
    return sortItems(filterCatalogEntries(librarySource, currentFilters()));
  }
  if (state.mode === 'live') {
    return sortItems(state.catalog);
  }
  return sortItems(filterCatalogEntries(state.allCatalog, currentFilters()));
}

function findItemById(assetId) {
  if (!assetId) return null;
  if (state.selectedDetail && state.selectedDetail.asset_id === assetId) {
    return state.selectedDetail;
  }
  return state.catalog.find((x) => x.asset_id === assetId)
    || state.allCatalog.find((x) => x.asset_id === assetId)
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
  const filters = currentFilters();
  const result = await fetchCatalogWithFallback({
    apiClient,
    filters,
    fallbackCatalog: SAMPLE_CATALOG
  });
  if (seq !== state.catalogReqSeq) return;

  state.mode = result.mode;
  state.catalog = result.items.map((item) => ({ ...item }));
  state.categories = result.categories;
  if (result.account) {
    state.account = result.account;
  }

  const hasActiveFilter = Boolean(
    (filters.category && filters.category !== 'all')
    || (filters.release_kind && filters.release_kind !== 'all')
    || filters.q.trim()
  );

  if (result.mode === 'live' && (!hasActiveFilter || refreshFull)) {
    if (!hasActiveFilter) {
      state.allCatalog = result.items.map((item) => ({ ...item }));
    } else {
      try {
        const full = await apiClient.getCatalog({});
        if (Array.isArray(full?.items)) {
          state.allCatalog = full.items.map((item) => ({ ...item }));
        }
      } catch {
        // keep existing cache
      }
    }
  }

  renderCategoryOptions();
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
  const show = state.tab === 'browse' && !state.query.trim() && state.category === 'all' && state.kind === 'all';
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
  el.spotlight.innerHTML = `
    <div class="spotlight-copy">
      <div class="spotlight-badges">
        <span class="badge-tertiary">추천 큐레이션</span>
        <span class="badge-secondary">Godot ${esc(tested)} 검증 완료</span>
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
      <img src="${makeThumbDataUri(featured)}" alt="${esc(featured.title)}" />
    </div>
  `;
}

function renderCards(items) {
  if (el.resultsCount) {
    el.resultsCount.textContent = state.tab === 'library'
      ? `내 라이브러리 ${items.length}개 에셋`
      : `총 ${items.length}개 에셋`;
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
    const floatBadge = !isPackage
      ? '<span class="card-badge-float editorial">일반 콘텐츠 · 가이드</span>'
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
      : `<span class="state-tag">editorial · 설치 버튼 없음</span>
         <button type="button" class="btn btn-secondary" data-action="inspect-item" data-id="${esc(item.asset_id)}">읽기</button>`;
    const compatLine = isPackage
      ? `<span class="mono">Godot ${esc(item.engine_compatibility?.godot_tested || '4.7+')}</span><span>·</span><span class="mono">v${esc(item.asset_version_id)}</span>`
      : `<span class="mono">v${esc(item.asset_version_id)}</span><span>·</span><span>문서 안내</span>`;

    return `<article class="card${selected}" data-card-id="${esc(item.asset_id)}">
      <div class="card-thumb">
        <img src="${makeThumbDataUri(item)}" alt="${esc(item.title)}" loading="lazy" />
        ${floatBadge}
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span class="card-publisher">${esc(item.publisher_id || 'PlayForge')}</span>
          <span class="kind-pill ${isPackage ? 'kind-package' : 'kind-editorial'}">${esc(item.release_kind)}</span>
        </div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.summary)}</p>
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
    el.detail.innerHTML = `
      <div class="detail-left">
        <div class="detail-badge-row">
          <span class="badge-secondary">선택된 에셋 상세</span>
          <span class="kind-pill kind-editorial">editorial · 일반 콘텐츠 (설치 버튼 없음)</span>
        </div>
        <h2>${esc(active.title)}</h2>
        <p class="detail-summary">${esc(active.summary)}</p>
        <div class="dock-callout">${lines.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
        <div class="dock-callout">일반 콘텐츠(<code>release_kind = editorial</code>)는 패키지 설치 대상이 아니며 빈 패키지를 생성하지 않습니다.</div>
      </div>
    `;
    return;
  }

  const manifestChips = (active.file_manifest || [])
    .map((f) => `<span class="manifest-chip">${esc(f.path)} (${Number(f.bytes).toLocaleString()} B)</span>`)
    .join('');
  const artifactUrl = active.artifact_url || apiClient.getArtifactUrl(active.asset_id, active.asset_version_id);
  const artifactAction = state.mode === 'live'
    ? `<a class="btn btn-secondary artifact-link" href="${esc(artifactUrl)}" download="${esc(active.asset_id)}-${esc(active.asset_version_id)}.playforgepkg">.playforgepkg 다운로드 확인</a>`
    : '';
  const statusBanner = state.statusMessage
    ? `<div class="dock-callout status-callout" role="status">${esc(state.statusMessage)}</div>`
    : '';
  const savedAtRow = libraryEntry?.saved_at
    ? `<tr><th>saved_at</th><td><code>${esc(libraryEntry.saved_at)}</code></td></tr>`
    : '';

  el.detail.innerHTML = `
    <div class="detail-grid">
      <div class="detail-left">
        <div class="detail-badge-row">
          <span class="badge-secondary">선택된 에셋 상세</span>
          <span class="kind-pill ${isSaved ? 'card-badge-float saved' : 'kind-package'}" style="position:static">${isSaved ? 'saved_to_library' : esc(active.store_state)}</span>
          ${hasExecutableAddon(active) ? '<span class="badge-tertiary">executable_addon: true</span>' : ''}
        </div>
        <h2>${esc(active.title)}</h2>
        <p class="detail-summary">${esc(active.summary)}</p>
        <div class="manifest-chips">${manifestChips}</div>
        ${statusBanner}
        <div class="dock-callout">
          <strong>다음 단계 (Godot Store 도크):</strong> Godot 4.7.2 에디터에서 <strong>새로고침</strong>을 눌러 같은 Hub 계정 라이브러리를 조회하고, SHA-256 검증 및 6단계 변경 검토 후 선택한 프로젝트에만 적용하세요.
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
          <tr><th>engine_compat</th><td>Godot ${esc(active.engine_compatibility.godot_tested)} (min ${esc(active.engine_compatibility.godot_min)})</td></tr>
          <tr><th>platforms</th><td>${esc(active.engine_compatibility.platforms.join(', '))}</td></tr>
          <tr><th>artifact_digest</th><td><code title="${esc(active.artifact_digest)}">${esc(shortDigest(active.artifact_digest))}</code></td></tr>
          <tr><th>license_ref</th><td><code>${esc(active.license_snapshot_ref)}</code></td></tr>
          ${savedAtRow}
        </table>
        <div class="detail-actions">
          <button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(active.asset_id)}"${isPending ? ' disabled' : ''}>${
            isPending
              ? '동기화 중…'
              : (isSaved ? '라이브러리에 저장됨 ✓ (클릭 시 제거)' : '내 라이브러리에 저장')
          }</button>
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
  if (isPublisher) renderPublisher();
  else renderCards(items);
  renderDetail(items);
}

function setCategory(nextCategory) {
  state.category = nextCategory || 'all';
  if (el.categoryFilter) el.categoryFilter.value = state.category;
  renderCategoryOptions();
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
  const actionBtn = event.target.closest('[data-action]');
  if (actionBtn) {
    event.stopPropagation();
    const { action, id } = actionBtn.dataset;
    if (action === 'toggle-library') toggleLibrary(id);
    else if (action === 'select-item') selectItem(id, false);
    else if (action === 'inspect-item') selectItem(id, true);
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
  state.sort = 'default';
  if (el.search) el.search.value = '';
  if (el.categoryFilter) el.categoryFilter.value = 'all';
  if (el.kindFilter) el.kindFilter.value = 'all';
  if (el.sortSelect) el.sortSelect.value = 'default';
  renderCategoryOptions();
  if (state.mode === 'live') refreshCatalog();
  else render();
});

async function init() {
  renderCategoryOptions();
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
