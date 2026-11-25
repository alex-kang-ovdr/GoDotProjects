'use strict';
// summarize.cjs: nearest-rank 백분위, 그룹 키, 원시/사전 집계 분리.
const test = require('node:test');
const assert = require('node:assert/strict');
const { percentile, stats, summarize, formatTable } = require('../../Tools/trace/summarize.cjs');
const { makeSample } = require('../../Tools/trace/trace-sample.cjs');

const dev = { os: 'Windows', cpu: 'c', gpu: 'g', driver: 'd' };
const ts = '2026-11-25T00:00:00.000Z';
const raw = (metric, value, frame, tags) => makeSample({ build_id: 'b1', source: 'godot-runtime', device: dev, clock_domain: 'engine_frame', frame, metric, value, unit: 'ms', exact: true, ts, tags });

test('nearest-rank 백분위는 항상 실제 샘플 값이다', () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(percentile(v, 50), 50);
  assert.equal(percentile(v, 95), 95);
  assert.equal(percentile(v, 99), 99);
  assert.equal(percentile(v, 100), 100);
  assert.equal(percentile([7], 99), 7);
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  const s = stats([4, 1, 3, 2]);
  assert.deepEqual([s.n, s.min, s.p50, s.max, s.mean], [4, 1, 2, 4, 2.5]);
  assert.equal(s.stdev, Math.round(Math.sqrt(5 / 3) * 1e4) / 1e4);
});

test('지표별·태그별로 묶고 사전 집계 지표는 따로 둔다', () => {
  const samples = [];
  for (let i = 0; i < 20; i++) samples.push(raw('frame.wall_ms', i < 19 ? 16 : 40, i, { mode: i % 2 ? 'A' : 'B' }));
  const agg = raw('frame.wall_ms.p95', 30, 0);
  samples.push(agg);
  const all = summarize(samples);
  assert.equal(all.totalSamples, 21);
  assert.equal(all.metrics.length, 1);
  assert.deepEqual([all.metrics[0].n, all.metrics[0].p50, all.metrics[0].p95, all.metrics[0].max], [20, 16, 16, 40]);
  assert.equal(all.preAggregated.length, 1);
  assert.equal(all.preAggregated[0].metric, 'frame.wall_ms.p95');
  assert.deepEqual(all.buildIds, ['b1']);
  assert.equal(all.percentileMethod, 'nearest-rank');
  const byMode = summarize(samples, { groupBy: ['mode'] });
  assert.deepEqual(byMode.metrics.map(m => [m.mode, m.n]).sort(), [['A', 10], ['B', 10]]);
  assert.match(formatTable(byMode), /frame\.wall_ms \(mode=A\)/);
});

test('측정값과 추정값(exact=false)은 같은 지표라도 섞지 않는다', () => {
  const a = raw('frame.wall_ms', 1, 0);
  const b = { ...raw('frame.wall_ms', 100, 1), exact: false };
  const s = summarize([a, b]);
  assert.equal(s.metrics.length, 2);
  assert.deepEqual(s.metrics.map(m => m.exact).sort(), [false, true]);
});
