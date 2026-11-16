'use strict';

// Production-script integration tests for expedition, mastery and temporary
// effects. Fixtures arrange precise boundaries; playthrough.cjs separately
// verifies complete campaigns without editing any gameplay state.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const name of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', name), 'utf8'), context, { filename: name });
}
const SW = context.Starward;
const SKILLS = ['piloting', 'engines', 'weapons', 'shields', 'repair', 'combat'];
const copy = value => JSON.parse(JSON.stringify(value));
const ok = result => result === true || !!(result && result.ok);
const allSystems = ship => [...Object.values(ship.systems), ...Object.values(ship.aux)];

function fresh(loadoutId = 'argo', difficulty = 'standard', seed = 42) {
  const game = new SW.Game(seed);
  game.newRun(seed, { loadoutId, difficulty });
  return game;
}
function advance(game, seconds, step = 1 / 30) {
  for (let i = 0; i < Math.ceil(seconds / step); i += 1) game.tick(step);
}
function quiet(loadoutId = 'argo', enemyOptions = {}, seed = 42) {
  const game = fresh(loadoutId, 'standard', seed);
  game.startCombat({ name: 'v3 규칙 검증 함선', layoutId: 'legacy', hull: 100, reactor: 20, engineLevel: 0,
    shieldLayers: 0, crewCount: 3, weaponDefs: ['burst_laser'], ...enemyOptions });
  for (const weapon of game.state.player.weapons) game.setWeaponAuto(weapon.id, false);
  for (const weapon of game.state.enemy.weapons) {
    weapon.enabled = false; weapon.auto = false; weapon.fireMode = 'manual'; weapon.target = null;
  }
  game.state.enemy.aiTimer = 10000;
  game.setPaused(false);
  return game;
}
function place(crew, ship, id) {
  const room = ship.rooms.find(item => item.id === id);
  Object.assign(crew, { shipId: ship.id, roomId: id, targetRoomId: null, movePath: [],
    x: room.x + room.w / 2, y: room.y + room.h / 2 });
}
function crewAt(game, roomId) { return game.state.player.crew.find(crew => crew.roomId === roomId); }
function prepareIon(game, target) {
  const weapon = game.state.player.weapons.find(item => item.type === 'ion');
  assert.ok(weapon, 'an actual ion weapon is installed');
  game.setWeaponAuto(weapon.id, false);
  game.targetWeapon(weapon.id, target);
  weapon.charge = weapon.cooldown;
  assert.ok(ok(game.fireWeapon(weapon.id)));
  advance(game, 1.2);
  return weapon;
}
function incomingIon(game, roomId, id = 'fixture-ion') {
  game.state.projectiles.push({ id, from: 'enemy', weaponType: 'ion', sourceRoom: 'weapons',
    targetRoom: roomId, targetRooms: [roomId], progress: 0, travel: 0.7, damage: 0,
    ionDamage: 1, ionDuration: 5, miss: false, shieldPierce: false, delay: 0, color: '#bba5ff' });
}
function assertPowerBudget(game) {
  for (const ship of [game.state.player, game.state.enemy].filter(Boolean)) {
    assert.ok(game.getPowerUsed(ship) <= game.getReactorCapacity(ship), ship.id + ' effective reactor budget');
    for (const system of allSystems(ship)) {
      assert.ok(system.power >= 0);
      assert.ok(system.power <= Math.max(0, system.level - system.damage - system.ionStacks), system.id + ' usable capacity');
    }
  }
}
function assertSubset(actual, previous, label = 'state') {
  if (previous === null || typeof previous !== 'object') {
    assert.equal(actual, previous, label);
    return;
  }
  if (Array.isArray(previous)) assert.equal(actual.length, previous.length, label + ' length');
  for (const [key, value] of Object.entries(previous)) assertSubset(actual[key], value, label + '.' + key);
}

