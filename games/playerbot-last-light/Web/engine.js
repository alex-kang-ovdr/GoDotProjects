// Last Light — original survival rules, independent of any commercial game's data.
// Pure, synchronous, DOM-free engine. Every public mutation returns a useful error.

export const ITEMS = Object.freeze({
  wood: { name: '목재', short: '목', color: '#bf9662', stack: 4, description: '건설과 연료 제작에 필요한 목재.' },
  parts: { name: '부품', short: '부', color: '#91a7b2', stack: 6, description: '시설을 고치고 도구를 만드는 부품.' },
  water: { name: '물', short: '물', color: '#6faac7', stack: 5, description: '음식을 조리하고 생활을 유지하는 깨끗한 물.' },
  raw: { name: '식재료', short: '식', color: '#c18c7a', stack: 3, description: '조리하면 두 끼가 된다. 급하면 날것으로 먹을 수 있다.' },
  meal: { name: '식사', short: '밥', color: '#dab574', stack: 3, description: '허기 42를 회복하는 따뜻한 한 끼.' },
  fuel: { name: '연료', short: '불', color: '#dd985f', stack: 4, description: '조리, 겨울 급수, 야간 난방에 사용한다.' },
  meds: { name: '약품', short: '약', color: '#b6c9a5', stack: 2, description: '질병을 완화하고 체력을 일부 회복한다.' },
  bandage: { name: '붕대', short: '붕', color: '#d5d5c2', stack: 3, description: '체력을 크게 회복하는 응급 치료품.' },
  cloth: { name: '천', short: '천', color: '#baa8c3', stack: 4, description: '침구, 집수기와 장비 제작에 사용하는 천.' },
  crowbar: { name: '쇠지레', short: '쇠', color: '#9fa9b1', stack: 1, description: '잠긴 보관함을 열고 피난처 방어에도 사용할 수 있다.' },
  knife: { name: '칼', short: '칼', color: '#c5c9c9', stack: 1, description: '현장 대응과 야간 방어에 도움이 되는 도구.' },
});

export const CAMPAIGN_PROFILE = Object.freeze({
  id: 'twelve-days', label: '12일의 통로', days: 12,
  coldDays: Object.freeze([4, 5, 6, 7, 8]), evacuationDay: 13,
});

export const DIFFICULTIES = Object.freeze({
  standard: Object.freeze({
    id: 'standard', label: '표준', description: '기존 보급품으로 시작합니다. 밤마다 허기 18이 늘고, 습격 뒤에는 문 보강 상태를 확인해야 합니다.',
    startingStock: Object.freeze({ wood: 12, parts: 14, water: 8, raw: 4, meal: 3, fuel: 4, meds: 1, bandage: 1, cloth: 3, crowbar: 0, knife: 0 }),
    raidChanceMultiplier: 1, raidThreatBonus: 0, hungerPerNight: 18, wearMultiplier: 1,
  }),
  siege: Object.freeze({
    id: 'siege', label: '봉쇄', description: '건축 재료와 일부 보급품이 적습니다. 허기는 밤마다 21 증가하고, 습격 확률은 표준의 1.35배, 강도는 4 높습니다. 문 보강도 더 빨리 닳습니다.',
    startingStock: Object.freeze({ wood: 10, parts: 12, water: 6, raw: 3, meal: 3, fuel: 3, meds: 1, bandage: 1, cloth: 2, crowbar: 0, knife: 0 }),
    raidChanceMultiplier: 1.35, raidThreatBonus: 4, hungerPerNight: 21, wearMultiplier: 1.6,
  }),
});

export const FACILITIES = Object.freeze({
  bed: { name: '침대', target: 'bed', maxLevel: 3, description: '야간에 침대를 배정받은 사람은 피로 44, 바닥에서 자면 25를 회복한다.' },
  stove: { name: '스토브', target: 'kitchen', maxLevel: 2, description: '식재료 하나를 두 끼로 조리한다. 개선하면 물을 절약한다.' },
  workshop: { name: '작업대', target: 'workshop', maxLevel: 1, description: '도구와 생활 시설을 제작한다.' },
  collector: { name: '집수기', target: 'water', maxLevel: 1, description: '급수량을 늘리고 따뜻한 밤에는 물 2를 모은다. 겨울에는 얼어붙는다.' },
  heater: { name: '난로', target: 'heater', maxLevel: 1, description: '4~8일 밤의 추위를 막는다. 매일 연료 1, 혹한인 6~7일에는 2가 필요하다.' },
  barricade: { name: '문 보강', target: 'door', maxLevel: 3, description: '단계마다 방어력 11을 더한다. 실제 효과는 은신처 내구도에 비례하므로 습격 뒤에는 수리가 필요하다.' },
  radio: { name: '무전기', target: 'radio', maxLevel: 1, description: '4일째부터 구호팀과 교신할 수 있다. 교신과 대피 물자 준비로 계획된 대피 경로를 마련한다.' },
  trap: { name: '소형 덫', target: 'rubble', maxLevel: 2, description: '짝수일 밤마다 식재료 1을 미끼로 사용해 식재료 2를 얻는다.' },
});

export const LOCATION_RULES = Object.freeze({ cottage: 1, clinic: 2, garage: 3, apartments: 4, warehouse: 5 });

export const RECIPES = Object.freeze({
  buildRadio: { name: '무전기 복구', cost: { wood: 2, parts: 5 }, duration: 100, target: 'radio', category: 'build', facility: 'radio' },
  contactRelief: { name: '구호팀과 교신', cost: { parts: 2, fuel: 1 }, duration: 80, target: 'radio', category: 'survival' },
  prepareEvacuation: { name: '대피 물자 봉인', cost: { meal: 3, water: 4, bandage: 1 }, duration: 100, target: 'door', category: 'survival' },
  cook: { name: '두 끼 조리', cost: { raw: 1, water: 2, fuel: 1 }, output: { meal: 2 }, duration: 50, target: 'kitchen', category: 'survival' },
  fuel: { name: '연료 만들기', cost: { wood: 1 }, output: { fuel: 3 }, duration: 35, target: 'workshop', category: 'craft' },
  craftCrowbar: { name: '쇠지레 제작', cost: { parts: 4, wood: 1 }, output: { crowbar: 1 }, duration: 80, target: 'workshop', category: 'craft' },
  craftKnife: { name: '칼 제작', cost: { parts: 5, cloth: 1 }, output: { knife: 1 }, duration: 90, target: 'workshop', category: 'craft' },
  buildBed: { name: '침대 추가', cost: { wood: 5, parts: 3, cloth: 1 }, duration: 120, target: 'bed', category: 'build', facility: 'bed' },
  buildCollector: { name: '집수기 설치', cost: { wood: 5, parts: 6, cloth: 1 }, duration: 160, target: 'water', category: 'build', facility: 'collector' },
  buildHeater: { name: '난로 설치', cost: { wood: 6, parts: 6 }, duration: 170, target: 'heater', category: 'build', facility: 'heater' },
  buildBarricade: { name: '문 보강', cost: { wood: 5, parts: 4 }, duration: 120, target: 'door', category: 'build', facility: 'barricade' },
  buildTrap: { name: '덫 설치', cost: { wood: 5, parts: 7 }, duration: 160, target: 'rubble', category: 'build', facility: 'trap' },
  upgradeStove: { name: '스토브 개선', cost: { wood: 5, parts: 7 }, duration: 180, target: 'kitchen', category: 'build', facility: 'stove' },
});

const DAY_START = 360;
const DAY_END = 1200;
const CAMPAIGN_DAYS = CAMPAIGN_PROFILE.days;
const IDS = ['mira', 'yun', 'leo'];
const PHASES = ['day', 'planning', 'expedition', 'report', 'ended'];
const LOG_TYPES = ['info', 'good', 'bad'];
const TARGETS = ['kitchen', 'bed', 'water', 'workshop', 'radio', 'door', 'rubble', 'heater'];
const ACTION_IDS = ['eat', 'rest', 'cook', 'water', 'fuel', 'heal', 'bandage', 'talk', 'clear', 'craftCrowbar', 'craftKnife', 'buildBed', 'buildCollector', 'buildHeater', 'buildBarricade', 'buildTrap', 'upgradeStove', 'repairShelter', 'buildRadio', 'contactRelief', 'prepareEvacuation'];
const CHARACTER_METRICS = ['health', 'hunger', 'fatigue', 'morale', 'illness'];
const RELIEF_SUPPLIES = Object.freeze({ raw: 2, meds: 1, bandage: 1, fuel: 2 });
const RELIEF_ACTIONS = Object.freeze(['buildRadio', 'contactRelief', 'prepareEvacuation']);
const newRelief = () => ({ contacted: false, contactDay: null, deliveryDay: null, delivered: false, prepared: false, preparedDay: null });
const reliefState = state => state.relief || newRelief();
const REPAIR_COST = Object.freeze({ wood: 2, parts: 1 });
const REPAIR_AMOUNT = 35;
const QUEUE_LIMIT = 3;
const TIME_EPSILON = 0.0000001;
const RAID_CHANCES = [0, 0, .18, .25, .31, .40, .23, .28, .39, .44, .48, .42, .30];
// Values are in the merchant's accounting units, not a spendable currency.
// All fixed bundles also preserve or reduce total sell value, preventing resale loops.
const SELL_VALUES = Object.freeze({ wood: 5, parts: 4, water: 1, raw: 3, meal: 5, fuel: 2, meds: 12, bandage: 9, cloth: 2, crowbar: 16, knife: 18 });
const TRADER_STOCK = Object.freeze({ wood: 8, parts: 8, water: 8, raw: 5, meal: 2, fuel: 6, meds: 2, bandage: 2, cloth: 4, crowbar: 1, knife: 1 });
const MAX_STOCK = 100000;
const clone = value => JSON.parse(JSON.stringify(value));
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const integer = (n, min = 0, max = MAX_STOCK) => Number.isSafeInteger(n) && n >= min && n <= max;
const finite = (n, min = 0, max = 100) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const fail = reason => ({ ok: false, reason });
const living = state => state.characters.filter(c => c.alive);
const characterById = (state, id) => state.characters.find(c => c.id === id);
const roundTime = value => Math.round(value * 1e9) / 1e9;

function difficultyProfile(state) { return own(DIFFICULTIES, state.difficulty) ? DIFFICULTIES[state.difficulty] : DIFFICULTIES.standard; }
function campaignMetadata(difficulty) { return { id: CAMPAIGN_PROFILE.id, label: CAMPAIGN_PROFILE.label, days: CAMPAIGN_DAYS, difficulty, difficultyLabel: DIFFICULTIES[difficulty].label }; }

export function getShelterStatus(state) {
  const integrity = state.shelterIntegrity === undefined ? 100 : clamp(state.shelterIntegrity);
  const barricadeLevel = state.facilities.barricade;
  const fullBarricadeDefense = barricadeLevel * 11;
  const defenseMultiplier = integrity / 100;
  const label = integrity >= 85 ? '튼튼함' : integrity >= 60 ? '마모됨' : integrity >= 30 ? '파손됨' : '심하게 파손됨';
  return { integrity, label, barricadeLevel, barricadeDefense: fullBarricadeDefense * defenseMultiplier, fullBarricadeDefense, defenseMultiplier, repairAmount: Math.min(REPAIR_AMOUNT, 100 - integrity), repairCost: { ...REPAIR_COST }, needsRepair: integrity < 100 };
}

