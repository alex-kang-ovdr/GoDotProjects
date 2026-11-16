'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP } = require('../dist/game.js');
const Coach = require('../dist/coach.js');

function battle(hero = 'mage') {
  const game = new Game({ hero, seed: 419 });
  game.start();
  game.player.inventory = [Coach.starter(hero)];
  game.player.gold = 0;
  game.isVisible = entity => entity.visible !== false;
  // Keep actual public structures/monsters for progression, while isolating advice
  // from unrelated starting enemy hero positions.
  for (const entity of game.entities) if (entity.team === 1 && entity.type !== 'tower' && entity.type !== 'inhibitor' && entity.type !== 'nexus') entity.visible = false;
  return game;
}

test('each hero gets a suitable affordable starter and the next upgrade uses engine recipe price', () => {
  for (const [hero, expectedStarter, next, expectedPrice] of [
    ['mage', 'focus', 'crown', 240], ['warrior', 'blade', 'edge', 300], ['ranger', 'bow', 'boots', 400]
  ]) {
    assert.equal(Coach.starter(hero), expectedStarter);
    const game = battle(hero);
    const result = Coach.recommend(game);
    assert.equal(result.itemId, next);
    assert.equal(result.cost, expectedPrice);
    assert.equal(result.cost, game.getPurchaseInfo(next).cost);
    assert.equal(result.canBuy, false);
    assert.equal(result.missingGold, expectedPrice);
  }
});

test('recommendation reflects actual shop, gold and full-slot recipe eligibility', () => {
  const game = battle('ranger');
  game.player.inventory = ['bow', 'boots', 'blade', 'heart', 'plate', 'focus'];
  game.player.gold = 300;
  let result = Coach.recommend(game);
  assert.equal(result.itemId, 'edge');
  assert.equal(result.cost, 300);
  assert.equal(result.blockedBySlots, false);
  assert.equal(result.canBuy, false);
  Object.assign(game.player, MAP.bases[0]);
  result = Coach.recommend(game);
  assert.equal(result.atShop, true);
  assert.equal(result.canBuy, true);
  assert.equal(game.buy(result.itemId).ok, true);
  assert.equal(game.player.inventory.length, 6);
  assert.equal(Coach.recommend(game).complete, true);
});

test('full slots with no recipe cannot suggest a payable purchase or claim a completed build', () => {
  const game = battle();
  game.player.inventory = Array(6).fill('heart');
  game.player.gold = 5000;
  Object.assign(game.player, MAP.bases[0]);
  const result = Coach.recommend(game);
  assert.equal(result.complete, false);
  assert.equal(result.blockedBySlots, true);
  assert.equal(result.canBuy, false);
  assert.match(result.reason, /판매|조합/);
  assert.notEqual(Coach.read(game).advice.action, 'shop');
});

test('finished core build does not buy duplicate components or silently fill remaining slots', () => {
  const game = battle();
  game.player.inventory = ['crown', 'boots', 'heart', 'plate'];
  game.player.gold = 5000;
  const result = Coach.recommend(game);
  assert.equal(result.complete, true);
  assert.equal(result.itemId, null);
  assert.equal(result.canBuy, false);
  assert.equal(game.player.inventory.length, 4);
});

test('milestones require observations, persist once completed and never mutate game or input journey', () => {
  const game = new Game({ hero: 'mage', seed: 31 });
  const initial = Coach.read(game);
  assert.equal(initial.milestones.filter(item => item.done).length, 0);
  assert.equal(initial.advice.id, 'prepare');
  const input = JSON.parse(JSON.stringify(initial.journey));
  game.start();
  game.player.inventory = ['focus'];
  game.player.x += 120;
  assert.equal(game.cast('q', 900, 800).ok, true);
  game.player.cs = 1;
  game.player.skillRanks.w = 1;
  game.entities.find(entity => entity.id === 'tower-1-mid-outer').alive = false;
  const snapshot = JSON.stringify(game.getSnapshot());
  const completed = Coach.read(game, initial.journey);
  assert.equal(completed.milestones.filter(item => item.done).length, 6);
  assert.deepEqual(initial.journey, input);
  assert.equal(JSON.stringify(game.getSnapshot()), snapshot);
  game.player.alive = false;
  game.player.inventory = [];
  game.player.cd.q = 0;
  const afterDeath = Coach.read(game, completed.journey);
  assert.equal(afterDeath.milestones.filter(item => item.done).length, 6);
});

test('unused skill rank, held gold and levelling alone do not fabricate milestones', () => {
  const game = new Game({ hero: 'mage' });
  game.start();
  game.player.level = 2;
  game.player.skillPoints = 1;
  game.player.gold = 1500;
  const state = Coach.read(game);
  for (const id of ['equipment', 'skill', 'cs', 'growth']) assert.equal(state.journey.completed[id], false);
  assert.equal(state.advice.action, 'upgrade');
});