test('three real loadouts have distinct ships and retain honest starting resource costs', () => {
  assert.deepEqual(Object.keys(SW.DATA.loadouts).sort(), ['argo', 'atlas', 'wraith']);
  for (const id of ['argo', 'atlas', 'wraith']) {
    const game = fresh(id), definition = SW.DATA.loadouts[id], player = game.state.player;
    assert.equal(game.state.version, 5);
    assert.equal(game.state.loadoutId, id);
    assert.equal(game.state.difficulty, 'standard');
    assert.equal(game.state.mode, 'briefing');
    assert.equal(player.name, definition.spec.name);
    assert.equal(player.hull, definition.spec.hull);
    assert.equal(player.reactor, definition.spec.reactor);
    assert.deepEqual(copy(player.weapons.map(item => item.defId)), copy(definition.spec.weaponDefs));
    assert.deepEqual(copy(player.crew.map(item => item.species)), copy(definition.spec.crewTypes));
    assert.deepEqual(copy(game.state.resources), copy(definition.resources));
    assert.equal(player.rooms.length, 6);
    assert.ok(player.drones.every(item => !item.enabled && !item.deployed), 'installed drones still need paid deployment');
    assertPowerBudget(game);
  }
  assert.ok(fresh('atlas').state.player.weapons.some(item => item.type === 'ion'));
  assert.ok(fresh('atlas').state.player.drones.some(item => item.type === 'combat'));
  assert.equal(fresh('wraith').state.player.aux.cloaking.level, 1);
  assert.equal(fresh('argo').state.player.aux.cloaking.level, 0);
});

test('hangar configuration is briefing-only, seed-preserving and atomic on invalid options', () => {
  const game = fresh('argo', 'standard', 31415);
  assert.ok(ok(game.configureRun('atlas', 'veteran')));
  assert.equal(game.state.seed, 31415);
  assert.equal(game.state.loadoutId, 'atlas');
  assert.equal(game.state.difficulty, 'veteran');
  const before = game.serialize();
  for (const [loadout, difficulty] of [['missing', 'standard'], ['argo', 'missing']]) {
    assert.equal(ok(game.configureRun(loadout, difficulty)), false);
    assert.equal(game.serialize(), before);
  }
  game.startRun();
  const fighting = game.serialize();
  assert.equal(ok(game.configureRun('wraith', 'standard')), false);
  assert.equal(game.serialize(), fighting);
});

test('veteran difficulty strengthens enemies without secretly changing the chosen starting ship', () => {
  const standard = fresh('argo', 'standard', 2026), veteran = fresh('argo', 'veteran', 2026);
  assert.deepEqual(copy(standard.state.player), copy(veteran.state.player));
  assert.deepEqual(copy(standard.state.resources), copy(veteran.state.resources));
  standard.startRun(); veteran.startRun();
  assert.ok(veteran.state.enemy.maxHull > standard.state.enemy.maxHull);
  assert.ok(veteran.state.enemy.weapons.every((weapon, i) => weapon.cooldown < standard.state.enemy.weapons[i].cooldown));
  assert.deepEqual(copy(standard.state.player.weapons), copy(veteran.state.player.weapons));
});

test('mastery grows at powered stations but not while paused, walking, unpowered or off ship', () => {
  const game = quiet();
  const engineer = crewAt(game, 'weapons');
  game.targetWeapon(game.state.player.weapons[0].id, 'weapons');
  advance(game, 2);
  assert.ok(engineer.skills.weapons > 0);
  game.setPaused(true);
  const paused = copy(engineer.skills);
  advance(game, 3);
  assert.deepEqual(copy(engineer.skills), paused);
  game.setPaused(false);
  game.moveCrew(engineer.id, 'oxygen');
  const walking = engineer.skills.weapons;
  advance(game, 0.5);
  assert.equal(engineer.skills.weapons, walking);
  place(engineer, game.state.player, 'weapons');
  game.allocatePower('weapons', -20);
  advance(game, 1);
  assert.equal(engineer.skills.weapons, walking);
  game.allocatePower('teleporter', 1);
  assert.ok(ok(game.teleportCrew([engineer.id], 'weapons')));
  const away = engineer.skills.weapons;
  advance(game, 0.5);
  assert.equal(engineer.skills.weapons, away);
});

test('mastery thresholds cap at 120 and only rank changes generate training logs', () => {
  const game = quiet(), engineer = crewAt(game, 'weapons');
  game.targetWeapon(game.state.player.weapons[0].id, 'weapons');
  for (const [xp, rank] of [[0, 0], [39.99, 0], [40, 1], [119.99, 1], [120, 2]]) {
    engineer.skills.weapons = xp;
    assert.equal(game.getCrewSkillLevel(engineer, 'weapons'), rank);
    assert.equal(game.getCrewSkillLevel(engineer.id, 'weapons'), rank);
  }
  engineer.skills.weapons = 39.9;
  const logs = game.state.log.length;
  advance(game, 3);
  assert.equal(game.getCrewSkillLevel(engineer, 'weapons'), 1);
  assert.equal(game.state.log.length - logs, 1, 'XP ticks do not flood the log');
  engineer.skills.weapons = 119.9;
  advance(game, 2);
  assert.equal(engineer.skills.weapons, 120);
});

