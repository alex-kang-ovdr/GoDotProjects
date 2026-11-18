'use strict';

// Public API / state-contract tests. Fixtures may set a combat situation directly;
// all progression and command execution then go through the production methods.
// This is not a claim of compatibility with the original FTL binary or balance.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const assetRoot = path.resolve(__dirname, '..', 'dist');
const context = vm.createContext({ console });
for (const file of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(assetRoot, file), 'utf8'), context, { filename: file });
}
const SW = context.Starward;
const copy = value => JSON.parse(JSON.stringify(value));
const didSucceed = result => result === true || !!(result && result.ok);

function fresh(seed = 123456789) {
  const game = new SW.Game();
  game.newRun(seed);
  return game;
}

function advance(game, seconds, step = 1 / 60) {
  for (let i = 0; i < Math.ceil(seconds / step); i += 1) game.tick(step);
}

function quietCombat(seed = 123456789, enemyOptions = {}) {
  const game = fresh(seed);
  game.startRun(); // The v6 campaign supplies encounter ownership before tactical fixture replacement.
  game.startCombat({ name: '검증용 표적', layoutId: 'legacy', hull: 60, shieldLayers: 0, weaponDefs: ['burst_laser'], enemy: true, engineLevel: 0, ...enemyOptions });
  for (const ship of [game.state.player, game.state.enemy]) {
    for (const weapon of ship.weapons) {
      weapon.auto = false;
      weapon.fireMode = 'manual';
      weapon.target = null;
    }
  }
  for (const weapon of game.state.enemy.weapons) weapon.enabled = false;
  game.state.enemy.systems.weapons.power = 0;
  game.state.enemy.systems.engines.power = 0;
  game.state.enemy.evasion = 0;
  game.setPaused(false);
  return game;
}

function assertPower(game) {
  const ship = game.state.player;
  let used = 0;
  for (const system of [...Object.values(ship.systems), ...Object.values(ship.aux || {})]) {
    assert.ok(Number.isFinite(system.power), system.id + ': finite power');
    assert.ok(system.power >= 0, system.id + ': no negative power');
    assert.ok(system.power <= Math.max(0, system.level - system.damage), system.id + ': power within usable capacity');
    used += system.power;
  }
  assert.ok(used <= ship.reactor, 'allocations fit the reactor');
  assert.equal(game.getPowerUsed(), used);
  assert.equal(ship.systems.bridge.power, 0, 'bridge is passive');
}

function navigationSnapshot(game) {
  const s = game.state;
  return copy({ resources: s.resources, currentNodeId: s.currentNodeId, sector: s.sector, jumpCount: s.jumpCount, fleet: s.fleet });
}

function gameplaySnapshot(game) {
  const s = game.state;
  return copy({ version: s.version, time: s.time, mode: s.mode, paused: s.paused, player: s.player, enemy: s.enemy, projectiles: s.projectiles, resources: s.resources, nodes: s.nodes, currentNodeId: s.currentNodeId, sector: s.sector, fleet: s.fleet, jumpCount: s.jumpCount, bossPhase: s.bossPhase, event: s.event, reward: s.reward, stats: s.stats });
}

function nextNode(game) {
  const current = game.state.nodes.find(node => node.id === game.state.currentNodeId);
  assert.ok(current, 'current beacon exists');
  const target = game.state.campaign.finalStand?.bossNodeId || game.state.nodes.find(node => node.type === 'exit').id;
  const queue = [[current.id]], seen = new Set([current.id]);
  while (queue.length) {
    const route = queue.shift(), last = game.state.nodes.find(node => node.id === route.at(-1));
    if (last.id === target) return game.state.nodes.find(node => node.id === route[1] || node.id === current.id && route.length === 1);
    for (const id of last.links) if (!seen.has(id)) { seen.add(id); queue.push(route.concat(id)); }
  }
  assert.fail('the actual symmetric map must connect to the exit or moving flagship');
}

