'use strict';

// Tactical v2 integration tests execute the production engine and campaign.
// Direct state assignments below only prepare bounded test situations; the
// separate playthrough.cjs never injects state or bypasses combat resolution.
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
const copy = value => JSON.parse(JSON.stringify(value));
const ok = result => result === true || !!(result && result.ok);
const room = (ship, id) => ship.rooms.find(item => item.id === id);
const door = (ship, id) => ship.doors.find(item => item.id === id);

function fresh(seed = 42) { return new SW.Game(seed); }
function advance(game, seconds, step = 1 / 30) {
  for (let i = 0; i < Math.ceil(seconds / step); i += 1) game.tick(step);
}
function quiet(options = {}, seed = 42) {
  const game = fresh(seed);
  game.startCombat({ name: '전술 검증 함선', layoutId: 'legacy', hull: 80, engineLevel: 0, shieldLayers: 0,
    weaponDefs: ['burst_laser'], crewCount: 3, ...options });
  for (const ship of [game.state.player, game.state.enemy]) {
    for (const weapon of ship.weapons) {
      weapon.auto = false;
      weapon.target = null;
      weapon.fireMode = 'manual';
      if (ship.id === 'enemy') weapon.enabled = false;
    }
  }
  game.state.enemy.aiTimer = 10000;
  game.setPaused(false);
  return game;
}
function place(crew, ship, roomId) {
  const target = room(ship, roomId);
  crew.shipId = ship.id;
  crew.roomId = roomId;
  crew.targetRoomId = null;
  crew.movePath = [];
  crew.x = target.x + target.w / 2;
  crew.y = target.y + target.h / 2;
}
function readyTeleporter(game) {
  game.allocatePower('engines', -2);
  assert.ok(ok(game.allocatePower('teleporter', 1)));
}
function launchReady(game, type, target = 'weapons') {
  const weapon = game.state.player.weapons.find(item => item.type === type);
  assert.ok(weapon);
  game.setWeaponAuto(weapon.id, false);
  game.targetWeapon(weapon.id, target);
  weapon.charge = weapon.cooldown;
  assert.ok(ok(game.fireWeapon(weapon.id)));
  return weapon;
}
function finishFixtureBattle(game, cause = 'hull') {
  if (cause === 'hull') game.state.enemy.hull = 0;
  else for (const crew of game.state.enemy.crew) crew.hp = 0;
  game.setPaused(false);
  advance(game, 0.1);
}

test('auxiliary controls share reactor power and cannot create free energy', () => {
  const game = quiet();
  const ship = game.state.player;
  const initial = game.getPowerUsed();
  assert.ok(ok(game.allocatePower('drones', 2)));
  assert.equal(game.getPowerUsed(), initial + 2);
  assert.equal(ok(game.allocatePower('teleporter', 1)), false);
  game.allocatePower('engines', -1);
  assert.ok(ok(game.allocatePower('teleporter', 1)));
  assert.equal(game.getPowerUsed(), ship.reactor);
  ship.aux.drones.damage = ship.aux.drones.level;
  advance(game, 0.1);
  assert.equal(ship.aux.drones.power, 0);
  assert.ok(game.getPowerUsed() <= ship.reactor);
});

test('closed doors isolate oxygen, while one open connection exchanges it', () => {
  const sealed = quiet();
  const connected = quiet();
  for (const game of [sealed, connected]) {
    game.allocatePower('oxygen', -1);
    room(game.state.player, 'oxygen').oxygen = 0;
    game.sealShip();
  }
  assert.ok(ok(connected.toggleDoor('door-engines-oxygen')));
  advance(sealed, 1);
  advance(connected, 1);
  assert.equal(room(sealed.state.player, 'oxygen').oxygen, 0);
  assert.ok(room(connected.state.player, 'oxygen').oxygen > 0);
  assert.ok(room(connected.state.player, 'engines').oxygen < room(sealed.state.player, 'engines').oxygen);
  assert.equal(room(connected.state.player, 'bridge').oxygen, room(sealed.state.player, 'bridge').oxygen);
});

