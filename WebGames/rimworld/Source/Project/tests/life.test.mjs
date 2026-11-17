import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame, SCHEDULE_MODES } from '../dist/engine.js';
import { sandbox, placeFixture, issue, setWork, total, advance, until } from './helpers.mjs';

function currentHour(game) { return Math.floor(game.getSummary().hour); }

test('schedule commands validate their whole input and keep exactly twenty-four legal hourly modes', () => {
  const game = sandbox();
  const pawn = game.state.colonists[0];
  assert.deepEqual(Object.keys(SCHEDULE_MODES).sort(), ['anything', 'recreation', 'sleep', 'work']);
  const invalid = [
    ['schedule', { id: pawn.id, hour: -1, mode: 'work' }],
    ['schedule', { id: pawn.id, hour: 24, mode: 'work' }],
    ['schedule', { id: pawn.id, hour: 3.5, mode: 'work' }],
    ['schedule', { id: pawn.id, hour: 8, mode: 'missing' }],
    ['schedule', { id: 'missing', hour: 8, mode: 'work' }],
    ['schedulePreset', { id: pawn.id, preset: 'missing' }],
  ];
  for (const [type, payload] of invalid) {
    const before = game.toJSON();
    assert.equal(game.command(type, payload).ok, false);
    assert.deepEqual(game.toJSON(), before, 'invalid schedule input must be read-only');
  }
  issue(game, 'schedule', { id: pawn.id, hour: 23, mode: 'recreation' });
  assert.equal(pawn.schedule[23], 'recreation');
  assert.equal(pawn.schedule.length, 24);
  assert.equal(pawn.schedule.slice(0, 23).every(mode => mode === 'anything'), true);
  issue(game, 'schedulePreset', { id: pawn.id, preset: 'night' });
  assert.equal(pawn.schedule.length, 24);
  assert.equal(pawn.schedule.every(mode => Object.hasOwn(SCHEDULE_MODES, mode)), true);
  assert.ok(pawn.schedule.includes('work') && pawn.schedule.includes('sleep'));
  const other = game.state.colonists[1];
  const otherSchedule = [...other.schedule];
  issue(game, 'schedule', { id: pawn.id, hour: 0, mode: 'recreation' });
  assert.deepEqual(other.schedule, otherSchedule, 'resident schedules cannot share a mutable array');
});

test('a work-to-sleep transition releases ordinary hauled cargo and its reservation without loss', () => {
  const game = sandbox();
  const worker = game.state.colonists[0];
  const bed = placeFixture(game, 'bed', 18, 13);
  game.state.time = 4.1; // 08:49; the next hourly boundary is at simulation time 5.
  worker.energy = 60;
  issue(game, 'schedule', { id: worker.id, hour: 8, mode: 'work' });
  issue(game, 'schedule', { id: worker.id, hour: 9, mode: 'sleep' });
  game.state.items.push({ id: 'fixture_schedule_cargo', x: 18, y: 14,
    type: 'wood', count: 7, reservedBy: null });
  setWork(game, worker, { haul: 1 });
  until(game, () => worker.carry?.type === 'wood', 0.75, 'the worker should pick up cargo before the next hour');
  until(game, () => worker.job?.type === 'rest', 5, 'the new sleep block should interrupt ordinary work');
  assert.equal(worker.job.targetId, bed.id);
  assert.equal(worker.carry, null);
  assert.equal(total(game, 'wood'), 7);
  assert.equal(game.state.items.some(i => i.reservedBy === worker.id), false);
});