function finishCombat(game) {
  assert.equal(game.state.mode, 'combat');
  game.state.enemy.hull = 0;
  game.setPaused(false);
  advance(game, 0.1);
}

function resolveNonCombat(game) {
  if (game.state.mode === 'reward') {
    if (game.state.reward?.salvage?.status === 'pending') assert.ok(didSucceed(game.resolveSalvage('scrap')));
    return game.continueReward();
  }
  if (game.state.mode === 'shop') {
    while (game.state.resources.fuel < 10 && !game.shopItems().find(item => item.id === 'fuel').disabled) assert.ok(didSucceed(game.buy('fuel')));
    return game.leaveShop();
  }
  if (game.state.mode === 'event') {
    const choice = game.state.event.choices.find(item => !item.disabled);
    assert.ok(choice, 'an event always has an actionable option');
    return game.chooseEvent(choice.id);
  }
  if (game.state.mode === 'map') {
    if (game.state.campaign.pendingSectorChoice) return game.advanceSector(game.getWorldMap().availableIds[0]);
    if (game.state.campaign.finalStand?.bossNodeId === game.state.currentNodeId) return game.engageFlagship();
    return game.jump(nextNode(game).id);
  }
  throw new Error('Unexpected mode while following campaign: ' + game.state.mode);
}

function reachBoss(game) {
  game.startRun();
  for (let safety = 0; safety < 500; safety += 1) {
    if (game.state.mode === 'combat' && game.state.enemy.bossPhase > 0) return;
    if (game.state.mode === 'combat') finishCombat(game);
    else resolveNonCombat(game);
  }
  assert.fail('Campaign did not reach the boss within 500 transitions');
}

test('new run produces a complete, valid initial ship and campaign', () => {
  const game = fresh();
  assert.equal(game.state.version, 7);
  assert.equal(game.state.mode, 'briefing');
  assert.equal(game.state.player.hull, 30);
  assert.equal(game.state.player.crew.length, 3);
  assert.equal(game.state.sector, 1);
  assert.ok(game.state.nodes.some(node => node.id === game.state.currentNodeId));
  assert.deepEqual(copy(game.state.resources), { scrap: 60, fuel: 12, missiles: 10, droneParts: 4 });
  assertPower(game);
});

test('pause freezes combat time, charges, positions and health', () => {
  const game = quietCombat();
  game.moveCrew(game.state.player.crew[0].id, 'oxygen');
  game.setPaused(true);
  const before = gameplaySnapshot(game);
  advance(game, 5);
  assert.deepEqual(gameplaySnapshot(game), before);
});

test('paused crew and targeting orders are accepted without moving time forward', () => {
  const game = quietCombat();
  game.setPaused(true);
  const crew = game.state.player.crew[0];
  const position = { x: crew.x, y: crew.y, roomId: crew.roomId };
  const time = game.state.time;
  const weapon = game.state.player.weapons.find(item => item.type === 'laser');
  game.setWeaponAuto(weapon.id, true);
  assert.ok(didSucceed(game.moveCrew(crew.id, 'oxygen')));
  assert.ok(didSucceed(game.targetWeapon(weapon.id, 'weapons')));
  assert.deepEqual({ x: crew.x, y: crew.y, roomId: crew.roomId }, position);
  assert.equal(game.state.time, time);
  assert.equal(weapon.target, 'weapons');
  assert.equal(weapon.auto, true);
});

test('repeated power changes never overdraw or exceed damaged capacity', () => {
  const game = quietCombat();
  const ids = ['shields', 'engines', 'weapons', 'oxygen', 'medbay', 'bridge', 'drones', 'teleporter'];
  for (let round = 0; round < 12; round += 1) {
    for (const id of ids) {
      game.allocatePower(id, round % 3 === 0 ? -1 : 1);
      assertPower(game);
    }
  }
  game.state.player.systems.weapons.damage = game.state.player.systems.weapons.level;
  advance(game, 0.1);
  assertPower(game);
});

