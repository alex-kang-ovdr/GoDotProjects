import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, CARDS } from '../dist/js/engine.js';
import { ReplayPlayer, parseReplayFile, serializeReplayFile } from '../dist/js/session.js';
import { TrainingRun } from '../dist/js/training.js';

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));

function advance(game, ticks) {
  for (let tick = 0; tick < ticks; tick++) game.update(DT);
}

function playAvailable(game, team = 'player', type = 'troop') {
  const index = game.state.hands[team].findIndex(id => CARDS[id].type === type && CARDS[id].cost <= game.state.elixir[team]);
  assert.ok(index >= 0, `scenario must contain an affordable ${type}`);
  const x = type === 'building' ? 240 : 120;
  const y = type === 'spell' ? team === 'player' ? 150 : 490 : team === 'player' ? 420 : 220;
  assert.equal(game.playCard(team, index, x, y).ok, true);
}

function replayToEnd(record) {
  const player = new ReplayPlayer(record);
  for (let tick = 0; tick <= record.finalTick && !player.done; tick++) player.step();
  assert.equal(player.done, true);
  return player;
}

// Scenario setup preserves the eight-card cycle; ordinary play still charges costs.
function equip(game, team, cardId) {
  const hand = game.state.hands[team], queue = game.state.queues[team];
  if (!hand.includes(cardId)) {
    const queued = queue.indexOf(cardId);
    assert.ok(queued >= 0);
    [hand[0], queue[queued]] = [queue[queued], hand[0]];
  }
  return hand.indexOf(cardId);
}

function stepTrainingUntil(run, predicate, maxTicks = 2000) {
  for (let tick = 0; tick < maxTicks && !run.done && !predicate(run); tick++) run.step(DT);
  assert.ok(predicate(run) || run.done, 'training scenario must make bounded progress');
}

test('concession works before the first tick, during play and while paused without changing combat totals', () => {
  for (const team of ['player', 'enemy']) for (const mode of ['ready', 'running', 'paused']) {
    const game = new Game({ seed: 710 });
    if (mode !== 'ready') { game.start(); advance(game, 17); }
    if (mode === 'paused') game.pause();
    const before = game.exportSnapshot();
    const result = game.concede(team);
    assert.deepEqual(result, { ok: true, winner: team === 'player' ? 'enemy' : 'player', reason: 'concede' });
    assert.equal(game.state.phase, 'finished');
    assert.equal(game.state.running, false);
    assert.equal(game.state.reason, 'concede');
    assert.equal(game.state.time, before.state.time);
    assert.equal(game.state.tick, before.state.tick);
    assert.deepEqual(game.state.elixir, before.state.elixir);
    assert.deepEqual(game.state.stats, before.state.stats);
    assert.deepEqual(game.state.crowns, before.state.crowns);
    assert.deepEqual(game.commands, before.commands);
    assert.deepEqual(game.endAction, { type: 'concede', team, tick: before.state.tick });
    const final = game.exportSnapshot();
    assert.equal(game.concede(team).ok, false);
    assert.equal(game.concede(team === 'player' ? 'enemy' : 'player').ok, false);
    game.resume(); game.update(DT);
    assert.deepEqual(game.exportSnapshot(), final, 'a finished concession is irreversible and idempotent');
  }
  const game = new Game({ seed: 711 }).start(), before = game.exportSnapshot();
  for (const team of [undefined, null, '', 'draw', '__proto__']) assert.equal(game.concede(team).ok, false);
  assert.deepEqual(game.exportSnapshot(), before, 'invalid teams produce no log or state mutation');
});

test('zero-tick concessions replay exactly with no inputs and with both teams deploying at that same tick', () => {
  for (const withCards of [false, true]) {
    const game = new Game({ seed: 712 }).start();
    if (withCards) { playAvailable(game, 'player'); playAvailable(game, 'enemy'); }
    game.concede('player');
    const record = game.exportReplay();
    assert.equal(record.finalTick, 0);
    assert.ok(record.commands.every(c => c.tick === 0));
    const replay = new ReplayPlayer(record);
    assert.equal(replay.done, true);
    assert.equal(replay.cursor, game.commands.length);
    assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
    replay.seek(0);
    assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
  }
});

test('a same-tick spell followed by concession retains its cost and cast effects but never deals future damage', () => {
  let game;
  for (let seed = 1; seed <= 20; seed++) {
    const candidate = new Game({ seed }).start();
    if (candidate.state.hands.player.some(id => CARDS[id].type === 'spell')) { game = candidate; break; }
  }
  assert.ok(game);
  playAvailable(game, 'player', 'spell');
  assert.equal(game.exportSnapshot().pendingSpells.length, 1);
  game.pause(); game.concede('player');
  assert.equal(game.exportSnapshot().pendingSpells.length, 0);
  assert.equal(game.state.stats.player.damageDealt, 0);
  assert.ok(game.state.stats.player.elixirSpent > 0);
  const replay = replayToEnd(game.exportReplay());
  assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
});

