// Last Light PlayerBot — Zone 2 Token-0 Program AI Core (HFSM + Utility AI)
// Runs at 20~30Hz non-blocking even while waiting for LLM responses or during dialogue cooldowns.

import * as Core from './engine.js';
import * as Field from './expedition.js';
import { createTripleClock, advanceSimClock, readTripleClock, serializeClock, restoreClock } from './bot-clock.js';
import { getBotPack } from './bot-packs.js';
import {
  createCommitGateState,
  submitIntent,
  stepConstraints,
  getActiveConstraints,
  cancelBotConstraints,
  isAttackForbidden,
  renewConstraint,
} from './bot-commit-gate.js';
import { createLastLightBotAdapter } from './bot-adapter.js';

const ARRIVAL_RADIUS_PX = 42;

export function createBotRuntime({ getState, getExpedition, clockOptions = {} }) {
  const clock = createTripleClock(clockOptions);
  const gate = createCommitGateState();
  const adapter = createLastLightBotAdapter({
    getState,
    getExpedition,
    getClock: () => clock,
    getGate: () => gate,
  });

  const bots = {
    mira: { bot_id: 'mira', control_mode: 'manual', hfsm_state: 'IDLE', last_reason_code: '', last_utterance: '', active_ticket_id: null, speech_until_ms: 0, decision_cooldown_ms: 0 },
    yun: { bot_id: 'yun', control_mode: 'ai_bot', hfsm_state: 'IDLE', last_reason_code: '', last_utterance: '', active_ticket_id: null, speech_until_ms: 0, decision_cooldown_ms: 0 },
    leo: { bot_id: 'leo', control_mode: 'manual', hfsm_state: 'IDLE', last_reason_code: '', last_utterance: '', active_ticket_id: null, speech_until_ms: 0, decision_cooldown_ms: 0 },
  };
  let autoPlayMode = false;
  let autoScavCooldownMs = 0;

  function setAutoPlayMode(enabled) {
    autoPlayMode = Boolean(enabled);
    if (autoPlayMode) {
      for (const id of ['mira', 'yun', 'leo']) {
        bots[id].control_mode = 'ai_bot';
        bots[id].decision_cooldown_ms = 0;
      }
    }
    return { ok: true, autoPlayMode };
  }

  function handleAutoVisitor(state) {
    if (!autoPlayMode || !state?.visitor || state.phase !== 'day') return false;
    const v = state.visitor;
    if (v.kind === 'trade' && Array.isArray(v.offers)) {
      const useful = v.offers.find(o => o.remaining > 0 && Object.entries(o.give).every(([k, n]) => (state.inventory[k] || 0) >= n + 1));
      if (useful) Core.trade(state, useful.id);
      state.visitor = null;
      return true;
    }
    if (Array.isArray(v.options) && v.options.length) {
      const affordable = v.options.find(o => !o.cost || Object.entries(o.cost).every(([k, n]) => (state.inventory[k] || 0) >= n + 1));
      const pick = affordable || v.options[v.options.length - 1];
      if (pick) Core.chooseVisitor(state, pick.id);
      return true;
    }
    state.visitor = null;
    return true;
  }

  function buildAutoNightPlan(state) {
    const alive = (state?.characters || []).filter(c => c.alive);
    if (!alive.length) return null;
    const scav = alive.filter(c => c.health > 25 && c.fatigue < 85)
      .sort((a, b) => b.capacity - a.capacity || a.fatigue - b.fatigue)[0] || null;
    const roles = {};
    let companionId = null;
    const others = alive.filter(c => c.id !== scav?.id);
    // Keep 1 guard at shelter when possible; send 1 AI companion if 3 alive
    const guard = others.sort((a, b) => (b.health - b.fatigue) - (a.health - a.fatigue))[0] || null;
    const comp = scav && others.length >= 2
      ? others.find(c => c.id !== guard?.id && c.health > 35 && c.fatigue < 80) || null
      : null;
    if (comp) companionId = comp.id;
    for (const c of alive) {
      if (scav && c.id === scav.id) roles[c.id] = 'scavenge';
      else if (companionId && c.id === companionId) roles[c.id] = 'companion';
      else if (guard && c.id === guard.id) roles[c.id] = 'guard';
      else roles[c.id] = 'sleep';
    }
    if (!scav) {
      return { scavengerId: null, companionId: null, locationId: null, roles, loadout: {} };
    }
    const unlocked = Field.LOCATIONS.filter(l => l.unlockDay <= state.day);
    const chosenLoc = unlocked
      .map(l => ({ l, intel: Field.getLocationIntel(state, l.id) }))
      .sort((a, b) => Number(a.intel.cleared) - Number(b.intel.cleared) || a.l.riskLevel - b.l.riskLevel || a.intel.visits - b.intel.visits)[0]?.l?.id || 'cottage';
    const loadout = {};
    if ((state.inventory.crowbar || 0) > 0) loadout.crowbar = 1;
    if ((state.inventory.bandage || 0) > 1) loadout.bandage = 1;
    if ((state.inventory.parts || 0) > 3) loadout.parts = 1;
    return { scavengerId: scav.id, companionId, locationId: chosenLoc, roles, loadout };
  }

  function stepAutoScavenger(exp, deltaSimMs) {
    if (!autoPlayMode || !exp || exp.done) return;
    const p = exp.player;
    const slot = bots[p.id];
    if (p.health <= 0) return;

    autoScavCooldownMs = Math.max(0, autoScavCooldownMs - deltaSimMs);
    if (autoScavCooldownMs > 0) return;
    autoScavCooldownMs = 180;

    // 1. Immediate threat evasion
    const vis = Field.getVisibility(exp);
    const dangerNpc = exp.npcs
      .filter(n => n.health > 0 && n.state !== 'gone' && vis.npcIds.includes(n.id) && n.floor === p.floor && (n.hostile || n.aggression || n.state === 'chase' || n.state === 'attack'))
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] || null;

    if (dangerNpc && Math.abs(dangerNpc.x - p.x) < 155) {
      const awayDir = dangerNpc.x >= p.x ? -1 : 1;
      if (!p.dodge && (p.dodgeCooldown || 0) <= 0 && (p.stamina ?? 100) >= Field.COMBAT_RULES.dodgeStamina) {
        Field.dodge(exp, awayDir);
      } else {
        Field.moveTo(exp, 95, 0);
      }
      if (slot) slot.hfsm_state = 'AUTO_EVADE';
      return;
    }

    // 2. Self-bandage if injured and safe
    if (p.health <= 45 && (exp.bag.bandage || 0) > 0 && (exp.bandageCooldown || 0) <= 0 && !exp.progress && !p.climb) {
      Field.useBandage(exp);
      if (slot) slot.hfsm_state = 'AUTO_BANDAGE';
      return;
    }

    // Wait while searching or bandaging
    if (exp.progress) {
      if (slot) slot.hfsm_state = 'AUTO_SEARCHING';
      return;
    }

    // 3. Collect from any nearby already-searched safe container
    const near = Field.getNearby(exp);
    if (near.loot && near.loot.searched && !near.loot.owned && Object.values(near.loot.items || {}).some(v => v > 0)) {
      Field.takeAllLoot(exp, near.loot.id);
    }

    // 4. Check exit condition (time low, bag nearly full, or health low)
    const slotsUsed = Core.usedSlots(exp.bag);
    const shouldExtract = exp.time >= exp.duration - 24 || slotsUsed >= exp.capacity - 1 || p.health <= 32;

    // 5. Open blocking door if adjacent and unlockable
    if (p.blockedDoorId) {
      const door = (exp.doors || []).find(d => d.id === p.blockedDoorId);
      if (door && (!door.locked || (exp.bag.crowbar || 0) > 0)) {
        Field.interact(exp, { type: 'door', id: door.id });
        p.blockedDoorId = null;
        return;
      }
    }

    // 6. Pick next safe reachable loot container
    const safeTargets = shouldExtract ? [] : exp.loot.filter(l =>
      !l.owned &&
      (!l.locked || (exp.bag.crowbar || 0) > 0) &&
      (!l.searched || Object.values(l.items || {}).some(v => v > 0)) &&
      // Skip containers behind a locked door when we have no crowbar
      !((exp.doors || []).some(d => !d.open && d.locked && !(exp.bag.crowbar > 0) && d.floor === l.floor && ((p.x < d.x && l.x > d.x) || (p.x > d.x && l.x < d.x))))
    );

    if (!safeTargets.length) {
      if (near.exit) {
        Field.returnHome(exp);
        if (slot) slot.hfsm_state = 'AUTO_EXTRACTED';
      } else if (!p.target || p.target.floor !== 0 || p.target.x > 125) {
        Field.moveTo(exp, 95, 0);
        if (slot) slot.hfsm_state = 'AUTO_EXTRACTING';
      }
      return;
    }

    const best = safeTargets.sort((a, b) =>
      (Math.abs(a.floor - p.floor) * 260 + Math.abs(a.x - p.x)) -
      (Math.abs(b.floor - p.floor) * 260 + Math.abs(b.x - p.x))
    )[0];

    if (best.floor === p.floor && Math.abs(best.x - p.x) <= 74 && !p.climb) {
      if (!best.searched) {
        Field.interact(exp, { type: 'loot', id: best.id });
      } else {
        Field.takeAllLoot(exp, best.id);
      }
      if (slot) slot.hfsm_state = 'AUTO_LOOTING';
    } else if (!p.moving || !p.target || p.target.floor !== best.floor || Math.abs(p.target.x - best.x) > 20) {
      Field.moveTo(exp, best.x, best.floor);
      if (slot) slot.hfsm_state = `AUTO_MOVE:${best.id}`;
    }
  }

  function setBotControlMode(botId, mode) {
    if (!bots[botId] || !['manual', 'ai_bot'].includes(mode)) return { ok: false };
    const prev = bots[botId].control_mode;
    bots[botId].control_mode = mode;
    if (prev === 'ai_bot' && mode === 'manual') {
      detachBot(botId);
    }
    return { ok: true, bot_id: botId, control_mode: mode };
  }

  // Hot-join / manual slot takeover (T16): bumps slot_holder_rev & atomically clears constraints/tickets.
  function detachBot(botId) {
    const state = getState();
    const exp = getExpedition();
    const snap = readTripleClock(clock);
    if (state) Core.bumpGameRevision(state, 'slot_holder_rev');
    if (exp) Field.bumpExpeditionRevision(exp, 'slot_holder_rev');
    cancelBotConstraints(gate, botId, snap, 'slot_taken_by_human');
    const slot = bots[botId];
    if (slot) {
      if (slot.active_ticket_id) adapter.cancel(botId, slot.active_ticket_id);
      slot.active_ticket_id = null;
      slot.hfsm_state = 'MANUAL';
      slot.last_reason_code = 'slot_taken_by_human';
    }
    return { ok: true, revision: adapter.getRevision(botId) };
  }

  function attachBot(botId) {
    if (!bots[botId]) return { ok: false };
    bots[botId].control_mode = 'ai_bot';
    bots[botId].hfsm_state = 'IDLE';
    const state = getState();
    if (state) Core.bumpGameRevision(state, 'slot_holder_rev');
    return { ok: true, revision: adapter.getRevision(botId) };
  }

  function isResourceHeld(botId, cost) {
    if (!cost) return false;
    const state = getState();
    if (!state) return false;
    const active = getActiveConstraints(gate, botId);
    for (const c of active) {
      if (!c.hold_resource) continue;
      for (const [itemId, minQty] of Object.entries(c.hold_resource)) {
        const spend = cost[itemId] || 0;
        if (spend > 0 && ((state.inventory[itemId] || 0) - spend) < minQty) {
          return true;
        }
      }
    }
    return false;
  }

  function stepDayBot(state, botId, deltaSimMs) {
    const slot = bots[botId];
    const actor = state.characters.find(c => c.id === botId);
    const snap = readTripleClock(clock);
    stepConstraints(gate, botId, deltaSimMs, snap, { arrived: true });
    if (!actor?.alive || slot.control_mode !== 'ai_bot') {
      slot.hfsm_state = actor?.alive ? 'MANUAL' : 'DEAD';
      return;
    }

    const active = getActiveConstraints(gate, botId);
    if (active.some(c => c.schema === 'shelter.v1.pause_work')) {
      slot.hfsm_state = 'PAUSED_BY_CONSTRAINT';
      return;
    }
    if (actor.job) {
      slot.hfsm_state = `WORKING:${actor.job.actionId}`;
      return;
    }

    slot.decision_cooldown_ms = Math.max(0, slot.decision_cooldown_ms - deltaSimMs);
    if (slot.decision_cooldown_ms > 0) return;
    slot.decision_cooldown_ms = 2500; // Evaluate every 2.5s sim time (token 0)

    const pack = getBotPack(botId);
    const weights = pack?.behavior?.utility_weights || {};
    const actions = Core.getActions(state, botId).filter(a => a.available && !isResourceHeld(botId, a.cost));
    if (!actions.length) {
      slot.hfsm_state = 'IDLE';
      return;
    }

    const weather = Core.getWeather(state);
    const shelter = Core.getShelterStatus(state);
    const candidates = [];
    const push = (actionId, score) => {
      const a = actions.find(x => x.id === actionId);
      if (a) candidates.push({ actionId, score });
    };

    if (actor.health < 55) push('bandage', 120 * (weights.care || 1));
    if (actor.illness >= 35) push('heal', 115 * (weights.care || 1));
    if (actor.hunger >= 60) push('eat', 110);
    if (actor.fatigue >= 68) push('rest', 100);
    if (actor.morale < 35) push('talk', 92 * (weights.talk || 1));
    if (shelter.integrity < 75) push('repairShelter', 95 * (weights.build || 1));
    if (state.day >= 3 && !state.facilities.heater) push('buildHeater', 98 * (weights.build || 1));
    if (!state.facilities.collector && !weather.cold) push('buildCollector', 86 * (weights.build || 1));
    if ((state.inventory.meal || 0) < 3) push('cook', 88 * (weights.cook || 1));
    if ((state.inventory.water || 0) < 4) push('water', 84);
    if (weather.cold && (state.inventory.fuel || 0) < 3) push('fuel', 90 * (weights.build || 1));
    if (state.cleared < 4) push('clear', 76 * (weights.build || 1));
    if (!state.facilities.radio && state.day >= 2) push('buildRadio', 78 * (weights.build || 1));
    if (state.day >= 4 && state.facilities.radio && !state.relief?.contacted) push('contactRelief', 94);
    if (state.facilities.barricade < 2 && state.day >= 3) push('buildBarricade', 72 * (weights.build || 1));

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best) {
      slot.hfsm_state = 'IDLE';
      return;
    }
    const r = Core.performAction(state, botId, best.actionId);
    if (r.ok) {
      slot.hfsm_state = `WORKING:${best.actionId}`;
      slot.last_reason_code = 'autonomous_utility';
      const actionMeta = actions.find(a => a.id === best.actionId);
      setBotUtterance(botId, `${actionMeta?.name || best.actionId} 시작할게요.`, 4200, 'good');
    }
  }

  function stepNightCompanion(exp, deltaSimMs) {
    const bot = exp?.companion;
    if (!bot) return;
    const botId = bot.id;
    const slot = bots[botId];
    const snap = readTripleClock(clock);
    if (bot.dead || exp.done) {
      slot.hfsm_state = bot.dead ? 'DEAD' : 'DONE';
      return;
    }

    const active = getActiveConstraints(gate, botId);
    const holdConstraint = active.find(c => c.schema === 'coop_pve.v1.move_then_hold');
    let arrivedAtHold = false;
    if (holdConstraint) {
      const ticket = slot.active_ticket_id ? adapter.getActiveTicket(slot.active_ticket_id) : null;
      const tgt = ticket?.target || holdConstraint.target_point;
      if (tgt && bot.floor === tgt.floor && Math.abs(bot.x - tgt.x) <= ARRIVAL_RADIUS_PX && !bot.climb) {
        arrivedAtHold = true;
      }
    }

    const transitions = stepConstraints(gate, botId, deltaSimMs, snap, { arrived: arrivedAtHold });
    if (transitions.some(t => t.to === 'EXPIRED' || t.to === 'FAILED_START')) {
      slot.hfsm_state = 'REVALIDATING_FOLLOW';
    }

    // Blocked door handling (T07 / T08)
    if (bot.blockedDoorId) {
      const openRes = Field.companionOpenDoor(exp, bot.blockedDoorId);
      if (!openRes.ok && openRes.reason_code === 'door_locked_no_crowbar') {
        bot.route = [];
        bot.target = null;
        bot.blockedDoorId = null;
        cancelBotConstraints(gate, botId, snap, 'door_locked_no_crowbar');
        slot.hfsm_state = 'BLOCKED_RECOVER';
        slot.last_reason_code = 'door_locked_no_crowbar';
        slot.last_utterance = '잠긴 문이 막고 있어 쇠지레 없이는 못 지나가요. 여기서 대기할게요.';
        slot.speech_until_ms = snap.game_sim_ms + 4500;
        slot.decision_cooldown_ms = 2500;
        return;
      }
    }
    if (slot.hfsm_state === 'BLOCKED_RECOVER' && slot.decision_cooldown_ms > 0) {
      slot.decision_cooldown_ms = Math.max(0, slot.decision_cooldown_ms - deltaSimMs);
      return;
    }

    // Visibility-fair threat detection (Research §4.2 observe)
    const obs = adapter.observe(botId);
    const nearbyHostile = obs.visible_entities
      .filter(e => e.team === 'hostile' && e.pos.floor === bot.floor)
      .sort((a, b) => Math.abs(a.pos.x - bot.x) - Math.abs(b.pos.x - bot.x))[0] || null;
    const attackForbid = isAttackForbidden(gate, botId);
    const threatDist = nearbyHostile ? Math.abs(nearbyHostile.pos.x - bot.x) : Infinity;

    // Invariant 2 (T02): Under attack: "forbid", threat triggers ONLY evasion/hide, NEVER offensive attack!
    if (nearbyHostile && threatDist < 145) {
      const awayDir = nearbyHostile.pos.x >= bot.x ? -1 : 1;
      if (attackForbid) {
        slot.hfsm_state = 'EVADE_NO_ATTACK';
        if (!bot.dodge && (bot.dodgeCooldown || 0) <= 0 && (bot.stamina ?? 100) >= Field.COMBAT_RULES.dodgeStamina) {
          Field.companionDodge(exp, awayDir);
        } else if (!bot.hidden && !bot.dodge) {
          Field.companionHide(exp);
        }
        return;
      }
      // If attack is NOT forbidden and hostile is in melee range, defend ally
      if (threatDist <= Field.COMBAT_RULES.attackReach && (bot.attackCooldown || 0) <= 0) {
        const atk = Field.companionAttack(exp, nearbyHostile.id);
        if (atk.ok) {
          slot.hfsm_state = 'DEFEND_MELEE';
          return;
        }
      }
    }

    // Active hold constraint (T01): wait in position once ACTIVE, or keep moving while PENDING_START
    const currentHold = getActiveConstraints(gate, botId).find(c => c.schema === 'coop_pve.v1.move_then_hold');
    if (currentHold) {
      if (currentHold.state === 'ACTIVE') {
        slot.hfsm_state = `HOLDING(${Math.ceil(currentHold.remaining_ms / 1000)}s)`;
        bot.route = [];
        bot.target = null;
        bot.moving = false;
        return;
      }
      slot.hfsm_state = 'MOVING_TO_HOLD';
      return;
    }

    // Support priority: heal player when HP <= 35% and bandage available
    const pack = getBotPack(botId);
    const healThreshold = pack?.behavior?.heal_threshold_hp ?? 35;
    if (exp.player.health > 0 && exp.player.health <= healThreshold && (exp.bag.bandage || 0) > 0 && (bot.bandageCooldown || 0) <= 0) {
      const sameFloor = bot.floor === exp.player.floor;
      if (sameFloor && Math.abs(bot.x - exp.player.x) <= 95) {
        const res = Field.companionBandageAlly(exp);
        if (res.ok) {
          slot.hfsm_state = 'SUPPORT_HEAL';
          return;
        }
      } else if (!bot.moving) {
        Field.moveCompanionTo(exp, exp.player.x, exp.player.floor, { sneak: true });
        slot.hfsm_state = 'MOVING_TO_HEAL';
        return;
      }
    }

    // Default behavior: Follow player at pack follow_distance_px
    const followDist = pack?.behavior?.follow_distance_px ?? 72;
    const distToPlayer = Math.abs(bot.x - exp.player.x);
    if (bot.floor !== exp.player.floor || distToPlayer > followDist + 24) {
      const desiredX = exp.player.x - (exp.player.facing || 1) * followDist;
      if (!bot.target || bot.target.floor !== exp.player.floor || Math.abs(bot.target.x - desiredX) > 28) {
        Field.moveCompanionTo(exp, desiredX, exp.player.floor, { sneak: exp.player.sneaking });
      }
      slot.hfsm_state = 'FOLLOWING';
    } else {
      bot.sneaking = exp.player.sneaking;
      slot.hfsm_state = 'GUARDING_ALLY';
    }
  }

  function step(deltaSeconds) {
    const state = getState();
    const exp = getExpedition();
    if (!state) return;
    const deltaSimMs = advanceSimClock(clock, deltaSeconds, {
      paused: Boolean(state.paused),
      speed: state.speed || 1,
    });
    if (deltaSimMs <= 0) return;

    if (state.phase === 'day') {
      if (autoPlayMode && state.visitor) handleAutoVisitor(state);
      for (const botId of ['mira', 'yun', 'leo']) stepDayBot(state, botId, deltaSimMs);
    } else if (state.phase === 'expedition' && exp) {
      if (autoPlayMode) stepAutoScavenger(exp, deltaSimMs);
      if (exp.companion) stepNightCompanion(exp, deltaSimMs);
    }
  }

  function commitIntent(botId, intent, commandContext, options = {}) {
    const snap = readTripleClock(clock);
    const receipt = submitIntent(gate, adapter, botId, intent, commandContext, snap, options);
    const slot = bots[botId];
    if (slot) {
      if (receipt.accepted) {
        slot.active_ticket_id = receipt.ticket_id;
        slot.last_reason_code = 'accepted';
      } else {
        slot.last_reason_code = receipt.reason_code || 'rejected';
      }
    }
    return receipt;
  }

  function setBotUtterance(botId, text, durationMs = 4800, tone = 'info') {
    const slot = bots[botId];
    if (!slot) return;
    const snap = readTripleClock(clock);
    const nowMono = snap.mono_proc_ms;
    slot.last_utterance = String(text || '');
    slot.speech_tone = tone;
    slot.speech_created_mono_ms = nowMono;
    slot.speech_until_mono_ms = nowMono + durationMs;
    slot.speech_until_ms = snap.game_sim_ms + durationMs;
  }

  function getActiveToasts(nowMono = readTripleClock(clock).mono_proc_ms) {
    const out = {};
    for (const [id, slot] of Object.entries(bots)) {
      if (slot.last_utterance && (slot.speech_until_mono_ms || 0) > nowMono) {
        out[id] = {
          text: slot.last_utterance,
          createdAt: slot.speech_created_mono_ms || nowMono,
          expiresAt: slot.speech_until_mono_ms,
          tone: slot.speech_tone || 'info',
        };
      }
    }
    return out;
  }

  function getDebugSnapshot(botId) {
    const snap = readTripleClock(clock);
    const slot = bots[botId] || bots.yun;
    const active = getActiveConstraints(gate, botId).map(c => ({
      id: c.constraint_id,
      schema: c.schema,
      state: c.state,
      remaining_ms: c.remaining_ms,
      arrival_remaining_ms: c.arrival_remaining_ms,
      channels: c.channels,
      renewals_used: c.renewals_used,
    }));
    return {
      bot_id: botId,
      control_mode: slot.control_mode,
      hfsm_state: slot.hfsm_state,
      last_reason_code: slot.last_reason_code,
      last_utterance: slot.last_utterance,
      active_constraints: active,
      attack_forbidden: isAttackForbidden(gate, botId),
      revision: adapter.getRevision(botId),
      clock: snap,
      gate_stats: { ...gate.stats },
      recent_events: gate.events.slice(0, 8),
    };
  }

  return {
    clock,
    gate,
    adapter,
    bots,
    step,
    commitIntent,
    renewConstraint: (botId, extraMs, requestKey) => renewConstraint(gate, botId, extraMs, readTripleClock(clock), requestKey),
    cancelBotConstraints: (botId, reason) => cancelBotConstraints(gate, botId, readTripleClock(clock), reason),
    setBotControlMode,
    setAutoPlayMode,
    isAutoPlayMode: () => autoPlayMode,
    buildAutoNightPlan,
    handleAutoVisitor,
    detachBot,
    attachBot,
    setBotUtterance,
    getActiveToasts,
    getDebugSnapshot,
    serialize: () => ({
      clock: serializeClock(clock),
      modes: Object.fromEntries(Object.entries(bots).map(([k, v]) => [k, v.control_mode])),
    }),
    restore: data => {
      if (!data) return;
      const restored = restoreClock(data.clock, clockOptions);
      clock.game_sim_ms = restored.game_sim_ms;
      clock.sim_ticks = restored.sim_ticks;
      if (data.modes) {
        for (const [id, mode] of Object.entries(data.modes)) {
          if (bots[id] && ['manual', 'ai_bot'].includes(mode)) bots[id].control_mode = mode;
        }
      }
    },
  };
}
