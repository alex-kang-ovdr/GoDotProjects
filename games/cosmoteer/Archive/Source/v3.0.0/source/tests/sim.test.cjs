'use strict';

// These tests exercise player-visible outcomes through Game's public API.
// Direct state edits are limited to explicitly documented damage/resource
// fixtures; they do not call private combat, routing, or reward helpers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, PARTS, CELL } = require('../dist/sim.js');
const legacyV1 = require('./fixtures/legacy-v1.cjs');

const DT = 1 / 60;
const EPS = 1e-7;

function ok(result, context) {
  assert.equal(result?.ok, true, context + ': ' + (result?.message || 'no result'));
  assert.equal(typeof result.message, 'string', context + ' provides feedback');
  return result;
}

function rejected(result, context) {
  assert.equal(result?.ok, false, context + ' must be rejected');
  assert.equal(typeof result.message, 'string', context + ' provides feedback');
  assert.ok(result.message.length > 0, context + ' explains the rejection');
}

function advance(game, seconds, check) {
  const steps = Math.ceil(seconds / DT);
  for (let i = 0; i < steps; i++) {
    game.update(DT);
    if (check) check(game);
  }
}

function advanceUntil(game, predicate, seconds = 180, check) {
  for (let i = 0; i < Math.ceil(seconds / DT) && !predicate(game); i++) {
    game.update(DT);
    if (check) check(game);
  }
  assert.ok(predicate(game), 'condition reached within ' + seconds + ' simulated seconds; mode=' + game.mode);
}

function snapshot(game) {
  return structuredClone(game.exportSave());
}

function savedGameplay(game) {
  const data = snapshot(game);
  // Loading appends an informative log entry. It must preserve gameplay data,
  // but a byte-identical log is not the save contract.
  delete data.log;
  return data;
}

function vacantConnectedCell(game) {
  const occupied = new Set(game.player.parts.map(p => p.x + ',' + p.y));
  for (const part of game.player.parts) {
    if (!PARTS[part.type].walkable || part.hp <= 0) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = part.x + dx, y = part.y + dy;
      if (Math.abs(x) <= 10 && Math.abs(y) <= 10 && !occupied.has(x + ',' + y)) return { x, y };
    }
  }
  throw new Error('test fixture requires one vacant cell next to a walkable part');
}

function assertResources(game) {
  assert.ok(Number.isFinite(game.credits) && game.credits >= -EPS, 'credits stay finite and nonnegative');
  for (const ship of game.ships) {
    assert.ok(Number.isFinite(ship.repairStock) && ship.repairStock >= -EPS && ship.repairStock <= 240 + EPS, 'repair material stays within its capacity');
    assert.ok(Number.isFinite(ship.shield) && ship.shield >= -EPS, 'shield stays finite and nonnegative');
    assert.ok(ship.shield <= ship.maxShield + EPS, 'shield respects capacity');
    for (const part of ship.parts) {
      const def = PARTS[part.type];
      for (const field of ['power', 'ammo']) {
        assert.ok(Number.isFinite(part[field]), part.id + ' has finite ' + field);
        assert.ok(part[field] >= -EPS, part.id + ' has nonnegative ' + field);
        assert.ok(part[field] <= (def[field + 'Capacity'] || 0) + EPS, part.id + ' respects ' + field + ' capacity');
      }
      assert.ok(Number.isFinite(part.hp) && part.hp >= -EPS && part.hp <= part.maxHp + EPS, 'part health is bounded');
      assert.ok(Number.isFinite(part.heat) && part.heat >= -EPS, 'part heat is finite and nonnegative');
      assert.ok(Number.isFinite(part.fire) && part.fire >= -EPS && part.fire <= 1 + EPS, 'fire intensity stays within its range');
    }
    for (const crew of ship.crew) {
      assert.ok(Number.isFinite(crew.cargoAmount) && crew.cargoAmount >= -EPS, 'crew cargo is finite and nonnegative');
      assert.ok(crew.cargoAmount <= 8 + EPS, 'crew cargo respects the documented transport capacity');
    }
  }
}

