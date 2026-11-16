import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame, BUILDINGS } from '../dist/engine.js';
import { initializeHazards, igniteTile, updateHazards } from '../dist/hazards.js';
import { refreshSystems } from '../dist/colony-systems.js';
import { sandbox, placeFixture, encloseFixture, issue, setWork, total,
  advance, until, assertResourceNumbers } from './helpers.mjs';

function fireSandbox(resources) {
  const game = sandbox(resources);
  initializeHazards(game);
  game.state.hazards.nextIncidentAt = 1e8;
  return game;
}

function advanceHazards(game, seconds, check) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.5) {
    const dt = Math.min(0.5, remaining);
    game.state.time += dt;
    updateHazards(game, dt);
    check?.();
  }
}

test('hazard initialization is inert and invalid ignition cannot consume or mutate anything', () => {
  const game = fireSandbox({ wood: 20 });
  const beforeInitialization = game.toJSON();
  initializeHazards(game);
  assert.deepEqual(game.toJSON(), beforeInitialization);
  game.tile(2, 2).terrain = 'water';
  game.tile(3, 3).terrain = 'stone';
  issue(game, 'build', { kind: 'wall', x: 21, y: 15 });
  Object.assign(game.tile(21, 15), { feature: 'tree', amount: 12 });
  for (const [x, y, strength] of [[-1, 1, 0.3], [1.5, 1, 0.3], [2, 2, 0.3],
    [3, 3, 0.3], [21, 15, 0.3], [23, 15, 0], [23, 15, -1],
    [23, 15, 2], [23, 15, Number.NaN]]) {
    const before = game.toJSON();
    const result = igniteTile(game, x, y, strength);
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
    assert.deepEqual(game.toJSON(), before, 'rejected ignition must not change fuel, RNG, reservations, or stock');
  }
  issue(game, 'cancel', { x: 21, y: 15 });
  assert.equal(game.state.resources.wood, 20, 'a rejected fire must leave the original paid blueprint refundable once');
});

test('fire spreads through real fuel, destroys plants, and respects its concurrent safety limit', () => {
  const game = fireSandbox();
  for (let y = 5; y <= 12; y++) for (let x = 25; x <= 32; x++) {
    Object.assign(game.tile(x, y), { feature: 'tree', amount: 14 });
  }
  assert.equal(igniteTile(game, 28, 8, 0.85).ok, true);
  const startingFuel = game.tile(28, 8).fireFuel;
  let sawSpread = false;
  advanceHazards(game, 100, () => {
    const fires = game.state.tiles.filter(t => t.fire > 0);
    if (fires.some(t => t.x !== 28 || t.y !== 8)) sawSpread = true;
    assert.ok(fires.length <= 32);
    for (const tile of fires) assert.ok(tile.fire <= 1 && tile.fireFuel > 0);
  });
  assert.equal(sawSpread, true, 'neighboring fuel must actually ignite over time');
  assert.ok(game.tile(28, 8).fireFuel < startingFuel);
  assert.ok(game.state.hazards.burnedPlants > 0);
  assert.equal(game.state.resources.wood, 0, 'burned trees are not harvested into warehouse resources');
  assert.equal(game.state.hazards.extinguished, 0, 'natural burnout is not counted as completed firefighting');
});

test('rain suppresses unroofed fire while a roof shields an otherwise equal indoor fire', () => {
  const clear = fireSandbox(), rain = fireSandbox();
  for (const game of [clear, rain]) {
    encloseFixture(game, 8, 8, 14, 14);
    placeFixture(game, 'bed', 11, 11);
    placeFixture(game, 'bed', 24, 11);
    refreshSystems(game);
    assert.equal(igniteTile(game, 11, 11, 0.8).ok, true);
    assert.equal(igniteTile(game, 24, 11, 0.8).ok, true);
  }
  rain.state.weather = 'rain';
  advanceHazards(clear, 4);
  advanceHazards(rain, 4);
  assert.ok(rain.tile(24, 11).fire < clear.tile(24, 11).fire);
  assert.equal(rain.tile(24, 11).fire, 0);
  assert.ok(rain.tile(11, 11).fire > 0, 'the enclosed fire must not be extinguished by outdoor rain');
  assert.equal(rain.tile(11, 11).fire, clear.tile(11, 11).fire);
  assert.equal(rain.state.hazards.extinguished, 0);
});

