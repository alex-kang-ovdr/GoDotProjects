'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, ITEMS } = require('../dist/game.js');
const Coach = require('../dist/coach.js');
const Tactical = require('../dist/tactical-ai.js');
const DEFINITIONS = Object.fromEntries(ITEMS.map(item => [item.id, item]));
const clone = value => JSON.parse(JSON.stringify(value));

function observedBattle(hero = 'lol_ahri') {
  const game = new Game({ hero, seed: 917 });
  game.start();
  const p = game.player;
  p.gold = 0; p.cs = 1; p.skillPoints = 0; p.hp = p.maxHp; p.mana = p.maxMana;
  p.inventory = hero === 'lol_ahri' ? ['lol_3108', 'lol_1001', 'lol_3089', 'lol_1057', 'lol_3067'] : [];
  game.isVisible = entity => entity.team === p.team;
  game.observedForTest = [];
  game.objectiveFactsForTest = {};
  game.getStructureObservations = () => clone(game.observedForTest);
  game.getObjectiveObservation = id => clone(game.objectiveFactsForTest[id] || { known: false, visible: false });
  return game;
}

function towerView(game, values = {}) {
  const tower = game.entities.find(entity => entity.id === 'tower-1-mid-outer');
  return { id: tower.id, type: tower.type, team: tower.team, x: tower.x, y: tower.y, r: tower.r,
    lane: tower.lane, structureTier: tower.structureTier, hp: 500, maxHp: tower.maxHp,
    alive: true, protected: false, observedAt: 12, visible: false, remembered: true, ...values };
}

test('v9 coach never completes a structure milestone from an unobserved destruction', () => {
  const game = observedBattle(), initial = Coach.read(game);
  game.entities.find(entity => entity.id === 'tower-1-mid-outer').alive = false;
  const after = Coach.read(game, initial.journey);
  assert.equal(initial.journey.completed.structure, false);
  assert.equal(after.journey.completed.structure, false);
  assert.deepEqual(after.advice, initial.advice);
});

test('v9 coach keeps the last observed tower target and protection until reobservation', () => {
  const game = observedBattle();
  game.observedForTest = [towerView(game)];
  const expected = Coach.read(game), originalObservation = clone(game.observedForTest);
  const actual = game.entities.find(entity => entity.id === 'tower-1-mid-outer');
  actual.alive = false; actual.hp = 0;
  const hidden = Coach.read(game, expected.journey);
  assert.equal(hidden.advice.id, 'push');
  assert.match(hidden.advice.title, /중앙 외곽 포탑/);
  assert.match(hidden.advice.description, /마지막 관측/);
  assert.deepEqual(hidden.advice, expected.advice);
  assert.equal(hidden.journey.completed.structure, false);
  assert.deepEqual(game.observedForTest, originalObservation);
  game.observedForTest = [towerView(game, { alive: false, hp: 0, visible: true, remembered: false, observedAt: 20 })];
  const seen = Coach.read(game, hidden.journey);
  assert.equal(seen.journey.completed.structure, true);
  assert.doesNotMatch(seen.advice.title, /중앙 외곽 포탑/);
});

test('v9 journey preserves already completed v1 milestones when their evidence is no longer visible', () => {
  const game = observedBattle();
  const previous = { version: 1, origin: { x: 100, y: 100 }, completed: { structure: true, cs: true, equipment: true } };
  const original = clone(previous);
  const result = Coach.read(game, previous);
  assert.equal(result.journey.version, 1);
  assert.equal(result.journey.completed.structure, true);
  assert.deepEqual(result.journey.origin, previous.origin);
  assert.deepEqual(previous, original);
});

