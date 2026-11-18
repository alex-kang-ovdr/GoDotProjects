'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, HEROES, ITEMS } = require('../dist/game.js');
const Checkpoint = require('../dist/checkpoint.js');
const History = require('../dist/history.js');
const Coach = require('../dist/coach.js');
const legacy4 = require('./fixtures/v4-checkpoint.json');
const legacy5 = require('./fixtures/v5-checkpoint.json');
const legacy6 = require('./fixtures/v6-checkpoint.json');

const RESTORED_IDS = ['lol_ahri', 'lol_ashe', 'lol_garen', 'lol_lux', 'lol_leesin', 'lol_jhin'];
const ITEM_BY_ID = Object.fromEntries(ITEMS.map(item => [item.id, item]));
const copy = value => JSON.parse(JSON.stringify(value));

function storage(initial = null) {
  let raw = initial;
  return {
    writes: 0,
    getItem() { return raw; },
    setItem(key, value) { raw = value; this.writes++; },
    raw() { return raw; }
  };
}

function restoredGame(hero = 'lol_ahri', mapScale = 1) {
  assert.ok(HEROES.some(entry => entry.id === hero), `${hero} definition is loaded`);
  const game = new Game({ hero, mapScale, seed: 823 });
  const starter = Coach.starter(hero);
  assert.ok(starter?.startsWith('lol_'));
  assert.equal(game.prepareItem(starter).ok, true);
  game.start();
  return game;
}

test('six restored champions preserve profile, equipment, resource state, map and supported speeds through the real checkpoint path', () => {
  for (const [index, hero] of RESTORED_IDS.entries()) {
    const mapScale = [1, 1.5, 2][index % 3];
    const speed = [0.5, 0.75, 1, 1.5][index % 4];
    const game = restoredGame(hero, mapScale);
    const target = storage();
    const journey = Coach.read(game).journey;
    const saved = Checkpoint.write(target, game, { speed, journey }, 1794916800000 + index);
    assert.equal(saved.ok, true, `${hero}: ${saved.reason}`);
    assert.equal(saved.checkpoint.state.engineVersion, 9);
    assert.equal(saved.checkpoint.state.state.ruleset, 'lol16.22');
    assert.equal(saved.checkpoint.state.state.dataVersion, '16.22.1');
    const loaded = Checkpoint.read(target);
    assert.equal(loaded.status, 'ready', `${hero}: ${loaded.reason}`);
    const resumed = Checkpoint.restore(loaded.checkpoint);
    assert.equal(resumed.ok, true, `${hero}: ${resumed.reason}`);
    assert.equal(resumed.game.player.hero, hero);
    assert.equal(resumed.game.ruleset, 'lol16.22');
    assert.equal(resumed.game.dataVersion, '16.22.1');
    assert.equal(resumed.game.mapScale, mapScale);
    assert.equal(resumed.ui.speed, speed);
    assert.deepEqual(resumed.ui.journey, journey);
    assert.deepEqual(resumed.game.player.inventory, game.player.inventory);
    assert.equal(resumed.game.player.mana, game.player.mana);
    assert.equal(resumed.game.player.maxMana, game.player.maxMana);
    assert.deepEqual(resumed.game.player.restored, game.player.restored);
    assert.deepEqual(resumed.game._restoredEffects, game._restoredEffects);
    assert.equal(resumed.game.paused, true);
    const time = resumed.game.time;
    resumed.game.step(1);
    assert.equal(resumed.game.time, time);
  }
});

test('v9 large-map journey bounds come from the match, while retired 2x speed normalizes to 1.5x', () => {
  const game = restoredGame('lol_lux', 2), target = storage();
  const origin = { x: 3100, y: 3090 };
  const result = Checkpoint.write(target, game, {
    speed: 2, journey: { version: 1, origin, completed: { equipment: true } }
  }, 1000);
  assert.equal(result.ok, true, result.reason);
  const loaded = Checkpoint.restore(Checkpoint.read(target).checkpoint);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.ui.speed, 1.5);
  assert.deepEqual(loaded.ui.journey.origin, origin);
  const badOrigin = Checkpoint.write(target, game, {
    speed: 0.75, journey: { version: 1, origin: { x: 3201, y: 100 }, completed: {} }
  }, 1001);
  assert.equal(badOrigin.ok, true);
  assert.equal(Object.hasOwn(badOrigin.checkpoint.ui, 'journey'), false);
});