test('weapon mastery speeds actual charging and multiple skilled operators do not stack', () => {
  const baseline = quiet(), trained = quiet(), crowded = quiet();
  crewAt(trained, 'weapons').skills.weapons = 120;
  crewAt(crowded, 'weapons').skills.weapons = 120;
  const extra = crewAt(crowded, 'bridge');
  extra.skills.weapons = 120; place(extra, crowded.state.player, 'weapons');
  for (const game of [baseline, trained, crowded]) {
    game.targetWeapon(game.state.player.weapons[0].id, 'weapons');
    advance(game, 3);
  }
  const charge = game => game.state.player.weapons[0].charge;
  assert.ok(charge(trained) > charge(baseline));
  assert.ok(Math.abs(charge(trained) - charge(crowded)) < 1e-8);
});

test('pilot and engine ranks improve evasion while contested bridge operation stops', () => {
  const baseline = quiet(), trained = quiet();
  crewAt(trained, 'bridge').skills.piloting = 120;
  crewAt(trained, 'engines').skills.engines = 120;
  advance(baseline, 0.1); advance(trained, 0.1);
  assert.equal(trained.state.player.evasion - baseline.state.player.evasion, 12);
  const pilot = crewAt(trained, 'bridge');
  const before = pilot.skills.piloting;
  place(trained.state.enemy.crew[0], trained.state.player, 'bridge');
  advance(trained, 1);
  assert.equal(trained.state.player.evasion, 0);
  assert.equal(pilot.skills.piloting, before);
});

test('shield mastery shortens actual recharge time', () => {
  const baseline = quiet(), trained = quiet();
  for (const game of [baseline, trained]) {
    place(game.state.player.crew[2], game.state.player, 'shields');
    game.state.player.shield = 0;
    game.state.player.shieldCharge = 0;
  }
  trained.state.player.crew[2].skills.shields = 120;
  advance(baseline, 2.3); advance(trained, 2.3);
  assert.equal(baseline.state.player.shield, 0);
  assert.equal(trained.state.player.shield, 1);
});

test('repair mastery improves actual repairs and idle crew gain no repair XP', () => {
  const baseline = quiet(), trained = quiet();
  for (const game of [baseline, trained]) {
    place(game.state.player.crew[0], game.state.player, 'oxygen');
    game.state.player.systems.oxygen.damage = 1;
  }
  trained.state.player.crew[0].skills.repair = 120;
  advance(baseline, 2); advance(trained, 2);
  assert.ok(trained.state.player.systems.oxygen.repair > baseline.state.player.systems.oxygen.repair);
  assert.ok(baseline.state.player.crew[0].skills.repair > 0);
  advance(baseline, 8);
  const xp = baseline.state.player.crew[0].skills.repair;
  assert.equal(baseline.state.player.systems.oxygen.damage, 0);
  advance(baseline, 5);
  assert.equal(baseline.state.player.crew[0].skills.repair, xp);
});

test('real boarding combat earns combat mastery and trained fighters deal more damage', () => {
  const baseline = quiet(), trained = quiet();
  for (const game of [baseline, trained]) {
    place(game.state.player.crew[0], game.state.enemy, 'oxygen');
    place(game.state.enemy.crew[0], game.state.enemy, 'oxygen');
  }
  trained.state.player.crew[0].skills.combat = 120;
  advance(baseline, 1); advance(trained, 1);
  assert.ok(baseline.state.player.crew[0].skills.combat > 0, 'actual off-ship combat is eligible');
  assert.ok(trained.state.enemy.crew[0].hp < baseline.state.enemy.crew[0].hp);
  const xp = baseline.state.player.crew[0].skills.combat;
  place(baseline.state.enemy.crew[0], baseline.state.enemy, 'bridge');
  advance(baseline, 1);
  assert.equal(baseline.state.player.crew[0].skills.combat, xp, 'sabotage alone is not melee training');
});

