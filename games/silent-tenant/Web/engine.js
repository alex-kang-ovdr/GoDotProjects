// Pure Deterministic Headless Exploration Adventure Engine for 침묵의 세입자 (The Silent Tenant)
// Phase 2: Playable Cipher Decoder, Threat/Surveillance Tension, Canonical Miyuki Affection Matrix,
// 4F->3F Rusted-Key Break Fallback, Evidence Tape Detection, and Detective Memo Assistant.
// Zero DOM dependencies. UMD export: globalThis.IsakuEngine + module.exports
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.IsakuEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PHASE_ORDER = [
    'phase_1_5f_to_4f',
    'phase_2_4f_exploration',
    'phase_3_3f_exploration',
    'phase_4_2f_exploration',
    'phase_5_climax',
  ];

  const PHASE_LABELS = {
    phase_1_5f_to_4f: 'Phase 1 · 5F 밀실 감금 및 탈출 단서',
    phase_2_4f_exploration: 'Phase 2 · 4F 탐색 및 5F 백트래킹',
    phase_3_3f_exploration: 'Phase 3 · 3F 방송·도서 구역 돌파',
    phase_4_2f_exploration: 'Phase 4 · 2F 난로 연소 및 하층 개방',
    phase_5_climax: 'Phase 5 · 시계탑 대치 및 1F 보건실 탈출',
  };

  const THREAT_BAND_META = {
    low: { id: 'low', labelKo: '잠복 경계', min: 0, max: 29 },
    elevated: { id: 'elevated', labelKo: '감시 강화', min: 30, max: 59 },
    high: { id: 'high', labelKo: '위험 근접', min: 60, max: 84 },
    critical: { id: 'critical', labelKo: '긴급 경보', min: 85, max: 100 },
  };

  // Canonical hotspot -> room pickup mapping (items validated against items.json)
  const HOTSPOT_PICKUPS = {
    hs_5f_3_1_locker: ['item_machine_oil'],
    hs_5f_3_2_desk: ['item_clue_memo_3_2'],
    hs_5f_science_skeleton: ['item_skeleton_memo'],
    hs_5f_science_box: ['item_brown_book'],
    hs_5f_science_floor: ['item_akemi_notebook'],
    hs_4f_hall_paint: ['item_red_paint'],
    hs_4f_storage_box: ['item_screwdriver'],
    hs_3f_broadcast_ladder: ['item_wooden_ladder'],
    hs_3f_broadcast_wall: ['item_lighter', 'item_cipher_table'],
    hs_2f_restroom_left_door: ['item_alcohol_bottle'],
    hs_3f_stall_2: ['item_evidence_tape'],
    hs_1f_hall_isaku_body: ['item_isaku_knife'],
  };

  // Clue texts for readable items
  const CLUE_READINGS = {
    item_invitation_letter:
      '【호출 편지】 "여름방학 밤, 구교사 5층 음악실로 와 달라." — 일행 모두 같은 필체의 편지를 받았으나 발신인이 없다.',
    item_clue_memo_3_2:
      '【3-2 교실 메모】 "5층 남자 화장실 금고의 전반부 번호는 3-2(좌표 32 → 38). 녹슨 자물쇠에는 반드시 3-1 교실의 기계유를 먼저 칠할 것."',
    item_skeleton_memo:
      '【골격 표본 메모】 "계단 셔터를 열 열쇠는 반드시 이 층 금고 안에 있다. 후반부 번호는 표본 5-4(좌표 54 → 78). 합치면 3878. 4층을 연 뒤 금고 뒤편도 잊지 말라."',
    item_cipher_table:
      '【난수표】 6×6 종횡(행·열) 숫자 조합표. 2자리 좌표에서 앞자리는 세로(행), 뒷자리는 가로(열)다. [난수표 해독기]로 수집한 메모 좌표를 교차 해독할 수 있다.',
    item_akemi_notebook:
      '【아케미의 수첩】 테니스부 일지와 함께 쿠미 선생에 대한 복잡한 감정, 그리고 4층 배전반 근처에서 이상한 기름 냄새를 맡았다는 기록이 적혀 있다.',
    item_evidence_tape:
      '【증거 비디오테이프】 구교사 내부 감시 기록이 담긴 테이프. 동료가 고립되었다는 불길한 증거로, 4F 시청각실 비디오 재생기에서 확인할 수 있다.',
  };

  // Incident choice definitions (strictly suspense/mystery-escape safe)
  const INCIDENT_DEFINITIONS = {
    inc_kumi_restroom: {
      titleKo: '쿠미 선생 화장실 동행 위기',
      locationHintKo: '5F 여자 화장실',
      promptKo: '쿠미 선생이 5F 여자 화장실로 향하며 불안해한다. 혼자 두면 위험할 수 있다.',
      choices: [
        { id: 'escort', labelKo: '입구 앞에서 대기하며 끝까지 호위한다', outcome: 'rescue' },
        { id: 'leave_alone', labelKo: '탐색을 서두르기 위해 혼자 두고 이동한다', outcome: 'fail' },
      ],
    },
    inc_rika_isolation: {
      titleKo: '리카 단독 이탈 위기',
      locationHintKo: '4F 복도',
      promptKo: '아카가와 리카가 공포에 질려 4F 복도 어둠 속으로 혼자 달려가려 한다!',
      choices: [
        { id: 'calm_and_group', labelKo: '리카를 진정시키고 본대와 동행시킨다', outcome: 'rescue' },
        { id: 'ignore', labelKo: '일단 두고 열쇠 탐색을 우선한다', outcome: 'fail' },
      ],
    },
    inc_akemi_panel: {
      titleKo: '아케미 4F 배전반 패닉 경보',
      locationHintKo: '4F 배전반 구역',
      promptKo: '아케미가 기름 냄새가 나는 4F 배전반 스위치를 강제로 조작하려 한다! 스파크가 튀면 대형 화재 위험이 있다!',
      choices: [
        { id: 'restrain', labelKo: '즉각 제지하고 배전반에서 떼어놓는다', outcome: 'rescue' },
        { id: 'ignore_panic', labelKo: '전기를 켜도록 내버려 둔다', outcome: 'fail' },
      ],
    },
    inc_mio_separation: {
      titleKo: '미오 3F 복도 고립 위기',
      locationHintKo: '3F 복도',
      promptKo: '세리자와 미오가 아케미를 찾다 3F 복도에서 본대와 떨어져 고립되었다!',
      choices: [
        { id: 'reunite', labelKo: '미오를 확보해 안전한 합류 지점으로 데려온다', outcome: 'rescue' },
        { id: 'leave_behind', labelKo: '나중에 찾기로 하고 지나친다', outcome: 'fail' },
      ],
    },
    inc_soga_reckless: {
      titleKo: '소가 무네미츠 방송실 구속 위기',
      locationHintKo: '3F 방송실',
      promptKo: '단독으로 앞서간 소가가 3F 방송실 내부에 갇혀 밧줄에 묶여 있다!',
      choices: [
        { id: 'untie_soga', labelKo: '구속을 풀고 소가를 구출한다', outcome: 'rescue' },
        { id: 'abandon_soga', labelKo: '방해만 되니 그대로 두고 나온다', outcome: 'fail' },
      ],
    },
    inc_kotomi_trust: {
      titleKo: '코토미 시청각실 신뢰·보호 분기',
      locationHintKo: '4F 시청각실',
      promptKo: '4F 시청각실에 홀로 남은 코토미가 불안해하고 있다. 3F 도서실의 붉은 리본 방울을 건네 안심시켜야 한다.',
      requiresItemForRescue: 'item_red_ribbon_bell',
      choices: [
        { id: 'give_bell', labelKo: '붉은 리본 방울을 건네고 동행을 유지한다', outcome: 'rescue' },
        { id: 'leave_kotomi', labelKo: '빈손으로 두고 자리를 뜬다', outcome: 'fail' },
      ],
    },
    inc_miyuki_clock_tower: {
      titleKo: '시계탑 미유키 대치 위기',
      locationHintKo: '6F 시계탑',
      promptKo: '시계탑에서 유작의 함정이 작동하려 한다! 미유키의 안전을 확보하고 사다리에 붉은 수성 도료를 칠해 흔적 함정을 파훼하라!',
      requiresFlagForRescue: 'flg_clock_tower_paint_applied',
      choices: [
        { id: 'protect_miyuki', labelKo: '미유키를 보호하고 붉은 도료 함정 파훼를 완료한다', outcome: 'rescue' },
        { id: 'abandon', labelKo: '시계탑에서 철수한다', outcome: 'fail' },
      ],
    },
    inc_jinpachi_betrayal: {
      titleKo: '진파치 배신·방송실 창고 대치',
      locationHintKo: '3F 방송실 창고(준비실)',
      promptKo: '진파치가 유작의 협박에 흔들리며 방송실 창고에서 대치 상황이 벌어졌다! 바 록으로 격리·제압 절차를 완료해야 한다!',
      requiresItemForRescue: 'item_bar_lock',
      choices: [
        { id: 'contain_with_barlock', labelKo: '바 록으로 출입구를 통제하고 진파치를 설득·격리한다', outcome: 'rescue' },
        { id: 'trust_blindly', labelKo: '무방비로 방치하고 등을 돌린다', outcome: 'fail' },
      ],
    },
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  function getThreatBand(level) {
    if (level >= 85) return 'critical';
    if (level >= 60) return 'high';
    if (level >= 30) return 'elevated';
    return 'low';
  }

  function resolveDefaultData(passedData) {
    if (passedData) return passedData;
    if (typeof globalThis !== 'undefined' && globalThis.ISAKU_DATA) {
      return globalThis.ISAKU_DATA;
    }
    if (typeof require === 'function') {
      try {
        return require('./data/game-data.js');
      } catch (_) {
        // ignore
      }
    }
    throw new Error('IsakuEngine requires ISAKU_DATA to be loaded or passed to createEngine(data).');
  }

  function createEngine(passedData) {
    const data = resolveDefaultData(passedData);

    const roomMap = new Map(data.rooms.map((r) => [r.id, r]));
    const itemMap = new Map(data.items.map((i) => [i.id, i]));
    const puzzleMap = new Map(data.puzzles.map((p) => [p.id, p]));
    const charMap = new Map(data.characters.map((c) => [c.id, c]));
    const incidentMap = new Map(data.incidents.map((inc) => [inc.id, inc]));
    const endingMap = new Map(data.endings.map((e) => [e.id, e]));
    const dialogueBranches = Array.isArray(data.dialogueBranches) ? data.dialogueBranches : [];
    const dialogueBranchMap = new Map(dialogueBranches.map((b) => [b.id, b]));
    const cipherData = data.cipherData || null;
    const hotspotToRoom = new Map();
    const hotspotMap = new Map();
    for (const r of data.rooms) {
      for (const h of r.hotspots) {
        hotspotToRoom.set(h.id, r.id);
        hotspotMap.set(h.id, h);
      }
    }

    let state = buildInitialState();

    function buildInitialState() {
      const startRoom = roomMap.get(data.startRoomId);
      const startingInventory = data.items
        .filter((i) => i.acquireMethod === 'starting_inventory')
        .map((i) => i.id);

      const characterStates = {};
      const characterLocations = {};
      for (const c of data.characters) {
        characterStates[c.id] = c.initialStatus;
        characterLocations[c.id] = c.initialRoomId;
      }

      return {
        schemaVersion: 2,
        currentRoomId: data.startRoomId,
        currentFloor: startRoom ? startRoom.floor : 5,
        actionTicks: 0,
        currentPhase: 'phase_1_5f_to_4f',
        visitedRooms: [data.startRoomId],
        inventory: startingInventory,
        consumedItems: [],
        inspectedClues: [],
        examinedHotspots: [],
        solvedPuzzles: [],
        unlockedExits: [],
        flags: {},
        partialPuzzleProgress: {},
        characterStates,
        characterLocations,
        miyukiAffection: 0,
        kotomiAffection: 0,
        dialogueSeen: {},
        affectionEventsCompleted: [],
        dialogueChoiceHistory: [],
        threatLevel: 12,
        threatBand: 'low',
        threatEvents: [],
        evidenceTapeDetected: false,
        evidenceTapeEvents: [],
        collectedMemoCoords: [],
        decodedCipherCoords: [],
        decodedCipherClues: [],
        activeIncidents: [],
        resolvedIncidents: [],
        endingId: null,
        pendingPrompt: null,
        logs: [
          {
            tick: 0,
            type: 'narration',
            text: '여름방학 밤, 정체불명의 호출 편지를 받고 모인 9명이 오우란 학원 구교사 5F 음악실에 갇혔다. 창문은 판자로 봉쇄되어 있다. 단서와 열쇠를 찾아 아래층으로 내려가 전원 생환하라.',
          },
        ],
      };
    }

    function normalizeState(s) {
      if (typeof s.threatLevel !== 'number') s.threatLevel = 12;
      s.threatLevel = clamp(Math.round(s.threatLevel), 0, 100);
      s.threatBand = getThreatBand(s.threatLevel);
      if (!Array.isArray(s.threatEvents)) s.threatEvents = [];
      if (typeof s.evidenceTapeDetected !== 'boolean') {
        s.evidenceTapeDetected = Boolean(s.flags && s.flags.flg_evidence_tape_spawned);
      }
      if (!Array.isArray(s.evidenceTapeEvents)) s.evidenceTapeEvents = [];
      if (!Array.isArray(s.affectionEventsCompleted)) s.affectionEventsCompleted = [];
      if (!Array.isArray(s.dialogueChoiceHistory)) s.dialogueChoiceHistory = [];
      if (!Array.isArray(s.collectedMemoCoords)) s.collectedMemoCoords = [];
      if (!Array.isArray(s.decodedCipherCoords)) s.decodedCipherCoords = [];
      if (!Array.isArray(s.decodedCipherClues)) s.decodedCipherClues = [];
      return s;
    }

    function addLog(type, text) {
      state.logs.push({
        tick: state.actionTicks,
        type,
        text,
      });
      if (state.logs.length > 180) {
        state.logs = state.logs.slice(-180);
      }
    }

    function adjustThreat(delta, reason) {
      if (!delta || state.endingId) return state.threatLevel;
      const prev = state.threatLevel;
      state.threatLevel = clamp(Math.round(state.threatLevel + delta), 0, 100);
      const prevBand = state.threatBand;
      state.threatBand = getThreatBand(state.threatLevel);
      if (reason) {
        state.threatEvents.push({
          tick: state.actionTicks,
          delta: state.threatLevel - prev,
          level: state.threatLevel,
          reason,
        });
        if (state.threatEvents.length > 24) {
          state.threatEvents = state.threatEvents.slice(-24);
        }
      }
      if (prevBand !== state.threatBand && (state.threatBand === 'high' || state.threatBand === 'critical')) {
        const bandLabel = THREAT_BAND_META[state.threatBand].labelKo;
        addLog(
          'warning',
          `👁️ 감시 긴장도 상승 (${state.threatLevel}/100 · ${bandLabel}): 구교사 어둠 속 시선이 가까워지고 있다!`
        );
      }
      return state.threatLevel;
    }

    function recordMemoCoord(coordCode) {
      if (!coordCode) return;
      if (!state.collectedMemoCoords.includes(coordCode)) {
        state.collectedMemoCoords.push(coordCode);
      }
    }

    function syncMemoCoordsFromSource(sourceType, sourceId) {
      if (!cipherData || !Array.isArray(cipherData.memoSources)) return;
      for (const ms of cipherData.memoSources) {
        if (ms.sourceType === sourceType && ms.sourceId === sourceId) {
          recordMemoCoord(ms.coordCode);
        }
      }
      // Acquiring the cipher table also notes baseline coordinate 33 (Library) from the table footnote
      if (sourceType === 'item' && sourceId === 'item_cipher_table') {
        recordMemoCoord('33');
      }
    }

    function hasItem(itemId) {
      return state.inventory.includes(itemId);
    }

    function hasFlag(flagName) {
      return Boolean(state.flags[flagName]);
    }

    function isPuzzleSolved(puzzleId) {
      return state.solvedPuzzles.includes(puzzleId);
    }

    function isExitUnlocked(fromRoomId, toRoomId) {
      const fromRoom = roomMap.get(fromRoomId);
      if (!fromRoom) return false;
      const ex = fromRoom.exits.find((e) => e.to === toRoomId);
      if (!ex) return false;
      if (!ex.locked) return true;
      return state.unlockedExits.includes(`${fromRoomId}->${toRoomId}`);
    }

    function isIncidentResolved(incidentId) {
      return state.resolvedIncidents.some((r) => r.id === incidentId);
    }

    function getActiveIncident(incidentId) {
      return state.activeIncidents.find((a) => a.id === incidentId) || null;
    }

    function getCompromisedCount() {
      let count = 0;
      for (const c of data.characters) {
        if (c.canBeCompromised && state.characterStates[c.id] === 'compromised') {
          count += 1;
        }
      }
      return count;
    }

    function updatePhaseFromFlags() {
      if (hasFlag('flg_1f_unlocked') || hasFlag('flg_clock_tower_accessible')) {
        state.currentPhase = 'phase_5_climax';
      } else if (hasFlag('flg_2f_unlocked')) {
        state.currentPhase = 'phase_4_2f_exploration';
      } else if (hasFlag('flg_3f_unlocked')) {
        state.currentPhase = 'phase_3_3f_exploration';
      } else if (hasFlag('flg_4f_unlocked')) {
        state.currentPhase = 'phase_2_4f_exploration';
      } else {
        state.currentPhase = 'phase_1_5f_to_4f';
      }
    }

    function syncCharacterLocations() {
      state.characterLocations.char_kenta = state.currentRoomId;

      const alive = (id) =>
        state.characterStates[id] !== 'compromised' &&
        state.characterStates[id] !== 'deceased_backstory';

      for (const c of data.characters) {
        if (state.characterStates[c.id] === 'compromised') {
          state.characterLocations[c.id] = null;
        }
      }

      const phase = state.currentPhase;
      if (phase === 'phase_1_5f_to_4f') {
        for (const id of ['char_kotomi', 'char_miyuki', 'char_kumi', 'char_rika', 'char_akemi', 'char_mio', 'char_jinpachi', 'char_soga']) {
          if (alive(id)) state.characterLocations[id] = 'rm_5f_music';
        }
        if (alive('char_kumi') && (getActiveIncident('inc_kumi_restroom') || state.currentRoomId === 'rm_5f_restroom_f')) {
          state.characterLocations.char_kumi = 'rm_5f_restroom_f';
        }
        state.characterLocations.char_isaku = 'rm_clock_tower';
      } else if (phase === 'phase_2_4f_exploration') {
        if (alive('char_rika')) state.characterLocations.char_rika = 'rm_4f_hall';
        if (alive('char_akemi')) {
          state.characterLocations.char_akemi = getActiveIncident('inc_akemi_panel')
            ? 'rm_4f_electrical'
            : 'rm_4f_class_2_3';
        }
        if (alive('char_kotomi')) state.characterLocations.char_kotomi = 'rm_4f_av';
        if (alive('char_mio')) state.characterLocations.char_mio = 'rm_4f_class_2_3';
        if (alive('char_kumi')) state.characterLocations.char_kumi = 'rm_4f_class_2_3';
        if (alive('char_miyuki')) state.characterLocations.char_miyuki = 'rm_4f_hall';
        if (alive('char_jinpachi')) state.characterLocations.char_jinpachi = 'rm_4f_class_2_3';
        if (alive('char_soga')) state.characterLocations.char_soga = 'rm_4f_av';
        state.characterLocations.char_isaku = 'rm_clock_tower';
      } else if (phase === 'phase_3_3f_exploration') {
        if (alive('char_mio')) state.characterLocations.char_mio = 'rm_3f_hall';
        if (alive('char_soga')) state.characterLocations.char_soga = 'rm_3f_broadcast';
        if (alive('char_miyuki')) state.characterLocations.char_miyuki = 'rm_3f_library';
        if (alive('char_jinpachi')) state.characterLocations.char_jinpachi = 'rm_3f_library';
        if (alive('char_kotomi')) state.characterLocations.char_kotomi = 'rm_4f_av';
        if (alive('char_kumi')) state.characterLocations.char_kumi = 'rm_4f_class_2_3';
        if (alive('char_rika')) state.characterLocations.char_rika = 'rm_4f_class_2_3';
        if (alive('char_akemi')) state.characterLocations.char_akemi = 'rm_4f_class_2_3';
        state.characterLocations.char_isaku = 'rm_clock_tower';
      } else if (phase === 'phase_4_2f_exploration') {
        if (alive('char_miyuki')) {
          state.characterLocations.char_miyuki = hasFlag('flg_miyuki_companion')
            ? state.currentRoomId
            : 'rm_2f_class_1_1';
        }
        if (alive('char_kotomi')) state.characterLocations.char_kotomi = 'rm_2f_class_1_1';
        if (alive('char_kumi')) state.characterLocations.char_kumi = 'rm_2f_class_1_1';
        if (alive('char_rika')) state.characterLocations.char_rika = 'rm_2f_class_1_2';
        if (alive('char_akemi')) state.characterLocations.char_akemi = 'rm_2f_class_1_2';
        if (alive('char_mio')) state.characterLocations.char_mio = 'rm_2f_class_1_2';
        if (alive('char_jinpachi')) state.characterLocations.char_jinpachi = 'rm_2f_class_1_1';
        if (alive('char_soga')) state.characterLocations.char_soga = 'rm_2f_class_1_2';
        state.characterLocations.char_isaku = 'rm_clock_tower';
      } else {
        for (const id of ['char_kotomi', 'char_kumi', 'char_rika', 'char_akemi', 'char_mio', 'char_soga']) {
          if (alive(id)) state.characterLocations[id] = 'rm_1f_hall';
        }
        if (alive('char_miyuki')) {
          state.characterLocations.char_miyuki = hasFlag('flg_miyuki_protected')
            ? 'rm_1f_hall'
            : 'rm_clock_tower';
        }
        if (alive('char_jinpachi')) {
          state.characterLocations.char_jinpachi = hasFlag('flg_jinpachi_aligned')
            ? 'rm_1f_hall'
            : 'rm_3f_broadcast_prep';
        }
        state.characterLocations.char_isaku = hasFlag('flg_climax_isaku_down')
          ? 'rm_1f_hall'
          : 'rm_clock_tower';
      }
    }

    function startIncident(incidentId) {
      if (state.endingId) return null;
      if (isIncidentResolved(incidentId) || getActiveIncident(incidentId)) return null;
      const def = incidentMap.get(incidentId);
      if (!def) return null;
      if (state.characterStates[def.targetCharacterId] === 'compromised') return null;

      let effectiveWindow = def.windowTicks;
      if (incidentId === 'inc_rika_isolation' && hasFlag('flg_inc_kumi_compromised')) {
        effectiveWindow = Math.max(1, def.windowTicks - 3);
      }

      const active = {
        id: def.id,
        targetCharacterId: def.targetCharacterId,
        triggerRoomId: def.triggerRoomId,
        startedAtTick: state.actionTicks,
        deadlineTick: state.actionTicks + effectiveWindow,
        remainingTicks: effectiveWindow,
        effectiveWindow,
      };
      state.activeIncidents.push(active);
      state.characterStates[def.targetCharacterId] = 'at_risk';

      const charObj = charMap.get(def.targetCharacterId);
      const roomObj = roomMap.get(def.triggerRoomId);
      const cascadeNote =
        incidentId === 'inc_rika_isolation' && hasFlag('flg_inc_kumi_compromised')
          ? ' [쿠미 선생 피해로 연쇄 위험 가속!]'
          : '';
      addLog(
        'danger',
        `⚠️ 위기 경보: ${charObj ? charObj.nameKo : def.targetCharacterId} — ${roomObj ? roomObj.nameKo : def.triggerRoomId} (${effectiveWindow}틱 이내 대응 필요)${cascadeNote}`
      );
      adjustThreat(10, `위기 경보 발생(${charObj ? charObj.nameKo : incidentId})`);
      syncCharacterLocations();
      return active;
    }

    function resolveIncidentSuccess(incidentId, customNote) {
      const def = incidentMap.get(incidentId);
      if (!def) return false;
      if (isIncidentResolved(incidentId)) return false;

      state.activeIncidents = state.activeIncidents.filter((a) => a.id !== incidentId);
      state.resolvedIncidents.push({
        id: incidentId,
        targetCharacterId: def.targetCharacterId,
        outcome: 'rescued',
        tick: state.actionTicks,
      });
      state.characterStates[def.targetCharacterId] = def.successOutcome.characterStatus || 'rescued';
      for (const flg of def.successOutcome.setsFlags || []) {
        state.flags[flg] = true;
      }
      const charObj = charMap.get(def.targetCharacterId);
      addLog(
        'rescue',
        customNote || `✅ 구출 완료: ${charObj ? charObj.nameKo : def.targetCharacterId}의 안전을 확보했다!`
      );
      adjustThreat(-14, `동료 구출(${charObj ? charObj.nameKo : incidentId})`);
      syncCharacterLocations();
      return true;
    }

    function failIncident(incidentId, reasonText) {
      const def = incidentMap.get(incidentId);
      if (!def) return false;
      if (isIncidentResolved(incidentId)) return false;

      state.activeIncidents = state.activeIncidents.filter((a) => a.id !== incidentId);
      state.resolvedIncidents.push({
        id: incidentId,
        targetCharacterId: def.targetCharacterId,
        outcome: 'compromised',
        tick: state.actionTicks,
      });
      state.characterStates[def.targetCharacterId] = def.failureOutcome.characterStatus || 'compromised';
      const setFlags = def.failureOutcome.setsFlags || [];
      for (const flg of setFlags) {
        state.flags[flg] = true;
      }

      const charObj = charMap.get(def.targetCharacterId);
      addLog(
        'danger',
        reasonText ||
          `❌ 사건 발생: ${charObj ? charObj.nameKo : def.targetCharacterId} 보호에 실패했다. (${setFlags.join(', ')})`
      );

      if (setFlags.includes('flg_evidence_tape_spawned')) {
        state.evidenceTapeDetected = true;
        state.evidenceTapeEvents.push({
          incidentId,
          targetCharacterId: def.targetCharacterId,
          spawnRoomId: 'rm_3f_restroom_f',
          tick: state.actionTicks,
        });
        addLog(
          'danger',
          '📼 증거 테이프 감지 경보: 구교사 감시 기록 테이프가 3F 여자 화장실 2번째 칸에 출현한 정황이 포착되었다!'
        );
      }

      adjustThreat(18, `동료 보호 실패(${charObj ? charObj.nameKo : incidentId})`);
      syncCharacterLocations();
      evaluateEnding();
      return true;
    }

    function advanceTicks(cost) {
      if (!cost || cost <= 0 || state.endingId) return;
      state.actionTicks += cost;

      // Surveillance tension climbs steadily with lingering ticks & faster during active crises
      if (!hasFlag('flg_climax_isaku_down')) {
        const activeMult = state.activeIncidents.length;
        const delta = cost * (2 + activeMult * 4);
        adjustThreat(delta, activeMult > 0 ? '위기 중 시간 경과' : '탐색 시간 경과');
      }

      const expired = [];
      for (const inc of state.activeIncidents) {
        inc.remainingTicks = inc.deadlineTick - state.actionTicks;
        if (inc.remainingTicks <= 0) {
          expired.push(inc.id);
        }
      }
      for (const incId of expired) {
        if (state.endingId) break;
        const def = incidentMap.get(incId);
        const charObj = def ? charMap.get(def.targetCharacterId) : null;
        failIncident(
          incId,
          `❌ 제한 시간 초과: ${charObj ? charObj.nameKo : incId} 대응 시한이 지나 사건이 발생했다!`
        );
      }
    }

    function checkIncidentTriggers() {
      if (state.endingId) return;

      if (
        state.currentPhase === 'phase_1_5f_to_4f' &&
        (state.currentRoomId === 'rm_5f_restroom_f' ||
          (hasFlag('flg_5f_safe_opened') && state.currentRoomId === 'rm_5f_hall'))
      ) {
        startIncident('inc_kumi_restroom');
      }

      if (hasFlag('flg_4f_unlocked') && state.currentRoomId === 'rm_4f_hall') {
        startIncident('inc_rika_isolation');
      }

      if (
        hasFlag('flg_4f_unlocked') &&
        !hasFlag('flg_akemi_stabilized') &&
        (state.currentRoomId === 'rm_4f_electrical' || isPuzzleSolved('puz_4f_thinker_statue'))
      ) {
        startIncident('inc_akemi_panel');
      }

      if (hasFlag('flg_3f_unlocked') && state.currentRoomId === 'rm_3f_hall') {
        startIncident('inc_mio_separation');
      }

      if (isPuzzleSolved('puz_3f_broadcast_prep_unlock') || state.currentRoomId === 'rm_3f_broadcast') {
        startIncident('inc_soga_reckless');
      }

      if (hasFlag('flg_3f_library_bell_found') && !hasFlag('flg_kotomi_protected')) {
        startIncident('inc_kotomi_trust');
      }

      if (hasFlag('flg_clock_tower_accessible') && state.currentRoomId === 'rm_clock_tower') {
        startIncident('inc_miyuki_clock_tower');
      }

      if (hasFlag('flg_clock_tower_paint_applied') && state.currentRoomId === 'rm_3f_broadcast_prep') {
        startIncident('inc_jinpachi_betrayal');
      }
    }

    function applyPuzzleSolved(puzzle, customLog) {
      if (isPuzzleSolved(puzzle.id)) return;
      state.solvedPuzzles.push(puzzle.id);

      for (const ci of puzzle.consumesItems) {
        const idx = state.inventory.indexOf(ci);
        if (idx !== -1) {
          state.inventory.splice(idx, 1);
          if (!state.consumedItems.includes(ci)) state.consumedItems.push(ci);
        }
      }
      for (const gi of puzzle.grantsItems) {
        if (!state.inventory.includes(gi)) {
          state.inventory.push(gi);
          syncMemoCoordsFromSource('item', gi);
        }
      }
      for (const sf of puzzle.setsFlags) {
        state.flags[sf] = true;
      }
      for (const ue of puzzle.unlocksExits) {
        const edgeKey = `${ue.from}->${ue.to}`;
        if (!state.unlockedExits.includes(edgeKey)) {
          state.unlockedExits.push(edgeKey);
        }
      }

      delete state.partialPuzzleProgress[puzzle.hotspotId];
      updatePhaseFromFlags();

      const grantedNames = puzzle.grantsItems
        .map((id) => (itemMap.get(id) ? itemMap.get(id).nameKo : id))
        .join(', ');
      const unlockNames = puzzle.unlocksExits
        .map((ue) => (roomMap.get(ue.to) ? roomMap.get(ue.to).nameKo : ue.to))
        .join(', ');

      let summary = customLog || `🔓 퍼즐 해결: ${puzzle.nameKo}`;
      if (grantedNames) summary += ` — 획득: [${grantedNames}]`;
      if (unlockNames) summary += ` — 통로 개방: [${unlockNames}]`;
      addLog('puzzle', summary);

      // Noise / surveillance tension impact by puzzle type
      if (puzzle.id === 'puz_4f_thinker_statue') {
        adjustThreat(10, '4F 공작실 석고상 파쇄 소음');
      } else if (puzzle.id === 'puz_2f_stove_burn') {
        adjustThreat(12, '2F 급식실 장작 난로 연소 연기·소음');
      } else if (puzzle.id === 'puz_3f_barlock_containment') {
        adjustThreat(10, '3F 방송실 창고 바 록 대치 소음');
      } else {
        adjustThreat(-4, `퍼즐 돌파(${puzzle.id})`);
      }

      // Puzzle-linked incident resolutions
      if (puzzle.id === 'puz_clock_tower_paint_trap') {
        if (getActiveIncident('inc_miyuki_clock_tower') || !isIncidentResolved('inc_miyuki_clock_tower')) {
          resolveIncidentSuccess(
            'inc_miyuki_clock_tower',
            '✅ 시계탑 사다리에 붉은 수성 도료를 칠해 함정을 무력화하고 미유키를 보호했다!'
          );
        }
      }
      if (puzzle.id === 'puz_3f_barlock_containment') {
        state.characterStates.char_isaku = 'incapacitated';
        if (getActiveIncident('inc_jinpachi_betrayal') || !isIncidentResolved('inc_jinpachi_betrayal')) {
          resolveIncidentSuccess(
            'inc_jinpachi_betrayal',
            '✅ 바 록으로 방송실 창고 대치를 제압하고 진파치의 배신을 저지했다! 1F 복도에서 유작의 나이프를 확보했다!'
          );
        }
        adjustThreat(-35, '유작 제압 완료');
      }

      advanceTicks(1);
      syncCharacterLocations();
      checkIncidentTriggers();
      evaluateEnding();
    }

    function checkPuzzlePrereqs(puzzle) {
      for (const rp of puzzle.requiresPuzzles) {
        if (!isPuzzleSolved(rp)) {
          const reqObj = puzzleMap.get(rp);
          return {
            ok: false,
            reason: 'missing_prerequisite_puzzle',
            message: `선행 퍼즐 [${reqObj ? reqObj.nameKo : rp}]을(를) 먼저 해결해야 한다.`,
          };
        }
      }
      for (const rf of puzzle.requiresFlags) {
        if (!hasFlag(rf)) {
          return {
            ok: false,
            reason: 'missing_prerequisite_flag',
            message: `아직 작동시킬 수 없다. 필요한 선행 조건(${rf})이 충족되지 않았다.`,
          };
        }
      }
      return { ok: true };
    }

    function moveTo(roomId) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      const currentRoom = roomMap.get(state.currentRoomId);
      const targetRoom = roomMap.get(roomId);
      if (!currentRoom || !targetRoom) {
        return { ok: false, reason: 'invalid_room', message: '존재하지 않는 방입니다.' };
      }
      if (roomId === state.currentRoomId) {
        return { ok: false, reason: 'already_here', message: '이미 이 방에 있습니다.' };
      }
      const exit = currentRoom.exits.find((e) => e.to === roomId);
      if (!exit) {
        return {
          ok: false,
          reason: 'not_adjacent',
          message: `${currentRoom.nameKo}에서 ${targetRoom.nameKo}(으)로 바로 이동할 수 없습니다.`,
        };
      }
      if (!isExitUnlocked(state.currentRoomId, roomId)) {
        const puz = exit.unlockPuzzleId ? puzzleMap.get(exit.unlockPuzzleId) : null;
        const msg = puz
          ? `🔒 잠겨 있다: ${targetRoom.nameKo} — [${puz.nameKo}] 해결이 필요하다.`
          : `🔒 잠겨 있다: ${targetRoom.nameKo} 방향으로 이동할 수 없다.`;
        addLog('warning', msg);
        return { ok: false, reason: 'exit_locked', unlockPuzzleId: exit.unlockPuzzleId, message: msg };
      }

      state.currentRoomId = roomId;
      state.currentFloor = targetRoom.floor;
      state.pendingPrompt = null;
      if (!state.visitedRooms.includes(roomId)) {
        state.visitedRooms.push(roomId);
      }

      addLog('move', `🚪 이동: ${targetRoom.nameKo} (${targetRoom.floor}F)`);
      if (roomId === data.goalRoomId) {
        state.threatLevel = 0;
        state.threatBand = 'low';
      } else {
        advanceTicks(1);
      }
      syncCharacterLocations();
      checkIncidentTriggers();
      const ending = evaluateEnding();

      return {
        ok: true,
        room: targetRoom,
        ending,
        state: getState(),
      };
    }

    function inspectHotspot(hotspotId) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      const roomId = hotspotToRoom.get(hotspotId);
      if (!roomId || roomId !== state.currentRoomId) {
        return {
          ok: false,
          reason: 'hotspot_not_in_room',
          message: '현재 방에 해당 조사 지점이 없습니다.',
        };
      }
      const hs = hotspotMap.get(hotspotId);
      const firstExam = !state.examinedHotspots.includes(hotspotId);
      if (firstExam) {
        state.examinedHotspots.push(hotspotId);
      }

      // 0. Auxiliary Classroom Cipher & Clue Hotspots (GAP-02 / GAP-03)
      if (cipherData && Array.isArray(cipherData.memoSources)) {
        const memoSrc = cipherData.memoSources.find(
          (ms) => ms.sourceType === 'hotspot' && ms.sourceId === hotspotId
        );
        if (memoSrc) {
          recordMemoCoord(memoSrc.coordCode);
          if (!state.inspectedClues.includes(hotspotId)) {
            state.inspectedClues.push(hotspotId);
          }
          addLog('clue', memoSrc.clueTextKo);
          if (hotspotId === 'hs_3f_2_2_traces' && firstExam) {
            state.flags.flg_isaku_patrol_detected = true;
            adjustThreat(10, '3F 2-2 교실 유작 정찰 흔적 감지');
          }
          if (hotspotId === 'hs_2f_1_3_locker') {
            state.flags.flg_checked_emergency_map = true;
          }
          return {
            ok: true,
            action: 'inspect_cipher_clue',
            coordCode: memoSrc.coordCode,
            message: memoSrc.clueTextKo,
          };
        }
      }

      // 1. Keypad puzzle prompt (5F Safe 3878)
      const matchingPuzzle = data.puzzles.find((p) => p.hotspotId === hotspotId);
      if (matchingPuzzle && matchingPuzzle.puzzleType === 'keypad_code') {
        if (isPuzzleSolved(matchingPuzzle.id)) {
          const msg = '금고 문은 이미 열려 있다. (뒷면 패널은 드라이버로 분해할 수 있어 보인다.)';
          addLog('inspect', msg);
          return { ok: true, action: 'already_solved', message: msg };
        }
        state.pendingPrompt = {
          type: 'keypad',
          puzzleId: matchingPuzzle.id,
          hotspotId,
          titleKo: matchingPuzzle.nameKo,
        };
        const msg = '4자리 다이얼 비밀번호 금고다. 정확한 번호를 입력해야 열릴 것 같다.';
        addLog('inspect', msg);
        return { ok: true, action: 'open_keypad', puzzleId: matchingPuzzle.id, message: msg };
      }

      // 2. Environmental move puzzle (3F Library Shelf -> Red Ribbon Bell)
      if (matchingPuzzle && matchingPuzzle.puzzleType === 'environmental_move') {
        if (isPuzzleSolved(matchingPuzzle.id)) {
          const msg = '이미 서가를 밀어 붉은 리본 방울을 회수했다.';
          addLog('inspect', msg);
          return { ok: true, action: 'already_solved', message: msg };
        }
        const prereq = checkPuzzlePrereqs(matchingPuzzle);
        if (!prereq.ok) {
          addLog('warning', prereq.message);
          return prereq;
        }
        applyPuzzleSolved(
          matchingPuzzle,
          '📚 도서실 서가를 옆으로 밀자 숨겨져 있던 [붉은 리본 방울]이 떨어졌다!'
        );
        return {
          ok: true,
          action: 'puzzle_solved',
          puzzleId: matchingPuzzle.id,
          grantedItems: matchingPuzzle.grantsItems,
          message: '서가를 움직여 붉은 리본 방울을 회수했다.',
        };
      }

      // 3. Pickups mapped to this hotspot
      const pickupIds = HOTSPOT_PICKUPS[hotspotId];
      if (pickupIds && pickupIds.length > 0) {
        if (hotspotId === 'hs_5f_science_floor' && !hasFlag('flg_4f_unlocked')) {
          const msg = '지금은 실험대 주변에 눈에 띄는 것이 없다. 4층을 개방한 뒤 다시 살펴보자.';
          addLog('inspect', msg);
          return { ok: true, action: 'inspect_empty', message: msg };
        }
        if (hotspotId === 'hs_3f_stall_2' && !hasFlag('flg_evidence_tape_spawned')) {
          const msg = '3F 여자 화장실 2번째 칸은 비어 있다. 아직 불길한 흔적은 없다.';
          addLog('inspect', msg);
          return { ok: true, action: 'inspect_empty', message: msg };
        }
        if (hotspotId === 'hs_1f_hall_isaku_body' && !hasFlag('flg_climax_isaku_down')) {
          const msg = '1F 복도는 고요하지만 긴장감이 감돈다. 시계탑과 3F 방송실 창고의 대치를 먼저 해결해야 한다.';
          addLog('inspect', msg);
          return { ok: true, action: 'inspect_empty', message: msg };
        }

        const collected = [];
        for (const itemId of pickupIds) {
          if (!hasItem(itemId) && !state.consumedItems.includes(itemId)) {
            state.inventory.push(itemId);
            collected.push(itemId);
            syncMemoCoordsFromSource('item', itemId);
          }
        }
        if (collected.length > 0) {
          const names = collected.map((id) => itemMap.get(id).nameKo).join(', ');
          const msg = `🎒 아이템 획득: [${names}]`;
          addLog('item', msg);
          for (const id of collected) {
            if (CLUE_READINGS[id]) {
              if (!state.inspectedClues.includes(id)) state.inspectedClues.push(id);
              addLog('clue', CLUE_READINGS[id]);
            }
          }
          advanceTicks(1);
          checkIncidentTriggers();
          evaluateEnding();
          return { ok: true, action: 'pickup', collectedItems: collected, message: msg };
        }
        const msg = `${hs.labelKo}: 이미 필요한 물건을 모두 챙겼다.`;
        addLog('inspect', msg);
        return { ok: true, action: 'already_collected', message: msg };
      }

      // 4. Incident rescue/guard hotspots
      if (hotspotId === 'hs_5f_restroom_f_entry') {
        if (getActiveIncident('inc_kumi_restroom')) {
          return interveneIncident('inc_kumi_restroom', 'escort');
        }
        if (!isIncidentResolved('inc_kumi_restroom')) {
          startIncident('inc_kumi_restroom');
          return interveneIncident('inc_kumi_restroom', 'escort');
        }
        const msg = '쿠미 선생은 무사히 합류했다.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_4f_electrical_panel') {
        if (getActiveIncident('inc_akemi_panel')) {
          return interveneIncident('inc_akemi_panel', 'restrain');
        }
        const msg = hasFlag('flg_akemi_stabilized')
          ? '노출된 배전반 주변에서 희미한 기름 냄새가 난다. 아케미를 제지해 화재를 막았다.'
          : '노출된 배전반이다. 바닥에 기름기가 번져 있어 스파크가 튀면 매우 위험하다.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_3f_broadcast_soga') {
        if (getActiveIncident('inc_soga_reckless')) {
          return interveneIncident('inc_soga_reckless', 'untie_soga');
        }
        const msg = hasFlag('flg_soga_rescued')
          ? '소가는 구속에서 풀려나 투덜거리며 합류했다.'
          : '방송실 의자 옆에 끊어진 밧줄이 남아 있다.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_clock_tower_miyuki') {
        if (getActiveIncident('inc_miyuki_clock_tower')) {
          if (hasFlag('flg_clock_tower_paint_applied')) {
            return interveneIncident('inc_miyuki_clock_tower', 'protect_miyuki');
          }
          const msg =
            '미유키가 시계탑 상층부에서 유작의 동선을 파악하고 있다! 먼저 사다리에 [붉은 수성 도료]를 사용해 함정을 파훼하자.';
          addLog('dialogue', msg);
          return { ok: true, action: 'talk_hint', message: msg };
        }
        return talkToCharacter('char_miyuki', 0);
      }

      // 5. Special inspection hotspots
      if (hotspotId === 'hs_1f_sealed_gate') {
        state.flags.flg_checked_fake_entrance = true;
        const msg =
          '⚠️ 1F 현관문에는 애초에 열쇠 구멍 자체가 용접·봉쇄되어 있다! 정문 열쇠는 존재하지 않는다 — 시계탑과 1F 보건실을 조사해야 한다!';
        addLog('clue', msg);
        return { ok: true, action: 'inspect_clue', message: msg };
      }

      if (hotspotId === 'hs_4f_av_vcr') {
        if (hasItem('item_evidence_tape')) {
          state.flags.flg_evidence_tape_played = true;
          adjustThreat(8, '증거 비디오테이프 재생');
          const msg =
            '📼 비디오 재생기에 증거 테이프를 넣었다. 구교사 감시 기록에 동료가 고립된 정황이 찍혀 있다… 해피 엔딩은 이미 멀어진 것 같다.';
          addLog('danger', msg);
          return { ok: true, action: 'play_tape', message: msg };
        }
        const msg = state.evidenceTapeDetected
          ? '비디오 재생기 전원이 대기 중이다. 3F 여자 화장실 2번째 칸에 증거 테이프가 남아 있는 듯하다.'
          : '비디오 재생기는 전원이 꺼져 있다. 지금은 재생할 테이프가 없다.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_5f_music_windows') {
        const msg = '5층 음악실 창문은 두꺼운 나무 판자와 못으로 단단히 봉쇄되어 있다. 밖은 칠흑 같은 어둠뿐이다.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_5f_music_door') {
        const msg = '음악실 문은 복도 쪽으로 열려 있다. 5F 복도로 나가 단서를 모으자.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_5f_music_group') {
        const msg =
          '일행과 호출 편지를 대조했다. 모두 동일한 필체로 5층 음악실에 불려 왔다. 아래층 계단부터 확인해야 한다.';
        addLog('dialogue', msg);
        return { ok: true, action: 'talk', message: msg };
      }

      if (hotspotId === 'hs_5f_clock_access') {
        const msg = hasFlag('flg_clock_tower_accessible')
          ? '상층 시계탑으로 올라가는 사다리 해치가 열려 있다! 지금 올라갈 수 있다.'
          : '시계탑 연결 사다리는 굳게 잠겨 있다. 아래층(2F->1F)까지 탐색을 진행하면 열릴 것이다.';
        addLog('inspect', msg);
        return { ok: true, action: 'inspect', message: msg };
      }

      if (hotspotId === 'hs_escape_eval') {
        const ending = evaluateEnding();
        return { ok: true, action: 'ending', ending, message: ending ? ending.summaryKo : '탈출 지점이다.' };
      }

      // 6. Generic puzzle-hint inspect
      if (matchingPuzzle) {
        if (isPuzzleSolved(matchingPuzzle.id)) {
          const msg = `${hs.labelKo}: 이미 해결되었다.`;
          addLog('inspect', msg);
          return { ok: true, action: 'already_solved', message: msg };
        }
        const reqNames = matchingPuzzle.requiresItems
          .map((id) => (itemMap.get(id) ? itemMap.get(id).nameKo : id))
          .join(' + ');
        const msg = `🔍 ${hs.labelKo} — 필요한 도구/재료: [${reqNames || '조사'}]`;
        addLog('inspect', msg);
        return { ok: true, action: 'inspect_puzzle', puzzleId: matchingPuzzle.id, message: msg };
      }

      const fallbackMsg = `🔍 ${hs.labelKo}을(를) 자세히 살펴보았다.`;
      addLog('inspect', fallbackMsg);
      return { ok: true, action: 'inspect', message: fallbackMsg };
    }

    function submitPuzzleCode(puzzleId, code) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      const puzzle = puzzleMap.get(puzzleId);
      if (!puzzle || puzzle.puzzleType !== 'keypad_code') {
        return { ok: false, reason: 'invalid_puzzle', message: '비밀번호 입력 대상 퍼즐이 아닙니다.' };
      }
      if (state.currentRoomId !== puzzle.roomId) {
        return { ok: false, reason: 'wrong_room', message: '해당 금고가 있는 방으로 이동해야 합니다.' };
      }
      if (isPuzzleSolved(puzzle.id)) {
        return { ok: true, alreadySolved: true, message: '이미 해제된 금고입니다.' };
      }
      const prereq = checkPuzzlePrereqs(puzzle);
      if (!prereq.ok) return prereq;

      const normalized = String(code ?? '').trim();
      if (normalized === String(puzzle.codeSolution)) {
        state.pendingPrompt = null;
        applyPuzzleSolved(
          puzzle,
          `🔐 금고 비밀번호 [${normalized}] 일치! 묵직한 철제 문이 열리며 [녹슨 철제 열쇠]가 나왔다!`
        );
        return {
          ok: true,
          solved: true,
          puzzleId: puzzle.id,
          grantedItems: puzzle.grantsItems,
          message: '금고 해제 성공! 녹슨 철제 열쇠를 획득했다.',
        };
      }

      const msg = `❌ 비밀번호 [${normalized || '공백'}] 불일치. (힌트: 3-2 교실 메모와 과학실 골격 메모 단서를 확인하자.)`;
      addLog('warning', msg);
      return { ok: false, solved: false, reason: 'wrong_code', message: msg };
    }

    function decodeCipher(coordA, coordB) {
      if (!cipherData) {
        return { ok: false, reason: 'cipher_unavailable', message: '난수표 데이터가 없습니다.' };
      }
      if (!hasItem(cipherData.requiredItemId)) {
        const msg = '먼저 3F 방송실 우측 벽면에서 [난수표]를 획득해야 해독기를 사용할 수 있다.';
        addLog('warning', msg);
        return { ok: false, reason: 'missing_cipher_table', message: msg };
      }

      const normA = String(coordA ?? '').replace(/[^0-9]/g, '');
      const normB = String(coordB ?? '').replace(/[^0-9]/g, '');

      const lookupCell = (r, c) => {
        if (r < 1 || r > 6 || c < 1 || c > 6) return null;
        return cipherData.grid[r - 1]?.[c - 1] ?? null;
      };

      const checkAutoDeductions = () => {
        const unlocked = [];
        for (const ded of cipherData.deductions) {
          if (state.decodedCipherClues.includes(ded.id)) continue;
          const allReady = ded.coordPair.every((cc) => state.decodedCipherCoords.includes(cc));
          if (allReady) {
            state.decodedCipherClues.push(ded.id);
            if (ded.setsFlag) state.flags[ded.setsFlag] = true;
            adjustThreat(-3, `난수표 해독(${ded.id})`);
            addLog('clue', `🔐 난수표 추리 완성 — ${ded.titleKo}: ${ded.summaryKo}`);
            unlocked.push(ded);
          }
        }
        return unlocked;
      };

      // Mode 1: Single-cell lookup (row 1..6, col 1..6)
      if (/^[1-6]$/.test(normA) && /^[1-6]$/.test(normB)) {
        const row = Number(normA);
        const col = Number(normB);
        const coord = `${row}${col}`;
        const token = lookupCell(row, col);
        if (!state.decodedCipherCoords.includes(coord)) {
          state.decodedCipherCoords.push(coord);
        }
        const newlyUnlocked = checkAutoDeductions();
        addLog('clue', `🔢 난수표 좌표 (${row},${col}) 해독 결과: [${token}]`);
        return {
          ok: true,
          mode: 'cell',
          row,
          col,
          coord,
          token,
          unlockedDeductions: newlyUnlocked,
          message: `좌표 (${row}, ${col}) → [${token}]`,
        };
      }

      // Mode 2: Two-coordinate cross-index pair (e.g., '32', '54')
      if (/^[1-6][1-6]$/.test(normA) && /^[1-6][1-6]$/.test(normB)) {
        const rA = Number(normA[0]);
        const cA = Number(normA[1]);
        const rB = Number(normB[0]);
        const cB = Number(normB[1]);
        const tokenA = lookupCell(rA, cA);
        const tokenB = lookupCell(rB, cB);

        if (!state.decodedCipherCoords.includes(normA)) state.decodedCipherCoords.push(normA);
        if (!state.decodedCipherCoords.includes(normB)) state.decodedCipherCoords.push(normB);

        const sortedPair = [normA, normB].sort().join('+');
        const matchedDeduction =
          cipherData.deductions.find((d) => [...d.coordPair].sort().join('+') === sortedPair) || null;

        if (matchedDeduction) {
          const isNew = !state.decodedCipherClues.includes(matchedDeduction.id);
          if (isNew) {
            state.decodedCipherClues.push(matchedDeduction.id);
            if (matchedDeduction.setsFlag) state.flags[matchedDeduction.setsFlag] = true;
            adjustThreat(-3, `난수표 해독(${matchedDeduction.id})`);
          }
          addLog('clue', `🔐 난수표 교차 해독 성공 [${normA}×${normB}] → ${matchedDeduction.decodedCode}: ${matchedDeduction.summaryKo}`);
          return {
            ok: true,
            mode: 'pair',
            coordA: normA,
            coordB: normB,
            tokenA,
            tokenB,
            combined: matchedDeduction.decodedCode,
            matched: true,
            newlyUnlocked: isNew,
            deduction: matchedDeduction,
            message: matchedDeduction.summaryKo,
          };
        }

        const autoUnlocked = checkAutoDeductions();
        const combined = `${tokenA}+${tokenB}`;
        const msg = `🔢 난수표 대조 [${normA}=${tokenA}] × [${normB}=${tokenB}] — 일치하는 핵심 암호 조합은 아니다. 수집한 메모 좌표를 다시 확인하자.`;
        addLog('inspect', msg);
        return {
          ok: true,
          mode: 'pair',
          coordA: normA,
          coordB: normB,
          tokenA,
          tokenB,
          combined,
          matched: false,
          unlockedDeductions: autoUnlocked,
          message: msg,
        };
      }

      const msg = '❌ 유효하지 않은 난수표 좌표입니다. 1~6 범위의 행·열(예: 3, 2) 또는 2자리 좌표 쌍(예: 32, 54)을 입력하세요.';
      addLog('warning', msg);
      return { ok: false, reason: 'invalid_coordinates', message: msg };
    }

    function getCipherStatus() {
      if (!cipherData) return null;
      const memoSourcesWithStatus = (cipherData.memoSources || []).map((ms) => {
        const discovered =
          state.collectedMemoCoords.includes(ms.coordCode) ||
          (ms.sourceType === 'item' && (hasItem(ms.sourceId) || state.consumedItems.includes(ms.sourceId))) ||
          (ms.sourceType === 'hotspot' && state.examinedHotspots.includes(ms.sourceId));
        return {
          ...ms,
          discovered,
        };
      });
      return {
        hasCipherTable: hasItem(cipherData.requiredItemId),
        gridSpec: cipherData.gridSpec,
        grid: cipherData.grid,
        collectedMemoCoords: [...state.collectedMemoCoords],
        decodedCipherCoords: [...state.decodedCipherCoords],
        decodedCipherClues: [...state.decodedCipherClues],
        memoSources: memoSourcesWithStatus,
        deductions: cipherData.deductions.map((d) => ({
          ...d,
          unlocked: state.decodedCipherClues.includes(d.id),
        })),
      };
    }

    function combineItems(itemA, itemB) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      if (!itemA || !itemB || itemA === itemB) {
        return { ok: false, combined: false, reason: 'same_or_missing', message: '서로 다른 두 아이템을 선택하세요.' };
      }
      if (!hasItem(itemA) || !hasItem(itemB)) {
        return { ok: false, combined: false, reason: 'item_not_owned', message: '보유하지 않은 아이템입니다.' };
      }

      const pair = [itemA, itemB].sort().join('+');

      if (pair === ['item_machine_oil', 'item_rusted_key'].sort().join('+')) {
        state.flags.flg_rusted_key_oiled = true;
        const msg =
          '🛢️ 조합 성공: [기계유]를 [녹슨 철제 열쇠]에 충분히 도포했다! 이제 5F→4F 계단 잠금 문에서 부러지지 않고 열 수 있다.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_rusted_key_oiled', message: msg };
      }

      if (pair === ['item_machine_oil', 'item_copper_key'].sort().join('+')) {
        state.flags.flg_copper_key_oiled = true;
        const msg =
          '🛢️ 조합 성공: [기계유]를 [구리 열쇠]에 도포했다! 이제 4F→3F 계단 잠금 문을 안전하게 열 수 있다.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_copper_key_oiled', message: msg };
      }

      if (pair === ['item_alcohol_bottle', 'item_brown_book'].sort().join('+')) {
        state.flags.flg_book_soaked_alcohol = true;
        const msg =
          '🔥 조합 성공: [갈색 표지 책]에 [알코올 병]을 적셔 착화 연료를 준비했다! 2F 급식실 장작 난로에 넣고 라이터로 점화하자.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_book_soaked_alcohol', message: msg };
      }

      if (pair === ['item_screwdriver', 'item_wooden_ladder'].sort().join('+')) {
        state.flags.flg_ceiling_kit_ready = true;
        const msg =
          '🪜 조합 성공: [목제 사다리]와 [드라이버]를 고소 작업 세트로 준비했다! 3F 막다른 복도 천장 손잡이에 사용하자.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_ceiling_kit_ready', message: msg };
      }

      if (
        pair === ['item_brown_book', 'item_lighter'].sort().join('+') ||
        pair === ['item_alcohol_bottle', 'item_lighter'].sort().join('+')
      ) {
        if (
          state.currentRoomId === 'rm_2f_kitchen' &&
          hasItem('item_brown_book') &&
          hasItem('item_alcohol_bottle') &&
          hasItem('item_lighter')
        ) {
          return useItemOnHotspot('item_lighter', 'hs_2f_kitchen_stove');
        }
        const msg =
          '⚠️ 난로 밖에서 불을 붙이면 구교사에 불이 번질 수 있다! 2F 급식실 장작 난로에서 연료를 넣고 점화하자.';
        addLog('warning', msg);
        return { ok: false, combined: false, reason: 'wrong_location_for_fire', message: msg };
      }

      const nameA = itemMap.get(itemA)?.nameKo || itemA;
      const nameB = itemMap.get(itemB)?.nameKo || itemB;
      const msg = `[${nameA}]와 [${nameB}]은(는) 서로 조합할 수 없다.`;
      addLog('warning', msg);
      return { ok: false, combined: false, reason: 'incompatible_items', message: msg };
    }

    function useItemOnHotspot(itemId, hotspotId) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      if (!hasItem(itemId)) {
        return { ok: false, reason: 'item_not_owned', message: '보유하지 않은 아이템입니다.' };
      }
      const roomId = hotspotToRoom.get(hotspotId);
      if (!roomId || roomId !== state.currentRoomId) {
        return { ok: false, reason: 'hotspot_not_in_room', message: '현재 방에 해당 대상이 없습니다.' };
      }

      const itemObj = itemMap.get(itemId);

      // Special character key item handoffs & clue interactions
      if (itemId === 'item_invitation_letter' && hotspotId === 'hs_5f_music_group') {
        state.flags.flg_letter_compared = true;
        const msg = '✉️ 호출 편지를 일행과 대조했다. 전원이 동일한 함정에 불려 왔음이 확인되었다.';
        addLog('clue', msg);
        return { ok: true, action: 'clue_confirmed', message: msg };
      }

      if (itemId === 'item_akemi_notebook' && hotspotId === 'hs_4f_2_3_akemi') {
        const idx = state.inventory.indexOf(itemId);
        if (idx !== -1) state.inventory.splice(idx, 1);
        if (!state.consumedItems.includes(itemId)) state.consumedItems.push(itemId);
        state.flags.flg_akemi_notebook_returned = true;
        if (getActiveIncident('inc_akemi_panel') || !isIncidentResolved('inc_akemi_panel')) {
          resolveIncidentSuccess(
            'inc_akemi_panel',
            '✅ 아케미에게 수첩을 반환하고 배전반의 위험을 경고해 심리적 안정을 되찾게 했다!'
          );
        } else {
          addLog('rescue', '✅ 아케미에게 수첩을 반환했다.');
        }
        return { ok: true, action: 'item_delivered', message: '아케미에게 수첩을 반환하고 안정을 확보했다.' };
      }

      if (itemId === 'item_red_ribbon_bell' && hotspotId === 'hs_4f_av_kotomi') {
        const idx = state.inventory.indexOf(itemId);
        if (idx !== -1) state.inventory.splice(idx, 1);
        if (!state.consumedItems.includes(itemId)) state.consumedItems.push(itemId);
        state.kotomiAffection += 2;
        if (getActiveIncident('inc_kotomi_trust') || !isIncidentResolved('inc_kotomi_trust')) {
          resolveIncidentSuccess(
            'inc_kotomi_trust',
            '✅ 코토미에게 [붉은 리본 방울]을 건넸다! 코토미가 안도하며 본대와 동행하기로 했다.'
          );
        } else {
          state.flags.flg_kotomi_protected = true;
          addLog('rescue', '✅ 코토미에게 붉은 리본 방울을 전달했다.');
        }
        return { ok: true, action: 'item_delivered', message: '코토미에게 붉은 리본 방울을 전달했다.' };
      }

      if (itemId === 'item_evidence_tape' && hotspotId === 'hs_4f_av_vcr') {
        return inspectHotspot('hs_4f_av_vcr');
      }

      // Puzzle driven interactions
      const puzzle = data.puzzles.find((p) => p.hotspotId === hotspotId);
      if (!puzzle) {
        const msg = `[${itemObj.nameKo}]을(를) 여기에 사용할 수 없다.`;
        addLog('warning', msg);
        return { ok: false, reason: 'no_matching_puzzle', message: msg };
      }

      if (isPuzzleSolved(puzzle.id)) {
        const msg = `${puzzle.nameKo}: 이미 해결되었다.`;
        addLog('inspect', msg);
        return { ok: true, alreadySolved: true, message: msg };
      }

      // Canonical 4F->3F Rusted Key Break Branch (GAP-05) — checked BEFORE prereqs so attempting reuse on 4F snaps cleanly!
      if (puzzle.keyBreakBranch && itemId === puzzle.keyBreakBranch.attemptedItemId) {
        const kb = puzzle.keyBreakBranch;
        if (kb.consumesAttemptedItem) {
          const idx = state.inventory.indexOf(itemId);
          if (idx !== -1) state.inventory.splice(idx, 1);
          if (!state.consumedItems.includes(itemId)) state.consumedItems.push(itemId);
        }
        for (const sf of kb.setsFlags || []) {
          state.flags[sf] = true;
        }
        adjustThreat(8, '4F→3F 계단 문 녹슨 철제 열쇠 파손 소음');
        const msg =
          '💥 4F→3F 계단 자물쇠에서 [녹슨 철제 열쇠]가 뚝 부러졌다! 부러진 파편을 깔끔히 빼내어 자물쇠 막힘을 방지했다. — 5F 금고 뒷면(드라이버)→여자 화장실 타임 레코더(단1 건전지)→4F 공작실 "생각하는 사람" 석고상(작은 망치)에서 [구리 열쇠]를 찾아 대체하자!';
        addLog('warning', msg);
        advanceTicks(1);
        checkIncidentTriggers();
        evaluateEnding();
        return {
          ok: false,
          reason: 'key_snapped_fallback_needed',
          keySnapped: true,
          softlockPrevented: true,
          fallbackPuzzleId: kb.fallbackPuzzleId,
          fallbackItemId: kb.fallbackItemId,
          message: msg,
        };
      }

      const prereq = checkPuzzlePrereqs(puzzle);
      if (!prereq.ok) {
        addLog('warning', prereq.message);
        return prereq;
      }

      if (!puzzle.requiresItems.includes(itemId)) {
        const msg = `[${itemObj.nameKo}]은(는) 이 장치(${puzzle.nameKo})에 맞지 않는다.`;
        addLog('warning', msg);
        return { ok: false, reason: 'wrong_item', message: msg };
      }

      const staged = state.partialPuzzleProgress[hotspotId] || [];

      // Case A: Ordered lubrication + key (5F->4F, 4F->3F)
      if (puzzle.puzzleType === 'ordered_item_use') {
        const keyItem = puzzle.requiresItems.find((id) => id !== 'item_machine_oil');
        const preOiledFlag =
          keyItem === 'item_rusted_key' ? 'flg_rusted_key_oiled' : 'flg_copper_key_oiled';

        if (itemId === 'item_machine_oil') {
          if (!staged.includes('item_machine_oil')) {
            staged.push('item_machine_oil');
            state.partialPuzzleProgress[hotspotId] = staged;
          }
          const msg = `🛢️ 자물쇠에 [기계유]를 충분히 칠해 녹을 부드럽게 했다. 이제 [${itemMap.get(keyItem).nameKo}]를 사용하자!`;
          addLog('item', msg);
          return { ok: true, action: 'partial_progress', staged: [...staged], message: msg };
        }

        if (itemId === keyItem) {
          const oiled = staged.includes('item_machine_oil') || hasFlag(preOiledFlag);
          if (!oiled) {
            const msg = `⚠️ 자물쇠가 심하게 녹슬어 그대로 돌리면 [${itemObj.nameKo}]가 부러질 것 같다! 먼저 [기계유]를 도포하거나 조합하자. (소프트락 방지: 열쇠 보존)`;
            addLog('warning', msg);
            return {
              ok: false,
              reason: 'needs_lubrication',
              softlockPrevented: true,
              message: msg,
            };
          }
          applyPuzzleSolved(puzzle);
          return {
            ok: true,
            solved: true,
            puzzleId: puzzle.id,
            unlockedExits: puzzle.unlocksExits,
            message: `${puzzle.nameKo} 해결!`,
          };
        }
      }

      // Case B: Multi-tool sequence (3F ceiling latch: wooden ladder + screwdriver)
      if (puzzle.puzzleType === 'multi_tool_sequence') {
        if (itemId === 'item_wooden_ladder') {
          if (!staged.includes('item_wooden_ladder')) {
            staged.push('item_wooden_ladder');
            state.partialPuzzleProgress[hotspotId] = staged;
          }
          if (hasFlag('flg_ceiling_kit_ready') && hasItem('item_screwdriver')) {
            applyPuzzleSolved(
              puzzle,
              '🪜 목제 사다리를 놓고 드라이버로 천장 손잡이를 분해해 [붉은 리본 열쇠]를 회수했다!'
            );
            return { ok: true, solved: true, puzzleId: puzzle.id, grantedItems: puzzle.grantsItems };
          }
          const msg = '🪜 천장 아래에 [목제 사다리]를 단단히 세웠다. 이제 [드라이버]로 천장 손잡이를 분해하자!';
          addLog('item', msg);
          return { ok: true, action: 'partial_progress', staged: [...staged], message: msg };
        }

        if (itemId === 'item_screwdriver') {
          const ladderReady =
            staged.includes('item_wooden_ladder') ||
            (hasFlag('flg_ceiling_kit_ready') && hasItem('item_wooden_ladder'));
          if (!ladderReady) {
            const msg = '⚠️ 천장이 너무 높아 손이 닿지 않는다. 먼저 [목제 사다리]를 설치하자!';
            addLog('warning', msg);
            return { ok: false, reason: 'needs_ladder', message: msg };
          }
          applyPuzzleSolved(
            puzzle,
            '🔧 사다리 위에서 드라이버로 천장 손잡이를 분해하자 [붉은 리본 열쇠]가 떨어졌다!'
          );
          return { ok: true, solved: true, puzzleId: puzzle.id, grantedItems: puzzle.grantsItems };
        }
      }

      // Case C: Multi-item combine on hotspot (2F kitchen stove: brown book + alcohol bottle + lighter)
      if (puzzle.puzzleType === 'multi_item_combine_on_hotspot') {
        if (itemId === 'item_brown_book' || itemId === 'item_alcohol_bottle') {
          if (!staged.includes(itemId)) staged.push(itemId);
          if (hasFlag('flg_book_soaked_alcohol')) {
            if (hasItem('item_brown_book') && !staged.includes('item_brown_book')) {
              staged.push('item_brown_book');
            }
            if (hasItem('item_alcohol_bottle') && !staged.includes('item_alcohol_bottle')) {
              staged.push('item_alcohol_bottle');
            }
          }
          state.partialPuzzleProgress[hotspotId] = staged;
          const hasBook = staged.includes('item_brown_book');
          const hasAlc = staged.includes('item_alcohol_bottle');
          const msg =
            hasBook && hasAlc
              ? '🪵 장작 난로에 [갈색 표지 책]과 [알코올 병]을 모두 투입했다! 이제 [라이터]로 점화하자!'
              : `🪵 장작 난로에 [${itemObj.nameKo}]을(를) 넣었다. 남은 재료: [${hasBook ? '알코올 병' : '갈색 표지 책'}] → [라이터].`;
          addLog('item', msg);
          return { ok: true, action: 'partial_progress', staged: [...staged], message: msg };
        }

        if (itemId === 'item_lighter') {
          const autoFuelReady =
            hasFlag('flg_book_soaked_alcohol') &&
            hasItem('item_brown_book') &&
            hasItem('item_alcohol_bottle');
          const hasBook = staged.includes('item_brown_book') || autoFuelReady;
          const hasAlc = staged.includes('item_alcohol_bottle') || autoFuelReady;
          if (!hasBook || !hasAlc) {
            const missing = [];
            if (!hasBook) missing.push('갈색 표지 책');
            if (!hasAlc) missing.push('알코올 병');
            const msg = `⚠️ 난로에 연료가 부족하다. 먼저 [${missing.join(', ')}]을(를) 난로에 투입하자!`;
            addLog('warning', msg);
            return { ok: false, reason: 'missing_stove_fuel', message: msg };
          }
          applyPuzzleSolved(
            puzzle,
            '🔥 장작 난로에 불을 붙여 갈색 표지 책을 태우자 재 속에서 [은색 열쇠]가 드러났다!'
          );
          return { ok: true, solved: true, puzzleId: puzzle.id, grantedItems: puzzle.grantsItems };
        }
      }

      // Case D: Single item / key / tool puzzles
      const allOwned = puzzle.requiresItems.every((ri) => hasItem(ri));
      if (!allOwned) {
        const missingNames = puzzle.requiresItems
          .filter((ri) => !hasItem(ri))
          .map((ri) => itemMap.get(ri)?.nameKo || ri);
        const msg = `필요한 아이템이 부족하다: [${missingNames.join(', ')}]`;
        addLog('warning', msg);
        return { ok: false, reason: 'missing_required_items', message: msg };
      }

      applyPuzzleSolved(puzzle);
      return {
        ok: true,
        solved: true,
        puzzleId: puzzle.id,
        grantedItems: puzzle.grantsItems,
        unlockedExits: puzzle.unlocksExits,
        message: `${puzzle.nameKo} 해결!`,
      };
    }

    function interveneIncident(incidentId, actionId) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      const def = incidentMap.get(incidentId);
      const uiDef = INCIDENT_DEFINITIONS[incidentId];
      if (!def || !uiDef) {
        return { ok: false, reason: 'invalid_incident', message: '알 수 없는 사건입니다.' };
      }
      if (isIncidentResolved(incidentId)) {
        return { ok: true, alreadyResolved: true, message: '이미 처리된 사건입니다.' };
      }

      if (state.currentRoomId !== def.triggerRoomId) {
        const targetRoom = roomMap.get(def.triggerRoomId);
        const msg = `⚠️ 먼저 [${targetRoom ? targetRoom.nameKo : def.triggerRoomId}]으로 이동해야 대응할 수 있다!`;
        addLog('warning', msg);
        return { ok: false, reason: 'wrong_room_for_incident', message: msg };
      }

      if (!getActiveIncident(incidentId)) {
        startIncident(incidentId);
      }

      const choice = uiDef.choices.find((c) => c.id === actionId);
      if (!choice) {
        return { ok: false, reason: 'invalid_action', message: '유효하지 않은 대응 선택지입니다.' };
      }

      if (choice.outcome === 'fail') {
        failIncident(incidentId, `❌ 오판: ${uiDef.titleKo} 대응에 실패했다!`);
        return {
          ok: true,
          outcome: 'compromised',
          incidentId,
          ending: state.endingId ? endingMap.get(state.endingId) : null,
          message: `${uiDef.titleKo} 실패`,
        };
      }

      if (uiDef.requiresItemForRescue && !hasItem(uiDef.requiresItemForRescue)) {
        const reqItem = itemMap.get(uiDef.requiresItemForRescue);
        const msg = `⚠️ [${reqItem ? reqItem.nameKo : uiDef.requiresItemForRescue}]이(가) 있어야 구출할 수 있다!`;
        addLog('warning', msg);
        return { ok: false, reason: 'missing_rescue_item', message: msg };
      }
      if (uiDef.requiresFlagForRescue && !hasFlag(uiDef.requiresFlagForRescue)) {
        if (incidentId === 'inc_miyuki_clock_tower' && hasItem('item_red_paint')) {
          return useItemOnHotspot('item_red_paint', 'hs_clock_tower_ladder');
        }
        const msg = '⚠️ 먼저 시계탑 사다리에 [붉은 수성 도료]를 사용해 함정을 파훼해야 한다!';
        addLog('warning', msg);
        return { ok: false, reason: 'missing_rescue_flag', message: msg };
      }

      if (incidentId === 'inc_kotomi_trust' && hasItem('item_red_ribbon_bell')) {
        return useItemOnHotspot('item_red_ribbon_bell', 'hs_4f_av_kotomi');
      }
      if (incidentId === 'inc_jinpachi_betrayal' && hasItem('item_bar_lock') && !isPuzzleSolved('puz_3f_barlock_containment')) {
        return useItemOnHotspot('item_bar_lock', 'hs_3f_containment_lock');
      }

      resolveIncidentSuccess(incidentId);
      return {
        ok: true,
        outcome: 'rescued',
        incidentId,
        message: `${uiDef.titleKo} 구출 완료!`,
      };
    }

    function selectDialogueBranchForCharacter(charId) {
      const candidates = dialogueBranches.filter((b) => b.characterId === charId);
      if (candidates.length === 0) return null;

      // Priority 1: Exact room + current phase match (preferring affection events)
      const roomPhase = candidates.filter(
        (b) => b.roomIds.includes(state.currentRoomId) && b.phases.includes(state.currentPhase)
      );
      if (roomPhase.length > 0) {
        return roomPhase.find((b) => b.isAffectionEvent) || roomPhase[0];
      }

      // Priority 2: Exact room match regardless of phase (supports backtracking)
      const roomOnly = candidates.filter((b) => b.roomIds.includes(state.currentRoomId));
      if (roomOnly.length > 0) {
        return roomOnly.find((b) => b.isAffectionEvent) || roomOnly[0];
      }

      // Priority 3: Phase match (e.g., Miyuki companion following player in 2F rooms)
      const phaseOnly = candidates.filter((b) => b.phases.includes(state.currentPhase));
      if (phaseOnly.length > 0) {
        return phaseOnly[0];
      }

      return candidates[0];
    }

    function getCharacterDialogue(charId) {
      const ch = charMap.get(charId);
      if (!ch) return null;

      // Active incident in current room takes priority
      const activeInc = state.activeIncidents.find(
        (a) => a.targetCharacterId === charId && a.triggerRoomId === state.currentRoomId
      );
      if (activeInc) {
        const uiDef = INCIDENT_DEFINITIONS[activeInc.id];
        return {
          branchId: `incident_${activeInc.id}`,
          characterId: charId,
          characterNameKo: ch.nameKo,
          titleKo: uiDef.titleKo,
          isIncident: true,
          isAffectionEvent: false,
          alreadyCompleted: false,
          incidentId: activeInc.id,
          promptKo: uiDef.promptKo,
          choices: uiDef.choices.map((c, idx) => ({
            index: idx,
            id: c.id,
            actionId: c.id,
            labelKo: c.labelKo,
          })),
        };
      }

      const branch = selectDialogueBranchForCharacter(charId);
      if (branch) {
        const alreadyCompleted = branch.isAffectionEvent
          ? state.affectionEventsCompleted.includes(branch.id)
          : state.dialogueSeen[branch.id] !== undefined;
        return {
          branchId: branch.id,
          sceneKey: branch.id,
          characterId: charId,
          characterNameKo: ch.nameKo,
          titleKo: branch.titleKo,
          isIncident: false,
          isAffectionEvent: Boolean(branch.isAffectionEvent),
          alreadyCompleted,
          promptKo: branch.promptKo,
          choices: branch.choices.map((c, idx) => ({
            index: idx,
            id: c.id,
            labelKo: c.labelKo,
            replyKo: c.replyKo,
            miyukiDelta: c.miyukiDelta || 0,
            kotomiDelta: c.kotomiDelta || 0,
            threatDelta: c.threatDelta || 0,
            setsFlag: c.setsFlag || null,
          })),
        };
      }

      return {
        branchId: `fallback_${charId}`,
        sceneKey: `fallback_${charId}_${state.currentPhase}`,
        characterId: charId,
        characterNameKo: ch.nameKo,
        titleKo: `${ch.nameKo}와의 대화`,
        isIncident: false,
        isAffectionEvent: false,
        alreadyCompleted: false,
        promptKo: `${ch.nameKo}: "조심해서 탐색하자."`,
        choices: [{ index: 0, id: 'ack', labelKo: '알겠어, 주의해서 탐색할게', replyKo: `${ch.nameKo}: "응, 흩어지지 말자."` }],
      };
    }

    function talkToCharacter(charId, choiceIndexOrId = 0) {
      if (state.endingId) {
        return { ok: false, reason: 'game_ended', message: '이미 엔딩에 도달했습니다.' };
      }
      const ch = charMap.get(charId);
      if (!ch) {
        return { ok: false, reason: 'unknown_character', message: '존재하지 않는 인물입니다.' };
      }
      if (state.characterStates[charId] === 'compromised') {
        return { ok: false, reason: 'character_compromised', message: `${ch.nameKo}은(는) 현재 소재 불명 상태입니다.` };
      }

      const dialogue = getCharacterDialogue(charId);
      if (!dialogue) {
        return { ok: false, reason: 'no_dialogue', message: '대화할 수 없습니다.' };
      }

      const chosen =
        typeof choiceIndexOrId === 'string'
          ? dialogue.choices.find((c) => c.id === choiceIndexOrId || c.actionId === choiceIndexOrId) || dialogue.choices[0]
          : dialogue.choices[choiceIndexOrId] || dialogue.choices[0];

      if (dialogue.isIncident) {
        return interveneIncident(dialogue.incidentId, chosen.actionId);
      }

      const branchKey = dialogue.branchId;
      const alreadySeen = dialogue.isAffectionEvent
        ? state.affectionEventsCompleted.includes(branchKey)
        : state.dialogueSeen[branchKey] !== undefined;

      let affectionChanged = false;
      if (!alreadySeen) {
        state.dialogueSeen[branchKey] = chosen.index;
        if (dialogue.isAffectionEvent) {
          state.affectionEventsCompleted.push(branchKey);
        }
        if (chosen.miyukiDelta) {
          state.miyukiAffection += chosen.miyukiDelta;
          affectionChanged = true;
        }
        if (chosen.kotomiDelta) {
          state.kotomiAffection += chosen.kotomiDelta;
          affectionChanged = true;
        }
        if (chosen.threatDelta) {
          adjustThreat(chosen.threatDelta, `대화 반응(${ch.nameKo})`);
        }
        if (chosen.setsFlag) {
          state.flags[chosen.setsFlag] = true;
        }
        state.dialogueChoiceHistory.push({
          branchId: branchKey,
          characterId: charId,
          choiceId: chosen.id,
          choiceIndex: chosen.index,
          miyukiDelta: chosen.miyukiDelta || 0,
          kotomiDelta: chosen.kotomiDelta || 0,
          tick: state.actionTicks,
        });
      }

      if (charId === 'char_miyuki' && state.currentRoomId === 'rm_3f_library') {
        state.flags.flg_library_talk_done = true;
      }

      addLog('dialogue', `💬 켄타 → ${ch.nameKo}: "${chosen.labelKo}"`);
      if (chosen.replyKo) {
        addLog('dialogue', `↳ ${chosen.replyKo}`);
      }
      if (alreadySeen && dialogue.isAffectionEvent) {
        addLog('inspect', `ℹ️ [${dialogue.titleKo}] 신뢰도 분기는 이미 반영되어 중복 변동되지 않습니다.`);
      }

      syncCharacterLocations();
      return {
        ok: true,
        branchId: branchKey,
        characterId: charId,
        choiceIndex: chosen.index,
        choiceId: chosen.id,
        replyKo: chosen.replyKo || '',
        alreadySeen,
        affectionChanged,
        miyukiAffection: state.miyukiAffection,
        kotomiAffection: state.kotomiAffection,
        affectionEventsCompleted: [...state.affectionEventsCompleted],
        message: `${ch.nameKo}와(과) 대화를 나누었다.`,
      };
    }

    function inspectItem(itemId) {
      if (!hasItem(itemId)) {
        return { ok: false, reason: 'item_not_owned', message: '보유하지 않은 아이템입니다.' };
      }
      const item = itemMap.get(itemId);
      if (!state.inspectedClues.includes(itemId)) {
        state.inspectedClues.push(itemId);
      }
      syncMemoCoordsFromSource('item', itemId);
      const detail = CLUE_READINGS[itemId] || `【${item.nameKo}】 ${item.purposeKo}`;
      addLog('clue', detail);

      if (cipherData && itemId === cipherData.requiredItemId) {
        return { ok: true, action: 'open_cipher_decoder', item, detail };
      }
      return { ok: true, action: 'inspect_item', item, detail };
    }

    function getNextClueHint() {
      if (state.endingId) {
        const end = endingMap.get(state.endingId);
        return {
          urgency: 'done',
          phase: state.currentPhase,
          titleKo: `결말 도달 — ${end ? end.nameKo : state.endingId}`,
          hintKo: '이미 엔딩에 도달했습니다. 세이브/로드로 분기 직전에 돌아가 다른 엔딩을 수집해 보세요.',
          spoilerHintKo: '전원 생존(피해 0명) + 미유키 신뢰 3 이상(미유키 해피) / 2 이하(코토미 해피), 피해 발생 후 탈출(노멀)을 모두 모을 수 있습니다.',
          targetRoomId: state.currentRoomId,
          targetFloor: state.currentFloor,
          targetRoomNameKo: roomMap.get(state.currentRoomId)?.nameKo || '',
        };
      }

      // Priority 1: Active crisis countdown!
      if (state.activeIncidents.length > 0) {
        const urgent = [...state.activeIncidents].sort((a, b) => a.remainingTicks - b.remainingTicks)[0];
        const targetRoom = roomMap.get(urgent.triggerRoomId);
        const charObj = charMap.get(urgent.targetCharacterId);
        const uiDef = INCIDENT_DEFINITIONS[urgent.id];
        return {
          urgency: 'critical',
          phase: state.currentPhase,
          titleKo: `긴급 구출 우선 — ${charObj ? charObj.nameKo : urgent.targetCharacterId} (남은 ${urgent.remainingTicks}틱)`,
          hintKo: `${targetRoom ? targetRoom.nameKo : urgent.triggerRoomId}에서 위기 경보가 발동 중입니다. 제한 틱이 0이 되기 전에 즉시 이동해 대응하세요!`,
          spoilerHintKo: `${uiDef ? uiDef.promptKo : ''} — ${incidentMap.get(urgent.id)?.rescueAction || ''}`,
          targetRoomId: urgent.triggerRoomId,
          targetFloor: targetRoom ? targetRoom.floor : state.currentFloor,
          targetRoomNameKo: targetRoom ? targetRoom.nameKo : urgent.triggerRoomId,
        };
      }

      const makeHint = (urgency, titleKo, hintKo, spoilerHintKo, targetRoomId) => {
        const rm = roomMap.get(targetRoomId);
        return {
          urgency,
          phase: state.currentPhase,
          titleKo,
          hintKo,
          spoilerHintKo,
          targetRoomId,
          targetFloor: rm ? rm.floor : state.currentFloor,
          targetRoomNameKo: rm ? rm.nameKo : '',
        };
      };

      // Phase 1: 5F -> 4F
      if (!hasFlag('flg_4f_unlocked')) {
        if (!hasItem('item_machine_oil')) {
          return makeHint(
            'normal',
            '5F 윤활 도구 확보',
            '5층 교실 중 정비 기름이 보관된 곳을 찾아 두면 녹슨 자물쇠를 안전하게 다룰 수 있습니다.',
            '5F 3-1 교실 사물함에서 [기계유]를 먼저 챙기세요.',
            'rm_5f_class_3_1'
          );
        }
        if (!isPuzzleSolved('puz_5f_safe_code')) {
          const hasBothMemos = hasItem('item_clue_memo_3_2') && hasItem('item_skeleton_memo');
          return makeHint(
            'normal',
            hasBothMemos ? '5F 남자 화장실 금고 해제' : '5F 금고 비밀번호 단서 수집',
            hasBothMemos
              ? '3-2 교실 메모와 골격 표본 메모의 4자리 숫자를 조합해 5F 남자 화장실 금고를 열어 보세요.'
              : '5F 3-2 교실 책상과 5F 이과 실험실 표본·상자에서 금고 단서와 유용한 물건을 챙기세요.',
            '5F 남자 화장실 비밀번호 금고에 [3878]을 입력하면 [녹슨 철제 열쇠]를 얻습니다. (5F 이과 실험실 상자의 갈색 표지 책도 미리 챙겨 두면 좋습니다.)',
            hasBothMemos ? 'rm_5f_restroom_m' : 'rm_5f_science'
          );
        }
        return makeHint(
          'normal',
          '5F→4F 계단 잠금 문 해정',
          '녹슨 계단 자물쇠를 무리하게 돌리면 열쇠가 손상됩니다. 윤활 처리 후 열쇠를 사용하세요.',
          '5F 복도 계단 문에 [기계유]를 바른 뒤 [녹슨 철제 열쇠]를 사용(또는 인벤토리 조합)해 4층을 개방하세요.',
          'rm_5f_hall'
        );
      }

      // Phase 2: 4F & 5F Backtracking -> 3F
      if (!hasFlag('flg_3f_unlocked')) {
        if (!hasItem('item_red_paint') && !hasFlag('flg_clock_tower_paint_applied')) {
          return makeHint(
            'normal',
            '4F 복도 단서 물품 회수',
            '4F 복도 구석에 종반 함정 파훼에 쓰일 도료가 놓여 있습니다.',
            '4F 복도 구석에서 [붉은 수성 도료]를 챙겨 두세요.',
            'rm_4f_hall'
          );
        }
        if (!hasItem('item_screwdriver')) {
          return makeHint(
            'normal',
            '4F 창고 다용도 공구 탐색',
            '4F 소실/창고에 나사를 풀고 벽면을 열어볼 수 있는 공구가 있습니다.',
            '4F 소실/창고 상자에서 [드라이버]를 줍고, 같은 방 쥐구멍에 사용해 [작은 열쇠]까지 회수하세요.',
            'rm_4f_storage'
          );
        }
        if (!isPuzzleSolved('puz_4f_mouse_hole')) {
          return makeHint(
            'normal',
            '4F 소실 쥐구멍 조사',
            '드라이버로 4F 소실의 수상한 벽면을 열어 볼 수 있습니다.',
            '4F 소실/창고 쥐구멍에 [드라이버]를 사용해 3층용 [작은 열쇠]를 얻으세요.',
            'rm_4f_storage'
          );
        }
        if (!hasFlag('flg_akemi_stabilized') && !hasFlag('flg_akemi_notebook_returned')) {
          if (!hasItem('item_akemi_notebook')) {
            return makeHint(
              'high',
              '아케미 안정화 — 5F 수첩 회수',
              '아케미가 잃어버린 수첩을 찾지 못하면 4F 배전반에서 대형 화재 위험이 커집니다. 5층 실험실을 다시 살펴보세요.',
              '5F 이과 실험실 바닥에서 [아케미의 수첩]을 주워 4F 2-3 교실의 아케미에게 돌려주세요.',
              'rm_5f_science'
            );
          }
          return makeHint(
            'high',
            '4F 2-3 교실 아케미 수첩 반환',
            '찾은 수첩을 4F 2-3 교실의 아케미에게 건네 심리적 안정을 확보하세요.',
            '4F 2-3 교실 핫스팟에 [아케미의 수첩]을 사용하면 배전반 화재 위기를 예방할 수 있습니다.',
            'rm_4f_class_2_3'
          );
        }
        if (!isPuzzleSolved('puz_5f_safe_back')) {
          return makeHint(
            'normal',
            hasFlag('flg_rusted_key_snapped')
              ? '구리 열쇠 추적 ① — 5F 금고 후면 패널'
              : '5F 백트래킹 — 금고 후면 패널 분해',
            '열어 둔 5F 남자 화장실 금고 뒷면 패널을 드라이버로 열어 볼 수 있습니다.',
            '5F 남자 화장실 금고 후면 패널에 [드라이버]를 사용해 [단1 건전지]를 꺼내세요.',
            'rm_5f_restroom_m'
          );
        }
        if (!isPuzzleSolved('puz_5f_time_recorder')) {
          return makeHint(
            'normal',
            '구리 열쇠 추적 ② — 5F 타임 레코더 기동',
            '5F 여자 화장실 바닥의 타임 레코더에 전원을 넣으면 서랍이 열립니다.',
            '5F 여자 화장실 타임 레코더에 [단1 건전지]를 넣어 [작은 망치]를 획득하세요.',
            'rm_5f_restroom_f'
          );
        }
        if (!isPuzzleSolved('puz_4f_thinker_statue')) {
          return makeHint(
            'normal',
            '구리 열쇠 추적 ③ — 4F 공작실 석고상',
            '4F 공작실 "생각하는 사람" 석고상 속이 비어 있다는 소문이 있습니다.',
            '4F 공작실 석고상에 [작은 망치]를 사용해 [구리 열쇠]를 회수하세요.',
            'rm_4f_craft'
          );
        }
        return makeHint(
          'normal',
          '4F→3F 계단 잠금 문 해정',
          '구리 열쇠도 녹슨 자물쇠에는 윤활이 필요합니다. 4F 복도 계단 문을 여세요.',
          '4F 복도 3층 계단 문에 [기계유]와 [구리 열쇠]를 사용해 3층으로 내려가세요.',
          'rm_4f_hall'
        );
      }

      // Phase 3: 3F -> 2F
      if (!hasFlag('flg_2f_unlocked')) {
        if (!isPuzzleSolved('puz_3f_broadcast_prep_unlock')) {
          return makeHint(
            'normal',
            '3F 방송실 창고 바 록 해제',
            '3F 방송실 준비실 내문에 바 록이 걸려 있습니다. 4층에서 얻은 작은 열쇠를 시험해 보세요.',
            '3F 방송실 창고 내문에 [작은 열쇠]를 사용해 [바 록]을 분리하고 방송실을 개방하세요.',
            'rm_3f_broadcast_prep'
          );
        }
        if (!hasItem('item_wooden_ladder') || !hasItem('item_lighter') || !hasItem('item_cipher_table')) {
          return makeHint(
            'normal',
            '3F 방송실 도구·난수표 수거',
            '방송실 내부에 고소 작업 도구와 벽면 시계·난수표 단서가 있습니다.',
            '3F 방송실에서 [목제 사다리], [라이터], [난수표]를 모두 회수하고 소가도 구출하세요.',
            'rm_3f_broadcast'
          );
        }
        if (!isPuzzleSolved('puz_3f_library_shelf')) {
          return makeHint(
            'normal',
            '3F 도서실 서가 및 미유키 대화',
            '3F 도서실의 이동 가능한 서가와 미유키의 추리 대화를 확인해 보세요.',
            '3F 도서실에서 서가를 밀어 [붉은 리본 방울]을 회수하고, 4F 시청각실 코토미에게 전달하세요.',
            'rm_3f_library'
          );
        }
        if (!isPuzzleSolved('puz_3f_ceiling_latch')) {
          return makeHint(
            'normal',
            '3F 막다른 복도 천장 기믹 돌파',
            '고양이 울음소리가 들리는 높은 천장 손잡이에 닿으려면 발판과 분해 공구가 필요합니다.',
            '3F 막다른 복도 천장 손잡이에 [목제 사다리]와 [드라이버]를 사용해 [붉은 리본 열쇠]를 얻으세요.',
            'rm_3f_dead_end'
          );
        }
        return makeHint(
          'normal',
          '3F→2F 계단 문 해정',
          '천장에서 회수한 열쇠로 2층 계단 잠금 문을 열 수 있습니다.',
          '3F 복도 2층 계단 문에 [붉은 리본 열쇠]를 사용하세요.',
          'rm_3f_hall'
        );
      }

      // Phase 4: 2F -> 1F & Clock Tower
      if (!hasFlag('flg_1f_unlocked')) {
        if (!hasItem('item_alcohol_bottle') && !isPuzzleSolved('puz_2f_stove_burn')) {
          return makeHint(
            'normal',
            '2F 착화 촉매 탐색',
            '2F 급식실 장작 난로를 점화하려면 가연성 액체와 탈 종이, 불씨가 필요합니다.',
            '2F 남자 화장실 좌측 칸에서 [알코올 병]을 챙기고, 2F 1-1 교실에서 미유키와 대화하세요.',
            'rm_2f_restroom_m'
          );
        }
        if (!hasItem('item_brown_book') && !isPuzzleSolved('puz_2f_stove_burn')) {
          return makeHint(
            'normal',
            '5F 백트래킹 — 갈색 표지 책 회수',
            '2F 급식실 난로에 넣을 가연 재료가 부족합니다. 5층 실험실 상자를 확인했는지 되짚어 보세요.',
            '5F 이과 실험실 골판지 상자에서 [갈색 표지 책]을 챙겨 2F 급식실로 돌아오세요.',
            'rm_5f_science'
          );
        }
        if (!isPuzzleSolved('puz_2f_stove_burn')) {
          return makeHint(
            'normal',
            '2F 급식실 장작 난로 연소',
            '갈색 표지 책과 알코올 병, 라이터가 모두 갖춰졌습니다. 난로에서 연소시켜 보세요.',
            '2F 급식실 장작 난로에 [갈색 표지 책] + [알코올 병] 투입 후 [라이터]로 점화해 [은색 열쇠]를 얻으세요.',
            'rm_2f_kitchen'
          );
        }
        return makeHint(
          'normal',
          '2F→1F 계단 및 시계탑 개방',
          '은색 열쇠로 1층 계단 문을 열면 최종 탈출과 시계탑 진입 경로가 함께 열립니다.',
          '2F 복도 1층 계단 문에 [은색 열쇠]를 사용하세요.',
          'rm_2f_hall'
        );
      }

      // Phase 5: Climax -> Escape
      if (!isPuzzleSolved('puz_clock_tower_paint_trap')) {
        return makeHint(
          'high',
          '종반 ① — 6F 시계탑 함정 파훼',
          '1F 현관은 용접 봉쇄된 가짜 출구입니다. 5F 복도 상층 연결 해치로 시계탑에 올라가 유작의 함정을 파훼하세요.',
          '5F 복도 → 6F 시계탑으로 이동해 사다리에 [붉은 수성 도료]를 바르고 미유키와 최종 대화를 나누세요.',
          'rm_clock_tower'
        );
      }
      if (!isPuzzleSolved('puz_3f_barlock_containment')) {
        return makeHint(
          'high',
          '종반 ② — 3F 방송실 창고 바 록 대치',
          '시계탑 함정을 파훼했다면 3F 방송실 창고에서 배신 위험과 유작의 공세를 최종 제압해야 합니다.',
          '3F 방송실 창고(준비실) 격리 잠금 지점에 [바 록]을 사용해 진파치를 설득·제압하고 [유작의 나이프]를 확보하세요.',
          'rm_3f_broadcast_prep'
        );
      }
      if (!isPuzzleSolved('puz_1f_infirmary_escape')) {
        return makeHint(
          'high',
          '종반 ③ — 1F 보건실 비밀 탈출구 개방',
          '유작을 제압했습니다! 1F 현관이 아닌 1F 보건실 침대 옆 봉쇄 판자를 돌파해 탈출하세요.',
          '1F 보건실 침대 근처 판자에 [유작의 나이프]를 사용해 외부 탈출 통로를 여세요.',
          'rm_1f_infirmary'
        );
      }

      return makeHint(
        'normal',
        '탈출 통로 개방 완료!',
        '1F 보건실의 비밀 통로가 열렸습니다. 외부 탈출구로 이동해 결말을 확인하세요!',
        '1F 보건실에서 [구교사 외부 탈출구] 출구 버튼을 클릭하세요.',
        'rm_escape_exit'
      );
    }

    function evaluateEnding() {
      if (state.endingId) {
        return endingMap.get(state.endingId) || null;
      }

      const compromisedCount = getCompromisedCount();
      const sortedEndings = [...data.endings].sort((a, b) => a.priority - b.priority);

      for (const end of sortedEndings) {
        const cond = end.conditions || {};
        if (cond.reachedRoomId !== null && cond.reachedRoomId !== undefined) {
          if (state.currentRoomId !== cond.reachedRoomId) continue;
        }
        if (Array.isArray(cond.requiredFlags) && cond.requiredFlags.length > 0) {
          if (!cond.requiredFlags.every((f) => hasFlag(f))) continue;
        }
        if (Array.isArray(cond.requiredAnyFlags) && cond.requiredAnyFlags.length > 0) {
          if (!cond.requiredAnyFlags.some((f) => hasFlag(f))) continue;
        }
        if (typeof cond.maxCompromisedCount === 'number' && compromisedCount > cond.maxCompromisedCount) {
          continue;
        }
        if (typeof cond.minCompromisedCount === 'number' && compromisedCount < cond.minCompromisedCount) {
          continue;
        }
        if (typeof cond.minMiyukiAffinity === 'number' && state.miyukiAffection < cond.minMiyukiAffinity) {
          continue;
        }
        if (typeof cond.maxMiyukiAffinity === 'number' && state.miyukiAffection > cond.maxMiyukiAffinity) {
          continue;
        }

        state.endingId = end.id;
        addLog('ending', `🎬 결말 도달: ${end.nameKo} — ${end.summaryKo}`);
        return end;
      }

      return null;
    }

    function getState() {
      return deepClone(state);
    }

    function serialize() {
      return JSON.stringify(state);
    }

    function deserialize(jsonOrObj) {
      const parsed = typeof jsonOrObj === 'string' ? JSON.parse(jsonOrObj) : deepClone(jsonOrObj);
      if (!parsed || typeof parsed !== 'object' || !roomMap.has(parsed.currentRoomId)) {
        throw new Error('Invalid Isaku save state payload.');
      }
      state = normalizeState(deepClone(parsed));
      return getState();
    }

    function reset() {
      state = buildInitialState();
      return getState();
    }

    function getPresentCharacters(roomId = state.currentRoomId) {
      return data.characters.filter(
        (c) =>
          c.id !== 'char_kenta' &&
          c.role !== 'backstory_victim' &&
          state.characterLocations[c.id] === roomId &&
          state.characterStates[c.id] !== 'compromised'
      );
    }

    function getExitsWithState(roomId = state.currentRoomId) {
      const room = roomMap.get(roomId);
      if (!room) return [];
      return room.exits.map((ex) => {
        const target = roomMap.get(ex.to);
        const unlocked = isExitUnlocked(roomId, ex.to);
        const puzzle = ex.unlockPuzzleId ? puzzleMap.get(ex.unlockPuzzleId) : null;
        return {
          ...ex,
          unlocked,
          targetRoom: target,
          unlockPuzzleNameKo: puzzle ? puzzle.nameKo : null,
        };
      });
    }

    function getAvailableHotspots(roomId = state.currentRoomId) {
      const room = roomMap.get(roomId);
      if (!room) return [];
      return room.hotspots.map((hs) => {
        const puzzle = data.puzzles.find((p) => p.hotspotId === hs.id);
        const pickups = HOTSPOT_PICKUPS[hs.id] || [];
        let visible = true;
        if (hs.id === 'hs_5f_restroom_m_safe_back' && !hasFlag('flg_5f_safe_opened')) {
          visible = false;
        }
        const hasPendingPickup = pickups.some(
          (id) =>
            !hasItem(id) &&
            !state.consumedItems.includes(id) &&
            !(hs.id === 'hs_5f_science_floor' && !hasFlag('flg_4f_unlocked')) &&
            !(hs.id === 'hs_3f_stall_2' && !hasFlag('flg_evidence_tape_spawned')) &&
            !(hs.id === 'hs_1f_hall_isaku_body' && !hasFlag('flg_climax_isaku_down'))
        );
        return {
          ...hs,
          visible,
          examined: state.examinedHotspots.includes(hs.id),
          puzzleId: puzzle ? puzzle.id : null,
          puzzleSolved: puzzle ? isPuzzleSolved(puzzle.id) : false,
          hasPendingPickup,
          stagedItems: state.partialPuzzleProgress[hs.id] || [],
        };
      });
    }

    function getProgressSummary() {
      const compromisedCount = getCompromisedCount();
      const rescuedCount = state.resolvedIncidents.filter((r) => r.outcome === 'rescued').length;
      const totalAffectionEvents = dialogueBranches.filter(
        (b) => b.isAffectionEvent && b.characterId === 'char_miyuki'
      ).length;
      return {
        currentPhase: state.currentPhase,
        currentPhaseLabelKo: PHASE_LABELS[state.currentPhase] || state.currentPhase,
        actionTicks: state.actionTicks,
        currentFloor: state.currentFloor,
        currentRoomId: state.currentRoomId,
        solvedPuzzles: state.solvedPuzzles.length,
        totalPuzzles: data.puzzles.length,
        visitedRooms: state.visitedRooms.length,
        totalRooms: data.rooms.length,
        activeIncidentCount: state.activeIncidents.length,
        rescuedCount,
        totalIncidents: data.incidents.length,
        compromisedCount,
        miyukiAffection: state.miyukiAffection,
        kotomiAffection: state.kotomiAffection,
        affectionEventsCompletedCount: state.affectionEventsCompleted.length,
        totalAffectionEvents,
        threatLevel: state.threatLevel,
        threatBand: state.threatBand,
        threatBandLabelKo: THREAT_BAND_META[state.threatBand]?.labelKo || state.threatBand,
        evidenceTapeDetected: state.evidenceTapeDetected,
        decodedCipherCluesCount: state.decodedCipherClues.length,
        totalCipherDeductions: cipherData ? cipherData.deductions.length : 0,
        endingId: state.endingId,
      };
    }

    return {
      data,
      PHASE_ORDER,
      PHASE_LABELS,
      THREAT_BAND_META,
      INCIDENT_DEFINITIONS,
      getState,
      getRoom: (id) => roomMap.get(id) || null,
      getCurrentRoom: () => roomMap.get(state.currentRoomId) || null,
      getItem: (id) => itemMap.get(id) || null,
      getPuzzle: (id) => puzzleMap.get(id) || null,
      getCharacter: (id) => charMap.get(id) || null,
      getIncident: (id) => incidentMap.get(id) || null,
      getEnding: (id) => endingMap.get(id) || null,
      getDialogueBranch: (id) => dialogueBranchMap.get(id) || null,
      getFloorRooms: (floor) => data.rooms.filter((r) => r.floor === floor),
      getPresentCharacters,
      getExitsWithState,
      getAvailableHotspots,
      getCharacterDialogue,
      getCipherStatus,
      getNextClueHint,
      getProgressSummary,
      isExitUnlocked,
      moveTo,
      inspectHotspot,
      inspectItem,
      decodeCipher,
      combineItems,
      useItemOnHotspot,
      submitPuzzleCode,
      interveneIncident,
      talkToCharacter,
      evaluateEnding,
      serialize,
      deserialize,
      reset,
    };
  }

  return {
    createEngine,
    PHASE_ORDER,
    PHASE_LABELS,
    THREAT_BAND_META,
    INCIDENT_DEFINITIONS,
  };
});
