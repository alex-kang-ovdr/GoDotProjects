import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, BUILDINGS, CYCLE_SECONDS } from '../dist/engine.js';
import { clone, at, buildingAt, finiteState, advance, until, plan } from './helpers.mjs';
import { establishUtilityColony } from './scenarios.mjs';

const legacy = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const close = (actual, expected, message, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

function waterAccounting(game) {
  const stores = [...game.cells, ...game.buildings];
  const clean = stores.reduce((sum, item) => sum + (item.cleanWater || 0), 0);
  const waste = stores.reduce((sum, item) => sum + (item.dirtyWater || 0), 0);
  close(game.resources.water, clean, 'clean inventory matches physical stores');
  close(game.resources.waste, waste, 'waste inventory matches physical stores');
  close(game.plumbing.waterStored, clean, 'plumbing shows actual clean inventory');
  close(game.plumbing.wasteStored, waste, 'plumbing shows actual waste inventory');
}

function command(game, tool, x, y) {
  const result = game.queue(tool, x, y);
  assert.ok(result.ok, `${tool} (${x},${y}): ${result.message}`);
  return buildingAt(game, x, y);
}

function connectRow(game, tool, x1, x2, y) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
    if (!at(game, x, y)[tool]) command(game, tool, x, y);
  }
}

let utilitySnapshot;
function preparedColony() {
  // Independent copies of a real played colony keep isolated failure tests fast.
  utilitySnapshot ||= establishUtilityColony().serialize();
  const game = new Game(73);
  game.load(clone(utilitySnapshot));
  return game;
}

function disable(game, types) {
  for (const b of game.buildings) {
    if (types.includes(b.type) && b.enabled) assert.ok(game.toggleBuilding(b.id));
  }
}

function rejectedWithoutMutation(game, input, label) {
  const before = clone(game.serialize());
  const originalInput = clone(input);
  let rejected = false;
  try { rejected = game.load(input) === false; }
  catch (error) {
    assert.ok(error instanceof Error && error.message.length, `${label}: useful error`);
    rejected = true;
  }
  assert.ok(rejected, `${label}: malformed save was accepted`);
  assert.deepEqual(game.serialize(), before, `${label}: failed load changed the live colony`);
  assert.deepEqual(input, originalInput, `${label}: failed load mutated the caller's data`);
}

test('utility systems retain separate water networks, needs, production and research', () => {
  const game = new Game(73);
  assert.equal(game.version, 4);
  assert.ok(game.research.cap >= 100);
  assert.deepEqual(new Set(game.objectives.map(o => o.stage)), new Set([1, 2, 3, 4, 5]));
  assert.ok(game.objectives.length > 6);
  assert.ok(game.stability.target >= 180);
  assert.equal(game.stability.seconds, 0);
  assert.ok(game.cells.some(c => c.spring), 'groundwater comes from a visible world source');
  for (const type of ['toilet', 'sink', 'reservoir', 'purifier', 'electrolyzer', 'hydrogenGen', 'cooler']) {
    assert.ok(BUILDINGS[type], `${type} has a build definition`);
  }
  for (const key of ['pumpedWater', 'purifiedWater', 'oxygenProduced', 'hydrogenProduced',
    'hydrogenConsumed', 'energyGenerated', 'harvestedFood', 'mealsEaten', 'toiletUses', 'washUses']) {
    assert.equal(typeof game.production[key], 'number', `${key} records real production/use`);
  }
  waterAccounting(game);
  finiteState(game);
});

