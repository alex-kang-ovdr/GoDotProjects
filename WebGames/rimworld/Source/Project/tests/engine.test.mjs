import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ColonyGame, BUILDINGS, RESEARCH } from '../dist/engine.js';
import { refreshSystems } from '../dist/colony-systems.js';
import { issue, advance, until, total, setWork, sandbox, completed, buildAndWait,
  assertResourceNumbers, placeFixture, encloseFixture, description } from './helpers.mjs';

test('invalid commands give feedback without debiting stock or creating work', () => {
  const game = sandbox({ wood: 100, steel: 100 });
  game.tile(3, 3).terrain = 'water';
  const before = { ...game.state.resources };
  const requests = [
    ['unknown_command', {}],
    ['build', { x: -1, y: 1, kind: 'wall' }],
    ['build', { x: 3, y: 3, kind: 'wall' }],
    ['build', { x: 20, y: 15, kind: 'missing_building' }],
    ['build', { x: Number.NaN, y: 15, kind: 'wall' }],
    ['draft', { id: 'missing_actor', value: true }],
    ['priority', { id: game.state.colonists[0].id, work: 'build', value: 9 }],
    ['move', { id: game.state.colonists[0].id, x: 20, y: 15 }],
    ['designate', { x: 20, y: 15, kind: 'mine' }],
  ];
  for (const [type, payload] of requests) {
    let result;
    assert.doesNotThrow(() => { result = game.command(type, payload); }, `${type} should not crash`);
    assert.equal(result?.ok, false, `${type} should reject its invalid request`);
    assert.equal(typeof result.message, 'string');
    assert.ok(result.message.length > 0, 'a rejected command needs an explanation');
    assert.deepEqual(game.state.resources, before, 'rejected input must not spend supplies');
  }
  assert.equal(game.state.tiles.filter(t => t.building).length, 0);
});

test('a paid blueprint is refunded once, including cancellation after work starts', () => {
  const game = sandbox({ wood: 100, steel: 100 });
  const before = { ...game.state.resources };
  const builder = game.state.colonists[0];
  setWork(game, builder, { build: 1 });
  issue(game, 'build', { x: 23, y: 14, kind: 'stove' });
  for (const [resource, cost] of Object.entries(BUILDINGS.stove.cost)) {
    assert.equal(game.state.resources[resource], before[resource] - cost, 'plan charges its listed cost once');
  }
  until(game, () => builder.job?.type === 'build', 20, 'builder should claim the blueprint');
  issue(game, 'cancel', { x: 23, y: 14 });
  assert.deepEqual(game.state.resources, before);
  const repeated = game.command('cancel', { x: 23, y: 14 });
  assert.equal(typeof repeated.ok, 'boolean');
  assert.deepEqual(game.state.resources, before, 'repeat cancel must not mint resources');
  advance(game, 12);
  assert.equal(game.tile(23, 14).building, null);
  assert.equal(builder.carry, null, 'canceled construction material kit must be removed');
  assert.deepEqual(game.state.resources, before, 'a stale job must not refund or consume again');
});

test('designation performs extraction into a loose drop before hauling credits the stockpile', () => {
  const game = sandbox();
  const worker = game.state.colonists[0];
  worker.x = 18.5;
  worker.y = 14.5;
  const tree = game.tile(20, 14);
  tree.feature = 'tree';
  tree.amount = 12;
  setWork(game, worker, { harvest: 1 });
  issue(game, 'designate', { x: 20, y: 14, kind: 'chop' });
  assert.equal(game.state.resources.wood, 0, 'designating is not harvesting');
  until(game, () => game.state.items.some(i => i.type === 'wood'), 60, 'wood should be dropped after work');
  assert.equal(game.state.resources.wood, 0, 'loose drops are not warehouse resources');
  const extracted = total(game, 'wood');
  assert.ok(extracted > 0);
  setWork(game, worker, { haul: 1 });
  until(game, () => game.state.resources.wood === extracted, 90, 'hauling should deliver extracted wood', () => {
    assert.equal(total(game, 'wood'), extracted, 'extraction-to-storage transfer must conserve quantity');
  });
  assert.equal(game.state.items.filter(i => i.type === 'wood').length, 0);
  assert.equal(worker.carry, null);
});

