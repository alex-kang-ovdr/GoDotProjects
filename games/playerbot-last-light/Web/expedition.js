/**
 * Last Light — original, deterministic night expedition simulation.
 * All state is JSON data; no DOM, timers, dependencies or hidden live handles.
 */
import { ITEMS, usedSlots } from './engine.js';

const FLOORS = [600, 410, 220];
const WORLD_MIN = 65;
const WORLD_MAX = 1215;
const EXIT_X = 130;
const REACH = 82;
const ATTACK_REACH = 88;
const VISION_RANGE = 330;
const DOOR_CLEARANCE = 18;
const BANDAGE_TIME = 3;
const BANDAGE_COOLDOWN = 12;
const TALK_REACH = 180;
export const COMBAT_RULES = Object.freeze({
  attackStamina: 22, dodgeStamina: 28, attackReach: ATTACK_REACH, npcAttackReach: 61,
  dodgeCooldown: 2.4, dodgeDuration: 0.26, evadeDuration: 0.18,
  dodgeSpeed: 450, staminaRecovery: 14, staminaDelay: 0.75, windup: 0.55
});
export const DISTRACTION_RULES = Object.freeze({
  cost: Object.freeze({ parts: 1 }), range: 260, minRange: 60,
  cooldown: 8, lifetime: 2.5, hearingRange: 350
});
const NPC_STATES = ['patrol', 'warn', 'investigate', 'chase', 'attack', 'flee', 'gone'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const copy = value => JSON.parse(JSON.stringify(value));
const fail = reason => ({ ok: false, reason });

export const LOCATIONS = [
  { id: 'cottage', name: '비어 있는 연립주택', subtitle: '아무도 없는 불빛', description: '주민들이 떠난 집입니다. 잠긴 보관함과 잔해 사이에서 식량과 건축 재료를 찾을 수 있습니다.', risk: '낮음', riskLevel: 1, lootHint: '목재 · 부품 · 식재료', unlockDay: 1, kind: 'cottage' },
  { id: 'clinic', name: '폐쇄된 진료소', subtitle: '아직 필요한 약', description: '입구의 구호 상자는 가져가도 됩니다. 위층에서 약을 지키는 사람은 자신의 보관함을 건드리는 것을 원하지 않습니다.', risk: '낮음', riskLevel: 1, lootHint: '물 · 붕대 · 의약품', unlockDay: 2, kind: 'clinic' },
  { id: 'garage', name: '오래된 정비소', subtitle: '쇠붙이 사이의 밤', description: '공용 작업장에 재료가 남아 있습니다. 관리인이 지키는 위층 보관함은 사유물입니다. 지렛대가 있으면 더 많은 곳을 열 수 있습니다.', risk: '보통', riskLevel: 2, lootHint: '부품 · 연료 · 도구', unlockDay: 3, kind: 'garage' },
  { id: 'apartments', name: '가족의 아파트', subtitle: '누군가의 내일', description: '아래층에 나눔 상자가 있습니다. 위층의 음식과 약은 이곳에 남은 가족의 것입니다. 침입 경고를 무시하면 위험해집니다.', risk: '보통', riskLevel: 2, lootHint: '식재료 · 물 · 의약품', unlockDay: 4, kind: 'apartments' },
  { id: 'warehouse', name: '철도 보급 창고', subtitle: '돌아올 길을 기억해', description: '풍부한 물자를 무장 경비가 지키고 있습니다. 발소리를 줄이고 어두운 틈을 이용하세요. 입구 근처만 살펴보고 돌아올 수도 있습니다.', risk: '높음', riskLevel: 3, lootHint: '식량 · 부품 · 연료', unlockDay: 5, kind: 'warehouse' }
];

const box = (id, x, floor, label, items, extra = {}) => ({ id, x, floor, label, items, locked: false, owned: false, ...extra });
const resident = (id, x, floor, extra = {}) => ({ id, x, floor, kind: 'civilian', hostile: false, health: 65, patrolMin: x - 90, patrolMax: x + 90, visionRange: 210, hearingRange: 220, speed: 94, damage: 7, ...extra });
const MAPS = {
  cottage: {
    loot: [
      box('cottage_entry', 225, 0, '현관의 상자', { wood: 6, parts: 4 }),
      box('cottage_kitchen', 655, 0, '버려진 찬장', { raw: 3, water: 3 }),
      box('cottage_linen', 425, 1, '옷감 보관함', { cloth: 4, bandage: 1 }),
      box('cottage_tools', 1035, 1, '잠긴 공구함', { parts: 8, wood: 4 }, { locked: true }),
      box('cottage_attic', 1010, 2, '다락의 자루', { wood: 7, fuel: 3, water: 2 })
    ], npcs: []
  },
  clinic: {
    loot: [
      box('clinic_aid', 220, 0, '구호 나눔 상자', { water: 5, cloth: 3, bandage: 1 }),
      box('clinic_store', 650, 0, '남은 보급품', { raw: 2, parts: 3 }),
      box('clinic_bandages', 435, 1, '치료 준비대', { bandage: 2, cloth: 2 }),
      box('clinic_private', 1060, 1, '개인의 약 보관함', { meds: 3, bandage: 2 }, { locked: true, owned: true }),
      box('clinic_roof', 1030, 2, '옥상 물통', { water: 6, wood: 4 })
    ],
    npcs: [resident('clinic_keeper', 1020, 1, { name: '진료소 관리인', patrolMin: 890, patrolMax: 1160, restricted: { floor: 1, min: 890, max: 1215 } })]
  },
  garage: {
    loot: [
      box('garage_scrap', 225, 0, '작업장 고철', { parts: 7, wood: 5 }),
      box('garage_fuel', 650, 0, '남은 연료통', { fuel: 5, cloth: 2 }),
      box('garage_locker', 440, 1, '잠긴 작업함', { crowbar: 1, parts: 5 }, { locked: true }),
      box('garage_private', 1070, 1, '관리인의 보급품', { raw: 4, water: 4, meds: 1 }, { owned: true }),
      box('garage_roof', 1000, 2, '다락의 부속품', { parts: 7, wood: 6, fuel: 2 })
    ],
    npcs: [resident('garage_keeper', 990, 1, { name: '정비소 관리인', kind: 'guard', health: 78, patrolMin: 900, patrolMax: 1160, restricted: { floor: 1, min: 900, max: 1215 }, damage: 8 })]
  },
  apartments: {
    loot: [
      box('apartments_shared', 225, 0, '주민 나눔 상자', { water: 4, wood: 4, cloth: 2 }),
      box('apartments_debris', 650, 0, '빈집의 잔해', { parts: 5, fuel: 3 }),
      box('apartments_pantry', 460, 1, '가족의 식료품', { raw: 7, meal: 2 }, { owned: true }),
      box('apartments_medicine', 1060, 1, '잠긴 약장', { meds: 2, bandage: 2, water: 4 }, { locked: true, owned: true }),
      box('apartments_attic', 1020, 2, '빈 다락', { wood: 7, parts: 4, cloth: 3 })
    ],
    npcs: [
      resident('apartments_parent', 490, 1, { name: '집을 지키는 주민', patrolMin: 380, patrolMax: 600, restricted: { floor: 1, min: 350, max: 1215 }, health: 72 }),
      resident('apartments_neighbor', 1080, 1, { name: '이웃 주민', patrolMin: 940, patrolMax: 1170, restricted: { floor: 1, min: 880, max: 1215 }, health: 58, damage: 5 })
    ]
  },
  warehouse: {
    loot: [
      box('warehouse_outer', 220, 0, '철길 옆 상자', { wood: 5, parts: 5 }),
      box('warehouse_food', 1000, 0, '식량 보급함', { raw: 6, meal: 3, water: 5 }),
      box('warehouse_lock', 450, 1, '잠긴 장비함', { knife: 1, parts: 8, bandage: 2 }, { locked: true }),
      box('warehouse_fuel', 1090, 1, '창고 연료', { fuel: 7, wood: 8 }),
      box('warehouse_upper', 1030, 2, '상층 보급품', { raw: 5, meds: 2, parts: 5 }, { locked: true })
    ],
    npcs: [
      resident('warehouse_guard_a', 1000, 0, { name: '창고 경비', kind: 'guard', hostile: true, health: 76, patrolMin: 830, patrolMax: 1150, damage: 10, speed: 112 }),
      resident('warehouse_guard_b', 1070, 1, { name: '순찰 경비', kind: 'guard', hostile: true, health: 72, patrolMin: 940, patrolMax: 1160, damage: 9, speed: 108 })
    ]
  }
};


const DOOR_LAYOUTS = {
  cottage: [
    { id: 'cottage_hall_door', x: 500, floor: 0, open: true, locked: false, label: '복도 문' },
    { id: 'cottage_landing_door', x: 920, floor: 1, open: true, locked: false, label: '위층 문' }
  ],
  clinic: [
    { id: 'clinic_ward_door', x: 880, floor: 1, open: false, locked: false, label: '진료실 문' },
    { id: 'clinic_roof_door', x: 920, floor: 2, open: true, locked: false, label: '옥상 문' }
  ],
  garage: [
    { id: 'garage_workshop_door', x: 600, floor: 0, open: true, locked: false, label: '작업장 문' },
    { id: 'garage_office_door', x: 900, floor: 1, open: false, locked: false, label: '사무실 문' },
    { id: 'garage_storage_door', x: 900, floor: 2, open: false, locked: true, label: '잠긴 다락 문' }
  ],
  apartments: [
    { id: 'apartments_family_door', x: 350, floor: 1, open: false, locked: false, label: '가족의 현관문' },
    { id: 'apartments_bedroom_door', x: 920, floor: 1, open: false, locked: true, label: '잠긴 방 문' },
    { id: 'apartments_attic_door', x: 900, floor: 2, open: true, locked: false, label: '다락 문' }
  ],
  warehouse: [
    { id: 'warehouse_loading_door', x: 740, floor: 0, open: false, locked: false, label: '하역장 문' },
    { id: 'warehouse_upper_door', x: 920, floor: 1, open: false, locked: false, label: '창고 안쪽 문' },
    { id: 'warehouse_roof_door', x: 950, floor: 2, open: false, locked: true, label: '잠긴 보급실 문' }
  ]
};

const ENCOUNTERS = [
  {
    id: 'clinic_supplies', locationId: 'clinic', npcIds: ['clinic_keeper'],
    title: '다음 환자를 위한 물자', body: '관리인은 환자에게 쓸 물과 붕대가 부족하다고 말합니다. 먼저 출입을 부탁하거나, 필요한 물자를 건네고 남은 의약품을 나눠 받을 수 있습니다.',
    lootIds: ['clinic_private'], doorIds: ['clinic_ward_door'],
    help: { cost: { water: 2, bandage: 1 }, reward: { meds: 1 }, label: '치료 물자를 지원하기', description: '물 2개와 붕대 1개를 건네고 약품 1개를 받습니다.' },
    trade: { cost: { meal: 2 }, reward: { bandage: 2 }, label: '식사를 붕대와 교환하기', description: '식사 2개를 붕대 2개와 교환합니다.' }
  },
  {
    id: 'garage_repair', locationId: 'garage', npcIds: ['garage_keeper'],
    title: '고장 난 발전기', body: '관리인은 발전기를 고칠 부품과 버틸 식량이 필요합니다. 수리를 돕거나 보급품을 교환하면 사무실 물자를 나누겠다고 합니다.',
    lootIds: ['garage_private'], doorIds: ['garage_office_door'],
    help: { cost: { parts: 3 }, reward: { fuel: 2 }, label: '수리 부품을 건네기', description: '부품 3개로 수리를 돕고 연료 2개를 받습니다.' },
    trade: { cost: { water: 3, meal: 1 }, reward: { parts: 4 }, label: '보급품을 부품과 교환하기', description: '물 3개와 식사 1개를 부품 4개와 교환합니다.' }
  },
  {
    id: 'family_support', locationId: 'apartments', npcIds: ['apartments_parent', 'apartments_neighbor'],
    title: '오늘을 버틸 한 끼', body: '남은 가족은 끼니와 물이 부족합니다. 이웃은 함께 쓰는 물자를 지키고 있습니다. 도움이나 교환으로 동의를 얻으면 가족의 보관함을 나눠 쓸 수 있습니다.',
    lootIds: ['apartments_pantry', 'apartments_medicine'], doorIds: ['apartments_family_door', 'apartments_bedroom_door'],
    help: { cost: { meal: 2, water: 2 }, reward: { cloth: 2 }, label: '가족에게 식사와 물 나누기', description: '식사 2개와 물 2개를 건네고 천 2개를 받습니다.' },
    trade: { cost: { meds: 1 }, reward: { raw: 2 }, label: '약품을 식재료와 교환하기', description: '약품 1개를 식재료 2개와 교환합니다.' }
  }
];

function encounterForNpc(npcId) {
  return ENCOUNTERS.find(encounter => encounter.npcIds.includes(npcId));
}

function areaPermission(exp, npc) {
  const encounter = encounterForNpc(npc.id);
  return !!encounter && !npc.hostile && !npc.aggression && !exp.locationState.hostileNpcIds?.includes(npc.id) && !!exp.locationState.permissions?.[encounter.id]?.area;
}

function applyPermissions(exp) {
  for (const encounter of ENCOUNTERS.filter(entry => entry.locationId === exp.locationId)) {
    const hostile = encounter.npcIds.some(id => exp.locationState.hostileNpcIds.includes(id));
    if (hostile && exp.locationState.permissions[encounter.id]) exp.locationState.permissions[encounter.id] = { area: false, loot: false };
    const permission = exp.locationState.permissions[encounter.id];
    for (const loot of exp.loot.filter(entry => encounter.lootIds.includes(entry.id))) {
      loot.owned = !permission?.loot;
      if (permission?.loot && loot.locked) { loot.locked = false; persistLoot(exp, loot); }
    }
    if (permission?.area) for (const door of exp.doors.filter(entry => encounter.doorIds.includes(entry.id))) {
      if (door.locked) { door.locked = false; persistDoor(exp, door); }
    }
  }
}

function markHostile(exp, npc, household = false) {
  const encounter = encounterForNpc(npc.id);
  const ids = household && encounter ? encounter.npcIds : [npc.id];
  for (const id of ids) {
    if (!exp.locationState.hostileNpcIds.includes(id)) exp.locationState.hostileNpcIds.push(id);
    const member = exp.npcs.find(entry => entry.id === id);
    if (member) member.aggression = 1;
  }
  if (encounter) {
    exp.locationState.permissions[encounter.id] = { area: false, loot: false };
    applyPermissions(exp);
  }
}

function makeDoors(locationId, saved = {}, legacyOpen = false) {
  return (DOOR_LAYOUTS[locationId] || []).map(template => {
    const remembered = saved[template.id];
    return { ...template, open: remembered?.open ?? (legacyOpen || template.open), locked: remembered?.locked ?? (legacyOpen ? false : template.locked) };
  });
}

function closedDoorBetween(exp, floor, fromX, toX, exceptId = null) {
  const min = Math.min(fromX, toX);
  const max = Math.max(fromX, toX);
  return (exp.doors || []).filter(door => !door.open && door.id !== exceptId && door.floor === floor && door.x > min + 0.01 && door.x < max - 0.01)
    .sort((a, b) => Math.abs(a.x - fromX) - Math.abs(b.x - fromX))[0] || null;
}

function visibleSegments(exp) {
  const player = exp.player;
  let min = Math.max(WORLD_MIN, player.x - VISION_RANGE);
  let max = Math.min(WORLD_MAX, player.x + VISION_RANGE);
  for (const door of exp.doors || []) {
    if (door.open || door.floor !== player.floor) continue;
    if (door.x < player.x && door.x > min) min = door.x;
    if (door.x > player.x && door.x < max) max = door.x;
  }
  return [{ floor: player.floor, min, max }];
}

function insideSegments(entity, segments) {
  return segments.some(segment => segment.floor === entity.floor && entity.x >= segment.min - 0.01 && entity.x <= segment.max + 0.01);
}

function mergeExplored(segments) {
  const merged = [];
  for (const segment of [...segments].sort((a, b) => a.floor - b.floor || a.min - b.min)) {
    const last = merged[merged.length - 1];
    if (last && last.floor === segment.floor && segment.min <= last.max + 0.1) last.max = Math.max(last.max, segment.max);
    else merged.push({ floor: segment.floor, min: segment.min, max: segment.max });
  }
  return merged;
}

/** Pure query. Remember discovered containers and doors, but never remember moving NPCs. */
export function getVisibility(exp) {
  const segments = visibleSegments(exp);
  const knownLoot = new Set(exp.knownLootIds || exp.locationState?.knownLootIds || []);
  const knownDoors = new Set(exp.knownDoorIds || exp.locationState?.knownDoorIds || []);
  for (const loot of exp.loot || []) if (insideSegments(loot, segments)) knownLoot.add(loot.id);
  for (const door of exp.doors || []) if (insideSegments(door, segments)) knownDoors.add(door.id);
  return {
    lootIds: [...knownLoot], doorIds: [...knownDoors],
    npcIds: (exp.npcs || []).filter(npc => npc.health > 0 && npc.state !== 'gone' && insideSegments(npc, segments)).map(npc => npc.id),
    range: VISION_RANGE, visibleSegments: segments
  };
}

function updateExploration(exp) {
  const visible = getVisibility(exp);
  exp.explored = mergeExplored([...(exp.explored || []), ...visible.visibleSegments]);
  exp.knownLootIds = visible.lootIds;
  exp.knownDoorIds = visible.doorIds;
  exp.locationState.explored = copy(exp.explored);
  exp.locationState.knownLootIds = [...exp.knownLootIds];
  exp.locationState.knownDoorIds = [...exp.knownDoorIds];
}

function persistDoor(exp, door) {
  exp.locationState.doors ||= {};
  exp.locationState.doors[door.id] = { open: door.open, locked: door.locked };
}

function ensureExpeditionFeatures(exp) {
  // Old running games had no physical doors: migration must not erect a wall on their path.
  if (exp.doors === undefined) exp.doors = makeDoors(exp.locationId, exp.locationState.doors || {}, true);
  if (exp.locationState.doors === undefined) exp.locationState.doors = {};
  for (const door of exp.doors) persistDoor(exp, door);
  if (exp.explored === undefined) exp.explored = copy(exp.locationState.explored || []);
  if (exp.knownLootIds === undefined) exp.knownLootIds = [...(exp.locationState.knownLootIds || Object.keys(exp.locationState.searched).filter(id => exp.locationState.searched[id]))];
  if (exp.knownDoorIds === undefined) exp.knownDoorIds = [...(exp.locationState.knownDoorIds || [])];
  if (exp.bandageCooldown === undefined) exp.bandageCooldown = 0;
  if (exp.stats.bandagesUsed === undefined) exp.stats.bandagesUsed = 0;
  if (exp.stats.healed === undefined) exp.stats.healed = 0;
  if (exp.stats.helped === undefined) exp.stats.helped = 0;
  if (exp.stats.dodges === undefined) exp.stats.dodges = 0;
  if (exp.stats.distractions === undefined) exp.stats.distractions = 0;
  if (exp.distraction === undefined) exp.distraction = null;
  if (exp.distractionCooldown === undefined) exp.distractionCooldown = 0;
  if (exp._distractionHeld === undefined) exp._distractionHeld = false;
  if (exp.locationState.encounters === undefined) exp.locationState.encounters = {};
  if (exp.locationState.permissions === undefined) exp.locationState.permissions = {};
  if (exp.locationState.hostileNpcIds === undefined) exp.locationState.hostileNpcIds = exp.npcs.filter(npc => npc.aggression).map(npc => npc.id);
  if (exp.player.stamina === undefined) exp.player.stamina = 100;
  if (exp.player.staminaDelay === undefined) exp.player.staminaDelay = 0;
  if (exp.player.dodge === undefined) exp.player.dodge = null;
  if (exp.player.evade === undefined) exp.player.evade = 0;
  if (exp.player.dodgeCooldown === undefined) exp.player.dodgeCooldown = 0;
  if (exp._dodgeHeld === undefined) exp._dodgeHeld = false;
  if (exp.player.blockedDoorId === undefined) exp.player.blockedDoorId = null;
  for (const npc of exp.npcs) {
    if (npc.blockedDoorId === undefined) npc.blockedDoorId = null;
    if (npc.doorWait === undefined) npc.doorWait = 0;
    if (npc.windup === undefined) npc.windup = 0;
    if (exp.locationState.hostileNpcIds.includes(npc.id)) npc.aggression = 1;
  }
  applyPermissions(exp);
  updateExploration(exp);
}

function ensureCurrent(exp) {
  if (exp.doors === undefined || exp.bandageCooldown === undefined || exp.player.stamina === undefined || exp.locationState.encounters === undefined || exp.distractionCooldown === undefined) ensureExpeditionFeatures(exp);
}

export function getLocationIntel(state, locationId) {
  const templates = MAPS[locationId]?.loot || [];
  const saved = state?.locations?.[locationId];
  const visits = Math.max(0, Math.floor(finite(saved?.visits)));
  const searchedIds = templates.filter(loot => saved?.searched?.[loot.id]).map(loot => loot.id);
  const known = new Set(saved?.knownLootIds || searchedIds);
  const remainingKnownItems = {};
  for (const id of known) {
    if (!saved?.searched?.[id]) continue;
    for (const [itemId, quantity] of Object.entries(counts(saved?.remaining?.[id]))) remainingKnownItems[itemId] = (remainingKnownItems[itemId] || 0) + quantity;
  }
  let lockedCount = templates.filter(loot => known.has(loot.id) && loot.locked && !saved?.opened?.[loot.id]).length;
  for (const id of saved?.knownDoorIds || []) if (saved?.doors?.[id]?.locked) lockedCount++;
  const cleared = templates.length > 0 && searchedIds.length === templates.length && templates.every(loot => Object.hasOwn(saved?.remaining || {}, loot.id) && Object.values(counts(saved.remaining[loot.id])).every(quantity => quantity === 0));
  return { visits, searched: searchedIds.length, totalContainers: templates.length, remainingKnownItems, cleared, lockedCount };
}

function counts(value = {}) {
  const out = {};
  for (const [key, quantity] of Object.entries(value)) {
    if (Object.hasOwn(ITEMS, key) && Number.isSafeInteger(quantity) && quantity > 0) out[key] = quantity;
  }
  return out;
}

function random(exp) {
  let value = exp.rng >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  exp.rng = value >>> 0 || 0x6d2b79f5;
  return exp.rng / 4294967296;
}

function seedFor(seed, text) {
  let value = Number(seed) >>> 0 || 0x6d2b79f5;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0;
  return value || 0x6d2b79f5;
}

function say(exp, text, record = false) {
  exp.notice = text;
  exp.noticeTime = 4;
  if (record && exp.events[exp.events.length - 1] !== text) {
    exp.events.push(text);
    if (exp.events.length > 30) exp.events.shift();
  }
}

function persistLoot(exp, loot) {
  exp.locationState.remaining[loot.id] = { ...loot.items };
  exp.locationState.opened[loot.id] = !loot.locked;
  exp.locationState.searched[loot.id] = !!loot.searched;
}

function persistNpc(exp, npc, removed = false) {
  exp.locationState.npcState[npc.id] = { health: Math.max(0, npc.health), removed: removed || npc.state === 'gone' || npc.health <= 0 };
}

export function createExpedition(context = {}, state = {}) {
  context ||= {};
  state ||= {};
  const plan = state.nightPlan || {};
  const locationId = plan.locationId ?? context.locationId ?? 'cottage';
  const location = LOCATIONS.find(entry => entry.id === locationId);
  if (!location) throw new Error('알 수 없는 수색 지역입니다.');
  const candidate = context.character || (typeof context.scavenger === 'object' ? context.scavenger : null);
  const characterId = plan.scavengerId ?? plan.charId ?? context.charId ?? candidate?.id;
  const character = state.characters?.find(entry => entry.id === characterId) || candidate || state.characters?.find(entry => entry.alive) || {};
  const loadout = counts(plan.loadout ?? context.loadout ?? {});
  const capacity = Math.max(1, Math.floor(finite(context.capacity, finite(character.capacity, 12))));
  if (usedSlots(loadout) > capacity) throw new Error('출발 물품이 가방 용량을 초과합니다.');

  state.locations ||= {};
  const saved = state.locations[locationId] ||= {};
  saved.remaining ||= {};
  saved.opened ||= {};
  saved.searched ||= {};
  saved.npcState ||= {};
  saved.dropped ||= [];
  saved.nextDropId = Math.max(0, Math.floor(finite(saved.nextDropId)));
  saved.visits = Math.max(0, Math.floor(finite(saved.visits))) + 1;
  const definition = MAPS[locationId];
  const loot = definition.loot.map(template => {
    if (!Object.hasOwn(saved.remaining, template.id)) saved.remaining[template.id] = { ...template.items };
    return { ...copy(template), items: counts(saved.remaining[template.id]), locked: template.locked && !saved.opened[template.id], searched: !!saved.searched[template.id] };
  });
  for (const dropped of saved.dropped) {
    if (dropped && typeof dropped.id === 'string' && Number.isFinite(dropped.x) && Number.isInteger(dropped.floor)) {
      loot.push({ ...dropped, items: counts(saved.remaining[dropped.id]), locked: false, owned: false, searched: true, dropped: true });
    }
  }

  const companionId = plan.companionId ?? context.companionId ?? null;
  const companionChar = companionId ? (state.characters?.find(entry => entry.id === companionId) || context.companion || null) : null;
  const companion = companionChar ? {
    id: companionChar.id || companionId,
    name: companionChar.name || '동료 봇',
    role: companionChar.role || '동료',
    color: companionChar.color || '#8aaabc',
    x: 155, floor: 0,
    health: clamp(finite(companionChar.health, 100), 1, 100),
    fatigue: clamp(finite(companionChar.fatigue), 0, 100),
    stamina: 100, staminaDelay: 0,
    noise: 0, hidden: false, facing: 1, sneaking: false,
    route: [], target: null, climb: null, moving: false,
    dodge: null, dodgeCooldown: 0, evade: 0,
    attackCooldown: 0, hitFlash: 0, blockedDoorId: null,
    bandageCooldown: 0, distractionCooldown: 0,
    dead: false, extracted: false
  } : null;

  const exp = {
    version: 1, locationId, name: location.name, kind: location.kind,
    width: 1280, height: 720, time: 0, duration: 100,
    revision: { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 },
    rng: seedFor(state.seed, `${locationId}:${state.day || 1}:${saved.visits}`),
    player: {
      id: character.id || characterId || 'mira', name: character.name || '수색자', color: character.color || '#e8b264',
      x: 100, floor: 0, health: clamp(finite(character.health, 100), 0, 100),
      fatigue: clamp(finite(character.fatigue), 0, 100), noise: 0, hidden: false, facing: 1,
      sneaking: false, route: [], target: null, climb: null, moving: false, attackCooldown: 0, hitFlash: 0
    },
    companion,
    floors: [...FLOORS],
    doors: makeDoors(locationId, saved.doors || {}),
    explored: copy(saved.explored || []),
    knownLootIds: [...(saved.knownLootIds || Object.keys(saved.searched).filter(id => saved.searched[id]))],
    knownDoorIds: [...(saved.knownDoorIds || [])],
    bandageCooldown: 0,
    stairs: [{ id: 'stairs_west', x: 280, from: 0, to: 1 }, { id: 'stairs_east', x: 800, from: 1, to: 2 }],
    hides: [
      { id: 'hide_ground', x: 610, floor: 0, label: '어두운 틈' },
      { id: 'hide_mid', x: 665, floor: 1, label: '가림막 뒤' },
      { id: 'hide_upper', x: 1130, floor: 2, label: '옷장 뒤' }
    ],
    loot,
    npcs: definition.npcs.filter(template => !saved.npcState[template.id]?.removed).map(template => ({
      ...copy(template), health: clamp(finite(saved.npcState[template.id]?.health, template.health), 1, template.health),
      maxHealth: template.health, originX: template.x, originFloor: template.floor,
      state: 'patrol', facing: -1, alert: 0, aggression: 0, warnTime: 0, memory: 0,
      route: [], climb: null, target: null, cooldown: 0, lastNoiseId: 0, hitFlash: 0
    })),
    bag: { ...loadout }, loadout: { ...loadout }, capacity,
    initialHealth: clamp(finite(character.health, 100), 0, 100),
    initialFatigue: clamp(finite(character.fatigue), 0, 100),
    activeLootId: null, progress: null, locationState: saved,
    events: [], done: false, result: null, noises: [], nextNoiseId: 1,
    notice: '물자를 살펴본 뒤 왼쪽 출입구로 돌아오세요. E: 조사 · Shift: 은신 이동', noticeTime: 8,
    stats: { searched: 0, taken: 0, theft: 0, killed: 0, scared: 0, attacks: 0, detected: 0, moraleDelta: 0 },
    theftContainers: {}, _interactHeld: false, _moveNoiseTime: 0
  };
  if (locationId === 'warehouse') exp.stairs.push({ id: 'stairs_back', x: 1140, from: 0, to: 1 });
  ensureExpeditionFeatures(exp);
  return exp;
}

/** A tiny weighted waypoint graph; path is computed through actual stair links. */
function routeBetween(exp, x, floor, targetX, targetFloor, knownSegments = null) {
  const nodes = [{ x, floor }, { x: targetX, floor: targetFloor }];
  const stairPairs = [];
  for (const stair of exp.stairs) {
    const a = nodes.length;
    nodes.push({ x: stair.x, floor: stair.from }, { x: stair.x, floor: stair.to });
    stairPairs.push([a, a + 1]);
  }
  const distance = Array(nodes.length).fill(Infinity);
  const previous = Array(nodes.length).fill(-1);
  const visited = Array(nodes.length).fill(false);
  distance[0] = 0;
  for (let pass = 0; pass < nodes.length; pass++) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited[i] && (current < 0 || distance[i] < distance[current])) current = i;
    if (current < 0 || !Number.isFinite(distance[current])) break;
    if (current === 1) break;
    visited[current] = true;
    for (let next = 0; next < nodes.length; next++) {
      if (next === current || visited[next]) continue;
      let cost = Infinity;
      if (nodes[current].floor === nodes[next].floor && (!knownSegments || exploredBetween(knownSegments, nodes[current].floor, nodes[current].x, nodes[next].x))) cost = Math.abs(nodes[current].x - nodes[next].x);
      if (stairPairs.some(([a, b]) => (a === current && b === next) || (b === current && a === next))) cost = 125;
      if (distance[current] + cost < distance[next]) {
        distance[next] = distance[current] + cost;
        previous[next] = current;
      }
    }
  }
  if (!Number.isFinite(distance[1])) return [];
  const path = [];
  for (let index = 1; index !== 0 && index !== -1; index = previous[index]) path.unshift({ ...nodes[index] });
  return path;
}