function random(state) {
  state.rng = (state.rng + 0x6D2B79F5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function log(state, text, type = 'info') {
  state.logs.unshift({ day: state.day, text, type });
  state.logs.length = Math.min(50, state.logs.length);
}

function normalizeItems(items) {
  if (!plain(items)) return null;
  const result = {};
  for (const [id, qty] of Object.entries(items)) {
    if (!own(ITEMS, id) || !integer(qty)) return null;
    if (qty) result[id] = qty;
  }
  return result;
}

export function usedSlots(items) {
  const normalized = normalizeItems(items);
  if (!normalized) return Infinity;
  return Object.entries(normalized).reduce((n, [id, qty]) => n + Math.ceil(qty / ITEMS[id].stack), 0);
}

function shortage(inventory, cost) {
  const missing = Object.entries(cost).filter(([id, qty]) => (inventory[id] || 0) < qty);
  return missing.length ? `재료 부족: ${missing.map(([id, qty]) => `${ITEMS[id].name} ${qty - (inventory[id] || 0)}`).join(', ')}` : '';
}

function changeItems(inventory, quantities, multiplier = 1) {
  for (const [id, qty] of Object.entries(quantities)) inventory[id] = (inventory[id] || 0) + qty * multiplier;
}

function describeItems(items = {}) {
  return Object.entries(items).filter(([, qty]) => qty > 0).map(([id, qty]) => `${ITEMS[id].name} ${qty}`).join(' · ') || '없음';
}

export function getWeather(state) {
  const day = state.day;
  const cold = day >= 4 && day <= 8;
  const temperatures = [0, 17, 16, 12, 7, 3, -2, -1, 5, 12, 16, 17, 18];
  return { cold, label: cold ? (day === 6 || day === 7 ? '혹한' : '겨울') : '온화', temperature: temperatures[Math.min(day, 12)], fuelNeeded: cold ? (day === 6 || day === 7 ? 2 : 1) : 0 };
}

export function createGame(seed = Date.now(), options = {}) {
  if (!plain(options)) throw new Error('새 게임 설정이 올바르지 않습니다.');
  const difficulty = options.difficulty === undefined ? 'standard' : options.difficulty;
  if (typeof difficulty !== 'string' || !own(DIFFICULTIES, difficulty)) throw new Error('표준 또는 봉쇄 난이도를 선택하세요.');
  const normalizedSeed = Number.isFinite(seed) ? Math.floor(seed) >>> 0 : 1;
  const state = {
    version: 1, seed: normalizedSeed, rng: normalizedSeed, day: 1, phase: 'day', clock: DAY_START,
    difficulty, campaign: campaignMetadata(difficulty), shelterIntegrity: 100, relief: newRelief(),
    paused: true, speed: 1, selectedId: 'mira',
    revision: { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 },
    inventory: { ...DIFFICULTIES[difficulty].startingStock },
    characters: [
      { id: 'mira', name: '미라', role: '간호사', trait: '자신과 동료에게 약품·붕대를 사용할 때 추가 회복', color: '#a8c1b0', capacity: 10, health: 100, hunger: 12, fatigue: 18, morale: 72, illness: 0, alive: true, job: null, queue: [] },
      { id: 'yun', name: '윤', role: '정비공', trait: '제작·건설 작업 시간 20% 단축', color: '#dbb17d', capacity: 12, health: 100, hunger: 10, fatigue: 22, morale: 68, illness: 0, alive: true, job: null, queue: [] },
      { id: 'leo', name: '레오', role: '배달원', trait: '15칸의 넉넉한 수색 가방', color: '#91b1c8', capacity: 15, health: 100, hunger: 8, fatigue: 12, morale: 70, illness: 0, alive: true, job: null, queue: [] },
    ],
    facilities: { bed: 1, stove: 1, workshop: 1, collector: 0, heater: 0, barricade: 0, trap: 0, radio: 0 },
    cleared: 0, visitor: null, logs: [], stats: { daysSurvived: 0, mealsEaten: 0, crafted: 0, built: 0, helped: 0, trades: 0, thefts: 0, kills: 0, raids: 0, suppliesRecovered: 0, scavenges: 0, jobsCompleted: 0, jobSeq: 0, distractions: 0 },
    report: null, ending: null, history: [], nightPlan: null, locations: {},
  };
  log(state, '12일 뒤 인도주의 통로가 열립니다. 오늘은 식사와 휴식을 살피고, 밤에 필요한 물자를 찾아오세요.');
  log(state, '4일부터 추위가 옵니다. 목재와 부품을 모아 난로를 준비하세요.');
  if (difficulty === 'siege') log(state, '봉쇄 조건: 적은 초기 보급, 밤마다 허기 +21. 늘어난 습격과 문 보강 마모에 대비하세요.');
  return state;
}

function actionDefinitions(state, actor) {
  const weather = getWeather(state);
  const eatItem = state.inventory.meal > 0 ? 'meal' : 'raw';
  const a = {
    eat: { name: eatItem === 'meal' ? '식사하기' : '날음식 먹기', description: eatItem === 'meal' ? '식사 1로 허기 42 회복. 음식은 자동 소비되지 않습니다.' : '식재료 1로 허기 22 회복. 사기 2가 줄어듭니다.', cost: { [eatItem]: 1 }, duration: 0, target: 'kitchen', category: 'survival', eatItem },
    rest: { name: '낮잠 자기', description: '피로 42와 체력 5를 회복합니다. 밤 역할에 앞서 쉬어 두세요.', cost: {}, duration: 180, target: 'bed', category: 'survival' },
    water: { name: weather.cold ? '눈 녹이기' : '물 모으기', description: weather.cold ? '연료 1을 써서 물 5를 확보합니다.' : state.facilities.collector ? '집수기로 물 6을 확보합니다.' : '주변에서 물 3을 모읍니다. 집수기를 만들면 더 효율적입니다.', cost: weather.cold ? { fuel: 1 } : {}, output: { water: weather.cold ? 5 : state.facilities.collector ? 6 : 3 }, duration: weather.cold ? 100 : state.facilities.collector ? 65 : 100, target: 'water', category: 'survival' },
    heal: { name: '약품 사용', description: `질병 ${actor?.id === 'mira' ? 50 : 40} 완화, 체력 ${actor?.id === 'mira' ? 30 : 20} 회복.`, cost: { meds: 1 }, duration: 45, target: 'bed', category: 'survival' },
    bandage: { name: '상처 치료', description: `붕대로 체력 ${actor?.id === 'mira' ? 45 : 35}를 회복합니다.`, cost: { bandage: 1 }, duration: 35, target: 'bed', category: 'survival' },
    talk: { name: living(state).length > 1 ? '이야기 나누기' : '라디오 듣기', description: '자신의 사기 18, 동료들의 사기 5 회복. 잠시 함께 버틸 이유를 찾습니다.', cost: {}, duration: 90, target: 'radio', category: 'survival' },
    clear: { name: '잔해 정리', description: `목재 3 · 부품 4 · 천 1을 확보합니다. 남은 구역 ${Math.max(0, 4 - state.cleared)}곳.`, cost: {}, duration: 120, target: 'rubble', category: 'craft', output: { wood: 3, parts: 4, cloth: 1 }, clearIndex: state.cleared },
    repairShelter: { name: '은신처 수리', description: `목재 2 · 부품 1로 내구도를 최대 35 회복합니다. 현재 ${getShelterStatus(state).integrity}/100. 문 보강의 방어 효과를 되살립니다.`, cost: { ...REPAIR_COST }, duration: 70, target: 'door', category: 'build' },
  };
  for (const [id, recipe] of Object.entries(RECIPES)) a[id] = { ...recipe, cost: { ...recipe.cost }, output: recipe.output ? { ...recipe.output } : undefined, description: recipe.facility ? FACILITIES[recipe.facility].description : `완료 시 ${describeItems(recipe.output)}을 얻습니다.` };
  if (state.facilities.stove >= 2) a.cook.cost.water = 1;
  a.buildRadio.description = '목재 2 · 부품 5로 무전기를 복구합니다. 모두의 사기 +3. 4일째부터 구호팀과 교신할 수 있습니다.';
  a.contactRelief.description = '4일째부터 가능. 부품 2 · 연료 1로 구호팀과 연락하고 모두의 사기 +5. 다음 아침 식재료 2 · 약품 1 · 붕대 1 · 연료 2가 도착합니다.';
  a.prepareEvacuation.description = '9일째부터 가능. 식사 3 · 물 4 · 붕대 1을 대피용으로 봉인합니다. 모두의 사기 +8, 준비된 대피 후일담. 12일 생존 목표는 같습니다.';
  a.cook.description = `식재료 1 · 물 ${a.cook.cost.water} · 연료 1로 식사 2를 만듭니다.`;
  a.buildBarricade.cost = { wood: 5 + state.facilities.barricade * 2, parts: 4 + state.facilities.barricade };
  for (const [id, def] of Object.entries(a)) {
    def.id = id;
    if (actor?.id === 'yun' && (def.category === 'craft' || def.category === 'build')) def.duration = Math.ceil(def.duration * 0.8);
    if (actor && def.duration && actor.illness >= 60) def.duration = Math.ceil(def.duration * 1.2);
    if (actor && def.duration && actor.morale < 25) def.duration = Math.ceil(def.duration * 1.15);
    if (def.facility) def.level = state.facilities[def.facility] + 1;
  }
  return a;
}

function actionReason(state, actor, action) {
  if (state.phase !== 'day') return '낮에만 할 수 있는 행동입니다.';
  if (!actor?.alive || actor.health <= 0) return '활동 가능한 생존자를 선택하세요.';
  if (actor.job) return '현재 작업을 마치거나 취소해 주세요.';
  if (['heal', 'bandage'].includes(action.id) && state.characters.some(c => c.job?.careTargetId === actor.id)) return '동료에게 치료를 받고 있습니다.';
  const relief = reliefState(state);
  if (action.id === 'contactRelief') {
    if (relief.contacted) return '이미 구호팀과 교신했습니다.';
    if (!state.facilities.radio) return '먼저 무전기를 복구하세요.';
    if (state.day < 4) return '구호팀은 4일째부터 교신할 수 있습니다.';
    if (state.characters.some(c => c.job?.actionId === 'contactRelief')) return '동료가 이미 구호팀과 교신 중입니다.';
  }
  if (action.id === 'prepareEvacuation') {
    if (relief.prepared) return '대피 물자는 이미 봉인했습니다.';
    if (!relief.contacted) return '먼저 구호팀과 교신하세요.';
    if (state.day < 9) return '대피 경로는 9일째에 확정됩니다.';
    if (state.characters.some(c => c.job?.actionId === 'prepareEvacuation')) return '동료가 이미 대피 물자를 준비 중입니다.';
  }
  if (action.id === 'eat' && actor.hunger <= 0) return '아직 배가 고프지 않습니다.';
  if (action.id === 'rest' && actor.fatigue <= 0 && actor.health >= 100) return '이미 충분히 쉬었습니다.';
  if (action.id === 'rest' && state.characters.filter(c => c.alive && c.job?.actionId === 'rest').length >= state.facilities.bed) return '모든 침대를 사용 중입니다.';
  if (action.id === 'heal' && actor.illness <= 0 && actor.health >= 100) return '약품이 필요한 상태가 아닙니다.';
  if (action.id === 'bandage' && actor.health >= 100) return '치료할 상처가 없습니다.';
  if (action.id === 'talk' && living(state).every(c => c.morale >= 100)) return '모두 마음이 안정되어 있습니다.';
  if (action.id === 'clear' && state.cleared >= 4) return '정리할 잔해가 남아 있지 않습니다.';
  if (action.id === 'clear' && state.characters.some(c => c.job?.actionId === 'clear')) return '동료가 이미 잔해를 정리하고 있습니다.';
  if (action.id === 'repairShelter' && getShelterStatus(state).integrity >= 100) return '은신처 내구도가 이미 최대입니다.';
  if (action.id === 'repairShelter' && state.characters.some(c => c.job?.actionId === 'repairShelter')) return '동료가 이미 은신처를 수리하고 있습니다.';
  if (action.facility && state.facilities[action.facility] >= FACILITIES[action.facility].maxLevel) return '이미 가능한 만큼 설치·개선했습니다.';
  if (action.facility && state.characters.some(c => c.job?.facility === action.facility)) return '같은 시설의 설치·개선이 진행 중입니다.';
  if (state.clock + action.duration > DAY_END + 0.001) return '오늘 남은 시간이 부족합니다. 내일 시작해 주세요.';
  return shortage(state.inventory, action.cost);
}

function queuedPreview(state, actor) {
  if (!actor?.alive || state.phase !== 'day' || (!actor.job && !actor.queue?.length)) return state;
  const future = clone(state);
  // Reuse the real scheduler. Pending jobs are predictions, never reservations.
  advanceDay(future, DAY_END - future.clock, actor.id);
  return future;
}

export function getActions(state, charId = state.selectedId) {
  const actor = characterById(state, charId);
  const definitions = actionDefinitions(state, actor);
  const fullQueue = (actor?.queue?.length || 0) >= QUEUE_LIMIT;
  const future = fullQueue ? state : queuedPreview(state, actor);
  const futureActor = characterById(future, charId);
  const queuedDefinitions = actionDefinitions(future, futureActor);
  return ACTION_IDS.map(id => {
    const action = definitions[id];
    const reason = actionReason(state, actor, action);
    const futureAction = queuedDefinitions[id];
    const queuedReason = fullQueue ? '대기 중인 작업은 최대 3개입니다.' : actionReason(future, futureActor, futureAction);
    const queueReason = queuedReason && future !== state ? `앞선 작업 뒤: ${queuedReason}` : queuedReason;
    return { ...action, cost: { ...action.cost }, available: !reason, reason, queueable: !queueReason, queueReason, queueCost: { ...futureAction.cost }, queueDuration: futureAction.duration };
  });
}

/** A read-only view of the optional campaign arc; costs remain normal jobs. */
export function getReliefStatus(state) {
  const relief = reliefState(state);
  const steps = [
    { id: 'radio', title: '무전기 복구', description: '고장 난 무전기를 고쳐 구호팀의 신호를 받을 준비를 합니다. 모두의 사기 +3.', actionId: 'buildRadio', unlockDay: 1, done: !!state.facilities.radio },
    { id: 'contact', title: '구호팀과 교신', description: '4일째부터 구호 주파수가 열립니다. 교신을 마치면 다음 아침에 보급품이 한 번 도착하고 모두의 사기 +5.', actionId: 'contactRelief', unlockDay: 4, done: relief.contacted },
    { id: 'prepare', title: '대피 물자 봉인', description: '9일째부터 경로가 확정됩니다. 대피용 식사·물·붕대를 봉인하면 모두의 사기 +8과 준비된 대피 후일담을 얻습니다.', actionId: 'prepareEvacuation', unlockDay: 9, done: relief.prepared },
  ];
  const stages = steps.map(step => {
    const recipe = RECIPES[step.actionId];
    const worker = state.characters.find(person => person.alive && person.job?.actionId === step.actionId);
    let reason = '';
    if (!step.done && !worker) {
      if (step.id === 'contact' && !state.facilities.radio) reason = '먼저 무전기를 복구하세요.';
      else if (step.id === 'prepare' && !relief.contacted) reason = '먼저 구호팀과 교신하세요.';
      else if (state.day < step.unlockDay) reason = `${step.unlockDay}일째부터 준비할 수 있습니다.`;
      else if (state.phase !== 'day') reason = '다음 낮에 작업을 맡길 수 있습니다.';
      else {
        // A busy selected survivor must not hide an available project from the
        // whole shelter. The UI selects a worker and uses getActions for timing.
        const definitions = living(state).map(person => ({ person, action: actionDefinitions(state, person)[step.actionId] }));
        const available = definitions.some(({ person, action }) => !actionReason(state, person, action));
        if (!available) reason = shortage(state.inventory, recipe.cost) || (living(state).every(person => person.job) ? '생존자가 작업 중입니다. 대기열에 예약하거나 작업이 끝난 뒤 맡기세요.' : '오늘 남은 시간과 생존자 상태를 확인하세요.');
      }
    }
    return {
      id: step.id, title: step.title, description: step.description, actionId: step.actionId,
      status: step.done ? 'complete' : worker ? 'in-progress' : reason ? 'locked' : 'available',
      reason, cost: { ...recipe.cost }, duration: recipe.duration, unlockDay: step.unlockDay,
      workerId: worker?.id || null,
    };
  });
  return {
    stages, completed: stages.filter(step => step.status === 'complete').length, total: stages.length,
    next: stages.find(step => step.status !== 'complete') || null,
    delivery: { scheduled: relief.contacted && !relief.delivered, day: relief.deliveryDay, delivered: relief.delivered, items: { ...RELIEF_SUPPLIES } },
    contacted: relief.contacted, prepared: relief.prepared,
    routeLabel: relief.prepared ? '구호팀과 합의한 대피' : '12일 생존 후 통로로 대피',
  };
}

/** Prioritise real state, without advancing time, jobs, inventories, or RNG. */
export function getSurvivalAdvice(state) {
  if (state.phase === 'ended') return [];
  const advice = [];
  const people = living(state);
  const add = entry => { if (advice.length < 4) advice.push(entry); };
  const hurt = [...people].sort((a, b) => a.health - b.health).find(person => person.health < 45);
  if (hurt) add({ id: 'health', title: `${hurt.name}의 상처를 돌보세요`, description: state.inventory.bandage ? `건강 ${Math.round(hurt.health)}. 붕대를 배분하거나 미라에게 동료 치료를 맡기세요.` : `건강 ${Math.round(hurt.health)}. 붕대가 없습니다. 휴식과 의료 물자 확보가 필요합니다.`, severity: 'critical', actionId: state.inventory.bandage ? 'bandage' : 'rest', category: 'survival', characterId: hurt.id });
  const ill = [...people].sort((a, b) => b.illness - a.illness).find(person => person.illness >= 45);
  if (ill) add({ id: 'illness', title: `${ill.name}에게 치료가 필요합니다`, description: `질병 ${Math.round(ill.illness)}. ${state.inventory.meds ? '약품을 배분하거나 미라에게 동료 치료를 맡기세요.' : '약품이 없습니다. 진료소와 상인에게서 의료품을 확보하세요.'}`, severity: ill.illness >= 60 ? 'critical' : 'warning', ...(state.inventory.meds ? { actionId: 'heal', category: 'survival', characterId: ill.id } : {}) });
  const hungry = [...people].sort((a, b) => b.hunger - a.hunger).find(person => person.hunger >= 60);
  if (hungry) add({ id: 'hunger', title: `${hungry.name}에게 식사를 배분하세요`, description: `포만 ${Math.round(100 - hungry.hunger)}. ${state.inventory.meal ? '조리한 식사는 자동으로 먹지 않습니다.' : state.inventory.raw ? '식사를 조리하거나 급하면 날음식을 배분할 수 있습니다.' : '식량이 없습니다. 상인과 수색 장소의 식재료를 확인하세요.'}`, severity: hungry.hunger >= 75 ? 'critical' : 'warning', ...((state.inventory.meal || state.inventory.raw) ? { actionId: 'eat', category: 'survival', characterId: hungry.id } : {}) });
  const weather = getWeather(state);
  const coldSoon = weather.cold || state.day === 3;
  if (coldSoon && !state.facilities.heater) add({ id: 'heater', title: weather.cold ? '오늘 밤을 위한 난로가 필요합니다' : '내일부터 추위가 찾아옵니다', description: '4~8일은 추운 밤입니다. 난로를 설치하고 은신처에 연료를 남겨 두세요.', severity: weather.cold ? 'critical' : 'warning', actionId: 'buildHeater', category: 'build', characterId: people.find(person => person.id === 'yun')?.id || people[0]?.id });
  else if (weather.cold && state.inventory.fuel < weather.fuelNeeded) add({ id: 'heat-fuel', title: '난방 연료를 남겨 두세요', description: `오늘 밤 필요 ${weather.fuelNeeded}, 현재 ${state.inventory.fuel}. 수색에서 돌아올 연료는 지난밤 난방에 사용할 수 없습니다.`, severity: 'critical', actionId: 'fuel', category: 'craft', characterId: people.find(person => person.id === 'yun')?.id || people[0]?.id });
  const tired = [...people].sort((a, b) => b.fatigue - a.fatigue).find(person => person.fatigue >= 70);
  if (tired) add({ id: 'fatigue', title: `${tired.name}에게 휴식을 주세요`, description: `기력 ${Math.round(100 - tired.fatigue)}. 낮잠을 자거나 오늘 밤 수면 역할을 배정하세요.`, severity: tired.fatigue >= 90 ? 'critical' : 'warning', actionId: 'rest', category: 'survival', characterId: tired.id });
  const shelter = getShelterStatus(state);
  if (shelter.barricadeLevel && shelter.integrity <= 65) add({ id: 'repair', title: '문 보강의 효과가 줄었습니다', description: `은신처 내구도 ${Math.round(shelter.integrity)}%. 수리로 최대 35를 회복하고 밤의 방어력을 되살리세요.`, severity: shelter.integrity <= 30 ? 'critical' : 'warning', actionId: 'repairShelter', category: 'build', characterId: people.find(person => person.id === 'yun')?.id || people[0]?.id });
  if (state.inventory.meal < people.length) add({ id: 'meals', title: '다음 끼니를 준비하세요', description: `식사 ${state.inventory.meal}개, 생존자 ${people.length}명. ${state.inventory.raw ? '식재료 하나를 두 끼로 조리할 수 있습니다.' : '식재료가 없어 수색이나 교환이 필요합니다.'}`, severity: state.inventory.meal ? 'info' : 'warning', ...(state.inventory.raw ? { actionId: 'cook', category: 'survival', characterId: people.find(person => person.id === 'mira')?.id || people[0]?.id } : {}) });
  const next = getReliefStatus(state).next;
  if (next) add({ id: 'relief', title: `장기 목표: ${next.title}`, description: next.status === 'in-progress' ? '동료가 작업 중입니다. 다른 생존자의 생활을 돌볼 수 있습니다.' : next.reason || next.description, severity: 'info', actionId: next.actionId, category: RECIPES[next.actionId].category });
  if (!advice.length) add({ id: 'night', title: '밤 역할과 귀환 준비를 확인하세요', description: '긴급한 생존 문제가 없습니다. 수색할 물자와 남길 경계 인원, 침대 배정을 정하고 오늘을 마무리하세요.', severity: 'info' });
  return advice;
}

function completeAction(state, actor, job) {
  const id = job.actionId || job.id;
  const patient = job.careTargetId ? characterById(state, job.careTargetId) : actor;
  if (job.careTargetId && (!patient?.alive || patient.health <= 0)) {
    changeItems(state.inventory, job.cost || {});
    log(state, `${actor.name}: 치료할 동료가 없어 ${job.label}을 취소하고 치료품을 돌려받았습니다.`);
    return;
  }
  const relief = reliefState(state);
  if ((id === 'buildRadio' && state.facilities.radio) || (id === 'contactRelief' && relief.contacted) || (id === 'prepareEvacuation' && relief.prepared)) {
    changeItems(state.inventory, job.cost || {});
    log(state, `${actor.name}: 이미 마친 준비이므로 ${job.label} 재료를 돌려받았습니다.`);
    return;
  }
  if (id === 'buildRadio') for (const person of living(state)) person.morale = clamp(person.morale + 3);
  if (id === 'contactRelief') {
    state.relief ||= newRelief();
    Object.assign(state.relief, { contacted: true, contactDay: state.day, deliveryDay: state.day + 1 });
    for (const person of living(state)) person.morale = clamp(person.morale + 5);
    log(state, `구호팀과 연결되었습니다. ${state.relief.deliveryDay}일째 아침에 ${describeItems(RELIEF_SUPPLIES)}이 도착합니다.`, 'good');
  }
  if (id === 'prepareEvacuation') {
    state.relief ||= newRelief();
    Object.assign(state.relief, { prepared: true, preparedDay: state.day });
    for (const person of living(state)) person.morale = clamp(person.morale + 8);
    log(state, '식사와 물, 붕대를 대피용으로 봉인했습니다. 12번째 밤을 버티면 합의한 경로로 출발합니다.', 'good');
  }
  if (id === 'rest') { actor.fatigue = clamp(actor.fatigue - 42); actor.health = clamp(actor.health + 5); actor.morale = clamp(actor.morale + 2); }
  if (id === 'heal') { patient.illness = clamp(patient.illness - (actor.id === 'mira' ? 50 : 40)); patient.health = clamp(patient.health + (actor.id === 'mira' ? 30 : 20)); }
  if (id === 'bandage') patient.health = clamp(patient.health + (actor.id === 'mira' ? 45 : 35));
  if (id === 'talk') for (const person of living(state)) person.morale = clamp(person.morale + (person.id === actor.id ? 18 : 5));
  if (job.output) changeItems(state.inventory, job.output);
  if (id === 'clear') state.cleared = Math.min(4, state.cleared + 1);
  if (id === 'repairShelter') state.shelterIntegrity = clamp(getShelterStatus(state).integrity + REPAIR_AMOUNT);
  if (job.facility) { state.facilities[job.facility] = Math.min(FACILITIES[job.facility].maxLevel, (state.facilities[job.facility] || 0) + 1); state.stats.built++; }
  if (job.category === 'craft' || id === 'cook') state.stats.crafted++;
  state.stats.jobsCompleted++;
  log(state, `${actor.name}: ${job.label} 완료${job.output ? ` — ${describeItems(job.output)}` : ''}`, 'good');
}

function startAction(state, actor, action, careTargetId = null) {
  const actionId = action.id;
  changeItems(state.inventory, action.cost, -1);
  state.paused = false;
  if (actionId === 'eat') {
    actor.hunger = clamp(actor.hunger - (action.eatItem === 'meal' ? 42 : 22));
    actor.morale = clamp(actor.morale + (action.eatItem === 'meal' ? 3 : -2));
    state.stats.mealsEaten++;
    log(state, `${actor.name}가 ${action.eatItem === 'meal' ? '따뜻한 식사를 했습니다.' : '날음식으로 허기를 달랬습니다.'}`, 'good');
    return { ok: true };
  }
  state.stats.jobSeq++;
  actor.job = { id: actionId, actionId, ticket: state.stats.jobSeq, label: action.name, target: action.target, remaining: action.duration, total: action.duration, cost: { ...action.cost }, category: action.category };
  if (action.output) actor.job.output = { ...action.output };
  if (action.facility) { actor.job.facility = action.facility; actor.job.level = action.level; }
  if (careTargetId) actor.job.careTargetId = careTargetId;
  return { ok: true };
}

export function performAction(state, charId, actionId) {
  if (!ACTION_IDS.includes(actionId)) return fail('알 수 없는 행동입니다.');
  const actor = characterById(state, charId);
  const action = actionDefinitions(state, actor)[actionId];
  const reason = actionReason(state, actor, action);
  if (reason) return fail(reason);
  return startAction(state, actor, action);
}

export function enqueueAction(state, charId, actionId) {
  if (!ACTION_IDS.includes(actionId)) return fail('알 수 없는 행동입니다.');
  const action = getActions(state, charId).find(entry => entry.id === actionId);
  if (!action.queueable) return fail(action.queueReason);
  const actor = characterById(state, charId);
  actor.queue ||= [];
  actor.queue.push(actionId);
  state.paused = false;
  // An idle survivor starts now; busy survivors reserve nothing until completion.
  startQueuedJobs(state, actor.id);
  return { ok: true };
}

export function removeQueuedAction(state, charId, index) {
  if (state.phase !== 'day') return fail('낮에만 대기 중인 작업을 바꿀 수 있습니다.');
  const actor = characterById(state, charId);
  if (!actor?.alive || !integer(index, 0, QUEUE_LIMIT - 1) || !actor.queue || index >= actor.queue.length) return fail('취소할 대기 작업을 선택하세요.');
  const [actionId] = actor.queue.splice(index, 1);
  log(state, `${actor.name}: 대기 중인 ${actionDefinitions(state, actor)[actionId].name} 취소. 예약 재료는 사용하지 않았습니다.`);
  return { ok: true };
}

export function performCare(state, healerId, targetId, kind = 'bandage') {
  if (state.phase !== 'day') return fail('낮에만 동료를 치료할 수 있습니다.');
  if (!['bandage', 'meds'].includes(kind)) return fail('붕대 또는 약품을 선택하세요.');
  const healer = characterById(state, healerId);
  const patient = characterById(state, targetId);
  if (!healer?.alive || healer.health <= 0) return fail('치료할 생존자를 선택하세요.');
  if (healer.job) return fail('치료자는 현재 작업을 먼저 마치거나 취소해야 합니다.');
  if (!patient?.alive || patient.health <= 0) return fail('살아 있는 동료만 치료할 수 있습니다.');
  if (kind === 'bandage' && patient.health >= 100) return fail('동료에게 치료할 상처가 없습니다.');
  if (kind === 'meds' && patient.health >= 100 && patient.illness <= 0) return fail('동료에게 약품이 필요한 상태가 아닙니다.');
  if (state.characters.some(c => c.job?.careTargetId === targetId || (c.id === targetId && ['heal', 'bandage'].includes(c.job?.actionId)))) return fail('이미 치료 중인 동료입니다.');
  const action = { ...actionDefinitions(state, healer)[kind === 'meds' ? 'heal' : 'bandage'] };
  action.name = `${patient.name} ${kind === 'meds' ? '약품 치료' : '상처 치료'}`;
  if (state.clock + action.duration > DAY_END + TIME_EPSILON) return fail('오늘 남은 시간이 부족합니다. 내일 치료해 주세요.');
  const reason = shortage(state.inventory, action.cost);
  if (reason) return fail(reason);
  return startAction(state, healer, action, targetId);
}

export function cancelJob(state, charId) {
  if (state.phase !== 'day') return fail('현재는 작업을 취소할 수 없습니다.');
  const actor = characterById(state, charId);
  if (!actor?.job) return fail('진행 중인 작업이 없습니다.');
  const job = actor.job;
  changeItems(state.inventory, job.cost || {});
  actor.job = null;
  log(state, `${actor.name}의 ${job.label} 취소. 투입 재료를 돌려받았습니다.`);
  return { ok: true };
}

function startQueuedJobs(state, onlyId = null) {
  for (const actor of living(state)) {
    if (onlyId && actor.id !== onlyId) continue;
    while (!actor.job && actor.queue?.length && state.clock < DAY_END - TIME_EPSILON) {
      const actionId = actor.queue.shift();
      const action = actionDefinitions(state, actor)[actionId];
      const reason = action ? actionReason(state, actor, action) : '알 수 없는 작업';
      if (reason) { log(state, `${actor.name}: 예약 작업 ${action?.name || actionId} 취소 — ${reason}`, 'info'); continue; }
      startAction(state, actor, action);
    }
  }
}

function clearDepartedWork(state) {
  for (const actor of state.characters) {
    if (actor.alive && actor.health > 0) continue;
    actor.alive = false; actor.health = 0;
    if (actor.job) { changeItems(state.inventory, actor.job.cost || {}); actor.job = null; }
    if (actor.queue?.length) { actor.queue = []; log(state, `${actor.name}의 대기 작업을 정리했습니다.`); }
  }
}

function closeDay(state) {
  for (const actor of state.characters) {
    if (actor.job) { changeItems(state.inventory, actor.job.cost || {}); actor.job = null; }
    if (actor.queue?.length) log(state, `${actor.name}: 밤이 되어 남은 대기 작업 ${actor.queue.length}개를 취소했습니다.`);
    actor.queue = [];
  }
  state.clock = DAY_END; state.phase = 'planning'; state.paused = true;
  log(state, '밤이 왔습니다. 수색자와 경비, 잠들 사람을 정하세요.');
}

function advanceDay(state, minutes, stopWhenIdleId = null) {
  const horizon = roundTime(Math.min(DAY_END, state.clock + Math.max(0, minutes)));
  // Process every completion boundary, rather than granting the whole tick only
  // to its initial jobs. All simultaneous outputs arrive before queues compete.
  while (state.phase === 'day') {
    clearDepartedWork(state);
    const completed = living(state).filter(actor => actor.job && actor.job.remaining <= TIME_EPSILON).map(actor => ({ actor, job: actor.job }));
    for (const { actor } of completed) actor.job = null;
    for (const { actor, job } of completed) completeAction(state, actor, job);
    if (state.clock >= DAY_END - TIME_EPSILON) { closeDay(state); return true; }
    startQueuedJobs(state);
    const watched = stopWhenIdleId ? characterById(state, stopWhenIdleId) : null;
    if (watched && !watched.job && !watched.queue?.length) break;
    if (state.clock >= horizon - TIME_EPSILON) break;
    const jobs = living(state).filter(actor => actor.job);
    const segment = Math.min(horizon - state.clock, ...jobs.map(actor => actor.job.remaining));
    for (const actor of jobs) actor.job.remaining = Math.max(0, roundTime(actor.job.remaining - segment));
    state.clock = roundTime(Math.min(DAY_END, state.clock + segment));
  }
  return false;
}

export function tickDay(state, deltaSeconds) {
  if (state.phase !== 'day' || state.paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return { changed: false };
  const before = state.clock;
  const speed = Number.isFinite(state.speed) && state.speed >= 0.5 && state.speed <= 20 ? state.speed : 1;
  const phaseChanged = advanceDay(state, Math.min(deltaSeconds, 3600) * 12 * speed);
  return { changed: state.clock !== before, phaseChanged };
}

export function endDay(state) {
  if (state.phase !== 'day') return fail('이미 낮이 끝났습니다.');
  advanceDay(state, DAY_END - state.clock);
  if (state.phase === 'day') closeDay(state);
  return { ok: true };
}

export function getGameRevision(state) {
  const rev = state?.revision || { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 };
  return {
    phase: state?.phase || 'day',
    day: state?.day || 1,
    slot_holder_rev: rev.slot_holder_rev || 1,
    owner_rev: rev.owner_rev || 1,
    plan_rev: rev.plan_rev || 1,
    target_rev: rev.target_rev || 1,
  };
}

export function bumpGameRevision(state, field = 'plan_rev') {
  if (!state) return getGameRevision(state);
  state.revision ||= { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 };
  if (own(state.revision, field)) state.revision[field] += 1;
  else state.revision.plan_rev += 1;
  return getGameRevision(state);
}

export function beginNight(state, plan) {
  if (state.phase !== 'planning') return fail('밤 계획 화면에서 출발해 주세요.');
  if (!plain(plan) || !plain(plan.roles)) return fail('밤 역할을 지정해 주세요.');
  const people = living(state);
  if (!people.length) return fail('활동 가능한 생존자가 없습니다.');
  const scavengerId = plan.scavengerId || null;
  const scavenger = scavengerId ? characterById(state, scavengerId) : null;
  if (scavengerId && !scavenger?.alive) return fail('활동 가능한 수색자를 선택하세요.');
  const companionId = plan.companionId || null;
  const companion = companionId ? characterById(state, companionId) : null;
  if (companionId && (!scavengerId || companionId === scavengerId || !companion?.alive)) {
    return fail('동행 AI 동료는 수색자와 다른 활동 가능한 생존자여야 합니다.');
  }
  const roles = {};
  for (const [id, role] of Object.entries(plan.roles)) {
    const allowed = id === companionId ? ['companion', 'guard', 'sleep'] : ['guard', 'sleep', 'scavenge'];
    if (!people.some(c => c.id === id) || !allowed.includes(role)) return fail('생존자 또는 밤 역할이 올바르지 않습니다.');
  }
  for (const actor of people) {
    const rawRole = plan.roles[actor.id];
    const role = actor.id === companionId ? 'companion' : rawRole;
    if (!['guard', 'sleep', 'scavenge', 'companion'].includes(role)) return fail(`${actor.name}의 밤 역할을 정하세요.`);
    if ((role === 'scavenge') !== (actor.id === scavengerId)) return fail('수색자는 한 명만 지정하고 역할도 수색으로 맞춰 주세요.');
    roles[actor.id] = role;
  }
  const loadout = normalizeItems(plan.loadout || {});
  if (!loadout) return fail('가방에는 올바른 품목과 정수 수량만 넣을 수 있습니다.');
  if (!scavenger && (Object.keys(loadout).length || plan.locationId)) return fail('수색을 쉬는 밤에는 목적지와 반출 물자를 비워 주세요.');
  if (scavenger && (!own(LOCATION_RULES, plan.locationId) || state.day < LOCATION_RULES[plan.locationId])) return fail('오늘 방문할 수 있는 장소를 선택하세요.');
  if (scavenger && usedSlots(loadout) > scavenger.capacity) return fail('가방의 빈칸이 부족합니다.');
  const reason = shortage(state.inventory, loadout);
  if (reason) return fail(reason);
  const preNightInventory = clone(state.inventory);
  changeItems(state.inventory, loadout, -1);
  state.nightPlan = { id: `night-${state.day}`, day: state.day, scavengerId, companionId, charId: scavengerId, locationId: scavenger ? plan.locationId : null, roles, loadout: clone(loadout), preNightInventory, remainingInventory: clone(state.inventory), resolved: false };
  state.phase = 'expedition'; state.paused = true;
  bumpGameRevision(state, 'plan_rev');
  if (scavenger) state.stats.scavenges++;
  log(state, scavenger ? `${scavenger.name}${companion ? `와 동료 AI ${companion.name}` : ''}가 수색을 떠났습니다. 반출: ${describeItems(loadout)}.` : '오늘은 모두 피난처에 남습니다.');
  return { ok: true, context: { character: scavenger ? clone(scavenger) : null, scavenger: scavenger ? clone(scavenger) : null, companion: companion ? clone(companion) : null, companionId, charId: scavengerId, scavengerId, loadout: clone(loadout), locationId: state.nightPlan.locationId, capacity: scavenger?.capacity || 0 } };
}

function safeLocation(location) {
  if (!plain(location) || !plain(location.remaining)) return false;
  if (Object.keys(location.remaining).length > 500) return false;
  for (const [id, items] of Object.entries(location.remaining)) if (id.length > 120 || !normalizeItems(items)) return false;
  if (location.opened !== undefined && (!plain(location.opened) || Object.values(location.opened).some(v => typeof v !== 'boolean'))) return false;
  if (location.visits !== undefined && !integer(location.visits, 0, 10000)) return false;
  if (location.npcState !== undefined && (!plain(location.npcState) || Object.values(location.npcState).some(v => !plain(v) || (v.health !== undefined && !finite(v.health)) || (v.removed !== undefined && typeof v.removed !== 'boolean')))) return false;
  if (location.dropped !== undefined && (!Array.isArray(location.dropped) || location.dropped.length > 500 || location.dropped.some(v => !plain(v) || typeof v.id !== 'string' || !finite(v.x, -200, 1480) || !integer(v.floor, 0, 2)))) return false;
  if (location.nextDropId !== undefined && !integer(location.nextDropId)) return false;
  if (location.doors !== undefined && (!plain(location.doors) || Object.keys(location.doors).length > 100 || Object.entries(location.doors).some(([id, door]) => id.length > 120 || !plain(door) || typeof door.open !== 'boolean' || typeof door.locked !== 'boolean'))) return false;
  if (location.explored !== undefined && (!Array.isArray(location.explored) || location.explored.length > 500 || location.explored.some(area => !plain(area) || !integer(area.floor, 0, 2) || !finite(area.min, 0, 1280) || !finite(area.max, area.min, 1280)))) return false;
  for (const key of ['knownLootIds', 'knownDoorIds']) if (location[key] !== undefined && (!Array.isArray(location[key]) || location[key].length > 500 || location[key].some(id => typeof id !== 'string' || id.length > 120))) return false;
  if (location.encounters !== undefined && (!plain(location.encounters) || Object.keys(location.encounters).length > 20 || Object.entries(location.encounters).some(([id, entry]) => id.length > 120 || !plain(entry) || typeof entry.requested !== 'boolean' || typeof entry.resolved !== 'boolean' || ![null, 'help', 'trade'].includes(entry.choiceId)))) return false;
  if (location.permissions !== undefined && (!plain(location.permissions) || Object.keys(location.permissions).length > 20 || Object.entries(location.permissions).some(([id, entry]) => id.length > 120 || !plain(entry) || typeof entry.area !== 'boolean' || typeof entry.loot !== 'boolean'))) return false;
  if (location.hostileNpcIds !== undefined && (!Array.isArray(location.hostileNpcIds) || location.hostileNpcIds.length > 16 || location.hostileNpcIds.some(id => typeof id !== 'string' || id.length > 120))) return false;
  return true;
}

function raidWear(profile, threat, defense, integrity) {
  const nominal = Math.ceil((3 + threat / 10 + Math.max(0, threat - defense) * .12) * profile.wearMultiplier);
  return Math.min(integrity, clamp(nominal, 2, 18));
}

function nightPressure(state, people, roles, inventory) {
  const profile = difficultyProfile(state);
  const shelter = getShelterStatus(state);
  const guards = people.filter(c => roles[c.id] === 'guard');
  let defense = 3 + shelter.barricadeDefense + guards.reduce((n, c) => n + 15 * (0.45 + c.health / 180) * (1 - c.fatigue / 180), 0);
  if (guards.length) { if (inventory.knife) defense += 8; if (inventory.crowbar) defense += 4; }
  const threatMin = 12 + state.day * 1.5 + profile.raidThreatBonus;
  const threatMax = threatMin + 9;
  const raidChance = Math.min(.85, (RAID_CHANCES[state.day] || 0) * profile.raidChanceMultiplier);
  const wearMin = raidChance ? raidWear(profile, threatMin, defense, shelter.integrity) : 0;
  const wearMax = raidChance ? raidWear(profile, threatMax, defense, shelter.integrity) : 0;
  return { profile, shelter, guards, defense, threatMin, threatMax, raidChance, wearMin, wearMax };
}

export function getNightForecast(state, plan = null) {
  const activeNight = state.phase === 'expedition' && state.nightPlan?.day === state.day;
  const selectedPlan = plan || (activeNight ? state.nightPlan : null);
  const people = living(state);
  const roles = selectedPlan?.roles || Object.fromEntries(people.map(c => [c.id, 'sleep']));
  const scavengerId = selectedPlan?.scavengerId || null;
  const loadout = normalizeItems(selectedPlan?.loadout || {});
  // During an expedition the public inventory has already paid the loadout.
  // Start from the recorded pre-departure stock so forecasts never subtract twice.
  const inventory = { ...(activeNight ? state.nightPlan.preNightInventory : state.inventory) };
  const warnings = [];
  if (!loadout) warnings.push('반출 물자의 품목과 수량을 다시 확인하세요.');
  else {
    if (shortage(inventory, loadout)) warnings.push('계획한 반출 물자가 현재 재고보다 많습니다.');
    for (const [id, qty] of Object.entries(loadout)) inventory[id] = Math.max(0, (inventory[id] || 0) - qty);
  }
  const home = people.filter(c => c.id !== scavengerId && c.id !== selectedPlan?.companionId);
  const { profile, shelter, guards, defense, threatMin, threatMax, raidChance, wearMin, wearMax } = nightPressure(state, home, roles, inventory);
  const weather = getWeather(state);
  const bedsNeeded = home.filter(c => roles[c.id] === 'sleep').length;
  const bedsAvailable = state.facilities.bed;
  const fuelAvailable = inventory.fuel || 0;
  if (selectedPlan && people.some(c => !['guard', 'sleep', 'scavenge'].includes(roles[c.id]) || ((roles[c.id] === 'scavenge') !== (c.id === scavengerId)))) warnings.push('모든 생존자의 역할을 정하고 수색자는 한 명만 지정하세요.');
  if (raidChance > 0 && !guards.length) warnings.push('경계 인원이 없습니다. 이번 밤은 문 보강만으로 버텨야 합니다.');
  if (raidChance > 0 && defense < threatMin) warnings.push('방어력이 예상 습격 강도보다 낮습니다. 경계 인원이나 문 보강을 늘려 주세요.');
  else if (raidChance > 0 && defense < threatMax) warnings.push('강한 습격에는 피해가 생길 수 있습니다.');
  if (guards.some(c => c.fatigue >= 70 || c.health < 50)) warnings.push('지치거나 다친 경비는 방어력이 낮습니다. 낮의 휴식과 치료를 고려하세요.');
  if (weather.cold && !state.facilities.heater) warnings.push('난로가 없어 추위를 막을 수 없습니다. 난로를 먼저 설치하세요.');
  if (weather.cold && fuelAvailable < weather.fuelNeeded) warnings.push(`반출 뒤 난방 연료가 ${weather.fuelNeeded - fuelAvailable}개 부족합니다.`);
  if (weather.cold && state.facilities.heater && raidChance > 0 && defense < threatMax) warnings.push('습격으로 연료를 잃으면 예정한 난방도 부족해질 수 있습니다.');
  if (bedsNeeded > bedsAvailable) warnings.push(`잠들 사람 ${bedsNeeded}명 중 ${bedsNeeded - bedsAvailable}명은 바닥에서 자며 피로를 덜 회복합니다.`);
  if (shelter.needsRepair) warnings.push(`내구도 ${shelter.integrity}/100: 문 보강의 방어 효과가 줄었습니다. 목재 2 · 부품 1로 수리할 수 있습니다.`);
  if (raidChance > 0) warnings.push(`습격이 발생하면 막아내더라도 내구도가 ${wearMin === wearMax ? wearMin : `${wearMin}~${wearMax}`} 감소할 수 있습니다.`);
  return { weather, guards: guards.length, defense, threatMin, threatMax, raidChance, fuelNeeded: weather.fuelNeeded, fuelAvailable, bedsNeeded, bedsAvailable, warnings, difficulty: profile.id, integrity: shelter.integrity, barricadeDefense: shelter.barricadeDefense, wearMin, wearMax };
}

function raidNight(state, people, items) {
  const { profile, shelter, guards, defense, raidChance, threatMin, threatMax } = nightPressure(state, people, state.nightPlan.roles, state.inventory);
  const raid = { occurred: random(state) < raidChance, damage: 0, stolen: {}, defense, threat: 0, wear: 0, integrityBefore: shelter.integrity, integrityAfter: shelter.integrity };
  if (!raid.occurred) return raid;
  state.stats.raids++;
  raid.threat = threatMin + random(state) * (threatMax - threatMin);
  const gap = raid.threat - raid.defense;
  raid.wear = raidWear(profile, raid.threat, raid.defense, shelter.integrity);
  raid.integrityAfter = Math.max(0, raid.integrityBefore - raid.wear);
  state.shelterIntegrity = raid.integrityAfter;
  items.push({ text: `습격으로 은신처 내구도 ${raid.wear} 감소 (${raid.integrityBefore} → ${raid.integrityAfter}). 낮에 수리하면 문 보강의 방어 효과를 회복합니다.`, type: gap <= 0 ? 'info' : 'bad' });
  if (gap <= 0) { items.push({ text: '경비와 보강한 문이 침입을 막았습니다. 사람과 물자를 지켰습니다.', type: 'good' }); return raid; }
  const targetPool = guards.length ? guards : people;
  const target = targetPool.length ? targetPool[Math.floor(random(state) * targetPool.length)] : null;
  const damage = Math.min(25, Math.ceil(3 + gap * .6));
  const applied = target ? Math.min(target.health, damage) : 0;
  if (target) target.health = clamp(target.health - damage);
  raid.damage += applied;
  let budget = Math.min(5, Math.ceil(gap / 5));
  const candidates = ['meal', 'raw', 'parts', 'wood', 'water', 'fuel', 'cloth', 'meds', 'bandage'];
  const start = Math.floor(random(state) * candidates.length);
  for (let i = 0; i < candidates.length && budget > 0; i++) {
    const id = candidates[(start + i) % candidates.length];
    const qty = Math.min(state.inventory[id] || 0, budget, 2);
    if (qty) { state.inventory[id] -= qty; raid.stolen[id] = qty; budget -= qty; }
  }
  items.push({ text: `야간 침입: ${target ? `${target.name}의 체력 ${applied} 감소.` : '아무도 없는 피난처를 뒤졌습니다.'} 잃은 물자: ${describeItems(raid.stolen)}.`, type: 'bad' });
  return raid;
}

export function finishNight(state, result = {}) {
  if (state.phase !== 'expedition' || !state.nightPlan || state.nightPlan.resolved) return fail('이미 정산한 밤이거나 수색 중이 아닙니다.');
  if (!plain(result)) return fail('수색 결과를 읽을 수 없습니다.');
  const plan = state.nightPlan;
  const scavenger = plan.scavengerId ? characterById(state, plan.scavengerId) : null;
  const bag = normalizeItems(result.bag || {});
  if (!bag || (scavenger && usedSlots(bag) > scavenger.capacity) || (!scavenger && Object.keys(bag).length)) return fail('귀환 가방의 품목·수량·용량이 올바르지 않습니다.');
  if (scavenger && (!finite(result.health) || !finite(result.fatigue) || typeof result.dead !== 'boolean')) return fail('수색자의 귀환 상태가 올바르지 않습니다.');
  if (result.moraleDelta !== undefined && !finite(result.moraleDelta, -100, 100)) return fail('수색자의 사기 변화가 올바르지 않습니다.');
  if (result.locationId && result.locationId !== plan.locationId) return fail('수색 장소와 귀환 장소가 일치하지 않습니다.');
  if (result.locationState !== undefined && (!plan.locationId || !safeLocation(result.locationState))) return fail('장소의 지속 상태를 읽을 수 없습니다.');
  if (result.lootTaken !== undefined && !normalizeItems(result.lootTaken)) return fail('획득 물자 기록이 올바르지 않습니다.');
  if ((result.theft !== undefined && !integer(result.theft)) || (result.killed !== undefined && !integer(result.killed, 0, 1000))) return fail('현장 사건 기록이 올바르지 않습니다.');
  if (result.helped !== undefined && !integer(result.helped, 0, 100)) return fail('현장에서 도운 횟수가 올바르지 않습니다.');
  if (result.distractions !== undefined && !integer(result.distractions, 0, 100)) return fail('소음으로 유인한 횟수가 올바르지 않습니다.');
  if (result.events !== undefined && (!Array.isArray(result.events) || result.events.length > 300 || result.events.some(e => typeof e !== 'string' && !(plain(e) && typeof e.text === 'string')))) return fail('현장 기록을 읽을 수 없습니다.');
  const draft = clone(state);
  draft.shelterIntegrity = getShelterStatus(state).integrity;
  const actor = scavenger ? characterById(draft, scavenger.id) : null;
  const companionActor = plan.companionId ? characterById(draft, plan.companionId) : null;
  const reportItems = [];
  const returnedAlive = !!actor && !result.dead && result.health > 0;
  if (actor) { actor.health = result.dead ? 0 : clamp(result.health); actor.fatigue = clamp(result.fatigue); actor.morale = clamp(actor.morale + (result.moraleDelta || 0)); }
  if (companionActor && plain(result.companion)) {
    companionActor.health = result.companion.dead ? 0 : clamp(finite(result.companion.health) ? result.companion.health : companionActor.health);
    companionActor.fatigue = clamp(finite(result.companion.fatigue) ? result.companion.fatigue : companionActor.fatigue);
  }
  const remaining = living(draft).filter(c => c.id !== plan.scavengerId && c.id !== plan.companionId);
  const raid = raidNight(draft, remaining, reportItems);
  const weather = getWeather(draft);
  let heated = !weather.cold;
  if (weather.cold && draft.facilities.heater) {
    const burned = Math.min(draft.inventory.fuel, weather.fuelNeeded);
    draft.inventory.fuel -= burned;
    heated = burned === weather.fuelNeeded;
    reportItems.push({ text: heated ? `난로가 밤새 버텼습니다. 연료 ${burned} 사용.` : `난방 연료가 부족했습니다. 필요 ${weather.fuelNeeded}, 사용 ${burned}.`, type: heated ? 'good' : 'bad' });
  } else if (weather.cold) reportItems.push({ text: '난로 없이 추운 밤을 보냈습니다. 다음 낮에는 난방과 치료를 살펴주세요.', type: 'bad' });
  if (draft.facilities.collector && !weather.cold) { draft.inventory.water += 2; reportItems.push({ text: '집수기에 물 2가 모였습니다.', type: 'good' }); }
  if (draft.day % 2 === 0 && draft.facilities.trap) {
    const bait = Math.min(draft.facilities.trap, draft.inventory.raw);
    if (bait) { draft.inventory.raw += bait; reportItems.push({ text: `덫 ${bait}개: 미끼 ${bait}을 사용해 식재료 ${bait * 2} 확보.`, type: 'good' }); }
  }
  let bedsLeft = draft.facilities.bed;
  const deaths = [];
  for (const person of draft.characters) {
    if (!person.alive) continue;
    // A lethal field/raid outcome cannot be reversed by the recovery tick below.
    if (person.health <= 0) { person.alive = false; person.health = 0; person.job = null; person.queue = []; deaths.push(person.id); continue; }
    const role = plan.roles[person.id];
    if (person.id !== plan.scavengerId && person.id !== plan.companionId) {
      if (role === 'guard') person.fatigue = clamp(person.fatigue + 22);
      if (role === 'sleep') { const inBed = bedsLeft-- > 0; person.fatigue = clamp(person.fatigue - (inBed ? 44 : 25)); if (person.hunger < 60 && heated) { person.health = clamp(person.health + (inBed ? 6 : 3)); person.illness = clamp(person.illness - 3); } }
    }
    person.hunger = clamp(person.hunger + difficultyProfile(draft).hungerPerNight);
    if (person.health > 0 && weather.cold && !heated) { person.illness = clamp(person.illness + (draft.day === 6 || draft.day === 7 ? 12 : 8)); person.health = clamp(person.health - 4); person.morale = clamp(person.morale - 2); }
    if (person.health > 0 && person.hunger >= 75) { person.health = clamp(person.health - Math.ceil((person.hunger - 65) / 6)); person.morale = clamp(person.morale - 4); }
    if (person.health > 0 && person.illness >= 60) person.health = clamp(person.health - 6);
    if (person.health > 0 && person.fatigue >= 95) { person.health = clamp(person.health - 3); person.morale = clamp(person.morale - 3); }
    person.morale = clamp(person.morale - 1);
    if (person.id !== plan.scavengerId) person.morale = clamp(person.morale - Math.min(8, result.theft || 0) - Math.min(16, (result.killed || 0) * 8));
    if (person.health <= 0) { person.alive = false; person.health = 0; person.job = null; person.queue = []; deaths.push(person.id); }
  }
  // Loot arrives after ALL overnight use of shelter stock. It cannot retroactively defend or heat the home.
  const returnedBag = returnedAlive ? bag : {};
  if (returnedAlive) {
    changeItems(draft.inventory, bag);
    reportItems.unshift({ text: `${actor.name}가 ${result.late ? '늦게 ' : ''}돌아왔습니다. 반입: ${describeItems(bag)}.`, type: result.late ? 'info' : 'good' });
  } else if (actor) reportItems.unshift({ text: `${actor.name}는 돌아오지 못했습니다. 들고 있던 물품도 잃었습니다.`, type: 'bad' });
  const relief = reliefState(draft);
  if (living(draft).length && relief.contacted && !relief.delivered && relief.deliveryDay <= draft.day + 1) {
    changeItems(draft.inventory, RELIEF_SUPPLIES);
    draft.relief.delivered = true;
    reportItems.push({ text: `구호팀의 보급이 ${relief.deliveryDay}일째 아침 도착했습니다: ${describeItems(RELIEF_SUPPLIES)}.`, type: 'good' });
  }
  if (result.locationState) draft.locations[plan.locationId] = clone(result.locationState);
  for (const event of (result.events || []).slice(-8)) reportItems.push({ text: typeof event === 'string' ? event : event.text, type: typeof event === 'object' && LOG_TYPES.includes(event.type) ? event.type : 'info' });
  if (deaths.length) {
    for (const person of living(draft)) person.morale = clamp(person.morale - deaths.length * 14);
    reportItems.push({ text: `함께 버티던 ${deaths.map(id => characterById(draft, id).name).join(', ')}를 잃었습니다.`, type: 'bad' });
  }
  const lootTaken = result.lootTaken || {};
  draft.stats.suppliesRecovered += returnedAlive ? Object.values(lootTaken).reduce((a, b) => a + b, 0) : 0;
  draft.stats.thefts += result.theft || 0; draft.stats.kills += result.killed || 0; draft.stats.daysSurvived = draft.day;
  draft.stats.helped += result.helped || 0;
  draft.stats.distractions = (draft.stats.distractions || 0) + (result.distractions || 0);
  if (result.distractions > 0) reportItems.push({ text: `수색 중 부품을 던지는 소음 유인을 ${result.distractions}회 사용했습니다.`, type: 'info' });
  const supplyDelta = Object.fromEntries(Object.keys(ITEMS).map(id => [id, draft.inventory[id] - (plan.preNightInventory[id] || 0)]));
  const snapshot = person => ({ ...Object.fromEntries(CHARACTER_METRICS.map(key => [key, person[key]])), alive: person.alive });
  const characterChanges = draft.characters.map(person => {
    const before = snapshot(characterById(state, person.id));
    const after = snapshot(person);
    return { id: person.id, name: person.name, before, after, delta: Object.fromEntries(CHARACTER_METRICS.map(key => [key, after[key] - before[key]])) };
  });
  draft.report = { title: `${draft.day}일째 밤을 지나`, summary: living(draft).length ? `${living(draft).length}명이 피난처에 남아 있습니다. 식사·휴식·치료는 다음 낮에 직접 배분하세요.` : '피난처에 살아남은 사람이 없습니다.', items: reportItems, loot: clone(returnedBag), raid, deaths, supplyDelta, characterChanges };
  draft.history.push({ day: draft.day, summary: draft.report.summary, survivors: living(draft).length, loot: clone(returnedBag), deaths: [...deaths] });
  draft.history = draft.history.slice(-30);
  draft.nightPlan.resolved = true; draft.phase = 'report'; draft.paused = true;
  if (!characterById(draft, draft.selectedId)?.alive && living(draft).length) draft.selectedId = living(draft)[0].id;
  for (const item of reportItems) log(draft, item.text, item.type);
  Object.assign(state, draft);
  return { ok: true };
}

function merchantStock(visitor) {
  if (visitor?.stock) return Object.fromEntries(Object.keys(ITEMS).map(id => [id, visitor.stock[id] || 0]));
  const stock = { ...TRADER_STOCK };
  // Version 1 originally stored only the remaining fixed bundles. Reconstruct
  // their committed exchange so loading an old save cannot replenish purchases.
  for (const offer of visitor?.offers || []) {
    if (offer.remaining > 0) continue;
    for (const [id, qty] of Object.entries(offer.receive)) stock[id] = Math.max(0, (stock[id] || 0) - qty);
    changeItems(stock, offer.give);
  }
  return stock;
}

function barterPrices() {
  return Object.fromEntries(Object.entries(SELL_VALUES).map(([id, sell]) => [id, { buy: Math.max(sell + 1, Math.ceil(sell * 1.4)), sell }]));
}

function exchangeReason(inventory, stock, give, receive) {
  const ownShortage = shortage(inventory, give);
  if (ownShortage) return ownShortage;
  const stockShortage = shortage(stock, receive);
  if (stockShortage) return stockShortage.replace('재료 부족', '상인 재고 부족');
  for (const id of Object.keys(ITEMS)) {
    if ((inventory[id] || 0) - (give[id] || 0) + (receive[id] || 0) > MAX_STOCK) return '피난처 보관 한도를 넘는 교환입니다.';
    if ((stock[id] || 0) + (give[id] || 0) - (receive[id] || 0) > MAX_STOCK) return '상인이 더 보관할 수 없는 물품입니다.';
  }
  return '';
}

export function getBarter(state, give = {}, receive = {}) {
  const merchant = state.visitor?.kind === 'trade' ? state.visitor : null;
  const stock = merchant ? merchantStock(merchant) : Object.fromEntries(Object.keys(ITEMS).map(id => [id, 0]));
  const prices = barterPrices();
  const offered = normalizeItems(give);
  const requested = normalizeItems(receive);
  const offerValue = offered ? Object.entries(offered).reduce((sum, [id, qty]) => sum + prices[id].sell * qty, 0) : 0;
  const requestValue = requested ? Object.entries(requested).reduce((sum, [id, qty]) => sum + prices[id].buy * qty, 0) : 0;
  let reason = '';
  if (state.phase !== 'day' || !merchant) reason = '지금은 거래할 상인이 없습니다.';
  else if (!offered || !requested) reason = '올바른 물품과 0 이상의 정수 수량을 선택하세요.';
  else if (!Object.keys(offered).length || !Object.keys(requested).length) reason = '내놓을 물품과 받을 물품을 각각 선택하세요.';
  else if (Object.keys(offered).some(id => own(requested, id))) reason = '같은 물품을 양쪽에 동시에 넣을 수 없습니다.';
  else reason = exchangeReason(state.inventory, stock, offered, requested);
  if (!reason && offerValue < requestValue) reason = `제공 가치가 ${requestValue - offerValue} 부족합니다. 내놓을 물품을 늘리거나 받을 물품을 줄이세요.`;
  return { ok: !reason, reason, offerValue, requestValue, stock, prices };
}

function commitExchange(state, give, receive) {
  state.visitor.stock = merchantStock(state.visitor);
  changeItems(state.inventory, give, -1);
  changeItems(state.inventory, receive);
  changeItems(state.visitor.stock, receive, -1);
  changeItems(state.visitor.stock, give);
  state.stats.trades++;
  log(state, `교환 완료: ${describeItems(give)} → ${describeItems(receive)}`, 'good');
}

export function barter(state, give, receive) {
  const quote = getBarter(state, give, receive);
  if (!quote.ok) return fail(quote.reason);
  commitExchange(state, normalizeItems(give), normalizeItems(receive));
  return { ok: true, offerValue: quote.offerValue, requestValue: quote.requestValue };
}

function createVisitor(day) {
  if ([2, 7, 10].includes(day)) return {
    id: `trader-${day}`, title: '문 앞의 상인', body: '내놓을 물품과 필요한 물품을 직접 골라 물물교환하세요. 상인의 재고는 한정되어 있고, 간편 꾸러미도 같은 재고를 사용합니다.', kind: 'trade', stock: { ...TRADER_STOCK },
    options: [{ id: 'leave', label: '거래 마치기', description: '상인을 돌려보냅니다.' }],
    offers: [
      { id: 'food', label: '식량 꾸러미', give: { parts: 3 }, receive: { raw: 3, water: 2 }, remaining: 1 },
      { id: 'parts', label: '수리용 물자', give: { wood: 4 }, receive: { parts: 4, cloth: 1 }, remaining: 1 },
      { id: 'medical', label: '응급 의약품', give: { parts: 5, water: 2 }, receive: { meds: 1, bandage: 1 }, remaining: 1 },
      { id: 'fuel', label: '마른 연료', give: { parts: 2 }, receive: { fuel: 4 }, remaining: 1 },
      { id: 'crowbar', label: '튼튼한 쇠지레', give: { parts: 6, wood: 2 }, receive: { crowbar: 1 }, remaining: 1 },
    ],
  };
  if (day === 3) return { id: 'neighbor-food', title: '옆집의 부탁', body: '옆집 가족에게 먹을 것이 떨어졌습니다. 식사 두 개를 나누면 그들이 보관한 수리 물자를 받을 수 있습니다.', kind: 'choice', options: [{ id: 'help', label: '두 끼를 나눈다', description: '식사 2 소비 → 부품 3 · 천 2. 모두의 사기 +8.', cost: { meal: 2 } }, { id: 'decline', label: '우리 식량을 지킨다', description: '재고를 보존합니다. 모두의 사기 -3.' }] };
  if (day === 5) return { id: 'neighbor-wound', title: '다친 이웃', body: '이웃이 다친 가족을 위해 붕대를 찾고 있습니다. 답례로 쌓아 둔 목재와 연료를 나누겠다고 합니다.', kind: 'choice', options: [{ id: 'help', label: '붕대를 건넨다', description: '붕대 1 소비 → 목재 4 · 연료 2. 모두의 사기 +8.', cost: { bandage: 1 } }, { id: 'decline', label: '치료품을 남겨 둔다', description: '재고를 보존합니다. 모두의 사기 -3.' }] };
  if (day === 9) return { id: 'traveler', title: '길을 잃은 사람', body: '먼 길을 걸어온 사람이 한 끼를 부탁합니다. 줄 것은 없지만, 며칠 안에 통로가 열린다는 소식을 전합니다.', kind: 'choice', options: [{ id: 'help', label: '식사를 나눈다', description: '식사 1 소비. 모두의 사기 +10.', cost: { meal: 1 } }, { id: 'decline', label: '조용히 문을 닫는다', description: '재고를 보존합니다. 모두의 사기 -3.' }] };
  if (day === 11) return { id: 'aid', title: '작은 구호 꾸러미', body: '구호대가 마지막 대피를 준비하고 있습니다. 남은 이틀을 버틸 물자를 문 앞에 두었습니다.', kind: 'choice', options: [{ id: 'accept', label: '꾸러미를 받는다', description: '식재료 2 · 약품 1 · 물 3을 얻습니다.' }, { id: 'decline', label: '다른 집에 양보한다', description: '물자는 받지 않고 모두의 사기 +6.' }] };
  return null;
}

export function chooseVisitor(state, choice) {
  if (state.phase !== 'day' || !state.visitor) return fail('현재 응대할 방문자가 없습니다.');
  const visitor = state.visitor;
  const option = visitor.options?.find(o => o.id === choice);
  if (!option) return fail('방문자의 선택지를 다시 확인해 주세요.');
  const reason = shortage(state.inventory, option.cost || {});
  if (reason) return fail(reason);
  changeItems(state.inventory, option.cost || {}, -1);
  let morale = 0;
  if (choice === 'help') {
    state.stats.helped++;
    morale = visitor.id === 'traveler' ? 10 : 8;
    if (visitor.id === 'neighbor-food') changeItems(state.inventory, { parts: 3, cloth: 2 });
    if (visitor.id === 'neighbor-wound') changeItems(state.inventory, { wood: 4, fuel: 2 });
    log(state, `${visitor.title}: 서로의 물자를 나누었습니다.`, 'good');
  } else if (visitor.id === 'aid' && choice === 'accept') { changeItems(state.inventory, { raw: 2, meds: 1, water: 3 }); log(state, '구호 꾸러미에서 식재료 2 · 약품 1 · 물 3을 얻었습니다.', 'good'); }
  else if (choice === 'decline') { morale = visitor.id === 'aid' ? 6 : -3; log(state, `${visitor.title}: ${visitor.id === 'aid' ? '물자를 다른 집에 양보했습니다.' : '이번에는 도울 수 없었습니다.'}`, morale > 0 ? 'good' : 'info'); }
  else log(state, '상인과의 거래를 마쳤습니다.');
  for (const person of living(state)) person.morale = clamp(person.morale + morale);
  state.visitor = null;
  return { ok: true };
}

export function trade(state, offerId) {
  if (state.phase !== 'day' || state.visitor?.kind !== 'trade') return fail('지금은 거래할 상인이 없습니다.');
  const offer = state.visitor.offers?.find(o => o.id === offerId);
  if (!offer) return fail('존재하지 않는 교환입니다.');
  if (offer.remaining <= 0) return fail('이 품목은 모두 거래했습니다.');
  const reason = exchangeReason(state.inventory, merchantStock(state.visitor), offer.give, offer.receive);
  if (reason) return fail(reason);
  commitExchange(state, offer.give, offer.receive);
  offer.remaining--;
  return { ok: true };
}

export function getEpilogues(state) {
  const profile = difficultyProfile(state);
  const campaignDays = Math.min(CAMPAIGN_DAYS, state.stats.daysSurvived || 0);
  const survived = state.phase === 'ended' && state.ending?.kind === 'victory';
  const reliefMemory = survived && reliefState(state).prepared ? '복구한 무전기로 합의한 경로를 확인하고, 봉인해 둔 물자를 챙겨 대피했습니다.' : survived && reliefState(state).contacted ? '구호팀과 연결된 무전기는 마지막까지 서로의 위치를 전했습니다. 대피 물자는 따로 봉인하지 못했지만 열린 통로에 도착했습니다.' : survived && state.facilities.radio ? '복구한 무전기는 남았지만 구호 교신을 마치지 못했습니다. 통로가 열리는 날 스스로 길을 찾아 나섰습니다.' : '';
  const shared = `피난처의 기록에는 이웃을 도운 일 ${state.stats.helped}회, 수색 ${state.stats.scavenges}회가 남았습니다.`;
  const memories = {
    mira: {
      hopeful: '미라가 이어 갈 돌봄', burdened: '미라에게 남은 질문', recovering: '미라에게도 필요한 회복', lowMorale: '미라의 긴 침묵',
      reflection: '간호사인 미라에게 다음 삶의 바탕은 사람의 몸과 마음을 함께 돌보는 일이었습니다.',
    },
    yun: {
      hopeful: '윤이 다시 세울 집', burdened: '윤이 돌아볼 흔적', recovering: '윤의 손이 쉴 시간', lowMorale: '윤이 기다리는 아침',
      reflection: `함께 완성한 시설 ${state.stats.built}건은 정비공 윤에게 이 피난처를 기억하는 한 방식이 되었습니다.`,
    },
    leo: {
      hopeful: '레오 앞에 열린 길', burdened: '레오가 기억할 밤길', recovering: '레오가 잠시 멈출 자리', lowMorale: '레오가 다시 찾을 방향',
      reflection: '배달원이었던 레오에게 안전하게 돌아올 수 있는 길은 새 생활을 시작할 조건이었습니다.',
    },
  };
  return state.characters.map(person => {
    const voice = memories[person.id];
    if (!person.alive) {
      const lostOn = state.history.find(entry => Array.isArray(entry.deaths) && entry.deaths.includes(person.id))?.day;
      const date = lostOn ? `${lostOn}일째 밤` : `${campaignDays}일의 기록 속`;
      const remaining = living(state).length;
      return {
        id: person.id, name: person.name, alive: false, title: `${person.name}의 비어 있는 자리`,
        body: `${date}, ${person.name}의 생존 기록이 끝났습니다. ${profile.label} 조건으로 버틴 피난처에는 ${remaining ? `${remaining}명의 생존자가 남았습니다.` : '남은 생존자가 없습니다.'} ${shared} 그의 이름도 이 기록에서 지워지지 않습니다.`,
      };
    }
    const hurt = person.health < 50 || person.illness >= 40;
    const troubled = person.morale < 35;
    const violence = state.stats.kills > 0 || state.stats.thefts > 0;
    const title = hurt ? voice.recovering : troubled ? voice.lowMorale : violence ? voice.burdened : voice.hopeful;
    const opening = survived ? `${person.name}는 ${profile.label} 조건의 12일을 버티고 구호 차량에 올랐습니다.` : `${person.name}는 ${profile.label} 조건의 ${Math.max(1, campaignDays)}일째 기록에 살아 있는 사람으로 남아 있습니다.`;
    const condition = hurt
      ? `체력 ${Math.round(person.health)}, 질병 ${Math.round(person.illness)}의 상태에서 몸을 회복할 시간이 필요합니다.`
      : troubled ? `몸은 버텼지만 사기 ${Math.round(person.morale)}의 마음은 아직 지쳐 있습니다.`
        : `체력 ${Math.round(person.health)}, 사기 ${Math.round(person.morale)}의 상태로 다음 시간을 맞습니다.`;
    const choices = violence
      ? `공동체가 겪은 밤에는 사유물 반출 ${state.stats.thefts}개와 치명적 충돌 ${state.stats.kills}명이 기록되었습니다. ${shared}`
      : state.stats.helped > 0 ? `${shared} 이웃과 나눈 선택도 생존의 일부로 남았습니다.` : `${shared} 자신들의 하루를 지키는 데 힘을 모았던 시간이었습니다.`;
    return { id: person.id, name: person.name, alive: true, title, body: `${opening} ${condition} ${voice.reflection} ${choices}${reliefMemory ? ` ${reliefMemory}` : ''}` };
  });
}

export function nextDay(state) {
  if (state.phase !== 'report') return fail('밤의 결과를 확인한 뒤 다음 날로 넘어가세요.');
  if (!living(state).length) {
    state.phase = 'ended'; state.paused = true;
    state.ending = { kind: 'defeat', title: '마지막 불빛이 꺼졌습니다', body: `${state.day}일 동안 버텼지만 피난처에 남은 사람이 없습니다. 식사와 낮잠, 난방을 조금 일찍 준비해 다시 도전할 수 있습니다.` };
    state.ending.epilogues = getEpilogues(state);
    return { ok: true };
  }
  state.day++;
  if (state.day > CAMPAIGN_DAYS) {
    state.phase = 'ended'; state.paused = true;
    state.ending = { kind: 'victory', route: reliefState(state).prepared ? 'coordinated' : 'self', title: reliefState(state).prepared ? '준비한 길로, 함께 떠납니다' : '새벽의 통로가 열렸습니다', body: `${living(state).map(c => c.name).join(', ')}${living(state).length === 1 ? '가' : ' — 이들은'} 12일을 버티고 구호 차량에 올랐습니다. ${state.stats.helped}번의 나눔과 ${state.stats.scavenges}번의 수색이 이 시간을 만들었습니다.${reliefState(state).prepared ? ' 구호팀과 합의한 경로와 봉인한 대피 물자가 마지막 이동을 지탱했습니다.' : ' 대피 준비를 모두 마치지는 못했지만 열린 통로까지 스스로 길을 찾았습니다.'}` };
    state.ending.epilogues = getEpilogues(state);
    return { ok: true };
  }
  state.phase = 'day'; state.clock = DAY_START; state.paused = true; state.nightPlan = null; state.report = null;
  state.visitor = createVisitor(state.day);
  log(state, `${state.day}일째 아침. ${getWeather(state).cold ? '추위가 계속됩니다. 난방용 연료를 남겨 두세요.' : '각자의 상태를 확인하고 하루를 시작하세요.'}`);
  if (state.visitor) log(state, `${state.visitor.title}: 현관에서 기다리고 있습니다.`);
  return { ok: true };
}

function validLog(entry) { return plain(entry) && integer(entry.day, 1, 13) && typeof entry.text === 'string' && entry.text.length <= 2000 && LOG_TYPES.includes(entry.type); }

function validCharacterSnapshot(value) {
  return plain(value) && CHARACTER_METRICS.every(key => finite(value[key])) && typeof value.alive === 'boolean' && value.alive === (value.health > 0);
}

function validCharacterChanges(changes) {
  return Array.isArray(changes) && changes.length === 3 && new Set(changes.map(entry => entry?.id)).size === 3 && changes.every(entry =>
    plain(entry) && IDS.includes(entry.id) && typeof entry.name === 'string' && entry.name.length <= 80 && validCharacterSnapshot(entry.before) && validCharacterSnapshot(entry.after) && plain(entry.delta) && CHARACTER_METRICS.every(key => finite(entry.delta[key], -100, 100) && Math.abs(entry.delta[key] - (entry.after[key] - entry.before[key])) < .000001));
}

function validEpilogues(epilogues) {
  return Array.isArray(epilogues) && epilogues.length === 3 && new Set(epilogues.map(entry => entry?.id)).size === 3 && epilogues.every(entry => plain(entry) && IDS.includes(entry.id) && typeof entry.name === 'string' && entry.name.length <= 80 && typeof entry.alive === 'boolean' && typeof entry.title === 'string' && entry.title.length <= 200 && typeof entry.body === 'string' && entry.body.length <= 2000);
}

function validJob(job) {
  if (job === null) return true;
  if (!(plain(job) && ACTION_IDS.includes(job.actionId || job.id) && typeof job.label === 'string' && job.label.length < 100 && TARGETS.includes(job.target) && finite(job.remaining, 0, 2000) && finite(job.total, 1, 2000) && job.remaining <= job.total && !!normalizeItems(job.cost || {}) && (job.output === undefined || !!normalizeItems(job.output)) && (job.facility === undefined || own(FACILITIES, job.facility)) && (job.careTargetId === undefined || (IDS.includes(job.careTargetId) && ['heal', 'bandage'].includes(job.actionId || job.id) && job.target === 'bed')))) return false;
  const actionId = job.actionId || job.id;
  if (RELIEF_ACTIONS.includes(actionId)) {
    const recipe = RECIPES[actionId];
    if (job.id !== actionId || job.actionId !== actionId || job.target !== recipe.target || job.category !== recipe.category || job.facility !== recipe.facility || job.output !== undefined || job.careTargetId !== undefined) return false;
    if (Object.keys(job.cost).length !== Object.keys(recipe.cost).length || Object.entries(recipe.cost).some(([id, quantity]) => job.cost[id] !== quantity)) return false;
    if (actionId === 'buildRadio' && job.level !== 1) return false;
  }
  return true;
}

function validRelief(state) {
  const relief = state.relief;
  const keys = ['contacted', 'contactDay', 'deliveryDay', 'delivered', 'prepared', 'preparedDay'];
  if (!plain(relief) || Object.keys(relief).length !== keys.length || keys.some(key => !own(relief, key)) || ['contacted', 'delivered', 'prepared'].some(key => typeof relief[key] !== 'boolean')) return false;
  if (!relief.contacted) return relief.contactDay === null && relief.deliveryDay === null && relief.delivered === false && relief.prepared === false && relief.preparedDay === null;
  if (state.facilities.radio !== 1 || !integer(relief.contactDay, 4, Math.min(state.day, 12)) || relief.deliveryDay !== relief.contactDay + 1) return false;
  // Report is the following dawn, although the heading retains the night day.
  const reachedDawn = state.day >= relief.deliveryDay || (['report', 'ended'].includes(state.phase) && state.day + 1 >= relief.deliveryDay);
  if (relief.delivered && !reachedDawn) return false;
  // An overdue surviving campaign cannot legally skip or replay its delivery.
  if (!relief.delivered && reachedDawn && living(state).length) return false;
  if (relief.prepared) return integer(relief.preparedDay, Math.max(9, relief.contactDay), Math.min(state.day, 12));
  return relief.preparedDay === null;
}

function validVisitor(visitor) {
  if (visitor === null) return true;
  if (!plain(visitor) || typeof visitor.id !== 'string' || typeof visitor.title !== 'string' || typeof visitor.body !== 'string' || !['trade', 'choice'].includes(visitor.kind) || !Array.isArray(visitor.options) || visitor.options.length > 10) return false;
  if (visitor.options.some(o => !plain(o) || typeof o.id !== 'string' || typeof o.label !== 'string' || typeof o.description !== 'string' || (o.cost !== undefined && !normalizeItems(o.cost)))) return false;
  if (visitor.kind === 'trade' && (!Array.isArray(visitor.offers) || visitor.offers.length > 20 || visitor.offers.some(o => !plain(o) || typeof o.id !== 'string' || typeof o.label !== 'string' || !normalizeItems(o.give) || !normalizeItems(o.receive) || !integer(o.remaining, 0, 100)))) return false;
  if (visitor.stock !== undefined && (visitor.kind !== 'trade' || !normalizeItems(visitor.stock))) return false;
  return true;
}

export function isValidSave(state) {
  try {
    if (!plain(state) || state.version !== 1 || !integer(state.seed, 0, 4294967295) || !integer(state.rng, 0, 4294967295) || !integer(state.day, 1, 13) || !PHASES.includes(state.phase) || !finite(state.clock, DAY_START, DAY_END) || typeof state.paused !== 'boolean' || !(typeof state.speed === 'number' && Number.isFinite(state.speed) && state.speed >= 0.5 && state.speed <= 20) || !IDS.includes(state.selectedId)) return false;
    if (state.difficulty !== undefined && (typeof state.difficulty !== 'string' || !own(DIFFICULTIES, state.difficulty))) return false;
    if (state.shelterIntegrity !== undefined && !finite(state.shelterIntegrity)) return false;
    if (state.campaign !== undefined && (!plain(state.campaign) || state.campaign.id !== CAMPAIGN_PROFILE.id || state.campaign.label !== CAMPAIGN_PROFILE.label || state.campaign.days !== CAMPAIGN_DAYS || state.campaign.difficulty !== difficultyProfile(state).id || state.campaign.difficultyLabel !== difficultyProfile(state).label)) return false;
    if (!normalizeItems(state.inventory) || Object.keys(ITEMS).some(id => !own(state.inventory, id))) return false;
    if (!Array.isArray(state.characters) || state.characters.length !== 3 || new Set(state.characters.map(c => c.id)).size !== 3) return false;
    for (const c of state.characters) {
      if (!plain(c) || !IDS.includes(c.id) || typeof c.name !== 'string' || c.name.length > 80 || typeof c.role !== 'string' || typeof c.trait !== 'string' || typeof c.color !== 'string' || !integer(c.capacity, 1, 30) || typeof c.alive !== 'boolean' || !validJob(c.job)) return false;
      if (['health', 'hunger', 'fatigue', 'morale', 'illness'].some(key => !finite(c[key]))) return false;
      if (c.alive !== (c.health > 0) || (!c.alive && c.job !== null) || (state.phase !== 'day' && c.job !== null)) return false;
      if (c.queue !== undefined && (!Array.isArray(c.queue) || c.queue.length > QUEUE_LIMIT || c.queue.some(id => !ACTION_IDS.includes(id)) || ((!c.alive || state.phase !== 'day') && c.queue.length))) return false;
      if (c.job?.careTargetId && !characterById(state, c.job.careTargetId)?.alive) return false;
    }
    if (!plain(state.facilities) || Object.keys(FACILITIES).some(id => !(id === 'radio' && state.facilities[id] === undefined) && !integer(state.facilities[id], id === 'bed' || id === 'stove' || id === 'workshop' ? 1 : 0, FACILITIES[id].maxLevel)) || Object.keys(state.facilities).some(id => !own(FACILITIES, id)) || !integer(state.cleared, 0, 4)) return false;
    if (state.relief !== undefined && !validRelief(state)) return false;
    const uniqueWork = state.characters.filter(c => RELIEF_ACTIONS.includes(c.job?.actionId)).map(c => c.job.actionId);
    if (new Set(uniqueWork).size !== uniqueWork.length) return false;
    for (const actionId of uniqueWork) {
      if ((actionId === 'buildRadio' && state.facilities.radio) || (actionId === 'contactRelief' && (!state.facilities.radio || reliefState(state).contacted || state.day < 4)) || (actionId === 'prepareEvacuation' && (!reliefState(state).contacted || reliefState(state).prepared || state.day < 9))) return false;
    }
    if (!validVisitor(state.visitor) || !Array.isArray(state.logs) || state.logs.length > 50 || state.logs.some(e => !validLog(e)) || !Array.isArray(state.history) || state.history.length > 30 || !plain(state.stats)) return false;
    const statKeys = ['daysSurvived', 'mealsEaten', 'crafted', 'built', 'helped', 'trades', 'thefts', 'kills', 'raids', 'suppliesRecovered', 'scavenges', 'jobsCompleted', 'jobSeq'];
    if (statKeys.some(k => !integer(state.stats[k]))) return false;
    if (state.stats.distractions !== undefined && !integer(state.stats.distractions)) return false;
    if (!plain(state.locations) || Object.entries(state.locations).some(([id, loc]) => !own(LOCATION_RULES, id) || !safeLocation(loc))) return false;
    if (state.nightPlan !== null) {
      const p = state.nightPlan;
      if (!plain(p) || !integer(p.day, 1, 12) || !plain(p.roles) || !normalizeItems(p.loadout) || !normalizeItems(p.preNightInventory) || !normalizeItems(p.remainingInventory) || typeof p.resolved !== 'boolean') return false;
      if (p.scavengerId !== null && (!IDS.includes(p.scavengerId) || !own(LOCATION_RULES, p.locationId))) return false;
      if (p.companionId !== undefined && p.companionId !== null && (!IDS.includes(p.companionId) || p.companionId === p.scavengerId || !p.scavengerId)) return false;
      if (Object.entries(p.roles).some(([id, role]) => !IDS.includes(id) || !(role === 'companion' ? id === p.companionId : ['guard', 'sleep', 'scavenge'].includes(role)))) return false;
      if (Object.values(p.roles).filter(role => role === 'scavenge').length !== (p.scavengerId ? 1 : 0) || (p.scavengerId && p.roles[p.scavengerId] !== 'scavenge')) return false;
      if (p.scavengerId && usedSlots(p.loadout) > characterById(state, p.scavengerId).capacity) return false;
    }
    if (state.phase === 'expedition' && (!state.nightPlan || state.nightPlan.resolved || state.nightPlan.day !== state.day)) return false;
    if (state.report !== null) {
      const r = state.report;
      if (!plain(r) || typeof r.title !== 'string' || typeof r.summary !== 'string' || !Array.isArray(r.items) || r.items.length > 100 || r.items.some(i => !plain(i) || typeof i.text !== 'string' || !LOG_TYPES.includes(i.type)) || !normalizeItems(r.loot) || !plain(r.raid) || typeof r.raid.occurred !== 'boolean' || !finite(r.raid.damage, 0, 300) || !normalizeItems(r.raid.stolen) || !Array.isArray(r.deaths) || r.deaths.some(id => !IDS.includes(id))) return false;
      if (r.supplyDelta !== undefined && (!plain(r.supplyDelta) || Object.entries(r.supplyDelta).some(([id, amount]) => !own(ITEMS, id) || !integer(amount, -MAX_STOCK, MAX_STOCK)))) return false;
      if (r.characterChanges !== undefined && !validCharacterChanges(r.characterChanges)) return false;
      if (['wear', 'integrityBefore', 'integrityAfter'].some(key => r.raid[key] !== undefined) && (!finite(r.raid.wear, 0, 18) || !finite(r.raid.integrityBefore) || !finite(r.raid.integrityAfter) || Math.abs(r.raid.integrityAfter - Math.max(0, r.raid.integrityBefore - r.raid.wear)) > TIME_EPSILON || (!r.raid.occurred && r.raid.wear !== 0))) return false;
    }
    if (state.phase === 'report' && (!state.report || !state.nightPlan?.resolved)) return false;
    if (state.ending !== null && (!plain(state.ending) || !['victory', 'defeat'].includes(state.ending.kind) || typeof state.ending.title !== 'string' || typeof state.ending.body !== 'string')) return false;
    if (state.ending?.route !== undefined && (state.ending.kind !== 'victory' || state.ending.route !== (reliefState(state).prepared ? 'coordinated' : 'self'))) return false;
    if (state.ending?.epilogues !== undefined && !validEpilogues(state.ending.epilogues)) return false;
    if (state.phase === 'ended' && !state.ending) return false;
    if (state.day === 13 && state.phase !== 'ended') return false;
    return true;
  } catch { return false; }
}

export function serializeGame(state) {
  if (!isValidSave(state)) throw new Error('게임 상태가 올바르지 않아 저장할 수 없습니다.');
  return JSON.stringify(state);
}

export function restoreGame(jsonOrObject) {
  if (typeof jsonOrObject === 'string' && jsonOrObject.length > 2000000) throw new Error('저장 파일이 너무 큽니다.');
  let parsed;
  try { parsed = typeof jsonOrObject === 'string' ? JSON.parse(jsonOrObject) : jsonOrObject; } catch { throw new Error('저장 파일의 JSON 형식이 올바르지 않습니다.'); }
  if (!isValidSave(parsed)) throw new Error('호환되지 않거나 손상된 저장 파일입니다.');
  const restored = clone(parsed);
  restored.difficulty ||= 'standard';
  if (restored.shelterIntegrity === undefined) restored.shelterIntegrity = 100;
  restored.campaign ||= campaignMetadata(restored.difficulty);
  restored.facilities.radio ??= 0;
  restored.relief ||= newRelief();
  restored.stats.distractions ??= 0;
  restored.revision ||= { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 };
  if (restored.ending?.kind === 'victory') restored.ending.route ||= restored.relief.prepared ? 'coordinated' : 'self';
  for (const actor of restored.characters) actor.queue ||= [];
  if (restored.visitor?.kind === 'trade' && restored.visitor.stock === undefined) restored.visitor.stock = merchantStock(restored.visitor);
  if (restored.ending && restored.ending.epilogues === undefined) restored.ending.epilogues = getEpilogues(restored);
  return restored;
}
