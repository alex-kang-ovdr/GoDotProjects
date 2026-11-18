'use strict';

// Resource depletion, full buffers and destroyed access are deliberate boundary
// fixtures. Routing, manufacture, trading, repair, editing and migration then use
// public game operations and elapsed simulation time.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, PARTS, VERSION } = require('../dist/sim.js');
const { Shipyard } = require('../dist/editor.js');
const Data = require('../dist/data.js');
const legacyV3 = require('./fixtures/legacy-v3.cjs');
const DT = 0.05, EPS = 1e-6;

function ok(result, context) {
  assert.equal(result?.ok, true, context + ': ' + (result?.message || 'no result'));
  return result;
}
function rejected(result, context) {
  assert.equal(result?.ok, false, context + ' must be rejected');
  assert.ok(result.message, context + ' gives feedback');
}
function advance(game, seconds, check) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    game.update(DT);
    if (check) check(game);
  }
}
function until(game, predicate, seconds = 45, check) {
  for (let i = 0; i < Math.ceil(seconds / DT) && !predicate(game); i++) {
    game.update(DT);
    if (check) check(game);
  }
  assert.ok(predicate(game), 'condition reached within ' + seconds + 's; mode=' + game.mode);
}
const save = game => structuredClone(game.exportSave());
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < EPS, message + ': ' + actual + ' vs ' + expected);
function ammo(ship) {
  return ship.parts.reduce((sum, p) => sum + (p.hp > 0 ? p.ammo || 0 : 0), 0)
    + ship.crew.reduce((sum, c) => sum + (c.cargo === 'ammo' ? c.cargoAmount : 0), 0);
}
function sulfur(ship) {
  return ship.parts.reduce((sum, p) => sum + (p.hp > 0 ? (p.sulfur || 0) + (p.production?.batchActive ? Data.INDUSTRY.sulfurPerBatch : 0) : 0), 0)
    + ship.crew.reduce((sum, c) => sum + (c.cargo === 'sulfur' ? c.cargoAmount : 0), 0);
}
function materialEquivalent(ship) { return ammo(ship) + sulfur(ship) * Data.INDUSTRY.ammoPerBatch; }
function bounds(game) {
  assert.ok(Number.isFinite(game.credits) && game.credits >= -EPS);
  for (const p of game.player.parts) {
    const d = PARTS[p.type];
    for (const field of ['power', 'ammo', 'sulfur']) {
      assert.ok(Number.isFinite(p[field]) && p[field] >= -EPS, p.type + ' ' + field + ' stays nonnegative');
      assert.ok(p[field] <= (d[field + 'Capacity'] || 0) + EPS, p.type + ' ' + field + ' respects capacity');
    }
    if (p.production) assert.ok(p.production.progress >= -EPS && p.production.progress <= Data.INDUSTRY.batchSeconds + EPS);
  }
  for (const c of game.player.crew) {
    assert.ok(c.cargoAmount >= -EPS && c.cargoAmount <= 18 + EPS, 'all transported packets remain bounded');
  }
}
function freeSlot(game, walkable = true) {
  const live = game.player.parts.filter(p => p.hp > 0);
  const at = (x, y) => live.find(p => p.x === x && p.y === y);
  for (const p of live) {
    if (walkable && !PARTS[p.type].walkable) continue;
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = p.x + dx, y = p.y + dy;
      if (Math.abs(x) > 10 || Math.abs(y) > 10 || at(x, y)) continue;
      const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) => at(x + a, y + b)).filter(Boolean);
      if (!walkable && neighbors.some(n => PARTS[n.type].walkable)) continue;
      return { x, y };
    }
  }
  throw new Error('fixture needs a vacant connected ' + (walkable ? 'walkable' : 'armor-only') + ' site');
}
function factoryFixture(walkable = true) {
  const game = new Game();
  const spot = freeSlot(game, walkable);
  ok(game.place('ammo_factory', spot.x, spot.y), 'buy a real factory');
  const factory = game.player.parts.find(p => p.x === spot.x && p.y === spot.y);
  return { game, factory };
}

test('the simulation consumes adapter reactor definitions and exposes the three new purchasable modules', () => {
  assert.deepEqual(Object.keys(PARTS).sort(), Object.keys(Data.PART_REFERENCES).sort());
  for (const type of ['reactor', 'reactor_medium', 'reactor_large']) {
    for (const field of ['cost', 'hp', 'mass', 'generation', 'powerCapacity', 'batteryPack']) {
      assert.equal(PARTS[type][field], Data.PART_OVERRIDES[type][field], type + '.' + field + ' consumes the adapter');
    }
  }
  assert.equal(PARTS.ammo_factory.cost, Data.PART_OVERRIDES.ammo_factory.cost);
  assert.equal(PARTS.storage.sulfurCapacity, Data.INDUSTRY.storageSulfurCapacity);
  const game = new Game();
  assert.equal(sulfur(game.player), game.player.parts.filter(p => p.type === 'storage').length * Data.INDUSTRY.initialStorageSulfur);
});

