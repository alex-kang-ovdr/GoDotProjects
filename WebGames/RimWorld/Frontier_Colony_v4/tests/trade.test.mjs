import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame, BUILDINGS } from '../dist/engine.js';
import { initializeTrade, updateTrade } from '../dist/trade.js';
import { sandbox, placeFixture, issue, setWork, total, advance, until, assertResourceNumbers } from './helpers.mjs';

function tradeClock(game, seconds) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.5) {
    const dt = Math.min(0.5, remaining);
    game.state.time += dt;
    updateTrade(game, dt);
  }
}

function visit(resources = {}) {
  const game = sandbox(resources);
  game.state.trade.nextVisitAt = 0;
  until(game, () => game.state.trade.visitor?.phase === 'trading', 60, 'the visitor must physically arrive');
  return game;
}

const payload = (game, side, type, count) => ({ traderId: game.state.trade.visitor.id, side, type, count });

function unchangedFailure(game, command) {
  const before = game.toJSON();
  assert.equal(game.command('trade', command).ok, false, JSON.stringify(command));
  assert.deepEqual(game.toJSON(), before, 'a rejected trade must preserve currency, goods, cargo, jobs, reservations, and RNG');
}

test('a trader walks to the colony, stays 100 simulation seconds, leaves, and schedules another visit without consuming colony RNG', () => {
  const game = sandbox();
  game.state.trade.nextVisitAt = 80;
  const before = game.toJSON();
  initializeTrade(game);
  assert.deepEqual(game.toJSON(), before, 'reading or reinitializing a complete trade state is inert');
  const rng = game.state.rngState;
  tradeClock(game, 79.5);
  assert.equal(game.state.trade.visitor, null);
  tradeClock(game, 0.5);
  const visitor = game.state.trade.visitor;
  assert.equal(visitor.phase, 'arriving');
  assert.ok(visitor.x > game.state.width - 2);
  assert.equal(visitor.arrivedAt, null);
  assert.equal(visitor.silver, 180);
  assert.deepEqual(visitor.stock, { wood: 30, steel: 24, rawfood: 16, meals: 10, medicine: 6, tool: 2, armor: 2, rifle: 2 });
  const firstX = visitor.x;
  tradeClock(game, 1);
  assert.ok(visitor.x < firstX || visitor.y !== visitor.entry.y + 0.5);
  for (let i = 0; visitor.phase !== 'trading' && i < 100; i++) tradeClock(game, 0.5);
  assert.equal(visitor.phase, 'trading');
  assert.equal(visitor.x, visitor.meeting.x + 0.5);
  assert.equal(visitor.y, visitor.meeting.y + 0.5);
  assert.equal(visitor.leavesAt - visitor.arrivedAt, 100);
  tradeClock(game, 99.5);
  assert.equal(visitor.phase, 'trading');
  tradeClock(game, 0.5);
  assert.equal(visitor.phase, 'leaving');
  for (let i = 0; game.state.trade.visitor && i < 100; i++) tradeClock(game, 0.5);
  assert.equal(game.state.trade.visitor, null);
  assert.equal(game.state.trade.nextVisitAt - game.state.time, 220);
  assert.equal(game.state.trade.visits, 1);
  assert.equal(game.state.rngState, rng);
});

test('buying and selling conserve both sides, use fixed prices, and deliver goods and proceeds on the ground', () => {
  const game = visit({ silver: 60, wood: 10 });
  const trader = game.state.trade.visitor;
  const money = total(game, 'silver') + trader.silver;
  const woods = total(game, 'wood') + trader.stock.wood;
  issue(game, 'trade', payload(game, 'sell', 'wood', 10));
  assert.equal(game.state.resources.wood, 0);
  assert.equal(trader.stock.wood, 40);
  assert.equal(trader.silver, 170);
  assert.equal(game.state.resources.silver, 60);
  assert.equal(total(game, 'silver'), 70);
  assert.equal(total(game, 'wood') + trader.stock.wood, woods);
  assert.equal(total(game, 'silver') + trader.silver, money);
  issue(game, 'trade', { ...payload(game, 'buy', 'tool', 1), price: 0, total: 0 });
  assert.equal(game.state.resources.silver, 5, 'client-supplied price fields cannot discount the fixed price');
  assert.equal(game.state.resources.tool, 0);
  assert.equal(total(game, 'tool'), 1);
  assert.equal(trader.stock.tool, 1);
  assert.equal(trader.silver, 225);
  assert.ok(game.state.items.some(i => i.type === 'tool' && i.x === Math.floor(trader.x) && i.y === Math.floor(trader.y)));
  issue(game, 'trade', payload(game, 'buy', 'rawfood', 1));
  const food = game.state.items.find(i => i.type === 'rawfood');
  assert.equal(food.freshness, 1);
  assert.equal(game.state.resources.rawfood, 0);
  assert.equal(game.state.resources.silver, 2);
  assert.equal(total(game, 'silver') + trader.silver, money);
  unchangedFailure(game, payload(game, 'buy', 'meals', 1));
  unchangedFailure(game, payload(game, 'sell', 'rawfood', 1));
  assert.deepEqual(game.state.trade.stats, { bought: 2, sold: 10, earned: 10, spent: 58 });
  advance(game, 3);
  assert.ok(food.freshness < 1 && food.freshness > 0, 'fresh purchases join the existing decay system');
  assertResourceNumbers(game);
});

