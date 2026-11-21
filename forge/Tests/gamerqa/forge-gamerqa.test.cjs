'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '../../..');
const forgeDir = path.join(repoRoot, 'forge');
const scannerPath = path.join(repoRoot, 'tools/Gamer/GamerQA/adapters/forge/project-scanner.mjs');
const runtimeGodotPath = path.join(repoRoot, 'tools/Gamer/GamerQA/suites/runtime-godot/index.mjs');
const forgeSuitePath = path.join(repoRoot, 'tools/Gamer/GamerQA/suites/forge/index.mjs');

const PREFERRED_GODOT_BIN = process.env.GODOT_BIN
  || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe';

function importEsm(filePath) {
  return import(pathToFileURL(filePath).href);
}

function findDotGodotDirs(rootDir) {
  const found = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.name === '.godot') {
        found.push(fullPath);
      } else if (entry.name !== '.git' && entry.name !== 'node_modules') {
        visit(fullPath);
      }
    }
  }
  if (fs.existsSync(rootDir)) visit(rootDir);
  return found;
}

function createTempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeMinimalProject(projectDir, {
  name = 'SyntheticTest',
  mainScene = 'res://scenes/main.tscn',
  sceneContent = '[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="res://scripts/main.gd" id="1"]\n\n[node name="Main" type="Node2D"]\nscript = ExtResource("1")\n',
  scriptContent = 'extends Node2D\n\nfunc _ready() -> void:\n\tpass\n',
  writeProjectGodot = true,
  writeMainScene = true,
  writeScript = true,
} = {}) {
  fs.mkdirSync(path.join(projectDir, 'scenes'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'scripts'), { recursive: true });
  if (writeProjectGodot) {
    fs.writeFileSync(path.join(projectDir, 'project.godot'), [
      'config_version=5',
      '',
      '[application]',
      `config/name=${JSON.stringify(name)}`,
      ...(mainScene ? [`run/main_scene=${JSON.stringify(mainScene)}`] : []),
      'config/features=PackedStringArray("4.7", "GL Compatibility")',
      '',
    ].join('\n'), 'utf8');
  }
  if (writeMainScene) {
    fs.writeFileSync(path.join(projectDir, 'scenes', 'main.tscn'), sceneContent, 'utf8');
  }
  if (writeScript) {
    fs.writeFileSync(path.join(projectDir, 'scripts', 'main.gd'), scriptContent, 'utf8');
  }
}

test('project-scanner discovers all Forge Samples (nested Project/) and Templates with zero structural issues', async () => {
  const { discoverForgeProjects, scanForgeProjects } = await importEsm(scannerPath);

  const discovered = discoverForgeProjects({ forgeDir });
  const sampleIds = discovered.filter(p => p.kind === 'sample').map(p => p.id).sort();
  const templateIds = discovered.filter(p => p.kind === 'template').map(p => p.id).sort();

  assert.deepEqual(sampleIds, ['nexus-front', 'survivor-arena-g2']);
  assert.deepEqual(templateIds, ['brawllabs', 'fortress-war', 'iron-wood', 'survivor-io', 'tappy-chicken', 'tappy-chicken-mmo', 'voxel-frontier']);

  for (const sample of discovered.filter(p => p.kind === 'sample')) {
    assert.equal(path.basename(sample.projectDir), 'Project', `sample ${sample.id} should resolve to Project/`);
    assert.equal(sample.hasProjectGodot, true);
  }

  const report = scanForgeProjects({ forgeDir });
  assert.equal(report.status, 'pass', JSON.stringify(report.projects.filter(p => p.status !== 'pass'), null, 2));
  assert.equal(report.catalogCheck.checked, true);
  assert.equal(report.catalogCheck.ok, true);
  assert.equal(report.summary.total, 9);
  assert.equal(report.summary.passed, 9);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.errored, 0);

  for (const project of report.projects) {
    assert.equal(project.checks.projectGodot.ok, true, project.id);
    assert.equal(project.checks.mainScene.ok, true, project.id);
    assert.equal(project.checks.scripts.ok, true, project.id);
    assert.ok(project.checks.scripts.count > 0, `${project.id} should have .gd scripts`);
    assert.equal(project.checks.assets.ok, true, `${project.id}: ${JSON.stringify(project.checks.assets.missingRefs)}`);
  }
});

