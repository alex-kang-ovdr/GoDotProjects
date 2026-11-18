'use strict';

// Headless integration checks for the original prototype engine. These do not
// validate the recovered games' undocumented physics or damage formulas.
const assert = require('node:assert/strict');
require('../dist/data.js');
const FortEngine = require('../dist/engine.js');

let passed = 0;
function test(name, fn) {
  const started = Date.now();
  fn();
  passed++;
  console.log('PASS ' + name + ' (' + (Date.now() - started) + ' ms)');
}
function newGame(options = {}) {
  return new FortEngine(Object.assign({ control: 'hotseat', teamSize: 1, seed: 123 }, options));
}
function until(game, condition, limit = 2000, dt = 0.1) {
  for (let i = 0; i < limit && !condition(); i++) game.tick(dt);
  assert.ok(condition(), 'Simulation exceeded its bounded completion window');
}
function flatFixture(game) {
  const { mask, width } = game.terrain;
  mask.fill(0);
  for (let y = 500; y <= 650; y++) mask.fill(1, y * width, (y + 1) * width);
  game.terrain.solidCount = width * 151;
  game.terrain.version++;
  game.state.wind = 0;
  game.state.tanks.forEach((t, i) => {
    t.x = i ? 1500 : 300; t.y = 486; t.vx = 0; t.vy = 0; t.tilt = 0;
  });
}
function duel(profile = 'classic', tank = 'catapult', onEvent = () => {}) {
  const game = newGame({ profile, playerTank: tank, opponentTank: tank, onEvent });
  game.state.tanks = game.state.tanks.filter(t => t.typeId === tank);
  game.state.activeId = game.state.tanks.find(t => t.team === 0).uid;
  game.state.round = 4;
  flatFixture(game);
  return game;
}
function collideFirstShot(game, target) {
  const p = game.state.projectiles.find(p => !p.dead);
  assert.ok(p);
  p.x = target.x; p.y = target.y;
  game._impact(p, { kind: 'tank', tank: target, x: p.x, y: p.y });
  return p;
}

test('seeded input produces the same trajectory, terrain and outcome', () => {
  const a = newGame(), b = newGame();
  for (const game of [a, b]) {
    assert.equal(game.setAngle(48), true);
    assert.equal(game.setPower(59), true);
    assert.equal(game.useItem('double'), true);
  }
  assert.deepEqual(a.getTrajectory(), b.getTrajectory());
  a.fire(); b.fire();
  for (let i = 0; i < 220; i++) { a.tick(0.1); b.tick(0.1); }
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
  assert.deepEqual(a.terrain.mask, b.terrain.mask);
});

test('paused, AI, flight and malformed input cannot mutate human controls', () => {
  const game = newGame();
  assert.equal(game.setAngle(NaN), false);
  assert.equal(game.setPower(Infinity), false);
  assert.equal(game.setWeapon(99), false);
  assert.equal(game.setFacing(0), false);
  game.setPaused(true);
  const before = game.getSnapshot();
  assert.equal(game.isHumanTurn(), false);
  assert.equal(game.fire(), false);
  assert.equal(game.skip(), false);
  assert.equal(game.move(1, 0.2), false);
  assert.equal(game.useItem('double'), false);
  assert.equal(game.setAngle(30), false);
  game.tick(1);
  assert.deepEqual(game.getSnapshot(), before);
  game.setPaused(false);
  assert.equal(game.fire(), true);
  assert.equal(game.fire(), false);
  assert.equal(game.useItem('shield'), false);
  assert.equal(game.setPower(5), false);
  assert.equal(game.move(-1, 0.2), false);
  const ai = newGame({ control: 'ai', playerTank: 'catapult', opponentTank: 'secwind' });
  assert.equal(ai.active.team, 1);
  assert.equal(ai.isHumanTurn(), false);
  assert.equal(ai.fire(), false);
  assert.equal(ai.setAngle(10), false);
  assert.equal(ai.skip(), false);
});