function exploredBetween(segments, floor, fromX, toX) {
  return segments.some(segment => segment.floor === floor && segment.min <= Math.min(fromX, toX) + 0.01 && segment.max >= Math.max(fromX, toX) - 0.01);
}

/** A read-only field map. Unknown rooms, container contents and unseen people stay unknown. */
export function getNavigation(exp) {
  const visibility = getVisibility(exp);
  const explored = mergeExplored([...(exp.explored || []), ...visibility.visibleSegments]);
  const known = entity => insideSegments(entity, explored);
  const visible = entity => insideSegments(entity, visibility.visibleSegments);
  const knownStairs = (exp.stairs || []).filter(stair => known({ x: stair.x, floor: stair.from }) && known({ x: stair.x, floor: stair.to }));
  const origin = { x: exp.player.x, floor: exp.player.floor };
  const destination = { x: 100, floor: 0 };
  const waypoints = routeBetween({ stairs: knownStairs }, origin.x, origin.floor, destination.x, destination.floor, explored);
  const knownRoute = waypoints.length > 0;
  const route = [origin];
  let distance = knownRoute ? 0 : null;
  let blockedDoorId = null;
  let previous = origin;
  for (const point of waypoints) {
    distance += previous.floor === point.floor ? Math.abs(point.x - previous.x) : 125;
    if (!blockedDoorId) {
      const door = previous.floor === point.floor ? closedDoorBetween(exp, point.floor, previous.x, point.x) : null;
      if (door) {
        blockedDoorId = door.id;
        route.push({ x: door.x - Math.sign(point.x - previous.x) * DOOR_CLEARANCE, floor: point.floor });
      } else if (point.x !== route[route.length - 1].x || point.floor !== route[route.length - 1].floor) route.push({ ...point });
    }
    previous = point;
  }
  const coverage = explored.reduce((sum, segment) => sum + Math.max(0, Math.min(WORLD_MAX, segment.max) - Math.max(WORLD_MIN, segment.min)), 0);
  return {
    floor: exp.player.floor,
    exploredPercent: Math.round(clamp(coverage / ((WORLD_MAX - WORLD_MIN) * FLOORS.length) * 100, 0, 100)),
    exit: { ...destination, reached: exp.player.floor === 0 && exp.player.x <= EXIT_X && !exp.player.climb && !exp.player.dodge, distance, knownRoute, blockedDoorId, route },
    marks: {
      loot: exp.loot.filter(loot => visibility.lootIds.includes(loot.id)).map(loot => ({ id: loot.id, x: loot.x, floor: loot.floor, label: loot.label, searched: !!loot.searched, empty: !!loot.searched && !Object.values(loot.items).some(amount => amount > 0), locked: !!loot.locked, owned: !!loot.owned, visible: visible(loot) })),
      doors: (exp.doors || []).filter(door => visibility.doorIds.includes(door.id)).map(door => ({ id: door.id, x: door.x, floor: door.floor, label: door.label, open: door.open, locked: door.locked, visible: visible(door) })),
      hides: (exp.hides || []).filter(known).map(spot => ({ id: spot.id, x: spot.x, floor: spot.floor, label: spot.label, visible: visible(spot) })),
      stairs: (exp.stairs || []).filter(stair => known({ x: stair.x, floor: stair.from }) || known({ x: stair.x, floor: stair.to })).map(stair => ({ id: stair.id, x: stair.x, from: stair.from, to: stair.to, visible: visible({ x: stair.x, floor: stair.from }) || visible({ x: stair.x, floor: stair.to }) })),
      npcs: exp.npcs.filter(npc => visibility.npcIds.includes(npc.id)).map(npc => ({ id: npc.id, x: npc.x, floor: npc.floor, name: npc.name, state: npc.state, hostile: !!(npc.hostile || npc.aggression) }))
    }
  };
}

