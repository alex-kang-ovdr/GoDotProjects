import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../dist/engine.js';

const copy = value => JSON.parse(JSON.stringify(value));
function nightPlan(state, scavengerId = null, loadout = {}, locationId = 'cottage') {
  return { scavengerId, locationId: scavengerId ? locationId : null, loadout, roles: Object.fromEntries(state.characters.filter(c => c.alive).map(c => [c.id, c.id === scavengerId ? 'scavenge' : 'sleep'])) };
}
function goNight(state, plan = nightPlan(state)) {
  if (state.phase === 'day') assert.equal(E.endDay(state).ok, true);
  const start = E.beginNight(state, plan);
  assert.equal(start.ok, true, start.reason);
  return start;
}
function fieldResult(extra = {}) { return { bag: {}, health: 100, fatigue: 25, moraleDelta: 0, dead: false, late: false, events: [], locationId: 'cottage', lootTaken: {}, killed: 0, theft: 0, escaped: true, ...extra }; }
function safeNight(state) { goNight(state); assert.equal(E.finishNight(state, {}).ok, true); }

test('new campaign is valid, reproducible and paused; stacks use ceilings', () => {
  const state = E.createGame(247);
  assert.deepEqual(state, E.createGame(247));
  assert.equal(E.isValidSave(state), true);
  assert.equal(state.paused, true);
  assert.equal(E.getActions(state, 'mira').length, 21);
  assert.equal(E.usedSlots({ wood: 5, water: 5, parts: 7 }), 5);
  assert.equal(E.usedSlots({ wood: -1 }), Infinity);
  assert.equal(E.usedSlots({ fictional: 1 }), Infinity);
  E.tickDay(state, 100);
  assert.equal(state.clock, 360);
});

test('insufficient costs do not partially mutate stock, job, clock or logs', () => {
  const state = E.createGame(1);
  state.inventory.parts = 3;
  const before = copy(state);
  assert.equal(E.performAction(state, 'yun', 'craftCrowbar').ok, false);
  assert.deepEqual(state, before);
  assert.match(E.getActions(state, 'yun').find(a => a.id === 'craftCrowbar').reason, /부품/);
});

test('engine applies speed exactly once, pauses jobs, and completes a job once', () => {
  const state = E.createGame(1);
  assert.equal(E.performAction(state, 'yun', 'fuel').ok, true);
  assert.equal(state.characters[1].job.total, 28);
  assert.equal(state.inventory.wood, 11);
  state.paused = true;
  E.tickDay(state, 20);
  assert.equal(state.characters[1].job.remaining, 28);
  state.paused = false;
  state.speed = 2;
  E.tickDay(state, 1);
  assert.equal(state.clock, 384);
  assert.equal(state.characters[1].job.remaining, 4);
  E.tickDay(state, 1);
  assert.equal(state.inventory.fuel, 7);
  E.tickDay(state, 1);
  assert.equal(state.inventory.fuel, 7);
  assert.equal(state.characters[1].job, null);
});

test('resource reservations prevent concurrent overspend; cancellation refunds only once', () => {
  const state = E.createGame(1);
  state.inventory.parts = 4; state.inventory.wood = 1;
  assert.equal(E.performAction(state, 'yun', 'craftCrowbar').ok, true);
  assert.equal(E.performAction(state, 'mira', 'craftCrowbar').ok, false);
  E.tickDay(state, 2);
  assert.equal(E.cancelJob(state, 'yun').ok, true);
  assert.equal(state.inventory.parts, 4);
  assert.equal(state.inventory.wood, 1);
  assert.equal(E.cancelJob(state, 'yun').ok, false);
  E.tickDay(state, 30);
  assert.equal(state.inventory.crowbar, 0);
  assert.equal(state.inventory.parts, 4);
});

test('same facility cannot be built twice concurrently; early day ending advances existing jobs', () => {
  const state = E.createGame(2);
  assert.equal(E.performAction(state, 'yun', 'buildHeater').ok, true);
  const inventory = copy(state.inventory);
  assert.equal(E.performAction(state, 'mira', 'buildHeater').ok, false);
  assert.deepEqual(state.inventory, inventory);
  assert.equal(E.performAction(state, 'mira', 'rest').ok, true);
  E.endDay(state);
  assert.equal(state.facilities.heater, 1);
  assert.equal(state.phase, 'planning');
  assert.equal(state.clock, 1200);
  assert.equal(state.characters.every(c => c.job === null), true);
  assert.equal(E.isValidSave(state), true);
});

test('clearing is finite, cannot duplicate the active rubble, and stops after four sections', () => {
  const state = E.createGame(2);
  for (let i = 0; i < 4; i++) {
    assert.equal(E.performAction(state, 'yun', 'clear').ok, true);
    assert.equal(E.performAction(state, 'mira', 'clear').ok, false);
    E.tickDay(state, 8);
  }
  assert.equal(state.cleared, 4);
  assert.equal(state.inventory.wood, 24);
  assert.equal(state.inventory.parts, 30);
  assert.equal(E.performAction(state, 'yun', 'clear').ok, false);
});

test('all-rest night works, hunger advances, and prepared meals are not automatically consumed', () => {
  const state = E.createGame(2);
  safeNight(state);
  assert.equal(state.phase, 'report');
  assert.equal(state.day, 1);
  assert.equal(state.inventory.meal, 3);
  assert.equal(state.characters[0].hunger, 30);
  assert.equal(state.report.raid.occurred, false);
  assert.equal(E.nextDay(state).ok, true);
  assert.equal(state.day, 2);
  assert.equal(state.phase, 'day');
  assert.equal(state.visitor.kind, 'trade');
});

test('night plan rejects invalid roles, capacity, quantity and destination transactionally', () => {
  const state = E.createGame(5);
  E.endDay(state);
  const before = copy(state);
  const cases = [
    { ...nightPlan(state, 'leo'), roles: { mira: 'scavenge', yun: 'sleep', leo: 'scavenge' } },
    nightPlan(state, 'leo', { wood: 1.5 }),
    nightPlan(state, 'leo', { fictional: 1 }),
    nightPlan(state, 'leo', {}, 'warehouse'),
    nightPlan(state, null, { meal: 1 }),
  ];
  for (const plan of cases) { assert.equal(E.beginNight(state, plan).ok, false); assert.deepEqual(state, before); }
  state.inventory.knife = 20;
  const overloaded = copy(state);
  assert.equal(E.beginNight(state, nightPlan(state, 'leo', { knife: 16 })).ok, false);
  assert.deepEqual(state, overloaded);
});

