'use strict';

// Contract-level tests for the standalone simulation. No browser, DOM, or
// third-party packages are used. Controlled fixtures isolate specific rules;
// the final soak test runs the unmodified initial world and its real AI.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP, HEROES, ITEMS } = require('../dist/game.js');

const DT = 1 / 60;
const BASES = [{ x: 165, y: 1435 }, { x: 1435, y: 165 }];
const STRUCTURES = new Set(['tower', 'inhibitor', 'nexus']);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function makeGame(options = {}) {
  return new Game({ hero: 'mage', difficulty: 'normal', seed: 123, ...options });
}

function advance(game, seconds) {
  const count = Math.ceil(seconds / DT);
  for (let i = 0; i < count; i++) game.step(DT);
}

function quietFixture(game, keep = []) {
  const ids = new Set([game.player.id, ...keep.map(e => e.id)]);
  // Retain passive match structures but remove firing towers; a duel at the
  // center otherwise acquires turret projectiles unrelated to the rule tested.
  game.entities = game.entities.filter(e => ids.has(e.id) || e.type === 'inhibitor' || e.type === 'nexus');
  game.nextWaveAt = 1e9;
  game.player.autoAttack = false;
  game.setInputVector(0, 0);
  return game;
}

function makeDuel(options = {}) {
  const game = makeGame(options);
  game.start();
  const enemy = game.entities.find(e => e.type === 'hero' && e.team === 1);
  assert.ok(enemy, 'An opposing hero is required for combat fixtures');
  quietFixture(game, [enemy]);
  Object.assign(game.player, { x: 800, y: 800 });
  Object.assign(enemy, { x: 900, y: 800, speed: 0, damage: 0, range: 0, stunnedUntil: 1e9 });
  // The fixture changes positions directly; one real step refreshes spatial
  // queries before invoking the public commands under test.
  advance(game, DT);
  return { game, enemy };
}

function placeAtBase(hero) {
  Object.assign(hero, BASES[hero.team]);
}

function checkFiniteWorld(game, context) {
  assert.ok(Number.isFinite(game.time), `${context}: finite simulation time`);
  assert.ok(Number.isFinite(game.waveNumber), `${context}: finite wave counter`);
  assert.ok(game.events.length <= 20, `${context}: event log must be bounded`);
  for (const entity of game.entities) {
    for (const key of ['x', 'y', 'r', 'hp', 'maxHp', 'mana', 'maxMana',
      'level', 'xp', 'nextXp', 'gold', 'damage', 'range', 'speed', 'armor',
      'shield', 'respawnIn']) {
      if (entity[key] !== undefined) {
        assert.ok(Number.isFinite(entity[key]), `${context}: ${entity.id}.${key} is finite`);
      }
    }
    assert.ok(entity.maxHp > 0, `${context}: ${entity.id} has positive max HP`);
    assert.ok(entity.hp >= -1e-6 && entity.hp <= entity.maxHp + 1e-6,
      `${context}: ${entity.id} HP is within its valid range`);
    if (entity.type === 'hero' && entity.skillRanks) {
      const ranks = Object.values(entity.skillRanks).reduce((sum, rank) => sum + rank, 0);
      assert.ok(Number.isInteger(entity.skillPoints) && entity.skillPoints >= 0,
        `${context}: ${entity.id} has valid unspent skill points`);
      assert.equal(ranks + entity.skillPoints, entity.level,
        `${context}: ${entity.id} conserves all skill points through leveling and AI allocation`);
    }
    if (entity.alive) {
      assert.ok(entity.x >= -entity.r && entity.x <= MAP.width + entity.r,
        `${context}: ${entity.id} stays within horizontal map bounds`);
      assert.ok(entity.y >= -entity.r && entity.y <= MAP.height + entity.r,
        `${context}: ${entity.id} stays within vertical map bounds`);
    }
  }
  for (const [collection, fields] of [
    ['projectiles', ['x', 'y', 'vx', 'vy']],
    ['effects', ['x', 'y', 'life']],
    ['floaters', ['x', 'y', 'life']],
  ]) {
    for (const object of game[collection]) {
      for (const key of fields) {
        if (object[key] !== undefined) {
          assert.ok(Number.isFinite(object[key]), `${context}: ${collection}.${key} is finite`);
        }
      }
    }
  }
}

