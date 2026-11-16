import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ColonyGame } from '../dist/engine.js';
import { sandbox, placeFixture, issue, setWork, until } from './helpers.mjs';

const V3 = new URL('./fixtures/v3-colony.json', import.meta.url);
const HASH = 'b5e4aca65d24333ec7147799c73082e31de38ea23c8a5deec82f30781e906e2c';

function preserved(original, current, path = '') {
  if (original === null || typeof original !== 'object') { assert.deepEqual(current, original, path); return; }
  if (Array.isArray(original)) assert.equal(current.length, original.length, `${path}.length`);
  for (const [key, value] of Object.entries(original)) {
    if (!path && key === 'version') continue;
    preserved(value, current[key], path ? `${path}.${key}` : key);
  }
}

function defaults(game, time) {
  for (const type of ['silver', 'tool', 'armor', 'rifle']) assert.equal(game.state.resources[type], 0);
  for (const recipe of ['tool', 'armor', 'rifle']) {
    assert.deepEqual(game.state.industry.bills[recipe], { mode: 'count', target: 0, paused: false });
    assert.equal(game.state.industry.crafted[recipe], 0);
  }
  for (const pawn of game.state.colonists) {
    assert.deepEqual(pawn.equipment, { weapon: null, armor: null, tool: null });
    assert.equal(pawn.skills.craft, { 서윤: 10, 도현: 7, 미나: 6 }[pawn.name]);
    assert.equal(pawn.priorities.craft, 3);
  }
  assert.deepEqual(game.state.trade, { nextVisitAt: time + 80, visits: 0, visitor: null,
    stats: { bought: 0, sold: 0, earned: 0, spent: 0 } });
}

test('the genuine v3 release migrates without changing its mid-job world, schedules, RNG, or immutable fixture', () => {
  const bytes = readFileSync(V3);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), HASH);
  const original = JSON.parse(bytes), callerCopy = structuredClone(original);
  const game = ColonyGame.fromJSON(original);
  assert.equal(game.state.version, 4);
  preserved(original, game.toJSON());
  assert.deepEqual(original, callerCopy);
  defaults(game, original.time);
  assert.ok(game.state.colonists.some(c => c.carry?.source === 'construction'));
  assert.equal(game.state.hazards.nextIncidentAt, original.hazards.nextIncidentAt);
  const restored = ColonyGame.fromJSON(game.toJSON());
  for (const dt of [0.03, 0.47, 0.2, 1.3, 4.1, 0.12]) { game.update(dt); restored.update(dt); }
  assert.deepEqual(restored.toJSON(), game.toJSON());
  assert.equal(createHash('sha256').update(readFileSync(V3)).digest('hex'), HASH);
  const fresh = new ColonyGame({ seed: 314159 });
  assert.equal(fresh.state.resources.silver, 60);
  assert.equal(fresh.state.tiles.some(t => t.building?.type === 'workbench'), false);
});

test('legacy payloads cannot inject future economy, equipment, crafting skill, or visiting traders', () => {
  const original = JSON.parse(readFileSync(V3));
  Object.assign(original.resources, { silver: -1, rifle: Number.NaN, tool: 900, armor: 900 });
  original.industry = { bills: { tool: { mode: 'count', target: 99, paused: true } }, crafted: { tool: 1000 } };
  original.trade = { nextVisitAt: 0, visits: 900, visitor: { id: 'injected' }, stats: { earned: 1e9 } };
  for (const pawn of original.colonists) {
    pawn.equipment = { weapon: 'rifle', armor: 'armor', tool: 'tool' };
    pawn.skills.craft = 999; pawn.priorities.craft = -1;
  }
  const callerCopy = structuredClone(original), game = ColonyGame.fromJSON(original);
  defaults(game, original.time);
  assert.equal(game.state.time, original.time);
  assert.equal(game.state.rngState, original.rngState);
  assert.equal(game.state.nextId, original.nextId);
  assert.deepEqual(original, callerCopy, 'sanitizing legacy additions must happen on a clone');
  assert.doesNotThrow(() => ColonyGame.fromJSON(game.toJSON()));
});

test('v4 saves reject missing or impossible industry, equipment, material ownership, and trade states', () => {
  const valid = new ColonyGame({ seed: 314159 }).toJSON();
  for (const mutate of [
    s => { delete s.resources.silver; }, s => { s.resources.tool = 0.5; },
    s => { delete s.industry; }, s => { s.industry.bills.tool.target = 100; },
    s => { s.industry.bills.tool.paused = 1; }, s => { s.industry.bills.missing = { mode: 'count', target: 1, paused: false }; },
    s => { s.industry.crafted.rifle = -1; }, s => { s.colonists[0].equipment.weapon = 'armor'; },
    s => { delete s.colonists[0].equipment; }, s => { s.colonists[0].equipment.extra = null; },
    s => { delete s.trade; }, s => { s.trade.stats.earned = -1; }, s => { s.trade.nextVisitAt = Number.NaN; },
  ]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => ColonyGame.fromJSON(bad));
  }
  const craft = sandbox({ steel: 18, wood: 8 }), worker = craft.state.colonists[0];
  placeFixture(craft, 'workbench', 25, 14); setWork(craft, worker, { craft: 1 });
  issue(craft, 'bill', { recipeId: 'rifle', mode: 'count', target: 1, paused: false });
  until(craft, () => worker.carry?.source === 'craft', 30, 'load validation needs a real material delivery snapshot');
  const carrying = craft.toJSON();
  for (const mutate of [
    s => { s.colonists[0].carry.benchId = 'missing'; },
    s => { s.colonists[0].job.materials.steel = 18; },
    s => { s.colonists[0].job.materials.wood = -1; },
    s => { s.colonists[0].job.recipeId = 'missing'; },
    s => { s.industry.bills.rifle.paused = true; },
    s => { delete s.reservations[s.colonists[0].job.key]; },
  ]) { const bad = structuredClone(carrying); mutate(bad); assert.throws(() => ColonyGame.fromJSON(bad)); }
  const visiting = sandbox(); visiting.state.trade.nextVisitAt = 0;
  until(visiting, () => visiting.state.trade.visitor?.phase === 'trading', 60, 'load validation needs a real visitor');
  for (const mutate of [
    v => { v.stock.steel = -1; }, v => { v.stock.tool = 1.5; }, v => { v.silver = -1; },
    v => { v.leavesAt += 1; }, v => { v.id = 'trader_stale'; },
    v => { v.path = [{ x: 1, y: 1 }]; }, v => { v.x += 1; },
  ]) { const bad = visiting.toJSON(); mutate(bad.trade.visitor); assert.throws(() => ColonyGame.fromJSON(bad)); }
});
