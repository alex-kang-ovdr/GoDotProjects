import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Game, CARDS, DEFAULT_DECK } from '../dist/js/engine.js';

const DT = 1 / 60;
const V2_DECK = ['hog_rider', 'spear_goblins', 'duelist', 'zap', 'poison', 'ice_spirit', 'cannon', 'knight'];
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function advance(game, seconds, observe) {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.update(DT);
    observe?.(game);
  }
}

// Controlled scenario setup only. Compatibility fixtures use ordinary input.
function equip(game, team, cardId) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  if (!hand.includes(cardId)) {
    const index = queue.indexOf(cardId);
    if (index >= 0) [hand[0], queue[index]] = [queue[index], hand[0]];
    else hand[0] = cardId;
  }
  game.state.elixir[team] = 10;
  return hand.indexOf(cardId);
}

function deploy(game, team, cardId, x, y) {
  const index = equip(game, team, cardId);
  const previous = new Set(game.state.units.map(u => u.id));
  const result = game.playCard(team, index, x, y);
  assert.equal(result.ok, true, `${cardId} at ${x},${y}: ${result.reason}`);
  return game.state.units.filter(u => !previous.has(u.id));
}

function quiet(game) {
  for (const tower of game.state.towers) tower.active = false;
}

function assertNoStaticOverlap(game, units) {
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    assert.ok(unit.x - unit.radius >= -1e-7 && unit.x + unit.radius <= 480 + 1e-7);
    assert.ok(unit.y - unit.radius >= -1e-7 && unit.y + unit.radius <= 640 + 1e-7);
    for (const tower of game.state.towers.filter(t => !t.destroyed)) {
      assert.ok(distance(unit, tower) + 1e-7 >= unit.radius + tower.radius, `${unit.cardId} overlaps ${tower.id}`);
    }
    for (const other of game.state.units) {
      if (other === unit || other.hp <= 0 || (!other.isBuilding && other.flying !== unit.flying)) continue;
      assert.ok(distance(unit, other) + 1e-7 >= unit.radius + other.radius, 'deployment overlaps an existing body');
    }
  }
}

function assertDryBody(unit) {
  if (unit.flying) return;
  if (unit.y > 300 - unit.radius + 1e-7 && unit.y < 340 + unit.radius - 1e-7) {
    const bridgeDistance = Math.min(Math.abs(unit.x - 120), Math.abs(unit.x - 360));
    assert.ok(bridgeDistance + unit.radius <= 27 + 1e-6,
      `ground body touches water: ${unit.cardId} (${unit.x},${unit.y}), radius ${unit.radius}`);
  }
}

test('formation previews exactly match collision-free spawning at walls, towers and river banks', () => {
  const cases = [
    ['archers', 157, 490], ['archers', 9, 420], ['archers', 471, 420],
    ['goblins', 240, 340], ['skeletons', 120, 340], ['minions', 240, 340], ['cannon', 240, 340],
  ];
  for (const [cardId, x, playerY] of cases) {
    const mirrored = [];
    for (const team of ['player', 'enemy']) {
      const game = new Game({ seed: 33 }).start();
      const y = team === 'player' ? playerY : 640 - playerY;
      const index = equip(game, team, cardId);
      const before = game.exportSnapshot();
      const preview = game.previewDeployment(team, cardId, x, y);
      assert.equal(preview.ok, true);
      assert.deepEqual(game.exportSnapshot(), before, 'preview is a pure query');
      assert.equal(game.playCard(team, index, x, y).ok, true);
      const units = game.state.units;
      assert.deepEqual(units.map(({ x, y, radius, flying }) => ({ x, y, radius, flying })), preview.positions);
      assert.equal(units.length, CARDS[cardId].count);
      assertNoStaticOverlap(game, units);
      for (const unit of units) {
        assert.ok(team === 'player' ? unit.y - unit.radius >= 340 - 1e-7 : unit.y + unit.radius <= 300 + 1e-7,
          'each whole body must start on its deployable bank');
      }
      mirrored.push(units);
    }
    for (let i = 0; i < mirrored[0].length; i++) {
      assert.ok(Math.abs(mirrored[0][i].x - mirrored[1][i].x) < 1e-7);
      assert.ok(Math.abs(mirrored[0][i].y + mirrored[1][i].y - 640) < 1e-7,
        'equivalent formation placement is symmetric between teams');
    }
  }
});

