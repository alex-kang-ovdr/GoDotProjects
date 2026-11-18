/**
 * Crownfall Arena — independent, original browser prototype.
 * Mechanics are informed by the accompanying Clash Royale design analysis;
 * versioned public patch fields can be applied by an explicit research profile.
 * Unpublished values and geometry remain prototype settings. No original code,
 * assets, networking or private game database is used.
 * Pure simulation module: no DOM, renderer, timers or opponent AI dependencies.
 */

import { getBalanceFieldsForCard, validateBalancePatch, resolveCardBalance, createDeveloperData, validateCheatPatch, validateDeveloperData, validateFrozenCard } from './balance.js';
import { DATA_PROFILES, DEFAULT_DATA_PROFILE, RECONSTRUCTED_OVERRIDES } from './reconstruction.js';

const W = 480, H = 640, RIVER_TOP = 300, RIVER_BOTTOM = 340;
const BRIDGES = [120, 360], BRIDGE_HALF = 27;
const REGULATION = 180, OVERTIME = 120;
const EPS = 1e-7;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const opposite = team => team === 'player' ? 'enemy' : 'player';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = entity => entity && entity.hp > 0 && !entity.destroyed;
// A squad's 50 px-wide rectangle needs the entire 54 px bridge. Individual
// walkers retain their historical corridor; the shared anchor first centers.
const bridgeInnerHalf = entity => entity.cardId === 'phalanx' && Array.isArray(entity.memberIds) ? 1 :
  Math.max(5, BRIDGE_HALF - entity.radius - 1);
const isTeam = team => team === 'player' || team === 'enemy';
const hasCard = id => typeof id === 'string' && Object.hasOwn(CARDS, id);
const clone = value => JSON.parse(JSON.stringify(value));
const statusFields = (rulesVersion = 4) => ({ stunRemaining: 0, frostRemaining: 0, slowRemaining: 0, slowFactor: 1,
  ...(rulesVersion >= 5 ? { groundedRemaining: 0 } : {}) });

const card = (id, name, enName, cost, type, role, description, stats = {}) => Object.freeze({
  id, name, enName, cost, type, role, description,
  hp: 0, damage: 0, attackInterval: 1, range: 0, speed: 0, count: 1,
  radius: 11, splashRadius: 0, flying: false, targets: 'ground',
  spellRadius: 0, duration: 0, projectileSpeed: 0, deployTime: 0.65,
  firstHitDelay: 0.22, stunDuration: 0, freezeDuration: 0, slowDuration: 0,
  slowFactor: 1, splashOrigin: 'target', suicide: false, ...stats
});

export const CARDS = Object.freeze({
  knight: card('knight', '기사', 'Knight', 3, 'troop', '근접 수비', '튼튼한 전열. 작은 적을 막고 살아남아 역공합니다.',
    { hp: 1000, damage: 145, attackInterval: 1.05, range: 17, speed: 39, radius: 14 }),
  archers: card('archers', '궁수', 'Archers', 3, 'troop', '원거리 · 대공', '두 명의 궁수가 지상과 공중을 함께 견제합니다.',
    { hp: 290, damage: 78, attackInterval: 1.05, range: 116, speed: 36, count: 2, radius: 9, targets: 'all', projectileSpeed: 285 }),
  giant: card('giant', '거인', 'Giant', 5, 'troop', '타워 공격 · 탱커', '병력을 무시하고 건물로 전진합니다. 지원 병력과 함께 보내세요.',
    { hp: 2450, damage: 205, attackInterval: 1.5, range: 20, speed: 25, radius: 19, targets: 'buildings', firstHitDelay: 0.35 }),
  goblins: card('goblins', '고블린', 'Goblins', 2, 'troop', '빠른 근접 · 순환', '빠른 세 명의 공격수. 광역 공격에는 주의하세요.',
    { hp: 175, damage: 67, attackInterval: 0.8, range: 12, speed: 60, count: 3, radius: 8 }),
  fireball: card('fireball', '화염구', 'Fireball', 4, 'spell', '광역 피해 · 밀치기', '짧은 예고 후 큰 폭발. 타워에는 감소된 피해를 줍니다.',
    { damage: 500, crownDamage: 160, spellRadius: 62, radius: 62, targets: 'all', castDelay: 0.48, duration: 0.65, knockback: 22 }),
  arrows: card('arrows', '화살비', 'Arrows', 3, 'spell', '넓은 범위 · 군집 정리', '넓은 지역의 작은 지상·공중 병력을 정리합니다.',
    { damage: 245, crownDamage: 60, spellRadius: 80, radius: 80, targets: 'all', castDelay: 0.32, duration: 0.55 }),
  musketeer: card('musketeer', '총사', 'Musketeer', 4, 'troop', '장거리 · 대공', '긴 사거리와 강한 단일 공격으로 큰 적을 저지합니다.',
    { hp: 570, damage: 155, attackInterval: 1.2, range: 135, speed: 34, radius: 12, targets: 'all', projectileSpeed: 350 }),
  bomber: card('bomber', '폭탄병', 'Bomber', 2, 'troop', '지상 광역', '폭탄으로 뭉친 지상 병력을 공격합니다. 공중을 공격하지 못합니다.',
    { hp: 330, damage: 165, attackInterval: 1.5, range: 104, speed: 34, radius: 11, splashRadius: 40, projectileSpeed: 220 }),
  minions: card('minions', '미니언', 'Minions', 3, 'troop', '비행 · 단일 화력', '세 명의 비행 병력. 강을 건너며 지상 전용 공격을 피합니다.',
    { hp: 200, damage: 72, attackInterval: 0.95, range: 18, speed: 49, count: 3, radius: 9, flying: true, targets: 'all' }),
  cannon: card('cannon', '대포', 'Cannon', 3, 'building', '방어 건물 · 유인', '적을 중앙으로 유인하는 지상 방어 건물. 시간이 지나면 무너집니다.',
    { hp: 1050, damage: 115, attackInterval: 0.95, range: 120, radius: 20, duration: 35, projectileSpeed: 320 }),
  valkyrie: card('valkyrie', '전투 여전사', 'Valkyrie', 4, 'troop', '근접 광역 · 수비', '도끼를 휘둘러 가까이 모인 지상 적들을 정리합니다.',
    { hp: 1290, damage: 175, attackInterval: 1.25, range: 23, speed: 36, radius: 15, splashRadius: 45, splashOrigin: 'self' }),
  skeletons: card('skeletons', '해골 병사', 'Skeletons', 1, 'troop', '유인 · 빠른 순환', '세 명의 작은 병력으로 시간을 벌고 손패를 순환합니다.',
    { hp: 80, damage: 48, attackInterval: 0.85, range: 10, speed: 46, count: 3, radius: 7 }),
  hog_rider: card('hog_rider', '돌격 기수', 'Raider', 4, 'troop', '빠른 타워 공격', '병력을 지나쳐 건물을 압박하는 빠른 공격수입니다.',
    { hp: 1400, damage: 180, attackInterval: 1.25, range: 19, speed: 62, radius: 14, targets: 'buildings', firstHitDelay: 0.3 }),
  spear_goblins: card('spear_goblins', '창 고블린', 'Spear Scouts', 2, 'troop', '원거리 · 대공 · 순환', '세 명의 창병이 지상과 공중을 저렴하게 견제합니다.',
    { hp: 120, damage: 42, attackInterval: 1.1, range: 110, speed: 46, count: 3, radius: 8, targets: 'all', projectileSpeed: 310 }),
  duelist: card('duelist', '강철 검사', 'Steel Duelist', 4, 'troop', '단일 화력 · 탱커 대응', '느리지만 강력한 일격으로 큰 지상 병력을 막습니다.',
    { hp: 1150, damage: 420, attackInterval: 1.65, range: 17, speed: 42, radius: 13, firstHitDelay: 0.4 }),
  zap: card('zap', '감전', 'Static Burst', 2, 'spell', '짧은 기절 · 순환', '작은 범위에 피해를 주고 공격과 이동을 잠시 멈춥니다.',
    { damage: 105, crownDamage: 32, spellRadius: 55, radius: 55, targets: 'all', castDelay: 0.12, duration: 0.38, stunDuration: 0.5 }),
  poison: card('poison', '독 안개', 'Venom Mist', 4, 'spell', '지속 피해 · 지역 통제', '8초 동안 매초 피해를 주며 안에 머문 병력의 이동 속도를 낮춥니다.',
    { damage: 45, crownDamage: 10, totalDamage: 360, totalCrownDamage: 80, spellRadius: 72, radius: 72,
      targets: 'all', castDelay: 0.25, duration: 8, tickInterval: 1, slowFactor: 0.8, slowDuration: 0.15, persistent: true }),
  ice_spirit: card('ice_spirit', '얼음 정령', 'Frost Wisp', 1, 'troop', '희생 · 광역 동결', '적에게 접근한 뒤 폭발해 주변 지상·공중 적을 잠시 얼립니다.',
    { hp: 170, damage: 85, attackInterval: 1, range: 20, speed: 56, radius: 9, splashRadius: 48,
      targets: 'all', stunDuration: 1.1, freezeDuration: 1.1, suicide: true, splashOrigin: 'self', firstHitDelay: 0.12 }),
  phalanx: card('phalanx', '밀집보병', 'Shield Phalanx', 5, 'troop', '방어 대형 · 분대 돌격', '여섯 창병이 공격을 멈춘 방패벽으로 피해를 70% 줄입니다. 방패 돌격 중에는 대형을 풀고 빠르게 이동하며 공격한 뒤 다시 모입니다.',
    { hp: 340, damage: 65, attackInterval: 1.15, range: 32, speed: 24, radius: 8, count: 6,
      formation: true, damageReduction: 0.70, chargeSpeed: 68,
      abilityId: 'shield_charge', abilityName: '방패 돌격', abilityCost: 1, abilityDuration: 5, abilityCooldown: 14 }),
  minion_giant: card('minion_giant', '미니언 거인', 'Minion Giant', 4, 'troop', '비행 · 원거리 건물 공격', '병력을 지나쳐 건물을 원거리에서 공격하는 비행 병력입니다. 넉백에 밀리지 않으며 다른 제어 효과는 적용됩니다.',
    { hp: 1250, damage: 135, attackInterval: 1.8, range: 118, speed: 30, radius: 17,
      count: 1, flying: true, targets: 'buildings', projectileSpeed: 240, firstHitDelay: .35, knockbackImmune: true }),
  vines: card('vines', '덩굴', 'Vines', 4, 'spell', '최고 체력 3대상 · 공중 접지', '범위 안에서 현재 체력이 높은 적 셋을 묶습니다. 동률이면 중심에 가까운 적을 선택하며 비행 병력도 잠시 지상 공격에 노출합니다.',
    { damage: 90, crownDamage: 30, spellRadius: 80, radius: 80, targets: 'all', castDelay: .35,
      duration: .65, stunDuration: 2, groundingDuration: 2, maxTargets: 3, targetSelection: 'highest-hp' })
});

const LEGACY_PHALANX = Object.freeze({ ...CARDS.phalanx, damageReduction: .35,
  description: '여섯 창병이 대형을 지켜 천천히 전진합니다. 방패 돌격을 쓰면 방어를 풀고 빠르게 돌진한 뒤 다시 모입니다.' });
const RESEARCH_CARD_IDS = new Set(['minion_giant', 'vines']);
const RECONSTRUCTED_CARDS = Object.freeze(Object.fromEntries(Object.entries(CARDS).map(([id, value]) =>
  [id, Object.freeze(resolveCardBalance(value, RECONSTRUCTED_OVERRIDES[id] || {}))])));
const baseCardForRules = (id, rulesVersion, dataProfile = 'prototype-v4') => {
  if (!hasCard(id) || (rulesVersion < 5 && RESEARCH_CARD_IDS.has(id))) return null;
  if (id === 'phalanx' && rulesVersion < 4) return LEGACY_PHALANX;
  return rulesVersion >= 5 && dataProfile === 'reconstructed-v4-lv11' ? RECONSTRUCTED_CARDS[id] : CARDS[id];
};
const FORMATION_BALANCE_KEYS = ['speed', 'range', 'damageReduction', 'chargeSpeed', 'abilityCost', 'abilityDuration', 'abilityCooldown'];
const formationBalance = c => Object.fromEntries(FORMATION_BALANCE_KEYS.map(key => [key, c[key]]));

export const DEFAULT_DECK = Object.freeze([
  'giant', 'knight', 'archers', 'goblins', 'fireball', 'arrows', 'minions', 'cannon'
]);

/** Pure impact selection shared by cast previews, actual resolution and AI.
 * HP means current remaining HP. Distance and stable ID are deterministic
 * tie-breakers; those local policies do not claim a private server algorithm.
 */
