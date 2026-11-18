const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');

const copy = value => JSON.parse(JSON.stringify(value));
const at = (x, y) => y * 8 + x;
const alive = unit => unit.hp > 0 && unit.x >= 0 && unit.y >= 0;
const playerUnits = state => state.units.filter(unit => unit.team === 'player');
const enemies = state => state.units.filter(unit => unit.team === 'enemy' && alive(unit));
const begin = (options = {}) => {
  const result = E.beginBattle(E.createRun({ squad: 'rift', difficulty: 'easy', seed: 13579, ...options }));
  assert.equal(result.error, null);
  return result.state;
};
const ok = result => {
  assert.equal(result.error, null, result.error || 'operation failed');
  return result.state;
};

function assertInvariants(state) {
  assert.equal(state.tiles.length, 64, 'board has exactly 64 cells');
  assert.ok(Number.isFinite(state.grid));
  assert.ok(state.grid >= 0 && state.grid <= state.maxGrid, 'grid is in range');
  assert.ok(Number.isFinite(state.cores) && state.cores >= 0, 'core balance is valid');
  const occupied = new Set();
  const ids = new Set();
  for (const unit of state.units) {
    assert.ok(!ids.has(unit.id), `duplicate unit id ${unit.id}`);
    ids.add(unit.id);
    assert.ok(Number.isFinite(unit.hp) && Number.isFinite(unit.maxHp));
    assert.ok(unit.hp >= 0 && unit.hp <= unit.maxHp, `${unit.id} HP is in range`);
    if (!alive(unit)) continue;
    assert.ok(Number.isInteger(unit.x) && unit.x >= 0 && unit.x < 8);
    assert.ok(Number.isInteger(unit.y) && unit.y >= 0 && unit.y < 8);
    const key = `${unit.x},${unit.y}`;
    assert.ok(!occupied.has(key), `duplicate live occupancy ${key}`);
    occupied.add(key);
  }
}

test('same seed and options produce exactly the same initial state', () => {
  const options = { squad: 'rift', difficulty: 'normal', seed: 93142 };
  assert.deepEqual(E.createRun(options), E.createRun(options));
  assertInvariants(E.createRun(options));
});

test('both squads start with three unique, usable player units', () => {
  for (const squad of ['rift', 'control']) {
    const state = E.createRun({ squad, difficulty: 'normal', seed: 42 });
    const units = playerUnits(state);
    assert.equal(units.length, 3);
    assert.equal(new Set(units.map(unit => unit.id)).size, 3);
    assert.equal(state.phase, 'deploy');
    assert.ok(units.every(unit => unit.hp > 0 && unit.weapon));
    assertInvariants(ok(E.beginBattle(state)));
  }
});

test('deployment rejects off-board positions and preserves the original state', () => {
  const state = E.createRun({ squad: 'rift', difficulty: 'easy', seed: 5 });
  const before = copy(state);
  const result = E.deploy(state, playerUnits(state)[0].id, -1, 7);
  assert.ok(result.error);
  assert.deepEqual(state, before);
  assert.deepEqual(result.state, before);
});

test('deployment rejects overlapping another live unit', () => {
  const state = E.createRun({ squad: 'rift', difficulty: 'easy', seed: 5 });
  const [a, b] = playerUnits(state);
  const result = E.deploy(state, a.id, b.x, b.y);
  assert.ok(result.error);
  assert.deepEqual(result.state, state);
});

test('movement rejects off-board destinations and does not consume an action', () => {
  const state = begin();
  const before = copy(state);
  const result = E.command(state, { type: 'move', unitId: 'mech-1', x: 99, y: -1 });
  assert.ok(result.error);
  assert.deepEqual(state, before);
  assert.deepEqual(result.state, before);
});

test('a normal unit cannot move twice in the same turn', () => {
  let state = begin();
  const id = 'mech-1';
  const move = E.getMoves(state, id)[0];
  assert.ok(move, 'first mission gives the combat mech a legal move');
  state = ok(E.command(state, { type: 'move', unitId: id, ...move }));
  const unit = state.units.find(u => u.id === id);
  assert.equal(unit.moved, true);
  assert.equal(E.getMoves(state, id).length, 0);
  const result = E.command(state, { type: 'move', unitId: id, x: unit.x + 1, y: unit.y });
  assert.ok(result.error);
  assert.deepEqual(result.state, state);
});

