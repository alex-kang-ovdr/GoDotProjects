'use strict';

// Isolated campaign-rule tests execute the shipped data, engine and campaign in
// a VM. Every rule decision uses its production API. Explicit fixture helpers
// below may skip travel, damage a requirement, or weaken a tactical opponent so
// a single boundary can be tested without replaying an entire voyage. These
// fixtures are not no-cheat runs; tests/playthrough.cjs supplies that evidence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const filename of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', filename), 'utf8'), context, { filename });
}
const SW = context.Starward;
const copy = value => JSON.parse(JSON.stringify(value));
const ok = result => result === true || result?.ok === true;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-7, `${label}: ${actual} vs ${expected}`);
const fresh = (loadoutId = 'argo') => new SW.Game(42, { loadoutId, difficulty: 'standard' });
const beacon = (game, id = game.state.currentNodeId) => game.state.nodes.find(n => n.id === id);
function runUntil(game, predicate, seconds = 100) {
  for (let i = 0; i < seconds * 30 && !predicate(); i++) game.tick(1 / 30);
  assert.ok(predicate(), 'condition reached within ' + seconds + ' simulated seconds');
}
function finishReward(game) {
  assert.equal(game.state.mode, 'reward');
  if (game.state.reward.salvage?.status === 'pending') assert.ok(ok(game.resolveSalvage('scrap')));
  assert.ok(ok(game.continueReward()));
}
const earnedStart = new Map();
function mapGame(loadoutId = 'argo') {
  if (!earnedStart.has(loadoutId)) {
    const game = fresh(loadoutId);
    assert.ok(ok(game.startRun()));
    for (const w of game.state.player.weapons) {
      game.setWeaponAuto(w.id, true);
      assert.ok(ok(w.type === 'beam' ? game.targetBeam(w.id, 'engines', 'weapons') : game.targetWeapon(w.id, 'weapons')));
    }
    game.setPaused(false);
    runUntil(game, () => game.state.mode === 'reward');
    finishReward(game);
    earnedStart.set(loadoutId, game.serialize());
  }
  const game = fresh(loadoutId);
  assert.equal(game.load(earnedStart.get(loadoutId)), true);
  return game;
}
function assertRoundtrip(game) {
  const restored = fresh();
  assert.equal(game.validateCampaignV6(game.state), true, 'campaign invariant');
  assert.equal(restored.load(game.serialize()), true, 'production loader accepts state');
  assert.equal(restored.serialize(), game.serialize(), 'v6 roundtrip preserves the full state');
  return restored;
}
function rejectWithoutMutation(game, operation) {
  const before = game.serialize();
  const answer = operation();
  assert.equal(ok(answer), false);
  assert.equal(game.serialize(), before, 'failed command must not change gameplay state');
  return answer;
}

// A bounded travel fixture: only place the map cursor at the current exit and
// mark that beacon reached. The real advanceSector API still validates the
// world edge, consumes fuel, builds the next map and places queued quests.
function fixtureAtExit(game) {
  const exit = beacon(game, `s${game.state.sector}-exit`);
  Object.assign(exit, { visited: true, visits: Math.max(1, exit.visits), resolved: true, discovered: true });
  game.state.currentNodeId = exit.id;
  game.state.mode = 'map';
  game.state.campaign.pendingSectorChoice = true;
}
function nextSector(game) {
  fixtureAtExit(game);
  const world = game.getWorldMap();
  const choice = world.nodes.find(n => world.availableIds.includes(n.id) && n.category === 'friendly') || world.nodes.find(n => world.availableIds.includes(n.id));
  assert.ok(ok(game.advanceSector(choice.id)));
}
function fixtureSector(game, depth) { while (game.state.sector < depth) nextSector(game); }
function fixtureMapPosition(game, id) {
  const n = beacon(game, id);
  Object.assign(n, { visited: true, visits: Math.max(1, n.visits), discovered: true });
  game.state.currentNodeId = id;
}