function ammoInShip(ship) {
  return ship.parts.reduce((sum, p) => sum + p.ammo, 0)
    + ship.crew.reduce((sum, c) => sum + (c.cargo === 'ammo' ? c.cargoAmount : 0), 0);
}

function firstVictory() {
  const game = new Game();
  ok(game.launch(), 'launch default starter without extra credits or upgrades');
  advanceUntil(game, g => g.mode !== 'battle', 180);
  assert.equal(game.mode, 'victory', 'the default first sector is winnable');
  return game;
}

function smallTestShip(options = {}) {
  const game = new Game();
  // Sell and rebuild through the same public controls as the player. A small
  // symmetric hull makes propulsion and the muzzle obstruction observable.
  for (const part of [...game.player.parts]) ok(game.erase(part.x, part.y), 'clear propulsion fixture');
  const parts = [
    ['cockpit', 0, 0], ['reactor', 0, 1],
    ['bunk', -1, 0], ['bunk', 1, 0], ['laser', 0, -1]
  ];
  // Paired engines have clear exhaust in both vertical directions. Reversing
  // them changes force direction without introducing a separate obstruction.
  if (options.engine !== false) parts.push(['thruster', -2, 0, options.rotation || 0], ['thruster', 2, 0, options.rotation || 0]);
  if (options.blocked) parts.push(['armor', 0, -2]);
  for (const [type, x, y, rot = 0] of parts) ok(game.place(type, x, y, rot), 'build ' + type);
  advance(game, 10);
  assert.ok(game.player.parts.find(p => p.type === 'laser').power >= PARTS.laser.powerPerShot, 'weapon receives its supply before launch');
  return game;
}

test('the starter is connected, crewed, affordable, and able to launch', () => {
  const game = new Game();
  assert.equal(CELL, 28);
  assert.equal(game.mode, 'dock');
  assert.equal(game.sector, 1);
  assert.equal(game.credits, 850);
  assert.equal(game.getStats().connected, true);
  assert.ok(game.getStats().crewTotal > 0);
  assert.ok(game.player.parts.some(p => p.type === 'cockpit' && p.hp > 0));
  const credits = game.credits;
  ok(game.launch(), 'starter launch');
  assert.equal(game.mode, 'battle');
  assert.ok(game.enemy?.parts.length > 0, 'launch creates an opponent');
  assert.equal(game.credits, credits, 'launch does not unexpectedly charge credits');
});

test('crew deliver power and ammunition through the ship, while a crewless hull cannot', () => {
  const staffed = new Game();
  const empty = new Game();
  for (const bunk of empty.player.parts.filter(p => p.type === 'bunk')) {
    ok(empty.erase(bunk.x, bunk.y), 'remove crew accommodation for control fixture');
  }
  assert.equal(empty.player.crew.length, 0);
  advance(staffed, 15);
  advance(empty, 15);
  assert.ok(staffed.metrics.powerDelivered > 0, 'staffed ship receives battery deliveries');
  assert.ok(staffed.metrics.ammoDelivered > 0, 'staffed cannon receives ammunition');
  assert.equal(empty.metrics.powerDelivered, 0, 'no invisible battery delivery without crew');
  assert.equal(empty.metrics.ammoDelivered, 0, 'no invisible ammo delivery without crew');
  const cell = vacantConnectedCell(staffed);
  const before = staffed.player.crew.length;
  ok(staffed.place('bunk', cell.x, cell.y), 'add connected accommodation');
  assert.equal(staffed.player.crew.length, before + PARTS.bunk.crewCapacity);
  assertResources(staffed);
});