test('expired or out-of-range hazards do not interrupt advice; imminent damage outranks shopping and growth', () => {
  const game = battle();
  game.time = 20;
  game.player.skillPoints = 1;
  game.getHazards = () => [{ x: game.player.x, y: game.player.y, radius: 125, at: 20.5, label: '폭풍 강타' }];
  let result = Coach.read(game).advice;
  assert.equal(result.id, 'hazard');
  assert.equal(result.tone, 'danger');
  assert.equal(result.action, null);
  game.getHazards = () => [{ x: 1500, y: 100, radius: 125, at: 20.5, label: '폭풍 강타' },
    { x: game.player.x, y: game.player.y, radius: 125, at: 19.9, label: '폭풍 강타' }];
  result = Coach.read(game).advice;
  assert.equal(result.id, 'upgrade');
});

test('visible active tower targeting is urgent, but protected or hidden towers reveal nothing', () => {
  const game = battle();
  const tower = game.entities.find(entity => entity.id === 'tower-1-mid-outer');
  tower.x = game.player.x + 100; tower.y = game.player.y;
  tower.targetId = 'player';
  assert.equal(Coach.read(game).advice.id, 'tower');
  tower.visible = false;
  assert.notEqual(Coach.read(game).advice.id, 'tower');
  tower.visible = true;
  game.isProtected = () => true;
  assert.notEqual(Coach.read(game).advice.id, 'tower');
});

test('safe visible conditions allow recall, visible threats require retreat, hidden enemies are not disclosed', () => {
  const game = battle();
  game.time = 30; game.player.hp = game.player.maxHp * 0.2;
  game.player.lastDamageAt = 20;
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  enemy.x = game.player.x + 80; enemy.y = game.player.y;
  enemy.visible = false;
  assert.equal(Coach.read(game).advice.id, 'recall-low');
  assert.equal(Coach.read(game).advice.action, 'recall');
  enemy.visible = true;
  assert.equal(Coach.read(game).advice.id, 'retreat');
  assert.equal(Coach.read(game).advice.action, null);
});

test('visible base incursions recommend defense but unseen enemies do not change guidance', () => {
  const game = battle();
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  Object.assign(enemy, MAP.bases[0]); enemy.visible = false;
  assert.notEqual(Coach.read(game).advice.id, 'defend');
  enemy.visible = true;
  assert.equal(Coach.read(game).advice.action, 'defend');
  game.order = { type: 'defend', expiresAt: 25 };
  assert.equal(Coach.read(game).advice.id, 'order');
});

test('critical health and visible base danger take priority over spending skill points', () => {
  const game = battle();
  game.time = 30;
  game.player.skillPoints = 1;
  game.player.hp = game.player.maxHp * 0.2;
  game.player.lastDamageAt = 20;
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  enemy.x = game.player.x + 80; enemy.y = game.player.y; enemy.visible = true;
  let result = Coach.read(game).advice;
  assert.equal(result.id, 'retreat');
  assert.equal(result.tone, 'danger');
  assert.equal(result.action, null);
  enemy.visible = false;
  result = Coach.read(game).advice;
  assert.equal(result.id, 'recall-low');
  assert.equal(result.action, 'recall');
  game.player.hp = game.player.maxHp;
  Object.assign(enemy, MAP.bases[0]); enemy.visible = true;
  result = Coach.read(game).advice;
  assert.equal(result.id, 'defend');
  assert.equal(result.tone, 'danger');
  assert.equal(result.action, 'defend');
  enemy.visible = false;
  assert.equal(Coach.read(game).advice.id, 'upgrade');
});

test('objective readiness requires level, health and a viable ally; it does not expose unseen enemies', () => {
  const game = battle();
  game.player.level = 4;
  const dragon = game.entities.find(entity => entity.kind === 'dragon');
  dragon.alive = true;
  const allies = game.entities.filter(entity => entity.type === 'hero' && entity.team === 0 && !entity.isPlayer);
  for (const ally of allies) ally.hp = ally.maxHp * 0.1;
  assert.notEqual(Coach.read(game).advice.action, 'dragon');
  allies[0].hp = allies[0].maxHp; allies[0].x = 900; allies[0].y = 1100;
  const before = Coach.read(game).advice;
  assert.equal(before.action, 'dragon');
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  enemy.x = dragon.homeX; enemy.y = dragon.homeY; enemy.visible = false;
  assert.deepEqual(Coach.read(game).advice, before);
  game.player.hp = game.player.maxHp * 0.5;
  assert.notEqual(Coach.read(game).advice.action, 'dragon');
});

test('a recalled, dead or completed player receives state-appropriate advice rather than an action loop', () => {
  const game = battle();
  game.player.recallLeft = 2;
  assert.equal(Coach.read(game).advice.id, 'recalling');
  assert.equal(Coach.read(game).advice.action, null);
  game.player.alive = false; game.player.gold = 1000;
  assert.equal(Coach.read(game).advice.id, 'respawn');
  assert.equal(Coach.read(game).advice.action, 'shop');
  game.over = true; game.winner = 0;
  assert.equal(Coach.read(game).advice.id, 'finished');
  assert.equal(Coach.read(game).advice.action, null);
});

test('malformed journey metadata resets safely and never imports unknown completions', () => {
  const game = battle();
  const result = Coach.read(game, { version: 1, origin: { x: Infinity, y: -9 }, completed: { move: 'true', hacked: true } });
  assert.deepEqual(result.journey.origin, { x: game.player.x, y: game.player.y });
  assert.equal(result.journey.completed.move, false);
  assert.equal(Object.hasOwn(result.journey.completed, 'hacked'), false);
});
