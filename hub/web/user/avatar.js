(function () {
  'use strict';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  const SLOT_LABELS = { head: '머리', back: '등', hand_r: '오른손', hand_l: '왼손' };
  const CATEGORY_LABELS = { all: '전체', skin: '스킨', attachment: '장착물', emote: '이모지' };
  const RARITY_LABELS = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };

  const CAMERA_PRESET_DEFAULTS = {
    TPS: { yaw: 0.42, pitch: 0.14, distance: 4.45 },
    FPS: { yaw: 0.08, pitch: 0.04, distance: 1.65 },
    TopDown: { yaw: 0.35, pitch: 0.88, distance: 5.6 },
    PortraitUpper: { yaw: 0.22, pitch: 0.06, distance: 2.05 },
    PortraitFull: { yaw: 0.26, pitch: 0.10, distance: 4.25 },
  };

  function resolvePreviewRuntime(options = {}) {
    const explicit = String(options.runtime || '').trim().toLowerCase();
    if (explicit === 'desktop' || explicit === 'godot' || explicit === 'godot-desktop' || explicit === 'godot-runtime') {
      return 'godot-desktop';
    }
    if (explicit === 'web' || explicit === 'web-js' || explicit === 'js') {
      return 'web-js';
    }
    try {
      const params = new URLSearchParams(window.location.search || '');
      const q = String(params.get('runtime') || params.get('avatarRuntime') || '').trim().toLowerCase();
      if (q === 'desktop' || q === 'godot' || q === 'godot-desktop' || q === 'godot-runtime') {
        return 'godot-desktop';
      }
      if (q === 'web' || q === 'web-js' || q === 'js') {
        return 'web-js';
      }
    } catch {}
    if (
      window.PlayHubDesktopHost ||
      window.__PLAYHUB_DESKTOP__ === true ||
      window.PLAYHUB_CONFIG?.runtime === 'desktop' ||
      (typeof navigator !== 'undefined' && /PlayHubDesktop/i.test(navigator.userAgent || ''))
    ) {
      return 'godot-desktop';
    }
    return 'web-js';
  }

  function createDesktopGodotPreview(imgEl, viewportEl, options = {}) {
    const apiBase = String(options.apiBase || '').replace(/\/$/, '');
    const listenerCtrl = new AbortController();
    const { signal } = listenerCtrl;
    let destroyed = false;
    let cameraPreset = 'TPS';
    let yaw = CAMERA_PRESET_DEFAULTS.TPS.yaw;
    let pitch = CAMERA_PRESET_DEFAULTS.TPS.pitch;
    let distance = CAMERA_PRESET_DEFAULTS.TPS.distance;
    let currentLoadout = null;
    let activeEmoteId = '';
    let animTimeSec = 0;
    let inFlight = false;
    let pendingRender = false;
    let renderSerial = 0;
    let renderCount = 0;
    let currentObjectUrl = null;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let dragDebounceTimer = null;
    let emoteTimers = [];
    let lastMeta = {
      renderer: 'godot-runtime',
      engineVersion: '4.7.2',
      renderProfileId: 'playhub_studio_v1',
      renderMs: 0,
      skinId: '',
      boneCount: 0,
      animationCount: 0,
      lastError: '',
    };

    function clearEmoteTimers() {
      for (const t of emoteTimers) clearTimeout(t);
      emoteTimers = [];
    }

    function applyPresetState(preset) {
      cameraPreset = CAMERA_PRESET_DEFAULTS[preset] ? preset : 'TPS';
      const def = CAMERA_PRESET_DEFAULTS[cameraPreset];
      yaw = def.yaw;
      pitch = def.pitch;
      distance = def.distance;
    }

    function computeSize() {
      const rect = viewportEl?.getBoundingClientRect?.();
      const w = Math.max(320, Math.min(720, Math.round(rect?.width || 440)));
      const h = Math.max(340, Math.min(780, Math.round(rect?.height || 484)));
      return { width: w, height: h };
    }

    function swapImageBlob(blob) {
      const nextUrl = URL.createObjectURL(blob);
      const prevUrl = currentObjectUrl;
      currentObjectUrl = nextUrl;
      imgEl.onload = () => {
        if (prevUrl && prevUrl !== currentObjectUrl) {
          try { URL.revokeObjectURL(prevUrl); } catch {}
        }
      };
      imgEl.src = nextUrl;
    }

    async function executeRender() {
      if (destroyed || !currentLoadout) return;
      if (inFlight) {
        pendingRender = true;
        return;
      }
      inFlight = true;
      pendingRender = false;
      const serial = ++renderSerial;
      options.onLoading?.(renderCount === 0);
      const { width, height } = computeSize();
      const payload = {
        loadout: currentLoadout,
        camera: cameraPreset,
        yaw: Number(yaw.toFixed(4)),
        pitch: Number(pitch.toFixed(4)),
        distance: Number(distance.toFixed(4)),
        emoteId: activeEmoteId,
        animTimeSec: Number(animTimeSec.toFixed(3)),
        width,
        height,
      };
      try {
        const hostBridge = window.PlayHubDesktopHost?.avatarPreview;
        if (hostBridge && typeof hostBridge.render === 'function') {
          const result = await hostBridge.render(payload);
          if (destroyed || serial !== renderSerial) return;
          if (result?.blob instanceof Blob) {
            swapImageBlob(result.blob);
          } else if (typeof result?.dataUrl === 'string') {
            imgEl.src = result.dataUrl;
          } else if (result?.bytes) {
            swapImageBlob(new Blob([result.bytes], { type: 'image/png' }));
          }
          renderCount += 1;
          lastMeta = {
            renderer: String(result?.renderer || 'godot-runtime'),
            engineVersion: String(result?.engineVersion || '4.7.2'),
            renderProfileId: String(result?.renderProfileId || 'playhub_studio_v1'),
            renderMs: Number(result?.renderMs || 0),
            skinId: String(result?.skinId || currentLoadout.skinId || ''),
            boneCount: Number(result?.boneCount || 0),
            animationCount: Number(result?.animationCount || 0),
            lastError: '',
          };
          options.onStatus?.(`Godot ${lastMeta.engineVersion} 런타임 · 드래그로 회전`);
        } else {
          const res = await fetch(`${apiBase}/api/avatar/desktop-preview/render`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            let errMsg = `Godot 런타임 프리뷰 실패 (${res.status})`;
            try {
              const errJson = await res.json();
              const msg = errJson?.error?.message || errJson?.message;
              if (msg) errMsg = msg;
            } catch {}
            throw new Error(errMsg);
          }
          const blob = await res.blob();
          if (destroyed) return;
          swapImageBlob(blob);
          renderCount += 1;
          lastMeta = {
            renderer: String(res.headers.get('X-PlayHub-Avatar-Renderer') || 'godot-runtime'),
            engineVersion: String(res.headers.get('X-PlayHub-Engine-Version') || '4.7.2'),
            renderProfileId: String(res.headers.get('X-PlayHub-Render-Profile') || 'playhub_studio_v1'),
            renderMs: Number(res.headers.get('X-PlayHub-Render-Ms') || 0),
            skinId: String(res.headers.get('X-PlayHub-Skin-Id') || currentLoadout.skinId || ''),
            boneCount: Number(res.headers.get('X-PlayHub-Bone-Count') || 0),
            animationCount: Number(res.headers.get('X-PlayHub-Animation-Count') || 0),
            lastError: '',
          };
          options.onStatus?.(`Godot ${lastMeta.engineVersion} 런타임 (${lastMeta.renderMs}ms) · 드래그로 회전`);
        }
      } catch (err) {
        if (!destroyed) {
          lastMeta.lastError = err?.message || 'Godot 런타임 프리뷰 오류';
          options.onStatus?.(lastMeta.lastError);
        }
      } finally {
        inFlight = false;
        if (!destroyed) options.onLoading?.(false);
        if (!destroyed && pendingRender) {
          pendingRender = false;
          void executeRender();
        }
      }
    }

    function scheduleDragRender() {
      if (dragDebounceTimer) clearTimeout(dragDebounceTimer);
      dragDebounceTimer = setTimeout(() => {
        dragDebounceTimer = null;
        void executeRender();
      }, 85);
    }

    if (viewportEl) {
      let activePointerId = null;
      if (viewportEl.style) viewportEl.style.touchAction = 'none';
      viewportEl.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
        if (e.target && typeof e.target.closest === 'function' && e.target.closest('button, a, select, input')) return;
        e.preventDefault();
        dragging = true;
        activePointerId = e.pointerId ?? null;
        lastX = e.clientX;
        lastY = e.clientY;
        try { viewportEl.setPointerCapture?.(e.pointerId); } catch {}
      }, { signal });
      viewportEl.addEventListener('touchmove', (e) => {
        if (dragging) e.preventDefault();
      }, { signal, passive: false });
      viewportEl.addEventListener('dragstart', (e) => e.preventDefault(), { signal });
      window.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        if (activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
        e.preventDefault();
        yaw -= (e.clientX - lastX) * 0.012;
        pitch = Math.max(-0.35, Math.min(1.15, pitch + (e.clientY - lastY) * 0.008));
        lastX = e.clientX;
        lastY = e.clientY;
        scheduleDragRender();
      }, { signal, passive: false });
      const stopDrag = (e) => {
        if (!dragging) return;
        if (e && activePointerId !== null && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
        const pid = activePointerId;
        dragging = false;
        activePointerId = null;
        if (pid !== null) {
          try { viewportEl.releasePointerCapture?.(pid); } catch {}
        }
        if (dragDebounceTimer) {
          clearTimeout(dragDebounceTimer);
          dragDebounceTimer = null;
        }
        void executeRender();
      };
      window.addEventListener('pointerup', stopDrag, { signal });
      window.addEventListener('pointercancel', stopDrag, { signal });
      window.addEventListener('blur', () => { dragging = false; activePointerId = null; }, { signal });
      viewportEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        distance = Math.max(1.3, Math.min(7.5, distance + Math.sign(e.deltaY) * 0.28));
        scheduleDragRender();
      }, { signal, passive: false });
    }

    return {
      supported: true,
      renderer: 'godot-runtime',
      setRenderProfile(profile) {
        if (profile?.profileId) lastMeta.renderProfileId = profile.profileId;
      },
      async setLoadout({ loadout }) {
        if (!loadout) return;
        currentLoadout = {
          skinId: loadout.skinId,
          attachments: { ...(loadout.attachments || {}) },
          emoteWheel: [...(loadout.emoteWheel || [])],
        };
        await executeRender();
      },
      setCameraPreset(preset) {
        applyPresetState(preset);
        void executeRender();
      },
      triggerEmotePreview(emoteId, durationSec = 2.2) {
        clearEmoteTimers();
        activeEmoteId = emoteId || '';
        animTimeSec = 0.0;
        void executeRender();
        const totalMs = Math.max(1200, Math.round((Number(durationSec) || 2.2) * 1000));
        const sampleTimes = [0.35, 0.75, 1.15, 1.55];
        sampleTimes.forEach((tSec, idx) => {
          const delayMs = Math.round(((idx + 1) / (sampleTimes.length + 1)) * totalMs);
          emoteTimers.push(setTimeout(() => {
            if (destroyed || activeEmoteId !== emoteId) return;
            animTimeSec = tSec;
            void executeRender();
          }, delayMs));
        });
        emoteTimers.push(setTimeout(() => {
          if (destroyed || activeEmoteId !== emoteId) return;
          activeEmoteId = '';
          animTimeSec = 0.0;
          void executeRender();
        }, totalMs));
      },
      getDiagnostics() {
        return {
          renderer: lastMeta.renderer,
          supported: true,
          engineVersion: lastMeta.engineVersion,
          renderProfileId: lastMeta.renderProfileId,
          renderMs: lastMeta.renderMs,
          renderCount,
          skinId: lastMeta.skinId,
          boneCount: lastMeta.boneCount,
          animationCount: lastMeta.animationCount,
          cameraPreset,
          naturalWidth: imgEl?.naturalWidth || 0,
          naturalHeight: imgEl?.naturalHeight || 0,
          lastError: lastMeta.lastError,
        };
      },
      destroy() {
        destroyed = true;
        listenerCtrl.abort();
        clearEmoteTimers();
        if (dragDebounceTimer) clearTimeout(dragDebounceTimer);
        if (currentObjectUrl) {
          try { URL.revokeObjectURL(currentObjectUrl); } catch {}
          currentObjectUrl = null;
        }
      },
    };
  }

  function randomKey(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function mount(root, api, sameSession, options = {}) {
    let disposed = false;
    const listenerController = new AbortController();
    const { signal } = listenerController;
    const alive = () => !disposed && root.isConnected && sameSession();
    const apiBase = String(options.apiBase || '').replace(/\/$/, '');
    const toastFn = typeof options.toast === 'function'
      ? options.toast
      : (typeof window.PlayHubToast === 'function' ? window.PlayHubToast : null);
    const assetUrl = (p) => (p ? `${apiBase}${p}` : null);
    let previewRuntime = resolvePreviewRuntime(options); // 'godot-desktop' | 'web-js'
    let jsWebglViewerCreated = false;
    let catalog = null;
    let me = null;
    let viewer = null;
    let modeTab = 'shop'; // 'shop' | 'locker'
    let categoryFilter = 'all';
    let slotFilter = 'all';
    let cameraPreset = 'TPS';
    let tryOn = null; // { item } temporary preview without owning
    let busy = false;
    let feedback = { text: '', error: false };
    let emoteFloatTimer = null;

    root.innerHTML = `<section class="page avatar-page" data-preview-runtime="${esc(previewRuntime)}">
      <div class="avatar-topbar">
        <div>
          <h1>내 아바타 상점 &amp; 락커</h1>
          <p>UEFN 방식 단일 아바타 · 웹은 JavaScript 3D 프리뷰, 데스크톱 앱은 Godot 4.7.2 런타임 프리뷰로 동일 아바타를 실시간 확인합니다.</p>
        </div>
        <div class="avatar-wallet-bar">
          <div class="playcoin-pill" id="avatar-wallet-pill">🪙 불러오는 중…</div>
          <button type="button" class="button primary small" id="avatar-topup-open">PlayCoin 충전 (+25%)</button>
        </div>
      </div>
      <div id="avatar-feedback" class="avatar-feedback" role="status" hidden></div>
      <div class="avatar-workspace">
        <aside class="avatar-stage-card">
          <div class="avatar-viewport" id="avatar-viewport" data-preview-runtime="${esc(previewRuntime)}">
            <canvas id="avatar-canvas" aria-label="웹 3D 아바타 미리보기" ${previewRuntime === 'godot-desktop' ? 'hidden' : ''}></canvas>
            <img id="avatar-godot-frame" class="avatar-godot-frame" alt="Godot 런타임 아바타 미리보기" draggable="false" ${previewRuntime === 'godot-desktop' ? '' : 'hidden'} />
            <div class="avatar-viewport-badges">
              <span class="avatar-seal-badge">🔒 포지 직접 수정 불가 · 봉인 런타임</span>
              <span id="avatar-runtime-badge" class="avatar-runtime-badge ${esc(previewRuntime)}" data-preview-runtime="${esc(previewRuntime)}">
                ${previewRuntime === 'godot-desktop' ? '🎮 데스크톱 · Godot' : '🌐 웹 3D · JS WebGL'}
              </span>
            </div>
            <div id="avatar-godot-loading" class="avatar-godot-loading" hidden>Godot 4.7.2 런타임 준비 중…</div>
            <div id="avatar-emote-float" class="avatar-emote-float" hidden></div>
            <div id="avatar-tryon-banner" class="avatar-tryon-banner" hidden>
              <span id="avatar-tryon-text">미리보기 중</span>
              <button type="button" class="button secondary small" id="avatar-tryon-clear">내 장착으로 복귀</button>
            </div>
          </div>
          <div class="avatar-stage-controls">
            <div class="avatar-chip-group" role="group" aria-label="기본 내장 로코모션 · 3D 초상 카메라 프리뷰">
              <button type="button" class="avatar-chip active" data-cam="TPS">TPS 시점</button>
              <button type="button" class="avatar-chip" data-cam="FPS">FPS 시점</button>
              <button type="button" class="avatar-chip" data-cam="TopDown">TopDown 시점</button>
              <button type="button" class="avatar-chip" data-cam="PortraitUpper">상반신 초상</button>
              <button type="button" class="avatar-chip" data-cam="PortraitFull">전신 초상</button>
            </div>
            <span class="muted" id="avatar-stage-hint" style="font-size:0.78rem;">드래그로 회전</span>
          </div>
          <div class="avatar-runtime-bar" id="avatar-runtime-bar">
            <div class="avatar-chip-group" id="avatar-runtime-switcher" role="group" aria-label="아바타 프리뷰 런타임" hidden>
              <button type="button" class="avatar-chip${previewRuntime === 'web-js' ? ' active' : ''}" data-preview-runtime-switch="web-js">🌐 웹 JS 3D</button>
              <button type="button" class="avatar-chip${previewRuntime === 'godot-desktop' ? ' active' : ''}" data-preview-runtime-switch="godot-desktop">🎮 데스크톱 Godot</button>
            </div>
            <button type="button" class="button secondary small" id="avatar-open-desktop-studio">
              ${previewRuntime === 'godot-desktop' ? '🖥️ Godot 스튜디오 창으로 열기' : '🖥️ 데스크톱(Godot)에서 열기'}
            </button>
          </div>
          <div class="avatar-loadout-summary" id="avatar-loadout-summary"></div>
          <div>
            <div style="font-size:0.78rem;font-weight:700;color:#50625b;margin-bottom:6px;">장착된 이모지 휠 (게임 내 숫자키 1~4)</div>
            <div class="avatar-emote-wheel-bar" id="avatar-emote-wheel"></div>
          </div>
        </aside>
        <div class="avatar-catalog-panel">
          <div class="avatar-tabs-row">
            <div class="avatar-chip-group" role="tablist">
              <button type="button" class="avatar-chip active" data-tab="shop" role="tab">🛒 아바타 상점</button>
              <button type="button" class="avatar-chip" data-tab="locker" role="tab">🎒 내 락커</button>
            </div>
            <div class="avatar-chip-group" id="avatar-cat-filters">
              ${Object.entries(CATEGORY_LABELS).map(([k, label]) =>
                `<button type="button" class="avatar-chip${k === 'all' ? ' active' : ''}" data-cat="${k}">${label}</button>`
              ).join('')}
            </div>
          </div>
          <div class="avatar-chip-group" id="avatar-slot-filters" hidden>
            <button type="button" class="avatar-chip active" data-slot="all">전체 슬롯</button>
            ${Object.entries(SLOT_LABELS).map(([k, label]) =>
              `<button type="button" class="avatar-chip" data-slot="${k}">${label}</button>`
            ).join('')}
          </div>
          <div class="avatar-item-grid" id="avatar-item-grid">
            <p class="muted">아바타 카탈로그를 불러오고 있습니다…</p>
          </div>
          <section class="avatar-runtime-spec">
            <strong>PlayForge 기본 내장 아바타 규격 (UEFN 호환 모델)</strong>
            <ul>
              <li><strong>웹 / 데스크톱 듀얼 프리뷰</strong>: 웹 브라우저는 무설치 JavaScript WebGL 스켈레탈 3D 프리뷰(<code>avatar-glb-viewer.js</code>), 데스크톱 앱은 실제 Godot 4.7.2 런타임 프리뷰(<code>PlayForgeAvatarRig</code> · <code>avatar-render-profile.v1</code>)를 사용합니다</li>
              <li><strong>기본 내장 로코모션</strong>: TPS(3인칭 숄더/오빗) · FPS(1인칭 헤드 숨김) · TopDown(탑다운 이동/조준) 3종 모드, 점프·달리기·웅크리기 자동 지원</li>
              <li><strong>게임 모드별 3D 렌더타겟 초상 UI</strong>: 2D·카드·퍼즐·RPG HUD 모드에서 상반신 초상(최소 <code>128×128 px</code>) 또는 전신 초상(최소 <code>160×240 px</code>) 3D <code>SubViewport</code> 초상 표현 지원(엔진 C++ 최소 사이즈·숨김 차단 적용)</li>
              <li><strong>기본 내장 래그돌 물리</strong>: <code>PhysicalBoneSimulator3D</code> 기반 12관절 휴머노이드 래그돌 충격 및 기상 복구 내장</li>
              <li><strong>포지 수정 불가 (3중 봉인)</strong>: <code>addons/playforge_avatar/**</code>는 저장·동기화 차단 및 빌드 시 서버 정규본 강제 주입. 포지 크리에이터는 스폰 위치·카메라 모드·이동 배율·래그돌/이모지 허용 여부만 설정 가능</li>
            </ul>
          </section>
        </div>
      </div>
      <dialog id="avatar-topup-dialog" aria-labelledby="avatar-topup-title">
        <div class="dialog-heading">
          <h2 id="avatar-topup-title">PlayCoin 충전 (웹 최대 +25% 보너스)</h2>
          <button type="button" class="icon-button" id="avatar-topup-close" aria-label="닫기">×</button>
        </div>
        <p id="avatar-topup-note" class="muted">Track A PlayCoin 3-Bucket(유상 · 보너스 · 프로모) 원장에 적립됩니다.</p>
        <div class="avatar-topup-grid" id="avatar-topup-packs"></div>
        <div class="dialog-actions" style="justify-content:space-between;margin-top:12px;">
          <a class="button secondary small" href="/?view=billing" data-route>PlayCoin 상점 (+25% 간편결제) →</a>
          <button type="button" class="button secondary small" id="avatar-topup-close-foot">닫기</button>
        </div>
      </dialog>
    </section>`;

    const $el = (sel) => root.querySelector(sel);

    function setFeedback(text, error = false, errorObj = null) {
      feedback = { text, error };
      if (error && text) {
        if (window.PlayHubErrorUI?.report) {
          window.PlayHubErrorUI.report(errorObj || new Error(text), { fallback: text });
        } else if (toastFn) {
          toastFn(text, { type: 'error' });
        }
      }
      const box = $el('#avatar-feedback');
      if (!box) return;
      if (error && (window.PlayHubErrorUI?.report || toastFn)) {
        box.hidden = true;
        return;
      }
      box.hidden = !text;
      box.textContent = text;
      box.classList.toggle('error', Boolean(error));
    }

    function ownedSet() {
      return new Set((me?.inventory || []).map((i) => i.itemId));
    }

    function effectiveLoadout() {
      const base = me?.loadout || catalog?.defaultLoadout || {
        skinId: 'skin_knight',
        attachments: { head: null, back: null, hand_r: null, hand_l: null },
        emoteWheel: ['emote_cheer', 'emote_wave', null, null],
      };
      const out = {
        skinId: base.skinId,
        attachments: { ...(base.attachments || {}) },
        emoteWheel: [...(base.emoteWheel || [null, null, null, null])],
      };
      if (tryOn?.item) {
        if (tryOn.item.category === 'skin') out.skinId = tryOn.item.id;
        else if (tryOn.item.category === 'attachment' && tryOn.item.slot) out.attachments[tryOn.item.slot] = tryOn.item.id;
      }
      return out;
    }

    function itemById(id) {
      return catalog?.items?.find((x) => x.id === id) || null;
    }

    function showEmotePreview(item) {
      if (!item) return;
      const badge = $el('#avatar-emote-float');
      if (badge) {
        badge.textContent = `${item.emoji || '✨'} ${item.name}`;
        badge.hidden = false;
        clearTimeout(emoteFloatTimer);
        emoteFloatTimer = setTimeout(() => { if (alive() && badge) badge.hidden = true; }, (item.durationSec || 2.2) * 1000);
      }
      viewer?.triggerEmotePreview(item.id, item.durationSec || 2.2);
    }

    function refreshViewer() {
      if (!viewer || !catalog) return;
      const eff = effectiveLoadout();
      const skin = itemById(eff.skinId) || catalog.items.find((x) => x.category === 'skin');
      if (!skin) return;
      const rigProfile = catalog.rigProfiles?.[skin.rigProfile] || {};
      const attachments = [];
      for (const slot of ['head', 'back', 'hand_r', 'hand_l']) {
        const id = eff.attachments?.[slot];
        const att = id ? itemById(id) : null;
        if (att?.assetUrl) attachments.push({ slot, url: assetUrl(att.assetUrl) });
      }
      if (catalog.renderProfile) {
        viewer.setRenderProfile?.(catalog.renderProfile);
      }
      viewer.setLoadout({
        loadout: eff,
        skinUrl: assetUrl(skin.assetUrl),
        rigProfile,
        attachments,
        renderProfile: catalog.renderProfile,
      });

      const banner = $el('#avatar-tryon-banner');
      if (banner) {
        banner.hidden = !tryOn;
        if (tryOn) $el('#avatar-tryon-text').textContent = `미리보기: ${tryOn.item.name}`;
      }
    }

    function syncRuntimeChrome() {
      const pageEl = $el('.avatar-page');
      const vpEl = $el('#avatar-viewport');
      const badgeEl = $el('#avatar-runtime-badge');
      const canvasEl = $el('#avatar-canvas');
      const godotImgEl = $el('#avatar-godot-frame');
      const openBtn = $el('#avatar-open-desktop-studio');
      const switcherEl = $el('#avatar-runtime-switcher');

      if (pageEl?.dataset) pageEl.dataset.previewRuntime = previewRuntime;
      if (vpEl?.dataset) vpEl.dataset.previewRuntime = previewRuntime;
      if (badgeEl) {
        if (badgeEl.dataset) badgeEl.dataset.previewRuntime = previewRuntime;
        badgeEl.className = `avatar-runtime-badge ${previewRuntime}`;
        badgeEl.textContent = previewRuntime === 'godot-desktop'
          ? '🎮 데스크톱 · Godot'
          : '🌐 웹 3D · JS WebGL';
      }
      if (canvasEl) canvasEl.hidden = previewRuntime === 'godot-desktop';
      if (godotImgEl) godotImgEl.hidden = previewRuntime !== 'godot-desktop';
      if (openBtn) {
        openBtn.textContent = previewRuntime === 'godot-desktop'
          ? '🖥️ Godot 스튜디오 창으로 열기'
          : '🖥️ 데스크톱(Godot)에서 열기';
      }
      if (switcherEl) {
        const canSwitch = catalog?.previewModes?.desktopGodotAvailable === true || previewRuntime === 'godot-desktop';
        switcherEl.hidden = !canSwitch;
        if (typeof switcherEl.querySelectorAll === 'function') {
          for (const btn of switcherEl.querySelectorAll('[data-preview-runtime-switch]')) {
            btn.classList?.toggle?.('active', btn.dataset?.previewRuntimeSwitch === previewRuntime);
          }
        }
      }
    }

    function initPreviewViewer(nextRuntime) {
      previewRuntime = nextRuntime === 'godot-desktop' ? 'godot-desktop' : 'web-js';
      if (viewer) {
        viewer.destroy();
        viewer = null;
      }
      const loadingEl = $el('#avatar-godot-loading');
      if (loadingEl) loadingEl.hidden = true;
      syncRuntimeChrome();

      const hintEl = $el('#avatar-stage-hint');
      if (previewRuntime === 'godot-desktop') {
        const godotImg = $el('#avatar-godot-frame');
        const viewportEl = $el('#avatar-viewport');
        if (godotImg) {
          viewer = createDesktopGodotPreview(godotImg, viewportEl, {
            apiBase,
            onLoading: (isLoading) => {
              if (!alive()) return;
              const el = $el('#avatar-godot-loading');
              if (el) el.hidden = !isLoading;
            },
            onStatus: (msg) => {
              if (!alive()) return;
              const hint = $el('#avatar-stage-hint');
              if (hint) hint.textContent = msg || 'Godot 런타임 · 드래그로 회전';
            },
          });
        }
        if (hintEl) hintEl.textContent = 'Godot 4.7.2 런타임 연결 중…';
      } else {
        const canvas = $el('#avatar-canvas');
        if (canvas && window.PlayHubAvatarGlbViewer) {
          jsWebglViewerCreated = true;
          viewer = window.PlayHubAvatarGlbViewer.create(canvas, {
            renderProfile: catalog?.renderProfile,
            onStatus: (msg) => {
              if (!alive()) return;
              const hint = $el('#avatar-stage-hint');
              if (hint) hint.textContent = msg || '드래그로 회전';
            },
          });
        }
        if (hintEl) hintEl.textContent = '드래그로 회전';
      }
      viewer?.setCameraPreset?.(cameraPreset);
      if (catalog) refreshViewer();
    }

    async function openDesktopStudio() {
      const eff = effectiveLoadout();
      if (previewRuntime === 'godot-desktop') {
        if (window.PlayHubDesktopHost?.openAvatarStudio) {
          try {
            await window.PlayHubDesktopHost.openAvatarStudio({ loadout: eff, camera: cameraPreset });
            if (alive()) setFeedback('Godot 4.7.2 아바타 스튜디오 창을 열었습니다.');
          } catch (err) {
            if (alive()) setFeedback(err?.message || 'Godot 스튜디오 창 실행에 실패했습니다.', true);
          }
          return;
        }
        try {
          const res = await api('/api/avatar/desktop-preview/open-window', {
            method: 'POST',
            body: { loadout: eff, camera: cameraPreset },
          });
          if (!alive()) return;
          if (res?.launched) {
            setFeedback(`Godot 4.7.2 아바타 스튜디오 창을 열었습니다. (PID ${res.pid || '-'})`);
          }
        } catch (err) {
          if (alive()) setFeedback(err?.message || 'Godot 스튜디오 창 실행에 실패했습니다.', true);
        }
        return;
      }

      // Web browser mode: issue L9 single-use launch ticket and invoke playhub://avatar-studio deeplink
      try {
        const res = await api('/api/avatar/studio/ticket', {
          method: 'POST',
          body: { loadout: eff, camera: cameraPreset },
        });
        if (!alive()) return;
        const deeplink = res?.deepLink || res?.deeplink;
        if (deeplink && /^playhub:\/\/avatar-studio\?ticket=/.test(deeplink)) {
          setFeedback('데스크톱 PlayHub 앱(Godot 4.7.2 런타임) 실행 링크를 호출했습니다. 앱이 설치되어 있지 않다면 웹 3D 프리뷰를 계속 이용하세요.');
          const iframe = document.createElement('iframe');
          iframe.style.display = 'none';
          iframe.src = deeplink;
          document.body.appendChild(iframe);
          setTimeout(() => iframe.remove(), 2500);
        }
      } catch (err) {
        if (alive()) setFeedback(err?.message || '데스크톱 스튜디오 실행 티켓 발급에 실패했습니다.', true);
      }
    }

    function renderWallet() {
      const w = me?.wallet;
      const pill = $el('#avatar-wallet-pill');
      if (!pill || !w) return;
      pill.innerHTML = `🪙 ${Number(w.total || 0).toLocaleString()} PlayCoin <span class="playcoin-breakdown">(유상 ${w.paid} · 보너스 ${w.bonus} · 프로모 ${w.promo})</span>`;
    }

    function renderStageSummary() {
      const summary = $el('#avatar-loadout-summary');
      const wheelEl = $el('#avatar-emote-wheel');
      if (!summary || !wheelEl || !catalog) return;
      const eff = effectiveLoadout();
      const skin = itemById(eff.skinId);
      const slotsHtml = [
        `<div class="avatar-slot-pill"><span>스킨</span><strong>${esc(skin?.name || eff.skinId)}</strong></div>`,
        ...Object.entries(SLOT_LABELS).map(([slot, label]) => {
          const att = eff.attachments?.[slot] ? itemById(eff.attachments[slot]) : null;
          return `<div class="avatar-slot-pill"><span>장착물 · ${label}</span><strong>${esc(att ? att.name : '비어 있음')}</strong></div>`;
        }),
      ];
      summary.innerHTML = slotsHtml.join('');

      wheelEl.innerHTML = [0, 1, 2, 3].map((idx) => {
        const emId = eff.emoteWheel?.[idx];
        const em = emId ? itemById(emId) : null;
        return `<button type="button" class="avatar-emote-btn" data-play-emote="${esc(emId || '')}" ${em ? '' : 'disabled'}>
          <span class="emoji">${esc(em?.emoji || '·')}</span>
          <span>${idx + 1}. ${esc(em?.name || '빈 슬롯')}</span>
        </button>`;
      }).join('');
    }

    function renderCatalogGrid() {
      const grid = $el('#avatar-item-grid');
      const slotRow = $el('#avatar-slot-filters');
      if (!grid || !catalog) return;
      slotRow.hidden = categoryFilter !== 'attachment';

      const owned = ownedSet();
      const active = me?.loadout || catalog.defaultLoadout;
      const items = catalog.items.filter((item) => {
        if (modeTab === 'locker' && !owned.has(item.id)) return false;
        if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
        if (categoryFilter === 'attachment' && slotFilter !== 'all' && item.slot !== slotFilter) return false;
        return true;
      });

      if (!items.length) {
        grid.innerHTML = '<p class="muted">표시할 아이템이 없습니다. 상점에서 스킨·장착물·이모지를 구매해 보세요.</p>';
        return;
      }

      grid.innerHTML = items.map((item) => {
        const isOwned = owned.has(item.id);
        const isEquipped =
          (item.category === 'skin' && active.skinId === item.id) ||
          (item.category === 'attachment' && active.attachments?.[item.slot] === item.id) ||
          (item.category === 'emote' && (active.emoteWheel || []).includes(item.id));
        const glyph = item.emoji || (item.category === 'skin' ? '🧍' : item.slot === 'head' ? '👑' : item.slot === 'back' ? '🛡️' : '⚔️');
        const subTag = item.category === 'attachment'
          ? `장착물 · ${SLOT_LABELS[item.slot] || item.slot}`
          : CATEGORY_LABELS[item.category] || item.category;

        let actionsHtml = '';
        if (!isOwned) {
          actionsHtml = `
            <button type="button" class="button secondary small" data-tryon="${esc(item.id)}">미리보기</button>
            <button type="button" class="button primary small" data-buy="${esc(item.id)}" ${busy ? 'disabled' : ''}>🪙 ${item.pricePlayCoin} 구매</button>
          `;
        } else if (item.category === 'skin') {
          actionsHtml = isEquipped
            ? `<button type="button" class="button secondary small" disabled>장착 중</button>`
            : `<button type="button" class="button primary small" data-equip-skin="${esc(item.id)}" ${busy ? 'disabled' : ''}>스킨 장착</button>`;
        } else if (item.category === 'attachment') {
          actionsHtml = isEquipped
            ? `<button type="button" class="button secondary small" data-unequip-slot="${esc(item.slot)}" ${busy ? 'disabled' : ''}>장착 해제</button>`
            : `<button type="button" class="button primary small" data-equip-att="${esc(item.id)}" ${busy ? 'disabled' : ''}>${SLOT_LABELS[item.slot]} 장착</button>`;
        } else if (item.category === 'emote') {
          const curSlot = (active.emoteWheel || []).indexOf(item.id);
          actionsHtml = `
            <button type="button" class="button secondary small" data-preview-emote="${esc(item.id)}">재생</button>
            <select class="avatar-emote-slot-select" data-emote-id="${esc(item.id)}" aria-label="이모지 슬롯 배치" ${busy ? 'disabled' : ''}>
              <option value="-1"${curSlot < 0 ? ' selected' : ''}>휠 미배치</option>
              ${[0, 1, 2, 3].map((s) => `<option value="${s}"${curSlot === s ? ' selected' : ''}>슬롯 ${s + 1} 배치</option>`).join('')}
            </select>
          `;
        }

        return `<article class="avatar-item-card${isEquipped ? ' equipped' : ''}" data-item-id="${esc(item.id)}">
          <div>
            <div class="avatar-item-head">
              <span class="avatar-rarity ${esc(item.rarity || 'common')}">${RARITY_LABELS[item.rarity] || item.rarity}</span>
              <span class="muted" style="font-size:0.75rem;">${esc(subTag)}</span>
            </div>
            <div class="avatar-item-icon" style="margin:10px 0;background:linear-gradient(135deg, ${esc(item.accentColor || '#142c25')}, #142c25);">${esc(glyph)}</div>
            <h3>${esc(item.name)}</h3>
            <p>${esc(item.description)}</p>
          </div>
          <div class="avatar-item-actions">${actionsHtml}</div>
        </article>`;
      }).join('');
    }

    function isDevDemoUiOn() {
      return window.PlayHubDevDemoUI?.isEnabled?.() === true;
    }

    function renderTopupPacks() {
      const box = $el('#avatar-topup-packs');
      const note = $el('#avatar-topup-note');
      if (!box) return;
      if (!isDevDemoUiOn()) {
        if (note) note.textContent = 'Track A PlayCoin 3-Bucket(유상 · 보너스 · 프로모) 원장에 적립됩니다. 아래 PlayCoin 상점에서 안전하게 충전할 수 있습니다.';
        box.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:0;">PlayCoin 충전은 PlayCoin 상점에서 간편결제(+25% 보너스)로 진행해 주세요.</p>';
        return;
      }
      if (note) note.textContent = 'Track A PlayCoin 3-Bucket(유상 · 보너스 · 프로모) 원장에 적립됩니다. (Dev 테스트 즉시 충전 ON)';
      if (!catalog) return;
      box.innerHTML = (catalog.topupPacks || []).map((pack) => `
        <div class="avatar-topup-card" data-dev-demo-ui>
          <strong>${esc(pack.label)}</strong>
          <span class="muted" style="font-size:0.82rem;">유상 ${pack.paidCoins.toLocaleString()} + 보너스 ${pack.bonusCoins.toLocaleString()} (+${pack.bonusPercent}%)</span>
          <button type="button" class="button primary small" data-topup-pack="${esc(pack.id)}" ${busy ? 'disabled' : ''}>${esc(pack.priceDisplay)} · 테스트 즉시 충전</button>
        </div>
      `).join('');
    }

    function syncBusyUI() {
      renderCatalogGrid();
      renderTopupPacks();
      const topupOpen = $el('#avatar-topup-open');
      if (topupOpen) topupOpen.disabled = busy;
    }

    async function saveLoadout(patch) {
      if (busy || !alive()) return;
      busy = true;
      syncBusyUI();
      try {
        const res = await api('/api/avatar/loadout', { method: 'PUT', body: patch });
        if (!alive()) return;
        me.loadout = res.loadout;
        tryOn = null;
        setFeedback('아바타 로드아웃을 저장했습니다. 모든 Forge 게임에 즉시 반영됩니다.');
        renderStageSummary();
        renderCatalogGrid();
        refreshViewer();
      } catch (err) {
        if (alive()) setFeedback(err.message || '로드아웃 저장에 실패했습니다.', true);
      } finally {
        busy = false;
        if (alive()) syncBusyUI();
      }
    }

    async function buyItem(itemId) {
      if (busy || !alive()) return;
      const item = itemById(itemId);
      if (!item) return;
      busy = true;
      syncBusyUI();
      try {
        const key = randomKey('buy');
        const res = await api('/api/avatar/purchase', {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: { itemId, idempotencyKey: key },
        });
        if (!alive()) return;
        me.wallet = res.wallet;
        me.inventory = res.inventory;
        me.loadout = res.loadout;
        tryOn = null;
        setFeedback(`'${item.name}' 구매 완료! (-${item.pricePlayCoin} PlayCoin) 바로 장착해 보세요.`);
        renderWallet();
        renderStageSummary();
        renderCatalogGrid();
        refreshViewer();
      } catch (err) {
        if (alive()) setFeedback(err.message || '구매에 실패했습니다.', true);
      } finally {
        busy = false;
        if (alive()) syncBusyUI();
      }
    }

    async function topupPack(packId) {
      if (busy || !alive()) return;
      busy = true;
      syncBusyUI();
      try {
        const key = randomKey('topup');
        const res = await api('/api/avatar/wallet/topup', {
          method: 'POST',
          headers: { 'Idempotency-Key': key },
          body: { packId, idempotencyKey: key },
        });
        if (!alive()) return;
        me.wallet = res.wallet;
        $el('#avatar-topup-dialog')?.close();
        setFeedback(`${res.pack.label} 충전 완료! (보너스 +${res.pack.bonusCoins} PlayCoin 포함)`);
        renderWallet();
      } catch (err) {
        if (alive()) setFeedback(err.message || 'PlayCoin 충전에 실패했습니다.', true);
      } finally {
        busy = false;
        if (alive()) syncBusyUI();
      }
    }

    root.addEventListener('click', (e) => {
      if (!alive()) return;
      const runtimeSwitchBtn = e.target.closest('[data-preview-runtime-switch]');
      if (runtimeSwitchBtn) {
        const nextRuntime = runtimeSwitchBtn.dataset.previewRuntimeSwitch;
        if (nextRuntime && nextRuntime !== previewRuntime) {
          initPreviewViewer(nextRuntime);
        }
        return;
      }
      if (e.target.closest('#avatar-open-desktop-studio')) {
        void openDesktopStudio();
        return;
      }
      const camBtn = e.target.closest('[data-cam]');
      if (camBtn) {
        cameraPreset = camBtn.dataset.cam;
        for (const b of root.querySelectorAll('[data-cam]')) b.classList.toggle('active', b === camBtn);
        viewer?.setCameraPreset(cameraPreset);
        return;
      }
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        modeTab = tabBtn.dataset.tab;
        for (const b of root.querySelectorAll('[data-tab]')) b.classList.toggle('active', b === tabBtn);
        renderCatalogGrid();
        return;
      }
      const catBtn = e.target.closest('[data-cat]');
      if (catBtn) {
        categoryFilter = catBtn.dataset.cat;
        for (const b of root.querySelectorAll('[data-cat]')) b.classList.toggle('active', b === catBtn);
        renderCatalogGrid();
        return;
      }
      const slotBtn = e.target.closest('[data-slot]');
      if (slotBtn) {
        slotFilter = slotBtn.dataset.slot;
        for (const b of root.querySelectorAll('[data-slot]')) b.classList.toggle('active', b === slotBtn);
        renderCatalogGrid();
        return;
      }
      if (e.target.closest('#avatar-tryon-clear')) {
        tryOn = null;
        renderStageSummary();
        refreshViewer();
        return;
      }
      if (e.target.closest('#avatar-topup-open')) {
        const dlg = $el('#avatar-topup-dialog');
        if (!dlg) return;
        const openDialog = () => {
          renderTopupPacks();
          const box = $el('#avatar-topup-packs');
          if (box && !box.children.length) {
            box.innerHTML = '<p class="muted">충전 패키지를 불러오는 중이거나 사용할 수 없습니다. PlayCoin 상점에서 충전을 진행해 주세요.</p>';
          }
          if (!dlg.open) {
            try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
          }
        };
        if (!catalog) {
          openDialog();
          api('/api/avatar/catalog')
            .then((catRes) => { if (!alive()) return; catalog = catRes; renderTopupPacks(); })
            .catch((err) => { if (alive()) setFeedback(err.message || '충전 패키지를 불러오지 못했습니다.', true); });
        } else {
          openDialog();
        }
        return;
      }
      if (e.target.closest('#avatar-topup-close') || e.target.closest('#avatar-topup-close-foot')) {
        $el('#avatar-topup-dialog')?.close();
        return;
      }
      const packBtn = e.target.closest('[data-topup-pack]');
      if (packBtn) { topupPack(packBtn.dataset.topupPack); return; }

      const tryBtn = e.target.closest('[data-tryon]');
      if (tryBtn) {
        const item = itemById(tryBtn.dataset.tryon);
        if (item?.category === 'emote') { showEmotePreview(item); return; }
        if (item) {
          tryOn = { item };
          renderStageSummary();
          refreshViewer();
        }
        return;
      }
      const buyBtn = e.target.closest('[data-buy]');
      if (buyBtn) { buyItem(buyBtn.dataset.buy); return; }

      const skinBtn = e.target.closest('[data-equip-skin]');
      if (skinBtn) { saveLoadout({ skinId: skinBtn.dataset.equipSkin }); return; }

      const attBtn = e.target.closest('[data-equip-att]');
      if (attBtn) {
        const item = itemById(attBtn.dataset.equipAtt);
        if (item?.slot) saveLoadout({ attachments: { ...(me.loadout?.attachments || {}), [item.slot]: item.id } });
        return;
      }
      const unequipBtn = e.target.closest('[data-unequip-slot]');
      if (unequipBtn) {
        const slot = unequipBtn.dataset.unequipSlot;
        saveLoadout({ attachments: { ...(me.loadout?.attachments || {}), [slot]: null } });
        return;
      }
      const prevEmoteBtn = e.target.closest('[data-preview-emote], [data-play-emote]');
      if (prevEmoteBtn) {
        const id = prevEmoteBtn.dataset.previewEmote || prevEmoteBtn.dataset.playEmote;
        if (id) showEmotePreview(itemById(id));
      }
    }, { signal });

    root.addEventListener('change', (e) => {
      if (!alive()) return;
      const sel = e.target.closest('.avatar-emote-slot-select');
      if (!sel) return;
      const emoteId = sel.dataset.emoteId;
      const slotIdx = Number(sel.value);
      const wheel = [...(me?.loadout?.emoteWheel || [null, null, null, null])];
      for (let i = 0; i < 4; i++) {
        if (wheel[i] === emoteId) wheel[i] = null;
      }
      if (slotIdx >= 0 && slotIdx < 4) wheel[slotIdx] = emoteId;
      saveLoadout({ emoteWheel: wheel });
    }, { signal });

    // Initialize runtime-specific preview viewer:
    // - Web browser (`web-js`): JavaScript WebGL 3D skeletal viewer (zero Godot runtime dependency)
    // - Desktop App (`godot-desktop`): Godot 4.7.2 Runtime preview (zero JS WebGL viewer created)
    initPreviewViewer(previewRuntime);

    const diagnosticsFn = () => ({
      previewRuntime,
      jsWebglViewerCreated,
      viewer: viewer?.getDiagnostics?.() || null,
      catalogPreviewModes: catalog?.previewModes || null,
      renderProfileId: catalog?.renderProfile?.profileId || null,
    });
    window.__playhubAvatarPreviewDiagnostics = diagnosticsFn;

    (async () => {
      try {
        const [catRes, meRes] = await Promise.all([api('/api/avatar/catalog'), api('/api/avatar/me')]);
        if (!alive()) return;
        catalog = catRes;
        me = meRes;
        syncRuntimeChrome();
        renderWallet();
        renderTopupPacks();
        renderStageSummary();
        renderCatalogGrid();
        refreshViewer();
      } catch (err) {
        if (alive()) setFeedback(err.message || '아바타 정보를 불러오지 못했습니다.', true);
      }
    })();

    return () => {
      disposed = true;
      listenerController.abort();
      clearTimeout(emoteFloatTimer);
      emoteFloatTimer = null;
      viewer?.destroy();
      viewer = null;
      if (window.__playhubAvatarPreviewDiagnostics === diagnosticsFn) {
        delete window.__playhubAvatarPreviewDiagnostics;
      }
    };
  }

  window.PlayHubAvatarUI = { mount, resolvePreviewRuntime };
})();