const safeChoices = ['relay_repair', 'relay_salvage', 'refugee_listen', 'merchant_pass', 'wreck_safe', 'clinic_treat', 'ambush_leave', 'workshop_parts', 'castaway_supplies', 'observatory_chart', 'quarantine_leave', 'checkpoint_pay', 'smuggler_leave', 'reactor_safe', 'blueprint_leave'];
function settleOrdinaryStop(game) {
  if (game.state.mode === 'event') {
    assert.notEqual(game.state.event.kind, 'quest', 'only the requested quest endpoint remains unresolved');
    const choice = safeChoices.map(id => game.state.event.choices.find(c => c.id === id && !c.disabled)).find(Boolean);
    assert.ok(choice, 'ordinary event has an available noncombat resolution');
    assert.ok(ok(game.chooseEvent(choice.id)));
  }
  if (game.state.mode === 'reward') finishReward(game);
  if (game.state.mode === 'shop') assert.ok(ok(game.leaveShop()));
  assert.equal(game.state.mode, 'map');
}
function walkTo(game, targetId) {
  const costs = new Map([[game.state.currentNodeId, 0]]), previous = new Map(), todo = [game.state.currentNodeId];
  while (todo.length) {
    todo.sort((a, b) => costs.get(a) - costs.get(b));
    const id = todo.shift();
    if (id === targetId) break;
    for (const next of beacon(game, id).links) {
      const n = beacon(game, next);
      const weight = next === targetId ? 1 : n.occupied ? 1000 : n.type === 'combat' && !n.resolved ? 100 : n.type === 'event' && !n.resolved ? 2 : 1;
      const value = costs.get(id) + weight;
      if (value < (costs.get(next) ?? Infinity)) { costs.set(next, value); previous.set(next, id); if (!todo.includes(next)) todo.push(next); }
    }
  }
  assert.ok(costs.has(targetId), 'production graph connects quest destination');
  const route = [];
  for (let at = targetId; at !== game.state.currentNodeId; at = previous.get(at)) route.unshift(at);
  for (const id of route) {
    assert.ok(ok(game.jump(id)), `jump to ${id}`);
    if (id !== targetId) settleOrdinaryStop(game);
  }
}
function acceptNaturalQuest(definitionId) {
  const game = mapGame();
  const depth = { relay: 1, escort: 2, blueprint: 3 }[definitionId];
  fixtureSector(game, depth);
  assert.ok(ok(game.jump(`s${depth}-1-1`)));
  assert.equal(game.state.event.definitionId, { relay: 'relay', escort: 'refugees', blueprint: 'blueprint' }[definitionId]);
  assert.ok(ok(game.chooseEvent({ relay: 'relay_quest', escort: 'refugee_quest', blueprint: 'blueprint_quest' }[definitionId])));
  finishReward(game);
  const quest = game.getQuestLog().find(q => q.definitionId === definitionId);
  assert.ok(quest && quest.status === 'active' && quest.targetNodeId);
  return { game, questId: quest.id };
}
function eventFixture(definitionId, loadoutId = 'argo') {
  const game = mapGame(loadoutId);
  // The only event fixture edit chooses which authentic DATA event is assigned
  // to an existing unvisited beacon. jump()/chooseEvent() handle everything else.
  beacon(game, 's1-1-1').eventId = definitionId;
  assert.ok(ok(game.jump('s1-1-1')));
  return game;
}

test('expanded world has eight depths, 20 regions and connected symmetric local beacons; map queries are pure', () => {
  const game = fresh(), before = game.serialize();
  const world = game.getWorldMap();
  assert.equal(world.totalSectors, 8); assert.equal(world.nodes.length, 20);
  for (let depth = 1; depth <= 8; depth++) assert.equal(world.nodes.filter(n => n.depth === depth).length, depth === 1 || depth === 8 ? 1 : 3);
  for (const n of world.nodes) for (const id of n.links) assert.equal(world.nodes.find(x => x.id === id).depth, n.depth + 1);
  assert.equal(game.state.nodes.length, 20);
  const reached = new Set([game.state.currentNodeId]), queue = [game.state.currentNodeId];
  while (queue.length) for (const id of beacon(game, queue.shift()).links) if (!reached.has(id)) { reached.add(id); queue.push(id); }
  assert.equal(reached.size, 20); assert.ok(reached.has('s1-exit'));
  for (const n of game.state.nodes) for (const id of n.links) assert.ok(beacon(game, id).links.includes(n.id));
  game.getFleetInfo('s1-1-0'); game.getJumpStatus('s1-1-0'); game.getQuestLog();
  assert.equal(game.serialize(), before);
  assert.deepEqual(copy(fresh().getWorldMap()), copy(world), 'same seed preserves all world branches');
});

