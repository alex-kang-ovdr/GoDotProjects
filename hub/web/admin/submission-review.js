const PATH = '/api/admin/submissions';
const PAGE_SIZE = 25;
const LABELS = { in_review: '심사 중', changes_requested: '수정 요청', approved: '메타데이터 승인' };

function element(tag, content, className) {
  const node = document.createElement(tag);
  node.textContent = content;
  if (className) node.className = className;
  return node;
}

function value(tag, content, className) {
  const node = element(tag, content, className);
  node.dataset.noTranslate = '';
  node.translate = false;
  return node;
}

export function createSubmissionReview({ api, kstStamp, onSessionExpired, onDecision }) {
  const filter = document.getElementById('review-filter');
  const list = document.getElementById('review-list');
  const message = document.getElementById('review-message');
  const result = document.getElementById('review-result');
  const reload = document.getElementById('review-refresh');
  const previous = document.getElementById('review-prev');
  const next = document.getElementById('review-next');
  let active = false;
  let session = 0;
  let query = 0;
  let offset = 0;

  function expired(error) {
    if (error.status !== 401 && error.code !== 'CSRF_INVALID') return false;
    onSessionExpired();
    return true;
  }

  async function load(start = 0) {
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
        await load(start - PAGE_SIZE);
        return;
      }
      list.replaceChildren(...submissions.map(renderSubmission));
      message.textContent = submissions.length ? '' : '이 상태의 제출이 없습니다.';
      previous.disabled = start === 0;
      next.disabled = !hasMore;
    } catch (error) {
      if (request !== query || expired(error)) return;
      list.replaceChildren();
      message.textContent = '제출 목록을 불러오지 못했습니다. 다시 시도해 주세요.';
    } finally {
      if (request === query) {
        list.setAttribute('aria-busy', 'false');
        reload.disabled = false;
      }
    }
  }

  function renderSubmission(item) {
    const card = element('details', '', 'review-item');
    const heading = element('summary', '');
    heading.append(value('span', item.title), element('span', LABELS[item.status], 'community-badge'));
    const metadata = element('dl', '', 'review-data');
    const fields = [
      ['소유자', item.ownerName || item.ownerId],
      ['Forge 프로젝트', item.projectId],
      ['Forge 릴리스', `${item.releaseLabel} · r${item.releaseRevision} · ${item.releaseId}`],
      ['심사 요청 시각', kstStamp(item.submittedAt)],
      ['제출 ID', item.id]
    ];
    if (item.decidedAt) fields.push(['판정 시각', kstStamp(item.decidedAt)]);
    for (const [label, content] of fields) metadata.append(element('dt', label), value('dd', content));
    metadata.append(element('dt', '실행 패키지'), element('dd', '미검증'), element('dt', '카탈로그'), element('dd', '미공개'));
    card.append(heading, metadata, element('strong', '게임 소개'), value('p', item.description, 'community-body'));
    if (item.reviewNote) card.append(element('strong', '판정 메모'), value('p', item.reviewNote, 'community-body'));
    if (item.status === 'in_review') card.append(decisionForm(item));
    return card;
  }

  function decisionForm(item) {
    const form = element('form', '', 'review-actions');
    const label = element('label', '판정 메모 · 수정 요청 시 필수');
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

  filter.addEventListener('change', () => { result.textContent = ''; void load(); });
  reload.addEventListener('click', () => { result.textContent = ''; void load(offset); });
  previous.addEventListener('click', () => { void load(Math.max(0, offset - PAGE_SIZE)); });
  next.addEventListener('click', () => { void load(offset + PAGE_SIZE); });

  return {
    start() {
      if (active) return;
      active = true;
      void load();
    },
    reset() {
      active = false;
      session++;
      query++;
      offset = 0;
      filter.value = 'in_review';
      list.replaceChildren();
      list.setAttribute('aria-busy', 'false');
      message.textContent = result.textContent = '';
      reload.disabled = previous.disabled = next.disabled = true;
    }
  };
}
