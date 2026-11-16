import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame, EQUIPMENT } from '../dist/engine.js';
import { updateHazards } from '../dist/hazards.js';
import { sandbox, placeFixture, issue, setWork, total, advance, until } from './helpers.mjs';

function equip(game, pawn, item) {
  issue(game, 'equip', { id: pawn.id, item });
  until(game, () => pawn.equipment[EQUIPMENT[item].slot] === item, 30, `fetch and equip ${item}`);
}

function enemy(game, distance = 4, shooting = false) {
  const pawn = game.state.colonists[0];
  Object.assign(pawn, { x: 18.5, y: 15.5, shotCooldown: shooting ? 1000 : 0 });
  for (const other of game.state.colonists.slice(1)) {
    Object.assign(other, { x: 2.5, y: 2.5, shotCooldown: 1000 });
    issue(game, 'draft', { id: other.id, value: true });
    issue(game, 'hold', { id: other.id });
  }
  issue(game, 'draft', { id: pawn.id, value: true });
  issue(game, 'hold', { id: pawn.id });
  const raider = { id: 'equipment_test_raider', x: pawn.x + distance, y: pawn.y,
    health: 1000, maxHp: 1000, dead: false, status: 'test target', path: [],
    destination: null, shotCooldown: shooting ? 0 : 1000, thinkAt: 1e8, targetId: null };
  game.state.raiders = [raider];
  game.state.activeRaid = true;
  return { pawn, raider };
}

test('equipment is fetched from stock, takes real time, and competing requests cannot duplicate the last item', () => {
  const game = sandbox({ rifle: 1 });
  const [first, second] = game.state.colonists;
  issue(game, 'equip', { id: first.id, item: 'rifle' });
  const other = game.command('equip', { id: second.id, item: 'rifle' });
  assert.equal(typeof other.ok, 'boolean');
  assert.equal(first.equipment.weapon, null);
  assert.equal(game.state.resources.rifle, 1, 'the command alone cannot teleport or debit an item');
  until(game, () => game.state.colonists.some(c => c.carry?.type === 'rifle'), 20,
    'one actual worker must reach the warehouse', () => assert.equal(total(game, 'rifle'), 1));
  const worker = game.state.colonists.find(c => c.carry?.type === 'rifle');
  assert.equal(worker.equipment.weapon, null);
  assert.equal(game.state.resources.rifle, 0);
  advance(game, 0.75);
  assert.equal(worker.equipment.weapon, null, 'equipping must require the promised 1.5 seconds');
  until(game, () => worker.equipment.weapon === 'rifle', 3, 'equipment work should finish');
  advance(game, 5);
  assert.equal(game.state.colonists.filter(c => c.equipment.weapon === 'rifle').length, 1);
  assert.equal(total(game, 'rifle'), 1);
  const before = game.toJSON();
  assert.equal(game.command('equip', { id: worker.id, item: 'rifle' }).ok, false);
  assert.deepEqual(game.toJSON(), before, 'repeating an already-equipped item must not stack a benefit');
  issue(game, 'unequip', { id: worker.id, slot: 'weapon' });
  assert.equal(worker.equipment.weapon, null);
  assert.ok(game.state.items.some(i => i.type === 'rifle' && i.x === Math.floor(worker.x) && i.y === Math.floor(worker.y)));
  assert.equal(game.command('unequip', { id: worker.id, slot: 'weapon' }).ok, false);
  assert.equal(game.command('equip', { id: worker.id, item: 'rifle' }).ok, false, 'loose gear must be hauled before equipping');
  assert.equal(total(game, 'rifle'), 1);
});

