import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../dist/physics.js';
import { PARTS, MISSIONS, makePreset, getDesignStats } from '../dist/parts.js';
import { Vec3 } from '../dist/vendor/cannon-es.js';

function run(sim, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 120); i++) sim.step(1 / 120, input);
}

function withSim(options, body) {
  const sim = new Simulation({ parts: makePreset('rover'), ...options });
  try { return body(sim); } finally { sim.dispose(); }
}

test('campaign metadata and V2 public state are initialized before the first tick', () => {
  for (const mission of MISSIONS) {
    withSim({ mission: mission.id }, (sim) => {
      assert.equal(sim.targetCount, mission.targetCount);
      assert.equal(sim.ammoCapacity, mission.ammo);
      assert.equal(sim.ammoRemaining, mission.ammo);
      assert.equal(sim.timeRemaining, mission.timeLimit);
      assert.equal(sim.coreHp, 100);
      assert.equal(sim.coreMaxHp, 100);
      assert.equal(sim.integrity, 1);
      assert.equal(sim.failed, false);
      assert.equal(sim.failReason, '');
      assert.equal(sim.outcome, null);
      assert.equal(sim.result, null);
      assert.equal(sim.cannonsReady, mission.ammo !== 0);
      for (const part of sim.parts) {
        const state = sim.partStates.get(part.id);
        assert.equal(state.maxHp, PARTS[part.type].maxHp);
        assert.equal(state.hp, state.maxHp);
        assert.equal(state.connected, true);
        assert.equal(state.dead, false);
      }
      if (mission.id === 'citadel') {
        assert.equal(sim.enemies.length, 3);
        assert.equal(sim.obstacles.length, 2);
        run(sim, 4);
        assert.equal(sim.destroyedCount, 0, 'the new level must not collapse during its setup window');
      }
    });
  }
});

test('ammo is consumed per actual shell and an empty magazine still permits ramming', () => {
  const parts = makePreset('rover');
  parts.find((part) => part.type === 'cannon').rot = 2; // Shoot away from objectives.
  const events = [];
  withSim({ parts, onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.6);
    for (let i = 0; i < 12; i++) {
      assert.equal(sim.fire(), true);
      run(sim, 0.7);
    }
    assert.equal(sim.ammoRemaining, 0);
    assert.equal(sim.shots, 12);
    assert.equal(sim.fire(), false);
    assert.equal(sim.cannonsReady, false);
    assert.equal(sim.outcome, null, 'running out of shells is not a loss');
    const start = sim.corePosition.z;
    run(sim, 0.5, { forward: 1 });
    assert.ok(sim.corePosition.z < start - 0.5);
    assert.ok(events.some((event) => event.type === 'dry-fire'));
  });
  withSim({ mission: 'sandbox' }, (sim) => {
    run(sim, 0.6);
    assert.equal(sim.fire(), true);
    assert.equal(sim.ammoRemaining, null);
  });
});

test('a multi-cannon volley never consumes more shells than remain', () => {
  const parts = makePreset('rover');
  parts.push({ id: 'extra-cannon', type: 'cannon', x: 1, y: 1, z: 0, rot: 0,
    power: 1, binding: 'all', elevation: 0 });
  withSim({ parts }, (sim) => {
    run(sim, 0.6);
    sim.ammoRemaining = 1;
    assert.equal(sim.fire(), true);
    assert.equal(sim.projectiles.filter((projectile) => !projectile.hostile).length, 1);
    assert.equal(sim.shots, 1);
    assert.equal(sim.ammoRemaining, 0);
  });
});

