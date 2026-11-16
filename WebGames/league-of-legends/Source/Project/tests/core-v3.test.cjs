'use strict';

// These tests drive the real simulation; fixture edits isolate attackers or
// place actors without replacing hazard, damage, targeting, or AI behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../dist/game.js');
const History = require('../dist/history.js');

const DT = 1 / 60;
const BASE = { x: 165, y: 1435 };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-5,
  `${message}: expected ${expected}, received ${actual}`);

function create() {
  const game = new Game({ hero: 'mage', difficulty: 'normal', seed: 97 });
  game.start();
  return game;
}

function advance(game, seconds) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) game.step(DT);
}

function until(game, predicate, maxSeconds = 10) {
  for (let i = 0; i < maxSeconds * 60; i++) {
    if (predicate()) return;
    game.step(DT);
  }
  assert.ok(predicate(), 'The expected simulation event must occur within the fixture time limit');
}

function isolate(game, keep = []) {
  const ids = new Set([game.player.id, ...keep.map(entity => entity.id)]);
  game.entities = game.entities.filter(entity => ids.has(entity.id));
  game.nextWaveAt = 1e9;
  game.player.autoAttack = false;
  game.setInputVector(0, 0);
  return game;
}

function objectiveFixture(kind = 'dragon') {
  const game = create();
  const monster = game.entities.find(entity => entity.type === 'monster' && entity.kind === kind);
  const ally = game.entities.find(entity => entity.type === 'hero' && entity.team === 0 && !entity.isPlayer);
  const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
  isolate(game, [monster, ally, enemy]);
  Object.assign(game.player, BASE);
  Object.assign(ally, { ...BASE, stunnedUntil: 1e9 });
  Object.assign(enemy, { x: 1435, y: 165, stunnedUntil: 1e9 });
  advance(game, kind === 'boss' ? 120.1 : 45.1);
  assert.equal(monster.alive, true);
  monster.attackCooldown = 1e9; // Isolate the telegraph from ordinary monster attacks.
  monster.speed = 0;
  Object.assign(game.player, { x: monster.homeX - 100, y: monster.homeY });
  advance(game, DT);
  game.damage(monster, 1, game.player, 'true');
  return { game, monster, ally, enemy };
}

function firstHazard(game, monster) {
  until(game, () => game.getHazards(0).some(hazard => hazard.sourceId === monster.id), 4);
  return game.getHazards(0).find(hazard => hazard.sourceId === monster.id);
}

function deathFixture() {
  const game = create();
  const enemies = game.entities.filter(entity => entity.type === 'hero' && entity.team === 1).slice(0, 3);
  isolate(game, enemies);
  Object.assign(game.player, { x: 800, y: 800, armor: 0 });
  for (const [index, enemy] of enemies.entries()) Object.assign(enemy, { x: 900 + index * 20, y: 800, stunnedUntil: 1e9 });
  advance(game, DT);
  return { game, enemies };
}

for (const kind of ['dragon', 'boss']) {
  test(`${kind} telegraph appears before its impact and resolves real damage once`, () => {
    const { game, monster } = objectiveFixture(kind);
    const hazard = firstHazard(game, monster);
    assert.ok(hazard.radius > 0 && hazard.at > game.time);
    assert.ok(hazard.progress >= 0 && hazard.progress < 1);
    const hpBefore = game.player.hp;
    advance(game, Math.max(0, hazard.at - game.time - DT * 2));
    close(game.player.hp, hpBefore, 'An unresolved warning must not deal its damage early');
    const progressing = game.getHazards(0).find(entry => entry.id === hazard.id);
    assert.ok(progressing && progressing.progress > hazard.progress);
    advance(game, DT * 4);
    assert.ok(game.player.hp < hpBefore, 'Standing in the announced area takes real HP damage');
    assert.equal(game.getHazards(0).some(entry => entry.id === hazard.id), false);
    const afterImpact = game.player.hp;
    advance(game, 0.3);
    assert.ok(game.player.hp >= afterImpact, 'The resolved warning cannot hit again on later frames');
  });
}

