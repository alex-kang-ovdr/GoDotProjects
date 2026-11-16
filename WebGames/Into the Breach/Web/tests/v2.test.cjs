'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');
const C = require('../dist/campaign.js');

const clone = value => JSON.parse(JSON.stringify(value));
const live = unit => unit && unit.hp > 0 && unit.x >= 0 && unit.y >= 0;
const cell = (state, x, y) => state.tiles[y * 8 + x];
const byId = (state, id) => state.units.find(unit => unit.id === id);
const players = state => state.units.filter(unit => unit.team === 'player');
const success = result => {
  assert.equal(result.error, null, result.error || 'transition failed');
  return result.state;
};

function fixture(squad = 'rift') {
  const state = E.createRun({ squad, difficulty: 'normal', seed: 'v2-fixture' });
  state.phase = 'player';
  state.turn = 1;
  state.turnLimit = 4;
  state.spawn = [];
  state.hazards = [];
  state.tiles = Array.from({ length: 64 }, () => ({
    type: 'ground', hp: 0, maxHp: 0, fire: false, smoke: false,
    acid: false, objective: false, frozen: false, shield: false, item: null
  }));
  state.units = players(state).map((unit, i) => ({
    ...unit, x: 1 + i * 2, y: 6, hp: unit.maxHp, moved: false, acted: false,
    fire: false, frozen: false, shield: false, acid: false, intent: null
  }));
  return state;
}

function enemy(state, id, x, y, options = {}) {
  const kind = options.kind || 'scorpion';
  const def = E.UNIT_DEFS[kind];
  const unit = {
    ...clone(def), id, kind, team: 'enemy', x, y, hp: 8, maxHp: 8,
    moved: false, acted: false, fire: false, frozen: false, shield: false,
    acid: false, intent: null, order: state.units.filter(u => u.team === 'enemy').length + 1,
    upgrades: { damage: 0, move: 0, hp: 0 }, secondary: null, pilot: null,
    alpha: false, exploded: false, ...options
  };
  state.units.push(unit);
  return unit;
}

function setTile(state, x, y, type, hp = 0) {
  Object.assign(cell(state, x, y), { type, hp, maxHp: hp });
}

const attack = (state, id, x, y, slot = 'primary') =>
  E.command(state, { type: 'attack', unitId: id, x, y, slot });
const intent = (attackKind, dx, dy, damage = 1) => ({ attackKind, dx, dy, damage, canceled: false });

function settleQuietly(state) {
  let next = state.phase === 'deploy' ? success(E.beginBattle(state)) : clone(state);
  next.units = next.units.filter(unit => unit.team !== 'enemy');
  next.spawn = [];
  next.hazards = [];
  next.turn = next.turnLimit;
  return success(E.endTurn(next));
}

function assertRejected(state, action) {
  const before = clone(state);
  const result = E.command(state, action);
  assert.ok(result.error, JSON.stringify(action));
  assert.deepEqual(result.state, before);
  assert.deepEqual(state, before);
  assert.deepEqual(result.events, []);
}

test('V2 creates all three deterministic squads with pilots and charged equipment', () => {
  for (const squad of ['rift', 'control', 'gravity']) {
    const options = { squad, difficulty: 'normal', seed: 20261114 };
    const state = E.createRun(options);
    assert.equal(state.schema, 2);
    assert.deepEqual(state, E.createRun(options));
    assert.deepEqual(players(state).map(unit => unit.kind), E.SQUADS[squad].units);
    assert.equal(new Set(players(state).map(unit => unit.pilot.id)).size, 3);
    for (const unit of players(state)) {
      assert.equal(unit.secondary.charges, 1);
      assert.equal(unit.secondary.maxCharges, 1);
      assert.equal(unit.pilot.xp, 0);
    }
  }
});