test('elevation moves the physical launch vector and guide, with reload and limits', () => {
  const parts = makePreset('rover');
  const authoredCannon = parts.find((part) => part.type === 'cannon');
  authoredCannon.elevation = 10;
  withSim({ parts, mission: 'sandbox' }, (sim) => {
    run(sim, 0.6);
    run(sim, 0.4, { aim: 1 });
    assert.ok(Math.abs(sim.aimElevation - 20) < 0.01);
    assert.equal(sim.getCannonElevation(authoredCannon.id), sim.aimElevation);
    const guide = sim.getAimGuide();
    assert.ok(guide.impact.z < -25, 'elevated shot should have a longer ballistic range');
    assert.ok(guide.points.length > 20);
    assert.equal(guide.ready, true);
    sim.fire();
    const shell = sim.projectiles[0].body;
    assert.ok(shell.velocity.y > 6 && shell.velocity.y < 7);
    assert.ok(shell.position.distanceTo(new Vec3(...Object.values(guide.points[0]))) < 1e-6);
    assert.equal(sim.getAimGuide().ready, false);
    assert.ok(sim.getAimGuide().reloadProgress < 0.01);
    run(sim, 0.3);
    assert.ok(sim.getAimGuide().reloadProgress > 0.4 && sim.getAimGuide().reloadProgress < 0.6);
    run(sim, 3, { aim: 1 });
    assert.equal(sim.aimElevation, 45);
    run(sim, 3, { aim: -1 });
    assert.equal(sim.aimElevation, -10);
  });
});

test('the predicted collider hit agrees with a real default cannon shot', () => {
  const events = [];
  withSim({ onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.6);
    const guide = sim.getAimGuide();
    assert.equal(guide.targetId, 'target-3');
    sim.fire();
    run(sim, 1);
    const explosion = events.find((event) => event.type === 'hit' && event.explosive);
    assert.ok(explosion);
    const error = Math.hypot(explosion.position.x - guide.impact.x,
      explosion.position.y - guide.impact.y, explosion.position.z - guide.impact.z);
    assert.ok(error < 0.5, `sphere-vs-centreline prediction error was ${error}`);
    assert.ok(events.some((event) => event.type === 'hit' && event.targetId === guide.targetId));
  });
});

test('enemy warning creates real hostile shells which eventually destroy an idle core', () => {
  const events = [];
  withSim({ mission: 'gate', onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 7.7);
    assert.ok(sim.enemies.some((enemy) => enemy.telegraph > 0 && enemy.telegraph < 1));
    assert.equal(sim.coreHp, 100);
    run(sim, 1);
    assert.ok(sim.projectiles.some((projectile) => projectile.hostile && projectile.body.mass > 0));
    run(sim, 2);
    assert.ok(sim.coreHp < 100);
    assert.ok(events.some((event) => event.type === 'damage' && event.source === 'enemy-shell'));
    run(sim, 20);
    assert.equal(sim.failed, true);
    assert.equal(sim.won, false);
    assert.equal(sim.outcome, 'failed');
    assert.equal(sim.coreHp, 0);
    assert.equal(events.filter((event) => event.type === 'fail').length, 1);
    assert.ok(sim.failReason.includes('코어'));
  });
});

test('the locked warning aim can be evaded with normal wheel controls', () => {
  withSim({ mission: 'gate' }, (sim) => {
    run(sim, 7.7);
    const warnedPoint = { ...sim.enemies[0].aim };
    run(sim, 3, { forward: -1 });
    assert.ok(sim.corePosition.z - warnedPoint.z > 10);
    assert.equal(sim.coreHp, 100);
    assert.equal(sim.outcome, null);
  });
});

test('destroying a tower carrier with a real shell prevents its later attacks', () => {
  const events = [];
  withSim({ onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.6);
    sim.fire();
    run(sim, 2);
    assert.equal(sim.enemies[0].alive, false);
    assert.equal(sim.enemies[0].telegraph, 0);
    run(sim, 13);
    assert.equal(events.filter((event) => event.type === 'enemy-fire').length, 0);
    assert.equal(sim.coreHp, 100);
  });
});

