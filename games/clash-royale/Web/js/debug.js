import { Game, CARDS } from './engine.js';

// Pure UI-independent helpers. Only the explicit practice sandbox may mutate;
// inspection is available in every mode and never shares simulation references.
const TEAMS = ['player', 'enemy'];
const GLOBAL_ACTIONS = new Set(['fill-elixir', 'heal-towers', 'clear-units']);
const TARGET_ACTIONS = new Set(['heal-target', 'damage-target', 'remove-target', 'stun-target', 'ready-target']);
const living = entity => entity && entity.hp > 0 && !entity.destroyed;
const clone = value => JSON.parse(JSON.stringify(value));
const failure = reason => ({ ok: false, reason });

function findTarget(game, id) {
  if (typeof id !== 'string' || !id.length || id.length > 64) return null;
  return [...game.state.towers, ...game.state.units].find(entity => entity.id === id && living(entity)) || null;
}

/** A detached live entity plus its card definition; destroyed/removed IDs are null. */
export function inspectTarget(game, id) {
  if (!(game instanceof Game)) return null;
  const entity = findTarget(game, id);
  if (!entity) return null;
  return { entity: clone(entity), card: entity.cardId && Object.hasOwn(CARDS, entity.cardId) ? clone(game.getCard(entity.cardId, entity.team)) : null };
}

/**
 * Supported actions:
 * - fill-elixir / heal-towers / clear-units: team player | enemy | both.
 * - heal-target / remove-target / ready-target: a living entity id.
 * - damage-target: id + finite amount in (0, 100000].
 * - stun-target: id + optional finite duration in (0, 10], default 3 seconds.
 *
 * All validation precedes mutation. No action advances time, uses a card, or
 * enters the accepted-card replay log. Damage/removal credits actual HP removed
 * to the opposing team through the same accounting as an ordinary combat hit.
 */
export function applyCheat(game, action, options = {}) {
  if (!(game instanceof Game)) return failure('전투를 먼저 시작하세요.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) return failure('연습 모드 정보가 올바르지 않습니다.');
  if (game.practice !== true || options.training || options.replay) {
    return failure('치트는 자유 연습에서만 사용할 수 있습니다.');
  }
  if (game.state.phase === 'finished') return failure('끝난 전투에는 치트를 사용할 수 없습니다.');
  if (!action || typeof action !== 'object' || Array.isArray(action) ||
      (!GLOBAL_ACTIONS.has(action.type) && !TARGET_ACTIONS.has(action.type))) {
    return failure('지원하지 않는 치트입니다.');
  }

  if (GLOBAL_ACTIONS.has(action.type)) {
    if (![...TEAMS, 'both'].includes(action.team)) return failure('아군, 상대 또는 양쪽 진영을 선택하세요.');
    const teams = action.team === 'both' ? TEAMS : [action.team];
    if (action.type === 'fill-elixir') {
      const affectedTeams = teams.filter(team => game.state.elixir[team] !== 10);
      for (const team of teams) game.state.elixir[team] = 10;
      return { ok: true, affectedIds: [], affectedTeams };
    }
    if (action.type === 'heal-towers') {
      const towers = game.state.towers.filter(tower => living(tower) && teams.includes(tower.team) && tower.hp < tower.maxHp);
      for (const tower of towers) tower.hp = tower.maxHp;
      return { ok: true, affectedIds: towers.map(tower => tower.id) };
    }
    const units = game.state.units.filter(unit => living(unit) && teams.includes(unit.team));
    if (units.some(unit => !Number.isFinite(unit.hp) || unit.hp > 100000)) return failure('병력 체력 데이터가 허용 범위를 벗어났습니다.');
    let actualDamage = 0;
    for (const unit of units) actualDamage += game.applyPracticeEffect(unit.id, { damage: unit.hp }).actualDamage;
    return { ok: true, affectedIds: units.map(unit => unit.id), actualDamage };
  }

  const target = findTarget(game, action.id);
  if (!target) return failure('살아 있는 타워나 병력을 선택하세요.');
  if (action.type === 'damage-target' && (!Number.isFinite(action.amount) || action.amount <= 0 || action.amount > 100000)) {
    return failure('피해량은 0보다 크고 100000 이하인 숫자여야 합니다.');
  }
  const duration = action.duration === undefined ? 3 : action.duration;
  if (action.type === 'stun-target' && (!Number.isFinite(duration) || duration <= 0 || duration > 10)) {
    return failure('기절 시간은 0초보다 크고 10초 이하여야 합니다.');
  }

  if (action.type === 'heal-target') {
    target.hp = target.maxHp;
  } else if (action.type === 'ready-target') {
    if (target.kind !== 'tower') { target.deployRemaining = 0; target.active = true; }
    target.attackCooldown = 0;
    target.stunRemaining = 0;
    target.frostRemaining = 0;
    target.slowRemaining = 0;
    target.slowFactor = 1;
  } else {
    const effect = action.type === 'stun-target' ? { stunDuration: duration } :
      { damage: action.type === 'remove-target' ? target.hp : action.amount };
    const result = game.applyPracticeEffect(target.id, effect);
    if (!result.ok) return result;
    return { ok: true, affectedIds: [target.id], actualDamage: result.actualDamage };
  }
  return { ok: true, affectedIds: [target.id] };
}
