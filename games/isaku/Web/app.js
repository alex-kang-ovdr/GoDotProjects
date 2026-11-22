// Interactive Web Frontend for 유작 (遺作 / Isaku) — Phase 2 Elevated Edition
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

  // Explicit clean map coordinates (420 x 255 viewBox) for all 33 canonical rooms
  const MAP_COORDS = {
    // 6F Clock Tower
    rm_clock_tower: { x: 210, y: 124, short: '시계탑 (6F)' },
    // 5F (7 rooms)
    rm_5f_music: { x: 58, y: 46, short: '음악실' },
    rm_5f_class_3_1: { x: 158, y: 46, short: '3-1 교실' },
    rm_5f_class_3_2: { x: 262, y: 46, short: '3-2 교실' },
    rm_5f_science: { x: 362, y: 46, short: '이과실험실' },
    rm_5f_hall: { x: 210, y: 130, short: '5F 복도' },
    rm_5f_restroom_m: { x: 126, y: 214, short: '남 화장실' },
    rm_5f_restroom_f: { x: 294, y: 214, short: '여 화장실' },
    // 4F (6 rooms)
    rm_4f_storage: { x: 84, y: 48, short: '소실/창고' },
    rm_4f_craft: { x: 210, y: 48, short: '공작실' },
    rm_4f_av: { x: 336, y: 48, short: '시청각실' },
    rm_4f_hall: { x: 210, y: 130, short: '4F 복도' },
    rm_4f_class_2_3: { x: 126, y: 214, short: '2-3 교실' },
    rm_4f_electrical: { x: 294, y: 214, short: '배전반' },
    // 3F (9 rooms — includes canonical 2-1, 2-2, Men's Restroom)
    rm_3f_broadcast: { x: 56, y: 44, short: '방송실' },
    rm_3f_broadcast_prep: { x: 148, y: 44, short: '방송창고' },
    rm_3f_library: { x: 250, y: 44, short: '도서실' },
    rm_3f_class_2_1: { x: 354, y: 44, short: '2-1 교실' },
    rm_3f_hall: { x: 210, y: 130, short: '3F 복도' },
    rm_3f_dead_end: { x: 56, y: 216, short: '막다른복도' },
    rm_3f_class_2_2: { x: 158, y: 216, short: '2-2 교실' },
    rm_3f_restroom_m: { x: 262, y: 216, short: '남 화장실' },
    rm_3f_restroom_f: { x: 362, y: 216, short: '여 화장실' },
    // 2F (6 rooms — includes 1-3 Classroom)
    rm_2f_class_1_1: { x: 84, y: 48, short: '1-1 교실' },
    rm_2f_class_1_2: { x: 210, y: 48, short: '1-2 교실' },
    rm_2f_class_1_3: { x: 336, y: 48, short: '1-3 교실' },
    rm_2f_hall: { x: 210, y: 130, short: '2F 복도' },
    rm_2f_restroom_m: { x: 126, y: 214, short: '남 화장실' },
    rm_2f_kitchen: { x: 294, y: 214, short: '급식실' },
    // 1F (3 rooms)
    rm_1f_hall: { x: 210, y: 74, short: '1F 복도' },
    rm_1f_entrance: { x: 110, y: 186, short: '현관(봉쇄)' },
    rm_1f_infirmary: { x: 310, y: 186, short: '보건실' },
    // 0F Exterior
    rm_escape_exit: { x: 210, y: 124, short: '외부 탈출구' },
  };

  // Portrait palette & atmospheric silhouette attributes per cast member
  const PORTRAIT_THEMES = {
    char_miyuki: {
      bg: '#131632',
      glow: '#818cf8',
      hair: '#1e1b4b',
      hairStyle: 'long',
      accent: '#a78bfa',
      collar: '#312e81',
      accessory: 'sharp_gaze',
    },
    char_kotomi: {
      bg: '#271324',
      glow: '#f472b6',
      hair: '#4a2511',
      hairStyle: 'wavy',
      accent: '#fb7185',
      collar: '#831843',
      accessory: 'ribbon',
    },
    char_kumi: {
      bg: '#0f2229',
      glow: '#38bdf8',
      hair: '#292524',
      hairStyle: 'bun',
      accent: '#38bdf8',
      collar: '#1e3a5f',
      accessory: 'blazer',
    },
    char_rika: {
      bg: '#102124',
      glow: '#2dd4bf',
      hair: '#3f2c22',
      hairStyle: 'bob',
      accent: '#5eead4',
      collar: '#134e4a',
      accessory: 'glasses',
    },
    char_akemi: {
      bg: '#291216',
      glow: '#f87171',
      hair: '#3b1512',
      hairStyle: 'ponytail',
      accent: '#ef4444',
      collar: '#7f1d1d',
      accessory: 'headband',
    },
    char_mio: {
      bg: '#231b0e',
      glow: '#fbbf24',
      hair: '#451a03',
      hairStyle: 'short',
      accent: '#f59e0b',
      collar: '#78350f',
      accessory: 'sporty',
    },
    char_jinpachi: {
      bg: '#141e2e',
      glow: '#60a5fa',
      hair: '#1f2937',
      hairStyle: 'spiky',
      accent: '#3b82f6',
      collar: '#1e3a8a',
      accessory: 'camera',
    },
    char_soga: {
      bg: '#1e162e',
      glow: '#c084fc',
      hair: '#18181b',
      hairStyle: 'slick',
      accent: '#c084fc',
      collar: '#4c1d95',
      accessory: 'ascot',
    },
    char_isaku: {
      bg: '#1c0909',
      glow: '#dc2626',
      hair: '#27272a',
      hairStyle: 'cap',
      accent: '#ef4444',
      collar: '#3f1515',
      accessory: 'shadow_cap',
    },
    char_kenta: {
      bg: '#0d1d30',
      glow: '#38bdf8',
      hair: '#1e293b',
      hairStyle: 'short',
      accent: '#38bdf8',
      collar: '#1e3a5f',
      accessory: 'none',
    },
  };

  const engine = globalThis.IsakuEngine.createEngine(globalThis.ISAKU_DATA);

  const uiState = {
    viewedFloor: 5,
    pinnedRoomId: null,
    hoveredHotspotId: null,
    selectedUseItemId: null,
    combineMode: false,
    combineSelection: [],
    keypadPuzzleId: null,
    keypadInput: '',
    cipherSlotA: '',
    cipherSlotB: '',
    cipherFeedbackText: '표에서 좌표 2개를 선택해 교차 해독하거나, 수집한 메모 좌표 칩을 클릭하세요.',
    cipherFeedbackMatched: false,
    hintShowSpoiler: false,
    lastHintTargetRoomId: null,
    lastEndingShown: null,
    lastAutoSaveKey: '',
    flashlightPos: { x: 50, y: 46 },
  };

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

  // Atmospheric Character Portrait SVG Generator
  function renderCharacterPortraitSvg(charId, charStatus) {
    const t = PORTRAIT_THEMES[charId] || PORTRAIT_THEMES.char_kenta;
    const isRisk = charStatus === 'at_risk';
    const isHostile = charStatus === 'hostile';
    const auraColor = isRisk ? '#ef4444' : isHostile ? '#dc2626' : t.glow;

    let hairBack = '';
    let hairFront = '';
    let accSvg = '';

    if (t.hairStyle === 'long') {
      hairBack = `<path d="M24 58 Q22 108 32 132 L88 132 Q98 108 96 58 Q92 22 60 22 Q28 22 24 58 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M32 52 Q45 30 60 36 Q75 30 88 52 Q84 36 60 32 Q36 36 32 52 Z" fill="${t.hair}"/>`;
    } else if (t.hairStyle === 'wavy') {
      hairBack = `<path d="M24 62 Q18 96 30 126 L90 126 Q102 96 96 62 Q92 24 60 24 Q28 24 24 62 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M34 50 Q50 32 60 38 Q70 32 86 50 Q80 34 60 32 Q40 34 34 50 Z" fill="${t.hair}"/>`;
    } else if (t.hairStyle === 'bun') {
      hairBack = `<circle cx="60" cy="20" r="14" fill="${t.hair}"/><path d="M28 56 Q28 26 60 26 Q92 26 92 56 L88 80 L32 80 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M34 48 Q60 30 86 48 Q74 36 60 36 Q46 36 34 48 Z" fill="${t.hair}"/>`;
    } else if (t.hairStyle === 'ponytail') {
      hairBack = `<path d="M78 32 Q108 42 102 92 Q90 80 86 54 Z" fill="${t.hair}"/><path d="M30 56 Q32 24 60 24 Q88 24 90 56 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M34 50 Q60 34 86 50 Q72 34 60 34 Q48 34 34 50 Z" fill="${t.hair}"/>`;
    } else if (t.hairStyle === 'bob') {
      hairBack = `<path d="M26 56 Q24 88 38 98 L82 98 Q96 88 94 56 Q90 24 60 24 Q30 24 26 56 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M33 48 Q60 36 87 48 Q75 34 60 34 Q45 34 33 48 Z" fill="${t.hair}"/>`;
    } else if (t.hairStyle === 'cap') {
      hairBack = `<path d="M28 52 Q30 26 60 26 Q90 26 92 52 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M24 48 Q60 34 96 48 L92 40 Q60 22 28 40 Z" fill="#18181b" stroke="#52525b" stroke-width="1.2"/>`;
    } else {
      hairBack = `<path d="M30 54 Q32 24 60 24 Q88 24 90 54 Z" fill="${t.hair}"/>`;
      hairFront = `<path d="M33 48 L44 35 L54 44 L66 33 L76 44 L87 48 Q76 30 60 30 Q44 30 33 48 Z" fill="${t.hair}"/>`;
    }

    if (t.accessory === 'ribbon') {
      accSvg = `<polygon points="82,30 96,24 94,38" fill="#ef4444"/><polygon points="82,30 70,22 72,36" fill="#f43f5e"/><circle cx="82" cy="30" r="3.5" fill="#fde68a"/>`;
    } else if (t.accessory === 'glasses') {
      accSvg = `<rect x="40" y="55" width="16" height="10" rx="3" fill="none" stroke="#94a3b8" stroke-width="1.6"/><rect x="64" y="55" width="16" height="10" rx="3" fill="none" stroke="#94a3b8" stroke-width="1.6"/><line x1="56" y1="60" x2="64" y2="60" stroke="#94a3b8" stroke-width="1.6"/>`;
    } else if (t.accessory === 'headband') {
      accSvg = `<path d="M32 44 Q60 34 88 44" fill="none" stroke="#ef4444" stroke-width="4" stroke-linecap="round"/>`;
    } else if (t.accessory === 'camera') {
      accSvg = `<line x1="40" y1="98" x2="54" y2="132" stroke="#94a3b8" stroke-width="2.5"/><line x1="80" y1="98" x2="66" y2="132" stroke="#94a3b8" stroke-width="2.5"/><rect x="49" y="114" width="22" height="14" rx="3" fill="#1e293b" stroke="#60a5fa"/><circle cx="60" cy="121" r="4" fill="#38bdf8"/>`;
    } else if (t.accessory === 'ascot') {
      accSvg = `<polygon points="60,96 50,118 60,126 70,118" fill="#a855f7" opacity="0.85"/>`;
    } else if (t.accessory === 'shadow_cap') {
      accSvg = `<rect x="34" y="49" width="52" height="17" rx="4" fill="#09090b" opacity="0.72"/><circle cx="48" cy="59" r="2.2" fill="#ef4444"/><circle cx="72" cy="59" r="2.2" fill="#ef4444"/>`;
    }

    const eyeSvg =
      t.accessory === 'shadow_cap'
        ? ''
        : `<ellipse cx="48" cy="60" rx="3.4" ry="2.6" fill="#0f172a"/><ellipse cx="72" cy="60" rx="3.4" ry="2.6" fill="#0f172a"/><circle cx="49" cy="59" r="1" fill="#e2e8f0"/><circle cx="73" cy="59" r="1" fill="#e2e8f0"/>`;

    return `
      <defs>
        <radialGradient id="portGlow_${escapeHtml(charId)}" cx="50%" cy="38%" r="58%">
          <stop offset="0%" stop-color="${auraColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${t.bg}" stop-opacity="1"/>
        </radialGradient>
      </defs>
      <rect width="120" height="140" fill="url(#portGlow_${escapeHtml(charId)})"/>
      ${isRisk ? '<rect width="120" height="140" fill="#dc2626" opacity="0.16"/>' : ''}
      ${hairBack}
      <path d="M18 140 Q24 98 60 96 Q96 98 102 140 Z" fill="${t.collar}" stroke="${t.accent}" stroke-opacity="0.45"/>
      <polygon points="48,96 60,118 72,96" fill="#e2e8f0" opacity="0.85"/>
      <rect x="53" y="80" width="14" height="18" rx="5" fill="#f1d5c4"/>
      <ellipse cx="60" cy="60" rx="23" ry="26" fill="#f5dfd0"/>
      ${eyeSvg}
      <path d="M54 74 Q60 ${isRisk ? '70' : '77'} 66 74" fill="none" stroke="#9a5c52" stroke-width="1.8" stroke-linecap="round"/>
      ${hairFront}
      ${accSvg}
      <rect x="2" y="2" width="116" height="136" rx="8" fill="none" stroke="${auraColor}" stroke-opacity="0.4" stroke-width="1.5"/>
    `;
  }

  // Per-Room & Zone Atmospheric SVG Room Illustration Renderer
  function buildRoomPropsSvg(room) {
    const id = room.id;
    const zone = room.zoneType;

    if (id === 'rm_5f_music') {
      return `
        <rect x="52" y="58" width="175" height="160" fill="#101f36" stroke="#334155" stroke-width="2"/>
        <line x1="50" y1="98" x2="230" y2="115" stroke="#78350f" stroke-width="10"/>
        <line x1="50" y1="158" x2="230" y2="144" stroke="#78350f" stroke-width="10"/>
        <path d="M265 280 L265 182 Q345 162 435 198 L452 280 Z" fill="#0f172a" stroke="#475569" stroke-width="2"/>
        <rect x="275" y="220" width="142" height="16" fill="#cbd5e1"/>
        <g fill="#0f172a">
          <rect x="288" y="220" width="8" height="10"/><rect x="306" y="220" width="8" height="10"/>
          <rect x="332" y="220" width="8" height="10"/><rect x="350" y="220" width="8" height="10"/>
          <rect x="368" y="220" width="8" height="10"/><rect x="394" y="220" width="8" height="10"/>
        </g>
        <rect x="528" y="88" width="108" height="206" fill="#172033" stroke="#475569" stroke-width="2.5"/>
        <circle cx="546" cy="196" r="5" fill="#f59e0b"/>
      `;
    }

    if (id === 'rm_5f_science') {
      return `
        <rect x="92" y="70" width="128" height="222" fill="#0f1b2e" stroke="#334155" stroke-width="2"/>
        <circle cx="155" cy="116" r="18" fill="#cbd5e1" opacity="0.82"/>
        <line x1="155" y1="134" x2="155" y2="215" stroke="#cbd5e1" stroke-width="5" opacity="0.78"/>
        <line x1="128" y1="154" x2="182" y2="154" stroke="#cbd5e1" stroke-width="4" opacity="0.78"/>
        <line x1="134" y1="174" x2="176" y2="174" stroke="#cbd5e1" stroke-width="3" opacity="0.7"/>
        <line x1="138" y1="194" x2="172" y2="194" stroke="#cbd5e1" stroke-width="3" opacity="0.7"/>
        <rect x="272" y="168" width="380" height="24" fill="#1e293b" stroke="#475569" stroke-width="2"/>
        <rect x="292" y="192" width="18" height="102" fill="#1e293b"/>
        <rect x="615" y="192" width="18" height="102" fill="#1e293b"/>
        <rect x="328" y="224" width="96" height="66" fill="#452c1e" stroke="#92400e" stroke-width="2"/>
        <rect x="530" y="138" width="22" height="30" rx="4" fill="#38bdf8" opacity="0.35"/>
      `;
    }

    if (id === 'rm_5f_restroom_m') {
      return `
        <rect x="52" y="64" width="132" height="230" fill="#132030" stroke="#334155" stroke-width="2"/>
        <rect x="195" y="128" width="114" height="134" rx="6" fill="#1b2638" stroke="#64748b" stroke-width="3"/>
        <rect x="220" y="150" width="64" height="24" fill="#050910" stroke="#38bdf8"/>
        <circle cx="252" cy="206" r="18" fill="#0f172a" stroke="#94a3b8" stroke-width="2"/>
        <rect x="435" y="132" width="120" height="126" rx="4" fill="#131c2b" stroke="#475569" stroke-width="2" stroke-dasharray="5 3"/>
        <circle cx="448" cy="145" r="3" fill="#94a3b8"/><circle cx="542" cy="145" r="3" fill="#94a3b8"/>
        <circle cx="448" cy="245" r="3" fill="#94a3b8"/><circle cx="542" cy="245" r="3" fill="#94a3b8"/>
      `;
    }

    if (id === 'rm_4f_craft') {
      return `
        <rect x="90" y="88" width="150" height="190" fill="#131c2e" stroke="#334155"/>
        <rect x="480" y="88" width="150" height="190" fill="#131c2e" stroke="#334155"/>
        <rect x="306" y="220" width="108" height="74" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
        <ellipse cx="360" cy="138" rx="22" ry="25" fill="#cbd5e1" opacity="0.88"/>
        <path d="M326 220 Q328 164 360 162 Q392 164 394 220 Z" fill="#e2e8f0" opacity="0.82"/>
        <path d="M352 152 L364 176 L378 158" fill="none" stroke="#475569" stroke-width="4" stroke-linecap="round"/>
      `;
    }

    if (id === 'rm_3f_broadcast') {
      return `
        <rect x="112" y="102" width="66" height="194" fill="none" stroke="#92400e" stroke-width="7"/>
        <line x1="112" y1="138" x2="178" y2="138" stroke="#b45309" stroke-width="5"/>
        <line x1="112" y1="178" x2="178" y2="178" stroke="#b45309" stroke-width="5"/>
        <line x1="112" y1="218" x2="178" y2="218" stroke="#b45309" stroke-width="5"/>
        <line x1="112" y1="258" x2="178" y2="258" stroke="#b45309" stroke-width="5"/>
        <rect x="242" y="185" width="236" height="106" fill="#172033" stroke="#475569" stroke-width="2"/>
        <rect x="262" y="200" width="196" height="36" fill="#0b1322" stroke="#38bdf8" stroke-opacity="0.5"/>
        <circle cx="565" cy="112" r="28" fill="#0f172a" stroke="#94a3b8" stroke-width="2.5"/>
        <line x1="565" y1="112" x2="565" y2="94" stroke="#e2e8f0" stroke-width="2.5"/>
        <line x1="565" y1="112" x2="580" y2="116" stroke="#f59e0b" stroke-width="2"/>
        <rect x="526" y="152" width="78" height="92" fill="#1e293b" stroke="#a78bfa" stroke-width="1.5"/>
      `;
    }

    if (id === 'rm_3f_library') {
      return `
        <rect x="78" y="64" width="225" height="230" fill="#231914" stroke="#78350f" stroke-width="3"/>
        <line x1="78" y1="120" x2="303" y2="120" stroke="#78350f" stroke-width="4"/>
        <line x1="78" y1="176" x2="303" y2="176" stroke="#78350f" stroke-width="4"/>
        <line x1="78" y1="232" x2="303" y2="232" stroke="#78350f" stroke-width="4"/>
        <rect x="405" y="198" width="225" height="94" fill="#1a2234" stroke="#475569" stroke-width="2"/>
        <rect x="445" y="176" width="52" height="22" fill="#7c2d12" stroke="#f59e0b"/>
      `;
    }

    if (id === 'rm_3f_dead_end') {
      return `
        <polygon points="0,0 220,90 220,280 0,380" fill="#0d1526" stroke="#1e293b" stroke-width="1.5"/>
        <polygon points="720,0 500,90 500,280 720,380" fill="#0d1526" stroke="#1e293b" stroke-width="1.5"/>
        <rect x="220" y="90" width="280" height="190" fill="#0a111f" stroke="#334155" stroke-width="2"/>
        <rect x="295" y="42" width="130" height="40" rx="4" fill="#1e293b" stroke="#f59e0b" stroke-width="2"/>
        <circle cx="360" cy="68" r="6" fill="#fde68a"/>
      `;
    }

    if (id === 'rm_2f_kitchen') {
      return `
        <rect x="70" y="156" width="165" height="136" fill="#172033" stroke="#475569" stroke-width="2"/>
        <rect x="485" y="156" width="165" height="136" fill="#172033" stroke="#475569" stroke-width="2"/>
        <rect x="344" y="44" width="32" height="100" fill="#1e293b" stroke="#475569"/>
        <rect x="292" y="142" width="136" height="152" rx="10" fill="#18181b" stroke="#71717a" stroke-width="3"/>
        <rect x="320" y="182" width="80" height="62" rx="6" fill="#2b0d0d" stroke="#f97316" stroke-width="2"/>
      `;
    }

    if (id === 'rm_1f_infirmary') {
      return `
        <rect x="68" y="190" width="270" height="98" rx="6" fill="#1e293b" stroke="#64748b" stroke-width="2"/>
        <rect x="82" y="176" width="70" height="24" rx="5" fill="#e2e8f0" opacity="0.8"/>
        <rect x="435" y="72" width="202" height="222" fill="#121a2a" stroke="#475569" stroke-width="2"/>
        <line x1="428" y1="120" x2="644" y2="140" stroke="#78350f" stroke-width="12"/>
        <line x1="428" y1="184" x2="644" y2="176" stroke="#92400e" stroke-width="12"/>
        <line x1="428" y1="242" x2="644" y2="256" stroke="#78350f" stroke-width="12"/>
      `;
    }

    if (zone === 'climax_zone') {
      return `
        <circle cx="240" cy="146" r="96" fill="#2a0a0a" stroke="#f59e0b" stroke-width="4" opacity="0.88"/>
        <circle cx="240" cy="146" r="78" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="6 10"/>
        <line x1="240" y1="146" x2="240" y2="80" stroke="#fde68a" stroke-width="4" stroke-linecap="round"/>
        <line x1="240" y1="146" x2="294" y2="162" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/>
        <rect x="492" y="76" width="10" height="240" fill="#78350f"/>
        <rect x="548" y="76" width="10" height="240" fill="#78350f"/>
        <g stroke="#b45309" stroke-width="6">
          <line x1="497" y1="115" x2="553" y2="115"/>
          <line x1="497" y1="155" x2="553" y2="155"/>
          <line x1="497" y1="195" x2="553" y2="195"/>
          <line x1="497" y1="235" x2="553" y2="235"/>
          <line x1="497" y1="275" x2="553" y2="275"/>
        </g>
      `;
    }

    if (zone === 'ending_trigger') {
      return `
        <circle cx="560" cy="84" r="34" fill="#e0f2fe" opacity="0.9"/>
        <circle cx="574" cy="76" r="30" fill="#071c28"/>
        <polygon points="360,380 260,210 460,210" fill="#34d399" opacity="0.18"/>
        <rect x="40" y="130" width="170" height="190" fill="#09101c" stroke="#1e293b"/>
        <path d="M0 320 L720 320 L720 380 L0 380 Z" fill="#0b1f22"/>
      `;
    }

    if (zone === 'corridor') {
      return `
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
    }

    if (zone === 'restroom') {
      return `
        <rect x="60" y="68" width="160" height="230" fill="#132030" stroke="#334155" stroke-width="2"/>
        <rect x="235" y="68" width="160" height="230" fill="#111c2b" stroke="#334155" stroke-width="2"/>
        <rect x="440" y="95" width="210" height="110" fill="#172538" stroke="#475569" stroke-width="2"/>
        <rect x="468" y="114" width="60" height="72" fill="#0c1522" stroke="#64748b"/>
        <rect x="562" y="114" width="60" height="72" fill="#0c1522" stroke="#64748b"/>
      `;
    }

    if (zone === 'utility') {
      return `
        <rect x="220" y="62" width="280" height="225" fill="#182130" stroke="#475569" stroke-width="3"/>
        <rect x="248" y="92" width="100" height="76" fill="#0c1320" stroke="#ef4444" stroke-width="1.5"/>
        <rect x="372" y="92" width="100" height="76" fill="#0c1320" stroke="#f59e0b" stroke-width="1.5"/>
        <path d="M298 112 L286 134 L302 134 L290 156" fill="none" stroke="#fde047" stroke-width="3"/>
        <ellipse cx="360" cy="322" rx="190" ry="26" fill="#7c2d12" opacity="0.45"/>
      `;
    }

    if (zone === 'trap_exit') {
      return `
        <rect x="210" y="54" width="300" height="260" fill="#0c1320" stroke="#475569" stroke-width="3"/>
        <line x1="360" y1="54" x2="360" y2="314" stroke="#334155" stroke-width="3"/>
        <line x1="205" y1="90" x2="515" y2="270" stroke="#92400e" stroke-width="14"/>
        <line x1="515" y1="90" x2="205" y2="270" stroke="#78350f" stroke-width="14"/>
        <circle cx="360" cy="180" r="24" fill="#450a0a" stroke="#ef4444" stroke-width="2"/>
        <text x="360" y="186" text-anchor="middle" fill="#fecaca" font-size="14" font-weight="bold">봉쇄</text>
      `;
    }

    if (zone === 'storage') {
      return `
        <rect x="75" y="150" width="150" height="140" fill="#1e293b" stroke="#475569" stroke-width="2"/>
        <rect x="115" y="110" width="95" height="60" fill="#293548" stroke="#64748b" stroke-width="1.5"/>
        <rect x="440" y="88" width="200" height="210" fill="#141e2e" stroke="#334155" stroke-width="2"/>
        <path d="M510 298 Q540 245 570 298 Z" fill="#05080f" stroke="#94a3b8" stroke-width="1.5"/>
      `;
    }

    if (zone === 'classroom') {
      return `
        <rect x="120" y="64" width="480" height="130" fill="#0f2922" stroke="#78350f" stroke-width="6"/>
        <rect x="145" y="232" width="110" height="58" fill="#1e293b" stroke="#475569"/>
        <rect x="305" y="232" width="110" height="58" fill="#1e293b" stroke="#475569"/>
        <rect x="465" y="232" width="110" height="58" fill="#1e293b" stroke="#475569"/>
      `;
    }

    return `
      <rect x="52" y="54" width="175" height="150" fill="#122138" stroke="#334155" stroke-width="2"/>
      <line x1="52" y1="95" x2="227" y2="112" stroke="#78350f" stroke-width="9"/>
      <line x1="52" y1="154" x2="227" y2="142" stroke="#78350f" stroke-width="9"/>
      <rect x="275" y="112" width="380" height="165" fill="#131c2e" stroke="#334155" stroke-width="2"/>
      <rect x="310" y="150" width="120" height="86" fill="#1e293b" stroke="#475569"/>
      <rect x="470" y="150" width="150" height="86" fill="#0d1524" stroke="#64748b"/>
    `;
  }

  function syncHotspotHover(hotspotId) {
    uiState.hoveredHotspotId = hotspotId;
    document.querySelectorAll('.svg-hotspot-node').forEach((n) => {
      n.classList.toggle('is-hovered', Boolean(hotspotId && n.getAttribute('data-hotspot-id') === hotspotId));
    });
    document.querySelectorAll('#hotspot-list [data-hs]').forEach((btn) => {
      btn.classList.toggle('is-hovered', Boolean(hotspotId && btn.getAttribute('data-hs') === hotspotId));
    });
  }

  function renderRoomStage(room, hotspots, presentChars, activeIncidentsInRoom) {
    const svg = $('room-stage-svg');
    const zone = room.zoneType;

    let bgTop = '#09111f';
    let bgBot = '#121c2d';
    let accentGlow = '#38bdf8';

    if (zone === 'climax_zone') {
      bgTop = '#1c090c';
      bgBot = '#140c16';
      accentGlow = '#f97316';
    } else if (zone === 'ending_trigger') {
      bgTop = '#071c28';
      bgBot = '#0b2930';
      accentGlow = '#34d399';
    } else if (zone === 'utility') {
      bgTop = '#180c12';
      bgBot = '#141722';
      accentGlow = '#ef4444';
    } else if (zone === 'restroom') {
      bgTop = '#09141d';
      bgBot = '#111e29';
    }

    const propsSvg = buildRoomPropsSvg(room);

    // Place interactive numbered/labeled pins directly at verified (hs.x, hs.y) spatial coordinates!
    const visibleHotspots = hotspots.filter((h) => h.visible);
    const markersSvg = visibleHotspots
      .map((hs, idx) => {
        const cx = typeof hs.x === 'number' ? hs.x : 360;
        const cy = typeof hs.y === 'number' ? hs.y : 210;
        const labelCenterX = Math.max(82, Math.min(638, cx));
        const labelY = cy > 275 ? cy - 42 : cy + 20;
        const fill = hs.puzzleSolved
          ? '#10b981'
          : hs.hasPendingPickup
          ? '#f59e0b'
          : uiState.selectedUseItemId
          ? '#fde68a'
          : '#38bdf8';
        const pinCode = hs.puzzleSolved ? '✓' : hs.hasPendingPickup ? `★${idx + 1}` : `${idx + 1}`;
        const shortLabel = hs.labelKo.length > 17 ? `${hs.labelKo.slice(0, 16)}…` : hs.labelKo;
        const isHovered = uiState.hoveredHotspotId === hs.id;
        return `
          <g class="svg-hotspot-node ${isHovered ? 'is-hovered' : ''}" data-hotspot-id="${escapeHtml(hs.id)}">
            <circle class="hs-pulse" cx="${cx}" cy="${cy}" r="25" fill="${fill}" opacity="0.2"/>
            <circle class="hs-ring" cx="${cx}" cy="${cy}" r="15.5" fill="#070d18" stroke="${fill}" stroke-width="2.4"/>
            <text x="${cx}" y="${cy + 4.5}" text-anchor="middle" fill="${fill}" font-size="11.5" font-weight="700">${pinCode}</text>
            <rect class="hs-label-bg" x="${labelCenterX - 78}" y="${labelY}" width="156" height="22" rx="6" fill="#070c15" fill-opacity="0.92" stroke="${fill}" stroke-opacity="0.62"/>
            <text x="${labelCenterX}" y="${labelY + 14.5}" text-anchor="middle" fill="#f1f5f9" font-size="10.5" font-weight="600">${escapeHtml(shortLabel)}</text>
          </g>
        `;
      })
      .join('');

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
        ? `<rect width="720" height="380" fill="#dc2626" opacity="0.14"/>`
        : '';

    const fx = uiState.flashlightPos.x;
    const fy = uiState.flashlightPos.y;

    svg.innerHTML = `
      <defs>
        <linearGradient id="roomBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${bgTop}"/>
          <stop offset="100%" stop-color="${bgBot}"/>
        </linearGradient>
        <radialGradient id="flashlightCone" cx="${fx}%" cy="${fy}%" r="44%">
          <stop offset="0%" stop-color="#e0f2fe" stop-opacity="0.16"/>
          <stop offset="48%" stop-color="${accentGlow}" stop-opacity="0.06"/>
          <stop offset="100%" stop-color="#02050a" stop-opacity="0.52"/>
        </radialGradient>
      </defs>
      <rect width="720" height="380" fill="url(#roomBg)"/>
      <rect y="294" width="720" height="86" fill="#070b13" opacity="0.88"/>
      <line x1="0" y1="294" x2="720" y2="294" stroke="#25344d" stroke-width="1.5"/>
      ${propsSvg}
      <rect id="stage-flashlight-overlay" width="720" height="380" fill="url(#flashlightCone)" pointer-events="none"/>
      ${crisisTint}
      ${charsBadge}
      <g transform="translate(550, 16)">
        <rect x="0" y="0" width="152" height="28" rx="6" fill="#070c15" fill-opacity="0.88" stroke="#334155"/>
        <text x="76" y="18" text-anchor="middle" fill="#67e8f9" font-size="11.5" font-weight="700">${escapeHtml(room.nameKo)}</text>
      </g>
      ${markersSvg}
    `;

    svg.querySelectorAll('.svg-hotspot-node').forEach((node) => {
      const hsId = node.getAttribute('data-hotspot-id');
      node.addEventListener('click', () => handleHotspotClick(hsId));
      node.addEventListener('mouseenter', () => syncHotspotHover(hsId));
      node.addEventListener('mouseleave', () => syncHotspotHover(null));
    });
  }

  // Interactive Floor-by-Floor School Map SVG Renderer (33 rooms + pin highlight)
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
        }" stroke-width="${unlocked ? 2.1 : 1.9}" stroke-dasharray="${unlocked ? '' : '5 4'}" opacity="0.62"/>`;
        if (!unlocked) {
          edgesSvg += `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="11">🔒</text>`;
        }
      }
    }

    // Cross-floor stair badges positioned cleanly along horizontal corridor flanks
    let stairsSvg = '';
    for (const r of floorRooms) {
      const pos = MAP_COORDS[r.id];
      if (!pos) continue;
      const crossExits = r.exits.filter((ex) => !floorRoomIds.has(ex.to));
      crossExits.forEach((ex, i) => {
        const target = engine.getRoom(ex.to);
        const unlocked = engine.isExitUnlocked(r.id, ex.to);
        let bx = pos.x + (i === 0 ? -96 : 96);
        let by = pos.y;
        if (ex.direction === 'secret_passage') {
          bx = pos.x;
          by = pos.y + 44;
        } else if (r.id === 'rm_clock_tower' || r.id === 'rm_escape_exit') {
          bx = pos.x;
          by = pos.y + 58;
        } else if (crossExits.length === 1) {
          bx = pos.x + 96;
          by = pos.y;
        }
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

    let nodesSvg = '';
    for (const r of floorRooms) {
      const pos = MAP_COORDS[r.id];
      if (!pos) continue;
      const isPlayer = state.currentRoomId === r.id;
      const isVisited = state.visitedRooms.includes(r.id);
      const isAdjacent = adjacentIds.has(r.id);
      const hasIncident = state.activeIncidents.some((inc) => inc.triggerRoomId === r.id);
      const isPinned = uiState.pinnedRoomId === r.id;
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
        : isPinned
        ? '#a78bfa'
        : isAdjacent
        ? '#38bdf8'
        : '#334155';

      nodesSvg += `
        <g class="map-room-node" data-map-room="${escapeHtml(r.id)}">
          ${
            isPinned
              ? `<rect class="map-pin-radar" x="${pos.x - 45}" y="${pos.y - 22}" width="90" height="44" rx="10" fill="none" stroke="${
                  hasIncident ? '#ef4444' : '#38bdf8'
                }" stroke-width="2.5"/>`
              : ''
          }
          <rect x="${pos.x - 39}" y="${pos.y - 16}" width="78" height="32" rx="7" fill="${fill}" stroke="${stroke}" stroke-width="${
            isPlayer || isPinned ? 2.5 : 1.5
          }"/>
          <text x="${pos.x}" y="${pos.y + 4}" text-anchor="middle" fill="${
            isPlayer ? '#fde68a' : '#e2e8f0'
          }" font-size="10" font-weight="700">${escapeHtml(pos.short)}</text>
          ${isPlayer ? `<circle cx="${pos.x - 31}" cy="${pos.y - 9}" r="4" fill="#fbbf24"/>` : ''}
          ${hasIncident ? `<text x="${pos.x + 31}" y="${pos.y - 6}" text-anchor="middle" font-size="11">⚠️</text>` : ''}
          ${isPinned && !hasIncident ? `<text x="${pos.x + 31}" y="${pos.y - 6}" text-anchor="middle" font-size="11">📍</text>` : ''}
          ${
            presentCount > 0
              ? `<circle cx="${pos.x + 31}" cy="${pos.y + 10}" r="6.5" fill="#0ea5e9"/><text x="${pos.x + 31}" y="${
                  pos.y + 13.5
                }" text-anchor="middle" fill="#071019" font-size="8.5" font-weight="700">${presentCount}</text>`
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
          if (uiState.pinnedRoomId === targetId) uiState.pinnedRoomId = null;
          uiState.selectedUseItemId = null;
        }
        renderAll();
      });
    });
  }

  function focusRoomOnMap(roomId) {
    const rm = engine.getRoom(roomId);
    if (!rm) return;
    uiState.viewedFloor = rm.floor;
    uiState.pinnedRoomId = roomId;
    renderFloorMap(engine.getState());
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
    $('hud-cipher-count').textContent = `(${summary.decodedCipherCluesCount}/${summary.totalCipherDeductions})`;

    // Surveillance Threat Gauge
    const threatPill = $('hud-threat-pill');
    threatPill.className = `metric-pill threat-pill band-${summary.threatBand}`;
    $('hud-threat-val').textContent = `${summary.threatLevel} · ${summary.threatBandLabelKo}`;
    $('hud-threat-fill').style.width = `${summary.threatLevel}%`;

    // Evidence Tape Detection Pill
    const tapePill = $('hud-tape-pill');
    tapePill.hidden = !summary.evidenceTapeDetected;

    // 2. Active Incident Countdown Tension Strip
    const banner = $('incident-banner');
    if (state.activeIncidents.length > 0) {
      banner.classList.add('active');
      banner.innerHTML = state.activeIncidents
        .map((inc) => {
          const uiDef = engine.INCIDENT_DEFINITIONS[inc.id];
          const ch = engine.getCharacter(inc.targetCharacterId);
          const targetRoom = engine.getRoom(inc.triggerRoomId);
          const inRoom = state.currentRoomId === inc.triggerRoomId;
          const pct = Math.max(8, Math.min(100, Math.round((inc.remainingTicks / Math.max(1, inc.effectiveWindow)) * 100)));
          const isCritical = inc.remainingTicks <= 2;
          return `
            <div class="incident-alert-card">
              <div class="incident-alert-top">
                <div class="incident-alert-info">
                  <span class="incident-alert-title">⚠️ ${escapeHtml(uiDef ? uiDef.titleKo : inc.id)} (${escapeHtml(
                    ch ? ch.nameKo : inc.targetCharacterId
                  )})</span>
                  <span class="incident-alert-desc">발생 위치: <strong>${escapeHtml(
                    targetRoom ? targetRoom.nameKo : inc.triggerRoomId
                  )}</strong> — ${escapeHtml(uiDef ? uiDef.promptKo : '')}</span>
                </div>
                <div class="incident-controls">
                  <span class="incident-timer-badge">남은 시한: ${inc.remainingTicks} / ${inc.effectiveWindow}틱</span>
                  ${
                    inRoom
                      ? `<button type="button" class="btn-gold" data-open-incident="${escapeHtml(inc.id)}">즉시 대응하기</button>`
                      : `<button type="button" class="btn-accent" data-pin-room="${escapeHtml(inc.triggerRoomId)}">📍 지도 핀 표시</button>`
                  }
                </div>
              </div>
              <div class="incident-urgency-track" role="progressbar" aria-valuenow="${inc.remainingTicks}" aria-valuemax="${inc.effectiveWindow}">
                <div class="incident-urgency-fill ${isCritical ? 'critical' : ''}" style="width:${pct}%"></div>
              </div>
            </div>
          `;
        })
        .join('');

      banner.querySelectorAll('[data-open-incident]').forEach((btn) => {
        btn.addEventListener('click', () => openIncidentDialogue(btn.getAttribute('data-open-incident')));
      });
      banner.querySelectorAll('[data-pin-room]').forEach((btn) => {
        btn.addEventListener('click', () => focusRoomOnMap(btn.getAttribute('data-pin-room')));
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
      $('use-mode-text').textContent = `🔧 [${it ? it.nameKo : uiState.selectedUseItemId}] 사용 모드 — 화면 핀 또는 아래 핫스팟을 클릭하세요`;
    } else {
      uiState.selectedUseItemId = null;
      useBar.classList.remove('active');
    }

    // 4. SVG Stage
    const activeIncidentsInRoom = state.activeIncidents.filter((i) => i.triggerRoomId === state.currentRoomId);
    renderRoomStage(room, hotspots, presentChars, activeIncidentsInRoom);

    // 5. Hotspot Buttons (Synced with SVG Pin Numbers)
    const hsEl = $('hotspot-list');
    const visibleHotspots = hotspots.filter((h) => h.visible);
    hsEl.innerHTML = visibleHotspots
      .map((hs, idx) => {
        const classes = ['hotspot-btn'];
        if (hs.puzzleSolved) classes.push('solved');
        else if (hs.hasPendingPickup) classes.push('pickup-ready');
        if (uiState.selectedUseItemId) classes.push('use-target');
        if (uiState.hoveredHotspotId === hs.id) classes.push('is-hovered');

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
            <span class="hotspot-title"><span class="hotspot-pin-num">${hs.puzzleSolved ? '✓' : idx + 1}</span>${escapeHtml(hs.labelKo)}</span>
            <span class="hotspot-meta">${escapeHtml(statusText)}</span>
          </button>
        `;
      })
      .join('');

    hsEl.querySelectorAll('[data-hs]').forEach((btn) => {
      const hsId = btn.getAttribute('data-hs');
      btn.addEventListener('click', () => handleHotspotClick(hsId));
      btn.addEventListener('mouseenter', () => syncHotspotHover(hsId));
      btn.addEventListener('mouseleave', () => syncHotspotHover(null));
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
        btn.addEventListener('click', () => openCharacterDialogue(btn.getAttribute('data-talk-char')));
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
        const targetId = btn.getAttribute('data-move-to');
        const res = engine.moveTo(targetId);
        if (res.ok) {
          uiState.viewedFloor = engine.getState().currentFloor;
          if (uiState.pinnedRoomId === targetId) uiState.pinnedRoomId = null;
          uiState.selectedUseItemId = null;
        }
        renderAll();
      });
    });

    // 8. Narrative Log
    const logBox = $('log-box');
    $('log-count-label').textContent = `기록 ${state.logs.length}건`;
    logBox.innerHTML = state.logs
      .slice(-50)
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

    const prepFlags = [];
    if (state.flags.flg_rusted_key_oiled) prepFlags.push('🛢️ 녹슨 열쇠 윤활 완료');
    if (state.flags.flg_rusted_key_snapped) prepFlags.push('💥 녹슨 열쇠 파손됨 → 구리 열쇠 필요');
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
        const inspectLabel = itemId === 'item_cipher_table' ? '해독기' : '열람';
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
              <button type="button" data-inspect-item="${escapeHtml(itemId)}">${inspectLabel}</button>
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
        const id = btn.getAttribute('data-inspect-item');
        const res = engine.inspectItem(id);
        renderAll();
        if (res && res.action === 'open_cipher_decoder') {
          openCipherModal();
        }
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
        $('dialogue-portrait-svg').innerHTML = renderCharacterPortraitSvg(ch.id, st);
        $('dialogue-meta-badge').textContent = STATUS_LABELS[st] || st;
        $('dialogue-body').textContent = `[${ch.affiliation}] 추정 위치: ${
          locRoom ? locRoom.nameKo : '소재 불명'
        } — ${ch.keyTraits}`;
        const subNote = $('dialogue-sub-note');
        if (ch.canonicalNote) {
          subNote.textContent = `📌 ${ch.canonicalNote}`;
          subNote.hidden = false;
        } else {
          subNote.hidden = true;
        }
        const choicesEl = $('dialogue-choices');
        choicesEl.innerHTML = locRoom
          ? `<button type="button" class="choice-btn btn-accent" id="bio-pin-loc">📍 지도에서 ${escapeHtml(locRoom.nameKo)} 위치 보기</button>`
          : '';
        const pinBtn = $('bio-pin-loc');
        if (pinBtn) {
          pinBtn.addEventListener('click', () => {
            closeModal('modal-dialogue');
            focusRoomOnMap(locRoom.id);
          });
        }
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
    const st = engine.getState();
    const hasMemo = st.inventory.includes('item_clue_memo_3_2');
    const hasSkel = st.inventory.includes('item_skeleton_memo');
    $('keypad-hint').textContent =
      hasMemo && hasSkel
        ? '단서 메모 확인됨: 3-2 교실 메모(38) + 골격 표본 메모(78) → 4자리 번호를 입력하세요.'
        : hasMemo
        ? '3-2 교실 메모 확인됨(앞 2자리: 38). 5F 이과 실험실 골격 표본에서 뒷 2자리를 확인하세요.'
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

  // Interactive Cipher Table Decoder Modal (난수표 해독기)
  function openCipherModal() {
    renderCipherModal();
    openModal('modal-cipher');
  }

  function assignCipherSlot(coordCode) {
    if (!coordCode) return;
    if (uiState.cipherSlotA === coordCode) {
      uiState.cipherSlotA = '';
    } else if (uiState.cipherSlotB === coordCode) {
      uiState.cipherSlotB = '';
    } else if (!uiState.cipherSlotA) {
      uiState.cipherSlotA = coordCode;
    } else if (!uiState.cipherSlotB) {
      uiState.cipherSlotB = coordCode;
    } else {
      uiState.cipherSlotA = uiState.cipherSlotB;
      uiState.cipherSlotB = coordCode;
    }
    renderCipherModal();
  }

  function renderCipherModal() {
    const cipher = engine.getCipherStatus();
    if (!cipher) return;

    const lockedNotice = $('cipher-locked-notice');
    const workbench = $('cipher-workbench');
    lockedNotice.hidden = cipher.hasCipherTable;
    workbench.style.opacity = cipher.hasCipherTable ? '1' : '0.58';

    $('cipher-slot-a-val').textContent = uiState.cipherSlotA || '--';
    $('cipher-slot-b-val').textContent = uiState.cipherSlotB || '--';
    $('btn-cipher-decode').disabled = !(cipher.hasCipherTable && uiState.cipherSlotA && uiState.cipherSlotB);

    const fb = $('cipher-feedback');
    fb.textContent = uiState.cipherFeedbackText;
    fb.classList.toggle('matched', uiState.cipherFeedbackMatched);

    // Memo coordinate chips
    const chipsEl = $('cipher-memo-chips');
    chipsEl.innerHTML = cipher.memoSources
      .map((ms) => {
        const cls = ms.discovered ? 'cipher-memo-chip' : 'cipher-memo-chip undiscovered';
        const txt = ms.discovered
          ? `📄 ${ms.labelKo} [${ms.coordCode}]`
          : `🔒 미발견 단서 (${ms.labelKo})`;
        return `<button type="button" class="${cls}" ${ms.discovered && cipher.hasCipherTable ? `data-cipher-chip="${escapeHtml(ms.coordCode)}"` : 'disabled'}>${escapeHtml(txt)}</button>`;
      })
      .join('');

    chipsEl.querySelectorAll('[data-cipher-chip]').forEach((btn) => {
      btn.addEventListener('click', () => {
        assignCipherSlot(btn.getAttribute('data-cipher-chip'));
      });
    });

    // 6x6 Interactive Grid
    const gridEl = $('cipher-grid');
    const rows = cipher.gridSpec.rows;
    const cols = cipher.gridSpec.cols;
    let html = `<div class="cipher-hdr">행\\열</div>`;
    for (const c of cols) {
      html += `<div class="cipher-hdr">${escapeHtml(c)}</div>`;
    }
    rows.forEach((rLabel, rIdx) => {
      html += `<div class="cipher-hdr">${escapeHtml(rLabel)}</div>`;
      cols.forEach((cLabel, cIdx) => {
        const coord = `${rLabel}${cLabel}`;
        const token = cipher.grid[rIdx][cIdx];
        const isPicked = uiState.cipherSlotA === coord || uiState.cipherSlotB === coord;
        const isDecoded = cipher.decodedCipherCoords.includes(coord);
        html += `
          <button type="button" class="cipher-cell ${isPicked ? 'picked' : ''} ${
            isDecoded ? 'decoded' : ''
          }" data-cipher-cell="${coord}" ${cipher.hasCipherTable ? '' : 'disabled'}>
            <span>${cipher.hasCipherTable ? escapeHtml(token) : '??'}</span>
            <small>${coord}</small>
          </button>
        `;
      });
    });
    gridEl.innerHTML = html;

    gridEl.querySelectorAll('[data-cipher-cell]').forEach((btn) => {
      btn.addEventListener('click', () => {
        assignCipherSlot(btn.getAttribute('data-cipher-cell'));
      });
    });

    // Deductions ledger
    const unlockedCount = cipher.deductions.filter((d) => d.unlocked).length;
    $('cipher-deduction-count').textContent = `${unlockedCount}/${cipher.deductions.length}`;
    $('cipher-deduction-list').innerHTML = cipher.deductions
      .map((d) => {
        return `
          <div class="cipher-deduction-item ${d.unlocked ? 'unlocked' : ''}">
            <strong>${d.unlocked ? '🔓' : '🔒'} ${escapeHtml(d.titleKo)}</strong>
            ${
              d.unlocked
                ? ` — [${escapeHtml(d.coordPair.join('×'))} → ${escapeHtml(d.decodedCode)}] ${escapeHtml(d.summaryKo)}`
                : ' — 해당 단서 메모 좌표를 교차 입력하면 해독됩니다.'
            }
          </div>
        `;
      })
      .join('');
  }

  // Detective Memo / Hint Assistant Modal
  function openHintModal() {
    uiState.hintShowSpoiler = false;
    renderHintModal();
    openModal('modal-hint');
  }

  function renderHintModal() {
    const hint = engine.getNextClueHint();
    if (!hint) return;
    uiState.lastHintTargetRoomId = hint.targetRoomId;
    const badge = $('hint-urgency-badge');
    badge.textContent =
      hint.urgency === 'critical'
        ? '⚠️ 최우선 긴급 위기 대응'
        : hint.urgency === 'high'
        ? '❗ 주요 분기 단서'
        : hint.urgency === 'done'
        ? '🎬 탐색 완료'
        : '🔎 현재 추리 단서';
    badge.classList.toggle('critical', hint.urgency === 'critical');

    $('hint-lead-title').textContent = hint.titleKo;
    $('hint-lead-body').textContent = hint.hintKo;

    const spoilerBox = $('hint-spoiler-box');
    spoilerBox.textContent = `💡 상세 해법: ${hint.spoilerHintKo}`;
    spoilerBox.hidden = !uiState.hintShowSpoiler;
    $('btn-toggle-spoiler').textContent = uiState.hintShowSpoiler ? '🔒 상세 해법 숨기기' : '🔓 상세 해법 보기';
    $('btn-hint-pin-map').textContent = hint.targetRoomNameKo
      ? `📍 지도 핀 (${hint.targetRoomNameKo})`
      : '📍 지도에서 보기';
  }

  // Dialogue & Incident Modals with Atmospheric Portrait SVG
  function openCharacterDialogue(charId) {
    const dlg = engine.getCharacterDialogue(charId);
    if (!dlg) return;
    const st = engine.getState().characterStates[charId];
    $('dialogue-title').textContent = dlg.isIncident
      ? `⚠️ 긴급 대응 — ${dlg.characterNameKo}`
      : `💬 ${dlg.titleKo || `대화 — ${dlg.characterNameKo}`}`;
    $('dialogue-portrait-svg').innerHTML = renderCharacterPortraitSvg(charId, st);
    $('dialogue-meta-badge').textContent = dlg.isIncident
      ? '긴급 위기'
      : dlg.isAffectionEvent
      ? dlg.alreadyCompleted
        ? '✓ 신뢰 분기 반영됨'
        : '♥ 미유키 신뢰 분기'
      : STATUS_LABELS[st] || '';

    $('dialogue-body').textContent = dlg.promptKo;
    const subNote = $('dialogue-sub-note');
    if (dlg.isAffectionEvent) {
      subNote.textContent = dlg.alreadyCompleted
        ? 'ℹ️ 이 장소의 미유키 신뢰도 분기는 이미 1회 반영되었습니다(중복 증감 방지).'
        : '♥ 이 선택은 미유키 신뢰도(해피 엔딩 분기 기준: 3 이상)에 1회 반영됩니다.';
      subNote.hidden = false;
    } else {
      subNote.hidden = true;
    }

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
          <div class="ending-stat-box">총 행동 틱 · 난수 해독<strong>${summary.actionTicks} Ticks · ${summary.decodedCipherCluesCount}/4</strong></div>
          <div class="ending-stat-box">미유키 신뢰도<strong>♥ ${summary.miyukiAffection} (${summary.affectionEventsCompletedCount}/${summary.totalAffectionEvents} 분기)</strong></div>
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
    // Atmospheric flashlight beam tracking over room stage
    const stageVp = $('stage-viewport');
    stageVp.addEventListener('pointermove', (ev) => {
      const rect = stageVp.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const px = Math.max(8, Math.min(92, Math.round(((ev.clientX - rect.left) / rect.width) * 100)));
      const py = Math.max(8, Math.min(92, Math.round(((ev.clientY - rect.top) / rect.height) * 100)));
      uiState.flashlightPos = { x: px, y: py };
      const grad = document.getElementById('flashlightCone');
      if (grad) {
        grad.setAttribute('cx', `${px}%`);
        grad.setAttribute('cy', `${py}%`);
      }
    });

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

    // Cipher Modal controls
    $('btn-cipher').addEventListener('click', openCipherModal);
    $('btn-cipher-clear').addEventListener('click', () => {
      uiState.cipherSlotA = '';
      uiState.cipherSlotB = '';
      uiState.cipherFeedbackText = '좌표 선택이 초기화되었습니다. 두 칸을 골라 교차 해독하세요.';
      uiState.cipherFeedbackMatched = false;
      renderCipherModal();
    });
    $('btn-cipher-decode').addEventListener('click', () => {
      if (!uiState.cipherSlotA || !uiState.cipherSlotB) return;
      const res = engine.decodeCipher(uiState.cipherSlotA, uiState.cipherSlotB);
      uiState.cipherFeedbackText = res.message || '';
      uiState.cipherFeedbackMatched = Boolean(res.ok && res.matched);
      uiState.cipherSlotA = '';
      uiState.cipherSlotB = '';
      renderAll();
      renderCipherModal();
    });

    // Hint Modal controls
    $('btn-hint').addEventListener('click', openHintModal);
    $('btn-toggle-spoiler').addEventListener('click', () => {
      uiState.hintShowSpoiler = !uiState.hintShowSpoiler;
      renderHintModal();
    });
    $('btn-hint-pin-map').addEventListener('click', () => {
      if (uiState.lastHintTargetRoomId) {
        focusRoomOnMap(uiState.lastHintTargetRoomId);
      }
      closeModal('modal-hint');
    });

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
        ['modal-dialogue', 'modal-save', 'modal-ending', 'modal-guide', 'modal-cipher', 'modal-hint'].forEach(closeModal);
      }
    });

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
      uiState.pinnedRoomId = null;
      uiState.selectedUseItemId = null;
      uiState.combineMode = false;
      uiState.combineSelection = [];
      uiState.cipherSlotA = '';
      uiState.cipherSlotB = '';
      uiState.cipherFeedbackText = '표에서 좌표 2개를 선택해 교차 해독하거나, 수집한 메모 좌표 칩을 클릭하세요.';
      uiState.cipherFeedbackMatched = false;
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