test('loadout and returned bag are each applied exactly once', () => {
  const state = E.createGame(1);
  state.inventory.knife = 1;
  const plan = nightPlan(state, 'leo', { knife: 1 });
  goNight(state, plan);
  assert.equal(state.inventory.knife, 0);
  assert.equal(E.beginNight(state, plan).ok, false);
  assert.equal(E.finishNight(state, fieldResult({ bag: { knife: 1, water: 5 }, lootTaken: { water: 5 } })).ok, true);
  assert.equal(state.inventory.knife, 1);
  assert.equal(state.inventory.water, 13);
  const finished = copy(state);
  assert.equal(E.finishNight(state, fieldResult({ bag: { knife: 1, water: 5 } })).ok, false);
  assert.deepEqual(state, finished);
});

test('malformed expedition result cannot mutate the engine', () => {
  const state = E.createGame(3);
  goNight(state, nightPlan(state, 'leo'));
  const before = copy(state);
  for (const result of [fieldResult({ health: NaN }), fieldResult({ bag: { wood: -1 } }), fieldResult({ bag: { knife: 20 } }), fieldResult({ locationId: 'warehouse' }), fieldResult({ fatigue: '20' })]) {
    assert.equal(E.finishNight(state, result).ok, false);
    assert.deepEqual(state, before);
  }
});

test('late field health and fatigue are absolute; injury is not applied twice', () => {
  const state = E.createGame(5);
  goNight(state, nightPlan(state, 'leo'));
  E.finishNight(state, fieldResult({ health: 71, injury: 29, fatigue: 68, late: true }));
  assert.equal(state.characters[2].health, 71);
  assert.equal(state.characters[2].fatigue, 68);
});

test('newly returned fuel cannot retroactively heat the previous night', () => {
  const state = E.createGame(12);
  state.day = 4; state.facilities.heater = 1; state.facilities.barricade = 3; state.inventory.fuel = 0;
  goNight(state, nightPlan(state, 'leo'));
  E.finishNight(state, fieldResult({ bag: { fuel: 4 }, lootTaken: { fuel: 4 } }));
  assert.equal(state.inventory.fuel, 4);
  assert.equal(state.characters[0].illness, 8);
  assert.match(state.report.items.map(i => i.text).join(' '), /연료가 부족/);
});

test('shelter defense uses only weapons remaining at home', () => {
  let compared = false;
  for (let seed = 0; seed < 100 && !compared; seed++) {
    const base = E.createGame(seed); base.day = 10; base.inventory.knife = 1;
    const home = copy(base), carried = copy(base);
    const hp = nightPlan(home, 'leo'); hp.roles.yun = 'guard';
    const cp = nightPlan(carried, 'leo', { knife: 1 }); cp.roles.yun = 'guard';
    goNight(home, hp); goNight(carried, cp);
    E.finishNight(home, fieldResult()); E.finishNight(carried, fieldResult({ bag: { knife: 1 } }));
    if (home.report.raid.occurred) {
      assert.equal(home.report.raid.defense - carried.report.raid.defense, 8);
      assert.equal(home.inventory.knife, 1); assert.equal(carried.inventory.knife, 1);
      compared = true;
    }
  }
  assert.equal(compared, true);
});

test('a lethal raid result cannot be revived by sleeping recovery', () => {
  let observed = false;
  for (let seed = 0; seed < 100 && !observed; seed++) {
    const state = E.createGame(seed); state.day = 10;
    for (const c of state.characters) { c.health = 1; c.hunger = 0; }
    safeNight(state);
    if (state.report.raid.occurred && state.report.raid.damage) {
      assert.ok(state.report.deaths.length > 0);
      for (const id of state.report.deaths) { const c = state.characters.find(p => p.id === id); assert.equal(c.health, 0); assert.equal(c.alive, false); }
      assert.equal(E.isValidSave(state), true); observed = true;
    }
  }
  assert.equal(observed, true);
});

test('an empty shelter can lose stock while its sole survivor scavenges', () => {
  let observed = false;
  for (let seed = 0; seed < 100 && !observed; seed++) {
    const state = E.createGame(seed); state.day = 10;
    for (const c of state.characters.slice(0, 2)) { c.health = 0; c.alive = false; }
    state.selectedId = 'leo';
    goNight(state, nightPlan(state, 'leo'));
    E.finishNight(state, fieldResult());
    if (state.report.raid.occurred) { assert.ok(Object.values(state.report.raid.stolen).reduce((a, b) => a + b, 0) > 0); observed = true; }
  }
  assert.equal(observed, true);
});

test('trader stock and visitor decisions are committed once and reject unavailable costs', () => {
  const state = E.createGame(1); safeNight(state); E.nextDay(state);
  assert.equal(E.trade(state, 'food').ok, true);
  const after = copy(state.inventory);
  assert.equal(E.trade(state, 'food').ok, false);
  assert.deepEqual(state.inventory, after);
  assert.equal(E.chooseVisitor(state, 'leave').ok, true);
  safeNight(state); E.nextDay(state);
  state.inventory.meal = 1;
  const before = copy(state);
  assert.equal(E.chooseVisitor(state, 'help').ok, false);
  assert.deepEqual(state, before);
  state.inventory.meal = 2;
  assert.equal(E.chooseVisitor(state, 'help').ok, true);
  assert.equal(state.stats.helped, 1);
  assert.equal(E.chooseVisitor(state, 'help').ok, false);
});

test('save roundtrip preserves an active job and creates independent objects', () => {
  const state = E.createGame(1234);
  E.performAction(state, 'yun', 'buildHeater'); E.tickDay(state, 3);
  const restored = E.restoreGame(E.serializeGame(state));
  assert.deepEqual(restored, state);
  E.endDay(restored);
  assert.equal(restored.facilities.heater, 1);
  assert.equal(state.facilities.heater, 0);
  assert.notEqual(state.characters[1].job, null);
});

