import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, usedSlots, createGame, endDay, beginNight, finishNight, nextDay, isValidSave } from '../dist/engine.js';
import {
  LOCATIONS, createExpedition, stepExpedition, moveTo, interact,
  takeLoot, dropItem, attack, returnHome, getNearby, expeditionResult, isValidExpedition,
  getVisibility, useBandage, takeAllLoot, getLocationIntel, restoreExpedition,
  COMBAT_RULES, dodge, getEncounter, resolveEncounter,
  DISTRACTION_RULES, getDistraction, throwDistraction, getNavigation
} from '../dist/expedition.js';

function makeState(locationId = 'cottage', loadout = {}, capacity = 12) {
  return {
    seed: 43210, day: 5,
    characters: [{ id: 'mira', name: '미라', capacity, health: 100, fatigue: 10, alive: true }],
    inventory: { wood: 10, meal: 3 }, locations: {},
    nightPlan: { scavengerId: 'mira', locationId, loadout: { ...loadout } }
  };
}
function create(locationId = 'cottage', loadout = {}, capacity = 12) {
  const state = makeState(locationId, loadout, capacity);
  return { state, exp: createExpedition({}, state) };
}
function advance(exp, seconds, input = {}) {
  for (let elapsed = 0; elapsed < seconds - 1e-7 && !exp.done; elapsed += 0.1) stepExpedition(exp, 0.1, input);
}
function arrive(exp, x, floor) {
  moveTo(exp, x, floor);
  for (let i = 0; i < 900 && !exp.done; i++) {
    stepExpedition(exp, 0.1, {});
    if (!exp.player.route.length && !exp.player.climb) break;
  }
  assert.equal(exp.player.floor, floor);
  assert.ok(Math.abs(exp.player.x - x) < 1, `expected x=${x}; got ${exp.player.x}`);
}
function openLoot(exp, id) {
  const loot = exp.loot.find(item => item.id === id);
  assert.ok(loot);
  exp.player.x = loot.x;
  exp.player.floor = loot.floor;
  exp.player.route = [];
  exp.player.climb = null;
  const result = interact(exp);
  assert.equal(result.ok, true, result.reason);
  advance(exp, 4.1);
  assert.equal(exp.activeLootId, id);
  return loot;
}

// Public contracts, graph movement, and time behavior.
test('five original locations have unique IDs, unlock rules and valid item data', () => {
  assert.equal(LOCATIONS.length, 5);
  assert.equal(new Set(LOCATIONS.map(entry => entry.id)).size, 5);
  for (const location of LOCATIONS) {
    const { exp } = create(location.id);
    assert.ok(isValidExpedition(exp), location.id);
    assert.equal(exp.duration, 100);
    for (const loot of exp.loot) for (const id of Object.keys(loot.items)) assert.ok(Object.hasOwn(ITEMS, id));
  }
});

test('state night plan wins over a stale context and loadout is not removed twice', () => {
  const state = makeState('cottage', { crowbar: 1 });
  const before = JSON.stringify(state.inventory);
  const exp = createExpedition({ locationId: 'warehouse', loadout: { knife: 1 } }, state);
  assert.equal(exp.locationId, 'cottage');
  assert.deepEqual(exp.bag, { crowbar: 1 });
  assert.equal(JSON.stringify(state.inventory), before);
});

test('pointer route finds stairs through all three floors and back to the exit', () => {
  const { exp } = create();
  arrive(exp, 1020, 2);
  assert.ok(exp.time < 30);
  arrive(exp, 80, 0);
  assert.equal(returnHome(exp).ok, true);
  assert.equal(exp.result.escaped, true);
  assert.equal(exp.result.late, false);
});

test('walking and sneaking differ in speed and noise', () => {
  const normal = create().exp;
  const quiet = create().exp;
  advance(normal, 1, { right: true });
  advance(quiet, 1, { right: true, sneak: true });
  assert.ok(normal.player.x > quiet.player.x + 50);
  assert.ok(normal.player.noise > quiet.player.noise);
});

test('up input automatically approaches a stair, then completes the climb', () => {
  const { exp } = create();
  stepExpedition(exp, 0.1, { up: true });
  advance(exp, 4);
  assert.equal(exp.player.floor, 1);
  assert.equal(exp.player.x, 280);
});

test('large and negative frame deltas are bounded', () => {
  const { exp } = create();
  stepExpedition(exp, 100, {});
  assert.equal(exp.time, 0.1);
  stepExpedition(exp, -10, {});
  assert.equal(exp.time, 0.1);
});

// Search and inventory transactions.
test('search takes time and movement cancels an unfinished search', () => {
  const { exp } = create();
  const loot = exp.loot[0];
  exp.player.x = loot.x;
  assert.equal(interact(exp).ok, true);
  assert.ok(exp.progress);
  assert.equal(exp.activeLootId, null);
  advance(exp, 0.5);
  stepExpedition(exp, 0.1, { right: true });
  assert.equal(exp.progress, null);
  assert.equal(loot.searched, false);
});

test('locked loot requires a crowbar and opening persists', () => {
  const { state, exp } = create();
  const locked = exp.loot.find(loot => loot.locked);
  exp.player.x = locked.x;
  exp.player.floor = locked.floor;
  assert.equal(interact(exp).ok, false);
  assert.equal(locked.locked, true);
  exp.bag.crowbar = 1;
  assert.equal(interact(exp).ok, true);
  assert.equal(exp.progress.total, 3.8);
  advance(exp, 4);
  assert.equal(locked.locked, false);
  assert.equal(state.locations.cottage.opened[locked.id], true);
  const next = createExpedition({}, state);
  assert.equal(next.loot.find(loot => loot.id === locked.id).locked, false);
});

test('loot acquisition enforces slot capacity and leaves both inventories unchanged on failure', () => {
  const { exp } = create('cottage', { knife: 1 }, 1);
  const loot = openLoot(exp, 'cottage_kitchen');
  const before = JSON.stringify({ bag: exp.bag, items: loot.items });
  assert.equal(takeLoot(exp, loot.id, 'raw', 1).ok, false);
  assert.equal(JSON.stringify({ bag: exp.bag, items: loot.items }), before);
  assert.equal(usedSlots(exp.bag), 1);
});

test('invalid quantities, inherited item names and remote looting are rejected atomically', () => {
  const { exp } = create();
  const loot = openLoot(exp, 'cottage_kitchen');
  const before = JSON.stringify({ bag: exp.bag, items: loot.items });
  for (const qty of [-1, 0, 0.5, Infinity, NaN, 999]) assert.equal(takeLoot(exp, loot.id, 'raw', qty).ok, false);
  assert.equal(takeLoot(exp, loot.id, 'constructor', 1).ok, false);
  assert.equal(takeLoot(exp, loot.id, '__proto__', 1).ok, false);
  exp.player.x = 110;
  assert.equal(takeLoot(exp, loot.id, 'raw', 1).ok, false);
  assert.equal(JSON.stringify({ bag: exp.bag, items: loot.items }), before);
});

test('taking all of a resource stays depleted on later visits', () => {
  const { state, exp } = create();
  const loot = openLoot(exp, 'cottage_kitchen');
  const quantity = loot.items.raw;
  assert.equal(takeLoot(exp, loot.id, 'raw', quantity).ok, true);
  assert.equal(loot.items.raw, undefined);
  const next = createExpedition({}, state);
  assert.equal(next.loot.find(item => item.id === loot.id).items.raw, undefined);
  assert.equal(state.locations.cottage.visits, 2);
});

test('dropped loadout can be recovered on a later visit instead of disappearing', () => {
  const { state, exp } = create('cottage', { crowbar: 1 });
  exp.player.x = 360;
  const dropped = dropItem(exp, 'crowbar', 1);
  assert.equal(dropped.ok, true);
  assert.equal(exp.bag.crowbar, undefined);
  state.nightPlan.loadout = {};
  const next = createExpedition({}, state);
  const pile = next.loot.find(item => item.id === dropped.lootId);
  assert.equal(pile.items.crowbar, 1);
  next.player.x = pile.x;
  next.player.floor = pile.floor;
  assert.equal(interact(next).ok, true);
  assert.equal(takeLoot(next, pile.id, 'crowbar', 1).ok, true);
  assert.equal(next.bag.crowbar, 1);
});

test('owned loot records theft and a single container-level morale cost', () => {
  const { exp } = create('apartments');
  exp.npcs = [];
  const loot = openLoot(exp, 'apartments_pantry');
  assert.equal(takeLoot(exp, loot.id, 'raw', 1).ok, true);
  const morale = exp.stats.moraleDelta;
  assert.ok(morale < 0);
  assert.equal(takeLoot(exp, loot.id, 'raw', 1).ok, true);
  assert.equal(exp.stats.theft, 2);
  assert.equal(exp.stats.moraleDelta, morale);
});