test('two haulers competing for one stack cannot duplicate or lose resources', () => {
  const game = sandbox();
  const quantity = 17;
  game.state.items.push({ id: 'fixture_wood_stack', x: 23, y: 15, type: 'wood', count: quantity, reservedBy: null });
  for (const pawn of game.state.colonists.slice(0, 2)) setWork(game, pawn, { haul: 1 });
  until(game, () => game.state.resources.wood === quantity, 120, 'competing haulers should finish delivery', () => {
    assert.equal(total(game, 'wood'), quantity, 'stock + loose + carried quantity must be conserved on every step');
    assertResourceNumbers(game);
  });
  advance(game, 10, () => assert.equal(total(game, 'wood'), quantity));
  assert.equal(game.state.resources.wood, quantity);
});

test('drafting a hauler releases its item reservation and retains all carried goods', () => {
  const game = sandbox();
  const worker = game.state.colonists[0];
  game.state.items.push({ id: 'fixture_draft_stack', x: 24, y: 15, type: 'wood', count: 9, reservedBy: null });
  setWork(game, worker, { haul: 1 });
  until(game, () => game.state.items.some(i => i.reservedBy === worker.id), 25, 'hauler should reserve its target');
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(game.state.items.some(i => i.reservedBy === worker.id), false);
  assert.equal(total(game, 'wood'), 9);
  issue(game, 'draft', { id: worker.id, value: false });
  until(game, () => worker.carry?.type === 'wood', 50, 'hauler should pick up the drop after returning to work');
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(total(game, 'wood'), 9, 'drafting while carrying must drop, retain, or deposit the exact goods');
  assert.equal(game.state.items.some(i => i.reservedBy === worker.id), false);
  issue(game, 'draft', { id: worker.id, value: false });
  until(game, () => game.state.resources.wood === 9, 80, 'interrupted goods should remain deliverable');
});

test('farming requires sowing and elapsed growth before a harvest creates food', () => {
  const game = sandbox({ meals: 60 });
  const grower = game.state.colonists[0];
  setWork(game, grower, { grow: 1 });
  issue(game, 'zone', { x: 19, y: 15, kind: 'farm' });
  assert.equal(game.tile(19, 15).crop, null, 'painting farmland must not produce an instant crop');
  until(game, () => game.tile(19, 15).crop !== null, 35, 'a grower should sow the plot');
  const afterSowing = total(game, 'rawfood');
  assert.equal(afterSowing, 0);
  let sawPartialGrowth = false;
  until(game, () => total(game, 'rawfood') > 0, 220, 'a mature crop should be harvested', () => {
    const crop = game.tile(19, 15).crop;
    if (crop && crop.growth > 0 && crop.growth < 1) sawPartialGrowth = true;
    if (crop) assert.ok(crop.growth >= 0 && crop.growth <= 1);
  });
  assert.equal(sawPartialGrowth, true, 'growth must be observable before its product exists');
  assert.equal(game.state.resources.rawfood, 0, 'harvest remains loose until a hauler delivers it');
  assert.ok(game.state.items.some(i => i.type === 'rawfood' && i.count > 0));
});

test('one cooking batch consumes exactly two raw food and creates one deliverable meal', () => {
  const game = sandbox({ wood: 40, steel: 20, rawfood: 2 });
  const cook = game.state.colonists[0];
  setWork(game, cook, { build: 1 });
  buildAndWait(game, 'stove', 18, 13);
  setWork(game, cook, { cook: 1 });
  issue(game, 'autoCook', { value: true, target: 1 });
  const cookedBefore = game.state.stats.mealsCooked;
  until(game, () => game.state.stats.mealsCooked > cookedBefore, 60, 'cook should finish a batch');
  assert.equal(game.state.resources.rawfood, 0);
  assert.equal(total(game, 'rawfood'), 0);
  assert.equal(total(game, 'meals'), 1);
  assert.equal(game.state.resources.meals, 0, 'cooked output must still be delivered');
  advance(game, 12);
  assert.equal(total(game, 'meals'), 1, 'an exhausted recipe must not produce free meals');
  setWork(game, cook, { haul: 1 });
  until(game, () => game.state.resources.meals === 1, 60, 'cooked meal should reach the stockpile');
  assertResourceNumbers(game);
});

