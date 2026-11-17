import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, getMissionLayout, segmentCrossesCheckpoint } from '../dist/physics.js';
import { MISSIONS, makePreset } from '../dist/parts.js';
import { Vec3 } from '../dist/vendor/cannon-es.js';

function run(sim, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 120) && !sim.outcome; i++) sim.step(1 / 120, input);
}

function withSim(options, body) {
  const sim = new Simulation(options);
  try { return body(sim); } finally { sim.dispose(); }
}

function assertFiniteTelemetry(sim) {
  const data = sim.telemetry;
  for (const [key, value] of Object.entries(data)) assert.ok(Number.isFinite(value), `${key} must be finite`);
  assert.ok(data.submerged >= 0 && data.submerged <= 1);
  assert.ok(data.throttle >= -1 && data.throttle <= 1);
}

test('every environment exposes finite initial telemetry and a matching objective', () => {
  for (const mission of MISSIONS) {
    withSim({ parts: makePreset(mission.recommendedPreset), mission: mission.id }, (sim) => {
      const layout = getMissionLayout(mission.id);
      assert.equal(sim.environment.kind, mission.environment);
      assert.equal(sim.ground.position.y, layout.environment.groundY);
      assert.equal(sim.objectiveProgress.kind, mission.objective);
      assert.equal(sim.objectiveProgress.completed, 0);
      assert.equal(sim.objectiveProgress.total, mission.objective === 'route' ? mission.checkpointCount : mission.targetCount);
      assert.equal(sim.checkpointIndex, 0);
      assertFiniteTelemetry(sim);
      assert.equal(sim.telemetry.altitude,
        sim.corePosition.y - (sim.environment.waterLevel ?? sim.environment.groundY));
      for (const part of sim.parts.filter((part) => part.type === 'propeller')) {
        assert.equal(sim.getPropellerPower(part.id), 0);
      }
      assert.equal(sim.outcome, null, 'zero destroy-target count does not auto-complete a route');
    });
  }
});

test('separated intact floats support a stationary boat while the same hull without them sinks', () => {
  withSim({ parts: makePreset('boat'), mission: 'harbor' }, (sim) => {
    run(sim, 5);
    assert.equal(sim.outcome, null);
    assert.ok(sim.corePosition.y > sim.environment.waterLevel + 0.8);
    assert.ok(Math.abs(sim.telemetry.verticalSpeed) < 0.05);
    assert.ok(Math.abs(sim.telemetry.roll) < 1);
    assert.equal(sim.coreHp, 100);
    assert.equal(sim.brokenCount, 0);
  });
  const hull = makePreset('boat').filter((part) => part.type !== 'float');
  const events = [];
  withSim({ parts: hull, mission: 'harbor', onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 5);
    assert.equal(sim.outcome, 'failed');
    assert.ok(sim.failReason.includes('물속'));
    assert.ok(sim.corePosition.y < sim.environment.waterLevel - 0.8);
    assert.equal(sim.telemetry.submerged, 1);
    assert.equal(events.filter((event) => event.type === 'fail').length, 1);
    const time = sim.elapsed;
    run(sim, 1, { forward: 1 });
    assert.equal(sim.elapsed, time);
  });
  withSim({ parts: makePreset('blank'), mission: 'sandbox' }, (sim) => {
    run(sim, 4);
    assert.equal(sim.outcome, null, 'drowning is not active in a land environment');
  });
});

test('a detached intact float still floats, but HP destruction removes its buoyancy', () => {
  const heights = [];
  for (const destroyed of [false, true]) {
    withSim({ parts: makePreset('boat'), mission: 'harbor' }, (sim) => {
      run(sim, 0.7);
      const part = sim.parts.find((item) => item.type === 'float' && item.x === -2 && item.z === -2);
      const body = sim.bodies.get(part.id);
      for (const edge of sim.connections.filter((item) => item.a === part.id || item.b === part.id)) {
        sim._breakConnection(edge, 'test-detachment');
      }
      if (destroyed) sim._damagePart(part.id, 1000, body.position, 'test-destruction');
      run(sim, 1.3);
      assert.equal(sim.partStates.get(part.id).connected, false);
      assert.equal(sim.partStates.get(part.id).dead, destroyed);
      assert.ok(sim.bodies.has(part.id), 'the debris remains a real rigid body');
      heights.push(body.position.y);
    });
  }
  assert.ok(heights[0] > 0.45);
  assert.ok(heights[1] < 0.1);
  assert.ok(heights[0] - heights[1] > 0.8);
});

function engineFixture(rot = 0) {
  return [
    { id: 'core', type: 'core', x: 0, y: 3, z: 0, rot: 0, power: 1, binding: 'all' },
    { id: 'engine', type: 'propeller', x: 0, y: 3, z: 1, rot, power: 1, binding: 'all' },
  ];
}