test('fast projectiles hit a one-pixel wall and carve the terrain mask', () => {
  const blasts = [];
  const game = newGame({ onEvent: e => { if (e.type === 'explosion') blasts.push(e); } });
  flatFixture(game);
  for (let y = 100; y < 500; y++) game.terrain.mask[y * game.terrain.width + 600] = 1;
  game.terrain.solidCount += 400;
  game.active.def = Object.assign({}, game.active.def, { aimMin: 0, aimMax: 90 });
  const originalVersion = game.terrain.version;
  game.setAngle(0); game.setPower(100); game.fire();
  until(game, () => blasts.length > 0);
  assert.ok(blasts[0].x >= 599 && blasts[0].x <= 602, 'Projectile tunneled through the thin wall');
  assert.ok(game.terrain.version > originalVersion);
  assert.ok(game.getSnapshot().stats.terrainRemoved > 0);
  assert.equal(game.terrain.solid(blasts[0].x, blasts[0].y), false);
});

test('six projectiles from a three-shot double resolve before the next turn', () => {
  const events = [];
  const game = newGame({ playerTank: 'multi_missile', opponentTank: 'multi_missile', onEvent: e => events.push(e) });
  const turn = game.state.turnNumber, time = game.state.timeLeft;
  assert.equal(game.active.team, 0);
  assert.equal(game.useItem('double'), true);
  assert.equal(game.useItem('shield'), false, 'Only one item may be used in a turn');
  game.setPower(70); game.setAngle(48);
  assert.equal(game.fire(), true);
  for (let i = 0; i < 2000 && game.state.turnNumber === turn && game.state.phase !== 'gameover'; i++) {
    game.tick(0.05);
    if (game.state.projectiles.length || game._launchQueue.length) {
      assert.equal(game.state.turnNumber, turn);
      assert.equal(game.state.phase, 'projectile');
      assert.equal(game.state.timeLeft, time, 'Aim timer must stop during projectile resolution');
    }
  }
  assert.equal(events.filter(e => e.type === 'shot').length, 6);
  assert.equal(game.state.projectiles.length, 0);
  assert.equal(game._launchQueue.length, 0);
  assert.ok(game.state.turnNumber > turn || game.state.phase === 'gameover');
});

test('blue3 sudden death repeats attacks three times without stacking double', () => {
  const game = newGame({ profile: 'blue3' });
  assert.equal(game.useItem('double'), true);
  game.state.round = 8;
  game.state.suddenDeath = true;
  const projectilesPerAttack = game.active.def.weapons[0].shots || 1;
  assert.equal(game.canUseItem('double'), false);
  assert.equal(game.fire(), true);
  assert.equal(game.state.projectiles.length + game._launchQueue.length, projectilesPerAttack * 3);
});

test('destroyed support causes a void KO and exactly one completion event', () => {
  const events = [];
  const game = newGame({ onEvent: e => events.push(e) });
  flatFixture(game);
  const victim = game.state.tanks[0];
  game._destroyTerrain(victim.x, 570, 210);
  until(game, () => game.state.phase === 'gameover');
  assert.equal(victim.alive, false);
  assert.equal(game.state.winner, 1);
  assert.ok(events.some(e => e.type === 'death' && e.kind === 'fall' && e.tankId === victim.uid));
  for (let i = 0; i < 30; i++) game.tick(0.1);
  assert.equal(events.filter(e => e.type === 'end').length, 1);
});

test('profile repair fractions and damage source/target attribution are preserved', () => {
  for (const profile of ['classic', 'blue3']) {
    const events = [];
    const game = newGame({ profile, onEvent: e => events.push(e) });
    const t = game.active;
    t.hp = Math.round(t.maxHp / 2);
    const before = t.hp;
    assert.equal(game.useItem('repair'), true);
    assert.equal(t.hp - before, Math.round(t.maxHp * (profile === 'classic' ? 0.2 : 0.05)));
    game._damage(t, 30, 'test', false, 1 - t.team, 'attacker');
    const e = events.find(e => e.type === 'damage');
    assert.equal(e.targetTeam, t.team);
    assert.equal(e.sourceTeam, 1 - t.team);
    assert.equal(e.ownerId, 'attacker');
  }
});

test('classic and blue3 AI matches finish with finite state and one winner', () => {
  for (const profile of ['classic', 'blue3']) {
    let completions = 0;
    const game = newGame({ profile, map: profile === 'classic' ? 'foundry' : 'islands', control: 'ai', difficulty: 'hard', seed: 12,
      onEvent: e => { if (e.type === 'end') completions++; } });
    for (let i = 0; i < 7000 && game.state.phase !== 'gameover'; i++) {
      // The public side receives an automated test driver; the opposing side
      // uses the engine's normal private AI scheduler.
      if (game.isHumanTurn()) {
        const plan = game._planAI();
        assert.ok(plan);
        game.setAngle(plan.angle); game.setPower(plan.power); game.setWeapon(plan.weaponIndex); game.fire();
      }
      game.tick(0.1);
      for (const t of game.state.tanks) {
        assert.ok([t.x, t.y, t.hp, t.nextDelay].every(Number.isFinite));
      }
    }
    assert.equal(game.state.phase, 'gameover', profile + ' did not finish');
    assert.ok([-1, 0, 1].includes(game.state.winner));
    assert.equal(completions, 1);
    assert.ok(game.state.round <= (profile === 'blue3' ? 10 : 14));
    assert.ok(game.getSnapshot().stats.shots > 0);
  }
});