function cancelProgress(exp, silent = false) {
  if (exp.progress && !silent) say(exp, exp.progress.type === 'bandage' ? '응급처치를 멈췄습니다. 붕대는 사용하지 않았습니다.' : '조사를 멈췄습니다. 다시 E를 눌러 조사할 수 있습니다.');
  exp.progress = null;
  exp.activeLootId = null;
}

export function moveTo(exp, x, floor = exp.player.floor) {
  if (exp.done || exp.player.dodge || !Number.isFinite(x) || !Number.isInteger(floor) || floor < 0 || floor >= exp.floors.length) return null;
  const target = { x: clamp(x, WORLD_MIN, WORLD_MAX), floor };
  cancelProgress(exp, true);
  exp.player.hidden = false;
  exp.player.target = target;
  exp.player.blockedDoorId = null;
  // A climb finishes before the new route is generated from its landing.
  const fromFloor = exp.player.climb ? exp.player.climb.to : exp.player.floor;
  const fromX = exp.player.climb ? exp.player.climb.x : exp.player.x;
  exp.player.route = routeBetween(exp, fromX, fromFloor, target.x, target.floor);
  return target;
}

function startClimb(exp, entity, nextFloor) {
  const stair = exp.stairs.find(entry => Math.abs(entry.x - entity.x) < 4 && ((entry.from === entity.floor && entry.to === nextFloor) || (entry.to === entity.floor && entry.from === nextFloor)));
  if (!stair) return false;
  entity.climb = { x: stair.x, from: entity.floor, to: nextFloor, elapsed: 0, duration: 0.85 };
  entity.x = stair.x;
  return true;
}

function movementDoor(exp, entity, toX) {
  const direction = Math.sign(toX - entity.x);
  if (!direction) return null;
  return (exp.doors || []).filter(door => {
    if (door.open || door.floor !== entity.floor) return false;
    return direction > 0
      ? door.x >= entity.x - 0.01 && toX > door.x - DOOR_CLEARANCE
      : door.x <= entity.x + 0.01 && toX < door.x + DOOR_CLEARANCE;
  }).sort((a, b) => Math.abs(a.x - entity.x) - Math.abs(b.x - entity.x))[0] || null;
}

function moveHorizontal(exp, entity, toX) {
  const before = entity.x;
  const blocked = movementDoor(exp, entity, toX);
  if (!blocked) {
    entity.x = clamp(toX, WORLD_MIN, WORLD_MAX);
    entity.moving = Math.abs(entity.x - before) > 0.01;
    entity.blockedDoorId = null;
    return true;
  }
  const direction = Math.sign(toX - before);
  entity.x = blocked.x - direction * DOOR_CLEARANCE;
  entity.moving = Math.abs(entity.x - before) > 0.01;
  entity.route = [];
  entity.target = null;
  if (entity.blockedDoorId !== blocked.id) {
    entity.blockedDoorId = blocked.id;
    if (entity === exp.player) say(exp, blocked.locked ? '잠긴 문 앞입니다. 지렛대를 가지고 E를 누르세요.' : '닫힌 문 앞입니다. E를 누르거나 문을 클릭해 여세요.');
    else entity.doorWait = 0.55;
  }
  return false;
}

function handleNpcDoor(exp, npc, dt) {
  if (!npc.blockedDoorId) return false;
  const door = exp.doors?.find(entry => entry.id === npc.blockedDoorId);
  if (!door || door.open || door.floor !== npc.floor || Math.abs(door.x - npc.x) > REACH) {
    npc.blockedDoorId = null;
    npc.doorWait = 0;
    return false;
  }
  npc.moving = false;
  if (door.locked) {
    if (npc.state === 'patrol') { npc.facing *= -1; npc.blockedDoorId = null; }
    return true;
  }
  npc.doorWait = Math.max(0, npc.doorWait - dt);
  if (npc.doorWait > 0) return true;
  door.open = true;
  persistDoor(exp, door);
  npc.blockedDoorId = null;
  return false;
}

function followRoute(exp, entity, dt, speed) {
  entity.moving = false;
  if (entity.climb) {
    entity.climb.elapsed += dt;
    entity.moving = true;
    if (entity.climb.elapsed >= entity.climb.duration) {
      entity.floor = entity.climb.to;
      entity.x = entity.climb.x;
      entity.climb = null;
    }
    return;
  }
  const target = entity.route?.[0];
  if (!target) return;
  if (target.floor !== entity.floor) {
    if (!startClimb(exp, entity, target.floor)) entity.route = [];
    return;
  }
  const delta = target.x - entity.x;
  const arrived = Math.abs(delta) <= speed * dt + 0.5;
  const nextX = arrived ? target.x : entity.x + Math.sign(delta) * speed * dt;
  if (Math.abs(delta) > 0.01) entity.facing = Math.sign(delta);
  if (!moveHorizontal(exp, entity, nextX)) return;
  if (arrived) entity.route.shift();
}

function pursue(exp, npc, target, dt, speed = npc.speed) {
  if (handleNpcDoor(exp, npc, dt)) return;
  if (!npc.target || npc.target.floor !== target.floor || Math.abs(npc.target.x - target.x) > 45 || !npc.route?.length) {
    const fromFloor = npc.climb ? npc.climb.to : npc.floor;
    const fromX = npc.climb ? npc.climb.x : npc.x;
    npc.route = routeBetween(exp, fromX, fromFloor, target.x, target.floor);
    npc.target = { ...target };
  }
  followRoute(exp, npc, dt, speed);
}

function emitNoise(exp, strength, aggressive = false) {
  const value = clamp(strength, 0, 1);
  exp.player.noise = Math.max(exp.player.noise, value);
  exp.noises.push({ id: exp.nextNoiseId++, x: exp.player.x, floor: exp.player.floor, strength: value, remaining: 1.5, aggressive });
  if (exp.noises.length > 12) exp.noises.shift();
}

/** Availability never spends items, updates exploration, advances time or migrates saved data. */
export function getDistraction(exp, targetX, floor = exp.player.floor) {
  const player = exp.player;
  let x = targetX;
  if (x === undefined) {
    const direction = player.facing === -1 ? -1 : 1;
    const segment = visibleSegments(exp).find(entry => entry.floor === player.floor);
    const candidate = facing => {
      let edge = facing > 0 ? segment.max : segment.min;
      if ((exp.doors || []).some(door => !door.open && door.floor === player.floor && Math.abs(door.x - edge) < 0.1)) edge -= facing * DOOR_CLEARANCE;
      return facing > 0 ? Math.min(player.x + 200, edge) : Math.max(player.x - 200, edge);
    };
    x = candidate(direction);
    if (Math.abs(x - player.x) < DISTRACTION_RULES.minRange) x = candidate(-direction);
  }
  const target = Number.isFinite(x) && Number.isInteger(floor) ? { x, floor } : null;
  let reason = '';
  if (exp.done || player.health <= 0) reason = '진행 중인 수색에서만 유인할 수 있습니다.';
  else if (player.climb) reason = '계단 이동을 마친 뒤 던지세요.';
  else if (player.dodge) reason = '회피 동작을 마친 뒤 던지세요.';
  else if (exp.progress) reason = '조사나 응급처치를 마친 뒤 던지세요.';
  else if (player.attackCooldown > 0) reason = '공격 동작을 마친 뒤 던지세요.';
  else if ((exp.distractionCooldown || 0) > 0) reason = `다시 유인하려면 ${Math.ceil(exp.distractionCooldown)}초가 필요합니다.`;
  else if (!(exp.bag.parts >= DISTRACTION_RULES.cost.parts)) reason = '가방에 부품 1개가 필요합니다.';
  else if (!target || floor !== player.floor || floor < 0 || floor >= FLOORS.length) reason = '현재 층의 보이는 위치를 선택하세요.';
  else if (x < WORLD_MIN || x > WORLD_MAX || Math.abs(x - player.x) > DISTRACTION_RULES.range || Math.abs(x - player.x) < DISTRACTION_RULES.minRange) reason = '60~260 거리 안의 위치를 선택하세요.';
  else if (!insideSegments(target, visibleSegments(exp)) || closedDoorBetween(exp, floor, player.x, x)) reason = '닫힌 문을 넘겨 던질 수 없습니다. 보이는 방 안을 선택하세요.';
  return {
    available: !reason, reason, target, cost: { ...DISTRACTION_RULES.cost },
    cooldown: DISTRACTION_RULES.cooldown, remainingCooldown: exp.distractionCooldown || 0,
    range: DISTRACTION_RULES.range, minRange: DISTRACTION_RULES.minRange
  };
}

