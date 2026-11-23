// Last Light PlayerBot — 5-Method Authoritative Adapter (Research §4.2 ForgeBotAdapter)
// Implements: observe, capabilities, affordances, execute, cancel (+ getRevision)
// Enforces: visibility fairness (no unseen NPC / unsearched container leakage) & offensive channel hard block.

import * as Core from './engine.js';
import * as Field from './expedition.js';
import { isAttackForbidden } from './bot-commit-gate.js';

const ARRIVAL_RADIUS_PX = 42;

function resolveNightTarget(exp, targetId, targetPoint) {
  if (targetPoint && Number.isFinite(targetPoint.x) && Number.isInteger(targetPoint.floor)) {
    return { x: targetPoint.x, floor: targetPoint.floor, id: targetId || 'point' };
  }
  if (!targetId) return null;
  if (targetId === 'exit') return { x: 110, floor: 0, id: 'exit' };
  if (targetId === 'player') return { x: exp.player.x, floor: exp.player.floor, id: 'player' };
  const door = (exp.doors || []).find(d => d.id === targetId);
  if (door) return { x: Math.max(70, door.x - 28), floor: door.floor, id: door.id };
  const stair = (exp.stairs || []).find(s => s.id === targetId);
  if (stair) return { x: stair.x, floor: stair.from, id: stair.id };
  const hide = (exp.hides || []).find(h => h.id === targetId);
  if (hide) return { x: hide.x, floor: hide.floor, id: hide.id };
  const loot = (exp.loot || []).find(l => l.id === targetId);
  if (loot) return { x: loot.x, floor: loot.floor, id: loot.id };
  if (targetId === 'nearest_door' && exp.doors?.length) {
    const bot = exp.companion || exp.player;
    const d = [...exp.doors].sort((a, b) => (Math.abs(a.floor - bot.floor) * 250 + Math.abs(a.x - bot.x)) - (Math.abs(b.floor - bot.floor) * 250 + Math.abs(b.x - bot.x)))[0];
    if (d) return { x: Math.max(70, d.x - 28), floor: d.floor, id: d.id };
  }
  if (targetId === 'floor_2' || targetId === 'floor_1') {
    const floor = targetId === 'floor_2' ? 1 : 0;
    const doorOnFloor = (exp.doors || []).find(d => d.floor === floor);
    if (doorOnFloor) return { x: Math.max(70, doorOnFloor.x - 28), floor, id: doorOnFloor.id };
    return { x: 320, floor, id: targetId };
  }
  return null;
}

