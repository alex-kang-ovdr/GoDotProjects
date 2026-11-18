'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Game, MAP, MAP_SCALES, normalizeMapScale, createMap } = require('../dist/game.js');

const DT = 1 / 60;
const clone = value => JSON.parse(JSON.stringify(value));
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) < epsilon, `${a} should be close to ${b}`);
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds / DT); i++) game.step(DT); }
function running(scale = 2, hero = 'mage') { const game = new Game({ mapScale: scale, hero, seed: 71 }); game.start(); return game; }
function quietPlayer(game, x, y) {
  Object.assign(game.player, { x, y, autoAttack: false });
  for (const entity of game.entities) if (entity !== game.player && ['hero', 'minion'].includes(entity.type)) entity.stunnedUntil = 1000;
  game._rebuildIndex();
}

test('map selection supports 1, 1.5 and 2 while invalid constructor values fall back to the standard map', () => {
  assert.deepEqual(MAP_SCALES, [1, 1.5, 2]);
  for (const scale of MAP_SCALES) {
    assert.equal(normalizeMapScale(scale), scale);
    assert.equal(normalizeMapScale(String(scale)), scale);
    const game = new Game({ mapScale: scale });
    assert.equal(game.mapScale, scale);
    assert.equal(game.map.width, 1600 * scale);
    assert.equal(game.map.height, 1600 * scale);
  }
  for (const invalid of [undefined, null, false, {}, [], -1, 0, 1.25, 3, Infinity, NaN, 'large']) {
    assert.equal(normalizeMapScale(invalid), 1);
    assert.equal(createMap(invalid).width, 1600);
  }
});

test('coexisting matches own independent maps and never resize the default export', () => {
  const normal = new Game({ mapScale: 1 }), large = new Game({ mapScale: 2 }), middle = new Game({ mapScale: 1.5 });
  const defaultBefore = clone(MAP);
  const first = createMap(2), second = createMap(2);
  first.bases[0].x = -1; first.lanes.mid[0][0] = -1; first.obstacles[0].r = 1; first.brushes[0].x = -1;
  assert.notEqual(second.bases[0].x, -1);
  assert.notEqual(second.lanes.mid[0][0], -1);
  assert.notEqual(second.obstacles[0].r, 1);
  assert.notEqual(second.brushes[0].x, -1);
  assert.deepEqual(MAP, defaultBefore);
  assert.deepEqual([normal.map.width, middle.map.width, large.map.width], [1600, 2400, 3200]);
  assert.notEqual(normal.map, large.map);
  assert.notEqual(normal.map.lanes.mid, large.map.lanes.mid);
  assert.equal(normal._aim(normal.player, 1e6, 1e6, 1e6).x, 1572);
  assert.equal(large._aim(large.player, 1e6, 1e6, 1e6).x, 3172);
});

test('terrain, camps, lane structures and spawn anchors scale while unit statistics remain unchanged', () => {
  const normal = new Game({ mapScale: 1, seed: 11 });
  for (const scale of [1.5, 2]) {
    const game = new Game({ mapScale: scale, seed: 11 });
    for (const field of ['speed', 'range', 'r', 'maxHp', 'damage', 'attackSpeed']) assert.equal(game.player[field], normal.player[field], field);
    near(game.player.x, normal.player.x * scale);
    near(game.player.y, normal.player.y * scale);
    for (const original of normal.entities.filter(e => ['tower', 'inhibitor', 'nexus', 'monster'].includes(e.type))) {
      const expanded = game.entities.find(e => e.id === original.id);
      near(expanded.x, original.x * scale); near(expanded.y, original.y * scale);
      assert.equal(expanded.r, original.r);
      assert.equal(expanded.maxHp, original.maxHp);
      if (original.type === 'monster') { near(expanded.homeX, original.homeX * scale); near(expanded.homeY, original.homeY * scale); }
    }
    for (let i = 0; i < MAP.obstacles.length; i++) {
      near(game.map.obstacles[i].x, MAP.obstacles[i].x * scale);
      near(game.map.obstacles[i].r, MAP.obstacles[i].r * scale);
    }
    for (const lane of ['top', 'mid', 'bot']) near(game._paths[lane].total, normal._paths[lane].total * scale);
    assert.deepEqual(game.getSnapshot().map, { width: 1600 * scale, height: 1600 * scale });
    assert.equal(game.getSnapshot().mapScale, scale);
  }
});