test('both pipe layers coexist with a wired building and targeted removal refunds only that layer', () => {
  const game = new Game(73);
  const generator = game.buildings.find(b => b.type === 'generator');
  const { x, y } = generator;
  const cell = at(game, x, y);
  assert.equal(cell.wire, true);
  assert.equal(cell.pipe, false);
  assert.equal(cell.wastepipe, false);
  const original = clone(game.serialize());
  game.canPlace('pipe', x, y);
  game.canPlace('wastepipe', x, y);
  assert.deepEqual(game.serialize(), original, 'pipe hover previews are read-only');
  const metalBefore = game.resources.metal;
  command(game, 'pipe', x, y);
  const cleanCost = metalBefore - game.resources.metal;
  assert.ok(cleanCost > 0);
  const afterClean = game.resources.metal;
  game.queue('pipe', x, y);
  assert.equal(game.resources.metal, afterClean, 'repeated clean pipe does not charge twice');
  command(game, 'wastepipe', x, y);
  const afterBoth = game.resources.metal;
  game.queue('wastepipe', x, y);
  assert.equal(game.resources.metal, afterBoth, 'repeated waste pipe does not charge twice');
  assert.ok(cell.wire && cell.pipe && cell.wastepipe);
  assert.equal(game.tasks.length, original.tasks.length, 'pipes are instant infrastructure');
  game.queue('cancel', x, y);
  assert.ok(cell.wire && cell.pipe && cell.wastepipe, 'cancel does not remove completed infrastructure');
  command(game, 'removePipe', x, y);
  assert.equal(cell.pipe, false);
  assert.ok(cell.wire && cell.wastepipe);
  assert.equal(buildingAt(game, x, y).id, generator.id, 'targeted pipe removal preserves the machine');
  assert.equal(game.resources.metal, afterBoth + cleanCost);
  const afterRemoval = game.resources.metal;
  game.queue('removePipe', x, y);
  assert.equal(game.resources.metal, afterRemoval, 'repeated removal cannot mint metal');
  command(game, 'removeWastepipe', x, y);
  assert.equal(game.resources.metal, metalBefore);
  assert.equal(cell.wastepipe, false);
  assert.equal(cell.wire, true);
  waterAccounting(game);
});

test('an uncharged battery requests real manual generation even without a consuming machine', () => {
  const game = new Game(73);
  const battery = plan(game, 'battery', { wired: true });
  until(game, () => battery.progress === 1 && battery.charge > 20, CYCLE_SECONDS * 2,
    'a reserve-only battery never charged');
  assert.ok(game.production.energyGenerated > 0);
  assert.ok(game.buildings.some(b => b.type === 'generator' && b.connected));
  finiteState(game);
});

test('an unreachable plan explains the blockage rather than silently waiting', () => {
  const game = new Game(73);
  const farm = command(game, 'farm', 40, 11);
  advance(game, 15);
  const task = game.tasks.find(t => t.buildingId === farm.id);
  assert.ok(task, 'the plan remains available for later route repairs');
  assert.equal(task.progress, 0);
  assert.ok(typeof task.blockedReason === 'string' && task.blockedReason.length > 0,
    'unreachable work has an explanation');
  assert.ok(game.stats.blockedTasks >= 1);
  assert.ok(game.inspect(40, 11).lines.some(line => line.includes(task.blockedReason)),
    'the player can see the actual blockage in inspection');
  finiteState(game);
});

test('a farm without its water port cannot spend remote clean stock and resumes after reconnection', () => {
  const game = new Game(73);
  const farm = game.buildings.find(b => b.type === 'farm');
  assert.ok(game.resources.water > 0);
  command(game, 'removePipe', farm.x, farm.y);
  advance(game, 1);
  const growth = farm.growth, water = game.resources.water;
  advance(game, 8);
  assert.equal(farm.waterConnected, false);
  close(farm.growth, growth, 'disconnected farm growth is paused');
  close(game.resources.water, water, 'disconnected farm cannot consume the core tank');
  command(game, 'pipe', farm.x, farm.y);
  until(game, () => farm.growth > growth + 0.02, 15, 'reconnected farm did not grow');
  assert.equal(farm.waterConnected, true);
  assert.ok(game.resources.water < water);
  waterAccounting(game);
});

test('one starter farm no longer produces more meals than three idle residents consume', () => {
  const game = new Game(73);
  const food = game.resources.food;
  advance(game, CYCLE_SECONDS * 5 + 1);
  assert.ok(game.production.harvestedFood > 0, 'starter farm still works');
  assert.ok(game.production.mealsEaten > game.production.harvestedFood,
    'expanding food production has a gameplay purpose');
  assert.ok(game.resources.food < food, 'a passive colony draws down its initial supplies');
  assert.equal(game.won, false, 'waiting alone does not complete the self-sufficiency goals');
  finiteState(game);
});