test('one controlled hostile impact destroys the bearing and disables the surviving cannon', () => {
  const events = [];
  withSim({ mission: 'sandbox', onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.6);
    // A real cannon-es shell aimed at the bearing, not a mocked damage event.
    sim._spawnProjectile({ position: new Vec3(0, 1.64, -3), velocity: new Vec3(0, 0, 15),
      power: 2, hostile: true });
    run(sim, 0.5);
    const hinge = sim.parts.find((part) => part.type === 'hinge');
    const cannon = sim.parts.find((part) => part.type === 'cannon');
    const core = sim.parts.find((part) => part.type === 'core');
    assert.equal(sim.partStates.get(hinge.id).dead, true);
    assert.ok(sim.partStates.get(cannon.id).hp > 0, 'cannon should survive as disconnected debris');
    assert.equal(sim.partStates.get(cannon.id).connected, false);
    assert.equal(sim.fire(), false);
    assert.equal(sim.shots, 0);
    assert.ok(sim.coreHp > 0);
    assert.ok(sim.integrity < 1);
    assert.equal(events.filter((event) => event.type === 'damage' && event.partId === core.id).length, 1,
      'multiple simultaneous shell contacts must not multiply blast damage');
    assert.ok(sim.bodies.has(hinge.id), 'HP-dead parts remain physical debris');
    const hingeEdge = sim.connections.find((edge) => edge.kind === 'hinge');
    assert.equal(hingeEdge.constraint.motorEquation.enabled, false);
  });
});

test('failure wins a same-tick tie and terminal state is emitted and frozen once', () => {
  const events = [];
  withSim({ onEvent: (event) => events.push(event) }, (sim) => {
    const core = sim.parts.find((part) => part.type === 'core');
    sim._damagePart(core.id, 1000, sim.bodies.get(core.id).position, 'test-simultaneous-impact');
    for (const target of sim.targets) sim._damageTarget(target, 1000, target.body.position, 'test-simultaneous-impact');
    run(sim, 0.1);
    assert.equal(sim.destroyedCount, sim.targetCount);
    assert.equal(sim.outcome, 'failed');
    assert.equal(sim.won, false);
    assert.equal(sim.result.won, false);
    assert.equal(events.filter((event) => event.type === 'fail').length, 1);
    assert.equal(events.filter((event) => event.type === 'win').length, 0);
    const snapshot = sim.result;
    const elapsed = sim.elapsed;
    run(sim, 1, { fire: true, forward: 1 });
    assert.equal(sim.elapsed, elapsed);
    assert.equal(sim.result, snapshot);
    assert.equal(sim.fire(), false);
  });
});

test('time and bounds failures are terminal, while sandbox has no timer', () => {
  withSim({}, (sim) => {
    sim.elapsed = 179.99; // Exercise the real boundary without a three-minute test.
    run(sim, 0.1);
    assert.equal(sim.timeRemaining, 0);
    assert.equal(sim.outcome, 'failed');
    assert.ok(sim.failReason.includes('시간'));
  });
  withSim({ parts: makePreset('blank'), mission: 'sandbox' }, (sim) => {
    const core = [...sim.bodies.values()][0];
    core.position.x = 66;
    run(sim, 0.1);
    assert.equal(sim.timeRemaining, null);
    assert.equal(sim.outcome, 'failed');
    assert.ok(sim.failReason.includes('벗어'));
  });
});

test('the brake stops the real drivetrain even when forward is also held', () => {
  withSim({ mission: 'sandbox' }, (sim) => {
    run(sim, 0.6);
    run(sim, 1, { forward: 1 });
    assert.ok(sim.speed > 4);
    run(sim, 0.6, { forward: 1, brake: true });
    assert.ok(sim.speed < 0.7, `braking speed=${sim.speed}`);
    assert.equal(sim.brokenCount, 0);
  });
});

