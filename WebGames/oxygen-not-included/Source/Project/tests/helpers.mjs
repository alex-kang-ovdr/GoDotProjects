import assert from 'node:assert/strict';
import { CYCLE_SECONDS } from '../dist/engine.js';

export const DT = 0.1;
export const clone = value => structuredClone(value);
export const at = (game, x, y) => game.cells[y * game.w + x];
export const buildingAt = (game, x, y) => game.buildings.find(b => b.x === x && b.y === y);

export function numeric(value, label, min = -Infinity, max = Infinity) {
  assert.equal(typeof value, 'number', `${label}: expected number`);
  assert.ok(Number.isFinite(value), `${label}: ${value} must be finite`);
  assert.ok(value >= min - 1e-7 && value <= max + 1e-7,
    `${label}: ${value} is outside [${min}, ${max}]`);
}

export function finiteState(game) {
  assert.equal(game.cells.length, game.w * game.h);
  numeric(game.time, 'time', 0);
  numeric(game.cycle, 'cycle', 1);
  for (const [key, value] of Object.entries(game.resources)) numeric(value, `resources.${key}`, 0);
  for (const [key, value] of Object.entries(game.power)) numeric(value, `power.${key}`, 0);
  assert.ok(game.power.stored <= game.power.capacity + 1e-6, 'battery cannot store above capacity');
  if (game.version >= 2) {
    for (const [key, value] of Object.entries(game.plumbing)) numeric(value, `plumbing.${key}`, 0);
    for (const [key, value] of Object.entries(game.production)) numeric(value, `production.${key}`, 0);
    numeric(game.stability.seconds, 'stability.seconds', 0);
    assert.ok(Array.isArray(game.stability.reasons));
    assert.ok(game.history.length <= 90, 'history has bounded memory');
    for (const sample of game.history) {
      for (const [key, value] of Object.entries(sample)) numeric(value, `history.${key}`, 0);
    }
  }
  if (game.version >= 3) {
    for (const [key, value] of Object.entries(game.logistics)) numeric(value, `logistics.${key}`, 0);
    for (const [key, value] of Object.entries(game.foodStatus)) {
      if (key === 'cold') assert.equal(typeof value, 'boolean');
      else numeric(value, `foodStatus.${key}`, 0);
    }
    numeric(game.settlement.seconds, 'settlement.seconds', 0, game.settlement.target);
    assert.ok(Array.isArray(game.settlement.reasons));
    assert.equal(new Set(game.debris.map(p => p.id)).size, game.debris.length);
    for (const pile of game.debris) {
      numeric(pile.amount, `debris ${pile.id} amount`, 0);
      assert.ok(['rock', 'metal', 'algae', 'coal'].includes(pile.resource));
      numeric(pile.priority, `debris ${pile.id} priority`, 1, 5);
    }
    close(game.logistics.stored, ['rock','metal','algae','coal'].reduce((n,k)=>n+game.resources[k],0),
      'settled solids are counted once');
    close(game.logistics.loose, game.debris.reduce((n,p)=>n+p.amount,0), 'loose stock matches actual piles');
    close(game.logistics.carried, game.crew.reduce((n,c)=>n+(c.cargo?.amount||0),0), 'carried stock matches actual cargo');
    close(game.foodStatus.total, game.resources.food + game.resources.meals, 'edible inventory includes raw and prepared food');
  }
  if (game.version >= 4) {
    for (const [key, value] of Object.entries(game.equipment)) numeric(value, `equipment.${key}`, 0);
    numeric(game.frontier.seconds, 'frontier.seconds', 0, game.frontier.target);
    assert.ok(Array.isArray(game.frontier.reasons));
    const docks = game.buildings.filter(b => b.type === 'oxygenDock' && b.progress === 1);
    close(game.equipment.stored, docks.reduce((n,b)=>n+b.oxygenStored,0), 'dock storage is counted once');
    close(game.equipment.carried, game.crew.reduce((n,c)=>n+c.portableOxygen,0), 'portable oxygen is counted once');
    close(game.equipment.capacity, docks.reduce((n,b)=>n+b.oxygenCapacity,0), 'only completed docks add tank capacity');
    assert.equal(new Set(game.rooms.map(r => r.id)).size, game.rooms.length, 'room IDs are unique');
    for (const room of game.rooms) {
      assert.equal(room.area, room.cells.length);
      assert.equal(room.id, Math.min(...room.cells), 'room identity is derived from its physical component');
      assert.equal(new Set(room.cells).size, room.cells.length, 'a room does not contain duplicated cells');
      assert.ok(room.cells.every(index => Number.isInteger(index) && index >= 0 && index < game.cells.length));
      assert.ok(['bedroom', 'messhall', 'greenhouse', 'generic'].includes(room.type));
      assert.equal(typeof room.sealed, 'boolean');
      assert.equal(typeof room.valid, 'boolean');
      assert.ok(Array.isArray(room.reasons));
    }
  }
  for (const [key, value] of Object.entries(game.stats)) numeric(value, `stats.${key}`, key === 'temperature' ? -Infinity : 0);
  numeric(game.stats.oxygen, 'stats.oxygen', 0, 100);
  for (const [i, cell] of game.cells.entries()) {
    numeric(cell.oxygen, `cells[${i}].oxygen`, 0);
    numeric(cell.co2, `cells[${i}].co2`, 0);
    numeric(cell.temp, `cells[${i}].temp`);
    numeric(cell.water, `cells[${i}].water`, 0);
    if (game.version >= 2) {
      assert.equal(typeof cell.pipe, 'boolean');
      assert.equal(typeof cell.wastepipe, 'boolean');
      if ('cleanWater' in cell) numeric(cell.cleanWater, `cells[${i}].cleanWater`, 0);
      if ('dirtyWater' in cell) numeric(cell.dirtyWater, `cells[${i}].dirtyWater`, 0);
    }
  }
  for (const crew of game.crew) {
    numeric(crew.x, `crew ${crew.id} x`, 0, game.w);
    numeric(crew.y, `crew ${crew.id} y`, 0, game.h);
    for (const key of ['health', 'hunger', 'energy', 'stress', 'breath', ...(game.version >= 2 ? ['bladder', 'hygiene'] : [])]) {
      numeric(crew[key], `crew ${crew.id} ${key}`, 0, 100);
    }
    if (game.version >= 4) {
      numeric(crew.portableOxygen, `crew ${crew.id} portableOxygen`, 0, crew.portableCapacity);
      assert.equal(crew.portableCapacity, 6);
      assert.ok(['auto', 'off'].includes(crew.maskMode));
      assert.equal(typeof crew.usingPortable, 'boolean');
      numeric(crew.experience, `crew ${crew.id} experience`, 0, 360);
      numeric(crew.level, `crew ${crew.id} level`, 0, 6);
      numeric(crew.skillPoints, `crew ${crew.id} skillPoints`, 0, 6);
      const ranks = Object.values(crew.skills).reduce((n, rank) => n + rank, 0);
      for (const key of ['dig', 'engineering', 'life']) numeric(crew.skills[key], `crew ${crew.id} ${key}`, 0, 3);
      assert.equal(crew.level, crew.skillPoints + ranks, 'each earned level gives one allocated or unspent point');
    }
  }
  for (const task of game.tasks) numeric(task.progress, `task ${task.id} progress`, 0, 1);
  for (const b of game.buildings) {
    numeric(b.progress, `building ${b.id} progress`, 0, 1);
    if (game.version >= 2) {
      if ('cleanWater' in b) numeric(b.cleanWater, `building ${b.id} cleanWater`, 0);
      if ('dirtyWater' in b) numeric(b.dirtyWater, `building ${b.id} dirtyWater`, 0);
    }
    if (game.version >= 4) {
      numeric(b.oxygenStored, `building ${b.id} oxygenStored`, 0, b.oxygenCapacity);
      assert.equal(b.oxygenCapacity, b.type === 'oxygenDock' ? 18 : 0);
      assert.equal(typeof b.doorOpen, 'boolean');
      assert.ok(b.type === 'door' ? ['auto', 'open', 'locked'].includes(b.doorMode) : b.doorMode === null);
    }
  }
  assert.ok(game.events.length <= 25, 'event log is bounded');
  assert.equal(new Set(game.alerts.map(a => a.id)).size, game.alerts.length, 'alerts are not duplicated');
}

