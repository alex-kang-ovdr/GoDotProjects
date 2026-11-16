import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRun, normalizeProgress, recordCompletion, nextCampaignMission } from '../dist/campaign.js';

const win = (extra = {}) => ({ won: true, elapsed: 60, shots: 5, integrity: 0.75, cost: 35, ...extra });
const fresh = () => ({ version: 1, missions: {
  outpost: { stars: 0, bestTime: null, bestShots: null, clears: 0 },
  gate: { stars: 0, bestTime: null, bestShots: null, clears: 0 },
  citadel: { stars: 0, bestTime: null, bestShots: null, clears: 0 },
  harbor: { stars: 0, bestTime: null, bestShots: null, clears: 0 },
  skyway: { stars: 0, bestTime: null, bestShots: null, clears: 0 },
  switchback: { stars: 0, bestTime: null, bestShots: null, clears: 0 },
} });
function freezeDeep(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeDeep(child); Object.freeze(value); }
  return value;
}

test('stars require victory and include exact par-time, shot, and integrity thresholds', () => {
  assert.deepEqual(scoreRun('outpost', win()), {
    stars: 3, timeStar: true, precisionStar: true, elapsed: 60, shots: 5, integrity: 0.75, cost: 35,
  });
  assert.equal(scoreRun('outpost', win({ elapsed: 60.001 })).stars, 2);
  assert.equal(scoreRun('outpost', win({ shots: 6 })).stars, 2);
  assert.equal(scoreRun('outpost', win({ integrity: 0.749 })).stars, 2);
  assert.equal(scoreRun('outpost', win({ elapsed: 61, integrity: 0.5 })).stars, 1);
  assert.equal(scoreRun('gate', win({ elapsed: 90 })).stars, 3);
  assert.equal(scoreRun('citadel', win({ elapsed: 120, shots: 10 })).stars, 3);
  for (const won of [false, undefined, 1, 'true']) {
    const result = scoreRun('outpost', win({ won, elapsed: 1, shots: 0, integrity: 1 }));
    assert.equal(result.stars, 0);
    assert.equal(result.timeStar, false);
    assert.equal(result.precisionStar, false);
  }
  for (const id of ['sandbox', 'missing', '__proto__', null]) assert.equal(scoreRun(id, win()).stars, 0);
});

test('bad run measurements never produce bonus stars or nonfinite result fields', () => {
  for (const bad of [undefined, null, '2', -1, NaN, Infinity, -Infinity, {}, []]) {
    const result = scoreRun('outpost', win({ elapsed: bad, shots: bad, integrity: bad, cost: bad }));
    assert.equal(result.stars, 1, `bad measurement ${String(bad)}`);
    for (const key of ['elapsed', 'shots', 'integrity', 'cost']) assert.ok(Number.isFinite(result[key]));
  }
  assert.equal(scoreRun('outpost', win({ shots: 1.2 })).precisionStar, false);
  assert.equal(scoreRun('outpost', win({ integrity: 1.1 })).precisionStar, false);
  for (const bad of [null, undefined, [], 'won']) assert.equal(scoreRun('outpost', bad).stars, 0);
  const stats = freezeDeep(win());
  assert.equal(scoreRun('outpost', stats).stars, 3, 'scoring does not mutate stats');
});

test('normalization handles empty data, unsupported versions, and unversioned legacy records', () => {
  for (const raw of [null, undefined, [], 'saved', 1, {}, { missions: null },
    { version: 0, missions: { outpost: { stars: 3 } } },
    { version: 2, missions: { outpost: { stars: 3 } } },
    { version: '1', missions: { outpost: { stars: 3 } } }]) {
    assert.deepEqual(normalizeProgress(raw), fresh());
  }
  const early = { missions: { gate: { stars: 2, bestTime: 84.5, bestShots: 4 } } };
  const normalized = normalizeProgress(early);
  assert.deepEqual(normalized.missions.gate, { stars: 2, bestTime: 84.5, bestShots: 4, clears: 1 });
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(normalized))), normalized);
  assert.deepEqual(normalizeProgress(normalized), normalized, 'normalization is idempotent');
});