test('new troop and building placements avoid existing bodies and invalid previews do not spend resources', () => {
  for (const first of ['cannon', 'knight']) {
    const game = new Game({ seed: 55 }).start();
    deploy(game, 'player', first, 240, 420);
    const spawned = deploy(game, 'player', first === 'cannon' ? 'archers' : 'cannon', 240, 420);
    assertNoStaticOverlap(game, spawned);
    const index = equip(game, 'player', 'knight');
    const before = game.exportSnapshot();
    const invalid = game.previewDeployment('player', 'knight', 240, 240);
    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.positions, []);
    assert.deepEqual(invalid.affectedTargets, []);
    assert.equal(game.playCard('player', index, 240, 240).ok, false);
    assert.deepEqual(game.exportSnapshot(), before, 'failed plans leave cost, cycle, commands and state untouched');
  }
});

test('unlocked forward deployment fits every swarm member inside the captured territory', () => {
  for (const team of ['player', 'enemy']) {
    const game = new Game({ seed: 56 }).start();
    game.state.towers.find(t => t.team !== team && t.lane === 'left').hp = 0;
    game.update(DT);
    const units = deploy(game, team, 'goblins', 188, team === 'player' ? 300 : 340);
    for (const unit of units) {
      assert.ok(Math.abs(unit.x - 120) + unit.radius <= 77 + 1e-7);
      assert.ok(team === 'player' ? unit.y + unit.radius <= 300 + 1e-7 : unit.y - unit.radius >= 340 - 1e-7);
      assertDryBody(unit);
    }
    assertNoStaticOverlap(game, units);
  }
});

test('ground body boundaries remain legal during movement, separation and a shoreline knockback', () => {
  const game = new Game({ seed: 57 }).start();
  quiet(game);
  const [knight] = deploy(game, 'player', 'knight', 240, 354);
  deploy(game, 'player', 'goblins', 240, 360);
  deploy(game, 'enemy', 'fireball', 240, 405);
  let damageObserved = false, crossingObserved = false;
  advance(game, 14, () => {
    damageObserved ||= knight.hp < knight.maxHp;
    for (const unit of game.state.units) {
      assertDryBody(unit);
      if (unit.y > 300 && unit.y < 340) crossingObserved = true;
    }
  });
  assert.equal(damageObserved, true, 'the scenario must include an actual impact');
  assert.equal(crossingObserved, true, 'legal river traversal must still make progress');
});

test('a friendly building blocking a bridge entrance diverts a giant to the other bridge on both teams', () => {
  for (const team of ['player', 'enemy']) {
    for (const y of [350, 370]) {
      const game = new Game({ seed: 44 }).start();
      quiet(game);
      deploy(game, team, 'cannon', 120, team === 'player' ? y : 640 - y);
      const [giant] = deploy(game, team, 'giant', 120, team === 'player' ? 440 : 200);
      let crossedOtherBridge = false, reachedBank = false;
      advance(game, 20, () => {
        assertDryBody(giant);
        crossedOtherBridge ||= giant.y > 300 && giant.y < 340 && Math.abs(giant.x - 360) < 8;
        reachedBank ||= team === 'player' ? giant.y < 300 - giant.radius : giant.y > 340 + giant.radius;
      });
      assert.equal(crossedOtherBridge, true);
      assert.equal(reachedBank, true, 'unit must escape the previously permanent shoreline stall before the building expires');
    }
  }
});

function shootingScenario(rulesVersion, poison) {
  const game = new Game({ seed: 721, rulesVersion }).start();
  quiet(game);
  const [archer] = deploy(game, 'player', 'archers', 240, 420);
  game.state.units = game.state.units.filter(u => u.cardId !== 'archers' || u === archer);
  Object.assign(archer, { x: 240, y: 420, deployRemaining: 0 });
  const [tank] = deploy(game, 'enemy', 'giant', 240, 220);
  Object.assign(tank, { x: 240, y: 450, deployRemaining: 0, stunRemaining: 60 });
  if (poison) deploy(game, 'enemy', 'poison', 240, 420);
  advance(game, 2.6);
  return { damage: game.state.stats.player.damageDealt, archer, tank };
}