test('an invalid system command leaves valid allocations intact', () => {
  const game = fresh();
  const before = copy(game.state.player.systems);
  assert.equal(didSucceed(game.allocatePower('missing-system', 1)), false);
  assert.deepEqual(copy(game.state.player.systems), before);
  assertPower(game);
});

test('crew move across connected rooms and arrive at the chosen room', () => {
  const game = quietCombat();
  const crew = game.state.player.crew.find(item => item.species === 'human');
  assert.ok(didSucceed(game.moveCrew(crew.id, 'oxygen')));
  advance(game, 15);
  const room = game.state.player.rooms.find(item => item.id === 'oxygen');
  assert.equal(crew.roomId, room.id);
  assert.equal(crew.x, crew.tileX + 0.5); assert.equal(crew.y, crew.tileY + 0.5);
  assert.ok(crew.x > room.x && crew.x < room.x + room.w && crew.y > room.y && crew.y < room.y + room.h);
  assert.equal(crew.tileTransit, null); assert.equal(crew.tilePath.length, 0);
});

test('an engineer repairs a damaged system after reaching it', () => {
  const game = quietCombat();
  const crew = game.state.player.crew.find(item => item.species === 'engi');
  const system = game.state.player.systems.weapons;
  system.damage = 1;
  system.repair = 0;
  game.moveCrew(crew.id, 'weapons');
  advance(game, 30);
  assert.equal(system.damage, 0);
  assertPower(game);
});

test('powered medbay heals injured crew without exceeding max health', () => {
  const game = quietCombat();
  const crew = game.state.player.crew.find(item => item.species === 'human');
  crew.hp = 35;
  assert.ok(didSucceed(game.allocatePower('medbay', 1)));
  game.moveCrew(crew.id, 'medbay');
  advance(game, 25);
  assert.ok(crew.hp > 35);
  assert.ok(crew.hp <= crew.maxHp);
});

test('venting reduces oxygen, and closing the vent allows recovery', () => {
  const game = quietCombat();
  const room = game.state.player.rooms.find(item => item.id === 'oxygen');
  game.toggleVent();
  advance(game, 3);
  const vented = room.oxygen;
  assert.ok(vented < 100);
  game.toggleVent();
  advance(game, 6);
  assert.ok(room.oxygen > vented);
  for (const item of game.state.player.rooms) assert.ok(item.oxygen >= 0 && item.oxygen <= 100);
});

function prepareShot(game, type, shields) {
  const enemy = game.state.enemy;
  enemy.systems.shields.level = Math.max(2, shields * 2);
  enemy.systems.shields.damage = 0;
  enemy.systems.shields.power = shields * 2;
  enemy.shield = shields;
  enemy.maxShield = shields;
  enemy.shieldCharge = 0;
  enemy.reactor = Math.max(10, shields * 2 + 2);
  enemy.evasion = 0;
  const weapon = game.state.player.weapons.find(item => item.type === type);
  assert.ok(weapon, type + ' is equipped');
  weapon.enabled = true;
  game.setWeaponAuto(weapon.id, false);
  game.targetWeapon(weapon.id, 'weapons');
  weapon.charge = weapon.cooldown;
  return weapon;
}

function resolveShots(game) {
  assert.ok(game.state.projectiles.length > 0, 'a volley creates projectiles');
  for (let steps = 0; steps < 1200 && game.state.projectiles.length; steps += 1) game.tick(1 / 60);
  assert.equal(game.state.projectiles.length, 0, 'projectiles resolve in bounded time');
}

test('three normal shields absorb a three-shot laser volley', () => {
  const game = quietCombat(4, { shieldLayers: 3, reactor: 12 });
  const weapon = prepareShot(game, 'laser', 3);
  const before = game.state.enemy.hull;
  assert.ok(didSucceed(game.fireWeapon(weapon.id)));
  resolveShots(game);
  assert.equal(game.state.enemy.hull, before);
  assert.ok(game.state.enemy.shield < 3);
});