test('crew reach sanitation fixtures and convert clean input to separately stored waste', () => {
  const game = new Game(73);
  const toilet = command(game, 'toilet', 25, 11);
  const sink = command(game, 'sink', 26, 11);
  const tank = command(game, 'reservoir', 27, 11);
  connectRow(game, 'wastepipe', 25, 27, 11);
  until(game, () => [toilet, sink, tank].every(b => b.progress === 1), CYCLE_SECONDS);
  let previousToilet = 0, previousWash = 0, reachedToilet = false, reachedSink = false;
  for (let i = 0; i < CYCLE_SECONDS * 6 / 0.1; i++) {
    game.step(0.1);
    if (game.production.toiletUses > previousToilet) {
      reachedToilet ||= game.crew.some(c => Math.hypot(c.x - toilet.x - 0.5, c.y - toilet.y - 0.5) < 1.1);
    }
    if (game.production.washUses > previousWash) {
      reachedSink ||= game.crew.some(c => Math.hypot(c.x - sink.x - 0.5, c.y - sink.y - 0.5) < 1.1 && c.hygiene > 95);
    }
    previousToilet = game.production.toiletUses;
    previousWash = game.production.washUses;
    if (previousToilet >= 3 && previousWash >= 3) break;
  }
  assert.ok(reachedToilet && reachedSink, 'usage is a performed crew action, not a passive building bonus');
  assert.ok(game.production.toiletUses >= 3 && game.production.washUses >= 3);
  close(game.resources.waste,
    game.production.toiletUses * 2.2 + game.production.washUses * 0.65,
    'sanitation output remains in the waste layer until processed');
  assert.equal(game.production.purifiedWater, 0);
  assert.ok(game.resources.water < 60);
  assert.equal(game.crew.filter(c => c.health > 0).length, 3);
  waterAccounting(game);
  finiteState(game);
});

test('a disconnected water island consumes only its own buffer and resumes when rejoined', () => {
  const game = preparedColony();
  disable(game, ['pump', 'farm', 'research', 'toilet', 'sink', 'purifier', 'diffuser']);
  const electrolyzer = game.buildings.find(b => b.type === 'electrolyzer');
  assert.ok(game.setAutomation(electrolyzer.id, 'always').ok);
  advance(game, 0.2);
  const beforeSplit = game.resources.water;
  command(game, 'removePipe', 31, 11); // Tank port separates core storage from the eastern machines.
  close(game.resources.water, beforeSplit, 'splitting a network conserves existing water');
  advance(game, 0.2); // Allow each newly separated network to redistribute its own existing buffer.
  const core = game.buildings.find(b => b.type === 'core');
  const tank = game.buildings.find(b => b.type === 'reservoir');
  const isolatedStorage = core.cleanWater + tank.cleanWater;
  const produced = game.production.hydrogenProduced;
  advance(game, 60);
  assert.ok(game.production.hydrogenProduced > produced, 'the small eastern pipe buffer is usable');
  assert.ok(game.resources.water > 20, 'remote stock still exists');
  close(core.cleanWater + tank.cleanWater, isolatedStorage,
    'a remote disconnected core and tank cannot feed the eastern consumer');
  const stoppedAt = game.production.hydrogenProduced;
  advance(game, 8);
  close(game.production.hydrogenProduced, stoppedAt, 'depleted island cannot borrow shared clean water');
  assert.ok(electrolyzer.status.includes('청수'), 'the stopped machine explains its missing supply');
  command(game, 'pipe', 31, 11);
  until(game, () => game.production.hydrogenProduced > stoppedAt + 0.1, 15,
    'rejoining the supply did not restore production');
  waterAccounting(game);
  finiteState(game);
});

test('removing a filled last pipe is safely refused until another storage slot is provided', () => {
  const game = preparedColony();
  disable(game, ['pump', 'farm', 'research', 'toilet', 'sink', 'purifier', 'electrolyzer']);
  advance(game, 0.2);
  const total = game.resources.water;
  command(game, 'removePipe', 36, 11);
  assert.ok(at(game, 37, 11).cleanWater > 0, 'the isolated pump port contains real water');
  const before = clone(game.serialize());
  const denied = game.queue('removePipe', 37, 11);
  assert.equal(denied.ok, false, 'water cannot disappear to make demolition succeed');
  assert.ok(denied.message.length > 0);
  assert.deepEqual(game.serialize(), before, 'a refused removal changes nothing');
  command(game, 'pipe', 38, 11);
  command(game, 'removePipe', 37, 11);
  assert.equal(at(game, 37, 11).pipe, false);
  assert.ok(at(game, 38, 11).cleanWater > 0, 'water moved into the new neighboring slot');
  assert.ok(buildingAt(game, 37, 11)?.type === 'pump', 'the fixture remains in place');
  close(game.resources.water, total, 'split, expansion and removal preserve fluid mass');
  waterAccounting(game);
});

