import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeSystems, refreshSystems, updateSystems, outsideTemperature,
  depositStock, withdrawStock } from '../dist/colony-systems.js';
import { sandbox, placeFixture, encloseFixture, advanceSystems, issue, until,
  setWork, total, assertResourceNumbers } from './helpers.mjs';

test('only completed enclosures create roofs; doors seal and opening a wall removes shelter', () => {
  const game = sandbox();
  encloseFixture(game);
  const bed = placeFixture(game, 'bed', 10, 10);
  issue(game, 'zone', { x: 11, y: 11, kind: 'stockpile' });
  const gap = game.tile(14, 11).building;
  gap.complete = false;
  gap.progress = 0.5;
  refreshSystems(game);
  assert.equal(game.tile(11, 11).roomId, null, 'an unfinished wall cannot seal a room');
  assert.equal(game.tile(11, 11).roofed, false);
  gap.complete = true;
  gap.progress = 1;
  refreshSystems(game);
  const room = game.state.rooms.find(r => r.id === game.tile(11, 11).roomId);
  assert.ok(room, 'the completed boundary should create an enclosed room');
  assert.equal(room.area, 25);
  assert.equal(room.beds, 1);
  assert.equal(room.stockpileTiles, 1);
  assert.equal(game.tile(11, 11).roofed, true);
  assert.equal(game.tile(10, 10).building, bed);
  assert.equal(game.tile(10, 8).building.type, 'door');
  issue(game, 'demolish', { x: 14, y: 11 });
  refreshSystems(game);
  assert.equal(game.tile(11, 11).roomId, null);
  assert.equal(game.tile(11, 11).roofed, false);
  assert.equal(game.state.rooms.length, 0);
});

test('oversized enclosures remain outdoors and opening/reclosing cannot create free cooling', () => {
  const big = sandbox();
  encloseFixture(big, 4, 4, 17, 17); // 12 x 12 = 144 cells, above the automatic roof limit.
  assert.equal(big.tile(10, 10).roofed, false);
  const game = sandbox();
  encloseFixture(game);
  game.state.time = 20;
  const originalRoom = game.state.rooms[0];
  originalRoom.temperature = -8;
  for (const i of originalRoom.tiles) game.state.tiles[i].temperature = -8;
  game.tile(14, 11).building = null;
  refreshSystems(game);
  advanceSystems(game, 10, { frozenClock: true });
  const exposed = game.tile(11, 11).temperature;
  assert.ok(exposed > -8, 'opening the room must expose the interior to warmer outside air');
  placeFixture(game, 'wall', 14, 11);
  refreshSystems(game);
  assert.ok(game.state.rooms[0].temperature >= exposed - 0.01,
    'resealing the room must not resurrect its obsolete frozen temperature');
});

test('separate conductor islands cannot share supply and consumers never relay power', () => {
  const game = sandbox();
  game.state.time = 20; // Noon.
  placeFixture(game, 'solar', 5, 5);
  placeFixture(game, 'conduit', 6, 5);
  const powered = placeFixture(game, 'heater', 9, 5);
  const beyondConsumer = placeFixture(game, 'heater', 12, 5);
  const isolatedBattery = placeFixture(game, 'battery', 30, 20);
  const isolated = placeFixture(game, 'cooler', 31, 20);
  refreshSystems(game);
  assert.equal(game.state.power.networks.length, 2);
  assert.equal(powered.powered, true);
  assert.equal(beyondConsumer.powered, false, 'a powered consumer does not extend the connection radius');
  assert.equal(beyondConsumer.networkId, null);
  assert.equal(isolated.powered, false, 'an empty battery in another network cannot use distant sunlight');
  assert.notEqual(isolated.networkId, powered.networkId);
  assert.equal(isolatedBattery.charge, 0, 'refresh cannot charge batteries');
  assert.ok(game.state.power.demand > game.state.power.servedDemand,
    'the summary must expose demand even when consumers are disconnected');
});

test('daylight stores energy, night supply consumes it, and exhausted batteries shut consumers off', () => {
  const game = sandbox();
  game.state.time = 20;
  placeFixture(game, 'solar', 5, 5);
  const battery = placeFixture(game, 'battery', 6, 5);
  const heater = placeFixture(game, 'heater', 7, 5);
  refreshSystems(game);
  advanceSystems(game, 50, { frozenClock: true });
  assert.ok(battery.charge > 0 && battery.charge <= 18000);
  const charged = battery.charge;
  game.state.time = 80; // Midnight.
  refreshSystems(game);
  assert.equal(game.state.power.generation, 0);
  assert.equal(heater.powered, true);
  advanceSystems(game, 10, { frozenClock: true });
  assert.ok(battery.charge < charged, 'night operation must consume stored watt-seconds');
  advanceSystems(game, 240, { frozenClock: true });
  assert.equal(battery.charge, 0);
  assert.equal(heater.powered, false);
  assert.equal(game.state.power.servedDemand, 0);
  assert.ok(game.state.power.demand > 0);
});