test('food and sleep restore depleted needs through real consumption and a bed', () => {
  const game = sandbox({ wood: 30, meals: 12 });
  const pawn = game.state.colonists[0];
  setWork(game, pawn, { build: 1 });
  buildAndWait(game, 'bed', 17, 13);
  setWork(game, pawn, {});
  pawn.hunger = 8;
  pawn.energy = 8;
  pawn.mood = 55;
  const mealsBefore = game.state.resources.meals;
  until(game, () => pawn.hunger > 45 && pawn.energy > 45, 100, 'food and rest should recover needs');
  assert.ok(game.state.resources.meals < mealsBefore, 'hunger recovery must consume food');
  assert.ok(pawn.health > 0);
  assert.ok(pawn.hunger <= 100 && pawn.energy <= 100 && pawn.mood <= 100);
});

test('raiders cause real damage and drafted defenders can end a raid', () => {
  const game = sandbox({ meals: 30, medicine: 5 });
  const originalHealth = game.state.colonists.map(p => p.health);
  issue(game, 'raid');
  assert.ok(game.state.raiders.some(r => !r.dead));
  game.state.nextRaidAt = 1e8;
  game.state.raiders.forEach((raider, i) => {
    raider.x = 21.5 + i;
    raider.y = 15.5;
  });
  until(game, () => game.state.colonists.some((p, i) => p.health < originalHealth[i]), 25, 'an unattended raider should damage a colonist');
  for (const pawn of game.state.colonists.filter(p => !p.dead)) issue(game, 'draft', { id: pawn.id, value: true });
  const target = game.state.raiders.find(r => !r.dead);
  for (const pawn of game.state.colonists.filter(p => !p.dead)) issue(game, 'attack', { id: pawn.id, targetId: target.id });
  until(game, () => game.state.raiders.every(r => r.dead || r.health <= 0), 65, 'drafted defenders should defeat the first raid');
  until(game, () => game.state.stats.survivedRaids >= 1, 5, 'raid clearance should update survival progress');
  assert.ok(game.state.stats.raidersDefeated >= 1);
  assert.ok(game.state.colonists.some(p => !p.dead));
});

test('a drafted attack flanks an occluding wall even when its target is already within weapon range', () => {
  const game = sandbox({ meals: 20 });
  const attacker = game.state.colonists[0];
  attacker.x = 18.5;
  attacker.y = 15.5;
  for (let y = 14; y <= 17; y++) placeFixture(game, 'wall', 20, y);
  game.state.colonists.slice(1).forEach((pawn, i) => { pawn.x = 3.5 + i; pawn.y = 3.5; });
  for (const pawn of game.state.colonists) issue(game, 'draft', { id: pawn.id, value: true });
  issue(game, 'raid');
  game.state.raiders.forEach((raider, i) => {
    Object.assign(raider, { x: i ? 45.5 : 22.5, y: i ? 29.5 : 15.5,
      thinkAt: 1e5, shotCooldown: 1e5, path: [], destination: null });
  });
  const target = game.state.raiders[0];
  const before = target.health;
  issue(game, 'attack', { id: attacker.id, targetId: target.id });
  until(game, () => target.health < before, 20,
    'a reachable target hidden by a wall should make the drafted resident move around it and fire');
  assert.ok(Math.hypot(attacker.x - 18.5, attacker.y - 15.5) > 1, 'the attacker must actually change firing position');
  assert.equal(target.x, 22.5);
  assert.equal(target.y, 15.5);
  for (let y = 14; y <= 17; y++) {
    assert.equal(game.tile(20, y).building.hp, BUILDINGS.wall.hp,
      'the route must work without destroying the occluding wall');
  }
});

