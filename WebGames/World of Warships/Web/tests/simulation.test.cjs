'use strict';

// Public-behavior regression checks for the prototype, not original WoWS rules.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const file = path.resolve(__dirname, '../dist/sim.js');
const context = vm.createContext({ console, Math, Number, Array, Object, Map, Set });
const operationsFile = path.resolve(__dirname, '../dist/operations.js');
if (fs.existsSync(operationsFile)) vm.runInContext(fs.readFileSync(operationsFile, 'utf8'), context, { filename: operationsFile });
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
const N = context.IronTide;
const results = [];
const DT = 1 / 60;

function test(name, run) {
  try { run(); results.push({ name, ok: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, ok: false }); console.error(`FAIL ${name}\n  ${error.stack}`); }
}

function step(g, seconds, controls = {}) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    N.tickGame(g, DT, { turn: 0, throttle: 0, aimX: 1800, aimY: 1600, ammo: 'HE', fire: false, ...controls });
  }
}

function fixture(shipClass = 'cruiser', seed = 42) {
  const g = N.createGame({ shipClass, seed, difficulty: 'normal' });
  g.islands.length = 0;
  g.zones.length = 0;
  for (let i = 0; i < g.ships.length; i++) {
    const s = g.ships[i];
    s.aiDisabled = true;
    s.speed = 0; s.driveSpeed = 0;
    s.throttle = 0;
    s.vx = 0; s.vy = 0;
    s.x = 150 + i * 600; s.y = 100;
    s.fireTime = 0; s.floodTime = 0;
    s.reload = 0; s.torpReload = 0;
  }
  Object.assign(g.player, { x: 1000, y: 1600, angle: 0, gunAngle: 0 });
  const target = g.ships.find(s => s.team === 1);
  Object.assign(target, { x: 1800, y: 1600, angle: Math.PI / 2, gunAngle: 0 });
  return { g, p: g.player, target };
}

function finiteState(g) {
  for (const s of g.ships) {
    for (const key of ['x', 'y', 'angle', 'gunAngle', 'speed', 'hp', 'reload', 'torpReload']) {
      assert.ok(Number.isFinite(s[key]), `${s.id}.${key} is not finite: ${s[key]}`);
    }
    assert.ok(s.hp >= 0 && s.hp <= s.maxHp + 1e-5, `${s.id} HP outside bounds`);
    assert.ok(s.x >= 0 && s.x <= g.world.w && s.y >= 0 && s.y <= g.world.h, `${s.id} outside world`);
  }
  for (const p of g.projectiles) {
    for (const key of ['x', 'y', 'age', 'life']) assert.ok(Number.isFinite(p[key]), `projectile ${key}`);
  }
  for (const n of g.score) assert.ok(Number.isFinite(n));
  assert.ok(g.events.length <= 200, 'unbounded event accumulation');
  assert.ok(g.effects.length < 1500, 'unbounded effect accumulation');
  assert.ok(g.projectiles.length < 500, 'unbounded projectile accumulation');
}

test('three distinct classes and a complete 3v3 initial state', () => {
  for (const key of ['destroyer', 'cruiser', 'battleship']) {
    const g = N.createGame({ shipClass: key, seed: 1 });
    assert.equal(g.player.classId, key);
    assert.equal(g.player, g.ships.find(s => s.id === g.playerId));
    assert.equal(g.ships.filter(s => s.team === 0).length, 3);
    assert.equal(g.ships.filter(s => s.team === 1).length, 3);
    assert.equal(g.zones.length, 3);
    assert.equal(g.phase, 'playing');
    assert.ok(g.player.maxHp > 0 && g.player.range > 0 && g.player.maxSpeed > 0);
    finiteState(g);
  }
  assert.ok(N.CLASSES.destroyer.maxSpeed > N.CLASSES.battleship.maxSpeed);
  assert.ok(N.CLASSES.battleship.maxHp > N.CLASSES.destroyer.maxHp);
});

test('seeded input replay produces identical combat state', () => {
  const a = N.createGame({ seed: 9182 });
  const b = N.createGame({ seed: 9182 });
  for (let i = 0; i < 1800; i++) {
    const controls = { throttle: 4, turn: Math.sin(i / 120) * 0.3, aimX: 2400, aimY: 800, fire: i % 5 === 0, ammo: i < 900 ? 'HE' : 'AP' };
    N.tickGame(a, DT, controls); N.tickGame(b, DT, controls);
  }
  function snapshot(g) {
    return JSON.stringify({ ships: g.ships, projectiles: g.projectiles, score: g.score, stats: g.stats, events: g.events, phase: g.phase, time: g.time });
  }
  assert.equal(snapshot(a), snapshot(b));
});

test('throttle accelerates with inertia and neutral continues coasting', () => {
  const { g, p } = fixture();
  step(g, 0.1, { throttle: 4 });
  assert.ok(p.speed > 0 && p.speed < p.maxSpeed * 0.5, 'acceleration should take time');
  step(g, 8, { throttle: 4 });
  assert.ok(p.x > 1150 && p.speed > p.maxSpeed * 0.4);
  const before = p.x;
  const speed = p.speed;
  step(g, 0.1, { throttle: 0 });
  assert.ok(p.x > before && p.speed > 0 && p.speed < speed, 'neutral must decelerate without teleporting');
});

test('rudder changes heading and reverse produces negative speed', () => {
  const { g, p } = fixture();
  step(g, 5, { throttle: 4, turn: 1 });
  assert.ok(Math.abs(p.angle) > 0.2, 'rudder should turn a moving ship');
  const reverse = fixture();
  step(reverse.g, 8, { throttle: -1 });
  assert.ok(reverse.p.speed < 0 && reverse.p.x < 1000);
});

test('world boundaries and island hull collisions contain the ship', () => {
  const { g, p } = fixture();
  Object.assign(p, { x: 60, y: 1600, angle: Math.PI });
  step(g, 12, { throttle: 4 });
  finiteState(g);
  const island = fixture();
  island.g.islands.push({ x: 1450, y: 1600, rx: 130, ry: 180, rotation: 0, seed: 1 });
  step(island.g, 12, { throttle: 4 });
  const norm = ((island.p.x - 1450) / 130) ** 2 + ((island.p.y - 1600) / 180) ** 2;
  assert.ok(norm >= 1 - 1e-5, 'ship center must not pass inside solid island');
  finiteState(island.g);
});

