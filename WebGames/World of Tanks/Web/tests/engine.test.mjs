import test from 'node:test';
import assert from 'node:assert/strict';
import { TANKS, createBattle, stepBattle, getPlayer, armorAtAngle, clearLine } from '../dist/js/engine.js';

const neutral = { throttle: 0, steer: 0, moveAngle: null, movePower: 0, aimX: 2000, aimY: 500, fire: false, repair: false, ammo: 'AP' };

function advance(state, seconds, input = {}) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.ceil(seconds / dt) && state.phase === 'playing'; i++) {
    stepBattle(state, { ...neutral, ...input }, dt);
  }
}

function sandbox(seed = 41) {
  const state = createBattle({ tankClass: 'medium', difficulty: 'normal', seed });
  state.aiEnabled = false;
  state.map.obstacles = [];
  state.map.bushes = [];
  const player = getPlayer(state);
  const enemy = state.tanks.find(t => t.team === 1);
  for (const tank of state.tanks) {
    tank.alive = tank === player || tank === enemy;
    if (!tank.alive) tank.hp = 0;
    tank.speed = 0;
  }
  Object.assign(player, { x: 500, y: 500, angle: 0, turretAngle: 0, reloadLeft: 0, trackDisabled: 0, repairCooldown: 0 });
  Object.assign(enemy, { x: 1800, y: 300, angle: Math.PI, turretAngle: Math.PI, reloadLeft: 0 });
  return { state, player, enemy };
}

test('a seeded match starts with five tanks on each team and a valid selected vehicle', () => {
  const state = createBattle({ tankClass: 'heavy', seed: 1 });
  assert.equal(state.tanks.filter(t => t.team === 0 && t.alive).length, 5);
  assert.equal(state.tanks.filter(t => t.team === 1 && t.alive).length, 5);
  assert.equal(getPlayer(state).type, 'heavy');
  assert.equal(getPlayer(state).hp, TANKS.heavy.hp);
  assert.equal(state.phase, 'playing');
});

test('holding fire respects reload and cannot emit a shell every frame', () => {
  const { state, player } = sandbox();
  advance(state, 0.05, { fire: true });
  assert.equal(state.statistics.shots, 1);
  assert.ok(player.reloadLeft > 0);
  advance(state, TANKS.medium.reload * 0.6, { fire: true });
  assert.equal(state.statistics.shots, 1);
  advance(state, TANKS.medium.reload * 0.5, { fire: true });
  assert.equal(state.statistics.shots, 2);
});

test('destroyed player cannot fire while surviving allies continue fighting', () => {
  const { state, player } = sandbox();
  const ally = state.tanks.find(t => t.team === 0 && !t.isPlayer);
  ally.alive = true;
  ally.hp = TANKS[ally.type].hp;
  player.alive = false;
  player.hp = 0;
  advance(state, 1, { fire: true });
  assert.equal(state.phase, 'playing');
  assert.equal(state.statistics.shots, 0);
  assert.equal(state.projectiles.length, 0);
});

test('armor models front, side and rear independently and flags grazing AP impacts', () => {
  const { player } = sandbox();
  player.angle = 0;
  const front = armorAtAngle(player, Math.PI);
  const side = armorAtAngle(player, Math.PI / 2);
  const rear = armorAtAngle(player, 0);
  assert.equal(front.zone, 'front');
  assert.equal(side.zone, 'side');
  assert.equal(rear.zone, 'rear');
  assert.ok(front.nominal > side.nominal);
  assert.ok(side.nominal >= rear.nominal);
  const grazing = armorAtAngle(player, Math.PI - 80 * Math.PI / 180, 'front');
  assert.equal(grazing.ricochet, true);
  assert.ok(grazing.effective > front.effective);
});

test('a tank driving into solid cover cannot cross the wall', () => {
  const { state, player } = sandbox();
  state.map.obstacles.push({ id: 'cover', type: 'building', x: 600, y: 400, w: 180, h: 200, hp: 9999, maxHp: 9999, destroyed: false });
  advance(state, 4, { throttle: 1 });
  assert.ok(player.x > 510, 'tank actually advanced before reaching cover');
  assert.ok(player.x < 600, 'tank center stayed outside the solid building');
  assert.ok(player.y >= 400 && player.y <= 600, 'collision did not teleport the tank');
});

test('solid obstacles occlude sight lines, destroyed obstacles do not', () => {
  const obstacle = { id: 'wall', x: 600, y: 400, w: 60, h: 200, destroyed: false };
  const map = { width: 2400, height: 1600, obstacles: [obstacle], bushes: [] };
  assert.equal(clearLine(map, 500, 500, 800, 500), false);
  assert.equal(clearLine(map, 500, 300, 800, 300), true);
  obstacle.destroyed = true;
  assert.equal(clearLine(map, 500, 500, 800, 500), true);
});

test('team spotting reveals a nearby target and hard cover eventually conceals it', () => {
  const { state, player, enemy } = sandbox();
  enemy.x = player.x + TANKS.medium.viewRange * 0.6;
  enemy.y = player.y;
  advance(state, 0.5);
  assert.equal(enemy.visibleToPlayer, true);
  assert.ok(enemy.lastSeen);
  state.map.obstacles.push({ id: 'block', type: 'building', x: player.x + 60, y: player.y - 150, w: 70, h: 300, hp: 9999, maxHp: 9999, destroyed: false });
  advance(state, 15);
  assert.equal(enemy.visibleToPlayer, false);
  assert.ok(enemy.lastSeen, 'last known position remains distinct from current visibility');
});

