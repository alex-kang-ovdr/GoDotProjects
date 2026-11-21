'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'Saved', 'Tests', 'latest');
fs.mkdirSync(out, { recursive: true });

const missingImports = [];
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Docs', 'imports.json'), 'utf8'));
  for (const archive of manifest.archives || []) for (const file of archive.files || []) {
    if (!fs.existsSync(path.join(root, file.destination))) missingImports.push(file.destination);
  }
} catch (error) {
  missingImports.push(`Docs/imports.json: ${error.message}`);
}

const tests = [
  'Tests/integration.test.cjs',
  'Tests/collaboration.test.cjs',
  'Tests/godot-parity.test.cjs',
  'Tests/native-runtime.test.cjs',
  'Tests/godot-runtime.test.cjs',
  'Tests/cloud-origin.test.cjs',
  'Tests/playforge_service/export-godot.test.cjs',
  'Tests/playforge_service/plugin-service.test.cjs',
  'Tests/playforge_platform/platform.test.cjs',
  'Tests/game-templates.test.cjs',
  'Tests/fortress-war.test.cjs',
  'Tests/fortress-war-parity.test.cjs',
  'Tests/fortress-multiplayer.test.cjs',
  'Tests/playforge_platform/self-cursor.test.cjs',
  'Tests/playforge_platform/playforge-guide-bridge.test.cjs',
  'Tests/ironwood-physics.test.cjs',
  'Tests/brawllabs-runtime.test.cjs',
  'Tests/brawllabs-multiplayer.test.cjs',
  'Tests/tappy-chicken-mmo.test.cjs',
  'Tests/captain-forever.test.cjs',
  'Tests/survivor-io.test.cjs',
  'Tests/voxel-frontier.test.cjs',
  'Tests/build-queue-reuse.test.cjs',
];
const suites = tests.map(file => ({ name: path.basename(file, '.test.cjs'), cwd: root, args: ['--test', file], required: [file] }));
const studioRoot = path.join(root, 'References', 'PlayForgeStudio', 'v18');
suites.push({ name: 'studio-reference', cwd: studioRoot, args: ['QA/regression.js', 'index.html'], required: ['QA/regression.js', 'index.html'].map(file => path.join(studioRoot, file)) });

for (const [name, rel, files] of [
  ['nexus-front', path.join('WebProjects', 'League of Legends', 'Playable', 'Current'), ['dist/index.html', 'tests']],
  ['rtk11', path.join('WebProjects', '삼국지 11', 'Playable', 'Current'), ['index.html', 'tests/engine.test.cjs', 'tests/expanded.test.cjs', 'tests/server.test.cjs', 'tests/view-math.test.cjs']],
]) {
  const cwd = path.join(root, rel);
  const required = files.map(file => path.join(cwd, file));
  const args = name === 'nexus-front'
    ? ['--test', ...((fs.existsSync(required[1]) ? fs.readdirSync(required[1]).filter(file => file.endsWith('.test.cjs')).sort() : []).map(file => path.join('tests', file)))]
    : ['--test', ...files.slice(1)];
  suites.push({ name, cwd, args, required });
}

const results = [];
for (const suite of suites) {
  const absent = suite.required.filter(filename => !fs.existsSync(filename));
  if (absent.length) {
    const result = { suite: suite.name, tests: 0, passed: null, skipped: true, reason: 'Historical source is not present in this checkout', missing: absent.map(file => path.relative(root, file)), log: null };
    results.push(result);
    console.log(`SKIP ${suite.name}: missing ${result.missing.join(', ')}`);
    continue;
  }
  const start = performance.now();
  const result = spawnSync(process.execPath, suite.args, { cwd: suite.cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const output = (result.stdout || '') + (result.stderr || '') + (result.error ? '\n' + result.error.message : '');
  const log = `${suite.name}.log`;
  fs.writeFileSync(path.join(out, log), output);
  const tests = Number(output.match(/# tests (\d+)/)?.[1] || output.match(/(\d+) checks passed/)?.[1] || 0);
  const skipped = Number(output.match(/# skipped (\d+)/)?.[1] || 0);
  const failed = result.status !== 0 || !!result.error || /# fail [1-9]|not ok \d/.test(output);
  const allSkipped = !failed && tests > 0 && skipped === tests;
  const entry = { suite: suite.name, tests, skipped, passed: failed || allSkipped ? (failed ? false : null) : true, ...(allSkipped ? { skippedSuite: true, reason: 'Godot runtime is not built or available' } : {}), duration_ms: Math.round(performance.now() - start), log: `Saved/Tests/latest/${log}` };
  results.push(entry);
  console.log(`${failed ? 'FAIL' : allSkipped ? 'SKIP' : 'PASS'} ${suite.name}: ${tests} tests, ${skipped} skipped (${entry.duration_ms} ms)`);
  if (failed) console.error(output.slice(-6000));
}

const summary = {
  timestamp: new Date().toISOString(),
  results,
  unverified: {
    importedFiles: missingImports,
    historicalSuites: results.filter(result => result.skipped).map(result => ({ suite: result.suite, missing: result.missing || [], reason: result.reason })),
  },
};
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'summary.csv'), 'suite,tests,skipped,passed,duration_ms\n' + results.map(r => `${r.suite},${r.tests},${r.skipped || 0},${r.passed === null ? 'unverified' : r.passed},${r.duration_ms || 0}`).join('\n') + '\n');
if (missingImports.length) console.log(`UNVERIFIED imported files: ${missingImports.length} missing; full inventory: Saved/Tests/latest/summary.json`);
process.exitCode = results.some(result => result.passed === false) ? 1 : 0;