test('sector transition requires a reached exit and a linked world choice, and charges exactly one movement', () => {
  const game = mapGame();
  rejectWithoutMutation(game, () => game.advanceSector('w2-0'));
  fixtureAtExit(game);
  rejectWithoutMutation(game, () => game.advanceSector('w3-0'));
  const fuel = game.state.resources.fuel, jumps = game.state.stats.jumps, turns = game.state.campaign.mapTurns;
  const destination = game.getWorldMap().availableIds[1];
  assert.ok(ok(game.advanceSector(destination)));
  assert.equal(game.state.sector, 2); assert.equal(game.state.resources.fuel, fuel - 1);
  assert.equal(game.state.stats.jumps, jumps + 1); assert.equal(game.state.campaign.mapTurns, turns + 1);
  assert.equal(game.getWorldMap().currentId, destination); assert.equal(game.state.campaign.pendingSectorChoice, false);
  assert.equal(game.state.currentNodeId, 's2-start'); assertRoundtrip(game);
});

test('revisiting a resolved repair beacon charges fuel and pursuit without repeating reward or crew healing', () => {
  const game = mapGame();
  assert.ok(ok(game.jump('s1-1-2'))); finishReward(game);
  const member = game.state.player.crew[0]; member.hp -= 15; // isolated healing boundary
  const hp = member.hp, hull = game.state.player.hull, resources = copy(game.state.resources), fleet = game.state.fleet, victories = game.state.campaign.normalVictories;
  assert.ok(ok(game.jump('s1-start'))); assert.ok(ok(game.jump('s1-1-2')));
  assert.equal(game.state.mode, 'map'); assert.equal(game.state.reward, null);
  assert.equal(game.state.resources.fuel, resources.fuel - 2);
  for (const id of ['scrap', 'missiles', 'droneParts']) assert.equal(game.state.resources[id], resources[id]);
  near(game.state.fleet, fleet + 1.5, 'two ordinary pursuit turns');
  assert.equal(member.hp, hp); assert.equal(game.state.player.hull, hull);
  assert.equal(game.state.campaign.normalVictories, victories); assert.equal(beacon(game).visits, 2);
  assertRoundtrip(game);
});

test('pursuit forecast uses the destination nebula, sector kind and remaining delay before actual movement', () => {
  for (const [kind, factor] of [['civilian', 0.5], ['nebula', 0.8]]) {
    const game = mapGame(), target = beacon(game, 's1-1-2');
    target.nebula = true; game.state.campaign.world.nodes.find(n => n.id === 'w1-0').kind = kind;
    game.state.campaign.fleetDelay = 0.2; // explicit delayed-front boundary fixture
    const forecast = game.getFleetInfo(target.id), before = game.state.fleet;
    near(forecast.nextAdvance, 0.75 * factor - 0.2, 'net destination advance');
    assert.ok(ok(game.jump(target.id)));
    near(game.state.fleet - before, forecast.nextAdvance, 'forecast equals committed front');
    near(game.state.campaign.fleetDelay, 0, 'delay is consumed once');
  }
});

test('shop stock is finite, a sold-out purchase is atomic, and revisits plus reload preserve the remaining stock', () => {
  const game = mapGame();
  game.jump('s1-1-1'); game.chooseEvent('relay_salvage'); finishReward(game); game.jump('s1-2-0');
  assert.equal(game.state.mode, 'shop');
  for (let i = 0; i < 4; i++) assert.ok(ok(game.buy('fuel')));
  assert.equal(game.shopItems().find(i => i.id === 'fuel').stock, 0);
  assert.equal(game.shopItems().find(i => i.id === 'fuel').soldOut, true);
  rejectWithoutMutation(game, () => game.buy('fuel'));
  game.leaveShop(); game.jump('s1-1-1'); game.jump('s1-2-0');
  assert.equal(game.shopItems().find(i => i.id === 'fuel').stock, 0);
  const restored = assertRoundtrip(game);
  assert.equal(restored.shopItems().find(i => i.id === 'fuel').soldOut, true);
});