test('rejected building commands preserve credits, the ship, and the saved state', () => {
  const game = new Game();
  const before = snapshot(game);
  rejected(game.place('laser', 10, 10), 'disconnected placement');
  assert.deepEqual(snapshot(game), before);
  const occupied = game.player.parts[0];
  rejected(game.place('corridor', occupied.x, occupied.y), 'occupied cell');
  assert.deepEqual(snapshot(game), before);
  rejected(game.place('unknown-part', 0, 0), 'unknown module');
  assert.deepEqual(snapshot(game), before);
  const cell = vacantConnectedCell(game);
  rejected(game.place('corridor', cell.x, cell.y, 4), 'invalid rotation');
  assert.deepEqual(snapshot(game), before);
});

test('erasing refunds value, removing the cockpit blocks launch, and replacing it repairs that gate', () => {
  const game = new Game();
  const cockpit = game.player.parts.find(p => p.type === 'cockpit');
  const credits = game.credits;
  ok(game.erase(cockpit.x, cockpit.y), 'erase cockpit');
  assert.ok(game.credits > credits, 'a removed usable part refunds credits');
  assert.equal(game.player.parts.some(p => p.type === 'cockpit'), false);
  const afterErase = snapshot(game);
  rejected(game.launch(), 'launch without cockpit');
  assert.equal(game.mode, 'dock');
  assert.equal(game.credits, afterErase.credits);
  assert.equal(game.enemy, null);
  ok(game.place('cockpit', cockpit.x, cockpit.y, cockpit.rot), 'replace cockpit');
  ok(game.launch(), 'launch after restoring cockpit');
});

test('active combat and overclock never create negative or over-capacity resources', () => {
  const game = new Game();
  ok(game.launch(), 'resource stress battle');
  ok(game.toggleOverclock(), 'enable overclock');
  advance(game, 20, assertResources);
  ok(game.toggleOverclock(), 'disable overclock');
  advance(game, 40, assertResources);
  assert.ok(game.metrics.shotsFired > 0, 'weapons actually fired');
  assert.ok(game.metrics.powerDelivered > 0, 'crew actually supplied combat systems');
  assert.ok(game.metrics.ammoDelivered > 0, 'ammunition actually moved');
});

test('a selected enemy module takes actual projectile damage and friendly targets are rejected', () => {
  const game = new Game();
  ok(game.launch(), 'targeting battle');
  const target = game.enemy.parts.find(p => p.type === 'armor' && p.x === -2 && p.y === -4);
  assert.ok(target, 'fixture uses an exposed enemy bow armor module');
  const hp = target.hp;
  ok(game.setTarget(target.id), 'select enemy module');
  assert.equal(game.targetPartId, target.id);
  rejected(game.setTarget(game.player.parts[0].id), 'friendly module target');
  assert.equal(game.targetPartId, target.id, 'failed target selection preserves the valid target');
  advanceUntil(game, g => target.hp < hp || g.mode !== 'battle', 120);
  assert.ok(target.hp < hp, 'targeted armor loses health through real combat');
  assert.ok(game.metrics.damageDealt > 0);
});

test('the unmodified first sector can be won without scripted damage or player intervention', () => {
  const game = firstVictory();
  assert.equal(game.sector, 1);
  assert.equal(game.metrics.battlesWon, 1);
  assert.ok(game.player.parts.some(p => p.type === 'cockpit' && p.hp > 0));
  assertResources(game);
});

test('salvage pays once and remains a manual return step, including after save/load', () => {
  const game = firstVictory();
  const credits = game.credits;
  const earned = game.metrics.salvageEarned;
  const reward = game.getStats().reward;
  ok(game.salvage(), 'claim victory salvage');
  assert.equal(game.credits, credits + reward);
  assert.equal(game.metrics.salvageEarned, earned + reward);
  assert.equal(game.mode, 'victory', 'salvage does not hide the return action');
  const afterClaim = game.credits;
  rejected(game.salvage(), 'duplicate salvage');
  advance(game, 3);
  assert.equal(game.mode, 'victory', 'waiting does not trigger an automatic return');
  assert.equal(game.credits, afterClaim);
  const restored = new Game();
  ok(restored.importSave(JSON.stringify(game.exportSave())), 'load claimed victory');
  rejected(restored.salvage(), 'salvage after load');
  advance(restored, 3);
  assert.equal(restored.mode, 'victory');
  assert.equal(restored.credits, afterClaim, 'loading cannot award the same salvage again');
});