test('exports define a complete playable 5v5 world and independent hero choices', () => {
  assert.equal(MAP.width, 1600);
  assert.equal(MAP.height, 1600);
  assert.deepEqual(HEROES.map(h => h.id).sort(), ['mage', 'ranger', 'warrior']);
  assert.ok(ITEMS.length >= 6, 'The shop needs meaningful build choices');
  for (const hero of HEROES) {
    const game = makeGame({ hero: hero.id });
    assert.equal(game.player.hero, hero.id);
    assert.equal(game.entities.filter(e => e.type === 'hero').length, 10);
    assert.equal(game.entities.filter(e => e.type === 'hero' && e.team === 0).length, 5);
    assert.equal(game.entities.filter(e => e.type === 'hero' && e.team === 1).length, 5);
    assert.equal(game.entities.filter(e => e.type === 'nexus').length, 2);
    for (const key of ['q', 'w', 'e', 'r']) {
      assert.ok(hero.skills[key].name);
      assert.ok(Number.isFinite(hero.skills[key].cooldown));
      assert.ok(Number.isFinite(hero.skills[key].cost));
    }
    checkFiniteWorld(game, `initial/${hero.id}`);
  }
});

test('the simulation advances only after start and while unpaused', () => {
  const game = makeGame();
  const initialTime = game.time;
  advance(game, 1);
  assert.equal(game.time, initialTime);
  game.start();
  advance(game, 0.5);
  assert.ok(game.time > initialTime);
  game.paused = true;
  const frozen = JSON.stringify(game.getSnapshot());
  advance(game, 2);
  assert.equal(JSON.stringify(game.getSnapshot()), frozen);
  game.paused = false;
  advance(game, 0.5);
  assert.ok(game.time > initialTime + 0.75);
});

test('all three lanes receive waves and minions advance along the battlefield', () => {
  const game = makeGame();
  game.start();
  advance(game, 5);
  assert.ok(game.waveNumber >= 1, 'The first wave must arrive quickly');
  const minions = game.entities.filter(e => e.type === 'minion' && e.alive);
  for (const lane of ['top', 'mid', 'bot']) {
    for (const team of [0, 1]) {
      assert.ok(minions.some(e => e.lane === lane && e.team === team), `${lane}/${team} has a wave`);
    }
  }
  const minion = minions.find(e => e.team === 0 && e.lane === 'mid');
  // Faster navigation can put this wave in real combat by t=5. The movement
  // assertion is specifically unopposed: retain every friendly unit/structure,
  // and remove opposing actors plus already scheduled hostile damage.
  game.entities = game.entities.filter(e => e.team === minion.team);
  game.projectiles = [];
  game._pending = [];
  game.nextWaveAt = 1e9;
  minion.targetId = null;
  const previous = { x: minion.x, y: minion.y };
  advance(game, 0.5);
  assert.ok(distance(minion, previous) > 1, 'A living unopposed minion moves');
});

test('every first-wave minion clears friendly base structures without getting stuck', () => {
  const game = makeGame({ seed: 7 });
  game.start();
  advance(game, 5);
  const minions = game.entities.filter(e => e.type === 'minion' && e.team === 0 && e.alive);
  assert.ok(minions.length >= 9);
  game.entities = game.entities.filter(e => e.id === game.player.id || STRUCTURES.has(e.type) || minions.includes(e));
  game.nextWaveAt = 1e9;
  game.player.autoAttack = false;
  placeAtBase(game.player);
  const movement = new Map(minions.map(e => [e.id, { x: e.x, y: e.y, maximum: 0 }]));
  for (let i = 0; i < 6 * 60; i++) {
    game.step(DT);
    for (const minion of minions) {
      const record = movement.get(minion.id);
      record.maximum = Math.max(record.maximum, distance(minion, record));
    }
  }
  for (const minion of minions) {
    assert.ok(movement.get(minion.id).maximum > 25,
      `${minion.id}/${minion.lane} is stuck near ${minion.x.toFixed(1)},${minion.y.toFixed(1)}`);
  }
});

test('click destination survives neutral directional input and direction keys override it', () => {
  const game = makeGame();
  game.start();
  quietFixture(game);
  Object.assign(game.player, { x: 800, y: 800 });
  const goal = { x: 1100, y: 800 };
  game.commandMove(goal.x, goal.y);
  const before = distance(game.player, goal);
  game.setInputVector(0, 0);
  advance(game, 0.25);
  assert.ok(distance(game.player, goal) < before, 'Neutral directional input preserves click travel');
  const xBefore = game.player.x;
  game.setInputVector(-1, 0);
  advance(game, 0.25);
  assert.ok(game.player.x < xBefore - 1, 'Directional movement takes precedence');
  game.setInputVector(0, 0);
  checkFiniteWorld(game, 'movement');
});