test('v9 objective guidance asks for scouting and does not react to hidden spawn or death', () => {
  const game = observedBattle(), p = game.player;
  const dragon = game.entities.find(entity => entity.kind === 'dragon');
  p.level = 4; p.x = dragon.homeX - 200; p.y = dragon.homeY;
  const ally = game.entities.find(entity => entity.type === 'hero' && entity.team === p.team && !entity.isPlayer);
  ally.x = p.x; ally.y = p.y; ally.hp = ally.maxHp; ally.alive = true; ally.retreating = false; ally.recallLeft = 0;
  dragon.alive = true;
  const first = Coach.read(game).advice;
  dragon.alive = false; dragon.hp = 0; dragon.respawnAt = 1234;
  const hidden = Coach.read(game).advice;
  assert.equal(first.id, 'scout-dragon');
  assert.equal(first.action, 'dragon');
  assert.deepEqual(hidden, first);
  game.objectiveFactsForTest[dragon.id] = { known: true, visible: true, alive: true, observedAt: 40 };
  assert.equal(Coach.read(game).advice.id, 'objective-dragon');
  game.objectiveFactsForTest[dragon.id] = { known: true, visible: false, alive: false, respawnAt: 120, observedAt: 45 };
  dragon.alive = true;
  assert.notEqual(Coach.read(game).advice.id, 'objective-dragon');
  assert.notEqual(Coach.read(game).advice.id, 'scout-dragon');
});

test('v9 coach resumes scouting after an observed respawn deadline without assuming a hidden spawn', () => {
  const game = observedBattle(), p = game.player;
  const dragon = game.entities.find(entity => entity.kind === 'dragon');
  p.level = 4; p.x = dragon.homeX - 200; p.y = dragon.homeY;
  const ally = game.entities.find(entity => entity.type === 'hero' && entity.team === p.team && !entity.isPlayer);
  Object.assign(ally, { x: p.x, y: p.y, hp: ally.maxHp, alive: true, retreating: false, recallLeft: 0 });
  game.objectiveFactsForTest[dragon.id] = { known: true, visible: false, alive: false, respawnAt: 120, observedAt: 45 };
  game.time = 119.9;
  assert.notEqual(Coach.read(game).advice.id, 'scout-dragon');
  game.time = 120;
  dragon.alive = false; dragon.respawnAt = 900;
  const expected = Coach.read(game).advice;
  assert.equal(expected.id, 'scout-dragon');
  assert.equal(expected.action, 'dragon');
  dragon.alive = true; dragon.hp = dragon.maxHp;
  assert.deepEqual(Coach.read(game).advice, expected);
  game.order = { type: 'dragon', expiresAt: 145 };
  assert.match(Coach.read(game).advice.title, /둥지/);
  assert.doesNotMatch(Coach.read(game).advice.title, /공략/);
});

test('v9 coach has a resource-aware recovery hint and does not treat energy or no resource as empty mana', () => {
  const mage = observedBattle();
  mage.player.mana = 0;
  assert.equal(Coach.read(mage).advice.id, 'recall-mana');
  Object.assign(mage.player, mage.map.bases[0]);
  assert.equal(Coach.read(mage).advice.id, 'recover-mana');
  for (const hero of ['lol_garen', 'lol_leesin']) {
    const game = observedBattle(hero); game.player.mana = 0;
    assert.notEqual(Coach.read(game).advice.id, 'recall-mana');
    assert.notEqual(Coach.read(game).advice.id, 'recover-mana');
  }
});

test('v9 upgraded boots satisfy the cheaper unique-group recommendation without a recall loop', () => {
  const game = observedBattle();
  game.player.inventory = ['lol_3108', 'lol_3006', 'lol_3089', 'lol_1057', 'lol_3067'];
  game.player.gold = 5000;
  const result = Coach.recommend(game);
  assert.equal(result.complete, true);
  assert.equal(result.itemId, null);
  assert.notEqual(Coach.read(game).advice.id, 'recall-item');
});

function tacticalBattle(hero = 'lol_ahri') {
  const game = new Game({ hero, seed: 116 });
  game.start(); game.time = 60;
  const actor = game.player;
  actor.isPlayer = false; actor.x = 800; actor.y = 800; actor.hp = actor.maxHp;
  actor.mana = actor.maxMana; actor.gold = 0; actor.inventory = []; actor.lastDamageAt = -100;
  actor.buildIndex = 0; actor.retreating = false; actor.recallLeft = 0;
  game.isVisible = () => false;
  return { game, actor };
}