test('a shop overrun by the next pursuit step starts a rebel encounter and cannot sell or reset its inventory', () => {
  const game = mapGame();
  game.jump('s1-1-1'); game.chooseEvent('relay_salvage'); finishReward(game); game.jump('s1-2-0');
  assert.ok(ok(game.buy('fuel'))); game.leaveShop();
  fixtureMapPosition(game, 's1-1-1'); game.state.fleet = 3.5; // front just before the store
  const store = copy(beacon(game, 's1-2-0').store), scrap = game.state.resources.scrap;
  assert.equal(game.getJumpStatus('s1-2-0').occupied, true, 'warning includes the arrival advance');
  assert.ok(ok(game.jump('s1-2-0')));
  assert.equal(game.state.mode, 'combat'); assert.equal(game.state.campaign.encounter.kind, 'fleet');
  assert.equal(beacon(game).occupied, true); assert.deepEqual(copy(beacon(game).store), store);
  rejectWithoutMutation(game, () => game.buy('fuel'));
  assert.equal(game.state.resources.scrap, scrap);
});

test('a stale blue option rechecks damaged equipment before charging resources or changing the outcome', () => {
  const game = eventFixture('wreck', 'wraith');
  assert.equal(game.state.event.choices.find(c => c.id === 'wreck_cloak').disabled, false);
  game.allocatePower('cloaking', -game.state.player.aux.cloaking.power);
  game.state.player.aux.cloaking.damage = game.state.player.aux.cloaking.level; // requirement changes after display
  const before = { resources: copy(game.state.resources), hull: game.state.player.hull, rng: game.state.rng, nextId: game.state.nextId, quests: copy(game.getQuestLog()) };
  const answer = game.chooseEvent('wreck_cloak');
  assert.equal(answer.ok, false); assert.ok(answer.message.includes('은폐'));
  assert.deepEqual(copy(game.state.resources), before.resources); assert.equal(game.state.player.hull, before.hull);
  assert.equal(game.state.rng, before.rng); assert.equal(game.state.nextId, before.nextId); assert.deepEqual(copy(game.getQuestLog()), before.quests);
  assert.equal(game.state.event.choices.find(c => c.id === 'wreck_cloak').disabled, true, 'only the displayed availability is refreshed');
});

test('follow-up choices charge once and a weighted event restored before selection yields the same saved result', () => {
  const game = eventFixture('smuggler'), initial = copy(game.state.resources);
  assert.ok(ok(game.chooseEvent('smuggler_inspect')));
  assert.equal(game.state.event.definitionId, 'smuggler_offer'); assert.deepEqual(copy(game.state.resources), initial);
  const restored = assertRoundtrip(game);
  assert.ok(ok(restored.chooseEvent('smuggler_buy')));
  assert.equal(restored.state.resources.scrap, initial.scrap - 20);
  assert.equal(restored.state.resources.fuel, initial.fuel + 4); assert.equal(restored.state.resources.droneParts, initial.droneParts + 2);
  rejectWithoutMutation(restored, () => restored.chooseEvent('smuggler_buy'));
  const risk = eventFixture('wreck'), same = assertRoundtrip(risk);
  assert.ok(ok(risk.chooseEvent('wreck_deep'))); assert.ok(ok(same.chooseEvent('wreck_deep')));
  assert.equal(same.serialize(), risk.serialize(), 'selection consumes the same persisted RNG state once');
});