test('invalid secondary slots and targets preserve HP, resources, actions, and charges', () => {
  const state = fixture();
  for (const action of [
    { type: 'attack', unitId: 'mech-1', slot: 'unknown', x: 1, y: 6 },
    { type: 'attack', unitId: 'mech-1', slot: 'secondary', x: 2, y: 6 },
    { type: 'attack', unitId: 'mech-3', slot: 'secondary', x: 5, y: 0 },
    { type: 'attack', unitId: 'mech-2', slot: 'secondary', x: -1, y: 6 },
    { type: 'attack', unitId: 'unknown', slot: 'secondary', x: 0, y: 0 }
  ]) assertRejected(state, action);
});

test('getMovePath returns a contiguous legal route and traversal applies intermediate terrain', () => {
  const state = fixture();
  const unit = byId(state, 'mech-1');
  unit.x = 0; unit.y = 0;
  cell(state, 1, 0).fire = true;
  cell(state, 1, 0).acid = true;
  const before = clone(state);
  const path = E.getMovePath(state, unit.id, 2, 0);
  assert.deepEqual(path, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(state, before);
  const result = E.command(state, { type: 'move', unitId: unit.id, x: 2, y: 0 });
  const after = success(result);
  assert.deepEqual(result.events.find(event => event.type === 'move').path, path);
  assert.equal(byId(after, unit.id).fire, true, 'crossing fire ignites a ground mech');
  assert.equal(byId(after, unit.id).acid, true, 'crossing acid carries it to the destination');
  assert.deepEqual(E.getMovePath(after, unit.id, 3, 0), [], 'already moved units have no second route');
});

test('flying movement crosses mountains and hostile occupancy without ending on either', () => {
  const state = fixture('control');
  const unit = byId(state, 'mech-2');
  unit.x = 0; unit.y = 0; unit.move = 3;
  setTile(state, 1, 0, 'mountain', 2);
  enemy(state, 'blocker', 2, 0);
  const path = E.getMovePath(state, unit.id, 3, 0);
  assert.equal(path.length, 4);
  assert.deepEqual(path[0], { x: 0, y: 0 });
  assert.deepEqual(path.at(-1), { x: 3, y: 0 });
  assert.ok(!E.getMoves(state, unit.id).some(p => p.x === 1 && p.y === 0));
  assert.ok(!E.getMoves(state, unit.id).some(p => p.x === 2 && p.y === 0));
  assert.equal(byId(success(E.command(state, { type: 'move', unitId: unit.id, x: 3, y: 0 })), unit.id).x, 3);
});

test('repulse pushes four neighbors without direct damage and is spent for the whole mission', () => {
  let state = fixture();
  const unit = byId(state, 'mech-1');
  unit.x = 3; unit.y = 3;
  for (const [id, x, y] of [['n', 3, 2], ['e', 4, 3], ['s', 3, 4], ['w', 2, 3]]) enemy(state, id, x, y);
  const original = clone(state);
  const result = attack(state, unit.id, 3, 3, 'secondary');
  assert.deepEqual(state, original);
  state = success(result);
  for (const [id, x, y] of [['n', 3, 1], ['e', 5, 3], ['s', 3, 5], ['w', 1, 3]]) {
    assert.deepEqual([byId(state, id).x, byId(state, id).y], [x, y]);
    assert.equal(byId(state, id).hp, 8);
  }
  assert.equal(byId(state, unit.id).secondary.charges, 0);
  assert.equal(byId(state, unit.id).acted, true);
  state = success(E.endTurn(state));
  assert.equal(byId(state, unit.id).secondary.charges, 0);
  assert.deepEqual(E.getTargets(state, unit.id, 'secondary'), []);
  assertRejected(state, { type: 'attack', unitId: unit.id, slot: 'secondary', x: 3, y: 3 });
});

test('a projected building shield absorbs exactly one incoming hit', () => {
  let state = fixture();
  const source = byId(state, 'mech-3'); source.x = 3; source.y = 5;
  setTile(state, 3, 3, 'building', 2);
  enemy(state, 'attacker-a', 3, 2, { intent: intent('melee', 0, 1), order: 1 });
  enemy(state, 'attacker-b', 2, 3, { intent: intent('melee', 1, 0), order: 2 });
  state = success(attack(state, source.id, 3, 3, 'secondary'));
  assert.equal(cell(state, 3, 3).shield, true);
  const grid = state.grid;
  state = success(E.endTurn(state));
  assert.equal(cell(state, 3, 3).shield, false);
  assert.equal(cell(state, 3, 3).hp, 1);
  assert.equal(state.grid, grid - 1);
});

test('acid stops at the first blocker, deals no immediate damage, and amplifies a later hit', () => {
  let state = fixture();
  const source = byId(state, 'mech-2'); source.x = 3; source.y = 6;
  const punch = byId(state, 'mech-1'); punch.x = 2; punch.y = 3;
  enemy(state, 'front', 3, 3);
  enemy(state, 'back', 3, 1);
  state = success(attack(state, source.id, 3, 1, 'secondary'));
  assert.equal(byId(state, 'front').hp, 8);
  assert.equal(byId(state, 'front').acid, true);
  assert.equal(byId(state, 'back').acid, false);
  assert.equal(cell(state, 3, 3).acid, true);
  state = success(attack(state, punch.id, 3, 3));
  assert.equal(byId(state, 'front').hp, 8 - punch.damage * 2);
});

test('pull moves the first distant unit toward the source and cannot penetrate a building', () => {
  let state = fixture('gravity');
  const source = byId(state, 'mech-2'); source.x = 3; source.y = 6;
  enemy(state, 'front', 3, 3);
  enemy(state, 'back', 3, 1);
  state = success(attack(state, source.id, 3, 1));
  assert.deepEqual([byId(state, 'front').x, byId(state, 'front').y], [3, 4]);
  assert.equal(byId(state, 'front').hp, 8);
  assert.equal(byId(state, 'back').y, 1);
  const blocked = fixture('gravity');
  const blockedSource = byId(blocked, 'mech-2'); blockedSource.x = 3; blockedSource.y = 6;
  setTile(blocked, 3, 4, 'building', 2);
  enemy(blocked, 'hidden', 3, 2);
  assert.ok(!E.getTargets(blocked, blockedSource.id).some(p => p.x === 3 && p.y < 6));
  assertRejected(blocked, { type: 'attack', unitId: blockedSource.id, x: 3, y: 2 });
});

test('laser pierces allies, enemies, and buildings but stops after damaging a mountain', () => {
  const state = fixture('gravity');
  const source = byId(state, 'mech-3'); source.x = 0; source.y = 3;
  const friend = byId(state, 'mech-1'); friend.x = 1; friend.y = 3;
  enemy(state, 'front', 2, 3);
  setTile(state, 3, 3, 'building', 2);
  setTile(state, 4, 3, 'mountain', 1);
  enemy(state, 'back', 5, 3);
  const after = success(attack(state, source.id, 7, 3));
  assert.equal(byId(after, friend.id).hp, friend.hp - source.damage);
  assert.equal(byId(after, 'front').hp, 8 - source.damage);
  assert.equal(cell(after, 3, 3).hp, 2 - source.damage);
  assert.equal(after.grid, state.grid - source.damage);
  assert.equal(cell(after, 4, 3).type, 'ground');
  assert.equal(byId(after, 'back').hp, 8, 'a mountain stops the current beam even if destroyed');
});

test('a living spider blocks movement but can be dislodged to free its target', () => {
  let state = fixture();
  const trapped = byId(state, 'mech-1'); trapped.x = 3; trapped.y = 3;
  const gunner = byId(state, 'mech-2'); gunner.x = 0; gunner.y = 2;
  enemy(state, 'spider', 3, 2, { kind: 'spider', intent: { ...intent('melee', 0, 1), webX: 3, webY: 2, webTargetId: trapped.id } });
  assert.deepEqual(E.getWebbedBy(state, trapped.id), ['spider']);
  assert.deepEqual(E.getMoves(state, trapped.id), []);
  assert.ok(E.getTargets(state, trapped.id).length > 0, 'webbing does not consume the action');
  state = success(attack(state, gunner.id, 3, 2));
  assert.deepEqual(E.getWebbedBy(state, trapped.id), []);
  assert.ok(E.getMoves(state, trapped.id).length > 0);
  assert.equal(byId(state, 'spider').intent.webReleased, true);
});

test('volatile deaths chain once each and use the original death coordinates', () => {
  const state = fixture();
  const attacker = byId(state, 'mech-1'); attacker.x = 2; attacker.y = 3;
  enemy(state, 'bomb-a', 3, 3, { kind: 'volatile', hp: 1 });
  enemy(state, 'bomb-b', 4, 3, { kind: 'volatile', hp: 1 });
  setTile(state, 5, 3, 'building', 2);
  const result = attack(state, attacker.id, 3, 3);
  const after = success(result);
  assert.equal(byId(after, 'bomb-a').hp, 0);
  assert.equal(byId(after, 'bomb-b').hp, 0);
  assert.equal(byId(after, attacker.id).hp, attacker.hp - 1);
  assert.equal(cell(after, 5, 3).hp, 1);
  assert.equal(after.stats.kills, state.stats.kills + 2);
  assert.equal(result.events.filter(event => event.type === 'explosion').length, 2);
  assert.equal(new Set(result.events.filter(event => event.type === 'death').map(event => event.unitId)).size, 2);
});

test('leader cleave damages both announced cells rather than stopping at the first unit', () => {
  const state = fixture();
  const player = byId(state, 'mech-1'); player.x = 3; player.y = 2;
  enemy(state, 'leader', 3, 1, { kind: 'leader', intent: intent('line2', 0, 1, 2) });
  setTile(state, 3, 3, 'building', 2);
  assert.deepEqual(E.threats(state).find(threat => threat.unitId === 'leader').targets, [{ x: 3, y: 2 }, { x: 3, y: 3 }]);
  const after = success(E.endTurn(state));
  assert.equal(byId(after, player.id).hp, player.hp - 2);
  assert.equal(after.grid, state.grid - 2);
  assert.equal(cell(after, 3, 3).type, 'ground');
});

function legacySave(phase = 'player') {
  let state = E.createRun({ squad: 'rift', difficulty: 'normal', seed: 'legacy-preservation' });
  state = success(E.beginBattle(state));
  state = success(E.command(state, { type: 'move', unitId: 'mech-1', ...E.getMoves(state, 'mech-1')[0] }));
  state = success(E.endTurn(state));
  if (phase === 'reward') state = settleQuietly(state);
  state.schema = 1;
  delete state.hazards; delete state.history;
  for (const key of ['operationId', 'objectives', 'protectedTiles', 'completed', 'rewardClaimed', 'rewardBreakdown', 'rewardReport', 'risk', 'hazardKind', 'enemyPool', 'alphaChance', 'baseReward', 'bonusCores']) delete state.mission[key];
  for (const tile of state.tiles) { delete tile.shield; delete tile.item; }
  for (const unit of state.units) { delete unit.secondary; delete unit.pilot; delete unit.alpha; delete unit.exploded; }
  for (const stats of [state.stats, state.runStats]) for (const key of ['pods', 'podsLost', 'leaderKills']) delete stats[key];
  return state;
}

test('a V1 save migrates without rerolling or replacing the live board, actions, intents, and turn', () => {
  const old = legacySave();
  const before = clone(old);
  assert.equal(E.validateState(old).valid, true);
  const migrated = E.migrateState(old);
  assert.equal(migrated.error, null);
  assert.equal(migrated.state.schema, 2);
  assert.deepEqual(old, before);
  for (const key of ['seed', 'rng', 'phase', 'turn', 'turnLimit', 'missionIndex', 'grid', 'cores', 'spawn']) assert.deepEqual(migrated.state[key], old[key], key);
  for (let index = 0; index < old.tiles.length; index += 1) {
    for (const key of Object.keys(old.tiles[index])) assert.deepEqual(migrated.state.tiles[index][key], old.tiles[index][key], `tile ${index}.${key}`);
  }
  for (const unit of old.units) {
    const restored = byId(migrated.state, unit.id);
    for (const key of Object.keys(unit)) assert.deepEqual(restored[key], unit[key], `${unit.id}.${key}`);
  }
  assert.deepEqual(migrated.state.hazards, [], 'migration does not introduce a new hazard during an existing battle');
  assert.ok(players(migrated.state).every(unit => unit.pilot.xp === 0), 'no retroactive perk changes');
  assert.equal(E.validateState(migrated.state).valid, true);
  assert.deepEqual(E.migrateState(migrated.state).state, migrated.state);
});

test('migration of an already rewarded V1 save does not pay cores or pilot XP again', () => {
  const old = legacySave('reward');
  const migrated = E.migrateState(old);
  assert.equal(migrated.error, null);
  const state = migrated.state;
  assert.equal(state.cores, old.cores);
  assert.equal(state.mission.rewardClaimed, true);
  assert.equal(state.mission.rewardBreakdown.total, old.mission.reward);
  assert.ok(E.endTurn(state).error);
  const next = success(E.nextMission(state));
  assert.equal(next.cores, old.cores);
  assert.ok(players(next).every(unit => unit.pilot.xp === 0));
});

test('a genuine published-V1 mid-combat fixture restores without changing the saved battle', () => {
  // Generated by the original engine at commit
  // 7bcedb4b86cb5488d800393877508254bcf03c33, not by removing V2 fields.
  const envelope = clone(require('./fixtures/v1-mid-combat.json'));
  const before = clone(envelope);
  assert.equal(envelope.state.rng, 1395053160);
  assert.equal(envelope.resetsLeft, 0);
  for (const key of ['state', 'turnSnapshot']) {
    const old = envelope[key];
    assert.equal(old.schema, 1);
    assert.equal(E.validateState(old).valid, true);
    const result = E.migrateState(old);
    assert.equal(result.error, null);
    assert.equal(E.validateState(result.state).valid, true);
    for (const field of ['seed', 'rng', 'turn', 'turnLimit', 'phase', 'grid', 'cores', 'spawn', 'missionIndex']) {
      assert.deepEqual(result.state[field], old[field], `${key}.${field}`);
    }
    for (const unit of old.units) {
      const restored = byId(result.state, unit.id);
      for (const field of ['x', 'y', 'hp', 'maxHp', 'move', 'damage', 'moved', 'acted', 'fire', 'frozen', 'acid', 'intent', 'order', 'upgrades']) {
        assert.deepEqual(restored[field], unit[field], `${key}.${unit.id}.${field}`);
      }
    }
    for (let tile = 0; tile < 64; tile += 1) {
      for (const field of Object.keys(old.tiles[tile])) assert.deepEqual(result.state.tiles[tile][field], old.tiles[tile][field]);
    }
    assert.deepEqual(E.threats(result.state), E.threats(old));
    assert.deepEqual(E.forecast(result.state).state, E.endTurn(result.state).state);
  }
  assert.deepEqual(envelope, before, 'migration does not mutate the saved envelope or reset budget');
});

test('validation and migration reject corrupted saves without throwing or mutating them', () => {
  const corruptions = [
    ['unsupported schema', s => { s.schema = 99; }],
    ['missing tile', s => { s.tiles.pop(); }],
    ['duplicate occupancy', s => { s.units[1].x = s.units[0].x; s.units[1].y = s.units[0].y; }],
    ['duplicate id', s => { s.units[1].id = s.units[0].id; }],
    ['HP overflow', s => { s.units[0].hp = s.units[0].maxHp + 1; }],
    ['negative charge', s => { s.units[0].secondary.charges = -1; }],
    ['unknown gear', s => { s.units[0].secondary.id = '__proto__'; }],
    ['unknown pilot', s => { s.units[0].pilot.id = 'unregistered'; }],
    ['corrupt perk ledger', s => { s.units[0].pilot.applied = 'not-an-object'; }],
    ['nonboolean applied perk', s => { s.units[0].pilot.applied.scoutMove = 'yes'; }],
    ['invalid RNG', s => { s.rng = -1; }],
    ['negative resources', s => { s.cores = -1; }],
    ['out of bounds spawn', s => { s.spawn = [{ x: 8, y: 0, kind: 'scorpion' }]; }],
    ['invalid hazard', s => { s.hazards = [{ x: 0, y: 99, kind: 'storm', damage: 1 }]; }],
    ['invalid hazard container', s => { s.hazards = {}; }],
    ['invalid direction', s => { s.units.find(unit => unit.team === 'enemy').intent.dx = 2; }]
  ];
  for (const [label, corrupt] of corruptions) {
    const state = E.createRun({ seed: 78 }); corrupt(state);
    const before = clone(state);
    let result;
    assert.doesNotThrow(() => { result = E.validateState(state); }, label);
    assert.equal(result.valid, false, label);
    assert.ok(result.errors.length > 0, label);
    assert.doesNotThrow(() => { result = E.migrateState(state); }, label);
    assert.ok(result.error, label);
    assert.equal(result.state, null, label);
    assert.deepEqual(state, before, label);
  }
  for (const value of [null, [], {}, 17, 'save']) {
    assert.equal(E.validateState(value).valid, false);
    assert.ok(E.migrateState(value).error);
  }
  const old = legacySave(); old.hazards = {};
  assert.doesNotThrow(() => E.validateState(old), 'optional corrupt V1 fields must not crash validation');
  assert.equal(E.validateState(old).valid, false);
});

test('equipment replacement costs two cores, is limited to reward, and refills next mission', () => {
  let state = fixture();
  const mech = byId(state, 'mech-1');
  assert.ok(E.equipSecondary(state, mech.id, 'acid').error);
  state = success(attack(state, mech.id, mech.x, mech.y, 'secondary'));
  assert.equal(byId(state, mech.id).secondary.charges, 0);
  state = settleQuietly(state);
  const before = clone(state);
  for (const [id, gear] of [[mech.id, 'repulse'], ['unknown', 'acid'], [mech.id, 'invalid']]) {
    const rejected = E.equipSecondary(state, id, gear);
    assert.ok(rejected.error);
    assert.deepEqual(rejected.state, state);
  }
  const swapped = success(E.equipSecondary(state, mech.id, 'acid'));
  assert.deepEqual(state, before);
  assert.equal(swapped.cores, before.cores - 2);
  assert.equal(byId(swapped, mech.id).weapon, mech.weapon);
  assert.equal(byId(swapped, mech.id).secondary.id, 'acid');
  const next = success(E.nextMission(state));
  assert.equal(byId(next, mech.id).secondary.charges, 1);
  assert.equal(byId(next, mech.id).secondary.id, 'repulse');
  const poor = { ...state, cores: 1 };
  assert.ok(E.equipSecondary(poor, mech.id, 'acid').error);
});

test('movement collects a pod once and mission settlement pays it once', () => {
  let state = fixture();
  const mech = byId(state, 'mech-1');
  cell(state, 1, 5).item = 'pod';
  const cores = state.cores;
  state = success(E.command(state, { type: 'move', unitId: mech.id, x: 1, y: 5 }));
  assert.equal(cell(state, 1, 5).item, null);
  assert.equal(state.stats.pods, 1);
  assert.equal(state.cores, cores, 'collection is paid at settlement');
  state.turn = state.turnLimit;
  const before = clone(state);
  const forecast = E.forecast(state);
  assert.deepEqual(state, before);
  const actual = E.endTurn(state, { trace: true });
  assert.deepEqual(forecast.state, actual.state);
  state = success(actual);
  const report = state.mission.rewardBreakdown;
  assert.equal(report.pods, 1);
  assert.equal(report.details.reduce((total, item) => total + item.cores, 0), report.total);
  assert.equal(state.cores, cores + report.total);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].report.total, report.total);
  assert.ok(players(state).every(unit => unit.pilot.xp === 1));
  const rejected = E.endTurn(state);
  assert.ok(rejected.error);
  assert.deepEqual(rejected.state, state);
  assert.deepEqual(E.migrateState(state).state, state, 'save restore does not settle again');
});

