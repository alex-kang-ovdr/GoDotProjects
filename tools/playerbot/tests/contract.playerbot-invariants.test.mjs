import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../../../games/playerbot-last-light/Web/engine.js';
import * as Field from '../../../games/playerbot-last-light/Web/expedition.js';
import { createTripleClock, advanceSimClock } from '../../../games/playerbot-last-light/Web/bot-clock.js';
import { BOT_PACKS, verifyPackIntegrity, selectLorebookEntries } from '../../../games/playerbot-last-light/Web/bot-packs.js';
import { createBotRuntime } from '../../../games/playerbot-last-light/Web/bot-runtime.js';

function startNightWithCompanion(locationId = 'warehouse', seed = 42) {
  const state = Core.createGame(seed);
  state.day = 5; // unlock warehouse
  assert.equal(Core.endDay(state).ok, true);
  const plan = {
    scavengerId: 'leo',
    companionId: 'yun',
    locationId,
    loadout: { bandage: 1, parts: 2, knife: 0 },
    roles: { leo: 'scavenge', yun: 'companion', mira: 'guard' },
  };
  const began = Core.beginNight(state, plan);
  assert.equal(began.ok, true, began.reason);
  const exp = Field.createExpedition(began.context, state);
  state.paused = false;
  return { state, exp };
}

test('Triple clock respects pause and speed strictly (R04)', () => {
  const clock = createTripleClock({ paused: true, speed: 1 });
  assert.equal(advanceSimClock(clock, 5, { paused: true, speed: 2 }), 0);
  assert.equal(clock.game_sim_ms, 0);
  assert.equal(advanceSimClock(clock, 1, { paused: false, speed: 1 }), 1000);
  assert.equal(advanceSimClock(clock, 1, { paused: false, speed: 2 }), 2000);
  assert.equal(clock.game_sim_ms, 3000);
});

test('Declarative .fnpcpack integrity & state-first Lorebook cap (<=3, <=400 tok)', () => {
  for (const id of ['mira', 'yun', 'leo']) {
    const res = verifyPackIntegrity(BOT_PACKS[id]);
    assert.equal(res.ok, true, `${id} pack digest valid`);
  }
  const lore = selectLorebookEntries(BOT_PACKS.mira, { phase: 'expedition', locationId: 'clinic', cold: true }, '진료소 약 추위 난로 치료');
  assert.ok(lore.length >= 1 && lore.length <= 3);
  assert.equal(lore[0].id, 'mira_clinic', 'state-matched clinic lore prioritized first');
});

test('T01: Delayed activation — PENDING_START never consumes duration_ms until arrival & pauses with game_sim_ms', () => {
  const { state, exp } = startNightWithCompanion('cottage', 10);
  const rt = createBotRuntime({ getState: () => state, getExpedition: () => exp });
  const rev = rt.adapter.getRevision('yun');
  const receipt = rt.commitIntent('yun', {
    schema: 'coop_pve.v1.move_then_hold',
    target_point: { x: 460, floor: 0 },
    arrival_timeout_ms: 15000,
    constraint: {
      clock: 'game_sim_ms',
      start_condition: 'on_arrival',
      duration_ms: 10000,
      channels: { movement: 'hold_with_evasion', attack: 'forbid' },
      on_threat: 'evade_without_attack',
      renewal_policy: { max_renewals: 2, max_cumulative_ms: 30000 },
    },
    expected_revision: rev,
  }, { actor_id: 'player', user_id: 'u1', team_id: 'survivors', role_rank: 'OWNER' }, { request_key: 't01-1' });

  assert.equal(receipt.accepted, true);
  assert.equal(receipt.constraint_state, 'PENDING_START');

  // Advance 0.5s while still walking: duration_ms MUST remain 10000!
  for (let i = 0; i < 5; i++) { Field.stepExpedition(exp, 0.1, {}); rt.step(0.1); }
  let c = rt.getDebugSnapshot('yun').active_constraints[0];
  assert.equal(c.state, 'PENDING_START');
  assert.equal(c.remaining_ms, 10000, 'duration_ms not consumed before arrival');
  assert.ok(c.arrival_remaining_ms < 15000, 'arrival_timeout_ms decreases while moving');

  // Walk until arrived
  for (let i = 0; i < 40; i++) { Field.stepExpedition(exp, 0.1, {}); rt.step(0.1); }
  c = rt.getDebugSnapshot('yun').active_constraints[0];
  assert.equal(c.state, 'ACTIVE');
  const remBeforePause = c.remaining_ms;

  // Pause game: game_sim_ms and remaining_ms MUST freeze!
  state.paused = true;
  rt.step(5);
  assert.equal(rt.getDebugSnapshot('yun').active_constraints[0].remaining_ms, remBeforePause, 'timer frozen while paused');
});