for (const [label, fixture] of Object.entries(legacyV3)) {
  test('released v3 ' + label + ' migrates with paid upgrades, carried inventory and combat state, without free sulfur', () => {
    const game = new Game();
    ok(game.importSave(structuredClone(fixture)), 'load the frozen released v3 state');
    assert.equal(VERSION, 4);
    assert.equal(game.mode, fixture.mode);
    assert.equal(game.sector, fixture.sector);
    assert.equal(game.credits, fixture.credits);
    assert.deepEqual(game.upgrades, fixture.upgrades);
    assert.equal(game.player.repairStock, fixture.player.repairStock);
    assert.equal(game.repairPolicy, fixture.repairPolicy);
    assert.equal(game.serviceTargetId, fixture.serviceTargetId);
    assert.deepEqual(game.projectiles, fixture.projectiles);
    assert.deepEqual(game.player.parts.map(p => [p.id, p.type, p.hp, p.power, p.ammo, p.fire]),
      fixture.player.parts.map(p => [p.id, p.type, p.hp, p.power, p.ammo, p.fire]));
    assert.deepEqual(game.player.crew.map(c => [c.id, c.cargo, c.cargoAmount]),
      fixture.player.crew.map(c => [c.id, c.cargo, c.cargoAmount]));
    assert.equal(sulfur(game.player), 0, 'migration does not grant new-game starter sulfur');
    assert.ok(game.player.parts.every(p => p.production === null));
    const restored = new Game();
    ok(restored.importSave(save(game)), 'round-trip as v4');
    assert.equal(restored.credits, fixture.credits);
    assert.equal(sulfur(restored.player), 0);
    advance(restored, 1, bounds);
    assert.ok(restored.time > fixture.time);
  });
}

for (const [type, expectedPack] of [['reactor_medium', 12], ['reactor_large', 18]]) {
  test(type + ' can be the only reactor, delivers its larger packet, and saves that packet in flight', () => {
    const game = new Game();
    game.credits = 5000; // explicit budget fixture for a late-tier component
    const old = game.player.parts.find(p => p.type === 'reactor');
    const { x, y, rot } = old;
    ok(game.erase(x, y), 'remove the starter reactor');
    ok(game.place(type, x, y, rot), 'install the new reactor');
    for (const p of game.player.parts) p.power = 0; // depleted consumers demand a complete battery packet
    const reactor = game.player.parts.find(p => p.type === type);
    reactor.power = PARTS[type].powerCapacity;
    ok(game.setCrewPolicy('power'), 'prioritize actual deliveries');
    until(game, g => g.player.crew.some(c => c.cargo === 'power' && Math.abs(c.cargoAmount - expectedPack) < EPS), 20, bounds);
    const restored = new Game();
    ok(restored.importSave(save(game)), 'save a large power packet during its real delivery');
    assert.ok(restored.player.crew.some(c => c.cargo === 'power' && Math.abs(c.cargoAmount - expectedPack) < EPS));
    until(restored, g => g.getStats().powerPacketsDelivered > 0, 20, bounds);
    ok(restored.launch(), 'launch with no small reactor present');
    assert.equal(restored.mode, 'battle');
  });
}

test('sulfur trading uses a concrete bounded quote and rejected trades leave the entire saved state unchanged', () => {
  const game = new Game();
  const quote = game.getProductionQuote('sulfur', 3);
  assert.equal(quote.ok, true);
  assert.equal(quote.amount, 3);
  assert.equal(quote.cost, 3 * Data.INDUSTRY.sulfurUnitPrice);
  assert.equal(quote.free, quote.capacity - quote.stored);
  const beforeCredits = game.credits, beforeSulfur = sulfur(game.player);
  ok(game.buyResource('sulfur', 3), 'buy quoted sulfur');
  near(sulfur(game.player), beforeSulfur + quote.amount, 'purchased material is present');
  near(game.credits, beforeCredits - quote.cost, 'only the quote is charged');
  for (const [resource, amount] of [['unknown_resource', 1], ['sulfur', -1], ['sulfur', NaN]]) {
    const before = save(game);
    rejected(game.buyResource(resource, amount), 'invalid trade');
    assert.deepEqual(save(game), before, 'failed trade is atomic');
  }
  game.credits = 0; // insufficient-funds boundary, after the successful transaction
  const before = save(game);
  rejected(game.buyResource('sulfur', 1), 'unaffordable trade');
  assert.deepEqual(save(game), before);
});

