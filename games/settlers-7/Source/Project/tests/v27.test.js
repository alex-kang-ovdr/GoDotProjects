'use strict';

// These tests execute the shipping simulation. Fixtures arrange territory and
// rosters explicitly; they are not claims about the original game's balance.
const A = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Game, D, DT, sum} = require('../game/engine.js');
const results = [];

function test(name, fn) {
  const started = performance.now();
  try {
    fn();
    results.push({name, passed: true, ms: Math.round(performance.now() - started)});
    console.log('PASS', name);
  } catch (error) {
    results.push({name, passed: false, error: error.stack});
    console.error('FAIL', name, error.message);
  }
}
function clean() {
  const g = new Game({ai: false});
  g.s.workshops = [];
  for (const b of g.s.buildings) b.workshops = [];
  g.s.agents = g.s.agents.filter(a => a.role === 'carrier');
  for (const h of g.s.warehouses) h.stock = {};
  for (const sec of g.s.sectors) sec.units = {};
  g.s.initial = g.totals();
  g.s.metrics = {samples: []};
  g.sampleMetrics();
  return g;
}
function own(g, ...ids) { for (const id of ids) g.capture(g.s.sectors[id], 0); }
function grant(g, goods, sector = 0) {
  const h = g.warehouses(g.s.sectors[sector].owner, sector)[0];
  for (const [r, n] of Object.entries(goods)) h.stock[r] = (h.stock[r] || 0) + n;
  g.produce(goods, h.owner);
}
function cmd(g, type, args, owner = 0) {
  const result = g.command(type, args, owner);
  A.ok(result.ok, result.message);
  return result;
}
function audit(g) { A.deepEqual(g.audit().errors, []); }
function until(g, predicate, seconds = 120) {
  for (let i = 0; i < seconds / DT && !predicate(); i++) g.tick();
  A.ok(predicate(), 'Expected transition did not occur within ' + seconds + ' seconds');
}
function roster(g, owner = 0) {
  const counts = {};
  for (const sec of g.s.sectors.filter(s => s.owner === owner))
    for (const [u, n] of Object.entries(sec.units)) counts[u] = (counts[u] || 0) + n;
  for (const e of g.s.expeditions.filter(e => e.owner === owner))
    for (const [u, n] of Object.entries(e.units)) counts[u] = (counts[u] || 0) + n;
  return Object.fromEntries(Object.entries(counts).filter(([,n]) => n));
}
function rejectUnchanged(g, type, args, owner = 0) {
  const before = g.serialize();
  A.equal(g.command(type, args, owner).ok, false);
  A.equal(g.serialize(), before, 'Rejected command must not mutate the kingdom');
}
function expedition(g, id) { return g.s.expeditions.find(e => e.id === id); }
function battleFixture() {
  const g = clean();
  own(g, 1, 4);
  g.s.sectors[4].units = {pikeman: 12, novice: 2, hawker: 1};
  g.s.sectors[5].units = {pikeman: 20};
  const id = cmd(g, 'expedition', {from: 5, to: 4, kind: 'military', units: {pikeman: 20}}, 1).id;
  until(g, () => expedition(g, id)?.phase === 'battle', 30);
  return {g, id, battle: expedition(g, id)};
}

test('Friendly redeployment preview is read-only and exposes exact remaining roster and travel estimate', () => {
  const g = clean(); own(g, 1);
  g.s.sectors[0].units = {pikeman: 5, novice: 2, hawker: 1};
  const before = g.serialize();
  const p = g.inspectExpedition({from: 0, to: 1, kind: 'redeploy', units: {pikeman: 3, novice: 1, hawker: 1}});
  A.ok(p.ok, p.message); A.deepEqual(p.units, {pikeman: 3, novice: 1, hawker: 1});
  A.equal(p.remainingUnits.pikeman, 2); A.equal(p.remainingUnits.novice, 1);
  A.ok(p.etaSeconds > 0); A.ok(p.route.length > 1);
  A.deepEqual(p.route[0], g.s.sectors[0].hub); A.deepEqual(p.route.at(-1), g.s.sectors[1].hub);
  A.equal(g.serialize(), before);
});