test('salvo consumes reload and delayed impacts damage a stationary enemy', () => {
  const { g, p, target } = fixture();
  target.width = 120; target.length = 220;
  const hp = target.hp;
  assert.equal(N.firePlayer(g, 'HE', target.x, target.y), true);
  assert.ok(g.projectiles.length > 0 && p.reload > 0);
  assert.equal(N.firePlayer(g, 'HE', target.x, target.y), false, 'cannot bypass reload');
  assert.equal(target.hp, hp, 'impact should not be instantaneous');
  step(g, 6);
  assert.ok(target.hp < hp, 'aimed salvo should hit the deliberately enlarged stationary fixture');
  assert.ok(g.stats.damage > 0 && g.stats.hits > 0);
});

test('torpedo spread moves through water and damages a target', () => {
  const { g, p, target } = fixture('destroyer');
  p.angle = Math.PI / 2; // V2: target must be inside a real side-launcher sector.
  Object.assign(target, { x: 1450, y: 1600, length: 180, width: 100 });
  const hp = target.hp;
  assert.equal(N.firePlayer(g, 'TORP', target.x, target.y), true);
  const torps = g.projectiles.filter(p => p.kind === 'torpedo');
  assert.ok(torps.length >= 2, 'torpedo attack should be a spread');
  const start = torps[0].x;
  step(g, 0.2);
  assert.ok(torps[0].x > start, 'torpedo should move before impact');
  step(g, 7);
  assert.ok(target.hp < hp && g.stats.torpHits > 0);
});

test('AP rewards a broadside while an angled bow can ricochet; HE remains distinct', () => {
  assert.equal(typeof N.resolveShellHit, 'function');
  function hit(ammo, angle) {
    const { g, p, target } = fixture('cruiser', 314);
    target.angle = angle; target.armor = 20;
    target.hp = target.maxHp;
    const projectile = { ammo, damage: 3000, caliber: 203, angle: 0, ownerId: p.id, team: 0, x: target.x, y: target.y, firedRange: 800, maxRange: 1500 };
    return N.resolveShellHit(g, projectile, target);
  }
  const broadside = hit('AP', Math.PI / 2);
  const bow = hit('AP', 0);
  const he = hit('HE', 0);
  assert.ok(broadside.damage > bow.damage, 'armor angle must affect AP result');
  assert.equal(bow.result, 'ricochet');
  assert.notEqual(he.result, 'ricochet');
  assert.ok(he.damage > 0);
});

test('friendly shell impacts do not damage allied ships', () => {
  const { g, p } = fixture();
  const ally = g.ships.find(s => s.team === 0 && !s.isPlayer);
  Object.assign(ally, { x: 1450, y: 1600, length: 180, width: 120 });
  const hp = ally.hp;
  assert.equal(N.firePlayer(g, 'HE', ally.x, ally.y), true);
  step(g, 6, { aimX: ally.x, aimY: ally.y });
  assert.equal(ally.hp, hp);
  assert.equal(g.stats.damage, 0);
  assert.ok(p.hp > 0);
});

test('a battleship without torpedo tubes cannot create torpedoes', () => {
  const { g, p, target } = fixture('battleship');
  assert.equal(p.torpReloadMax, 0);
  assert.equal(N.firePlayer(g, 'TORP', target.x, target.y), false);
  assert.equal(g.projectiles.filter(s => s.kind === 'torpedo').length, 0);
});

test('swept torpedo collision detects a hull crossed entirely in one step', () => {
  const { g, p, target } = fixture('destroyer');
  p.angle = Math.PI / 2;
  Object.assign(target, { x: 1400, y: 1600, angle: Math.PI / 2, width: 20 });
  N.firePlayer(g, 'TORP', target.x, target.y);
  const torpedo = g.projectiles.find(s => s.kind === 'torpedo' && Math.abs(s.vy) < 0.001);
  assert.ok(torpedo);
  g.projectiles = [torpedo];
  Object.assign(torpedo, { x: 1250, y: 1600, vx: 20000, vy: 0, distance: 200, age: 0 });
  const hp = target.hp;
  step(g, DT);
  assert.ok(target.hp < hp, 'swept collision must catch a thin hull between start/end positions');
  assert.equal(g.projectiles.length, 0);
  assert.ok(p.hp > 0);
});

test('damage control removes ongoing fire/flood and cannot bypass cooldown', () => {
  const { g, p } = fixture();
  p.fireTime = 12; p.floodTime = 12;
  step(g, 1);
  assert.ok(p.hp < p.maxHp, 'damage over time should reduce HP');
  assert.equal(N.useConsumable(g, 'damageControl'), true);
  assert.equal(p.fireTime, 0); assert.equal(p.floodTime, 0);
  assert.equal(N.useConsumable(g, 'damageControl'), false);
  const hp = p.hp;
  step(g, 1);
  assert.equal(p.hp, hp);
});

test('repair heals gradually, consumes one charge and respects maximum HP', () => {
  const { g, p } = fixture();
  p.hp = p.maxHp * 0.6;
  p.recoverableHp = p.maxHp * 0.4 * .55; // Explicit recoverable-damage ledger fixture.
  const charge = p.consumables.repair.charges;
  const before = p.hp;
  assert.equal(N.useConsumable(g, 'repair'), true);
  assert.equal(p.consumables.repair.charges, charge - 1);
  assert.equal(p.hp, before, 'repair is a process, not an instant reset');
  step(g, 20);
  assert.ok(p.hp > before && p.hp <= p.maxHp);
  assert.equal(N.useConsumable(g, 'repair'), false, 'repair still cooling down');
});

test('island cover blocks line of sight while allied information remains visible', () => {
  const { g, p, target } = fixture();
  target.x = 1600;
  step(g, 0.2);
  assert.equal(N.isVisible(g, target), true, 'nearby enemy in clear water should be visible');
  g.islands.push({ x: 1300, y: 1600, rx: 90, ry: 220, rotation: 0, seed: 1 });
  step(g, 1);
  assert.equal(N.isVisible(g, target), false, 'solid island must block direct sight');
  assert.equal(N.isVisible(g, p), true);
});