export function throwDistraction(exp, targetX, floor = exp.player.floor) {
  const option = getDistraction(exp, targetX, floor);
  if (!option.available) return fail(option.reason);
  ensureCurrent(exp);
  exp.bag.parts -= DISTRACTION_RULES.cost.parts;
  if (!exp.bag.parts) delete exp.bag.parts;
  const event = { ...option.target, remaining: DISTRACTION_RULES.lifetime, total: DISTRACTION_RULES.lifetime };
  exp.distraction = event;
  exp.distractionCooldown = DISTRACTION_RULES.cooldown;
  exp.stats.distractions++;
  exp.noises.push({ id: exp.nextNoiseId++, ...option.target, strength: 1, remaining: DISTRACTION_RULES.lifetime, aggressive: false, kind: 'distraction' });
  if (exp.noises.length > 12) exp.noises.shift();
  exp.player.route = [];
  exp.player.target = null;
  exp.player.moving = false;
  exp.activeLootId = null;
  // A throw from a hiding place keeps concealment. Sound comes from the landing, not the player.
  const message = '부품 1개를 던졌습니다. 아직 나를 보지 못한 사람은 소리가 난 곳을 살핍니다.';
  say(exp, message, true);
  return { ok: true, event: { ...event }, cost: { ...DISTRACTION_RULES.cost }, message };
}

export function getNearby(exp) {
  const player = exp.player;
  const movingAction = player.climb || player.dodge;
  const nearest = list => list.filter(entry => entry.floor === player.floor && Math.abs(entry.x - player.x) <= REACH && !closedDoorBetween(exp, player.floor, player.x, entry.x, entry.id))
    .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0] || null;
  const loot = movingAction ? null : nearest(exp.loot);
  const hideSpot = movingAction ? null : nearest(exp.hides || []);
  const exit = !movingAction && player.floor === 0 && player.x <= EXIT_X;
  const door = movingAction ? null : nearest((exp.doors || []).filter(entry => !entry.open)) || (!loot && !hideSpot && !exit ? nearest(exp.doors || []) : null);
  const stairs = movingAction ? null : exp.stairs.filter(stair => (stair.from === player.floor || stair.to === player.floor) && Math.abs(stair.x - player.x) <= REACH && !closedDoorBetween(exp, player.floor, player.x, stair.x))
    .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0] || null;
  return { loot, exit, hide: !!hideSpot, hideSpot, stairs, door };
}

export function interact(exp, target = null) {
  if (exp.done) return fail('수색이 이미 끝났습니다.');
  ensureCurrent(exp);
  if (exp.player.dodge) return fail('회피 동작을 마친 뒤 행동하세요.');
  if (exp.player.climb) return fail('계단을 다 이동한 뒤 조사하세요.');
  if (exp.progress) return fail(exp.progress.type === 'bandage' ? '응급처치 중입니다. 이동하면 중단할 수 있습니다.' : '조사 중입니다. 이동하면 중단할 수 있습니다.');
  const nearby = getNearby(exp);
  const reachable = entity => entity && entity.floor === exp.player.floor && Math.abs(entity.x - exp.player.x) <= REACH && !closedDoorBetween(exp, entity.floor, exp.player.x, entity.x, entity.id);
  if (target && !['loot', 'hide', 'exit', 'door'].includes(target.type)) return fail('상호작용 대상을 확인하세요.');
  if (target?.type === 'exit') return returnHome(exp);
  const selectedLoot = target ? (target.type === 'loot' ? exp.loot.find(loot => loot.id === target.id) : null) : nearby.loot;
  const selectedHide = target ? (target.type === 'hide' ? exp.hides.find(spot => spot.id === target.id) : null) : nearby.hideSpot;
  const selectedDoor = target ? (target.type === 'door' ? exp.doors.find(door => door.id === target.id) : null) : nearby.door;
  if ((target?.type === 'loot' && !reachable(selectedLoot)) || (target?.type === 'hide' && !reachable(selectedHide)) || (target?.type === 'door' && !reachable(selectedDoor))) return fail('선택한 대상 가까이 이동하세요.');
  if (exp.player.hidden && (!target || target.type === 'hide')) {
    exp.player.hidden = false;
    say(exp, '은신처에서 나왔습니다.');
    return { ok: true, hidden: false };
  }
  if (selectedDoor) {
    if (selectedDoor.locked && !(exp.bag.crowbar > 0)) {
      say(exp, '잠긴 문입니다. 지렛대가 있어야 열 수 있습니다.');
      return fail('지렛대가 필요합니다.');
    }
    if (selectedDoor.open && [exp.player, ...exp.npcs.filter(npc => npc.health > 0 && npc.state !== 'gone')].some(entity => entity.floor === selectedDoor.floor && Math.abs(entity.x - selectedDoor.x) < DOOR_CLEARANCE)) {
      return fail('문에서 한 걸음 떨어진 뒤 닫으세요.');
    }
    const unlocked = selectedDoor.locked;
    selectedDoor.locked = false;
    selectedDoor.open = !selectedDoor.open;
    exp.player.hidden = false;
    exp.player.route = [];
    exp.player.target = null;
    exp.player.blockedDoorId = null;
    exp.player.moving = false;
    exp.activeLootId = null;
    persistDoor(exp, selectedDoor);
    emitNoise(exp, unlocked ? 0.9 : 0.2);
    updateExploration(exp);
    say(exp, unlocked ? '지렛대로 문을 열었습니다. 도구는 다시 사용할 수 있습니다.' : selectedDoor.open ? '문을 열었습니다.' : '문을 닫았습니다. 발소리는 문 너머로 들릴 수 있습니다.');
    return { ok: true, doorId: selectedDoor.id, open: selectedDoor.open, unlocked };
  }
  if (selectedLoot) {
    const loot = selectedLoot;
    exp.player.hidden = false;
    if (loot.locked && !(exp.bag.crowbar > 0)) {
      say(exp, '잠긴 보관함입니다. 지렛대를 가져오세요.');
      return fail('지렛대가 필요합니다.');
    }
    exp.player.route = [];
    exp.player.target = null;
    if (loot.searched && !loot.locked) {
      exp.activeLootId = loot.id;
      say(exp, Object.values(loot.items).some(n => n > 0) ? `${loot.label} — 가방에 담을 물품을 고르세요.` : '이곳에는 남은 물품이 없습니다.');
      return { ok: true, lootId: loot.id };
    }
    const total = loot.locked ? 3.8 : 1.8;
    exp.progress = { id: `search_${loot.id}`, type: 'search', lootId: loot.id, remaining: total, total, label: loot.locked ? '지렛대로 여는 중' : '물품을 살펴보는 중' };
    exp.activeLootId = null;
    emitNoise(exp, loot.locked ? 0.9 : 0.25);
    say(exp, loot.owned ? '사유물입니다. 가져가면 마음의 부담과 발각 위험이 생깁니다.' : '물품을 살펴보고 있습니다.');
    return { ok: true, searching: true, lootId: loot.id };
  }
  if (selectedHide) {
    exp.player.route = [];
    exp.player.target = null;
    exp.player.hidden = true;
    exp.activeLootId = null;
    say(exp, '그림자 속에 숨었습니다. E를 누르거나 이동하면 나옵니다.');
    return { ok: true, hidden: true };
  }
  if (nearby.exit) return returnHome(exp);
  return fail('가까운 상자나 은신 지점으로 이동하세요.');
}

function encounterBusyReason(exp) {
  if (exp.player.climb) return '계단 이동을 마친 뒤 이야기하세요.';
  if (exp.player.dodge) return '회피 동작을 마친 뒤 이야기하세요.';
  if (exp.progress) return '진행 중인 조사나 응급처치를 마친 뒤 이야기하세요.';
  if (exp.player.attackCooldown > 0) return '공격 동작을 마친 뒤 이야기하세요.';
  return '';
}

function encounterBag(exp, option) {
  const bag = { ...exp.bag };
  for (const [itemId, quantity] of Object.entries(option.cost)) {
    if ((bag[itemId] || 0) < quantity) return { reason: `가방에 ${ITEMS[itemId].name} ${quantity}개가 필요합니다.` };
    bag[itemId] -= quantity;
    if (!bag[itemId]) delete bag[itemId];
  }
  for (const [itemId, quantity] of Object.entries(option.reward)) bag[itemId] = (bag[itemId] || 0) + quantity;
  if (usedSlots(bag) > exp.capacity) return { reason: '받을 물품을 넣을 가방 공간이 부족합니다.' };
  return { bag, reason: '' };
}

/** Read-only nearby dialogue query: neither an unseen resident nor their deal leaks through doors. */
export function getEncounter(exp, npcId) {
  if (exp.done || exp.player.health <= 0) return null;
  const visible = new Set(getVisibility(exp).npcIds);
  const npc = exp.npcs.filter(entry => {
    const definition = encounterForNpc(entry.id);
    const hostileHousehold = definition?.npcIds.some(id => exp.locationState.hostileNpcIds?.includes(id) || exp.npcs.some(member => member.id === id && (member.aggression || member.hostile)));
    return (!npcId || entry.id === npcId) && entry.health > 0 && !entry.hostile && !entry.aggression && !entry.climb && !['gone', 'flee', 'chase', 'attack'].includes(entry.state) && !hostileHousehold
      && entry.floor === exp.player.floor && Math.abs(entry.x - exp.player.x) <= TALK_REACH && visible.has(entry.id) && definition?.locationId === exp.locationId;
  })
    .sort((a, b) => Math.abs(a.x - exp.player.x) - Math.abs(b.x - exp.player.x))[0];
  if (!npc) return null;
  const encounter = encounterForNpc(npc.id);
  const history = exp.locationState.encounters?.[encounter.id] || { requested: false, resolved: false, choiceId: null };
  const permission = exp.locationState.permissions?.[encounter.id] || { area: false, loot: false };
  const options = [
    { id: 'request', label: '출입 허락을 부탁하기', description: '물품을 건드리지 않겠다고 약속하고 방을 지나갈 허락을 구합니다.', cost: {}, reward: {}, consequence: '무료 · 사유 구역 출입 허용 · 보관함은 계속 사유물 · 도움이나 교환은 이후 선택 가능' },
    ...['help', 'trade'].map(id => ({ id, ...encounter[id], consequence: `${id === 'help' ? '도움 1회 기록 · 사기 +3 · ' : ''}사유 구역과 보관함 이용 허용 · 이 도움/교환 보상은 한 번만 받을 수 있음` }))
  ].map(option => {
    let reason = encounterBusyReason(exp);
    if (!reason && option.id === 'request' && (history.requested || permission.area)) reason = '이미 출입 허락을 받았습니다.';
    if (!reason && option.id !== 'request' && history.resolved) reason = '이미 도움 또는 교환을 마쳤습니다.';
    if (!reason) reason = encounterBag(exp, option).reason;
    return { ...copy(option), available: !reason, reason };
  });
  return { id: encounter.id, npcId: npc.id, npcName: npc.name || '주민', title: encounter.title, body: encounter.body, resolved: !!history.resolved, permission: { area: !!permission.area, loot: !!permission.loot }, options };
}

/** Commit both sides and permission together, or leave every inventory/relationship unchanged. */
export function resolveEncounter(exp, npcId, choiceId) {
  if (exp.done) return fail('수색이 끝났습니다.');
  ensureCurrent(exp);
  const available = getEncounter(exp, npcId);
  if (!available) return fail('이야기할 수 있는 주민이 가까이 보이지 않습니다.');
  const option = available.options.find(entry => entry.id === choiceId);
  if (!option) return fail('대화 선택지를 확인하세요.');
  if (!option.available) return fail(option.reason);
  const exchange = encounterBag(exp, option);
  if (exchange.reason) return fail(exchange.reason);
  const definition = ENCOUNTERS.find(entry => entry.id === available.id);
  const prior = exp.locationState.encounters[definition.id] || { requested: false, resolved: false, choiceId: null };
  const resolved = choiceId !== 'request';
  const permission = { area: true, loot: resolved || available.permission.loot };
  exp.bag = exchange.bag;
  exp.locationState.encounters[definition.id] = { requested: true, resolved: prior.resolved || resolved, choiceId: resolved ? choiceId : prior.choiceId };
  exp.locationState.permissions[definition.id] = permission;
  exp.player.route = [];
  exp.player.target = null;
  exp.player.moving = false;
  exp.player.hidden = false;
  exp.activeLootId = null;
  for (const npc of exp.npcs.filter(entry => definition.npcIds.includes(entry.id))) {
    npc.warnTime = 0;
    npc.alert = 0;
    npc.memory = 0;
    npc.windup = 0;
    npc.route = [];
    npc.target = null;
    if (!npc.aggression && !['gone', 'flee'].includes(npc.state)) npc.state = 'patrol';
  }
  if (choiceId === 'help') {
    exp.stats.helped++;
    exp.stats.moraleDelta = clamp(exp.stats.moraleDelta + 3, -100, 100);
  }
  applyPermissions(exp);
  updateExploration(exp);
  const message = choiceId === 'request' ? '출입을 허락받았습니다. 보관함의 물품은 아직 주민의 것입니다.' : choiceId === 'help' ? '주민을 도왔습니다. 보상을 받고 사유 보관함도 나눠 쓸 허락을 얻었습니다.' : '교환을 마쳤습니다. 보상을 받고 사유 보관함도 나눠 쓸 허락을 얻었습니다.';
  say(exp, message, true);
  return { ok: true, message, encounterId: definition.id, npcId: available.npcId, choiceId, cost: { ...option.cost }, reward: { ...option.reward }, permission: { ...permission }, resolved: prior.resolved || resolved };
}

