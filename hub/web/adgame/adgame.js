(() => {
  const $ = id => document.getElementById(id);

  const state = {
    partnerId: 'karrot',
    partner: null,
    region: '일원본동',
    demoDurationSec: 45,
    simOs: 'android',
    screen: 'feed',
    feedFilter: 'all',
    campaigns: [],
    heroCampaignId: 'karrot-survivor-io',
    activeSession: null,
    activeCampaign: null,
    activeHandoff: null,
    timerId: null,
    demoStartedMs: 0,
    demoScore: 0,
    demoStage: 1,
    firstInputRecorded: false,
    myBestScore: 0,
    myBestGame: ''
  };

  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error?.code || 'GET_FAILED');
    return data;
  }

  async function apiPost(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || data?.error?.code || 'POST_FAILED');
    return data;
  }

  function setScreen(name) {
    state.screen = name;
    for (const el of document.querySelectorAll('.karrot-screen')) {
      el.classList.toggle('is-active', el.dataset.screen === name);
    }
    for (const btn of document.querySelectorAll('.ins-pill[data-goto]')) {
      btn.classList.toggle('is-active', btn.dataset.goto === name);
    }
  }

  function syncRegionText() {
    for (const el of document.querySelectorAll('.js-region-text')) {
      el.textContent = state.region;
    }
    const badge = $('wv-region-badge');
    if (badge) badge.textContent = `📍 ${state.region}`;
  }

  function applyFeedFilter(filter) {
    state.feedFilter = filter;
    for (const chip of document.querySelectorAll('.k-chip[data-filter]')) {
      chip.classList.toggle('is-active', chip.dataset.filter === filter);
    }
    for (const post of document.querySelectorAll('#feed-scroll .k-post')) {
      if (filter === 'online-game') {
        post.hidden = post.dataset.category !== 'online-game';
      } else {
        post.hidden = false;
      }
    }
  }

  const PRESETS = {
    'karrot-banner': { screen: 'feed', partnerId: 'karrot', label: '당근 · 배너삽입형' },
    'karrot-content': { screen: 'hub', partnerId: 'karrot-content', label: '당근 · 컨텐츠제공형' },
    'toss-content': { screen: 'toss', partnerId: 'toss', label: '토스 · 컨텐츠제공형' }
  };

  function isContentOnly() {
    return (state.partner?.ctaMode || '') === 'content_only';
  }

  function applyPartnerModeUi() {
    const pureContent = isContentOnly();
    const isToss = state.partnerId.startsWith('toss');
    const policyPill = document.querySelector('.toss-policy-pill');
    if (policyPill) {
      policyPill.textContent = pureContent ? '순수 컨텐츠 제공 · IAA/IAP' : 'PlayHub 연계 배너 · 기록 저장';
    }
    const hubBadge = document.querySelector('.k-partner-chip');
    if (hubBadge) {
      hubBadge.textContent = pureContent ? '무설치 커뮤니티 게임 5종' : 'PlayHub 무설치 데모 5종';
    }
    const subPill = document.querySelector('.k-sub-pill');
    if (subPill) {
      subPill.textContent = pureContent ? '신규 게임 5종' : 'PlayHub 제휴 확장';
    }
    const wvClose = $('btn-demo-close');
    if (wvClose) wvClose.textContent = isToss ? '← 토스' : '← 당근';
    const wvCta = $('btn-demo-finish-now');
    if (wvCta) {
      wvCta.textContent = pureContent ? '결과 보기' : '본편 이어하기 ↗';
      wvCta.classList.toggle('is-neutral', pureContent);
    }
    const wvBanner = $('wv-hub-banner');
    if (wvBanner) {
      wvBanner.hidden = pureContent || state.partner?.ctaMode === 'partner_contained';
      if (!wvBanner.hidden) {
        $('wv-hb-title').textContent = isToss
          ? 'PLAY HUB 클라우드 저장 · 본편 이어하기'
          : 'PLAY HUB 앱에서 기록·보상 그대로 이어하기';
        $('wv-hb-sub').textContent = state.activeCampaign?.reward?.label
          ? `🎁 ${state.activeCampaign.reward.label}`
          : '데모 점수·스타터 보상 자동 승계';
      }
    }
  }

  function renderCampaignViews() {
    const list = state.campaigns;
    if (!list.length) return;
    const pureContent = isContentOnly();

    // 1) In-feed playable hero post (탕탕특공대 default)
    const featuredInFeed = list.find(c => c.id === 'karrot-survivor-io') || list[0];
    $('infeed-hero-card').innerHTML = `
      <img src="${esc(featuredInFeed.coverUrl)}" alt="${esc(featuredInFeed.titleKo)}">
      <div class="k-infeed-playable-footer">
        <div>
          <strong>${esc(featuredInFeed.titleKo)} · ${esc(featuredInFeed.genreKo)}</strong>
          <small>${pureContent ? `번들 ${Math.round(featuredInFeed.bundleKb)}KB · 클릭 즉시 무설치 플레이` : `번들 ${Math.round(featuredInFeed.bundleKb)}KB · ${esc(featuredInFeed.reward?.label || '본편 보상 연동')}`}</small>
        </div>
        <button type="button" class="k-play-pill" data-launch-campaign="${esc(featuredInFeed.id)}">▶ 1초 플레이</button>
      </div>
    `;

    // 2) Screenshot 1 bottom horizontal carousel (all 5 requested games)
    $('feed-carousel').innerHTML = list.map((c, idx) => `
      <button type="button" class="k-demo-card" data-launch-campaign="${esc(c.id)}" data-testid="feed-card-${esc(c.demoGameId)}">
        <div class="k-demo-thumb">
          <img src="${esc(c.coverUrl)}" alt="${esc(c.titleKo)}" loading="lazy">
          <span class="k-demo-badge ${idx === 0 || idx === 4 ? 'is-hot' : ''}">${esc(c.badgeText || '무설치 데모')}</span>
        </div>
        <span class="k-demo-sub">${esc(c.subtitleKo)}</span>
        <strong class="k-demo-title">${esc(c.titleKo)}</strong>
        <span class="k-demo-meta">${pureContent ? '클릭 즉시 무설치 플레이' : '클릭 즉시 실행 · 본편 보상'}</span>
      </button>
    `).join('');

    // 3) Screenshot 2 menu 4-icon shortcut grid (3 featured + 게임 전체)
    const shortcuts = [
      list.find(c => c.demoGameId === 'survivor-io') || list[0],
      list.find(c => c.demoGameId === 'world-of-warships') || list[1],
      list.find(c => c.demoGameId === 'clash-royale') || list[2]
    ].filter(Boolean);

    $('menu-game-shortcuts').innerHTML = shortcuts.map(c => `
      <button type="button" class="k-shortcut-item" data-launch-campaign="${esc(c.id)}">
        <span class="k-shortcut-icon"><img src="${esc(c.coverUrl)}" alt="${esc(c.titleKo)}"></span>
        <small>${esc(c.titleKo)}</small>
      </button>
    `).join('') + `
      <button type="button" class="k-shortcut-item" data-goto="hub" data-testid="btn-menu-all-games">
        <span class="k-shortcut-icon">🎮</span>
        <small>게임 전체</small>
      </button>
    `;

    // 4) Screenshot 3 커뮤니티 게임 허브 hero + 2-col grid (all 5 games)
    const hero = list.find(c => c.id === state.heroCampaignId) || list[0];
    const baseParticipants = 118062 + (hero.liveStats?.sessions || 0);
    $('hub-hero-card').innerHTML = `
      <img src="${esc(hero.coverUrl)}" alt="${esc(hero.titleKo)}">
      <div class="k-hero-gradient">
        <div class="k-hero-players">👤 총 ${baseParticipants.toLocaleString()}명 참여중${pureContent ? '' : ' · PlayHub 제휴'}</div>
        <h2 class="k-hero-title">${esc(hero.titleKo)}</h2>
        <p class="k-hero-desc">${esc(hero.subtitleKo)}${pureContent ? ' — 설치 없이 바로 도전하세요!' : ' — 클릭 즉시 체험 후 본편 연동!'}</p>
        <button type="button" class="k-hero-start-btn" data-launch-campaign="${esc(hero.id)}" data-testid="btn-hub-hero-start">▶ 게임 시작</button>
      </div>
    `;

    $('btn-hero-challenge').onclick = () => launchDemo(hero.id);

    $('hub-partner-grid').innerHTML = list.map(c => `
      <button type="button" class="k-hub-card" data-launch-campaign="${esc(c.id)}" data-testid="hub-card-${esc(c.demoGameId)}">
        <div class="k-hub-card-art">
          <img src="${esc(c.coverUrl)}" alt="${esc(c.titleKo)}" loading="lazy">
          <span class="k-hub-card-tag">▶ ${pureContent ? '즉시 플레이' : '무설치 체험'} · ${esc(c.genreKo)}</span>
        </div>
        <strong>${esc(c.titleKo)}</strong>
        <small>${esc(c.subtitleKo)}</small>
      </button>
    `).join('');

    // 5) Screenshot 5 Toss Apps-in-Toss Games Tab (5 PlayHub games + real Toss reference entries)
    const tossList = $('toss-rank-list');
    if (tossList) {
      const refEntries = [
        { num: 6, icon: '🎴', title: '한게임 싱글 맞고', sub: '혼자서도 지루할 틈 없는 고스톱 (토스 기존 입점 참고)' },
        { num: 7, icon: '🪜', title: '무한의 계단', sub: '손가락의 한계에 도전해보세요 (토스 기존 입점 참고)' }
      ];
      tossList.innerHTML = list.map((c, idx) => `
        <div class="toss-rank-row">
          <span class="toss-rank-num">${idx + 1}</span>
          <span class="toss-rank-icon"><img src="${esc(c.coverUrl)}" alt="${esc(c.titleKo)}" loading="lazy"></span>
          <div class="toss-rank-meta">
            <span class="toss-rank-title">${esc(c.titleKo)} <span class="toss-verified">✓</span></span>
            <span class="toss-rank-sub">${esc(c.subtitleKo)}</span>
          </div>
          <button type="button" class="toss-start-btn" data-launch-campaign="${esc(c.id)}" data-testid="toss-start-${esc(c.demoGameId)}">시작</button>
        </div>
      `).join('') + refEntries.map(r => `
        <div class="toss-rank-row is-ref">
          <span class="toss-rank-num">${r.num}</span>
          <span class="toss-rank-icon">${r.icon}</span>
          <div class="toss-rank-meta">
            <span class="toss-rank-title">${esc(r.title)} <span class="toss-verified">✓</span></span>
            <span class="toss-rank-sub">${esc(r.sub)}</span>
          </div>
          <button type="button" class="toss-start-btn" disabled>참고</button>
        </div>
      `).join('');
    }
    applyPartnerModeUi();
  }

  async function loadCampaigns() {
    const data = await apiGet(`/api/adgame/campaigns?partner=${encodeURIComponent(state.partnerId)}`);
    state.partner = data.partner;
    state.campaigns = data.campaigns || [];
    state.fullHubBaseUrl = data.fullHubBaseUrl || '';
    if (state.fullHubBaseUrl) {
      const hubLink = document.querySelector('.ins-links a[href="/"]');
      if (hubLink) {
        hubLink.href = state.fullHubBaseUrl + '/';
        hubLink.target = '_blank';
        hubLink.rel = 'noopener';
        hubLink.textContent = 'Google Dev Hub ↗';
      }
    }
    renderCampaignViews();
  }

  function stopDemoTimer() {
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function closeDemoOverlay() {
    stopDemoTimer();
    $('demo-overlay').hidden = true;
    $('handoff-overlay').hidden = true;
    $('store-overlay').hidden = true;
    $('demo-iframe').src = 'about:blank';
    try {
      if (document.fullscreenElement) void document.exitFullscreen();
    } catch {}
  }

  async function launchDemo(campaignId) {
    const campaign = state.campaigns.find(c => c.id === campaignId);
    if (!campaign) return;
    state.activeCampaign = campaign;
    state.heroCampaignId = campaign.id;
    state.activeHandoff = null;
    state.firstInputRecorded = false;
    state.demoScore = 0;
    state.demoStage = 1;
    state.demoStartedMs = Date.now();

    $('inspector-panel')?.classList.remove('is-open');
    $('handoff-overlay').hidden = true;
    $('store-overlay').hidden = true;
    const overlay = $('demo-overlay');
    overlay.hidden = false;

    // Enter native fullscreen on user click gesture when supported (Android Chrome / Desktop)
    try {
      if (!document.fullscreenElement && overlay.requestFullscreen) {
        void overlay.requestFullscreen().catch(() => {});
      }
    } catch {}

    $('wv-game-title').textContent = campaign.titleKo;
    $('wv-game-sub').textContent = `${state.partner?.name || '당근마켓'} · 무설치 즉시 실행`;
    $('wv-load-badge').textContent = '⏳ 무설치 로딩 중...';
    $('wv-score-badge').textContent = '🏆 점수 0';
    syncRegionText();
    applyPartnerModeUi();

    const session = await apiPost('/api/adgame/sessions', {
      campaignId: campaign.id,
      partnerId: state.partnerId,
      regionTag: state.region
    });
    state.activeSession = session;

    const iframe = $('demo-iframe');
    const loadStart = performance.now();
    iframe.onload = () => {
      const loadMs = Math.round(performance.now() - loadStart);
      $('wv-load-badge').textContent = `⚡ ${loadMs}ms 로드`;
      void apiPost('/api/adgame/events', {
        sessionId: session.sessionId,
        eventType: 'loaded',
        meta: { loadMs, demoGameId: campaign.demoGameId }
      }).then(refreshFunnel).catch(() => {});

      // Keep same-origin game document strictly inside portrait width (no horizontal overflow) + detect first input
      try {
        const doc = iframe.contentDocument;
        if (doc) {
          if (!doc.getElementById('playhub-portrait-clamp')) {
            const st = doc.createElement('style');
            st.id = 'playhub-portrait-clamp';
            st.textContent = 'html,body{max-width:100vw!important;overflow-x:hidden!important;}';
            doc.head?.appendChild(st);
          }
          const onInteract = () => {
            if (state.firstInputRecorded) return;
            state.firstInputRecorded = true;
            void apiPost('/api/adgame/events', {
              sessionId: session.sessionId,
              eventType: 'first_input',
              playMs: Date.now() - state.demoStartedMs
            }).then(refreshFunnel).catch(() => {});
          };
          doc.addEventListener('pointerdown', onInteract, { once: true, capture: true });
          doc.addEventListener('keydown', onInteract, { once: true, capture: true });
        }
      } catch {}
    };

    iframe.src = `${campaign.demoEntryUrl}?ad_demo=1&partner=${encodeURIComponent(state.partnerId)}&session=${encodeURIComponent(session.sessionId)}`;

    // Countdown timer + live demo score simulation (overridden if game sends PlayHubDemo.reportProgress)
    stopDemoTimer();
    const limitSec = state.demoDurationSec;
    $('wv-timer').textContent = `${limitSec}s`;

    state.timerId = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - state.demoStartedMs) / 1000);
      const remain = Math.max(0, limitSec - elapsedSec);
      $('wv-timer').textContent = `${remain}s`;
      // Increment simulated engagement score while playing if game doesn't report custom score
      state.demoScore = Math.max(state.demoScore, elapsedSec * 310 + 450);
      $('wv-score-badge').textContent = `🏆 점수 ${state.demoScore.toLocaleString()}`;

      if (remain <= 0) {
        void finishDemoAndShowHandoff('time_limit');
      }
    }, 500);

    void refreshFunnel();
  }

  function renderHandoffSheet(handoff) {
    const snap = handoff.snapshot || {};
    const campaign = state.activeCampaign;
    const ctaMode = state.partner?.ctaMode || 'install_direct';

    $('ho-kicker').textContent = `🥕 ${snap.partnerName || '당근마켓'} (${snap.regionTag || state.region}) 데모 완료`;
    $('ho-title').textContent = `${snap.titleKo || campaign?.titleKo} 본 게임으로 이어갈까요?`;
    $('ho-sub').textContent = `방금 플레이한 기록과 스타터 보상이 PlayHub 본편으로 안전하게 승계됩니다.`;
    $('ho-score').textContent = `${Number(snap.score || 0).toLocaleString()}점`;
    $('ho-rank').textContent = `상위 ${snap.topPercent || 8}%`;
    $('ho-code').textContent = handoff.shortCode;
    $('ho-reward-label').textContent = snap.reward?.label || '스타터 보상 + PlayCoin';

    // Update Karrot hub personal rank bar too!
    if ((snap.score || 0) >= state.myBestScore) {
      state.myBestScore = snap.score || 0;
      state.myBestGame = snap.titleKo || '';
      $('my-rank-num').textContent = `${Math.max(1, Math.round((snap.topPercent || 8) / 2))}위`;
      $('my-rank-detail').textContent = `${state.myBestGame} ${state.myBestScore.toLocaleString()}점 · ${state.region}`;
    }

    // Forge Godot vs HTML5 full target switcher when available
    const toggleWrap = $('ho-target-toggle');
    const select = $('ho-target-select');
    if (campaign?.forgeTargetGameId) {
      toggleWrap.hidden = false;
      select.innerHTML = `
        <option value="${esc(campaign.targetGameId)}" ${handoff.targetGameId === campaign.targetGameId ? 'selected' : ''}>HTML5 즉시 본편 (${esc(campaign.targetGameId)})</option>
        <option value="${esc(campaign.forgeTargetGameId)}" ${handoff.targetGameId === campaign.forgeTargetGameId ? 'selected' : ''}>Godot 4.7.2 풀게임 (${esc(campaign.forgeTargetGameId)})</option>
      `;
    } else {
      toggleWrap.hidden = true;
    }

    const webLink = $('btn-ho-web-continue');
    const installBtn = $('btn-ho-install-sim');
    const routerLink = $('btn-ho-smart-router');
    const copyCodeBtn = $('btn-ho-copy-code');
    const rewardBox = document.querySelector('.handoff-reward-box');
    const policyNote = $('ho-policy-note');

    const webTargetBase = handoff.links.externalFullHub ? handoff.links.webContinueUrl : handoff.links.webContinuePath;
    webLink.href = `${webTargetBase}&ad_channel=web_fallback`;
    routerLink.href = handoff.links.smartRouterPath;

    if (ctaMode === 'content_only') {
      installBtn.hidden = true;
      webLink.hidden = true;
      routerLink.hidden = true;
      if (copyCodeBtn) copyCodeBtn.hidden = true;
      if (rewardBox) rewardBox.hidden = true;
      toggleWrap.hidden = true;
      const isToss = state.partnerId.startsWith('toss');
      $('ho-kicker').textContent = isToss ? '🎮 토스 게임 · 라운드 결과' : `🥕 ${snap.regionTag || state.region} 커뮤니티 게임 결과`;
      $('ho-title').textContent = `${snap.titleKo || campaign?.titleKo} 플레이 완료!`;
      $('ho-sub').textContent = '순수 컨텐츠 제공 모드: 외부 허브 배너 없이 플랫폼 내에서 완결 플레이 및 랭킹을 기록합니다.';
      policyNote.textContent = '📦 순수 컨텐츠 제공형(content_only): 허브 연계 배너·외부 이동 링크 0%.';
    } else if (ctaMode === 'partner_contained') {
      installBtn.hidden = true;
      webLink.hidden = true;
      routerLink.hidden = true;
      if (copyCodeBtn) copyCodeBtn.hidden = false;
      if (rewardBox) rewardBox.hidden = false;
      policyNote.textContent = '🛡️ 토스 앱인토스 코드 연동형(partner_contained): 외부 앱/스토어 이탈 링크 비노출, 6자리 클라우드 세이브 코드 복사 + 재플레이만 허용.';
    } else if (ctaMode === 'soft_banner' || ctaMode === 'web_first_then_install') {
      installBtn.hidden = false;
      webLink.hidden = false;
      routerLink.hidden = false;
      if (copyCodeBtn) copyCodeBtn.hidden = false;
      if (rewardBox) rewardBox.hidden = false;
      webLink.className = 'ho-btn ho-btn-primary';
      webLink.textContent = '☁️ PlayHub 클라우드에 기록 저장하고 웹 본편 이어하기';
      installBtn.className = 'ho-btn ho-btn-secondary';
      installBtn.textContent = '📲 PlayHub 앱 설치 안내 (선택)';
      policyNote.textContent = '⚖️ 허브 연계 배너형(soft_banner): 기록 보존 및 본편 확장 명분으로 비침해적 클라우드 저장·본편 연동을 제안합니다.';
    } else {
      installBtn.hidden = false;
      webLink.hidden = false;
      routerLink.hidden = false;
      if (copyCodeBtn) copyCodeBtn.hidden = false;
      if (rewardBox) rewardBox.hidden = false;
      installBtn.className = 'ho-btn ho-btn-primary';
      webLink.className = 'ho-btn ho-btn-secondary';
      webLink.textContent = '⚡ 설치 없이 PlayHub 웹 본편으로 이어하기';
      installBtn.textContent = '📲 PlayHub 앱 설치하고 본 게임 직행';
      policyNote.textContent = '✅ 적극 허브 연계형(install_direct): 당근 광고 랜딩·크로스 프로모션 제휴용. Apple 4.7 준수(데모 내 결제 UI 없음 · 1회성 토큰).';
    }

    $('handoff-overlay').hidden = false;
  }

  async function finishDemoAndShowHandoff(reason = 'user_cta', targetOverride = null) {
    stopDemoTimer();
    const session = state.activeSession;
    if (!session) return;

    const playMs = Math.max(3000, Date.now() - state.demoStartedMs);
    const score = Math.max(state.demoScore, 1450);

    const handoff = await apiPost(`/api/adgame/sessions/${encodeURIComponent(session.sessionId)}/handoff`, {
      score,
      stage: state.demoStage,
      playMs,
      targetGameId: targetOverride,
      carryOver: { reason, demoGameId: session.demoGameId, regionTag: state.region }
    });
    state.activeHandoff = handoff;
    renderHandoffSheet(handoff);
    void refreshFunnel();
  }

  function openStoreSimulator() {
    const h = state.activeHandoff;
    if (!h) return;
    void apiPost('/api/adgame/events', {
      sessionId: h.sessionId,
      eventType: 'cta_click',
      meta: { action: 'install_sim', os: state.simOs }
    }).then(refreshFunnel).catch(() => {});

    void apiPost('/api/adgame/events', {
      sessionId: h.sessionId,
      eventType: 'store_redirect',
      meta: { os: state.simOs, shortCode: h.shortCode }
    }).then(refreshFunnel).catch(() => {});

    const isIos = state.simOs === 'ios';
    $('st-store-badge').textContent = isIos ? 'Apple App Store 시뮬레이터 (iOS)' : 'Google Play 스토어 시뮬레이터 (Android)';
    $('st-referrer-payload').textContent = isIos
      ? `Universal Link: ${h.links.universalLinkUrl}\nFallback Code: ${h.shortCode}`
      : `Play Install Referrer:\n${h.links.referrerParam}`;

    $('st-progress-wrap').hidden = true;
    $('st-progress-fill').style.width = '0%';
    $('btn-store-install').hidden = false;
    $('btn-store-install').disabled = false;
    $('btn-store-launch').hidden = true;
    const channel = isIos ? 'ios_ul' : 'aos_referrer';
    const launchBase = h.links.externalFullHub ? h.links.webContinueUrl : h.links.webContinuePath;
    $('btn-store-launch').href = `${launchBase}&ad_channel=${channel}`;
    $('store-overlay').hidden = false;
  }

  function runSimulatedInstall() {
    const btn = $('btn-store-install');
    btn.disabled = true;
    $('st-progress-wrap').hidden = false;
    let pct = 0;
    const iv = setInterval(() => {
      pct = Math.min(100, pct + 20);
      $('st-progress-fill').style.width = `${pct}%`;
      $('st-progress-label').textContent = pct < 100
        ? `PlayHub 앱 설치 중... ${pct}% (Referrer 보존됨)`
        : '✅ PlayHub 설치 완료! 최초 실행 시 본 게임으로 직행합니다.';
      if (pct >= 100) {
        clearInterval(iv);
        btn.hidden = true;
        $('btn-store-launch').hidden = false;
      }
    }, 180);
  }

  async function refreshFunnel() {
    try {
      const data = await apiGet('/api/adgame/funnel');
      const c = data.counts || {};
      const stepMap = {
        impression: c.impression || 0,
        loaded: (c.loaded || 0) + (c.first_input || 0),
        demo_complete: c.demo_complete || 0,
        cta_click: (c.cta_click || 0) + (c.store_redirect || 0),
        handoff_claimed: c.handoff_claimed || 0,
        qualified_play: c.qualified_play || 0
      };
      for (const li of document.querySelectorAll('#pipeline-steps li')) {
        const val = stepMap[li.dataset.step] || 0;
        li.classList.toggle('is-done', val > 0);
        li.querySelector('.step-cnt').textContent = String(val);
      }

      $('ins-campaign-tbody').innerHTML = (data.byCampaign || []).map(row => `
        <tr>
          <td><strong>${esc(row.titleKo)}</strong></td>
          <td>${row.sessions}</td>
          <td>${row.handoffsIssued}</td>
          <td>${row.handoffsClaimed}</td>
          <td>${row.qualifiedPlays}</td>
          <td><button type="button" class="ins-run-btn" data-launch-campaign="${esc(row.id)}">▶ 체험</button></td>
        </tr>
      `).join('');

      const logs = data.recentEvents || [];
      $('ins-event-logs').innerHTML = logs.length
        ? logs.slice(0, 14).map(ev => `
            <div class="ins-log-row">
              <span><span class="ev-tag">${esc(ev.eventType)}</span> · ${esc(ev.campaignId)}</span>
              <span class="ev-time">${new Date(ev.createdAt).toLocaleTimeString('ko-KR', { hour12: false })}</span>
            </div>
          `).join('')
        : '<div class="ins-log-row"><span>왼쪽 당근 화면에서 5종 게임 중 하나를 클릭해 연동 흐름을 시작하세요.</span></div>';
    } catch {}
  }

  // Listen for standard PlayHubDemo SDK postMessage events from demo iframes
  window.addEventListener('message', ev => {
    const msg = ev.data;
    if (!msg || msg.channel !== 'playhub:adgame:v1' || !state.activeSession) return;
    if (msg.type === 'progress') {
      if (Number.isFinite(msg.payload?.score)) state.demoScore = Math.max(state.demoScore, msg.payload.score);
      if (Number.isFinite(msg.payload?.stage)) state.demoStage = Math.max(state.demoStage, msg.payload.stage);
      $('wv-score-badge').textContent = `🏆 점수 ${state.demoScore.toLocaleString()}`;
    } else if (msg.type === 'milestone') {
      void apiPost('/api/adgame/events', {
        sessionId: state.activeSession.sessionId,
        eventType: 'milestone',
        score: state.demoScore,
        stage: state.demoStage,
        playMs: Date.now() - state.demoStartedMs,
        meta: msg.payload || {}
      }).then(refreshFunnel).catch(() => {});
    } else if (msg.type === 'complete' || msg.type === 'request_install') {
      if (Number.isFinite(msg.payload?.score)) state.demoScore = Math.max(state.demoScore, msg.payload.score);
      void finishDemoAndShowHandoff(msg.payload?.reason || msg.type);
    }
  });

  // Global delegated click bindings
  document.addEventListener('click', ev => {
    const launchBtn = ev.target.closest('[data-launch-campaign]');
    if (launchBtn) {
      void launchDemo(launchBtn.dataset.launchCampaign);
      return;
    }
    const gotoBtn = ev.target.closest('[data-goto]');
    if (gotoBtn) {
      const targetScreen = gotoBtn.dataset.goto;
      setScreen(targetScreen);
      if (targetScreen === 'toss' && !state.partnerId.startsWith('toss')) {
        state.partnerId = 'toss';
        $('ctl-partner').value = 'toss';
        void loadCampaigns();
      } else if (targetScreen !== 'toss' && state.partnerId.startsWith('toss')) {
        state.partnerId = 'karrot';
        $('ctl-partner').value = 'karrot';
        void loadCampaigns();
      }
      return;
    }
    const filterBtn = ev.target.closest('.k-chip[data-filter]');
    if (filterBtn) {
      applyFeedFilter(filterBtn.dataset.filter);
      return;
    }
    const tabBtn = ev.target.closest('.k-tab[data-feed-tab]');
    if (tabBtn) {
      if (tabBtn.dataset.feedTab === 'games') {
        setScreen('hub');
      } else {
        for (const t of document.querySelectorAll('.k-tab')) t.classList.toggle('is-active', t === tabBtn);
      }
      return;
    }
    const bnav = ev.target.closest('.k-bnav-item[data-nav]');
    if (bnav) {
      const target = bnav.dataset.nav;
      if (target === 'hub') setScreen('hub');
      else if (target === 'menu') setScreen('menu');
      else setScreen('feed');
    }
  });

  $('btn-open-menu').onclick = () => setScreen('menu');
  $('btn-open-hub-top').onclick = () => setScreen('hub');
  $('btn-carousel-more').onclick = () => setScreen('hub');
  $('btn-fab-hub').onclick = () => setScreen('hub');
  $('btn-demo-close').onclick = () => closeDemoOverlay();
  $('btn-demo-finish-now').onclick = () => void finishDemoAndShowHandoff('manual_cta');
  $('btn-wv-banner-cta').onclick = () => void finishDemoAndShowHandoff('ingame_banner_cta');
  $('btn-ho-install-sim').onclick = () => openStoreSimulator();
  $('btn-store-close').onclick = () => { $('store-overlay').hidden = true; };
  $('btn-store-install').onclick = () => runSimulatedInstall();
  $('btn-mobile-inspector').onclick = () => $('inspector-panel')?.classList.toggle('is-open');
  $('btn-close-inspector').onclick = () => $('inspector-panel')?.classList.remove('is-open');
  $('btn-ho-replay').onclick = () => {
    $('handoff-overlay').hidden = true;
    if (state.activeCampaign) void launchDemo(state.activeCampaign.id);
  };
  function recordExternalHandoffBeacon(channel) {
    const h = state.activeHandoff;
    if (!h || !h.links?.externalFullHub) return;
    try {
      void fetch('/api/adgame/handoff/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({ token: h.handoffToken, installChannel: channel })
      });
    } catch {}
  }

  $('btn-ho-web-continue').onclick = () => {
    if (state.activeHandoff) {
      void apiPost('/api/adgame/events', {
        sessionId: state.activeHandoff.sessionId,
        eventType: 'cta_click',
        meta: { action: 'web_continue', externalFullHub: Boolean(state.activeHandoff.links?.externalFullHub) }
      }).catch(() => {});
      recordExternalHandoffBeacon('web_fallback');
    }
  };
  $('btn-store-launch').onclick = () => {
    recordExternalHandoffBeacon(state.simOs === 'ios' ? 'ios_ul' : 'aos_referrer');
  };
  $('btn-ho-copy-code').onclick = async () => {
    if (!state.activeHandoff) return;
    try {
      await navigator.clipboard.writeText(state.activeHandoff.shortCode);
      $('btn-ho-copy-code').textContent = '✅ 복사됨!';
      setTimeout(() => { $('btn-ho-copy-code').textContent = '📋 코드 복사'; }, 1500);
    } catch {}
  };
  $('ho-target-select').onchange = async e => {
    if (!state.activeSession) return;
    await finishDemoAndShowHandoff('target_switch', e.target.value);
  };

  $('ctl-partner').onchange = async e => {
    state.partnerId = e.target.value;
    await loadCampaigns();
    if (state.activeHandoff && !$('handoff-overlay').hidden) {
      renderHandoffSheet(state.activeHandoff);
    }
  };
  $('ctl-region').onchange = e => {
    state.region = e.target.value;
    syncRegionText();
  };
  $('ctl-duration').onchange = e => {
    state.demoDurationSec = Number(e.target.value) || 45;
  };
  $('ctl-os').onchange = e => {
    state.simOs = e.target.value;
  };
  $('btn-refresh-funnel').onclick = () => void refreshFunnel();

  // Initialize clock, URL preset (karrot-banner | karrot-content | toss-banner | toss-content), & data
  const nowDate = new Date();
  $('sb-time').textContent = nowDate.toTimeString().slice(0, 5);

  const urlParams = new URLSearchParams(location.search);
  const presetKey = (urlParams.get('preset') || '').trim().toLowerCase();
  if (PRESETS[presetKey]) {
    const p = PRESETS[presetKey];
    state.screen = p.screen;
    state.partnerId = p.partnerId;
    document.body.classList.add('is-portrait-preset');
    $('mobile-preset-label').textContent = p.label;
    document.title = `${p.label} — Hub-AdGame PoC`;
  }
  const explicitScreen = urlParams.get('screen');
  if (explicitScreen && ['feed', 'menu', 'hub', 'toss'].includes(explicitScreen)) {
    state.screen = explicitScreen;
  }
  const explicitPartner = urlParams.get('partner');
  if (explicitPartner) state.partnerId = explicitPartner;
  const explicitRegion = urlParams.get('region');
  if (explicitRegion) state.region = explicitRegion;
  const explicitDuration = Number(urlParams.get('duration'));
  if (Number.isFinite(explicitDuration) && explicitDuration >= 5 && explicitDuration <= 180) {
    state.demoDurationSec = explicitDuration;
  }

  $('ctl-partner').value = state.partnerId;
  $('ctl-region').value = state.region;
  $('ctl-duration').value = String(state.demoDurationSec);
  setScreen(state.screen);
  syncRegionText();
  void loadCampaigns().then(refreshFunnel);
  setInterval(refreshFunnel, 5000);
})();