test('smoke conceals a distant destroyer and its muzzle flash; sonar restores detection', () => {
  const { g, p, target } = fixture();
  target.x = 1600; target.gunAngle = Math.PI;
  g.smokeClouds.push({ id: 'fixture-smoke', x: target.x, y: target.y, radius: 145, age: 0, life: 26, team: 1 });
  step(g, 0.1);
  assert.equal(N.isVisible(g, target), false);
  // firePlayer delegates to the same firing path used by AI; temporarily choose the fixture shooter.
  g.player = target;
  target.gunAngle = Math.PI;
  assert.equal(N.firePlayer(g, 'HE', p.x, p.y), true);
  g.player = p;
  step(g, DT);
  assert.equal(N.isVisible(g, target), false, 'a DD firing in smoke remains hidden at600worldunits');
  const flashes = g.effects.filter(e => e.type === 'muzzle' && e.shipId === target.id);
  assert.ok(flashes.length > 0);
  assert.ok(flashes.every(e => e.visible === false), 'muzzle visuals must not reveal a hidden shooter');
  assert.equal(N.useConsumable(g, 'ability'), true);
  step(g, DT);
  assert.equal(N.isVisible(g, target), true, 'sonar must reveal target inside smoke within its range');
});

test('class abilities activate their intended smoke or sonar state', () => {
  const dd = fixture('destroyer');
  assert.equal(dd.p.consumables.ability.kind, 'smoke');
  assert.equal(N.useConsumable(dd.g, 'ability'), true);
  assert.ok(dd.p.smokeTime > 0 || dd.p.consumables.ability.active > 0);
  const ca = fixture('cruiser');
  assert.equal(ca.p.consumables.ability.kind, 'sonar');
  assert.equal(N.useConsumable(ca.g, 'ability'), true);
  assert.ok(ca.p.consumables.ability.active > 0);
});

test('uncontested capture changes ownership and earns points', () => {
  const { g, p } = fixture();
  const zone = { id: 'T', x: p.x, y: p.y, radius: 180, progress: 0, owner: null, contested: false };
  g.zones.push(zone);
  const score = g.score[0];
  step(g, 30);
  assert.equal(zone.owner, 0);
  assert.ok(g.score[0] > score);
});

test('opposing ships inside one neutral zone prevent capture', () => {
  const { g, p, target } = fixture();
  const zone = { id: 'T', x: p.x, y: p.y, radius: 180, progress: 0, owner: null, contested: false };
  g.zones.push(zone);
  target.x = p.x + 100; target.y = p.y;
  step(g, 6);
  assert.equal(zone.owner, null);
  assert.equal(zone.contested, true);
  assert.ok(Math.abs(zone.progress) < 0.01);
});

test('score, elimination, player loss and timeout all resolve the round', () => {
  let { g } = fixture();
  g.score[0] = g.targetScore;
  step(g, DT); assert.equal(g.phase, 'won');
  ({ g } = fixture());
  for (const s of g.ships) if (s.team === 1) s.hp = 0;
  step(g, DT); assert.equal(g.phase, 'won');
  ({ g } = fixture());
  g.player.hp = 0;
  step(g, DT); assert.equal(g.phase, 'lost');
  ({ g } = fixture());
  g.time = g.duration - DT * 0.5; g.score[0] = 400; g.score[1] = 300;
  step(g, DT); assert.equal(g.phase, 'won');
  ({ g } = fixture());
  g.time = g.duration - DT * 0.5; g.score[0] = 400; g.score[1] = 400;
  step(g, DT); assert.equal(g.phase, 'draw');
});

test('a completed round is immutable until a new game is created', () => {
  const { g } = fixture();
  g.score[0] = g.targetScore;
  step(g, DT);
  const before = JSON.stringify({ time: g.time, score: g.score, hp: g.player.hp, x: g.player.x, count: g.projectiles.length });
  step(g, 20, { throttle: 4, fire: true, ammo: 'HE' });
  assert.equal(JSON.stringify({ time: g.time, score: g.score, hp: g.player.hp, x: g.player.x, count: g.projectiles.length }), before);
  assert.equal(N.firePlayer(g, 'HE', 1800, 1600), false);
  assert.equal(N.useConsumable(g, 'repair'), false);
  const fresh = N.createGame({ seed: 42 });
  assert.equal(fresh.phase, 'playing'); assert.equal(fresh.stats.damage, 0);
});

test('multiple complete simulation runs remain finite and memory bounded', () => {
  for (const [index, shipClass] of ['destroyer', 'cruiser', 'battleship'].entries()) {
    const g = N.createGame({ shipClass, difficulty: ['easy', 'normal', 'hard'][index], seed: 100 + index });
    for (let frame = 0; frame < 60 * 500 && g.phase === 'playing'; frame++) {
      const target = g.ships.find(s => s.team === 1 && s.hp > 0 && s.visible);
      const aim = target ? N.predictIntercept(g.player, target) : { x: g.player.x, y: g.player.y - 800 };
      N.tickGame(g, DT, { throttle: frame % 1200 < 1000 ? 4 : 0, turn: Math.sin(frame / 240) * 0.35, aimX: aim.x, aimY: aim.y, fire: !!target, ammo: frame % 1000 < 500 ? 'HE' : 'AP' });
      if (frame % 1200 === 0 && g.player.hp < g.player.maxHp * 0.75) N.useConsumable(g, 'repair');
      if (g.player.fireTime > 0 || g.player.floodTime > 0) N.useConsumable(g, 'damageControl');
      if (frame % 600 === 0) finiteState(g);
    }
    finiteState(g);
    assert.notEqual(g.phase, 'playing', 'round must finish by its declared limit');
  }
});

test('operations create independent maps, scores, objectives and spawn positions', () => {
  for (const id of ['northern', 'bastion', 'openwater']) {
    const operation = N.OPERATIONS[id], a = N.createGame({ operationId: id }), b = N.createGame({ operationId: id });
    assert.equal(a.operationId, id); assert.equal(a.mode, operation.mode);
    assert.equal(a.duration, operation.duration); assert.equal(a.score[0], operation.initialScore);
    assert.equal(a.zones.length, operation.zones.length);
    assert.equal(a.player.x, operation.spawns.blue[0].x);
    a.islands[0].x += 1;
    assert.notEqual(a.islands[0].x, b.islands[0].x);
    if (a.zones.length) { a.zones[0].progress = 0.5; assert.equal(b.zones[0].progress, 0); assert.equal(operation.zones[0].progress, 0); }
  }
});

