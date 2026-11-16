/**
 * Crownfall Arena — independent, original browser prototype.
 * Mechanics are informed by the accompanying Clash Royale design analysis;
 * all combat values, geometry handling and implementation below are original.
 * No Supercell code, assets, networking or commercial balancing data is used.
 * Pure simulation module: no DOM, renderer, timers or opponent AI dependencies.
 */

const W = 480, H = 640, RIVER_TOP = 300, RIVER_BOTTOM = 340;
const BRIDGES = [120, 360], BRIDGE_HALF = 27;
const REGULATION = 180, OVERTIME = 120;
const EPS = 1e-7;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const opposite = team => team === 'player' ? 'enemy' : 'player';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = entity => entity && entity.hp > 0 && !entity.destroyed;
const isTeam = team => team === 'player' || team === 'enemy';
const hasCard = id => typeof id === 'string' && Object.hasOwn(CARDS, id);
const clone = value => JSON.parse(JSON.stringify(value));
const statusFields = () => ({ stunRemaining: 0, frostRemaining: 0, slowRemaining: 0, slowFactor: 1 });

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
      targets: 'all', stunDuration: 1.1, freezeDuration: 1.1, suicide: true, splashOrigin: 'self', firstHitDelay: 0.12 })
});

export const DEFAULT_DECK = Object.freeze([
  'giant', 'knight', 'archers', 'goblins', 'fireball', 'arrows', 'minions', 'cannon'
]);

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
  if (config.rulesVersion !== undefined && ![2, 3].includes(config.rulesVersion)) throw new Error('지원하지 않는 전투 규칙입니다.');
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
    need(hasCard(u.cardId) && CARDS[u.cardId].type !== 'spell' && u.type === CARDS[u.cardId].type && u.kind === u.type &&
      u.isBuilding === (u.type === 'building'), '병력 종류');
    need(number(u.speed, 0, 1000) && number(u.deployRemaining, 0, 10) &&
      (u.lifetime === null || number(u.lifetime, 0, 120)) && number(u.firstHitDelay, 0, 10) &&
      number(u.splashRadius, 0, 200) && number(u.facing, -Math.PI - EPS, Math.PI + EPS), '병력 행동');
    if (u.deployDuration !== undefined) need(number(u.deployDuration, 0.05, 10) && u.deployRemaining <= u.deployDuration + EPS, '배치 지연');
    need(nullableId(u.engagedTargetId) && (u.bridgeX === null || BRIDGES.includes(u.bridgeX)), '경로');
    need(['self', 'target'].includes(u.splashOrigin) && typeof u.suicide === 'boolean' &&
      number(u.stunDuration, 0, 60) && number(u.freezeDuration, 0, 60) &&
      number(u.slowDuration, 0, 60) && number(u.slowFactorOnHit, 0.05, 1), '병력 효과');
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
      (p.cardId === 'tower' || hasCard(p.cardId)) && number(p.x, 0, W) && number(p.y, 0, H) &&
      number(p.tx, 0, W) && number(p.ty, 0, H) && number(p.speed, 1, 10000) &&
      number(p.damage, 0, 100000) && number(p.splashRadius, 0, 200) && number(p.life, 0, 10) &&
      ['all', 'ground', 'buildings'].includes(p.targets), '투사체');
  }
  for (const a of s.areas) {
    need(textId(a.id) && isTeam(a.team) && hasCard(a.cardId) && CARDS[a.cardId].persistent &&
      number(a.x, 0, W) && number(a.y, 0, H) && number(a.radius, 1, 200) && number(a.life, 0, 60) &&
      number(a.maxLife, 0.05, 60) && number(a.duration, 0.05, 60) && number(a.tickInterval, 0.05, 10) &&
      number(a.tickRemaining, -0.05, a.tickInterval) && integer(a.ticksRemaining, 0, 100) &&
      number(a.damage, 0, 100000) && number(a.crownDamage, 0, 100000) && number(a.slowFactor, 0.05, 1) &&
      number(a.slowDuration, 0, 60) && ['all', 'ground', 'buildings'].includes(a.targets), '지속 지역');
  }
  for (const e of s.effects) need(e && textId(e.id) && typeof e.type === 'string' &&
    number(e.x, -200, W + 200) && number(e.y, -200, H + 200) && number(e.life, 0, 60) &&
    number(e.maxLife, 0, 60) && number(e.age, 0, 60) && (e.team === null || isTeam(e.team)), '시각 효과');
  for (const e of s.events) need(e && textId(e.id) && typeof e.type === 'string' &&
    typeof e.text === 'string' && number(e.time, 0, 301) && (e.team === null || isTeam(e.team)), '이벤트');
  need(integer(value._seed, 0, 4294967295) && integer(value._counter, 0, 100000000), '내부 순서');
  list(value.pendingSpells, 128, '대기 주문');
  for (const p of value.pendingSpells) {
    need(p && isTeam(p.team) && hasCard(p.cardId) && CARDS[p.cardId].type === 'spell' &&
      number(p.x, 0, W) && number(p.y, 0, H) && number(p.remaining, 0, 5), '대기 주문');
    if (p.commandIndex !== undefined) {
      need(integer(p.commandIndex, 0, (value.commands?.length || 0) - 1), '주문 입력 순서');
      const command = value.commands[p.commandIndex];
      need(command && command.team === p.team && command.cardId === p.cardId && command.x === p.x && command.y === p.y, '주문 입력');
    }
  }
  list(value.commands, 4096, '명령 기록');
  let previousTick = 0;
  for (const c of value.commands) {
    need(c && integer(c.tick, previousTick, s.tick) && isTeam(c.team) && integer(c.handIndex, 0, 3) &&
      hasCard(c.cardId) && number(c.x, 0, W) && number(c.y, 0, H), '명령');
    previousTick = c.tick;
  }
}