// Feedback controller operates the public steering/elevation inputs. It uses a
// textbook ballistic estimate, then lets the actual cannon, collision solver,
// hostile towers and damage system decide the result. No targets are teleported.
function aimAndFire(sim, target) {
  const cannon = [...sim.bodies.values()].find((body) => body.userData.type === 'cannon');
  for (let step = 0; step < 420 && !sim.outcome; step++) {
    const dx = target.body.position.x - cannon.position.x;
    const dz = target.body.position.z - cannon.position.z;
    const dy = target.body.position.y - cannon.position.y;
    const distance = Math.hypot(dx, dz), speed = 18.5, gravity = 9.82;
    let angle = 0.3;
    for (let iteration = 0; iteration < 4; iteration++) {
      const range = distance - 1.12 * Math.cos(angle), height = dy - 1.12 * Math.sin(angle);
      const discriminant = speed ** 4 - gravity * (gravity * range * range + 2 * height * speed * speed);
      angle = Math.atan((speed * speed - Math.sqrt(Math.max(0, discriminant))) / (gravity * range));
    }
    const direction = cannon.vectorToWorldFrame(new Vec3(0, 0, -1));
    const rawError = Math.atan2(-dx, -dz) - Math.atan2(-direction.x, -direction.z);
    const yawError = Math.atan2(Math.sin(rawError), Math.cos(rawError));
    const elevationError = angle * 180 / Math.PI - sim.aimElevation;
    if (Math.abs(yawError) < 0.014 && Math.abs(elevationError) < 0.22 && sim.cannonsReady) {
      // Release the Q/E and I/K keys, then press F through the same public input
      // path used by the browser. No analog-only control is needed to win.
      run(sim, 0.05);
      const before = sim.shots;
      sim.step(1 / 120, { fire: true });
      sim.step(1 / 120, { fire: false });
      return sim.shots > before;
    }
    sim.step(1 / 120, {
      turret: Math.abs(yawError) >= 0.014 ? Math.sign(yawError) : 0,
      aim: Math.abs(elevationError) >= 0.22 ? Math.sign(elevationError) : 0,
    });
  }
  return false;
}

test('citadel can be completed through physical aiming within ammo and time limits', (t) => {
  const events = [];
  withSim({ mission: 'citadel', onEvent: (event) => events.push(event) }, (sim) => {
    run(sim, 0.6);
    run(sim, 0.35, { forward: 1 });
    run(sim, 0.4, { brake: true });
    assert.ok(sim.corePosition.z < -0.3, 'drive to a new firing position with normal controls');
    const priority = ['target-7', 'target-1', 'target-13', 'target-4', 'target-10'];
    for (const id of priority) {
      const target = sim.targets.find((item) => item.id === id);
      if (target.dead) continue;
      assert.equal(aimAndFire(sim, target), true, `acquire ${id}`);
      run(sim, 1.8);
    }
    for (let attempt = 0; attempt < 6 && !sim.outcome; attempt++) {
      const target = sim.targets.find((item) => !item.dead);
      if (!target) break;
      assert.equal(aimAndFire(sim, target), true, `finish ${target.id}`);
      run(sim, 1.8);
    }
    assert.equal(sim.won, true);
    assert.equal(sim.failed, false);
    assert.equal(sim.outcome, 'won');
    assert.equal(sim.destroyedCount, 15);
    assert.ok(sim.shots <= 10);
    assert.ok(sim.ammoRemaining >= 10);
    t.diagnostic(JSON.stringify({ mission: 'citadel', outcome: sim.outcome,
      destroyed: sim.destroyedCount, shots: sim.shots, ammoRemaining: sim.ammoRemaining,
      elapsed: Number(sim.elapsed.toFixed(3)), timeRemaining: Number(sim.timeRemaining.toFixed(3)),
      coreHp: Number(sim.coreHp.toFixed(2)), integrity: sim.integrity, broken: sim.brokenCount }));
    assert.equal(sim.result.cost, getDesignStats(sim.parts).cost);
    assert.equal(sim.result.integrity, sim.integrity);
    assert.ok(Object.isFrozen(sim.result));
    const snapshot = sim.result, time = sim.elapsed, core = sim.parts.find((part) => part.type === 'core');
    sim._damagePart(core.id, 1000, sim.bodies.get(core.id).position, 'after-victory');
    run(sim, 5, { fire: true });
    assert.equal(sim.result, snapshot);
    assert.equal(sim.elapsed, time);
    assert.equal(sim.won, true);
    assert.equal(sim.failed, false);
    assert.equal(events.filter((event) => event.type === 'win').length, 1);
    assert.equal(events.filter((event) => event.type === 'fail').length, 0);
  });
});
