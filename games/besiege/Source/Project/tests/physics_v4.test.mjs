import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from '../dist/vendor/cannon-es.js';
import { Simulation, getMissionLayout } from '../dist/physics.js';
import { LinearActuatorConstraint } from '../dist/linear-actuator.js';
import { makePreset } from '../dist/parts.js';

const STEP = 1 / 120;

function run(sim, seconds, input = {}, inspect = () => {}) {
  for (let i = 0; i < Math.round(seconds * 120) && !sim.outcome; i++) {
    sim.step(STEP, input);
    inspect(sim);
  }
}

function withSim(options, body) {
  const sim = new Simulation({ parts: makePreset('lift'), mission: 'sandbox', ...options });
  try { return body(sim); } finally { sim.dispose(); }
}

function pistonOf(sim) { return sim.parts.find((part) => part.type === 'piston'); }

function assertFiniteState(state) {
  for (const key of ['extension', 'target', 'stroke', 'load']) assert.ok(Number.isFinite(state[key]), key);
  assert.ok(state.target >= 0 && state.target <= state.stroke);
  assert.ok(state.load >= 0 && state.load <= 1);
  assert.equal(typeof state.connected, 'boolean');
  assert.doesNotThrow(() => JSON.stringify(state));
}

function partFactory() {
  const parts = [];
  return { parts, add(type, x, y, z) {
    const part = { id: `fixture-${parts.length}`, type, x, y, z, rot: 0,
      power: 1, binding: 'all', ...(type === 'piston' ? { stroke: 1.5 } : {}) };
    parts.push(part);
    return part;
  } };
}

test('piston state is finite at startup and omitted legacy stroke uses the documented default', () => {
  const parts = makePreset('lift');
  const piston = parts.find((part) => part.type === 'piston');
  delete piston.stroke;
  withSim({ parts }, (sim) => {
    const state = sim.getPistonState(piston.id);
    assertFiniteState(state);
    assert.equal(state.extension, 0);
    assert.equal(state.target, 0);
    assert.equal(state.stroke, 1.5);
    assert.equal(state.connected, true);
    assert.equal(state.load, 0);
    assert.equal(sim.getPistonState(parts.find((part) => part.type === 'core').id), null);
    run(sim, 0.8);
    assert.ok(Math.abs(sim.getPistonState(piston.id).extension) < 0.01);
    assert.equal(sim.brokenCount, 0);
  });
});

test('ordinary Z/X inputs raise a real payload, hold it against gravity and retract it', (t) => {
  withSim({}, (sim) => {
    const piston = pistonOf(sim);
    const edge = sim.connections.find((item) => item.kind === 'piston');
    const platform = sim.parts.find((part) => part.type === 'wood' && part.x === 0 && part.z === 0);
    const body = sim.bodies.get(platform.id);
    run(sim, 0.8);
    const startingY = body.position.y;
    let peakActuatorForce = 0;
    const inspect = () => {
      peakActuatorForce = Math.max(peakActuatorForce, Math.abs(edge.constraint.actuatorEquation.multiplier));
      assertFiniteState(sim.getPistonState(piston.id));
    };
    run(sim, 2.6, { actuate: 1 }, inspect);
    const raised = sim.getPistonState(piston.id);
    assert.equal(raised.target, 1.5);
    assert.ok(Math.abs(raised.extension - 1.5) < 0.005);
    assert.ok(Math.abs(body.position.y - startingY - 1.5) < 0.01);
    const heldY = body.position.y;
    run(sim, 1, {}, inspect);
    const holdDrift = Math.abs(body.position.y - heldY);
    const holdForce = edge.constraint.actuatorEquation.multiplier;
    assert.ok(holdDrift < 0.002);
    assert.ok(Math.abs(holdForce - 6.8 * 9.82) < 0.2, 'the actuator supports the actual 6.8 kg upper assembly');
    assert.ok(peakActuatorForce <= 120 + 1e-6, '120 N must not accidentally become 120 impulses per tick');
    run(sim, 2.6, { actuate: -1 }, inspect);
    const retracted = sim.getPistonState(piston.id);
    assert.equal(retracted.target, 0);
    assert.ok(Math.abs(retracted.extension) < 0.005);
    assert.ok(Math.abs(body.position.y - startingY) < 0.01);
    assert.equal(sim.coreHp, 100);
    assert.equal(sim.brokenCount, 0);
    assert.equal(sim.integrity, 1);
    t.diagnostic(JSON.stringify({ mechanism: 'piston', raised: Number(raised.extension.toFixed(6)),
      holdDrift: Number(holdDrift.toFixed(6)), holdForce: Number(holdForce.toFixed(3)),
      peakActuatorForce, retracted: Number(retracted.extension.toFixed(6)) }));
  });
});