test('the former 47-pixel guide error is eliminated by shared flight stepping', () => {
  const impacts = [];
  const game = newGame({ onEvent: e => { if (e.type === 'impact') impacts.push(e); } });
  game.setAngle(25); game.setPower(35);
  const predicted = game.getTrajectory().at(-1);
  game.fire();
  until(game, () => impacts.length > 0);
  assert.ok(Math.hypot(predicted.x - impacts[0].x, predicted.y - impacts[0].y) < 1e-7);
});

test('a wall between the hull and muzzle blocks the shot', () => {
  const impacts = [];
  const game = duel('classic', 'catapult', e => { if (e.type === 'impact') impacts.push(e); });
  for (let y = 100; y < 500; y++) for (let x = 320; x <= 324; x++) game.terrain.mask[y * game.terrain.width + x] = 1;
  game.terrain.solidCount += 2000; game.terrain.version++;
  game.setAngle(0); game.setPower(100); game.fire();
  until(game, () => impacts.length > 0);
  assert.equal(impacts[0].impactKind, 'terrain');
  assert.ok(impacts[0].x >= 320 && impacts[0].x < 325);
});

test('simultaneous elimination and equal HP ratios are draws independent of seed', () => {
  for (const seed of [12, 123]) {
    let ends = 0;
    const dead = newGame({ seed, onEvent: e => { if (e.type === 'end') ends++; } });
    dead.state.tanks.forEach(t => dead._kill(t, 'test'));
    dead._checkWinner(); dead._checkWinner();
    assert.equal(dead.state.winner, -1); assert.equal(ends, 1);
    const equal = newGame({ seed, teamSize: 2 });
    const blue = equal.state.tanks.filter(t => t.team === 0), orange = equal.state.tanks.filter(t => t.team === 1);
    blue[1].alive = false; blue[1].hp = 0;
    orange.forEach(t => { t.hp = t.maxHp * 0.5; });
    equal._checkWinner('round_limit');
    assert.equal(equal.state.winner, -1, 'Survivor-count bonuses must not break an equal-HP-ratio draw');
  }
});

test('double remains armed through pass and timeout until an attack consumes it', () => {
  const game = duel(), owner = game.active;
  assert.equal(game.canUseItem('repair'), false);
  assert.equal(game.canUseItem('double'), true);
  assert.equal(game.useItem('double'), true);
  assert.equal(game.state.itemUsed, true);
  assert.equal(game.canUseItem('shield'), false);
  game.skip();
  assert.equal(owner.status.double, 2);
  const returnToOwner = () => {
    for (let i = 0; i < 100; i++) {
      game.tick(0.1);
      if (game.state.phase === 'aim' && game.active.uid === owner.uid) return;
      if (game.isHumanTurn()) game.skip();
    }
    assert.fail('Owner did not receive another turn');
  };
  returnToOwner();
  assert.equal(game.state.itemUsed, false);
  game.state.timeLeft = 0.001; game.tick(1 / 120);
  assert.equal(owner.status.double, 2);
  returnToOwner();
  assert.equal(game.getActionPreview().projectileCount, 2);
  game.fire();
  assert.equal(owner.status.double, undefined);
  assert.equal(game.state.projectiles.length + game._launchQueue.length, 2);
});