test('purification consumes real waste and filter rock, obeys both ports, and recovers after repair', () => {
  const game = preparedColony();
  const purifier = game.buildings.find(b => b.type === 'purifier');
  game.toggleBuilding(purifier.id);
  until(game, () => game.resources.waste >= 5, CYCLE_SECONDS * 3,
    'actual sanitation did not produce processable wastewater');
  disable(game, ['pump', 'farm', 'research', 'toilet', 'sink', 'electrolyzer', 'diffuser']);
  const water = game.resources.water, waste = game.resources.waste, rock = game.resources.rock;
  game.toggleBuilding(purifier.id);
  advance(game, 3);
  const processed = waste - game.resources.waste;
  assert.ok(processed > 0, 'powered filtration actually processes wastewater');
  close(game.resources.water - water, processed * 0.95, 'filtration recovers 95% as clean water');
  close(rock - game.resources.rock, processed * 0.05, 'filtration spends its declared filter resource');
  assert.ok(game.resources.water + game.resources.waste < water + waste,
    'filtration cannot duplicate either fluid');

  for (const [remove, restore] of [['removePipe', 'pipe'], ['removeWastepipe', 'wastepipe']]) {
    command(game, remove, purifier.x, purifier.y);
    const produced = game.production.purifiedWater;
    advance(game, 2);
    assert.equal(purifier.active, false);
    close(game.production.purifiedWater, produced, `${remove} stops the actual conversion`);
    command(game, restore, purifier.x, purifier.y);
    until(game, () => game.production.purifiedWater > produced + 0.1, 8,
      'restoring a purifier port did not resume conversion');
    waterAccounting(game);
  }
  finiteState(game);
});

test('electrolysis needs water and power and its hydrogen produces actual electrical energy', () => {
  const game = preparedColony();
  const electrolyzer = game.buildings.find(b => b.type === 'electrolyzer');
  const generator = game.buildings.find(b => b.type === 'hydrogenGen');
  assert.ok(BUILDINGS.electrolyzer.power > 0 && BUILDINGS.hydrogenGen.power < 0);
  assert.ok(game.setAutomation(electrolyzer.id, 'always').ok);
  let activeElectrolysis = false, activeGeneration = false;
  const water = game.production.hydrogenProduced, energy = game.production.hydrogenEnergy;
  advance(game, 45, () => {
    activeElectrolysis ||= electrolyzer.active && game.power.demand >= BUILDINGS.electrolyzer.power;
    activeGeneration ||= generator.active && game.power.production >= -BUILDINGS.hydrogenGen.power;
  });
  assert.ok(activeElectrolysis && activeGeneration, 'both devices perform their jobs on the real circuit');
  assert.ok(game.production.hydrogenProduced > water);
  assert.ok(game.production.hydrogenConsumed > 0 && game.production.hydrogenEnergy > energy);
  close(game.resources.hydrogen,
    game.production.hydrogenProduced - game.production.hydrogenConsumed,
    'shared hydrogen stores match cumulative production and consumption');
  game.toggleBuilding(electrolyzer.id);
  const produced = game.production.hydrogenProduced;
  advance(game, 5);
  close(game.production.hydrogenProduced, produced, 'manual stop overrides automatic supply control');
  waterAccounting(game);
  finiteState(game);
});

test('completed farm demolition refunds water into real storage instead of losing the refund', () => {
  const game = new Game(73);
  const farm = command(game, 'farm', 25, 11);
  until(game, () => farm.progress === 1, CYCLE_SECONDS);
  disable(game, ['farm']);
  const before = game.resources.water;
  command(game, 'deconstruct', farm.x, farm.y);
  until(game, () => !game.buildings.some(b => b.id === farm.id), CYCLE_SECONDS);
  close(game.resources.water - before, Math.floor(BUILDINGS.farm.cost.water * 0.75),
    'the declared water salvage is physically stored');
  waterAccounting(game);
});

