import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, BUILDINGS, CYCLE_SECONDS } from '../../../Web/engine.js';
import { analyzeRooms } from '../../../Web/frontier.js';
import { clone, at, buildingAt, close, solidAmount, finiteState, advance, until } from './helpers.mjs';
import { command, establishCommunityColony } from './scenarios.mjs';

const solids = ['rock', 'metal', 'algae', 'coal'];
const legacy = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const counterKeys = ['hauledItems', 'mealsCooked', 'cookedEaten', 'tableMeals', 'foodSpoiled', 'scheduledRests'];

let communitySnapshot;
function preparedColony() {
  // This cached fixture is produced entirely by public commands and normal elapsed time.
  communitySnapshot ||= establishCommunityColony({ schedules: false }).serialize();
  const game = new Game(73, 'breath-4.1');
  game.load(clone(communitySnapshot));
  return game;
}

function disable(game, types) {
  for (const b of game.buildings) if (types.includes(b.type) && b.enabled) {
    assert.ok(game.toggleBuilding(b.id));
  }
}

function quietColony() {
  const game = preparedColony();
  disable(game, ['farm', 'research', 'pump', 'purifier', 'electrolyzer', 'toilet', 'sink']);
  for (const c of game.crew) {
    assert.ok(game.setCrewRole(c.id, 'balanced'));
    assert.ok(game.setCrewSchedule(c.id, 'auto').ok);
  }
  // Boundary tests control needs to isolate production from unrelated consumption.
  const fixture = game.serialize();
  for (const c of fixture.crew) Object.assign(c, {
    hunger: 100, energy: 80, health: 100, breath: 100, bladder: 0, hygiene: 100, stress: 0,
  });
  game.load(fixture);
  return game;
}

function waterAccounting(game) {
  const stores = [...game.cells, ...game.buildings];
  close(game.resources.water, stores.reduce((s, v) => s + (v.cleanWater || 0), 0),
    'clean inventory equals its physical slots');
  close(game.resources.waste, stores.reduce((s, v) => s + (v.dirtyWater || 0), 0),
    'waste inventory equals its physical slots');
}

function rejectsAtomically(game, input, label) {
  const before = clone(game.serialize()), original = clone(input);
  assert.throws(() => game.load(input), undefined, `${label}: malformed save must be refused`);
  assert.deepEqual(game.serialize(), before, `${label}: current colony is unchanged`);
  assert.deepEqual(input, original, `${label}: caller's input is unchanged`);
}

test('v3 adds actual collection, cooking, schedules and four community milestones', () => {
  const game = new Game(73, 'breath-4.1');
  assert.equal(game.version, 4);
  assert.equal(game.objectives.length, 20);
  assert.deepEqual(game.objectives.filter(o => o.stage === 4).map(o => o.id),
    ['haul', 'cooking', 'dining', 'community']);
  assert.equal(game.settlement.target, 240);
  assert.equal(game.settlement.seconds, 0);
  assert.equal(game.logistics.capacity, 600);
  assert.equal(game.logistics.loose, 0);
  assert.equal(game.resources.meals, 0);
  for (const key of counterKeys) assert.equal(game.production[key], 0);
  for (const type of ['storage', 'kitchen', 'mess', 'fridge']) assert.ok(BUILDINGS[type]);
  assert.equal(BUILDINGS.kitchen.power, 10);
  assert.equal(BUILDINGS.fridge.power, 6);
  for (const c of game.crew) {
    assert.equal(c.cargo, null);
    assert.equal(c.schedule, 'auto');
    assert.equal(c.restedCycles, 0);
  }
  assert.ok(game.setCrewRole(game.crew[0].id, 'haul'));
  assert.ok(game.setCrewRole(game.crew[1].id, 'cook'));
  assert.equal(game.setCrewRole(game.crew[0].id, 'teleport'), false);
  assert.equal(game.setCrewSchedule(game.crew[0].id, 'never-sleep').ok, false);
  assert.equal(game.setHaulPriority(-1, 3).ok, false);
  assert.equal(game.setKitchenTarget(-1, 12).ok, false);
  finiteState(game);
});