test('an acted unit cannot spend another action or move', () => {
  let state = begin();
  state = ok(E.command(state, { type: 'wait', unitId: 'mech-1' }));
  assert.equal(state.units.find(unit => unit.id === 'mech-1').acted, true);
  assert.ok(E.command(state, { type: 'repair', unitId: 'mech-1' }).error);
  assert.equal(E.getMoves(state, 'mech-1').length, 0);
});

test('preview is immutable and agrees with committing the same command', () => {
  const state = begin();
  const before = copy(state);
  const move = E.getMoves(state, 'mech-1')[0];
  const command = { type: 'move', unitId: 'mech-1', ...move };
  const preview = E.preview(state, command);
  assert.equal(preview.error, null);
  assert.deepEqual(state, before);
  assert.deepEqual(preview.state, E.command(state, command).state);
  assert.notEqual(preview.state, state);
});

test('forecast does not change state or RNG and agrees with End Turn', () => {
  const state = begin();
  const before = copy(state);
  const prediction = E.forecast(state);
  assert.deepEqual(state, before);
  assert.deepEqual(prediction.state, E.endTurn(state).state);
  assert.deepEqual(E.forecast(state), prediction);
});

test('JSON save/restore retains all deterministic behavior', () => {
  const state = begin({ seed: 92510, squad: 'control' });
  const restored = JSON.parse(JSON.stringify(state));
  assert.deepEqual(E.threats(restored), E.threats(state));
  assert.deepEqual(E.forecast(restored), E.forecast(state));
  assert.deepEqual(E.endTurn(restored), E.endTurn(state));
});

test('unknown command and unit IDs fail without changing game state', () => {
  const state = begin();
  for (const command of [
    { type: 'unimplemented', unitId: 'mech-1' },
    { type: 'repair', unitId: 'no-such-unit' }
  ]) {
    const before = copy(state);
    const result = E.command(state, command);
    assert.ok(result.error);
    assert.deepEqual(state, before);
    assert.deepEqual(result.state, before);
  }
});

function fixture(squad = 'rift') {
  const state = E.createRun({ squad, difficulty: 'easy', seed: 12345 });
  state.phase = 'player';
  state.turn = 1;
  state.turnLimit = 4;
  state.spawn = [];
  state.tiles = Array.from({ length: 64 }, () => ({
    type: 'ground', hp: 0, maxHp: 0, fire: false, smoke: false,
    acid: false, objective: false, frozen: false
  }));
  state.units = playerUnits(state).map((unit, index) => ({
    ...unit, x: 1 + index * 2, y: 6, hp: unit.maxHp,
    moved: false, acted: false, fire: false, frozen: false,
    shield: false, acid: false, intent: null
  }));
  return state;
}

function enemy(state, id, x, y, overrides = {}) {
  const unit = {
    id, team: 'enemy', kind: 'scorpion', name: 'Test hostile',
    weapon: 'claw', x, y, hp: 8, maxHp: 8, move: 3, damage: 1,
    moved: false, acted: false, flying: false, armor: false,
    fire: false, frozen: false, shield: false, acid: false,
    intent: null, order: state.units.filter(u => u.team === 'enemy').length + 1,
    ...overrides
  };
  state.units.push(unit);
  return unit;
}

function tile(state, x, y, type, hp = 0) {
  state.tiles[at(x, y)] = { ...state.tiles[at(x, y)], type, hp, maxHp: hp };
}

const unitById = (state, id) => state.units.find(unit => unit.id === id);
const liveById = (state, id) => state.units.find(unit => unit.id === id && alive(unit));
const intent = (attackKind, dx, dy, damage = 1) => ({ attackKind, dx, dy, damage, canceled: false });

