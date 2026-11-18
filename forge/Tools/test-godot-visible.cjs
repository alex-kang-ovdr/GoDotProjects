'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { NativeRuntime, findGodot } = require('./native-runtime.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'Saved/Tests');
fs.mkdirSync(output, { recursive: true });

async function main() {
  const input = spawnSync(findGodot(root), ['--path', path.join(root, 'Godot'), '--audio-driver', 'Dummy', '--script', 'res://tests/native_input.gd'], { windowsHide: true, encoding: 'utf8', timeout: 20000 });
  const inputLog = (input.stdout || '') + (input.stderr || '');
  fs.writeFileSync(path.join(output, 'godot-native-input.log'), inputLog);
  assert.equal(input.status, 0, inputLog + (input.error || ''));
  assert.match(inputLog, /PASS native input/);
  assert.doesNotMatch(inputLog, /SCRIPT ERROR:|ERROR:|WARNING:/);
  const runtime = new NativeRuntime(root, () => {}, { headless: false });
  const samples = [];
  try {
    let response = await runtime.request({ op: 'load', source: fs.readFileSync(path.join(root, 'Projects/TappyChicken/Scripts/Game.gd'), 'utf8'), settings: { seed: 698, speed: 40, gap: 350, interval: 4, pipeWidth: 25 } });
    assert.equal(response.ok, true, response.error);
    await runtime.request({ op: 'input', action: 'flap' });
    for (let frame = 0; frame < 300; frame++) {
      if (frame > 0 && frame % 16 === 0) await runtime.request({ op: 'input', action: 'flap' });
      const start = performance.now();
      response = await runtime.request({ op: 'step', dt: 0.04 });
      assert.equal(response.ok, true, response.error);
      samples.push({ frame: frame + 1, objects: 1 + response.state.pipes.length, nodes: response.engine.nodes, command_ms: performance.now() - start });
    }
    assert.ok(response.state.score >= 1);
    assert.notEqual(response.engine.renderer, 'headless');
    await runtime.request({ op: 'input', action: 'pause' });
    const capture = await runtime.request({ op: 'capture' });
    assert.equal(capture.ok, true);
    assert.doesNotMatch(runtime.diagnostics, /SCRIPT ERROR:|ERROR:|WARNING:/);
    const sorted = samples.map(s => s.command_ms).sort((a, b) => a - b);
    const summary = { timestamp: new Date().toISOString(), passed: true, frames: 300, score: response.state.score,
      engine: response.engine, capture, command_latency_ms: { median: sorted[150], p95: sorted[285] },
      note: 'Command round-trip latency includes Godot scheduling and local TCP; it is not GPU frame time.', diagnostics: runtime.diagnostics };
    fs.writeFileSync(path.join(output, 'godot-visible.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(output, 'godot-visible.csv'), 'frame,objects,nodes,command_ms\n' + samples.map(s => Object.values(s).join(',')).join('\n') + '\n');
    console.log(JSON.stringify(summary, null, 2));
  } finally { await runtime.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
