import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { createFortressPlanner } from './fortress_planner.mjs';
import { InputDriver } from './playhub_model_qa.mjs';

const { projectRoot } = JSON.parse(readFileSync(new URL('./playhub-target.json', import.meta.url), 'utf8'));
const require = createRequire(import.meta.url);
const source = join(projectRoot, 'games', 'fortress-blue', 'Web');
require(join(source, 'data.js'));
const FortEngine = require(join(source, 'engine.js'));

function fixture() {
  const engine = new FortEngine({
    seed: 152877, profile: 'classic', map: 'highlands', teamSize: 1,
    playerTank: 'catapult', opponentTank: 'cannon', control: 'ai', difficulty: 'easy',
    angleProfile: 'jp2003', tuning: { turnTime: 60 },
  });
  let charge = null;
  const driver = new InputDriver(async (method, event) => {
    assert.equal(method, 'Input.dispatchKeyEvent');
    assert.equal(event.code, 'Space');
    if (event.type === 'keyUp') {
      charge = null;
      engine.fire();
    } else {
      charge = 0;
      engine.setPower(engine.getChargePower(charge));
    }
  });
  const tick = () => {
    const dt = 1 / 60;
    if (charge !== null) {
      charge += dt;
      engine.setPower(engine.getChargePower(charge));
    }
    engine.tick(dt);
  };
  tick();
  const observe = () => {
    const s = engine.getSnapshot();
    return { ...s, human: engine.isHumanTurn(), terrainVersion: s.terrain.version, weapon: engine.state.weaponIndex };
  };
  const execute = (action, groupTicks) => driver.apply(action, async () => {
    for (let frame = 0; frame < groupTicks * 2; frame++) tick();
  });
  return { driver, observe, execute, tick };
}

test('the previous 33 ms tap fires at 2 power and does no enemy damage', async () => {
  const match = fixture();
  await match.execute({ mouse: [0, 0, 0], steps: [['Space'], [], [], [], [], []] }, 1);
  for (let frame = 0; frame < 90; frame++) match.tick();
  const result = match.observe();
  assert.equal(result.lastAction.power, 2);
  assert.equal(result.lastAction.damageToEnemy, 0);
  assert.equal(result.tanks.find(tank => tank.team === 1).hp, 880);
});

test('the computed charge and release causes a direct 308 damage hit', async () => {
  const match = fixture();
  const initial = match.observe();
  const planner = await createFortressPlanner({ projectRoot, initial });
  const { action, groupTicks, diagnostics } = planner.next(initial, match.driver.state());
  assert.equal(initial.stats.shots, 0);
  assert.deepEqual(match.observe(), initial);
  assert.equal(diagnostics.direct, true);
  await match.execute(action, groupTicks);
  const result = match.observe();
  assert.equal(result.lastAction.angle, 45);
  assert.equal(result.lastAction.power, 38);
  assert.equal(result.lastAction.damageToEnemy, diagnostics.damage);
  assert.equal(result.lastAction.damageToEnemy, 308);
  assert.equal(result.tanks.find(tank => tank.team === 1).hp, 572);
  assert.deepEqual(match.driver.state().held, []);
});
