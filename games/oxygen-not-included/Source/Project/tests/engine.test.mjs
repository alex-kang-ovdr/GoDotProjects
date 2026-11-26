import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, BUILDINGS, WORLD_W, WORLD_H, CYCLE_SECONDS } from '../../../Web/engine.js';

import { clone, at, buildingAt, finiteState, advance, until, nearestSite, plan, frontierDig } from './helpers.mjs';

test('new colony has finite stores, three distinct crew, a usable world and objectives', () => {
  const game = new Game(73, 'breath-4.1');
  assert.equal(game.w, WORLD_W);
  assert.equal(game.h, WORLD_H);
  assert.equal(game.crew.length, 3);
  assert.equal(new Set(game.crew.map(c => c.id)).size, 3);
  assert.equal(new Set(game.crew.map(c => c.name)).size, 3);
  for (const key of ['rock', 'metal', 'algae', 'coal', 'water', 'food']) {
    assert.ok(game.resources[key] > 0, `initial ${key} is available`);
  }
  assert.ok(game.objectives.length >= 6);
  for (const id of ['dig', 'oxygen', 'battery', 'farms', 'research', 'survive']) {
    assert.ok(game.objectives.some(o => o.id === id), `the original ${id} milestone is retained`);
  }
  assert.equal(game.lost, false);
  assert.equal(game.won, false);
  assert.ok(game.cells.some(c => c.solid && c.revealed));
  assert.ok(game.cells.some(c => !c.solid && c.oxygen > 0));
  finiteState(game);
});

test('placement queries are read-only and invalid commands do not spend resources', () => {
  const game = new Game(73, 'breath-4.1');
  const before = clone(game.serialize());
  const site = nearestSite(game, 'farm');
  game.canPlace('farm', site.x, site.y);
  game.canPlace('farm', -1, -1);
  assert.deepEqual(game.serialize(), before, 'hovering/querying placement must not mutate state');
  const resources = clone(game.resources), tasks = clone(game.tasks), buildings = clone(game.buildings);
  for (const [tool, x, y] of [['farm', -1, -1], ['dig', game.w, game.h], ['not-a-tool', 1, 1]]) {
    const result = game.queue(tool, x, y);
    assert.equal(result.ok, false);
    assert.ok(typeof result.message === 'string' && result.message.length > 0);
  }
  assert.deepEqual(game.resources, resources);
  assert.deepEqual(game.tasks, tasks);
  assert.deepEqual(game.buildings, buildings);
});

test('construction reserves its cost once and cancelling a blueprint refunds it once', () => {
  const game = new Game(73, 'breath-4.1');
  const site = nearestSite(game, 'farm');
  const before = clone(game.resources);
  assert.ok(game.queue('farm', site.x, site.y).ok);
  for (const [resource, cost] of Object.entries(BUILDINGS.farm.cost)) {
    assert.equal(game.resources[resource], before[resource] - cost);
  }
  const paid = clone(game.resources), taskCount = game.tasks.length;
  game.queue('farm', site.x, site.y);
  assert.deepEqual(game.resources, paid, 'repeating a drag cannot charge twice');
  assert.equal(game.tasks.length, taskCount, 'repeating a drag cannot create duplicate work');
  assert.ok(game.queue('cancel', site.x, site.y).ok);
  assert.equal(buildingAt(game, site.x, site.y), undefined);
  assert.ok(!game.tasks.some(t => t.x === site.x && t.y === site.y));
  assert.deepEqual(game.resources, before, 'unbuilt construction is fully refundable');
  game.queue('cancel', site.x, site.y);
  assert.deepEqual(game.resources, before, 'cancelling again cannot mint resources');
});

test('a queued dig is performed by crew and opens the terrain', () => {
  const game = new Game(73, 'breath-4.1');
  const site = frontierDig(game);
  assert.ok(at(game, site.x, site.y).solid);
  const completed = game.stats.completedDigs;
  assert.ok(game.queue('dig', site.x, site.y).ok);
  const count = game.tasks.length;
  game.queue('dig', site.x, site.y);
  assert.equal(game.tasks.length, count);
  until(game, () => !at(game, site.x, site.y).solid, CYCLE_SECONDS * 2, 'crew never completed reachable dig');
  assert.ok(game.stats.completedDigs > completed);
  assert.ok(!game.tasks.some(t => t.type === 'dig' && t.x === site.x && t.y === site.y));
  finiteState(game);
});