test('oxygen automation preserves hysteresis across saves and manual disable takes precedence', () => {
  const game = preparedColony();
  disable(game, ['electrolyzer', 'pump', 'research', 'purifier']);
  const diffuserId = game.buildings.find(b => b.type === 'diffuser').id;
  const farm = game.buildings.find(b => b.type === 'farm');
  const oldMode = farm.automation;
  assert.equal(game.setAutomation(farm.id, 'battery').ok, false);
  assert.equal(farm.automation, oldMode);
  assert.ok(game.setAutomation(diffuserId, 'oxygen').ok);

  // Controlled atmosphere fixtures exercise switching memory; the victory test uses no state editing.
  const atmosphere = oxygen => {
    const save = game.serialize();
    for (const cell of save.cells) if (!cell.solid) cell.oxygen = oxygen;
    game.load(save);
    advance(game, 0.2);
    return game.buildings.find(b => b.id === diffuserId);
  };
  let diffuser = atmosphere(1.5);
  assert.equal(diffuser.active, false, 'abundant oxygen pauses an automatic diffuser');
  assert.ok(diffuser.status.includes('자동'));
  diffuser = atmosphere(0.95);
  assert.equal(diffuser.active, false, 'middle range retains the off state after a save round-trip');
  diffuser = atmosphere(0.5);
  assert.equal(diffuser.active, true, 'low oxygen starts the powered diffuser');
  diffuser = atmosphere(0.95);
  assert.equal(diffuser.active, true, 'middle range retains the on state');
  game.toggleBuilding(diffuser.id);
  diffuser = atmosphere(0.5);
  assert.equal(diffuser.active, false, 'manual disable overrides the oxygen trigger');
  assert.ok(diffuser.status.includes('수동'));
  finiteState(game);
});

test('a researched cooler spends power and water, produces wastewater and reduces nearby heat', () => {
  const game = new Game(73);
  game.load(legacy('v1-progress.json'));
  until(game, () => game.stats.research >= BUILDINGS.cooler.unlock, CYCLE_SECONDS * 4,
    'normal research could not unlock cooling');
  const cooler = command(game, 'cooler', 31, 11);
  const tank = command(game, 'reservoir', 32, 11);
  connectRow(game, 'pipe', 30, 32, 11);
  connectRow(game, 'wastepipe', 31, 32, 11);
  until(game, () => cooler.progress === 1 && tank.progress === 1, CYCLE_SECONDS);
  disable(game, ['farm', 'research']);
  assert.ok(game.setAutomation(cooler.id, 'temperature').ok);
  const fixture = game.serialize();
  for (let y = 8; y <= 11; y++) for (let x = 27; x <= 35; x++) {
    if (!fixture.cells[y * game.w + x].solid) fixture.cells[y * game.w + x].temp = 40;
  }
  const working = new Game(73), control = new Game(73);
  working.load(clone(fixture));
  control.load(clone(fixture));
  control.toggleBuilding(cooler.id);
  const water = working.resources.water, waste = working.resources.waste;
  let active = false;
  advance(working, 20, () => {
    active ||= working.buildings.find(b => b.id === cooler.id).active &&
      working.power.demand >= BUILDINGS.cooler.power;
  });
  advance(control, 20);
  const used = working.production.coolingWaterUsed;
  assert.ok(active && used > 0, 'cooling is powered and consumes real coolant');
  close(water - working.resources.water, used, 'cooler consumes clean water');
  close(working.resources.waste - waste, used, 'cooler sends used coolant to the waste layer');
  assert.ok(at(working, 31, 11).temp < at(control, 31, 11).temp - 0.5,
    'active cooling beats natural heat diffusion in the same starting environment');
  waterAccounting(working);
  finiteState(working);
});

test('the first twelve utility goals still complete after an interrupted supply is repaired', () => {
  const game = establishUtilityColony();
  until(game, () => game.stability.seconds >= 10, CYCLE_SECONDS * 10,
    'the documented colony could not begin its healthy operation interval');
  const electrolyzer = game.buildings.find(b => b.type === 'electrolyzer');
  command(game, 'removePipe', electrolyzer.x, electrolyzer.y);
  advance(game, 1);
  assert.equal(game.stability.healthy, false, 'past production alone does not prove a current working supply');
  assert.equal(game.stability.seconds, 0, 'a broken utility connection resets the continuous interval');
  assert.ok(game.stability.reasons.length > 0, 'the failed stability condition is explained');
  command(game, 'pipe', electrolyzer.x, electrolyzer.y);
  const legacyGoals = game.objectives.filter(o => o.stage <= 3);
  assert.equal(legacyGoals.length, 12, 'the original utility milestones remain available');
  until(game, () => legacyGoals.every(o => o.done), CYCLE_SECONDS * 12,
    'the public-command route could not complete the first three stages');
  assert.ok(game.stability.seconds >= 180 - 1e-6);
  assert.ok(game.production.pumpedWater >= 20 && game.production.purifiedWater >= 8);
  assert.ok(game.production.hydrogenEnergy >= 2000);
  assert.ok(game.production.toiletUses >= 3 && game.production.washUses >= 3);
  assert.equal(game.crew.filter(c => c.health >= 70).length, 3);
  assert.equal(game.won, false, 'v3 additionally requires the community production and routine loop');
  assert.equal(at(game, 36, 11).solid, 'tile', 'the spring is physically contained');
  finiteState(game);
  waterAccounting(game);
});

