import assert from 'node:assert/strict';
import test from 'node:test';
import { InputDriver, actionHistory, combatInstruction, applyPlayModeGuard, summarizeGameplay, validateDecision } from './playhub_model_qa.mjs';

const action = (mouse, steps) => ({ text: 'model output preserved separately', action: { mouse, steps, parsed: true } });
const repeat = (...keys) => Array.from({ length: 6 }, () => keys);

test('next-turn context contains the executed action after the guard, not the raw Space action', () => {
  const raw = validateDecision(action([0, 0, 0], repeat('S', 'Space')));
  const { executed } = applyPlayModeGuard('besiege', true, raw);
  assert.equal(actionHistory(executed), '<|action_start|>0 0 0 ; S ; S ; S ; S ; S ; S<|action_end|>');
  assert.ok(raw.steps.every(group => group.includes('Space')));
  assert.match(combatInstruction('fortress-blue', { human: false, phase: 'flight' }, 10), /Release all keys and wait/);
});

test('does not execute truncated or structurally invalid model output', () => {
  const incomplete = action([0, 0, 0], repeat('W'));
  incomplete.action.truncated = true;
  assert.deepEqual(validateDecision(incomplete), { mouse: [0, 0, 0], steps: repeat(), invalid: 'truncated' });
  assert.equal(validateDecision({ ...action([0, 0, 0], repeat('F')), finish_reason: 'length' }).invalid, 'truncated');
  assert.equal(validateDecision(action([0, Infinity, 0], repeat('F'))).invalid, 'invalid-action-shape');
  assert.equal(validateDecision(action([0, 0, 0], [['F']])).invalid, 'invalid-action-shape');
  assert.equal(validateDecision(action([0, 0, 0], repeat('Any'))).invalid, 'invalid-action-shape');
  assert.deepEqual(validateDecision(action([3500, -2000, 9], repeat('W', 'W'))), { mouse: [1000, -1000, 5], steps: repeat('W'), invalid: null });
});

test('Besiege play guard removes only Space and preserves the response and validated action', () => {
  const response = action([25, -10, 1], [['S', 'Space'], ['S'], ['Space'], ['F', 'D'], [], ['W']]);
  const original = structuredClone(response);
  const validated = validateDecision(response);
  const { executed, guard } = applyPlayModeGuard('besiege', true, validated);
  assert.deepEqual(response, original);
  assert.deepEqual(validated.steps, original.action.steps);
  assert.deepEqual(executed.steps, [['S'], ['S'], [], ['F', 'D'], [], ['W']]);
  assert.deepEqual(executed.mouse, original.action.mouse);
  assert.equal(guard.removedKeyGroups, 2);
  assert.deepEqual(guard.events[0].groups, [1, 3]);
  assert.equal(guard.events[0].key, 'Space');
});

test('the guard leaves other games, disabled runs and invalid no-ops untouched', () => {
  const validated = validateDecision(action([0, 0, 0], repeat('Space')));
  for (const [game, enabled] of [['besiege', false], ['fortress-blue', true]]) {
    assert.deepEqual(applyPlayModeGuard(game, enabled, validated), {
      executed: validated,
      guard: { enabled: false, removedKeyGroups: 0, events: [] },
    });
  }
  const invalid = validateDecision({});
  assert.deepEqual(applyPlayModeGuard('besiege', true, invalid), {
    executed: invalid,
    guard: { enabled: true, removedKeyGroups: 0, events: [] },
  });
});

test('keeps keys held across both groups and model decisions, and releases on no-op', async () => {
  const dispatched = [], clock = [];
  const driver = new InputDriver(async (method, params) => dispatched.push({ method, ...params }), async () => {});
  const tick = async () => clock.push(driver.state().held);
  await driver.apply(validateDecision(action([0, 0, 0], repeat('Space'))), tick);
  await driver.apply(validateDecision(action([0, 0, 0], repeat('Space'))), tick);
  await driver.apply(validateDecision({}), tick);
  assert.deepEqual(dispatched.map(({ type, code }) => [type, code]), [['keyDown', 'Space'], ['keyUp', 'Space']]);
  assert.deepEqual(clock, [...Array(12).fill(['Space']), ...repeat()]);
});

test('moves, clicks and scrolls at the same point in game viewport coordinates; cleanup releases held state', async () => {
  const dispatched = [], pointer = [];
  const driver = new InputDriver(async (method, params) => dispatched.push({ method, ...params }), async (x, y) => pointer.push([x, y]));
  await driver.apply(validateDecision(action([250, -250, 1], repeat('W', 'Space', 'LB'))), async () => {});
  await driver.release();
  const mouse = dispatched.filter(event => event.method === 'Input.dispatchMouseEvent');
  assert.deepEqual(pointer, [[960, 200]]);
  assert.deepEqual(mouse.map(({ type, x, y, buttons }) => [type, x, y, buttons]), [
    ['mouseMoved', 960, 200, 0], ['mouseWheel', 960, 200, 0], ['mousePressed', 960, 200, 1], ['mouseReleased', 960, 200, 0],
  ]);
  assert.equal(mouse[1].deltaY, -100);
  assert.deepEqual(dispatched.filter(event => event.type === 'keyDown').map(event => event.code), ['Space', 'KeyW']);
  assert.deepEqual(driver.state().held, []);
});

test('counts the recorded blue terrain shot once and does not treat it as an enemy hit', () => {
  const baseline = { turn: 1, simTime: 1 / 30, winner: null, tanks: [{ uid: 't0_0', team: 0, hp: 960 }, { uid: 't1_0', team: 1, hp: 880 }], stats: { shots: 0, terrainRemoved: 0 }, projectiles: [], lastAction: null };
  const volley = { volleyId: 'v1', ownerId: 't0_0', team: 0, shots: 1, damageToEnemy: 0, terrainRemoved: 1354, reason: 'terrain' };
  const resolved = { ...baseline, simTime: 0.4, lastAction: volley, stats: { shots: 1, terrainRemoved: 1354 } };
  const metrics = summarizeGameplay('fortress-blue', baseline, [resolved, { ...resolved, turn: 2, simTime: 4.0 }], []);
  assert.equal(metrics.shotsTotalDelta, 1);
  assert.equal(metrics.completedBlueVolleys, 1);
  assert.equal(metrics.terrainRemoved, 1354);
  assert.equal(metrics.meaningfulGameplay, true);
  assert.equal(metrics.objectiveMet, false);
  assert.equal(metrics.enemyDamage, 0);
});

test('a setup-launched rover gets credit only for actual movement after model drive input', () => {
  const baseline = { mode: 'play', sim: { core: { x: 0, z: 1 }, elapsed: 0.033, speed: 0, shots: 0, destroyed: 0 } };
  const advanced = { mode: 'play', sim: { ...baseline.sim, core: { x: 0, z: 0.2 }, elapsed: 0.233, speed: 2 } };
  const passive = summarizeGameplay('besiege', baseline, [advanced], []);
  const active = summarizeGameplay('besiege', baseline, [advanced], [action([0, 0, 0], repeat('W')).action]);
  assert.equal(passive.meaningfulGameplay, false);
  assert.equal(active.meaningfulGameplay, true);
  assert.equal(active.launched, true);
  assert.equal(active.launchedByModel, false);
  assert.equal(active.maxHorizontalDistance, 0.8);
});