test('a resumed save can concede after a final-boundary deployment and reproduce the whole original replay', () => {
  const game = new Game({ seed: 713 }).start();
  playAvailable(game, 'player'); playAvailable(game, 'enemy');
  advance(game, 360);
  game.pause();
  const resumed = Game.fromSnapshot(game.exportSnapshot());
  game.resume(); resumed.resume();
  advance(game, 240); advance(resumed, 240);
  playAvailable(game, 'player'); playAvailable(resumed, 'player');
  game.pause(); resumed.pause();
  game.concede('enemy'); resumed.concede('enemy');
  assert.deepEqual(resumed.exportSnapshot(), game.exportSnapshot());
  assert.equal(game.commands.at(-1).tick, game.state.tick);
  const replay = replayToEnd(resumed.exportReplay());
  assert.deepEqual(replay.game.exportSnapshot(), resumed.exportSnapshot());
  replay.seek(3);
  assert.equal(replay.game.state.phase, 'regulation');
  replay.seek(replay.duration);
  assert.deepEqual(replay.game.exportSnapshot(), resumed.exportSnapshot());
  const ended = Game.fromSnapshot(resumed.exportSnapshot());
  ended.resume(); advance(ended, 2);
  assert.deepEqual(ended.exportSnapshot(), resumed.exportSnapshot());
});

test('unfinished records retain final-tick commands without simulating an extra frame under both rulesets', () => {
  for (const rulesVersion of [2, 3]) for (const ticks of [0, 37]) {
    const game = new Game({ seed: 714, rulesVersion }).start();
    advance(game, ticks);
    playAvailable(game, 'player'); playAvailable(game, 'enemy');
    const record = game.exportReplay();
    assert.equal(record.winner, null);
    assert.equal(record.commands.at(-1).tick, record.finalTick);
    assert.equal(Object.hasOwn(record, 'endAction'), false);
    if (rulesVersion === 2) delete record.config.rulesVersion;
    const replay = replayToEnd(record);
    assert.deepEqual(replay.game.exportSnapshot(), game.exportSnapshot());
    assert.equal(replay.game.state.tick, ticks);
    const portable = parseReplayFile(serializeReplayFile({ replay: record, opponentId: 'luna' }));
    assert.deepEqual(replayToEnd(portable.replay).game.exportSnapshot(), game.exportSnapshot());
  }
});

test('malformed concession records and inconsistent saved outcomes fail explicitly', () => {
  const game = new Game({ seed: 715 }).start();
  advance(game, 2); game.concede('player');
  const record = game.exportReplay();
  const corruptions = [
    r => { r.endAction.team = 'draw'; },
    r => { r.endAction.tick--; },
    r => { r.endAction.type = 'finish'; },
    r => { r.winner = 'player'; },
    r => { r.result.reason = 'king'; },
    r => { delete r.endAction; },
  ];
  for (const corrupt of corruptions) { const bad = clone(record); corrupt(bad); assert.throws(() => new ReplayPlayer(bad)); }
  for (const corrupt of [
    s => { s.endAction.tick++; },
    s => { s.endAction.team = 'enemy'; },
    s => { s.state.reason = 'king'; },
    s => { delete s.endAction; },
  ]) { const bad = game.exportSnapshot(); corrupt(bad); assert.throws(() => Game.fromSnapshot(bad)); }
});

test('deployment duration is stable optional display metadata and older snapshots remain readable', () => {
  const game = new Game({ seed: 716 }).start();
  const index = equip(game, 'player', 'archers');
  assert.equal(game.playCard('player', index, 240, 420).ok, true);
  assert.deepEqual(game.state.units.map(u => u.deployDuration), [CARDS.archers.deployTime, CARDS.archers.deployTime + .06]);
  advance(game, 12);
  assert.ok(game.state.units.every(u => u.deployRemaining < u.deployDuration));
  const old = game.exportSnapshot();
  for (const unit of old.state.units) delete unit.deployDuration;
  assert.doesNotThrow(() => Game.fromSnapshot(old));
  const malformed = game.exportSnapshot();
  malformed.state.units[0].deployDuration = -1;
  assert.throws(() => Game.fromSnapshot(malformed));
});

