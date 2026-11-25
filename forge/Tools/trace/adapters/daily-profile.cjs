'use strict';
// autotest-showcase-daily-profile.cjs 출력(history.jsonl 의 runRecord 줄, 또는 runs/<date>/report.json) → TraceSample v1.
// 원시 프레임 배열은 저장되지 않으므로 대부분 사전 집계(.p50/.p95/.max) 또는 1회 측정(wall) 샘플이 된다.
const fs = require('node:fs');
const { makeSample } = require('../trace-sample.cjs');
const { num, mbToBytes } = require('./common.cjs');
const { unknownBuildId } = require('../build-id.cjs');

const SOURCE = 'daily-profile';

// [JSON 경로(템플릿 결과 기준), 지표, 단위, 시계 도메인, 변환]
const TEMPLATE_FIELDS = [
  ['api.templateGetMs', 'api.template_get_ms', 'ms', 'wall'],
  ['api.showcaseAddonGetMs', 'api.showcase_addon_get_ms', 'ms', 'wall'],
  ['api.projectCreateMs', 'api.project_create_ms', 'ms', 'wall'],
  ['headless.prepareMs', 'godot.prepare_ms', 'ms', 'wall'],
  ['headless.importMs', 'godot.import_ms', 'ms', 'wall'],
  ['headless.replayMs', 'godot.replay_ms', 'ms', 'wall'],
  ['headless.peakRssMb', 'mem.godot_process_bytes.max', 'bytes', 'wall', 'mb'],
  ['web.loading.launcherLoadMs', 'load.launcher_ms', 'ms', 'wall'],
  ['web.loading.editorIframeMs', 'load.editor_iframe_ms', 'ms', 'wall'],
  ['web.loading.wasmTransferMs', 'load.wasm_transfer_ms', 'ms', 'wall'],
  ['web.loading.wasmTransferMb', 'load.wasm_transfer_bytes', 'bytes', 'wall', 'mb'],
  ['web.loading.wasmBootReadyMs', 'load.wasm_boot_ready_ms', 'ms', 'wall'],
  ['web.loading.firstCueMs', 'load.first_cue_ms', 'ms', 'wall'],
  ['web.loading.replayWallMs', 'replay.wall_ms', 'ms', 'wall'],
  ['web.response.apiP50Ms', 'api.response_ms.p50', 'ms', 'wall'],
  ['web.response.apiP95Ms', 'api.response_ms.p95', 'ms', 'wall'],
  ['web.response.apiMaxMs', 'api.response_ms.max', 'ms', 'wall'],
  ['web.performance.frameP50Ms', 'frame.wall_ms.p50', 'ms', 'engine_frame'],
  ['web.performance.frameP95Ms', 'frame.wall_ms.p95', 'ms', 'engine_frame'],
  ['web.performance.frameMaxMs', 'frame.wall_ms.max', 'ms', 'engine_frame'],
  ['web.performance.samples', 'frame.sample_count', 'count', 'wall'],
  ['web.performance.longFramesOver50ms', 'hitch.frame_over_50ms_count', 'count', 'wall'],
  ['web.memory.jsHeapPeakMb', 'mem.js_heap_bytes.max', 'bytes', 'wall', 'mb'],
  ['web.memory.jsHeapEndMb', 'mem.js_heap_end_bytes', 'bytes', 'wall', 'mb'],
  ['web.memory.wasmHeapPeakMb', 'mem.wasm_heap_bytes.max', 'bytes', 'wall', 'mb'],
  ['web.memory.domNodesPeak', 'obj.dom_node_count.max', 'count', 'wall'],
  ['web.memory.serverPeakRssMb', 'mem.server_process_bytes.max', 'bytes', 'wall', 'mb'],
];
// 제외: fpsAvg/fpsP10(frame_ms 에서 파생), 검증 플래그(checks.*)

function get(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
}

function parseRecords(file) {
  const text = fs.readFileSync(file, 'utf8');
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && !trimmed.includes('\n{')) {
    const j = JSON.parse(trimmed);
    return [j.run || j];
  }
  return trimmed.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l)).map(j => j.run || j);
}

function convertDailyRecord(run, opts = {}) {
  const ts = Number.isFinite(Date.parse(run.timestampKst)) ? new Date(Date.parse(run.timestampKst)).toISOString() : new Date(0).toISOString();
  const sha = run.git && /^[0-9a-f]{7,40}$/i.test(run.git.sha || '') ? run.git.sha.slice(0, 7).toLowerCase() : null;
  const buildId = opts.buildId || unknownBuildId(sha);
  // runRecord 에는 장치 정보가 없다 → unknown (TRACE_SAMPLE.md 에 개선 제안 기록)
  const device = opts.device || {};
  const out = [];
  for (const t of run.templates || []) {
    const tags = { run: String(run.runId || run.date || 'unknown'), template: String(t.id), mode: String(run.mode || 'unknown') };
    for (const [p, metric, unit, clock, conv] of TEMPLATE_FIELDS) {
      const parent = p.split('.')[0];
      if (t[parent] && t[parent].skipped) continue;
      let v = num(get(t, p));
      if (v === null) continue;
      if (conv === 'mb') v = mbToBytes(v);
      out.push(makeSample({ build_id: buildId, source: SOURCE, device, clock_domain: clock, metric, value: v, unit, exact: true, ts, tags }));
    }
  }
  return out;
}

function convertDailyProfile(file, opts = {}) {
  const runs = parseRecords(file);
  const samples = runs.flatMap(r => convertDailyRecord(r, opts));
  return { samples, meta: { runs: runs.length } };
}

module.exports = { SOURCE, TEMPLATE_FIELDS, convertDailyRecord, convertDailyProfile };