test('cloak activation needs installed power and combat, and pause freezes its duration', () => {
  const absent = quiet('argo');
  assert.equal(ok(absent.activateCloak()), false);
  const briefing = fresh('wraith');
  assert.equal(ok(briefing.activateCloak()), false);
  const game = quiet('wraith');
  game.allocatePower('cloaking', -1);
  assert.equal(ok(game.activateCloak()), false);
  game.allocatePower('cloaking', 1);
  assert.ok(ok(game.activateCloak()));
  assert.equal(game.state.player.cloakRemaining, 6);
  assert.equal(ok(game.activateCloak()), false);
  game.setPaused(true);
  const before = copy({ remaining: game.state.player.cloakRemaining, cooldown: game.state.player.cloakCooldown });
  advance(game, 4);
  assert.deepEqual(copy({ remaining: game.state.player.cloakRemaining, cooldown: game.state.player.cloakCooldown }), before);
});

test('cloaking boosts evasion and holds opposing ordinary weapon charge while time continues', () => {
  const game = quiet('wraith');
  const enemyWeapon = game.state.enemy.weapons[0];
  enemyWeapon.enabled = true;
  const evasion = game.state.player.evasion;
  assert.ok(ok(game.activateCloak()));
  advance(game, 2);
  assert.equal(enemyWeapon.charge, 0);
  assert.ok(game.state.player.weapons[0].charge > 0);
  assert.equal(game.state.player.evasion, Math.min(95, evasion + 60));
  assert.ok(game.state.time > 0);
  assert.ok(game.state.player.cloakRemaining < 6);
});

test('firing or loss of cloak power ends concealment and cannot bypass the powered cooldown', () => {
  for (const cancel of ['fire', 'unpower']) {
    const game = quiet('wraith');
    game.activateCloak();
    if (cancel === 'fire') {
      const weapon = game.state.player.weapons[0];
      game.targetWeapon(weapon.id, 'weapons'); weapon.charge = weapon.cooldown;
      assert.ok(ok(game.fireWeapon(weapon.id)));
    } else game.allocatePower('cloaking', -1);
    advance(game, 0.1);
    assert.equal(game.state.player.cloakRemaining, 0);
    assert.ok(game.state.player.cloakCooldown > 19);
    game.allocatePower('cloaking', -3);
    const cooldown = game.state.player.cloakCooldown;
    advance(game, 3);
    assert.equal(game.state.player.cloakCooldown, cooldown);
    game.allocatePower('cloaking', 1);
    assert.equal(ok(game.activateCloak()), false);
    advance(game, 2);
    assert.ok(game.state.player.cloakCooldown < cooldown);
    game.setPaused(true);
    const paused = game.state.player.cloakCooldown;
    advance(game, 2);
    assert.equal(game.state.player.cloakCooldown, paused);
  }
});

test('ion hits shields before the targeted room and causes no permanent or biological damage', () => {
  const game = quiet('atlas', { shieldLayers: 2 });
  const enemy = game.state.enemy;
  const before = copy({ hull: enemy.hull, crew: enemy.crew.map(item => item.hp),
    damage: Object.values(enemy.systems).map(item => item.damage), fire: enemy.rooms.map(item => item.fire),
    breach: enemy.rooms.map(item => item.breach), ammo: game.state.resources.missiles });
  prepareIon(game, 'weapons');
  assert.equal(enemy.systems.shields.ionStacks, 1);
  assert.equal(enemy.systems.weapons.ionStacks, 0);
  assert.ok(enemy.shield < 2);
  assert.deepEqual(copy({ hull: enemy.hull, crew: enemy.crew.map(item => item.hp),
    damage: Object.values(enemy.systems).map(item => item.damage), fire: enemy.rooms.map(item => item.fire),
    breach: enemy.rooms.map(item => item.breach), ammo: game.state.resources.missiles }), before);
  assertPowerBudget(game);
});

