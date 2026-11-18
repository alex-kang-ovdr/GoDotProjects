'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const G = require('../src/gameplay.js');
const D = require('../src/gameplay-data.js');
const results = [];
const foot = { alive: true, inVehicle: false, isDriver: false, transitioning: false };
const driver = { alive: true, inVehicle: true, isDriver: true, transitioning: false };
const approx = (a, b, e = 1e-8) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b}`);
function test(name, fn) {
  try { fn(); results.push({ name, pass: true }); }
  catch (error) { results.push({ name, pass: false, error: error.message }); }
}
const weapon = id => ({ id, ...D.weapons[id] });

test('All 5 weapon IDs match v3 magazine and save capacities', () => {
  assert.deepEqual(Object.keys(D.weapons), ['pistol', 'smg', 'rifle', 'shotgun', 'marksman']);
  assert.deepEqual(Object.values(D.weapons).map(w => w.cap), [12, 30, 30, 6, 8]);
});
test('Every numeric gameplay key has explicit proposed-value provenance', () => {
  function visit(obj, prefix) {
    for (const [key, value] of Object.entries(obj)) {
      const p = prefix + '.' + key;
      if (typeof value === 'number') {
        assert.equal(D.provenance[p].classification, 'PROPOSED_TUNING');
        assert.equal(D.provenance[p].originalMeasured, false);
      } else if (value && typeof value === 'object') visit(value, p);
    }
  }
  for (const key of ['weapons', 'recovery', 'wheel', 'ability']) visit(D[key], key);
});
test('Applying authoring data preserves labels, reserves, recoil and input mode', () => {
  const before = { id: 'rifle', name: 'PATROL AR', ko: '돌격소총', cap: 30, reserve: 210, damage: 24, rpm: 560, reload: 2.2, auto: true, kick: .014, spread: .009, range: 140 };
  const rows = [ { ...before } ];
  assert.equal(G.applyWeaponData(rows), rows);
  for (const k of ['id', 'name', 'ko', 'reserve', 'auto', 'kick', 'spread', 'cap']) assert.equal(rows[0][k], before[k]);
  assert.equal(rows[0].rpm, 650); assert.equal(rows[0].reload, 2.3);
});
test('Unknown weapon definitions are not rewritten', () => {
  const item = { id: 'custom_weapon', damage: 17, cap: 5 };
  const before = JSON.stringify(item); G.applyWeaponData([item]); assert.equal(JSON.stringify(item), before);
});
test('Damage stays full before and at falloff start', () => {
  const w = weapon('rifle'); assert.equal(G.damageAtDistance(w, 0), 24); assert.equal(G.damageAtDistance(w, 45), 24);
});
test('Damage interpolates between start and end and clamps afterward', () => {
  const w = weapon('rifle'); approx(G.damageAtDistance(w, 82.5), 18.6);
  approx(G.damageAtDistance(w, 120), 13.2); approx(G.damageAtDistance(w, 900), 13.2);
});
test('Head and ability multiplier each apply exactly once', () => {
  approx(G.damageAtDistance(weapon('rifle'), 10, true, 1.5), 86.4);
});
test('Shotgun deals 9 per pellet and 72 maximum body damage per shell', () => {
  const w = weapon('shotgun'); assert.equal(G.damageAtDistance(w, 2), 9);
  assert.equal(Array.from({ length: w.pellets }, () => G.damageAtDistance(w, 2)).reduce((a, b) => a + b, 0), 72);
});
test('Invalid distance and outgoing multiplier cannot heal or generate NaN damage', () => {
  for (const n of [-1, NaN, Infinity]) assert.throws(() => G.damageAtDistance(weapon('pistol'), n));
  assert.throws(() => G.damageAtDistance(weapon('pistol'), 1, false, -1));
});
test('Recovery waits for damage delay and never restores armor', () => {
  const p = { hp: 20, armor: 0 }; assert.equal(G.updateRecovery(p, 1, 7), 0);
  assert.equal(G.updateRecovery(p, 1, 8), 0); assert.equal(G.updateRecovery(p, 1, 9), 4);
  assert.deepEqual(p, { hp: 24, armor: 0 });
});
test('Recovery crossing delay heals only eligible fraction of tick', () => {
  const p = { hp: 20, armor: 3 }; approx(G.updateRecovery(p, .1, 8.05), .2); approx(p.hp, 20.2);
});
test('Recovery caps at 50 without lowering healthy players', () => {
  const p = { hp: 49, armor: 5 }; assert.equal(G.updateRecovery(p, 1, 20), 1); assert.equal(p.hp, 50);
  const healthy = { hp: 80, armor: 5 }; G.updateRecovery(healthy, 10, 100); assert.equal(healthy.hp, 80);
});
test('Recovery cannot revive dead actors or advance on pause', () => {
  const dead = { hp: 0, armor: 0 }; assert.equal(G.updateRecovery(dead, 10, 20), 0);
  const alive = { hp: 20, armor: 10 }; assert.equal(G.updateRecovery(alive, 0, 20), 0); assert.equal(alive.hp, 20);
});
test('Invalid recovery inputs fail before health mutation', () => {
  const p = { hp: 20, armor: 0 }; assert.throws(() => G.updateRecovery(p, NaN, 20)); assert.equal(p.hp, 20);
});
test('Focus activates on foot and enables qualitative slowdown only while active', () => {
  const a = new G.Ability('focus'); assert.equal(a.worldScale, 1); assert.equal(a.activate(foot).ok, true);
  assert.equal(a.worldScale, .35); assert.equal(a.actionRate, 2); assert.equal(a.outgoingScale, 1);
});
test('Driver ability requires a live driver, not a passenger or pedestrian', () => {
  const a = new G.Ability('driving'); assert.equal(a.activate(foot).reason, 'requires_driver');
  assert.equal(a.activate({ ...driver, isDriver: false }).ok, false);
  assert.equal(a.activate(driver).ok, true); assert.equal(a.steeringAssist, 1.35);
});
test('On-foot abilities reject vehicle and transition states', () => {
  for (const role of ['focus', 'assault']) {
    const a = new G.Ability(role); assert.equal(a.activate(driver).ok, false);
    assert.equal(a.activate({ ...foot, transitioning: true }).reason, 'transition');
  }
});
test('Assault changes damage factors without time slowdown', () => {
  const a = new G.Ability('assault'); a.activate(foot);
  assert.equal(a.worldScale, 1); assert.equal(a.outgoingScale, 1.5); assert.equal(a.incomingScale, .65);
});
test('Energy drains in active-real time even when world advances slowly', () => {
  const a = new G.Ability('focus'); a.activate(foot); let worldTime = 0;
  for (let i = 0; i < 240; i++) { worldTime += (1 / 60) * a.worldScale; a.update(1 / 60, foot); }
  approx(a.energy, 50); approx(worldTime, 1.4);
});
test('Wheel slowdown does not multiply energy lifetime', () => {
  const a = new G.Ability('focus'); a.activate(foot); let worldTime = 0;
  for (let i = 0; i < 240; i++) { worldTime += (1 / 60) * Math.min(a.worldScale, D.wheel.worldScale); a.update(1 / 60, foot); }
  approx(a.energy, 50); approx(worldTime, .6);
});
test('Eight active-real seconds deplete energy and stop the effect', () => {
  const a = new G.Ability('focus'); a.activate(foot); a.update(8, foot);
  assert.equal(a.energy, 0); assert.equal(a.active, false); assert.equal(a.worldScale, 1); assert.equal(a.cooldownRemaining, 3);
});
test('Energy regenerates only after cooldown, then caps at maximum', () => {
  const a = new G.Ability('assault'); a.activate(foot); a.update(4, foot); a.stop();
  a.update(2, foot); assert.equal(a.energy, 50); a.update(2, foot); assert.equal(a.energy, 55);
  a.update(100, foot); assert.equal(a.energy, 100);
});
test('Activation minimum and cooldown are enforced', () => {
  const a = new G.Ability(); a.energy = 19.9; assert.equal(a.activate(foot).reason, 'energy');
  a.energy = 20; assert.equal(a.activate(foot).ok, true); a.stop(); assert.equal(a.activate(foot).reason, 'cooldown');
});
test('Zero active delta cannot drain energy or cool down a paused ability', () => {
  const a = new G.Ability(); a.activate(foot); a.update(0, foot); assert.equal(a.energy, 100);
  a.stop(); a.update(0, foot); assert.equal(a.cooldownRemaining, 3);
});
test('Death immediately cancels ability and does not refill dead actor', () => {
  const a = new G.Ability(); a.activate(foot); a.update(2, foot); a.update(20, { ...foot, alive: false });
  assert.equal(a.active, false); assert.equal(a.energy, 75); assert.equal(a.lastStopReason, 'dead');
});
test('Getting into vehicle, leaving driver seat, and transitions cancel active effects', () => {
  const a = new G.Ability(); a.activate(foot); a.update(0, driver); assert.equal(a.active, false);
  const b = new G.Ability('driving'); b.activate(driver); b.update(0, foot); assert.equal(b.active, false);
  const c = new G.Ability('assault'); c.activate(foot); c.update(0, { ...foot, transitioning: true }); assert.equal(c.active, false);
});
test('Role selection is not a free energy refill or cooldown reset', () => {
  const a = new G.Ability(); a.activate(foot); a.update(4, foot); a.setRole('driving');
  assert.equal(a.energy, 50); assert.equal(a.cooldownRemaining, 3); assert.equal(a.active, false);
  a.setRole('assault'); assert.equal(a.cooldownRemaining, 3); assert.equal(a.energy, 50);
});
test('Role aliases are normalized and invalid IDs are rejected', () => {
  assert.equal(new G.Ability('shooter').role, 'focus'); assert.equal(new G.Ability('driver').role, 'driving');
  assert.equal(new G.Ability('breacher').role, 'assault'); assert.throws(() => new G.Ability('magic'));
});
test('Save round-trip preserves energy and prevents automatic activation on load', () => {
  const a = new G.Ability('assault'); a.activate(foot); a.update(2, foot);
  const b = new G.Ability(); b.load(JSON.parse(JSON.stringify(a.serialize())));
  assert.equal(b.role, 'assault'); assert.equal(b.energy, 75); assert.equal(b.active, false); assert.equal(b.cooldownRemaining, 3);
});
test('Malformed ability snapshots are rejected atomically', () => {
  const a = new G.Ability('driving'); a.energy = 55; const before = a.serialize();
  for (const patch of [{ version: 2 }, { role: 'unknown' }, { energy: Infinity }, { energy: NaN }, { energy: -1 }, { energy: 101 }, { cooldownRemaining: 4 }, { cooldownRemaining: -1 }, { active: 1 }]) {
    assert.throws(() => a.load({ ...before, ...patch })); assert.deepEqual(a.serialize(), before);
  }
});
test('Large and partitioned real-time updates have equivalent drain/cooldown/regen', () => {
  const a = new G.Ability(), b = new G.Ability(); a.activate(foot); b.activate(foot);
  a.update(12, foot); for (let i = 0; i < 720; i++) b.update(1 / 60, foot);
  approx(a.energy, 5); approx(a.energy, b.energy); approx(a.cooldownRemaining, b.cooldownRemaining); assert.equal(a.active, b.active);
});

const report = {
  scope: 'Data-driven combat and special ability pure-rule tests. Actual geometry, animation, live input, and rendering are browser integration responsibilities.',
  generatedAt: new Date().toISOString(),
  dataRevision: D.revision,
  tests: results.length,
  passed: results.filter(r => r.pass).length,
  failed: results.filter(r => !r.pass).length,
  results
};
for (const result of results) console.log((result.pass ? 'PASS ' : 'FAIL ') + result.name + (result.error ? ': ' + result.error : ''));
console.log(JSON.stringify({ tests: report.tests, passed: report.passed, failed: report.failed }));
if (process.argv.includes('--report')) {
  const destination = path.join(__dirname, '..', 'reports', 'gameplay_rules_report.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
}
process.exitCode = report.failed ? 1 : 0;
