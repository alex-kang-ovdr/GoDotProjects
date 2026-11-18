import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame, RECIPES } from '../dist/engine.js';
import { sandbox, placeFixture, issue, setWork, total, advance, until,
  assertResourceNumbers } from './helpers.mjs';

const bill = (game, recipeId, target, mode = 'count', paused = false) =>
  issue(game, 'bill', { recipeId, mode, target, paused });

function craftFixture(recipeId = 'tool', amount = 1, benchX = 21) {
  const recipe = RECIPES[recipeId];
  const game = sandbox(Object.fromEntries(Object.entries(recipe.cost).map(([type, n]) => [type, n * amount])));
  const worker = game.state.colonists[0];
  const bench = placeFixture(game, 'workbench', benchX, 14);
  setWork(game, worker, { craft: 1 });
  bill(game, recipeId, amount);
  return { game, worker, bench, recipe };
}

test('bill input is validated atomically and an identical bill does not reset an active craft job', () => {
  const { game, worker } = craftFixture();
  until(game, () => worker.job?.type === 'craft', 10, 'a worker should reserve the actual workbench');
  const valid = { recipeId: 'tool', mode: 'count', target: 1, paused: false };
  const invalid = [
    { ...valid, recipeId: 'missing' }, { ...valid, mode: 'missing' },
    { ...valid, target: -1 }, { ...valid, target: 100 }, { ...valid, target: 1.5 },
    { ...valid, target: Number.NaN }, { ...valid, paused: 'false' }, { recipeId: 'tool' },
  ];
  for (const payload of invalid) {
    const before = game.toJSON();
    assert.equal(game.command('bill', payload).ok, false);
    assert.deepEqual(game.toJSON(), before, 'invalid bill changes cannot cancel reservations or debit supplies');
  }
  const before = structuredClone({ job: worker.job, carry: worker.carry, reservations: game.state.reservations });
  issue(game, 'bill', valid);
  assert.deepEqual({ job: worker.job, carry: worker.carry, reservations: game.state.reservations }, before);
});

test('crafting needs a reachable completed bench, stages every input, and drops one product before hauling', () => {
  const { game, worker, bench, recipe } = craftFixture();
  bench.complete = false;
  bench.progress = 0;
  advance(game, 6);
  assert.equal(game.state.industry.crafted.tool, 0);
  assert.equal(total(game, 'tool'), 0);
  for (const [type, n] of Object.entries(recipe.cost)) assert.equal(total(game, type), n);
  bench.complete = true;
  bench.progress = 1;
  for (const [x, y] of [[20, 14], [22, 14], [21, 13], [21, 15]]) placeFixture(game, 'wall', x, y);
  advance(game, 6);
  assert.equal(game.state.industry.crafted.tool, 0, 'an inaccessible station cannot work remotely');
  game.tile(20, 14).building = null;
  let sawMaterialDelivery = false;
  until(game, () => game.state.industry.crafted.tool === 1, 100, 'real material delivery and craft work should finish a tool', () => {
    if (worker.job?.type === 'craft' && Object.values(worker.job.materials || {}).some(n => n > 0)) sawMaterialDelivery = true;
    if (game.state.industry.crafted.tool === 0) {
      for (const [type, n] of Object.entries(recipe.cost)) assert.equal(total(game, type), n,
        `${type} must stay in stock, cargo, or staged inputs until completion`);
      assert.equal(total(game, 'tool'), 0);
    }
    assertResourceNumbers(game);
  });
  assert.equal(sawMaterialDelivery, true);
  for (const type of Object.keys(recipe.cost)) assert.equal(total(game, type), 0);
  assert.equal(game.state.industry.bills.tool.target, 0);
  assert.equal(total(game, 'tool'), 1);
  assert.equal(game.state.resources.tool, 0);
  assert.ok(game.state.items.some(i => i.type === 'tool' && i.x === 21 && i.y === 14));
  setWork(game, worker, { haul: 1 });
  until(game, () => game.state.resources.tool === 1, 50, 'the product must be carried into the warehouse');
  advance(game, 10);
  assert.equal(total(game, 'tool'), 1);
});

