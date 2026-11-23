// Last Light PlayerBot — Zone 3 Two-Phase Commit Gate & 5-State Constraint Engine
// Mirrors Forge NPC SDK v0.2 invariants (Research §3.1, §3.2 R04/R05, §3.3 R06)

import { getBotPack } from './bot-packs.js';

export const ROLE_RANKS = Object.freeze({
  SYSTEM_SAFETY: 4,
  OWNER: 3,
  PARTY_LEADER: 2,
  AUTHORIZED_ALLY: 1,
  UNAUTHORIZED: 0,
});

export const CONSTRAINT_STATES = Object.freeze([
  'PENDING_START',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
  'FAILED_START',
]);

export const SAFE_REFUSAL_TEMPLATES = Object.freeze({
  stale_state: '그사이 현장 상황이 바뀌어 방금 약속은 적용하지 않았습니다. 현재 상태를 기준으로 다시 지시해 주세요.',
  permission_denied: '이 동료에게 명령할 권한이 없어 요청을 수행하지 않았습니다.',
  conflict_active_constraint: '이미 우선순위가 같거나 높은 제약이 활성화되어 있어 새 지시를 적용하지 않았습니다.',
  renewal_limit_exceeded: '대기 제약 연장 한도(최대 2회 / 누적 30초)에 도달해 더 연장할 수 없습니다.',
  unsupported_intent: '현재 단계에서 허용되지 않은 명령입니다. 등록된 생존·전술 명령만 실행할 수 있습니다.',
  offensive_forbidden: '공격 금지 제약이 활성 중이라 공격 행동을 차단했습니다.',
  insufficient_resources: '필요한 물자나 스태미나가 부족해 요청을 실행할 수 없습니다.',
  door_locked_no_crowbar: '잠긴 문이 막고 있는데 쇠지레가 없어 통과할 수 없습니다.',
  bot_unavailable: '지정한 동료 봇이 현재 활동할 수 없는 상태입니다.',
  invalid_schema: '명령 형식이 올바르지 않아 실행을 보류했습니다.',
});

export function getSafeRefusalText(reasonCode, fallback = '') {
  if (reasonCode && Object.prototype.hasOwnProperty.call(SAFE_REFUSAL_TEMPLATES, reasonCode)) {
    return SAFE_REFUSAL_TEMPLATES[reasonCode];
  }
  return fallback || '현재 상황에서는 해당 명령을 실행할 수 없습니다.';
}

export function createCommandContext(opts = {}) {
  const rankName = Object.prototype.hasOwnProperty.call(ROLE_RANKS, opts.role_rank)
    ? opts.role_rank
    : 'OWNER';
  return {
    actor_id: String(opts.actor_id || 'player'),
    user_id: String(opts.user_id || 'local-user'),
    team_id: String(opts.team_id || 'survivors'),
    role_rank: rankName,
    role_rank_value: ROLE_RANKS[rankName],
    slot_owner_rev: Number.isSafeInteger(opts.slot_owner_rev) ? opts.slot_owner_rev : 1,
  };
}

export function createCommitGateState() {
  return {
    idempotency: {},
    constraints: {},
    ticketSeq: 1,
    constraintSeq: 1,
    eventSeq: 1,
    events: [],
    stats: {
      submitted: 0,
      accepted: 0,
      rejected: 0,
      staleDiscards: 0,
      idempotentHits: 0,
      offensiveBlocked: 0,
      permissionDenied: 0,
    },
  };
}

function pushEvent(gate, simMs, utcMs, botId, type, code, detail = '') {
  gate.events.unshift({
    event_id: `evt-${gate.eventSeq++}`,
    sim_time_ms: simMs,
    utc_ms: utcMs,
    bot_id: botId,
    type,
    code,
    detail: String(detail || ''),
  });
  if (gate.events.length > 60) gate.events.length = 60;
}

export function isAttackForbidden(gate, botId) {
  const list = gate?.constraints?.[botId] || [];
  return list.some(c =>
    (c.state === 'ACTIVE' || c.state === 'PENDING_START') &&
    c.channels?.attack === 'forbid'
  );
}

export function getActiveConstraints(gate, botId) {
  return (gate?.constraints?.[botId] || []).filter(c => c.state === 'PENDING_START' || c.state === 'ACTIVE');
}

