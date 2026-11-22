/* Kichikuou Rance — Pure Deterministic Headless Hybrid SLG + Character Scenario Engine
 * Zero DOM dependencies. Data-driven directly from verified_data/*.json via RANCE_DATA.
 * UMD Export: globalThis.KichikuouRanceEngine & module.exports
 */
(function (root) {
  "use strict";

  const SAVE_VERSION = "1.0.0";

  // Canonical facility definitions
  const FACILITIES = {
    hospital: {
      id: "hospital",
      nameKr: "병원",
      nameEn: "Hospital",
      cost: 4000,
      description: "매 턴 아군 지휘관 HP(+2)·병력(+40) 회복 및 전장 생존 지원"
    },
    magic_lab: {
      id: "magic_lab",
      nameKr: "마법연구소",
      nameEn: "Magic Lab",
      cost: 5000,
      description: "모든 마법/카라/지원 부대장 MAG +4 영구 강화"
    },
    maria_lab: {
      id: "maria_lab",
      nameKr: "마리아 연구소",
      nameEn: "Maria's Research Lab",
      cost: 6000,
      requiresRecruited: "chr_maria",
      description: "마리아 영입 후 건설 가능. 튤립 100호 로켓 프로젝트 진행"
    },
    library: {
      id: "library",
      nameKr: "도서관",
      nameEn: "Library",
      cost: 4500,
      description: "국가 세수 +15% 및 소울 구출 시 바운드 영입 체인 완료"
    }
  };

  // Canonical commander baseline profiles (all 33 characters in verified_data/characters.json)
  const COMMANDER_PROFILES = {
    chr_rance:       { hp: 22, troops: 420, maxTroops: 600, atk: 18, def: 13, mag: 4,  spd: 14, strikes: 28, lv: 10, snipe: true,  startRecruited: true },
    chr_sill:        { hp: 14, troops: 280, maxTroops: 450, atk: 6,  def: 9,  mag: 16, spd: 12, strikes: 10, lv: 7,  snipe: false, imprisonedAt: "ter_volgo_z" },
    chr_lia:         { hp: 12, troops: 0,   maxTroops: 0,   atk: 4,  def: 8,  mag: 10, spd: 10, strikes: 5,  lv: 5,  snipe: false, courtOnly: true },
    chr_maris:       { hp: 15, troops: 340, maxTroops: 520, atk: 7,  def: 10, mag: 16, spd: 12, strikes: 12, lv: 8,  snipe: false, startRecruited: true },
    chr_barres:      { hp: 20, troops: 620, maxTroops: 800, atk: 15, def: 17, mag: 4,  spd: 11, strikes: 20, lv: 9,  snipe: false, startRecruited: true },
    chr_cordoba:     { hp: 22, troops: 1000, maxTroops: 1000, atk: 12, def: 21, mag: 5, spd: 8, strikes: 16, lv: 9,  snipe: false, startRecruited: true },
    chr_rick:        { hp: 21, troops: 380, maxTroops: 650, atk: 20, def: 14, mag: 4,  spd: 16, strikes: 30, lv: 11, snipe: true,  startRecruited: true },
    chr_kanami:      { hp: 14, troops: 240, maxTroops: 360, atk: 11, def: 9,  mag: 7,  spd: 19, strikes: 18, lv: 7,  snipe: false, startRecruited: true },
    chr_leila:       { hp: 19, troops: 520, maxTroops: 700, atk: 14, def: 16, mag: 6,  spd: 12, strikes: 18, lv: 8,  snipe: false, startRecruited: true },
    chr_ex:          { hp: 15, troops: 460, maxTroops: 680, atk: 13, def: 12, mag: 6,  spd: 13, strikes: 18, lv: 8,  snipe: false },
    chr_maria:       { hp: 15, troops: 320, maxTroops: 500, atk: 19, def: 10, mag: 8,  spd: 9,  strikes: 20, lv: 8,  snipe: false },
    chr_shizuka:     { hp: 16, troops: 300, maxTroops: 520, atk: 7,  def: 9,  mag: 21, spd: 13, strikes: 15, lv: 9,  snipe: false },
    chr_soul:        { hp: 19, troops: 440, maxTroops: 600, atk: 17, def: 13, mag: 3,  spd: 14, strikes: 24, lv: 8,  snipe: true,  imprisonedAt: "ter_volgo_z" },
    chr_miru:        { hp: 20, troops: 500, maxTroops: 700, atk: 15, def: 18, mag: 6,  spd: 10, strikes: 18, lv: 8,  snipe: false },
    chr_kentarou:    { hp: 20, troops: 380, maxTroops: 560, atk: 19, def: 14, mag: 5,  spd: 15, strikes: 26, lv: 9,  snipe: true  },
    chr_miki:        { hp: 18, troops: 260, maxTroops: 400, atk: 14, def: 14, mag: 20, spd: 14, strikes: 20, lv: 9,  snipe: false },
    chr_patton:      { hp: 23, troops: 720, maxTroops: 900, atk: 20, def: 17, mag: 6,  spd: 13, strikes: 25, lv: 11, snipe: true  },
    chr_sheila:      { hp: 18, troops: 580, maxTroops: 750, atk: 16, def: 15, mag: 7,  spd: 12, strikes: 20, lv: 9,  snipe: false },
    chr_hunty:       { hp: 17, troops: 340, maxTroops: 520, atk: 9,  def: 11, mag: 22, spd: 13, strikes: 16, lv: 11, snipe: false },
    chr_freak:       { hp: 17, troops: 460, maxTroops: 650, atk: 19, def: 15, mag: 8,  spd: 8,  strikes: 18, lv: 9,  snipe: false },
    chr_freya:       { hp: 16, troops: 280, maxTroops: 420, atk: 14, def: 11, mag: 9,  spd: 20, strikes: 22, lv: 9,  snipe: false },
    chr_gandhi:      { hp: 19, troops: 480, maxTroops: 680, atk: 10, def: 13, mag: 22, spd: 11, strikes: 18, lv: 11, snipe: false },
    chr_magic:       { hp: 16, troops: 360, maxTroops: 540, atk: 8,  def: 10, mag: 21, spd: 13, strikes: 16, lv: 10, snipe: false },
    chr_nagi:        { hp: 16, troops: 320, maxTroops: 500, atk: 8,  def: 10, mag: 20, spd: 14, strikes: 16, lv: 9,  snipe: false },
    chr_chizuko:     { hp: 17, troops: 400, maxTroops: 580, atk: 9,  def: 11, mag: 19, spd: 12, strikes: 16, lv: 9,  snipe: false },
    chr_mulala:      { hp: 14, troops: 300, maxTroops: 450, atk: 6,  def: 11, mag: 15, spd: 9,  strikes: 10, lv: 7,  snipe: false, courtOnly: true },
    chr_isoroku:     { hp: 18, troops: 360, maxTroops: 560, atk: 19, def: 12, mag: 8,  spd: 16, strikes: 28, lv: 10, snipe: true  },
    chr_kayblis:     { hp: 28, troops: 900, maxTroops: 1100, atk: 24, def: 20, mag: 22, spd: 15, strikes: 30, lv: 15, snipe: false },
    chr_hornet:      { hp: 24, troops: 720, maxTroops: 900, atk: 20, def: 18, mag: 21, spd: 14, strikes: 25, lv: 13, snipe: false },
    chr_warg:        { hp: 21, troops: 520, maxTroops: 700, atk: 16, def: 15, mag: 23, spd: 15, strikes: 22, lv: 12, snipe: false },
    chr_satella:     { hp: 22, troops: 540, maxTroops: 740, atk: 20, def: 17, mag: 18, spd: 14, strikes: 24, lv: 12, snipe: false },
    chr_haniwa_king: { hp: 26, troops: 300, maxTroops: 450, atk: 22, def: 23, mag: 24, spd: 15, strikes: 30, lv: 15, snipe: true  },
    chr_rudrasaum:   { hp: 99, troops: 1200, maxTroops: 1200, atk: 35, def: 35, mag: 35, spd: 20, strikes: 30, lv: 30, snipe: false }
  };

  // Territory strategic defaults by strategicType
  const TERRITORY_ECONOMY = {
    CAPITAL:              { income: 3400, fieldSize: 700, baseTroops: 520 },
    ENDGAME_CAPITAL:      { income: 4000, fieldSize: 800, baseTroops: 860 },
    FORTRESS:             { income: 2000, fieldSize: 450, baseTroops: 360 },
    PRISON_FORTRESS:      { income: 2200, fieldSize: 480, baseTroops: 420 },
    ELEMENTAL_TOWER:      { income: 2500, fieldSize: 520, baseTroops: 480 },
    TECH_CITY:            { income: 3200, fieldSize: 600, baseTroops: 360 },
    CITY:                 { income: 2600, fieldSize: 600, baseTroops: 340 },
    PORT_CITY:            { income: 2800, fieldSize: 560, baseTroops: 360 },
    HOLY_CAPITAL:         { income: 3000, fieldSize: 560, baseTroops: 400 },
    ISLAND_CAPITAL:       { income: 2900, fieldSize: 550, baseTroops: 440 },
    DUNGEON_SITE:         { income: 1800, fieldSize: 380, baseTroops: 320 },
    DUNGEON_FRONTIER:     { income: 2000, fieldSize: 420, baseTroops: 420 },
    FRONTIER_PROVINCE:    { income: 2100, fieldSize: 620, baseTroops: 400 },
    PROVINCE:             { income: 1900, fieldSize: 640, baseTroops: 350 },
    BORDER_BARRIER:       { income: 2200, fieldSize: 480, baseTroops: 560 },
    DEMON_DOMAIN:         { income: 2600, fieldSize: 620, baseTroops: 660 },
    DEMON_FORTRESS:       { income: 2600, fieldSize: 580, baseTroops: 620 },
    OPTIONAL_MYSTIC_CITY: { income: 3500, fieldSize: 500, baseTroops: 480 },
    CREATOR_ENDGAME:      { income: 0,    fieldSize: 400, baseTroops: 999 }
  };

  const ZETH_TOWER_IDS = [
    "ter_adam_stronghold",
    "ter_tape",
    "ter_amber_city",
    "ter_old_zeth"
  ];

  // Scenario choice metadata (strategic, lore-focused, strictly safe)
  const SCENARIO_CHOICES = {
    evt_bandit_prologue_ruberan: {
      summary: "북동부 헬만 국경 유적에서 루베란 토벌대와 조우했다. 정면 돌파로 도적왕의 길을 택할 것인가, 전략적 퇴각 후 리자스 왕권을 장악할 것인가?",
      choices: [
        { label: "루베란 토벌대 정면 격파 (조기 엔딩: 도적왕)", hint: "즉시 end_bandit_king 달성" },
        { label: "전략적 후퇴 후 리자스 즉위 (본편 진입)", hint: "시일·소울 볼고 Z 수감, 리자스 내란 페이즈 시작" }
      ]
    },
    evt_ex_rebellion_suppression: {
      summary: "백군 반란 거점을 제압했다! 엑스 뱅큇의 처리와 인간계 확장 전략을 확정한다.",
      choices: [
        { label: "엑스를 리자스 군단 지휘관으로 등용한다", hint: "chr_ex 합류 + 인간계 자유 정복 개방" }
      ]
    },
    evt_volgo_z_soul_deadline: {
      summary: "볼고 Z 감옥의 소울 구출 작전! 기한(LP 3/08/3) 내 구출 여부가 도서관 바운드 영입 체인을 결정한다.",
      choices: [
        { label: "소울을 즉시 구출·합류시킨다", hint: "chr_soul 합류 + 도서관 바운드 체인 해금" }
      ]
    },
    evt_volgo_z_sill_deadline: {
      summary: "볼고 Z 감옥에서 시일 플라인을 구출했다! 진 엔딩(Bliss)과 제스 시즈카·나기 시나리오의 핵심 분기점이 열렸다.",
      choices: [
        { label: "시일을 리자스 지원군으로 복귀시킨다", hint: "chr_sill 합류 + Bliss 엔딩 조건 유지" }
      ]
    },
    evt_custom_annexation_bundle: {
      summary: "자유도시 커스텀을 제압·병합했다. 마리아 커스터드, 마소 시즈카, 미르 요크스가 리자스 군단에 합류를 제안한다.",
      choices: [
        { label: "커스텀 인재 일괄 합류 및 기술 협정 체결", hint: "마리아·시즈카·미르 합류 + 마리아 연구소 해금" }
      ]
    },
    evt_maria_tulip_100: {
      summary: "마리아 연구소의 궁극 로켓 프로젝트 '튤립 100호'가 완성되었다! 대륙 정복을 뒤로하고 우주로 출항할 것인가?",
      choices: [
        { label: "튤립 100호 발사! 우주로 떠난다", hint: "특수 엔딩 end_to_outer_space 달성" },
        { label: "발사를 보류하고 대륙 제패를 계속한다", hint: "마리아 사기 +15, 캠페인 지속" }
      ]
    },
    evt_helman_freya_sabotage: {
      summary: "헬만 흑익 수장 프레이야 이둔이 리자스 군자금 유출 및 보급 방해 공작을 펼치고 있다!",
      choices: [
        { label: "닌자 접착제 및 역매복 작전으로 프레이야 포획·등용", hint: "자금 유출 중단 + chr_freya 합류 (주간 닌자 +5)" },
        { label: "경계를 강화하고 정면 전쟁에 집중한다", hint: "공작 지속(매 턴 자금 소모)" }
      ]
    },
    evt_zeth_shizuka_duel_timer: {
      summary: "제스 개전 5주 경과! 시즈카와 숙적 나기의 결투가 발발했다. 시일의 지원과 전장 개입 여부가 두 마도사의 운명을 가른다.",
      choices: [
        { label: "시일과 합동 개입하여 시즈카를 엄호하고 나기를 설득한다", hint: "시즈카 안전 + chr_nagi 합류 (시일 생존 시 최선)" },
        { label: "결투를 관전하며 제스 전선 돌파를 우선한다", hint: "아담 선점령 시 시즈카 불행 위험" }
      ]
    },
    evt_zeth_four_towers_collapse: {
      summary: "제스 사천왕의 4대 원소 탑이 모두 붕괴했다! 제스 왕국의 잔여 영토가 리자스 왕국에 자동 편입된다.",
      choices: [
        { label: "제스 잔여 영토 병합 및 왕가 마도사 영입", hint: "제스 전 영토 편입 + 매직·간지 합류" }
      ]
    },
    evt_lake_sasa_haniwa_king: {
      summary: "사사호의 정령이 라질에서 얻은 '알루미늄 도끼'와 '황금 도끼'를 꺼내 들었다. 어느 쪽을 선택할 것인가?",
      choices: [
        { label: "정직하게 알루미늄 도끼를 선택한다", hint: "호저미궁 지하 66층 개방 (탐색 2회로 하니와 킹 영입)" },
        { label: "황금 도끼와 보물(8,000G)을 챙긴다", hint: "+8,000G 획득, 단 호저미궁 영구 폐쇄" }
      ]
    },
    evt_kanami_shinobu_assassination: {
      summary: "리자스 첩보대장 카나미의 누적 피로와 시노부 암살 첩보가 보고되었다. 닌자 군단의 처우를 결정하라.",
      choices: [
        { label: "카나미에게 휴식과 포상을 내려 암살 음모를 차단한다", hint: "카나미 신뢰 상승 · 행복 운명 확보" },
        { label: "가혹한 강행군을 강요한다 (암살 위험 경고!)", hint: "누적 시 코드/시노부 출현 → end_assassinated" }
      ]
    },
    evt_miki_kentarou_demon_king_crisis: {
      summary: "마왕의 그릇 미키(리틀 프린세스)와 수호자 켄타로 앞에 케이브리스의 포획 병기 Pi-R이 접근했다!",
      choices: [
        { label: "켄타로와 협력해 Pi-R을 격퇴하고 미키를 보호한다", hint: "켄타로·미키 안전 합류, 케이브리스 무적화 차단" },
        { label: "금기의 각성 의식을 발동시킨다 (마왕 엔딩 2)", hint: "즉시 end_demon_king_2 달성" },
        { label: "방어 병력을 철수시킨다 (위험: Pi-R 포획)", hint: "케이브리스 무적 마왕화 위험" }
      ]
    },
    evt_satella_proposal: {
      summary: "호넷파 마인 사테라가 마왕 계승 동맹을 제안했다. 제안을 수락할 것인가, 거절하고 미키 호위군으로 끌어들일 것인가?",
      choices: [
        { label: "제안을 거절하고 미키 수호를 조건으로 아군 합류를 유도한다", hint: "chr_satella 리자스군 합류" },
        { label: "사테라의 마왕 제안을 수락한다 (마왕 엔딩 1)", hint: "즉시 end_demon_king_1 달성" }
      ]
    },
    evt_kayblis_monster_realm_unification: {
      summary: "케이브리스가 호넷파를 제압하고 마계를 통일했다! 마지노선이 열리며 마인군 대침공 페이즈가 개시된다.",
      choices: [
        { label: "전 군단 마계 결전 태세 돌입!", hint: "MONSTER_REALM 페이즈 전환, 마지노선 개방" }
      ]
    },
    evt_warg_defection_and_chaos: {
      summary: "마인 와그 아카가 전향을 제안하며 창조신 루드라사움을 잠재울 몽환 최면 계획을 제시했다!",
      choices: [
        { label: "와그를 영입하고 마검 카오스·신상 결전 계획을 승인한다", hint: "chr_warg 합류 + 창조신 최면(Bliss/World King) 해금" }
      ]
    },
    evt_creator_phase_unlock: {
      summary: "루드라사움 유적 최심부에서 창조신 루드라사움과 대면했다! 대륙과 리자스의 최종 운명을 선택하라.",
      choices: [
        { label: "와그의 몽환 최면으로 창조신을 잠재운다 (와그 합류 필수)", hint: "시일 생존 시 진 엔딩(Bliss) / 부재 시 세계왕(World King)" },
        { label: "창조신의 혼돈 창조 제안에 동의한다", hint: "신의 종(Servant) 엔딩" },
        { label: "최면 없이 창조신에게 정면 도전한다", hint: "신(God) 유폐 엔딩" },
        { label: "리아 여왕과 리자스 왕권 수호 서약을 택한다 (시일 부재 분기)", hint: "리아/리자스 특수 분기 엔딩" }
      ]
    }
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function resolveData(data) {
    if (data && data.territories && data.factions) return data;
    if (root && root.RANCE_DATA) return root.RANCE_DATA;
    throw new Error("KichikuouRanceEngine: RANCE_DATA is required.");
  }

  // Deterministic LCG PRNG (Numerical Recipes constants)
  function nextRngFloat(state) {
    state.rngSeed = (Math.imul(state.rngSeed >>> 0, 1664525) + 1013904223) >>> 0;
    state.rngCallCount = (state.rngCallCount || 0) + 1;
    return state.rngSeed / 4294967296;
  }

  function nextRngInt(state, min, max) {
    if (max <= min) return min;
    return min + Math.floor(nextRngFloat(state) * (max - min + 1));
  }

  // Calendar helpers (LP Y/MM/W, 4 weeks/month, 12 months/year)
  function formatCalendar(cal) {
    const mm = String(cal.month).padStart(2, "0");
    return `LP ${cal.year}/${mm}/${cal.week}`;
  }

  function calendarToIndex(cal) {
    return (cal.year * 12 + (cal.month - 1)) * 4 + (cal.week - 1);
  }

  function compareCalendar(a, b) {
    return calendarToIndex(a) - calendarToIndex(b);
  }

  function advanceCalendar(cal) {
    let { year, month, week, totalWeeks } = cal;
    week += 1;
    totalWeeks += 1;
    if (week > 4) {
      week = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
    return { year, month, week, totalWeeks };
  }

  function addLog(state, type, text) {
    if (!Array.isArray(state.log)) state.log = [];
    state.log.unshift({
      turn: state.turn,
      calendar: formatCalendar(state.calendar),
      type,
      text
    });
    if (state.log.length > 80) state.log.length = 80;
  }

  function countAliveRecruitedNinjas(state) {
    let count = 0;
    for (const c of Object.values(state.commanders)) {
      if (c.recruited && c.alive && c.classId === "cls_ninjas") {
        count += 1;
      }
    }
    return count;
  }

  function computeWeeklySlots(state) {
    const aliveNinjas = countAliveRecruitedNinjas(state);
    return {
      city: 1,
      characterEvent: 1,
      talk: 1,
      reinforceOrDraft: 1,
      build: 1,
      explore: 1,
      ninja: aliveNinjas * 5,
      invasion: 1
    };
  }

  // Engine Contract 3.1: Smallest-Troop-First Turn Order
  function selectNextActor(units, actedSet) {
    const acted = actedSet instanceof Set ? actedSet : new Set(actedSet || []);
    const candidates = units.filter((u) => u.commanderHp > 0 && !acted.has(u.unitKey));
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (a.troops !== b.troops) return a.troops - b.troops;
      if (a.side !== b.side) return a.side === "PLAYER" ? -1 : 1;
      return a.slotIndex - b.slotIndex;
    });
    return candidates[0];
  }

  function getBattleTurnQueue(battle) {
    if (!battle || !Array.isArray(battle.units)) return [];
    const acted = new Set(battle.actedThisRound || []);
    const remaining = battle.units
      .filter((u) => u.commanderHp > 0 && !acted.has(u.unitKey))
      .slice();
    remaining.sort((a, b) => {
      if (a.troops !== b.troops) return a.troops - b.troops;
      if (a.side !== b.side) return a.side === "PLAYER" ? -1 : 1;
      return a.slotIndex - b.slotIndex;
    });
    return remaining;
  }

  // Engine Contract 3.2: Snipe Damage Formula (0..min(hardCap, floor(strikes / 5)))
  function resolveSnipeDamage(attacker, rngFloatFn, hardCap) {
    const cap = typeof hardCap === "number" ? hardCap : 6;
    const strikes = Math.max(0, attacker.strikes || 0);
    const maxRoll = Math.min(cap, Math.floor(strikes / 5));
    const r = Math.max(0, Math.min(0.9999999, rngFloatFn()));
    return Math.floor(r * (maxRoll + 1));
  }

  // Engine Contract 3.3: Creator Phase Unlock Check
  function checkCreatorPhaseUnlock(territoriesDef, ownersMap, kayblisDefeated) {
    if (!kayblisDefeated) return "CONTINUE";
    const allRequiredOwned = territoriesDef
      .filter((t) => t.countsForCreatorConquest)
      .every((t) => ownersMap[t.id] === "fac_leazas");
    return allRequiredOwned ? "CREATOR_PHASE" : "END_UNIFICATION";
  }

  function getOwnersMap(state) {
    const map = {};
    for (const [id, t] of Object.entries(state.territories)) {
      map[id] = t.owner;
    }
    return map;
  }

  function getClassMap(data) {
    const map = {};
    for (const cls of data.unitClasses) {
      map[cls.id] = cls;
    }
    return map;
  }

  function getTerritoryDefMap(data) {
    const map = {};
    for (const t of data.territories) {
      map[t.id] = t;
    }
    return map;
  }

  function queueScenario(state, eventId) {
    if (!state.completedScenarios.includes(eventId) && !state.activeScenarios.includes(eventId)) {
      state.activeScenarios.push(eventId);
    }
  }

  function completeScenario(state, eventId) {
    state.activeScenarios = state.activeScenarios.filter((id) => id !== eventId);
    if (!state.completedScenarios.includes(eventId)) {
      state.completedScenarios.push(eventId);
    }
  }

  function setEnding(state, data, endingId, reason) {
    if (state.endingId) return;
    const endingDef = data.endings.find((e) => e.id === endingId);
    state.endingId = endingId;
    state.endingReason = reason || (endingDef ? endingDef.conditionSummary : endingId);
    finalizeCharacterDestinies(state);
    addLog(
      state,
      "ending",
      `[엔딩 달성] ${endingDef ? endingDef.nameKr : endingId}: ${state.endingReason}`
    );
  }

  function finalizeCharacterDestinies(state) {
    for (const c of Object.values(state.commanders)) {
      if (!c.hasDestinyPair) continue;
      if (c.destinyFlag === "PENDING") {
        if (!c.alive || c.imprisoned || c.mistreatmentCount >= 2) {
          c.destinyFlag = "MISFORTUNE";
        } else if (c.recruited && c.trust >= 50) {
          c.destinyFlag = "FORTUNE";
        } else if (state.endingId === "end_bliss" && c.recruited) {
          c.destinyFlag = "FORTUNE";
        } else {
          c.destinyFlag = c.recruited ? "FORTUNE" : "MISFORTUNE";
        }
      }
    }
  }

  // Create Initial Deterministic WorldState
  function createInitialState(rawData, options) {
    const data = resolveData(rawData);
    const opts = options || {};
    const seed = typeof opts.seed === "number" ? (opts.seed >>> 0) : 19961219;
    const startPhase = opts.startPhase === "BANDIT_PROLOGUE" ? "BANDIT_PROLOGUE" : "LEAZAS_REBELLION";

    const classMap = getClassMap(data);

    const territories = {};
    for (const t of data.territories) {
      const econ = TERRITORY_ECONOMY[t.strategicType] || { income: 2000, fieldSize: 550, baseTroops: 380 };
      territories[t.id] = {
        id: t.id,
        nameKr: t.nameKr,
        nameEn: t.nameEn,
        region: t.region,
        strategicType: t.strategicType,
        countsForCreatorConquest: Boolean(t.countsForCreatorConquest),
        adjacentIds: t.adjacentIds.slice(),
        owner: t.initialOwnerFactionId,
        taxIncome: econ.income,
        fieldSize: econ.fieldSize,
        garrisonTroops: t.initialOwnerFactionId === "fac_leazas" ? 300 : econ.baseTroops,
        facilities: [],
        scouted: t.initialOwnerFactionId === "fac_leazas",
        sabotaged: false,
        dungeonCleared: 0,
        locked: t.id === "ter_rudrasaum_ruins"
      };
    }

    const factions = {};
    for (const f of data.factions) {
      factions[f.id] = {
        id: f.id,
        nameKr: f.nameKr,
        nameEn: f.nameEn,
        capitalTerritoryId: f.capitalTerritoryId,
        leaderCharacterId: f.leaderCharacterId,
        diplomaticStance: f.diplomaticStance,
        atWarWithPlayer: f.id === "fac_ex_rebellion",
        warStartTurn: f.id === "fac_ex_rebellion" ? 1 : null,
        defeated: false
      };
    }

    const commanders = {};
    for (const ch of data.characters) {
      const prof = COMMANDER_PROFILES[ch.id] || {
        hp: 16, troops: 350, maxTroops: 500, atk: 12, def: 12, mag: 10, spd: 12, strikes: 15, lv: 7, snipe: false
      };
      const cls = classMap[ch.unitClassId] || { preferredRow: "FRONT" };
      const recruited = Boolean(prof.startRecruited);
      const imprisoned = Boolean(prof.imprisonedAt);
      commanders[ch.id] = {
        id: ch.id,
        nameKr: ch.nameKr,
        nameEn: ch.nameEn,
        initialFactionId: ch.initialFactionId,
        classId: ch.unitClassId,
        homeTerritoryId: ch.homeTerritoryId,
        isPlayableSubordinate: Boolean(ch.isPlayableSubordinate),
        hasDestinyPair: Boolean(ch.hasDestinyPair),
        signatureSkill: ch.signatureSkill,
        recruitmentAndScenarioRole: ch.recruitmentAndScenarioRole,
        commanderHp: prof.hp,
        maxCommanderHp: prof.hp,
        troops: prof.troops,
        maxTroops: prof.maxTroops,
        atk: prof.atk,
        def: prof.def,
        mag: prof.mag,
        spd: prof.spd,
        strikes: prof.strikes,
        battleLv: prof.lv,
        hasSnipe: Boolean(prof.snipe),
        row: cls.preferredRow === "BACK" ? "BACK" : "FRONT",
        alive: true,
        recruited,
        captured: false,
        imprisoned,
        trust: recruited ? 55 : 20,
        mistreatmentCount: 0,
        destinyFlag: "PENDING"
      };
    }

    const state = {
      saveVersion: SAVE_VERSION,
      gameId: "kichikuou-rance",
      turn: 1,
      calendar: { year: 3, month: 4, week: 1, totalWeeks: 0 },
      campaignPhase: startPhase,
      gold: 18000,
      morale: 75,
      items: [],
      territories,
      factions,
      commanders,
      weeklySlots: null,
      timers: {
        volgoZSoul: { deadline: { year: 3, month: 8, week: 3 }, status: "ACTIVE" },
        volgoZSill: { deadline: { year: 4, month: 1, week: 3 }, status: "ACTIVE" },
        monsterRealmInvasion: { active: false, remainingWeeks: null, startedTurn: null },
        zethShizukaDuel: { active: false, remainingWeeks: 5, startedTurn: null },
        freyaSabotage: { active: false, ticks: 0 }
      },
      flags: {
        rebellionSuppressed: false,
        soulRescued: false,
        sillAlive: true,
        sillRescued: false,
        customAnnexed: false,
        mariaLabUnlocked: false,
        tulipProgress: 0,
        aluminumAxeOwned: false,
        sasaDungeonOpen: false,
        sasaDungeonLocked: false,
        sasaB66Clears: 0,
        freyaCountered: false,
        ninjaGlueOwned: false,
        adamConqueredBeforeTape: false,
        shizukaDuelResolved: false,
        zethTowersDefeated: 0,
        monsterRealmOpen: false,
        demonInvasionTriggered: false,
        kayblisDefeated: false,
        kayblisInvincible: false,
        mikiActive: false,
        chaosSwordOwned: false,
        godStatuesCount: 0,
        wargSleepUnlocked: false,
        creatorPhaseUnlocked: false,
        defeatedDemonsCount: 0,
        boundRecruited: false
      },
      activeScenarios: [],
      completedScenarios: [],
      activeBattle: null,
      endingId: null,
      endingReason: null,
      rngSeed: seed,
      rngCallCount: 0,
      log: []
    };

    state.weeklySlots = computeWeeklySlots(state);

    if (startPhase === "BANDIT_PROLOGUE") {
      queueScenario(state, "evt_bandit_prologue_ruberan");
      addLog(state, "scenario", "프롤로그 개시: 북동부 헬만 유적에서 루베란 토벌대와 대치 중이다.");
    } else {
      queueScenario(state, "evt_kanami_shinobu_assassination");
      addLog(
        state,
        "system",
        "LP 3/04/1 — 란스가 리자스 국왕으로 즉위했다! 먼저 '백군 반란 거점'을 진압해 인간계 자유 정복 페이즈를 개방하라."
      );
    }

    return state;
  }

  // Helper: Check if a territory is adjacent to player-owned territory
  function isAdjacentToPlayer(state, territoryId) {
    const t = state.territories[territoryId];
    if (!t) return false;
    return t.adjacentIds.some((adjId) => {
      const adj = state.territories[adjId];
      return adj && adj.owner === "fac_leazas";
    });
  }

  function canInvade(state, targetTerritoryId) {
    if (state.endingId) return { ok: false, error: "이미 엔딩이 달성되었습니다." };
    if (state.activeBattle) return { ok: false, error: "현재 진행 중인 전투를 먼저 종료해야 합니다." };
    if (state.weeklySlots.invasion <= 0) {
      return { ok: false, error: "이번 주 침공 슬롯을 이미 사용했습니다. 턴을 종료하세요." };
    }
    const t = state.territories[targetTerritoryId];
    if (!t) return { ok: false, error: "존재하지 않는 영토입니다." };
    if (t.owner === "fac_leazas") return { ok: false, error: "이미 리자스 왕국이 지배 중인 영토입니다." };
    if (t.locked) return { ok: false, error: "현재 페이즈에서는 진입이 잠긴 영토입니다." };

    if (state.campaignPhase === "BANDIT_PROLOGUE") {
      return { ok: false, error: "프롤로그 이벤트를 먼저 해결해야 본편 침공이 가능합니다." };
    }
    if (state.campaignPhase === "LEAZAS_REBELLION" && targetTerritoryId !== "ter_leazas_white_fort") {
      return { ok: false, error: "리자스 내란 진압 전에는 '백군 반란 거점'만 침공할 수 있습니다." };
    }
    if (t.region === "MONSTER_REALM" && !state.flags.monsterRealmOpen) {
      return { ok: false, error: "마지노선 너머 마계는 LP 3/09/4 이후 또는 인간계 통일 후 개방됩니다." };
    }
    if (!isAdjacentToPlayer(state, targetTerritoryId)) {
      return { ok: false, error: "리자스 인접 영토만 침공할 수 있습니다." };
    }
    return { ok: true };
  }

  // Build enemy garrison squad for target territory
  function buildEnemySquads(state, data, targetTerritoryId) {
    const ter = state.territories[targetTerritoryId];
    const classMap = getClassMap(data);
    const baseTroops = Math.max(80, Math.round(ter.garrisonTroops * (ter.sabotaged ? 0.7 : 1)));

    // Find canonical commanders residing in this territory who are not recruited by player and alive
    const residents = Object.values(state.commanders).filter(
      (c) =>
        c.homeTerritoryId === targetTerritoryId &&
        !c.recruited &&
        !c.imprisoned &&
        c.alive &&
        c.isPlayableSubordinate !== undefined &&
        c.id !== "chr_lia" &&
        c.id !== "chr_mulala"
    );

    const units = [];
    const maxSlots = Math.min(4, Math.max(2, residents.length + 1));

    // Place canonical residents first
    for (const c of residents) {
      if (units.length >= 4) break;
      const cls = classMap[c.classId] || { preferredRow: "FRONT", attackType: "DIRECT" };
      units.push({
        unitKey: `ENEMY_${c.id}`,
        characterId: c.id,
        nameKr: c.nameKr,
        side: "ENEMY",
        classId: c.classId,
        attackType: cls.attackType,
        canAttackFromBack: Boolean(cls.canAttackFromBack),
        triggersRetaliation: Boolean(cls.triggersRetaliation),
        preferredRow: cls.preferredRow,
        commanderHp: c.commanderHp,
        maxCommanderHp: c.maxCommanderHp,
        troops: Math.max(100, Math.round(c.troops * (ter.sabotaged ? 0.72 : 1))),
        maxTroops: c.maxTroops,
        atk: c.atk,
        def: c.def,
        mag: c.mag,
        strikes: c.strikes,
        battleLv: c.battleLv,
        hasSnipe: Boolean(c.hasSnipe),
        isWaitingForSpecial: false,
        isDefending: false
      });
    }

    // Fill with garrison squads up to maxSlots (at least 2 squads)
    const garrisonClassByOwner = {
      fac_ex_rebellion: "cls_leazas_knights",
      fac_free_cities: "cls_soldiers_militia",
      fac_helman: "cls_helman_knights",
      fac_zeth: "cls_mages",
      fac_al_church: "cls_clerics_support",
      fac_japan: "cls_archers",
      fac_demon_kayblis: "cls_demons",
      fac_demon_hornet: "cls_demons",
      fac_independent_ancient: "cls_hannies"
    };
    const defaultClassId = garrisonClassByOwner[ter.owner] || "cls_soldiers_militia";
    const defaultCls = classMap[defaultClassId] || classMap.cls_soldiers_militia;

    let idx = 1;
    while (units.length < maxSlots) {
      const isBackGarrison = units.length >= 2;
      const clsId = isBackGarrison && defaultCls.preferredRow === "FRONT" ? "cls_archers" : defaultClassId;
      const cls = classMap[clsId] || defaultCls;
      const tierMult = ter.region === "MONSTER_REALM" ? 1.35 : ter.region === "ZETH" || ter.region === "HELMAN" ? 1.12 : 0.92;
      const trp = Math.max(90, Math.round((baseTroops * (0.65 + idx * 0.14)) / Math.max(1, maxSlots - 0.5)));
      units.push({
        unitKey: `ENEMY_GAR_${targetTerritoryId}_${idx}`,
        characterId: `gar_${targetTerritoryId}_${idx}`,
        nameKr: `${ter.nameKr} 수비대 ${idx}`,
        side: "ENEMY",
        classId: cls.id,
        attackType: cls.attackType,
        canAttackFromBack: Boolean(cls.canAttackFromBack),
        triggersRetaliation: Boolean(cls.triggersRetaliation),
        preferredRow: cls.preferredRow,
        commanderHp: Math.round(11 * tierMult),
        maxCommanderHp: Math.round(11 * tierMult),
        troops: trp,
        maxTroops: trp,
        atk: Math.round(11 * tierMult),
        def: Math.round(10 * tierMult),
        mag: Math.round(10 * tierMult),
        strikes: Math.round(12 * tierMult),
        battleLv: Math.round(6 * tierMult),
        hasSnipe: false,
        isWaitingForSpecial: false,
        isDefending: false
      });
      idx += 1;
    }

    // Assign slots 0,1 = FRONT, 2,3 = BACK (put FRONT-preferred in front)
    units.sort((a, b) => (a.preferredRow === "FRONT" ? -1 : 1) - (b.preferredRow === "FRONT" ? -1 : 1));
    units.forEach((u, i) => {
      u.slotIndex = i;
      u.row = i < 2 ? "FRONT" : "BACK";
    });
    return units;
  }

  function startInvasion(state, rawData, targetTerritoryId, playerSquadIds) {
    const data = resolveData(rawData);
    const check = canInvade(state, targetTerritoryId);
    if (!check.ok) return { ok: false, error: check.error, state };

    const squadList = Array.isArray(playerSquadIds) ? playerSquadIds.slice(0, 4) : [];
    if (squadList.length === 0) {
      return { ok: false, error: "최소 1명 이상의 아군 지휘관을 편성해야 합니다.", state };
    }

    const classMap = getClassMap(data);
    const playerUnits = [];
    const seen = new Set();

    for (const entry of squadList) {
      const cid = typeof entry === "string" ? entry : entry.id;
      const requestedRow = typeof entry === "object" && entry.row ? entry.row : null;
      if (seen.has(cid)) continue;
      seen.add(cid);
      const c = state.commanders[cid];
      if (!c || !c.recruited || !c.alive || !c.isPlayableSubordinate) {
        return { ok: false, error: `출격 불가능한 지휘관입니다: ${cid}`, state };
      }
      const cls = classMap[c.classId] || { preferredRow: "FRONT", attackType: "DIRECT" };
      playerUnits.push({
        unitKey: `PLAYER_${c.id}`,
        characterId: c.id,
        nameKr: c.nameKr,
        side: "PLAYER",
        classId: c.classId,
        attackType: cls.attackType,
        canAttackFromBack: Boolean(cls.canAttackFromBack),
        triggersRetaliation: Boolean(cls.triggersRetaliation),
        preferredRow: requestedRow || c.row || cls.preferredRow,
        commanderHp: c.commanderHp,
        maxCommanderHp: c.maxCommanderHp,
        troops: c.troops,
        maxTroops: c.maxTroops,
        atk: c.atk,
        def: c.def,
        mag: c.mag,
        strikes: c.strikes,
        battleLv: c.battleLv,
        hasSnipe: Boolean(c.hasSnipe),
        isWaitingForSpecial: false,
        isDefending: false
      });
    }

    if (playerUnits.length === 0) {
      return { ok: false, error: "유효한 아군 지휘관이 없습니다.", state };
    }

    // Assign slots: FRONT (0, 1) and BACK (2, 3)
    const fronts = playerUnits.filter((u) => u.preferredRow === "FRONT");
    const backs = playerUnits.filter((u) => u.preferredRow !== "FRONT");
    const orderedPlayer = [];
    // Ensure at least 1 front-line unit if player has units
    while (fronts.length < 2 && backs.length > 0 && orderedPlayer.length < 2) {
      if (fronts.length === 0) {
        fronts.push(backs.shift());
      } else {
        break;
      }
    }
    const slotAssigned = [];
    fronts.slice(0, 2).forEach((u, i) => {
      u.slotIndex = i;
      u.row = "FRONT";
      slotAssigned.push(u);
    });
    const leftovers = fronts.slice(2).concat(backs);
    leftovers.forEach((u, idx) => {
      const slotIndex = slotAssigned.length < 2 ? slotAssigned.length : Math.min(3, 2 + idx);
      u.slotIndex = slotIndex;
      u.row = slotIndex < 2 ? "FRONT" : "BACK";
      slotAssigned.push(u);
    });
    // Ensure unique slot indices 0..3
    const usedSlots = new Set();
    for (const u of slotAssigned) {
      if (usedSlots.has(u.slotIndex)) {
        for (let s = 0; s < 4; s++) {
          if (!usedSlots.has(s)) {
            u.slotIndex = s;
            u.row = s < 2 ? "FRONT" : "BACK";
            break;
          }
        }
      }
      usedSlots.add(u.slotIndex);
    }

    const ter = state.territories[targetTerritoryId];
    const enemyUnits = buildEnemySquads(state, data, targetTerritoryId);

    // Mark war started with defending faction!
    const defenderFaction = state.factions[ter.owner];
    if (defenderFaction && !defenderFaction.atWarWithPlayer) {
      defenderFaction.atWarWithPlayer = true;
      defenderFaction.warStartTurn = state.turn;
      onWarDeclared(state, ter.owner);
    }

    const units = slotAssigned.concat(enemyUnits);
    const battle = {
      targetTerritoryId,
      targetNameKr: ter.nameKr,
      previousOwner: ter.owner,
      fieldSize: ter.fieldSize,
      intelBonus: ter.scouted ? 1.15 : 1.0,
      round: 1,
      units,
      actedThisRound: [],
      activeUnitKey: null,
      result: null,
      log: [
        `${ter.nameKr} 공략전 개시! (전투역: ${ter.fieldSize}명${ter.scouted ? " · 첩보 보너스 +15%" : ""})`
      ]
    };

    const nextActor = selectNextActor(battle.units, battle.actedThisRound);
    battle.activeUnitKey = nextActor ? nextActor.unitKey : null;
    state.activeBattle = battle;

    addLog(state, "battle", `${ter.nameKr} 침공 개시! 아군 ${slotAssigned.length}부대 출격.`);
    return { ok: true, state, battle };
  }

  function onWarDeclared(state, factionId) {
    if (factionId === "fac_helman" && !state.flags.freyaCountered) {
      state.timers.freyaSabotage.active = true;
      queueScenario(state, "evt_helman_freya_sabotage");
      addLog(state, "crisis", "[위기 발동] 헬만 제국 개전! 흑익 수장 프레이야의 자금 유출·공작이 시작되었다.");
    }
    if (factionId === "fac_zeth" && !state.timers.zethShizukaDuel.active && !state.flags.shizukaDuelResolved) {
      state.timers.zethShizukaDuel.active = true;
      state.timers.zethShizukaDuel.remainingWeeks = 5;
      state.timers.zethShizukaDuel.startedTurn = state.turn;
      addLog(state, "crisis", "[타이머 가동] 제스 왕국 개전! 5주 후 시즈카 결투 시나리오가 발동한다.");
    }
  }

  // Get valid enemy targets for a given battle action
  function getValidTargets(battle, actor, actionType) {
    const enemies = battle.units.filter((u) => u.side !== actor.side && u.commanderHp > 0);
    if (enemies.length === 0) return [];
    const frontEnemies = enemies.filter((u) => u.row === "FRONT");
    if (actionType === "attack") {
      return frontEnemies.length > 0 ? frontEnemies : enemies;
    }
    // ranged, magic, snipe can target ANY row (front or back!)
    return enemies;
  }

  function applyDamageToUnit(state, battle, attacker, target, mode) {
    const isDemonTarget = target.classId === "cls_demons";
    let troopLoss = 0;
    let hpLoss = 0;
    const notes = [];

    // Kayblis invincible guard if Pi-R captured Miki
    if (target.characterId === "chr_kayblis" && state.flags.kayblisInvincible) {
      return { troopLoss: 0, hpLoss: 0, ninjaProc: false, notes: ["무적 마왕 결계로 피해 무효!"] };
    }

    const fieldRatio = Math.min(1, Math.max(0.25, Math.min(Math.max(120, attacker.troops), battle.fieldSize) / 500));
    const defendMult = target.isDefending ? 0.5 : 1.0;
    const intelMult = attacker.side === "PLAYER" ? (battle.intelBonus || 1.0) : 1.0;
    const moraleMult = attacker.side === "PLAYER" ? 0.9 + (state.morale / 500) : 1.0;
    let demonBarrierMult = 1.0;
    if (isDemonTarget && attacker.side === "PLAYER") {
      const hasAntiDemon =
        state.flags.chaosSwordOwned ||
        attacker.characterId === "chr_kentarou" ||
        attacker.characterId === "chr_haniwa_king" ||
        mode === "snipe";
      demonBarrierMult = hasAntiDemon ? 1.0 : 0.45;
      if (!hasAntiDemon) notes.push("마인 결계 저항");
    }

    if (mode === "snipe") {
      // Exact canonical Snipe formula: ignores troops & fieldSize, hits commander HP directly!
      const roll = resolveSnipeDamage(attacker, () => nextRngFloat(state), 6);
      hpLoss = Math.max(1, Math.round(roll * (target.isDefending ? 0.7 : 1.0)));
      if (roll === 0) hpLoss = 0;
      troopLoss = 0;
      notes.push(`저격 직격(Strikes ${attacker.strikes}, 롤 ${roll})`);
    } else if (mode === "magic") {
      const raw = Math.max(4, attacker.mag * 1.3 - (target.mag * 0.5 + target.def * 0.25) + attacker.battleLv * 0.5);
      troopLoss = Math.round(raw * 9.0 * fieldRatio * defendMult * intelMult * moraleMult * demonBarrierMult);
      hpLoss = Math.max(1, Math.round((raw / 5.2) * defendMult * demonBarrierMult));
    } else if (mode === "ranged") {
      const raw = Math.max(4, attacker.atk * 1.25 - target.def * 0.5 + attacker.battleLv * 0.5);
      troopLoss = Math.round(raw * 8.5 * fieldRatio * defendMult * intelMult * moraleMult * demonBarrierMult);
      hpLoss = Math.max(1, Math.round((raw / 4.6) * defendMult * demonBarrierMult));
    } else {
      // Direct melee attack
      const raw = Math.max(5, attacker.atk * 1.4 - target.def * 0.65 + attacker.battleLv * 0.65);
      troopLoss = Math.round(raw * 10.5 * fieldRatio * defendMult * intelMult * moraleMult * demonBarrierMult);
      hpLoss = Math.max(1, Math.round((raw / 4.0) * defendMult * demonBarrierMult));
    }

    // Troops shield commander HP while standing (except Snipe, which bypasses troops!)
    if (mode !== "snipe" && target.troops > 0) {
      const actualTroopLoss = Math.min(target.troops, troopLoss);
      target.troops = Math.max(0, target.troops - actualTroopLoss);
      troopLoss = actualTroopLoss;
      if (target.troops > target.maxTroops * 0.35) {
        hpLoss = Math.min(3, Math.max(1, Math.round(hpLoss * 0.35)));
      } else if (target.troops > 0) {
        hpLoss = Math.max(1, Math.round(hpLoss * 0.6));
      } else {
        notes.push("병력 전멸! 지휘관 노출");
      }
    } else if (mode !== "snipe") {
      troopLoss = 0;
      hpLoss = Math.max(2, Math.round(hpLoss * 1.35));
    }

    target.commanderHp = Math.max(0, target.commanderHp - hpLoss);

    // Ninja Follow-up Rule (+1 fixed damage to enemy commander HP; Demons 100% immune!)
    let ninjaProc = false;
    if (attacker.side === "PLAYER" && target.commanderHp > 0 && countAliveRecruitedNinjas(state) > 0) {
      const procRoll = nextRngFloat(state);
      if (procRoll < 0.65) {
        if (isDemonTarget) {
          notes.push("닌자 추격 발동 → 마인 면역!");
        } else {
          target.commanderHp = Math.max(0, target.commanderHp - 1);
          ninjaProc = true;
          notes.push("닌자 추격(+1 HP)");
        }
      }
    }

    return { troopLoss, hpLoss, ninjaProc, notes };
  }

  function advanceBattleTurn(state, data) {
    const battle = state.activeBattle;
    if (!battle) return;

    // Check Rance death -> immediate end_death!
    const ranceUnit = battle.units.find((u) => u.side === "PLAYER" && u.characterId === "chr_rance");
    if (ranceUnit && ranceUnit.commanderHp <= 0) {
      battle.result = "DEFEAT";
      state.commanders.chr_rance.commanderHp = 0;
      state.commanders.chr_rance.alive = false;
      battle.log.push("[치명적 패배] 국왕 란스의 지휘관 HP가 0이 되어 전사했다!");
      setEnding(state, data, "end_death", "전투 중 지휘관 란스의 HP가 0에 도달해 전사했다.");
      state.activeBattle = null;
      return;
    }

    const alivePlayers = battle.units.filter((u) => u.side === "PLAYER" && u.commanderHp > 0);
    const aliveEnemies = battle.units.filter((u) => u.side === "ENEMY" && u.commanderHp > 0);

    if (aliveEnemies.length === 0) {
      concludeBattleVictory(state, data);
      return;
    }
    if (alivePlayers.length === 0) {
      concludeBattleDefeat(state, data);
      return;
    }

    let next = selectNextActor(battle.units, battle.actedThisRound);
    if (!next) {
      // Start new round
      battle.round += 1;
      battle.actedThisRound = [];
      for (const u of battle.units) {
        u.isDefending = false;
      }
      battle.log.push(`--- 제 ${battle.round} 라운드 개시 ---`);
      next = selectNextActor(battle.units, battle.actedThisRound);
    }
    battle.activeUnitKey = next ? next.unitKey : null;
  }

  function syncPlayerCommandersFromBattle(state, battle) {
    for (const u of battle.units) {
      if (u.side !== "PLAYER") continue;
      const c = state.commanders[u.characterId];
      if (!c) continue;
      c.commanderHp = u.commanderHp;
      c.troops = u.troops;
      if (u.commanderHp <= 0) {
        c.alive = false;
        c.recruited = false;
        c.destinyFlag = "MISFORTUNE";
        addLog(state, "loss", `[전사] 지휘관 ${c.nameKr}이(가) 전장에서 영구 소실되었다.`);
      } else {
        c.battleLv = Math.min(30, c.battleLv + 1);
      }
    }
  }

  function concludeBattleVictory(state, data) {
    const battle = state.activeBattle;
    battle.result = "VICTORY";
    syncPlayerCommandersFromBattle(state, battle);

    const tid = battle.targetTerritoryId;
    const prevOwner = battle.previousOwner;
    const ter = state.territories[tid];
    ter.owner = "fac_leazas";
    ter.garrisonTroops = 300;
    ter.scouted = true;
    ter.sabotaged = false;

    // Canonical rule: winning an invasion consumes the turn's invasion slot
    state.weeklySlots.invasion = 0;

    // Spoils of war
    const spoils = Math.round(ter.taxIncome * 0.75);
    state.gold += spoils;
    state.morale = Math.min(100, state.morale + 4);

    battle.log.push(`[승리] ${ter.nameKr} 점령 완료! 전리품 +${spoils.toLocaleString()}G`);
    addLog(state, "conquest", `${ter.nameKr} 점령 성공! (이전 세력: ${state.factions[prevOwner]?.nameKr || prevOwner}, +${spoils}G)`);

    // Check if any demon commander was defeated -> Demon kill halves remaining demon garrisons
    const killedDemons = battle.units.filter((u) => u.side === "ENEMY" && u.classId === "cls_demons" && u.commanderHp <= 0);
    if (killedDemons.length > 0) {
      state.flags.defeatedDemonsCount += killedDemons.length;
      const mult = state.flags.defeatedDemonsCount >= 2 ? 0.66 : 0.5;
      for (const dt of Object.values(state.territories)) {
        if (dt.region === "MONSTER_REALM" && dt.owner !== "fac_leazas") {
          dt.garrisonTroops = Math.max(180, Math.round(dt.garrisonTroops * mult));
        }
      }
      addLog(state, "battle", "[마인 격파 효과] 마인 격파로 마계 잔여 마군 병력이 급감했다!");
    }

    onTerritoryConquered(state, data, tid, prevOwner);
    state.activeBattle = null;
  }

  function concludeBattleDefeat(state, data) {
    const battle = state.activeBattle;
    battle.result = "DEFEAT";
    syncPlayerCommandersFromBattle(state, battle);
    state.weeklySlots.invasion = 0;
    state.morale = Math.max(15, state.morale - 8);
    addLog(state, "battle", `${battle.targetNameKr} 침공전 패배. 부대가 철수했다.`);
    state.activeBattle = null;
    evaluateEndings(state, data);
  }

  function executeBattleAction(state, rawData, action) {
    const data = resolveData(rawData);
    const battle = state.activeBattle;
    if (!battle || battle.result) {
      return { ok: false, error: "활성화된 전투가 없습니다.", state };
    }
    const act = action || {};
    if (act.type === "retreat") {
      battle.result = "RETREAT";
      syncPlayerCommandersFromBattle(state, battle);
      state.weeklySlots.invasion = 0;
      addLog(state, "battle", `${battle.targetNameKr} 전장에서 전략적 철수를 수행했다.`);
      state.activeBattle = null;
      return { ok: true, state, retreated: true };
    }

    const actor = battle.units.find((u) => u.unitKey === battle.activeUnitKey);
    if (!actor || actor.commanderHp <= 0) {
      advanceBattleTurn(state, data);
      return { ok: true, state };
    }

    const type = act.type || "attack";

    if (type === "defend") {
      actor.isDefending = true;
      battle.actedThisRound.push(actor.unitKey);
      battle.log.push(`${actor.nameKr} — 방어 태세! (피해 50% 경감)`);
      advanceBattleTurn(state, data);
      return { ok: true, state, actorKey: actor.unitKey, action: "defend" };
    }

    if (type === "wait") {
      actor.isWaitingForSpecial = true;
      battle.actedThisRound.push(actor.unitKey);
      battle.log.push(`${actor.nameKr} — 대기! 다음 행동에 필살기(저격) 사용 가능.`);
      advanceBattleTurn(state, data);
      return { ok: true, state, actorKey: actor.unitKey, action: "wait" };
    }

    // Validate row / class rules
    if (type === "attack" && actor.row === "BACK") {
      return { ok: false, error: "후열 부대는 직접 공격을 할 수 없습니다. 원거리/마법/대기를 사용하세요.", state };
    }
    if (type === "ranged" && !actor.canAttackFromBack) {
      return { ok: false, error: `${actor.nameKr}의 병종은 원거리 사격이 불가능합니다.`, state };
    }
    if (type === "magic" && !["MAGIC", "MAGIC_SUPPORT", "SPECIAL_MAGIC", "DEMON_HYBRID"].includes(actor.attackType)) {
      return { ok: false, error: `${actor.nameKr}의 병종은 마법 공격이 불가능합니다.`, state };
    }
    if (type === "snipe" && !actor.isWaitingForSpecial) {
      return { ok: false, error: "저격(필살기)을 사용하려면 먼저 '대기'로 기력을 모아야 합니다.", state };
    }

    const validTargets = getValidTargets(battle, actor, type);
    if (validTargets.length === 0) {
      advanceBattleTurn(state, data);
      return { ok: true, state };
    }

    let target = validTargets.find((t) => t.unitKey === act.targetUnitKey);
    if (!target) target = validTargets[0];

    if (type === "snipe") {
      actor.isWaitingForSpecial = false;
    }

    const res = applyDamageToUnit(state, battle, actor, target, type);
    const labelMap = { attack: "직접 공격", ranged: "원거리 사격", magic: "마법 포격", snipe: "필살 저격(Snipe)" };
    const extra = res.notes.length > 0 ? ` [${res.notes.join(", ")}]` : "";
    battle.log.push(
      `${actor.nameKr} → ${target.nameKr} ${labelMap[type] || type}: 병력 -${res.troopLoss}, HP -${res.hpLoss}${extra}`
    );

    // Magic AoE splash to other enemy squads (small tactical bonus)
    if (type === "magic") {
      const others = validTargets.filter((t) => t.unitKey !== target.unitKey && t.commanderHp > 0);
      for (const o of others) {
        const splashTroop = Math.min(o.troops, Math.round(res.troopLoss * 0.25));
        o.troops = Math.max(0, o.troops - splashTroop);
      }
      if (others.length > 0) {
        battle.log.push(`  ↳ 마법 광역 파동이 적 타 부대에도 피해를 입혔다.`);
      }
    }

    // Direct melee triggers retaliation if target survives!
    let retaliation = null;
    if (type === "attack" && actor.triggersRetaliation && target.commanderHp > 0 && target.row === "FRONT") {
      const retDmg = Math.max(3, target.atk * 0.85 - actor.def * 0.55);
      const retTroop = Math.min(actor.troops, Math.round(retDmg * 5.2 * (actor.isDefending ? 0.5 : 1)));
      const retHp = Math.max(1, Math.round((retDmg / 6.2) * (actor.isDefending ? 0.5 : 1)));
      actor.troops = Math.max(0, actor.troops - retTroop);
      actor.commanderHp = Math.max(0, actor.commanderHp - retHp);
      retaliation = { troopLoss: retTroop, hpLoss: retHp };
      battle.log.push(`  ↳ ${target.nameKr} 반격! ${actor.nameKr} 병력 -${retTroop}, HP -${retHp}`);
    }

    battle.actedThisRound.push(actor.unitKey);
    advanceBattleTurn(state, data);
    return { ok: true, state, actorKey: actor.unitKey, targetKey: target.unitKey, result: res, retaliation };
  }

  // Deterministic AI decision for an enemy or auto-battle unit
  function chooseAiBattleAction(battle, actor) {
    const pickTarget = (targets) => {
      if (!targets || targets.length === 0) return undefined;
      if (actor.side === "PLAYER") return targets[0].unitKey;
      // Enemy spreads pressure across front/valid defenders deterministically
      return targets[(battle.round + actor.slotIndex) % targets.length].unitKey;
    };
    if (actor.isWaitingForSpecial && actor.hasSnipe) {
      const targets = getValidTargets(battle, actor, "snipe");
      targets.sort((a, b) => a.commanderHp - b.commanderHp);
      return { type: "snipe", targetUnitKey: targets[0]?.unitKey };
    }
    if (actor.hasSnipe && !actor.isWaitingForSpecial && battle.round === 1 && actor.commanderHp > 8) {
      return { type: "wait" };
    }
    if (actor.row === "BACK") {
      if (["MAGIC", "MAGIC_SUPPORT", "SPECIAL_MAGIC", "DEMON_HYBRID"].includes(actor.attackType)) {
        const targets = getValidTargets(battle, actor, "magic");
        return { type: "magic", targetUnitKey: pickTarget(targets) };
      }
      if (actor.canAttackFromBack) {
        const targets = getValidTargets(battle, actor, "ranged");
        return { type: "ranged", targetUnitKey: pickTarget(targets) };
      }
      return { type: "defend" };
    }
    // Front row
    if (actor.classId === "cls_royal_guards" && actor.commanderHp < actor.maxCommanderHp * 0.45) {
      return { type: "defend" };
    }
    if (["MAGIC", "SPECIAL_MAGIC"].includes(actor.attackType)) {
      const targets = getValidTargets(battle, actor, "magic");
      return { type: "magic", targetUnitKey: pickTarget(targets) };
    }
    const targets = getValidTargets(battle, actor, "attack");
    return { type: "attack", targetUnitKey: pickTarget(targets) };
  }

  function stepBattleAiTurn(state, rawData) {
    const data = resolveData(rawData);
    const battle = state.activeBattle;
    if (!battle || battle.result) return { ok: false, error: "전투가 종료되었습니다.", state };
    const actor = battle.units.find((u) => u.unitKey === battle.activeUnitKey);
    if (!actor) return { ok: false, error: "행동할 부대가 없습니다.", state };
    const action = chooseAiBattleAction(battle, actor);
    return executeBattleAction(state, data, action);
  }

  function autoResolveBattle(state, rawData, maxSteps) {
    const data = resolveData(rawData);
    let steps = 0;
    const limit = maxSteps || 120;
    while (state.activeBattle && !state.endingId && steps < limit) {
      stepBattleAiTurn(state, data);
      steps += 1;
    }
    return { ok: true, state, steps };
  }

  // Hook: Territory conquered -> triggers character scenarios, recruitments, faction collapses!
  function onTerritoryConquered(state, data, territoryId, previousOwner) {
    // 1. Ex Rebellion suppression
    if (territoryId === "ter_leazas_white_fort" && !state.flags.rebellionSuppressed) {
      state.flags.rebellionSuppressed = true;
      state.campaignPhase = "HUMAN_REALM";
      state.factions.fac_ex_rebellion.defeated = true;
      state.commanders.chr_ex.recruited = true;
      state.commanders.chr_ex.alive = true;
      state.commanders.chr_ex.commanderHp = state.commanders.chr_ex.maxCommanderHp;

      // Start Demon Invasion timer: 69 weeks if Shangri-La conquered, 73 weeks otherwise
      const shangriOwned = state.territories.ter_shangri_la.owner === "fac_leazas";
      state.timers.monsterRealmInvasion = {
        active: true,
        remainingWeeks: shangriOwned ? 69 : 73,
        startedTurn: state.turn
      };
      completeScenario(state, "evt_ex_rebellion_suppression");
      addLog(
        state,
        "scenario",
        `[페이즈 전환] 백군 반란 진압 완료! 엑스 합류 · 인간계 자유 정복 개방 · 마인 침공 카운트다운(${state.timers.monsterRealmInvasion.remainingWeeks}주) 가동!`
      );
    }

    // 2. Volgo Z rescue deadlines (Soul & Sill)
    if (territoryId === "ter_volgo_z") {
      if (state.timers.volgoZSoul.status === "ACTIVE" && compareCalendar(state.calendar, state.timers.volgoZSoul.deadline) <= 0) {
        state.timers.volgoZSoul.status = "RESCUED";
        state.flags.soulRescued = true;
        state.commanders.chr_soul.imprisoned = false;
        state.commanders.chr_soul.recruited = true;
        state.commanders.chr_soul.alive = true;
        completeScenario(state, "evt_volgo_z_soul_deadline");
        addLog(state, "scenario", "[구출 성공] 볼고 Z에서 소울을 기한 내 구출! 도서관 건설 시 바운드 영입 가능.");
      }
      if (state.timers.volgoZSill.status === "ACTIVE" && compareCalendar(state.calendar, state.timers.volgoZSill.deadline) <= 0) {
        state.timers.volgoZSill.status = "RESCUED";
        state.flags.sillRescued = true;
        state.flags.sillAlive = true;
        state.commanders.chr_sill.imprisoned = false;
        state.commanders.chr_sill.recruited = true;
        state.commanders.chr_sill.alive = true;
        state.commanders.chr_sill.destinyFlag = "FORTUNE";
        completeScenario(state, "evt_volgo_z_sill_deadline");
        addLog(state, "scenario", "[구출 성공] 볼고 Z에서 시일 플라인 구출! 진 엔딩(Bliss) 경로가 유지된다.");
      }
    }

    // 3. Free City Custom annexation bundle
    if (territoryId === "ter_custom" && !state.flags.customAnnexed) {
      queueScenario(state, "evt_custom_annexation_bundle");
      // Also recruit immediately if auto-bundle or let player resolve; let's auto-recruit core bundle AND mark scenario!
      state.flags.customAnnexed = true;
      state.flags.mariaLabUnlocked = true;
      for (const cid of ["chr_maria", "chr_shizuka", "chr_miru"]) {
        if (state.commanders[cid] && state.commanders[cid].alive) {
          state.commanders[cid].recruited = true;
        }
      }
      completeScenario(state, "evt_custom_annexation_bundle");
      addLog(state, "scenario", "[커스텀 병합] 마리아·시즈카·미르가 리자스군에 일괄 합류! 수도에 '마리아 연구소' 건설 해금.");
    }

    // 4. Ice -> Kentarou & Miki event trigger
    if (territoryId === "ter_ice" && !state.flags.mikiActive) {
      state.flags.mikiActive = true;
      queueScenario(state, "evt_miki_kentarou_demon_king_crisis");
      addLog(state, "scenario", "[자유도시 아이스] 켄타로와 미키(리틀 프린세스) 시나리오가 활성화되었다.");
    }

    // 5. Helman capital Lang Bau -> recruit Sheila, Hunty, Patton, Freak
    if (territoryId === "ter_lang_bau") {
      for (const cid of ["chr_sheila", "chr_hunty", "chr_patton", "chr_freak"]) {
        const c = state.commanders[cid];
        if (c && c.alive && !c.recruited) {
          c.recruited = true;
          c.commanderHp = c.maxCommanderHp;
        }
      }
      addLog(state, "scenario", "[헬만 제도 함락] 실라·헌티·패튼·프리크가 리자스군 휘하로 편입되었다!");
    }

    // 6. JAPAN mainland -> recruit Isoroku
    if (territoryId === "ter_japan_main") {
      const iso = state.commanders.chr_isoroku;
      if (iso && iso.alive && !iso.recruited) {
        iso.recruited = true;
        iso.commanderHp = iso.maxCommanderHp;
        addLog(state, "scenario", "[JAPAN 합류] 명궁 야마모토 이소로쿠가 리자스 원거리 부대로 합류했다!");
      }
    }

    // 7. Zeth conquest order & 4 Towers collapse
    if (territoryId === "ter_adam_stronghold" && state.territories.ter_tape.owner !== "fac_leazas") {
      state.flags.adamConqueredBeforeTape = true;
    }
    if (ZETH_TOWER_IDS.includes(territoryId)) {
      const ownedTowers = ZETH_TOWER_IDS.filter((id) => state.territories[id].owner === "fac_leazas").length;
      state.flags.zethTowersDefeated = ownedTowers;
      if (ownedTowers === 4 && !state.completedScenarios.includes("evt_zeth_four_towers_collapse")) {
        // Automatic Zeth collapse: all remaining fac_zeth territories transfer!
        for (const t of Object.values(state.territories)) {
          if (t.owner === "fac_zeth") {
            t.owner = "fac_leazas";
            t.scouted = true;
          }
        }
        state.factions.fac_zeth.defeated = true;
        for (const cid of ["chr_magic", "chr_gandhi", "chr_chizuko"]) {
          const c = state.commanders[cid];
          if (c && c.alive) {
            c.recruited = true;
            c.commanderHp = c.maxCommanderHp;
          }
        }
        completeScenario(state, "evt_zeth_four_towers_collapse");
        addLog(state, "scenario", "[제스 4탑 붕괴] 사천왕 4탑 함락으로 제스 왕국 잔여 영토가 자동 병합되었다! (매직·간지·치즈코 합류)");
      }
    }

    // 8. Demon Frontier / Hornet Castle -> unlock Warg & Satella branches
    if (territoryId === "ter_demon_frontier") {
      queueScenario(state, "evt_warg_defection_and_chaos");
      addLog(state, "scenario", "[마계 전선 돌파] 마인 와그 아카 전향 시나리오가 열렸다!");
    }
    if (territoryId === "ter_hornet_castle") {
      queueScenario(state, "evt_satella_proposal");
      addLog(state, "scenario", "[호넷 거점 제압] 마인 사테라의 제안 시나리오가 활성화되었다.");
    }

    // 9. Check if Human Realm unified -> open Monster Realm
    const humanRemaining = Object.values(state.territories).filter(
      (t) => !["MONSTER_REALM", "CREATOR_REALM", "SPECIAL"].includes(t.region) && t.owner !== "fac_leazas"
    ).length;
    if (humanRemaining === 0 && !state.flags.monsterRealmOpen) {
      triggerMonsterRealmPhase(state, "인간계 대륙 통일 완료! 마지노선 너머 마계 원정이 개방되었다.");
    }

    // 10. Sulphur Forest (Kayblis defeated!) -> Creator Phase vs Unification Ending!
    if (territoryId === "ter_sulphur_forest") {
      state.flags.kayblisDefeated = true;
      state.factions.fac_demon_kayblis.defeated = true;
      const verdict = checkCreatorPhaseUnlock(data.territories, getOwnersMap(state), true);
      if (verdict === "CREATOR_PHASE") {
        state.campaignPhase = "CREATOR_PHASE";
        state.flags.creatorPhaseUnlocked = true;
        state.territories.ter_rudrasaum_ruins.locked = false;
        queueScenario(state, "evt_creator_phase_unlock");
        addLog(
          state,
          "scenario",
          "[창조신 페이즈 해금!] 전 대륙(샹그릴라 제외) 정복 후 케이브리스 격파! 루드라사움 유적이 개방되었다."
        );
      } else {
        completeScenario(state, "evt_creator_phase_unlock");
        setEnding(
          state,
          data,
          "end_unification",
          "미점령 영토가 남은 상태에서 유황의 숲 케이브리스를 격파하여 대륙 통일 엔딩에 도달했다."
        );
      }
    }

    // Check if previousOwner lost all territories
    if (previousOwner && state.factions[previousOwner]) {
      const stillOwned = Object.values(state.territories).some((t) => t.owner === previousOwner);
      if (!stillOwned) {
        state.factions[previousOwner].defeated = true;
      }
    }
  }

  function triggerMonsterRealmPhase(state, reasonText) {
    if (state.flags.demonInvasionTriggered) return;
    state.flags.monsterRealmOpen = true;
    state.flags.demonInvasionTriggered = true;
    if (state.campaignPhase !== "CREATOR_PHASE") {
      state.campaignPhase = "MONSTER_REALM";
    }
    state.factions.fac_demon_kayblis.atWarWithPlayer = true;
    state.factions.fac_demon_kayblis.warStartTurn = state.turn;
    // Kayblis subjugates Hornet faction
    if (state.territories.ter_hornet_castle.owner === "fac_demon_hornet") {
      state.territories.ter_hornet_castle.owner = "fac_demon_kayblis";
    }
    state.factions.fac_demon_hornet.defeated = true;
    // If West Helman still owned by Helman (not player), Demon Army takes it first!
    if (state.territories.ter_helman_west.owner === "fac_helman") {
      state.territories.ter_helman_west.owner = "fac_demon_kayblis";
      state.territories.ter_helman_west.garrisonTroops = 640;
    }
    completeScenario(state, "evt_kayblis_monster_realm_unification");
    addLog(state, "crisis", `[마계 통일·대침공] ${reasonText}`);
  }

  // ==================== WEEKLY COMMAND ACTIONS ====================

  function runCityAction(state, rawData, territoryId, mode) {
    resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 도시 액션을 사용할 수 없습니다.", state };
    if (state.weeklySlots.city <= 0) return { ok: false, error: "이번 주 도시 액션 슬롯을 이미 사용했습니다.", state };

    const ter = state.territories[territoryId];
    if (!ter || ter.owner !== "fac_leazas") {
      return { ok: false, error: "리자스 왕국이 점령한 도시에서만 도시 액션을 실행할 수 있습니다.", state };
    }

    const actionMode = mode || "tax";
    state.weeklySlots.city -= 1;

    if (actionMode === "buy_ninja_glue") {
      if (state.gold < 2000) {
        state.weeklySlots.city += 1;
        return { ok: false, error: "닌자 접착제 구매에 2,000G가 필요합니다.", state };
      }
      state.gold -= 2000;
      state.flags.ninjaGlueOwned = true;
      if (!state.items.includes("ninja_glue")) state.items.push("ninja_glue");
      if (state.timers.freyaSabotage.active) {
        state.timers.freyaSabotage.active = false;
        state.flags.freyaCountered = true;
        state.commanders.chr_freya.recruited = true;
        state.commanders.chr_freya.alive = true;
        state.weeklySlots.ninja += 5;
        completeScenario(state, "evt_helman_freya_sabotage");
        addLog(state, "scenario", "[공작 저지] 닌자 접착제로 프레이야를 포획·등용했다! (주간 닌자 +5)");
        return { ok: true, state, summary: "프레이야 포획 및 아군 등용 완료!" };
      }
      addLog(state, "city", `${ter.nameKr}에서 닌자 접착제(-2,000G)를 확보했다.`);
      return { ok: true, state, summary: "닌자 접착제 구매 완료" };
    }

    if (actionMode === "counter_freya" && state.timers.freyaSabotage.active) {
      state.timers.freyaSabotage.active = false;
      state.flags.freyaCountered = true;
      state.commanders.chr_freya.recruited = true;
      state.commanders.chr_freya.alive = true;
      state.weeklySlots.ninja += 5;
      completeScenario(state, "evt_helman_freya_sabotage");
      addLog(state, "scenario", `[프레이야 저지] ${ter.nameKr} 순찰로 흑익 공작을 분쇄하고 프레이야를 영입했다!`);
      return { ok: true, state, summary: "프레이야 공작 저지 및 합류!" };
    }

    // Default: Zero-penalty taxation!
    const hasLibrary = state.territories.ter_leazas_castle.facilities.includes("library");
    const mult = hasLibrary ? 1.15 : 1.0;
    const collected = Math.round(ter.taxIncome * mult);
    state.gold += collected;
    state.morale = Math.min(100, state.morale + 2);

    let extraNote = "";
    if (territoryId === "ter_radil" && !state.flags.aluminumAxeOwned) {
      state.flags.aluminumAxeOwned = true;
      if (!state.items.includes("aluminum_axe")) state.items.push("aluminum_axe");
      queueScenario(state, "evt_lake_sasa_haniwa_king");
      extraNote = " + 특수 아이템 [알루미늄 도끼] 획득! (사사호 호저미궁 이벤트 해금)";
    }

    addLog(state, "city", `${ter.nameKr} 무패널티 징세 완료: +${collected.toLocaleString()}G, 사기 +2${extraNote}`);
    return { ok: true, state, goldGained: collected, summary: `+${collected.toLocaleString()}G 징수${extraNote}` };
  }

  function runBuildFacility(state, rawData, territoryId, facilityType) {
    resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 건설할 수 없습니다.", state };
    if (state.weeklySlots.build <= 0) return { ok: false, error: "이번 주 건설 슬롯을 이미 사용했습니다.", state };

    const ter = state.territories[territoryId];
    if (!ter || ter.owner !== "fac_leazas") {
      return { ok: false, error: "아군 영토에만 시설을 건설할 수 있습니다.", state };
    }
    const def = FACILITIES[facilityType];
    if (!def) return { ok: false, error: `알 수 없는 시설 유형입니다: ${facilityType}`, state };
    if (ter.facilities.includes(facilityType)) {
      return { ok: false, error: `${ter.nameKr}에 이미 ${def.nameKr}이(가) 건설되어 있습니다.`, state };
    }
    if (def.requiresRecruited && !state.commanders[def.requiresRecruited]?.recruited) {
      return { ok: false, error: `${def.nameKr} 건설을 위해 먼저 커스텀 병합(마리아 영입)이 필요합니다.`, state };
    }
    if (state.gold < def.cost) {
      return { ok: false, error: `자금이 부족합니다. (필요: ${def.cost.toLocaleString()}G)`, state };
    }

    state.gold -= def.cost;
    state.weeklySlots.build -= 1;
    ter.facilities.push(facilityType);

    let bonusMsg = "";
    if (facilityType === "magic_lab") {
      for (const c of Object.values(state.commanders)) {
        if (["cls_mages", "cls_kalars", "cls_clerics_support"].includes(c.classId)) {
          c.mag += 4;
        }
      }
      bonusMsg = " (마법·지원 계열 지휘관 MAG +4)";
    } else if (facilityType === "library" && state.flags.soulRescued && !state.flags.boundRecruited) {
      state.flags.boundRecruited = true;
      state.morale = Math.min(100, state.morale + 8);
      bonusMsg = " (소울 구출 연계: 바운드 영입 체인 달성! 사기 +8)";
    } else if (facilityType === "maria_lab") {
      state.flags.tulipProgress = Math.min(100, state.flags.tulipProgress + 30);
      bonusMsg = ` (튤립 100호 개발 착수: ${state.flags.tulipProgress}%)`;
    }

    addLog(state, "build", `${ter.nameKr}에 [${def.nameKr}] 건설 완료 (-${def.cost.toLocaleString()}G)${bonusMsg}`);
    return { ok: true, state, summary: `${def.nameKr} 건설 완료${bonusMsg}` };
  }

  function runReinforce(state, rawData, commanderId) {
    resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 보충할 수 없습니다.", state };
    if (state.weeklySlots.reinforceOrDraft <= 0) {
      return { ok: false, error: "이번 주 증원/보충 슬롯(택1)을 이미 사용했습니다.", state };
    }
    const c = state.commanders[commanderId];
    if (!c || !c.recruited || !c.alive || !c.isPlayableSubordinate) {
      return { ok: false, error: "보충할 수 없는 지휘관입니다.", state };
    }
    const missingTroops = Math.max(0, c.maxTroops - c.troops);
    const missingHp = Math.max(0, c.maxCommanderHp - c.commanderHp);
    if (missingTroops === 0 && missingHp === 0) {
      return { ok: false, error: `${c.nameKr} 부대는 이미 최대 병력 및 체력 상태입니다.`, state };
    }
    const cost = Math.max(1000, Math.round(missingTroops * 6 + missingHp * 180));
    if (state.gold < cost) {
      return { ok: false, error: `자금이 부족합니다. (필요: ${cost.toLocaleString()}G)`, state };
    }

    state.gold -= cost;
    state.weeklySlots.reinforceOrDraft -= 1;
    c.troops = c.maxTroops;
    c.commanderHp = c.maxCommanderHp;
    addLog(state, "troops", `${c.nameKr} 부대 손실 보충 완료 (병력 ${c.troops}, HP ${c.commanderHp}, -${cost.toLocaleString()}G)`);
    return { ok: true, state, cost, summary: `${c.nameKr} 완편 보충 완료` };
  }

  function runDraft(state, rawData, commanderId) {
    resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 증원할 수 없습니다.", state };
    if (state.weeklySlots.reinforceOrDraft <= 0) {
      return { ok: false, error: "이번 주 증원/보충 슬롯(택1)을 이미 사용했습니다.", state };
    }
    const c = state.commanders[commanderId];
    if (!c || !c.recruited || !c.alive || !c.isPlayableSubordinate) {
      return { ok: false, error: "증원할 수 없는 지휘관입니다.", state };
    }
    const eliteClasses = ["cls_leazas_knights", "cls_helman_knights", "cls_artillery_tech", "cls_demons"];
    const cost = eliteClasses.includes(c.classId) ? 4500 : 2800;
    if (state.gold < cost) {
      return { ok: false, error: `자금이 부족합니다. (필요: ${cost.toLocaleString()}G)`, state };
    }

    state.gold -= cost;
    state.weeklySlots.reinforceOrDraft -= 1;
    c.maxTroops += 150;
    c.troops += 150;
    addLog(state, "troops", `${c.nameKr} 최대 병력 증원 (+150 → ${c.troops}/${c.maxTroops}, -${cost.toLocaleString()}G)`);
    return { ok: true, state, cost, summary: `${c.nameKr} 최대 병력 +150 증원` };
  }

  function runTalk(state, rawData, commanderId) {
    resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 대화할 수 없습니다.", state };
    if (state.weeklySlots.talk <= 0) return { ok: false, error: "이번 주 부하 대화 슬롯을 이미 사용했습니다.", state };

    const c = state.commanders[commanderId];
    if (!c || (!c.recruited && c.id !== "chr_lia") || !c.alive) {
      return { ok: false, error: "대화할 수 없는 캐릭터입니다.", state };
    }

    state.weeklySlots.talk -= 1;
    c.trust = Math.min(100, c.trust + 20);
    c.strikes = Math.min(35, c.strikes + 2);
    state.morale = Math.min(100, state.morale + 3);

    let extra = "";
    if (c.hasDestinyPair && c.trust >= 70 && c.destinyFlag === "PENDING") {
      c.destinyFlag = "FORTUNE";
      extra += ` · [${c.nameKr}] 행복 운명(FORTUNE) 플래그 달성!`;
    }
    if (c.id === "chr_kanami") {
      c.mistreatmentCount = Math.max(0, c.mistreatmentCount - 1);
      extra += " · 암살 위기 경감";
    }
    if (c.id === "chr_maria" && state.territories.ter_leazas_castle.facilities.includes("maria_lab")) {
      state.flags.tulipProgress = Math.min(100, state.flags.tulipProgress + 35);
      extra += ` · 튤립 100호 진척도 ${state.flags.tulipProgress}%`;
      if (state.flags.tulipProgress >= 100) {
        queueScenario(state, "evt_maria_tulip_100");
        extra += " (발사 이벤트 해금!)";
      }
    }
    if (c.id === "chr_warg" && state.flags.chaosSwordOwned && state.flags.godStatuesCount >= 3) {
      state.flags.wargSleepUnlocked = true;
      extra += " · 창조신 몽환 최면 준비 완료!";
    }

    addLog(state, "talk", `${c.nameKr}와(과) 전략 회담 (신뢰 ${c.trust}, 타격수 ${c.strikes})${extra}`);
    return { ok: true, state, summary: `${c.nameKr} 신뢰 +20${extra}` };
  }

  function runExplore(state, rawData, territoryId) {
    const data = resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 탐색할 수 없습니다.", state };
    if (state.weeklySlots.explore <= 0) return { ok: false, error: "이번 주 탐색 슬롯을 이미 사용했습니다.", state };

    const ter = state.territories[territoryId];
    if (!ter) return { ok: false, error: "존재하지 않는 영토입니다.", state };
    const canVisitCreator = territoryId === "ter_rudrasaum_ruins" && state.campaignPhase === "CREATOR_PHASE";
    if (ter.owner !== "fac_leazas" && !canVisitCreator) {
      return { ok: false, error: "점령한 아군 영토(또는 개방된 루드라사움 유적)만 탐색할 수 있습니다.", state };
    }

    state.weeklySlots.explore -= 1;
    ter.dungeonCleared += 1;

    // Creator Ruins final confrontation!
    if (canVisitCreator) {
      queueScenario(state, "evt_creator_phase_unlock");
      addLog(state, "scenario", "[루드라사움 유적] 신의 미궁 최심부 도달! 창조신 대면 시나리오가 활성화되었다.");
      return { ok: true, state, summary: "창조신 루드라사움 대면 시나리오 활성화!" };
    }

    // Lake Sasa B66F Haniwa King chain!
    if (territoryId === "ter_sasa_lake") {
      if (state.flags.sasaDungeonLocked) {
        addLog(state, "explore", "사사호 호저미궁은 황금 도끼 선택으로 영구 폐쇄되어 있다.");
        return { ok: true, state, summary: "호저미궁 영구 폐쇄 상태" };
      }
      if (!state.flags.sasaDungeonOpen && state.flags.aluminumAxeOwned) {
        queueScenario(state, "evt_lake_sasa_haniwa_king");
        addLog(state, "scenario", "[사사호] 알루미늄 도끼 선택 이벤트가 발생했다! 시나리오 패널에서 선택하라.");
        return { ok: true, state, summary: "알루미늄 도끼 시나리오 활성화!" };
      }
      if (state.flags.sasaDungeonOpen) {
        state.flags.sasaB66Clears += 1;
        if (state.flags.sasaB66Clears >= 2 && !state.commanders.chr_haniwa_king.recruited) {
          state.commanders.chr_haniwa_king.recruited = true;
          state.commanders.chr_haniwa_king.alive = true;
          completeScenario(state, "evt_lake_sasa_haniwa_king");
          addLog(state, "scenario", "[비밀 유닛 합류!] 호저미궁 지하 66층 2회 답파로 '하니와 킹'이 합류했다!");
          return { ok: true, state, summary: "비밀 지휘관 [하니와 킹] 영입 완료!" };
        }
        addLog(state, "explore", `사사호 호저미궁 지하 66층 1차 답파 완료 (${state.flags.sasaB66Clears}/2). 1회 더 탐색하면 하니와 킹 합류!`);
        return { ok: true, state, summary: `지하 66층 답파 (${state.flags.sasaB66Clears}/2)` };
      }
    }

    // Chaos Sword & God Statues discovery in key dungeon/holy territories
    if (!state.flags.chaosSwordOwned && ["ter_zeth_west", "ter_demon_frontier", "ter_helman_central"].includes(territoryId)) {
      state.flags.chaosSwordOwned = true;
      if (!state.items.includes("chaos_sword")) state.items.push("chaos_sword");
      state.commanders.chr_rance.atk += 5;
      addLog(state, "explore", `[전설 무기 획득!] ${ter.nameKr} 미궁에서 마검 [카오스] 발견! (란스 ATK +5, 마인 결계 돌파)`);
      return { ok: true, state, summary: "마검 카오스 획득! (마인 결계 무효화)" };
    }

    if (state.flags.godStatuesCount < 3 && ["ter_al_hq", "ter_zeth_west", "ter_shangri_la", "ter_old_zeth", "ter_lang_bau"].includes(territoryId)) {
      state.flags.godStatuesCount += 1;
      if (state.flags.godStatuesCount >= 3 && !state.items.includes("god_statues")) {
        state.items.push("god_statues");
      }
      addLog(state, "explore", `[신상 수집] ${ter.nameKr} 탐색으로 고대 신상 확보 (${state.flags.godStatuesCount}/3).`);
      return { ok: true, state, summary: `고대 신상 확보 (${state.flags.godStatuesCount}/3)` };
    }

    // General dungeon expedition reward
    const rewardGold = nextRngInt(state, 2400, 4200);
    state.gold += rewardGold;
    state.commanders.chr_rance.battleLv = Math.min(30, state.commanders.chr_rance.battleLv + 1);
    state.commanders.chr_rance.strikes = Math.min(35, state.commanders.chr_rance.strikes + 1);
    addLog(state, "explore", `${ter.nameKr} 미궁 원정 완료: 보물 +${rewardGold.toLocaleString()}G, 란스 전투 LV +1`);
    return { ok: true, state, goldGained: rewardGold, summary: `미궁 보물 +${rewardGold.toLocaleString()}G` };
  }

  function runNinjaAction(state, rawData, targetTerritoryId, mode) {
    resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 완료되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "전투 중에는 닌자 공작을 실행할 수 없습니다.", state };
    if (state.weeklySlots.ninja <= 0) return { ok: false, error: "이번 주 닌자 공작 횟수를 모두 소진했습니다.", state };

    const ter = state.territories[targetTerritoryId];
    if (!ter || ter.owner === "fac_leazas") {
      return { ok: false, error: "적 세력 영토에만 닌자를 파견할 수 있습니다.", state };
    }

    const op = mode === "sabotage" ? "sabotage" : "scout";
    state.weeklySlots.ninja -= 1;
    const roll = nextRngFloat(state);

    if (op === "scout") {
      // Canonical: Scouting has near-zero fail rate
      if (roll < 0.96) {
        ter.scouted = true;
        addLog(state, "ninja", `[닌자 정찰 성공] ${ter.nameKr} 수비 병력(${ter.garrisonTroops}) 파악! 침공 시 +15% 첩보 보정.`);
        return { ok: true, state, success: true, mode: "scout", summary: `${ter.nameKr} 정찰 완료 (+15% 첩보 보정)` };
      }
      addLog(state, "ninja", `[닌자 정찰 실패] ${ter.nameKr} 경계가 삼엄해 철수했다.`);
      return { ok: true, state, success: false, mode: "scout", summary: "정찰 실패" };
    }

    // Sabotage: canonical ~50% success, failure risks ninja strain!
    if (roll < 0.5) {
      ter.sabotaged = true;
      ter.garrisonTroops = Math.max(120, Math.round(ter.garrisonTroops * 0.72));
      addLog(state, "ninja", `[파괴 공작 성공!] ${ter.nameKr} 보급고 파괴로 수비 병력이 ${ter.garrisonTroops}명으로 감소했다.`);
      return { ok: true, state, success: true, mode: "sabotage", summary: `${ter.nameKr} 병력 약화 성공!` };
    } else {
      // Failed sabotage risks mistreatment/strain on Kanami
      if (state.commanders.chr_kanami && state.commanders.chr_kanami.recruited) {
        state.commanders.chr_kanami.mistreatmentCount += 1;
      }
      addLog(state, "ninja", `[파괴 공작 실패] ${ter.nameKr}에서 적 경비대에 발각되어 겨우 탈출했다.`);
      return { ok: true, state, success: false, mode: "sabotage", summary: "파괴 공작 실패 (닌자 피로 누적)" };
    }
  }

  function runScenarioEvent(state, rawData, eventId, choiceIndex) {
    const data = resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 달성되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "진행 중인 전투를 먼저 완료하세요.", state };

    const evtDef = data.scenarioEvents.find((e) => e.id === eventId);
    if (!evtDef) return { ok: false, error: `알 수 없는 시나리오 이벤트 ID입니다: ${eventId}`, state };

    const choice = typeof choiceIndex === "number" ? choiceIndex : 0;

    // Elective court character scenarios consume weeklySlots.characterEvent if available & not urgent phase gate
    const isUrgent = [
      "evt_bandit_prologue_ruberan",
      "evt_creator_phase_unlock",
      "evt_zeth_shizuka_duel_timer",
      "evt_helman_freya_sabotage"
    ].includes(eventId);
    if (!isUrgent && state.weeklySlots.characterEvent <= 0) {
      return { ok: false, error: "이번 주 캐릭터 시나리오 슬롯을 이미 사용했습니다.", state };
    }
    if (!isUrgent) {
      state.weeklySlots.characterEvent -= 1;
    }

    let summary = `${evtDef.nameKr} 처리 완료`;

    switch (eventId) {
      case "evt_bandit_prologue_ruberan":
        completeScenario(state, eventId);
        if (choice === 0) {
          setEnding(state, data, "end_bandit_king", "프롤로그 도적 페이즈에서 헬만 루베란 토벌대를 격파하고 도적왕이 되었다.");
          summary = "조기 엔딩 [도적왕] 달성!";
        } else {
          state.campaignPhase = "LEAZAS_REBELLION";
          queueScenario(state, "evt_kanami_shinobu_assassination");
          summary = "전략적 퇴각 완료! 리자스 즉위 및 본편 개시.";
        }
        break;

      case "evt_custom_annexation_bundle":
        completeScenario(state, eventId);
        state.flags.customAnnexed = true;
        state.flags.mariaLabUnlocked = true;
        for (const cid of ["chr_maria", "chr_shizuka", "chr_miru"]) {
          state.commanders[cid].recruited = true;
        }
        summary = "마리아·시즈카·미르 합류 및 마리아 연구소 해금!";
        break;

      case "evt_maria_tulip_100":
        if (choice === 0) {
          completeScenario(state, eventId);
          setEnding(state, data, "end_to_outer_space", "마리아 커스터드의 튤립 100호 로켓 개발을 완성해 우주로 출항했다.");
          summary = "특수 엔딩 [우주로] 달성!";
        } else {
          completeScenario(state, eventId);
          state.morale = Math.min(100, state.morale + 12);
          state.commanders.chr_maria.destinyFlag = "FORTUNE";
          summary = "로켓 발사를 보류하고 대륙 정복을 계속한다.";
        }
        break;

      case "evt_helman_freya_sabotage":
        if (choice === 0) {
          state.timers.freyaSabotage.active = false;
          state.flags.freyaCountered = true;
          state.commanders.chr_freya.recruited = true;
          state.commanders.chr_freya.alive = true;
          state.commanders.chr_freya.destinyFlag = "FORTUNE";
          state.weeklySlots.ninja += 5;
          completeScenario(state, eventId);
          summary = "프레이야 역매복 성공! 아군 닌자로 합류 (+5 닌자 슬롯).";
        } else {
          summary = "프레이야 공작이 계속된다 (매 턴 자금 유출 주의).";
        }
        break;

      case "evt_zeth_shizuka_duel_timer":
        completeScenario(state, eventId);
        state.flags.shizukaDuelResolved = true;
        state.timers.zethShizukaDuel.active = false;
        if (choice === 0 && state.flags.sillAlive) {
          state.commanders.chr_shizuka.destinyFlag = "FORTUNE";
          state.commanders.chr_nagi.recruited = true;
          state.commanders.chr_nagi.alive = true;
          state.commanders.chr_nagi.destinyFlag = "FORTUNE";
          summary = "시일의 지원으로 시즈카를 보호하고 나기 스 라갈을 영입했다!";
        } else {
          if (state.flags.adamConqueredBeforeTape) {
            state.commanders.chr_shizuka.destinyFlag = "MISFORTUNE";
            summary = "아담 요새 선점령 여파로 시즈카가 불행 운명 분기에 빠졌다.";
          } else {
            summary = "시즈카 결투가 종결되었다.";
          }
        }
        break;

      case "evt_lake_sasa_haniwa_king":
        if (choice === 0) {
          state.flags.sasaDungeonOpen = true;
          state.activeScenarios = state.activeScenarios.filter((id) => id !== eventId);
          summary = "알루미늄 도끼 선택! 사사호 호저미궁 지하 66층이 개방되었다 (탐색 2회로 하니와 킹 합류).";
        } else {
          state.flags.sasaDungeonLocked = true;
          state.gold += 8000;
          completeScenario(state, eventId);
          summary = "황금 도끼(+8,000G) 획득! 대신 사사호 호저미궁이 영구 폐쇄되었다.";
        }
        break;

      case "evt_kanami_shinobu_assassination":
        if (choice === 0) {
          state.commanders.chr_kanami.mistreatmentCount = 0;
          state.commanders.chr_kanami.trust = Math.min(100, state.commanders.chr_kanami.trust + 25);
          state.commanders.chr_kanami.destinyFlag = "FORTUNE";
          completeScenario(state, eventId);
          summary = "카나미와 첩보대에 포상을 내려 암살 위기를 원천 차단했다.";
        } else {
          state.commanders.chr_kanami.mistreatmentCount += 2;
          if (state.commanders.chr_kanami.mistreatmentCount >= 2) {
            completeScenario(state, eventId);
            setEnding(state, data, "end_assassinated", "카나미 혹사 누적 및 시노부 암살 저지 실패로 코드(Code)에게 암살당했다.");
            summary = "위기 엔딩 [암살] 발동!";
          } else {
            summary = "카나미의 불만이 누적되었다!";
          }
        }
        break;

      case "evt_miki_kentarou_demon_king_crisis":
        completeScenario(state, eventId);
        if (choice === 0) {
          state.commanders.chr_kentarou.recruited = true;
          state.commanders.chr_miki.recruited = true;
          state.commanders.chr_miki.destinyFlag = "FORTUNE";
          summary = "Pi-R을 격퇴하고 켄타로(성검 닛코)와 미키를 리자스군에 합류시켰다!";
        } else if (choice === 1) {
          setEnding(state, data, "end_demon_king_2", "미키(리틀 프린세스) 금기 각성 이벤트를 발동시켜 마왕 엔딩 2에 도달했다.");
          summary = "특수 엔딩 [마왕 2] 발동!";
        } else {
          state.flags.kayblisInvincible = true;
          state.commanders.chr_miki.destinyFlag = "MISFORTUNE";
          summary = "치명적 실수! 미키가 Pi-R에게 포획되어 케이브리스가 무적 마왕화했다!";
        }
        break;

      case "evt_satella_proposal":
        completeScenario(state, eventId);
        if (choice === 1) {
          setEnding(state, data, "end_demon_king_1", "마인 사테라의 제안을 수락해 란스가 마왕으로 즉위했다.");
          summary = "특수 엔딩 [마왕 1] 달성!";
        } else {
          state.commanders.chr_satella.recruited = true;
          state.commanders.chr_satella.alive = true;
          state.commanders.chr_satella.destinyFlag = "FORTUNE";
          summary = "사테라의 제안을 거절하고 미키 수호 동맹으로 리자스군에 영입했다!";
        }
        break;

      case "evt_warg_defection_and_chaos":
        completeScenario(state, eventId);
        state.commanders.chr_warg.recruited = true;
        state.commanders.chr_warg.alive = true;
        state.commanders.chr_warg.destinyFlag = "FORTUNE";
        state.flags.wargSleepUnlocked = true;
        summary = "마인 와그 아카 전향 합류! 창조신 루드라사움 몽환 최면 전략이 해금되었다.";
        break;

      case "evt_creator_phase_unlock":
        completeScenario(state, eventId);
        if (choice === 0) {
          if (!state.flags.wargSleepUnlocked && !state.commanders.chr_warg.recruited) {
            // Without Warg, falls into God ending
            setEnding(state, data, "end_god", "와그의 최면 없이 루드라사움과 대면하여 신의 미궁에 유폐되었다.");
            summary = "엔딩 [신] 발동 (와그 미합류)";
          } else if (state.flags.sillAlive && state.commanders.chr_sill.recruited && state.commanders.chr_sill.alive) {
            setEnding(state, data, "end_bliss", "시일이 생존한 상태에서 와그가 창조신 루드라사움을 잠재워 진 엔딩 [지복(Bliss)]에 도달했다!");
            summary = "진 엔딩 [지복 (Bliss)] 달성!";
          } else {
            setEnding(state, data, "end_world_king", "와그가 창조신을 잠재웠으나 시일이 부재하여 [세계왕(World King)] 엔딩에 도달했다.");
            summary = "엔딩 [세계왕 (World King)] 달성!";
          }
        } else if (choice === 1) {
          if (state.flags.sillAlive && state.commanders.chr_sill.recruited) {
            setEnding(state, data, "end_servant", "시일 보유 상태에서 루드라사움의 혼돈 창조에 동의하여 [신의 종]이 되었다.");
          } else {
            setEnding(state, data, "end_servant_no_sill_variant", "시일 부재 상태에서 창조신에게 복종하는 변형 엔딩에 도달했다.");
          }
          summary = "엔딩 [신의 종] 달성!";
        } else if (choice === 3 && !state.flags.sillAlive) {
          setEnding(state, data, "end_lia_leazas_branch", "시일 부재 분기에서 여왕 리아와 리자스 왕국에 귀속되는 결말을 맞았다.");
          summary = "엔딩 [리아/리자스 특수 분기] 달성!";
        } else {
          setEnding(state, data, "end_god", "창조신 루드라사움에게 정면 도전했다가 패배해 신의 미궁에 유폐되었다.");
          summary = "엔딩 [신 (유폐)] 발동!";
        }
        break;

      default:
        completeScenario(state, eventId);
        break;
    }

    addLog(state, "scenario", `[시나리오] ${summary}`);
    return { ok: true, state, summary };
  }

  // ==================== TURN END, TIMERS & LIGHTWEIGHT AI ====================

  function evaluateEndings(state, data) {
    if (state.endingId) return state.endingId;
    if (!state.commanders.chr_rance.alive || state.commanders.chr_rance.commanderHp <= 0) {
      setEnding(state, data, "end_death", "란스가 전투에서 전사했다.");
      return state.endingId;
    }
    if (state.territories.ter_leazas_castle.owner !== "fac_leazas") {
      setEnding(state, data, "end_defeat", "수도 리자스성이 적 세력에게 함락되었다.");
      return state.endingId;
    }
    return null;
  }

  function endTurn(state, rawData) {
    const data = resolveData(rawData);
    if (state.endingId) return { ok: false, error: "이미 엔딩이 달성되었습니다.", state };
    if (state.activeBattle) return { ok: false, error: "진행 중인 전투를 먼저 종료하세요.", state };

    // 1. Passive territory income
    let passiveIncome = 0;
    const hasLibrary = state.territories.ter_leazas_castle.facilities.includes("library");
    for (const t of Object.values(state.territories)) {
      if (t.owner === "fac_leazas") {
        passiveIncome += Math.round(t.taxIncome * 0.25 * (hasLibrary ? 1.15 : 1));
      }
    }
    state.gold += passiveIncome;

    // 2. Hospital passive healing
    const hasHospital = state.territories.ter_leazas_castle.facilities.includes("hospital");
    if (hasHospital) {
      for (const c of Object.values(state.commanders)) {
        if (c.recruited && c.alive && c.isPlayableSubordinate) {
          c.commanderHp = Math.min(c.maxCommanderHp, c.commanderHp + 2);
          c.troops = Math.min(c.maxTroops, c.troops + 40);
        }
      }
    }

    // 3. Maria Lab passive Tulip 100 progress
    if (state.territories.ter_leazas_castle.facilities.includes("maria_lab") && state.commanders.chr_maria.recruited) {
      if (state.flags.tulipProgress < 100) {
        state.flags.tulipProgress = Math.min(100, state.flags.tulipProgress + 10);
        if (state.flags.tulipProgress >= 100) {
          queueScenario(state, "evt_maria_tulip_100");
          addLog(state, "scenario", "[튤립 100호 완성!] 마리아 연구소의 로켓이 완성되었다. 시나리오 패널에서 발사를 결정하라!");
        }
      }
    }

    // 4. Freya sabotage gold drain
    if (state.timers.freyaSabotage.active) {
      state.timers.freyaSabotage.ticks += 1;
      const drain = Math.min(state.gold, 1800);
      state.gold -= drain;
      addLog(state, "crisis", `[프레이야 공작] 흑익의 보급 방해로 군자금 -${drain.toLocaleString()}G 유출!`);
    }

    // 5. Lightweight AI faction counter-pressure
    runAiFactionTurn(state, data);

    // 6. Advance Calendar & Turn
    state.turn += 1;
    state.calendar = advanceCalendar(state.calendar);
    state.weeklySlots = computeWeeklySlots(state);

    // 7. Evaluate Absolute Calendar Deadlines & Relative Crisis Timers
    const dueEvents = [];

    // Volgo Z Soul Deadline (LP 3/08/3)
    if (
      state.timers.volgoZSoul.status === "ACTIVE" &&
      compareCalendar(state.calendar, state.timers.volgoZSoul.deadline) > 0
    ) {
      state.timers.volgoZSoul.status = "EXPIRED";
      state.commanders.chr_soul.alive = false;
      state.commanders.chr_soul.imprisoned = false;
      dueEvents.push("evt_volgo_z_soul_deadline");
      addLog(state, "crisis", "[기한 만료] LP 3/08/3 경과 — 볼고 Z의 소울 구출에 실패하여 바운드 영입 체인이 봉인되었다.");
    }

    // Volgo Z Sill Deadline (LP 4/01/3)
    if (
      state.timers.volgoZSill.status === "ACTIVE" &&
      compareCalendar(state.calendar, state.timers.volgoZSill.deadline) > 0
    ) {
      state.timers.volgoZSill.status = "EXPIRED";
      state.flags.sillAlive = false;
      state.commanders.chr_sill.alive = false;
      state.commanders.chr_sill.imprisoned = false;
      state.commanders.chr_sill.destinyFlag = "MISFORTUNE";
      dueEvents.push("evt_volgo_z_sill_deadline");
      addLog(state, "crisis", "[기한 만료] LP 4/01/3 경과 — 볼고 Z의 시일 구출 실패! 진 엔딩(Bliss)이 영구 잠금되었다.");
    }

    // Zeth 5-week Shizuka Duel Timer
    if (state.timers.zethShizukaDuel.active) {
      state.timers.zethShizukaDuel.remainingWeeks -= 1;
      if (state.timers.zethShizukaDuel.remainingWeeks <= 0) {
        state.timers.zethShizukaDuel.active = false;
        queueScenario(state, "evt_zeth_shizuka_duel_timer");
        dueEvents.push("evt_zeth_shizuka_duel_timer");
        addLog(state, "scenario", "[타이머 발동!] 제스 개전 5주 경과 — 시즈카 결투 시나리오가 발동했다!");
      }
    }

    // Earliest Monster Realm Open (LP 3/9/4)
    const earliestDemonDate = { year: 3, month: 9, week: 4 };
    if (!state.flags.monsterRealmOpen && compareCalendar(state.calendar, earliestDemonDate) >= 0) {
      state.flags.monsterRealmOpen = true;
      addLog(state, "crisis", "[마계 정세] LP 3/09/4 도달 — 케이브리스의 마계 통일이 임박하며 마지노선 진격이 개방되었다.");
    }

    // Demon Invasion Countdown (69~73 weeks after Ex Rebellion)
    if (state.timers.monsterRealmInvasion.active && !state.flags.demonInvasionTriggered) {
      state.timers.monsterRealmInvasion.remainingWeeks -= 1;
      if (state.timers.monsterRealmInvasion.remainingWeeks <= 0) {
        triggerMonsterRealmPhase(state, "마인군 대침공 카운트다운 만료! 케이브리스 대군이 인간계 서부를 돌파했다!");
        dueEvents.push("evt_kayblis_monster_realm_unification");
      }
    }

    evaluateEndings(state, data);

    addLog(
      state,
      "turn",
      `=== ${formatCalendar(state.calendar)} (턴 ${state.turn}) 개시 · 세수 +${passiveIncome.toLocaleString()}G ===`
    );

    return { ok: true, state, passiveIncome, dueEvents };
  }

  function runAiFactionTurn(state, data) {
    // At-war factions reinforce frontier garrisons slightly each turn
    for (const f of Object.values(state.factions)) {
      if (!f.atWarWithPlayer || f.defeated || f.id === "fac_leazas") continue;
      const owned = Object.values(state.territories).filter((t) => t.owner === f.id);
      if (owned.length === 0) {
        f.defeated = true;
        continue;
      }
      for (const t of owned) {
        if (isAdjacentToPlayer(state, t.id)) {
          t.garrisonTroops = Math.min(950, t.garrisonTroops + (f.id === "fac_demon_kayblis" ? 35 : 15));
        }
      }

      // Demon Army counter-offensive pressure every 6 turns once active
      if (f.id === "fac_demon_kayblis" && state.flags.demonInvasionTriggered && state.turn % 6 === 0) {
        const frontierTargets = Object.values(state.territories).filter(
          (t) =>
            t.owner === "fac_leazas" &&
            t.id !== "ter_leazas_castle" &&
            t.adjacentIds.some((adj) => state.territories[adj]?.owner === "fac_demon_kayblis")
        );
        if (frontierTargets.length > 0) {
          const target = frontierTargets[nextRngInt(state, 0, frontierTargets.length - 1)];
          const roll = nextRngFloat(state);
          if (roll < 0.35) {
            target.owner = "fac_demon_kayblis";
            target.garrisonTroops = 520;
            addLog(state, "crisis", `[마인군 반격!] 케이브리스 군단이 국경 요충지 '${target.nameKr}'을(를) 탈환했다!`);
          } else {
            addLog(state, "battle", `[방어 성공] 리자스 수비대가 '${target.nameKr}'에 대한 마인군 야습을 격퇴했다.`);
          }
        }
      }
    }
    evaluateEndings(state, data);
  }

  // ==================== SERIALIZATION ====================

  function serialize(state) {
    return JSON.stringify(state);
  }

  function deserialize(json, rawData) {
    resolveData(rawData);
    const parsed = typeof json === "string" ? JSON.parse(json) : deepClone(json);
    if (!parsed || parsed.gameId !== "kichikuou-rance" || !parsed.territories || !parsed.commanders) {
      throw new Error("Invalid Kichikuou Rance save snapshot.");
    }
    return parsed;
  }

  // ==================== PUBLIC API ====================

  const Engine = {
    SAVE_VERSION,
    FACILITIES,
    SCENARIO_CHOICES,
    ZETH_TOWER_IDS,
    createInitialState,
    formatCalendar,
    compareCalendar,
    nextRngFloat,
    nextRngInt,
    countAliveRecruitedNinjas,
    computeWeeklySlots,
    isAdjacentToPlayer,
    canInvade,
    selectNextActor,
    getBattleTurnQueue,
    resolveSnipeDamage,
    checkCreatorPhaseUnlock,
    startInvasion,
    getValidTargets,
    executeBattleAction,
    stepBattleAiTurn,
    autoResolveBattle,
    runCityAction,
    runBuildFacility,
    runReinforce,
    runDraft,
    runTalk,
    runExplore,
    runNinjaAction,
    runScenarioEvent,
    endTurn,
    evaluateEndings,
    serialize,
    deserialize
  };

  if (typeof root !== "undefined") {
    root.KichikuouRanceEngine = Engine;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = Engine;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