export function selectSpellTargets(entities, team, c, x, y, rulesVersion = 5) {
  const selected = entities.filter(target => alive(target) && target.team !== team &&
    (c.targets !== 'buildings' || target.isBuilding) &&
    (c.targets === 'all' || !target.flying || (rulesVersion >= 5 && target.groundedRemaining > EPS)) &&
    Math.hypot(target.x - x, target.y - y) <= c.spellRadius + target.radius * .65);
  if (rulesVersion >= 5 && c.targetSelection === 'highest-hp') {
    selected.sort((a, b) => b.hp - a.hp || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return selected.slice(0, c.maxTargets);
  }
  return selected;
}

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  let h = 2166136261;
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 8 || new Set(deck).size !== 8 || [...deck].some(id => !hasCard(id))) {
    throw new Error('덱에는 서로 다른 카드 8장이 필요합니다.');
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('전투 설정이 올바르지 않습니다.');
  validateDeck(config.deck);
  validateDeck(config.enemyDeck);
  if (config.rulesVersion !== undefined && ![2, 3, 4, 5].includes(config.rulesVersion)) throw new Error('지원하지 않는 전투 규칙입니다.');
  const rules = config.rulesVersion ?? 2;
  if (config.dataProfile !== undefined && (typeof config.dataProfile !== 'string' || !Object.hasOwn(DATA_PROFILES, config.dataProfile))) {
    throw new Error('지원하지 않는 데이터 프로필입니다.');
  }
  if (rules >= 5 && config.dataProfile === undefined) throw new Error('규칙 5 전투에는 데이터 프로필이 필요합니다.');
  if (rules < 5 && config.dataProfile !== undefined && config.dataProfile !== 'prototype-v4') throw new Error('이전 전투 규칙은 기존 수치를 유지합니다.');
  if (rules < 5 && [...config.deck, ...config.enemyDeck].some(id => RESEARCH_CARD_IDS.has(id))) throw new Error('복원 카드에는 규칙 5가 필요합니다.');
  if ((config.rulesVersion ?? 2) === 2 && [...config.deck, ...config.enemyDeck].includes('phalanx')) {
    throw new Error('밀집보병은 규칙 3의 전투에서 사용할 수 있습니다.');
  }
  if (config.abilityMode !== undefined && !['battle', 'practice', 'training'].includes(config.abilityMode)) {
    throw new Error('스킬 사용 모드가 올바르지 않습니다.');
  }
  if (config.developerMode !== undefined && typeof config.developerMode !== 'boolean') throw new Error('개발자 모드 설정이 올바르지 않습니다.');
  if (config.developerMode && (config.practice !== true || ![4, 5].includes(config.rulesVersion) || config.abilityMode === 'training')) {
    throw new Error('개발자 테스트는 규칙 4 이상 자유 연습에서만 사용할 수 있습니다.');
  }
  if (!['easy', 'normal', 'hard'].includes(config.difficulty) || typeof config.practice !== 'boolean' ||
    !((typeof config.seed === 'number' && Number.isFinite(config.seed) && Math.abs(config.seed) <= Number.MAX_SAFE_INTEGER) ||
      (typeof config.seed === 'string' && config.seed.length <= 128))) throw new Error('전투 설정이 올바르지 않습니다.');
}

/** Reject corrupt/unbounded imports before constructing a live simulation. */
function validateSnapshot(value) {
  const fail = path => { throw new Error(`저장된 전투 데이터가 올바르지 않습니다: ${path}`); };
  const need = (condition, path) => { if (!condition) fail(path); };
  let nodes = 0, textLength = 0;
  const ancestors = new Set();
  function safeJSON(v, depth = 0) {
    need(++nodes <= 100000 && depth <= 24, '크기');
    if (v === null || typeof v === 'boolean') return;
    if (typeof v === 'number') { need(Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER, '숫자'); return; }
    if (typeof v === 'string') { textLength += v.length; need(v.length <= 4096 && textLength <= 500000, '문자열'); return; }
    need(v && typeof v === 'object' && !ancestors.has(v), 'JSON');
    need(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null, '객체');
    ancestors.add(v);
    for (const key of Reflect.ownKeys(v)) {
      need(typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key), '키');
      if (Array.isArray(v) && key === 'length') { need(v.length <= 20000, '배열'); continue; }
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      need(descriptor && Object.hasOwn(descriptor, 'value'), '속성');
      safeJSON(descriptor.value, depth + 1);
    }
    ancestors.delete(v);
  }
  safeJSON(value);
  const number = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  const integer = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const textId = v => typeof v === 'string' && v.length > 0 && v.length <= 64;
  const nullableId = v => v === null || textId(v);
  const list = (v, max, path) => need(Array.isArray(v) && v.length <= max, path);
  need(value && value.version === 2, '버전');
  validateConfig(value.config);
  const developer = value.developer === undefined ? null : validateDeveloperData(value.developer, CARDS);
  need(Boolean(developer) === (value.config.developerMode === true), '개발자 모드 경계');
  const cardFor = (id, team) => {
    const base = baseCardForRules(id, value.config.rulesVersion ?? 2, value.config.dataProfile);
    return base && developer && isTeam(team) ? resolveCardBalance(base, developer.balance[team][id] || {}) : base;
  };
  if (developer) for (const team of ['player', 'enemy']) for (const id of Object.keys(developer.balance[team])) {
    need(baseCardForRules(id, value.config.rulesVersion ?? 2, value.config.dataProfile) !== null, '개발자 카드 버전');
  }
  const s = value.state;
  need(s && number(s.time, 0, 301) && integer(s.tick, 0, 10000000), '시간');
  need(['regulation', 'overtime', 'finished'].includes(s.phase) && typeof s.running === 'boolean', '진행');
  need([null, 'player', 'enemy', 'draw'].includes(s.winner) && typeof s.reason === 'string' && s.reason.length <= 80, '결과');
  need((s.phase === 'finished') === (s.winner !== null) && !(s.phase === 'finished' && s.running), '결과 상태');
  if (value.endAction !== undefined) {
    const action = value.endAction;
    need(action && action.type === 'concede' && isTeam(action.team) && action.tick === s.tick &&
      s.phase === 'finished' && s.reason === 'concede' && s.winner === opposite(action.team), '항복 기록');
  }
  need(s.reason !== 'concede' || value.endAction !== undefined, '항복 결과');
  need(s.phase !== 'overtime' || s.time + EPS >= REGULATION, '연장전');
  need(s.phase !== 'regulation' || s.time < REGULATION + EPS, '정규전');
  for (const team of ['player', 'enemy']) {
    need(number(s.elixir?.[team], 0, 10) && integer(s.crowns?.[team], 0, 3), '진영 자원');
    if (developer?.cheats.infiniteElixir[team]) need(s.elixir[team] === 10, '무한 엘릭서');
    const hand = s.hands?.[team], queue = s.queues?.[team];
    need(Array.isArray(hand) && hand.length === 4 && Array.isArray(queue) && queue.length === 4, '순환');
    const cycle = [...hand, ...queue];
    validateDeck(cycle);
    const deck = team === 'player' ? value.config.deck : value.config.enemyDeck;
    need(deck.every(id => cycle.includes(id)), '덱 구성');
    const stats = s.stats?.[team];
    need(stats && integer(stats.cardsPlayed, 0, 4096) && number(stats.elixirSpent, 0, 50000) &&
      number(stats.damageDealt, 0, 1e9) && integer(stats.towersDestroyed, 0, 3), '통계');
  }
  list(s.towers, 6, '타워'); need(s.towers.length === 6, '타워 수');
  list(s.units, 512, '병력'); list(s.projectiles, 2048, '투사체');
  list(s.effects, 180, '효과'); list(s.events, 30, '이벤트'); list(s.areas, 64, '지속 지역');
  const ids = new Set();
  function entity(e) {
    need(e && textId(e.id) && !ids.has(e.id) && isTeam(e.team), '개체'); ids.add(e.id);
    need(number(e.x, 0, W) && number(e.y, 0, H) && number(e.maxHp, 1, 100000) && number(e.hp, 0, e.maxHp) &&
      number(e.radius, 1, 100), '개체 좌표·체력');
    for (const key of ['active', 'destroyed', 'flying', 'isBuilding']) need(typeof e[key] === 'boolean', key);
    need(['ground', 'all', 'buildings'].includes(e.targets) && nullableId(e.targetId), '타깃');
    for (const key of ['stunRemaining', 'frostRemaining', 'slowRemaining']) need(number(e[key], 0, 60), key);
    if (value.config.rulesVersion >= 5) need(number(e.groundedRemaining, 0, 10) && (e.flying || e.groundedRemaining === 0), '접지 상태');
    else need(e.groundedRemaining === undefined, '이전 규칙 접지 경계');
    need(number(e.slowFactor, 0.05, 1) && number(e.attackCooldown, -1, 60) && number(e.damage, 0, 100000) &&
      number(e.range, 0, 1000) && number(e.attackInterval, 0.05, 60) && number(e.projectileSpeed, 0, 10000), '공격');
    need(number(e.hitFlash, 0, 1) && number(e.attackFlash, 0, 1), '반짝임');
  }
  for (const t of s.towers) {
    entity(t);
    need(['king', 'princess'].includes(t.type) && t.kind === 'tower' && t.isBuilding && !t.flying, '타워 종류');
    need(['left', 'right', 'king'].includes(t.lane) && t.id === `${t.team}-${t.lane}` &&
      (t.type === 'king') === (t.lane === 'king'), '타워 위치');
    need(t.x === (t.lane === 'king' ? 240 : t.lane === 'left' ? 120 : 360) &&
      t.y === (t.team === 'player' ? t.type === 'king' ? 575 : 490 : t.type === 'king' ? 65 : 150), '타워 좌표');
    need(!t.destroyed || (t.hp === 0 && !t.active), '파괴된 타워');
  }
  for (const u of s.units) {
    entity(u);
    const c = cardFor(u.cardId, u.team);
    need(c && c.type !== 'spell' && u.type === c.type && u.kind === u.type &&
      u.isBuilding === (u.type === 'building'), '병력 종류');
    if (value.config.rulesVersion >= 5) need(u.flying === c.flying && typeof u.knockbackImmune === 'boolean' && u.knockbackImmune === Boolean(c.knockbackImmune), '비행·넉백 면역 분류');
    else need(u.knockbackImmune === undefined, '이전 규칙 넉백 경계');
    need(number(u.speed, 0, 1000) && number(u.deployRemaining, 0, 10) &&
      (u.lifetime === null || number(u.lifetime, 0, 120)) && number(u.firstHitDelay, 0, 10) &&
      number(u.splashRadius, 0, 200) && number(u.facing, -Math.PI - EPS, Math.PI + EPS), '병력 행동');
    if (u.deployDuration !== undefined) need(number(u.deployDuration, developer ? 0 : 0.05, 10) && u.deployRemaining <= u.deployDuration + EPS, '배치 지연');
    if (developer) {
      need(integer(u.spawnIndex, 0, c.count - 1), '개발자 소환 순서');
      if (u.isBuilding) need(number(u.balanceDuration, .1, 60), '건물 조정 수명');
      else need(u.balanceDuration === undefined, '비건물 수명 조정');
    } else need(u.spawnIndex === undefined && u.balanceDuration === undefined, '개발자 병력 경계');
    need(nullableId(u.engagedTargetId) && (u.bridgeX === null || BRIDGES.includes(u.bridgeX)), '경로');
    need(['self', 'target'].includes(u.splashOrigin) && typeof u.suicide === 'boolean' &&
      number(u.stunDuration, 0, 60) && number(u.freezeDuration, 0, 60) &&
      number(u.slowDuration, 0, 60) && number(u.slowFactorOnHit, 0.05, 1), '병력 효과');
    if (u.cardId === 'phalanx') {
      need(value.config.rulesVersion >= 3 && textId(u.formationGroupId) && integer(u.formationSlot, 0, 5) &&
        ['forming', 'guard', 'charge', 'regroup'].includes(u.formationState) && typeof u.formationProtected === 'boolean' &&
        number(u.chargeRemaining, 0, developer ? 20 : c.abilityDuration), '밀집보병 상태');
    }
    if (u.avoidance != null) {
      const a = u.avoidance;
      need(textId(a.obstacleId) && textId(a.targetId), '우회 타깃');
      list(a.points, 2, '우회 경로');
      need(a.points.length > 0 && integer(a.stage, 0, a.points.length - 1) &&
        a.points.every(p => number(p.x, 0, W) && number(p.y, 0, H)), '우회 좌표');
    }
  }
  for (const p of s.projectiles) {
    need(textId(p.id) && isTeam(p.team) && textId(p.targetId) && textId(p.sourceId) &&
      (p.cardId === 'tower' || cardFor(p.cardId, p.team)) && number(p.x, 0, W) && number(p.y, 0, H) &&
      number(p.tx, 0, W) && number(p.ty, 0, H) && number(p.speed, developer ? 0 : 1, 10000) && p.speed > 0 &&
      number(p.damage, 0, 100000) && number(p.splashRadius, 0, 200) && number(p.life, 0, 10) &&
      ['all', 'ground', 'buildings'].includes(p.targets), '투사체');
  }
  for (const a of s.areas) {
    need(textId(a.id) && isTeam(a.team) && cardFor(a.cardId, a.team)?.persistent &&
      number(a.x, 0, W) && number(a.y, 0, H) && number(a.radius, 1, 200) && number(a.life, 0, 60) &&
      number(a.maxLife, 0.05, 60) && number(a.duration, 0.05, 60) && number(a.tickInterval, 0.05, 10) &&
      number(a.tickRemaining, -0.05, a.tickInterval) && integer(a.ticksRemaining, 0, 100) &&
      number(a.damage, 0, 100000) && number(a.crownDamage, 0, 100000) && number(a.slowFactor, 0.05, 1) &&
      number(a.slowDuration, 0, 60) && ['all', 'ground', 'buildings'].includes(a.targets), '지속 지역');
  }
  for (const e of s.effects) {
    need(e && textId(e.id) && typeof e.type === 'string' &&
      number(e.x, -200, W + 200) && number(e.y, -200, H + 200) && number(e.life, 0, 60) &&
      number(e.maxLife, 0, 60) && number(e.age, 0, 60) && (e.team === null || isTeam(e.team)), '시각 효과');
    if (e.selectedTargets !== undefined) {
      need(value.config.rulesVersion >= 5 && e.type === 'spell' && e.cardId === 'vines', '선택 주문 효과');
      list(e.selectedTargets, 8, '선택 주문 대상');
      need(new Set(e.selectedTargets.map(t => t?.id)).size === e.selectedTargets.length && e.selectedTargets.every(t =>
        t && textId(t.id) && number(t.x, 0, W) && number(t.y, 0, H) && number(t.radius, 1, 100) && typeof t.flying === 'boolean'), '선택 주문 좌표');
    }
  }
  for (const e of s.events) need(e && textId(e.id) && typeof e.type === 'string' &&
    typeof e.text === 'string' && number(e.time, 0, 301) && (e.team === null || isTeam(e.team)), '이벤트');
  need(integer(value._seed, 0, 4294967295) && integer(value._counter, 0, 100000000), '내부 순서');
  list(value.pendingSpells, 128, '대기 주문');
  for (const p of value.pendingSpells) {
    need(p && isTeam(p.team) && cardFor(p.cardId, p.team)?.type === 'spell' &&
      number(p.x, 0, W) && number(p.y, 0, H) && number(p.remaining, 0, 5), '대기 주문');
    if (developer) validateFrozenCard(baseCardForRules(p.cardId, value.config.rulesVersion, value.config.dataProfile), p.cardStats);
    else need(p.cardStats === undefined, '개발자 예약 주문 경계');
    if (p.commandIndex !== undefined) {
      need(integer(p.commandIndex, 0, (value.commands?.length || 0) - 1), '주문 입력 순서');
      const command = value.commands[p.commandIndex];
      need(command && command.team === p.team && command.cardId === p.cardId && command.x === p.x && command.y === p.y, '주문 입력');
    }
  }
  list(value.commands, 4096, '명령 기록');
  let previousTick = 0;
  const squadCasts = new Map();
  for (const c of value.commands) {
    need(c && integer(c.tick, previousTick, s.tick) && isTeam(c.team), '명령');
    need(developer ? number(c.cost, 0, 10) : c.cost === undefined, '개발자 비용 기록');
    if (c.type === 'ability') {
      need(value.config.rulesVersion >= 3 && c.cardId === 'phalanx' && c.abilityId === 'shield_charge' &&
        squadCasts.get(c.groupId)?.team === c.team, '스킬 명령');
    } else {
      need(((c.type === undefined && integer(c.handIndex, 0, 3)) ||
        (developer && c.type === 'developer-spawn' && c.handIndex === undefined)) &&
        cardFor(c.cardId, c.team) && number(c.x, 0, W) && number(c.y, 0, H), '카드 명령');
      if (c.cardId === 'phalanx') {
        need(value.config.rulesVersion >= 3 && typeof c.groupId === 'string' && /^g\d{1,9}$/.test(c.groupId) &&
          !squadCasts.has(c.groupId), '소환 분대 식별');
        squadCasts.set(c.groupId, c);
      }
    }
    previousTick = c.tick;
  }
  if (s.formations !== undefined) {
    need(value.config.rulesVersion >= 3, '대형 규칙'); list(s.formations, 512, '분대');
    const grouped = new Set();
    for (const g of s.formations) {
      need(g && textId(g.id) && !ids.has(g.id) && isTeam(g.team) && g.cardId === 'phalanx', '분대 식별'); ids.add(g.id);
      const c = cardFor(g.cardId, g.team);
      if (developer) {
        need(g.balanceStats && Object.keys(g.balanceStats).length === FORMATION_BALANCE_KEYS.length &&
          FORMATION_BALANCE_KEYS.every(key => Object.hasOwn(g.balanceStats, key)), '분대 조정 필드');
        validateBalancePatch(c, g.balanceStats);
      } else need(g.balanceStats === undefined, '개발자 분대 경계');
      const applied = g.balanceStats ? { ...c, ...g.balanceStats } : c;
      need(number(g.x, 0, W) && number(g.y, 0, H) && g.radius === 26 && g.targets === 'ground' && g.range === applied.range &&
        g.speed === applied.speed && number(g.facing, -Math.PI - EPS, Math.PI + EPS), '분대 위치');
      need(['forming', 'guard', 'charge', 'regroup'].includes(g.mode) &&
        number(g.chargeRemaining, 0, applied.abilityDuration + EPS) && number(g.cooldownRemaining, 0, applied.abilityCooldown + EPS) &&
        number(g.settleTime, 0, 1) && nullableId(g.targetId) && (g.bridgeX === null || BRIDGES.includes(g.bridgeX)), '분대 행동');
      need((g.mode === 'charge') === (g.chargeRemaining > EPS), '돌격 시간');
      need(integer(g.spawnCommandIndex, 0, value.commands.length - 1), '분대 소환');
      const cast = value.commands[g.spawnCommandIndex];
      need((cast.type === undefined || (developer && cast.type === 'developer-spawn')) &&
        cast.cardId === 'phalanx' && cast.team === g.team && cast.groupId === g.id, '분대 카드 바인딩');
      const deck = g.team === 'player' ? value.config.deck : value.config.enemyDeck;
      need(deck.includes('phalanx') || (developer && cast.type === 'developer-spawn'), '분대 덱');
      list(g.memberIds, 6, '분대원'); need(g.memberIds.length > 0, '살아 있는 분대원');
      g.memberIds.forEach((id, index) => {
        const u = s.units.find(v => v.id === id);
        need(textId(id) && !grouped.has(id) && u && u.cardId === 'phalanx' && u.team === g.team && u.hp > 0 &&
          u.formationGroupId === g.id && u.formationSlot === index && u.formationState === g.mode &&
          Math.abs(u.chargeRemaining - g.chargeRemaining) < EPS, '분대원 바인딩'); grouped.add(id);
      });
      if (g.avoidance != null) {
        need(textId(g.avoidance.obstacleId) && textId(g.avoidance.targetId), '분대 우회');
        list(g.avoidance.points, 2, '분대 우회 경로');
        need(g.avoidance.points.length > 0 && integer(g.avoidance.stage, 0, g.avoidance.points.length - 1) &&
          g.avoidance.points.every(p => number(p.x, 0, W) && number(p.y, 0, H)), '분대 우회 좌표');
      }
    }
    need(s.units.filter(u => u.cardId === 'phalanx').every(u => grouped.has(u.id)), '미소속 밀집보병');
  } else need(!s.units.some(u => u.cardId === 'phalanx'), '누락된 분대');
}

