'use strict';

// Inventory and AI contract tests run the production scripts. Precise rule
// fixtures may arrange state; playthrough.cjs separately forbids such writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { placeFixture, mountFixture } = require('./fixture-tools.cjs');
const context = vm.createContext({ console });
for (const name of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', name), 'utf8'), context, { filename: name });
}
const SW = context.Starward;
const copy = value => JSON.parse(JSON.stringify(value));
const ok = value => value === true || !!(value && value.ok);
const systems = ship => [...Object.values(ship.systems), ...Object.values(ship.aux)];
function fresh(loadoutId = 'argo', seed = 42) { return new SW.Game(seed, { loadoutId, difficulty: 'standard' }); }
function shopFixture(game, index = 0) {
  const shop = game.state.nodes.filter(node => node.type === 'shop')[index];
  assert.ok(shop, 'a distinct production store exists');
  Object.assign(shop, { visited: true, visits: 1, discovered: true });
  shop.store ||= { stock: copy(SW.DATA.shopStock) };
  game.state.currentNodeId = shop.id; game.state.mode = 'shop';
}
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 30); i += 1) game.tick(1 / 30); }
function atomicFailure(game, action, label = 'rejected command') {
  const before = game.serialize();
  assert.equal(ok(action()), false, label);
  assert.equal(game.serialize(), before, label + ': all state, RNG, IDs, logs and costs remain unchanged');
}
function add(game, kind, defId, destination = 'cargo') {
  const result = game.receiveEquipment(kind, defId, destination);
  assert.ok(ok(result), result?.message);
  assert.ok(typeof result.itemId === 'string');
  return result.itemId;
}
function uniqueEquipment(game) {
  const s = game.state;
  const ids = [...s.player.weapons, ...s.player.drones, ...s.cargo].map(item => item.id);
  if (s.reward?.salvage?.status === 'pending') ids.push(s.reward.salvage.item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(s.player.weapons.length >= 1 && s.player.weapons.length <= 4);
  assert.ok(s.player.drones.length <= 2 && s.cargo.length <= 6);
}
function assertPower(game) {
  assert.ok(game.getPowerUsed() <= game.getReactorCapacity());
  for (const system of systems(game.state.player)) {
    assert.ok(system.power >= 0 && system.power <= Math.max(0, system.level - system.damage - system.ionStacks));
  }
}
function quiet(profile = 'raider', extra = {}, seed = 42) {
  const game = fresh('argo', seed);
  game.startRun(); // The v6 campaign supplies encounter ownership before tactical fixture replacement.
  game.startCombat({ name: 'v4 전술 검증선', layoutId: 'legacy', hull: 100, reactor: 20, engineLevel: 0,
    shieldLayers: 0, crewCount: 3, weaponDefs: ['burst_laser'], aiProfile: profile, ...extra });
  for (const weapon of game.state.player.weapons) game.setWeaponAuto(weapon.id, false);
  game.state.enemy.aiTimer = 10000;
  game.setPaused(false);
  return game;
}
function place(crew, ship, roomId) { return placeFixture(crew, ship, roomId); }
function winFixture(game, crewKill = false) {
  if (game.state.mode !== 'combat') {
    // Repeated reward-rule fixtures need a new encounter owner, just as a real jump supplies one.
    game.state.campaign.encounter = { kind: 'normal', nodeId: game.state.currentNodeId, questId: null, questAction: null };
    game.startCombat({ name: '회수 규칙 표적', hull: 10, weaponDefs: ['heavy_laser'] });
  }
  if (crewKill) for (const crew of game.state.enemy.crew) crew.hp = 0;
  else game.state.enemy.hull = 0;
  game.setPaused(false); advance(game, 0.1);
  assert.equal(game.state.mode, 'reward');
}
function firstReward(loadout = 'argo', seed = 42) {
  const game = fresh(loadout, seed); game.startRun(); winFixture(game); return game;
}
function resolveAndContinue(game, choice = 'scrap') {
  if (game.state.reward?.salvage?.status === 'pending') assert.ok(ok(game.resolveSalvage(choice)));
  assert.ok(ok(game.continueReward()));
}
function assertSubset(actual, previous, label = 'state') {
  if (previous === null || typeof previous !== 'object') { assert.equal(actual, previous, label); return; }
  if (Array.isArray(previous)) assert.equal(actual.length, previous.length, label + ': array length');
  for (const [key, value] of Object.entries(previous)) {
    if (label === 'state' && key === 'version') continue;
    assertSubset(actual[key], value, label + '.' + key);
  }
}

test('catalogue covers all seven base items and duplicate acquisitions receive independent IDs', () => {
  const game = fresh();
  assert.equal(game.state.version, 7);
  assert.deepEqual(copy(SW.DATA.equipmentLimits), { weapons: 4, drones: 2, cargo: 6 });
  const expected = { weapon: { burst_laser: [60, 30], artemis: [40, 20], heavy_laser: [45, 22], beam: [65, 32], ion: [45, 22] },
    drone: { combat: [42, 21], defense: [40, 20] } };
  for (const [kind, definitions] of Object.entries(expected)) {
    assert.deepEqual(Object.keys(SW.DATA.equipment[kind]).sort(), Object.keys(definitions).sort());
    for (const [id, [cost, sell]] of Object.entries(definitions)) assert.deepEqual(copy(SW.DATA.equipment[kind][id]), { cost, sell });
  }
  const first = add(game, 'weapon', 'ion', 'auto');
  const second = add(game, 'weapon', 'ion', 'auto');
  const third = add(game, 'weapon', 'ion', 'auto');
  assert.notEqual(first, second); assert.notEqual(second, third);
  assert.ok(game.state.player.weapons.some(item => item.id === first));
  assert.ok(game.state.cargo.some(item => item.id === third));
  assert.equal(game.state.player.weapons.length, 4);
  uniqueEquipment(game); assertPower(game);
});

test('refit modes and invalid arguments reject every mutating command atomically', () => {
  const game = fresh();
  const cargoId = add(game, 'weapon', 'ion');
  const installed = game.state.player.weapons[0].id;
  for (const mode of ['briefing', 'map', 'shop', 'reward']) { game.state.mode = mode; assert.equal(game.canManageEquipment(), true); }
  for (const mode of ['combat', 'event', 'victory', 'defeat']) {
    game.state.mode = mode; assert.equal(game.canManageEquipment(), false);
    for (const action of [() => game.receiveEquipment('weapon', 'ion'), () => game.stowEquipment('weapon', installed),
      () => game.installEquipment(cargoId), () => game.discardCargo(cargoId), () => game.moveWeapon(installed, 1)]) atomicFailure(game, action, mode);
  }
  game.state.mode = 'briefing';
  for (const args of [['missing', 'ion'], ['weapon', 'missing'], ['weapon', 'ion', 'missing']]) {
    atomicFailure(game, () => game.receiveEquipment(...args));
  }
  atomicFailure(game, () => game.installEquipment('missing'));
  atomicFailure(game, () => game.moveWeapon(installed, 2));
});

test('stowing and reinstalling preserves item identity but resets charge, targets and queued fire', () => {
  const game = fresh(), ship = game.state.player, item = ship.weapons[0];
  const capacity = systems(ship).map(system => system.level), reactor = ship.reactor;
  Object.assign(item, { charge: 7, target: 'weapons', targetRooms: ['weapons'], manualQueued: true,
    auto: false, fireMode: 'manual', beamFrom: 'engines', beamTo: 'weapons', beamStart: { x: 1, y: 2 }, beamEnd: { x: 5, y: 1 } });
  const id = item.id, resources = copy(game.state.resources);
  assert.ok(ok(game.stowEquipment('weapon', id)));
  assert.deepEqual(copy(game.state.cargo[0]), { id, kind: 'weapon', defId: item.defId });
  assert.ok(ok(game.installEquipment(id)));
  const recreated = ship.weapons.find(weapon => weapon.id === id);
  assert.equal(recreated.charge, 0); assert.equal(recreated.manualQueued, false);
  assert.equal(recreated.target, null); assert.deepEqual(copy(recreated.targetRooms), []);
  for (const key of ['beamFrom', 'beamTo', 'beamStart', 'beamEnd']) assert.equal(recreated[key], null);
  assert.equal(recreated.enabled, true);
  assert.equal(ship.reactor, reactor); assert.deepEqual(systems(ship).map(system => system.level), capacity);
  assert.deepEqual(copy(game.state.resources), resources); uniqueEquipment(game); assertPower(game);
});

test('a full cargo hold permits a same-kind atomic swap, even for the final installed weapon', () => {
  const game = fresh(); game.state.mode = 'shop';
  assert.ok(ok(game.sellEquipment('weapon', game.state.player.weapons[1].id)));
  const original = game.state.player.weapons[0].id;
  const incoming = add(game, 'weapon', 'ion');
  while (game.state.cargo.length < 6) add(game, 'weapon', 'heavy_laser');
  assert.ok(ok(game.installEquipment(incoming, original)));
  assert.equal(game.state.player.weapons.length, 1); assert.equal(game.state.cargo.length, 6);
  assert.equal(game.state.player.weapons[0].id, incoming);
  assert.ok(game.state.cargo.some(item => item.id === original));
  atomicFailure(game, () => game.installEquipment(game.state.cargo[0].id, game.state.player.drones[0].id), 'cross-kind swap');
  uniqueEquipment(game); assertPower(game);
});

test('last-weapon guard protects a slot while full holds reject new cargo without spending IDs', () => {
  const game = fresh();
  const spare = game.state.player.weapons[1].id;
  assert.ok(ok(game.stowEquipment('weapon', spare)));
  const final = game.state.player.weapons[0].id;
  atomicFailure(game, () => game.stowEquipment('weapon', final));
  game.state.mode = 'shop'; atomicFailure(game, () => game.sellEquipment('weapon', final));
  while (game.state.cargo.length < 6) add(game, 'drone', 'combat');
  atomicFailure(game, () => game.receiveEquipment('weapon', 'ion', 'cargo'));
  atomicFailure(game, () => game.stowEquipment('drone', game.state.player.drones[0].id));
});

test('drone refit starts disabled and undeployed without returning a paid deployment part', () => {
  const game = fresh('atlas');
  game.startRun();
  const drone = game.state.player.drones.find(item => item.defId === 'combat');
  assert.ok(ok(game.toggleDrone(drone.id)));
  const paid = game.state.resources.droneParts;
  winFixture(game); assert.equal(game.state.resources.droneParts, paid + 2);
  const resources = copy(game.state.resources);
  assert.ok(ok(game.stowEquipment('drone', drone.id)));
  assert.ok(ok(game.installEquipment(drone.id)));
  const installed = game.state.player.drones.find(item => item.id === drone.id);
  assert.equal(installed.enabled, false); assert.equal(installed.deployed, false);
  assert.equal(installed.charge, 0);
  assert.deepEqual(copy(game.state.resources), resources); assertPower(game);
});

test('weapon order changes actual power priority and boundary moves cannot mutate anything', () => {
  const game = fresh(), ship = game.state.player;
  game.allocatePower('weapons', 2 - ship.systems.weapons.power);
  const [laser, missile] = ship.weapons;
  assert.equal(laser.powered, true); assert.equal(missile.powered, false);
  assert.ok(ok(game.moveWeapon(missile.id, -1)));
  assert.equal(ship.weapons[0].id, missile.id);
  assert.equal(missile.powered, true); assert.equal(laser.powered, false);
  atomicFailure(game, () => game.moveWeapon(missile.id, -1));
  atomicFailure(game, () => game.moveWeapon(laser.id, 1));
  assertPower(game);
});

test('shop sales credit catalogue value once and count sales separately from earned loot', () => {
  const game = fresh(); const id = add(game, 'weapon', 'ion');
  atomicFailure(game, () => game.sellEquipment('cargo', id), 'non-shop sale');
  game.state.mode = 'shop';
  const before = copy(game.state.resources), earned = game.state.stats.scrapEarned;
  assert.ok(ok(game.sellEquipment('cargo', id)));
  assert.equal(game.state.resources.scrap, before.scrap + 22);
  assert.equal(game.state.stats.scrapEarned, earned); assert.equal(game.state.stats.equipmentSold, 1);
  atomicFailure(game, () => game.sellEquipment('cargo', id));
  const drone = game.state.player.drones[0];
  assert.ok(ok(game.sellEquipment('drone', drone.id)));
  assert.equal(game.state.resources.scrap, before.scrap + 42); assert.equal(game.state.stats.equipmentSold, 2);
  assertPower(game);
});

test('discard removes only a cargo instance and pays nothing', () => {
  const game = fresh(); const id = add(game, 'drone', 'combat');
  const resources = copy(game.state.resources), stats = copy(game.state.stats);
  assert.ok(ok(game.discardCargo(id))); assert.equal(game.state.cargo.length, 0);
  assert.deepEqual(copy(game.state.resources), resources); assert.deepEqual(copy(game.state.stats), stats);
  atomicFailure(game, () => game.discardCargo(id));
  atomicFailure(game, () => game.discardCargo(game.state.player.weapons[0].id));
});

test('equipment shops allow duplicates, advertise destination, and recheck cash and full storage', () => {
  const game = fresh(); shopFixture(game); game.state.resources.scrap = 1000;
  const first = game.shopItems().find(item => item.id === 'burst_laser');
  assert.equal(first.equipmentKind, 'weapon'); assert.equal(first.defId, 'burst_laser'); assert.equal(first.destination, 'install');
  assert.ok(ok(game.buy('burst_laser')));
  atomicFailure(game, () => game.buy('burst_laser'), 'finite stock prevents a second purchase at the same store');
  add(game, 'weapon', 'heavy_laser', 'auto'); // Fill the remaining install slot independently of store inventory.
  shopFixture(game, 1);
  const cargoOffer = game.shopItems().find(item => item.id === 'burst_laser');
  assert.equal(cargoOffer.destination, 'cargo'); assert.equal(cargoOffer.disabled, false);
  const before = game.state.resources.scrap;
  assert.ok(ok(game.buy('burst_laser')));
  assert.equal(game.state.resources.scrap, before - 60); assert.equal(game.state.cargo.length, 1);
  const staleOffer = game.shopItems().find(item => item.id === 'ion');
  assert.equal(staleOffer.disabled, false); assert.equal(staleOffer.stock, 1);
  while (game.state.cargo.length < 6) add(game, 'weapon', 'ion');
  atomicFailure(game, () => game.buy(staleOffer.id), 'an in-stock stale offer still fails after the hold fills');
  assert.equal(game.shopItems().find(item => item.id === 'ion').disabled, true);
  assert.equal(game.shopItems().find(item => item.id === 'ion').stock, 1, 'rejected full-hold purchase preserves inventory');
  game.state.resources.scrap = 0;
  assert.ok(ok(game.discardCargo(game.state.cargo[0].id)));
  atomicFailure(game, () => game.buy('ion'), 'insufficient funds');
  uniqueEquipment(game); assertPower(game);
});

test('first salvage is a stable seeded instance and depends on the chosen starting loadout', () => {
  for (const loadout of ['argo', 'atlas', 'wraith']) {
    const game = firstReward(loadout), same = firstReward(loadout);
    assert.equal(game.state.campaign.normalVictories, 1);
    const offer = game.state.reward.salvage;
    assert.equal(offer.status, 'pending'); assert.equal(offer.item.kind, 'weapon');
    assert.equal(offer.item.defId, loadout === 'atlas' ? 'beam' : 'ion');
    assert.equal(offer.scrapValue, SW.DATA.equipment.weapon[offer.item.defId].sell);
    assert.deepEqual(copy(offer), copy(same.state.reward.salvage));
    assert.equal(game.state.rng, same.state.rng); uniqueEquipment(game);
  }
});

test('salvage cadence counts ordinary victories and excludes boss phases', () => {
  const game = firstReward();
  const offered = [true]; resolveAndContinue(game);
  for (let count = 2; count <= 4; count += 1) {
    winFixture(game); offered.push(!!game.state.reward.salvage);
    assert.equal(game.state.campaign.normalVictories, count); resolveAndContinue(game);
  }
  assert.deepEqual(offered, [true, true, false, true]);
  winFixture(game, true); assert.ok(game.state.reward.salvage, 'crew victory may offer outside even cadence');
  resolveAndContinue(game);
  const count = game.state.campaign.normalVictories;
  // Arrange canonical sector exits, then let the production world API create
  // the final-stand map and its real boss encounter context.
  while (game.state.sector < 8) {
    const exit = game.state.nodes.find(node => node.type === 'exit');
    Object.assign(exit, { visited: true, visits: 1, discovered: true });
    game.state.currentNodeId = exit.id; game.state.campaign.pendingSectorChoice = true;
    assert.ok(ok(game.advanceSector(game.getWorldMap().availableIds[0])));
  }
  const bossNode = game.state.nodes.find(node => node.id === game.state.campaign.finalStand.bossNodeId);
  Object.assign(bossNode, { visited: true, visits: 1, discovered: true });
  game.state.currentNodeId = bossNode.id;
  assert.ok(ok(game.engageFlagship()));
  winFixture(game);
  assert.equal(game.state.reward.salvage, null); assert.equal(game.state.campaign.normalVictories, count);
});

test('pending salvage blocks continue and a full hold blocks claim without consuming the offer', () => {
  const game = firstReward(); const offer = copy(game.state.reward.salvage);
  atomicFailure(game, () => game.continueReward());
  while (game.state.cargo.length < 6) add(game, 'weapon', 'heavy_laser');
  atomicFailure(game, () => game.resolveSalvage('claim'));
  assert.deepEqual(copy(game.state.reward.salvage), offer);
  const restored = fresh(); assert.equal(restored.load(game.serialize()), true);
  assert.deepEqual(copy(restored.state), copy(game.state));
  assert.ok(ok(restored.discardCargo(restored.state.cargo[0].id)));
  const scrap = restored.state.resources.scrap;
  assert.ok(ok(restored.resolveSalvage('claim')));
  assert.equal(restored.state.resources.scrap, scrap); assert.equal(restored.state.cargo.length, 6);
  assert.equal(restored.state.reward.salvage.status, 'claimed');
  assert.ok(restored.state.cargo.some(item => item.id === offer.item.id));
  assert.equal(restored.state.stats.salvaged, 1); uniqueEquipment(restored);
  atomicFailure(restored, () => restored.resolveSalvage('claim'));
  assert.ok(ok(restored.continueReward()));
});

test('a claimed salvage receipt remains valid after installing and selling its original instance', () => {
  const game = firstReward(); const id = game.state.reward.salvage.item.id;
  assert.ok(ok(game.resolveSalvage('claim')));
  assert.equal(fresh().load(game.serialize()), true, 'receipt metadata does not duplicate cargo');
  assert.ok(ok(game.installEquipment(id)));
  assert.equal(fresh().load(game.serialize()), true, 'receipt metadata does not duplicate installed item');
  game.state.mode = 'shop';
  assert.ok(ok(game.sellEquipment('weapon', id)));
  assert.equal(fresh().load(game.serialize()), true, 'sold receipt is still a valid historical record');
  atomicFailure(game, () => game.resolveSalvage('scrap'));
});

test('scrapping salvage credits exactly the shown value once including earned-loot statistics', () => {
  const game = firstReward(); const offer = game.state.reward.salvage;
  const scrap = game.state.resources.scrap, earned = game.state.stats.scrapEarned;
  atomicFailure(game, () => game.resolveSalvage('missing'));
  assert.ok(ok(game.resolveSalvage('scrap')));
  assert.equal(game.state.resources.scrap, scrap + offer.scrapValue);
  assert.equal(game.state.stats.scrapEarned, earned + offer.scrapValue);
  assert.equal(game.state.stats.salvaged, 0); assert.equal(game.state.reward.salvage.status, 'scrapped');
  assert.equal(game.state.cargo.length, 0); atomicFailure(game, () => game.resolveSalvage('scrap'));
  assert.equal(fresh().load(game.serialize()), true);
});

test('workshop equipment event defers installation to a payable salvage choice', () => {
  const game = fresh(); game.state.mode = 'map';
  const definition = Object.values(SW.DATA.events).find(event => event.choices.some(choice => choice.id === 'workshop_install'));
  assert.ok(definition);
  const destination = game.state.nodes.find(node => node.col === 1 && node.type === 'event');
  destination.eventId = definition.id;
  assert.ok(ok(game.jump(destination.id)), 'the actual jump creates the production workshop event');
  const resources = copy(game.state.resources), drones = copy(game.state.player.drones);
  assert.ok(ok(game.chooseEvent('workshop_install')));
  assert.equal(game.state.mode, 'reward'); assert.equal(game.state.resources.scrap, resources.scrap - 30);
  assert.equal(game.state.resources.droneParts, resources.droneParts + 1);
  assert.deepEqual(copy(game.state.player.drones), drones);
  assert.equal(game.state.reward.salvage.item.defId, 'combat'); assert.equal(game.state.reward.salvage.scrapValue, 21);
  atomicFailure(game, () => game.continueReward());
  assert.ok(ok(game.resolveSalvage('claim'))); assert.equal(game.state.cargo[0].kind, 'drone');
  assert.equal(fresh().load(game.serialize()), true);
});

test('enemy intent exists before time starts, stays through charge, and shots keep their chosen target', () => {
  const game = quiet('artillery', { weaponDefs: ['artemis', 'heavy_laser'] });
  game.setPaused(true);
  const intent = copy(game.getEnemyIntent()), before = game.serialize();
  assert.equal(intent.profileId, 'artillery'); assert.equal(intent.targets.length, 2);
  for (const target of intent.targets) {
    assert.equal(target.roomId, game.state.enemy.weapons.find(item => item.id === target.weaponId).target);
    assert.ok(game.state.player.rooms.some(room => room.id === target.roomId));
  }
  for (let i = 0; i < 10; i += 1) game.getEnemyIntent();
  assert.equal(game.serialize(), before, 'reading intent must not draw RNG or mutate state');
  game.setPaused(false); const rng = game.state.rng; advance(game, 1);
  assert.deepEqual(copy(game.getEnemyIntent()), intent); assert.equal(game.state.rng, rng, 'ordinary charge does not re-roll a target each frame');
  const weapon = game.state.enemy.weapons[0], originalTarget = weapon.target;
  weapon.charge = weapon.cooldown; advance(game, 1 / 30);
  const shot = game.state.projectiles.find(item => item.from === 'enemy' && item.weaponType === weapon.type);
  assert.ok(shot); assert.equal(shot.targetRoom, originalTarget);
  assert.ok(weapon.charge < weapon.cooldown);
  weapon.target = originalTarget === 'weapons' ? 'engines' : 'weapons';
  advance(game, 0.1); assert.equal(shot.targetRoom, originalTarget, 'an in-flight shot is independent of future intent');
  const restored = fresh(); game.setPaused(true);
  assert.equal(restored.load(game.serialize()), true); assert.deepEqual(copy(restored.state), copy(game.state));
});

test('disruptor ion intent chooses active shields then usable weapons or engines', () => {
  const game = quiet('disruptor', { weaponDefs: ['ion', 'heavy_laser'] });
  const ion = game.state.enemy.weapons.find(item => item.type === 'ion');
  assert.equal(ion.target, 'shields');
  game.allocatePower('shields', -20);
  for (let i = 0; i < 20; i += 1) assert.ok(['weapons', 'engines'].includes(game._enemyTarget(ion)));
  game.state.player.systems.weapons.damage = game.state.player.systems.weapons.level;
  for (let i = 0; i < 10; i += 1) assert.equal(game._enemyTarget(ion), 'engines');
});

test('boarding profile avoids its own boarders while viable alternative rooms exist', () => {
  const game = quiet('boarding'); const enemy = game.state.enemy;
  place(enemy.crew[0], game.state.player, 'oxygen'); place(enemy.crew[1], game.state.player, 'medbay');
  for (let i = 0; i < 60; i += 1) assert.ok(!['oxygen', 'medbay'].includes(game._enemyTarget(enemy.weapons[0])));
});

test('normal target selection skips fully destroyed rooms and all four profiles are real data', () => {
  assert.deepEqual(Object.keys(SW.DATA.enemyProfiles).sort(), ['artillery', 'boarding', 'disruptor', 'raider']);
  const initial = fresh(); assert.equal(initial.getEnemyIntent(), null); initial.startRun();
  assert.equal(initial.state.enemy.aiProfile, 'raider');
  for (const profile of Object.keys(SW.DATA.enemyProfiles)) {
    const game = quiet(profile), ship = game.state.player;
    for (const system of systems(ship)) if (system.id !== 'oxygen') system.damage = system.level;
    for (let i = 0; i < 12; i += 1) assert.equal(game._enemyTarget(game.state.enemy.weapons[0]), 'oxygen');
  }
});

test('profile repair and power priorities change actual decisions under the same shortage', () => {
  const raider = quiet('raider', { crewCount: 2 }), boarding = quiet('boarding', { crewCount: 2 });
  for (const game of [raider, boarding]) {
    const ship = game.state.enemy;
    ship.aiTimer = 0;
    for (const crew of ship.crew) place(crew, ship, 'bridge');
    ship.systems.weapons.damage = 1; ship.systems.oxygen.damage = 1;
    advance(game, 1 / 30);
  }
  assert.equal(raider.state.enemy.crew[0].targetRoomId, 'weapons');
  assert.equal(boarding.state.enemy.crew[0].targetRoomId, 'oxygen');
  for (const game of [raider, boarding]) {
    const ship = game.state.enemy; ship.reactor = 3;
    for (const system of systems(ship)) { system.damage = 0; system.desiredPower = 0; system.power = 0; }
    ship.systems.weapons.desiredPower = 2; ship.systems.shields.level = 2; ship.systems.shields.desiredPower = 2;
    ship.aux.teleporter.level = 2; ship.aux.teleporter.desiredPower = 1;
    advance(game, 1 / 30);
    assert.ok(game.getPowerUsed(ship) <= 3);
  }
  assert.equal(raider.state.enemy.systems.shields.power, 1); assert.equal(raider.state.enemy.aux.teleporter.power, 0);
  assert.equal(boarding.state.enemy.systems.shields.power, 0); assert.equal(boarding.state.enemy.aux.teleporter.power, 1);
});

test('saving stations ignores dead, walking and offship crew without changing movement or location', () => {
  const game = quiet(); game.setPaused(true);
  const ship = game.state.player, [eligible, walking, offship] = ship.crew;
  place(eligible, ship, 'oxygen');
  game.moveCrew(walking.id, 'medbay');
  place(offship, game.state.enemy, 'weapons');
  const ignoredHomes = [walking.homeRoomId, offship.homeRoomId];
  const positions = copy(ship.crew.map(crew => ({ x: crew.x, y: crew.y, roomId: crew.roomId, shipId: crew.shipId, movePath: crew.movePath })));
  assert.ok(ok(game.saveStations())); assert.equal(eligible.homeRoomId, 'oxygen');
  assert.deepEqual([walking.homeRoomId, offship.homeRoomId], ignoredHomes);
  assert.deepEqual(copy(ship.crew.map(crew => ({ x: crew.x, y: crew.y, roomId: crew.roomId, shipId: crew.shipId, movePath: crew.movePath }))), positions);
  eligible.hp = 0;
  atomicFailure(game, () => game.saveStations(), 'no eligible living stationary onboard crew');
});

test('returning stations queues real paused movement and never teleports an offship survivor', () => {
  const game = quiet(); const ship = game.state.player;
  const crew = ship.crew[1], away = ship.crew[2];
  place(crew, ship, 'oxygen'); assert.ok(ok(game.saveStations()));
  place(crew, ship, 'medbay'); place(away, game.state.enemy, 'oxygen');
  const awayState = copy(away); game.setPaused(true);
  const position = { x: crew.x, y: crew.y, roomId: crew.roomId };
  assert.ok(ok(game.returnStations()));
  assert.equal(crew.targetRoomId, 'oxygen'); assert.deepEqual({ x: crew.x, y: crew.y, roomId: crew.roomId }, position);
  assert.deepEqual(copy(away), awayState);
  game.setPaused(false); for (const weapon of game.state.enemy.weapons) weapon.enabled = false;
  advance(game, 6); assert.equal(crew.roomId, 'oxygen'); assert.equal(crew.movePath.length, 0);
  assert.equal(fresh().load(game.serialize()), true);
});

test('genuine v3 cloak and environmental-warning save gains v4 fields without rebuilding any old state', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v3-midcloak.json'), 'utf8'));
  assert.equal(legacy.version, 3); assert.ok(legacy.player.cloakRemaining > 0); assert.ok(legacy.environment.warningActive);
  const game = fresh('atlas', 999); assert.equal(game.load(JSON.stringify(legacy)), true);
  assert.equal(game.state.version, 7); assertSubset(game.state, legacy);
  assert.deepEqual(copy(game.state.cargo), []); assert.equal(game.state.player.aiProfile, 'raider');
  assert.equal(game.state.enemy.aiProfile, 'raider'); assert.equal(game.state.campaign.normalVictories, 0);
  assert.equal(game.state.stats.salvaged, 0); assert.equal(game.state.stats.equipmentSold, 0);
  const roundtrip = fresh(); assert.equal(roundtrip.load(game.serialize()), true);
  assert.deepEqual(copy(roundtrip.state), copy(game.state));
  for (const instance of [game, roundtrip]) { instance.setPaused(false); advance(instance, 0.5); }
  assert.deepEqual(copy(roundtrip.state), copy(game.state));
});

