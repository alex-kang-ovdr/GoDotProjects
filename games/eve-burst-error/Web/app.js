/* EVE burst error — Playable Web UI Controller (Phase 2)
 * Zero external CDNs; works via file:// and HTTP.
 * Connects index.html directly to globalThis.EVE_DATA + globalThis.EveEngine.
 *
 * Phase 2 Elevations:
 * - Custom Neo-Noir SVG Character Portraits (all 18 cast, signature details for 12+ major cast + speaking glow)
 * - Progressive Command Exhaustion depth badges (LOOK / TALK / THINK 1->2->3)
 * - Interactive Clue Cross-Link (모순 대조) Workbench (correlateClues -> 8 dramatic-irony truths)
 * - 27-Scene Parallel Timeline SVG with 12 glowing Sync Barrier arrows (SB_01 ~ SB_12)
 * - 3-Stage Finale Deduction Modal (submitDeductionStep) with unlocked bonus hints
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'playhub.eve-burst-error.v2.slot.';
  var MANUAL_SLOTS = [1, 2, 3];
  var AUTO_SLOT = 'auto';

  var data = globalThis.EVE_DATA;
  var engine = globalThis.EveEngine.createEngine(data);

  var activeVerb = 'LOOK';
  var activeTab = 'timeline';
  var activeSpeakerId = null;
  var inspectedTimelineItem = null;
  var lastCorrelateResult = null;
  var lastDeductionFeedback = '';
  var flashTimer = null;

  var IRONY_LABELS = {
    alias_mismatch: '별칭 불일치 (ALIAS)',
    dual_target_mirror: '대칭 거울상 (MIRROR)',
    split_artifact: '양분된 물증 (SPLIT)',
    impostor_trap: '사칭 함정 (TRAP)',
    concurrent_sync: '동시 협공 (SYNC)',
  };

  // Neo-Noir SVG Character Portrait Specs (18 cast, bespoke visual signatures)
  var PORTRAIT_SPECS = {
    kojiro_amagi: { bg: '#2c150c', rim: '#f59e0b', hair: '#1e1b2e', skin: '#f5cfa8', coat: '#78350f', tie: '#ef4444', style: 'spiky', acc: 'collar' },
    marina_hojo: { bg: '#091f38', rim: '#38bdf8', hair: '#1d4ed8', skin: '#fce1c4', coat: '#0f172a', tie: '#38bdf8', style: 'long_sleek', acc: 'headband' },
    mayako_mido: { bg: '#1e132b', rim: '#c084fc', hair: '#3b2c4e', skin: '#fde6d2', coat: '#312e81', tie: '#f472b6', style: 'bob', acc: 'glasses_round' },
    prisia_rem_crime: { bg: '#261808', rim: '#fbbf24', hair: '#facc15', skin: '#d99b66', coat: '#92400e', tie: '#fef08a', style: 'wavy_long', acc: 'oddeye_pendant' },
    yayoi_katsuragi: { bg: '#261018', rim: '#fb7185', hair: '#7c2d12', skin: '#fae0c8', coat: '#4c1d95', tie: '#f9a8d4', style: 'shoulder_wave', acc: 'earrings' },
    kyoko_himuro: { bg: '#141530', rim: '#818cf8', hair: '#312e81', skin: '#f8dfc7', coat: '#1e293b', tie: '#818cf8', style: 'sharp_bob', acc: 'glasses_rect' },
    aqua_still_lloyd: { bg: '#08262e', rim: '#2dd4bf', hair: '#99f6e4', skin: '#fbe3cd', coat: '#134e4a', tie: '#facc15', style: 'wavy_long', acc: 'tiara_brooch' },
    akane_shibata: { bg: '#2a130b', rim: '#fb923c', hair: '#9a3412', skin: '#f8d7b8', coat: '#3f3f46', tie: '#fb923c', style: 'short_flip', acc: 'camera' },
    saburo_kouno: { bg: '#0e1726', rim: '#60a5fa', hair: '#475569', skin: '#e8bf9a', coat: '#1e293b', tie: '#94a3b8', style: 'slick_back', acc: 'mustache' },
    glen: { bg: '#18100d', rim: '#f97316', hair: '#27272a', skin: '#e5b88f', coat: '#292524', tie: '#f59e0b', style: 'fedora', acc: 'sunglasses' },
    ross_mido: { bg: '#1b1124', rim: '#e879f9', hair: '#cbd5e1', skin: '#efd2b5', coat: '#3b0764', tie: '#fbbf24', style: 'aristocrat', acc: 'monocle' },
    genzaburo_katsuragi: { bg: '#171717', rim: '#a3a3a3', hair: '#52525b', skin: '#dfb186', coat: '#44403c', tie: '#d97706', style: 'weathered', acc: 'beard' },
    celia_flat: { bg: '#1b1328', rim: '#a78bfa', hair: '#4c1d95', skin: '#e9b991', coat: '#1f2937', tie: '#a78bfa', style: 'long_sleek', acc: 'earrings' },
    dib: { bg: '#260b0b', rim: '#ef4444', hair: '#18181b', skin: '#d8a47c', coat: '#450a0a', tie: '#ef4444', style: 'slick_back', acc: 'scar' },
    susumu_nikaido: { bg: '#24160b', rim: '#f59e0b', hair: '#292524', skin: '#f0c7a0', coat: '#334155', tie: '#fbbf24', style: 'spiky', acc: 'none' },
    misumi_kagawa: { bg: '#240c18', rim: '#f43f5e', hair: '#1e1b4b', skin: '#fae0c8', coat: '#3f1d2e', tie: '#f43f5e', style: 'sharp_bob', acc: 'glasses_rect' },
    stollman_kou: { bg: '#102026', rim: '#22d3ee', hair: '#94a3b8', skin: '#edd0b4', coat: '#1e293b', tie: '#38bdf8', style: 'aristocrat', acc: 'glasses_round' },
    hiromi_matsuno: { bg: '#0c231c', rim: '#34d399', hair: '#78350f', skin: '#fce3cc', coat: '#065f46', tie: '#fde68a', style: 'shoulder_wave', acc: 'none' },
  };

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
    scenePortraitDock: document.getElementById('scene-portrait-dock'),
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

    corrCountPill: document.getElementById('corr-count-pill'),
    selectClueKojiro: document.getElementById('select-clue-kojiro'),
    selectClueMarina: document.getElementById('select-clue-marina'),
    btnCorrelateClues: document.getElementById('btn-correlate-clues'),
    correlateFeedback: document.getElementById('correlate-feedback'),
    discoveredCorrelationsList: document.getElementById('discovered-correlations-list'),

    invListKojiro: document.getElementById('inv-list-kojiro'),
    invListMarina: document.getElementById('inv-list-marina'),
    asymmetryCount: document.getElementById('asymmetry-count'),
    asymmetryList: document.getElementById('asymmetry-list'),
    dossierList: document.getElementById('dossier-list'),

    modalDeduction: document.getElementById('modal-deduction'),
    btnCloseDeduction: document.getElementById('btn-close-deduction'),
    deductionStepper: document.getElementById('deduction-stepper'),
    deductionStageBadge: document.getElementById('deduction-stage-badge'),
    deductionQuestion: document.getElementById('deduction-question'),
    deductionBonusHints: document.getElementById('deduction-bonus-hints'),
    deductionFeedback: document.getElementById('deduction-feedback'),
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
    } catch (_) {}
  }

  // Custom Neo-Noir SVG Character Portrait Renderer
  function renderCharacterPortraitSvg(charId, sceneId, isSpeaking) {
    var sp = PORTRAIT_SPECS[charId] || {
      bg: '#101828',
      rim: '#94a3b8',
      hair: '#334155',
      skin: '#f0cfa8',
      coat: '#1e293b',
      tie: '#38bdf8',
      style: 'slick_back',
      acc: 'none',
    };

    // Authentic detail: Mayako has her glasses OFF in Tristan Engine Room (K_D5_02)!
    var effectiveAcc = charId === 'mayako_mido' && sceneId === 'K_D5_02' ? 'none' : sp.acc;

    var hairBack = '';
    var hairFront = '';
    if (sp.style === 'long_sleek' || sp.style === 'wavy_long') {
      hairBack = '<path d="M20 42 Q18 86 24 108 L76 108 Q82 86 80 42 Q76 14 50 14 Q24 14 20 42 Z" fill="' + sp.hair + '"/>';
      hairFront = '<path d="M24 44 Q32 22 50 22 Q68 22 76 44 Q64 31 50 35 Q36 31 24 44 Z" fill="' + sp.hair + '"/>';
    } else if (sp.style === 'bob' || sp.style === 'sharp_bob' || sp.style === 'shoulder_wave') {
      hairBack = '<path d="M22 42 Q20 74 28 84 L72 84 Q80 74 78 42 Q74 16 50 16 Q26 16 22 42 Z" fill="' + sp.hair + '"/>';
      hairFront = '<path d="M24 42 Q34 22 50 23 Q66 22 76 42 Q64 30 50 32 Q36 30 24 42 Z" fill="' + sp.hair + '"/>';
    } else if (sp.style === 'spiky') {
      hairFront = '<polygon points="24,44 20,26 34,28 42,12 52,24 64,13 68,28 80,25 76,44 64,32 50,34 36,32" fill="' + sp.hair + '"/>';
    } else if (sp.style === 'short_flip') {
      hairBack = '<path d="M24 42 Q20 66 26 70 L74 70 Q80 66 76 42 Q72 18 50 18 Q28 18 24 42 Z" fill="' + sp.hair + '"/>';
      hairFront = '<path d="M25 41 Q38 20 50 24 Q62 20 75 41 Q60 28 50 33 Q40 28 25 41 Z" fill="' + sp.hair + '"/>';
    } else if (sp.style === 'fedora') {
      hairFront =
        '<path d="M16 34 L84 34 L72 28 L66 14 L34 14 L28 28 Z" fill="#18181b" stroke="' + sp.rim + '" stroke-width="1"/>' +
        '<rect x="31" y="25" width="38" height="4" fill="' + sp.rim + '"/>';
    } else {
      hairFront = '<path d="M26 42 Q28 18 50 18 Q72 18 74 42 Q62 28 50 29 Q38 28 26 42 Z" fill="' + sp.hair + '"/>';
    }

    // Eyes (special heterochromia odd-eyes for Purin/Prisia!)
    var leftEyeColor = effectiveAcc === 'oddeye_pendant' ? '#38bdf8' : '#0f172a';
    var rightEyeColor = effectiveAcc === 'oddeye_pendant' ? '#f59e0b' : '#0f172a';
    var eyes =
      '<ellipse cx="40" cy="49" rx="3.4" ry="2.6" fill="#ffffff"/>' +
      '<ellipse cx="60" cy="49" rx="3.4" ry="2.6" fill="#ffffff"/>' +
      '<circle cx="40" cy="49" r="2.1" fill="' + leftEyeColor + '"/>' +
      '<circle cx="60" cy="49" r="2.1" fill="' + rightEyeColor + '"/>';

    // Accessories
    var accSvg = '';
    if (effectiveAcc === 'glasses_round') {
      accSvg =
        '<circle cx="40" cy="49" r="7" fill="rgba(255,255,255,0.12)" stroke="#e2e8f0" stroke-width="1.4"/>' +
        '<circle cx="60" cy="49" r="7" fill="rgba(255,255,255,0.12)" stroke="#e2e8f0" stroke-width="1.4"/>' +
        '<line x1="47" y1="49" x2="53" y2="49" stroke="#e2e8f0" stroke-width="1.4"/>';
    } else if (effectiveAcc === 'glasses_rect') {
      accSvg =
        '<rect x="32" y="45" width="15" height="8" rx="2" fill="rgba(129,140,248,0.16)" stroke="#cbd5e1" stroke-width="1.3"/>' +
        '<rect x="53" y="45" width="15" height="8" rx="2" fill="rgba(129,140,248,0.16)" stroke="#cbd5e1" stroke-width="1.3"/>' +
        '<line x1="47" y1="49" x2="53" y2="49" stroke="#cbd5e1" stroke-width="1.3"/>';
    } else if (effectiveAcc === 'sunglasses') {
      accSvg =
        '<rect x="31" y="44" width="16" height="9" rx="2" fill="#09090b" stroke="#f59e0b" stroke-width="1.2"/>' +
        '<rect x="53" y="44" width="16" height="9" rx="2" fill="#09090b" stroke="#f59e0b" stroke-width="1.2"/>' +
        '<line x1="47" y1="48" x2="53" y2="48" stroke="#f59e0b" stroke-width="1.2"/>';
    } else if (effectiveAcc === 'monocle') {
      accSvg =
        '<circle cx="60" cy="49" r="7" fill="rgba(251,191,36,0.12)" stroke="#fbbf24" stroke-width="1.4"/>' +
        '<line x1="67" y1="51" x2="72" y2="78" stroke="#fbbf24" stroke-width="0.9" stroke-dasharray="2 2"/>';
    } else if (effectiveAcc === 'headband') {
      accSvg = '<path d="M26 32 Q50 20 74 32" fill="none" stroke="#38bdf8" stroke-width="3"/>';
    } else if (effectiveAcc === 'oddeye_pendant') {
      accSvg = '<polygon points="50,82 54,88 50,94 46,88" fill="#fbbf24" stroke="#ffffff" stroke-width="0.8"/>';
    } else if (effectiveAcc === 'camera') {
      accSvg =
        '<line x1="36" y1="76" x2="46" y2="96" stroke="#f59e0b" stroke-width="2"/>' +
        '<line x1="64" y1="76" x2="54" y2="96" stroke="#f59e0b" stroke-width="2"/>' +
        '<rect x="42" y="92" width="16" height="11" rx="2" fill="#18181b" stroke="#fb923c" stroke-width="1.2"/>' +
        '<circle cx="50" cy="97.5" r="3" fill="#38bdf8"/>';
    } else if (effectiveAcc === 'mustache') {
      accSvg = '<path d="M41 59 Q50 56 59 59" fill="none" stroke="#334155" stroke-width="2.6" stroke-linecap="round"/>';
    } else if (effectiveAcc === 'beard') {
      accSvg = '<path d="M35 61 Q50 74 65 61 Q58 68 50 69 Q42 68 35 61 Z" fill="#52525b" opacity="0.85"/>';
    } else if (effectiveAcc === 'scar') {
      accSvg = '<line x1="57" y1="42" x2="64" y2="57" stroke="#b91c1c" stroke-width="1.5"/>';
    } else if (effectiveAcc === 'tiara_brooch') {
      accSvg = '<circle cx="50" cy="86" r="4" fill="#2dd4bf" stroke="#fde68a" stroke-width="1.2"/>';
    } else if (effectiveAcc === 'collar') {
      accSvg = '<polygon points="28,76 38,88 44,76" fill="#92400e"/><polygon points="72,76 62,88 56,76" fill="#92400e"/>';
    }

    var mouth = isSpeaking
      ? '<ellipse cx="50" cy="61" rx="4.2" ry="2.2" fill="#be123c"/>'
      : '<path d="M44 61 Q50 63 56 61" fill="none" stroke="#7c2d12" stroke-width="1.5" stroke-linecap="round"/>';

    return (
      '<svg viewBox="0 0 100 116" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="pbg_' + charId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + sp.bg + '"/><stop offset="100%" stop-color="#050811"/></linearGradient></defs>' +
      '<rect width="100" height="116" fill="url(#pbg_' + charId + ')"/>' +
      '<circle cx="50" cy="46" r="36" fill="' + sp.rim + '" opacity="' + (isSpeaking ? '0.26' : '0.12') + '"/>' +
      hairBack +
      // Shoulders & Coat
      '<path d="M12 116 Q16 78 50 76 Q84 78 88 116 Z" fill="' + sp.coat + '" stroke="' + sp.rim + '" stroke-opacity="0.45" stroke-width="1.2"/>' +
      // Tie / Collar V
      '<polygon points="44,76 56,76 50,96" fill="' + sp.tie + '" opacity="0.85"/>' +
      // Neck & Face
      '<rect x="44" y="65" width="12" height="14" rx="4" fill="' + sp.skin + '"/>' +
      '<ellipse cx="50" cy="49" rx="19" ry="22" fill="' + sp.skin + '"/>' +
      // Noir shadow half-tone
      '<path d="M50 27 A19 22 0 0 1 50 71 Z" fill="#000000" opacity="0.1"/>' +
      eyes +
      mouth +
      hairFront +
      accSvg +
      '</svg>'
    );
  }

  // Atmospheric SVG Backdrop per Canonical Location (all 16 locations distinct!)
  function renderLocationSvg(locId, sightMode, isBlocked) {
    var palettes = {
      marina: { bg1: '#051226', bg2: '#0f2c4d', accent: '#38bdf8', sub: '#818cf8' },
      kojiro: { bg1: '#1a0c08', bg2: '#3f1910', accent: '#f59e0b', sub: '#ef4444' },
      converged: { bg1: '#11071a', bg2: '#2e1026', accent: '#fbbf24', sub: '#38bdf8' },
    };
    var pal = palettes[sightMode] || palettes.marina;
    var motif = '';

    if (locId === 'loc_jcia_hq') {
      motif =
        '<g stroke="' + pal.accent + '" stroke-opacity="0.28" stroke-width="1">' +
        '<rect x="60" y="34" width="220" height="118" rx="6" fill="rgba(4,12,26,0.75)"/>' +
        '<rect x="310" y="34" width="320" height="118" rx="6" fill="rgba(4,12,26,0.75)"/>' +
        '<line x1="80" y1="62" x2="255" y2="62"/><line x1="80" y1="84" x2="225" y2="84"/><line x1="80" y1="106" x2="245" y2="106"/>' +
        '<circle cx="470" cy="93" r="38" fill="none" stroke-dasharray="9 6" stroke-width="2"/>' +
        '<circle cx="470" cy="93" r="22" fill="none" stroke="' + (isBlocked ? '#ef4444' : pal.accent) + '" stroke-width="2.5"/>' +
        '</g>' +
        '<text x="470" y="98" text-anchor="middle" fill="' + (isBlocked ? '#fca5a5' : pal.accent) + '" font-family="monospace" font-size="11" font-weight="700">' +
        (isBlocked ? 'LOCK LV-7' : 'JCIA DBMS') + '</text>';
    } else if (locId === 'loc_tristan_hold') {
      motif =
        '<rect x="0" y="138" width="700" height="100" fill="rgba(14,116,144,0.34)"/>' +
        '<path d="M0 142 Q90 132 180 142 T360 142 T540 142 T700 142" fill="none" stroke="#38bdf8" stroke-width="2" opacity="0.8"/>' +
        '<g stroke="#fbbf24" stroke-width="1.5" opacity="0.65" fill="rgba(20,10,28,0.65)">' +
        '<rect x="90" y="42" width="120" height="90" rx="4"/>' +
        '<circle cx="350" cy="86" r="46" stroke-dasharray="12 6"/>' +
        '<rect x="520" y="64" width="28" height="66" rx="10"/><rect x="556" y="64" width="28" height="66" rx="10"/>' +
        '</g>' +
        '<text x="350" y="91" text-anchor="middle" fill="#fde68a" font-family="monospace" font-size="11" font-weight="700">O2 SURVIVAL // CONVERGED</text>';
    } else if (locId === 'loc_tristan_engine') {
      // Engine Room Pipes, Boiler Gauges & Amber Steam
      motif =
        '<g fill="rgba(22,12,8,0.82)" stroke="#f59e0b" stroke-opacity="0.55" stroke-width="1.8">' +
        '<rect x="50" y="34" width="120" height="150" rx="6"/>' +
        '<rect x="210" y="48" width="280" height="118" rx="8"/>' +
        '<rect x="530" y="34" width="120" height="150" rx="6"/>' +
        '<circle cx="280" cy="96" r="24" fill="rgba(239,68,68,0.2)"/><circle cx="350" cy="96" r="24" fill="rgba(245,158,11,0.2)"/><circle cx="420" cy="96" r="24" fill="rgba(239,68,68,0.2)"/>' +
        '<line x1="0" y1="42" x2="700" y2="42" stroke-width="5" stroke-opacity="0.35"/>' +
        '<line x1="0" y1="168" x2="700" y2="168" stroke-width="4" stroke-opacity="0.35"/>' +
        '</g>' +
        '<text x="350" y="148" text-anchor="middle" fill="#fde68a" font-family="monospace" font-size="10" font-weight="700">TRISTAN ENGINE ROOM // SEAL MISSING</text>';
    } else if (locId === 'loc_tristan_deck') {
      motif =
        '<path d="M40 150 L660 150 L610 190 L90 190 Z" fill="rgba(15,23,42,0.85)" stroke="' + pal.accent + '" stroke-width="1.5"/>' +
        '<rect x="190" y="75" width="320" height="75" rx="6" fill="rgba(15,23,42,0.72)" stroke="' + pal.accent + '" stroke-opacity="0.5"/>' +
        '<g fill="#fde68a" opacity="0.75">' +
        '<circle cx="235" cy="112" r="7"/><circle cx="285" cy="112" r="7"/><circle cx="335" cy="112" r="7"/><circle cx="385" cy="112" r="7"/><circle cx="435" cy="112" r="7"/>' +
        '</g>' +
        '<circle cx="590" cy="48" r="22" fill="#fde68a" opacity="0.25"/>';
    } else if (locId === 'loc_yale_dorm') {
      // Dormitory Corridor & Night Blackout Windows
      motif =
        '<g fill="rgba(6,12,24,0.84)" stroke="' + pal.accent + '" stroke-opacity="0.45" stroke-width="1.5">' +
        '<rect x="75" y="34" width="120" height="146" rx="4"/>' +
        '<rect x="290" y="34" width="120" height="146" rx="4"/>' +
        '<rect x="505" y="34" width="120" height="146" rx="4"/>' +
        '<rect x="312" y="54" width="76" height="58" fill="rgba(56,189,248,0.16)"/>' +
        '</g>' +
        '<circle cx="350" cy="24" r="7" fill="#ef4444" opacity="0.75"/>';
    } else if (locId === 'loc_yale_school_grounds' || locId === 'loc_yale_director_room') {
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
      motif =
        '<g fill="rgba(10,6,5,0.65)" stroke="' + pal.accent + '" stroke-opacity="0.45">' +
        '<rect x="90" y="28" width="230" height="135" rx="4"/>' +
        '<line x1="90" y1="50" x2="320" y2="50"/><line x1="90" y1="72" x2="320" y2="72"/><line x1="90" y1="94" x2="320" y2="94"/><line x1="90" y1="116" x2="320" y2="116"/><line x1="90" y1="138" x2="320" y2="138"/>' +
        '</g>' +
        '<polygon points="480,58 550,58 595,180 435,180" fill="' + pal.accent + '" opacity="0.16"/>' +
        '<rect x="405" y="155" width="220" height="28" rx="4" fill="rgba(18,10,8,0.85)" stroke="' + pal.accent + '" stroke-opacity="0.5"/>';
    } else if (locId === 'loc_warehouse_district') {
      motif =
        '<g fill="rgba(12,8,8,0.85)" stroke="' + pal.accent + '" stroke-opacity="0.45">' +
        '<rect x="55" y="112" width="160" height="82"/><polygon points="55,112 135,76 215,112"/>' +
        '<rect x="245" y="128" width="145" height="66"/>' +
        '<path d="M430 194 L465 72 L605 42 L610 50 L474 82 L444 194 Z"/>' +
        '<line x1="580" y1="54" x2="580" y2="135" stroke-dasharray="4 4"/>' +
        '</g>';
    } else if (locId === 'loc_shot_bar') {
      motif =
        '<rect x="80" y="138" width="540" height="44" rx="6" fill="rgba(24,10,12,0.88)" stroke="#f59e0b" stroke-width="1.5"/>' +
        '<g fill="rgba(245,158,11,0.35)" stroke="#fbbf24" stroke-width="1">' +
        '<rect x="145" y="74" width="22" height="58" rx="4"/><rect x="182" y="64" width="24" height="68" rx="4"/>' +
        '<rect x="222" y="80" width="20" height="52" rx="4"/><rect x="490" y="68" width="24" height="64" rx="4"/>' +
        '</g>' +
        '<polygon points="340,95 385,95 362,126" fill="none" stroke="#38bdf8" stroke-width="2"/><line x1="362" y1="126" x2="362" y2="138" stroke="#38bdf8" stroke-width="2"/>';
    } else if (locId === 'loc_stollman_mansion' || locId === 'loc_eldia_embassy') {
      motif =
        '<g fill="rgba(10,14,24,0.8)" stroke="' + pal.accent + '" stroke-opacity="0.55" stroke-width="1.5">' +
        '<polygon points="110,66 350,26 590,66"/>' +
        '<rect x="145" y="66" width="26" height="122"/><rect x="245" y="66" width="26" height="122"/>' +
        '<rect x="429" y="66" width="26" height="122"/><rect x="529" y="66" width="26" height="122"/>' +
        '<rect x="302" y="82" width="96" height="74" fill="rgba(245,158,11,0.14)"/>' +
        '<polygon points="350,92 376,119 350,146 324,119" fill="none" stroke="#fbbf24" stroke-width="1.6"/>' +
        '</g>';
    } else {
      motif =
        '<g fill="rgba(8,12,24,0.82)" stroke="' + pal.accent + '" stroke-opacity="0.4">' +
        '<rect x="65" y="68" width="85" height="140"/><rect x="170" y="40" width="110" height="168"/>' +
        '<rect x="300" y="82" width="95" height="126"/><rect x="415" y="52" width="120" height="156"/>' +
        '<rect x="555" y="92" width="85" height="116"/>' +
        '</g>' +
        '<line x1="0" y1="196" x2="700" y2="196" stroke="' + pal.accent + '" stroke-width="1.5" opacity="0.5"/>';
    }

    return (
      '<svg viewBox="0 0 700 238" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<linearGradient id="vpBg" x1="0%" y1="0%" x2="100%" y2="100%">' +
      '<stop offset="0%" stop-color="' + pal.bg1 + '"/>' +
      '<stop offset="100%" stop-color="' + pal.bg2 + '"/>' +
      '</linearGradient>' +
      '</defs>' +
      '<rect width="700" height="238" fill="url(#vpBg)"/>' +
      '<g stroke="' + pal.accent + '" stroke-opacity="0.08" stroke-width="1">' +
      '<line x1="0" y1="45" x2="700" y2="45"/><line x1="0" y1="90" x2="700" y2="90"/>' +
      '<line x1="0" y1="135" x2="700" y2="135"/><line x1="0" y1="180" x2="700" y2="180"/>' +
      '</g>' +
      motif +
      '</svg>'
    );
  }

  // Parallel Timeline & Sync Barrier SVG Visualizer (27 scenes + 12 glowing cross-causal barriers!)
  function renderTimelineSvg() {
    var graph = engine.getTimelineGraph();
    var nodesById = {};
    var marinaOrder = [];
    var kojiroOrder = [];

    for (var i = 0; i < graph.nodes.length; i++) {
      var nd = graph.nodes[i];
      nodesById[nd.id] = nd;
      if (nd.track === 'marina') marinaOrder.push(nd.id);
      else if (nd.track === 'kojiro') kojiroOrder.push(nd.id);
    }

    var coords = {};
    var xStart = 44;
    var step = 64;
    for (var m = 0; m < marinaOrder.length; m++) {
      coords[marinaOrder[m]] = { x: xStart + m * step, y: 62 };
    }
    for (var k = 0; k < kojiroOrder.length; k++) {
      coords[kojiroOrder[k]] = { x: xStart + (k + 1) * step, y: 196 };
    }
    var lastX = Math.max(
      coords[marinaOrder[marinaOrder.length - 1]].x,
      coords[kojiroOrder[kojiroOrder.length - 1]].x
    );
    coords['C_D6_01'] = { x: lastX + 58, y: 129 };

    var svgW = coords['C_D6_01'].x + 42;
    var svgParts = [];
    svgParts.push(
      '<svg viewBox="0 0 ' + svgW + ' 258" width="' + svgW + '" height="258" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
      '<filter id="glowBarrier" x="-30%" y="-30%" width="160%" height="160%">' +
      '<feGaussianBlur stdDeviation="2.5" result="blur"/>' +
      '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>' +
      '<marker id="arrLocked" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
      '<polygon points="0 0, 7 3.5, 0 7" fill="#ef4444"/></marker>' +
      '<marker id="arrUnlocked" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">' +
      '<polygon points="0 0, 7 3.5, 0 7" fill="#34d399"/></marker>' +
      '</defs>'
    );

    svgParts.push(
      '<text x="12" y="24" fill="#38bdf8" font-family="monospace" font-size="10" font-weight="700">MARINA TRACK (13 SCENES · 12/2~12/7)</text>' +
      '<text x="12" y="246" fill="#f59e0b" font-family="monospace" font-size="10" font-weight="700">KOJIRO TRACK (13 SCENES · 12/3~12/7)</text>'
    );

    // Intra-track lines
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
    var lastM = coords[marinaOrder[marinaOrder.length - 1]];
    var lastK = coords[kojiroOrder[kojiroOrder.length - 1]];
    svgParts.push(
      '<line x1="' + lastM.x + '" y1="' + lastM.y + '" x2="' + coords['C_D6_01'].x + '" y2="' + coords['C_D6_01'].y + '" stroke="#fbbf24" stroke-opacity="0.5" stroke-width="2"/>' +
      '<line x1="' + lastK.x + '" y1="' + lastK.y + '" x2="' + coords['C_D6_01'].x + '" y2="' + coords['C_D6_01'].y + '" stroke="#fbbf24" stroke-opacity="0.5" stroke-width="2"/>'
    );

    // Cross-Protagonist Sync Barrier Arrows (SB_01 ~ SB_12)
    for (var bi = 0; bi < graph.barriers.length; bi++) {
      var bar = graph.barriers[bi];
      var fromP = coords[bar.fromScene];
      var toP = coords[bar.toScene];
      if (!fromP || !toP) continue;

      var stroke = bar.unlocked ? '#34d399' : bar.activeBlock ? '#f87171' : '#94a3b8';
      var dash = bar.unlocked ? '' : ' stroke-dasharray="4 3"';
      var marker = bar.unlocked ? 'url(#arrUnlocked)' : 'url(#arrLocked)';
      var midX = (fromP.x + toP.x) / 2;
      var laneOffsets = [104, 152, 118, 140];
      var midY = laneOffsets[bi % laneOffsets.length];
      if (bar.id === 'SB_12') {
        midX = coords['C_D6_01'].x - 28;
        midY = 129;
      }

      var shortNum = bar.id.replace('SB_0', 'B').replace('SB_', 'B');
      var glowAttr = bar.unlocked || bar.activeBlock ? ' filter="url(#glowBarrier)"' : '';

      svgParts.push(
        '<g class="tl-barrier" data-barrier-id="' + bar.id + '" style="cursor:pointer">' +
        '<path d="M ' + fromP.x + ' ' + fromP.y + ' Q ' + midX + ' ' + midY + ' ' + toP.x + ' ' + toP.y + '"' +
        ' fill="none" stroke="' + stroke + '" stroke-width="' + (bar.activeBlock ? 2.6 : 1.7) + '"' + dash + glowAttr +
        ' marker-end="' + marker + '" opacity="' + (bar.unlocked || bar.activeBlock ? 0.96 : 0.52) + '"/>' +
        '<rect x="' + (midX - 18) + '" y="' + (midY - 8) + '" width="36" height="16" rx="4" fill="' +
        (bar.unlocked ? '#064e3b' : bar.activeBlock ? '#7f1d1d' : '#1e293b') +
        '" stroke="' + stroke + '" stroke-width="1"/>' +
        '<text x="' + midX + '" y="' + (midY + 3) + '" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-size="8" font-weight="700">' +
        (bar.unlocked ? '🔓' : '🔒') + shortNum + '</text>' +
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

      var r = isConv ? 21 : 14;
      svgParts.push(
        '<g class="tl-node" data-scene-id="' + n.id + '" style="cursor:pointer">' +
        (n.isCurrentFocus
          ? '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + (r + 4.5) + '" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-dasharray="3 2"/>'
          : '') +
        '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="' + r + '" fill="' + fill + '" stroke="' + strokeColor + '" stroke-width="' + (n.isCurrentFocus ? 2.4 : 1.5) + '"/>' +
        '<text x="' + pos.x + '" y="' + (pos.y + 3) + '" text-anchor="middle" fill="#f8fafc" font-family="monospace" font-size="' + (isConv ? 8 : 7.2) + '" font-weight="700">' +
        n.id.replace('_0', '.') + '</text>' +
        '<text x="' + pos.x + '" y="' + (pos.y + (n.track === 'kojiro' ? 25 : -19)) + '" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="7.5">' +
        n.calendarDate + '</text>' +
        '</g>'
      );
    }

    svgParts.push('</svg>');
    el.timelineSvgHost.style.minWidth = svgW + 'px';
    el.timelineSvgHost.innerHTML = svgParts.join('');

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

    var totalBarriers = data.syncBarriers.length;
    var totalClues = data.clues.length;
    var marinaTrackTotal = data.scenes.filter(function (s) { return s.track === 'marina'; }).length;
    var kojiroTrackTotal = data.scenes.filter(function (s) { return s.track === 'kojiro'; }).length;

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
    el.marinaDoneCount.textContent = '완료 ' + Math.min(mState.completedScenes.length, marinaTrackTotal) + '/' + marinaTrackTotal;

    el.kojiroSceneMeta.textContent = engine.getCurrentScene('kojiro').calendar_date + ' · ' + kState.currentSceneId;
    el.kojiroLocMeta.textContent = findLocation(kState.locationId).name_kr;
    el.kojiroInvCount.textContent = '소지품 ' + kState.inventory.length;
    el.kojiroClueCount.textContent = '단서 ' + kState.knownClues.length;
    el.kojiroDoneCount.textContent = '완료 ' + Math.min(kState.completedScenes.length, kojiroTrackTotal) + '/' + kojiroTrackTotal;

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
    el.barrierProgressPill.textContent =
      '동기화 장벽 ' + st.sharedWorld.unlockedBarriers.length + ' / ' + totalBarriers + ' 해제';

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
      el.btnOpenDeduction.textContent =
        '⚖ 3단계 최종 추리 (' + Math.min(st.sharedWorld.deductionProgress + 1, 3) + '/3)';
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

    // 6. Viewport SVG + Location Overlay + Neo-Noir SVG Portrait Dock + Quick-Talk Strip
    el.sceneSvgViewport.innerHTML = renderLocationSvg(currLoc.id, theme, activeBlocked);
    el.sceneLocationOverlay.textContent = '📍 ' + currLoc.name_kr + ' (' + currLoc.district + ')';

    var selfId = who === 'kojiro' ? 'kojiro_amagi' : 'marina_hojo';
    var portraitChars = [selfId];
    for (var pc = 0; pc < currScene.character_ids.length; pc++) {
      var pcid = currScene.character_ids[pc];
      if (pcid !== selfId && portraitChars.length < 4) {
        portraitChars.push(pcid);
      }
    }

    el.scenePortraitDock.innerHTML = portraitChars
      .map(function (cid) {
        var cv = engine.getCharacterView(cid, who);
        var isSelf = cid === selfId;
        var isSpeaking = activeSpeakerId === cid;
        var shortLabel = cv ? cv.displayName : cid;
        return (
          '<button type="button" class="portrait-card ' +
          (isSelf ? 'is-protagonist ' : '') +
          (isSpeaking ? 'is-speaking' : '') +
          '" data-portrait-char="' + escapeHtml(cid) + '" title="' +
          escapeHtml(isSelf ? shortLabel + ' (현재 시점)' : shortLabel + '에게 TALK') + '">' +
          '<div class="portrait-svg-frame">' + renderCharacterPortraitSvg(cid, currScene.id, isSpeaking) + '</div>' +
          '<span class="portrait-name-tag">' + escapeHtml(shortLabel) + '</span>' +
          '</button>'
        );
      })
      .join('');

    var portraitBtns = el.scenePortraitDock.querySelectorAll('.portrait-card');
    for (var pi = 0; pi < portraitBtns.length; pi++) {
      portraitBtns[pi].addEventListener('click', function () {
        var cid = this.getAttribute('data-portrait-char');
        if (cid === selfId) {
          activeVerb = 'THINK';
          runCommand('THINK', 'situation');
        } else {
          activeVerb = 'TALK';
          runCommand('TALK', cid);
        }
      });
    }

    var charChipsHtml = [];
    for (var ci = 0; ci < currScene.character_ids.length; ci++) {
      var cid = currScene.character_ids[ci];
      if (cid === selfId) continue;
      var cv = engine.getCharacterView(cid, who);
      if (!cv) continue;
      charChipsHtml.push(
        '<button type="button" class="char-chip ' + (activeSpeakerId === cid ? 'is-speaking' : '') + '" data-talk-char="' + escapeHtml(cid) + '">' +
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

    // 9. Scene Objective Chips (with progressive depth progress!)
    var objHtml = [];
    var details = cmds.progress.stepDetails || [];
    for (var oi = 0; oi < details.length; oi++) {
      var d = details[oi];
      var stepLabel = d.verb;
      if (d.verb === 'TALK') {
        var tv = engine.getCharacterView(d.targetId, who);
        stepLabel = 'TALK: ' + (tv ? tv.displayName : d.targetId);
      } else if (d.verb === 'ITEM') {
        var itm = findItem(d.targetId);
        stepLabel = 'ITEM: ' + (itm ? itm.name_kr : d.targetId);
      } else if (d.verb === 'LOOK') {
        stepLabel = 'LOOK: 핵심 현장 조사';
      }
      if (d.requiredDepth > 1) {
        stepLabel += ' (' + d.currentDepth + '/' + d.requiredDepth + ')';
      }
      objHtml.push(
        '<span class="obj-chip ' + (d.done ? 'done' : '') + '">' + (d.done ? '✓ ' : '○ ') + escapeHtml(stepLabel) + '</span>'
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

    // 11. Command Deck & Target Tray (with exhaustion indicators!)
    for (var vi = 0; vi < el.verbBtns.length; vi++) {
      var vName = el.verbBtns[vi].getAttribute('data-verb');
      el.verbBtns[vi].classList.toggle('active', vName === activeVerb);
    }
    renderTargetTray(cmds);

    // 12. Right Intel Panel: Timeline, Cross-Causal Log, Cross-Link Workbench, Asymmetry Board, Dossier
    renderTimelineSvg();
    renderCrossCausalLog(st);
    renderCrossLinkWorkbench(st);
    renderAsymmetryBoard(st, totalClues);
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
        if (t.exhausted) classes.push('is-exhausted');
        var badge = t.isKeyObjective || t.usedHere ? '★ ' : t.isCurrent ? '● ' : '';
        var depthHtml = '';
        if (typeof t.maxDepth === 'number' && t.maxDepth > 1) {
          depthHtml =
            '<span class="depth-pill ' + (t.exhausted ? 'done' : '') + '">' +
            (t.exhausted ? '✓ ' + t.maxDepth + '/' + t.maxDepth : t.currentDepth + '/' + t.maxDepth) +
            '</span>';
        }
        return (
          '<button type="button" class="' + classes.join(' ') + '" data-target-id="' + escapeHtml(t.id) + '">' +
          '<span>' + badge + escapeHtml(t.label) + '</span>' + depthHtml +
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
        '<div class="target-empty">아직 해제된 교차 동기화 장벽이 없습니다. 마리나 Day 0 답사(M_D0_03)를 마치면 SB_01이 열립니다.</div>';
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

  function renderCrossLinkWorkbench(st) {
    var totalCorrs = (data.clueCorrelations || []).length;
    var discovered = engine.getDiscoveredCorrelations();
    el.corrCountPill.textContent = '도출 ' + discovered.length + ' / ' + totalCorrs;

    var prevK = el.selectClueKojiro.value;
    var prevM = el.selectClueMarina.value;

    var kClues = st.protagonists.kojiro.knownClues;
    var mClues = st.protagonists.marina.knownClues;

    function buildClueOptions(clueIds, placeholder) {
      var opts = ['<option value="">' + placeholder + '</option>'];
      for (var i = 0; i < clueIds.length; i++) {
        for (var j = 0; j < data.clues.length; j++) {
          if (data.clues[j].id === clueIds[i]) {
            opts.push(
              '<option value="' + escapeHtml(data.clues[j].id) + '">' +
              escapeHtml(data.clues[j].title_kr) + '</option>'
            );
            break;
          }
        }
      }
      return opts.join('');
    }

    el.selectClueKojiro.innerHTML = buildClueOptions(kClues, '코지로 단서 선택 (' + kClues.length + '건)…');
    el.selectClueMarina.innerHTML = buildClueOptions(mClues, '마리나 단서 선택 (' + mClues.length + '건)…');

    if (kClues.indexOf(prevK) !== -1) el.selectClueKojiro.value = prevK;
    if (mClues.indexOf(prevM) !== -1) el.selectClueMarina.value = prevM;

    if (lastCorrelateResult) {
      el.correlateFeedback.classList.remove('hidden', 'matched', 'missed');
      el.correlateFeedback.classList.add(lastCorrelateResult.matched ? 'matched' : 'missed');
      el.correlateFeedback.textContent = lastCorrelateResult.text;
    } else {
      el.correlateFeedback.classList.add('hidden');
    }

    if (discovered.length === 0) {
      el.discoveredCorrelationsList.innerHTML = '';
    } else {
      el.discoveredCorrelationsList.innerHTML = discovered
        .slice()
        .reverse()
        .map(function (c) {
          return (
            '<div class="corr-insight-card">' +
            '<strong>⚡ ' + escapeHtml(c.id) + ' · ' + escapeHtml(c.title_kr) + ' (최종 추리 ' + (c.unlocks_finale_hint_step + 1) + '단계 힌트)</strong>' +
            '<div>' + escapeHtml(c.synthesis_kr) + '</div>' +
            '</div>'
          );
        })
        .join('');
    }
  }

  function renderAsymmetryBoard(st, totalClues) {
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

    var matrix = engine.getAsymmetryMatrix();
    el.asymmetryCount.textContent = String(matrix.length);
    if (el.asymmetryCount.parentNode) {
      el.asymmetryCount.parentNode.innerHTML =
        '발견된 비대칭 단서 매트릭스 (<span id="asymmetry-count">' + matrix.length + '</span>/' + totalClues + ')';
      el.asymmetryCount = document.getElementById('asymmetry-count');
    }

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
    if (verb === 'TALK' && res.ok && res.speakerId) {
      activeSpeakerId = res.speakerId;
    } else if (verb === 'THINK' && res.ok) {
      activeSpeakerId = engine.getActiveProtagonist() === 'kojiro' ? 'kojiro_amagi' : 'marina_hojo';
    } else if (verb === 'SIGHT_CHANGE' && res.ok && res.changed) {
      activeSpeakerId = res.activeProtagonist === 'kojiro' ? 'kojiro_amagi' : 'marina_hojo';
      var sc = res.scene;
      triggerSightFlash(res.activeProtagonist, sc ? sc.calendar_date + ' · ' + sc.title_kr : '');
      autoSaveSnapshot();
    }
    if (!prevConverged && engine.getState().sharedWorld.converged) {
      triggerSightFlash('converged', '트리스탄호 해저 선창 — 양측 22개 단서 완전 통합');
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
      activeSpeakerId = null;
      triggerSightFlash('converged', '12-08 트리스탄호 해저 선창 · 단일 시점 수렴');
      autoSaveSnapshot();
    } else if (res.ok && res.nextSceneId && !res.stalled) {
      activeSpeakerId = null;
    } else if (!res.ok && res.reason === 'OBJECTIVES_INCOMPLETE') {
      if (res.remainingSteps && res.remainingSteps.length > 0) {
        activeVerb = res.remainingSteps[0].split(':')[0];
      }
    }
    renderAll();
  }

  // 3-Stage Finale Deduction Modal Renderer
  function renderDeductionModalContent() {
    var st = engine.getState();
    var steps = data.finaleDeductionSteps || [];
    var currentIdx = Math.min(st.sharedWorld.deductionProgress, steps.length - 1);
    var step = steps[currentIdx];
    if (!step) return;

    var stepEls = el.deductionStepper.querySelectorAll('.ded-step');
    for (var i = 0; i < stepEls.length; i++) {
      stepEls[i].classList.remove('current', 'cleared');
      if (i < st.sharedWorld.deductionProgress) stepEls[i].classList.add('cleared');
      else if (i === st.sharedWorld.deductionProgress) stepEls[i].classList.add('current');
    }

    el.deductionStageBadge.textContent = step.stage_label;
    el.deductionQuestion.textContent = step.question_kr;
    el.culpritInput.placeholder = step.placeholder_kr;
    el.culpritInput.value = '';

    // Show unlocked cross-link bonus hints for this stage!
    var stageHints = engine.getFinaleHints(currentIdx);
    if (stageHints.length > 0) {
      el.deductionBonusHints.classList.remove('hidden');
      el.deductionBonusHints.innerHTML =
        '<strong>⚡ 교차 분석 보너스 힌트 해금됨:</strong><br>' +
        stageHints.map(function (h) { return '• ' + escapeHtml(h.title_kr) + ': ' + escapeHtml(h.synthesis_kr); }).join('<br>');
    } else {
      el.deductionBonusHints.classList.add('hidden');
    }

    if (lastDeductionFeedback) {
      el.deductionFeedback.classList.remove('hidden');
      el.deductionFeedback.textContent = lastDeductionFeedback;
    } else {
      el.deductionFeedback.classList.add('hidden');
    }

    var isClassic = st.mode.culpritInputMode === 'classic';
    el.deductionClassicBox.classList.toggle('hidden', !isClassic);
    el.deductionStreamlinedBox.classList.toggle('hidden', isClassic);

    // Populate PLUS choice grid for the current stage
    el.culpritCandidateGrid.innerHTML = step.choices
      .map(function (c) {
        return (
          '<button type="button" class="candidate-btn" data-candidate-value="' + escapeHtml(c.value) + '">' +
          '<div>' + escapeHtml(c.label) + '</div>' +
          '<small style="color:var(--text-muted);font-weight:400">' + escapeHtml(c.role) + '</small>' +
          '</button>'
        );
      })
      .join('');

    var candBtns = el.culpritCandidateGrid.querySelectorAll('.candidate-btn');
    for (var ci = 0; ci < candBtns.length; ci++) {
      candBtns[ci].addEventListener('click', function () {
        handleSubmitDeduction(this.getAttribute('data-candidate-value'));
      });
    }

    if (isClassic) {
      setTimeout(function () {
        el.culpritInput.focus();
      }, 40);
    }
  }

  function openDeductionModal() {
    var st = engine.getState();
    if (!st.sharedWorld.converged) return;
    lastDeductionFeedback = '';
    renderDeductionModalContent();
    el.modalDeduction.classList.remove('hidden');
  }

  function closeDeductionModal() {
    el.modalDeduction.classList.add('hidden');
  }

  function handleSubmitDeduction(raw) {
    var st = engine.getState();
    var res = engine.submitDeductionStep(st.sharedWorld.deductionProgress, raw);
    if (!res.ok) return;
    if (res.correct && !res.completedAll) {
      lastDeductionFeedback = res.message;
      renderDeductionModalContent();
      renderAll();
    } else {
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
      '<div class="stat-pill"><strong>' + st.sharedWorld.unlockedBarriers.length + '/' + data.syncBarriers.length + '</strong><span>동기화 장벽</span></div>' +
      '<div class="stat-pill"><strong>' + engine.getAsymmetryMatrix().length + '/' + data.clues.length + '</strong><span>비대칭 단서</span></div>' +
      '<div class="stat-pill"><strong>' + st.sharedWorld.discoveredCorrelations.length + '/' + (data.clueCorrelations || []).length + '</strong><span>교차 진실</span></div>';
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
          ' · 장벽 ' + meta.barriers + '/' + data.syncBarriers.length
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
    handleSubmitDeduction(el.culpritInput.value);
  });

  el.culpritInput.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      handleSubmitDeduction(el.culpritInput.value);
    }
  });

  el.btnCorrelateClues.addEventListener('click', function () {
    var clueK = el.selectClueKojiro.value;
    var clueM = el.selectClueMarina.value;
    var res = engine.correlateClues(clueK, clueM);
    if (!res.ok) {
      lastCorrelateResult = { matched: false, text: res.message };
    } else if (res.matched) {
      lastCorrelateResult = {
        matched: true,
        text: '⚡ [' + res.correlation.title_kr + '] ' + res.correlation.synthesis_kr,
      };
    } else {
      lastCorrelateResult = { matched: false, text: res.message };
    }
    renderAll();
  });

  el.btnHintMode.addEventListener('click', function () {
    var cur = engine.getState().mode.sightHintMode;
    engine.setMode({ sightHintMode: cur === 'modern' ? 'classic' : 'modern' });
    renderAll();
  });

  el.btnDeductionMode.addEventListener('click', function () {
    var cur = engine.getState().mode.culpritInputMode;
    engine.setMode({ culpritInputMode: cur === 'classic' ? 'streamlined' : 'classic' });
    if (!el.modalDeduction.classList.contains('hidden')) {
      renderDeductionModalContent();
    }
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
    activeSpeakerId = null;
    inspectedTimelineItem = null;
    lastCorrelateResult = null;
    lastDeductionFeedback = '';
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
    activeSpeakerId = null;
    lastCorrelateResult = null;
    lastDeductionFeedback = '';
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

  // Expose debug handle on window for automated QA
  globalThis.__EVE_APP__ = {
    engine: engine,
    renderAll: renderAll,
  };

  renderAll();
})();
