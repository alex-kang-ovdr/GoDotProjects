/** Pure developer-test schemas. No engine, DOM, storage, RNG or global mutation. */
const definition = (key, label, min, max, step, unit, scope) => ({ key, label, min, max, step, unit, scope });
const FIELDS = Object.freeze({
  cost: definition('cost', '소환 비용', 0, 10, 1, '엘릭서', '소환'),
  hp: definition('hp', '체력', 1, 100000, 1, 'HP', '병력'),
  damage: definition('damage', '피해', 0, 10000, 1, '피해', '공격'),
  attackInterval: definition('attackInterval', '공격 간격', .1, 10, .05, '초', '공격'),
  range: definition('range', '사거리', 0, 500, 1, 'px', '공격'),
  speed: definition('speed', '이동 속도', 0, 200, 1, 'px/초', '이동'),
  deployTime: definition('deployTime', '배치 시간', 0, 5, .05, '초', '소환'),
  projectileSpeed: definition('projectileSpeed', '투사체 속도', 0, 2000, 1, 'px/초', '공격'),
  spellRadius: definition('spellRadius', '주문 반경', 1, 200, 1, 'px', '주문'),
  crownDamage: definition('crownDamage', '타워 피해', 0, 10000, 1, '피해', '주문'),
  duration: definition('duration', '지속 시간', .1, 60, .01, '초', '지속'),
  maxTargets: definition('maxTargets', '최대 대상 수', 1, 8, 1, '개', '주문'),
  stunDuration: definition('stunDuration', '기절 시간', 0, 10, .05, '초', '주문'),
  groundingDuration: definition('groundingDuration', '접지 시간', 0, 10, .05, '초', '주문'),
  splashRadius: definition('splashRadius', '광역 공격 반경', 0, 200, 1, 'px', '공격'),
  damageReduction: definition('damageReduction', '대형 피해 감소율', 0, 1, .01, '비율', '대형'),
  chargeSpeed: definition('chargeSpeed', '돌격 이동 속도', 0, 200, 1, 'px/초', '능력'),
  abilityCost: definition('abilityCost', '능력 비용', 0, 10, 1, '엘릭서', '능력'),
  abilityDuration: definition('abilityDuration', '돌격 지속 시간', .2, 20, .1, '초', '능력'),
  abilityCooldown: definition('abilityCooldown', '능력 재사용 대기', 0, 60, .1, '초', '능력'),
});

function fail() { throw new TypeError('개발자 테스트 설정이 허용 범위를 벗어났습니다.'); }
function plain(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key) ||
        !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) fail();
  }
  return value;
}
function keysExactly(value, keys) {
  plain(value);
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail();
}

export function getBalanceFieldsForCard(card) {
  if (!card) return [];
  const keys = ['cost'];
  if (card.type === 'spell') {
    keys.push('damage', 'spellRadius');
    if (card.crownDamage !== undefined) keys.push('crownDamage');
    if (card.duration > 0) keys.push('duration');
    if (card.targetSelection === 'highest-hp') keys.push('maxTargets', 'stunDuration', 'groundingDuration');
  } else {
    keys.push('hp', 'damage', 'attackInterval', 'range', 'deployTime', 'projectileSpeed', 'splashRadius');
    if (card.type === 'troop') keys.push('speed');
    if (card.type === 'building') keys.push('duration');
  }
  if (card.formation) keys.push('damageReduction', 'chargeSpeed', 'abilityCost', 'abilityDuration', 'abilityCooldown');
  return keys.map(key => ({ ...FIELDS[key] }));
}

/** Step is a UI increment; target counts additionally require whole numbers. */
export function validateBalancePatch(card, patch) {
  if (!card) fail();
  plain(patch);
  const fields = new Map(getBalanceFieldsForCard(card).map(field => [field.key, field]));
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    const field = fields.get(key);
    if (!field || typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max ||
        (key === 'maxTargets' && !Number.isSafeInteger(value))) fail();
    result[key] = value;
  }
  return result;
}

export function resolveCardBalance(card, patch = {}) {
  const resolved = { ...card, ...patch };
  if (resolved.persistent) {
    const ticks = Math.floor(resolved.duration / resolved.tickInterval);
    resolved.totalDamage = resolved.damage * ticks;
    resolved.totalCrownDamage = resolved.crownDamage * ticks;
  }
  return Object.freeze(resolved);
}

export function createDeveloperData() {
  return { version: 1, balance: { player: {}, enemy: {} }, cheats: {
    infiniteElixir: { player: false, enemy: false }, noAbilityCooldown: false, freePlacement: false,
  } };
}

export function validateCheatPatch(patch) {
  plain(patch);
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'infiniteElixir') {
      plain(value); result.infiniteElixir = {};
      for (const [team, enabled] of Object.entries(value)) {
        if (!['player', 'enemy'].includes(team) || typeof enabled !== 'boolean') fail();
        result.infiniteElixir[team] = enabled;
      }
    } else if (['noAbilityCooldown', 'freePlacement'].includes(key) && typeof value === 'boolean') result[key] = value;
    else fail();
  }
  return result;
}

export function validateDeveloperData(data, cards) {
  keysExactly(data, ['version', 'balance', 'cheats']);
  if (data.version !== 1) fail();
  keysExactly(data.balance, ['player', 'enemy']);
  const result = createDeveloperData();
  for (const team of ['player', 'enemy']) {
    plain(data.balance[team]);
    if (Object.keys(data.balance[team]).length > Object.keys(cards).length) fail();
    for (const [id, patch] of Object.entries(data.balance[team])) {
      if (!Object.hasOwn(cards, id)) fail();
      result.balance[team][id] = validateBalancePatch(cards[id], patch);
    }
  }
  keysExactly(data.cheats, ['infiniteElixir', 'noAbilityCooldown', 'freePlacement']);
  keysExactly(data.cheats.infiniteElixir, ['player', 'enemy']);
  result.cheats = validateCheatPatch(data.cheats);
  return result;
}

/** A scheduled cast owns its numeric values even if its team is tuned later. */
export function validateFrozenCard(card, frozen) {
  plain(frozen);
  if (!card || Object.keys(frozen).length !== Object.keys(card).length) fail();
  const fields = new Set(getBalanceFieldsForCard(card).map(field => field.key));
  const patch = {};
  for (const key of fields) if (frozen[key] !== card[key]) patch[key] = frozen[key];
  const resolved = resolveCardBalance(card, validateBalancePatch(card, patch));
  if (Object.keys(resolved).some(key => frozen[key] !== resolved[key])) fail();
  return resolved;
}