test('returning after a victory restores the design, advances one sector, and permits the next launch', () => {
  const game = firstVictory();
  const design = snapshot(game).blueprint;
  ok(game.salvage(), 'claim salvage before return');
  ok(game.returnToDock(), 'return to dock');
  assert.equal(game.mode, 'dock');
  assert.equal(game.sector, 2);
  assert.equal(game.enemy, null);
  assert.deepEqual(snapshot(game).blueprint, design, 'original blueprint survives battle damage');
  assert.ok(game.player.parts.every(p => p.hp === p.maxHp), 'dock recovery restores structural integrity');
  assert.ok(game.credits >= 0);
  const state = snapshot(game);
  ok(game.returnToDock(), 'idempotent return while already docked');
  assert.deepEqual(snapshot(game), state, 'repeated return does not advance or charge again');
  ok(game.launch(), 'next sector launch');
  assert.equal(game.sector, 2);
});

test('a defeated captain with no credits can recover and relaunch without gaining a sector', () => {
  const game = new Game();
  ok(game.launch(), 'defeat fixture launch');
  // Boundary fixture: an enemy hit has reduced the cockpit to zero HP.
  // Public update must recognize defeat; recovery must not require private calls.
  game.player.parts.find(p => p.type === 'cockpit').hp = 0;
  game.credits = 0;
  advanceUntil(game, g => g.mode === 'defeat', 1);
  const sector = game.sector;
  ok(game.returnToDock(), 'recover with no credits');
  assert.equal(game.mode, 'dock');
  assert.equal(game.sector, sector);
  assert.equal(game.credits, 0, 'recovery does not create debt or an unexplained cash award');
  assert.equal(game.getStats().connected, true);
  assert.ok(game.player.parts.some(p => p.type === 'cockpit' && p.hp > 0));
  ok(game.launch(), 'relaunch after defeat');
});

test('repairing a nearly intact empty ammunition store does not manufacture free ammo', () => {
  const game = new Game();
  // Reachable dock condition: ammunition was spent and the hull has a small hit.
  for (const p of game.player.parts) p.ammo = 0;
  game.player.parts.find(p => p.type === 'cockpit').hp -= 1;
  const beforeAmmo = ammoInShip(game.player);
  const credits = game.credits;
  ok(game.repairAll(), 'repair small hull damage');
  assert.equal(ammoInShip(game.player), beforeAmmo, 'repair preserves existing ammo instead of resetting to starting stock');
  assert.ok(game.credits < credits, 'repair pays its displayed cost');
  const beforeRestock = game.credits;
  ok(game.restock(), 'purchase ammo explicitly');
  assert.ok(ammoInShip(game.player) > beforeAmmo);
  assert.ok(game.credits < beforeRestock, 'restocking requires a separate payment');
  assertResources(game);
});

test('repair and emergency return preserve ammunition already being carried by crew', () => {
  for (const action of ['repair', 'retreat']) {
    const game = new Game();
    advanceUntil(game, g => g.player.crew.some(c => c.cargo === 'ammo' && c.cargoAmount > 0), 20);
    const ammunition = ammoInShip(game.player);
    assert.ok(game.player.crew.some(c => c.cargo === 'ammo' && c.cargoAmount > 0), 'fixture includes ammunition outside stores');
    if (action === 'repair') {
      // A small, repairable hit should not erase an unrelated delivery.
      game.player.parts.find(p => p.type === 'cockpit').hp -= 1;
      ok(game.repairAll(), 'repair during a delivery');
    } else {
      ok(game.launch(), 'launch with ammunition in transit');
      // Retreat before advancing combat, so there is no shot or damage loss.
      ok(game.retreat(), 'return with ammunition in transit');
    }
    assert.equal(ammoInShip(game.player), ammunition, action + ' preserves all surviving ammunition, including crew cargo');
    assertResources(game);
  }
});