test('training cannot credit an arrow cast when a preceding fireball kills the targets before it resolves', () => {
  const run = new TrainingRun('spell');
  stepTrainingUntil(run, r => r.game.state.time >= 2.25);
  run.game.state.elixir.player = 10;
  assert.equal(run.game.playCard('player', equip(run.game, 'player', 'fireball'), 120, 285).ok, true);
  for (let tick = 0; tick < 12; tick++) run.step(DT);
  assert.equal(run.game.playCard('player', equip(run.game, 'player', 'arrows'), 120, 295).ok, true);
  stepTrainingUntil(run, r => r.done);
  assert.equal(run.success, false);
  assert.equal(run.flags.volley, false);
  assert.ok(run.game.exportSnapshot().pendingSpells.some(s => s.cardId === 'arrows' && s.remaining > 0),
    'the former false positive occurs while arrows have not yet resolved');
  assert.ok(run.game.getSpellResolutions().some(r => r.cardId === 'fireball' && r.hits.filter(h => h.killed).length === 3));
});

test('a successful training volley is attributed to one actual arrow resolution and diagnostics are detached', () => {
  const run = new TrainingRun('spell');
  stepTrainingUntil(run, r => r.game.state.time >= 2.3);
  const commandIndex = run.game.commands.length;
  assert.equal(run.game.playCard('player', equip(run.game, 'player', 'arrows'), 120, 295).ok, true);
  stepTrainingUntil(run, r => r.done);
  assert.equal(run.success, true);
  const resolutions = run.game.getSpellResolutions();
  const volley = resolutions.find(r => r.commandIndex === commandIndex);
  assert.equal(volley.cardId, 'arrows');
  assert.equal(volley.hits.length, 3);
  assert.ok(volley.hits.every(hit => hit.damage === CARDS.minions.hp && hit.killed && hit.team === 'enemy'));
  volley.hits[0].damage = 0;
  assert.ok(run.game.getSpellResolutions()[0].hits[0].damage > 0);
  run.game.resume(); run.game.update(DT);
  assert.deepEqual(run.game.getSpellResolutions(), [], 'diagnostics describe the latest actual update, not old casts');
});

test('old training saves without spell input indices finish the same pending volley under rules 2 and 3', () => {
  for (const rulesVersion of [2, 3]) {
    const original = new TrainingRun('spell');
    original.game = new Game({ ...original.game.initialConfig, rulesVersion }).start();
    stepTrainingUntil(original, r => r.game.state.time >= 2.3);
    original.game.playCard('player', equip(original.game, 'player', 'arrows'), 120, 295);
    original.step(DT);
    assert.ok(original.volley);
    const savedGame = original.game.exportSnapshot(), savedTraining = original.exportSnapshot();
    for (const spell of savedGame.pendingSpells) delete spell.commandIndex;
    for (const unit of savedGame.state.units) delete unit.deployDuration;
    delete savedTraining.volley.commandIndex;
    if (rulesVersion === 2) delete savedGame.config.rulesVersion;
    const restoredGame = Game.fromSnapshot(savedGame);
    const restored = TrainingRun.fromSnapshot(restoredGame, savedTraining);
    restoredGame.resume();
    stepTrainingUntil(original, r => r.done); stepTrainingUntil(restored, r => r.done);
    assert.equal(restored.success, true);
    assert.deepEqual(restored.exportSnapshot(), original.exportSnapshot());
    assert.deepEqual(restored.game.exportSnapshot(), original.game.exportSnapshot());
  }
});

test('an unavailable scripted wave retries for a bounded time and ends training without throwing or spending', () => {
  const run = new TrainingRun('spell');
  run.game.state.hands.enemy = ['hog_rider', 'goblins', 'knight', 'archers'];
  run.game.state.queues.enemy = ['minions', 'cannon', 'arrows', 'fireball'];
  assert.doesNotThrow(() => stepTrainingUntil(run, r => r.done, 400));
  assert.equal(run.done, true);
  assert.equal(run.success, false);
  assert.equal(run.game.state.running, false);
  assert.ok(run.game.state.time <= 5.1);
  assert.equal(run.game.state.stats.enemy.cardsPlayed, 0);
  assert.equal(run.game.state.stats.enemy.elixirSpent, 0);
  assert.match(run.reason, /배치하지 못했습니다/);
});