test('an airlock drains its room and connected rooms rather than every sealed room', () => {
  const game = quiet();
  const ship = game.state.player;
  game.sealShip();
  game.toggleDoor('airlock-medbay');
  advance(game, 2);
  assert.ok(room(ship, 'medbay').oxygen < 100);
  assert.equal(room(ship, 'engines').oxygen, 100);
  assert.equal(room(ship, 'oxygen').oxygen, 100);
  game.toggleDoor('door-oxygen-medbay');
  advance(game, 3);
  assert.ok(room(ship, 'oxygen').oxygen < 100);
  assert.equal(room(ship, 'engines').oxygen, 100);
  game.sealShip();
  const oxygen = room(ship, 'medbay').oxygen;
  advance(game, 3);
  assert.ok(room(ship, 'medbay').oxygen > oxygen);
  assert.equal(ship.venting, false);
});

test('friendly transit opens a closed door temporarily and preserves a manually open door', () => {
  const game = quiet();
  const ship = game.state.player;
  const crew = ship.crew.find(item => item.species === 'engi');
  const boundary = door(ship, 'door-shields-weapons');
  assert.equal(boundary.open, false);
  game.moveCrew(crew.id, 'shields');
  let observedOpen = false;
  for (let i = 0; i < 360; i += 1) { game.tick(1 / 30); observedOpen ||= boundary.open; }
  assert.equal(crew.roomId, 'shields');
  assert.ok(observedOpen, 'a friendly crew member must open the door to cross');
  assert.equal(boundary.open, false, 'an automatically opened door closes after transit');
  game.toggleDoor(boundary.id);
  game.moveCrew(crew.id, 'weapons');
  advance(game, 12);
  assert.equal(crew.roomId, 'weapons');
  assert.equal(boundary.open, true, 'manual ventilation is not silently undone');
});

test('boarders spend time breaking hostile doors and pause freezes that work', () => {
  const game = quiet();
  readyTeleporter(game);
  const crew = game.state.player.crew.find(item => item.species === 'rock');
  assert.ok(ok(game.teleportCrew([crew.id], 'oxygen')));
  const boundary = door(game.state.enemy, 'door-oxygen-medbay');
  game.moveCrew(crew.id, 'medbay', 'enemy');
  // v5 first walks to the real doorway; the original break-rate and pause
  // assertions apply after that travel, rather than at a remote room center.
  const approach = Math.hypot(boundary.x - crew.x, boundary.y - crew.y) / SW.DATA.crewTypes[crew.species].moveSpeed;
  advance(game, approach + 0.5);
  assert.equal(crew.roomId, 'oxygen');
  assert.ok(boundary.hp < boundary.maxHp && boundary.hp > 0);
  game.setPaused(true);
  const before = copy({ hp: boundary.hp, crew, cooldown: game.state.player.teleportCooldown });
  advance(game, 5);
  assert.deepEqual(copy({ hp: boundary.hp, crew, cooldown: game.state.player.teleportCooldown }), before);
  game.setPaused(false);
  advance(game, 20);
  assert.equal(boundary.hp, 0);
  assert.equal(boundary.open, true);
  assert.equal(crew.roomId, 'medbay');
});

test('crew ownership persists aboard the enemy and ordinary movement cannot cross vessels', () => {
  const game = quiet();
  readyTeleporter(game);
  const crew = game.state.player.crew[0];
  const count = game.state.player.crew.length;
  assert.ok(ok(game.teleportCrew([crew.id], 'oxygen')));
  assert.equal(game.state.player.crew.length, count);
  assert.equal(crew.shipId, 'enemy');
  assert.ok(game.getCrewOnShip('enemy').some(item => item.id === crew.id));
  assert.ok(!game.getCrewOnShip('player').some(item => item.id === crew.id));
  assert.equal(ok(game.moveCrew(crew.id, 'bridge', 'player')), false);
  assert.equal(crew.shipId, 'enemy');
  advance(game, 2);
  assert.equal(game.state.player.ftl, 0, 'the absent pilot cannot man the home bridge');
});

test('a contested room has reciprocal melee damage and stops friendly repair', () => {
  const game = quiet();
  const player = game.state.player;
  const engineer = player.crew.find(item => item.species === 'engi');
  const intruder = game.state.enemy.crew[0];
  place(intruder, player, 'weapons');
  player.systems.weapons.damage = 1;
  const health = [engineer.hp, intruder.hp];
  advance(game, 1);
  assert.ok(engineer.hp < health[0]);
  assert.ok(intruder.hp < health[1]);
  assert.equal(player.systems.weapons.repair, 0);
  assert.equal(player.systems.weapons.damage, 1);
});

