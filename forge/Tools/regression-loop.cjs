'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const iterations = Number(process.argv[2] || 3);
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 20) throw new Error('Iterations must be 1–20');
const folder = path.join(root, 'Saved/Tests/Loops', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(folder, { recursive: true });
const results = [];
function snapshot() {
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    if (fs.statSync(absolute).isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) visit(path.join(relative, entry));
    } else files.push({ path: relative.replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') });
  }
  for (const entry of ['Engine/src', 'Engine/build/Release/GamePlayForgeRuntime.exe', 'Projects', 'Studio', 'assets', 'Tools', 'Tests', 'server.cjs', 'package.json', 'package-lock.json', 'playwright.config.cjs']) visit(entry);
  return { sha256: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex'), files };
}
const initial = snapshot();
fs.writeFileSync(path.join(folder, 'source-snapshot.json'), JSON.stringify(initial, null, 2) + '\n');
const os = require('node:os');
fs.writeFileSync(path.join(folder, 'environment.json'), JSON.stringify({ node: process.version, platform: process.platform, release: os.release(), cpu: os.cpus()[0]?.model, logical_processors: os.cpus().length, memory_bytes: os.totalmem(), browser_mode: 'visible Chrome, hardware rendering enabled' }, null, 2) + '\n');
for (let iteration = 1; iteration <= iterations; iteration++) {
  for (const [suite, args] of [['node', ['Tools/run-tests.cjs']], ['browser', ['node_modules/@playwright/test/cli.js', 'test']]]) {
    const start = Date.now();
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
    const output = (run.stdout || '') + (run.stderr || '') + (run.error ? String(run.error) : '');
    const sourceUnchanged = snapshot().sha256 === initial.sha256;
    const passed = run.status === 0 && !run.error && sourceUnchanged;
    results.push({ iteration, suite, passed, sourceUnchanged, source_sha256: initial.sha256, duration_ms: Date.now() - start });
    fs.writeFileSync(path.join(folder, `${iteration}-${suite}.log`), output);
    fs.writeFileSync(path.join(folder, 'summary.json'), JSON.stringify(results, null, 2) + '\n');
    fs.writeFileSync(path.join(folder, 'summary.csv'), 'iteration,suite,passed,duration_ms\n' + results.map(r => `${r.iteration},${r.suite},${r.passed},${r.duration_ms}`).join('\n') + '\n');
    console.log(`${passed ? 'PASS' : 'FAIL'} iteration ${iteration}/${iterations} ${suite} (${Date.now() - start} ms)`);
    if (!passed) { if (!sourceUnchanged) console.error('Source changed during validation; rerun against one frozen snapshot.'); console.error(output.slice(-6000)); process.exit(1); }
  }
}
console.log(`Stable for ${iterations} consecutive iterations. Evidence: ${folder}`);
