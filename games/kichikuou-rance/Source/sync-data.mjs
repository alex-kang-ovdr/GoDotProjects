import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gameRoot = path.resolve(__dirname, "..");
const verifiedDir = path.join(gameRoot, "ReverseDesign", "verified_data");
const outDir = path.join(gameRoot, "Web", "data");
const outFile = path.join(outDir, "game-data.js");

function readJson(fileName) {
  const fullPath = path.join(verifiedDir, fileName);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

const factionsRaw = readJson("factions.json");
const territoriesRaw = readJson("territories.json");
const unitClassesRaw = readJson("unit_classes.json");
const charactersRaw = readJson("characters.json");
const eventsRaw = readJson("scenario_events_and_timers.json");
const endingsRaw = readJson("endings.json");
const destiniesRaw = readJson("destinies.json");

// Canonical continent geography coordinates (SVG viewBox: 1080 x 640)
const MAP_COORDS = {
  // Monster Realm & Creator Realm (West)
  ter_rudrasaum_ruins: { x: 64, y: 120 },
  ter_sulphur_forest: { x: 112, y: 264 },
  ter_hornet_castle: { x: 196, y: 378 },
  ter_demon_frontier: { x: 204, y: 194 },
  ter_maginot_line: { x: 304, y: 274 },

  // Helman Empire (North-Center)
  ter_helman_west: { x: 404, y: 184 },
  ter_lang_bau: { x: 472, y: 92 },
  ter_helman_central: { x: 526, y: 188 },
  ter_helman_east: { x: 642, y: 124 },
  ter_helman_south: { x: 518, y: 294 },
  ter_volgo_z: { x: 646, y: 224 },

  // Zeth Kingdom (South-Center)
  ter_zeth_west: { x: 382, y: 386 },
  ter_old_zeth: { x: 484, y: 424 },
  ter_adam_stronghold: { x: 586, y: 382 },
  ter_tape: { x: 622, y: 468 },
  ter_amber_city: { x: 510, y: 534 },
  ter_shangri_la: { x: 372, y: 562 },

  // Leazas Kingdom (Northeast)
  ter_leazas_north: { x: 758, y: 132 },
  ter_leazas_white_fort: { x: 832, y: 198 },
  ter_leazas_castle: { x: 794, y: 286 },
  ter_leazas_south: { x: 856, y: 368 },

  // Free Cities, AL Church, JAPAN (Southeast & East)
  ter_ice: { x: 750, y: 386 },
  ter_custom: { x: 760, y: 472 },
  ter_radil: { x: 696, y: 544 },
  ter_sasa_lake: { x: 816, y: 564 },
  ter_al_hq: { x: 690, y: 438 },
  ter_portugal: { x: 916, y: 492 },
  ter_japan_main: { x: 1004, y: 416 },
  ter_japan_kurobe: { x: 1018, y: 530 }
};

// Distinct regal dark-fantasy palette for all 10 factions
const FACTION_COLORS = {
  fac_leazas: { fill: "#c92a3e", stroke: "#f5c76b", badge: "#e03e52", label: "리자스" },
  fac_ex_rebellion: { fill: "#d9dde6", stroke: "#8f98a8", badge: "#cbd2df", label: "백군반란" },
  fac_free_cities: { fill: "#2f8f6b", stroke: "#7de2b8", badge: "#38a87e", label: "자유도시" },
  fac_helman: { fill: "#38629c", stroke: "#8bb8f5", badge: "#4979bd", label: "헬만" },
  fac_zeth: { fill: "#7a44a8", stroke: "#c99cf5", badge: "#9357c7", label: "제스" },
  fac_al_church: { fill: "#c4962c", stroke: "#fae08c", badge: "#dbb03b", label: "AL교" },
  fac_japan: { fill: "#c95b38", stroke: "#ffb194", badge: "#e0704c", label: "JAPAN" },
  fac_demon_kayblis: { fill: "#6e172a", stroke: "#ff5c7c", badge: "#991f39", label: "마인(케)" },
  fac_demon_hornet: { fill: "#522563", stroke: "#d48cff", badge: "#73378a", label: "마인(호)" },
  fac_independent_ancient: { fill: "#2b7a8a", stroke: "#88e6f7", badge: "#3a9cb0", label: "고대/신계" }
};

// Canonical Multi-Floor Playable Dungeons
const DUNGEONS = [
  {
    id: "dng_sasa_b66",
    nameKr: "사사호 호저미궁 (지하 66층)",
    nameEn: "Lake Sasa Underwater Dungeon (B66F)",
    territoryId: "ter_sasa_lake",
    floors: [
      { label: "B10F 침수 회랑", threat: 14, rewardGold: 1200, encounter: "하니와 정찰병 무리가 수중 통로를 봉쇄하고 있다." },
      { label: "B25F 고대 수문실", threat: 18, rewardGold: 1600, encounter: "고대 수문 함정과 하니와 중장병이 원정대를 가로막는다." },
      { label: "B42F 도기 회랑", threat: 22, rewardGold: 2200, encounter: "마법 면역 하니와 수호대가 전열을 압박한다." },
      { label: "B58F 왕실 전초", threat: 26, rewardGold: 2800, encounter: "하니와 친위대와 고대 보물고가 발견되었다!" },
      { label: "B66F 하니와 신전 최심부", threat: 30, rewardGold: 4500, encounter: "전설의 존재 '하니와 킹'이 옥좌에서 원정대를 맞이한다!" }
    ],
    boss: {
      nameKr: "하니와 킹 (B66F 수호왕)",
      power: 46,
      hp: 34,
      recruitCharacterId: "chr_haniwa_king"
    },
    relic: {
      id: "relic_haniwa_crown",
      nameKr: "하니와 왕관",
      effectKr: "아군 전 지휘관 DEF +2 · 사사호 B66F 제패 증표"
    },
    linkedEventId: "evt_lake_sasa_haniwa_king"
  },
  {
    id: "dng_rudrasaum_ruins",
    nameKr: "루드라사움 유적 (신의 미궁)",
    nameEn: "Rudrasaum Ruins (God Cave)",
    territoryId: "ter_rudrasaum_ruins",
    floors: [
      { label: "1F 천상계 봉인문", threat: 20, rewardGold: 1500, encounter: "1,000층 유적의 1층 비밀 입구 — 고대 봉인 의식을 돌파한다." },
      { label: "300F 천사기사 회랑", threat: 28, rewardGold: 2600, encounter: "천사기사 정예 분대가 창조신의 영역을 수호하고 있다." },
      { label: "777F 심판의 계단", threat: 34, rewardGold: 3500, encounter: "세계 리셋의 기록석이 빛나며 최상위 천사대가 출격한다." },
      { label: "1000F 창조의 옥좌", threat: 40, rewardGold: 5000, encounter: "창조신 루드라사움의 영역 최심부에 도달했다!" }
    ],
    boss: {
      nameKr: "천사기사 총사령 (창조의 수문장)",
      power: 54,
      hp: 40,
      recruitCharacterId: null
    },
    relic: {
      id: "relic_creator_seal",
      nameKr: "창조의 인장",
      effectKr: "아군 전 지휘관 ATK +2, MAG +2 · 창조신 대면 엔딩 시나리오 해금"
    },
    linkedEventId: "evt_creator_phase_unlock"
  },
  {
    id: "dng_custom_labyrinth",
    nameKr: "커스텀 고대 미궁 (하이퍼 빌딩 201F)",
    nameEn: "Custom Ancient Labyrinth (Hyper Building 201F)",
    territoryId: "ter_custom",
    floors: [
      { label: "1F 고대 기계 로비", threat: 12, rewardGold: 1100, encounter: "고대 문명의 경비 자동인형이 작동을 재개했다." },
      { label: "50F 중앙 동력실", threat: 16, rewardGold: 1800, encounter: "마리아의 도면과 일치하는 마도 에너지 코어를 발견했다." },
      { label: "120F 환수 격납고", threat: 20, rewardGold: 2400, encounter: "폭주한 환수들이 미궁 상층 통로를 점거하고 있다." },
      { label: "201F 최상층 유물고", threat: 25, rewardGold: 3800, encounter: "최상층 수호 투신과 전설의 '지혜의 반지'가 모습을 드러냈다!" }
    ],
    boss: {
      nameKr: "고대 투신 가디언",
      power: 38,
      hp: 28,
      recruitCharacterId: null
    },
    relic: {
      id: "relic_ring_of_wisdom",
      nameKr: "지혜의 반지",
      effectKr: "란스 ATK +3, MAG +3 · 마리아 튤립 개발 +25% · 국고 +5,000G"
    },
    linkedEventId: "evt_custom_ancient_labyrinth"
  },
  {
    id: "dng_zeth_magic_tower",
    nameKr: "제스 마법탑 (성녀의 미궁)",
    nameEn: "Zeth Magic Tower (Saint Dungeon)",
    territoryId: "ter_zeth_west",
    floors: [
      { label: "1층 화염 결계실", threat: 16, rewardGold: 1400, encounter: "제스 화염 마법 트랩이 전열의 진격을 시험한다." },
      { label: "2층 빙결 회랑", threat: 20, rewardGold: 1900, encounter: "빙결 골렘 군단과 마력 증폭 수정이 배치되어 있다." },
      { label: "3층 뇌전 서고", threat: 24, rewardGold: 2500, encounter: "고대 해저주 비전서와 마검 카오스의 단서를 입수했다!" },
      { label: "최상층 대마도실", threat: 28, rewardGold: 3600, encounter: "봉인된 마도사 리즈나를 지키는 수호 마도사가 나타난다." }
    ],
    boss: {
      nameKr: "자카리테 수호마도사",
      power: 42,
      hp: 30,
      recruitCharacterId: "chr_rizna"
    },
    relic: {
      id: "relic_archmage_staff",
      nameKr: "대마도사의 지팡이",
      effectKr: "전군 마법/카라 지휘관 MAG +3 · 리즈나 해저주 & 합류 · 마검 카오스 획득"
    },
    linkedEventId: "evt_zeth_magic_tower_delve"
  }
];

const playableCommandersCount = charactersRaw.characters.filter((c) => c.isPlayableSubordinate).length;

const bundled = {
  schemaVersion: "2.0.0",
  gameId: "kichikuou-rance",
  generatedAt: "2026-11-22",
  counts: {
    factions: factionsRaw.factions.length,
    territories: territoriesRaw.territories.length,
    unitClasses: unitClassesRaw.unitClasses.length,
    characters: charactersRaw.characters.length,
    playableCommanders: playableCommandersCount,
    scenarioEvents: eventsRaw.events.length,
    endings: endingsRaw.endings.length,
    destinies: destiniesRaw.destinies.length,
    dungeons: DUNGEONS.length
  },
  factions: factionsRaw.factions.map((f) => ({
    ...f,
    color: FACTION_COLORS[f.id] || { fill: "#555e6e", stroke: "#a8b2c4", badge: "#6b768a", label: f.nameKr }
  })),
  territories: territoriesRaw.territories.map((t) => ({
    ...t,
    coords: MAP_COORDS[t.id] || { x: 540, y: 320 }
  })),
  unitClasses: unitClassesRaw.unitClasses,
  characters: charactersRaw.characters,
  scenarioEvents: eventsRaw.events,
  endings: endingsRaw.endings,
  destinies: destiniesRaw.destinies,
  dungeons: DUNGEONS,
  characterDestinySystem: endingsRaw.characterDestinySystem
};

fs.mkdirSync(outDir, { recursive: true });

const banner = `/* AUTO-GENERATED by Source/sync-data.mjs from ReverseDesign/verified_data/*.json — DO NOT EDIT MANUALLY */\n`;
const output = `${banner}(function (root) {
  const RANCE_DATA = ${JSON.stringify(bundled, null, 2)};
  if (typeof root !== "undefined") {
    root.RANCE_DATA = RANCE_DATA;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = RANCE_DATA;
  }
})(typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : this));
`;

fs.writeFileSync(outFile, output, "utf8");
console.log(`[sync-data] Generated ${path.relative(gameRoot, outFile)} successfully:`);
console.log(JSON.stringify(bundled.counts, null, 2));