test('hostile visitors sabotage instead of repairing or receiving enemy medbay healing', () => {
  const game = quiet();
  readyTeleporter(game);
  const crew = game.state.player.crew.find(item => item.species === 'engi');
  crew.hp = 50;
  game.state.enemy.systems.medbay.desiredPower = 1;
  game.state.enemy.systems.medbay.power = 1;
  game.state.enemy.systems.medbay.damage = 0;
  assert.ok(ok(game.teleportCrew([crew.id], 'medbay')));
  advance(game, 10);
  assert.ok(crew.hp <= 50, 'hostile medical systems do not heal an attacker');
  assert.ok(game.state.enemy.systems.medbay.damage > 0, 'an unopposed boarder damages the occupied system');
});

test('teleport requires power, limits a party to two, and cooldown advances only while powered', () => {
  const game = quiet();
  const player = game.state.player;
  const party = player.crew.slice(1).map(item => item.id);
  assert.equal(ok(game.teleportCrew(party, 'oxygen')), false);
  readyTeleporter(game);
  assert.equal(ok(game.teleportCrew(player.crew.map(item => item.id), 'oxygen')), false);
  assert.ok(ok(game.teleportCrew(party, 'oxygen')));
  const initial = player.teleportCooldown;
  assert.ok(initial > 0);
  assert.equal(ok(game.recallCrew(party)), false);
  game.allocatePower('teleporter', -1);
  advance(game, 3);
  assert.equal(player.teleportCooldown, initial);
  game.allocatePower('teleporter', 1);
  advance(game, initial + 0.1);
  assert.ok(ok(game.recallCrew(party)));
  for (const id of party) {
    const crew = player.crew.find(item => item.id === id);
    assert.equal(crew.shipId, 'player');
    assert.equal(crew.roomId, 'medbay');
  }
});

test('enemy hull destruction kills stranded friendly boarders before reward cleanup', () => {
  const game = quiet();
  readyTeleporter(game);
  const boarder = game.state.player.crew[2];
  game.teleportCrew([boarder.id], 'oxygen');
  finishFixtureBattle(game, 'hull');
  assert.equal(boarder.hp, 0);
  assert.equal(game.state.lastVictoryCause, 'hull');
  assert.equal(game.state.mode, 'reward');
  const restored = fresh();
  assert.equal(restored.load(game.serialize()), true, 'completed encounter has no invalid foreign references');
});

test('crew-kill victory recovers surviving friendly boarders without reviving dead crew', () => {
  const game = quiet();
  readyTeleporter(game);
  const boarder = game.state.player.crew[2];
  game.state.player.crew[1].hp = 0;
  game.teleportCrew([boarder.id], 'oxygen');
  finishFixtureBattle(game, 'crew');
  assert.equal(game.state.lastVictoryCause, 'crew');
  assert.ok(boarder.hp > 0);
  assert.equal(boarder.shipId, 'player');
  assert.equal(game.state.player.crew[1].hp, 0);
  assert.equal(game.state.mode, 'reward');
});

test('escape loses stranded boarders and clears encounter-only physical references', () => {
  const game = quiet();
  readyTeleporter(game);
  const boarder = game.state.player.crew[2];
  game.teleportCrew([boarder.id], 'oxygen');
  game.allocatePower('engines', 1);
  game.state.player.ftl = 100;
  const fuel = game.state.resources.fuel;
  assert.ok(ok(game.escape()));
  assert.equal(boarder.hp, 0);
  assert.equal(game.state.resources.fuel, fuel - 1);
  assert.equal(game.state.mode, 'map');
  assert.equal(game.state.enemy, null);
  const restored = fresh();
  assert.equal(restored.load(game.serialize()), true);
});

test('drone deployment costs one part per encounter and repeated toggles are free', () => {
  const game = quiet();
  const drone = game.state.player.drones[0];
  const parts = game.state.resources.droneParts;
  assert.equal(ok(game.toggleDrone(drone.id)), false, 'drone needs allocated control power');
  assert.equal(game.state.resources.droneParts, parts);
  game.allocatePower('drones', 2);
  game.setPaused(true);
  assert.ok(ok(game.toggleDrone(drone.id)));
  assert.equal(game.state.resources.droneParts, parts - 1);
  const charge = drone.charge;
  advance(game, 5);
  assert.equal(drone.charge, charge);
  game.toggleDrone(drone.id);
  game.toggleDrone(drone.id);
  assert.equal(game.state.resources.droneParts, parts - 1);
  game.startCombat({ hull: 50 });
  assert.equal(drone.deployed, false);
  assert.equal(drone.enabled, false);
  game.allocatePower('drones', 2);
  assert.ok(ok(game.toggleDrone(drone.id)));
  assert.equal(game.state.resources.droneParts, parts - 2);
});