// Social reactions, stealth and combat.
test('residents warn first; leaving the private zone defuses that warning', () => {
  const { exp } = create('clinic');
  const npc = exp.npcs[0];
  exp.player.x = 1020;
  exp.player.floor = 1;
  npc.x = 1030;
  npc.facing = -1;
  advance(exp, 1);
  assert.equal(npc.state, 'warn');
  assert.equal(exp.player.health, 100);
  exp.player.x = 700;
  advance(exp, 2);
  assert.notEqual(npc.state, 'attack');
  assert.equal(npc.aggression, 0);
  assert.equal(exp.player.health, 100);
});

test('ignoring a visible resident warning escalates into a chase', () => {
  const { exp } = create('clinic');
  const npc = exp.npcs[0];
  exp.player.x = 1020;
  exp.player.floor = 1;
  npc.x = 1030;
  npc.facing = -1;
  advance(exp, 3.5);
  assert.equal(npc.aggression, 1);
  assert.ok(['chase', 'attack'].includes(npc.state));
  assert.ok(exp.stats.detected > 0);
});

test('hiding interrupts direct sight, and interacting again exits hiding', () => {
  const { exp } = create('warehouse');
  exp.npcs = [exp.npcs[0]];
  const npc = exp.npcs[0];
  const spot = exp.hides[0];
  exp.player.x = spot.x;
  exp.player.floor = spot.floor;
  npc.x = spot.x + 55;
  npc.floor = spot.floor;
  npc.facing = -1;
  assert.equal(getNearby(exp).hide, true);
  assert.equal(interact(exp).hidden, true);
  advance(exp, 2);
  assert.equal(exp.player.health, 100);
  assert.equal(exp.player.hidden, true);
  assert.equal(interact(exp).hidden, false);
});

test('weapon cooldown prevents repeated instant hits and wounded opponents can flee', () => {
  const { exp } = create('warehouse', { knife: 1 });
  exp.npcs = [exp.npcs[0]];
  const npc = exp.npcs[0];
  exp.player.x = 1000;
  exp.player.floor = 0;
  npc.x = 1050;
  npc.health = 70;
  const first = attack(exp);
  assert.equal(first.ok, true);
  assert.equal(npc.health, 37);
  assert.equal(attack(exp).ok, false);
  assert.equal(npc.health, 37);
  advance(exp, 0.7);
  assert.equal(attack(exp).ok, true);
  assert.equal(npc.state, 'flee');
  assert.equal(exp.stats.killed, 0);
  advance(exp, 8);
  assert.equal(npc.state, 'gone');
  assert.equal(exp.locationState.npcState[npc.id].removed, true);
});

// Exit, failure, snapshots, and reload safety.
test('normal return requires the downstairs exit and result is applied only once', () => {
  const { exp } = create('cottage', { crowbar: 1 });
  exp.player.x = 900;
  assert.equal(returnHome(exp).ok, false);
  assert.equal(exp.done, false);
  exp.player.x = 80;
  exp.player.floor = 1;
  assert.equal(returnHome(exp).ok, false);
  exp.player.floor = 0;
  assert.equal(returnHome(exp).ok, true);
  const before = JSON.stringify(exp.result);
  assert.equal(returnHome(exp, true).ok, false);
  stepExpedition(exp, 0.1, { right: true });
  assert.equal(JSON.stringify(exp.result), before);
});

test('timeout rescues the survivor with bounded penalties and preserves the carried bag', () => {
  const { exp } = create('cottage', { meds: 1 });
  exp.player.x = 1000;
  exp.player.floor = 2;
  exp.player.health = 3;
  exp.time = 99.95;
  stepExpedition(exp, 0.1, {});
  assert.equal(exp.done, true);
  assert.equal(exp.result.late, true);
  assert.equal(exp.result.dead, false);
  assert.equal(exp.result.health, 1);
  assert.equal(exp.result.bag.meds, 1);
  assert.ok(exp.result.fatigue >= 22);
});

test('death returns no bag and leaves a persistent recoverable cache', () => {
  const { state, exp } = create('cottage', { crowbar: 1, bandage: 1 });
  exp.player.x = 1000;
  exp.player.floor = 2;
  exp.player.health = 0;
  stepExpedition(exp, 0.1, {});
  assert.equal(exp.result.dead, true);
  assert.deepEqual(exp.result.bag, {});
  assert.equal(exp.result.escaped, false);
  const id = exp.locationState.dropped[0].id;
  assert.deepEqual(exp.result.locationState.remaining[id], { crowbar: 1, bandage: 1 });
  state.nightPlan.loadout = {};
  const next = createExpedition({}, state);
  assert.equal(next.loot.find(loot => loot.id === id).items.crowbar, 1);
});

test('mid-search JSON resume works and final location snapshot survives broken object references', () => {
  const { state, exp } = create();
  const loot = exp.loot.find(item => item.id === 'cottage_kitchen');
  exp.player.x = loot.x;
  interact(exp);
  advance(exp, 0.6);
  const restored = JSON.parse(JSON.stringify({ state, expedition: exp }));
  const resumed = restored.expedition;
  assert.ok(isValidExpedition(resumed));
  advance(resumed, 2);
  assert.equal(takeLoot(resumed, loot.id, 'raw', 2).ok, true);
  resumed.player.x = 80;
  resumed.player.floor = 0;
  returnHome(resumed);
  assert.equal(resumed.result.locationState.remaining[loot.id].raw, 1);
  assert.equal(restored.state.locations.cottage.remaining[loot.id].raw, 3, 'the JSON snapshot correctly has no shared pointers');
  restored.state.locations.cottage = resumed.result.locationState;
  const next = createExpedition({}, restored.state);
  assert.equal(next.loot.find(item => item.id === loot.id).items.raw, 1);
});

test('result reports net recovered loot separately from starting loadout and returns a copy', () => {
  const { exp } = create('cottage', { crowbar: 1 });
  const loot = openLoot(exp, 'cottage_kitchen');
  takeLoot(exp, loot.id, 'raw', 2);
  exp.player.x = 80;
  exp.player.floor = 0;
  returnHome(exp);
  const result = expeditionResult(exp);
  assert.equal(result.bag.crowbar, 1);
  assert.equal(result.lootTaken.crowbar, undefined);
  assert.equal(result.lootTaken.raw, 2);
  result.bag.raw = 999;
  assert.equal(exp.result.bag.raw, 2);
});

test('replaying a seed gives the same emergency return penalty', () => {
  const a = create().exp;
  const b = create().exp;
  returnHome(a, true);
  returnHome(b, true);
  assert.equal(a.result.health, b.result.health);
  assert.equal(a.result.fatigue, b.result.fatigue);
});

test('import validator rejects malformed, unknown-item and invalid-position snapshots without throwing', () => {
  assert.equal(isValidExpedition(null), false);
  assert.equal(isValidExpedition({}), false);
  const valid = create().exp;
  const mutations = [
    exp => { exp.player.floor = 5; },
    exp => { exp.bag.unknown = 1; },
    exp => { exp.bag.raw = -1; },
    exp => { exp.player.health = NaN; },
    exp => { exp.locationState.remaining = null; },
    exp => { delete exp.locationState.opened; },
    exp => { delete exp.locationState.searched; },
    exp => { exp.player.climb = { from: 0, to: 7 }; },
    exp => { delete exp.player.attackCooldown; },
    exp => { exp.progress = { total: 1, remaining: 10, label: 'bad' }; },
    exp => { exp.npcs = 'not an array'; },
    exp => { exp.time = 99999; }
  ];
  for (const mutate of mutations) {
    const invalid = JSON.parse(JSON.stringify(valid));
    mutate(invalid);
    assert.equal(isValidExpedition(invalid), false);
  }
  assert.ok(isValidExpedition(JSON.parse(JSON.stringify(valid))));
});


test('real shelter engine settles a resumed expedition once and preserves its location snapshot', () => {
  let state = createGame(1234);
  assert.equal(endDay(state).ok, true);
  const started = beginNight(state, {
    scavengerId: 'leo', locationId: 'cottage',
    roles: { mira: 'sleep', yun: 'guard', leo: 'scavenge' }, loadout: { bandage: 1 }
  });
  assert.equal(started.ok, true, started.reason);
  let exp = createExpedition(started.context, state);
  openLoot(exp, 'cottage_kitchen');
  ({ state, exp } = JSON.parse(JSON.stringify({ state, exp })));
  assert.equal(takeLoot(exp, 'cottage_kitchen', 'raw', 2).ok, true);
  exp.player.x = 80;
  exp.player.floor = 0;
  returnHome(exp);
  const finalFatigue = exp.result.fatigue;
  const settled = finishNight(state, exp.result);
  assert.equal(settled.ok, true, settled.reason);
  assert.equal(state.phase, 'report');
  assert.equal(state.inventory.bandage, 1, 'round-trip equipment is returned once');
  assert.equal(state.inventory.raw, 6);
  assert.equal(state.locations.cottage.remaining.cottage_kitchen.raw, 1);
  assert.equal(state.characters.find(c => c.id === 'leo').fatigue, finalFatigue);
  const inventoryAfter = JSON.stringify(state.inventory);
  assert.equal(finishNight(state, exp.result).ok, false);
  assert.equal(JSON.stringify(state.inventory), inventoryAfter);
  assert.equal(nextDay(state).ok, true);
  assert.equal(state.day, 2);
  assert.ok(isValidSave(state));
});


