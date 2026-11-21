(function () {
  'use strict';

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

  const SLOT_LABELS = { head: '머리', back: '등', hand_r: '오른손', hand_l: '왼손' };
  const CATEGORY_LABELS = { all: '전체', skin: '스킨', attachment: '장착물', emote: '이모지' };
  const RARITY_LABELS = { common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };

  function randomKey(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function mount(root, api, sameSession, options = {}) {
    let disposed = false;
    const listenerController = new AbortController();
    const { signal } = listenerController;
    const alive = () => !disposed && root.isConnected && sameSession();
    const apiBase = String(options.apiBase || '').replace(/\/$/, '');
    const assetUrl = (p) => (p ? `${apiBase}${p}` : null);
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

    root.innerHTML = `<section class="page avatar-page">
      <div class="avatar-topbar">
        <div>
          <h1>내 아바타 상점 &amp; 락커</h1>
          <p>UEFN 방식 단일 아바타 · 스킨·장착물·이모지는 PlayHub에서 구매·장착하며 모든 Forge 3D 게임에 자동 적용됩니다.</p>
        </div>
        <div class="avatar-wallet-bar">
          <div class="playcoin-pill" id="avatar-wallet-pill">🪙 불러오는 중…</div>
          <button type="button" class="button primary small" id="avatar-topup-open">PlayCoin 충전 (+25%)</button>
        </div>
      </div>
      <div id="avatar-feedback" class="avatar-feedback" role="status" hidden></div>
      <div class="avatar-workspace">
        <aside class="avatar-stage-card">
          <div class="avatar-viewport" id="avatar-viewport">
            <canvas id="avatar-canvas" aria-label="3D 아바타 미리보기"></canvas>
            <span class="avatar-seal-badge">🔒 포지 직접 수정 불가 · 봉인 런타임</span>
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
        <p class="muted">Track A PlayCoin 3-Bucket(유상 · 보너스 · 프로모) 원장에 적립됩니다. (로컬/개발 테스트 즉시 충전)</p>
        <div class="avatar-topup-grid" id="avatar-topup-packs"></div>
      </dialog>
    </section>`;

    const $el = (sel) => root.querySelector(sel);

    function setFeedback(text, error = false) {
      feedback = { text, error };
      const box = $el('#avatar-feedback');
      if (!box) return;
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
      viewer.setLoadout({ skinUrl: assetUrl(skin.assetUrl), rigProfile, attachments });

      const banner = $el('#avatar-tryon-banner');
      if (banner) {
        banner.hidden = !tryOn;
        if (tryOn) $el('#avatar-tryon-text').textContent = `미리보기: ${tryOn.item.name}`;
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

    function renderTopupPacks() {
      const box = $el('#avatar-topup-packs');
      if (!box || !catalog) return;
      box.innerHTML = (catalog.topupPacks || []).map((pack) => `
        <div class="avatar-topup-card">
          <strong>${esc(pack.label)}</strong>
          <span class="muted" style="font-size:0.82rem;">유상 ${pack.paidCoins.toLocaleString()} + 보너스 ${pack.bonusCoins.toLocaleString()} (+${pack.bonusPercent}%)</span>
          <button type="button" class="button primary small" data-topup-pack="${esc(pack.id)}" ${busy ? 'disabled' : ''}>${esc(pack.priceDisplay)} · 충전</button>
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
        $el('#avatar-topup-dialog')?.showModal();
        return;
      }
      if (e.target.closest('#avatar-topup-close')) {
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

    // Initialize 3D viewer and fetch catalog + user state
    const canvas = $el('#avatar-canvas');
    if (canvas && window.PlayHubAvatarGlbViewer) {
      viewer = window.PlayHubAvatarGlbViewer.create(canvas, {
        onStatus: (msg) => {
          if (!alive()) return;
          const hint = $el('#avatar-stage-hint');
          if (hint) hint.textContent = msg || '드래그로 회전';
        },
      });
    }

    (async () => {
      try {
        const [catRes, meRes] = await Promise.all([api('/api/avatar/catalog'), api('/api/avatar/me')]);
        if (!alive()) return;
        catalog = catRes;
        me = meRes;
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
    };
  }

  window.PlayHubAvatarUI = { mount };
})();