test('a cooler materially cools an enclosed room only while its network supplies power', () => {
  const game = sandbox();
  game.state.time = 20;
  encloseFixture(game, 8, 8, 13, 13);
  const cooler = placeFixture(game, 'cooler', 11, 11);
  placeFixture(game, 'solar', 12, 11);
  refreshSystems(game);
  const before = game.state.rooms[0].temperature;
  advanceSystems(game, 180, { frozenClock: true });
  const chilled = game.state.rooms[0].temperature;
  assert.equal(cooler.powered, true);
  assert.ok(chilled <= 8, `refrigeration should reach food-preserving temperature, got ${chilled}`);
  assert.ok(chilled < before - 5, 'cooling must have a measurable thermal effect');
  game.tile(12, 11).building = null;
  refreshSystems(game);
  assert.equal(cooler.powered, false);
  advanceSystems(game, 120, { frozenClock: true });
  assert.ok(game.state.rooms[0].temperature > chilled + 2,
    'an unpowered cooler cannot keep the room refrigerated indefinitely');
});

test('warm food rots while a working cold store preserves the same batch quantity', () => {
  const warm = sandbox();
  const cold = sandbox();
  for (const game of [warm, cold]) {
    game.state.time = 20;
    encloseFixture(game, 8, 8, 13, 13);
    issue(game, 'zone', { x: 10, y: 10, kind: 'stockpile' });
  }
  placeFixture(cold, 'cooler', 11, 11);
  placeFixture(cold, 'solar', 12, 11);
  refreshSystems(cold);
  advanceSystems(cold, 160, { frozenClock: true });
  assert.ok(cold.tile(10, 10).temperature <= 8);
  for (const game of [warm, cold]) {
    depositStock(game, 'rawfood', 7, 10, 10, 0.5);
    depositStock(game, 'meals', 4, 10, 10, 0.5);
    depositStock(game, 'wood', 9, 10, 10);
  }
  advanceSystems(warm, 240, { frozenClock: true });
  advanceSystems(cold, 240, { frozenClock: true });
  assert.equal(warm.state.resources.rawfood, 0);
  assert.equal(warm.state.resources.meals, 0);
  assert.equal(warm.state.systemStats.spoiled, 11);
  assert.equal(cold.state.resources.rawfood, 7);
  assert.equal(cold.state.resources.meals, 4);
  assert.equal(cold.state.systemStats.spoiled, 0);
  for (const game of [warm, cold]) {
    assert.equal(game.state.resources.wood, 9);
    assertResourceNumbers(game);
  }
});

test('stock transactions consume oldest food first and invalid withdrawal cannot create a partial debit', () => {
  const game = sandbox();
  depositStock(game, 'rawfood', 2, 11, 15, 0.25);
  depositStock(game, 'rawfood', 3, 11, 15, 0.9);
  const first = withdrawStock(game, 'rawfood', 1);
  assert.equal(first.ok, true);
  assert.equal(first.freshness, 0.25);
  assert.equal(game.state.resources.rawfood, 4);
  const before = structuredClone(game.state.foodBatches);
  const rejected = withdrawStock(game, 'rawfood', 5);
  assert.equal(rejected.ok, false);
  assert.equal(game.state.resources.rawfood, 4);
  assert.deepEqual(game.state.foodBatches, before);
  const mixed = withdrawStock(game, 'rawfood', 2);
  assert.equal(mixed.ok, true);
  assert.ok(mixed.freshness >= 0.25 && mixed.freshness <= 0.9);
  assert.equal(game.state.resources.rawfood, 2);
  assertResourceNumbers(game);
});

test('food freshness survives pickup, a drafted interruption, and final stockpile delivery', () => {
  const game = sandbox();
  const worker = game.state.colonists[0];
  game.state.items.push({ id: 'fixture_aging_food', x: 23, y: 15, type: 'rawfood',
    count: 5, reservedBy: null, freshness: 0.7 });
  setWork(game, worker, { haul: 1 });
  until(game, () => worker.carry?.type === 'rawfood', 35, 'hauler should pick up the aging food');
  const carriedFreshness = worker.carry.freshness;
  assert.ok(carriedFreshness > 0 && carriedFreshness <= 0.7);
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(total(game, 'rawfood'), 5);
  const dropped = game.state.items.find(i => i.type === 'rawfood');
  assert.ok(dropped.freshness <= carriedFreshness && dropped.freshness > 0);
  issue(game, 'draft', { id: worker.id, value: false });
  until(game, () => game.state.resources.rawfood === 5, 80, 'food should remain deliverable after interruption');
  assert.equal(total(game, 'rawfood'), 5);
  assert.ok(game.state.foodBatches.rawfood.every(b => b.freshness <= carriedFreshness && b.freshness > 0));
  assertResourceNumbers(game);
});

test('refresh and initialization do not advance time, charge, spoilage, or random state', () => {
  const game = sandbox({ rawfood: 3 });
  game.state.time = 20;
  encloseFixture(game);
  const battery = placeFixture(game, 'battery', 12, 11, { charge: 9876 });
  placeFixture(game, 'solar', 11, 11);
  placeFixture(game, 'cooler', 10, 11);
  refreshSystems(game);
  updateSystems(game, 0.5);
  const before = structuredClone(game.state);
  initializeSystems(game);
  refreshSystems(game);
  refreshSystems(game);
  assert.equal(game.state.time, before.time);
  assert.equal(battery.charge, before.tiles[11 * game.state.width + 12].building.charge);
  assert.equal(game.state.rngState, before.rngState);
  assert.equal(game.state.nextId, before.nextId);
  assert.deepEqual(game.state.foodBatches, before.foodBatches);
  assert.deepEqual(game.state.systemStats, before.systemStats);
  assert.deepEqual(game.state.rooms, before.rooms);
  assert.ok(Number.isFinite(outsideTemperature(game.state)));
});
