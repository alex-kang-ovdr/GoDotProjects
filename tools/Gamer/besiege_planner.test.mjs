import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { createBesiegePlanner } from './besiege_planner.mjs';
import { InputDriver } from './playhub_model_qa.mjs';

const { projectRoot } = JSON.parse(readFileSync(new URL('./playhub-target.json', import.meta.url), 'utf8'));
const load = name => import(pathToFileURL(path.join(projectRoot, 'games', 'besiege', 'Web', name)).href);
const [{ Simulation }, { makePreset }, { readControls }] = await Promise.all([
  load('physics.js'), load('parts.js'), load('input.js'),
]);

test('Outpost planner wins through the harness keyboard driver and canonical control mapping', async (t) => {
  const events = [];
  const parts = makePreset('rover');
  const sim = new Simulation({ parts, mission: 'outpost', onEvent: event => events.push(event) });
  t.after(() => sim.dispose());
  const keys = new Set();
  const driver = new InputDriver(async (method, key) => {
    assert.equal(method, 'Input.dispatchKeyEvent');
    if (key.type === 'keyUp') keys.delete(key.code);
    else keys.add(key.code);
  });
  const tick = () => {
    const controls = readControls(keys, new Set());
    sim.step(1 / 60, controls);
    sim.step(1 / 60, controls);
  };
  const observe = () => ({
    mode: 'play', mission: 'outpost', paused: false, partCount: parts.length,
    sim: {
      elapsed: sim.elapsed,
      shots: sim.shots,
      destroyed: sim.destroyedCount,
      targets: sim.targetCount,
      ammo: sim.ammoRemaining,
      coreHp: sim.coreHp,
      outcome: sim.outcome,
    },
  });
  tick();
  const planner = await createBesiegePlanner({ projectRoot, initial: observe() });
  const progress = [];
  for (let round = 0; round < 4; round++) {
    const before = observe();
    if (round === 2) {
      const desynced = { ...before, sim: { ...before.sim, destroyed: 0 } };
      assert.throws(() => planner.next(desynced, driver.state()), /diverged/);
    }
    const { action, groupTicks, diagnostics } = planner.next(before, driver.state());
    await driver.apply(action, async () => {
      for (let tickIndex = 0; tickIndex < groupTicks; tickIndex++) tick();
    });
    const { targets, ...after } = observe().sim;
    assert.equal(targets, 9);
    assert.deepEqual(after, diagnostics.expectedAfter);
    progress.push([after.shots, after.destroyed]);
  }
  await driver.release();
  assert.deepEqual(progress, [[1, 0], [1, 3], [2, 6], [3, 9]]);
  assert.equal(sim.outcome, 'won');
  assert.equal(sim.coreHp, 100);
  const fatalShellHits = events.filter(event => event.type === 'hit' && event.source === 'shell' && event.hp === 0);
  assert.equal(new Set(fatalShellHits.map(event => event.targetId)).size, 9);
});
