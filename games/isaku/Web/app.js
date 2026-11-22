// Interactive Web Frontend for 유작 (遺作 / Isaku)
// Zero external dependencies; works seamlessly over file:// and HTTP.
(function () {
  'use strict';

  const STORAGE_SLOTS_KEY = 'isaku_save_slots_v1';
  const STORAGE_AUTO_KEY = 'isaku_auto_checkpoint_v1';
  const STORAGE_ENDINGS_KEY = 'isaku_endings_archive_v1';
  const MANUAL_SLOT_COUNT = 6;

  const STATUS_LABELS = {
    safe: '안전',
    at_risk: '위험!',
    rescued: '구출',
    compromised: '피해',
    hostile: '적대',
    incapacitated: '제압됨',
    deceased_backstory: '과거 사건',
  };

  const CATEGORY_META = {
    key: { icon: '🔑', label: '열쇠' },
    tool: { icon: '🔧', label: '공구' },
    puzzle_material: { icon: '🧪', label: '재료' },
    clue: { icon: '📄', label: '단서' },
    character_key_item: { icon: '🎀', label: '인물' },
    incident_artifact: { icon: '📼', label: '증거' },
  };

  const DIRECTION_ARROWS = {
    out: '←',
    enter: '→',
    stairs_down: '↓',
    stairs_up: '↑',
    climb_up: '⬆',
    climb_down: '⬇',
    inner_door: '⇢',
    walk: '→',
    back: '←',
    front: '↓',
    secret_passage: '✦',
  };

  // Explicit clean map coordinates (420 x 235 viewBox) for all 29 canonical rooms
  const MAP_COORDS = {
    // 6F Clock Tower
    rm_clock_tower: { x: 210, y: 112, short: '시계탑 (6F)' },
    // 5F (7 rooms)
    rm_5f_music: { x: 74, y: 52, short: '음악실' },
    rm_5f_class_3_1: { x: 168, y: 52, short: '3-1 교실' },
    rm_5f_class_3_2: { x: 262, y: 52, short: '3-2 교실' },
    rm_5f_science: { x: 356, y: 52, short: '이과실험실' },
    rm_5f_hall: { x: 210, y: 126, short: '5F 복도' },
    rm_5f_restroom_m: { x: 126, y: 194, short: '남 화장실' },
    rm_5f_restroom_f: { x: 294, y: 194, short: '여 화장실' },
    // 4F (6 rooms)
    rm_4f_storage: { x: 84, y: 52, short: '소실/창고' },
    rm_4f_craft: { x: 210, y: 52, short: '공작실' },
    rm_4f_av: { x: 336, y: 52, short: '시청각실' },
    rm_4f_hall: { x: 210, y: 126, short: '4F 복도' },
    rm_4f_class_2_3: { x: 126, y: 194, short: '2-3 교실' },
    rm_4f_electrical: { x: 294, y: 194, short: '배전반' },
    // 3F (6 rooms)
    rm_3f_broadcast: { x: 76, y: 48, short: '방송실' },
    rm_3f_broadcast_prep: { x: 190, y: 48, short: '방송창고' },
    rm_3f_library: { x: 326, y: 48, short: '도서실' },
    rm_3f_hall: { x: 210, y: 126, short: '3F 복도' },
    rm_3f_dead_end: { x: 112, y: 194, short: '막다른복도' },
    rm_3f_restroom_f: { x: 308, y: 194, short: '여 화장실' },
    // 2F (5 rooms)
    rm_2f_class_1_1: { x: 120, y: 54, short: '1-1 교실' },
    rm_2f_class_1_2: { x: 300, y: 54, short: '1-2 교실' },
    rm_2f_hall: { x: 210, y: 126, short: '2F 복도' },
    rm_2f_restroom_m: { x: 120, y: 194, short: '남 화장실' },
    rm_2f_kitchen: { x: 300, y: 194, short: '급식실' },
    // 1F (3 rooms)
    rm_1f_hall: { x: 210, y: 66, short: '1F 복도' },
    rm_1f_entrance: { x: 112, y: 174, short: '현관(봉쇄)' },
    rm_1f_infirmary: { x: 308, y: 174, short: '보건실' },
    // 0F Exterior
    rm_escape_exit: { x: 210, y: 112, short: '외부 탈출구' },
  };

  const engine = globalThis.IsakuEngine.createEngine(globalThis.ISAKU_DATA);

  const uiState = {
    viewedFloor: 5,
    selectedUseItemId: null,
    combineMode: false,
    combineSelection: [],
    keypadPuzzleId: null,
    keypadInput: '',
    lastEndingShown: null,
    lastAutoSaveKey: '',
  };

  // DOM helpers
  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeStorageGet(key, fallback) {
    try {
      const raw = globalThis.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function safeStorageSet(key, val) {
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(val));
    } catch (_) {
      // ignore storage quota / privacy mode errors
    }
  }

  function getUnlockedEndings() {
    const arr = safeStorageGet(STORAGE_ENDINGS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function recordUnlockedEnding(endingId) {
    if (!endingId) return;
    const list = getUnlockedEndings();
    if (!list.includes(endingId)) {
      list.push(endingId);
      safeStorageSet(STORAGE_ENDINGS_KEY, list);
    }
  }

  function maybeAutoCheckpoint() {
    const st = engine.getState();
    if (st.endingId) return;
    const key = `${st.currentPhase}|${st.solvedPuzzles.length}|${st.activeIncidents.map((i) => i.id).join(',')}`;
    if (key === uiState.lastAutoSaveKey) return;
    uiState.lastAutoSaveKey = key;
    const room = engine.getCurrentRoom();
    safeStorageSet(STORAGE_AUTO_KEY, {
      savedAt: new Date().toLocaleString('ko-KR'),
      roomNameKo: room ? room.nameKo : st.currentRoomId,
      floor: st.currentFloor,
      ticks: st.actionTicks,
      solved: st.solvedPuzzles.length,
      payload: engine.serialize(),
    });
  }

  function openModal(id) {
    const el = $(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = $(id);
    if (el) el.classList.remove('open');
  }

  // Atmospheric SVG Room Illustration Renderer
  function renderRoomStage(room, hotspots, presentChars, activeIncidentsInRoom) {
    const svg = $('room-stage-svg');
    const zone = room.zoneType;

    // Zone-specific ambient palette & architectural silhouette
    let bgTop = '#09111f';
    let bgBot = '#121c2d';
    let accentGlow = '#38bdf8';
    let propsSvg = '';

    if (zone === 'climax_zone') {
      bgTop = '#1c090c';
      bgBot = '#140c16';
      accentGlow = '#f97316';
      propsSvg = `
        <circle cx="360" cy="140" r="96" fill="#2a0a0a" stroke="#f59e0b" stroke-width="4" opacity="0.85"/>
        <circle cx="360" cy="140" r="78" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="6 10"/>
        <line x1="360" y1="140" x2="360" y2="76" stroke="#fde68a" stroke-width="4" stroke-linecap="round"/>
        <line x1="360" y1="140" x2="412" y2="156" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
        <rect x="490" y="90" width="10" height="240" fill="#78350f"/>
        <rect x="546" y="90" width="10" height="240" fill="#78350f"/>
        <g stroke="#b45309" stroke-width="6">
          <line x1="495" y1="125" x2="551" y2="125"/>
          <line x1="495" y1="165" x2="551" y2="165"/>
          <line x1="495" y1="205" x2="551" y2="205"/>
          <line x1="495" y1="245" x2="551" y2="245"/>
          <line x1="495" y1="285" x2="551" y2="285"/>
        </g>
      `;
    } else if (zone === 'ending_trigger') {
      bgTop = '#071c28';
      bgBot = '#0b2930';
      accentGlow = '#34d399';
      propsSvg = `
        <circle cx="560" cy="84" r="34" fill="#e0f2fe" opacity="0.9"/>
        <circle cx="574" cy="76" r="30" fill="#071c28"/>
        <polygon points="360,380 260,210 460,210" fill="#34d399" opacity="0.16"/>
        <rect x="40" y="130" width="170" height="190" fill="#09101c" stroke="#1e293b"/>
        <path d="M0 320 L720 320 L720 380 L0 380 Z" fill="#0b1f22"/>
      `;
    } else if (zone === 'corridor') {
      propsSvg = `
        <polygon points="0,0 245,92 245,275 0,380" fill="#0d1526" stroke="#1e293b" stroke-width="1.5"/>
        <polygon points="720,0 475,92 475,275 720,380" fill="#0d1526" stroke="#1e293b" stroke-width="1.5"/>
        <rect x="245" y="92" width="230" height="183" fill="#080e1a" stroke="#334155" stroke-width="2"/>
        <line x1="275" y1="92" x2="275" y2="275" stroke="#1e293b" stroke-width="2"/>
        <line x1="445" y1="92" x2="445" y2="275" stroke="#1e293b" stroke-width="2"/>
        <polygon points="60,80 185,115 185,235 60,290" fill="#38bdf8" opacity="0.09"/>
        <rect x="305" y="128" width="110" height="147" fill="#111827" stroke="#475569" stroke-width="2"/>
        <line x1="305" y1="158" x2="415" y2="158" stroke="#334155" stroke-width="2"/>
        <line x1="305" y1="188" x2="415" y2="188" stroke="#334155" stroke-width="2"/>
        <line x1="305" y1="218" x2="415" y2="218" stroke="#334155" stroke-width="2"/>
      `;
    } else if (zone === 'restroom') {
      bgTop = '#09141d';
      bgBot = '#111e29';
      propsSvg = `
        <rect x="60" y="68" width="160" height="230" fill="#132030" stroke="#334155" stroke-width="2"/>
        <rect x="235" y="68" width="160" height="230" fill="#111c2b" stroke="#334155" stroke-width="2"/>
        <rect x="440" y="95" width="210" height="110" fill="#172538" stroke="#475569" stroke-width="2"/>
        <rect x="468" y="114" width="60" height="72" fill="#0c1522" stroke="#64748b"/>
        <rect x="562" y="114" width="60" height="72" fill="#0c1522" stroke="#64748b"/>
      `;
    } else if (zone === 'utility') {
      bgTop = '#180c12';
      bgBot = '#141722';
      accentGlow = '#ef4444';
      propsSvg = `
        <rect x="220" y="62" width="280" height="225" fill="#182130" stroke="#475569" stroke-width="3"/>
        <rect x="248" y="92" width="100" height="76" fill="#0c1320" stroke="#ef4444" stroke-width="1.5"/>
        <rect x="372" y="92" width="100" height="76" fill="#0c1320" stroke="#f59e0b" stroke-width="1.5"/>
        <path d="M298 112 L286 134 L302 134 L290 156" fill="none" stroke="#fde047" stroke-width="3"/>
        <ellipse cx="360" cy="322" rx="190" ry="26" fill="#7c2d12" opacity="0.45"/>
      `;
    } else if (zone === 'trap_exit') {
      propsSvg = `
        <rect x="210" y="54" width="300" height="260" fill="#0c1320" stroke="#475569" stroke-width="3"/>
        <line x1="360" y1="54" x2="360" y2="314" stroke="#334155" stroke-width="3"/>
        <line x1="205" y1="90" x2="515" y2="270" stroke="#92400e" stroke-width="14"/>
        <line x1="515" y1="90" x2="205" y2="270" stroke="#78350f" stroke-width="14"/>
        <circle cx="360" cy="180" r="24" fill="#450a0a" stroke="#ef4444" stroke-width="2"/>
        <text x="360" y="186" text-anchor="middle" fill="#fecaca" font-size="14" font-weight="bold">봉쇄</text>
      `;
    } else if (zone === 'storage') {
      propsSvg = `
        <rect x="75" y="150" width="150" height="140" fill="#1e293b" stroke="#475569" stroke-width="2"/>
        <rect x="115" y="110" width="95" height="60" fill="#293548" stroke="#64748b" stroke-width="1.5"/>
        <rect x="440" y="88" width="200" height="210" fill="#141e2e" stroke="#334155" stroke-width="2"/>
        <path d="M510 298 Q540 245 570 298 Z" fill="#05080f" stroke="#94a3b8" stroke-width="1.5"/>
      `;
    } else if (zone === 'classroom') {
      propsSvg = `
        <rect x="120" y="64" width="480" height="130" fill="#0f2922" stroke="#78350f" stroke-width="6"/>
        <rect x="145" y="232" width="110" height="58" fill="#1e293b" stroke="#475569"/>
        <rect x="305" y="232" width="110" height="58" fill="#1e293b" stroke="#475569"/>
        <rect x="465" y="232" width="110" height="58" fill="#1e293b" stroke="#475569"/>
      `;
    } else {
      // special_room (Music, Science, Craft, AV, Broadcast, Library, Kitchen, Infirmary)
      propsSvg = `
        <rect x="52" y="54" width="175" height="150" fill="#122138" stroke="#334155" stroke-width="2"/>
        <line x1="52" y1="95" x2="227" y2="112" stroke="#78350f" stroke-width="9"/>
        <line x1="52" y1="154" x2="227" y2="142" stroke="#78350f" stroke-width="9"/>
        <rect x="275" y="112" width="380" height="165" fill="#131c2e" stroke="#334155" stroke-width="2"/>
        <rect x="310" y="150" width="120" height="86" fill="#1e293b" stroke="#475569"/>
        <rect x="470" y="150" width="150" height="86" fill="#0d1524" stroke="#64748b"/>
      `;
    }

    // Place clickable SVG hotspot markers cleanly distributed across the viewport
    const visibleHotspots = hotspots.filter((h) => h.visible);
    const markerCount = visibleHotspots.length;
    const markersSvg = visibleHotspots
      .map((hs, idx) => {
        const cx = markerCount === 1 ? 360 : Math.round(150 + (idx * 420) / Math.max(1, markerCount - 1));
        const cy = idx % 2 === 0 ? 202 : 252;
        const fill = hs.puzzleSolved
          ? '#10b981'
          : hs.hasPendingPickup
          ? '#f59e0b'
          : uiState.selectedUseItemId
          ? '#fde68a'
          : '#38bdf8';
        const badgeText = hs.puzzleSolved ? '✓' : hs.hasPendingPickup ? '★' : '?';
        const shortLabel = hs.labelKo.length > 16 ? `${hs.labelKo.slice(0, 15)}…` : hs.labelKo;
        return `
          <g class="svg-hotspot-node" data-hotspot-id="${escapeHtml(hs.id)}">
            <circle cx="${cx}" cy="${cy}" r="24" fill="${fill}" opacity="0.16"/>
            <circle class="hs-ring" cx="${cx}" cy="${cy}" r="15" fill="#09101d" stroke="${fill}" stroke-width="2.2"/>
            <text x="${cx}" y="${cy + 5}" text-anchor="middle" fill="${fill}" font-size="14" font-weight="700">${badgeText}</text>
            <rect x="${cx - 74}" y="${cy + 20}" width="148" height="22" rx="5" fill="#070c15" fill-opacity="0.9" stroke="${fill}" stroke-opacity="0.55"/>
            <text x="${cx}" y="${cy + 35}" text-anchor="middle" fill="#e2e8f0" font-size="10.5" font-weight="600">${escapeHtml(shortLabel)}</text>
          </g>
        `;
      })
      .join('');

    // Present character chips along top-right of stage
    const charsBadge =
      presentChars.length > 0
        ? `
        <g transform="translate(18, 16)">
          <rect x="0" y="0" width="${Math.min(460, 118 + presentChars.length * 66)}" height="28" rx="6" fill="#070c15" fill-opacity="0.86" stroke="#334155"/>
          <text x="10" y="18" fill="#94a3b8" font-size="11" font-weight="700">동석 인물: ${escapeHtml(
            presentChars.map((c) => c.nameKo.split(' ').pop()).join(' · ')
          )}</text>
        </g>`
        : '';

    const crisisTint =
      activeIncidentsInRoom.length > 0
        ? `<rect width="720" height="380" fill="#dc2626" opacity="0.12"/>`
        : '';

    svg.innerHTML = `
      <defs>
        <linearGradient id="roomBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${bgTop}"/>
          <stop offset="100%" stop-color="${bgBot}"/>
        </linearGradient>
        <radialGradient id="flashGlow" cx="50%" cy="46%" r="52%">
          <stop offset="0%" stop-color="${accentGlow}" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="${accentGlow}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="720" height="380" fill="url(#roomBg)"/>
      <rect width="720" height="380" fill="url(#flashGlow)"/>
      <rect y="294" width="720" height="86" fill="#070b13" opacity="0.88"/>
      <line x1="0" y1="294" x2="720" y2="294" stroke="#25344d" stroke-width="1.5"/>
      ${propsSvg}
      ${crisisTint}
      ${charsBadge}
      <g transform="translate(556, 16)">
        <rect x="0" y="0" width="146" height="28" rx="6" fill="#070c15" fill-opacity="0.85" stroke="#334155"/>
        <text x="73" y="18" text-anchor="middle" fill="#67e8f9" font-size="11.5" font-weight="700">${escapeHtml(room.nameKo)}</text>
      </g>
      ${markersSvg}
    `;

    svg.querySelectorAll('.svg-hotspot-node').forEach((node) => {
      node.addEventListener('click', () => {
        handleHotspotClick(node.getAttribute('data-hotspot-id'));
      });
    });
  }

  // Interactive Floor-by-Floor School Map SVG Renderer
  function renderFloorMap(state) {
    const tabsEl = $('floor-tabs');
    const floors = engine.data.floors;
    const alertFloors = new Set(
      state.activeIncidents
        .map((inc) => engine.getRoom(inc.triggerRoomId))
        .filter(Boolean)
        .map((r) => r.floor)
    );

    tabsEl.innerHTML = floors
      .map((f) => {
        const isCurrentTab = uiState.viewedFloor === f.floor;
        const hasPlayer = state.currentFloor === f.floor;
        const hasAlert = alertFloors.has(f.floor);
        const short = f.floor === 6 ? '6F 시계탑' : f.floor === 0 ? '0F 외부' : `${f.floor}F`;
        return `<button type="button" class="floor-tab ${isCurrentTab ? 'active' : ''} ${
          hasPlayer ? 'has-player' : ''
        } ${hasAlert ? 'has-alert' : ''}" data-floor="${f.floor}">${short}${hasAlert ? ' ⚠️' : ''}</button>`;
      })
      .join('');

    tabsEl.querySelectorAll('.floor-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        uiState.viewedFloor = Number(btn.getAttribute('data-floor'));
        renderFloorMap(engine.getState());
      });
    });

    const floorInfo = floors.find((f) => f.floor === uiState.viewedFloor);
    $('map-floor-label').textContent = floorInfo ? floorInfo.labelKo : `${uiState.viewedFloor}F`;

    const floorRooms = engine.getFloorRooms(uiState.viewedFloor);
    const floorRoomIds = new Set(floorRooms.map((r) => r.id));
    const currentRoom = engine.getCurrentRoom();
    const adjacentIds = new Set(currentRoom ? currentRoom.exits.map((e) => e.to) : []);

    // Build edges within the viewed floor
    const drawnPairs = new Set();
    let edgesSvg = '';
    for (const r of floorRooms) {
      const a = MAP_COORDS[r.id];
      if (!a) continue;
      for (const ex of r.exits) {
        if (!floorRoomIds.has(ex.to)) continue;
        const pairKey = [r.id, ex.to].sort().join('--');
        if (drawnPairs.has(pairKey)) continue;
        drawnPairs.add(pairKey);
        const b = MAP_COORDS[ex.to];
        if (!b) continue;
        const unlocked = engine.isExitUnlocked(r.id, ex.to) && engine.isExitUnlocked(ex.to, r.id);
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        edgesSvg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${
          unlocked ? '#38bdf8' : '#ef4444'
        }" stroke-width="${unlocked ? 2.2 : 2}" stroke-dasharray="${unlocked ? '' : '5 4'}" opacity="0.65"/>`;
        if (!unlocked) {
          edgesSvg += `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="11">🔒</text>`;
        }
      }
    }

    // Cross-floor stair indicator badges
    let stairsSvg = '';
    for (const r of floorRooms) {
      const pos = MAP_COORDS[r.id];
      if (!pos) continue;
      const crossExits = r.exits.filter((ex) => !floorRoomIds.has(ex.to));
      crossExits.forEach((ex, i) => {
        const target = engine.getRoom(ex.to);
        const unlocked = engine.isExitUnlocked(r.id, ex.to);
        const bx = pos.x + (i === 0 ? 54 : -54);
        const by = pos.y + (ex.direction === 'stairs_down' || ex.direction === 'secret_passage' ? 28 : -28);
        const arrow = DIRECTION_ARROWS[ex.direction] || '↕';
        stairsSvg += `
          <g class="map-room-node" data-map-room="${escapeHtml(ex.to)}">
            <line x1="${pos.x}" y1="${pos.y}" x2="${bx}" y2="${by}" stroke="${unlocked ? '#10b981' : '#ef4444'}" stroke-dasharray="3 3" stroke-width="1.5"/>
            <rect x="${bx - 34}" y="${by - 11}" width="68" height="22" rx="5" fill="#0d1726" stroke="${unlocked ? '#10b981' : '#ef4444'}"/>
            <text x="${bx}" y="${by + 4}" text-anchor="middle" fill="${unlocked ? '#6ee7b7' : '#fca5a5'}" font-size="9.5" font-weight="700">${arrow} ${
              target ? `${target.floor}F` : ''
            }${unlocked ? '' : ' 🔒'}</text>
          </g>
        `;
      });
    }

    // Room nodes
    let nodesSvg = '';
    for (const r of floorRooms) {
      const pos = MAP_COORDS[r.id];
      if (!pos) continue;
      const isPlayer = state.currentRoomId === r.id;
      const isVisited = state.visitedRooms.includes(r.id);
      const isAdjacent = adjacentIds.has(r.id);
      const hasIncident = state.activeIncidents.some((inc) => inc.triggerRoomId === r.id);
      const presentCount = engine.getPresentCharacters(r.id).length;

      const fill = isPlayer
        ? '#1e293b'
        : hasIncident
        ? '#3b0d11'
        : isVisited
        ? '#111d30'
        : '#0b101b';
      const stroke = isPlayer
        ? '#fbbf24'
        : hasIncident
        ? '#ef4444'
        : isAdjacent
        ? '#38bdf8'
        : '#334155';

      nodesSvg += `
        <g class="map-room-node" data-map-room="${escapeHtml(r.id)}">
          <rect x="${pos.x - 42}" y="${pos.y - 17}" width="84" height="34" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${
            isPlayer ? 2.6 : 1.5
          }"/>
          <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" fill="${
            isPlayer ? '#fde68a' : '#e2e8f0'
          }" font-size="10.5" font-weight="700">${escapeHtml(pos.short)}</text>
          ${isPlayer ? `<circle cx="${pos.x - 33}" cy="${pos.y - 10}" r="4.5" fill="#fbbf24"/>` : ''}
          ${hasIncident ? `<text x="${pos.x + 33}" y="${pos.y - 7}" text-anchor="middle" font-size="11">⚠️</text>` : ''}
          ${
            presentCount > 0
              ? `<circle cx="${pos.x + 33}" cy="${pos.y + 11}" r="7" fill="#0ea5e9"/><text x="${pos.x + 33}" y="${
                  pos.y + 14.5
                }" text-anchor="middle" fill="#071019" font-size="9" font-weight="700">${presentCount}</text>`
              : ''
          }
        </g>
      `;
    }

    const svg = $('floor-map-svg');
    svg.innerHTML = `${edgesSvg}${stairsSvg}${nodesSvg}`;
    svg.querySelectorAll('.map-room-node').forEach((node) => {
      node.addEventListener('click', () => {
        const targetId = node.getAttribute('data-map-room');
        if (!targetId || targetId === engine.getState().currentRoomId) return;
        const res = engine.moveTo(targetId);
        if (res.ok) {
          uiState.viewedFloor = engine.getState().currentFloor;
          uiState.selectedUseItemId = null;
        }
        renderAll();
      });
    });
  }

  function renderAll() {
    const state = engine.getState();
    const summary = engine.getProgressSummary();
    const room = engine.getCurrentRoom();
    const hotspots = engine.getAvailableHotspots();
    const presentChars = engine.getPresentCharacters();
    const exits = engine.getExitsWithState();

    maybeAutoCheckpoint();

    // 1. Top HUD
    $('hud-phase-label').textContent = summary.currentPhaseLabelKo;
    $('hud-location').textContent = room ? room.nameKo : state.currentRoomId;
    $('hud-ticks').textContent = String(state.actionTicks);
    $('hud-puzzles').textContent = `${summary.solvedPuzzles} / ${summary.totalPuzzles}`;
    $('hud-miyuki').textContent = `♥ ${state.miyukiAffection} / 3`;
    $('hud-risk-count').textContent = `${state.activeIncidents.length}건`;
    $('hud-risk-pill').classList.toggle('danger', state.activeIncidents.length > 0);
    $('hud-endings-unlocked').textContent = String(getUnlockedEndings().length);

    // 2. Active Incident Banner
    const banner = $('incident-banner');
    if (state.activeIncidents.length > 0) {
      banner.classList.add('active');
      banner.innerHTML = state.activeIncidents
        .map((inc) => {
          const uiDef = engine.INCIDENT_DEFINITIONS[inc.id];
          const ch = engine.getCharacter(inc.targetCharacterId);
          const targetRoom = engine.getRoom(inc.triggerRoomId);
          const inRoom = state.currentRoomId === inc.triggerRoomId;
          return `
            <div class="incident-alert-card">
              <div class="incident-alert-info">
                <span class="incident-alert-title">⚠️ ${escapeHtml(uiDef ? uiDef.titleKo : inc.id)} (${escapeHtml(
                  ch ? ch.nameKo : inc.targetCharacterId
                )})</span>
                <span class="incident-alert-desc">발생 위치: <strong>${escapeHtml(
                  targetRoom ? targetRoom.nameKo : inc.triggerRoomId
                )}</strong> — ${escapeHtml(uiDef ? uiDef.promptKo : '')}</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="incident-timer-badge">남은 시한: ${inc.remainingTicks}틱</span>
                ${
                  inRoom
                    ? `<button type="button" class="btn-gold" data-open-incident="${escapeHtml(inc.id)}">즉시 대응하기</button>`
                    : `<button type="button" class="btn-accent" data-focus-floor="${
                        targetRoom ? targetRoom.floor : 5
                      }">지도에서 보기</button>`
                }
              </div>
            </div>
          `;
        })
        .join('');

      banner.querySelectorAll('[data-open-incident]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openIncidentDialogue(btn.getAttribute('data-open-incident'));
        });
      });
      banner.querySelectorAll('[data-focus-floor]').forEach((btn) => {
        btn.addEventListener('click', () => {
          uiState.viewedFloor = Number(btn.getAttribute('data-focus-floor'));
          renderFloorMap(engine.getState());
        });
      });
    } else {
      banner.classList.remove('active');
      banner.innerHTML = '';
    }

    // 3. Stage Header & Use Mode Bar
    $('stage-room-title').textContent = `🚪 ${room.nameKo}`;
    $('stage-room-sub').textContent = `${room.nameJa} · ${room.nameEn}`;

    const useBar = $('use-mode-bar');
    if (uiState.selectedUseItemId && state.inventory.includes(uiState.selectedUseItemId)) {
      const it = engine.getItem(uiState.selectedUseItemId);
      useBar.classList.add('active');
      $('use-mode-text').textContent = `🔧 [${it ? it.nameKo : uiState.selectedUseItemId}] 사용 모드 — 아래 핫스팟을 클릭해 적용하세요`;
    } else {
      uiState.selectedUseItemId = null;
      useBar.classList.remove('active');
    }

    // 4. SVG Stage
    const activeIncidentsInRoom = state.activeIncidents.filter((i) => i.triggerRoomId === state.currentRoomId);
    renderRoomStage(room, hotspots, presentChars, activeIncidentsInRoom);

    // 5. Hotspot Buttons
    const hsEl = $('hotspot-list');
    hsEl.innerHTML = hotspots
      .filter((h) => h.visible)
      .map((hs) => {
        const classes = ['hotspot-btn'];
        if (hs.puzzleSolved) classes.push('solved');
        else if (hs.hasPendingPickup) classes.push('pickup-ready');
        if (uiState.selectedUseItemId) classes.push('use-target');

        let statusText = hs.puzzleSolved
          ? '✅ 해결 완료'
          : hs.hasPendingPickup
          ? '★ 아이템 획득 가능'
          : hs.stagedItems.length > 0
          ? `진행 중: ${hs.stagedItems.map((id) => engine.getItem(id)?.nameKo || id).join(', ')}`
          : hs.examined
          ? '조사 완료 (재조사 가능)'
          : '클릭해 조사';

        if (uiState.selectedUseItemId) {
          statusText = `여기에 [${engine.getItem(uiState.selectedUseItemId)?.nameKo}] 사용`;
        }
        return `
          <button type="button" class="${classes.join(' ')}" data-hs="${escapeHtml(hs.id)}">
            <span class="hotspot-title">${escapeHtml(hs.labelKo)}</span>
            <span class="hotspot-meta">${escapeHtml(statusText)}</span>
          </button>
        `;
      })
      .join('');

    hsEl.querySelectorAll('[data-hs]').forEach((btn) => {
      btn.addEventListener('click', () => {
        handleHotspotClick(btn.getAttribute('data-hs'));
      });
    });

    // 6. Present Characters
    const charEl = $('present-characters');
    if (presentChars.length === 0) {
      charEl.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">현재 이 방에 대화할 인물이 없습니다.</span>';
    } else {
      charEl.innerHTML = presentChars
        .map((c) => {
          const st = state.characterStates[c.id];
          const isRisk = st === 'at_risk';
          const isHeroine = c.role === 'main_heroine';
          return `
            <button type="button" class="char-talk-btn ${isRisk ? 'at-risk' : ''} ${
              isHeroine ? 'heroine' : ''
            }" data-talk-char="${escapeHtml(c.id)}">
              <span class="char-dot ${escapeHtml(st)}"></span>
              <span><strong>${escapeHtml(c.nameKo)}</strong> (${escapeHtml(STATUS_LABELS[st] || st)})</span>
            </button>
          `;
        })
        .join('');
      charEl.querySelectorAll('[data-talk-char]').forEach((btn) => {
        btn.addEventListener('click', () => {
          openCharacterDialogue(btn.getAttribute('data-talk-char'));
        });
      });
    }

    // 7. Connected Exits
    const exitEl = $('exit-list');
    exitEl.innerHTML = exits
      .map((ex) => {
        const arrow = DIRECTION_ARROWS[ex.direction] || '→';
        const cls = ['exit-btn'];
        if (!ex.unlocked) cls.push('locked');
        if (ex.to === 'rm_escape_exit' && ex.unlocked) cls.push('escape');
        return `
          <button type="button" class="${cls.join(' ')}" data-move-to="${escapeHtml(ex.to)}" title="${escapeHtml(
            ex.unlocked ? `${ex.targetRoom.nameKo}(으)로 이동` : `잠김: ${ex.unlockPuzzleNameKo || ''}`
          )}">
            ${arrow} ${escapeHtml(ex.targetRoom.nameKo)} ${ex.unlocked ? '' : '🔒'}
          </button>
        `;
      })
      .join('');

    exitEl.querySelectorAll('[data-move-to]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = engine.moveTo(btn.getAttribute('data-move-to'));
        if (res.ok) {
          uiState.viewedFloor = engine.getState().currentFloor;
          uiState.selectedUseItemId = null;
        }
        renderAll();
      });
    });

    // 8. Narrative Log
    const logBox = $('log-box');
    $('log-count-label').textContent = `기록 ${state.logs.length}건`;
    logBox.innerHTML = state.logs
      .slice(-45)
      .reverse()
      .map(
        (entry) => `
        <div class="log-entry ${escapeHtml(entry.type)}">
          <span class="log-tick">[T${entry.tick}]</span>${escapeHtml(entry.text)}
        </div>
      `
      )
      .join('');

    // 9. Floor Map
    renderFloorMap(state);

    // 10. Inventory & Combine Workbench
    renderInventory(state);

    // 11. Survivor Status Monitor
    renderSurvivors(state, summary);

    // 12. Ending Overlay if newly reached
    if (state.endingId && uiState.lastEndingShown !== state.endingId) {
      uiState.lastEndingShown = state.endingId;
      recordUnlockedEnding(state.endingId);
      $('hud-endings-unlocked').textContent = String(getUnlockedEndings().length);
      openEndingModal(true);
    }
  }

  function renderInventory(state) {
    $('inv-count-label').textContent = `보유 ${state.inventory.length}종`;
    const toggleBtn = $('btn-toggle-combine');
    const execBtn = $('btn-exec-combine');
    toggleBtn.textContent = uiState.combineMode ? '🧪 조합 모드: 켜짐 (2종 선택)' : '🧪 조합 모드: 꺼짐';
    toggleBtn.classList.toggle('btn-gold', uiState.combineMode);
    execBtn.disabled = !(uiState.combineMode && uiState.combineSelection.length === 2);

    // Prepared combination chips
    const prepFlags = [];
    if (state.flags.flg_rusted_key_oiled) prepFlags.push('🛢️ 녹슨 열쇠 윤활 완료');
    if (state.flags.flg_copper_key_oiled) prepFlags.push('🛢️ 구리 열쇠 윤활 완료');
    if (state.flags.flg_book_soaked_alcohol) prepFlags.push('🔥 책+알코올 착화 연료 준비');
    if (state.flags.flg_ceiling_kit_ready) prepFlags.push('🪜 사다리+드라이버 세트 준비');
    $('prepared-flags').innerHTML = prepFlags.map((txt) => `<span class="prep-chip">${escapeHtml(txt)}</span>`).join('');

    const grid = $('inventory-grid');
    if (state.inventory.length === 0) {
      grid.innerHTML = '<div style="font-size:12px; color:var(--text-dim);">소지품이 비어 있습니다.</div>';
      return;
    }

    grid.innerHTML = state.inventory
      .map((itemId) => {
        const it = engine.getItem(itemId);
        if (!it) return '';
        const cat = CATEGORY_META[it.category] || { icon: '📦', label: it.category };
        const isSelected = uiState.selectedUseItemId === itemId;
        const isCombinePicked = uiState.combineSelection.includes(itemId);
        return `
          <div class="item-card ${isSelected ? 'selected' : ''} ${
            isCombinePicked ? 'combine-picked' : ''
          }" data-item-card="${escapeHtml(itemId)}">
            <div class="item-card-top">
              <span class="item-name">${cat.icon} ${escapeHtml(it.nameKo)}</span>
              <span class="item-cat">${cat.label}</span>
            </div>
            <div class="item-purpose" title="${escapeHtml(it.purposeKo)}">${escapeHtml(it.purposeKo)}</div>
            <div class="item-card-actions">
              <button type="button" data-use-item="${escapeHtml(itemId)}">${isSelected ? '선택됨' : '사용'}</button>
              <button type="button" data-inspect-item="${escapeHtml(itemId)}">열람</button>
            </div>
          </div>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-item-card]').forEach((card) => {
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const id = card.getAttribute('data-item-card');
        if (uiState.combineMode) {
          toggleCombinePick(id);
        } else {
          uiState.selectedUseItemId = uiState.selectedUseItemId === id ? null : id;
          renderAll();
        }
      });
    });

    grid.querySelectorAll('[data-use-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-use-item');
        uiState.combineMode = false;
        uiState.combineSelection = [];
        uiState.selectedUseItemId = uiState.selectedUseItemId === id ? null : id;
        renderAll();
      });
    });

    grid.querySelectorAll('[data-inspect-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        engine.inspectItem(btn.getAttribute('data-inspect-item'));
        renderAll();
      });
    });
  }

  function renderSurvivors(state, summary) {
    $('survivor-summary').textContent = `구출 ${summary.rescuedCount}/${summary.totalIncidents} · 피해 ${summary.compromisedCount}명`;
    const grid = $('survivor-grid');
    const cast = engine.data.characters.filter((c) => c.role !== 'backstory_victim');
    grid.innerHTML = cast
      .map((c) => {
        const st = state.characterStates[c.id];
        const locId = state.characterLocations[c.id];
        const locRoom = locId ? engine.getRoom(locId) : null;
        return `
          <div class="survivor-tile status-${escapeHtml(st)}" data-bio-char="${escapeHtml(c.id)}" title="${escapeHtml(
            `${c.affiliation} — ${c.keyTraits}`
          )}">
            <div class="survivor-head">
              <span>${escapeHtml(c.nameKo.split(' ').pop())}</span>
              <span class="survivor-badge badge-${escapeHtml(st)}">${escapeHtml(STATUS_LABELS[st] || st)}</span>
            </div>
            <div class="survivor-loc">${escapeHtml(locRoom ? locRoom.nameKo : st === 'compromised' ? '소재 불명' : '-')}</div>
          </div>
        `;
      })
      .join('');

    grid.querySelectorAll('[data-bio-char]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const ch = engine.getCharacter(tile.getAttribute('data-bio-char'));
        if (!ch) return;
        const st = engine.getState().characterStates[ch.id];
        const loc = engine.getState().characterLocations[ch.id];
        const locRoom = loc ? engine.getRoom(loc) : null;
        $('dialogue-title').textContent = `📋 인물 정보 — ${ch.nameKo} (${ch.nameJa})`;
        $('dialogue-body').textContent = `[${ch.affiliation}] 상태: ${STATUS_LABELS[st] || st} · 추정 위치: ${
          locRoom ? locRoom.nameKo : '소재 불명'
        } — ${ch.keyTraits}`;
        $('dialogue-choices').innerHTML = '';
        openModal('modal-dialogue');
      });
    });
  }

  function toggleCombinePick(itemId) {
    const idx = uiState.combineSelection.indexOf(itemId);
    if (idx !== -1) {
      uiState.combineSelection.splice(idx, 1);
    } else if (uiState.combineSelection.length < 2) {
      uiState.combineSelection.push(itemId);
    } else {
      uiState.combineSelection = [uiState.combineSelection[1], itemId];
    }
    renderInventory(engine.getState());
  }

  function handleHotspotClick(hotspotId) {
    if (!hotspotId) return;
    if (uiState.selectedUseItemId) {
      const itemId = uiState.selectedUseItemId;
      engine.useItemOnHotspot(itemId, hotspotId);
      uiState.selectedUseItemId = null;
      renderAll();
      return;
    }

    const res = engine.inspectHotspot(hotspotId);
    if (res && res.action === 'open_keypad') {
      openKeypadModal(res.puzzleId);
    }
    renderAll();
  }

  // Keypad Modal Logic
  function openKeypadModal(puzzleId) {
    uiState.keypadPuzzleId = puzzleId;
    uiState.keypadInput = '';
    const hasMemo = engine.getState().inventory.includes('item_clue_memo_3_2');
    $('keypad-hint').textContent = hasMemo
      ? '단서 메모 확인됨: 3-2 교실 메모에 기록된 4자리 번호(3-8-7-8)를 입력하세요.'
      : '4자리 비밀번호를 입력하세요. (5F 3-2 교실과 이과 실험실에서 번호 단서를 찾을 수 있습니다.)';
    updateKeypadDisplay();
    openModal('modal-keypad');
  }

  function updateKeypadDisplay() {
    const padded = uiState.keypadInput.padEnd(4, '-');
    $('keypad-display').textContent = padded;
  }

  function submitKeypad() {
    if (!uiState.keypadPuzzleId) return;
    const res = engine.submitPuzzleCode(uiState.keypadPuzzleId, uiState.keypadInput);
    if (res.ok && res.solved) {
      closeModal('modal-keypad');
      uiState.keypadPuzzleId = null;
      uiState.keypadInput = '';
    } else {
      uiState.keypadInput = '';
      updateKeypadDisplay();
    }
    renderAll();
  }

  // Dialogue & Incident Modals
  function openCharacterDialogue(charId) {
    const dlg = engine.getCharacterDialogue(charId);
    if (!dlg) return;
    $('dialogue-title').textContent = dlg.isIncident
      ? `⚠️ 긴급 대응 — ${dlg.characterNameKo}`
      : `💬 대화 — ${dlg.characterNameKo}`;
    $('dialogue-body').textContent = dlg.promptKo;
    const choicesEl = $('dialogue-choices');
    choicesEl.innerHTML = dlg.choices
      .map(
        (c) =>
          `<button type="button" class="choice-btn ${dlg.isIncident && c.index === 0 ? 'btn-gold' : ''}" data-choice-idx="${
            c.index
          }">${escapeHtml(c.labelKo)}</button>`
      )
      .join('');
    choicesEl.querySelectorAll('[data-choice-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.getAttribute('data-choice-idx'));
        engine.talkToCharacter(charId, idx);
        closeModal('modal-dialogue');
        renderAll();
      });
    });
    openModal('modal-dialogue');
  }

  function openIncidentDialogue(incidentId) {
    const inc = engine.getIncident(incidentId);
    if (!inc) return;
    openCharacterDialogue(inc.targetCharacterId);
  }

  // Save / Load Modal
  function renderSaveSlotsModal() {
    const slots = safeStorageGet(STORAGE_SLOTS_KEY, {});
    const auto = safeStorageGet(STORAGE_AUTO_KEY, null);
    const listEl = $('save-slot-list');

    let html = '';
    if (auto) {
      html += `
        <div class="save-slot-row" style="border-color:rgba(56,189,248,0.5);">
          <div class="save-slot-meta">
            <strong>⚡ 자동 체크포인트 (${escapeHtml(auto.roomNameKo)})</strong>
            ${auto.floor}F · 틱 ${auto.ticks} · 퍼즐 ${auto.solved}/16 · ${escapeHtml(auto.savedAt)}
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-accent" data-load-auto="1">불러오기</button>
          </div>
        </div>
      `;
    }

    for (let i = 1; i <= MANUAL_SLOT_COUNT; i++) {
      const slot = slots[String(i)];
      html += `
        <div class="save-slot-row">
          <div class="save-slot-meta">
            <strong>슬롯 ${i} ${slot ? `— ${escapeHtml(slot.roomNameKo)}` : '— (비어 있음)'}</strong>
            ${
              slot
                ? `${slot.floor}F · 틱 ${slot.ticks} · 퍼즐 ${slot.solved}/16 · ${escapeHtml(slot.savedAt)}`
                : '중요 분기 직전에 저장해 두세요.'
            }
          </div>
          <div style="display:flex; gap:6px;">
            <button type="button" class="btn-gold" data-save-slot="${i}">저장</button>
            <button type="button" class="btn-accent" data-load-slot="${i}" ${slot ? '' : 'disabled'}>불러오기</button>
            <button type="button" class="btn-danger" data-del-slot="${i}" ${slot ? '' : 'disabled'}>삭제</button>
          </div>
        </div>
      `;
    }
    listEl.innerHTML = html;

    listEl.querySelectorAll('[data-load-auto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!auto || !auto.payload) return;
        engine.deserialize(auto.payload);
        uiState.viewedFloor = engine.getState().currentFloor;
        uiState.lastEndingShown = engine.getState().endingId;
        closeModal('modal-save');
        renderAll();
      });
    });

    listEl.querySelectorAll('[data-save-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-save-slot');
        const st = engine.getState();
        const room = engine.getCurrentRoom();
        const curSlots = safeStorageGet(STORAGE_SLOTS_KEY, {});
        curSlots[idx] = {
          savedAt: new Date().toLocaleString('ko-KR'),
          roomNameKo: room ? room.nameKo : st.currentRoomId,
          floor: st.currentFloor,
          ticks: st.actionTicks,
          solved: st.solvedPuzzles.length,
          payload: engine.serialize(),
        };
        safeStorageSet(STORAGE_SLOTS_KEY, curSlots);
        renderSaveSlotsModal();
      });
    });

    listEl.querySelectorAll('[data-load-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-load-slot');
        const curSlots = safeStorageGet(STORAGE_SLOTS_KEY, {});
        if (!curSlots[idx]) return;
        engine.deserialize(curSlots[idx].payload);
        uiState.viewedFloor = engine.getState().currentFloor;
        uiState.selectedUseItemId = null;
        uiState.lastEndingShown = engine.getState().endingId;
        closeModal('modal-save');
        renderAll();
      });
    });

    listEl.querySelectorAll('[data-del-slot]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = btn.getAttribute('data-del-slot');
        const curSlots = safeStorageGet(STORAGE_SLOTS_KEY, {});
        delete curSlots[idx];
        safeStorageSet(STORAGE_SLOTS_KEY, curSlots);
        renderSaveSlotsModal();
      });
    });
  }

  // Ending & Archive Modal
  function openEndingModal(fromEndingReached) {
    const state = engine.getState();
    const summary = engine.getProgressSummary();
    const ending = state.endingId ? engine.getEnding(state.endingId) : null;
    const unlocked = getUnlockedEndings();

    const curSec = $('ending-current-section');
    if (ending) {
      const tierLabel = ending.tier === 'happy' ? 'HAPPY ENDING' : ending.tier === 'normal' ? 'NORMAL ENDING' : 'BAD ENDING';
      curSec.innerHTML = `
        <span class="ending-tier-badge tier-${escapeHtml(ending.tier)}">${tierLabel}</span>
        <h4 style="margin:4px 0 6px; font-size:18px; color:var(--text-main);">${escapeHtml(ending.nameKo)}</h4>
        <p style="margin:0; font-size:13.5px; color:var(--text-muted);">${escapeHtml(ending.summaryKo)}</p>
        <div class="ending-stats">
          <div class="ending-stat-box">해결한 퍼즐<strong>${summary.solvedPuzzles} / ${summary.totalPuzzles}</strong></div>
          <div class="ending-stat-box">구출 / 피해<strong>${summary.rescuedCount}명 구출 · ${summary.compromisedCount}명 피해</strong></div>
          <div class="ending-stat-box">총 행동 틱<strong>${summary.actionTicks} Ticks</strong></div>
          <div class="ending-stat-box">미유키 신뢰도<strong>♥ ${summary.miyukiAffection}</strong></div>
        </div>
      `;
    } else if (!fromEndingReached) {
      curSec.innerHTML = `<p style="margin:0; font-size:13px; color:var(--text-muted);">현재 탐색 진행 중입니다. 지금까지 해금한 엔딩은 <strong>${unlocked.length} / ${engine.data.endings.length}</strong>종입니다.</p>`;
    }

    $('ending-archive-list').innerHTML = engine.data.endings
      .map((e) => {
        const isOpen = unlocked.includes(e.id);
        return `
          <div class="ending-archive-item ${isOpen ? 'unlocked' : ''}">
            <strong>${isOpen ? '★' : '🔒'} ${escapeHtml(e.nameKo)}</strong>
            ${isOpen ? ` — ${escapeHtml(e.summaryKo)}` : ' — 미해금'}
          </div>
        `;
      })
      .join('');

    openModal('modal-ending');
  }

  // Wire static controls once
  function initBindings() {
    // Keypad buttons 1..9, 0
    const keypadGrid = $('keypad-grid');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'];
    keypadGrid.innerHTML = keys
      .map((k) => `<button type="button" class="keypad-key" data-k="${k}">${k}</button>`)
      .join('');
    keypadGrid.querySelectorAll('[data-k]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = btn.getAttribute('data-k');
        if (k === '←') {
          uiState.keypadInput = uiState.keypadInput.slice(0, -1);
          updateKeypadDisplay();
        } else if (k === '✓') {
          submitKeypad();
        } else if (uiState.keypadInput.length < 4) {
          uiState.keypadInput += k;
          updateKeypadDisplay();
        }
      });
    });

    $('keypad-clear').addEventListener('click', () => {
      uiState.keypadInput = '';
      updateKeypadDisplay();
    });
    $('keypad-submit').addEventListener('click', submitKeypad);

    // Keyboard input for Keypad modal & Escape close
    document.addEventListener('keydown', (ev) => {
      if ($('modal-keypad').classList.contains('open')) {
        if (/^[0-9]$/.test(ev.key) && uiState.keypadInput.length < 4) {
          uiState.keypadInput += ev.key;
          updateKeypadDisplay();
        } else if (ev.key === 'Backspace') {
          uiState.keypadInput = uiState.keypadInput.slice(0, -1);
          updateKeypadDisplay();
        } else if (ev.key === 'Enter') {
          submitKeypad();
        } else if (ev.key === 'Escape') {
          closeModal('modal-keypad');
        }
        return;
      }
      if (ev.key === 'Escape') {
        ['modal-dialogue', 'modal-save', 'modal-ending', 'modal-guide'].forEach(closeModal);
      }
    });

    // Modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
    });

    // Top HUD actions
    $('btn-cancel-use').addEventListener('click', () => {
      uiState.selectedUseItemId = null;
      renderAll();
    });

    $('btn-toggle-combine').addEventListener('click', () => {
      uiState.combineMode = !uiState.combineMode;
      uiState.combineSelection = [];
      uiState.selectedUseItemId = null;
      renderAll();
    });

    $('btn-exec-combine').addEventListener('click', () => {
      if (uiState.combineSelection.length !== 2) return;
      const [a, b] = uiState.combineSelection;
      engine.combineItems(a, b);
      uiState.combineSelection = [];
      uiState.combineMode = false;
      renderAll();
    });

    $('btn-save-load').addEventListener('click', () => {
      renderSaveSlotsModal();
      openModal('modal-save');
    });

    $('btn-archive').addEventListener('click', () => openEndingModal(false));
    $('btn-guide').addEventListener('click', () => openModal('modal-guide'));

    const doRestart = () => {
      engine.reset();
      uiState.viewedFloor = engine.getState().currentFloor;
      uiState.selectedUseItemId = null;
      uiState.combineMode = false;
      uiState.combineSelection = [];
      uiState.lastEndingShown = null;
      closeModal('modal-ending');
      renderAll();
    };

    $('btn-reset').addEventListener('click', doRestart);
    $('ending-btn-restart').addEventListener('click', doRestart);
    $('ending-btn-load').addEventListener('click', () => {
      closeModal('modal-ending');
      renderSaveSlotsModal();
      openModal('modal-save');
    });
  }

  initBindings();
  renderAll();
})();