test('the naturally placed relay quest crosses a real sector transition, completes, and cannot duplicate its reward', () => {
  const { game, questId } = acceptNaturalQuest('relay');
  walkTo(game, game.getQuestLog().find(q => q.id === questId).targetNodeId);
  assert.ok(ok(game.chooseEvent('quest_relay_engi'))); finishReward(game);
  let quest = game.getQuestLog().find(q => q.id === questId);
  assert.equal(quest.stage, 1); assert.equal(quest.targetNodeId, null); assert.equal(quest.targetSector, 2);
  nextSector(game); quest = game.getQuestLog().find(q => q.id === questId);
  assert.ok(quest.targetNodeId); assert.equal(quest.targetSectorId, game.getWorldMap().currentId);
  walkTo(game, quest.targetNodeId); const before = copy(game.state.resources);
  assert.ok(ok(game.chooseEvent('quest_relay_deliver')));
  assert.equal(game.state.resources.scrap, before.scrap + 32); assert.equal(game.state.resources.fuel, before.fuel + 4);
  quest = game.getQuestLog().find(q => q.id === questId);
  assert.equal(quest.status, 'completed'); assert.ok(quest.history.some(h => h.text.includes('완료')));
  rejectWithoutMutation(game, () => game.chooseEvent('quest_relay_deliver'));
  assertRoundtrip(game);
});

test('the natural escort quest has two destinations and supports both completion and explicit abandonment', () => {
  const { game, questId } = acceptNaturalQuest('escort');
  const first = game.getQuestLog().find(q => q.id === questId).targetNodeId;
  walkTo(game, first); assert.ok(ok(game.chooseEvent('quest_escort_pay'))); finishReward(game);
  const next = game.getQuestLog().find(q => q.id === questId);
  assert.equal(next.stage, 1); assert.notEqual(next.targetNodeId, first);
  walkTo(game, next.targetNodeId); assert.ok(ok(game.chooseEvent('quest_escort_supplies')));
  assert.equal(game.getQuestLog().find(q => q.id === questId).status, 'completed'); assertRoundtrip(game);
  const abandoned = acceptNaturalQuest('escort');
  walkTo(abandoned.game, abandoned.game.getQuestLog()[0].targetNodeId);
  assert.ok(ok(abandoned.game.chooseEvent('quest_abandon')));
  const record = abandoned.game.getQuestLog()[0];
  assert.equal(record.status, 'abandoned'); assert.ok(record.history.at(-1).text.includes('포기'));
  assert.equal(abandoned.game.state.nodes.some(n => n.questId === record.id), false);
});

test('the natural blueprint quest delivers a real equipment receipt and a conditional mind-system reward', () => {
  const prepared = acceptNaturalQuest('blueprint'), game = prepared.game;
  walkTo(game, game.getQuestLog()[0].targetNodeId);
  assert.ok(ok(game.chooseEvent('quest_blueprint_rock'))); finishReward(game); nextSector(game);
  walkTo(game, game.getQuestLog()[0].targetNodeId);
  const alternative = assertRoundtrip(game);
  assert.ok(ok(game.chooseEvent('quest_blueprint_beam')));
  assert.equal(game.getQuestLog()[0].status, 'completed');
  assert.equal(game.state.reward.salvage.item.kind, 'weapon'); assert.equal(game.state.reward.salvage.item.defId, 'beam');
  assert.equal(game.state.reward.salvage.status, 'pending');
  assert.ok(ok(game.resolveSalvage('claim'))); assert.ok(game.state.cargo.some(i => i.defId === 'beam'));
  rejectWithoutMutation(game, () => game.resolveSalvage('claim'));
  assert.ok(ok(alternative.chooseEvent('quest_blueprint_mind')));
  assert.equal(alternative.state.player.aux.mind.level, 1); assert.equal(alternative.getQuestLog()[0].status, 'completed');
  assertRoundtrip(game); assertRoundtrip(alternative);
});