test('crew-fed manufacture conserves sulfur-equivalent material through repeated real production and deliveries', () => {
  const { game } = factoryFixture();
  const initial = materialEquivalent(game.player);
  until(game, g => g.getStats().ammoProduced >= 40, 60, g => {
    bounds(g);
    near(materialEquivalent(g.player), initial, 'raw input, work in progress and output are conserved');
  });
  assert.ok(game.player.crew.some(c => c.job) || game.getStats().ammoDelivered > 0, 'production uses the live delivery system');
  assert.equal(game.getStats().sulfurTotal, sulfur(game.player));
});

test('a factory with no sulfur makes no ammunition until a paid purchase is physically delivered', () => {
  const { game } = factoryFixture();
  for (const p of game.player.parts) p.sulfur = 0;
  const initialAmmo = ammo(game.player);
  advance(game, 20, bounds);
  near(ammo(game.player), initialAmmo, 'no free production');
  assert.equal(game.getStats().ammoProduced, 0);
  ok(game.buyResource('sulfur', 2), 'buy missing raw material');
  until(game, g => g.getStats().ammoProduced >= 20, 45, bounds);
});

test('power loss pauses a funded production job without consuming its reserved sulfur twice', () => {
  const { game, factory } = factoryFixture();
  const reactor = game.player.parts.find(p => p.type === 'reactor');
  const spot = { x: reactor.x, y: reactor.y, rot: reactor.rot };
  ok(game.erase(spot.x, spot.y), 'remove the only power source');
  for (const p of game.player.parts) p.power = 0;
  const initial = materialEquivalent(game.player);
  advance(game, 20, g => {
    bounds(g);
    near(materialEquivalent(g.player), initial, 'waiting job retains its raw input');
  });
  assert.equal(game.getStats().ammoProduced, 0);
  near(factory.production.progress, 0, 'unpowered work does not advance');
  ok(game.place('reactor', spot.x, spot.y, spot.rot), 'restore power using the actual placement API');
  until(game, g => g.getStats().ammoProduced >= 20, 45, bounds);
  near(materialEquivalent(game.player), initial, 'recovery does not double-charge sulfur');
});

test('factory disable and global pause preserve an active batch, then resume that same work', () => {
  const { game, factory } = factoryFixture();
  until(game, () => factory.production.batchActive && factory.production.progress > 1, 30, bounds);
  ok(game.setFactoryEnabled(factory.id, false), 'pause this factory');
  const progress = factory.production.progress, initial = materialEquivalent(game.player);
  advance(game, 12, bounds);
  near(factory.production.progress, progress, 'disabled job does not advance');
  near(materialEquivalent(game.player), initial, 'disabled work retains reserved input');
  game.paused = true;
  ok(game.setFactoryEnabled(factory.id, true), 'enable the job while the whole simulation is paused');
  advance(game, 3);
  near(factory.production.progress, progress, 'global pause prevents work');
  game.paused = false;
  until(game, g => g.getStats().ammoProduced >= 20, 20, bounds);
  near(materialEquivalent(game.player), initial, 'resume produces only the paid batch');
});

test('full output capacity blocks manufacturing without discarding raw materials or creating excess ammunition', () => {
  const { game, factory } = factoryFixture();
  for (const p of game.player.parts) p.ammo = PARTS[p.type].ammoCapacity || 0; // all recipients are full
  const initial = materialEquivalent(game.player);
  advance(game, 25, bounds);
  assert.equal(game.getStats().ammoProduced, 0);
  near(materialEquivalent(game.player), initial, 'no manufacture into a full ship');
  near(factory.ammo, PARTS.ammo_factory.ammoCapacity, 'factory output remains bounded');
});

test('armor-only structural connection cannot teleport raw material into an inaccessible factory', () => {
  const { game, factory } = factoryFixture(false);
  const initial = materialEquivalent(game.player);
  advance(game, 25, bounds);
  assert.equal(game.getStats().ammoProduced, 0);
  assert.equal(factory.sulfur, 0);
  near(materialEquivalent(game.player), initial, 'inaccessible supply remains in its original containers');
  ok(game.erase(factory.x, factory.y), 'remove the inaccessible factory');
  const spot = freeSlot(game, true);
  ok(game.place('ammo_factory', spot.x, spot.y), 'rebuild beside a real crew path');
  until(game, g => g.getStats().ammoProduced >= 20, 45, bounds);
});

