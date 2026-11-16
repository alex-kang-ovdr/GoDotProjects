'use strict';

// Reproducible balance smoke test. The policy reads state but changes it only
// through the same public engine APIs used by the browser. A policy loss is
// reported as such; it is not treated as proof of an engine defect.
const assert = require('node:assert/strict');
const E = require('../dist/engine.js');

const live = unit => unit.hp > 0 && unit.x >= 0 && unit.y >= 0;
const playerUnits = state => state.units.filter(unit => unit.team === 'player');
const clone = state => JSON.parse(JSON.stringify(state));
const arg = (key, fallback) => {
  const item = process.argv.slice(2).find(value => value.startsWith(`--${key}=`));
  return item ? item.slice(key.length + 3) : fallback;
};
const deadline = Date.now() + Math.max(1000, Number(arg('max-ms', '180000')));
const config = {
  squads: arg('squads', 'rift,control,gravity').split(','),
  routes: arg('routes', 'safe,risk').split(','),
  difficulty: arg('difficulty', 'normal'),
  seed: arg('seed', '20261114'),
  requireWin: process.argv.includes('--require-win')
};

function ok(result, context) {
  assert.equal(result.error, null, `${context}: ${result.error || ''}`);
  return result.state;
}

function check(state) {
  const validation = E.validateState(state);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  const occupied = new Set();
  for (const unit of state.units.filter(live)) {
    const key = `${unit.x},${unit.y}`;
    assert.ok(!occupied.has(key), `overlap at ${key}`);
    occupied.add(key);
  }
}

function score(candidate) {
  const prediction = candidate.phase === 'player' ? E.forecast(candidate) : { state: candidate, gridDamage: 0 };
  const next = prediction.state;
  if (next.phase === 'lost') return -1e9;
  let value = next.grid * 10000 - prediction.gridDamage * 120;
  if (next.phase === 'won') value += 1e8;
  value += next.cores * 10;
  value += (candidate.runStats.kills || 0) * 35;
  value += (candidate.runStats.blocks || 0) * 8;
  value += (candidate.runStats.pods || 0) * 65;
  const enemies = next.units.filter(unit => unit.team === 'enemy' && live(unit));
  for (const unit of next.units.filter(live)) {
    if (unit.team === 'player') {
      value += 600 + unit.hp * 35 + (unit.shield ? 20 : 0) - (unit.frozen ? 12 : 0);
      value += (unit.secondary?.charges || 0) * 4;
      const terrain = next.tiles[unit.y * 8 + unit.x];
      if (terrain.type === 'water' && !unit.flying) value -= 12;
      if (unit.fire) value -= 18;
      if (unit.acid) value -= 10;
      if (unit.kind === 'combat' && enemies.length) {
        value -= Math.min(...enemies.map(enemy => Math.abs(enemy.x - unit.x) + Math.abs(enemy.y - unit.y))) * 2;
      }
    } else if (unit.kind === 'bomb') {
      value += unit.hp * 2500 + (unit.shield ? 120 : 0);
    } else if (unit.team === 'enemy') {
      value -= unit.frozen ? 10 + unit.hp * 3 : 70 + unit.hp * 24 + unit.damage * 20;
      if (unit.acid && !unit.frozen) value += 12;
    }
  }
  if (next.phase === 'player') {
    for (const threat of E.threats(next)) {
      if (threat.canceled) continue;
      for (const point of threat.targets) {
        const tile = next.tiles[point.y * 8 + point.x];
        const target = next.units.find(unit => live(unit) && unit.x === point.x && unit.y === point.y);
        if (tile.type === 'building') value -= threat.damage * 22;
        if (target?.kind === 'bomb') value -= threat.damage * 80;
      }
    }
  }
  return value;
}