test('overlapping fire causes health damage and downing without inventing bleeding', () => {
  const game = fireSandbox();
  const pawn = game.state.colonists[0];
  Object.assign(pawn, { x: 25.5, y: 10.5, health: 16, bleed: 0.07 });
  issue(game, 'draft', { id: pawn.id, value: true });
  assert.equal(igniteTile(game, 25, 10, 0.9).ok, true);
  updateHazards(game, 0.5);
  assert.ok(pawn.health < 15);
  assert.equal(pawn.bleed, 0.07);
  assert.equal(pawn.drafted, false);
  assert.equal(pawn.order, null);
  assert.equal(pawn.job, null);
});

test('burned structures open rooms and sever power without issuing demolition refunds', () => {
  const game = fireSandbox({ wood: 17, steel: 23 });
  game.state.time = 20;
  encloseFixture(game);
  const wall = game.tile(14, 11).building;
  wall.hp = 1;
  placeFixture(game, 'solar', 29, 10);
  const bridge = placeFixture(game, 'battery', 30, 10, { hp: 1 });
  placeFixture(game, 'conduit', 31, 10);
  const consumer = placeFixture(game, 'cooler', 32, 10);
  refreshSystems(game);
  assert.equal(consumer.powered, true);
  assert.notEqual(game.tile(11, 11).roomId, null);
  const before = { wood: total(game, 'wood'), steel: total(game, 'steel') };
  assert.equal(igniteTile(game, 14, 11, 0.8).ok, true);
  assert.equal(igniteTile(game, 30, 10, 0.8).ok, true);
  advanceHazards(game, 1);
  assert.equal(game.tile(14, 11).building, null);
  assert.equal(game.tile(30, 10).building, null);
  assert.equal(game.tile(11, 11).roomId, null);
  assert.equal(consumer.powered, false, 'the disconnected consumer island must lose its generator');
  assert.equal(total(game, 'wood'), before.wood);
  assert.equal(total(game, 'steel'), before.steel);
  assert.equal(game.state.hazards.burnedBuildings, 2);
  assert.equal(game.state.items.some(i => ['wood', 'steel'].includes(i.type)), false);
  assert.ok(bridge.hp <= 0);
});

test('firefighting uses elapsed nearby work, one reservation, and preserves interrupted cargo', () => {
  const game = fireSandbox();
  const [worker, second] = game.state.colonists;
  game.state.items.push({ id: 'fixture_fire_interruption', x: 18, y: 14,
    type: 'wood', count: 7, reservedBy: null });
  setWork(game, worker, { haul: 1 });
  until(game, () => worker.carry?.type === 'wood', 10, 'worker should first pick up real supplies');
  issue(game, 'ignite', { x: 20, y: 14, strength: 0.65 });
  const burning = game.tile(20, 14);
  const originalFire = burning.fire;
  issue(game, 'prioritize', { id: worker.id, x: 20, y: 14 });
  assert.equal(burning.fire, originalFire, 'issuing a firefighting order is not instant extinguishing');
  assert.equal(total(game, 'wood'), 7);
  setWork(game, second, { firefight: 1 });
  let sawActualWork = false;
  until(game, () => burning.fire === 0 && game.state.hazards.extinguished >= 1, 35,
    'a reachable firefighter should put out the selected fire', () => {
      const jobs = game.state.colonists.filter(c => c.job?.type === 'firefight'
        && c.job.tx === 20 && c.job.ty === 14);
      assert.ok(jobs.length <= 1, 'two firefighters cannot claim the same fire cell');
      if (burning.fire > 0 && burning.fire < originalFire) sawActualWork = true;
      assert.equal(total(game, 'wood'), 7, 'an emergency interruption must not duplicate or lose supplies');
    });
  assert.equal(sawActualWork, true);
  assert.equal(Object.values(game.state.reservations).some(r => r.target === 'fire:20,14'), false);
});