test('invalid, stale, unsafe, unaffordable, and unreachable trade requests are atomic', () => {
  const source = visit({ silver: 60, wood: 100 });
  const valid = payload(source, 'buy', 'wood', 1);
  for (const change of [
    { traderId: 'trader_old' }, { side: 'exchange' }, { type: 'silver' },
    { count: 0 }, { count: -1 }, { count: 1.5 }, { count: Number.NaN }, { count: 101 },
    { type: 'rifle' }, { count: 31 },
  ]) unchangedFailure(source, { ...valid, ...change });
  for (const change of [
    game => { game.state.trade.visitor.silver = 0; },
    game => { game.state.time = game.state.trade.visitor.leavesAt; },
    game => { game.state.activeRaid = true; },
    game => { for (const pawn of game.state.colonists) issue(game, 'draft', { id: pawn.id, value: true }); },
    game => { for (const tile of game.state.tiles) if (tile.zone === 'stockpile') tile.zone = null; },
    game => { const v = game.state.trade.visitor; issue(game, 'ignite', { x: Math.floor(v.x), y: Math.floor(v.y), strength: 0.5 }); },
    game => { const v = game.state.trade.visitor, x = Math.floor(v.x), y = Math.floor(v.y); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) placeFixture(game, 'wall', x + dx, y + dy); },
  ]) {
    const game = ColonyGame.fromJSON(source.toJSON()); change(game);
    unchangedFailure(game, payload(game, 'sell', 'wood', 1));
  }
  const arriving = sandbox({ silver: 60 }); arriving.state.trade.nextVisitAt = 0; advance(arriving, 0.5);
  assert.equal(arriving.state.trade.visitor.phase, 'arriving');
  unchangedFailure(arriving, payload(arriving, 'buy', 'wood', 1));
  issue(source, 'trade', payload(source, 'buy', 'tool', 1));
  unchangedFailure(source, payload(source, 'buy', 'tool', 1));
  const lastStock = visit({ silver: 300 });
  issue(lastStock, 'trade', payload(lastStock, 'buy', 'rifle', 1));
  issue(lastStock, 'trade', payload(lastStock, 'buy', 'rifle', 1));
  unchangedFailure(lastStock, payload(lastStock, 'buy', 'rifle', 1));
  assert.equal(total(lastStock, 'rifle'), 2);
  assert.equal(lastStock.state.resources.silver, 100, 'the last rejection must not charge a third purchase');
});

test('trade cannot sell staged, carried, equipped, loose, or prepaid materials while crafting remains active', () => {
  const game = visit({ steel: 16, tool: 1, wood: 8 });
  const [crafter, wearer] = game.state.colonists;
  placeFixture(game, 'workbench', 28, 14);
  setWork(game, crafter, { craft: 1 });
  issue(game, 'bill', { recipeId: 'armor', mode: 'count', target: 1, paused: false });
  issue(game, 'equip', { id: wearer.id, item: 'tool' });
  until(game, () => crafter.job?.type === 'craft' && crafter.job.materials.steel > 0
    && crafter.carry?.source === 'craft', 80, 'some steel must be staged and the last steel carried');
  assert.equal(game.state.resources.steel, 0);
  assert.equal(total(game, 'steel'), 16);
  assert.equal(wearer.equipment.tool, 'tool');
  unchangedFailure(game, payload(game, 'sell', 'steel', 1));
  unchangedFailure(game, payload(game, 'sell', 'tool', 1));
  issue(game, 'build', { kind: 'wall', x: 25, y: 17 });
  const available = 8 - BUILDINGS.wall.cost.wood;
  assert.equal(game.state.resources.wood, available);
  issue(game, 'trade', payload(game, 'sell', 'wood', available));
  unchangedFailure(game, payload(game, 'sell', 'wood', 1));
  assert.equal(crafter.job?.type, 'craft', 'an unrelated successful sale must not cancel the material queue');
  issue(game, 'draft', { id: crafter.id, value: true });
  assert.equal(total(game, 'steel'), 16);
  unchangedFailure(game, payload(game, 'sell', 'steel', 1));
  issue(game, 'unequip', { id: wearer.id, slot: 'tool' });
  unchangedFailure(game, payload(game, 'sell', 'tool', 1));
});

