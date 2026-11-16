import test from 'node:test';
import assert from 'node:assert/strict';
import { TANKS, createBattle, stepBattle, getPlayer, deploySmoke, issueOrder, aimStatus } from '../dist/js/engine.js';

function advance(state, seconds, input = {}) {
  const player = getPlayer(state);
  for (let frame = 0; frame < Math.ceil(seconds * 60) && state.phase === 'playing'; frame++) {
    stepBattle(state, { throttle: 0, steer: 0, aimX: player.x + 600, aimY: player.y, ammo: 'AP', ...input }, 1 / 60);
  }
}

function arena(options = {}) {
  const state = createBattle({ seed: 3, tankClass: 'medium', ...options });
  state.aiEnabled = false;
  state.map.obstacles = []; state.map.bushes = [];
  const player = getPlayer(state), enemy = state.tanks.find(tank => tank.team === 1);
  for (const tank of state.tanks) { tank.alive = tank === player || tank === enemy; if (!tank.alive) tank.hp = 0; tank.speed = 0; }
  Object.assign(player, { x: 500, y: 500, angle: 0, turretAngle: 0 });
  Object.assign(enemy, { x: 930, y: 500, angle: 0, turretAngle: Math.PI });
  return { state, player, enemy };
}

test('each selectable class starts against a matching roster and equal nominal team HP', () => {
  for (const tankClass of Object.keys(TANKS)) {
    const state = createBattle({ tankClass, seed: 5 });
    const teams = [0, 1].map(team => state.tanks.filter(tank => tank.team === team));
    assert.deepEqual(teams[0].map(tank => tank.type).sort(), teams[1].map(tank => tank.type).sort());
    assert.equal(teams[0].reduce((sum, tank) => sum + tank.maxHp, 0), teams[1].reduce((sum, tank) => sum + tank.maxHp, 0));
  }
});

test('switching ammunition requires one full reload and cannot fire an instant replacement', () => {
  const { state, player } = arena();
  advance(state, 1 / 60, { ammo: 'HE', fire: true });
  assert.equal(state.statistics.shots, 0);
  assert.equal(player.ammo, 'HE');
  assert.ok(player.reloadLeft > TANKS.medium.reload * 0.9);
  const firstRemaining = player.reloadLeft;
  advance(state, 0.5, { ammo: 'HE', fire: true });
  assert.equal(state.statistics.shots, 0);
  assert.ok(player.reloadLeft < firstRemaining - 0.4, 'holding HE selection does not restart reload');
  advance(state, player.reloadLeft + 0.05, { ammo: 'HE', fire: true });
  assert.equal(state.statistics.shots, 1);
  assert.ok(state.projectiles.some(projectile => projectile.ammo === 'HE'));
});

test('smoke conceals beyond proximity, spends one charge, expires, and never blocks a shell', () => {
  const { state, player, enemy } = arena();
  advance(state, 0.3);
  assert.equal(enemy.visibleToPlayer, true);
  const charges = player.smokeCharges;
  assert.equal(deploySmoke(state, player), true);
  assert.equal(player.smokeCharges, charges - 1);
  assert.equal(deploySmoke(state, player), false);
  assert.equal(player.smokeCharges, charges - 1);
  advance(state, 1.3);
  assert.equal(enemy.visibleToPlayer, false);
  assert.equal(player.spotted, false);
  assert.equal(aimStatus(state, enemy.x, enemy.y).target, null, 'aim helper does not reveal an obscured target');
  const hp = enemy.hp;
  advance(state, 1 / 60, { fire: true, aimX: enemy.x, aimY: enemy.y });
  advance(state, 0.7);
  assert.ok(enemy.hp < hp, 'shell crosses smoke and reaches the physically present target');
  advance(state, 6);
  assert.equal(state.smokeClouds.length, 0);
  assert.equal(enemy.visibleToPlayer, true);
  assert.ok(player.smokeCooldown > 0);
});