function seesPlayer(exp, npc) {
  const player = exp.player;
  if (player.hidden || player.climb || npc.climb || npc.floor !== player.floor) return false;
  if (closedDoorBetween(exp, player.floor, npc.x, player.x)) return false;
  const delta = player.x - npc.x;
  const range = npc.visionRange * (player.sneaking ? 0.72 : 1);
  return Math.abs(delta) < range && (Math.abs(delta) < 65 || Math.sign(delta) === npc.facing || npc.alert > 0.65);
}

function beginChase(exp, npc, message) {
  if (!['chase', 'attack'].includes(npc.state)) {
    exp.stats.detected++;
    say(exp, message || `${npc.name || '주민'}에게 들켰습니다. 거리를 벌리거나 숨어보세요.`);
  }
  npc.state = 'chase';
  npc.alert = 1;
  npc.memory = 4;
  npc.lastKnown = { x: exp.player.x, floor: exp.player.floor };
}

export function takeLoot(exp, lootId, itemId, qty = 1) {
  if (exp.done) return fail('수색이 끝났습니다.');
  ensureCurrent(exp);
  if (exp.player.dodge) return fail('회피 동작을 마친 뒤 물품을 챙기세요.');
  if (!Object.hasOwn(ITEMS, itemId) || !Number.isSafeInteger(qty) || qty <= 0) return fail('올바른 물품 수량을 선택하세요.');
  const loot = exp.loot.find(entry => entry.id === lootId);
  if (!loot || !loot.searched || loot.locked || exp.activeLootId !== lootId) return fail('먼저 이 보관함을 조사하세요.');
  if (exp.player.climb || loot.floor !== exp.player.floor || Math.abs(loot.x - exp.player.x) > REACH || closedDoorBetween(exp, loot.floor, exp.player.x, loot.x)) return fail('보관함 가까이 이동하세요.');
  if ((loot.items[itemId] || 0) < qty) return fail('그만큼의 물품이 남아 있지 않습니다.');
  const bag = { ...exp.bag, [itemId]: (exp.bag[itemId] || 0) + qty };
  if (usedSlots(bag) > exp.capacity) return fail('가방이 가득 찼습니다. 일부 물품을 내려놓으세요.');
  exp.bag = bag;
  loot.items[itemId] -= qty;
  if (!loot.items[itemId]) delete loot.items[itemId];
  exp.stats.taken += qty;
  if (loot.owned) {
    exp.stats.theft += qty;
    if (!exp.theftContainers[loot.id]) {
      exp.theftContainers[loot.id] = true;
      exp.stats.moraleDelta = Math.max(-30, exp.stats.moraleDelta - 5);
      say(exp, '다른 사람의 물품을 가져왔습니다. 이 선택은 남습니다.', true);
    }
    for (const npc of exp.npcs) {
      if (npc.health > 0 && npc.state !== 'gone' && npc.state !== 'flee' && seesPlayer(exp, npc)) {
        markHostile(exp, npc);
        beginChase(exp, npc, '주민이 물품을 가져가는 것을 봤습니다!');
      }
    }
  } else say(exp, `${ITEMS[itemId].name || itemId} ${qty}개를 가방에 넣었습니다.`);
  persistLoot(exp, loot);
  return { ok: true, quantity: qty };
}

/** Deterministic container order; partial stacks fit before untouched items remain in place. */
export function takeAllLoot(exp, lootId) {
  if (exp.done) return fail('수색이 끝났습니다.');
  if (exp.player.dodge) return fail('회피 동작을 마친 뒤 물품을 챙기세요.');
  const loot = exp.loot.find(entry => entry.id === lootId);
  if (!loot || !loot.searched || loot.locked || exp.activeLootId !== lootId) return fail('먼저 이 보관함을 조사하세요.');
  if (exp.player.climb || loot.floor !== exp.player.floor || Math.abs(loot.x - exp.player.x) > REACH || closedDoorBetween(exp, loot.floor, exp.player.x, loot.x)) return fail('보관함 가까이 이동하세요.');
  const taken = {};
  let count = 0;
  for (const [itemId, available] of Object.entries(loot.items)) {
    if (!Object.hasOwn(ITEMS, itemId) || available <= 0) continue;
    let min = 0;
    let max = available;
    while (min < max) {
      const middle = Math.ceil((min + max) / 2);
      if (usedSlots({ ...exp.bag, [itemId]: (exp.bag[itemId] || 0) + middle }) <= exp.capacity) min = middle;
      else max = middle - 1;
    }
    if (!min) continue;
    const result = takeLoot(exp, lootId, itemId, min);
    if (result.ok) { taken[itemId] = min; count += min; }
  }
  const remaining = { ...loot.items };
  const partial = Object.values(remaining).some(quantity => quantity > 0);
  if (!count) return { ...fail(partial ? '가방이 가득 찼습니다. 일부 물품을 내려놓으세요.' : '이곳에는 남은 물품이 없습니다.'), taken, count: 0, partial, remaining };
  say(exp, partial ? `${count}개를 챙겼습니다. 가방에 들어가지 않은 물품은 이곳에 남습니다.` : `${count}개를 모두 가방에 담았습니다.`);
  return { ok: true, taken, count, partial, remaining };
}

/** Reserve a bandage while working; consume only when the entire treatment succeeds. */
export function useBandage(exp) {
  if (exp.done) return fail('수색이 끝났습니다.');
  ensureCurrent(exp);
  if (exp.player.dodge || exp.player.attackCooldown > 0) return fail('전투 동작을 마친 뒤 응급처치를 하세요.');
  if (exp.player.climb) return fail('계단에서 내려온 뒤 응급처치를 하세요.');
  if (exp.progress) return fail('진행 중인 행동을 마치거나 이동해 중단하세요.');
  if (exp.player.health <= 0 || exp.player.health >= 100) return fail('지금은 응급처치가 필요하지 않습니다.');
  if (!(exp.bag.bandage > 0)) return fail('가방에 붕대가 없습니다.');
  if (exp.bandageCooldown > 0) return fail(`${Math.ceil(exp.bandageCooldown)}초 뒤에 다시 처치할 수 있습니다.`);
  exp.player.route = [];
  exp.player.target = null;
  exp.player.moving = false;
  exp.activeLootId = null;
  exp.progress = { id: 'field_bandage', type: 'bandage', total: BANDAGE_TIME, remaining: BANDAGE_TIME, label: '붕대로 응급처치 중', origin: { x: exp.player.x, floor: exp.player.floor } };
  say(exp, '3초 동안 가만히 있어야 합니다. 이동하거나 맞으면 붕대를 쓰지 않고 중단합니다.');
  return { ok: true, treating: true };
}

function finishBandage(exp) {
  if (exp.progress?.type !== 'bandage' || exp.progress.remaining > 0) return;
  if (!(exp.bag.bandage > 0) || exp.player.health <= 0) { cancelProgress(exp); return; }
  exp.bag.bandage--;
  if (!exp.bag.bandage) delete exp.bag.bandage;
  const restored = Math.min(30, 100 - exp.player.health);
  exp.player.health += restored;
  exp.stats.bandagesUsed++;
  exp.stats.healed += restored;
  exp.bandageCooldown = BANDAGE_COOLDOWN;
  exp.progress = null;
  say(exp, `붕대 1개로 체력 ${restored}을 회복했습니다.`, true);
}

function droppedCache(exp, label = '두고 온 물자') {
  const existing = exp.loot.find(loot => loot.dropped && loot.floor === exp.player.floor && Math.abs(loot.x - exp.player.x) < 65 && !closedDoorBetween(exp, loot.floor, exp.player.x, loot.x));
  if (existing) return existing;
  const id = `${exp.locationId}_drop_${++exp.locationState.nextDropId}`;
  const loot = { id, x: exp.player.x, floor: exp.player.floor, label, items: {}, locked: false, owned: false, searched: true, dropped: true };
  exp.loot.push(loot);
  exp.locationState.dropped.push({ id, x: loot.x, floor: loot.floor, label, dropped: true });
  if (!exp.knownLootIds.includes(id)) exp.knownLootIds.push(id);
  exp.locationState.knownLootIds = [...exp.knownLootIds];
  return loot;
}

export function dropItem(exp, itemId, qty = 1) {
  if (exp.done) return fail('수색이 끝났습니다.');
  ensureCurrent(exp);
  if (exp.player.dodge) return fail('회피 동작을 마친 뒤 물품을 내려놓으세요.');
  if (exp.player.climb) return fail('계단에서 내려온 뒤 물품을 내려놓으세요.');
  if (!Object.hasOwn(ITEMS, itemId) || !Number.isSafeInteger(qty) || qty <= 0 || (exp.bag[itemId] || 0) < qty) return fail('내려놓을 수량을 확인하세요.');
  if (itemId === 'bandage' && exp.progress?.type === 'bandage' && exp.bag.bandage - qty < 1) return fail('응급처치에 사용하는 붕대 1개는 내려놓을 수 없습니다.');
  const cache = droppedCache(exp);
  exp.bag[itemId] -= qty;
  if (!exp.bag[itemId]) delete exp.bag[itemId];
  cache.items[itemId] = (cache.items[itemId] || 0) + qty;
  persistLoot(exp, cache);
  say(exp, '물품을 이곳에 두었습니다. 다시 조사하면 회수할 수 있습니다.');
  return { ok: true, lootId: cache.id };
}

/** A committed, finite evasive burst; it cannot cancel a weapon recovery or cross a stair. */
export function dodge(exp, direction = exp.player.facing) {
  if (exp.done) return fail('수색이 끝났습니다.');
  ensureCurrent(exp);
  if (exp.player.health <= 0) return fail('수색자가 움직일 수 없습니다.');
  if (!Number.isFinite(direction) || !direction) return fail('회피 방향을 확인하세요.');
  if (exp.player.climb) return fail('계단에서는 회피할 수 없습니다.');
  if (exp.player.dodge || exp.player.dodgeCooldown > 0) return fail('다음 회피를 준비하고 있습니다.');
  if (exp.player.attackCooldown > 0) return fail('공격 동작을 마친 뒤 회피하세요.');
  if (exp.player.stamina < COMBAT_RULES.dodgeStamina) return fail(`회피에는 스태미나 ${COMBAT_RULES.dodgeStamina}이 필요합니다.`);
  const facing = Math.sign(direction);
  const next = clamp(exp.player.x + facing, WORLD_MIN, WORLD_MAX);
  if (next === exp.player.x || movementDoor(exp, exp.player, next)) return fail('그 방향은 막혀 있습니다.');
  cancelProgress(exp, true);
  exp.player.hidden = false;
  exp.player.route = [];
  exp.player.target = null;
  exp.player.facing = facing;
  exp.player.stamina -= COMBAT_RULES.dodgeStamina;
  exp.player.staminaDelay = COMBAT_RULES.staminaDelay;
  exp.player.dodge = { direction: facing, remaining: COMBAT_RULES.dodgeDuration, total: COMBAT_RULES.dodgeDuration };
  exp.player.evade = COMBAT_RULES.evadeDuration;
  exp.player.dodgeCooldown = COMBAT_RULES.dodgeCooldown;
  exp.stats.dodges++;
  emitNoise(exp, 0.5);
  say(exp, '몸을 낮춰 빠르게 피합니다. 잠깐의 회피 뒤에는 빈틈이 생깁니다.');
  return { ok: true, direction: facing, staminaCost: COMBAT_RULES.dodgeStamina };
}

function stepDodge(exp, dt) {
  const action = exp.player.dodge;
  if (!action) return;
  const elapsed = Math.min(dt, action.remaining);
  const targetX = clamp(exp.player.x + action.direction * COMBAT_RULES.dodgeSpeed * elapsed, WORLD_MIN, WORLD_MAX);
  const clear = moveHorizontal(exp, exp.player, targetX);
  action.remaining = Math.max(0, action.remaining - elapsed - 1e-10);
  if (!clear || targetX === WORLD_MIN || targetX === WORLD_MAX) exp.player.evade = 0;
  if (!clear || !action.remaining || targetX === WORLD_MIN || targetX === WORLD_MAX) exp.player.dodge = null;
}

