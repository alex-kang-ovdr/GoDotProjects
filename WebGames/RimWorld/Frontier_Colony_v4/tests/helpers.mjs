import assert from 'node:assert/strict';
import { ColonyGame, BUILDINGS, JOB_LABELS, RESOURCE_LABELS } from '../dist/engine.js';
import { depositStock, refreshSystems, updateSystems } from '../dist/colony-systems.js';

export const STEP = 0.25;
export const WORK_TYPES = Object.keys(JOB_LABELS);
export const RESOURCE_TYPES = Object.keys(RESOURCE_LABELS);

export function issue(game, type, payload = {}) {
  const result = game.command(type, payload);
  assert.equal(result?.ok, true, `${type} ${JSON.stringify(payload)}: ${result?.message}`);
  assert.equal(typeof result.message, 'string');
  return result;
}

export function description(game) {
  return JSON.stringify({
    time: game.state.time, resources: game.state.resources, research: game.state.research,
    industry: game.state.industry,
    visitor: game.state.trade?.visitor && { id: game.state.trade.visitor.id,
      phase: game.state.trade.visitor.phase, silver: game.state.trade.visitor.silver },
    power: game.state.power, beaconProgress: game.state.beaconProgress,
    actors: game.state.colonists.map(c => ({ id: c.id, status: c.status, health: c.health,
      hunger: c.hunger, energy: c.energy, job: c.job?.type, carry: c.carry,
      materials: c.job?.materials, equipment: c.equipment })),
    items: game.state.items.map(i => ({ type: i.type, count: i.count, reservedBy: i.reservedBy })),
  });
}

export function advance(game, seconds, check) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) {
    game.update(STEP);
    check?.();
  }
}

export function until(game, predicate, maxSeconds, message, check) {
  if (predicate()) return;
  for (let i = 0; i < Math.ceil(maxSeconds / STEP); i++) {
    game.update(STEP);
    check?.();
    if (predicate()) return;
  }
  assert.fail(`${message} after ${maxSeconds} simulated seconds. ${description(game)}`);
}

export function total(game, type) {
  return (game.state.resources[type] || 0)
    + game.state.items.filter(i => i.type === type).reduce((sum, i) => sum + i.count, 0)
    + game.state.colonists.filter(c => c.carry?.type === type && c.carry.source !== 'construction')
      .reduce((sum, c) => sum + c.carry.count, 0)
    + game.state.colonists.reduce((sum, c) => sum + (c.job?.type === 'craft' ? c.job.materials?.[type] || 0 : 0), 0)
    + game.state.colonists.reduce((sum, c) => sum + Object.values(c.equipment || {}).filter(item => item === type).length, 0);
}

export function setWork(game, pawn, priorities) {
  for (const work of WORK_TYPES) issue(game, 'priority', { id: pawn.id, work, value: priorities[work] || 0 });
}

// Isolated subsystem fixtures are intentionally synthetic. The separate default
// scenario acceptance test may only read state and use public commands/update.
export function sandbox(resources = {}, difficulty = 'relaxed') {
  const game = new ColonyGame({ seed: 20261114, difficulty });
  for (const tile of game.state.tiles) {
    Object.assign(tile, { terrain: 'grass', feature: null, amount: 0, crop: null,
      zone: null, building: null, designation: null, roomId: null, roofed: false,
      fire: 0, fireFuel: 0, burned: false });
  }
  for (let y = 14; y <= 16; y++) {
    for (let x = 10; x <= 12; x++) issue(game, 'zone', { x, y, kind: 'stockpile' });
  }
  for (const key of RESOURCE_TYPES) game.state.resources[key] = 0;
  game.state.foodBatches = { rawfood: [], meals: [] };
  for (const key of RESOURCE_TYPES) if (resources[key]) depositStock(game, key, resources[key], 11, 15);
  game.state.items = [];
  game.state.raiders = [];
  game.state.nextRaidAt = 1e8;
  game.state.activeRaid = false;
  game.state.autoCook = false;
  game.state.autoRepair = false;
  game.state.weather = 'clear';
  game.state.effects = [];
  game.state.reservations = {};
  if (game.state.hazards) game.state.hazards.nextIncidentAt = 1e8;
  if (game.state.trade) game.state.trade.nextVisitAt = 1e8;
  game.state.colonists.forEach((pawn, i) => {
    Object.assign(pawn, { x: 18.5, y: 14.5 + i, health: 100, hunger: 100, energy: 100,
      mood: 80, bleed: 0, dead: false, drafted: false, job: null, path: [], carry: null,
      destination: null, order: null, thinkAt: 0, thermalStress: 0, blockedTargets: {},
      carryingPawnId: null, carriedBy: null, patientBedId: null, recreation: 100 });
    if (pawn.equipment) pawn.equipment = { weapon: null, armor: null, tool: null };
    setWork(game, pawn, {});
    if (game.state.version >= 3) issue(game, 'schedulePreset', { id: pawn.id, preset: 'free' });
  });
  refreshSystems(game);
  return game;
}

export function completed(game, kind) {
  return game.state.tiles.filter(t => t.building?.type === kind && t.building.complete);
}

export function buildAndWait(game, kind, x, y, maxSeconds = 90) {
  issue(game, 'build', { kind, x, y });
  until(game, () => game.tile(x, y).building?.complete, maxSeconds, `${kind} should complete through work`);
}

export function assertResourceNumbers(game) {
  for (const type of RESOURCE_TYPES) {
    assert.ok(Number.isFinite(game.state.resources[type]), `${type} must be finite`);
    assert.ok(game.state.resources[type] >= 0, `${type} must not become negative`);
    assert.ok(Number.isInteger(game.state.resources[type]), `${type} must retain an integer item quantity`);
  }
  for (const item of game.state.items) {
    assert.ok(item.count > 0 && Number.isFinite(item.count), 'loose drop must have positive finite quantity');
  }
  for (const type of ['rawfood', 'meals']) {
    assert.equal(game.state.foodBatches[type].reduce((n, b) => n + b.count, 0),
      game.state.resources[type], `${type} batches must match the actual warehouse balance`);
  }
}

export function placeFixture(game, type, x, y, extra = {}) {
  const definition = BUILDINGS[type];
  assert.ok(definition, `unknown fixture building ${type}`);
  const building = { id: `fixture_${type}_${x}_${y}`, type, hp: definition.hp,
    maxHp: definition.hp, progress: 1, complete: true, paidCost: {}, materials: {},
    refunded: false, powered: false, networkId: null, ...extra };
  if (type === 'battery' && !('charge' in building)) building.charge = 0;
  if (type === 'bed' && !('medical' in building)) building.medical = false;
  Object.assign(game.tile(x, y), { building, feature: null, amount: 0, crop: null });
  return building;
}

export function encloseFixture(game, left = 8, top = 8, right = 14, bottom = 14) {
  for (let x = left; x <= right; x++) {
    placeFixture(game, x === left + 2 ? 'door' : 'wall', x, top);
    placeFixture(game, 'wall', x, bottom);
  }
  for (let y = top + 1; y < bottom; y++) {
    placeFixture(game, 'wall', left, y);
    placeFixture(game, 'wall', right, y);
  }
  refreshSystems(game);
}

// Drive only the documented systems boundary; colonist work/needs are excluded.
export function advanceSystems(game, seconds, { frozenClock = false } = {}) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.5) {
    const dt = Math.min(0.5, remaining);
    if (!frozenClock) game.state.time += dt;
    updateSystems(game, dt);
  }
}
