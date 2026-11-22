/**
 * Doukyuusei 2 (동급생 2) PlayHub Web UI Adapter (Phase 2)
 * Connects Doukyuusei2Engine & DOUKYUUSEI2_DATA to:
 * - 4-Zone interactive SVG map + Quick Route Guide
 * - Interactive 24h NPC Timeline bar (Map & Notebook)
 * - Telephone Directory Modal (Home Phone & Payphone calls + Incoming Phone Events)
 * - Playable 12/29 Misa Tennis Rally Minigame Widget
 * - Visual-novel stage with Affection & Mood meters + Impact Toast
 * - 3-slot Save Store & 19-Ending Gallery
 */
(function () {
  'use strict';

  const DATA = globalThis.DOUKYUUSEI2_DATA;
  const { Doukyuusei2Engine, formatMinutes, formatDateLabel, TENNIS_SHOTS } = globalThis.Doukyuusei2Engine;

  const STORAGE_PREFIX = 'doukyuusei-2:v1:';
  const SAVE_SLOTS = [1, 2, 3];

  // Distinct visual styling for all 22 characters (SVG portrait palette + hairstyle)
  const CHAR_STYLES = {
    chr_ryunosuke: { hair: '#2a3552', accent: '#67d5f7', outfit: '#283655', style: 'short_boy' },
    chr_yui:       { hair: '#6b3e2e', accent: '#f2849e', outfit: '#d96b88', style: 'medium_ribbon' },
    chr_misako:    { hair: '#3b2b3d', accent: '#c084fc', outfit: '#7c4d7a', style: 'elegant_updo' },
    chr_tomomi:    { hair: '#4a3728', accent: '#60a5fa', outfit: '#3b5b94', style: 'neat_bob' },
    chr_izumi:     { hair: '#7c2d3b', accent: '#fb923c', outfit: '#334b49', style: 'sporty_short' },
    chr_karen:     { hair: '#d48a46', accent: '#f472b6', outfit: '#b8326a', style: 'idol_long' },
    chr_sakurako:  { hair: '#d87a98', accent: '#fda4af', outfit: '#647aa3', style: 'soft_long' },
    chr_kozue:     { hair: '#8d5524', accent: '#34d399', outfit: '#2f6b5a', style: 'ponytail' },
    chr_mirei:     { hair: '#27293d', accent: '#a78bfa', outfit: '#4d4172', style: 'teacher_long' },
    chr_minori:    { hair: '#313a4b', accent: '#93c5fd', outfit: '#37506d', style: 'braids_glasses' },
    chr_youko:     { hair: '#b8422a', accent: '#facc15', outfit: '#40343a', style: 'wild_long' },
    chr_azumi:     { hair: '#a1623b', accent: '#fbbf24', outfit: '#c97b4b', style: 'warm_bob' },
    chr_misato:    { hair: '#455978', accent: '#38bdf8', outfit: '#255c85', style: 'guide_cap' },
    chr_sachiko:   { hair: '#212233', accent: '#f43f5e', outfit: '#6b2737', style: 'kimono_updo' },
    chr_kumiko:    { hair: '#6e3f35', accent: '#fb7185', outfit: '#8c3b55', style: 'medium_ribbon' },
    chr_misa:      { hair: '#c95b3c', accent: '#f59e0b', outfit: '#b45309', style: 'ponytail' },
    chr_akira:     { hair: '#3b322c', accent: '#60a5fa', outfit: '#2e4a6b', style: 'short_boy' },
    chr_yoshiki:   { hair: '#3a4236', accent: '#a3e635', outfit: '#3f4d3b', style: 'glasses_boy' },
    chr_aritomo:   { hair: '#b8944a', accent: '#e879f9', outfit: '#4c3563', style: 'noble_boy' },
    chr_tendo:     { hair: '#2b2625', accent: '#f87171', outfit: '#692a2a', style: 'short_boy' },
    chr_kaeru_ojisan: { hair: '#4b5563', accent: '#4ade80', outfit: '#2f5e42', style: 'glasses_boy' },
    chr_quiz_king: { hair: '#4c1d95', accent: '#facc15', outfit: '#4338ca', style: 'noble_boy' }
  };

  // Hand-tuned 4-Zone SVG Node Coordinates (viewBox 820 x 420) for all 41 locations
  const MAP_COORDS = {
    yasohachi_town: {
      loc_home_room:       { x: 100, y: 58,  short: '주인공 방' },
      loc_home_yui_room:   { x: 225, y: 58,  short: '유이 방' },
      loc_home_bath:       { x: 350, y: 58,  short: '욕실' },
      loc_home_living:     { x: 215, y: 126, short: '자택 거실' },
      loc_home_cafe:       { x: 100, y: 184, short: '1층 찻집' },
      loc_home_front:      { x: 360, y: 205, short: '자택 앞 (허브)' },
      loc_tomomi_house:    { x: 215, y: 262, short: '토모미 집' },
      loc_izumi_house:     { x: 96,  y: 295, short: '이즈미 집' },
      loc_karen_house:     { x: 196, y: 360, short: '카렌 집' },
      loc_youko_house:     { x: 332, y: 366, short: '요코 집' },
      loc_akira_house:     { x: 472, y: 366, short: '아키라 집' },
      loc_saionji_mansion: { x: 610, y: 360, short: '사이온지 저택' },
      loc_yasohachi_coast: { x: 735, y: 330, short: '야소하치 해안' },
      loc_city_hospital:   { x: 545, y: 274, short: '시민병원' },
      loc_hanazono_nursery:{ x: 688, y: 245, short: '하나조노 보육원' },
      loc_sevenmart:       { x: 525, y: 175, short: '세븐마트' },
      loc_yasohachi_park:  { x: 475, y: 98,  short: '야소하치 공원' },
      loc_shirahegaike_park:{ x: 622, y: 90, short: '시라헤가이케 공원' },
      loc_yasohachi_station:{ x: 716, y: 148, short: '야소하치 역' },
      loc_nyubai_travel:   { x: 742, y: 62,  short: '뉴바이 여행사' }
    },
    yasohachi_gakuen: {
      loc_school_gate:       { x: 130, y: 215, short: '학원 교문' },
      loc_school_staffroom:  { x: 295, y: 95,  short: '교무실' },
      loc_school_library:    { x: 470, y: 95,  short: '도서실' },
      loc_school_3b:         { x: 365, y: 195, short: '3-B 교실' },
      loc_school_photo_club: { x: 615, y: 195, short: '사진부 부실' },
      loc_school_yard:       { x: 345, y: 315, short: '운동장' },
      loc_school_tennis:     { x: 560, y: 278, short: '테니스 코트' },
      loc_school_kyudo:      { x: 685, y: 335, short: '궁도장' },
      loc_school_gym_back:   { x: 525, y: 374, short: '체육관 뒤' }
    },
    kisaragi_town: {
      loc_kisaragi_station:  { x: 410, y: 212, short: '키사라기 역 (허브)' },
      loc_studio_ataru:      { x: 175, y: 105, short: '스튜디오 ATARU' },
      loc_station_hotel:     { x: 410, y: 78,  short: '스테이션 호텔' },
      loc_game_center:       { x: 655, y: 105, short: '게임센터' },
      loc_talent_prod:       { x: 145, y: 235, short: '프로덕션 VIP' },
      loc_tv_station:        { x: 675, y: 235, short: '방송국' },
      loc_kisaragi_shrine:   { x: 205, y: 350, short: '키사라기 신사' },
      loc_takadai:           { x: 410, y: 364, short: '언덕 전망대' },
      loc_construction_site: { x: 625, y: 350, short: '공사현장' }
    },
    touji_onsen: {
      loc_nagashima_ryokan:  { x: 410, y: 220, short: '나가시마 료칸' },
      loc_onsen_open_bath:   { x: 215, y: 145, short: '노천온천' },
      loc_onsen_ski_slope:   { x: 615, y: 145, short: '스키 슬로프' }
    }
  };

  const SPAWN_LABELS = {
    fixed: '고정',
    roaming: '순회',
    hybrid: '복합',
    scripted: '이벤트',
    player: '주인공'
  };

  function readStorage(key) {
    try {
      return globalThis.localStorage ? globalThis.localStorage.getItem(key) : null;
    } catch {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      if (globalThis.localStorage) globalThis.localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  function removeStorage(key) {
    try {
      if (globalThis.localStorage) globalThis.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCharacterAvatarSvg(charId, size = 64) {
    const st = CHAR_STYLES[charId] || { hair: '#475569', accent: '#94a3b8', outfit: '#334155', style: 'neat_bob' };
    const isMale = ['short_boy', 'glasses_boy', 'noble_boy'].includes(st.style);
    const skin = '#fde2cf';

    let hairBack = '';
    if (st.style === 'idol_long' || st.style === 'soft_long' || st.style === 'teacher_long' || st.style === 'wild_long') {
      hairBack = `<path d="M16 32 Q12 58 18 76 L62 76 Q68 58 64 32 Z" fill="${st.hair}"/>`;
    } else if (st.style === 'medium_ribbon' || st.style === 'neat_bob' || st.style === 'warm_bob') {
      hairBack = `<path d="M18 32 Q16 54 22 64 L58 64 Q64 54 62 32 Z" fill="${st.hair}"/>`;
    } else if (st.style === 'ponytail') {
      hairBack = `<path d="M56 24 Q74 34 68 62 Q60 54 55 38 Z" fill="${st.hair}"/>`;
    } else if (st.style === 'braids_glasses') {
      hairBack = `<rect x="18" y="42" width="8" height="28" rx="4" fill="${st.hair}"/><rect x="54" y="42" width="8" height="28" rx="4" fill="${st.hair}"/>`;
    } else if (st.style === 'elegant_updo' || st.style === 'kimono_updo') {
      hairBack = `<circle cx="40" cy="14" r="11" fill="${st.hair}"/>`;
    }

    let accessory = '';
    if (st.style === 'medium_ribbon') {
      accessory = `<polygon points="24,20 32,24 24,28" fill="${st.accent}"/><polygon points="56,20 48,24 56,28" fill="${st.accent}"/>`;
    } else if (st.style === 'braids_glasses' || st.style === 'glasses_boy') {
      accessory = `<g stroke="#dbeafe" stroke-width="1.8" fill="none"><rect x="27" y="36" width="10" height="7" rx="2"/><rect x="43" y="36" width="10" height="7" rx="2"/><line x1="37" y1="39" x2="43" y2="39"/></g>`;
    } else if (st.style === 'guide_cap') {
      accessory = `<path d="M22 22 Q40 10 58 22 L56 26 L24 26 Z" fill="${st.outfit}" stroke="${st.accent}" stroke-width="1.5"/>`;
    } else if (st.style === 'kimono_updo' || st.style === 'elegant_updo') {
      accessory = `<line x1="48" y1="11" x2="62" y2="18" stroke="${st.accent}" stroke-width="2.4" stroke-linecap="round"/>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="${size}" height="${size}">
      <defs>
        <linearGradient id="bg_${charId}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#192848"/>
          <stop offset="100%" stop-color="#0f172a"/>
        </linearGradient>
      </defs>
      <rect width="80" height="80" fill="url(#bg_${charId})"/>
      <circle cx="40" cy="40" r="34" fill="${st.accent}" opacity="0.14"/>
      ${hairBack}
      <path d="M14 80 Q20 58 40 58 Q60 58 66 80 Z" fill="${st.outfit}"/>
      <path d="M32 58 L40 68 L48 58 Z" fill="#f8fafc" opacity="0.9"/>
      <path d="M36 62 L40 69 L44 62 Z" fill="${st.accent}"/>
      <rect x="35" y="49" width="10" height="11" rx="4" fill="${skin}"/>
      <ellipse cx="40" cy="38" rx="${isMale ? 15 : 14.5}" ry="16" fill="${skin}"/>
      <path d="M23 36 Q24 18 40 18 Q56 18 57 36 Q51 27 44 31 Q39 25 33 31 Q27 27 23 36 Z" fill="${st.hair}"/>
      <ellipse cx="33" cy="39.5" rx="2.3" ry="2.7" fill="#182238"/>
      <ellipse cx="47" cy="39.5" rx="2.3" ry="2.7" fill="#182238"/>
      <circle cx="33.8" cy="38.6" r="0.9" fill="#fff"/>
      <circle cx="47.8" cy="38.6" r="0.9" fill="#fff"/>
      <ellipse cx="29.5" cy="43.5" rx="2.6" ry="1.2" fill="#f2849e" opacity="${isMale ? 0.12 : 0.35}"/>
      <ellipse cx="50.5" cy="43.5" rx="2.6" ry="1.2" fill="#f2849e" opacity="${isMale ? 0.12 : 0.35}"/>
      <path d="M36.5 46.5 Q40 49.5 43.5 46.5" fill="none" stroke="#a6685b" stroke-width="1.6" stroke-linecap="round"/>
      ${accessory}
    </svg>`;
  }

  function renderLocationBackdropSvg(loc, timeSlot) {
    const palettes = {
      late_night:    ['#050a18', '#0f1a36', '#1e2c54'],
      early_morning: ['#192a56', '#3c5a99', '#82a0c8'],
      morning:       ['#1e3a6e', '#3b6ca8', '#9ec5e8'],
      noon:          ['#244d8a', '#4f89c6', '#c5dff5'],
      afternoon:     ['#2d3f73', '#6b6799', '#d89b72'],
      evening:       ['#1b2247', '#4e3c6b', '#c96f6b'],
      night:         ['#070d1f', '#142347', '#263966']
    };
    const pal = palettes[timeSlot.id] || palettes.morning;
    const isNight = ['night', 'late_night', 'evening'].includes(timeSlot.id);
    const winColor = isNight ? '#ffd580' : '#d8eeff';

    let scenery = '';
    if (loc.zone_id === 'touji_onsen') {
      scenery = `
        <path d="M0 155 Q190 95 420 140 T820 120 L820 210 L0 210 Z" fill="#1b2b4a"/>
        <path d="M0 172 Q260 152 540 168 T820 158 L820 210 L0 210 Z" fill="#dce8f8" opacity="0.88"/>
        <g fill="#121e36">
          <polygon points="270,175 270,122 390,94 510,122 510,175"/>
          <rect x="335" y="135" width="110" height="32" fill="${winColor}" opacity="0.85"/>
        </g>
        <g stroke="#ffffff" stroke-opacity="0.45" stroke-width="4" fill="none">
          <path d="M135 162 Q125 142 140 125"/>
          <path d="M168 164 Q158 140 175 120"/>
          <path d="M645 158 Q638 136 654 118"/>
        </g>`;
    } else if (loc.zone_id === 'yasohachi_gakuen') {
      scenery = `
        <rect x="115" y="88" width="590" height="100" fill="#172442"/>
        <rect x="382" y="42" width="56" height="52" fill="#131e38"/>
        <polygon points="376,42 410,18 444,42" fill="#dce8f8"/>
        <circle cx="410" cy="65" r="13" fill="#fff5d6"/>
        <g fill="${winColor}" opacity="0.75">
          <rect x="145" y="106" width="38" height="22" rx="2"/>
          <rect x="198" y="106" width="38" height="22" rx="2"/>
          <rect x="251" y="106" width="38" height="22" rx="2"/>
          <rect x="528" y="106" width="38" height="22" rx="2"/>
          <rect x="581" y="106" width="38" height="22" rx="2"/>
          <rect x="634" y="106" width="38" height="22" rx="2"/>
        </g>
        <rect x="0" y="178" width="820" height="32" fill="#c9d9f0" opacity="0.82"/>`;
    } else if (loc.zone_id === 'kisaragi_town') {
      scenery = `
        <g fill="#121d38">
          <rect x="45" y="85" width="80" height="110"/>
          <rect x="145" y="55" width="95" height="140"/>
          <rect x="275" y="75" width="110" height="120"/>
          <rect x="420" y="48" width="120" height="147"/>
          <rect x="575" y="72" width="95" height="123"/>
          <rect x="690" y="92" width="90" height="103"/>
        </g>
        <g fill="${winColor}" opacity="0.72">
          <rect x="165" y="76" width="18" height="14"/><rect x="195" y="76" width="18" height="14"/>
          <rect x="165" y="102" width="18" height="14"/><rect x="195" y="102" width="18" height="14"/>
          <rect x="442" y="68" width="22" height="16"/><rect x="478" y="68" width="22" height="16"/>
          <rect x="442" y="98" width="22" height="16"/><rect x="478" y="98" width="22" height="16"/>
          <rect x="598" y="94" width="20" height="14"/><rect x="628" y="94" width="20" height="14"/>
        </g>
        <rect x="0" y="182" width="820" height="28" fill="#1c2a4b"/>`;
    } else {
      scenery = `
        <path d="M0 158 Q200 128 450 152 T820 140 L820 210 L0 210 Z" fill="#182748"/>
        <g fill="#101b34">
          <polygon points="75,185 75,118 145,86 215,118 215,185"/>
          <polygon points="245,185 245,110 325,74 405,110 405,185"/>
          <rect x="455" y="102" width="130" height="83"/>
          <polygon points="620,185 620,120 695,88 770,120 770,185"/>
        </g>
        <g fill="${winColor}" opacity="0.82">
          <rect x="295" y="126" width="28" height="24" rx="2"/>
          <rect x="335" y="126" width="28" height="24" rx="2"/>
          <rect x="485" y="120" width="24" height="18" rx="2"/>
          <rect x="525" y="120" width="24" height="18" rx="2"/>
          <rect x="678" y="132" width="32" height="22" rx="2"/>
        </g>
        <rect x="0" y="180" width="820" height="30" fill="#d3e2f7" opacity="0.8"/>`;
    }

    return `<defs>
        <linearGradient id="stageSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal[0]}"/>
          <stop offset="55%" stop-color="${pal[1]}"/>
          <stop offset="100%" stop-color="${pal[2]}"/>
        </linearGradient>
      </defs>
      <rect width="820" height="210" fill="url(#stageSky)"/>
      ${isNight ? '<circle cx="725" cy="42" r="18" fill="#fff3cc" opacity="0.9"/><circle cx="732" cy="38" r="15" fill="' + pal[0] + '"/>' : '<circle cx="725" cy="44" r="22" fill="#fff5d6" opacity="0.5"/>'}
      ${scenery}`;
  }

  function renderTennisCourtSvg(match) {
    const misaPos =
      match.misaStance.id === 'net_rush'
        ? { x: 205, y: 74 }
        : match.misaStance.id === 'baseline'
          ? { x: 292, y: 74 }
          : { x: 325, y: 74 };

    const last = match.lastRally;
    let ballPath = '';
    if (last) {
      const won = last.outcome === 'player_point';
      const stroke = won ? '#6ee7b7' : '#fb7185';
      const endX = won ? (last.shotType === 'drop' ? 202 : 332) : 45;
      const endY = won ? (last.shotType === 'power' ? 32 : 112) : 65;
      const ctrlY = last.shotType === 'lob' ? 8 : 74;
      ballPath = `
        <path d="M 65 74 Q 185 ${ctrlY} ${endX} ${endY}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-dasharray="5 3"/>
        <circle cx="${endX}" cy="${endY}" r="5.5" fill="#fde047" stroke="#111827" stroke-width="1.2"/>`;
    }

    return `<svg class="tennis-court-svg" viewBox="0 0 360 150" role="img" aria-label="테니스 코트 전술도">
      <rect width="360" height="150" rx="10" fill="#1b5e4c"/>
      <rect x="20" y="18" width="320" height="114" fill="#22735d" stroke="#e2f7ef" stroke-width="2"/>
      <line x1="20" y1="34" x2="340" y2="34" stroke="#e2f7ef" stroke-opacity="0.6" stroke-width="1.2"/>
      <line x1="20" y1="116" x2="340" y2="116" stroke="#e2f7ef" stroke-opacity="0.6" stroke-width="1.2"/>
      <line x1="100" y1="34" x2="100" y2="116" stroke="#e2f7ef" stroke-opacity="0.65" stroke-width="1.2"/>
      <line x1="260" y1="34" x2="260" y2="116" stroke="#e2f7ef" stroke-opacity="0.65" stroke-width="1.2"/>
      <line x1="100" y1="75" x2="260" y2="75" stroke="#e2f7ef" stroke-opacity="0.65" stroke-width="1.2"/>
      <!-- Net -->
      <line x1="180" y1="12" x2="180" y2="138" stroke="#f8fafc" stroke-width="3.2" stroke-dasharray="3 2"/>
      <text x="180" y="147" text-anchor="middle" fill="#a7f3d0" font-size="9" font-weight="700">NET</text>
      <!-- Player -->
      <circle cx="58" cy="75" r="12" fill="#38bdf8" stroke="#0b1529" stroke-width="2"/>
      <text x="58" y="79" text-anchor="middle" fill="#0b1529" font-size="9.5" font-weight="900">나</text>
      <!-- Misa -->
      <circle cx="${misaPos.x}" cy="${misaPos.y}" r="13" fill="#f59e0b" stroke="#0b1529" stroke-width="2"/>
      <text x="${misaPos.x}" y="${misaPos.y + 3.5}" text-anchor="middle" fill="#0b1529" font-size="9" font-weight="900">미사</text>
      ${ballPath}
    </svg>`;
  }

  // Application Controller
  const engine = new Doukyuusei2Engine(DATA, { mode: 'easy_remake' });
  const uiState = {
    selectedZoneId: engine.state.zoneId,
    selectedTimelineCharId: 'chr_yui',
    activeSidebarTab: 'notebook',
    notebookFilter: 'all',
    expandedHeroines: new Set(),
    activeModalEvent: null,
    activeModalViaPhone: false,
    lastPhoneResult: null,
    tennisEventResult: null,
    dialogue: {
      speaker: '안내',
      text: '겨울방학 첫날 아침입니다. 4존 지도에서 이동할 장소를 클릭하거나, 추천 동선·전화번호부로 히로인을 추적해 보세요.',
      meta: '12/22 08:00'
    }
  };

  function getUnlockedEndings() {
    try {
      const raw = readStorage(`${STORAGE_PREFIX}endings`);
      const parsed = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  }

  function recordUnlockedEnding(endingId) {
    if (!endingId) return;
    const set = getUnlockedEndings();
    set.add(endingId);
    writeStorage(`${STORAGE_PREFIX}endings`, JSON.stringify([...set]));
  }

  function setDialogue(speaker, text) {
    const dayMeta = engine.getCurrentDayMeta();
    uiState.dialogue = {
      speaker,
      text,
      meta: `${dayMeta.date} ${formatMinutes(engine.state.minuteOfDay)}`
    };
  }

  // DOM References
  const el = {
    dateText: document.getElementById('hud-date-text'),
    ddayBadge: document.getElementById('hud-dday-badge'),
    clockText: document.getElementById('hud-clock-text'),
    timeslotBadge: document.getElementById('hud-timeslot-badge'),
    zoneText: document.getElementById('hud-zone-text'),
    locText: document.getElementById('hud-loc-text'),
    btnModeClassic: document.getElementById('btn-mode-classic'),
    btnModeEasy: document.getElementById('btn-mode-easy'),
    btnOpenPhone: document.getElementById('btn-open-phone'),
    phoneRingBadge: document.getElementById('phone-ring-badge'),
    btnSaveLoad: document.getElementById('btn-save-load'),
    btnEndings: document.getElementById('btn-endings'),
    btnNewGame: document.getElementById('btn-new-game'),
    bannerDayNote: document.getElementById('banner-day-note'),
    bannerWarning: document.getElementById('banner-warning'),
    quickRouteBar: document.getElementById('quick-route-bar'),
    zoneTabs: document.getElementById('zone-tabs'),
    townMapSvg: document.getElementById('town-map-svg'),
    mapHoverInfo: document.getElementById('map-hover-info'),
    timelineHeroineSelect: document.getElementById('timeline-heroine-select'),
    mapTimelineBody: document.getElementById('map-timeline-body'),
    sceneBackdropSvg: document.getElementById('scene-backdrop-svg'),
    stageZonePill: document.getElementById('stage-zone-pill'),
    stageLocTitle: document.getElementById('stage-loc-title'),
    stageLocMeta: document.getElementById('stage-loc-meta'),
    stageQuickEvents: document.getElementById('stage-quick-events'),
    stageNpcStrip: document.getElementById('stage-npc-strip'),
    dialogueSpeaker: document.getElementById('dialogue-speaker'),
    impactToast: document.getElementById('impact-toast'),
    dialogueMeta: document.getElementById('dialogue-meta'),
    dialogueText: document.getElementById('dialogue-text'),
    btnWaitNext: document.getElementById('btn-wait-next'),
    btnDeckPhone: document.getElementById('btn-deck-phone'),
    btnSleepDay: document.getElementById('btn-sleep-day'),
    notebookList: document.getElementById('notebook-list'),
    flagStatsRow: document.getElementById('flag-stats-row'),
    mxList: document.getElementById('mx-list'),
    specialRulesList: document.getElementById('special-rules-list'),
    activeFlagsChips: document.getElementById('active-flags-chips'),
    completedEventsList: document.getElementById('completed-events-list'),
    historyLogList: document.getElementById('history-log-list'),
    phoneModal: document.getElementById('phone-modal'),
    phoneModalStatusTag: document.getElementById('phone-modal-status-tag'),
    phoneLocationNotice: document.getElementById('phone-location-notice'),
    phoneCallResult: document.getElementById('phone-call-result'),
    phoneDirectoryList: document.getElementById('phone-directory-list'),
    btnClosePhoneModal: document.getElementById('btn-close-phone-modal'),
    btnPhoneClose: document.getElementById('btn-phone-close'),
    eventModal: document.getElementById('event-modal'),
    eventModalTag: document.getElementById('event-modal-tag'),
    eventModalTitle: document.getElementById('event-modal-title'),
    eventModalPortrait: document.getElementById('event-modal-portrait'),
    eventModalNarration: document.getElementById('event-modal-narration'),
    eventModalLines: document.getElementById('event-modal-lines'),
    eventModalMinigame: document.getElementById('event-modal-minigame'),
    eventModalChoices: document.getElementById('event-modal-choices'),
    eventModalFooter: document.getElementById('event-modal-footer'),
    btnCloseEventModal: document.getElementById('btn-close-event-modal'),
    saveModal: document.getElementById('save-modal'),
    saveSlotsList: document.getElementById('save-slots-list'),
    btnCloseSaveModal: document.getElementById('btn-close-save-modal'),
    endingModal: document.getElementById('ending-modal'),
    endingModalTag: document.getElementById('ending-modal-tag'),
    endingModalTitle: document.getElementById('ending-modal-title'),
    endingFeatured: document.getElementById('ending-featured'),
    endingGalleryGrid: document.getElementById('ending-gallery-grid'),
    btnCloseEndingModal: document.getElementById('btn-close-ending-modal'),
    btnEndingNewGame: document.getElementById('btn-ending-new-game'),
    btnEndingClose: document.getElementById('btn-ending-close')
  };

  function renderAll() {
    const activeZones = engine.getActiveZones();
    if (!activeZones.includes(uiState.selectedZoneId)) {
      uiState.selectedZoneId = engine.state.zoneId;
    }

    renderHud();
    renderQuickRouteBar();
    renderZoneTabs();
    renderTownMap();
    renderMapTimeline();
    renderSceneStage();
    renderDialogue();
    renderSidebar();
  }

  function renderHud() {
    const dayMeta = engine.getCurrentDayMeta();
    const timeSlot = engine.getTimeSlotMeta();
    const curLoc = engine.locMap.get(engine.state.locationId);
    const curZone = engine.zoneMap.get(engine.state.zoneId);
    const daysLeft = Math.max(0, DATA.days.length - 1 - engine.state.dayIndex);
    const phoneStatus = engine.canUsePhone();
    const incomingCalls = engine.getActiveIncomingPhoneEvents();

    el.dateText.textContent = formatDateLabel(dayMeta, engine.state.dayIndex);
    el.ddayBadge.textContent = daysLeft === 0 ? '시업식' : `D-${daysLeft}`;
    el.clockText.textContent = formatMinutes(engine.state.minuteOfDay);
    el.timeslotBadge.textContent = timeSlot.label_ko;
    el.zoneText.textContent = curZone ? curZone.name_ko : engine.state.zoneId;
    el.locText.textContent = curLoc ? curLoc.name_ko : engine.state.locationId;

    el.btnModeClassic.classList.toggle('active', engine.state.mode === 'classic');
    el.btnModeEasy.classList.toggle('active', engine.state.mode === 'easy_remake');

    // Phone ring indicator on HUD & deck
    const hasIncoming = incomingCalls.length > 0 && !engine.state.ended;
    el.btnOpenPhone.classList.toggle('ringing', hasIncoming);
    el.phoneRingBadge.classList.toggle('hidden', !hasIncoming);
    if (hasIncoming) {
      el.phoneRingBadge.textContent = `☎ ${incomingCalls.length}`;
    }

    el.btnDeckPhone.disabled = engine.state.ended;
    el.btnDeckPhone.textContent = phoneStatus.canCall
      ? `📞 ${phoneStatus.phoneType === 'payphone' ? '공중전화' : '자택 전화'} (-5분)`
      : '📞 전화번호부';
    el.btnDeckPhone.classList.toggle('btn-amber', hasIncoming && phoneStatus.canCall);
    el.btnDeckPhone.classList.toggle('btn-ghost', !(hasIncoming && phoneStatus.canCall));

    el.bannerDayNote.textContent = `${dayMeta.label_ko} — ${dayMeta.special_notes}`;

    const warnings = [];
    if (incomingCalls.length > 0) {
      warnings.push(`☎ 수신 대기 전화 ${incomingCalls.length}건 (${incomingCalls.map((c) => c.character.name_ko).join(', ')})`);
    }
    if (engine.isOnsenHomeReturnWarningActive()) {
      warnings.push('⚠ 1/6 온천 연계 루트 활성: 외출 후 자택(거실·방) 귀가 시 플래그 파손 주의!');
    }
    if (engine.hasFlag('flg_youko_ending_override_active')) {
      warnings.push('⚡ 요코 엔딩 우선권(1000) 활성화됨');
    }

    if (warnings.length > 0 && engine.state.mode === 'easy_remake') {
      el.bannerWarning.textContent = warnings.join(' · ');
      el.bannerWarning.classList.remove('hidden');
    } else {
      el.bannerWarning.classList.add('hidden');
    }

    if (engine.state.ended) {
      el.btnSleepDay.textContent = '엔딩 결과 보기';
    } else if (engine.state.dayIndex === 15 && engine.isOnsenHomeReturnWarningActive()) {
      el.btnSleepDay.textContent = '외박 · 1/7 시업식으로 (안전)';
    } else if (engine.state.dayIndex === 15) {
      el.btnSleepDay.textContent = '하루 마무리 · 1/7 시업식으로';
    } else {
      el.btnSleepDay.textContent = '귀가 후 취침 (다음 날)';
    }

    const nextMin = engine.getNextScheduledMinuteToday();
    el.btnWaitNext.disabled = engine.state.ended || nextMin === null;
    el.btnWaitNext.textContent = nextMin !== null ? `다음 일정 (${formatMinutes(nextMin)})까지` : '오늘 남은 일정 없음';
  }

  function renderQuickRouteBar() {
    if (engine.state.ended) {
      el.quickRouteBar.innerHTML = `<span class="route-guide-label">🎓 시업식 완료</span><span class="route-rumor">엔딩 도감에서 19종 엔딩 조건과 해금 현황을 확인해 보세요.</span>`;
      return;
    }

    const isEasy = engine.state.mode === 'easy_remake';
    const rumor = engine.getDailyRumorHint();

    if (!isEasy) {
      el.quickRouteBar.innerHTML = `<span class="route-guide-label">💬 오늘의 소문</span>
        <span class="route-rumor">${escapeHtml(rumor ? rumor.hint_ko : '자택이나 공중전화에서 히로인에게 전화를 걸어 단서를 모아 보세요.')}</span>`;
      return;
    }

    const recs = engine.getQuickRouteRecommendations(2);
    if (recs.length === 0) {
      el.quickRouteBar.innerHTML = `<span class="route-guide-label">🧭 추천 동선</span>
        <span class="route-rumor">${escapeHtml(rumor ? rumor.hint_ko : '오늘 남은 핵심 이벤트 창이 없습니다. 시간을 보내거나 다음 날로 넘겨 보세요.')}</span>`;
      return;
    }

    const cardsHtml = recs
      .map((rec) => {
        const etaStr =
          rec.travelMinutes === 0
            ? '현재 위치'
            : `+${rec.travelMinutes}분 → ${formatMinutes(rec.arrivalMinute)}`;
        const statusTag = rec.activeNow
          ? `<span class="tag tag-amber">진행 가능</span>`
          : `<span class="tag tag-sky">${rec.minutesUntilStart}분 뒤 시작</span>`;

        const actionBtn =
          rec.isPhoneEvent && rec.activeNow
            ? `<button class="btn btn-sm btn-amber" type="button" data-open-phone-for="${rec.characterId}">☎ 전화 받기</button>`
            : rec.travelMinutes === 0 && rec.activeNow
              ? `<button class="btn btn-sm btn-amber" type="button" data-trigger-event="${rec.eventId}">★ 바로 진행</button>`
              : `<button class="btn btn-sm btn-sky" type="button" data-quick-travel="${rec.locationId}">바로 이동</button>`;

        return `<div class="route-card ${rec.activeNow ? 'urgent' : ''}">
          ${statusTag}
          <div class="route-card-text">
            <strong>${escapeHtml(rec.locationName)}</strong> · ${escapeHtml(rec.title_ko)}
            <span class="route-card-meta">(${rec.windowLabel} · ${etaStr})</span>
          </div>
          ${actionBtn}
        </div>`;
      })
      .join('');

    el.quickRouteBar.innerHTML = `<span class="route-guide-label">🧭 추천 동선</span><div class="route-cards-row">${cardsHtml}</div>`;
  }

  function renderTimelineTrackHtml(timeline, compact = false) {
    if (!timeline.visibleInCurrentMode) {
      return `<div class="empty-stage-note" style="padding:7px 10px;font-size:11.5px;">클래식 모드: 대화하거나 전화(📞)를 걸어 ${escapeHtml(timeline.character.name_ko)}의 동선 타임라인을 해금하세요.</div>`;
    }

    if (timeline.segments.length === 0) {
      return `<div class="empty-stage-note" style="padding:7px 10px;font-size:11.5px;">오늘(${escapeHtml(timeline.date)}) 확인된 출현 동선이 없습니다. (하와이 해외 일정 또는 온천/잔류 분기 확인)</div>`;
    }

    const hasEarly = timeline.segments.some((s) => s.startMinute < 360);
    const minStart = hasEarly ? 0 : 360;
    const span = 1440 - minStart;

    const segsHtml = timeline.segments
      .map((seg) => {
        const leftPct = Math.max(0, ((seg.startMinute - minStart) / span) * 100);
        const widthPct = Math.max(2.5, ((seg.endMinute - seg.startMinute) / span) * 100);
        const label = seg.hasEvent ? `★ ${seg.locationName}` : seg.locationName;
        const title = `${seg.startLabel}~${seg.endLabel} ${seg.locationName}${seg.eventTitle ? ` — ★ ${seg.eventTitle}` : ''}`;
        return `<button type="button" class="timeline-seg ${seg.hasEvent ? 'is-event' : ''} ${seg.activeNow ? 'active-now' : ''}"
          style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%"
          title="${escapeHtml(title)}" data-quick-travel="${seg.locationId}">
          ${compact ? '' : escapeHtml(label)}
        </button>`;
      })
      .join('');

    let needleHtml = '';
    if (timeline.currentMinute !== null && timeline.currentMinute >= minStart) {
      const needlePct = Math.min(100, Math.max(0, ((timeline.currentMinute - minStart) / span) * 100));
      needleHtml = `<div class="timeline-needle" style="left:${needlePct.toFixed(2)}%" title="현재 시각 ${formatMinutes(timeline.currentMinute)}"></div>`;
    }

    const ticks = hasEarly
      ? ['00:00', '06:00', '12:00', '18:00', '24:00']
      : ['06:00', '10:00', '14:00', '18:00', '22:00', '24:00'];

    const chipsHtml = compact
      ? ''
      : `<div class="timeline-chips">${timeline.segments
          .map(
            (seg) => `<button type="button" class="timeline-chip ${seg.hasEvent ? 'is-event' : ''}" data-quick-travel="${seg.locationId}">
              ${seg.hasEvent ? '★' : '•'} ${seg.startLabel}~${seg.endLabel} ${escapeHtml(seg.locationName)}
            </button>`
          )
          .join('')}</div>`;

    return `<div class="timeline-track-wrap ${compact ? 'mini-timeline-wrap' : ''}">
      <div class="timeline-track">${segsHtml}${needleHtml}</div>
      <div class="timeline-ticks">${ticks.map((t) => `<span>${t}</span>`).join('')}</div>
      ${chipsHtml}
    </div>`;
  }

  function renderMapTimeline() {
    // Populate heroine select once
    if (el.timelineHeroineSelect.options.length === 0) {
      const allOptions = [...engine.heroines, engine.charMap.get('chr_akira')].filter(Boolean);
      el.timelineHeroineSelect.innerHTML = allOptions
        .map((c) => `<option value="${c.id}">${escapeHtml(c.name_ko)} (${SPAWN_LABELS[c.spawn_pattern] || c.spawn_pattern})</option>`)
        .join('');
    }
    el.timelineHeroineSelect.value = uiState.selectedTimelineCharId;

    const timeline = engine.getDayTimelineForHeroine(uiState.selectedTimelineCharId, engine.state.dayIndex);
    el.mapTimelineBody.innerHTML = renderTimelineTrackHtml(timeline, false);
  }

  function renderZoneTabs() {
    const activeZones = new Set(engine.getActiveZones());
    const radar = engine.getWorldNpcRadar();
    const isEasy = engine.state.mode === 'easy_remake';

    el.zoneTabs.innerHTML = DATA.zones
      .map((zone) => {
        const isActiveTab = zone.id === uiState.selectedZoneId;
        const isLocked = !activeZones.has(zone.id);
        const zoneNpcs = radar.byZone[zone.id] || [];
        const eventCount = zoneNpcs.filter((n) => n.hasEvent).length;

        let badges = '';
        if (isLocked) {
          badges = `<span class="count-pill">잠금</span>`;
        } else if (isEasy) {
          if (eventCount > 0) badges += `<span class="event-pill">! ${eventCount}</span>`;
          if (zoneNpcs.length > 0) badges += `<span class="count-pill">${zoneNpcs.length}명</span>`;
        }

        return `<button class="zone-tab ${isActiveTab ? 'active' : ''} ${isLocked ? 'locked' : ''}"
          type="button" data-zone="${zone.id}" ${isLocked ? 'title="현재 날짜/분기에서 접근 불가"' : ''}>
          <span>${escapeHtml(zone.name_ko)}</span>${badges}
        </button>`;
      })
      .join('');
  }

  function renderTownMap() {
    const zoneId = uiState.selectedZoneId;
    const coords = MAP_COORDS[zoneId] || {};
    const zoneLocs = DATA.locations.filter((l) => l.zone_id === zoneId);
    const zoneLocSet = new Set(zoneLocs.map((l) => l.id));
    const radar = engine.getWorldNpcRadar();
    const isEasy = engine.state.mode === 'easy_remake';
    const showJan6Warn = engine.isOnsenHomeReturnWarningActive() && engine.state.leftHomeOnJan6;

    const drawnEdges = new Set();
    let edgesSvg = '';
    let crossZoneIndicators = '';

    for (const loc of zoneLocs) {
      const p1 = coords[loc.id];
      if (!p1) continue;
      for (const edge of loc.connected_to) {
        if (zoneLocSet.has(edge.target_id)) {
          const key = [loc.id, edge.target_id].sort().join('--');
          if (drawnEdges.has(key)) continue;
          drawnEdges.add(key);
          const p2 = coords[edge.target_id];
          if (!p2) continue;
          const stroke =
            edge.mode === 'train'
              ? '#f6b868'
              : edge.mode === 'town_map'
                ? '#4c6594'
                : '#5ec8e8';
          const dash = edge.mode === 'town_map' ? 'stroke-dasharray="4 4"' : '';
          edgesSvg += `<line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${stroke}" stroke-width="${edge.mode === 'town_map' ? 1.5 : 2.2}" stroke-opacity="0.58" ${dash}/>`;
        } else {
          const target = engine.locMap.get(edge.target_id);
          if (!target) continue;
          const targetZone = engine.zoneMap.get(target.zone_id);
          const label = edge.mode === 'train' ? `🚃 ${targetZone.name_ko} (+30분)` : `➔ ${targetZone.name_ko} (+${edge.travel_minutes}분)`;
          const offsetY = p1.y > 200 ? 34 : -34;
          crossZoneIndicators += `<g class="cross-portal" data-portal-zone="${target.zone_id}" style="cursor:pointer">
            <rect x="${p1.x - 62}" y="${p1.y + offsetY - 12}" width="124" height="22" rx="11" fill="rgba(246,184,104,0.18)" stroke="#f6b868" stroke-width="1.2"/>
            <text x="${p1.x}" y="${p1.y + offsetY + 3}" text-anchor="middle" fill="#ffd996" font-size="10.5" font-weight="700">${escapeHtml(label)}</text>
          </g>`;
        }
      }
    }

    let nodesSvg = '';
    for (const loc of zoneLocs) {
      const pt = coords[loc.id];
      if (!pt) continue;
      const isCurrent = loc.id === engine.state.locationId;
      const route = engine.computeShortestTravel(engine.state.locationId, loc.id);
      const isClosed = route.reachable && !route.openOk;
      const npcsHere = radar.byLocation[loc.id] || [];
      const showPins = isEasy || isCurrent;
      const hasEvent = showPins && npcsHere.some((n) => n.hasEvent);
      const isJan6Trap = showJan6Warn && (loc.id === 'loc_home_living' || loc.id === 'loc_home_room');
      const hasPhone = engine.canUsePhone(loc.id).canCall;

      const fill = isCurrent
        ? '#1d4e78'
        : isJan6Trap
          ? '#4a1b2b'
          : isClosed
            ? '#131c30'
            : '#182849';
      const stroke = isCurrent
        ? '#67d5f7'
        : hasEvent
          ? '#f6b868'
          : isJan6Trap
            ? '#fb7185'
            : 'rgba(174,204,255,0.45)';

      const boxW = Math.max(92, pt.short.length * 10.5 + 24);
      const boxH = 30;
      const rx = pt.x - boxW / 2;
      const ry = pt.y - boxH / 2;

      let npcDotsSvg = '';
      if (showPins && npcsHere.length > 0) {
        npcsHere.slice(0, 4).forEach((n, idx) => {
          const st = CHAR_STYLES[n.characterId] || { accent: '#f2849e' };
          npcDotsSvg += `<circle cx="${rx + 12 + idx * 11}" cy="${ry + boxH + 1}" r="4.5" fill="${st.accent}" stroke="#09101f" stroke-width="1.3"/>`;
        });
      }

      let eventBadgeSvg = '';
      if (hasEvent) {
        eventBadgeSvg = `<g transform="translate(${rx + boxW - 2}, ${ry + 1})">
          <circle cx="0" cy="0" r="9.5" fill="#f6b868" stroke="#10172b" stroke-width="1.5"/>
          <text x="0" y="3.8" text-anchor="middle" fill="#10172b" font-size="12" font-weight="900">!</text>
        </g>`;
      }

      let costBadgeSvg = '';
      if (!isCurrent && route.reachable && isEasy) {
        const badgeTxt = isClosed ? '마감' : `+${route.travelMinutes}m`;
        const badgeBg = isClosed ? '#3f2030' : '#0d182f';
        const badgeFg = isClosed ? '#fda4af' : '#9ed9ff';
        costBadgeSvg = `<g transform="translate(${rx + 18}, ${ry - 1})">
          <rect x="-18" y="-8" width="36" height="15" rx="7" fill="${badgeBg}" stroke="rgba(174,204,255,0.35)" stroke-width="0.9"/>
          <text x="0" y="2.8" text-anchor="middle" fill="${badgeFg}" font-size="9.5" font-weight="700">${badgeTxt}</text>
        </g>`;
      }

      const phoneMark = hasPhone
        ? `<text x="${rx + boxW - 11}" y="${ry + boxH - 4}" text-anchor="middle" fill="#7dd3fc" font-size="9" opacity="0.85">☎</text>`
        : '';

      const currentRing = isCurrent
        ? `<rect x="${rx - 4}" y="${ry - 4}" width="${boxW + 8}" height="${boxH + 8}" rx="12" fill="none" stroke="#67d5f7" stroke-opacity="0.45" stroke-width="2"/>`
        : '';

      nodesSvg += `<g class="map-node ${isCurrent ? 'current' : ''} ${isClosed ? 'closed' : ''}" data-loc-id="${loc.id}">
        ${currentRing}
        <rect class="node-body" x="${rx}" y="${ry}" width="${boxW}" height="${boxH}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${isCurrent || hasEvent ? 2.2 : 1.3}"/>
        <text x="${pt.x}" y="${pt.y + 4}" text-anchor="middle" fill="${isClosed ? '#8aa0c4' : '#f1f5ff'}" font-size="11.5" font-weight="${isCurrent ? 800 : 600}">${escapeHtml(pt.short)}</text>
        ${phoneMark}
        ${npcDotsSvg}
        ${costBadgeSvg}
        ${eventBadgeSvg}
      </g>`;
    }

    const zoneDef = engine.zoneMap.get(zoneId);
    const watermark = `<text x="16" y="26" fill="rgba(196,219,255,0.22)" font-size="16" font-weight="800" letter-spacing="2">${escapeHtml(zoneDef.name_ja)} · ${escapeHtml(zoneDef.name_ko)}</text>`;

    el.townMapSvg.innerHTML = `${watermark}${edgesSvg}${crossZoneIndicators}${nodesSvg}`;
  }

  function renderSceneStage() {
    const loc = engine.locMap.get(engine.state.locationId);
    const zone = engine.zoneMap.get(engine.state.zoneId);
    const timeSlot = engine.getTimeSlotMeta();
    const present = engine.getPresentNpcs(engine.state.dayIndex, engine.state.minuteOfDay, engine.state.locationId);
    const availableEvents = engine.getAvailableEvents(engine.state.locationId);
    const phoneStatus = engine.canUsePhone(engine.state.locationId);

    el.sceneBackdropSvg.innerHTML = renderLocationBackdropSvg(loc, timeSlot);
    el.stageZonePill.textContent = `${zone.name_ko} (${zone.name_ja})`;
    el.stageLocTitle.textContent = `${loc.name_ko} · ${loc.name_ja}`;
    el.stageLocMeta.textContent = `${loc.indoor ? '실내' : '실외'} · 개방 ${formatMinutes(loc.open_minute)}~${formatMinutes(loc.close_minute)}${phoneStatus.canCall ? ` · ☎ ${phoneStatus.label_ko}` : ''}`;

    if (availableEvents.length > 0) {
      el.stageQuickEvents.innerHTML = availableEvents
        .map(
          (ev) => `<button class="btn btn-amber btn-sm" type="button" data-trigger-event="${ev.id}">
            ${ev.scene_type === 'minigame_event' ? '🎾' : '★'} ${escapeHtml(ev.title_ko)} (+${ev.time_cost_minutes}분)
          </button>`
        )
        .join('');
    } else {
      el.stageQuickEvents.innerHTML = '';
    }

    if (present.length === 0) {
      el.stageNpcStrip.innerHTML = `<div class="empty-stage-note">현재 이 장소에 머물고 있는 인물이 없습니다. 시간을 보내거나 전화(📞)로 소재지를 확인해 보세요.</div>`;
    } else {
      el.stageNpcStrip.innerHTML = present
        .map((p) => {
          const ch = p.character;
          const aff = ch.romanceable ? engine.state.affection[ch.id] ?? 0 : null;
          const moodVal = ch.romanceable ? engine.state.mood[ch.id] ?? 50 : null;
          const moodMeta = moodVal !== null ? engine.getMoodMeta(moodVal) : null;
          const evMatch = availableEvents.find((e) => e.character_id === ch.id);
          return `<div class="npc-stage-card ${evMatch ? 'has-event' : ''}">
            <div class="npc-avatar-box">${renderCharacterAvatarSvg(ch.id, 54)}</div>
            <div class="npc-card-info">
              <div class="npc-card-name">
                <span>${escapeHtml(ch.name_ko)}</span>
                <span class="tag tag-sky">${SPAWN_LABELS[ch.spawn_pattern] || ch.spawn_pattern}</span>
                ${moodMeta ? `<span class="mood-pill" title="기분 ${moodVal}/100">${moodMeta.icon} ${moodMeta.label_ko}</span>` : ''}
              </div>
              <div class="npc-card-sub">${escapeHtml(ch.occupation_ko)}${aff !== null ? ` · ♥${aff}` : ''}</div>
              <div class="npc-card-actions">
                <button class="btn btn-sm btn-ghost" type="button" data-talk-npc="${ch.id}">대화 (0분)</button>
                <button class="btn btn-sm btn-ghost" type="button" data-focus-timeline="${ch.id}">🕒 동선</button>
                ${
                  evMatch
                    ? `<button class="btn btn-sm btn-amber" type="button" data-trigger-event="${evMatch.id}">${evMatch.scene_type === 'minigame_event' ? '🎾 테니스 승부' : '★ 이벤트'}</button>`
                    : ''
                }
              </div>
            </div>
          </div>`;
        })
        .join('');
    }
  }

  function renderDialogue() {
    el.dialogueSpeaker.textContent = uiState.dialogue.speaker;
    el.dialogueMeta.textContent = uiState.dialogue.meta;
    el.dialogueText.textContent = uiState.dialogue.text;

    const imp = engine.state.lastImpact;
    if (imp) {
      const parts = [];
      if (imp.affectionDelta !== 0) parts.push(`♥${imp.affectionDelta > 0 ? '+' : ''}${imp.affectionDelta}`);
      if (imp.moodDelta !== 0) parts.push(`기분${imp.moodDelta > 0 ? '+' : ''}${imp.moodDelta}`);
      el.impactToast.textContent = `${imp.characterName} · ${parts.join(' / ')}`;
      el.impactToast.classList.toggle('negative', imp.moodDelta < 0 || imp.affectionDelta < 0);
      el.impactToast.classList.remove('hidden');
    } else {
      el.impactToast.classList.add('hidden');
    }
  }

  function renderSidebar() {
    renderNotebookTab();
    renderFlagsTab();
    renderLogTab();
  }

  function renderNotebookTab() {
    const list = engine.getHeroineProgressList();
    const isEasy = engine.state.mode === 'easy_remake';

    const filtered = list.filter((item) => {
      if (uiState.notebookFilter === 'active') return Boolean(item.currentPresence);
      if (uiState.notebookFilter === 'progress') return item.completedMilestones > 0 || item.affection > 0;
      return true;
    });

    if (filtered.length === 0) {
      el.notebookList.innerHTML = `<div class="empty-stage-note">조건에 해당하는 히로인이 없습니다.</div>`;
      return;
    }

    el.notebookList.innerHTML = filtered
      .map((item) => {
        const h = item.character;
        const expanded = uiState.expandedHeroines.has(h.id);
        let statusBadge = '';
        if (item.isComplete) {
          statusBadge = `<span class="tag tag-emerald">루트 완료</span>`;
        } else if (item.isLocked) {
          statusBadge = `<span class="tag tag-danger">분기 잠김</span>`;
        } else if (isEasy && item.currentPresence) {
          statusBadge = `<span class="tag ${item.currentPresence.hasEvent ? 'tag-amber' : 'tag-sky'}">${
            item.currentPresence.hasEvent ? '! ' : ''
          }${escapeHtml(item.currentPresence.location.name_ko)}</span>`;
        } else {
          statusBadge = `<span class="tag tag-dark">${SPAWN_LABELS[h.spawn_pattern]}</span>`;
        }

        const detailsHtml = expanded
          ? `<div class="heroine-details">
              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">
                <span><strong>소속:</strong> ${escapeHtml(h.affiliation)} · <strong>기분:</strong> ${item.moodMeta.icon} ${item.moodMeta.label_ko} (${item.mood})</span>
                <button class="btn btn-sm btn-sky" type="button" data-open-phone-for="${h.id}">📞 전화</button>
              </div>
              <div style="margin-top:2px"><strong>오늘의 동선 (${escapeHtml(item.timeline.date)}):</strong></div>
              ${renderTimelineTrackHtml(item.timeline, true)}
              ${item.events
                .map((ev) => {
                  const sDay = DATA.days[ev.day_start - 1].date;
                  const eDay = DATA.days[ev.day_end - 1].date;
                  const dRange = ev.day_start === ev.day_end ? sDay : `${sDay}~${eDay}`;
                  const icon = ev.completed ? '✔' : ev.blocked ? '✖' : '○';
                  return `<div class="milestone-row ${ev.completed ? 'done' : ev.blocked ? 'blocked' : ''}">
                    <span>${icon}</span>
                    <span>${escapeHtml(ev.title_ko)} <em>(${dRange} ${formatMinutes(ev.start_minute)}~${formatMinutes(ev.end_minute)} · ${escapeHtml(ev.locationName)})</em></span>
                  </div>`;
                })
                .join('')}
            </div>`
          : '';

        return `<div class="heroine-card ${item.isComplete ? 'complete' : ''} ${item.isLocked ? 'locked' : ''}">
          <div class="heroine-top" data-toggle-heroine="${h.id}">
            <div class="mini-avatar">${renderCharacterAvatarSvg(h.id, 40)}</div>
            <div class="heroine-meta">
              <div class="heroine-name-row">
                <span class="heroine-name">${escapeHtml(h.name_ko)} <span class="mood-pill">${item.moodMeta.icon} ${item.mood}</span></span>
                ${statusBadge}
              </div>
              <div class="dual-meters">
                <div class="meter-wrap">
                  <div class="meter-bar" title="친밀도 ${item.affection}/100"><div class="meter-fill" style="width:${item.affection}%"></div></div>
                  <span class="meter-val">${item.completedMilestones}/${item.totalMilestones} · ♥${item.affection}</span>
                </div>
                <div class="meter-wrap" style="margin-top:0">
                  <div class="meter-bar" style="height:4px" title="기분 ${item.mood}/100"><div class="mood-fill ${item.mood < 40 ? 'low' : ''}" style="width:${item.mood}%"></div></div>
                  <span class="meter-val" style="font-size:10px">기분 ${item.moodMeta.label_ko}</span>
                </div>
              </div>
            </div>
          </div>
          ${
            isEasy && item.nextHint && !item.isComplete
              ? `<div class="heroine-hint">${escapeHtml(item.nextHint)}</div>`
              : ''
          }
          ${detailsHtml}
        </div>`;
      })
      .join('');
  }

  function renderFlagsTab() {
    const activeFlags = engine.getActiveFlags();
    const completed = engine.state.completedEvents;
    const mxStatus = engine.getMutualExclusionStatus();

    el.flagStatsRow.innerHTML = `
      <div class="stat-box"><strong>${activeFlags.length}/${DATA.flags.length}</strong><span>활성 플래그</span></div>
      <div class="stat-box"><strong>${completed.length}/${DATA.events.length}</strong><span>완료 이벤트</span></div>
      <div class="stat-box"><strong>${engine.getWorldNpcRadar().totalActive}명</strong><span>현재 출현 NPC</span></div>
    `;

    el.mxList.innerHTML = mxStatus
      .map((mx) => {
        const badge = mx.resolved
          ? `<span class="tag tag-amber">분기 확정</span>`
          : `<span class="tag tag-sky">미결정</span>`;
        const detail = mx.resolved
          ? `선택됨: <strong>${mx.activeFlags.join(', ')}</strong> · 잠김: ${mx.lockedFlags.join(', ')}`
          : `배타 후보: ${mx.exclusive_flags.join(' / ')}`;
        return `<div class="mx-card ${mx.resolved ? 'active' : ''}">
          <div class="mx-title"><span>${escapeHtml(mx.id)}</span>${badge}</div>
          <div>${escapeHtml(mx.description)}</div>
          <div style="margin-top:4px;color:#ffd996">${detail}</div>
        </div>`;
      })
      .join('');

    const youkoActive = engine.hasFlag('flg_youko_ending_override_active');
    const jan6Warn = engine.isOnsenHomeReturnWarningActive();
    const jan6Broken = engine.hasFlag('flg_onsen_jan6_home_broken');
    el.specialRulesList.innerHTML = `
      <div class="mx-card ${youkoActive ? 'warn' : ''}">
        <div class="mx-title"><span>미나미카와 요코 우선권 트랩</span><span class="tag ${youkoActive ? 'tag-danger' : 'tag-dark'}">${youkoActive ? '발동 (1000)' : '대기'}</span></div>
        <div>활성화 시 1/7 엔딩 판정에서 타 히로인 완료 플래그보다 우선 덮어쓰기 됩니다.</div>
      </div>
      <div class="mx-card ${jan6Broken || jan6Warn ? 'warn' : ''}">
        <div class="mx-title"><span>1/6 자택 귀가 금지 제약</span><span class="tag ${jan6Broken ? 'tag-danger' : jan6Warn ? 'tag-amber' : 'tag-dark'}">${jan6Broken ? '위반됨' : jan6Warn ? '주의 구간' : '정상'}</span></div>
        <div>온천 연계 루트 진행 중 1월 6일에 외출 후 자택 거실·방으로 복귀하면 플래그가 파손됩니다.</div>
      </div>
    `;

    el.activeFlagsChips.innerHTML = activeFlags
      .map((flg) => {
        const def = engine.flagMap.get(flg);
        const isFail = def && (def.scope === 'fail' || def.scope === 'trap');
        return `<span class="flag-chip ${isFail ? 'fail' : ''}" title="${escapeHtml(def ? def.description : flg)}">${escapeHtml(flg)}</span>`;
      })
      .join('');

    el.completedEventsList.innerHTML = completed
      .slice()
      .reverse()
      .map((id) => {
        const ev = engine.eventMap.get(id);
        return `<div class="completed-event-item">✔ ${escapeHtml(ev ? ev.title_ko : id)}</div>`;
      })
      .join('');
  }

  function renderLogTab() {
    el.historyLogList.innerHTML = engine.state.historyLog
      .map(
        (entry) => `<div class="log-item type-${escapeHtml(entry.type)}">
          <div class="log-time">[${escapeHtml(entry.date)} ${formatMinutes(entry.minute)}]</div>
          <div>${escapeHtml(entry.text)}</div>
        </div>`
      )
      .join('');
  }

  // ===== Phone Directory Modal =====
  function findNearestPhoneLocation() {
    const activeZones = new Set(engine.getActiveZones());
    let best = null;
    for (const cl of DATA.callable_locations || []) {
      const loc = engine.locMap.get(cl.location_id);
      if (!loc || !activeZones.has(loc.zone_id)) continue;
      const route = engine.computeShortestTravel(engine.state.locationId, cl.location_id);
      if (!route.reachable || !route.openOk) continue;
      if (!best || route.travelMinutes < best.travelMinutes) {
        best = { ...cl, location: loc, travelMinutes: route.travelMinutes };
      }
    }
    return best;
  }

  function openPhoneModal(focusCharId = null) {
    renderPhoneModal(focusCharId);
    el.phoneModal.classList.remove('hidden');
  }

  function closePhoneModal() {
    el.phoneModal.classList.add('hidden');
  }

  function renderPhoneModal(focusCharId = null) {
    const phoneStatus = engine.canUsePhone();
    el.phoneModalStatusTag.textContent = phoneStatus.canCall
      ? `${phoneStatus.phoneType === 'payphone' ? '☎️ 공중전화' : '🏠 자택 전화'} · ${phoneStatus.label_ko}`
      : '⚠ 전화기 없는 장소';
    el.phoneModalStatusTag.className = `tag ${phoneStatus.canCall ? 'tag-sky' : 'tag-danger'}`;

    if (!phoneStatus.canCall) {
      const nearest = findNearestPhoneLocation();
      el.phoneLocationNotice.innerHTML = `
        <span>현재 위치(${escapeHtml(phoneStatus.locationName)})에는 전화기가 없습니다. 자택·역·세븐마트·교문 앞 공중전화에서 걸 수 있습니다.</span>
        ${nearest ? `<button class="btn btn-sm btn-amber" type="button" data-quick-travel-phone="${nearest.location_id}">${escapeHtml(nearest.location.name_ko)} 이동 (+${nearest.travelMinutes}분)</button>` : ''}
      `;
      el.phoneLocationNotice.classList.remove('hidden');
    } else {
      el.phoneLocationNotice.classList.add('hidden');
    }

    if (uiState.lastPhoneResult) {
      const r = uiState.lastPhoneResult;
      const travelTarget = r.currentSegment || r.upcomingSegment;
      const statBadge =
        r.affectionDelta || r.moodDelta
          ? `<span class="tag tag-emerald">♥+${r.affectionDelta} · 기분+${r.moodDelta}</span>`
          : '';
      el.phoneCallResult.innerHTML = `
        <div class="mini-avatar" style="width:52px;height:52px">${renderCharacterAvatarSvg(r.character.id, 52)}</div>
        <div class="phone-call-result-body">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
            <strong>${escapeHtml(r.character.name_ko)}</strong>
            <span class="tag tag-dark">${escapeHtml(r.phoneLabel)}</span>
            ${statBadge}
          </div>
          <div>"${escapeHtml(r.responseLine)}"</div>
          <div class="phone-whereabouts">
            📍 ${escapeHtml(r.whereaboutsHint)}
            ${r.nextEventHint ? `<div style="margin-top:3px;color:#ffd996">★ ${escapeHtml(r.nextEventHint)}</div>` : ''}
          </div>
          ${
            travelTarget
              ? `<div style="margin-top:7px"><button class="btn btn-sm btn-sky" type="button" data-quick-travel-from-phone="${travelTarget.locationId}">${escapeHtml(travelTarget.locationName)}(으)로 바로 이동</button></div>`
              : ''
          }
        </div>
      `;
      el.phoneCallResult.classList.remove('hidden');
    } else {
      el.phoneCallResult.classList.add('hidden');
    }

    const contacts = engine.getCallableHeroines();
    // Put incoming phone events first, then focused contact, then rest
    contacts.sort((a, b) => {
      if ((b.hasIncomingPhoneEvent ? 1 : 0) !== (a.hasIncomingPhoneEvent ? 1 : 0)) {
        return (b.hasIncomingPhoneEvent ? 1 : 0) - (a.hasIncomingPhoneEvent ? 1 : 0);
      }
      if (focusCharId) {
        if (a.characterId === focusCharId) return -1;
        if (b.characterId === focusCharId) return 1;
      }
      return 0;
    });

    el.phoneDirectoryList.innerHTML = contacts
      .map((c) => {
        const ch = c.character;
        const hoursStr = `${formatMinutes(c.call_hours.start_minute)}~${formatMinutes(c.call_hours.end_minute)}`;
        const statusTag = c.hasIncomingPhoneEvent
          ? `<span class="tag tag-amber">☎ 특별 전화!</span>`
          : !c.hasRequiredFlags
            ? `<span class="tag tag-dark">연락처 미교환</span>`
            : c.isUnavailableDay
              ? `<span class="tag tag-danger">부재중</span>`
              : c.moodMeta
                ? `<span class="mood-pill">${c.moodMeta.icon} ${c.moodMeta.label_ko} · ♥${c.affection}</span>`
                : `<span class="tag tag-sky">통화 가능</span>`;

        const btnLabel = c.hasIncomingPhoneEvent
          ? '☎ 받기'
          : '전화 (-5분)';
        const disabled = !phoneStatus.canCall || (!c.hasRequiredFlags && !c.hasIncomingPhoneEvent) || engine.state.ended;

        return `<div class="phone-card ${c.hasIncomingPhoneEvent ? 'incoming' : ''} ${!c.hasRequiredFlags ? 'locked' : ''}">
          <div class="mini-avatar">${renderCharacterAvatarSvg(ch.id, 40)}</div>
          <div class="phone-card-info">
            <div class="phone-card-name">
              <span>${escapeHtml(ch.name_ko)}</span>
              ${statusTag}
            </div>
            <div class="phone-card-sub">${escapeHtml(c.phone_label_ko)} (${hoursStr})</div>
            ${c.unavailableReason ? `<div class="phone-card-sub" style="color:#fda4af">${escapeHtml(c.unavailableReason)}</div>` : ''}
          </div>
          <button class="btn btn-sm ${c.hasIncomingPhoneEvent ? 'btn-amber' : 'btn-sky'}" type="button" data-call-char="${ch.id}" ${disabled ? 'disabled' : ''}>${btnLabel}</button>
        </div>`;
      })
      .join('');
  }

  function handlePlacePhoneCall(charId) {
    const res = engine.callHeroine(charId);
    if (!res.ok) {
      setDialogue('전화 불가', res.message);
      renderAll();
      renderPhoneModal(charId);
      return;
    }

    if (res.status === 'INCOMING_EVENT' && res.triggeredPhoneEvent) {
      uiState.lastPhoneResult = null;
      closePhoneModal();
      renderAll();
      openEventModal(res.triggeredPhoneEvent, { viaPhone: true });
      return;
    }

    uiState.lastPhoneResult = res;
    if (res.character.romanceable) {
      uiState.selectedTimelineCharId = res.character.id;
    }
    setDialogue(res.character.name_ko, `☎ "${res.responseLine}" (${res.whereaboutsHint})`);

    if (res.rolledOver && res.rolloverResult && res.rolloverResult.ended) {
      closePhoneModal();
      recordUnlockedEnding(res.rolloverResult.ending.id);
      renderAll();
      openEndingModal(res.rolloverResult.ending);
      return;
    }

    renderAll();
    renderPhoneModal(charId);
  }

  // ===== Event Scene & Interactive Misa Tennis Minigame Modal =====
  function renderTennisMinigameWidget() {
    const match = engine.state.activeTennisMatch;
    if (!match) return;

    const shots = Object.values(TENNIS_SHOTS);
    const courtSvg = renderTennisCourtSvg(match);
    const logHtml = match.turnHistory
      .slice(-3)
      .reverse()
      .map(
        (r) => `<div class="tennis-rally-item ${r.outcome === 'player_point' ? 'win' : 'lose'}">
          <strong>랠리 #${r.rallyNumber}</strong> [${escapeHtml(r.shotLabel)} vs ${escapeHtml(r.misaStanceLabel)}] — ${escapeHtml(r.commentary)} (${r.playerScore}:${r.misaScore})
        </div>`
      )
      .join('');

    if (match.finished) {
      const won = match.winner === 'player';
      const evRes = uiState.tennisEventResult;
      const postLine =
        evRes && evRes.script && evRes.script.lines && evRes.script.lines[0]
          ? evRes.script.lines[0].text
          : won
            ? '대단한데, 류노스케! 졌으니까 1층 찻집 커피는 내가 쏠게. 내일 12시 45분 키사라기역 데이트 잊지 마!'
            : '하하, 아직 내 실력을 따라오려면 멀었지! 그래도 재밌었어. 1층 찻집에서 한 잔 하면서 내일 데이트 계획 세우자!';
      const statSummary = evRes
        ? `♥+${evRes.affectionDelta} · 기분+${evRes.moodDelta} · 플래그: ${evRes.flagsSet.join(', ')}`
        : '';

      el.eventModalMinigame.innerHTML = `
        <div class="tennis-scoreboard">
          <span>🎾 12/29 테니스 승부 종료</span>
          <span class="tennis-score-num">나 ${match.playerScore} : ${match.misaScore} 미사</span>
        </div>
        ${courtSvg}
        <div class="tennis-result-banner ${won ? 'win' : 'lose'}">
          ${won ? '🏆 승리! 체육대생 미사를 꺾고 보너스 친밀도·기분치를 획득했습니다!' : '☕ 아쉽지만 패배 — 원작 규칙대로 승패 무관하게 1층 찻집 & 12/30 데이트로 이어집니다!'}
          <div style="font-size:11.5px;font-weight:500;margin-top:4px">${escapeHtml(statSummary)}</div>
        </div>
        <div class="event-line" style="margin-bottom:8px">
          <strong>타나카 미사</strong>
          <span>${escapeHtml(postLine)}</span>
        </div>
        <div class="tennis-rally-log">${logHtml}</div>
      `;

      el.eventModalFooter.innerHTML = `<button class="btn btn-amber" type="button" id="btn-finish-tennis-modal">1층 찻집으로 이동 (완료)</button>`;
      return;
    }

    el.eventModalMinigame.innerHTML = `
      <div class="tennis-scoreboard">
        <span>🎾 5포인트 선승 랠리 · 제 ${match.rallyNumber} 랠리</span>
        <span class="tennis-score-num">나 ${match.playerScore} : ${match.misaScore} 미사</span>
      </div>
      ${courtSvg}
      <div class="tennis-stance-box">
        <strong>🎯 미사 자세 포착 [${escapeHtml(match.misaStance.label_ko)}]:</strong> ${escapeHtml(match.misaStance.hint_ko)}
      </div>
      <div class="tennis-shot-grid">
        ${shots
          .map(
            (s) => `<button class="tennis-shot-btn" type="button" data-tennis-shot="${s.id}">
              <div>${s.icon} ${escapeHtml(s.label_ko)}</div>
              <span>${escapeHtml(s.desc_ko)}</span>
            </button>`
          )
          .join('')}
      </div>
      <div class="tennis-rally-log">
        ${logHtml || '<div class="tennis-rally-item">미사의 움직임을 읽고 반격 구질을 선택하세요! (승패 무관하게 1층 찻집으로 진행됩니다)</div>'}
      </div>
    `;

    el.eventModalFooter.innerHTML = `<button class="btn btn-ghost" type="button" id="btn-cancel-event">나중에 승부</button>`;
  }

  function openEventModal(eventObj, opts = {}) {
    uiState.activeModalEvent = eventObj;
    uiState.activeModalViaPhone = Boolean(opts.viaPhone);
    uiState.tennisEventResult = null;
    const script = eventObj.script;

    el.eventModalTag.textContent =
      eventObj.scene_type === 'phone_macro_branch'
        ? '☎ 마크로 분기 전화'
        : eventObj.scene_type === 'phone_event'
          ? '☎ 전화 이벤트'
          : eventObj.scene_type === 'minigame_event'
            ? '🎾 테니스 미니게임 승부'
            : eventObj.scene_type === 'seasonal_event'
              ? '❄️ 시즌 특별 이벤트'
              : eventObj.scene_type === 'milestone_abstracted'
                ? '★ 관계 확정 마일스톤'
                : '관계 이벤트';

    el.eventModalTitle.textContent = eventObj.title_ko;
    el.eventModalPortrait.innerHTML = renderCharacterAvatarSvg(eventObj.character_id, 112);
    el.eventModalNarration.textContent = script.narration;

    // Special interactive Misa Tennis Rally Minigame inside Event Modal!
    if (eventObj.id === 'evt_misa_tennis_match') {
      el.eventModalLines.innerHTML = '';
      el.eventModalChoices.innerHTML = '';
      el.eventModalMinigame.classList.remove('hidden');
      engine.startTennisMinigame();
      renderTennisMinigameWidget();
      el.eventModal.classList.remove('hidden');
      return;
    }

    el.eventModalMinigame.classList.add('hidden');
    el.eventModalMinigame.innerHTML = '';
    el.eventModalLines.innerHTML = (script.lines || [])
      .map(
        (l) => `<div class="event-line"><strong>${escapeHtml(l.speaker)}</strong><span>${escapeHtml(l.text)}</span></div>`
      )
      .join('');

    if (eventObj.options && eventObj.options.length > 0) {
      el.eventModalChoices.innerHTML = eventObj.options
        .map((opt) => {
          const deltaHint = [];
          if (opt.affection_delta !== null && opt.affection_delta !== 0) {
            deltaHint.push(`♥${opt.affection_delta > 0 ? '+' : ''}${opt.affection_delta}`);
          }
          if (opt.mood_delta !== null && opt.mood_delta !== 0) {
            deltaHint.push(`기분${opt.mood_delta > 0 ? '+' : ''}${opt.mood_delta}`);
          }
          const deltaStr = engine.state.mode === 'easy_remake' && deltaHint.length > 0 ? ` · ${deltaHint.join(' / ')}` : '';
          const lockNote = !opt.available
            ? opt.blockedByMutualExclusion
              ? `상호 배타 충돌 (${opt.blockedByMutualExclusion.id})`
              : `선행 조건 필요: ${opt.missingFlags.join(', ')}`
            : `설정 플래그: ${opt.sets_flags.join(', ')}${deltaStr}`;
          return `<button class="choice-btn" type="button" data-event-choice="${opt.index}" ${opt.available ? '' : 'disabled'}>
            ${escapeHtml(opt.choice_ko)}
            <span class="choice-sub">${escapeHtml(lockNote)}</span>
          </button>`;
        })
        .join('');
      el.eventModalFooter.innerHTML = `<button class="btn btn-ghost" type="button" id="btn-cancel-event">나중에 진행</button>`;
    } else {
      el.eventModalChoices.innerHTML = '';
      el.eventModalFooter.innerHTML = `
        <button class="btn btn-ghost" type="button" id="btn-cancel-event">닫기</button>
        <button class="btn btn-amber" type="button" data-event-choice="0">이벤트 완료 (+${eventObj.time_cost_minutes}분)</button>
      `;
    }

    el.eventModal.classList.remove('hidden');
  }

  function closeEventModal() {
    uiState.activeModalEvent = null;
    uiState.activeModalViaPhone = false;
    uiState.tennisEventResult = null;
    el.eventModal.classList.add('hidden');
  }

  function executeEventChoice(choiceIndex) {
    if (!uiState.activeModalEvent) return;
    const evId = uiState.activeModalEvent.id;
    const viaPhone = uiState.activeModalViaPhone;
    const res = engine.triggerEvent(evId, choiceIndex, { viaPhone });
    closeEventModal();

    if (!res.ok) {
      setDialogue('알림', res.message);
      renderAll();
      return;
    }

    const lastLine = res.script.lines[res.script.lines.length - 1];
    const statTag =
      res.affectionDelta || res.moodDelta
        ? ` | ♥${res.affectionDelta >= 0 ? '+' : ''}${res.affectionDelta}, 기분${res.moodDelta >= 0 ? '+' : ''}${res.moodDelta}`
        : '';
    setDialogue(
      lastLine ? lastLine.speaker : res.character.name_ko,
      `${lastLine ? lastLine.text : res.event.title_ko} (플래그: ${res.flagsSet.join(', ')}${statTag})`
    );

    if (res.rolledOver && res.rolloverResult && res.rolloverResult.ended) {
      recordUnlockedEnding(res.rolloverResult.ending.id);
      renderAll();
      openEndingModal(res.rolloverResult.ending);
      return;
    }

    uiState.selectedZoneId = engine.state.zoneId;
    renderAll();
  }

  // ===== Save / Load Modal =====
  function openSaveModal() {
    renderSaveSlots();
    el.saveModal.classList.remove('hidden');
  }

  function closeSaveModal() {
    el.saveModal.classList.add('hidden');
  }

  function renderSaveSlots() {
    el.saveSlotsList.innerHTML = SAVE_SLOTS.map((slotNum) => {
      const raw = readStorage(`${STORAGE_PREFIX}slot_${slotNum}`);
      let infoHtml = '<span>비어 있는 슬롯</span>';
      let hasData = false;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          const dayMeta = DATA.days[parsed.dayIndex];
          const loc = engine.locMap.get(parsed.locationId);
          hasData = true;
          infoHtml = `<span>${escapeHtml(formatDateLabel(dayMeta, parsed.dayIndex))} ${formatMinutes(parsed.minuteOfDay)} · ${escapeHtml(loc ? loc.name_ko : parsed.locationId)} · 완료 이벤트 ${(parsed.completedEvents || []).length}개</span>`;
        } catch {
          infoHtml = '<span>손상된 저장 데이터</span>';
        }
      }
      return `<div class="save-slot-card">
        <div class="save-slot-info">
          <strong>슬롯 ${slotNum}</strong>
          ${infoHtml}
        </div>
        <div class="save-slot-actions">
          <button class="btn btn-sm btn-amber" type="button" data-save-slot="${slotNum}">저장</button>
          <button class="btn btn-sm btn-sky" type="button" data-load-slot="${slotNum}" ${hasData ? '' : 'disabled'}>불러오기</button>
          ${hasData ? `<button class="btn btn-sm btn-outline" type="button" data-del-slot="${slotNum}">삭제</button>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  // ===== Ending Gallery Modal =====
  function openEndingModal(achievedEnding = null) {
    const unlocked = getUnlockedEndings();
    if (achievedEnding) {
      recordUnlockedEnding(achievedEnding.id);
      unlocked.add(achievedEnding.id);
      el.endingModalTag.textContent = `1월 7일 3학기 시업식 · 우선순위 ${achievedEnding.evaluation_priority}`;
      el.endingModalTitle.textContent = achievedEnding.title_ko;
      el.endingFeatured.innerHTML = `
        <div class="event-modal-portrait">${renderCharacterAvatarSvg(achievedEnding.character_id || 'chr_ryunosuke', 112)}</div>
        <div>
          <span class="tag tag-rose">${escapeHtml(achievedEnding.category)}</span>
          <h3 style="margin:6px 0">${escapeHtml(achievedEnding.title_ko)}</h3>
          <p style="margin:0;font-size:13.5px;color:#edf3ff">${escapeHtml(achievedEnding.epilogue)}</p>
        </div>
      `;
      el.endingFeatured.classList.remove('hidden');
    } else {
      el.endingModalTag.textContent = `달성 ${unlocked.size} / ${DATA.endings.length}`;
      el.endingModalTitle.textContent = '엔딩 도감 (19종 우선순위 테이블)';
      el.endingFeatured.classList.add('hidden');
    }

    const sorted = [...DATA.endings].sort((a, b) => b.evaluation_priority - a.evaluation_priority);
    el.endingGalleryGrid.innerHTML = sorted
      .map((end) => {
        const isUnlocked = unlocked.has(end.id);
        return `<div class="ending-tile ${isUnlocked ? 'unlocked' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span class="tag ${isUnlocked ? 'tag-emerald' : 'tag-dark'}">${isUnlocked ? '달성' : '미달성'}</span>
            <span style="font-size:11px;color:#8fa6cc">P:${end.evaluation_priority}</span>
          </div>
          <div class="ending-tile-title">${escapeHtml(end.title_ko)}</div>
          <div style="font-size:11px;color:#8fa6cc;margin-top:3px">필수: ${escapeHtml(end.required_flags.join(', '))}</div>
        </div>`;
      })
      .join('');

    el.endingModal.classList.remove('hidden');
  }

  function closeEndingModal() {
    el.endingModal.classList.add('hidden');
  }

  // ===== Shared Travel Helper =====
  function handleTravelTo(locId) {
    const res = engine.travelTo(locId);
    if (!res.ok) {
      setDialogue('이동 불가', res.message);
      renderAll();
      return false;
    }

    if (res.travelMinutes === 0) {
      setDialogue(res.location.name_ko, `이미 ${res.location.name_ko}에 머물고 있습니다.`);
    } else if (res.jan6HomeTrapTriggered) {
      setDialogue('⚠ 경고', '1월 6일 외출 후 자택으로 귀가하여 온천 연계 루트 플래그가 파손되었습니다!');
    } else {
      const names = res.presentNpcs.map((p) => p.character.name_ko);
      setDialogue(
        res.location.name_ko,
        `${res.location.name_ko}에 도착했습니다(+${res.travelMinutes}분). ${
          names.length > 0 ? `현재 ${names.join(', ')}이(가) 있습니다.` : '주변이 조용합니다.'
        }`
      );
    }

    if (res.rolledOver && res.rolloverResult && res.rolloverResult.ended) {
      recordUnlockedEnding(res.rolloverResult.ending.id);
      renderAll();
      openEndingModal(res.rolloverResult.ending);
      return true;
    }

    uiState.selectedZoneId = engine.state.zoneId;
    renderAll();

    if (res.promptEvent && res.promptEvent.scene_type === 'phone_macro_branch') {
      openEventModal(res.promptEvent);
    }
    return true;
  }

  // ===== Wire Event Listeners =====
  el.btnModeClassic.addEventListener('click', () => {
    engine.setMode('classic');
    setDialogue('시스템', '클래식 모드(1995 원작 준거): 맵 NPC 핀과 추천 동선을 숨깁니다. 전화(📞)와 대화로 직접 단서를 모아 보세요!');
    renderAll();
  });

  el.btnModeEasy.addEventListener('click', () => {
    engine.setMode('easy_remake');
    setDialogue('시스템', '이지 레이더 모드(2024 리메이크 준거): 실시간 NPC 핀, 이벤트(!), 24시간 동선 타임라인, 추천 동선 ETA를 표시합니다.');
    renderAll();
  });

  el.btnOpenPhone.addEventListener('click', () => openPhoneModal());
  el.btnDeckPhone.addEventListener('click', () => openPhoneModal());
  el.btnClosePhoneModal.addEventListener('click', closePhoneModal);
  el.btnPhoneClose.addEventListener('click', closePhoneModal);

  el.btnSaveLoad.addEventListener('click', openSaveModal);
  el.btnCloseSaveModal.addEventListener('click', closeSaveModal);
  el.btnEndings.addEventListener('click', () => {
    const achieved = engine.state.ended ? engine.evaluateEnding() : null;
    openEndingModal(achieved);
  });
  el.btnCloseEndingModal.addEventListener('click', closeEndingModal);
  el.btnEndingClose.addEventListener('click', closeEndingModal);
  el.btnCloseEventModal.addEventListener('click', closeEventModal);

  el.timelineHeroineSelect.addEventListener('change', () => {
    uiState.selectedTimelineCharId = el.timelineHeroineSelect.value;
    renderMapTimeline();
  });

  function startNewGame() {
    engine.reset({ mode: engine.state.mode });
    uiState.selectedZoneId = engine.state.zoneId;
    uiState.lastPhoneResult = null;
    uiState.tennisEventResult = null;
    setDialogue('안내', '12월 22일 08:00 — 새 겨울방학을 시작했습니다! 4존 지도를 클릭하거나 전화번호부로 히로인을 찾아보세요.');
    closeEndingModal();
    closeEventModal();
    closePhoneModal();
    renderAll();
  }

  el.btnNewGame.addEventListener('click', startNewGame);
  el.btnEndingNewGame.addEventListener('click', startNewGame);

  el.zoneTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-zone]');
    if (!btn) return;
    const zId = btn.dataset.zone;
    if (!engine.getActiveZones().includes(zId)) {
      setDialogue('이동 안내', `${engine.zoneMap.get(zId).name_ko} 지역은 현재 날짜·분기에서는 입장할 수 없습니다.`);
      renderDialogue();
      return;
    }
    uiState.selectedZoneId = zId;
    renderZoneTabs();
    renderTownMap();
  });

  el.townMapSvg.addEventListener('click', (e) => {
    const portal = e.target.closest('[data-portal-zone]');
    if (portal) {
      const zId = portal.dataset.portalZone;
      if (engine.getActiveZones().includes(zId)) {
        uiState.selectedZoneId = zId;
        renderZoneTabs();
        renderTownMap();
      }
      return;
    }

    const node = e.target.closest('[data-loc-id]');
    if (!node) return;
    handleTravelTo(node.dataset.locId);
  });

  el.townMapSvg.addEventListener('mouseover', (e) => {
    const node = e.target.closest('[data-loc-id]');
    if (!node) return;
    const locId = node.dataset.locId;
    const loc = engine.locMap.get(locId);
    const route = engine.computeShortestTravel(engine.state.locationId, locId);
    const radar = engine.getWorldNpcRadar();
    const isEasy = engine.state.mode === 'easy_remake';

    if (!route.reachable) {
      el.mapHoverInfo.textContent = `${loc.name_ko} — ${route.message}`;
      return;
    }

    const pathNames = route.path.map((id) => engine.locMap.get(id).name_ko).join(' → ');
    const npcs = isEasy ? (radar.byLocation[locId] || []).map((n) => `${n.hasEvent ? '!' : ''}${n.character.name_ko}`) : [];
    const npcStr = npcs.length > 0 ? ` | 출현: ${npcs.join(', ')}` : '';
    const phoneTag = engine.canUsePhone(locId).canCall ? ' · ☎전화' : '';
    const statusStr = route.openOk
      ? `도착 ${formatMinutes(route.arrivalMinute)} (+${route.travelMinutes}분)`
      : `이동 불가 (${route.message})`;

    el.mapHoverInfo.textContent = `${loc.name_ko}${phoneTag} [${formatMinutes(loc.open_minute)}~${formatMinutes(loc.close_minute)}] · ${statusStr} · 경로: ${pathNames}${npcStr}`;
  });

  // Delegated clicks across modals, stage, timeline, route guide, notebook
  document.addEventListener('click', (e) => {
    const quickTravel = e.target.closest('[data-quick-travel]');
    if (quickTravel) {
      handleTravelTo(quickTravel.dataset.quickTravel);
      return;
    }

    const quickTravelPhone = e.target.closest('[data-quick-travel-phone]');
    if (quickTravelPhone) {
      handleTravelTo(quickTravelPhone.dataset.quickTravelPhone);
      renderPhoneModal();
      return;
    }

    const quickTravelFromPhone = e.target.closest('[data-quick-travel-from-phone]');
    if (quickTravelFromPhone) {
      closePhoneModal();
      handleTravelTo(quickTravelFromPhone.dataset.quickTravelFromPhone);
      return;
    }

    const openPhoneFor = e.target.closest('[data-open-phone-for]');
    if (openPhoneFor) {
      openPhoneModal(openPhoneFor.dataset.openPhoneFor);
      return;
    }

    const callCharBtn = e.target.closest('[data-call-char]');
    if (callCharBtn) {
      handlePlacePhoneCall(callCharBtn.dataset.callChar);
      return;
    }

    const focusTlBtn = e.target.closest('[data-focus-timeline]');
    if (focusTlBtn) {
      uiState.selectedTimelineCharId = focusTlBtn.dataset.focusTimeline;
      renderMapTimeline();
      return;
    }

    const tennisShotBtn = e.target.closest('[data-tennis-shot]');
    if (tennisShotBtn) {
      const res = engine.playTennisTurn(tennisShotBtn.dataset.tennisShot);
      if (res.ok) {
        if (res.eventResult) {
          uiState.tennisEventResult = res.eventResult;
          const lastLine = res.eventResult.script.lines[0];
          setDialogue(
            lastLine ? lastLine.speaker : '타나카 미사',
            `${lastLine ? lastLine.text : '테니스 승부 완료!'} (♥+${res.eventResult.affectionDelta} / 기분+${res.eventResult.moodDelta})`
          );
          renderAll();
        }
        renderTennisMinigameWidget();
      }
      return;
    }

    if (e.target.id === 'btn-finish-tennis-modal') {
      closeEventModal();
      renderAll();
      return;
    }

    const talkBtn = e.target.closest('[data-talk-npc]');
    if (talkBtn) {
      const res = engine.talkToNpc(talkBtn.dataset.talkNpc);
      if (res.ok) {
        setDialogue(res.character.name_ko, res.line);
      } else {
        setDialogue('알림', res.message);
      }
      renderAll();
      return;
    }

    const evBtn = e.target.closest('[data-trigger-event]');
    if (evBtn) {
      const evId = evBtn.dataset.triggerEvent;
      const evObj = engine.getAvailableEvents(engine.state.locationId).find((x) => x.id === evId);
      if (evObj) openEventModal(evObj);
      return;
    }

    const choiceBtn = e.target.closest('[data-event-choice]');
    if (choiceBtn) {
      executeEventChoice(Number(choiceBtn.dataset.eventChoice));
      return;
    }

    if (e.target.id === 'btn-cancel-event') {
      closeEventModal();
      return;
    }

    const saveSlot = e.target.closest('[data-save-slot]');
    if (saveSlot) {
      const num = saveSlot.dataset.saveSlot;
      writeStorage(`${STORAGE_PREFIX}slot_${num}`, engine.serialize());
      renderSaveSlots();
      setDialogue('저장 완료', `슬롯 ${num}에 현재 겨울방학 진행 상태를 저장했습니다.`);
      renderDialogue();
      return;
    }

    const loadSlot = e.target.closest('[data-load-slot]');
    if (loadSlot) {
      const num = loadSlot.dataset.loadSlot;
      const raw = readStorage(`${STORAGE_PREFIX}slot_${num}`);
      if (raw) {
        try {
          engine.deserialize(raw);
          uiState.selectedZoneId = engine.state.zoneId;
          uiState.lastPhoneResult = null;
          closeSaveModal();
          setDialogue('불러오기 완료', `슬롯 ${num}의 저장 데이터를 불러왔습니다.`);
          renderAll();
        } catch (err) {
          setDialogue('불러오기 오류', err.message);
          renderDialogue();
        }
      }
      return;
    }

    const delSlot = e.target.closest('[data-del-slot]');
    if (delSlot) {
      removeStorage(`${STORAGE_PREFIX}slot_${delSlot.dataset.delSlot}`);
      renderSaveSlots();
      return;
    }

    const toggleH = e.target.closest('[data-toggle-heroine]');
    if (toggleH) {
      const id = toggleH.dataset.toggleHeroine;
      if (uiState.expandedHeroines.has(id)) uiState.expandedHeroines.delete(id);
      else uiState.expandedHeroines.add(id);
      uiState.selectedTimelineCharId = id;
      renderMapTimeline();
      renderNotebookTab();
    }
  });

  // Wait buttons
  document.querySelectorAll('[data-wait]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mins = Number(btn.dataset.wait);
      const res = engine.waitMinutes(mins);
      if (!res.ok) {
        setDialogue('알림', res.message);
        renderAll();
        return;
      }
      if (res.rolledOver && res.rolloverResult && res.rolloverResult.ended) {
        recordUnlockedEnding(res.rolloverResult.ending.id);
        renderAll();
        openEndingModal(res.rolloverResult.ending);
        return;
      }
      setDialogue('시간 경과', `${mins}분이 흘러 현재 시각은 ${formatMinutes(engine.state.minuteOfDay)}입니다.`);
      renderAll();
      const phone = res.availableEvents.find((ev) => ev.scene_type === 'phone_macro_branch');
      if (phone) openEventModal(phone);
    });
  });

  el.btnWaitNext.addEventListener('click', () => {
    const nextMin = engine.getNextScheduledMinuteToday();
    if (nextMin === null) return;
    const diff = nextMin - engine.state.minuteOfDay;
    if (diff <= 0) return;
    const res = engine.waitMinutes(diff);
    if (res.ok) {
      setDialogue('시간 경과', `다음 일정 시작 시각(${formatMinutes(engine.state.minuteOfDay)})까지 대기했습니다.`);
      renderAll();
      const phone = res.availableEvents.find((ev) => ev.scene_type === 'phone_macro_branch');
      if (phone) openEventModal(phone);
    }
  });

  el.btnSleepDay.addEventListener('click', () => {
    if (engine.state.ended) {
      openEndingModal(engine.evaluateEnding());
      return;
    }
    const res = engine.sleepToNextDay();
    if (!res.ok) return;
    if (res.ended) {
      recordUnlockedEnding(res.ending.id);
      setDialogue('1월 7일 3학기 시업식', `${res.ending.title_ko}에 도달했습니다!`);
      renderAll();
      openEndingModal(res.ending);
      return;
    }
    uiState.selectedZoneId = engine.state.zoneId;
    uiState.lastPhoneResult = null;
    const dayMeta = engine.getCurrentDayMeta();
    setDialogue('새로운 아침', `${formatDateLabel(dayMeta, engine.state.dayIndex)} ${formatMinutes(engine.state.minuteOfDay)} — ${dayMeta.special_notes}`);
    renderAll();
  });

  // Sidebar Tabs & Notebook Filters
  document.querySelectorAll('.sidebar-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      uiState.activeSidebarTab = tabBtn.dataset.tab;
      document.querySelectorAll('.sidebar-tab').forEach((b) => b.classList.toggle('active', b === tabBtn));
      document.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('active', p.id === `tab-${uiState.activeSidebarTab}`));
    });
  });

  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      uiState.notebookFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderNotebookTab();
    });
  });

  // Initial render
  renderAll();
})();
