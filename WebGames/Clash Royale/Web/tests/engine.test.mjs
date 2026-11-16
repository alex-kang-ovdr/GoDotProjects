import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS, DEFAULT_DECK } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';

const DT = 1 / 60;
const isAllowed = (r) => r === true || r?.ok === true;

function started(seed = 1001) {
  const game = new Game({ seed });
  game.start();
  return game;
}

function advance(game, seconds, controller) {
  for (let i = 0; i < Math.ceil(seconds / DT); i++) {
    controller?.(DT);
    game.update(DT);
  }
}

function equipHand(game, team, hand) {
  const all = [...new Set([...hand, ...DEFAULT_DECK, ...Object.keys(CARDS)])];
  game.state.hands[team] = [...hand];
  game.state.queues[team] = all.filter(id => !hand.includes(id)).slice(0, 4);
}

function coreSnapshot(game) {
  const s = game.state;
  return JSON.stringify({
    time: s.time, phase: s.phase, winner: s.winner,
    elixir: s.elixir, hands: s.hands, queues: s.queues,
    towers: s.towers, units: s.units, projectiles: s.projectiles,
    effects: s.effects, crowns: s.crowns,
  });
}

test('playing one card spends its exact cost and advances the four-card cycle once', () => {
  const game = started();
  equipHand(game, 'player', ['knight', 'archers', 'giant', 'fireball']);
  game.state.elixir.player = 10;
  const hand = [...game.state.hands.player];
  const queue = [...game.state.queues.player];
  const result = game.playCard('player', 0, 120, 550);
  assert.equal(result.ok, true);
  assert.equal(game.state.elixir.player, 10 - CARDS.knight.cost);
  assert.deepEqual(game.state.hands.player, [queue[0], ...hand.slice(1)]);
  assert.deepEqual(game.state.queues.player, [...queue.slice(1), 'knight']);
  assert.equal(game.state.hands.player.length, 4);
  assert.equal(game.state.queues.player.length, 4);
});

test('invalid territory and insufficient elixir leave all combat state unchanged', () => {
  const game = started();
  equipHand(game, 'player', ['knight', 'archers', 'giant', 'fireball']);
  game.state.elixir.player = 10;
  const initial = coreSnapshot(game);
  assert.equal(game.playCard('player', 0, 120, 100).ok, false);
  assert.equal(coreSnapshot(game), initial);
  game.state.elixir.player = 0;
  const poor = coreSnapshot(game);
  assert.equal(game.playCard('player', 0, 120, 550).ok, false);
  assert.equal(coreSnapshot(game), poor);
});

test('elixir regenerates by simulation time and never overfills the capacity', () => {
  const game = started();
  game.state.elixir.player = 2;
  game.state.elixir.enemy = 9.9;
  advance(game, 2.8);
  assert.ok(Math.abs(game.state.elixir.player - 3) < 0.025, `received ${game.state.elixir.player}`);
  assert.equal(game.state.elixir.enemy, 10);
});

test('ground troops cross the river only through one of the two bridge corridors', () => {
  const game = started(44);
  equipHand(game, 'player', ['knight', 'archers', 'giant', 'fireball']);
  game.state.elixir.player = 10;
  assert.equal(game.playCard('player', 0, 240, 420).ok, true);
  let observedCrossing = false;
  for (let i = 0; i < 18 / DT; i++) {
    game.update(DT);
    const unit = game.state.units.find(u => u.team === 'player' && u.cardId === 'knight');
    if (!unit) continue;
    if (unit.y > 300 && unit.y < 340) {
      observedCrossing = true;
      const bridgeDistance = Math.min(Math.abs(unit.x - 120), Math.abs(unit.x - 360));
      assert.ok(bridgeDistance <= 27 + 0.1, `ground unit entered river at (${unit.x},${unit.y})`);
    }
  }
  assert.equal(observedCrossing, true, 'the test troop should actually traverse the river');
});

