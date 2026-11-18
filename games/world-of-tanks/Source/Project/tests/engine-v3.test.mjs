import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RULES, TANKS, createBattle, stepBattle, getPlayer, deploySmoke,
  acquireTarget, setTargetLock, getLockedTarget, issueFocusFire, issueOrder,
} from '../dist/js/engine.js';
import { circleTouchesRect } from '../dist/js/geometry.js';
import { SURFACES, surfaceAt } from '../dist/js/maps.js';

function advance(state, seconds, input = {}) {
  for (let frame = 0; frame < Math.ceil(seconds * 60) && state.phase === 'playing'; frame++) {
    const player = getPlayer(state);
    stepBattle(state, {
      throttle: 0, steer: 0, aimX: player.x + 600, aimY: player.y,
      fire: false, ammo: 'AP', ...input,
    }, 1 / 60);
  }
}

function arena(options = {}) {
  const state = createBattle({ tankClass: 'medium', seed: 3, ...options });
  state.aiEnabled = false;
  // Isolate each rule from authored cover and terrain; terrain tests add their own.
  Object.assign(state.map, { obstacles: [], bushes: [], surfaceZones: [], roads: [], roadWidths: [] });
  state.map.version++;
  const player = getPlayer(state), enemy = state.tanks.find(tank => tank.team === 1);
  for (const tank of state.tanks) {
    tank.alive = tank === player || tank === enemy;
    if (!tank.alive) tank.hp = 0;
    tank.speed = 0;
  }
  Object.assign(player, { x: 500, y: 500, angle: 0, turretAngle: 0 });
  Object.assign(enemy, { x: 930, y: 500, angle: 0, turretAngle: Math.PI });
  return { state, player, enemy };
}

function revive(tank, values = {}) {
  return Object.assign(tank, { alive: true, hp: tank.maxHp, speed: 0 }, values);
}

function coveringSurface(state, type) {
  state.map.surfaceZones = type === 'plain' ? [] : [{ id: 'test-surface', type, x: 1200, y: 800, rx: 3000, ry: 3000 }];
}

test('a shell cannot skip an adjacent live hull between the tank center and its muzzle', () => {
  const { state, enemy } = arena({ tankClass: 'heavy' });
  Object.assign(enemy, {
    type: 'scout', radius: 18, hp: 820, maxHp: 820,
    x: 542.7975432332819, y: 513.9057647468726, angle: 3 * Math.PI / 180,
  });
  advance(state, 1 / 60, { fire: true, aimX: 1000, aimY: 500 });
  advance(state, 44 / 60);
  assert.equal(state.statistics.shots, 1);
  assert.equal(state.statistics.hits, 1);
  assert.ok(enemy.hp < 820, 'the nearby hull intercepts the shot before the nominal muzzle');
  assert.ok(state.events.some(event => event.type === 'hit' && event.target === enemy.id));
});

test('a muzzle inside a grazing target preserves its incoming side face and ricochets', () => {
  const { state, enemy } = arena({ tankClass: 'heavy' });
  Object.assign(enemy, {
    type: 'scout', radius: 18, hp: 820, maxHp: 820,
    x: 542.7975432332819, y: 486.09423525312735, angle: 3 * Math.PI / 180,
  });
  advance(state, 1 / 60, { fire: true, aimX: 1000, aimY: 500 });
  advance(state, 44 / 60);
  const impact = state.events.find(event => event.type === 'bounce' && event.target === enemy.id);
  assert.ok(impact, 'the initial side intersection is not replaced by an interior rear hit');
  assert.equal(impact.hitZone, 'side');
  assert.equal(impact.ricochet, true);
  assert.equal(enemy.hp, 820);
  assert.equal(state.statistics.hits, 1);
});

test('an unseen wreck stays concealed by range or other cover, then remains known after discovery', () => {
  const { state, player, enemy } = arena({ tankClass: 'heavy' });
  Object.assign(player, { x: 400, y: 500 });
  Object.assign(enemy, { x: 1250, y: 500, hp: 1 });
  const survivor = state.tanks.find(tank => tank.team === 1 && tank !== enemy);
  revive(survivor, { x: 2200, y: 1450 });
  advance(state, 0.3);
  assert.equal(enemy.visibleToPlayer, false);
  advance(state, 1 / 60, { fire: true, aimX: enemy.x, aimY: enemy.y });
  advance(state, 1.5);
  assert.equal(enemy.alive, false);
  assert.equal(enemy.visibleToPlayer, false, 'a blind kill does not reveal the wreck globally');
  const destroyed = state.events.find(event => event.type === 'destroyed' && event.target === enemy.id);
  assert.equal(destroyed.visibleToPlayer, false);
  assert.ok(state.map.obstacles.some(obstacle => obstacle.id === `wreck-${enemy.id}`));

  Object.assign(player, { x: 900, y: 500 });
  state.map.obstacles.push({ id: 'wreck-occluder', type: 'building', x: 1050, y: 400, w: 40, h: 200, destroyed: false });
  state.map.version++;
  advance(state, 0.3);
  assert.equal(enemy.visibleToPlayer, false, 'the wreck exception must not ignore another solid obstacle');
  state.map.obstacles = state.map.obstacles.filter(obstacle => obstacle.id !== 'wreck-occluder');
  state.map.version++;
  advance(state, 0.3);
  assert.equal(enemy.visibleToPlayer, true, 'own wreck geometry does not occlude its rediscovery outside proximity range');
  Object.assign(player, { x: 400, y: 1450 });
  advance(state, 6);
  assert.equal(enemy.visibleToPlayer, true, 'a discovered static wreck remains known');
  assert.equal(survivor.visibleToPlayer, false, 'discovering a wreck does not expose other enemies');
});