/** Coordinates and all velocities are world pixels and world pixels/second. */
export class Game {
  constructor({ deck = DEFAULT_DECK, enemyDeck = DEFAULT_DECK, difficulty = 'normal', seed = Date.now(), practice = false, rulesVersion = 3 } = {}) {
    validateConfig({ deck, enemyDeck, difficulty, seed, practice: Boolean(practice), rulesVersion });
    this.width = W;
    this.height = H;
    this.cards = CARDS;
    this.difficulty = difficulty;
    this.practice = Boolean(practice);
    this.deck = [...deck];
    this.enemyDeck = [...enemyDeck];
    this.seed = seed;
    this.rulesVersion = rulesVersion;
    this.initialConfig = { deck: [...deck], enemyDeck: [...enemyDeck], seed, difficulty, practice: this.practice, rulesVersion };
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
      isBuilding: true, targetId: null, hitFlash: 0, attackFlash: 0, ...statusFields()
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
  getTimeRemaining() {
    if (this.state.phase === 'finished') return 0;
    return Math.max(0, (this.state.phase === 'overtime' ? REGULATION + OVERTIME : REGULATION) - this.state.time);
  }
  getElixirMultiplier() { return this.state.time < 120 ? 1 : this.state.time < 240 ? 2 : 3; }
  getTowerScore(team) { return this.state.crowns[team] ?? 0; }

  /** Accepted commands are replayed BEFORE advancing the indicated fixed tick. */
  exportReplay() {
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
      commands: this.commands, ...(this.endAction ? { endAction: this.endAction } : {}) });
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
    return game;
  }

  canDeploy(team, cardId, x, y) {
    const result = this._canDeployCenter(team, cardId, x, y);
    if (!result.ok || this.rulesVersion === 2 || CARDS[cardId].type === 'spell') return result;
    const positions = this._planDeployment(team, CARDS[cardId], x, y);
    return positions ? { ok: true, positions } : { ok: false, reason: '병력이 모두 설 수 있는 빈 공간이 필요합니다.' };
  }

  _canDeployCenter(team, cardId, x, y) {
    const c = hasCard(cardId) ? CARDS[cardId] : null;
    if (team !== 'player' && team !== 'enemy') return { ok: false, reason: '올바르지 않은 진영입니다.' };
    if (!c) return { ok: false, reason: '카드를 찾을 수 없습니다.' };
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
    if (!own && !forward) return { ok: false, reason: '아군 지역에 배치하세요. 주문은 어디든 사용할 수 있습니다.' };
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
    const c = CARDS[cardId];
    if (c.type !== 'spell') {
      return { ok: true, positions: (result.positions || this._legacyDeployment(team, c, x, y)).map(p => ({ ...p })), affectedTargets: [] };
    }
    const affectedTargets = [...this.state.units, ...this.state.towers].filter(target =>
      this._validTarget({ team, targets: c.targets }, target) &&
      Math.hypot(target.x - x, target.y - y) <= c.spellRadius + target.radius * 0.65).map(target => ({
        id: target.id, x: target.x, y: target.y, radius: target.radius, kind: target.kind, type: target.type,
        team: target.team, hp: target.hp,
        damage: Math.min(target.hp, target.kind === 'tower' && c.crownDamage != null ? c.crownDamage : c.damage)
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
    const offsets = c.count === 3 ? [[-12, 6], [12, 6], [0, -10]] : c.count === 2 ? [[-12, 0], [12, 0]] : [[0, 0]];
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
      if (ownPlacement ? !own : !forward) return false;
      for (const obstacle of obstacles) {
        if (!obstacle.isBuilding && c.type !== 'building' && obstacle.flying !== c.flying) continue;
        if (distance(point, obstacle) < r + obstacle.radius + 1 - EPS) return false;
      }
      return positions.every(other => distance(point, other) >= 2 * r + 1 - EPS);
    };
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
    const check = this.canDeploy(team, cardId, x, y);
    if (!check.ok) return check;
    const c = CARDS[cardId];
    const commandIndex = this.commands.length;
    this.commands.push({ tick: this.state.tick, team, handIndex, cardId, x, y });
    // Cost, rotation and action are one synchronous transaction.
    this.state.elixir[team] = Math.max(0, this.state.elixir[team] - c.cost);
    this.state.hands[team][handIndex] = this.state.queues[team].shift();
    this.state.queues[team].push(cardId);
    this.state.stats[team].cardsPlayed++;
    this.state.stats[team].elixirSpent += c.cost;
    if (c.type === 'spell') {
      this._pendingSpells.push({ team, cardId, x, y, remaining: c.castDelay,
        ...(this.rulesVersion >= 3 ? { commandIndex } : {}) });
      this._effect('cast', x, y, team, c.spellRadius, c.castDelay, { cardId });
    } else {
      const positions = check.positions || this._legacyDeployment(team, c, x, y);
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
          attackCooldown: c.firstHitDelay, firstHitDelay: c.firstHitDelay,
          targetId: null, engagedTargetId: null, bridgeX: null, hitFlash: 0, attackFlash: 0, ...statusFields(),
          facing: team === 'player' ? -Math.PI / 2 : Math.PI / 2
        };
        // The v3 plan already includes full-body constraints; consuming it
        // unchanged makes the visible preview exactly match the transaction.
        if (this.rulesVersion === 2) this._constrainGround(unit, x, y);
        this.state.units.push(unit);
        this._effect('spawn', unit.x, unit.y, team, c.radius + 9, 0.5, { cardId });
      });
    }
    this._event('card', team, `${team === 'player' ? '아군' : '상대'} · ${c.name}`, { cardId, x, y });
    return { ok: true, cardId };
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
    for (const team of ['player', 'enemy']) s.elixir[team] = Math.min(10, s.elixir[team] + generated);
    for (const entity of [...s.towers, ...s.units]) {
      entity.hitFlash = Math.max(0, (entity.hitFlash || 0) - dt * 5);
      entity.attackFlash = Math.max(0, (entity.attackFlash || 0) - dt * 6);
      entity.stunRemaining = Math.max(0, (entity.stunRemaining || 0) - dt);
      entity.frostRemaining = Math.max(0, (entity.frostRemaining || 0) - dt);
      entity.slowRemaining = Math.max(0, (entity.slowRemaining || 0) - dt);
      if (entity.slowRemaining <= EPS) entity.slowFactor = 1;
    }
    for (const effect of s.effects) { effect.life -= dt; effect.age += dt; }
    s.effects = s.effects.filter(e => e.life > 0);
    this._resolveDeaths();
    if (this._checkImmediateEnd()) return;
    this._updateAreas(dt);
    this._updateSpells(dt);
    this._updateUnits(dt);
    this._separateBodies();
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
    return attacker.targets === 'all' || !target.flying;
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

  _updateUnits(dt) {
    for (const u of this.state.units) {
      if (!alive(u)) continue;
      if (u.isBuilding && u.lifetime != null) {
        u.lifetime -= dt;
        u.hp = Math.max(0, u.hp - u.maxHp * dt / CARDS[u.cardId].duration);
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
        const innerHalf = Math.max(5, BRIDGE_HALF - u.radius - 1);
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
    const half = Math.max(5, BRIDGE_HALF - unit.radius - 1);
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
      if (distance(u, point) < 4) {
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
    const legalPoint = point => !(point.y > RIVER_TOP - padding && point.y < RIVER_BOTTOM + padding) || BRIDGES.some(x => Math.abs(point.x - x) < Math.max(5, BRIDGE_HALF - u.radius - 1));
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
    const innerHalf = Math.max(5, BRIDGE_HALF - u.radius - 1);
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
        } else this._applyHit(target, p.damage, p.team, p.targets);
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
      const c = CARDS[spell.cardId];
      let hits = [];
      if (c.persistent) {
        this.state.areas.push({ id: `a${++this._counter}`, team: spell.team, cardId: c.id,
          x: spell.x, y: spell.y, radius: c.spellRadius, life: c.duration, maxLife: c.duration,
          duration: c.duration, tickRemaining: c.tickInterval, tickInterval: c.tickInterval,
          ticksRemaining: Math.floor(c.duration / c.tickInterval), damage: c.damage, crownDamage: c.crownDamage,
          targets: c.targets, slowFactor: c.slowFactor, slowDuration: c.slowDuration });
        this._effect('spell', spell.x, spell.y, spell.team, c.spellRadius, 0.55, { cardId: spell.cardId });
      } else {
        hits = this._areaDamage(spell.team, spell.x, spell.y, c.spellRadius, c.damage, c.targets, c.crownDamage, c.knockback || 0, c);
        this._effect('spell', spell.x, spell.y, spell.team, c.spellRadius, c.duration, { cardId: spell.cardId });
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

  _areaDamage(team, x, y, radius, amount, targets = 'all', crownDamage = null, knockback = 0, status = {}) {
    const hits = [];
    for (const target of [...this.state.units, ...this.state.towers]) {
      if (!this._validTarget({ team, targets }, target)) continue;
      if (Math.hypot(target.x - x, target.y - y) > radius + target.radius * 0.65) continue;
      const previousHp = target.hp;
      this._applyHit(target, target.kind === 'tower' && crownDamage != null ? crownDamage : amount, team, targets, status);
      if (target.hp < previousHp) hits.push({ id: target.id, team: target.team, damage: previousHp - target.hp, killed: target.hp <= 0 });
      if (knockback > 0 && alive(target) && !target.isBuilding) {
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

  _damage(target, amount, team) {
    if (!alive(target) || amount <= 0) return;
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