test('v9 tactical mana recall applies only to mana users and is a pure deterministic query', () => {
  const { game, actor } = tacticalBattle();
  actor.mana = 0;
  const before = JSON.stringify(actor);
  assert.deepEqual(Tactical.getRetreatReason(game, actor, DEFINITIONS), { reason: 'mana' });
  assert.equal(JSON.stringify(actor), before);
  for (const hero of ['lol_garen', 'lol_leesin']) {
    const scenario = tacticalBattle(hero); scenario.actor.mana = 0;
    assert.equal(Tactical.getRetreatReason(scenario.game, scenario.actor, DEFINITIONS), null);
  }
});

test('v9 tactical recall ignores hidden enemy movement and waits for observed threats or recent damage', () => {
  const { game, actor } = tacticalBattle(); actor.mana = 0;
  const enemy = { id: 'opaque', team: 1, alive: true, type: 'hero', range: 300,
    get x() { throw new Error('Hidden position must not be read'); },
    get y() { throw new Error('Hidden position must not be read'); } };
  game.entities = [actor, enemy];
  assert.deepEqual(Tactical.getRetreatReason(game, actor, DEFINITIONS), { reason: 'mana' });
  game.entities = [actor, { ...{ id: 'observed', team: 1, alive: true, type: 'hero', range: 300 }, x: 850, y: 800 }];
  game.isVisible = () => true;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
  game.isVisible = () => false;
  actor.lastDamageAt = 56;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
  game.time = 61;
  assert.deepEqual(Tactical.getRetreatReason(game, actor, DEFINITIONS), { reason: 'mana' });
});

test('v9 tactical shopping uses phase thresholds and only plans an affordable purchase', () => {
  const { game, actor } = tacticalBattle();
  actor.gold = 450;
  assert.deepEqual(Tactical.getRetreatReason(game, actor, DEFINITIONS), { reason: 'shop', itemId: 'lol_1052', cost: 400 });
  game.time = 120;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
  actor.gold = 650;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS).reason, 'shop');
  game.time = 300;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
  actor.gold = 850;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS).reason, 'shop');
  actor.buildIndex = 4;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null, 'Cannot afford Rabadon');
});

test('v9 tactical recipe quote respects duplicated components, six slots and unique-group exclusions', () => {
  const { actor } = tacticalBattle('lol_garen');
  actor.buildIndex = 2; actor.gold = 5000;
  actor.inventory = ['lol_1036', 'lol_2022', 'lol_1028', 'lol_1029', 'lol_1033', 'lol_1042'];
  assert.deepEqual(Tactical.plannedPurchase(actor, DEFINITIONS), { itemId: 'lol_3133', cost: 450 });
  actor.inventory[2] = 'lol_1036';
  assert.deepEqual(Tactical.plannedPurchase(actor, DEFINITIONS), { itemId: 'lol_3133', cost: 100 });
  actor.inventory = Array(6).fill('lol_1028');
  assert.equal(Tactical.plannedPurchase(actor, DEFINITIONS), null);
  actor.buildIndex = 1; actor.inventory = ['lol_3006'];
  assert.equal(Tactical.plannedPurchase(actor, DEFINITIONS), null);
  actor.inventory = []; actor.buildIndex = 100;
  assert.equal(Tactical.plannedPurchase(actor, DEFINITIONS), null);
});

test('v9 tactical recall cannot restart an active recall, windup, pause or base visit', () => {
  const { game, actor } = tacticalBattle(); actor.mana = 0;
  for (const field of ['recallLeft', 'attackWindup', 'retreating']) {
    const old = actor[field]; actor[field] = field === 'attackWindup' ? { targetId: 'enemy' } : 1;
    assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null, field);
    actor[field] = old;
  }
  game.paused = true;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
  game.paused = false; game.time = 44;
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
  game.time = 60; Object.assign(actor, game.map.bases[actor.team]);
  assert.equal(Tactical.getRetreatReason(game, actor, DEFINITIONS), null);
});

