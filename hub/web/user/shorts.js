// PlayHub Portal Shorts Module — 3-Format Player (TikTok/Kakao Cuts Motion Graphic, Generative MP4, YouTube Horizontal 4-Cut Carousel)
(function () {
  'use strict';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  let summaryMap = {};
  let shortsConfigCache = null;
  let experimentalEnabled = false;

  async function loadShortsConfig(api) {
    if (shortsConfigCache) return shortsConfigCache;
    if (!api) return { experimentalEnabled: false };
    try {
      const cfg = await api('/api/shorts/config', { timeout: 3000 });
      shortsConfigCache = cfg || { experimentalEnabled: false };
      experimentalEnabled = Boolean(shortsConfigCache.experimentalEnabled);
    } catch {
      shortsConfigCache = { experimentalEnabled: false };
      experimentalEnabled = false;
    }
    return shortsConfigCache;
  }

  function shortsStudioUrl(gameId = '') {
    const base = '/forge/OfficialGodot/shorts-studio.html';
    return gameId ? `${base}?game=${encodeURIComponent(gameId)}` : base;
  }

  function formatLabel(renderMode) {
    if (renderMode === 'motion-graphic') return '✨ 모션그래픽';
    if (renderMode === 'carousel-images') return '🖼️ 가로 4컷';
    return '🎬 생성형 영상';
  }

  function formatShortCount(n) {
    const num = Number(n) || 0;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}만`;
    return num.toLocaleString();
  }

  function speakKorean(text, { cancelPrev = true } = {}) {
    if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      if (cancelPrev) window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(text));
      utter.lang = 'ko-KR';
      utter.rate = 1.15;
      utter.pitch = 1.03;
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      const ko = voices.find(v => /^ko/i.test(v.lang));
      if (ko) utter.voice = ko;
      window.speechSynthesis.speak(utter);
    } catch {}
  }

  function stopSpeech() {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {}
  }

  function playPopSfx() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.13);
      setTimeout(() => ctx.close().catch(() => {}), 220);
    } catch {}
  }

  function resolveRenderMode(shortObj) {
    if (shortObj?.renderMode) return shortObj.renderMode;
    if (shortObj?.resolvedEngineId === 'motion-graphic-web' || shortObj?.engineId === 'motion-graphic-web') return 'motion-graphic';
    if (shortObj?.resolvedEngineId === 'youtube-carousel-web' || shortObj?.engineId === 'youtube-carousel-web') return 'carousel-images';
    return 'generative-video';
  }

  function resolveNarration(shortObj) {
    const list = Array.isArray(shortObj?.narration) && shortObj.narration.length
      ? shortObj.narration
      : (Array.isArray(shortObj?.storyboard?.narration) ? shortObj.storyboard.narration : []);
    if (list.length) return list;
    const dur = Number(shortObj?.durationSec) || 8;
    return [
      { startSec: 0, endSec: dur * 0.35, text: shortObj?.storyboard?.hookText || shortObj?.title || '지금 바로 시작하세요!' },
      { startSec: dur * 0.35, endSec: dur * 0.72, text: shortObj?.caption || '설치 없이 브라우저에서 즉시 플레이!' },
      { startSec: dur * 0.72, endSec: dur, text: '플레이허브에서 바로 플레이!' }
    ];
  }

  function resolveCarouselSlides(shortObj) {
    const slides = Array.isArray(shortObj?.carouselSlides) && shortObj.carouselSlides.length
      ? shortObj.carouselSlides
      : (Array.isArray(shortObj?.storyboard?.carouselSlides) ? shortObj.storyboard.carouselSlides : []);
    if (slides.length) return slides;
    return [
      { index: 1, badge: '1/4 · 오프닝', headline: shortObj?.title || 'PlayHub 쇼츠', caption: shortObj?.caption || '지금 시작하세요', narration: shortObj?.title || '지금 시작하세요', zoomOrigin: '30% 45%', cropScale: 1.15, accent: '#4285F4' },
      { index: 2, badge: '2/4 · 핵심 액션', headline: shortObj?.storyboard?.highlightText || '짜릿한 손맛', caption: '설치 없이 1초 입장', narration: '브라우저에서 설치 없이 바로 시작합니다', zoomOrigin: '68% 45%', cropScale: 1.25, accent: '#EA4335' },
      { index: 3, badge: '3/4 · 피크 모먼트', headline: '역전 한 방 폭발!', caption: 'PlayHub 추천 웹 게임', narration: '완벽한 타이밍으로 전장을 뒤집어 보세요!', zoomOrigin: '50% 55%', cropScale: 1.3, accent: '#FBBC04' },
      { index: 4, badge: '4/4 · 바로 플레이', headline: shortObj?.storyboard?.ctaText || '지금 무료 플레이 ▶', caption: shortObj?.game?.title || 'PlayHub', narration: '지금 플레이허브에서 바로 즐겨보세요!', zoomOrigin: '50% 50%', cropScale: 1.0, accent: '#34A853' }
    ];
  }

  /**
   * Reusable 3-Format Player Widget (used by Feed, Game Detail, Studio, PoC)
   * Returns a cleanup() function that cancels timers, speechSynthesis, and media.
   */
  function mountShortPlayer(container, shortObj, {
    api = null,
    toast = null,
    activeFormatTab = 'all',
    onSelectFormatTab = null,
    onCycleFormat = null,
    muted = true,
    onMuteChange = null,
    compact = false
  } = {}) {
    if (!container || !shortObj) return () => {};
    stopSpeech();

    const mode = resolveRenderMode(shortObj);
    const narration = resolveNarration(shortObj);
    const topHl = shortObj.topHeadline || shortObj.storyboard?.topHeadline || {
      line1: `${shortObj.storyboard?.genreLabel || 'PlayHub'} 인기 웹 게임`,
      line2: shortObj.game?.title || shortObj.title
    };
    const bestComment = shortObj.bestComment || shortObj.storyboard?.bestComment || {
      author: '플허유저(play****)',
      text: `와 ${shortObj.game?.title || '이 게임'} 설치 없이 바로 되는데 중독성 미쳤다ㅋㅋ`
    };
    const visualUrl = shortObj.posterUrl || shortObj.game?.coverUrl || shortObj.motionSpec?.coverUrl || '';
    const gameTitle = shortObj.game?.title || shortObj.gameId || 'PlayHub 게임';
    const playUrl = shortObj.gameId ? `/play/${encodeURIComponent(shortObj.gameId)}/` : '/';
    const creatorInitial = (shortObj.creatorName || 'P').slice(0, 1).toUpperCase();

    const cleanups = [];
    let isMuted = muted;

    // ===== TYPE 3: YOUTUBE SHORTS HORIZONTAL-SCROLL 4-CUT IMAGE CAROUSEL =====
    if (mode === 'carousel-images') {
      const slides = resolveCarouselSlides(shortObj);
      const totalSlides = slides.length;
      let slideIdx = 0;
      const viralTitle = shortObj.carouselTitle || shortObj.storyboard?.carouselTitle || shortObj.title;

      container.innerHTML = `
        <article class="yt-carousel-card" data-testid="shorts-carousel-card" data-short-id="${esc(shortObj.id)}" data-render-mode="carousel-images">
          <div class="yt-app-bar">
            <span class="yt-brand"><span class="yt-brand-badge">▶</span>PlayHub 숏츠 카드</span>
            <span style="font-size:11.5px;color:#AAAAAA">가로 스와이프 · 4컷</span>
          </div>
          ${!compact && onSelectFormatTab ? `
          <div class="yt-tabs-bar" role="tablist">
            <button type="button" class="${activeFormatTab === 'all' ? 'active' : ''}" data-yt-tab="all">전체</button>
            <button type="button" class="${activeFormatTab === 'motion-graphic' ? 'active' : ''}" data-yt-tab="motion-graphic">모션그래픽</button>
            <button type="button" class="${activeFormatTab === 'generative-video' ? 'active' : ''}" data-yt-tab="generative-video">생성형 영상</button>
            <button type="button" class="${activeFormatTab === 'carousel-images' ? 'active' : ''}" data-yt-tab="carousel-images">가로 4컷</button>
          </div>` : ''}
          <div class="yt-post-top">
            <div class="yt-author">
              <span class="cuts-avatar">${esc(creatorInitial)}</span>
              <div class="yt-author-meta">
                <strong>@${esc(shortObj.creatorName)}</strong>
                <small>▷ ${formatShortCount(shortObj.viewCount || 1)} · ${esc(gameTitle)}</small>
              </div>
            </div>
            <div class="yt-top-icons">
              <button type="button" class="yt-icon-btn${shortObj.liked ? ' active' : ''}" data-act="like" title="좋아요">👍</button>
              ${onCycleFormat ? '<button type="button" class="yt-icon-btn" data-act="cycle" title="3종 포맷 전환">🔄</button>' : ''}
              <button type="button" class="yt-icon-btn" data-act="save" title="게임 찜">🔖</button>
            </div>
          </div>

          <div class="yt-carousel-frame">
            <span class="yt-counter-pill" data-yt-counter>1/${totalSlides}</span>
            <button type="button" class="yt-nav-arrow prev" data-yt-prev aria-label="이전 컷" disabled>‹</button>
            <button type="button" class="yt-nav-arrow next" data-yt-next aria-label="다음 컷">›</button>
            <div class="yt-carousel-track" data-yt-track tabindex="0" aria-label="가로 스크롤 4컷 이미지">
              ${slides.map((sl, i) => `
                <div class="yt-slide" data-slide-idx="${i}">
                  <div class="yt-slide-panel">
                    <img class="yt-slide-img" src="${esc(sl.imageUrl || visualUrl)}" alt="${esc(sl.headline)}"
                      style="transform-origin:${esc(sl.zoomOrigin || '50% 50%')};transform:scale(${Number(sl.cropScale || 1.05)});filter:${esc(sl.filterCss || 'none')}">
                    <span class="yt-slide-badge" style="background:${esc(sl.accent || '#4285F4')}">${esc(sl.badge || `${i + 1}/${totalSlides}`)}</span>
                    <div class="yt-slide-caption-box">
                      <div class="yt-slide-headline">${esc(sl.headline)}</div>
                      <div class="yt-slide-sub">${esc(sl.caption)}</div>
                      ${i === totalSlides - 1 && shortObj.gameId ? `<a class="yt-slide-cta" href="${playUrl}">▶ ${esc(gameTitle)} 바로 플레이</a>` : ''}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="yt-dots" data-yt-dots>
            ${slides.map((_, i) => `<button type="button" class="yt-dot${i === 0 ? ' active' : ''}" data-dot-idx="${i}" aria-label="${i + 1}번 컷"></button>`).join('')}
          </div>

          <div class="yt-body">
            <div class="yt-narr-strip">
              <span data-yt-narration>🎙️ ${esc(slides[0]?.narration || slides[0]?.headline || '')}</span>
              <button type="button" class="yt-tts-btn" data-yt-speak>🔊 나래이션</button>
            </div>
            <h3 class="yt-post-title">${esc(viralTitle)}</h3>
            <div class="yt-bottom-row">
              <div class="yt-author">
                <span class="cuts-avatar" style="width:26px;height:26px;font-size:11px">${esc(creatorInitial)}</span>
                <div class="yt-author-meta">
                  <strong>${esc(gameTitle)}</strong>
                  <small>👍 <span data-like-count>${formatShortCount(shortObj.likeCount || 0)}</span> · 4컷 카드 · 0MB</small>
                </div>
              </div>
              <div class="yt-action-bar">
                <button type="button" class="yt-icon-btn${shortObj.liked ? ' active' : ''}" data-act="like" aria-label="좋아요">👍</button>
                <button type="button" class="yt-icon-btn" data-act="share" aria-label="공유">↪</button>
                ${shortObj.gameId ? `<a class="yt-play-pill" href="${playUrl}" data-testid="shorts-play-game-btn">▶ 플레이</a>` : ''}
              </div>
            </div>
          </div>
        </article>`;

      const track = container.querySelector('[data-yt-track]');
      const counterEl = container.querySelector('[data-yt-counter]');
      const narrEl = container.querySelector('[data-yt-narration]');
      const prevBtn = container.querySelector('[data-yt-prev]');
      const nextBtn = container.querySelector('[data-yt-next]');
      const dots = [...container.querySelectorAll('[data-dot-idx]')];

      function syncSlideUi(idx, { speak = false } = {}) {
        slideIdx = Math.max(0, Math.min(totalSlides - 1, idx));
        if (counterEl) counterEl.textContent = `${slideIdx + 1}/${totalSlides}`;
        if (prevBtn) prevBtn.disabled = slideIdx === 0;
        if (nextBtn) nextBtn.disabled = slideIdx >= totalSlides - 1;
        dots.forEach((d, i) => d.classList.toggle('active', i === slideIdx));
        const sl = slides[slideIdx];
        if (narrEl && sl) narrEl.textContent = `🎙️ ${sl.narration || sl.headline}`;
        if (speak && sl) speakKorean(sl.narration || sl.headline);
      }

      function scrollToSlide(idx, speak = false) {
        const clamped = Math.max(0, Math.min(totalSlides - 1, idx));
        if (track) track.scrollTo({ left: clamped * track.clientWidth, behavior: 'smooth' });
        syncSlideUi(clamped, { speak });
      }

      prevBtn?.addEventListener('click', () => scrollToSlide(slideIdx - 1, !isMuted));
      nextBtn?.addEventListener('click', () => scrollToSlide(slideIdx + 1, !isMuted));
      dots.forEach(d => d.addEventListener('click', () => scrollToSlide(Number(d.dataset.dotIdx), !isMuted)));

      let scrollRaf = null;
      track?.addEventListener('scroll', () => {
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => {
          const w = track.clientWidth || 1;
          const nextIdx = Math.round(track.scrollLeft / w);
          if (nextIdx !== slideIdx) syncSlideUi(nextIdx);
        });
      });

      container.querySelector('[data-yt-speak]')?.addEventListener('click', () => {
        isMuted = false;
        onMuteChange?.(false);
        const sl = slides[slideIdx];
        speakKorean(sl?.narration || sl?.headline || viralTitle);
        toast?.(`컷 ${slideIdx + 1} 한국어 나래이션 재생 중`);
      });

      container.querySelectorAll('[data-yt-tab]').forEach(btn => {
        btn.addEventListener('click', () => onSelectFormatTab?.(btn.dataset.ytTab));
      });
      wireCommonActions(container, shortObj, { api, toast, onCycleFormat });
      return () => {
        if (scrollRaf) cancelAnimationFrame(scrollRaf);
        stopSpeech();
      };
    }

    // ===== TYPE 1 (NO-VIDEO MOTION GRAPHIC) & TYPE 2 (GENERATIVE MP4 VIDEO) — TIKTOK / KAKAO CUTS UI =====
    const isMotion = mode === 'motion-graphic';
    const dur = Math.max(5, Number(shortObj.durationSec) || 8);

    container.innerHTML = `
      <article class="shorts-reel-card" data-testid="shorts-reel-card" data-short-id="${esc(shortObj.id)}" data-render-mode="${esc(mode)}">
        ${isMotion ? `
          <div class="mg-stage" data-mg-stage data-beat="0">
            <div class="mg-top-headline">
              <span class="mg-hl-line1">${esc(topHl.line1)}</span>
              <span class="mg-hl-line2">${esc(topHl.line2)}</span>
            </div>
            <div class="mg-visual-box">
              <div class="mg-bg-blur" style="background-image:url('${esc(visualUrl)}')"></div>
              <span class="mg-scene-chip" data-mg-chip>✨ 무영상 모션 · 0MB</span>
              <div class="mg-hero-layer">
                <img class="mg-hero-img" src="${esc(visualUrl)}" alt="${esc(gameTitle)}">
              </div>
              <span class="mg-spark s1" aria-hidden="true"></span>
              <span class="mg-spark s2" aria-hidden="true"></span>
              <span class="mg-spark s3" aria-hidden="true"></span>
              <span class="mg-spark s4" aria-hidden="true"></span>
              <div class="mg-cut-flash" data-mg-flash></div>
            </div>
            <div class="mg-lower-spacer"></div>
          </div>
        ` : `
          <video class="shorts-reel-video" data-reel-video src="${esc(shortObj.videoUrl || '')}"
            ${shortObj.posterUrl ? `poster="${esc(shortObj.posterUrl)}"` : ''}
            autoplay ${isMuted ? 'muted' : ''} loop playsinline></video>
        `}

        <div class="cuts-top-pills">
          <div class="cuts-pills-scroll">
            ${!compact && onSelectFormatTab ? `
              <button type="button" class="cuts-pill${activeFormatTab === 'all' ? ' active' : ''}" data-cuts-tab="all">🔥 인기<span class="cuts-pill-dot"></span></button>
              <button type="button" class="cuts-pill${activeFormatTab === 'motion-graphic' ? ' active' : ''}" data-cuts-tab="motion-graphic">✨ 모션</button>
              <button type="button" class="cuts-pill${activeFormatTab === 'generative-video' ? ' active' : ''}" data-cuts-tab="generative-video">🎬 영상</button>
              <button type="button" class="cuts-pill${activeFormatTab === 'carousel-images' ? ' active' : ''}" data-cuts-tab="carousel-images">🖼️ 4컷</button>
            ` : `
              <span class="cuts-pill active">${esc(formatLabel(mode))}<span class="cuts-pill-dot"></span></span>
            `}
          </div>
          <button type="button" class="cuts-pill cuts-pill-sound" data-act="sound">
            ${isMuted ? '🔇 소리' : '🔊 ON'}
          </button>
        </div>

        ${shortObj.gameId ? `<a class="cuts-swipe-cue" href="${playUrl}">← 옆으로 넘겨 바로 플레이</a>` : ''}

        ${isMotion ? `
          <div class="cuts-narration-sub" data-narr-box>
            <span class="cuts-narration-text" data-narr-text>${esc(narration[0]?.text || '')}</span>
          </div>
        ` : ''}

        <div class="cuts-comment-pill" title="베스트 댓글">
          <strong>${esc(bestComment.author)}</strong>
          <span>${esc(bestComment.text)}</span>
        </div>

        <div class="cuts-rail">
          <button type="button" class="cuts-rail-btn${shortObj.liked ? ' liked' : ''}" data-act="like" data-testid="shorts-like-btn" aria-pressed="${Boolean(shortObj.liked)}">
            <span class="rail-ico">${shortObj.liked ? '♥' : '♡'}</span>
            <span data-like-count>${formatShortCount(shortObj.likeCount || 0)}</span>
          </button>
          <button type="button" class="cuts-rail-btn" data-act="script">
            <span class="rail-ico">💬</span>
            <span>대본·댓글</span>
          </button>
          ${onCycleFormat ? `
          <button type="button" class="cuts-rail-btn" data-act="cycle">
            <span class="rail-ico">≡</span>
            <span>3종전환</span>
          </button>` : ''}
          <button type="button" class="cuts-rail-btn" data-act="save">
            <span class="rail-ico">🔖</span>
            <span>작품찜</span>
          </button>
          <button type="button" class="cuts-rail-btn" data-act="share">
            <span class="rail-ico">↪</span>
            <span>공유</span>
          </button>
        </div>

        <div class="cuts-bottom-info">
          <div class="cuts-creator-row">
            <span class="cuts-avatar">${esc(creatorInitial)}</span>
            <span class="cuts-creator-name">${esc(shortObj.creatorName)}</span>
            <button type="button" class="cuts-follow-btn" data-act="follow">+ 팔로우</button>
          </div>
          <div class="cuts-game-row">
            <span class="cuts-game-title">${esc(gameTitle)}</span>
            ${shortObj.gameId ? `<a class="cuts-continue-link" href="${playUrl}" data-testid="shorts-play-game-btn">바로 플레이 &gt;</a>` : ''}
          </div>
          <p class="cuts-caption-line">${esc(shortObj.caption || shortObj.title)}</p>
        </div>

        <div class="cuts-progress-track"><div class="cuts-progress-fill" data-prog-fill></div></div>

        <div class="cuts-mobile-dock">
          <a class="cuts-dock-btn" href="/"><span>🎮</span><span>홈</span></a>
          <button type="button" class="cuts-dock-btn active" data-cuts-tab="all"><span>🎬</span><span>컷츠</span></button>
          <button type="button" class="cuts-dock-btn" data-cuts-tab="carousel-images"><span>🖼️</span><span>4컷</span></button>
          <a class="cuts-dock-btn" href="${shortsStudioUrl(shortObj.gameId || '')}" target="_blank" rel="noopener"><span>✨</span><span>포지제작</span></a>
          ${experimentalEnabled
            ? '<a class="cuts-dock-btn" href="/forge/OfficialGodot/shorts-poc.html" target="_blank" rel="noopener"><span>🧪</span><span>실험</span></a>'
            : '<a class="cuts-dock-btn" href="/?view=wishlist"><span>🔖</span><span>찜목록</span></a>'}
        </div>

        <div class="cuts-sheet" data-script-sheet hidden>
          <div class="cuts-sheet-head">
            <strong>🎙️ 나래이션 대본 &amp; 베스트 댓글</strong>
            <button type="button" class="cuts-sheet-close" data-close-sheet>×</button>
          </div>
          <div class="cuts-script-list">
            ${narration.map((n, i) => `
              <div class="cuts-script-row" data-script-row="${i}">
                <span class="cuts-script-time">${Number(n.startSec || 0).toFixed(1)}s</span>
                <span>${esc(n.text)}</span>
              </div>
            `).join('')}
          </div>
          <div class="cuts-script-row">
            <span class="cuts-script-time">BEST</span>
            <span><strong>${esc(bestComment.author)}</strong> · ${esc(bestComment.text)}</span>
          </div>
        </div>
      </article>`;

    const soundBtn = container.querySelector('[data-act="sound"]');
    const progFill = container.querySelector('[data-prog-fill]');
    const scriptSheet = container.querySelector('[data-script-sheet]');
    const scriptRows = [...container.querySelectorAll('[data-script-row]')];

    container.querySelector('[data-act="script"]')?.addEventListener('click', () => {
      if (scriptSheet) scriptSheet.hidden = !scriptSheet.hidden;
    });
    container.querySelector('[data-close-sheet]')?.addEventListener('click', () => {
      if (scriptSheet) scriptSheet.hidden = true;
    });
    container.querySelectorAll('[data-cuts-tab]').forEach(btn => {
      btn.addEventListener('click', () => onSelectFormatTab?.(btn.dataset.cutsTab));
    });

    if (isMotion) {
      // 60fps-style real-time kinetic motion timeline (zero video file!)
      const stageEl = container.querySelector('[data-mg-stage]');
      const narrTextEl = container.querySelector('[data-narr-text]');
      const flashEl = container.querySelector('[data-mg-flash]');
      const chipEl = container.querySelector('[data-mg-chip]');
      const heroImgEl = container.querySelector('.mg-hero-img');
      const bgBlurEl = container.querySelector('.mg-bg-blur');
      const frameUrls = Array.isArray(shortObj.motionSpec?.frameUrls) && shortObj.motionSpec.frameUrls.length
        ? shortObj.motionSpec.frameUrls
        : (visualUrl ? [visualUrl] : []);
      let elapsedMs = 0;
      let lastBeat = -1;
      let paused = false;

      stageEl?.addEventListener('click', () => {
        paused = !paused;
        if (paused) stopSpeech();
        toast?.(paused ? '모션그래픽 일시정지' : '모션그래픽 재생');
      });

      const tick = () => {
        if (!container.isConnected) return;
        if (!paused) {
          elapsedMs = (elapsedMs + 120) % (dur * 1000);
          const sec = elapsedMs / 1000;
          if (progFill) progFill.style.width = `${Math.min(100, (sec / dur) * 100).toFixed(1)}%`;

          let beatIdx = narration.findIndex(n => sec >= Number(n.startSec || 0) && sec < Number(n.endSec || dur));
          if (beatIdx < 0) beatIdx = narration.length - 1;
          if (beatIdx !== lastBeat) {
            lastBeat = beatIdx;
            if (stageEl) stageEl.dataset.beat = String(beatIdx % 5);
            if (frameUrls.length > 1) {
              const nextSrc = frameUrls[beatIdx % frameUrls.length];
              if (heroImgEl && heroImgEl.getAttribute('src') !== nextSrc) heroImgEl.src = nextSrc;
              if (bgBlurEl) bgBlurEl.style.backgroundImage = `url('${nextSrc.replace(/'/g, '%27')}')`;
            }
            const seg = narration[beatIdx];
            if (narrTextEl && seg) {
              narrTextEl.textContent = seg.text;
              narrTextEl.style.animation = 'none';
              void narrTextEl.offsetWidth;
              narrTextEl.style.animation = '';
            }
            if (chipEl) chipEl.textContent = `✨ 무영상 모션 · BEAT ${beatIdx + 1}/${narration.length}`;
            if (flashEl) {
              flashEl.classList.add('pop');
              setTimeout(() => flashEl.classList.remove('pop'), 180);
            }
            scriptRows.forEach((r, idx) => r.classList.toggle('active', idx === beatIdx));
            if (!isMuted && seg?.text) {
              playPopSfx();
              speakKorean(seg.text);
            }
          }
        }
      };
      tick();
      const timer = setInterval(tick, 120);
      cleanups.push(() => clearInterval(timer));

      soundBtn?.addEventListener('click', () => {
        isMuted = !isMuted;
        onMuteChange?.(isMuted);
        soundBtn.textContent = isMuted ? '🔇 소리' : '🔊 ON';
        if (isMuted) {
          stopSpeech();
        } else {
          const seg = narration[Math.max(0, lastBeat)] || narration[0];
          playPopSfx();
          if (seg?.text) speakKorean(seg.text);
        }
      });
    } else {
      // Generative MP4 Video Player
      const video = container.querySelector('[data-reel-video]');
      if (video) {
        video.addEventListener('click', () => {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        });
        video.addEventListener('timeupdate', () => {
          const total = video.duration || dur;
          if (progFill && total > 0) {
            progFill.style.width = `${Math.min(100, (video.currentTime / total) * 100).toFixed(1)}%`;
          }
          const idx = narration.findIndex(n => video.currentTime >= Number(n.startSec || 0) && video.currentTime < Number(n.endSec || total));
          scriptRows.forEach((r, i) => r.classList.toggle('active', i === idx));
        });
        video.play().catch(() => {});
      }
      soundBtn?.addEventListener('click', () => {
        isMuted = !isMuted;
        onMuteChange?.(isMuted);
        if (video) {
          video.muted = isMuted;
          video.play().catch(() => {});
        }
        soundBtn.textContent = isMuted ? '🔇 소리' : '🔊 ON';
      });
    }

    wireCommonActions(container, shortObj, { api, toast, onCycleFormat });
    return () => {
      cleanups.forEach(fn => { try { fn(); } catch {} });
      stopSpeech();
    };
  }

  function wireCommonActions(container, shortObj, { api, toast, onCycleFormat }) {
    container.querySelectorAll('[data-act="like"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!api) return;
        try {
          const res = await api(`/api/shorts/${encodeURIComponent(shortObj.id)}/like`, { method: 'POST', body: {} });
          shortObj.liked = res.liked;
          shortObj.likeCount = res.likeCount;
          container.querySelectorAll('[data-act="like"]').forEach(b => {
            b.classList.toggle('liked', shortObj.liked);
            b.classList.toggle('active', shortObj.liked);
            b.setAttribute('aria-pressed', String(shortObj.liked));
            const ico = b.querySelector('.rail-ico');
            if (ico) ico.textContent = shortObj.liked ? '♥' : '♡';
          });
          container.querySelectorAll('[data-like-count]').forEach(el => {
            el.textContent = formatShortCount(shortObj.likeCount);
          });
        } catch (err) {
          toast?.(err.message || '좋아요 처리에 실패했습니다.');
        }
      });
    });

    container.querySelector('[data-act="follow"]')?.addEventListener('click', e => {
      const b = e.currentTarget;
      const on = !b.classList.contains('following');
      b.classList.toggle('following', on);
      b.textContent = on ? '✓ 팔로잉' : '+ 팔로우';
      toast?.(on ? `${shortObj.creatorName} 크리에이터를 팔로우했습니다.` : '팔로우를 해제했습니다.');
    });

    container.querySelectorAll('[data-act="save"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const saved = !btn.classList.contains('saved');
        btn.classList.toggle('saved', saved);
        btn.classList.toggle('active', saved);
        if (api && shortObj.gameId) {
          try {
            await api(`/api/wishlist/${encodeURIComponent(shortObj.gameId)}`, { method: saved ? 'POST' : 'DELETE', body: saved ? {} : undefined });
          } catch {}
        }
        toast?.(saved ? `${shortObj.game?.title || '게임'}을 찜 목록에 추가했습니다!` : '찜 목록에서 제거했습니다.');
      });
    });

    container.querySelectorAll('[data-act="share"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const shareUrl = `${location.origin}/?view=shorts&short=${encodeURIComponent(shortObj.id)}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          toast?.('쇼츠 링크를 복사했습니다!');
        } catch {
          toast?.(shareUrl);
        }
      });
    });

    container.querySelectorAll('[data-act="cycle"]').forEach(btn => {
      btn.addEventListener('click', () => onCycleFormat?.(shortObj));
    });
  }

  async function loadGamesSummary(api) {
    try {
      const data = await api('/api/shorts/games-summary', { timeout: 3500 });
      summaryMap = data?.games && typeof data.games === 'object' ? data.games : {};
    } catch {}
    return summaryMap;
  }

  function summaryForGame(gameId) {
    return summaryMap[gameId] || null;
  }

  function badgeMarkup(gameId) {
    const info = summaryForGame(gameId);
    if (!info) return '';
    return `<span class="card-shorts-badge" title="등록된 게임 소개 쇼츠 ${info.count}개">🎬 쇼츠 ${info.count > 1 ? info.count : ''}</span>`;
  }

  async function mountHomeShelf(container, { api } = {}) {
    if (!container) return;
    try {
      const [data] = await Promise.all([
        api('/api/shorts?limit=10&sort=latest', { timeout: 4000 }),
        loadShortsConfig(api)
      ]);
      const shorts = Array.isArray(data?.shorts) ? data.shorts : [];
      if (!container.isConnected) return;
      if (!shorts.length) {
        container.innerHTML = `
          <div class="section-heading">
            <div class="section-heading-left">
              <h2 id="home-shorts-title">🎬 게임 소개 쇼츠 (3종 포맷)</h2>
              <span class="section-subtitle">모션그래픽(무영상) · 생성형 MP4 · 유튜브형 가로 4컷 카드를 만들고 등록하세요</span>
            </div>
            <a class="text-button" href="/?view=shorts" data-route>쇼츠 피드 →</a>
          </div>
          <div class="home-shorts-empty">
            <div>
              <strong>첫 번째 게임 소개 쇼츠의 주인공이 되어 보세요!</strong>
              <p>PlayForge Shorts Studio에서 PlayCoin으로 무영상 모션그래픽·생성형 영상·가로 4컷 카드를 제작해 내 게임에 바로 등록할 수 있습니다.</p>
            </div>
            <a class="button primary small" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge 쇼츠 만들기 ↗</a>
          </div>`;
        return;
      }

      container.innerHTML = `
        <div class="section-heading">
          <div class="section-heading-left">
            <h2 id="home-shorts-title">🎬 게임 소개 쇼츠</h2>
            <span class="section-subtitle">모션그래픽(무영상) · 생성형 영상 · 유튜브 가로 4컷으로 즐기는 8초 게임 하이라이트</span>
          </div>
          <div class="save-actions">
            ${experimentalEnabled ? '<a class="text-button" href="/forge/OfficialGodot/shorts-poc.html" target="_blank" rel="noopener">🧪 실험실 (DEV) ↗</a>' : ''}
            <a class="text-button" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge 제작 ↗</a>
            <a class="text-button" href="/?view=shorts" data-route>쇼츠 전체보기 →</a>
          </div>
        </div>
        <div class="home-shorts-strip">
          ${shorts.map(s => {
            const rm = resolveRenderMode(s);
            return `
            <a class="shorts-thumb-card" href="/?view=shorts&amp;short=${encodeURIComponent(s.id)}" data-route data-testid="home-short-card">
              <div class="shorts-thumb-media">
                ${s.posterUrl ? `<img src="${esc(s.posterUrl)}" alt="" loading="lazy" decoding="async">` : ''}
                <span class="shorts-thumb-fmt fmt-${esc(rm)}">${esc(formatLabel(rm))}</span>
                <span class="shorts-thumb-play">♥ ${s.likeCount || 0}</span>
              </div>
              <div class="shorts-thumb-body">
                <strong>${esc(s.game?.title || s.title)}</strong>
                <small>${esc(s.title)}</small>
              </div>
            </a>`;
          }).join('')}
        </div>`;
    } catch {
      container.hidden = true;
    }
  }

  async function mountFeed(root, { api, toast, session, initialShortId = '', initialGameId = '' } = {}) {
    await loadShortsConfig(api);
    let sort = 'latest';
    let formatFilter = 'all';
    let onlyMine = false;
    let shorts = [];
    let currentIndex = 0;
    let muted = true;
    let disposePlayer = null;
    const viewedIds = new Set();

    root.innerHTML = `
      <div class="shorts-page">
        <div class="shorts-topbar">
          <div>
            <h1>🎬 PlayHub 게임 쇼츠 · 컷츠 &amp; 4컷</h1>
            <p class="shorts-topbar-sub">틱톡·카카오웹툰 컷츠 UI(모션그래픽 무영상 · 생성형 MP4 + 한국어 나래이션)와 유튜브형 가로 스크롤 4컷 이미지를 한 피드에서 체험하세요.</p>
          </div>
          <div class="shorts-topbar-actions">
            ${experimentalEnabled ? '<a class="button secondary" href="/forge/OfficialGodot/shorts-poc.html" target="_blank" rel="noopener" data-testid="open-shorts-poc">🧪 실험 파이프라인 (DEV) ↗</a>' : ''}
            <a class="button primary" href="${shortsStudioUrl(initialGameId)}" target="_blank" rel="noopener" data-testid="open-shorts-studio">✨ PlayForge에서 쇼츠 만들기 ↗</a>
          </div>
        </div>
        <div class="shorts-format-bar">
          <div class="shorts-filters" role="group" aria-label="포맷 필터">
            <button type="button" class="filter active" data-shorts-format="all" aria-pressed="true">🔥 전체 3종</button>
            <button type="button" class="filter" data-shorts-format="motion-graphic" aria-pressed="false">✨ 모션그래픽 (무영상)</button>
            <button type="button" class="filter" data-shorts-format="generative-video" aria-pressed="false">🎬 생성형 영상 (MP4)</button>
            <button type="button" class="filter" data-shorts-format="carousel-images" aria-pressed="false">🖼️ 유튜브 가로 4컷</button>
          </div>
          <div class="shorts-filters" role="group" aria-label="정렬">
            <button type="button" class="filter active" data-shorts-sort="latest" aria-pressed="true">최신순</button>
            <button type="button" class="filter" data-shorts-sort="popular" aria-pressed="false">인기순</button>
            ${session?.kind === 'registered' ? '<button type="button" class="filter" data-shorts-sort="mine" aria-pressed="false">내 등록 쇼츠</button>' : ''}
          </div>
        </div>
        <div id="shorts-feed-body" class="shorts-feed-body">
          <section class="loading-state" role="status"><div class="loading-dot" aria-hidden="true"></div><p>쇼츠 피드를 불러오고 있습니다…</p></section>
        </div>
      </div>`;

    const bodyEl = root.querySelector('#shorts-feed-body');

    function syncFormatFilterButtons() {
      for (const b of root.querySelectorAll('[data-shorts-format]')) {
        const active = b.dataset.shortsFormat === formatFilter;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      }
    }

    function recordViewOnce(shortObj) {
      if (!shortObj || viewedIds.has(shortObj.id)) return;
      viewedIds.add(shortObj.id);
      api(`/api/shorts/${encodeURIComponent(shortObj.id)}/view`, { method: 'POST', body: {} })
        .then(res => {
          if (typeof res?.viewCount === 'number') shortObj.viewCount = res.viewCount;
        })
        .catch(() => {});
    }

    function renderStage() {
      if (disposePlayer) { disposePlayer(); disposePlayer = null; }
      if (!shorts.length) {
        bodyEl.innerHTML = `
          <section class="surface empty-state">
            <h2>${onlyMine ? '아직 등록한 게임 소개 쇼츠가 없습니다' : '선택한 포맷에 공개된 쇼츠가 없습니다'}</h2>
            <p>PlayForge 쇼츠 생성기에서 모션그래픽·생성형 MP4·가로 4컷 카드를 즉시 제작해 보세요.</p>
            <div class="save-actions" style="justify-content:center">
              <a class="button primary" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ PlayForge 쇼츠 생성기 열기 ↗</a>
              ${experimentalEnabled ? '<a class="button secondary" href="/forge/OfficialGodot/shorts-poc.html" target="_blank" rel="noopener">🧪 실험실 (DEV) ↗</a>' : ''}
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
            <div id="shorts-active-player" style="width:100%;display:flex;justify-content:center"></div>
            <div class="shorts-nav-controls">
              <button type="button" class="button secondary small" id="shorts-prev-btn" ${currentIndex === 0 ? 'disabled' : ''}>↑ 이전 쇼츠</button>
              <span class="muted">${currentIndex + 1} / ${shorts.length}</span>
              <button type="button" class="button secondary small" id="shorts-next-btn" ${currentIndex >= shorts.length - 1 ? 'disabled' : ''}>↓ 다음 쇼츠</button>
            </div>
          </div>
          <aside class="shorts-queue-panel">
            <h2>쇼츠 재생목록 (${shorts.length})</h2>
            <div class="shorts-queue-grid">
              ${shorts.map((item, idx) => {
                const rm = resolveRenderMode(item);
                return `
                <button type="button" class="shorts-thumb-card${idx === currentIndex ? ' active' : ''}" data-queue-idx="${idx}">
                  <div class="shorts-thumb-media">
                    ${item.posterUrl ? `<img src="${esc(item.posterUrl)}" alt="" loading="lazy">` : ''}
                    <span class="shorts-thumb-fmt fmt-${esc(rm)}">${esc(formatLabel(rm))}</span>
                    <span class="shorts-thumb-play">♥ ${item.likeCount || 0}</span>
                  </div>
                  <div class="shorts-thumb-body">
                    <strong>${esc(item.game?.title || item.title)}</strong>
                    <small>${esc(item.title)}</small>
                  </div>
                </button>`;
              }).join('')}
            </div>
          </aside>
        </div>`;

      const playerHost = bodyEl.querySelector('#shorts-active-player');
      disposePlayer = mountShortPlayer(playerHost, s, {
        api,
        toast,
        activeFormatTab: formatFilter,
        muted,
        onMuteChange: m => { muted = m; },
        onSelectFormatTab: nextFmt => {
          formatFilter = nextFmt || 'all';
          syncFormatFilterButtons();
          currentIndex = 0;
          void loadList();
        },
        onCycleFormat: curShort => {
          // Jump to another format of the same game if present in the loaded list!
          const sameGame = shorts
            .map((it, idx) => ({ it, idx }))
            .filter(x => x.it.gameId && x.it.gameId === curShort.gameId && x.it.id !== curShort.id);
          if (sameGame.length) {
            const next = sameGame.find(x => x.idx > currentIndex) || sameGame[0];
            currentIndex = next.idx;
            renderStage();
            toast?.(`${formatLabel(resolveRenderMode(shorts[currentIndex]))} 포맷으로 전환했습니다.`);
          } else {
            const order = ['all', 'motion-graphic', 'generative-video', 'carousel-images'];
            formatFilter = order[(order.indexOf(formatFilter) + 1) % order.length];
            syncFormatFilterButtons();
            currentIndex = 0;
            void loadList();
          }
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
          shorts = (data.shorts || []).filter(item =>
            ['published', 'ready'].includes(item.status) &&
            (formatFilter === 'all' || resolveRenderMode(item) === formatFilter)
          );
        } else {
          const params = new URLSearchParams({ sort, limit: '45' });
          if (initialGameId) params.set('gameId', initialGameId);
          if (formatFilter !== 'all') params.set('format', formatFilter);
          const data = await api('/api/shorts?' + params.toString());
          shorts = data.shorts || [];
        }
        if (initialShortId) {
          const idx = shorts.findIndex(x => x.id === initialShortId);
          if (idx >= 0) currentIndex = idx;
          initialShortId = '';
        }
        renderStage();
      } catch (err) {
        bodyEl.innerHTML = `<section class="surface empty-state"><p>${esc(err.message || '쇼츠 피드를 불러오지 못했습니다.')}</p></section>`;
      }
    }

    for (const btn of root.querySelectorAll('[data-shorts-format]')) {
      btn.addEventListener('click', () => {
        formatFilter = btn.dataset.shortsFormat;
        syncFormatFilterButtons();
        currentIndex = 0;
        void loadList();
      });
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
        if (disposePlayer) disposePlayer();
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
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (disposePlayer) disposePlayer();
    };
  }

  async function mountGameDetailShorts(container, game, { api, toast, session } = {}) {
    if (!container || !game?.id) return;
    let disposeDetail = null;
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
              <p class="muted">아직 등록된 소개 쇼츠가 없습니다. PlayForge에서 모션그래픽(10 PC)·생성형 MP4(20 PC)·가로 4컷(5 PC) 중 원하는 타입을 등록해 보세요.</p>
            </section>`;
        } else {
          container.innerHTML = '';
        }
        return;
      }

      let activeIdx = 0;
      function paint() {
        if (disposeDetail) { disposeDetail(); disposeDetail = null; }
        const s = list[activeIdx] || list[0];
        const rm = resolveRenderMode(s);
        container.innerHTML = `
          <section class="detail-shorts-section" data-testid="game-detail-shorts">
            <div class="detail-shorts-head">
              <h2>🎬 게임 소개 쇼츠 (${list.length}종 등록됨)</h2>
              <div class="save-actions">
                <a class="text-button" href="/?view=shorts&amp;short=${encodeURIComponent(s.id)}" data-route>쇼츠 피드에서 크게 보기 →</a>
                ${session?.kind === 'registered' ? `<a class="button secondary small" href="${shortsStudioUrl(game.id)}" target="_blank" rel="noopener">+ 쇼츠 추가 ↗</a>` : ''}
              </div>
            </div>
            <div class="detail-shorts-body">
              <div class="detail-shorts-player" id="detail-short-player-host"></div>
              <div class="detail-shorts-meta">
                <div class="detail-shorts-chips">
                  <span class="card-shorts-badge">${esc(formatLabel(rm))}</span>
                  <span class="card-genre">${esc(s.resolvedEngineName || s.engineName)}</span>
                  <span class="card-genre">@${esc(s.creatorName)}</span>
                  <span class="card-genre">♥ ${s.likeCount || 0} · 👁️ ${s.viewCount || 0}</span>
                  ${s.isPrimary ? '<span class="card-shorts-badge">⭐ 대표</span>' : ''}
                </div>
                <h3>${esc(s.title)}</h3>
                <p>${esc(s.caption || game.description)}</p>
                ${Array.isArray(s.hashtags) && s.hashtags.length ? `<p class="muted">${esc(s.hashtags.join(' '))}</p>` : ''}
                ${list.length > 1 ? `<div class="detail-shorts-more">${list.map((it, idx) => `
                  <button type="button" class="filter${idx === activeIdx ? ' active' : ''}" data-detail-short-idx="${idx}">${esc(formatLabel(resolveRenderMode(it)))} · ${esc(it.title.slice(0, 14))}</button>
                `).join('')}</div>` : ''}
              </div>
            </div>
          </section>`;

        const host = container.querySelector('#detail-short-player-host');
        disposeDetail = mountShortPlayer(host, s, { api, toast, compact: true, muted: true });

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
          <h2>🎬 AI 게임 소개 쇼츠 스튜디오 (3종 포맷)</h2>
          <p>PlayForge에서 PlayCoin으로 무영상 모션그래픽·생성형 영상·유튜브 가로 4컷 카드를 생성해 허브 내 게임에 등록할 수 있습니다.</p>
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
                  <p class="muted">PlayForge에서 모션그래픽(10 PC)·생성형 MP4(20 PC)·가로 4컷(5 PC) 쇼츠를 생성해 내 게임에 등록하세요.</p>
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
                <p class="muted">모션그래픽(무영상) · 생성형 영상 · 유튜브 가로 4컷 카드 통합 관리</p>
              </div>
              <div class="save-actions">
                ${wallet ? `<span class="creator-shorts-wallet">🪙 ${Number(wallet.available || 0).toLocaleString()} PC</span>` : ''}
                <a class="button primary small" href="${shortsStudioUrl()}" target="_blank" rel="noopener">✨ 쇼츠 스튜디오 ↗</a>
              </div>
            </div>
            ${list.length ? `<div class="creator-shorts-grid">
              ${list.map(s => `
                <article class="creator-short-item">
                  ${s.posterUrl ? `<img src="${esc(s.posterUrl)}" alt="" loading="lazy">` : ''}
                  <div class="creator-short-item-body">
                    <strong>${esc(formatLabel(resolveRenderMode(s)))} ${esc(s.title)}</strong>
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
            </div>` : '<p class="muted">아직 생성된 쇼츠가 없습니다.</p>'}
          </section>`;

        container.querySelectorAll('[data-cs-primary]').forEach(btn => {
          btn.onclick = async () => {
            try {
              await api(`/api/shorts/${encodeURIComponent(btn.dataset.csPrimary)}`, { method: 'PATCH', body: { isPrimary: true } });
              toast?.('대표 소개 쇼츠로 설정했습니다.');
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
            if (!confirm('이 쇼츠를 삭제할까요?')) return;
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
    mountShortPlayer,
    mountHomeShelf,
    mountFeed,
    mountGameDetailShorts,
    mountCreatorDashboard
  };
})();