test('save validation rejects malformed numeric, identity, inventory and phase state', () => {
  const mutations = [
    s => { s.characters[0].health = NaN; },
    s => { s.characters[0].hunger = -1; },
    s => { s.characters[0].health = 0; },
    s => { s.characters[1].id = 'mira'; },
    s => { s.inventory.fake = 1; },
    s => { s.inventory.wood = 1.5; },
    s => { s.facilities.heater = 200; },
    s => { s.speed = 5; },
    s => { s.phase = 'expedition'; },
    s => { s.phase = 'ended'; },
    s => { s.day = 13; },
  ];
  for (const mutate of mutations) { const state = E.createGame(3); mutate(state); assert.equal(E.isValidSave(state), false); assert.throws(() => E.restoreGame(state)); }
  assert.throws(() => E.restoreGame('{broken'));
});

test('location snapshots from an independently restored expedition replace stale references', () => {
  const state = E.createGame(7);
  state.locations.cottage = { remaining: { pile: { wood: 4 } }, opened: {}, searched: {}, visits: 1, npcState: {}, dropped: [], nextDropId: 0 };
  goNight(state, nightPlan(state, 'leo'));
  const snapshot = copy(state.locations.cottage);
  snapshot.remaining.pile.wood = 1;
  snapshot.remaining.cottage_drop_1 = { cloth: 1 };
  snapshot.dropped.push({ id: 'cottage_drop_1', x: 200, floor: 0, label: '두고 온 물자' }); snapshot.nextDropId = 1;
  assert.equal(E.finishNight(state, fieldResult({ bag: { wood: 3 }, lootTaken: { wood: 3 }, locationState: snapshot })).ok, true);
  assert.equal(state.locations.cottage.remaining.pile.wood, 1);
  assert.equal(E.isValidSave(state), true);
  snapshot.remaining.pile.wood = 100;
  assert.equal(state.locations.cottage.remaining.pile.wood, 1);
});

test('complete 12-day campaign reaches victory with legal actions and finite supply pickups', () => {
  const state = E.createGame(31);
  const run = (id, action) => {
    const def = E.getActions(state, id).find(a => a.id === action);
    if (!def?.available) return false;
    E.performAction(state, id, action);
    if (def.duration) E.tickDay(state, def.duration / 12 + .001);
    return true;
  };
  for (let day = 1; day <= 12; day++) {
    assert.equal(state.day, day);
    if (state.visitor?.kind === 'trade') { E.trade(state, 'food'); E.trade(state, 'fuel'); E.chooseVisitor(state, 'leave'); }
    else if (state.visitor) E.chooseVisitor(state, state.visitor.id === 'aid' ? 'accept' : 'decline');
    if (day === 1) { run('yun', 'buildHeater'); run('yun', 'clear'); run('yun', 'clear'); }
    if (day === 2) { run('yun', 'clear'); run('yun', 'clear'); run('yun', 'buildBarricade'); }
    if (day === 3) run('yun', 'buildBarricade');
    for (const person of state.characters.filter(c => c.alive)) {
      if (person.illness >= 35) run(person.id, 'heal');
      if (person.health <= 65) run(person.id, 'bandage');
      if (person.fatigue >= 45) run(person.id, 'rest');
    }
    while (state.phase === 'day' && state.inventory.meal < 4 && state.inventory.raw > 0) {
      if (state.inventory.fuel < 2 && !run('yun', 'fuel')) break;
      if (state.inventory.water < 2 && !run('mira', 'water')) break;
      if (!run('mira', 'cook')) break;
    }
    for (const person of state.characters.filter(c => c.alive)) if (person.hunger >= 35) run(person.id, 'eat');
    if (state.inventory.fuel < E.getWeather(state).fuelNeeded && state.phase === 'day') run('yun', 'fuel');
    const scavenger = [1, 3].includes(day) ? 'leo' : null;
    const plan = nightPlan(state, scavenger); plan.roles.yun = 'guard';
    goNight(state, plan);
    const bag = day === 1 ? { wood: 8, parts: 8, raw: 3, water: 5, cloth: 1 } : day === 3 ? { meds: 2, bandage: 2, raw: 2, water: 5, parts: 3 } : {};
    const result = scavenger ? fieldResult({ bag, lootTaken: bag, fatigue: Math.min(100, state.characters[2].fatigue + 18) }) : {};
    assert.equal(E.finishNight(state, result).ok, true);
    assert.equal(E.isValidSave(state), true, `invalid report on day ${day}`);
    assert.equal(E.nextDay(state).ok, true);
    if (day < 12) assert.equal(state.phase, 'day', `campaign ended early on day ${day}`);
  }
  assert.equal(state.phase, 'ended');
  assert.equal(state.ending.kind, 'victory');
  assert.equal(state.characters.filter(c => c.alive).length, 3);
  assert.equal(E.isValidSave(state), true);
});

test('last survivor death transitions through report to a restartable defeat ending', () => {
  const state = E.createGame(1); state.day = 6;
  state.characters[0].health = 1;
  for (const c of state.characters.slice(1)) { c.alive = false; c.health = 0; }
  const plan = nightPlan(state); plan.roles.mira = 'guard';
  goNight(state, plan); E.finishNight(state, {});
  assert.equal(state.phase, 'report');
  assert.equal(state.characters.some(c => c.alive), false);
  E.nextDay(state);
  assert.equal(state.phase, 'ended'); assert.equal(state.ending.kind, 'defeat');
  assert.equal(E.isValidSave(state), true);
  assert.equal(E.createGame(2).phase, 'day');
});

test('a queue reserves no materials until start, accepts three pending jobs and removes by index', () => {
  const state = E.createGame(19);
  E.performAction(state, 'mira', 'water');
  const inventory = copy(state.inventory);
  for (let i = 0; i < 3; i++) assert.equal(E.enqueueAction(state, 'mira', 'fuel').ok, true);
  assert.deepEqual(state.characters[0].queue, ['fuel', 'fuel', 'fuel']);
  assert.deepEqual(state.inventory, inventory);
  const before = copy(state);
  assert.equal(E.enqueueAction(state, 'mira', 'fuel').ok, false);
  assert.deepEqual(state, before);
  assert.match(E.getActions(state, 'mira').find(a => a.id === 'fuel').queueReason, /최대 3개/);
  assert.equal(E.removeQueuedAction(state, 'mira', 1).ok, true);
  assert.deepEqual(state.characters[0].queue, ['fuel', 'fuel']);
  assert.deepEqual(state.inventory, inventory);
  assert.equal(E.removeQueuedAction(state, 'mira', -1).ok, false);
  E.tickDay(state, 100 / 12);
  assert.equal(state.characters[0].job.actionId, 'fuel');
  assert.equal(state.inventory.wood, inventory.wood - 1);
  assert.equal(E.cancelJob(state, 'mira').ok, true);
  assert.equal(state.inventory.wood, inventory.wood);
  assert.equal(E.cancelJob(state, 'mira').ok, false);
});