test('an explicit attack closes range and produces real damage', () => {
  const { game, enemy } = makeDuel();
  enemy.x = 1180;
  const startX = game.player.x;
  const hpBefore = enemy.hp;
  game.player.autoAttack = true;
  assert.equal(game.attackTarget(enemy.id).ok, true);
  advance(game, 4);
  assert.ok(game.player.x > startX + 1, 'The player approaches an out-of-range target');
  assert.ok(enemy.hp < hpBefore, 'The attack must resolve damage, not just an animation');
});

test('skills spend mana once, enforce cooldowns, and reject insufficient resources', () => {
  const { game } = makeDuel();
  const player = game.player;
  player.mana = player.maxMana;
  const manaBefore = player.mana;
  const result = game.cast('q', 1000, 800);
  assert.equal(result.ok, true);
  assert.ok(player.mana < manaBefore, 'Successful Q consumes mana');
  assert.ok(player.cd.q > 0, 'Successful Q starts its cooldown');
  const afterFirst = { mana: player.mana, cooldown: player.cd.q };
  assert.equal(game.cast('q', 1000, 800).ok, false);
  assert.equal(player.mana, afterFirst.mana, 'Rejected cast must not spend mana');
  assert.equal(player.cd.q, afterFirst.cooldown, 'Rejected cast must not reset cooldown');
  advance(game, 0.25);
  assert.ok(player.cd.q < afterFirst.cooldown, 'Cooldown counts down in real simulation');
  player.cd.q = 0;
  player.mana = 0;
  const noMana = game.cast('q', 1000, 800);
  assert.equal(noMana.ok, false);
  assert.equal(player.mana, 0);
  assert.equal(player.cd.q, 0);
});

for (const hero of ['mage', 'warrior', 'ranger']) {
  test(`${hero} Q resolves combat damage with automatic attacks disabled`, () => {
    const { game, enemy } = makeDuel({ hero });
    enemy.x = game.player.x + Math.min(85, game.player.range);
    const hpBefore = enemy.hp;
    assert.equal(game.player.autoAttack, false);
    assert.equal(game.cast('q', enemy.x, enemy.y).ok, true);
    advance(game, 1.25);
    assert.ok(enemy.hp < hpBefore, `${hero} Q must change target HP`);
  });
}

test('ultimate unlocks through actual experience progression, starting at level six', () => {
  const { game } = makeDuel();
  const player = game.player;
  const manaBefore = player.mana;
  assert.ok(player.level < 6);
  assert.equal(game.cast('r', 1000, 800).ok, false);
  assert.equal(player.mana, manaBefore);
  assert.equal(player.cd.r, 0);
  for (let i = 0; i < 20 && player.level < 6; i++) {
    game.gainXp(player, Math.max(1, player.nextXp));
  }
  assert.ok(player.level >= 6, 'XP must change the playable level');
  assert.equal(game.upgradeSkill('r').ok, true, 'Level six grants access; a point learns the ultimate');
  player.mana = player.maxMana;
  assert.equal(game.cast('r', 1000, 800).ok, true);
  assert.ok(player.cd.r > 0);
});

test('damage, kill credit, gold and death/respawn form one consistent lifecycle', () => {
  const { game, enemy } = makeDuel();
  const player = game.player;
  const initialEnemyGold = enemy.gold;
  const initialKills = enemy.kills;
  const initialDeaths = player.deaths;
  game.damage(player, 1e6, enemy, 'true');
  assert.equal(player.alive, false);
  assert.equal(player.hp, 0);
  assert.equal(player.deaths, initialDeaths + 1);
  assert.equal(enemy.kills, initialKills + 1);
  assert.ok(enemy.gold > initialEnemyGold);
  assert.equal(game.teamKills[1], 1);
  const creditedGold = enemy.gold;
  game.damage(player, 1e6, enemy, 'true');
  assert.equal(enemy.gold, creditedGold, 'A dead hero cannot pay out again');
  assert.equal(game.teamKills[1], 1);
  assert.ok(player.respawnIn > 0 && player.respawnIn <= 30);
  advance(game, player.respawnIn + 0.1);
  assert.equal(player.alive, true);
  assert.ok(player.hp > 0);
  assert.ok(distance(player, BASES[0]) < 180, 'Respawn returns to the friendly base');
});