test('action IDs link damage and terrain to one complete, correctly attributed summary', () => {
  const events = [];
  const game = duel('classic', 'catapult', e => events.push(e));
  const target = game.state.tanks.find(t => t.team === 1); target.hp = 50;
  game.fire(); const p = collideFirstShot(game, target);
  until(game, () => events.some(e => e.type === 'actionEnd'));
  const start = events.find(e => e.type === 'actionStart'), end = events.find(e => e.type === 'actionEnd');
  for (const type of ['shot', 'impact', 'explosion', 'damage', 'death']) {
    const e = events.find(e => e.type === type);
    assert.equal(e.volleyId, start.volleyId); assert.equal(e.shotId, p.shotId); assert.equal(e.ownerId, start.ownerId);
  }
  assert.equal(end.shots, 1); assert.equal(end.damageToEnemy, 50); assert.equal(end.friendlyDamage, 0);
  assert.equal(end.kills, 1); assert.equal(end.hits, 1); assert.equal(end.heal, 0);
  assert.ok(end.terrainRemoved > 0); assert.equal(end.delivery, 'projectile');
  assert.equal(events.filter(e => e.type === 'actionEnd').length, 1);
  assert.ok(events.indexOf(end) < events.findIndex(e => e.type === 'end'));
});

test('self support and projectile dispel each preserve an armed double', () => {
  const selfEvents = [], game = duel('blue3', 'catapult', e => selfEvents.push(e));
  game.useItem('double'); game.setWeapon(3);
  assert.equal(game.getActionPreview().isSupport, true);
  assert.equal(game.getActionPreview().projectileCount, 0);
  game.fire();
  until(game, () => selfEvents.some(e => e.type === 'actionEnd'));
  const selfEnd = selfEvents.find(e => e.type === 'actionEnd');
  assert.equal(selfEnd.delivery, 'self'); assert.equal(selfEnd.shots, 0);
  assert.equal(game.state.tanks.find(t => t.team === 0).status.double, 2);
  const events = [], utility = duel('blue3', 'evil_bella', e => events.push(e));
  const owner = utility.active, target = utility.state.tanks.find(t => t.team === 1);
  target.status = { shield: 1, barrier: 300, attackBuff: { multiplier: 1.2, turns: 2 } };
  utility.useItem('double'); utility.state.suddenDeath = true; utility.state.round = 8;
  utility.setWeapon(3);
  assert.equal(utility.getActionPreview().projectileCount, 1);
  utility.fire(); collideFirstShot(utility, target);
  until(utility, () => events.some(e => e.type === 'actionEnd'));
  assert.equal(owner.status.double, 2);
  assert.equal(target.status.shield, undefined); assert.equal(target.status.barrier, undefined); assert.equal(target.status.attackBuff, undefined);
  assert.equal(events.find(e => e.type === 'actionEnd').shots, 1);
});

test('lifesteal uses actual enemy HP loss, excluding shields and friendly damage', () => {
  for (const mode of ['enemy', 'shield', 'friendly']) {
    const game = duel('blue3', 'evil_bella');
    const owner = game.active, target = game.state.tanks.find(t => t.team === 1);
    owner.hp = 100;
    if (mode === 'shield') target.status.shield = 1;
    if (mode === 'friendly') target.team = 0;
    if (mode === 'enemy') target.hp = 40;
    game.setWeapon(2); game.fire(); collideFirstShot(game, target);
    assert.equal(owner.hp, mode === 'enemy' ? 110 : 100);
    assert.equal(game._action.heal, mode === 'enemy' ? 10 : 0);
  }
});

test('terrain bounces are limited and guide the same final impact as live flight', () => {
  const events = [], game = duel('blue3', 'baseball_boy', e => events.push(e));
  game.setAngle(12); game.setPower(30);
  const predicted = game.getTrajectory().at(-1);
  game.fire();
  until(game, () => events.some(e => e.type === 'impact'));
  assert.equal(events.filter(e => e.type === 'bounce').length, 1);
  const impact = events.find(e => e.type === 'impact');
  assert.ok(Math.hypot(predicted.x - impact.x, predicted.y - impact.y) < 1e-7);
  assert.equal(game.getSnapshot().stats.explosions, 1);
});

test('linear laser supports its own aim range and ignores wind and gravity', () => {
  const events = [], game = duel('blue3', 'mecha_punch', e => events.push(e));
  game.setWeapon(2);
  assert.equal(game.getActionPreview().aimMin, -35);
  game.setAngle(-10); assert.equal(game.active.angle, -10);
  game.setAngle(0); game.setPower(100); game.state.wind = 8;
  const predicted = game.getTrajectory().at(-1);
  game.fire(); const initial = { y: game.state.projectiles[0].y, vx: game.state.projectiles[0].vx };
  game.tick(0.2);
  assert.equal(game.state.projectiles[0].y, initial.y);
  assert.equal(game.state.projectiles[0].vx, initial.vx); assert.equal(game.state.projectiles[0].vy, 0);
  until(game, () => events.some(e => e.type === 'impact'));
  const impact = events.find(e => e.type === 'impact');
  assert.ok(Math.hypot(predicted.x - impact.x, predicted.y - impact.y) < 1e-7);
});