test('power scales target speed and finite force, while the short stroke has real end stops', () => {
  for (const power of [0.3, 1, 2]) {
    const parts = makePreset('lift');
    const piston = parts.find((part) => part.type === 'piston');
    piston.power = power;
    withSim({ parts }, (sim) => {
      run(sim, 0.8);
      const edge = sim.connections.find((item) => item.kind === 'piston');
      run(sim, 0.5, { actuate: 1 }, () => {
        assert.ok(Math.abs(edge.constraint.actuatorEquation.multiplier) <= 120 * power + 1e-6);
      });
      const state = sim.getPistonState(piston.id);
      assert.ok(Math.abs(state.target - 0.4 * power) < 1e-8);
      if (power === 0.3) {
        assert.ok(state.extension < 0.01, '36 N is insufficient to raise the 6.8 kg load');
        assert.ok(state.load > 0.99);
      }
    });
  }
  const parts = makePreset('lift');
  const piston = parts.find((part) => part.type === 'piston');
  piston.stroke = 0.25; piston.power = 2;
  withSim({ parts }, (sim) => {
    run(sim, 0.8);
    run(sim, 2, { actuate: 1 });
    const state = sim.getPistonState(piston.id);
    assert.equal(state.target, 0.25);
    assert.ok(Math.abs(state.extension - 0.25) < 0.005);
    assert.equal(sim.brokenCount, 0);
  });
});

test('a heavy upper platform stalls at the force cap instead of being lifted kinematically', (t) => {
  const parts = makePreset('lift').filter((part) => part.type !== 'wood');
  for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
    parts.push({ id: `heavy-${x}-${z}`, type: 'wood', x, y: 2, z,
      rot: 0, power: 1, binding: 'all' });
  }
  withSim({ parts }, (sim) => {
    run(sim, 0.8);
    run(sim, 3, { actuate: 1 });
    const state = sim.getPistonState(pistonOf(sim).id);
    const constraint = sim.connections.find((edge) => edge.kind === 'piston').constraint;
    assert.equal(state.target, 1.5);
    assert.ok(Math.abs(state.extension) < 0.01);
    assert.equal(state.load, 1);
    assert.ok(Math.abs(constraint.actuatorEquation.multiplier - 120) < 1e-6);
    assert.equal(sim.brokenCount, 0);
    assert.equal(sim.coreHp, 100);
    t.diagnostic(JSON.stringify({ loadMass: 26.8, target: state.target,
      actualTravel: Number(state.extension.toFixed(6)), actuatorForce: constraint.actuatorEquation.multiplier }));
  });
});

test('loss of the core connection removes powered holding but preserves the intact sliding guide', () => {
  const rig = partFactory();
  const core = rig.add('core', -1, 0, 0);
  rig.add('brace', 0, 0, 0);
  rig.add('brace', 0, 0, -1);
  rig.add('brace', 0, 0, 1);
  rig.add('brace', 1, 0, 0);
  const piston = rig.add('piston', 0, 1, 0);
  for (const [x, z] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) rig.add('wood', x, 2, z);
  withSim({ parts: rig.parts }, (sim) => {
    run(sim, 0.6);
    run(sim, 2.5, { actuate: 1 });
    assert.ok(sim.getPistonState(piston.id).extension > 1.49);
    const guide = sim.connections.find((edge) => edge.kind === 'piston');
    const supply = sim.connections.find((edge) => edge.a === core.id || edge.b === core.id);
    // Break only the upstream structural connection; the support still rests
    // on the ground, so the real upper load must slide down when power is lost.
    sim._breakConnection(supply, 'test-core-disconnection');
    assert.equal(sim.getPistonState(piston.id).connected, false);
    assert.equal(sim.getPistonState(piston.id).load, 0);
    run(sim, 1.4, { actuate: 1 });
    const state = sim.getPistonState(piston.id);
    assert.equal(guide.broken, false);
    assert.ok(sim.world.constraints.includes(guide.constraint));
    assert.equal(guide.constraint.actuatorEquation.enabled, false);
    assert.ok(Math.abs(state.extension) < 0.01);
    assert.equal(state.target, 1.5, 'the old target is retained but has no powered force');
    assert.equal(sim.brokenCount, 1);
  });
});