test('moving out of a neutral telegraph avoids its damage through normal player movement', () => {
  const { game, monster } = objectiveFixture();
  const hazard = firstHazard(game, monster);
  const hpBefore = game.player.hp;
  game.commandMove(hazard.x + hazard.radius + game.player.r + 100, hazard.y);
  advance(game, hazard.at - game.time + DT * 2);
  assert.ok(distance(game.player, hazard) > hazard.radius + game.player.r);
  close(game.player.hp, hpBefore, 'A player outside the impact radius takes no telegraph damage');
});

test('allied AI evades an announced hazard even when a rally order asks it to hold the impact point', () => {
  const { game, monster, ally } = objectiveFixture();
  const hazard = firstHazard(game, monster);
  Object.assign(ally, { x: hazard.x, y: hazard.y, stunnedUntil: 0 });
  assert.equal(game.setTeamOrder('rally', hazard.x, hazard.y).ok, true);
  const hpBefore = ally.hp;
  advance(game, hazard.at - game.time + DT * 2);
  assert.ok(distance(ally, hazard) > hazard.radius + ally.r, 'AI movement clears the announced impact');
  close(ally.hp, hpBefore, 'The evasive movement prevents actual HP loss');
});

test('death of the source or its current target cancels a pending neutral hazard', () => {
  for (const death of ['source', 'target']) {
    const { game, monster, ally } = objectiveFixture();
    const hazard = firstHazard(game, monster);
    Object.assign(ally, { x: hazard.x, y: hazard.y });
    if (death === 'source') game.damage(monster, 1e6, game.player, 'true');
    else game.damage(game.player, 1e6, monster, 'true');
    // An epic kill can level/heal the ally; capture HP after those legitimate rewards.
    const allyHp = ally.hp;
    assert.equal(game.getHazards(0).some(entry => entry.id === hazard.id), false);
    advance(game, hazard.at - game.time + DT * 2);
    close(ally.hp, allyHp, `${death} death cancels the hit for another actor still inside the warning`);
  }
});

test('breaking a neutral monster leash cancels the warning instead of damaging another nearby actor', () => {
  const { game, monster, ally } = objectiveFixture();
  const hazard = firstHazard(game, monster);
  Object.assign(ally, { x: hazard.x, y: hazard.y });
  const allyHp = ally.hp;
  Object.assign(game.player, BASE); // A controlled relocation beyond the leash boundary.
  advance(game, DT);
  assert.equal(monster.inCombat, false);
  assert.equal(game.getHazards(0).some(entry => entry.id === hazard.id), false);
  advance(game, hazard.at - game.time + DT * 2);
  close(ally.hp, allyHp, 'A leashed-back monster cannot leave an orphaned damaging warning');
});

test('hazard views respect team vision and return detached display data', () => {
  const { game, monster, enemy } = objectiveFixture();
  const hazard = firstHazard(game, monster);
  assert.equal(game.getHazards(1).length, 0, 'A team without local vision receives no hidden warning');
  const copy = game.getHazards(0);
  copy[0].x = -999;
  copy[0].progress = 99;
  assert.equal(game.getHazards(0)[0].x, hazard.x);
  assert.ok(game.getHazards(0)[0].progress <= 1);
  Object.assign(enemy, { x: hazard.x + 50, y: hazard.y });
  advance(game, DT);
  assert.equal(game.getHazards(1).some(entry => entry.id === hazard.id), true);
});