test('teleport has a separate ballistic model, independent of the selected weapon', () => {
  for (const [tank, slot] of [['mecha_punch', 2], ['baseball_boy', 0], ['evil_bella', 2]]) {
    const game = duel('blue3', tank);
    game.setWeapon(slot); game.active.status.double = 2;
    assert.equal(game.useItem('teleport'), true);
    game.getTrajectory(); game.fire();
    const p = game.state.projectiles[0];
    assert.equal(p.kind, 'teleport'); assert.equal(p.behavior.trajectory, 'ballistic');
    assert.equal(p.behavior.bounces, 0); assert.equal(p.behavior.lifeSteal, 0); assert.equal(p.effect, null);
    assert.equal(game.active.status.double, 2);
    assert.equal(game.state.projectiles.length + game._launchQueue.length, 1);
  }
});

test('AI can select defense, dispel and setup, and penalizes friendly damage', () => {
  const defense = duel('blue3', 'mecha_punch'); defense.active.hp = defense.active.maxHp * 0.2;
  assert.equal(defense.active.def.weapons[defense._planAI().weaponIndex].id, 'plasma_shield');
  const dispel = duel('blue3', 'evil_bella'); dispel.state.tanks[1].status = { shield: 1, barrier: 500 };
  assert.equal(dispel.active.def.weapons[dispel._planAI().weaponIndex].id, 'utility_dispel');
  const setup = duel('blue3', 'baseball_boy');
  for (let y = 0; y < 500; y++) for (let x = 330; x <= 334; x++) setup.terrain.mask[y * setup.terrain.width + x] = 1;
  setup.terrain.version++;
  assert.equal(setup.active.def.weapons[setup._planAI().weaponIndex].id, 'amplifier_gear');
  const actor = defense.active, target = defense.state.tanks[1], weapon = actor.def.weapons[0];
  const enemyScore = defense._scoreAIPrediction(actor, weapon, { x: target.x, y: target.y, hit: { kind: 'tank', tank: target } });
  target.team = actor.team;
  const allyScore = defense._scoreAIPrediction(actor, weapon, { x: target.x, y: target.y, hit: { kind: 'tank', tank: target } });
  assert.ok(enemyScore > allyScore && allyScore < 0);
});

test('partial AI planning pauses safely and is discarded on timeout or a new match', () => {
  const game = duel('blue3', 'evil_bella'); game.config.control = 'ai';
  game.state.activeId = game.state.tanks.find(t => t.team === 1).uid; game._aiWait = 0;
  game.tick(1 / 120); assert.ok(game._aiSearch);
  game.setPaused(true); const paused = game.getSnapshot(); game.tick(0.25);
  assert.deepEqual(game.getSnapshot(), paused);
  assert.equal(game.fire(), false);
  game.setPaused(false); game.state.timeLeft = 0.001; game.tick(1 / 120);
  assert.equal(game._aiSearch, null); assert.equal(game._aiPlan, null); assert.equal(game.getSnapshot().stats.shots, 0);
  until(game, () => game.state.phase === 'aim');
  assert.equal(game._aiSearch, null);
  assert.equal(newGame({ profile: 'blue3' })._aiSearch, null);
});

test('AI planning is deterministic at 15 and 60 frames per second', () => {
  const options = { control: 'ai', playerTank: 'catapult', opponentTank: 'secwind', seed: 12 };
  const fast = newGame(options), slow = newGame(options);
  for (let i = 0; i < 720; i++) fast.tick(1 / 60);
  for (let i = 0; i < 180; i++) slow.tick(1 / 15);
  assert.deepEqual(fast.getSnapshot(), slow.getSnapshot());
  assert.deepEqual(fast.terrain.mask, slow.terrain.mask);
});