test('queue preview uses completed facilities and future recipe costs without mutating state', () => {
  const state = E.createGame(19);
  state.inventory.water = 1;
  E.performAction(state, 'yun', 'upgradeStove');
  const before = copy(state);
  const cooking = E.getActions(state, 'yun').find(a => a.id === 'cook');
  assert.equal(cooking.available, false);
  assert.equal(cooking.queueable, true);
  assert.equal(cooking.cost.water, 2);
  assert.equal(cooking.queueCost.water, 1);
  assert.deepEqual(state, before);
  assert.equal(E.enqueueAction(state, 'yun', 'cook').ok, true);
  E.tickDay(state, 144 / 12);
  assert.equal(state.facilities.stove, 2);
  assert.equal(state.characters[1].job.actionId, 'cook');
  assert.equal(state.inventory.water, 0);
  E.tickDay(state, 50 / 12);
  assert.equal(state.inventory.meal, 5);

  const collector = E.createGame(20);
  E.performAction(collector, 'yun', 'buildCollector');
  const water = E.getActions(collector, 'yun').find(a => a.id === 'water');
  assert.equal(water.duration, 100);
  assert.equal(water.queueDuration, 65);
  assert.equal(E.enqueueAction(collector, 'yun', 'water').ok, true);
  E.tickDay(collector, (128 + 65) / 12);
  assert.equal(collector.inventory.water, 14);
});

test('large and small ticks produce identical concurrent queues, inventory, needs and logs', () => {
  const state = E.createGame(77);
  state.inventory.water = 0; state.inventory.meal = 0;
  state.characters[0].hunger = 65;
  E.performAction(state, 'mira', 'water');
  for (const id of ['cook', 'eat', 'water']) assert.equal(E.enqueueAction(state, 'mira', id).ok, true, id);
  E.performAction(state, 'yun', 'fuel');
  for (const id of ['fuel', 'clear', 'buildHeater']) assert.equal(E.enqueueAction(state, 'yun', id).ok, true, id);
  E.performAction(state, 'leo', 'rest');
  assert.equal(E.enqueueAction(state, 'leo', 'talk').ok, true);
  const large = copy(state), small = copy(state);
  E.tickDay(large, 30);
  for (let i = 0; i < 300; i++) E.tickDay(small, .1);
  assert.deepEqual(large, small);
  assert.equal(large.clock, 720);
  assert.equal(large.characters.every(c => c.job === null && c.queue.length === 0), true);
  assert.equal(large.facilities.heater, 1);
  assert.equal(large.characters[0].hunger, 23);
  assert.equal(E.isValidSave(large), true);
});

test('resource competition cancels an unfunded queued job and immediately continues to the next', () => {
  const state = E.createGame(18);
  state.inventory.parts = 4; state.inventory.wood = 2;
  E.performAction(state, 'mira', 'water');
  assert.equal(E.enqueueAction(state, 'mira', 'craftCrowbar').ok, true);
  assert.equal(E.enqueueAction(state, 'mira', 'water').ok, true);
  assert.equal(E.performAction(state, 'yun', 'craftCrowbar').ok, true);
  E.tickDay(state, 9);
  assert.equal(state.inventory.parts, 0);
  assert.equal(state.inventory.crowbar, 1);
  assert.equal(state.characters[0].job.actionId, 'water');
  assert.equal(state.characters[0].job.remaining, 92);
  assert.deepEqual(state.characters[0].queue, []);
  assert.ok(state.logs.some(entry => /예약 작업 쇠지레 제작 취소/.test(entry.text) && /부품/.test(entry.text)));
});

test('idle enqueue starts immediately; day end and a deceased worker clear pending jobs', () => {
  const state = E.createGame(9);
  assert.equal(E.enqueueAction(state, 'yun', 'fuel').ok, true);
  assert.equal(state.characters[1].job.actionId, 'fuel');
  assert.deepEqual(state.characters[1].queue, []);
  assert.equal(state.inventory.wood, 11);
  state.characters[1].queue = ['fuel', 'water'];
  state.characters[1].alive = false; state.characters[1].health = 0;
  E.tickDay(state, 1);
  assert.equal(state.characters[1].job, null);
  assert.deepEqual(state.characters[1].queue, []);
  assert.equal(state.inventory.wood, 12);
  assert.equal(E.isValidSave(state), true);
  // Imported queues may no longer fit today's remaining time. They are finite.
  state.clock = 1200;
  state.characters[0].queue = ['water', 'fuel'];
  E.endDay(state);
  assert.equal(state.phase, 'planning');
  assert.equal(state.characters.every(c => c.queue.length === 0), true);
  assert.equal(E.isValidSave(state), true);
});

test('care applies the healer skill to a different patient and reserves treatment once', () => {
  const state = E.createGame(4);
  const nurse = state.characters[0], patient = state.characters[2];
  patient.health = 30; patient.illness = 70;
  assert.equal(E.performCare(state, 'mira', 'leo', 'meds').ok, true);
  assert.equal(nurse.job.careTargetId, 'leo');
  assert.equal(nurse.job.target, 'bed');
  assert.equal(state.inventory.meds, 0);
  assert.equal(E.getActions(state, 'leo').find(a => a.id === 'heal').available, false);
  assert.equal(E.performCare(state, 'yun', 'leo', 'bandage').ok, false);
  E.tickDay(state, 45 / 12);
  assert.equal(patient.health, 60);
  assert.equal(patient.illness, 20);
  assert.equal(nurse.health, 100);
  assert.equal(state.inventory.meds, 0);
  assert.equal(E.isValidSave(state), true);

  const other = E.createGame(5);
  other.characters[0].health = 20;
  assert.equal(E.performCare(other, 'yun', 'mira', 'bandage').ok, true);
  E.tickDay(other, 35 / 12);
  assert.equal(other.characters[0].health, 55, 'being treated by an engineer does not use the patient nurse skill');
});