for (const kind of ['dragon', 'boss']) {
  test(`${kind} orders require a live objective, approach through fog, engage with allies, and clear on death`, () => {
    const game = create();
    const monster = game.entities.find(entity => entity.type === 'monster' && entity.kind === kind);
    const allies = game.entities.filter(entity => entity.type === 'hero' && entity.team === 0 && !entity.isPlayer).slice(0, 2);
    isolate(game, [monster, ...allies]);
    Object.assign(game.player, BASE);
    for (const ally of allies) Object.assign(ally, { ...BASE, stunnedUntil: 1e9 });
    game.setTeamOrder('rally', 800, 800);
    assert.equal(game.setTeamOrder(kind).ok, false);
    assert.equal(game.order.type, 'rally', 'A rejected objective order preserves the current order');
    game.setTeamOrder('clear');
    advance(game, kind === 'boss' ? 120.1 : 45.1);
    assert.equal(monster.alive, true);
    for (const ally of allies) ally.stunnedUntil = 0;
    monster.attackCooldown = 1e9;
    monster.speed = 0;
    const hpBefore = monster.hp;
    assert.equal(game.isVisible(monster, 0), false);
    assert.equal(game.setTeamOrder(kind).ok, true);
    assert.equal(game.order.type, kind);
    advance(game, 0.3);
    for (const ally of allies) assert.notEqual(ally.targetId, monster.id, 'An unseen objective is approached without blind attack targeting');
    close(monster.hp, hpBefore, 'No objective damage is dealt through fog');
    for (const [index, ally] of allies.entries()) Object.assign(ally, {
      x: monster.homeX - 100, y: monster.homeY + index * 40, hp: ally.maxHp, mana: ally.maxMana
    });
    game.setTeamOrder(kind);
    advance(game, 0.7);
    assert.equal(game.isVisible(monster, 0), true);
    assert.ok(monster.hp < hpBefore, 'Healthy allied participants engage the visible objective');
    game.damage(monster, 1e6, game.player, 'true');
    assert.equal(game.order, null);
    for (const ally of allies) {
      assert.notEqual(ally.targetId, monster.id);
      assert.equal(ally.orderType, null);
      assert.deepEqual(ally.navPath, []);
    }
    assert.equal(game.setTeamOrder(kind).ok, false, 'The defeated objective cannot receive a new order before respawn');
  });
}

test('objective orders preserve low-health retreat priority', () => {
  const { game, monster, ally } = objectiveFixture();
  Object.assign(game.player, BASE);
  Object.assign(ally, { x: 700, y: 900, hp: ally.maxHp * 0.1, mana: ally.maxMana * 0.2, stunnedUntil: 0 });
  ally.cd.f = 1000;
  assert.equal(game.setTeamOrder('dragon').ok, true);
  let reachedBase = false;
  for (let i = 0; i < 12 * 60; i++) {
    game.step(DT);
    if (distance(ally, BASE) < 155) reachedBase = true;
  }
  assert.equal(ally.alive, true);
  assert.equal(reachedBase, true, 'A critical ally reaches safety instead of obeying the epic attack order');
  assert.equal(monster.alive, true);
});

function towerFixture() {
  const game = create();
  const tower = game.entities.find(entity => entity.type === 'tower' && entity.team === 1 && entity.structureTier === 'outer' && entity.lane === 'mid');
  const ally = game.entities.find(entity => entity.type === 'hero' && entity.team === 0 && !entity.isPlayer);
  isolate(game, [tower, ally]);
  Object.assign(game.player, { x: tower.x - 120, y: tower.y, hp: 10000, maxHp: 10000, armor: 0 });
  Object.assign(ally, { ...BASE, hp: 10000, maxHp: 10000, armor: 0, stunnedUntil: 1e9 });
  const hits = [];
  const damage = game.damage.bind(game);
  game.damage = function(target, amount, source, kind) {
    const victim = typeof target === 'string' ? this.entities.find(entity => entity.id === target) : target;
    const attacker = typeof source === 'string' ? this.entities.find(entity => entity.id === source) : source;
    const hpBefore = victim ? victim.hp : 0;
    const result = damage(target, amount, source, kind);
    if (victim && attacker === tower) hits.push({ targetId: victim.id, raw: amount, hpLoss: hpBefore - victim.hp });
    return result;
  };
  return { game, tower, ally, hits };
}