export function checkExpectedRevision(expected, current) {
  if (!expected || typeof expected !== 'object') return { ok: true };
  for (const key of ['phase', 'day', 'slot_holder_rev', 'owner_rev', 'plan_rev', 'target_rev']) {
    if (expected[key] !== undefined && current?.[key] !== undefined && expected[key] !== current[key]) {
      return { ok: false, mismatch: key, expected: expected[key], actual: current[key] };
    }
  }
  return { ok: true };
}

export function validateIntentEnvelope(botId, intent) {
  if (!intent || typeof intent !== 'object' || typeof intent.schema !== 'string') {
    return { ok: false, reason_code: 'invalid_schema' };
  }
  const pack = getBotPack(botId);
  if (!pack) return { ok: false, reason_code: 'bot_unavailable' };
  if (!pack.allowed_intents.includes(intent.schema)) {
    return { ok: false, reason_code: 'unsupported_intent' };
  }
  return { ok: true, pack };
}

export function buildConstraintRecord(gate, botId, intent, context, clockSnap, alreadyAtTarget = false) {
  const spec = intent.constraint;
  if (!spec || typeof spec !== 'object') return null;
  const startCondition = spec.start_condition || 'immediate';
  const durationMs = Math.max(0, Math.min(Number(spec.duration_ms ?? 10000), 30000));
  const arrivalTimeoutMs = Math.max(1000, Math.min(Number(intent.arrival_timeout_ms ?? 15000), 60000));
  const startsActive = startCondition === 'immediate' || (startCondition === 'on_arrival' && alreadyAtTarget);
  return {
    constraint_id: `cst-${gate.constraintSeq++}`,
    bot_id: botId,
    schema: intent.schema,
    target_id: intent.target_id || null,
    target_point: intent.target_point || null,
    clock: spec.clock || 'game_sim_ms',
    start_condition: startCondition,
    state: startsActive ? 'ACTIVE' : 'PENDING_START',
    created_sim_ms: clockSnap.game_sim_ms,
    activated_sim_ms: startsActive ? clockSnap.game_sim_ms : null,
    arrival_timeout_ms: arrivalTimeoutMs,
    arrival_remaining_ms: startsActive ? 0 : arrivalTimeoutMs,
    duration_ms: durationMs,
    remaining_ms: durationMs,
    channels: { ...(spec.channels || {}) },
    on_threat: spec.on_threat || 'evade_without_attack',
    renewal_policy: {
      max_renewals: Math.min(2, Number(spec.renewal_policy?.max_renewals ?? 2)),
      max_cumulative_ms: Math.min(30000, Number(spec.renewal_policy?.max_cumulative_ms ?? 30000)),
    },
    renewals_used: 0,
    cumulative_ms: durationMs,
    resume_policy: spec.resume_policy || 'revalidate_previous_goal',
    owner_rank: context.role_rank_value,
    owner_user_id: context.user_id,
    hold_resource: spec.hold_resource || null,
    conflict_policy: spec.conflict_policy || 'reject',
  };
}

export function stepConstraints(gate, botId, deltaSimMs, clockSnap, options = {}) {
  const list = gate?.constraints?.[botId];
  if (!list?.length) return [];
  const transitions = [];
  const arrived = Boolean(options.arrived);
  const dt = Math.max(0, Math.floor(Number(deltaSimMs || 0)));

  for (const c of list) {
    if (c.state === 'PENDING_START') {
      // Invariant 1 (T01): PENDING_START NEVER consumes duration_ms; only arrival_remaining_ms decreases.
      if (arrived) {
        c.state = 'ACTIVE';
        c.activated_sim_ms = clockSnap.game_sim_ms;
        c.arrival_remaining_ms = 0;
        transitions.push({ constraint_id: c.constraint_id, from: 'PENDING_START', to: 'ACTIVE' });
        pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'constraint', 'activated', `${c.schema} 도착 → 타이머 시작`);
      } else if (dt > 0) {
        c.arrival_remaining_ms = Math.max(0, c.arrival_remaining_ms - dt);
        if (c.arrival_remaining_ms <= 0) {
          c.state = 'FAILED_START';
          transitions.push({ constraint_id: c.constraint_id, from: 'PENDING_START', to: 'FAILED_START' });
          pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'constraint', 'failed_start', '도착 제한 시간 초과');
        }
      }
    } else if (c.state === 'ACTIVE') {
      if (c.duration_ms > 0 && dt > 0) {
        c.remaining_ms = Math.max(0, c.remaining_ms - dt);
        if (c.remaining_ms <= 0) {
          c.state = 'EXPIRED';
          transitions.push({ constraint_id: c.constraint_id, from: 'ACTIVE', to: 'EXPIRED' });
          pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'constraint', 'expired', `${c.schema} 제약 만료 → 이전 목표 재검증`);
        }
      }
    }
  }
  return transitions;
}