test('AI work is bounded per fixed step and ground effects follow destroyed terrain', () => {
  const game = duel('blue3', 'evil_bella'); game.config.control = 'ai';
  game.state.activeId = game.state.tanks.find(t => t.team === 1).uid; game._aiWait = 0;
  const original = game._predict; let count = 0, maxPredictions = 0, maxMs = 0;
  game._predict = function (...args) { count++; return original.apply(this, args); };
  for (let i = 0; i < 180 && game.getSnapshot().stats.shots === 0; i++) {
    const before = count, started = performance.now(); game.tick(1 / 60);
    maxMs = Math.max(maxMs, performance.now() - started); maxPredictions = Math.max(maxPredictions, count - before);
  }
  assert.ok(game.getSnapshot().stats.shots > 0);
  assert.ok(maxPredictions <= 12);
  console.log('  AI 4-skill planning: ' + count + ' predictions, max ' + maxPredictions + '/60fps tick, measured max ' + maxMs.toFixed(2) + ' ms');
  const ground = duel();
  ground.state.mines.push({ x: 900, y: 496, kind: 'mine', life: 6, age: 0 });
  ground.state.hazards.push({ x: 900, y: 497, kind: 'fire', life: 3, radius: 36 });
  ground._destroyTerrain(900, 500, 45); ground._settleGroundEffects();
  assert.ok(ground.state.mines[0].y > 520); assert.ok(ground.state.hazards[0].y > 520);
  ground._destroyTerrain(900, 600, 200); ground._settleGroundEffects();
  assert.equal(ground.state.mines.length, 0); assert.equal(ground.state.hazards.length, 0);
});

test('classic angle profiles preserve all 13 source bounds without mixing regions', () => {
  // JP2003_T_* from 4Gamer 05/06; KR_UNSPEC_T_* remains a separate, unverified build.
  const jp = { catapult: [0, 90], crossbow: [15, 80], cannon: [22, 45], carrot: [0, 45], duke: [0, 40],
    mine_lander: [5, 40], missile: [20, 40], multi_missile: [30, 45], super_tank: [20, 45],
    laser: [0, 33], ion_attacker: [20, 55], secwind: [0, 40], poseidon: [15, 50] };
  const kr = Object.assign({}, jp, { cannon: [25, 45], carrot: [0, 40], missile: [20, 45], multi_missile: [25, 50], laser: [5, 36] });
  const before = JSON.stringify(globalThis.FortData.aiming);
  for (const [angleProfile, expected] of [['jp2003', jp], ['kr_reference', kr]]) for (const [tank, bounds] of Object.entries(expected)) {
    const game = newGame({ angleProfile, playerTank: tank, opponentTank: tank });
    const aim = game.getAimingState();
    assert.deepEqual([aim.min, aim.max], bounds, angleProfile + '/' + tank);
    assert.equal(aim.angleProfileId, angleProfile);
    assert.equal(aim.angleFallbackApplied, false);
    assert.equal(aim.angleProfileStatus, angleProfile === 'jp2003' ? 'source_reported' : 'community_claim_not_runtime_verified');
    game.setAngle(-360); assert.equal(game.active.angle, bounds[0]);
    game.setAngle(360); assert.equal(game.active.angle, bounds[1]);
    assert.equal(game.getActionPreview().aimMin, bounds[0]);
  }
  assert.equal(newGame().getAimingState().angleProfileId, 'jp2003');
  assert.equal(newGame({ angleProfile: 'unknown_profile' }).getAimingState().angleProfileId, 'jp2003');
  assert.equal(JSON.stringify(globalThis.FortData.aiming), before);
});

test('BLUE3 keeps its explicit fallback angles and weapon override separate from classic profiles', () => {
  for (const [tank, expected] of [['catapult', [8, 82]], ['mecha_punch', [5, 75]], ['evil_bella', [10, 80]], ['baseball_boy', [12, 78]]]) {
    const game = duel('blue3', tank); game.config.angleProfile = 'kr_reference';
    const aim = game.getAimingState();
    assert.deepEqual([aim.min, aim.max], expected);
    assert.equal(aim.angleProfileId, 'blue3_catalog');
    assert.equal(aim.angleProfileStatus, 'simulation_assumption');
    assert.equal(aim.angleFallbackApplied, true);
    assert.equal(globalThis.FortData.aiming.blue3SourceBounds[tank].min, null);
    assert.equal(globalThis.FortData.aiming.blue3SourceBounds[tank].max, null);
  }
  const laser = duel('blue3', 'mecha_punch'); laser.setWeapon(2);
  assert.deepEqual([laser.getAimingState().min, laser.getAimingState().max], [-35, 75]);
  laser.setAngle(-30); laser.useItem('teleport');
  assert.deepEqual([laser.getAimingState().min, laser.getAimingState().max], [5, 75]);
  assert.equal(laser.active.angle, 5);
});

