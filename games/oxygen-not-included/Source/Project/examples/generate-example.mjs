// Recreate the importable example from public commands, then verify ten further cycles.
// Run from the project root: node examples/generate-example.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Game, CYCLE_SECONDS } from '../../../Web/engine.js';
import { establishFrontierColony } from '../tests/scenarios.mjs';
import { at, clone, advance, until, finiteState } from '../tests/helpers.mjs';

const game = establishFrontierColony();
until(game, () => game.won, CYCLE_SECONDS * 20, 'the example did not complete all twenty goals');
const saved = game.serialize(), restored = new Game(1, 'breath-4.1');
restored.load(clone(saved));
assert.deepEqual(restored.serialize(), saved, 'the exported completed colony must reload exactly');

const summarize = g => ({
  time: Math.round(g.time * 10) / 10,
  cycle: g.cycle,
  completedGoals: g.objectives.filter(o => o.done).length,
  livingCrew: g.crew.filter(c => c.health > 0).length,
  resources: clone(g.resources),
  production: clone(g.production),
  settlement: clone(g.settlement),
  frontier: clone(g.frontier),
  equipment: clone(g.equipment),
  rooms: g.rooms.filter(r => r.valid).map(r => ({ id:r.id, type:r.type, area:r.area, bounds:clone(r.bounds) })),
  crew: g.crew.map(c => ({ name: c.name, health: c.health, hunger: c.hunger,
    stress: c.stress, schedule: c.schedule, restedCycles: c.restedCycles,
    portableOxygen:c.portableOxygen, maskMode:c.maskMode, experience:c.experience,
    level:c.level, skillPoints:c.skillPoints, skills:clone(c.skills) })),
});
const victory = summarize(game), farms = game.buildings.filter(b => b.type === 'farm' && b.y === 16);
const harvests = new Map(farms.map(b => [b.id, 0])), previous = new Map(farms.map(b => [b.id, b.growth]));
let minimumHealth = 100, maximumFarmWater = 0, minimumFood = game.foodStatus.total;
advance(game, CYCLE_SECONDS * 10, (g, tick) => {
  assert.ok(g.crew.every(c => c.health > 0 && c.x < 36), 'crew remain alive on the safe side of the barrier');
  minimumHealth = Math.min(minimumHealth, ...g.crew.map(c => c.health));
  minimumFood = Math.min(minimumFood, g.foodStatus.total);
  for (const farm of farms) {
    const water = at(g, farm.x, farm.y).water;
    maximumFarmWater = Math.max(maximumFarmWater, water);
    assert.ok(water < 0.5, 'the lower farm is protected from flooding');
    if (previous.get(farm.id) > 0.95 && farm.growth < 0.1) harvests.set(farm.id, harvests.get(farm.id) + 1);
    previous.set(farm.id, farm.growth);
  }
  if (tick % 100 === 0) finiteState(g);
});
assert.ok([...harvests.values()].every(count => count >= 2));
assert.ok(game.production.mealsCooked > victory.production.mealsCooked);
assert.ok(game.production.tableMeals > victory.production.tableMeals);
assert.ok(game.production.scheduledRests > victory.production.scheduledRests);
assert.ok(game.production.bedroomRestSeconds > victory.production.bedroomRestSeconds);
assert.ok(game.production.messhallMeals > victory.production.messhallMeals);
const generatedAt = new Date().toISOString();
writeFileSync(new URL('./self-sustaining-colony.json', import.meta.url),
  JSON.stringify({ format: 'breath-colony', savedAt: generatedAt, game: saved }, null, 2) + '\n');
const report = {
  generatedAt, seed: game.seed, saveVersion: game.version,
  method: 'New Game(73), then only Game.queue, setCrewRole, setCrewSchedule, setDoorMode, trainCrew, and Game.step; no injected resources, research, crew needs, XP, oxygen, or terrain.',
  victory, afterTenCycles: summarize(game),
  monitoring: { minimumHealth, minimumFood, maximumFarmWater,
    lowerFarmHarvests: farms.map(b => ({ x: b.x, y: b.y, harvests: harvests.get(b.id) })) },
};
writeFileSync(new URL('./validation-report.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ victoryTime: victory.time, afterTime: report.afterTenCycles.time,
  goals: victory.completedGoals, minimumHealth, farmHarvests: report.monitoring.lowerFarmHarvests,
  cooked: [victory.production.mealsCooked, game.production.mealsCooked],
  tableMeals: [victory.production.tableMeals, game.production.tableMeals],
  roomMeals:[victory.production.messhallMeals,game.production.messhallMeals],
  portableBreathingSeconds:victory.production.protectedSeconds }));