export function attack(exp) {
  if (exp.done) return fail('수색이 끝났습니다.');
  ensureCurrent(exp);
  if (exp.player.dodge) return fail('회피 동작을 마친 뒤 대응하세요.');
  if (exp.player.climb) return fail('계단에서 내려온 뒤 대응하세요.');
  if (exp.player.attackCooldown > 0) return fail('다음 공격을 준비하고 있습니다.');
  if (exp.player.stamina < COMBAT_RULES.attackStamina) return fail(`공격에는 스태미나 ${COMBAT_RULES.attackStamina}이 필요합니다.`);
  const candidates = exp.npcs.filter(npc => npc.health > 0 && npc.state !== 'gone' && !npc.climb && npc.floor === exp.player.floor && Math.abs(npc.x - exp.player.x) <= ATTACK_REACH && !closedDoorBetween(exp, npc.floor, exp.player.x, npc.x));
  const npc = candidates.sort((a, b) => Math.abs(a.x - exp.player.x) - Math.abs(b.x - exp.player.x))[0];
  if (!npc) return fail('공격할 대상이 가까이 없습니다.');
  const ambush = exp.player.hidden && !['chase', 'attack'].includes(npc.state);
  const baseDamage = exp.bag.knife ? 33 : exp.bag.crowbar ? 23 : 14;
  const damage = Math.round(baseDamage * (ambush ? 1.7 : 1));
  exp.player.hidden = false;
  exp.player.route = [];
  exp.player.target = null;
  exp.player.facing = Math.sign(npc.x - exp.player.x) || exp.player.facing;
  exp.player.attackCooldown = 0.65;
  exp.player.stamina -= COMBAT_RULES.attackStamina;
  exp.player.staminaDelay = COMBAT_RULES.staminaDelay;
  exp.player.fatigue = clamp(exp.player.fatigue + 1.4, 0, 100);
  cancelProgress(exp, true);
  exp.stats.attacks++;
  npc.health = Math.max(0, npc.health - damage);
  npc.hitFlash = 0.25;
  markHostile(exp, npc, true);
  npc.windup = 0;
  npc.cooldown = Math.max(npc.cooldown, 0.35);
  emitNoise(exp, 1, true);
  if (npc.health <= 0) {
    npc.state = 'gone';
    npc.route = [];
    exp.stats.killed++;
    exp.stats.moraleDelta = Math.max(-50, exp.stats.moraleDelta - (npc.hostile ? 3 : 16));
    persistNpc(exp, npc, true);
    say(exp, '상대가 쓰러졌습니다. 주변을 확인하고 돌아갈 길을 확보하세요.', true);
  } else if (npc.health <= 20) {
    npc.state = 'flee';
    npc.alert = 1;
    npc.route = [];
    npc.target = null;
    exp.stats.scared++;
    exp.stats.moraleDelta = Math.max(-50, exp.stats.moraleDelta - (npc.hostile ? 0 : 5));
    persistNpc(exp, npc);
    say(exp, '상대가 물러납니다. 더 싸우지 않고 떠날 수 있습니다.', true);
  } else {
    beginChase(exp, npc, ambush ? '기습했습니다. 상대가 아직 움직입니다!' : '교전 중입니다. 부상이 커지기 전에 물러날 수도 있습니다.');
    persistNpc(exp, npc);
  }
  for (const other of exp.npcs) {
    if (other !== npc && other.kind === 'guard' && other.state !== 'gone' && other.state !== 'flee' && Math.abs(other.x - npc.x) < 300 && Math.abs(other.floor - npc.floor) <= 1) {
      markHostile(exp, other);
      other.state = 'investigate';
      other.lastKnown = { x: npc.x, floor: npc.floor };
      other.memory = 4;
      other.alert = 0.8;
    }
  }
  return { ok: true, damage, targetId: npc.id, ambush, fled: npc.state === 'flee' };
}

function updateNpc(exp, npc, dt) {
  if (npc.state === 'gone' || npc.health <= 0) { npc.windup = 0; return; }
  npc.cooldown = Math.max(0, npc.cooldown - dt);
  npc.hitFlash = Math.max(0, (npc.hitFlash || 0) - dt);
  if (npc.state === 'flee') {
    npc.windup = 0;
    pursue(exp, npc, { x: 75, floor: 0 }, dt, 185);
    if (npc.floor === 0 && npc.x < EXIT_X && !npc.climb) {
      npc.state = 'gone';
      persistNpc(exp, npc, true);
    }
    return;
  }
  if (npc.windup > 0) {
    npc.moving = false;
    npc.route = [];
    npc.windup = Math.max(0, npc.windup - dt - 1e-10);
    if (!npc.windup) {
      npc.cooldown = 1.05;
      const hit = seesPlayer(exp, npc) && Math.abs(npc.x - exp.player.x) < COMBAT_RULES.npcAttackReach && exp.player.evade <= 0;
      if (hit) {
        if (exp.progress?.type === 'bandage') cancelProgress(exp);
        exp.player.health = Math.max(0, exp.player.health - npc.damage);
        exp.player.hitFlash = 0.3;
        say(exp, `다쳤습니다. 체력 ${Math.ceil(exp.player.health)} — 공격 예고가 보이면 거리를 벌리세요.`);
        if (exp.player.health <= 0) complete(exp, { dead: true });
      } else say(exp, '상대의 공격이 빗나갔습니다. 출구로 물러날 기회입니다.');
    }
    return;
  }
  const visible = seesPlayer(exp, npc);
  const restricted = npc.restricted && !areaPermission(exp, npc) && exp.player.floor === npc.restricted.floor && exp.player.x >= npc.restricted.min && exp.player.x <= npc.restricted.max;
  if (visible && (npc.hostile || npc.aggression)) beginChase(exp, npc);
  else if (visible && restricted) {
    if (npc.state !== 'warn') say(exp, `${npc.name || '주민'}: 여기는 우리 구역이야. 돌아가 줘.`);
    npc.state = 'warn';
    npc.warnTime += dt;
    npc.alert = clamp(0.3 + npc.warnTime / 5, 0, 1);
    npc.facing = Math.sign(exp.player.x - npc.x) || npc.facing;
    npc.route = [];
    if (npc.warnTime >= 3.1) {
      markHostile(exp, npc);
      beginChase(exp, npc, '침입 경고를 무시했습니다. 출구로 물러나세요!');
    }
  } else if (npc.state === 'warn') {
    npc.warnTime = Math.max(0, npc.warnTime - dt * 2);
    npc.alert = Math.max(0, npc.alert - dt);
    if (!npc.warnTime) npc.state = 'patrol';
  }

  // A thrown object is a separate, same-floor sound source. Seeing the survivor and an
  // attack already in motion always take priority; a lure never erases hostility.
  const distraction = !visible && npc.state !== 'attack' && !npc.climb
    ? [...exp.noises].reverse().find(noise => noise.kind === 'distraction' && noise.id > npc.lastNoiseId && noise.floor === npc.floor
      && Math.abs(noise.x - npc.x) <= DISTRACTION_RULES.hearingRange
      && !closedDoorBetween(exp, npc.floor, npc.x, noise.x))
    : null;
  if (distraction) {
    npc.lastNoiseId = distraction.id;
    npc.lastKnown = { x: distraction.x, floor: distraction.floor };
    npc.memory = 4.5;
    npc.state = 'investigate';
    npc.alert = 0.5;
    npc.route = [];
    npc.target = null;
    npc.warnTime = 0;
  }

  if (['chase', 'attack'].includes(npc.state)) {
    if (visible) {
      npc.memory = 4;
      npc.lastKnown = { x: exp.player.x, floor: exp.player.floor };
    } else npc.memory = Math.max(0, npc.memory - dt);
    const close = visible && !npc.climb && npc.floor === exp.player.floor && Math.abs(npc.x - exp.player.x) < COMBAT_RULES.npcAttackReach;
    if (close) {
      npc.state = 'attack';
      npc.route = [];
      npc.facing = Math.sign(exp.player.x - npc.x) || npc.facing;
      if (!npc.cooldown) {
        npc.windup = COMBAT_RULES.windup;
        npc.moving = false;
        say(exp, `${npc.name || '상대'}가 공격을 준비합니다. 물러나거나 회피하세요!`);
      }
    } else if (npc.memory > 0 && npc.lastKnown) {
      npc.state = 'chase';
      pursue(exp, npc, npc.lastKnown, dt, npc.speed * 1.13);
    } else {
      npc.state = 'investigate';
      npc.memory = 2;
      npc.route = [];
      npc.alert = 0.55;
    }
    return;
  }
  if (npc.state === 'warn') return;

  const heard = !distraction && [...exp.noises].reverse().find(noise => {
    if (noise.kind === 'distraction') return false;
    if (noise.id <= npc.lastNoiseId) return false;
    const floorDifference = Math.abs(noise.floor - npc.floor);
    const doorFactor = !floorDifference && closedDoorBetween(exp, npc.floor, npc.x, noise.x) ? 0.45 : 1;
    return floorDifference <= 1 && Math.abs(noise.x - npc.x) < npc.hearingRange * noise.strength * (floorDifference ? 0.5 : 1) * doorFactor;
  });
  if (heard) {
    npc.lastNoiseId = heard.id;
    npc.lastKnown = { x: heard.x, floor: heard.floor };
    npc.memory = 2.8;
    npc.state = 'investigate';
    npc.alert = 0.5;
    if (heard.aggressive && npc.kind === 'guard') markHostile(exp, npc);
  }
  if (npc.state === 'investigate' && npc.lastKnown) {
    npc.memory -= dt;
    pursue(exp, npc, npc.lastKnown, dt, npc.speed * 0.9);
    if (npc.memory <= 0) {
      npc.state = 'patrol';
      npc.alert = 0;
      npc.route = [];
      npc.target = null;
    }
    return;
  }
  npc.alert = Math.max(0, npc.alert - dt * 0.3);
  if (npc.floor !== npc.originFloor || npc.climb) {
    pursue(exp, npc, { x: npc.originX, floor: npc.originFloor }, dt, npc.speed * 0.65);
  } else {
    npc.route = [];
    npc.target = null;
    if (handleNpcDoor(exp, npc, dt)) return;
    if (!moveHorizontal(exp, npc, npc.x + npc.facing * npc.speed * 0.44 * dt)) return;
    if (npc.x <= npc.patrolMin) { npc.x = npc.patrolMin; npc.facing = 1; }
    if (npc.x >= npc.patrolMax) { npc.x = npc.patrolMax; npc.facing = -1; }
  }
}

export function stepExpedition(exp, deltaSeconds, input = {}) {
  if (exp.done) return { changed: false, done: true };
  ensureCurrent(exp);
  const dt = clamp(finite(deltaSeconds), 0, 0.1);
  if (!dt) return { changed: false, done: false };
  if (exp.player.health <= 0) { complete(exp, { dead: true }); return { changed: true, done: true }; }
  exp.time = Math.min(exp.duration, exp.time + dt);
  exp.noticeTime = Math.max(0, (exp.noticeTime || 0) - dt);
  exp.player.attackCooldown = Math.max(0, exp.player.attackCooldown - dt);
  exp.player.dodgeCooldown = Math.max(0, exp.player.dodgeCooldown - dt);
  exp.player.staminaDelay = Math.max(0, exp.player.staminaDelay - dt);
  exp.bandageCooldown = Math.max(0, exp.bandageCooldown - dt);
  exp.distractionCooldown = Math.max(0, exp.distractionCooldown - dt);
  if (exp.distraction) {
    exp.distraction.remaining = Math.max(0, exp.distraction.remaining - dt);
    if (!exp.distraction.remaining) exp.distraction = null;
  }
  exp.player.hitFlash = Math.max(0, exp.player.hitFlash - dt);
  exp.player.noise = Math.max(0, exp.player.noise - dt * 0.9);
  exp.player.fatigue = clamp(exp.player.fatigue + dt * 0.13, 0, 100);
  exp.noises = exp.noises.map(noise => ({ ...noise, remaining: noise.remaining - dt })).filter(noise => noise.remaining > 0);
  exp.player.sneaking = !!input.sneak;

  if (input.interact && !exp._interactHeld) interact(exp);
  exp._interactHeld = !!input.interact;
  if (exp.done) return { changed: true, done: true };

  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const vertical = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  if (input.dodge && !exp._dodgeHeld) dodge(exp, direction || exp.player.facing);
  exp._dodgeHeld = !!input.dodge;
  if (input.distraction && !exp._distractionHeld) {
    const target = input.distractionTarget;
    throwDistraction(exp, target?.x, target?.floor ?? exp.player.floor);
  }
  exp._distractionHeld = !!input.distraction;
  if ((direction || vertical) && exp.progress) cancelProgress(exp);
  if (exp.player.dodge) stepDodge(exp, dt);
  else if (direction && !exp.player.climb) {
    cancelProgress(exp);
    exp.player.hidden = false;
    exp.player.route = [];
    exp.player.target = null;
    const speed = exp.player.sneaking ? 85 : 166;
    const before = exp.player.x;
    moveHorizontal(exp, exp.player, clamp(before + direction * speed * dt, WORLD_MIN, WORLD_MAX));
    exp.player.facing = direction;
  } else if (!exp.progress) {
    if (vertical && !exp.player.climb) {
      const targetFloor = exp.player.floor + vertical;
      if (targetFloor >= 0 && targetFloor < exp.floors.length && (!exp.player.target || exp.player.target.floor !== targetFloor)) {
        const stair = exp.stairs.filter(entry => (entry.from === exp.player.floor && entry.to === targetFloor) || (entry.to === exp.player.floor && entry.from === targetFloor))
          .sort((a, b) => Math.abs(a.x - exp.player.x) - Math.abs(b.x - exp.player.x))[0];
        if (stair) moveTo(exp, stair.x, targetFloor);
      }
    }
    followRoute(exp, exp.player, dt, exp.player.sneaking ? 85 : 166);
  } else exp.player.moving = false;

  exp.player.evade = Math.max(0, exp.player.evade - dt);
  if (!exp.player.dodge && !exp.player.climb && !exp.progress && !exp.player.attackCooldown && !exp.player.staminaDelay) {
    exp.player.stamina = Math.min(100, exp.player.stamina + COMBAT_RULES.staminaRecovery * dt);
  }

  if (exp.player.moving) {
    exp.player.hidden = false;
    exp.activeLootId = null;
    exp._moveNoiseTime -= dt;
    if (exp._moveNoiseTime <= 0) {
      emitNoise(exp, exp.player.sneaking ? 0.08 : 0.42);
      exp._moveNoiseTime = 0.5;
    }
  }
  if (exp.progress) {
    if (exp.progress.type === 'bandage') {
      const origin = exp.progress.origin;
      if (exp.player.climb || origin.floor !== exp.player.floor || Math.abs(origin.x - exp.player.x) > 0.1 || !(exp.bag.bandage > 0)) cancelProgress(exp);
      else exp.progress.remaining = Math.max(0, exp.progress.remaining - dt - 1e-10);
    } else {
      const loot = exp.loot.find(entry => entry.id === exp.progress.lootId);
      if (!loot || loot.floor !== exp.player.floor || Math.abs(loot.x - exp.player.x) > REACH || closedDoorBetween(exp, loot.floor, exp.player.x, loot.x)) cancelProgress(exp);
      else {
        exp.progress.remaining = Math.max(0, exp.progress.remaining - dt - 1e-10);
        if (!exp.progress.remaining) {
          loot.locked = false;
          loot.searched = true;
          exp.stats.searched++;
          exp.activeLootId = loot.id;
          exp.progress = null;
          persistLoot(exp, loot);
          say(exp, loot.owned ? '사유물입니다. 가져갈지는 당신의 선택입니다.' : `${loot.label} — 필요한 물품을 가방에 담으세요.`);
        }
      }
    }
  }
  for (const npc of exp.npcs) {
    if (exp.done) break;
    updateNpc(exp, npc, dt);
  }
  if (!exp.done && exp.companion && !exp.companion.dead) stepCompanion(exp, dt);
  if (!exp.done && exp.time >= exp.duration) returnHome(exp, true);
  // Taking a hit on the final treatment frame still interrupts before any consumption.
  else if (!exp.done) finishBandage(exp);
  updateExploration(exp);
  return { changed: true, done: exp.done };
}

