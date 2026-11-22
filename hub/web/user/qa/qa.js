(function () {
  const cfg = window.PLAYHUB_CONFIG || {};
  const apiBase = cfg.apiBaseUrl
    ? cfg.apiBaseUrl.replace(/\/$/, '')
    : (cfg.apiPort && location.port && String(cfg.apiPort) !== String(location.port)
      ? `${location.protocol}//${location.hostname}:${cfg.apiPort}`
      : '');

  let csrfToken = '';
  let currentFilter = 'all';
  let targetsData = null;
  let runsData = null;

  const $ = (id) => document.getElementById(id);

  function setStatus(msg) {
    $('status-bar').textContent = msg;
  }

  async function api(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    }
    const res = await fetch(`${apiBase}${path}`, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || data?.error?.code || `HTTP ${res.status}`);
    }
    return data;
  }

  async function ensureQaSession() {
    const sess = await api('/api/session');
    csrfToken = sess.csrfToken || '';
    if (sess.kind === 'anonymous') {
      try {
        const qa = await api('/api/qa/session', { method: 'POST', body: {} });
        csrfToken = qa.csrfToken || csrfToken;
      } catch {
        // Already QA or promoted session
      }
    }
    $('qa-session-badge').textContent = 'QA Isolated Traffic';
    $('qa-session-badge').classList.add('passed');
  }

  function statusBadge(status) {
    if (!status) return '<span class="badge">NOT RUN</span>';
    return `<span class="badge ${status}">${String(status).toUpperCase()}</span>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderKpis() {
    if (!targetsData) return;
    const s = targetsData.summary || {};
    const stats = runsData?.byPlatform || {};
    $('env-badge').textContent = `${targetsData.buildInfo?.channel || 'dev'} · ${targetsData.buildInfo?.buildId || 'local'}`;
    $('total-targets-badge').textContent = `${s.totalTargets || 0} targets`;
    $('total-runs-badge').textContent = `${runsData?.totalRuns || 0} total runs`;

    const setCard = (id, count, pKey) => {
      $(id).textContent = `${count} Targets`;
      const st = stats[pKey];
      $(`${id}-sub`).textContent = st && st.total > 0
        ? `실행 ${st.total}건 · 합격 ${st.passRate}% · 평균 ${st.avgScore}점 (${st.avgLatencyMs}ms)`
        : '아직 실행 이력 없음';
    };
    setCard('kpi-web', s.web || 0, 'web');
    setCard('kpi-desktop', s.desktop || 0, 'desktop');
    setCard('kpi-android', s.android || 0, 'android');
    setCard('kpi-godot', s['godot-templates'] || 0, 'godot-templates');
  }

  function renderTargets() {
    const tbody = $('targets-tbody');
    if (!targetsData) return;
    const platforms = targetsData.platforms || {};
    const rows = [];
    for (const key of ['web', 'desktop', 'android', 'godot-templates']) {
      if (currentFilter !== 'all' && currentFilter !== key) continue;
      for (const item of (platforms[key] || [])) {
        const qa = item.lastQa;
        rows.push(`<tr>
          <td><code>${escapeHtml(key)}</code></td>
          <td><code>${escapeHtml(item.id)}</code></td>
          <td>${escapeHtml(item.title)}</td>
          <td>v${escapeHtml(item.version || '-')}</td>
          <td>${statusBadge(qa?.status)}</td>
          <td>${qa ? `${qa.score}/100` : '-'}</td>
          <td>${qa ? `${qa.latencyMs}ms` : '-'}</td>
          <td>
            <button data-run-platform="${escapeHtml(key)}" data-run-target="${escapeHtml(item.id)}">QA 실행</button>
            ${item.playUrl && item.playUrl.startsWith('/play/') ? ` <a href="${escapeHtml(item.playUrl)}" target="_blank" rel="noopener">플레이</a>` : ''}
          </td>
        </tr>`);
      }
    }
    tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="8">표시할 타겟이 없습니다.</td></tr>';
  }

  function renderRuns() {
    const tbody = $('runs-tbody');
    const runs = runsData?.runs || [];
    if (!runs.length) {
      tbody.innerHTML = '<tr><td colspan="7">실행 이력이 아직 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = runs.slice(0, 40).map((r) => `<tr>
      <td><code>${escapeHtml((r.createdAt || '').replace('T', ' ').slice(0, 19))}</code></td>
      <td><code>${escapeHtml(r.platform)}</code></td>
      <td><code>${escapeHtml(r.targetId)}</code></td>
      <td>${statusBadge(r.status)}</td>
      <td>${r.score}/100</td>
      <td>${r.passedChecks}/${r.totalChecks}</td>
      <td>${r.latencyMs}ms</td>
    </tr>`).join('');
  }

  async function refresh() {
    const [t, r] = await Promise.all([api('/api/qa/targets'), api('/api/qa/runs?limit=60')]);
    targetsData = t;
    runsData = r;
    renderKpis();
    renderTargets();
    renderRuns();
  }

  async function runQa(platform, targetId = null) {
    setBusy(true);
    setStatus(`GamerQA 실행 중: ${platform}${targetId ? ` / ${targetId}` : ''}...`);
    try {
      const res = await api('/api/qa/runs', {
        method: 'POST',
        body: targetId ? { platform, targetId } : { platform },
      });
      await refresh();
      setStatus(`완료: ${res.summary.passed}/${res.summary.total} 통과 (평균 ${res.summary.avgScore}점)`);
    } catch (err) {
      setStatus(`오류: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runBurst() {
    setBusy(true);
    setStatus('트래픽 Burst 테스트 실행 중 (4개 플랫폼 병렬 x12)...');
    const started = performance.now();
    try {
      const platforms = ['web', 'desktop', 'android', 'godot-templates'];
      const tasks = [];
      for (let i = 0; i < 12; i++) {
        const p = platforms[i % platforms.length];
        tasks.push(api('/api/qa/runs', { method: 'POST', body: { platform: p } }));
      }
      const results = await Promise.all(tasks);
      const elapsed = Math.round(performance.now() - started);
      const totalChecks = results.reduce((acc, r) => acc + (r.summary?.total || 0), 0);
      await refresh();
      setStatus(`Burst 완료: 12 병렬 배치 / ${totalChecks} 타겟 검증 (${elapsed}ms)`);
    } catch (err) {
      setStatus(`Burst 오류: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  function setBusy(busy) {
    document.querySelectorAll('.toolbar button').forEach((btn) => { btn.disabled = busy; });
  }

  document.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('button[data-run-target]');
    if (targetBtn) {
      runQa(targetBtn.dataset.runPlatform, targetBtn.dataset.runTarget);
      return;
    }
    const platBtn = e.target.closest('.toolbar button[data-platform]');
    if (platBtn) {
      runQa(platBtn.dataset.platform);
      return;
    }
    const tabBtn = e.target.closest('.tab-btn[data-filter]');
    if (tabBtn) {
      currentFilter = tabBtn.dataset.filter;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === tabBtn));
      renderTargets();
    }
  });

  $('btn-burst').addEventListener('click', runBurst);

  (async function init() {
    try {
      await ensureQaSession();
      await refresh();
      setStatus('준비 완료 · 4개 플랫폼(Web/Desktop/Android/Godot Templates) 통합됨');
    } catch (err) {
      setStatus(`초기화 오류: ${err.message}`);
    }
  })();
})();