test('an ordinary hauler replans around a newly ignited next step when an open side route exists', () => {
  const game = fireSandbox();
  const worker = game.state.colonists[0];
  game.state.items.push({ id: 'fixture_fire_route_cargo', x: 24, y: 14,
    type: 'wood', count: 9, reservedBy: null });
  setWork(game, worker, { haul: 1 });
  until(game, () => worker.carry?.type === 'wood' && worker.path.length > 2, 20,
    'the hauler should have picked up cargo and planned a warehouse route');
  const obstruction = { ...worker.path[0] };
  const startingHealth = worker.health;
  issue(game, 'ignite', { ...obstruction, strength: 0.9 });
  until(game, () => game.state.resources.wood === 9, 50,
    'a safe nearby detour should deliver the existing cargo', () => {
      assert.equal(total(game, 'wood'), 9);
      if (game.tile(obstruction.x, obstruction.y).fire > 0.15) {
        assert.ok(Math.floor(worker.x) !== obstruction.x || Math.floor(worker.y) !== obstruction.y,
          'ordinary hauling must not continue through its newly burning route cell');
      }
    });
  assert.equal(worker.health, startingHealth);
});

test('a live fire pauses extraction and clearing the emergency resumes existing progress', () => {
  const game = fireSandbox({ meals: 30 });
  game.state.time = 20;
  game.state.stats.survivedRaids = 1;
  game.state.research = { active: null, progress: { electricity: 100, refrigeration: 0, communications: 180 },
    unlocked: ['electricity', 'communications'] };
  encloseFixture(game, 19, 11, 27, 19);
  for (const x of [21, 23, 25]) placeFixture(game, 'bed', x, 13);
  placeFixture(game, 'beacon', 25, 16);
  placeFixture(game, 'solar', 26, 16);
  refreshSystems(game);
  advance(game, 1);
  const started = game.state.beaconProgress;
  assert.ok(started > 0);
  issue(game, 'ignite', { x: 34, y: 20, strength: 0.4 });
  advance(game, 1);
  assert.equal(game.state.beaconProgress, started, 'active fire must pause, not reset, the signal');
  for (const pawn of game.state.colonists) setWork(game, pawn, { firefight: 1 });
  until(game, () => game.state.tiles.every(t => t.fire === 0), 100, 'the emergency should be cleared by the colony');
  until(game, () => game.state.beaconProgress > started, 5, 'the signal should continue from its existing progress');
  assertResourceNumbers(game);
});

test('active fire and spread timing reproduce exactly after save restoration; malformed fire is rejected', () => {
  const game = fireSandbox();
  for (let y = 8; y <= 10; y++) for (let x = 25; x <= 27; x++) {
    Object.assign(game.tile(x, y), { feature: 'tree', amount: 14 });
  }
  issue(game, 'ignite', { x: 26, y: 9, strength: 0.7 });
  game.update(1.27);
  const data = game.toJSON();
  const restored = ColonyGame.fromJSON(JSON.parse(JSON.stringify(data)));
  assert.deepEqual(restored.toJSON(), data);
  for (const dt of [0.03, 0.8, 2.4, 0.17, 3.5, 7.1]) { game.update(dt); restored.update(dt); }
  assert.deepEqual(restored.toJSON(), game.toJSON());
  for (const change of [
    s => { s.tiles[0].fire = 1.1; },
    s => { s.tiles[0].fire = 0.3; s.tiles[0].fireFuel = 0; },
    s => { s.hazards.spreadTimer = Number.NaN; },
    s => { s.hazards.extinguished = -1; },
  ]) {
    const malformed = structuredClone(data); change(malformed);
    assert.throws(() => ColonyGame.fromJSON(malformed));
  }
});