test('an explicit hide click wins over a nearby loot container', () => {
  const { exp } = create();
  exp.player.x = 610;
  assert.ok(getNearby(exp).loot, 'a chest is also within interaction range');
  assert.equal(interact(exp, { type: 'hide', id: 'hide_ground' }).hidden, true);
  assert.equal(exp.progress, null);
  assert.equal(interact(exp, { type: 'hide', id: 'hide_ground' }).hidden, false);
});

test('an explicit dropped-cache click works even when it overlaps an original chest', () => {
  const { exp } = create('cottage', { crowbar: 1 });
  const original = exp.loot[0];
  exp.player.x = original.x;
  const dropped = dropItem(exp, 'crowbar', 1);
  assert.equal(getNearby(exp).loot.id, original.id);
  assert.equal(interact(exp, { type: 'loot', id: dropped.lootId }).lootId, dropped.lootId);
  assert.equal(takeLoot(exp, dropped.lootId, 'crowbar', 1).ok, true);
  assert.equal(exp.bag.crowbar, 1);
});

test('vertical movement also cancels search before approaching the staircase', () => {
  const { exp } = create();
  exp.player.x = exp.loot[0].x;
  assert.equal(interact(exp).ok, true);
  assert.ok(exp.progress);
  stepExpedition(exp, 0.1, { up: true });
  assert.equal(exp.progress, null);
  assert.ok(exp.player.route.length > 0);
});

// Physical doors, exploration memory and current perception.
test('closed doors stop both pointer and keyboard movement without a repeating route', () => {
  const { exp } = create('clinic');
  exp.npcs = [];
  exp.player.x = 800;
  exp.player.floor = 1;
  moveTo(exp, 1030, 1);
  advance(exp, 3);
  assert.equal(exp.player.x, 862);
  assert.deepEqual(exp.player.route, []);
  assert.equal(exp.player.target, null);
  assert.match(exp.notice, /닫힌 문/);
  advance(exp, 2, { right: true });
  assert.equal(exp.player.x, 862);
  assert.equal(getNearby(exp).door.id, 'clinic_ward_door');
  assert.equal(interact(exp).ok, true);
  arrive(exp, 1030, 1);
  exp.player.x = 940;
  assert.equal(interact(exp, { type: 'door', id: 'clinic_ward_door' }).open, false);
  advance(exp, 1, { left: true });
  assert.equal(exp.player.x, 898);
});

test('locked doors require a reusable crowbar and their unlocked state persists across visits', () => {
  const without = create('garage').exp;
  without.player.x = 850;
  without.player.floor = 2;
  const locked = without.doors.find(door => door.id === 'garage_storage_door');
  assert.equal(interact(without, { type: 'door', id: locked.id }).ok, false);
  assert.equal(locked.locked, true);
  assert.equal(locked.open, false);
  assert.deepEqual(without.bag, {});

  const { state, exp } = create('garage', { crowbar: 1 });
  exp.player.x = 850;
  exp.player.floor = 2;
  const result = interact(exp, { type: 'door', id: locked.id });
  assert.equal(result.unlocked, true);
  assert.equal(result.open, true);
  assert.equal(exp.bag.crowbar, 1);
  assert.equal(interact(exp, { type: 'door', id: locked.id }).open, false);
  assert.equal(exp.bag.crowbar, 1);
  const revisited = createExpedition({}, state);
  assert.deepEqual(revisited.locationState.doors[locked.id], { open: false, locked: false });
  assert.ok(isValidExpedition(revisited));
});

test('closing a door cannot overlap a person and a held E does not toggle repeatedly', () => {
  const { exp } = create();
  const door = exp.doors[0];
  exp.player.x = door.x;
  assert.equal(interact(exp, { type: 'door', id: door.id }).ok, false);
  assert.equal(door.open, true);
  exp.player.x = door.x - 50;
  advance(exp, 1, { interact: true });
  assert.equal(door.open, false);
  stepExpedition(exp, 0.1, { interact: false });
  stepExpedition(exp, 0.1, { interact: true });
  assert.equal(door.open, true);
});

test('closed doors block player attacks, NPC sight and nearby interactions through the panel', () => {
  const { exp } = create('clinic');
  exp.player.x = 850;
  exp.player.floor = 1;
  const npc = exp.npcs[0];
  npc.x = 900;
  npc.facing = -1;
  npc.hostile = true;
  const beforeHealth = npc.health;
  assert.equal(getVisibility(exp).npcIds.includes(npc.id), false);
  assert.equal(attack(exp).ok, false);
  assert.equal(npc.health, beforeHealth);
  stepExpedition(exp, 0.1, {});
  assert.equal(exp.player.health, 100);
  assert.notEqual(npc.state, 'attack');

  const box = exp.loot[0];
  box.x = 900;
  box.floor = 1;
  box.searched = true;
  exp.activeLootId = box.id;
  assert.notEqual(getNearby(exp).loot?.id, box.id);
  assert.equal(interact(exp, { type: 'loot', id: box.id }).ok, false);
  assert.equal(takeLoot(exp, box.id, 'water', 1).ok, false);
  assert.equal(takeAllLoot(exp, box.id).ok, false);
});

test('visibility remembers discovered containers but never remembers an absent NPC', () => {
  const { exp } = create('clinic');
  assert.deepEqual(getVisibility(exp).lootIds, ['clinic_aid']);
  assert.deepEqual(getVisibility(exp).npcIds, []);
  exp.player.x = 800;
  exp.player.floor = 1;
  stepExpedition(exp, 0.1, {});
  const closed = getVisibility(exp);
  assert.equal(closed.visibleSegments[0].max, 880);
  assert.equal(closed.npcIds.length, 0);
  assert.equal(closed.lootIds.includes('clinic_private'), false);
  assert.equal(interact(exp, { type: 'door', id: 'clinic_ward_door' }).ok, true);
  const revealed = getVisibility(exp);
  assert.equal(revealed.range, 330);
  assert.equal(revealed.npcIds.length, 1);
  assert.ok(revealed.lootIds.includes('clinic_private'));
  exp.player.x = 100;
  exp.player.floor = 0;
  stepExpedition(exp, 0.1, {});
  const remembered = getVisibility(exp);
  assert.ok(remembered.lootIds.includes('clinic_private'));
  assert.deepEqual(remembered.npcIds, []);
  const before = JSON.stringify(exp);
  getVisibility(exp);
  assert.equal(JSON.stringify(exp), before, 'render queries must not mutate simulation state');
});

test('explored intervals merge and discoveries survive result snapshots and revisits', () => {
  const { state, exp } = create();
  arrive(exp, 720, 0);
  assert.equal(exp.explored.filter(segment => segment.floor === 0).length, 1);
  assert.ok(exp.explored[0].max >= 1050);
  assert.ok(exp.knownLootIds.includes('cottage_kitchen'));
  arrive(exp, 80, 0);
  returnHome(exp);
  state.locations.cottage = JSON.parse(JSON.stringify(exp.result.locationState));
  const later = createExpedition({}, state);
  assert.ok(getVisibility(later).lootIds.includes('cottage_kitchen'));
  assert.ok(later.explored[0].max >= 1050);
  assert.ok(isValidExpedition(later));
});

// A field treatment commits a single resource only after a safe uninterrupted action.
test('field treatment takes three seconds, commits one bandage and applies a reuse cooldown', () => {
  const { exp } = create('cottage', { bandage: 3 });
  exp.player.health = 40;
  assert.equal(useBandage(exp).ok, true);
  assert.equal(useBandage(exp).ok, false);
  assert.equal(exp.progress.remaining, 3);
  advance(exp, 2.9);
  assert.equal(exp.player.health, 40);
  assert.equal(exp.bag.bandage, 3);
  advance(exp, 0.1);
  assert.equal(exp.player.health, 70);
  assert.equal(exp.bag.bandage, 2);
  assert.equal(exp.progress, null);
  assert.equal(exp.bandageCooldown, 12);
  assert.equal(exp.stats.bandagesUsed, 1);
  assert.equal(useBandage(exp).ok, false);
  advance(exp, 12.1);
  assert.equal(useBandage(exp).ok, true);
  advance(exp, 3);
  assert.equal(exp.player.health, 100);
  assert.equal(exp.bag.bandage, 1);
  assert.equal(useBandage(exp).ok, false);
});