test('consecutive tower shots ramp actual hero damage and cap at the fourth shot', () => {
  const { game, tower, hits } = towerFixture();
  until(game, () => hits.length >= 5, 10);
  const expected = [1, 1.22, 1.44, 1.66, 1.66];
  for (let i = 0; i < 5; i++) {
    close(hits[i].raw, tower.damage * expected[i], 'Tower projectile ramp');
    close(hits[i].hpLoss, hits[i].raw, 'An unarmored hero receives the ramped HP damage');
  }
  assert.equal(tower.rampStacks, 3);
});

test('tower ramp resets on target change and after a four-second gap', () => {
  const { game, tower, ally, hits } = towerFixture();
  until(game, () => hits.length >= 3, 8);
  Object.assign(game.player, BASE);
  Object.assign(ally, { x: tower.x - 120, y: tower.y });
  until(game, () => hits.some(hit => hit.targetId === ally.id), 4);
  close(hits.find(hit => hit.targetId === ally.id).raw, tower.damage, 'Changing hero targets resets escalation');
  Object.assign(ally, BASE);
  advance(game, 4.2);
  assert.equal(tower.rampStacks, 0);
  const oldCount = hits.length;
  Object.assign(game.player, { x: tower.x - 120, y: tower.y });
  until(game, () => hits.length > oldCount, 3);
  close(hits[oldCount].raw, tower.damage, 'The first shot after a gap starts at base damage');
});

test('death recap separates real HP loss, shield absorption, types, and overkill', () => {
  const { game, enemies } = deathFixture();
  assert.equal(game.getDeathRecap(), null);
  Object.assign(game.player, { hp: 300, shield: 60, shieldUntil: 1e9 });
  game.damage(game.player, 100, enemies[0], 'physical'); // 60 absorbed, 40 HP.
  game.damage(game.player, 50, enemies[1], 'magic'); // 50 HP.
  assert.equal(game.getDeathRecap(), null, 'A live player has no completed death recap');
  game.damage(game.player, 1000, enemies[0], 'true'); // 210 remaining HP, not 1000.
  const recap = game.getDeathRecap();
  assert.equal(game.player.alive, false);
  close(recap.totalDamage, 300, 'Recap total counts real HP damage');
  close(recap.totalAbsorbed, 60, 'Recap total records shield absorption separately');
  assert.equal(recap.windowSeconds, 10);
  const first = recap.sources.find(row => row.sourceId === enemies[0].id);
  close(first.damage, 250, 'First attacker HP damage');
  close(first.absorbed, 60, 'First attacker absorbed damage');
  close(first.physical, 40, 'Physical damage excludes absorbed shield');
  close(first.true, 210, 'True damage excludes overkill');
  close(recap.sources.reduce((sum, row) => sum + row.physical + row.magic + row.true, 0), recap.totalDamage, 'Damage type totals equal HP damage');
});

test('death recap excludes expired hits, remains after respawn, and replaces only on the next death', () => {
  const { game, enemies } = deathFixture();
  game.damage(game.player, 40, enemies[0], 'physical');
  advance(game, 10.2);
  game.player.hp = 100;
  game.damage(game.player, 1000, enemies[1], 'true');
  const recap = game.getDeathRecap();
  close(recap.totalDamage, 100, 'Hits older than ten seconds are excluded');
  assert.equal(recap.sources.some(row => row.sourceId === enemies[0].id), false);
  const untouched = JSON.parse(JSON.stringify(recap));
  recap.sources[0].damage = -999;
  recap.totalDamage = -999;
  assert.deepEqual(game.getDeathRecap(), untouched, 'Recap arrays and rows are detached clones');
  advance(game, game.player.respawnIn + 0.1);
  assert.equal(game.player.alive, true);
  assert.deepEqual(game.getDeathRecap(), untouched, 'The last recap remains available after respawn');
  game.player.hp = 80;
  game.damage(game.player, 1000, enemies[2], 'true');
  const second = game.getDeathRecap();
  close(second.totalDamage, 80, 'A new death starts with the new life damage history');
  assert.equal(second.sources.length, 1);
  assert.equal(second.sources[0].sourceId, enemies[2].id);
});

