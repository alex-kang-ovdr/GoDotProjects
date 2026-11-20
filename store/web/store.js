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
  kindFilter: document.getElementById('kind-filter'),
  browseControls: document.getElementById('browse-controls'),
  ssoBadge: document.getElementById('sso-badge'),
  connectionBadge: document.getElementById('connection-badge'),
  tabs: [...document.querySelectorAll('.tab')]
};

const shortDigest = (digest) => (digest ? `${digest.slice(0, 18)}…${digest.slice(-6)}` : '없음 (editorial)');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[ch]);
}

function currentFilters() {
  return {
    category: state.category,
    q: state.query,
    release_kind: state.kind
  };
}

function renderCategoryOptions() {
  if (!el.categoryFilter) return;
  const previous = state.category;
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

function renderConnectionBadges() {
  if (el.ssoBadge) {
    const label = state.account?.account_label || 'creator-demo@playhub.local';
    el.ssoBadge.textContent = `Hub 계정 연결됨 · ${label} (SSO)`;
  }
  if (el.connectionBadge) {
    el.connectionBadge.dataset.mode = state.mode;
    el.connectionBadge.textContent = state.mode === 'live'
      ? '실서버 연동 (/api/store)'
      : '정적 열람 모드 (Fallback)';
  }
}

function visibleCatalog() {
  if (state.tab === 'library') {
    const librarySource = state.allCatalog.filter((item) => state.savedIds.has(item.asset_id));
    return filterCatalogEntries(librarySource, currentFilters());
  }
  if (state.mode === 'live') {
    return state.catalog;
  }
  return filterCatalogEntries(state.allCatalog, currentFilters());
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
  for (const item of state.allCatalog) {
    if (item.release_kind === 'package') {
      const saved = state.savedIds.has(item.asset_id);
      item.saved_in_library = saved;
      item.store_state = saved ? 'saved_to_library' : 'catalog_listed';
    }
  }
  for (const item of state.catalog) {
    if (item.release_kind === 'package') {
      const saved = state.savedIds.has(item.asset_id);
      item.saved_in_library = saved;
      item.store_state = saved ? 'saved_to_library' : 'catalog_listed';
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

function selectItem(assetId) {
  state.selectedId = assetId;
  state.selectedDetail = null;
  state.statusMessage = '';
  render();
  hydrateDetail(assetId);
}

function renderCards(items) {
  if (!items.length) {
    el.list.innerHTML = `<div class="card"><p>${
      state.tab === 'library'
        ? '내 라이브러리에 저장된 패키지가 없습니다. 탐색 탭에서 패키지를 저장해 보세요.'
        : '검색 조건에 맞는 항목이 없습니다.'
    }</p></div>`;
    return;
  }

  el.list.innerHTML = items.map((item) => {
    const isSaved = state.savedIds.has(item.asset_id);
    const isPackage = item.release_kind === 'package';
    const isPending = state.pendingSaves.has(item.asset_id);
    const selected = state.selectedId === item.asset_id ? ' selected' : '';
    const actionLabel = isPending
      ? '저장 동기화 중…'
      : (isSaved ? '라이브러리에 저장됨' : '내 라이브러리에 저장');
    const actionButton = isPackage
      ? `<button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(item.asset_id)}"${isPending ? ' disabled' : ''}>${esc(actionLabel)}</button>`
      : `<button type="button" class="btn btn-secondary" data-action="select-item" data-id="${esc(item.asset_id)}">읽기</button>`;
    const stateText = isPackage
      ? (isSaved ? 'StoreLibraryEntry (프로젝트 미변경)' : `Godot ${esc(item.engine_compatibility.godot_tested)} 호환`)
      : '설치 버튼 없음 (일반 콘텐츠)';

    return `<article class="card${selected}" data-card-id="${esc(item.asset_id)}">
      <div class="card-meta">
        <span>${esc(item.category)}</span>
        <span class="kind-pill ${isPackage ? 'kind-package' : 'kind-editorial'}">${esc(item.release_kind)} · v${esc(item.asset_version_id)}</span>
      </div>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.summary)}</p>
      <div class="card-actions">
        ${actionButton}
        <span class="state-tag">${stateText}</span>
      </div>
    </article>`;
  }).join('');
}

function renderPublisher() {
  el.publisher.innerHTML = state.drafts.map((draft) => `
    <article class="card">
      <div class="card-meta">
        <span>게시자 초안 · ${esc(draft.draft_id)}</span>
        <span class="kind-pill ${draft.release_kind === 'package' ? 'kind-package' : 'kind-editorial'}">${esc(draft.release_kind)} · v${esc(draft.next_version)}</span>
      </div>
      <h3>${esc(draft.asset_id)}</h3>
      <p>${esc(draft.note)}</p>
      <div class="card-meta">
        <span>Validator: ${esc(draft.validator_status)}</span>
        <span>심사 상태: ${esc(draft.review_status)}</span>
      </div>
    </article>
  `).join('');
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
      <span class="kind-pill kind-editorial">editorial · 일반 콘텐츠</span>
      <h2>${esc(active.title)}</h2>
      <p>${esc(active.summary)}</p>
      <div class="dock-callout">${lines.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
      <div class="dock-callout">일반 콘텐츠(<code>release_kind = editorial</code>)는 패키지 설치 대상이 아니며 빈 패키지를 생성하지 않습니다.</div>
    `;
    return;
  }

  const fileRows = (active.file_manifest || [])
    .map((f) => `${f.path} (${Number(f.bytes).toLocaleString()} B)`)
    .join(', ');
  const artifactUrl = active.artifact_url || apiClient.getArtifactUrl(active.asset_id, active.asset_version_id);
  const artifactAction = state.mode === 'live'
    ? `<a class="btn btn-secondary artifact-link" href="${esc(artifactUrl)}" download="${esc(active.asset_id)}-${esc(active.asset_version_id)}.playforgepkg">.playforgepkg 확인</a>`
    : '';
  const statusBanner = state.statusMessage
    ? `<div class="dock-callout status-callout" role="status">${esc(state.statusMessage)}</div>`
    : '';
  const savedAtRow = libraryEntry?.saved_at
    ? `<tr><th>saved_at</th><td><code>${esc(libraryEntry.saved_at)}</code></td></tr>`
    : '';

  el.detail.innerHTML = `
    <span class="kind-pill kind-package">package · v${esc(active.asset_version_id)}</span>
    <h2>${esc(active.title)}</h2>
    <p>${esc(active.summary)}</p>
    <table class="spec-table">
      <tr><th>asset_id</th><td><code>${esc(active.asset_id)}</code></td></tr>
      <tr><th>release_id</th><td><code>${esc(active.release_id)}</code></td></tr>
      <tr><th>store_state</th><td><code>${isSaved ? 'saved_to_library' : esc(active.store_state)}</code></td></tr>
      <tr><th>artifact_digest</th><td><code title="${esc(active.artifact_digest)}">${esc(shortDigest(active.artifact_digest))}</code></td></tr>
      <tr><th>engine_compatibility</th><td>Godot ${esc(active.engine_compatibility.godot_tested)} (min ${esc(active.engine_compatibility.godot_min)}) · ${esc(active.engine_compatibility.platforms.join(', '))}</td></tr>
      <tr><th>license_snapshot_ref</th><td><code>${esc(active.license_snapshot_ref)}</code></td></tr>
      <tr><th>file_manifest</th><td><code>${esc(fileRows)}</code></td></tr>
      ${savedAtRow}
    </table>
    <div class="detail-actions">
      <button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(active.asset_id)}"${isPending ? ' disabled' : ''}>${
        isPending
          ? '동기화 중…'
          : (isSaved ? '라이브러리에 저장됨 (클릭 시 제거)' : '내 라이브러리에 저장')
      }</button>
      ${artifactAction}
    </div>
    ${statusBanner}
    <div class="dock-callout">
      <strong>다음 단계 (Godot Store 도크):</strong> Godot 에디터에서 <strong>새로고침</strong>을 눌러 같은 Hub 계정 라이브러리를 조회하고, 변경 검토 후 현재 프로젝트에만 적용하세요.
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
  el.list.classList.toggle('hidden', isPublisher);
  el.publisher.classList.toggle('hidden', !isPublisher);

  const items = visibleCatalog();
  if (isPublisher) renderPublisher();
  else renderCards(items);
  renderDetail(items);
}

document.addEventListener('click', (event) => {
  const tabBtn = event.target.closest('.tab');
  if (tabBtn) {
    state.tab = tabBtn.dataset.tab;
    state.statusMessage = '';
    render();
    if (state.tab === 'library') {
      refreshMyAssets();
    } else if (state.tab === 'publisher') {
      refreshPublisherDrafts();
    }
    return;
  }
  const actionBtn = event.target.closest('[data-action]');
  if (actionBtn) {
    event.stopPropagation();
    const { action, id } = actionBtn.dataset;
    if (action === 'toggle-library') toggleLibrary(id);
    else if (action === 'select-item') selectItem(id);
    return;
  }
  const card = event.target.closest('[data-card-id]');
  if (card) {
    selectItem(card.dataset.cardId);
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
  state.category = event.target.value;
  if (state.mode === 'live') {
    refreshCatalog();
  } else {
    render();
  }
});

el.kindFilter?.addEventListener('change', (event) => {
  state.kind = event.target.value;
  if (state.mode === 'live') {
    refreshCatalog();
  } else {
    render();
  }
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