export function cancelBotConstraints(gate, botId, clockSnap, reason = 'cancelled') {
  const list = gate?.constraints?.[botId] || [];
  let cancelled = 0;
  for (const c of list) {
    if (c.state === 'PENDING_START' || c.state === 'ACTIVE') {
      c.state = 'CANCELLED';
      cancelled += 1;
    }
  }
  if (cancelled > 0) {
    pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'constraint', reason, `${cancelled}개 제약 해제`);
  }
  return cancelled;
}

export function renewConstraint(gate, botId, extraMs, clockSnap, requestKey = '') {
  const active = getActiveConstraints(gate, botId).find(c => c.duration_ms > 0);
  if (!active) return { accepted: false, reason_code: 'stale_state', safe_fallback_text: getSafeRefusalText('stale_state') };
  const idemKey = requestKey ? `${botId}:renew:${requestKey}` : '';
  if (idemKey && gate.idempotency[idemKey]) {
    gate.stats.idempotentHits += 1;
    return { ...gate.idempotency[idemKey], idempotent_replay: true };
  }
  const addMs = Math.max(1000, Math.floor(Number(extraMs || 10000)));
  if (active.renewals_used >= active.renewal_policy.max_renewals || active.cumulative_ms + addMs > active.renewal_policy.max_cumulative_ms) {
    gate.stats.rejected += 1;
    const res = {
      accepted: false,
      reason_code: 'renewal_limit_exceeded',
      safe_fallback_text: getSafeRefusalText('renewal_limit_exceeded'),
    };
    if (idemKey) gate.idempotency[idemKey] = res;
    return res;
  }
  active.renewals_used += 1;
  active.cumulative_ms += addMs;
  active.duration_ms += addMs;
  active.remaining_ms += addMs;
  const res = {
    accepted: true,
    constraint_id: active.constraint_id,
    remaining_ms: active.remaining_ms,
    renewals_used: active.renewals_used,
  };
  if (idemKey) gate.idempotency[idemKey] = res;
  pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'constraint', 'renewed', `+${addMs}ms (${active.renewals_used}/${active.renewal_policy.max_renewals})`);
  return res;
}

