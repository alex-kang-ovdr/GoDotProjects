'use strict';
// ISMProfile 결과 폴더(environment.json + samples.csv + summary.csv) → TraceSample v1.
// Godot(ISMProfile/results/godot/*)와 Unreal(ISMProfile/results/unreal/*/Profile) 두 형식을 모두 받는다.
const fs = require('node:fs');
const path = require('node:path');
const { makeSample } = require('../trace-sample.cjs');
const { readCsv, readJson, num, mbToBytes, isoUtc } = require('./common.cjs');

const SOURCE = 'ism-profile';

// 프레임별 열 → 지표. engine 별로 의미가 다른 열은 이름을 나눈다.
const FRAME_COLUMNS = {
  godot: [
    ['frame_ms', 'frame.wall_ms', 'ms'], // 연속 _process 사이 벽시계 간격
    // Performance.TIME_PROCESS: 엔진이 1초마다 갱신하는 "직전 1초 최대값" → 프레임마다 같은 값이 반복된다.
    // 원시 샘플로 세면 p50/p95가 왜곡되므로 값이 바뀔 때만 사전 집계(.max, window=1s) 샘플로 낸다.
    ['game_ms', 'frame.cpu_ms.max', 'ms', 'window_max'],
    ['render_ms', 'render.cpu_ms', 'ms'], // viewport_get_measured_render_time_cpu
    ['gpu_ms', 'gpu.render_ms', 'ms'], // viewport_get_measured_render_time_gpu
    ['draw_calls', 'draw.calls', 'count'],
    ['primitives', 'draw.primitives', 'count'],
    ['objects', 'draw.objects', 'count'],
  ],
  unreal: [
    ['frame_ms', 'frame.wall_ms', 'ms'],
    ['game_ms', 'frame.game_thread_ms', 'ms'],
    ['render_ms', 'render.cpu_ms', 'ms'],
    ['gpu_ms', 'gpu.render_ms', 'ms'], // 0 = GPU 타이머 미가용 (environment.method) → 생략
    ['process_memory_mb', 'mem.process_bytes', 'bytes'],
  ],
};

// 케이스(summary.csv) 단위 1회 측정값 → wall 도메인 샘플
const CASE_COLUMNS = [
  ['generate_ms', 'build.generate_ms', 'ms'],
  ['build_submit_ms', 'build.submit_ms', 'ms'],
  ['first_frame_ms', 'load.first_frame_ms', 'ms'],
  ['process_memory_mb', 'mem.process_bytes', 'bytes'],
  ['video_mem_mb', 'mem.video_bytes', 'bytes'],
  ['static_mem_mb', 'mem.static_bytes', 'bytes'],
];

function detectEngine(env) {
  return /^godot/i.test(String(env.engine || '')) ? 'godot' : 'unreal';
}

/**
 * @param {string} dir ISMProfile 결과 폴더
 * @param {{buildId:string}} opts
 */
function convertIsmProfile(dir, opts = {}) {
  const env = readJson(path.join(dir, 'environment.json'));
  const engine = detectEngine(env);
  const ts = isoUtc(env.timestamp_utc);
  const device = { os: env.platform, cpu: env.cpu, gpu: env.gpu, driver: env.driver_version };
  const buildId = opts.buildId || 'unknown-nogit';
  const summaryFile = path.join(dir, 'summary.csv');
  const summary = fs.existsSync(summaryFile) ? readCsv(summaryFile) : [];
  const caseInfo = new Map(summary.map(r => [String(r.case), r]));
  const baseTags = { engine, rhi: String(env.rhi || env.tag || 'unknown'), run: path.basename(path.resolve(dir)) === 'Profile' ? path.basename(path.dirname(path.resolve(dir))) : path.basename(path.resolve(dir)) };
  const tagsFor = c => {
    const r = caseInfo.get(String(c)) || {};
    const t = { ...baseTags, case: Number(c) };
    if (r.mode) t.mode = r.mode;
    if (r.size) t.size = Number(r.size);
    if (r.repeat) t.repeat = Number(r.repeat);
    return t;
  };

  const out = [];
  const skipped = { gpu_unavailable: 0, window_repeat: 0 };
  const lastWindow = new Map();
  const samplesFile = path.join(dir, 'samples.csv');
  if (fs.existsSync(samplesFile)) {
    const rows = readCsv(samplesFile);
    for (const row of rows) {
      const frame = num(row.frame);
      if (frame === null) continue;
      const tags = tagsFor(row.case);
      for (const [col, metric, unit, mode] of FRAME_COLUMNS[engine]) {
        if (!(col in row)) continue;
        let v = num(row[col]);
        if (v === null) continue;
        if (mode === 'window_max') {
          const k = `${row.case}|${col}`;
          if (lastWindow.get(k) === v) { skipped.window_repeat++; continue; }
          lastWindow.set(k, v);
          out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: 'engine_frame', frame, metric, value: v, unit, exact: true, ts, tags: { ...tags, window: '1s' } }));
          continue;
        }
        if (engine === 'unreal' && col === 'gpu_ms' && v === 0) { skipped.gpu_unavailable++; continue; }
        if (unit === 'bytes') v = mbToBytes(v);
        out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: 'engine_frame', frame, metric, value: v, unit, exact: true, ts, tags }));
      }
    }
  }
  for (const r of summary) {
    const tags = tagsFor(r.case);
    for (const [col, metric, unit] of CASE_COLUMNS) {
      let v = num(r[col]);
      if (v === null) continue;
      if (unit === 'bytes') v = mbToBytes(v);
      out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: 'wall', metric, value: v, unit, exact: true, ts, tags }));
    }
  }
  return { samples: out, meta: { engine, ts, cases: summary.length, skipped } };
}

module.exports = { SOURCE, FRAME_COLUMNS, CASE_COLUMNS, convertIsmProfile };