test('last-hitting a minion pays gold and experience to the nearby player', () => {
  const game = makeGame();
  game.start();
  advance(game, 5);
  const minion = game.entities.find(e => e.type === 'minion' && e.team === 1 && e.alive);
  assert.ok(minion);
  Object.assign(game.player, { x: minion.x - 35, y: minion.y });
  game.player.autoAttack = false;
  advance(game, DT);
  const before = { gold: game.player.gold, xp: game.player.xp, level: game.player.level, cs: game.player.cs };
  game.damage(minion, 1e6, game.player, 'true');
  assert.equal(minion.alive, false);
  assert.ok(game.player.gold > before.gold);
  assert.ok(game.player.xp > before.xp || game.player.level > before.level);
  assert.equal(game.player.cs, before.cs + 1);
});

test('recall is cancelled by movement and damage, and otherwise returns to base', () => {
  const { game, enemy } = makeDuel();
  assert.equal(game.recall().ok, true);
  assert.ok(game.player.recallLeft > 0);
  game.commandMove(850, 800);
  assert.equal(game.player.recallLeft, 0);
  assert.equal(game.recall().ok, true);
  game.damage(game.player, 10, enemy, 'true');
  assert.equal(game.player.recallLeft, 0);
  assert.equal(game.recall().ok, true);
  advance(game, 4.25);
  assert.ok(distance(game.player, BASES[0]) < 180);
  assert.equal(game.player.recallLeft, 0);
});

test('base regeneration applies to player and AI heroes', () => {
  const game = makeGame();
  game.start();
  const ally = game.entities.find(e => e.type === 'hero' && e.team === 0 && e.id !== game.player.id);
  quietFixture(game, [ally]);
  for (const hero of [game.player, ally]) {
    placeAtBase(hero);
    hero.hp = hero.maxHp * 0.2;
    hero.mana = hero.maxMana * 0.1;
  }
  const before = [game.player, ally].map(h => ({ hp: h.hp, mana: h.mana }));
  advance(game, 0.5);
  for (const [i, hero] of [game.player, ally].entries()) {
    assert.ok(hero.hp > before[i].hp, `${hero.id} recovers HP at base`);
    assert.ok(hero.mana > before[i].mana, `${hero.id} recovers mana at base`);
  }
});

test('a critically wounded AI retreats, reaches safety, and recovers enough to return', () => {
  const game = makeGame();
  game.start();
  const ally = game.entities.find(e => e.type === 'hero' && e.team === 0 && !e.isPlayer);
  quietFixture(game, [ally]);
  placeAtBase(game.player);
  Object.assign(ally, { x: 700, y: 900, hp: ally.maxHp * 0.1, mana: ally.maxMana * 0.2 });
  ally.cd.f = 1000; // Observe retreat/base recovery rather than the instant heal spell.
  let reachedBase = false;
  let recovered = false;
  for (let i = 0; i < 15 * 60; i++) {
    game.step(DT);
    if (distance(ally, BASES[0]) < 155) reachedBase = true;
    if (reachedBase && ally.hp / ally.maxHp > 0.8) recovered = true;
  }
  assert.equal(ally.alive, true);
  assert.equal(reachedBase, true, 'The AI must make a real retreat, not stand still at low HP');
  assert.equal(recovered, true, 'The AI must recover HP after reaching safety');
});

test('shield absorption, instant healing, and blink produce their gameplay effects', () => {
  const { game, enemy } = makeDuel();
  const player = game.player;
  game.gainXp(player, player.nextXp);
  assert.equal(game.upgradeSkill('e').ok, true);
  assert.equal(game.cast('e').ok, true);
  const shieldBefore = player.shield;
  assert.ok(shieldBefore > 0);
  const hpBefore = player.hp;
  game.damage(player, 10, enemy, 'true');
  assert.equal(player.hp, hpBefore, 'The shield absorbs a small hit before HP');
  assert.ok(player.shield < shieldBefore);
  player.hp = player.maxHp * 0.3;
  const woundedHp = player.hp;
  assert.equal(game.cast('f').ok, true);
  assert.ok(player.hp > woundedHp && player.hp <= player.maxHp);
  const previous = { x: player.x, y: player.y };
  assert.equal(game.cast('d', player.x + 700, player.y).ok, true);
  assert.ok(distance(player, previous) > 0 && distance(player, previous) <= 301,
    'Blink moves immediately and clamps to its maximum range');
});

