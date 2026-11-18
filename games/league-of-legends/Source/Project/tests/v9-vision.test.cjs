'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Vision, PROFILE, validateState } = require('../dist/vision.js');
const { Game } = require('../dist/game.js');

function world(overrides = {}) {
  const map = Object.assign({ width: 1600, height: 1600, bases: [{ x: 60, y: 1540 }, { x: 1540, y: 60 }],
    obstacles: [], highGrounds: [], brushes: [], camps: [] }, overrides);
  const viewer = { id: 'player', type: 'hero', team: 0, x: 600, y: 800, alive: true };
  const enemy = { id: 'enemy', type: 'hero', team: 1, x: 900, y: 800, alive: true, revealedUntil: 0 };
  const game = { map, time: 0, entities: [viewer, enemy], _vision: [[viewer], [enemy]], _restoredEffects: [], isProtected: e => !!e.protected };
  return { map, game, viewer, enemy, vision: new Vision(map) };
}

function tower(x = 900, y = 800) {
  return { id: 'tower-1-mid-outer', name: '중앙 외곽 포탑', type: 'tower', team: 1, x, y, r: 34, range: 340,
    lane: 'mid', structureTier: 'outer', hp: 1000, maxHp: 1000, alive: true, protected: false };
}

function refresh(game) { game._rebuildIndex(); game._updateVision(true); }

test('wall silhouette blocks normal sight while the open side remains visible', () => {
  const { game, viewer, enemy, vision } = world({ obstacles: [{ x: 750, y: 800, r: 50 }] });
  assert.equal(vision.pointVisible(game, enemy.x, enemy.y, 0), false);
  assert.equal(vision.entityVisible(game, enemy, 0), false);
  enemy.y = 600;
  assert.equal(vision.entityVisible(game, enemy, 0), true);
  assert.equal(vision.hasLineOfSight(viewer.x, viewer.y, enemy.x, enemy.y), true);
});

test('high ground blocks uphill sight and a ridge crossing but permits downhill sight', () => {
  const { game, viewer, enemy, vision } = world({ highGrounds: [{ id: 'hill', x: 800, y: 800, r: 100, tier: 1 }] });
  enemy.x = 800;
  assert.equal(vision.groundHeightAt(enemy.x, enemy.y), 1);
  assert.equal(vision.entityVisible(game, enemy, 0), false);
  assert.equal(vision.entityVisible(game, viewer, 1), true);
  assert.equal(vision.hasLineOfSight(600, 800, 1000, 800), false);
  assert.equal(vision.hasLineOfSight(800, 800, 1000, 800), true);
});

test('absolute walls continue blocking an observer on a high plateau', () => {
  const { vision } = world({ highGrounds: [{ x: 800, y: 800, r: 150, tier: 1 }], obstacles: [{ x: 925, y: 800, r: 25 }] });
  assert.equal(vision.hasLineOfSight(800, 800, 1100, 800), false);
});

test('brush permission and LOS must be supplied by the same source', () => {
  const { game, viewer, enemy, vision } = world({ brushes: [{ x: 900, y: 800, r: 110 }], obstacles: [{ x: 850, y: 800, r: 30 }] });
  viewer.x = 650; viewer.y = 600;
  const behindWall = { id: 'ally', type: 'hero', team: 0, x: 800, y: 800, alive: true };
  game._vision[0] = [viewer, behindWall]; game.entities.push(behindWall);
  assert.equal(vision.pointVisible(game, enemy.x, enemy.y, 0), true);
  assert.equal(vision.entityVisible(game, enemy, 0), false);
  enemy.revealedUntil = 1;
  assert.equal(vision.entityVisible(game, enemy, 0), true);
});

