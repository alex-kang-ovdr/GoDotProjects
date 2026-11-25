'use strict';
// 기존 프로파일 출력(ISMProfile·HavokProfile·daily-profile) → TraceSample 어댑터 계약.
// 고정 입력은 fixtures/ 의 실제 결과 일부 발췌, 마지막 테스트는 저장소의 ISMProfile 실데이터 왕복 대조.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateSample } = require('../../Tools/trace/trace-sample.cjs');
const { convertIsmProfile } = require('../../Tools/trace/adapters/ism-profile.cjs');
const { convertHavokProfile } = require('../../Tools/trace/adapters/havok-profile.cjs');
const { convertDailyProfile } = require('../../Tools/trace/adapters/daily-profile.cjs');
const { readCsv } = require('../../Tools/trace/adapters/common.cjs');
const { summarize } = require('../../Tools/trace/summarize.cjs');

const FX = path.join(__dirname, 'fixtures');
const REPO = path.resolve(__dirname, '..', '..', '..');

function allValid(samples) {
  const bad = samples.map(s => [s, validateSample(s)]).filter(([, e]) => e.length);
  assert.deepEqual(bad.slice(0, 3).map(([s, e]) => `${s.metric}: ${e.join('; ')}`), []);
}

const of = (samples, metric) => samples.filter(s => s.metric === metric);

test('ISMProfile(Godot) → 프레임 원시 샘플 + 케이스 단위 샘플', () => {
  const { samples, meta } = convertIsmProfile(path.join(FX, 'ism-godot'), { buildId: 'unknown-test' });
  allValid(samples);
  assert.equal(meta.engine, 'godot');
  const wall = of(samples, 'frame.wall_ms');
  assert.equal(wall.length, 12);
  assert.deepEqual(wall[0], {
    schemaVersion: 1, build_id: 'unknown-test', source: 'ism-profile',
    device: { os: 'Windows', cpu: '13th Gen Intel(R) Core(TM) i9-13900HX', gpu: 'NVIDIA GeForce RTX 4070 Laptop GPU', driver: '1.4.341' },
    clock_domain: 'engine_frame', frame: 0, metric: 'frame.wall_ms', value: 2.729, unit: 'ms', exact: true,
    ts: '2026-11-20T05:45:27.000Z', tags: { engine: 'godot', rhi: 'vulkan', run: 'ism-godot', case: 0, mode: 'ISM', size: 48, repeat: 0 },
  });
  // TIME_PROCESS(1초 구간 최대) 열은 값이 바뀔 때만 .max 샘플 → case0: 52.473, 3.846, 3.952 / case1: 54.54
  const cpu = of(samples, 'frame.cpu_ms.max');
  assert.deepEqual(cpu.map(s => [s.tags.case, s.frame, s.value]), [[0, 0, 52.473], [0, 464, 3.846], [0, 1004, 3.952], [1, 0, 54.54]]);
  assert.ok(cpu.every(s => s.tags.window === '1s'));
  assert.equal(meta.skipped.window_repeat, 8);
  assert.equal(of(samples, 'frame.cpu_ms').length, 0, 'TIME_PROCESS 를 원시 frame.cpu_ms 로 내면 안 된다');
  assert.equal(of(samples, 'draw.objects').find(s => s.tags.case === 1).value, 4822);
  const mem = of(samples, 'mem.process_bytes');
  assert.equal(mem.length, 2);
  assert.equal(mem[0].clock_domain, 'wall');
  assert.equal(mem[0].value, Math.round(556.355 * 1024 * 1024));
});

test('ISMProfile(Unreal) → GPU 타이머 0(미가용)은 버리고 메모리는 bytes 로', () => {
  const { samples, meta } = convertIsmProfile(path.join(FX, 'ism-unreal', 'Profile'), { buildId: 'unknown-test' });
  allValid(samples);
  assert.equal(meta.engine, 'unreal');
  assert.equal(meta.skipped.gpu_unavailable, 1);
  assert.equal(of(samples, 'gpu.render_ms').length, 3);
  assert.equal(of(samples, 'frame.game_thread_ms').length, 4);
  assert.equal(of(samples, 'frame.cpu_ms.max').length, 0);
  assert.equal(samples[0].tags.run, 'ism-unreal');
  assert.equal(samples[0].device.driver, 'unknown');
  assert.equal(of(samples, 'mem.process_bytes')[0].unit, 'bytes');
});