test('destroying a pod removes its collection reward and records the loss', () => {
  const state = fixture();
  const mech = byId(state, 'mech-3'); mech.x = 3; mech.y = 6;
  byId(state, 'mech-2').x = 7;
  cell(state, 3, 3).item = 'pod';
  const after = success(attack(state, mech.id, 3, 3));
  assert.equal(cell(after, 3, 3).item, null);
  assert.equal(after.stats.pods, 0);
  assert.equal(after.stats.podsLost, 1);
  const reward = settleQuietly(after);
  assert.equal(reward.mission.rewardBreakdown.pods, 0);
});

test('branch choices reject wrong stages and preserve the selected operation through play', () => {
  const state = settleQuietly(fixture());
  const before = clone(state);
  const choices = E.getMissionChoices(state);
  assert.deepEqual(choices.map(choice => choice.id), ['forest_relay', 'forest_salvage']);
  assert.deepEqual(state, before);
  for (const invalid of ['not-an-operation', 'hive', 'coast', '__proto__']) {
    const rejected = E.nextMission(state, invalid);
    assert.ok(rejected.error, invalid);
    assert.deepEqual(rejected.state, state);
  }
  const next = success(E.nextMission(state, 'forest_salvage'));
  assert.equal(next.mission.operationId, 'forest_salvage');
  assert.equal(next.missionIndex, 1);
  assert.equal(next.phase, 'deploy');
  assert.ok(next.tiles.some(tile => tile.item === 'pod'));
  assert.equal(next.hazards.length, 2);
  assert.equal(success(E.beginBattle(next)).mission.operationId, 'forest_salvage');
});