test('sale proceeds use hundred-unit silver hauling and remain owned after the merchant departs', () => {
  const game = visit({ rifle: 2 });
  const trader = game.state.trade.visitor, hauler = game.state.colonists[0];
  issue(game, 'trade', payload(game, 'sell', 'rifle', 2));
  assert.equal(trader.silver, 36);
  assert.equal(total(game, 'silver'), 144);
  assert.equal(game.state.resources.silver, 0);
  setWork(game, hauler, { haul: 1 });
  until(game, () => hauler.carry?.type === 'silver', 30, 'the real hauler must pick up the sale proceeds');
  assert.equal(hauler.carry.count, 100);
  assert.equal(game.state.items.filter(i => i.type === 'silver').reduce((n, i) => n + i.count, 0), 44);
  assert.equal(total(game, 'silver'), 144);
  until(game, () => game.state.resources.silver === 144, 40, 'both real silver loads must reach storage', () => assert.equal(total(game, 'silver'), 144));
  setWork(game, hauler, {});
  issue(game, 'trade', payload(game, 'buy', 'rifle', 1));
  const bought = game.state.items.find(i => i.type === 'rifle');
  assert.ok(bought);
  game.state.activeRaid = true;
  unchangedFailure(game, payload(game, 'buy', 'wood', 1));
  tradeClock(game, 0.5);
  assert.equal(trader.phase, 'leaving');
  for (let i = 0; game.state.trade.visitor && i < 100; i++) tradeClock(game, 0.5);
  assert.equal(game.state.trade.visitor, null);
  assert.ok(game.state.items.includes(bought), 'departing NPC must not delete player-owned deliveries');
  assert.equal(total(game, 'rifle'), 1);
  assert.equal(total(game, 'silver'), 44);
});

test('blocked visits terminate, fire closes trade immediately, and mid-visit saves reproduce the complete future', () => {
  const blocked = sandbox(); blocked.state.trade.nextVisitAt = 0; advance(blocked, 1);
  const traveler = blocked.state.trade.visitor, x = Math.floor(traveler.x), y = Math.floor(traveler.y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (blocked.tile(x + dx, y + dy)) placeFixture(blocked, 'wall', x + dx, y + dy);
  tradeClock(blocked, 35);
  assert.equal(blocked.state.trade.visitor, null, 'a permanently enclosed traveler cannot retry forever');
  assert.ok(blocked.state.trade.nextVisitAt > blocked.state.time);
  const game = visit({ silver: 60 });
  const v = game.state.trade.visitor;
  issue(game, 'ignite', { x: v.meeting.x, y: v.meeting.y, strength: 0.5 });
  unchangedFailure(game, payload(game, 'buy', 'wood', 1));
  tradeClock(game, 0.5);
  assert.equal(v.phase, 'leaving');
  for (const phase of ['arriving', 'trading', 'leaving']) {
    const original = sandbox({ silver: 60 }); original.state.trade.nextVisitAt = 0;
    until(original, () => original.state.trade.visitor?.phase === (phase === 'arriving' ? 'arriving' : 'trading'), 60, `reach ${phase}`);
    if (phase === 'trading') issue(original, 'trade', payload(original, 'buy', 'steel', 2));
    if (phase === 'leaving') {
      tradeClock(original, 100);
      assert.equal(original.state.trade.visitor.phase, 'leaving');
    }
    original.update(0.037);
    const data = original.toJSON(), restored = ColonyGame.fromJSON(JSON.parse(JSON.stringify(data)));
    assert.deepEqual(restored.toJSON(), data);
    for (const dt of [0.03, 0.47, 0.25, 1.7, 3.4, 7.3]) { original.update(dt); restored.update(dt); }
    assert.deepEqual(restored.toJSON(), original.toJSON(), `${phase}: exact visitor, cargo, fixed-step remainder, and RNG`);
  }
});