test('flying scout is an explicit terrain and brush reveal source; a ward is not', () => {
  const { game, enemy, vision } = world({ highGrounds: [{ x: 900, y: 800, r: 100, tier: 1 }], brushes: [{ x: 900, y: 800, r: 90 }] });
  const ward = { id: 'ward', type: 'ward', team: 0, x: 600, y: 800, alive: true };
  game._vision[0].push(ward);
  assert.equal(vision.entityVisible(game, enemy, 0), false);
  game._restoredEffects.push({ kind: 'reveal_travel', team: 0, x: 850, y: 800, radius: 250, until: 5 });
  assert.equal(vision.entityVisible(game, enemy, 0), true);
  game.time = 5;
  assert.equal(vision.entityVisible(game, enemy, 0), false);
});

test('removing one overlapping source preserves remaining vision and explored terrain', () => {
  const { game, viewer, vision } = world();
  const ward = { id: 'ward', type: 'ward', team: 0, x: 900, y: 800, alive: true };
  game._vision[0].push(ward); game.entities.push(ward);
  const index = 40 * vision.cols + 49;
  vision.update(game, true);
  assert.equal(vision.mask(game, 0).visible[index], 1);
  viewer.alive = false; vision.update(game, true);
  assert.equal(vision.mask(game, 0).visible[index], 1);
  ward.alive = false; vision.update(game, true);
  assert.equal(vision.mask(game, 0).visible[index], 0);
  assert.equal(vision.mask(game, 0).explored[index], 1);
});

test('fog mask updates on game time and getters do not advance state', () => {
  const { game, viewer, vision } = world();
  vision.update(game, true);
  const before = JSON.stringify(vision.exportState(game));
  const first = vision.mask(game, 0);
  for (let i = 0; i < 30; i++) {
    vision.mask(game, 0); vision.structureObservations(game, 0); vision.attackOrigins(game, 0);
  }
  assert.equal(JSON.stringify(vision.exportState(game)), before);
  assert.equal(vision.mask(game, 0).revision, first.revision);
  viewer.x += 100; game.time = 0.05; vision.update(game, false);
  assert.equal(vision.mask(game, 0).revision, first.revision);
  game.time = 0.1; vision.update(game, false);
  assert.equal(vision.mask(game, 0).revision, first.revision + 1);
});

test('unexplored enemy buildings do not expose state or a remembered proxy', () => {
  const { game, viewer, vision } = world();
  const building = tower(1400, 350); game.entities.push(building);
  vision.update(game, true);
  assert.equal(vision.entityVisible(game, building, 0), false);
  assert.equal(vision.structureObservations(game, 0).length, 0);
  assert.equal(vision.structureObservations(game, 1).length, 1);
  viewer.x = 1200; viewer.y = 350; vision.update(game, true);
  assert.equal(vision.structureObservations(game, 0)[0].hp, 1000);
});

test('hidden HP, destruction, protection and rebuilding remain frozen until observation', () => {
  const { game, viewer, vision } = world();
  const building = tower(); game.entities.push(building);
  vision.update(game, true);
  const original = vision.structureObservations(game, 0)[0];
  viewer.x = 60; viewer.y = 1540; game.time = 1; vision.update(game, true);
  building.hp = 0; building.alive = false; building.protected = true; game.time = 2; vision.update(game, true);
  let remembered = vision.structureObservations(game, 0)[0];
  assert.equal(remembered.hp, original.hp); assert.equal(remembered.alive, true);
  assert.equal(remembered.protected, original.protected); assert.equal(remembered.observedAt, original.observedAt);
  assert.equal(remembered.remembered, true); assert.equal(remembered.visible, false);
  remembered.hp = 123; assert.equal(vision.structureObservations(game, 0)[0].hp, 1000);
  building.alive = true; building.hp = building.maxHp = 1500;
  game.time = 3; vision.update(game, true); assert.equal(vision.structureObservations(game, 0)[0].maxHp, 1000);
  viewer.x = 600; viewer.y = 800; game.time = 4; vision.update(game, true);
  const current = vision.structureObservations(game, 0)[0];
  assert.equal(current.hp, 1500); assert.equal(current.maxHp, 1500); assert.equal(current.protected, true);
  assert.equal(current.observedAt, 4); assert.equal(current.remembered, false);
});