test('HavokProfile → summary.csv 는 사전 집계, ticks.csv 는 physics_tick 원시 샘플', () => {
  const { samples, meta } = convertHavokProfile(path.join(FX, 'havok-batch'), { buildId: 'unknown-0e3abe9' });
  allValid(samples);
  assert.equal(meta.cases, 2);
  assert.equal(meta.rawTicks, 2);
  const p99 = of(samples, 'physics.step_ms.p99');
  assert.deepEqual(p99.map(s => s.value), [10.387, 4.061]);
  assert.ok(p99.every(s => s.clock_domain === 'physics_tick' && s.tick === undefined));
  assert.deepEqual(of(samples, 'frame.wall_ms.p95').map(s => s.value), [0.314, 0.331]);
  assert.equal(of(samples, 'mem.private_bytes.max')[0].value, Math.round(1038.57 * 1024 * 1024));
  // ticks.csv phys_ms 는 TIME_PHYSICS_PROCESS(1초 창 최대) → .max, 값이 바뀔 때만 / hk_* 는 틱별 원시
  const win = of(samples, 'physics.step_ms.max').filter(s => s.tick !== undefined);
  assert.deepEqual(win.map(s => [s.tick, s.value, s.tags.window]), [[1, 0.985, '1s'], [2, 10.387, '1s']]);
  assert.equal(of(samples, 'physics.step_ms').length, 0);
  assert.deepEqual(of(samples, 'havok.step_ms').map(s => [s.tick, s.value]), [[1, 0.396], [2, 0.41]]);
  assert.ok(p99.every(s => s.tags.basis === 'time_physics_process_1s_window_max'));
  assert.equal(samples[0].tags.physics_engine, 'HavokPhysics');
  assert.equal(samples[0].device.gpu, 'NVIDIA GeForce RTX 4070 Ti');
  assert.ok(!samples.some(s => /state_hash/.test(s.metric)), '결정성 해시는 성능 지표가 아니다');
  const sum = summarize(samples);
  assert.equal(sum.metrics.find(m => m.metric === 'havok.step_ms').n, 2);
  assert.ok(sum.preAggregated.some(m => m.metric === 'physics.step_ms.p99'));
});

test('daily-profile history.jsonl → 템플릿별 집계·1회 측정 샘플, build_id 는 git sha 귀속', () => {
  const { samples, meta } = convertDailyProfile(path.join(FX, 'daily', 'history.jsonl'));
  allValid(samples);
  assert.equal(meta.runs, 1);
  assert.ok(samples.every(s => s.build_id === 'unknown-78e6d63'));
  assert.ok(samples.every(s => s.ts === '2026-11-21T05:12:21.000Z'));
  const p95 = of(samples, 'frame.wall_ms.p95');
  assert.deepEqual(p95.map(s => [s.tags.template, s.value]), [['brawllabs', 18.24]]); // 두 번째 템플릿은 web.skipped
  assert.equal(of(samples, 'godot.import_ms').length, 2);
  assert.equal(of(samples, 'mem.js_heap_bytes.max')[0].value, Math.round(125.5 * 1024 * 1024));
  assert.equal(samples[0].device.os, 'unknown');
  // report.json({run, trend}) 형식도 받는다
  const tmp = path.join(FX, 'daily', 'history.jsonl');
  const rec = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  const { convertDailyRecord } = require('../../Tools/trace/adapters/daily-profile.cjs');
  assert.equal(convertDailyRecord(rec).length, samples.length);
});

const ISM_REAL = path.join(REPO, 'ISMProfile', 'results', 'godot', 'gd-r2-vulkan');
test('ISMProfile 실데이터 왕복: TraceSample 요약 p50/p95 == 원본 summary.csv', { skip: !fs.existsSync(path.join(ISM_REAL, 'samples.csv')) && 'ISMProfile 결과 없음' }, () => {
  const { samples } = convertIsmProfile(ISM_REAL, { buildId: 'unknown-test' });
  const sum = summarize(samples.filter(s => s.metric === 'frame.wall_ms'), { groupBy: ['case'] });
  const orig = readCsv(path.join(ISM_REAL, 'summary.csv'));
  assert.equal(sum.metrics.length, orig.length);
  for (const row of orig) {
    const m = sum.metrics.find(x => x.case === Number(row.case));
    assert.equal(m.n, Number(row.samples), `case ${row.case} n`);
    assert.equal(m.p50, Number(row.frame_p50_ms), `case ${row.case} p50`);
    assert.equal(m.p95, Number(row.frame_p95_ms), `case ${row.case} p95`);
  }
});
