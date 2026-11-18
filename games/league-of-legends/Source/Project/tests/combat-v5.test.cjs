'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP } = require('../dist/game.js');

const DT = 1 / 60;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const copy = value => JSON.parse(JSON.stringify(value));
function create(hero = 'mage') { const game = new Game({ hero, seed: 123 }); game.start(); return game; }
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) game.step(DT); }
function refresh(game) { game._rebuildIndex(); game._updateVision(true); }

function focusFixture(hero = 'mage') {
  const game = create(hero);
  const enemies = game.entities.filter(e => e.type === 'hero' && e.team === 1).slice(0, 3);
  const minion = game.entities.find(e => e.type === 'minion' && e.team === 1);
  game.entities = [game.player, ...enemies, minion];
  game.nextWaveAt = 1e9;
  Object.assign(game.player, { x: 800, y: 800, autoAttack: false });
  enemies.forEach((e, i) => Object.assign(e, { x: 1000 + 35 * i, y: 800, stunnedUntil: 1000 }));
  Object.assign(minion, { x: 900, y: 850, stunnedUntil: 1000 });
  game._rebuildIndex();
  return { game, enemies, minion };
}

test('focus is independent of movement and does not turn a lock into a chase command', () => {
  const { game, enemies } = focusFixture();
  const target = enemies[0];
  Object.assign(target, { x: 1180, y: 720 }); // Open ground beyond normal attack range, outside the eastern wall.
  game.player.autoAttack = true;
  game._rebuildIndex();
  assert.deepEqual(game.setFocusTarget(target.id), { ok: true, targetId: target.id });
  assert.equal(game._playerTargetId, null);
  const before = { x: game.player.x, y: game.player.y };
  game.step(DT);
  assert.equal(game.player.x, before.x, 'A lock alone never creates a movement destination');
  game.setInputVector(-1, 0);
  game.step(DT);
  assert.ok(game.player.x < before.x, 'Movement remains under the player’s directional control');
  assert.equal(game.getFocusTarget(), target);
  assert.equal(game.commandMove(730, 800).ok, true);
  assert.equal(game.getFocusTarget(), target, 'A click movement keeps the focus preference');
  assert.equal(game.getSnapshot().focusTargetId, target.id);
  game.stop();
  assert.equal(game.getFocusTarget(), null);
});

test('focus cycling is deterministic, excludes nonheroes and hidden units, and wraps', () => {
  const { game, enemies, minion } = focusFixture();
  Object.assign(enemies[2], { x: 680, y: 700, revealedUntil: 0 }); // Brush edge, outside the western high ground.
  game._rebuildIndex();
  assert.equal(game.isVisible(enemies[2], 0), false, 'The third hero is concealed by an actual brush');
  assert.equal(game.cycleFocusTarget().targetId, enemies[0].id);
  assert.equal(game.cycleFocusTarget().targetId, enemies[1].id);
  assert.equal(game.cycleFocusTarget().targetId, enemies[0].id);
  assert.equal(game.setFocusTarget(minion.id).ok, false);
  assert.equal(game.setFocusTarget(game.player.id).ok, false);
  assert.equal(game.setFocusTarget(enemies[2].id).ok, false);
  assert.equal(game.getFocusTarget(), enemies[0], 'A failed new selection does not discard a valid lock');
  enemies.forEach(enemy => { enemy.alive = false; });
  assert.equal(game.cycleFocusTarget().ok, false);
  assert.equal(game.getFocusTarget(), null);
});

test('focus immediately clears on brush concealment, death, player death and range exit', () => {
  for (const reason of ['brush', 'death', 'player death', 'range']) {
    const { game, enemies } = focusFixture();
    const target = enemies[0];
    assert.equal(game.setFocusTarget(target.id).ok, true);
    if (reason === 'brush') Object.assign(target, { x: 680, y: 700, revealedUntil: 0 });
    if (reason === 'death') game.damage(target, 1e6, game.player, 'true');
    if (reason === 'player death') game.damage(game.player, 1e6, target, 'true');
    if (reason === 'range') {
      Object.assign(game.player, { x: 250, y: 600 });
      Object.assign(target, { x: 1151, y: 600 });
      // Actual friendly vision reveals the target, so range alone invalidates it.
      game._add({ id: 'test-ward', type: 'ward', team: 0, alive: true, x: 1150, y: 600, r: 12 });
    }
    game._rebuildIndex();
    if (reason === 'range') assert.equal(game.isVisible(target, 0), true);
    assert.equal(game.getFocusTarget(), null, reason);
    assert.equal(game._focusTargetId, null, reason + ' removes the internal reference');
  }
});