for (const filename of ['v1-progress.json', 'v1-victory.json']) {
  test(`authentic ${filename} migrates without erasing progress or mutating the input`, () => {
    const input = legacy(filename), original = clone(input);
    const game = new Game(91);
    assert.notEqual(game.load(input), false);
    assert.deepEqual(input, original, 'migration never rewrites caller-owned data');
    assert.equal(game.version, 4);
    assert.equal(game.seed, input.seed);
    assert.equal(game.time, input.time);
    assert.equal(game.crew.length, input.crew.length);
    for (const key of ['rock', 'metal', 'algae', 'coal', 'water', 'food']) {
      close(game.resources[key], input.resources[key], `${key} survives migration`);
    }
    for (let i = 0; i < input.cells.length; i++) {
      for (const key of ['solid', 'revealed', 'wire', 'oxygen', 'co2', 'temp', 'water']) {
        assert.equal(game.cells[i][key], input.cells[i][key], `old cell ${i}.${key} survives`);
      }
    }
    for (const old of input.buildings) {
      const current = game.buildings.find(b => b.id === old.id);
      assert.ok(current, `building ${old.id} survives`);
      for (const key of ['type', 'x', 'y', 'progress', 'growth', 'charge', 'enabled']) {
        assert.equal(current[key], old[key], `building ${old.id}.${key} survives`);
      }
    }
    for (const old of input.tasks) {
      const current = game.tasks.find(t => t.id === old.id);
      assert.ok(current, 'unfinished work survives migration');
      assert.equal(current.progress, old.progress);
    }
    for (const old of input.objectives.filter(o => o.done)) {
      assert.equal(game.objectives.find(o => o.id === old.id)?.done, true);
    }
    assert.equal(game.won, false, 'legacy victory continues into new utility challenges');
    assert.ok(game.objectives.some(o => o.stage > 1 && !o.done));
    assert.ok(game.crew.every(c => c.bladder < 80 && c.hygiene > 50),
      'migration allows time to add the new sanitation facilities');
    waterAccounting(game);
    const converted = clone(game.serialize()), restored = new Game(1);
    restored.load(clone(converted));
    assert.deepEqual(restored.serialize(), converted, 'converted current save round-trips');
    advance(restored, 3);
    finiteState(restored);
    waterAccounting(restored);
  });
}

test('malformed v1 migration and new v2 fields are rejected atomically', () => {
  const game = new Game(73);
  advance(game, 2);
  const legacyBad = legacy('v1-progress.json');
  legacyBad.resources.water = -1;
  rejectedWithoutMutation(game, legacyBad, 'legacy negative water');
  const saved = clone(game.serialize());
  const mutations = [
    ['missing plumbing', v => { delete v.plumbing; }],
    ['missing production', v => { delete v.production; }],
    ['invalid pipe layer', v => { v.cells[0].pipe = 'yes'; }],
    ['negative water buffer', v => { v.cells[0].cleanWater = -1; }],
    ['negative waste buffer', v => { v.cells[0].dirtyWater = -1; }],
    ['mismatched water total', v => { v.resources.water += 1; }],
    ['negative hydrogen', v => { v.resources.hydrogen = -1; }],
    ['invalid bladder', v => { v.crew[0].bladder = 101; }],
    ['missing hygiene', v => { delete v.crew[0].hygiene; }],
    ['invalid automation', v => { v.buildings.find(b => b.type === 'generator').automation = 'invent-water'; }],
    ['negative stability', v => { v.stability.seconds = -1; }],
    ['invalid research cap', v => { v.research.cap = 0; }],
    ['invalid objective stage', v => { v.objectives[0].stage = 5; }],
    ['non-finite history', v => { v.history = [{time: v.time, oxygen: NaN, food: 1, water: 1, power: 1}]; }],
  ];
  for (const [label, mutate] of mutations) {
    const invalid = clone(saved);
    mutate(invalid);
    rejectedWithoutMutation(game, invalid, label);
  }
});