function stepCompanion(exp, dt) {
  const bot = exp.companion;
  if (!bot || bot.dead) return;
  bot.attackCooldown = Math.max(0, (bot.attackCooldown || 0) - dt);
  bot.dodgeCooldown = Math.max(0, (bot.dodgeCooldown || 0) - dt);
  bot.staminaDelay = Math.max(0, (bot.staminaDelay || 0) - dt);
  bot.bandageCooldown = Math.max(0, (bot.bandageCooldown || 0) - dt);
  bot.distractionCooldown = Math.max(0, (bot.distractionCooldown || 0) - dt);
  bot.hitFlash = Math.max(0, (bot.hitFlash || 0) - dt);
  bot.evade = Math.max(0, (bot.evade || 0) - dt);
  bot.noise = Math.max(0, (bot.noise || 0) - dt * 0.9);
  bot.fatigue = clamp((bot.fatigue || 0) + dt * 0.11, 0, 100);
  if (bot.dodge) {
    const step = Math.min(dt, bot.dodge.remaining);
    bot.dodge.remaining = Math.max(0, bot.dodge.remaining - dt);
    const moved = moveHorizontal(exp, bot, clamp(bot.x + bot.dodge.direction * COMBAT_RULES.dodgeSpeed * step, WORLD_MIN, WORLD_MAX));
    bot.facing = bot.dodge.direction;
    if (!moved || bot.dodge.remaining <= 0) { bot.dodge = null; bot.evade = 0; }
  } else {
    followRoute(exp, bot, dt, bot.sneaking ? 85 : 158);
  }
  if (!bot.dodge && !bot.climb && !bot.attackCooldown && !bot.staminaDelay) {
    bot.stamina = Math.min(100, (bot.stamina ?? 100) + COMBAT_RULES.staminaRecovery * dt);
  }
  if (bot.moving) bot.hidden = false;
  if (bot.health <= 0) {
    bot.health = 0;
    bot.dead = true;
    bot.route = [];
    bot.target = null;
    bot.moving = false;
    bumpExpeditionRevision(exp, 'target_rev');
    say(exp, `동료 ${bot.name}가 쓰러졌습니다.`, true);
  }
}

export function getExpeditionRevision(exp) {
  const rev = exp?.revision || { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 };
  return {
    phase: exp?.done ? 'report' : 'expedition',
    slot_holder_rev: rev.slot_holder_rev || 1,
    owner_rev: rev.owner_rev || 1,
    plan_rev: rev.plan_rev || 1,
    target_rev: rev.target_rev || 1,
  };
}

export function bumpExpeditionRevision(exp, field = 'target_rev') {
  if (!exp) return getExpeditionRevision(exp);
  exp.revision ||= { slot_holder_rev: 1, owner_rev: 1, plan_rev: 1, target_rev: 1 };
  if (Object.hasOwn(exp.revision, field)) exp.revision[field] += 1;
  else exp.revision.target_rev += 1;
  return getExpeditionRevision(exp);
}

export function moveCompanionTo(exp, x, floor = exp?.companion?.floor ?? 0, options = {}) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done || bot.dodge || !Number.isFinite(x) || !Number.isInteger(floor) || floor < 0 || floor >= exp.floors.length) return null;
  const target = { x: clamp(x, WORLD_MIN, WORLD_MAX), floor };
  bot.hidden = false;
  bot.sneaking = options.sneak !== undefined ? Boolean(options.sneak) : Boolean(bot.sneaking);
  bot.target = target;
  bot.blockedDoorId = null;
  const fromFloor = bot.climb ? bot.climb.to : bot.floor;
  const fromX = bot.climb ? bot.climb.x : bot.x;
  bot.route = routeBetween(exp, fromX, fromFloor, target.x, target.floor);
  return target;
}

export function stopCompanion(exp) {
  const bot = exp?.companion;
  if (!bot) return { ok: false, reason: 'no_companion' };
  const hadDodge = Boolean(bot.dodge);
  const hadClimb = Boolean(bot.climb);
  bot.route = [];
  bot.target = null;
  bot.moving = false;
  if (hadDodge || hadClimb) return { ok: true, status: 'non_interruptible_pending_stop', committed_effects: [] };
  return { ok: true, status: 'cancelled_cleanly', committed_effects: [] };
}

export function companionDodge(exp, direction = null) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done) return fail('활동 가능한 동료가 없습니다.');
  if (bot.dodge || bot.climb) return fail('이동 동작이 끝난 뒤 회피할 수 있습니다.');
  if ((bot.dodgeCooldown || 0) > 0) return fail('회피 재사용 대기 중입니다.');
  if ((bot.stamina ?? 100) < COMBAT_RULES.dodgeStamina) return fail('스태미나가 부족합니다.');
  const dir = direction === -1 || direction === 1 ? direction : (bot.facing || -1);
  bot.hidden = false;
  bot.route = [];
  bot.target = null;
  bot.stamina = Math.max(0, (bot.stamina ?? 100) - COMBAT_RULES.dodgeStamina);
  bot.staminaDelay = COMBAT_RULES.staminaDelay;
  bot.dodgeCooldown = COMBAT_RULES.dodgeCooldown;
  bot.evade = COMBAT_RULES.evadeDuration;
  bot.dodge = { direction: dir, remaining: COMBAT_RULES.dodgeDuration, total: COMBAT_RULES.dodgeDuration };
  return { ok: true, direction: dir };
}

export function companionHide(exp, hideId = null) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done) return fail('활동 가능한 동료가 없습니다.');
  const spot = hideId
    ? exp.hides.find(h => h.id === hideId)
    : exp.hides.filter(h => h.floor === bot.floor).sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
  if (!spot) return fail('은신할 곳이 없습니다.');
  if (spot.floor !== bot.floor || Math.abs(spot.x - bot.x) > REACH) {
    moveCompanionTo(exp, spot.x, spot.floor, { sneak: true });
    return { ok: true, status: 'moving_to_hide', spotId: spot.id };
  }
  bot.route = [];
  bot.target = null;
  bot.moving = false;
  bot.hidden = true;
  return { ok: true, status: 'hidden', spotId: spot.id };
}

export function companionOpenDoor(exp, doorId) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done) return fail('활동 가능한 동료가 없습니다.');
  const door = (exp.doors || []).find(d => d.id === doorId);
  if (!door) return fail('문을 찾을 수 없습니다.');
  if (door.open) return { ok: true, alreadyOpen: true };
  if (door.floor !== bot.floor || Math.abs(door.x - bot.x) > REACH) return fail('문에서 너무 멉니다.');
  if (door.locked) {
    if (!exp.bag.crowbar) return { ok: false, reason: '잠긴 문을 열 쇠지레가 없습니다.', reason_code: 'door_locked_no_crowbar' };
    door.locked = false;
  }
  door.open = true;
  bot.blockedDoorId = null;
  persistDoor(exp, door);
  bumpExpeditionRevision(exp, 'target_rev');
  say(exp, `${bot.name}가 ${door.label}을 열었습니다.`);
  return { ok: true, doorId: door.id };
}

export function companionBandageAlly(exp) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done) return fail('활동 가능한 동료가 없습니다.');
  if ((bot.bandageCooldown || 0) > 0) return fail('응급처치 재사용 대기 중입니다.');
  if (!(exp.bag.bandage > 0)) return fail('가방에 붕대가 없습니다.');
  if (exp.player.health >= 100) return fail('동료의 체력이 이미 가득합니다.');
  if (bot.floor !== exp.player.floor || Math.abs(bot.x - exp.player.x) > REACH * 1.4) {
    return fail('동료와 가까워야 붕대를 감아줄 수 있습니다.');
  }
  exp.bag.bandage -= 1;
  if (!exp.bag.bandage) delete exp.bag.bandage;
  const amount = bot.id === 'mira' ? 38 : 26;
  const before = exp.player.health;
  exp.player.health = clamp(exp.player.health + amount, 0, 100);
  bot.bandageCooldown = BANDAGE_COOLDOWN;
  exp.stats.bandagesUsed = (exp.stats.bandagesUsed || 0) + 1;
  exp.stats.healed = (exp.stats.healed || 0) + (exp.player.health - before);
  bumpExpeditionRevision(exp, 'target_rev');
  say(exp, `${bot.name}가 응급처치를 도왔습니다. (체력 +${Math.round(exp.player.health - before)})`, true);
  return { ok: true, healed: exp.player.health - before };
}

export function companionThrowDistraction(exp, targetX, floor = exp?.companion?.floor ?? 0) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done) return fail('활동 가능한 동료가 없습니다.');
  if ((bot.distractionCooldown || 0) > 0 || (exp.distractionCooldown || 0) > 0) return fail('소음 유인 재사용 대기 중입니다.');
  if (!(exp.bag.parts > 0)) return fail('소음 유인에 쓸 부품이 없습니다.');
  const tx = clamp(finite(targetX, bot.x + bot.facing * 140), WORLD_MIN, WORLD_MAX);
  exp.bag.parts -= 1;
  if (!exp.bag.parts) delete exp.bag.parts;
  bot.distractionCooldown = DISTRACTION_RULES.cooldown;
  exp.distractionCooldown = DISTRACTION_RULES.cooldown;
  exp.distraction = { x: tx, floor, remaining: DISTRACTION_RULES.lifetime, total: DISTRACTION_RULES.lifetime };
  exp.noises.push({ id: exp.nextNoiseId++, x: tx, floor, strength: 0.95, remaining: DISTRACTION_RULES.lifetime, kind: 'distraction', aggressive: false });
  exp.stats.distractions = (exp.stats.distractions || 0) + 1;
  bumpExpeditionRevision(exp, 'target_rev');
  say(exp, `${bot.name}가 부품을 던져 주의를 끌었습니다.`, true);
  return { ok: true, x: tx, floor };
}

export function companionAttack(exp, npcId = null) {
  const bot = exp?.companion;
  if (!bot || bot.dead || exp.done) return fail('활동 가능한 동료가 없습니다.');
  if ((bot.attackCooldown || 0) > 0) return fail('공격 재사용 대기 중입니다.');
  if ((bot.stamina ?? 100) < COMBAT_RULES.attackStamina) return fail('스태미나가 부족합니다.');
  const target = (npcId ? exp.npcs.filter(n => n.id === npcId) : exp.npcs)
    .filter(n => n.health > 0 && n.state !== 'gone' && n.floor === bot.floor && Math.abs(n.x - bot.x) <= ATTACK_REACH && !closedDoorBetween(exp, bot.floor, bot.x, n.x))
    .sort((a, b) => Math.abs(a.x - bot.x) - Math.abs(b.x - bot.x))[0];
  if (!target) return fail('공격 사거리 안에 대상이 없습니다.');
  const damage = exp.bag.knife ? 24 : exp.bag.crowbar ? 18 : 11;
  bot.stamina = Math.max(0, (bot.stamina ?? 100) - COMBAT_RULES.attackStamina);
  bot.staminaDelay = COMBAT_RULES.staminaDelay;
  bot.attackCooldown = 1.05;
  target.health = Math.max(0, target.health - damage);
  target.hitFlash = 0.25;
  target.aggression = 1;
  exp.stats.attacks = (exp.stats.attacks || 0) + 1;
  if (target.health <= 0) {
    target.state = 'gone';
    exp.stats.killed = (exp.stats.killed || 0) + 1;
    persistNpc(exp, target, true);
  }
  bumpExpeditionRevision(exp, 'target_rev');
  return { ok: true, targetId: target.id, damage, killed: target.health <= 0 };
}

function resultData(exp, flags = {}) {
  const dead = !!flags.dead || exp.player.health <= 0;
  const bag = dead ? {} : counts(exp.bag);
  const lootTaken = {};
  for (const [key, quantity] of Object.entries(bag)) {
    const gained = quantity - (exp.loadout[key] || 0);
    if (gained > 0) lootTaken[key] = gained;
  }
  return {
    bag, health: dead ? 0 : exp.player.health,
    injury: Math.max(0, exp.initialHealth - exp.player.health),
    fatigue: exp.player.fatigue, moraleDelta: exp.stats.moraleDelta,
    dead, late: !!flags.late, events: [...exp.events], locationId: exp.locationId,
    lootTaken, killed: exp.stats.killed, theft: exp.stats.theft, helped: exp.stats.helped || 0, distractions: exp.stats.distractions || 0,
    escaped: !dead && !!flags.finished, locationState: copy(exp.locationState),
    ...(exp.companion ? { companion: { id: exp.companion.id, health: exp.companion.health, fatigue: exp.companion.fatigue, dead: !!exp.companion.dead || exp.companion.health <= 0 } } : {})
  };
}

function complete(exp, flags = {}) {
  if (exp.done) return exp.result;
  ensureCurrent(exp);
  if (flags.dead) {
    const lost = counts(exp.bag);
    if (Object.keys(lost).length) {
      const cache = droppedCache(exp, '남겨진 가방');
      for (const [key, amount] of Object.entries(lost)) cache.items[key] = (cache.items[key] || 0) + amount;
      persistLoot(exp, cache);
    }
    exp.bag = {};
    exp.player.health = 0;
    say(exp, '수색자가 돌아오지 못했습니다. 남겨진 가방은 이 장소에 남습니다.', true);
  }
  exp.progress = null;
  exp.activeLootId = null;
  exp.player.route = [];
  exp.player.target = null;
  exp.player.moving = false;
  exp.player.dodge = null;
  exp.player.evade = 0;
  exp.done = true;
  for (const loot of exp.loot) persistLoot(exp, loot);
  for (const npc of exp.npcs) { npc.windup = 0; persistNpc(exp, npc); }
  for (const door of exp.doors) persistDoor(exp, door);
  updateExploration(exp);
  exp.result = resultData(exp, { ...flags, finished: true });
  return exp.result;
}

