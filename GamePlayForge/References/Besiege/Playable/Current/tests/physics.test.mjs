import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, getMissionLayout } from '../dist/physics.js';
import { makePreset } from '../dist/parts.js';
import { Vec3 } from '../dist/vendor/cannon-es.js';

// Run the browser's real ES modules and cannon-es solver without a DOM. These
// checks exercise physical outcomes; no physics or collision mocks are used.
function run(simulation, seconds, input = {}) {
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i++) simulation.step(1 / 120, input);
}

function withSimulation(options, callback) {
  const sim = new Simulation({ parts: makePreset('rover'), ...options });
  try { return callback(sim); } finally { sim.dispose(); }
}

test('idle rover and dynamic targets settle without self-destruction', () => {
  for (const mission of ['outpost', 'gate', 'sandbox']) {
    withSimulation({ mission }, (sim) => {
      run(sim, 4);
      assert.equal(sim.brokenCount, 0, `${mission}: no unloaded joint breaks`);
      assert.equal(sim.destroyedCount, 0, `${mission}: targets must not collapse at spawn`);
      assert.equal(sim.won, false, `${mission}: no free victory`);
      assert.ok(sim.speed < 0.02, `${mission}: rest speed ${sim.speed}`);
      assert.ok(sim.corePosition.y > 0.60 && sim.corePosition.y < 0.70);
      const expected = mission === 'outpost' ? 9 : mission === 'gate' ? 10 : 0;
      assert.equal(sim.targetCount, expected);
      assert.equal(getMissionLayout(mission).targets.length, expected);
      assert.ok(sim.targets.every((target) => target.body.mass > 0));
    });
  }
});

test('physical wheel motors drive forward -Z and backward +Z', () => {
  for (const forward of [1, -1]) {
    withSimulation({ mission: 'sandbox' }, (sim) => {
      run(sim, 0.6);
      run(sim, 1.6, { forward });
      assert.ok(sim.corePosition.z * forward < -7, `forward=${forward}: z=${sim.corePosition.z}`);
      assert.ok(Math.abs(sim.corePosition.x) < 0.5, 'straight driving should remain approximately straight');
      assert.ok(sim.speed > 3 && sim.speed < 9);
      assert.equal(sim.brokenCount, 0);
      const wheel = [...sim.bodies.values()].find((body) => body.userData.type === 'wheel');
      assert.ok(wheel.angularVelocity.length() > 5, 'wheels must actually rotate');
    });
  }
});

test('A/+turn rotates left and Q/+turret aims left independently of chassis', () => {
  withSimulation({ mission: 'sandbox' }, (sim) => {
    run(sim, 0.6);
    run(sim, 0.35, { turn: 1 });
    const core = [...sim.bodies.values()].find((body) => body.userData.type === 'core');
    const heading = core.vectorToWorldFrame(new Vec3(0, 0, -1));
    assert.ok(heading.x < -0.08, `left turn heading x=${heading.x}`);
    assert.equal(sim.brokenCount, 0);
  });
  withSimulation({ mission: 'sandbox' }, (sim) => {
    run(sim, 0.6);
    run(sim, 0.4, { turret: 1 });
    run(sim, 0.1);
    const cannon = [...sim.bodies.values()].find((body) => body.userData.type === 'cannon');
    const core = [...sim.bodies.values()].find((body) => body.userData.type === 'core');
    assert.ok(cannon.vectorToWorldFrame(new Vec3(0, 0, -1)).x < -0.3);
    assert.ok(Math.abs(core.vectorToWorldFrame(new Vec3(0, 0, -1)).x) < 0.05);
  });
});

test('three aimed cannon shots can complete the whole outpost', () => {
  const events = [];
  withSimulation({ onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.6);
    assert.equal(sim.fire(), true);
    assert.equal(sim.fire(), false, 'cooldown prevents an immediate duplicate shot');
    run(sim, 2);
    assert.equal(sim.destroyedCount, 3, 'initial horizontal shot should destroy the centre tower');
    run(sim, 0.26, { turret: 1 });
    run(sim, 0.15);
    assert.equal(sim.fire(), true);
    run(sim, 2);
    assert.equal(sim.destroyedCount, 6, 'left tower');
    run(sim, 0.52, { turret: -1 });
    run(sim, 0.15);
    assert.equal(sim.fire(), true);
    run(sim, 2);
    assert.equal(sim.destroyedCount, 9);
    assert.equal(sim.shots, 3);
    assert.equal(sim.brokenCount, 0, 'normal cannon recoil must not tear the preset apart');
    assert.equal(sim.won, true);
    assert.equal(events.filter((event) => event.type === 'win').length, 1);
    assert.ok(events.some((event) => event.type === 'hit' && event.source === 'collision'),
      'damaged upper stones should physically fall and take collision damage');
  });
});

test('holding fire emits one shot per press edge, not one shot per frame', () => {
  withSimulation({ mission: 'sandbox' }, (sim) => {
    run(sim, 0.6);
    run(sim, 2, { fire: true });
    assert.equal(sim.shots, 1);
    run(sim, 0.1, { fire: false });
    run(sim, 0.1, { fire: true });
    assert.equal(sim.shots, 2);
    assert.equal(sim.won, false);
  });
});

test('destroying gate supports wakes the mortared lintel and allows victory', () => {
  withSimulation({ mission: 'gate' }, (sim) => {
    run(sim, 0.6);
    for (let shot = 0; shot < 3; shot++) {
      assert.equal(sim.fire(), true);
      run(sim, 2.5);
    }
    assert.equal(sim.destroyedCount, 10);
    assert.equal(sim.won, true);
    assert.equal(sim.brokenCount, 0);
  });
});

test('a large external impulse really detaches a wheel constraint', () => {
  const events = [];
  withSimulation({ mission: 'sandbox', onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 1);
    const wheel = [...sim.bodies.values()].find((body) => body.userData.type === 'wheel');
    const countBefore = sim.world.constraints.length;
    wheel.applyImpulse(new Vec3(0, 120, 0));
    run(sim, 0.4);
    assert.ok(sim.brokenCount >= 1);
    assert.ok(sim.world.constraints.length < countBefore);
    assert.ok(sim.connections.some((edge) => edge.kind === 'wheel' && edge.broken));
    assert.ok(events.some((event) => event.type === 'break'));
    assert.ok(sim.bodies.has(wheel.userData.id), 'detached parts remain real simulated bodies');
  });
});

test('simulation leaves the editable blueprint intact and reset disposes the old world', () => {
  const parts = makePreset('rover');
  const snapshot = JSON.stringify(parts);
  const sim = new Simulation({ parts, mission: 'sandbox' });
  run(sim, 1, { forward: 1 });
  assert.equal(JSON.stringify(parts), snapshot);
  sim.dispose();
  assert.equal(sim.world.bodies.length, 0);
  assert.equal(sim.world.constraints.length, 0);
  assert.equal(sim.bodies.size, 0);
  assert.equal(sim.fire(), false);
  const reset = new Simulation({ parts, mission: 'sandbox' });
  try { assert.ok(Math.abs(reset.corePosition.z) < 0.001); } finally { reset.dispose(); }
});