test('autoaim fires at the focused hero while explicit aim takes priority', () => {
  const { game, enemies } = focusFixture();
  Object.assign(enemies[0], { x: 1100, y: 800 });
  Object.assign(enemies[1], { x: 800, y: 900 });
  game._rebuildIndex();
  assert.equal(game.setFocusTarget(enemies[0].id).ok, true);
  const mana = game.player.mana;
  assert.equal(game.cast('q').ok, true);
  const auto = game.projectiles.find(shot => shot.sourceId === game.player.id);
  assert.ok(auto.vx > 0 && Math.abs(auto.vy) < 1e-9, 'Autoaim follows the chosen hero instead of a nearer enemy');
  assert.equal(game.player.mana, mana - game.getSkillInfo('q').cost);
  game.player.cd.q = 0; // Isolate the next input without advancing the target geometry.
  assert.equal(game.cast('q', 800, 600).ok, true);
  const explicit = game.projectiles.at(-1);
  assert.ok(explicit.vy < 0 && Math.abs(explicit.vx) < 1e-9, 'Explicit ground coordinates override the focus');
});

test('a focus beyond a skill range falls back to a reachable visible enemy', () => {
  const { game, enemies } = focusFixture();
  game.gainXp(game.player, game.player.nextXp);
  assert.equal(game.upgradeSkill('w').ok, true);
  Object.assign(enemies[0], { x: 1300, y: 700 });
  Object.assign(enemies[1], { x: 800, y: 900 });
  game._add({ id: 'test-ward', type: 'ward', team: 0, alive: true, x: 1300, y: 700, r: 12 });
  game._rebuildIndex();
  assert.equal(game.setFocusTarget(enemies[0].id).ok, true);
  assert.equal(game.cast('w').ok, true);
  const area = game._pending.find(action => action.sourceId === game.player.id);
  assert.equal(area.x, enemies[1].x);
  assert.equal(area.y, enemies[1].y);
  assert.equal(game.getFocusTarget(), enemies[0], 'A shorter spell does not discard a still-eligible focus');
});

test('automatic basic attacks prefer an in-range focus but respect the autoattack setting', () => {
  const { game, enemies } = focusFixture('ranger');
  Object.assign(enemies[0], { x: 1100, y: 800 });
  Object.assign(enemies[1], { x: 800, y: 860 });
  game._rebuildIndex();
  game.setFocusTarget(enemies[0].id);
  game.step(DT);
  assert.equal(game.projectiles.some(shot => shot.sourceId === 'player'), false);
  game.setAutoAttack(true);
  game.step(DT);
  assert.equal(game.player.attackWindup.targetId, enemies[0].id);
  advance(game, game.player.attackWindup.duration);
  const shot = game.projectiles.find(shot => shot.sourceId === 'player');
  assert.ok(shot && shot.targetId === enemies[0].id);
  assert.equal(game.player.x, 800, 'Focused autoattacks cannot move the player');
});

test('explicit hero attack establishes focus; nonhero attack and recall clear it', () => {
  const { game, enemies, minion } = focusFixture();
  assert.equal(game.attackTarget(enemies[0].id).ok, true);
  assert.equal(game.getFocusTarget(), enemies[0]);
  assert.equal(game.attackTarget(minion.id).ok, true);
  assert.equal(game.getFocusTarget(), null);
  game.setFocusTarget(enemies[0].id);
  assert.equal(game.recall().ok, true);
  assert.equal(game.getFocusTarget(), null);
  game.paused = true;
  assert.equal(game.setFocusTarget(enemies[0].id).ok, false);
  assert.equal(game.cycleFocusTarget().ok, false);
  assert.equal(game.attackTarget(enemies[0].id).ok, false);
  assert.deepEqual(game.setFocusTarget(null), { ok: true, targetId: null });
});