test('missiles bypass normal shields and charge ammunition once per volley', () => {
  const game = quietCombat(5, { shieldLayers: 3, reactor: 12 });
  const weapon = prepareShot(game, 'missile', 3);
  const before = { hull: game.state.enemy.hull, ammo: game.state.resources.missiles };
  assert.ok(didSucceed(game.fireWeapon(weapon.id)));
  assert.equal(game.state.resources.missiles, before.ammo - 1);
  resolveShots(game);
  assert.ok(game.state.enemy.hull < before.hull);
  assert.equal(game.state.enemy.shield, 3);
});

test('a missile command with no ammunition cannot launch or spend resources', () => {
  const game = quietCombat();
  const weapon = prepareShot(game, 'missile', 0);
  game.state.resources.missiles = 0;
  assert.equal(didSucceed(game.fireWeapon(weapon.id)), false);
  assert.equal(game.state.resources.missiles, 0);
  assert.equal(game.state.projectiles.length, 0);
});

test('an enemy defeat is resolved only once even if ticks continue', () => {
  const game = quietCombat();
  let resolved = 0;
  game.onCombatEnd = won => { assert.equal(won, true); resolved += 1; };
  game.state.enemy.hull = 0;
  advance(game, 4);
  assert.equal(resolved, 1);
});

test('hull destruction pauses the game, clears pending shots, and ends the run', () => {
  const game = quietCombat();
  game.state.player.hull = 0;
  advance(game, 0.1);
  assert.equal(game.state.mode, 'defeat');
  assert.equal(game.state.paused, true);
  assert.equal(game.state.projectiles.length, 0);
});

test('losing every living crew member ends the simplified no-clone run', () => {
  const game = quietCombat();
  for (const crew of game.state.player.crew) crew.hp = 0;
  advance(game, 0.1);
  assert.equal(game.state.mode, 'defeat');
});

test('restart removes the defeated run and recreates briefing resources', () => {
  const game = quietCombat();
  game.state.player.hull = 0;
  advance(game, 0.1);
  game.newRun(9876);
  assert.equal(game.state.mode, 'briefing');
  assert.equal(game.state.player.hull, 30);
  assert.equal(game.state.enemy, null);
  assert.equal(game.state.bossPhase, 0);
  assert.equal(game.state.stats.kills, 0);
  assert.deepEqual(copy(game.state.resources), { scrap: 60, fuel: 12, missiles: 10, droneParts: 4 });
});

test('save/load preserves live combat, map, resources and pending shots', () => {
  const game = quietCombat(123);
  const weapon = prepareShot(game, 'laser', 1);
  game.fireWeapon(weapon.id);
  game.moveCrew(game.state.player.crew[0].id, 'oxygen');
  game.setPaused(true);
  const serialized = game.serialize();
  assert.doesNotThrow(() => JSON.parse(serialized));
  const restored = fresh(456);
  assert.equal(restored.load(serialized), true);
  assert.deepEqual(gameplaySnapshot(restored), gameplaySnapshot(game));
});

test('malformed or incompatible saves are rejected without changing current state', () => {
  const game = quietCombat();
  const before = game.serialize();
  const incompatible = JSON.parse(before);
  incompatible.version = 999;
  for (const invalid of ['not json', '{}', 'null', JSON.stringify(incompatible)]) {
    assert.equal(game.load(invalid), false);
    assert.equal(game.serialize(), before);
  }
});

test('same seed produces the same deterministic random sequence', () => {
  const a = fresh(2026);
  const b = fresh(2026);
  const c = fresh(2027);
  const draws = game => Array.from({ length: 24 }, () => game.rand());
  const first = draws(a);
  assert.deepEqual(first, draws(b));
  assert.notDeepEqual(first, draws(c));
  assert.ok(first.every(value => value >= 0 && value < 1));
});

