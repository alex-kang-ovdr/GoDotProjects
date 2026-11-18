'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Contracts = require('../src/mission-data.js');
const { ContractRun, validateDefinition } = require('../src/mission.js');
const def = Contracts.harbor_recovery;
const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
const clone = value => JSON.parse(JSON.stringify(value));
const facts = (overrides = {}) => ({
  alive: true, playerPos: [...def.locations.spawn], inTarget: false,
  targetPos: [...def.locations.target], targetHp: 240, targetMaxHp: 240,
  targetSpeed: 0, wanted: 0, pendingReports: 0, shots: 0, civilianCasualties: 0,
  ...overrides
});
const driving = (overrides = {}) => facts({ inTarget: true, playerPos: [...def.locations.target], ...overrides });
const atDepot = (overrides = {}) => driving({ playerPos: [...def.locations.garage], targetPos: [...def.locations.garage], ...overrides });
function acquiredRun(approach = 'quiet') {
  const run = new ContractRun(def, approach);
  run.update(0, driving());
  return run;
}
function deliveryRun(approach = 'quiet') {
  const run = acquiredRun(approach);
  run.update(3, driving());
  assert.equal(run.phase, 'deliver');
  return run;
}
function completedRun(approach = 'quiet', overrides = {}) {
  const run = deliveryRun(approach);
  run.update(1.25, atDepot(overrides));
  assert.equal(run.phase, 'complete');
  return run;
}
const eventTypes = result => result.events.map(event => event.type);