test('active restored dash-charge and periodic-skill states resume from their saved simulation time', () => {
  for (const [hero, slot] of [['lol_ahri', 'r'], ['lol_garen', 'e']]) {
    const game = restoredGame(hero, 1.5), target = storage();
    game.player.level = 6;
    game.player.skillRanks = { q: 1, w: 1, e: 1, r: 1 };
    game.player.skillPoints = 2;
    game._recalculate(game.player);
    game.player.mana = game.player.maxMana;
    const cast = game.cast(slot, game.player.x + 60, game.player.y);
    assert.equal(cast.ok, true, `${hero} ${slot}: ${cast.reason}`);
    assert.equal(game.player.restored.castCount, 1);
    for (let i = 0; i < 9; i++) game.step(1 / 60);
    const written = Checkpoint.write(target, game, { speed: 0.75 }, 1500);
    assert.equal(written.ok, true, `${hero}: ${written.reason}`);
    const resumed = Checkpoint.restore(Checkpoint.read(target).checkpoint);
    assert.equal(resumed.ok, true, `${hero}: ${resumed.reason}`);
    assert.deepEqual(resumed.game.player.restored, game.player.restored);
    assert.deepEqual(resumed.game._restoredEffects, game._restoredEffects);
    const before = copy(resumed.game.player.restored);
    resumed.game.step(1);
    assert.deepEqual(resumed.game.player.restored, before, 'Paused restoration does not age recasts or effects');
    resumed.game.paused = false;
    for (let i = 0; i < 30; i++) {
      game.step(1 / 60);
      resumed.game.step(1 / 60);
    }
    assert.deepEqual(resumed.game.player.restored, game.player.restored, `${hero} phase clocks remain continuous`);
    assert.deepEqual(resumed.game._restoredEffects, game._restoredEffects, `${hero} timed effects remain continuous`);
    assert.equal(resumed.game.player.mana, game.player.mana);
  }
});

test('an incompatible restored data profile cannot overwrite the previous valid continuation', () => {
  const game = restoredGame(), target = storage();
  assert.equal(Checkpoint.write(target, game, { speed: 0.75 }, 1000).ok, true);
  const before = target.raw(), state = game.exportState();
  for (const mutate of [
    value => { value.state.dataVersion = '16.23.1'; },
    value => { value.state.ruleset = 'unknown-profile'; },
    value => { delete value.state.ruleset; },
    value => { value.engineVersion = 99; }
  ]) {
    const changed = copy(state);
    mutate(changed);
    assert.equal(Checkpoint.read(storage(JSON.stringify({ version: 1, savedAt: 1000, state: changed, ui: { speed: 1 } }))).status, 'invalid');
    game.exportState = () => changed;
    assert.equal(Checkpoint.write(target, game, { speed: 1.5 }, 2000).ok, false);
    assert.equal(target.raw(), before);
  }
});

test('authentic v4-v6 checkpoints and the retained v7 profile remain independent of the restored data profile', () => {
  for (const old of [legacy4, legacy5, legacy6]) {
    const loaded = Checkpoint.read(storage(JSON.stringify(old)));
    assert.equal(loaded.status, 'ready', loaded.reason);
    const resumed = Checkpoint.restore(loaded.checkpoint);
    assert.equal(resumed.ok, true, resumed.reason);
    assert.ok(['mage', 'warrior', 'ranger'].includes(resumed.game.player.hero));
    assert.equal(resumed.game.ruleset, 'nexus-v7');
    assert.equal(resumed.game.dataVersion, null);
    assert.equal(resumed.ui.speed, 1.5);
    const exported = resumed.game.exportState();
    assert.equal(exported.engineVersion, 9);
    assert.equal(Object.hasOwn(exported.state, 'ruleset'), false);
  }
  const legacy = new Game({ hero: 'ranger', mapScale: 1.5, seed: 718 });
  legacy.start();
  const target = storage();
  assert.equal(Checkpoint.write(target, legacy, { speed: 0.75 }, 3000).ok, true);
  assert.equal(Checkpoint.read(target).checkpoint.state.engineVersion, 9);
  const resumed = Checkpoint.restore(Checkpoint.read(target).checkpoint);
  assert.equal(resumed.game.player.hero, 'ranger');
  assert.equal(resumed.game.mapScale, 1.5);
  assert.equal(resumed.ui.speed, 0.75);
});