export function diagnostics(game) {
  return JSON.stringify({
    logistics:game.logistics, foodStatus:game.foodStatus, settlement:game.settlement, frontier:game.frontier,
    equipment:game.equipment, rooms:game.rooms?.filter(r=>r.valid), debris:game.debris?.slice(0,20),
    time: game.time, lost: game.lost, resources: game.resources, power: game.power,
    plumbing: game.plumbing, production: game.production, stability: game.stability,
    objectives: game.objectives.map(o => ({id:o.id, done:o.done, progress:o.progress, target:o.target})),
    crew: game.crew.map(c => ({ name: c.name, x: c.x, y: c.y, action: c.action, health: c.health,
      hunger:c.hunger, energy:c.energy, stress:c.stress, bladder:c.bladder, hygiene:c.hygiene, cargo:c.cargo, schedule:c.schedule, phase:c.schedulePhase, rests:c.restedCycles,
      portableOxygen:c.portableOxygen, maskMode:c.maskMode, experience:c.experience, skillPoints:c.skillPoints, skills:c.skills, job:c._job?.kind })),
    tasks: game.tasks,
    buildings: game.buildings.filter(b => !['core', 'cot', 'ladder', 'tile'].includes(b.type))
      .map(b => ({ type: b.type, x: b.x, y: b.y, progress: b.progress, status: b.status, active:b.active, waterConnected:b.waterConnected })),
  });
}