test('Mixed military clergy and trader party physically travels before joining friendly garrison', () => {
  const g = clean(); own(g, 1);
  const units = {pikeman: 3, novice: 2, hawker: 1};
  g.s.sectors[0].units = {...units};
  const population = g.population(0).used;
  const id = cmd(g, 'redeploy', {from: 0, to: 1, units}).id;
  A.equal(sum(g.s.sectors[0].units), 0); A.equal(sum(g.s.sectors[1].units), 0);
  A.equal(expedition(g, id).kind, 'redeploy'); A.equal(g.population(0).used, population);
  g.tick(); A.ok(expedition(g, id)); A.notDeepEqual(g.pos(expedition(g, id)), g.s.sectors[0].hub);
  until(g, () => !expedition(g, id));
  A.deepEqual(roster(g), units); A.equal(g.s.sectors[1].units.pikeman, 3);
  A.equal(g.s.sectors[1].units.novice, 2); A.equal(g.s.sectors[1].units.hawker, 1);
  A.equal(g.population(0).used, population); audit(g);
});

test('Redeployment crosses multiple owned sectors using an actual road route', () => {
  const g = clean(); own(g, 1, 2); g.s.sectors[0].units = {pikeman: 2};
  const p = g.inspectExpedition({from: 0, to: 2, kind: 'redeploy', units: {pikeman: 2}});
  A.ok(p.ok, p.message); A.ok(p.route.some(pt => g.sectorAt(...pt).id === 1));
  A.ok(p.route.every(pt => g.sectorAt(...pt).owner === 0));
  const id = cmd(g, 'redeploy', {from: 0, to: 2, units: {pikeman: 2}}).id;
  until(g, () => !expedition(g, id)); A.equal(g.s.sectors[2].units.pikeman, 2); audit(g);
});

test('Disconnected friendly destination cannot teleport a party through neutral territory', () => {
  const g = clean(); own(g, 2); g.s.sectors[0].units = {pikeman: 2};
  rejectUnchanged(g, 'redeploy', {from: 0, to: 2, units: {pikeman: 2}});
});

test('Redeployment rejects same enemy and neutral destinations without spending units', () => {
  const g = clean(); g.s.sectors[0].units = {pikeman: 2};
  for (const to of [0, 1, 5, 99]) rejectUnchanged(g, 'redeploy', {from: 0, to, units: {pikeman: 1}});
});

test('Invalid roster empty fractional negative unknown and oversized party all reject atomically', () => {
  const g = clean(); own(g, 1); g.s.sectors[0].units = {pikeman: 40, hawker: 2};
  for (const units of [{}, {pikeman: 0}, {pikeman: -1}, {pikeman: .5}, {ghost: 1}, {pikeman: 36}, {hawker: 3}, {pikeman: 1, hawker: -1}])
    rejectUnchanged(g, 'redeploy', {from: 0, to: 1, units});
});

test('Every supported unit type can be redeployed without converting or duplicating its identity', () => {
  const g = clean(); own(g, 1);
  const units = Object.fromEntries(Object.keys(D.units).map(id => [id, 1]));
  g.s.sectors[0].units = {...units};
  const id = cmd(g, 'redeploy', {from: 0, to: 1, units}).id;
  until(g, () => !expedition(g, id)); A.deepEqual(roster(g), units); audit(g);
});

test('Explicit military formation sends exactly chosen combat units and leaves other troops at home', () => {
  const g = clean(); g.s.sectors[0].units = {pikeman: 8, musketeer: 3, cavalier: 2, cannon: 1, standard_bearer: 1, hawker: 1};
  const units = {pikeman: 2, musketeer: 1, standard_bearer: 1};
  const p = g.inspectExpedition({from: 0, to: 1, kind: 'military', units});
  A.ok(p.ok, p.message); A.deepEqual(p.units, units); A.equal(p.remainingUnits.cannon, 1);
  const id = cmd(g, 'expedition', {from: 0, to: 1, kind: 'military', units}).id;
  A.deepEqual(expedition(g, id).units, units);
  A.equal(g.s.sectors[0].units.pikeman, 6); A.equal(g.s.sectors[0].units.cannon, 1);
  A.equal(g.s.sectors[0].units.hawker, 1); audit(g);
});

test('Military formation does not accept civilians unavailable counts or standard bearer alone', () => {
  const g = clean(); g.s.sectors[0].units = {pikeman: 2, novice: 2, hawker: 1, standard_bearer: 1};
  for (const units of [{pikeman: 3}, {pikeman: 1, novice: 1}, {hawker: 1}, {standard_bearer: 1}])
    rejectUnchanged(g, 'expedition', {from: 0, to: 1, kind: 'military', units});
});

