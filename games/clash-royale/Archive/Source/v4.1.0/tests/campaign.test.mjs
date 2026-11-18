import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEFAULT_DECK } from '../dist/js/engine.js';
import { OPPONENTS, DECK_PRESETS } from '../dist/js/decks.js';
import { CampaignProgress, CAMPAIGN_STAGES } from '../dist/js/campaign.js';
import { ReplayPlayer } from '../dist/js/session.js';
import { TrainingRun } from '../dist/js/training.js';

const DT = 1 / 60;
const copy = value => JSON.parse(JSON.stringify(value));
function attempt(progress, id = 'stage-1', deck = DEFAULT_DECK) {
  const { config, context } = progress.beginAttempt(id, deck);
  const game = new Game(config);
  assert.equal(progress.validateContext(game, context), true);
  assert.equal(progress.bindGame(game, context), true);
  game.start();
  return { game, context, config };
}

// Prepare time/HP boundaries, then let the real engine decide the result. The
// progression module never receives a fabricated winner object or plain state.
function kingWin(game, { seconds = 120, lostTower = false } = {}) {
  if (lostTower) {
    game.state.towers.find(t => t.id === 'player-left').hp = 0;
    game.state.towers.find(t => t.id === 'enemy-left').hp = 0;
    game.update(DT);
  }
  game.state.time = seconds - DT;
  game.state.tick = Math.round(seconds / DT) - 1;
  game.state.phase = seconds > 180 ? 'overtime' : 'regulation';
  game.state.towers.find(t => t.id === 'enemy-king').hp = 0;
  game.update(DT);
  assert.equal(game.state.phase, 'finished');
  assert.equal(game.state.winner, 'player');
}

function actualDraw(game) {
  while (game.state.running) game.update(DT);
  assert.equal(game.state.winner, 'draw');
}

test('six stages expose fixed opponents, difficulties, themes and unchanged selected decks', () => {
  assert.deepEqual(CAMPAIGN_STAGES.map(s => [s.opponentId, s.difficulty, s.arenaTheme]), [
    ['bran', 'easy', 'grove'], ['luna', 'easy', 'grove'], ['sera', 'normal', 'dusk'],
    ['bran', 'normal', 'dusk'], ['luna', 'hard', 'frost'], ['sera', 'hard', 'frost'],
  ]);
  assert.equal(new Set(CAMPAIGN_STAGES.map(s => s.seed)).size, 6);
  for (const s of CAMPAIGN_STAGES) {
    assert.ok(s.name && s.description && s.hint);
    assert.equal(typeof s.seed, 'number');
    assert.equal(s.enemyDeck.length, 8);
    assert.equal(new Set(s.enemyDeck).size, 8);
    assert.equal(Object.isFrozen(s.enemyDeck), true);
    const opponent = OPPONENTS.find(o => o.id === s.opponentId);
    assert.deepEqual(s.enemyDeck, opponent.deck, 'the rejected introductory candidate must not replace the original deck');
    assert.notEqual(s.enemyDeck, opponent.deck, 'stage decks must be independent immutable copies');
  }
  const progress = new CampaignProgress();
  const chosen = [...DECK_PRESETS[1].cards];
  const first = progress.beginAttempt('stage-1', chosen);
  assert.deepEqual(first.config.deck, chosen);
  assert.deepEqual(first.config.enemyDeck, CAMPAIGN_STAGES[0].enemyDeck);
  assert.notEqual(first.config.enemyDeck, CAMPAIGN_STAGES[0].enemyDeck);
  assert.equal(first.config.seed, CAMPAIGN_STAGES[0].seed);
  assert.equal(first.config.practice, false);
  assert.equal(first.config.rulesVersion, 4);
  assert.equal(first.context.rulesVersion, 4);
  chosen.reverse(); first.config.deck.reverse(); first.context.deck.reverse();
  const saved = progress.exportSnapshot();
  assert.deepEqual(saved.activeAttempt.deck, DECK_PRESETS[1].cards, 'returned and input arrays cannot mutate stored attempt identity');
});