test('shop transactions obey location, gold and six-slot limits without partial mutation', () => {
  const game = makeGame();
  game.start();
  const player = game.player;
  const item = [...ITEMS].sort((a, b) => a.cost - b.cost)[0];
  assert.ok(item && item.cost > 0);
  player.gold = 100000;
  Object.assign(player, { x: 800, y: 800 });
  const awayState = { gold: player.gold, inventory: [...player.inventory], maxHp: player.maxHp, damage: player.damage };
  assert.equal(game.buy(item.id).ok, false, 'Living heroes must shop near their base');
  assert.deepEqual({ gold: player.gold, inventory: [...player.inventory], maxHp: player.maxHp, damage: player.damage }, awayState);
  placeAtBase(player);
  player.gold = item.cost - 1;
  assert.equal(game.buy(item.id).ok, false);
  assert.equal(player.gold, item.cost - 1);
  assert.equal(player.inventory.length, 0);
  player.gold = item.cost;
  assert.equal(game.buy(item.id).ok, true);
  assert.equal(player.gold, 0);
  assert.equal(player.inventory.length, 1);
  player.gold = 100000;
  while (player.inventory.length < 6) assert.equal(game.buy(item.id).ok, true);
  const full = { gold: player.gold, inventory: [...player.inventory], maxHp: player.maxHp, damage: player.damage };
  assert.equal(game.buy(item.id).ok, false);
  assert.deepEqual({ gold: player.gold, inventory: [...player.inventory], maxHp: player.maxHp, damage: player.damage }, full);
});

test('dead heroes may shop and their purchased stats survive respawn', () => {
  const { game, enemy } = makeDuel();
  const item = ITEMS.find(i => i.stats.maxHp > 0);
  assert.ok(item, 'A defensive purchase is needed for this lifecycle test');
  game.player.gold = item.cost;
  const maxHpBefore = game.player.maxHp;
  game.damage(game.player, 1e6, enemy, 'true');
  assert.equal(game.buy(item.id).ok, true);
  assert.ok(game.player.maxHp > maxHpBefore);
  const purchasedMaxHp = game.player.maxHp;
  advance(game, game.player.respawnIn + 0.1);
  assert.equal(game.player.alive, true);
  assert.equal(game.player.inventory.length, 1);
  assert.equal(game.player.maxHp, purchasedMaxHp);
});

test('vision hides distant enemies and reveals nearby enemies without altering their state', () => {
  const { game, enemy } = makeDuel();
  Object.assign(game.player, { x: 300, y: 1300 });
  Object.assign(enemy, { x: 1350, y: 250 });
  const hp = enemy.hp;
  assert.equal(game.isVisible(game.player, 0), true);
  assert.equal(game.visibilityAt(game.player.x, game.player.y, 0), true);
  assert.equal(game.isVisible(enemy, 0), false);
  Object.assign(enemy, { x: game.player.x + 75, y: game.player.y });
  assert.equal(game.isVisible(enemy, 0), true);
  assert.equal(enemy.hp, hp, 'Visibility queries do not simulate combat');
});

test('brush conceals an enemy until a friendly observer enters the brush', () => {
  const { game, enemy } = makeDuel();
  game.entities = [game.player, enemy];
  const brush = MAP.brushes.find(b => b.x > 400 && b.x < 1000 && b.y > 400 && b.y < 1000);
  assert.ok(brush);
  Object.assign(enemy, { x: brush.x, y: brush.y });
  Object.assign(game.player, { x: brush.x + brush.r + 130, y: brush.y });
  advance(game, DT);
  assert.equal(game.visibilityAt(enemy.x, enemy.y, 0), true, 'The location lies in normal sight range');
  assert.equal(game.isVisible(enemy, 0), false, 'Brush blocks the hero despite ordinary sight range');
  Object.assign(game.player, { x: brush.x + 10, y: brush.y });
  assert.equal(game.isVisible(enemy, 0), true);
});