test('shield-only sources are retained and large death histories have bounded rows and hits', () => {
  const { game, enemies } = deathFixture();
  Object.assign(game.player, { hp: 100, shield: 100, shieldUntil: 1e9 });
  game.damage(game.player, 50, enemies[0], 'physical');
  game.damage(game.player, 50, enemies[1], 'magic');
  game.damage(game.player, 1e6, enemies[2], 'true');
  const shieldRecap = game.getDeathRecap();
  close(shieldRecap.totalDamage, 100, 'Shield-only hits add no HP damage');
  close(shieldRecap.totalAbsorbed, 100, 'Shield-only sources are preserved');
  assert.equal(shieldRecap.sources.filter(row => row.damage === 0 && row.absorbed === 50).length, 2);
  const fresh = deathFixture().game;
  fresh.player.hp = 1000;
  fresh.player.maxHp = 1000;
  const sources = Array.from({ length: 20 }, (_, i) => ({ id: 'fixture-source-' + i, name: '미니언 ' + i, type: 'minion', team: 1 }));
  for (let i = 0; i < 300; i++) fresh.damage(fresh.player, 0.1, sources[i % sources.length], 'true');
  fresh.damage(fresh.player, 1e6, sources[0], 'true');
  const bounded = fresh.getDeathRecap();
  assert.ok(bounded.sources.length <= 12);
  assert.ok(bounded.sources.some(row => row.sourceId === 'other'));
  assert.ok(bounded.sources.reduce((sum, row) => sum + row.hits, 0) <= 256);
  close(bounded.sources.reduce((sum, row) => sum + row.damage, 0), bounded.totalDamage, 'Grouped rows preserve the bounded history total');
});

function lastHitFixture() {
  const game = create();
  const minion = game.entities.find(entity => entity.type === 'minion' && entity.team === 1);
  assert.ok(minion);
  isolate(game, [minion]);
  Object.assign(game.player, { x: 800, y: 800, damage: 100 });
  Object.assign(minion, { x: 900, y: 800, speed: 0, stunnedUntil: 1e9, armor: 100, shield: 10, hp: 45 });
  advance(game, DT);
  return { game, minion };
}

test('last-hit hints share real armor, shield, and next-attack damage resolution', () => {
  const { game, minion } = lastHitFixture();
  assert.equal(game.canLastHit(minion), false, '100 attack through 100 armor cannot remove 45 HP plus 10 shield');
  game.player.nextAttackBonus = 20;
  const before = { hp: minion.hp, shield: minion.shield, bonus: game.player.nextAttackBonus };
  assert.equal(game.canLastHit(minion.id), true);
  assert.deepEqual({ hp: minion.hp, shield: minion.shield, bonus: game.player.nextAttackBonus }, before, 'A hint does not mutate combat');
  assert.equal(game.attackTarget(minion.id).ok, true);
  advance(game, 0.5);
  assert.equal(minion.alive, false, 'The hinted lethal hit actually kills with the same rules');
  assert.equal(game.player.nextAttackBonus, 0);
});

