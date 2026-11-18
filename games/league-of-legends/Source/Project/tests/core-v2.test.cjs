'use strict';

// v2 contract tests: skill progression, attack-move/stop, item recipes, and
// allied orders. Browser input dispatch is verified separately by the UI owner.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP, ITEMS } = require('../dist/game.js');
const { Navigation } = require('../dist/navigation.js');

const DT = 1 / 60;
const BASE = { x: 165, y: 1435 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rankTotal = player => Object.values(player.skillRanks).reduce((sum, n) => sum + n, 0);

function create(options = {}) {
  const game = new Game({ hero: 'mage', difficulty: 'normal', seed: 83, ...options });
  game.start();
  return game;
}

function advance(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) game.step(DT);
}

function reachLevel(game, level) {
  for (let i = 0; i < 30 && game.player.level < level; i++) {
    game.gainXp(game.player, Math.max(1, game.player.nextXp));
  }
  assert.equal(game.player.level, level, 'Fixture reaches its level through the XP API');
}

function isolate(game, keep = []) {
  const ids = new Set([game.player.id, ...keep.map(e => e.id)]);
  game.entities = game.entities.filter(e => ids.has(e.id) || e.type === 'inhibitor' || e.type === 'nexus');
  game.nextWaveAt = 1e9;
  game.player.autoAttack = false;
  return game;
}

function duel() {
  const game = create();
  const enemy = game.entities.find(e => e.type === 'hero' && e.team === 1);
  isolate(game, [enemy]);
  Object.assign(game.player, { x: 800, y: 800 });
  Object.assign(enemy, { x: 900, y: 800, stunnedUntil: 1e9 });
  advance(game, DT);
  return { game, enemy };
}

function atShop(game) {
  Object.assign(game.player, BASE);
  game.player.gold = 100000;
  return game;
}

function purchaseState(player) {
  return {
    gold: player.gold,
    inventory: [...player.inventory],
    hp: player.hp,
    maxHp: player.maxHp,
    mana: player.mana,
    maxMana: player.maxMana,
    damage: player.damage,
    armor: player.armor,
    abilityPower: player.abilityPower,
    speed: player.speed,
    attackSpeed: player.attackSpeed,
  };
}

test('skill points are earned, conserved, and blocked upgrades cannot spend them', () => {
  const game = create();
  const player = game.player;
  assert.deepEqual(player.skillRanks, { q: 1, w: 0, e: 0, r: 0 });
  assert.equal(player.skillPoints, 0);
  const initialMana = player.mana;
  assert.equal(game.cast('w').ok, false, 'An unlearned ability cannot be cast');
  assert.equal(player.mana, initialMana);
  assert.equal(player.cd.w, 0);
  reachLevel(game, 2);
  assert.equal(player.skillPoints, 1);
  assert.equal(game.canUpgradeSkill('q'), false, 'Q rank two requires level three');
  const blocked = { points: player.skillPoints, ranks: { ...player.skillRanks } };
  assert.equal(game.upgradeSkill('q').ok, false);
  assert.equal(game.upgradeSkill('invalid').ok, false);
  assert.deepEqual({ points: player.skillPoints, ranks: { ...player.skillRanks } }, blocked);
  assert.equal(game.canUpgradeSkill('w'), true);
  assert.equal(game.upgradeSkill('w').ok, true);
  assert.equal(player.skillRanks.w, 1);
  assert.equal(player.skillPoints, 0);
  assert.equal(rankTotal(player) + player.skillPoints, player.level);
  assert.equal(game.cast('w', player.x, player.y).ok, true);
  reachLevel(game, 3);
  assert.equal(game.upgradeSkill('q').ok, true);
  assert.equal(player.skillRanks.q, 2);
  assert.equal(rankTotal(player) + player.skillPoints, player.level);
});

test('ultimate ranks require levels six, eleven, and sixteen without losing blocked points', () => {
  const game = create();
  reachLevel(game, 5);
  let points = game.player.skillPoints;
  assert.equal(game.canUpgradeSkill('r'), false);
  assert.equal(game.upgradeSkill('r').ok, false);
  assert.equal(game.player.skillPoints, points);
  for (const [level, rank, nextGate] of [[6, 1, 11], [11, 2, 16], [16, 3, null]]) {
    reachLevel(game, level);
    assert.equal(game.canUpgradeSkill('r'), true);
    assert.equal(game.upgradeSkill('r').ok, true);
    assert.equal(game.player.skillRanks.r, rank);
    points = game.player.skillPoints;
    assert.equal(game.upgradeSkill('r').ok, false);
    assert.equal(game.player.skillPoints, points);
    assert.equal(rankTotal(game.player) + points, game.player.level);
    const info = game.getSkillInfo('r');
    assert.equal(info.rank, rank);
    assert.equal(info.maxRank, 3);
    if (nextGate !== null) assert.equal(info.nextUnlock, nextGate);
  }
});