test('changing focus from a clicked hero cancels only its old chase and fires at the in-range new hero', () => {
  for (const mode of ['cycle', 'direct']) {
    const { game, enemies } = focusFixture('ranger');
    const [first, second, hidden] = enemies;
    Object.assign(first, { x: 1180, y: 720 });
    Object.assign(second, { x: 800, y: 1010 });
    Object.assign(hidden, { x: 680, y: 700, revealedUntil: 0 });
    game._rebuildIndex();
    game.setAutoAttack(true);
    assert.equal(game.attackTarget(first.id).ok, true);
    game.step(DT);
    assert.ok(game.player.x > 800, 'The initial click really starts chasing the first hero');
    const before = { x: game.player.x, y: game.player.y };
    const result = mode === 'cycle' ? game.cycleFocusTarget() : game.setFocusTarget(second.id);
    assert.equal(result.targetId, second.id);
    assert.equal(game._playerTargetId, null);
    assert.equal(game.player.targetId, null);
    assert.deepEqual({ x: game.player.x, y: game.player.y }, before, 'Changing focus cannot move or teleport the player');
    game.step(DT);
    assert.deepEqual({ x: game.player.x, y: game.player.y }, before, 'The old chase is not resumed on the next frame');
    assert.equal(game.player.attackWindup.targetId, second.id);
    advance(game, game.player.attackWindup.duration);
    assert.ok(game.projectiles.some(shot => shot.sourceId === 'player' && shot.targetId === second.id), 'The in-range new hero gets the automatic basic attack');
  }
});

test('selecting the same focused hero preserves an intentional explicit attack', () => {
  const { game, enemies } = focusFixture();
  Object.assign(enemies[0], { x: 1180, y: 720 });
  enemies[1].alive = false; enemies[2].alive = false;
  game._rebuildIndex();
  game.attackTarget(enemies[0].id);
  assert.equal(game.setFocusTarget(enemies[0].id).ok, true);
  assert.equal(game._playerTargetId, enemies[0].id);
  assert.equal(game.cycleFocusTarget().targetId, enemies[0].id);
  assert.equal(game._playerTargetId, enemies[0].id);
  game.step(DT);
  assert.ok(game.player.x > 800, 'The still-current explicit attack continues to approach its target');
});

test('changing focus preserves directional movement, click movement and attack-move destinations', () => {
  for (const mode of ['direction', 'click', 'attack-move']) {
    const { game, enemies } = focusFixture();
    game.setFocusTarget(enemies[0].id);
    if (mode === 'direction') game.setInputVector(-1, 0);
    if (mode === 'click') game.commandMove(740, 800);
    if (mode === 'attack-move') game.commandAttackMove(740, 800);
    const before = copy({ input: game._input, move: game._moveDestination, attackMove: game._attackMoveDestination, path: game.player.navPath });
    assert.equal(game.setFocusTarget(enemies[1].id).ok, true);
    assert.deepEqual({ input: game._input, move: game._moveDestination, attackMove: game._attackMoveDestination, path: game.player.navPath }, before, mode);
  }
});

test('v5 focus saves independently from movement and rejects invalid target references', () => {
  const game = create();
  const target = game.entities.find(e => e.type === 'hero' && e.team === 1);
  Object.assign(game.player, { x: 800, y: 800 });
  Object.assign(target, { x: 1000, y: 800, stunnedUntil: 1000 });
  game._rebuildIndex();
  game.setFocusTarget(target.id);
  game.commandMove(740, 800);
  const state = copy(game.exportState());
  assert.equal(state.engineVersion, 9);
  assert.equal(state.state._focusTargetId, target.id);
  const restored = Game.fromState(state);
  assert.equal(restored.paused, true);
  assert.equal(restored.getFocusTarget().id, target.id);
  assert.deepEqual(restored._moveDestination, game._moveDestination);
  assert.notEqual(restored.getFocusTarget(), target, 'The restored lock refers to the restored entity');
  for (const value of [undefined, 12, {}, 'player', 'not-an-entity', 'nexus-1']) {
    const invalid = copy(state);
    if (value === undefined) delete invalid.state._focusTargetId;
    else invalid.state._focusTargetId = value;
    assert.throws(() => Game.fromState(invalid), /focus|missing/);
  }
});