test('only the first stage starts unlocked and invalid starts are atomic', () => {
  const progress = new CampaignProgress();
  assert.equal(progress.isUnlocked('stage-1'), true);
  for (const s of CAMPAIGN_STAGES.slice(1)) assert.equal(progress.isUnlocked(s.id), false);
  const before = progress.exportSnapshot();
  for (const [id, deck] of [['stage-2', DEFAULT_DECK], ['missing', DEFAULT_DECK], ['stage-1', ['giant']], ['stage-1', Array(8).fill('giant')]]) {
    assert.throws(() => progress.beginAttempt(id, deck));
    assert.deepEqual(progress.exportSnapshot(), before);
  }
});

test('a real win unlocks exactly the next stage and records its three independent medals', () => {
  const progress = new CampaignProgress();
  const { game, context } = attempt(progress);
  kingWin(game);
  const result = progress.applyResult(game, context);
  assert.equal(result.ok, true);
  assert.equal(result.won, true);
  assert.equal(result.medals, 3);
  assert.equal(result.unlockedStageId, 'stage-2');
  assert.deepEqual(result.progress, { stageId: 'stage-1', unlocked: true, completed: true,
    attempts: 1, wins: 1, bestMedals: 3, totalMedals: 3, bestCrowns: 3, bestTime: game.state.time });
  assert.equal(progress.isUnlocked('stage-3'), false);
});

test('medal boundaries use victory, actual tower losses and the inclusive 180-second limit', () => {
  for (const [seconds, lostTower, expected] of [[180, false, 3], [180 + DT, false, 2], [100, true, 2], [190, true, 1]]) {
    const progress = new CampaignProgress();
    const { game, context } = attempt(progress);
    kingWin(game, { seconds, lostTower });
    const result = progress.applyResult(game, context);
    assert.equal(result.ok, true);
    assert.equal(result.medals, expected, `${seconds}s / lost=${lostTower}`);
  }
});

test('defeat, concession and draw never unlock stages or award medals', () => {
  const progress = new CampaignProgress();
  const defeat = attempt(progress);
  defeat.game.state.towers.find(t => t.id === 'player-king').hp = 0;
  defeat.game.update(DT);
  assert.equal(progress.applyResult(defeat.game, defeat.context).medals, 0);
  const concession = attempt(progress);
  assert.equal(concession.game.concede('player').ok, true);
  assert.equal(progress.applyResult(concession.game, concession.context).won, false);
  const draw = attempt(progress);
  actualDraw(draw.game);
  assert.equal(progress.applyResult(draw.game, draw.context).medals, 0);
  assert.equal(progress.isUnlocked('stage-2'), false);
  const p = progress.getStageProgress('stage-1');
  assert.equal(p.attempts, 3); assert.equal(p.wins, 0);
  assert.equal(p.bestMedals, 0); assert.equal(p.totalMedals, 0); assert.equal(p.bestTime, null);
});

test('retries retain best results while cumulative medals count each accepted victory once', () => {
  const progress = new CampaignProgress();
  for (const [seconds, lostTower] of [[200, true], [150, false], [280, false]]) {
    const { game, context } = attempt(progress);
    kingWin(game, { seconds, lostTower });
    assert.equal(progress.applyResult(game, context).ok, true);
  }
  const p = progress.getStageProgress('stage-1');
  assert.equal(p.attempts, 3); assert.equal(p.wins, 3);
  assert.equal(p.bestMedals, 3); assert.equal(p.totalMedals, 6);
  assert.equal(p.bestCrowns, 3); assert.equal(p.bestTime, 150);
});