test('smoke around one observer cannot erase another ally clear sight', () => {
  const { state, player, enemy } = arena();
  const ally = state.tanks.find(tank => tank.team === 0 && !tank.isPlayer);
  Object.assign(ally, { alive: true, hp: ally.maxHp, x: enemy.x, y: enemy.y + 220, speed: 0 });
  advance(state, 0.3);
  assert.equal(deploySmoke(state, player), true);
  advance(state, 1.4);
  assert.equal(enemy.visibleToPlayer, true);
});

test('damaged engine reduces movement and repair restores all modules without healing HP', () => {
  const baseline = arena(), damaged = arena();
  damaged.player.modules.engine = 10;
  advance(baseline.state, 2, { throttle: 1 });
  advance(damaged.state, 2, { throttle: 1 });
  assert.ok(damaged.player.x - 500 < (baseline.player.x - 500) * 0.8);
  assert.ok(damaged.player.speed <= TANKS.medium.speed * 0.61);
  damaged.player.hp -= 100;
  const hp = damaged.player.hp;
  damaged.player.trackDisabled = 4;
  damaged.player.modules.ammoRack = 9;
  advance(damaged.state, 1 / 60, { repair: true });
  assert.equal(damaged.player.trackDisabled, 0);
  assert.equal(damaged.player.modules.engine, 0);
  assert.equal(damaged.player.modules.ammoRack, 0);
  assert.equal(damaged.player.hp, hp);
  assert.ok(damaged.player.repairCooldown > 0);
});

test('ammo-rack damage lengthens reload once and repair restores the remaining progress', () => {
  const { state, player } = arena();
  player.modules.ammoRack = 10;
  advance(state, 1 / 60, { fire: true });
  assert.ok(player.reloadTime > TANKS.medium.reload * 1.5);
  const first = player.reloadLeft;
  advance(state, 0.5);
  assert.ok(player.reloadLeft < first);
  assert.ok(player.reloadLeft > first - 0.7, 'modifier does not compound each tick');
  const damagedRemaining = player.reloadLeft;
  advance(state, 1 / 60, { repair: true });
  assert.ok(player.reloadLeft < damagedRemaining * 0.7);
  assert.ok(Math.abs(player.reloadTime - TANKS.medium.reload) < 0.001);
  assert.equal(state.statistics.shots, 1);
});

test('orders validate their context, guide an ally toward the player, and expire', () => {
  const { state, player, enemy } = arena();
  enemy.x = 2200; enemy.y = 1450;
  const ally = state.tanks.find(tank => tank.team === 0 && !tank.isPlayer);
  Object.assign(ally, { alive: true, hp: ally.maxHp, x: 1000, y: 500, angle: Math.PI, speed: 0 });
  state.aiEnabled = true;
  assert.equal(issueOrder(state, 'follow'), true);
  assert.equal(state.order.type, 'follow');
  assert.equal(issueOrder(state, 'invalid'), false);
  const before = Math.hypot(ally.x - player.x, ally.y - player.y);
  advance(state, 3);
  assert.ok(Math.hypot(ally.x - player.x, ally.y - player.y) < before - 40);
  state.aiEnabled = false;
  advance(state, 23);
  assert.equal(state.order, null);
  state.mode = 'training';
  assert.equal(issueOrder(state, 'attack'), false);
  state.mode = 'standard'; player.alive = false;
  assert.equal(issueOrder(state, 'defend'), false);
});

test('training has three stationary non-firing targets and finishes on their destruction', () => {
  const state = createBattle({ tankClass: 'scout', mode: 'training', seed: 9 });
  const player = getPlayer(state), targets = state.tanks.filter(tank => tank.team === 1);
  assert.equal(state.mode, 'training');
  assert.equal(state.map.id, 'training');
  assert.equal(state.tanks.filter(tank => tank.team === 0).length, 1);
  assert.equal(targets.length, 3);
  const positions = targets.map(tank => [tank.x, tank.y]);
  advance(state, 12);
  assert.deepEqual(targets.map(tank => [tank.x, tank.y]), positions);
  assert.equal(player.hp, player.maxHp);
  assert.equal(state.events.some(event => event.type === 'fire'), false);
  assert.equal(issueOrder(state, 'attack'), false);
  for (const tank of targets) { tank.alive = false; tank.hp = 0; }
  advance(state, 1 / 60);
  assert.equal(state.phase, 'ended');
  assert.equal(state.winner, 0);
});