test('moving or targeting another point cancels treatment without spending the reserved bandage', () => {
  const { exp } = create('cottage', { bandage: 1 });
  exp.player.health = 65;
  useBandage(exp);
  advance(exp, 1);
  stepExpedition(exp, 0.1, { right: true });
  assert.equal(exp.progress, null);
  assert.equal(exp.player.health, 65);
  assert.equal(exp.bag.bandage, 1);
  assert.equal(exp.bandageCooldown, 0);
  useBandage(exp);
  moveTo(exp, 200, 0);
  assert.equal(exp.progress, null);
  assert.equal(exp.bag.bandage, 1);
});

test('a hit on the final treatment frame interrupts before any consumption or healing', () => {
  const { exp } = create('warehouse', { bandage: 1 });
  exp.player.x = 1000;
  exp.player.health = 60;
  exp.npcs = [exp.npcs[0]];
  const npc = exp.npcs[0];
  npc.state = 'gone';
  useBandage(exp);
  advance(exp, 2.9);
  npc.state = 'patrol';
  npc.x = 1030;
  npc.floor = 0;
  npc.facing = -1;
  npc.cooldown = 0;
  npc.state = 'attack';
  npc.windup = 0.1; // The telegraph is ending on the final treatment frame.
  stepExpedition(exp, 0.1, {});
  assert.equal(exp.player.health, 50);
  assert.equal(exp.bag.bandage, 1);
  assert.equal(exp.progress, null);
  assert.equal(exp.stats.bandagesUsed, 0);
});

test('a reserved bandage cannot be dropped and a resumed treatment commits only once', () => {
  const { exp } = create('cottage', { bandage: 2 });
  exp.player.health = 85;
  useBandage(exp);
  assert.equal(dropItem(exp, 'bandage', 1).ok, true);
  assert.equal(dropItem(exp, 'bandage', 1).ok, false);
  advance(exp, 1.2);
  const resumed = restoreExpedition(JSON.parse(JSON.stringify(exp)));
  assert.ok(resumed);
  advance(resumed, 1.8);
  assert.equal(resumed.player.health, 100);
  assert.equal(resumed.bag.bandage, undefined);
  assert.equal(resumed.stats.healed, 15);
  advance(resumed, 1);
  assert.equal(resumed.stats.bandagesUsed, 1);
  assert.ok(isValidExpedition(resumed));
});

test('a deadline interrupts unfinished treatment and returns its unspent bandage', () => {
  const { exp } = create('cottage', { bandage: 1 });
  exp.player.health = 50;
  exp.time = 99;
  useBandage(exp);
  advance(exp, 1.2);
  assert.ok(exp.done);
  assert.equal(exp.result.bag.bandage, 1);
  assert.equal(exp.stats.bandagesUsed, 0);
  assert.ok(exp.result.health < 50);
});

// Inventory convenience and map knowledge stay honest about capacity and discovery.
test('take all fills available stack space and conserves all items left in the container', () => {
  const { exp } = create('cottage', { wood: 3 }, 1);
  const loot = openLoot(exp, 'cottage_entry');
  const result = takeAllLoot(exp, loot.id);
  assert.equal(result.ok, true);
  assert.deepEqual(result.taken, { wood: 1 });
  assert.equal(result.count, 1);
  assert.equal(result.partial, true);
  assert.deepEqual(exp.bag, { wood: 4 });
  assert.deepEqual(loot.items, { wood: 5, parts: 4 });
  const before = JSON.stringify([exp.bag, loot.items, exp.stats]);
  assert.equal(takeAllLoot(exp, loot.id).ok, false);
  assert.equal(JSON.stringify([exp.bag, loot.items, exp.stats]), before);
  assert.deepEqual(exp.locationState.remaining[loot.id], loot.items);
});

test('take all applies ownership consequences exactly once per container', () => {
  const { exp } = create('apartments');
  exp.npcs = [];
  const loot = openLoot(exp, 'apartments_pantry');
  const result = takeAllLoot(exp, loot.id);
  assert.deepEqual(result.taken, { raw: 7, meal: 2 });
  assert.equal(result.count, 9);
  assert.equal(result.partial, false);
  assert.equal(exp.stats.theft, 9);
  assert.equal(exp.stats.moraleDelta, -5);
  assert.equal(takeAllLoot(exp, loot.id).ok, false);
  assert.equal(exp.stats.moraleDelta, -5);
});

test('location intelligence excludes unseen or unsearched contents and reports real depletion', () => {
  const state = makeState('cottage', { crowbar: 1 }, 100);
  assert.deepEqual(getLocationIntel(state, 'cottage'), { visits: 0, searched: 0, totalContainers: 5, remainingKnownItems: {}, cleared: false, lockedCount: 0 });
  const exp = createExpedition({}, state);
  assert.deepEqual(getLocationIntel(state, 'cottage').remainingKnownItems, {});
  openLoot(exp, 'cottage_entry');
  const known = getLocationIntel(state, 'cottage');
  assert.equal(known.searched, 1);
  assert.deepEqual(known.remainingKnownItems, { wood: 6, parts: 4 });
  takeLoot(exp, 'cottage_entry', 'wood', 2);
  assert.deepEqual(getLocationIntel(state, 'cottage').remainingKnownItems, { wood: 4, parts: 4 });
  for (const loot of exp.loot) {
    openLoot(exp, loot.id);
    assert.equal(takeAllLoot(exp, loot.id).ok, true);
  }
  const cleared = getLocationIntel(state, 'cottage');
  assert.equal(cleared.searched, 5);
  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.remainingKnownItems, {});
  assert.equal(cleared.lockedCount, 0);
});

function oldV1Snapshot(exp) {
  const saved = JSON.parse(JSON.stringify(exp));
  const added = ['doors', 'explored', 'knownLootIds', 'knownDoorIds', 'encounters', 'permissions', 'hostileNpcIds'];
  for (const key of [...added, 'bandageCooldown']) delete saved[key];
  for (const key of added) {
    delete saved.locationState[key];
    if (saved.result?.locationState) delete saved.result.locationState[key];
  }
  delete saved.stats.bandagesUsed;
  delete saved.stats.healed;
  delete saved.stats.helped;
  delete saved.stats.dodges;
  delete saved._dodgeHeld;
  if (saved.result) delete saved.result.helped;
  for (const key of ['stamina', 'staminaDelay', 'dodge', 'evade', 'dodgeCooldown']) delete saved.player[key];
  delete saved.player.blockedDoorId;
  for (const npc of saved.npcs) { delete npc.blockedDoorId; delete npc.doorWait; delete npc.windup; }
  return saved;
}

test('legacy v1 restoration opens newly added doors and preserves the saved position and route', () => {
  const { exp } = create('garage');
  exp.player.x = 900;
  exp.player.floor = 2;
  moveTo(exp, 1100, 2);
  const old = oldV1Snapshot(exp);
  const original = JSON.stringify(old);
  assert.ok(isValidExpedition(old));
  const restored = restoreExpedition(old);
  assert.ok(restored);
  assert.equal(JSON.stringify(old), original);
  assert.equal(restored.player.x, 900);
  assert.equal(restored.player.floor, 2);
  assert.deepEqual(restored.player.route, old.player.route);
  assert.ok(restored.doors.every(door => door.open && !door.locked));
  assert.equal(restored.bandageCooldown, 0);
  advance(restored, 2);
  assert.equal(restored.player.x, 1100);
  assert.ok(isValidExpedition(restored));
});

test('legacy finished results migrate without changing bags and malformed new fields are rejected', () => {
  const { exp } = create('cottage', { water: 2 });
  returnHome(exp);
  const legacy = oldV1Snapshot(exp);
  const restored = restoreExpedition(legacy);
  assert.ok(restored);
  assert.deepEqual(restored.result.bag, { water: 2 });
  assert.ok(restored.result.locationState.doors);
  for (const mutate of [
    data => { data.doors[0].open = 'yes'; },
    data => { data.doors[0].x += 1; },
    data => { data.explored = [{ floor: 3, min: 1, max: 4 }]; },
    data => { data.bandageCooldown = 99; },
    data => { data.locationState.knownLootIds = [42]; },
    data => { data.locationState.doors.fake = { open: true, locked: true }; }
  ]) {
    const bad = JSON.parse(JSON.stringify(restored));
    mutate(bad);
    assert.equal(isValidExpedition(bad), false);
    assert.equal(restoreExpedition(bad), null);
  }
});