test('unshielded ion stacks temporarily disable a system and restore its intended power after expiry', () => {
  const game = quiet('atlas');
  const system = game.state.enemy.systems.weapons;
  const desired = system.desiredPower;
  for (let shot = 0; shot < 3; shot += 1) prepareIon(game, 'weapons');
  assert.ok(system.ionStacks > 0 && system.ionStacks <= system.level);
  assert.ok(system.ionTimer > 5 && system.ionTimer <= 15);
  assert.equal(system.damage, 0);
  assert.equal(system.desiredPower, desired);
  assert.ok(system.power < desired);
  game.setPaused(true);
  const frozen = copy({ stacks: system.ionStacks, timer: system.ionTimer });
  advance(game, 5);
  assert.deepEqual(copy({ stacks: system.ionStacks, timer: system.ionTimer }), frozen);
  game.setPaused(false); advance(game, 16);
  assert.equal(system.ionStacks, 0); assert.equal(system.ionTimer, 0);
  assert.equal(system.power, desired);
  assertPowerBudget(game);
});

test('ion recovery cannot steal manually reassigned reactor power or overdraw the budget', () => {
  const game = quiet();
  // Remove the pilot during the incoming fixture shot so a legal dodge cannot
  // obscure the power-lock boundary being tested.
  place(game.state.player.crew[0], game.state.player, 'oxygen');
  game.allocatePower('shields', -2);
  game.allocatePower('weapons', 1);
  game.allocatePower('engines', 1);
  game.allocatePower('medbay', 1);
  game.allocatePower('teleporter', 1);
  assert.equal(game.getPowerUsed(), game.state.player.reactor);
  const weapons = game.state.player.systems.weapons;
  incomingIon(game, 'weapons'); advance(game, 1);
  assert.equal(weapons.ionStacks, 1);
  assert.equal(weapons.power, 3);
  assert.equal(weapons.desiredPower, 4);
  assert.ok(ok(game.allocatePower('drones', 1)));
  advance(game, 6);
  assert.equal(weapons.ionStacks, 0);
  assert.equal(weapons.power, 3, 'the player deliberately assigned the released unit elsewhere');
  assert.equal(game.state.player.aux.drones.power, 1);
  assertPowerBudget(game);
  game.allocatePower('drones', -1);
  assert.ok(ok(game.allocatePower('weapons', 1)), 'expired locks no longer limit explicit power allocation');
  advance(game, 0.1);
  assert.equal(weapons.power, 4);
  assertPowerBudget(game);
});

test('bridge ion locks disable piloting and FTL despite the passive bridge using no power', () => {
  const game = quiet();
  const pilot = crewAt(game, 'bridge');
  place(pilot, game.state.player, 'oxygen');
  game.allocatePower('shields', -2);
  incomingIon(game, 'bridge'); advance(game, 1);
  place(pilot, game.state.player, 'bridge');
  assert.equal(game.state.player.systems.bridge.ionStacks, 1);
  assert.equal(game.state.player.systems.bridge.power, 0);
  const ftl = game.state.player.ftl;
  advance(game, 1);
  assert.equal(game.state.player.evasion, 0);
  assert.equal(game.state.player.ftl, ftl);
  advance(game, 5);
  assert.ok(game.state.player.evasion > 0);
  assert.ok(game.state.player.ftl > ftl);
});

test('asteroid warnings lead to a real shield-absorbed strike without ammunition or weapon XP', () => {
  const game = quiet('argo', { shieldLayers: 1 });
  game.allocatePower('engines', -20);
  game.allocatePower('weapons', -20);
  game.setEnvironment('asteroids');
  const environment = game.state.environment;
  const hull = [game.state.player.hull, game.state.enemy.hull];
  const ammo = game.state.resources.missiles;
  const weaponXp = crewAt(game, 'weapons').skills.weapons;
  advance(game, environment.period - environment.warning + 0.1);
  assert.ok(environment.warningActive);
  game.setPaused(true);
  const frozen = copy(environment);
  advance(game, 4);
  assert.deepEqual(copy(game.state.environment), frozen);
  game.setPaused(false); advance(game, environment.timer + 0.1);
  assert.equal(environment.events, 1);
  assert.deepEqual([game.state.player.hull, game.state.enemy.hull], hull);
  assert.equal(game.state.player.shield, 0);
  assert.equal(game.state.enemy.shield, 0);
  assert.equal(game.state.resources.missiles, ammo);
  assert.equal(crewAt(game, 'weapons').skills.weapons, weaponXp);
});