test('mined solids remain on the ground and only an actual depot delivery adds inventory', () => {
  const game = new Game(73, 'breath-4.1'), rock = game.resources.rock;
  command(game, 'dig', 11, 11);
  until(game, () => !at(game, 11, 11).solid, 60);
  assert.equal(game.resources.rock, rock, 'finishing a dig does not teleport its output');
  assert.equal(game.production.hauledItems, 0);
  const pile = game.debris.find(p => p.x === 11 && p.y === 11);
  assert.ok(pile && pile.resource === 'rock' && pile.amount === 6);
  assert.ok(game.setHaulPriority(pile.id, 5).ok);
  assert.equal(game.setHaulPriority(pile.id, 6).ok, false);
  assert.equal(pile.priority, 5);
  until(game, () => game.crew.some(c => c.cargo), 60);
  const carrier = game.crew.find(c => c.cargo);
  assert.equal(carrier._job.kind, 'haul');
  assert.equal(carrier._job.phase, 'deliver');
  assert.equal(carrier.cargo.amount, 6);
  assert.equal(game.resources.rock, rock, 'pickup is still not shared stock');
  close(solidAmount(game, 'rock'), rock + 6, 'stock + piles + cargo conserve the mined rock');
  const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
  restored.load(clone(saved));
  assert.deepEqual(restored.serialize(), saved, 'an in-flight cargo and route round-trip exactly');
  until(restored, () => restored.production.hauledItems === 6, 60);
  assert.equal(restored.resources.rock, rock + 6);
  assert.equal(restored.debris.length, 0);
  assert.ok(restored.crew.every(c => c.cargo === null));
  const arrived = restored.crew.find(c => c.id === carrier.id), core = restored.buildings.find(b => b.type === 'core');
  close(arrived.x, core.x + 0.5, 'deposit happens at the depot x coordinate');
  close(arrived.y, core.y + 0.5, 'deposit happens at the depot y coordinate');
  finiteState(restored);
});

test('role and schedule changes drop carried material without losing or duplicating it', () => {
  for (const change of ['role', 'schedule']) {
    const game = new Game(73, 'breath-4.1'), initial = game.resources.rock;
    command(game, 'dig', 11, 11);
    until(game, () => game.crew.some(c => c.cargo), 60);
    const carrier = game.crew.find(c => c.cargo), x = Math.floor(carrier.x), y = Math.floor(carrier.y);
    if (change === 'role') assert.ok(game.setCrewRole(carrier.id, 'haul'));
    else assert.ok(game.setCrewSchedule(carrier.id, 'day').ok);
    assert.equal(carrier.cargo, null);
    assert.ok(game.debris.some(p => p.x === x && p.y === y && p.amount === 6));
    assert.ok(game.debris.every(p => p.reservedBy !== carrier.id));
    close(solidAmount(game, 'rock'), initial + 6, `${change} conserves the in-flight load`);
    until(game, () => game.production.hauledItems === 6, 90);
    assert.equal(game.resources.rock, initial + 6);
    close(solidAmount(game, 'rock'), initial + 6, `${change} allows exactly one eventual deposit`);
    finiteState(game);
  }
});

test('urgent breathing preempts a loaded haul without trapping an idle worker or losing the cargo', () => {
  const game = new Game(73, 'breath-4.1'), initial = game.resources.rock;
  command(game, 'dig', 11, 11);
  until(game, () => game.crew.some(c => c.cargo), 60);
  const id = game.crew.find(c => c.cargo).id, fixture = game.serialize();
  const c = fixture.crew.find(c => c.id === id);
  c.breath = 24;
  fixture.cells[Math.floor(c.y) * game.w + Math.floor(c.x)].water = 0.9;
  game.load(fixture);
  advance(game, 0.1);
  const carrier = game.crew.find(c => c.id === id);
  assert.equal(carrier.cargo, null, 'urgent evacuation drops the actual carried load');
  close(solidAmount(game, 'rock'), initial + 6, 'evacuation does not delete the dropped material');
  until(game, () => carrier._job?.kind === 'breathe', 1,
    'repeated low-breath preemption must not keep resetting idle time forever');
  until(game, () => carrier.breath >= 95, 30, 'the crew never escaped to breathable ground');
  assert.equal(carrier.health, 100);
  until(game, () => game.production.hauledItems === 6, 120);
  close(game.resources.rock, initial + 6, 'rescued cargo is eventually deposited exactly once');
  finiteState(game);
});