test('recommended skill allocation respects all caps and preserves every earned point', () => {
  const game = create();
  for (let level = 2; level <= 18; level++) {
    reachLevel(game, level);
    const pointsBefore = game.player.skillPoints;
    const result = game.autoAllocateSkills();
    assert.equal(result.ok, true);
    assert.equal(result.allocated + result.remaining, pointsBefore);
    assert.equal(result.remaining, game.player.skillPoints);
    assert.equal(rankTotal(game.player) + game.player.skillPoints, level);
    for (const slot of ['q', 'w', 'e']) {
      assert.ok(game.player.skillRanks[slot] <= Math.min(5, Math.ceil(level / 2)));
    }
    const maxUltimate = level >= 16 ? 3 : level >= 11 ? 2 : level >= 6 ? 1 : 0;
    assert.ok(game.player.skillRanks.r <= maxUltimate);
  }
  assert.deepEqual(game.player.skillRanks, { q: 5, w: 5, e: 5, r: 3 });
  assert.equal(game.player.skillPoints, 0);
  const after = game.autoAllocateSkills();
  assert.equal(after.allocated, 0, 'Allocation without points cannot create free ranks');
});

test('a higher Q rank changes resolved damage and the real cooldown', () => {
  const first = duel();
  const second = duel();
  for (const { game } of [first, second]) reachLevel(game, 3);
  assert.equal(second.game.upgradeSkill('q').ok, true);
  const dealt = [];
  const cooldowns = [];
  for (const { game, enemy } of [first, second]) {
    const damageBefore = game.player.damageDealt;
    assert.equal(game.cast('q', enemy.x, enemy.y).ok, true);
    cooldowns.push(game.player.cd.q);
    advance(game, 0.4);
    dealt.push(game.player.damageDealt - damageBefore);
  }
  assert.ok(dealt[0] > 0);
  assert.ok(Math.abs(dealt[1] / dealt[0] - 1.12) < 0.001, 'One extra rank adds twelve percent to actual damage');
  assert.ok(Math.abs(cooldowns[1] / cooldowns[0] - 0.96) < 0.001, 'One extra rank reduces actual cooldown by four percent');
});

test('attack-move acquires an enemy with auto-attack disabled and resumes travel after the kill', () => {
  const { game, enemy } = duel();
  enemy.hp = 40;
  enemy.armor = 0;
  const destination = { x: 1100, y: 800 };
  const startDistance = distance(game.player, destination);
  assert.equal(game.player.autoAttack, false);
  assert.equal(game.commandAttackMove(destination.x, destination.y).ok, true);
  advance(game, 1.5);
  assert.equal(enemy.alive, false, 'Attack-move resolves a lethal attack without a selected target');
  advance(game, 2);
  assert.ok(distance(game.player, destination) < startDistance - 50);
});

test('stop cancels navigation, direct movement, and recall while preserving auto-attack preference', () => {
  const game = isolate(create());
  Object.assign(game.player, { x: 800, y: 800 });
  assert.equal(game.commandMove(1100, 800).ok, true);
  advance(game, 0.4);
  assert.equal(game.stop().ok, true);
  const stoppedAt = { x: game.player.x, y: game.player.y };
  advance(game, 0.5);
  assert.ok(distance(game.player, stoppedAt) < 0.01);
  assert.deepEqual(game.player.navPath, []);
  assert.equal(game.player.autoAttack, false);
  game.setInputVector(1, 0);
  assert.equal(game.stop().ok, true);
  advance(game, 0.3);
  assert.ok(distance(game.player, stoppedAt) < 0.01);
  assert.equal(game.recall().ok, true);
  assert.equal(game.stop().ok, true);
  assert.equal(game.player.recallLeft, 0);
});

