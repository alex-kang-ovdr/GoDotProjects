const SUBMISSION_STATUS_LABELS = {
  in_review: '심사 대기',
  approved: '승인됨',
  rejected: '거절됨',
  changes_requested: '보류 · 수정 요청'
};

const SUBMISSION_STATUS_TONE = {
  in_review: 'warn',
  approved: 'ok',
  rejected: 'danger',
  changes_requested: 'info'
};

const PACKAGE_STATUS_LABELS = {
  published: '게시중 (published)',
  hidden: '숨김 (hidden)',
  deprecated: '지원 중단 (deprecated)',
  yanked: '킬스위치 차단 (yanked)'
};

const PACKAGE_STATUS_TONE = {
  published: 'ok',
  hidden: 'muted',
  deprecated: 'warn',
  yanked: 'danger'
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

function shortDigest(digest) {
  if (!digest) return '없음 (editorial)';
  if (digest.length <= 24) return digest;
  return `${digest.slice(0, 18)}…${digest.slice(-6)}`;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function createStoreController({ api, number, kstStamp, notice, onNavigate, onBadgesChanged, onAuthError }) {
  const state = {
    overview: null,
    submissions: [],
    counts: { total: 0, in_review: 0, approved: 0, rejected: 0, changes_requested: 0 },
    submissionFilter: { status: 'all', kind: 'all' },
    selectedSubmissionId: null,
    packageFilter: { status: 'all', q: '' },
    statusReasonDraft: '',
    activeView: 'overview',
    busy: false
  };

  function reset() {
    state.overview = null;
    state.submissions = [];
    state.selectedSubmissionId = null;
    state.statusReasonDraft = '';
    state.busy = false;
  }

  async function safeCall(fn) {
    try {
      return await fn();
    } catch (error) {
      if (!onAuthError(error)) notice(error.message || 'Store 관리 요청에 실패했습니다.', true);
      return null;
    }
  }

  function fetchOverviewAndSubmissions() {
    const subParams = new URLSearchParams({
      status: state.submissionFilter.status,
      kind: state.submissionFilter.kind
    });
    return Promise.all([
      safeCall(() => api('/api/admin/store/overview')),
      safeCall(() => api(`/api/admin/store/submissions?${subParams}`))
    ]);
  }

  async function loadView(view) {
    state.activeView = view || 'overview';
    const [ov, subs] = await fetchOverviewAndSubmissions();
    if (ov) state.overview = ov;
    if (subs) {
      state.submissions = subs.submissions || [];
      state.counts = subs.counts || state.counts;
    } else if (ov?.submissions) {
      state.submissions = ov.submissions;
    }
    if (!state.submissions.some(item => item.id === state.selectedSubmissionId)) {
      const firstPending = state.submissions.find(item => item.status === 'in_review');
      state.selectedSubmissionId = (firstPending || state.submissions[0])?.id || null;
    }
    renderCurrentView();
  }

  function renderCurrentView() {
    const view = state.activeView;
    if (view === 'submissions') {
      const container = document.getElementById('store-submissions-panel');
      if (container) container.replaceChildren(buildOverviewPanel(true), buildSubmissionsPanel());
      return;
    }
    if (view === 'packages') {
      const container = document.getElementById('store-packages-panel');
      if (container) container.replaceChildren(buildOverviewPanel(true), buildPackagesPanel(), buildAuditPanel());
      return;
    }
    const container = document.getElementById('store-overview-panel');
    if (container) container.replaceChildren(buildOverviewPanel(false), buildSubmissionsPanel(), buildPackagesPanel(), buildAuditPanel());
  }

  function buildOverviewPanel(compact) {
    const d = state.overview || {};
    const s = d.summary || {};

    const actions = el('div', '', 'inline-actions');
    if (!compact) {
      const subBtn = el('button', '심사 큐 집중 보기', 'quiet');
      subBtn.type = 'button';
      subBtn.addEventListener('click', () => onNavigate('store', 'submissions'));
      const pkgBtn = el('button', '패키지 · 킬스위치', 'quiet');
      pkgBtn.type = 'button';
      pkgBtn.addEventListener('click', () => onNavigate('store', 'packages'));
      actions.append(subBtn, pkgBtn);
    } else {
      const ovBtn = el('button', 'Store 통합 대시보드', 'quiet');
      ovBtn.type = 'button';
      ovBtn.addEventListener('click', () => onNavigate('store', 'overview'));
      actions.append(ovBtn);
    }
    const auditBtn = el('button', '통합 감사 로그 (Store) →', 'quiet');
    auditBtn.type = 'button';
    auditBtn.addEventListener('click', () => onNavigate('system', 'audit'));
    actions.append(auditBtn);

    const p = panel('PLAYFORGE STORE OPERATIONS', 'Store 요약 지표 및 불변 계약 경계', actions);

    const chips = el('div', '', 'chip-row');
    chips.append(
      pill('독립 Store SQLite · Hub 카탈로그 분리', 'ok'),
      pill('SHA-256 64-hex 불변 계약 검증', 'info'),
      pill('editorial 아티팩트 금지 규칙 적용', 'info'),
      pill('승인(Approve) ≠ 자동 게시', 'muted')
    );
    p.append(chips);

    const kpis = el('div', '', 'metrics four');
    kpis.dataset.testid = 'store-summary-metrics';
    const cards = [
      ['게시 패키지 · 콘텐츠', `${number(s.publishedPackages || 0)} / ${number(s.totalPackages || 0)}`, `package ${number(s.packageCount || 0)} · editorial ${number(s.editorialCount || 0)}`],
      ['제출 심사 대기', number(s.pendingSubmissions || 0), `수정 요청 ${number(s.changesRequestedSubmissions || 0)} · 승인 ${number(s.approvedSubmissions || 0)} · 거절 ${number(s.rejectedSubmissions || 0)}`],
      ['비공개 · 폐기 · 킬스위치', number(s.restrictedPackages || 0), `yanked ${number(s.yankedPackages || 0)} · deprecated ${number(s.deprecatedPackages || 0)} · hidden ${number(s.hiddenPackages || 0)}`],
      ['누적 설치 · 미처리 신고', `${number(s.totalInstalls || 0)} / ${number(s.openReports || 0)}`, '프로젝트 적용 누적 / 신고 건수']
    ];
    for (const [label, value, detail] of cards) {
      const card = el('div', '', 'metric');
      card.append(el('small', label), raw('strong', String(value)), el('p', detail));
      kpis.append(card);
    }
    p.append(kpis);
    return p;
  }

  function buildSubmissionsPanel() {
    const controls = el('div', '', 'inline-actions');

    const statusLabel = el('label', '심사 상태', 'review-filter');
    const statusSelect = document.createElement('select');
    statusSelect.dataset.testid = 'store-submission-filter';
    for (const [val, label] of [
      ['all', `전체 (${state.counts.total ?? state.submissions.length})`],
      ['in_review', `심사 대기 (${state.counts.in_review ?? 0})`],
      ['changes_requested', `보류 · 수정 요청 (${state.counts.changes_requested ?? 0})`],
      ['approved', `승인됨 (${state.counts.approved ?? 0})`],
      ['rejected', `거절됨 (${state.counts.rejected ?? 0})`]
    ]) {
      statusSelect.append(new Option(label, val));
    }
    statusSelect.value = state.submissionFilter.status;
    statusSelect.addEventListener('change', () => {
      state.submissionFilter.status = statusSelect.value;
      void loadView(state.activeView);
    });
    statusLabel.append(statusSelect);

    const kindLabel = el('label', '유형', 'review-filter');
    const kindSelect = document.createElement('select');
    kindSelect.dataset.testid = 'store-submission-kind-filter';
    for (const [val, label] of [['all', '전체 유형'], ['package', 'package (설치 패키지)'], ['editorial', 'editorial (일반 콘텐츠)']]) {
      kindSelect.append(new Option(label, val));
    }
    kindSelect.value = state.submissionFilter.kind;
    kindSelect.addEventListener('change', () => {
      state.submissionFilter.kind = kindSelect.value;
      void loadView(state.activeView);
    });
    kindLabel.append(kindSelect);

    const reloadBtn = el('button', '심사 큐 새로고침', 'quiet');
    reloadBtn.type = 'button';
    reloadBtn.addEventListener('click', () => void loadView(state.activeView));
    controls.append(statusLabel, kindLabel, reloadBtn);

    const p = panel('SUBMISSION REVIEW QUEUE', 'Store 제출 심사 큐 (승인 · 보류 · 거절)', controls);
    p.append(el('p', '패키지는 sha256:<64-hex> artifact_digest 불변 계약을 검증하고, 일반 콘텐츠(editorial)는 패키지 아티팩트를 포함할 수 없습니다.', 'muted'));

    const workspace = el('div', '', 'review-workspace');
    const queuePane = el('div', '', 'review-queue-pane');
    queuePane.dataset.testid = 'store-submission-queue';

    if (!state.submissions.length) {
      queuePane.append(el('p', '선택한 조건에 해당하는 Store 제출이 없습니다.', 'empty'));
    } else {
      for (const item of state.submissions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'review-queue-btn' + (item.id === state.selectedSubmissionId ? ' selected' : '');
        btn.dataset.testid = 'store-submission-btn';
        btn.dataset.submissionId = item.id;

        const top = el('div', '', 'review-queue-meta');
        top.append(raw('strong', item.title), pill(SUBMISSION_STATUS_LABELS[item.status] || item.status, SUBMISSION_STATUS_TONE[item.status] || 'muted'));

        const sub = el('div', '', 'review-queue-meta');
        sub.append(
          raw('span', `${item.release_kind} · v${item.asset_version_id}`),
          pill(item.contractCheck?.valid ? '계약 검증 OK' : '계약 위반', item.contractCheck?.valid ? 'ok' : 'danger')
        );

        const foot = el('div', '', 'review-queue-meta');
        foot.append(raw('span', item.publisher_name || item.publisher_id), raw('span', kstStamp(item.submitted_at)));

        btn.append(top, sub, foot);
        btn.addEventListener('click', () => {
          state.selectedSubmissionId = item.id;
          renderCurrentView();
        });
        queuePane.append(btn);
      }
    }

    const detailPane = el('div', '', 'review-detail-pane');
    detailPane.dataset.testid = 'store-submission-detail';
    const selected = state.submissions.find(item => item.id === state.selectedSubmissionId);
    if (!selected) {
      detailPane.append(el('p', '왼쪽 심사 큐에서 검토할 제출 항목을 선택하세요.', 'empty'));
    } else {
      renderSubmissionDetail(detailPane, selected);
    }

    workspace.append(queuePane, detailPane);
    p.append(workspace);
    return p;
  }

  function renderSubmissionDetail(detailPane, item) {
    const header = el('div', '', 'section-heading');
    const titleBox = el('div', '');
    titleBox.append(
      raw('h3', item.title),
      raw('p', `${item.slug} · v${item.asset_version_id} · ${item.release_id} · rev ${item.revision}`, 'muted')
    );
    const badgeWrap = el('div', '', 'inline-actions');
    badgeWrap.append(
      pill(item.release_kind, item.release_kind === 'package' ? 'info' : 'muted', true),
      pill(SUBMISSION_STATUS_LABELS[item.status] || item.status, SUBMISSION_STATUS_TONE[item.status] || 'muted')
    );
    header.append(titleBox, badgeWrap);
    detailPane.append(header);

    if (item.summary) detailPane.append(el('p', item.summary, 'community-body'));

    const meta = el('dl', '', 'review-data');
    for (const [label, value] of [
      ['제출 ID', item.id],
      ['게시자', `${item.publisher_name} (${item.publisher_id})`],
      ['카테고리', item.category || '—'],
      ['라이선스 참조', item.license_snapshot_ref || '—'],
      ['사전 검증기', item.validator_status],
      ['제출 시각', kstStamp(item.submitted_at)]
    ]) {
      meta.append(el('dt', label), raw('dd', value));
    }
    if (item.decided_at) {
      meta.append(el('dt', '최종 판정'), raw('dd', `${kstStamp(item.decided_at)} (${item.decided_by || 'admin'})`));
    }
    detailPane.append(meta);

    // Contract verification box
    const contractBox = el('div', '', 'checklist-box store-contract-box');
    const cHead = el('div', '', 'section-heading');
    cHead.append(
      el('h3', item.release_kind === 'editorial' ? '일반 콘텐츠(editorial) 규칙 검증' : '불변 패키지 계약 검증 (SHA-256)'),
      pill(item.contractCheck?.valid ? '계약 PASS' : '계약 FAIL', item.contractCheck?.valid ? 'ok' : 'danger')
    );
    contractBox.append(cHead);

    if (item.release_kind === 'editorial') {
      contractBox.append(el('p', 'release_kind = editorial은 가이드·컬렉션 등 일반 콘텐츠이며 패키지 설치 대상이 아니므로 artifact_id, artifact_digest, file_manifest를 포함할 수 없습니다.', 'muted'));
    } else {
      const contractMeta = el('dl', '', 'review-data');
      const compat = item.engine_compatibility;
      const compatText = compat
        ? `Godot ${compat.godot_tested} (최소 ${compat.godot_min}) · ${(compat.platforms || []).join(', ')}`
        : '미지정';
      for (const [k, v] of [
        ['artifact_id', item.artifact_id || '없음'],
        ['artifact_digest', item.artifact_digest || '없음'],
        ['dependency_manifest_hash', item.dependency_manifest_hash || '없음'],
        ['호환 엔진 · 플랫폼', compatText]
      ]) {
        contractMeta.append(el('dt', k), raw('dd', v, 'store-mono'));
      }
      contractBox.append(contractMeta);

      if (Array.isArray(item.file_manifest) && item.file_manifest.length) {
        const list = el('div', '', 'store-manifest-list');
        for (const f of item.file_manifest) {
          const row = el('div', '', 'store-manifest-row');
          row.append(
            raw('code', f.path),
            raw('span', `${formatBytes(f.bytes)} · ${f.executable_addon ? '실행 Addon' : '에셋'} · ${f.sha256.slice(0, 12)}…`, 'muted')
          );
          list.append(row);
        }
        contractBox.append(list);
      }
    }

    if (!item.contractCheck?.valid && item.contractCheck?.errors?.length) {
      for (const err of item.contractCheck.errors) {
        contractBox.append(raw('p', `• ${err}`, 'form-error'));
      }
    }
    detailPane.append(contractBox);

    if (item.review_note) {
      detailPane.append(el('h3', '심사 메모', 'muted'), raw('p', item.review_note, 'community-body'));
    }

    if (item.status === 'in_review') {
      const form = document.createElement('form');
      form.className = 'review-actions';

      const noteLabel = el('label', '심사 판정 사유 / 메모 (보류·거절 시 사유 기입 권장)');
      const noteInput = document.createElement('textarea');
      noteInput.rows = 3;
      noteInput.maxLength = 1000;
      noteInput.placeholder = '계약 검토 의견, 거절 사유 또는 창작자 수정 요청 사항을 입력하세요.';
      noteInput.dataset.testid = 'store-review-note';
      noteInput.addEventListener('input', () => noteInput.setCustomValidity(''));
      noteLabel.append(noteInput);

      const btnRow = el('div', '', 'review-buttons');
      const approveBtn = el('button', '승인 (Approve)', 'primary');
      approveBtn.type = 'submit';
      approveBtn.dataset.testid = 'store-decision-approve';
      approveBtn.dataset.decision = 'approve';

      const holdBtn = el('button', '보류 · 수정 요청', 'quiet');
      holdBtn.type = 'submit';
      holdBtn.dataset.testid = 'store-decision-request-changes';
      holdBtn.dataset.decision = 'request_changes';

      const rejectBtn = el('button', '거절 (Reject)', 'danger-btn');
      rejectBtn.type = 'submit';
      rejectBtn.dataset.testid = 'store-decision-reject';
      rejectBtn.dataset.decision = 'reject';

      btnRow.append(approveBtn, holdBtn, rejectBtn);
      form.append(noteLabel, btnRow);

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const submitter = event.submitter;
        const decision = submitter?.dataset.decision;
        if (!decision || state.busy) return;
        const note = noteInput.value.trim();
        if (decision === 'request_changes' && !note) {
          noteInput.setCustomValidity('보류(수정 요청) 시 창작자에게 전달할 사유를 입력해 주세요.');
          noteInput.reportValidity();
          noteInput.setCustomValidity('');
          return;
        }
        state.busy = true;
        approveBtn.disabled = holdBtn.disabled = rejectBtn.disabled = noteInput.disabled = true;
        try {
          const payload = {
            decision,
            revision: item.revision,
            note,
            ...(decision === 'approve' && item.release_kind === 'package' && item.artifact_digest
              ? { artifact_digest: item.artifact_digest }
              : {})
          };
          const res = await api(`/api/admin/store/submissions/${encodeURIComponent(item.id)}/decision`, {
            method: 'POST',
            body: payload
          });
          const label = decision === 'approve' ? '승인' : decision === 'reject' ? '거절' : '보류(수정 요청)';
          const stagingNote = res.pendingRelease
            ? ` (대기 릴리스 v${res.pendingRelease.asset_version_id} 기록됨)`
            : res.stagedPackage
              ? ' (비공개 스테이징 등록됨)'
              : '';
          notice(`Store 제출 '${item.title}'을(를) ${label} 처리했습니다.${stagingNote}`);
          onBadgesChanged();
          await loadView(state.activeView);
        } catch (error) {
          if (!onAuthError(error)) notice(error.message || '제출 판정에 실패했습니다.', true);
        } finally {
          state.busy = false;
          approveBtn.disabled = holdBtn.disabled = rejectBtn.disabled = noteInput.disabled = false;
        }
      });

      detailPane.append(form);
    }
  }

  function buildPackagesPanel() {
    const packages = state.overview?.packages || [];

    const controls = el('div', '', 'inline-actions');
    const filterSelect = document.createElement('select');
    filterSelect.dataset.testid = 'store-package-status-filter';
    for (const [val, label] of [
      ['all', '전체 상태'],
      ['published', '게시중 (published)'],
      ['hidden', '숨김 (hidden)'],
      ['deprecated', '지원 중단 (deprecated)'],
      ['yanked', '킬스위치 (yanked)']
    ]) {
      filterSelect.append(new Option(label, val));
    }
    filterSelect.value = state.packageFilter.status;
    filterSelect.addEventListener('change', () => {
      state.packageFilter.status = filterSelect.value;
      renderCurrentView();
    });

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = '패키지 · slug · 게시자 검색';
    searchInput.style.minWidth = '200px';
    searchInput.value = state.packageFilter.q;
    searchInput.addEventListener('input', () => {
      state.packageFilter.q = searchInput.value;
      renderCurrentView();
    });
    controls.append(filterSelect, searchInput);

    const p = panel('PACKAGE STATUS & KILL SWITCH', 'Store 패키지 목록 상태 및 킬스위치 토글', controls);

    const reasonBar = el('div', '', 'store-reason-bar');
    const reasonLabel = el('label', '상태 변경 / 킬스위치 사유 (선택)');
    const reasonInput = document.createElement('input');
    reasonInput.type = 'text';
    reasonInput.maxLength = 500;
    reasonInput.placeholder = '예: 보안 취약점 또는 호환성 문제로 긴급 차단';
    reasonInput.value = state.statusReasonDraft;
    reasonInput.dataset.testid = 'store-package-reason-input';
    reasonInput.addEventListener('input', () => { state.statusReasonDraft = reasonInput.value; });
    reasonLabel.append(reasonInput);
    reasonBar.append(reasonLabel);
    p.append(reasonBar);

    const q = state.packageFilter.q.trim().toLowerCase();
    const shown = packages.filter(pkg => {
      if (state.packageFilter.status !== 'all' && pkg.status !== state.packageFilter.status) return false;
      if (!q) return true;
      return [pkg.slug, pkg.title, pkg.publisher_id, pkg.category].some(v => String(v || '').toLowerCase().includes(q));
    });

    const wrap = el('div', '', 'table-wrap');
    const table = document.createElement('table');
    table.dataset.testid = 'store-packages-table';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const heading of ['패키지 / 슬러그', '게시자 · 버전', '아티팩트 다이제스트', '설치 / 신고', '현재 상태', '상태 전환 / 킬스위치']) {
      const th = el('th', heading);
      th.scope = 'col';
      hr.append(th);
    }
    thead.append(hr);

    const tbody = document.createElement('tbody');
    if (!shown.length) {
      const tr = document.createElement('tr');
      const td = el('td', '조건에 맞는 Store 패키지가 없습니다.', 'empty');
      td.colSpan = 6;
      tr.append(td);
      tbody.append(tr);
    } else {
      for (const pkg of shown) {
        const tr = document.createElement('tr');
        tr.dataset.testid = 'store-pkg-row';
        tr.dataset.packageSlug = pkg.slug;

        const tdTitle = document.createElement('td');
        const titleWrap = el('div', '');
        titleWrap.append(raw('strong', pkg.title), raw('small', `${pkg.slug} · ${pkg.release_kind}`));
        tdTitle.append(titleWrap);

        const tdPub = document.createElement('td');
        tdPub.append(raw('strong', pkg.publisher_id), raw('small', `v${pkg.asset_version_id} · rev ${pkg.revision ?? 1} · ${pkg.license_snapshot_ref || '—'}`));
        if (pkg.pending_release) {
          tdPub.append(pill(`대기 릴리스 v${pkg.pending_release.asset_version_id}`, 'info'));
        }

        const tdDigest = document.createElement('td');
        tdDigest.append(raw('code', shortDigest(pkg.artifact_digest), 'store-mono store-digest-cell'));

        const tdStats = document.createElement('td');
        tdStats.append(
          raw('strong', `${number(pkg.install_count)} 설치`),
          raw('small', pkg.report_count ? `신고 ${number(pkg.report_count)}건` : '신고 없음')
        );

        const tdStatus = document.createElement('td');
        tdStatus.append(pill(PACKAGE_STATUS_LABELS[pkg.status] || pkg.status, PACKAGE_STATUS_TONE[pkg.status] || 'muted'));
        if (pkg.status_reason) tdStatus.append(raw('small', pkg.status_reason));

        const tdActions = document.createElement('td');
        const actionBox = el('div', '', 'store-status-controls');
        const statusSel = document.createElement('select');
        statusSel.setAttribute('aria-label', `${pkg.title} 상태 선택`);
        statusSel.dataset.testid = 'store-pkg-status-select';
        for (const st of ['published', 'hidden', 'deprecated', 'yanked']) {
          statusSel.append(new Option(st, st));
        }
        statusSel.value = pkg.status;

        const applyBtn = el('button', '적용', 'quiet');
        applyBtn.type = 'button';
        applyBtn.dataset.testid = 'store-pkg-status-apply';
        applyBtn.addEventListener('click', () => {
          void applyPackageStatus(pkg, statusSel.value);
        });

        const isYanked = pkg.status === 'yanked';
        const killBtn = el('button', isYanked ? '복구 (Publish)' : '킬스위치 (Yank)', isYanked ? 'quiet' : 'danger-btn');
        killBtn.type = 'button';
        killBtn.dataset.testid = 'store-pkg-killswitch';
        killBtn.addEventListener('click', () => {
          void applyPackageStatus(pkg, isYanked ? 'published' : 'yanked', isYanked ? '운영자 복구 처리' : '운영자 킬스위치 긴급 차단');
        });

        actionBox.append(statusSel, applyBtn, killBtn);
        tdActions.append(actionBox);

        tr.append(tdTitle, tdPub, tdDigest, tdStats, tdStatus, tdActions);
        tbody.append(tr);
      }
    }

    table.append(thead, tbody);
    wrap.append(table);
    p.append(wrap, el('p', 'Store 상태 변경 및 킬스위치(yanked)는 Store 배포 목록에만 반영되며, 기존 Hub 게임 카탈로그와 이미 적용된 프로젝트 파일은 변경하지 않습니다.', 'panel-foot'));
    return p;
  }

  async function applyPackageStatus(pkg, nextStatus, fallbackReason = '') {
    if (state.busy) return;
    if (pkg.status === nextStatus) {
      notice(`'${pkg.slug}' 패키지는 이미 '${nextStatus}' 상태입니다.`, true);
      return;
    }
    const reason = state.statusReasonDraft.trim() || fallbackReason;
    let confirmRestoreFromYanked = false;
    if (pkg.status === 'yanked' && nextStatus === 'published') {
      if (!reason) {
        notice('킬스위치(yanked) 패키지를 published로 복구하려면 사유를 입력해 주세요.', true);
        return;
      }
      const ok = typeof window.confirm === 'function'
        ? window.confirm(`킬스위치(yanked) 상태의 '${pkg.slug}' 패키지를 즉시 공개(published)로 복구하시겠습니까?\n보안·계약 재검토가 완료된 경우에만 진행하세요.`)
        : false;
      if (!ok) return;
      confirmRestoreFromYanked = true;
    }
    state.busy = true;
    try {
      await api(`/api/admin/store/packages/${encodeURIComponent(pkg.slug)}/status`, {
        method: 'POST',
        body: {
          status: nextStatus,
          reason,
          expectedRevision: pkg.revision ?? 1,
          ...(confirmRestoreFromYanked ? { confirmRestoreFromYanked: true } : {})
        }
      });
      state.statusReasonDraft = '';
      notice(`'${pkg.slug}' 상태를 '${nextStatus}'로 전환하고 감사 로그에 기록했습니다.`);
      onBadgesChanged();
      await loadView(state.activeView);
    } catch (error) {
      if (!onAuthError(error)) notice(error.message || '패키지 상태 변경에 실패했습니다.', true);
    } finally {
      state.busy = false;
    }
  }

  function buildAuditPanel() {
    const audits = state.overview?.recentAudit || [];
    const btn = el('button', '전체 감사 로그에서 필터 보기 →', 'quiet');
    btn.type = 'button';
    btn.addEventListener('click', () => onNavigate('system', 'audit'));
    const p = panel('STORE AUDIT TRAIL', '최근 Store 운영 감사 기록 (domain = store)', btn);
    if (!audits.length) {
      p.append(el('p', '아직 기록된 Store 운영 감사 로그가 없습니다. 제출 판정 또는 패키지 상태 전환 시 자동 기록됩니다.', 'empty'));
      return p;
    }
    const list = el('div', '');
    for (const item of audits.slice(0, 10)) {
      const row = el('div', '', 'activity');
      const head = el('div', '', 'activity-head');
      head.append(raw('strong', `${item.action} · ${item.target || '—'}`), pill('store', 'info', true));
      row.append(head, raw('p', JSON.stringify(item.detail || {})), raw('time', kstStamp(item.createdAt)));
      list.append(row);
    }
    p.append(list);
    return p;
  }

  return { loadView, reset };
}