test('a blocked delivery route drops its load safely and hauling resumes after the wall is removed', () => {
  const game = new Game(73, 'breath-4.1'), initial = game.resources.rock;
  command(game, 'dig', 11, 11);
  until(game, () => game.crew.some(c => c.cargo), 60);
  const fixture = game.serialize();
  // A controlled cave-in spans the upper room; no private job or inventory fields are fabricated.
  for (let y = 8; y <= 11; y++) fixture.cells[y * game.w + 22].solid = 'tile';
  fixture.rooms = analyzeRooms(fixture); // Keep the v4 derived cache consistent with this controlled cave-in.
  game.load(fixture);
  until(game, () => game.crew.every(c => c.cargo === null), 30);
  advance(game, 1);
  assert.equal(game.production.hauledItems, 0);
  assert.equal(game.resources.rock, initial);
  close(solidAmount(game, 'rock'), initial + 6, 'a failed route conserves the carried load');
  assert.ok(game.debris.some(p => p.blockedReason.includes('길')), 'the inaccessible depot is explained');
  command(game, 'deconstruct', 22, 11);
  until(game, () => !at(game, 22, 11).solid, 60);
  const afterDemolition = solidAmount(game, 'rock');
  until(game, () => game.production.hauledItems === 6, 120);
  close(solidAmount(game, 'rock'), afterDemolition, 'repairing access cannot duplicate the cargo');
  assert.equal(game.debris.length, 0);
  finiteState(game);
});

test('a carrier death leaves a recoverable pile and is safe to save and resume', () => {
  const game = new Game(73, 'breath-4.1'), initial = game.resources.rock;
  command(game, 'dig', 11, 11);
  until(game, () => game.crew.some(c => c.cargo), 60);
  const id = game.crew.find(c => c.cargo).id, fixture = game.serialize();
  const c = fixture.crew.find(c => c.id === id);
  c.health = 0.1; c.breath = 0;
  fixture.cells[Math.floor(c.y) * game.w + Math.floor(c.x)].water = 1;
  game.load(fixture);
  advance(game, 0.1);
  assert.equal(game.crew.find(c => c.id === id).health, 0);
  assert.equal(game.crew.find(c => c.id === id).cargo, null);
  close(solidAmount(game, 'rock'), initial + 6, 'death does not destroy the carried material');
  assert.ok(game.debris.some(p => p.resource === 'rock' && p.amount === 6));
  const saved = game.serialize(); game.load(clone(saved));
  assert.deepEqual(game.serialize(), saved);
  until(game, () => game.production.hauledItems === 6, 120);
  close(game.resources.rock, initial + 6, 'a surviving worker recovers the dropped cargo');
  finiteState(game);
});

test('nearby enabled storage is a physical delivery point and full shared capacity blocks pickup', () => {
  const game = new Game(73, 'breath-4.1');
  const storage = command(game, 'storage', 13, 11);
  until(game, () => storage.progress === 1, 60);
  assert.equal(game.logistics.capacity, 840);
  command(game, 'dig', 11, 11);
  until(game, () => game.crew.some(c => c.cargo), 60);
  const carrier = game.crew.find(c => c.cargo);
  assert.equal(carrier._job.targetId, storage.id, 'the nearest reachable enabled depot is selected');
  until(game, () => game.production.hauledItems === 6, 60);
  close(carrier.x, storage.x + 0.5, 'warehouse delivery reaches the actual building');
  close(carrier.y, storage.y + 0.5, 'warehouse delivery reaches the actual floor');
  assert.ok(game.toggleBuilding(storage.id));

  const fixture = game.serialize();
  fixture.resources.rock += fixture.logistics.capacity - fixture.logistics.stored;
  fixture.logistics.stored = fixture.logistics.capacity;
  game.load(fixture);
  const before = game.resources.rock;
  command(game, 'dig', 11, 10);
  until(game, () => !at(game, 11, 10).solid, 60);
  advance(game, 3);
  assert.equal(game.production.hauledItems, 6, 'a full shared store cannot accept a second delivery');
  assert.equal(game.resources.rock, before);
  assert.equal(game.logistics.carried, 0, 'full capacity prevents taking a new load');
  assert.ok(game.debris.some(p => p.blockedReason.includes('가득')));
  assert.equal(game.queue('deconstruct', storage.x, storage.y).ok, false,
    'removing capacity below existing stock plus salvage is rejected');
  const bed = command(game, 'cot', 18, 11); // Spending stock creates real room without adding storage capacity.
  until(game, () => game.crew.some(c => c.cargo), 60);
  assert.equal(game.crew.find(c => c.cargo)._job.targetId, game.buildings.find(b => b.type === 'core').id,
    'a disabled nearby warehouse is skipped in favor of the reachable core');
  until(game, () => game.production.hauledItems === 12 && bed.progress === 1, 120);
  assert.equal(game.logistics.capacity, 840);
  close(game.resources.rock, before - BUILDINGS.cot.cost.rock + 6, 'stock spending makes room for the waiting material');
  const replacement = command(game, 'storage', 18, 16);
  until(game, () => replacement.progress === 1, 120);
  const stockBeforeRemoval = solids.reduce((s, key) => s + game.resources[key], 0);
  command(game, 'deconstruct', storage.x, storage.y);
  until(game, () => !game.buildings.some(b => b.id === storage.id), 120);
  assert.equal(game.logistics.capacity, 840);
  close(game.logistics.stored, stockBeforeRemoval + 14, 'valid warehouse removal preserves the exact salvage');
  finiteState(game);
});