test('a reachable blueprint is built and completed demolition returns only part of its cost', () => {
  const game = new Game(73, 'breath-4.1');
  const b = plan(game, 'cot');
  assert.ok(b.progress < 1, 'a blueprint is not instantly built');
  until(game, () => b.progress >= 1, CYCLE_SECONDS * 2, 'crew never completed reachable construction');
  assert.ok(game.stats.completedBuilds >= 1);
  const rockBefore = game.resources.rock;
  assert.ok(game.queue('deconstruct', b.x, b.y).ok);
  until(game, () => !game.buildings.some(item => item.id === b.id), CYCLE_SECONDS, 'demolition never completed');
  const returned = game.resources.rock - rockBefore;
  assert.ok(returned > 0 && returned < BUILDINGS.cot.cost.rock, 'completed buildings have a partial salvage refund');
  finiteState(game);
});

test('wire placement is immediate, idempotent and removable without a worker', () => {
  const game = new Game(73, 'breath-4.1');
  const site = nearestSite(game, 'wire');
  assert.equal(at(game, site.x, site.y).wire, false);
  const before = game.resources.metal, taskCount = game.tasks.length;
  assert.ok(game.queue('wire', site.x, site.y).ok);
  assert.equal(at(game, site.x, site.y).wire, true);
  assert.ok(game.resources.metal < before);
  assert.equal(game.tasks.length, taskCount);
  const after = game.resources.metal;
  game.queue('wire', site.x, site.y);
  assert.equal(game.resources.metal, after);
  assert.ok(game.queue('deconstruct', site.x, site.y).ok);
  assert.equal(at(game, site.x, site.y).wire, false);
  assert.equal(game.resources.metal, before);
});

test('connected life support consumes algae, manual work generates power, and a battery stores surplus', () => {
  const game = new Game(73, 'breath-4.1');
  const diffuser = plan(game, 'diffuser', { wired: true });
  const battery = plan(game, 'battery', { wired: true });
  let previousAlgae = game.resources.algae;
  let generated = false, diffused = false, stored = false, staffed = false, consumedAlgae = false;
  advance(game, CYCLE_SECONDS * 2, () => {
    generated ||= game.power.production > 0;
    diffused ||= diffuser.active;
    consumedAlgae ||= diffuser.active && game.resources.algae < previousAlgae - 1e-8;
    previousAlgae = game.resources.algae;
    stored ||= game.power.stored > 0;
    staffed ||= game.buildings.filter(b => b.type === 'generator' && b.active).some(b =>
      game.crew.some(c => c.health > 0 && Math.hypot(c.x - b.x - 0.5, c.y - b.y - 0.5) < 2.1));
  });
  assert.equal(diffuser.progress, 1);
  assert.equal(battery.progress, 1);
  assert.equal(diffuser.connected, true);
  assert.equal(battery.connected, true);
  assert.ok(generated && staffed, 'manual generation requires a nearby operating crew member');
  assert.ok(diffused, 'powered diffuser should operate');
  assert.ok(stored, 'battery should buffer surplus energy');
  assert.ok(consumedAlgae, 'active oxygen production consumes algae even when milestone rewards replenish stores');
  finiteState(game);
});

test('a device joins and leaves the power network when its connecting wires are built and removed', () => {
  const game = new Game(73, 'breath-4.1');
  const around = (x, y) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
  let target;
  // Use a free portion of the real starting bus; only ordinary wire commands alter topology.
  for (let y = 1; y < game.h - 1 && !target; y++) {
    for (let x = 1; x < game.w - 1 && !target; x++) {
      if (!at(game, x, y).wire || !game.canPlace('diffuser', x, y).ok) continue;
      const bridges = around(x, y).filter(([nx, ny]) => at(game, nx, ny)?.wire);
      if (bridges.length && bridges.every(([nx, ny]) => !buildingAt(game, nx, ny))) {
        target = { x, y, bridges };
      }
    }
  }
  assert.ok(target, 'starting bus has an unused location with removable neighboring wires');
  assert.ok(game.queue('deconstruct', target.x, target.y).ok);
  assert.ok(game.queue('diffuser', target.x, target.y).ok);
  const device = buildingAt(game, target.x, target.y);
  until(game, () => device.progress >= 1, CYCLE_SECONDS * 2);
  assert.equal(device.connected, false, 'a nearby generator alone does not connect a device');
  assert.ok(game.queue('wire', target.x, target.y).ok);
  advance(game, 2);
  assert.equal(device.connected, true);
  for (const [x, y] of target.bridges) assert.ok(game.queue('deconstruct', x, y).ok);
  advance(game, 2);
  assert.equal(device.connected, false, 'an isolated wire cannot supply a device');
  assert.equal(device.active, false);
  const algae = game.resources.algae;
  advance(game, 5);
  assert.equal(game.resources.algae, algae, 'disconnected life support cannot consume fuel');
  finiteState(game);
});