test('automatic medical work uses medicine, stops bleeding, and improves an injured colonist', () => {
  const game = sandbox({ meals: 30, medicine: 4 });
  const [doctor, patient] = game.state.colonists;
  setWork(game, doctor, { doctor: 1 });
  patient.health = 45;
  patient.bleed = 0.12;
  const medicineBefore = game.state.resources.medicine;
  until(game, () => patient.health > 70 && patient.bleed === 0, 90, 'doctor should stabilize and treat the patient');
  assert.ok(game.state.resources.medicine < medicineBefore, 'effective treatment should consume medicine');
  assert.ok(patient.health <= 100);
  assert.equal(patient.dead, false);
  assertResourceNumbers(game);
});

test('mid-job JSON round-trip retains seeded future behavior and does not alias the save', () => {
  const original = new ColonyGame({ seed: 404, difficulty: 'relaxed' });
  advance(original, 6);
  original.update(0.035); // Preserve a nonempty fixed-step remainder in the save.
  const encoded = JSON.stringify(original.toJSON());
  const data = JSON.parse(encoded);
  const restored = ColonyGame.fromJSON(data);
  assert.deepEqual(restored.toJSON(), original.toJSON(), 'the complete authoritative state should survive JSON');
  assert.notEqual(restored.state, original.state);
  assert.notEqual(restored.state, data);
  original.command('raid');
  restored.command('raid');
  for (const dt of [0.03, 0.27, 0.5, 1.2, 0.11, 0.59, 2.0, 0.25]) {
    original.update(dt);
    restored.update(dt);
  }
  assert.deepEqual(restored.toJSON(), original.toJSON(), 'restored RNG, reservations, and fixed-step remainder must reproduce the same future');
  assert.equal(JSON.stringify(data), encoded, 'loading and progressing must not mutate the caller-owned save');
});

test('malformed and unsupported saves are rejected before entering the simulation', () => {
  const valid = new ColonyGame({ seed: 19 }).toJSON();
  const mutate = fn => { const state = structuredClone(valid); fn(state); return state; };
  const badSaves = [
    null,
    {},
    mutate(s => { s.version = 999; }),
    mutate(s => { s.tiles.pop(); }),
    mutate(s => { s.resources.wood = -5; }),
    mutate(s => { s.resources.meals = Number.NaN; }),
    mutate(s => { s.colonists[0].x = Number.POSITIVE_INFINITY; }),
    mutate(s => { s.colonists[1].id = s.colonists[0].id; }),
  ];
  for (const data of badSaves) assert.throws(() => ColonyGame.fromJSON(data), 'invalid imported state should be rejected');
});

test('research needs an accessible completed bench and real labor before unlocking technology', () => {
  const game = sandbox({ wood: 100, steel: 100, meals: 30 });
  const [builder, researcher] = game.state.colonists;
  const rejected = game.command('research', { id: 'refrigeration' });
  assert.equal(rejected.ok, false, 'dependent research cannot start without electricity');
  assert.equal(game.command('build', { kind: 'solar', x: 20, y: 14 }).ok, false);
  assert.equal(game.command('build', { kind: 'beacon', x: 20, y: 14 }).ok, false);
  issue(game, 'research', { id: 'electricity' });
  setWork(game, researcher, { research: 1 });
  advance(game, 15);
  assert.equal(game.state.research.progress.electricity, 0, 'selecting research does not create points');
  issue(game, 'build', { kind: 'researchbench', x: 20, y: 15 });
  advance(game, 10);
  assert.equal(game.state.research.progress.electricity, 0, 'a blueprint is not a usable research station');
  setWork(game, builder, { build: 1 });
  until(game, () => game.tile(20, 15).building?.complete, 80, 'the bench should be built through material delivery and work');
  setWork(game, builder, {});
  until(game, () => game.state.research.progress.electricity > 5, 40, 'resident labor should create research points');
  assert.equal(researcher.job?.type, 'research');
  const partial = game.state.research.progress.electricity;
  issue(game, 'draft', { id: researcher.id, value: true });
  advance(game, 10);
  assert.equal(game.state.research.progress.electricity, partial, 'drafting must stop the interrupted research job');
  assert.equal(Object.values(game.state.reservations).some(r => r.owner === researcher.id), false);
  issue(game, 'draft', { id: researcher.id, value: false });
  until(game, () => game.state.research.unlocked.includes('electricity'), 180, 'research should complete from accumulated work');
  assert.equal(game.state.research.progress.electricity, RESEARCH.electricity.points);
  assert.equal(game.state.research.active, null);
  issue(game, 'build', { kind: 'solar', x: 23, y: 14 });
  assert.equal(game.command('build', { kind: 'cooler', x: 24, y: 14 }).ok, false);
  issue(game, 'research', { id: 'refrigeration' });
  until(game, () => game.state.research.progress.refrigeration > 2, 40, 'next technology should also require work');
  const refrigerationPoints = game.state.research.progress.refrigeration;
  issue(game, 'research', { id: 'communications' });
  assert.equal(game.state.research.progress.refrigeration, refrigerationPoints, 'switching keeps earlier progress');
  assert.equal(game.state.research.progress.communications, 0, 'switching itself gives no new points');
});