test('target acquisition reaches beyond a short aim stick ray and rejects invalid locks', () => {
  const { state, player, enemy } = arena();
  enemy.x = 1100;
  advance(state, 0.3);
  assert.equal(acquireTarget(state, player.x + 100, player.y)?.id, enemy.id);
  assert.equal(acquireTarget(state, NaN, player.y), null);
  assert.equal(setTargetLock(state, player.id), false);
  assert.equal(setTargetLock(state, 'missing-target'), false);
  enemy.visibleToPlayer = false;
  assert.equal(setTargetLock(state, enemy.id), false);
  enemy.visibleToPlayer = true; enemy.alive = false;
  assert.equal(setTargetLock(state, enemy.id), false);
  enemy.alive = true; enemy.x = player.x + RULES.maxRange + 1;
  assert.equal(setTargetLock(state, enemy.id), false);
  enemy.x = 1100;
  assert.equal(setTargetLock(state, enemy.id), true);
  assert.equal(getLockedTarget(state), enemy);
  assert.equal(setTargetLock(state, null), true);
  assert.equal(getLockedTarget(state), null);
});

test('target lock uses normal turret traverse and requires aligned held fire without auto-firing', () => {
  const { state, player, enemy } = arena();
  advance(state, 0.3);
  player.turretAngle = -Math.PI / 2;
  assert.equal(setTargetLock(state, enemy.id), true);
  const initialAngle = player.turretAngle;
  const awayFromTarget = { aimX: player.x, aimY: player.y + 700 };
  advance(state, 0.2, { ...awayFromTarget, fire: true });
  assert.equal(state.statistics.shots, 0, 'held fire waits for the turret rather than firing sideways');
  assert.ok(player.turretAngle > initialAngle);
  assert.ok(player.turretAngle - initialAngle <= TANKS.medium.turretRate * 0.2 + 1e-9);
  advance(state, 1, awayFromTarget);
  assert.ok(Math.abs(player.turretAngle) < 0.001, 'the lock tracks the target instead of the raw cursor');
  assert.equal(state.statistics.shots, 0, 'lock by itself never fires');
  advance(state, 1 / 60, { ...awayFromTarget, fire: true });
  advance(state, 0.6, awayFromTarget);
  assert.equal(state.statistics.shots, 1);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(player.reloadTime, TANKS.medium.reload, 'locking grants no reload bonus');
});

test('locked held fire waits for both solid cover and allied hulls to clear', () => {
  const { state, enemy } = arena();
  advance(state, 0.3);
  assert.equal(setTargetLock(state, enemy.id), true);
  state.map.obstacles.push({ id: 'firing-wall', type: 'building', x: 680, y: 450, w: 45, h: 100, destroyed: false });
  advance(state, 0.05, { fire: true });
  assert.equal(state.statistics.shots, 0);
  assert.equal(getLockedTarget(state), enemy, 'recently seen target remains valid while cover blocks the shot');
  state.map.obstacles = [];
  const ally = state.tanks.find(tank => tank.team === 0 && !tank.isPlayer);
  revive(ally, { x: 710, y: 500, angle: 0 });
  advance(state, 0.05, { fire: true });
  assert.equal(state.statistics.shots, 0);
  ally.y = 850;
  advance(state, 0.05, { fire: true });
  advance(state, 0.7);
  assert.equal(state.statistics.shots, 1);
  assert.ok(enemy.hp < enemy.maxHp);
  assert.equal(ally.hp, ally.maxHp);
});

test('target locks clear on loss of team vision, range, or life', () => {
  for (const reason of ['vision', 'range', 'death']) {
    const { state, player, enemy } = arena();
    advance(state, 0.3);
    assert.equal(setTargetLock(state, enemy.id), true);
    if (reason === 'vision') {
      assert.equal(deploySmoke(state, player), true);
      advance(state, 1.4);
      assert.equal(enemy.visibleToPlayer, false);
    } else {
      if (reason === 'range') enemy.x = player.x + RULES.maxRange + 1;
      else { enemy.alive = false; enemy.hp = 0; }
      assert.equal(getLockedTarget(state), null, `invalid ${reason} target cannot be returned between ticks`);
      advance(state, 1 / 60);
    }
    assert.equal(getLockedTarget(state), null, reason);
    assert.equal(state.lockTargetId, null, reason);
  }
});

