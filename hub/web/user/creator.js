(function () {
  'use strict';

  const submissionsUrl = '/api/creator/submissions';
  const projectUrl = id => '/api/platform/projects/' + encodeURIComponent(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const idIsValid = value => typeof value === 'string' && /^[a-f0-9]{24}$/.test(value);
  const submissionIdIsValid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
  const mayEdit = submission => ['draft', 'changes_requested'].includes(submission.status);
  const statusLabels = {
    draft: '초안', in_review: '심사 중', changes_requested: '수정 요청', approved: '심사 승인'
  };
  const archiveTypes = {
    submissions: { title: '릴리스 소스 JSON', artifactType: 'release-source' },
    deployments: { title: '웹 빌드 ZIP', artifactType: 'deployment-zip' }
  };

  function formatDate(iso) {
    const date = new Date(iso);
    return iso && !Number.isNaN(date.valueOf())
      ? new Intl.DateTimeFormat(document.documentElement.lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
      : '';
  }

  function failure(error, fallback) {
    if (error.status === 401) return '로그인 상태를 확인한 뒤 다시 시도해 주세요.';
    if (error.code === 'FORGE_DISABLED') return '이 환경에서는 PlayForge 계정 기능이 꺼져 있습니다.';
    if (error.code === 'RELEASE_NOT_FOUND') return '릴리스를 찾을 수 없습니다. 프로젝트의 릴리스를 다시 확인해 주세요.';
    if (error.status === 409) return '심사 상태가 바뀌었습니다. 새로고침한 뒤 최신 상태에서 다시 시도해 주세요.';
    return fallback;
  }

  function mount(root, api, sameSession) {
    const alive = () => root.isConnected && sameSession();
    let projectRequest = 0;
    let releaseRequest = 0;
    let archiveRequest = 0;
    let listRequest = 0;
    let listOffset = 0;
    let editing = null;
    let changed = false;
    let saving = false;
    let projects = [];
    let submissions = [];

    root.innerHTML = `<section class="surface" aria-labelledby="submission-title">
      <h2 id="submission-title">게임 제출</h2>
      <p class="muted">내 프로젝트의 릴리스와 게임 정보를 제출할 수 있습니다. 실행 검증과 공개는 별도 단계입니다.</p>
      <form id="submission-form" class="creator-form">
        <div class="creator-fields">
          <label>소유 프로젝트<select name="projectId" required disabled><option value="">프로젝트 불러오는 중…</option></select></label>
          <label>릴리스<select name="releaseId" required disabled><option value="">프로젝트를 먼저 선택하세요</option></select></label>
        </div>
        <div class="save-actions">
          <button type="button" class="text-button" data-refresh-projects>프로젝트 새로고침</button>
          <button type="button" class="text-button" data-refresh-releases hidden>릴리스 다시 불러오기</button>
        </div>
        <p class="creator-feedback" data-project-feedback role="status"></p>
        <label>게임 제목<input name="title" maxlength="100" required></label>
        <label>게임 설명<textarea name="description" maxlength="2000" rows="3" required></textarea></label>
        <p class="creator-feedback" data-form-feedback role="status"></p>
        <div class="save-actions">
          <button type="submit" class="button primary" disabled>초안 저장</button>
          <button type="button" class="button secondary" data-new-draft hidden>새 초안</button>
        </div>
      </form>
      <section class="creator-archives" aria-labelledby="archive-title" hidden>
        <h3 id="archive-title">선택한 릴리스 보관</h3>
        <p class="muted">운영자 Drive에 비공개로 보관합니다. Drive 보관 상태와 실행 검증은 별도로 관리됩니다.</p>
        <div class="creator-fields">
          ${Object.entries(archiveTypes).map(([kind, type]) => `<div class="archive-card" data-archive="${kind}">
            <h4>${type.title}</h4>
            <p role="status"></p>
            <div class="save-actions">
              <button type="button" class="button secondary small" data-archive-method="POST" disabled>Drive에 보관</button>
              <button type="button" class="text-button" data-archive-method="GET">상태 확인</button>
            </div>
          </div>`).join('')}
        </div>
      </section>
    </section>
    <section class="surface" aria-labelledby="creator-submissions-title">
      <div class="section-heading">
        <h2 id="creator-submissions-title">제출한 게임과 초안</h2>
        <button type="button" class="text-button" data-refresh-submissions>새로고침</button>
      </div>
      <p class="creator-feedback" data-list-feedback role="status"></p>
      <div id="creator-submissions"></div>
      <button type="button" class="button secondary" data-more-submissions hidden>더 보기</button>
    </section>`;

    const query = selector => root.querySelector(selector);
    const form = query('#submission-form');
    const project = form.elements.projectId;
    const release = form.elements.releaseId;
    const title = form.elements.title;
    const description = form.elements.description;
    const save = form.querySelector('[type="submit"]');
    const archivePanel = query('.creator-archives');
    const releaseRetry = query('[data-refresh-releases]');
    const more = query('[data-more-submissions]');

    function feedback(selector, message, error = false) {
      const element = query(selector);
      element.textContent = message;
      element.classList.toggle('inline-error', error);
    }

    function updateSave() {
      save.disabled = saving || !project.value || !release.value;
    }

    function replaceOptions(select, placeholder, entries, selected) {
      select.replaceChildren(new Option(placeholder, ''));
      for (const { id, label } of entries) select.add(new Option(label, id));
      select.value = entries.some(entry => entry.id === selected) ? selected : '';
      select.disabled = !entries.length;
    }

    async function loadProjects(selected = project.value, selectedRelease = release.value) {
      const request = ++projectRequest;
      releaseRequest++;
      archiveRequest++;
      archivePanel.hidden = true;
      releaseRetry.hidden = true;
      replaceOptions(project, '프로젝트 불러오는 중…', []);
      replaceOptions(release, '프로젝트를 먼저 선택하세요', []);
      updateSave();
      feedback('[data-project-feedback]', '');
      try {
        const data = await api('/api/platform/projects');
        if (!alive() || request !== projectRequest) return;
        projects = data.projects.filter(item => idIsValid(item.id));
        replaceOptions(project, projects.length ? '프로젝트 선택' : '소유한 프로젝트가 없습니다',
          projects.map(item => ({ id: item.id, label: `${item.name} · r${item.revision}` })), selected);
        if (!projects.length) feedback('[data-project-feedback]', '제출하려면 계정에 저장된 PlayForge 프로젝트와 릴리스가 필요합니다.');
        if (project.value) await loadReleases(selectedRelease);
      } catch (error) {
        if (!alive() || request !== projectRequest) return;
        replaceOptions(project, '프로젝트 불러오기 실패', []);
        feedback('[data-project-feedback]', failure(error, '프로젝트를 불러오지 못했습니다. 다시 시도해 주세요.'), true);
      }
    }

    async function loadReleases(selected) {
      const projectId = project.value;
      const request = ++releaseRequest;
      archiveRequest++;
      archivePanel.hidden = true;
      releaseRetry.hidden = !projectId;
      replaceOptions(release, projectId ? '릴리스 불러오는 중…' : '프로젝트를 먼저 선택하세요', []);
      updateSave();
      feedback('[data-project-feedback]', '');
      if (!projectId) return;
      try {
        const data = await api(projectUrl(projectId) + '/releases');
        if (!alive() || request !== releaseRequest) return;
        const entries = data.releases.filter(item => idIsValid(item.id))
          .map(item => ({ id: item.id, label: `${item.label} · r${item.revision}` }));
        replaceOptions(release, entries.length ? '릴리스 선택' : '선택할 릴리스가 없습니다', entries, selected);
        if (!entries.length) feedback('[data-project-feedback]', 'PlayForge에서 이 프로젝트의 릴리스를 만든 뒤 새로고침하세요.');
        showArchive();
      } catch (error) {
        if (!alive() || request !== releaseRequest) return;
        replaceOptions(release, '릴리스 불러오기 실패', []);
        feedback('[data-project-feedback]', failure(error, '릴리스를 불러오지 못했습니다. 다시 시도해 주세요.'), true);
      }
    }

    function archiveLabel(data) {
      if (data.cloudVerified === true) return '로컬 보관 · Drive 업로드 및 원격 검증 완료';
      if (data.state === 'failed') return data.localRecorded
        ? '로컬 보관 · Drive 보관 실패' : 'Drive 보관 실패';
      if (data.localRecorded === true) return '로컬 보관 · Drive 확인 대기';
      return '보관 기록 없음';
    }

    async function archive(kind, method) {
      const projectId = project.value;
      const releaseId = release.value;
      if (!projectId || !releaseId) return;
      const request = archiveRequest;
      const current = () => alive() && request === archiveRequest;
      const card = query(`[data-archive="${kind}"]`);
      const actions = card.querySelectorAll('button');
      const label = card.querySelector('[role="status"]');
      let archiveAllowed = true;
      let recheck = false;
      const path = projectUrl(projectId) + '/' + kind + '/' + releaseId;
      actions.forEach(button => button.disabled = true);
      label.textContent = method === 'POST' ? '보관하고 있습니다…' : '보관 상태 확인 중…';
      try {
        const data = await api(path, { method, timeout: 30000, body: method === 'POST' ? {} : undefined });
        if (!current()) return;
        if (data.artifactType !== archiveTypes[kind].artifactType) throw new Error('보관 결과 확인 불가');
        label.textContent = archiveLabel(data);
        archiveAllowed = data.cloudVerified !== true;
      } catch (error) {
        if (!current()) return;
        label.textContent = method === 'POST'
          ? '보관 요청을 확인하지 못했습니다. 상태를 먼저 확인해 주세요.'
          : failure(error, '보관 상태를 확인할 수 없습니다. 보관 설정과 빌드를 확인해 주세요.');
        recheck = method === 'POST';
        archiveAllowed = error.status !== 404 && error.status !== 503;
      } finally {
        if (current() && !recheck) {
          actions.forEach(button => button.disabled = button.dataset.archiveMethod === 'POST' && !archiveAllowed);
        }
      }
      if (recheck && current()) await archive(kind, 'GET');
    }

    function showArchive() {
      archiveRequest++;
      updateSave();
      archivePanel.hidden = !release.value;
      if (archivePanel.hidden) return;
      for (const kind of Object.keys(archiveTypes)) void archive(kind, 'GET');
    }

    function renderSubmissions() {
      query('#creator-submissions').innerHTML = submissions.map(item => `<article class="submission-card">
        <header>
          <h3 data-no-translate>${escape(item.title)}</h3>
          <span class="state-label state-${Object.hasOwn(statusLabels, item.status) ? item.status : 'unknown'}">${statusLabels[item.status] || '상태 확인 필요'}</span>
        </header>
        <p class="submission-description" data-no-translate>${escape(item.description)}</p>
        <dl>
          <div><dt>릴리스</dt><dd data-no-translate>${escape(item.releaseLabel)} · r${escape(item.releaseRevision)}</dd></div>
          <div><dt>수정 시각</dt><dd data-no-translate>${escape(formatDate(item.updatedAt))}</dd></div>
          <div><dt>실행 검증</dt><dd>미검증</dd></div>
          <div><dt>공개 상태</dt><dd>미공개</dd></div>
        </dl>
        ${item.reviewNote ? `<div class="review-note"><strong>심사 의견</strong><p data-no-translate>${escape(item.reviewNote)}</p></div>` : ''}
        ${mayEdit(item) ? `<div class="save-actions">
          <button class="button secondary small" type="button" data-edit-submission="${escape(item.id)}">수정</button>
          <button class="button primary small" type="button" data-submit-review="${escape(item.id)}">심사 요청</button>
        </div>` : ''}
      </article>`).join('');
    }

    async function loadSubmissions(append = false) {
      const request = ++listRequest;
      const offset = append ? listOffset : 0;
      more.disabled = true;
      feedback('[data-list-feedback]', '제출 내역을 불러오고 있습니다.');
      try {
        const data = await api(submissionsUrl + (offset ? '?offset=' + offset : ''));
        if (!alive() || request !== listRequest) return;
        const rows = data.submissions.filter(item => submissionIdIsValid(item.id));
        listOffset = offset + data.submissions.length;
        submissions = [...new Map([...(append ? submissions : []), ...rows].map(item => [item.id, item])).values()];
        renderSubmissions();
        more.hidden = !data.hasMore;
        feedback('[data-list-feedback]', submissions.length ? '' : '저장된 제출 초안이 없습니다.');
      } catch (error) {
        if (alive() && request === listRequest) {
          feedback('[data-list-feedback]', failure(error, '제출 내역을 불러오지 못했습니다. 다시 시도해 주세요.'), true);
        }
      } finally {
        if (alive() && request === listRequest) more.disabled = false;
      }
    }

    function openDraft(item) {
      editing = item;
      changed = false;
      title.value = item?.title || '';
      description.value = item?.description || '';
      query('#submission-title').textContent = item ? '제출 정보 수정' : '게임 제출';
      query('[data-new-draft]').hidden = !item;
      feedback('[data-form-feedback]', '');
      if (item) {
        project.value = item.projectId;
        if (project.value) void loadReleases(item.releaseId);
        else void loadProjects(item.projectId, item.releaseId);
      }
      title.focus();
    }

    form.addEventListener('input', () => changed = true);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!alive() || saving || !project.value || !release.value) return;
      const payload = { projectId: project.value, releaseId: release.value, title: title.value.trim(), description: description.value.trim() };
      if (!payload.title || !payload.description) {
        feedback('[data-form-feedback]', '게임 제목과 설명을 입력해 주세요.', true);
        return;
      }
      saving = true;
      form.querySelectorAll('button, select, input, textarea').forEach(field => field.disabled = true);
      const existing = editing;
      try {
        const result = await api(existing ? submissionsUrl + '/' + existing.id : submissionsUrl, {
          method: existing ? 'PATCH' : 'POST', body: existing ? { ...payload, revision: existing.revision } : payload
        });
        if (!alive()) return;
        editing = result.submission;
        changed = false;
        query('#submission-title').textContent = '제출 정보 수정';
        query('[data-new-draft]').hidden = false;
        feedback('[data-form-feedback]', '제출 정보를 저장했습니다. 아래 내역에서 심사를 요청할 수 있습니다.');
        await loadSubmissions();
      } catch (error) {
        if (alive()) feedback('[data-form-feedback]', failure(error, '제출 정보를 저장하지 못했습니다.'), true);
      } finally {
        saving = false;
        if (alive()) {
          form.querySelectorAll('button, select, input, textarea').forEach(field => field.disabled = false);
          updateSave();
        }
      }
    });

    async function requestReview(button, item) {
      if (item.id === editing?.id && changed) {
        feedback('[data-list-feedback]', '심사를 요청하기 전에 수정한 제출 정보를 저장해 주세요.', true);
        return;
      }
      button.disabled = true;
      try {
        await api(submissionsUrl + '/' + item.id + '/submit', { method: 'POST', body: { revision: item.revision } });
        if (!alive()) return;
        if (editing?.id === item.id) openDraft(null);
        await loadSubmissions();
        if (alive()) feedback('[data-list-feedback]', '심사를 요청했습니다.');
      } catch (error) {
        if (alive()) feedback('[data-list-feedback]', failure(error, '심사를 요청하지 못했습니다.'), true);
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    }

    project.onchange = () => void loadReleases();
    release.onchange = showArchive;
    query('[data-refresh-projects]').onclick = () => void loadProjects();
    releaseRetry.onclick = () => void loadReleases(release.value);
    query('[data-refresh-submissions]').onclick = () => void loadSubmissions();
    more.onclick = () => void loadSubmissions(true);
    query('[data-new-draft]').onclick = () => {
      if (!changed || window.confirm('저장하지 않은 수정 내용을 지우고 새 초안을 만들까요?')) openDraft(null);
    };
    root.addEventListener('click', event => {
      if (!alive()) return;
      const action = event.target.closest('[data-edit-submission],[data-submit-review],[data-archive-method]');
      if (!action) return;
      if (action.dataset.archiveMethod) {
        void archive(action.closest('[data-archive]').dataset.archive, action.dataset.archiveMethod);
      } else if (!saving) {
        const item = submissions.find(row => row.id === (action.dataset.editSubmission || action.dataset.submitReview));
        if (!item || !mayEdit(item)) return;
        if (action.dataset.editSubmission) {
          if (!changed || window.confirm('저장하지 않은 수정 내용을 지우고 이 초안을 열까요?')) openDraft(item);
        }
        else void requestReview(action, item);
      }
    });
    void loadProjects();
    void loadSubmissions();
  }

  window.PlayHubCreator = { mount };
})();