test('high stress reduces real work progress under otherwise identical conditions', () => {
  const base = new Game(73, 'breath-4.1').serialize();
  base.crew[0].x = 12.5; base.crew[0].y = 11.5;
  const calm = new Game(73, 'breath-4.1'), stressed = new Game(73, 'breath-4.1');
  calm.load(clone(base));
  base.crew[0].stress = 95; stressed.load(base);
  command(calm, 'dig', 11, 11); command(stressed, 'dig', 11, 11);
  advance(calm, 1.5); advance(stressed, 1.5);
  assert.equal(calm.tasks[0].assigned, calm.crew[0].id);
  assert.equal(stressed.tasks[0].assigned, stressed.crew[0].id);
  assert.ok(calm.tasks[0].progress > stressed.tasks[0].progress * 1.5,
    'stress must change construction/mining output, not just the displayed meter');
  assert.ok(stressed.tasks[0].progress > 0, 'stress slows work without preventing all progress');
  finiteState(calm); finiteState(stressed);
});

test('a kitchen consumes two raw food and 0.3 L only after real powered labor produces three meals', () => {
  const game = quietColony(), kitchen = game.buildings.find(b => b.type === 'kitchen');
  assert.ok(game.setKitchenTarget(kitchen.id, Math.ceil(game.resources.meals + 1)).ok);
  const before = { food: game.resources.food + game.resources.meals, water: game.resources.water,
    cooked: game.production.mealsCooked, spoiled: game.production.foodSpoiled, raw: game.resources.food,
    meals: game.resources.meals };
  let labor = false, powered = false;
  until(game, () => {
    labor ||= !!kitchen.workerId && game.crew.some(c => c.id === kitchen.workerId && c._job?.kind === 'cook' && !c._job.path.length);
    powered ||= kitchen.active && game.power.demand >= BUILDINGS.kitchen.power;
    return game.production.mealsCooked > before.cooked;
  }, 90, 'the kitchen did not receive a real worker and power');
  assert.ok(labor && powered);
  assert.equal(game.production.mealsCooked - before.cooked, 3);
  close(before.water - game.resources.water, 0.3, 'one recipe consumes the actual water network');
  assert.ok(game.resources.food < before.raw - 2, 'two raw food plus spoilage are removed');
  assert.ok(game.resources.meals > before.meals + 2.9, 'three meals are produced, with small real spoilage');
  close(game.resources.food + game.resources.meals + game.production.foodSpoiled - before.spoiled,
    before.food + 1, '2-to-3 recipe and spoilage have a closed edible inventory ledger');
  assert.equal(kitchen.recipeProgress, 0);
  waterAccounting(game);
  finiteState(game);
});

