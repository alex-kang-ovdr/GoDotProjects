import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame } from '../dist/engine.js';
import { issue, setWork, total, until, assertResourceNumbers } from './helpers.mjs';

// This acceptance test never rewrites resources, pawn positions, work progress,
// schedules, visitor state, clock, RNG, or any other authoritative state.
test('a fresh default colony builds, crafts, hauls, sells, banks the proceeds, buys, and equips through public commands', () => {
  const game = new ColonyGame({ seed: 314159, difficulty: 'standard' });
  const [crafter, hauler, helper] = game.state.colonists;
  for (const pawn of game.state.colonists) issue(game, 'schedulePreset', { id: pawn.id, preset: 'free' });
  setWork(game, crafter, { build: 1, craft: 1 });
  setWork(game, hauler, { haul: 1 });
  setWork(game, helper, { doctor: 1, haul: 1 });
  issue(game, 'autoCook', { value: false });
  issue(game, 'build', { kind: 'workbench', x: 24, y: 15 });
  issue(game, 'bill', { recipeId: 'tool', mode: 'count', target: 1, paused: false });
  let sawMaterialTrip = false, sawLooseProduct = false;
  until(game, () => game.state.resources.tool === 1, 75, 'construction, inputs, work, and product hauling must all complete', () => {
    if (crafter.carry?.source === 'craft') sawMaterialTrip = true;
    if (game.state.items.some(i => i.type === 'tool')) sawLooseProduct = true;
    assertResourceNumbers(game);
  });
  assert.ok(game.tile(24, 15).building?.complete);
  assert.equal(game.state.industry.crafted.tool, 1);
  assert.equal(sawMaterialTrip, true);
  assert.equal(sawLooseProduct, true);
  until(game, () => game.state.trade.visitor?.phase === 'trading', 80, 'the scheduled trader must arrive by walking');
  const trader = game.state.trade.visitor;
  const command = (side, type, count) => issue(game, 'trade', { traderId: trader.id, side, type, count });
  command('sell', 'tool', 1);
  command('sell', 'wood', 10);
  assert.equal(game.state.resources.silver, 60, 'a sale creates local proceeds, not instant warehouse credit');
  assert.equal(total(game, 'silver'), 104);
  assert.equal(game.command('trade', { traderId: trader.id, side: 'buy', type: 'rifle', count: 1 }).ok, false);
  until(game, () => game.state.resources.silver === 104, 40, 'sale proceeds must be physically banked');
  command('buy', 'rifle', 1);
  assert.equal(game.state.resources.silver, 4);
  assert.equal(game.state.resources.rifle, 0);
  assert.equal(total(game, 'rifle'), 1);
  assert.equal(game.command('equip', { id: crafter.id, item: 'rifle' }).ok, false,
    'a just-purchased weapon remains unavailable until it reaches storage');
  until(game, () => game.state.resources.rifle === 1, 35, 'the purchased weapon must reach storage');
  issue(game, 'equip', { id: crafter.id, item: 'rifle' });
  until(game, () => crafter.equipment.weapon === 'rifle', 20, 'a real equipment job must equip the purchase');
  assert.equal(total(game, 'rifle'), 1);
  assert.equal(game.state.resources.rifle, 0);
  assert.equal(game.state.trade.stats.sold, 11);
  assert.equal(game.state.trade.stats.earned, 44);
  assert.equal(game.state.trade.stats.spent, 100);
  assert.equal(game.state.colonists.filter(c => !c.dead).length, 3);
  assert.ok(game.state.time < 180, 'the entire exchange fits inside the first natural visit');
  assertResourceNumbers(game);
  assert.doesNotThrow(() => ColonyGame.fromJSON(game.toJSON()));
});