test('training timeout cannot award completion while a damaged target remains', () => {
  const state = createBattle({ mode: 'training', seed: 9 });
  const targets = state.tanks.filter(tank => tank.team === 1);
  for (const target of targets.slice(0, 2)) { target.alive = false; target.hp = 0; }
  targets[2].hp = 1;
  state.statistics.kills = 2;
  state.elapsed = state.duration - 0.01;

  // Standard combat would award the full-health player an HP tiebreak victory.
  advance(state, 1 / 60);

  assert.equal(state.phase, 'ended');
  assert.equal(state.timeRemaining, 0);
  assert.equal(targets.filter(target => target.alive).length, 1);
  assert.equal(state.winner, null, 'training requires all targets to be destroyed');
  assert.match(state.resultReason, /남은 표적/);
  assert.doesNotMatch(state.resultReason, /훈련 완료/);
});

test('paused and invalid-duration ticks do not advance or mutate combat state', () => {
  const { state } = arena();
  state.paused = true;
  const paused = JSON.stringify(state);
  stepBattle(state, { fire: true, throttle: 1, smoke: true }, 1);
  assert.equal(JSON.stringify(state), paused);
  state.paused = false;
  const active = JSON.stringify(state);
  for (const dt of [0, -1, NaN, Infinity]) stepBattle(state, { fire: true }, dt);
  assert.equal(JSON.stringify(state), active);
});

test('aim forecast distinguishes heavy front and rear armor and never exposes hidden tanks', () => {
  const { state, player, enemy } = arena();
  enemy.type = 'heavy'; enemy.angle = Math.PI;
  advance(state, 0.3);
  const front = aimStatus(state, enemy.x, enemy.y);
  enemy.angle = 0;
  const rear = aimStatus(state, enemy.x, enemy.y);
  assert.equal(front.hitZone, 'front');
  assert.equal(rear.hitZone, 'rear');
  assert.ok(front.penetrationChance >= 0 && front.penetrationChance < rear.penetrationChance);
  assert.equal(front.aligned, true);
  player.turretAngle = Math.PI / 2;
  assert.equal(aimStatus(state, enemy.x, enemy.y).aligned, false);
  enemy.visibleToPlayer = false;
  assert.equal(aimStatus(state, enemy.x, enemy.y).target, null);
});

test('allied damage enabled by player spotting is credited as assistance', () => {
  const { state, player, enemy } = arena({ tankClass: 'scout', seed: 41 });
  Object.assign(player, { x: 800, y: 500, speed: 0 });
  Object.assign(enemy, { type: 'heavy', x: 1400, y: 500, angle: 0, trackDisabled: 60, repairCooldown: 60, hp: 5000, maxHp: 5000 });
  const ally = state.tanks.find(tank => tank.team === 0 && !tank.isPlayer && tank.type === 'medium');
  Object.assign(ally, { alive: true, hp: ally.maxHp, x: 600, y: 200, angle: Math.atan2(300, 800), turretAngle: Math.atan2(300, 800), speed: 0, trackDisabled: 60, repairCooldown: 60 });
  state.aiEnabled = true;
  advance(state, 14);
  assert.ok(player.stats.spots >= 1);
  assert.ok(ally.stats.damage > 0, 'ally fired using shared information beyond its own sight range');
  assert.ok(state.statistics.assisted > 0, 'player receives the assisting damage credit');
  assert.equal(state.statistics.damage, 0, 'assisting is not counted as direct damage');
});