test('concession follows the actual winner even when crown counts suggest the opposite result', () => {
  const progress = new CampaignProgress();
  const losing = attempt(progress);
  for (const tower of losing.game.state.towers.filter(t => t.team === 'enemy' && t.type === 'princess')) tower.hp = 0;
  losing.game.update(DT);
  assert.equal(losing.game.state.crowns.player, 2);
  losing.game.concede('player');
  const loss = progress.applyResult(losing.game, losing.context);
  assert.equal(loss.won, false);
  assert.equal(loss.medals, 0);
  assert.equal(loss.progress.bestCrowns, 2);
  assert.equal(loss.progress.bestTime, null);
  const winning = attempt(progress);
  winning.game.update(DT);
  winning.game.concede('enemy');
  const win = progress.applyResult(winning.game, winning.context);
  assert.equal(win.won, true);
  assert.equal(win.medals, 3);
  assert.equal(win.progress.bestCrowns, 2, 'a zero-crown concession win must not overwrite the previous crown record');
  assert.equal(win.unlockedStageId, 'stage-2');
});

test('same battle cannot be counted twice, including after progress and game reload', () => {
  const progress = new CampaignProgress();
  const { game, context } = attempt(progress);
  kingWin(game);
  assert.equal(progress.applyResult(game, context).ok, true);
  const saved = progress.exportSnapshot();
  assert.equal(progress.applyResult(game, context).reason, 'already-applied');
  assert.deepEqual(progress.exportSnapshot(), saved);
  const restored = CampaignProgress.fromSnapshot(copy(saved));
  const restoredGame = Game.fromSnapshot(copy(game.exportSnapshot()));
  assert.equal(restored.applyResult(restoredGame, copy(context)).reason, 'already-applied');
  assert.deepEqual(restored.exportSnapshot(), saved);
});

test('an unfinished campaign restores its binding and completes exactly once', () => {
  const progress = new CampaignProgress();
  const { game, context } = attempt(progress);
  for (let i = 0; i < 120; i++) game.update(DT);
  const restored = new CampaignProgress(copy(progress.exportSnapshot()));
  const resumedGame = Game.fromSnapshot(copy(game.exportSnapshot()));
  assert.equal(restored.validateContext(resumedGame, context), true);
  assert.equal(restored.bindGame(resumedGame, context), true);
  resumedGame.resume();
  kingWin(resumedGame, { seconds: 80 });
  assert.equal(restored.applyResult(resumedGame, context).ok, true);
  assert.equal(restored.getStageProgress('stage-1').attempts, 1);
  assert.equal(restored.getStageProgress('stage-1').wins, 1);
});

test('new campaigns bind rules 4 while historical contexts without a version resume rules 3 and settle once', () => {
  const current = new CampaignProgress();
  const { config, context } = current.beginAttempt('stage-1', DEFAULT_DECK);
  assert.equal(config.rulesVersion, 4); assert.equal(context.rulesVersion, 4);
  const wrongRules = new Game({ ...config, rulesVersion: 3 }).start();
  const before = current.exportSnapshot();
  assert.equal(current.validateContext(wrongRules, context), false);
  assert.equal(current.bindGame(wrongRules, context), false);
  assert.equal(current.applyResult(wrongRules, context).ok, false);
  assert.deepEqual(current.exportSnapshot(), before);

  // Reconstruct the actual pre-rules-4 save shape: campaign context omitted
  // rulesVersion, but its ongoing engine snapshot explicitly retained rules 3.
  const oldProgress = copy(before), oldContext = copy(context);
  delete oldProgress.activeAttempt.rulesVersion; delete oldContext.rulesVersion;
  const legacyGame = new Game({ ...config, rulesVersion: 3 }).start();
  for (let i = 0; i < 120; i++) legacyGame.update(DT);
  legacyGame.pause();
  const resumedProgress = CampaignProgress.fromSnapshot(oldProgress);
  const resumedGame = Game.fromSnapshot(legacyGame.exportSnapshot());
  assert.equal(resumedGame.rulesVersion, 3);
  assert.equal(resumedProgress.validateContext(resumedGame, oldContext), true);
  assert.equal(resumedProgress.bindGame(resumedGame, oldContext), true);
  resumedGame.resume(); kingWin(resumedGame, { seconds: 80 });
  const result = resumedProgress.applyResult(resumedGame, oldContext);
  assert.equal(result.ok, true); assert.equal(result.won, true);
  assert.equal(result.unlockedStageId, 'stage-2');
  assert.equal(resumedProgress.getStageProgress('stage-1').wins, 1);
  assert.equal(resumedProgress.applyResult(resumedGame, oldContext).reason, 'already-applied');
  assert.equal(resumedProgress.getStageProgress('stage-1').wins, 1);
});