test('last-hit hints include dragon buffs but require an alive visible enemy minion in range', () => {
  const { game, minion } = lastHitFixture();
  Object.assign(minion, { shield: 0, hp: 51 });
  assert.equal(game.canLastHit(minion), false);
  game.teamBuffs[0].dragonStacks = 1;
  game.player.attackCooldown = 10;
  assert.equal(game.canLastHit(minion), true, 'The damage cue includes the buff and does not imply attack readiness');
  minion.x = game.player.x + game.player.range + minion.r + 9;
  assert.equal(game.canLastHit(minion), false, 'A lethal amount is insufficient outside basic attack range');
  game.player.range = 1000;
  Object.assign(minion, { x: 1400, y: 800 });
  assert.equal(game.isVisible(minion, 0), false);
  assert.equal(game.canLastHit(minion), false, 'Long range does not reveal a hidden minion');
  minion.x = game.player.x + 100;
  minion.team = 0;
  assert.equal(game.canLastHit(minion), false);
  minion.team = 1;
  minion.type = 'monster';
  assert.equal(game.canLastHit(minion), false);
  minion.type = 'minion';
  minion.alive = false;
  assert.equal(game.canLastHit(minion), false);
});

test('surrender is a one-time completed outcome, works while paused, and produces a history record', () => {
  const game = new Game({ hero: 'mage', difficulty: 'normal', seed: 97 });
  assert.equal(game.surrender().ok, false);
  assert.equal(game.over, false);
  assert.equal(History.makeRecord(game), null);
  game.start();
  game.setTeamOrder('rally', 800, 800);
  game.commandMove(800, 800);
  game.recall();
  game.paused = true;
  assert.equal(game.surrender().ok, true);
  assert.equal(game.over, true);
  assert.equal(game.winner, 1);
  assert.equal(game.endReason, 'surrender');
  assert.equal(game.order, null);
  assert.equal(game.player.recallLeft, 0);
  assert.deepEqual(game.player.navPath, []);
  assert.deepEqual(game.getHazards(0), []);
  const endedTime = game.time;
  assert.equal(game.surrender().ok, false);
  game.paused = false;
  advance(game, 1);
  assert.equal(game.time, endedTime);
  const result = History.makeRecord(game, '2026-11-14T12:00:00Z');
  assert.ok(result && result.version === 3);
  assert.equal(result.endReason, 'surrender');
  assert.equal(result.winner, 1);
});

function assertLeavesBaseForDragon(game, context) {
  const goal = { x: 1080, y: 1080 };
  assert.equal(game.commandMove(goal.x, goal.y).ok, true);
  // Preserve the complete map, allied structures, other actors, and default
  // automatic attacks: removing the base structures hides the reported bug.
  for (let i = 0; i < 30 * 60 && game.player.alive && distance(game.player, goal) > 12; i++) game.step(DT);
  assert.equal(game.player.alive, true, `${context}: the hero survives the route`);
  assert.ok(distance(game.player, goal) <= 12,
    `${context}: stuck at ${game.player.x.toFixed(3)},${game.player.y.toFixed(3)}, ` +
    `${distance(game.player, goal).toFixed(3)} from the goal, path=${JSON.stringify(game.player.navPath)}`);
}

test('all three heroes leave overlapping base structures after a real death and respawn', () => {
  for (const hero of ['mage', 'warrior', 'ranger']) {
    const game = new Game({ hero, difficulty: 'normal', seed: 97 });
    game.start();
    const enemy = game.entities.find(entity => entity.type === 'hero' && entity.team === 1);
    game.damage(game.player, 1e6, enemy, 'true');
    assert.equal(game.player.alive, false);
    until(game, () => game.player.alive, 30);
    assert.ok(distance(game.player, BASE) < 180);
    assertLeavesBaseForDragon(game, `${hero}/respawn`);
  }
});

test('all three heroes leave overlapping base structures after a normal recall', () => {
  for (const hero of ['mage', 'warrior', 'ranger']) {
    const game = new Game({ hero, difficulty: 'normal', seed: 97 });
    game.start();
    assert.equal(game.recall().ok, true);
    until(game, () => game.player.recallLeft === 0 && distance(game.player, BASE) < 180, 10);
    assertLeavesBaseForDragon(game, `${hero}/recall`);
  }
});
