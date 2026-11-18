import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/engine.js';
import { TrainingRun, TRAINING_MISSIONS } from '../dist/js/training.js';

const STEP = 1 / 60;
function play(game, card, x, y) { return game.playCard('player', game.state.hands.player.indexOf(card), x, y).ok; }
function goodInputs(run) {
  const g = run.game, own = g.commands.filter(c => c.team === 'player');
  const used = id => own.some(c => c.cardId === id);
  if (run.mission.id === 'defend' && !used('cannon')) play(g, 'cannon', 210, 395);
  if (run.mission.id === 'spell' && g.state.time > 2.3 && !used('arrows')) play(g, 'arrows', 120, 295);
  if (run.mission.id === 'push') {
    if (!used('giant')) play(g, 'giant', 120, 425);
    const giant = g.state.units.find(u => u.team === 'player' && u.cardId === 'giant');
    if (giant && !used('archers')) play(g, 'archers', giant.x, Math.max(365, giant.y + 90));
  }
}
function finish(run, controller = goodInputs) {
  for (let tick = 0; tick < 5000 && !run.done; tick++) { controller(run); run.step(STEP); }
  assert.equal(run.done, true); return run;
}

test('all three exercises can be completed using ordinary paid deployments and actual combat', () => {
  for (const m of TRAINING_MISSIONS) {
    const run = finish(new TrainingRun(m.id));
    assert.equal(run.success, true, `${m.id}: ${run.reason}`);
    assert.ok(run.progress.every(p => p.complete));
    assert.equal(run.game.state.running, false);
    assert.ok(run.game.commands.some(c => c.team === 'enemy'));
    assert.ok(run.game.state.elixir.player >= 0 && run.game.state.elixir.player <= 10);
    assert.equal(run.game.state.stats.enemy.cardsPlayed, m.waves.length);
    const expectedCost = m.id === 'defend' ? 3 : m.id === 'spell' ? 3 : 8;
    assert.equal(run.game.state.stats.player.elixirSpent, expectedCost);
    const target = run.game.state.towers.find(t => t.id === 'enemy-left');
    if (m.id === 'push') assert.ok(target.maxHp - target.hp >= 925);
  }
});

test('inaction or an off-target spell does not award a training completion', () => {
  for (const id of ['defend', 'spell', 'push']) {
    const run = finish(new TrainingRun(id), () => {});
    assert.equal(run.success, false, id);
  }
  const missed = finish(new TrainingRun('spell'), run => {
    if (run.game.state.time > 2.3 && !run.game.commands.some(c => c.team === 'player')) play(run.game, 'arrows', 360, 150);
  });
  assert.equal(missed.flags.volley, false);
  assert.equal(missed.success, false);
});

test('support must be deployed behind a live giant, not credited for merely using both cards', () => {
  const run = new TrainingRun('push');
  assert.equal(play(run.game, 'archers', 120, 425), true);
  while (run.game.state.time < 8.5) run.step(STEP);
  assert.equal(play(run.game, 'giant', 120, 425), true);
  finish(run, () => {});
  assert.equal(run.flags.supported, false);
  assert.equal(run.success, false);
});

test('restoring mid-exercise preserves enemy scheduling, objectives and final combat state', () => {
  for (const id of ['defend', 'spell', 'push']) {
    const original = new TrainingRun(id);
    const stop = id === 'spell' ? 2.4 : 5;
    while (original.game.state.time < stop) { goodInputs(original); original.step(STEP); }
    const restoredGame = Game.fromSnapshot(original.game.exportSnapshot());
    const restored = TrainingRun.fromSnapshot(restoredGame, original.exportSnapshot());
    restoredGame.resume();
    finish(original); finish(restored);
    assert.deepEqual(restored.exportSnapshot(), original.exportSnapshot(), id);
    assert.deepEqual(restored.game.exportSnapshot(), original.game.exportSnapshot(), id);
  }
});

test('training saves reject unrelated games, invalid waves and corrupted objective data', () => {
  const run = new TrainingRun('defend');
  const snapshot = run.exportSnapshot();
  for (const patch of [{ version: 99 }, { id: 'missing' }, { waveCursor: 99 }, { commandCursor: 1 }, { flags: { pulled: 'yes' } }, { done: true }, { enemyIds: ['__proto__'] }]) {
    assert.throws(() => TrainingRun.fromSnapshot(run.game, { ...snapshot, ...patch }));
  }
  assert.throws(() => TrainingRun.fromSnapshot(new Game({ seed: 11 }), snapshot));
});

test('paused and finished exercises cannot advance or repeat scripted deployments', () => {
  const run = new TrainingRun('spell'); run.game.pause();
  const before = run.game.exportSnapshot(); run.step(STEP);
  assert.deepEqual(run.game.exportSnapshot(), before);
  run.game.resume(); finish(run);
  const result = run.game.exportSnapshot();
  for (let i = 0; i < 60; i++) run.step(STEP);
  assert.deepEqual(run.game.exportSnapshot(), result);
});