test('progress whitelist rejects unknown keys and safely repairs malformed counters', () => {
  const raw = JSON.parse('{"version":1,"missions":{"__proto__":{"polluted":true},"sandbox":{"stars":3,"clears":50},"outpost":{"stars":100,"clears":-5,"bestTime":null,"bestShots":"0","extra":true},"gate":{"stars":-2,"clears":2,"bestTime":-10,"bestShots":1.2}}}');
  raw.missions.citadel = { stars: NaN, clears: Infinity, bestTime: Infinity, bestShots: NaN };
  const snapshot = structuredClone(raw);
  const normalized = normalizeProgress(raw);
  assert.deepEqual(Object.keys(normalized.missions), ['outpost', 'gate', 'citadel', 'harbor', 'skyway', 'switchback']);
  assert.deepEqual(normalized.missions.outpost, { stars: 3, bestTime: null, bestShots: null, clears: 1 });
  assert.deepEqual(normalized.missions.gate, { stars: 1, bestTime: null, bestShots: null, clears: 2 });
  assert.deepEqual(normalized.missions.citadel, fresh().missions.citadel);
  assert.deepEqual(raw, snapshot);
  assert.equal({}.polluted, undefined);
  const inherited = Object.create({ outpost: { stars: 3, clears: 1 } });
  assert.deepEqual(normalizeProgress({ version: 1, missions: inherited }), fresh());
});

test('successful runs improve independent bests without mutating earlier progress', () => {
  const initial = freezeDeep(fresh());
  const first = recordCompletion(initial, 'outpost', freezeDeep(win({ elapsed: 90, shots: 8, integrity: 0.5 })));
  assert.deepEqual(first.missions.outpost, { stars: 1, bestTime: 90, bestShots: 8, clears: 1 });
  const second = recordCompletion(freezeDeep(first), 'outpost', win());
  assert.deepEqual(second.missions.outpost, { stars: 3, bestTime: 60, bestShots: 5, clears: 2 });
  const third = recordCompletion(freezeDeep(second), 'outpost', win({ elapsed: 150, shots: 9, integrity: 0.1 }));
  assert.deepEqual(third.missions.outpost, { stars: 3, bestTime: 60, bestShots: 5, clears: 3 });
  const fourth = recordCompletion(third, 'outpost', win({ elapsed: 75, shots: 2, integrity: 0.5 }));
  assert.deepEqual(fourth.missions.outpost, { stars: 3, bestTime: 60, bestShots: 2, clears: 4 });
  assert.deepEqual(initial, fresh());
  assert.deepEqual(first.missions.gate, fresh().missions.gate);
});

test('failed, unknown, or sandbox runs do not create records, and malformed times cannot become false bests', () => {
  const progress = recordCompletion(null, 'gate', win({ elapsed: 89, shots: 4 }));
  for (const id of ['sandbox', 'unknown', '__proto__']) assert.deepEqual(recordCompletion(progress, id, win()), progress);
  for (const stats of [win({ won: false }), win({ won: 'true' }), null, undefined]) {
    assert.deepEqual(recordCompletion(progress, 'gate', stats), progress);
  }
  const badSuccess = recordCompletion(progress, 'gate', win({ elapsed: Infinity, shots: -1, integrity: 3 }));
  assert.equal(badSuccess.missions.gate.bestTime, 89);
  assert.equal(badSuccess.missions.gate.bestShots, 4);
  assert.equal(badSuccess.missions.gate.clears, 2);
  const noMeasurements = recordCompletion(null, 'outpost', { won: true });
  assert.deepEqual(noMeasurements.missions.outpost, { stars: 1, bestTime: null, bestShots: null, clears: 1 });
});

test('many successful records remain monotonic, JSON-safe, and isolated by mission', () => {
  let progress = fresh();
  for (let i = 0; i < 40; i++) {
    const stats = win({ elapsed: 5 + (i * 37) % 151, shots: (i * 7) % 13, integrity: [0.5, 0.75, 1][i % 3] });
    const old = progress;
    progress = recordCompletion(old, 'outpost', stats);
    assert.equal(progress.missions.outpost.clears, i + 1);
    assert.ok(progress.missions.outpost.stars >= old.missions.outpost.stars);
    if (old.missions.outpost.bestTime !== null) assert.ok(progress.missions.outpost.bestTime <= old.missions.outpost.bestTime);
    if (old.missions.outpost.bestShots !== null) assert.ok(progress.missions.outpost.bestShots <= old.missions.outpost.bestShots);
    assert.deepEqual(progress.missions.gate, fresh().missions.gate);
    assert.deepEqual(JSON.parse(JSON.stringify(progress)), progress);
  }
  progress.missions.outpost.clears = Number.MAX_SAFE_INTEGER;
  const capped = recordCompletion(progress, 'outpost', win());
  assert.equal(capped.missions.outpost.clears, Number.MAX_SAFE_INTEGER);
});

