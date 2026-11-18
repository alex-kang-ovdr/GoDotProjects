import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../dist/js/engine.js';
import { applyCheat, inspectTarget } from '../dist/js/debug.js';

test('live Vines target count accepts whole numbers only and rejects an invalid patch atomically', () => {
  const game = new Game({ seed: 45, practice: true, developerMode: true }).start();
  assert.equal(game.setCardBalance('vines', { maxTargets: 8, groundingDuration: 4, stunDuration: 0 }, { team: 'enemy' }).ok, true);
  assert.equal(game.getCard('vines', 'enemy').maxTargets, 8);
  assert.equal(game.getCard('vines', 'player').maxTargets, 3);
  const before = game.exportSnapshot();
  for (const maxTargets of [0, 9, 1.5, Infinity, NaN, '3']) {
    assert.equal(game.setCardBalance('vines', { damage: 1, maxTargets }, { team: 'both' }).ok, false);
    assert.deepEqual(game.exportSnapshot(), before);
  }
});

test('target inspection exposes grounding and ready-target clears it without changing native flight or position', () => {
  const game = new Game({ seed: 45, practice: true, developerMode: true }).start();
  game.setDeveloperCheats({ infiniteElixir: { player: true, enemy: true } });
  assert.equal(game.spawnDeveloperCard('player', 'minion_giant', 240, 430).ok, true);
  const unit = game.state.units[0];
  assert.equal(game.spawnDeveloperCard('enemy', 'vines', unit.x, unit.y).ok, true);
  for (let tick = 0; tick < 24; tick++) game.update(1 / 60);
  assert.ok(unit.groundedRemaining > 0);
  assert.ok(unit.stunRemaining > 0);
  const detail = inspectTarget(game, unit.id);
  assert.equal(detail.entity.knockbackImmune, true);
  assert.equal(detail.entity.groundedRemaining, unit.groundedRemaining);
  detail.entity.groundedRemaining = 0;
  assert.ok(unit.groundedRemaining > 0, 'inspection is detached');
  const position = [unit.x, unit.y];
  assert.equal(applyCheat(game, { type: 'ready-target', id: unit.id }).ok, true);
  assert.equal(unit.groundedRemaining, 0);
  assert.equal(unit.stunRemaining, 0);
  assert.equal(unit.flying, true);
  assert.deepEqual([unit.x, unit.y], position);
  const legacy = new Game({ seed: 1, practice: true, rulesVersion: 4 });
  const tower = legacy.state.towers[0];
  assert.equal(applyCheat(legacy, { type: 'ready-target', id: tower.id }).ok, true);
  assert.equal(Object.hasOwn(tower, 'groundedRemaining'), false);
});
