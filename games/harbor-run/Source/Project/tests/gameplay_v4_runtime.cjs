'use strict';
/* State-fixture integration of actual game sources in Node VM.
 * NOT a browser, WebGL, visual, real-input or persistent-storage test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRuntime, ROOT } = require('./runtime_harness.cjs');
const runtime = createRuntime(), results = [], ev = runtime.evaluate;
function test(name, fn) {
  try {
    const detail = fn();
    if (detail && Object.hasOwn(detail, 'ok')) assert.ok(detail.ok, JSON.stringify(detail));
    results.push({ name, pass: true, ...(detail === undefined ? {} : { detail }) });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, pass: false, error: error.message }); console.log('FAIL ' + name + ': ' + error.message);
  }
}
const scenario = (name, fn) => test(name, () => ev(fn));

test('Actual main game initializes with only documented output stubs', () => {
  assert.ok(runtime.scope.HARBOR && runtime.scope.HARBOR_TEST);
  assert.equal(runtime.errors.length, 0);
  return { limitation: runtime.limitation };
});
test('Start-button handler reads selected approach and ability role', () => {
  runtime.select('approachSelect', 'direct'); runtime.select('abilitySelect', 'driving'); runtime.click('startMission');
  return ev(() => ({ ok: HARBOR.contract.approach === 'direct' && HARBOR.ability.role === 'driving' && HARBOR.phase === 'reach',
    approach: HARBOR.contract.approach, role: HARBOR.ability.role, phase: HARBOR.phase }));
});
test('Synthetic Tab/Digit3 handlers select, slow game time and equip on release', () => {
  ev('V4FIX.reset();HARBOR.switchWeapon(0)'); runtime.key('Tab'); runtime.press('Digit3');
  const held = ev('V4FIX.state()'), during = ev('V4FIX.tick(2)'); runtime.key('Tab', 'keyup'); const after = ev('V4FIX.state()');
  const delta = during.time - held.time;
  return { ok: held.wheel.open && held.wheel.selected === 2 && held.player.weapon === 0 && !after.wheel.open &&
      after.player.weapon === 2 && Math.abs(delta - .3) < .04,
    held: held.wheel, equippedBeforeRelease: held.player.weapon, equippedAfterRelease: after.player.weapon,
    gameSecondsOverTwoRealSeconds: delta, inputScope: 'synthetic dispatch, not browser keyboard' };
});
scenario('Wheel masks firing, reload, jump and vehicle interaction', () => {
  V4FIX.reset(); const g = HARBOR, mag = g.mags[g.player.weapon]; mag.ammo--; const before = mag.ammo;
  g.player.jumpBuffer = .12; g.openWeaponWheel(); const fired = g.shoot(); g.reload(); g.jump(); g.interact();
  const result = { ok: fired === false && mag.ammo === before && !mag.reload && !g.player.transition && !g.player.jumpBuffer,
    fired, ammo: mag.ammo, reloading: !!mag.reload, transition: !!g.player.transition, jumpBuffer: g.player.jumpBuffer };
  g.closeWeaponWheel(false); return result;
});
test('Synthetic F handler drains ability in real time while slowing game time', () => {
  ev("V4FIX.reset('free','quiet','focus')"); runtime.press('KeyF'); const s = ev('V4FIX.tick(2)');
  return { ok: s.ability.active && Math.abs(s.ability.energy - 75) < .01 && Math.abs(s.time - .7) < .04,
    energyAfterTwoRealSeconds: s.ability.energy, gameSeconds: s.time, active: s.ability.active };
});
scenario('Actual frame loop accounts for five 200ms frames as one full real second', () => {
  V4FIX.reset(); const g = HARBOR; g.manualTesting = false; g.lastFrame = 0; g.toggleAbility();
  for (const now of [200, 400, 600, 800, 1000]) g.frame(now);
  const result = { ok: g.running && g.ability.active && Math.abs(g.ability.energy - 87.5) < .001 &&
      Math.abs(g.time - .35) < .000001 && Math.abs(g.activeRealTime - 1) < .000001,
    energy: g.ability.energy, gameSeconds: g.time, activeRealSeconds: g.activeRealTime,
    frames: 5, intervalMilliseconds: 200 };
  g.manualTesting = true; return result;
});
scenario('Actual 300ms frame stall pauses without catchup and resume clears accumulator', () => {
  V4FIX.reset(); const g = HARBOR; g.manualTesting = false; g.lastFrame = 0; g.toggleAbility();
  g.acc = .012; const before = { time: g.time, real: g.activeRealTime, energy: g.ability.energy };
  g.frame(300);
  const paused = { running: g.running, active: g.ability.active, time: g.time,
    real: g.activeRealTime, energy: g.ability.energy, acc: g.acc, mode: g.mode };
  // Seed a residual accumulator to verify the actual resume method clears it too.
  g.acc = .012; g.resume(); g.hadLock = false;
  const resumed = { running: g.running, active: g.ability.active, acc: g.acc, mode: g.mode };
  const ok = !paused.running && !paused.active && paused.time === before.time && paused.real === before.real &&
    paused.energy === before.energy && paused.acc === 0 && paused.mode === 'pauseScreen' &&
    resumed.running && !resumed.active && resumed.acc === 0 && resumed.mode === 'play';
  g.manualTesting = true; return { ok, before, paused, resumed };
});
scenario('Pause freezes game time and ability consumption', () => {
  V4FIX.reset(); const g = HARBOR; g.toggleAbility(); V4FIX.tick(.5); g.pause();
  const before = V4FIX.state(); V4FIX.tick(2); const after = V4FIX.state();
  return { ok: before.time === after.time && before.ability.energy === after.ability.energy && !after.running,
    timeBefore: before.time, timeAfter: after.time, energyBefore: before.ability.energy, energyAfter: after.ability.energy };
});
scenario('Wheel plus focus uses slower world scale without slowing energy drain', () => {
  V4FIX.reset(); const g = HARBOR; g.toggleAbility(); g.openWeaponWheel(); const s = V4FIX.tick(2); g.closeWeaponWheel(false);
  return { ok: Math.abs(s.ability.energy - 75) < .01 && Math.abs(s.time - .3) < .04, energy: s.ability.energy, gameSeconds: s.time };
});
scenario('Driving ability requires committed driver context', () => {
  V4FIX.reset('free', 'quiet', 'driving'); const g = HARBOR; g.toggleAbility(); const onFoot = g.ability.active;
  V4FIX.driver('starter'); g.toggleAbility(); const driving = g.ability.active; const s = V4FIX.tick(1);
  return { ok: !onFoot && driving && Math.abs(s.ability.energy - 87.5) < .01 && Math.abs(s.time - .35) < .04,
    onFoot, driving, energy: s.ability.energy, gameSeconds: s.time };
});
scenario('Leaving driver context ends ability and starts cooldown', () => {
  V4FIX.reset('free', 'quiet', 'driving'); V4FIX.driver('starter'); HARBOR.toggleAbility(); V4FIX.exit(); V4FIX.tick(1 / 60);
  return { ok: !HARBOR.ability.active && HARBOR.ability.cooldownRemaining > 0,
    active: HARBOR.ability.active, stopReason: HARBOR.ability.lastStopReason, cooldown: HARBOR.ability.cooldownRemaining };
});
scenario('On-foot ability rejects occupied vehicle and seat transition', () => {
  V4FIX.reset(); V4FIX.driver('starter'); HARBOR.toggleAbility(); const seated = HARBOR.ability.active;
  V4FIX.exit(); HARBOR.player.transition = { type: 'enter' }; HARBOR.toggleAbility(); const transition = HARBOR.ability.active;
  HARBOR.player.transition = null; return { ok: !seated && !transition, seated, transition };
});
scenario('Actual weapon definitions use v4 tuning and compatible magazines', () => {
  const expected = { pistol: 28, smg: 15, rifle: 24, shotgun: 9, marksman: 90 };
  const weapons = GAME_DATA.weapons.map(w => ({ id: w.id, damage: w.damage, cap: w.cap, revision: w.dataRevision }));
  return { ok: weapons.every((w, i) => w.damage === expected[w.id] && w.cap === [12, 30, 30, 6, 8][i] && w.revision === '4.0.0'), weapons };
});
scenario('Actual step recovery waits eight game seconds and preserves armor', () => {
  V4FIX.reset(); const g = HARBOR; g.player.hp = 20; g.player.armor = 13; g.lastDamage = g.time;
  V4FIX.tick(8); const delayed = g.player.hp; V4FIX.tick(1); const healed = g.player.hp;
  return { ok: Math.abs(delayed - 20) < .001 && Math.abs(healed - 24) < .1 && g.player.armor === 13,
    atEightSeconds: delayed, atNineSeconds: healed, armor: g.player.armor };
});
for (const approach of ['quiet', 'direct']) test(approach + ' route supplies its authored objective beacon', () => ev(approach => {
  V4FIX.reset('mission', approach); const c = HARBOR.contract, d = HarborContracts.harbor_recovery, objective = c.objective();
  return { ok: c.approach === approach && JSON.stringify(objective.goal) === JSON.stringify(d.approaches[approach].beacon),
    approach: c.approach, goal: objective.goal, routeCue: objective.routeCue };
}, approach));
test('Seat-transaction input handler captures and restores acquisition checkpoint', () => {
  ev("V4FIX.reset('mission');HARBOR_TEST.position([102.3,0,-120])"); runtime.press('KeyE');
  const acquired = ev('V4FIX.tick(.95)'), saved = ev('HARBOR.checkpoint');
  const restored = ev(() => { HARBOR.fail('state-fixture retry'); HARBOR.hadLock = false; HARBOR.retry(); HARBOR.hadLock = false; return V4FIX.state(); });
  return { ok: acquired.player.carId === 'target' && acquired.contract.acquired && saved.gameplayV4.contract.acquired &&
      saved.player.carId === 'target' && restored.player.carId === 'target' && restored.carCount === 1 && restored.contract.acquired,
    acquiredPhase: acquired.phase, checkpointPhase: saved.phase, restoredPhase: restored.phase, targetCount: restored.carCount };
});
scenario('Pending witness report blocks depot at wanted zero', () => {
  V4FIX.deliverReady(); const g = HARBOR, before = g.ledger.wallet; V4FIX.pending(); const s = V4FIX.tick(.5);
  return { ok: s.wanted === 0 && s.pending === 1 && s.phase === 'escape' && s.contract.hold === 0 && s.wallet === before,
    wanted: s.wanted, pending: s.pending, phase: s.phase, hold: s.contract.hold, walletDelta: s.wallet - before };
});
scenario('Re-wanted resets partial depot hold before any reward', () => {
  V4FIX.deliverReady(); const g = HARBOR, before = g.ledger.wallet; V4FIX.tick(1); const holdBefore = g.contract.hold;
  g.wanted.report('fixture-rewanted', 1, g.player.pos); V4FIX.tick(.1);
  return { ok: holdBefore > .9 && g.phase === 'escape' && g.contract.hold === 0 && g.ledger.wallet === before,
    holdBefore, holdAfter: g.contract.hold, phase: g.phase, walletDelta: g.ledger.wallet - before };
});
scenario('Leaving target preserves acquisition but resets hold and recovery objective', () => {
  V4FIX.deliverReady(); V4FIX.tick(.5); const before = HARBOR.contract.acquiredAt; V4FIX.exit(); const s = V4FIX.tick(.1);
  return { ok: s.phase === 'recover' && s.contract.acquired && s.contract.acquiredAt === before && s.contract.hold === 0,
    phase: s.phase, acquired: s.contract.acquired, hold: s.contract.hold };
});
scenario('Dead player fact preempts completion on the delivery frame', () => {
  V4FIX.deliverReady(); V4FIX.tick(1.2); const g = HARBOR, before = g.ledger.wallet; g.player.hp = 0; V4FIX.tick(.1);
  return { ok: g.contract.phase === 'failed' && g.ledger.wallet === before && !g.running,
    phase: g.phase, contractPhase: g.contract.phase, mode: g.mode, walletDelta: g.ledger.wallet - before };
});
for (const approach of ['quiet', 'direct']) test(approach + ' mission completes with medals and pays 750 once', () => ev(approach => {
  V4FIX.deliverReady(approach); const g = HARBOR, before = g.ledger.wallet; V4FIX.tick(1.35);
  const phase = g.phase, medals = g.contract.medals(), reward = g.ledger.wallet - before;
  g.updateMission(1); g.updateMission(1); g.updateMission(1);
  return { ok: phase === 'complete' && reward === 750 && g.ledger.wallet - before === 750 && medals.filter(m => m.earned).length === 3,
    phase, reward, afterRepeatedUpdates: g.ledger.wallet - before, medals: medals.map(m => ({ id: m.id, earned: m.earned })) };
}, approach));
scenario('v4 capture/restore preserves role route energy and report evidence', () => {
  V4FIX.reset('mission', 'direct', 'driving'); V4FIX.acquire(); HARBOR.toggleAbility(); V4FIX.tick(.5);
  V4FIX.pending('roundtrip-evidence'); const g = HARBOR, saved = g.capture(), oldEpoch = g.reportQueue.epoch;
  g.player.hp = 15; g.ability.energy = 5; g.events = []; g.restore(saved);
  const next = g.capture(), a = saved.gameplayV4, b = next.gameplayV4;
  return { ok: g.player.hp === saved.player.hp && g.player.carId === 'target' && b.approach === 'direct' &&
      b.ability.role === 'driving' && Math.abs(b.ability.energy - a.ability.energy) < 1e-9 && !b.ability.active &&
      b.ability.cooldownRemaining >= 3 && JSON.stringify(b.contract) === JSON.stringify(a.contract) &&
      b.reportQueue.pending.length === 1 && JSON.stringify(b.reportQueue.pending[0].pos) === JSON.stringify(a.reportQueue.pending[0].pos),
    role: b.ability.role, approach: b.approach, energy: b.ability.energy, activeAfterRestore: b.ability.active,
    pending: b.reportQueue.pending.length, oldEpoch, newEpoch: g.reportQueue.epoch };
});
scenario('Legacy v3 snapshot without extension migrates the actual target driver', () => {
  V4FIX.reset('mission'); V4FIX.acquire(); V4FIX.tick(3.1); const g = HARBOR, saved = g.capture();
  delete saved.gameplayV4; saved.build = '3.0.0'; g.restore(saved); const current = g.capture();
  return { ok: g.player.carId === 'target' && g.targetCar().seat.occupant === 'player' && g.contract.acquired &&
      current.gameplayV4?.version === 4 && g.ledger.wallet === saved.wallet,
    phase: g.phase, acquired: g.contract.acquired, extensionVersion: current.gameplayV4?.version, wallet: g.ledger.wallet };
});
scenario('Initial mission capture restores before any movement or objective update', () => {
  V4FIX.reset('mission', 'quiet', 'focus'); const g = HARBOR, saved = g.capture();
  g.player.hp = 30; g.restore(saved); const after = g.capture();
  return { ok: g.phase === 'reach' && g.player.hp === saved.player.hp && !g.contract.acquired &&
      after.gameplayV4.contract.elapsed === 0 && JSON.stringify(after.gameplayV4.contract) === JSON.stringify(saved.gameplayV4.contract),
    phase: g.phase, elapsed: g.contract.elapsed, playerY: g.player.pos[1], priorFactsY: g.contract.lastFacts.playerPos[1] };
});
for (const kind of ['ability', 'contract', 'reportQueue', 'civilianCasualties']) test('Invalid ' + kind + ' extension rejects before mutation', () => ev(kind => {
  V4FIX.reset('mission'); V4FIX.acquire(); const g = HARBOR, before = JSON.stringify(g.capture()), bad = JSON.parse(before);
  if (kind === 'ability') bad.gameplayV4.ability.energy = 999;
  if (kind === 'contract') bad.gameplayV4.contract.hold = 999;
  if (kind === 'reportQueue') bad.gameplayV4.reportQueue.epoch = -1;
  if (kind === 'civilianCasualties') bad.gameplayV4.civilianCasualties = -1;
  let caught = false, message = ''; try { g.restore(bad); } catch (error) { caught = true; message = error.message; }
  return { ok: caught && JSON.stringify(g.capture()) === before, caught, message, unchanged: JSON.stringify(g.capture()) === before };
}, kind));
for (const kind of ['negative_shots', 'fractional_next_id', 'infinite_camera_yaw', 'string_camera_yaw', 'queue_mirror_mismatch'])
  test('Save restore rejects ' + kind + ' atomically', () => ev(kind => {
    V4FIX.reset('mission'); V4FIX.acquire();
    if (kind === 'queue_mirror_mismatch') V4FIX.pending('mirror-check');
    const g = HARBOR, before = JSON.stringify(g.capture()), bad = JSON.parse(before);
    if (kind === 'negative_shots') bad.shotCount = -1;
    if (kind === 'fractional_next_id') bad.nextId = 1.5;
    if (kind === 'infinite_camera_yaw') bad.cam.yaw = Infinity;
    if (kind === 'string_camera_yaw') bad.cam.yaw = '0';
    if (kind === 'queue_mirror_mismatch') bad.events = [];
    let caught = false, message = ''; try { g.restore(bad); } catch (error) { caught = true; message = error.message; }
    return { ok: caught && JSON.stringify(g.capture()) === before, caught, message, unchanged: JSON.stringify(g.capture()) === before };
  }, kind));
scenario('Restoring complete save cannot regrant mission reward', () => {
  V4FIX.deliverReady(); V4FIX.tick(1.35); const g = HARBOR, saved = g.capture(), wallet = g.ledger.wallet;
  g.restore(saved); g.running = true; g.mode = 'play'; g.closeOverlays(); V4FIX.tick(2);
  return { ok: g.ledger.wallet === wallet && g.contract.phase === 'complete', walletBefore: wallet, walletAfter: g.ledger.wallet, phase: g.phase };
});
scenario('Live crime adapter distinguishes heard gunfire from visual identification', () => {
  V4FIX.reset(); const g = HARBOR, n = g.spawnNPC('guard', [-104, 0, 78]); n.yaw = 0; n.alert = false;
  g.crime(1, 'gunfire');
  return { ok: g.reportQueue.pendingCount === 0 && g.wanted.level === 0 && n.suspicious > 0,
    pending: g.reportQueue.pendingCount, wanted: g.wanted.level, suspicious: n.suspicious, heardPosition: n.threatPos };
});
scenario('Live crime captures evidence that survives later loss of sight', () => {
  V4FIX.reset(); const g = HARBOR, n = g.spawnNPC('civilian', [-104, 0, 98]); n.yaw = 0; n.alert = false;
  const witnessed = g.player.pos.slice(); g.crime(1, 'gunfire'); const pending = g.reportQueue.pendingCount;
  HARBOR_TEST.position([-79, 0, 42]); g.time += 1.5; g.acceptReports();
  return { ok: pending === 1 && g.reportQueue.pendingCount === 0 && g.wanted.level === 1 &&
      JSON.stringify(g.wanted.lastKnown) === JSON.stringify(witnessed),
    pendingBefore: pending, pendingAfter: g.reportQueue.pendingCount, wanted: g.wanted.level, lastKnown: g.wanted.lastKnown, witnessed };
});
scenario('Killed pending witness cannot report through the live adapter', () => {
  V4FIX.reset(); const g = HARBOR, id = V4FIX.pending('cancelled-evidence'), n = g.npcs.find(n => n.id === id);
  n.hp = 0; g.time += 2; g.acceptReports();
  return { ok: g.reportQueue.pendingCount === 0 && g.wanted.level === 0, pending: g.reportQueue.pendingCount, wanted: g.wanted.level };
});
scenario('Civilian casualty counter feeds the no-casualties mission medal', () => {
  V4FIX.deliverReady(); const g = HARBOR, n = g.spawnNPC('civilian', [0, 0, 166]); g.damageNPC(n, 1000, false, true);
  g.npcs = []; g.events = []; g.wanted.clear(); V4FIX.tick(1.35);
  const medal = g.contract.medals().find(m => m.id === 'clean_hands');
  return { ok: g.civilianCasualties === 1 && g.contract.metrics.civilianCasualties === 1 && !medal.earned && g.phase === 'complete',
    gameCasualties: g.civilianCasualties, contractCasualties: g.contract.metrics.civilianCasualties, earned: medal.earned };
});
scenario('Inherited camera-forward movement and jump floor support remain functional', () => {
  V4FIX.reset(); const g = HARBOR, p0 = g.player.pos.slice(); g.keys.add('KeyW'); V4FIX.tick(1); g.keys.clear();
  const moved = g.player.pos[2] < p0[2] - 3, floor = g.player.pos[1]; g.jump(); V4FIX.tick(.2); const high = g.player.pos[1];
  V4FIX.tick(1.5);
  return { ok: moved && high > floor + .3 && Math.abs(g.player.pos[1] - floor) < .001,
    moved, baseFloor: floor, jumpHeight: high, landed: g.player.pos[1] };
});
scenario('Actual model and HUD code execute with stub drawing output', () => {
  HARBOR_TEST.render(); return { ok: HARBOR.render.frames > 0, stubRenderedFrames: HARBOR.render.frames, webglTested: false };
});
test('No game initialization or runtime console errors in VM', () => { assert.deepEqual(runtime.errors, []); });

const report = {
  suite: 'v4 actual-source Node VM state-fixture integration',
  execution: 'Actual main.js, gameplay adapter, math, world, collision, motion, model/muzzle, mission and perception code',
  inputs: 'Synthetic dispatch to real input handlers with capture/bubble priority; not browser/native input',
  stubs: ['DOM and layout', 'drawing/WebGL output', 'audio output', 'RAF scheduling', 'persistent storage unavailable'],
  notTested: ['browser startup', 'WebGL rendering', 'visual appearance', 'pointer lock', 'persistent-origin storage', 'physical devices', 'uninterrupted human playthrough'],
  passed: results.filter(r => r.pass).length, total: results.length, results,
  errors: runtime.errors, warnings: runtime.warnings
};
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/gameplay-v4-runtime.json'), JSON.stringify(report, null, 2));
console.log('TOTAL ' + report.passed + ' / ' + report.total + ' (Node VM; no browser/WebGL validation)');
if (report.passed !== report.total) process.exitCode = 1;