test('propeller force follows the authored axis and reverse/brake inputs without teleporting', () => {
  for (const [rot, forward, axis, sign] of [[0, 1, 'z', -1], [1, 1, 'x', -1],
    [2, 1, 'z', 1], [0, -1, 'z', 1]]) {
    withSim({ parts: engineFixture(rot), mission: 'sandbox' }, (sim) => {
      run(sim, 0.35, { forward });
      assert.ok(sim.corePosition[axis] * sign > 0.05);
      assert.ok(sim._core.velocity[axis] * sign > 0.5);
      assert.equal(Math.sign(sim.getPropellerPower('engine')), Math.sign(forward));
      assert.ok(sim.corePosition.y < 3.5, 'gravity still acts while the engine pushes');
      sim.step(1 / 120, { forward, brake: true });
      assert.equal(sim.getPropellerPower('engine'), 0);
      assert.ok(sim.speed > 0.5, 'cutting thrust does not overwrite existing momentum');
      assertFiniteTelemetry(sim);
    });
  }
});

test('a separated live propeller immediately loses control and coasts instead of accelerating', () => {
  withSim({ parts: engineFixture(), mission: 'sandbox' }, (sim) => {
    run(sim, 0.35, { forward: 1 });
    const engine = sim.bodies.get('engine');
    const speed = Math.abs(engine.velocity.z);
    assert.ok(sim.getPropellerPower('engine') > 0.5);
    sim._breakConnection(sim.connections[0], 'test-separation');
    assert.equal(sim.getPropellerPower('engine'), 0, 'there is no extra powered frame after detachment');
    run(sim, 0.2, { forward: 1 });
    assert.equal(sim.partStates.get('engine').dead, false);
    assert.equal(sim.partStates.get('engine').connected, false);
    assert.ok(Math.abs(engine.velocity.z) < speed);
  });
});

test('the plane leaves the runway on rigid-body forces and loses lift when its wings are destroyed', () => {
  withSim({ parts: makePreset('plane'), mission: 'skyway' }, (sim) => {
    run(sim, 2.5, { forward: 1 });
    const height = sim.corePosition.y;
    assert.ok(height > 3);
    assert.ok(sim.telemetry.airspeed > 8);
    assert.ok(sim.telemetry.verticalSpeed > 0);
    for (const part of sim.parts.filter((item) => item.type === 'wheel')) {
      assert.ok(sim.bodies.get(part.id).position.y > 1.2, 'all wheels have real ground clearance');
    }
    const wings = sim.parts.filter((part) => part.type === 'wing');
    for (const part of wings) {
      const body = sim.bodies.get(part.id);
      assert.ok(Number.isFinite(body.userData.angleOfAttack));
      sim._damagePart(part.id, 1000, body.position, 'test-wing-loss');
    }
    run(sim, 0.4, { forward: 1 });
    assert.ok(sim.corePosition.y < height - 0.4);
    assert.ok(sim.telemetry.verticalSpeed < -2);
    assert.ok(sim.integrity < 0.75);
  });
});

test('digital pitch/bank inputs turn the actual airframe in the documented directions', () => {
  const measured = {};
  for (const control of ['pitch', 'roll']) {
    measured[control] = [];
    for (const sign of [-1, 1]) {
      withSim({ parts: makePreset('plane'), mission: 'skyway' }, (sim) => {
        run(sim, 2.5, { forward: 1 });
        run(sim, 0.4, { forward: 1, [control]: sign });
        measured[control].push(sim.telemetry[control]);
        assert.equal(sim.brokenCount, 0);
        assertFiniteTelemetry(sim);
      });
    }
  }
  assert.ok(measured.pitch[0] < 0 && measured.pitch[1] > 6);
  assert.ok(measured.roll[0] < -3 && measured.roll[1] > 3);
  withSim({ parts: makePreset('plane'), mission: 'skyway' }, (sim) => {
    run(sim, 2.5, { forward: 1 });
    const before = sim.telemetry;
    run(sim, 0.4, { forward: 1, pitch: 1, roll: 1, assist: false });
    assert.ok(sim.telemetry.pitch > before.pitch + 2, 'manual pitch has sufficient physical authority');
    assert.ok(sim.telemetry.roll > before.roll + 2, 'manual bank works without an upright-angle target');
    assertFiniteTelemetry(sim);
  });
  withSim({ parts: makePreset('boat'), mission: 'harbor' }, (sim) => {
    run(sim, 2, { forward: 1 });
    run(sim, 0.8, { forward: 1, turn: 1 });
    const forward = sim._core.vectorToWorldFrame(new Vec3(0, 0, -1));
    assert.ok(forward.x < -0.08, 'A/+turn steers the bow left');
  });
});