test('observing an empty fixed building slot clears an old standing proxy', () => {
  const { game, viewer, vision } = world();
  const building = tower(); game.entities.push(building); vision.update(game, true);
  viewer.x = 60; viewer.y = 1540; vision.update(game, true);
  game.entities = game.entities.filter(e => e !== building); vision.update(game, true);
  assert.equal(vision.structureObservations(game, 0)[0].alive, true);
  viewer.x = 600; viewer.y = 800; vision.update(game, true);
  const known = vision.structureObservations(game, 0)[0];
  assert.equal(known.alive, false); assert.equal(known.hp, 0);
});

test('enemy attack origin is a fixed temporary clue without tracking or targetability', () => {
  const { game, viewer, enemy, vision } = world({ highGrounds: [{ x: 800, y: 800, r: 100, tier: 1 }] });
  enemy.x = 800; vision.update(game, true);
  vision.recordAttack(game, enemy, viewer, { x: 800, y: 800 });
  const clue = vision.attackOrigins(game, 0)[0];
  assert.deepEqual({ x: clue.x, y: clue.y }, { x: 800, y: 800 });
  assert.equal(Object.hasOwn(clue, 'sourceId'), false);
  assert.equal(vision.entityVisible(game, enemy, 0), false);
  assert.equal(vision.pointVisible(game, 800, 800, 0), false);
  assert.equal(vision.attackOrigins(game, 1).length, 0);
  enemy.x = 1100; enemy.y = 1100;
  game.time = 1; vision.update(game, true);
  assert.deepEqual(vision.attackOrigins(game, 0)[0], clue);
  game.time = 1.5; vision.update(game, false);
  assert.equal(vision.attackOrigins(game, 0).length, 0);
});

test('a clue never observes buildings at its origin and repeated hits do not move it', () => {
  const { game, viewer, enemy, vision } = world({ highGrounds: [{ x: 800, y: 800, r: 100, tier: 1 }] });
  enemy.x = 800; game.entities.push(tower(810, 800)); vision.update(game, true);
  vision.recordAttack(game, enemy, viewer, { x: 800, y: 800 });
  game.time = 1; enemy.x = 1200; enemy.y = 800;
  vision.recordAttack(game, enemy, viewer, { x: 800, y: 800 }); vision.update(game, true);
  const clues = vision.attackOrigins(game, 0);
  assert.equal(clues.length, 1); assert.equal(clues[0].expiresAt, 2.5); assert.equal(clues[0].x, 800);
  assert.equal(vision.structureObservations(game, 0).length, 0);
});

test('neutral objective observation does not change from a hidden death or respawn', () => {
  const { game, viewer, vision } = world();
  const camp = { id: 'dragon', name: '드래곤', type: 'monster', kind: 'dragon', team: 2, x: 900, y: 800, homeX: 900, homeY: 800, alive: true, respawnAt: 0 };
  game.entities.push(camp); vision.update(game, true);
  assert.equal(vision.objectiveObservation(game, camp.id, 0).alive, true);
  viewer.x = 60; viewer.y = 1540; vision.update(game, true);
  camp.alive = false; camp.respawnAt = 80; camp.deathAt = 2; game.time = 2; vision.update(game, true);
  assert.equal(vision.objectiveObservation(game, camp.id, 0).alive, true);
  viewer.x = 600; viewer.y = 800; vision.update(game, true);
  const absent = vision.objectiveObservation(game, camp.id, 0);
  assert.equal(absent.known, false); assert.equal(absent.presence, 'absent');
  assert.equal(Object.hasOwn(absent, 'respawnAt'), false);
  vision.recordObjectiveDeath(game, camp, 0);
  const dead = vision.objectiveObservation(game, camp.id, 0);
  assert.equal(dead.alive, false); assert.equal(dead.respawnAt, 80);
  viewer.x = 60; viewer.y = 1540; vision.update(game, true); camp.alive = true; game.time = 80; vision.update(game, true);
  assert.equal(vision.objectiveObservation(game, camp.id, 0).alive, false);
});

