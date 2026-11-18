import test from 'node:test';
import assert from 'node:assert/strict';
import { OPERATIONS, defaultCareer, sanitizeCareer, summarizeBattle, recordBattle, nextOperation } from '../dist/js/career.js';

function finishedBattle(overrides = {}) {
  return {
    battleId: 'qa-battle-1', phase: 'ended', mode: 'standard', mapId: 'valley', winner: 0, elapsed: 100,
    playerId: 'player', tanks: [{ id: 'player', team: 0, isPlayer: true, alive: true }],
    statistics: { damage: 750, assisted: 100, blocked: 0, kills: 1, spots: 1, shots: 5, hits: 4, captures: 0 },
    ...overrides,
  };
}

test('all operations are available without a combat-stat progression gate', () => {
  assert.deepEqual(OPERATIONS.map(operation => operation.id), ['valley', 'depot', 'ridge']);
  assert.equal(nextOperation('valley'), 'depot');
  assert.equal(nextOperation('depot'), 'ridge');
  assert.equal(nextOperation('ridge'), null);
  assert.equal(nextOperation('training'), null);
  const career = defaultCareer();
  assert.equal(career.version, 2);
  assert.deepEqual(Object.keys(career.operations), OPERATIONS.map(operation => operation.id));
  assert.ok(OPERATIONS.every(operation => operation.title && operation.goalText));
});

test('sanitization repairs malformed records without sharing or mutating objects', () => {
  const raw = { battles: '4', wins: 99, draws: Infinity, bestDamage: -80, totalDamage: NaN, totalKills: true, operations: { valley: { played: 2, wins: 8, bestScore: Infinity, bestMedal: 'platinum' } }, history: [null, { battleId: 'old', mapId: 'valley', score: 12, medal: 'gold' }, { battleId: 'old', mapId: 'valley' }], recordedBattleIds: [null, 'old'] };
  const career = sanitizeCareer(raw);
  assert.equal(career.battles, 4);
  assert.equal(career.wins, 4);
  assert.equal(career.draws, 0);
  assert.equal(career.bestDamage, 0);
  assert.equal(career.totalDamage, 0);
  assert.equal(career.totalKills, 0);
  assert.deepEqual(career.operations.valley, { played: 2, wins: 2, bestScore: 0, bestMedal: 'none' });
  assert.equal(career.history.length, 1);
  assert.deepEqual(career.recordedBattleIds, ['old']);
  career.operations.valley.played = 20;
  assert.equal(raw.operations.valley.played, 2);
  assert.deepEqual(sanitizeCareer(null), defaultCareer());
});

test('a winning contribution earns a medal and class-agnostic operation goals', () => {
  const result = summarizeBattle(finishedBattle());
  assert.equal(result.victory, true);
  assert.equal(result.accuracy, 80);
  assert.equal(result.medal.tier, 'gold');
  assert.ok(result.objectives.every(objective => objective.complete));
  assert.ok(result.objectives.every(objective => objective.display && objective.progress === 1));
  assert.ok(result.score > result.damage);
  const scoutContribution = summarizeBattle(finishedBattle({ mapId: 'ridge', statistics: { damage: 0, assisted: 400, spots: 3, kills: 0, shots: 0, hits: 0 } }));
  assert.equal(scoutContribution.medal.tier, 'gold', 'spotting support can fulfill objectives without direct damage');
  const damageAlternative = summarizeBattle(finishedBattle({ mapId: 'ridge', statistics: { damage: 1000, assisted: 0, spots: 0, kills: 2, shots: 10, hits: 9 } }));
  assert.equal(damageAlternative.medal.tier, 'gold', 'non-scout classes also have an achievable path');
});

test('ongoing battles cannot claim survival completion or record career rewards', () => {
  const state = finishedBattle({ phase: 'playing', winner: null, statistics: { damage: 600, kills: 0 } });
  const summary = summarizeBattle(state);
  assert.equal(summary.victory, false);
  assert.equal(summary.objectives[1].complete, false);
  const recorded = recordBattle(defaultCareer(), state);
  assert.equal(recorded.recorded, false);
  assert.equal(recorded.career.battles, 0);
});

test('finished battle accounting is idempotent even after it leaves recent history', () => {
  const initial = defaultCareer();
  const first = finishedBattle();
  const recorded = recordBattle(initial, first);
  assert.equal(initial.battles, 0, 'input career remains unchanged');
  assert.equal(recorded.recorded, true);
  assert.equal(recorded.career.wins, 1);
  assert.equal(recorded.career.operations.valley.bestMedal, 'gold');
  const duplicate = recordBattle(recorded.career, first);
  assert.equal(duplicate.recorded, false);
  assert.deepEqual(duplicate.career, recorded.career);
  let career = recorded.career;
  for (let i = 2; i <= 14; i++) career = recordBattle(career, finishedBattle({ battleId: `qa-battle-${i}` })).career;
  assert.equal(career.history.length, 10);
  assert.equal(career.battles, 14);
  assert.equal(career.history.some(entry => entry.battleId === first.battleId), false);
  assert.equal(recordBattle(career, first).recorded, false);
  assert.equal(recordBattle(career, first).career.battles, 14);
});

test('training completion is recognized without affecting combat records', () => {
  const training = finishedBattle({ mode: 'training', mapId: 'training', tanks: [{ id: 'player', team: 0, alive: true }, ...[1, 2, 3].map(n => ({ id: `target-${n}`, team: 1, alive: false }))] });
  const original = recordBattle(defaultCareer(), finishedBattle()).career;
  const result = recordBattle(original, training);
  assert.equal(result.summary.training, true);
  assert.equal(result.summary.score, 0);
  assert.equal(result.summary.medal.label, '기초 훈련 수료');
  assert.equal(result.summary.objectives[0].complete, true);
  assert.equal(result.recorded, false);
  assert.deepEqual(result.career, original);
});

test('draws and losses record honestly and missing identities never create duplicates', () => {
  const draw = recordBattle(defaultCareer(), finishedBattle({ winner: null }));
  assert.equal(draw.career.draws, 1);
  assert.equal(draw.career.wins, 0);
  assert.equal(draw.career.history[0].result, 'draw');
  const loss = recordBattle(draw.career, finishedBattle({ battleId: 'lost', winner: 1, statistics: {} }));
  assert.equal(loss.career.battles, 2);
  assert.equal(loss.career.wins, 0);
  assert.equal(loss.career.history[0].result, 'defeat');
  assert.equal(loss.summary.medal.tier, 'none');
  assert.equal(recordBattle(loss.career, finishedBattle({ battleId: '' })).recorded, false);
});
