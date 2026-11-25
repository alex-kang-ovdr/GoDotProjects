'use strict';
// TraceSample v1 — 계약 상수·검증기·JSONL 입출력 (정본 문서: docs/profiling/TRACE_SAMPLE.md).
// JSON Schema(trace-sample.schema.json)와 같은 규칙을 의존성 없이 검사한다.
const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = 1;
const SCHEMA_PATH = path.join(__dirname, 'trace-sample.schema.json');
const CLOCK_DOMAINS = Object.freeze(['engine_frame', 'physics_tick', 'wall']);
const UNITS = Object.freeze(['ms', 'bytes', 'count']);
const AGGREGATE_STATS = Object.freeze(['p50', 'p95', 'p99', 'mean', 'min', 'max']);
const REQUIRED = Object.freeze(['schemaVersion', 'build_id', 'source', 'device', 'clock_domain', 'metric', 'value', 'unit', 'exact', 'ts']);
const OPTIONAL = Object.freeze(['frame', 'tick', 'tags']);
const DEVICE_FIELDS = Object.freeze(['os', 'cpu', 'gpu', 'driver']);
const KNOWN_SOURCES = Object.freeze(['godot-runtime', 'ism-profile', 'havok-profile', 'daily-profile', 'desktop-shader-telemetry']);

const METRIC_RE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;
const SOURCE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;
const AGG_RE = new RegExp(`\\.(${AGGREGATE_STATS.join('|')})$`);

function isAggregateMetric(metric) {
  return AGG_RE.test(String(metric || ''));
}

function baseMetric(metric) {
  return String(metric || '').replace(AGG_RE, '');
}

function validateSample(s) {
  const errors = [];
  if (!s || typeof s !== 'object' || Array.isArray(s)) return ['sample must be an object'];
  for (const k of REQUIRED) if (!(k in s)) errors.push(`missing required field "${k}"`);
  for (const k of Object.keys(s)) if (!REQUIRED.includes(k) && !OPTIONAL.includes(k)) errors.push(`unknown field "${k}"`);
  if ('schemaVersion' in s && s.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  if ('build_id' in s && (typeof s.build_id !== 'string' || !s.build_id || s.build_id.length > 200)) errors.push('build_id must be a non-empty string (<=200)');
  if ('source' in s && (typeof s.source !== 'string' || !SOURCE_RE.test(s.source))) errors.push('source must be kebab-case');
  if ('device' in s) {
    const d = s.device;
    if (!d || typeof d !== 'object' || Array.isArray(d)) errors.push('device must be an object');
    else {
      for (const k of DEVICE_FIELDS) if (typeof d[k] !== 'string' || !d[k]) errors.push(`device.${k} must be a non-empty string`);
      for (const k of Object.keys(d)) if (!DEVICE_FIELDS.includes(k)) errors.push(`unknown field "device.${k}"`);
    }
  }
  if ('clock_domain' in s && !CLOCK_DOMAINS.includes(s.clock_domain)) errors.push(`clock_domain must be one of ${CLOCK_DOMAINS.join('|')}`);
  for (const k of ['frame', 'tick']) {
    if (k in s && !(Number.isInteger(s[k]) && s[k] >= 0)) errors.push(`${k} must be a non-negative integer`);
  }
  if ('metric' in s && (typeof s.metric !== 'string' || !METRIC_RE.test(s.metric))) errors.push('metric must be dot.namespaced lower_snake (e.g. frame.cpu_ms)');
  if ('value' in s && !(typeof s.value === 'number' && Number.isFinite(s.value))) errors.push('value must be a finite number');
  if ('unit' in s && !UNITS.includes(s.unit)) errors.push(`unit must be one of ${UNITS.join('|')}`);
  if ('exact' in s && typeof s.exact !== 'boolean') errors.push('exact must be boolean');
  if ('ts' in s && (typeof s.ts !== 'string' || !ISO_RE.test(s.ts) || !Number.isFinite(Date.parse(s.ts)))) errors.push('ts must be an ISO-8601 date-time with timezone');
  if ('tags' in s) {
    const t = s.tags;
    if (!t || typeof t !== 'object' || Array.isArray(t)) errors.push('tags must be an object');
    else for (const [k, v] of Object.entries(t)) if (!['string', 'number', 'boolean'].includes(typeof v)) errors.push(`tags.${k} must be string|number|boolean`);
  }
  // 단위 ↔ 지표 이름 접미사 일치 (schema allOf 규칙과 동일)
  if (typeof s.metric === 'string' && METRIC_RE.test(s.metric)) {
    const b = baseMetric(s.metric);
    if (s.unit === 'ms' && !b.endsWith('_ms')) errors.push('unit "ms" requires metric ending in _ms');
    if (s.unit === 'bytes' && !b.endsWith('_bytes')) errors.push('unit "bytes" requires metric ending in _bytes');
    if (s.unit === 'count' && (b.endsWith('_ms') || b.endsWith('_bytes'))) errors.push('unit "count" must not use _ms/_bytes metric names');
    // 원시 샘플은 시계 도메인에 맞는 인덱스를 가져야 한다 (사전 집계 지표는 예외)
    if (!isAggregateMetric(s.metric)) {
      if (s.clock_domain === 'engine_frame' && !('frame' in s)) errors.push('engine_frame raw sample requires "frame"');
      if (s.clock_domain === 'physics_tick' && !('tick' in s)) errors.push('physics_tick raw sample requires "tick"');
    }
  }
  return errors;
}

function parseJsonl(text) {
  const samples = [];
  const errors = [];
  const lines = String(text).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    let obj;
    try { obj = JSON.parse(line); } catch (e) { errors.push({ line: i + 1, errors: [`invalid JSON: ${e.message}`] }); return; }
    const errs = validateSample(obj);
    if (errs.length) errors.push({ line: i + 1, errors: errs });
    else samples.push(obj);
  });
  return { samples, errors, count: samples.length + errors.length };
}