test('unreachable exterior consumers do not starve reachable weapons of power', () => {
  const game = new Game();
  // The released hull has continuous exterior armor. The v2 starter opens
  // side access for engines, so using it would make these consumers reachable.
  ok(game.importSave(structuredClone(legacyV1.dock)), 'load the original armor-wall layout');
  // Budget fixture isolates the routing failure, not campaign affordability.
  game.credits = 10000;
  for (const x of [-4, 4]) {
    for (const y of [-3, -2, -1, 0]) ok(game.place('shield', x, y), 'attach shield beyond the armor wall');
  }
  const lasers = game.player.parts.filter(p => p.type === 'laser');
  assert.ok(lasers.length > 0);
  for (const laser of lasers) laser.power = 0;
  advance(game, 20);
  assert.ok(game.metrics.powerDelivered > 0, 'reachable deliveries continue despite high-priority unreachable demand');
  assert.ok(lasers.every(p => p.power > 0), 'both accessible weapons receive power');
  assertResources(game);
});

for (const [label, fixture] of Object.entries(legacyV1)) {
  test('released v1 ' + label + ' save remains usable after migration', () => {
    const game = new Game();
    ok(game.importSave(structuredClone(fixture)), 'load frozen released save');
    assert.equal(game.mode, fixture.mode);
    assert.equal(game.sector, fixture.sector);
    assert.equal(game.credits, fixture.credits, 'migration does not reset or grant funds');
    assert.equal(game.player.parts.length, fixture.player.parts.length);
    assert.equal(ammoInShip(game.player), ammoInShip(fixture.player), 'migration preserves stored and carried ammunition');
    assert.deepEqual(
      game.player.parts.map(p => [p.type, p.x, p.y, p.hp, p.ammo]),
      fixture.player.parts.map(p => [p.type, p.x, p.y, p.hp, p.ammo]),
      'old hull, damage and physical inventory survive'
    );
    if (label === 'claimedVictory') {
      rejected(game.salvage(), 'a migrated claimed victory cannot pay again');
      assert.equal(game.credits, fixture.credits);
      ok(game.returnToDock(), 'continue the migrated campaign');
      assert.equal(game.sector, fixture.sector + 1);
      assert.equal(game.mode, 'dock');
    } else {
      if (label === 'dock') ok(game.launch(), 'launch migrated starter');
      advance(game, 2, assertResources);
      assert.ok(game.time > fixture.time, 'migrated game continues simulating');
    }
    assertResources(game);
  });
}

test('dock save roundtrip preserves the edited design, resources, crew jobs, and settings', () => {
  const game = new Game();
  const cell = vacantConnectedCell(game);
  ok(game.place('cannon', cell.x, cell.y, 1), 'add rotated module');
  ok(game.setCrewPolicy('ammo'), 'choose ammo priority');
  ok(game.toggleOverclock(), 'save overclock choice');
  advance(game, 3);
  game.speed = 2;
  game.paused = true;
  const data = game.exportSave();
  const before = savedGameplay(game);
  const restored = new Game();
  ok(restored.importSave(JSON.stringify(data)), 'load edited dock save');
  assert.deepEqual(savedGameplay(restored), before);
  assertResources(restored);
  ok(restored.inspect(restored.player.parts.find(p => p.x === cell.x && p.y === cell.y).id), 'inspect restored module');
});

test('current battle saves preserve damage, transport and projectiles already in flight', () => {
  const game = new Game();
  ok(game.launch(), 'save fixture battle');
  ok(game.setTarget(game.enemy.parts.find(p => p.type === 'cannon').id), 'set saved target');
  advance(game, 12);
  advanceUntil(game, g => g.projectiles.length > 0, 8);
  assert.equal(game.mode, 'battle');
  const before = savedGameplay(game);
  const restored = new Game();
  ok(restored.importSave(game.exportSave()), 'load battle save object');
  assert.deepEqual(savedGameplay(restored), before);
  assert.equal(restored.mode, 'battle');
  assert.ok(restored.projectiles.length > 0, 'loading cannot erase a volley already in flight');
  assert.deepEqual(restored.projectiles, game.projectiles);
  advance(restored, 2, assertResources);
  assert.ok(restored.time > before.time, 'loaded battle can continue');
});