test('T02: Channel independence — under attack: forbid, threat triggers evasion/hide with 0 offensive attacks', () => {
  const { state, exp } = startNightWithCompanion('warehouse', 77);
  const rt = createBotRuntime({ getState: () => state, getExpedition: () => exp });
  const rev = rt.adapter.getRevision('yun');
  const receipt = rt.commitIntent('yun', {
    schema: 'coop_pve.v1.set_engagement',
    constraint: {
      clock: 'game_sim_ms',
      start_condition: 'immediate',
      duration_ms: 15000,
      channels: { attack: 'forbid', movement: 'hold_with_evasion' },
      on_threat: 'evade_without_attack',
    },
    expected_revision: rev,
  }, { actor_id: 'player', user_id: 'u1', team_id: 'survivors', role_rank: 'OWNER' }, { request_key: 't02-1' });
  assert.equal(receipt.accepted, true);

  // Place hostile guard right next to companion & open door so visible
  exp.doors.forEach(d => { d.open = true; });
  exp.player.x = 880;
  exp.companion.x = 940;
  exp.npcs[0].x = 990;
  exp.npcs[0].floor = 0;
  exp.npcs[0].hostile = true;
  const attacksBefore = exp.stats.attacks;

  for (let i = 0; i < 15; i++) { Field.stepExpedition(exp, 0.1, {}); rt.step(0.1); }
  assert.equal(exp.stats.attacks, attacksBefore, 'ZERO offensive attacks while attack: forbid is active');

  // Direct offensive intent must also be rejected at CommitGate
  const blocked = rt.commitIntent('yun', {
    schema: 'coop_pve.v1.follow',
    effect_tags: ['offensive'],
    expected_revision: rt.adapter.getRevision('yun'),
  }, { actor_id: 'player', user_id: 'u1', team_id: 'survivors', role_rank: 'OWNER' }, { request_key: 't02-off' });
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason_code, 'offensive_forbidden');
});

test('T03 & T04: Idempotency cache prevents timer reset & renewal_policy caps at 2 renewals / 30s', () => {
  const { state, exp } = startNightWithCompanion('cottage', 11);
  const rt = createBotRuntime({ getState: () => state, getExpedition: () => exp });
  const ctx = { actor_id: 'player', user_id: 'u1', team_id: 'survivors', role_rank: 'OWNER' };
  const intent = {
    schema: 'coop_pve.v1.set_engagement',
    constraint: {
      clock: 'game_sim_ms',
      start_condition: 'immediate',
      duration_ms: 10000,
      channels: { attack: 'forbid' },
      renewal_policy: { max_renewals: 2, max_cumulative_ms: 30000 },
    },
    expected_revision: rt.adapter.getRevision('yun'),
  };
  const first = rt.commitIntent('yun', intent, ctx, { request_key: 'dup-key-1' });
  assert.equal(first.accepted, true);
  rt.step(2);
  const remAfter2s = rt.getDebugSnapshot('yun').active_constraints[0].remaining_ms;
  const replay = rt.commitIntent('yun', intent, ctx, { request_key: 'dup-key-1' });
  assert.equal(replay.idempotent_replay, true);
  assert.equal(rt.getDebugSnapshot('yun').active_constraints[0].remaining_ms, remAfter2s, 'duplicate request_key never resets timer');

  // T04 renewals: +10s (1/2), +10s (2/2), +10s -> rejected!
  assert.equal(rt.renewConstraint('yun', 10000, 'ren-1').accepted, true);
  assert.equal(rt.renewConstraint('yun', 10000, 'ren-2').accepted, true);
  const third = rt.renewConstraint('yun', 10000, 'ren-3');
  assert.equal(third.accepted, false);
  assert.equal(third.reason_code, 'renewal_limit_exceeded');
});

test('T05 & T16: OCC stale_state discards late promise & human slot takeover increments slot_holder_rev', () => {
  const { state, exp } = startNightWithCompanion('cottage', 12);
  const rt = createBotRuntime({ getState: () => state, getExpedition: () => exp });
  const staleRev = rt.adapter.getRevision('yun');

  // Human takes over slot (T16) while LLM response was in flight
  rt.detachBot('yun');
  const lateCommit = rt.commitIntent('yun', {
    schema: 'coop_pve.v1.follow',
    expected_revision: staleRev,
  }, { actor_id: 'player', user_id: 'u1', team_id: 'survivors', role_rank: 'OWNER' }, { request_key: 'late-1' });

  assert.equal(lateCommit.accepted, false);
  assert.equal(lateCommit.reason_code, 'stale_state');
  assert.equal(lateCommit.discard_reply, true);
});

test('T06 & T15 & T17: Honest cancel reporting, unauthorized permission_denied (0 safety violation), and visibility fairness', () => {
  const { state, exp } = startNightWithCompanion('warehouse', 15);
  const rt = createBotRuntime({ getState: () => state, getExpedition: () => exp });

  // T15: Enemy / unauthorized actor rejected with permission_denied and safety_violation: false
  const denied = rt.commitIntent('yun', {
    schema: 'coop_pve.v1.extract',
    expected_revision: rt.adapter.getRevision('yun'),
  }, { actor_id: 'enemy_1', user_id: 'e1', team_id: 'raiders', role_rank: 'UNAUTHORIZED' }, { request_key: 't15-1' });
  assert.equal(denied.accepted, false);
  assert.equal(denied.reason_code, 'permission_denied');
  assert.equal(denied.safety_violation, false);

  // T17: Visibility fairness — warehouse guard behind closed loading door (x=740) MUST NOT appear in observe()!
  const obs = rt.adapter.observe('yun');
  assert.equal(obs.visible_entities.some(e => e.id === 'warehouse_guard_a'), false, 'unseen NPC behind closed door must not leak');

  // T06: Partial effect honest cancel — distraction consumes 1 part -> cancelled_after_effect
  const distReceipt = rt.commitIntent('yun', {
    schema: 'coop_pve.v1.support_ally',
    mode: 'distraction',
    expected_revision: rt.adapter.getRevision('yun'),
  }, { actor_id: 'player', user_id: 'u1', team_id: 'survivors', role_rank: 'OWNER' }, { request_key: 't06-1' });
  assert.equal(distReceipt.accepted, true);
  const cancelRes = rt.adapter.cancel('yun', distReceipt.ticket_id);
  assert.equal(cancelRes.status, 'cancelled_after_effect');
  assert.ok(cancelRes.committed_effects.includes('consumed_part_1'));
});
