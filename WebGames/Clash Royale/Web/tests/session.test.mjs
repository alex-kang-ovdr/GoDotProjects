import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';
import { DECK_PRESETS, OPPONENTS } from '../dist/js/decks.js';
import { ReplayPlayer, FIXED_STEP as STEP, summarizeBattle } from '../dist/js/session.js';

function simulate() {
  const game = new Game({ deck: [...DECK_PRESETS[1].cards], enemyDeck: [...OPPONENTS[2].deck], seed: 982614 });
  const ai = new BattleAI(game, { difficulty: 'hard', style: 'control', seed: 188 });
  game.start();
  while (game.state.running && game.state.tick < 18010) {
    if (game.state.tick % 100 === 0) {
      const hand = game.state.hands.player;
      for (let i = 0; i < hand.length; i++) {
        const c = CARDS[hand[i]];
        const point = c.type === 'spell' ? { x: 120, y: 150 } : { x: c.type === 'building' ? 205 : 120, y: 410 };
        if (game.playCard('player', i, point.x, point.y).ok) break;
      }
    }
    ai.update(STEP); game.update(STEP);
  }
  return game;
}

test('a full replay reproduces accepted commands, towers, entities, damage, timer and result without running AI', () => {
  const game = simulate();
  assert.equal(game.state.phase, 'finished');
  const playback = new ReplayPlayer(game.exportReplay());
  while (!playback.done) playback.step();
  assert.deepEqual(playback.game.exportSnapshot(), game.exportSnapshot());
  assert.ok(game.state.stats.player.cardsPlayed > 10);
  assert.ok(game.state.stats.enemy.cardsPlayed > 10);
});

test('replay seeking backward and forward reconstructs the same mid-battle state', () => {
  const record = simulate().exportReplay();
  const straight = new ReplayPlayer(record);
  straight.seek(40);
  const expected = straight.game.exportSnapshot();
  const jumped = new ReplayPlayer(record);
  jumped.seek(65); jumped.seek(12); jumped.seek(40);
  assert.deepEqual(jumped.game.exportSnapshot(), expected);
  jumped.seek(1e9);
  assert.equal(jumped.done, true);
  jumped.seek(0);
  assert.equal(jumped.game.state.tick, 0);
  assert.equal(jumped.done, false);
});

test('malformed replay commands and inconsistent card order fail explicitly', () => {
  const record = simulate().exportReplay();
  for (const changes of [{ version: 99 }, { step: undefined }, { step: .1 }, { finalTick: 1e9 }, { config: null }, { commands: [{ ...record.commands[0], x: Infinity }] }, { commands: [{ ...record.commands[0], tick: -1 }] }]) {
    assert.throws(() => new ReplayPlayer({ ...record, ...changes }));
  }
  const tampered = JSON.parse(JSON.stringify(record));
  tampered.commands[0].cardId = Object.keys(CARDS).find(id => id !== tampered.commands[0].cardId);
  const replay = new ReplayPlayer(tampered);
  assert.throws(() => { while (!replay.done) replay.step(); }, /카드 순서/);
});

test('battle report is derived from actual input counts and has no side effects', () => {
  const game = simulate();
  const before = game.exportSnapshot();
  const report = summarizeBattle(game);
  assert.equal(report.cards, game.state.stats.player.cardsPlayed);
  assert.equal(report.left + report.right + report.spells, report.cards);
  assert.ok(report.mostPlayed.count > 0);
  assert.equal(typeof report.tip, 'string');
  assert.deepEqual(game.exportSnapshot(), before);
});