test('click movement follows an exposed safe path around a real map wall and reaches the goal', () => {
  const game = isolate(create());
  const wall = MAP.obstacles[0];
  assert.ok(wall && MAP.obstacles.length >= 1, 'The simulation uses real static terrain');
  const player = game.player;
  const nav = new Navigation({ width: MAP.width, height: MAP.height, obstacles: MAP.obstacles });
  const start = nav.nearestWalkable(wall.x - wall.r - player.r - 60, wall.y, player.r);
  const goal = nav.nearestWalkable(wall.x + wall.r + player.r + 60, wall.y, player.r);
  Object.assign(player, start);
  advance(game, DT);
  assert.equal(nav.segmentClear(player.x, player.y, goal.x, goal.y, player.r), false);
  assert.equal(game.commandMove(goal.x, goal.y).ok, true);
  advance(game, DT);
  assert.ok(Array.isArray(player.navPath) && player.navPath.length >= 2,
    'The player exposes the actual route used by the path preview');
  for (let i = 0; i < 8 * 60; i++) {
    game.step(DT);
    assert.equal(nav.isWalkable(player.x, player.y, player.r), true, 'Click travel cannot cross a wall');
  }
  assert.ok(distance(player, goal) < 12, 'Click travel finishes at the reachable destination');
});

test('direct control slides safely along a wall while a dash stops and blink finds a clear endpoint', () => {
  const game = isolate(create({ hero: 'warrior' }));
  const wall = MAP.obstacles[0], player = game.player;
  assert.ok(wall);
  const nav = new Navigation({ width: MAP.width, height: MAP.height, obstacles: MAP.obstacles });
  const start = nav.nearestWalkable(wall.x - wall.r - player.r - 20, wall.y - 35, player.r);
  Object.assign(player, start);
  game.setInputVector(1, 0.1);
  let verticalChange = 0;
  for (let i = 0; i < 2 * 60; i++) {
    game.step(DT);
    assert.equal(nav.isWalkable(player.x, player.y, player.r), true);
    verticalChange = Math.max(verticalChange, Math.abs(player.y - start.y));
  }
  assert.ok(verticalChange > 10, 'The direct-input path responds to the wall with a slide');
  game.stop();
  Object.assign(player, { x: wall.x - wall.r - player.r - 25, y: wall.y });
  advance(game, DT);
  assert.equal(game.cast('q', wall.x + wall.r + 80, wall.y).ok, true);
  assert.equal(nav.isWalkable(player.x, player.y, player.r), true);
  assert.ok(player.x <= wall.x - wall.r - player.r + 1, 'A ground dash cannot pass through the rock');
  assert.equal(game.cast('d', wall.x, wall.y).ok, true);
  assert.equal(nav.isWalkable(player.x, player.y, player.r), true, 'Blink never leaves the actor embedded in terrain');
});

test('item recipes consume exactly one owned component and charge only the difference', () => {
  const game = atShop(create());
  const blade = ITEMS.find(i => i.id === 'blade');
  const edge = ITEMS.find(i => i.id === 'edge');
  assert.ok(edge.components.includes('blade'));
  const baseDamage = game.player.damage;
  assert.equal(game.buy('blade').ok, true);
  const quote = game.getPurchaseInfo('edge');
  assert.equal(quote.cost, edge.cost - blade.cost);
  assert.deepEqual(quote.consumedIndices, [0]);
  assert.equal(quote.canBuy, true);
  const goldBefore = game.player.gold;
  assert.equal(game.buy('edge').ok, true);
  assert.equal(game.player.gold, goldBefore - quote.cost);
  assert.deepEqual(game.player.inventory, ['edge']);
  assert.equal(game.player.damage, baseDamage + edge.stats.damage, 'Consumed component stats must not be counted twice');
});

test('full inventories can upgrade an owned component but cannot acquire a seventh item', () => {
  const game = atShop(create());
  assert.equal(game.buy('blade').ok, true);
  assert.equal(game.buy('blade').ok, true);
  for (let i = 0; i < 4; i++) assert.equal(game.buy('boots').ok, true);
  assert.equal(game.player.inventory.length, 6);
  const quote = game.getPurchaseInfo('edge');
  assert.equal(quote.canBuy, true);
  assert.equal(quote.consumedIndices.length, 1);
  assert.equal(game.buy('edge').ok, true);
  assert.equal(game.player.inventory.length, 6);
  assert.equal(game.player.inventory.filter(id => id === 'blade').length, 1);
  assert.equal(game.player.inventory.filter(id => id === 'edge').length, 1);
  const before = purchaseState(game.player);
  assert.equal(game.buy('heart').ok, false);
  assert.deepEqual(purchaseState(game.player), before);
});