test('completed restored records keep the real champion identity and versioned profile after reloading history', () => {
  for (const hero of RESTORED_IDS) {
    const game = restoredGame(hero), target = storage();
    game.surrender();
    const record = History.makeRecord(game, '2026-11-17T12:00:00Z');
    assert.equal(record.hero, hero);
    assert.equal(record.version, 4);
    assert.equal(record.ruleset, 'lol16.22');
    assert.equal(record.dataVersion, '16.22.1');
    assert.equal(record.heroName, HEROES.find(value => value.id === hero).name);
    assert.ok(record.id.startsWith('nf4-'));
    assert.equal(History.append(target, record).persisted, true);
    const [loaded] = History.read(target);
    assert.equal(loaded.hero, hero);
    assert.equal(loaded.heroName, record.heroName);
    assert.equal(loaded.ruleset, 'lol16.22');
    assert.equal(loaded.dataVersion, '16.22.1');
    const player = loaded.teamStats.flatMap(team => team.heroes).find(entry => entry.id === 'player');
    assert.equal(player.hero, hero);
    assert.equal(player.ruleset, 'lol16.22');
    assert.deepEqual(player.inventory, game.player.inventory);
  }
});

test('restored starters and all follow-up recommendations stay within the selected game shop', () => {
  for (const hero of RESTORED_IDS) {
    const game = restoredGame(hero);
    const starter = Coach.starter(hero);
    assert.ok(ITEM_BY_ID[starter].cost <= 600);
    assert.ok(game.player.inventory.includes(starter));
    const allowed = new Set(game.getShopItems().map(item => item.id));
    const recommendation = Coach.recommend(game);
    assert.ok(recommendation.itemId.startsWith('lol_'));
    assert.ok(allowed.has(recommendation.itemId));
    assert.equal(recommendation.cost, game.getPurchaseInfo(recommendation.itemId).cost);
    assert.equal(recommendation.canBuy, false, 'Initial field position is outside the shop');
  }
  assert.equal(Coach.starter('lol_unknown'), null, 'Unknown restored heroes never inherit legacy equipment');
});

test('unsupported restored record IDs do not silently become the legacy mage', () => {
  const raw = JSON.stringify([{ version: 4, hero: 'lol_unknown', winner: 0, time: 100,
    ruleset: 'lol16.22', dataVersion: '16.22.1', at: 1000 }]);
  assert.deepEqual(History.read(storage(raw)), []);
});

test('restored recommendation accounts for two copies of the same recipe component', () => {
  const game = restoredGame('lol_garen');
  Object.assign(game.player, game.map.bases[0]);
  game.player.inventory = ['lol_1036', 'lol_2022'];
  game.player.gold = 0;
  const recipe = ITEM_BY_ID.lol_3133;
  assert.ok(recipe.components.filter(id => id === 'lol_1036').length >= 2);
  const result = Coach.recommend(game);
  assert.equal(result.itemId, 'lol_1036', 'The second Long Sword is still missing');
  assert.equal(result.cost, ITEM_BY_ID.lol_1036.cost);
  game.player.inventory.push('lol_1036');
  const combine = Coach.recommend(game);
  assert.equal(combine.itemId, 'lol_3133');
  assert.equal(combine.cost, game.getPurchaseInfo('lol_3133').cost);
});

test('a full restored inventory recommends an available combination instead of an impossible loose component', () => {
  const game = restoredGame('lol_garen');
  Object.assign(game.player, game.map.bases[0]);
  game.player.inventory = ['lol_1036', 'lol_1028', 'lol_1029', 'lol_1033', 'lol_1042', 'lol_1001'];
  game.player.gold = 10000;
  const before = game.player.gold;
  const result = Coach.recommend(game);
  assert.equal(result.itemId, 'lol_3133');
  assert.equal(result.blockedBySlots, false);
  assert.equal(result.canBuy, true);
  assert.equal(game.buy(result.itemId).ok, true);
  assert.equal(game.player.inventory.length, 6);
  assert.ok(game.player.inventory.includes('lol_3133'));
  assert.equal(game.player.gold, before - result.cost);
});

test('the successful-cast counter records zero-cooldown restored skills without inventing a milestone from resource changes', () => {
  const game = restoredGame('lol_ashe');
  const initial = Coach.read(game).journey;
  for (const slot of ['q', 'w', 'e', 'r']) game.player.cd[slot] = 0;
  game.player.restored.castCount = 0;
  game.player.mana -= 10;
  assert.equal(Coach.updateJourney(game, initial).completed.skill, false);
  game.player.restored.castCount = 1;
  const observed = Coach.updateJourney(game, initial);
  assert.equal(observed.completed.skill, true);
  game.player.restored.castCount = 0;
  assert.equal(Coach.updateJourney(game, observed).completed.skill, true, 'Completed observations survive cooldown/recast cleanup');
});
