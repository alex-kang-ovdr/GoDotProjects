import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';

const DT = 1 / 60;
function arena(seed = 74) {
  const game = new Game({ seed,
    deck: ['hog_rider', 'duelist', 'minions', 'goblins', 'giant', 'knight', 'archers', 'zap'],
    enemyDeck: ['cannon', 'musketeer', 'giant', 'knight', 'fireball', 'hog_rider', 'zap', 'poison'],
  });
  game.start();
  game.state.time = 5;
  game.state.tick = 300;
  return game;
}

// Tactical fixtures prepare visible battlefield positions without waiting for
// their travel. AI actions themselves still use the real deployment transaction.
function troop(game, team, cardId, x, y) {
  game.state.hands[team] = [cardId, 'knight', 'archers', 'zap'];
  game.state.queues[team] = ['giant', 'fireball', 'goblins', 'cannon'];
  game.state.elixir[team] = 10;
  const previous = new Set(game.state.units.map(u => u.id));
  assert.equal(game.playCard(team, 0, x, team === 'player' ? 390 : 245).ok, true);
  const units = game.state.units.filter(u => !previous.has(u.id));
  for (const u of units) {
    u.x = x; u.y = y; u.deployRemaining = 0; u.active = true;
  }
  return units;
}
function readyAI(game, hand, elixir, options = {}) {
  game.state.hands.enemy = hand;
  game.state.queues.enemy = game.enemyDeck.filter(id => !hand.includes(id)).slice(0, 4);
  game.state.elixir.enemy = elixir;
  const ai = new BattleAI(game, { difficulty: 'hard', style: 'balanced', seed: 44, ...options });
  ai.wait = 0;
  ai.lastTime = game.state.time;
  for (const u of game.state.units.filter(u => u.team === 'player')) ai.seenThreats.set(u.id, 0);
  return ai;
}
function advance(game, seconds) {
  for (let i = 0; i < seconds / DT; i++) game.update(DT);
}

test('a central defensive building pulls simultaneous left and right building attackers', () => {
  const game = arena();
  const left = troop(game, 'player', 'hog_rider', 120, 295)[0];
  const right = troop(game, 'player', 'hog_rider', 360, 295)[0];
  const ai = readyAI(game, ['cannon', 'giant', 'fireball', 'poison'], 3);
  ai.update(DT);
  const cannon = game.state.units.find(u => u.team === 'enemy' && u.cardId === 'cannon');
  assert.ok(cannon, 'the affordable building must be deployed');
  advance(game, 0.2);
  assert.equal(left.targetId, cannon.id, 'left attacker must leave its tower route');
  assert.equal(right.targetId, cannon.id, 'right attacker must also be drawn to the central building');
});

test('anti-air defenders can deploy around their own princess tower instead of abandoning defense', () => {
  const game = arena();
  troop(game, 'player', 'minions', 100, 240);
  const ai = readyAI(game, ['musketeer', 'giant', 'knight', 'cannon'], 4);
  ai.update(DT);
  assert.equal(ai.lastDecision?.cardId, 'musketeer');
  assert.equal(ai.lastDecision.intent, 'defend');
  const defender = game.state.units.find(u => u.cardId === 'musketeer' && u.team === 'enemy');
  assert.ok(defender);
  for (const t of game.state.towers) {
    assert.ok(Math.hypot(defender.x - t.x, defender.y - t.y) >= defender.radius + t.radius + 3);
  }
});

test('building-only attackers do not count as troops capable of defending a ground skirmish', () => {
  const game = arena();
  const goblins = troop(game, 'player', 'goblins', 120, 260);
  goblins.slice(1).forEach(u => { u.hp = 0; });
  troop(game, 'enemy', 'giant', 120, 220);
  const ai = readyAI(game, ['knight', 'giant', 'cannon', 'fireball'], 3);
  ai.update(DT);
  assert.equal(ai.lastDecision?.intent, 'defend');
  assert.ok(['knight', 'cannon'].includes(ai.lastDecision.cardId));
});