test('Wall attack eligibility depends on selected ranged units rather than troops left behind', () => {
  const g = clean(); own(g, 1); g.s.sectors[1].units = {pikeman: 3, musketeer: 2};
  rejectUnchanged(g, 'expedition', {from: 1, to: 4, kind: 'military', units: {pikeman: 3}});
  A.ok(g.inspectExpedition({from: 1, to: 4, kind: 'military', units: {pikeman: 1, musketeer: 1}}).ok);
});

test('Legacy count military order remains playable for existing AI and saved workflows', () => {
  const g = new Game({ai: false});
  const id = cmd(g, 'expedition', {from: 0, to: 1, kind: 'military', count: 3}).id;
  A.equal(sum(expedition(g, id).units), 3); g.advance(3); audit(g);
});

test('Bribe preview agrees with consumed escrow and does not spend during inspection', () => {
  const g = clean(); g.s.sectors[0].units.hawker = 1; grant(g, {coin: 100, garment: 30, jewelry: 20});
  const before = g.serialize(); const p = g.inspectExpedition({from: 0, to: 1, kind: 'bribe'});
  A.ok(p.ok, p.message); A.equal(g.serialize(), before);
  const id = cmd(g, 'expedition', {from: 0, to: 1, kind: 'bribe'}).id;
  A.deepEqual(expedition(g, id).cargo, Object.fromEntries(Object.entries(p.cost).filter(([, n]) => n > 0))); audit(g);
});

test('Departure from an active defense cannot duplicate captured defender roster', () => {
  const {g} = battleFixture();
  rejectUnchanged(g, 'redeploy', {from: 4, to: 1, units: {pikeman: 2}});
  rejectUnchanged(g, 'expedition', {from: 4, to: 3, kind: 'military', units: {pikeman: 2}});
});

test('Recruit finishing during defense joins active defenders and survives the next synchronization', () => {
  const {g, battle} = battleFixture();
  g.createBuilding('stronghold', 31, 26, 0, true);
  grant(g, {coin: 2, weapon: 1, coal: 2}, 4);
  const id = cmd(g, 'recruit', {unit: 'musketeer', sector: 4}).id;
  g.s.training.find(t => t.id === id).remaining = DT;
  g.tick();
  A.equal(g.s.sectors[4].units.musketeer, 1);
  A.equal(battle.defenders.filter(t => t.type === 'musketeer' && t.hp > 0).length, 1);
  g.advance(1);
  A.equal(g.s.sectors[4].units.musketeer, 1);
  A.equal(g.s.sectors[4].units.novice, 2); A.equal(g.s.sectors[4].units.hawker, 1); audit(g);
});

test('A friendly reinforcement joins active defense once while clergy and traders remain civilians', () => {
  const {g, battle} = battleFixture();
  g.s.sectors[1].units = {musketeer: 2, novice: 1, hawker: 1};
  const id = cmd(g, 'redeploy', {from: 1, to: 4, units: {musketeer: 2, novice: 1, hawker: 1}}).id;
  // Arrange the last valid road edge to exercise receipt while combat is active.
  const e = expedition(g, id); e.node = [29, 26]; e.route = [[29, 27]]; e.progress = 0;
  until(g, () => !expedition(g, id), 2);
  A.equal(g.s.sectors[4].units.musketeer, 2);
  A.equal(battle.defenders.filter(t => t.type === 'musketeer' && t.hp > 0).length, 2);
  A.ok(battle.defenders.every(t => D.units[t.type].branch === 'military'));
  A.equal(g.s.sectors[4].units.novice, 3); A.equal(g.s.sectors[4].units.hawker, 2);
  g.advance(1); A.equal(g.s.sectors[4].units.musketeer, 2); audit(g);
});

test('Loss of deployment destination returns the party without adding it to enemy garrison', () => {
  const g = clean(); own(g, 1); const units = {pikeman: 2, novice: 1, hawker: 1}; g.s.sectors[0].units = {...units};
  const id = cmd(g, 'redeploy', {from: 0, to: 1, units}).id;
  g.advance(1); g.capture(g.s.sectors[1], 1);
  until(g, () => !expedition(g, id)); A.deepEqual(roster(g), units);
  A.equal(sum(g.s.sectors[1].units), 0); A.equal(g.s.sectors[0].units.pikeman, 2); audit(g);
});

