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

  const params = new URLSearchParams(location.search);
  const IS_EMBEDDED = params.get('embedded') === '1';
  const QUERY_GAME_ID = params.get('game') || '';
  const QUERY_PROJECT_ID = params.get('project') || '';
  const QUERY_PROJECT_NAME = params.get('projectName') || '';
  const FORGE_API_BASE = location.pathname.startsWith('/forge/') ? '/forge/api' : '/api';

  const BEAT_TAGS = ['오프닝', '전개', '타깃', '클라이맥스', 'CTA'];
  const FORGE_OAUTH_IDS = [
    { id: 'chatgpt-connect', name: 'ChatGPT Plus / Pro', desc: 'OpenAI 개인 구독 브라우저 OAuth (Codex CLI)' },
    { id: 'claude-connect', name: 'Claude Pro / Max', desc: 'Anthropic 개인 구독 브라우저 OAuth (Claude Code CLI)' },
    { id: 'gemini-connect', name: 'Google Gemini CLI', desc: 'Google 개인 계정 브라우저 OAuth (Gemini CLI)' }
  ];

  const state = {
    step: 1,
    session: null,
    csrfToken: null,
    wallet: null,
    config: null,
    experimentalEnabled: false,
    aiAuth: null,
    forgeProviders: null,
    forgeProvidersError: '',
    plans: [],
    games: [],
    selectedGameId: '',
    srcMode: 'game-cover', // 'game-cover' | 'upload-video' | 'upload-images'
    uploadedVideo: null,   // { name, size, base64 }
    uploadedImages: [],    // [{ name, dataUrl, badge, headline, caption, narration }]
    hl1: '',
    hl2: '',
    beats: [],
    flowPrompt: '',
    selectedRoute: 'generative-mp4',
    lastCreatedShort: null,
    registeredCountByGame: new Map(),
    previewDisposer: null,
    busy: false
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('pl-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3800);
  }

  function log(msg, level = 'info') {
    const el = $('pl-log-console');
    if (!el) return;
    const now = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    const row = document.createElement('div');
    row.className = `pl-log-line ${level}`;
    row.innerHTML = `<span class="pl-log-time">[${esc(now)}]</span>${esc(msg)}`;
    el.appendChild(row);
    el.scrollTop = el.scrollHeight;
  }

  async function api(path, { method = 'GET', body, headers = {}, timeout = 60000 } = {}) {
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

  async function portalApi(path, opts = {}) {
    const { data } = await api(path, opts);
    return data;
  }

  function currentPlan() {
    return state.plans.find(p => p.gameId === state.selectedGameId) || null;
  }

  function currentGameMeta() {
    const p = currentPlan();
    const g = state.games.find(x => x.gameId === state.selectedGameId);
    return {
      gameId: state.selectedGameId,
      title: g?.title || p?.titleKo || QUERY_PROJECT_NAME || state.selectedGameId || 'PlayForge 프로젝트',
      shortAlias: p?.koreanAlias || g?.title || QUERY_PROJECT_NAME || state.selectedGameId || '내 게임',
      desc: g?.description || p?.playgroundConcept || 'PlayForge에서 제작 중인 게임 소개 쇼츠',
      coverUrl: p?.coverUrl || g?.coverUrl || '',
      ownershipLabel: g?.ownershipLabel || (state.selectedGameId ? '소유권 검증됨' : '게임 미선택')
    };
  }

  function applyExperimentalUiVisibility() {
    const forgeGate = window.PlayForgeDevDemoUI;
    const serverExp = Boolean(state.config?.experimentalEnabled);
    // Available when server allows experimental AND (if PlayForgeDevDemoUI is loaded, it's toggled ON)
    const expAllowed = serverExp && (!forgeGate || forgeGate.isEnabled());
    state.experimentalEnabled = expAllowed;

    const gateBanner = $('pl-exp-gate-banner');
    const mainApp = $('pl-main-app');
    const enableBtn = $('pl-exp-enable-btn');

    if (!serverExp) {
      if (gateBanner) gateBanner.hidden = false;
      if (mainApp) mainApp.hidden = true;
      if (enableBtn) enableBtn.hidden = true;
      if ($('pl-exp-gate-badge')) $('pl-exp-gate-badge').textContent = 'PROD BUILD';
      if ($('pl-exp-gate-desc')) $('pl-exp-gate-desc').textContent = '운영(Prod/Release) 빌드에서는 실험 기능(AI 쇼츠 생성기)이 비활성화되어 있습니다.';
    } else if (forgeGate && !forgeGate.isEnabled() && !IS_EMBEDDED) {
      if (gateBanner) gateBanner.hidden = false;
      if (mainApp) mainApp.hidden = true;
      if (enableBtn) enableBtn.hidden = false;
      if ($('pl-exp-gate-badge')) $('pl-exp-gate-badge').textContent = `${String(forgeGate.getBuildMode?.() || 'DEV').toUpperCase()} · OFF`;
      if ($('pl-exp-gate-desc')) $('pl-exp-gate-desc').textContent = 'Dev · Debug · Test 빌드에서 실험 기능을 ON으로 전환하면 PlayHub 쇼츠 피드와 PlayForge 쇼츠 생성기가 함께 활성화됩니다. (F5 새로고침 유지)';
    } else {
      if (gateBanner) gateBanner.hidden = true;
      if (mainApp) mainApp.hidden = false;
    }

    const exp = expAllowed;
    $('pl-dev-badge').hidden = !exp;
    $('s1-preset-pills').hidden = !(exp && state.plans.length > 0);
    $('s1-load-sample-video').hidden = !exp;
    $('s1-load-sample-images').hidden = !exp;
    $('s3-run-batch-btn').hidden = !(exp && state.plans.length > 0);
    $('s4-console-details').hidden = !exp;
    if (exp) $('s4-console-details').open = true;

    const isReg = state.session?.kind === 'registered';
    $('pl-grant-btn').hidden = !(exp && isReg && state.config?.allowDevGrant);
    $('pl-demo-login-btn').hidden = !(exp && !isReg);
    $('pl-account-login-link').hidden = !(!exp && !isReg);
  }

  function applyEmbeddedChrome() {
    if (!IS_EMBEDDED) return;
    document.body.classList.add('is-embedded');
    if ($('pl-back-hub')) $('pl-back-hub').hidden = true;
    $('pl-back-forge').hidden = true;
    $('pl-close-drawer-btn').hidden = false;
    $('s1-capture-editor-btn').hidden = false;
  }

  function countConnectedPersonalAi() {
    let n = 0;
    if (state.aiAuth?.google?.connected || state.config?.personalVeoConnected) n++;
    const forgeList = Array.isArray(state.forgeProviders) ? state.forgeProviders : [];
    for (const item of FORGE_OAUTH_IDS) {
      const found = forgeList.find(p => p.id === item.id);
      if (found?.auth === 'connected' || found?.configured) n++;
    }
    return n;
  }

  function updateAiAuthHeaderBadge() {
    const btn = $('pl-ai-auth-btn');
    const dot = $('pl-ai-auth-dot');
    const label = $('pl-ai-auth-label');
    const connectedCount = countConnectedPersonalAi();
    const googleConn = Boolean(state.aiAuth?.google?.connected || state.config?.personalVeoConnected);
    btn.classList.toggle('connected', connectedCount > 0);
    dot.classList.toggle('off', connectedCount === 0);
    if (googleConn) {
      label.textContent = connectedCount > 1 ? `AI OAuth 연결됨 (${connectedCount})` : 'Google OAuth 연결됨 (0 PC)';
    } else if (connectedCount > 0) {
      label.textContent = `개인 AI 연결됨 (${connectedCount})`;
    } else {
      label.textContent = 'AI OAuth 연결';
    }
  }

  function computeEffectiveRoute() {
    if (state.srcMode === 'upload-video') {
      return { id: 'direct-video', label: '직접 촬영 영상 숏폼화', renderMode: 'generative-video', cost: 0, endpoint: 'shortform-video' };
    }
    const isOwnImgs = state.srcMode === 'upload-images' && state.uploadedImages.length > 0;
    if (state.selectedRoute === 'motion-graphic') {
      return { id: 'motion-graphic', label: '무영상 모션그래픽', renderMode: 'motion-graphic', cost: isOwnImgs ? 0 : 10, endpoint: isOwnImgs ? 'shortform-images' : 'generate', engineId: 'motion-graphic-web' };
    }
    if (state.selectedRoute === 'carousel-images') {
      return { id: 'carousel-images', label: '유튜브 가로 4컷', renderMode: 'carousel-images', cost: isOwnImgs ? 0 : 5, endpoint: isOwnImgs ? 'shortform-images' : 'generate', engineId: 'youtube-carousel-web' };
    }
    if (state.selectedRoute === 'veo-fast' && !isOwnImgs) {
      const personalVeo = Boolean(state.config?.personalVeoConnected);
      const veoOn = Boolean(state.config?.veoConfigured);
      return {
        id: 'veo-fast',
        label: personalVeo ? 'Veo 3.1 (내 Google OAuth)' : (veoOn ? 'Google Flow Veo Fast' : 'Veo Fast (로컬 자동 폴백)'),
        renderMode: 'generative-video',
        cost: personalVeo ? 0 : (veoOn ? 60 : 20),
        endpoint: 'generate',
        engineId: 'google-flow-veo-fast'
      };
    }
    return {
      id: 'generative-mp4',
      label: isOwnImgs ? '내 이미지 9:16 MP4' : '생성형 9:16 MP4',
      renderMode: 'generative-video',
      cost: isOwnImgs ? 0 : 20,
      endpoint: isOwnImgs ? 'shortform-images' : 'generate',
      engineId: 'forge-motion-ffmpeg'
    };
  }

  function setStep(stepNum) {
    state.step = Math.max(1, Math.min(4, Number(stepNum) || 1));
    document.querySelectorAll('[data-step-panel]').forEach(el => {
      el.hidden = Number(el.dataset.stepPanel) !== state.step;
    });
    document.querySelectorAll('#pl-stepper .pl-step').forEach(btn => {
      const n = Number(btn.dataset.goStep);
      btn.classList.toggle('active', n === state.step);
      btn.classList.toggle('done', n < state.step);
      btn.setAttribute('aria-current', n === state.step ? 'step' : 'false');
      const ico = btn.querySelector(`[data-step-ico="${n}"]`);
      const tag = btn.querySelector(`[data-step-tag="${n}"]`);
      if (ico) ico.textContent = n < state.step ? '✓' : String(n);
      if (tag && n !== 3) tag.textContent = n < state.step ? '완료' : (n === state.step ? '진행 중' : '대기');
      if (n === state.step) {
        try { btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch {}
      }
    });
    document.querySelectorAll('.pl-mobile-nav [data-go-step]').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.goStep) === state.step);
    });
    syncStepperSummaries();
    if (state.step === 3) renderStep3Engines();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function syncStepperSummaries() {
    const route = computeEffectiveRoute();
    $('st-sub-1').textContent = state.srcMode === 'upload-video'
      ? (state.uploadedVideo ? '녹화 영상 1개' : '영상 대기')
      : state.srcMode === 'upload-images'
        ? `이미지 ${state.uploadedImages.length}장`
        : '게임 커버';
    $('st-sub-2').textContent = `${state.beats.filter(b => b.text.trim()).length}-Beat 대본`;
    $('st-sub-3').textContent = route.label;
    const tag3 = document.querySelector('[data-step-tag="3"]');
    if (tag3) tag3.textContent = route.cost === 0 ? '무료 0 PC' : `${route.cost} PC`;
  }

  function updateWalletUi(beforeOverride = null, deltaOverride = null) {
    const avail = Number(state.wallet?.available || 0);
    const reserved = Number(state.wallet?.reserved || 0);
    const route = computeEffectiveRoute();
    $('pl-wallet-avail').textContent = `${avail.toLocaleString()} PC`;
    $('pl-wallet-hold').textContent = `예약 ${reserved.toLocaleString()} PC`;
    applyExperimentalUiVisibility();

    $('s3-bal-now').textContent = `${avail.toLocaleString()} PC`;
    $('s3-bal-hold').textContent = route.cost === 0 ? '무료 0 PC' : `-${route.cost} PC`;
    $('s3-bal-after').textContent = `${Math.max(0, avail - route.cost).toLocaleString()} PC`;

    const before = beforeOverride !== null ? beforeOverride : avail;
    const delta = deltaOverride !== null ? deltaOverride : route.cost;
    $('pr-bal-before').textContent = `${before.toLocaleString()} PC`;
    $('pr-bal-delta').textContent = delta === 0 ? '0 PC (무료)' : `-${delta} PC`;
    $('pr-bal-after').textContent = `${Math.max(0, before - delta).toLocaleString()} PC`;

    const execBtn = $('s3-execute-btn');
    if (execBtn) {
      execBtn.textContent = route.cost === 0
        ? '⚡ 무료(0 PC) 파이프라인 실행 →'
        : `⚡ ${route.cost} PC 예약 및 파이프라인 실행 →`;
    }
  }

  function loadGamePresetIntoEditor(gameId) {
    state.selectedGameId = gameId || '';
    state.lastCreatedShort = null;
    const p = currentPlan();
    const gm = currentGameMeta();

    $('pl-header-game-name').textContent = gm.shortAlias;
    $('pl-header-owner-badge').textContent = gm.ownershipLabel.includes('퍼블리시') ? '내 게임 소유권 확인' : gm.ownershipLabel;
    $('s1-owner-badge').textContent = `✓ ${gm.ownershipLabel}`;
    $('s1-game-thumb').src = gm.coverUrl || 'vendor/favicon.png';
    $('s1-game-desc').textContent = gm.desc;

    state.hl1 = p?.topHeadline?.line1 || `${gm.shortAlias} 실전 플레이`;
    state.hl2 = p?.topHeadline?.line2 || '8초 만에 끝내는 핵심 하이라이트';
    state.beats = (p?.narration && p.narration.length)
      ? p.narration.map(n => ({ startSec: n.startSec, endSec: n.endSec, text: n.text }))
      : [
        { startSec: 0, endSec: 2.0, text: `${gm.shortAlias}, 지금 바로 시작!` },
        { startSec: 2.0, endSec: 4.5, text: '설치 없이 브라우저에서 즉시 플레이!' },
        { startSec: 4.5, endSec: 6.5, text: '핵심 액션 한 방으로 전장 제압!' },
        { startSec: 6.5, endSec: 8.0, text: '플레이허브에서 바로 도전하세요!' }
      ];
    state.flowPrompt = p?.masterFlowPrompt || `Vertical 9:16 gameplay highlight trailer for "${gm.title}", energetic camera zoom, crisp HUD, 8 seconds, upbeat arcade synth.`;

    renderPresetPills();
    renderCoverFrames();
    renderStep2Editor();
    renderStep3Engines();
    renderLivePreview();
    syncStepperSummaries();
  }

  function renderPresetPills() {
    if (!state.experimentalEnabled || !state.plans.length) {
      $('s1-preset-pills').hidden = true;
      return;
    }
    $('s1-preset-pills').hidden = false;
    $('s1-preset-pills').innerHTML = state.plans.map(p => {
      const active = p.gameId === state.selectedGameId;
      const cnt = state.registeredCountByGame.get(p.gameId) || 0;
      return `<button type="button" class="pl-preset-pill${active ? ' active' : ''}" data-pick-game="${esc(p.gameId)}">
        ${esc(p.koreanAlias)}${cnt ? ` <small>${cnt}개</small>` : ''}
      </button>`;
    }).join('');
  }

  function renderCoverFrames() {
    const p = currentPlan();
    const gm = currentGameMeta();
    const slides = p?.carouselSlides || [
      { badge: '컷 1 · 오프닝' }, { badge: '컷 2 · 전개' }, { badge: '컷 3 · 클라이맥스' }, { badge: '컷 4 · CTA' }
    ];
    $('s1-cover-frames').innerHTML = slides.slice(0, 4).map((sl, i) => `
      <div class="pl-frame-tile">
        <img src="${esc(gm.coverUrl || 'vendor/favicon.png')}" alt="컷 ${i + 1}">
        <span class="pl-frame-badge">${esc(sl.badge || `컷 ${i + 1}`)}</span>
      </div>
    `).join('');
  }

  function renderUploadedImagesGrid() {
    const el = $('s1-images-grid');
    if (!state.uploadedImages.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = state.uploadedImages.map((img, i) => `
      <div class="pl-frame-tile">
        <img src="${esc(img.dataUrl)}" alt="컷 ${i + 1}">
        <span class="pl-frame-badge">${i + 1}/${state.uploadedImages.length} · ${esc(img.name)}</span>
        <button type="button" class="pl-frame-del" data-del-img="${i}" aria-label="제거">×</button>
      </div>
    `).join('');
  }

  function renderStep2Editor() {
    $('s2-hl-line1').value = state.hl1;
    $('s2-hl-line2').value = state.hl2;
    $('s2-flow-prompt').value = state.flowPrompt;
    syncHeadlineSwatch();

    $('s2-beat-list').innerHTML = state.beats.map((b, i) => `
      <div class="pl-beat-row">
        <span class="pl-beat-time">${Number(b.startSec).toFixed(1)}s</span>
        <span class="pl-beat-tag">${BEAT_TAGS[i] || `Beat ${i + 1}`}</span>
        <input type="text" maxlength="44" value="${esc(b.text)}" data-beat-idx="${i}" aria-label="나래이션 ${i + 1}">
      </div>
    `).join('');
  }

  function syncHeadlineSwatch() {
    $('s2-l1-count').textContent = `${state.hl1.length}/22`;
    $('s2-l2-count').textContent = `${state.hl2.length}/22`;
    $('s2-sw-l1').textContent = state.hl1 || '상단 1줄 헤드라인';
    $('s2-sw-l2').textContent = state.hl2 || '상단 2줄 강조 문구';
  }

  function renderStep3Engines() {
    const personalVeo = Boolean(state.config?.personalVeoConnected);
    const veoOn = Boolean(state.config?.veoConfigured);
    const isOwnVideo = state.srcMode === 'upload-video';
    const isOwnImgs = state.srcMode === 'upload-images' && state.uploadedImages.length > 0;

    $('s3-routing-dot').classList.toggle('off', !veoOn && !isOwnVideo && !isOwnImgs);
    $('s3-routing-title').textContent = personalVeo
      ? `개인 Google OAuth 실연동 활성 (${state.config.veoMode}) · Veo 3.1 생성 시 0 PC`
      : veoOn
        ? `Google Flow · Veo 3.1 API 실연동 활성 (${state.config.veoMode})`
        : '스마트 라우팅 활성 · 개인 AI OAuth 연결 시 Veo 3.1 무료(0 PC), 미연결 시 로컬 FFmpeg+TTS 자동 폴백';
    $('s3-routing-desc').textContent = isOwnVideo
      ? '직접 촬영한 MP4/WebM에 자막·한국어 나래이션을 합성하는 무료(0 PC) 파이프라인이 선택되었습니다.'
      : isOwnImgs
        ? `업로드한 ${state.uploadedImages.length}장 스크린샷을 0 PC(무료)로 3종 포맷 중 원하는 형태로 변환합니다.`
        : '상단 [AI OAuth 연결]에서 개인 Google OAuth 2.0 / Gemini 키 / ChatGPT·Claude 구독을 연결할 수 있습니다.';

    const cards = isOwnVideo ? [
      {
        id: 'direct-video',
        title: '📹 직접 촬영 영상 숏폼화 (9:16 MP4)',
        badge: '무료',
        desc: '업로드한 녹화 영상에 2줄 헤드라인 · 노랑 자막 · 한국어 TTS(원본음 자동 덕킹)를 합성합니다.',
        priceText: '0 PC (무료)',
        free: true
      }
    ] : [
      {
        id: 'generative-mp4',
        title: isOwnImgs ? '🎬 내 이미지 9:16 MP4 영상 합성' : '🎬 생성형 9:16 MP4 (FFmpeg + 한국어 TTS)',
        badge: '추천',
        desc: '720×1280 H.264/AAC · 2줄 헤드라인 + 노랑 자막 + 한국어 음성 나래이션 & BGM 믹스',
        priceText: isOwnImgs ? '0 PC (무료)' : '20 PC',
        free: isOwnImgs
      },
      {
        id: 'motion-graphic',
        title: '✨ 무영상 모션그래픽 (틱톡·컷츠 UI)',
        badge: '0MB 초경량',
        desc: 'MP4 파일 없이 60fps 모션·노랑 나래이션 자막·브라우저 한국어 TTS로 즉시 재생',
        priceText: isOwnImgs ? '0 PC (무료)' : '10 PC',
        free: isOwnImgs
      },
      {
        id: 'carousel-images',
        title: '🖼️ 유튜브 가로 스크롤 4컷 이미지 카드',
        badge: '가로 스와이프',
        desc: '1/4~4/4 배지 · 가로 스냅 스와이프 · 하단 도트 · 컷별 나래이션/TTS 지원',
        priceText: isOwnImgs ? '0 PC (무료)' : '5 PC',
        free: isOwnImgs
      },
      ...(!isOwnImgs ? [{
        id: 'veo-fast',
        title: '🚀 Google Flow · Veo 3.1 Fast API',
        badge: personalVeo ? '내 Google OAuth' : (veoOn ? '실연동' : '자동 폴백'),
        desc: personalVeo
          ? '연결된 개인 Google 계정(OAuth/API 키)으로 직접 생성 · PlayCoin 차감 없음'
          : (veoOn ? 'Veo 3.1 원격 생성형 MP4 (720p · 네이티브 오디오)' : '개인 AI 미연결 시 로컬 FFmpeg(20 PC)로 자동 전환 및 40 PC 차액 반환'),
        priceText: personalVeo ? '0 PC (내 계정)' : (veoOn ? '60 PC' : '20 PC 폴백'),
        free: personalVeo
      }] : [])
    ];

    if (!cards.some(c => c.id === state.selectedRoute)) {
      state.selectedRoute = cards[0].id;
    }

    $('s3-engine-list').innerHTML = cards.map(c => {
      const active = c.id === state.selectedRoute;
      return `
        <button type="button" class="pl-eng-card${active ? ' active' : ''}" data-pick-route="${esc(c.id)}" aria-pressed="${active}">
          <div>
            <div class="pl-eng-title">
              <span>${esc(c.title)}</span>
              <span class="pl-badge ${c.free ? 'green' : 'blue'}">${esc(c.badge)}</span>
            </div>
            <p class="pl-eng-desc">${esc(c.desc)}</p>
          </div>
          <span class="pl-eng-price${c.free ? ' free' : ''}">${esc(c.priceText)}</span>
        </button>`;
    }).join('');

    syncStepperSummaries();
    updateWalletUi();
  }

  function disposePreview() {
    if (state.previewDisposer) {
      try { state.previewDisposer(); } catch {}
      state.previewDisposer = null;
    }
  }

  function renderLivePreview(forcedShort = null) {
    disposePreview();
    const slot = $('pl-preview-slot');
    if (!slot || !window.PlayHubShorts?.mountShortPlayer) return;

    const s = forcedShort || state.lastCreatedShort;
    if (s) {
      const rm = s.renderMode || 'generative-video';
      $('pr-format-badge').textContent = rm === 'carousel-images' ? '가로 4컷' : (rm === 'motion-graphic' ? '무영상 모션' : '9:16 MP4');
      state.previewDisposer = window.PlayHubShorts.mountShortPlayer(slot, s, {
        api: portalApi,
        toast,
        compact: true,
        muted: true
      });
      $('pl-preview-foot').innerHTML = `
        <span><strong>${esc(s.resolvedEngineName || s.engineId)}</strong> · ${s.hasVideoFile ? `${(s.bytes / 1024).toFixed(0)} KB` : '무영상 0MB'} · ${s.chargedCoins} PC</span>
        ${s.status === 'published' ? `<a href="/?view=shorts&amp;short=${encodeURIComponent(s.id)}" target="_blank" rel="noopener" style="color:var(--primary-container);font-weight:700;text-decoration:none">피드 보기 ↗</a>` : '<span>생성 완료</span>'}`;
      return;
    }

    const p = currentPlan();
    const gm = currentGameMeta();
    const route = computeEffectiveRoute();
    const previewMode = route.renderMode === 'carousel-images' ? 'carousel-images' : 'motion-graphic';
    $('pr-format-badge').textContent = previewMode === 'carousel-images' ? '4컷 미리보기' : '9:16 실시간 프리뷰';

    const slides = (state.srcMode === 'upload-images' && state.uploadedImages.length)
      ? state.uploadedImages.map((img, i) => ({
          index: i + 1,
          badge: img.badge || `${i + 1}/${state.uploadedImages.length} · 컷 ${i + 1}`,
          headline: state.beats[i]?.text || img.headline || gm.title,
          caption: img.caption || gm.shortAlias,
          narration: state.beats[i]?.text || img.narration || gm.title,
          imageUrl: img.dataUrl,
          zoomOrigin: '50% 50%',
          cropScale: 1.0,
          accent: ['#4285F4', '#EA4335', '#FBBC04', '#34A853'][i % 4]
        }))
      : (p?.carouselSlides || []);

    const draftModel = {
      id: `draft_${gm.gameId || 'forge'}`,
      creatorName: state.session?.displayName || 'PlayForge 크리에이터',
      gameId: gm.gameId,
      title: previewMode === 'carousel-images' ? (p?.carouselTitle || `${gm.shortAlias} 4컷`) : `${gm.shortAlias} 쇼츠`,
      caption: p?.suggestedCaption || gm.desc,
      renderMode: previewMode,
      durationSec: Number($('s1-duration')?.value) || 8,
      posterUrl: (state.srcMode === 'upload-images' && state.uploadedImages[0]?.dataUrl) || gm.coverUrl || 'vendor/favicon.png',
      videoUrl: null,
      likeCount: 0,
      viewCount: 0,
      topHeadline: { line1: state.hl1, line2: state.hl2 },
      narration: state.beats,
      bestComment: p?.bestComment || { author: '플허유저(play****)', text: '자막이랑 나래이션 싱크 깔끔하네요!' },
      carouselTitle: p?.carouselTitle || `${gm.shortAlias} 핵심 4컷 요약`,
      carouselSlides: slides,
      motionSpec: {
        coverUrl: gm.coverUrl || 'vendor/favicon.png',
        frameUrls: (state.srcMode === 'upload-images' && state.uploadedImages.length)
          ? state.uploadedImages.map(i => i.dataUrl)
          : [gm.coverUrl || 'vendor/favicon.png']
      },
      game: { id: gm.gameId, title: gm.title, coverUrl: gm.coverUrl, playUrl: gm.gameId ? `/play/${gm.gameId}/` : '/' }
    };

    state.previewDisposer = window.PlayHubShorts.mountShortPlayer(slot, draftModel, {
      api: null,
      toast,
      compact: true,
      muted: true
    });
    $('pl-preview-foot').innerHTML = `<span>편집 중인 헤드라인·대본이 실시간 반영됩니다.</span><span>${route.cost === 0 ? '무료 0 PC' : `${route.cost} PC`}</span>`;
  }

  function setCheck(key, cls, text) {
    const li = document.querySelector(`#s4-check-steps li[data-chk="${key}"]`);
    const em = document.querySelector(`[data-chk-st="${key}"]`);
    if (li) {
      li.classList.remove('done', 'running', 'error');
      if (cls) li.classList.add(cls);
    }
    if (em) em.textContent = text;
  }

  function resetStep4Checks() {
    for (const k of ['auth', 'prep', 'render', 'verify', 'publish']) {
      setCheck(k, '', '대기');
    }
    $('s4-progress-pct').textContent = '0%';
    $('s4-progress-bar').style.width = '0%';
    $('s4-publish-links').hidden = true;
    $('s4-link-download').hidden = true;
  }

  async function ensureAuthAndCoins(minCoins = 0) {
    if (state.session?.kind !== 'registered') {
      if (!state.experimentalEnabled) {
        throw new Error('PlayHub 계정 로그인이 필요합니다. 상단의 [계정 로그인 ↗]에서 로그인한 뒤 다시 시도해 주세요.');
      }
      log('개발용 데모 크리에이터 자동 로그인 (/api/billing/demo-signin)…', 'warn');
      const { data } = await api('/api/billing/demo-signin', { method: 'POST', body: {} });
      state.csrfToken = data.csrfToken || state.csrfToken;
      state.session = { kind: 'registered', displayName: data.displayName, csrfToken: state.csrfToken };
      applyExperimentalUiVisibility();
      log(`✅ 크리에이터 인증 완료 (${data.displayName})`, 'ok');
    }
    const { data: cg } = await api('/api/shorts/creator/games');
    state.games = cg.games || [];
    state.wallet = cg.wallet;
    while ((state.wallet?.available || 0) < minCoins && state.experimentalEnabled && state.config?.allowDevGrant) {
      const { data: gr } = await api('/api/shorts/dev-grant', { method: 'POST', body: { coins: 300 } });
      state.wallet = gr.wallet;
      log(`🪙 개발용 +300 PlayCoin 충전 → 가용 ${state.wallet.available} PC`, 'ok');
    }
    updateWalletUi();
  }

  // ===== Personal Subscription AI OAuth Management =====
  async function refreshPersonalAiAuth() {
    if (state.session?.kind === 'registered') {
      try {
        const [{ data: authData }, { data: cfgData }] = await Promise.all([
          api('/api/shorts/ai-auth/status'),
          api('/api/shorts/config')
        ]);
        state.aiAuth = authData;
        state.config = cfgData;
      } catch {
        state.aiAuth = null;
      }
    } else {
      state.aiAuth = null;
    }

    // Also query PlayForge's native personal-subscription OAuth providers (local loopback editor only)
    const isLoopbackHost = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(location.hostname);
    if (!isLoopbackHost) {
      state.forgeProviders = null;
      state.forgeProvidersError = '로컬 PlayForge(127.0.0.1)에서 접속하면 ChatGPT · Claude · Gemini CLI 브라우저 OAuth 연결이 활성화됩니다.';
    } else {
      try {
        const res = await fetch(`${FORGE_API_BASE}/agent-chat/providers`, { credentials: 'same-origin', cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.providers)) {
          state.forgeProviders = data.providers;
          state.forgeProvidersError = '';
        } else {
          state.forgeProviders = null;
          state.forgeProvidersError = res.status === 403
            ? '로컬 PlayForge(127.0.0.1)에서 접속하면 ChatGPT · Claude · Gemini CLI 브라우저 OAuth 연결이 활성화됩니다.'
            : (data.error || 'PlayForge OAuth 상태를 불러오지 못했습니다.');
        }
      } catch {
        state.forgeProviders = null;
        state.forgeProvidersError = 'PlayForge 에이전트 OAuth 서버에 연결할 수 없습니다.';
      }
    }

    renderAiAuthModal();
    updateAiAuthHeaderBadge();
    renderStep3Engines();
  }

  function renderAiAuthModal() {
    const g = state.aiAuth?.google;
    const badge = $('ai-google-badge');
    const connBox = $('ai-google-connected-box');
    const oauthBtn = $('ai-google-oauth-btn');
    const gcloudBtn = $('ai-gcloud-btn');
    const hint = $('ai-google-oauth-hint');

    if (g?.connected) {
      badge.textContent = '연결됨 · 0 PC';
      badge.className = 'pl-badge green';
      connBox.hidden = false;
      const modeText = g.mode === 'vertex-oauth' ? 'Vertex AI OAuth 2.0' : 'Gemini API Key';
      $('ai-google-conn-summary').textContent = `${modeText} 연결됨${g.email ? ` (${g.email})` : ''}`;
      $('ai-google-conn-detail').textContent = [
        g.vertexProject ? `프로젝트: ${g.vertexProject}` : null,
        g.maskedSecret ? `인증: ${g.maskedSecret}` : null,
        'Veo 3.1 생성 시 PlayCoin 차감 없음'
      ].filter(Boolean).join(' · ');
    } else {
      badge.textContent = '미연결';
      badge.className = 'pl-badge';
      connBox.hidden = true;
    }

    const oauthReady = Boolean(state.aiAuth?.googleOAuthConfigured);
    oauthBtn.disabled = false;
    gcloudBtn.hidden = !(state.experimentalEnabled && state.aiAuth?.gcloudAvailable);
    const redirectUri = `${location.origin}/api/shorts/ai-auth/google/callback`;
    if ($('ai-redirect-uri-text')) $('ai-redirect-uri-text').textContent = `승인된 리디렉션 URI: ${redirectUri}`;
    if ($('ai-oauth-client-setup')) $('ai-oauth-client-setup').hidden = oauthReady;
    const isLikelyWebView = /KAKAOTALK|FBAN|FBAV|Instagram|Line\/|NAVER|WebView|; wv\)/i.test(navigator.userAgent || '');
    if ($('ai-webview-warn')) $('ai-webview-warn').hidden = !isLikelyWebView;

    hint.textContent = oauthReady
      ? '공식 Google OAuth 2.0 (PKCE) 팝업으로 Vertex AI 권한을 안전하게 연결합니다.'
      : '서버 환경변수(PLAYHUB_GOOGLE_CLIENT_ID)가 미설정입니다. 아래 [Google OAuth Client ID 직접 입력]에 본인 GCP 클라이언트 ID를 넣고 로그인하거나, [빠른 직접 연결]에서 Gemini API 키를 바로 연결하세요.';

    // Render PlayForge native OAuth providers
    const host = $('ai-forge-providers');
    if (state.forgeProvidersError) {
      const localPcUrl = `http://127.0.0.1:18160/forge/OfficialGodot/shorts-studio.html?devDemoUi=1`;
      host.innerHTML = `<div class="pl-muted-sm">${esc(state.forgeProvidersError)}</div>
        <div class="pl-inline" style="margin-top:6px">
          <a class="pl-btn ghost xs" href="${localPcUrl}" target="_blank" rel="noopener">💻 PC 로컬 주소 열기 (127.0.0.1)</a>
          <button type="button" class="pl-btn ghost xs" id="ai-copy-local-pc-url">📋 PC 주소 복사</button>
        </div>`;
      $('ai-copy-local-pc-url')?.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(localPcUrl); toast('PC 로컬 주소를 복사했습니다.'); } catch { toast(localPcUrl); }
      });
      return;
    }
    const list = Array.isArray(state.forgeProviders) ? state.forgeProviders : [];
    host.innerHTML = FORGE_OAUTH_IDS.map(meta => {
      const p = list.find(x => x.id === meta.id);
      const isConn = Boolean(p?.auth === 'connected' || p?.configured);
      const email = p?.email ? ` · ${p.email}` : '';
      return `
        <div class="pl-forge-prov-row">
          <div class="pl-forge-prov-meta">
            <strong>${esc(meta.name)} <span class="pl-badge ${isConn ? 'green' : ''}" style="margin-left:4px">${isConn ? '연결됨' : '미연결'}</span></strong>
            <small>${esc(meta.desc)}${esc(email)}</small>
          </div>
          <div class="pl-inline">
            ${isConn
              ? `<button type="button" class="pl-btn ghost xs" data-forge-disconnect="${esc(meta.id)}">연결 해제</button>`
              : `<button type="button" class="pl-btn soft xs" data-forge-connect="${esc(meta.id)}">🔐 OAuth 로그인</button>`}
          </div>
        </div>`;
    }).join('');
  }

  async function openAiAuthModal() {
    $('pl-ai-auth-modal').hidden = false;
    if (state.session?.kind !== 'registered' && state.experimentalEnabled) {
      try { await ensureAuthAndCoins(0); } catch {}
    }
    await refreshPersonalAiAuth();
  }

  async function executeSinglePipeline({ overrideGameId = null, overrideEngineId = null, autoPublishOverride = null } = {}) {
    const gameId = overrideGameId || state.selectedGameId;
    const p = state.plans.find(x => x.gameId === gameId) || currentPlan();
    const gm = currentGameMeta();
    const route = overrideEngineId
      ? {
          id: overrideEngineId,
          label: overrideEngineId,
          renderMode: overrideEngineId === 'motion-graphic-web' ? 'motion-graphic' : overrideEngineId === 'youtube-carousel-web' ? 'carousel-images' : 'generative-video',
          cost: overrideEngineId === 'forge-motion-ffmpeg' ? 20 : overrideEngineId === 'motion-graphic-web' ? 10 : 5,
          endpoint: 'generate',
          engineId: overrideEngineId
        }
      : computeEffectiveRoute();

    resetStep4Checks();
    setStep(4);
    $('s4-job-pill').textContent = 'RUNNING';
    $('pr-ledger-badge').textContent = route.cost > 0 ? '안전 Hold 중' : '무료 0 PC';

    const t0 = performance.now();
    setCheck('auth', 'running', '확인 중…');
    await ensureAuthAndCoins(route.cost);
    const beforeCoins = state.wallet?.available || 0;
    updateWalletUi(beforeCoins, route.cost);
    setCheck('auth', 'done', `완료 · ${Math.round(performance.now() - t0)}ms`);

    const t1 = performance.now();
    setCheck('prep', 'running', '대본 검증 중…');
    const dur = Number($('s1-duration').value) || 8;
    const narration = overrideGameId && p?.narration
      ? p.narration
      : state.beats.filter(b => b.text.trim()).map((b, i, arr) => ({
          startSec: Number(((i * dur) / arr.length).toFixed(2)),
          endSec: Number((((i + 1) * dur) / arr.length).toFixed(2)),
          text: b.text.trim()
        }));
    const hl1 = overrideGameId && p?.topHeadline ? p.topHeadline.line1 : state.hl1;
    const hl2 = overrideGameId && p?.topHeadline ? p.topHeadline.line2 : state.hl2;

    if (route.endpoint === 'shortform-video' && !state.uploadedVideo?.base64) {
      setCheck('prep', 'error', '영상 없음');
      throw new Error('STEP 1에서 녹화 영상(MP4/WebM)을 선택해 주세요.');
    }
    if (route.endpoint === 'shortform-images' && !state.uploadedImages.length) {
      setCheck('prep', 'error', '이미지 없음');
      throw new Error('STEP 1에서 1장 이상의 이미지를 업로드해 주세요.');
    }
    setCheck('prep', 'done', `완료 · ${Math.round(performance.now() - t1)}ms`);

    const t2 = performance.now();
    setCheck('render', 'running', '진행 중…');
    $('s4-progress-pct').textContent = '15%';
    $('s4-progress-bar').style.width = '15%';
    $('s4-stage-label').textContent = `${route.label} 파이프라인 실행 중…`;

    let shortObj = null;
    if (route.endpoint === 'shortform-video' || route.endpoint === 'shortform-images') {
      const payload = {
        mediaKind: route.endpoint === 'shortform-video' ? 'video' : 'images',
        outputFormat: route.renderMode,
        gameId: gameId || undefined,
        projectId: QUERY_PROJECT_ID || undefined,
        title: `${gm.shortAlias} · ${hl2 || route.label}`,
        caption: p?.suggestedCaption || gm.desc,
        hashtags: p?.hashtags,
        headlineLine1: hl1,
        headlineLine2: hl2,
        narration,
        framingMode: $('s1-framing').value,
        durationSec: dur,
        includeTts: $('s2-include-tts').checked,
        keepOriginalAudio: $('s1-keep-audio').checked,
        ...(route.endpoint === 'shortform-video'
          ? { videoBase64: state.uploadedVideo.base64 }
          : { images: state.uploadedImages })
      };
      log(`→ POST /api/shorts/shortform (mediaKind=${payload.mediaKind}, format=${payload.outputFormat}, 0 PC)`);
      const { status, data } = await api('/api/shorts/shortform', { method: 'POST', body: payload, timeout: 90000 });
      shortObj = data.short;
      log(`  • HTTP ${status} | job=${shortObj.id} | status=${shortObj.status}`, 'ok');
    } else {
      const payload = {
        gameId: gameId || undefined,
        projectId: QUERY_PROJECT_ID || undefined,
        title: route.renderMode === 'carousel-images' ? (p?.carouselTitle || `${gm.shortAlias} 4컷`) : (p?.suggestedTitle || `${gm.shortAlias} 쇼츠`),
        caption: p?.suggestedCaption || gm.desc,
        hashtags: p?.hashtags,
        prompt: p?.playgroundConcept || gm.desc,
        flowPrompt: state.flowPrompt || p?.masterFlowPrompt || '',
        hookText: p?.hookText || hl1,
        ctaText: p?.ctaText || 'PLAY HUB에서 바로 플레이 ▶',
        topHeadline: { line1: hl1, line2: hl2 },
        narration,
        bestComment: p?.bestComment,
        carouselTitle: p?.carouselTitle,
        carouselSlides: p?.carouselSlides,
        stylePreset: 'google-playground',
        cameraMotion: p?.cameraMotion || 'dynamic-zoom',
        durationSec: dur,
        engineId: route.engineId,
        allowFallback: true
      };
      log(`→ POST /api/shorts/generate (game=${gameId || 'draft'}, engine=${route.engineId}, hold=${route.cost} PC)`);
      const { status, data } = await api('/api/shorts/generate', {
        method: 'POST',
        headers: { 'Idempotency-Key': `pf-${gameId || 'draft'}-${route.engineId}-${uuid()}` },
        body: payload
      });
      shortObj = data.short;
      state.wallet = data.wallet;
      updateWalletUi(beforeCoins, data.hold?.amountCoins ?? route.cost);
      log(`  • HTTP ${status} | job=${shortObj.id} | Hold=${data.hold?.amountCoins ?? 0} PC`, 'ok');
    }

    $('s4-job-pill').textContent = `JOB #${shortObj.id}`;
    for (let i = 0; i < 80; i++) {
      if (!['queued', 'rendering'].includes(shortObj.status)) break;
      const pct = Math.max(18, shortObj.progress || 25);
      $('s4-progress-pct').textContent = `${pct}%`;
      $('s4-progress-bar').style.width = `${pct}%`;
      $('s4-stage-label').textContent = shortObj.stageLabel || '렌더링 중…';
      await new Promise(r => setTimeout(r, 450));
      const { data: poll } = await api(`/api/shorts/${encodeURIComponent(shortObj.id)}`);
      shortObj = poll.short;
    }
    if (shortObj.status !== 'ready') {
      setCheck('render', 'error', shortObj.errorCode || '실패');
      $('s4-job-pill').textContent = 'FAILED';
      throw new Error(shortObj.errorMessage || '렌더링에 실패했습니다. 예약된 PlayCoin은 자동 반환되었습니다.');
    }

    const { data: cgAfter } = await api('/api/shorts/creator/games');
    state.wallet = cgAfter.wallet;
    updateWalletUi(beforeCoins, shortObj.chargedCoins);
    $('pr-ledger-badge').textContent = shortObj.chargedCoins > 0 ? `정산 완료 (-${shortObj.chargedCoins} PC)` : '무료 완료 (0 PC)';
    setCheck('render', 'done', `완료 · ${Math.round(performance.now() - t2)}ms`);
    $('s4-progress-pct').textContent = '85%';
    $('s4-progress-bar').style.width = '85%';
    $('s4-engine-meta').textContent = `엔진: ${shortObj.resolvedEngineName} (${shortObj.engineModel || shortObj.resolvedEngineId})`;
    $('s4-size-meta').textContent = shortObj.hasVideoFile
      ? `${shortObj.width}×${shortObj.height} · ${(shortObj.bytes / 1024).toFixed(0)} KB`
      : `무영상 0MB · ${shortObj.renderMode}`;

    const t3 = performance.now();
    setCheck('verify', 'running', '무결성 검증 중…');
    let verifyLabel = 'OK';
    if (shortObj.videoUrl) {
      const r206 = await api(shortObj.videoUrl, { headers: { Range: 'bytes=0-1023' } });
      if (r206.status !== 206) throw new Error(`HTTP Range 검증 실패 (${r206.status})`);
      verifyLabel = `Range 206 · ${Math.round(performance.now() - t3)}ms`;
      log(`✅ 미디어 무결성 검증: GET ${shortObj.videoUrl} → 206 Partial Content`, 'ok');
    } else if (shortObj.posterUrl) {
      const pRes = await api(shortObj.posterUrl);
      verifyLabel = `0MB 포스터 ${pRes.status} · ${Math.round(performance.now() - t3)}ms`;
      log(`✅ 무영상 에셋 검증: GET ${shortObj.posterUrl} → ${pRes.status} OK`, 'ok');
    }
    setCheck('verify', 'done', verifyLabel);

    const shouldPublish = Boolean(gameId) && (autoPublishOverride !== null ? autoPublishOverride : $('s3-auto-publish').checked);
    const t4 = performance.now();
    if (shouldPublish) {
      setCheck('publish', 'running', '허브 등록 중…');
      const { data: pubData } = await api(`/api/shorts/${encodeURIComponent(shortObj.id)}/publish`, {
        method: 'POST',
        body: {
          gameId,
          visibility: $('s3-visibility').value,
          isPrimary: overrideEngineId ? overrideEngineId === 'forge-motion-ffmpeg' : $('s3-is-primary').checked
        }
      });
      shortObj = pubData.short;
      setCheck('publish', 'done', `등록 완료 · ${Math.round(performance.now() - t4)}ms`);
      log(`✅ 허브 내 게임 등록: POST /api/shorts/${shortObj.id}/publish → 200 OK`, 'ok');
      if (IS_EMBEDDED && window.parent !== window) {
        try {
          window.parent.postMessage({ source: 'playforge-shorts-studio', type: 'short-published', short: shortObj }, window.location.origin);
        } catch {}
      }
    } else {
      setCheck('publish', 'done', '초안 저장됨');
    }

    $('s4-progress-pct').textContent = '100%';
    $('s4-progress-bar').style.width = '100%';
    $('s4-stage-label').textContent = '파이프라인 완료 · PlayHub 연동 검증 통과';
    $('s4-job-pill').textContent = `DONE #${shortObj.id}`;
    $('st-sub-4').textContent = '완료 100%';

    state.lastCreatedShort = shortObj;
    renderLivePreview(shortObj);

    $('s4-publish-links').hidden = false;
    $('s4-link-feed').href = `/?view=shorts&short=${encodeURIComponent(shortObj.id)}`;
    $('s4-link-detail').href = gameId ? `/?game=${encodeURIComponent(gameId)}` : '/';
    if (shortObj.videoUrl) {
      $('s4-link-download').href = shortObj.videoUrl;
      $('s4-link-download').download = `${gameId || 'playforge'}-short.mp4`;
      $('s4-link-download').hidden = false;
    }

    await refreshRegisteredCounts();
    return shortObj;
  }

  async function refreshRegisteredCounts() {
    try {
      const { data } = await api('/api/shorts/games-summary');
      state.registeredCountByGame.clear();
      for (const [gid, info] of Object.entries(data?.games || {})) {
        state.registeredCountByGame.set(gid, info.count || 0);
      }
      renderPresetPills();
    } catch {}
  }

  async function urlToPngDataUrl(imgUrl, width = 960, height = 540) {
    const res = await fetch(imgUrl, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('샘플 이미지를 불러오지 못했습니다.');
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('이미지 디코딩 실패'));
        im.src = objUrl;
      });
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0D1321';
      ctx.fillRect(0, 0, width, height);
      const scale = Math.max(width / (img.naturalWidth || width), height / (img.naturalHeight || height));
      const dw = (img.naturalWidth || width) * scale;
      const dh = (img.naturalHeight || height) * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      return c.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  function openAiHookModal() {
    const p = currentPlan();
    const gm = currentGameMeta();
    const options = [
      {
        tag: '🔥 반전 훅형 (기본 추천)',
        l1: p?.topHeadline?.line1 || `${gm.shortAlias} 위기 상황에서`,
        l2: p?.topHeadline?.line2 || '한 방으로 판도를 뒤집는 법'
      },
      {
        tag: '🧠 전술 꿀팁형 (댓글 유도)',
        l1: `${gm.shortAlias} 초보가 90% 놓치는`,
        l2: '3초 만에 승률 올리는 핵심 타이밍'
      },
      {
        tag: '⚡ 바이럴 밈형 (숏폼 최적화)',
        l1: '설치 0초 웹게임인 줄 알았는데',
        l2: `${gm.shortAlias} 손맛에 시간 순삭됨ㅋㅋ`
      }
    ];
    $('pl-hook-options').innerHTML = options.map((o, idx) => `
      <button type="button" class="pl-hook-opt" data-apply-hook="${idx}">
        <small>${esc(o.tag)}</small>
        <div class="ho-l1">${esc(o.l1)}</div>
        <div class="ho-l2">${esc(o.l2)}</div>
      </button>
    `).join('');
    $('pl-hook-modal').hidden = false;
    $('pl-hook-options').onclick = e => {
      const btn = e.target.closest('[data-apply-hook]');
      if (!btn) return;
      const picked = options[Number(btn.dataset.applyHook)];
      if (picked) {
        state.hl1 = picked.l1.slice(0, 22);
        state.hl2 = picked.l2.slice(0, 22);
        $('s2-hl-line1').value = state.hl1;
        $('s2-hl-line2').value = state.hl2;
        syncHeadlineSwatch();
        renderLivePreview();
        toast('선택한 2줄 훅 헤드라인을 적용했습니다!');
      }
      $('pl-hook-modal').hidden = true;
    };
  }

  function switchSourceMode(mode) {
    state.srcMode = mode;
    document.querySelectorAll('[data-src-mode]').forEach(b => {
      const on = b.dataset.srcMode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('s1-box-cover').hidden = state.srcMode !== 'game-cover';
    $('s1-box-video').hidden = state.srcMode !== 'upload-video';
    $('s1-box-images').hidden = state.srcMode !== 'upload-images';
    state.lastCreatedShort = null;
    renderStep3Engines();
    renderLivePreview();
    syncStepperSummaries();
  }

  async function init() {
    applyEmbeddedChrome();

    const [cfgRes, sessRes] = await Promise.all([
      api('/api/shorts/config'),
      api('/api/session')
    ]);
    state.config = cfgRes.data;
    state.experimentalEnabled = Boolean(state.config?.experimentalEnabled);
    state.session = sessRes.data;
    state.csrfToken = sessRes.data?.csrfToken || null;

    if (state.experimentalEnabled) {
      try {
        const { data: planData } = await api('/api/shorts/playground-plans');
        state.plans = planData.plans || [];
      } catch {
        state.plans = [];
      }
    }

    if (state.session?.kind === 'registered') {
      const { data: cg } = await api('/api/shorts/creator/games');
      state.games = cg.games || [];
      state.wallet = cg.wallet;
    }

    const seen = new Set();
    const gameOptions = [];
    for (const g of state.games) {
      if (seen.has(g.gameId)) continue;
      seen.add(g.gameId);
      gameOptions.push({ gameId: g.gameId, label: `${g.title} · ${g.ownershipLabel}` });
    }
    if (state.experimentalEnabled) {
      for (const p of state.plans) {
        if (seen.has(p.gameId)) continue;
        seen.add(p.gameId);
        gameOptions.push({ gameId: p.gameId, label: `${p.koreanAlias} (${p.titleKo})` });
      }
    }

    if (gameOptions.length) {
      $('s1-game-select').innerHTML = gameOptions.map(o => `<option value="${esc(o.gameId)}">${esc(o.label)}</option>`).join('');
    } else {
      $('s1-game-select').innerHTML = `<option value="">${esc(QUERY_PROJECT_NAME || '연결된 게임 없음 (먼저 PlayHub 로그인 / 게임 배포)')}</option>`;
    }

    applyExperimentalUiVisibility();

    const initialGame = (QUERY_GAME_ID && gameOptions.some(o => o.gameId === QUERY_GAME_ID))
      ? QUERY_GAME_ID
      : (gameOptions[0]?.gameId || '');
    if (initialGame) $('s1-game-select').value = initialGame;
    loadGamePresetIntoEditor(initialGame);
    updateWalletUi();

    // Load personal AI OAuth status & registered counts asynchronously so preview paints immediately!
    void refreshPersonalAiAuth();
    void refreshRegisteredCounts();
    log(`✅ PlayForge Shorts Generator 초기화 완료 (build=${state.config?.buildMode || 'dev'})`, 'ok');
  }

  // ===== Event Bindings =====
  document.addEventListener('click', e => {
    const stepBtn = e.target.closest('[data-go-step]');
    if (stepBtn) setStep(Number(stepBtn.dataset.goStep));
  });

  $('pl-exp-enable-btn')?.addEventListener('click', () => {
    window.PlayForgeDevDemoUI?.setEnabled(true);
    applyExperimentalUiVisibility();
    toast('실험 기능을 ON으로 켰습니다! (PlayHub · PlayForge 동시 적용, F5 유지)');
  });

  window.addEventListener('playforge:dev-demo-ui-change', () => {
    applyExperimentalUiVisibility();
  });

  $('pl-close-drawer-btn').addEventListener('click', () => {
    if (window.parent !== window) {
      window.parent.postMessage({ source: 'playforge-shorts-studio', type: 'close' }, window.location.origin);
    }
  });

  $('s1-capture-editor-btn').addEventListener('click', () => {
    if (window.parent !== window) {
      window.parent.postMessage({ source: 'playforge-shorts-studio', type: 'capture-frame' }, window.location.origin);
      toast('Godot 에디터 현재 화면을 캡처하는 중…');
    }
  });

  window.addEventListener('message', e => {
    if (e.origin !== window.location.origin) return;
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.source === 'playforge-godot-editor' && msg.type === 'captured-frame' && msg.dataUrl) {
      if (state.uploadedImages.length >= 6) {
        toast('이미지는 최대 6장까지 추가할 수 있습니다.');
        return;
      }
      state.uploadedImages.push({
        name: String(msg.sourceLabel || `에디터 ${state.uploadedImages.length + 1}`).slice(0, 14),
        dataUrl: msg.dataUrl
      });
      switchSourceMode('upload-images');
      renderUploadedImagesGrid();
      toast('Godot 에디터 화면을 캡처해 추가했습니다 (0 PC 무료)!');
      return;
    }
    if (msg.source === 'playhub-shorts-oauth') {
      if (msg.ok) {
        toast(`Google OAuth 연결 완료!${msg.email ? ` (${msg.email})` : ''} Veo 3.1을 0 PC로 사용할 수 있습니다.`);
        void refreshPersonalAiAuth();
      } else {
        toast(msg.message || 'Google OAuth 연결이 취소되었습니다.');
      }
    }
  });

  $('s1-game-select').addEventListener('change', e => loadGamePresetIntoEditor(e.target.value));
  $('s1-preset-pills').addEventListener('click', e => {
    const btn = e.target.closest('[data-pick-game]');
    if (!btn) return;
    $('s1-game-select').value = btn.dataset.pickGame;
    loadGamePresetIntoEditor(btn.dataset.pickGame);
  });

  document.querySelectorAll('[data-src-mode]').forEach(btn => {
    btn.addEventListener('click', () => switchSourceMode(btn.dataset.srcMode));
  });

  $('s1-video-input').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || ''));
      r.onerror = () => reject(new Error('영상 읽기 실패'));
      r.readAsDataURL(f);
    });
    state.uploadedVideo = { name: f.name, size: f.size, base64 };
    $('s1-video-name').textContent = `${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB)`;
    syncStepperSummaries();
    toast('촬영 영상이 준비되었습니다 (무료 0 PC).');
  });

  $('s1-load-sample-video').addEventListener('click', async () => {
    try {
      const { data: list } = await api('/api/shorts?format=generative-video&limit=1');
      const url = list.shorts?.[0]?.videoUrl;
      if (!url) { toast('샘플 기반 영상이 아직 없습니다. 먼저 STEP 3에서 MP4를 1회 생성해 주세요.'); return; }
      const res = await fetch(url, { credentials: 'same-origin' });
      const blob = await res.blob();
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('읽기 실패'));
        r.readAsDataURL(blob);
      });
      state.uploadedVideo = { name: 'sample-gameplay.mp4', size: blob.size, base64 };
      $('s1-video-name').textContent = `sample-gameplay.mp4 (${(blob.size / 1024).toFixed(0)} KB · 샘플 로드됨)`;
      syncStepperSummaries();
      toast('샘플 촬영 영상을 불러왔습니다 (무료 0 PC).');
    } catch (err) { toast(err.message); }
  });

  $('s1-images-input').addEventListener('change', async e => {
    const files = [...(e.target.files || [])].slice(0, 6);
    for (const f of files) {
      if (state.uploadedImages.length >= 6) break;
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ''));
        r.onerror = () => reject(new Error('읽기 실패'));
        r.readAsDataURL(f);
      }).catch(() => null);
      if (dataUrl) state.uploadedImages.push({ name: f.name.slice(0, 12), dataUrl });
    }
    e.target.value = '';
    renderUploadedImagesGrid();
    renderStep3Engines();
    renderLivePreview();
    syncStepperSummaries();
  });

  $('s1-load-sample-images').addEventListener('click', async () => {
    try {
      state.uploadedImages = [];
      for (const sp of state.plans.slice(0, 4)) {
        const dataUrl = await urlToPngDataUrl(sp.coverUrl);
        state.uploadedImages.push({
          name: sp.koreanAlias,
          dataUrl,
          badge: `${state.uploadedImages.length + 1}/4 · ${sp.koreanAlias}`,
          headline: sp.hookText,
          caption: sp.highlightText,
          narration: sp.narration?.[0]?.text || sp.hookText
        });
      }
      renderUploadedImagesGrid();
      renderStep3Engines();
      renderLivePreview();
      syncStepperSummaries();
      toast('4장의 샘플 게임 스크린샷을 불러왔습니다 (무료 0 PC).');
    } catch (err) { toast(err.message); }
  });

  $('s1-clear-images').addEventListener('click', () => {
    state.uploadedImages = [];
    renderUploadedImagesGrid();
    renderStep3Engines();
    renderLivePreview();
    syncStepperSummaries();
  });

  $('s1-images-grid').addEventListener('click', e => {
    const del = e.target.closest('[data-del-img]');
    if (!del) return;
    state.uploadedImages.splice(Number(del.dataset.delImg), 1);
    renderUploadedImagesGrid();
    renderStep3Engines();
    renderLivePreview();
    syncStepperSummaries();
  });

  // Step 2
  $('s2-hl-line1').addEventListener('input', e => {
    state.hl1 = e.target.value;
    state.lastCreatedShort = null;
    syncHeadlineSwatch();
    renderLivePreview();
  });
  $('s2-hl-line2').addEventListener('input', e => {
    state.hl2 = e.target.value;
    state.lastCreatedShort = null;
    syncHeadlineSwatch();
    renderLivePreview();
  });
  $('s2-beat-list').addEventListener('input', e => {
    const idx = Number(e.target.dataset.beatIdx);
    if (!Number.isInteger(idx) || !state.beats[idx]) return;
    state.beats[idx].text = e.target.value;
    state.lastCreatedShort = null;
    renderLivePreview();
  });
  $('s2-flow-prompt').addEventListener('input', e => { state.flowPrompt = e.target.value; });
  $('s2-open-ai-hooks').addEventListener('click', openAiHookModal);
  $('pl-hook-modal-close').addEventListener('click', () => { $('pl-hook-modal').hidden = true; });
  $('pl-hook-modal').addEventListener('click', e => { if (e.target === $('pl-hook-modal')) $('pl-hook-modal').hidden = true; });

  $('s2-tts-preview').addEventListener('click', () => {
    const txt = state.beats.map(b => b.text).filter(Boolean).join('. ');
    if (!txt || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = 'ko-KR';
    u.rate = 1.14;
    const ko = (window.speechSynthesis.getVoices?.() || []).find(v => /^ko/i.test(v.lang));
    if (ko) u.voice = ko;
    window.speechSynthesis.speak(u);
    toast('5-Beat 한국어 나래이션을 미리듣기합니다.');
  });

  $('s2-reset-script').addEventListener('click', () => {
    loadGamePresetIntoEditor(state.selectedGameId);
    toast('선택한 게임의 기본 대본으로 복원했습니다.');
  });

  $('s2-copy-flow').addEventListener('click', async e => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText($('s2-flow-prompt').value);
      toast('Google Flow (Veo 3.1) 프롬프트를 복사했습니다!');
    } catch { toast('클립보드 복사가 차단되었습니다.'); }
  });

  $('s2-download-pack').addEventListener('click', e => {
    e.preventDefault();
    const gm = currentGameMeta();
    const md = `# ${gm.title} — Google Flow 제작 팩\n\n## 2줄 헤드라인\n- ${state.hl1}\n- ${state.hl2}\n\n## 나래이션 대본\n${state.beats.map(b => `- ${b.startSec}s: ${b.text}`).join('\n')}\n\n## Google Flow 프롬프트\n\`\`\`text\n${state.flowPrompt}\n\`\`\`\n`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flow-pack-${gm.gameId || 'playforge'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Step 3
  $('s3-engine-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-pick-route]');
    if (!btn) return;
    state.selectedRoute = btn.dataset.pickRoute;
    state.lastCreatedShort = null;
    renderStep3Engines();
    renderLivePreview();
  });

  $('s3-execute-btn').addEventListener('click', async () => {
    if (state.busy) return;
    state.busy = true;
    $('s3-execute-btn').disabled = true;
    $('s3-run-batch-btn').disabled = true;
    try {
      await executeSinglePipeline();
      toast('생성 파이프라인 완료 · PlayHub 검증까지 통과했습니다!');
    } catch (err) {
      log(`❌ 파이프라인 오류: ${err.message}`, 'err');
      toast(err.message);
    } finally {
      state.busy = false;
      $('s3-execute-btn').disabled = false;
      $('s3-run-batch-btn').disabled = false;
    }
  });

  $('s3-run-batch-btn').addEventListener('click', async () => {
    if (state.busy || !state.experimentalEnabled) return;
    state.busy = true;
    $('s3-execute-btn').disabled = true;
    $('s3-run-batch-btn').disabled = true;
    try {
      await ensureAuthAndCoins(state.plans.length * 35);
      for (const plan of state.plans) {
        log(`=== [${plan.koreanAlias}] 3종 포맷 일괄 검증 시작 ===`);
        await executeSinglePipeline({ overrideGameId: plan.gameId, overrideEngineId: 'motion-graphic-web', autoPublishOverride: true });
        await executeSinglePipeline({ overrideGameId: plan.gameId, overrideEngineId: 'forge-motion-ffmpeg', autoPublishOverride: true });
        await executeSinglePipeline({ overrideGameId: plan.gameId, overrideEngineId: 'youtube-carousel-web', autoPublishOverride: true });
      }
      toast('5대 게임 × 3종(총 15개) 전체 파이프라인 검증을 완료했습니다!');
    } catch (err) {
      log(`❌ 일괄 검증 오류: ${err.message}`, 'err');
      toast(err.message);
    } finally {
      state.busy = false;
      $('s3-execute-btn').disabled = false;
      $('s3-run-batch-btn').disabled = false;
    }
  });

  $('s4-new-run-btn').addEventListener('click', () => {
    state.lastCreatedShort = null;
    setStep(1);
    renderLivePreview();
  });

  $('s4-clear-log').addEventListener('click', e => {
    e.preventDefault();
    $('pl-log-console').innerHTML = '';
  });

  $('pl-demo-login-btn').addEventListener('click', async () => {
    try {
      await ensureAuthAndCoins(300);
      await refreshPersonalAiAuth();
      toast('개발용 크리에이터 로그인 완료!');
    } catch (err) { toast(err.message); }
  });

  $('pl-grant-btn').addEventListener('click', async () => {
    try {
      const { data } = await api('/api/shorts/dev-grant', { method: 'POST', body: { coins: 300 } });
      state.wallet = data.wallet;
      updateWalletUi();
      toast('+300 PlayCoin이 지급되었습니다!');
    } catch (err) { toast(err.message); }
  });

  // Personal AI OAuth Modal bindings
  $('pl-ai-auth-btn').addEventListener('click', openAiAuthModal);
  $('s3-open-ai-auth').addEventListener('click', openAiAuthModal);
  $('pl-ai-auth-close').addEventListener('click', () => { $('pl-ai-auth-modal').hidden = true; });
  $('pl-ai-auth-modal').addEventListener('click', e => { if (e.target === $('pl-ai-auth-modal')) $('pl-ai-auth-modal').hidden = true; });
  $('ai-forge-refresh-btn').addEventListener('click', () => { void refreshPersonalAiAuth(); });

  document.querySelectorAll('[data-google-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.googleMode;
      document.querySelectorAll('[data-google-mode]').forEach(b => {
        const on = b === btn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      $('ai-form-gemini').hidden = m !== 'gemini-key';
      $('ai-form-vertex').hidden = m !== 'vertex-oauth';
    });
  });

  $('ai-google-oauth-btn').addEventListener('click', async () => {
    try {
      await ensureAuthAndCoins(0);
      const clientId = $('ai-input-oauth-client-id')?.value.trim() || '';
      const clientSecret = $('ai-input-oauth-client-secret')?.value.trim() || '';
      const { data } = await api('/api/shorts/ai-auth/google/start', {
        method: 'POST',
        body: {
          vertexProject: $('ai-input-vertex-project').value.trim(),
          vertexLocation: $('ai-input-vertex-location').value.trim() || 'us-central1',
          ...(clientId ? { clientId } : {}),
          ...(clientSecret ? { clientSecret } : {})
        }
      });
      if (data.authUrl) {
        const directLink = $('ai-google-direct-link');
        if (directLink) {
          directLink.href = data.authUrl;
          directLink.hidden = false;
        }
        const popup = window.open(data.authUrl, 'playhub-google-oauth', 'width=520,height=680');
        toast(popup ? 'Google OAuth 로그인 창을 열었습니다.' : '팝업이 차단되었습니다. [로그인 창 직접 열기 ↗]를 눌러 주세요.');
      }
    } catch (err) {
      if ($('ai-oauth-client-setup') && !$('ai-oauth-client-setup').hidden) {
        $('ai-oauth-client-setup').open = true;
      }
      $('ai-manual-details').open = true;
      toast(err.message);
    }
  });

  $('ai-copy-redirect-uri')?.addEventListener('click', async () => {
    const uri = `${location.origin}/api/shorts/ai-auth/google/callback`;
    try { await navigator.clipboard.writeText(uri); toast('Redirect URI를 복사했습니다.'); } catch { toast(uri); }
  });

  $('ai-copy-current-url')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); toast('현재 페이지 주소를 복사했습니다. Chrome/Safari에 붙여넣어 주세요.'); } catch { toast(location.href); }
  });

  $('ai-copy-flow-url')?.addEventListener('click', async () => {
    const flowUrl = 'https://labs.google/fx/tools/flow';
    try { await navigator.clipboard.writeText(flowUrl); toast('Google Flow 주소를 복사했습니다. 외부 Chrome/Safari에서 열어 주세요.'); } catch { toast(flowUrl); }
  });

  $('ai-gcloud-btn').addEventListener('click', async () => {
    try {
      await ensureAuthAndCoins(0);
      await api('/api/shorts/ai-auth/google/connect', {
        method: 'POST',
        body: {
          mode: 'gcloud-oauth',
          vertexProject: $('ai-input-vertex-project').value.trim(),
          vertexLocation: $('ai-input-vertex-location').value.trim() || 'us-central1'
        }
      });
      await refreshPersonalAiAuth();
      toast('로컬 gcloud OAuth 토큰을 연결했습니다! Veo 3.1 생성이 0 PC로 전환됩니다.');
    } catch (err) { toast(err.message); }
  });

  $('ai-save-gemini-btn').addEventListener('click', async () => {
    try {
      await ensureAuthAndCoins(0);
      await api('/api/shorts/ai-auth/google/connect', {
        method: 'POST',
        body: { mode: 'gemini-key', geminiApiKey: $('ai-input-gemini-key').value.trim() }
      });
      $('ai-input-gemini-key').value = '';
      await refreshPersonalAiAuth();
      toast('개인 Gemini API 키를 연결했습니다! Veo 3.1 생성 시 0 PC로 처리됩니다.');
    } catch (err) { toast(err.message); }
  });

  $('ai-save-vertex-btn').addEventListener('click', async () => {
    try {
      await ensureAuthAndCoins(0);
      await api('/api/shorts/ai-auth/google/connect', {
        method: 'POST',
        body: {
          mode: 'vertex-oauth',
          vertexProject: $('ai-input-vertex-project').value.trim(),
          vertexLocation: $('ai-input-vertex-location').value.trim() || 'us-central1',
          accessToken: $('ai-input-vertex-token').value.trim()
        }
      });
      $('ai-input-vertex-token').value = '';
      await refreshPersonalAiAuth();
      toast('Vertex AI OAuth 토큰을 연결했습니다! Veo 3.1 생성 시 0 PC로 처리됩니다.');
    } catch (err) { toast(err.message); }
  });

  $('ai-google-disconnect-btn').addEventListener('click', async () => {
    try {
      await api('/api/shorts/ai-auth/disconnect', { method: 'POST', body: {} });
      await refreshPersonalAiAuth();
      toast('개인 Google AI 연결을 해제했습니다.');
    } catch (err) { toast(err.message); }
  });

  $('ai-forge-providers').addEventListener('click', async e => {
    const connBtn = e.target.closest('[data-forge-connect]');
    const discBtn = e.target.closest('[data-forge-disconnect]');
    if (!connBtn && !discBtn) return;
    const provider = connBtn ? connBtn.dataset.forgeConnect : discBtn.dataset.forgeDisconnect;
    const isConnect = Boolean(connBtn);
    const btn = connBtn || discBtn;
    btn.disabled = true;
    try {
      const res = await fetch(`${FORGE_API_BASE}/agent-chat/providers/${isConnect ? 'connect' : 'disconnect'}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.connect_url) {
        window.open(data.connect_url, '_blank', 'noopener');
        toast('개인 구독 OAuth 로그인 페이지를 열었습니다. 인증 완료 후 새로고침해 주세요.');
      } else {
        toast(isConnect ? '개인 구독 AI 브라우저 인증을 시작했습니다.' : '개인 구독 AI 연결을 해제했습니다.');
      }
      await refreshPersonalAiAuth();
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  init().catch(err => {
    log(`❌ 초기화 오류: ${err.message}`, 'err');
    toast(err.message);
  });
})();