function threatenedKing() {
  const game = arena();
  const attacker = troop(game, 'player', 'duelist', 240, 115)[0];
  attacker.hp = 450;
  attacker.attackCooldown = 0.65;
  attacker.targetId = 'enemy-king';
  attacker.engagedTargetId = 'enemy-king';
  const king = game.state.towers.find(t => t.id === 'enemy-king');
  king.hp = 60; king.active = true;
  game.state.towers.find(t => t.id === 'player-left').hp = 100;
  return { game, attacker, king };
}

test('saving a king from a lethal attack outranks a non-winning princess finisher', () => {
  const { game, attacker, king } = threatenedKing();
  const ai = readyAI(game, ['fireball', 'giant', 'cannon', 'musketeer'], 4);
  ai.update(DT);
  assert.equal(ai.lastDecision?.cardId, 'fireball');
  assert.ok(Math.hypot(ai.lastDecision.x - attacker.x, ai.lastDecision.y - attacker.y) <= CARDS.fireball.spellRadius);
  advance(game, 1);
  assert.ok(king.hp > 0, 'the king should survive the attack that the defensive spell could prevent');
  assert.equal(game.state.winner, null);
});

test('a guaranteed enemy king finisher still takes the immediate win during a defensive emergency', () => {
  const { game } = threatenedKing();
  game.state.towers.find(t => t.id === 'player-king').hp = 100;
  const ai = readyAI(game, ['fireball', 'giant', 'cannon', 'musketeer'], 4);
  ai.update(DT);
  assert.equal(ai.lastDecision?.intent, 'finish-tower');
  assert.equal(ai.lastDecision.y, 575);
  advance(game, 1);
  assert.equal(game.state.winner, 'enemy');
});

test('fresh pressure chooses the open lane instead of adding to an already saturated push', () => {
  const game = arena();
  for (const y of [220, 240, 250, 260]) troop(game, 'enemy', 'musketeer', 120, y);
  game.state.towers.find(t => t.id === 'player-left').hp = 1200;
  const ai = readyAI(game, ['hog_rider', 'fireball', 'zap', 'poison'], 8, { style: 'cycle' });
  ai.update(DT);
  assert.equal(ai.lastDecision?.cardId, 'hog_rider');
  assert.ok(ai.lastDecision.x > 300, 'sixteen elixir already present in the left lane should shift a new wave right');
});

test('difficulty changes observed defensive reaction time, without changing costs or card stats', t => {
  const samples = [];
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const game = arena();
    troop(game, 'player', 'giant', 120, 280);
    game.state.hands.enemy = ['cannon', 'giant', 'fireball', 'poison'];
    game.state.elixir.enemy = 3;
    const ai = new BattleAI(game, { difficulty, seed: 44 });
    const start = game.state.time;
    let spent = null;
    const play = game.playCard.bind(game);
    game.playCard = (team, index, x, y) => {
      const before = game.state.elixir[team];
      const cardId = game.state.hands[team][index];
      const result = play(team, index, x, y);
      if (team === 'enemy' && result.ok) spent = { cardId, cost: before - game.state.elixir.enemy };
      return result;
    };
    for (let tick = 0; tick < 5 / DT && !ai.lastDecision; tick++) {
      ai.update(DT); game.update(DT);
    }
    assert.equal(spent?.cardId, 'cannon');
    assert.equal(spent.cost, CARDS.cannon.cost);
    const cannon = game.state.units.find(u => u.team === 'enemy' && u.cardId === 'cannon');
    assert.equal(cannon.maxHp, CARDS.cannon.hp);
    assert.equal(cannon.damage, CARDS.cannon.damage);
    samples.push({ difficulty, delay: ai.lastDecision.time - start });
  }
  assert.ok(samples[2].delay < samples[1].delay && samples[1].delay < samples[0].delay,
    JSON.stringify(samples));
  t.diagnostic(JSON.stringify(samples.map(s => ({ difficulty: s.difficulty, responseSeconds: +s.delay.toFixed(3) }))));
});