test('Loss of departure outpost does not prevent delivery to a surviving friendly destination', () => {
  const g = clean(); own(g, 1); g.s.sectors[1].units = {novice: 2, hawker: 1};
  const id = cmd(g, 'redeploy', {from: 1, to: 0, units: {novice: 2, hawker: 1}}).id;
  g.advance(1); g.capture(g.s.sectors[1], 1);
  until(g, () => !expedition(g, id));
  A.equal(g.s.sectors[0].units.novice, 2); A.equal(g.s.sectors[0].units.hawker, 1);
  A.equal(sum(g.s.sectors[1].units), 0); audit(g);
});

test('Loss of an intervening region cannot continue an unopposed deployment through enemy territory', () => {
  const g = clean(); own(g, 1, 2); g.s.sectors[0].units = {pikeman: 2};
  const id = cmd(g, 'redeploy', {from: 0, to: 2, units: {pikeman: 2}}).id;
  g.advance(1); g.capture(g.s.sectors[1], 1);
  until(g, () => !expedition(g, id));
  A.equal(g.s.sectors[0].units.pikeman, 2); A.equal(g.s.sectors[2].units.pikeman || 0, 0);
  A.equal(sum(g.s.sectors[1].units), 0); audit(g);
});

test('Mid-edge redeployment recall preserves position and returns each unit exactly once', () => {
  const g = clean(); own(g, 1); g.s.sectors[0].units = {pikeman: 2, hawker: 1};
  const id = cmd(g, 'redeploy', {from: 0, to: 1, units: {pikeman: 2, hawker: 1}}).id;
  g.advance(.75); const e = expedition(g, id), pos = g.pos(e); A.ok(e.progress > 0);
  cmd(g, 'retreat', {id}); A.deepEqual(g.pos(e), pos);
  until(g, () => !expedition(g, id));
  A.deepEqual(roster(g), {pikeman: 2, hawker: 1});
  g.advance(5); A.deepEqual(roster(g), {pikeman: 2, hawker: 1}); audit(g);
});

test('Redeployment status updates ETA without mutating state or advancing paused time', () => {
  const g = clean(); own(g, 1); g.s.sectors[0].units = {pikeman: 2};
  const id = cmd(g, 'redeploy', {from: 0, to: 1, units: {pikeman: 2}}).id;
  const first = g.expeditionStatus(id), before = g.serialize();
  A.ok(first.etaSeconds > 0); g.expeditionStatus(id); A.equal(g.serialize(), before);
  g.advance(1); A.ok(g.expeditionStatus(id).etaSeconds < first.etaSeconds);
});

test('Save during mixed redeployment resumes byte-identical travel and arrival', () => {
  const g = clean(); own(g, 1, 2); g.s.sectors[0].units = {pikeman: 2, novice: 1, hawker: 1};
  cmd(g, 'redeploy', {from: 0, to: 2, units: {pikeman: 2, novice: 1, hawker: 1}});
  g.advance(2.25); const h = Game.fromSave(g.serialize());
  A.equal(g.serialize(), h.serialize()); g.advance(60); h.advance(60);
  A.equal(g.serialize(), h.serialize()); audit(g); audit(h);
});

test('Save after destination loss and recall preserves deterministic recovery', () => {
  const g = clean(); own(g, 1); g.s.sectors[0].units = {pikeman: 2};
  const id = cmd(g, 'redeploy', {from: 0, to: 1, units: {pikeman: 2}}).id;
  g.advance(2); g.capture(g.s.sectors[1], 1); g.tick();
  A.ok(expedition(g, id)); const h = Game.fromSave(g.serialize());
  g.advance(30); h.advance(30); A.equal(g.serialize(), h.serialize()); audit(g);
});

test('Active defense with newly trained soldiers remains reloadable and deterministic', () => {
  const {g} = battleFixture();
  g.createBuilding('stronghold', 31, 26, 0, true); grant(g, {coin: 2, weapon: 1, coal: 2}, 4);
  const id = cmd(g, 'recruit', {unit: 'musketeer', sector: 4}).id;
  g.s.training.find(t => t.id === id).remaining = DT; g.tick();
  const h = Game.fromSave(g.serialize()); g.advance(20); h.advance(20);
  A.equal(g.serialize(), h.serialize()); audit(g);
});