test('project-scanner detects missing project.godot, missing main_scene, missing script preloads, and missing metadata assets', async t => {
  const { scanGodotProject } = await importEsm(scannerPath);
  const tmp = createTempDir(t, 'gamerqa-scanner-neg-');

  const noGodotDir = path.join(tmp, 'no-godot');
  fs.mkdirSync(noGodotDir);
  const resNoGodot = scanGodotProject(noGodotDir, { id: 'no-godot' });
  assert.equal(resNoGodot.status, 'fail');
  assert.ok(resNoGodot.issues.some(i => i.code === 'missing_project_godot'));

  const missingMainDir = path.join(tmp, 'missing-main');
  writeMinimalProject(missingMainDir, { writeMainScene: false });
  const resMissingMain = scanGodotProject(missingMainDir, { id: 'missing-main' });
  assert.equal(resMissingMain.status, 'fail');
  assert.ok(resMissingMain.issues.some(i => i.code === 'missing_main_scene_file'));

  const missingAssetDir = path.join(tmp, 'missing-asset');
  writeMinimalProject(missingAssetDir, {
    scriptContent: 'extends Node2D\nconst TEX = preload("res://assets/missing.svg")\n',
  });
  fs.writeFileSync(path.join(missingAssetDir, 'metadata.json'), JSON.stringify({
    id: 'missing-asset',
    dimension: '2d',
    assetPaths: ['assets/declared_missing.svg'],
  }), 'utf8');
  const resMissingAsset = scanGodotProject(missingAssetDir, { id: 'missing-asset' });
  assert.equal(resMissingAsset.status, 'fail');
  assert.ok(resMissingAsset.issues.some(i => i.code === 'missing_resource_reference' && i.ref === 'res://assets/missing.svg'));
  assert.ok(resMissingAsset.issues.some(i => i.code === 'missing_metadata_asset' && i.ref === 'assets/declared_missing.svg'));
});

test('runtime-godot analyzeGodotOutput and findGodotBinary detect all required error classes', async () => {
  const { analyzeGodotOutput, findGodotBinary } = await importEsm(runtimeGodotPath);

  const syntheticLog = [
    '\x1b[91mSCRIPT ERROR: Parse Error: Unexpected token.\x1b[0m',
    '   at: GDScript::reload (res://scripts/main.gd:12)',
    'SCRIPT ERROR: Invalid call. Nonexistent function \'foo\' in base \'Nil\'.',
    'ERROR: Failed loading resource: res://assets/missing.png.',
    'WARNING: Unused variable "tmp".',
  ].join('\n');

  const analysis = analyzeGodotOutput(syntheticLog, '');
  assert.equal(analysis.hasErrors, true);
  assert.ok(analysis.errors.some(e => e.type === 'PARSE_ERROR'));
  assert.ok(analysis.errors.some(e => e.type === 'SCRIPT_ERROR'));
  assert.ok(analysis.errors.some(e => e.type === 'FAILED_LOADING_RESOURCE'));
  assert.equal(analysis.warnings.length, 1);

  const missingBin = findGodotBinary({ godotBin: path.join(os.tmpdir(), 'definitely-missing-godot.exe') });
  assert.equal(missingBin.found, false);

  const actualBin = findGodotBinary({ godotBin: fs.existsSync(PREFERRED_GODOT_BIN) ? PREFERRED_GODOT_BIN : undefined });
  assert.equal(actualBin.found, true, actualBin.reason);
});