test('unshielded asteroid strikes cause one hull damage to each ship', () => {
  const game = quiet();
  game.allocatePower('shields', -2);
  game.allocatePower('engines', -20);
  game.setEnvironment('asteroids');
  const hull = [game.state.player.hull, game.state.enemy.hull];
  advance(game, game.state.environment.period + 0.1);
  assert.deepEqual([game.state.player.hull, game.state.enemy.hull], hull.map(value => value - 1));
});

test('solar flares warn, ignite both ships, and spare shielded hull from the extra pressure', () => {
  const game = quiet();
  game.setEnvironment('solar');
  const environment = game.state.environment;
  const hull = [game.state.player.hull, game.state.enemy.hull];
  advance(game, environment.period - environment.warning + 0.1);
  assert.ok(environment.warningActive);
  advance(game, environment.timer + 0.1);
  assert.equal(environment.events, 1);
  assert.ok(game.state.player.rooms.some(item => item.fire > 0));
  assert.ok(game.state.enemy.rooms.some(item => item.fire > 0));
  assert.equal(game.state.player.hull, hull[0]);
  assert.equal(game.state.enemy.hull, hull[1] - 1);
});

test('ion storms reduce usable power without destroying the reactor and clear safely at victory', () => {
  const game = quiet();
  const nominal = game.state.player.reactor;
  const initialPowers = allSystems(game.state.player).map(system => system.power);
  game.setEnvironment('ion_storm');
  assert.equal(game.getReactorCapacity(), Math.max(2, Math.floor(nominal * 0.65)));
  assert.equal(game.state.player.reactor, nominal);
  assertPowerBudget(game);
  game.clearEnvironment();
  assert.equal(game.getReactorCapacity(), nominal);
  assert.deepEqual(allSystems(game.state.player).map(system => system.power), initialPowers);
  game.setEnvironment('ion_storm');
  for (const system of allSystems(game.state.player)) { game.allocatePower(system.id, 20); assertPowerBudget(game); }
  game.state.enemy.hull = 0;
  advance(game, 0.1);
  assert.equal(game.state.environment, null);
  assert.equal(game.state.mode, 'reward');
  assert.equal(game.getReactorCapacity(), nominal);
  assert.equal(game.state.player.reactor, nominal);
  assertPowerBudget(game);
});

test('a real v2 tactical save migrates without resetting old boarding, doors, drones or resources', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v2-midboarding.json'), 'utf8'));
  assert.equal(legacy.version, 2);
  assert.ok(legacy.player.crew.some(item => item.shipId === 'enemy'));
  const game = fresh('wraith', 'veteran', 2026);
  assert.equal(game.load(JSON.stringify(legacy)), true);
  assert.equal(game.state.version, 5);
  assert.equal(game.state.loadoutId, 'argo');
  assert.equal(game.state.difficulty, 'standard');
  assert.equal(game.state.environment, null);
  for (const key of ['player', 'enemy', 'resources', 'nodes', 'campaign', 'projectiles', 'stats',
    'sector', 'currentNodeId', 'jumpCount', 'fleet', 'bossPhase', 'time', 'rng', 'nextId']) {
    assertSubset(game.state[key], legacy[key], key);
  }
  for (const ship of [game.state.player, game.state.enemy]) {
    assert.equal(ship.cloakRemaining, 0); assert.equal(ship.cloakCooldown, 0);
    assert.equal(ship.aux.cloaking.level, 0);
    for (const system of allSystems(ship)) { assert.equal(system.ionStacks, 0); assert.equal(system.ionTimer, 0); }
    for (const crew of ship.crew) for (const id of SKILLS) assert.equal(crew.skills[id], 0);
  }
  assert.ok(game.state.nodes.every(node => node.environment === null));
});

test('active cloak, ion locks, environment timers and mastery roundtrip deterministically', () => {
  const game = quiet('wraith');
  game.allocatePower('shields', -2);
  game.allocatePower('engines', -2);
  game.state.player.crew[0].skills.piloting = 43;
  incomingIon(game, 'weapons'); advance(game, 1);
  assert.ok(game.state.player.systems.weapons.ionStacks > 0);
  game.setEnvironment('solar');
  assert.ok(ok(game.activateCloak()));
  advance(game, 0.5); game.setPaused(true);
  const restored = fresh('atlas', 'veteran', 777);
  assert.equal(restored.load(game.serialize()), true);
  assert.deepEqual(copy(restored.state), copy(game.state));
  for (const instance of [game, restored]) { instance.setPaused(false); advance(instance, 4); }
  assert.deepEqual(copy(restored.state), copy(game.state));
});