test('failed recipe purchases preserve component, resources, and stats atomically', () => {
  const game = atShop(create());
  assert.equal(game.buy('focus').ok, true);
  const quote = game.getPurchaseInfo('crown');
  const focus = ITEMS.find(i => i.id === 'focus');
  const crown = ITEMS.find(i => i.id === 'crown');
  assert.equal(quote.cost, crown.cost - focus.cost);
  game.player.gold = quote.cost - 1;
  const before = purchaseState(game.player);
  assert.equal(game.getPurchaseInfo('crown').canBuy, false);
  assert.equal(game.buy('crown').ok, false);
  assert.deepEqual(purchaseState(game.player), before);
  game.player.gold = quote.cost;
  assert.equal(game.buy('crown').ok, true);
  assert.equal(game.player.gold, 0);
  assert.deepEqual(game.player.inventory, ['crown']);
});

test('selling enforces location, returns seventy percent, and removes the sold stats', () => {
  const game = atShop(create());
  const item = ITEMS.find(i => i.id === 'heart');
  const baseMaxHp = game.player.maxHp;
  assert.equal(game.buy(item.id).ok, true);
  Object.assign(game.player, { x: 800, y: 800 });
  const away = purchaseState(game.player);
  assert.equal(game.sell(0).ok, false);
  assert.deepEqual(purchaseState(game.player), away);
  Object.assign(game.player, BASE);
  const before = purchaseState(game.player);
  assert.equal(game.sell(-1).ok, false);
  assert.equal(game.sell(1).ok, false);
  assert.deepEqual(purchaseState(game.player), before);
  const result = game.sell(0);
  assert.equal(result.ok, true);
  assert.equal(result.refund, Math.floor(item.cost * 0.7));
  assert.equal(game.player.gold, before.gold + result.refund);
  assert.deepEqual(game.player.inventory, []);
  assert.equal(game.player.maxHp, baseMaxHp);
  assert.ok(game.player.hp <= game.player.maxHp);
});

test('team orders move allied AI, expire, and clear without moving the player', () => {
  const game = create();
  const allies = game.entities.filter(e => e.type === 'hero' && e.team === 0 && !e.isPlayer);
  isolate(game, allies);
  Object.assign(game.player, BASE);
  const destination = { x: 800, y: 800 };
  for (const [i, ally] of allies.entries()) Object.assign(ally, { x: 450 + i * 20, y: 1100 });
  advance(game, DT);
  const before = allies.map(e => distance(e, destination));
  const playerBefore = { x: game.player.x, y: game.player.y };
  assert.equal(game.setTeamOrder('rally', destination.x, destination.y).ok, true);
  assert.equal(game.order.type, 'rally');
  assert.ok(Math.abs(game.order.expiresAt - game.time - 25) < 0.01);
  advance(game, 5);
  assert.ok(allies.filter((e, i) => distance(e, destination) < before[i] - 50).length >= 3);
  assert.ok(distance(game.player, playerBefore) < 0.01);
  advance(game, 20.1);
  assert.equal(game.order, null);
  for (const type of ['push', 'defend']) {
    assert.equal(game.setTeamOrder(type, 800, 800).ok, true);
    assert.equal(game.order.type, type);
    const current = { ...game.order };
    assert.equal(game.setTeamOrder('invalid', 800, 800).ok, false);
    assert.deepEqual(game.order, current);
  }
  assert.equal(game.setTeamOrder('clear').ok, true);
  assert.equal(game.order, null);
});

test('a team order does not override a critically wounded ally retreat', () => {
  const game = create();
  const ally = game.entities.find(e => e.type === 'hero' && e.team === 0 && !e.isPlayer);
  isolate(game, [ally]);
  Object.assign(game.player, BASE);
  Object.assign(ally, { x: 700, y: 900, hp: ally.maxHp * 0.1, mana: ally.maxMana * 0.2 });
  ally.cd.f = 1000;
  assert.equal(game.setTeamOrder('rally', 1200, 350).ok, true);
  let reachedSafety = false;
  for (let i = 0; i < 12 * 60; i++) {
    game.step(DT);
    if (distance(ally, BASE) < 155) reachedSafety = true;
  }
  assert.equal(ally.alive, true);
  assert.equal(reachedSafety, true, 'Retreat has priority over an order toward the enemy base');
});