test('runtime-godot catches Parse Error, runtime SCRIPT ERROR, Failed loading resource, and non-zero exit in real Godot 4.7.2', {
  timeout: 90000,
}, async t => {
  const { findGodotBinary, runGodotProjectCheck } = await importEsm(runtimeGodotPath);
  const bin = findGodotBinary({ godotBin: fs.existsSync(PREFERRED_GODOT_BIN) ? PREFERRED_GODOT_BIN : undefined });
  assert.equal(bin.found, true, bin.reason);

  const tmp = createTempDir(t, 'gamerqa-runtime-neg-');

  const parseErrProj = path.join(tmp, 'parse-err');
  writeMinimalProject(parseErrProj, {
    scriptContent: 'extends Node2D\nfunc _ready():\n\tvar broken = \n',
  });
  const parseResult = runGodotProjectCheck(parseErrProj, { godotBin: bin.executable, isolate: true });
  assert.equal(parseResult.status, 'fail');
  assert.ok(parseResult.errors.some(e => e.type === 'PARSE_ERROR' || e.type === 'SCRIPT_ERROR'));

  const scriptErrProj = path.join(tmp, 'script-err');
  writeMinimalProject(scriptErrProj, {
    scriptContent: 'extends Node2D\nfunc _ready():\n\tvar obj = null\n\tobj.queue_free()\n',
  });
  const scriptResult = runGodotProjectCheck(scriptErrProj, { godotBin: bin.executable, isolate: true });
  assert.equal(scriptResult.status, 'fail');
  assert.ok(scriptResult.errors.some(e => e.type === 'SCRIPT_ERROR'));

  const missingResProj = path.join(tmp, 'missing-res');
  writeMinimalProject(missingResProj, {
    sceneContent: '[gd_scene load_steps=3 format=3]\n\n[ext_resource type="Script" path="res://scripts/main.gd" id="1"]\n[ext_resource type="Texture2D" path="res://assets/missing.png" id="2"]\n\n[node name="Main" type="Node2D"]\nscript = ExtResource("1")\n',
  });
  const missingResResult = runGodotProjectCheck(missingResProj, { godotBin: bin.executable, isolate: true });
  assert.equal(missingResResult.status, 'fail');
  assert.ok(missingResResult.errors.some(e => e.type === 'FAILED_LOADING_RESOURCE'));

  const exitFailProj = path.join(tmp, 'exit-fail');
  writeMinimalProject(exitFailProj);
  fs.writeFileSync(path.join(exitFailProj, 'scripts', 'fail_exit.gd'), 'extends SceneTree\nfunc _initialize():\n\tquit(3)\n', 'utf8');
  const exitResult = runGodotProjectCheck(exitFailProj, {
    godotBin: bin.executable,
    isolate: true,
    runImport: false,
    runBoot: false,
    scriptPath: 'res://scripts/fail_exit.gd',
  });
  assert.equal(exitResult.status, 'fail');
  assert.ok(exitResult.errors.some(e => e.type === 'NON_ZERO_EXIT'));
});

test('Forge GamerQA suite validates all 2 Samples and 7 Templates with Godot 4.7.2 headless (0 errors, 0 .godot leftovers)', {
  timeout: 180000,
}, async () => {
  const { runForgeSuite } = await importEsm(forgeSuitePath);
  const { findGodotBinary } = await importEsm(runtimeGodotPath);

  const bin = findGodotBinary({ godotBin: fs.existsSync(PREFERRED_GODOT_BIN) ? PREFERRED_GODOT_BIN : undefined });
  assert.equal(bin.found, true, `Godot 4.7.2 console binary must be available: ${bin.reason}`);

  const beforeSamples = findDotGodotDirs(path.join(forgeDir, 'Samples'));
  const beforeTemplates = findDotGodotDirs(path.join(forgeDir, 'Templates'));

  const report = runForgeSuite({
    forgeDir,
    godotBin: bin.executable,
    isolate: true,
    quitAfterFrames: 3,
  });

  assert.equal(report.suite, 'forge');
  assert.equal(report.status, 'pass', report.markdown);
  assert.equal(report.summary.total, 9);
  assert.equal(report.summary.samplesTotal, 2);
  assert.equal(report.summary.samplesPassed, 2);
  assert.equal(report.summary.templatesTotal, 7);
  assert.equal(report.summary.templatesPassed, 7);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.errored, 0);
  assert.equal(report.summary.skipped, 0);
  assert.equal(report.catalogCheck.ok, true);

  for (const proj of report.projects) {
    assert.equal(proj.status, 'pass', `${proj.id} failed:\n${JSON.stringify(proj.runtimeGodot?.errors || [], null, 2)}`);
    assert.equal(proj.errorCount, 0, `${proj.id} had errors`);
    assert.equal(proj.runtimeGodot.isolated, true);
    assert.equal(proj.runtimeGodot.phases.length, 2, `${proj.id} should run import + boot`);
    for (const phase of proj.runtimeGodot.phases) {
      assert.equal(phase.exitCode, 0, `${proj.id} ${phase.name} exitCode=${phase.exitCode}`);
      assert.equal(phase.status, 'pass', `${proj.id} ${phase.name} failed`);
      assert.equal(phase.errors.length, 0);
    }
  }

  assert.match(report.markdown, /# Forge GamerQA Report/);
  for (const expectedId of ['nexus-front', 'survivor-arena-g2', 'brawllabs', 'fortress-war', 'iron-wood', 'survivor-io', 'tappy-chicken', 'tappy-chicken-mmo', 'voxel-frontier']) {
    assert.ok(report.markdown.includes(expectedId), `Markdown report missing ${expectedId}`);
  }

  // Verify no new .godot cache directories were created inside forge/Samples or forge/Templates.
  assert.deepEqual(findDotGodotDirs(path.join(forgeDir, 'Samples')), beforeSamples);
  assert.deepEqual(findDotGodotDirs(path.join(forgeDir, 'Templates')), beforeTemplates);
});
