'use strict';
// TraceSample v1 계약: JSON Schema ↔ 검증기 일치, 규칙별 거부, build_id 해석 순서, Godot 수집기 지표 이름.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const T = require('../../Tools/trace/trace-sample.cjs');
const { resolveTraceBuildId, unknownBuildId } = require('../../Tools/trace/build-id.cjs');

const COLLECTOR_GD = path.join(__dirname, '..', '..', 'Godot', 'addons', 'playforge_trace', 'trace_collector.gd');

function valid(over = {}) {
  const s = {
    schemaVersion: 1,
    build_id: 'unknown-abc1234',
    source: 'godot-runtime',
    device: { os: 'Windows', cpu: 'cpu', gpu: 'gpu', driver: 'drv' },
    clock_domain: 'engine_frame',
    frame: 10,
    metric: 'frame.wall_ms',
    value: 16.6,
    unit: 'ms',
    exact: true,
    ts: '2026-11-25T01:00:00.000Z',
    ...over,
  };
  for (const k of Object.keys(s)) if (s[k] === undefined) delete s[k];
  return s;
}

test('JSON Schema 파일과 검증기 상수가 같은 계약을 말한다', () => {
  const schema = JSON.parse(fs.readFileSync(T.SCHEMA_PATH, 'utf8'));
  assert.deepEqual([...schema.required].sort(), [...T.REQUIRED].sort());
  assert.deepEqual(Object.keys(schema.properties).sort(), [...T.REQUIRED, ...T.OPTIONAL].sort());
  assert.equal(schema.properties.schemaVersion.const, T.SCHEMA_VERSION);
  assert.deepEqual(schema.properties.clock_domain.enum, [...T.CLOCK_DOMAINS]);
  assert.deepEqual(schema.properties.unit.enum, [...T.UNITS]);
  assert.deepEqual(schema.properties.device.required, [...T.DEVICE_FIELDS]);
  assert.equal(schema.additionalProperties, false);
});

test('유효한 원시·집계 샘플은 통과한다', () => {
  assert.deepEqual(T.validateSample(valid()), []);
  assert.deepEqual(T.validateSample(valid({ clock_domain: 'physics_tick', frame: undefined, tick: 5, metric: 'physics.step_ms' })), []);
  // 사전 집계 지표(.p95 등)는 frame/tick 없이 허용
  const agg = valid({ metric: 'frame.wall_ms.p95' });
  delete agg.frame;
  assert.deepEqual(T.validateSample(agg), []);
  assert.deepEqual(T.validateSample(valid({ metric: 'mem.static_bytes', unit: 'bytes', value: 1024, tags: { case: 1, mode: 'ISM', headless: true } })), []);
  assert.deepEqual(T.validateSample(valid({ clock_domain: 'wall', frame: undefined, metric: 'obj.node_count', unit: 'count', value: 7 })), []);
});

test('계약 위반은 각각 거부된다', () => {
  const cases = [
    [{ schemaVersion: 2 }, /schemaVersion/],
    [{ build_id: '' }, /build_id/],
    [{ source: 'Godot Runtime' }, /source/],
    [{ device: { os: 'x', cpu: 'y', gpu: 'z' } }, /device\.driver/],
    [{ clock_domain: 'cpu' }, /clock_domain/],
    [{ frame: -1 }, /frame/],
    [{ frame: 1.5 }, /frame/],
    [{ metric: 'FrameTime' }, /metric/],
    [{ metric: 'frame' }, /metric/],
    [{ value: Number.NaN }, /value/],
    [{ value: '16' }, /value/],
    [{ unit: 's' }, /unit/],
    [{ exact: 'yes' }, /exact/],
    [{ ts: '2026-11-25 01:00:00' }, /ts/],
    [{ ts: '2026-11-25T01:00:00' }, /ts/], // 시간대 없음
    [{ extra: 1 }, /unknown field "extra"/],
    [{ tags: { a: { nested: true } } }, /tags\.a/],
    [{ metric: 'mem.static', unit: 'bytes' }, /_bytes/],
    [{ metric: 'frame.wall', unit: 'ms' }, /_ms/],
    [{ metric: 'frame.wall_ms', unit: 'count' }, /count/],
  ];
  for (const [over, re] of cases) {
    const errs = T.validateSample(valid(over));
    assert.ok(errs.some(e => re.test(e)), `${JSON.stringify(over)} → ${errs.join('; ') || '(no errors)'}`);
  }
  const noFrame = valid();
  delete noFrame.frame;
  assert.ok(T.validateSample(noFrame).some(e => /requires "frame"/.test(e)));
  assert.ok(T.validateSample(valid({ clock_domain: 'physics_tick' })).some(e => /requires "tick"/.test(e)));
  for (const k of T.REQUIRED) {
    const s = valid();
    delete s[k];
    assert.ok(T.validateSample(s).some(e => e.includes(`"${k}"`)), `missing ${k}`);
  }
});