test('an active production batch and transported resources survive saving and continue with the same output', () => {
  const { game, factory } = factoryFixture();
  ok(game.buyResource('sulfur', 8), 'supply a sustained production run');
  until(game, g => factory.production.batchActive && factory.production.progress > 2 && g.player.crew.some(c => c.cargoAmount > 0), 35, bounds);
  const restored = new Game();
  ok(restored.importSave(save(game)), 'restore work and carried resources');
  const restoredFactory = restored.player.parts.find(p => p.id === factory.id);
  assert.deepEqual(restoredFactory.production, factory.production);
  near(sulfur(restored.player), sulfur(game.player), 'raw material includes work in progress');
  near(ammo(restored.player), ammo(game.player), 'transported output is preserved');
  assert.deepEqual(restored.player.crew.map(c => [c.id, c.cargo, c.cargoAmount]), game.player.crew.map(c => [c.id, c.cargo, c.cargoAmount]));
  advance(game, 15, bounds);
  advance(restored, 15, bounds);
  assert.equal(restored.getStats().ammoProduced, game.getStats().ammoProduced);
  near(materialEquivalent(restored.player), materialEquivalent(game.player), 'restored simulation produces neither extra nor missing materials');
  near(restoredFactory.production.progress, factory.production.progress, 'production resumes at the same point');
});

test('malformed sulfur and production saves are rejected atomically', () => {
  const { game, factory } = factoryFixture();
  until(game, () => factory.production.batchActive && factory.production.progress > 1, 30, bounds);
  const cases = [
    d => { d.player.parts.find(p => p.id === factory.id).sulfur = -1; },
    d => { d.player.parts.find(p => p.id === factory.id).sulfur = PARTS.ammo_factory.sulfurCapacity + 1; },
    d => { d.player.parts.find(p => p.id === factory.id).production.progress = Data.INDUSTRY.batchSeconds + 1; },
    d => { d.player.parts.find(p => p.id === factory.id).production.batchActive = false; },
    d => { d.player.crew[0].cargo = 'unrecognized_resource'; d.player.crew[0].cargoAmount = 1; }
  ];
  for (const corrupt of cases) {
    const malformed = save(game), before = save(game);
    corrupt(malformed);
    rejected(game.importSave(malformed), 'malformed industrial save');
    assert.deepEqual(save(game), before, 'failed import does not partially replace live state');
  }
});

test('normal factory demolition returns work-in-progress material and a no-op blueprint does not duplicate it', () => {
  const { game, factory } = factoryFixture();
  until(game, () => factory.production.batchActive && factory.production.progress > 1, 30, bounds);
  game.paused = true;
  const initial = materialEquivalent(game.player);
  const yard = new Shipyard(game);
  ok(yard.apply(yard.capture('생산 중 설계')), 'apply the current design');
  near(materialEquivalent(game.player), initial, 'blueprint reuse preserves factory input/output and carriers');
  const reused = game.player.parts.find(p => p.x === factory.x && p.y === factory.y && p.type === 'ammo_factory');
  assert.equal(reused.production.batchActive, true);
  near(reused.production.progress, factory.production.progress, 'blueprint does not reset active manufacturing');
  ok(game.erase(reused.x, reused.y), 'normally dismantle a working factory');
  near(materialEquivalent(game.player), initial, 'refunded raw input remains in available storage');
  ok(new Game().importSave(save(game)), 'save after normal demolition');
});

test('a naturally won mission grants sulfur once and saving the claimed reward cannot grant it again', () => {
  const game = new Game();
  ok(game.launch(), 'launch the default ship');
  until(game, g => g.mode !== 'battle', 180, bounds);
  assert.equal(game.mode, 'victory', 'default first contract remains winnable');
  const beforeSulfur = sulfur(game.player), beforeCredits = game.credits;
  const expected = Data.INDUSTRY.salvageBase + Data.INDUSTRY.salvagePerSector * game.sector;
  ok(game.salvage(), 'claim the actual victory');
  near(sulfur(game.player), beforeSulfur + expected, 'sulfur reward is actually stored');
  assert.ok(game.credits > beforeCredits);
  const restored = new Game();
  ok(restored.importSave(save(game)), 'load the claimed reward');
  const before = save(restored);
  rejected(restored.salvage(), 'duplicate reward');
  assert.deepEqual(save(restored), before);
});
