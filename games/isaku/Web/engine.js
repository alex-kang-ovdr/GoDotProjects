// Pure Deterministic Headless Exploration Adventure Engine for 유작 (遺作 / Isaku)
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

  // Canonical hotspot -> room pickup mapping (items are still validated against items.json)
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

  // Clue texts for readable items & non-puzzle hotspots
  const CLUE_READINGS = {
    item_invitation_letter:
      '【호출 편지】 "여름방학 밤, 구교사 5층 음악실로 와 달라." — 일행 모두 같은 필체의 편지를 받았으나 발신인이 없다.',
    item_clue_memo_3_2:
      '【3-2 교실 메모】 "5층 남자 화장실 금고의 번호는 학교의 저주받은 4자리… 3 - 8 - 7 - 8. 녹슨 자물쇠에는 반드시 기름을 먼저 칠할 것."',
    item_skeleton_memo:
      '【골격 표본 메모】 "계단 셔터를 열 열쇠는 반드시 이 층 어딘가의 금고 안에 있다. 또한 4층으로 내려간 뒤에도 5층 금고 뒤편을 잊지 말라."',
    item_cipher_table:
      '【난수표】 종횡 숫자 조합표. 1년 전 신문부가 구교사 출입 기록과 시계탑 동선을 조사하던 흔적이 남아 있다.',
    item_akemi_notebook:
      '【아케미의 수첩】 테니스부 일지와 함께 쿠미 선생에 대한 복잡한 감정, 그리고 구교사 배전반 근처에서 이상한 기름 냄새를 맡았다는 기록이 적혀 있다.',
    item_evidence_tape:
      '【증거 비디오테이프】 구교사 내부 감시 기록이 담긴 테이프. 누군가 구출되지 못했다는 불길한 증거다.',
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

      const initial = {
        schemaVersion: 1,
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
      return initial;
    }

    function addLog(type, text) {
      state.logs.push({
        tick: state.actionTicks,
        type,
        text,
      });
      if (state.logs.length > 160) {
        state.logs = state.logs.slice(-160);
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

      // Clear compromised character locations
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
        // phase_5_climax
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
      // Canonical cascade: Kumi compromised accelerates Rika's isolation window
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
      for (const flg of def.failureOutcome.setsFlags || []) {
        state.flags[flg] = true;
      }

      const charObj = charMap.get(def.targetCharacterId);
      addLog(
        'danger',
        reasonText ||
          `❌ 사건 발생: ${charObj ? charObj.nameKo : def.targetCharacterId} 보호에 실패했다. (${def.failureOutcome.setsFlags.join(', ')})`
      );
      syncCharacterLocations();
      evaluateEnding();
      return true;
    }

    function advanceTicks(cost) {
      if (!cost || cost <= 0 || state.endingId) return;
      state.actionTicks += cost;

      // Update countdowns and expire overdue incidents deterministically
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

      // 1. Kumi restroom crisis (Phase 1)
      if (
        state.currentPhase === 'phase_1_5f_to_4f' &&
        (state.currentRoomId === 'rm_5f_restroom_f' ||
          (hasFlag('flg_5f_safe_opened') && state.currentRoomId === 'rm_5f_hall'))
      ) {
        startIncident('inc_kumi_restroom');
      }

      // 2. Rika isolation crisis (Phase 2)
      if (hasFlag('flg_4f_unlocked') && state.currentRoomId === 'rm_4f_hall') {
        startIncident('inc_rika_isolation');
      }

      // 3. Akemi electrical panel crisis (Phase 2)
      if (
        hasFlag('flg_4f_unlocked') &&
        !hasFlag('flg_akemi_stabilized') &&
        (state.currentRoomId === 'rm_4f_electrical' || isPuzzleSolved('puz_4f_thinker_statue'))
      ) {
        startIncident('inc_akemi_panel');
      }

      // 4. Mio separation crisis (Phase 3)
      if (hasFlag('flg_3f_unlocked') && state.currentRoomId === 'rm_3f_hall') {
        startIncident('inc_mio_separation');
      }

      // 5. Soga reckless crisis (Phase 3)
      if (isPuzzleSolved('puz_3f_broadcast_prep_unlock') || state.currentRoomId === 'rm_3f_broadcast') {
        startIncident('inc_soga_reckless');
      }

      // 6. Kotomi trust crisis (Phase 3, once red ribbon bell is found)
      if (hasFlag('flg_3f_library_bell_found') && !hasFlag('flg_kotomi_protected')) {
        startIncident('inc_kotomi_trust');
      }

      // 7. Miyuki clock tower climax crisis (Phase 5)
      if (hasFlag('flg_clock_tower_accessible') && state.currentRoomId === 'rm_clock_tower') {
        startIncident('inc_miyuki_clock_tower');
      }

      // 8. Jinpachi betrayal / containment crisis (Phase 5)
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
      advanceTicks(1);
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
      if (!state.examinedHotspots.includes(hotspotId)) {
        state.examinedHotspots.push(hotspotId);
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
        // Dynamic visibility checks from ReverseDesign/02
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

      // 5. Special inspection hotspots (Red Herring, VCR, Escape Eval, Group spots)
      if (hotspotId === 'hs_1f_sealed_gate') {
        state.flags.flg_checked_fake_entrance = true;
        const msg =
          '⚠️ 1F 현관문에는 애초에 열쇠 구멍 자체가 용접·봉쇄되어 있다! 정문 열쇠는 존재하지 않는다 — 시계탑과 1F 보건실을 조사해야 한다!';
        addLog('clue', msg);
        return { ok: true, action: 'inspect_clue', message: msg };
      }

      if (hotspotId === 'hs_4f_av_vcr') {
        if (hasItem('item_evidence_tape')) {
          const msg =
            '📼 비디오 재생기에 증거 테이프를 넣었다. 구교사 감시 기록에 동료가 고립된 정황이 찍혀 있다… 해피 엔딩은 이미 멀어진 것 같다.';
          addLog('danger', msg);
          return { ok: true, action: 'play_tape', message: msg };
        }
        const msg = '비디오 재생기는 전원이 꺼져 있다. 지금은 재생할 테이프가 없다.';
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

      // 6. Generic puzzle-hint inspect for item-driven puzzles
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

      const msg = `❌ 비밀번호 [${normalized || '공백'}] 불일치. (힌트: 3-2 교실 메모와 과학실 단서를 확인하자.)`;
      addLog('warning', msg);
      return { ok: false, solved: false, reason: 'wrong_code', message: msg };
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

      // 1. Machine Oil + Rusted Iron Key
      if (pair === ['item_machine_oil', 'item_rusted_key'].sort().join('+')) {
        state.flags.flg_rusted_key_oiled = true;
        const msg =
          '🛢️ 조합 성공: [기계유]를 [녹슨 철제 열쇠]에 충분히 도포했다! 이제 5F→4F 계단 잠금 문에서 부러지지 않고 열 수 있다.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_rusted_key_oiled', message: msg };
      }

      // 2. Machine Oil + Copper Key
      if (pair === ['item_machine_oil', 'item_copper_key'].sort().join('+')) {
        state.flags.flg_copper_key_oiled = true;
        const msg =
          '🛢️ 조합 성공: [기계유]를 [구리 열쇠]에 도포했다! 이제 4F→3F 계단 잠금 문을 안전하게 열 수 있다.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_copper_key_oiled', message: msg };
      }

      // 3. Brown Book + Alcohol Bottle (items.json combineWith)
      if (pair === ['item_alcohol_bottle', 'item_brown_book'].sort().join('+')) {
        state.flags.flg_book_soaked_alcohol = true;
        const msg =
          '🔥 조합 성공: [갈색 표지 책]에 [알코올 병]을 적셔 착화 연료를 준비했다! 2F 급식실 장작 난로에 넣고 라이터로 점화하자.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_book_soaked_alcohol', message: msg };
      }

      // 4. Wooden Ladder + Screwdriver (items.json combineWith)
      if (pair === ['item_screwdriver', 'item_wooden_ladder'].sort().join('+')) {
        state.flags.flg_ceiling_kit_ready = true;
        const msg =
          '🪜 조합 성공: [목제 사다리]와 [드라이버]를 고소 작업 세트로 준비했다! 3F 막다른 복도 천장 손잡이에 사용하자.';
        addLog('item', msg);
        return { ok: true, combined: true, flag: 'flg_ceiling_kit_ready', message: msg };
      }

      // 5. Lighter + (Brown Book or Alcohol Bottle)
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
            // Softlock prevention rule from ReverseDesign/03!
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

      // Allow intervention only when player is at the incident room
      if (state.currentRoomId !== def.triggerRoomId) {
        const targetRoom = roomMap.get(def.triggerRoomId);
        const msg = `⚠️ 먼저 [${targetRoom ? targetRoom.nameKo : def.triggerRoomId}]으로 이동해야 대응할 수 있다!`;
        addLog('warning', msg);
        return { ok: false, reason: 'wrong_room_for_incident', message: msg };
      }

      // Ensure incident is started if player proactively acts at the room
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

      // Validate rescue prerequisites where applicable
      if (uiDef.requiresItemForRescue && !hasItem(uiDef.requiresItemForRescue)) {
        const reqItem = itemMap.get(uiDef.requiresItemForRescue);
        const msg = `⚠️ [${reqItem ? reqItem.nameKo : uiDef.requiresItemForRescue}]이(가) 있어야 구출할 수 있다!`;
        addLog('warning', msg);
        return { ok: false, reason: 'missing_rescue_item', message: msg };
      }
      if (uiDef.requiresFlagForRescue && !hasFlag(uiDef.requiresFlagForRescue)) {
        // For clock tower, if player holds red paint right here, apply it automatically!
        if (incidentId === 'inc_miyuki_clock_tower' && hasItem('item_red_paint')) {
          return useItemOnHotspot('item_red_paint', 'hs_clock_tower_ladder');
        }
        const msg = '⚠️ 먼저 시계탑 사다리에 [붉은 수성 도료]를 사용해 함정을 파훼해야 한다!';
        addLog('warning', msg);
        return { ok: false, reason: 'missing_rescue_flag', message: msg };
      }

      // Special side effects when rescuing via interveneIncident
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

    function getCharacterDialogue(charId) {
      const ch = charMap.get(charId);
      if (!ch) return null;

      // Active incident in current room takes priority!
      const activeInc = state.activeIncidents.find(
        (a) => a.targetCharacterId === charId && a.triggerRoomId === state.currentRoomId
      );
      if (activeInc) {
        const uiDef = INCIDENT_DEFINITIONS[activeInc.id];
        return {
          characterId: charId,
          characterNameKo: ch.nameKo,
          isIncident: true,
          incidentId: activeInc.id,
          promptKo: uiDef.promptKo,
          choices: uiDef.choices.map((c, idx) => ({
            index: idx,
            actionId: c.id,
            labelKo: c.labelKo,
          })),
        };
      }

      // Miyuki canonical affection dialogues per key room
      if (charId === 'char_miyuki') {
        const room = state.currentRoomId;
        if (room === 'rm_5f_music') {
          return {
            characterId: charId,
            characterNameKo: ch.nameKo,
            sceneKey: 'miyuki_5f_music',
            promptKo: '미유키: "이 구교사는 1년 전 내 여동생 사건 이후 폐쇄됐어. 누군가 의도적으로 우리를 부른 거야."',
            choices: [
              { index: 0, labelKo: '1년 전 사건과 호출 편지의 진상을 함께 파헤치자 (+미유키 신뢰)', miyukiDelta: 1 },
              { index: 1, labelKo: '우선 코토미와 모두의 탈출구부터 찾는 게 먼저야 (+코토미 신뢰)', kotomiDelta: 1 },
            ],
          };
        }
        if (room === 'rm_3f_library') {
          return {
            characterId: charId,
            characterNameKo: ch.nameKo,
            sceneKey: 'miyuki_3f_library',
            promptKo: '미유키: "도서실 기록과 진파치의 태도가 신경 쓰여. 켄타, 넌 내 추리를 믿어줄 수 있어?"',
            choices: [
              { index: 0, labelKo: '미유키의 냉철한 판단을 믿는다. 끝까지 함께 가자 (+미유키 신뢰)', miyukiDelta: 1 },
              { index: 1, labelKo: '진파치와 다른 친구들 말도 균형 있게 들어보자 (+코토미 신뢰)', kotomiDelta: 1 },
            ],
          };
        }
        if (room === 'rm_2f_class_1_1') {
          return {
            characterId: charId,
            characterNameKo: ch.nameKo,
            sceneKey: 'miyuki_2f_1_1',
            promptKo: '미유키: "이제 1층이 코앞이야. 켄타, 여기서부턴 나와 둘이 움직이는 편이 안전해."',
            choices: [
              { index: 0, labelKo: '알겠어, 미유키와 동행해서 아래층과 시계탑을 살피자 (+미유키 신뢰)', miyukiDelta: 1, setsFlag: 'flg_miyuki_companion' },
              { index: 1, labelKo: '코토미와 일행 곁을 지키는 편이 안심돼 (+코토미 신뢰)', kotomiDelta: 1 },
            ],
          };
        }
        if (room === 'rm_clock_tower') {
          return {
            characterId: charId,
            characterNameKo: ch.nameKo,
            sceneKey: 'miyuki_clock_tower',
            promptKo: '미유키: "여기가 모든 사건의 종착점이야… 유작의 함정을 끝내야 해."',
            choices: [
              { index: 0, labelKo: '혼자 짊어지지 마, 반드시 함께 살아 나가자 (+미유키 신뢰)', miyukiDelta: 1 },
              { index: 1, labelKo: '서둘러 정리하고 1층 동료들에게 합류하자 (+코토미 신뢰)', kotomiDelta: 1 },
            ],
          };
        }
        return {
          characterId: charId,
          characterNameKo: ch.nameKo,
          sceneKey: `miyuki_general_${state.currentPhase}`,
          promptKo: '미유키: "방심하지 마. 유작은 우리가 흩어지는 틈을 노리고 있어."',
          choices: [
            { index: 0, labelKo: '단서를 다시 정리해 보자' },
          ],
        };
      }

      if (charId === 'char_kotomi') {
        return {
          characterId: charId,
          characterNameKo: ch.nameKo,
          sceneKey: `kotomi_${state.currentPhase}`,
          promptKo: '코토미: "켄타 군, 무섭지만 모두와 함께라면 꼭 빠져나갈 수 있을 거야…!"',
          choices: [
            { index: 0, labelKo: '반드시 전원 무사히 데리고 나갈게 (+코토미 신뢰)', kotomiDelta: 1 },
            { index: 1, labelKo: '미유키와 함께 단서를 조사 중이니 조금만 기다려 줘' },
          ],
        };
      }

      // Helpful phase hints for other cast members
      const hintsByChar = {
        char_kumi: '쿠미 선생: "침착하세요. 5층 교실들과 이과 실험실을 먼저 꼼꼼히 조사해 봅시다."',
        char_rika: '리카: "코구레 군… 어두운 복도는 너무 무서워. 혼자 두지 말아 줘…"',
        char_akemi: '아케미: "내 수첩을 5층 이과 실험실 근처에 떨어뜨린 것 같아. 그리고 4층 배전반 쪽에서 이상한 냄새가 나."',
        char_mio: '미오: "아케미가 흥분하지 않게 잘 지켜봐야 해. 3층 방송실 문에는 바 록이 걸려 있더라."',
        char_jinpachi: '진파치: "신문부 카메라로 본 건데, 4층 공작실 석고상과 2층 급식실 난로가 수상해. 그리고 1층 정문은 함정일지 몰라."',
        char_soga: '소가: "흥, 내가 먼저 열쇠를 찾아내면 코토미도 날 다시 보겠지! 3층 방송실 쪽을 살펴봐야겠어."',
      };

      return {
        characterId: charId,
        characterNameKo: ch.nameKo,
        sceneKey: `hint_${charId}_${state.currentPhase}`,
        promptKo: hintsByChar[charId] || `${ch.nameKo}: "조심해서 탐색하자."`,
        choices: [{ index: 0, labelKo: '알겠어, 주의해서 탐색할게' }],
      };
    }

    function talkToCharacter(charId, choiceIndex = 0) {
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

      if (dialogue.isIncident) {
        const chosen = dialogue.choices[choiceIndex] || dialogue.choices[0];
        return interveneIncident(dialogue.incidentId, chosen.actionId);
      }

      const chosen = dialogue.choices[choiceIndex] || dialogue.choices[0];
      const alreadySeen = Boolean(state.dialogueSeen[dialogue.sceneKey]);
      if (!alreadySeen) {
        state.dialogueSeen[dialogue.sceneKey] = choiceIndex;
        if (chosen.miyukiDelta) state.miyukiAffection += chosen.miyukiDelta;
        if (chosen.kotomiDelta) state.kotomiAffection += chosen.kotomiDelta;
        if (chosen.setsFlag) state.flags[chosen.setsFlag] = true;
      }

      if (charId === 'char_miyuki' && state.currentRoomId === 'rm_3f_library') {
        state.flags.flg_library_talk_done = true;
      }

      addLog('dialogue', `💬 ${ch.nameKo} — "${chosen.labelKo}"`);
      syncCharacterLocations();
      return {
        ok: true,
        characterId: charId,
        choiceIndex,
        alreadySeen,
        miyukiAffection: state.miyukiAffection,
        kotomiAffection: state.kotomiAffection,
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
      const detail = CLUE_READINGS[itemId] || `【${item.nameKo}】 ${item.purposeKo}`;
      addLog('clue', detail);
      return { ok: true, item, detail };
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
      state = deepClone(parsed);
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
        if (hs.id === 'hs_3f_stall_2' && !hasFlag('flg_evidence_tape_spawned')) {
          visible = true; // inspectable, shows empty stall unless evidence tape spawned
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
        endingId: state.endingId,
      };
    }

    return {
      data,
      PHASE_ORDER,
      PHASE_LABELS,
      INCIDENT_DEFINITIONS,
      getState,
      getRoom: (id) => roomMap.get(id) || null,
      getCurrentRoom: () => roomMap.get(state.currentRoomId) || null,
      getItem: (id) => itemMap.get(id) || null,
      getPuzzle: (id) => puzzleMap.get(id) || null,
      getCharacter: (id) => charMap.get(id) || null,
      getIncident: (id) => incidentMap.get(id) || null,
      getEnding: (id) => endingMap.get(id) || null,
      getFloorRooms: (floor) => data.rooms.filter((r) => r.floor === floor),
      getPresentCharacters,
      getExitsWithState,
      getAvailableHotspots,
      getCharacterDialogue,
      getProgressSummary,
      isExitUnlocked,
      moveTo,
      inspectHotspot,
      inspectItem,
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
    INCIDENT_DEFINITIONS,
  };
});