test('failed equipment commands preserve work and interrupting a fetched item returns it only once', () => {
  const game = sandbox({ tool: 1 });
  const worker = game.state.colonists[0];
  Object.assign(game.tile(22, 14), { feature: 'ore', amount: 16 });
  issue(game, 'designate', { x: 22, y: 14, kind: 'mine' });
  issue(game, 'prioritize', { id: worker.id, x: 22, y: 14 });
  for (const payload of [{ id: worker.id, item: 'missing' }, { id: worker.id, item: 'rifle' }, { id: 'missing', item: 'tool' }]) {
    const before = game.toJSON();
    assert.equal(game.command('equip', payload).ok, false);
    assert.deepEqual(game.toJSON(), before);
  }
  issue(game, 'equip', { id: worker.id, item: 'tool' });
  until(game, () => worker.carry?.type === 'tool', 25, 'equipment should be in transit');
  const snapshot = game.toJSON(), copy = ColonyGame.fromJSON(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(copy.toJSON(), snapshot);
  for (const dt of [0.037, 0.22, 0.31, 0.17]) { game.update(dt); copy.update(dt); }
  assert.deepEqual(copy.toJSON(), game.toJSON(), 'mid-equip progress and ownership must be deterministic');
  issue(game, 'draft', { id: worker.id, value: true });
  assert.equal(worker.carry, null);
  assert.equal(worker.equipment.tool, null);
  assert.equal(total(game, 'tool'), 1);
  const before = game.toJSON();
  assert.equal(game.command('equip', { id: worker.id, item: 'tool' }).ok, false);
  assert.deepEqual(game.toJSON(), before, 'drafted equip must not change any state');
  issue(game, 'draft', { id: worker.id, value: true });
  advance(game, 0.5);
  assert.equal(total(game, 'tool'), 1);
  assert.doesNotThrow(() => ColonyGame.fromJSON(game.toJSON()));
});

test('downed residents retain their equipment and death returns every slot exactly once', () => {
  const game = sandbox({ rifle: 1, armor: 1, tool: 1 });
  const pawn = game.state.colonists[0];
  for (const item of ['rifle', 'armor', 'tool']) equip(game, pawn, item);
  pawn.health = 10;
  advance(game, 0.25);
  assert.deepEqual(pawn.equipment, { weapon: 'rifle', armor: 'armor', tool: 'tool' });
  assert.equal(game.state.items.some(i => ['rifle', 'armor', 'tool'].includes(i.type)), false);
  pawn.health = 0.01; pawn.bleed = 1;
  until(game, () => pawn.dead, 1, 'the critically wounded pawn should die');
  assert.deepEqual(pawn.equipment, { weapon: null, armor: null, tool: null });
  for (const item of ['rifle', 'armor', 'tool']) assert.equal(total(game, item), 1);
  advance(game, 2);
  for (const item of ['rifle', 'armor', 'tool']) {
    assert.equal(total(game, item), 1);
    assert.equal(game.state.items.filter(i => i.type === item).reduce((n, i) => n + i.count, 0), 1);
  }
  assert.doesNotThrow(() => ColonyGame.fromJSON(game.toJSON()));
});

test('an actually equipped rifle changes real range, bullet damage, accuracy, and firing interval', () => {
  const source = sandbox({ rifle: 1 });
  equip(source, source.state.colonists[0], 'rifle');
  for (const scenario of ['range', 'damage', 'accuracy']) {
    const rifle = ColonyGame.fromJSON(source.toJSON()), pistol = ColonyGame.fromJSON(source.toJSON());
    issue(pistol, 'unequip', { id: pistol.state.colonists[0].id, slot: 'weapon' });
    const a = enemy(rifle, scenario === 'range' ? 8 : 4), b = enemy(pistol, scenario === 'range' ? 8 : 4);
    // Seed 1 hits both; seed 13824 has a first roll between the two hit thresholds.
    rifle.state.rngState = pistol.state.rngState = scenario === 'accuracy' ? 13824 : 1;
    rifle.state.accumulator = pistol.state.accumulator = 0;
    rifle.update(0.1); pistol.update(0.1);
    if (scenario === 'range') {
      assert.ok(a.raider.health < 1000);
      assert.equal(b.raider.health, 1000);
      assert.equal(a.pawn.x, 18.5); assert.equal(b.pawn.x, 18.5, 'hold must keep both test actors stationary');
    } else if (scenario === 'damage') {
      assert.ok(Math.abs((1000 - a.raider.health) / (1000 - b.raider.health) - 1.35) < 1e-10);
      assert.equal(a.pawn.shotCooldown, 1.2);
      assert.equal(b.pawn.shotCooldown, 1.35);
    } else {
      assert.ok(a.raider.health < 1000, 'the +4 percentage points must affect an actual hit decision');
      assert.equal(b.raider.health, 1000);
    }
  }
});

test('armor reduces actual bullet damage and bleeding, while fire damage stays unchanged', () => {
  const source = sandbox({ armor: 1 });
  equip(source, source.state.colonists[0], 'armor');
  const armored = ColonyGame.fromJSON(source.toJSON()), bare = ColonyGame.fromJSON(source.toJSON());
  issue(bare, 'unequip', { id: bare.state.colonists[0].id, slot: 'armor' });
  const a = enemy(armored, 4, true), b = enemy(bare, 4, true);
  armored.state.rngState = bare.state.rngState = 1;
  armored.state.accumulator = bare.state.accumulator = 0;
  armored.update(0.1); bare.update(0.1);
  assert.ok(Math.abs((100 - a.pawn.health) / (100 - b.pawn.health) - 0.65) < 1e-10);
  assert.ok(Math.abs(a.pawn.bleed / b.pawn.bleed - 0.65) < 1e-10);
  for (const game of [armored, bare]) issue(game, 'ignite', { x: 18, y: 15, strength: 0.6 });
  const beforeA = a.pawn.health, beforeB = b.pawn.health;
  updateHazards(armored, 0.5); updateHazards(bare, 0.5);
  assert.ok(beforeA > a.pawn.health);
  assert.ok(Math.abs((beforeA - a.pawn.health) - (beforeB - b.pawn.health)) < 1e-10,
    'ballistic armor must not silently grant fire resistance');
});

test('an equipped tool accelerates all six physical work categories without accelerating research, cooking, or medicine', () => {
  for (const work of ['build', 'repair', 'grow', 'harvest', 'mine', 'craft', 'research', 'cook', 'doctor']) {
    const source = sandbox({ tool: 1, wood: 40, steel: 40, rawfood: 4, medicine: 1 });
    const worker = source.state.colonists[0];
    equip(source, worker, 'tool');
    if (work === 'build') { setWork(source, worker, { build: 1 }); issue(source, 'build', { kind: 'workbench', x: 20, y: 14 }); }
    if (work === 'repair') { placeFixture(source, 'wall', 20, 14, { hp: 70 }); setWork(source, worker, { build: 1 }); issue(source, 'autoRepair', { value: true }); }
    if (work === 'grow') { setWork(source, worker, { grow: 1 }); issue(source, 'zone', { x: 20, y: 14, kind: 'farm' }); }
    if (work === 'harvest' || work === 'mine') {
      Object.assign(source.tile(20, 14), { feature: work === 'mine' ? 'ore' : 'tree', amount: 15 });
      setWork(source, worker, { [work]: 1 });
      issue(source, 'designate', { x: 20, y: 14, kind: work === 'mine' ? 'mine' : 'chop' });
    }
    if (work === 'craft') { placeFixture(source, 'workbench', 20, 14); setWork(source, worker, { craft: 1 }); issue(source, 'bill', { recipeId: 'armor', mode: 'count', target: 1, paused: false }); }
    if (work === 'research') { placeFixture(source, 'researchbench', 20, 14); setWork(source, worker, { research: 1 }); issue(source, 'research', { id: 'electricity' }); }
    if (work === 'cook') { placeFixture(source, 'stove', 20, 14); setWork(source, worker, { cook: 1 }); issue(source, 'autoCook', { value: true, target: 1 }); }
    if (work === 'doctor') { const patient = source.state.colonists[1]; patient.health = 45; patient.bleed = 0.05; setWork(source, worker, { doctor: 1 }); issue(source, 'tend', { id: worker.id, targetId: patient.id }); }
    until(source, () => worker.job?.type === work && worker.job.progress > 0 && !worker.path.length,
      100, `${work} must reach real on-site work`);
    const plain = ColonyGame.fromJSON(source.toJSON()), plainWorker = plain.state.colonists[0];
    issue(plain, 'unequip', { id: plainWorker.id, slot: 'tool' });
    const a = worker.job.progress, b = plainWorker.job.progress;
    source.update(0.2); plain.update(0.2);
    assert.equal(worker.job?.type, work); assert.equal(plainWorker.job?.type, work);
    const expected = ['build', 'repair', 'grow', 'harvest', 'mine', 'craft'].includes(work) ? 1.25 : 1;
    assert.ok(Math.abs((worker.job.progress - a) / (plainWorker.job.progress - b) - expected) < 1e-9,
      `${work} should have the documented actual progress multiplier ${expected}`);
  }
});