test('checkpoint sweeps enforce the aperture, minimum flight altitude and route ordering', () => {
  const water = getMissionLayout('harbor').checkpoints;
  const air = getMissionLayout('skyway').checkpoints;
  assert.equal(segmentCrossesCheckpoint({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 1.4, z: -24 }, water[0]), true);
  assert.equal(segmentCrossesCheckpoint({ x: 5, y: 1.4, z: -11 }, { x: 5, y: 1.4, z: -13 }, water[0]), false);
  assert.equal(segmentCrossesCheckpoint({ x: 0, y: 2.4, z: -21 }, { x: 0, y: 2.4, z: -23 }, air[0]), false);
  assert.equal(segmentCrossesCheckpoint({ x: 0, y: 2.6, z: -21 }, { x: 0, y: 2.6, z: -23 }, air[0]), true);
  // Isolated geometry fixtures exercise long sweeps. The route-completion
  // tests below use only ordinary step inputs and never these synthetic points.
  withSim({ parts: makePreset('boat'), mission: 'harbor' }, (sim) => {
    sim._advanceCheckpoints({ x: 0, y: 1.4, z: -25 }, { x: 0, y: 1.4, z: -27 });
    assert.equal(sim.checkpointIndex, 0, 'a future gate cannot be skipped to');
    sim._advanceCheckpoints({ x: 0, y: 1.4, z: -11 }, { x: 0, y: 1.4, z: -13 });
    assert.equal(sim.checkpointIndex, 1);
    sim._advanceCheckpoints({ x: 0, y: 1.4, z: -11 }, { x: 0, y: 1.4, z: -13 });
    assert.equal(sim.checkpointIndex, 1, 'the same gate is counted only once');
    sim._advanceCheckpoints({ x: 0, y: 1.4, z: -13 }, { x: 0, y: 1.4, z: -41 });
    assert.equal(sim.checkpointIndex, 3, 'one fast forward sweep may cross successive gates in order');
  });
  withSim({ parts: makePreset('boat'), mission: 'harbor' }, (sim) => {
    sim._advanceCheckpoints({ x: 0, y: 1.4, z: -50 }, { x: 0, y: 1.4, z: 0 });
    assert.equal(sim.checkpointIndex, 1, 'a backwards sweep cannot retrospectively collect earlier crossings');
  });
});

test('a normal ground rover cannot complete an air gate merely by driving underneath it', () => {
  withSim({ parts: makePreset('rover'), mission: 'skyway' }, (sim) => {
    run(sim, 5, { forward: 1 });
    assert.ok(sim.corePosition.z < -22);
    assert.ok(sim.telemetry.altitude < 1);
    assert.equal(sim.checkpointIndex, 0);
    assert.equal(sim.outcome, null);
  });
});

test('boat and plane complete their physical routes using ordinary digital controls', (t) => {
  for (const [preset, mission] of [['boat', 'harbor'], ['plane', 'skyway']]) {
    const events = [];
    withSim({ parts: makePreset(preset), mission, onEvent: (event) => events.push(event) }, (sim) => {
      let maxAltitude = sim.telemetry.altitude;
      for (let tick = 0; tick < 30 * 120 && !sim.outcome; tick++) {
        // W held; the plane additionally receives brief ArrowUp/ArrowLeft
        // presses. No transforms, velocities, HP or checkpoint state are edited.
        sim.step(1 / 120, { forward: 1,
          pitch: preset === 'plane' && sim.elapsed >= 2.2 && sim.elapsed < 2.35 ? 1 : 0,
          roll: preset === 'plane' && sim.elapsed >= 2.5 && sim.elapsed < 2.6 ? 1 : 0 });
        maxAltitude = Math.max(maxAltitude, sim.telemetry.altitude);
        assertFiniteTelemetry(sim);
      }
      assert.equal(sim.outcome, 'won');
      assert.equal(sim.failed, false);
      assert.equal(sim.checkpointIndex, 3);
      assert.equal(sim.objectiveProgress.next, null);
      assert.ok(sim.checkpoints.every((point) => point.passed));
      assert.deepEqual(events.filter((event) => event.type === 'checkpoint').map((event) => event.completed), [1, 2, 3]);
      assert.equal(sim.coreHp, 100);
      assert.equal(sim.integrity, 1);
      assert.equal(sim.brokenCount, 0);
      assert.equal(sim.shots, 0);
      assert.equal(sim.ammoRemaining, 0);
      assert.ok(sim.timeRemaining > 120);
      assert.equal(sim.result.checkpoints, 3);
      assert.equal(sim.result.total, 3);
      assert.ok(Object.isFrozen(sim.result));
      if (preset === 'plane') assert.ok(maxAltitude > 8);
      const elapsed = sim.elapsed, result = sim.result;
      sim.step(0.1, { forward: 1, pitch: -1, roll: 1, fire: true, assist: false });
      assert.equal(sim.elapsed, elapsed);
      assert.equal(sim.result, result);
      assert.equal(events.filter((event) => event.type === 'win').length, 1);
      assert.equal(events.filter((event) => event.type === 'fail').length, 0);
      t.diagnostic(JSON.stringify({ mission, outcome: sim.outcome, checkpoints: sim.checkpointIndex,
        elapsed: Number(sim.elapsed.toFixed(3)), maxAltitude: Number(maxAltitude.toFixed(3)),
        coreHp: sim.coreHp, integrity: sim.integrity, broken: sim.brokenCount, shots: sim.shots }));
    });
  }
});