test('scheduled sleep preserves a forced job until critical hunger interrupts it for real food', () => {
  const game = sandbox({ meals: 10 });
  const worker = game.state.colonists[0];
  placeFixture(game, 'bed', 18, 13);
  game.state.time = 4.1;
  worker.energy = 60;
  issue(game, 'schedule', { id: worker.id, hour: 8, mode: 'work' });
  issue(game, 'schedule', { id: worker.id, hour: 9, mode: 'sleep' });
  Object.assign(game.tile(25, 15), { feature: 'ore', amount: 15 });
  issue(game, 'designate', { x: 25, y: 15, kind: 'mine' });
  issue(game, 'prioritize', { id: worker.id, x: 25, y: 15 });
  advance(game, 2);
  assert.equal(worker.job?.type, 'mine');
  assert.equal(worker.job.forced, true);
  worker.hunger = 3;
  const before = total(game, 'meals');
  until(game, () => worker.hunger > 40, 35, 'urgent hunger must override even a forced scheduled work item');
  assert.ok(total(game, 'meals') < before);
  assert.equal(total(game, 'steel'), 0, 'interrupted mining cannot grant unfinished production');
});

test('rescue and fire emergencies take priority over ordinary sleep and recreation blocks', () => {
  for (const emergency of ['rescue', 'firefight']) {
    const game = sandbox({ meals: 10 });
    const [worker, helper, patient] = game.state.colonists;
    worker.energy = 60;
    worker.recreation = 10;
    placeFixture(game, 'bed', 18, 13);
    placeFixture(game, 'horseshoes', 19, 15);
    const mode = emergency === 'rescue' ? 'sleep' : 'recreation';
    issue(game, 'schedule', { id: worker.id, hour: currentHour(game), mode });
    setWork(game, worker, { [emergency]: 1 });
    until(game, () => worker.job?.type === (mode === 'sleep' ? 'rest' : 'recreate'), 10,
      `the resident should first be following their ${mode} block`);
    if (emergency === 'rescue') {
      const bed = placeFixture(game, 'bed', 24, 17);
      issue(game, 'medicalBed', { x: 24, y: 17, value: true });
      Object.assign(patient, { x: 23.5, y: 18.5, health: 8 });
      assert.equal(bed.medical, true);
    } else {
      issue(game, 'ignite', { x: 21, y: 15, strength: 0.65 });
    }
    until(game, () => worker.job?.type === emergency, 12,
      `the ${emergency} priority should interrupt the noncritical scheduled activity`);
    assert.equal(helper.carryingPawnId, null);
  }
});

test('new fires interrupt noncritical sleep and eating while critical recovery and meal quantities remain protected', () => {
  for (const critical of [false, true]) {
    const game = sandbox();
    const worker = game.state.colonists[0];
    worker.energy = critical ? 8 : 50;
    placeFixture(game, 'bed', 18, 14);
    issue(game, 'schedule', { id: worker.id, hour: currentHour(game), mode: 'sleep' });
    setWork(game, worker, { firefight: 1 });
    until(game, () => worker.job?.type === 'rest', 5, 'the resident must already be sleeping before the fire starts');
    issue(game, 'ignite', { x: 21, y: 15, strength: 0.75 });
    if (critical) {
      advance(game, 0.5);
      assert.ok(worker.energy < 12);
      assert.equal(worker.job?.type, 'rest', 'critical exhaustion must retain its immediate recovery');
      until(game, () => worker.energy >= 12, 5, 'the exhausted resident should recover enough energy to help');
    }
    until(game, () => worker.job?.type === 'firefight', 3,
      'a rested resident should respond without waiting for a complete sleep cycle');
    assert.ok(worker.energy < 85, 'the test must observe an actual interruption rather than completed sleep');
  }
  for (const critical of [false, true]) {
    const game = sandbox({ meals: 3 });
    const worker = game.state.colonists[0];
    worker.hunger = critical ? 10 : 40;
    setWork(game, worker, { firefight: 1 });
    until(game, () => worker.job?.type === 'eat' && worker.carry?.type === 'meals', 15,
      'the resident must be holding a real fetched meal when the fire appears');
    const hunger = worker.hunger, freshness = worker.carry.freshness;
    issue(game, 'ignite', { x: 13, y: 15, strength: 0.75 });
    if (critical) {
      advance(game, 0.5);
      assert.equal(worker.job?.type, 'eat', 'critical hunger must retain its real meal');
      assert.ok(worker.hunger < 25);
      until(game, () => worker.hunger > 40, 5, 'the critical meal should be consumed before emergency work');
      assert.equal(total(game, 'meals'), 2);
    } else {
      until(game, () => worker.job?.type === 'firefight', 3, 'ordinary eating should yield to nearby fire');
      assert.equal(total(game, 'meals'), 3, 'an interrupted unconsumed meal must be dropped exactly once');
      assert.ok(worker.hunger <= hunger, 'interruption cannot grant free meal nutrition');
      assert.ok(game.state.items.filter(i => i.type === 'meals').every(i => i.freshness <= freshness));
    }
  }
});

