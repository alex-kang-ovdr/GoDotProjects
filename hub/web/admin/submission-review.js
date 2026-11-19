const PATH = '/api/admin/submissions';
const PAGE_SIZE = 25;
const LABELS = { in_review: '심사 중', changes_requested: '수정 요청', approved: '메타데이터 승인' };
const PILL_CLASS = { in_review: 'pill warn', changes_requested: 'pill danger', approved: 'pill ok' };
const QA_PILL = { passed: 'pill ok', warned: 'pill warn', failed: 'pill danger', error: 'pill danger', running: 'pill info', pending: 'pill muted' };

function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined && content !== null) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function raw(tag, content, className) {
  const node = element(tag, content, className);
  node.dataset.noTranslate = '';
  node.translate = false;
  return node;
}

export function createSubmissionReview({ api, kstStamp, onSessionExpired, onDecision, onNavigate }) {
  const filter = document.getElementById('review-filter');
  const list = document.getElementById('review-list');
  const detailPane = document.getElementById('review-detail-pane');
  const message = document.getElementById('review-message');
  const result = document.getElementById('review-result');
  const reload = document.getElementById('review-refresh');
  const previous = document.getElementById('review-prev');
  const next = document.getElementById('review-next');
  let active = false;
  let session = 0;
  let query = 0;
  let detailQuery = 0;
  let offset = 0;
  let currentItems = [];
  let selectedId = null;
  let renderedKey = '';

  function expired(error) {
    if (error.status !== 401 && error.code !== 'CSRF_INVALID') return false;
    onSessionExpired();
    return true;
  }

  function renderEmptyDetail(text) {
    renderedKey = '';
    detailPane.replaceChildren(element('p', text, 'empty'));
  }

  async function load(start = 0, forceDetail = false) {
    if (!active) return;
    const request = ++query;
    offset = start;
    const parameters = new URLSearchParams({ status: filter.value, offset: String(start) });
    list.setAttribute('aria-busy', 'true');
    reload.disabled = previous.disabled = next.disabled = true;
    message.textContent = '제출 목록을 불러오는 중입니다.';
    try {
      const { submissions, hasMore } = await api(`${PATH}?${parameters}`);
      if (request !== query) return;
      if (start > 0 && submissions.length === 0) {
        await load(start - PAGE_SIZE, forceDetail);
        return;
      }
      currentItems = submissions;
      if (!submissions.some(item => item.id === selectedId)) {
        selectedId = submissions[0]?.id || null;
      }
      paintQueue();
      message.textContent = submissions.length ? `목록 ${submissions.length}건` : '이 상태의 제출이 없습니다.';
      previous.disabled = start === 0;
      next.disabled = !hasMore;
      const selected = submissions.find(item => item.id === selectedId);
      if (selected) {
        const key = `${selected.id}:${selected.revision}:${selected.status}`;
        if (forceDetail || key !== renderedKey) {
          renderedKey = key;
          void renderDetail(selected);
        }
      } else {
        renderEmptyDetail('선택된 제출이 없습니다.');
      }
    } catch (error) {
      if (request !== query || expired(error)) return;
      currentItems = [];
      selectedId = null;
      list.replaceChildren();
      renderEmptyDetail('제출 목록을 불러오지 못했습니다.');
      message.textContent = '제출 목록을 불러오지 못했습니다. 다시 시도해 주세요.';
    } finally {
      if (request === query) {
        list.setAttribute('aria-busy', 'false');
        reload.disabled = false;
      }
    }
  }

  function paintQueue() {
    list.replaceChildren(...currentItems.map(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'review-queue-btn' + (item.id === selectedId ? ' selected' : '');
      btn.dataset.submissionId = item.id;
      const top = element('div', '', 'review-queue-meta');
      top.append(raw('strong', item.title), element('span', LABELS[item.status] || item.status, PILL_CLASS[item.status] || 'pill muted'));
      const sub = element('div', '', 'review-queue-meta');
      sub.append(raw('span', `${item.releaseLabel} · r${item.releaseRevision}`), raw('span', item.submittedAt ? kstStamp(item.submittedAt) : '—'));
      btn.append(top, sub);
      btn.addEventListener('click', () => {
        selectedId = item.id;
        renderedKey = `${item.id}:${item.revision}:${item.status}`;
        paintQueue();
        void renderDetail(item);
      });
      return btn;
    }));
  }

  async function renderDetail(item) {
    const reqId = ++detailQuery;
    const token = session;
    detailPane.replaceChildren();

    const header = element('div', '', 'section-heading');
    const titleBox = element('div', '');
    titleBox.append(raw('h3', item.title), raw('p', `제출 ID: ${item.id} · rev ${item.revision}`, 'muted'));
    const statusBadge = element('span', LABELS[item.status] || item.status, PILL_CLASS[item.status] || 'pill muted');
    header.append(titleBox, statusBadge);
    detailPane.append(header);

    const chips = element('div', '', 'chip-row');
    chips.append(
      element('span', '실행 패키지: 미검증', 'pill warn'),
      element('span', '카탈로그: 미공개', 'pill muted')
    );
    detailPane.append(chips);

    const metadata = element('dl', '', 'review-data');
    const fields = [
      ['소유자', item.ownerName || item.ownerId],
      ['Forge 프로젝트', item.projectId],
      ['Forge 릴리스', `${item.releaseLabel} · r${item.releaseRevision} · ${item.releaseId}`],
      ['심사 요청 시각', item.submittedAt ? kstStamp(item.submittedAt) : '—']
    ];
    if (item.decidedAt) fields.push(['판정 시각', kstStamp(item.decidedAt)]);
    for (const [label, content] of fields) metadata.append(element('dt', label), raw('dd', content));
    detailPane.append(metadata);

    const jumpRow = element('div', '', 'inline-actions');
    const forgeJump = element('button', 'Forge 프로젝트·빌드 보기', 'quiet');
    forgeJump.type = 'button';
    forgeJump.addEventListener('click', () => onNavigate?.('forge', 'projects'));
    const qaJump = element('button', 'QA 자동화 리포트 보기', 'quiet');
    qaJump.type = 'button';
    qaJump.addEventListener('click', () => onNavigate?.('qa', 'runs'));
    jumpRow.append(forgeJump, qaJump);
    detailPane.append(jumpRow);

    detailPane.append(element('h3', '게임 소개', 'muted'), raw('p', item.description, 'community-body'));
    if (item.reviewNote) {
      detailPane.append(element('h3', '이전 판정 메모', 'muted'), raw('p', item.reviewNote, 'community-body'));
    }

    const qaBox = element('div', '', 'checklist-box');
    qaBox.append(element('h3', '연결된 자동 QA 실행 (qa_runs)'), element('p', '불러오는 중...', 'muted'));
    detailPane.append(qaBox);

    const checklistBox = element('div', '', 'checklist-box');
    checklistBox.append(element('h3', '수동 검수 체크리스트 (manual-review.v1)'), element('p', '불러오는 중...', 'muted'));
    detailPane.append(checklistBox);

    if (item.status === 'in_review') detailPane.append(decisionForm(item));

    try {
      const [qaRes, checklistRes] = await Promise.all([
        api(`/api/admin/qa/runs?submissionId=${encodeURIComponent(item.id)}`),
        api(`${PATH}/${item.id}/checklist`)
      ]);
      if (reqId !== detailQuery || token !== session) return;

      qaBox.replaceChildren(element('h3', '연결된 자동 QA 실행 (qa_runs)'));
      if (!qaRes.runs?.length) {
        qaBox.append(element('p', '이 제출에 기록된 자동 QA 실행이 아직 없습니다. QA 탭에서 회귀·검수 리포트를 확인할 수 있습니다.', 'muted'));
      } else {
        for (const run of qaRes.runs.slice(0, 5)) {
          const row = element('div', '', 'activity');
          const top = element('div', '', 'activity-head');
          top.append(raw('strong', `${run.policyVersion} · ${run.targetId}`), element('span', run.status, QA_PILL[run.status] || 'pill muted'));
          row.append(top, raw('time', kstStamp(run.startedAt)));
          qaBox.append(row);
        }
      }

      paintChecklist(checklistBox, item, checklistRes.checklist);
    } catch (error) {
      if (reqId !== detailQuery || expired(error)) return;
      qaBox.replaceChildren(element('h3', '연결된 자동 QA 실행'), element('p', 'QA 정보를 불러오지 못했습니다.', 'muted'));
      checklistBox.replaceChildren(element('h3', '수동 검수 체크리스트'), element('p', '체크리스트를 불러오지 못했습니다.', 'muted'));
    }
  }

  function paintChecklist(container, item, checklist) {
    container.replaceChildren(element('h3', `수동 검수 체크리스트 (${checklist.version})`));
    const form = document.createElement('form');
    const boxes = new Map();
    for (const entry of checklist.items || []) {
      const label = element('label', '', 'checklist-item');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(entry.checked);
      input.disabled = item.status !== 'in_review';
      boxes.set(entry.id, input);
      label.append(input, element('span', entry.label));
      form.append(label);
    }
    const footer = element('div', '', 'inline-actions');
    const statusText = element('span', checklist.updatedAt ? `마지막 저장: ${kstStamp(checklist.updatedAt)} (${checklist.updatedBy || 'admin'})` : '미저장', 'muted');
    if (item.status === 'in_review') {
      const saveBtn = element('button', '체크리스트 저장', 'quiet');
      saveBtn.type = 'submit';
      footer.append(saveBtn, statusText);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        saveBtn.disabled = true;
        const items = {};
        for (const [id, input] of boxes) items[id] = input.checked;
        try {
          const saved = await api(`${PATH}/${item.id}/checklist`, { method: 'PUT', body: { revision: item.revision, items } });
          statusText.textContent = `저장 완료 · ${kstStamp(saved.checklist.updatedAt)}`;
        } catch (error) {
          if (!expired(error)) statusText.textContent = error.message || '체크리스트 저장에 실패했습니다.';
        } finally {
          saveBtn.disabled = false;
        }
      });
    } else {
      footer.append(statusText);
    }
    form.append(footer);
    container.append(form);
  }

  function decisionForm(item) {
    const form = element('form', '', 'review-actions');
    const label = element('label', '판정 메모 · 수정 요청 시 필수 (위반 규칙 ID나 사유 기재)');
    const note = document.createElement('textarea');
    note.maxLength = 1000;
    note.rows = 3;
    note.addEventListener('input', () => note.setCustomValidity(''));
    label.append(note);
    const buttons = element('div', '', 'review-buttons');
    const change = element('button', '수정 요청', 'quiet');
    const approve = element('button', '메타데이터 승인', 'primary');
    change.type = approve.type = 'submit';
    buttons.append(change, approve);
    form.append(label, buttons);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!active || !event.submitter) return;
      const decision = event.submitter === approve ? 'approved' : 'changes_requested';
      const reason = note.value.trim();
      if (decision === 'changes_requested' && !reason) {
        note.setCustomValidity('수정 요청 사유를 입력해 주세요.');
        note.reportValidity();
        note.setCustomValidity('');
        return;
      }
      const token = session;
      const request = query;
      change.disabled = approve.disabled = note.disabled = true;
      result.textContent = '';
      try {
        await api(`${PATH}/${item.id}/decision`, { method: 'POST', body: { revision: item.revision, decision, note: reason } });
        if (token !== session) return;
        result.textContent = decision === 'approved' ? '메타데이터를 승인했습니다. 카탈로그 상태는 미공개입니다.' : '창작자에게 수정 요청을 전달했습니다.';
        if (request === query) reload.focus();
        await load(offset);
        if (token === session) void onDecision();
      } catch (error) {
        if (token !== session || expired(error)) return;
        if (error.code === 'SUBMISSION_REVISION_CONFLICT' || error.code === 'INVALID_SUBMISSION_STATE') {
          result.textContent = '다른 변경이 먼저 저장됐습니다. 최신 심사 상태를 확인해 주세요.';
          await load(offset);
        } else if (error.code === 'RELEASE_NOT_FOUND' || error.code === 'SUBMISSION_RELEASE_MISMATCH' || error.code === 'FORGE_DISABLED') {
          result.textContent = '연결된 PlayForge 릴리스를 확인할 수 없어 승인하지 못했습니다.';
        } else {
          result.textContent = '판정을 저장하지 못했습니다. 다시 시도해 주세요.';
        }
      } finally {
        change.disabled = approve.disabled = note.disabled = false;
      }
    });
    return form;
  }

  filter.addEventListener('change', () => { result.textContent = ''; renderedKey = ''; void load(0, true); });
  reload.addEventListener('click', () => { result.textContent = ''; void load(offset, true); });
  previous.addEventListener('click', () => { void load(Math.max(0, offset - PAGE_SIZE)); });
  next.addEventListener('click', () => { void load(offset + PAGE_SIZE); });

  return {
    start() {
      if (active) return;
      active = true;
      void load();
    },
    reload() {
      if (active) void load(offset);
    },
    reset() {
      active = false;
      session++;
      query++;
      detailQuery++;
      offset = 0;
      currentItems = [];
      selectedId = null;
      filter.value = 'in_review';
      list.replaceChildren();
      renderEmptyDetail('왼쪽 대기열에서 심사할 제출을 선택하세요.');
      list.setAttribute('aria-busy', 'false');
      message.textContent = result.textContent = '';
      reload.disabled = previous.disabled = next.disabled = true;
    }
  };
}