test('a healthy starting farm uses water and a crew harvest adds usable food', () => {
  const game = new Game(73, 'breath-4.1');
  assert.ok(game.buildings.some(b => b.type === 'farm' && b.progress >= 1), 'starter farm exists');
  const waterBefore = game.resources.water;
  let previousFood = game.resources.food, producedFood = false;
  advance(game, CYCLE_SECONDS * 2, () => {
    producedFood ||= game.resources.food > previousFood + 1e-6;
    previousFood = game.resources.food;
  });
  assert.ok(game.resources.water < waterBefore, 'farm growth consumes water');
  assert.ok(producedFood, 'farm output enters shared food stores without construction/objective rewards');
  assert.equal(game.crew.filter(c => c.health > 0).length, 3);
  finiteState(game);
});

test('save/load preserves an in-progress colony and malformed saves leave it unchanged', () => {
  const game = new Game(73, 'breath-4.1');
  plan(game, 'battery', { wired: true });
  const dig = frontierDig(game);
  game.queue('dig', dig.x, dig.y);
  advance(game, 1.2);
  const saved = clone(game.serialize());
  const restored = new Game(91, 'breath-4.1');
  assert.notEqual(restored.load(clone(saved)), false);
  assert.deepEqual(restored.serialize(), saved, 'save round-trip preserves tasks, world, crew and resources');
  const mutations = [
    value => { value.version = -1; },
    value => { value.cells.pop(); },
    value => { value.resources.rock = -1; },
    value => { value.resources.food = NaN; },
    value => { value.crew[0].x = Infinity; },
    value => { delete value.power; },
    value => { delete value.alerts; },
    value => { delete value.objectives[0].target; },
    value => { value.crew[0]._job = { kind: 'eat', path: [] }; },
    value => { value._nextId = 1; },
  ];
  for (const mutate of mutations) {
    const invalid = clone(saved);
    mutate(invalid);
    const before = clone(restored.serialize());
    let rejected = false;
    try { rejected = restored.load(invalid) === false; }
    catch (error) {
      assert.ok(error instanceof Error && error.message.length > 0, 'save error explains the rejection');
      rejected = true;
    }
    assert.ok(rejected, 'malformed save must be rejected');
    assert.deepEqual(restored.serialize(), before, 'failed load must be atomic');
  }
  advance(restored, 5);
  finiteState(restored);
});

test('the starting colony can reach the settlement milestones through real work', () => {
  const game = new Game(73, 'breath-4.1');
  const plans = [plan(game, 'diffuser', { wired: true }), plan(game, 'battery', { wired: true })];
  while (game.buildings.filter(b => b.type === 'farm').length < 4) plans.push(plan(game, 'farm', { wired: true }));
  plans.push(plan(game, 'research', { wired: true }));
  // v2 farms and research need a physical supply route, including the lower floor.
  if (game.version >= 2) {
    for (const b of plans.filter(b => ['farm', 'research'].includes(b.type))) {
      for (let x = Math.min(23, b.x); x <= Math.max(24, b.x); x++) {
        if (!at(game, x, b.y).pipe) assert.ok(game.queue('pipe', x, b.y).ok);
      }
      for (let y = 11; y <= b.y; y++) {
        if (!at(game, 23, y).pipe) assert.ok(game.queue('pipe', 23, y).ok);
      }
    }
  }
  until(game, () => plans.every(b => b.progress >= 1), CYCLE_SECONDS * 3, 'core infrastructure did not finish');
  for (let i = 0; i < 12; i++) {
    const target = frontierDig(game);
    assert.ok(game.queue('dig', target.x, target.y).ok);
    until(game, () => !at(game, target.x, target.y).solid, CYCLE_SECONDS,
      `colony stopped completing reachable dig ${i + 1}/12`);
  }
  const settlement = game.objectives.filter(o => !o.stage || o.stage === 1);
  until(game, () => settlement.every(o => o.done), CYCLE_SECONDS * 8,
    'normal colony setup could not complete the settlement loop');
  assert.ok(settlement.every(o => o.done));
  assert.equal(game.crew.filter(c => c.health > 0).length, 3);
  assert.equal(game.lost, false);
  advance(game, CYCLE_SECONDS * 2, (state, tick) => { if (tick % 100 === 0) finiteState(state); });
  finiteState(game);
});