test('rear-deployed ground troops route around their own tower and reach the far bank', () => {
  for (const team of ['player', 'enemy']) {
    const game = started(445);
    equipHand(game, team, ['giant', 'archers', 'knight', 'fireball']);
    game.state.elixir[team] = 10;
    assert.equal(game.playCard(team, 0, 120, team === 'player' ? 550 : 90).ok, true);
    let crossedBridge = false;
    let reachedFarBank = false;
    for (let i = 0; i < 15 / DT; i++) {
      game.update(DT);
      const giant = game.state.units.find(u => u.team === team && u.cardId === 'giant');
      if (!giant) continue;
      assert.ok(Number.isFinite(giant.x) && Number.isFinite(giant.y));
      if (giant.y > 300 && giant.y < 340) {
        crossedBridge = true;
        assert.ok(Math.min(Math.abs(giant.x - 120), Math.abs(giant.x - 360)) <= 27.1);
      }
      if (team === 'player' ? giant.y < 300 : giant.y > 340) reachedFarBank = true;
    }
    assert.equal(crossedBridge, true, `${team} giant should pass a bridge after avoiding its own tower`);
    assert.equal(reachedFarBank, true, `${team} giant must not remain trapped behind its own tower`);
  }
});

test('flying troops may cross the river outside the bridge corridors', () => {
  const game = started(44);
  equipHand(game, 'player', ['minions', 'archers', 'giant', 'fireball']);
  game.state.elixir.player = 10;
  assert.equal(game.playCard('player', 0, 240, 420).ok, true);
  let crossedAwayFromBridge = false;
  for (let i = 0; i < 12 / DT; i++) {
    game.update(DT);
    for (const unit of game.state.units.filter(u => u.team === 'player' && u.cardId === 'minions')) {
      if (unit.y > 300 && unit.y < 340 && Math.min(Math.abs(unit.x - 120), Math.abs(unit.x - 360)) > 35) {
        crossedAwayFromBridge = true;
      }
    }
  }
  assert.equal(crossedAwayFromBridge, true);
});

test('equal crowns at regulation end enter overtime; the next tower decides the battle', () => {
  const game = started();
  game.state.time = 180 - DT / 2;
  game.update(DT);
  assert.equal(game.state.phase, 'overtime');
  assert.equal(game.state.running, true);
  const tower = game.state.towers.find(t => t.team === 'enemy' && t.type === 'princess');
  tower.hp = 0;
  game.update(DT);
  assert.equal(game.state.winner, 'player');
  assert.equal(game.state.running, false);
});

test('destroying the king tower ends regulation immediately and awards three crowns', () => {
  const game = started();
  game.state.towers.find(t => t.team === 'enemy' && t.type === 'king').hp = 0;
  game.update(DT);
  assert.equal(game.state.winner, 'player');
  assert.equal(game.state.crowns.player, 3);
  const before = coreSnapshot(game);
  assert.equal(game.playCard('player', 0, 120, 550).ok, false);
  game.update(DT);
  assert.equal(coreSnapshot(game), before, 'finished combat must not continue mutating');
});

test('the final tiebreaker resolves unequal surviving tower HP', () => {
  const game = started();
  game.state.phase = 'overtime';
  game.state.time = 300 - DT / 2;
  game.state.towers.find(t => t.team === 'enemy' && t.type === 'princess').hp = 100;
  game.update(DT);
  assert.equal(game.state.winner, 'player');
  assert.equal(game.state.running, false);
});

function fakeAIWorld({ hand, elixir, units = [] }) {
  const plays = [];
  const hands = { enemy: hand };
  Object.defineProperty(hands, 'player', { get() { throw new Error('AI inspected hidden opponent hand'); } });
  const resources = { enemy: elixir };
  Object.defineProperty(resources, 'player', { get() { throw new Error('AI inspected hidden opponent elixir'); } });
  const state = {
    running: true, winner: null, phase: 'regulation', time: 10,
    hands, elixir: resources, units,
    towers: [
      { id: 'pt', team: 'player', type: 'princess', x: 120, y: 490, hp: 3000, maxHp: 3000, radius: 20 },
      { id: 'et', team: 'enemy', type: 'princess', x: 120, y: 150, hp: 3000, maxHp: 3000, radius: 20 },
    ],
  };
  return {
    state, plays, height: 640, seed: 77,
    canDeploy() { return { ok: true }; },
    playCard(team, index, x, y) {
      const id = state.hands.enemy[index];
      assert.equal(team, 'enemy');
      assert.ok(state.elixir.enemy >= CARDS[id].cost);
      state.elixir.enemy -= CARDS[id].cost;
      plays.push({ id, x, y });
      return { ok: true };
    },
  };
}