test('a save taken on the first real module destruction restores without healing, respawning crew or losing cargo', () => {
  const game = new Game();
  ok(game.launch(), 'launch destruction snapshot fixture');
  const originalIds = new Set(game.ships.flatMap(s => s.parts.map(p => p.id)));
  const destroyed = g => {
    const current = g.ships.flatMap(s => s.parts);
    return current.some(p => p.hp <= 0) || current.length < originalIds.size;
  };
  // Stop in the same public update in which a genuine shot removes a module.
  advanceUntil(game, destroyed, 180);
  const before = savedGameplay(game), restored = new Game();
  for (const [ship, opponent] of [[before.player, before.enemy], [before.enemy, before.player]]) {
    // An automatic target destroyed in this very update can be discarded
    // immediately by loading, rather than waiting for the next targeting tick.
    if (ship?.aiTarget && !opponent?.parts.some(p => p.id === ship.aiTarget && p.hp > 0)) ship.aiTarget = null;
  }
  ok(restored.importSave(game.exportSave()), 'restore immediately after destruction');
  assert.deepEqual(savedGameplay(restored), before, 'damage, surviving crew and jobs remain consistent');
  const crews = restored.ships.map(s => [s.id, s.crew.length]);
  const roundtrip = new Game();
  ok(roundtrip.importSave(restored.exportSave()), 'save the restored damaged battle again');
  assert.deepEqual(roundtrip.ships.map(s => [s.id, s.crew.length]), crews, 'repeated loading cannot recruit free crew');
  advance(roundtrip, 2, assertResources);
});

test('malformed save input is rejected atomically, even when validation fails late', () => {
  const game = new Game();
  advance(game, 2);
  const valid = snapshot(game);
  const invalid = [
    ['invalid JSON', () => '{'],
    ['null payload', () => null],
    ['unsupported version', data => { data.VERSION += 1; return data; }],
    ['unknown module', data => { data.blueprint[0].type = 'not-a-module'; return data; }],
    ['overlapping cells', data => { data.blueprint.push({ ...data.blueprint[0] }); return data; }],
    ['negative credits', data => { data.credits = -1; return data; }],
    ['non-finite credits', data => { data.credits = Infinity; return data; }],
    ['invalid rotation', data => { data.player.parts[0].rot = 9; return data; }],
    ['duplicate object ID', data => { data.player.parts[1].id = data.player.parts[0].id; return data; }],
    ['missing battle opponent', data => { data.mode = 'battle'; data.enemy = null; return data; }],
    ['invalid late metric', data => { data.metrics.salvageEarned = -1; return data; }],
    ['duplicate reward record', data => { data.claimedSectors = [1, 1]; return data; }],
    ['unknown operation', data => { data.contractId = 'unknown'; return data; }],
    ['unknown tactic', data => { data.tactic = 'unknown'; return data; }],
    ['unknown automatic priority', data => { data.targetPriority = 'unknown'; return data; }]
  ];
  for (const [label, mutate] of invalid) {
    const before = snapshot(game);
    rejected(game.importSave(mutate(structuredClone(valid))), label);
    assert.deepEqual(snapshot(game), before, label + ' leaves every exported game field unchanged');
  }
});

test('pause freezes gameplay and the speed control changes simulated time', () => {
  const frozen = new Game();
  frozen.paused = true;
  const before = snapshot(frozen);
  advance(frozen, 1);
  assert.deepEqual(snapshot(frozen), before, 'paused frames do not move crew or change resources');
  const normal = new Game();
  const faster = new Game();
  faster.speed = 2;
  advance(normal, 1);
  advance(faster, 1);
  assert.ok(Math.abs(faster.time - 2 * normal.time) < EPS, '2x speed simulates twice the time');
});