test('all map variants retain open lanes, safe obstacle detours and bounded A-star grids', () => {
  for (const scale of MAP_SCALES) {
    const game = new Game({ mapScale: scale }), nav = game.navigation, r = game.player.r;
    assert.equal(nav.columns * nav.rows, 1600);
    for (const [name, points] of Object.entries(game.map.lanes)) for (let i = 1; i < points.length; i++) {
      assert.equal(nav.segmentClear(...points[i - 1], ...points[i], r), true, `${scale}x ${name} lane ${i}`);
    }
    for (const wall of game.map.obstacles) {
      const from = nav.nearestWalkable(wall.x - wall.r - 90, wall.y, r);
      const to = nav.nearestWalkable(wall.x + wall.r + 90, wall.y, r);
      const route = nav.findPath(from.x, from.y, to.x, to.y, r);
      assert.ok(route.length, `${scale}x wall has a route`);
      let previous = from;
      for (const point of route) {
        assert.equal(nav.isWalkable(point.x, point.y, r), true);
        assert.equal(nav.segmentClear(previous.x, previous.y, point.x, point.y, r), true);
        previous = point;
      }
      near(previous.x, to.x); near(previous.y, to.y);
    }
  }
});

test('both teams spawn on every enlarged lane and advance without entering terrain or structures', () => {
  for (const scale of [1.5, 2]) {
    const game = running(scale);
    const origins = new Map();
    for (const team of [0, 1]) for (const lane of ['top', 'mid', 'bot']) {
      const minions = game.entities.filter(e => e.type === 'minion' && e.team === team && e.lane === lane);
      assert.equal(minions.length, 5);
      for (const minion of minions) {
        assert.equal(game._movementNavigation.isWalkable(minion.x, minion.y, minion.r), true);
        origins.set(minion.id, minion.laneProgress);
      }
    }
    advance(game, 2);
    for (const team of [0, 1]) for (const lane of ['top', 'mid', 'bot']) {
      const minions = game.entities.filter(e => e.type === 'minion' && e.team === team && e.lane === lane);
      assert.ok(minions.some(e => team === 0 ? e.laneProgress > origins.get(e.id) + 0.01 : e.laneProgress < origins.get(e.id) - 0.01), `${scale}x ${team} ${lane} advanced`);
      for (const minion of minions) assert.equal(game._movementNavigation.isWalkable(minion.x, minion.y, minion.r), true);
    }
  }
});

test('movement and ground casts work beyond the old 1600 boundary and clamp to the selected map', () => {
  const game = running(2);
  quietPlayer(game, 2000, 1600);
  assert.equal(game.commandMove(2180, 1600).ok, true);
  advance(game, 1.5);
  assert.ok(game.player.x > 2165, 'The player reaches the enlarged part of the map');
  game.stop();
  game.gainXp(game.player, 110);
  assert.equal(game.upgradeSkill('w').ok, true);
  assert.equal(game.cast('w', 2300, 1600).ok, true);
  const impact = game._pending.find(e => e.sourceId === 'player');
  near(impact.x, 2300); near(impact.y, 1600);
  assert.equal(game.commandMove(1e6, -1e6).ok, true);
  near(game._moveDestination.x, 3172); near(game._moveDestination.y, 28);
  const aim = game._aim(game.player, 1e6, 1e6, 1e6);
  near(aim.x, 3172); near(aim.y, 3172);
});