test('malformed v3 run, mastery, temporary effects and storm overdraw are rejected atomically', () => {
  const game = quiet('wraith');
  game.setPaused(true);
  const before = game.serialize();
  const corruptions = [
    state => { state.loadoutId = 'missing-loadout'; },
    state => { state.difficulty = 'missing-difficulty'; },
    state => { state.player.crew[0].skills.weapons = -1; },
    state => { state.player.crew[0].skills.combat = 121; },
    state => { state.player.crew[0].skills = null; },
    state => { state.player.cloakRemaining = -1; },
    state => { state.player.cloakCooldown = 1000; },
    state => { state.player.systems.weapons.ionStacks = 99; },
    state => { state.player.systems.weapons.ionTimer = -1; },
    state => { state.nodes[0].environment = 'missing-hazard'; },
    state => { state.environment = { kind: 'missing-hazard', timer: 5, period: 8, warning: 2, warningActive: false, events: 0 }; },
    state => { state.environment = { kind: 'ion_storm', timer: 0, period: 0, warning: 0, warningActive: false, events: 0 }; }
  ];
  for (const mutate of corruptions) {
    const candidate = JSON.parse(before); mutate(candidate);
    assert.equal(game.load(JSON.stringify(candidate)), false, mutate.toString());
    assert.equal(game.serialize(), before);
  }
});

test('cloaking and ion shop purchases consume real scrap, respect limits and remain saveable', () => {
  const game = fresh();
  game.state.mode = 'shop'; game.state.resources.scrap = 500;
  const cloakOffer = game.shopItems().find(item => item.id === 'cloaking');
  assert.ok(cloakOffer && !cloakOffer.disabled);
  const before = game.state.resources.scrap;
  assert.ok(ok(game.buy('cloaking')));
  assert.equal(game.state.resources.scrap, before - cloakOffer.cost);
  assert.equal(game.state.player.aux.cloaking.level, 1);
  while (game.state.player.aux.cloaking.level < 3) assert.ok(ok(game.buy('cloaking')));
  const capped = game.state.resources.scrap;
  assert.equal(ok(game.buy('cloaking')), false);
  assert.equal(game.state.resources.scrap, capped);
  assert.ok(ok(game.buy('ion')));
  assert.ok(game.state.player.weapons.some(item => item.type === 'ion'));
  const owned = game.state.resources.scrap;
  assert.ok(ok(game.buy('ion')), 'v4 permits distinct equipment instances of the same definition');
  assert.equal(game.state.resources.scrap, owned - SW.DATA.equipment.weapon.ion.cost);
  const ions = game.state.player.weapons.filter(item => item.defId === 'ion');
  assert.equal(ions.length, 2); assert.notEqual(ions[0].id, ions[1].id);
  assertPowerBudget(game);
  assert.equal(fresh().load(game.serialize()), true);
  const recruit = game.buy('recruit_mantis');
  assert.ok(ok(recruit));
  const hired = game.state.player.crew.at(-1);
  for (const id of SKILLS) assert.equal(hired.skills[id], 0);
});

function arriveAtFirstHazard(seed = 987) {
  const game = fresh('argo', 'standard', seed);
  game.startRun();
  assert.equal(game.state.environment, null, 'opening encounter has no hazard');
  game.state.enemy.hull = 0; game.setPaused(false); advance(game, 0.1);
  if (game.state.reward?.salvage?.status === 'pending') assert.ok(ok(game.resolveSalvage('claim')));
  game.continueReward();
  const current = game.state.nodes.find(node => node.id === game.state.currentNodeId);
  const target = current.links.map(id => game.state.nodes.find(node => node.id === id))
    .find(node => node.environment);
  assert.ok(target);
  assert.ok(current.links.some(id => !game.state.nodes.find(node => node.id === id).environment),
    'the player has a safe alternative at this branch');
  assert.ok(ok(game.jump(target.id)));
  assert.equal(game.state.environment.kind, target.environment);
  return game;
}