test('engine orientation changes actual acceleration toward the same movement command', () => {
  const forward = smallTestShip({ rotation: 0 });
  const reverse = smallTestShip({ rotation: 2 });
  for (const game of [forward, reverse]) {
    ok(game.launch(), 'launch directional fixture');
    ok(game.setMoveTarget(game.player.x, game.player.y - 1000), 'request forward movement');
  }
  const initialY = forward.player.y;
  advance(forward, 1);
  advance(reverse, 1);
  assert.ok(forward.player.y < initialY - 0.05, 'a forward engine moves the hull forward');
  assert.ok(reverse.player.y >= initialY - 0.01, 'a reversed engine cannot impersonate forward thrust');
  assert.ok(forward.getStats().forwardThrust > reverse.getStats().forwardThrust, 'displayed forward capability agrees with motion');
});

test('a ship without working engines cannot gain movement or rotation from an order alone', () => {
  const game = smallTestShip({ engine: false });
  ok(game.launch(), 'launch stationary fixture');
  const start = { x: game.player.x, y: game.player.y, angle: game.player.angle };
  ok(game.setMoveTarget(start.x + 500, start.y - 500), 'request unreachable movement');
  advance(game, 2);
  assert.ok(Math.abs(game.player.x - start.x) < EPS);
  assert.ok(Math.abs(game.player.y - start.y) < EPS);
  assert.ok(Math.abs(game.player.angle - start.angle) < EPS, 'no hidden minimum turning force');
  assert.equal(game.getStats().forwardThrust, 0);
  assert.equal(game.getStats().turnAuthority, 0);
});

test('armor in front of an otherwise supplied weapon blocks fire instead of shooting through its own hull', () => {
  const clear = smallTestShip();
  const blocked = smallTestShip({ blocked: true });
  for (const game of [clear, blocked]) {
    ok(game.setTactic('hold'), 'hold the firing fixture in place');
    ok(game.launch(), 'launch firing fixture');
  }
  advance(clear, 2);
  advance(blocked, 2);
  assert.ok(clear.metrics.shotsFired > 0, 'the unobstructed comparison weapon fires');
  assert.equal(blocked.metrics.shotsFired, 0, 'the blocked weapon cannot fire through its bow armor');
  const weapon = blocked.player.parts.find(p => p.type === 'laser');
  const armor = blocked.player.parts.find(p => p.type === 'armor');
  assert.equal(weapon.blockedById, armor.id, 'the user can identify the obstruction');
  assert.ok(blocked.getStats().weaponBlocked > 0);
});

test('assault and kite lead to different combat distances and manual targeting can return to automatic mode', () => {
  const assault = new Game(), kite = new Game();
  for (const [game, tactic] of [[assault, 'assault'], [kite, 'kite']]) {
    ok(game.setTactic(tactic), 'select ' + tactic);
    ok(game.launch(), 'launch ' + tactic);
    advance(game, 5);
  }
  const distance = g => Math.hypot(g.player.x - g.enemy.x, g.player.y - g.enemy.y);
  assert.ok(distance(kite) > distance(assault) + 5, 'a tactical choice changes the actual range');
  const target = assault.enemy.parts.find(p => p.type === 'reactor' && p.hp > 0);
  ok(assault.setTargetPriority('reactor'), 'change automatic priority');
  ok(assault.setTarget(target.id), 'temporarily select a particular module');
  assert.equal(assault.targetPartId, target.id);
  ok(assault.clearTarget(), 'return to automatic targeting');
  assert.equal(assault.targetPartId, null);
  assert.equal(assault.targetPriority, 'reactor', 'clearing a manual target retains the chosen policy');
  const before = snapshot(assault);
  rejected(assault.setTactic('invalid'), 'unknown tactic');
  rejected(assault.setTargetPriority('invalid'), 'unknown target priority');
  assert.deepEqual(snapshot(assault), before);
  const restored = new Game();
  ok(restored.importSave(assault.exportSave()), 'load tactical settings');
  assert.equal(restored.tactic, 'assault');
  assert.equal(restored.targetPriority, 'reactor');
});