test('genuine v3 reward migrates without inventing an equipment choice or blocking its continuation', () => {
  const legacy = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/v3-reward.json'), 'utf8'));
  assert.equal(legacy.version, 3); assert.equal(legacy.mode, 'reward');
  const game = fresh(); assert.equal(game.load(JSON.stringify(legacy)), true);
  assertSubset(game.state, legacy); assert.equal(game.state.reward.salvage, null);
  const resources = copy(game.state.resources);
  assert.ok(ok(game.continueReward())); assert.equal(game.state.mode, 'map');
  assert.deepEqual(copy(game.state.resources), resources);
});

test('malformed v4 cargo identities, definitions, limits and profile enums reject atomically', () => {
  const game = fresh(); add(game, 'weapon', 'ion');
  const before = game.serialize();
  const mutations = [
    state => { delete state.cargo; }, state => { state.cargo = null; },
    state => { state.cargo[0].kind = 'missing'; }, state => { state.cargo[0].defId = 'missing'; },
    state => { state.cargo[0].id = state.player.weapons[0].id; },
    state => { state.cargo.push(copy(state.cargo[0])); },
    state => { state.cargo = Array.from({ length: 7 }, (_, i) => ({ id: 'bad-' + i, kind: 'weapon', defId: 'ion' })); },
    state => { state.player.weapons[1].id = state.player.weapons[0].id; },
    state => { state.player.drones[0].id = state.player.weapons[0].id; },
    state => { state.player.aiProfile = 'missing'; }, state => { delete state.player.aiProfile; },
    state => { state.campaign.normalVictories = -1; }, state => { state.campaign.normalVictories = 1.5; },
    state => { state.stats.salvaged = -1; }, state => { state.stats.equipmentSold = 1.5; }
  ];
  for (const mutate of mutations) {
    const candidate = JSON.parse(before); mutate(candidate);
    atomicFailure(game, () => game.load(JSON.stringify(candidate)), mutate.toString());
  }
});

test('malformed salvage cannot duplicate installed items, lie about status or bypass pending resolution', () => {
  const game = firstReward(); const before = game.serialize();
  const mutations = [
    state => { delete state.reward.salvage; },
    state => { state.reward.salvage.status = 'missing'; },
    state => { state.reward.salvage.scrapValue = 0; },
    state => { state.reward.salvage.scrapValue = 1e12; },
    state => { state.reward.salvage.item.defId = 'missing'; },
    state => { state.reward.salvage.item.id = state.player.weapons[0].id; },
    state => { state.cargo.push(copy(state.reward.salvage.item)); },
    state => { delete state.stats.salvaged; }, state => { delete state.campaign.normalVictories; }
  ];
  for (const mutate of mutations) {
    const candidate = JSON.parse(before); mutate(candidate);
    atomicFailure(game, () => game.load(JSON.stringify(candidate)), mutate.toString());
  }
});