/** Coordinates and all velocities are world pixels and world pixels/second. */
export class Game {
  constructor({ deck = DEFAULT_DECK, enemyDeck = DEFAULT_DECK, difficulty = 'normal', seed = Date.now(), practice = false, rulesVersion = 5, dataProfile, abilityMode, developerMode = false } = {}) {
    const resolvedProfile = dataProfile ?? (rulesVersion >= 5 ? DEFAULT_DATA_PROFILE : 'prototype-v4');
    validateConfig({ deck, enemyDeck, difficulty, seed, practice: Boolean(practice), rulesVersion, dataProfile: resolvedProfile, abilityMode, developerMode });
    this.width = W;
    this.height = H;
    this.cards = CARDS;
    this.difficulty = difficulty;
    this.practice = Boolean(practice);
    this.deck = [...deck];
    this.enemyDeck = [...enemyDeck];
    this.seed = seed;
    this.rulesVersion = rulesVersion;
    this.dataProfile = resolvedProfile;
    this.abilityMode = abilityMode || (this.practice ? 'practice' : 'battle');
    this.developerMode = developerMode;
    this._developer = developerMode ? createDeveloperData() : null;
    this._resolvedCards = { player: new Map(), enemy: new Map() };
    this._replaying = false;
    this.initialConfig = { deck: [...deck], enemyDeck: [...enemyDeck], seed, difficulty, practice: this.practice, rulesVersion,
      ...(rulesVersion >= 5 ? { dataProfile: resolvedProfile } : {}),
      ...(abilityMode ? { abilityMode } : {}), ...(developerMode ? { developerMode: true } : {}) };
    this.commands = [];
    this.endAction = null;
    // Transient diagnostics for the most recent update. They are consumed by
    // training after update(), never fed back into the combat simulation.
    this._recentSpellResolutions = [];
    this._seed = hashSeed(seed);
    this._counter = 0;
    this._pendingSpells = [];
    const playerOrder = this._shuffle(this.deck);
    const enemyOrder = this._shuffle(this.enemyDeck);
    const stats = () => ({ cardsPlayed: 0, elixirSpent: 0, damageDealt: 0, towersDestroyed: 0 });
    this.state = {
      time: 0, tick: 0, phase: 'regulation', running: false, winner: null, reason: '',
      elixir: { player: 5, enemy: 5 },
      hands: { player: playerOrder.slice(0, 4), enemy: enemyOrder.slice(0, 4) },
      queues: { player: playerOrder.slice(4), enemy: enemyOrder.slice(4) },
      towers: [], units: [], projectiles: [], effects: [], areas: [],
      crowns: { player: 0, enemy: 0 },
      stats: { player: stats(), enemy: stats() }, events: []
    };
    // Old decks retain their original serialized shape.
    if ([...deck, ...enemyDeck].includes('phalanx')) this.state.formations = [];
    for (const team of ['enemy', 'player']) {
      const frontY = team === 'player' ? 490 : 150;
      const kingY = team === 'player' ? 575 : 65;
      this.state.towers.push(this._makeTower(team, 'princess', 120, frontY, 'left'));
      this.state.towers.push(this._makeTower(team, 'princess', 360, frontY, 'right'));
      this.state.towers.push(this._makeTower(team, 'king', 240, kingY, 'king'));
    }
  }