export function advance(game, seconds, observe) {
  const ticks = Math.ceil(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    game.step(DT);
    observe?.(game, i);
  }
}

export function until(game, predicate, seconds = CYCLE_SECONDS * 2, message = 'condition did not become true') {
  if (predicate()) return;
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    game.step(DT);
    if (predicate()) return;
  }
  assert.fail(`${message}\n${diagnostics(game)}`);
}

export function nearestSite(game, type, { wired = false } = {}) {
  const choices = [];
  for (let y = 1; y < game.h - 1; y++) {
    for (let x = 1; x < game.w - 1; x++) {
      if (wired && !at(game, x, y).wire) continue;
      if (type === 'wire' && (at(game, x, y).wire || buildingAt(game, x, y))) continue;
      if (!game.canPlace(type, x, y).ok) continue;
      const distance = Math.min(...game.crew.filter(c => c.health > 0)
        .map(c => Math.abs(c.x - x - 0.5) + Math.abs(c.y - y - 0.5)));
      choices.push({ x, y, distance });
    }
  }
  choices.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  assert.ok(choices.length, `no available ${wired ? 'wired ' : ''}${type} site`);
  return choices[0];
}

export function plan(game, type, options) {
  const site = nearestSite(game, type, options);
  const result = game.queue(type, site.x, site.y);
  assert.ok(result.ok, `${type}: ${result.message}`);
  const building = buildingAt(game, site.x, site.y);
  assert.ok(building, 'valid construction creates a blueprint');
  return building;
}

export function frontierDig(game) {
  const living = game.crew.filter(c => c.health > 0);
  const choices = [];
  for (let y = 1; y < game.h - 1; y++) {
    for (let x = 1; x < game.w - 1; x++) {
      if (!game.canPlace('dig', x, y).ok || game.tasks.some(t => t.x === x && t.y === y)) continue;
      // Pick near an existing, supported walking cell; avoid removing a crew's floor.
      const positions = [[x - 1, y], [x + 1, y], [x, y + 1]];
      const stands = positions.filter(([sx, sy]) => sy < game.h - 1 &&
        at(game, sx, sy)?.revealed && !at(game, sx, sy).solid &&
        (at(game, sx, sy + 1)?.solid || buildingAt(game, sx, sy)?.type === 'ladder'));
      for (const [sx, sy] of stands) {
        const distance = Math.min(...living.map(c => Math.abs(c.x - sx - 0.5) + Math.abs(c.y - sy - 0.5)));
        choices.push({ x, y, distance });
      }
    }
  }
  choices.sort((a, b) => a.distance - b.distance || b.y - a.y || a.x - b.x);
  assert.ok(choices.length, 'there is a visible dig target near the starting colony');
  return choices[0];
}


export function close(actual, expected, message, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);
}

export function solidAmount(game, resource) {
  return game.resources[resource] + game.debris.filter(p => p.resource === resource).reduce((s,p)=>s+p.amount,0)
    + game.crew.filter(c => c.cargo?.resource === resource).reduce((s,c)=>s+c.cargo.amount,0);
}
