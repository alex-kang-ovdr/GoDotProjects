'use strict';
// Iris C++ GDExtension(FgIrisNativeServer) 동적 로드, GDScript 클라이언트 와이어 호환성, N0/N1/N2/N3 벤치마크 검증.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveGodot } = require('../../Tools/dedicated-server/run-ds-2clients.cjs');
const godot = resolveGodot();
const PROJECT = path.resolve(__dirname, '../../Godot');
const SCRIPT = 'res://addons/playforge_netframework/demo/iris_native_bench.gd';
const DLL_PATH = path.join(PROJECT, 'addons/playforge_netframework/bin/playforge_iris_native.windows.template_debug.x86_64.dll');

const skipReason = !godot.executable
  ? `Godot not found (${godot.reason || godot.source})`
  : (process.platform !== 'win32' || !fs.existsSync(DLL_PATH) ? 'Windows x86_64 native Iris GDExtension DLL not built for this host' : false);

test('Iris C++ GDExtension: wire parity with GDScript client, 0 secret leak, forged ACK rejection, N0-N3 benchmark (N2 p95 <= 4ms)', {
  skip: skipReason,
  timeout: 60000,
}, () => {
  const r = spawnSync(godot.executable, ['--headless', '--path', PROJECT, '--script', SCRIPT], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 55000,
  });
  assert.equal(r.error, undefined, r.error && r.error.message);
  assert.equal(r.status, 0, `iris_native_bench failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /IRIS_NATIVE_BENCH_OK/);
  const jsonLine = r.stdout.split(/\r?\n/).find((l) => l.startsWith('IRIS_NATIVE_BENCH_JSON '));
  assert.ok(jsonLine, 'missing IRIS_NATIVE_BENCH_JSON output');
  const parsed = JSON.parse(jsonLine.slice('IRIS_NATIVE_BENCH_JSON '.length));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.failures));
  assert.equal(parsed.metrics.parityOk, true);
  assert.ok(parsed.metrics.nativeDeltaBytes < parsed.metrics.nativeFullBytes);
  assert.ok(parsed.metrics.N2 && parsed.metrics.N2.totalFlatP95Us <= 4000, `N2 p95 must be <= 4ms: ${JSON.stringify(parsed.metrics.N2)}`);
  assert.ok(parsed.metrics.N3, 'N3 benchmark must be recorded');
});