function chooseAction(state) {
  let best = null;
  for (const unit of playerUnits(state).filter(unit => live(unit) && !unit.acted)) {
    for (const point of [null, ...E.getMoves(state, unit.id)]) {
      if (Date.now() >= deadline) throw new Error('POLICY_TIME_LIMIT');
      let moved = state;
      const prefix = [];
      if (point) {
        const command = { type: 'move', unitId: unit.id, ...point };
        moved = ok(E.command(state, command), 'advertised move');
        prefix.push(command);
      }
      const actions = [{ type: 'repair', unitId: unit.id }, { type: 'wait', unitId: unit.id }];
      for (const slot of ['primary', 'secondary']) {
        const seen = new Set();
        const info = E.getWeapon(moved, unit.id, slot);
        const origin = moved.units.find(current => current.id === unit.id);
        for (const target of E.getTargets(moved, unit.id, slot)) {
          // Straight beams resolve by direction. Avoid forecasting the same
          // public command result for every square in that firing direction.
          const directional = ['cannon', 'laser', 'pull'].includes(info.id);
          const key = directional ? `${Math.sign(target.x - origin.x)},${Math.sign(target.y - origin.y)}` : `${target.x},${target.y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          actions.push({ type: 'attack', unitId: unit.id, slot, ...target });
        }
      }
      for (const command of actions) {
        const result = E.command(moved, command);
        if (result.error) {
          assert.notEqual(command.type, 'attack', `advertised attack rejected: ${result.error}`);
          continue;
        }
        const value = score(result.state) - (point ? 0.001 : 0);
        if (!best || value > best.value) best = { value, commands: [...prefix, command] };
      }
    }
  }
  return best;
}

function service(state, counters) {
  const openers = {
    rift: [['mech-3', 'damage', 1], ['mech-1', 'move', 1], ['mech-2', 'move', 1], ['mech-2', 'damage', 1], ['mech-1', 'damage', 1]],
    control: [['mech-1', 'damage', 1], ['mech-2', 'damage', 1], ['mech-1', 'move', 1], ['mech-1', 'damage', 2], ['mech-2', 'damage', 2]],
    gravity: [['mech-3', 'damage', 1], ['mech-3', 'move', 1], ['mech-1', 'move', 1], ['mech-3', 'damage', 2], ['mech-1', 'damage', 1], ['mech-2', 'move', 1], ['mech-2', 'damage', 1]]
  };
  const priority = [...openers[state.squad],
    ['mech-3', 'move', 2], ['mech-1', 'damage', 2], ['mech-2', 'damage', 2],
    ['mech-3', 'damage', 2], ['mech-1', 'move', 2], ['mech-2', 'move', 2],
    ['mech-1', 'hp', 2], ['mech-3', 'hp', 2], ['mech-2', 'hp', 2]
  ];
  let next = state;
  if (state.missionIndex === 3 && state.squad === 'control' && state.cores >= 2) {
    next = ok(E.equipSecondary(next, 'mech-3', 'shield'), 'equip final-defense shield');
    counters.equipmentSwaps += 1;
  }
  while (true) {
    const purchase = priority.find(([id, stat, level]) => {
      const cost = E.getUpgradeCost(next, id, stat);
      const unit = next.units.find(unit => unit.id === id);
      return unit.upgrades[stat] < level && cost !== null && cost <= next.cores;
    });
    if (!purchase) break;
    next = ok(E.upgrade(next, purchase[0], purchase[1]), 'upgrade');
    counters.upgrades += 1;
  }
  return next;
}

function deployForward(state) {
  let next = state;
  if (state.missionIndex === 0) {
    if (state.squad === 'gravity') next = ok(E.deploy(next, 'mech-2', 2, 5), 'forward pull deployment');
    return next;
  }
  for (const unit of playerUnits(state)) {
    const preferredX = unit.kind === 'laser' ? 7 : unit.id === 'mech-1' ? 2 : unit.id === 'mech-2' ? 4 : 6;
    const choices = E.getDeploymentTiles(next, unit.id).sort((a, b) =>
      (a.y - 5) * 10 + Math.abs(a.x - preferredX) - ((b.y - 5) * 10 + Math.abs(b.x - preferredX)) || a.x - b.x
    );
    if (choices.length) next = ok(E.deploy(next, unit.id, choices[0].x, choices[0].y), 'forward deployment');
  }
  return next;
}

function play(squad, route) {
  let state = E.createRun({ squad, difficulty: config.difficulty, seed: config.seed });
  const counters = { turns: 0, upgrades: 0, secondaryUses: 0, equipmentSwaps: 0, commands: 0 };
  const routeIds = [state.mission.operationId];
  const reports = [];
  check(state);
  while (!['won', 'lost'].includes(state.phase) && counters.turns < 25) {
    if (Date.now() >= deadline) throw new Error('POLICY_TIME_LIMIT');
    if (state.phase === 'deploy') state = ok(E.beginBattle(deployForward(state)), 'begin battle');
    if (state.phase === 'reward') {
      state = service(state, counters);
      const choices = E.getMissionChoices(state);
      assert.ok(choices.length > 0);
      const choice = route === 'risk' ? choices.at(-1) : choices[0];
      state = ok(E.nextMission(state, choice.id), 'choose route');
      routeIds.push(choice.id);
      continue;
    }
    for (let action = 0; action < 3 && state.phase === 'player'; action += 1) {
      const selected = chooseAction(state);
      if (!selected) break;
      for (const command of selected.commands) {
        state = ok(E.command(state, command), 'selected legal command');
        counters.commands += 1;
        if (command.type === 'attack' && command.slot === 'secondary') counters.secondaryUses += 1;
        check(state);
        if (state.phase !== 'player') break;
      }
    }
    if (state.phase === 'player') {
      const before = clone(state);
      const prediction = E.forecast(state);
      const resolution = E.endTurn(state, { trace: true });
      assert.deepEqual(state, before, 'forecast and trace leave live state immutable');
      assert.deepEqual(prediction.state, resolution.state, 'forecast agrees with real turn');
      assert.deepEqual(resolution.frames.at(-1).state, resolution.state, 'final animation frame agrees');
      state = ok(resolution, 'end turn');
    }
    counters.turns += 1;
    check(state);
    if (state.phase !== 'player') {
      const report = { mission: state.missionIndex + 1, operation: state.mission.operationId, phase: state.phase, grid: state.grid, cores: state.cores };
      reports.push(report);
      console.log(JSON.stringify({ progress: { squad, route, ...report } }));
    }
  }
  assert.ok(['won', 'lost'].includes(state.phase), 'campaign reaches a terminal state within 25 turns');
  return {
    squad, route, difficulty: config.difficulty, seed: config.seed, phase: state.phase,
    grid: state.grid, ...counters, routes: routeIds, reports, runStats: state.runStats,
    lossReason: state.phase === 'lost' ? state.log.at(-1) : null,
    classification: state.phase === 'won' ? 'legal winning path' : 'greedy policy loss; not a proven engine defect'
  };
}

function main() {
  const outcomes = [];
  for (const squad of config.squads) {
    for (const route of config.routes) {
      try {
        const outcome = play(squad, route);
        outcomes.push(outcome);
        console.log(`RESULT ${JSON.stringify(outcome)}`);
      } catch (error) {
        if (error.message === 'POLICY_TIME_LIMIT') {
          console.log(`TIME_LIMIT ${JSON.stringify({ squad, route, completed: outcomes.length })}`);
          process.exitCode = 2;
          return;
        }
        throw error;
      }
    }
  }
  const wins = outcomes.filter(outcome => outcome.phase === 'won').length;
  console.log(`SUMMARY ${JSON.stringify({ wins, total: outcomes.length, difficulty: config.difficulty, seed: config.seed })}`);
  if (config.requireWin && wins !== outcomes.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { play, chooseAction, score };