test('loadout tradeoffs modify only the player without mutating base profiles', () => {
  const base = N.createGame({ shipClass: 'cruiser' });
  for (const id of ['balanced', 'artillery', 'survival', 'maneuver']) {
    const g = N.createGame({ shipClass: 'cruiser', loadoutId: id }), m = N.LOADOUTS[id].modifiers;
    assert.equal(g.loadoutId, id);
    assert.equal(g.player.maxHp, N.CLASSES.cruiser.maxHp * m.maxHp);
    assert.equal(g.player.reloadMax, N.CLASSES.cruiser.reloadMax * m.reload);
    assert.equal(g.player.maxSpeed, N.CLASSES.cruiser.maxSpeed * m.maxSpeed);
    assert.equal(g.player.turnRate, N.CLASSES.cruiser.turnRate * m.turnRate);
    assert.equal(g.ships[1].maxHp, base.ships[1].maxHp);
    assert.equal(g.ships[4].reloadMax, base.ships[4].reloadMax);
    assert.equal(g.player.sections.mid.maxHp, g.player.maxHp * .56);
  }
  assert.equal(N.CLASSES.cruiser.maxHp, 32000);
});

test('elimination ignores score thresholds and resolves timeout by remaining fleet HP share', () => {
  const g = N.createGame({ operationId: 'openwater' });
  for (const s of g.ships) { s.aiDisabled = true; s.throttle = 0; if (s.team === 1) s.hp *= .4; }
  g.score[1] = 1000;
  N.tickGame(g, DT, {}); assert.equal(g.phase, 'playing');
  g.time = g.duration - DT / 2; N.tickGame(g, DT, {});
  assert.equal(g.phase, 'won'); assert.match(g.reason, /잔존 내구도/);
});

test('weapon solution rejects blocked and out-of-range shots without consuming reload', () => {
  const { g, p, target } = fixture();
  let solution = N.getWeaponSolution(g, p, 'HE', p.x + p.range + 10, p.y);
  assert.equal(solution.reason, 'range'); assert.equal(solution.ready, false);
  assert.equal(N.firePlayer(g, 'HE', p.x + p.range + 10, p.y), false); assert.equal(p.reload, 0);
  g.islands.push({ x: 1400, y: 1600, rx: 100, ry: 100, rotation: 0, seed: 1 });
  solution = N.getWeaponSolution(g, p, 'AP', target.x, target.y);
  assert.equal(solution.reason, 'obstructed'); assert.equal(solution.blockedByIsland, true);
  assert.equal(N.firePlayer(g, 'AP', target.x, target.y), false); assert.equal(g.projectiles.length, 0);
  assert.ok(Number.isFinite(solution.flightTime) && Number.isFinite(solution.reload));
});

test('weapon readiness distinguishes traversal, cooldown, disabled guns and broadside barrels', () => {
  const { g, p, target } = fixture();
  p.gunAngle = Math.PI;
  assert.equal(N.getWeaponSolution(g, p, 'HE', target.x, target.y).reason, 'traverse');
  p.gunAngle = 0; p.reload = 2;
  assert.equal(N.getWeaponSolution(g, p, 'HE', target.x, target.y).reason, 'cooldown');
  p.reload = 0;
  const bow = N.getWeaponSolution(g, p, 'HE', target.x, target.y);
  p.angle = Math.PI / 2;
  const broadside = N.getWeaponSolution(g, p, 'HE', target.x, target.y);
  assert.ok(broadside.barrels > bow.barrels); assert.equal(broadside.totalBarrels, N.CLASSES.cruiser.gunCount);
  Object.assign(p.modules.guns, { state: 'critical', time: 5, maxTime: 11 });
  assert.equal(N.getWeaponSolution(g, p, 'HE', target.x, target.y).reason, 'disabled');
  assert.equal(N.firePlayer(g, 'HE', target.x, target.y), false);
});

test('DD and CA torpedoes enforce their exact side arc boundaries', () => {
  for (const [classId, minimum, maximum] of [['destroyer', 30, 150], ['cruiser', 45, 135]]) {
    const { g, p } = fixture(classId);
    for (const degrees of [minimum, 90, maximum, -minimum, -90, -maximum]) {
      const a = degrees * Math.PI / 180;
      assert.equal(N.getWeaponSolution(g, p, 'TORP', p.x + Math.cos(a) * 500, p.y + Math.sin(a) * 500).arcValid, true);
    }
    for (const degrees of [0, minimum - 1, maximum + 1, 180]) {
      const a = degrees * Math.PI / 180;
      const solution = N.getWeaponSolution(g, p, 'TORP', p.x + Math.cos(a) * 500, p.y + Math.sin(a) * 500);
      assert.equal(solution.reason, 'arc'); assert.equal(solution.ready, false);
    }
  }
});

test('wide and narrow torpedo spreads retain count and damage but change actual directions', () => {
  const a = fixture('destroyer'), b = fixture('destroyer');
  a.p.angle = b.p.angle = Math.PI / 2;
  assert.equal(N.firePlayer(a.g, 'TORP', 1800, 1600, 'narrow'), true);
  assert.equal(N.firePlayer(b.g, 'TORP', 1800, 1600, 'wide'), true);
  const narrow = a.g.projectiles, wide = b.g.projectiles;
  assert.equal(narrow.length, wide.length); assert.equal(narrow[0].damage, wide[0].damage);
  assert.ok(wide[wide.length - 1].angle - wide[0].angle > (narrow[narrow.length - 1].angle - narrow[0].angle) * 2);
});

function shell(g, owner, target, overrides = {}) {
  return { ammo: 'HE', damage: 1000, caliber: 203, angle: 0, ownerId: owner.id, team: owner.team, x: target.x, y: target.y, firedRange: 700, maxRange: 1500, fireChance: 0, ...overrides };
}

test('a depleted section still takes reduced damage while a fresh region takes full damage', () => {
  const { g, p, target } = fixture();
  g.rng = () => .99; target.angle = 0; target.sections.bow.hp = 100;
  const bowPoint = { x: target.x + target.length * .35, y: target.y };
  const first = N.resolveShellHit(g, shell(g, p, target, bowPoint), target).damage;
  const second = N.resolveShellHit(g, shell(g, p, target, bowPoint), target).damage;
  const mid = N.resolveShellHit(g, shell(g, p, target), target).damage;
  assert.equal(target.sections.bow.hp, 0);
  assert.ok(second > 0 && second < first && first < mid);
  assert.ok(Math.abs(second / mid - .35) < 1e-9);
});

