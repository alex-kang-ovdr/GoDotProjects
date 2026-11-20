import { SAMPLE_CATALOG, PUBLISHER_DRAFTS } from './store-catalog.js';

const state = {
  tab: 'browse',
  query: '',
  kind: 'all',
  selectedId: SAMPLE_CATALOG[0].asset_id,
  savedIds: new Set()
};

const el = {
  list: document.getElementById('catalog-list'),
  publisher: document.getElementById('publisher-panel'),
  detail: document.getElementById('detail-pane'),
  libraryCount: document.getElementById('library-count'),
  search: document.getElementById('search-input'),
  kindFilter: document.getElementById('kind-filter'),
  browseControls: document.getElementById('browse-controls'),
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

function visibleCatalog() {
  const q = state.query.trim().toLowerCase();
  return SAMPLE_CATALOG.filter((item) => {
    if (state.tab === 'library' && !state.savedIds.has(item.asset_id)) return false;
    if (state.kind !== 'all' && item.release_kind !== state.kind) return false;
    if (!q) return true;
    return [item.title, item.summary, item.category, item.asset_id].some((field) =>
      String(field).toLowerCase().includes(q)
    );
  });
}

function toggleLibrary(assetId) {
  const item = SAMPLE_CATALOG.find((x) => x.asset_id === assetId);
  if (!item || item.release_kind !== 'package') return;
  if (state.savedIds.has(assetId)) state.savedIds.delete(assetId);
  else state.savedIds.add(assetId);
  state.selectedId = assetId;
  render();
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
    const selected = state.selectedId === item.asset_id ? ' selected' : '';
    const actionButton = isPackage
      ? `<button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(item.asset_id)}">${
          isSaved ? '라이브러리에 저장됨' : '내 라이브러리에 저장'
        }</button>`
      : `<button type="button" class="btn btn-secondary" data-action="select-item" data-id="${esc(item.asset_id)}">읽기</button>`;
    const stateText = isPackage
      ? (isSaved ? 'StoreLibraryEntry (프로젝트 미변경)' : `Godot ${item.engine_compatibility.godot_tested} 호환`)
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
        <span class="state-tag">${esc(stateText)}</span>
      </div>
    </article>`;
  }).join('');
}

function renderPublisher() {
  el.publisher.innerHTML = PUBLISHER_DRAFTS.map((draft) => `
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
  const active = SAMPLE_CATALOG.find((x) => x.asset_id === state.selectedId) || items[0] || SAMPLE_CATALOG[0];
  const isPackage = active.release_kind === 'package';
  const isSaved = state.savedIds.has(active.asset_id);

  if (!isPackage) {
    el.detail.innerHTML = `
      <span class="kind-pill kind-editorial">editorial · 일반 콘텐츠</span>
      <h2>${esc(active.title)}</h2>
      <p>${esc(active.summary)}</p>
      <div class="dock-callout">${active.article_body.map((line) => `<div>${esc(line)}</div>`).join('')}</div>
      <div class="dock-callout">일반 콘텐츠(<code>release_kind = editorial</code>)는 패키지 설치 대상이 아니며 빈 패키지를 생성하지 않습니다.</div>
    `;
    return;
  }

  const fileRows = active.file_manifest.map((f) => `${f.path} (${f.bytes.toLocaleString()} B)`).join(', ');
  el.detail.innerHTML = `
    <span class="kind-pill kind-package">package · v${esc(active.asset_version_id)}</span>
    <h2>${esc(active.title)}</h2>
    <p>${esc(active.summary)}</p>
    <table class="spec-table">
      <tr><th>asset_id</th><td><code>${esc(active.asset_id)}</code></td></tr>
      <tr><th>release_id</th><td><code>${esc(active.release_id)}</code></td></tr>
      <tr><th>store_state</th><td><code>${isSaved ? 'saved_to_library' : esc(active.store_state)}</code></td></tr>
      <tr><th>artifact_digest</th><td><code>${esc(shortDigest(active.artifact_digest))}</code></td></tr>
      <tr><th>engine_compatibility</th><td>Godot ${esc(active.engine_compatibility.godot_tested)} (min ${esc(active.engine_compatibility.godot_min)}) · ${esc(active.engine_compatibility.platforms.join(', '))}</td></tr>
      <tr><th>license_snapshot_ref</th><td><code>${esc(active.license_snapshot_ref)}</code></td></tr>
      <tr><th>file_manifest</th><td><code>${esc(fileRows)}</code></td></tr>
    </table>
    <button type="button" class="btn ${isSaved ? 'btn-saved' : 'btn-primary'}" data-action="toggle-library" data-id="${esc(active.asset_id)}">${
      isSaved ? '라이브러리에 저장됨 (StoreLibraryEntry)' : '내 라이브러리에 저장'
    }</button>
    <div class="dock-callout">
      <strong>다음 단계 (Godot Store 도크):</strong> Godot 에디터에서 <strong>새로고침</strong>을 눌러 같은 Hub 계정 라이브러리를 조회하고, 변경 검토 후 현재 프로젝트에만 적용하세요.
    </div>
  `;
}

function render() {
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
    render();
    return;
  }
  const actionBtn = event.target.closest('[data-action]');
  if (actionBtn) {
    event.stopPropagation();
    const { action, id } = actionBtn.dataset;
    if (action === 'toggle-library') toggleLibrary(id);
    else if (action === 'select-item') {
      state.selectedId = id;
      render();
    }
    return;
  }
  const card = event.target.closest('[data-card-id]');
  if (card) {
    state.selectedId = card.dataset.cardId;
    render();
  }
});

el.search.addEventListener('input', (event) => {
  state.query = event.target.value;
  render();
});

el.kindFilter.addEventListener('change', (event) => {
  state.kind = event.target.value;
  render();
});

render();