test('invalid attacks are rejected without spending the unit action', () => {
  const state = fixture();
  for (const target of [{ x: -1, y: 2 }, { x: 2, y: 5 }, { x: 1, y: 1 }]) {
    const before = copy(state);
    const result = E.command(state, { type: 'attack', unitId: 'mech-1', ...target });
    assert.ok(result.error, `invalid combat target ${JSON.stringify(target)}`);
    assert.deepEqual(result.state, before);
    assert.deepEqual(state, before);
  }
});

test('pushing into a mountain adds collision damage without changing occupancy', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  mech.x = 2; mech.y = 3;
  const victim = enemy(state, 'victim', 3, 3);
  tile(state, 4, 3, 'mountain', 2);
  const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 3, y: 3 }));
  const actual = liveById(after, victim.id);
  assert.equal(actual.hp, victim.hp - mech.damage - 1);
  assert.deepEqual({ x: actual.x, y: actual.y }, { x: 3, y: 3 });
  assertInvariants(after);
});

test('unit collision damages both units and does not chain-push the blocker', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  mech.x = 2; mech.y = 3;
  const victim = enemy(state, 'victim', 3, 3);
  const blocker = enemy(state, 'blocker', 4, 3);
  const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 3, y: 3 }));
  assert.equal(liveById(after, victim.id).hp, victim.hp - mech.damage - 1);
  assert.equal(liveById(after, blocker.id).hp, blocker.hp - 1);
  assert.equal(liveById(after, victim.id).x, 3);
  assert.equal(liveById(after, blocker.id).x, 4);
});

test('pushing a ground enemy into water defeats it regardless of remaining HP', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  mech.x = 2; mech.y = 3;
  enemy(state, 'victim', 3, 3, { hp: 99, maxHp: 99 });
  tile(state, 4, 3, 'water');
  const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 3, y: 3 }));
  assert.equal(liveById(after, 'victim'), undefined);
  assertInvariants(after);
});

test('artillery damages its center and pushes each cardinal neighbor outward', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-3');
  mech.x = 4; mech.y = 7;
  const center = enemy(state, 'center', 4, 3);
  enemy(state, 'north', 4, 2);
  enemy(state, 'east', 5, 3);
  enemy(state, 'south', 4, 4);
  enemy(state, 'west', 3, 3);
  enemy(state, 'diagonal', 3, 2);
  const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 4, y: 3 }));
  assert.equal(liveById(after, center.id).hp, center.hp - mech.damage);
  const expected = { north: [4, 1], east: [6, 3], south: [4, 5], west: [2, 3], diagonal: [3, 2] };
  for (const [id, [x, y]] of Object.entries(expected)) {
    const unit = liveById(after, id);
    assert.deepEqual([unit.x, unit.y], [x, y], id);
    assert.equal(unit.hp, 8, `${id} is pushed without splash damage`);
  }
  assertInvariants(after);
});

test('frozen enemy telegraph is canceled and its ice absorbs a direct hit', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  mech.x = 2; mech.y = 3;
  const victim = enemy(state, 'victim', 3, 3, { frozen: true, intent: intent('melee', 0, 1) });
  tile(state, 3, 4, 'building', 2);
  assert.equal(E.threats(state).find(threat => threat.unitId === victim.id).canceled, true);
  const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 3, y: 3 }));
  assert.equal(liveById(after, victim.id).hp, victim.hp);
  assert.equal(liveById(after, victim.id).frozen, false);
});

test('smoke suppresses an enemy attack without changing the predicted grid', () => {
  const state = fixture();
  enemy(state, 'smoked', 3, 2, { intent: intent('melee', 0, 1, 2) });
  state.tiles[at(3, 2)].smoke = true;
  tile(state, 3, 3, 'building', 2);
  assert.equal(E.threats(state).find(threat => threat.unitId === 'smoked').canceled, true);
  const after = ok(E.endTurn(state));
  assert.equal(after.grid, state.grid);
  assert.equal(after.tiles[at(3, 3)].hp, 2);
});

