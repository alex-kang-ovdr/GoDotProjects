/* EVE burst error — Playable Web UI Controller
 * Zero external CDNs; works via file:// and HTTP.
 * Connects index.html directly to globalThis.EVE_DATA + globalThis.EveEngine.
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'playhub.eve-burst-error.v1.slot.';
  var MANUAL_SLOTS = [1, 2, 3];
  var AUTO_SLOT = 'auto';

  var data = globalThis.EVE_DATA;
  var engine = globalThis.EveEngine.createEngine(data);

  var activeVerb = 'LOOK';
  var activeTab = 'timeline';
  var inspectedTimelineItem = null;
  var flashTimer = null;

  var IRONY_LABELS = {
    alias_mismatch: '별칭 불일치 (ALIAS MISMATCH)',
    dual_target_mirror: '대칭 보호 대상 (DUAL MIRROR)',
    split_artifact: '양분된 물증 (SPLIT ARTIFACT)',
    impostor_trap: '사칭 함정 (IMPOSTOR TRAP)',
    concurrent_sync: '동시 협공 (CONCURRENT SYNC)',
  };

  var CULPRIT_CANDIDATES = [
    { id: 'mayako_mido', submitValue: '미도 마야코', label: '미도 마야코 (御堂真弥子)', role: '로스=미도 대사의 딸 / 클론 μ-101' },
    { id: 'ross_mido', submitValue: '로스=미도', label: '로스=미도 (ロス＝御堂)', role: '주일 엘디아 대사' },
    { id: 'dib', submitValue: '디브', label: '디브 (ディーブ)', role: '엘디아 정보부 간부' },
    { id: 'genzaburo_katsuragi', submitValue: '카츠라기 겐자부로', label: '카츠라기 겐자부로 / 스즈키', role: '전 엘디아 정보국 테러 대장' },
    { id: 'celia_flat', submitValue: '시리아 플랫', label: '시리아 플랫 (シリア)', role: '예일 학교 아랍어 강사' },
    { id: 'aqua_still_lloyd', submitValue: '아쿠아=스틸=로이드', label: '아쿠아=스틸=로이드', role: '엘디아 공화국 수상' },
  ];

  // Cached DOM references
  var el = {
    body: document.body,
    sightFlash: document.getElementById('sight-flash'),
    sightFlashTitle: document.getElementById('sight-flash-title'),
    sightFlashSub: document.getElementById('sight-flash-sub'),
    worldClockPill: document.getElementById('world-clock-pill'),
    btnHintMode: document.getElementById('btn-hint-mode'),
    btnDeductionMode: document.getElementById('btn-deduction-mode'),
    btnSaveModal: document.getElementById('btn-save-modal'),
    btnReset: document.getElementById('btn-reset'),

    cardMarina: document.getElementById('card-marina'),
    cardKojiro: document.getElementById('card-kojiro'),
    marinaStatusBadge: document.getElementById('marina-status-badge'),
    kojiroStatusBadge: document.getElementById('kojiro-status-badge'),
    marinaSceneMeta: document.getElementById('marina-scene-meta'),
    kojiroSceneMeta: document.getElementById('kojiro-scene-meta'),
    marinaLocMeta: document.getElementById('marina-loc-meta'),
    kojiroLocMeta: document.getElementById('kojiro-loc-meta'),
    marinaInvCount: document.getElementById('marina-inv-count'),
    marinaClueCount: document.getElementById('marina-clue-count'),
    marinaDoneCount: document.getElementById('marina-done-count'),
    kojiroInvCount: document.getElementById('kojiro-inv-count'),
    kojiroClueCount: document.getElementById('kojiro-clue-count'),
    kojiroDoneCount: document.getElementById('kojiro-done-count'),

    btnSightChange: document.getElementById('btn-sight-change'),
    scSublabel: document.getElementById('sc-sublabel'),
    barrierProgressPill: document.getElementById('barrier-progress-pill'),

    sceneDateTag: document.getElementById('scene-date-tag'),
    sceneTitleKr: document.getElementById('scene-title-kr'),
    sceneTitleJp: document.getElementById('scene-title-jp'),
    btnAdvanceScene: document.getElementById('btn-advance-scene'),
    btnOpenDeduction: document.getElementById('btn-open-deduction'),
    sceneSvgViewport: document.getElementById('scene-svg-viewport'),
    sceneLocationOverlay: document.getElementById('scene-location-overlay'),
    sceneCharactersStrip: document.getElementById('scene-characters-strip'),

    syncBarrierBanner: document.getElementById('sync-barrier-banner'),
    sbbTitle: document.getElementById('sbb-title'),
    sbbDesc: document.getElementById('sbb-desc'),
    btnBannerSwitch: document.getElementById('btn-banner-switch'),

    crisisPanel: document.getElementById('crisis-panel'),
    crisisPrompt: document.getElementById('crisis-prompt'),
    crisisButtons: document.getElementById('crisis-buttons'),

    sceneObjectivesList: document.getElementById('scene-objectives-list'),
    latestSpeaker: document.getElementById('latest-speaker'),
    latestText: document.getElementById('latest-text'),
    logCount: document.getElementById('log-count'),
    narrativeLogList: document.getElementById('narrative-log-list'),

    verbBtns: Array.prototype.slice.call(document.querySelectorAll('.verb-btn')),
    targetTray: document.getElementById('target-tray'),

    intelTabs: Array.prototype.slice.call(document.querySelectorAll('.intel-tab')),
    timelineSvgHost: document.getElementById('timeline-svg-host'),
    timelineInspector: document.getElementById('timeline-inspector'),
    crossCausalList: document.getElementById('cross-causal-list'),

    invListKojiro: document.getElementById('inv-list-kojiro'),
    invListMarina: document.getElementById('inv-list-marina'),
    asymmetryCount: document.getElementById('asymmetry-count'),
    asymmetryList: document.getElementById('asymmetry-list'),
    dossierList: document.getElementById('dossier-list'),

    modalDeduction: document.getElementById('modal-deduction'),
    btnCloseDeduction: document.getElementById('btn-close-deduction'),
    deductionClassicBox: document.getElementById('deduction-classic-box'),
    deductionStreamlinedBox: document.getElementById('deduction-streamlined-box'),
    culpritInput: document.getElementById('culprit-input'),
    btnSubmitCulprit: document.getElementById('btn-submit-culprit'),
    culpritCandidateGrid: document.getElementById('culprit-candidate-grid'),

    modalEnding: document.getElementById('modal-ending'),
    endingBadge: document.getElementById('ending-badge'),
    endingModalTitle: document.getElementById('ending-modal-title'),
    endingTitleJp: document.getElementById('ending-title-jp'),
    endingSummary: document.getElementById('ending-summary'),
    endingNotes: document.getElementById('ending-notes'),
    endingStats: document.getElementById('ending-stats'),
    btnEndingRetry: document.getElementById('btn-ending-retry'),
    btnEndingNewgame: document.getElementById('btn-ending-newgame'),

    modalSave: document.getElementById('modal-save'),
    btnCloseSave: document.getElementById('btn-close-save'),
    saveSlotsList: document.getElementById('save-slots-list'),
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function findLocation(locId) {
    for (var i = 0; i < data.locations.length; i++) {
      if (data.locations[i].id === locId) return data.locations[i];
    }
    return data.locations[0];
  }

  function findItem(itemId) {
    for (var i = 0; i < data.items.length; i++) {
      if (data.items[i].id === itemId) return data.items[i];
    }
    return null;
  }

  function findEnding(endingId) {
    for (var i = 0; i < data.endings.length; i++) {
      if (data.endings[i].id === endingId) return data.endings[i];
    }
    return null;
  }

  function triggerSightFlash(targetProtagonist, subtitle) {
    var title =
      targetProtagonist === 'kojiro'
        ? '⇄ SIGHT A : KOJIRO AMAGI'
        : targetProtagonist === 'marina'
          ? '⇄ SIGHT B : MARINA HOJO'
          : '✦ TRISTAN CONVERGENCE';
    el.sightFlashTitle.textContent = title;
    el.sightFlashSub.textContent = subtitle || '';
    el.sightFlash.classList.add('active');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      el.sightFlash.classList.remove('active');
    }, 620);
  }

  function autoSaveSnapshot() {
    try {
      var st = engine.getState();
      var meta = {
        savedAt: new Date().toLocaleTimeString(),
        activeProtagonist: st.activeProtagonist,
        marinaScene: st.protagonists.marina.currentSceneId,
        kojiroScene: st.protagonists.kojiro.currentSceneId,
        barriers: st.sharedWorld.unlockedBarriers.length,
        payload: engine.serialize(),
      };
      localStorage.setItem(STORAGE_PREFIX + AUTO_SLOT, JSON.stringify(meta));
    } catch (_) {
      // Ignore storage quota / private mode restrictions
    }
  }

  // Atmospheric SVG Backdrop per Canonical Location (all 14 locations distinct!)
  function renderLocationSvg(locId, sightMode, isBlocked) {
    var palettes = {
      marina: { bg1: '#051226', bg2: '#0f2c4d', accent: '#38bdf8', sub: '#818cf8' },
      kojiro: { bg1: '#1a0c08', bg2: '#3f1910', accent: '#f59e0b', sub: '#ef4444' },
      converged: { bg1: '#11071a', bg2: '#2e1026', accent: '#fbbf24', sub: '#38bdf8' },
    };
    var pal = palettes[sightMode] || palettes.marina;
    var motif = '';

    if (locId === 'loc_jcia_hq') {
      // DBMS Level-7 Terminal Grid & Security Lock
      motif =
        '<g stroke="' + pal.accent + '" stroke-opacity="0.24" stroke-width="1">' +
        '<rect x="60" y="34" width="220" height="118" rx="6" fill="rgba(4,12,26,0.75)"/>' +
        '<rect x="310" y="34" width="320" height="118" rx="6" fill="rgba(4,12,26,0.75)"/>' +
        '<line x1="80" y1="62" x2="255" y2="62"/><line x1="80" y1="84" x2="225" y2="84"/><line x1="80" y1="106" x2="245" y2="106"/>' +
        '<circle cx="470" cy="93" r="38" fill="none" stroke-dasharray="9 6" stroke-width="2"/>' +
        '<circle cx="470" cy="93" r="22" fill="none" stroke="' + (isBlocked ? '#ef4444' : pal.accent) + '" stroke-width="2.5"/>' +
        '</g>' +
        '<text x="470" y="98" text-anchor="middle" fill="' + (isBlocked ? '#fca5a5' : pal.accent) + '" font-family="monospace" font-size="11" font-weight="700">' +
        (isBlocked ? 'LOCK LV-7' : 'JCIA DBMS') + '</text>';
    } else if (locId === 'loc_tristan_hold') {
      // Submerged Cargo Hold Bulkhead + Water Level + Oxygen Tanks
      motif =
        '<rect x="0" y="138" width="700" height="92" fill="rgba(14,116,144,0.34)"/>' +
        '<path d="M0 142 Q90 132 180 142 T360 142 T540 142 T700 142" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.8"/>' +
        '<g stroke="#fbbf24" stroke-width="1.5" opacity="0.65" fill="rgba(20,10,28,0.65)">' +
        '<rect x="90" y="42" width="120" height="90" rx="4"/>' +
        '<circle cx="350" cy="86" r="46" stroke-dasharray="12 6"/>' +
        '<rect x="520" y="64" width="28" height="66" rx="10"/><rect x="556" y="64" width="28" height="66" rx="10"/>' +
        '</g>' +
        '<text x="350" y="91" text-anchor="middle" fill="#fde68a" font-family="monospace" font-size="11" font-weight="700">O2 SURVIVAL // CONVERGED</text>';
    } else if (locId === 'loc_tristan_deck') {
      // Luxury Liner Deck at Night
      motif =
        '<path d="M40 150 L660 150 L610 190 L90 190 Z" fill="rgba(15,23,42,0.85)" stroke="' + pal.accent + '" stroke-width="1.5"/>' +
        '<rect x="190" y="75" width="320" height="75" rx="6" fill="rgba(15,23,42,0.72)" stroke="' + pal.accent + '" stroke-opacity="0.5"/>' +
        '<g fill="#fde68a" opacity="0.75">' +
        '<circle cx="235" cy="112" r="7"/><circle cx="285" cy="112" r="7"/><circle cx="335" cy="112" r="7"/><circle cx="385" cy="112" r="7"/><circle cx="435" cy="112" r="7"/>' +
        '</g>' +
        '<circle cx="590" cy="48" r="22" fill="#fde68a" opacity="0.25"/>';
    } else if (locId === 'loc_yale_school_grounds' || locId === 'loc_yale_director_room') {
      // Foreign School Gothic Arches / Secret Director Vault
      motif =
        '<g fill="rgba(8,14,28,0.72)" stroke="' + pal.accent + '" stroke-opacity="0.5" stroke-width="1.5">' +
        '<polygon points="120,76 350,24 580,76"/>' +
        '<rect x="145" y="76" width="410" height="110"/>' +
        '<path d="M210 186 L210 112 Q240 86 270 112 L270 186 Z" fill="rgba(56,189,248,0.12)"/>' +
        '<path d="M320 186 L320 112 Q350 86 380 112 L380 186 Z" fill="rgba(251,191,36,0.16)"/>' +
        '<path d="M430 186 L430 112 Q460 86 490 112 L490 186 Z" fill="rgba(56,189,248,0.12)"/>' +
        '</g>' +
        (locId === 'loc_yale_director_room'
          ? '<circle cx="350" cy="138" r="18" fill="none" stroke="#fbbf24" stroke-width="2"/><text x="350" y="142" text-anchor="middle" fill="#fde68a" font-family="monospace" font-size="9">SEAL</text>'
          : '');
    } else if (locId === 'loc_amagi_agency' || locId === 'loc_katsuragi_agency') {
      // Detective Office Venetian Blinds & Desk Lamp
      motif =
        '<g fill="rgba(10,6,5,0.65)" stroke="' + pal.accent + '" stroke-opacity="0.45">' +
        '<rect x="90" y="28" width="230" height="135" rx="4"/>' +
        '<line x1="90" y1="50" x2="320" y2="50"/><line x1="90" y1="72" x2="320" y2="72"/><line x1="90" y1="94" x2="320" y2="94"/><line x1="90" y1="116" x2="320" y2="116"/><line x1="90" y1="138" x2="320" y2="138"/>' +
        '</g>' +
        '<polygon points="480,58 550,58 595,180 435,180" fill="' + pal.accent + '" opacity="0.16"/>' +
        '<rect x="405" y="155" width="220" height="28" rx="4" fill="rgba(18,10,8,0.85)" stroke="' + pal.accent + '" stroke-opacity="0.5"/>';
    } else if (locId === 'loc_warehouse_district') {
      // Harbor Cranes & Containers
      motif =
        '<g fill="rgba(12,8,8,0.85)" stroke="' + pal.accent + '" stroke-opacity="0.45">' +
        '<rect x="55" y="112" width="160" height="82"/><polygon points="55,112 135,76 215,112"/>' +
        '<rect x="245" y="128" width="145" height="66"/>' +
        '<path d="M430 194 L465 72 L605 42 L610 50 L474 82 L444 194 Z"/>' +
        '<line x1="580" y1="54" x2="580" y2="135" stroke-dasharray="4 4"/>' +
        '</g>';
    } else if (locId === 'loc_shot_bar') {
      // Neon Shot Bar Counter & Bottles
      motif =
        '<rect x="80" y="138" width="540" height="44" rx="6" fill="rgba(24,10,12,0.88)" stroke="#f59e0b" stroke-width="1.5"/>' +
        '<g fill="rgba(245,158,11,0.35)" stroke="#fbbf24" stroke-width="1">' +
        '<rect x="145" y="74" width="22" height="58" rx="4"/><rect x="182" y="64" width="24" height="68" rx="4"/>' +
        '<rect x="222" y="80" width="20" height="52" rx="4"/><rect x="490" y="68" width="24" height="64" rx="4"/>' +
        '</g>' +
        '<polygon points="340,95 385,95 362,126" fill="none" stroke="#38bdf8" stroke-width="2"/><line x1="362" y1="126" x2="362" y2="138" stroke="#38bdf8" stroke-width="2"/>';
    } else if (locId === 'loc_stollman_mansion' || locId === 'loc_eldia_embassy') {
      // Grand Diplomatic / Mansion Columns & Islamic Painting Frame
      motif =
        '<g fill="rgba(10,14,24,0.8)" stroke="' + pal.accent + '" stroke-opacity="0.55" stroke-width="1.5">' +
        '<polygon points="110,66 350,26 590,66"/>' +
        '<rect x="145" y="66" width="26" height="122"/><rect x="245" y="66" width="26" height="122"/>' +
        '<rect x="429" y="66" width="26" height="122"/><rect x="529" y="66" width="26" height="122"/>' +
        '<rect x="302" y="82" width="96" height="74" fill="rgba(245,158,11,0.14)"/>' +
        '<polygon points="350,92 376,119 350,146 324,119" fill="none" stroke="#fbbf24" stroke-width="1.6"/>' +
        '</g>';
    } else {
      // City Skyline (Central Avenue / Princess Hotel / Sun Mansion)
      motif =
        '<g fill="rgba(8,12,24,0.82)" stroke="' + pal.accent + '" stroke-opacity="0.4">' +
        '<rect x="65" y="68" width="85" height="140"/><rect x="170" y="40" width="110" height="168"/>' +
        '<rect x="300" y="82" width="95" height="126"/><rect x="415" y="52" width="120" height="156"/>' +
        '<rect x="555" y="92" width="85" height="116"/>' +
        '</g>' +
        '<line x1="0" y1="196" x2="700" y2="196" stroke="' + pal.accent + '" stroke-width="1.5" opacity="0.5"/>';
    }

    return (
      '<svg viewBox="0 0 700 230" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="vpBg" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="' + pal.bg1 + '"/>' +
      '<stop offset="100%" stop-color="' + pal.bg2 + '"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<rect width="700" height="230" fill="url(#vpBg)"/>' +
      '<g stroke="' + pal.accent + '" stroke-opacity="0.08" stroke-width="1">' +
      '<line x1="0" y1="45" x2="700" y2="45"/><line x1="0" y1="90" x2="700" y2="90"/>' +
      '<line x1="0" y1="135" x2="700" y2="135"/><line x1="0" y1="180" x2="700" y2="180"/>' +
      '</g>' +
      motif +
      '</svg>'
    );
  }

  // Parallel Timeline & Sync Barrier SVG Visualizer (16 scenes + 8 cross-causal barriers)
  function renderTimelineSvg() {
    var graph = engine.getTimelineGraph();
    var nodesById = {};
    for (var i = 0; i < graph.nodes.length; i++) {
      nodesById[graph.nodes[i].id] = graph.nodes[i];
    }

    var marinaOrder = ['M_D0_01', 'M_D0_02', 'M_D1_01', 'M_D2_01', 'M_D3_01', 'M_D4_01', 'M_D4_02', 'M_D5_01'];
    var kojiroOrder = ['K_D1_01', 'K_D1_02', 'K_D2_01', 'K_D3_01', 'K_D4_01', 'K_D4_02', 'K_D5_01'];

    var coords = {};
    var xStart = 64;
    var step = 76;
    for (var m = 0; m < marinaOrder.length; m++) {
      coords[marinaOrder[m]] = { x: xStart + m * step, y: 58 };
    }
    for (var k = 0; k < kojiroOrder.length; k++) {
      coords[kojiroOrder[k]] = { x: xStart + (k + 1) * step, y: 176 };
    }
    coords['C_D6_01'] = { x: xStart + 8 * step + 18, y: 117 };

    var svgParts = [];
    svgParts.push(
      '<svg viewBox="0 0 740 236" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<marker id="arrLocked" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
      '<polygon points="0 0, 7 3.5, 0 7" fill="#ef4444"/></marker>' +
      '<marker id="arrUnlocked" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
      '<polygon points="0 0, 7 3.5, 0 7" fill="#34d399"/></marker>' +
      '</defs>'
    );

    // Track Labels
    svgParts.push(
      '<text x="12" y="30" fill="#38bdf8" font-family="monospace" font-size="10" font-weight="700">MARINA TRACK (12/2~12/7)</text>' +
      '<text x="12" y="218" fill="#f59e0b" font-family="monospace" font-size="10" font-weight="700">KOJIRO TRACK (12/3~12/7)</text>'
    );

    // Intra-track connector lines
    for (m = 0; m < marinaOrder.length - 1; m++) {
      var a = coords[marinaOrder[m]];
      var b = coords[marinaOrder[m + 1]];
      svgParts.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="#38bdf8" stroke-opacity="0.32" stroke-width="2"/>');
    }
    for (k = 0; k < kojiroOrder.length - 1; k++) {
      var ka = coords[kojiroOrder[k]];
      var kb = coords[kojiroOrder[k + 1]];
      svgParts.push('<line x1="' + ka.x + '" y1="' + ka.y + '" x2="' + kb.x + '" y2="' + kb.y + '" stroke="#f59e0b" stroke-opacity="0.32" stroke-width="2"/>');
    }
    // Convergence lines
    svgParts.push(
      '<line x1="' + coords['M_D5_01'].x + '" y1="' + coords['M_D5_01'].y + '" x2="' + coords['C_D6_01'].x + '" y2="' + coords['C_D6_01'].y + '" stroke="#fbbf24" stroke-opacity="0.45" stroke-width="2"/>' +
      '<line x1="' + coords['K_D5_01'].x + '" y1="' + coords['K_D5_01'].y + '" x2="' + coords['C_D6_01'].x + '" y2="' + coords['C_D6_01'].y + '" stroke="#fbbf24" stroke-opacity="0.45" stroke-width="2"/>'
    );

    // Cross-Protagonist Sync Barrier Arrows (SB_01 ~ SB_08)
    for (var bi = 0; bi < graph.barriers.length; bi++) {
      var bar = graph.barriers[bi];
      var fromP = coords[bar.fromScene];
      var toP = coords[bar.toScene];
      if (!fromP || !toP) continue;

      var stroke = bar.unlocked ? '#34d399' : bar.activeBlock ? '#f87171' : '#94a3b8';
      var dash = bar.unlocked ? '' : ' stroke-dasharray="4 3"';
      var marker = bar.unlocked ? 'url(#arrUnlocked)' : 'url(#arrLocked)';
      var midX = (fromP.x + toP.x) / 2;
      var midY = (fromP.y + toP.y) / 2 + (bi % 2 === 0 ? -8 : 10);

      // Slight offset for SB_05 & SB_06 criss-cross clarity
      if (bar.id === 'SB_05') {
        midX -= 12;
        midY = 104;
      } else if (bar.id === 'SB_06') {
        midX += 14;
        midY = 132;
      } else if (bar.id === 'SB_08') {
        midX = coords['C_D6_01'].x - 28;
        midY = 117;
      }

      svgParts.push(
        '<g class="tl-barrier" data-barrier-id="' + bar.id + '" style="cursor:pointer">' +
        '<path d="M ' + fromP.x + ' ' + fromP.y + ' Q ' + midX + ' ' + midY + ' ' + toP.x + ' ' + toP.y + '"' +
        ' fill="none" stroke="' + stroke + '" stroke-width="' + (bar.activeBlock ? 2.6 : 1.7) + '"' + dash +
        ' marker-end="' + marker + '" opacity="' + (bar.unlocked || bar.activeBlock ? 0.95 : 0.55) + '"/>' +
        '<rect x="' + (midX - 20) + '" y="' + (midY - 9) + '" width="40" height="17" rx="4" fill="' +
        (bar.unlocked ? '#064e3b' : bar.activeBlock ? '#7f1d1d' : '#1e293b') +
        '" stroke="' + stroke + '" stroke-width="1"/>' +
        '<text x="' + midX + '" y="' + (midY + 3) + '" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-size="8.5" font-weight="700">' +
        (bar.unlocked ? '🔓' : '🔒') + bar.id.replace('SB_0', 'B') + '</text>' +
        '</g>'
      );
    }

    // Scene Nodes
    for (var ni = 0; ni < graph.nodes.length; ni++) {
      var n = graph.nodes[ni];
      var pos = coords[n.id];
      if (!pos) continue;

      var isConv = n.id === 'C_D6_01';
      var fill = '#0f172a';
      var strokeColor = n.track === 'marina' ? '#38bdf8' : n.track === 'kojiro' ? '#f59e0b' : '#fbbf24';
      if (n.status === 'completed') {
        fill = n.track === 'marina' ? '#0c4a6e' : n.track === 'kojiro' ? '#78350f' : '#065f46';
      } else if (n.status === 'active') {
        fill = n.track === 'marina' ? '#0284c7' : n.track === 'kojiro' ? '#d97706' : '#b91c1c';
      } else if (n.status === 'blocked') {
        fill = '#450a0a';
        strokeColor = '#ef4444';
      }

      var r = isConv ? 22 : 16;
      svgParts.push(
        '<g class="tl-node" data-scene-id="' + n.id + '" style="cursor:pointer">' +
        (n.isCurrentFocus
          ? '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + (r + 5) + '" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3 2"/>'
          : '') +
        '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + r + '" fill="' + fill + '" stroke="' + strokeColor + '" stroke-width="' + (n.isCurrentFocus ? 2.5 : 1.6) + '"/>' +
        '<text x="' + pos.x + '" y="' + (pos.y + 3) + '" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-size="' + (isConv ? 8.5 : 8) + '" font-weight="700">' +
        n.id.replace('_0', '.') + '</text>' +
        '<text x="' + pos.x + '" y="' + (pos.y + (n.track === 'kojiro' ? 28 : -22)) + '" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="8">' +
        n.calendarDate + '</text>' +
        '</g>'
      );
    }

    svgParts.push('</svg>');
    el.timelineSvgHost.innerHTML = svgParts.join('');

    // Wire SVG click inspectors
    var nodeEls = el.timelineSvgHost.querySelectorAll('.tl-node');
    for (i = 0; i < nodeEls.length; i++) {
      nodeEls[i].addEventListener('click', function () {
        var sid = this.getAttribute('data-scene-id');
        var found = nodesById[sid];
        if (found) {
          inspectedTimelineItem = {
            title: found.id + ' (' + found.calendarDate + ' · ' + found.status.toUpperCase() + ')',
            body: found.titleKr + ' — ' + found.summary,
          };
          renderTimelineInspector();
        }
      });
    }

    var barrierEls = el.timelineSvgHost.querySelectorAll('.tl-barrier');
    for (i = 0; i < barrierEls.length; i++) {
      barrierEls[i].addEventListener('click', function () {
        var bid = this.getAttribute('data-barrier-id');
        for (var j = 0; j < graph.barriers.length; j++) {
          if (graph.barriers[j].id === bid) {
            var bObj = graph.barriers[j];
            inspectedTimelineItem = {
              title: (bObj.unlocked ? '🔓 ' : '🔒 ') + bObj.id + ': ' + bObj.nameKr,
              body: bObj.effect + ' [힌트: ' + bObj.hint + ']',
            };
            renderTimelineInspector();
            break;
          }
        }
      });
    }
  }

  function renderTimelineInspector() {
    if (!inspectedTimelineItem) return;
    el.timelineInspector.innerHTML =
      '<div class="inspector-title">' + escapeHtml(inspectedTimelineItem.title) + '</div>' +
      '<p class="inspector-body">' + escapeHtml(inspectedTimelineItem.body) + '</p>';
  }

  function renderAll() {
    var st = engine.getState();
    var who = st.activeProtagonist;
    var cmds = engine.getAvailableCommands();
    var mState = st.protagonists.marina;
    var kState = st.protagonists.kojiro;
    var activeP = st.protagonists[who];
    var currScene = engine.getCurrentScene(who);
    var currLoc = findLocation(activeP.locationId);

    // 1. Dynamic Theme Shift on body
    var theme = st.sharedWorld.converged ? 'converged' : who;
    el.body.setAttribute('data-sight', theme);

    // 2. Top Bar Utility & World Clock
    el.worldClockPill.textContent = st.sharedWorld.calendarDate + ' · DAY ' + st.sharedWorld.worldDay;
    el.btnHintMode.textContent = '힌트: ' + (st.mode.sightHintMode === 'modern' ? 'Modern' : 'Classic');
    el.btnDeductionMode.textContent =
      '추리: ' + (st.mode.culpritInputMode === 'classic' ? 'Classic 입력' : 'PLUS 선택');

    // 3. Dual Protagonist Cards
    el.cardMarina.classList.toggle('is-active', !st.sharedWorld.converged && who === 'marina');
    el.cardKojiro.classList.toggle('is-active', !st.sharedWorld.converged && who === 'kojiro');
    el.cardMarina.classList.toggle('is-blocked', Boolean(mState.blockedByBarrierId));
    el.cardKojiro.classList.toggle('is-blocked', Boolean(kState.blockedByBarrierId));

    el.marinaSceneMeta.textContent = engine.getCurrentScene('marina').calendar_date + ' · ' + mState.currentSceneId;
    el.marinaLocMeta.textContent = findLocation(mState.locationId).name_kr;
    el.marinaInvCount.textContent = '소지품 ' + mState.inventory.length;
    el.marinaClueCount.textContent = '단서 ' + mState.knownClues.length;
    el.marinaDoneCount.textContent = '완료 ' + Math.min(mState.completedScenes.length, 8) + '/8';

    el.kojiroSceneMeta.textContent = engine.getCurrentScene('kojiro').calendar_date + ' · ' + kState.currentSceneId;
    el.kojiroLocMeta.textContent = findLocation(kState.locationId).name_kr;
    el.kojiroInvCount.textContent = '소지품 ' + kState.inventory.length;
    el.kojiroClueCount.textContent = '단서 ' + kState.knownClues.length;
    el.kojiroDoneCount.textContent = '완료 ' + Math.min(kState.completedScenes.length, 7) + '/7';

    // Status Badges
    function applyBadge(badgeEl, side, pState) {
      badgeEl.className = 'status-badge';
      if (st.sharedWorld.converged) {
        badgeEl.classList.add('converged');
        badgeEl.textContent = 'CONVERGED';
      } else if (pState.blockedByBarrierId) {
        badgeEl.classList.add('blocked');
        badgeEl.textContent = '🔒 ' + pState.blockedByBarrierId;
      } else if (who === side) {
        badgeEl.classList.add('active');
        badgeEl.textContent = 'ACTIVE';
      } else {
        badgeEl.textContent = 'WAITING';
      }
    }
    applyBadge(el.marinaStatusBadge, 'marina', mState);
    applyBadge(el.kojiroStatusBadge, 'kojiro', kState);

    // 4. Center SIGHT CHANGE Button
    var sightInfo = cmds.canSightChange;
    el.btnSightChange.disabled = !sightInfo.allowed;
    var activeBlocked = Boolean(activeP.blockedByBarrierId);
    var shouldPulse = sightInfo.allowed && activeBlocked && st.mode.sightHintMode === 'modern';
    el.btnSightChange.classList.toggle('needs-switch', shouldPulse);

    if (st.sharedWorld.converged) {
      el.scSublabel.textContent = '단일 시점 수렴';
    } else if (!sightInfo.allowed) {
      el.scSublabel.textContent = 'DAY 0 잠금 (SB_01)';
    } else if (activeBlocked) {
      el.scSublabel.textContent = (who === 'marina' ? '코지로' : '마리나') + '로 전환 필요!';
    } else {
      el.scSublabel.textContent = (who === 'marina' ? '→ 코지로 시점' : '→ 마리나 시점') + ' [Tab]';
    }
    el.barrierProgressPill.textContent = '동기화 장벽 ' + st.sharedWorld.unlockedBarriers.length + ' / 8 해제';

    // 5. Scene Header & Advance / Deduction Buttons
    el.sceneDateTag.textContent =
      currScene.calendar_date + ' (Day ' + currScene.day_index + ') · ' + currScene.id + ' · ' +
      (st.sharedWorld.converged ? 'DUAL CONVERGENCE' : who === 'marina' ? 'MARINA SIGHT' : 'KOJIRO SIGHT');
    el.sceneTitleKr.textContent = currScene.title_kr;
    el.sceneTitleJp.textContent = currScene.title_jp;

    if (st.sharedWorld.converged) {
      el.btnAdvanceScene.classList.add('hidden');
      el.btnOpenDeduction.classList.remove('hidden');
      el.btnOpenDeduction.disabled = Boolean(st.sharedWorld.endingId);
    } else {
      el.btnOpenDeduction.classList.add('hidden');
      el.btnAdvanceScene.classList.remove('hidden');
      el.btnAdvanceScene.classList.remove('ready', 'stalled');
      if (activeBlocked) {
        el.btnAdvanceScene.classList.add('stalled');
        el.btnAdvanceScene.textContent = '🔒 장벽 대기 (' + activeP.blockedByBarrierId + ')';
      } else if (cmds.progress.readyToAdvance) {
        el.btnAdvanceScene.classList.add('ready');
        el.btnAdvanceScene.textContent = '▶ 다음 국면으로 진행';
      } else {
        el.btnAdvanceScene.textContent =
          '조사 진행 중 (' + cmds.progress.completedSteps.length + '/' + cmds.progress.requiredSteps.length + ')';
      }
    }

    // 6. Viewport SVG + Location Overlay + Present Character Chips
    el.sceneSvgViewport.innerHTML = renderLocationSvg(currLoc.id, theme, activeBlocked);
    el.sceneLocationOverlay.textContent = '📍 ' + currLoc.name_kr + ' (' + currLoc.district + ')';

    var selfId = who === 'kojiro' ? 'kojiro_amagi' : 'marina_hojo';
    var charChipsHtml = [];
    for (var ci = 0; ci < currScene.character_ids.length; ci++) {
      var cid = currScene.character_ids[ci];
      if (cid === selfId) continue;
      var cv = engine.getCharacterView(cid, who);
      if (!cv) continue;
      charChipsHtml.push(
        '<button type="button" class="char-chip" data-talk-char="' + escapeHtml(cid) + '">' +
        '<span class="char-dot trust-' + escapeHtml(cv.trustLevel) + '"></span>' +
        '<span><strong>' + escapeHtml(cv.displayName) + '</strong> ' +
        '<span class="char-alias-sub">' + (cv.isRevealed ? '✓ 정체 확인' : escapeHtml(cv.role)) + '</span></span>' +
        '</button>'
      );
    }
    el.sceneCharactersStrip.innerHTML = charChipsHtml.join('');
    var chipBtns = el.sceneCharactersStrip.querySelectorAll('.char-chip');
    for (ci = 0; ci < chipBtns.length; ci++) {
      chipBtns[ci].addEventListener('click', function () {
        activeVerb = 'TALK';
        runCommand('TALK', this.getAttribute('data-talk-char'));
      });
    }

    // 7. Sync Barrier Alert Banner
    if (activeBlocked && !st.sharedWorld.converged) {
      var bCheck = engine.checkSyncBarrier(who);
      el.syncBarrierBanner.classList.remove('hidden');
      el.sbbTitle.textContent =
        '🔒 동기화 장벽 ' + activeP.blockedByBarrierId + ' — ' + (bCheck.barrier ? bCheck.barrier.name_kr : '대기 상태');
      el.sbbDesc.textContent =
        st.mode.sightHintMode === 'modern' && bCheck.barrier
          ? bCheck.barrier.player_hint_modern
          : '현재 시점에서 더 이상 진행할 수 없습니다. SIGHT CHANGE로 다른 주인공의 사건을 진행하세요.';
      el.btnBannerSwitch.textContent =
        '⇄ ' + (who === 'marina' ? '코지로 시점으로 전환' : '마리나 시점으로 전환');
    } else {
      el.syncBarrierBanner.classList.add('hidden');
    }

    // 8. Crisis Panel (M_D4_02 / K_D4_02)
    if (cmds.crisisPrompt && cmds.verbs.CRISIS.length > 0 && !st.sharedWorld.endingId) {
      el.crisisPanel.classList.remove('hidden');
      el.crisisPrompt.textContent = cmds.crisisPrompt;
      el.crisisButtons.innerHTML = cmds.verbs.CRISIS.map(function (c) {
        return (
          '<button type="button" class="crisis-choice-btn ' + (c.fatal ? 'fatal' : 'safe') + '" data-crisis-id="' +
          escapeHtml(c.id) + '">' + escapeHtml(c.label) + '</button>'
        );
      }).join('');
      var cBtns = el.crisisButtons.querySelectorAll('.crisis-choice-btn');
      for (ci = 0; ci < cBtns.length; ci++) {
        cBtns[ci].addEventListener('click', function () {
          runCommand('CRISIS', this.getAttribute('data-crisis-id'));
        });
      }
    } else {
      el.crisisPanel.classList.add('hidden');
    }

    // 9. Scene Objective Chips
    var objHtml = [];
    for (var oi = 0; oi < cmds.progress.requiredSteps.length; oi++) {
      var stepKey = cmds.progress.requiredSteps[oi];
      var isDone = cmds.progress.completedSteps.indexOf(stepKey) !== -1;
      var parts = stepKey.split(':');
      var stepLabel = parts[0];
      if (parts[0] === 'TALK') {
        var tv = engine.getCharacterView(parts[1], who);
        stepLabel = 'TALK: ' + (tv ? tv.displayName : parts[1]);
      } else if (parts[0] === 'ITEM') {
        var itm = findItem(parts[1]);
        stepLabel = 'ITEM: ' + (itm ? itm.name_kr : parts[1]);
      } else if (parts[0] === 'LOOK') {
        stepLabel = 'LOOK: 핵심 현장 조사';
      }
      objHtml.push(
        '<span class="obj-chip ' + (isDone ? 'done' : '') + '">' + (isDone ? '✓ ' : '○ ') + escapeHtml(stepLabel) + '</span>'
      );
    }
    el.sceneObjectivesList.innerHTML = objHtml.join('');

    // 10. Narrative Log & Latest Entry
    var logs = st.narrativeLog;
    var latest = logs[logs.length - 1] || { speaker: 'SYSTEM', text: '' };
    el.latestSpeaker.textContent = latest.speaker;
    el.latestText.textContent = latest.text;
    el.logCount.textContent = String(logs.length);

    var reversedLogs = logs.slice().reverse();
    el.narrativeLogList.innerHTML = reversedLogs
      .map(function (entry) {
        return (
          '<div class="log-item kind-' + escapeHtml(entry.kind) + '">' +
          '<div class="log-item-speaker">' + escapeHtml(entry.speaker) + '</div>' +
          '<div>' + escapeHtml(entry.text) + '</div>' +
          '</div>'
        );
      })
      .join('');

    // 11. Command Deck & Target Tray
    for (var vi = 0; vi < el.verbBtns.length; vi++) {
      var vName = el.verbBtns[vi].getAttribute('data-verb');
      el.verbBtns[vi].classList.toggle('active', vName === activeVerb);
    }
    renderTargetTray(cmds);

    // 12. Right Intel Panel: Timeline, Cross-Causal Log, Asymmetry Board, Dossier
    renderTimelineSvg();
    renderCrossCausalLog(st);
    renderAsymmetryBoard(st);
    renderDossier(st);

    // 13. Check Ending Modal
    if (st.sharedWorld.endingId) {
      showEndingModal(st);
    }
  }

  function renderTargetTray(cmds) {
    var targets = cmds.verbs[activeVerb] || [];
    if (targets.length === 0) {
      el.targetTray.innerHTML =
        '<span class="target-empty">' +
        (activeVerb === 'ITEM'
          ? '현재 주인공이 소지한 아이템이 아직 없습니다. (상대 주인공의 소지품은 완전히 격리됩니다)'
          : '선택할 대상이 없습니다.') +
        '</span>';
      return;
    }

    el.targetTray.innerHTML = targets
      .map(function (t) {
        var classes = ['target-btn'];
        if (t.isKeyObjective || t.usedHere) classes.push('is-key');
        if (t.isCurrent) classes.push('is-current');
        var badge = t.isKeyObjective || t.usedHere ? '★ ' : t.isCurrent ? '● ' : '';
        return (
          '<button type="button" class="' + classes.join(' ') + '" data-target-id="' + escapeHtml(t.id) + '">' +
          badge + escapeHtml(t.label) +
          '</button>'
        );
      })
      .join('');

    var btns = el.targetTray.querySelectorAll('.target-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        runCommand(activeVerb, this.getAttribute('data-target-id'));
      });
    }
  }

  function renderCrossCausalLog(st) {
    var log = st.sharedWorld.crossCausalLog;
    if (log.length === 0) {
      el.crossCausalList.innerHTML =
        '<div class="target-empty">아직 해제된 교차 동기화 장벽이 없습니다. 마리나 Day 0 답사를 마치면 SB_01이 열립니다.</div>';
      return;
    }
    el.crossCausalList.innerHTML = log
      .slice()
      .reverse()
      .map(function (e) {
        return (
          '<div class="cross-log-card">' +
          '<strong>🔓 ' + escapeHtml(e.barrierId) + ' · ' + escapeHtml(e.nameKr) + '</strong>' +
          '<div>' + escapeHtml(e.effect) + '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderAsymmetryBoard(st) {
    // Dual Inventories
    function renderInv(listEl, invIds) {
      if (invIds.length === 0) {
        listEl.innerHTML = '<li>(보유 소지품 없음)</li>';
        return;
      }
      listEl.innerHTML = invIds
        .map(function (id) {
          var item = findItem(id);
          return '<li>• ' + escapeHtml(item ? item.name_kr : id) + '</li>';
        })
        .join('');
    }
    renderInv(el.invListKojiro, st.protagonists.kojiro.inventory);
    renderInv(el.invListMarina, st.protagonists.marina.inventory);

    // Asymmetry Clue Matrix
    var matrix = engine.getAsymmetryMatrix();
    el.asymmetryCount.textContent = String(matrix.length);
    if (matrix.length === 0) {
      el.asymmetryList.innerHTML =
        '<div class="target-empty">아직 발견된 비대칭 단서가 없습니다. 두 시점을 오가며 조사하면 양측의 인지 격차가 여기에 드러납니다.</div>';
      return;
    }

    el.asymmetryList.innerHTML = matrix
      .map(function (row) {
        return (
          '<article class="asym-card ' + (row.shared ? 'is-shared' : '') + '">' +
          '<div class="asym-head">' +
          '<div class="asym-title">' + escapeHtml(row.titleKr) + '</div>' +
          '<span class="irony-badge">' + escapeHtml(IRONY_LABELS[row.dramaticIronyType] || row.dramaticIronyType) + '</span>' +
          '</div>' +
          '<div class="asym-cols">' +
          '<div class="asym-side asym-side-k">' +
          '<div class="asym-side-label"><span>🟠 코지로 인지</span><span>' + (row.knownByKojiro ? '보유 ✓' : '미인지') + '</span></div>' +
          '<div>' + escapeHtml(row.kojiroPerception) + '</div>' +
          '</div>' +
          '<div class="asym-side asym-side-m">' +
          '<div class="asym-side-label"><span>🔵 마리나 인지</span><span>' + (row.knownByMarina ? '보유 ✓' : '미인지') + '</span></div>' +
          '<div>' + escapeHtml(row.marinaPerception) + '</div>' +
          '</div>' +
          '</div>' +
          '<div class="asym-truth">' +
          '<strong>✦ 플레이어 전지적 진실 (' + (row.shared ? '트리스탄호 합류 통합 완료' : '주인공 간 미공유 · 극적 아이러니') + ')</strong>' +
          '<div>' + escapeHtml(row.playerOmniscientTruth) + '</div>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function renderDossier(st) {
    el.dossierList.innerHTML = data.characters
      .map(function (ch) {
        var kv = engine.getCharacterView(ch.id, 'kojiro');
        var mv = engine.getCharacterView(ch.id, 'marina');
        var mismatch = kv.initialAlias !== mv.initialAlias;
        var revealed = st.sharedWorld.converged || kv.isRevealed || mv.isRevealed;
        return (
          '<article class="dossier-card ' + (mismatch ? 'mismatch' : '') + '">' +
          '<div class="dossier-head">' +
          '<strong>' + escapeHtml(ch.name_kr) + ' <small style="color:var(--text-dim)">' + escapeHtml(ch.name_jp) + '</small></strong>' +
          (mismatch ? '<span class="irony-badge">⚡ 별칭 비대칭</span>' : '') +
          '</div>' +
          '<div class="dossier-grid">' +
          '<div><strong style="color:var(--kojiro-color)">코지로 시점:</strong> ' + escapeHtml(kv.displayName) + '<br><span>' + escapeHtml(kv.role) + '</span></div>' +
          '<div><strong style="color:var(--marina-color)">마리나 시점:</strong> ' + escapeHtml(mv.displayName) + '<br><span>' + escapeHtml(mv.role) + '</span></div>' +
          '</div>' +
          (revealed
            ? '<div class="dossier-truth"><strong>진실:</strong> ' + escapeHtml(ch.true_identity) + '</div>'
            : '') +
          '</article>'
        );
      })
      .join('');
  }

  function runCommand(verb, targetId) {
    var prevConverged = engine.getState().sharedWorld.converged;
    var res = engine.executeCommand(verb, targetId);
    if (verb === 'SIGHT_CHANGE' && res.ok && res.changed) {
      var sc = res.scene;
      triggerSightFlash(res.activeProtagonist, sc ? sc.calendar_date + ' · ' + sc.title_kr : '');
      autoSaveSnapshot();
    }
    if (!prevConverged && engine.getState().sharedWorld.converged) {
      triggerSightFlash('converged', '트리스탄호 해저 선창 — 양측 단서 완전 통합');
    }
    renderAll();
  }

  function handleAdvanceScene() {
    var prevConverged = engine.getState().sharedWorld.converged;
    var res = engine.advanceScene();
    if (res.unlockedBarriers && res.unlockedBarriers.length > 0) {
      autoSaveSnapshot();
    }
    if (!prevConverged && res.converged) {
      triggerSightFlash('converged', '12-08 트리스탄호 해저 선창 · 단일 시점 수렴');
      autoSaveSnapshot();
    } else if (!res.ok && res.reason === 'OBJECTIVES_INCOMPLETE') {
      // Gently switch verb tab to first missing step so the player sees immediately what to do
      if (res.remainingSteps && res.remainingSteps.length > 0) {
        activeVerb = res.remainingSteps[0].split(':')[0];
      }
    }
    renderAll();
  }

  function openDeductionModal() {
    var st = engine.getState();
    if (!st.sharedWorld.converged) return;
    var isClassic = st.mode.culpritInputMode === 'classic';
    el.deductionClassicBox.classList.toggle('hidden', !isClassic);
    el.deductionStreamlinedBox.classList.toggle('hidden', isClassic);
    el.culpritInput.value = '';
    el.modalDeduction.classList.remove('hidden');
    if (isClassic) {
      setTimeout(function () {
        el.culpritInput.focus();
      }, 40);
    }
  }

  function closeDeductionModal() {
    el.modalDeduction.classList.add('hidden');
  }

  function handleSubmitCulprit(raw) {
    var res = engine.submitCulprit(raw);
    if (res.ok) {
      closeDeductionModal();
      renderAll();
    }
  }

  function showEndingModal(st) {
    var ending = findEnding(st.sharedWorld.endingId);
    if (!ending) return;
    var isTrue = ending.outcome_type === 'true_ending';
    el.endingBadge.className = 'ending-badge ' + (isTrue ? 'true' : 'bad');
    el.endingBadge.textContent = isTrue ? 'TRUE ENDING' : ending.outcome_type.toUpperCase();
    el.endingModalTitle.textContent = ending.title_kr;
    el.endingTitleJp.textContent = ending.title_jp;
    el.endingSummary.textContent = ending.summary;
    el.endingNotes.textContent = '판본 기록: ' + ending.edition_notes;
    el.endingStats.innerHTML =
      '<div class="stat-pill"><strong>' + st.stats.sightChanges + '</strong><span>SIGHT CHANGE</span></div>' +
      '<div class="stat-pill"><strong>' + st.sharedWorld.unlockedBarriers.length + '/8</strong><span>동기화 장벽 돌파</span></div>' +
      '<div class="stat-pill"><strong>' + engine.getAsymmetryMatrix().length + '/12</strong><span>비대칭 단서 확보</span></div>';
    el.btnEndingRetry.classList.toggle('hidden', isTrue);
    el.modalEnding.classList.remove('hidden');
  }

  function closeEndingModal() {
    el.modalEnding.classList.add('hidden');
  }

  function renderSaveSlots() {
    var rows = [];
    var allSlots = [{ key: AUTO_SLOT, label: 'Auto-Checkpoint (자동 백업)', readonly: true }];
    for (var i = 0; i < MANUAL_SLOTS.length; i++) {
      allSlots.push({ key: String(MANUAL_SLOTS[i]), label: '슬롯 ' + MANUAL_SLOTS[i], readonly: false });
    }

    for (i = 0; i < allSlots.length; i++) {
      var slot = allSlots[i];
      var raw = null;
      try {
        raw = localStorage.getItem(STORAGE_PREFIX + slot.key);
      } catch (_) {}
      var meta = null;
      if (raw) {
        try {
          meta = JSON.parse(raw);
        } catch (_) {}
      }

      var desc = meta
        ? meta.savedAt +
          ' · M:' + meta.marinaScene +
          ' / K:' + meta.kojiroScene +
          ' · 장벽 ' + meta.barriers + '/8'
        : '비어 있음';

      rows.push(
        '<div class="save-slot-row">' +
        '<div class="save-slot-meta"><strong>' + escapeHtml(slot.label) + '</strong><span>' + escapeHtml(desc) + '</span></div>' +
        '<div class="save-slot-actions">' +
        (!slot.readonly
          ? '<button type="button" class="util-btn" data-save-slot="' + slot.key + '">저장</button>'
          : '') +
        (meta
          ? '<button type="button" class="util-btn" data-load-slot="' + slot.key + '">불러오기</button>'
          : '') +
        '</div>' +
        '</div>'
      );
    }

    el.saveSlotsList.innerHTML = rows.join('');
    var saveBtns = el.saveSlotsList.querySelectorAll('[data-save-slot]');
    for (i = 0; i < saveBtns.length; i++) {
      saveBtns[i].addEventListener('click', function () {
        var key = this.getAttribute('data-save-slot');
        var st = engine.getState();
        var record = {
          savedAt: new Date().toLocaleString(),
          activeProtagonist: st.activeProtagonist,
          marinaScene: st.protagonists.marina.currentSceneId,
          kojiroScene: st.protagonists.kojiro.currentSceneId,
          barriers: st.sharedWorld.unlockedBarriers.length,
          payload: engine.serialize(),
        };
        try {
          localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(record));
        } catch (_) {}
        renderSaveSlots();
      });
    }

    var loadBtns = el.saveSlotsList.querySelectorAll('[data-load-slot]');
    for (i = 0; i < loadBtns.length; i++) {
      loadBtns[i].addEventListener('click', function () {
        var key = this.getAttribute('data-load-slot');
        try {
          var rawRec = localStorage.getItem(STORAGE_PREFIX + key);
          if (!rawRec) return;
          var parsed = JSON.parse(rawRec);
          var res = engine.deserialize(parsed.payload);
          if (res.ok) {
            el.modalSave.classList.add('hidden');
            closeEndingModal();
            renderAll();
          }
        } catch (_) {}
      });
    }
  }

  // Build Streamlined PLUS Suspect Candidates once
  el.culpritCandidateGrid.innerHTML = CULPRIT_CANDIDATES.map(function (c) {
    return (
      '<button type="button" class="candidate-btn" data-candidate-name="' + escapeHtml(c.submitValue) + '">' +
      '<div>' + escapeHtml(c.label) + '</div>' +
      '<small style="color:var(--text-muted);font-weight:400">' + escapeHtml(c.role) + '</small>' +
      '</button>'
    );
  }).join('');

  var candBtns = el.culpritCandidateGrid.querySelectorAll('.candidate-btn');
  for (var idxC = 0; idxC < candBtns.length; idxC++) {
    candBtns[idxC].addEventListener('click', function () {
      var name = this.getAttribute('data-candidate-name');
      handleSubmitCulprit(name);
    });
  }

  // Event Listeners
  el.btnSightChange.addEventListener('click', function () {
    runCommand('SIGHT_CHANGE');
  });

  el.btnBannerSwitch.addEventListener('click', function () {
    runCommand('SIGHT_CHANGE');
  });

  el.btnAdvanceScene.addEventListener('click', handleAdvanceScene);
  el.btnOpenDeduction.addEventListener('click', openDeductionModal);
  el.btnCloseDeduction.addEventListener('click', closeDeductionModal);

  el.btnSubmitCulprit.addEventListener('click', function () {
    handleSubmitCulprit(el.culpritInput.value);
  });

  el.culpritInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      handleSubmitCulprit(el.culpritInput.value);
    }
  });

  el.btnHintMode.addEventListener('click', function () {
    var cur = engine.getState().mode.sightHintMode;
    engine.setMode({ sightHintMode: cur === 'modern' ? 'classic' : 'modern' });
    renderAll();
  });

  el.btnDeductionMode.addEventListener('click', function () {
    var cur = engine.getState().mode.culpritInputMode;
    engine.setMode({ culpritInputMode: cur === 'classic' ? 'streamlined' : 'classic' });
    renderAll();
  });

  el.btnSaveModal.addEventListener('click', function () {
    renderSaveSlots();
    el.modalSave.classList.remove('hidden');
  });

  el.btnCloseSave.addEventListener('click', function () {
    el.modalSave.classList.add('hidden');
  });

  el.btnReset.addEventListener('click', function () {
    engine.reset();
    activeVerb = 'LOOK';
    inspectedTimelineItem = null;
    closeEndingModal();
    closeDeductionModal();
    renderAll();
  });

  el.btnEndingRetry.addEventListener('click', function () {
    var res = engine.retryFromCheckpoint();
    if (res.ok) {
      closeEndingModal();
      renderAll();
    }
  });

  el.btnEndingNewgame.addEventListener('click', function () {
    engine.reset();
    activeVerb = 'LOOK';
    closeEndingModal();
    renderAll();
  });

  // 6-Verb Deck Buttons
  for (var v = 0; v < el.verbBtns.length; v++) {
    el.verbBtns[v].addEventListener('click', function () {
      var vName = this.getAttribute('data-verb');
      if (vName === 'SIGHT_CHANGE') {
        runCommand('SIGHT_CHANGE');
        return;
      }
      activeVerb = vName;
      renderAll();
    });
  }

  // Right Intel Panel Tabs
  for (var t = 0; t < el.intelTabs.length; t++) {
    el.intelTabs[t].addEventListener('click', function () {
      activeTab = this.getAttribute('data-tab');
      for (var j = 0; j < el.intelTabs.length; j++) {
        el.intelTabs[j].classList.toggle('active', el.intelTabs[j].getAttribute('data-tab') === activeTab);
      }
      var panes = document.querySelectorAll('.intel-tab-pane');
      for (j = 0; j < panes.length; j++) {
        panes[j].classList.toggle('active', panes[j].id === 'tab-' + activeTab);
      }
    });
  }

  // Keyboard shortcut: Tab for SIGHT CHANGE (when not typing in culprit input)
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Tab' && document.activeElement !== el.culpritInput) {
      if (el.modalDeduction.classList.contains('hidden') && el.modalEnding.classList.contains('hidden')) {
        var check = engine.canSightChange();
        if (check.allowed) {
          ev.preventDefault();
          runCommand('SIGHT_CHANGE');
        }
      }
    }
  });

  // Expose debug handle on window for automated browser QA if needed
  globalThis.__EVE_APP__ = {
    engine: engine,
    renderAll: renderAll,
  };

  // Initial render
  renderAll();
})();