test('multiple benches and crafters cannot exceed a finite bill or spend the same final inputs twice', () => {
  const { game, recipe } = craftFixture('tool', 2);
  placeFixture(game, 'workbench', 23, 14);
  setWork(game, game.state.colonists[1], { craft: 1 });
  bill(game, 'tool', 1);
  until(game, () => game.state.industry.crafted.tool === 1, 100, 'the one-unit bill should finish', () => {
    assert.ok(game.state.colonists.filter(c => c.job?.type === 'craft' && c.job.recipeId === 'tool').length <= 1);
    assertResourceNumbers(game);
  });
  advance(game, 15);
  assert.equal(total(game, 'tool'), 1);
  for (const [type, n] of Object.entries(recipe.cost)) assert.equal(total(game, type), n);
  bill(game, 'tool', 2); // Two requested, but resources for only one remain.
  until(game, () => game.state.industry.crafted.tool === 2, 100, 'the remaining real input set should produce one more tool');
  advance(game, 15);
  assert.equal(total(game, 'tool'), 2);
  assert.equal(game.state.industry.bills.tool.target, 1);
  for (const type of Object.keys(recipe.cost)) assert.equal(total(game, type), 0);
  assertResourceNumbers(game);
});

test('maintain bills count in-flight work, loose products, hauled goods, and equipped gear', () => {
  const { game, worker } = craftFixture('tool', 3);
  const [second, hauler] = game.state.colonists.slice(1);
  placeFixture(game, 'workbench', 23, 14);
  setWork(game, second, { craft: 1 });
  bill(game, 'tool', 1, 'maintain');
  until(game, () => total(game, 'tool') === 1, 100, 'maintain should produce its first required tool', () => {
    assert.ok(game.state.colonists.filter(c => c.job?.type === 'craft' && c.job.recipeId === 'tool').length <= 1);
  });
  advance(game, 15);
  assert.equal(game.state.industry.crafted.tool, 1, 'a loose tool already satisfies the target');
  setWork(game, hauler, { haul: 1 });
  until(game, () => game.state.resources.tool === 1, 50, 'the loose output should be hauled');
  issue(game, 'equip', { id: hauler.id, item: 'tool' });
  until(game, () => hauler.equipment.tool === 'tool', 30, 'the actual tool should be fetched and equipped', () => {
    assert.equal(total(game, 'tool'), 1);
    assert.equal(game.state.industry.crafted.tool, 1, 'equipment in transit cannot create a temporary production deficit');
  });
  advance(game, 15);
  assert.equal(game.state.industry.crafted.tool, 1, 'equipped equipment remains part of the maintain count');
  issue(game, 'unequip', { id: hauler.id, slot: 'tool' });
  advance(game, 5);
  assert.equal(game.state.industry.crafted.tool, 1);
  assert.equal(total(game, 'tool'), 1);
  assert.equal(worker.job?.type === 'craft', false);
});