test('an AP shell damages exposed rear armor', () => {
  const { state, player, enemy } = sandbox(3);
  Object.assign(enemy, { x: player.x + 145, y: player.y, angle: 0 });
  const before = enemy.hp;
  advance(state, 1 / 60, { fire: true, aimX: enemy.x, aimY: enemy.y });
  advance(state, 0.75, { aimX: enemy.x, aimY: enemy.y });
  assert.ok(enemy.hp < before);
  assert.equal(state.statistics.shots, 1);
  assert.ok(state.statistics.hits >= 1);
  assert.ok(state.statistics.damage > 0);
});

test('solid cover intercepts a projectile before it can damage a target', () => {
  const { state, player, enemy } = sandbox(3);
  Object.assign(enemy, { x: player.x + 260, y: player.y, angle: 0 });
  state.map.obstacles.push({ id: 'cover', type: 'building', x: 610, y: 410, w: 70, h: 180, hp: 9999, maxHp: 9999, destroyed: false });
  const before = enemy.hp;
  advance(state, 1 / 60, { fire: true, aimX: enemy.x, aimY: enemy.y });
  advance(state, 1);
  assert.equal(enemy.hp, before);
  assert.equal(state.statistics.hits, 0);
});

test('HE impact can damage adjacent enemies while counting one successful shell', () => {
  const { state, player, enemy } = sandbox(3);
  const nearby = state.tanks.find(t => t.team === 1 && t !== enemy);
  Object.assign(enemy, { x: 700, y: 500, angle: Math.PI });
  Object.assign(nearby, { alive: true, hp: nearby.maxHp, x: 690, y: 560, angle: 0 });
  const directBefore = enemy.hp;
  const nearbyBefore = nearby.hp;
  // Selecting a different round now reloads the gun; this test isolates HE impact.
  advance(state, TANKS.medium.reload + 0.1, { ammo: 'HE', aimX: enemy.x, aimY: enemy.y });
  advance(state, 1 / 60, { fire: true, ammo: 'HE', aimX: enemy.x, aimY: enemy.y });
  advance(state, 0.75, { ammo: 'HE', aimX: enemy.x, aimY: enemy.y });
  assert.ok(enemy.hp < directBefore, 'direct HE impact dealt damage');
  assert.ok(nearby.hp < nearbyBefore, 'nearby unshielded target received splash damage');
  assert.equal(state.statistics.shots, 1);
  assert.equal(state.statistics.hits, 1, 'one shell remains one hit even with two damaged targets');
  assert.equal(player.ammo, 'HE');
});

test('solid cover shields a nearby tank from HE splash on its opposite side', () => {
  const { state, enemy } = sandbox(3);
  Object.assign(enemy, { x: 680, y: 500, angle: 0 });
  state.map.obstacles.push({ id: 'shield', type: 'building', x: 620, y: 450, w: 25, h: 100, hp: 9999, maxHp: 9999, destroyed: false });
  const before = enemy.hp;
  advance(state, TANKS.medium.reload + 0.1, { ammo: 'HE', aimX: enemy.x, aimY: enemy.y });
  advance(state, 1 / 60, { fire: true, ammo: 'HE', aimX: enemy.x, aimY: enemy.y });
  advance(state, 0.75, { ammo: 'HE' });
  assert.equal(enemy.hp, before);
  assert.equal(state.statistics.hits, 0);
});

test('repair restores a disabled track and cooldown prevents immediate reuse', () => {
  const { state, player } = sandbox();
  player.trackDisabled = 4;
  advance(state, 1 / 60, { repair: true });
  assert.equal(player.trackDisabled, 0);
  assert.ok(player.repairCooldown > 0);
  player.trackDisabled = 4;
  advance(state, 0.1, { repair: true });
  assert.ok(player.trackDisabled > 3);
});

test('a defending tank contests its base; clearing it enables capture victory', () => {
  const { state, player, enemy } = sandbox();
  const base = state.bases.find(b => b.team === 1);
  player.x = base.x - 40;
  player.y = base.y;
  enemy.x = base.x + 40;
  enemy.y = base.y;
  advance(state, 3);
  assert.equal(base.contested, true);
  assert.equal(base.capture, 0);
  enemy.x = 1500;
  enemy.y = 200;
  advance(state, 27);
  assert.equal(state.phase, 'ended');
  assert.equal(state.winner, 0);
  assert.equal(base.capture, 100);
});

test('eliminating all opponents ends the match once and freezes its result', () => {
  const { state, enemy } = sandbox();
  enemy.alive = false;
  enemy.hp = 0;
  advance(state, 0.1);
  assert.equal(state.phase, 'ended');
  assert.equal(state.winner, 0);
  const events = state.events.filter(e => e.type === 'end').length;
  const snapshot = JSON.stringify(state.statistics);
  stepBattle(state, { ...neutral, fire: true }, 1 / 60);
  assert.equal(state.events.filter(e => e.type === 'end').length, events);
  assert.equal(JSON.stringify(state.statistics), snapshot);
});