test('a reachable recreation post provides gradual, better recreation than its unreachable fallback', () => {
  const accessible = sandbox(), blocked = sandbox();
  for (const game of [accessible, blocked]) {
    const pawn = game.state.colonists[0];
    pawn.recreation = 10;
    placeFixture(game, 'horseshoes', 19, 15);
    issue(game, 'schedule', { id: pawn.id, hour: currentHour(game), mode: 'recreation' });
    assert.equal(pawn.recreation, 10, 'a timetable click gives no instant recreation');
  }
  for (const [x, y] of [[18, 15], [20, 15], [19, 14], [19, 16]]) placeFixture(blocked, 'wall', x, y);
  let usedPost = false;
  advance(accessible, 12, () => {
    if (accessible.state.colonists[0].job?.type === 'recreate'
      && accessible.state.colonists[0].job.targetId === accessible.tile(19, 15).building.id) usedPost = true;
  });
  advance(blocked, 12);
  const withPost = accessible.state.colonists[0].recreation;
  const fallback = blocked.state.colonists[0].recreation;
  assert.equal(usedPost, true);
  assert.ok(withPost > 15 && withPost <= 100);
  assert.ok(fallback > 10 && fallback < withPost,
    'an unreachable post may allow simple recreation but cannot grant the post benefit remotely');
  const factors = accessible.getMoodFactors(accessible.state.colonists[0]);
  assert.ok(Array.isArray(factors) && factors.every(f => typeof f.label === 'string' && Number.isFinite(f.value)));
});

test('directional cover protects the exposed side only and hold stops movement while retaining defensive fire', () => {
  const game = sandbox({ meals: 10 });
  const pawn = game.state.colonists[0];
  Object.assign(pawn, { x: 18.5, y: 15.5 });
  placeFixture(game, 'sandbag', 17, 15);
  const front = game._cover(pawn, { x: 13.5, y: 15.5 });
  const rear = game._cover(pawn, { x: 23.5, y: 15.5 });
  assert.ok(front > 0);
  assert.equal(rear, 0, 'a sandbag behind the resident must not shield an attack from the other side');
  assert.ok(Number.isFinite(game._cover(pawn)), 'the optional attacker argument must remain backward compatible');
  assert.equal(game.command('hold', { id: pawn.id }).ok, false);
  issue(game, 'draft', { id: pawn.id, value: true });
  issue(game, 'move', { id: pawn.id, x: 28, y: 15 });
  advance(game, 0.5);
  issue(game, 'hold', { id: pawn.id });
  const heldAt = { x: pawn.x, y: pawn.y };
  assert.equal(pawn.path.length, 0);
  assert.equal(pawn.order.type, 'hold');
  issue(game, 'raid');
  game.state.raiders.forEach((r, i) => Object.assign(r, { x: i ? 45.5 : heldAt.x + 3,
    y: i ? 28.5 : heldAt.y, thinkAt: 1e5, shotCooldown: 1e5, path: [], destination: null }));
  const target = game.state.raiders[0], health = target.health;
  until(game, () => target.health < health, 8, 'a holding defender must still shoot nearby visible enemies');
  assert.equal(pawn.x, heldAt.x);
  assert.equal(pawn.y, heldAt.y);
  const restored = ColonyGame.fromJSON(game.toJSON());
  assert.equal(restored.state.colonists[0].order.type, 'hold');
});