test('care cancellation refunds once; a dead patient is never healed or charged', () => {
  const state = E.createGame(4);
  state.characters[2].health = 40;
  assert.equal(E.performCare(state, 'mira', 'leo', 'bandage').ok, true);
  E.tickDay(state, 1);
  assert.equal(E.cancelJob(state, 'mira').ok, true);
  assert.equal(state.inventory.bandage, 1);
  assert.equal(state.characters[2].health, 40);
  assert.equal(E.cancelJob(state, 'mira').ok, false);
  assert.equal(E.performCare(state, 'mira', 'leo', 'bandage').ok, true);
  state.characters[2].alive = false; state.characters[2].health = 0;
  E.tickDay(state, 35 / 12);
  assert.equal(state.characters[2].alive, false);
  assert.equal(state.characters[2].health, 0);
  assert.equal(state.inventory.bandage, 1);
  const before = copy(state);
  assert.equal(E.performCare(state, 'mira', 'leo', 'meds').ok, false);
  assert.deepEqual(state, before);
  assert.equal(E.isValidSave(state), true);
});

function traderDay(seed = 8) {
  const state = E.createGame(seed);
  safeNight(state); E.nextDay(state);
  return state;
}

test('free barter quotes all items, commits both inventories and shares stock with fixed bundles', () => {
  const state = traderDay();
  const empty = E.getBarter(state);
  assert.equal(empty.ok, false);
  assert.deepEqual(Object.keys(empty.stock).sort(), Object.keys(E.ITEMS).sort());
  assert.deepEqual(Object.keys(empty.prices).sort(), Object.keys(E.ITEMS).sort());
  const before = copy(state);
  const quote = E.getBarter(state, { wood: 5 }, { raw: 5 });
  assert.equal(quote.ok, true);
  assert.equal(quote.offerValue, quote.requestValue);
  assert.deepEqual(state, before);
  assert.equal(E.barter(state, { wood: 5 }, { raw: 5 }).ok, true);
  assert.equal(state.inventory.wood, before.inventory.wood - 5);
  assert.equal(state.inventory.raw, before.inventory.raw + 5);
  assert.equal(state.visitor.stock.raw, 0);
  assert.equal(state.visitor.stock.wood, before.visitor.stock.wood + 5);
  const after = copy(state);
  assert.equal(E.trade(state, 'food').ok, false);
  assert.deepEqual(state, after);
  assert.match(E.getBarter(state, { parts: 6 }, { raw: 1 }).reason, /상인 재고/);
  assert.equal(E.trade(state, 'fuel').ok, true);
  assert.equal(state.visitor.stock.fuel, before.visitor.stock.fuel - 4);
  assert.equal(E.getBarter(state, { parts: 5 }, { fuel: 3 }).ok, false);
  assert.equal(E.isValidSave(state), true);
});

test('barter rejects invalid or underfunded exchanges atomically and cannot buy then resell at a profit', () => {
  const state = traderDay();
  const before = copy(state);
  const invalid = [
    [{ wood: -1 }, { parts: 1 }], [{ wood: .5 }, { parts: 1 }], [{ fake: 1 }, { parts: 1 }],
    [{ wood: 2 }, { wood: 1 }], [{ wood: 100 }, { parts: 1 }], [{ water: 1 }, { meds: 1 }],
    [{ wood: 12 }, { knife: 2 }], [{}, { water: 1 }], [{ wood: 1 }, {}],
  ];
  for (const [give, receive] of invalid) { assert.equal(E.barter(state, give, receive).ok, false); assert.deepEqual(state, before); }
  const { prices } = E.getBarter(state);
  for (const item of Object.values(prices)) assert.ok(item.buy > item.sell && item.sell > 0);
  // A monotone sell-value measure proves there is no combination of fixed
  // bundles and free barter that increases resale value in a closed loop.
  const value = items => Object.entries(items).reduce((sum, [id, qty]) => sum + prices[id].sell * qty, 0);
  for (const offer of state.visitor.offers) assert.ok(value(offer.give) >= value(offer.receive), offer.id);
  assert.equal(E.barter(state, { wood: 2 }, { parts: 1 }).ok, true);
  assert.equal(E.barter(state, { parts: 1 }, { wood: 1 }).ok, false);
});

test('version 1 migration adds queues and reconstructs spent merchant stock without refilling it', () => {
  const state = traderDay();
  E.trade(state, 'food'); E.trade(state, 'medical');
  const legacy = copy(state);
  for (const actor of legacy.characters) delete actor.queue;
  delete legacy.visitor.stock;
  assert.equal(E.isValidSave(legacy), true);
  const restored = E.restoreGame(legacy);
  assert.equal(restored.characters.every(c => Array.isArray(c.queue) && c.queue.length === 0), true);
  assert.deepEqual(restored.visitor.stock, state.visitor.stock);
  assert.equal(legacy.visitor.stock, undefined);
  assert.equal(E.trade(restored, 'medical').ok, false);
  assert.equal(E.isValidSave(restored), true);
});

test('active care and queued work survive serialization; malformed additive fields are rejected', () => {
  const state = E.createGame(33);
  state.characters[2].health = 35;
  E.performCare(state, 'mira', 'leo', 'bandage');
  E.enqueueAction(state, 'mira', 'water');
  const restored = E.restoreGame(E.serializeGame(state));
  assert.deepEqual(restored, state);
  E.tickDay(restored, 4);
  assert.equal(restored.characters[2].health, 80);
  assert.equal(restored.characters[0].job.actionId, 'water');
  assert.equal(restored.characters[0].job.remaining, 87);
  for (const mutate of [
    s => { s.characters[0].queue = ['water', 'water', 'water', 'water']; },
    s => { s.characters[0].queue = [{ actionId: 'water' }]; },
    s => { s.characters[0].queue = ['fake']; },
    s => { s.characters[0].job.careTargetId = 'ghost'; },
  ]) { const bad = copy(state); mutate(bad); assert.equal(E.isValidSave(bad), false); }
  const badStock = traderDay(); badStock.visitor.stock.raw = -1;
  assert.equal(E.isValidSave(badStock), false);
});