function towerFixture(heroType = 'warrior') {
  const game = create();
  const hero = game.entities.find(e => e.type === 'hero' && e.team === 0 && !e.isPlayer && e.hero === heroType);
  const enemy = game.entities.find(e => e.type === 'hero' && e.team === 1);
  const tower = game.entities.find(e => e.id === 'tower-1-mid-outer');
  const minion = game.entities.find(e => e.type === 'minion' && e.team === 0);
  game.entities = [game.player, hero, enemy, tower, minion];
  game.nextWaveAt = 1e9;
  Object.assign(game.player, { ...MAP.bases[0], autoAttack: false, stunnedUntil: 1000 });
  Object.assign(hero, { x: 520, y: 800, role: 'mid', attackCooldown: 0 });
  Object.assign(enemy, { x: 930, y: 800, stunnedUntil: 1000 });
  Object.assign(tower, { x: 1000, y: 800, targetId: null, aggroTargetId: null, attackCooldown: 1000 });
  Object.assign(minion, { x: 600, y: 800, stunnedUntil: 1000 });
  for (const key of Object.keys(hero.cd)) hero.cd[key] = 1000;
  // The original fixture assumed global tower knowledge. Observe the tower
  // normally before withdrawing beyond hero sight, preserving the dive test.
  hero.x = 720; refresh(game);
  assert.equal(game.getStructureObservation(tower.id, hero.team).visible, true);
  hero.x = 520; refresh(game);
  assert.equal(game.getStructureObservation(tower.id, hero.team).remembered, true);
  return { game, hero, enemy, tower, minion };
}

test('full-health melee AI cannot bypass an uncovered tower through generic target acquisition', () => {
  const { game, hero, enemy, tower } = towerFixture();
  assert.equal(hero.hp, hero.maxHp);
  assert.equal(game.isVisible(enemy, 0), true);
  assert.equal(game._hasSiegeCover(hero, tower), false);
  assert.equal(game._unsafeDive(hero, enemy), true);
  game._thinkHero(hero);
  assert.notEqual(hero.targetId, enemy.id, 'Rejecting the first hero branch also rejects the generic fallback');
  assert.notEqual(hero.targetId, tower.id);
  const start = distance(hero, tower);
  advance(game, 1);
  assert.ok(distance(hero, tower) > tower.range + hero.r, 'The AI stays outside the uncovered tower’s range');
  assert.ok(distance(hero, tower) > start - 120, 'It does not charge to the victim’s position');
});

test('ranged AI can attack a hero near a tower while standing outside its range', () => {
  const { game, hero, enemy, tower } = towerFixture('ranger');
  Object.assign(hero, { x: 500, y: 800 });
  Object.assign(enemy, { x: 800, y: 800 });
  game._rebuildIndex();
  assert.equal(game._hasSiegeCover(hero, tower), false);
  assert.equal(game._unsafeDive(hero, enemy), false);
  game._thinkHero(hero);
  assert.equal(hero.targetId, enemy.id);
  game._performAI(hero, DT);
  assert.equal(hero.attackWindup.targetId, enemy.id);
  advance(game, hero.attackWindup.duration);
  assert.ok(game.projectiles.some(shot => shot.sourceId === hero.id && shot.targetId === enemy.id));
  assert.equal(hero.x, 500, 'Safe firing does not close to the victim or tower');
});

test('siege cover requires a living minion inside the actual tower acquisition radius', () => {
  const { game, hero, enemy, tower, minion } = towerFixture();
  minion.x = tower.x - tower.range - minion.r - 1;
  game._rebuildIndex();
  assert.equal(game._hasSiegeCover(hero, tower), false, 'A nearby wave outside tower range is not yet cover');
  minion.x += 2;
  game._rebuildIndex();
  assert.equal(game._hasSiegeCover(hero, tower), true);
  assert.equal(game._unsafeDive(hero, enemy), false);
  game.damage(minion, 1e6, enemy, 'true');
  assert.equal(game._hasSiegeCover(hero, tower), false, 'A dead tank cannot provide cover');
});

