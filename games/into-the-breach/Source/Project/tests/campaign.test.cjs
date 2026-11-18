const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/campaign.js');

const copy = value => JSON.parse(JSON.stringify(value));
const cell = (state, x, y) => state.tiles[y * 8 + x];
function fixture(operationId, overrides = {}) {
  const operation = C.getOperation(operationId);
  const state = {
    seed: 'campaign-contract', rng: 98765, phase: 'player', difficulty: 'normal',
    missionIndex: operation.index, turn: 1, turnLimit: operation.index === 4 ? 5 : 4,
    grid: 5, maxGrid: 7, mission: { ...operation, operationId },
    stats: { kills: 0, blocks: 0, gridLost: 0, pods: 0, leaderKills: 0 },
    units: [], tiles: Array.from({ length: 64 }, () => ({ type: 'ground', hp: 0 }))
  };
  operation.protectedTiles.forEach(position => Object.assign(cell(state, position.x, position.y), { type: 'building', hp: 2 }));
  if (operation.pod) cell(state, operation.pod.x, operation.pod.y).item = 'pod';
  return Object.assign(state, overrides);
}

test('operation choices retain a five-battle path and do not share mutable data', () => {
  assert.deepEqual([-1, 0, 1, 2, 3, 4].map(missionIndex => C.getChoices({ missionIndex }).length), [1, 2, 2, 2, 1, 0]);
  for (let index = 0; index < 5; index++) {
    const choices = C.getChoices({ missionIndex: index - 1 });
    assert.ok(choices.every(operation => operation.index === index && operation.mapIndex === index));
    assert.equal(C.defaultOperation(index).id, choices[0].id);
  }
  const choices = C.getChoices({ missionIndex: 0 });
  choices[0].protectedTiles[0].x = 99;
  choices[0].objectives[0].reward = 999;
  assert.equal(C.getOperation('forest_relay').protectedTiles[0].x, 2);
  assert.equal(C.defaultOperation(1).objectives[0].reward, 1);
  assert.equal(C.getOperation('__proto__'), null);
  assert.equal(C.defaultOperation(5), null);
});

test('optional entities occupy valid, distinct coordinates on their base maps', () => {
  const buildings = [
    [[1,3],[3,4],[5,4],[1,5],[3,5],[7,4]],
    [[1,4],[2,3],[3,5],[5,4],[6,5]],
    [[1,4],[3,4],[5,3],[7,4],[3,5]],
    [[1,4],[3,4],[5,4],[7,4],[3,5]],
    [[1,4],[6,4],[2,5],[5,5]]
  ];
  const occupied = [
    [[3,3],[5,2]], [[2,2],[5,2],[6,1]], [[3,3],[5,1],[1,1]],
    [[3,3],[5,1],[1,1]], [[3,2],[1,3],[5,1],[3,3]]
  ];
  for (const operation of Object.values(C.OPS)) {
    const key = position => `${position.x},${position.y}`;
    const used = new Set(occupied[operation.mapIndex].concat(buildings[operation.mapIndex], [[2,6],[4,6],[6,6]]).map(point => point.join(',')));
    for (const position of operation.extraEnemies.concat(operation.pod ? [operation.pod] : [])) {
      assert.ok(Number.isInteger(position.x) && Number.isInteger(position.y) && position.x >= 0 && position.x < 8 && position.y >= 0 && position.y < 8, operation.id);
      assert.ok(!used.has(key(position)), `${operation.id} has overlapping extra content at ${key(position)}`);
      used.add(key(position));
    }
    for (const position of operation.protectedTiles) {
      assert.ok(buildings[operation.mapIndex].some(([x,y]) => position.x === x && position.y === y), `${operation.id} protects an existing building`);
    }
  }
});

test('kills and blocks can complete early while grid and protection wait for settlement', () => {
  const combat = fixture('desert_containment');
  combat.stats.blocks = 2;
  assert.equal(C.evaluateObjectives(combat)[0].status, 'complete');
  const attack = fixture('desert_airstrike');
  attack.stats.kills = 5;
  assert.equal(C.evaluateObjectives(attack)[0].success, true);
  for (const operationId of ['coast', 'forest_relay']) {
    const state = fixture(operationId);
    state.turn = state.turnLimit;
    assert.equal(C.evaluateObjectives(state)[0].status, 'active', 'the final player turn is not settled');
    state.mission.completed = true;
    assert.equal(C.evaluateObjectives(state)[0].status, 'complete');
  }
});