test('every map link names a real beacon and the exit is reachable', () => {
  const game = fresh();
  const nodes = game.state.nodes;
  const ids = new Set(nodes.map(node => node.id));
  assert.equal(ids.size, nodes.length);
  for (const node of nodes) for (const id of node.links) assert.ok(ids.has(id), 'valid edge ' + node.id + ' -> ' + id);
  const seen = new Set();
  const queue = [game.state.currentNodeId];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...nodes.find(node => node.id === id).links);
  }
  assert.ok(nodes.some(node => (node.type === 'exit' || node.type === 'boss') && seen.has(node.id)));
});

test('valid jumps spend one fuel exactly once and invalid destinations do not move the ship', () => {
  const game = fresh();
  game.state.mode = 'map';
  const before = navigationSnapshot(game);
  assert.equal(didSucceed(game.jump('missing-beacon')), false);
  assert.deepEqual(navigationSnapshot(game), before);
  const destination = nextNode(game);
  assert.ok(didSucceed(game.jump(destination.id)));
  assert.equal(game.state.resources.fuel, before.resources.fuel - 1);
  assert.equal(game.state.jumpCount, before.jumpCount + 1);
  assert.equal(game.state.currentNodeId, destination.id);
});

test('insufficient scrap cannot partially apply a shop transaction', () => {
  const game = fresh();
  game.state.mode = 'shop';
  game.state.player.hull = 20;
  game.state.resources.scrap = 0;
  const before = copy({ player: game.state.player, resources: game.state.resources });
  assert.equal(didSucceed(game.buy('repair')), false);
  assert.deepEqual(copy({ player: game.state.player, resources: game.state.resources }), before);
});

test('repair purchase spends the offered price and cannot be repeated for free', () => {
  const game = fresh();
  game.state.mode = 'shop';
  game.state.player.hull = 20;
  const offer = game.shopItems().find(item => item.id === 'repair');
  assert.ok(offer && offer.cost > 0);
  game.state.resources.scrap = offer.cost;
  assert.ok(didSucceed(game.buy(offer.id)));
  assert.equal(game.state.player.hull, 25);
  assert.equal(game.state.resources.scrap, 0);
  assert.equal(didSucceed(game.buy(offer.id)), false);
  assert.equal(game.state.player.hull, 25);
  assert.equal(game.state.resources.scrap, 0);
});

test('reactor and shield upgrades increase capacity without violating power limits', () => {
  const game = fresh();
  game.state.mode = 'shop';
  game.state.resources.scrap = 300;
  const reactor = game.state.player.reactor;
  const shields = game.state.player.systems.shields.level;
  assert.ok(didSucceed(game.buy('reactor')));
  assert.equal(game.state.player.reactor, reactor + 1);
  assert.ok(didSucceed(game.buy('shields')));
  assert.equal(game.state.player.systems.shields.level, shields + 2);
  assertPower(game);
});

test('shop purchase API cannot be used during combat', () => {
  const game = quietCombat();
  game.state.resources.scrap = 300;
  const before = copy({ player: game.state.player, resources: game.state.resources });
  assert.equal(didSucceed(game.buy('reactor')), false);
  assert.deepEqual(copy({ player: game.state.player, resources: game.state.resources }), before);
});

test('zero fuel and zero scrap still allow recovery without destroying the last hull point', () => {
  const game = fresh();
  game.state.mode = 'map';
  game.state.resources.fuel = 0;
  game.state.resources.scrap = 0;
  game.state.player.hull = 1;
  const current = game.state.currentNodeId;
  const fleet = game.state.fleet;
  game.jump(nextNode(game).id);
  assert.equal(game.state.mode, 'event');
  assert.equal(game.state.currentNodeId, current);
  assert.equal(didSucceed(game.chooseEvent('distress_trade')), false);
  assert.equal(game.state.resources.scrap, 0);
  assert.equal(game.state.resources.fuel, 0);
  assert.ok(didSucceed(game.chooseEvent('distress_wait')));
  assert.equal(game.state.resources.fuel, 2);
  assert.equal(game.state.player.hull, 1);
  assert.equal(game.state.fleet, fleet + 1.5, 'two waiting turns advance the front by 0.75 each');
});