test('partially cooked food survives a water disconnect and save round-trip without double output', () => {
  const game = quietColony();
  let kitchen = game.buildings.find(b => b.type === 'kitchen');
  assert.ok(game.setKitchenTarget(kitchen.id, 60).ok);
  until(game, () => kitchen.recipeProgress >= 0.25 && kitchen.recipeProgress < 0.9, 90);
  const progress = kitchen.recipeProgress, count = game.production.mealsCooked;
  command(game, 'removePipe', kitchen.x, kitchen.y);
  advance(game, 4);
  assert.equal(game.production.mealsCooked, count);
  close(kitchen.recipeProgress, progress, 'missing water preserves partial work');
  assert.equal(kitchen.active, false);
  assert.ok(kitchen.status.includes('청수'));
  const saved = game.serialize();
  game.load(clone(saved));
  assert.deepEqual(game.serialize(), saved);
  kitchen = game.buildings.find(b => b.type === 'kitchen');
  assert.ok(game.setKitchenTarget(kitchen.id, Math.ceil(game.resources.meals + 1)).ok);
  command(game, 'pipe', kitchen.x, kitchen.y);
  until(game, () => game.production.mealsCooked > count, 90);
  assert.equal(game.production.mealsCooked - count, 3);
  assert.ok(game.setKitchenTarget(kitchen.id, 0).ok);
  advance(game, 20);
  assert.equal(game.production.mealsCooked - count, 3, 'target zero stops further recipes');
  const before = clone(game.serialize());
  for (const target of [-1, 61, 2.5, NaN, '12']) assert.equal(game.setKitchenTarget(kitchen.id, target).ok, false);
  assert.deepEqual(game.serialize(), before, 'invalid targets are read-only failures');
  waterAccounting(game);
  finiteState(game);
});

test('kitchen labor and electric connections are required and resume after repair', () => {
  const game = quietColony(), kitchenId = game.buildings.find(b => b.type === 'kitchen').id;
  assert.ok(game.setKitchenTarget(kitchenId, 60).ok);
  const fixture = game.serialize();
  for (const c of fixture.crew) c.energy = 0;
  game.load(fixture);
  let kitchen = game.buildings.find(b => b.id === kitchenId);
  const count = game.production.mealsCooked, initialProgress = kitchen.recipeProgress;
  advance(game, 5);
  close(kitchen.recipeProgress, initialProgress, 'all exhausted workers rest; machines cannot invent labor');
  assert.equal(kitchen.workerId, null);
  assert.equal(game.production.mealsCooked, count);
  until(game, () => kitchen.recipeProgress > initialProgress, 120, 'rested crew never returned to the kitchen');
  command(game, 'deconstruct', 24, 16); // An empty wire cell, so no building is demolished.
  advance(game, 1);
  const partial = kitchen.recipeProgress;
  assert.equal(kitchen.connected, false);
  assert.equal(kitchen.active, false);
  advance(game, 10);
  close(kitchen.recipeProgress, partial, 'disconnected power cannot advance a recipe');
  assert.equal(game.production.mealsCooked, count);
  command(game, 'wire', 24, 16);
  until(game, () => game.production.mealsCooked > count, 120);
  assert.equal(game.production.mealsCooked - count, 3);
  finiteState(game);
});

test('powered refrigeration reduces actual spoilage and a power cut restores the warm rate', () => {
  const cold = quietColony();
  disable(cold, ['kitchen']);
  until(cold, () => cold.foodStatus.cold, 30);
  const warm = new Game(73, 'breath-4.1'); warm.load(cold.serialize());
  const fridge = warm.buildings.find(b => b.type === 'fridge');
  assert.ok(warm.toggleBuilding(fridge.id));
  const before = { food: cold.foodStatus.total, spoil: cold.production.foodSpoiled };
  advance(cold, 20); advance(warm, 20);
  assert.equal(cold.foodStatus.cold, true);
  assert.equal(warm.foodStatus.cold, false);
  const coldLoss = cold.production.foodSpoiled - before.spoil, warmLoss = warm.production.foodSpoiled - before.spoil;
  assert.ok(coldLoss > 0 && warmLoss / coldLoss > 4.9 && warmLoss / coldLoss < 5.01,
    `cold and warm losses must reflect 80% reduction (${coldLoss}, ${warmLoss})`);
  close(cold.foodStatus.total + coldLoss, before.food, 'cold inventory loss equals its spoilage ledger');
  close(warm.foodStatus.total + warmLoss, before.food, 'warm inventory loss equals its spoilage ledger');
  command(cold, 'deconstruct', 24, 16);
  advance(cold, 1);
  assert.equal(cold.foodStatus.cold, false, 'unpowered refrigeration has no passive benefit');
  close(cold.foodStatus.rawDecayPerSecond / cold.resources.food, 0.00015, 'warm raw decay rate');
  close(cold.foodStatus.cookedDecayPerSecond / cold.resources.meals, 0.0003, 'warm cooked decay rate');
  finiteState(cold); finiteState(warm);
});