test('fire and environment kill queued attackers before enemies and reinforcements resolve', () => {
  const state = fixture();
  enemy(state, 'burning', 2, 2, { hp: 1, fire: true, order: 1, intent: intent('melee', 0, 1) });
  enemy(state, 'bombarded', 4, 2, { hp: 2, order: 2, intent: intent('melee', 0, 1) });
  setTile(state, 2, 3, 'building', 2); setTile(state, 4, 3, 'building', 2);
  state.hazards = [{ x: 4, y: 2, kind: 'airstrike', damage: 2, label: 'test airstrike' }];
  state.spawn = [{ x: 6, y: 1, kind: 'scorpion', alpha: false }];
  const before = clone(state);
  const result = E.endTurn(state, { trace: true });
  const after = success(result);
  assert.deepEqual(state, before);
  assert.equal(after.grid, state.grid);
  assert.equal(byId(after, 'burning').hp, 0);
  assert.equal(byId(after, 'bombarded').hp, 0);
  assert.equal(result.events.filter(event => event.type === 'enemyAttack').length, 0);
  const environment = result.events.findIndex(event => event.type === 'environment');
  const burned = result.events.findIndex(event => event.type === 'death' && event.unitId === 'burning');
  const spawned = result.events.findIndex(event => event.type === 'spawn');
  assert.ok(burned >= 0 && burned < environment && environment < spawned);
  assert.deepEqual(result.frames.at(-1).state, after);
  assert.deepEqual(E.forecast(state).state, after);
  assert.deepEqual(E.endTurn(state).state, after);
  assert.deepEqual(result.frames.flatMap(frame => frame.events), result.events);
});

