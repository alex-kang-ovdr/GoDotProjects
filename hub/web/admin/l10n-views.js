const LOCALES = ['ko', 'en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi'];
const TARGET_LOCALES = LOCALES.slice(1);
const STATUS_LABELS = {
  untranslated: '미번역',
  ai_draft: 'AI 초안',
  needs_review: '검수 대기',
  approved: '승인',
  stale: '원문 변경',
  archived: '보관'
};
const STATUS_TONE = {
  untranslated: 'muted',
  ai_draft: 'info',
  needs_review: 'warn',
  approved: 'ok',
  stale: 'danger',
  archived: 'muted'
};

const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const raw = (tag, text, className) => {
  const node = el(tag, text, className);
  node.dataset.noTranslate = '';
  node.translate = false;
  return node;
};
const pill = (text, tone = 'muted', noTranslate = false) =>
  (noTranslate ? raw : el)('span', text, `pill ${tone}`);

function panel(eyebrow, title, rightNode) {
  const sec = el('section', '', 'panel');
  const head = el('div', '', 'section-heading');
  const left = el('div', '');
  if (eyebrow) left.append(el('p', eyebrow, 'eyebrow'));
  left.append(el('h2', title));
  head.append(left);
  if (rightNode) head.append(rightNode);
  sec.append(head);
  return sec;
}