test('AI does not inspect hidden opponent resources or cast spells into an empty arena', () => {
  const game = fakeAIWorld({ hand: ['fireball', 'arrows', 'giant', 'cannon'], elixir: 4 });
  const ai = new BattleAI(game, { difficulty: 'hard', seed: 77 });
  for (let i = 0; i < 120; i++) {
    game.state.time += DT;
    ai.update(DT);
  }
  assert.deepEqual(game.plays, []);
  assert.equal(game.state.elixir.enemy, 4);
});

test('AI uses a damage spell on a valuable visible cluster through the normal play API', () => {
  const units = [
    { id: 1, team: 'player', cardId: 'archers', x: 118, y: 240, hp: 100, maxHp: 100, radius: 6 },
    { id: 2, team: 'player', cardId: 'archers', x: 128, y: 242, hp: 100, maxHp: 100, radius: 6 },
  ];
  const game = fakeAIWorld({ hand: ['fireball', 'giant', 'giant', 'giant'], elixir: CARDS.fireball.cost, units });
  const ai = new BattleAI(game, { difficulty: 'hard', seed: 77 });
  ai.update(1);
  assert.equal(game.plays.length, 1);
  assert.equal(game.plays[0].id, 'fireball');
  assert.equal(game.state.elixir.enemy, 0);
});

function runMatch(seed) {
  const game = started(seed);
  const ai = new BattleAI(game, { difficulty: 'normal', seed });
  let plays = 0;
  for (let tick = 0; tick < 310 / DT && game.state.running; tick++) {
    if (tick % 45 === 0) {
      const s = game.state;
      const order = s.hands.player.map((id, index) => ({ id, index, card: CARDS[id] }))
        .filter(entry => entry.card.type === 'troop' && entry.card.cost <= s.elixir.player)
        .sort((a, b) => (b.id === 'giant' ? 8 : b.card.cost) - (a.id === 'giant' ? 8 : a.card.cost));
      const pick = order[0];
      if (pick && s.elixir.player >= Math.max(5, pick.card.cost)) {
        const x = (Math.floor(tick / 360) % 2) ? 360 : 120;
        const y = pick.id === 'giant' ? 545 : 390;
        if (isAllowed(game.canDeploy('player', pick.id, x, y))) {
          if (game.playCard('player', pick.index, x, y).ok) plays++;
        }
      }
    }
    ai.update(DT);
    game.update(DT);
    assert.ok(game.state.elixir.player >= -1e-8 && game.state.elixir.player <= 10 + 1e-8);
    assert.ok(game.state.elixir.enemy >= -1e-8 && game.state.elixir.enemy <= 10 + 1e-8);
  }
  assert.ok(plays >= 8, `player deployed only ${plays} cards`);
  assert.ok(ai.decisionCount >= 8, `AI deployed only ${ai.decisionCount} cards`);
  assert.equal(game.state.running, false, 'a complete battle must terminate within its time limit');
  assert.ok(['player', 'enemy', 'draw'].includes(game.state.winner));
  assert.ok(game.state.towers.some(t => t.hp < t.maxHp), 'the simulated decks must engage towers');
  return {
    winner: game.state.winner, time: game.state.time, crowns: game.state.crowns,
    towerHp: game.state.towers.map(t => t.hp), plays, aiPlays: ai.decisionCount,
  };
}

test('a full seeded PvAI match is playable, bounded, and deterministic', () => {
  const first = runMatch(520);
  const second = runMatch(520);
  assert.deepEqual(second, first);
});