test('focus fire directs real allied shots without replacing movement orders, then expires', () => {
  const { state, player, enemy } = arena();
  Object.assign(player, { x: 350, y: 1000 });
  const ally = state.tanks.find(tank => tank.team === 0 && tank.type === 'medium' && !tank.isPlayer);
  revive(ally, { x: 500, y: 500, angle: 0, turretAngle: 0, trackDisabled: 60, repairCooldown: 60 });
  Object.assign(enemy, { type: 'heavy', radius: 25, x: 900, y: 500, hp: 5000, maxHp: 5000, trackDisabled: 60, repairCooldown: 60, reloadLeft: 60 });
  const nearerEnemy = state.tanks.find(tank => tank.team === 1 && tank !== enemy);
  revive(nearerEnemy, { type: 'heavy', radius: 25, x: 650, y: 740, hp: 5000, maxHp: 5000, trackDisabled: 60, repairCooldown: 60, reloadLeft: 60 });
  advance(state, 0.3);
  assert.equal(issueOrder(state, 'move', { x: 1100, y: 1000 }), true);
  const movementOrder = state.order;
  assert.equal(issueFocusFire(state, enemy.id), true);
  assert.equal(state.order, movementOrder);
  state.aiEnabled = true;
  advance(state, 3);
  assert.ok(ally.stats.damage > 0, 'an ally actually fires at the designated target');
  assert.ok(enemy.hp < 5000);
  assert.equal(nearerEnemy.hp, 5000, 'the nearer distraction does not override the valid focus order');
  assert.equal(state.order, movementOrder);
  state.aiEnabled = false;
  advance(state, 13);
  assert.equal(state.focusTarget, null);
  assert.equal(state.order, movementOrder, 'the 25-second movement order outlives the 15-second focus');
});

test('focus commands require an active commander and a visible enemy, and stop when vision is lost', () => {
  const { state, player, enemy } = arena();
  advance(state, 0.3);
  for (const [field, value] of [['paused', true], ['mode', 'training'], ['phase', 'ended']]) {
    const previous = state[field]; state[field] = value;
    assert.equal(issueFocusFire(state, enemy.id), false, field);
    state[field] = previous;
  }
  player.alive = false;
  assert.equal(issueFocusFire(state, enemy.id), false);
  player.alive = true;
  assert.equal(issueFocusFire(state, player.id), false);
  assert.equal(issueFocusFire(state, 'missing-target'), false);
  enemy.visibleToPlayer = false;
  assert.equal(issueFocusFire(state, enemy.id), false);
  enemy.visibleToPlayer = true;
  assert.equal(issueFocusFire(state, enemy.id), true);
  assert.equal(deploySmoke(state, player), true);
  advance(state, 1.4);
  assert.equal(enemy.visibleToPlayer, false);
  assert.equal(state.focusTarget, null);
});

test('waypoints reject nonfinite coordinates and resolve map edges or occupied cover safely', () => {
  const { state } = arena();
  assert.equal(issueOrder(state, 'move', { x: -500, y: 5000 }), true);
  assert.ok(state.order.x >= TANKS.heavy.radius && state.order.y <= state.map.height - TANKS.heavy.radius);
  const validOrder = state.order;
  for (const point of [{ x: NaN, y: 500 }, { x: 500, y: Infinity }, {}]) {
    assert.equal(issueOrder(state, 'move', point), false);
    assert.equal(state.order, validOrder, 'a malformed click must not replace a valid command');
  }
  const building = { id: 'waypoint-cover', type: 'building', x: 780, y: 600, w: 200, h: 200, destroyed: false };
  state.map.obstacles.push(building); state.map.version++;
  assert.equal(issueOrder(state, 'move', { x: 850, y: 700 }), true);
  assert.equal(state.order.type, 'move');
  assert.equal(circleTouchesRect(state.order.x, state.order.y, TANKS.heavy.radius + 15, building), false);
  assert.ok(Math.hypot(state.order.x - 850, state.order.y - 700) < 600, 'blocked point resolves locally');
});