test('JSONL 파싱은 줄 번호와 함께 오류를 모은다', () => {
  const text = `${JSON.stringify(valid())}\n\nnot-json\n${JSON.stringify(valid({ unit: 'x' }))}\n`;
  const r = T.parseJsonl(text);
  assert.equal(r.samples.length, 1);
  assert.equal(r.count, 3);
  assert.deepEqual(r.errors.map(e => e.line), [3, 4]);
});

test('makeSample 은 키 순서를 고정하고 장치 빈 값을 unknown 으로 채운다', () => {
  const s = T.makeSample({ build_id: 'b', source: 'ism-profile', device: { os: 'Windows', cpu: '' }, clock_domain: 'wall', metric: 'build.submit_ms', value: 1, unit: 'ms', exact: 1, ts: '2026-01-01T00:00:00.000Z' });
  assert.deepEqual(Object.keys(s), ['schemaVersion', 'build_id', 'source', 'device', 'clock_domain', 'metric', 'value', 'unit', 'exact', 'ts']);
  assert.deepEqual(s.device, { os: 'Windows', cpu: 'unknown', gpu: 'unknown', driver: 'unknown' });
  assert.equal(s.exact, true);
  assert.deepEqual(T.validateSample(s), []);
});

test('build_id 해석 순서: 명시 > env > BuildManifest > tools/build-version > unknown-<sha>', async () => {
  assert.deepEqual(await resolveTraceBuildId({ buildId: 'x', env: { PLAYFORGE_BUILD_ID: 'y' } }), { buildId: 'x', origin: 'explicit' });
  assert.equal((await resolveTraceBuildId({ env: { PLAYFORGE_BUILD_ID: 'y' } })).buildId, 'y');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-bm-'));
  try {
    const mf = path.join(dir, 'build-manifest.json');
    fs.writeFileSync(mf, JSON.stringify({ build_id: 'forge-desktop-v0.1.0-x' }));
    assert.deepEqual(await resolveTraceBuildId({ env: { PLAYFORGE_BUILD_MANIFEST: mf } }), { buildId: 'forge-desktop-v0.1.0-x', origin: 'build-manifest' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const bv = await resolveTraceBuildId({ env: {}, target: 'forge-desktop', semver: '0.1.0' });
  assert.equal(bv.origin, 'tools/build-version');
  assert.match(bv.buildId, /^forge-desktop-v0\.1\.0-\d{8}-\d{4}-[a-z0-9-]+-g[0-9a-f]{7}-b0(-dirty)?$/);
  const fb = await resolveTraceBuildId({ env: {} });
  assert.equal(fb.origin, 'fallback:git');
  assert.match(fb.buildId, /^unknown-([0-9a-f]{7}|nogit)$/);
  assert.equal(unknownBuildId(null), 'unknown-nogit');
});

test('Godot 수집기가 내는 지표 이름·단위가 계약을 만족한다 (정적 검사)', () => {
  const src = fs.readFileSync(COLLECTOR_GD, 'utf8');
  const emits = [...src.matchAll(/_emit\("([^"]+)",[\s\S]*?"(ms|bytes|count)",\s*(true|false|render_exact),\s*"([a-z_]+)"/g)];
  assert.ok(emits.length >= 12, `expected >=12 emit calls, got ${emits.length}`);
  for (const [, metric, unit, , clock] of emits) {
    const s = valid({ metric, unit, clock_domain: clock, tick: clock === 'physics_tick' ? 1 : undefined, frame: clock === 'engine_frame' ? 1 : undefined });
    assert.deepEqual(T.validateSample(s), [], `${metric}`);
  }
  const names = emits.map(m => m[1]);
  for (const required of ['frame.wall_ms', 'frame.process_ms', 'frame.cpu_ms.max', 'physics.step_ms.max', 'mem.static_bytes', 'obj.node_count', 'draw.calls']) {
    assert.ok(names.includes(required), `collector must emit ${required}`);
  }
  // 헤드리스 더미 렌더러 값은 측정이 아니므로 exact 가 고정 true 여서는 안 된다
  assert.match(src, /_emit\("draw\.calls",[^\n]*render_exact/);
  assert.match(src, /"source"|SOURCE := "godot-runtime"/);
});
