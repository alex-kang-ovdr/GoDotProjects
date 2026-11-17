/* Nexus Front: an original, dependency-free MOBA simulation. */
(function (root) {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sq = value => value * value;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isStructure = e => !!e && (e.type === 'tower' || e.type === 'inhibitor' || e.type === 'nexus');
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const TEAM_COLORS = ['#56e5d0', '#ff787b'];
  const LANE_NAMES = { top: '상단', mid: '중앙', bot: '하단', base: '기지' };
  let NAVIGATION = root.NexusNavigation || null;
  if (!NAVIGATION && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    try { NAVIGATION = require('./navigation.js'); } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }

  const MAP = {
    width: 1600,
    height: 1600,
    bases: [{ x: 165, y: 1435 }, { x: 1435, y: 165 }],
    lanes: {
      top: [[165, 1435], [165, 800], [165, 165], [800, 165], [1435, 165]],
      mid: [[165, 1435], [800, 800], [1435, 165]],
      bot: [[165, 1435], [800, 1435], [1435, 1435], [1435, 800], [1435, 165]]
    },
    brushes: [
      { x: 510, y: 980, r: 92 }, { x: 620, y: 700, r: 88 },
      { x: 980, y: 620, r: 88 }, { x: 1090, y: 900, r: 92 },
      { x: 165, y: 530, r: 75 }, { x: 1070, y: 165, r: 75 },
      { x: 530, y: 1435, r: 75 }, { x: 1435, y: 1070, r: 75 }
    ],
    obstacles: NAVIGATION ? NAVIGATION.WALLS : [],
    camps: [
      { id: 'camp-west', name: '숲의 파수꾼', x: 385, y: 1040, kind: 'camp' },
      { id: 'camp-east', name: '숲의 파수꾼', x: 1215, y: 560, kind: 'camp' },
      { id: 'camp-south', name: '바위 정령', x: 640, y: 1240, kind: 'camp' },
      { id: 'camp-north', name: '바위 정령', x: 960, y: 360, kind: 'camp' },
      { id: 'dragon', name: '폭풍 드래곤', x: 1080, y: 1080, kind: 'dragon' },
      { id: 'boss', name: '심연 거인', x: 520, y: 520, kind: 'boss' }
    ]
  };

  const MAP_SCALES = Object.freeze([1, 1.5, 2]);
  function normalizeMapScale(value) {
    const scale = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return MAP_SCALES.includes(scale) ? scale : 1;
  }

  // Geometry belongs to a match. Never resize the exported default MAP, since
  // previews, restored matches and tests can coexist in the same JavaScript VM.
  function createMap(value) {
    const scale = normalizeMapScale(value);
    const scalePoint = point => Object.assign({}, point, { x: point.x * scale, y: point.y * scale });
    const scaleCircle = circle => Object.assign(scalePoint(circle), { r: circle.r * scale });
    return {
      scale, width: MAP.width * scale, height: MAP.height * scale,
      bases: MAP.bases.map(scalePoint),
      lanes: Object.fromEntries(Object.entries(MAP.lanes).map(([lane, points]) => [lane, points.map(point => [point[0] * scale, point[1] * scale])])),
      brushes: MAP.brushes.map(scaleCircle),
      obstacles: MAP.obstacles.map(scaleCircle),
      camps: MAP.camps.map(scalePoint)
    };
  }

  const HEROES = [
    {
      id: 'mage', name: '리아', title: '별빛 마도사', role: '원거리 마법',
      color: '#bfa6ff', description: '긴 사거리의 별빛과 넓은 서리 지대로 전장을 통제합니다.',
      range: 285, hp: 780, damage: 45, mana: 460, armor: 12, speed: 167, attackSpeed: 0.86,
      skills: {
        q: { name: '별빛 탄환', description: '첫 적에게 마법 피해를 주고 잠시 둔화시킵니다.', icon: '✦', cooldown: 5, cost: 35, range: 620, radius: 18, target: 'direction' },
        w: { name: '서리 고리', description: '지정한 지역을 폭발시켜 광역 마법 피해와 둔화를 줍니다.', icon: '❄', cooldown: 10, cost: 55, range: 430, radius: 150, target: 'ground' },
        e: { name: '빛의 장막', description: '4초 동안 보호막과 이동 속도를 얻습니다.', icon: '◇', cooldown: 12, cost: 45, range: 0, radius: 90, target: 'self' },
        r: { name: '천공 낙하', description: '별을 떨어뜨려 넓은 지역에 큰 피해를 주고 기절시킵니다. 6레벨부터.', icon: '☄', cooldown: 28, cost: 90, range: 660, radius: 200, target: 'ground' }
      }
    },
    {
      id: 'warrior', name: '브란', title: '강철 선봉', role: '근접 전사',
      color: '#ffc879', description: '돌진과 보호막으로 적진을 흔들고 근접 교전을 이끕니다.',
      range: 82, hp: 1060, damage: 64, mana: 360, armor: 27, speed: 177, attackSpeed: 0.9,
      skills: {
        q: { name: '쇄도 베기', description: '전방으로 돌진하며 경로의 적을 베고 잠깐 기절시킵니다.', icon: '➤', cooldown: 7, cost: 35, range: 260, radius: 95, target: 'dash' },
        w: { name: '수호 태세', description: '큰 보호막과 추가 방어력을 얻어 공격을 견딥니다.', icon: '⬡', cooldown: 13, cost: 45, range: 0, radius: 85, target: 'self' },
        e: { name: '회전 타격', description: '주변 적을 베어 피해를 주고 둔화시킵니다.', icon: '↻', cooldown: 7, cost: 45, range: 170, radius: 170, target: 'self' },
        r: { name: '철벽 강습', description: '지정한 곳으로 뛰어들어 광역 피해와 기절을 주고 보호막을 얻습니다. 6레벨부터.', icon: '⚒', cooldown: 32, cost: 90, range: 430, radius: 190, target: 'dash' }
      }
    },
    {
      id: 'ranger', name: '키라', title: '바람 추적자', role: '원거리 공격',
      color: '#92e7aa', description: '빠른 기본 공격과 구르기로 거리를 유지하며 적을 압박합니다.',
      range: 320, hp: 750, damage: 57, mana: 380, armor: 10, speed: 184, attackSpeed: 1.12,
      skills: {
        q: { name: '관통 화살', description: '최대 세 명의 적을 관통하는 강력한 화살을 쏩니다.', icon: '➶', cooldown: 5, cost: 30, range: 720, radius: 16, target: 'direction' },
        w: { name: '연사 태세', description: '4.5초 동안 공격 속도가 크게 증가합니다.', icon: '≋', cooldown: 13, cost: 45, range: 0, radius: 75, target: 'self' },
        e: { name: '바람 구르기', description: '지정 방향으로 구르고 다음 기본 공격을 강화합니다.', icon: '»', cooldown: 8, cost: 35, range: 260, radius: 30, target: 'dash' },
        r: { name: '화살비', description: '넓은 지역에 6번의 화살비를 내려 피해와 둔화를 줍니다. 6레벨부터.', icon: '⋮', cooldown: 30, cost: 85, range: 700, radius: 200, target: 'ground' }
      }
    }
  ];

  const ITEMS = [
    { id: 'blade', name: '새벽의 검', description: '공격력 +20. 기본 공격과 전사의 스킬을 강화합니다.', cost: 420, icon: '⚔', color: '#f6bd7c', stats: { damage: 20 } },
    { id: 'focus', name: '별빛 수정', description: '주문력 +50, 최대 마나 +100.', cost: 500, icon: '✦', color: '#c1a1ff', stats: { abilityPower: 50, maxMana: 100 } },
    { id: 'bow', name: '폭풍 활', description: '공격 속도 +40%, 공격력 +9.', cost: 550, icon: '➶', color: '#9de6bb', stats: { attackSpeed: 0.4, damage: 9 } },
    { id: 'heart', name: '거인의 심장', description: '최대 체력 +300. 잃은 체력에 같은 양을 더합니다.', cost: 480, icon: '♥', color: '#ff9f98', stats: { maxHp: 300 } },
    { id: 'plate', name: '강철 갑주', description: '방어력 +25, 최대 체력 +100.', cost: 520, icon: '⬡', color: '#9ab8d4', stats: { armor: 25, maxHp: 100 } },
    { id: 'boots', name: '바람 장화', description: '이동 속도 +32, 공격 속도 +10%.', cost: 400, icon: '»', color: '#8fdedc', stats: { speed: 32, attackSpeed: 0.1 } },
    { id: 'crown', name: '황혼의 관', description: '별빛 수정에서 조합. 주문력 +85, 최대 체력 +120, 최대 마나 +100.', cost: 740, components: ['focus'], icon: '♜', color: '#dcb1ff', stats: { abilityPower: 85, maxHp: 120, maxMana: 100 } },
    { id: 'edge', name: '선봉의 칼날', description: '새벽의 검에서 조합. 공격력 +34, 최대 체력 +180.', cost: 720, components: ['blade'], icon: '⚡', color: '#ffd88b', stats: { damage: 34, maxHp: 180 } }
  ];
  const HERO_BY_ID = Object.assign(Object.create(null), Object.fromEntries(HEROES.map(h => [h.id, h])));
  const ITEM_BY_ID = Object.assign(Object.create(null), Object.fromEntries(ITEMS.map(item => [item.id, item])));
  const SAVE_FIELDS = [
    'difficulty', 'mapScale', 'seed', '_randomState', 'time', 'started', 'paused', 'over', 'winner', 'endReason',
    'waveNumber', 'nextWaveAt', 'teamKills', 'teamBuffs', 'order', 'entities', 'projectiles',
    'effects', 'floaters', 'events', '_pending', '_hazards', '_damageHistory', '_deathRecap',
    '_ids', '_eventIds', '_input', '_moveDestination', '_attackMoveDestination', '_playerTargetId',
    '_attackMoveTargetId', '_focusTargetId', '_cleanupAt', '_goldTickAt', '_siegeAnnounced', '_lastError', '_lastErrorAt'
  ];
  const SAVE_OPTIONAL_FIELDS = new Set(['_attackMoveTargetId', '_lastError', '_lastErrorAt']);
  const SAVE_ENTITY_TYPES = new Set(['hero', 'minion', 'tower', 'inhibitor', 'nexus', 'monster', 'ward']);
  const saveError = detail => new Error('저장된 경기 데이터가 올바르지 않습니다. (' + detail + ')');
  function saveAssert(condition, detail) { if (!condition) throw saveError(detail); }
  const saveObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const saveNumber = (value, low = 0, high = 1e9) => finite(value) && value >= low && value <= high;
  const saveId = value => typeof value === 'string' && value.length > 0 && value.length <= 96;
  const savePoint = (value, map) => saveObject(value) && saveNumber(value.x, 0, map.width) && saveNumber(value.y, 0, map.height);

  // Clone only bounded JSON data. Reject non-finite values before JSON.stringify
  // could silently turn them into null; never import prototypes or executable data.
  function copySaveData(value) {
    let nodes = 0;
    const visit = (entry, depth) => {
      saveAssert(++nodes <= 150000 && depth <= 14, 'data limit');
      if (entry === null || typeof entry === 'boolean') return entry;
      if (typeof entry === 'number') { saveAssert(finite(entry) && Math.abs(entry) <= 1e12, 'non-finite number'); return entry; }
      if (typeof entry === 'string') { saveAssert(entry.length <= 4096, 'text limit'); return entry; }
      if (Array.isArray(entry)) { saveAssert(entry.length <= 2048, 'array limit'); return entry.map(item => visit(item, depth + 1)); }
      saveAssert(saveObject(entry) && (Object.getPrototypeOf(entry) === Object.prototype || Object.getPrototypeOf(entry) === null), 'non-JSON data');
      const keys = Object.keys(entry), result = {};
      saveAssert(keys.length <= 512, 'object limit');
      for (const key of keys) {
        saveAssert(!['__proto__', 'prototype', 'constructor'].includes(key), 'unsafe key');
        if (entry[key] !== undefined) result[key] = visit(entry[key], depth + 1);
      }
      return result;
    };
    return visit(value, 0);
  }

  function validateSaveEntity(entity, engineVersion, map) {
    saveAssert(saveObject(entity) && saveId(entity.id) && SAVE_ENTITY_TYPES.has(entity.type), 'entity identity');
    saveAssert([0, 1, 2].includes(entity.team) && typeof entity.name === 'string' && savePoint(entity, map), 'entity position');
    saveAssert(saveNumber(entity.r, 1, 160) && saveNumber(entity.maxHp, 1, 1e8) && saveNumber(entity.hp, 0, entity.maxHp + 1e-6), 'entity health');
    saveAssert(typeof entity.alive === 'boolean' && (!entity.alive || entity.hp > 0) && saveNumber(entity.shield) && saveNumber(entity.armor, -100, 1e5), 'entity status');
    if (entity.type === 'monster') saveAssert(entity.team === 2 && ['camp', 'dragon', 'boss'].includes(entity.kind), 'monster identity');
    else saveAssert(entity.team < 2, 'team identity');
    if (entity.navPath !== undefined) saveAssert(Array.isArray(entity.navPath) && entity.navPath.length <= 128 && entity.navPath.every(point => savePoint(point, map)), 'navigation path');
    for (const key of ['aiMove', '_navGoal', '_hazardEscape']) if (entity[key] != null) saveAssert(savePoint(entity[key], map), 'navigation goal');
    for (const key of ['targetId', 'ownerId', '_hazardEscapeId', 'aggroTargetId', 'rampTargetId', 'lastHeroHitId']) {
      if (entity[key] != null) saveAssert(saveId(entity[key]), 'entity reference');
    }
    if (['hero', 'minion', 'tower', 'monster'].includes(entity.type)) {
      for (const key of ['damage', 'range', 'attackSpeed', 'attackCooldown', 'attackProgress']) saveAssert(saveNumber(entity[key]), 'attack state');
    }
    if (['hero', 'minion', 'monster'].includes(entity.type)) saveAssert(saveNumber(entity.speed, 0, 1000), 'movement speed');
    if (entity.type === 'hero') {
      if (engineVersion >= 6) {
        saveAssert(saveNumber(entity.attackPeriod, 0.05, 20) && Object.hasOwn(entity, 'attackWindup'), 'hero attack cycle');
        saveAssert(entity.attackCooldown <= entity.attackPeriod + 1e-6, 'hero attack recovery');
        if (entity.attackWindup !== null) {
          const attack = entity.attackWindup;
          saveAssert(saveObject(attack) && saveId(attack.targetId) && saveNumber(attack.period, 0.05, 20) &&
            saveNumber(attack.duration, 0.1, 0.32) && saveNumber(attack.remaining, 1e-9, attack.duration) &&
            Math.abs(attack.period - entity.attackPeriod) < 1e-6 &&
            Math.abs(attack.duration - clamp(attack.period * 0.25, 0.1, 0.32)) < 1e-6 &&
            Math.abs(entity.attackCooldown - (attack.period - attack.duration + attack.remaining)) < 1e-6 &&
            entity.alive, 'hero attack windup');
        }
      }
      saveAssert(HERO_BY_ID[entity.hero] && typeof entity.isPlayer === 'boolean' && typeof entity.role === 'string' && ['top', 'mid', 'bot'].includes(entity.lane), 'hero identity');
      saveAssert(Number.isInteger(entity.level) && saveNumber(entity.level, 1, 18), 'hero level');
      for (const key of ['xp', 'nextXp', 'gold', 'mana', 'maxMana', 'abilityPower', 'respawnIn', 'respawnAt', 'recallLeft', 'recallDuration',
        'kills', 'deaths', 'assists', 'cs', 'streak', 'damageDealt', 'purchaseAt', 'shieldUntil', 'slowUntil', 'slowFactor',
        'stunnedUntil', 'revealedUntil', 'hasteUntil', 'guardUntil', 'rapidUntil', 'nextAttackBonus', 'laneProgress']) saveAssert(saveNumber(entity[key]), 'hero numeric state');
      saveAssert(entity.mana <= entity.maxMana + 1e-6 && typeof entity.autoAttack === 'boolean' && typeof entity.retreating === 'boolean' && finite(entity.aiThinkIn) && finite(entity.lastDamageAt), 'hero action state');
      saveAssert(Array.isArray(entity.inventory) && entity.inventory.length <= 6 && entity.inventory.every(id => typeof id === 'string' && !!ITEM_BY_ID[id]), 'inventory');
      saveAssert(saveObject(entity.cd) && ['q', 'w', 'e', 'r', 'd', 'f', 'ward'].every(key => saveNumber(entity.cd[key], 0, 3600)), 'cooldowns');
      saveAssert(saveObject(entity.skillRanks) && Number.isInteger(entity.skillPoints) && saveNumber(entity.skillPoints, 0, 18), 'skill points');
      for (const key of ['q', 'w', 'e', 'r']) saveAssert(Number.isInteger(entity.skillRanks[key]) && saveNumber(entity.skillRanks[key], 0, key === 'r' ? 3 : 5), 'skill ranks');
      saveAssert(entity.skillPoints + ['q', 'w', 'e', 'r'].reduce((sum, key) => sum + entity.skillRanks[key], 0) === entity.level, 'skill conservation');
      saveAssert(entity.skillRanks.q >= 1 && ['q', 'w', 'e'].every(key => entity.skillRanks[key] <= Math.ceil(entity.level / 2)) && entity.skillRanks.r <= [6, 11, 16].filter(level => entity.level >= level).length, 'skill unlock level');
      saveAssert(saveObject(entity.contributors) && Object.entries(entity.contributors).every(([id, at]) => saveId(id) && saveNumber(at)), 'damage contributors');
    } else if (entity.type === 'minion') {
      saveAssert(['melee', 'ranged', 'siege', 'super'].includes(entity.kind) && ['top', 'mid', 'bot'].includes(entity.lane), 'minion identity');
      for (const key of ['goldValue', 'xpValue', 'laneProgress', 'expiresAt', 'slowUntil', 'slowFactor', 'stunnedUntil']) saveAssert(saveNumber(entity[key]), 'minion state');
      saveAssert(finite(entity.thinkIn) && finite(entity.laneOffset), 'minion movement');
    } else if (entity.type === 'monster') {
      for (const key of ['homeX', 'homeY', 'initialMaxHp', 'respawnAt', 'respawnIn', 'leash', 'nextHazardAt']) saveAssert(saveNumber(entity[key]), 'monster state');
      saveAssert(savePoint({ x: entity.homeX, y: entity.homeY }, map), 'monster home');
      saveAssert(typeof entity.inCombat === 'boolean', 'monster combat');
    } else if (entity.type === 'tower') {
      saveAssert(['outer', 'inner', 'base'].includes(entity.structureTier) && Number.isInteger(entity.rampStacks) && saveNumber(entity.rampStacks, 0, 3) && saveNumber(entity.rampUntil), 'tower state');
    } else if (entity.type === 'ward') saveAssert(saveNumber(entity.expiresAt) && saveId(entity.ownerId), 'ward state');
  }

  function validateSaveState(checkpoint, initialGame) {
    saveAssert(checkpoint.version === 1 && [4, 5, 6, 7].includes(checkpoint.engineVersion) && checkpoint.playerId === 'player', 'unsupported version');
    const state = checkpoint.state;
    const map = initialGame.map;
    saveAssert(saveObject(state), 'missing state');
    for (const key of SAVE_FIELDS) saveAssert(SAVE_OPTIONAL_FIELDS.has(key) || (checkpoint.engineVersion === 4 && key === '_focusTargetId') || (checkpoint.engineVersion < 7 && key === 'mapScale') || Object.hasOwn(state, key), 'missing ' + key);
    if (checkpoint.engineVersion >= 7) saveAssert(MAP_SCALES.includes(state.mapScale) && state.mapScale === initialGame.mapScale, 'map scale');
    else saveAssert(!Object.hasOwn(state, 'mapScale') || state.mapScale === 1, 'legacy map scale');
    saveAssert(state.started === true && state.over === false && state.winner === null && state.endReason === null && typeof state.paused === 'boolean', 'inactive match');
    saveAssert(['easy', 'normal', 'hard'].includes(state.difficulty) && Number.isInteger(state.seed) && saveNumber(state.seed, 1, 0xffffffff) && Number.isInteger(state._randomState) && saveNumber(state._randomState, 1, 0xffffffff), 'random state');
    saveAssert(saveNumber(state.time, 0, 86400) && saveNumber(state.nextWaveAt) && Number.isInteger(state.waveNumber) && saveNumber(state.waveNumber, 1, 10000), 'match clock');
    for (const key of ['_ids', '_eventIds']) saveAssert(Number.isInteger(state[key]) && saveNumber(state[key]), 'identifier counter');
    saveAssert(saveNumber(state._cleanupAt) && saveNumber(state._goldTickAt) && typeof state._siegeAnnounced === 'boolean', 'scheduled ticks');
    saveAssert(Array.isArray(state.teamKills) && state.teamKills.length === 2 && state.teamKills.every(value => Number.isInteger(value) && saveNumber(value)), 'team kills');
    saveAssert(Array.isArray(state.teamBuffs) && state.teamBuffs.length === 2 && state.teamBuffs.every(value => saveObject(value) && Number.isInteger(value.dragonStacks) && saveNumber(value.dragonStacks, 0, 4) && saveNumber(value.bossUntil)), 'team buffs');
    saveAssert(saveObject(state._input) && finite(state._input.x) && finite(state._input.y) && Math.hypot(state._input.x, state._input.y) <= 1.000001, 'held input');
    for (const key of ['_moveDestination', '_attackMoveDestination']) saveAssert(state[key] === null || savePoint(state[key], map), 'player destination');
    for (const key of ['_playerTargetId', '_attackMoveTargetId']) if (state[key] != null) saveAssert(saveId(state[key]), 'player target');
    if (checkpoint.engineVersion >= 5) saveAssert(state._focusTargetId === null || saveId(state._focusTargetId), 'focus target');
    if (state.order !== null) saveAssert(savePoint(state.order, map) && ['rally', 'push', 'defend', 'dragon', 'boss'].includes(state.order.type) && saveNumber(state.order.expiresAt), 'team order');
    const bounds = { entities: 512, projectiles: 1024, effects: 130, floaters: 100, events: 20, _pending: 256, _hazards: 64, _damageHistory: 256 };
    for (const [key, limit] of Object.entries(bounds)) saveAssert(Array.isArray(state[key]) && state[key].length <= limit, key + ' limit');
    saveAssert(Array.isArray(checkpoint.sources) && checkpoint.sources.length <= 128, 'source limit');
    const entities = new Map();
    for (const entity of state.entities) { validateSaveEntity(entity, checkpoint.engineVersion, map); saveAssert(!entities.has(entity.id), 'duplicate entity'); entities.set(entity.id, entity); }
    for (const original of initialGame.entities) {
      const saved = entities.get(original.id);
      saveAssert(saved && saved.type === original.type && saved.team === original.team && (saved.type !== 'hero' || saved.hero === original.hero), 'incomplete world');
    }
    saveAssert(state.entities.filter(entity => entity.type === 'hero').length === 10 && state.entities.filter(entity => entity.isPlayer).length === 1 && entities.get('player').isPlayer, 'player identity');
    if (checkpoint.engineVersion >= 5 && state._focusTargetId !== null) {
      const focus = entities.get(state._focusTargetId);
      saveAssert(focus && focus.type === 'hero' && focus.team === 1, 'focus identity');
    }
    saveAssert(entities.get('nexus-0').alive && entities.get('nexus-1').alive, 'completed battlefield');
    const sources = new Map(entities);
    for (const source of checkpoint.sources) { validateSaveEntity(source, checkpoint.engineVersion, map); saveAssert(!sources.has(source.id), 'duplicate source'); sources.set(source.id, source); }
    if (checkpoint.engineVersion >= 6) for (const source of sources.values()) {
      if (source.type !== 'hero' || source.attackWindup === null) continue;
      const target = entities.get(source.attackWindup.targetId);
      saveAssert(target && target.team !== source.team && target.id !== source.id, 'windup target');
    }
    const attackIds = new Set(sources.keys());
    for (const shot of state.projectiles) {
      saveAssert(saveObject(shot) && saveId(shot.id) && !attackIds.has(shot.id) && sources.has(shot.sourceId) && !Object.hasOwn(shot, 'source'), 'projectile source');
      attackIds.add(shot.id);
      for (const key of ['x', 'y', 'vx', 'vy']) saveAssert(finite(shot[key]), 'projectile movement');
      for (const key of ['speed', 'damage', 'r', 'life', 'maxLife']) saveAssert(saveNumber(shot[key]), 'projectile state');
      saveAssert(shot.team === sources.get(shot.sourceId).team && typeof shot.homing === 'boolean' && ['physical', 'magic', 'true'].includes(shot.damageType), 'projectile attack');
      if (shot.homing) saveAssert(saveId(shot.targetId), 'projectile target');
      else saveAssert(Array.isArray(shot.hitIds) && shot.hitIds.length <= 128 && shot.hitIds.every(saveId) && new Set(shot.hitIds).size === shot.hitIds.length && saveNumber(shot.remainingRange) && Number.isInteger(shot.remainingHits) && saveNumber(shot.remainingHits, 1, 3), 'piercing projectile');
    }
    for (const action of state._pending) saveAssert(saveObject(action) && action.kind === 'area' && sources.has(action.sourceId) && !Object.hasOwn(action, 'source') && savePoint(action, map) && saveNumber(action.radius, 0, 1000) && saveNumber(action.damage) && saveNumber(action.at) && ['physical', 'magic', 'true'].includes(action.damageType), 'scheduled area');
    for (const hazard of state._hazards) {
      saveAssert(saveObject(hazard) && saveId(hazard.id) && !attackIds.has(hazard.id) && entities.get(hazard.sourceId)?.type === 'monster' && savePoint(hazard, map) && saveNumber(hazard.radius, 0, 1000) && saveNumber(hazard.damage) && saveNumber(hazard.startsAt) && saveNumber(hazard.at, hazard.startsAt) && ['physical', 'magic', 'true'].includes(hazard.damageType), 'neutral hazard');
      attackIds.add(hazard.id);
    }
    for (const id of attackIds) {
      const generated = /^(?:minion|shot|spell|ward|hazard)-(\d+)$/.exec(id);
      if (generated) saveAssert(Number(generated[1]) <= state._ids, 'identifier counter collision');
    }
    for (const event of state.events) saveAssert(saveObject(event) && Number.isInteger(event.id) && saveNumber(event.id, 1, state._eventIds) && typeof event.text === 'string' && ['info', 'good', 'bad'].includes(event.tone) && saveNumber(event.at), 'event log');
    for (const effect of state.effects) saveAssert(saveObject(effect) && typeof effect.kind === 'string' && finite(effect.x) && finite(effect.y) && saveNumber(effect.r) && saveNumber(effect.life) && saveNumber(effect.maxLife), 'visual effect');
    for (const floater of state.floaters) saveAssert(saveObject(floater) && typeof floater.text === 'string' && finite(floater.x) && finite(floater.y) && saveNumber(floater.life) && saveNumber(floater.maxLife), 'damage text');
    for (const hit of state._damageHistory) saveAssert(saveObject(hit) && saveNumber(hit.at) && saveId(hit.sourceId) && typeof hit.sourceName === 'string' && typeof hit.sourceType === 'string' && saveNumber(hit.damage) && saveNumber(hit.absorbed) && ['physical', 'magic', 'true'].includes(hit.kind), 'damage history');
    if (state._deathRecap !== null) {
      const recap = state._deathRecap;
      saveAssert(saveObject(recap) && saveNumber(recap.at) && typeof recap.killerName === 'string' && saveNumber(recap.totalDamage) && saveNumber(recap.totalAbsorbed) && recap.windowSeconds === 10 && Array.isArray(recap.sources) && recap.sources.length <= 12, 'death recap');
      for (const source of recap.sources) saveAssert(saveObject(source) && saveId(source.sourceId) && typeof source.sourceName === 'string' && ['damage', 'absorbed', 'hits', 'physical', 'magic', 'true'].every(key => saveNumber(source[key])), 'death recap source');
    }
    return sources;
  }
  function buildPaths(map) {
    const paths = {};
    for (const [name, points] of Object.entries(map.lanes)) {
      const lengths = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const length = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
        lengths.push(length);
        total += length;
      }
      paths[name] = { points, lengths, total };
    }
    return paths;
  }

  function pathPoint(paths, lane, progress, offset) {
    const path = paths[lane] || paths.mid;
    let remaining = clamp(progress, 0, 1) * path.total;
    for (let i = 0; i < path.lengths.length; i++) {
      const a = path.points[i], b = path.points[i + 1], len = path.lengths[i];
      if (remaining <= len || i === path.lengths.length - 1) {
        const t = clamp(remaining / len, 0, 1);
        const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
        return { x: a[0] + (b[0] - a[0]) * t - dy * (offset || 0), y: a[1] + (b[1] - a[1]) * t + dx * (offset || 0) };
      }
      remaining -= len;
    }
    const center = path.points[Math.floor(path.points.length / 2)];
    return { x: center[0], y: center[1] };
  }

  function pathProgress(paths, lane, x, y) {
    const path = paths[lane] || paths.mid;
    let bestDistance = Infinity, best = 0, traveled = 0;
    for (let i = 0; i < path.lengths.length; i++) {
      const a = path.points[i], b = path.points[i + 1], len = path.lengths[i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (len * len), 0, 1);
      const d = sq(x - a[0] - dx * t) + sq(y - a[1] - dy * t);
      if (d < bestDistance) { bestDistance = d; best = (traveled + len * t) / path.total; }
      traveled += len;
    }
    return best;
  }

  function segmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  class Game {
    constructor(options) {
      options = options || {};
      this.difficulty = ['easy', 'normal', 'hard'].includes(options.difficulty) ? options.difficulty : 'normal';
      this.mapScale = normalizeMapScale(options.mapScale);
      this.map = createMap(this.mapScale);
      this._paths = buildPaths(this.map);
      this.seed = (Number(options.seed) >>> 0) || 73217;
      this._randomState = this.seed;
      this.time = 0;
      this.started = false;
      this.paused = false;
      this.over = false;
      this.winner = null;
      this.endReason = null;
      this.waveNumber = 0;
      this.nextWaveAt = 0;
      this.teamKills = [0, 0];
      this.teamBuffs = [{ dragonStacks: 0, bossUntil: 0 }, { dragonStacks: 0, bossUntil: 0 }];
      this.navigation = NAVIGATION ? new NAVIGATION.Navigation({ width: this.map.width, height: this.map.height, cellSize: 40 * this.mapScale, obstacles: this.map.obstacles }) : null;
      this._movementNavigation = this.navigation;
      this._structureNavKey = null;
      this.order = null;
      this.entities = [];
      this.projectiles = [];
      this.effects = [];
      this.floaters = [];
      this.events = [];
      this._pending = [];
      this._hazards = [];
      this._damageHistory = [];
      this._deathRecap = null;
      this._ids = 0;
      this._eventIds = 0;
      this._grid = new Map();
      this._byId = new Map();
      this._vision = [[], []];
      this._input = { x: 0, y: 0 };
      this._moveDestination = null;
      this._attackMoveDestination = null;
      this._playerTargetId = null;
      this._focusTargetId = null;
      this._cleanupAt = 1;
      this._goldTickAt = 1;
      this._siegeAnnounced = false;
      this._buildStructures();
      this._buildMonsters();
      const selectedHero = HERO_BY_ID[options.hero] ? options.hero : 'mage';
      this.player = this._makeHero(selectedHero, 0, 'mid', 'player', true);
      this.player.x = 560 * this.mapScale;
      this.player.y = 1040 * this.mapScale;
      this.player.laneProgress = pathProgress(this._paths, 'mid', this.player.x, this.player.y);
      this._makeHero('warrior', 0, 'top', 'top');
      this._makeHero('warrior', 0, 'mid', 'jungle');
      this._makeHero('ranger', 0, 'bot', 'bot');
      this._makeHero('mage', 0, 'bot', 'support');
      this._makeHero('mage', 1, 'mid', 'mid');
      this._makeHero('warrior', 1, 'top', 'top');
      this._makeHero('warrior', 1, 'mid', 'jungle');
      this._makeHero('ranger', 1, 'bot', 'bot');
      this._makeHero('mage', 1, 'bot', 'support');
      for (const entity of this.entities) if (!isStructure(entity)) {
        const safe = this._safePoint(entity.x, entity.y, entity.r);
        entity.x = safe.x; entity.y = safe.y;
      }
      this._rebuildIndex();
    }

    exportState() {
      if (!this.started || this.over) throw saveError('only active matches can be saved');
      this.getFocusTarget(); // Do not save a stale lock after death, vision loss, or range exit.
      const state = {}, existing = new Map(this.entities.map(entity => [entity.id, entity])), detached = new Map();
      for (const key of SAVE_FIELDS) if (this[key] !== undefined) state[key] = this[key];
      const serializeAttack = attack => {
        const source = attack.source;
        saveAssert(source && saveId(source.id), 'missing attack source');
        if (!existing.has(source.id)) detached.set(source.id, source);
        const saved = Object.assign({}, attack, { source: undefined, sourceId: source.id });
        if (attack.hitIds instanceof Set) saved.hitIds = [...attack.hitIds];
        return saved;
      };
      state.projectiles = this.projectiles.map(serializeAttack);
      state._pending = this._pending.map(serializeAttack);
      return copySaveData({ version: 1, engineVersion: 7, playerId: this.player.id, state, sources: [...detached.values()] });
    }

    static fromState(checkpoint, options) {
      const saved = copySaveData(checkpoint);
      saveAssert(saveObject(saved) && saveObject(saved.state), 'missing checkpoint');
      const player = Array.isArray(saved.state.entities) && saved.state.entities.find(entity => entity && entity.id === saved.playerId);
      saveAssert(player && HERO_BY_ID[player.hero], 'missing player');
      const mapScale = saved.engineVersion >= 7 ? saved.state.mapScale : 1;
      saveAssert(MAP_SCALES.includes(mapScale), 'map scale');
      const game = new Game({ hero: player.hero, difficulty: saved.state.difficulty, seed: saved.state.seed, mapScale });
      const sources = validateSaveState(saved, game);
      for (const key of SAVE_FIELDS) if (Object.hasOwn(saved.state, key)) game[key] = saved.state[key];
      game.player = sources.get(saved.playerId);
      if (saved.engineVersion === 4) game._focusTargetId = null;
      if (saved.engineVersion < 6) for (const entity of sources.values()) if (entity.type === 'hero') {
        // Older releases fired immediately. Preserve their outstanding recovery
        // and in-flight shots; never invent a second, pending copy of an attack.
        entity.attackWindup = null;
        const period = 1 / game._attackSpeed(entity);
        entity.attackPeriod = Math.max(period, entity.attackCooldown + clamp(period * 0.25, 0.1, 0.32));
      }
      for (const shot of game.projectiles) {
        shot.source = sources.get(shot.sourceId);
        if (!shot.homing) shot.hitIds = new Set(shot.hitIds);
      }
      for (const action of game._pending) action.source = sources.get(action.sourceId);
      // Spatial indexes and the structure navigation cache are derived data.
      // Rebuilding them consumes no random values and preserves AI path timers.
      game._structureNavKey = null;
      game._rebuildIndex();
      game.getFocusTarget();
      game.paused = !options || options.paused !== false;
      if (!options || options.clearInput !== false) game._input = { x: 0, y: 0 };
      return game;
    }

    _random() {
      let x = this._randomState;
      x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
      this._randomState = x >>> 0;
      return (this._randomState >>> 0) / 4294967296;
    }

    _id(prefix) { return prefix + '-' + (++this._ids); }

    _add(entity) {
      this.entities.push(entity);
      this._byId.set(entity.id, entity);
      return entity;
    }

    _buildStructures() {
      for (let team = 0; team < 2; team++) {
        for (const lane of ['top', 'mid', 'bot']) {
          for (const tier of ['outer', 'inner']) {
            const progress = tier === 'outer' ? 0.34 : 0.19;
            const pos = pathPoint(this._paths, lane, team === 0 ? progress : 1 - progress);
            const maxHp = tier === 'outer' ? 2200 : 3000;
            this._add({ id: 'tower-' + team + '-' + lane + '-' + tier, type: 'tower', team, lane, structureTier: tier,
              kind: tier, name: LANE_NAMES[lane] + (tier === 'outer' ? ' 외곽 포탑' : ' 안쪽 포탑'),
              x: pos.x, y: pos.y, r: 34, hp: maxHp, maxHp, alive: true, shield: 0, armor: 24,
              damage: tier === 'outer' ? 94 : 108, range: 340, attackSpeed: 0.82, attackCooldown: 0, attackProgress: 1, targetId: null,
              rampStacks: 0, rampTargetId: null, rampUntil: 0, facing: team === 0 ? -0.78 : 2.36 });
          }
          const pos = pathPoint(this._paths, lane, team === 0 ? 0.08 : 0.92);
          this._add({ id: 'inhibitor-' + team + '-' + lane, type: 'inhibitor', team, lane, kind: 'inhibitor',
            name: LANE_NAMES[lane] + ' 억제기', x: pos.x, y: pos.y, r: 29, hp: 1500, maxHp: 1500, alive: true, shield: 0, armor: 8 });
        }
        const base = this.map.bases[team], direction = team === 0 ? 1 : -1;
        const points = [{ x: base.x + 95 * direction * this.mapScale, y: base.y - 25 * direction * this.mapScale }, { x: base.x + 25 * direction * this.mapScale, y: base.y - 95 * direction * this.mapScale }];
        points.forEach((pos, i) => this._add({ id: 'tower-' + team + '-base-' + i, type: 'tower', team, lane: 'base', structureTier: 'base', kind: 'base',
          name: '기지 수호 포탑', x: pos.x, y: pos.y, r: 34, hp: 3200, maxHp: 3200, alive: true, armor: 20, shield: 0,
          damage: 116, range: 345, attackSpeed: 0.86, attackCooldown: 0.4 * i, attackProgress: 1, targetId: null,
          rampStacks: 0, rampTargetId: null, rampUntil: 0, facing: team === 0 ? -0.78 : 2.36 }));
        this._add({ id: 'nexus-' + team, type: 'nexus', team, lane: 'base', kind: 'nexus', name: team === 0 ? '아군 넥서스' : '적 넥서스',
          x: base.x, y: base.y, r: 57, hp: 5500, maxHp: 5500, alive: true, armor: 10, shield: 0 });
      }
    }

    _buildMonsters() {
      for (const camp of this.map.camps) {
        const boss = camp.kind === 'boss', dragon = camp.kind === 'dragon';
        const hp = boss ? 2450 : dragon ? 1550 : 390;
        const spawnAt = boss ? 120 : dragon ? 45 : 0;
        this._add({ id: camp.id, type: 'monster', team: 2, name: camp.name, kind: camp.kind, lane: null,
          x: camp.x, y: camp.y, homeX: camp.x, homeY: camp.y, r: boss ? 53 : dragon ? 44 : 27,
          hp, maxHp: hp, initialMaxHp: hp, alive: spawnAt === 0, shield: 0, armor: boss ? 22 : dragon ? 16 : 8,
          damage: boss ? 100 : dragon ? 67 : 30, range: boss ? 200 : dragon ? 155 : 70,
          speed: boss ? 68 : dragon ? 85 : 115, attackSpeed: boss ? 0.8 : 0.9, attackCooldown: 0,
          attackProgress: 1, targetId: null, respawnAt: spawnAt, respawnIn: spawnAt, leash: boss || dragon ? 330 : 260,
          inCombat: false, nextHazardAt: 0 });
      }
    }

    _makeHero(heroId, team, lane, role, isPlayer) {
      const template = HERO_BY_ID[heroId];
      const progress = team === 0 ? 0.335 : 0.665;
      const pos = pathPoint(this._paths, lane, progress, role === 'support' ? 32 : 0);
      if (role === 'jungle') { pos.x = (team === 0 ? 440 : 1160) * this.mapScale; pos.y = (team === 0 ? 1120 : 480) * this.mapScale; }
      const hero = this._add({ id: isPlayer ? 'player' : 'hero-' + team + '-' + role, type: 'hero', hero: heroId, team, lane, role,
        name: template.name + (isPlayer ? '' : role === 'support' ? ' · 지원' : ''), isPlayer: !!isPlayer,
        x: pos.x, y: pos.y, r: 19, level: 1, xp: 0, nextXp: 110, gold: 600, inventory: [],
        hp: template.hp, maxHp: template.hp, mana: template.mana, maxMana: template.mana,
        damage: template.damage, abilityPower: 0, armor: template.armor, range: template.range, speed: template.speed, attackSpeed: template.attackSpeed,
        alive: true, shield: 0, shieldUntil: 0, respawnIn: 0, recallLeft: 0, recallDuration: 4,
        kills: 0, deaths: 0, assists: 0, cs: 0, streak: 0, damageDealt: 0,
        cd: { q: 0, w: 0, e: 0, r: 0, d: 0, f: 0, ward: 0 }, autoAttack: true,
        skillRanks: { q: 1, w: 0, e: 0, r: 0 }, skillPoints: 0, navPath: [], buildIndex: 0,
        attackCooldown: 0, attackProgress: 1, attackPeriod: 1 / template.attackSpeed, attackWindup: null,
        targetId: null, facing: team === 0 ? -Math.PI / 4 : Math.PI * 0.75,
        laneProgress: progress, aiThinkIn: this._random() * 0.22, aiMove: null, retreating: false,
        slowUntil: 0, slowFactor: 1, stunnedUntil: 0, revealedUntil: 0, hasteUntil: 0,
        guardUntil: 0, rapidUntil: 0, nextAttackBonus: 0, lastDamageAt: -100,
        contributors: {}, purchaseAt: 0, respawnAt: 0 });
      this._recalculate(hero);
      return hero;
    }

    start() {
      if (this.started || this.over) return this;
      this.started = true;
      this._spawnWave();
      this.nextWaveAt = 18;
      this._event('전선 개방 · 세 공격로의 미니언이 진격합니다.', 'info');
      return this;
    }

    surrender() {
      if (!this.started) return { ok: false, reason: '경기를 시작한 뒤 항복할 수 있습니다.' };
      if (this.over) return { ok: false, reason: '이미 종료된 경기입니다.' };
      this.over = true; this.winner = 1; this.endReason = 'surrender';
      this.order = null; this._hazards = []; this._pending = [];
      this.stop();
      for (const hero of this.entities) if (hero.type === 'hero') {
        this._cancelAttack(hero);
        hero.targetId = null; hero.aiMove = null; hero.recallLeft = 0; hero.orderType = null;
        this._clearPath(hero);
      }
      this._event('항복 · 경기를 종료했습니다.', 'bad');
      return { ok: true };
    }

    step(dt) {
      if (!this.started || this.paused || this.over || !finite(dt) || dt <= 0) return;
      let remaining = Math.min(dt, 30);
      while (remaining > 0.0000001 && !this.over) {
        const delta = Math.min(remaining, 1 / 30);
        this._step(delta);
        remaining -= delta;
      }
    }

    _step(dt) {
      this.time += dt;
      if (this.order && this.time >= this.order.expiresAt) this.order = null;
      this._rebuildIndex();
      this.getFocusTarget();
      this._validateObjectiveOrder();
      if (this.time >= this.nextWaveAt) { this._spawnWave(); this.nextWaveAt = this.time + 18; }
      if (!this._siegeAnnounced && this.time >= 270) {
        this._siegeAnnounced = true;
        this._event('결전의 시간 · 모든 웨이브에 공성 미니언이 합류합니다.', 'info');
      }
      if (this.time >= this._goldTickAt) {
        this._goldTickAt += 1;
        for (const e of this.entities) if (e.type === 'hero') {
          e.gold += 3;
          if (e.alive) this.gainXp(e, 2.4);
        }
      }
      this._updateVisuals(dt);
      const pending = this._pending;
      this._pending = [];
      for (const action of pending) {
        if (action.at <= this.time) this._resolveArea(action);
        else this._pending.push(action);
      }
      this._updateProjectiles(dt);
      this._updateHazards();
      for (const e of this.entities) {
        if (this.over) break;
        if (e.type === 'hero') this._updateHero(e, dt);
        else if (e.type === 'minion' && e.alive) this._updateMinion(e, dt);
        else if (e.type === 'tower' && e.alive) this._updateTower(e, dt);
        else if (e.type === 'monster') this._updateMonster(e, dt);
        else if (e.type === 'ward' && e.alive && this.time >= e.expiresAt) { e.alive = false; e.deathAt = this.time; }
      }
      if (this.time >= this._cleanupAt) {
        this._cleanupAt = this.time + 1;
        this.entities = this.entities.filter(e => !((e.type === 'minion' || e.type === 'ward') && !e.alive && this.time - (e.deathAt || 0) > 0.8));
        this._rebuildIndex();
      }
    }

    _rebuildIndex() {
      this._refreshMovementNavigation();
      this._byId = new Map();
      this._grid.clear();
      this._vision = [[], []];
      for (const e of this.entities) {
        if (!finite(e.x) || !finite(e.y)) {
          const fallback = e.team < 2 ? this.map.bases[e.team] : { x: finite(e.homeX) ? e.homeX : this.map.width / 2, y: finite(e.homeY) ? e.homeY : this.map.height / 2 };
          const safe = this._safePoint(finite(e.x) ? e.x : fallback.x, finite(e.y) ? e.y : fallback.y, e.r);
          e.x = safe.x; e.y = safe.y;
          if (e.type === 'hero' || e.type === 'minion') this._clearPath(e);
        }
        this._byId.set(e.id, e);
        if (!e.alive) continue;
        const key = Math.floor(e.x / 256) + ',' + Math.floor(e.y / 256);
        if (!this._grid.has(key)) this._grid.set(key, []);
        this._grid.get(key).push(e);
        if (e.team < 2 && e.type !== 'monster') this._vision[e.team].push(e);
      }
    }

    _near(x, y, radius, predicate) {
      const result = [];
      if (!finite(x) || !finite(y) || !finite(radius) || radius < 0) return result;
      const x0 = Math.floor((x - radius) / 256), x1 = Math.floor((x + radius) / 256);
      const y0 = Math.floor((y - radius) / 256), y1 = Math.floor((y + radius) / 256);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const cell = this._grid.get(gx + ',' + gy);
        if (!cell) continue;
        for (const e of cell) if (e.alive && sq(e.x - x) + sq(e.y - y) <= sq(radius + (e.r || 0)) && (!predicate || predicate(e))) result.push(e);
      }
      return result;
    }

    _nearest(from, radius, predicate, score) {
      let found = null, best = Infinity;
      for (const e of this._near(from.x, from.y, radius, predicate)) {
        const value = distance(from, e) + (score ? score(e) : 0);
        if (value < best) { best = value; found = e; }
      }
      return found;
    }

    _event(text, tone) {
      this.events.push({ id: ++this._eventIds, text, tone: tone || 'info', at: this.time });
      if (this.events.length > 20) this.events.splice(0, this.events.length - 20);
    }

    _effect(kind, x, y, radius, color, life, extra) {
      this.effects.push(Object.assign({ kind, x, y, r: radius, color: color || '#ffffff', life: life || 0.45, maxLife: life || 0.45 }, extra || {}));
      if (this.effects.length > 130) this.effects.splice(0, this.effects.length - 130);
    }

    _float(x, y, text, color) {
      this.floaters.push({ x: x + (this._random() - 0.5) * 14, y: y - 20, text: String(text), color: color || '#ffffff', life: 1.0, maxLife: 1.0 });
      if (this.floaters.length > 100) this.floaters.splice(0, this.floaters.length - 100);
    }

    _updateVisuals(dt) {
      for (const e of this.effects) e.life -= dt;
      for (const f of this.floaters) { f.life -= dt; f.y -= dt * 30; }
      this.effects = this.effects.filter(e => e.life > 0);
      this.floaters = this.floaters.filter(f => f.life > 0);
    }

    _spawnWave() {
      this.waveNumber += 1;
      for (let team = 0; team < 2; team++) for (const lane of ['top', 'mid', 'bot']) {
        const existing = this.entities.filter(e => e.alive && e.type === 'minion' && e.team === team && e.lane === lane).length;
        if (existing > 28) continue;
        const kinds = ['melee', 'melee', 'melee', 'ranged', 'ranged'];
        if (this.waveNumber % 3 === 0 || this.time >= 270) kinds.push('siege');
        const enemyInhibitor = this.entities.find(e => e.id === 'inhibitor-' + (1 - team) + '-' + lane);
        if (enemyInhibitor && !enemyInhibitor.alive) kinds.push('super');
        kinds.forEach((kind, i) => {
          const stats = kind === 'melee' ? [270, 23, 48, 1.04, 23, 34] : kind === 'ranged' ? [170, 26, 205, 0.95, 21, 30] : kind === 'siege' ? [530, 56, 240, 0.7, 48, 54] : [770, 68, 65, 0.85, 38, 45];
          const hpScale = 1 + this.time / 200;
          const damageScale = 1 + this.time / 125;
          const startProgress = team === 0 ? 0.025 - i * 0.0025 : 0.975 + i * 0.0025;
          const offset = (i % 3 - 1) * 23;
          const radius = kind === 'super' ? 20 : kind === 'siege' ? 18 : 12;
          const pos = this._laneSpawnPoint(team, lane, startProgress, offset, radius);
          const maxHp = stats[0] * hpScale;
          this._add({ id: this._id('minion'), type: 'minion', team, lane, kind, name: kind === 'super' ? '강화 미니언' : kind === 'siege' ? '공성 미니언' : kind === 'ranged' ? '원거리 미니언' : '근접 미니언',
            x: pos.x, y: pos.y, r: radius, hp: maxHp, maxHp, alive: true, shield: 0,
            damage: stats[1] * damageScale, armor: kind === 'super' ? 15 : 3, range: stats[2], attackSpeed: stats[3],
            goldValue: stats[4], xpValue: stats[5], speed: 175 + Math.min(this.time * 0.08, 40), laneProgress: pathProgress(this._paths, lane, pos.x, pos.y),
            laneOffset: offset, facing: team === 0 ? -0.78 : 2.36, attackCooldown: this._random() * 0.3, attackProgress: 1,
            targetId: null, thinkIn: this._random() * 0.24, expiresAt: this.time + 180, slowUntil: 0, slowFactor: 1, stunnedUntil: 0 });
        });
      }
    }

    _laneSpawnPoint(team, lane, progress, offset, radius) {
      const initial = pathPoint(this._paths, lane, progress, offset), navigation = this._movementNavigation;
      if (!navigation) return initial;
      const exit = pathPoint(this._paths, lane, team === 0 ? 0.16 : 0.84, offset * 0.65);
      const initialRoute = navigation.findPath(initial.x, initial.y, exit.x, exit.y, radius);
      if (initialRoute.length) return navigation.nearestWalkable(initial.x, initial.y, radius);
      // A valid point can lie inside a closed pocket between base structures.
      // Only disconnected spawns advance along their own lane; both teams use
      // the same bounded search, and enemy structures are never removed.
      const direction = team === 0 ? 1 : -1;
      for (let advance = 40; advance <= 480; advance += 40) {
        const point = pathPoint(this._paths, lane, progress + direction * advance / this._paths[lane].total, offset);
        if (!navigation.isWalkable(point.x, point.y, radius)) continue;
        if (distance(point, exit) < 12 || navigation.findPath(point.x, point.y, exit.x, exit.y, radius).length) return point;
      }
      return navigation.nearestWalkable(exit.x, exit.y, radius);
    }

    _recalculate(hero) {
      const t = HERO_BY_ID[hero.hero];
      if (!t) return;
      const level = hero.level - 1;
      let damage = t.damage + level * (hero.hero === 'warrior' ? 5.2 : 4.1);
      let maxHp = t.hp + level * (hero.hero === 'warrior' ? 90 : 66);
      let maxMana = t.mana + level * 28;
      let armor = t.armor + level * 1.8, speed = t.speed, ap = level * (hero.hero === 'mage' ? 7 : 2), attackSpeedBonus = level * 0.022;
      for (const entry of hero.inventory) {
        const item = ITEM_BY_ID[typeof entry === 'string' ? entry : entry.id];
        if (!item) continue;
        const s = item.stats;
        damage += s.damage || 0; maxHp += s.maxHp || 0; maxMana += s.maxMana || 0;
        armor += s.armor || 0; speed += s.speed || 0; ap += s.abilityPower || 0; attackSpeedBonus += s.attackSpeed || 0;
      }
      hero.damage = damage;
      hero.maxHp = maxHp;
      hero.maxMana = maxMana;
      hero.armor = armor;
      hero.speed = Math.min(speed, 325);
      hero.abilityPower = ap;
      hero.attackSpeed = Math.min(t.attackSpeed * (1 + attackSpeedBonus), 3.1);
      hero.range = t.range;
    }

    gainXp(heroOrId, amount) {
      const hero = typeof heroOrId === 'string' ? this._byId.get(heroOrId) : heroOrId;
      if (!hero || hero.type !== 'hero' || !finite(amount) || amount <= 0 || hero.level >= 18) return;
      hero.xp += amount;
      while (hero.xp >= hero.nextXp && hero.level < 18) {
        hero.xp -= hero.nextXp;
        const oldHp = hero.maxHp, oldMana = hero.maxMana;
        hero.level++;
        hero.skillPoints++;
        hero.nextXp = 110 + (hero.level - 1) * 35;
        this._recalculate(hero);
        if (hero.alive) { hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp - oldHp + 45); hero.mana = Math.min(hero.maxMana, hero.mana + hero.maxMana - oldMana + 25); }
        if (hero.isPlayer) {
          this._event('레벨 ' + hero.level + (hero.level === 6 ? ' · 궁극기를 배울 수 있습니다!' : ' · 스킬 포인트 +1'), 'good');
          this._effect('ring', hero.x, hero.y, 76, '#fce8a2', 0.65);
          this._float(hero.x, hero.y - 15, 'LEVEL ' + hero.level, '#ffe09a');
        }
        else this._autoAllocateSkills(hero);
      }
      if (hero.level >= 18) { hero.level = 18; hero.xp = 0; hero.nextXp = 0; }
    }

    getSkillInfo(slot, hero) {
      hero = hero || this.player;
      slot = String(slot).toLowerCase();
      const definition = HERO_BY_ID[hero.hero] && HERO_BY_ID[hero.hero].skills[slot];
      if (!definition) return null;
      const rank = hero.skillRanks[slot] || 0, maxRank = slot === 'r' ? 3 : 5;
      const nextUnlock = rank >= maxRank ? null : slot === 'r' ? [6, 11, 16][rank] : rank * 2 + 1;
      const multiplier = 1 + Math.max(0, rank - 1) * 0.12;
      return Object.assign({}, definition, { slot, rank, maxRank, nextUnlock, learned: rank > 0,
        cooldown: definition.cooldown * (1 - Math.max(0, rank - 1) * 0.04), cost: definition.cost, damageMultiplier: multiplier });
    }

    _skillUpgradeReason(hero, slot) {
      const info = this.getSkillInfo(slot, hero);
      if (!info) return '강화할 수 없는 스킬입니다.';
      if (this.over) return '경기가 종료되었습니다.';
      if (info.rank >= info.maxRank) return '최대 스킬 랭크입니다.';
      if (hero.level < info.nextUnlock) return info.nextUnlock + '레벨부터 강화할 수 있습니다.';
      if (hero.skillPoints <= 0) return '사용 가능한 스킬 포인트가 없습니다.';
      return null;
    }

    canUpgradeSkill(slot) { return !this._skillUpgradeReason(this.player, String(slot).toLowerCase()); }

    _upgradeSkill(hero, slot) {
      const reason = this._skillUpgradeReason(hero, slot);
      if (reason) return { ok: false, reason };
      hero.skillPoints--;
      hero.skillRanks[slot]++;
      return { ok: true, rank: hero.skillRanks[slot] };
    }

    upgradeSkill(slot) {
      slot = String(slot).toLowerCase();
      const result = this._upgradeSkill(this.player, slot);
      if (result.ok) this._event(slot.toUpperCase() + ' ' + this.getSkillInfo(slot).name + ' · 랭크 ' + result.rank, 'good');
      else this._inputError(result.reason);
      return result;
    }

    _autoAllocateSkills(hero) {
      let allocated = 0;
      while (hero.skillPoints > 0) {
        const priority = ['r'];
        if (!hero.skillRanks.w) priority.push('w');
        if (!hero.skillRanks.e) priority.push('e');
        priority.push(...(hero.hero === 'warrior' ? ['q', 'e', 'w'] : ['q', 'w', 'e']));
        const slot = priority.find(key => !this._skillUpgradeReason(hero, key));
        if (!slot) break;
        this._upgradeSkill(hero, slot); allocated++;
      }
      return allocated;
    }

    autoAllocateSkills() {
      const allocated = this._autoAllocateSkills(this.player);
      if (allocated) this._event('추천 스킬 배분 · ' + allocated + '포인트를 사용했습니다.', 'good');
      return { ok: true, allocated, remaining: this.player.skillPoints };
    }

    _skillReady(hero, slot) {
      const info = this.getSkillInfo(slot, hero);
      return !!info && info.rank > 0 && hero.cd[slot] <= 0 && hero.mana >= info.cost;
    }

    _updateHero(hero, dt) {
      for (const key of Object.keys(hero.cd)) hero.cd[key] = Math.max(0, hero.cd[key] - dt);
      hero.attackCooldown = Math.max(0, hero.attackCooldown - dt);
      hero.attackProgress = clamp(1 - hero.attackCooldown / hero.attackPeriod, 0, 1);
      if (!hero.alive) {
        this._cancelAttack(hero);
        hero.respawnIn = Math.max(0, hero.respawnAt - this.time);
        if (!hero.isPlayer && this.time >= hero.purchaseAt) { this._autoBuy(hero); hero.purchaseAt = this.time + 2; }
        if (hero.respawnIn <= 0) this._respawnHero(hero);
        return;
      }
      if (hero.shieldUntil <= this.time) hero.shield = 0;
      const base = this.map.bases[hero.team];
      const inBase = distance(hero, base) <= 155;
      hero.hp = Math.min(hero.maxHp, hero.hp + dt * (inBase ? hero.maxHp * 0.18 : 2.0 + hero.level * 0.16));
      hero.mana = Math.min(hero.maxMana, hero.mana + dt * (inBase ? hero.maxMana * 0.24 : 4.5 + hero.level * 0.35));
      if (!hero.isPlayer && hero.stunnedUntil <= this.time && this._evadeHazard(hero, dt)) {
        hero.laneProgress = pathProgress(this._paths, hero.lane, hero.x, hero.y);
        return;
      }
      if (hero.recallLeft > 0) {
        this._cancelAttack(hero);
        hero.recallLeft = Math.max(0, hero.recallLeft - dt);
        if (hero.recallLeft <= 0) {
          this._effect('teleport', hero.x, hero.y, 55, TEAM_COLORS[hero.team], 0.45);
          hero.x = base.x + (hero.team === 0 ? 10 : -10); hero.y = base.y;
          hero.targetId = null; hero.aiMove = null;
          this._clearPath(hero);
          if (hero.isPlayer) { this._moveDestination = null; this._attackMoveDestination = null; this._attackMoveTargetId = null; this._playerTargetId = null; this._event('기지 귀환 완료 · 체력 회복과 상점 구매가 가능합니다.', 'good'); }
          this._effect('teleport', hero.x, hero.y, 80, TEAM_COLORS[hero.team], 0.7);
        }
        return;
      }
      if (hero.stunnedUntil > this.time) { this._cancelAttack(hero); return; }
      if (hero.attackWindup) {
        const moving = hero.isPlayer && (this._input.x || this._input.y || this._moveDestination);
        const unsafe = !hero.isPlayer && (hero.retreating || hero.hp / hero.maxHp < 0.24 || this._towerDanger(hero));
        if (moving || unsafe) {
          this._cancelAttack(hero);
          if (unsafe) hero.aiThinkIn = 0;
        }
        // A deliberate attack plants the hero's feet only for its preparation.
        // AI rethinking and kiting cannot repeatedly restart the same attack.
        else if (this._advanceAttack(hero, dt)) {
          hero.laneProgress = pathProgress(this._paths, hero.lane, hero.x, hero.y);
          return;
        }
      }
      if (hero.isPlayer) this._updatePlayer(hero, dt);
      else {
        if (inBase && this.time >= hero.purchaseAt) { this._autoBuy(hero); hero.purchaseAt = this.time + 2; }
        hero.aiThinkIn -= dt;
        if (hero.aiThinkIn <= 0) { this._thinkHero(hero); hero.aiThinkIn = 0.22 + this._random() * 0.13; }
        this._performAI(hero, dt);
      }
      hero.laneProgress = pathProgress(this._paths, hero.lane, hero.x, hero.y);
    }

    _attackSpeed(entity) {
      return (entity.attackSpeed || 1) * (entity.rapidUntil > this.time ? 1.7 : 1);
    }

    getAttackState(hero) {
      hero = hero || this.player;
      const empty = { phase: 'disabled', progress: 0, remaining: 0, duration: 0, targetId: null };
      if (!hero || hero.type !== 'hero' || !this.started || this.over || !hero.alive || hero.stunnedUntil > this.time || hero.recallLeft > 0) return empty;
      const attack = hero.attackWindup;
      if (attack) return { phase: 'windup', progress: clamp(1 - attack.remaining / attack.duration, 0, 1),
        remaining: attack.remaining, duration: attack.duration, targetId: attack.targetId };
      const target = this._byId.get(hero.targetId);
      const targetId = target && target.alive && target.team !== hero.team && this.isVisible(target, hero.team) ? target.id : null;
      if (hero.attackCooldown > 0) {
        const duration = Math.max(0.001, hero.attackPeriod - clamp(hero.attackPeriod * 0.25, 0.1, 0.32));
        return { phase: 'recovery', progress: clamp(1 - hero.attackCooldown / duration, 0, 1),
          remaining: hero.attackCooldown, duration, targetId };
      }
      return { phase: 'ready', progress: 1, remaining: 0, duration: 0, targetId };
    }

    _cancelAttack(hero) {
      if (!hero || hero.type !== 'hero' || !hero.attackWindup) return false;
      hero.attackWindup = null;
      hero.attackCooldown = 0;
      hero.attackProgress = 1;
      return true;
    }

    _validAttack(source, target) {
      return !!(source.alive && target && target.alive && target.team !== source.team &&
        !(source.stunnedUntil > this.time) && !this.isProtected(target) &&
        distance(source, target) <= source.range + target.r + 8 &&
        (source.type !== 'hero' || this.isVisible(target, source.team)));
    }

    _advanceAttack(hero, dt) {
      const attack = hero.attackWindup;
      if (!attack) return false;
      const target = this._byId.get(attack.targetId);
      if (!this._validAttack(hero, target)) { this._cancelAttack(hero); return false; }
      attack.remaining = Math.max(0, attack.remaining - dt);
      hero.facing = Math.atan2(target.y - hero.y, target.x - hero.x);
      if (attack.remaining <= 1e-9) {
        hero.attackWindup = null;
        this._releaseAttack(hero, target);
      }
      return true;
    }

    _updatePlayer(hero, dt) {
      const focus = this.getFocusTarget();
      let target = this._byId.get(this._playerTargetId);
      if (target && (!target.alive || !this.isVisible(target, hero.team) || target.team === hero.team || this.isProtected(target))) {
        target = null; this._playerTargetId = null;
      }
      const moving = this._input.x !== 0 || this._input.y !== 0;
      if (!target && !moving && this._attackMoveDestination) {
        target = this._byId.get(this._attackMoveTargetId);
        const acquisition = Math.max(280, hero.range + 120);
        if (!target || !this._isAttackableEnemy(hero, target) || target.team !== 1 || !this.isVisible(target, 0) || distance(hero, target) > acquisition + 110) target = null;
        if (!target) target = this._nearest(hero, acquisition, e => e.team === 1 && this._isAttackableEnemy(hero, e) && e.type !== 'ward' && this.isVisible(e, 0),
          e => e.type === 'hero' ? -45 : e.type === 'minion' ? 0 : 90);
        this._attackMoveTargetId = target ? target.id : null;
      }
      if (moving) {
        this._move(hero, hero.x + this._input.x * 150, hero.y + this._input.y * 150, dt, 0, true);
        hero.targetId = null;
        return;
      }
      else if (target) {
        if (distance(hero, target) > hero.range + target.r + 4) this._move(hero, target.x, target.y, dt, hero.range + target.r - 4);
      } else if (this._moveDestination || this._attackMoveDestination) {
        const destination = this._moveDestination || this._attackMoveDestination;
        if (distance(hero, destination) <= 7) { this._moveDestination = null; this._attackMoveDestination = null; this._clearPath(hero); }
        else {
          this._move(hero, destination.x, destination.y, dt, 3);
          // A plain move command stays a move until arrival. Attack-move may
          // acquire a target and deliberately stop on a subsequent frame.
          hero.targetId = null;
          return;
        }
      }
      if (!target && hero.autoAttack && focus && this._canFocus(focus) && distance(hero, focus) <= hero.range + focus.r) target = focus;
      if (!target && hero.autoAttack) target = this._nearest(hero, hero.range + 55,
        e => this._isAttackableEnemy(hero, e) && distance(hero, e) <= hero.range + e.r && this.isVisible(e, hero.team),
        e => e.type === 'hero' ? -80 : e.type === 'minion' ? -20 : e.type === 'monster' ? 50 : 20);
      hero.targetId = target ? target.id : null;
      if (target) this._attack(hero, target);
    }

    _isAttackableEnemy(source, target) {
      return target.alive && target.team !== source.team && target.id !== source.id && !this.isProtected(target);
    }

    _thinkHero(hero) {
      const base = this.map.bases[hero.team];
      hero.orderType = null;
      hero.objectiveId = null;
      if (hero.hp / hero.maxHp < 0.38 && hero.cd.f <= 0) this._cast(hero, 'f');
      if (hero.hp / hero.maxHp < 0.24) hero.retreating = true;
      if (hero.retreating && hero.hp / hero.maxHp > 0.88 && hero.mana / hero.maxMana > 0.45) hero.retreating = false;
      if (hero.retreating) {
        hero.targetId = null; hero.aiMove = { x: base.x, y: base.y };
        if (distance(hero, base) > 340 && this.time - hero.lastDamageAt > 3.2 && !this._nearest(hero, 460, e => e.type === 'hero' && e.team !== hero.team && e.team < 2 && this.isVisible(e, hero.team))) {
          hero.recallLeft = 4;
          this._effect('ring', hero.x, hero.y, 50, TEAM_COLORS[hero.team], 4);
        }
        return;
      }
      const towerDanger = this._towerDanger(hero);
      if (towerDanger) { this._disengageTower(hero, towerDanger); return; }
      if (hero.team === 0 && this.order && this.time < this.order.expiresAt) {
        this._thinkTeamOrder(hero);
        return;
      }
      let enemy = this._nearest(hero, 470, e => e.type === 'hero' && e.team === 1 - hero.team && this.isVisible(e, hero.team), e => e.hp / e.maxHp * 50);
      if (enemy && !this._unsafeDive(hero, enemy)) {
        hero.targetId = enemy.id; hero.aiMove = { x: enemy.x, y: enemy.y };
        this._autoCast(hero, enemy);
        return;
      }
      if (hero.role === 'jungle' || hero.role === 'support') {
        const jungle = this.entities.find(e => e.type === 'hero' && e.team === hero.team && e.role === 'jungle');
        const assisted = jungle && this._byId.get(jungle.objectiveId || jungle.targetId);
        let objective = hero.role === 'support' && assisted && assisted.type === 'monster' && assisted.kind !== 'camp' && assisted.alive && hero.hp / hero.maxHp >= 0.45 ? assisted : null;
        if (hero.role === 'jungle') {
          const available = this.entities.filter(e => e.type === 'monster' && e.alive && (e.kind === 'camp' || this._canPlanEpic(hero, e)));
          available.sort((a, b) => (distance(hero, { x: a.homeX, y: a.homeY }) + (a.kind === 'camp' ? 90 : a.kind === 'boss' ? 30 : -100)) - (distance(hero, { x: b.homeX, y: b.homeY }) + (b.kind === 'camp' ? 90 : b.kind === 'boss' ? 30 : -100)));
          objective = available[0];
        }
        if (objective) {
          if (objective.kind !== 'camp') this._approachEpic(hero, objective);
          else {
            const visible = this.isVisible(objective, hero.team);
            hero.targetId = visible ? objective.id : null;
            hero.aiMove = visible ? { x: objective.x, y: objective.y } : { x: objective.homeX, y: objective.homeY };
            if (visible) this._autoCast(hero, objective);
          }
          return;
        }
      }
      let target = this._nearest(hero, 440, e => this._isAttackableEnemy(hero, e) && e.team < 2 && e.type !== 'ward' && this.isVisible(e, hero.team) && (!isStructure(e) || this._hasSiegeCover(hero, e)) && !this._unsafeDive(hero, e),
        e => e.type === 'minion' ? -60 : e.type === 'hero' ? -20 : 50);
      if (target) {
        hero.targetId = target.id; hero.aiMove = { x: target.x, y: target.y };
        this._autoCast(hero, target);
        return;
      }
      hero.targetId = null;
      let front = hero.team === 0 ? 0.41 : 0.59;
      for (const e of this.entities) if (e.type === 'minion' && e.alive && e.team === hero.team && e.lane === hero.lane) {
        front = hero.team === 0 ? Math.max(front, e.laneProgress + 0.012) : Math.min(front, e.laneProgress - 0.012);
      }
      const nextStructure = this.entities.filter(e => isStructure(e) && e.alive && e.team !== hero.team && (e.lane === hero.lane || e.lane === 'base') && !this.isProtected(e)).sort((a, b) => distance(hero, a) - distance(hero, b))[0];
      if (nextStructure && !this._hasSiegeCover(hero, nextStructure)) {
        const structureProgress = pathProgress(this._paths, hero.lane, nextStructure.x, nextStructure.y);
        const margin = (nextStructure.range || 180) / this._paths[hero.lane].total + 0.025;
        front = hero.team === 0 ? Math.min(front, structureProgress - margin) : Math.max(front, structureProgress + margin);
      }
      hero.aiMove = pathPoint(this._paths, hero.lane, clamp(front, 0.05, 0.95), hero.role === 'support' ? 38 : 0);
    }

    _thinkTeamOrder(hero) {
      const order = this.order;
      if (order.type === 'dragon' || order.type === 'boss') {
        const objective = this.entities.find(e => e.id === order.objectiveId && e.alive);
        if (!objective) { this._validateObjectiveOrder(); hero.targetId = null; hero.aiMove = null; return; }
        const threat = this._nearest(hero, 340, e => e.type === 'hero' && e.team === 1 && this.isVisible(e, 0) && distance(e, order) < 700 && !this._unsafeDive(hero, e));
        hero.orderType = order.type;
        if (threat) { hero.targetId = threat.id; hero.aiMove = { x: threat.x, y: threat.y }; this._autoCast(hero, threat); }
        else this._approachEpic(hero, objective);
        return;
      }
      let goal = { x: order.x, y: order.y };
      if (order.type === 'push') {
        let front = 0.43;
        for (const e of this.entities) if (e.alive && e.type === 'minion' && e.team === 0 && e.lane === 'mid') front = Math.max(front, e.laneProgress + 0.012);
        const next = this.entities.filter(e => e.alive && e.team === 1 && isStructure(e) && (e.lane === 'mid' || e.lane === 'base') && !this.isProtected(e))
          .sort((a, b) => pathProgress(this._paths, 'mid', a.x, a.y) - pathProgress(this._paths, 'mid', b.x, b.y))[0];
        if (next && !this._hasSiegeCover(hero, next)) front = Math.min(front, pathProgress(this._paths, 'mid', next.x, next.y) - (next.range || 180) / this._paths.mid.total - 0.025);
        goal = pathPoint(this._paths, 'mid', clamp(front, 0.1, 0.96), hero.role === 'support' ? 35 : 0);
      } else if (order.type === 'defend') {
        const threats = this.entities.filter(e => e.alive && e.team === 1 && (e.type === 'hero' || e.type === 'minion') && distance(e, this.map.bases[0]) < 650 && this.isVisible(e, 0));
        threats.sort((a, b) => distance(a, this.map.bases[0]) - distance(b, this.map.bases[0]));
        if (threats.length) goal = { x: threats[0].x, y: threats[0].y };
      }
      const target = this._nearest(hero, 450, e => {
        if (e.team !== 1 || !this._isAttackableEnemy(hero, e) || e.type === 'ward' || !this.isVisible(e, 0)) return false;
        if (distance(e, goal) > 560 && distance(e, hero) > 130) return false;
        if (isStructure(e)) return order.type === 'push' && this._hasSiegeCover(hero, e) && !this._unsafeDive(hero, e);
        return !this._unsafeDive(hero, e);
      }, e => e.type === 'hero' ? -45 : e.type === 'minion' ? 0 : 85);
      hero.targetId = target ? target.id : null;
      hero.aiMove = target ? { x: target.x, y: target.y } : this._safePoint(goal.x, goal.y, hero.r);
      hero.orderType = order.type;
      if (target) this._autoCast(hero, target);
    }

    setTeamOrder(type, x, y) {
      type = String(type).toLowerCase();
      if (!['rally', 'push', 'defend', 'dragon', 'boss', 'clear'].includes(type)) return { ok: false, reason: '알 수 없는 팀 지시입니다.' };
      if (this.over) return { ok: false, reason: '경기가 종료되었습니다.' };
      if (type === 'clear') {
        this.order = null;
        for (const hero of this.entities) if (hero.type === 'hero' && hero.team === 0 && !hero.isPlayer) { hero.aiThinkIn = 0; hero.orderType = null; }
        this._event('팀 지시 해제 · 각자의 공격로로 복귀합니다.', 'info');
        return { ok: true };
      }
      if ((x !== undefined || y !== undefined) && (!finite(x) || !finite(y))) return { ok: false, reason: '유효한 지시 위치를 선택하세요.' };
      const epic = type === 'dragon' || type === 'boss';
      const objective = epic ? this.entities.find(e => e.type === 'monster' && e.kind === type && e.alive) : null;
      if (epic && !objective) return { ok: false, reason: (type === 'dragon' ? '폭풍 드래곤' : '심연 거인') + '이 현재 전장에 없습니다.' };
      const fallback = objective ? { x: objective.homeX, y: objective.homeY } : type === 'defend' ? this.map.bases[0] : type === 'push' ? { x: this.map.width / 2, y: this.map.height / 2 } : this.player;
      const point = this._safePoint(epic || x === undefined ? fallback.x : x, epic || y === undefined ? fallback.y : y, 19);
      this.order = { type, x: point.x, y: point.y, expiresAt: this.time + 25 };
      if (objective) this.order.objectiveId = objective.id;
      for (const hero of this.entities) if (hero.type === 'hero' && hero.team === 0 && !hero.isPlayer) { hero.aiThinkIn = 0; this._clearPath(hero); }
      this._event((objective ? objective.name + ' 공략 지시' : type === 'rally' ? '집결 지시' : type === 'push' ? '중앙 압박 지시' : '기지 방어 지시') + ' · 25초 동안 아군이 반응합니다.', 'good');
      this._effect('ring', point.x, point.y, 120, '#74f2d5', 1.2);
      return { ok: true };
    }

    _validateObjectiveOrder() {
      if (!this.order || (this.order.type !== 'dragon' && this.order.type !== 'boss')) return;
      const id = this.order.objectiveId;
      if (this.entities.some(e => e.id === id && e.type === 'monster' && e.alive)) return;
      this.order = null;
      for (const hero of this.entities) if (hero.type === 'hero' && hero.team === 0 && !hero.isPlayer) {
        if (hero.targetId === id) hero.targetId = null;
        hero.aiMove = null; hero.orderType = null; hero.objectiveId = null; hero.aiThinkIn = 0;
        this._clearPath(hero);
      }
    }

    _canPlanEpic(hero, objective) {
      if (hero.hp / hero.maxHp < 0.55 || hero.level < (objective.kind === 'boss' ? 9 : 4)) return false;
      const home = { x: objective.homeX, y: objective.homeY };
      return this.entities.some(e => e.type === 'hero' && e.team === hero.team && e !== hero && e.alive && !e.retreating && e.recallLeft <= 0 && e.hp / e.maxHp >= 0.5 &&
        (e.role === 'support' || (e.isPlayer && distance(e, home) < 650) || ((e.objectiveId === objective.id || e.targetId === objective.id) && distance(e, home) < 950)));
    }

    _approachEpic(hero, objective) {
      const home = { x: objective.homeX, y: objective.homeY };
      hero.objectiveId = objective.id;
      if (hero.hp / hero.maxHp < 0.4) {
        hero.retreating = true; hero.targetId = null; hero.aiMove = { x: this.map.bases[hero.team].x, y: this.map.bases[hero.team].y };
        return;
      }
      if (!this.isVisible(objective, hero.team)) {
        hero.targetId = null; hero.aiMove = this._safePoint(home.x, home.y, hero.r);
        return;
      }
      const alliedOrder = hero.team === 0 && this.order && this.order.objectiveId === objective.id;
      const allies = this.entities.filter(e => e.type === 'hero' && e.team === hero.team && e.alive && !e.retreating && e.recallLeft <= 0 && e.hp / e.maxHp >= 0.42 && distance(e, home) < 550 &&
        (e === hero || e.isPlayer || e.objectiveId === objective.id || e.targetId === objective.id || alliedOrder));
      const enemies = this.entities.filter(e => e.type === 'hero' && e.team === 1 - hero.team && e.alive && distance(e, home) < 550 && this.isVisible(e, hero.team));
      if (allies.length >= 2 && allies.length >= enemies.length && hero.hp / hero.maxHp >= 0.48) {
        hero.targetId = objective.id; hero.aiMove = { x: objective.x, y: objective.y };
        this._autoCast(hero, objective);
      } else {
        const base = this.map.bases[hero.team], angle = Math.atan2(base.y - home.y, base.x - home.x);
        hero.targetId = null;
        hero.aiMove = this._safePoint(home.x + Math.cos(angle) * 345, home.y + Math.sin(angle) * 345, hero.r);
      }
    }

    _towerFocusedOn(tower, hero) {
      return tower.targetId === hero.id || (tower.aggroTargetId === hero.id && this.time <= (tower.aggroUntil || 0));
    }

    _unsafeDive(hero, target) {
      // Assess where the attacker needs to stand, not the victim's proximity to
      // a tower. A ranged hero can keep firing from outside its acquisition ring.
      const d = distance(hero, target), reach = Math.max(10, hero.range + target.r - 10);
      const travel = d > reach ? (d - reach) / Math.max(1, d) : 0;
      const approach = { x: hero.x + (target.x - hero.x) * travel, y: hero.y + (target.y - hero.y) * travel };
      return this.entities.some(tower => tower.type === 'tower' && tower.alive && tower.team === 1 - hero.team && !this.isProtected(tower) &&
        distance(tower, approach) <= tower.range + hero.r + 16 &&
        (this._towerFocusedOn(tower, hero) || !this._hasSiegeCover(hero, tower)));
    }

    _hasSiegeCover(hero, structure) {
      const range = structure.type === 'tower' ? structure.range : 415;
      return !!this._nearest(structure, range + 24, e => e.type === 'minion' && e.team === hero.team && distance(e, structure) <= range + (structure.type === 'tower' ? e.r : 0));
    }

    _towerDanger(hero) {
      return this.entities.find(tower => tower.type === 'tower' && tower.alive && tower.team === 1 - hero.team && !this.isProtected(tower) &&
        distance(tower, hero) <= tower.range + hero.r + 24 &&
        (this._towerFocusedOn(tower, hero) || !this._hasSiegeCover(hero, tower))) || null;
    }

    _disengageTower(hero, tower) {
      const base = this.map.bases[hero.team];
      const angle = distance(hero, tower) > 1 ? Math.atan2(hero.y - tower.y, hero.x - tower.x) : Math.atan2(base.y - tower.y, base.x - tower.x);
      const reach = tower.range + hero.r + 90;
      hero.targetId = null;
      hero.aiMove = this._safePoint(tower.x + Math.cos(angle) * reach, tower.y + Math.sin(angle) * reach, hero.r);
    }

    _performAI(hero, dt) {
      if (hero.recallLeft > 0) return;
      const towerDanger = this._towerDanger(hero);
      if (towerDanger) {
        this._disengageTower(hero, towerDanger);
        this._move(hero, hero.aiMove.x, hero.aiMove.y, dt, 5);
        return;
      }
      const target = this._byId.get(hero.targetId);
      if (target && !this.isVisible(target, hero.team)) {
        hero.targetId = null;
        // Neutral homes are public map positions. Hidden heroes do not supply
        // new coordinates or retain a path that follows their unseen movement.
        hero.aiMove = target.type === 'monster' ? { x: target.homeX, y: target.homeY } : null;
        hero.aiThinkIn = 0;
        this._clearPath(hero);
        if (hero.aiMove) this._move(hero, hero.aiMove.x, hero.aiMove.y, dt, 5);
        return;
      }
      if (target && this._isAttackableEnemy(hero, target)) {
        if (this._unsafeDive(hero, target)) { hero.targetId = null; hero.aiMove = null; hero.aiThinkIn = 0; this._clearPath(hero); return; }
        const d = distance(hero, target);
        const comfortableRange = hero.range + target.r - 10;
        if (d > comfortableRange) this._move(hero, target.x, target.y, dt, Math.max(10, comfortableRange));
        else if (hero.range > 200 && target.type === 'hero' && d < 160) {
          this._move(hero, hero.x + (hero.x - target.x), hero.y + (hero.y - target.y), dt, 0);
        }
        this._attack(hero, target);
      } else if (hero.aiMove) {
        // Even an explicit rally point must not make an AI enter an uncovered
        // tower ring. Stop on the safe side until the minion wave arrives.
        const tower = this.entities.find(e => e.type === 'tower' && e.alive && e.team === 1 - hero.team && !this.isProtected(e) &&
          distance(e, hero.aiMove) < e.range + hero.r + 24 && (this._towerFocusedOn(e, hero) || !this._hasSiegeCover(hero, e)));
        if (tower) {
          const angle = Math.atan2(hero.y - tower.y, hero.x - tower.x), reach = tower.range + hero.r + 42;
          hero.aiMove = this._safePoint(tower.x + Math.cos(angle) * reach, tower.y + Math.sin(angle) * reach, hero.r);
        }
        this._move(hero, hero.aiMove.x, hero.aiMove.y, dt, 5);
      }
    }

    _autoCast(hero, target) {
      if (hero.attackWindup) return;
      if (!target || !target.alive || !this.isVisible(target, hero.team)) return;
      const d = distance(hero, target), enemyHero = target.type === 'hero';
      const modifier = hero.team === 1 ? (this.difficulty === 'easy' ? 0.53 : this.difficulty === 'hard' ? 1.0 : 0.8) : 0.82;
      if (this._random() > modifier) return;
      if (this._skillReady(hero, 'r') && enemyHero && d < HERO_BY_ID[hero.hero].skills.r.range) {
        if (this._cast(hero, 'r', target.x, target.y).ok) return;
      }
      if (hero.hero === 'mage') {
        if (hero.hp / hero.maxHp < 0.7 && this._skillReady(hero, 'e')) { this._cast(hero, 'e'); return; }
        if (d < 550 && this._skillReady(hero, 'q')) { this._cast(hero, 'q', target.x, target.y); return; }
        if (d < 430 && this._skillReady(hero, 'w') && (enemyHero || target.type === 'monster' || this._near(target.x, target.y, 145, e => e.team === target.team).length >= 2)) this._cast(hero, 'w', target.x, target.y);
      } else if (hero.hero === 'warrior') {
        if (hero.hp / hero.maxHp < 0.72 && d < 250 && this._skillReady(hero, 'w')) { this._cast(hero, 'w'); return; }
        if (d > 110 && d < 300 && this._skillReady(hero, 'q')) { this._cast(hero, 'q', target.x, target.y); return; }
        if (d < 185 && this._skillReady(hero, 'e')) this._cast(hero, 'e');
      } else {
        if (enemyHero && d < 145 && this._skillReady(hero, 'e')) { this._cast(hero, 'e', hero.x + (hero.x - target.x), hero.y + (hero.y - target.y)); return; }
        if (d < hero.range + 80 && this._skillReady(hero, 'w') && target.type !== 'ward') { this._cast(hero, 'w'); return; }
        if (d < 650 && this._skillReady(hero, 'q')) this._cast(hero, 'q', target.x, target.y);
      }
    }

    _updateMinion(minion, dt) {
      if (this.time > minion.expiresAt) { minion.alive = false; minion.deathAt = this.time; return; }
      minion.attackCooldown = Math.max(0, minion.attackCooldown - dt);
      minion.attackProgress = clamp(1 - minion.attackCooldown * minion.attackSpeed, 0, 1);
      minion.empowered = this.teamBuffs[minion.team].bossUntil > this.time && !!this._nearest(minion, 650, e => e.type === 'hero' && e.team === minion.team);
      if (minion.stunnedUntil > this.time) return;
      minion.thinkIn -= dt;
      let target = this._byId.get(minion.targetId);
      if (!target || !target.alive || this.isProtected(target) || distance(minion, target) > 420) target = null;
      if (minion.thinkIn <= 0 || !target) {
        target = this._nearest(minion, 285, e => e.team === 1 - minion.team && e.alive && e.type !== 'ward' && !this.isProtected(e), e => e.type === 'minion' ? -25 : e.type === 'hero' ? 20 : 40);
        minion.targetId = target ? target.id : null;
        minion.thinkIn = 0.25 + this._random() * 0.15;
      }
      if (target) {
        if (distance(minion, target) > minion.range + target.r) this._move(minion, target.x, target.y, dt, minion.range + target.r - 5);
        this._attack(minion, target);
      } else {
        minion.laneProgress = pathProgress(this._paths, minion.lane, minion.x, minion.y);
        const direction = minion.team === 0 ? 1 : -1;
        let goal;
        for (let attempt = 0; attempt < 5; attempt++) {
          const ahead = minion.laneProgress + direction * (65 + attempt * 80) / this._paths[minion.lane].total;
          goal = pathPoint(this._paths, minion.lane, ahead, minion.laneOffset * 0.65);
          const nearFriendlyStructure = this._near(goal.x, goal.y, 120, e => isStructure(e) && e.team === minion.team)
            .some(e => distance(e, goal) < e.r + minion.r + 30);
          if (!nearFriendlyStructure && (!this._movementNavigation || this._movementNavigation.isWalkable(goal.x, goal.y, minion.r))) break;
        }
        this._move(minion, goal.x, goal.y, dt, 0);
      }
      minion.laneProgress = pathProgress(this._paths, minion.lane, minion.x, minion.y);
    }

    _updateTower(tower, dt) {
      tower.attackCooldown = Math.max(0, tower.attackCooldown - dt);
      tower.attackProgress = clamp(1 - tower.attackCooldown * tower.attackSpeed, 0, 1);
      if (this.time >= tower.rampUntil) { tower.rampStacks = 0; tower.rampTargetId = null; }
      if (this.isProtected(tower)) return;
      let target = this._byId.get(tower.aggroTargetId);
      if (!target || !target.alive || this.time > (tower.aggroUntil || 0) || distance(tower, target) > tower.range + target.r) target = null;
      if (!target) {
        target = this._byId.get(tower.targetId);
        if (!target || !target.alive || distance(tower, target) > tower.range + target.r) target = null;
      }
      if (!target) target = this._nearest(tower, tower.range + 30, e => e.team === 1 - tower.team && (e.type === 'hero' || e.type === 'minion') && distance(tower, e) <= tower.range + e.r, e => e.type === 'minion' ? -150 : 0);
      if (target && (target.type !== 'hero' || target.id !== tower.rampTargetId)) { tower.rampStacks = 0; tower.rampTargetId = null; }
      tower.targetId = target ? target.id : null;
      if (target) this._attack(tower, target);
    }

    _updateMonster(monster, dt) {
      if (!monster.alive) {
        this._cancelMonsterHazards(monster.id);
        monster.respawnIn = Math.max(0, monster.respawnAt - this.time);
        if (monster.respawnIn <= 0) {
          monster.alive = true; monster.x = monster.homeX; monster.y = monster.homeY;
          monster.maxHp = monster.initialMaxHp * (1 + this.time / (monster.kind === 'camp' ? 330 : 700));
          monster.hp = monster.maxHp; monster.targetId = null; monster.attackCooldown = 0; monster.inCombat = false; monster.nextHazardAt = 0;
          if (monster.kind !== 'camp') this._event(monster.name + ' 등장 · 미니맵의 목표를 확인하세요.', 'info');
        }
        return;
      }
      monster.attackCooldown = Math.max(0, monster.attackCooldown - dt);
      monster.attackProgress = clamp(1 - monster.attackCooldown * monster.attackSpeed, 0, 1);
      if (monster.stunnedUntil > this.time) return;
      let target = this._byId.get(monster.targetId);
      if (target && (!target.alive || distance(target, { x: monster.homeX, y: monster.homeY }) > monster.leash + 200)) target = null;
      if (!target || Math.hypot(monster.x - monster.homeX, monster.y - monster.homeY) > monster.leash) {
        monster.targetId = null; monster.inCombat = false; monster.nextHazardAt = 0;
        this._cancelMonsterHazards(monster.id);
        this._move(monster, monster.homeX, monster.homeY, dt, 4);
        monster.hp = Math.min(monster.maxHp, monster.hp + monster.maxHp * dt * 0.12);
        return;
      }
      if (!monster.inCombat) { monster.inCombat = true; monster.nextHazardAt = this.time + 1.4; }
      if (monster.kind !== 'camp' && this.time >= monster.nextHazardAt) this._startMonsterHazard(monster, target);
      if (distance(monster, target) > monster.range + target.r) this._move(monster, target.x, target.y, dt, monster.range + target.r - 5);
      this._attack(monster, target);
    }

    _startMonsterHazard(monster, target) {
      if (!target || !target.alive || (target.type !== 'hero' && target.type !== 'minion')) return;
      const boss = monster.kind === 'boss';
      this._hazards.push({ id: this._id('hazard'), sourceId: monster.id, x: target.x, y: target.y,
        radius: boss ? 160 : 125, startsAt: this.time, at: this.time + (boss ? 1.2 : 1.05),
        label: boss ? '심연 붕괴' : '폭풍 강타', color: boss ? '#bf9bff' : '#ffba72',
        damage: (boss ? 230 : 150) + this.time * (boss ? 0.08 : 0.06), damageType: boss ? 'physical' : 'magic' });
      monster.nextHazardAt = this.time + (boss ? 6 : 7);
    }

    _cancelMonsterHazards(sourceId) { this._hazards = this._hazards.filter(hazard => hazard.sourceId !== sourceId); }

    _hazardSource(hazard) {
      const source = this.entities.find(e => e.id === hazard.sourceId);
      if (!source || !source.alive || !source.inCombat || source.type !== 'monster') return null;
      const target = this.entities.find(e => e.id === source.targetId);
      const home = { x: source.homeX, y: source.homeY };
      if (!target || !target.alive || distance(target, home) > source.leash + 200 || distance(source, home) > source.leash) return null;
      return source;
    }

    _updateHazards() {
      const remaining = [];
      for (const hazard of this._hazards) {
        const source = this._hazardSource(hazard);
        if (!source) continue;
        if (this.time < hazard.at) { remaining.push(hazard); continue; }
        for (const target of this._near(hazard.x, hazard.y, hazard.radius, e => e.type === 'hero' || e.type === 'minion')) {
          this.damage(target, hazard.damage, source, hazard.damageType);
        }
        this._effect('burst', hazard.x, hazard.y, hazard.radius, hazard.color, 0.45);
      }
      this._hazards = remaining;
    }

    getHazards(team) {
      team = team === 1 ? 1 : 0;
      const results = [];
      for (const hazard of this._hazards) {
        if (this.time >= hazard.at || !this._hazardSource(hazard)) continue;
        const threatenedPlayer = this.player.alive && this.player.team === team && distance(this.player, hazard) <= hazard.radius + this.player.r;
        let visible = this.visibilityAt(hazard.x, hazard.y, team);
        if (!visible) for (let i = 0; i < 8 && !visible; i++) {
          const angle = i * Math.PI / 4;
          visible = this.visibilityAt(hazard.x + Math.cos(angle) * hazard.radius, hazard.y + Math.sin(angle) * hazard.radius, team);
        }
        if (!visible && !threatenedPlayer) continue;
        results.push({ id: hazard.id, sourceId: hazard.sourceId, x: hazard.x, y: hazard.y, radius: hazard.radius,
          startsAt: hazard.startsAt, at: hazard.at, label: hazard.label, color: hazard.color,
          progress: clamp((this.time - hazard.startsAt) / Math.max(0.001, hazard.at - hazard.startsAt), 0, 1) });
      }
      return results;
    }

    _evadeHazard(hero, dt) {
      const hazard = this._hazards.filter(h => this.time < h.at && this._hazardSource(h) && distance(hero, h) < h.radius + hero.r + 12)
        .sort((a, b) => a.at - b.at)[0];
      if (!hazard) { hero._hazardEscapeId = null; hero._hazardEscape = null; return false; }
      if (hero._hazardEscapeId !== hazard.id || !hero._hazardEscape) {
        let angle = Math.atan2(hero.y - hazard.y, hero.x - hazard.x);
        if (distance(hero, hazard) < 1) {
          const source = this._hazardSource(hazard);
          angle = source ? Math.atan2(hero.y - source.y, hero.x - source.x) : hero.facing + Math.PI;
        }
        let best = null, score = Infinity;
        for (let i = 0; i < 16; i++) {
          const a = angle + i * Math.PI / 8, reach = hazard.radius + hero.r + 24;
          const point = this._safePoint(hazard.x + Math.cos(a) * reach, hazard.y + Math.sin(a) * reach, hero.r);
          if (distance(point, hazard) < hazard.radius + hero.r + 10) continue;
          const blocked = this.navigation && !this.navigation.segmentClear(hero.x, hero.y, point.x, point.y, hero.r);
          const cost = distance(hero, point) + (blocked ? 180 : 0);
          if (cost < score) { score = cost; best = point; }
        }
        hero._hazardEscape = best || this._safePoint(this.map.bases[hero.team].x, this.map.bases[hero.team].y, hero.r);
        hero._hazardEscapeId = hazard.id;
        this._clearPath(hero);
      }
      hero.recallLeft = 0; hero.targetId = null; hero.aiMove = hero._hazardEscape;
      this._move(hero, hero._hazardEscape.x, hero._hazardEscape.y, dt, 0);
      hero.aiThinkIn = 0;
      return true;
    }

    _safePoint(x, y, radius) {
      const point = { x: clamp(finite(x) ? x : this.map.width / 2, 28, this.map.width - 28), y: clamp(finite(y) ? y : this.map.height / 2, 28, this.map.height - 28) };
      if (!this.navigation) return point;
      const safe = this.navigation.nearestWalkable(point.x, point.y, radius || 19);
      return safe && finite(safe.x) && finite(safe.y) ? safe : point;
    }

    _refreshMovementNavigation() {
      if (!NAVIGATION) { this._movementNavigation = this.navigation; return; }
      const structures = this.entities.filter(e => e.alive && isStructure(e));
      const key = structures.map(e => e.id + ':' + e.x + ':' + e.y + ':' + e.r).join('|');
      if (key === this._structureNavKey) return;
      this._structureNavKey = key;
      const obstacles = this.map.obstacles.concat(structures.map(e => ({ x: e.x, y: e.y, r: Math.max(1, e.r - 4) })));
      this._movementNavigation = new NAVIGATION.Navigation({ width: this.map.width, height: this.map.height, cellSize: 40 * this.mapScale, obstacles });
    }

    _movementPoint(x, y, radius) {
      const point = this._safePoint(x, y, radius);
      return this._movementNavigation ? this._movementNavigation.nearestWalkable(point.x, point.y, radius || 19) : point;
    }

    _clearPath(entity) { entity.navPath = []; entity._navGoal = null; entity._navRefreshAt = 0; }

    _routeTarget(entity, x, y, dt, direct) {
      // Kiting and directional goals may extend beyond the map. Keep both the
      // route cache and its serialized goal inside the same playable bounds.
      x = clamp(x, 28, this.map.width - 28); y = clamp(y, 28, this.map.height - 28);
      const navigation = this._movementNavigation || this.navigation;
      if (!navigation || direct || navigation.segmentClear(entity.x, entity.y, x, y, entity.r)) {
        this._clearPath(entity);
        return { x, y, waypoint: false };
      }
      const goal = entity._navGoal;
      const path = entity.navPath || [];
      const changed = !goal || Math.hypot(goal.x - x, goal.y - y) > 65 || (this.time >= entity._navRefreshAt && Math.hypot(goal.x - x, goal.y - y) > 12);
      const obstructed = path.length > 0 && !navigation.segmentClear(entity.x, entity.y, path[0].x, path[0].y, entity.r);
      if (changed || (this.time >= entity._navRefreshAt && (!path.length || obstructed))) {
        const found = navigation.findPath(entity.x, entity.y, x, y, entity.r);
        entity.navPath = Array.isArray(found) ? found.filter(p => finite(p.x) && finite(p.y)).map(p => ({ x: p.x, y: p.y })) : [];
        entity._navGoal = { x, y }; entity._navRefreshAt = this.time + 0.65;
      }
      while (entity.navPath.length && distance(entity, entity.navPath[0]) <= Math.max(9, (entity.speed || 150) * dt * 1.6)) entity.navPath.shift();
      return entity.navPath.length ? { x: entity.navPath[0].x, y: entity.navPath[0].y, waypoint: true } : { x, y, waypoint: false };
    }

    _move(entity, x, y, dt, stopDistance, direct) {
      if (!entity.alive || entity.stunnedUntil > this.time) return;
      if (!finite(x) || !finite(y) || !finite(dt) || dt <= 0) return;
      this._resolvePosition(entity);
      const toGoalX = x - entity.x, toGoalY = y - entity.y, toGoal = Math.hypot(toGoalX, toGoalY);
      if (toGoal <= (stopDistance || 0) || toGoal < 0.001) { this._clearPath(entity); return; }
      this._cancelAttack(entity);
      // Plan to the attack/arrival distance, not a solid structure's center.
      // This also keeps moving targets from forcing a detour through their body.
      if (stopDistance > 0) { x -= toGoalX / toGoal * stopDistance; y -= toGoalY / toGoal * stopDistance; }
      const route = this._routeTarget(entity, x, y, dt, direct);
      const dx = route.x - entity.x, dy = route.y - entity.y, d = Math.hypot(dx, dy);
      if (d < 0.001) return;
      let speed = entity.speed || 150;
      if (entity.slowUntil > this.time) speed *= entity.slowFactor || 0.6;
      if (entity.hasteUntil > this.time) speed *= 1.25;
      if (entity.empowered) speed *= 1.1;
      const travel = Math.min(speed * dt, d), ux = dx / d, uy = dy / d;
      const navigation = this._movementNavigation || this.navigation;
      // Terrain and every live structure participate in the same swept move.
      // Sequentially pushing away from separate overlapping circles can trap a
      // unit between an inhibitor and a base tower, so there is one constraint set.
      const next = navigation ? navigation.resolveMove(entity.x, entity.y, entity.x + ux * travel, entity.y + uy * travel, entity.r) : { x: entity.x + ux * travel, y: entity.y + uy * travel };
      entity.x = next.x; entity.y = next.y;
      entity.facing = Math.atan2(uy, ux);
      this._resolvePosition(entity);
    }

    _resolvePosition(entity) {
      const safe = this._movementPoint(entity.x, entity.y, entity.r);
      entity.x = safe.x; entity.y = safe.y;
    }

    _dash(hero, x, y, blink) {
      this._cancelAttack(hero);
      const destination = this._safePoint(x, y, hero.r);
      const result = !blink && this.navigation ? this.navigation.resolveMove(hero.x, hero.y, destination.x, destination.y, hero.r) : destination;
      hero.x = result.x; hero.y = result.y;
      this._clearPath(hero);
      this._resolvePosition(hero);
    }

    _attack(source, target) {
      if (!this._validAttack(source, target) || source.attackCooldown > 0 || source.attackWindup) return false;
      const period = 1 / this._attackSpeed(source);
      source.attackCooldown = period;
      source.attackProgress = 0;
      source.facing = Math.atan2(target.y - source.y, target.x - source.x);
      if (source.type === 'hero') {
        const duration = clamp(period * 0.25, 0.1, 0.32);
        source.attackPeriod = period;
        source.attackWindup = { targetId: target.id, remaining: duration, duration, period };
        return true;
      }
      return this._releaseAttack(source, target);
    }

    _releaseAttack(source, target) {
      // The charge is spent only when a real melee hit or projectile is made.
      // A cancelled preparation never consumes the ranger's empowered attack.
      source.revealedUntil = this.time + 1.5;
      if (source.type === 'tower') {
        if (target.type === 'hero') {
          source.rampStacks = source.rampTargetId === target.id && this.time < source.rampUntil ? Math.min(3, (source.rampStacks || 0) + 1) : 0;
          source.rampTargetId = target.id; source.rampUntil = this.time + 4;
        } else { source.rampStacks = 0; source.rampTargetId = null; source.rampUntil = 0; }
      }
      const damage = this._basicAttackDamage(source, target);
      source.nextAttackBonus = 0;
      if (source.range > 145) {
        const speed = source.type === 'tower' ? 740 : source.type === 'monster' ? 460 : 640;
        this.projectiles.push({ id: this._id('shot'), x: source.x, y: source.y, vx: Math.cos(source.facing) * speed, vy: Math.sin(source.facing) * speed,
          source, sourceId: source.id, team: source.team, targetId: target.id, homing: true, speed, damage,
          damageType: 'physical', r: source.type === 'tower' ? 8 : 4.5, color: source.team < 2 ? TEAM_COLORS[source.team] : '#e5be7b',
          kind: source.type === 'tower' ? 'tower' : 'basic', life: 2.2, maxLife: 2.2 });
      } else {
        this.damage(target, damage, source, 'physical');
        this._effect('slash', target.x, target.y, 30, source.team < 2 ? TEAM_COLORS[source.team] : '#e5bd80', 0.2, { x2: source.x, y2: source.y });
      }
      return true;
    }

    _basicAttackDamage(source, target) {
      let damage = source.damage + (source.nextAttackBonus || 0);
      if (source.empowered) damage *= 1.4;
      if (source.type === 'tower' && target.type === 'hero') damage *= 1 + (source.rampStacks || 0) * 0.22;
      if (source.type === 'minion' && isStructure(target) && (source.kind === 'siege' || source.kind === 'super')) damage *= 1.6;
      return damage;
    }

    _damageValue(target, amount, source, kind) {
      let resistance = target.armor || 0;
      if (target.guardUntil > this.time) resistance += 26;
      if (kind === 'magic') resistance *= 0.72;
      let value = kind === 'true' ? amount : amount * 100 / (100 + Math.max(-40, resistance));
      if (source && source.team < 2) value *= 1 + this.teamBuffs[source.team].dragonStacks * 0.065;
      if (source && source.type === 'hero' && source.team === 1) value *= this.difficulty === 'easy' ? 0.8 : this.difficulty === 'hard' ? 1.12 : 1;
      if (isStructure(target) && this.time < 360 && source && source.team < 2 && !this._near(target.x, target.y, 430, e => e.type === 'minion' && e.team === source.team).length) value *= 0.2;
      return value;
    }

    canLastHit(targetOrId) {
      const target = typeof targetOrId === 'string' ? this.entities.find(e => e.id === targetOrId) : targetOrId;
      const player = this.player;
      if (!player.alive || !target || !target.alive || target.type !== 'minion' || target.team !== 1 || !this.isVisible(target, 0)) return false;
      if (distance(player, target) > player.range + target.r + 8) return false;
      const damage = this._damageValue(target, this._basicAttackDamage(player, target), player, 'physical');
      return damage + 0.000001 >= target.hp + (target.shield || 0);
    }

    _updateProjectiles(dt) {
      const kept = [];
      for (const p of this.projectiles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        const oldX = p.x, oldY = p.y;
        if (p.homing) {
          const target = this._byId.get(p.targetId);
          if (!target || !target.alive) continue;
          const d = Math.hypot(target.x - p.x, target.y - p.y);
          if (d <= p.speed * dt + target.r + p.r) {
            this.damage(target, p.damage, p.source, p.damageType);
            this._effect('burst', target.x, target.y, p.kind === 'tower' ? 24 : 12, p.color, 0.18);
            continue;
          }
          p.vx = (target.x - p.x) / Math.max(d, 0.001) * p.speed;
          p.vy = (target.y - p.y) / Math.max(d, 0.001) * p.speed;
        }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (!p.homing) {
          const travel = Math.hypot(p.x - oldX, p.y - oldY);
          p.remainingRange -= travel;
          const hits = this._near((oldX + p.x) / 2, (oldY + p.y) / 2, travel + 85, e => e.team !== p.team && e.alive && e.type !== 'ward' && !p.hitIds.has(e.id) && segmentDistance(e.x, e.y, oldX, oldY, p.x, p.y) <= e.r + p.r);
          hits.sort((a, b) => Math.hypot(a.x - oldX, a.y - oldY) - Math.hypot(b.x - oldX, b.y - oldY));
          for (const target of hits) {
            p.hitIds.add(target.id);
            this.damage(target, p.damage * (isStructure(target) ? 0.4 : 1), p.source, p.damageType);
            if (p.slow) this._slow(target, p.slow, 1.5);
            this._effect('burst', target.x, target.y, 35, p.color, 0.25);
            p.remainingHits--;
            p.damage *= 0.85;
            if (p.remainingHits <= 0) break;
          }
          if (p.remainingHits <= 0 || p.remainingRange <= 0) continue;
        }
        if (p.x < 0 || p.y < 0 || p.x > this.map.width || p.y > this.map.height) continue;
        kept.push(p);
      }
      this.projectiles = kept;
    }

    damage(targetOrId, amount, sourceOrId, kind) {
      const target = typeof targetOrId === 'string' ? this._byId.get(targetOrId) : targetOrId;
      const source = typeof sourceOrId === 'string' ? this._byId.get(sourceOrId) : sourceOrId;
      if (!target || !target.alive || !finite(amount) || amount <= 0 || this.isProtected(target)) return 0;
      if (source && source.team === target.team) return 0;
      kind = kind === 'magic' || kind === 'true' ? kind : 'physical';
      let value = this._damageValue(target, amount, source, kind);
      const absorbed = Math.min(target.shield || 0, value);
      target.shield = Math.max(0, (target.shield || 0) - absorbed);
      value -= absorbed;
      const hpDamage = Math.min(target.hp, value);
      target.hp = Math.max(0, target.hp - value);
      if (target.isPlayer) this._recordPlayerDamage(source, hpDamage, absorbed, kind);
      target.lastDamageAt = this.time;
      if (target.recallLeft > 0) {
        target.recallLeft = 0;
        if (target.isPlayer) this._event('피해를 받아 귀환이 취소되었습니다.', 'bad');
      }
      if (target.type === 'monster' && source && source.alive) target.targetId = source.id;
      if (source && source.type === 'hero') {
        source.damageDealt += hpDamage;
        source.revealedUntil = this.time + 1.8;
        if (target.type === 'hero') {
          target.contributors[source.id] = this.time;
          target.lastHeroHitId = source.id;
          target.lastHeroHitAt = this.time;
          for (const tower of this._near(target.x, target.y, 440, e => e.type === 'tower' && e.team === target.team)) {
            if (distance(source, tower) < tower.range + source.r) { tower.aggroTargetId = source.id; tower.aggroUntil = this.time + 3; }
          }
        }
      }
      if (target.type === 'hero' || (source && source.isPlayer) || isStructure(target)) {
        const color = absorbed > hpDamage ? '#b9dfff' : target.team === 0 ? '#ffb2a4' : kind === 'magic' ? '#d6b6ff' : '#fff1c6';
        if (this.time - (target.lastFloaterAt || -100) > 0.09) { this._float(target.x, target.y, Math.round(hpDamage + absorbed), color); target.lastFloaterAt = this.time; }
      }
      if (target.hp <= 0) this.killEntity(target, source);
      return hpDamage + absorbed;
    }

    _recordPlayerDamage(source, damage, absorbed, kind) {
      if (damage <= 0 && absorbed <= 0) return;
      this._damageHistory = this._damageHistory.filter(hit => this.time - hit.at <= 10);
      this._damageHistory.push({ at: this.time, sourceId: source ? source.id : 'environment', sourceName: source ? source.name : '전장',
        sourceType: source ? source.type : 'environment', sourceTeam: source ? source.team : null, damage, absorbed, kind });
      if (this._damageHistory.length > 256) this._damageHistory.splice(0, this._damageHistory.length - 256);
    }

    _captureDeathRecap(killer) {
      const grouped = new Map();
      for (const hit of this._damageHistory) {
        if (this.time - hit.at > 10) continue;
        let row = grouped.get(hit.sourceId);
        if (!row) {
          row = { sourceId: hit.sourceId, sourceName: hit.sourceName, sourceType: hit.sourceType, sourceTeam: hit.sourceTeam,
            damage: 0, absorbed: 0, hits: 0, physical: 0, magic: 0, true: 0 };
          grouped.set(hit.sourceId, row);
        }
        row.damage += hit.damage; row.absorbed += hit.absorbed; row.hits++; row[hit.kind] += hit.damage;
      }
      let sources = [...grouped.values()].sort((a, b) => (b.damage + b.absorbed) - (a.damage + a.absorbed));
      const totalDamage = sources.reduce((sum, s) => sum + s.damage, 0);
      const totalAbsorbed = sources.reduce((sum, s) => sum + s.absorbed, 0);
      if (sources.length > 12) {
        const other = { sourceId: 'other', sourceName: '기타 피해', sourceType: 'mixed', sourceTeam: null, damage: 0, absorbed: 0, hits: 0, physical: 0, magic: 0, true: 0 };
        for (const row of sources.slice(11)) for (const key of ['damage', 'absorbed', 'hits', 'physical', 'magic', 'true']) other[key] += row[key];
        sources = sources.slice(0, 11).concat(other);
      }
      const killerName = killer ? (killer.team === 0 ? '아군 ' : killer.team === 1 ? '적군 ' : '중립 ') + killer.name : '전장';
      this._deathRecap = { at: this.time, killerName, totalDamage, totalAbsorbed, windowSeconds: 10, sources };
    }

    getDeathRecap() {
      return this._deathRecap ? Object.assign({}, this._deathRecap, { sources: this._deathRecap.sources.map(row => Object.assign({}, row)) }) : null;
    }

    killEntity(targetOrId, sourceOrId) {
      const target = typeof targetOrId === 'string' ? this._byId.get(targetOrId) : targetOrId;
      let source = typeof sourceOrId === 'string' ? this._byId.get(sourceOrId) : sourceOrId;
      if (!target || !target.alive) return false;
      this._cancelAttack(target);
      for (const hero of this.entities) if (hero.type === 'hero' && hero.attackWindup?.targetId === target.id) this._cancelAttack(hero);
      target.alive = false; target.hp = 0; target.shield = 0; target.deathAt = this.time; target.targetId = null; target.recallLeft = 0;
      let killer = source && source.type === 'hero' ? source : null;
      if (!killer && target.type === 'hero' && this.time - (target.lastHeroHitAt == null ? -100 : target.lastHeroHitAt) < 10) killer = this._byId.get(target.lastHeroHitId);
      const killerTeam = killer && killer.team < 2 ? killer.team : source && source.team < 2 ? source.team : null;
      if (target.type === 'hero') {
        if (target.isPlayer) this._captureDeathRecap(killer || source);
        target.deaths++;
        if (killerTeam !== null && killerTeam !== target.team) this.teamKills[killerTeam]++;
        const reward = 185 + target.level * 8 + Math.min(target.streak || 0, 5) * 35;
        if (killer && killer.team !== target.team) { killer.kills++; killer.streak++; killer.gold += reward; this.gainXp(killer, 135 + target.level * 12); if (killer.isPlayer) this._float(killer.x, killer.y - 30, '+' + reward + 'G', '#ffdf81'); }
        for (const [id, at] of Object.entries(target.contributors || {})) {
          const helper = this._byId.get(id);
          if (helper && helper !== killer && helper.type === 'hero' && helper.team !== target.team && this.time - at <= 10) { helper.assists++; helper.gold += 70; this.gainXp(helper, 70); }
        }
        target.streak = 0; target.contributors = {};
        target.respawnIn = clamp(7 + target.level * 0.65 + this.time / 80, 7, 22);
        target.respawnAt = this.time + target.respawnIn;
        target.retreating = false;
        this._clearPath(target);
        if (target.isPlayer) { this._input = { x: 0, y: 0 }; this._moveDestination = null; this._attackMoveDestination = null; this._attackMoveTargetId = null; this._playerTargetId = null; this._focusTargetId = null; }
        if (target.id === this._focusTargetId) this._focusTargetId = null;
        const attacker = killer || source;
        const attackerName = attacker ? (attacker.team === 0 ? '아군 ' : attacker.team === 1 ? '적군 ' : '중립 ') + attacker.name : '전장';
        this._event(attackerName + ' → ' + (target.team === 0 ? '아군 ' : '적군 ') + target.name + ' 처치', target.team === 1 ? 'good' : 'bad');
        this._effect('burst', target.x, target.y, 65, TEAM_COLORS[target.team], 0.55);
      } else if (target.type === 'minion') {
        if (killer && killer.team !== target.team) { killer.gold += target.goldValue; killer.cs++; if (killer.isPlayer) this._float(target.x, target.y - 10, '+' + target.goldValue, '#f3d67d'); }
        const allies = this._near(target.x, target.y, 555, e => e.type === 'hero' && e.team === 1 - target.team);
        const share = allies.length ? target.xpValue / Math.sqrt(allies.length) : 0;
        for (const hero of allies) this.gainXp(hero, share);
      } else if (target.type === 'monster') {
        target.inCombat = false;
        this._cancelMonsterHazards(target.id);
        this._validateObjectiveOrder();
        target.respawnAt = this.time + (target.kind === 'boss' ? 150 : target.kind === 'dragon' ? 85 : 38);
        target.respawnIn = target.respawnAt - this.time;
        if (killerTeam !== null) {
          if (target.kind === 'camp') {
            if (killer) { killer.gold += 68; killer.cs++; this.gainXp(killer, 100); this._heal(killer, 70); if (killer.isPlayer) this._float(target.x, target.y, '+68G', '#ffdc83'); }
          } else {
            const boss = target.kind === 'boss';
            if (boss) this.teamBuffs[killerTeam].bossUntil = this.time + 70;
            else this.teamBuffs[killerTeam].dragonStacks = Math.min(4, this.teamBuffs[killerTeam].dragonStacks + 1);
            for (const hero of this.entities) if (hero.type === 'hero' && hero.team === killerTeam) { hero.gold += boss ? 145 : 90; this.gainXp(hero, boss ? 195 : 150); if (hero.alive) this._heal(hero, hero.maxHp * 0.18); }
            this._event((killerTeam === 0 ? '아군' : '적군') + ' ' + target.name + ' 확보 · ' + (boss ? '70초 동안 동행 미니언 강화' : '팀 피해량 영구 증가'), killerTeam === 0 ? 'good' : 'bad');
            this._effect('burst', target.x, target.y, 190, boss ? '#bb9bff' : '#ffd77d', 1.0);
          }
        }
      } else if (isStructure(target)) {
        if (killerTeam !== null) for (const hero of this.entities) if (hero.type === 'hero' && hero.team === killerTeam) { hero.gold += target.type === 'inhibitor' ? 65 : 50; this.gainXp(hero, 65); }
        if (killer) killer.gold += 85;
        this._event((target.team === 1 ? '적 ' : '아군 ') + target.name + ' 파괴' + (target.type === 'inhibitor' ? ' · 강화 미니언 출격' : ''), target.team === 1 ? 'good' : 'bad');
        this._effect('burst', target.x, target.y, target.type === 'nexus' ? 250 : 100, TEAM_COLORS[target.team], 1.0);
        if (target.type === 'nexus') { this.over = true; this.winner = 1 - target.team; this.endReason = 'nexus'; this._event(this.winner === 0 ? '승리 · 적 넥서스를 파괴했습니다!' : '패배 · 아군 넥서스가 무너졌습니다.', this.winner === 0 ? 'good' : 'bad'); }
      }
      return true;
    }

    _respawnHero(hero) {
      const base = this.map.bases[hero.team];
      hero.alive = true; hero.hp = hero.maxHp; hero.mana = hero.maxMana; hero.shield = 0;
      hero.x = base.x + (hero.team === 0 ? 8 : -8); hero.y = base.y;
      hero.respawnIn = 0; hero.recallLeft = 0; hero.targetId = null; hero.aiMove = null;
      this._clearPath(hero);
      hero.stunnedUntil = 0; hero.slowUntil = 0; hero.lastDamageAt = -100; hero.lastHeroHitId = null; hero.lastHeroHitAt = -100;
      hero.attackCooldown = 0; hero.attackWindup = null; hero.attackProgress = 1;
      hero.attackPeriod = 1 / this._attackSpeed(hero); hero.retreating = false; hero.aiThinkIn = 0;
      this._effect('teleport', hero.x, hero.y, 90, TEAM_COLORS[hero.team], 0.7);
      if (hero.isPlayer) { this._damageHistory = []; this._event('부활했습니다 · 기지에서 아이템을 구매하고 전선으로 복귀하세요.', 'good'); }
    }

    _heal(hero, value) {
      if (!hero || !hero.alive) return 0;
      const amount = Math.min(value, hero.maxHp - hero.hp);
      hero.hp += amount;
      if (amount > 20) { this._float(hero.x, hero.y, '+' + Math.round(amount), '#8ff7bb'); this._effect('heal', hero.x, hero.y, 45, '#8ff7bb', 0.45); }
      return amount;
    }

    _shield(hero, value, duration) {
      hero.shield = Math.max(hero.shield || 0, value);
      hero.shieldUntil = Math.max(hero.shieldUntil || 0, this.time + duration);
      this._effect('shield', hero.x, hero.y, 43, '#b4deff', Math.min(duration, 1.2));
    }

    _slow(target, factor, duration) {
      if (isStructure(target) || target.type === 'ward') return;
      target.slowFactor = target.slowUntil > this.time ? Math.min(target.slowFactor || 1, factor) : factor;
      target.slowUntil = Math.max(target.slowUntil || 0, this.time + duration);
    }

    _aim(hero, x, y, maxRange) {
      if (!finite(x) || !finite(y)) {
        const range = maxRange || 650;
        const focus = hero.isPlayer ? this.getFocusTarget() : null;
        const selected = focus && distance(hero, focus) <= range ? focus : this._byId.get(hero.isPlayer ? this._playerTargetId : hero.targetId);
        const enemy = selected && this._isAttackableEnemy(hero, selected) && distance(hero, selected) <= range && this.isVisible(selected, hero.team) ? selected : this._nearest(hero, range,
          e => e.team !== hero.team && e.alive && !this.isProtected(e) && e.type !== 'ward' && this.isVisible(e, hero.team), e => e.type === 'hero' ? -120 : e.type === 'monster' ? 10 : 20);
        if (enemy) { x = enemy.x; y = enemy.y; }
        else { x = hero.x + Math.cos(hero.facing || 0) * (maxRange || 200); y = hero.y + Math.sin(hero.facing || 0) * (maxRange || 200); }
      }
      const dx = x - hero.x, dy = y - hero.y, d = Math.hypot(dx, dy);
      const length = Math.min(d, maxRange || d);
      const angle = d > 0.001 ? Math.atan2(dy, dx) : hero.facing || 0;
      return { x: clamp(hero.x + Math.cos(angle) * length, 28, this.map.width - 28), y: clamp(hero.y + Math.sin(angle) * length, 28, this.map.height - 28), angle, dx: Math.cos(angle), dy: Math.sin(angle) };
    }

    cast(slot, x, y) {
      const result = this._cast(this.player, String(slot).toLowerCase(), x, y);
      if (!result.ok) this._inputError(result.reason);
      return result;
    }

    _cast(hero, slot, x, y) {
      if (!this.started) return { ok: false, reason: '먼저 경기를 시작하세요.' };
      if (this.over) return { ok: false, reason: '경기가 종료되었습니다.' };
      if (this.paused) return { ok: false, reason: '일시정지를 해제하세요.' };
      if (!hero.alive) return { ok: false, reason: '부활 후 사용할 수 있습니다.' };
      if (!Object.prototype.hasOwnProperty.call(hero.cd, slot)) return { ok: false, reason: '알 수 없는 스킬입니다.' };
      if (hero.stunnedUntil > this.time && slot !== 'f') return { ok: false, reason: '기절 중에는 사용할 수 없습니다.' };
      if (slot === 'r' && hero.level < 6) return { ok: false, reason: '궁극기는 6레벨부터 배울 수 있습니다.' };
      if (hero.cd[slot] > 0.001) return { ok: false, reason: '재사용 대기 중입니다.' };
      const definition = HERO_BY_ID[hero.hero].skills[slot];
      const skill = definition ? this.getSkillInfo(slot, hero) : null;
      if (skill && skill.rank <= 0) return { ok: false, reason: '아직 배우지 않은 스킬입니다. + 버튼으로 스킬 포인트를 사용하세요.' };
      const cost = skill ? skill.cost : 0;
      const rankDamage = skill ? skill.damageMultiplier : 1;
      if (hero.mana + 0.0001 < cost) return { ok: false, reason: '마나가 부족합니다.' };
      if (['q', 'w', 'e', 'r', 'd'].includes(slot)) this._cancelAttack(hero);
      hero.recallLeft = 0;
      hero.mana -= cost;
      hero.cd[slot] = skill ? skill.cooldown : slot === 'd' ? 32 : slot === 'f' ? 28 : 22;
      const color = HERO_BY_ID[hero.hero].color;
      const aim = this._aim(hero, x, y, definition ? definition.range || 200 : slot === 'ward' ? 450 : 300);
      hero.facing = aim.angle;
      if (slot !== 'ward') hero.revealedUntil = this.time + 1.2;
      if (slot === 'd') {
        const old = { x: hero.x, y: hero.y };
        this._dash(hero, aim.x, aim.y, true);
        this._effect('teleport', old.x, old.y, 45, '#ffe9ac', 0.35);
        this._effect('teleport', hero.x, hero.y, 65, '#ffe9ac', 0.45);
      } else if (slot === 'f') {
        this._heal(hero, 220 + hero.maxHp * 0.08);
        for (const ally of this._near(hero.x, hero.y, 240, e => e.type === 'hero' && e.team === hero.team && e !== hero)) this._heal(ally, 150 + hero.level * 10);
        hero.hasteUntil = this.time + 1.6;
        this._effect('heal', hero.x, hero.y, 190, '#85efbb', 0.7);
      } else if (slot === 'ward') {
        const wardPosition = this._safePoint(aim.x, aim.y, 12);
        const wards = this.entities.filter(e => e.type === 'ward' && e.ownerId === hero.id && e.alive);
        if (wards.length >= 2) { wards[0].alive = false; wards[0].deathAt = this.time; }
        this._add({ id: this._id('ward'), type: 'ward', team: hero.team, ownerId: hero.id, x: wardPosition.x, y: wardPosition.y, r: 12,
          hp: 60, maxHp: 60, armor: 0, alive: true, name: '빛의 와드', kind: 'ward', expiresAt: this.time + 50, shield: 0 });
        this._effect('ring', wardPosition.x, wardPosition.y, 85, TEAM_COLORS[hero.team], 0.45);
      } else if (hero.hero === 'mage') {
        if (slot === 'q') this._skillProjectile(hero, aim, 620, 710, 18, (115 + hero.level * 9 + hero.abilityPower * 0.82) * rankDamage, 'magic', 1, color, 0.7);
        else if (slot === 'w') this._scheduleArea(hero, aim.x, aim.y, 150, (100 + hero.level * 8 + hero.abilityPower * 0.7) * rankDamage, 'magic', 0.4, color, { slow: 0.48, slowDuration: 2.5 });
        else if (slot === 'e') { this._shield(hero, 120 + hero.abilityPower * 0.7, 4); hero.hasteUntil = this.time + 4; }
        else if (slot === 'r') this._scheduleArea(hero, aim.x, aim.y, 200, (280 + hero.level * 12 + hero.abilityPower * 1.1) * rankDamage, 'magic', 0.65, '#e1c8ff', { stun: 1.05 });
      } else if (hero.hero === 'warrior') {
        if (slot === 'q') {
          const old = { x: hero.x, y: hero.y };
          this._dash(hero, aim.x, aim.y, false);
          const enemies = this._near((old.x + hero.x) / 2, (old.y + hero.y) / 2, 240, e => e.team !== hero.team && segmentDistance(e.x, e.y, old.x, old.y, hero.x, hero.y) < 60 + e.r);
          for (const e of enemies) { this.damage(e, (85 + hero.damage * 1.0) * rankDamage * (isStructure(e) ? 0.35 : 1), hero, 'physical'); if (!isStructure(e)) e.stunnedUntil = this.time + 0.35; }
          this._effect('slash', old.x, old.y, 95, color, 0.35, { x2: hero.x, y2: hero.y });
        } else if (slot === 'w') { this._shield(hero, 150 + hero.maxHp * 0.16, 4); hero.guardUntil = this.time + 4; }
        else if (slot === 'e') this._scheduleArea(hero, hero.x, hero.y, 170, (75 + hero.damage * 1.15) * rankDamage, 'physical', 0, color, { slow: 0.62, slowDuration: 2 });
        else if (slot === 'r') {
          const old = { x: hero.x, y: hero.y };
          this._dash(hero, aim.x, aim.y, false);
          this._effect('slash', old.x, old.y, 70, color, 0.4, { x2: hero.x, y2: hero.y });
          this._shield(hero, 180 + hero.level * 18, 4);
          this._scheduleArea(hero, hero.x, hero.y, 190, (190 + hero.damage * 1.3) * rankDamage, 'physical', 0.12, '#ffdba2', { stun: 1.25 });
        }
      } else {
        if (slot === 'q') this._skillProjectile(hero, aim, 720, 870, 16, (75 + hero.damage * 1.25) * rankDamage, 'physical', 3, '#b3f7c6');
        else if (slot === 'w') { hero.rapidUntil = this.time + 4.5; this._effect('ring', hero.x, hero.y, 60, '#b3f7c6', 0.5); }
        else if (slot === 'e') {
          const old = { x: hero.x, y: hero.y };
          this._dash(hero, aim.x, aim.y, false);
          hero.nextAttackBonus = (50 + hero.damage * 0.6) * rankDamage; hero.attackCooldown = 0;
          this._effect('slash', old.x, old.y, 35, '#b3f7c6', 0.35, { x2: hero.x, y2: hero.y });
        } else if (slot === 'r') {
          this._effect('ring', aim.x, aim.y, 200, '#c3ffd0', 2.9);
          for (let i = 0; i < 6; i++) this._scheduleArea(hero, aim.x, aim.y, 200, (38 + hero.damage * 0.42) * rankDamage, 'physical', 0.25 + i * 0.45, '#b3f7c6', { slow: 0.67, slowDuration: 0.7, quiet: true });
        }
      }
      return { ok: true };
    }

    _skillProjectile(hero, aim, range, speed, radius, damage, damageType, hits, color, slow) {
      this.projectiles.push({ id: this._id('spell'), x: hero.x + aim.dx * 24, y: hero.y + aim.dy * 24,
        vx: aim.dx * speed, vy: aim.dy * speed, speed, team: hero.team, source: hero, sourceId: hero.id,
        r: radius, damage, damageType, remainingRange: range, remainingHits: hits, hitIds: new Set(), homing: false,
        color, slow: slow || 0, kind: hero.hero === 'ranger' ? 'arrow' : 'magic', life: range / speed + 0.2, maxLife: range / speed + 0.2 });
      this._effect('burst', hero.x, hero.y, 28, color, 0.18);
    }

    _scheduleArea(source, x, y, radius, damage, damageType, delay, color, flags) {
      const action = Object.assign({ kind: 'area', source, sourceId: source.id, x, y, radius, damage, damageType, color, at: this.time + delay }, flags || {});
      this._pending.push(action);
      if (!action.quiet) this._effect('ring', x, y, radius, color, Math.max(delay, 0.28));
    }

    _resolveArea(action) {
      for (const target of this._near(action.x, action.y, action.radius, e => e.team !== action.source.team && e.type !== 'ward')) {
        this.damage(target, action.damage * (isStructure(target) ? 0.35 : 1), action.source, action.damageType);
        if (!isStructure(target)) {
          if (action.slow) this._slow(target, action.slow, action.slowDuration || 1.5);
          if (action.stun) target.stunnedUntil = Math.max(target.stunnedUntil || 0, this.time + action.stun);
        }
      }
      this._effect(action.damageType === 'physical' ? 'slash' : 'burst', action.x, action.y, action.radius, action.color, action.quiet ? 0.27 : 0.5);
    }

    _inputError(reason) {
      if (this._lastError === reason && this.time - (this._lastErrorAt || 0) < 1.3) return;
      this._lastError = reason; this._lastErrorAt = this.time;
      this._event(reason, 'info');
    }

    setInputVector(x, y) {
      x = finite(x) ? x : 0; y = finite(y) ? y : 0;
      const length = Math.hypot(x, y);
      this._input.x = length > 1 ? x / length : x;
      this._input.y = length > 1 ? y / length : y;
      if (length > 0.001) { this._cancelAttack(this.player); this._moveDestination = null; this._attackMoveDestination = null; this._attackMoveTargetId = null; this._playerTargetId = null; this.player.recallLeft = 0; this._clearPath(this.player); }
    }

    commandMove(x, y) {
      if (!finite(x) || !finite(y) || !this.player.alive || this.over) return { ok: false, reason: '이동할 수 없습니다.' };
      this._cancelAttack(this.player);
      this._moveDestination = this._movementPoint(x, y, this.player.r);
      this._attackMoveDestination = null; this._attackMoveTargetId = null; this._input = { x: 0, y: 0 };
      this._playerTargetId = null; this.player.targetId = null; this.player.recallLeft = 0;
      this._clearPath(this.player);
      return { ok: true };
    }

    commandAttackMove(x, y) {
      if (!finite(x) || !finite(y) || !this.player.alive || this.over) return { ok: false, reason: '공격 이동을 할 수 없습니다.' };
      this._cancelAttack(this.player);
      this._attackMoveDestination = this._movementPoint(x, y, this.player.r);
      this._moveDestination = null; this._playerTargetId = null; this._attackMoveTargetId = null;
      this._input = { x: 0, y: 0 }; this.player.targetId = null; this.player.recallLeft = 0;
      this._clearPath(this.player);
      return { ok: true };
    }

    stop() {
      this._cancelAttack(this.player);
      this._input = { x: 0, y: 0 }; this._moveDestination = null; this._attackMoveDestination = null;
      this._playerTargetId = null; this._attackMoveTargetId = null; this._focusTargetId = null; this.player.targetId = null;
      this.player.recallLeft = 0; this._clearPath(this.player);
      return { ok: true };
    }

    attackTarget(id) {
      if (!this.started || this.over || this.paused) return { ok: false, reason: '지금은 공격 명령을 내릴 수 없습니다.' };
      const target = this.entities.find(e => e.id === id);
      if (!target || !target.alive || !this.player.alive || target.team === 0 || !this.isVisible(target, 0)) return { ok: false, reason: '공격할 대상을 확인할 수 없습니다.' };
      if (this.isProtected(target)) { const result = { ok: false, reason: '앞선 구조물을 먼저 파괴해야 합니다.' }; this._inputError(result.reason); return result; }
      if (this.player.attackWindup && this.player.attackWindup.targetId !== id) this._cancelAttack(this.player);
      this._focusTargetId = this._canFocus(target) ? target.id : null;
      this._playerTargetId = id; this.player.targetId = id; this._moveDestination = null; this._attackMoveDestination = null; this._attackMoveTargetId = null;
      this._input = { x: 0, y: 0 }; this.player.recallLeft = 0; this._clearPath(this.player);
      return { ok: true };
    }

    _canFocus(target) {
      return !!(this.started && !this.over && this.player.alive && target && target.type === 'hero' && target.alive &&
        target.team === 1 - this.player.team && distance(this.player, target) <= 900 && this.isVisible(target, this.player.team));
    }

    getFocusTarget() {
      const target = this._byId.get(this._focusTargetId);
      if (this._canFocus(target)) return target;
      this._focusTargetId = null;
      return null;
    }

    setFocusTarget(id) {
      if (id === null) { this._focusTargetId = null; return { ok: true, targetId: null }; }
      if (this.paused || !this.started || this.over || !this.player.alive) return { ok: false, reason: '지금은 타깃을 고정할 수 없습니다.' };
      const target = this._byId.get(id);
      if (!this._canFocus(target)) return { ok: false, reason: '900 거리 안에 보이는 적 영웅을 선택하세요.' };
      const preparing = this._byId.get(this.player.attackWindup?.targetId);
      if (preparing && preparing.type === 'hero' && preparing.id !== id) this._cancelAttack(this.player);
      const chasing = this._byId.get(this._playerTargetId);
      if (chasing && chasing.type === 'hero' && chasing.id !== target.id) {
        // Choosing a different hero must not leave an old explicit hero chase
        // fighting the new preference. A focus change never creates a new chase.
        this._playerTargetId = null;
        if (this.player.targetId === chasing.id) this.player.targetId = null;
        if (!this._moveDestination && !this._attackMoveDestination && !this._input.x && !this._input.y) this._clearPath(this.player);
      }
      this._focusTargetId = target.id;
      return { ok: true, targetId: target.id };
    }

    cycleFocusTarget() {
      if (this.paused || !this.started || this.over || !this.player.alive) return { ok: false, reason: '지금은 타깃을 고정할 수 없습니다.' };
      const current = this.getFocusTarget();
      const targets = this.entities.filter(e => this._canFocus(e)).sort((a, b) => distance(this.player, a) - distance(this.player, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (!targets.length) return { ok: false, reason: '주변에 보이는 적 영웅이 없습니다.' };
      const index = current ? targets.findIndex(e => e.id === current.id) : -1;
      return this.setFocusTarget(targets[(index + 1) % targets.length].id);
    }

    recall() {
      const p = this.player;
      if (!this.started || !p.alive || this.over || this.paused) return { ok: false, reason: '지금은 귀환할 수 없습니다.' };
      if (p.recallLeft > 0) { p.recallLeft = 0; return { ok: true, cancelled: true }; }
      this.stop(); p.recallLeft = 4;
      this._effect('ring', p.x, p.y, 60, '#75dfff', 4);
      return { ok: true };
    }

    buy(itemId) {
      const result = this._buy(this.player, itemId);
      if (!result.ok) this._inputError(result.reason);
      else this._event(ITEM_BY_ID[itemId].name + (result.consumedIndices.length ? ' 조합' : ' 구매') + ' · ' + result.cost + 'G 사용', 'good');
      return result;
    }

    prepareItem(itemId) {
      if (this.started || this.over) return { ok: false, reason: '출전 장비는 경기 시작 전에만 준비할 수 있습니다.' };
      const result = this._buy(this.player, itemId, true);
      if (result.ok) this._event(ITEM_BY_ID[itemId].name + ' 준비 · ' + result.cost + 'G 사용', 'good');
      return result;
    }

    _purchaseInfo(hero, itemId, preparing) {
      const item = ITEM_BY_ID[itemId];
      const info = { cost: item ? item.cost : 0, ownedComponents: [], missingComponents: [], consumedIndices: [], canBuy: false };
      if (!item) { info.reason = '존재하지 않는 아이템입니다.'; return info; }
      const used = new Set();
      for (const component of item.components || []) {
        const index = hero.inventory.findIndex((entry, i) => !used.has(i) && (typeof entry === 'string' ? entry : entry.id) === component);
        if (index >= 0) {
          used.add(index); info.consumedIndices.push(index); info.ownedComponents.push(component);
          info.cost -= ITEM_BY_ID[component].cost;
        } else info.missingComponents.push(component);
      }
      info.cost = Math.max(0, info.cost);
      if (this.over) info.reason = '경기가 종료되었습니다.';
      else if (!(preparing && !this.started) && hero.alive && distance(hero, this.map.bases[hero.team]) > 180) info.reason = '기지로 귀환하거나 부활 대기 중에 거래하세요.';
      else if (hero.inventory.length - info.consumedIndices.length >= 6) info.reason = '아이템 슬롯 6개가 모두 찼습니다.';
      else if (hero.gold + 0.0001 < info.cost) info.reason = '골드가 부족합니다.';
      else info.canBuy = true;
      return info;
    }

    getPurchaseInfo(itemId) { return this._purchaseInfo(this.player, itemId); }

    _buy(hero, itemId, preparing) {
      const info = this._purchaseInfo(hero, itemId, preparing);
      if (!info.canBuy) return { ok: false, reason: info.reason };
      const item = ITEM_BY_ID[itemId];
      const oldHp = hero.maxHp, oldMana = hero.maxMana;
      const consumed = new Set(info.consumedIndices);
      const nextInventory = hero.inventory.filter((entry, i) => !consumed.has(i));
      nextInventory.push(item.id);
      hero.gold -= info.cost;
      hero.inventory = nextInventory;
      this._recalculate(hero);
      if (hero.alive) { hero.hp = Math.min(hero.maxHp, hero.hp + hero.maxHp - oldHp); hero.mana = Math.min(hero.maxMana, hero.mana + hero.maxMana - oldMana); }
      return { ok: true, itemId: item.id, cost: info.cost, consumedIndices: info.consumedIndices.slice() };
    }

    sell(index) {
      const hero = this.player;
      let reason = null;
      if (!Number.isInteger(index) || index < 0 || index >= hero.inventory.length) reason = '판매할 아이템을 선택하세요.';
      else if (this.over) reason = '경기가 종료되었습니다.';
      else if (hero.alive && distance(hero, this.map.bases[hero.team]) > 180) reason = '기지로 귀환하거나 부활 대기 중에 거래하세요.';
      if (reason) { this._inputError(reason); return { ok: false, reason }; }
      const entry = hero.inventory[index];
      const item = ITEM_BY_ID[typeof entry === 'string' ? entry : entry.id];
      if (!item) return { ok: false, reason: '판매할 수 없는 아이템입니다.' };
      const refund = Math.floor(item.cost * 0.7 + 0.000001);
      hero.inventory.splice(index, 1); hero.gold += refund;
      this._recalculate(hero);
      hero.hp = Math.min(hero.hp, hero.maxHp); hero.mana = Math.min(hero.mana, hero.maxMana);
      this._event(item.name + ' 판매 · ' + refund + 'G 환급', 'info');
      return { ok: true, itemId: item.id, refund };
    }

    _autoBuy(hero) {
      const builds = {
        mage: ['focus', 'boots', 'crown', 'plate', 'focus', 'crown', 'heart', 'bow'],
        warrior: ['blade', 'heart', 'boots', 'edge', 'plate', 'blade', 'edge', 'heart'],
        ranger: ['bow', 'boots', 'blade', 'bow', 'edge', 'plate', 'heart']
      };
      const build = builds[hero.hero];
      if (!Number.isInteger(hero.buildIndex)) hero.buildIndex = 0;
      // The plan cursor advances independently of slot count because combining
      // an item consumes a component without adding an inventory slot.
      for (let attempts = 0; attempts < 12 && hero.buildIndex < build.length; attempts++) {
        if (!this._buy(hero, build[hero.buildIndex]).ok) break;
        hero.buildIndex++;
      }
    }

    setAutoAttack(enabled) {
      this.player.autoAttack = !!enabled;
      if (!enabled && !this._playerTargetId && !this._attackMoveDestination) this._cancelAttack(this.player);
    }

    isProtected(entity) {
      if (!entity || !isStructure(entity)) return false;
      const structures = this.entities;
      if (entity.type === 'tower' && entity.structureTier === 'outer') return false;
      if (entity.type === 'tower' && entity.structureTier === 'inner') return structures.some(e => e.alive && e.type === 'tower' && e.team === entity.team && e.lane === entity.lane && e.structureTier === 'outer');
      if (entity.type === 'inhibitor') return structures.some(e => e.alive && e.type === 'tower' && e.team === entity.team && e.lane === entity.lane && e.structureTier !== 'base');
      const laneOpen = structures.some(e => e.type === 'inhibitor' && e.team === entity.team && !e.alive);
      if (entity.type === 'tower' && entity.structureTier === 'base') return !laneOpen;
      if (entity.type === 'nexus') return !laneOpen || structures.some(e => e.alive && e.type === 'tower' && e.team === entity.team && e.structureTier === 'base');
      return false;
    }

    visibilityAt(x, y, team) {
      team = team === 1 ? 1 : 0;
      if (!finite(x) || !finite(y)) return false;
      const base = this.map.bases[team];
      if (sq(x - base.x) + sq(y - base.y) <= 450 * 450) return true;
      const viewers = this._vision[team];
      for (const e of viewers) {
        if (!e.alive) continue;
        const range = e.type === 'ward' ? 480 : e.type === 'hero' ? 420 : e.type === 'tower' ? 420 : e.type === 'nexus' ? 450 : e.type === 'inhibitor' ? 270 : 250;
        if (sq(x - e.x) + sq(y - e.y) <= range * range) return true;
      }
      return false;
    }

    isVisible(entity, team) {
      if (!entity) return false;
      team = team === 1 ? 1 : 0;
      if (entity.team === team || isStructure(entity)) return true;
      if (!entity.alive) return false;
      if (!this.visibilityAt(entity.x, entity.y, team)) return false;
      if (entity.type !== 'hero' || entity.revealedUntil > this.time) return true;
      const brush = this.map.brushes.find(b => sq(entity.x - b.x) + sq(entity.y - b.y) <= b.r * b.r);
      if (!brush) return true;
      return this._vision[team].some(e => e.alive && (sq(e.x - entity.x) + sq(e.y - entity.y) < 95 * 95 || sq(e.x - brush.x) + sq(e.y - brush.y) < brush.r * brush.r));
    }

    getSnapshot() {
      const round = n => finite(n) ? Math.round(n * 100) / 100 : n;
      const heroState = h => {
        const out = {};
        for (const key of ['id', 'type', 'hero', 'team', 'name', 'lane', 'role', 'x', 'y', 'r', 'hp', 'maxHp', 'mana', 'maxMana', 'level', 'xp', 'nextXp', 'gold', 'damage', 'range', 'speed', 'armor', 'abilityPower', 'attackSpeed', 'shield', 'alive', 'respawnIn', 'recallLeft', 'kills', 'deaths', 'assists', 'cs', 'autoAttack', 'skillPoints']) out[key] = round(h[key]);
        out.inventory = h.inventory.slice(); out.cd = Object.fromEntries(Object.entries(h.cd).map(([k, v]) => [k, round(v)]));
        out.skillRanks = Object.assign({}, h.skillRanks); out.navPath = (h.navPath || []).map(p => ({ x: round(p.x), y: round(p.y) }));
        out.attackState = this.getAttackState(h);
        return out;
      };
      const counts = { total: this.entities.length, alive: 0, heroes: 0, minions: 0, towers: 0, inhibitors: 0, nexuses: 0, monsters: 0, wards: 0, byType: {}, byTeam: [0, 0, 0] };
      const plurals = { hero: 'heroes', minion: 'minions', tower: 'towers', inhibitor: 'inhibitors', nexus: 'nexuses', monster: 'monsters', ward: 'wards' };
      for (const e of this.entities) {
        counts[plurals[e.type]] = (counts[plurals[e.type]] || 0) + 1;
        counts.byType[e.type] = (counts.byType[e.type] || 0) + 1;
        if (e.alive) { counts.alive++; counts.byTeam[e.team]++; }
      }
      return { time: round(this.time), started: this.started, paused: this.paused, over: this.over, winner: this.winner, endReason: this.endReason,
        difficulty: this.difficulty, mapScale: this.mapScale, map: { width: this.map.width, height: this.map.height }, focusTargetId: this.getFocusTarget()?.id || null, waveNumber: this.waveNumber, nextWaveAt: round(this.nextWaveAt), player: heroState(this.player), order: this.order ? Object.assign({}, this.order) : null,
        teamKills: this.teamKills.slice(), entities: counts, counts, entityCounts: counts,
        heroes: this.entities.filter(e => e.type === 'hero').map(heroState),
        structures: this.entities.filter(isStructure).map(e => ({ id: e.id, type: e.type, team: e.team, lane: e.lane, tier: e.structureTier || e.type, hp: round(e.hp), maxHp: round(e.maxHp), alive: e.alive, protected: this.isProtected(e), rampStacks: e.rampStacks || 0 })),
        objectives: this.entities.filter(e => e.type === 'monster').map(e => ({ id: e.id, kind: e.kind, alive: e.alive, hp: round(e.hp), maxHp: round(e.maxHp), respawnIn: round(e.respawnIn) })),
        teamBuffs: this.teamBuffs.map(b => ({ dragonStacks: b.dragonStacks, bossRemaining: round(Math.max(0, b.bossUntil - this.time)) })),
        projectiles: this.projectiles.length, effects: this.effects.length, events: this.events.map(e => Object.assign({}, e)) };
    }
  }

  const api = { Game, MAP, MAP_SCALES, normalizeMapScale, createMap, HEROES, ITEMS };
  root.NexusGame = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