test('cannon projectile hits the first unit on its line', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-2');
  mech.x = 4; mech.y = 7;
  const front = enemy(state, 'front', 4, 4);
  const rear = enemy(state, 'rear', 4, 1);
  const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 4, y: 1 }));
  assert.equal(liveById(after, front.id).hp, front.hp - mech.damage);
  assert.equal(liveById(after, rear.id).hp, rear.hp);
  assert.equal(liveById(after, front.id).y, 3);
});

test('a mech can intercept an enemy projectile aimed at a building', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  mech.x = 4; mech.y = 3;
  enemy(state, 'shooter', 4, 1, { kind: 'firefly', intent: intent('projectile', 0, 1) });
  tile(state, 4, 5, 'building', 2);
  const after = ok(E.endTurn(state));
  assert.equal(after.grid, state.grid);
  assert.equal(after.tiles[at(4, 5)].hp, 2);
  assert.equal(liveById(after, mech.id).hp, mech.hp - 1);
});

test('an earlier enemy attack can kill a later attacker and cancel its action', () => {
  const state = fixture();
  enemy(state, 'first', 1, 2, { kind: 'firefly', order: 1, intent: intent('projectile', 1, 0, 2) });
  enemy(state, 'second', 3, 2, { kind: 'firefly', order: 2, hp: 1, intent: intent('projectile', 0, 1, 2) });
  tile(state, 3, 4, 'building', 2);
  const after = ok(E.endTurn(state));
  assert.equal(liveById(after, 'second'), undefined);
  assert.equal(after.grid, state.grid);
  assert.equal(after.tiles[at(3, 4)].hp, 2);
});

test('blocking an emergence tile deals one damage and prevents that enemy spawning', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  state.spawn = [{ x: mech.x, y: mech.y, kind: 'scorpion' }];
  const after = ok(E.endTurn(state));
  assert.equal(liveById(after, mech.id).hp, mech.hp - 1);
  assert.equal(enemies(after).length, 0);
  assertInvariants(after);
});

test('zero grid loses even when the attack occurs on the final mission turn', () => {
  const state = fixture();
  state.turn = state.turnLimit;
  state.grid = 1;
  enemy(state, 'attacker', 3, 2, { intent: intent('melee', 0, 1) });
  tile(state, 3, 3, 'building', 1);
  const after = ok(E.endTurn(state));
  assert.equal(after.grid, 0);
  assert.equal(after.phase, 'lost');
});

test('mission completion awards cores, and upgrades spend their stated cost', () => {
  let state = fixture();
  state.turn = state.turnLimit;
  const originalCores = state.cores;
  state = ok(E.endTurn(state));
  assert.equal(state.phase, 'reward');
  assert.ok(state.cores >= originalCores + 2);
  const id = 'mech-1';
  const cost = E.getUpgradeCost(state, id, 'hp');
  assert.ok(Number.isInteger(cost) && cost > 0);
  const before = copy(state);
  state = ok(E.upgrade(state, id, 'hp'));
  assert.equal(state.cores, before.cores - cost);
  assert.ok(unitById(state, id).maxHp > unitById(before, id).maxHp);
  assert.equal(unitById(state, id).hp, unitById(state, id).maxHp);
  const withoutCores = { ...copy(state), cores: 0 };
  assert.ok(E.upgrade(withoutCores, id, 'damage').error);
  assert.deepEqual(E.upgrade(withoutCores, id, 'damage').state, withoutCores);
});

test('each permanent upgrade has an enforced cap and cannot be bought during combat', () => {
  const combat = fixture();
  combat.cores = 1000;
  assert.ok(E.upgrade(combat, 'mech-1', 'damage').error);
  for (const stat of ['damage', 'move', 'hp']) {
    let state = fixture();
    state.turn = state.turnLimit;
    state = ok(E.endTurn(state));
    state.cores = 1000;
    let reachedCap = false;
    let purchases = 0;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const before = copy(state);
      const result = E.upgrade(state, 'mech-1', stat);
      if (result.error) {
        reachedCap = true;
        assert.deepEqual(result.state, before);
        break;
      }
      purchases += 1;
      assert.ok(result.state.cores < before.cores);
      state = result.state;
      assertInvariants(state);
    }
    assert.ok(purchases > 0, `${stat} is initially upgradeable`);
    assert.ok(reachedCap, `${stat} must reach its upgrade cap`);
  }
});