test('missing drone parts prevents activation atomically and unpowering stops an active drone', () => {
  const game = quiet();
  game.allocatePower('drones', 2);
  const drone = game.state.player.drones[0];
  game.state.resources.droneParts = 0;
  const before = copy(drone);
  assert.equal(ok(game.toggleDrone(drone.id)), false);
  assert.deepEqual(copy(drone), before);
  game.state.resources.droneParts = 1;
  assert.ok(ok(game.toggleDrone(drone.id)));
  game.allocatePower('drones', -2);
  const charge = drone.charge;
  advance(game, 4);
  assert.equal(drone.charge, charge);
  assert.equal(game.state.resources.droneParts, 0);
});

function incoming(game, weaponType, id) {
  game.state.projectiles.push({ id, from: 'enemy', weaponType, sourceRoom: 'weapons',
    targetRoom: 'oxygen', progress: 0, travel: 1, damage: 1, miss: false,
    shieldPierce: weaponType === 'missile', delay: 0, color: '#fff' });
}

test('a defense drone intercepts missiles, respects cooldown, and does not intercept lasers or beams', () => {
  const game = quiet();
  const player = game.state.player;
  game.allocatePower('engines', -2);
  game.allocatePower('shields', -2);
  game.allocatePower('drones', 2);
  const drone = player.drones[0];
  game.toggleDrone(drone.id);
  advance(game, drone.cooldown + 0.1);
  const hull = player.hull;
  incoming(game, 'missile', 'test-missile-1');
  incoming(game, 'missile', 'test-missile-2');
  advance(game, 1.2);
  assert.equal(player.hull, hull - 1, 'one ready defense drone blocks only one simultaneous missile');
  advance(game, drone.cooldown + 0.1);
  const after = player.hull;
  incoming(game, 'laser', 'test-laser');
  incoming(game, 'beam', 'test-beam');
  advance(game, 1.2);
  assert.equal(player.hull, after - 2);
});

test('a combat drone deals ordinary shield-blockable damage and stops when unpowered', () => {
  const game = quiet({ shieldLayers: 1 });
  game.state.player = game.makeShip({ droneDefs: ['combat'], reactor: 12 });
  for (const weapon of game.state.player.weapons) { weapon.target = null; weapon.auto = false; }
  game.allocatePower('drones', 2);
  const drone = game.state.player.drones.find(item => item.type === 'combat');
  assert.ok(drone);
  game.toggleDrone(drone.id);
  const hull = game.state.enemy.hull;
  advance(game, drone.cooldown + 1.5);
  assert.equal(game.state.enemy.hull, hull, 'an isolated drone hit is absorbed by one ordinary shield');
  assert.ok(game.state.effects.some(item => item.type === 'shield') || game.state.enemy.shield < 1);
  game.allocatePower('drones', -2);
  const charge = drone.charge;
  advance(game, drone.cooldown + 2);
  assert.equal(drone.charge, charge);
  assert.equal(game.state.enemy.hull, hull);
});

test('manual targeting holds fully charged weapons and a paused volley spends ammo only once on resume', () => {
  const game = quiet();
  for (const weapon of game.state.player.weapons) {
    game.setWeaponAuto(weapon.id, false);
    game.targetWeapon(weapon.id, 'shields');
    assert.equal(weapon.fireMode, 'manual');
  }
  const ammo = game.state.resources.missiles;
  advance(game, 20);
  assert.equal(game.state.resources.missiles, ammo);
  assert.equal(game.state.projectiles.length, 0);
  assert.ok(game.state.player.weapons.every(item => item.charge >= item.cooldown - 1e-6));
  game.setPaused(true);
  game.fireAllReady();
  game.fireAllReady();
  advance(game, 2);
  assert.equal(game.state.resources.missiles, ammo);
  game.setPaused(false);
  advance(game, 2);
  assert.equal(game.state.resources.missiles, ammo - 1);
});

