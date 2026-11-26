'use strict';
// Iris 방식 상태 복제(로드맵 26): 양자화·delta·ACK·owner 비공개 격리·late join·역순·tombstone·10만 수명·AOI·dormancy·fuzz·N0/N1 벤치마크.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveGodot } = require('../../Tools/dedicated-server/run-ds-2clients.cjs');
const godot = resolveGodot();
const PROJECT = path.resolve(__dirname, '../../Godot');
const SCRIPT = 'res://addons/playforge_netframework/demo/iris_replication_selftest.gd';

test('Iris replication core: schema/quantize, owner privacy, delta/ACK, tombstone, 100k lifecycle, AOI/dormancy, fuzz, N0/N1', {
  skip: godot.executable ? false : `Godot not found (${godot.reason || godot.source})`,
  timeout: 60000,
}, () => {
  const r = spawnSync(godot.executable, ['--headless', '--path', PROJECT, '--script', SCRIPT], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 55000,
  });
  assert.equal(r.error, undefined, r.error && r.error.message);
  assert.equal(r.status, 0, `iris_replication_selftest failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /IRIS_SELFTEST_OK/);
  const jsonLine = r.stdout.split(/\r?\n/).find((l) => l.startsWith('IRIS_SELFTEST_JSON '));
  assert.ok(jsonLine, 'missing IRIS_SELFTEST_JSON output');
  const parsed = JSON.parse(jsonLine.slice('IRIS_SELFTEST_JSON '.length));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.failures));
  assert.equal(parsed.metrics.ownerLeakBytes, 0);
  assert.equal(parsed.metrics.lifecycle100kCollisions, 0);
  assert.ok(parsed.metrics.deltaBytes < parsed.metrics.fullBytes);
  assert.ok(parsed.metrics.fuzzRejected >= 2000);
  assert.ok(parsed.metrics.N0 && parsed.metrics.N1);
});