export function returnHome(exp, force = false) {
  if (exp.done) return { ...fail('수색이 이미 끝났습니다.'), result: exp.result };
  if (exp.player.health <= 0) return { ok: true, result: complete(exp, { dead: true }) };
  if (!force && !getNearby(exp).exit) {
    say(exp, '왼쪽 아래 출입구까지 이동해야 귀환할 수 있습니다.');
    return fail('출입구로 이동하세요.');
  }
  if (force) {
    const injury = 5 + Math.floor(random(exp) * 6);
    exp.player.health = Math.max(1, exp.player.health - injury);
    exp.player.fatigue = clamp(exp.player.fatigue + 12, 0, 100);
    say(exp, '시간을 넘겨 먼 길로 돌아왔습니다. 약간 다치고 더 지쳤지만 가방은 지켰습니다.', true);
  } else say(exp, '가방을 챙겨 은신처로 돌아왔습니다.', true);
  return { ok: true, result: complete(exp, { late: !!force }) };
}

export function expeditionResult(exp) {
  return exp.done && exp.result ? copy(exp.result) : resultData(exp);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function bounded(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}
function whole(value, min = 0, max = 100000) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function validCounts(value) {
  return record(value) && Object.entries(value).every(([key, quantity]) => Object.hasOwn(ITEMS, key) && whole(quantity));
}
function validPosition(entity) {
  return record(entity) && bounded(entity.x, 0, 1280) && whole(entity.floor, 0, 2);
}
function validIds(value) {
  return Array.isArray(value) && value.length <= 500 && value.every(id => typeof id === 'string' && id.length > 0 && id.length <= 120) && new Set(value).size === value.length;
}
function validExplored(value) {
  return Array.isArray(value) && value.length <= 500 && value.every(segment => record(segment) && whole(segment.floor, 0, 2) && bounded(segment.min, 0, 1280) && bounded(segment.max, segment.min, 1280));
}
function validClimb(climb) {
  return climb === null || (record(climb) && bounded(climb.x, 0, 1280) && whole(climb.from, 0, 2) && whole(climb.to, 0, 2)
    && Math.abs(climb.from - climb.to) === 1 && bounded(climb.duration, 0.1, 5) && bounded(climb.elapsed, 0, climb.duration));
}
function validMover(entity) {
  return validPosition(entity) && Array.isArray(entity.route) && entity.route.length <= 32 && entity.route.every(validPosition)
    && validClimb(entity.climb) && (entity.target === null || validPosition(entity.target)) && [-1, 1].includes(entity.facing)
    && (entity.blockedDoorId === undefined || entity.blockedDoorId === null || (typeof entity.blockedDoorId === 'string' && entity.blockedDoorId.length <= 120));
}
function validLocationState(location) {
  if (!record(location) || !record(location.remaining) || Object.keys(location.remaining).length > 500 || !Object.values(location.remaining).every(validCounts)) return false;
  for (const key of ['opened', 'searched']) if (!record(location[key]) || Object.values(location[key]).some(value => typeof value !== 'boolean')) return false;
  if (!record(location.npcState) || Object.values(location.npcState).some(npc => !record(npc) || !bounded(npc.health, 0, 100) || typeof npc.removed !== 'boolean')) return false;
  if (!Array.isArray(location.dropped) || location.dropped.length > 450 || !location.dropped.every(item => validPosition(item) && typeof item.id === 'string')) return false;
  if (location.doors !== undefined && (!record(location.doors) || Object.keys(location.doors).length > 100 || !Object.entries(location.doors).every(([id, door]) => id.length > 0 && id.length <= 120 && record(door) && typeof door.open === 'boolean' && typeof door.locked === 'boolean' && !(door.open && door.locked)))) return false;
  if (location.explored !== undefined && !validExplored(location.explored)) return false;
  for (const key of ['knownLootIds', 'knownDoorIds']) if (location[key] !== undefined && !validIds(location[key])) return false;
  if (location.encounters !== undefined && (!record(location.encounters) || Object.keys(location.encounters).length > ENCOUNTERS.length || !Object.entries(location.encounters).every(([id, entry]) => ENCOUNTERS.some(encounter => encounter.id === id) && record(entry) && typeof entry.requested === 'boolean' && typeof entry.resolved === 'boolean' && [null, 'help', 'trade'].includes(entry.choiceId) && entry.resolved === (entry.choiceId !== null) && (!entry.resolved || entry.requested)))) return false;
  if (location.permissions !== undefined && (!record(location.permissions) || Object.keys(location.permissions).length > ENCOUNTERS.length || !Object.entries(location.permissions).every(([id, entry]) => ENCOUNTERS.some(encounter => encounter.id === id) && record(entry) && typeof entry.area === 'boolean' && typeof entry.loot === 'boolean' && (!entry.loot || entry.area)))) return false;
  if (location.hostileNpcIds !== undefined && !validIds(location.hostileNpcIds)) return false;
  return whole(location.visits, 1, 10000) && whole(location.nextDropId);
}

/** Root validates imported or resumed expedition data before passing it to the simulation. */
export function isValidExpedition(exp) {
  try {
    if (!record(exp) || exp.version !== 1 || !LOCATIONS.some(entry => entry.id === exp.locationId) || exp.width !== 1280 || exp.height !== 720) return false;
    const player = exp.player;
    if (!validMover(player) || !bounded(player.health, 0, 100) || !bounded(player.fatigue, 0, 100) || !bounded(player.noise, 0, 1)) return false;
    if (typeof player.hidden !== 'boolean' || typeof player.sneaking !== 'boolean' || !bounded(player.attackCooldown, 0, 5) || !bounded(player.hitFlash, 0, 5)) return false;
    if (player.stamina !== undefined && !bounded(player.stamina, 0, 100)) return false;
    if (player.staminaDelay !== undefined && !bounded(player.staminaDelay, 0, COMBAT_RULES.staminaDelay)) return false;
    if (player.dodgeCooldown !== undefined && !bounded(player.dodgeCooldown, 0, COMBAT_RULES.dodgeCooldown)) return false;
    if (player.evade !== undefined && (!bounded(player.evade, 0, COMBAT_RULES.evadeDuration) || (player.evade > 0 && !player.dodge))) return false;
    if (player.dodge !== undefined && player.dodge !== null && (!record(player.dodge) || ![-1, 1].includes(player.dodge.direction) || player.dodge.total !== COMBAT_RULES.dodgeDuration || !bounded(player.dodge.remaining, 0, COMBAT_RULES.dodgeDuration) || player.climb || exp.progress || player.attackCooldown > 0)) return false;
    if (exp._dodgeHeld !== undefined && typeof exp._dodgeHeld !== 'boolean') return false;
    if (exp._distractionHeld !== undefined && typeof exp._distractionHeld !== 'boolean') return false;
    if (exp.distractionCooldown !== undefined && !bounded(exp.distractionCooldown, 0, DISTRACTION_RULES.cooldown)) return false;
    if (exp.distraction !== undefined && exp.distraction !== null && (!validPosition(exp.distraction) || !bounded(exp.distraction.x, WORLD_MIN, WORLD_MAX) || exp.distraction.total !== DISTRACTION_RULES.lifetime || !bounded(exp.distraction.remaining, Number.EPSILON, DISTRACTION_RULES.lifetime))) return false;
    if (exp.duration !== 100 || !bounded(exp.time, 0, exp.duration) || !bounded(exp.initialHealth, 0, 100) || !bounded(exp.initialFatigue, 0, 100)) return false;
    if (!whole(exp.capacity, 1, 100) || !validCounts(exp.bag) || !validCounts(exp.loadout) || usedSlots(exp.bag) > exp.capacity) return false;
    if (!Array.isArray(exp.floors) || exp.floors.length !== 3 || exp.floors.some((y, i) => y !== FLOORS[i])) return false;
    if (!Array.isArray(exp.stairs) || exp.stairs.length > 12 || !exp.stairs.every(stair => record(stair) && bounded(stair.x, 0, 1280) && whole(stair.from, 0, 2) && whole(stair.to, 0, 2) && Math.abs(stair.from - stair.to) === 1)) return false;
    if (!Array.isArray(exp.loot) || exp.loot.length > 500 || !exp.loot.every(loot => validPosition(loot) && typeof loot.id === 'string' && typeof loot.label === 'string' && validCounts(loot.items) && typeof loot.locked === 'boolean' && typeof loot.owned === 'boolean' && typeof loot.searched === 'boolean')) return false;
    if (exp.doors !== undefined) {
      const layouts = DOOR_LAYOUTS[exp.locationId];
      if (!Array.isArray(exp.doors) || exp.doors.length !== layouts.length || new Set(exp.doors.map(door => door?.id)).size !== layouts.length || !exp.doors.every(door => validPosition(door) && typeof door.label === 'string' && door.label.length <= 200 && typeof door.open === 'boolean' && typeof door.locked === 'boolean' && !(door.open && door.locked) && layouts.some(template => door.id === template.id && door.x === template.x && door.floor === template.floor))) return false;
    }
    if (exp.explored !== undefined && !validExplored(exp.explored)) return false;
    for (const key of ['knownLootIds', 'knownDoorIds']) if (exp[key] !== undefined && !validIds(exp[key])) return false;
    if (exp.bandageCooldown !== undefined && !bounded(exp.bandageCooldown, 0, BANDAGE_COOLDOWN)) return false;
    if (!Array.isArray(exp.npcs) || exp.npcs.length > 16 || !exp.npcs.every(npc => {
      if (!validMover(npc) || !bounded(npc.health, 0, 100) || !bounded(npc.maxHealth, 1, 100) || !NPC_STATES.includes(npc.state)) return false;
      if (!bounded(npc.visionRange, 1, 500) || !bounded(npc.hearingRange, 1, 500) || !bounded(npc.speed, 1, 300) || !bounded(npc.damage, 0, 100)) return false;
      if (!bounded(npc.patrolMin, 0, 1280) || !bounded(npc.patrolMax, npc.patrolMin, 1280) || !bounded(npc.originX, 0, 1280) || !whole(npc.originFloor, 0, 2)) return false;
      if (!bounded(npc.alert, 0, 1) || !bounded(npc.warnTime, 0, 1000) || !bounded(npc.memory, -1, 20) || !bounded(npc.cooldown, 0, 5) || !whole(npc.lastNoiseId)) return false;
      if (npc.doorWait !== undefined && !bounded(npc.doorWait, 0, 1)) return false;
      if (npc.windup !== undefined && !bounded(npc.windup, 0, COMBAT_RULES.windup)) return false;
      return !npc.lastKnown || validPosition(npc.lastKnown);
    })) return false;
    if (!Array.isArray(exp.hides) || !exp.hides.every(validPosition) || !Array.isArray(exp.events) || exp.events.length > 50 || !exp.events.every(event => typeof event === 'string' && event.length < 1000)) return false;
    if (!validLocationState(exp.locationState) || !record(exp.stats) || !bounded(exp.stats.moraleDelta, -100, 100)) return false;
    if (['searched', 'taken', 'theft', 'killed', 'scared', 'attacks', 'detected'].some(key => !whole(exp.stats[key]))) return false;
    if (exp.stats.bandagesUsed !== undefined && !whole(exp.stats.bandagesUsed)) return false;
    for (const key of ['dodges', 'helped']) if (exp.stats[key] !== undefined && !whole(exp.stats[key])) return false;
    if (exp.stats.distractions !== undefined && !whole(exp.stats.distractions, 0, 100)) return false;
    if (exp.stats.healed !== undefined && !bounded(exp.stats.healed, 0, 100000)) return false;
    if (!Array.isArray(exp.noises) || exp.noises.length > 12 || !exp.noises.every(noise => validPosition(noise) && whole(noise.id, 1) && bounded(noise.strength, 0, 1) && [undefined, 'distraction'].includes(noise.kind) && bounded(noise.remaining, 0, noise.kind === 'distraction' ? DISTRACTION_RULES.lifetime : 2) && (noise.kind !== 'distraction' || noise.aggressive === false))) return false;
    if (!whole(exp.rng, 1, 4294967295) || !whole(exp.nextNoiseId, 1) || typeof exp.done !== 'boolean' || !record(exp.theftContainers)) return false;
    if (typeof exp.notice !== 'string' || exp.notice.length > 1000 || !bounded(exp.noticeTime, 0, 10)) return false;
    if (exp.activeLootId !== null && !exp.loot.some(loot => loot.id === exp.activeLootId)) return false;
    if (exp.progress !== null) {
      const progress = exp.progress;
      if (!record(progress) || !bounded(progress.total, 0.1, 10) || !bounded(progress.remaining, 0, progress.total) || typeof progress.label !== 'string' || progress.label.length > 200) return false;
      if (progress.type === 'search') { if (!exp.loot.some(loot => loot.id === progress.lootId)) return false; }
      else if (progress.type === 'bandage') {
        if (progress.total !== BANDAGE_TIME || !validPosition(progress.origin) || !(exp.bag.bandage > 0) || exp.player.climb || exp.player.health <= 0 || (exp.bandageCooldown || 0) > 0) return false;
      } else return false;
    }
    if (exp.done && (!record(exp.result) || !validCounts(exp.result.bag) || !bounded(exp.result.health, 0, 100) || !validLocationState(exp.result.locationState))) return false;
    if (exp.done && exp.result.helped !== undefined && !whole(exp.result.helped)) return false;
    if (exp.done && exp.result.distractions !== undefined && !whole(exp.result.distractions, 0, 100)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Copy and migrate valid v1 JSON without changing the caller's saved object. */
export function restoreExpedition(data) {
  if (!isValidExpedition(data)) return null;
  const exp = copy(data);
  ensureExpeditionFeatures(exp);
  if (exp.done && exp.result) {
    for (const key of ['doors', 'explored', 'knownLootIds', 'knownDoorIds', 'encounters', 'permissions', 'hostileNpcIds']) {
      if (exp.result.locationState[key] === undefined) exp.result.locationState[key] = copy(exp.locationState[key]);
    }
    if (exp.result.helped === undefined) exp.result.helped = exp.stats.helped;
    if (exp.result.distractions === undefined) exp.result.distractions = exp.stats.distractions;
  }
  return isValidExpedition(exp) ? exp : null;
}
