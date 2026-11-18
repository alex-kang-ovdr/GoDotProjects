import test from 'node:test';
import assert from 'node:assert/strict';
import { ColonyGame } from '../dist/engine.js';
import { issue, setWork, assertResourceNumbers, description } from './helpers.mjs';

// This acceptance scenario uses the UI's new-game seed/difficulty/map.
// It never writes state, stocks, pawn statistics, enemy positions, or the clock.
// The policy below is a reproducible player: it designates work, builds affordable
// structures, chooses research, and drafts/undrafts defenders through public APIs.
test('the unmodified default colony can research, refrigerate, survive the final wave, and win', t => {
  const game = new ColonyGame({ seed: 314159, difficulty: 'standard' });
  const [builder, farmer, researcher] = game.state.colonists;
  setWork(game, builder, { rescue: 1, firefight: 1, doctor: 2, build: 1, haul: 1, mine: 2, harvest: 3 });
  setWork(game, farmer, { rescue: 1, firefight: 1, doctor: 3, grow: 1, cook: 1, haul: 2, harvest: 3 });
  setWork(game, researcher, { rescue: 1, firefight: 1, doctor: 1, research: 1, haul: 2, harvest: 3 });
  issue(game, 'autoCook', { value: true, target: 14 });

  const ore = game.state.tiles.filter(t => t.feature === 'ore' && t.x > 12)
    .sort((a, b) => Math.hypot(a.x - 25, a.y - 16) - Math.hypot(b.x - 25, b.y - 16)).slice(0, 6);
  assert.ok(ore.length >= 5, 'default map needs a physically extractable steel supply');
  for (const tile of ore) issue(game, 'designate', { x: tile.x, y: tile.y, kind: 'mine' });
  const trees = game.state.tiles.filter(t => t.feature === 'tree' && t.x > 12)
    .sort((a, b) => Math.hypot(a.x - 24, a.y - 16) - Math.hypot(b.x - 24, b.y - 16)).slice(0, 4);
  for (const tile of trees) issue(game, 'designate', { x: tile.x, y: tile.y, kind: 'chop' });

  const plans = [
    ['wall', 27, 16], ['wall', 23, 19], ['bed', 25, 13],
    ['solar', 29, 16], ['solar', 28, 15], ['conduit', 28, 16],
    ['battery', 29, 17], ['cooler', 26, 16], ['beacon', 25, 16],
  ];
  const checkpoints = new Set();
  let observedFinalRaid = false;
  let observedChargePause = false;
  let observedColdStorage = false;
  let previousRaidNumber = 0;
  let lastOrderAt = -10;

  function checkRoundTrip(label) {
    const original = game.toJSON();
    const restored = ColonyGame.fromJSON(JSON.parse(JSON.stringify(original)));
    assert.deepEqual(restored.toJSON(), original, `${label}: immediate v2 restoration must be exact`);
    for (const dt of [0.03, 0.17, 0.4, 0.11, 0.39]) {
      game.update(dt);
      restored.update(dt);
    }
    assert.deepEqual(restored.toJSON(), game.toJSON(), `${label}: restored future must match the uninterrupted colony`);
    checkpoints.add(label);
  }

  for (let tick = 0; tick < 2600 && !game.state.victory && !game.state.gameOver; tick++) {
    const s = game.state;
    if (tick % 4 === 0) {
      for (const [kind, x, y] of plans) {
        if (!game.tile(x, y).building) {
          const result = game.command('build', { kind, x, y });
          assert.equal(typeof result.ok, 'boolean');
        }
      }
      if (!s.research.active) {
        const next = ['electricity', 'refrigeration', 'communications'].find(id => !s.research.unlocked.includes(id));
        if (next) issue(game, 'research', { id: next });
      }
    }

    const enemies = s.raiders.filter(r => !r.dead);
    if (enemies.length) {
      for (const pawn of s.colonists.filter(p => !p.dead && p.health >= 15)) {
        if (!pawn.drafted) issue(game, 'draft', { id: pawn.id, value: true });
      }
      if (s.time - lastOrderAt >= 2 || s.raidNumber !== previousRaidNumber) {
        const target = enemies.slice().sort((a, b) => a.health - b.health)[0];
        for (const pawn of s.colonists.filter(p => p.drafted && !p.dead && p.health >= 15)) {
          issue(game, 'attack', { id: pawn.id, targetId: target.id });
        }
        lastOrderAt = s.time;
      }
      if (s.extractionAlarmTriggered && s.beaconProgress >= 0.5) observedFinalRaid = true;
    } else {
      for (const pawn of s.colonists.filter(p => p.drafted && !p.dead)) issue(game, 'draft', { id: pawn.id, value: false });
    }
    previousRaidNumber = s.raidNumber;
    if (game.getSummary().coldStorage) observedColdStorage = true;

    if (!checkpoints.has('mid-research') && s.research.progress.electricity > 8
      && !s.research.unlocked.includes('electricity')) checkRoundTrip('mid-research');
    if (!checkpoints.has('mid-haul') && s.colonists.some(p => p.job?.type === 'haul' && p.carry)) checkRoundTrip('mid-haul');
    if (!checkpoints.has('mid-charge') && s.beaconProgress > 0 && s.beaconProgress < 0.5) checkRoundTrip('mid-charge');

    const chargeBefore = s.beaconProgress;
    const threatenedBefore = s.activeRaid && enemies.length > 0;
    game.update(0.5);
    if (threatenedBefore && s.activeRaid && chargeBefore >= 0.5) {
      assert.equal(s.beaconProgress, chargeBefore, 'a live final wave must pause the extraction charge');
      observedChargePause = true;
    }
    if (tick % 10 === 0) assertResourceNumbers(game);
  }
  assert.equal(game.state.gameOver, false, description(game));
  assert.equal(game.state.victory, true, `default-map progression should reach extraction within 1305 simulation seconds: ${description(game)}`);
  assert.equal(game.state.beaconProgress, 1);
  assert.equal(game.state.extractionAlarmTriggered, true);
  assert.equal(observedFinalRaid, true);
  assert.equal(observedChargePause, true);
  assert.equal(observedColdStorage, true, 'the default enclosure must become a useful refrigerated store');
  assert.ok(game.state.stats.survivedRaids >= 2);
  assert.ok(game.state.hazards.incidentCount >= 1, 'natural fire incidents must remain active in the default scenario');
  assert.ok(game.state.hazards.extinguished >= 1, 'the default colony must actually complete firefighting work');
  assert.equal(game.state.tiles.some(tile => tile.fire > 0), false, 'extraction cannot finish while a fire remains active');
  assert.ok(game.state.stats.harvested > 0 && game.state.stats.mealsCooked > 0);
  assert.ok(game.state.research.unlocked.includes('refrigeration'));
  assert.ok(game.state.research.unlocked.includes('communications'));
  assert.ok(game.getSummary().indoorBeds >= 3);
  assert.deepEqual([...checkpoints].sort(), ['mid-charge', 'mid-haul', 'mid-research']);
  assertResourceNumbers(game);
  const timeAtVictory = game.state.time;
  t.diagnostic(JSON.stringify({ seed: 314159, difficulty: 'standard', victoryAt: timeAtVictory,
    alive: game.getSummary().alive, indoorBeds: game.getSummary().indoorBeds,
    survivedRaids: game.state.stats.survivedRaids, harvested: game.state.stats.harvested,
    mealsCooked: game.state.stats.mealsCooked, spoiled: game.state.systemStats.spoiled,
    fireIncidents: game.state.hazards.incidentCount, extinguished: game.state.hazards.extinguished,
    coldStorageObserved: observedColdStorage, checkpoints: [...checkpoints] }));
  game.update(2);
  assert.ok(game.state.time > timeAtVictory, 'extraction victory must retain continued colony play');
});