test('HE and citadel damage contribute different real recoverable amounts', () => {
  function damage(ammo) {
    const { g, p, target } = fixture(); g.rng = () => .99; p.angle = Math.PI / 2;
    const result = N.resolveShellHit(g, shell(g, target, p, { ammo }), p);
    return { result, ledger: p.recoverableHp, preview: p.repairPreview };
  }
  const he = damage('HE'), ap = damage('AP');
  assert.equal(ap.result.result, 'citadel');
  assert.ok(Math.abs(he.ledger - he.result.damage * .55) < 1e-8);
  assert.ok(Math.abs(ap.ledger - ap.result.damage * .10) < 1e-8);
  assert.equal(he.preview, he.ledger);
});

test('repair rejects unrecoverable loss and cannot heal beyond its damage ledger', () => {
  const { g, p } = fixture(); p.hp -= 5000;
  const charges = p.consumables.repair.charges;
  assert.equal(N.useConsumable(g, 'repair'), false); assert.equal(p.consumables.repair.charges, charges);
  p.recoverableHp = 500;
  const before = p.hp; assert.equal(N.useConsumable(g, 'repair'), true);
  step(g, 12);
  assert.ok(Math.abs(p.hp - before - 500) < 1e-6);
  assert.ok(p.recoverableHp < 1e-6); assert.ok(p.hp < p.maxHp);
});

test('one repair charge has an 18 percent cap even with a large recoverable ledger', () => {
  const { g, p } = fixture(); p.hp = p.maxHp * .4; p.recoverableHp = p.maxHp * .6;
  const before = p.hp, ledger = p.recoverableHp;
  assert.equal(N.useConsumable(g, 'repair'), true); step(g, 12);
  const healed = p.hp - before;
  assert.ok(Math.abs(healed - p.maxHp * .18) < .001);
  assert.ok(Math.abs(p.recoverableHp - (ledger - healed)) < .001);
});

test('impact region produces seeded module damage with explicit Korean feedback', () => {
  const { g, p, target } = fixture(); g.rng = () => 0; p.angle = 0;
  N.resolveShellHit(g, shell(g, target, p, { x: p.x + p.length * .35 }), p);
  assert.equal(p.modules.guns.state, 'critical');
  assert.ok(p.modules.guns.time > 0);
  assert.ok(g.events.some(e => e.type === 'module' && e.module === 'guns' && /치명적 손상/.test(e.text)));
});

test('damage control repairs damaged modules but critical modules recover on their own timer', () => {
  const { g, p } = fixture();
  Object.assign(p.modules.guns, { state: 'damaged', time: 8, maxTime: 8 });
  Object.assign(p.modules.engine, { state: 'critical', time: 13, maxTime: 13 });
  assert.equal(N.useConsumable(g, 'damageControl'), true);
  assert.equal(p.modules.guns.state, 'normal'); assert.equal(p.modules.engine.state, 'critical');
  step(g, 14); assert.equal(p.modules.engine.state, 'normal'); assert.equal(p.modules.engine.time, 0);
});

test('gun damage pauses existing reload progress and resumes without resetting it', () => {
  const { g, p } = fixture(); p.reload = 5;
  Object.assign(p.modules.guns, { state: 'critical', time: 2, maxTime: 11 });
  step(g, 1); assert.equal(p.reload, 5);
  step(g, 1.5); assert.ok(p.reload < 5 && p.reload > 4.4);
});

test('critical engine and rudder damage reduce movement without permanent immobilization', () => {
  const base = fixture(), engine = fixture();
  Object.assign(engine.p.modules.engine, { state: 'critical', time: 13, maxTime: 13 });
  step(base.g, 6, { throttle: 4 }); step(engine.g, 6, { throttle: 4 });
  assert.ok(engine.p.speed > 0 && engine.p.speed < base.p.speed * .7);
  const a = fixture(), b = fixture(); a.p.speed = b.p.speed = a.p.maxSpeed; a.p.driveSpeed = b.p.driveSpeed = a.p.maxSpeed;
  Object.assign(b.p.modules.rudder, { state: 'critical', time: 11, maxTime: 11 });
  step(a.g, 2, { throttle: 4, turn: 1 }); step(b.g, 2, { throttle: 4, turn: 1 });
  assert.ok(Math.abs(b.p.angle) < Math.abs(a.p.angle) * .6);
});

test('automatic secondaries damage visible nearby enemies without consuming the main battery', () => {
  const { g, p, target } = fixture();
  Object.assign(target, { x: 1320, y: 1600, width: 100, length: 160 });
  step(g, DT);
  assert.ok(g.projectiles.some(projectile => projectile.secondary)); assert.equal(p.reload, 0);
  step(g, 8);
  assert.ok(g.stats.secondaryDamage > 0);
  assert.equal(g.stats.secondaryDamage, g.damageBreakdown.SECONDARY);
  assert.equal(g.stats.shots, 0);
});

test('secondary trajectories collide with terrain even when center-to-center sight is clear', () => {
  const { g, p, target } = fixture('cruiser', 42);
  Object.assign(p, { x: 1000, y: 1000, angle: Math.PI / 2 });
  Object.assign(target, { x: 1300, y: 1000 });
  g.islands.push({ x: 1070, y: 1016, rx: 20, ry: 8, rotation: 0, seed: 1 });
  step(g, DT, { aimX: 1000, aimY: 500 });
  const shots = g.projectiles.filter(projectile => projectile.secondary);
  assert.ok(shots.some(projectile => projectile.landHit));
});

test('damage statistics and weapon breakdown never count overkill as applied damage', () => {
  const { g, p, target } = fixture(); target.hp = 50;
  const result = N.resolveShellHit(g, shell(g, p, target, { damage: 10000 }), target);
  assert.equal(result.damage, 50); assert.equal(g.stats.damage, 50); assert.equal(g.damageBreakdown.HE, 50);
  assert.equal(g.stats.penetrations, 1); assert.equal(g.stats.kills, 1); assert.equal(target.hp, 0);
});

test('torpedo warnings require detected hostile projectiles on a threatening course', () => {
  const { g, p, target } = fixture(); target.angle = Math.PI / 2;
  g.player = target; assert.equal(N.firePlayer(g, 'TORP', p.x, p.y), true); g.player = p;
  step(g, .8); assert.equal(g.warnings.torpedo, false);
  step(g, 1.4); assert.equal(g.warnings.torpedo, true);
  assert.ok(Number.isFinite(g.warnings.torpedoBearing) && g.warnings.torpedoDistance < 470);
});