test('tide removes ground enemies and cancels their queued attack without harming a flying mech', () => {
  const state = fixture('control');
  const flyer = byId(state, 'mech-2'); flyer.x = 4; flyer.y = 3;
  enemy(state, 'drowned', 2, 2, { intent: intent('melee', 0, 1) });
  setTile(state, 2, 3, 'building', 2);
  state.hazards = [
    { x: 2, y: 2, kind: 'tide', damage: 0 },
    { x: 4, y: 3, kind: 'tide', damage: 0 }
  ];
  const after = success(E.endTurn(state));
  assert.equal(byId(after, 'drowned').hp, 0);
  assert.equal(after.grid, state.grid);
  assert.equal(byId(after, flyer.id).hp, flyer.hp);
  assert.equal(cell(after, 4, 3).type, 'water');
  assert.ok(E.getTargets(after, flyer.id).length > 0);
});

test('alpha reinforcements retain their extra HP, damage, and visible alpha flag', () => {
  const state = fixture();
  state.spawn = [{ x: 6, y: 1, kind: 'firefly', alpha: true }];
  const result = E.endTurn(state);
  const after = success(result);
  const unit = after.units.find(unit => unit.team === 'enemy');
  assert.equal(unit.alpha, true);
  assert.equal(unit.maxHp, E.UNIT_DEFS.firefly.hp + 1);
  assert.equal(unit.damage, E.UNIT_DEFS.firefly.damage + 1);
  assert.equal(unit.intent.damage, unit.damage);
});