test('next mission follows campaign order, excludes sandbox, and never wraps at the end', () => {
  assert.equal(nextCampaignMission('outpost'), 'gate');
  assert.equal(nextCampaignMission('gate'), 'citadel');
  assert.equal(nextCampaignMission('citadel'), 'harbor');
  assert.equal(nextCampaignMission('harbor'), 'skyway');
  assert.equal(nextCampaignMission('skyway'), 'switchback');
  for (const id of ['switchback', 'sandbox', 'missing', '__proto__', null, undefined]) assert.equal(nextCampaignMission(id), null);
});

test('route third star depends on integrity alone and time still uses mission-specific bounds', () => {
  for (const [id, parTime] of [['harbor', 55], ['skyway', 45], ['switchback', 45]]) {
    for (const shots of [0, 99, undefined, null, NaN, Infinity]) {
      const result = scoreRun(id, win({ elapsed: parTime, shots }));
      assert.equal(result.stars, 3);
      assert.equal(result.precisionStar, true, 'route integrity star must not use the shot counter');
      assert.ok(Number.isFinite(result.shots));
    }
    assert.equal(scoreRun(id, win({ elapsed: parTime + 0.001, shots: 0 })).stars, 2);
    assert.equal(scoreRun(id, win({ elapsed: parTime, integrity: 0.749, shots: 0 })).stars, 2);
    assert.equal(scoreRun(id, win({ elapsed: parTime + 1, integrity: 0.5, shots: 0 })).stars, 1);
    assert.equal(scoreRun(id, win({ elapsed: 1, integrity: 1, won: false })).stars, 0);
    for (const integrity of [null, undefined, '1', -1, 1.1, NaN, Infinity]) {
      assert.equal(scoreRun(id, win({ integrity })).precisionStar, false);
    }
  }
});

test('version 1 land records survive extension and route best records stay independent', () => {
  const legacy = freezeDeep({ version: 1, missions: {
    outpost: { stars: 2, bestTime: 75.5, bestShots: 4, clears: 3 },
    gate: { stars: 3, bestTime: 88, bestShots: 3, clears: 2 },
    citadel: { stars: 1, bestTime: 160, bestShots: 14, clears: 1 },
  } });
  const upgraded = normalizeProgress(legacy);
  assert.equal(upgraded.version, 1);
  for (const id of ['outpost', 'gate', 'citadel']) assert.deepEqual(upgraded.missions[id], legacy.missions[id]);
  for (const id of ['harbor', 'skyway']) assert.deepEqual(upgraded.missions[id], fresh().missions[id]);
  const first = recordCompletion(legacy, 'harbor', win({ elapsed: 54, shots: 2, checkpoints: 3 }));
  const second = recordCompletion(first, 'harbor', win({ elapsed: 80, shots: 0, integrity: 0.4 }));
  assert.deepEqual(second.missions.harbor, { stars: 3, bestTime: 54, bestShots: 0, clears: 2 });
  for (const id of ['outpost', 'gate', 'citadel']) assert.deepEqual(second.missions[id], legacy.missions[id]);
  assert.deepEqual(normalizeProgress(JSON.parse(JSON.stringify(second))), second);
  assert.deepEqual(second.missions.skyway, fresh().missions.skyway);
});

test('V3 water and flight records are preserved when the steering mission is added', () => {
  const v3 = { version: 1, missions: {
    harbor: { stars: 3, bestTime: 10, bestShots: 0, clears: 4 },
    skyway: { stars: 2, bestTime: 12.5, bestShots: 0, clears: 2 },
  } };
  const migrated = normalizeProgress(freezeDeep(v3));
  for (const id of ['harbor', 'skyway']) assert.deepEqual(migrated.missions[id], v3.missions[id]);
  assert.deepEqual(migrated.missions.switchback, fresh().missions.switchback);
  const completed = recordCompletion(migrated, 'switchback', win({ elapsed: 44, shots: 0, cost: 39 }));
  assert.deepEqual(completed.missions.switchback, { stars: 3, bestTime: 44, bestShots: 0, clears: 1 });
  assert.deepEqual(completed.missions.skyway, v3.missions.skyway);
});