test('a beam intersects distinct rooms once and subtracts surviving shields per room', () => {
  const game = quiet({ shieldLayers: 2, reactor: 14 });
  game.state.player = game.makeShip({ weaponDefs: ['beam'], reactor: 12 });
  const beam = game.state.player.weapons[0];
  game.setWeaponAuto(beam.id, false);
  assert.ok(ok(game.targetBeam(beam.id, 'engines', 'medbay')));
  assert.deepEqual([...new Set(beam.targetRooms)], [...beam.targetRooms]);
  assert.deepEqual(new Set(beam.targetRooms), new Set(['engines', 'oxygen', 'medbay']));
  const hull = game.state.enemy.hull;
  beam.charge = beam.cooldown;
  game.fireWeapon(beam.id);
  advance(game, 1);
  assert.equal(game.state.enemy.hull, hull - 3, 'three rooms each take 3 - 2 = 1 damage');
  assert.equal(game.state.enemy.shield, 2, 'beams do not consume shield layers');
});

test('beam length is bounded and a single-room fallback replaces the previous line', () => {
  const game = quiet();
  game.state.player = game.makeShip({ weaponDefs: ['beam'] });
  const beam = game.state.player.weapons[0];
  game.targetBeam(beam.id, 'engines', 'bridge');
  assert.ok(!beam.targetRooms.includes('bridge'), 'a four-unit beam cannot reach the far bridge');
  assert.ok(beam.targetRooms.includes('engines'));
  game.targetWeapon(beam.id, 'oxygen');
  assert.deepEqual(copy(beam.targetRooms), ['oxygen']);
});

test('a real v1 save migrates without refilling hull, crew, ammunition or progress', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v1-midcombat.json'), 'utf8'));
  assert.equal(legacy.version, 1);
  assert.ok(legacy.player.hull < legacy.player.maxHull);
  assert.ok(legacy.player.crew.some(item => item.hp < item.maxHp));
  const game = fresh();
  assert.equal(game.load(JSON.stringify(legacy)), true);
  const state = game.state;
  assert.equal(state.version, 5);
  for (const key of ['hull', 'maxHull', 'reactor', 'ftl']) assert.equal(state.player[key], legacy.player[key]);
  for (const key of ['scrap', 'fuel', 'missiles']) assert.equal(state.resources[key], legacy.resources[key]);
  for (const key of ['sector', 'currentNodeId', 'jumpCount', 'fleet', 'bossPhase', 'time', 'rng']) assert.equal(state[key], legacy[key]);
  for (let i = 0; i < legacy.player.crew.length; i += 1) {
    assert.equal(state.player.crew[i].hp, legacy.player.crew[i].hp);
    assert.equal(state.player.crew[i].shipId, 'player');
    assert.deepEqual(copy(state.player.crew[i].movePath), legacy.player.crew[i].movePath);
  }
  assert.deepEqual(copy(state.player.weapons.map(item => item.charge)), legacy.player.weapons.map(item => item.charge));
  assert.equal(state.player.doors.length, SW.DATA.doors.length);
  assert.ok(state.player.aux.teleporter && state.player.aux.drones);
  assert.ok(Number.isFinite(state.resources.droneParts));
  assert.ok(state.player.weapons.every(item => ['auto', 'manual'].includes(item.fireMode)));
  assert.equal(game.state.paused, true);
});

test('malformed v2 tactical fields are rejected atomically', () => {
  const game = quiet();
  game.setPaused(true);
  const before = game.serialize();
  const corruptions = [
    state => { state.player.crew[0].shipId = 'missing-vessel'; },
    state => { state.player.doors[0].a = 'missing-room'; },
    state => { state.player.doors[0].hp = -1; },
    state => { state.player.aux.teleporter.power = 999; },
    state => { state.player.teleportCooldown = -1; },
    state => { state.resources.droneParts = -1; },
    state => { state.player.drones[0].defId = 'missing-drone'; },
    state => { state.player.weapons[0].fireMode = 'unrecognized-mode'; },
    state => { state.player.weapons[0].targetRooms = ['missing-room']; }
  ];
  for (const mutate of corruptions) {
    const candidate = JSON.parse(before);
    mutate(candidate);
    assert.equal(game.load(JSON.stringify(candidate)), false, mutate.toString());
    assert.equal(game.serialize(), before);
  }
  const absent = JSON.parse(before);
  absent.mode = 'map'; absent.enemy = null; absent.projectiles = [];
  absent.player.crew[0].shipId = 'enemy';
  assert.equal(game.load(JSON.stringify(absent)), false, 'living crew cannot refer to a nonexistent encounter');
  assert.equal(game.serialize(), before);
});