test('poison slows movement without slowing attacks or buildings under rules 3, while rules 2 stay unchanged', () => {
  const normal = shootingScenario(3, false), poisoned = shootingScenario(3, true);
  assert.ok(poisoned.archer.hp < normal.archer.hp, 'the shooter actually remains in poison');
  assert.equal(normal.damage, 3 * CARDS.archers.damage);
  assert.equal(poisoned.damage, normal.damage, 'movement-only slow preserves the attack cadence');
  assert.equal(shootingScenario(2, true).damage, 2 * CARDS.archers.damage, 'old recordings retain their historical action slow');

  const displacements = [];
  for (const slow of [false, true]) {
    const game = new Game({ seed: 58 }).start();
    quiet(game);
    const [knight] = deploy(game, 'player', 'knight', 240, 420);
    knight.deployRemaining = 0;
    const start = { x: knight.x, y: knight.y };
    if (slow) game._applyStatus(knight, CARDS.poison);
    advance(game, 0.1);
    displacements.push(distance(start, knight));
    const tower = game.state.towers.find(t => t.team === 'player' && t.type === 'princess');
    game._applyStatus(tower, CARDS.poison);
    assert.equal(tower.slowRemaining, 0, 'a movement-only effect does not claim to slow an immobile tower');
  }
  assert.ok(Math.abs(displacements[1] / displacements[0] - CARDS.poison.slowFactor) < 1e-7);
});

test('same-tick mutual king destruction is a draw regardless of command order; equal overtime losses continue', () => {
  for (const order of [['player', 'enemy'], ['enemy', 'player']]) {
    const game = new Game({ seed: 59 }).start();
    for (const tower of game.state.towers.filter(t => t.type === 'king')) tower.hp = CARDS.fireball.crownDamage;
    for (const team of order) deploy(game, team, 'fireball', 240, team === 'player' ? 65 : 575);
    advance(game, 0.5);
    assert.equal(game.state.winner, 'draw');
    assert.equal(game.state.reason, 'king');
    assert.deepEqual(game.state.crowns, { player: 3, enemy: 3 });
    assert.equal(game.state.stats.player.damageDealt, game.state.stats.enemy.damageDealt);
  }
  const game = new Game({ seed: 60 }).start();
  game.state.time = 180;
  game.state.phase = 'overtime';
  for (const tower of game.state.towers.filter(t => t.lane === 'left')) tower.hp = CARDS.fireball.crownDamage;
  deploy(game, 'player', 'fireball', 120, 150);
  deploy(game, 'enemy', 'fireball', 120, 490);
  advance(game, 0.5);
  assert.deepEqual(game.state.crowns, { player: 1, enemy: 1 });
  assert.equal(game.state.running, true);
  game.state.towers.find(t => t.team === 'enemy' && t.lane === 'right').hp = CARDS.fireball.crownDamage;
  deploy(game, 'player', 'fireball', 360, 150);
  advance(game, 0.5);
  assert.equal(game.state.winner, 'player');
  assert.equal(game.state.reason, 'suddenDeath');
});