test('Actual v24 v25 and v26 fixtures migrate without changing inventories reservations or moving agents', () => {
  for (const version of [24, 25, 26]) {
    const text = fs.readFileSync(path.join(__dirname, 'fixtures/v' + version + '_in_transit.json'), 'utf8');
    const old = JSON.parse(text), g = Game.fromSave(text);
    A.equal(g.s.version, 27); A.equal(JSON.parse(g.serialize()).format, 'S7-PLAYABLE-27');
    for (const k of ['tick', 'agents', 'warehouses', 'jobs', 'initial', 'ledger']) A.deepEqual(g.s[k], old.state[k], k + ' v' + version);
    if (version === 26) A.deepEqual(g.s.operations, old.state.operations);
    g.advance(30); audit(g);
  }
});

test('Malformed deployment roster route and owner saves reject before entering live play', () => {
  const g = clean(); own(g, 1); g.s.sectors[0].units = {pikeman: 3};
  cmd(g, 'redeploy', {from: 0, to: 1, units: {pikeman: 2}}); g.tick();
  const mutations = [
    s => {s.expeditions[0].units.pikeman = -1;},
    s => {s.expeditions[0].units.ghost = 1;},
    s => {s.expeditions[0].units.pikeman = 36;},
    s => {s.expeditions[0].route = [[59, 35]];},
    s => {s.expeditions[0].owner = 3;}
  ];
  for (const mutate of mutations) {
    const doc = JSON.parse(g.serialize()); mutate(doc.state);
    A.throws(() => Game.fromSave(JSON.stringify(doc)));
  }
});

test('Military redeploy and recall sequence conserves every party member over repeated trips', () => {
  const g = clean(); own(g, 1); const units = {pikeman: 4, musketeer: 2, novice: 1, hawker: 1};
  g.s.sectors[0].units = {...units};
  for (let trip = 0; trip < 4; trip++) {
    const from = trip % 2, to = 1 - from;
    const id = cmd(g, 'redeploy', {from, to, units}).id;
    until(g, () => !expedition(g, id)); A.deepEqual(roster(g), units); audit(g);
  }
  A.equal(g.s.expeditions.length, 0);
});

test('Command rechecks troop availability after an earlier valid preview becomes stale', () => {
  const g = clean(); own(g, 1); g.s.sectors[0].units = {pikeman: 2};
  const order = {from: 0, to: 1, units: {pikeman: 2}};
  A.ok(g.inspectExpedition({...order, kind: 'redeploy'}).ok);
  cmd(g, 'redeploy', order);
  rejectUnchanged(g, 'redeploy', order); A.deepEqual(roster(g), {pikeman: 2}); audit(g);
});

test('Returned bribe cargo waits visibly for warehouse space and completes after capacity is released', () => {
  const g = clean(); g.s.sectors[0].units = {hawker: 1}; grant(g, {coin: 20});
  const id = cmd(g, 'expedition', {from: 0, to: 1, kind: 'bribe'}).id;
  A.equal(expedition(g, id).cargo.coin, 9);
  g.advance(2); cmd(g, 'retreat', {id});
  const h = g.warehouses(0, 0)[0]; h.capacity = sum(h.stock);
  g.advance(8);
  A.ok(expedition(g, id)); A.deepEqual(g.pos(expedition(g, id)), g.s.sectors[0].hub);
  const before = g.serialize(), status = g.expeditionStatus(id);
  A.equal(status.label, '귀환 물품 입고 대기'); A.equal(status.blocked, true);
  A.equal(status.etaSeconds, null); A.equal(g.serialize(), before);
  A.equal(expedition(g, id).cargo.coin, 9); audit(g);
  h.capacity += 9;
  until(g, () => !expedition(g, id), 2);
  A.equal(g.stock(0).coin, 20); A.equal(g.s.sectors[0].units.hawker, 1); audit(g);
});

const out = {suite: 'v27 formation, physical redeployment and live defense regressions', count: results.length,
  passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length, results};
fs.mkdirSync(path.join(__dirname, '../reports'), {recursive: true});
fs.writeFileSync(path.join(__dirname, '../reports/v27_engine_tests.json'), JSON.stringify(out, null, 2));
console.log({count: out.count, passed: out.passed, failed: out.failed});
process.exitCode = out.failed ? 1 : 0;
