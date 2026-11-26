'use strict';
// 이동 예측·보정·원격 보간(로드맵 27) + 서버 Validator(로드맵 30) 단위 검증 및 실시간 UDP 지연·손실 매트릭스 통합 시험.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { resolveGodot } = require('../../Tools/dedicated-server/run-ds-2clients.cjs');
const r1Runner = path.resolve(__dirname, '../../Tools/dedicated-server/run-r1-matrix.cjs');
const godot = resolveGodot();
const PROJECT = path.resolve(__dirname, '../../Godot');
const SCRIPT = 'res://addons/playforge_netframework/demo/prediction_validator_selftest.gd';
const godotSkip = !godot.executable && `Godot not found (${godot.reason || godot.source})`;

test('Movement prediction, reconciliation, remote interpolation, and server validator deterministic suite', {
  skip: godotSkip,
  timeout: 45000,
}, () => {
  const r = spawnSync(godot.executable, ['--headless', '--path', PROJECT, '--script', SCRIPT], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 40000,
  });
  assert.equal(r.error, undefined, r.error && r.error.message);
  assert.equal(r.status, 0, `prediction_validator_selftest failed:\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /PRED_VALIDATOR_SELFTEST_OK/);
  const jsonLine = r.stdout.split(/\r?\n/).find((l) => l.startsWith('PRED_VALIDATOR_SELFTEST_JSON '));
  assert.ok(jsonLine, 'missing PRED_VALIDATOR_SELFTEST_JSON output');
  const parsed = JSON.parse(jsonLine.slice('PRED_VALIDATOR_SELFTEST_JSON '.length));
  assert.equal(parsed.ok, true, JSON.stringify(parsed.failures));
  assert.ok(parsed.metrics.lanErrorP95 <= 0.02);
  assert.equal(parsed.metrics.validatorDuplicateCommitted, 1);
  assert.equal(parsed.metrics.validatorAutoBans, 0);
});

test('Live DS + 2 clients over NetEmulationProxy (LAN / 150ms+1% / 300ms+5%): Iris + Prediction + Validator', {
  skip: godotSkip,
  timeout: 120000,
}, () => {
  const r = spawnSync(process.execPath, [r1Runner, '--json'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 110000,
  });
  assert.equal(r.error, undefined, r.error && r.error.message);
  let summary;
  try {
    summary = JSON.parse(r.stdout);
  } catch {
    assert.fail(`r1-matrix output is not JSON (exit=${r.status}): ${r.stdout}\n${r.stderr}`);
  }
  assert.equal(r.status, 0, JSON.stringify(summary.results, null, 2));
  assert.equal(summary.ok, true);
  assert.equal(summary.results.length, 3);
  for (const res of summary.results) {
    assert.equal(res.ok, true, `${res.profile} failed: ${JSON.stringify(res.checks)}`);
  }
});