test('unreachable research stations give no points and one bench cannot be used by two workers at once', () => {
  const game = sandbox({ meals: 20 });
  placeFixture(game, 'researchbench', 20, 15);
  for (const [x, y] of [[19, 15], [21, 15], [20, 14], [20, 16]]) placeFixture(game, 'wall', x, y);
  refreshSystems(game);
  for (const pawn of game.state.colonists.slice(0, 2)) setWork(game, pawn, { research: 1 });
  advance(game, 20);
  assert.equal(game.state.research.progress.electricity, 0);
  issue(game, 'demolish', { x: 19, y: 15 });
  until(game, () => game.state.research.progress.electricity > 5, 40, 'opening access should permit research', () => {
    assert.ok(game.state.colonists.filter(c => c.job?.type === 'research').length <= 1,
      'reservation must prevent concurrent use of one bench');
  });
});

test('repairs consume real material and cannot regenerate a damaged structure when supply is exhausted', () => {
  const game = sandbox({ wood: 2, meals: 15 });
  const builder = game.state.colonists[0];
  const wall = placeFixture(game, 'wall', 19, 13);
  wall.hp -= 70;
  setWork(game, builder, { build: 1 });
  issue(game, 'autoRepair', { value: true });
  until(game, () => wall.hp === wall.maxHp, 90, 'a builder should fetch material and repair damage');
  assert.equal(total(game, 'wood'), 0, 'two repair batches must consume two units for seventy HP');
  wall.hp -= 30;
  const damaged = wall.hp;
  advance(game, 25);
  assert.equal(wall.hp, damaged, 'an empty warehouse cannot supply free repairs');
  assertResourceNumbers(game);
});

test('drafting during repair returns the material once and clears the building reservation', () => {
  const game = sandbox({ wood: 1 });
  const worker = game.state.colonists[0];
  const wall = placeFixture(game, 'wall', 28, 15);
  wall.hp -= 35;
  setWork(game, worker, { build: 1 });
  issue(game, 'autoRepair', { value: true });
  until(game, () => worker.job?.type === 'repair' && worker.carry?.type === 'wood', 40,
    'repair worker should fetch one actual material');
  const damaged = wall.hp;
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(total(game, 'wood'), 1);
  assert.equal(wall.hp, damaged, 'canceling before work does not apply a free repair');
  assert.equal(Object.values(game.state.reservations).some(r => r.owner === worker.id), false);
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(total(game, 'wood'), 1, 'repeated interruption must not duplicate material');
});