test('the campaign can progress through all eight sectors and chase all three boss phases', () => {
  const game = fresh(729);
  game.startRun();
  const sectors = new Set([game.state.sector]);
  const bossPhases = [];
  for (let safety = 0; safety < 500; safety += 1) {
    sectors.add(game.state.sector);
    if (game.state.mode === 'victory') break;
    assert.notEqual(game.state.mode, 'defeat');
    if (game.state.mode === 'combat') {
      if (game.state.enemy.bossPhase > 0) bossPhases.push(game.state.enemy.bossPhase);
      finishCombat(game);
    } else resolveNonCombat(game);
    assert.ok(game.state.resources.fuel >= 0);
    assert.ok(game.state.resources.scrap >= 0);
  }
  assert.equal(game.state.mode, 'victory');
  assert.deepEqual([...sectors].sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(bossPhases, [1, 2, 3]);
});

test('repeated reward confirmation cannot skip a boss phase', () => {
  const game = fresh(111);
  reachBoss(game);
  assert.equal(game.state.bossPhase, 1);
  finishCombat(game);
  assert.equal(game.state.mode, 'reward');
  assert.ok(didSucceed(game.continueReward()));
  assert.equal(game.state.mode, 'map', 'v6 requires chasing the flagship between phases');
  assert.equal(game.state.bossPhase, 2);
  const before = game.serialize();
  assert.equal(didSucceed(game.continueReward()), false);
  assert.equal(game.serialize(), before, 'repeated reward confirmation cannot move or advance the flagship');
  for (let guard = 0; guard < 40 && !(game.state.mode === 'combat' && game.state.enemy.bossPhase === 2); guard++) {
    if (game.state.mode === 'combat') finishCombat(game);
    else assert.ok(didSucceed(resolveNonCombat(game)));
  }
  assert.equal(game.state.mode, 'combat');
  assert.equal(game.state.bossPhase, 2);
});

test('retargeting moving crew while paused does not teleport their position', () => {
  const game = quietCombat();
  const crew = game.state.player.crew.find(item => item.species === 'human');
  game.moveCrew(crew.id, 'oxygen');
  advance(game, 0.5);
  game.setPaused(true);
  const before = { x: crew.x, y: crew.y };
  const returnRoom = crew.roomId;
  assert.ok(didSucceed(game.moveCrew(crew.id, returnRoom)));
  assert.deepEqual({ x: crew.x, y: crew.y }, before);
  advance(game, 1);
  assert.deepEqual({ x: crew.x, y: crew.y }, before);
  game.setPaused(false);
  advance(game, 4);
  const room = game.state.player.rooms.find(item => item.id === returnRoom);
  assert.equal(crew.roomId, returnRoom);
  assert.equal(crew.x, crew.tileX + 0.5); assert.equal(crew.y, crew.tileY + 0.5);
  assert.ok(crew.x > room.x && crew.x < room.x + room.w && crew.y > room.y && crew.y < room.y + room.h);
  assert.equal(crew.tileTransit, null); assert.equal(crew.tilePath.length, 0);
});

test('incomplete campaign, modal and enemy-power saves are rejected atomically', () => {
  const game = quietCombat();
  const before = game.serialize();
  const corruptions = [
    state => { delete state.campaign; },
    state => { state.campaign = null; },
    state => { state.enemy.systems.weapons.desiredPower = 'not a number'; },
    state => { state.mode = 'event'; state.event = null; },
    state => { state.mode = 'reward'; state.reward = null; }
  ];
  for (const mutate of corruptions) {
    const candidate = JSON.parse(before);
    mutate(candidate);
    assert.equal(game.load(JSON.stringify(candidate)), false);
    assert.equal(game.serialize(), before);
  }
});

test('a paused manual volley is queued once and spends ammo only on resume', () => {
  const game = quietCombat();
  const weapon = prepareShot(game, 'missile', 0);
  game.setPaused(true);
  const ammo = game.state.resources.missiles;
  assert.ok(didSucceed(game.fireWeapon(weapon.id)));
  game.fireWeapon(weapon.id);
  assert.equal(game.state.resources.missiles, ammo);
  assert.equal(game.state.projectiles.length, 0);
  game.setPaused(false);
  advance(game, 2);
  assert.equal(game.state.resources.missiles, ammo - 1);
});

test('FTL charge requires a living pilot at the bridge as well as engine power', () => {
  const game = quietCombat();
  const pilot = game.state.player.crew.find(item => item.roomId === 'bridge');
  game.moveCrew(pilot.id, 'oxygen');
  advance(game, 8);
  assert.equal(game.state.player.ftl, 0);
  game.moveCrew(pilot.id, 'bridge');
  advance(game, 12);
  assert.ok(game.state.player.ftl > 0);
});

test('escape consumes one fuel, gives no victory reward, and cannot execute twice', () => {
  const game = quietCombat();
  game.state.player.ftl = 100;
  const before = copy({ resources: game.state.resources, kills: game.state.stats.kills, fleet: game.state.fleet });
  const current = game.state.nodes.find(node => node.id === game.state.currentNodeId);
  const destination = game.state.nodes.find(node => current.links.includes(node.id) && node.type === 'event');
  Object.assign(destination, { visited: true, visits: 1, resolved: true, discovered: true });
  assert.ok(didSucceed(game.escapeTo(destination.id)));
  assert.equal(game.state.mode, 'map');
  assert.equal(game.state.currentNodeId, destination.id);
  assert.equal(game.state.resources.fuel, before.resources.fuel - 1);
  assert.equal(game.state.resources.scrap, before.resources.scrap);
  assert.equal(game.state.stats.kills, before.kills);
  assert.equal(game.state.fleet, before.fleet + 0.75);
  assert.equal(didSucceed(game.escapeTo(destination.id)), false);
  assert.equal(game.state.resources.fuel, before.resources.fuel - 1);
});

test('single-room beam targeting still subtracts remaining shield layers from damage', () => {
  const game = quietCombat(88, { shieldLayers: 2, reactor: 12 });
  game.state.player = game.makeShip({ weaponDefs: ['beam'] });
  const weapon = prepareShot(game, 'beam', 2);
  const hull = game.state.enemy.hull;
  assert.ok(didSucceed(game.fireWeapon(weapon.id)));
  resolveShots(game);
  assert.equal(game.state.enemy.hull, hull - 1);
  assert.equal(game.state.enemy.shield, 2);
});

test('rock crew resist fire while an unprotected human takes fire damage', () => {
  const game = quietCombat();
  const rock = game.state.player.crew.find(item => item.species === 'rock');
  const human = game.state.player.crew.find(item => item.species === 'human');
  const rockHp = rock.hp;
  const humanHp = human.hp;
  game.state.player.rooms.find(room => room.id === rock.roomId).fire = 1;
  game.state.player.rooms.find(room => room.id === human.roomId).fire = 1;
  advance(game, 1);
  assert.equal(rock.hp, rockHp);
  assert.ok(human.hp < humanHp);
});

test('crew seal a breach before repairing the room system', () => {
  const game = quietCombat();
  const engineer = game.state.player.crew.find(item => item.species === 'engi');
  const room = game.state.player.rooms.find(item => item.id === 'weapons');
  const system = game.state.player.systems.weapons;
  room.breach = 1;
  system.damage = 1;
  game.moveCrew(engineer.id, room.id);
  advance(game, 1);
  assert.equal(room.breach, 1);
  assert.equal(system.damage, 1);
  advance(game, 6);
  assert.equal(room.breach, 0);
  assert.equal(system.damage, 0);
});
