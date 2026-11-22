(() => {
  const DEVICE_KEY = 'playhub_adgame_device_id';
  const STORAGE_KEY = 'playhub_adgame_last_claim';

  function getDeviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = 'dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return 'dev_ephemeral';
    }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.message || data?.error?.code || 'REQUEST_FAILED');
      err.code = data?.error?.code || 'REQUEST_FAILED';
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function ensureBannerHost() {
    let el = document.getElementById('adgame-handoff-banner');
    if (el) return el;
    const app = document.getElementById('app');
    if (!app) return null;
    el = document.createElement('section');
    el.id = 'adgame-handoff-banner';
    el.className = 'adgame-handoff-banner';
    el.setAttribute('role', 'status');
    el.hidden = true;
    app.prepend(el);
    return el;
  }

  function renderBanner(el, state) {
    if (!el) return;
    el.hidden = false;
    const snap = state.snapshot || {};
    const partnerName = snap.partnerName || state.partnerId || '당근마켓';
    const region = state.regionTag || snap.regionTag || '잠실4동';
    const scoreText = Number(snap.score || 0).toLocaleString();
    const rewardLabel = snap.reward?.label || '스타터 보상';
    const channelLabel = {
      poc_app_sim: 'PlayHub 앱 설치 시뮬레이션',
      aos_referrer: 'Android Install Referrer',
      ios_ul: 'iOS Universal Link',
      short_code: '6자리 이어하기 코드',
      web_fallback: 'PlayHub 웹 즉시 이어하기'
    }[state.installChannel] || state.installChannel || '웹 연동';

    const qualChip = state.qualified
      ? `<span class="adgame-handoff-chip is-qualified" data-testid="adgame-qualified-badge">✅ 본 게임 실플레이 확인 · 파트너 CPA 확정</span>`
      : `<span class="adgame-handoff-chip" data-testid="adgame-pending-badge">⏱️ 본 게임 실플레이 확인 중 (${state.countdownSec}초 남음)</span>`;

    const rewardChip = state.alreadyClaimed
      ? `<span class="adgame-handoff-chip is-warn">🔒 이미 소비된 1회성 토큰 (중복 지급 차단 검증됨)</span>`
      : state.duplicateDeviceGuard
        ? `<span class="adgame-handoff-chip is-warn">🛡️ 동일 기기 캠페인 보상 1회 제한 적용 (기록만 이어짐)</span>`
        : `<span class="adgame-handoff-chip">🎁 ${esc(rewardLabel)} 지급됨</span>`;

    el.innerHTML = `
      <div class="adgame-handoff-copy">
        <span class="adgame-handoff-kicker">🥕 ${esc(partnerName)} (${esc(region)}) → PlayHub 본 게임 자동 연동</span>
        <p class="adgame-handoff-title">${esc(snap.titleKo || state.targetGameId || '본 게임')} 데모 기록 ${esc(scoreText)}점 승계 완료</p>
        <p class="adgame-handoff-meta">유입 경로: <strong>${esc(channelLabel)}</strong>${state.attributionId ? ` · 어트리뷰션 <code>${esc(state.attributionId.slice(0, 14))}</code>` : ''}</p>
        <div class="adgame-handoff-chips">
          ${rewardChip}
          ${qualChip}
        </div>
      </div>
      <div class="adgame-handoff-actions">
        <a class="adgame-handoff-back" href="/adgame/">← 당근 PoC · 연동 콘솔로 돌아가기</a>
      </div>
    `;
  }

  let activeTimer = null;

  async function onGameDetail(game, { startPlay, toast } = {}) {
    const params = new URLSearchParams(location.search);
    const token = params.get('ad_handoff') || params.get('handoff') || params.get('ad_code') || '';
    const channel = params.get('ad_channel') || 'web_fallback';
    const autolaunch = params.get('autolaunch') === '1';

    if (activeTimer) {
      clearInterval(activeTimer);
      activeTimer = null;
    }

    if (!token) {
      if (autolaunch && typeof startPlay === 'function') {
        void startPlay(game);
      }
      return;
    }

    const bannerEl = ensureBannerHost();
    let claimState = null;

    try {
      const claimed = await postJson('/api/adgame/handoff/claim', {
        token,
        deviceId: getDeviceId(),
        installChannel: channel
      });
      claimState = { ...claimed, qualified: false, countdownSec: 8 };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, claimState }));
      } catch {}
      if (typeof toast === 'function') {
        toast(`🥕 ${claimed.snapshot?.regionTag || '당근'} 데모 기록(${Number(claimed.snapshot?.score || 0).toLocaleString()}점)이 PlayHub에 연동되었어요!`);
      }
      void postJson('/api/adgame/events', {
        sessionId: claimed.sessionId,
        campaignId: claimed.campaignId,
        partnerId: claimed.partnerId,
        eventType: 'full_game_start',
        meta: { targetGameId: game.id, installChannel: channel }
      }).catch(() => {});
    } catch (err) {
      if (err.code === 'HANDOFF_ALREADY_CLAIMED') {
        let cached = null;
        try {
          const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
          if (parsed && parsed.token === token) cached = parsed.claimState;
        } catch {}
        claimState = cached
          ? { ...cached, alreadyClaimed: true }
          : {
              alreadyClaimed: true,
              installChannel: channel,
              targetGameId: game.id,
              snapshot: { titleKo: game.title, partnerName: '당근마켓', regionTag: '잠실4동', score: 0 },
              qualified: false,
              countdownSec: 0
            };
      } else {
        if (typeof toast === 'function') {
          toast(`데모 연동 토큰을 확인할 수 없습니다 (${err.code || 'ERROR'}).`);
        }
        return;
      }
    }

    renderBanner(bannerEl, claimState);

    if (autolaunch && typeof startPlay === 'function') {
      void startPlay(game);
    }

    // Remove raw handoff token from URL so refresh doesn't look broken, while keeping context clean
    try {
      const clean = new URL(location.href);
      clean.searchParams.delete('ad_handoff');
      clean.searchParams.delete('handoff');
      clean.searchParams.delete('ad_code');
      clean.searchParams.delete('ad_channel');
      clean.searchParams.delete('autolaunch');
      history.replaceState(null, '', clean);
    } catch {}

    // After 8 seconds of real full-game presence in PoC, confirm qualified play & partner CPA
    if (claimState.attributionId && !claimState.qualified) {
      const startedAt = Date.now();
      activeTimer = setInterval(async () => {
        const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
        claimState.countdownSec = Math.max(0, 8 - elapsedSec);
        if (claimState.countdownSec > 0) {
          renderBanner(bannerEl, claimState);
          return;
        }
        clearInterval(activeTimer);
        activeTimer = null;
        try {
          await postJson(`/api/adgame/attributions/${encodeURIComponent(claimState.attributionId)}/qualify`, {
            playMs: Math.max(8000, Date.now() - startedAt)
          });
          claimState.qualified = true;
          renderBanner(bannerEl, claimState);
          if (typeof toast === 'function') {
            toast('✅ 본 게임 실플레이 확인 완료! 보상 및 파트너 연동이 확정되었습니다.');
          }
        } catch {}
      }, 1000);
    }
  }

  window.PlayHubAdHandoff = { onGameDetail };
})();