test('potential damage counts a passing hostile projectile once', () => {
  const { g, p, target } = fixture(); target.angle = Math.PI / 2;
  g.player = target; N.firePlayer(g, 'TORP', p.x, p.y); g.player = p;
  const torpedo = g.projectiles[0]; g.projectiles = [torpedo];
  Object.assign(torpedo, { x: p.x + 100, y: p.y + 65, vx: -100, vy: 0, angle: Math.PI, distance: 400 });
  step(g, .2); const potential = g.stats.potentialDamage;
  assert.equal(potential, torpedo.damage);
  step(g, .2); assert.equal(g.stats.potentialDamage, potential);
});

test('orders reject unknown or hidden targets, replace previous orders and expire', () => {
  const { g, target } = fixture(); target.x = 1550; step(g, DT);
  assert.equal(N.issueOrder(g, { type: 'focus', targetId: target.id }), true);
  assert.equal(g.order.targetId, target.id);
  assert.equal(N.issueOrder(g, { type: 'focus', targetId: 'missing' }), false);
  target.visible = false; assert.equal(N.issueOrder(g, { type: 'focus', targetId: target.id }), false);
  assert.equal(N.issueOrder(g, { type: 'capture', zoneId: 'unknown' }), false);
  assert.equal(N.issueOrder(g, { type: 'regroup' }), true); assert.equal(g.order.type, 'regroup');
  g.time = g.order.until; step(g, DT); assert.equal(g.order, null);
});

test('allied focus fire does not track an enemy after it leaves shared visibility', () => {
  const { g, p, target } = fixture(); target.x = 1500;
  const ally = g.ships.find(s => s.id === 'blue-dd');
  Object.assign(ally, { x: 1050, y: 1500, aiDisabled: false, aiThink: 0, speed: 0, throttle: 0 });
  step(g, DT); assert.equal(target.visible, true);
  N.issueOrder(g, { type: 'focus', targetId: target.id });
  step(g, .3); assert.equal(ally.aiTargetId, target.id);
  target.x = 4000; target.y = 3000; target.bloomTime = 0;
  step(g, .3); assert.equal(target.visible, false); assert.notEqual(ally.aiTargetId, target.id);
  assert.equal(g.order.targetId, target.id); assert.ok(p.hp > 0);
});

test('capture orders direct an allied ship toward the requested real zone', () => {
  const { g } = fixture();
  g.zones = [{id: 'A', x: 300, y: 800, radius: 150, progress: 0, owner: null, contested: false}, {id: 'B', x: 1700, y: 500, radius: 150, progress: 0, owner: null, contested: false}];
  const ally = g.ships.find(s => s.id === 'blue-dd');
  Object.assign(ally, { x: 700, y: 500, angle: 0, aiDisabled: false, aiThink: 0 });
  assert.equal(N.issueOrder(g, { type: 'capture', zoneId: 'B' }), true);
  const before = N.distance(ally, g.zones[1]); step(g, 5);
  assert.ok(N.distance(ally, g.zones[1]) < before - 100);
});

function copied(value) { return JSON.parse(JSON.stringify(value)); }

test('a snapshot restores the exact player reference, match identity and RNG continuation', () => {
  const g = N.createGame({ seed: 8123, operationId: 'bastion', loadoutId: 'artillery', matchId: 'persistent-round-8123' });
  for (let i = 0; i < 37; i++) g.rng();
  const snapshot = N.serializeGame(g), restored = N.restoreGame(copied(snapshot));
  assert.ok(restored); assert.equal(snapshot.version, 3); assert.equal(restored.matchId, g.matchId);
  assert.equal(restored.player, restored.ships.find(s => s.id === restored.playerId));
  for (let i = 0; i < 100; i++) assert.equal(restored.rng(), g.rng());
  restored.player.hp--; assert.notEqual(restored.player.hp, g.player.hp);
});

test('resumed combat continues byte-identically with the same input sequence', () => {
  const g = N.createGame({ seed: 721, shipClass: 'battleship', operationId: 'bastion', loadoutId: 'survival' });
  const controls = { throttle: 2, turn: .13, aimX: 2100, aimY: 1300, ammo: 'HE', fire: true };
  for (let i = 0; i < 1200; i++) N.tickGame(g, DT, controls);
  const restored = N.restoreGame(copied(N.serializeGame(g)));
  assert.ok(restored);
  for (let i = 0; i < 600; i++) { N.tickGame(g, DT, controls); N.tickGame(restored, DT, controls); }
  function state(value) { return JSON.stringify({ ships: value.ships, projectiles: value.projectiles, effects: value.effects, events: value.events, score: value.score, stats: value.stats, phase: value.phase, time: value.time, rng: value.rng.getState() }); }
  assert.equal(state(restored), state(g));
});

test('late combat saves accept legitimate hit, kill, module, repair and order records', () => {
  const g = N.createGame({ seed: 42, shipClass: 'battleship', matchId: 'late-combat-check' });
  g.time = 120; for (const s of g.ships) { s.aiDisabled = true; s.throttle = 0; }
  const enemy = g.ships.find(s => s.id === 'red-ca'), victim = g.ships.find(s => s.id === 'red-dd');
  for (let i = 0; i < 30 && !g.events.some(e => e.type === 'module'); i++) N.resolveShellHit(g, shell(g, enemy, g.player, { damage: 800, caliber: 381 }), g.player);
  N.resolveShellHit(g, shell(g, g.player, victim, { damage: 100000 }), victim);
  N.useConsumable(g, 'repair'); N.issueOrder(g, { type: 'regroup' });
  assert.ok(g.events.some(e => e.type === 'module')); assert.ok(g.events.some(e => e.type === 'kill')); assert.ok(g.events.some(e => e.type === 'hit'));
  const restored = N.restoreGame(copied(N.serializeGame(g)));
  assert.ok(restored, 'valid late combat state must remain resumable');
  assert.equal(restored.player.recoverableHp, g.player.recoverableHp);
  assert.equal(restored.player.consumables.repair.active, g.player.consumables.repair.active);
  assert.equal(restored.matchId, 'late-combat-check');
});