test('mismatched stage, battle ID, deck, config or real Game identity cannot award progression', () => {
  const progress = new CampaignProgress();
  const { game, context, config } = attempt(progress);
  const before = progress.exportSnapshot();
  for (const changed of [{ ...context, stageId: 'stage-2' }, { ...context, battleId: 'campaign-999' },
    { ...context, attempt: 2 }, { ...context, deck: [...context.deck].reverse() }]) {
    assert.equal(progress.validateContext(game, changed), false);
    assert.equal(progress.applyResult(game, changed).ok, false);
  }
  assert.equal(progress.validateContext({ initialConfig: config, state: game.state }, context), false);
  for (const patch of [{ seed: config.seed + 1 }, { difficulty: 'hard' }, { practice: true },
    { rulesVersion: 2 }, { enemyDeck: DECK_PRESETS[1].cards }, { deck: [...config.deck].reverse() }]) {
    assert.equal(progress.bindGame(new Game({ ...config, ...patch }), context), false);
  }
  assert.equal(progress.applyResult(game, context).reason, 'not-finished');
  const unbound = new Game(config); unbound.start(); kingWin(unbound);
  assert.equal(progress.bindGame(unbound, context), false, 'completed games cannot be newly bound');
  assert.equal(progress.applyResult(unbound, context).reason, 'unbound-game');
  assert.deepEqual(progress.exportSnapshot(), before);
});

test('training, practice and replay games cannot apply a campaign result', () => {
  const progress = new CampaignProgress();
  const { game, context, config } = attempt(progress);
  const before = progress.exportSnapshot();
  const training = new TrainingRun('defend');
  assert.equal(progress.bindGame(training.game, context), false);
  assert.equal(progress.applyResult(training.game, context).ok, false);
  assert.equal(progress.bindGame(new Game({ ...config, practice: true }), context), false);
  assert.equal(progress.bindGame(new Game(config), context, { replay: true }), false);
  assert.equal(progress.bindGame(new Game(config), context, { training: true }), false);
  actualDraw(game);
  assert.equal(progress.applyResult(game, context, { replay: true }).reason, 'excluded-mode');
  assert.equal(progress.applyResult(game, context, { training: true }).reason, 'excluded-mode');
  const replay = new ReplayPlayer(game.exportReplay());
  while (!replay.done) replay.step();
  assert.equal(progress.validateContext(replay.game, context), true, 'same config alone is insufficient to identify a live campaign');
  assert.equal(progress.applyResult(replay.game, context).reason, 'unbound-game');
  assert.deepEqual(progress.exportSnapshot(), before);
  assert.equal(progress.applyResult(game, context).ok, true, 'the originally bound live Game remains eligible');
});