test('quest expiry, occupation and unavailable destination end or defer the actual quest with durable history', () => {
  const expired = acceptNaturalQuest('relay');
  expired.game.state.campaign.quests[0].deadlineTurn = expired.game.state.campaign.mapTurns; // next-turn boundary fixture
  assert.ok(ok(expired.game.jump('s1-2-0')));
  assert.equal(expired.game.getQuestLog()[0].status, 'failed'); assert.ok(expired.game.getQuestLog()[0].history.at(-1).text.includes('기한'));
  const overrun = acceptNaturalQuest('relay'), q = overrun.game.state.campaign.quests[0];
  overrun.game.state.fleet = beacon(overrun.game, q.targetNodeId).col + 2 - 0.5;
  assert.ok(ok(overrun.game.jump('s1-2-0')));
  assert.equal(overrun.game.getQuestLog()[0].status, 'failed'); assert.ok(overrun.game.getQuestLog()[0].history.at(-1).text.includes('점령'));
  const queued = mapGame(); queued.jump('s1-1-1');
  for (const n of queued.state.nodes) if (['event', 'combat', 'empty'].includes(n.type) && n.id !== queued.state.currentNodeId) n.resolved = true; // no eligible destination remains
  assert.ok(ok(queued.chooseEvent('relay_quest')));
  assert.equal(queued.getQuestLog()[0].targetNodeId, null); assert.equal(queued.getQuestLog()[0].targetSector, 2);
  assert.ok(queued.getQuestLog()[0].history.some(h => h.text.includes('다음 섹터')));
  const final = acceptNaturalQuest('escort').game;
  const active = final.state.campaign.quests[0];
  active.targetNodeId = null; active.targetSectorId = null; active.targetDepth = 8; active.deadlineTurn = 1000;
  for (const n of final.state.nodes) if (n.questId === active.id) n.questId = null; // explicit carry-to-final placement boundary
  fixtureSector(final, 8);
  assert.equal(final.getQuestLog()[0].status, 'failed'); assert.ok(final.getQuestLog()[0].history.at(-1).text.includes('최종'));
  assertRoundtrip(final);
});

test('escapeTo waits for real FTL readiness, rejects nonadjacent exits atomically, then moves once without victory reward', () => {
  const game = mapGame(); assert.ok(ok(game.jump('s1-1-0')));
  for (const w of game.state.player.weapons) game.setWeaponAuto(w.id, false);
  for (const w of game.state.enemy.weapons) { w.enabled = false; w.auto = false; w.fireMode = 'manual'; }
  game.state.enemy.aiTimer = 10000; // quiet opponent fixture; FTL still charges through engine ticks
  rejectWithoutMutation(game, () => game.escapeTo('s1-exit'));
  game.setPaused(false); runUntil(game, () => game.getEscapeStatus().ok, 120);
  rejectWithoutMutation(game, () => game.escapeTo('s1-exit'));
  const fuel = game.state.resources.fuel, scrap = game.state.resources.scrap, jumps = game.state.stats.jumps, kills = game.state.stats.kills, wins = game.state.campaign.normalVictories;
  assert.ok(ok(game.escapeTo('s1-start')));
  assert.equal(game.state.currentNodeId, 's1-start'); assert.equal(game.state.mode, 'map');
  assert.equal(game.state.resources.fuel, fuel - 1); assert.equal(game.state.stats.jumps, jumps + 1);
  assert.equal(game.state.resources.scrap, scrap); assert.equal(game.state.stats.kills, kills); assert.equal(game.state.campaign.normalVictories, wins);
  assert.equal(game.state.reward, null); assert.equal(game.state.enemy, null); assert.equal(game.state.projectiles.length, 0); assertRoundtrip(game);
});

test('final-sector waiting moves the flagship, can intercept without fuel, and loses after three unopposed base turns', () => {
  const game = mapGame(); fixtureSector(game, 8);
  const fuel = game.state.resources.fuel, jumps = game.state.stats.jumps, resources = copy(game.state.resources), hull = game.state.player.hull;
  const first = game.state.campaign.finalStand.bossNodeId;
  assert.ok(ok(game.waitAtBeacon())); assert.ok(ok(game.waitAtBeacon()));
  assert.notEqual(game.state.campaign.finalStand.bossNodeId, first);
  assert.equal(game.state.resources.fuel, fuel); assert.equal(game.state.stats.jumps, jumps);
  assert.equal(game.state.player.hull, hull); assert.deepEqual(copy(game.state.resources), resources);
  fixtureMapPosition(game, game.state.campaign.finalStand.baseNodeId);
  for (let i = 0; game.state.mode === 'map' && i < 8; i++) assert.ok(ok(game.waitAtBeacon()));
  assert.equal(game.state.mode, 'combat'); assert.equal(game.state.campaign.encounter.kind, 'boss'); assert.equal(game.state.resources.fuel, fuel);
  const lost = mapGame(); fixtureSector(lost, 8);
  for (let i = 0; lost.state.mode === 'map' && i < 12; i++) assert.ok(ok(lost.waitAtBeacon()));
  assert.equal(lost.state.mode, 'defeat'); assert.equal(lost.state.campaign.finalStand.baseTurns, 3);
  assert.equal(lost.state.stats.jumps, 7, 'only the seven sector-transition fixture movements count as jumps');
  assertRoundtrip(lost);
});