test('a visible empty camp home never exposes a monster killed behind a wall', () => {
  const { game, viewer, vision } = world({ obstacles: [{ x: 750, y: 800, r: 40 }] });
  const camp = { id: 'dragon', name: '드래곤', type: 'monster', kind: 'dragon', team: 2,
    x: 650, y: 800, homeX: 650, homeY: 800, alive: true, respawnAt: 0 };
  game.entities.push(camp); vision.update(game, true);
  assert.equal(vision.objectiveObservation(game, camp.id, 0).alive, true);
  camp.x = 850; game.time = 1; vision.update(game, true);
  const aliveBehindWall = vision.objectiveObservation(game, camp.id, 0);
  assert.equal(aliveBehindWall.known, false); assert.equal(aliveBehindWall.presence, 'absent');
  assert.equal(aliveBehindWall.visible, true);
  camp.alive = false; camp.deathAt = 1; camp.respawnAt = 86;
  vision.recordObjectiveDeath(game, camp, 1); vision.update(game, true);
  const deadBehindWall = vision.objectiveObservation(game, camp.id, 0);
  assert.deepEqual(deadBehindWall, aliveBehindWall);
  assert.equal(Object.hasOwn(deadBehindWall, 'alive'), false);
  assert.equal(Object.hasOwn(deadBehindWall, 'respawnAt'), false);
  assert.equal(vision.objectiveObservation(game, camp.id, 1).respawnAt, 86);
});

test('1, 1.5 and 2 maps keep 20-unit cells and independent traversable height geometry', () => {
  for (const scale of [1, 1.5, 2]) {
    const game = new Game({ mapScale: scale });
    const mask = game.getVisionMask(0);
    assert.equal(mask.cols, 80 * scale); assert.equal(mask.rows, 80 * scale); assert.equal(mask.cellSize, 20);
    assert.equal(game.visionProfile, PROFILE); assert.equal(game.map.highGrounds.length, 4);
    const hill = game.map.highGrounds[0];
    assert.equal(hill.x, 545 * scale); assert.equal(game.groundHeightAt(hill.x, hill.y), 1);
    assert.equal(game.navigation.isWalkable(hill.x, hill.y, 19), true);
  }
});

test('v9 save preserves 2x explored bits and frozen building snapshots exactly', () => {
  const game = new Game({ hero: 'lol_ahri', mapScale: 2 }).start();
  const building = game.entities.find(e => e.id === 'tower-1-mid-outer');
  game.player.x = building.x - 100; game.player.y = building.y + 100; refresh(game);
  const known = game.getStructureObservation(building.id, 0);
  assert.ok(known && known.visible);
  game.player.x = game.map.bases[0].x; game.player.y = game.map.bases[0].y; refresh(game);
  assert.equal(game.visibilityAt(building.x, building.y, 0), false);
  game.killEntity(building, null); refresh(game);
  assert.equal(game.getStructureObservation(building.id, 0).alive, true);
  const saved = game.exportState();
  assert.equal(saved.engineVersion, 9);
  assert.ok(saved.state._visionState.explored.flat().every(chunk => chunk.length <= 2048));
  const restored = Game.fromState(saved, { paused: false, clearInput: false });
  assert.deepEqual(restored.exportState(), saved);
  assert.deepEqual([...restored.getVisionMask(0).explored], [...game.getVisionMask(0).explored]);
  assert.equal(restored.getStructureObservation(building.id, 0).hp, known.hp);
  restored.player.x = building.x - 100; restored.player.y = building.y + 100; refresh(restored);
  assert.equal(restored.getStructureObservation(building.id, 0).alive, false);
});