test('the selected contract survives save/load and pays its displayed reward only once', () => {
  const game = new Game();
  const contracts = game.getContracts();
  assert.equal(new Set(contracts.map(c => c.id)).size, 3);
  assert.ok(contracts.every(c => Number.isFinite(c.reward) && c.reward > 0));
  ok(game.selectContract('hunter'), 'select an alternate operation');
  const quotedReward = game.getContracts().find(c => c.id === 'hunter').reward;
  const restored = new Game();
  ok(restored.importSave(game.exportSave()), 'load selected operation');
  assert.equal(restored.contractId, 'hunter');
  ok(restored.launch(), 'launch selected operation');
  const battle = snapshot(restored);
  rejected(restored.selectContract('patrol'), 'cannot change the agreement during combat');
  assert.deepEqual(snapshot(restored), battle);
  advanceUntil(restored, g => g.mode !== 'battle', 180);
  assert.equal(restored.mode, 'victory', 'the selected first operation resolves through actual combat');
  const credits = restored.credits;
  ok(restored.salvage(), 'settle selected contract');
  assert.equal(restored.credits, credits + quotedReward);
  const claimed = new Game();
  ok(claimed.importSave(restored.exportSave()), 'reload settled operation');
  assert.equal(claimed.contractId, 'hunter');
  rejected(claimed.salvage(), 'settled contract cannot pay again');
  assert.equal(claimed.credits, restored.credits);
  ok(claimed.returnToDock(), 'advance from the settled contract');
  assert.equal(claimed.sector, 2);
});

test('earned rewards fund a real three-sector campaign with no scripted damage, free upgrades or fourth reward', () => {
  let game = new Game();
  const upgrades = [
    [
      ['shield', -3, 2], ['shield', 3, 2], ['laser', -4, -3], ['laser', 4, -3],
      ['reactor', -3, 3], ['bunk', 3, 3], ['radiator', -4, 2], ['radiator', 4, 2]
    ],
    [
      ['shield', -5, 2], ['shield', 5, 2], ['laser', -5, -3], ['laser', 5, -3],
      ['reactor', -4, 3], ['bunk', 4, 3], ['radiator', -5, 3], ['radiator', 5, 3]
    ]
  ];
  for (let sector = 1; sector <= 3; sector++) {
    assert.equal(game.sector, sector);
    ok(game.selectContract('patrol'), 'choose the standard campaign operation');
    ok(game.launch(), 'launch sector ' + sector);
    advanceUntil(game, g => g.mode !== 'battle', 240);
    assert.equal(game.mode, 'victory', 'sector ' + sector + ' is won by real weapons and crew');
    assert.equal(game.metrics.battlesWon, sector);
    assertResources(game);
    ok(game.salvage(), 'claim sector ' + sector);
    ok(game.returnToDock(), 'finish sector ' + sector);
    if (sector < 3) {
      assert.equal(game.mode, 'dock');
      const before = game.credits;
      let spent = 0;
      for (const [type, x, y] of upgrades[sector - 1]) {
        ok(game.place(type, x, y), 'buy next-sector ' + type);
        spent += PARTS[type].cost;
      }
      assert.equal(game.credits, before - spent, 'upgrades consume actual earned funds');
      ok(game.restock(), 'purchase replacement ammunition');
      advance(game, 30);
      // Resume a genuine campaign at a dock boundary, rather than testing
      // completion exclusively in an uninterrupted in-memory instance.
      const resumed = new Game();
      ok(resumed.importSave(game.exportSave()), 'resume after the purchased refit');
      game = resumed;
    }
  }
  assert.equal(game.mode, 'complete');
  assert.equal(game.sector, 3);
  assert.equal(game.metrics.battlesWon, 3);
  const complete = snapshot(game);
  rejected(game.launch(), 'launch beyond completed campaign');
  rejected(game.salvage(), 'salvage beyond completed campaign');
  ok(game.returnToDock(), 'idempotent completed return');
  assert.deepEqual(snapshot(game), complete);
});