test('a ward extends vision and its expiry removes that information again', () => {
  const { game, enemy } = makeDuel();
  game.entities = [game.player, enemy];
  Object.assign(game.player, { x: 500, y: 800 });
  Object.assign(enemy, { x: 1050, y: 800 });
  advance(game, DT);
  assert.equal(game.isVisible(enemy, 0), false);
  assert.equal(game.cast('ward', 900, 800).ok, true);
  advance(game, DT);
  const ward = game.entities.find(e => e.type === 'ward' && e.alive && e.team === 0);
  assert.ok(ward, 'A successful cast creates an actual ward');
  assert.equal(game.isVisible(enemy, 0), true);
  advance(game, 51);
  assert.equal(game.entities.some(e => e.type === 'ward' && e.alive), false);
  assert.equal(game.isVisible(enemy, 0), false);
});

test('neutral camp rewards and respawning are tied to actual deaths', () => {
  const game = makeGame();
  game.start();
  const camp = game.entities.find(e => e.type === 'monster' && e.kind === 'camp');
  assert.ok(camp && camp.alive);
  quietFixture(game, [camp]);
  placeAtBase(game.player);
  const before = { gold: game.player.gold, xp: game.player.xp, cs: game.player.cs };
  game.damage(camp, 1e6, game.player, 'true');
  assert.equal(camp.alive, false);
  assert.ok(game.player.gold > before.gold && game.player.xp > before.xp);
  assert.equal(game.player.cs, before.cs + 1);
  const creditedGold = game.player.gold;
  game.damage(camp, 1e6, game.player, 'true');
  assert.equal(game.player.gold, creditedGold);
  assert.ok(camp.respawnIn > 0);
  advance(game, camp.respawnIn + 0.1);
  assert.equal(camp.alive, true);
  assert.equal(camp.hp, camp.maxHp);
});

test('timed objectives grant team buffs and boss empowerment expires', () => {
  const game = makeGame();
  game.start();
  const dragon = game.entities.find(e => e.type === 'monster' && e.kind === 'dragon');
  const boss = game.entities.find(e => e.type === 'monster' && e.kind === 'boss');
  const camp = game.entities.find(e => e.type === 'monster' && e.kind === 'camp');
  assert.ok(dragon && boss && camp);
  assert.equal(dragon.alive, false);
  assert.equal(boss.alive, false);
  quietFixture(game, [dragon, boss, camp]);
  placeAtBase(game.player);
  advance(game, 45.1);
  assert.equal(dragon.alive, true);
  assert.equal(boss.alive, false);
  const damageBefore = game.damage(camp, 20, game.player, 'true');
  const goldBefore = game.player.gold;
  game.damage(dragon, 1e6, game.player, 'true');
  assert.equal(dragon.alive, false);
  assert.ok(game.player.gold > goldBefore);
  assert.equal(game.getSnapshot().teamBuffs[0].dragonStacks, 1);
  const damageAfter = game.damage(camp, 20, game.player, 'true');
  assert.ok(damageAfter > damageBefore, 'The dragon buff changes damage resolution');
  advance(game, 120.1 - game.time);
  assert.equal(boss.alive, true);
  game.damage(boss, 1e6, game.player, 'true');
  assert.equal(boss.alive, false);
  assert.ok(game.getSnapshot().teamBuffs[0].bossRemaining > 0);
  advance(game, 70.1);
  assert.equal(game.getSnapshot().teamBuffs[0].bossRemaining, 0);
  assert.equal(game.getSnapshot().teamBuffs[0].dragonStacks, 1, 'Dragon progress persists after the timed buff expires');
});