export function createL10nController({ api, apiBase, number, percent, kstStamp, notice, onNavigate, onBadgesChanged, onAuthError }) {
  const state = {
    overview: null,
    strings: null,
    stringFilter: { namespace: '', status: 'all', locale: 'all', q: '', offset: 0 },
    selectedKey: null,
    checkedKeys: new Set(),
    gatherResult: null,
    glossary: [],
    prompts: [],
    media: null,
    releases: [],
    lastAiResult: null
  };

  async function safeCall(fn) {
    try { return await fn(); }
    catch (error) {
      if (!onAuthError(error)) notice(error.message || 'L10N 요청에 실패했습니다.', true);
      return null;
    }
  }

  async function loadView(view) {
    if (view === 'overview') {
      const data = await safeCall(() => api('/api/admin/l10n/overview'));
      if (data) { state.overview = data; renderOverview(); }
    } else if (view === 'strings') {
      const [ov, list, prompts] = await Promise.all([
        safeCall(() => api('/api/admin/l10n/overview')),
        safeCall(() => fetchStrings()),
        safeCall(() => api('/api/admin/l10n/prompts'))
      ]);
      if (ov) state.overview = ov;
      if (prompts) state.prompts = prompts.items || [];
      if (list) { state.strings = list; renderStrings(); }
    } else if (view === 'gather') {
      renderGather();
    } else if (view === 'ai') {
      const [ov, prompts, list] = await Promise.all([
        safeCall(() => api('/api/admin/l10n/overview')),
        safeCall(() => api('/api/admin/l10n/prompts')),
        safeCall(() => api('/api/admin/l10n/strings?limit=50'))
      ]);
      if (ov) state.overview = ov;
      if (prompts) state.prompts = prompts.items || [];
      if (list) state.strings = list;
      renderAi();
    } else if (view === 'glossary') {
      const res = await safeCall(() => api('/api/admin/l10n/glossary'));
      if (res) { state.glossary = res.items || []; renderGlossary(); }
    } else if (view === 'media') {
      const res = await safeCall(() => api('/api/admin/l10n/media'));
      if (res) { state.media = res; renderMedia(); }
    } else if (view === 'releases') {
      const [ov, rel] = await Promise.all([
        safeCall(() => api('/api/admin/l10n/overview')),
        safeCall(() => api('/api/admin/l10n/releases'))
      ]);
      if (ov) state.overview = ov;
      if (rel) state.releases = rel.releases || [];
      renderReleases();
    }
  }

  function fetchStrings() {
    const f = state.stringFilter;
    const params = new URLSearchParams({ status: f.status, locale: f.locale, offset: String(f.offset), limit: '25' });
    if (f.namespace) params.set('namespace', f.namespace);
    if (f.q) params.set('q', f.q);
    return api('/api/admin/l10n/strings?' + params.toString());
  }

  // 1. OVERVIEW
  function renderOverview() {
    const container = document.getElementById('l10n-overview-panel');
    const d = state.overview;
    if (!d) return;
    const p1 = panel('PLATFORM L10N', '플랫폼 사이트 다국어 현황 (Hub · Admin 범위)');
    const kpis = el('div', '', 'metrics four');
    for (const [label, val, detail] of [
      ['관리 키 (LOCTEXT)', number(d.totalKeys), `미사용 유예 ${number(d.unusedKeys)}개 · 네임스페이스 ${number(d.namespaces?.length || 0)}개`],
      ['검수·재번역 대기', number(d.pendingReview), `차단 Lint 오류 ${number(d.lintBlocks)}건`],
      ['단어집 · 프롬프트', `${number(d.glossaryCount)} / ${number(d.promptCount)}`, 'Glossary·DNT / 상황별 프롬프트'],
      ['활성 릴리스 · 이미지', d.activeRelease ? d.activeRelease.tag : '미발행', `다국어 이미지 ${number(d.mediaAssets)} / ${number(d.mediaSlots * LOCALES.length)} 슬롯`]
    ]) {
      const card = el('div', '', 'metric');
      card.append(el('small', label), raw('strong', String(val)), el('p', detail));
      kpis.append(card);
    }

    const bars = el('div', '', 'l10n-coverage-grid');
    for (const loc of TARGET_LOCALES) {
      const s = d.byLocale?.[loc] || { approved: 0, total: 0, approvedRate: 0, ai_draft: 0, stale: 0, untranslated: 0 };
      const card = el('div', '', 'funnel-item');
      const head = el('div', '', 'funnel-value');
      head.append(raw('strong', loc), raw('span', percent(s.approvedRate)));
      const bar = el('div', '', 'bar');
      const fill = document.createElement('span');
      fill.style.width = `${Math.round((s.approvedRate || 0) * 100)}%`;
      bar.append(fill);
      card.append(head, bar, el('p', `승인 ${number(s.approved)} · 초안 ${number(s.ai_draft)} · Stale ${number(s.stale)} · 미번역 ${number(s.untranslated)}`, 'muted'));
      bars.append(card);
    }

    const nav = el('div', '', 'inline-actions');
    for (const [label, view, primary] of [
      ['스트링 테이블 열기', 'strings', true],
      ['텍스트 수집(Gather)', 'gather', false],
      ['AI 번역 · 프롬프트', 'ai', false],
      ['단어집(Glossary)', 'glossary', false],
      ['다국어 이미지', 'media', false],
      ['릴리스·롤백', 'releases', false]
    ]) {
      const btn = el('button', label, primary ? 'primary' : 'quiet');
      btn.type = 'button';
      btn.addEventListener('click', () => onNavigate('l10n', view));
      nav.append(btn);
    }
    p1.append(kpis, el('div', '', 'panel-foot'), bars, el('div', '', 'panel-foot'), nav);
    p1.append(el('p', '적용 범위: 플랫폼 사이트(hub/web/user, hub/web/admin, hub/shared). Godot 에디터와 개별 게임은 별도 관리 예정입니다.', 'panel-foot'));
    container.replaceChildren(p1);
  }

  // 2. STRINGS TABLE (LOCTEXT Split Pane)
  function renderStrings() {
    const container = document.getElementById('l10n-strings-panel');
    const data = state.strings;
    if (!data) return;

    const topActions = el('div', '', 'inline-actions');
    const addBtn = el('button', '+ 새 키 추가', 'primary');
    addBtn.type = 'button';
    addBtn.dataset.testid = 'l10n-add-key-toggle';
    const exportCsv = el('a', 'CSV 내보내기', 'quiet');
    exportCsv.href = apiBase + '/api/admin/l10n/strings/export?format=csv';
    exportCsv.target = '_blank';
    exportCsv.rel = 'noopener';
    topActions.append(exportCsv, addBtn);

    const p1 = panel('LOCTEXT STRING TABLE', `통합 스트링 테이블 (총 ${number(data.total)}키)`, topActions);

    // Add Key Inline Form
    const addForm = el('form', '', 'metrics-filters');
    addForm.hidden = true;
    addForm.dataset.testid = 'l10n-add-key-form';
    const fKey = el('label', 'LOCTEXT 키 (ns.key)');
    const iKey = document.createElement('input'); iKey.required = true; iKey.placeholder = 'portal.banner.welcome'; fKey.append(iKey);
    const fSrc = el('label', '기준 원문 (ko)');
    const iSrc = document.createElement('input'); iSrc.required = true; iSrc.placeholder = '환영합니다'; fSrc.append(iSrc);
    const fCtx = el('label', '상황 (Context)');
    const iCtx = document.createElement('select');
    for (const ctx of ['general', 'ui.button', 'ui.nav', 'feedback.error', 'creator.review', 'marketing.banner']) iCtx.append(new Option(ctx, ctx));
    fCtx.append(iCtx);
    const fMax = el('label', '최대 글자수');
    const iMax = document.createElement('input'); iMax.type = 'number'; iMax.min = '1'; iMax.max = '2000'; iMax.placeholder = '선택'; fMax.append(iMax);
    const fSub = el('button', '키 생성', 'primary'); fSub.type = 'submit';
    addForm.append(fKey, fSrc, fCtx, fMax, fSub);
    addBtn.addEventListener('click', () => { addForm.hidden = !addForm.hidden; });
    addForm.addEventListener('submit', async event => {
      event.preventDefault();
      const created = await safeCall(() => api('/api/admin/l10n/strings', {
        method: 'POST',
        body: { key: iKey.value.trim(), sourceText: iSrc.value.trim(), contextId: iCtx.value, maxChars: iMax.value ? Number(iMax.value) : null }
      }));
      if (created) {
        notice(`새 L10N 키 '${created.key}'를 생성했습니다.`);
        state.selectedKey = created.key;
        state.stringFilter.offset = 0;
        addForm.reset(); addForm.hidden = true;
        onBadgesChanged();
        await loadView('strings');
      }
    });

    // Filters
    const filterForm = el('form', '', 'metrics-filters');
    const lNs = el('label', '네임스페이스');
    const sNs = document.createElement('select');
    sNs.append(new Option('전체 네임스페이스', ''));
    for (const ns of state.overview?.namespaces || []) sNs.append(new Option(`${ns.namespace} (${ns.count})`, ns.namespace));
    sNs.value = state.stringFilter.namespace;
    lNs.append(sNs);

    const lSt = el('label', '상태');
    const sSt = document.createElement('select');
    for (const [v, lbl] of [['all', '전체'], ['untranslated', '미번역'], ['ai_draft', 'AI 초안'], ['needs_review', '검수 대기'], ['approved', '승인'], ['stale', '원문 변경(Stale)'], ['lint_error', 'Lint 오류'], ['unused', '미사용']]) {
      sSt.append(new Option(lbl, v));
    }
    sSt.value = state.stringFilter.status;
    lSt.append(sSt);

    const lLoc = el('label', '언어');
    const sLoc = document.createElement('select');
    sLoc.append(new Option('전체 언어', 'all'));
    for (const loc of TARGET_LOCALES) sLoc.append(new Option(loc, loc));
    sLoc.value = state.stringFilter.locale;
    lLoc.append(sLoc);

    const lQ = el('label', '검색');
    lQ.className = 'game-filter';
    const iQ = document.createElement('input');
    iQ.type = 'search'; iQ.placeholder = '키, 한국어 원문 또는 번역문'; iQ.value = state.stringFilter.q;
    lQ.append(iQ);

    const applyBtn = el('button', '조회', 'primary'); applyBtn.type = 'submit';
    filterForm.append(lNs, lSt, lLoc, lQ, applyBtn);
    filterForm.addEventListener('submit', async event => {
      event.preventDefault();
      state.stringFilter = { namespace: sNs.value, status: sSt.value, locale: sLoc.value, q: iQ.value.trim(), offset: 0 };
      const res = await safeCall(() => fetchStrings());
      if (res) { state.strings = res; renderStrings(); }
    });

    // Batch actions bar
    const batchBar = el('div', '', 'inline-actions');
    batchBar.style.marginTop = '10px';
    const selCount = el('span', `선택 ${state.checkedKeys.size}개`, 'muted');
    const batchLocale = document.createElement('select');
    for (const loc of TARGET_LOCALES) batchLocale.append(new Option(`대상: ${loc}`, loc));
    const batchAiBtn = el('button', '선택 키 Mock AI 번역', 'quiet');
    batchAiBtn.type = 'button';
    batchAiBtn.disabled = state.checkedKeys.size === 0;
    batchAiBtn.addEventListener('click', async () => {
      const res = await safeCall(() => api('/api/admin/l10n/ai/translate', {
        method: 'POST',
        body: { provider: 'mock', targetLocale: batchLocale.value, keys: [...state.checkedKeys] }
      }));
      if (res) {
        notice(`${res.results.length}건의 ${res.targetLocale} AI 초안을 생성했습니다.`);
        onBadgesChanged();
        await loadView('strings');
      }
    });
    const batchApproveBtn = el('button', '선택 키 일괄 승인', 'quiet');
    batchApproveBtn.type = 'button';
    batchApproveBtn.disabled = state.checkedKeys.size === 0;
    batchApproveBtn.addEventListener('click', async () => {
      const res = await safeCall(() => api('/api/admin/l10n/strings/approve', {
        method: 'POST',
        body: { keys: [...state.checkedKeys] }
      }));
      if (res) {
        notice(`승인 ${res.approved}건 완료${res.blocked?.length ? ` (Lint 차단 ${res.blocked.length}건)` : ''}`);
        onBadgesChanged();
        await loadView('strings');
      }
    });
    batchBar.append(selCount, batchLocale, batchAiBtn, batchApproveBtn);

    // Split workspace: left table, right detail editor
    const workspace = el('div', '', 'l10n-workspace');
    const leftPane = el('div', '', 'l10n-table-pane');
    const wrap = el('div', '', 'table-wrap');
    const table = el('table', '');
    const thead = el('thead', '');
    const hr = el('tr', '');
    for (const h of ['선택', 'LOCTEXT 키 / 원문 (ko)', 'en', 'ja', '상태']) hr.append(el('th', h));
    thead.append(hr);
    const tbody = el('tbody', '');

    if (!data.items.length) {
      const tr = el('tr', '');
      const td = el('td', '조건에 맞는 키가 없습니다.', 'empty'); td.colSpan = 5; tr.append(td); tbody.append(tr);
    } else {
      if (!data.items.some(i => i.key === state.selectedKey)) state.selectedKey = data.items[0].key;
      for (const item of data.items) {
        const tr = el('tr', '');
        if (item.key === state.selectedKey) tr.className = 'l10n-row-selected';
        const tdCb = el('td', '');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.checkedKeys.has(item.key);
        cb.addEventListener('change', () => {
          if (cb.checked) state.checkedKeys.add(item.key); else state.checkedKeys.delete(item.key);
          selCount.textContent = `선택 ${state.checkedKeys.size}개`;
          batchAiBtn.disabled = batchApproveBtn.disabled = state.checkedKeys.size === 0;
        });
        tdCb.append(cb);

        const tdKey = el('td', '');
        const btn = el('button', '', 'l10n-key-btn');
        btn.type = 'button';
        btn.append(raw('strong', item.key), raw('small', item.sourceText));
        btn.addEventListener('click', () => { state.selectedKey = item.key; renderStrings(); });
        tdKey.append(btn);

        const enVal = item.translations.en?.value || '—';
        const jaVal = item.translations.ja?.value || '—';
        const statuses = TARGET_LOCALES.map(l => item.translations[l]?.status || 'untranslated');
        const primaryStatus = statuses.includes('stale') ? 'stale' : statuses.includes('ai_draft') ? 'ai_draft' : statuses.includes('needs_review') ? 'needs_review' : statuses.every(s => s === 'approved') ? 'approved' : 'untranslated';

        tr.append(tdCb, tdKey, raw('td', enVal), raw('td', jaVal), el('td', ''));
        tr.lastChild.append(pill(STATUS_LABELS[primaryStatus] || primaryStatus, STATUS_TONE[primaryStatus] || 'muted'));
        tbody.append(tr);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);

    const pager = el('div', '', 'community-pagination');
    const prevBtn = el('button', '이전', 'quiet'); prevBtn.type = 'button'; prevBtn.disabled = data.offset === 0;
    const nextBtn = el('button', '다음', 'quiet'); nextBtn.type = 'button'; nextBtn.disabled = !data.hasMore;
    prevBtn.addEventListener('click', async () => { state.stringFilter.offset = Math.max(0, data.offset - 25); state.strings = await safeCall(() => fetchStrings()); renderStrings(); });
    nextBtn.addEventListener('click', async () => { state.stringFilter.offset = data.offset + 25; state.strings = await safeCall(() => fetchStrings()); renderStrings(); });
    pager.append(prevBtn, raw('span', `${data.offset + 1}–${data.offset + data.items.length} / ${data.total}`, 'muted'), nextBtn);
    leftPane.append(wrap, pager);

    // Right Detail Editor
    const rightPane = el('div', '', 'review-detail-pane');
    const selected = data.items.find(i => i.key === state.selectedKey);
    if (!selected) {
      rightPane.append(el('p', '왼쪽 테이블에서 편집할 키를 선택하세요.', 'empty'));
    } else {
      rightPane.append(renderStringDetail(selected));
    }

    workspace.append(leftPane, rightPane);
    p1.append(addForm, filterForm, batchBar, workspace);
    container.replaceChildren(p1);
  }

  function renderStringDetail(item) {
    const box = el('div', '');
    const head = el('div', '', 'section-heading');
    const left = el('div', '');
    left.append(raw('h3', item.key), raw('p', `네임스페이스: ${item.namespace} · rev ${item.revision}${item.codeRefs?.length ? ' · ' + item.codeRefs.join(', ') : ''}`, 'muted'));
    head.append(left, pill(item.contextId, 'info', true));
    box.append(head);

    const form = document.createElement('form');
    const metaGrid = el('div', '', 'l10n-meta-grid');
    const lSrc = el('label', '기준 원문 (ko)');
    const iSrc = document.createElement('textarea'); iSrc.rows = 2; iSrc.value = item.sourceText; lSrc.append(iSrc);
    const lCtx = el('label', '상황 (Context)');
    const iCtx = document.createElement('select');
    for (const c of ['general', 'ui.button', 'ui.nav', 'feedback.error', 'creator.review', 'marketing.banner']) iCtx.append(new Option(c, c));
    iCtx.value = item.contextId || 'general'; lCtx.append(iCtx);
    const lMax = el('label', '최대 글자수');
    const iMax = document.createElement('input'); iMax.type = 'number'; iMax.value = item.maxChars ?? ''; lMax.append(iMax);
    metaGrid.append(lSrc, lCtx, lMax);
    form.append(metaGrid);

    const inputs = new Map();
    for (const loc of TARGET_LOCALES) {
      const tr = item.translations[loc] || { value: '', status: 'untranslated', lint: [] };
      const row = el('div', '', 'l10n-locale-row');
      const rHead = el('div', '', 'activity-head');
      rHead.append(raw('strong', loc), pill(STATUS_LABELS[tr.status] || tr.status, STATUS_TONE[tr.status] || 'muted'));
      const inp = document.createElement('input');
      inp.value = tr.value || '';
      inp.dataset.l10nEditLocale = loc;
      const stSel = document.createElement('select');
      for (const st of ['untranslated', 'ai_draft', 'needs_review', 'approved', 'stale']) stSel.append(new Option(STATUS_LABELS[st], st));
      stSel.value = tr.status || 'untranslated';
      const controls = el('div', '', 'l10n-locale-inputs');
      controls.append(inp, stSel);
      row.append(rHead, controls);
      if (tr.lint?.length) {
        for (const issue of tr.lint) {
          row.append(el('p', `[${issue.severity}] ${issue.message}`, issue.severity === 'block' ? 'form-error' : 'muted'));
        }
      }
      inputs.set(loc, { inp, stSel });
      form.append(row);
    }

    const footer = el('div', '', 'inline-actions');
    footer.style.marginTop = '12px';
    const saveBtn = el('button', '변경 저장', 'primary'); saveBtn.type = 'submit'; saveBtn.dataset.testid = 'l10n-save-string';
    const aiOneBtn = el('button', 'en AI 초안 생성 (Mock)', 'quiet'); aiOneBtn.type = 'button';
    aiOneBtn.addEventListener('click', async () => {
      const res = await safeCall(() => api('/api/admin/l10n/ai/translate', { method: 'POST', body: { provider: 'mock', targetLocale: 'en', keys: [item.key], contextId: iCtx.value } }));
      if (res) { notice(`'${item.key}'의 en AI 초안을 생성했습니다.`); onBadgesChanged(); await loadView('strings'); }
    });
    footer.append(saveBtn, aiOneBtn);
    form.append(footer);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const translations = {};
      for (const [loc, { inp, stSel }] of inputs) {
        translations[loc] = { value: inp.value, status: stSel.value };
      }
      const res = await safeCall(() => api(`/api/admin/l10n/strings/${encodeURIComponent(item.key)}`, {
        method: 'PUT',
        body: { revision: item.revision, sourceText: iSrc.value, contextId: iCtx.value, maxChars: iMax.value ? Number(iMax.value) : null, translations }
      }));
      if (res) {
        notice(`'${item.key}' 변경을 저장했습니다.`);
        onBadgesChanged();
        await loadView('strings');
      }
    });
    box.append(form);
    return box;
  }

  // 3. GATHER & LINT
  function renderGather() {
    const container = document.getElementById('l10n-gather-panel');
    const btns = el('div', '', 'inline-actions');
    const dryBtn = el('button', '수집 미리보기 (Dry-Run)', 'quiet'); dryBtn.type = 'button'; dryBtn.dataset.testid = 'l10n-gather-dry';
    const applyBtn = el('button', '수집 실행 및 테이블 반영', 'primary'); applyBtn.type = 'button'; applyBtn.dataset.testid = 'l10n-gather-apply';
    btns.append(dryBtn, applyBtn);

    const p1 = panel('TEXT GATHERING (UNREAL LOCTEXT)', '플랫폼 소스 텍스트 수집 및 Diff 검사', btns);
    p1.append(el('p', 'hub/web/user, hub/web/admin, hub/shared의 data-l10n 속성 및 t()/LOCTEXT() 호출을 스캔합니다. 원문이 바뀐 키는 기존 번역을 삭제하지 않고 stale로 표시합니다.', 'muted'));

    dryBtn.addEventListener('click', async () => {
      const res = await safeCall(() => api('/api/admin/l10n/gather', { method: 'POST', body: { apply: false } }));
      if (res) { state.gatherResult = res; renderGather(); }
    });
    applyBtn.addEventListener('click', async () => {
      const res = await safeCall(() => api('/api/admin/l10n/gather', { method: 'POST', body: { apply: true } }));
      if (res) {
        state.gatherResult = res;
        notice(res.applied ? `수집 결과를 반영했습니다 (신규 ${res.counts.added}, 변경 ${res.counts.changed}, 미사용 ${res.counts.unused}).` : '충돌 키가 있어 반영을 중단했습니다.', !res.applied);
        onBadgesChanged();
        renderGather();
      }
    });

    const g = state.gatherResult;
    if (g) {
      const kpis = el('div', '', 'metrics four');
      kpis.style.marginTop = '12px';
      for (const [l, v, d] of [
        ['스캔 파일 / 수집 키', `${number(g.scannedFiles)} / ${number(g.totalGathered)}`, g.applied ? '반영 완료' : '미리보기(Dry-Run)'],
        ['신규 키', number(g.counts.added), 'untranslated 등록 대상'],
        ['원문 변경 (Stale)', number(g.counts.changed), '기존 승인 번역 재검수 필요'],
        ['미사용 / 충돌', `${number(g.counts.unused)} / ${number(g.counts.conflicts)}`, g.counts.conflicts ? '충돌 해소 필요' : '충돌 없음']
      ]) {
        const c = el('div', '', 'metric'); c.append(el('small', l), raw('strong', String(v)), el('p', d)); kpis.append(c);
      }
      p1.append(kpis);
    }
    container.replaceChildren(p1);
  }

  // 4. AI TRANSLATION & CONTEXT PROMPTS
  function renderAi() {
    const container = document.getElementById('l10n-ai-panel');
    const providers = state.overview?.ai?.providers || [];

    const p1 = panel('AI PROVIDERS', 'AI 번역 공급자 연동 상태 (Gemini · OpenAI 호환 · Mock)');
    const grid = el('div', '', 'metrics');
    for (const pr of providers) {
      const c = el('div', '', 'metric');
      c.append(el('small', pr.label), pill(pr.configured ? '사용 가능' : 'API 키 미설정', pr.configured ? 'ok' : 'muted'), el('p', `기본 모델: ${pr.defaultModel}${pr.baseUrl ? ' · ' + pr.baseUrl : ''}`));
      grid.append(c);
    }
    p1.append(grid, el('p', 'API 키는 서버 환경변수(PLAYHUB_L10N_GEMINI_API_KEY, PLAYHUB_L10N_OPENAI_API_KEY)에서만 읽으며 브라우저로 전달하지 않습니다. AI 결과는 항상 ai_draft 상태로 저장됩니다.', 'panel-foot'));

    // Batch Translator
    const p2 = panel('CONTEXT-AWARE AI TRANSLATOR', '상황별 프롬프트 적용 AI 번역 실행');
    const runForm = el('form', '', 'metrics-filters');
    const lProv = el('label', '공급자');
    const sProv = document.createElement('select');
    for (const pr of providers) sProv.append(new Option(pr.label, pr.id));
    sProv.value = 'mock'; lProv.append(sProv);

    const lLoc = el('label', '대상 언어');
    const sLoc = document.createElement('select');
    for (const loc of TARGET_LOCALES) sLoc.append(new Option(loc, loc));
    lLoc.append(sLoc);

    const lPr = el('label', '상황별 프롬프트');
    const sPr = document.createElement('select');
    for (const pr of state.prompts) sPr.append(new Option(`${pr.name} (${pr.contextId})`, pr.id));
    lPr.append(sPr);

    const lKeys = el('label', '대상 키 (쉼표 구분)');
    lKeys.className = 'game-filter';
    const iKeys = document.createElement('input');
    iKeys.value = (state.strings?.items || []).slice(0, 3).map(i => i.key).join(', ');
    lKeys.append(iKeys);

    const goBtn = el('button', 'AI 초안 생성', 'primary'); goBtn.type = 'submit'; goBtn.dataset.testid = 'l10n-ai-run';
    runForm.append(lProv, lLoc, lPr, lKeys, goBtn);
    runForm.addEventListener('submit', async event => {
      event.preventDefault();
      const keys = iKeys.value.split(',').map(s => s.trim()).filter(Boolean);
      const res = await safeCall(() => api('/api/admin/l10n/ai/translate', {
        method: 'POST',
        body: { provider: sProv.value, targetLocale: sLoc.value, promptId: sPr.value, keys }
      }));
      if (res) {
        state.lastAiResult = res;
        notice(`${res.provider}(${res.model})로 ${res.results.length}건의 ${res.targetLocale} AI 초안을 생성했습니다.`);
        onBadgesChanged();
        renderAi();
      }
    });
    p2.append(runForm);

    if (state.lastAiResult) {
      const r = state.lastAiResult;
      const out = el('div', '', 'sub-card');
      out.style.marginTop = '12px';
      out.append(el('h3', `최근 생성된 AI 초안 (${r.provider} · ${r.model} · ${r.targetLocale})`));
      for (const row of r.results || []) {
        const line = el('div', '', 'activity');
        line.append(raw('strong', `${row.key}: ${row.sourceText} → ${row.translated}`), pill(row.status, 'info', true));
        out.append(line);
      }
      if (r.promptPreview) {
        const det = document.createElement('details');
        det.append(el('summary', '합성된 시스템 프롬프트(단어집·DNT·상황 규칙 포함) 보기'), raw('pre', r.promptPreview, 'l10n-pre'));
        out.append(det);
      }
      p2.append(out);
    }

    // Context Prompt Profiles List & Editor
    const p3 = panel('CONTEXT PROMPT PROFILES', '상황별 단어 선택 AI 프롬프트 관리');
    const pForm = el('form', '', 'l10n-prompt-form');
    const pName = document.createElement('input'); pName.placeholder = '프로파일 이름 (예: 이벤트 배너)'; pName.required = true;
    const pCtx = document.createElement('input'); pCtx.placeholder = '상황 ID (예: event.banner)'; pCtx.required = true;
    const pSys = document.createElement('textarea'); pSys.rows = 2; pSys.placeholder = '상황별 번역 지침 시스템 프롬프트'; pSys.required = true;
    const pSave = el('button', '프롬프트 프로파일 저장', 'quiet'); pSave.type = 'submit';
    pForm.append(pName, pCtx, pSys, pSave);
    pForm.addEventListener('submit', async event => {
      event.preventDefault();
      const res = await safeCall(() => api('/api/admin/l10n/prompts', { method: 'POST', body: { name: pName.value, contextId: pCtx.value, systemPrompt: pSys.value } }));
      if (res) { notice('상황별 프롬프트 프로파일을 저장했습니다.'); await loadView('ai'); }
    });
    const list = el('div', '', 'card-grid');
    list.style.marginTop = '12px';
    for (const pr of state.prompts) {
      const card = el('div', '', 'sub-card');
      const hd = el('div', '', 'activity-head');
      hd.append(el('h3', pr.name), pill(pr.contextId, 'info', true));
      card.append(hd, raw('p', pr.systemPrompt));
      if (pr.disambiguation?.length) {
        const rules = pr.disambiguation.map(d => `${d.source}(${d.locale || 'all'}) → ${d.prefer}`).join(' · ');
        card.append(raw('p', `동음이의어 규칙: ${rules}`));
      }
      list.append(card);
    }
    p3.append(pForm, list);
    container.replaceChildren(p1, p2, p3);
  }

  // 5. GLOSSARY & DNT
  function renderGlossary() {
    const container = document.getElementById('l10n-glossary-panel');
    const p1 = panel('GLOSSARY & DO-NOT-TRANSLATE', `단어집 및 번역 금지 목록 (${number(state.glossary.length)}건)`);
    const form = el('form', '', 'metrics-filters');
    const lKo = el('label', '기준 용어 (ko)'); const iKo = document.createElement('input'); iKo.required = true; iKo.placeholder = '예: 창작자 대시보드'; lKo.append(iKo);
    const lEn = el('label', '표준 영문 (en)'); const iEn = document.createElement('input'); iEn.placeholder = 'Creator dashboard'; lEn.append(iEn);
    const lJa = el('label', '표준 일본어 (ja)'); const iJa = document.createElement('input'); iJa.placeholder = 'クリエイターダッシュボード'; lJa.append(iJa);
    const lDnt = el('label', '유형'); const sDnt = document.createElement('select'); sDnt.append(new Option('표준 용어', 'term'), new Option('번역 금지 (DNT)', 'dnt')); lDnt.append(sDnt);
    const addBtn = el('button', '용어 추가', 'primary'); addBtn.type = 'submit';
    form.append(lKo, lEn, lJa, lDnt, addBtn);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const res = await safeCall(() => api('/api/admin/l10n/glossary', {
        method: 'POST',
        body: { termKo: iKo.value, termEn: iEn.value, isDnt: sDnt.value === 'dnt', translations: { ...(iEn.value ? { en: iEn.value } : {}), ...(iJa.value ? { ja: iJa.value } : {}) } }
      }));
      if (res) { notice('단어집 항목을 추가했습니다.'); await loadView('glossary'); }
    });

    const wrap = el('div', '', 'table-wrap');
    wrap.style.marginTop = '12px';
    const table = el('table', '');
    const thead = el('thead', '');
    const hr = el('tr', '');
    for (const h of ['구분', '기준 용어', '표준 번역 (en / ja)', '금지 오역 / 메모', '관리']) hr.append(el('th', h));
    thead.append(hr);
    const tbody = el('tbody', '');
    for (const g of state.glossary) {
      const tr = el('tr', '');
      const tdType = el('td', ''); tdType.append(pill(g.isDnt ? 'DNT (번역 금지)' : '표준 용어', g.isDnt ? 'warn' : 'ok'));
      const tdDel = el('td', '');
      const del = el('button', '삭제', 'toggle'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (await safeCall(() => api(`/api/admin/l10n/glossary/${encodeURIComponent(g.id)}`, { method: 'DELETE', body: {} }))) {
          notice(`'${g.termKo}' 용어를 삭제했습니다.`);
          await loadView('glossary');
        }
      });
      tdDel.append(del);
      tr.append(
        tdType,
        raw('td', g.termKo),
        raw('td', g.isDnt ? '(원형 유지)' : `${g.translations?.en || g.termEn || '—'} / ${g.translations?.ja || '—'}`),
        raw('td', `${g.forbidden?.length ? '금지: ' + g.forbidden.join(', ') + ' · ' : ''}${g.notes || ''}`),
        tdDel
      );
      tbody.append(tr);
    }
    table.append(thead, tbody);
    wrap.append(table);
    p1.append(form, wrap);
    container.replaceChildren(p1);
  }

  // 6. LOCALIZED MEDIA MATRIX
  function renderMedia() {
    const container = document.getElementById('l10n-media-panel');
    const m = state.media;
    if (!m) return;
    const p1 = panel('LOCALIZED MEDIA ASSETS', '플랫폼 사이트 다국어 이미지 교체 관리 (Slot × 8개 언어)');
    const slotForm = el('form', '', 'metrics-filters');
    const lKey = el('label', '슬롯 키 (img.*)'); const iKey = document.createElement('input'); iKey.required = true; iKey.placeholder = 'img.portal.event_banner'; lKey.append(iKey);
    const lDesc = el('label', '설명'); const iDesc = document.createElement('input'); iDesc.placeholder = '이벤트 상단 배너'; lDesc.append(iDesc);
    const lAlt = el('label', 'alt 스트링 키'); const iAlt = document.createElement('input'); iAlt.placeholder = 'portal.event.banner_alt'; lAlt.append(iAlt);
    const addSlot = el('button', '+ 슬롯 추가', 'primary'); addSlot.type = 'submit';
    slotForm.append(lKey, lDesc, lAlt, addSlot);
    slotForm.addEventListener('submit', async event => {
      event.preventDefault();
      const res = await safeCall(() => api('/api/admin/l10n/media/slots', { method: 'POST', body: { slotKey: iKey.value, description: iDesc.value, altTextKey: iAlt.value || null } }));
      if (res) { notice(`이미지 슬롯 '${res.slotKey}'를 저장했습니다.`); await loadView('media'); }
    });
    p1.append(slotForm);

    for (const slot of m.slots || []) {
      const card = el('div', '', 'sub-card');
      card.style.marginTop = '14px';
      const hd = el('div', '', 'section-heading');
      const left = el('div', '');
      left.append(raw('h3', slot.slotKey), el('p', `${slot.description || '—'}${slot.width ? ` · 권장 ${slot.width}×${slot.height}` : ''}${slot.altTextKey ? ` · alt 키: ${slot.altTextKey}` : ''}`));
      hd.append(left, raw('span', `최대 ${Math.round((slot.maxBytes || 1048576) / 1024)} KiB · ${(slot.allowedFormats || []).join('/')}`, 'muted'));
      card.append(hd);

      const grid = el('div', '', 'l10n-media-grid');
      for (const loc of LOCALES) {
        const asset = slot.assets?.[loc];
        const cell = el('div', '', 'l10n-media-cell');
        const fallbackLoc = !asset ? (slot.assets?.en ? 'en' : slot.assets?.ko ? 'ko' : null) : null;
        const cHead = el('div', '', 'activity-head');
        cHead.append(raw('strong', loc), asset ? pill('전용', 'ok') : fallbackLoc ? pill(`Fallback(${fallbackLoc})`, 'info') : pill('미등록', 'muted'));
        cell.append(cHead);
        const previewAsset = asset || (fallbackLoc ? slot.assets[fallbackLoc] : null);
        if (previewAsset) {
          const img = document.createElement('img');
          img.src = apiBase + previewAsset.adminUrl;
          img.alt = `${slot.slotKey} (${loc})`;
          img.className = 'l10n-media-thumb' + (asset ? '' : ' is-fallback');
          cell.append(img);
        } else {
          cell.append(el('div', '이미지 없음', 'l10n-media-empty'));
        }
        const upLabel = el('label', '교체 업로드', 'toggle l10n-upload-btn');
        const upInput = document.createElement('input');
        upInput.type = 'file';
        upInput.accept = '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';
        upInput.hidden = true;
        upInput.dataset.l10nMediaUpload = `${slot.slotKey}:${loc}`;
        upInput.addEventListener('change', () => {
          const file = upInput.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = async () => {
            const res = await safeCall(() => api('/api/admin/l10n/media/assets', {
              method: 'POST',
              body: { slotKey: slot.slotKey, locale: loc, filename: file.name, dataBase64: String(reader.result || '') }
            }));
            if (res) { notice(`${slot.slotKey} (${loc}) 이미지를 업로드했습니다.`); await loadView('media'); }
          };
          reader.readAsDataURL(file);
        });
        upLabel.append(upInput);
        const actions = el('div', '', 'inline-actions');
        actions.append(upLabel);
        if (asset) {
          const del = el('button', '삭제', 'toggle'); del.type = 'button';
          del.addEventListener('click', async () => {
            if (await safeCall(() => api(`/api/admin/l10n/media/assets/${encodeURIComponent(slot.slotKey)}/${encodeURIComponent(loc)}`, { method: 'DELETE', body: {} }))) {
              notice(`${slot.slotKey} (${loc}) 이미지를 제거했습니다.`); await loadView('media');
            }
          });
          actions.append(del);
        }
        cell.append(actions);
        grid.append(cell);
      }
      card.append(grid);
      p1.append(card);
    }
    p1.append(el('p', '보안 검증: 매직 바이트(PNG/JPG/WebP/SVG), 최대 1 MiB, SVG 내 스크립트·외부 URL 차단이 자동 적용됩니다.', 'panel-foot'));
    container.replaceChildren(p1);
  }

  // 7. RELEASES (Hybrid Versioning + Rollback + Repo Export)
  function renderReleases() {
    const container = document.getElementById('l10n-releases-panel');
    const p1 = panel('HYBRID VERSIONING & RELEASES', 'L10N 불변 릴리스 스냅샷 발행 · Export · 롤백');
    const form = el('form', '', 'metrics-filters');
    const lNote = el('label', '릴리스 메모');
    lNote.className = 'game-filter';
    const iNote = document.createElement('input'); iNote.placeholder = '예: 11월 3주차 플랫폼 UI 8개 언어 검수 완료'; lNote.append(iNote);
    const lExp = el('label', '정적 번들 Export');
    const sExp = document.createElement('select');
    sExp.append(new Option('스냅샷만 발행 (SQLite)', 'no'), new Option('l10n-bundle.json · locale-data.js 동시 출력', 'yes'));
    lExp.append(sExp);
    const pubBtn = el('button', '새 불변 릴리스 발행', 'primary'); pubBtn.type = 'submit'; pubBtn.dataset.testid = 'l10n-publish-release';
    form.append(lNote, lExp, pubBtn);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const res = await safeCall(() => api('/api/admin/l10n/releases', {
        method: 'POST',
        body: { notes: iNote.value, exportToRepo: sExp.value === 'yes' }
      }));
      if (res) {
        notice(`불변 릴리스 ${res.release.tag}를 발행했습니다 (키 ${res.release.keyCount}개, 이미지 ${res.release.mediaCount}개).`);
        onBadgesChanged();
        await loadView('releases');
      }
    });

    const wrap = el('div', '', 'table-wrap');
    wrap.style.marginTop = '14px';
    const table = el('table', '');
    const thead = el('thead', '');
    const hr = el('tr', '');
    for (const h of ['버전 태그', '상태', '키 / 이미지', 'SHA-256', '메모', '발행 시각', '관리']) hr.append(el('th', h));
    thead.append(hr);
    const tbody = el('tbody', '');
    if (!state.releases.length) {
      const tr = el('tr', ''); const td = el('td', '아직 발행된 L10N 릴리스가 없습니다.', 'empty'); td.colSpan = 7; tr.append(td); tbody.append(tr);
    } else {
      for (const rel of state.releases) {
        const tr = el('tr', '');
        const tdSt = el('td', ''); tdSt.append(rel.isActive ? pill('활성 버전', 'ok') : pill('이전 스냅샷', 'muted'));
        const tdAct = el('td', '');
        const rb = el('button', rel.isActive ? '현재 활성' : '이 버전으로 롤백', 'toggle');
        rb.type = 'button'; rb.disabled = rel.isActive;
        rb.addEventListener('click', async () => {
          if (await safeCall(() => api(`/api/admin/l10n/releases/${rel.version}/activate`, { method: 'POST', body: {} }))) {
            notice(`활성 L10N 릴리스를 ${rel.tag}로 전환했습니다.`);
            await loadView('releases');
          }
        });
        tdAct.append(rb);
        tr.append(
          raw('td', rel.tag),
          tdSt,
          raw('td', `${number(rel.keyCount)} / ${number(rel.mediaCount)}`),
          raw('td', `${rel.sha256Prefix}…`),
          raw('td', rel.notes || '—'),
          raw('td', kstStamp(rel.createdAt)),
          tdAct
        );
        tbody.append(tr);
      }
    }
    table.append(thead, tbody);
    wrap.append(table);
    p1.append(form, wrap, el('p', '방안 C(하이브리드): 승인(approved)된 번역과 검증된 이미지만 불변 스냅샷(l10n-vN)에 포함됩니다. 미승인 AI 초안(ai_draft)은 릴리스에서 자동 제외됩니다.', 'panel-foot'));
    container.replaceChildren(p1);
  }

  return { loadView };
}