test('irreversible objective failures show immediately and unmet counters fail on completion', () => {
  const grid = fixture('coast');
  grid.stats.gridLost = 2;
  assert.equal(C.evaluateObjectives(grid)[0].status, 'failed');
  const protect = fixture('forest_relay');
  Object.assign(cell(protect, 2, 3), { type: 'ground', hp: 0 });
  assert.equal(C.evaluateObjectives(protect)[0].status, 'failed');
  const blocks = fixture('desert_containment');
  blocks.stats.blocks = 1;
  assert.equal(C.evaluateObjectives(blocks)[0].status, 'active');
  blocks.mission.completed = true;
  assert.equal(C.evaluateObjectives(blocks)[0].status, 'failed');
});

test('reward quotation is pure, itemized and does not pay a pod objective twice', () => {
  const state = fixture('forest_salvage');
  state.stats.pods = 1;
  state.mission.completed = true;
  const before = copy(state);
  const reward = C.quoteReward(state);
  assert.equal(C.evaluateObjectives(state)[0].success, true);
  assert.equal(reward.objectives, 0);
  assert.equal(reward.pods, 1);
  assert.equal(reward.total, 5);
  assert.equal(reward.gridRepair, 1);
  assert.equal(reward.details.reduce((sum, detail) => sum + detail.cores, 0), reward.total);
  assert.deepEqual(C.quoteReward(state), reward);
  assert.deepEqual(state, before);
  state.difficulty = 'easy';
  assert.equal(C.quoteReward(state).gridRepair, 2);
  state.grid = 6;
  assert.equal(C.quoteReward(state).gridRepair, 1);
});

test('failed runs have no settlement reward and the final battle does not repair grid', () => {
  const failed = fixture('desert_airstrike', { phase: 'lost' });
  failed.stats.kills = 5;
  failed.stats.pods = 1;
  assert.equal(C.quoteReward(failed).total, 0);
  assert.equal(C.quoteReward(failed).gridRepair, 0);
  assert.deepEqual(C.quoteReward(failed).details, []);
  const final = fixture('hive');
  final.stats.leaderKills = 1;
  final.mission.completed = true;
  assert.equal(C.evaluateObjectives(final)[0].success, true);
  assert.equal(C.quoteReward(final).gridRepair, 0);
});

test('hazards are deterministic without consuming RNG or reacting to ordinary movement', () => {
  const state = fixture('desert_airstrike');
  const before = copy(state);
  const plan = C.hazardPlan(state);
  assert.equal(plan.length, 2);
  assert.ok(plan.every(hazard => hazard.kind === 'airstrike' && hazard.damage === 2));
  assert.deepEqual(state, before);
  state.rng = 1;
  state.units.push({ kind: 'combat', hp: 3, x: plan[0].x, y: plan[0].y });
  assert.deepEqual(C.hazardPlan(state), plan);
  state.turn++;
  assert.notDeepEqual(C.hazardPlan(state), plan);
});

test('all hazards avoid protected structures and pods; tides select ground only', () => {
  for (const operationId of ['forest_salvage', 'desert_airstrike', 'ice_extraction']) {
    const state = fixture(operationId);
    const first = C.hazardPlan(state);
    const [a, b] = first;
    Object.assign(cell(state, a.x, a.y), { type: 'building', hp: 2 });
    cell(state, b.x, b.y).item = 'pod';
    state.units.push({ kind: 'bomb', hp: 5, x: 3, y: 3 });
    Object.assign(cell(state, 4, 4), { type: 'mountain', hp: 2 });
    Object.assign(cell(state, 6, 6), { type: 'ice', hp: 1 });
    const plan = C.hazardPlan(state);
    assert.equal(plan.length, operationId === 'ice_extraction' ? 3 : 2);
    assert.equal(new Set(plan.map(({x,y}) => `${x},${y}`)).size, plan.length);
    for (const hazard of plan) {
      const tile = cell(state, hazard.x, hazard.y);
      assert.ok(!['building', 'mountain', 'water', 'chasm'].includes(tile.type));
      assert.notEqual(tile.item, 'pod');
      assert.ok(hazard.x !== 3 || hazard.y !== 3);
      if (hazard.kind === 'tide') assert.equal(tile.type, 'ground');
    }
  }
  const flooded = fixture('forest_salvage');
  flooded.tiles.forEach(tile => { tile.type = 'water'; });
  assert.deepEqual(C.hazardPlan(flooded), []);
  assert.deepEqual(C.hazardPlan(fixture('forest_relay')), []);
});