test('an allied tank follows a tactical waypoint away from its default attack route', () => {
  const { state, enemy } = arena();
  Object.assign(enemy, { x: 2200, y: 1450, trackDisabled: 60, repairCooldown: 60, reloadLeft: 60 });
  const ally = state.tanks.find(tank => tank.team === 0 && tank.type === 'medium' && !tank.isPlayer);
  revive(ally, { x: 1000, y: 500, angle: Math.atan2(700, -650) });
  assert.equal(issueOrder(state, 'move', { x: 350, y: 1200 }), true);
  const point = { x: state.order.x, y: state.order.y };
  const before = Math.hypot(ally.x - point.x, ally.y - point.y);
  state.aiEnabled = true;
  advance(state, 4);
  assert.ok(Math.hypot(ally.x - point.x, ally.y - point.y) < before - 150);
  assert.ok(ally.x < 900 && ally.y > 600, 'the ally moves left and down instead of advancing east');
});

test('surface sampling matches ellipse and road bounds with explicit zones taking precedence', () => {
  const map = {
    roads: [[[0, 100], [500, 100]]], roadWidths: [60],
    surfaceZones: [
      { id: 'invalid', type: 'constructor', x: 50, y: 100, rx: 30, ry: 30 },
      { id: 'mud', type: 'mud', x: 250, y: 100, rx: 60, ry: 45 },
      { id: 'rough', type: 'rough', x: 400, y: 200, rx: 40, ry: 25 },
    ],
  };
  assert.equal(surfaceAt(map, 50, 100), SURFACES.road, 'inherited metadata keys are ignored');
  assert.equal(surfaceAt(map, 100, 130).id, 'road');
  assert.equal(surfaceAt(map, 100, 131).id, 'plain');
  assert.equal(surfaceAt(map, 250, 100).id, 'mud', 'an ellipse overrides the road below it');
  assert.equal(surfaceAt(map, 250, 145).id, 'mud');
  assert.equal(surfaceAt(map, 250, 146).id, 'plain');
  assert.equal(surfaceAt(map, 400, 200).id, 'rough');
  assert.equal(surfaceAt(map, Infinity, 100).id, 'plain');
});

test('terrain scales acceleration and top speed once, composes with engine damage, and restores on exit', () => {
  for (const [type, engineFactor] of [['plain', 1], ['road', 1], ['mud', 1], ['rough', 1], ['mud', 0.6]]) {
    const { state, player, enemy } = arena();
    Object.assign(enemy, { x: 2200, y: 1450 });
    coveringSurface(state, type);
    if (engineFactor < 1) player.modules.engine = 60;
    advance(state, 0.5, { throttle: 1 });
    const material = SURFACES[type];
    assert.equal(player.surfaceId, type);
    assert.ok(Math.abs(player.speed - TANKS.medium.acceleration * material.accelerationMultiplier * engineFactor * 0.5) < 1e-7, type);
    advance(state, 2, { throttle: 1 });
    const expected = TANKS.medium.speed * material.speedMultiplier * engineFactor;
    assert.ok(Math.abs(player.speed - expected) < 1e-7, type);
    advance(state, 3, { throttle: 1 });
    assert.ok(Math.abs(player.speed - expected) < 1e-7, `${type} modifier must not compound on later ticks`);
    coveringSurface(state, 'plain');
    advance(state, 2, { throttle: 1 });
    assert.equal(player.surfaceId, 'plain');
    assert.ok(Math.abs(player.speed - TANKS.medium.speed * engineFactor) < 1e-7, `${type} exit restores the correct base speed`);
  }
});

test('terrain turning traction changes hull rotation without changing turret traverse', () => {
  for (const type of ['plain', 'road', 'mud', 'rough']) {
    const { state, player } = arena();
    coveringSurface(state, type);
    advance(state, 0.5, { steer: 1, aimX: player.x, aimY: player.y + 600 });
    assert.ok(Math.abs(player.angle - TANKS.medium.turnRate * SURFACES[type].turnMultiplier * 0.5) < 1e-8, type);
    assert.ok(Math.abs(player.turretAngle - TANKS.medium.turretRate * 0.5) < 1e-8, 'terrain does not grant a turret speed modifier');
  }
});

test('an ally blocked by a friendly hull repositions and opens a real firing lane', () => {
  const { state, player, enemy } = arena();
  Object.assign(player, { x: 650, y: 500 });
  Object.assign(enemy, { type: 'heavy', radius: 25, x: 900, y: 500, hp: 5000, maxHp: 5000, trackDisabled: 60, repairCooldown: 60, reloadLeft: 60 });
  const ally = state.tanks.find(tank => tank.team === 0 && tank.type === 'medium' && !tank.isPlayer);
  revive(ally, { x: 500, y: 500, angle: 0, turretAngle: 0 });
  state.aiEnabled = true;
  advance(state, 7);
  assert.ok(ally.stats.distanceTravelled > 40, 'blocked shooter does not stay frozen at its preferred range');
  assert.ok(ally.stats.damage > 0, 'lateral movement creates a usable firing lane');
  assert.ok(enemy.hp < 5000);
  assert.equal(player.hp, player.maxHp, 'opening the lane does not damage the blocking ally');
});