test('restore rejects wrong versions, nonfinite numbers, invalid enums and duplicate identities', () => {
  const original = N.serializeGame(N.createGame({ seed: 2 }));
  const mutations = [s => {s.version = 1;}, s => {s.rngState = -1;}, s => {s.data.world.w = Infinity;}, s => {s.data.ships[0].hp = NaN;}, s => {s.data.ships[0].modules.engine.state = 'destroyed';}, s => {s.data.ships[1].id = s.data.ships[0].id;}, s => {s.data.ships[0].consumables.repair.charges = -10;}, s => {s.data.projectiles = new Array(513).fill({});}];
  for (const mutate of mutations) { const bad = copied(original); mutate(bad); assert.equal(N.restoreGame(bad), null); }
});

test('restore refuses accessor execution and prototype-pollution payloads', () => {
  const original = N.serializeGame(N.createGame());
  const accessor = copied(original); let calls = 0;
  Object.defineProperty(accessor.data, 'time', { enumerable: true, get() { calls++; return 0; } });
  assert.equal(N.restoreGame(accessor), null); assert.equal(calls, 0);
  const pollution = copied(original);
  Object.defineProperty(pollution.data.ships[0], '__proto__', { value: { polluted: true }, enumerable: true });
  assert.equal(N.restoreGame(pollution), null); assert.equal({}.polluted, undefined);
});

test('ended battles cannot be saved or restored as active matches', () => {
  const g = N.createGame(), snapshot = N.serializeGame(g);
  g.phase = 'won'; assert.equal(N.serializeGame(g), null);
  snapshot.data.phase = 'won'; assert.equal(N.restoreGame(snapshot), null);
});

test('turret readiness and numeric alignment time match the tight firing tolerance', () => {
  const { g, p, target } = fixture(); p.gunAngle = .27;
  const solution = N.getWeaponSolution(g, p, 'HE', target.x, target.y);
  assert.equal(solution.reason, 'traverse'); assert.equal(N.firePlayer(g, 'HE', target.x, target.y), false);
  assert.ok(Math.abs(solution.alignmentTime - (.27 - N.GUN_ALIGNMENT_TOLERANCE) / 1.7) < 1e-8);
  step(g, .3, { fire: true, aimX: target.x, aimY: target.y });
  assert.ok(g.projectiles.length > 0);
  assert.ok(g.projectiles.every(shot => Math.abs(N.angleDelta(shot.angle, p.gunAngle)) < .04));
  const noAmmo = fixture('battleship');
  assert.equal(N.getWeaponSolution(noAmmo.g, noAmmo.p, 'TORP', 1800, 1600).alignmentTime, 0);
});

test('a grounded player can reverse away instead of remaining pinned to the shoreline', () => {
  const { g, p } = fixture();
  g.islands.push({ x: 1450, y: 1600, rx: 130, ry: 180, rotation: 0, seed: 1 });
  step(g, 12, { throttle: 4 });
  assert.equal(p.contact.kind, 'island');
  const contactX = p.x;
  step(g, 6, { throttle: -1 });
  assert.ok(p.x < contactX - 80, `reverse should clear the coast, moved ${contactX - p.x}`);
  assert.ok(p.speed < 0 && p.driveSpeed < 0);
  assert.ok(Math.abs(Math.abs(p.speed) - Math.hypot(p.vx, p.vy)) < 1e-6);
});

function groundedAIFixture() {
  const { g, p } = fixture();
  g.islands = [{ x: 2100, y: 1600, rx: 200, ry: 350, rotation: 0, seed: 1 }];
  g.zones = [{ id: 'B', x: 2600, y: 1600, radius: 200, progress: 0, owner: null, contested: false }];
  Object.assign(p, { x: 2100, y: 2800 });
  const bot = g.ships.find(s => s.id === 'blue-bb');
  Object.assign(bot, { x: 1810, y: 1600, angle: 0, gunAngle: 0, speed: 63, driveSpeed: 63, aiDisabled: false, aiThink: 0, aiLane: 0 });
  const enemy = g.ships.find(s => s.id === 'red-dd'); Object.assign(enemy, { x: 800, y: 250 });
  return { g, p, bot };
}

test('grounded AI escapes, routes around the island and reaches its actual objective', () => {
  const { g, bot } = groundedAIFixture();
  step(g, 1); assert.ok(bot.recovery, 'collision should establish a stable escape waypoint');
  step(g, 59);
  assert.ok(bot.x > 2400, `AI must reach the other side, not oscillate at ${bot.x}`);
  assert.equal(bot.recovery, null);
  assert.equal(g.zones[0].owner, 0, 'the recovered AI should finish its capture objective');
  finiteState(g);
});

test('boundary contact removes outward velocity while retaining useful steering and inward escape', () => {
  const { g, p } = fixture('battleship');
  const edge = p.length * .55;
  Object.assign(p, { x: edge, y: 1600, angle: Math.PI, gunAngle: Math.PI, speed: p.maxSpeed, driveSpeed: p.maxSpeed });
  step(g, DT, { throttle: 4 });
  assert.equal(p.x, edge); assert.ok(Math.abs(p.vx) < 1e-9);
  step(g, 10, { throttle: 4, turn: 1 });
  assert.ok(p.x > edge + 20, 'turning should allow motion back into the map');
  assert.ok(Math.abs(N.angleDelta(p.angle, Math.PI)) > 1.7);
  assert.ok(Math.abs(Math.abs(p.speed) - Math.hypot(p.vx, p.vy)) < 1e-6);
});

test('AI chooses a clear firing line over a nearer team-spotted ship behind terrain', () => {
  const { g, p, target } = fixture();
  const bot = g.ships.find(s => s.id === 'blue-dd'), clear = g.ships.find(s => s.id === 'red-ca');
  Object.assign(bot, { x: 1000, y: 1600, angle: 0, gunAngle: 0, aiDisabled: false, aiThink: 0 });
  Object.assign(target, { x: 1600, y: 1600 }); Object.assign(clear, { x: 1200, y: 2400 });
  Object.assign(p, { x: 1700, y: 1800 });
  g.islands = [{ x: 1350, y: 1600, rx: 90, ry: 220, rotation: 0, seed: 1 }];
  step(g, DT);
  assert.equal(target.seenBy[0], true); assert.equal(clear.seenBy[0], true);
  assert.equal(N.getWeaponSolution(g, bot, 'HE', target.x, target.y).blockedByIsland, true);
  assert.equal(bot.aiTargetId, clear.id);
});