function validateJsonlFile(file) {
  return parseJsonl(fs.readFileSync(file, 'utf8'));
}

function toJsonl(samples) {
  return samples.map(s => JSON.stringify(s)).join('\n') + (samples.length ? '\n' : '');
}

function writeJsonl(file, samples) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, toJsonl(samples), 'utf8');
}

function normalizeDevice(d = {}) {
  const pick = v => (typeof v === 'string' && v.trim() ? v.trim() : 'unknown');
  return { os: pick(d.os), cpu: pick(d.cpu), gpu: pick(d.gpu), driver: pick(d.driver) };
}

// 샘플 생성 헬퍼: 키 순서를 고정하고 선택 필드는 값이 있을 때만 넣는다.
function makeSample({ build_id, source, device, clock_domain, frame, tick, metric, value, unit, exact, ts, tags }) {
  const s = { schemaVersion: SCHEMA_VERSION, build_id, source, device: normalizeDevice(device), clock_domain };
  if (frame !== undefined && frame !== null) s.frame = frame;
  if (tick !== undefined && tick !== null) s.tick = tick;
  Object.assign(s, { metric, value, unit, exact: Boolean(exact), ts });
  if (tags && Object.keys(tags).length) s.tags = tags;
  return s;
}

module.exports = {
  SCHEMA_VERSION,
  SCHEMA_PATH,
  CLOCK_DOMAINS,
  UNITS,
  AGGREGATE_STATS,
  REQUIRED,
  OPTIONAL,
  DEVICE_FIELDS,
  KNOWN_SOURCES,
  isAggregateMetric,
  baseMetric,
  validateSample,
  parseJsonl,
  validateJsonlFile,
  toJsonl,
  writeJsonl,
  normalizeDevice,
  makeSample,
};

if (require.main === module) {
  // 사용법: node forge/Tools/trace/trace-sample.cjs <file.jsonl> [...]
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: trace-sample.cjs <file.jsonl> [...]'); process.exit(2); }
  let bad = 0;
  for (const f of files) {
    const r = validateJsonlFile(f);
    console.log(`${f}: ${r.samples.length}/${r.count} valid`);
    for (const e of r.errors.slice(0, 10)) console.log(`  line ${e.line}: ${e.errors.join('; ')}`);
    if (r.errors.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