test('pilot rank perks apply once at mission start and survive schema2 reloads', () => {
  let state = E.createRun({ squad: 'rift', difficulty: 'normal', seed: 45 });
  const original = players(state).map(unit => ({ hp: unit.maxHp, move: unit.move }));
  for (let completed = 1; completed <= 4; completed += 1) {
    state = settleQuietly(state);
    assert.ok(players(state).every(unit => unit.pilot.xp === completed));
    state = success(E.nextMission(state));
    const copyBefore = clone(state);
    state = E.migrateState(state).state;
    assert.deepEqual(state, copyBefore);
    assert.equal(byId(state, 'mech-3').move, original[2].move + (completed >= 2 ? 1 : 0));
    assert.equal(byId(state, 'mech-1').shield, completed >= 2);
    for (let index = 0; index < 3; index += 1) assert.equal(players(state)[index].maxHp, original[index].hp + (completed >= 4 ? 1 : 0));
  }
  assert.equal(state.missionIndex, 4);
  assert.equal(byId(state, 'mech-3').pilot.rank, 2);
});

test('rank1 engineer repair heals two while veteran carryover is capped at XP4', () => {
  const veteran = E.createRun({ squad: 'gravity', difficulty: 'normal', seed: 51, veteran: { id: 'engineer', xp: 999 } });
  const unit = byId(veteran, 'mech-1');
  assert.equal(unit.pilot.id, 'engineer');
  assert.equal(unit.pilot.xp, 4);
  assert.equal(unit.pilot.rank, 2);
  assert.equal(unit.maxHp, E.UNIT_DEFS.combat.hp + 1);
  assert.equal(new Set(players(veteran).map(unit => unit.pilot.id)).size, 3);
  let state = success(E.beginBattle(veteran));
  byId(state, unit.id).hp = 1;
  state = success(E.command(state, { type: 'repair', unitId: unit.id }));
  assert.equal(byId(state, unit.id).hp, 3);
  const invalid = E.createRun({ veteran: { id: 'unknown', xp: 999 }, seed: 51 });
  assert.ok(players(invalid).every(mech => mech.pilot.xp === 0));
});

test('secondary previews and trace settlement do not mutate nested charge, pilot, or history data', () => {
  const state = fixture();
  state.turn = state.turnLimit;
  const unit = byId(state, 'mech-1');
  const command = { type: 'attack', unitId: unit.id, x: unit.x, y: unit.y, slot: 'secondary' };
  const before = clone(state);
  const preview = E.preview(state, command);
  assert.equal(preview.error, null);
  assert.deepEqual(state, before);
  assert.deepEqual(preview.state, E.command(state, command).state);
  const future = E.endTurn(preview.state, { trace: true });
  assert.deepEqual(state, before);
  assert.equal(byId(state, unit.id).secondary.charges, 1);
  assert.equal(byId(state, unit.id).pilot.xp, 0);
  assert.equal(state.history.length, 0);
  assert.equal(byId(future.state, unit.id).secondary.charges, 0);
  assert.equal(byId(future.state, unit.id).pilot.xp, 1);
  assert.equal(future.state.history.length, 1);
  assert.deepEqual(future.frames.at(-1).state, future.state);
});