test('world pointer inversion matches live barrel direction on flat ground and both slopes', () => {
  for (const tilt of [-0.6, 0, 0.6]) for (const face of [-1, 1]) for (const localAngle of [0, 40, 80, 90]) {
    const game = duel(), t = game.active;
    t.x = 900; t.y = 200; t.tilt = tilt; t.face = -face;
    const tiltDeg = tilt * 180 / Math.PI;
    const bearing = (face === 1 ? localAngle - tiltDeg : 180 - localAngle - tiltDeg) * Math.PI / 180;
    const ux = Math.cos(bearing), uy = -Math.sin(bearing);
    game.setPower(50);
    assert.equal(game.setAimAtWorld(t.x + ux * 250, t.y - 4 + uy * 250), true);
    if (localAngle !== 90) assert.equal(t.face, face);
    assert.ok(Math.abs(t.angle - localAngle) < 1e-9);
    const aim = game.getAimingState(), preview = game.getActionPreview();
    assert.ok(Math.abs(aim.terrainAngle + t.face * tiltDeg) < 1e-9);
    assert.ok(Math.abs(aim.actualElevation - (aim.localAngle + aim.terrainAngle)) < 1e-9);
    assert.equal(preview.actualElevation, aim.actualElevation);
    assert.equal(game.state.power, 50, 'Pointer angle selection must not invent a power-to-distance curve');
    game.fire(); const p = game.state.projectiles[0], speed = Math.hypot(p.vx, p.vy);
    assert.ok(Math.hypot(p.vx / speed - ux, p.vy / speed - uy) < 1e-9, 'Live shot disagreed with the requested world direction');
  }
  const game = duel(), t = game.active, original = game.getSnapshot();
  for (const bad of [null, undefined, '', true, {}, Infinity, NaN]) {
    assert.equal(game.setAngle(bad), false); assert.equal(game.setPower(bad), false);
    assert.equal(game.setAimAtWorld(bad, 100), false);
  }
  assert.equal(game.setAimAtWorld(t.x, t.y - 4), false);
  assert.deepEqual(game.getSnapshot(), original);
  game.setPaused(true); assert.equal(game.setAimAtWorld(1200, 300), false);
});

test('unknown source values use runtime fallbacks while explicit zero stays zero', () => {
  const game = duel(), before = JSON.stringify(globalThis.FortData.aiming);
  game.data = Object.assign({}, game.data, { aiming: JSON.parse(before) });
  game.data.aiming.powerDefaults = { min: null, max: null, step: null, chargeRate: null, cycle: null, status: null };
  game.data.aiming.angleProfiles.jp2003.bounds.catapult = { min: null, max: null };
  const missing = { powerMin: null, powerMax: null, chargeRate: null, velocityScale: null, gravityScale: null, windScale: null };
  game.active.def = Object.assign({}, game.active.def, { aimingRuntime: missing,
    weapons: game.active.def.weapons.map(w => Object.assign({}, w, { aimingRuntime: missing, behavior: Object.assign({}, w.behavior, { aimMin: null, aimMax: null }) })) });
  let aim = game.getAimingState();
  assert.deepEqual([aim.min, aim.max, aim.powerMin, aim.powerMax, aim.powerStep, aim.chargeRate], [0, 90, 0, 100, 1, 72]);
  assert.deepEqual([aim.velocityScale, aim.gravityScale, aim.windScale], [1, 1, 1]);
  assert.equal(aim.angleFallbackApplied, true); assert.equal(aim.powerStatus, 'simulation_assumption');
  assert.equal(game.getChargePower(100 / 72), 100);
  game.active.def.weapons[0].aimingRuntime = { velocityScale: 0, gravityScale: 0, windScale: 0, chargeRate: 0 };
  aim = game.getAimingState();
  assert.deepEqual([aim.velocityScale, aim.gravityScale, aim.windScale, aim.chargeRate], [0, 0, 0, 0]);
  assert.equal(game.getChargePower(10), 0);
  const p = game._newProjectile(game.active, game.active.def.weapons[0], 45, 100);
  assert.equal(Math.hypot(p.vx, p.vy), 0);
  assert.equal(JSON.stringify(globalThis.FortData.aiming), before);
  assert.ok(Object.values(globalThis.FortData.aiming.sourcePower).every(v => v === null));
  assert.equal(newGame({ tuning: { gravity: null, minLaunchSpeed: null } }).tuning.gravity, 320);
});