test('table meals require actual movement and consumption, and disabled tables cannot earn credit', () => {
  const game = quietColony();
  disable(game, ['kitchen']);
  const fixture = game.serialize(); fixture.crew[0].hunger = 40;
  game.load(fixture);
  const eater = game.crew[0], table = game.buildings.find(b => b.type === 'mess');
  const before = { table: game.production.tableMeals, cooked: game.production.cookedEaten, eaten: game.production.mealsEaten };
  assert.ok(Math.abs(eater.x - table.x - 0.5) + Math.abs(eater.y - table.y - 0.5) > 1);
  until(game, () => eater._job?.kind === 'eat' && eater._job.targetId === table.id, 60);
  assert.ok(eater._job.path.length > 0, 'the diner receives a real path to the table');
  assert.equal(game.production.tableMeals, before.table, 'assigning or travelling does not count as eating');
  until(game, () => game.production.tableMeals > before.table, 60);
  assert.equal(game.production.tableMeals - before.table, 1);
  assert.equal(game.production.cookedEaten - before.cooked, 1);
  assert.equal(game.production.mealsEaten - before.eaten, 1);
  close(eater.x, table.x + 0.5, 'meal consumed at the table x');
  close(eater.y, table.y + 0.5, 'meal consumed at the table y');
  assert.ok(eater.hunger > 60, 'the real meal restored hunger');
  assert.ok(game.toggleBuilding(table.id));
  until(game, () => game.production.mealsEaten >= before.eaten + 2, 180);
  assert.equal(game.production.tableMeals, before.table + 1, 'a disabled table receives no imaginary diners');
  finiteState(game);
});

test('staggered schedules count real six-second bed sleep once per shifted cycle', () => {
  const game = new Game(73, 'breath-4.1'), crew = game.crew[0];
  assert.ok(game.setCrewSchedule(crew.id, 'day').ok);
  until(game, () => crew.schedulePhase === 'sleep' && crew._job?.kind === 'rest' && !crew._job.path.length, 120);
  const target = game.buildings.find(b => b.id === crew._job.targetId);
  assert.equal(target.type, 'cot');
  close(crew.x, target.x + 0.5, 'planned sleep occurs at a real bed');
  assert.equal(crew.restedCycles, 0);
  advance(game, 5);
  assert.equal(crew.restedCycles, 0, 'merely reaching a bed does not satisfy planned sleep');
  until(game, () => crew.restedCycles === 1, 3);
  assert.equal(game.production.scheduledRests, 1);
  const restored = new Game(73, 'breath-4.1'); restored.load(game.serialize());
  advance(restored, 4);
  assert.equal(restored.crew[0].restedCycles, 1, 'save/load cannot count the same scheduled night twice');
  assert.equal(restored.production.scheduledRests, 1);
  for (const [index, schedule] of ['day', 'swing', 'night'].entries()) {
    assert.ok(restored.setCrewSchedule(restored.crew[index].id, schedule).ok);
  }
  assert.equal(new Set(restored.crew.map(c => c.schedulePhase)).size, 2, 'phase offsets spread rest across the cycle');
  until(restored, () => restored.crew.every(c => c.restedCycles >= 1), 240);
  assert.ok(restored.production.scheduledRests >= 3);
  finiteState(restored);
});