test('temporary wave-resource shortages survive a save and spawn exactly once after recovery', () => {
  const original = new TrainingRun('spell');
  original.game.state.elixir.enemy = 2;
  stepTrainingUntil(original, r => r.game.state.time >= 2.4);
  assert.ok(original.waveRetry);
  assert.equal(original.waveCursor, 0);
  const restoredGame = Game.fromSnapshot(original.game.exportSnapshot());
  const restored = TrainingRun.fromSnapshot(restoredGame, original.exportSnapshot());
  restoredGame.resume();
  for (const run of [original, restored]) {
    stepTrainingUntil(run, r => r.waveCursor === 1);
    assert.equal(run.enemyIds.length, 3);
    assert.equal(run.game.state.stats.enemy.cardsPlayed, 1);
    assert.equal(run.game.state.stats.enemy.elixirSpent, CARDS.minions.cost);
    assert.equal(run.waveRetry, null);
    run.game.playCard('player', equip(run.game, 'player', 'arrows'), 120, 285);
    stepTrainingUntil(run, r => r.done);
    assert.equal(run.success, true);
  }
  assert.deepEqual(restored.exportSnapshot(), original.exportSnapshot());
  assert.deepEqual(restoredGame.exportSnapshot(), original.game.exportSnapshot());
});

test('a spatially crowded scripted spawn uses a nearby legal point instead of interrupting the frame', () => {
  const run = new TrainingRun('spell'), game = run.game;
  game.playCard('enemy', equip(game, 'enemy', 'minions'), 240, 220);
  const template = game.state.units[0];
  const blockers = [];
  for (const x of [66, 85, 104, 123, 142, 161, 180]) for (const y of [244, 263, 282]) {
    blockers.push({ ...clone(template), id: `u${++game._counter}`, x, y, speed: 0, deployRemaining: 0, active: true });
  }
  game.state.units = blockers;
  game.state.elixir.enemy = 10;
  equip(game, 'enemy', 'minions');
  const countBefore = game.state.stats.enemy.cardsPlayed;
  assert.equal(game.canDeploy('enemy', 'minions', 120, 275).ok, false);
  assert.equal(game.canDeploy('enemy', 'minions', 120, 251).ok, true);
  assert.doesNotThrow(() => stepTrainingUntil(run, r => r.waveCursor === 1));
  assert.equal(run.waveCursor, 1);
  assert.equal(game.state.stats.enemy.cardsPlayed, countBefore + 1);
  assert.equal(run.enemyIds.length, 3);
  assert.equal(game.commands.at(-1).y, 251);
});

test('portable replays preserve all supported arena themes and campaign stages through a real file round trip', () => {
  const game = new Game({ seed: 717 }).start();
  playAvailable(game, 'player');
  advance(game, 3); game.concede('player');
  for (let stage = 1; stage <= 6; stage++) {
    const arenaTheme = ['grove', 'dusk', 'frost'][(stage - 1) % 3];
    const original = { replay: game.exportReplay(), opponentId: 'sera', arenaTheme, stageId: `stage-${stage}` };
    const encoded = serializeReplayFile(original);
    const decoded = parseReplayFile(encoded);
    assert.deepEqual(decoded, original);
    assert.deepEqual(replayToEnd(decoded.replay).game.exportSnapshot(), game.exportSnapshot());
  }
});

test('legacy replay files remain readable while invalid display metadata is omitted independently', () => {
  const game = new Game({ seed: 718, rulesVersion: 2 }).start();
  advance(game, 1);
  const replay = game.exportReplay();
  delete replay.config.rulesVersion;
  delete replay.result;
  const legacyFile = { format: 'crownfall-replay', version: 1, replay };
  const legacy = parseReplayFile(JSON.stringify(legacyFile));
  assert.deepEqual(legacy, { replay, opponentId: 'bran' });
  assert.deepEqual(parseReplayFile(serializeReplayFile(legacy)), legacy);
  assert.deepEqual(replayToEnd(legacy.replay).game.exportSnapshot(), game.exportSnapshot());
  for (const [metadata, expected] of [
    [{ arenaTheme: 'custom', stageId: 'stage-7' }, {}],
    [{ arenaTheme: '__proto__', stageId: 'stage-0' }, {}],
    [{ arenaTheme: { name: 'grove' }, stageId: 3 }, {}],
    [{ arenaTheme: 'grove', stageId: 'stage-99' }, { arenaTheme: 'grove' }],
    [{ arenaTheme: '<script>', stageId: 'stage-2' }, { stageId: 'stage-2' }],
  ]) {
    const imported = parseReplayFile(JSON.stringify({ ...legacyFile, ...metadata, arbitraryLabel: 'discard' }));
    assert.deepEqual(imported, { replay, opponentId: 'bran', ...expected });
    const exported = parseReplayFile(serializeReplayFile({ replay, opponentId: 'bran', ...metadata, arbitraryLabel: 'discard' }));
    assert.deepEqual(exported, { replay, opponentId: 'bran', ...expected });
  }
});
