/* 귀축왕 란스 — Interactive Web UI Controller (Phase 2)
 * Binds RANCE_DATA + KichikuouRanceEngine to:
 * - Continent SVG Map (29 territories, 10 factions, 4 dungeons)
 * - 4v4 Battle Arena w/ Operation Tactic Selector & Combat Zone (戦闘域) Gauge
 * - Post-Battle Enemy Commander Capture & Recruitment Modal
 * - Multi-Floor Dungeon Expedition Modal (Sasa B66F, Rudrasaum, Custom, Zeth Tower)
 * - Diplomacy Panel & Live 28-Character Destiny Board + 14 Verified Endings Codex
 */
(function () {
  "use strict";

  const DATA = globalThis.RANCE_DATA;
  const Engine = globalThis.KichikuouRanceEngine;

  if (!DATA || !Engine) {
    console.error("Failed to load RANCE_DATA or KichikuouRanceEngine.");
    return;
  }

  const STORAGE_PREFIX = "playhub.kichikuou-rance.slot.";
  const META_KEY = "playhub.kichikuou-rance.meta";
  const SAVE_SLOTS = [1, 2, 3];

  const PHASE_LABELS = {
    BANDIT_PROLOGUE: "프롤로그: 도적단 (루베란 분기)",
    LEAZAS_REBELLION: "제1장: 리자스 백군 내란 진압",
    HUMAN_REALM: "제2장: 인간계 자유 정복",
    MONSTER_REALM: "제3장: 마계 전면전 · 마인 침공",
    CREATOR_PHASE: "최종장: 창조신 루드라사움 페이즈"
  };

  let state = null;
  let selectedTerritoryId = "ter_leazas_white_fort";
  let activeTab = "territory";
  let commanderFilter = "recruited";
  let destinyFilter = "all";
  let deployTargetId = null;
  let deploySelection = [];
  let selectedBattleTargetKey = null;
  let lastShownEndingId = null;
  let captureModalDismissedForKey = null;

  const factionById = Object.fromEntries(DATA.factions.map((f) => [f.id, f]));
  const territoryDefById = Object.fromEntries(DATA.territories.map((t) => [t.id, t]));
  const classById = Object.fromEntries(DATA.unitClasses.map((c) => [c.id, c]));
  const eventDefById = Object.fromEntries(DATA.scenarioEvents.map((e) => [e.id, e]));
  const endingDefById = Object.fromEntries(DATA.endings.map((e) => [e.id, e]));
  const dungeonByTerritory = Object.fromEntries((DATA.dungeons || []).map((d) => [d.territoryId, d]));

  // ==================== META PROFILE ====================

  function loadMeta() {
    try {
      const raw = localStorage.getItem(META_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore storage restriction
    }
    return { unlockedEndings: [] };
  }

  function recordUnlockedEnding(endingId) {
    if (!endingId) return;
    const meta = loadMeta();
    if (!meta.unlockedEndings.includes(endingId)) {
      meta.unlockedEndings.push(endingId);
      try {
        localStorage.setItem(META_KEY, JSON.stringify(meta));
      } catch {
        // ignore
      }
    }
  }

  // ==================== TOAST & MODALS ====================

  function showToast(msg, isError) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `kr-toast${isError ? " error" : ""}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3400);
  }

  function openModal(id) {
    document.getElementById(id)?.classList.remove("hidden");
  }

  function closeModal(id) {
    document.getElementById(id)?.classList.add("hidden");
  }

  // ==================== INITIALIZATION ====================

  function startNewCampaign(startPhase) {
    state = Engine.createInitialState(DATA, { startPhase: startPhase || "LEAZAS_REBELLION" });
    lastShownEndingId = null;
    captureModalDismissedForKey = null;
    selectedTerritoryId = startPhase === "BANDIT_PROLOGUE" ? "ter_helman_east" : "ter_leazas_white_fort";
    if (startPhase === "BANDIT_PROLOGUE") {
      activeTab = "scenarios";
    }
    closeModal("modal-newgame");
    closeModal("modal-ending");
    closeModal("modal-battle");
    closeModal("modal-capture");
    closeModal("modal-dungeon");
    renderAll();
    showToast("새 캠페인이 시작되었습니다!");
  }

  // ==================== RENDER ALL ====================

  function renderAll() {
    renderHud();
    renderWeeklySlots();
    renderContinentMap();
    renderFactionLegend();
    renderTabs();
    renderTerritoryTab();
    renderScenariosTab();
    renderCommandersTab();
    renderDiplomacyTab();
    renderDestinyTab();
    renderChronicleTab();

    if (state.activeBattle) {
      openModal("modal-battle");
      renderBattleModal();
    } else {
      closeModal("modal-battle");
    }

    if (state.activeDungeon) {
      openModal("modal-dungeon");
      renderDungeonModal();
    }

    // Show post-battle capture modal automatically if new POWs captured!
    const capKey = (state.pendingCaptures || []).join(",");
    if (!state.activeBattle && !state.endingId && state.pendingCaptures.length > 0 && capKey !== captureModalDismissedForKey) {
      renderCaptureModal();
      openModal("modal-capture");
    } else if (state.pendingCaptures.length === 0) {
      closeModal("modal-capture");
    }

    if (state.endingId && state.endingId !== lastShownEndingId) {
      lastShownEndingId = state.endingId;
      recordUnlockedEnding(state.endingId);
      renderEndingModal();
      openModal("modal-ending");
    }
  }

  function renderHud() {
    document.getElementById("hud-phase-badge").textContent =
      PHASE_LABELS[state.campaignPhase] || state.campaignPhase;
    document.getElementById("hud-calendar").textContent =
      `${Engine.formatCalendar(state.calendar)} · T${state.turn}`;
    document.getElementById("hud-gold").textContent = `${state.gold.toLocaleString()}G`;
    document.getElementById("hud-morale").textContent = `${state.morale}%`;
    const ownedCount = Object.values(state.territories).filter((t) => t.owner === "fac_leazas").length;
    document.getElementById("hud-territories").textContent = `${ownedCount} / ${DATA.territories.length}`;

    const recruitedCount = Object.values(state.commanders).filter((c) => c.recruited && c.alive).length;
    document.getElementById("badge-commanders").textContent = `${recruitedCount}/${DATA.characters.length}`;
    document.getElementById("badge-scenarios").textContent = String(state.activeScenarios.length);

    const destinies = Engine.evaluateDestinies(state, DATA);
    const happyCount = destinies.filter((d) => d.status === "HAPPY").length;
    document.getElementById("badge-destiny").textContent = `${happyCount}/${destinies.length}`;

    document.getElementById("btn-end-turn").disabled = Boolean(state.activeBattle || state.activeDungeon || state.endingId);
  }

  function renderWeeklySlots() {
    const s = state.weeklySlots;
    const maxNinja = Engine.countAliveRecruitedNinjas(state) * 5;
    const defs = [
      { label: "도시", cur: s.city, max: 1 },
      { label: "시나리오", cur: s.characterEvent, max: 1 },
      { label: "부하대화", cur: s.talk, max: 1 },
      { label: "증원/보충", cur: s.reinforceOrDraft, max: 1 },
      { label: "건설", cur: s.build, max: 1 },
      { label: "탐색/던전", cur: s.explore, max: 1 },
      { label: "닌자", cur: s.ninja, max: maxNinja },
      { label: "침공", cur: s.invasion, max: 1 }
    ];
    const bar = document.getElementById("weekly-slots-bar");
    bar.innerHTML = defs
      .map(
        (d) => `
      <span class="slot-pill ${d.cur <= 0 ? "spent" : ""}">
        ${d.label} <span class="count">${d.cur}/${d.max}</span>
      </span>`
      )
      .join("");
  }

  // ==================== CONTINENT SVG MAP (29 TERRITORIES) ====================

  function renderContinentMap() {
    const svg = document.getElementById("continent-map-svg");
    const parts = [];

    parts.push(`
      <defs>
        <linearGradient id="mapLandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#271f24" />
          <stop offset="100%" stop-color="#17131d" />
        </linearGradient>
      </defs>
      <path d="M35,105 L165,60 L345,75 L495,48 L675,78 L870,115 L920,255 L895,385 L955,485 L865,595 L685,595 L495,585 L325,595 L255,465 L135,425 L55,315 Z"
            fill="url(#mapLandGrad)" stroke="rgba(212,169,77,0.28)" stroke-width="2" />
      <path d="M962,368 L1042,395 L1052,555 L978,568 L955,455 Z"
            fill="url(#mapLandGrad)" stroke="rgba(224,112,76,0.38)" stroke-width="1.8" />
      <text x="150" y="95" class="map-region-label">마계 · 신계</text>
      <text x="485" y="64" class="map-region-label">헬만 제국</text>
      <text x="445" y="492" class="map-region-label">제스 왕국</text>
      <text x="804" y="102" class="map-region-label">리자스 왕국</text>
      <text x="742" y="616" class="map-region-label">자유도시 · AL교</text>
      <text x="985" y="362" class="map-region-label">JAPAN</text>
    `);

    const drawnEdges = new Set();
    for (const def of DATA.territories) {
      const tA = state.territories[def.id];
      for (const adjId of def.adjacentIds) {
        const key = def.id < adjId ? `${def.id}|${adjId}` : `${adjId}|${def.id}`;
        if (drawnEdges.has(key)) continue;
        drawnEdges.add(key);
        const defB = territoryDefById[adjId];
        const tB = state.territories[adjId];
        if (!defB || !tB) continue;
        const isFrontier =
          (tA.owner === "fac_leazas" && tB.owner !== "fac_leazas") ||
          (tB.owner === "fac_leazas" && tA.owner !== "fac_leazas");
        parts.push(
          `<line class="map-edge ${isFrontier ? "frontier-edge" : ""}" x1="${def.coords.x}" y1="${def.coords.y}" x2="${defB.coords.x}" y2="${defB.coords.y}" />`
        );
      }
    }

    for (const def of DATA.territories) {
      const t = state.territories[def.id];
      const fac = factionById[t.owner];
      const color = fac ? fac.color : { fill: "#555", stroke: "#aaa" };
      const { x, y } = def.coords;
      const isSelected = selectedTerritoryId === def.id;
      const invCheck = Engine.canInvade(state, def.id);
      const isCapital = ["CAPITAL", "ENDGAME_CAPITAL", "HOLY_CAPITAL", "ISLAND_CAPITAL"].includes(t.strategicType);
      const r = isCapital ? 20 : 16;

      let hasCrisisPin = false;
      if (def.id === "ter_volgo_z" && (state.timers.volgoZSoul.status === "ACTIVE" || state.timers.volgoZSill.status === "ACTIVE")) hasCrisisPin = true;
      if (def.id === "ter_sasa_lake" && state.flags.aluminumAxeOwned && !state.commanders.chr_haniwa_king.recruited && !state.flags.sasaDungeonLocked) hasCrisisPin = true;
      if (def.id === "ter_rudrasaum_ruins" && state.campaignPhase === "CREATOR_PHASE") hasCrisisPin = true;
      if (def.id === "ter_leazas_white_fort" && state.campaignPhase === "LEAZAS_REBELLION") hasCrisisPin = true;

      const hasDungeon = Boolean(dungeonByTerritory[def.id]);
      const facIcons = t.facilities
        .map((fid) => ({ hospital: "H", magic_lab: "M", maria_lab: "R", library: "L" }[fid] || "*"))
        .join("");
      const shortName = def.nameKr.split(" (")[0];

      parts.push(`<g class="map-node" data-territory-id="${def.id}" tabindex="0" role="button" aria-label="${def.nameKr}">`);
      if (invCheck.ok) parts.push(`<circle class="node-attackable-ring" cx="${x}" cy="${y}" r="${r + 5}" />`);
      if (isSelected) parts.push(`<circle class="node-selected-ring" cx="${x}" cy="${y}" r="${r + 8}" />`);
      parts.push(
        `<circle class="node-circle" cx="${x}" cy="${y}" r="${r}" fill="${t.locked ? "#2a2833" : color.fill}" stroke="${color.stroke}" stroke-width="${isCapital ? 3 : 2}" opacity="${t.locked ? 0.55 : 1}" />`
      );
      parts.push(`<text class="node-troop-badge" x="${x}" y="${y + 4}">${t.locked ? "🔒" : t.garrisonTroops}</text>`);
      parts.push(`<text class="node-label" x="${x}" y="${y + r + 14}">${hasDungeon ? "🏰" : ""}${shortName}</text>`);
      if (facIcons) {
        parts.push(`<rect x="${x - 16}" y="${y - r - 14}" width="32" height="13" rx="6" fill="#120e18" stroke="#e6b852" stroke-width="1" />`);
        parts.push(`<text x="${x}" y="${y - r - 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#f5d88e">${facIcons}</text>`);
      }
      if (hasCrisisPin) {
        parts.push(`<circle cx="${x + r - 2}" cy="${y - r + 2}" r="7.5" fill="#e83e54" stroke="#fff" stroke-width="1.3" />`);
        parts.push(`<text x="${x + r - 2}" y="${y - r + 5.5}" text-anchor="middle" font-size="10" font-weight="900" fill="#fff">!</text>`);
      }
      parts.push(`</g>`);
    }

    svg.innerHTML = parts.join("");
    svg.querySelectorAll(".map-node").forEach((node) => {
      node.addEventListener("click", () => {
        selectedTerritoryId = node.getAttribute("data-territory-id");
        activeTab = "territory";
        renderAll();
      });
    });
  }

  function renderFactionLegend() {
    const bar = document.getElementById("faction-legend-bar");
    bar.innerHTML = DATA.factions
      .map((f) => {
        const count = Object.values(state.territories).filter((t) => t.owner === f.id).length;
        const facState = state.factions[f.id];
        const relTag = facState?.diplomaticRelation === "ALLIANCE" ? "🤝" : facState?.diplomaticRelation === "TRUCE" ? "🕊" : "";
        return `
          <span class="faction-chip ${count === 0 || facState?.defeated ? "defeated" : ""}">
            <span class="faction-dot" style="background:${f.color.fill};border:1px solid ${f.color.stroke};"></span>
            ${relTag}${f.color.label} (${count})
          </span>`;
      })
      .join("");
  }

  // ==================== TABS ====================

  function renderTabs() {
    document.querySelectorAll(".kr-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === activeTab);
    });
    document.querySelectorAll(".kr-tab-pane").forEach((pane) => {
      pane.classList.toggle("active", pane.id === `tab-${activeTab}`);
    });
  }

  // ==================== TERRITORY COMMAND TAB ====================

  function renderTerritoryTab() {
    const pane = document.getElementById("tab-territory");
    const t = state.territories[selectedTerritoryId];
    const def = territoryDefById[selectedTerritoryId];
    if (!t || !def) {
      pane.innerHTML = `<div class="kr-card"><p class="muted">지도에서 영토를 선택하세요.</p></div>`;
      return;
    }

    const fac = factionById[t.owner];
    const isPlayer = t.owner === "fac_leazas";
    const invCheck = Engine.canInvade(state, t.id);
    const localDungeon = dungeonByTerritory[t.id];

    const adjLinks = t.adjacentIds
      .map((aid) => {
        const at = state.territories[aid];
        return `<button class="kr-btn small ghost" data-select-ter="${aid}" type="button">${at.nameKr.split(" (")[0]}</button>`;
      })
      .join("");

    const pendingCapBanner =
      state.pendingCaptures.length > 0
        ? `<div class="kr-card highlight" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
             <span>⛓ 미처분 포로 ${state.pendingCaptures.length}명 대기 중</span>
             <button class="kr-btn small gold" id="btn-reopen-captures" type="button">포로 처분 열기</button>
           </div>`
        : "";

    let actionHtml = "";
    if (isPlayer) {
      const facilityBtns = Object.values(Engine.FACILITIES)
        .map((f) => {
          const built = t.facilities.includes(f.id);
          const lockedByMaria = f.requiresRecruited && !state.commanders[f.requiresRecruited]?.recruited;
          const disabled = built || lockedByMaria || state.weeklySlots.build <= 0 || state.gold < f.cost;
          return `
            <button class="kr-btn small ${built ? "ghost" : "gold"}" data-build-fac="${f.id}" ${disabled ? "disabled" : ""} type="button" title="${f.description}">
              ${built ? "✓ " : "+ "}${f.nameKr} (${f.cost.toLocaleString()}G)
            </button>`;
        })
        .join("");

      const freyaCounterBtn = state.timers.freyaSabotage.active
        ? `<button class="kr-btn small danger" id="btn-counter-freya" ${state.weeklySlots.city <= 0 ? "disabled" : ""} type="button">🕵️ 프레이야 공작 저지·포획 (도시 슬롯)</button>`
        : "";

      const dungeonBtn = localDungeon
        ? `<button class="kr-btn gold" id="btn-launch-local-dungeon" data-dungeon-id="${localDungeon.id}" ${state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">
             🏰 ${localDungeon.nameKr} 다층 원정 개시
           </button>`
        : "";

      actionHtml = `
        <div class="action-stack">
          <div class="action-row">
            <button class="kr-btn primary" id="btn-city-tax" ${state.weeklySlots.city <= 0 ? "disabled" : ""} type="button">
              💰 무패널티 징세 (+${t.taxIncome.toLocaleString()}G)
            </button>
            <button class="kr-btn ghost" id="btn-explore-ter" ${state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">
              🧭 일반 탐색
            </button>
          </div>
          ${dungeonBtn}
          ${freyaCounterBtn}
          <div class="kr-card" style="margin-top:4px;">
            <h4>국가 시설 건설 (건설 슬롯 ${state.weeklySlots.build}/1)</h4>
            <div class="action-row">${facilityBtns}</div>
          </div>
        </div>`;
    } else {
      const canExploreCreator = t.id === "ter_rudrasaum_ruins" && state.campaignPhase === "CREATOR_PHASE";
      actionHtml = `
        <div class="action-stack">
          ${
            canExploreCreator
              ? `<button class="kr-btn gold" id="btn-launch-local-dungeon" data-dungeon-id="dng_rudrasaum_ruins" ${state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">🏰 루드라사움 유적 다층 던전 돌입</button>
                 <button class="kr-btn ghost" id="btn-explore-ter" ${state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">✨ 창조신 대면 직행</button>`
              : `<button class="kr-btn danger" id="btn-open-deploy" ${!invCheck.ok ? "disabled" : ""} type="button">
                   ⚔ 4부대 침공 편성 ${invCheck.ok ? "" : `(${invCheck.error})`}
                 </button>`
          }
          <div class="action-row">
            <button class="kr-btn small ghost" id="btn-ninja-scout" ${state.weeklySlots.ninja <= 0 ? "disabled" : ""} type="button">
              👁 닌자 정찰 (${state.weeklySlots.ninja})
            </button>
            <button class="kr-btn small ghost" id="btn-ninja-sabotage" ${state.weeklySlots.ninja <= 0 ? "disabled" : ""} type="button">
              💣 파괴공작 (50%)
            </button>
          </div>
        </div>`;
    }

    const relicsHtml =
      state.relics.length > 0
        ? `<div class="kr-card">
             <h4>✨ 보유 전설 유물 (${state.relics.length})</h4>
             <div style="display:flex;flex-wrap:wrap;gap:5px;">
               ${state.relics.map((r) => `<span class="badge fortune" title="${r.effectKr}">🏺 ${r.nameKr}</span>`).join("")}
             </div>
           </div>`
        : "";

    pane.innerHTML = `
      ${pendingCapBanner}
      <div class="kr-card highlight">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
          <h3>${def.nameKr}</h3>
          <span class="badge" style="background:${fac.color.fill};border:1px solid ${fac.color.stroke};">${fac.nameKr}</span>
        </div>
        <p class="muted" style="margin:4px 0 8px;">${def.keyFeature}</p>
        <div class="kv-grid">
          <div class="kv-item"><span>전투역 (Field Size)</span><strong>${t.fieldSize}명</strong></div>
          <div class="kv-item"><span>주둔 병력</span><strong>${t.scouted || isPlayer ? `${t.garrisonTroops}명` : "미정찰 (~" + t.garrisonTroops + ")"}</strong></div>
          <div class="kv-item"><span>징세 경제력</span><strong>${t.taxIncome.toLocaleString()}G</strong></div>
          <div class="kv-item"><span>창조신 정복 판정</span><strong>${t.countsForCreatorConquest ? "필수 영토" : "제외 특수지"}</strong></div>
        </div>
        ${actionHtml}
      </div>
      ${relicsHtml}
      <div class="kr-card">
        <h4>인접 연결 영토 (${t.adjacentIds.length}개)</h4>
        <div class="action-row">${adjLinks}</div>
      </div>
    `;

    pane.querySelector("#btn-reopen-captures")?.addEventListener("click", () => {
      captureModalDismissedForKey = null;
      renderCaptureModal();
      openModal("modal-capture");
    });

    pane.querySelectorAll("[data-select-ter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedTerritoryId = btn.dataset.selectTer;
        renderAll();
      });
    });

    pane.querySelector("#btn-city-tax")?.addEventListener("click", () => {
      const res = Engine.runCityAction(state, DATA, t.id, "tax");
      showToast(res.ok ? res.summary : res.error, !res.ok);
      renderAll();
    });

    pane.querySelector("#btn-counter-freya")?.addEventListener("click", () => {
      const res = Engine.runCityAction(state, DATA, t.id, "counter_freya");
      showToast(res.ok ? res.summary : res.error, !res.ok);
      renderAll();
    });

    pane.querySelector("#btn-explore-ter")?.addEventListener("click", () => {
      const res = Engine.runExplore(state, DATA, t.id);
      showToast(res.ok ? res.summary : res.error, !res.ok);
      renderAll();
    });

    pane.querySelector("#btn-launch-local-dungeon")?.addEventListener("click", (e) => {
      const did = e.currentTarget.dataset.dungeonId;
      const res = Engine.startDungeon(state, DATA, did);
      if (!res.ok) {
        showToast(res.error, true);
      } else {
        renderDungeonModal();
        openModal("modal-dungeon");
      }
      renderAll();
    });

    pane.querySelectorAll("[data-build-fac]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.runBuildFacility(state, DATA, t.id, btn.dataset.buildFac);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });

    pane.querySelector("#btn-ninja-scout")?.addEventListener("click", () => {
      const res = Engine.runNinjaAction(state, DATA, t.id, "scout");
      showToast(res.ok ? res.summary : res.error, !res.ok);
      renderAll();
    });

    pane.querySelector("#btn-ninja-sabotage")?.addEventListener("click", () => {
      const res = Engine.runNinjaAction(state, DATA, t.id, "sabotage");
      showToast(res.ok ? res.summary : res.error, !res.ok);
      renderAll();
    });

    pane.querySelector("#btn-open-deploy")?.addEventListener("click", () => openDeployModal(t.id));
  }

  // ==================== SCENARIOS & TIMERS TAB (28 CANONICAL) ====================

  function renderScenariosTab() {
    const pane = document.getElementById("tab-scenarios");

    const timersHtml = `
      <div class="kr-card crisis">
        <h4>⏳ 전역 위기 타이머 &amp; 시나리오 조건</h4>
        <div class="timer-row ${state.timers.volgoZSoul.status === "ACTIVE" ? "urgent" : "safe"}">
          <span>볼고 Z 소울 구출 기한</span>
          <strong>${state.timers.volgoZSoul.status === "ACTIVE" ? "LP 3/08/3 까지" : state.timers.volgoZSoul.status}</strong>
        </div>
        <div class="timer-row ${state.timers.volgoZSill.status === "ACTIVE" ? "urgent" : "safe"}">
          <span>볼고 Z 시일 구출 기한 (진 엔딩 필수)</span>
          <strong>${state.timers.volgoZSill.status === "ACTIVE" ? "LP 4/01/3 까지" : state.timers.volgoZSill.status}</strong>
        </div>
        <div class="timer-row ${state.timers.monsterRealmInvasion.active ? "urgent" : ""}">
          <span>마인군 인간계 대침공 카운트다운</span>
          <strong>${
            state.flags.demonInvasionTriggered
              ? "침공 진행 중!"
              : state.timers.monsterRealmInvasion.active
              ? `잔여 ${state.timers.monsterRealmInvasion.remainingWeeks}주`
              : "반란 진압 후 개시"
          }</strong>
        </div>
        <div class="timer-row ${state.timers.zethShizukaDuel.active ? "urgent" : ""}">
          <span>제스 개전 5주 시즈카 결투</span>
          <strong>${
            state.flags.shizukaDuelResolved
              ? "해결됨"
              : state.timers.zethShizukaDuel.active
              ? `잔여 ${state.timers.zethShizukaDuel.remainingWeeks}주`
              : "제스 미개전"
          }</strong>
        </div>
        <div class="timer-row">
          <span>제스 4탑 / 튤립 100호 / 신상·카오스</span>
          <strong>탑 ${state.flags.zethTowersDefeated}/4 · 로켓 ${state.flags.tulipProgress}% · 신상 ${state.flags.godStatuesCount}/3 ${state.flags.chaosSwordOwned ? "· ⚔카오스" : ""}</strong>
        </div>
      </div>
    `;

    let activeCards = "";
    if (state.activeScenarios.length === 0) {
      activeCards = `<div class="kr-card"><p class="muted">현재 대기 중인 시나리오 이벤트가 없습니다. 영토 정복·외교 동맹·던전 탐사로 새 시나리오가 해금됩니다.</p></div>`;
    } else {
      activeCards = state.activeScenarios
        .map((eid) => {
          const def = eventDefById[eid];
          const cfg = Engine.SCENARIO_CHOICES[eid] || { summary: def.triggerCondition, choices: [{ label: "실행", hint: "" }] };
          const btns = cfg.choices
            .map(
              (ch, idx) => `
              <button class="kr-btn full ${idx === 0 ? "primary" : "ghost"}" data-run-scenario="${eid}" data-choice="${idx}" type="button">
                <div>${ch.label}</div>
                <div class="muted" style="font-size:11px;">${ch.hint}</div>
              </button>`
            )
            .join("");
          return `
            <div class="kr-card highlight">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                <h4>★ ${def.nameKr}</h4>
                <span class="badge pending">${def.category}</span>
              </div>
              <p style="margin:5px 0 8px;font-size:12.5px;">${cfg.summary}</p>
              <div class="action-stack">${btns}</div>
            </div>`;
        })
        .join("");
    }

    const catalogHtml = `
      <div class="kr-card">
        <h4>📜 ${DATA.scenarioEvents.length}대 정사 시나리오·던전 체인 (${state.completedScenarios.length}/${DATA.scenarioEvents.length})</h4>
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">
          ${DATA.scenarioEvents
            .map((e) => {
              const done = state.completedScenarios.includes(e.id);
              const active = state.activeScenarios.includes(e.id);
              return `
                <div style="display:flex;justify-content:space-between;gap:6px;font-size:11.5px;padding:3px 6px;border-radius:4px;background:rgba(0,0,0,0.22);">
                  <span>${done ? "✅" : active ? "⚡" : "○"} ${e.nameKr}</span>
                  <span class="muted">${e.phase}</span>
                </div>`;
            })
            .join("")}
        </div>
      </div>
    `;

    pane.innerHTML = timersHtml + activeCards + catalogHtml;

    pane.querySelectorAll("[data-run-scenario]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const eid = btn.dataset.runScenario;
        const choice = Number(btn.dataset.choice || 0);
        const res = Engine.runScenarioEvent(state, DATA, eid, choice);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });
  }

  // ==================== COMMANDERS ROSTER TAB (69 CANONICAL UNITS) ====================

  function renderCommandersTab() {
    const pane = document.getElementById("tab-commanders");
    const all = Object.values(state.commanders);
    const filtered = all.filter((c) => {
      if (commanderFilter === "recruited") return c.recruited && c.alive;
      if (commanderFilter === "playable") return c.isPlayableSubordinate;
      if (commanderFilter === "bosses") return !c.isPlayableSubordinate;
      return true;
    });

    const playableCount = all.filter((c) => c.isPlayableSubordinate).length;
    const filterBar = `
      <div class="cmd-filter-bar">
        <button class="kr-btn small ${commanderFilter === "recruited" ? "primary" : "ghost"}" data-cmd-filter="recruited" type="button">아군 합류</button>
        <button class="kr-btn small ${commanderFilter === "playable" ? "primary" : "ghost"}" data-cmd-filter="playable" type="button">부하 ${playableCount}인</button>
        <button class="kr-btn small ${commanderFilter === "bosses" ? "primary" : "ghost"}" data-cmd-filter="bosses" type="button">보스/군주</button>
        <button class="kr-btn small ${commanderFilter === "all" ? "primary" : "ghost"}" data-cmd-filter="all" type="button">전체 ${all.length}</button>
      </div>
    `;

    const listHtml = filtered
      .map((c) => {
        const cls = classById[c.classId];
        const statusTag = !c.alive
          ? `<span class="badge misfortune">전사/소실</span>`
          : c.captured
          ? `<span class="badge pending">포로 생포</span>`
          : c.imprisoned
          ? `<span class="badge misfortune">볼고Z 수감</span>`
          : c.recruited
          ? `<span class="badge fortune">합류</span>`
          : !c.isPlayableSubordinate
          ? `<span class="badge demon">보스/군주</span>`
          : `<span class="badge">${factionById[c.initialFactionId]?.color.label || "타세력"}</span>`;

        const canAct = (c.recruited || c.id === "chr_lia") && c.alive;
        const actions = canAct
          ? `
            <div class="action-row" style="margin-top:6px;">
              <button class="kr-btn small ghost" data-cmd-talk="${c.id}" ${state.weeklySlots.talk <= 0 ? "disabled" : ""} type="button">💬 대화</button>
              ${
                c.isPlayableSubordinate && c.recruited
                  ? `
                <button class="kr-btn small ghost" data-cmd-reinforce="${c.id}" ${state.weeklySlots.reinforceOrDraft <= 0 || (c.troops >= c.maxTroops && c.commanderHp >= c.maxCommanderHp) ? "disabled" : ""} type="button">🛡 보충</button>
                <button class="kr-btn small ghost" data-cmd-draft="${c.id}" ${state.weeklySlots.reinforceOrDraft <= 0 ? "disabled" : ""} type="button">⬆ 증원</button>
                <button class="kr-btn small ghost" data-cmd-row="${c.id}" type="button">열:${c.row === "FRONT" ? "전열" : "후열"}</button>`
                  : ""
              }
            </div>`
          : "";

        return `
          <div class="cmd-card ${c.recruited ? "recruited" : ""}">
            <div class="cmd-head">
              <span class="cmd-name">${c.nameKr} <span class="muted">${cls ? cls.nameKr : ""}</span></span>
              <div>${statusTag}</div>
            </div>
            <div class="cmd-stats">
              <span>HP ${c.commanderHp}/${c.maxCommanderHp}</span>
              <span>병력 ${c.troops}/${c.maxTroops}</span>
              <span>ATK ${c.atk} · DEF ${c.def} · MAG ${c.mag}</span>
              <span>타격 ${c.strikes}${c.hasSnipe ? " · 🎯Snipe" : ""}</span>
              <span>LV ${c.battleLv} · 신뢰 ${c.trust}</span>
            </div>
            <div class="muted" style="font-size:11px;">${c.signatureSkill}</div>
            ${actions}
          </div>`;
      })
      .join("");

    pane.innerHTML = filterBar + listHtml;

    pane.querySelectorAll("[data-cmd-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        commanderFilter = btn.dataset.cmdFilter;
        renderCommandersTab();
      });
    });

    pane.querySelectorAll("[data-cmd-talk]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.runTalk(state, DATA, btn.dataset.cmdTalk);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });

    pane.querySelectorAll("[data-cmd-reinforce]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.runReinforce(state, DATA, btn.dataset.cmdReinforce);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });

    pane.querySelectorAll("[data-cmd-draft]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.runDraft(state, DATA, btn.dataset.cmdDraft);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });

    pane.querySelectorAll("[data-cmd-row]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = state.commanders[btn.dataset.cmdRow];
        if (c) {
          c.row = c.row === "FRONT" ? "BACK" : "FRONT";
          renderCommandersTab();
        }
      });
    });
  }

  // ==================== DIPLOMACY PANEL TAB ====================

  function renderDiplomacyTab() {
    const pane = document.getElementById("tab-diplomacy");
    const others = DATA.factions.filter((f) => f.id !== "fac_leazas");

    const relLabel = {
      WAR: { text: "전쟁 중", cls: "war" },
      TRUCE: { text: "휴전 협정", cls: "truce" },
      ALLIANCE: { text: "군사 동맹", cls: "alliance" },
      NEUTRAL: { text: "중립", cls: "neutral" }
    };

    pane.innerHTML = `
      <div class="kr-card highlight">
        <h4>🤝 대륙 외교 국정원</h4>
        <p class="muted" style="margin:0;">휴전(3,500G · 4주간 AI 반격·증원 중단), 동맹(5,000G · 매 턴 +600G 및 특수 영입 시나리오 해금), 선전포고로 전선을 조율하라.</p>
      </div>
      ${others
        .map((def) => {
          const f = state.factions[def.id];
          const terrCount = Object.values(state.territories).filter((t) => t.owner === def.id).length;
          const rel = relLabel[f.diplomaticRelation] || relLabel.NEUTRAL;
          const lockedPeace = ["fac_ex_rebellion", "fac_demon_kayblis"].includes(def.id);
          return `
            <div class="kr-card">
              <div class="cmd-head">
                <span class="cmd-name">
                  <span class="faction-dot" style="display:inline-block;background:${def.color.fill};border:1px solid ${def.color.stroke};margin-right:5px;"></span>
                  ${def.nameKr}
                </span>
                <div>
                  <span class="badge ${f.defeated ? "misfortune" : rel.cls}">
                    ${f.defeated ? "멸망" : `${rel.text}${f.truceTurns > 0 ? ` (${f.truceTurns}주)` : ""}`}
                  </span>
                  <span class="badge">${terrCount}영토</span>
                </div>
              </div>
              <p class="muted" style="margin:5px 0 7px;font-size:11.5px;">${def.notes}</p>
              <div class="action-row">
                <button class="kr-btn small ghost" data-dip-fac="${def.id}" data-dip-act="truce" ${f.defeated || lockedPeace || f.diplomaticRelation === "TRUCE" ? "disabled" : ""} type="button">🕊 휴전 (3,500G)</button>
                <button class="kr-btn small emerald" data-dip-fac="${def.id}" data-dip-act="alliance" ${f.defeated || lockedPeace || f.diplomaticRelation === "ALLIANCE" ? "disabled" : ""} type="button">🤝 동맹 (${state.morale >= 85 ? "2,500G" : "5,000G"})</button>
                <button class="kr-btn small danger" data-dip-fac="${def.id}" data-dip-act="declare_war" ${f.defeated || f.diplomaticRelation === "WAR" ? "disabled" : ""} type="button">⚔ 선전포고</button>
              </div>
            </div>`;
        })
        .join("")}
    `;

    pane.querySelectorAll("[data-dip-fac]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.negotiateFaction(state, DATA, btn.dataset.dipFac, btn.dataset.dipAct);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });
  }

  // ==================== LIVE 28-CHARACTER DESTINY BOARD TAB ====================

  function renderDestinyTab() {
    const pane = document.getElementById("tab-destiny");
    const list = Engine.evaluateDestinies(state, DATA);
    const happyN = list.filter((d) => d.status === "HAPPY").length;
    const neutralN = list.filter((d) => d.status === "NEUTRAL").length;
    const unhappyN = list.filter((d) => d.status === "UNHAPPY").length;

    const shown = list.filter((d) => destinyFilter === "all" || d.status === destinyFilter);

    pane.innerHTML = `
      <div class="kr-card highlight">
        <h4>✨ 캐릭터 운명(Destiny) 실시간 보드 (${list.length}인)</h4>
        <div class="action-row" style="margin:6px 0;">
          <span class="badge happy">HAPPY ${happyN}</span>
          <span class="badge neutral">NEUTRAL ${neutralN}</span>
          <span class="badge unhappy">UNHAPPY ${unhappyN}</span>
        </div>
        <div class="cmd-filter-bar">
          <button class="kr-btn small ${destinyFilter === "all" ? "primary" : "ghost"}" data-dst-filter="all" type="button">전체 (${list.length})</button>
          <button class="kr-btn small ${destinyFilter === "HAPPY" ? "emerald" : "ghost"}" data-dst-filter="HAPPY" type="button">HAPPY</button>
          <button class="kr-btn small ${destinyFilter === "NEUTRAL" ? "gold" : "ghost"}" data-dst-filter="NEUTRAL" type="button">NEUTRAL</button>
          <button class="kr-btn small ${destinyFilter === "UNHAPPY" ? "danger" : "ghost"}" data-dst-filter="UNHAPPY" type="button">UNHAPPY</button>
        </div>
      </div>
      ${shown
        .map(
          (d) => `
        <div class="destiny-card ${d.status.toLowerCase()}">
          <div class="cmd-head">
            <span class="cmd-name">${d.nameKr} <span class="muted">${d.nameEn}</span></span>
            <span class="badge ${d.status.toLowerCase()}">${d.status} (${d.progressPct}%)</span>
          </div>
          <div class="destiny-progress-bar">
            <div class="destiny-progress-fill" style="width:${d.progressPct}%"></div>
          </div>
          <div style="font-size:11.5px;color:var(--gold-soft);margin-bottom:3px;">현재 판정: ${d.reasonKr}</div>
          <div class="muted" style="font-size:11px;">🟢 행복: ${d.happySummaryKr}</div>
          <div class="muted" style="font-size:11px;">🔴 불행: ${d.unhappySummaryKr}</div>
        </div>`
        )
        .join("")}
    `;

    pane.querySelectorAll("[data-dst-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        destinyFilter = btn.dataset.dstFilter;
        renderDestinyTab();
      });
    });
  }

  // ==================== CHRONICLE TAB ====================

  function renderChronicleTab() {
    const pane = document.getElementById("tab-chronicle");
    pane.innerHTML = state.log
      .map(
        (entry) => `
        <div class="log-entry ${entry.type}">
          <span class="log-time">[${entry.calendar}]</span>
          <span>${entry.text}</span>
        </div>`
      )
      .join("");
  }

  // ==================== DEPLOYMENT MODAL ====================

  function openDeployModal(territoryId) {
    deployTargetId = territoryId;
    const available = Object.values(state.commanders).filter(
      (c) => c.recruited && c.alive && c.isPlayableSubordinate
    );
    const fronts = available.filter((c) => c.row === "FRONT");
    const backs = available.filter((c) => c.row !== "FRONT");
    const defaults = [];
    if (state.commanders.chr_rance.recruited && state.commanders.chr_rance.alive) defaults.push("chr_rance");
    for (const c of fronts) {
      if (defaults.length >= 2) break;
      if (!defaults.includes(c.id)) defaults.push(c.id);
    }
    for (const c of backs) {
      if (defaults.length >= 4) break;
      if (!defaults.includes(c.id)) defaults.push(c.id);
    }
    for (const c of available) {
      if (defaults.length >= 4) break;
      if (!defaults.includes(c.id)) defaults.push(c.id);
    }
    deploySelection = defaults;
    renderDeployModal();
    openModal("modal-deploy");
  }

  function renderDeployModal() {
    const t = state.territories[deployTargetId];
    document.getElementById("deploy-title").textContent =
      `${t.nameKr} 침공 편성 (최대 4부대 · 전투역 ${t.fieldSize}명)`;
    const available = Object.values(state.commanders).filter(
      (c) => c.recruited && c.alive && c.isPlayableSubordinate
    );
    const body = document.getElementById("deploy-body");
    body.innerHTML = `
      <p class="muted">전열(슬롯 1~2)은 직접 공격 가능, 후열(슬롯 3~4)은 궁/마법/지원 전용입니다. <strong>병수가 적은 부대부터 먼저 행동합니다!</strong></p>
      <div style="margin:6px 0;font-weight:700;color:var(--gold-soft);">선택됨: ${deploySelection.length} / 4 부대</div>
      <div class="deploy-grid">
        ${available
          .map((c) => {
            const selected = deploySelection.includes(c.id);
            const cls = classById[c.classId];
            return `
              <button class="deploy-unit-btn ${selected ? "selected" : ""}" data-toggle-deploy="${c.id}" type="button">
                <div style="display:flex;justify-content:space-between;gap:4px;">
                  <strong>${c.nameKr}</strong>
                  <span class="badge ${c.row === "FRONT" ? "front" : "back"}">${c.row === "FRONT" ? "전열" : "후열"}</span>
                </div>
                <div class="muted" style="font-size:11px;">${cls ? cls.nameKr : ""}</div>
                <div style="font-size:11.5px;margin-top:4px;">병력 ${c.troops} · HP ${c.commanderHp}/${c.maxCommanderHp} · ATK ${c.atk}</div>
              </button>`;
          })
          .join("")}
      </div>
    `;

    body.querySelectorAll("[data-toggle-deploy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.dataset.toggleDeploy;
        if (deploySelection.includes(cid)) {
          deploySelection = deploySelection.filter((id) => id !== cid);
        } else if (deploySelection.length < 4) {
          deploySelection.push(cid);
        } else {
          showToast("최대 4부대까지만 편성할 수 있습니다.", true);
        }
        renderDeployModal();
      });
    });
  }

  // ==================== 4V4 BATTLE ARENA MODAL ====================

  function renderBattleModal() {
    const battle = state.activeBattle;
    if (!battle) return;

    const zoneInfo = Engine.getCombatZoneInfo(battle.combatZone);

    document.getElementById("battle-title").textContent = `⚔ ${battle.targetNameKr} 공략전 (4v4 군단전)`;
    document.getElementById("battle-meta").textContent =
      `제 ${battle.round} 라운드 · 전투역 ${battle.fieldSize}명 · 첩보 +${Math.round((battle.intelBonus - 1) * 100)}% · 최소 병수 우선`;

    // Operation Tactic Selector Bar
    const tacticBar = document.getElementById("battle-tactic-bar");
    tacticBar.innerHTML = Object.values(Engine.BATTLE_TACTICS)
      .map(
        (tac) => `
        <button class="tactic-btn ${battle.tacticId === tac.id ? "active" : ""}" data-set-tactic="${tac.id}" type="button">
          <strong>⚔ ${tac.nameKr}</strong>
          <span>${tac.shortKr === "총공격" ? "ATK+30% / DEF-20%" : tac.shortKr === "철벽방어" ? "DEF+35% / ATK-15%" : tac.shortKr === "집중타격" ? "저격+2 / 치명+30%" : "공방 균형 유지"}</span>
        </button>`
      )
      .join("");

    tacticBar.querySelectorAll("[data-set-tactic]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.setBattleTactic(state, DATA, btn.dataset.setTactic);
        if (!res.ok) showToast(res.error, true);
        renderBattleModal();
      });
    });

    // Combat Zone (戦闘域) Gauge Bar
    const zoneBar = document.getElementById("battle-zone-bar");
    zoneBar.innerHTML = `
      <div class="zone-header">
        <strong>🔥 전투역(戦闘域) 주도권: 리자스 ${zoneInfo.value}% vs 적군 ${100 - zoneInfo.value}%</strong>
        <span class="badge ${zoneInfo.state === "PLAYER_ADVANTAGE" ? "fortune" : zoneInfo.state === "ENEMY_ADVANTAGE" ? "misfortune" : "pending"}">${zoneInfo.labelKr}</span>
      </div>
      <div class="zone-gauge-track">
        <div class="zone-gauge-player" style="width:${zoneInfo.value}%"></div>
        <div class="zone-gauge-mid"></div>
      </div>
    `;

    // Turn Queue
    const queue = Engine.getBattleTurnQueue(battle);
    document.getElementById("battle-turn-queue").innerHTML = queue
      .map(
        (u) => `
        <span class="queue-chip ${u.side === "PLAYER" ? "player" : "enemy"} ${u.unitKey === battle.activeUnitKey ? "current" : ""}">
          ${u.nameKr} (${u.troops})
        </span>`
      )
      .join("");

    const activeActor = battle.units.find((u) => u.unitKey === battle.activeUnitKey);
    const aliveEnemies = battle.units.filter((u) => u.side === "ENEMY" && u.commanderHp > 0);
    if (!aliveEnemies.some((e) => e.unitKey === selectedBattleTargetKey)) {
      selectedBattleTargetKey = aliveEnemies[0]?.unitKey || null;
    }

    const renderSquadCard = (u) => {
      const cls = classById[u.classId];
      const isCurrent = u.unitKey === battle.activeUnitKey;
      const isTarget = u.side === "ENEMY" && u.unitKey === selectedBattleTargetKey;
      const hpPct = Math.round((u.commanderHp / Math.max(1, u.maxCommanderHp)) * 100);
      const trpPct = Math.round((u.troops / Math.max(1, u.maxTroops)) * 100);
      const tags = [];
      if (u.isWaitingForSpecial) tags.push(`<span class="badge pending">⚡필살준비</span>`);
      if (u.isDefending) tags.push(`<span class="badge fortune">🛡방어중</span>`);
      if (u.classId === "cls_demons") tags.push(`<span class="badge demon">마인</span>`);

      return `
        <div class="squad-card ${u.side === "PLAYER" ? "player" : "enemy"} ${isCurrent ? "active-actor" : ""} ${isTarget ? "selected-target" : ""} ${u.commanderHp <= 0 ? "defeated" : ""}"
             data-battle-unit="${u.unitKey}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <strong>${u.nameKr}</strong>
            <span class="muted" style="font-size:10.5px;">슬롯 ${u.slotIndex + 1}</span>
          </div>
          <div class="muted" style="font-size:11px;">${cls ? cls.nameKr : u.classId} ${tags.join(" ")}</div>
          <div style="font-size:11px;margin-top:4px;">지휘관 HP ${u.commanderHp}/${u.maxCommanderHp}</div>
          <div class="bar-wrap"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
          <div style="font-size:11px;">병력 ${u.troops}/${u.maxTroops}</div>
          <div class="bar-wrap"><div class="bar-fill troops" style="width:${trpPct}%"></div></div>
        </div>`;
    };

    const pBack = battle.units.filter((u) => u.side === "PLAYER" && u.row === "BACK");
    const pFront = battle.units.filter((u) => u.side === "PLAYER" && u.row === "FRONT");
    const eFront = battle.units.filter((u) => u.side === "ENEMY" && u.row === "FRONT");
    const eBack = battle.units.filter((u) => u.side === "ENEMY" && u.row === "BACK");

    const grid = document.getElementById("battle-arena-grid");
    grid.innerHTML = `
      <div class="battle-col">
        <div class="battle-col-title">아군 후열 (원거리/마법)</div>
        ${pBack.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:18px 0;">비어 있음</div>`}
      </div>
      <div class="battle-col">
        <div class="battle-col-title">아군 전열 (직접/방벽)</div>
        ${pFront.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:18px 0;">비어 있음</div>`}
      </div>
      <div class="battle-divider">VS</div>
      <div class="battle-col">
        <div class="battle-col-title">적군 전열</div>
        ${eFront.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:18px 0;">격파됨</div>`}
      </div>
      <div class="battle-col">
        <div class="battle-col-title">적군 후열</div>
        ${eBack.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:18px 0;">비어 있음</div>`}
      </div>
    `;

    grid.querySelectorAll(".squad-card.enemy").forEach((card) => {
      card.addEventListener("click", () => {
        selectedBattleTargetKey = card.dataset.battleUnit;
        renderBattleModal();
      });
    });

    const infoEl = document.getElementById("battle-actor-info");
    const btnsEl = document.getElementById("battle-action-buttons");

    if (activeActor && activeActor.side === "PLAYER") {
      infoEl.innerHTML = `<strong>현재 행동: ${activeActor.nameKr}</strong> <span class="muted">(${activeActor.row === "FRONT" ? "전열" : "후열"} · 병력 ${activeActor.troops}) — 적 카드 클릭으로 목표 지정</span>`;
      const canDirect = activeActor.row === "FRONT";
      const canRanged = activeActor.canAttackFromBack;
      const canMagic = ["MAGIC", "MAGIC_SUPPORT", "SPECIAL_MAGIC", "DEMON_HYBRID"].includes(activeActor.attackType);
      const canSnipe = activeActor.isWaitingForSpecial;

      btnsEl.innerHTML = `
        <button class="kr-btn primary small" data-battle-act="attack" ${!canDirect ? "disabled" : ""} type="button">⚔ 직접공격</button>
        <button class="kr-btn gold small" data-battle-act="ranged" ${!canRanged ? "disabled" : ""} type="button">🏹 원거리</button>
        <button class="kr-btn gold small" data-battle-act="magic" ${!canMagic ? "disabled" : ""} type="button">✨ 마법</button>
        <button class="kr-btn danger small" data-battle-act="snipe" ${!canSnipe ? "disabled" : ""} type="button">🎯 필살저격</button>
        <button class="kr-btn ghost small" data-battle-act="defend" type="button">🛡 방어</button>
        <button class="kr-btn ghost small" data-battle-act="wait" type="button">⚡ 대기</button>
      `;

      btnsEl.querySelectorAll("[data-battle-act]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const res = Engine.executeBattleAction(state, DATA, {
            type: btn.dataset.battleAct,
            targetUnitKey: selectedBattleTargetKey
          });
          if (!res.ok) {
            showToast(res.error, true);
          } else {
            stepEnemyTurnsAutomatically();
          }
          renderAll();
        });
      });
    } else if (activeActor && activeActor.side === "ENEMY") {
      infoEl.innerHTML = `<strong>적군 차례: ${activeActor.nameKr}</strong>`;
      btnsEl.innerHTML = `<button class="kr-btn danger small" id="btn-step-enemy" type="button">적군 행동 진행 ▶</button>`;
      btnsEl.querySelector("#btn-step-enemy")?.addEventListener("click", () => {
        stepEnemyTurnsAutomatically();
        renderAll();
      });
    }

    const logBox = document.getElementById("battle-log-box");
    logBox.innerHTML = battle.log
      .slice(-14)
      .reverse()
      .map((line) => `<div class="battle-log-line">${line}</div>`)
      .join("");
  }

  function stepEnemyTurnsAutomatically() {
    let guard = 0;
    while (state.activeBattle && !state.endingId && guard < 12) {
      const actor = state.activeBattle.units.find((u) => u.unitKey === state.activeBattle.activeUnitKey);
      if (!actor || actor.side === "PLAYER") break;
      Engine.stepBattleAiTurn(state, DATA);
      guard += 1;
    }
  }

  // ==================== POST-BATTLE CAPTURE & RECRUITMENT MODAL ====================

  function renderCaptureModal() {
    const body = document.getElementById("capture-body");
    if (!state.pendingCaptures || state.pendingCaptures.length === 0) {
      body.innerHTML = `<p class="muted">처분 대기 중인 포로 지휘관이 없습니다.</p>`;
      return;
    }
    body.innerHTML = `
      <p class="muted" style="margin-top:0;">점령전 승리로 생포한 적 지휘관들입니다. 리자스 군단으로 등용하거나 석방·몸값 협상을 선택하세요.</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${state.pendingCaptures
          .map((cid) => {
            const c = state.commanders[cid];
            if (!c) return "";
            const cls = classById[c.classId];
            const ransomVal = 2000 + (c.battleLv || 8) * 250;
            return `
              <div class="kr-card highlight">
                <div class="cmd-head">
                  <span class="cmd-name">⛓ ${c.nameKr} <span class="muted">${cls ? cls.nameKr : ""}</span></span>
                  <span class="badge">${factionById[c.initialFactionId]?.nameKr || c.initialFactionId}</span>
                </div>
                <div class="cmd-stats">
                  <span>HP ${c.maxCommanderHp}</span>
                  <span>최대병력 ${c.maxTroops}</span>
                  <span>ATK ${c.atk} · DEF ${c.def} · MAG ${c.mag}</span>
                  <span>타격 ${c.strikes}${c.hasSnipe ? " · 🎯Snipe" : ""}</span>
                </div>
                <div class="muted" style="font-size:11.5px;margin-bottom:8px;">${c.signatureSkill}</div>
                <div class="action-row">
                  <button class="kr-btn small primary" data-cap-id="${c.id}" data-cap-act="recruit" type="button">👑 아군 등용</button>
                  <button class="kr-btn small emerald" data-cap-id="${c.id}" data-cap-act="release" type="button">🕊 명예 석방 (사기+4)</button>
                  <button class="kr-btn small gold" data-cap-id="${c.id}" data-cap-act="ransom" type="button">💰 몸값 (+${ransomVal.toLocaleString()}G)</button>
                </div>
              </div>`;
          })
          .join("")}
      </div>
    `;

    body.querySelectorAll("[data-cap-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const res = Engine.resolveCapture(state, DATA, btn.dataset.capId, btn.dataset.capAct);
        showToast(res.ok ? res.summary : res.error, !res.ok);
        renderAll();
      });
    });
  }

  // ==================== MULTI-FLOOR DUNGEON EXPEDITION MODAL ====================

  function renderDungeonModal() {
    const body = document.getElementById("dungeon-body");
    const title = document.getElementById("dungeon-modal-title");
    const ad = state.activeDungeon;

    if (!ad) {
      title.textContent = "🏰 대륙 4대 미궁 · 다층 던전 원정";
      body.innerHTML = `
        <p class="muted" style="margin-top:0;">점령한 미궁 거점에서 다층 던전 원정을 개시해 전설 유물·비밀 장수(하니와 킹, 리즈나)·창조신 결전 분기를 해금하라. (탐색 슬롯: ${state.weeklySlots.explore}/1)</p>
        <div class="codex-grid">
          ${(DATA.dungeons || [])
            .map((d) => {
              const ter = state.territories[d.territoryId];
              const cleared = state.clearedDungeons.includes(d.id);
              const unlocked = d.id === "dng_rudrasaum_ruins"
                ? state.campaignPhase === "CREATOR_PHASE" || !ter.locked
                : ter?.owner === "fac_leazas";
              return `
                <div class="kr-card ${cleared ? "highlight" : ""}">
                  <div class="cmd-head">
                    <strong>🏰 ${d.nameKr}</strong>
                    <span class="badge ${cleared ? "fortune" : unlocked ? "pending" : "misfortune"}">${cleared ? "제패완료" : unlocked ? "진입가능" : "미점령"}</span>
                  </div>
                  <div class="muted" style="font-size:11px;margin:4px 0;">위치: ${ter ? ter.nameKr : d.territoryId} · 총 ${d.floors.length}구간 · 보스: ${d.boss.nameKr}</div>
                  <div style="font-size:11.5px;color:var(--gold-soft);margin-bottom:8px;">🏺 유물 보상: ${d.relic.nameKr} (${d.relic.effectKr})</div>
                  <button class="kr-btn small gold full" data-start-dng="${d.id}" ${!unlocked || state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">
                    ⚔ 원정대 출격 (탐색 슬롯 1)
                  </button>
                </div>`;
            })
            .join("")}
        </div>
      `;

      body.querySelectorAll("[data-start-dng]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const res = Engine.startDungeon(state, DATA, btn.dataset.startDng);
          if (!res.ok) showToast(res.error, true);
          renderDungeonModal();
          renderAll();
        });
      });
      return;
    }

    title.textContent = `🏰 던전 원정 중: ${ad.nameKr}`;
    const hpPct = Math.round((ad.partyHp / Math.max(1, ad.maxPartyHp)) * 100);
    const partyNames = ad.partyIds.map((id) => state.commanders[id]?.nameKr || id).join(", ");

    body.innerHTML = `
      <div class="kr-card highlight">
        <div class="kv-grid">
          <div class="kv-item"><span>원정대 편성</span><strong>${partyNames}</strong></div>
          <div class="kv-item"><span>원정 전투력 / 획득 자금</span><strong>${ad.partyPower} · +${ad.lootGold.toLocaleString()}G</strong></div>
        </div>
        <div style="font-size:11.5px;margin-top:4px;">원정대 내구 HP: ${ad.partyHp} / ${ad.maxPartyHp}</div>
        <div class="bar-wrap"><div class="bar-fill hp" style="width:${hpPct}%"></div></div>
        <div class="muted" style="font-size:11.5px;">목표 유물: 🏺 ${ad.relic.nameKr} — ${ad.relic.effectKr}</div>
      </div>

      <div class="dungeon-floor-track">
        ${ad.floors
          .map((fl, idx) => {
            const cls = idx < ad.currentFloorIndex ? "done" : idx === ad.currentFloorIndex ? "current" : "";
            const isBoss = idx === ad.totalFloors - 1 ? "boss" : "";
            return `
              <div class="floor-step ${cls} ${isBoss}">
                <div>${idx < ad.currentFloorIndex ? "✅" : idx === ad.currentFloorIndex ? "🧭" : "🔒"} ${fl.label}</div>
                <div class="muted" style="font-size:10.5px;">위협 ${fl.threat} · ~${fl.rewardGold}G</div>
              </div>`;
          })
          .join("")}
      </div>

      <div class="action-row" style="margin:8px 0;">
        ${
          !ad.readyForBoss
            ? `<button class="kr-btn primary" id="btn-dng-advance" type="button">🧭 다음 계층 돌파 ▶</button>`
            : `<button class="kr-btn danger" id="btn-dng-boss" type="button">⚔ 보스 결전: ${ad.boss.nameKr} (전투력 ${ad.boss.power})</button>`
        }
        <button class="kr-btn ghost" id="btn-dng-exit" type="button">안전 철수 (전리품 50% 회수)</button>
      </div>

      <div class="battle-log-box" style="border-radius:8px;max-height:170px;">
        ${ad.log.slice(-12).reverse().map((line) => `<div class="battle-log-line">${line}</div>`).join("")}
      </div>
    `;

    body.querySelector("#btn-dng-advance")?.addEventListener("click", () => {
      const res = Engine.advanceDungeonFloor(state, DATA);
      if (!res.ok) showToast(res.error, true);
      renderDungeonModal();
      renderAll();
    });

    body.querySelector("#btn-dng-boss")?.addEventListener("click", () => {
      const res = Engine.fightDungeonBoss(state, DATA);
      showToast(res.ok ? res.summary : res.error, !res.ok || !res.victory);
      closeModal("modal-dungeon");
      renderAll();
    });

    body.querySelector("#btn-dng-exit")?.addEventListener("click", () => {
      const res = Engine.exitDungeon(state, DATA);
      showToast(res.ok ? res.summary : res.error, !res.ok);
      closeModal("modal-dungeon");
      renderAll();
    });
  }

  // ==================== SAVE / LOAD MODAL ====================

  function renderSaveModal() {
    const body = document.getElementById("save-slots-body");
    body.innerHTML = SAVE_SLOTS.map((slot) => {
      let summary = "비어 있는 슬롯";
      let hasData = false;
      try {
        const raw = localStorage.getItem(STORAGE_PREFIX + slot);
        if (raw) {
          const parsed = JSON.parse(raw);
          hasData = true;
          const owned = Object.values(parsed.territories || {}).filter((t) => t.owner === "fac_leazas").length;
          summary = `${Engine.formatCalendar(parsed.calendar)} · T${parsed.turn} · ${PHASE_LABELS[parsed.campaignPhase] || parsed.campaignPhase} · 영토 ${owned}/29`;
        }
      } catch {
        summary = "저장소 접근 불가";
      }
      return `
        <div class="kr-card" style="margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <div>
              <strong>슬롯 ${slot}</strong>
              <div class="muted" style="font-size:12px;">${summary}</div>
            </div>
            <div class="action-row">
              <button class="kr-btn small primary" data-save-slot="${slot}" type="button">저장</button>
              <button class="kr-btn small ghost" data-load-slot="${slot}" ${!hasData ? "disabled" : ""} type="button">불러오기</button>
            </div>
          </div>
        </div>`;
    }).join("");

    body.querySelectorAll("[data-save-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slot = btn.dataset.saveSlot;
        try {
          localStorage.setItem(STORAGE_PREFIX + slot, Engine.serialize(state));
          showToast(`슬롯 ${slot}에 현재 캠페인을 저장했습니다.`);
          renderSaveModal();
        } catch {
          showToast("로컬 저장에 실패했습니다.", true);
        }
      });
    });

    body.querySelectorAll("[data-load-slot]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const slot = btn.dataset.loadSlot;
        try {
          const raw = localStorage.getItem(STORAGE_PREFIX + slot);
          if (!raw) return;
          state = Engine.deserialize(raw, DATA);
          lastShownEndingId = state.endingId;
          closeModal("modal-save");
          renderAll();
          showToast(`슬롯 ${slot} 캠페인을 불러왔습니다.`);
        } catch {
          showToast("저장 데이터 불러오기에 실패했습니다.", true);
        }
      });
    });
  }

  // ==================== 14 VERIFIED ENDINGS & 28 DESTINIES CODEX ====================

  function renderCodexModal() {
    const meta = loadMeta();
    const destinies = Engine.evaluateDestinies(state, DATA);
    const happyN = destinies.filter((d) => d.status === "HAPPY").length;
    const unhappyN = destinies.filter((d) => d.status === "UNHAPPY").length;

    const body = document.getElementById("codex-body");
    body.innerHTML = `
      <div class="kr-card highlight" style="margin-bottom:10px;">
        <h4>달성 현황: 정사 14 엔딩 ${meta.unlockedEndings.length} / ${DATA.endings.length} · 실시간 운명(HAPPY ${happyN} / UNHAPPY ${unhappyN} / 총 ${destinies.length}인)</h4>
        <p class="muted" style="margin:4px 0 0;">${DATA.characterDestinySystem.description}</p>
      </div>
      <h4 style="margin:6px 0;color:var(--gold-soft);">🏆 14개 정사 메인 스토리 엔딩 (100% 원작 교차 검증)</h4>
      <div class="codex-grid">
        ${DATA.endings
          .map((e) => {
            const unlocked = meta.unlockedEndings.includes(e.id) || state.endingId === e.id;
            return `
              <div class="codex-item ${unlocked ? "unlocked" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                  <strong>${unlocked ? "🏆 " : "🔒 "}${e.nameKr}</strong>
                  <span class="badge ${e.cgModeUnlocked ? "fortune" : ""}">${e.cgModeUnlocked ? "CG등록" : e.category}</span>
                </div>
                <div class="muted" style="font-size:11px;margin:2px 0 5px;">${e.nameJp || ""} · ${e.nameEn}</div>
                <div style="font-size:11.5px;">${e.conditionSummary}</div>
              </div>`;
          })
          .join("")}
      </div>
      <h4 style="margin:14px 0 6px;color:var(--gold-soft);">✨ 28인 캐릭터 운명(Destiny) 실시간 요약</h4>
      <div style="display:flex;flex-wrap:wrap;gap:5px;">
        ${destinies
          .map((d) => `<span class="badge ${d.status.toLowerCase()}" title="${d.reasonKr}">${d.nameKr}: ${d.status}</span>`)
          .join("")}
      </div>
    `;
  }

  function renderEndingModal() {
    const e = endingDefById[state.endingId];
    document.getElementById("ending-modal-title").textContent = `🏆 엔딩 달성: ${e ? e.nameKr : state.endingId}`;
    const destinies = Engine.evaluateDestinies(state, DATA)
      .map(
        (d) => `<span class="badge ${d.status.toLowerCase()}" style="margin:2px;">${d.nameKr}: ${d.status}</span>`
      )
      .join("");

    document.getElementById("ending-modal-body").innerHTML = `
      <div class="kr-card highlight">
        <h4>${e ? `${e.nameKr} (${e.nameEn})` : state.endingId}</h4>
        <div class="muted" style="margin-bottom:6px;">${e?.nameJp || ""}</div>
        <p>${state.endingReason}</p>
        <div class="kv-grid">
          <div class="kv-item"><span>도달 달력</span><strong>${Engine.formatCalendar(state.calendar)} (턴 ${state.turn})</strong></div>
          <div class="kv-item"><span>최종 국고 / 유물</span><strong>${state.gold.toLocaleString()}G · 유물 ${state.relics.length}개</strong></div>
        </div>
      </div>
      <div class="kr-card" style="margin-top:10px;">
        <h4>28인 캐릭터 운명 최종 결산 (HAPPY / NEUTRAL / UNHAPPY)</h4>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${destinies}</div>
      </div>
    `;
  }

  // ==================== GLOBAL EVENT BINDINGS ====================

  function bindEvents() {
    document.querySelectorAll(".kr-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.dataset.tab;
        renderTabs();
      });
    });

    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mid = btn.dataset.closeModal;
        if (mid === "modal-capture") {
          captureModalDismissedForKey = (state.pendingCaptures || []).join(",");
        }
        closeModal(mid);
      });
    });

    document.getElementById("btn-end-turn").addEventListener("click", () => {
      const res = Engine.endTurn(state, DATA);
      if (!res.ok) {
        showToast(res.error, true);
      } else {
        showToast(`${Engine.formatCalendar(state.calendar)} 개시 (+${res.passiveIncome.toLocaleString()}G)`);
      }
      renderAll();
    });

    document.getElementById("btn-open-dungeon").addEventListener("click", () => {
      renderDungeonModal();
      openModal("modal-dungeon");
    });

    document.getElementById("btn-open-save").addEventListener("click", () => {
      renderSaveModal();
      openModal("modal-save");
    });

    document.getElementById("btn-open-codex").addEventListener("click", () => {
      renderCodexModal();
      openModal("modal-codex");
    });

    document.getElementById("btn-new-game").addEventListener("click", () => openModal("modal-newgame"));
    document.getElementById("btn-ending-newgame").addEventListener("click", () => openModal("modal-newgame"));

    document.getElementById("btn-start-rebellion").addEventListener("click", () => startNewCampaign("LEAZAS_REBELLION"));
    document.getElementById("btn-start-prologue").addEventListener("click", () => startNewCampaign("BANDIT_PROLOGUE"));

    document.getElementById("btn-launch-battle").addEventListener("click", () => {
      const res = Engine.startInvasion(state, DATA, deployTargetId, deploySelection);
      if (!res.ok) {
        showToast(res.error, true);
        return;
      }
      closeModal("modal-deploy");
      stepEnemyTurnsAutomatically();
      renderAll();
    });

    document.getElementById("btn-battle-auto-step").addEventListener("click", () => {
      Engine.stepBattleAiTurn(state, DATA);
      stepEnemyTurnsAutomatically();
      renderAll();
    });

    document.getElementById("btn-battle-auto-all").addEventListener("click", () => {
      Engine.autoResolveBattle(state, DATA);
      renderAll();
    });

    document.getElementById("btn-battle-retreat").addEventListener("click", () => {
      Engine.executeBattleAction(state, DATA, { type: "retreat" });
      showToast("부대가 전략 철수했습니다.");
      renderAll();
    });
  }

  bindEvents();
  startNewCampaign("LEAZAS_REBELLION");
})();
