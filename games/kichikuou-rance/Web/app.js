/* 귀축왕 란스 — Interactive Web UI Controller
 * Binds RANCE_DATA + KichikuouRanceEngine to the Continent SVG Map,
 * Weekly Slot Bar, 4v4 Battle Arena, Scenario/Crisis Panel, Roster & 14-Ending Codex.
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
  let deployTargetId = null;
  let deploySelection = [];
  let selectedBattleTargetKey = null;
  let lastShownEndingId = null;

  // Lookup maps
  const factionById = Object.fromEntries(DATA.factions.map((f) => [f.id, f]));
  const territoryDefById = Object.fromEntries(DATA.territories.map((t) => [t.id, t]));
  const classById = Object.fromEntries(DATA.unitClasses.map((c) => [c.id, c]));
  const eventDefById = Object.fromEntries(DATA.scenarioEvents.map((e) => [e.id, e]));
  const endingDefById = Object.fromEntries(DATA.endings.map((e) => [e.id, e]));

  // ==================== META PROFILE (14 ENDINGS) ====================

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

  // ==================== TOAST ====================

  function showToast(msg, isError) {
    const container = document.getElementById("toast-container");
    const el = document.createElement("div");
    el.className = `kr-toast${isError ? " error" : ""}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 3200);
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
    selectedTerritoryId = startPhase === "BANDIT_PROLOGUE" ? "ter_helman_east" : "ter_leazas_white_fort";
    if (startPhase === "BANDIT_PROLOGUE") {
      activeTab = "scenarios";
    }
    closeModal("modal-newgame");
    closeModal("modal-ending");
    closeModal("modal-battle");
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
    renderChronicleTab();

    if (state.activeBattle) {
      openModal("modal-battle");
      renderBattleModal();
    } else {
      closeModal("modal-battle");
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

    document.getElementById("btn-end-turn").disabled = Boolean(state.activeBattle || state.endingId);
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
      { label: "탐색", cur: s.explore, max: 1 },
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

    // Background Continent Parchment Silhouette
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

    // Adjacency Edges (deduplicated undirected)
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

    // Territory Nodes
    for (const def of DATA.territories) {
      const t = state.territories[def.id];
      const fac = factionById[t.owner];
      const color = fac ? fac.color : { fill: "#555", stroke: "#aaa" };
      const { x, y } = def.coords;
      const isSelected = selectedTerritoryId === def.id;
      const invCheck = Engine.canInvade(state, def.id);
      const isCapital = ["CAPITAL", "ENDGAME_CAPITAL", "HOLY_CAPITAL", "ISLAND_CAPITAL"].includes(t.strategicType);
      const r = isCapital ? 20 : 16;

      // Crisis badge check
      let hasCrisisPin = false;
      if (def.id === "ter_volgo_z" && (state.timers.volgoZSoul.status === "ACTIVE" || state.timers.volgoZSill.status === "ACTIVE")) {
        hasCrisisPin = true;
      }
      if (def.id === "ter_sasa_lake" && state.flags.aluminumAxeOwned && !state.commanders.chr_haniwa_king.recruited && !state.flags.sasaDungeonLocked) {
        hasCrisisPin = true;
      }
      if (def.id === "ter_rudrasaum_ruins" && state.campaignPhase === "CREATOR_PHASE") {
        hasCrisisPin = true;
      }
      if (def.id === "ter_leazas_white_fort" && state.campaignPhase === "LEAZAS_REBELLION") {
        hasCrisisPin = true;
      }

      const facIcons = t.facilities
        .map((fid) => ({ hospital: "H", magic_lab: "M", maria_lab: "R", library: "L" }[fid] || "*"))
        .join("");

      const shortName = def.nameKr.split(" (")[0];

      parts.push(`<g class="map-node" data-territory-id="${def.id}" tabindex="0" role="button" aria-label="${def.nameKr}">`);
      if (invCheck.ok) {
        parts.push(`<circle class="node-attackable-ring" cx="${x}" cy="${y}" r="${r + 5}" />`);
      }
      if (isSelected) {
        parts.push(`<circle class="node-selected-ring" cx="${x}" cy="${y}" r="${r + 8}" />`);
      }
      parts.push(
        `<circle class="node-circle" cx="${x}" cy="${y}" r="${r}" fill="${t.locked ? "#2a2833" : color.fill}" stroke="${color.stroke}" stroke-width="${isCapital ? 3 : 2}" opacity="${t.locked ? 0.55 : 1}" />`
      );
      parts.push(
        `<text class="node-troop-badge" x="${x}" y="${y + 4}">${t.locked ? "🔒" : t.garrisonTroops}</text>`
      );
      parts.push(`<text class="node-label" x="${x}" y="${y + r + 14}">${shortName}</text>`);
      if (facIcons) {
        parts.push(
          `<rect x="${x - 16}" y="${y - r - 14}" width="32" height="13" rx="6" fill="#120e18" stroke="#e6b852" stroke-width="1" />`
        );
        parts.push(
          `<text x="${x}" y="${y - r - 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#f5d88e">${facIcons}</text>`
        );
      }
      if (hasCrisisPin) {
        parts.push(`<circle cx="${x + r - 2}" cy="${y - r + 2}" r="7.5" fill="#e83e54" stroke="#fff" stroke-width="1.3" />`);
        parts.push(`<text x="${x + r - 2}" y="${y - r + 5.5}" text-anchor="middle" font-size="10" font-weight="900" fill="#fff">!</text>`);
      }
      parts.push(`</g>`);
    }

    svg.innerHTML = parts.join("");

    // Bind click handlers
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
        return `
          <span class="faction-chip ${count === 0 || facState?.defeated ? "defeated" : ""}">
            <span class="faction-dot" style="background:${f.color.fill};border:1px solid ${f.color.stroke};"></span>
            ${f.color.label} (${count})
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

    const adjLinks = t.adjacentIds
      .map((aid) => {
        const at = state.territories[aid];
        return `<button class="kr-btn small ghost" data-select-ter="${aid}" type="button">${at.nameKr.split(" (")[0]}</button>`;
      })
      .join("");

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

      actionHtml = `
        <div class="action-stack">
          <div class="action-row">
            <button class="kr-btn primary" id="btn-city-tax" ${state.weeklySlots.city <= 0 ? "disabled" : ""} type="button">
              💰 무패널티 징세 (+${t.taxIncome.toLocaleString()}G)
            </button>
            <button class="kr-btn gold" id="btn-explore-ter" ${state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">
              🧭 미궁 탐색 원정
            </button>
          </div>
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
              ? `<button class="kr-btn gold" id="btn-explore-ter" ${state.weeklySlots.explore <= 0 ? "disabled" : ""} type="button">✨ 루드라사움 유적 진입 (창조신 대면)</button>`
              : `<button class="kr-btn danger" id="btn-open-deploy" ${!invCheck.ok ? "disabled" : ""} type="button">
                   ⚔ 4부대 침공 편성 ${invCheck.ok ? "" : `(${invCheck.error})`}
                 </button>`
          }
          <div class="action-row">
            <button class="kr-btn small ghost" id="btn-ninja-scout" ${state.weeklySlots.ninja <= 0 ? "disabled" : ""} type="button">
              👁 닌자 정찰 (슬롯 ${state.weeklySlots.ninja})
            </button>
            <button class="kr-btn small ghost" id="btn-ninja-sabotage" ${state.weeklySlots.ninja <= 0 ? "disabled" : ""} type="button">
              💣 닌자 파괴공작 (50% 성공)
            </button>
          </div>
        </div>`;
    }

    pane.innerHTML = `
      <div class="kr-card highlight">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <h3>${def.nameKr}</h3>
          <span class="badge" style="background:${fac.color.fill};border:1px solid ${fac.color.stroke};">${fac.nameKr}</span>
        </div>
        <p class="muted" style="margin:4px 0 8px;">${def.keyFeature}</p>
        <div class="kv-grid">
          <div class="kv-item"><span>전투역 (Field Size)</span><strong>${t.fieldSize}명</strong></div>
          <div class="kv-item"><span>주둔 병력</span><strong>${t.scouted || isPlayer ? `${t.garrisonTroops}명` : "미정찰 (약 " + t.garrisonTroops + ")"}</strong></div>
          <div class="kv-item"><span>징세 경제력</span><strong>${t.taxIncome.toLocaleString()}G</strong></div>
          <div class="kv-item"><span>창조신 정복 판정</span><strong>${t.countsForCreatorConquest ? "필수 영토" : "제외 특수지"}</strong></div>
        </div>
        ${actionHtml}
      </div>

      <div class="kr-card">
        <h4>인접 연결 영토 (${t.adjacentIds.length}개)</h4>
        <div class="action-row">${adjLinks}</div>
      </div>
    `;

    // Bind buttons
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

    pane.querySelector("#btn-open-deploy")?.addEventListener("click", () => {
      openDeployModal(t.id);
    });
  }

  // ==================== SCENARIOS & CRISIS TIMERS TAB ====================

  function renderScenariosTab() {
    const pane = document.getElementById("tab-scenarios");

    // Active global crisis timers
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
          <span>제스 4탑 붕괴 / 튤립 100호 / 신상·카오스</span>
          <strong>탑 ${state.flags.zethTowersDefeated}/4 · 로켓 ${state.flags.tulipProgress}% · 신상 ${state.flags.godStatuesCount}/3 ${state.flags.chaosSwordOwned ? "· ⚔카오스" : ""}</strong>
        </div>
      </div>
    `;

    // Active scenario decision cards
    let activeCards = "";
    if (state.activeScenarios.length === 0) {
      activeCards = `<div class="kr-card"><p class="muted">현재 대기 중인 캐릭터 시나리오 이벤트가 없습니다. 영토 정복·징세·탐색·부하 대화로 새 시나리오가 해금됩니다.</p></div>`;
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
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <h4>★ ${def.nameKr}</h4>
                <span class="badge pending">${def.category}</span>
              </div>
              <p style="margin:5px 0 8px;font-size:12.5px;">${cfg.summary}</p>
              <div class="action-stack">${btns}</div>
            </div>`;
        })
        .join("");
    }

    // Completed / Catalog summary of all 16 verified scenarios
    const catalogHtml = `
      <div class="kr-card">
        <h4>📜 16대 정사 시나리오·타이머 트래커 (${state.completedScenarios.length}/${DATA.scenarioEvents.length})</h4>
        <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px;">
          ${DATA.scenarioEvents
            .map((e) => {
              const done = state.completedScenarios.includes(e.id);
              const active = state.activeScenarios.includes(e.id);
              return `
                <div style="display:flex;justify-content:space-between;font-size:11.5px;padding:3px 6px;border-radius:4px;background:rgba(0,0,0,0.22);">
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

  // ==================== COMMANDERS ROSTER TAB (33 CANONICAL) ====================

  function renderCommandersTab() {
    const pane = document.getElementById("tab-commanders");
    const all = Object.values(state.commanders);
    const filtered = all.filter((c) => {
      if (commanderFilter === "recruited") return c.recruited && c.alive;
      if (commanderFilter === "unrecruited") return !c.recruited || !c.alive;
      return true;
    });

    const filterBar = `
      <div class="cmd-filter-bar">
        <button class="kr-btn small ${commanderFilter === "recruited" ? "primary" : "ghost"}" data-cmd-filter="recruited" type="button">아군 합류</button>
        <button class="kr-btn small ${commanderFilter === "all" ? "primary" : "ghost"}" data-cmd-filter="all" type="button">전체 33인</button>
        <button class="kr-btn small ${commanderFilter === "unrecruited" ? "primary" : "ghost"}" data-cmd-filter="unrecruited" type="button">미합류/수감</button>
      </div>
    `;

    const listHtml = filtered
      .map((c) => {
        const cls = classById[c.classId];
        const destinyBadge = c.hasDestinyPair
          ? `<span class="badge ${c.destinyFlag.toLowerCase()}">${c.destinyFlag}</span>`
          : "";
        const statusTag = !c.alive
          ? `<span class="badge misfortune">전사/소실</span>`
          : c.imprisoned
          ? `<span class="badge misfortune">볼고Z 수감</span>`
          : c.recruited
          ? `<span class="badge fortune">합류</span>`
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
                <button class="kr-btn small ghost" data-cmd-draft="${c.id}" ${state.weeklySlots.reinforceOrDraft <= 0 ? "disabled" : ""} type="button">⬆ 증원(+150)</button>
                <button class="kr-btn small ghost" data-cmd-row="${c.id}" type="button">열:${c.row === "FRONT" ? "전열" : "후열"}</button>`
                  : ""
              }
            </div>`
          : "";

        return `
          <div class="cmd-card ${c.recruited ? "recruited" : ""}">
            <div class="cmd-head">
              <span class="cmd-name">${c.nameKr} <span class="muted">${cls ? cls.nameKr : ""}</span></span>
              <div>${statusTag} ${destinyBadge}</div>
            </div>
            <div class="cmd-stats">
              <span>HP ${c.commanderHp}/${c.maxCommanderHp}</span>
              <span>병력 ${c.troops}/${c.maxTroops}</span>
              <span>ATK ${c.atk} · DEF ${c.def} · MAG ${c.mag}</span>
              <span>타격 ${c.strikes}${c.hasSnipe ? " · 🎯Snipe" : ""}</span>
              <span>신뢰 ${c.trust}</span>
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
    // Default pick: balanced 2 FRONT + 2 BACK (starting with Rance)
    const fronts = available.filter((c) => c.row === "FRONT");
    const backs = available.filter((c) => c.row !== "FRONT");
    const defaults = [];
    if (state.commanders.chr_rance.recruited && state.commanders.chr_rance.alive) {
      defaults.push("chr_rance");
    }
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
                <div style="display:flex;justify-content:space-between;">
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

    document.getElementById("battle-title").textContent = `⚔ ${battle.targetNameKr} 공략전 (4v4 군단전)`;
    document.getElementById("battle-meta").textContent =
      `제 ${battle.round} 라운드 · 전투역 ${battle.fieldSize}명 · 첩보 보정 ${Math.round((battle.intelBonus - 1) * 100)}% · 최소 병수 우선 행동`;

    // Turn Queue (Smallest-Troop-First)
    const queue = Engine.getBattleTurnQueue(battle);
    document.getElementById("battle-turn-queue").innerHTML = queue
      .map(
        (u) => `
        <span class="queue-chip ${u.side === "PLAYER" ? "player" : "enemy"} ${u.unitKey === battle.activeUnitKey ? "current" : ""}">
          ${u.nameKr} (${u.troops})
        </span>`
      )
      .join("");

    // Ensure valid selected target for player
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
      if (u.classId === "cls_demons") tags.push(`<span class="badge demon">마인(닌자면역)</span>`);

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
        ${pBack.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:24px 0;">비어 있음</div>`}
      </div>
      <div class="battle-col">
        <div class="battle-col-title">아군 전열 (직접/방벽)</div>
        ${pFront.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:24px 0;">비어 있음</div>`}
      </div>
      <div class="battle-divider">VS</div>
      <div class="battle-col">
        <div class="battle-col-title">적군 전열</div>
        ${eFront.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:24px 0;">격파됨</div>`}
      </div>
      <div class="battle-col">
        <div class="battle-col-title">적군 후열</div>
        ${eBack.map(renderSquadCard).join("") || `<div class="muted" style="text-align:center;padding:24px 0;">비어 있음</div>`}
      </div>
    `;

    grid.querySelectorAll(".squad-card.enemy").forEach((card) => {
      card.addEventListener("click", () => {
        selectedBattleTargetKey = card.dataset.battleUnit;
        renderBattleModal();
      });
    });

    // Actor Command Controls
    const infoEl = document.getElementById("battle-actor-info");
    const btnsEl = document.getElementById("battle-action-buttons");

    if (activeActor && activeActor.side === "PLAYER") {
      infoEl.innerHTML = `<strong>현재 행동: ${activeActor.nameKr}</strong> <span class="muted">(${activeActor.row === "FRONT" ? "전열" : "후열"} · 병력 ${activeActor.troops}) — 적 카드를 클릭해 목표 지정</span>`;
      const canDirect = activeActor.row === "FRONT";
      const canRanged = activeActor.canAttackFromBack;
      const canMagic = ["MAGIC", "MAGIC_SUPPORT", "SPECIAL_MAGIC", "DEMON_HYBRID"].includes(activeActor.attackType);
      const canSnipe = activeActor.isWaitingForSpecial;

      btnsEl.innerHTML = `
        <button class="kr-btn primary" data-battle-act="attack" ${!canDirect ? "disabled" : ""} type="button">⚔ 직접공격</button>
        <button class="kr-btn gold" data-battle-act="ranged" ${!canRanged ? "disabled" : ""} type="button">🏹 원거리</button>
        <button class="kr-btn gold" data-battle-act="magic" ${!canMagic ? "disabled" : ""} type="button">✨ 마법</button>
        <button class="kr-btn danger" data-battle-act="snipe" ${!canSnipe ? "disabled" : ""} type="button">🎯 필살저격(Snipe)</button>
        <button class="kr-btn ghost" data-battle-act="defend" type="button">🛡 방어</button>
        <button class="kr-btn ghost" data-battle-act="wait" type="button">⚡ 대기(필살준비)</button>
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
            // Auto-advance consecutive enemy turns for snappy pacing!
            stepEnemyTurnsAutomatically();
          }
          renderAll();
        });
      });
    } else if (activeActor && activeActor.side === "ENEMY") {
      infoEl.innerHTML = `<strong>적군 차례: ${activeActor.nameKr}</strong>`;
      btnsEl.innerHTML = `<button class="kr-btn danger" id="btn-step-enemy" type="button">적군 행동 진행 ▶</button>`;
      btnsEl.querySelector("#btn-step-enemy")?.addEventListener("click", () => {
        stepEnemyTurnsAutomatically();
        renderAll();
      });
    }

    // Battle Log
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
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
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
        } catch (err) {
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

  // ==================== 14 ENDINGS & DESTINY CODEX ====================

  function renderCodexModal() {
    const meta = loadMeta();
    const destinyTracked = Object.values(state.commanders).filter((c) => c.hasDestinyPair);
    const fortunes = destinyTracked.filter((c) => c.destinyFlag === "FORTUNE").length;
    const misfortunes = destinyTracked.filter((c) => c.destinyFlag === "MISFORTUNE").length;

    const body = document.getElementById("codex-body");
    body.innerHTML = `
      <div class="kr-card highlight" style="margin-bottom:10px;">
        <h4>달성 현황: 메인 엔딩 ${meta.unlockedEndings.length} / ${DATA.endings.length} · 현재 회차 운명(행복 ${fortunes} / 불행 ${misfortunes})</h4>
        <p class="muted" style="margin:4px 0 0;">${DATA.characterDestinySystem.description}</p>
      </div>
      <div class="codex-grid">
        ${DATA.endings
          .map((e) => {
            const unlocked = meta.unlockedEndings.includes(e.id) || state.endingId === e.id;
            return `
              <div class="codex-item ${unlocked ? "unlocked" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                  <strong>${unlocked ? "🏆 " : "🔒 "}${e.nameKr}</strong>
                  <span class="badge">${e.category}</span>
                </div>
                <div class="muted" style="font-size:11px;margin:2px 0 5px;">${e.nameEn} · ${e.phase}</div>
                <div style="font-size:12px;">${e.conditionSummary}</div>
              </div>`;
          })
          .join("")}
      </div>
    `;
  }

  function renderEndingModal() {
    const e = endingDefById[state.endingId];
    document.getElementById("ending-modal-title").textContent = `🏆 엔딩 달성: ${e ? e.nameKr : state.endingId}`;
    const destinies = Object.values(state.commanders)
      .filter((c) => c.hasDestinyPair)
      .map(
        (c) => `<span class="badge ${c.destinyFlag.toLowerCase()}" style="margin:2px;">${c.nameKr}: ${c.destinyFlag}</span>`
      )
      .join("");

    document.getElementById("ending-modal-body").innerHTML = `
      <div class="kr-card highlight">
        <h4>${e ? `${e.nameKr} (${e.nameEn})` : state.endingId}</h4>
        <p>${state.endingReason}</p>
        <div class="kv-grid">
          <div class="kv-item"><span>도달 달력</span><strong>${Engine.formatCalendar(state.calendar)} (턴 ${state.turn})</strong></div>
          <div class="kv-item"><span>최종 국고</span><strong>${state.gold.toLocaleString()}G</strong></div>
        </div>
      </div>
      <div class="kr-card" style="margin-top:10px;">
        <h4>주요 캐릭터 운명 결산 (Fortune / Misfortune)</h4>
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
      btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
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
