import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';
import { DECK_PRESETS, OPPONENTS } from '../dist/js/decks.js';
import { ReplayPlayer } from '../dist/js/session.js';

const DT = 1 / 60;
const other = team => team === 'player' ? 'enemy' : 'player';
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// The second controller receives the same legal API, with the world rotated.
// Lazy arena getters avoid rebuilding entity arrays on every simulation tick.
// Both controllers only receive their own hand and resources in these views.
function viewFor(game, team) {
  const mirrored = team === 'player';
  const transform = u => mirrored ? { ...u, y: 640 - u.y, team: other(u.team) } : u;
  const hands = {}, elixir = {};
  Object.defineProperty(hands, 'enemy', { get: () => game.state.hands[team] });
  Object.defineProperty(hands, 'player', { get() { throw new Error('opponent hand must remain hidden'); } });
  Object.defineProperty(elixir, 'enemy', { get: () => game.state.elixir[team] });
  Object.defineProperty(elixir, 'player', { get() { throw new Error('opponent elixir must remain hidden'); } });
  const state = {
    get time() { return game.state.time; },
    get running() { return game.state.running; },
    get phase() { return game.state.phase; },
    get winner() { return game.state.winner; },
    get units() { return game.state.units.map(transform); },
    get towers() { return game.state.towers.map(transform); },
    get crowns() { return { enemy: game.state.crowns[team], player: game.state.crowns[other(team)] }; },
    hands, elixir,
  };
  return {
    state, height: 640, seed: game.seed,
    get rulesVersion() { return game.rulesVersion; },
    get dataProfile() { return game.dataProfile; },
    getCard: (id, requestedTeam = 'enemy') => game.getCard(id,
      requestedTeam === 'enemy' ? team : requestedTeam === 'player' ? other(team) : requestedTeam),
    getAbilities: () => game.getAbilities(team).map(ability => ({ ...ability, y: mirrored ? 640 - ability.y : ability.y })),
    activateAbility: (_, groupId) => game.activateAbility(team, groupId),
    getTimeRemaining: () => game.getTimeRemaining(),
    canDeploy: (_, id, x, y) => game.canDeploy(team, id, x, mirrored ? 640 - y : y),
    playCard: (_, index, x, y) => game.playCard(team, index, x, mirrored ? 640 - y : y),
  };
}

function checkEntities(game) {
  for (const u of [...game.state.units, ...game.state.towers, ...game.state.projectiles]) {
    assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y), `${u.id}: non-finite position`);
    if ('hp' in u) assert.ok(Number.isFinite(u.hp) && u.hp >= 0 && u.hp <= u.maxHp + 1e-6, `${u.id}: invalid health`);
  }
}

function completeMatch(opponent, difficulty, seed, playerDeck) {
  const game = new Game({ deck: playerDeck, enemyDeck: opponent.deck, seed });
  const controllers = {
    enemy: new BattleAI(viewFor(game, 'enemy'), { difficulty, style: opponent.style, seed: seed + 127 }),
    player: new BattleAI(viewFor(game, 'player'), { difficulty: 'normal', style: 'balanced', seed: seed + 811 }),
  };
  const plays = { enemy: 0, player: 0 };
  const originalPlay = game.playCard.bind(game);
  game.playCard = (team, index, x, y) => {
    const id = game.state.hands[team][index], before = game.state.elixir[team];
    const card = game.getCard(id, team);
    assert.ok(card);
    assert.ok(before + 1e-8 >= card.cost);
    const result = originalPlay(team, index, x, y);
    assert.equal(result.ok, true, `${team}: AI submitted an invalid placement`);
    assert.ok(Math.abs(game.state.elixir[team] - (before - card.cost)) < 1e-7);
    plays[team]++;
    return result;
  };
  let maxFullElixirIdle = 0, maxOutOfRangeStill = 0;
  const idle = { player: 0, enemy: 0 }, observed = new Map();
  game.start();
  for (let tick = 0; tick < 18010 && game.state.running; tick++) {
    const before = { ...plays };
    controllers.player.update(DT);
    controllers.enemy.update(DT);
    const previousTick = game.state.tick;
    game.update(DT);
    assert.equal(game.state.tick, previousTick + 1, 'the fixed simulation must keep advancing');
    assert.ok(Number.isFinite(game.state.time));
    for (const team of ['player', 'enemy']) {
      const resource = game.state.elixir[team];
      assert.ok(Number.isFinite(resource) && resource >= 0 && resource <= 10);
      idle[team] = resource >= 9.99 && before[team] === plays[team] ? idle[team] + DT : 0;
      maxFullElixirIdle = Math.max(maxFullElixirIdle, idle[team]);
    }
    if (tick % 60 === 0) {
      checkEntities(game);
      const entities = new Map([...game.state.units, ...game.state.towers].map(u => [u.id, u]));
      for (const u of game.state.units) {
        const prior = observed.get(u.id), target = entities.get(u.targetId);
        const reach = u.range + u.radius + (target?.radius || 0);
        const blocked = prior && !u.isBuilding && u.deployRemaining <= 0 && u.stunRemaining <= 0 &&
          target?.hp > 0 && distance(u, target) > reach + 4 &&
          distance(u, prior) < 0.25 && Math.abs(u.hp - prior.hp) < 1e-6;
        const still = blocked ? prior.still + 1 : 0;
        observed.set(u.id, { x: u.x, y: u.y, hp: u.hp, still });
        maxOutOfRangeStill = Math.max(maxOutOfRangeStill, still);
      }
      for (const id of observed.keys()) if (!entities.has(id)) observed.delete(id);
    }
  }
  checkEntities(game);
  assert.equal(game.state.phase, 'finished');
  assert.ok(['player', 'enemy', 'draw'].includes(game.state.winner));
  assert.ok(plays.enemy >= 5 && plays.player >= 5, 'both decks must actively participate');
  assert.ok(game.state.towers.some(t => t.hp < t.maxHp), 'the armies must reach and damage towers');
  assert.ok(maxFullElixirIdle < 25, `controller stalled at full elixir for ${maxFullElixirIdle.toFixed(2)} seconds`);
  assert.ok(maxOutOfRangeStill < 12, `a mobile unit remained out of range without moving for ${maxOutOfRangeStill} seconds`);
  return { game, metrics: {
    opponent: opponent.id, difficulty, seed, winner: game.state.winner,
    seconds: +game.state.time.toFixed(2), enemyCards: plays.enemy, playerCards: plays.player,
    maxFullElixirIdle: +maxFullElixirIdle.toFixed(2), maxOutOfRangeStill,
  } };
}

test('three opponents finish legal, finite, active matches across three difficulties and two seeds', t => {
  const rows = [];
  let replaySample;
  for (let i = 0; i < OPPONENTS.length; i++) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      for (const seed of [421, 951]) {
        const result = completeMatch(OPPONENTS[i], difficulty, seed, DECK_PRESETS[(i + 1) % DECK_PRESETS.length].cards);
        rows.push(result.metrics);
        if (i === 1 && difficulty === 'hard' && seed === 951) replaySample = result.game;
      }
    }
  }
  // A representative complete stress match must also remain exactly replayable.
  const replay = new ReplayPlayer(replaySample.exportReplay());
  while (!replay.done) replay.step();
  assert.deepEqual(replay.game.exportSnapshot(), replaySample.exportSnapshot());
  t.diagnostic(JSON.stringify(rows));
});