function weakBossFixture(game) {
  const enemy = game.state.enemy;
  // Isolate campaign phase hand-off using a one-hit, shieldless real opponent.
  // The engine must still charge, launch, resolve damage and call onCombatEnd.
  enemy.hull = 1; enemy.shield = 0; enemy.maxShield = 0;
  Object.assign(enemy.systems.shields, { level: 0, power: 0, desiredPower: 0, damage: 0 });
  enemy.aiTimer = 10000;
  for (const w of enemy.weapons) { w.enabled = false; w.auto = false; w.fireMode = 'manual'; }
  for (const w of game.state.player.weapons) game.setWeaponAuto(w.id, false);
  const beam = game.state.player.weapons.find(w => w.type === 'beam');
  game.setWeaponAuto(beam.id, true); assert.ok(ok(game.targetBeam(beam.id, 'engines', 'engines')));
  game.setPaused(false); runUntil(game, () => game.state.mode !== 'combat', 25);
}
test('phase hand-off avoids a same-beacon trap and actual phase-three damage resolves the full campaign as victory', () => {
  const game = mapGame(); fixtureSector(game, 8);
  assert.ok(ok(game.receiveEquipment('weapon', 'beam', 'auto'))); // tactical loadout fixture
  game.state.player.reactor = 24; game.state.player.systems.weapons.level = 5;
  game.allocatePower('weapons', 5 - game.state.player.systems.weapons.power);
  const stand = game.state.campaign.finalStand;
  fixtureMapPosition(game, stand.baseNodeId); stand.phase = 2; stand.routeIndex = 3; stand.bossNodeId = stand.baseNodeId;
  const fuel = game.state.resources.fuel, turns = game.state.campaign.mapTurns;
  const status = game.getJumpStatus(game.state.currentNodeId);
  assert.equal(status.ok, true); assert.equal(status.fuelCost, 0);
  assert.ok(ok(game.jump(game.state.currentNodeId)));
  assert.equal(game.state.resources.fuel, fuel); assert.equal(game.state.campaign.mapTurns, turns);
  weakBossFixture(game); assert.equal(game.state.mode, 'reward'); finishReward(game);
  assert.equal(stand.phase, 3); assert.notEqual(stand.bossNodeId, game.state.currentNodeId);
  assert.ok(ok(game.jump(stand.bossNodeId))); weakBossFixture(game);
  assert.equal(game.state.mode, 'victory'); assert.equal(game.state.campaign.bossInProgress, false); assert.equal(game.state.reward, null);
  assertRoundtrip(game);
});

test('malformed campaign imports are rejected atomically for world edges, local paths, stock and quest references', () => {
  const { game } = acceptNaturalQuest('relay'); game.jump('s1-2-0'); game.leaveShop();
  assertRoundtrip(game);
  const edits = [
    s => { s.campaign.totalSectors = 3; },
    s => { s.campaign.world.currentId = 'absent'; },
    s => { s.campaign.world.route.push(s.campaign.world.currentId); },
    s => { s.campaign.world.nodes[1].links = [s.campaign.world.nodes[1].id]; },
    s => { s.nodes[0].links.splice(0, 1); },
    s => { s.nodes.find(n => n.store).store.stock.fuel = -1; },
    s => { s.campaign.quests[0].targetNodeId = 'absent'; },
    s => { s.campaign.quests[0].rewardClaimed = true; },
    s => { s.campaign.fleetDelay = -1; },
    s => { s.campaign.pendingSectorChoice = true; }
  ];
  for (const edit of edits) {
    const before = game.serialize(), candidate = JSON.parse(before); edit(candidate);
    assert.equal(game.load(JSON.stringify(candidate)), false, edit.toString());
    assert.equal(game.serialize(), before, 'invalid candidate leaves the current run intact');
  }
});