test('target hysteresis resists small distance changes but accepts a materially better target', () => {
  const { g, target } = fixture();
  const bot = g.ships.find(s => s.id === 'blue-dd'), retained = g.ships.find(s => s.id === 'red-ca');
  Object.assign(bot, { x: 1000, y: 1600, angle: 0, aiDisabled: false, aiThink: 0, aiTargetId: retained.id });
  Object.assign(target, { x: 1600, y: 1600 }); Object.assign(retained, { x: 1640, y: 1620 });
  step(g, DT); assert.equal(bot.aiTargetId, retained.id);
  target.x = 1540; step(g, .25); assert.equal(bot.aiTargetId, retained.id);
  target.x = 1300; step(g, .25); assert.equal(bot.aiTargetId, target.id);
});

test('an explicit capture order completes despite an unthreatening visible enemy outside the ring', () => {
  const { g, p, target } = fixture();
  Object.assign(p, { x: 2100, y: 2700 });
  const bot = g.ships.find(s => s.id === 'blue-dd');
  Object.assign(bot, { x: 1000, y: 1500, angle: 0, gunAngle: 0, aiDisabled: false, aiThink: 0, aiLane: 0 });
  Object.assign(target, { x: 1600, y: 1500 });
  g.zones = [{ id: 'B', x: 1000, y: 1500, radius: 235, progress: 0, owner: null, contested: false }];
  N.issueOrder(g, { type: 'capture', zoneId: 'B' }); step(g, 15);
  assert.equal(g.zones[0].owner, 0); assert.ok(N.distance(bot, g.zones[0]) < g.zones[0].radius);
  assert.equal(bot.hp, bot.maxHp, 'fixture enemy must remain unthreatening');
});

test('AI uses repair and damage control while disengaged with no visible targets', () => {
  const { g } = fixture();
  const bot = g.ships.find(s => s.id === 'blue-dd');
  Object.assign(bot, { x: 500, y: 2800, aiDisabled: false, aiThink: 0, hp: bot.maxHp * .5, recoverableHp: bot.maxHp * .25, fireTime: 20, fireStacks: 1 });
  Object.assign(bot.modules.engine, { state: 'damaged', time: 8, maxTime: 8 });
  step(g, DT);
  assert.equal(bot.aiTargetId, null);
  assert.ok(bot.consumables.repair.active > 0); assert.ok(bot.consumables.damageControl.active > 0);
  assert.equal(bot.fireTime, 0); assert.equal(bot.modules.engine.state, 'normal');
});

test('the captured real V2 save migrates without rewriting shots, resources, identity or RNG', () => {
  const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v2-active-bastion.json'), 'utf8'));
  assert.equal(original.version, 2); assert.ok(original.data.projectiles.length > 0);
  const restored = N.restoreGame(original); assert.ok(restored);
  assert.equal(restored.matchId, original.data.matchId); assert.equal(restored.rng.getState(), original.rngState);
  assert.equal(JSON.stringify(restored.projectiles), JSON.stringify(original.data.projectiles));
  for (const old of original.data.ships) {
    const ship = restored.ships.find(s => s.id === old.id);
    assert.equal(ship.driveSpeed, old.speed); assert.equal(ship.contact.kind, 'none'); assert.equal(ship.recovery, null);
    for (const key of ['hp', 'recoverableHp', 'repairBudget', 'reload', 'torpReload']) assert.equal(ship[key], old[key]);
    assert.equal(JSON.stringify(ship.consumables), JSON.stringify(old.consumables));
  }
  assert.equal(restored.trainingMode, false);
  const v3 = N.serializeGame(restored); assert.equal(v3.version, 3); assert.ok(N.restoreGame(copied(v3)));
});

test('V2 migration validates the original schema rather than bypassing invalid stored fields', () => {
  const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v2-active-bastion.json'), 'utf8'));
  let bad = copied(original); bad.data.ships[0].modules.guns.state = 'broken'; assert.equal(N.restoreGame(bad), null);
  bad = copied(original); bad.data.ships[0].driveSpeed = 0; assert.equal(N.restoreGame(bad), null);
  bad = copied(original); bad.version = 3; assert.equal(N.restoreGame(bad), null);
  bad = N.serializeGame(N.createGame()); delete bad.data.ships[0].contact; assert.equal(N.restoreGame(bad), null);
});

test('active escape and collision state survive a deterministic V3 continuation', () => {
  const { g } = groundedAIFixture(); step(g, 1);
  const saved = N.serializeGame(g), restored = N.restoreGame(copied(saved)); assert.ok(restored);
  assert.ok(restored.ships.find(s => s.id === 'blue-bb').recovery);
  for (let i = 0; i < 1800; i++) { N.tickGame(g, DT, { throttle: 0 }); N.tickGame(restored, DT, { throttle: 0 }); }
  assert.equal(JSON.stringify(N.serializeGame(g)), JSON.stringify(N.serializeGame(restored)));
});

test('training skips normal victory and timeout but still reports real player death', () => {
  const { g, p } = fixture(); g.trainingMode = true; g.ships = [p];
  g.score[0] = g.targetScore + 1; g.time = g.duration - DT / 2;
  step(g, DT); assert.equal(g.phase, 'playing'); assert.equal(N.serializeGame(g), null);
  p.hp = 0; step(g, DT); assert.equal(g.phase, 'lost');
});

test('real shell and torpedo hit feedback identifies its weapon and player owner', () => {
  const first = fixture();
  N.resolveShellHit(first.g, shell(first.g, first.p, first.target), first.target);
  const hit = first.g.events.find(e => e.type === 'hit');
  assert.equal(hit.ammo, 'HE'); assert.equal(hit.ownerId, first.p.id); assert.equal(hit.secondary, false); assert.ok(hit.damage > 0);
  const second = fixture('destroyer'); second.p.angle = Math.PI / 2;
  Object.assign(second.target, { x: 1450, y: 1600, width: 100 });
  N.firePlayer(second.g, 'TORP', second.target.x, second.target.y); step(second.g, 7);
  const torpedo = second.g.events.find(e => e.type === 'hit' && e.result === 'torpedo');
  assert.ok(torpedo); assert.equal(torpedo.ammo, 'TORP'); assert.equal(torpedo.ownerId, second.p.id); assert.equal(torpedo.secondary, false);
});

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