test('night forecast excludes carried weapons and fuel and matches the actual defense and threat range', () => {
  let observedRaid = false;
  for (let seed = 0; seed < 20; seed++) {
    const state = E.createGame(seed); state.day = 6;
    state.facilities.heater = 1; state.inventory.knife = 1; state.inventory.crowbar = 1; state.inventory.fuel = 3;
    const plan = nightPlan(state, 'leo', { knife: 1, fuel: 2 }); plan.roles.yun = 'guard';
    const before = copy(state);
    const forecast = E.getNightForecast(state, plan);
    assert.deepEqual(state, before, 'forecast must not consume RNG or supplies');
    assert.equal(forecast.guards, 1);
    assert.equal(forecast.fuelNeeded, 2);
    assert.equal(forecast.fuelAvailable, 1);
    assert.equal(forecast.bedsNeeded, 1);
    assert.equal(forecast.raidChance, .23);
    assert.ok(forecast.warnings.some(text => /연료가 1개 부족/.test(text)));
    const atHome = E.getNightForecast(state, { ...plan, loadout: {} });
    assert.equal(atHome.defense - forecast.defense, 8);
    goNight(state, plan);
    assert.deepEqual(E.getNightForecast(state), forecast, 'a departed loadout is not subtracted twice');
    E.finishNight(state, fieldResult({ bag: { knife: 1, fuel: 2 } }));
    assert.equal(state.report.raid.defense, forecast.defense);
    if (state.report.raid.occurred) {
      observedRaid = true;
      assert.ok(state.report.raid.threat >= forecast.threatMin && state.report.raid.threat < forecast.threatMax);
    }
  }
  assert.equal(observedRaid, true);
});

test('forecast is available before planning and makes missing beds, guards and heating explicit', () => {
  const state = E.createGame(22); state.day = 7; state.inventory.fuel = 0;
  const forecast = E.getNightForecast(state);
  assert.equal(forecast.bedsNeeded, 3); assert.equal(forecast.bedsAvailable, 1);
  assert.equal(forecast.guards, 0);
  assert.ok(forecast.warnings.some(text => /경계 인원/.test(text)));
  assert.ok(forecast.warnings.some(text => /난로가 없어/.test(text)));
  assert.ok(forecast.warnings.some(text => /2명은 바닥/.test(text)));
  assert.equal(E.getNightForecast(state, { roles: {}, loadout: {} }).warnings.some(text => /역할/.test(text)), true);
});

test('expanded persistent location intelligence is preserved and malformed boundaries are rejected', () => {
  const state = E.createGame(35);
  const locationState = { remaining: { box: { parts: 2 } }, doors: { door: { open: false, locked: true } }, explored: [{ floor: 0, min: 0, max: 400 }], knownLootIds: ['box'], knownDoorIds: ['door'] };
  goNight(state, nightPlan(state, 'leo'));
  assert.equal(E.finishNight(state, fieldResult({ locationState })).ok, true);
  assert.deepEqual(E.restoreGame(state).locations.cottage, locationState);
  for (const mutate of [
    s => { s.locations.cottage.doors.door.open = 'yes'; },
    s => { s.locations.cottage.explored[0].max = 2000; },
    s => { s.locations.cottage.explored[0].min = 500; },
    s => { s.locations.cottage.knownLootIds = [3]; },
  ]) { const bad = copy(state); mutate(bad); assert.equal(E.isValidSave(bad), false); }
});

test('campaign profiles preserve standard defaults and expose measurable siege pressure', () => {
  const standard = E.createGame(41);
  assert.deepEqual(standard, E.createGame(41, { difficulty: 'standard' }));
  const siege = E.createGame(41, { difficulty: 'siege' });
  assert.equal(E.DIFFICULTIES.standard.label, '표준');
  assert.equal(E.DIFFICULTIES.siege.label, '봉쇄');
  assert.equal(E.CAMPAIGN_PROFILE.days, 12);
  assert.equal(siege.campaign.difficulty, 'siege');
  assert.equal(siege.shelterIntegrity, 100);
  for (const item of ['wood', 'parts', 'water', 'raw', 'fuel', 'cloth']) assert.ok(siege.inventory[item] < standard.inventory[item], item);
  assert.deepEqual(siege.inventory, E.DIFFICULTIES.siege.startingStock);
  siege.inventory.wood--;
  assert.equal(E.DIFFICULTIES.siege.startingStock.wood, 10, 'per-run inventory cannot mutate the exported profile');
  safeNight(standard); safeNight(siege);
  for (let i = 0; i < 3; i++) assert.equal(siege.characters[i].hunger - standard.characters[i].hunger, 3);
  assert.equal(standard.report.raid.occurred, false);
  assert.equal(siege.report.raid.occurred, false, 'both profiles preserve the first-night grace period');
  assert.equal(E.isValidSave(siege), true);
  assert.throws(() => E.createGame(41, { difficulty: 'unknown' }));
  assert.throws(() => E.createGame(41, { difficulty: ['standard'] }));
});

test('shelter repair reserves once, rejects concurrent repairs, queues with future integrity and clamps', () => {
  const state = E.createGame(42);
  assert.equal(E.getActions(state, 'yun').find(action => action.id === 'repairShelter').available, false);
  state.shelterIntegrity = 40;
  const original = copy(state.inventory);
  assert.equal(E.performAction(state, 'yun', 'repairShelter').ok, true);
  assert.equal(state.characters[1].job.target, 'door');
  assert.equal(state.characters[1].job.total, 56);
  assert.equal(state.inventory.wood, original.wood - 2);
  assert.equal(state.inventory.parts, original.parts - 1);
  assert.equal(E.performAction(state, 'mira', 'repairShelter').ok, false);
  assert.equal(E.enqueueAction(state, 'yun', 'repairShelter').ok, true);
  assert.equal(state.inventory.wood, original.wood - 2, 'pending repair has not reserved its cost');
  assert.equal(E.enqueueAction(state, 'yun', 'repairShelter').ok, false, 'a third repair would start at full integrity');
  const large = copy(state), small = copy(state);
  E.tickDay(large, 112 / 12);
  for (let i = 0; i < 112; i++) E.tickDay(small, 1 / 12);
  assert.deepEqual(large, small);
  assert.equal(large.shelterIntegrity, 100);
  assert.equal(large.inventory.wood, original.wood - 4);
  assert.equal(large.inventory.parts, original.parts - 2);
  assert.equal(large.stats.built, 0, 'maintenance is not counted as an extra facility');
  assert.equal(E.isValidSave(large), true);

  assert.equal(E.cancelJob(state, 'yun').ok, true);
  assert.equal(state.shelterIntegrity, 40);
  assert.deepEqual(state.inventory, original);
  assert.equal(E.cancelJob(state, 'yun').ok, false);
  assert.equal(E.removeQueuedAction(state, 'yun', 0).ok, true);
  assert.deepEqual(state.inventory, original);
});