test('new door and exploration snapshots survive real shelter settlement and import validation', () => {
  const state = createGame(814);
  endDay(state);
  const started = beginNight(state, { scavengerId: 'mira', locationId: 'cottage', roles: { mira: 'scavenge', yun: 'guard', leo: 'sleep' }, loadout: {} });
  assert.equal(started.ok, true);
  const exp = createExpedition(started.context, state);
  arrive(exp, 450, 0);
  interact(exp, { type: 'door', id: 'cottage_hall_door' });
  arrive(exp, 80, 0);
  returnHome(exp);
  const separate = restoreExpedition(JSON.parse(JSON.stringify(exp)));
  assert.ok(separate);
  assert.equal(finishNight(state, separate.result).ok, true);
  assert.deepEqual(state.locations.cottage.doors.cottage_hall_door, { open: false, locked: false });
  assert.ok(state.locations.cottage.knownDoorIds.includes('cottage_hall_door'));
  assert.ok(isValidSave(state));
});

// Telegraphs give the player time to leave; movement and collision still decide the impact.
function duel(loadout = {}) {
  const { state, exp } = create('warehouse', loadout);
  exp.player.x = 1000;
  exp.npcs = [exp.npcs[0]];
  const npc = exp.npcs[0];
  npc.x = 1030;
  npc.floor = 0;
  npc.facing = -1;
  return { state, exp, npc };
}

test('a hostile first strike has a readable windup and then a full recovery cooldown', () => {
  const { exp, npc } = duel();
  stepExpedition(exp, 0.1);
  assert.equal(exp.player.health, 100);
  assert.equal(npc.windup, COMBAT_RULES.windup);
  advance(exp, 0.4);
  assert.equal(exp.player.health, 100);
  assert.ok(npc.windup > 0);
  advance(exp, 0.2);
  assert.equal(exp.player.health, 90);
  assert.equal(npc.windup, 0);
  assert.ok(npc.cooldown > 1);
  advance(exp, 0.6);
  assert.equal(exp.player.health, 90);
});

test('walking out of reach or shutting a door during the telegraph makes the strike miss', () => {
  const { exp, npc } = duel();
  stepExpedition(exp, 0.1);
  advance(exp, 0.6, { left: true });
  assert.equal(exp.player.health, 100);
  assert.ok(npc.cooldown > 0);
  assert.equal(npc.x, 1030, 'the attacker commits instead of following during the windup');

  const blocked = create('clinic').exp;
  blocked.player.x = 850;
  blocked.player.floor = 1;
  const resident = blocked.npcs[0];
  resident.x = 900;
  resident.hostile = true;
  interact(blocked, { type: 'door', id: 'clinic_ward_door' });
  stepExpedition(blocked, 0.1);
  assert.ok(resident.windup > 0);
  assert.equal(interact(blocked, { type: 'door', id: 'clinic_ward_door' }).open, false);
  advance(blocked, 0.6);
  assert.equal(blocked.player.health, 100);
  assert.equal(resident.windup, 0);
  assert.ok(resident.cooldown > 0);
});

test('attacks spend stamina only when valid and exhaustion limits repeated hits', () => {
  const { exp, npc } = duel();
  npc.health = 100;
  npc.maxHealth = 100;
  npc.cooldown = 5;
  for (let i = 0; i < 4; i++) {
    assert.equal(attack(exp).ok, true);
    if (i < 3) advance(exp, 0.7);
  }
  assert.equal(exp.player.stamina, 12);
  advance(exp, 0.7);
  const before = [exp.player.stamina, npc.health, exp.stats.attacks];
  assert.equal(attack(exp).ok, false);
  assert.deepEqual([exp.player.stamina, npc.health, exp.stats.attacks], before);
  exp.npcs = [];
  advance(exp, 2);
  assert.ok(exp.player.stamina > 30);
  const noTarget = exp.player.stamina;
  assert.equal(attack(exp).ok, false);
  assert.equal(exp.player.stamina, noTarget);
  advance(exp, 10);
  assert.equal(exp.player.stamina, 100);
});

test('stamina does not regenerate during treatment and recovers during ordinary movement afterward', () => {
  const { exp } = create('cottage', { bandage: 1 });
  exp.player.health = 50;
  exp.player.stamina = 20;
  useBandage(exp);
  advance(exp, 1);
  assert.equal(exp.player.stamina, 20);
  assert.equal(dodge(exp).ok, false);
  assert.equal(exp.progress.type, 'bandage');
  moveTo(exp, 400, 0);
  advance(exp, 1);
  assert.ok(exp.player.stamina > 30);
  assert.equal(exp.bag.bandage, 1);
});

test('dodge is a finite burst with one charge, a bounded evade window and a rising-edge input', () => {
  const { exp } = create();
  exp.player.x = 300;
  assert.equal(dodge(exp, 1).ok, true);
  assert.equal(exp.player.stamina, 72);
  assert.equal(dodge(exp, 1).ok, false);
  advance(exp, 0.3);
  assert.ok(Math.abs(exp.player.x - 417) < 1e-6);
  assert.equal(exp.player.dodge, null);
  assert.equal(exp.player.evade, 0);
  assert.equal(dodge(exp, -1).ok, false);
  advance(exp, 3);
  const start = exp.player.x;
  advance(exp, 3, { dodge: true });
  assert.ok(Math.abs(exp.player.x - start - 117) < 1e-6);
  assert.equal(exp.stats.dodges, 2, 'holding the button never starts a second dodge after recovery');
  stepExpedition(exp, 0.1, { dodge: false });
  stepExpedition(exp, 0.1, { dodge: true, left: true });
  assert.equal(exp.stats.dodges, 3);
  assert.equal(exp.player.dodge.direction, -1);
});

test('dodge blocks attacks and other actions, respects doors and cannot start on a stair', () => {
  const { exp } = create('clinic', { bandage: 1 });
  exp.player.x = 820;
  exp.player.floor = 1;
  exp.player.health = 70;
  assert.equal(dodge(exp, 1).ok, true);
  assert.equal(attack(exp).ok, false);
  assert.equal(useBandage(exp).ok, false);
  assert.equal(interact(exp, { type: 'door', id: 'clinic_ward_door' }).ok, false);
  assert.equal(moveTo(exp, 100, 0), null);
  stepExpedition(exp, 0.1, { up: true });
  assert.equal(exp.player.x, 862);
  assert.equal(exp.player.floor, 1);
  assert.equal(exp.player.dodge, null);
  assert.equal(exp.player.evade, 0);
  assert.equal(exp.player.stamina, 72);

  const stairs = create().exp;
  stairs.player.x = 280;
  moveTo(stairs, 280, 1);
  stepExpedition(stairs, 0.1);
  stepExpedition(stairs, 0.1);
  assert.ok(stairs.player.climb);
  assert.equal(dodge(stairs, 1).ok, false);
  assert.equal(stairs.player.stamina, 100);

  const combat = duel().exp;
  attack(combat);
  const before = combat.player.stamina;
  assert.equal(dodge(combat, -1).ok, false);
  assert.equal(combat.player.stamina, before);
});

test('evasion expires before the burst ends, so a later strike can still connect', () => {
  const { exp } = create('warehouse');
  exp.player.x = 1000;
  const [first, second] = exp.npcs;
  Object.assign(first, { x: 1030, floor: 0, state: 'attack', windup: 0.05 });
  Object.assign(second, { x: 1090, floor: 0, state: 'attack', windup: 0.15 });
  dodge(exp, 1);
  stepExpedition(exp, 0.1);
  assert.equal(exp.player.health, 100);
  assert.ok(exp.player.evade > 0);
  stepExpedition(exp, 0.1);
  assert.equal(exp.player.evade, 0);
  assert.ok(exp.player.dodge);
  assert.equal(exp.player.health, 91);
});

test('dodge stops at the world boundary and cannot generate stationary invulnerability', () => {
  const { exp } = create();
  exp.player.x = 1200;
  assert.equal(dodge(exp, 1).ok, true);
  advance(exp, 0.1);
  assert.equal(exp.player.x, 1215);
  assert.equal(exp.player.evade, 0);
  assert.equal(exp.player.dodge, null);
  advance(exp, 3);
  const before = exp.player.stamina;
  assert.equal(dodge(exp, 1).ok, false);
  assert.equal(exp.player.stamina, before);
});

function readyEncounter(locationId, loadout = {}, capacity = 12) {
  const { state, exp } = create(locationId, loadout, capacity);
  const npc = exp.npcs[0];
  const door = exp.doors.find(entry => entry.floor === 1);
  exp.player.floor = 1;
  exp.player.x = door.x - 40;
  npc.floor = 1;
  npc.x = door.x + 80;
  if (!door.open) assert.equal(interact(exp, { type: 'door', id: door.id }).ok, true);
  return { state, exp, npc };
}