// Zone 3 Two-Phase Commit entry point: validates authority, OCC revision, idempotency, channel conflicts, then executes via adapter.
export function submitIntent(gate, adapter, botId, intent, commandContext, clockSnap, options = {}) {
  gate.stats.submitted += 1;
  const ctx = createCommandContext(commandContext);
  const requestKey = options.request_key ? String(options.request_key) : '';
  const idemTuple = requestKey ? `${botId}:${ctx.user_id}:${requestKey}` : '';

  // 1. Idempotency check (T03): duplicate request_key never resets timers or double-executes.
  if (idemTuple && gate.idempotency[idemTuple]) {
    gate.stats.idempotentHits += 1;
    return { ...gate.idempotency[idemTuple], idempotent_replay: true };
  }

  // 2. Authority check (T15): enemy team or UNAUTHORIZED rejected as permission_denied (0 safety violation).
  if (ctx.team_id !== 'survivors' || ctx.role_rank_value < ROLE_RANKS.AUTHORIZED_ALLY) {
    gate.stats.rejected += 1;
    gate.stats.permissionDenied += 1;
    const res = {
      accepted: false,
      reason_code: 'permission_denied',
      safety_violation: false,
      safe_fallback_text: getSafeRefusalText('permission_denied'),
    };
    pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'commit', 'permission_denied', ctx.actor_id);
    if (idemTuple) gate.idempotency[idemTuple] = res;
    return res;
  }

  // 3. Schema & pack whitelist validation
  const schemaCheck = validateIntentEnvelope(botId, intent);
  if (!schemaCheck.ok) {
    gate.stats.rejected += 1;
    const res = {
      accepted: false,
      reason_code: schemaCheck.reason_code,
      safe_fallback_text: getSafeRefusalText(schemaCheck.reason_code),
    };
    if (idemTuple) gate.idempotency[idemTuple] = res;
    return res;
  }

  // 4. OCC expected_revision check (T05 / T16): stale_state discards hallucinated promise reply_text!
  const currentRev = adapter.getRevision(botId);
  const revCheck = checkExpectedRevision(intent.expected_revision, currentRev);
  if (!revCheck.ok) {
    gate.stats.rejected += 1;
    gate.stats.staleDiscards += 1;
    const res = {
      accepted: false,
      reason_code: 'stale_state',
      mismatch: revCheck,
      safe_fallback_text: getSafeRefusalText('stale_state'),
      discard_reply: true,
    };
    pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'commit', 'stale_state', `${revCheck.mismatch}: ${revCheck.expected} != ${revCheck.actual}`);
    if (idemTuple) gate.idempotency[idemTuple] = res;
    return res;
  }

  // 5. Offensive channel barrier (T02): reject offensive intents while attack: "forbid" is active.
  if (intent.effect_tags?.includes('offensive') && isAttackForbidden(gate, botId)) {
    gate.stats.rejected += 1;
    gate.stats.offensiveBlocked += 1;
    const res = {
      accepted: false,
      reason_code: 'offensive_forbidden',
      safe_fallback_text: getSafeRefusalText('offensive_forbidden'),
      discard_reply: true,
    };
    pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'commit', 'offensive_forbidden', intent.schema);
    if (idemTuple) gate.idempotency[idemTuple] = res;
    return res;
  }

  // 6. Channel conflict check among active constraints
  const existing = getActiveConstraints(gate, botId);
  const incomingChannels = Object.keys(intent.constraint?.channels || {});
  if (incomingChannels.length) {
    for (const active of existing) {
      const overlaps = incomingChannels.some(ch => Object.prototype.hasOwnProperty.call(active.channels || {}, ch));
      if (!overlaps) continue;
      if (ctx.role_rank_value < active.owner_rank) {
        gate.stats.rejected += 1;
        const res = {
          accepted: false,
          reason_code: 'conflict_active_constraint',
          safe_fallback_text: getSafeRefusalText('conflict_active_constraint'),
          discard_reply: true,
        };
        if (idemTuple) gate.idempotency[idemTuple] = res;
        return res;
      }
      if (ctx.role_rank_value === active.owner_rank && intent.constraint?.conflict_policy !== 'last_writer_wins') {
        gate.stats.rejected += 1;
        const res = {
          accepted: false,
          reason_code: 'conflict_active_constraint',
          safe_fallback_text: getSafeRefusalText('conflict_active_constraint'),
          discard_reply: true,
        };
        if (idemTuple) gate.idempotency[idemTuple] = res;
        return res;
      }
      // Higher rank or explicit last_writer_wins preempts existing overlapping constraint
      active.state = 'CANCELLED';
    }
  }

  // 7. Execute via authoritative adapter (Zone 2)
  const execResult = adapter.execute(botId, intent);
  if (!execResult?.accepted) {
    gate.stats.rejected += 1;
    const code = execResult?.reason_code || 'insufficient_resources';
    const res = {
      accepted: false,
      reason_code: code,
      reason: execResult?.reason || '',
      safe_fallback_text: getSafeRefusalText(code, execResult?.reason),
      discard_reply: true,
    };
    pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'commit', code, execResult?.reason || intent.schema);
    if (idemTuple) gate.idempotency[idemTuple] = res;
    return res;
  }

  // 8. Register constraint if present
  let constraint = null;
  if (intent.constraint) {
    constraint = buildConstraintRecord(gate, botId, intent, ctx, clockSnap, Boolean(execResult.already_at_target));
    gate.constraints[botId] ||= [];
    gate.constraints[botId].push(constraint);
    if (gate.constraints[botId].length > 16) {
      gate.constraints[botId] = gate.constraints[botId].filter(c => c.state === 'PENDING_START' || c.state === 'ACTIVE').slice(-8);
    }
  }

  gate.stats.accepted += 1;
  const receipt = {
    accepted: true,
    ticket_id: execResult.ticket_id || `tkt-${gate.ticketSeq++}`,
    constraint_id: constraint?.constraint_id || null,
    constraint_state: constraint?.state || null,
    committed_effects: execResult.committed_effects || [],
    detail: execResult.detail || '',
    discard_reply: false,
  };
  pushEvent(gate, clockSnap.game_sim_ms, clockSnap.utc_server_ms, botId, 'commit', 'accepted', `${intent.schema}${constraint ? ` [${constraint.state}]` : ''}`);
  if (idemTuple) gate.idempotency[idemTuple] = receipt;
  return receipt;
}