test('an in-flight basic attack reveals its launch origin after the attacker moves', () => {
  const game = new Game({ hero: 'lol_garen', mapScale: 2 }).start();
  const enemy = game.entities.find(e => e.type === 'hero' && e.team === 1 && e.hero === 'lol_ahri');
  enemy.x = 1090; enemy.y = 1330; game.player.x = 1090; game.player.y = 1610; refresh(game);
  assert.equal(game.isVisible(enemy, 0), false);
  game._releaseAttack(enemy, game.player);
  enemy.x = 2000; enemy.y = 1000;
  game._updateProjectiles(0.5);
  const clue = game.getAttackOriginReveals(0)[0];
  assert.ok(clue); assert.equal(clue.x, 1090); assert.equal(clue.y, 1330);
  assert.equal(game.getFocusTarget(), null);
  assert.equal(game.setFocusTarget(enemy.id).ok, false);
  const restored = Game.fromState(game.exportState(), { paused: false, clearInput: false });
  assert.deepEqual(restored.getAttackOriginReveals(0), game.getAttackOriginReveals(0));
});

test('hidden enemy building destruction leaves its remembered state and log unchanged', () => {
  const game = new Game({ mapScale: 2 }).start();
  const building = game.entities.find(e => e.id === 'tower-1-mid-outer');
  game.player.x = building.x - 100; game.player.y = building.y + 100; refresh(game);
  game.player.x = game.map.bases[0].x; game.player.y = game.map.bases[0].y; refresh(game);
  const events = game.events.length;
  game.killEntity(building, null); refresh(game);
  assert.equal(game.events.length, events);
  assert.equal(game.getStructureObservation(building.id, 0).alive, true);
  assert.equal(game.isVisible(building, 0), false);
});

test('unknown objectives allow scouting without exposing their hidden alive value', () => {
  const game = new Game({ mapScale: 2 }).start();
  const dragon = game.entities.find(e => e.id === 'dragon');
  assert.equal(game.getObjectiveObservation('dragon', 0).known, false);
  assert.equal(game.setTeamOrder('dragon').ok, true);
  assert.ok(game.order);
  dragon.alive = false; dragon.hp = 0; dragon.respawnAt = 999;
  game._validateObjectiveOrder();
  assert.ok(game.order, 'Unseen authoritative changes must not cancel a scouting order');
  assert.equal(Object.hasOwn(game.getObjectiveObservation('dragon', 0), 'alive'), false);
});

test('visibility query APIs preserve exportState and callers cannot alter remembered HP', () => {
  const game = new Game({ hero: 'lol_lux' }).start();
  const before = game.exportState();
  game.getVisionMask(0); game.getVisionMask(1); game.getAttackOriginReveals(0);
  const structures = game.getStructureObservations(0); game.getObjectiveObservation('dragon', 0);
  assert.ok(structures.length); structures[0].hp = -999;
  assert.deepEqual(game.exportState(), before);
});

test('v9 rejects malformed explored data, future observations and invalid attack origins', () => {
  const game = new Game({ hero: 'lol_ahri', mapScale: 2 }).start();
  const saved = game.exportState();
  for (const change of [
    s => { s.state._visionState.explored[0][0] = 'z'; },
    s => { s.state._visionState.structures[0][0].observedAt = 10; },
    s => { s.state._visionState.structures[0][0].hp = -1; },
    s => { s.state._visionState.profile = 'ignore-walls'; },
    s => { s.state._visionState.reveals.push({ id: 'origin-1', team: 0, sourceId: 'enemy', x: 4000, y: 10, radius: 76, createdAt: 0, expiresAt: 1.5 }); }
  ]) {
    const invalid = structuredClone(saved); change(invalid);
    assert.throws(() => Game.fromState(invalid), /vision knowledge/);
  }
  assert.equal(validateState(saved.state._visionState, game.map, game.time), true);
});
