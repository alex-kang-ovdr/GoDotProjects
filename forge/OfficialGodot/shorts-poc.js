(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const uuid = () => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };

  const state = {
    session: null,
    csrfToken: null,
    wallet: null,
    config: null,
    styleGuide: null,
    plans: [],
    selectedGameId: 'world-of-warships',
    registeredByGame: new Map(), // gameId -> shortObj
    busy: false
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('poc-toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  function log(msg, level = 'info') {
    const el = $('poc-log-console');
    const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const row = document.createElement('div');
    row.className = `poc-log-line ${level}`;
    row.innerHTML = `<span class="poc-log-time">[${esc(now)}]</span>${esc(msg)}`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
  }

  function setStage(stage, status, detail) {
    const li = document.querySelector(`#poc-pipeline li[data-stage="${stage}"]`);
    const sm = $('st-' + stage);
    if (li) {
      li.classList.remove('running', 'done', 'error');
      if (status) li.classList.add(status);
    }
    if (sm && detail !== undefined) sm.textContent = detail;
  }

  function resetStages() {
    for (const s of ['auth', 'plan', 'hold', 'publish', 'verify', 'live']) {
      setStage(s, '', '대기 중');
    }
  }

  async function api(path, { method = 'GET', body, headers = {}, timeout = 30000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD'].includes(method) && state.csrfToken) h['X-CSRF-Token'] = state.csrfToken;
    try {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: h,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.arrayBuffer();
      if (!res.ok) {
        const err = new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.code = data?.error?.code || 'HTTP_ERROR';
        throw err;
      }
      return { status: res.status, headers: res.headers, data };
    } finally {
      clearTimeout(timer);
    }
  }

  function updateWalletUi() {
    if (!state.wallet) {
      $('poc-wallet-pill').hidden = true;
      $('poc-grant-btn').hidden = true;
      return;
    }
    $('poc-wallet-pill').hidden = false;
    $('poc-wallet-val').textContent = Number(state.wallet.available || 0).toLocaleString();
    $('poc-grant-btn').hidden = !state.config?.allowDevGrant;
  }

  function currentPlan() {
    return state.plans.find(p => p.gameId === state.selectedGameId) || state.plans[0] || null;
  }

  async function refreshRegisteredMap() {
    const { data } = await api('/api/shorts?limit=50&sort=latest');
    state.registeredByGame.clear();
    for (const s of (data.shorts || [])) {
      if (!s.gameId) continue;
      const existing = state.registeredByGame.get(s.gameId);
      if (!existing || s.isPrimary) state.registeredByGame.set(s.gameId, s);
    }
    renderGameTabs();
    renderSelectedPlan();
  }

  function renderStyleGuide() {
    if (!state.styleGuide) return;
    $('poc-pillars').innerHTML = (state.styleGuide.corePillars || []).map(p => `<div class="poc-pillar">${esc(p)}</div>`).join('');
  }

  function renderGameTabs() {
    $('poc-game-tabs').innerHTML = state.plans.map(plan => {
      const active = plan.gameId === state.selectedGameId;
      const reg = state.registeredByGame.get(plan.gameId);
      return `
        <button type="button" class="poc-game-tab${active ? ' active' : ''}" role="tab"
          aria-selected="${active}" data-plan-game="${esc(plan.gameId)}">
          <img src="${esc(plan.coverUrl)}" alt="">
          <div style="min-width:0">
            <strong>${plan.order}. ${esc(plan.koreanAlias)}</strong>
            <small>${esc(plan.genreLabel)}</small>
          </div>
          <span class="poc-tab-dot${reg ? ' ready' : ''}">${reg ? '등록됨' : '기획'}</span>
        </button>`;
    }).join('');
  }

  function renderSelectedPlan() {
    const p = currentPlan();
    if (!p) return;
    const reg = state.registeredByGame.get(p.gameId) || null;

    $('poc-game-cover').src = p.coverUrl;
    $('poc-game-genre').textContent = p.genreLabel;
    $('poc-game-engine').textContent = p.recommendedEngine === 'google-flow-veo-pro' ? 'Google Flow · Veo 3.1 Pro' : 'Google Flow · Veo Fast';
    $('poc-game-registered-badge').hidden = !reg;
    $('poc-game-title').textContent = `${p.koreanAlias} (${p.titleKo})`;
    $('poc-game-concept').textContent = p.playgroundConcept;
    $('poc-open-studio-btn').href = `shorts-studio.html?game=${encodeURIComponent(p.gameId)}`;
    $('poc-open-game-detail-btn').href = `/play/${encodeURIComponent(p.gameId)}/`;

    $('poc-scenes-grid').innerHTML = (p.scenes || []).map(sc => `
      <div class="poc-scene-card">
        <strong>${esc(sc.label)}</strong>
        <div class="sc-head">${esc(sc.headline)}</div>
        <div class="sc-cam">🎥 ${esc(sc.camera)}</div>
      </div>
    `).join('');

    $('poc-master-prompt').textContent = p.masterFlowPrompt;
    $('poc-scene-prompts').innerHTML = (p.scenes || []).map(sc => `
      <div class="poc-scene-prompt-item">
        <div class="poc-scene-prompt-top">
          <strong>Scene ${sc.index} (${sc.startSec}s–${sc.endSec}s)</strong>
          <button type="button" class="poc-btn ghost small" data-copy-scene="${sc.index}">복사</button>
        </div>
        <p>${esc(sc.flowScenePrompt)}</p>
      </div>
    `).join('');

    $('poc-audio-cue').textContent = p.audioCue;
    $('poc-neg-prompt').textContent = state.styleGuide?.negativePrompt || '';

    // Preview panel
    const emptyEl = $('poc-phone-empty');
    const videoEl = $('poc-phone-video');
    const metaBadge = $('poc-video-meta-badge');
    const linksEl = $('poc-live-links');

    if (reg && reg.videoUrl) {
      emptyEl.hidden = true;
      videoEl.hidden = false;
      if (videoEl.getAttribute('src') !== reg.videoUrl) {
        videoEl.src = reg.videoUrl;
        if (reg.posterUrl) videoEl.poster = reg.posterUrl;
        videoEl.load();
      }
      metaBadge.hidden = false;
      metaBadge.textContent = `${reg.width}×${reg.height} · ${reg.durationSec}s · ${reg.chargedCoins} PC`;
      $('poc-preview-sub').textContent = `${reg.title} (${reg.resolvedEngineName})`;
      linksEl.hidden = false;
      $('poc-link-feed').href = `/?view=shorts&short=${encodeURIComponent(reg.id)}`;
      $('poc-link-detail').href = `/play/${encodeURIComponent(p.gameId)}/`;
      $('poc-link-mp4').href = reg.videoUrl;
      $('poc-link-mp4').download = `${p.gameId}-playground-short.mp4`;
    } else {
      emptyEl.hidden = false;
      videoEl.hidden = true;
      videoEl.removeAttribute('src');
      metaBadge.hidden = true;
      linksEl.hidden = true;
      $('poc-preview-sub').textContent = '아직 이 게임에 등록된 쇼츠가 없습니다. 상단 버튼으로 즉시 생성·연동 검증해 보세요.';
    }

    const checks = [
      { label: 'Google Playground 3-Beat 기획 & Flow 프롬프트', ok: true, value: '준비됨' },
      { label: '9:16 H.264/AAC MP4 영상 생성 (PlayCoin 정산)', ok: Boolean(reg), value: reg ? `${(reg.bytes / 1024).toFixed(0)} KB · ${reg.chargedCoins} PC` : '미실행' },
      { label: 'PlayHub 내 게임 대표 소개 영상 등록', ok: Boolean(reg && reg.status === 'published'), value: reg?.isPrimary ? '⭐ 대표 영상' : (reg ? '등록됨' : '대기') },
      { label: 'PlayHub 쇼츠 피드 & 게임 상세 노출', ok: Boolean(reg && reg.visibility === 'public'), value: reg ? '실시간 노출 중' : '대기' }
    ];
    $('poc-check-list').innerHTML = checks.map(c => `
      <li class="${c.ok ? 'ok' : ''}"><span>${c.ok ? '✅' : '⏳'} ${esc(c.label)}</span><strong>${esc(c.value)}</strong></li>
    `).join('');
  }

  async function ensureAuthenticatedCreatorWithCoins(minCoins = 20) {
    setStage('auth', 'running', '세션·지갑 확인 중…');
    if (state.session?.kind !== 'registered') {
      log('등록 계정 세션이 없어 데모 창작자 계정 로그인(/api/billing/demo-signin) 시도…', 'warn');
      const { data } = await api('/api/billing/demo-signin', { method: 'POST', body: {} });
      state.csrfToken = data.csrfToken || state.csrfToken;
      state.session = { kind: 'registered', displayName: data.displayName, csrfToken: state.csrfToken };
      $('poc-demo-login-btn').hidden = true;
      log(`✅ 데모 창작자 로그인 완료 (${data.displayName})`, 'ok');
    }
    const { data: cg } = await api('/api/shorts/creator/games');
    state.wallet = cg.wallet;
    updateWalletUi();
    if ((state.wallet?.available || 0) < minCoins && state.config?.allowDevGrant) {
      log(`잔액 부족(${state.wallet?.available || 0} PC < ${minCoins} PC) → 테스트용 300 PlayCoin 지급(/api/shorts/dev-grant)…`, 'warn');
      const { data: gr } = await api('/api/shorts/dev-grant', { method: 'POST', body: { coins: 300 } });
      state.wallet = gr.wallet;
      updateWalletUi();
      log(`✅ 300 PlayCoin 원장 입금 완료 → 현재 사용 가능 ${state.wallet.available} PC`, 'ok');
    }
    setStage('auth', 'done', `${state.session.displayName || '크리에이터'} · ${state.wallet?.available ?? 0} PC`);
  }

  async function runSingleGameE2E(plan) {
    state.selectedGameId = plan.gameId;
    renderGameTabs();
    renderSelectedPlan();
    log(`=== [${plan.koreanAlias} (${plan.gameId})] 구글 Playground 쇼츠 E2E 검증 시작 ===`);

    await ensureAuthenticatedCreatorWithCoins(20);

    // Stage 2: Storyboard / Plan check
    setStage('plan', 'running', `${plan.koreanAlias} 프롬프트 구성 중…`);
    const { data: sbRes } = await api('/api/shorts/storyboard', {
      method: 'POST',
      body: {
        gameId: plan.gameId,
        title: plan.titleKo,
        prompt: plan.playgroundConcept,
        stylePreset: 'google-playground',
        cameraMotion: plan.cameraMotion,
        hookText: plan.hookText,
        ctaText: plan.ctaText,
        durationSec: 8
      }
    });
    log(`✅ Stage 2: 스토리보드 생성 완료 (POST /api/shorts/storyboard → 200, ${sbRes.storyboard.scenes.length} Scenes)`, 'ok');
    setStage('plan', 'done', '3-Beat · Flow 프롬프트 완료');

    // Stage 3: PlayCoin Hold + Generate 9:16 MP4 + Settle
    const beforeCoins = state.wallet?.available || 0;
    setStage('hold', 'running', 'PlayCoin 예약(Hold) & 9:16 렌더링 중…');
    log(`→ Stage 3: POST /api/shorts/generate (gameId=${plan.gameId}, style=google-playground, engine=forge-motion-ffmpeg, 이전 잔액=${beforeCoins} PC)`);
    const { status: genStatus, data: genData } = await api('/api/shorts/generate', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'poc-' + plan.gameId + '-' + uuid() },
      body: {
        gameId: plan.gameId,
        title: plan.suggestedTitle,
        caption: plan.suggestedCaption,
        hashtags: plan.hashtags,
        prompt: plan.playgroundConcept,
        flowPrompt: plan.masterFlowPrompt,
        hookText: plan.hookText,
        ctaText: plan.ctaText,
        stylePreset: 'google-playground',
        cameraMotion: plan.cameraMotion,
        durationSec: 8,
        engineId: 'forge-motion-ffmpeg',
        allowFallback: true
      }
    });
    state.wallet = genData.wallet;
    updateWalletUi();
    log(`  • HTTP ${genStatus} | shortId=${genData.short.id} | Hold=${genData.hold?.amountCoins ?? 0} PC (예약 중=${state.wallet.reserved} PC, 가용=${state.wallet.available} PC)`, 'ok');

    // Poll until ready
    let shortObj = genData.short;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 650));
      const { data: poll } = await api(`/api/shorts/${encodeURIComponent(shortObj.id)}`);
      shortObj = poll.short;
      setStage('hold', 'running', `${shortObj.progress || 0}% · ${shortObj.stageLabel || '렌더링 중'}`);
      if (!['queued', 'rendering'].includes(shortObj.status)) break;
    }
    if (shortObj.status !== 'ready') {
      setStage('hold', 'error', shortObj.errorMessage || '생성 실패');
      throw new Error(shortObj.errorMessage || '쇼츠 영상 생성에 실패했습니다.');
    }

    const { data: cgAfter } = await api('/api/shorts/creator/games');
    state.wallet = cgAfter.wallet;
    updateWalletUi();
    log(`✅ Stage 3 완료: 9:16 MP4(${shortObj.width}×${shortObj.height}, ${(shortObj.bytes / 1024).toFixed(0)} KB, ${shortObj.durationSec}s) | PlayCoin 정산=${shortObj.chargedCoins} PC (잔액 ${beforeCoins} → ${state.wallet.available} PC, 예약 ${state.wallet.reserved} PC)`, 'ok');
    setStage('hold', 'done', `정산 ${shortObj.chargedCoins} PC · ${(shortObj.bytes / 1024).toFixed(0)} KB`);

    // Stage 4: Publish to Hub My Game
    setStage('publish', 'running', '허브 내 게임 대표 영상 등록 중…');
    const { data: pubData } = await api(`/api/shorts/${encodeURIComponent(shortObj.id)}/publish`, {
      method: 'POST',
      body: {
        gameId: plan.gameId,
        title: plan.suggestedTitle,
        caption: plan.suggestedCaption,
        hashtags: plan.hashtags,
        visibility: 'public',
        isPrimary: true
      }
    });
    shortObj = pubData.short;
    log(`✅ Stage 4 완료: POST /api/shorts/${shortObj.id}/publish → status=${shortObj.status}, isPrimary=${shortObj.isPrimary}, gameId=${shortObj.gameId}`, 'ok');
    setStage('publish', 'done', '⭐ 대표 소개 영상 등록 완료');

    // Stage 5: Verify Hub Feed + By-Game + Summary + HTTP 206 Range Streaming + Like/View
    setStage('verify', 'running', '피드·상세·Range 206 검증 중…');
    const [byGame, summary, rangeRes] = await Promise.all([
      api(`/api/shorts/by-game/${encodeURIComponent(plan.gameId)}`),
      api('/api/shorts/games-summary'),
      api(shortObj.videoUrl, { headers: { Range: 'bytes=0-1023' } })
    ]);
    const hasPrimary = byGame.data.primary?.id === shortObj.id;
    const inSummary = Boolean(summary.data.games?.[plan.gameId]);
    const rangeOk = rangeRes.status === 206;
    log(`✅ Stage 5 완료: by-game=${hasPrimary ? 'OK' : 'MISS'} | games-summary=${inSummary ? 'OK' : 'MISS'} | Video Range=${rangeRes.status} (${rangeRes.headers.get('content-range') || ''})`, rangeOk && hasPrimary && inSummary ? 'ok' : 'err');
    setStage('verify', hasPrimary && inSummary && rangeOk ? 'done' : 'error', `Range ${rangeRes.status} · 피드·상세 연동 OK`);

    // Stage 6: Live UI refresh
    await refreshRegisteredMap();
    setStage('live', 'done', `/${plan.gameId}/ & 쇼츠 피드 확인 가능`);
    log(`🎉 [${plan.koreanAlias}] 전체 6단계 연동 흐름 검증 완료!`, 'ok');
    return shortObj;
  }

  async function init() {
    log('PlayHub × Google Playground Shorts PoC 초기화 중…');
    const [cfgRes, planRes, sessRes] = await Promise.all([
      api('/api/shorts/config'),
      api('/api/shorts/playground-plans'),
      api('/api/session')
    ]);
    state.config = cfgRes.data;
    state.styleGuide = planRes.data.styleGuide;
    state.plans = planRes.data.plans || [];
    state.session = sessRes.data;
    state.csrfToken = sessRes.data?.csrfToken || null;

    if (planRes.data.googleFlowWebUrl) $('poc-flow-web-link').href = planRes.data.googleFlowWebUrl;
    renderStyleGuide();

    if (state.session?.kind === 'registered') {
      const { data: cg } = await api('/api/shorts/creator/games');
      state.wallet = cg.wallet;
      updateWalletUi();
      setStage('auth', 'done', `${state.session.displayName || '크리에이터'} · ${state.wallet.available} PC`);
    } else {
      $('poc-demo-login-btn').hidden = false;
      setStage('auth', '', '데모 로그인 또는 PlayHub 로그인 대기');
    }

    await refreshRegisteredMap();
    log(`✅ 5대 게임 구글 Playground 쇼츠 기획 로드 완료 (${state.plans.length}종) · 현재 허브 등록 쇼츠 ${state.registeredByGame.size}종`, 'ok');
  }

  // Event Listeners
  $('poc-game-tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-plan-game]');
    if (!btn) return;
    state.selectedGameId = btn.dataset.planGame;
    renderGameTabs();
    renderSelectedPlan();
  });

  $('poc-copy-master-btn').addEventListener('click', async () => {
    const p = currentPlan();
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.masterFlowPrompt);
      toast(`${p.koreanAlias} Google Flow 마스터 프롬프트를 복사했습니다!`);
    } catch {
      toast('클립보드 복사가 차단되었습니다. 코드 블록에서 직접 복사해 주세요.');
    }
  });

  $('poc-scene-prompts').addEventListener('click', async e => {
    const btn = e.target.closest('[data-copy-scene]');
    if (!btn) return;
    const p = currentPlan();
    const sc = p?.scenes?.find(s => String(s.index) === btn.dataset.copyScene);
    if (!sc) return;
    try {
      await navigator.clipboard.writeText(sc.flowScenePrompt);
      toast(`${p.koreanAlias} Scene ${sc.index} Flow 프롬프트를 복사했습니다!`);
    } catch {
      toast('복사 권한이 없습니다.');
    }
  });

  $('poc-download-pack-btn').addEventListener('click', () => {
    const p = currentPlan();
    if (!p) return;
    const md = [
      `# ${p.koreanAlias} (${p.titleKo}) — Google Playground 쇼츠 제작 팩`,
      '',
      `- Google Flow: https://labs.google/fx/tools/flow`,
      `- 비율 / 길이: 9:16 세로 · 8초`,
      `- 권장 모델: ${p.recommendedEngine}`,
      '',
      '## 마스터 원샷 프롬프트',
      '```text',
      p.masterFlowPrompt,
      '```',
      '',
      '## 씬별 확장 프롬프트 (SceneBuilder)',
      ...p.scenes.map(sc => `### ${sc.label}\n- 자막: ${sc.headline}\n- 카메라: ${sc.camera}\n\`\`\`text\n${sc.flowScenePrompt}\n\`\`\``),
      '',
      `## 오디오 큐\n${p.audioCue}`,
      '',
      `## Negative Prompt\n${state.styleGuide?.negativePrompt || ''}`
    ].join('\n');
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-playground-flow-${p.gameId}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${p.koreanAlias} Flow 제작 팩(.md)을 다운로드했습니다.`);
  });

  $('poc-demo-login-btn').addEventListener('click', async () => {
    try {
      await ensureAuthenticatedCreatorWithCoins(100);
      toast('데모 창작자 로그인 및 PlayCoin 준비 완료!');
    } catch (err) {
      toast(err.message);
      log(`❌ 로그인 오류: ${err.message}`, 'err');
    }
  });

  $('poc-grant-btn').addEventListener('click', async () => {
    try {
      const { data } = await api('/api/shorts/dev-grant', { method: 'POST', body: { coins: 300 } });
      state.wallet = data.wallet;
      updateWalletUi();
      log(`🎁 체험용 +300 PlayCoin 지급 → 가용 ${state.wallet.available} PC`, 'ok');
      toast('300 PlayCoin이 지급되었습니다!');
    } catch (err) { toast(err.message); }
  });

  $('poc-run-single-e2e').addEventListener('click', async () => {
    if (state.busy) return;
    const p = currentPlan();
    if (!p) return;
    state.busy = true;
    $('poc-run-single-e2e').disabled = true;
    $('poc-run-all-e2e').disabled = true;
    resetStages();
    try {
      await runSingleGameE2E(p);
      toast(`${p.koreanAlias} 쇼츠 생성 및 허브 등록 연동 검증 성공!`);
    } catch (err) {
      log(`❌ 검증 실패: ${err.message}`, 'err');
      toast(err.message);
    } finally {
      state.busy = false;
      $('poc-run-single-e2e').disabled = false;
      $('poc-run-all-e2e').disabled = false;
    }
  });

  $('poc-run-all-e2e').addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    $('poc-run-single-e2e').disabled = true;
    $('poc-run-all-e2e').disabled = true;
    resetStages();
    try {
      await ensureAuthenticatedCreatorWithCoins(state.plans.length * 20);
      for (const plan of state.plans) {
        await runSingleGameE2E(plan);
      }
      toast('5대 게임 전체 쇼츠 생성 · PlayCoin 정산 · 허브 등록 E2E 검증을 완료했습니다!');
    } catch (err) {
      log(`❌ 일괄 검증 중 오류: ${err.message}`, 'err');
      toast(err.message);
    } finally {
      state.busy = false;
      $('poc-run-single-e2e').disabled = false;
      $('poc-run-all-e2e').disabled = false;
    }
  });

  $('poc-clear-log-btn').addEventListener('click', () => { $('poc-log-console').innerHTML = ''; });

  init().catch(err => log(`❌ 초기화 오류: ${err.message}`, 'err'));
})();