test('integrity scales only barricades and a no-raid night does not wear the shelter', () => {
  const state = E.createGame(43);
  state.facilities.barricade = 3;
  state.shelterIntegrity = 50;
  const status = E.getShelterStatus(state);
  assert.equal(status.fullBarricadeDefense, 33);
  assert.equal(status.barricadeDefense, 16.5);
  assert.equal(status.defenseMultiplier, .5);
  assert.equal(status.repairAmount, 35);
  assert.deepEqual(status.repairCost, { wood: 2, parts: 1 });
  safeNight(state);
  assert.equal(state.report.raid.occurred, false);
  assert.equal(state.report.raid.wear, 0);
  assert.equal(state.shelterIntegrity, 50);

  const intact = E.createGame(43); intact.day = 6;
  intact.facilities.heater = 1; intact.facilities.bed = 3;
  const damaged = copy(intact); damaged.shelterIntegrity = 0;
  safeNight(intact); safeNight(damaged);
  assert.deepEqual(damaged.characters, intact.characters, 'without barricades, wear does not alter beds, treatment or heating');
  assert.deepEqual(damaged.inventory, intact.inventory);
});

test('actual repelled raids use forecast pressure and cause bounded, reported wear in both profiles', () => {
  for (const difficulty of ['standard', 'siege']) {
    let observed = false;
    for (let seed = 0; seed < 30 && !observed; seed++) {
      const state = E.createGame(seed, { difficulty }); state.day = 10;
      state.facilities.barricade = 3; state.shelterIntegrity = 70;
      const plan = nightPlan(state);
      plan.roles.mira = 'guard'; plan.roles.yun = 'guard';
      const forecast = E.getNightForecast(state, plan);
      assert.equal(forecast.raidChance, .48 * E.DIFFICULTIES[difficulty].raidChanceMultiplier);
      assert.equal(forecast.threatMin, 27 + E.DIFFICULTIES[difficulty].raidThreatBonus);
      const before = copy(state);
      assert.deepEqual(E.getNightForecast(state, plan), forecast);
      assert.deepEqual(state, before);
      goNight(state, plan); E.finishNight(state, {});
      assert.equal(state.report.raid.defense, forecast.defense, 'wear affects the next defense calculation, not the strike already resolved');
      if (!state.report.raid.occurred) continue;
      observed = true;
      const raid = state.report.raid;
      assert.equal(raid.damage, 0);
      assert.deepEqual(raid.stolen, {});
      assert.ok(raid.threat >= forecast.threatMin && raid.threat < forecast.threatMax);
      assert.ok(raid.wear >= forecast.wearMin && raid.wear <= forecast.wearMax && raid.wear <= 18);
      assert.ok(raid.wear > 0);
      assert.equal(raid.integrityBefore, 70);
      assert.equal(raid.integrityAfter, 70 - raid.wear);
      assert.equal(state.shelterIntegrity, raid.integrityAfter);
      assert.ok(state.report.items.some(entry => entry.text.includes(`내구도 ${raid.wear} 감소`)));
      assert.equal(E.isValidSave(state), true);
    }
    assert.equal(observed, true, difficulty);
  }
});

test('wear cannot reduce integrity below zero and repair restores its exact missing amount', () => {
  let observed = false;
  for (let seed = 0; seed < 20 && !observed; seed++) {
    const state = E.createGame(seed, { difficulty: 'siege' }); state.day = 10; state.shelterIntegrity = 1;
    const plan = nightPlan(state); for (const id of Object.keys(plan.roles)) plan.roles[id] = 'guard';
    goNight(state, plan); E.finishNight(state, {});
    if (!state.report.raid.occurred) continue;
    observed = true;
    assert.equal(state.report.raid.wear, 1);
    assert.equal(state.shelterIntegrity, 0);
    E.nextDay(state);
    assert.equal(E.performAction(state, 'yun', 'repairShelter').ok, true);
    E.tickDay(state, 56 / 12);
    assert.equal(state.shelterIntegrity, 35);
  }
  assert.equal(observed, true);
});

test('report signed supply deltas include loadout consumption and heating, alongside exact character changes', () => {
  const state = E.createGame(44); state.day = 4;
  state.facilities.heater = 1; state.facilities.barricade = 3; state.inventory.fuel = 2;
  const plan = nightPlan(state, 'leo', { fuel: 1, bandage: 1 });
  const before = copy(state);
  goNight(state, plan);
  assert.equal(E.finishNight(state, fieldResult({ bag: { fuel: 1, water: 5 }, health: 67, fatigue: 55, helped: 1 })).ok, true);
  assert.equal(state.report.loot.fuel, 1, 'gross returning bag still contains the carried fuel');
  assert.equal(state.report.supplyDelta.fuel, -1, 'net stock accounts for overnight heating');
  assert.equal(state.report.supplyDelta.bandage, -1, 'a field-consumed loadout item is a real stock loss');
  assert.equal(state.report.supplyDelta.water, 5);
  assert.equal(Object.keys(state.report.supplyDelta).length, Object.keys(E.ITEMS).length);
  const leo = state.report.characterChanges.find(entry => entry.id === 'leo');
  assert.equal(leo.before.health, before.characters[2].health);
  assert.equal(leo.after.health, 67);
  assert.equal(leo.delta.health, -33);
  assert.equal(leo.delta.fatigue, 43);
  assert.equal(leo.delta.hunger, 18);
  assert.equal(leo.before.alive, true); assert.equal(leo.after.alive, true);
  assert.equal(state.stats.helped, 1);
  assert.equal(E.isValidSave(state), true);
  assert.deepEqual(E.restoreGame(E.serializeGame(state)), state);
});

test('field help is counted exactly once and malformed counts do not mutate settlement', () => {
  const state = E.createGame(45);
  goNight(state, nightPlan(state, 'leo'));
  const before = copy(state);
  for (const helped of [-1, .5, 101, '1']) {
    assert.equal(E.finishNight(state, fieldResult({ helped })).ok, false);
    assert.deepEqual(state, before);
  }
  assert.equal(E.finishNight(state, fieldResult({ helped: 2 })).ok, true);
  assert.equal(state.stats.helped, 2);
  const after = copy(state);
  assert.equal(E.finishNight(state, fieldResult({ helped: 2 })).ok, false);
  assert.deepEqual(state, after);
});