for (const filename of ['v2-progress.json', 'v2-victory.json']) {
  test(`authentic ${filename} migrates to the current version while preserving the whole played v2 colony`, () => {
    const input = legacy(filename), original = clone(input), game = new Game(91, 'breath-4.1');
    assert.notEqual(game.load(input), false);
    assert.deepEqual(input, original);
    assert.equal(game.version, 4);
    assert.equal(game.time, input.time);
    assert.equal(game.seed, input.seed);
    assert.deepEqual(game.cells, input.cells, 'all old terrain, wire, pipe and physical water slots survive');
    for (const [key, value] of Object.entries(input.resources)) {
      const expected = key === 'hydrogen' ? value * 0.21875 : value;
      close(game.resources[key], expected, `${key} survives`);
    }
    for (const [key, value] of Object.entries(input.production)) {
      const expected = ['hydrogenProduced','hydrogenConsumed'].includes(key) ? value * 0.21875 : value;
      close(game.production[key], expected, `${key} production survives`);
    }
    assert.deepEqual(game.tasks, input.tasks, 'unfinished work and reservations survive');
    for (const old of input.buildings) {
      const current = game.buildings.find(b => b.id === old.id);
      for (const key of Object.keys(old)) assert.deepEqual(current[key], old[key], `building ${old.id}.${key} survives`);
    }
    for (const old of input.crew) {
      const current = game.crew.find(c => c.id === old.id);
      for (const key of ['x','y','health','hunger','energy','bladder','hygiene','role','_job','taskId']) {
        assert.deepEqual(current[key], old[key], `crew ${old.id}.${key} survives`);
      }
      assert.equal(current.schedule, 'auto'); assert.equal(current.cargo, null);
    }
    assert.equal(game.debris.length, 0);
    assert.equal(game.resources.meals, 0);
    for (const key of counterKeys) assert.equal(game.production[key], 0);
    for (const old of input.objectives) assert.equal(game.objectives.find(o => o.id === old.id).done, old.done);
    assert.equal(game.objectives.length, 20);
    assert.equal(game.won, false, 'old victory offers the subsequent community and frontier goals');
    const saved = game.serialize(), restored = new Game(73, 'breath-4.1'); restored.load(clone(saved));
    assert.deepEqual(restored.serialize(), saved);
    advance(restored, 3); finiteState(restored); waterAccounting(restored);
  });
}

test('malformed v3 stock, routines and production saves are rejected before any live mutation', () => {
  const game = preparedColony(), saved = game.serialize();
  const changes = [
    ['missing meals', s => { delete s.resources.meals; }],
    ['negative spoilage', s => { s.production.foodSpoiled = -1; }],
    ['missing debris', s => { delete s.debris; }],
    ['incorrect inventory total', s => { s.logistics.stored += 1; }],
    ['invented cold state', s => { s.foodStatus.cold = !s.foodStatus.cold; }],
    ['incorrect edible total', s => { s.foodStatus.total += 1; }],
    ['invalid routine', s => { s.crew[0].schedule = 'always-work'; }],
    ['invalid phase', s => { s.crew[0].schedulePhase = 'sleep'; }],
    ['negative rest count', s => { s.crew[0].restedCycles = -1; }],
    ['cargo without a job', s => { s.crew[0].cargo = { resource: 'rock', amount: 6 }; }],
    ['negative community interval', s => { s.settlement.seconds = -1; }],
    ['wrong community target', s => { s.settlement.target = 1; }],
    ['inconsistent healthy flag', s => { s.settlement.healthy = !s.settlement.healthy; }],
    ['failed conditions with elapsed time', s => { s.settlement.healthy = false; s.settlement.reasons = ['blocked']; s.settlement.seconds = 10; }],
    ['victory without completed objectives', s => { s.won = true; }],
    ['missing recipe progress', s => { delete s.buildings.find(b => b.type === 'kitchen').recipeProgress; }],
    ['invalid meal target', s => { s.buildings.find(b => b.type === 'kitchen').mealTarget = 61; }],
    ['invented warehouse size', s => { s.buildings.find(b => b.type === 'storage').storageCapacity += 1; }],
  ];
  for (const [label, change] of changes) {
    const input = clone(saved); change(input); rejectsAtomically(game, input, label);
  }
});