test('the guide follows a rotated support and keeps lateral motion constrained', () => {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.solver.iterations = 24;
  const support = new CANNON.Body({ mass: 0 });
  support.addShape(new CANNON.Box(new CANNON.Vec3(0.4, 0.4, 0.4)));
  // Initial fixture orientation only. After adding the bodies, all movement
  // below comes exclusively from world.step and constraint targets.
  support.quaternion.setFromEuler(0.6, 0.3, 0);
  const head = new CANNON.Body({ mass: 1.8,
    position: support.pointToWorldFrame(new CANNON.Vec3(0, 1, 0)) });
  head.quaternion.copy(support.quaternion);
  head.addShape(new CANNON.Box(new CANNON.Vec3(0.34, 0.2, 0.34)));
  world.addBody(support); world.addBody(head);
  const guide = new LinearActuatorConstraint(support, head, { stroke: 1.5, force: 120, timeStep: STEP });
  for (const equation of guide.equations) equation.setSpookParams(1e7, 4, STEP);
  guide.actuatorEquation.setSpookParams(5e5, 4, STEP);
  world.addConstraint(guide);
  for (let tick = 0; tick < 360; tick++) {
    guide.setTarget(Math.min(1, tick * STEP * 0.8));
    world.step(STEP);
    assert.ok(Math.abs(guide.actuatorEquation.multiplier) <= 120 + 1e-6);
  }
  const relative = support.pointToLocalFrame(head.position);
  assert.ok(Math.abs(relative.x) < 0.001 && Math.abs(relative.z) < 0.001);
  assert.ok(Math.abs(relative.y - 2) < 0.001);
  assert.ok(Math.abs(guide.getExtension() - 1) < 0.001);
  guide.disableMotor();
  for (let tick = 0; tick < 120; tick++) world.step(STEP);
  assert.ok(Math.abs(guide.getExtension()) < 0.005);
});

test('mixed piston and hinge stacks lift together without startup instability', () => {
  const parts = makePreset('lift').filter((part) => part.y === 0);
  for (const [type, y] of [['piston', 1], ['hinge', 2], ['piston', 3], ['wood', 4]]) {
    parts.push({ id: `stack-${y}`, type, x: 0, y, z: 0, rot: 0,
      power: 1, binding: 'all', ...(type === 'piston' ? { stroke: 1.5 } : {}) });
  }
  withSim({ parts }, (sim) => {
    run(sim, 0.6);
    const top = sim.bodies.get('stack-4');
    const startingY = top.position.y;
    run(sim, 2.8, { actuate: 1 });
    run(sim, 0.5);
    assert.ok(Math.abs(top.position.y - startingY - 3) < 0.015);
    for (const part of parts.filter((item) => item.type === 'piston')) {
      assert.ok(Math.abs(sim.getPistonState(part.id).extension - 1.5) < 0.005);
    }
    assert.equal(sim.coreHp, 100);
    assert.equal(sim.brokenCount, 0);
    assert.equal(sim.integrity, 1);
  });
});

test('breaking the guide removes all its equations and captures current load and damage in the event', () => {
  const events = [];
  withSim({ onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.8);
    run(sim, 1.5, { actuate: 1 });
    const guide = sim.connections.find((edge) => edge.kind === 'piston');
    const head = sim.bodies.get(guide.b);
    sim._breakConnection(guide, 'test-guide-break');
    sim._breakConnection(guide, 'duplicate-break');
    assert.equal(sim.world.constraints.includes(guide.constraint), false);
    assert.equal(sim.getPistonState(guide.b).connected, false);
    const event = events.find((item) => item.type === 'break');
    assert.equal(event.kind, 'piston');
    assert.equal(event.reason, 'test-guide-break');
    assert.ok(Number.isFinite(event.stress) && event.stress > 0);
    assert.ok(event.health >= 0 && event.health <= 1);
    assert.equal(event.strength, 1800);
    assert.equal(events.filter((item) => item.type === 'break').length, 1);
    const x = head.position.x;
    head.applyImpulse(new CANNON.Vec3(2, 0, 0));
    run(sim, 0.4);
    assert.ok(head.position.x > x + 0.05, 'a broken rail no longer constrains lateral motion');
  });
});