test('encounter queries expose only nearby visible residents and never mutate the simulation', () => {
  const { exp } = create('clinic', { water: 2, bandage: 1 });
  const npc = exp.npcs[0];
  assert.equal(getEncounter(exp, npc.id), null);
  exp.player.floor = 1;
  exp.player.x = 840;
  npc.x = 960;
  assert.equal(getEncounter(exp, npc.id), null, 'the closed ward door hides the resident');
  const closedBefore = JSON.stringify(exp);
  assert.equal(resolveEncounter(exp, npc.id, 'help').ok, false);
  assert.equal(JSON.stringify(exp), closedBefore);
  interact(exp, { type: 'door', id: 'clinic_ward_door' });
  const before = JSON.stringify(exp);
  const dialogue = getEncounter(exp, npc.id);
  assert.ok(dialogue);
  assert.equal(dialogue.id, 'clinic_supplies');
  assert.deepEqual(dialogue.options.map(option => option.id), ['request', 'help', 'trade']);
  assert.equal(dialogue.options.find(option => option.id === 'help').available, true);
  assert.equal(JSON.stringify(exp), before);
  exp.player.floor = 0;
  assert.equal(getEncounter(exp, npc.id), null);
});

test('request grants safe passage first and help later grants actual private-loot permission', () => {
  const { exp, npc } = readyEncounter('clinic', { water: 2, bandage: 1 });
  const requested = resolveEncounter(exp, npc.id, 'request');
  assert.deepEqual(requested.permission, { area: true, loot: false });
  assert.equal(requested.resolved, false);
  assert.equal(exp.loot.find(loot => loot.id === 'clinic_private').owned, true);
  exp.player.x = 1000;
  advance(exp, 4);
  assert.equal(npc.aggression, 0);
  assert.equal(exp.player.health, 100);
  assert.equal(getEncounter(exp, npc.id).options.find(option => option.id === 'help').available, true);
  const helped = resolveEncounter(exp, npc.id, 'help');
  assert.equal(helped.ok, true);
  assert.deepEqual(helped.permission, { area: true, loot: true });
  const privateLoot = exp.loot.find(loot => loot.id === 'clinic_private');
  assert.equal(privateLoot.owned, false);
  assert.equal(privateLoot.locked, false);
  openLoot(exp, privateLoot.id);
  takeLoot(exp, privateLoot.id, 'meds', 1);
  assert.equal(exp.stats.theft, 0);
  assert.equal(exp.stats.helped, 1);
  assert.equal(exp.stats.moraleDelta, 3);
  returnHome(exp, true);
  assert.equal(exp.result.helped, 1);
});

test('all three authored help encounters consume only carried supplies and unlock their shared stores', () => {
  for (const [locationId, loadout, reward] of [
    ['clinic', { water: 2, bandage: 1 }, { meds: 1 }],
    ['garage', { parts: 3 }, { fuel: 2 }],
    ['apartments', { meal: 2, water: 2 }, { cloth: 2 }]
  ]) {
    const { state, exp, npc } = readyEncounter(locationId, loadout);
    const homeBefore = JSON.stringify(state.inventory);
    assert.equal(resolveEncounter(exp, npc.id, 'help').ok, true, locationId);
    assert.deepEqual(exp.bag, reward);
    assert.equal(JSON.stringify(state.inventory), homeBefore);
    assert.equal(exp.stats.helped, 1);
    assert.ok(exp.loot.every(loot => !loot.owned), locationId);
    assert.ok(exp.loot.filter(loot => loot.id.endsWith('private') || loot.id.endsWith('medicine')).every(loot => !loot.locked));
    if (locationId === 'apartments') assert.equal(exp.doors.find(door => door.id === 'apartments_bedroom_door').locked, false);
    assert.ok(isValidExpedition(exp), locationId);
  }
});

test('a deal checks final bag capacity and both inventories atomically before a reward', () => {
  const { exp, npc } = readyEncounter('clinic', { meal: 3 }, 1);
  resolveEncounter(exp, npc.id, 'request');
  const before = JSON.stringify(exp);
  assert.equal(resolveEncounter(exp, npc.id, 'trade').ok, false);
  assert.equal(JSON.stringify(exp), before);
  assert.equal(resolveEncounter(exp, npc.id, 'help').ok, false);
  assert.equal(JSON.stringify(exp), before);
  assert.equal(dropItem(exp, 'meal', 1).ok, true);
  const traded = resolveEncounter(exp, npc.id, 'trade');
  assert.equal(traded.ok, true);
  assert.deepEqual(exp.bag, { bandage: 2 });
  assert.equal(exp.stats.helped, 0);
  const after = JSON.stringify(exp);
  assert.equal(resolveEncounter(exp, npc.id, 'trade').ok, false);
  assert.equal(resolveEncounter(exp, npc.id, 'help').ok, false);
  assert.equal(JSON.stringify(exp), after);
});

test('treatment and dodge prevent simultaneous negotiations without double-spending supplies', () => {
  const { exp, npc } = readyEncounter('clinic', { water: 2, bandage: 2 });
  exp.player.health = 60;
  useBandage(exp);
  assert.ok(getEncounter(exp, npc.id).options.every(option => !option.available));
  assert.equal(resolveEncounter(exp, npc.id, 'help').ok, false);
  assert.deepEqual(exp.bag, { water: 2, bandage: 2 });
  assert.equal(dodge(exp, 1).ok, true);
  assert.equal(exp.progress, null);
  assert.equal(exp.bag.bandage, 2);
  assert.ok(getEncounter(exp, npc.id).options.every(option => !option.available));
  assert.equal(resolveEncounter(exp, npc.id, 'request').ok, false);
  advance(exp, 0.3);
  assert.equal(resolveEncounter(exp, npc.id, 'help').ok, true);
  assert.deepEqual(exp.bag, { bandage: 1, meds: 1 });
});

test('a household shares one deal record and neither reloads nor revisits farm its rewards', () => {
  const { state, exp, npc } = readyEncounter('apartments', { meds: 1 });
  assert.equal(resolveEncounter(exp, npc.id, 'trade').ok, true);
  const resumed = restoreExpedition(JSON.parse(JSON.stringify(exp)));
  assert.ok(resumed);
  const neighbor = resumed.npcs.find(entry => entry.id === 'apartments_neighbor');
  resumed.player.x = neighbor.x - 40;
  assert.equal(getEncounter(resumed, neighbor.id).resolved, true);
  const bag = JSON.stringify(resumed.bag);
  assert.equal(resolveEncounter(resumed, neighbor.id, 'trade').ok, false);
  assert.equal(JSON.stringify(resumed.bag), bag);
  returnHome(resumed, true);
  state.locations.apartments = JSON.parse(JSON.stringify(resumed.result.locationState));
  state.nightPlan.loadout = { meds: 1 };
  const later = createExpedition({}, state);
  later.player.x = later.npcs[0].x - 40;
  later.player.floor = 1;
  assert.equal(getEncounter(later, later.npcs[0].id).resolved, true);
  assert.equal(resolveEncounter(later, later.npcs[0].id, 'trade').ok, false);
  assert.deepEqual(later.bag, { meds: 1 });
  assert.ok(later.loot.every(loot => !loot.owned));
});

test('violence revokes earned permissions and persists resident hostility on later visits', () => {
  const { state, exp, npc } = readyEncounter('clinic', { water: 2, bandage: 1 });
  resolveEncounter(exp, npc.id, 'help');
  exp.player.x = npc.x - 50;
  assert.equal(attack(exp).ok, true);
  assert.deepEqual(exp.locationState.permissions.clinic_supplies, { area: false, loot: false });
  assert.ok(exp.locationState.hostileNpcIds.includes(npc.id));
  assert.equal(exp.loot.find(loot => loot.id === 'clinic_private').owned, true);
  assert.equal(getEncounter(exp, npc.id), null);
  returnHome(exp, true);
  state.locations.clinic = JSON.parse(JSON.stringify(exp.result.locationState));
  const later = createExpedition({}, state);
  const resident = later.npcs[0];
  later.player.floor = resident.floor;
  later.player.x = resident.x - 40;
  assert.equal(resident.aggression, 1);
  assert.equal(getEncounter(later, resident.id), null);
  assert.equal(later.loot.find(loot => loot.id === 'clinic_private').owned, true);
  assert.equal(later.locationState.encounters.clinic_supplies.resolved, true);
});

test('combat saves resume a partial dodge and windup without resetting stamina or timers', () => {
  const { exp, npc } = duel();
  npc.windup = 0.4;
  npc.state = 'attack';
  dodge(exp, -1);
  stepExpedition(exp, 0.1);
  const resumed = restoreExpedition(JSON.parse(JSON.stringify(exp)));
  assert.ok(resumed);
  assert.equal(resumed.player.stamina, 72);
  assert.ok(Math.abs(resumed.npcs[0].windup - 0.3) < 1e-7);
  advance(resumed, 0.2);
  assert.ok(Math.abs(resumed.player.x - 883) < 1e-6);
  assert.equal(resumed.player.dodge, null);
  assert.equal(resumed.stats.dodges, 1);
  assert.ok(resumed.player.dodgeCooldown > 2);
  assert.ok(isValidExpedition(resumed));
});

