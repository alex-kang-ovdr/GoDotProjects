import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../dist/engine.js';

const copy = value => JSON.parse(JSON.stringify(value));
function run(state, id, actionId) {
  const result = Core.performAction(state, id, actionId);
  assert.equal(result.ok, true, result.reason);
  const job = state.characters.find(person => person.id === id).job;
  if (job) Core.tickDay(state, job.remaining / 12);
  assert.equal(state.characters.find(person => person.id === id).job, null);
}
function sleepNight(state) {
  assert.equal(Core.endDay(state).ok, true);
  const plan = { scavengerId: null, locationId: null, loadout: {}, roles: Object.fromEntries(state.characters.filter(person => person.alive).map(person => [person.id, 'sleep'])) };
  assert.equal(Core.beginNight(state, plan).ok, true);
  assert.equal(Core.finishNight(state).ok, true);
}
function contacted(day = 4) {
  const state = Core.createGame(31);
  state.day = day;
  run(state, 'yun', 'buildRadio');
  run(state, 'mira', 'contactRelief');
  return state;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

test('radio is a paid timed facility with Yun bonus, cancellation and one-time morale', () => {
  const state = Core.createGame(31);
  const inventory = copy(state.inventory);
  const morale = state.characters.map(person => person.morale);
  assert.equal(Core.performAction(state, 'yun', 'buildRadio').ok, true);
  assert.equal(state.characters[1].job.total, 80);
  assert.equal(state.inventory.wood, inventory.wood - 2);
  assert.equal(state.inventory.parts, inventory.parts - 5);
  assert.equal(Core.getReliefStatus(state).stages[0].status, 'in-progress');
  assert.equal(Core.performAction(state, 'mira', 'buildRadio').ok, false);
  assert.equal(Core.cancelJob(state, 'yun').ok, true);
  assert.deepEqual(state.inventory, inventory);
  assert.equal(Core.cancelJob(state, 'yun').ok, false);
  run(state, 'yun', 'buildRadio');
  assert.equal(state.facilities.radio, 1);
  assert.deepEqual(state.characters.map(person => person.morale), morale.map(value => value + 3));
  const complete = copy(state);
  assert.equal(Core.performAction(state, 'yun', 'buildRadio').ok, false);
  assert.deepEqual(state, complete);
});

test('radio day gate, paid contact and concurrent rejection leave unsuccessful actions atomic', () => {
  const state = Core.createGame(31);
  for (const action of ['contactRelief', 'prepareEvacuation']) {
    const before = copy(state);
    assert.equal(Core.performAction(state, 'mira', action).ok, false);
    assert.deepEqual(state, before);
  }
  run(state, 'yun', 'buildRadio');
  assert.match(Core.getActions(state).find(action => action.id === 'contactRelief').reason, /4일/);
  state.day = 4;
  const stock = copy(state.inventory);
  assert.equal(Core.performAction(state, 'mira', 'contactRelief').ok, true);
  assert.equal(state.inventory.parts, stock.parts - 2);
  assert.equal(state.inventory.fuel, stock.fuel - 1);
  const running = copy(state);
  assert.equal(Core.performAction(state, 'leo', 'contactRelief').ok, false);
  assert.deepEqual(state, running);
  assert.equal(Core.cancelJob(state, 'mira').ok, true);
  assert.deepEqual(state.inventory, stock);
  assert.equal(state.relief.contacted, false);
  run(state, 'mira', 'contactRelief');
  assert.deepEqual(state.relief, { contacted: true, contactDay: 4, deliveryDay: 5, delivered: false, prepared: false, preparedDay: null });
  assert.equal(Core.isValidSave(state), true);
});

test('queue preview recognises future radio and contact without charging or completing early', () => {
  const state = Core.createGame(31);
  state.day = 9;
  const beforeStock = copy(state.inventory);
  assert.equal(Core.performAction(state, 'yun', 'buildRadio').ok, true);
  assert.equal(Core.enqueueAction(state, 'yun', 'contactRelief').ok, true);
  assert.equal(Core.enqueueAction(state, 'yun', 'prepareEvacuation').ok, true);
  assert.equal(Core.enqueueAction(state, 'yun', 'contactRelief').ok, false);
  assert.equal(state.inventory.parts, beforeStock.parts - 5);
  assert.equal(state.inventory.meal, beforeStock.meal);
  assert.equal(state.relief.contacted, false);
  assert.equal(Core.isValidSave(state), true);
  const resumed = Core.restoreGame(Core.serializeGame(state));
  const small = copy(resumed);
  Core.tickDay(resumed, 260 / 12);
  for (let i = 0; i < 26; i++) Core.tickDay(small, 10 / 12);
  assert.deepEqual(resumed, small);
  assert.equal(Core.getReliefStatus(resumed).completed, 3);
  assert.equal(resumed.relief.preparedDay, 9);
  assert.equal(resumed.inventory.parts, beforeStock.parts - 7);
  assert.equal(resumed.inventory.fuel, beforeStock.fuel - 1);
  assert.equal(resumed.inventory.meal, beforeStock.meal - 3);
  assert.equal(resumed.inventory.water, beforeStock.water - 4);
  assert.equal(resumed.inventory.bandage, beforeStock.bandage - 1);
});

test('competing queued contact plans settle only once and cannot multiply future deliveries', () => {
  const state = Core.createGame(31);
  state.day = 4;
  assert.equal(Core.performAction(state, 'yun', 'buildRadio').ok, true);
  assert.equal(Core.performAction(state, 'mira', 'rest').ok, true);
  assert.equal(Core.enqueueAction(state, 'mira', 'contactRelief').ok, true);
  assert.equal(Core.enqueueAction(state, 'yun', 'contactRelief').ok, true);
  Core.tickDay(state, 300 / 12);
  assert.equal(state.inventory.parts, 14 - 5 - 2);
  assert.equal(state.inventory.fuel, 3);
  assert.equal(state.relief.contacted, true);
  assert.equal(state.characters.every(person => !person.job && !person.queue.length), true);
  assert.equal(state.logs.filter(entry => entry.text.includes('구호팀과 연결되었습니다')).length, 1);
  assert.equal(Core.isValidSave(state), true);
});

test('contact delivery arrives once after overnight costs, is reported and survives save boundaries', () => {
  const state = contacted();
  // A focused night-cost fixture: tomorrow's fuel must not heat tonight.
  state.facilities.heater = 1;
  state.inventory.fuel = 0;
  const before = copy(state.inventory);
  assert.equal(Core.getReliefStatus(state).delivery.scheduled, true);
  sleepNight(state);
  assert.equal(state.relief.delivered, true);
  for (const [id, quantity] of Object.entries({ raw: 2, meds: 1, bandage: 1, fuel: 2 })) assert.equal(state.inventory[id], before[id] + quantity);
  assert.equal(state.characters.every(person => person.illness === 8), true);
  assert.equal(state.report.supplyDelta.fuel, 2);
  assert.match(state.report.items.map(item => item.text).join(' '), /보급이 5일째 아침 도착/);
  assert.equal(Core.isValidSave(state), true);
  const resumed = Core.restoreGame(Core.serializeGame(state));
  const deliveredStock = copy(resumed.inventory);
  assert.equal(Core.finishNight(resumed).ok, false);
  assert.deepEqual(resumed.inventory, deliveredStock);
  assert.equal(Core.nextDay(resumed).ok, true);
  assert.equal(Core.getReliefStatus(resumed).delivery.scheduled, false);
  const meds = resumed.inventory.meds;
  sleepNight(resumed);
  assert.equal(resumed.inventory.meds, meds);
  assert.equal(resumed.report.items.some(item => item.text.includes('구호팀의 보급')), false);
});

test('preparation day gate and shortage are atomic; cancelled pack refunds and completion consumes once', () => {
  const state = contacted(8);
  assert.match(Core.getActions(state).find(action => action.id === 'prepareEvacuation').reason, /9일/);
  sleepNight(state);
  Core.nextDay(state);
  state.inventory.meal = 2;
  const missing = copy(state);
  assert.equal(Core.performAction(state, 'mira', 'prepareEvacuation').ok, false);
  assert.deepEqual(state, missing);
  run(state, 'mira', 'cook');
  const stock = copy(state.inventory);
  assert.equal(Core.performAction(state, 'mira', 'prepareEvacuation').ok, true);
  assert.equal(Core.performAction(state, 'leo', 'prepareEvacuation').ok, false);
  assert.equal(Core.cancelJob(state, 'mira').ok, true);
  assert.deepEqual(state.inventory, stock);
  const morale = state.characters.map(person => person.morale);
  run(state, 'mira', 'prepareEvacuation');
  assert.deepEqual(state.characters.map(person => person.morale), morale.map(value => Math.min(100, value + 8)));
  assert.equal(state.relief.prepared, true);
  assert.equal(state.inventory.meal, stock.meal - 3);
  const completed = copy(state);
  assert.equal(Core.performAction(state, 'mira', 'prepareEvacuation').ok, false);
  assert.deepEqual(state, completed);
  assert.equal(Core.isValidSave(state), true);
});

test('optional progression never gates 12-day victory and changes only factual prepared ending', () => {
  const normal = Core.createGame(31);
  normal.day = 12;
  sleepNight(normal);
  Core.nextDay(normal);
  assert.equal(normal.ending.kind, 'victory');
  assert.equal(normal.ending.route, 'self');
  assert.equal(normal.ending.epilogues.some(entry => entry.body.includes('봉인해 둔 물자')), false);
  const prepared = contacted(12);
  run(prepared, 'mira', 'prepareEvacuation');
  sleepNight(prepared);
  assert.equal(prepared.relief.delivered, true);
  Core.nextDay(prepared);
  assert.equal(prepared.ending.kind, 'victory');
  assert.equal(prepared.ending.route, 'coordinated');
  assert.match(prepared.ending.body, /합의한 경로/);
  assert.equal(prepared.ending.epilogues.every(entry => entry.body.includes('봉인해 둔 물자')), true);
  assert.equal(Core.isValidSave(prepared), true);
});

test('old saves migrate optional radio and relief defaults without altering their run', () => {
  const old = Core.createGame(31);
  delete old.facilities.radio;
  delete old.relief;
  const before = copy(old);
  assert.equal(Core.isValidSave(old), true);
  const restored = Core.restoreGame(old);
  assert.equal(restored.facilities.radio, 0);
  assert.equal(restored.relief.contacted, false);
  assert.deepEqual(restored.inventory, old.inventory);
  assert.deepEqual(restored.characters, old.characters);
  assert.deepEqual(old, before);
  assert.equal(Core.isValidSave(restored), true);
});

test('malformed relief chronology, replay flags, job payments and duplicate workers are rejected', () => {
  const state = contacted();
  for (const mutate of [
    bad => { bad.relief.contactDay = 3; },
    bad => { bad.relief.deliveryDay = 10; },
    bad => { bad.relief.delivered = true; },
    bad => { bad.relief.prepared = true; bad.relief.preparedDay = 4; },
    bad => { bad.relief.contactDay = '4'; },
    bad => { bad.relief.extra = true; },
    bad => { bad.facilities.radio = 0; },
    bad => { bad.relief.contacted = false; },
  ]) { const bad = copy(state); mutate(bad); assert.equal(Core.isValidSave(bad), false); assert.throws(() => Core.restoreGame(bad)); }
  sleepNight(state);
  const replay = copy(state); replay.relief.delivered = false;
  assert.equal(Core.isValidSave(replay), false);
  const working = Core.createGame(31);
  assert.equal(Core.performAction(working, 'yun', 'buildRadio').ok, true);
  for (const mutate of [
    bad => { bad.characters[1].job.cost.parts = 100; },
    bad => { bad.characters[1].job.output = { meds: 99 }; },
    bad => { bad.characters[1].job.facility = 'bed'; },
    bad => { bad.characters[1].job.level = 2; },
    bad => { bad.characters[0].job = copy(bad.characters[1].job); },
  ]) { const bad = copy(working); mutate(bad); assert.equal(Core.isValidSave(bad), false); }
});

test('advice and relief views are immutable, prioritise actual danger and contain no fake rewards', () => {
  const state = Core.createGame(31);
  state.day = 6;
  Object.assign(state.characters[0], { health: 30, hunger: 80 });
  state.characters[1].illness = 65;
  state.inventory.meal = 0;
  const original = copy(state);
  freeze(state);
  const advice = Core.getSurvivalAdvice(state);
  assert.equal(advice.length, 4);
  assert.deepEqual(advice.map(entry => entry.id), ['health', 'illness', 'hunger', 'heater']);
  assert.equal(advice.every(entry => entry.severity === 'critical'), true);
  assert.equal(advice[0].characterId, 'mira');
  const goal = Core.getReliefStatus(state);
  assert.equal(goal.completed, 0);
  assert.equal(goal.next.actionId, 'buildRadio');
  assert.equal(goal.delivery.scheduled, false);
  assert.deepEqual(state, original);
  goal.delivery.items.raw = 999;
  assert.equal(Core.getReliefStatus(state).delivery.items.raw, 2);
});