test('AI disengages when the tower focuses it even while a friendly minion is present', () => {
  const { game, hero, enemy, tower, minion } = towerFixture();
  Object.assign(hero, { x: 720, targetId: enemy.id });
  minion.x = 810;
  tower.targetId = hero.id; tower.aggroTargetId = hero.id; tower.aggroUntil = 3;
  game._rebuildIndex();
  assert.equal(game._hasSiegeCover(hero, tower), true);
  const before = distance(hero, tower);
  game._performAI(hero, DT);
  assert.equal(hero.targetId, null);
  assert.ok(distance(hero, tower) > before, 'Tower focus makes the hero move out immediately');
  assert.equal(game.projectiles.some(shot => shot.sourceId === hero.id), false);
});

test('losing the covering minion interrupts an ongoing AI attack approach', () => {
  const { game, hero, enemy, tower, minion } = towerFixture();
  Object.assign(hero, { x: 720, targetId: enemy.id });
  minion.x = 810;
  tower.targetId = minion.id;
  game._rebuildIndex();
  assert.equal(game._towerDanger(hero), null);
  game.damage(minion, 1e6, enemy, 'true');
  const before = distance(hero, tower);
  game._performAI(hero, DT);
  assert.equal(hero.targetId, null);
  assert.ok(distance(hero, tower) > before);
});

test('AI drops an enemy that becomes concealed without following its new hidden position', () => {
  const { game, hero, enemy } = towerFixture('ranger');
  game.entities = game.entities.filter(entity => entity.type !== 'tower');
  Object.assign(hero, { x: 800, y: 800, targetId: enemy.id, aiMove: { x: 1000, y: 800 } });
  Object.assign(enemy, { x: 680, y: 700, revealedUntil: 0 });
  refresh(game); // Observe the now-empty tower slot, isolating concealed-target behaviour.
  assert.equal(game.isVisible(enemy, hero.team), false);
  const before = { x: hero.x, y: hero.y, mana: hero.mana };
  game._performAI(hero, DT);
  game._autoCast(hero, enemy);
  assert.equal(hero.targetId, null);
  assert.equal(hero.aiMove, null);
  assert.deepEqual({ x: hero.x, y: hero.y, mana: hero.mana }, before);
  assert.equal(game.projectiles.some(shot => shot.sourceId === hero.id), false);
});

test('rally orders stop at an uncovered tower edge rather than forcing a suicidal entry', () => {
  const { game, hero, enemy, tower } = towerFixture();
  Object.assign(enemy, { x: 1500, y: 700 });
  game._rebuildIndex();
  game.setTeamOrder('rally', tower.x, tower.y);
  advance(game, 2);
  assert.ok(distance(hero, tower) > tower.range + hero.r);
  assert.notEqual(hero.targetId, tower.id);
});

test('ranged kiting at a map edge keeps navigation goals valid for saving and restoration', () => {
  const game = create();
  const hero = game.entities.find(e => e.type === 'hero' && e.team === 0 && e.hero === 'ranger');
  const enemy = game.entities.find(e => e.type === 'hero' && e.team === 1 && e.hero === 'warrior');
  Object.assign(hero, { x: 700, y: 1572, targetId: enemy.id, attackCooldown: 0.5 });
  Object.assign(enemy, { x: 700, y: 1460, stunnedUntil: 1000 });
  game._rebuildIndex();
  game._performAI(hero, DT);
  assert.ok(!hero._navGoal || (hero._navGoal.x >= 0 && hero._navGoal.x <= MAP.width && hero._navGoal.y >= 0 && hero._navGoal.y <= MAP.height));
  const saved = copy(game.exportState());
  assert.doesNotThrow(() => Game.fromState(saved));
  const restored = Game.fromState(saved, { paused: false, clearInput: false });
  advance(game, 0.2); advance(restored, 0.2);
  assert.deepEqual(restored.exportState(), game.exportState());
});