test('v9 tactical build definitions preserve each original purchase sequence and reject unknown heroes', () => {
  assert.deepEqual(Tactical.getBuild({ hero: 'mage' }).slice(0, 4), ['focus', 'boots', 'crown', 'plate']);
  assert.deepEqual(Tactical.getBuild({ hero: 'lol_jhin', archetype: 'ranger' }).slice(0, 4), ['lol_1036', 'lol_1001', 'lol_1053', 'lol_3006']);
  assert.deepEqual(Tactical.getBuild({ hero: 'lol_unknown' }), []);
  assert.ok(Object.isFrozen(Tactical.getBuild({ hero: 'mage' })));
});

function engineRecallScenario(mana = false) {
  const game = new Game({ hero: 'lol_ahri', seed: 1881 });
  game.start(); game.time = 60; game.nextWaveAt = game._goldTickAt = 100000;
  const actor = game.entities.find(entity => entity.hero === 'lol_lux' && entity.team === 0);
  for (const entity of game.entities) if (entity !== actor && ['hero', 'minion', 'monster'].includes(entity.type)) entity.stunnedUntil = 1e8;
  const position = game._safePoint(game.map.bases[0].x + 430, game.map.bases[0].y - 30, actor.r);
  Object.assign(actor, position, { gold: mana ? 0 : 450, inventory: [], buildIndex: 0,
    mana: mana ? 0 : actor.maxMana, hp: actor.maxHp, lastDamageAt: -100,
    targetId: null, aiMove: null, recallLeft: 0, retreating: false, attackWindup: null, aiThinkIn: 0 });
  game._rebuildIndex(); game._updateVision(true);
  return { game, actor };
}

function advance(game, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) game.step(1 / 60);
}

test('v9 engine shopping recall completes a real purchase and fresh damage interrupts it', () => {
  const { game, actor } = engineRecallScenario();
  game._thinkHero(actor);
  assert.equal(actor.recallLeft, 4);
  assert.equal(actor.retreating, false, 'A healthy shopping recall does not use the low-health release condition');
  advance(game, 4.25);
  assert.equal(actor.recallLeft, 0);
  assert.deepEqual(actor.inventory, ['lol_1052']);
  assert.equal(actor.gold, 50);
  assert.equal(actor.buildIndex, 1);
  assert.ok(Math.hypot(actor.x - game.map.bases[0].x, actor.y - game.map.bases[0].y) < 180);

  const interrupted = engineRecallScenario();
  interrupted.game._thinkHero(interrupted.actor);
  const enemy = interrupted.game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  interrupted.game.damage(interrupted.actor, 20, enemy, 'physical');
  assert.equal(interrupted.actor.recallLeft, 0);
  interrupted.game._thinkHero(interrupted.actor);
  assert.equal(interrupted.actor.recallLeft, 0, 'Cannot immediately restart after damage');
  assert.deepEqual(interrupted.actor.inventory, []);
});

test('v9 engine mana recall waits for base resource recovery before returning to the lane', () => {
  const { game, actor } = engineRecallScenario(true);
  game._thinkHero(actor);
  assert.equal(actor.retreating, true);
  assert.equal(actor.recallLeft, 4);
  advance(game, 4.15);
  assert.equal(actor.recallLeft, 0);
  assert.equal(actor.retreating, true);
  assert.ok(actor.mana / actor.maxMana < 0.45);
  advance(game, 2.25);
  assert.equal(actor.retreating, false);
  assert.ok(actor.mana / actor.maxMana > 0.45);
  assert.ok(actor.aiMove && Math.hypot(actor.aiMove.x - game.map.bases[0].x, actor.aiMove.y - game.map.bases[0].y) > 200);
});

test('v9 shopping recall and its subsequent transaction remain identical after save and resume', () => {
  const { game, actor } = engineRecallScenario();
  game._thinkHero(actor); advance(game, 1);
  const checkpoint = game.exportState();
  const resumed = Game.fromState(checkpoint, { paused: false, clearInput: false });
  assert.equal(resumed.entities.find(entity => entity.id === actor.id).recallLeft, actor.recallLeft);
  advance(game, 3.5); advance(resumed, 3.5);
  assert.deepEqual(resumed.exportState(), game.exportState());
  assert.deepEqual(actor.inventory, ['lol_1052']);
});