test('all five missions progress, restore disabled mechs, retain upgrades, and finish the campaign', () => {
  let state = E.createRun({ squad: 'rift', difficulty: 'easy', seed: 827 });
  let upgradedHp = null;
  for (let mission = 0; mission < 5; mission += 1) {
    assert.equal(state.missionIndex, mission);
    assert.equal(state.phase, 'deploy');
    state = ok(E.beginBattle(state));
    state.units = state.units.filter(unit => unit.team !== 'enemy');
    state.spawn = [];
    state.turn = state.turnLimit;
    if (mission === 0) {
      const disabled = unitById(state, 'mech-3');
      disabled.hp = 0; disabled.x = -1; disabled.y = -1;
    }
    state = ok(E.endTurn(state));
    assertInvariants(state);
    if (mission === 4) {
      assert.equal(state.phase, 'won');
      break;
    }
    assert.equal(state.phase, 'reward');
    if (mission === 0) {
      state = ok(E.upgrade(state, 'mech-1', 'hp'));
      upgradedHp = unitById(state, 'mech-1').maxHp;
    }
    const before = copy(state);
    state = ok(E.nextMission(state));
    assert.deepEqual(before.phase, 'reward');
    assert.equal(state.grid, before.grid, 'grid recovery was already applied in the reward phase');
    assert.equal(unitById(state, 'mech-1').maxHp, upgradedHp + (unitById(state, 'mech-1').pilot?.applied?.rankHp ? 1 : 0), 'rank 2 grants its one-time HP bonus at the next mission');
    assert.ok(playerUnits(state).every(unit => alive(unit) && unit.hp === unit.maxHp));
  }
  assert.equal(state.missionIndex, 4);
  assert.equal(state.phase, 'won');
  assert.ok(E.nextMission(state).error);
});

test('random legal play preserves occupancy, HP, resources, and deterministic save behavior', () => {
  let randomState = 1111;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  const choose = values => values[Math.floor(random() * values.length)];
  for (let run = 0; run < 12; run += 1) {
    let state = E.createRun({ squad: run % 2 ? 'control' : 'rift', difficulty: 'normal', seed: 1234 + run });
    let turns = 0;
    while (!['won', 'lost'].includes(state.phase) && turns < 25) {
      if (state.phase === 'deploy') state = ok(E.beginBattle(state));
      if (state.phase === 'reward') {
        state = ok(E.nextMission(state));
        continue;
      }
      for (const id of playerUnits(state).filter(alive).map(unit => unit.id)) {
        const moves = E.getMoves(state, id);
        if (moves.length && random() < 0.8) {
          state = ok(E.command(state, { type: 'move', unitId: id, ...choose(moves) }));
        }
        const targets = E.getTargets(state, id);
        const command = targets.length && random() < 0.8
          ? { type: 'attack', unitId: id, ...choose(targets) }
          : { type: 'repair', unitId: id };
        const result = E.command(state, command);
        if (result.error) {
          // A disabled/frozen unit may be deliberately unable to act. A legal
          // advertised attack target, however, must always be executable.
          assert.notEqual(command.type, 'attack', result.error);
        } else {
          state = result.state;
        }
        assertInvariants(state);
        if (state.phase !== 'player') break;
      }
      if (state.phase === 'player') {
        const restored = copy(state);
        const forecast = E.forecast(state);
        const actual = E.endTurn(restored);
        assert.equal(actual.error, null);
        assert.deepEqual(forecast.state, actual.state);
        state = actual.state;
      }
      turns += 1;
      assertInvariants(state);
    }
    assert.ok(['won', 'lost'].includes(state.phase), `run ${run} reaches a terminal state`);
  }
});

