'use strict';
// HavokProfile 결과 폴더(origin/Forge-HavokPhysics: HavokProfile/results/<tag>) → TraceSample v1.
//  - summary.csv(커밋됨): 케이스별 사전 집계값 → "<지표>.<p50|p95|p99|mean|max>" 집계 샘플
//  - ticks.csv(.gitignore, 로컬 실행 시에만 존재): 물리 틱별 원시값 → physics_tick 원시 샘플
const fs = require('node:fs');
const path = require('node:path');
const { makeSample } = require('../trace-sample.cjs');
const { readCsv, readJson, num, mbToBytes, isoUtc } = require('./common.cjs');

const SOURCE = 'havok-profile';

// summary.csv 열 → [지표, 단위, 시계 도메인]
const SUMMARY_COLUMNS = [
  ['build_ms', 'build.world_ms', 'ms', 'wall'],
  ['frame_mean_ms', 'frame.wall_ms.mean', 'ms', 'engine_frame'],
  ['frame_p50_ms', 'frame.wall_ms.p50', 'ms', 'engine_frame'],
  ['frame_p95_ms', 'frame.wall_ms.p95', 'ms', 'engine_frame'],
  ['frame_p99_ms', 'frame.wall_ms.p99', 'ms', 'engine_frame'],
  ['frame_max_ms', 'frame.wall_ms.max', 'ms', 'engine_frame'],
  ['phys_mean_ms', 'physics.step_ms.mean', 'ms', 'physics_tick'],
  ['phys_p50_ms', 'physics.step_ms.p50', 'ms', 'physics_tick'],
  ['phys_p95_ms', 'physics.step_ms.p95', 'ms', 'physics_tick'],
  ['phys_p99_ms', 'physics.step_ms.p99', 'ms', 'physics_tick'],
  ['phys_max_ms', 'physics.step_ms.max', 'ms', 'physics_tick'],
  ['explosion_spike_ms', 'physics.explosion_spike_ms.max', 'ms', 'physics_tick'],
  ['sync_p50_ms', 'physics.sync_ms.p50', 'ms', 'physics_tick'],
  ['hk_step_p50_ms', 'havok.step_ms.p50', 'ms', 'physics_tick'],
  ['hk_collide_p50_ms', 'havok.collide_ms.p50', 'ms', 'physics_tick'],
  ['hk_solve_p50_ms', 'havok.solve_ms.p50', 'ms', 'physics_tick'],
  ['hitch_frame_gt16', 'hitch.frame_over_16ms_count', 'count', 'wall'],
  ['hitch_frame_gt33', 'hitch.frame_over_33ms_count', 'count', 'wall'],
  ['hitch_frame_gt50', 'hitch.frame_over_50ms_count', 'count', 'wall'],
  ['hitch_phys_gt16', 'hitch.physics_over_16ms_count', 'count', 'wall'],
  ['mem_baseline_mb', 'mem.private_baseline_bytes', 'bytes', 'wall'],
  ['mem_after_build_mb', 'mem.private_after_build_bytes', 'bytes', 'wall'],
  ['mem_peak_mb', 'mem.private_bytes.max', 'bytes', 'wall'],
  ['mem_after_cleanup_mb', 'mem.private_after_cleanup_bytes', 'bytes', 'wall'],
  ['static_mem_peak_mb', 'mem.static_bytes.max', 'bytes', 'wall'],
];
// 의도적으로 제외: frame_jitter_p99_p50_ms·mem_delta_*(다른 열에서 파생), state_hash_*(결정성 해시 — 성능 지표 아님, result.json 에 유지)

// phys_ms 는 틱마다 읽은 Performance.TIME_PHYSICS_PROCESS(엔진이 1초마다 갱신하는 구간 최대) → 값이 바뀔 때만 .max
const TICK_COLUMNS = [
  ['phys_ms', 'physics.step_ms.max', 'ms', 'window_max'],
  ['sync_ms', 'physics.sync_ms', 'ms'],
  ['hk_step_ms', 'havok.step_ms', 'ms'],
  ['hk_collide_ms', 'havok.collide_ms', 'ms'],
  ['hk_solve_ms', 'havok.solve_ms', 'ms'],
  ['mem_private_mb', 'mem.private_bytes', 'bytes'],
];

function convertHavokProfile(dir, opts = {}) {
  const env = readJson(path.join(dir, 'environment.json'));
  const ts = isoUtc(env.timestamp_utc);
  const device = { os: env.platform, cpu: env.cpu, gpu: env.headless ? 'none (headless)' : env.gpu, driver: env.driver_version };
  const buildId = opts.buildId || 'unknown-nogit';
  const baseTags = { physics_engine: String(env.physics_engine || 'unknown'), run: String(env.tag || path.basename(path.resolve(dir))), seed: Number(env.seed ?? 0) };
  const out = [];
  const summaryFile = path.join(dir, 'summary.csv');
  const summary = fs.existsSync(summaryFile) ? readCsv(summaryFile) : [];
  for (const r of summary) {
    const tags = { ...baseTags, case: Number(r.case), repeat: Number(r.repeat), size: Number(r.size), ticks: Number(r.ticks) };
    for (const [col, metric, unit, clock] of SUMMARY_COLUMNS) {
      let v = num(r[col]);
      if (v === null) continue;
      if (unit === 'bytes') v = mbToBytes(v);
      // phys_* 통계는 틱마다 읽은 1초 창 최대값의 분포다 → basis 태그로 명시
      const t = /^phys_|^explosion_spike/.test(col) ? { ...tags, basis: 'time_physics_process_1s_window_max' } : tags;
      out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: clock, metric, value: v, unit, exact: true, ts, tags: t }));
    }
  }
  let rawTicks = 0;
  const lastWindow = new Map();
  const ticksFile = path.join(dir, 'ticks.csv');
  if (fs.existsSync(ticksFile)) {
    for (const r of readCsv(ticksFile)) {
      const tick = num(r.tick);
      if (tick === null) continue;
      const tags = { ...baseTags, case: Number(r.case), repeat: Number(r.repeat), size: Number(r.size) };
      for (const [col, metric, unit, mode] of TICK_COLUMNS) {
        let v = num(r[col]);
        if (v === null) continue;
        if (mode === 'window_max') {
          const k = `${r.case}|${col}`;
          if (lastWindow.get(k) === v) continue;
          lastWindow.set(k, v);
          out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: 'physics_tick', tick, metric, value: v, unit, exact: true, ts, tags: { ...tags, window: '1s' } }));
          continue;
        }
        if (unit === 'bytes') v = mbToBytes(v);
        out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: 'physics_tick', tick, metric, value: v, unit, exact: true, ts, tags }));
      }
      rawTicks++;
    }
  }
  return { samples: out, meta: { ts, cases: summary.length, rawTicks, hasRaw: rawTicks > 0 } };
}

module.exports = { SOURCE, SUMMARY_COLUMNS, TICK_COLUMNS, convertHavokProfile };