function driveSwitchback(sim) {
  const coreId = sim.parts.find((part) => part.type === 'core').id;
  const core = sim.bodies.get(coreId);
  let phase = 'brake', brakeUntil = 0.5, previousIndex = 0;
  for (let tick = 0; tick < 100 * 120 && !sim.outcome; tick++) {
    const goal = sim.objectiveProgress.next;
    if (!goal) break;
    const position = sim.corePosition;
    const forward = core.vectorToWorldFrame(new CANNON.Vec3(0, 0, -1));
    const desired = Math.atan2(-(goal.position.x - position.x), -(goal.position.z - position.z));
    const heading = Math.atan2(-forward.x, -forward.z);
    const error = Math.atan2(Math.sin(desired - heading), Math.cos(desired - heading));
    const rate = core.angularVelocity.y;
    if (sim.checkpointIndex !== previousIndex) {
      previousIndex = sim.checkpointIndex;
      phase = 'brake'; brakeUntil = sim.elapsed + 0.5;
    }
    const input = {};
    if (phase === 'brake') {
      input.brake = true;
      if (sim.elapsed >= brakeUntil) phase = 'turn';
    } else if (phase === 'turn') {
      const command = error * 2.7 - rate * 0.8;
      input.turn = Math.abs(command) > 0.12 ? Math.sign(command) : 0;
      input.brake = !input.turn;
      if (Math.abs(error) < 0.08 && Math.abs(rate) < 0.16) phase = 'drive';
    } else {
      input.forward = 1;
      const command = error * 3 - rate * 0.7;
      input.turn = Math.abs(command) > 0.18 ? Math.sign(command) : 0;
      if (Math.abs(error) > 0.6) { phase = 'brake'; brakeUntil = sim.elapsed + 0.4; }
    }
    // A feedback driver reads physical heading and the next gate, but sends
    // only ordinary W/A/D/B digital controls. No state is edited to pass gates.
    sim.step(STEP, input);
  }
}

test('the ram completes all four alternating land gates with ordinary steering controls', (t) => {
  const events = [];
  withSim({ parts: makePreset('ram'), mission: 'switchback', onEvent: (event) => events.push(event) }, (sim) => {
    assert.equal(getMissionLayout('switchback').environment.kind, 'land');
    assert.equal(sim.checkpoints.length, 4);
    driveSwitchback(sim);
    assert.equal(sim.outcome, 'won');
    assert.equal(sim.checkpointIndex, 4);
    assert.equal(sim.objectiveProgress.next, null);
    assert.deepEqual(events.filter((event) => event.type === 'checkpoint').map((event) => event.completed), [1, 2, 3, 4]);
    assert.ok(sim.elapsed < 45);
    assert.equal(sim.coreHp, 100);
    assert.equal(sim.integrity, 1);
    assert.equal(sim.brokenCount, 0);
    assert.equal(sim.shots, 0);
    const elapsed = sim.elapsed, result = sim.result;
    sim.step(0.1, { forward: 1, turn: 1 });
    assert.equal(sim.elapsed, elapsed);
    assert.equal(sim.result, result);
    assert.equal(events.filter((event) => event.type === 'win').length, 1);
    t.diagnostic(JSON.stringify({ mission: 'switchback', elapsed: Number(elapsed.toFixed(3)),
      checkpoints: sim.checkpointIndex, coreHp: sim.coreHp, integrity: sim.integrity,
      broken: sim.brokenCount, shots: sim.shots }));
  });
});

test('holding W alone cannot pass the switchback course and eventually reaches the boundary', () => {
  withSim({ parts: makePreset('ram'), mission: 'switchback' }, (sim) => {
    run(sim, 15, { forward: 1 });
    assert.equal(sim.outcome, 'failed');
    assert.equal(sim.won, false);
    assert.equal(sim.checkpointIndex, 0);
    assert.ok(sim.failReason.includes('벗어'));
    assert.equal(sim.coreHp, 100);
  });
});
