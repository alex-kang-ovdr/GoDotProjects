'use strict';

// Genuine v6 public-command exports, approved by the frozen v6 source before
// migration. These tests never fabricate an old version by editing its number.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const file of ['data.js', 'engine.js', 'campaign.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8'), context, { filename: file });
}
const Game = context.Starward.Game;
const json = value => JSON.parse(JSON.stringify(value));
const okay = value => value === true || value?.ok === true;
const files = ['v6-quest-in-progress.json', 'v6-hacking-in-flight.json', 'v6-teleport-staging.json', 'v6-world-choice.json'];

function originalFields(actual, before, key = 'state') {
  if (before === null || typeof before !== 'object') {
    assert.equal(actual, before, key);
    return;
  }
  if (Array.isArray(before)) assert.equal(actual.length, before.length, key + ' length');
  for (const [name, value] of Object.entries(before)) {
    if (key === 'state' && name === 'version') continue;
    originalFields(actual[name], value, key + '.' + name);
  }
}

for (const filename of files) {
  test('v7 preserves genuine v6 state, then resumes and resaves: ' + filename, () => {
    const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', filename), 'utf8');
    const original = JSON.parse(bytes), game = new Game(7);
    assert.equal(original.version, 6);
    assert.equal(game.load(bytes), true, 'genuine v6 file is accepted');
    assert.equal(game.state.version, 7);
    originalFields(game.state, original);
    const migrated = game.serialize();
    const tiles = game.getShipTiles('player');
    assert.ok(tiles.length > 0, 'old geometry still offers square tiles');
    assert.equal(game.serialize(), migrated, 'query cannot normalize or move old crew');
    const copy = new Game(1);
    assert.equal(copy.load(migrated), true);
    assert.equal(copy.serialize(), migrated, 'current version round trip is exact');
    if (game.state.mode === 'combat') {
      game.setPaused(false);
      for (let i = 0; i < 90; i++) game.tick(1 / 30);
      game.setPaused(true);
      assert.ok(game.state.time > original.time);
      assert.equal(copy.load(game.serialize()), true, 'post-migration movement and effects remain valid');
      assert.ok(game.state.player.crew.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)));
    }
  });
}

test('v6 pending world choice continues its original eight-sector route after v7 migration', () => {
  const game = new Game(8);
  assert.equal(game.load(fs.readFileSync(path.join(__dirname, 'fixtures/v6-world-choice.json'), 'utf8')), true);
  const before = json(game.state.campaign.world), fuel = game.state.resources.fuel;
  assert.equal(game.state.campaign.routeMode, 'expanded');
  assert.equal(game.state.campaign.totalSectors, 8);
  const world = game.getWorldMap();
  assert.ok(world.availableIds.length > 0);
  assert.ok(okay(game.advanceSector(world.availableIds[0])));
  assert.equal(game.state.sector, 2);
  assert.equal(game.state.resources.fuel, fuel - 1);
  assert.equal(game.state.campaign.world.route[0], before.route[0]);
  assert.equal(new Game(2).load(game.serialize()), true);
});

test('legacy v6 hull cannot fabricate a fresh mounting bay by editing its saved layout identity', () => {
  const game = new Game(8);
  assert.equal(game.load(fs.readFileSync(path.join(__dirname, 'fixtures/v6-quest-in-progress.json'), 'utf8')), true);
  const before = game.serialize(), candidate = JSON.parse(before);
  const fresh = new Game(9);
  candidate.player.layoutId = fresh.state.player.layoutId;
  assert.notEqual(candidate.player.layoutId, game.state.player.layoutId);
  assert.equal(game.load(JSON.stringify(candidate)), false);
  assert.equal(game.serialize(), before, 'invalid layout replacement is atomic');
});