test('optional hazard beacons pay their advertised bonus once on victory and none on escape', () => {
  const hazard = arriveAtFirstHazard();
  const control = arriveAtFirstHazard();
  const advertised = hazard.state.nodes.find(node => node.id === hazard.state.currentNodeId).hazardScrap;
  assert.equal(advertised, 8);
  const controlNode = control.state.nodes.find(node => node.id === control.state.currentNodeId);
  controlNode.environment = null; controlNode.hazardScrap = 0; control.clearEnvironment();
  const before = hazard.state.resources.scrap;
  for (const game of [hazard, control]) {
    game.state.enemy.hull = 0; game.setPaused(false); advance(game, 0.1);
  }
  assert.equal(hazard.state.reward.hazardScrap, advertised);
  assert.equal(hazard.state.resources.scrap - control.state.resources.scrap, advertised);
  assert.ok(hazard.state.resources.scrap > before);
  const paid = hazard.state.resources.scrap;
  hazard.onCombatEnd(true);
  if (hazard.state.reward?.salvage?.status === 'pending') assert.ok(ok(hazard.resolveSalvage('claim')));
  hazard.continueReward(); hazard.continueReward();
  assert.equal(hazard.state.resources.scrap, paid);
  assert.equal(hazard.state.environment, null);

  const escape = arriveAtFirstHazard();
  const scrap = escape.state.resources.scrap;
  escape.state.player.ftl = 100;
  assert.ok(ok(escape.escape()));
  assert.equal(escape.state.resources.scrap, scrap);
  assert.equal(escape.state.environment, null);
  assert.equal(escape.state.mode, 'map');
});

function eventWithChoice(choiceId, loadoutId = 'argo') {
  for (let index = 1; index <= 64; index += 1) {
    const game = fresh(loadoutId, 'standard', Math.imul(index, 0x9e3779b1) >>> 0);
    // The fixture starts at the initial map; jump() creates the real campaign
    // event and choices, so tests do not reproduce event implementation data.
    game.state.mode = 'map';
    const destination = game.state.nodes.find(node => node.col === 1 && node.type === 'event');
    assert.ok(ok(game.jump(destination.id)));
    if (game.state.event?.choices.some(choice => choice.id === choiceId)) return game;
  }
  assert.fail('Could not generate real event choice: ' + choiceId);
}

test('new conditional event choices recheck equipment, mastery and costs before awarding resources', () => {
  const cases = [
    { id: 'wreck_cloak', loadout: 'wraith', gains: { scrap: 30, fuel: -1, droneParts: 1 },
      block(game) { game.state.player.aux.cloaking.level = 0; game.state.player.aux.cloaking.power = 0; } },
    { id: 'workshop_ion', loadout: 'atlas', gains: { scrap: 20, droneParts: 2 },
      block(game) { game.state.player.weapons = game.state.player.weapons.filter(weapon => weapon.defId !== 'ion'); } },
    { id: 'refugee_drone', loadout: 'argo', gains: { scrap: 30, fuel: 1, droneParts: -1 },
      block(game) { game.state.resources.droneParts = 0; } },
    { id: 'relay_expert', loadout: 'argo', gains: { scrap: 34, fuel: 2 },
      block(game) { for (const crew of game.state.player.crew) crew.skills.repair = 0; },
      enable(game) { game.state.player.crew[1].skills.repair = 40; } }
  ];
  for (const item of cases) {
    const denied = eventWithChoice(item.id, item.loadout);
    item.block(denied);
    denied.state.event.choices.find(choice => choice.id === item.id).disabled = false;
    const resources = copy(denied.state.resources);
    assert.equal(ok(denied.chooseEvent(item.id)), false, item.id + ': stale UI cannot bypass current conditions');
    assert.deepEqual(copy(denied.state.resources), resources);

    const accepted = eventWithChoice(item.id, item.loadout);
    if (item.enable) item.enable(accepted);
    const initial = copy(accepted.state.resources);
    assert.ok(ok(accepted.chooseEvent(item.id)), item.id);
    for (const [resource, difference] of Object.entries(item.gains)) {
      assert.equal(accepted.state.resources[resource], initial[resource] + difference, item.id + ': ' + resource);
    }
    const paid = copy(accepted.state.resources);
    assert.equal(ok(accepted.chooseEvent(item.id)), false);
    assert.deepEqual(copy(accepted.state.resources), paid);
    assert.equal(fresh().load(accepted.serialize()), true, item.id + ': valid post-event save');
  }
});