test('wards, base vision, team objectives, recall and respawn use the selected map', () => {
  const game = running(2);
  quietPlayer(game, 2700, 2000);
  assert.equal(game.cast('ward', 3000, 2000).ok, true);
  game._rebuildIndex();
  const ward = game.entities.find(e => e.type === 'ward');
  near(ward.x, 3000); near(ward.y, 2000);
  assert.equal(game.visibilityAt(3170, 2000, 0), true);
  assert.equal(game.visibilityAt(game.map.bases[1].x, game.map.bases[1].y, 1), true);
  assert.equal(game.setTeamOrder('push').ok, true);
  near(game.order.x, 1600); near(game.order.y, 1600);
  assert.equal(game.setTeamOrder('defend').ok, true);
  near(game.order.x, game.map.bases[0].x); near(game.order.y, game.map.bases[0].y);
  quietPlayer(game, 1600, 1600); // Recall away from the enlarged enemy bottom tower.
  assert.equal(game.recall().ok, true);
  advance(game, 4.1);
  assert.ok(Math.hypot(game.player.x - game.map.bases[0].x, game.player.y - game.map.bases[0].y) < 155, 'Recall reaches the selected base healing zone and resolves solid-nexus clearance');
  game.damage(game.player, 1e6, game.entities.find(e => e.type === 'hero' && e.team === 1), 'true');
  game._respawnHero(game.player);
  assert.ok(Math.hypot(game.player.x - game.map.bases[0].x, game.player.y - game.map.bases[0].y) < 20);
});

test('enlarged map checkpoints retain geometry and deterministic combat across the wave boundary', () => {
  for (const scale of [1.5, 2]) {
    const game = running(scale, 'ranger');
    advance(game, 17.9);
    assert.equal(game.commandMove(game.map.width * 0.7, game.map.height * 0.6).ok, true);
    const saved = clone(game.exportState());
    assert.equal(saved.engineVersion, 9);
    assert.equal(saved.state.mapScale, scale);
    const restored = Game.fromState(saved, { paused: false, clearInput: false });
    assert.equal(restored.mapScale, scale);
    assert.notEqual(restored.map, game.map);
    assert.deepEqual(restored.exportState(), game.exportState());
    for (let i = 0; i < 90; i++) { game.step(DT); restored.step(DT); }
    assert.equal(game.waveNumber, 2);
    assert.deepEqual(restored.exportState(), game.exportState());
  }
});

test('save validation rejects unsupported scales and coordinates beyond each selected map', () => {
  const game = running(2), original = clone(game.exportState());
  for (const badScale of [undefined, null, '2', 0, 1.25, 2.01, 3]) {
    const saved = clone(original);
    if (badScale === undefined) delete saved.state.mapScale;
    else saved.state.mapScale = badScale;
    assert.throws(() => Game.fromState(saved), /mapScale|map scale/);
  }
  for (const scale of MAP_SCALES) {
    const good = clone(running(scale).exportState()), width = 1600 * scale;
    const mutations = [
      saved => { saved.state.entities.find(e => e.id === 'player').x = width + 1; },
      saved => { saved.state._moveDestination = { x: width + 1, y: 50 }; },
      saved => { saved.state.order = { type: 'rally', x: 50, y: width + 1, expiresAt: 20 }; },
      saved => { saved.state.entities.find(e => e.id === 'player').navPath = [{ x: width + 1, y: 50 }]; },
      saved => { saved.state.entities.find(e => e.type === 'monster').homeX = width + 1; }
    ];
    for (const mutate of mutations) { const saved = clone(good); mutate(saved); assert.throws(() => Game.fromState(saved), /올바르지/); }
  }
  const disguised = clone(original);
  disguised.engineVersion = 6;
  assert.throws(() => Game.fromState(disguised), /legacy map scale/);
});

test('actual v4, v5 and v6 checkpoints migrate to the standard map without a mapScale field', () => {
  for (const version of [4, 5, 6]) {
    const wrapper = require(`./fixtures/v${version}-checkpoint.json`);
    assert.equal(wrapper.state.engineVersion, version);
    assert.equal(Object.hasOwn(wrapper.state.state, 'mapScale'), false);
    const restored = Game.fromState(wrapper.state);
    assert.equal(restored.mapScale, 1);
    assert.equal(restored.map.width, 1600);
    assert.equal(restored.exportState().engineVersion, 9);
    assert.equal(restored.exportState().state.mapScale, 1);
    assert.equal(restored.time, wrapper.state.state.time);
  }
});