test('v2 saves migrate combat defaults while preserving closed doors and rejecting malformed new data', () => {
  const { exp } = create('clinic');
  const saved = JSON.parse(JSON.stringify(exp));
  for (const key of ['stamina', 'staminaDelay', 'dodge', 'evade', 'dodgeCooldown']) delete saved.player[key];
  for (const npc of saved.npcs) delete npc.windup;
  for (const key of ['encounters', 'permissions', 'hostileNpcIds']) delete saved.locationState[key];
  delete saved.stats.helped;
  delete saved.stats.dodges;
  delete saved._dodgeHeld;
  assert.ok(isValidExpedition(saved));
  const migrated = restoreExpedition(saved);
  assert.ok(migrated);
  assert.equal(migrated.player.stamina, 100);
  assert.equal(migrated.player.dodge, null);
  assert.equal(migrated.npcs[0].windup, 0);
  assert.equal(migrated.doors.find(door => door.id === 'clinic_ward_door').open, false);
  assert.deepEqual(migrated.locationState.encounters, {});
  for (const mutate of [
    data => { data.player.stamina = -1; },
    data => { data.player.evade = 5; },
    data => { data.player.dodgeCooldown = 20; },
    data => { data.player.dodge = { direction: 1, total: 2, remaining: 2 }; },
    data => { data.npcs[0].windup = 4; },
    data => { data.locationState.encounters.clinic_supplies = { requested: true, resolved: true, choiceId: null }; },
    data => { data.locationState.permissions.clinic_supplies = { area: false, loot: true }; },
    data => { data.locationState.hostileNpcIds = [42]; }
  ]) {
    const bad = JSON.parse(JSON.stringify(migrated));
    mutate(bad);
    assert.equal(isValidExpedition(bad), false);
    assert.equal(restoreExpedition(bad), null);
  }
});

test('an angry household cannot sell invalid permission through its other resident', () => {
  const { exp, npc } = readyEncounter('apartments', { meds: 1 });
  exp.locationState.hostileNpcIds.push(npc.id);
  npc.aggression = 1;
  const neighbor = exp.npcs.find(entry => entry.id === 'apartments_neighbor');
  exp.player.x = neighbor.x - 40;
  const before = JSON.stringify(exp);
  assert.equal(getEncounter(exp, neighbor.id), null);
  assert.equal(resolveEncounter(exp, neighbor.id, 'trade').ok, false);
  assert.equal(JSON.stringify(exp), before);
});

// Tactical distraction and truthful map guidance.
test('a thrown part is paid once and creates a separate finite sound source', () => {
  const { exp } = create('cottage', { parts: 2 });
  moveTo(exp, 500, 0);
  const result = throwDistraction(exp, 300);
  assert.equal(result.ok, true);
  assert.deepEqual(result.cost, { parts: 1 });
  assert.equal(exp.bag.parts, 1);
  assert.equal(exp.stats.distractions, 1);
  assert.deepEqual(exp.player.route, []);
  assert.equal(exp.player.target, null);
  assert.equal(exp.player.moving, false);
  assert.equal(exp.player.noise, 0, 'throw sound belongs to its landing');
  assert.deepEqual(exp.distraction, { x: 300, floor: 0, remaining: 2.5, total: 2.5 });
  assert.equal(exp.noises.at(-1).kind, 'distraction');
  assert.equal(exp.noises.at(-1).x, 300);
  assert.ok(isValidExpedition(exp));
  const before = JSON.stringify(exp);
  assert.equal(throwDistraction(exp, 300).ok, false);
  assert.equal(JSON.stringify(exp), before);
  advance(exp, 2.6);
  assert.equal(exp.distraction, null);
  assert.equal(exp.noises.length, 0);
  assert.ok(exp.distractionCooldown > 5);
  advance(exp, 5.5);
  assert.equal(throwDistraction(exp, 300).ok, true);
  assert.equal(exp.bag.parts, undefined);
  assert.equal(exp.stats.distractions, 2);
});

test('invalid throw locations and busy actions fail atomically without consuming a part', () => {
  const { exp } = create('cottage', { parts: 1, bandage: 1 });
  for (const [x, floor] of [[NaN, 0], [Infinity, 0], [null, 0], [150, 0], [361, 0], [300, 1], [300, -1], [300, 0.5]]) {
    const before = JSON.stringify(exp);
    assert.equal(throwDistraction(exp, x, floor).ok, false, `${x}, ${floor}`);
    assert.equal(JSON.stringify(exp), before);
  }
  for (const mutate of [
    state => { state.player.climb = { x: 280, from: 0, to: 1, elapsed: 0.2, duration: 0.85 }; },
    state => { dodge(state, 1); },
    state => { state.player.health = 60; useBandage(state); },
    state => { state.player.attackCooldown = 0.4; },
    state => { state.player.health = 0; },
    state => { state.done = true; },
    state => { state.bag.parts = 0; }
  ]) {
    const copy = JSON.parse(JSON.stringify(exp));
    mutate(copy);
    const before = JSON.stringify(copy);
    assert.equal(throwDistraction(copy, copy.player.x + 100).ok, false);
    assert.equal(JSON.stringify(copy), before);
  }
});

test('throws respect the current room and default aim remains usable beside a wall', () => {
  const { exp } = create('cottage', { parts: 2 });
  arrive(exp, 470, 0);
  const door = exp.doors.find(entry => entry.floor === 0);
  assert.equal(interact(exp, { type: 'door', id: door.id }).ok, true);
  assert.equal(door.open, false);
  const before = JSON.stringify(exp);
  assert.equal(throwDistraction(exp, 650).ok, false);
  assert.equal(JSON.stringify(exp), before);
  exp.player.facing = 1;
  const option = getDistraction(exp);
  assert.equal(option.available, true);
  assert.equal(option.target.x, 270, 'a blocked facing direction offers the other side for aiming');
  assert.equal(throwDistraction(exp, 270).ok, true);
});

function lureScenario(locationId = 'warehouse') {
  const { exp } = create(locationId, { parts: 3 });
  const npc = exp.npcs[0];
  exp.player.x = 610;
  exp.player.floor = npc.floor;
  exp.player.hidden = true;
  exp.player.sneaking = true;
  for (const door of exp.doors) { door.open = true; door.locked = false; }
  npc.x = 1000;
  npc.facing = 1;
  return { exp, npc };
}

test('an unseen guard walks toward the landing without teleporting or losing hostility', () => {
  const { exp, npc } = lureScenario();
  assert.equal(throwDistraction(exp, 850).ok, true);
  assert.equal(exp.player.hidden, true, 'a concealed throw stays concealed');
  stepExpedition(exp, 0.1);
  assert.equal(npc.state, 'investigate');
  assert.deepEqual(npc.lastKnown, { x: 850, floor: 0 });
  assert.ok(npc.x < 1000 && npc.x > 980);
  assert.equal(npc.hostile, true);
  advance(exp, 1.5);
  assert.ok(Math.abs(npc.x - 850) < 0.01);
  assert.equal(npc.state, 'investigate');
  assert.equal(exp.stats.detected, 0);
  assert.equal(exp.player.x, 610);
});

test('a neutral resident investigates noise without acquiring aggression or revoked permission', () => {
  const { exp, npc } = lureScenario('clinic');
  exp.locationState.permissions.clinic_supplies = { area: true, loot: false };
  assert.equal(throwDistraction(exp, 850).ok, true);
  stepExpedition(exp, 0.1);
  assert.equal(npc.state, 'investigate');
  assert.equal(npc.aggression, 0);
  assert.equal(npc.hostile, false);
  assert.deepEqual(exp.locationState.hostileNpcIds, []);
  assert.deepEqual(exp.locationState.permissions.clinic_supplies, { area: true, loot: false });
  assert.equal(exp.stats.theft, 0);
});

test('sight and a committed attack outrank a distracting sound', () => {
  for (const attacking of [false, true]) {
    const { exp, npc } = lureScenario();
    exp.player.hidden = false;
    exp.player.x = 950;
    npc.x = 1000;
    npc.facing = -1;
    if (attacking) { npc.state = 'attack'; npc.windup = 0.4; }
    assert.equal(throwDistraction(exp, 1150).ok, true);
    stepExpedition(exp, 0.1);
    assert.equal(npc.state, 'attack');
    assert.ok(npc.windup > 0);
    assert.notDeepEqual(npc.lastKnown, { x: 1150, floor: 0 });
  }
});

