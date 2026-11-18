'use strict';
/* Actual main.js combat integration in the shared Node VM harness.
 * Scenery/actors and the random spread sample are controlled fixtures.
 * Shooting, muzzle pose, ray intersection, damage, input handlers, cooldowns,
 * recovery and ability rules are the actual shipped sources.
 * DOM/layout, drawing/WebGL, audio, RAF and storage remain harness stubs.
 * This is not a browser, visual, physical-device or native-input test.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRuntime, ROOT } = require('./runtime_harness.cjs');
const runtime = createRuntime(), ev = runtime.evaluate, results = [];

function test(name, fn) {
  try {
    const detail = fn();
    if (detail && Object.hasOwn(detail, 'ok')) assert.ok(detail.ok, JSON.stringify(detail));
    results.push({ name, pass: true, detail });
    console.log('PASS ' + name);
  } catch (error) {
    results.push({ name, pass: false, error: error.message });
    console.log('FAIL ' + name + ': ' + error.message);
  }
}
const scenario = (name, fn) => test(name, () => ev(fn));

ev(() => {
  globalThis.COMBAT_FIX = {
    reset(role = 'focus') {
      V4FIX.reset('free', 'quiet', role);
      const g = HARBOR;
      g.world.boxes = []; g.cars = []; g.npcs = [];
      g.cheats.god = false; g.cheats.ammo = false; g.cheats.noPolice = true;
      g.touch = false; g.player.pos = [0, 0, 0]; g.player.yaw = 0;
      g.cam.yaw = 0; g.cam.pitch = 0; g.cam.pos = [0, 1.2, 3];
      g.player.pitch = 0; g.player.lookYaw = 0; g.player.aim = true;
      g.input.aim = true; HarborMotion.reset(g.player);
      return g;
    },
    target(weapon = 2, distance = 3, aimHeight = 1.2, role = 'focus') {
      const g = this.reset(role);
      g.player.weapon = weapon; g.cam.pos = [0, aimHeight, 3];
      const n = g.spawnNPC('guard', [0, 0, -distance]);
      n.pos = [0, 0, -distance]; n.hp = n.maxHp = 300; n.armor = 0;
      n.shotCD = n.idle = 999;
      return n;
    },
    fire() {
      const priorRandom = Math.random;
      Math.random = () => .5; // Center sample, without replacing trace or damage.
      try { return HARBOR.shoot(); } finally { Math.random = priorRandom; }
    }
  };
});

scenario('Actual held rifle preserves 650 RPM across render tick partitions', () => {
  const samples = [];
  for (const hz of [30, 60, 120]) {
    const g = COMBAT_FIX.reset(); g.cheats.ammo = true; g.input.fire = true;
    const shotTimes = [];
    for (let i = 0; i < 12 * hz; i++) {
      const before = g.shotCount;
      g.advanceReal(1 / hz);
      if (g.shotCount !== before) shotTimes.push(g.lastShot);
    }
    const intervals = shotTimes.slice(1).map((time, i) => Math.round((time - shotTimes[i]) * 60));
    samples.push({ renderHz: hz, gameSeconds: g.time, shots: g.shotCount,
      cadenceInSimulationTicks: [...new Set(intervals)].sort() });
  }
  return { ok: samples.every(s => s.shots === 130 && Math.abs(s.gameSeconds - 12) < 1e-8 &&
    s.cadenceInSimulationTicks.includes(5) && s.cadenceInSimulationTicks.includes(6)),
    authoredRPM: GAME_DATA.weapons[2].rpm, expectedShotsPerTwelveSeconds: 130, samples };
});

scenario('Focus preserves enhanced fire-rate debt instead of rounding down to 1200 RPM', () => {
  const g = COMBAT_FIX.reset('focus'); g.cheats.ammo = true;
  const enabled = g.toggleAbility(); g.input.fire = true;
  for (let i = 0; i < 120; i++) g.step(1 / 60);
  const expected = 650 / 60 * 2 * 2;
  return { ok: enabled && g.ability.active && Math.abs(g.shotCount - expected) <= 1,
    gameSeconds: g.time, actionRate: g.ability.actionRate, expectedContinuousShots: expected,
    actualShots: g.shotCount, energy: g.ability.energy,
    tolerance: 'At most one shot from discrete initial/final frame boundaries' };
});

scenario('A close shotgun shot applies exactly eight nine-damage body pellets', () => {
  const n = COMBAT_FIX.target(3), g = HARBOR, beforeAmmo = g.mags[3].ammo;
  const fired = COMBAT_FIX.fire();
  return { ok: fired && 300 - n.hp === 72 && g.stats.hits === 8 && g.traces.length === 8 &&
    g.shotCount === 1 && g.mags[3].ammo === beforeAmmo - 1,
    damagePerPellet: GAME_DATA.weapons[3].damage, pellets: g.traces.length,
    totalDamage: 300 - n.hp, shellsSpent: beforeAmmo - g.mags[3].ammo, shots: g.shotCount };
});

scenario('Actual hit distance and head intersection determine pistol damage', () => {
  const samples = [];
  for (const config of [{ distance: 8, height: 1.2, head: false }, { distance: 40, height: 1.73, head: true }]) {
    const n = COMBAT_FIX.target(0, config.distance, config.height), g = HARBOR;
    const muzzle = g.models.muzzle(g.player), fired = COMBAT_FIX.fire(), end = g.traces[0].b;
    const distance = Math.hypot(...end.map((value, i) => value - muzzle[i]));
    const factor = 1 - .5 * Math.min(1, Math.max(0, (distance - 15) / 35));
    const expected = 28 * factor * (config.head ? 2.4 : 1);
    samples.push({ fired, head: config.head, distance, expected, actual: 300 - n.hp, hits: g.stats.hits });
  }
  return { ok: samples.every(s => s.fired && s.hits === 1 && Math.abs(s.actual - s.expected) < 1e-7),
    expectedFormula: '28 × linear distance factor (15–50 m, minimum 0.5) × head multiplier 2.4', samples };
});

scenario('A clear camera target cannot shoot through an obstructed muzzle', () => {
  const n = COMBAT_FIX.target(2), g = HARBOR;
  const base = [0, 1.36, 0], muzzle = g.models.muzzle(g.player);
  const middle = base.map((value, i) => (value + muzzle[i]) / 2);
  g.world.boxes.push({ min: middle.map(value => value - .045), max: middle.map(value => value + .045) });
  const cameraHit = g.trace(g.cam.pos, g.viewDir(), GAME_DATA.weapons[2].range, true);
  const fired = COMBAT_FIX.fire(), end = g.traces[0].b;
  return { ok: cameraHit.type === 'npc' && fired && n.hp === 300 && g.stats.hits === 0 &&
    Math.hypot(...end.map((value, i) => value - muzzle[i])) < 1,
    cameraSeesTarget: cameraHit.type === 'npc', actualTargetDamage: 300 - n.hp,
    muzzle: muzzle.slice(), traceEndsAt: end.slice() };
});

scenario('Actual hurt resets recovery delay even for armor-only damage and caps health at 50', () => {
  const g = COMBAT_FIX.reset(); g.player.armor = 13;
  g.hurt(80, false); // Real health damage, with armor intentionally bypassed.
  const injured = g.player.hp; V4FIX.tick(7.5); g.hurt(4, true);
  const restart = g.lastDamage; V4FIX.tick(8); const atDelay = g.player.hp;
  V4FIX.tick(1); const oneSecondRecovery = g.player.hp;
  V4FIX.tick(12);
  return { ok: injured === 20 && Math.abs(restart - 7.5) < 1e-8 && Math.abs(atDelay - 20) < 1e-7 &&
    Math.abs(oneSecondRecovery - 24) < 1e-7 && g.player.hp === 50 && g.player.armor === 9,
    afterDamage: injured, timerRestartAt: restart, atEightSeconds: atDelay,
    atNineSeconds: oneSecondRecovery, finalHealth: g.player.hp, finalArmor: g.player.armor };
});

scenario('Lethal actual damage stops ability and never revives during subsequent time advances', () => {
  const g = COMBAT_FIX.reset('assault'); g.toggleAbility();
  g.player.hp = 10; g.player.armor = 0; g.hurt(100);
  const deathTime = g.time; V4FIX.tick(20);
  return { ok: g.player.hp === 0 && !g.running && !g.ability.active && g.time === deathTime,
    health: g.player.hp, running: g.running, abilityActive: g.ability.active,
    stoppedGameSeconds: deathTime, afterAdvanceGameSeconds: g.time };
});

scenario('Assault outgoing modifier reaches the actual rifle hit exactly once', () => {
  const n = COMBAT_FIX.target(2, 3, 1.2, 'assault'), g = HARBOR;
  const enabled = g.toggleAbility(), fired = COMBAT_FIX.fire();
  return { ok: enabled && fired && g.ability.outgoingScale === 1.5 && 300 - n.hp === 36,
    baseDamage: 24, outgoingScale: g.ability.outgoingScale, appliedDamage: 300 - n.hp };
});

scenario('Assault incoming modifier applies before armor absorption in actual hurt', () => {
  const g = COMBAT_FIX.reset('assault'); g.toggleAbility();
  g.player.armor = 10; g.hurt(40, true);
  const ballistic = { hp: g.player.hp, armor: g.player.armor };
  g.hurt(20, false); // The runtime intentionally exempts direct environmental damage.
  return { ok: ballistic.hp === 84 && ballistic.armor === 0 && g.player.hp === 64,
    ballisticRawDamage: 40, incomingScale: g.ability.incomingScale,
    afterArmorAbsorption: ballistic, afterDirectEnvironmentalDamage: g.player.hp };
});

test('Synthetic desktop wheel selection clears held and buffered fire before returning to play', () => {
  ev('COMBAT_FIX.reset();undefined');
  const canvas = runtime.document.getElementById('game');
  canvas.dispatch('mousedown', { button: 0 });
  runtime.key('Tab');
  const blocked = canvas.dispatch('mousedown', { button: 0 });
  runtime.press('Digit2'); runtime.key('Tab', 'keyup');
  const after = ev(() => {
    V4FIX.tick(.6);
    return { shots: HARBOR.shotCount, weapon: HARBOR.player.weapon,
      fire: HARBOR.input.fire, buffered: HARBOR.input.firePressed, wheelOpen: HARBOR.wheel.open };
  });
  canvas.dispatch('mousedown', { button: 0 }); ev('V4FIX.tick(1/60)');
  runtime.document.dispatch('mouseup', { button: 0 });
  const resumedShots = ev('HARBOR.shotCount');
  return { ok: blocked.defaultPrevented && blocked.stopped && after.shots === 0 && after.weapon === 1 &&
    !after.fire && !after.buffered && !after.wheelOpen && resumedShots === 1,
    afterSelection: after, freshPressShots: resumedShots,
    inputScope: 'Synthetic events through actual listeners; not native browser input' };
});

test('Synthetic touch wheel confirm drops fire pressed during selection and requires a new touch', () => {
  ev('COMBAT_FIX.reset();HARBOR.touch=true');
  const wheel = runtime.document.querySelector('[data-action="weapon"]');
  const fire = runtime.document.querySelector('[data-action="fire"]');
  wheel.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch' });
  fire.dispatch('pointerdown', { pointerId: 2, pointerType: 'touch' });
  const during = ev('V4FIX.tick(.5)');
  wheel.dispatch('pointerdown', { pointerId: 3, pointerType: 'touch' });
  const after = ev(() => { V4FIX.tick(.5); return { shots: HARBOR.shotCount,
    fire: HARBOR.input.fire, buffered: HARBOR.input.firePressed, wheelOpen: HARBOR.wheel.open }; });
  fire.dispatch('pointerdown', { pointerId: 4, pointerType: 'touch' }); ev('V4FIX.tick(1/60)');
  fire.dispatch('pointercancel', { pointerId: 4, pointerType: 'touch' }); ev('V4FIX.tick(.5)');
  const final = ev('({shots:HARBOR.shotCount,fire:HARBOR.input.fire})');
  return { ok: during.wheel.open && after.shots === 0 && !after.fire && !after.buffered &&
    !after.wheelOpen && final.shots === 1 && !final.fire,
    whileSelecting: { wheelOpen: during.wheel.open, ammo: during.ammo }, afterConfirm: after,
    afterFreshTouchAndCancel: final, inputScope: 'Synthetic pointer handlers; not physical touch' };
});

scenario('Long idle clears fire-rate debt and cannot produce a catch-up burst', () => {
  const g = COMBAT_FIX.reset(); g.input.fire = true;
  V4FIX.tick(.2); g.input.fire = false; V4FIX.tick(3);
  const idleCooldown = g.fireCooldown, before = g.shotCount;
  g.input.fire = true; V4FIX.tick(1 / 60);
  const firstShots = g.shotCount - before, immediateSecond = g.shoot();
  V4FIX.tick(2 / 60);
  return { ok: idleCooldown === 0 && firstShots === 1 && !immediateSecond && g.shotCount - before === 1,
    idleCooldown, firstShots, immediateSecondAccepted: immediateSecond,
    shotsInFirstThreeFrames: g.shotCount - before };
});

const report = {
  suite: 'v4 actual-source combat Node VM integration',
  execution: 'Actual main.js shoot/hurt/step and real v4 adapters, muzzle pose, ray tests and synthetic input handlers',
  fixtures: ['Empty scenery and controlled actors', 'Centered random spread sample for exact hit assertions',
    'Unlimited-ammo development flag only for sustained cadence measurements'],
  stubs: ['DOM and layout', 'drawing/WebGL output', 'audio output', 'RAF scheduling', 'persistent browser storage'],
  notTested: ['Browser startup', 'WebGL rendering', 'Visual animation', 'Pointer lock', 'Physical keyboard/touch', 'Persistent-origin saves'],
  passed: results.filter(result => result.pass).length, total: results.length,
  results, errors: runtime.errors, warnings: runtime.warnings
};
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports/combat-v4-runtime.json'), JSON.stringify(report, null, 2));
console.log('TOTAL ' + report.passed + ' / ' + report.total + ' (Node VM; rendering and DOM are stubs)');
if (report.passed !== report.total || runtime.errors.length) process.exitCode = 1;