test('epilogues are individualized, deterministic, state-based and saved with the ending', () => {
  const state = E.createGame(46, { difficulty: 'siege' }); state.day = 12;
  state.characters[0].health = 20;
  state.characters[1].morale = 10;
  state.stats.helped = 2; state.stats.thefts = 3; state.stats.kills = 1;
  safeNight(state); E.nextDay(state);
  const before = copy(state);
  const epilogues = E.getEpilogues(state);
  assert.deepEqual(state, before, 'reading endings must not consume RNG or modify the save');
  assert.equal(new Set(epilogues.map(entry => entry.title)).size, 3);
  assert.equal(epilogues[0].title, '미라에게도 필요한 회복');
  assert.equal(epilogues[1].title, '윤이 기다리는 아침');
  assert.equal(epilogues[2].title, '레오가 기억할 밤길');
  for (const entry of epilogues) {
    assert.ok(entry.body.includes(entry.name));
    assert.match(entry.body, /봉쇄 조건/);
    assert.match(entry.body, /이웃을 도운 일 2회/);
    assert.match(entry.body, /공동체가 겪은 밤/);
  }
  assert.deepEqual(state.ending.epilogues, epilogues);
  assert.deepEqual(E.getEpilogues(E.restoreGame(state)), epilogues);
  assert.equal(E.isValidSave(state), true);
});

test('deceased survivors receive factual loss dates rather than a successful evacuation story', () => {
  const state = E.createGame(47); state.day = 6;
  for (const person of state.characters) person.health = 1;
  safeNight(state); E.nextDay(state);
  assert.equal(state.ending.kind, 'defeat');
  for (const entry of E.getEpilogues(state)) {
    assert.equal(entry.alive, false);
    assert.match(entry.body, /6일째 밤/);
    assert.match(entry.body, /남은 생존자가 없습니다/);
    assert.doesNotMatch(entry.body, /구호 차량에 올랐습니다/);
  }
});

test('legacy version 1 saves default to standard integrity and old endings gain epilogues', () => {
  const state = E.createGame(48); state.day = 12;
  safeNight(state); E.nextDay(state);
  const legacy = copy(state);
  delete legacy.difficulty; delete legacy.campaign; delete legacy.shelterIntegrity;
  delete legacy.report.supplyDelta; delete legacy.report.characterChanges;
  for (const key of ['wear', 'integrityBefore', 'integrityAfter']) delete legacy.report.raid[key];
  delete legacy.ending.epilogues;
  assert.equal(E.isValidSave(legacy), true);
  const restored = E.restoreGame(legacy);
  assert.equal(restored.difficulty, 'standard');
  assert.equal(restored.shelterIntegrity, 100);
  assert.equal(restored.campaign.difficultyLabel, '표준');
  assert.equal(restored.ending.epilogues.length, 3);
  assert.equal(legacy.difficulty, undefined);
  assert.equal(E.isValidSave(restored), true);
});

test('new campaign, signed report and optional epilogue fields are validated without breaking old saves', () => {
  const ended = E.createGame(49); ended.day = 12;
  safeNight(ended); E.nextDay(ended);
  for (const mutate of [
    s => { s.difficulty = 'custom'; },
    s => { s.difficulty = ['standard']; },
    s => { s.shelterIntegrity = -1; },
    s => { s.shelterIntegrity = 101; },
    s => { s.shelterIntegrity = NaN; },
    s => { s.campaign.difficulty = 'siege'; },
    s => { s.report.supplyDelta.fake = -1; },
    s => { s.report.supplyDelta.fuel = -.5; },
    s => { s.report.characterChanges[0].delta.health = 100; },
    s => { s.report.characterChanges[1].id = 'mira'; },
    s => { s.report.raid.integrityAfter = 0; },
    s => { s.ending.epilogues[0].alive = 'yes'; },
    s => { s.ending.epilogues[1].id = 'mira'; },
  ]) { const bad = copy(ended); mutate(bad); assert.equal(E.isValidSave(bad), false); assert.throws(() => E.restoreGame(bad)); }
});

test('encounter permissions and hostility persist through settlement with strict optional field checks', () => {
  const state = E.createGame(50); state.day = 2;
  goNight(state, nightPlan(state, 'leo', {}, 'clinic'));
  const locationState = { remaining: {}, encounters: { clinic_supplies: { requested: true, resolved: true, choiceId: 'help' } }, permissions: { clinic_supplies: { area: true, loot: true } }, hostileNpcIds: [] };
  assert.equal(E.finishNight(state, fieldResult({ locationId: 'clinic', locationState, helped: 1 })).ok, true);
  assert.deepEqual(E.restoreGame(state).locations.clinic, locationState);
  for (const mutate of [
    s => { s.locations.clinic.encounters.clinic_supplies.resolved = 1; },
    s => { s.locations.clinic.permissions.clinic_supplies.loot = 'yes'; },
    s => { s.locations.clinic.hostileNpcIds = [99]; },
  ]) { const bad = copy(state); mutate(bad); assert.equal(E.isValidSave(bad), false); }
});


test('field distractions are counted once and reported only when actually used', () => {
  const state = E.createGame(31);
  assert.equal(state.stats.distractions, 0);
  goNight(state, nightPlan(state, 'leo'));
  const before = copy(state);
  for (const distractions of [-1, 1.5, NaN, 101, '2']) {
    assert.equal(E.finishNight(state, fieldResult({ distractions })).ok, false);
    assert.deepEqual(state, before);
  }
  assert.equal(E.finishNight(state, fieldResult({ distractions: 2 })).ok, true);
  assert.equal(state.stats.distractions, 2);
  assert.equal(state.report.items.filter(item => item.text.includes('소음 유인을 2회')).length, 1);
  const settled = copy(state);
  assert.equal(E.finishNight(state, fieldResult({ distractions: 2 })).ok, false);
  assert.deepEqual(state, settled);
  E.nextDay(state);
  safeNight(state);
  assert.equal(state.stats.distractions, 2);
  assert.equal(state.report.items.some(item => item.text.includes('소음 유인을')), false);
  assert.equal(E.isValidSave(state), true);
});

test('legacy saves migrate distraction totals to zero and malformed totals are rejected', () => {
  const legacy = E.createGame(31);
  delete legacy.stats.distractions;
  assert.equal(E.isValidSave(legacy), true);
  const restored = E.restoreGame(legacy);
  assert.equal(restored.stats.distractions, 0);
  assert.equal(legacy.stats.distractions, undefined);
  for (const value of [-1, 1.5, NaN, '2', 100001]) {
    const bad = copy(restored); bad.stats.distractions = value;
    assert.equal(E.isValidSave(bad), false);
  }
});