test('every craft interruption returns fetched and staged inputs exactly once without creating a product', () => {
  for (const cause of ['draft', 'bill', 'schedule', 'fire', 'bench-loss', 'death']) {
    const { game, worker, bench, recipe } = craftFixture('rifle', 1, 28);
    until(game, () => worker.job?.type === 'craft'
      && Object.values(worker.job.materials || {}).some(n => n > 0) && worker.carry?.source === 'craft',
    120, `${cause}: both delivered material and a second carried input must exist`);
    if (cause === 'draft') issue(game, 'draft', { id: worker.id, value: true });
    else if (cause === 'bill') bill(game, 'rifle', 0, 'count', true);
    else if (cause === 'schedule') {
      worker.energy = 50;
      issue(game, 'schedule', { id: worker.id, hour: Math.floor(game.getSummary().hour), mode: 'sleep' });
    } else if (cause === 'fire') {
      setWork(game, worker, { craft: 1, firefight: 1 });
      issue(game, 'ignite', { x: Math.floor(worker.x) + 1, y: Math.floor(worker.y), strength: 0.75 });
      until(game, () => worker.job?.type === 'firefight', 4, 'a craft worker should answer the new fire');
    } else if (cause === 'bench-loss') {
      bench.hp = 1;
      issue(game, 'ignite', { x: 28, y: 14, strength: 0.9 });
      until(game, () => game.tile(28, 14).building === null, 3, 'the station should be destroyed by real fire damage');
    } else {
      worker.health = 0.02; worker.bleed = 1;
      until(game, () => worker.dead, 1, 'the interrupted crafter should die from the simulated wound');
    }
    assert.notEqual(worker.job?.type, 'craft', `${cause}: the original job must end`);
    assert.equal(worker.carry?.source === 'craft', false);
    for (const [type, n] of Object.entries(recipe.cost)) assert.equal(total(game, type), n, `${cause}: ${type} must be conserved`);
    assert.equal(total(game, 'rifle'), 0);
    assert.equal(game.state.industry.crafted.rifle, 0);
    if (cause === 'draft') issue(game, 'draft', { id: worker.id, value: true });
    if (cause === 'bill') bill(game, 'rifle', 0, 'count', true);
    advance(game, 0.5);
    for (const [type, n] of Object.entries(recipe.cost)) assert.equal(total(game, type), n, `${cause}: cleanup must not refund twice`);
    assert.doesNotThrow(() => ColonyGame.fromJSON(game.toJSON()), `${cause}: no orphan station or input references may remain`);
  }
});

test('mid-material-delivery and mid-craft saves reproduce the same complete future', () => {
  for (const phase of ['deliver', 'work']) {
    const { game, worker } = craftFixture('rifle', 1, 24);
    until(game, () => worker.job?.type === 'craft' && (phase === 'deliver'
      ? worker.carry?.source === 'craft' && Object.values(worker.job.materials).some(n => n > 0)
      : worker.job.stage === 'work' && worker.job.progress > 0), 120, `the craft job should reach ${phase}`);
    game.update(0.037);
    const data = game.toJSON();
    const restored = ColonyGame.fromJSON(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(restored.toJSON(), data);
    for (const dt of [0.03, 0.27, 0.6, 1.4, 3.1, 8.7]) { game.update(dt); restored.update(dt); }
    assert.deepEqual(restored.toJSON(), game.toJSON(), `${phase}: inputs, reservations, progress, and RNG must survive`);
  }
});

test('a purchase satisfying a maintain bill safely cancels its in-progress craft without duplicating output or losing staged inputs', () => {
  const game = sandbox({ steel: 8, wood: 4, silver: 55 });
  game.state.trade.nextVisitAt = 0;
  until(game, () => game.state.trade.visitor?.phase === 'trading', 60, 'the merchant must arrive before the comparison');
  const worker = game.state.colonists[0];
  placeFixture(game, 'workbench', 24, 14);
  setWork(game, worker, { craft: 1 });
  bill(game, 'tool', 1, 'maintain');
  until(game, () => worker.job?.type === 'craft' && worker.job.stage === 'work', 80, 'all recipe inputs must be staged');
  const traderId = game.state.trade.visitor.id;
  issue(game, 'trade', { traderId, side: 'buy', type: 'tool', count: 1 });
  const snapshot = game.toJSON(), restored = ColonyGame.fromJSON(snapshot);
  assert.deepEqual(restored.toJSON(), snapshot, 'the brief over-target state after a valid purchase is loadable');
  advance(game, 1); advance(restored, 1);
  assert.deepEqual(restored.toJSON(), game.toJSON());
  assert.notEqual(worker.job?.type, 'craft');
  assert.equal(total(game, 'tool'), 1);
  assert.equal(game.state.industry.crafted.tool, 0);
  assert.equal(total(game, 'steel'), 8);
  assert.equal(total(game, 'wood'), 4);
  advance(game, 3);
  assert.equal(total(game, 'tool'), 1);
  assert.equal(total(game, 'steel'), 8);
  assert.equal(total(game, 'wood'), 4);
});