test('real pile reservations round-trip and inconsistent pickup or cargo relationships are rejected', () => {
  const game = new Game(73, 'breath-4.1');
  command(game, 'dig', 11, 11);
  until(game, () => game.crew.some(c => c._job?.kind === 'haul' && c._job.phase === 'pickup'), 60);
  const carrier = game.crew.find(c => c._job?.kind === 'haul'), saved = game.serialize();
  assert.equal(saved.debris.find(p => p.id === carrier._job.pileId).reservedBy, carrier.id);
  const restored = new Game(1, 'breath-4.1'); restored.load(clone(saved));
  assert.deepEqual(restored.serialize(), saved, 'the pending pickup preserves exactly one reservation owner');
  const changes = [
    ['unowned pickup', s => { s.debris[0].reservedBy = null; }],
    ['wrong reservation owner', s => { s.debris[0].reservedBy = s.crew.find(c => c.id !== carrier.id).id; }],
    ['duplicate debris id', s => { s.debris.push(clone(s.debris[0])); }],
    ['colliding entity id', s => { s.debris[0].id = s.buildings[0].id; }],
    ['negative pile amount', s => { s.debris[0].amount = -1; }],
    ['invalid priority', s => { s.debris[0].priority = 6; }],
    ['unknown solid type', s => { s.debris[0].resource = 'hydrogen'; }],
    ['missing reserved pile', s => { s.debris = []; }],
  ];
  for (const [label, change] of changes) {
    const input = clone(saved); change(input); rejectsAtomically(game, input, label);
  }
  until(game, () => game.crew.some(c => c.cargo), 60);
  const carrying = game.serialize(), owner = carrying.crew.find(c => c.cargo);
  const invalid = clone(carrying); invalid.crew.find(c => c.id === owner.id).cargo.amount = 13;
  rejectsAtomically(game, invalid, 'cargo over the twelve-unit limit');
  const wrongPhase = clone(carrying); wrongPhase.crew.find(c => c.id === owner.id)._job.phase = 'pickup';
  rejectsAtomically(game, wrongPhase, 'carried material without a delivery phase');
});

test('public commands complete the original sixteen goals after a real interruption and sustain ten more cycles', () => {
  const game = establishCommunityColony();
  until(game, () => game.settlement.seconds >= 10, CYCLE_SECONDS * 15,
    'normal collection, food production and staggered sleep never began a healthy community interval');
  const fridge = game.buildings.find(b => b.type === 'fridge');
  assert.ok(game.toggleBuilding(fridge.id));
  advance(game, 1);
  assert.equal(game.settlement.healthy, false);
  assert.equal(game.settlement.seconds, 0, 'a broken current condition resets continuous community time');
  assert.ok(game.settlement.reasons.some(reason => reason.includes('냉장')));
  assert.ok(game.toggleBuilding(fridge.id));
  const legacyGoals = game.objectives.filter(o => o.stage <= 4);
  until(game, () => legacyGoals.every(o => o.done), CYCLE_SECONDS * 15, 'the normal route could not recover and finish the original sixteen goals');
  assert.equal(legacyGoals.length, 16);
  assert.ok(legacyGoals.every(o => o.done));
  assert.equal(game.won, false, 'the new four frontier goals still require actual expansion');
  assert.equal(game.lost, false);
  assert.equal(game.settlement.seconds, 240);
  assert.ok(game.crew.every(c => c.health >= 80 && c.restedCycles >= 1 && c.schedule !== 'auto'));
  assert.ok(game.production.hauledItems >= 80 && game.production.mealsCooked >= 12 && game.production.tableMeals >= 6);
  assert.equal(at(game, 36, 11).solid, 'tile', 'the spring has an actual safe water barrier');
  const before = clone(game.production), farms = game.buildings.filter(b => b.type === 'farm' && b.y === 16);
  assert.equal(farms.length, 3);
  const harvests = new Map(farms.map(b => [b.id, 0])), growth = new Map(farms.map(b => [b.id, b.growth]));
  advance(game, CYCLE_SECONDS * 10, (g, tick) => {
    assert.ok(g.crew.every(c => c.health > 0 && c.x < 36), 'all crew remain alive on the colony side of the spring wall');
    for (const farm of farms) {
      assert.ok(at(g, farm.x, farm.y).water < 0.5, 'the documented lower farm is protected from flooding');
      if (growth.get(farm.id) > 0.95 && farm.growth < 0.1) harvests.set(farm.id, harvests.get(farm.id) + 1);
      growth.set(farm.id, farm.growth);
    }
    if (tick % 100 === 0) { finiteState(g); waterAccounting(g); }
  });
  assert.equal(game.lost, false);
  assert.ok(game.crew.every(c => c.health >= 80 && c.hunger > 0 && c.restedCycles >= 10));
  assert.ok(game.production.harvestedFood > before.harvestedFood);
  assert.ok(game.production.mealsCooked > before.mealsCooked && game.production.cookedEaten > before.cookedEaten);
  assert.ok(game.production.tableMeals > before.tableMeals && game.production.scheduledRests > before.scheduledRests);
  for (const [id, count] of harvests) assert.ok(count >= 2, `farm ${id} harvested ${count} times during the extra ten cycles`);
  assert.ok(game.foodStatus.total >= 20 && game.resources.meals >= 3);
  finiteState(game); waterAccounting(game);
});