test('a lure cannot be heard through a closed door or from another floor', () => {
  const { exp, npc } = lureScenario('clinic');
  const door = exp.doors.find(entry => entry.floor === 1);
  door.open = false;
  assert.equal(throwDistraction(exp, 850).ok, true);
  stepExpedition(exp, 0.1);
  assert.equal(npc.state, 'patrol');
  assert.notDeepEqual(npc.lastKnown, { x: 850, floor: 1 });
  const other = lureScenario();
  other.npc.floor = 1;
  other.npc.originFloor = 1;
  assert.equal(throwDistraction(other.exp, 850).ok, true);
  stepExpedition(other.exp, 0.1);
  assert.equal(other.npc.state, 'patrol');
  assert.notDeepEqual(other.npc.lastKnown, { x: 850, floor: 0 });
});

test('held distraction input is a rising edge even after its cooldown expires', () => {
  const { exp } = create('cottage', { parts: 3 });
  advance(exp, 9, { distraction: true, distractionTarget: { x: 300, floor: 0 } });
  assert.equal(exp.stats.distractions, 1);
  assert.equal(exp.bag.parts, 2);
  stepExpedition(exp, 0.1, { distraction: false });
  stepExpedition(exp, 0.1, { distraction: true, distractionTarget: { x: 300, floor: 0 } });
  assert.equal(exp.stats.distractions, 2);
});

test('a saved lure preserves paid inventory, timers, destination and investigation', () => {
  const { exp } = lureScenario();
  throwDistraction(exp, 850);
  advance(exp, 0.5);
  const resumed = restoreExpedition(JSON.parse(JSON.stringify(exp)));
  assert.ok(resumed);
  assert.deepEqual(resumed.distraction, exp.distraction);
  assert.equal(resumed.distractionCooldown, exp.distractionCooldown);
  assert.deepEqual(resumed.bag, exp.bag);
  assert.equal(resumed.npcs[0].state, 'investigate');
  advance(resumed, 1.1);
  assert.ok(Math.abs(resumed.npcs[0].x - 850) < 0.01);
  const result = returnHome(resumed, true);
  assert.equal(result.result.distractions, 1);
  assert.ok(isValidExpedition(resumed));
});

test('v3 fields migrate harmlessly and malformed distraction data is rejected', () => {
  const { exp } = create('cottage', { parts: 2 });
  delete exp.distraction;
  delete exp.distractionCooldown;
  delete exp.stats.distractions;
  delete exp._distractionHeld;
  const before = JSON.stringify(exp);
  const migrated = restoreExpedition(exp);
  assert.equal(JSON.stringify(exp), before);
  assert.equal(migrated.distraction, null);
  assert.equal(migrated.distractionCooldown, 0);
  assert.equal(migrated.stats.distractions, 0);
  throwDistraction(migrated, 300);
  for (const mutate of [
    data => { data.distraction.floor = 4; },
    data => { data.distraction.x = 2000; },
    data => { data.distraction.total = 9; },
    data => { data.distraction.remaining = -1; },
    data => { data.distractionCooldown = 30; },
    data => { data.stats.distractions = -1; },
    data => { data.stats.distractions = 101; },
    data => { data._distractionHeld = 'yes'; },
    data => { data.noises[0].kind = 'unknown'; },
    data => { data.noises[0].remaining = 10; },
    data => { data.noises[0].aggressive = true; }
  ]) {
    const bad = JSON.parse(JSON.stringify(migrated));
    mutate(bad);
    assert.equal(isValidExpedition(bad), false);
    assert.equal(restoreExpedition(bad), null);
  }
  const finished = JSON.parse(JSON.stringify(migrated));
  returnHome(finished, true);
  finished.result.distractions = 101;
  assert.equal(isValidExpedition(finished), false);
  assert.equal(restoreExpedition(finished), null);
});

test('navigation and throw previews are immutable and reveal only discovered marks', () => {
  const { exp } = create('warehouse', { parts: 1 });
  const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
  const before = JSON.stringify(exp);
  freeze(exp);
  const nav = getNavigation(exp);
  const option = getDistraction(exp);
  assert.equal(option.available, true);
  assert.equal(JSON.stringify(exp), before);
  assert.equal(nav.floor, 0);
  assert.ok(nav.exploredPercent > 0 && nav.exploredPercent < 20);
  assert.deepEqual(nav.marks.npcs, []);
  assert.deepEqual(nav.marks.loot.map(loot => loot.id), ['warehouse_outer']);
  assert.ok(nav.marks.loot.every(loot => !Object.hasOwn(loot, 'items')));
  assert.deepEqual(nav.marks.doors, []);
  assert.deepEqual(nav.marks.hides, []);
  assert.deepEqual(nav.marks.stairs.map(stair => stair.id), ['stairs_west']);
  assert.equal(nav.exit.reached, true);
  assert.equal(nav.exit.distance, 0);
  assert.deepEqual(nav.exit.route, [{ x: 100, floor: 0 }]);
});

test('a real stair journey produces a known return route and remembered marks without NPC memory', () => {
  const { exp } = create();
  arrive(exp, 1030, 2);
  const nav = getNavigation(exp);
  assert.equal(nav.exit.knownRoute, true);
  assert.equal(nav.exit.blockedDoorId, null);
  assert.ok(nav.exit.route.some(point => point.x === 800 && point.floor === 1));
  assert.ok(nav.exit.route.some(point => point.x === 280 && point.floor === 0));
  assert.deepEqual(nav.exit.route.at(-1), { x: 100, floor: 0 });
  assert.equal(nav.exit.distance, 1180);
  assert.ok(nav.marks.loot.some(loot => loot.id === 'cottage_entry' && !loot.visible));
  assert.ok(nav.exploredPercent > 40);
  arrive(exp, 100, 0);
  assert.equal(getNavigation(exp).exit.reached, true);
});

test('return guidance clips at a closed door and does not invent a route through unknown rooms', () => {
  const { exp } = create();
  arrive(exp, 700, 0);
  const door = exp.doors.find(entry => entry.floor === 0);
  arrive(exp, 530, 0);
  assert.equal(interact(exp, { type: 'door', id: door.id }).ok, true);
  const nav = getNavigation(exp);
  assert.equal(nav.exit.knownRoute, true);
  assert.equal(nav.exit.distance, 430);
  assert.equal(nav.exit.blockedDoorId, door.id);
  assert.deepEqual(nav.exit.route.at(-1), { x: 518, floor: 0 });
  const distant = create().exp;
  distant.player.x = 1100;
  distant.player.floor = 2;
  const unknown = getNavigation(distant);
  assert.equal(unknown.exit.knownRoute, false);
  assert.equal(unknown.exit.distance, null);
  assert.deepEqual(unknown.exit.route, [{ x: 1100, floor: 2 }]);
});

test('a legal day-five expedition can open the room, hide, lure its guard and return without detection', () => {
  const state = createGame(31);
  for (let day = 1; day < 5; day++) {
    assert.equal(endDay(state).ok, true);
    assert.equal(beginNight(state, { scavengerId: null, roles: Object.fromEntries(state.characters.filter(actor => actor.alive).map(actor => [actor.id, 'sleep'])), loadout: {} }).ok, true);
    assert.equal(finishNight(state, {}).ok, true);
    assert.equal(nextDay(state).ok, true);
  }
  endDay(state);
  assert.equal(beginNight(state, { scavengerId: 'leo', locationId: 'warehouse', roles: { mira: 'guard', yun: 'guard', leo: 'scavenge' }, loadout: { parts: 2 } }).ok, true);
  const exp = createExpedition({}, state);
  const initialHealth = exp.player.health;
  const walkQuietly = x => {
    moveTo(exp, x, 0);
    for (let frame = 0; frame < 1000 && !exp.done; frame++) {
      stepExpedition(exp, 0.1, { sneak: true });
      if (!exp.player.route.length && !exp.player.climb) break;
    }
    assert.equal(exp.player.x, x);
  };
  walkQuietly(660);
  assert.equal(interact(exp, { type: 'door', id: 'warehouse_loading_door' }).ok, true);
  walkQuietly(610);
  assert.equal(interact(exp, { type: 'hide', id: 'hide_ground' }).hidden, true);
  assert.equal(throwDistraction(exp, 850).ok, true);
  advance(exp, 3.5, { sneak: true });
  assert.equal(exp.npcs[0].state, 'investigate');
  assert.equal(exp.npcs[0].x, 850);
  assert.equal(exp.stats.detected, 0);
  assert.equal(exp.player.health, initialHealth);
  walkQuietly(100);
  const returned = returnHome(exp);
  assert.equal(returned.ok, true);
  assert.equal(returned.result.late, false);
  assert.equal(returned.result.distractions, 1);
  assert.deepEqual(returned.result.bag, { parts: 1 });
  assert.ok(exp.time < 17);
  assert.equal(finishNight(state, returned.result).ok, true);
  assert.ok(isValidSave(state));
});
