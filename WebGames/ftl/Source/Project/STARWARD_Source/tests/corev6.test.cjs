'use strict';

// v6 command and ability boundaries. These isolated rule fixtures may prepare
// opponents/equipment; tests/playthrough.cjs never assigns gameplay state.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { placeFixture, mountFixture } = require('./fixture-tools.cjs');
const context = vm.createContext({ console });
for (const file of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'), context, { filename: file });
}
const SW = context.Starward;
const copy = value => JSON.parse(JSON.stringify(value));
const ok = value => value === true || value?.ok === true;
const near = (a, b, message = 'numeric value', epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${message}: ${a} vs ${b}`);
const fresh = (loadoutId = 'argo', seed = 42) => new SW.Game(seed, { loadoutId, difficulty: 'standard' });
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 30); i += 1) game.tick(1 / 30); }
function until(game, predicate, seconds = 30) {
  for (let i = 0; !predicate() && i < Math.ceil(seconds * 30); i += 1) game.tick(1 / 30);
  assert.ok(predicate(), 'condition reached within ' + seconds + ' seconds');
}
function quiet(loadoutId = 'argo', extra = {}) {
  const game = fresh(loadoutId);
  game.startRun(); // The v6 campaign supplies encounter ownership before tactical fixture replacement.
  game.startCombat({ name: 'v6 isolated rule opponent', layoutId: 'interceptor', hull: 100,
    reactor: 24, shieldLayers: 0, engineLevel: 0, crewCount: 0, weaponDefs: ['burst_laser'], ...extra });
  for (const w of game.state.player.weapons) game.setWeaponAuto(w.id, false);
  for (const w of game.state.enemy.weapons) { w.enabled = false; w.auto = false; w.fireMode = 'manual'; }
  game.state.enemy.aiTimer = 10000;
  game.setPaused(false);
  return game;
}
function power(game, id, level = 1, amount = level) {
  const ship = game.state.player, system = ship.aux[id] || ship.systems[id];
  ship.reactor = 24;
  mountFixture(game, id);
  system.level = level; system.damage = 0; system.ionStacks = 0; system.ionTimer = 0;
  if (amount !== system.power) assert.ok(ok(game.allocatePower(id, amount - system.power)));
  return system;
}
function place(crew, ship, roomId) { return placeFixture(crew, ship, roomId); }
function stageFixture(game, count = 1) {
  while (game.state.player.crew.length < count) assert.ok(ok(game.addCrew('human', 'Test boarder')));
  const party = game.state.player.crew.slice(0, count);
  for (const crew of party) place(crew, game.state.player, game.state.player.teleportRoomId);
  return party;
}
function rejectedAtomically(game, operation) {
  const before = game.serialize(), result = operation();
  assert.equal(ok(result), false, 'operation is denied');
  assert.equal(game.serialize(), before, 'denial changes neither state, resources, RNG nor IDs');
  return result;
}
function loadRejected(game, change) {
  const before = game.serialize(), candidate = JSON.parse(before);
  change(candidate);
  assert.equal(game.load(JSON.stringify(candidate)), false, change.toString());
  assert.equal(game.serialize(), before, 'invalid save cannot change the live run');
}
function subset(actual, old, key = 'state') {
  if (old === null || typeof old !== 'object') { assert.equal(actual, old, key); return; }
  if (Array.isArray(old)) assert.equal(actual.length, old.length, key + ' length');
  for (const [name, value] of Object.entries(old)) {
    if (key === 'state' && name === 'version') continue;
    subset(actual[name], value, key + '.' + name);
  }
}

test('all three new ships earn their first damaging shot through real public commands and ticks', () => {
  for (const loadout of ['argo', 'atlas', 'wraith']) {
    const game = fresh(loadout);
    assert.ok(ok(game.startRun()));
    assert.equal(game.state.paused, true);
    for (const weapon of game.state.player.weapons) {
      assert.ok(ok(weapon.type === 'beam' ? game.targetBeam(weapon.id, 'engines', 'weapons')
        : game.targetWeapon(weapon.id, weapon.type === 'ion' ? 'shields' : 'weapons')));
    }
    const before = game.serialize();
    advance(game, 20);
    assert.equal(game.serialize(), before, loadout + ': paused aiming cannot advance combat');
    game.setPaused(false);
    until(game, () => game.state.stats.damageDealt > 0, 25);
    assert.ok(game.state.stats.damageDealt > 0, loadout + ': actual outgoing damage');
  }
});

test('weapon status is a pure actionable query and charging is queueable after valid targeting', () => {
  const game = quiet(), weapon = game.state.player.weapons[0];
  let before = game.serialize();
  const invalid = game.getWeaponFireStatus('missing');
  assert.equal(invalid.ok, false); assert.ok(invalid.code && invalid.message);
  const noTarget = game.getWeaponFireStatus(weapon.id);
  assert.equal(noTarget.canQueue, false); assert.ok(noTarget.message);
  assert.equal(game.serialize(), before);
  game.targetWeapon(weapon.id, 'weapons');
  before = game.serialize();
  const status = game.getWeaponFireStatus(weapon.id);
  assert.equal(status.ready, false); assert.equal(status.canQueue, true);
  assert.equal(status.queued, false); assert.ok(status.powered && status.chargeRemaining > 0);
  assert.equal(game.serialize(), before);
});

test('a charging paused missile order launches exactly once after resume without early ammo consumption', () => {
  const game = quiet(), missile = game.state.player.weapons.find(w => w.type === 'missile');
  game.targetWeapon(missile.id, 'oxygen'); game.setPaused(true);
  const ammo = game.state.resources.missiles;
  const result = game.fireWeapon(missile.id);
  assert.equal(result.ok, true); assert.equal(result.queued, true);
  assert.equal(game.getWeaponFireStatus(missile.id).queued, true);
  assert.equal(game.state.resources.missiles, ammo);
  assert.equal(game.state.projectiles.length, 0);
  rejectedAtomically(game, () => game.fireWeapon(missile.id));
  const paused = game.serialize(); advance(game, 30); assert.equal(game.serialize(), paused);
  game.setPaused(false); advance(game, missile.cooldown * 2.3);
  assert.equal(game.state.resources.missiles, ammo - 1);
  assert.equal(missile.manualQueued, false);
  assert.ok(game.state.enemy.hull < game.state.enemy.maxHull);
});

test('cancelling a charging order prevents launch and invalid weapon conditions preserve resources', () => {
  const game = quiet(), missile = game.state.player.weapons.find(w => w.type === 'missile');
  game.targetWeapon(missile.id, 'oxygen');
  assert.ok(ok(game.fireWeapon(missile.id)));
  assert.ok(ok(game.cancelWeaponOrder(missile.id)));
  const ammo = game.state.resources.missiles;
  advance(game, missile.cooldown + 1);
  assert.equal(game.state.resources.missiles, ammo);
  assert.equal(missile.manualQueued, false);
  game.toggleWeapon(missile.id);
  const unpowered = rejectedAtomically(game, () => game.fireWeapon(missile.id));
  assert.ok(unpowered.message);
  game.toggleWeapon(missile.id); game.state.resources.missiles = 0;
  const empty = rejectedAtomically(game, () => game.fireWeapon(missile.id));
  assert.ok(empty.message);
  assert.equal(game.getWeaponFireStatus(missile.id).canQueue, false);
});

test('a volley accepts actual pending orders while automatic fire continues across multiple charge cycles', () => {
  const manual = quiet();
  for (const w of manual.state.player.weapons) manual.targetWeapon(w.id, 'oxygen');
  const result = manual.fireAllReady();
  assert.ok(result.ok); assert.equal(result.count, manual.state.player.weapons.length);
  assert.equal(manual.fireAllReady().count, 0);
  const game = quiet(), missile = game.state.player.weapons.find(w => w.type === 'missile');
  game.targetWeapon(missile.id, 'oxygen'); game.setWeaponAuto(missile.id, true);
  const ammo = game.state.resources.missiles;
  advance(game, missile.cooldown * 2.4);
  assert.ok(game.state.resources.missiles <= ammo - 2);
  assert.equal(missile.target, 'oxygen');
});

test('send requires physical stationary staging, and a paused stage command never teleports a crew member', () => {
  const game = quiet(); power(game, 'teleporter');
  const crew = game.state.player.crew.find(c => c.roomId === 'engines');
  const ids = [crew.id], position = { x: crew.x, y: crew.y };
  assert.equal(game.getTeleportStatus('send', ids, 'oxygen').ok, false);
  rejectedAtomically(game, () => game.teleportCrew(ids, 'oxygen'));
  game.setPaused(true);
  assert.ok(ok(game.stageTeleport(ids)));
  assert.equal(crew.x, position.x); assert.equal(crew.y, position.y);
  assert.ok(crew.movePath.length);
  assert.equal(game.getTeleportStatus('send', ids, 'oxygen').ok, false);
  game.setPaused(false);
  until(game, () => !crew.movePath.length, 10);
  assert.equal(crew.roomId, game.state.player.teleportRoomId);
  assert.ok(game.getTeleportStatus('send', ids, 'oxygen').ok);
  assert.ok(ok(game.teleportCrew(ids, 'oxygen')));
  assert.equal(crew.shipId, 'enemy');
});

test('teleporter powered levels produce 20/15/10 second cooldowns and pause freezes them', () => {
  for (const level of [1, 2, 3]) {
    const game = quiet(); power(game, 'teleporter', 3, level);
    const crew = stageFixture(game)[0];
    assert.ok(ok(game.teleportCrew([crew.id], 'oxygen')));
    near(game.state.player.teleportCooldown, [20, 15, 10][level - 1]);
    game.setPaused(true); const before = game.serialize(); advance(game, 3);
    assert.equal(game.serialize(), before);
    game.setPaused(false); advance(game, 1);
    near(game.state.player.teleportCooldown, [19, 14, 9][level - 1]);
  }
});

test('send capacity rejects an oversized party before moving anyone', () => {
  const game = quiet(); power(game, 'teleporter');
  const party = stageFixture(game, 3);
  assert.equal(game.state.player.teleportCapacity, 2);
  rejectedAtomically(game, () => game.teleportCrew(party.map(c => c.id), 'oxygen'));
  rejectedAtomically(game, () => game.stageTeleport(party.map(c => c.id)));
});

test('a two-person sending pad can recover four survivors from the same enemy room', () => {
  const game = quiet(); power(game, 'teleporter', 3);
  const party = stageFixture(game, 4);
  assert.ok(ok(game.teleportCrew(party.slice(0, 2).map(c => c.id), 'medbay')));
  advance(game, 10.1);
  assert.ok(ok(game.teleportCrew(party.slice(2).map(c => c.id), 'medbay')));
  advance(game, 10.1);
  const ids = party.map(c => c.id);
  assert.ok(game.getTeleportStatus('recall', ids).ok);
  assert.ok(ok(game.recallCrew(ids)));
  assert.ok(party.every(c => c.shipId === 'player' && c.roomId === game.state.player.teleportRoomId));
  assert.equal(new Set(party.map(c => c.id)).size, 4);
});

test('recall cannot combine arbitrary enemy rooms and cloak blocks both teleport directions', () => {
  const game = quiet(); power(game, 'teleporter', 3);
  const party = stageFixture(game, 2), ids = party.map(c => c.id);
  game.state.enemy.cloakRemaining = 3;
  rejectedAtomically(game, () => game.teleportCrew(ids, 'oxygen'));
  game.state.enemy.cloakRemaining = 0;
  game.state.enemy.superShield = 1;
  rejectedAtomically(game, () => game.teleportCrew(ids, 'oxygen'));
  game.state.enemy.superShield = 0;
  assert.ok(ok(game.teleportCrew(ids, 'oxygen'))); advance(game, 10.1);
  place(party[1], game.state.enemy, 'medbay');
  rejectedAtomically(game, () => game.recallCrew(ids));
  place(party[1], game.state.enemy, 'oxygen');
  game.state.enemy.cloakRemaining = 3;
  rejectedAtomically(game, () => game.recallCrew(ids));
  game.state.enemy.cloakRemaining = 0; game.state.enemy.superShield = 1;
  assert.ok(ok(game.recallCrew(ids)), 'a super shield does not trap returning friendly crew');
});

test('cloak duration follows effective power and a normal salvo subtracts 20 percent while beam fire is exempt', () => {
  for (const level of [1, 2, 3]) {
    const game = quiet('wraith'); power(game, 'cloaking', 3, level);
    const laser = game.state.player.weapons.find(w => w.type === 'laser');
    const beam = game.state.player.weapons.find(w => w.type === 'beam');
    game.targetWeapon(laser.id, 'weapons'); game.targetBeam(beam.id, 'engines', 'weapons');
    advance(game, 16);
    assert.ok(ok(game.activateCloak())); near(game.state.player.cloakRemaining, level * 5);
    assert.ok(ok(game.fireWeapon(beam.id))); near(game.state.player.cloakRemaining, level * 5);
    assert.ok(ok(game.fireWeapon(laser.id))); near(game.state.player.cloakRemaining, level * 4);
    advance(game, level * 4 + 1 / 30);
    assert.equal(game.state.player.cloakRemaining, 0);
    assert.ok(game.state.player.cloakCooldown > 19.8 && game.state.player.cloakCooldown <= 20);
  }
});

test('ability status is pure and unavailable or unpowered abilities cannot mutate the run', () => {
  const game = quiet();
  const before = game.serialize();
  for (const id of ['cloaking', 'hacking', 'mind', 'battery']) {
    const status = game.getAbilityStatus(id);
    assert.equal(typeof status.ok, 'boolean'); assert.ok(status.code && status.message);
  }
  assert.equal(game.serialize(), before);
  rejectedAtomically(game, () => game.launchHacking('weapons'));
  rejectedAtomically(game, () => game.activateMindControl('missing'));
  rejectedAtomically(game, () => game.activateCloak());
});

test('hacking separates one paid launch, travel, attachment, activation and post-pulse cooldown', () => {
  const game = quiet('atlas'); power(game, 'hacking', 1);
  const parts = game.state.resources.droneParts;
  assert.ok(ok(game.launchHacking('weapons')));
  assert.equal(game.state.resources.droneParts, parts - 1);
  assert.equal(game.state.player.hacking.phase, 'travel');
  rejectedAtomically(game, () => game.launchHacking('shields'));
  rejectedAtomically(game, () => game.activateHacking());
  advance(game, 1.6);
  assert.equal(game.state.player.hacking.phase, 'attached');
  assert.equal(game.state.player.hacking.targetRoomId, 'weapons');
  const door = game.state.enemy.doors.find(d => d.a === 'weapons' || d.b === 'weapons');
  assert.equal(game.getDoorLockOwner('enemy', door.id), 'player');
  assert.ok(ok(game.activateHacking()));
  assert.equal(game.state.player.hacking.phase, 'active');
  near(game.state.player.hacking.timer, 4);
  advance(game, 4 + 1 / 30);
  assert.equal(game.state.player.hacking.phase, 'cooldown');
  assert.ok(game.state.player.hacking.cooldown > 19.8);
  assert.equal(game.state.resources.droneParts, parts - 1);
  advance(game, 20.1);
  assert.ok(game.getAbilityStatus('hacking').ok);
  assert.ok(ok(game.activateHacking()));
  assert.equal(game.state.resources.droneParts, parts - 1, 'later pulses reuse the attached drone');
});

test('a prepared defense drone intercepts hacking in transit and a retry consumes a fresh part', () => {
  const game = quiet('atlas', { droneDefs: ['defense'] }); power(game, 'hacking');
  const parts = game.state.resources.droneParts;
  assert.ok(ok(game.launchHacking('shields'))); advance(game, 1.6);
  assert.equal(game.state.player.hacking.phase, 'idle');
  assert.equal(game.state.resources.droneParts, parts - 1);
  assert.ok(ok(game.launchHacking('shields')));
  assert.equal(game.state.resources.droneParts, parts - 2);
});

test('active weapon hacking reverses charge and lock ownership disappears while the caster is unpowered', () => {
  const game = quiet('atlas'); power(game, 'hacking');
  const enemy = game.state.enemy, weapon = enemy.weapons[0];
  weapon.enabled = true; weapon.auto = false; weapon.charge = 8;
  assert.ok(ok(game.launchHacking('weapons'))); advance(game, 1.6);
  assert.ok(ok(game.activateHacking()));
  const before = weapon.charge; advance(game, 1);
  assert.ok(weapon.charge < before);
  assert.equal(game.state.projectiles.filter(shot => shot.from === 'enemy').length, 0);
  const door = enemy.doors.find(d => d.a === 'weapons' || d.b === 'weapons');
  assert.equal(game.getDoorLockOwner(enemy, door.id), 'player');
  game.allocatePower('hacking', -1);
  assert.equal(game.getDoorLockOwner(enemy, door.id), null);
});

test('shield and medical hacking change their actual systems instead of adding a cosmetic status', () => {
  const shields = quiet('atlas', { shieldLayers: 2 }); power(shields, 'hacking', 3);
  shields.launchHacking('shields'); advance(shields, 1.6); shields.activateHacking();
  advance(shields, 6);
  assert.equal(shields.state.enemy.shield, 0);
  const medical = quiet('atlas', { crewCount: 1 }); power(medical, 'hacking');
  const patient = medical.state.enemy.crew[0];
  place(patient, medical.state.enemy, 'medbay'); patient.hp = 50;
  medical.state.enemy.systems.medbay.power = 1;
  medical.state.enemy.systems.medbay.desiredPower = 1;
  medical.launchHacking('medbay'); advance(medical, 1.6); medical.activateHacking();
  const hp = patient.hp; advance(medical, 1);
  assert.ok(patient.hp < hp, 'active medical hack damages its owner crew');
});

test('hacking rejects cloaked or super-shielded targets and insufficient drone parts atomically', () => {
  const game = quiet('atlas'); power(game, 'hacking');
  game.state.enemy.superShield = 1;
  rejectedAtomically(game, () => game.launchHacking('weapons'));
  game.state.enemy.superShield = 0; game.state.enemy.cloakRemaining = 2;
  rejectedAtomically(game, () => game.launchHacking('weapons'));
  game.state.enemy.cloakRemaining = 0; game.state.resources.droneParts = 0;
  rejectedAtomically(game, () => game.launchHacking('weapons'));
});

test('mind control changes effective allegiance with autonomous combat while preserving owner arrays', () => {
  const game = quiet('argo', { crewCount: 2, crewTypes: ['human'] }); power(game, 'mind');
  const enemy = game.state.enemy, target = enemy.crew[0], other = enemy.crew[1];
  place(target, enemy, 'weapons'); place(other, enemy, 'weapons');
  const playerIds = game.state.player.crew.map(c => c.id), enemyIds = enemy.crew.map(c => c.id);
  assert.ok(ok(game.activateMindControl(target.id)));
  assert.equal(target.controlledBy, 'player');
  assert.equal(game.getEffectiveFaction(target), 'player');
  assert.deepEqual(copy(game.state.player.crew.map(c => c.id)), copy(playerIds));
  assert.deepEqual(copy(enemy.crew.map(c => c.id)), copy(enemyIds));
  rejectedAtomically(game, () => game.moveCrew(target.id, 'medbay', 'enemy'));
  const hp = other.hp; advance(game, 1);
  assert.ok(other.hp < hp, 'controlled crew actually fights autonomously');
});

test('mind control uses 14/20/28 seconds and expiry restores original allegiance with a cooldown', () => {
  for (const level of [1, 2, 3]) {
    const game = quiet('argo', { crewCount: 1 }); power(game, 'mind', 3, level);
    const target = game.state.enemy.crew[0];
    assert.ok(ok(game.activateMindControl(target.id)));
    near(game.state.player.mindControl.remaining, [14, 20, 28][level - 1]);
    game.setPaused(true); const before = game.serialize(); advance(game, 1); assert.equal(game.serialize(), before);
    game.setPaused(false); advance(game, [14, 20, 28][level - 1] + 1 / 30);
    assert.equal(target.controlledBy, null);
    assert.equal(game.getEffectiveFaction(target), 'enemy');
    assert.ok(game.state.player.mindControl.cooldown > 19.8);
  }
});

test('countering mind control releases owned crew without recruiting or moving them', () => {
  const game = quiet('argo', { crewCount: 1 }); power(game, 'mind');
  const crew = game.state.player.crew[0];
  crew.controlledBy = 'enemy';
  Object.assign(game.state.enemy.mindControl, { targetCrewId: crew.id, remaining: 10, cooldown: 0, level: 1 });
  game.state.enemy.aux.mind.level = 1; game.state.enemy.aux.mind.power = 1;
  const position = { x: crew.x, y: crew.y, roomId: crew.roomId, shipId: crew.shipId };
  assert.ok(ok(game.activateMindControl(crew.id)));
  assert.equal(crew.controlledBy, null);
  assert.deepEqual(copy({ x: crew.x, y: crew.y, roomId: crew.roomId, shipId: crew.shipId }), position);
  assert.equal(game.state.player.crew.filter(c => c.id === crew.id).length, 1);
});

test('mind levels add the documented temporary health and melee multipliers, including saved active boosts', () => {
  const losses = [];
  for (const level of [1, 2, 3]) {
    const game = quiet('argo', { crewCount: 2, crewTypes: ['human'] }); power(game, 'mind', 3, level);
    const target = game.state.enemy.crew[0], other = game.state.enemy.crew[1];
    place(target, game.state.enemy, 'weapons'); place(other, game.state.enemy, 'weapons');
    const baseMax = target.maxHp, originalHp = 50, bonus = [0, 15, 30][level - 1]; target.hp = originalHp;
    assert.ok(ok(game.activateMindControl(target.id)));
    assert.equal(target.mindBonusHp, bonus); assert.equal(target.maxHp, baseMax + bonus);
    assert.equal(target.hp, originalHp + bonus);
    const saved = game.serialize(), restored = fresh(); assert.equal(restored.load(saved), true);
    assert.equal(restored.serialize(), saved, 'active HP bonus has a validated caster reference');
    const health = other.hp; advance(game, 0.5); losses.push(health - other.hp);
    game.allocatePower('mind', -level);
    assert.equal(target.maxHp, baseMax); assert.equal(target.mindBonusHp, 0); assert.equal(target.controlledBy, null);
  }
  near(losses[1] / losses[0], 1.25, 'level 2 real melee multiplier');
  near(losses[2] / losses[0], 2, 'level 3 real melee multiplier');
});

test('temporary mind health cannot resurrect dead crew or kill a survivor when the bonus is removed', () => {
  for (const dead of [false, true]) {
    const game = quiet('argo', { crewCount: 2 }); power(game, 'mind', 3, 3);
    const target = game.state.enemy.crew[0], maxHp = target.maxHp;
    assert.ok(ok(game.activateMindControl(target.id)));
    target.hp = dead ? 0 : 5;
    game.allocatePower('mind', -3); advance(game, 1 / 30);
    assert.equal(target.mindBonusHp, 0); assert.equal(target.maxHp, maxHp);
    assert.equal(target.hp, dead ? 0 : 1);
    assert.equal(target.controlledBy, null);
  }
});

test('powered attached hacking reveals a nebula room and a super shield blocks hostile mind control', () => {
  const game = quiet('argo', { crewCount: 2 }); power(game, 'mind'); power(game, 'hacking');
  const target = game.state.enemy.crew[0]; place(target, game.state.enemy, 'weapons');
  game.state.nodes.find(n => n.id === game.state.currentNodeId).nebula = true;
  rejectedAtomically(game, () => game.activateMindControl(target.id));
  assert.ok(ok(game.launchHacking('weapons'))); advance(game, 1.6);
  assert.equal(game.state.player.hacking.phase, 'attached');
  game.allocatePower('hacking', -1); rejectedAtomically(game, () => game.activateMindControl(target.id));
  game.allocatePower('hacking', 1); game.state.enemy.superShield = 1;
  rejectedAtomically(game, () => game.activateMindControl(target.id));
  game.state.enemy.superShield = 0; assert.ok(ok(game.activateMindControl(target.id)));
});

test('battery supplies temporary power without reactor cost and safely retracts allocated capacity', () => {
  for (const level of [1, 2]) {
    const game = quiet(); power(game, 'battery', level, 0);
    const ship = game.state.player, nominal = ship.reactor, before = game.getReactorCapacity();
    assert.ok(ok(game.activateBattery()));
    near(game.getReactorCapacity(), before + level * 2);
    assert.equal(ship.reactor, nominal); assert.equal(ship.aux.battery.power, 0);
    rejectedAtomically(game, () => game.activateBattery());
    // Allocate the extra power to a real existing system; expiry must trim it.
    ship.systems.engines.level = 8;
    for (const id of ['shields', 'weapons', 'engines', 'oxygen', 'medbay', 'drones', 'teleporter', 'cloaking', 'hacking', 'mind']) {
      const system = ship.systems[id] || ship.aux[id];
      game.allocatePower(id, system.level - system.power);
    }
    assert.ok(game.getPowerUsed() <= game.getReactorCapacity());
    game.setPaused(true); const paused = game.serialize(); advance(game, 2); assert.equal(game.serialize(), paused);
    game.setPaused(false); advance(game, 30 + 1 / 30);
    assert.equal(ship.battery.remaining, 0); assert.ok(ship.battery.cooldown > 19.8);
    assert.equal(ship.reactor, nominal); assert.equal(game.getReactorCapacity(), before);
    assert.ok(game.getPowerUsed() <= before);
  }
});

test('battery adds its full boost during an ion storm and damage cannot leave phantom capacity', () => {
  const game = quiet(); power(game, 'battery', 2, 0);
  game.setEnvironment('ion_storm');
  const capacity = game.getReactorCapacity(), nominal = game.state.player.reactor;
  assert.ok(ok(game.activateBattery()));
  assert.equal(game.getReactorCapacity(), capacity + 4);
  game.state.player.aux.battery.damage = 2;
  advance(game, 1 / 30);
  assert.equal(game.state.player.battery.remaining, 0);
  assert.equal(game.getReactorCapacity(), capacity);
  assert.equal(game.state.player.reactor, nominal);
  assert.ok(game.getPowerUsed() <= capacity);
});

test('three genuine v5 states migrate to the legacy three-sector route without resetting old fields', () => {
  for (const file of ['v5-pending-salvage.json', 'v5-midcombat-boarding.json', 'v5-shop.json']) {
    const original = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8'));
    assert.equal(original.version, 5);
    const game = fresh(); assert.equal(game.load(JSON.stringify(original)), true, file);
    assert.equal(game.state.version, 7);
    assert.equal(game.state.campaign.routeMode, 'legacy');
    assert.equal(game.state.campaign.totalSectors, 3);
    subset(copy(game.state), original);
    const restored = fresh(); assert.equal(restored.load(game.serialize()), true);
    assert.equal(restored.serialize(), game.serialize());
  }
});

test('active new abilities and a charging weapon order roundtrip and continue deterministically', () => {
  const game = quiet('wraith', { crewCount: 2 });
  power(game, 'hacking'); power(game, 'mind'); power(game, 'battery', 2, 0);
  game.launchHacking('shields'); advance(game, 1.6); game.activateHacking();
  game.activateMindControl(game.state.enemy.crew[0].id);
  game.activateBattery(); game.activateCloak();
  const weapon = game.state.player.weapons[0]; game.targetWeapon(weapon.id, 'weapons'); game.fireWeapon(weapon.id);
  game.setPaused(true);
  const saved = game.serialize(), restored = fresh();
  assert.equal(restored.load(saved), true);
  assert.equal(restored.serialize(), saved);
  game.setPaused(false); restored.setPaused(false);
  advance(game, 2); advance(restored, 2);
  assert.equal(restored.serialize(), game.serialize());
});

test('malformed new ability, control and teleport state is rejected without touching the live run', () => {
  const game = quiet('atlas');
  for (const change of [
    state => { state.player.hacking.phase = 'permanent'; },
    state => { state.player.hacking.timer = -1; },
    state => { state.player.hacking.targetRoomId = 'missing'; },
    state => { state.player.mindControl.remaining = -1; },
    state => { state.player.mindControl.targetCrewId = 'missing'; state.player.mindControl.remaining = 3; },
    state => { state.player.battery.remaining = Infinity; },
    state => { state.player.battery.cooldown = -2; },
    state => { state.player.crew[0].controlledBy = 'unknown'; },
    state => { state.player.crew[0].mindBonusHp = 30; state.player.crew[0].maxHp += 30; },
    state => { state.player.teleportRoomId = 'missing'; },
    state => { state.player.teleportCapacity = 99; },
    state => { state.player.superShield = -1; }
  ]) loadRejected(game, change);
});