export function createLastLightBotAdapter({ getState, getExpedition, getClock, getGate }) {
  let ticketSeq = 1;
  const activeTickets = new Map();

  function getRevision(botId) {
    const state = getState();
    const exp = getExpedition();
    if (state?.phase === 'expedition' && exp) {
      return {
        ...Field.getExpeditionRevision(exp),
        day: state.day,
        bot_id: botId,
      };
    }
    return {
      ...Core.getGameRevision(state),
      bot_id: botId,
    };
  }

  // 1. observe(botId): strictly filtered to authoritative visible/known facts ONLY.
  function observe(botId) {
    const state = getState();
    const exp = getExpedition();
    const clock = getClock();
    const simTimeMs = clock?.game_sim_ms ?? 0;

    if (state?.phase === 'expedition' && exp) {
      const bot = exp.companion?.id === botId ? exp.companion : exp.player;
      const vis = Field.getVisibility(exp);
      const nav = Field.getNavigation(exp);
      // Visibility fairness: ONLY return NPCs inside visibleSegments (vis.npcIds), NEVER unseen NPCs!
      const visibleEntities = [
        {
          id: exp.player.id,
          kind: 'ally_player',
          team: 'survivors',
          pos: { x: Math.round(exp.player.x), floor: exp.player.floor },
          hp_ratio: Math.round((exp.player.health / 100) * 100) / 100,
          tags: [exp.player.hidden ? 'hidden' : 'exposed', exp.player.sneaking ? 'sneaking' : 'normal'],
        },
        ...exp.npcs
          .filter(npc => npc.health > 0 && npc.state !== 'gone' && vis.npcIds.includes(npc.id))
          .map(npc => ({
            id: npc.id,
            name: npc.name,
            kind: npc.kind,
            team: npc.hostile || npc.aggression ? 'hostile' : 'neutral',
            pos: { x: Math.round(npc.x), floor: npc.floor },
            hp_ratio: Math.round((npc.health / npc.maxHealth) * 100) / 100,
            state: npc.state,
            tags: [npc.hostile || npc.aggression ? 'hostile' : 'resident'],
          })),
      ];
      return {
        sim_time_ms: simTimeMs,
        phase: 'expedition',
        location_id: exp.locationId,
        location_name: exp.name,
        time_remaining_sec: Math.max(0, Math.ceil(exp.duration - exp.time)),
        self_state: {
          id: bot.id,
          name: bot.name,
          pos: { x: Math.round(bot.x), floor: bot.floor },
          hp_ratio: Math.round((bot.health / 100) * 100) / 100,
          stamina: Math.round(bot.stamina ?? 100),
          hidden: Boolean(bot.hidden),
          sneaking: Boolean(bot.sneaking),
          blocked_door_id: bot.blockedDoorId || null,
          resources: { ...exp.bag },
        },
        visible_entities: visibleEntities,
        objectives: [
          { id: 'scavenge', status: 'active', progress: nav.exploredPercent },
          { id: 'extract', status: nav.exit.reached ? 'ready' : 'pending', progress: nav.exit.reached ? 100 : 0 },
        ],
        known_facts: [
          `location:${exp.locationId}`,
          `floor:${bot.floor + 1}`,
          `explored_pct:${nav.exploredPercent}`,
          `bag_slots:${Core.usedSlots(exp.bag)}/${exp.capacity}`,
        ],
      };
    }

    const actor = state?.characters?.find(c => c.id === botId) || state?.characters?.[0];
    const weather = state ? Core.getWeather(state) : { cold: false, label: '온화', fuelNeeded: 0 };
    const shelter = state ? Core.getShelterStatus(state) : { integrity: 100, label: '튼튼함' };
    const relief = state ? Core.getReliefStatus(state) : { completed: 0, total: 3 };
    return {
      sim_time_ms: simTimeMs,
      phase: state?.phase || 'day',
      day: state?.day || 1,
      clock_min: Math.round(state?.clock || 360),
      weather,
      shelter_integrity: shelter.integrity,
      self_state: actor ? {
        id: actor.id,
        name: actor.name,
        role: actor.role,
        alive: actor.alive,
        hp_ratio: Math.round((actor.health / 100) * 100) / 100,
        hunger: Math.round(actor.hunger),
        fatigue: Math.round(actor.fatigue),
        morale: Math.round(actor.morale),
        illness: Math.round(actor.illness),
        job: actor.job?.actionId || null,
        queue: [...(actor.queue || [])],
        resources: { ...(state?.inventory || {}) },
      } : {},
      visible_entities: (state?.characters || []).map(c => ({
        id: c.id,
        name: c.name,
        kind: 'survivor',
        team: 'survivors',
        alive: c.alive,
        hp_ratio: Math.round((c.health / 100) * 100) / 100,
        hunger: Math.round(c.hunger),
        fatigue: Math.round(c.fatigue),
        illness: Math.round(c.illness),
        morale: Math.round(c.morale),
        job: c.job?.actionId || null,
      })),
      objectives: [
        { id: 'survive_12_days', status: 'active', progress: Math.round(((state?.day || 1) / 12) * 100) },
        { id: 'relief_arc', status: relief.completed >= 3 ? 'complete' : 'active', progress: Math.round((relief.completed / 3) * 100) },
      ],
      known_facts: [
        `day:${state?.day || 1}/12`,
        `weather:${weather.label}`,
        `shelter_integrity:${shelter.integrity}`,
        `meal:${state?.inventory?.meal || 0}`,
        `water:${state?.inventory?.water || 0}`,
        `wood:${state?.inventory?.wood || 0}`,
        `parts:${state?.inventory?.parts || 0}`,
        `fuel:${state?.inventory?.fuel || 0}`,
      ],
    };
  }

  // 2. capabilities(botId): explicit effect_tags (offensive / defensive / support / utility)
  function capabilities(botId) {
    const state = getState();
    const exp = getExpedition();
    const gate = getGate();
    const attackBlocked = isAttackForbidden(gate, botId);

    if (state?.phase === 'expedition' && exp && exp.companion?.id === botId) {
      const bot = exp.companion;
      return [
        { ability_id: 'move', effect_tags: ['utility'], range: 1200, cost: {}, cooldown_rem_ms: 0, ready: !bot.dead && !bot.dodge },
        { ability_id: 'dodge', effect_tags: ['defensive'], range: 120, cost: { stamina: Field.COMBAT_RULES.dodgeStamina }, cooldown_rem_ms: Math.round((bot.dodgeCooldown || 0) * 1000), ready: !bot.dead && !bot.dodge && (bot.dodgeCooldown || 0) <= 0 && (bot.stamina ?? 100) >= Field.COMBAT_RULES.dodgeStamina },
        { ability_id: 'hide', effect_tags: ['defensive'], range: 82, cost: {}, cooldown_rem_ms: 0, ready: !bot.dead },
        { ability_id: 'bandage_ally', effect_tags: ['support'], range: 110, cost: { bandage: 1 }, cooldown_rem_ms: Math.round((bot.bandageCooldown || 0) * 1000), ready: !bot.dead && (exp.bag.bandage || 0) > 0 && (bot.bandageCooldown || 0) <= 0 },
        { ability_id: 'throw_distraction', effect_tags: ['utility'], range: Field.DISTRACTION_RULES.range, cost: { parts: 1 }, cooldown_rem_ms: Math.round((bot.distractionCooldown || 0) * 1000), ready: !bot.dead && (exp.bag.parts || 0) > 0 && (bot.distractionCooldown || 0) <= 0 },
        { ability_id: 'melee_attack', effect_tags: ['offensive'], range: Field.COMBAT_RULES.attackReach, cost: { stamina: Field.COMBAT_RULES.attackStamina }, cooldown_rem_ms: Math.round((bot.attackCooldown || 0) * 1000), ready: !attackBlocked && !bot.dead && (bot.attackCooldown || 0) <= 0 && (bot.stamina ?? 100) >= Field.COMBAT_RULES.attackStamina },
      ];
    }

    if (!state || state.phase !== 'day') return [];
    return (Core.getActions(state, botId) || []).map(a => ({
      ability_id: a.id,
      name: a.name,
      effect_tags: a.category === 'survival' ? ['support'] : ['utility'],
      range: 0,
      cost: { ...a.cost },
      cooldown_rem_ms: 0,
      ready: Boolean(a.available),
      queueable: Boolean(a.queueable),
      reason: a.reason || '',
    }));
  }

  // 3. affordances(botId): ONLY objects within visibility/explored knowledge (no unseen contents!)
  function affordances(botId) {
    const state = getState();
    const exp = getExpedition();
    if (state?.phase === 'expedition' && exp) {
      const vis = Field.getVisibility(exp);
      const list = [];
      for (const door of (exp.doors || [])) {
        if (!vis.doorIds.includes(door.id)) continue;
        list.push({ object_id: door.id, kind: 'door', label: door.label, floor: door.floor, x: door.x, actions: door.open ? [] : ['open'], locked: Boolean(door.locked) });
      }
      for (const loot of (exp.loot || [])) {
        if (!vis.lootIds.includes(loot.id)) continue;
        // Never leak unsearched container contents!
        list.push({ object_id: loot.id, kind: 'loot', label: loot.label, floor: loot.floor, x: loot.x, actions: loot.searched ? ['inspect'] : ['search'], locked: Boolean(loot.locked), owned: Boolean(loot.owned), searched: Boolean(loot.searched) });
      }
      for (const hide of (exp.hides || [])) {
        list.push({ object_id: hide.id, kind: 'hide', label: hide.label, floor: hide.floor, x: hide.x, actions: ['hide'], locked: false });
      }
      list.push({ object_id: 'exit', kind: 'exit', label: '출입구', floor: 0, x: 110, actions: ['extract'], locked: false });
      return list;
    }
    return [
      { object_id: 'kitchen', kind: 'station', actions: ['cook', 'eat'], locked: false },
      { object_id: 'workshop', kind: 'station', actions: ['fuel', 'craftCrowbar', 'craftKnife'], locked: false },
      { object_id: 'bed', kind: 'station', actions: ['rest', 'heal', 'bandage'], locked: false },
      { object_id: 'door', kind: 'station', actions: ['buildBarricade', 'repairShelter', 'prepareEvacuation'], locked: false },
      { object_id: 'radio', kind: 'station', actions: ['talk', 'buildRadio', 'contactRelief'], locked: false },
    ];
  }

  // 4. execute(botId, intent): runs through exact authoritative game rules.
  function execute(botId, intent) {
    const state = getState();
    const exp = getExpedition();
    const gate = getGate();
    const ticketId = `tkt-${ticketSeq++}`;

    // Hard offensive barrier directly at adapter boundary (Research §3.2 Invariant 2)
    if (intent.effect_tags?.includes('offensive') && isAttackForbidden(gate, botId)) {
      return { accepted: false, ticket_id: '', reason_code: 'offensive_forbidden', reason: '공격 금지 제약이 활성 중입니다.' };
    }

    // Night expedition intents (coop_pve.v1.*)
    if (intent.schema.startsWith('coop_pve.v1.')) {
      if (state?.phase !== 'expedition' || !exp || !exp.companion || exp.companion.id !== botId || exp.companion.dead) {
        return { accepted: false, ticket_id: '', reason_code: 'bot_unavailable', reason: '야간 동행 중인 동료 봇이 아닙니다.' };
      }
      const bot = exp.companion;

      if (intent.schema === 'coop_pve.v1.move_then_hold') {
        const resolved = resolveNightTarget(exp, intent.target_id || 'nearest_door', intent.target_point);
        if (!resolved) return { accepted: false, ticket_id: '', reason_code: 'invalid_schema', reason: '이동 목적지를 찾을 수 없습니다.' };
        const alreadyAtTarget = bot.floor === resolved.floor && Math.abs(bot.x - resolved.x) <= ARRIVAL_RADIUS_PX && !bot.climb;
        if (!alreadyAtTarget) {
          Field.moveCompanionTo(exp, resolved.x, resolved.floor, { sneak: Boolean(intent.sneak) });
        } else {
          Field.stopCompanion(exp);
        }
        const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, target: resolved, state: 'RUNNING', committed_effects: [] };
        activeTickets.set(ticketId, ticket);
        return { accepted: true, ticket_id: ticketId, already_at_target: alreadyAtTarget, detail: `${resolved.floor + 1}층 ${resolved.id}` };
      }

      if (intent.schema === 'coop_pve.v1.follow') {
        bot.sneaking = Boolean(intent.sneak ?? exp.player.sneaking);
        const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, state: 'RUNNING', committed_effects: [] };
        activeTickets.set(ticketId, ticket);
        return { accepted: true, ticket_id: ticketId, already_at_target: true, detail: '플레이어 동행' };
      }

      if (intent.schema === 'coop_pve.v1.set_engagement') {
        const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, state: 'RUNNING', committed_effects: [] };
        activeTickets.set(ticketId, ticket);
        return { accepted: true, ticket_id: ticketId, already_at_target: true, detail: '교전 규칙 적용' };
      }

      if (intent.schema === 'coop_pve.v1.support_ally') {
        if (intent.mode === 'distraction') {
          const r = Field.companionThrowDistraction(exp, intent.target_x ?? (bot.x + bot.facing * 150), bot.floor);
          if (!r.ok) return { accepted: false, ticket_id: '', reason_code: 'insufficient_resources', reason: r.reason };
          const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, state: 'SUCCESS', committed_effects: ['consumed_part_1', 'emitted_distraction'] };
          activeTickets.set(ticketId, ticket);
          return { accepted: true, ticket_id: ticketId, committed_effects: ticket.committed_effects, detail: '소음 유인 투척' };
        }
        const r = Field.companionBandageAlly(exp);
        if (!r.ok) {
          // If too far, move toward player first as an active support ticket
          if ((exp.bag.bandage || 0) > 0 && exp.player.health < 100) {
            Field.moveCompanionTo(exp, exp.player.x, exp.player.floor, { sneak: true });
            const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, state: 'RUNNING', committed_effects: [] };
            activeTickets.set(ticketId, ticket);
            return { accepted: true, ticket_id: ticketId, detail: '동료 치료 이동' };
          }
          return { accepted: false, ticket_id: '', reason_code: 'insufficient_resources', reason: r.reason };
        }
        const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, state: 'SUCCESS', committed_effects: ['consumed_bandage_1', `healed_${Math.round(r.healed)}`] };
        activeTickets.set(ticketId, ticket);
        return { accepted: true, ticket_id: ticketId, committed_effects: ticket.committed_effects, detail: '동료 응급처치 완료' };
      }

      if (intent.schema === 'coop_pve.v1.extract') {
        Field.moveCompanionTo(exp, 110, 0, { sneak: true });
        const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, target: { x: 110, floor: 0, id: 'exit' }, state: 'RUNNING', committed_effects: [] };
        activeTickets.set(ticketId, ticket);
        return { accepted: true, ticket_id: ticketId, already_at_target: bot.floor === 0 && bot.x <= 140, detail: '출입구 집결' };
      }

      if (intent.schema === 'coop_pve.v1.scavenge_target') {
        const vis = Field.getVisibility(exp);
        const candidates = exp.loot.filter(l => vis.lootIds.includes(l.id) && !l.searched && (!l.owned || intent.allow_owned));
        const chosen = (intent.target_id ? candidates.find(l => l.id === intent.target_id) : candidates[0]) || null;
        if (!chosen) return { accepted: false, ticket_id: '', reason_code: 'stale_state', reason: '시야 안에 조사할 수 있는 상자가 없습니다.' };
        Field.moveCompanionTo(exp, chosen.x, chosen.floor, { sneak: true });
        const ticket = { ticket_id: ticketId, bot_id: botId, schema: intent.schema, target: { x: chosen.x, floor: chosen.floor, id: chosen.id }, state: 'RUNNING', committed_effects: [] };
        activeTickets.set(ticketId, ticket);
        return { accepted: true, ticket_id: ticketId, detail: `${chosen.label} 이동` };
      }
    }

    // Day shelter intents (shelter.v1.*)
    if (intent.schema.startsWith('shelter.v1.')) {
      if (state?.phase !== 'day') {
        return { accepted: false, ticket_id: '', reason_code: 'stale_state', reason: '낮 은신처 단계에서만 실행할 수 있습니다.' };
      }
      const actor = state.characters.find(c => c.id === botId);
      if (!actor?.alive) return { accepted: false, ticket_id: '', reason_code: 'bot_unavailable', reason: '활동 가능한 생존자가 아닙니다.' };

      if (intent.schema === 'shelter.v1.status_brief') {
        return { accepted: true, ticket_id: ticketId, detail: '현황 보고' };
      }
      if (intent.schema === 'shelter.v1.hold_resource' || intent.schema === 'shelter.v1.pause_work') {
        if (intent.schema === 'shelter.v1.pause_work' && actor.job) {
          Core.cancelJob(state, botId);
        }
        return { accepted: true, ticket_id: ticketId, already_at_target: true, detail: intent.schema === 'shelter.v1.hold_resource' ? '자원 보존 제약 등록' : '작업 일시 보류' };
      }
      if (intent.schema === 'shelter.v1.care_ally') {
        const targetId = intent.target_id || state.characters.filter(c => c.alive && c.id !== botId).sort((a, b) => a.health - b.health)[0]?.id;
        if (!targetId) return { accepted: false, ticket_id: '', reason_code: 'stale_state', reason: '치료할 동료가 없습니다.' };
        const kind = intent.care_kind === 'heal' ? 'heal' : 'bandage';
        const r = Core.performCare(state, botId, targetId, kind);
        if (!r.ok) return { accepted: false, ticket_id: '', reason_code: 'insufficient_resources', reason: r.reason };
        return { accepted: true, ticket_id: ticketId, committed_effects: [`reserved_${kind}_for_${targetId}`], detail: `${targetId} 치료 착수` };
      }
      if (intent.schema === 'shelter.v1.assign_task') {
        const actionId = intent.action_id;
        if (!actionId) return { accepted: false, ticket_id: '', reason_code: 'invalid_schema', reason: '작업 ID가 필요합니다.' };
        const r = actor.job ? Core.enqueueAction(state, botId, actionId) : Core.performAction(state, botId, actionId);
        if (!r.ok) return { accepted: false, ticket_id: '', reason_code: 'insufficient_resources', reason: r.reason };
        return { accepted: true, ticket_id: ticketId, committed_effects: [actor.job ? `queued_${actionId}` : `started_${actionId}`], detail: `${actionId} ${actor.job ? '예약' : '착수'}` };
      }
    }

    return { accepted: false, ticket_id: '', reason_code: 'unsupported_intent', reason: '지원하지 않는 명령입니다.' };
  }

  // 5. cancel(botId, ticketId): honest reporting of partial effects & non-interruptible boundaries (T06).
  function cancel(botId, ticketId) {
    const state = getState();
    const exp = getExpedition();
    const ticket = activeTickets.get(ticketId) || null;
    if (ticket) {
      if (ticket.committed_effects?.length) {
        ticket.state = 'HALTED';
        return { status: 'cancelled_after_effect', committed_effects: [...ticket.committed_effects] };
      }
      ticket.state = 'HALTED';
    }
    if (state?.phase === 'expedition' && exp?.companion?.id === botId) {
      const stopRes = Field.stopCompanion(exp);
      return { status: stopRes.status || 'cancelled_cleanly', committed_effects: stopRes.committed_effects || [] };
    }
    if (state?.phase === 'day') {
      const actor = state.characters.find(c => c.id === botId);
      if (actor?.job) {
        Core.cancelJob(state, botId);
        return { status: 'cancelled_cleanly', committed_effects: [] };
      }
    }
    return { status: 'cancelled_cleanly', committed_effects: [] };
  }

  return {
    observe,
    capabilities,
    affordances,
    execute,
    cancel,
    getRevision,
    getActiveTicket: id => activeTickets.get(id) || null,
  };
}