test('cryo freezes both ends and its canceled enemy intent stays canceled after thawing', () => {
  let state = fixture('control');
  const cryo = unitById(state, 'mech-3');
  cryo.x = 4; cryo.y = 7;
  const combat = unitById(state, 'mech-1');
  combat.x = 3; combat.y = 3;
  enemy(state, 'frozen-target', 4, 3, { intent: intent('projectile', 0, 1, 2) });
  tile(state, 4, 5, 'building', 2);
  state = ok(E.command(state, { type: 'attack', unitId: cryo.id, x: 4, y: 3 }));
  assert.equal(unitById(state, cryo.id).frozen, true);
  assert.equal(liveById(state, 'frozen-target').frozen, true);
  assert.equal(liveById(state, 'frozen-target').intent.canceled, true);
  state = ok(E.command(state, { type: 'attack', unitId: combat.id, x: 4, y: 3 }));
  assert.equal(liveById(state, 'frozen-target').frozen, false);
  assert.equal(liveById(state, 'frozen-target').intent.canceled, true);
  const grid = state.grid;
  state = ok(E.endTurn(state));
  assert.equal(state.grid, grid);
  assert.deepEqual(E.getMoves(state, cryo.id), []);
  assert.deepEqual(E.getTargets(state, cryo.id), []);
  state = ok(E.command(state, { type: 'repair', unitId: cryo.id }));
  assert.equal(unitById(state, cryo.id).frozen, false);
  assert.equal(unitById(state, cryo.id).acted, true);
});

test('forest, sand, and ice react to damage, and repair clears harmful unit statuses', () => {
  for (const type of ['forest', 'sand', 'ice']) {
    const state = fixture();
    const mech = unitById(state, 'mech-3');
    mech.x = 4; mech.y = 7;
    enemy(state, 'target', 4, 3, { intent: intent('melee', 0, 1) });
    tile(state, 4, 3, type, type === 'ice' ? 1 : 0);
    const after = ok(E.command(state, { type: 'attack', unitId: mech.id, x: 4, y: 3 }));
    const affected = after.tiles[at(4, 3)];
    if (type === 'forest') {
      assert.equal(affected.type, 'ground');
      assert.equal(affected.fire, true);
      assert.equal(liveById(after, 'target').fire, true);
    } else if (type === 'sand') {
      assert.equal(affected.type, 'ground');
      assert.equal(affected.smoke, true);
      assert.equal(liveById(after, 'target').intent.canceled, true);
    } else {
      assert.equal(affected.type, 'water');
      assert.equal(liveById(after, 'target'), undefined);
    }
    assertInvariants(after);
  }
  const state = fixture();
  const damaged = unitById(state, 'mech-1');
  damaged.hp = damaged.maxHp - 2;
  damaged.fire = true; damaged.acid = true; damaged.frozen = true;
  const after = ok(E.command(state, { type: 'repair', unitId: damaged.id }));
  const repaired = unitById(after, damaged.id);
  assert.equal(repaired.hp, damaged.hp + 1);
  assert.equal(repaired.fire, false);
  assert.equal(repaired.acid, false);
  assert.equal(repaired.frozen, false);
  assert.equal(repaired.acted, true);
});

test('pathfinding blocks hostile occupancy and solid terrain but permits passing through allies', () => {
  const state = fixture();
  const mech = unitById(state, 'mech-1');
  mech.x = 0; mech.y = 0; mech.move = 2;
  tile(state, 1, 0, 'mountain', 2);
  enemy(state, 'blocker', 0, 1);
  assert.deepEqual(E.getMoves(state, mech.id), []);
  state.units = state.units.filter(unit => unit.id !== 'blocker');
  const ally = unitById(state, 'mech-2');
  ally.x = 0; ally.y = 1;
  tile(state, 1, 1, 'chasm');
  tile(state, 0, 2, 'water');
  assert.deepEqual(E.getMoves(state, mech.id), [{ x: 0, y: 2 }]);
  const after = ok(E.command(state, { type: 'move', unitId: mech.id, x: 0, y: 2 }));
  assert.ok(liveById(after, mech.id));
  assert.deepEqual(E.getTargets(after, mech.id), [], 'submerged ground mechs cannot fire');
  assertInvariants(after);
});