  random() {
    this._seed = (this._seed + 0x6D2B79F5) >>> 0;
    let t = this._seed;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  _shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  _makeTower(team, type, x, y, lane) {
    const king = type === 'king';
    const hp = king ? 3100 : 1850;
    return {
      id: `${team}-${lane}`, team, type, kind: 'tower', lane, x, y,
      hp, maxHp: hp, radius: king ? 29 : 25, active: !king, destroyed: false,
      damage: king ? 105 : 88, range: 140, attackInterval: king ? 1.05 : 0.95,
      attackCooldown: 0.25, projectileSpeed: 330, targets: 'all', flying: false,
      isBuilding: true, targetId: null, hitFlash: 0, attackFlash: 0, ...statusFields(this.rulesVersion)
    };
  }

  start() { if (this.state.phase !== 'finished') this.state.running = true; return this; }
  pause() { this.state.running = false; return this; }
  resume() { return this.start(); }
  concede(team) {
    if (!isTeam(team)) return { ok: false, reason: '올바르지 않은 진영입니다.' };
    if (this.state.phase === 'finished') return { ok: false, reason: '전투가 이미 끝났습니다.' };
    this.endAction = { type: 'concede', team, tick: this.state.tick };
    const winner = opposite(team);
    this._finish(winner, 'concede');
    return { ok: true, winner, reason: 'concede' };
  }
  getSpellResolutions() { return clone(this._recentSpellResolutions); }

  /** Synchronous sandbox hit; debug.js additionally excludes training/replays.
   * Reuse normal damage/death accounting without stepping clocks or resuming.
   */
  applyPracticeEffect(id, effect = {}) {
    if (this.practice !== true || this.state.phase === 'finished') return { ok: false, reason: '진행 중인 자유 연습에서만 사용할 수 있습니다.' };
    if (!effect || typeof effect !== 'object' || Array.isArray(effect) || typeof id !== 'string') {
      return { ok: false, reason: '연습 효과가 올바르지 않습니다.' };
    }
    const damage = effect.damage === undefined ? 0 : effect.damage;
    const stunDuration = effect.stunDuration === undefined ? 0 : effect.stunDuration;
    if (!Number.isFinite(damage) || damage < 0 || damage > 100000 || !Number.isFinite(stunDuration) ||
        stunDuration < 0 || stunDuration > 10 || (damage === 0 && stunDuration === 0)) {
      return { ok: false, reason: '피해와 기절 시간이 허용 범위를 벗어났습니다.' };
    }
    const target = this._entity(id);
    if (!alive(target)) return { ok: false, reason: '살아 있는 타워나 병력을 선택하세요.' };
    const actualDamage = Math.min(target.hp, damage);
    // Debug tools request an exact HP adjustment; normal combat protection is
    // still applied to troops, towers and spells through the ordinary path.
    if (damage > 0) this._damage(target, damage, opposite(target.team), true);
    if (alive(target) && stunDuration > 0) this._applyStatus(target, { stunDuration });
    if (damage > 0) { this._resolveDeaths(); this._checkImmediateEnd(); }
    else if (target.formationGroupId) this._syncFormationFlags();
    return { ok: true, id, actualDamage };
  }

  getTimeRemaining() {
    if (this.state.phase === 'finished') return 0;
    return Math.max(0, (this.state.phase === 'overtime' ? REGULATION + OVERTIME : REGULATION) - this.state.time);
  }
  getElixirMultiplier() { return this.state.time < 120 ? 1 : this.state.time < 240 ? 2 : 3; }
  getTowerScore(team) { return this.state.crowns[team] ?? 0; }

  /** Current per-team card data. Returned cards are immutable; CARDS never changes. */
  getCard(cardId, team = 'player') {
    if (!isTeam(team)) return null;
    const base = baseCardForRules(cardId, this.rulesVersion, this.dataProfile);
    if (!base || !this._developer) return base;
    if (!this._resolvedCards[team].has(cardId)) {
      this._resolvedCards[team].set(cardId, resolveCardBalance(base, this._developer.balance[team][cardId] || {}));
    }
    return this._resolvedCards[team].get(cardId);
  }

  getBalanceFields(cardId) { return getBalanceFieldsForCard(baseCardForRules(cardId, this.rulesVersion, this.dataProfile)); }

  getDeveloperState() {
    const data = this._developer || createDeveloperData();
    return clone({ enabled: Boolean(this._developer), balance: data.balance, cheats: data.cheats });
  }

  _developerCheck() {
    if (!this._developer || !this.developerMode || !this.practice || ![4, 5].includes(this.rulesVersion) ||
        this.abilityMode === 'training' || this._replaying) return { ok: false, reason: '개발자 자유 테스트에서만 사용할 수 있습니다.' };
    if (this.state.phase === 'finished') return { ok: false, reason: '종료된 전투의 테스트 설정은 변경할 수 없습니다.' };
    return { ok: true };
  }

  _balanceOptions(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
        Reflect.ownKeys(options).some(key => !['team', 'applyExisting'].includes(key) ||
          !Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value'))) throw new Error('밸런스 적용 옵션이 올바르지 않습니다.');
    const team = options.team ?? 'both', applyExisting = options.applyExisting ?? true;
    if (!['both', 'player', 'enemy'].includes(team) || typeof applyExisting !== 'boolean') throw new Error('밸런스 적용 옵션이 올바르지 않습니다.');
    return { teams: team === 'both' ? ['player', 'enemy'] : [team], applyExisting };
  }

  setCardBalance(cardId, patch, options = {}) {
    const check = this._developerCheck(); if (!check.ok) return check;
    try {
      const clean = validateBalancePatch(baseCardForRules(cardId, this.rulesVersion, this.dataProfile), patch);
      const { teams, applyExisting } = this._balanceOptions(options);
      for (const team of teams) {
        const before = this.getCard(cardId, team);
        this._developer.balance[team][cardId] = { ...(this._developer.balance[team][cardId] || {}), ...clean };
        this._resolvedCards[team].delete(cardId);
        if (applyExisting) this._applyExistingBalance(cardId, team, before, this.getCard(cardId, team));
      }
      return { ok: true };
    } catch (error) { return { ok: false, reason: error.message }; }
  }

  resetCardBalance(cardId, team = 'both') {
    const check = this._developerCheck(); if (!check.ok) return check;
    if (!baseCardForRules(cardId, this.rulesVersion, this.dataProfile) || !['both', 'player', 'enemy'].includes(team)) return { ok: false, reason: '초기화할 카드와 진영을 확인하세요.' };
    for (const side of team === 'both' ? ['player', 'enemy'] : [team]) {
      const before = this.getCard(cardId, side);
      delete this._developer.balance[side][cardId]; this._resolvedCards[side].delete(cardId);
      this._applyExistingBalance(cardId, side, before, this.getCard(cardId, side));
    }
    return { ok: true };
  }

  _applyExistingBalance(cardId, team, before, after) {
    const groups = (this.state.formations || []).filter(group => group.team === team && group.cardId === cardId);
    for (const group of groups) {
      const old = this._formationCard(group);
      group.chargeRemaining *= after.abilityDuration / old.abilityDuration;
      group.cooldownRemaining = this._developer.cheats.noAbilityCooldown ? 0 : old.abilityCooldown > EPS ?
        group.cooldownRemaining * after.abilityCooldown / old.abilityCooldown : 0;
      group.balanceStats = formationBalance(after); group.speed = after.speed; group.range = after.range;
    }
    for (const unit of this.state.units) {
      if (!alive(unit) || unit.team !== team || unit.cardId !== cardId) continue;
      const hpRatio = unit.hp / unit.maxHp;
      const cooldownRatio = Math.max(0, unit.attackCooldown) / unit.attackInterval;
      unit.maxHp = after.hp; unit.hp = after.hp * hpRatio;
      unit.damage = after.damage; unit.attackInterval = after.attackInterval;
      unit.attackCooldown = cooldownRatio * after.attackInterval;
      unit.range = after.range; unit.speed = after.speed;
      unit.projectileSpeed = after.projectileSpeed; unit.splashRadius = after.splashRadius;
      if (unit.isBuilding) {
        const duration = unit.balanceDuration ?? before.duration;
        unit.lifetime *= after.duration / duration; unit.balanceDuration = after.duration;
      }
      const oldDuration = unit.deployDuration ?? before.deployTime;
      const group = groups.find(g => g.id === unit.formationGroupId);
      const index = unit.spawnIndex ?? 0;
      const duration = after.deployTime + Math.max(0, index) * .06;
      unit.deployRemaining = oldDuration > EPS ? unit.deployRemaining * duration / oldDuration : 0;
      unit.deployDuration = duration;
      if (group) {
        unit.chargeRemaining = group.chargeRemaining;
        unit.speed = group.mode === 'charge' ? after.chargeSpeed : group.mode === 'guard' ? after.speed : after.speed * 1.5;
      }
    }
    this._syncFormationFlags();
  }

  setDeveloperCheats(patch) {
    const check = this._developerCheck(); if (!check.ok) return check;
    let clean;
    try { clean = validateCheatPatch(patch); } catch (error) { return { ok: false, reason: error.message }; }
    const cheats = this._developer.cheats;
    if (clean.infiniteElixir) Object.assign(cheats.infiniteElixir, clean.infiniteElixir);
    for (const key of ['noAbilityCooldown', 'freePlacement']) if (Object.hasOwn(clean, key)) cheats[key] = clean[key];
    for (const team of ['player', 'enemy']) if (cheats.infiniteElixir[team]) this.state.elixir[team] = 10;
    if (cheats.noAbilityCooldown) for (const group of this.state.formations || []) group.cooldownRemaining = 0;
    return { ok: true };
  }

  _spendElixir(team, amount) {
    this.state.elixir[team] = this._developer?.cheats.infiniteElixir[team] ? 10 : Math.max(0, this.state.elixir[team] - amount);
    this.state.stats[team].elixirSpent += amount;
  }

  _formationCard(group) {
    const current = this.getCard(group.cardId, group.team);
    return group.balanceStats ? { ...current, ...group.balanceStats } : current;
  }

  _formationMembers(group) {
    return group.memberIds.map(id => this.state.units.find(u => u.id === id && u.formationGroupId === group.id)).filter(alive);
  }

  _formationSlots(group, members = this._formationMembers(group)) {
    const count = members.length, columns = count >= 5 ? 3 : count === 4 ? 2 : count;
    const rows = Math.ceil(count / Math.max(1, columns)), direction = group.team === 'player' ? -1 : 1;
    return members.map((u, index) => {
      const row = Math.floor(index / columns), inRow = Math.min(columns, count - row * columns);
      return { id: u.id, x: group.x + (index % columns - (inRow - 1) / 2) * 17,
        y: group.y + (row - (rows - 1) / 2) * 20 * -direction };
    });
  }

  _formationIsProtected(group, members = this._formationMembers(group)) {
    if (group.mode !== 'guard' || members.length < 3) return false;
    const slots = this._formationSlots(group, members);
    return members.every((u, i) => u.active && u.deployRemaining <= EPS && u.stunRemaining <= EPS && distance(u, slots[i]) <= 10);
  }

  _abilityCheck(team, groupId, recorded = false) {
    if (!isTeam(team)) return { ok: false, reason: '올바르지 않은 진영입니다.' };
    if (this.rulesVersion < 3 || this.abilityMode === 'training') return { ok: false, reason: '이 전투에서는 분대 스킬을 사용할 수 없습니다.' };
    if (this._replaying && !recorded) return { ok: false, reason: '리플레이에서는 스킬을 직접 사용할 수 없습니다.' };
    if (!this.state.running || this.state.phase === 'finished') return { ok: false, reason: '전투를 시작하거나 계속하세요.' };
    const group = (this.state.formations || []).find(g => g.id === groupId && g.team === team);
    const cast = group && this.commands[group.spawnCommandIndex];
    const deck = team === 'player' ? this.deck : this.enemyDeck;
    const developerSpawn = this._developer && cast?.type === 'developer-spawn';
    if (!group || (!deck.includes('phalanx') && !developerSpawn) || !cast ||
        (cast.type !== undefined && !developerSpawn) || cast.cardId !== 'phalanx' || cast.team !== team || cast.groupId !== group.id) {
      return { ok: false, reason: '이 진영에서 소환한 밀집보병 분대를 선택하세요.' };
    }
    const members = this._formationMembers(group);
    if (!members.length) return { ok: false, reason: '분대가 전멸했습니다.' };
    if (members.some(u => u.deployRemaining > EPS || !u.active)) return { ok: false, reason: '분대의 배치가 끝난 뒤 사용하세요.' };
    if (members.every(u => u.stunRemaining > EPS)) return { ok: false, reason: '기절한 분대는 돌격할 수 없습니다.' };
    if (group.chargeRemaining > EPS) return { ok: false, reason: '이미 돌격 중입니다.' };
    if (group.cooldownRemaining > EPS) return { ok: false, reason: '분대 스킬의 재사용 대기 중입니다.' };
    if (this.state.elixir[team] + EPS < this._formationCard(group).abilityCost) return { ok: false, reason: '돌격에 필요한 엘릭서가 부족합니다.' };
    return { ok: true, group, members };
  }

  /** Detached UI/AI view. Only living squads belonging to this team are exposed. */
  getAbilities(team) {
    if (!isTeam(team)) return [];
    return (this.state.formations || []).filter(g => g.team === team).flatMap(group => {
      const members = this._formationMembers(group);
      if (!members.length) return [];
      const check = this._abilityCheck(team, group.id);
      const c = this._formationCard(group);
      return [{ groupId: group.id, cardId: 'phalanx', abilityId: 'shield_charge', name: c.abilityName,
        cost: c.abilityCost, mode: group.mode, ready: check.ok, reason: check.ok ? '' : check.reason,
        cooldownRemaining: group.cooldownRemaining, chargeRemaining: group.chargeRemaining,
        duration: c.abilityDuration, cooldown: c.abilityCooldown,
        aliveCount: members.length, memberIds: members.map(u => u.id), x: group.x, y: group.y,
        protected: this._formationIsProtected(group, members) }];
    });
  }

  activateAbility(team, groupId) { return this._activateAbility(team, groupId, false); }

  // ReplayPlayer uses the same validation and transaction in recorded order.
  _activateAbility(team, groupId, recorded) {
    const check = this._abilityCheck(team, groupId, recorded);
    if (!check.ok) return check;
    const { group, members } = check, c = this._formationCard(group);
    this._spendElixir(team, c.abilityCost);
    this.commands.push({ type: 'ability', tick: this.state.tick, team, cardId: 'phalanx', abilityId: 'shield_charge', groupId,
      ...(this._developer ? { cost: c.abilityCost } : {}) });
    group.mode = 'charge'; group.chargeRemaining = c.abilityDuration;
    group.cooldownRemaining = this._developer?.cheats.noAbilityCooldown ? 0 : c.abilityCooldown; group.settleTime = 0;
    for (const u of members) {
      u.formationState = 'charge'; u.formationProtected = false; u.chargeRemaining = group.chargeRemaining;
      u.speed = c.chargeSpeed; u.targetId = null; u.engagedTargetId = null; u.avoidance = null;
    }
    this._event('ability', team, `${team === 'player' ? '아군' : '상대'} · 방패 돌격`, { cardId: 'phalanx', groupId });
    this._effect('charge', group.x, group.y, team, 32, 0.65, { cardId: 'phalanx', groupId });
    return { ok: true, groupId, cost: c.abilityCost };
  }

  /** Accepted commands are replayed BEFORE advancing the indicated fixed tick. */
  exportReplay() {
    if (this._developer) throw new Error('개발자 테스트는 일반 리플레이로 내보낼 수 없습니다.');
    return clone({ version: 2, step: 1 / 60, config: this.initialConfig,
      commands: this.commands, finalTick: this.state.tick, winner: this.state.winner,
      ...(this.endAction ? { endAction: this.endAction } : {}),
      result: { winner: this.state.winner, reason: this.state.reason, crowns: this.state.crowns,
        towerHp: this.state.towers.map(({ id, hp }) => ({ id, hp })),
        damageDealt: { player: this.state.stats.player.damageDealt, enemy: this.state.stats.enemy.damageDealt } } });
  }

  /** Every simulation-owned field is represented; wall-clock/UI/AI state is external. */
  exportSnapshot() {
    return clone({ version: 2, config: this.initialConfig, state: this.state,
      _seed: this._seed, _counter: this._counter, pendingSpells: this._pendingSpells,
      commands: this.commands, ...(this.endAction ? { endAction: this.endAction } : {}),
      ...(this._developer ? { developer: this._developer } : {}) });
  }

  static fromSnapshot(snapshot) {
    validateSnapshot(snapshot);
    const copy = clone(snapshot);
    // Missing rulesVersion identifies the original format-2 simulation. Preserve
    // its mechanics; migrating a save must not silently change its future.
    const game = new Game({ ...copy.config, rulesVersion: copy.config.rulesVersion ?? 2 });
    game.state = copy.state;
    game.state.running = false;
    game._seed = copy._seed;
    game._counter = copy._counter;
    game._pendingSpells = copy.pendingSpells;
    game.commands = copy.commands;
    game.endAction = copy.endAction || null;
    game._developer = copy.developer || null;
    return game;
  }

  canDeploy(team, cardId, x, y) {
    const result = this._canDeployCenter(team, cardId, x, y);
    if (!result.ok || this.rulesVersion === 2 || this.getCard(cardId, team).type === 'spell') return result;
    const positions = this._planDeployment(team, this.getCard(cardId, team), x, y);
    return positions ? { ok: true, positions } : { ok: false, reason: '병력이 모두 설 수 있는 빈 공간이 필요합니다.' };
  }

  _canDeployCenter(team, cardId, x, y) {
    const c = this.getCard(cardId, team);
    if (team !== 'player' && team !== 'enemy') return { ok: false, reason: '올바르지 않은 진영입니다.' };
    if (!c) return { ok: false, reason: '카드를 찾을 수 없습니다.' };
    if (c.formation && this.rulesVersion < 3) return { ok: false, reason: '이 전투 규칙은 밀집보병을 지원하지 않습니다.' };
    if ((c.formation || (this.rulesVersion >= 5 && c.type !== 'spell')) && this.state.units.length + c.count > 512) return { ok: false, reason: '전장의 병력이 너무 많습니다.' };
    if (this.state.phase === 'finished') return { ok: false, reason: '전투가 끝났습니다.' };
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > W || y < 0 || y > H) {
      return { ok: false, reason: '아레나 안에 배치하세요.' };
    }
    if (this.state.elixir[team] + EPS < c.cost) return { ok: false, reason: '엘릭서가 부족합니다.' };
    if (c.type === 'spell') return { ok: true };
    if (x < c.radius || x > W - c.radius || y < 18 || y > H - 18) {
      return { ok: false, reason: '가장자리에서 조금 떨어져 배치하세요.' };
    }
    const own = team === 'player' ? y >= RIVER_BOTTOM : y <= RIVER_TOP;
    const forward = this.state.towers.some(t => t.team !== team && t.type === 'princess' && t.destroyed &&
      Math.abs(x - t.x) <= 77 && (team === 'player' ? y >= 115 && y <= RIVER_TOP : y >= RIVER_BOTTOM && y <= 525));
    if (!this._developer?.cheats.freePlacement && !own && !forward) return { ok: false, reason: '아군 지역에 배치하세요. 주문은 어디든 사용할 수 있습니다.' };
    for (const tower of this.state.towers) {
      if (alive(tower) && Math.hypot(x - tower.x, y - tower.y) < tower.radius + c.radius + 3) {
        return { ok: false, reason: '타워와 겹치지 않게 배치하세요.' };
      }
    }
    if (c.type === 'building' && this.state.units.some(u => alive(u) && u.isBuilding &&
      Math.hypot(x - u.x, y - u.y) < c.radius + u.radius + 3)) {
      return { ok: false, reason: '다른 건물과 겹칠 수 없습니다.' };
    }
    return { ok: true };
  }

  /** Pure placement/impact preview; the play transaction consumes the same plan.
   * Spell damage is at the current position (one poison tick), never a prediction
   * that a moving target will remain in the area until cast/expiry.
   */
  previewDeployment(team, cardId, x, y) {
    const result = this.canDeploy(team, cardId, x, y);
    if (!result.ok) return { ...result, positions: [], affectedTargets: [] };
    const c = this.getCard(cardId, team);
    if (c.type !== 'spell') {
      return { ok: true, positions: (result.positions || this._legacyDeployment(team, c, x, y)).map(p => ({ ...p })), affectedTargets: [] };
    }
    const affectedTargets = selectSpellTargets([...this.state.units, ...this.state.towers], team, c, x, y, this.rulesVersion).map(target => ({
        id: target.id, x: target.x, y: target.y, radius: target.radius, kind: target.kind, type: target.type,
        team: target.team, hp: target.hp,
        damage: Math.min(target.hp, this._effectiveDamage(target, target.kind === 'tower' && c.crownDamage != null ? c.crownDamage : c.damage))
      }));
    return { ok: true, positions: [], affectedTargets };
  }

  _legacyDeployment(team, c, x, y) {
    const offsets = c.count === 3 ? [[-12, 6], [12, 6], [0, -10]] : c.count === 2 ? [[-12, 0], [12, 0]] : [[0, 0]];
    const sign = team === 'player' ? -1 : 1;
    return offsets.map(([ox, oy]) => {
      const point = { team, x: clamp(x + ox, c.radius, W - c.radius), y: clamp(y + oy * sign, 18, H - 18), radius: c.radius, flying: c.flying };
      this._constrainGround(point, x, y);
      return { x: point.x, y: point.y, radius: c.radius, flying: c.flying };
    });
  }

  _planDeployment(team, c, x, y) {
    const offsets = c.formation ? [[-17, 10], [0, 10], [17, 10], [-17, -10], [0, -10], [17, -10]] :
      c.count === 3 ? [[-12, 6], [12, 6], [0, -10]] : c.count === 2 ? [[-12, 0], [12, 0]] : [[0, 0]];
    const sign = team === 'player' ? -1 : 1;
    const positions = [];
    const ownPlacement = team === 'player' ? y >= RIVER_BOTTOM : y <= RIVER_TOP;
    const obstacles = [...this.state.towers, ...this.state.units].filter(alive);
    const valid = point => {
      const r = c.radius;
      if (point.x < r || point.x > W - r || point.y < Math.max(18, r) || point.y > H - Math.max(18, r)) return false;
      const own = team === 'player' ? point.y - r >= RIVER_BOTTOM - EPS : point.y + r <= RIVER_TOP + EPS;
      const forward = this.state.towers.some(t => t.team !== team && t.type === 'princess' && t.destroyed &&
        Math.abs(point.x - t.x) + r <= 77 + EPS && (team === 'player' ?
          point.y - r >= 115 - EPS && point.y + r <= RIVER_TOP + EPS :
          point.y - r >= RIVER_BOTTOM - EPS && point.y + r <= 525 + EPS));
      // A formation stays in the territory the player selected; searching for
      // space must never split one cast across opposite river banks.
      if (this._developer?.cheats.freePlacement) {
        if (!c.flying && point.y > RIVER_TOP - r + EPS && point.y < RIVER_BOTTOM + r - EPS &&
            !BRIDGES.some(bridge => Math.abs(point.x - bridge) + r <= BRIDGE_HALF - 1 + EPS)) return false;
      } else if (ownPlacement ? !own : !forward) return false;
      for (const obstacle of obstacles) {
        if (!obstacle.isBuilding && c.type !== 'building' && obstacle.flying !== c.flying) continue;
        if (distance(point, obstacle) < r + obstacle.radius + 1 - EPS) return false;
      }
      return positions.every(other => distance(point, other) >= 2 * r + 1 - EPS);
    };
    if (c.formation) {
      // Shift the whole six-person rectangle, never scatter individual spawn
      // points. The exact plan is shared by the preview and paid transaction.
      const centers = [{ x, y }];
      for (let ring = 4; ring <= 48; ring += 4) for (let step = 0; step < 16; step++) {
        const angle = -sign * (Math.PI / 2 + step * Math.PI / 8);
        centers.push({ x: x + Math.cos(angle) * ring, y: y + Math.sin(angle) * ring });
      }
      for (const center of centers) {
        positions.length = 0;
        for (const [ox, oy] of offsets) {
          const point = { x: center.x + ox, y: center.y + oy * sign, radius: c.radius, flying: false };
          if (!valid(point)) break;
          positions.push(point);
        }
        if (positions.length === c.count) return positions;
      }
      return null;
    }
    for (const [ox, oy] of offsets) {
      const intended = { x: clamp(x + ox, c.radius, W - c.radius), y: clamp(y + oy * sign, Math.max(18, c.radius), H - Math.max(18, c.radius)) };
      let chosen = valid(intended) ? intended : null;
      // Small bounded nearest-space search: deterministic, no random draw, no
      // mutation. A completely crowded placement is rejected atomically.
      for (let ring = 4; ring <= 48 && !chosen; ring += 4) {
        for (let step = 0; step < 16; step++) {
          const angle = -sign * (Math.PI / 2 + step * Math.PI / 8);
          const candidate = { x: intended.x + Math.cos(angle) * ring, y: intended.y + Math.sin(angle) * ring };
          if (valid(candidate)) { chosen = candidate; break; }
        }
      }
      if (!chosen) return null;
      positions.push({ x: chosen.x, y: chosen.y, radius: c.radius, flying: c.flying });
    }
    return positions;
  }

  playCard(team, handIndex, x, y) {
    if (!this.state.running || this.state.phase === 'finished') return { ok: false, reason: '전투를 시작하거나 계속하세요.' };
    if ((team !== 'player' && team !== 'enemy') || !Number.isInteger(handIndex) || handIndex < 0 || handIndex > 3) {
      return { ok: false, reason: '선택한 카드가 올바르지 않습니다.' };
    }
    const cardId = this.state.hands[team][handIndex];
    return this._deployCard(team, cardId, x, y, handIndex, false);
  }

  spawnDeveloperCard(team, cardId, x, y) {
    const check = this._developerCheck(); if (!check.ok) return check;
    if (!isTeam(team) || !hasCard(cardId)) return { ok: false, reason: '소환할 진영과 카드를 확인하세요.' };
    return this._deployCard(team, cardId, x, y, null, true);
  }

  _deployCard(team, cardId, x, y, handIndex, developerSpawn) {
    if (!this.state.running || this.state.phase === 'finished') return { ok: false, reason: '전투를 시작하거나 계속하세요.' };
    const check = this.canDeploy(team, cardId, x, y);
    if (!check.ok) return check;
    const c = this.getCard(cardId, team);
    const commandIndex = this.commands.length;
    const command = developerSpawn ? { type: 'developer-spawn', tick: this.state.tick, team, cardId, x, y } :
      { tick: this.state.tick, team, handIndex, cardId, x, y };
    if (this._developer) command.cost = c.cost;
    this.commands.push(command);
    // Cost, rotation and action are one synchronous transaction.
    this._spendElixir(team, c.cost);
    if (!developerSpawn) {
      this.state.hands[team][handIndex] = this.state.queues[team].shift();
      this.state.queues[team].push(cardId);
    }
    this.state.stats[team].cardsPlayed++;
    let formation = null;
    if (c.type === 'spell') {
      this._pendingSpells.push({ team, cardId, x, y, remaining: c.castDelay,
        ...(this.rulesVersion >= 3 ? { commandIndex } : {}), ...(this._developer ? { cardStats: c } : {}) });
      this._effect('cast', x, y, team, c.spellRadius, c.castDelay, { cardId });
    } else {
      const positions = check.positions || this._legacyDeployment(team, c, x, y);
      if (c.formation) {
        formation = { id: `g${++this._counter}`, team, cardId, memberIds: [], spawnCommandIndex: commandIndex,
          x: positions.reduce((n, p) => n + p.x, 0) / positions.length,
          y: positions.reduce((n, p) => n + p.y, 0) / positions.length,
          radius: 26, speed: c.speed, range: c.range, targets: 'ground',
          targetId: null, bridgeX: null, avoidance: null, mode: 'forming',
          chargeRemaining: 0, cooldownRemaining: 0, settleTime: 0,
          facing: team === 'player' ? -Math.PI / 2 : Math.PI / 2,
          ...(this._developer ? { balanceStats: formationBalance(c) } : {}) };
        (this.state.formations ||= []).push(formation);
        this.commands[commandIndex].groupId = formation.id;
      }
      positions.forEach((position, index) => {
        const unit = {
          id: `u${++this._counter}`, team, cardId, kind: c.type, type: c.type,
          x: position.x, y: position.y,
          hp: c.hp, maxHp: c.hp, radius: c.radius, flying: c.flying, targets: c.targets,
          speed: c.speed, damage: c.damage, attackInterval: c.attackInterval, range: c.range,
          splashRadius: c.splashRadius, splashOrigin: c.splashOrigin, projectileSpeed: c.projectileSpeed,
          stunDuration: c.stunDuration, freezeDuration: c.freezeDuration,
          slowDuration: c.slowDuration, slowFactorOnHit: c.slowFactor, suicide: c.suicide,
          isBuilding: c.type === 'building', active: false, destroyed: false,
          deployRemaining: c.deployTime + index * 0.06, lifetime: c.duration || null,
          ...(this.rulesVersion >= 3 ? { deployDuration: c.deployTime + index * 0.06 } : {}),
          ...(this._developer ? { spawnIndex: index, ...(c.type === 'building' ? { balanceDuration: c.duration } : {}) } : {}),
          attackCooldown: c.firstHitDelay, firstHitDelay: c.firstHitDelay,
          targetId: null, engagedTargetId: null, bridgeX: null, hitFlash: 0, attackFlash: 0, ...statusFields(this.rulesVersion),
          ...(this.rulesVersion >= 5 ? { knockbackImmune: Boolean(c.knockbackImmune) } : {}),
          facing: team === 'player' ? -Math.PI / 2 : Math.PI / 2
        };
        if (formation) {
          Object.assign(unit, { formationGroupId: formation.id, formationSlot: index,
            formationState: 'forming', formationProtected: false, chargeRemaining: 0 });
          formation.memberIds.push(unit.id);
        }
        // The v3 plan already includes full-body constraints; consuming it
        // unchanged makes the visible preview exactly match the transaction.
        if (this.rulesVersion === 2) this._constrainGround(unit, x, y);
        this.state.units.push(unit);
        this._effect('spawn', unit.x, unit.y, team, c.radius + 9, 0.5, { cardId });
      });
    }
    this._event('card', team, `${team === 'player' ? '아군' : '상대'} · ${c.name}`, { cardId, x, y });
    return { ok: true, cardId, ...(formation ? { groupId: formation.id } : {}) };
  }

  update(dt) {
    if (!this.state.running || !Number.isFinite(dt) || dt <= 0) return;
    this._recentSpellResolutions = [];
    // External callers normally provide a fixed step; subdivision also makes
    // tests and occasional long frames safe without skipping river collisions.
    let remaining = Math.min(dt, REGULATION + OVERTIME + 1);
    while (remaining > EPS && this.state.running) {
      const step = Math.min(remaining, 0.05);
      this._step(step);
      remaining -= step;
    }
  }

  _step(dt) {
    const s = this.state;
    s.tick++;
    const previousTime = s.time;
    s.time += dt;
    // Integrate boundaries exactly rather than awarding a whole transition step
    // at the new rate. This keeps 1x/2x/3x generation independent of frame size.
    let generated = 0;
    for (const [from, to, multiplier] of [[0, 120, 1], [120, 240, 2], [240, 301, 3]]) {
      generated += Math.max(0, Math.min(s.time, to) - Math.max(previousTime, from)) * multiplier / 2.8;
    }
    for (const team of ['player', 'enemy']) s.elixir[team] = this._developer?.cheats.infiniteElixir[team] ? 10 : Math.min(10, s.elixir[team] + generated);
    for (const entity of [...s.towers, ...s.units]) {
      entity.hitFlash = Math.max(0, (entity.hitFlash || 0) - dt * 5);
      entity.attackFlash = Math.max(0, (entity.attackFlash || 0) - dt * 6);
      entity.stunRemaining = Math.max(0, (entity.stunRemaining || 0) - dt);
      entity.frostRemaining = Math.max(0, (entity.frostRemaining || 0) - dt);
      entity.slowRemaining = Math.max(0, (entity.slowRemaining || 0) - dt);
      if (this.rulesVersion >= 5) entity.groundedRemaining = Math.max(0, (entity.groundedRemaining || 0) - dt);
      if (entity.slowRemaining <= EPS) entity.slowFactor = 1;
    }
    for (const effect of s.effects) { effect.life -= dt; effect.age += dt; }
    s.effects = s.effects.filter(e => e.life > 0);
    this._resolveDeaths();
    if (this._checkImmediateEnd()) return;
    this._updateAreas(dt);
    this._updateSpells(dt);
    this._updateFormations(dt);
    this._updateUnits(dt);
    this._separateBodies();
    this._syncFormationFlags();
    this._updateTowers(dt);
    this._updateProjectiles(dt);
    this._resolveDeaths();
    if (this._checkImmediateEnd()) return;
    if (s.phase === 'regulation' && s.time + EPS >= REGULATION) {
      s.time = Math.max(s.time, REGULATION);
      if (s.crowns.player !== s.crowns.enemy) {
        this._finish(s.crowns.player > s.crowns.enemy ? 'player' : 'enemy', 'crowns');
      } else {
        s.phase = 'overtime';
        this._event('overtime', null, '연장전 · 다음 타워를 먼저 파괴하세요!');
        this._effect('announcement', W / 2, H / 2, null, 0, 2, { text: '서든 데스' });
      }
    }
    if (s.phase === 'overtime' && s.time + EPS >= REGULATION + OVERTIME) {
      const minimum = team => Math.min(...s.towers.filter(t => t.team === team && alive(t)).map(t => t.hp));
      const p = minimum('player'), e = minimum('enemy');
      this._finish(Math.abs(p - e) < EPS ? 'draw' : p > e ? 'player' : 'enemy', 'tiebreaker');
    }
  }

  _validTarget(attacker, target) {
    if (!alive(target) || attacker.team === target.team) return false;
    if (attacker.targets === 'buildings' && !target.isBuilding) return false;
    const flying = target.flying && !(this.rulesVersion >= 5 && target.groundedRemaining > EPS);
    return attacker.targets === 'all' || !flying;
  }

  _entity(id) { return this.state.units.find(u => u.id === id) || this.state.towers.find(t => t.id === id); }
  _range(attacker, target) {
    const reach = attacker.range + attacker.radius + target.radius;
    // A self-centered swing must not stop just outside its own splash hitbox,
    // especially against large towers whose body radius differs from troops.
    return attacker.splashOrigin === 'self' && attacker.splashRadius > 0 ?
      Math.min(reach, attacker.splashRadius + target.radius * 0.65) : reach;
  }

  _acquireTarget(attacker, stationary = false) {
    const all = [...this.state.units, ...this.state.towers];
    const current = this._entity(attacker.targetId);
    if (this._validTarget(attacker, current)) {
      const retain = stationary ? this._range(attacker, current) :
        current.kind === 'tower' ? this._range(attacker, current) + 8 : Math.max(170, attacker.range + 70);
      if (distance(attacker, current) <= retain) return current;
    }
    let nearest = null, best = Infinity;
    const sight = stationary ? null : Math.max(155, attacker.range + 65);
    for (const target of all) {
      if (!this._validTarget(attacker, target)) continue;
      const d = distance(attacker, target);
      if (d > (stationary ? this._range(attacker, target) : sight)) continue;
      if (d < best - EPS || (Math.abs(d - best) <= EPS && target.id < nearest?.id)) {
        best = d; nearest = target;
      }
    }
    if (!nearest && !stationary) {
      // Without a local opponent, continue toward the nearest surviving tower.
      for (const target of this.state.towers) {
        if (!this._validTarget(attacker, target)) continue;
        const d = distance(attacker, target);
        if (d < best) { best = d; nearest = target; }
      }
    }
    attacker.targetId = nearest?.id || null;
    return nearest;
  }

  _regroupCenter(group, members) {
    const center = { x: members.reduce((n, u) => n + u.x, 0) / members.length,
      y: members.reduce((n, u) => n + u.y, 0) / members.length };
    const obstacles = [...this.state.towers, ...this.state.units].filter(u => alive(u) && u.isBuilding);
    const valid = point => point.x >= 26 && point.x <= W - 26 && point.y >= 26 && point.y <= H - 26 &&
      obstacles.every(u => distance(point, u) >= u.radius + 29);
    const candidates = [center];
    for (let radius = 8; radius <= 96; radius += 8) for (let i = 0; i < 16; i++) {
      const angle = (group.team === 'player' ? 1 : -1) * (Math.PI / 2 + i * Math.PI / 8);
      candidates.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
    }
    for (const candidate of candidates) {
      const constrained = { ...group, x: candidate.x, y: candidate.y };
      this._constrainGround(constrained, center.x, center.y);
      if (valid(constrained)) { group.x = constrained.x; group.y = constrained.y; return; }
    }
    group.x = center.x; group.y = center.y;
    this._constrainGround(group, center.x, center.y);
  }

  _reassignFormationSlots(group, members) {
    // A knocked-back front soldier can end up behind a fully occupied rear
    // row. Preserve physical bodies, but let the nearest front-to-back ranks
    // exchange positions instead of asking one ally to walk through another.
    const columns = members.length >= 5 ? 3 : members.length === 4 ? 2 : members.length;
    const direction = group.team === 'player' ? 1 : -1;
    const order = [...members].sort((a, b) => direction * (a.y - b.y) || a.x - b.x || (a.id < b.id ? -1 : 1));
    const arranged = [];
    for (let i = 0; i < order.length; i += columns) {
      arranged.push(...order.slice(i, i + columns).sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1)));
    }
    group.memberIds = arranged.map(u => u.id);
    return arranged;
  }

  _updateFormations(dt) {
    for (const group of this.state.formations || []) {
      let members = this._formationMembers(group);
      if (!members.length) continue;
      const c = this._formationCard(group);
      group.cooldownRemaining = this._developer?.cheats.noAbilityCooldown ? 0 : Math.max(0, group.cooldownRemaining - dt);
      if (group.mode === 'charge') {
        group.chargeRemaining = Math.max(0, group.chargeRemaining - dt);
        group.x = members.reduce((n, u) => n + u.x, 0) / members.length;
        group.y = members.reduce((n, u) => n + u.y, 0) / members.length;
        if (group.chargeRemaining <= EPS) {
          group.chargeRemaining = 0; group.mode = 'regroup'; group.settleTime = 0;
          group.targetId = null; group.bridgeX = null; group.avoidance = null;
          this._regroupCenter(group, members);
          for (const u of members) { u.avoidance = null; u.bridgeX = null; }
        }
      }
      if (group.mode !== 'charge') {
        let slots = this._formationSlots(group, members);
        let error = Math.max(...members.map((u, i) => distance(u, slots[i])));
        const ready = members.every(u => u.deployRemaining <= EPS && u.active && u.stunRemaining <= EPS);
        if (group.mode === 'guard' && (error > 16 || !ready)) { group.mode = 'regroup'; group.settleTime = 0; }
        if (group.mode !== 'guard') {
          if (ready && error > 6) {
            members = this._reassignFormationSlots(group, members);
            slots = this._formationSlots(group, members);
            error = Math.max(...members.map((u, i) => distance(u, slots[i])));
          }
          group.settleTime = ready && error <= 6 ? Math.min(1, group.settleTime + dt) : 0;
          if (group.settleTime >= .2 - EPS) group.mode = 'guard';
        }
        if (group.mode === 'guard' && error <= 12 && ready) {
          const target = this._acquireTarget(group);
          const stop = target ? this.rulesVersion >= 4 ? Math.max(c.range + c.radius + target.radius - 10,
            group.radius + target.radius + 3) : c.range + c.radius + target.radius - 10 : 0;
          if (target && distance(group, target) > stop) {
            const slow = Math.min(...members.map(u => u.slowRemaining > EPS ? u.slowFactor : 1));
            this._moveUnit(group, target, dt * slow);
          }
        }
      }
      members.forEach((u, index) => {
        u.formationSlot = index; u.formationState = group.mode; u.chargeRemaining = group.chargeRemaining;
        u.speed = group.mode === 'charge' ? c.chargeSpeed : group.mode === 'guard' ? c.speed : this.rulesVersion >= 4 ? c.speed * 1.5 : 36;
        if (group.mode !== 'guard') u.formationProtected = false;
      });
    }
  }

  _syncFormationFlags() {
    for (const group of this.state.formations || []) {
      const members = this._formationMembers(group), protectedNow = this._formationIsProtected(group, members);
      members.forEach((u, index) => {
        u.formationSlot = index; u.formationState = group.mode;
        u.formationProtected = protectedNow; u.chargeRemaining = group.chargeRemaining;
      });
    }
  }

  _updateFormationMember(u, group, movementDt, actionDt) {
    const members = this._formationMembers(group), slot = this._formationSlots(group, members).find(p => p.id === u.id);
    if (slot) {
      // Follow a shared anchor while keeping each body physical. Obstacle
      // waypoints and shoreline constraints apply to every individual soldier.
      const goal = this._buildingWaypoint(u, slot, group.id);
      const oldX = u.x, oldY = u.y, dx = goal.x - u.x, dy = goal.y - u.y, length = Math.hypot(dx, dy);
      if (length > EPS) {
        const amount = Math.min(length, u.speed * movementDt);
        u.x += dx / length * amount; u.y += dy / length * amount;
        u.facing = Math.atan2(dy, dx);
        this._constrainGround(u, oldX, oldY);
      }
      u.bridgeX = group.bridgeX;
    }
    const target = this._acquireTarget(u);
    if (this.rulesVersion >= 4) {
      // A shield wall holds its position and receives hits. Only the explicit
      // charge phase enters the ordinary per-soldier attack path below.
      u.engagedTargetId = null; u.attackCooldown = Math.max(0, u.attackCooldown - actionDt);
      return;
    }
    if (target && distance(u, target) <= this._range(u, target)) {
      u.facing = Math.atan2(target.y - u.y, target.x - u.x);
      if (u.engagedTargetId !== target.id) { u.engagedTargetId = target.id; u.attackCooldown = Math.max(u.attackCooldown, u.firstHitDelay); }
      u.attackCooldown -= actionDt;
      if (u.attackCooldown <= EPS) { this._attack(u, target); u.attackCooldown += u.attackInterval; }
    } else {
      u.engagedTargetId = null; u.attackCooldown = Math.max(0, u.attackCooldown - actionDt);
    }
  }

  _updateUnits(dt) {
    for (const u of this.state.units) {
      if (!alive(u)) continue;
      if (u.isBuilding && u.lifetime != null) {
        u.lifetime -= dt;
        u.hp = Math.max(0, u.hp - u.maxHp * dt / (u.balanceDuration ?? this.getCard(u.cardId, u.team).duration));
        if (!alive(u) || u.lifetime <= 0) { u.hp = 0; continue; }
      }
      u.deployRemaining = Math.max(0, u.deployRemaining - dt);
      if (u.deployRemaining > EPS) continue;
      u.active = true;
      // A stun pauses action clocks, never a building's finite lifetime.
      if (u.stunRemaining > EPS) continue;
      const movementDt = dt * (u.slowRemaining > EPS ? u.slowFactor : 1);
      // Rules 3 define poison as movement-only slow. Rules 2 retain their
      // historical action-clock slow so existing recordings remain exact.
      const actionDt = this.rulesVersion >= 3 ? dt : movementDt;
      const formation = u.formationGroupId && (this.state.formations || []).find(g => g.id === u.formationGroupId);
      if (formation && formation.mode !== 'charge') {
        this._updateFormationMember(u, formation, movementDt, actionDt);
        continue;
      }
      const target = this._acquireTarget(u, u.isBuilding);
      if (!target) { u.attackCooldown = Math.max(0, u.attackCooldown - actionDt); continue; }
      u.facing = Math.atan2(target.y - u.y, target.x - u.x);
      if (distance(u, target) <= this._range(u, target)) {
        if (u.engagedTargetId !== target.id) {
          u.engagedTargetId = target.id;
          u.attackCooldown = Math.max(u.attackCooldown, u.firstHitDelay);
        }
        u.attackCooldown -= actionDt;
        if (u.attackCooldown <= EPS) {
          this._attack(u, target);
          u.attackCooldown += u.attackInterval;
        }
      } else {
        u.engagedTargetId = null;
        u.attackCooldown = Math.max(0, u.attackCooldown - actionDt);
        if (!u.isBuilding) this._moveUnit(u, target, movementDt);
      }
    }
  }

  _moveUnit(u, target, dt) {
    const oldX = u.x, oldY = u.y;
    let tx = target.x, ty = target.y;
    if (!u.flying) {
      const padding = this.rulesVersion >= 3 ? u.radius : 0;
      const lowerBank = RIVER_BOTTOM + padding, upperBank = RIVER_TOP - padding;
      const crossing = (u.y >= lowerBank && target.y < lowerBank) ||
        (u.y <= upperBank && target.y > upperBank) || (u.y > upperBank && u.y < lowerBank);
      if (crossing) {
        const onBank = u.y <= upperBank || u.y >= lowerBank;
        const blocked = this.rulesVersion >= 3 && onBank && u.bridgeX != null && this._bridgeBlocked(u, u.bridgeX, target.id);
        if (u.bridgeX == null || (u.y < upperBank - 45 || u.y > lowerBank + 45) || blocked) {
          let candidates = BRIDGES;
          if (this.rulesVersion >= 3 && onBank) {
            const clear = BRIDGES.filter(x => !this._bridgeBlocked(u, x, target.id));
            if (clear.length) candidates = clear;
          }
          u.bridgeX = candidates.reduce((best, x) => {
            const cost = Math.hypot(u.x - x, u.y - 320) + Math.hypot(target.x - x, target.y - 320);
            return cost < best.cost ? { x, cost } : best;
          }, { x: 120, cost: Infinity }).x;
        }
        tx = u.bridgeX;
        const towardTop = target.y < u.y;
        const innerHalf = bridgeInnerHalf(u);
        if (u.y >= lowerBank && Math.abs(u.x - tx) > innerHalf) ty = lowerBank + 6;
        else if (u.y <= upperBank && Math.abs(u.x - tx) > innerHalf) ty = upperBank - 6;
        else ty = towardTop ? upperBank - 2 : lowerBank + 2;
      } else u.bridgeX = null;
    }
    if (!u.flying) ({ x: tx, y: ty } = this._buildingWaypoint(u, { x: tx, y: ty }, target.id));
    const dx = tx - u.x, dy = ty - u.y, length = Math.hypot(dx, dy);
    if (length > EPS) {
      const amount = Math.min(length, u.speed * dt);
      u.x += dx / length * amount;
      u.y += dy / length * amount;
      u.facing = Math.atan2(dy, dx);
    }
    this._constrainGround(u, oldX, oldY);
  }

  _bridgeBlocked(unit, bridgeX, targetId) {
    // A building covering the full body-width entrance cannot be solved by
    // pushing against the shoreline. Take the other bridge while still on land.
    const half = bridgeInnerHalf(unit);
    for (const obstacle of [...this.state.towers, ...this.state.units]) {
      if (!alive(obstacle) || !obstacle.isBuilding || obstacle.id === targetId || obstacle.id === unit.id) continue;
      const nearestY = clamp(obstacle.y, RIVER_TOP - unit.radius, RIVER_BOTTOM + unit.radius);
      const farEdgeX = Math.abs(obstacle.x - bridgeX) + half;
      if (Math.hypot(farEdgeX, obstacle.y - nearestY) < unit.radius + obstacle.radius + 1) return true;
    }
    return false;
  }

  _buildingWaypoint(u, destination, targetId) {
    // Two corner waypoints take a rear deployment around its own tower.
    // This local obstacle rule complements bridge routing; body separation alone
    // would trap a unit whose desired direction passes through a stationary tower.
    if (u.avoidance && (u.avoidance.targetId !== targetId || !alive(this._entity(u.avoidance.obstacleId)))) u.avoidance = null;
    if (u.avoidance) {
      let point = u.avoidance.points[u.avoidance.stage];
      // Two ordinary bodies can approach the same corner from opposite sides.
      // Requiring both centers inside 4 px lets separation cancel their motion
      // forever. Rules 5 accepts a body-sized arrival region; the existing
      // precise formation-anchor routing and older replay rules stay unchanged.
      const arrival = this.rulesVersion >= 5 && !Array.isArray(u.memberIds) ? Math.max(4, u.radius) : 4;
      if (distance(u, point) < arrival) {
        u.avoidance.stage++;
        point = u.avoidance.points[u.avoidance.stage];
        if (!point) u.avoidance = null;
      }
      if (point) return point;
    }
    const dx = destination.x - u.x, dy = destination.y - u.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1) return destination;
    let nearest = null, nearestT = Infinity;
    for (const obstacle of [...this.state.towers, ...this.state.units.filter(v => v.isBuilding)]) {
      if (!alive(obstacle) || obstacle.id === targetId || obstacle.id === u.id) continue;
      const clearance = u.radius + obstacle.radius + 5;
      const projection = ((obstacle.x - u.x) * dx + (obstacle.y - u.y) * dy) / length2;
      if (projection <= 0 || projection > 1 || projection >= nearestT) continue;
      const px = u.x + dx * projection, py = u.y + dy * projection;
      if (Math.hypot(px - obstacle.x, py - obstacle.y) >= clearance) continue;
      nearest = obstacle; nearestT = projection;
    }
    if (!nearest) return destination;
    const clearance = u.radius + nearest.radius + 11;
    const direction = dy >= 0 ? 1 : -1;
    const side = Math.abs(u.x - nearest.x) > 5 ? Math.sign(u.x - nearest.x) :
      Math.abs(destination.x - nearest.x) > 5 ? Math.sign(destination.x - nearest.x) : nearest.x <= W / 2 ? 1 : -1;
    const laneX = clamp(nearest.x + side * clearance, u.radius + 2, W - u.radius - 2);
    const entry = { x: laneX, y: clamp(nearest.y - direction * clearance, 18, H - 18) };
    const exit = { x: laneX, y: clamp(nearest.y + direction * clearance, 18, H - 18) };
    // Keep near-shore detours on the same bank until bridge routing takes over.
    const padding = this.rulesVersion >= 3 ? u.radius : 0;
    for (const point of [entry, exit]) {
      if (u.y >= RIVER_BOTTOM + padding && point.y < RIVER_BOTTOM + padding) point.y = RIVER_BOTTOM + padding;
      if (u.y <= RIVER_TOP - padding && point.y > RIVER_TOP - padding) point.y = RIVER_TOP - padding;
    }
    // Do not introduce a path through river water for a structure near the shore.
    const legalPoint = point => !(point.y > RIVER_TOP - padding && point.y < RIVER_BOTTOM + padding) || BRIDGES.some(x => Math.abs(point.x - x) < bridgeInnerHalf(u));
    if (!legalPoint(entry) || !legalPoint(exit)) return destination;
    const points = (u.y - nearest.y) * direction < -clearance * 0.35 ? [entry, exit] : [exit];
    u.avoidance = { obstacleId: nearest.id, targetId, points, stage: 0 };
    return points[0];
  }

  _constrainGround(u, oldX = u.x, oldY = u.y) {
    u.x = clamp(u.x, u.radius, W - u.radius);
    const padding = this.rulesVersion >= 3 ? u.radius : 0;
    u.y = clamp(u.y, Math.max(16, padding), H - Math.max(16, padding));
    const upperBank = RIVER_TOP - padding, lowerBank = RIVER_BOTTOM + padding;
    if (u.flying || !(u.y > upperBank && u.y < lowerBank)) return;
    const bridge = BRIDGES.reduce((a, b) => Math.abs(u.x - a) < Math.abs(u.x - b) ? a : b);
    const innerHalf = bridgeInnerHalf(u);
    if (Math.abs(u.x - bridge) <= innerHalf) return;
    // A body already in a bridge stays within its corridor after separation.
    if (oldY > upperBank && oldY < lowerBank && BRIDGES.some(x => Math.abs(oldX - x) <= BRIDGE_HALF)) {
      u.x = clamp(u.x, bridge - innerHalf, bridge + innerHalf);
    } else {
      u.y = oldY <= upperBank ? upperBank : oldY >= lowerBank ? lowerBank :
        u.team === 'player' ? lowerBank : upperBank;
    }
  }

  _separateBodies() {
    const bodies = this.state.units.filter(alive);
    const push = (u, dx, dy) => {
      if (u.isBuilding) return;
      const x = u.x, y = u.y;
      u.x += dx; u.y += dy;
      this._constrainGround(u, x, y);
    };
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (a.flying !== b.flying || (a.isBuilding && b.isBuilding)) continue;
        const minimum = (a.radius + b.radius) * 0.92;
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= minimum) continue;
        if (d < EPS) { dx = (i + j) % 2 ? 1 : -1; dy = 0.1; d = Math.hypot(dx, dy); }
        const amount = Math.min(3, (minimum - d) * 0.52);
        const shareA = a.isBuilding ? 0 : b.isBuilding ? 1 : b.radius ** 2 / (a.radius ** 2 + b.radius ** 2);
        push(a, -dx / d * amount * shareA, -dy / d * amount * shareA);
        push(b, dx / d * amount * (1 - shareA), dy / d * amount * (1 - shareA));
      }
      if (a.flying || a.isBuilding) continue;
      for (const t of this.state.towers) {
        if (!alive(t)) continue;
        let dx = a.x - t.x, dy = a.y - t.y, d = Math.hypot(dx, dy);
        const minimum = a.radius + t.radius;
        if (d >= minimum) continue;
        if (d < EPS) { dx = 1; dy = 0; d = 1; }
        push(a, dx / d * Math.min(4, minimum - d), dy / d * Math.min(4, minimum - d));
      }
    }
  }

  _updateTowers(dt) {
    for (const t of this.state.towers) {
      if (!alive(t) || !t.active || t.stunRemaining > EPS) continue;
      t.attackCooldown -= dt * (this.rulesVersion === 2 && t.slowRemaining > EPS ? t.slowFactor : 1);
      const target = this._acquireTarget(t, true);
      if (target && t.attackCooldown <= EPS) {
        this._attack(t, target);
        t.attackCooldown = t.attackInterval;
      } else if (!target) t.attackCooldown = Math.max(0, t.attackCooldown);
    }
  }

  _attack(attacker, target) {
    if (!this._validTarget(attacker, target)) return;
    attacker.attackFlash = 1;
    if (attacker.projectileSpeed > 0) {
      this.state.projectiles.push({
        id: `p${++this._counter}`, x: attacker.x, y: attacker.y, tx: target.x, ty: target.y,
        team: attacker.team, targetId: target.id, sourceId: attacker.id, cardId: attacker.cardId || 'tower',
        kind: attacker.cardId === 'bomber' ? 'bomb' : ['archers', 'spear_goblins'].includes(attacker.cardId) ? 'arrow' : 'bullet',
        type: attacker.cardId === 'bomber' ? 'bomb' : 'projectile',
        speed: attacker.projectileSpeed, radius: attacker.cardId === 'bomber' ? 5 : 3,
        damage: attacker.damage, splashRadius: attacker.splashRadius || 0, targets: attacker.targets,
        life: 3, maxLife: 3
      });
    } else if (attacker.splashRadius > 0) {
      const center = attacker.splashOrigin === 'self' ? attacker : target;
      this._areaDamage(attacker.team, center.x, center.y, attacker.splashRadius, attacker.damage, attacker.targets,
        null, 0, { stunDuration: attacker.stunDuration, freezeDuration: attacker.freezeDuration,
          slowDuration: attacker.slowDuration, slowFactor: attacker.slowFactorOnHit });
      this._effect(attacker.freezeDuration > 0 ? 'freeze' : 'hit', center.x, center.y, attacker.team,
        attacker.splashRadius, attacker.freezeDuration > 0 ? 0.7 : 0.23, { cardId: attacker.cardId });
    } else this._applyHit(target, attacker.damage, attacker.team, attacker.targets);
    if (attacker.suicide) attacker.hp = 0;
  }

  _updateProjectiles(dt) {
    const survivors = [];
    for (const p of this.state.projectiles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      const target = this._entity(p.targetId);
      if (alive(target)) { p.tx = target.x; p.ty = target.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      if (d <= p.speed * dt + 2) {
        if (p.splashRadius > 0) {
          this._areaDamage(p.team, p.tx, p.ty, p.splashRadius, p.damage, p.targets);
          this._effect('hit', p.tx, p.ty, p.team, p.splashRadius, 0.3, { cardId: p.cardId });
        } else {
          const impact = p.cardId === 'minion_giant' && this._validTarget(p, target);
          this._applyHit(target, p.damage, p.team, p.targets);
          if (impact) this._effect('hit', p.tx, p.ty, p.team, 14, .25, { cardId: p.cardId });
        }
      } else {
        p.x += dx / d * p.speed * dt; p.y += dy / d * p.speed * dt;
        survivors.push(p);
      }
    }
    this.state.projectiles = survivors;
  }

  _updateSpells(dt) {
    const pending = [];
    for (const spell of this._pendingSpells) {
      spell.remaining -= dt;
      if (spell.remaining > EPS) { pending.push(spell); continue; }
      const c = spell.cardStats || this.getCard(spell.cardId, spell.team);
      let hits = [];
      if (c.persistent) {
        this.state.areas.push({ id: `a${++this._counter}`, team: spell.team, cardId: c.id,
          x: spell.x, y: spell.y, radius: c.spellRadius, life: c.duration, maxLife: c.duration,
          duration: c.duration, tickRemaining: c.tickInterval, tickInterval: c.tickInterval,
          ticksRemaining: Math.floor(c.duration / c.tickInterval), damage: c.damage, crownDamage: c.crownDamage,
          targets: c.targets, slowFactor: c.slowFactor, slowDuration: c.slowDuration });
        this._effect('spell', spell.x, spell.y, spell.team, c.spellRadius, 0.55, { cardId: spell.cardId });
      } else {
        const selected = this.rulesVersion >= 5 && c.targetSelection === 'highest-hp' ?
          selectSpellTargets([...this.state.units, ...this.state.towers], spell.team, c, spell.x, spell.y, this.rulesVersion) : null;
        const selectedTargets = selected?.map(({ id, x, y, radius, flying }) => ({ id, x, y, radius, flying }));
        hits = this._areaDamage(spell.team, spell.x, spell.y, c.spellRadius, c.damage, c.targets, c.crownDamage, c.knockback || 0, c, selected);
        this._effect('spell', spell.x, spell.y, spell.team, c.spellRadius, c.duration, { cardId: spell.cardId,
          ...(selectedTargets ? { selectedTargets } : {}) });
      }
      this._recentSpellResolutions.push({ commandIndex: spell.commandIndex ?? null, team: spell.team,
        cardId: spell.cardId, x: spell.x, y: spell.y, tick: this.state.tick, persistent: Boolean(c.persistent), hits });
    }
    this._pendingSpells = pending;
  }

  _updateAreas(dt) {
    for (const area of this.state.areas) {
      // First tick occurs one full interval after creation; expiry includes tick 8.
      // Slow is refreshed only while inside, with a short release after leaving.
      for (const target of [...this.state.units, ...this.state.towers]) {
        if (this._validTarget(area, target) && distance(area, target) <= area.radius + target.radius * 0.65) {
          this._applyStatus(target, area);
        }
      }
      area.life = Math.max(0, area.life - dt);
      area.tickRemaining -= dt;
      while (area.tickRemaining <= EPS && area.ticksRemaining > 0) {
        this._areaDamage(area.team, area.x, area.y, area.radius, area.damage, area.targets, area.crownDamage);
        area.ticksRemaining--;
        area.tickRemaining += area.tickInterval;
        this._effect('poisonTick', area.x, area.y, area.team, area.radius, 0.25, { cardId: area.cardId });
      }
    }
    this.state.areas = this.state.areas.filter(area => area.life > EPS || area.ticksRemaining > 0);
  }

  _areaDamage(team, x, y, radius, amount, targets = 'all', crownDamage = null, knockback = 0, status = {}, selection = null) {
    const hits = [];
    // One blast samples every shield before applying any knockback, stun or
    // death. Array order must not strip protection from later squad members.
    const impacts = (selection || [...this.state.units, ...this.state.towers].filter(target =>
      this._validTarget({ team, targets }, target) &&
      Math.hypot(target.x - x, target.y - y) <= radius + target.radius * 0.65
    )).map(target => ({ target, damage: this._effectiveDamage(target,
      target.kind === 'tower' && crownDamage != null ? crownDamage : amount) }));
    for (const { target, damage } of impacts) {
      const previousHp = target.hp;
      this._damage(target, damage, team, true);
      if (alive(target)) this._applyStatus(target, status);
      if (target.hp < previousHp) hits.push({ id: target.id, team: target.team, damage: previousHp - target.hp, killed: target.hp <= 0 });
      if (knockback > 0 && alive(target) && !target.isBuilding && !target.knockbackImmune) {
        const oldX = target.x, oldY = target.y;
        const dx = target.x - x, dy = target.y - y, d = Math.hypot(dx, dy);
        if (d > EPS) { target.x += dx / d * knockback; target.y += dy / d * knockback; }
        this._constrainGround(target, oldX, oldY);
      }
    }
    return hits;
  }

  _applyHit(target, amount, team, targets = 'all', status = {}) {
    if (!this._validTarget({ team, targets }, target)) return;
    this._damage(target, amount, team);
    if (alive(target)) this._applyStatus(target, status);
  }

  _applyStatus(target, status) {
    if (!alive(target)) return;
    if (this.rulesVersion >= 5 && target.flying && status.groundingDuration > 0) {
      // Keep the native flight class and position intact, including over water.
      // Targeting reads this timer; the accompanying stun stops locomotion.
      target.groundedRemaining = Math.max(target.groundedRemaining || 0, status.groundingDuration);
    }
    const stun = Math.max(status.stunDuration || 0, status.freezeDuration || 0);
    if (stun > 0) {
      target.stunRemaining = Math.max(target.stunRemaining || 0, stun);
      target.frostRemaining = Math.max(target.frostRemaining || 0, status.freezeDuration || 0);
      target.targetId = null;
      target.engagedTargetId = null;
      target.attackCooldown = Math.max(target.attackCooldown, target.firstHitDelay || 0.15);
    }
    if (status.slowDuration > 0 && status.slowFactor > 0 && status.slowFactor < 1 &&
      (this.rulesVersion === 2 || (!target.isBuilding && target.speed > 0))) {
      // Original stacking policy: strongest factor and longest remaining duration.
      target.slowFactor = target.slowRemaining > EPS ? Math.min(target.slowFactor, status.slowFactor) : status.slowFactor;
      target.slowRemaining = Math.max(target.slowRemaining || 0, status.slowDuration);
    }
  }

  _effectiveDamage(target, amount) {
    if (!target?.formationGroupId) return amount;
    const group = (this.state.formations || []).find(g => g.id === target.formationGroupId);
    return group && this._formationIsProtected(group) ? amount * (1 - this._formationCard(group).damageReduction) : amount;
  }

  _damage(target, amount, team, bypassProtection = false) {
    if (!alive(target) || amount <= 0) return;
    if (!bypassProtection) amount = this._effectiveDamage(target, amount);
    const actual = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    target.hitFlash = 1;
    if (this.state.stats[team]) this.state.stats[team].damageDealt += actual;
    if (target.kind === 'tower' && target.type === 'king' && !target.active) this._activateKing(target.team);
    this._effect('hit', target.x, target.y, team, Math.min(target.radius + 4, 18), 0.16);
    this._effect('damage', target.x, target.y - target.radius, team, 0, 0.7, { amount: actual, targetTeam: target.team });
  }

  _activateKing(team) {
    const king = this.state.towers.find(t => t.team === team && t.type === 'king');
    if (!king || king.active || !alive(king)) return;
    king.active = true;
    king.attackCooldown = 0.25;
    this._effect('kingActive', king.x, king.y, team, 38, 0.8);
    this._event('kingActive', team, `${team === 'player' ? '아군' : '상대'} 킹 타워가 활성화됐습니다.`);
  }

  _resolveDeaths() {
    for (const t of this.state.towers) {
      if (t.hp > 0 || t.destroyed) continue;
      t.hp = 0; t.destroyed = true; t.active = false;
      const winner = opposite(t.team);
      this.state.stats[winner].towersDestroyed++;
      if (t.type === 'king') this.state.crowns[winner] = 3;
      else {
        this.state.crowns[winner] = Math.min(3, this.state.crowns[winner] + 1);
        this._activateKing(t.team);
      }
      this._effect('towerDown', t.x, t.y, winner, 52, 1.3);
      this._event('tower', winner, `${winner === 'player' ? '아군' : '상대'}이 ${t.type === 'king' ? '킹 ' : ''}타워를 파괴했습니다!`);
    }
    for (const u of this.state.units) if (u.hp <= 0) this._effect('death', u.x, u.y, u.team, u.radius + 5, 0.35, { cardId: u.cardId });
    this.state.units = this.state.units.filter(alive);
    if (this.state.formations) {
      for (const group of this.state.formations) {
        group.memberIds = group.memberIds.filter(id => this.state.units.some(u => u.id === id && u.formationGroupId === group.id));
      }
      this.state.formations = this.state.formations.filter(g => g.memberIds.length);
      this._syncFormationFlags();
    }
  }

  _checkImmediateEnd() {
    const s = this.state;
    const pKing = s.towers.find(t => t.team === 'player' && t.type === 'king');
    const eKing = s.towers.find(t => t.team === 'enemy' && t.type === 'king');
    if (pKing.destroyed || eKing.destroyed) {
      this._finish(pKing.destroyed && eKing.destroyed ? 'draw' : eKing.destroyed ? 'player' : 'enemy', 'king');
      return true;
    }
    if (s.phase === 'overtime' && s.crowns.player !== s.crowns.enemy) {
      this._finish(s.crowns.player > s.crowns.enemy ? 'player' : 'enemy', 'suddenDeath');
      return true;
    }
    return false;
  }

  _finish(winner, reason) {
    if (this.state.phase === 'finished') return;
    this.state.winner = winner;
    this.state.reason = reason;
    this.state.phase = 'finished';
    this.state.running = false;
    this._pendingSpells = [];
    this._event('finish', winner === 'draw' ? null : winner, winner === 'draw' ? '무승부' : winner === 'player' ? '승리!' : '패배');
  }

  _effect(type, x, y, team, radius, duration, extra = {}) {
    this.state.effects.push({ id: `fx${++this._counter}`, type, kind: type, x, y, team, radius,
      life: duration, maxLife: duration, duration, age: 0, createdAt: this.state.time, ...extra });
    if (this.state.effects.length > 180) this.state.effects.splice(0, this.state.effects.length - 180);
  }
  _event(type, team, text, extra = {}) {
    this.state.events.push({ id: `ev${++this._counter}`, type, time: this.state.time, team, text, ...extra });
    if (this.state.events.length > 30) this.state.events.splice(0, this.state.events.length - 30);
  }
}