function compatibilityRun(deck, seed) {
  const game = new Game({ deck, enemyDeck: deck, seed, rulesVersion: 2 }).start();
  for (let tick = 0; tick < 2400 && game.state.running; tick++) {
    if (tick % 90 === 0) for (const team of ['player', 'enemy']) {
      const index = game.state.hands[team].findIndex(id => CARDS[id].cost <= game.state.elixir[team]);
      if (index >= 0) {
        const card = CARDS[game.state.hands[team][index]];
        const x = card.type === 'building' ? 240 : 120;
        const y = card.type === 'spell' ? team === 'player' ? 150 : 490 : team === 'player' ? 400 : 240;
        game.playCard(team, index, x, y);
      }
    }
    game.update(DT);
  }
  const snapshot = game.exportSnapshot();
  delete snapshot.config.rulesVersion; // This key did not exist in the captured v2 format.
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

test('rules 2 match two complete snapshot fingerprints captured before any v3 engine changes', () => {
  // Frozen baseline includes all entities, effects, RNG, IDs, commands and stats.
  // These fixtures were captured from the shipped engine before applying fixes.
  assert.equal(compatibilityRun(DEFAULT_DECK, 611), 'a3b0bb6989eb9ab502f68c99e8f280e6b2731881a241c3fc8ff4bae1643c846f');
  assert.equal(compatibilityRun(V2_DECK, 808), '8ec2e0e3c87cbce29c5c0445fef26d4925c905e566a28c1024c1ecf07ab9c945');
});

test('missing-rule saves resume under rules 2 and new detour saves resume exactly under rules 3', () => {
  for (const rulesVersion of [2, 3]) {
    const game = new Game({ seed: 61, rulesVersion }).start();
    quiet(game);
    deploy(game, 'player', 'cannon', 120, 350);
    deploy(game, 'player', 'giant', 120, 440);
    advance(game, 4);
    const saved = game.exportSnapshot();
    if (rulesVersion === 2) delete saved.config.rulesVersion;
    const restored = Game.fromSnapshot(saved);
    assert.equal(restored.rulesVersion, rulesVersion);
    assert.equal(restored.state.running, false);
    restored.resume();
    advance(game, 16);
    advance(restored, 16);
    assert.deepEqual(restored.exportSnapshot(), game.exportSnapshot());
  }
  assert.throws(() => new Game({ rulesVersion: 4 }));
  const malformed = new Game({ seed: 1 }).exportSnapshot();
  malformed.config.rulesVersion = 4;
  assert.throws(() => Game.fromSnapshot(malformed));
});

test('spell preview reports current per-hit damage without mutating state, and replay result data is detached', () => {
  const game = new Game({ seed: 62 }).start();
  const king = game.state.towers.find(t => t.team === 'enemy' && t.type === 'king');
  king.hp = 100;
  const [enemy] = deploy(game, 'enemy', 'minions', 240, 220);
  Object.assign(enemy, { x: 270, y: 65, deployRemaining: 5 });
  const [friendly] = deploy(game, 'player', 'knight', 240, 420);
  Object.assign(friendly, { x: 200, y: 65, deployRemaining: 5 });
  equip(game, 'player', 'poison');
  const poison = game.previewDeployment('player', 'poison', 240, 65);
  assert.equal(poison.affectedTargets.find(t => t.id === king.id).damage, CARDS.poison.crownDamage);
  assert.equal(poison.affectedTargets.find(t => t.id === enemy.id).damage, CARDS.poison.damage);
  assert.equal(poison.affectedTargets.some(t => t.id === friendly.id), false);
  const index = equip(game, 'player', 'fireball');
  const before = game.exportSnapshot();
  const preview = game.previewDeployment('player', 'fireball', 240, 65);
  assert.deepEqual(game.exportSnapshot(), before);
  assert.equal(preview.affectedTargets.find(t => t.id === king.id).damage, 100);
  const expectedDamage = preview.affectedTargets.reduce((sum, t) => sum + t.damage, 0);
  game.playCard('player', index, 240, 65);
  advance(game, 0.5);
  assert.equal(game.state.stats.player.damageDealt, expectedDamage);
  const record = game.exportReplay();
  assert.equal(record.version, 2);
  assert.equal(record.config.rulesVersion, 3);
  assert.equal(record.result.winner, game.state.winner);
  assert.equal(record.result.reason, game.state.reason);
  assert.deepEqual(record.result.crowns, game.state.crowns);
  assert.deepEqual(record.result.towerHp, game.state.towers.map(({ id, hp }) => ({ id, hp })));
  assert.deepEqual(record.result.damageDealt, { player: game.state.stats.player.damageDealt, enemy: game.state.stats.enemy.damageDealt });
  record.result.crowns.player = 0;
  assert.equal(game.state.crowns.player, 3);
});