test('optional runtime overrides are shared by controls, charging and projectile acceleration', () => {
  const game = duel(), t = game.active; t.x = 900; t.y = 200; game.state.wind = 3;
  t.def = Object.assign({}, t.def, { aimingRuntime: { powerMin: 20, powerMax: 80, chargeRate: 24, velocityScale: 1.2, gravityScale: 0.5, windScale: 0.25 },
    weapons: t.def.weapons.map(w => Object.assign({}, w, { aimingRuntime: { powerMin: null, powerMax: 60, chargeRate: 48, velocityScale: null, gravityScale: 0, windScale: 2 } })) });
  const aim = game.getAimingState();
  assert.deepEqual([aim.powerMin, aim.powerMax, aim.chargeRate, aim.velocityScale, aim.gravityScale, aim.windScale], [20, 60, 48, 1.2, 0, 2]);
  game.setPower(0); assert.equal(game.state.power, 20);
  game.setPower(100); assert.equal(game.state.power, 60);
  assert.deepEqual([0, 40 / 48, 80 / 48].map(t => game.getChargePower(t)), [20, 60, 20]);
  game.setAngle(0); game.fire(); const p = game.state.projectiles[0], vx = p.vx, vy = p.vy;
  assert.ok(Math.abs(Math.hypot(vx, vy) - 799.2) < 1e-9);
  game._advanceProjectile(p, 1 / 120, false);
  assert.ok(Math.abs(p.vx - vx - 3 * 9 * 2 / 120) < 1e-9); assert.equal(p.vy, vy);
});

test('the complete 0..100 power range reaches the unchanged fallback velocity curve', () => {
  const game = duel(), t = game.active; t.y = 200;
  for (let power = 0; power <= 100; power++) {
    assert.equal(game.setPower(power), true); assert.equal(game.getAimingState().power, power);
    const p = game._newProjectile(t, t.def.weapons[0], 45, power);
    assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - (90 + 9.6 * power)) < 1e-9);
  }
  assert.deepEqual([0, 50 / 72, 100 / 72, 150 / 72, 200 / 72].map(t => game.getChargePower(t)), [0, 50, 100, 50, 0]);
  game.setPower(-10); assert.equal(game.state.power, 0);
  game.setPower(200); assert.equal(game.state.power, 100);
  game.setPower(12.4); assert.equal(game.state.power, 12);
  for (const power of [0, 100]) {
    const impacts = [], shot = duel('classic', 'catapult', e => { if (e.type === 'impact') impacts.push(e); });
    shot.setAngle(45); shot.setPower(power); const predicted = shot.getTrajectory().at(-1);
    assert.equal(shot.getActionPreview().power, power);
    shot.fire(); assert.equal(shot.state.projectiles[0].power, power);
    until(shot, () => impacts.length > 0);
    assert.ok(Math.hypot(predicted.x - impacts[0].x, predicted.y - impacts[0].y) < 1e-7);
  }
});

test('AI searches both power endpoints and remains deterministic with the regional profile', () => {
  const options = { angleProfile: 'kr_reference', playerTank: 'multi_missile', opponentTank: 'multi_missile', seed: 72 };
  const a = newGame(options), b = newGame(options); flatFixture(a); flatFixture(b);
  const powers = [], original = a._predict;
  a._predict = function (...args) { powers.push(args[3]); return original.apply(this, args); };
  const pa = a._planAI(), pb = b._planAI();
  assert.deepEqual(pa, pb); assert.ok(powers.includes(0)); assert.ok(powers.includes(100));
  assert.ok(powers.every(p => p >= 0 && p <= 100 && Number.isInteger(p)));
  assert.ok(pa.angle >= 25 && pa.angle <= 50);
  for (const [g, p] of [[a, pa], [b, pb]]) { g.setWeapon(p.weaponIndex); g.setFacing(p.face); g.setAngle(p.angle); g.setPower(p.power); }
  assert.deepEqual(a.getTrajectory(), b.getTrajectory());
  a.fire(); b.fire();
  for (let i = 0; i < 60; i++) a.tick(1 / 60);
  for (let i = 0; i < 15; i++) b.tick(1 / 15);
  assert.deepEqual(a.getSnapshot(), b.getSnapshot()); assert.deepEqual(a.terrain.mask, b.terrain.mask);
});

console.log('\n' + passed + ' engine integration checks passed.');
