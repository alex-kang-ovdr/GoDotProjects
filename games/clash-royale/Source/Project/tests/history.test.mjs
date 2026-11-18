import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/engine.js';
import { BattleHistory, HISTORY_LIMIT } from '../dist/js/history.js';
import { ReplayPlayer } from '../dist/js/session.js';

function completed(seed = 1) {
  const g = new Game({ seed }); g.start();
  while (g.state.running) g.update(1 / 60);
  return g;
}

test('completed history stays bounded and rejects duplicate awards across reloads and eviction', () => {
  const history = new BattleHistory(), game = completed();
  for (let i = 0; i < 12; i++) assert.equal(history.add(game, { id: `match-${i}`, opponentId: 'luna', savedAt: i }), true);
  assert.equal(history.list().length, HISTORY_LIMIT);
  assert.equal(history.list()[0].id, 'match-11');
  assert.equal(history.get('match-0'), null);
  const restored = new BattleHistory(history.exportSnapshot());
  assert.equal(restored.add(game, { id: 'match-0' }), false);
  assert.equal(restored.add(game, { id: 'match-11' }), false);
  assert.deepEqual(restored.exportSnapshot(), history.exportSnapshot());
});

test('unfinished and practice games cannot be stored as normal completed battles', () => {
  const history = new BattleHistory();
  assert.equal(history.add(new Game(), { id: 'ready' }), false);
  const practice = new Game({ practice: true }).start();
  while (practice.state.running) practice.update(1 / 60);
  assert.equal(history.add(practice, { id: 'practice' }), false);
  assert.equal(history.list().length, 0);
});

test('saved records replay to the exact original result without changing history', () => {
  const game = completed(72), history = new BattleHistory();
  const before = game.exportSnapshot();
  history.add(game, { id: 'record-72', opponentId: 'sera', stageId: 'stage-6', arenaTheme: 'frost', savedAt: 123 });
  const snapshot = history.exportSnapshot(), entry = history.get('record-72');
  const replay = new ReplayPlayer(entry.replay);
  while (!replay.done) replay.step();
  assert.deepEqual(replay.game.exportSnapshot(), before);
  entry.arenaTheme = 'bad'; entry.replay.config.seed = 999;
  assert.deepEqual(history.exportSnapshot(), snapshot);
  assert.deepEqual(game.exportSnapshot(), before);
});

test('corrupt history rows are isolated and unsafe metadata is normalized', () => {
  const good = { id: 'valid', replay: completed().exportReplay(), opponentId: '<x>', arenaTheme: 'bad', stageId: '__proto__', savedAt: Infinity };
  const history = new BattleHistory({ version: 1, entries: [null, { id: 'bad', replay: {} }, good, good], seenIds: ['__bad id', 3] });
  assert.equal(history.list().length, 1);
  assert.equal(history.get('valid').opponentId, 'bran');
  assert.equal(history.get('valid').arenaTheme, 'grove');
  assert.equal(history.get('valid').stageId, null);
  assert.equal(history.get('valid').savedAt, 0);
  assert.equal(new BattleHistory({ version: 999 }).list().length, 0);
});