for (const defendingTeam of [0, 1]) {
  test(`structure dependencies block damage until the lane and base are breached (team ${defendingTeam})`, () => {
    const game = makeGame();
    game.start();
    const attacker = game.entities.find(e => e.type === 'hero' && e.team !== defendingTeam);
    const towers = game.entities.filter(e => e.team === defendingTeam && e.type === 'tower' && e.lane === 'mid')
      .sort((a, b) => distance(b, BASES[defendingTeam]) - distance(a, BASES[defendingTeam]));
    assert.equal(towers.length, 2, 'Each lane has outer and inner turrets');
    const [outer, inner] = towers;
    const inhibitor = game.entities.find(e => e.team === defendingTeam && e.type === 'inhibitor' && e.lane === 'mid');
    const nexus = game.entities.find(e => e.team === defendingTeam && e.type === 'nexus');
    const baseTowers = game.entities.filter(e => e.team === defendingTeam && e.type === 'tower' && distance(e, BASES[defendingTeam]) < 200);
    assert.equal(baseTowers.length, 2);
    assert.equal(game.isProtected(outer), false);
    assert.equal(game.isProtected(inner), true);
    assert.equal(game.isProtected(inhibitor), true);
    assert.equal(game.isProtected(nexus), true);
    const hpBefore = inner.hp;
    game.damage(inner, 1e6, attacker, 'true');
    assert.equal(inner.hp, hpBefore, 'The damage path enforces structural protection');
    for (const structure of [outer, inner, inhibitor]) {
      assert.equal(game.isProtected(structure), false, `${structure.id} unlocks after its predecessor`);
      game.damage(structure, 1e6, attacker, 'true');
      assert.equal(structure.alive, false);
    }
    for (const structure of baseTowers) {
      assert.equal(game.isProtected(structure), false);
      game.damage(structure, 1e6, attacker, 'true');
    }
    assert.equal(game.isProtected(nexus), false);
    game.damage(nexus, 1e6, attacker, 'true');
    advance(game, DT);
    assert.equal(game.over, true);
    assert.equal(game.winner, 1 - defendingTeam);
    const endedTime = game.time;
    advance(game, 3);
    assert.equal(game.time, endedTime, 'Ended matches stop simulation');
  });
}

test('snapshots serialize without exposing mutable simulation objects', () => {
  const game = makeGame();
  game.start();
  advance(game, 1);
  const snapshot = game.getSnapshot();
  assert.doesNotThrow(() => JSON.stringify(snapshot));
  assert.ok(Math.abs(snapshot.time - game.time) <= 0.01, 'Summary time may be rounded to hundredths');
  assert.equal(snapshot.over, game.over);
  assert.ok(snapshot.player);
  const hpBefore = game.player.hp;
  snapshot.player.hp = -999;
  assert.equal(game.player.hp, hpBefore);
});

test('three real AI matches remain finite, bounded, and make combat/structure progress', { timeout: 180000 }, t => {
  const runs = [
    { seed: 7, hero: 'mage' },
    { seed: 31, hero: 'warrior' },
    { seed: 321, hero: 'ranger' },
  ];
  let completed = 0;
  for (const settings of runs) {
    const game = makeGame(settings);
    game.start();
    const initialStructureHp = game.entities.filter(e => STRUCTURES.has(e.type))
      .reduce((sum, e) => sum + e.hp, 0);
    let peakEntities = game.entities.length;
    let peakProjectiles = 0;
    let peakEffects = 0;
    const duration = 720;
    for (let frame = 0; frame < duration * 60 && !game.over; frame++) {
      game.step(DT);
      peakEntities = Math.max(peakEntities, game.entities.length);
      peakProjectiles = Math.max(peakProjectiles, game.projectiles.length);
      peakEffects = Math.max(peakEffects, game.effects.length);
      if (frame % 300 === 0) checkFiniteWorld(game, `seed=${settings.seed},t=${game.time.toFixed(1)}`);
    }
    checkFiniteWorld(game, `seed=${settings.seed}/final`);
    const finalStructureHp = game.entities.filter(e => STRUCTURES.has(e.type))
      .reduce((sum, e) => sum + e.hp, 0);
    const destroyed = game.entities.filter(e => STRUCTURES.has(e.type) && !e.alive).length;
    assert.ok(game.time >= 30, 'The world must not end immediately from initialization');
    assert.ok(game.waveNumber >= 5);
    assert.ok(game.teamKills[0] + game.teamKills[1] > 0, 'AI must engage in lethal combat');
    assert.ok(finalStructureHp < initialStructureHp && destroyed > 0, 'AI and waves must progress through structures');
    assert.ok(peakEntities <= 500, `seed=${settings.seed}: entities grew to ${peakEntities}`);
    assert.ok(peakProjectiles <= 500, `seed=${settings.seed}: projectiles grew to ${peakProjectiles}`);
    assert.ok(peakEffects <= 1000, `seed=${settings.seed}: effects grew to ${peakEffects}`);
    if (game.over) completed++;
    t.diagnostic(JSON.stringify({ seed: settings.seed, hero: settings.hero,
      time: +game.time.toFixed(2), over: game.over, winner: game.winner,
      kills: game.teamKills, waves: game.waveNumber, destroyed,
      peakEntities, peakProjectiles, peakEffects }));
  }
  assert.ok(completed >= 1, 'At least one idle-player AI match must reach a natural ending within 12 minutes');
});
