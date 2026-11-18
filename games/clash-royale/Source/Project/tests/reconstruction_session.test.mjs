import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, DEFAULT_DECK } from '../dist/js/engine.js';
import { DATA_PROFILES, DEFAULT_DATA_PROFILE } from '../dist/js/reconstruction.js';
import { ReplayPlayer, serializeReplayFile, parseReplayFile, FIXED_STEP } from '../dist/js/session.js';
import { CampaignProgress } from '../dist/js/campaign.js';
import { TrainingRun } from '../dist/js/training.js';
import { DECK_PRESETS } from '../dist/js/decks.js';

const deck = DECK_PRESETS.find(value => value.id === 'reconstruction').cards;

// Every action goes through the normal hand, resources, placement and ability API.
// The replay sees only recorded accepted inputs, never this deterministic driver.
function recordMatch(dataProfile) {
  const game = new Game({ seed: 4501, dataProfile, deck, enemyDeck: deck }).start();
  const played = { player: {}, enemy: {} };
  while (game.state.running && game.state.tick < 7200) {
    const tick = game.state.tick;
    if (tick % 60 === 0) for (const team of ['player', 'enemy']) {
      const ready = game.getAbilities(team).find(ability => ability.ready);
      if (ready) assert.equal(game.activateAbility(team, ready.groupId).ok, true);
      const choices = game.state.hands[team].map((id, handIndex) => ({ id, handIndex, card: game.getCard(id, team) }))
        .sort((a, b) => (played[team][a.id] || 0) - (played[team][b.id] || 0) || deck.indexOf(a.id) - deck.indexOf(b.id));
      for (const { id, handIndex, card } of choices) {
        if (game.state.elixir[team] < card.cost) break; // Save for the planned card instead of starving 5-cost troops.
        const x = tick % 240 < 120 ? 120 : 360;
        const y = card.type === 'spell' ? team === 'player' ? 190 : 450 : team === 'player' ? 425 : 215;
        if (!game.canDeploy(team, id, x, y).ok) continue;
        const result = game.playCard(team, handIndex, x, y);
        assert.equal(result.ok, true, result.reason);
        played[team][id] = (played[team][id] || 0) + 1;
        break;
      }
    }
    game.update(FIXED_STEP);
  }
  if (game.state.running) assert.equal(game.concede('player').ok, true);
  for (const team of ['player', 'enemy']) for (const id of ['minion_giant', 'vines']) assert.ok(played[team][id] > 0, `${team}/${id} was actually played`);
  assert.ok(game.commands.some(command => command.type === 'ability'), 'rules-5 ability input is included');
  return game;
}

for (const dataProfile of Object.keys(DATA_PROFILES)) test(`rules-5 ${dataProfile} new-card battle survives portable replay and seeking`, () => {
  const original = recordMatch(dataProfile);
  const portable = parseReplayFile(serializeReplayFile({ replay: original.exportReplay(), opponentId: 'bran' }));
  const player = new ReplayPlayer(portable.replay);
  assert.equal(player.game.dataProfile, dataProfile);
  while (!player.done) player.step();
  assert.deepEqual(player.game.exportSnapshot(), original.exportSnapshot());
  player.seek(12);
  while (!player.done) player.step();
  assert.deepEqual(player.game.exportSnapshot(), original.exportSnapshot());
  const missing = structuredClone(portable.replay); delete missing.config.dataProfile;
  assert.throws(() => new ReplayPlayer(missing), /프로필/);
  const unknown = structuredClone(portable.replay); unknown.config.dataProfile = 'unpublished-current-data';
  assert.throws(() => new ReplayPlayer(unknown));
});

test('campaign profile is part of the saved attempt identity and cannot be switched to award a result', () => {
  const campaign = new CampaignProgress();
  const first = campaign.beginAttempt('stage-1', deck, { dataProfile: 'prototype-v4' });
  const game = new Game(first.config).start();
  assert.equal(campaign.bindGame(game, first.context), true);
  const saved = campaign.exportSnapshot();
  const restored = new CampaignProgress(saved);
  const resumed = Game.fromSnapshot(game.exportSnapshot());
  assert.equal(restored.bindGame(resumed, first.context), true);
  assert.equal(resumed.dataProfile, 'prototype-v4');
  const changed = { ...first.context, dataProfile: DEFAULT_DATA_PROFILE };
  assert.equal(restored.validateContext(resumed, changed), false);
  assert.equal(restored.bindGame(new Game({ ...first.config, dataProfile: DEFAULT_DATA_PROFILE }), first.context), false);
  assert.equal(restored.applyResult(resumed, changed).ok, false);
  assert.deepEqual(restored.exportSnapshot(), saved);
  assert.throws(() => restored.beginAttempt('stage-1', DEFAULT_DECK, { dataProfile: 'bad-profile' }));
  assert.deepEqual(restored.exportSnapshot(), saved, 'an invalid next profile does not retire the active attempt');
  for (const rulesVersion of [3, 4]) {
    const legacy = structuredClone(saved), context = structuredClone(first.context);
    legacy.activeAttempt.rulesVersion = rulesVersion; context.rulesVersion = rulesVersion;
    delete legacy.activeAttempt.dataProfile; delete context.dataProfile;
    legacy.activeAttempt.deck = [...DEFAULT_DECK]; context.deck = [...DEFAULT_DECK];
    const old = new CampaignProgress(legacy);
    const oldGame = new Game({ ...first.config, deck: DEFAULT_DECK, rulesVersion, dataProfile: 'prototype-v4' });
    assert.equal(old.bindGame(oldGame, context), true);
  }
});

test('training uses the requested profile and restoring a run retains the recorded profile', () => {
  for (const dataProfile of Object.keys(DATA_PROFILES)) {
    const run = new TrainingRun('defend', { dataProfile });
    for (let tick = 0; tick < 60; tick++) run.step(FIXED_STEP);
    const game = Game.fromSnapshot(run.game.exportSnapshot());
    const restored = TrainingRun.fromSnapshot(game, run.exportSnapshot());
    assert.equal(restored.game.dataProfile, dataProfile);
    assert.deepEqual(restored.exportSnapshot(), run.exportSnapshot());
  }
});