test('prioritize overrides disabled routine work but invalid targets preserve the current job', () => {
  const game = sandbox();
  const worker = game.state.colonists[0];
  Object.assign(game.tile(21, 15), { feature: 'tree', amount: 13 });
  issue(game, 'designate', { x: 21, y: 15, kind: 'chop' });
  advance(game, 3);
  assert.equal(total(game, 'wood'), 0);
  issue(game, 'prioritize', { id: worker.id, x: 21, y: 15 });
  assert.equal(worker.job?.type, 'harvest');
  const before = structuredClone({ job: worker.job, carry: worker.carry, reservations: game.state.reservations });
  const rejected = game.command('prioritize', { id: worker.id, x: 2, y: 2 });
  assert.equal(rejected.ok, false);
  assert.deepEqual({ job: worker.job, carry: worker.carry, reservations: game.state.reservations }, before);
  until(game, () => total(game, 'wood') === 13, 40, 'forced work should finish despite routine harvest priority zero');
  assert.equal(game.state.resources.wood, 0, 'forced extraction still creates a physical loose drop');
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(game.command('prioritize', { id: worker.id, x: 21, y: 15 }).ok, false);
});

test('group movement assigns distinct reachable cells and reports partial valid membership', () => {
  const game = sandbox();
  const [a, b, undrafted] = game.state.colonists;
  for (const pawn of [a, b]) issue(game, 'draft', { id: pawn.id, value: true });
  game.tile(24, 16).terrain = 'water';
  const result = issue(game, 'moveGroup', { ids: [a.id, b.id, undrafted.id, 'missing'], x: 24, y: 15 });
  assert.match(result.message, /2/, 'partial group movement must report how many residents accepted the order');
  assert.equal(a.order?.type, 'move');
  assert.equal(b.order?.type, 'move');
  assert.notDeepEqual(a.destination, b.destination);
  until(game, () => a.path.length === 0 && b.path.length === 0, 30, 'both valid drafted members should reach their cells');
  assert.notEqual(`${Math.floor(a.x)},${Math.floor(a.y)}`, `${Math.floor(b.x)},${Math.floor(b.y)}`);
  assert.notEqual(game.tile(Math.floor(a.x), Math.floor(a.y)).terrain, 'water');
  assert.notEqual(game.tile(Math.floor(b.x), Math.floor(b.y)).terrain, 'water');
  assert.notEqual(undrafted.order?.type, 'move');
});

