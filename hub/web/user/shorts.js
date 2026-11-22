// PlayHub Portal Shorts Module (Feed, Home Shelf, Game Detail Intro Video, Creator/My Games Manager)
(function () {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  let summaryMap = {};
  let summaryLoaded = false;

  function shortsStudioUrl(gameId = '') {
    const base = '/forge/OfficialGodot/shorts-studio.html';
    return gameId ? `${base}?game=${encodeURIComponent(gameId)}` : base;
  }

  async function loadGamesSummary(api) {
    try {
      const data = await api('/api/shorts/games-summary', { timeout: 3500 });
      summaryMap = data?.games && typeof data.games === 'object' ? data.games : {};
      summaryLoaded = true;
    } catch {
      summaryLoaded = false;
    }
    return summaryMap;
  }

  function summaryForGame(gameId) {
    return summaryMap[gameId] || null;
  }

  function badgeMarkup(gameId) {
    const info = summaryForGame(gameId);
    if (!info) return '';
    return `<span class="card-shorts-badge" title="등록된 게임 소개 쇼츠 ${info.count}개">🎬 쇼츠</span>`;
  }

  async function mountHomeShelf(container, { api, navigate } = {}) {
    if (!container) return;
    try {
      const data = await api('/api/shorts?limit=8&sort=latest', { timeout: 4000 });
      const shorts = Array.isArray(data?.shorts) ? data.shorts : [];
      if (!container.isConnected) return;
      if (!shorts.length) {
        container.innerHTML = `
          <div class="section-heading">
            <div class="section-heading-left">
              <h2 id="home-shorts-title">🎬 게임 소개 쇼츠</h2>
              <span class="section-subtitle">Google Flow · PlayForge에서 9:16 게임 트레일러를 만들고 등록하세요</span>
            </div>
            <a class="text-button" href="/?view=shorts" data-route>쇼츠 피드 →</a>
          </div>
          <div class="home-shorts-empty">
            <div>
              <strong>첫 번째 게임 소개 쇼츠의 주인공이 되어 보세요!</strong>
              <p>PlayForge Shorts Studio에서 PlayCoin으로 Google Flow/Veo 또는 Motion Director 쇼츠를 만들고 내 게임에 바로 등록할 수 있습니다.</p>
            </div>
            <a class="button primary small" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge 쇼츠 만들기 ↗</a>
          </div>`;
        return;
      }

      container.innerHTML = `
        <div class="section-heading">
          <div class="section-heading-left">
            <h2 id="home-shorts-title">🎬 게임 소개 쇼츠</h2>
            <span class="section-subtitle">8초 만에 만나보는 크리에이터 게임 하이라이트</span>
          </div>
          <div class="save-actions">
            <a class="text-button" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ 내 게임 쇼츠 만들기 ↗</a>
            <a class="text-button" href="/?view=shorts" data-route>쇼츠 전체보기 →</a>
          </div>
        </div>
        <div class="home-shorts-strip">
          ${shorts.map(s => `
            <a class="shorts-thumb-card" href="/?view=shorts&amp;short=${encodeURIComponent(s.id)}" data-route data-testid="home-short-card">
              <div class="shorts-thumb-media">
                ${s.posterUrl ? `<img src="${esc(s.posterUrl)}" alt="" loading="lazy" decoding="async">` : ''}
                <span class="shorts-thumb-play">▶ ${s.durationSec ? Math.round(s.durationSec) + 's' : '쇼츠'} · ♥ ${s.likeCount || 0}</span>
              </div>
              <div class="shorts-thumb-body">
                <strong>${esc(s.game?.title || s.title)}</strong>
                <small>${esc(s.title)}</small>
              </div>
            </a>
          `).join('')}
        </div>`;
    } catch {
      container.hidden = true;
    }
  }

  async function mountFeed(root, { api, toast, navigate, session, initialShortId = '', initialGameId = '' } = {}) {
    let sort = 'latest';
    let onlyMine = false;
    let shorts = [];
    let currentIndex = 0;
    let muted = true;
    const viewedIds = new Set();

    root.innerHTML = `
      <div class="shorts-page">
        <div class="shorts-topbar">
          <div>
            <h1>🎬 PlayHub 게임 쇼츠</h1>
            <p class="shorts-topbar-sub">Google Flow · PlayForge로 제작된 9:16 게임 소개 영상을 보고 클릭 한 번으로 바로 플레이하세요.</p>
          </div>
          <div class="shorts-topbar-actions">
            <a class="button secondary" href="/forge/OfficialGodot/shorts-poc.html" target="_blank" rel="noopener" data-testid="open-shorts-poc">🎯 5대 게임 Playground PoC ↗</a>
            <a class="button primary" href="${shortsStudioUrl(initialGameId)}" target="_blank" rel="noopener" data-testid="open-shorts-studio">✨ PlayForge에서 쇼츠 만들기 ↗</a>
          </div>
        </div>
        <div class="shorts-filters" role="group" aria-label="쇼츠 정렬">
          <button type="button" class="filter active" data-shorts-sort="latest" aria-pressed="true">최신 쇼츠</button>
          <button type="button" class="filter" data-shorts-sort="popular" aria-pressed="false">인기 쇼츠</button>
          ${session?.kind === 'registered' ? '<button type="button" class="filter" data-shorts-sort="mine" aria-pressed="false">내 등록 쇼츠</button>' : ''}
        </div>
        <div id="shorts-feed-body" class="shorts-feed-body">
          <section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><p>쇼츠 피드를 불러오고 있습니다…</p></section>
        </div>
      </div>`;

    const bodyEl = root.querySelector('#shorts-feed-body');

    function recordViewOnce(shortObj) {
      if (!shortObj || viewedIds.has(shortObj.id)) return;
      viewedIds.add(shortObj.id);
      api(`/api/shorts/${encodeURIComponent(shortObj.id)}/view`, { method: 'POST', body: {} })
        .then(res => {
          if (typeof res?.viewCount === 'number') {
            shortObj.viewCount = res.viewCount;
            const stat = bodyEl.querySelector('[data-active-views]');
            if (stat) stat.textContent = String(res.viewCount);
          }
        })
        .catch(() => {});
    }

    function renderStage() {
      if (!shorts.length) {
        bodyEl.innerHTML = `
          <section class="surface empty-state">
            <h2>${onlyMine ? '아직 등록한 게임 소개 쇼츠가 없습니다' : '아직 공개된 게임 쇼츠가 없습니다'}</h2>
            <p>PlayForge Shorts Studio에서 PlayCoin으로 Google Flow/Veo 또는 PlayForge Motion 쇼츠를 생성하고 내 게임에 등록해 보세요.</p>
            <div class="save-actions" style="justify-content:center">
              <a class="button primary" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge Shorts Studio 열기 ↗</a>
              <a class="button secondary" href="/" data-route>게임 라이브러리 보기</a>
            </div>
          </section>`;
        return;
      }

      if (currentIndex < 0) currentIndex = 0;
      if (currentIndex >= shorts.length) currentIndex = shorts.length - 1;
      const s = shorts[currentIndex];

      bodyEl.innerHTML = `
        <div class="shorts-theater">
          <div class="shorts-stage-wrap">
            <article class="shorts-reel-card" data-testid="shorts-reel-card" data-short-id="${esc(s.id)}">
              <video id="shorts-active-video" class="shorts-reel-video" src="${esc(s.videoUrl)}" ${s.posterUrl ? `poster="${esc(s.posterUrl)}"` : ''} autoplay ${muted ? 'muted' : ''} loop playsinline></video>
              <div class="shorts-reel-top">
                <span class="shorts-engine-pill">${esc(s.resolvedEngineName || s.engineName)}</span>
                <button type="button" class="shorts-mute-btn" id="shorts-mute-toggle">${muted ? '🔇 음소거 해제' : '🔊 소리 켜짐'}</button>
              </div>
              <div class="shorts-rail">
                <button type="button" class="shorts-rail-btn${s.liked ? ' liked' : ''}" id="shorts-like-btn" data-testid="shorts-like-btn" aria-pressed="${s.liked}">
                  <span>${s.liked ? '♥' : '♡'}</span>
                  <span id="shorts-like-count">${s.likeCount || 0}</span>
                </button>
                <div class="shorts-rail-stat" title="조회수">
                  <span>👁️</span>
                  <span data-active-views>${s.viewCount || 0}</span>
                </div>
                <button type="button" class="shorts-rail-btn" id="shorts-share-btn">
                  <span>🔗</span>
                  <span>공유</span>
                </button>
              </div>
              <div class="shorts-overlay">
                <div class="shorts-overlay-creator">@${esc(s.creatorName)}${s.isPrimary ? ' · ⭐ 대표 소개 영상' : ''}</div>
                <h2 class="shorts-overlay-title">${esc(s.title)}</h2>
                ${s.caption ? `<p class="shorts-overlay-caption">${esc(s.caption)}</p>` : ''}
                ${Array.isArray(s.hashtags) && s.hashtags.length ? `<div class="shorts-overlay-tags">${esc(s.hashtags.join(' '))}</div>` : ''}
                ${s.gameId ? `<a class="shorts-play-cta" href="/play/${encodeURIComponent(s.gameId)}/" data-game-link="${esc(s.gameId)}" data-testid="shorts-play-game-btn">▶ ${esc(s.game?.title || s.gameId)} 즉시 플레이</a>` : ''}
              </div>
            </article>
            <div class="shorts-nav-controls">
              <button type="button" class="button secondary small" id="shorts-prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>↑ 이전 쇼츠</button>
              <span class="muted">${currentIndex + 1} / ${shorts.length}</span>
              <button type="button" class="button secondary small" id="shorts-next-btn" ${currentIndex >= shorts.length - 1 ? 'disabled' : ''}>↓ 다음 쇼츠</button>
            </div>
          </div>
          <aside class="shorts-queue-panel">
            <h2>쇼츠 재생목록 (${shorts.length})</h2>
            <div class="shorts-queue-grid">
              ${shorts.map((item, idx) => `
                <button type="button" class="shorts-thumb-card${idx === currentIndex ? ' active' : ''}" data-queue-idx="${idx}">
                  <div class="shorts-thumb-media">
                    ${item.posterUrl ? `<img src="${esc(item.posterUrl)}" alt="" loading="lazy">` : ''}
                    <span class="shorts-thumb-play">▶ ♥ ${item.likeCount || 0}</span>
                  </div>
                  <div class="shorts-thumb-body">
                    <strong>${esc(item.game?.title || item.title)}</strong>
                    <small>${esc(item.title)}</small>
                  </div>
                </button>
              `).join('')}
            </div>
          </aside>
        </div>`;

      const video = bodyEl.querySelector('#shorts-active-video');
      if (video) {
        video.addEventListener('click', () => {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        });
        video.play().catch(() => {});
      }

      bodyEl.querySelector('#shorts-mute-toggle')?.addEventListener('click', () => {
        muted = !muted;
        if (video) {
          video.muted = muted;
          video.play().catch(() => {});
        }
        const btn = bodyEl.querySelector('#shorts-mute-toggle');
        if (btn) btn.textContent = muted ? '🔇 음소거 해제' : '🔊 소리 켜짐';
      });

      bodyEl.querySelector('#shorts-like-btn')?.addEventListener('click', async () => {
        try {
          const res = await api(`/api/shorts/${encodeURIComponent(s.id)}/like`, { method: 'POST', body: {} });
          s.liked = res.liked;
          s.likeCount = res.likeCount;
          const btn = bodyEl.querySelector('#shorts-like-btn');
          if (btn) {
            btn.classList.toggle('liked', s.liked);
            btn.setAttribute('aria-pressed', String(s.liked));
            btn.firstElementChild.textContent = s.liked ? '♥' : '♡';
          }
          const cnt = bodyEl.querySelector('#shorts-like-count');
          if (cnt) cnt.textContent = String(s.likeCount);
        } catch (err) {
          toast?.(err.message || '좋아요 처리에 실패했습니다.');
        }
      });

      bodyEl.querySelector('#shorts-share-btn')?.addEventListener('click', async () => {
        const shareUrl = `${location.origin}/?view=shorts&short=${encodeURIComponent(s.id)}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast?.('쇼츠 링크를 복사했습니다!');
        } catch {
          toast?.(shareUrl);
        }
      });

      bodyEl.querySelector('#shorts-prev-btn')?.addEventListener('click', () => {
        if (currentIndex > 0) { currentIndex--; renderStage(); }
      });
      bodyEl.querySelector('#shorts-next-btn')?.addEventListener('click', () => {
        if (currentIndex < shorts.length - 1) { currentIndex++; renderStage(); }
      });
      for (const qBtn of bodyEl.querySelectorAll('[data-queue-idx]')) {
        qBtn.addEventListener('click', () => {
          currentIndex = Number(qBtn.dataset.queueIdx);
          renderStage();
        });
      }

      recordViewOnce(s);
    }

    async function loadList() {
      try {
        if (onlyMine) {
          const data = await api('/api/shorts/creator/mine');
          shorts = (data.shorts || []).filter(item => item.videoUrl && ['published', 'ready'].includes(item.status));
        } else {
          const params = new URLSearchParams({ sort, limit: '30' });
          if (initialGameId) params.set('gameId', initialGameId);
          const data = await api('/api/shorts?' + params.toString());
          shorts = data.shorts || [];
        }
        if (initialShortId) {
          const idx = shorts.findIndex(x => x.id === initialShortId);
          if (idx >= 0) currentIndex = idx;
        }
        renderStage();
      } catch (err) {
        bodyEl.innerHTML = `<section class="surface empty-state"><p>${esc(err.message || '쇼츠 피드를 불러오지 못했습니다.')}</p></section>`;
      }
    }

    for (const btn of root.querySelectorAll('[data-shorts-sort]')) {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.shortsSort;
        onlyMine = mode === 'mine';
        sort = mode === 'popular' ? 'popular' : 'latest';
        currentIndex = 0;
        for (const other of root.querySelectorAll('[data-shorts-sort]')) {
          const active = other === btn;
          other.classList.toggle('active', active);
          other.setAttribute('aria-pressed', String(active));
        }
        void loadList();
      });
    }

    const onKeyDown = e => {
      if (!root.isConnected) {
        window.removeEventListener('keydown', onKeyDown);
        return;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowDown' && currentIndex < shorts.length - 1) {
        e.preventDefault();
        currentIndex++;
        renderStage();
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        currentIndex--;
        renderStage();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    await loadList();
    return () => window.removeEventListener('keydown', onKeyDown);
  }

  async function mountGameDetailShorts(container, game, { api, session } = {}) {
    if (!container || !game?.id) return;
    try {
      const data = await api(`/api/shorts/by-game/${encodeURIComponent(game.id)}`, { timeout: 4000 });
      if (!container.isConnected) return;
      const list = Array.isArray(data?.shorts) ? data.shorts : [];
      if (!list.length) {
        if (session?.kind === 'registered') {
          container.innerHTML = `
            <section class="detail-shorts-section">
              <div class="detail-shorts-head">
                <h2>🎬 게임 소개 쇼츠</h2>
                <a class="button secondary small" href="${shortsStudioUrl(game.id)}" target="_blank" rel="noopener">✨ PlayForge에서 이 게임 쇼츠 만들기 ↗</a>
              </div>
              <p class="muted">아직 등록된 소개 쇼츠 영상이 없습니다. PlayForge에서 PlayCoin으로 9:16 게임 소개 쇼츠를 생성해 등록할 수 있습니다.</p>
            </section>`;
        } else {
          container.innerHTML = '';
        }
        return;
      }

      let activeIdx = 0;
      function paint() {
        const s = list[activeIdx] || list[0];
        container.innerHTML = `
          <section class="detail-shorts-section" data-testid="game-detail-shorts">
            <div class="detail-shorts-head">
              <h2>🎬 게임 소개 쇼츠 (${list.length})</h2>
              <div class="save-actions">
                <a class="text-button" href="/?view=shorts&amp;short=${encodeURIComponent(s.id)}" data-route>쇼츠 피드에서 크게 보기 →</a>
                ${session?.kind === 'registered' ? `<a class="button secondary small" href="${shortsStudioUrl(game.id)}" target="_blank" rel="noopener">+ 쇼츠 추가 ↗</a>` : ''}
              </div>
            </div>
            <div class="detail-shorts-body">
              <div class="detail-shorts-player">
                <video src="${esc(s.videoUrl)}" ${s.posterUrl ? `poster="${esc(s.posterUrl)}"` : ''} controls playsinline loop muted></video>
              </div>
              <div class="detail-shorts-meta">
                <h3>${esc(s.title)}</h3>
                <p>${esc(s.caption || game.description)}</p>
                <div class="detail-shorts-chips">
                  <span class="card-genre">${esc(s.resolvedEngineName || s.engineName)}</span>
                  <span class="card-genre">@${esc(s.creatorName)}</span>
                  <span class="card-genre">♥ ${s.likeCount || 0} · 👁️ ${s.viewCount || 0}</span>
                  ${s.isPrimary ? '<span class="card-shorts-badge">⭐ 대표 소개 영상</span>' : ''}
                </div>
                ${Array.isArray(s.hashtags) && s.hashtags.length ? `<p class="muted">${esc(s.hashtags.join(' '))}</p>` : ''}
                ${list.length > 1 ? `<div class="detail-shorts-more">${list.map((it, idx) => `
                  <button type="button" class="filter${idx === activeIdx ? ' active' : ''}" data-detail-short-idx="${idx}">${idx + 1}. ${esc(it.title.slice(0, 18))}</button>
                `).join('')}</div>` : ''}
              </div>
            </div>
          </section>`;
        for (const btn of container.querySelectorAll('[data-detail-short-idx]')) {
          btn.addEventListener('click', () => {
            activeIdx = Number(btn.dataset.detailShortIdx);
            paint();
          });
        }
      }
      paint();
    } catch {
      container.innerHTML = '';
    }
  }

  async function mountCreatorDashboard(container, { api, toast, session, compact = false } = {}) {
    if (!container) return;
    if (session?.kind !== 'registered') {
      if (compact) { container.innerHTML = ''; return; }
      container.innerHTML = `
        <section class="surface creator-shorts-box">
          <h2>🎬 AI 게임 소개 쇼츠 스튜디오 (Google Flow · PlayForge)</h2>
          <p>PlayForge에서 PlayCoin으로 9:16 게임 소개 쇼츠 영상을 생성해 허브 내 게임에 등록할 수 있습니다. 먼저 PlayHub 계정에 로그인해 주세요.</p>
          <a class="button primary small" href="/?view=account" data-route>계정 로그인</a>
        </section>`;
      return;
    }

    async function render() {
      try {
        const data = await api('/api/shorts/creator/mine', { timeout: 5000 });
        if (!container.isConnected) return;
        const list = data?.shorts || [];
        const wallet = data?.wallet || null;
        if (compact && !list.length) {
          container.innerHTML = `
            <section class="surface creator-shorts-box">
              <div class="creator-shorts-head">
                <div>
                  <h2>🎬 내 게임 소개 쇼츠</h2>
                  <p class="muted">PlayForge에서 PlayCoin으로 Google Flow/Veo · Motion 쇼츠를 생성해 내 게임에 소개 영상을 등록할 수 있습니다.</p>
                </div>
                <a class="button primary small" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge 쇼츠 만들기 ↗</a>
              </div>
            </section>`;
          return;
        }
        container.innerHTML = `
          <section class="surface creator-shorts-box" data-testid="creator-shorts-dashboard">
            <div class="creator-shorts-head">
              <div>
                <h2>🎬 내 게임 소개 쇼츠 (${list.length})</h2>
                <p class="muted">PlayForge Shorts Studio에서 PlayCoin으로 생성하고 허브 내 게임에 등록한 소개 영상입니다.</p>
              </div>
              <div class="save-actions">
                ${wallet ? `<span class="creator-shorts-wallet">🪙 ${Number(wallet.available || 0).toLocaleString()} PC</span>` : ''}
                <a class="button primary small" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge 쇼츠 스튜디오 열기 ↗</a>
              </div>
            </div>
            ${list.length ? `<div class="creator-shorts-grid">
              ${list.map(s => `
                <article class="creator-short-item">
                  ${s.posterUrl ? `<img src="${esc(s.posterUrl)}" alt="" loading="lazy">` : ''}
                  <div class="creator-short-item-body">
                    <strong>${esc(s.title)}</strong>
                    <small>${esc(s.game?.title || s.gameId || '미연결 초안')} · ${s.status === 'published' ? '공개 중' : s.status === 'ready' ? '등록 대기' : s.status}${s.isPrimary ? ' · ⭐대표' : ''}</small>
                    <small>${esc(s.resolvedEngineName || s.engineName)} · ${s.chargedCoins || 0} PC · ♥ ${s.likeCount || 0}</small>
                    <div class="creator-short-actions">
                      ${s.status === 'published' ? `<a class="button secondary small" href="/?view=shorts&amp;short=${encodeURIComponent(s.id)}" data-route>보기</a>` : ''}
                      ${s.status === 'published' && !s.isPrimary ? `<button type="button" class="text-button" data-cs-primary="${esc(s.id)}">대표 지정</button>` : ''}
                      ${s.status === 'published' ? `<button type="button" class="text-button" data-cs-unpub="${esc(s.id)}">비공개</button>` : ''}
                      ${s.status === 'unpublished' && s.gameId ? `<button type="button" class="button primary small" data-cs-repub="${esc(s.id)}" data-cs-game="${esc(s.gameId)}">다시 공개</button>` : ''}
                      <button type="button" class="text-button" data-cs-del="${esc(s.id)}">삭제</button>
                    </div>
                  </div>
                </article>
              `).join('')}
            </div>` : '<p class="muted">아직 생성된 쇼츠가 없습니다. 상단 버튼을 눌러 첫 게임 소개 쇼츠를 만들어 보세요.</p>'}
          </section>`;

        container.querySelectorAll('[data-cs-primary]').forEach(btn => {
          btn.onclick = async () => {
            try {
              await api(`/api/shorts/${encodeURIComponent(btn.dataset.csPrimary)}`, { method: 'PATCH', body: { isPrimary: true } });
              toast?.('대표 소개 영상으로 설정했습니다.');
              await render();
            } catch (e) { toast?.(e.message); }
          };
        });
        container.querySelectorAll('[data-cs-unpub]').forEach(btn => {
          btn.onclick = async () => {
            try {
              await api(`/api/shorts/${encodeURIComponent(btn.dataset.csUnpub)}`, { method: 'PATCH', body: { status: 'unpublished' } });
              toast?.('쇼츠를 비공개로 전환했습니다.');
              await render();
            } catch (e) { toast?.(e.message); }
          };
        });
        container.querySelectorAll('[data-cs-repub]').forEach(btn => {
          btn.onclick = async () => {
            try {
              await api(`/api/shorts/${encodeURIComponent(btn.dataset.csRepub)}/publish`, {
                method: 'POST',
                body: { gameId: btn.dataset.csGame, visibility: 'public' }
              });
              toast?.('쇼츠를 다시 허브에 공개했습니다.');
              await render();
            } catch (e) { toast?.(e.message); }
          };
        });
        container.querySelectorAll('[data-cs-del]').forEach(btn => {
          btn.onclick = async () => {
            if (!confirm('이 쇼츠 영상을 삭제할까요?')) return;
            try {
              await api(`/api/shorts/${encodeURIComponent(btn.dataset.csDel)}`, { method: 'DELETE' });
              toast?.('쇼츠를 삭제했습니다.');
              await render();
            } catch (e) { toast?.(e.message); }
          };
        });
      } catch {
        container.innerHTML = '';
      }
    }

    await render();
  }

  window.PlayHubShorts = {
    shortsStudioUrl,
    loadGamesSummary,
    summaryForGame,
    badgeMarkup,
    mountHomeShelf,
    mountFeed,
    mountGameDetailShorts,
    mountCreatorDashboard
  };
})();