test('starting another attempt retires the previous one and uses bounded save space', () => {
  const progress = new CampaignProgress();
  const old = attempt(progress);
  const next = progress.beginAttempt('stage-1', DEFAULT_DECK);
  assert.equal(progress.bindGame(old.game, next.context), false, 'a bound Game cannot be reassigned to another attempt');
  kingWin(old.game);
  assert.equal(progress.applyResult(old.game, old.context).ok, false);
  const current = new Game(next.config);
  assert.equal(progress.bindGame(current, next.context), true);
  current.start(); kingWin(current);
  assert.equal(progress.applyResult(current, next.context).ok, true);
  for (let i = 0; i < 100; i++) progress.beginAttempt('stage-1', DEFAULT_DECK);
  assert.equal(progress.getStageProgress('stage-1').attempts, 102);
  assert.equal(progress.getStageProgress('stage-1').wins, 1);
  assert.ok(JSON.stringify(progress.exportSnapshot()).length < 2500, 'retired IDs must not accumulate in storage');
  assert.equal(progress.exportSnapshot().activeAttempt.battleId, 'campaign-102');
});

test('all six sequential victories finish the campaign without inventing a seventh stage', () => {
  const progress = new CampaignProgress();
  for (const s of CAMPAIGN_STAGES) {
    const { game, context } = attempt(progress, s.id);
    kingWin(game, { seconds: 100 });
    const result = progress.applyResult(game, context);
    assert.equal(result.ok, true);
    assert.equal(result.unlockedStageId, s.number < 6 ? `stage-${s.number + 1}` : null);
  }
  assert.deepEqual(progress.getSummary(), { attempts: 6, wins: 6, totalMedals: 18, bestMedals: 18,
    completedStages: 6, unlockedStages: 6, totalStages: 6 });
});

test('missing fields initialize safely, damaged counters normalize and impossible later progress is discarded', () => {
  for (const missing of [undefined, null, {}, { version: 1 }]) {
    const p = new CampaignProgress(missing);
    assert.equal(p.getSummary().attempts, 0);
    assert.equal(p.getSummary().unlockedStages, 1);
  }
  const p = new CampaignProgress({ version: 1, sequence: -2, settledThrough: 'bad', stages: {
    'stage-1': { attempts: 2, wins: 1, bestMedals: 99, totalMedals: 99, bestCrowns: 99, bestTime: -1 },
    'stage-2': { attempts: -9, wins: Infinity, bestMedals: 3, totalMedals: 12, bestCrowns: NaN },
    'stage-3': { attempts: 5, wins: 5, bestMedals: 3, totalMedals: 15 },
  }, activeAttempt: { version: 1, mode: 'campaign', stageId: 'stage-3', battleId: 'campaign-8', attempt: 5, deck: DEFAULT_DECK } });
  assert.equal(p.getStageProgress('stage-1').bestMedals, 3);
  assert.equal(p.getStageProgress('stage-1').totalMedals, 3);
  assert.equal(p.getStageProgress('stage-1').bestTime, null);
  assert.equal(p.getStageProgress('stage-2').wins, 0);
  assert.equal(p.getStageProgress('stage-3').attempts, 0);
  assert.equal(p.isUnlocked('stage-3'), false);
  assert.equal(p.exportSnapshot().activeAttempt, null);
  assert.deepEqual(new CampaignProgress(copy(p.exportSnapshot())).exportSnapshot(), p.exportSnapshot());
});

test('structural corruption is rejected without evaluating imported accessors', () => {
  for (const bad of [[], 'save', { version: 99 }, new Map(), { stages: { bad: 1n } }]) {
    assert.throws(() => new CampaignProgress(bad), TypeError);
  }
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => new CampaignProgress(cyclic), TypeError);
  let accessed = false;
  const getter = Object.defineProperty({}, 'stages', { get() { accessed = true; return {}; } });
  assert.throws(() => new CampaignProgress(getter), TypeError);
  assert.equal(accessed, false);
});

test('corrupt finished engine state cannot partially update campaign totals', () => {
  const progress = new CampaignProgress();
  const { game, context } = attempt(progress);
  kingWin(game);
  const before = progress.exportSnapshot();
  game.state.stats.player.damageDealt = Infinity;
  assert.equal(progress.applyResult(game, context).reason, 'invalid-result');
  assert.deepEqual(progress.exportSnapshot(), before);
});
