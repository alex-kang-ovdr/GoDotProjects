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

  const query = new URLSearchParams(location.search);
  const embedded = query.get('embedded') === '1';
  const initialProjectId = query.get('project') || '';
  const initialProjectName = query.get('projectName') || '';
  const initialGameId = query.get('game') || '';
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const forgePath = route => typeof route === 'string' && route.startsWith('/') && forgeBase && !route.startsWith(forgeBase + '/') ? forgeBase + route : route;

  const state = {
    hubConnected: false,
    session: null,
    csrfToken: null,
    config: null,
    wallet: null,
    games: [],
    mine: [],
    keyframes: [],
    selectedStyle: 'google-playground',
    selectedEngine: 'forge-motion-ffmpeg',
    storyboard: null,
    selectedShort: null,
    importFile: null,
    pollTimer: null,
    busy: false
  };

  let toastTimer = null;
  function toast(msg) {
    const el = $('ss-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 4200);
  }

  async function hubApi(path, { method = 'GET', body, headers = {}, timeout = 30000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const h = { ...headers };
    if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) {
      h['Content-Type'] = 'application/json';
    }
    if (!['GET', 'HEAD'].includes(method) && state.csrfToken) {
      h['X-CSRF-Token'] = state.csrfToken;
    }
    try {
      const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers: h,
        body: body === undefined
          ? undefined
          : (body instanceof Blob || body instanceof ArrayBuffer ? body : JSON.stringify(body)),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data?.error?.message || data?.error || `요청 실패 (${res.status})`);
        err.status = res.status;
        err.code = data?.error?.code || data?.error || 'HTTP_ERROR';
        err.details = data;
        throw err;
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async function forgeApi(path, { method = 'GET', body } = {}) {
    const h = {};
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(forgePath(path), {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Forge 요청 실패 (${res.status})`);
    return data;
  }

  async function rasterizeImageUrlToDataUrl(url, width = 1280, height = 720) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('게임 커버 이미지를 불러오지 못했습니다.');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('이미지 디코딩에 실패했습니다.'));
        image.src = objectUrl;
      });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#0D1321';
      ctx.fillRect(0, 0, width, height);
      const scale = Math.max(width / (img.naturalWidth || width), height / (img.naturalHeight || height));
      const dw = (img.naturalWidth || width) * scale;
      const dh = (img.naturalHeight || height) * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function addKeyframe(dataUrl, label) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return;
    if (state.keyframes.length >= 3) {
      state.keyframes.shift();
    }
    state.keyframes.push({ dataUrl, label: label || `키프레임 ${state.keyframes.length + 1}` });
    renderKeyframes();
  }

  function renderKeyframes() {
    const el = $('ss-keyframes');
    if (!state.keyframes.length) {
      el.innerHTML = '<div class="ss-kf-empty">키프레임이 없으면 선택한 게임 커버 또는 스타일 모션 배경으로 자동 제작됩니다.</div>';
      return;
    }
    el.innerHTML = state.keyframes.map((kf, idx) => `
      <div class="ss-kf-card">
        <img src="${esc(kf.dataUrl)}" alt="${esc(kf.label)}">
        <span class="ss-kf-tag">${esc(kf.label)}</span>
        <button type="button" class="ss-kf-remove" data-remove-kf="${idx}" aria-label="키프레임 제거">×</button>
      </div>
    `).join('');
  }

  function selectedGame() {
    const id = $('ss-game-select').value;
    return state.games.find(g => g.gameId === id) || null;
  }

  function updateWalletUi() {
    const w = state.wallet;
    const chip = $('ss-wallet-chip');
    if (!state.hubConnected || !w) {
      chip.hidden = true;
      $('ss-charge-link').hidden = true;
      $('ss-dev-grant-btn').hidden = true;
      return;
    }
    chip.hidden = false;
    $('ss-wallet-available').textContent = Number(w.available || 0).toLocaleString();
    $('ss-wallet-sub').textContent = w.reserved > 0 ? `(예약 ${w.reserved})` : '';
    $('ss-charge-link').hidden = false;
    $('ss-dev-grant-btn').hidden = !state.config?.allowDevGrant;
  }

  function renderStylesAndCameras() {
    const styles = state.config?.styles || [];
    $('ss-style-chips').innerHTML = styles.map(s => `
      <button type="button" class="ss-style-chip${s.id === state.selectedStyle ? ' active' : ''}"
        data-style="${esc(s.id)}" aria-pressed="${s.id === state.selectedStyle}">
        <span class="ss-style-dot" style="background:${esc(s.accent)}"></span>
        ${esc(s.label)}
      </button>
    `).join('');

    const cameras = state.config?.cameras || [];
    $('ss-camera-select').innerHTML = cameras.map(c => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('');
  }

  function currentEngineObj() {
    const list = state.config?.engines || [];
    return list.find(e => e.id === state.selectedEngine) || list[0] || null;
  }

  function effectiveCostCoins() {
    const eng = currentEngineObj();
    if (!eng) return 0;
    if (eng.provider === 'google-veo' && !eng.available && $('ss-fallback-check').checked && eng.fallbackEngineId) {
      const fb = (state.config?.engines || []).find(e => e.id === eng.fallbackEngineId);
      return fb ? fb.costCoins : eng.costCoins;
    }
    return eng.costCoins;
  }

  function renderEngines() {
    const engines = state.config?.engines || [];
    $('ss-engine-list').innerHTML = engines.map(eng => {
      const active = eng.id === state.selectedEngine;
      const isFree = eng.costCoins === 0;
      const warn = eng.provider === 'google-veo' && !eng.available;
      return `
        <button type="button" class="ss-engine-card${active ? ' active' : ''}" data-engine="${esc(eng.id)}" aria-pressed="${active}">
          <div>
            <div class="ss-engine-title">
              <span>${esc(eng.name)}</span>
              <span class="ss-engine-badge">${esc(eng.badge)}</span>
            </div>
            <p class="ss-engine-desc">${esc(eng.description)}</p>
            <p class="ss-engine-status${warn ? ' warn' : ''}">${esc(eng.statusLabel)} · ${esc(eng.resolution)} · ${esc(eng.aspectRatio)}</p>
          </div>
          <span class="ss-engine-price${isFree ? ' free' : ''}">${isFree ? '무료 (0 PC)' : `${eng.costCoins} PC`}</span>
        </button>
      `;
    }).join('');
    updateGenerateButton();
  }

  function updateGenerateButton() {
    const eng = currentEngineObj();
    const isImport = eng?.provider === 'direct-import';
    const isVeo = eng?.provider === 'google-veo';
    $('ss-import-box').hidden = !isImport;
    $('ss-fallback-wrap').hidden = !isVeo;

    const cost = effectiveCostCoins();
    $('ss-cost-display').textContent = isImport
      ? '0 PlayCoin (무료 등록)'
      : (state.hubConnected ? `${cost} PlayCoin` : '로컬 프리뷰 (0 PC)');

    const btn = $('ss-generate-btn');
    if (isImport) {
      btn.textContent = '📤 Flow 쇼츠 영상 업로드';
    } else if (state.hubConnected) {
      btn.textContent = `🎬 ${cost} PlayCoin으로 쇼츠 생성`;
    } else {
      btn.textContent = '🎬 로컬 쇼츠 프리뷰 생성';
    }
  }

  function renderGameSelectors() {
    const opts = state.games.length
      ? state.games.map(g => `<option value="${esc(g.gameId)}">${esc(g.title)} · ${esc(g.ownershipLabel)}</option>`).join('')
      : `<option value="">${initialProjectName ? `${esc(initialProjectName)} (초안 프로젝트)` : '선택 가능한 허브 게임 없음 (초안 생성 가능)'}</option>`;

    const prevSelected = $('ss-game-select').value || initialGameId;
    $('ss-game-select').innerHTML = opts;
    $('ss-pub-game').innerHTML = opts;

    if (prevSelected && state.games.some(g => g.gameId === prevSelected)) {
      $('ss-game-select').value = prevSelected;
      $('ss-pub-game').value = prevSelected;
    } else if (initialProjectId) {
      const byProj = state.games.find(g => g.projectId === initialProjectId);
      if (byProj) {
        $('ss-game-select').value = byProj.gameId;
        $('ss-pub-game').value = byProj.gameId;
      }
    }
    updateGameHint();
  }

  function updateGameHint() {
    const g = selectedGame();
    const hint = $('ss-game-ownership-hint');
    if (!g) {
      hint.textContent = state.hubConnected
        ? '아직 배포된 게임이 없어도 초안 쇼츠를 먼저 생성하고, 게임 배포 후 바로 연결할 수 있습니다.'
        : '독립 Forge 모드에서는 로컬 쇼츠 프리뷰를 생성하고 MP4로 다운로드할 수 있습니다.';
      return;
    }
    hint.textContent = `${g.ownershipLabel} · ${g.description ? g.description.slice(0, 70) : g.gameId}`;
    if ($('ss-pub-game').value !== g.gameId) $('ss-pub-game').value = g.gameId;
  }

  function renderStoryboard(sb) {
    state.storyboard = sb;
    if (!sb) return;
    $('ss-hook-input').value = sb.hookText || '';
    $('ss-cta-input').value = sb.ctaText || '';
    $('ss-flow-prompt').value = sb.flowPrompt || '';
    if (!$('ss-pub-title').value) $('ss-pub-title').value = sb.suggestedTitle || '';
    if (!$('ss-pub-caption').value) $('ss-pub-caption').value = sb.suggestedCaption || '';
    if (!$('ss-pub-hashtags').value && Array.isArray(sb.hashtags)) {
      $('ss-pub-hashtags').value = sb.hashtags.join(' ');
    }
    $('ss-scenes-preview').innerHTML = (sb.scenes || []).map(sc => `
      <div class="ss-scene-item">
        <strong>Scene ${sc.index} (${sc.startSec}s–${sc.endSec}s · ${esc(sc.label)})</strong>
        <div>${esc(sc.headline)}</div>
      </div>
    `).join('');
  }

  async function composeStoryboard(silent = false) {
    const g = selectedGame();
    const payload = {
      gameId: g?.gameId || undefined,
      title: g?.title || initialProjectName || 'PlayForge 게임',
      description: g?.description || '',
      tags: g?.tags || ['arcade'],
      controls: g?.controls || ['keyboard', 'mouse'],
      prompt: $('ss-prompt-input').value.trim(),
      stylePreset: state.selectedStyle,
      cameraMotion: $('ss-camera-select').value,
      hookText: $('ss-hook-input').value.trim(),
      ctaText: $('ss-cta-input').value.trim(),
      durationSec: Number($('ss-duration-select').value) || 8,
      keyframeCount: state.keyframes.length
    };
    try {
      const data = state.hubConnected
        ? await hubApi('/api/shorts/storyboard', { method: 'POST', body: payload })
        : await forgeApi('/api/shorts/storyboard', { method: 'POST', body: payload });
      renderStoryboard(data.storyboard);
      if (!silent) toast('3컷 스토리보드와 Google Flow 프롬프트를 자동 구성했습니다.');
    } catch (err) {
      if (!silent) toast(err.message || '스토리보드 생성에 실패했습니다.');
    }
  }

  function statusKorean(status) {
    return ({
      queued: '대기 중',
      rendering: '영상 렌더링 중',
      ready: '생성 완료 · 등록 대기',
      published: '허브 공개 중',
      unpublished: '비공개',
      failed: '생성 실패'
    })[status] || status;
  }

  function showShortInStage(shortObj) {
    state.selectedShort = shortObj;
    const emptyEl = $('ss-phone-empty');
    const progEl = $('ss-phone-progress');
    const videoEl = $('ss-preview-video');
    const badge = $('ss-current-status');
    const metaEl = $('ss-current-meta');
    const pubBtn = $('ss-publish-btn');
    const dlBtn = $('ss-download-video-btn');
    const pubLinks = $('ss-published-links');

    if (!shortObj) {
      emptyEl.hidden = false;
      progEl.hidden = true;
      videoEl.hidden = true;
      videoEl.removeAttribute('src');
      badge.hidden = true;
      metaEl.hidden = true;
      pubBtn.disabled = true;
      dlBtn.hidden = true;
      pubLinks.hidden = true;
      return;
    }

    badge.hidden = false;
    badge.textContent = statusKorean(shortObj.status);
    badge.className = 'ss-status-badge' + (shortObj.status === 'published' ? ' published' : shortObj.status === 'failed' ? ' failed' : '');
    $('ss-stage-subtitle').textContent = shortObj.stageLabel || shortObj.title;

    if (shortObj.status === 'queued' || shortObj.status === 'rendering') {
      emptyEl.hidden = true;
      progEl.hidden = false;
      videoEl.hidden = true;
      $('ss-progress-pct').textContent = `${shortObj.progress || 0}%`;
      $('ss-progress-stage').textContent = shortObj.stageLabel || '쇼츠 영상을 렌더링하고 있습니다…';
      $('ss-progress-bar').style.width = `${Math.max(8, shortObj.progress || 8)}%`;
      pubBtn.disabled = true;
      dlBtn.hidden = true;
      pubLinks.hidden = true;
    } else if (shortObj.videoUrl) {
      emptyEl.hidden = true;
      progEl.hidden = true;
      videoEl.hidden = false;
      const src = state.hubConnected ? shortObj.videoUrl : forgePath(shortObj.videoUrl);
      if (videoEl.getAttribute('src') !== src) {
        videoEl.src = src;
        if (shortObj.posterUrl) {
          videoEl.poster = state.hubConnected ? shortObj.posterUrl : forgePath(shortObj.posterUrl);
        }
        videoEl.load();
      }
      dlBtn.href = src;
      dlBtn.download = `${shortObj.id || 'playhub-short'}.mp4`;
      dlBtn.hidden = false;
      pubBtn.disabled = !state.hubConnected;
    } else {
      emptyEl.hidden = false;
      progEl.hidden = true;
      videoEl.hidden = true;
      pubBtn.disabled = true;
      dlBtn.hidden = true;
    }

    if (shortObj.gameId && state.games.some(g => g.gameId === shortObj.gameId)) {
      $('ss-pub-game').value = shortObj.gameId;
    }
    $('ss-pub-title').value = shortObj.title || '';
    $('ss-pub-caption').value = shortObj.caption || '';
    $('ss-pub-hashtags').value = Array.isArray(shortObj.hashtags) ? shortObj.hashtags.join(' ') : '';
    if (shortObj.visibility === 'unlisted' || shortObj.visibility === 'public') {
      $('ss-pub-visibility').value = shortObj.visibility;
    }
    $('ss-pub-primary').checked = shortObj.status === 'published' ? Boolean(shortObj.isPrimary) : true;

    const pills = [
      shortObj.resolvedEngineName || shortObj.engineId,
      `${shortObj.width || 720}×${shortObj.height || 1280}`,
      shortObj.durationSec ? `${shortObj.durationSec}초` : null,
      shortObj.bytes ? `${(shortObj.bytes / (1024 * 1024)).toFixed(2)} MB` : null,
      state.hubConnected ? `정산 ${shortObj.chargedCoins ?? 0} PC` : '로컬 프리뷰',
      shortObj.fallbackUsed ? '자동 폴백 적용' : null
    ].filter(Boolean);
    metaEl.hidden = !pills.length;
    metaEl.innerHTML = pills.map(p => `<span class="ss-meta-pill">${esc(p)}</span>`).join('');

    if (shortObj.status === 'published' && shortObj.gameId) {
      pubLinks.hidden = false;
      $('ss-view-feed-link').href = `/?view=shorts&short=${encodeURIComponent(shortObj.id)}`;
      $('ss-view-game-link').href = `/play/${encodeURIComponent(shortObj.gameId)}/`;
    } else {
      pubLinks.hidden = true;
    }

    renderMineList();
  }

  function renderMineList() {
    const el = $('ss-mine-list');
    if (!state.mine.length) {
      el.innerHTML = '<div class="ss-empty-list">아직 생성된 쇼츠가 없습니다. 첫 게임 소개 쇼츠를 만들어 보세요!</div>';
      return;
    }
    el.innerHTML = state.mine.map(item => {
      const active = state.selectedShort?.id === item.id;
      const poster = item.posterUrl ? (state.hubConnected ? item.posterUrl : forgePath(item.posterUrl)) : '';
      return `
        <div class="ss-mine-card${active ? ' active' : ''}" data-select-short="${esc(item.id)}">
          ${poster ? `<img class="ss-mine-thumb" src="${esc(poster)}" alt="">` : '<div class="ss-mine-thumb"></div>'}
          <div class="ss-mine-info">
            <strong>${esc(item.title)}</strong>
            <small>${esc(item.game?.title || item.gameId || '미연결 초안')} · ${esc(statusKorean(item.status))}${item.isPrimary ? ' · ⭐대표' : ''}</small>
            <small>${esc(item.resolvedEngineName || item.engineId)} · ${item.chargedCoins ?? 0} PC</small>
            <div class="ss-mine-actions">
              ${state.hubConnected && item.status === 'published' ? `<button type="button" class="ss-btn ghost small" data-unpublish-short="${esc(item.id)}">비공개</button>` : ''}
              ${state.hubConnected ? `<button type="button" class="ss-btn danger small" data-delete-short="${esc(item.id)}">삭제</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function stopPolling() {
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function startPolling(shortId) {
    stopPolling();
    state.pollTimer = setInterval(async () => {
      try {
        const data = state.hubConnected
          ? await hubApi(`/api/shorts/${encodeURIComponent(shortId)}`)
          : await forgeApi(`/api/shorts/jobs/${encodeURIComponent(shortId)}`);
        const latest = data.short || data.job;
        if (!latest) return;
        const idx = state.mine.findIndex(x => x.id === latest.id);
        if (idx >= 0) state.mine[idx] = latest;
        else state.mine.unshift(latest);
        showShortInStage(latest);
        if (!['queued', 'rendering'].includes(latest.status)) {
          stopPolling();
          if (state.hubConnected) await refreshCreatorData(false);
          if (latest.status === 'ready') {
            toast('쇼츠 영상 생성이 완료되었습니다! 지금 허브 내 게임에 등록해 보세요.');
          } else if (latest.status === 'failed') {
            toast(latest.errorMessage || '생성에 실패했습니다. 예약된 PlayCoin이 자동 반환되었습니다.');
          }
        }
      } catch {
        stopPolling();
      }
    }, 700);
  }

  async function handleGenerateOrImport() {
    if (state.busy) return;
    const eng = currentEngineObj();
    if (!eng) return;

    const g = selectedGame();

    // Direct Google Flow MP4/WebM Import
    if (eng.provider === 'direct-import') {
      if (!state.hubConnected) {
        toast('Google Flow 영상 허브 등록은 PlayHub 연동 모드(/forge/...)에서 이용할 수 있습니다.');
        return;
      }
      if (!state.importFile) {
        toast('먼저 Google Flow에서 만든 MP4 또는 WebM 파일을 선택해 주세요.');
        return;
      }
      state.busy = true;
      $('ss-generate-btn').disabled = true;
      try {
        const params = new URLSearchParams();
        if (g?.gameId) params.set('gameId', g.gameId);
        if (initialProjectId) params.set('projectId', initialProjectId);
        if ($('ss-pub-title').value.trim()) params.set('title', $('ss-pub-title').value.trim());
        if ($('ss-pub-caption').value.trim()) params.set('caption', $('ss-pub-caption').value.trim());
        if ($('ss-pub-hashtags').value.trim()) params.set('hashtags', $('ss-pub-hashtags').value.trim());
        if ($('ss-flow-prompt').value.trim()) params.set('prompt', $('ss-flow-prompt').value.trim());
        const contentType = state.importFile.type === 'video/webm' ? 'video/webm' : 'video/mp4';
        const data = await hubApi('/api/shorts/import?' + params.toString(), {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: state.importFile,
          timeout: 60000
        });
        if (data.wallet) { state.wallet = data.wallet; updateWalletUi(); }
        state.mine.unshift(data.short);
        showShortInStage(data.short);
        toast('Google Flow 영상을 가져왔습니다! 이제 허브 내 게임에 등록하세요.');
      } catch (err) {
        toast(err.message || '영상 업로드에 실패했습니다.');
      } finally {
        state.busy = false;
        $('ss-generate-btn').disabled = false;
      }
      return;
    }

    // Auto-rasterize SVG/PNG cover into a crisp PNG keyframe if user didn't add one yet!
    if (!state.keyframes.length && g?.coverUrl) {
      try {
        const coverDataUrl = await rasterizeImageUrlToDataUrl(g.coverUrl);
        addKeyframe(coverDataUrl, '게임 커버');
      } catch {}
    }

    const payload = {
      gameId: g?.gameId || undefined,
      projectId: initialProjectId || g?.projectId || undefined,
      title: $('ss-pub-title').value.trim() || state.storyboard?.suggestedTitle || g?.title || initialProjectName || '게임 소개 쇼츠',
      caption: $('ss-pub-caption').value.trim() || state.storyboard?.suggestedCaption || '',
      hashtags: $('ss-pub-hashtags').value.trim() || undefined,
      prompt: $('ss-prompt-input').value.trim(),
      flowPrompt: $('ss-flow-prompt').value.trim(),
      hookText: $('ss-hook-input').value.trim(),
      ctaText: $('ss-cta-input').value.trim(),
      stylePreset: state.selectedStyle,
      cameraMotion: $('ss-camera-select').value,
      durationSec: Number($('ss-duration-select').value) || 8,
      engineId: eng.id,
      allowFallback: $('ss-fallback-check').checked,
      keyframes: state.keyframes.map(k => ({ dataUrl: k.dataUrl, label: k.label }))
    };

    state.busy = true;
    $('ss-generate-btn').disabled = true;
    try {
      if (state.hubConnected) {
        const data = await hubApi('/api/shorts/generate', {
          method: 'POST',
          headers: { 'Idempotency-Key': 'ss-' + uuid() },
          body: payload
        });
        if (data.wallet) { state.wallet = data.wallet; updateWalletUi(); }
        state.mine.unshift(data.short);
        showShortInStage(data.short);
        toast(`${data.short.quotedCoins} PlayCoin 예약 완료 · 쇼츠 영상을 생성하고 있습니다!`);
        startPolling(data.short.id);
      } else {
        const data = await forgeApi('/api/shorts/jobs', { method: 'POST', body: payload });
        state.mine.unshift(data.job);
        showShortInStage(data.job);
        toast('로컬 쇼츠 프리뷰 생성을 시작했습니다.');
        startPolling(data.job.id);
      }
    } catch (err) {
      if (err.code === 'INSUFFICIENT_PLAYCOIN') {
        toast(`PlayCoin 잔액이 부족합니다. (필요: ${err.details?.error?.requiredCoins || effectiveCostCoins()} PC) 상단에서 충전하거나 체험용 코인을 받아주세요.`);
      } else {
        toast(err.message || '쇼츠 생성 요청에 실패했습니다.');
      }
    } finally {
      state.busy = false;
      $('ss-generate-btn').disabled = false;
    }
  }

  async function handlePublish() {
    const s = state.selectedShort;
    if (!s || !state.hubConnected) return;
    const gameId = $('ss-pub-game').value;
    if (!gameId) {
      toast('소개 영상을 등록할 허브 내 게임을 선택해 주세요.');
      return;
    }
    $('ss-publish-btn').disabled = true;
    try {
      const data = await hubApi(`/api/shorts/${encodeURIComponent(s.id)}/publish`, {
        method: 'POST',
        body: {
          gameId,
          title: $('ss-pub-title').value.trim() || s.title,
          caption: $('ss-pub-caption').value.trim(),
          hashtags: $('ss-pub-hashtags').value.trim(),
          visibility: $('ss-pub-visibility').value,
          isPrimary: $('ss-pub-primary').checked
        }
      });
      const idx = state.mine.findIndex(x => x.id === data.short.id);
      if (idx >= 0) state.mine[idx] = data.short;
      showShortInStage(data.short);
      toast('허브 내 게임에 소개 쇼츠 영상이 등록되었습니다!');
      if (embedded && window.parent && window.parent !== window) {
        window.parent.postMessage({ source: 'playforge-shorts-studio', type: 'short-published', title: data.short.title, gameId }, location.origin);
      }
    } catch (err) {
      toast(err.message || '허브 등록에 실패했습니다.');
    } finally {
      $('ss-publish-btn').disabled = false;
    }
  }

  async function refreshCreatorData(selectFirst = true) {
    const [gamesData, mineData] = await Promise.all([
      hubApi('/api/shorts/creator/games'),
      hubApi('/api/shorts/creator/mine')
    ]);
    state.games = gamesData.games || [];
    state.wallet = gamesData.wallet || mineData.wallet || null;
    state.mine = mineData.shorts || [];
    updateWalletUi();
    renderGameSelectors();
    renderMineList();
    if (selectFirst && !state.selectedShort && state.mine.length) {
      showShortInStage(state.mine[0]);
    }
  }

  async function init() {
    if (embedded) {
      $('ss-close-drawer').hidden = false;
      $('ss-capture-editor-btn').hidden = false;
      $('ss-home-link').href = '#';
      $('ss-home-link').addEventListener('click', e => e.preventDefault());
    }

    // Probe same-origin PlayHub first (works automatically via /forge/ proxy!)
    let hubAvailable = false;
    try {
      const [cfg, sess] = await Promise.all([
        hubApi('/api/shorts/config', { timeout: 4000 }),
        hubApi('/api/session', { timeout: 4000 })
      ]);
      if (cfg && Array.isArray(cfg.engines)) {
        hubAvailable = true;
        state.config = cfg;
        state.session = sess;
        state.csrfToken = sess?.csrfToken || null;
      }
    } catch {}

    if (hubAvailable) {
      state.hubConnected = true;
      $('ss-mode-pill').textContent = 'PlayHub 연동 · PlayCoin 정산';
      if (state.config?.googleFlowWebUrl) $('ss-open-flow-link').href = state.config.googleFlowWebUrl;
      renderStylesAndCameras();
      renderEngines();

      if (state.session?.kind === 'registered') {
        $('ss-auth-banner').hidden = true;
        await refreshCreatorData(true);
        await composeStoryboard(true);
      } else {
        $('ss-auth-banner').hidden = false;
        // Check if billing demo sign-in is enabled in local sandbox
        try {
          const bCat = await hubApi('/api/billing/catalog', { timeout: 3000 });
          if (bCat?.allowDemoAccount) $('ss-demo-signin-btn').hidden = false;
        } catch {}
      }
    } else {
      // Standalone PlayForge fallback mode
      state.hubConnected = false;
      $('ss-mode-pill').textContent = 'PlayForge 단독 프리뷰 모드';
      $('ss-hub-shorts-link').hidden = true;
      state.config = await forgeApi('/api/shorts/config');
      renderStylesAndCameras();
      renderEngines();
      renderGameSelectors();
      try {
        const jData = await forgeApi('/api/shorts/jobs');
        state.mine = jData.jobs || [];
        renderMineList();
      } catch {}
      await composeStoryboard(true);
    }
  }

  // Event Listeners
  $('ss-close-drawer').addEventListener('click', () => {
    window.parent.postMessage({ source: 'playforge-shorts-studio', type: 'close' }, location.origin);
  });

  $('ss-capture-editor-btn').addEventListener('click', () => {
    window.parent.postMessage({ source: 'playforge-shorts-studio', type: 'capture-frame' }, location.origin);
  });

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.data?.source !== 'playforge-godot-editor') return;
    if (event.data.type === 'captured-frame') {
      if (event.data.ok && event.data.dataUrl) {
        addKeyframe(event.data.dataUrl, event.data.sourceLabel || '에디터 캡처');
        toast(`'${event.data.sourceLabel || 'Godot 화면'}'을 키프레임에 추가했습니다.`);
      } else {
        toast(event.data.error || '화면 캡처에 실패했습니다.');
      }
    }
  });

  $('ss-pull-cover-btn').addEventListener('click', async () => {
    const g = selectedGame();
    if (!g?.coverUrl) {
      toast('먼저 커버 이미지가 있는 게임을 선택해 주세요.');
      return;
    }
    try {
      const dataUrl = await rasterizeImageUrlToDataUrl(g.coverUrl);
      addKeyframe(dataUrl, `${g.title.slice(0, 12)} 커버`);
      toast('게임 커버 이미지를 키프레임으로 가져왔습니다.');
    } catch (err) {
      toast(err.message || '커버 이미지를 가져오지 못했습니다.');
    }
  });

  $('ss-keyframe-input').addEventListener('change', async e => {
    const files = [...(e.target.files || [])].slice(0, 3);
    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (dataUrl) addKeyframe(dataUrl, file.name.slice(0, 14));
    }
    e.target.value = '';
  });

  $('ss-keyframes').addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-kf]');
    if (!btn) return;
    state.keyframes.splice(Number(btn.dataset.removeKf), 1);
    renderKeyframes();
  });

  $('ss-style-chips').addEventListener('click', e => {
    const btn = e.target.closest('[data-style]');
    if (!btn) return;
    state.selectedStyle = btn.dataset.style;
    renderStylesAndCameras();
    void composeStoryboard(true);
  });

  $('ss-engine-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-engine]');
    if (!btn) return;
    state.selectedEngine = btn.dataset.engine;
    renderEngines();
  });

  $('ss-fallback-check').addEventListener('change', updateGenerateButton);

  $('ss-game-select').addEventListener('change', () => {
    updateGameHint();
    $('ss-pub-title').value = '';
    $('ss-pub-caption').value = '';
    $('ss-pub-hashtags').value = '';
    void composeStoryboard(true);
  });

  $('ss-compose-btn').addEventListener('click', () => void composeStoryboard(false));

  $('ss-copy-flow-btn').addEventListener('click', async () => {
    const text = $('ss-flow-prompt').value.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Google Flow / Veo 프롬프트를 클립보드에 복사했습니다.');
    } catch {
      toast('클립보드 복사가 차단되었습니다. 텍스트 박스에서 직접 복사해 주세요.');
    }
  });

  $('ss-download-flow-pack-btn').addEventListener('click', () => {
    const md = state.storyboard?.flowExportMarkdown || $('ss-flow-prompt').value;
    if (!md) return;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `google-flow-shorts-pack-${selectedGame()?.gameId || 'project'}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Google Flow 제작 팩(.md)을 다운로드했습니다.');
  });

  $('ss-video-file-input').addEventListener('change', e => {
    const file = e.target.files?.[0] || null;
    state.importFile = file;
    $('ss-video-file-name').textContent = file
      ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
      : '선택된 파일 없음';
  });

  $('ss-generate-btn').addEventListener('click', () => void handleGenerateOrImport());
  $('ss-publish-btn').addEventListener('click', () => void handlePublish());

  $('ss-dev-grant-btn').addEventListener('click', async () => {
    try {
      const data = await hubApi('/api/shorts/dev-grant', { method: 'POST', body: { coins: 300 } });
      state.wallet = data.wallet;
      updateWalletUi();
      toast('테스트용 300 PlayCoin이 지갑에 지급되었습니다!');
    } catch (err) {
      toast(err.message || '체험용 코인 지급에 실패했습니다.');
    }
  });

  $('ss-demo-signin-btn').addEventListener('click', async () => {
    try {
      const data = await hubApi('/api/billing/demo-signin', { method: 'POST', body: {} });
      state.csrfToken = data.csrfToken || state.csrfToken;
      state.session = { ...(state.session || {}), kind: 'registered', displayName: data.displayName, csrfToken: state.csrfToken };
      $('ss-auth-banner').hidden = true;
      await refreshCreatorData(true);
      await composeStoryboard(true);
      toast(`${data.displayName} 계정으로 로그인했습니다!`);
    } catch (err) {
      toast(err.message || '데모 로그인에 실패했습니다.');
    }
  });

  $('ss-retry-auth-btn').addEventListener('click', () => location.reload());
  $('ss-refresh-mine-btn').addEventListener('click', () => state.hubConnected ? void refreshCreatorData(false) : null);

  $('ss-mine-list').addEventListener('click', async e => {
    const delBtn = e.target.closest('[data-delete-short]');
    if (delBtn) {
      e.stopPropagation();
      const id = delBtn.dataset.deleteShort;
      if (!confirm('이 쇼츠 영상을 삭제할까요?')) return;
      try {
        await hubApi(`/api/shorts/${encodeURIComponent(id)}`, { method: 'DELETE' });
        state.mine = state.mine.filter(x => x.id !== id);
        if (state.selectedShort?.id === id) showShortInStage(state.mine[0] || null);
        else renderMineList();
        toast('쇼츠를 삭제했습니다.');
      } catch (err) { toast(err.message); }
      return;
    }
    const unpubBtn = e.target.closest('[data-unpublish-short]');
    if (unpubBtn) {
      e.stopPropagation();
      const id = unpubBtn.dataset.unpublishShort;
      try {
        const data = await hubApi(`/api/shorts/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: { status: 'unpublished' }
        });
        const idx = state.mine.findIndex(x => x.id === id);
        if (idx >= 0) state.mine[idx] = data.short;
        showShortInStage(data.short);
        toast('쇼츠를 비공개로 전환했습니다.');
      } catch (err) { toast(err.message); }
      return;
    }
    const card = e.target.closest('[data-select-short]');
    if (card) {
      const found = state.mine.find(x => x.id === card.dataset.selectShort);
      if (found) showShortInStage(found);
    }
  });

  init().catch(err => toast(err.message || 'Shorts Studio 초기화에 실패했습니다.'));
})();