test('the immutable released v1 save migrates active jobs without rebuilding its map or changing supplies', () => {
  const bytes = readFileSync(new URL('./fixtures/v1-colony.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '76e4c1fc6b974ddb0ef9ab621325279414edd8b06d9adcf81c0039cc8d1d19fe', 'the real prior-release fixture must stay unchanged');
  const previous = JSON.parse(bytes);
  const callerCopy = structuredClone(previous);
  const migrated = ColonyGame.fromJSON(previous);
  assert.equal(migrated.state.version, 4);
  assert.equal(migrated.state.time, previous.time);
  for (const [type, count] of Object.entries(previous.resources)) assert.equal(migrated.state.resources[type], count);
  for (const type of ['silver', 'rifle', 'armor', 'tool']) assert.equal(migrated.state.resources[type], 0);
  assert.deepEqual(migrated.state.tiles.map(t => t.building?.type || null), previous.tiles.map(t => t.building?.type || null),
    'migration cannot add the new starter room or research bench to an existing map');
  for (let i = 0; i < previous.colonists.length; i++) {
    const oldPawn = previous.colonists[i], pawn = migrated.state.colonists[i];
    assert.equal(pawn.x, oldPawn.x);
    assert.equal(pawn.y, oldPawn.y);
    assert.deepEqual(pawn.job, oldPawn.job, 'active construction/haul intent must be preserved');
    assert.ok(Number.isFinite(pawn.skills.research));
    assert.ok(Number.isInteger(pawn.priorities.research));
  }
  assert.deepEqual(previous, callerCopy, 'migration must not mutate the imported object');
  const replay = ColonyGame.fromJSON(previous);
  for (const dt of [0.13, 0.47, 2, 0.9, 4.6]) { migrated.update(dt); replay.update(dt); }
  assert.deepEqual(migrated.toJSON(), replay.toJSON(), 'migration must reproduce the same future twice');
  assertResourceNumbers(migrated);
  assert.equal(createHash('sha256').update(readFileSync(new URL('./fixtures/v1-colony.json', import.meta.url))).digest('hex'),
    '76e4c1fc6b974ddb0ef9ab621325279414edd8b06d9adcf81c0039cc8d1d19fe');
});

test('old completed victories remain victories and legacy queued beacons receive compatible technology', () => {
  const oldWon = JSON.parse(readFileSync(new URL('./fixtures/v1-colony.json', import.meta.url)));
  oldWon.victory = true;
  oldWon.beaconProgress = 1;
  const won = ColonyGame.fromJSON(oldWon);
  assert.equal(won.state.victory, true);
  assert.equal(won.state.beaconProgress, 1);
  advance(won, 1);
  assert.equal(won.state.victory, true);
  const oldQueued = JSON.parse(readFileSync(new URL('./fixtures/v1-colony.json', import.meta.url)));
  const tile = oldQueued.tiles.find(t => t.x === 24 && t.y === 13);
  tile.building = { id: 'legacy_beacon_fixture', type: 'beacon', hp: 200, maxHp: 200,
    complete: false, progress: 0.3, paidCost: { wood: 40, steel: 40 }, materials: {}, refunded: false };
  oldQueued.beaconProgress = 0.3;
  const queued = ColonyGame.fromJSON(oldQueued);
  assert.equal(queued.tile(24, 13).building.type, 'beacon');
  assert.equal(queued.tile(24, 13).building.progress, 0.3);
  assert.equal(queued.state.beaconProgress, 0.3);
  assert.ok(queued.state.research.unlocked.includes('electricity'));
  assert.ok(queued.state.research.unlocked.includes('communications'));
});

test('imports reject malformed research, thermal, electrical, and food ledger state', () => {
  const valid = new ColonyGame({ seed: 91 }).toJSON();
  const mutate = fn => { const state = structuredClone(valid); fn(state); return state; };
  const badSaves = [
    mutate(s => { s.research.progress.electricity = -1; }),
    mutate(s => { s.research.active = 'missing_technology'; }),
    mutate(s => { s.research.unlocked = ['communications']; }),
    mutate(s => { s.foodBatches.meals[0].freshness = 2; }),
    mutate(s => { s.foodBatches.meals[0].count += 1; }),
    mutate(s => { s.tiles[0].temperature = Number.NaN; }),
    mutate(s => { s.power.stored = -1; }),
    mutate(s => { s.colonists[0].thermalStress = Number.POSITIVE_INFINITY; }),
  ];
  for (const save of badSaves) assert.throws(() => ColonyGame.fromJSON(save));
});

test('extraction charging separately requires indoor beds, communications, and a powered beacon', () => {
  const game = sandbox({ meals: 30 });
  game.state.time = 20;
  game.state.stats.survivedRaids = 1;
  game.state.research = { active: null,
    progress: { electricity: 100, refrigeration: 0, communications: 180 },
    unlocked: ['electricity', 'communications'] };
  for (const x of [21, 23, 25]) placeFixture(game, 'bed', x, 13);
  placeFixture(game, 'beacon', 25, 16);
  placeFixture(game, 'solar', 26, 16);
  refreshSystems(game);
  advance(game, 1);
  assert.equal(game.state.beaconProgress, 0, 'outdoor beds do not satisfy extraction shelter');
  encloseFixture(game, 19, 11, 27, 19);
  game.state.research.unlocked = ['electricity'];
  game.state.research.progress.communications = 0;
  advance(game, 1);
  assert.equal(game.state.beaconProgress, 0, 'a physical beacon cannot replace communications research');
  game.state.research.unlocked.push('communications');
  game.state.research.progress.communications = 180;
  game.tile(26, 16).building = null;
  refreshSystems(game);
  advance(game, 1);
  assert.equal(game.state.beaconProgress, 0, 'an unpowered beacon cannot charge');
  placeFixture(game, 'solar', 26, 16);
  refreshSystems(game);
  advance(game, 1);
  assert.ok(game.state.beaconProgress > 0, 'all fulfilled conditions must enable real charging');
});
