import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/engine.js';
import { ReplayPlayer, FIXED_STEP as STEP, summarizeBattle, serializeReplayFile, parseReplayFile } from '../dist/js/session.js';

function idleMatch(rulesVersion = 3) {
  const game = new Game({ seed: 314, rulesVersion }); game.start();
  while (game.state.running) game.update(STEP);
  return game;
}
function replayToEnd(record) { const player = new ReplayPlayer(record); while (!player.done) player.step(); return player; }

test('legacy records with no rulesVersion replay with their original simulation rules', () => {
  const original = idleMatch(2), record = original.exportReplay();
  delete record.config.rulesVersion; delete record.result;
  const playback = replayToEnd(record);
  assert.equal(playback.game.rulesVersion, 2);
  assert.deepEqual(playback.game.state, original.state);
});

test('early endings, incorrect winners and altered final combat results fail explicitly', () => {
  const record = idleMatch().exportReplay();
  const wrongTick = structuredClone(record); wrongTick.finalTick += 1;
  assert.throws(() => replayToEnd(wrongTick), /종료 시각/);
  const wrongWinner = structuredClone(record); wrongWinner.winner = 'player'; wrongWinner.result.winner = 'player';
  assert.throws(() => replayToEnd(wrongWinner), /승패/);
  const wrongTower = structuredClone(record); wrongTower.result.towerHp[0].hp -= 1;
  assert.throws(() => replayToEnd(wrongTower), /타워 체력/);
  const wrongDamage = structuredClone(record); wrongDamage.result.damageDealt.player = 1;
  assert.throws(() => replayToEnd(wrongDamage), /피해 결과/);
});

test('portable replay JSON round-trips and is independent of UI, AI and network state', () => {
  const game = idleMatch(), record = { replay: game.exportReplay(), opponentId: 'sera', report: { privateUIField: true } };
  const text = serializeReplayFile(record), imported = parseReplayFile(text);
  assert.equal(imported.opponentId, 'sera');
  assert.equal(text.includes('privateUIField'), false);
  assert.deepEqual(replayToEnd(imported.replay).game.exportSnapshot(), game.exportSnapshot());
  for (const data of ['<html>', '{}', 'x'.repeat(1000001), JSON.stringify({ format: 'crownfall-replay', version: 1, replay: { ...record.replay, winner: 'admin' } })]) {
    assert.throws(() => parseReplayFile(data));
  }
});

test('result metadata bounds and inherited card property names are rejected', () => {
  const game = new Game({ seed: 1 }); game.start(); game.update(STEP);
  const record = game.exportReplay();
  assert.throws(() => new ReplayPlayer({ ...record, commands: [{ tick: 0, team: 'player', handIndex: 0, cardId: 'constructor', x: 120, y: 420 }] }));
  const bad = structuredClone(record); bad.result.towerHp[0].hp = Infinity;
  assert.throws(() => new ReplayPlayer(bad));
  const duplicate = structuredClone(record); duplicate.result.towerHp[0].id = duplicate.result.towerHp[1].id;
  assert.throws(() => new ReplayPlayer(duplicate));
});

test('battle analysis accounts for natural elixir overflow and real card expenditure', () => {
  const idle = idleMatch(), report = summarizeBattle(idle);
  assert.equal(report.elixirSpent, 0); assert.equal(report.averageCost, 0);
  assert.equal(report.elixirLeak, Math.round((540 / 2.8 - 5) * 10) / 10);
  const g = new Game({ seed: 7 }); g.start();
  const slot = g.state.hands.player.findIndex(id => ['knight', 'archers', 'goblins'].includes(id));
  assert.equal(g.playCard('player', slot, 120, 420).ok, true);
  g.update(2);
  const r = summarizeBattle(g);
  assert.equal(r.byCard.reduce((n, c) => n + c.spent, 0), g.state.stats.player.elixirSpent);
  assert.equal(r.elixirLeak, 0);
  const practice = new Game({ practice: true });
  assert.equal(summarizeBattle(practice).elixirLeak, null);
});