test('boarding, deployed drones and a flying beam survive save/load without repeated costs', () => {
  const game = quiet();
  game.state.player = game.makeShip({ weaponDefs: ['beam'], reactor: 14 });
  readyTeleporter(game);
  game.allocatePower('drones', 2);
  const drone = game.state.player.drones[0];
  game.toggleDrone(drone.id);
  const boarder = game.state.player.crew[2];
  game.teleportCrew([boarder.id], 'oxygen');
  const beam = game.state.player.weapons[0];
  game.setWeaponAuto(beam.id, false);
  game.targetBeam(beam.id, 'engines', 'weapons');
  beam.charge = beam.cooldown;
  assert.ok(ok(game.fireWeapon(beam.id)));
  assert.ok(game.state.projectiles.some(item => item.weaponType === 'beam'));
  game.setPaused(true);
  const save = game.serialize();
  const restored = fresh(100);
  assert.equal(restored.load(save), true);
  assert.deepEqual(copy(restored.state.player), copy(game.state.player));
  assert.deepEqual(copy(restored.state.projectiles), copy(game.state.projectiles));
  const parts = game.state.resources.droneParts;
  for (const instance of [game, restored]) { instance.setPaused(false); advance(instance, 1); }
  assert.equal(restored.state.resources.droneParts, parts);
  assert.equal(restored.state.enemy.hull, game.state.enemy.hull);
  assert.deepEqual(copy(restored.state.player.crew), copy(game.state.player.crew));
});

test('boarding warnings precede transport of existing enemy crew, without cloning', () => {
  const game = quiet({ boarding: true, boarderCount: 1, crewCount: 4,
    special: { kind: 'boarding', period: 10, warning: 5 } });
  const ids = game.state.enemy.crew.map(item => item.id);
  advance(game, 5.1);
  assert.ok(game.state.enemy.special.warning >= 5);
  assert.ok(game.state.enemy.special.warningActive);
  assert.equal(game.getCrewOnShip('player').filter(item => ids.includes(item.id)).length, 0);
  advance(game, 5.2);
  assert.equal(game.state.enemy.crew.length, ids.length);
  assert.ok(game.getCrewOnShip('player').some(item => ids.includes(item.id)));
  assert.deepEqual(copy(game.state.enemy.crew.map(item => item.id)), copy(ids));
});

test('recruitment respects the living crew cap and denied purchases spend nothing', () => {
  const game = fresh();
  game.state.mode = 'shop';
  game.state.resources.scrap = 1000;
  while (game.state.player.crew.filter(item => item.hp > 0).length < 8) {
    assert.ok(ok(game.buy('recruit_mantis')));
  }
  const before = copy({ resources: game.state.resources, crew: game.state.player.crew });
  assert.equal(ok(game.buy('recruit_human')), false);
  assert.deepEqual(copy({ resources: game.state.resources, crew: game.state.player.crew }), before);
  game.state.player.crew[0].hp = 0;
  assert.ok(ok(game.buy('recruit_engi')));
  assert.equal(game.state.player.crew.filter(item => item.hp > 0).length, 8);
});

test('drone parts and auxiliary upgrades are real shop transactions', () => {
  const game = fresh();
  game.state.mode = 'shop';
  game.state.resources.scrap = 500;
  const parts = game.state.resources.droneParts;
  const offer = game.shopItems().find(item => item.id === 'drone_parts');
  const scrap = game.state.resources.scrap;
  assert.ok(ok(game.buy('drone_parts')));
  assert.equal(game.state.resources.droneParts, parts + 3);
  assert.equal(game.state.resources.scrap, scrap - offer.cost);
  assert.ok(ok(game.buy('drone_control')));
  assert.equal(game.state.player.aux.drones.level, 4);
  assert.ok(ok(game.buy('teleporter')));
  assert.equal(game.state.player.aux.teleporter.level, 2);
  assert.ok(ok(game.buy('combat_drone')));
  assert.ok(game.state.player.drones.some(item => item.type === 'combat'));
  const before = game.state.resources.scrap;
  assert.ok(ok(game.buy('combat_drone')), 'v4 stores a duplicate drone when both installation slots are occupied');
  assert.equal(game.state.resources.scrap, before - SW.DATA.equipment.drone.combat.cost);
  assert.ok(game.state.cargo.some(item => item.kind === 'drone' && item.defId === 'combat'));
});