test('Both route definitions preserve the original 750-credit contract', () => {
  assert.equal(validateDefinition(def), def);
  assert.equal(def.reward, 750);
  assert.equal(Object.keys(def.approaches).length, 2);
  assert.equal(def.evidence.originalGameMeasured, false);
  assert.ok(Object.isFrozen(def.rules));
});
test('Browser scripts publish the same global APIs used by Node tests', () => {
  const scope = { window: {} };
  vm.createContext(scope);
  for (const file of ['mission-data.js', 'mission.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), scope);
  const browserRun = new scope.window.HarborMission.ContractRun(scope.window.HarborContracts.harbor_recovery, 'direct');
  assert.equal(browserRun.phase, 'reach');
  assert.equal(browserRun.approach, 'direct');
});
test('Quiet and direct routes point to clear surfaces in the real collision world', () => {
  const scope = {
    window: {},
    HM: { compose() { return []; }, clamp: (n, a, b) => Math.max(a, Math.min(b, n)) },
    renderer: { box() {}, sphere() {}, cylinder() {}, seal() {} }
  };
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/data.js'), 'utf8'), scope);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/world.js'), 'utf8') + '\nglobalThis.world = new HarborWorld(renderer);', scope);
  for (const p of [def.approaches.quiet.beacon, def.approaches.direct.beacon, def.locations.target, def.locations.garage]) {
    const y = scope.world.supportHeight(p[0], p[2], .35);
    assert.ok(scope.world.clear(p[0], p[2], .4, y, 1.9), 'blocked walking point ' + p);
    assert.ok(scope.world.clear(p[0], p[2], 1.4, y, 1.4), 'blocked vehicle point ' + p);
  }
});
test('Each selected approach exposes its own optional beacon and route cue', () => {
  for (const approach of ['quiet', 'direct']) {
    const run = new ContractRun(def, approach), objective = run.objective();
    assert.deepEqual(objective.goal, def.approaches[approach].beacon);
    assert.equal(objective.routeCue, def.approaches[approach].routeCue);
    assert.ok(objective.description.length > 0);
  }
});
test('Reaching a branch beacon completes recon once without acquiring the vehicle', () => {
  const run = new ContractRun(def, 'quiet');
  const f = facts({ playerPos: [...def.approaches.quiet.beacon] });
  const first = run.update(.1, f), second = run.update(.1, f);
  assert.deepEqual(eventTypes(first), ['route_beacon_reached', 'recon_completed']);
  assert.equal(first.phase, 'recover');
  assert.equal(first.acquired, false);
  assert.deepEqual(second.events, []);
  assert.deepEqual(second.objective.goal, def.locations.target);
});
test('Recon uses the configured 42-metre boundary', () => {
  const run = new ContractRun(def), p = [...def.locations.target];
  p[0] -= 42.001;
  assert.equal(run.update(.1, facts({ playerPos: p })).phase, 'reach');
  p[0] += .001;
  assert.equal(run.update(.1, facts({ playerPos: p })).phase, 'recover');
});
test('Early target entry skips optional routing and completes recon plus acquire', () => {
  const run = new ContractRun(def, 'direct');
  const result = run.update(.1, driving());
  assert.equal(result.phase, 'escape');
  assert.deepEqual(eventTypes(result), ['recon_completed', 'vehicle_acquired']);
  assert.equal(run.beaconVisited, false);
  assert.equal(result.events.find(e => e.type === 'vehicle_acquired').checkpoint, true);
  assert.deepEqual(result.completedNodes, ['briefing', 'recon', 'acquire']);
});
test('Leaving the target preserves acquisition and routes back to the actual vehicle', () => {
  const run = acquiredRun(), when = run.acquiredAt, p = [22, 0, -9];
  const result = run.update(.25, facts({ targetPos: p }));
  assert.equal(result.phase, 'recover');
  assert.equal(run.acquired, true);
  assert.equal(run.acquiredAt, when);
  assert.deepEqual(result.objective.goal, p);
  assert.ok(result.objective.title.includes('복귀'));
});
test('Re-entering the target does not create a second acquisition checkpoint', () => {
  const run = acquiredRun();
  run.update(1, facts());
  const result = run.update(3, driving());
  assert.equal(result.phase, 'deliver');
  assert.ok(!eventTypes(result).includes('vehicle_acquired'));
  assert.equal([...run.completedNodes].filter(id => id === 'acquire').length, 1);
});
test('Acquisition grace is at least three seconds and cannot count as delivery hold', () => {
  const run = new ContractRun(def);
  run.update(0, atDepot());
  assert.equal(run.update(2.99, atDepot()).phase, 'escape');
  assert.equal(run.hold, 0);
  assert.equal(run.update(.01, atDepot()).phase, 'deliver');
  assert.equal(run.hold, 0);
  assert.equal(run.update(1.24, atDepot()).phase, 'deliver');
  assert.equal(run.update(.01, atDepot()).phase, 'complete');
});
test('A coarse tick cannot reuse grace time to finish depot hold', () => {
  const run = new ContractRun(def);
  run.update(0, atDepot());
  assert.equal(run.update(3.5, atDepot()).phase, 'deliver');
  assert.equal(run.hold, .5);
  assert.equal(run.update(.75, atDepot()).phase, 'complete');
});
test('Wanted level zero with a pending report still blocks escape and delivery', () => {
  const run = acquiredRun();
  const result = run.update(5, atDepot({ pendingReports: 1 }));
  assert.equal(result.phase, 'escape');
  assert.equal(result.hold, 0);
  assert.ok(!eventTypes(result).includes('pursuit_cleared'));
});
test('Clearing the last pending report allows the escape node to complete', () => {
  const run = acquiredRun();
  run.update(3, driving({ pendingReports: 2 }));
  const result = run.update(.1, driving());
  assert.equal(result.phase, 'deliver');
  assert.deepEqual(eventTypes(result), ['pursuit_cleared']);
});
test('Re-wanted during a depot hold returns to escape and resets the full hold', () => {
  const run = deliveryRun();
  run.update(1, atDepot());
  const interrupted = run.update(.1, atDepot({ wanted: 1 }));
  assert.equal(interrupted.phase, 'escape');
  assert.equal(interrupted.hold, 0);
  const clear = run.update(.25, atDepot());
  assert.equal(clear.phase, 'deliver');
  assert.equal(clear.hold, .25);
  assert.ok(!eventTypes(clear).includes('pursuit_cleared'));
  assert.equal(run.update(1, atDepot()).phase, 'complete');
});
test('A newly queued report resets a nearly finished hold before any payout event', () => {
  const run = deliveryRun();
  run.update(1.24, atDepot());
  const result = run.update(.02, atDepot({ pendingReports: 1 }));
  assert.equal(result.phase, 'escape');
  assert.equal(result.hold, 0);
  assert.deepEqual(result.events, []);
});
test('Stepping out of the target resets a nearly finished hold', () => {
  const run = deliveryRun();
  run.update(1.24, atDepot());
  const result = run.update(.02, atDepot({ inTarget: false }));
  assert.equal(result.phase, 'recover');
  assert.equal(result.hold, 0);
  assert.deepEqual(result.events, []);
});
test('Driving out of the depot resets hold instead of preserving partial credit', () => {
  const run = deliveryRun();
  run.update(1, atDepot());
  const p = [...def.locations.garage]; p[2] += 7.001;
  assert.equal(run.update(.1, atDepot({ targetPos: p })).hold, 0);
  assert.equal(run.update(1, atDepot()).phase, 'deliver');
  assert.equal(run.update(.25, atDepot()).phase, 'complete');
});
test('Depot square boundary and forward speed cap are inclusive', () => {
  const run = deliveryRun(), p = [...def.locations.garage]; p[0] += 7; p[2] -= 7;
  assert.equal(run.update(1.25, atDepot({ targetPos: p, targetSpeed: .5 })).phase, 'complete');
});
test('Reverse speed is checked by magnitude', () => {
  const run = deliveryRun();
  assert.equal(run.update(1.25, atDepot({ targetSpeed: -.501 })).hold, 0);
  assert.equal(run.update(1.25, atDepot({ targetSpeed: -.5 })).phase, 'complete');
});
test('Player death on the final delivery tick preempts success', () => {
  const run = deliveryRun();
  run.update(1.24, atDepot());
  const result = run.update(.02, atDepot({ alive: false }));
  assert.equal(result.phase, 'failed');
  assert.equal(result.failureReason, 'player_dead');
  assert.deepEqual(eventTypes(result), ['mission_failed']);
  assert.equal(result.hold, 0);
});
test('Target destruction on the final delivery tick preempts success', () => {
  const run = deliveryRun();
  run.update(1.24, atDepot());
  const result = run.update(.02, atDepot({ targetHp: 0 }));
  assert.equal(result.phase, 'failed');
  assert.equal(result.failureReason, 'target_destroyed');
  assert.deepEqual(eventTypes(result), ['mission_failed']);
});
test('Simultaneous player death and vehicle destruction chooses one failure event', () => {
  const run = deliveryRun();
  const result = run.update(1.25, atDepot({ alive: false, targetHp: 0 }));
  assert.equal(result.failureReason, 'player_dead');
  assert.equal(result.events.length, 1);
  assert.deepEqual(run.update(1, atDepot()).events, []);
});
test('Completion emits its 750-credit reward exactly once', () => {
  const run = deliveryRun();
  const result = run.update(1.25, atDepot());
  const complete = result.events.find(event => event.type === 'mission_completed');
  assert.equal(complete.reward, 750);
  assert.equal(complete.rank, 'S');
  assert.equal(complete.medals.filter(m => m.earned).length, 3);
  for (let i = 0; i < 30; i++) assert.deepEqual(run.update(.1, atDepot()).events, []);
  assert.equal(run.elapsed, 4.25);
});
test('Completion node list includes delivery and terminal completion', () => {
  const run = completedRun();
  assert.deepEqual(run.result([]).completedNodes, ['briefing', 'recon', 'acquire', 'escape', 'deliver', 'complete']);
  assert.equal(run.progress, 1);
});
test('Quiet approach evaluates no-shots without adding bonus currency', () => {
  const run = deliveryRun('quiet');
  const result = run.update(1.25, atDepot({ shots: 1 }));
  assert.equal(result.medals.find(m => m.id === 'quiet_hands').earned, false);
  assert.ok(!result.medals.some(m => m.id === 'quick_return'));
  assert.equal(result.rank, 'A');
  assert.equal(result.events.find(e => e.type === 'mission_completed').reward, 750);
});
test('Shot and casualty totals cannot be erased by lower later counters', () => {
  const run = deliveryRun();
  run.update(.1, driving({ shots: 3, civilianCasualties: 2 }));
  const result = run.update(1.25, atDepot());
  assert.equal(run.metrics.shots, 3);
  assert.equal(run.metrics.civilianCasualties, 2);
  assert.equal(result.medals.find(m => m.id === 'clean_hands').earned, false);
  assert.equal(result.medals.find(m => m.id === 'quiet_hands').earned, false);
  assert.equal(result.rank, 'B');
});
test('Vehicle-care medal accepts exactly 60% delivered HP', () => {
  const run = completedRun('quiet', { targetHp: 144 });
  assert.equal(run.medals().find(m => m.id === 'vehicle_care').earned, true);
});
test('Vehicle-care medal rejects below 60% and uses delivered HP', () => {
  const run = deliveryRun();
  run.update(.1, driving({ targetHp: 100 }));
  assert.equal(run.medals().find(m => m.id === 'vehicle_care').status, 'pending');
  run.update(1.25, atDepot({ targetHp: 143.9 }));
  assert.equal(run.medals().find(m => m.id === 'vehicle_care').earned, false);
});
test('Direct approach permits shots and awards its time medal at exactly 300 seconds', () => {
  const run = deliveryRun('direct');
  for (let i = 0; i < 59; i++) run.update(5, driving({ shots: 12 }));
  run.update(.75, driving({ shots: 12 }));
  const result = run.update(1.25, atDepot({ shots: 12 }));
  assert.equal(run.elapsed, 300);
  assert.equal(result.medals.find(m => m.id === 'quick_return').earned, true);
  assert.ok(!result.medals.some(m => m.id === 'quiet_hands'));
  assert.equal(result.rank, 'S');
});
test('Direct approach misses the time medal after 300 seconds but still completes', () => {
  const run = deliveryRun('direct');
  for (let i = 0; i < 60; i++) run.update(5, driving());
  const result = run.update(1.25, atDepot());
  assert.equal(result.phase, 'complete');
  assert.equal(result.medals.find(m => m.id === 'quick_return').earned, false);
  assert.equal(result.events.find(e => e.type === 'mission_completed').reward, 750);
});
test('Medals are pending during play and never awarded for a failed mission', () => {
  const run = deliveryRun();
  assert.ok(run.medals().every(m => !m.earned && m.status === 'pending'));
  run.update(.1, atDepot({ alive: false }));
  assert.ok(run.medals().every(m => !m.earned && m.status === 'missed'));
});
test('Checkpoint snapshot restores acquisition and emits no duplicate acquire event', () => {
  const original = acquiredRun('direct'), snapshot = original.snapshot();
  const restored = ContractRun.fromSnapshot(def, snapshot);
  assert.deepEqual(restored.snapshot(), snapshot);
  const result = restored.update(3, driving());
  assert.equal(result.phase, 'deliver');
  assert.deepEqual(eventTypes(result), ['pursuit_cleared']);
});
test('Snapshot preserves partial delivery hold and completes only its remaining time', () => {
  const original = deliveryRun(); original.update(.75, atDepot());
  const restored = ContractRun.fromSnapshot(def, original.snapshot());
  assert.equal(restored.update(.49, atDepot()).phase, 'deliver');
  const result = restored.update(.01, atDepot());
  assert.equal(result.phase, 'complete');
  assert.deepEqual(eventTypes(result), ['mission_completed']);
});
test('Snapshot after re-wanted resumes escape with delivery progress reset', () => {
  const original = deliveryRun();
  original.update(1, atDepot()); original.update(.1, atDepot({ wanted: 2 }));
  const restored = ContractRun.fromSnapshot(def, original.snapshot());
  assert.equal(restored.phase, 'escape');
  assert.equal(restored.hold, 0);
  assert.deepEqual(restored.update(.1, driving()).events, []);
});
test('Restoring a completed snapshot never repeats the reward event', () => {
  const original = completedRun('direct'), snapshot = original.snapshot();
  const restored = ContractRun.fromSnapshot(def, snapshot);
  assert.deepEqual(restored.update(1, atDepot()).events, []);
  assert.deepEqual(restored.snapshot(), snapshot);
});
test('Failed snapshots remain terminal and do not resurrect the target', () => {
  const original = acquiredRun(); original.update(.1, driving({ targetHp: 0 }));
  const restored = ContractRun.fromSnapshot(def, original.snapshot());
  assert.equal(restored.phase, 'failed');
  assert.deepEqual(restored.update(1, atDepot()).events, []);
});
test('Snapshots and restored state do not share nested mutable data', () => {
  const original = deliveryRun(), snapshot = original.snapshot();
  const restored = ContractRun.fromSnapshot(def, snapshot);
  snapshot.metrics.shots = 999; snapshot.lastFacts.targetPos[0] = 999;
  assert.equal(original.metrics.shots, 0);
  assert.equal(restored.metrics.shots, 0);
  assert.equal(restored.lastFacts.targetPos[0], def.locations.target[0]);
});
test('Invalid restore is atomic and leaves the current contract untouched', () => {
  const run = deliveryRun(), before = run.snapshot(), invalid = clone(before);
  invalid.hold = NaN;
  assert.throws(() => run.restore(invalid));
  assert.deepEqual(run.snapshot(), before);
});
for (const [name, mutate] of [
  ['foreign definition', s => { s.definitionId = 'other'; }],
  ['foreign revision', s => { s.definitionRevision = 'old'; }],
  ['unknown phase', s => { s.phase = 'free'; }],
  ['invalid approach', s => { s.approach = 'loud'; }],
  ['negative elapsed', s => { s.elapsed = -1; }],
  ['infinite elapsed', s => { s.elapsed = Infinity; }],
  ['future acquisition', s => { s.acquiredAt = s.elapsed + 1; }],
  ['flag/node mismatch', s => { s.acquired = false; s.acquiredAt = null; }],
  ['duplicate node', s => { s.completedNodes.push('briefing'); }],
  ['missing escape node', s => { s.completedNodes = s.completedNodes.filter(id => id !== 'escape'); }],
  ['hold overflow', s => { s.hold = 10; }],
  ['negative statistics', s => { s.metrics.shots = -1; }],
  ['NaN coordinates', s => { s.lastFacts.targetPos[0] = NaN; }],
  ['wrong event sequence', s => { s.eventSequence = 0; }],
  ['pending report in delivery', s => { s.lastFacts.pendingReports = 1; }],
  ['dead player in delivery', s => { s.lastFacts.alive = false; }],
  ['empty driver seat in delivery', s => { s.lastFacts.inTarget = false; }],
  ['forged integrity ratio', s => { s.metrics.targetIntegrity = .5; }]
]) test('Snapshot rejects ' + name, () => {
  const snapshot = deliveryRun().snapshot(); mutate(snapshot);
  assert.throws(() => ContractRun.fromSnapshot(def, snapshot));
});
test('Completed save cannot claim delivery from outside the garage', () => {
  const snapshot = completedRun().snapshot(); snapshot.lastFacts.targetPos = [...def.locations.target];
  assert.throws(() => ContractRun.fromSnapshot(def, snapshot));
});
test('Delivery save cannot preserve hold while the vehicle is moving', () => {
  const run = deliveryRun(); run.update(.5, atDepot());
  const snapshot = run.snapshot(); snapshot.lastFacts.targetSpeed = 2;
  assert.throws(() => ContractRun.fromSnapshot(def, snapshot));
});
test('Malformed graph transitions and unsupported predicates fail before play', () => {
  const graph = clone(def); graph.nodes.find(n => n.id === 'acquire').next = 'complete';
  assert.throws(() => new ContractRun(graph));
  const predicate = clone(def); predicate.nodes.find(n => n.id === 'deliver').predicate = 'always';
  assert.throws(() => new ContractRun(predicate));
});
test('Missing safety facts fail explicitly instead of granting a delivery', () => {
  const run = deliveryRun(), f = atDepot(); delete f.pendingReports;
  assert.throws(() => run.update(1.25, f));
  assert.equal(run.phase, 'deliver');
  assert.equal(run.hold, 0);
});
test('Invalid frame durations do not advance the mission clock', () => {
  const run = new ContractRun(def);
  for (const dt of [-1, Infinity, NaN, 5.01]) assert.throws(() => run.update(dt, facts()));
  assert.equal(run.elapsed, 0);
});
test('New game creates fresh completion state without mutating an old completed run', () => {
  const old = completedRun(), fresh = new ContractRun(def, 'direct');
  assert.equal(old.phase, 'complete');
  assert.equal(fresh.phase, 'reach');
  assert.equal(fresh.eventSequence, 0);
  assert.equal(fresh.elapsed, 0);
  assert.deepEqual([...fresh.completedNodes], ['briefing']);
});

const report = { suite: 'v4 mission contract semantics', passed: results.filter(r => r.pass).length, total: results.length, results };
fs.mkdirSync(path.join(__dirname, '../reports'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../reports/mission-v4-results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.passed !== report.total) process.exitCode = 1;
