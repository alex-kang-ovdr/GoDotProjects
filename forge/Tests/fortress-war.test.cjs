'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const templateId = 'fortress-war';
const project = path.join(root, 'Templates', templateId);
const evidence = path.join(root, 'Saved', 'Tests', templateId);

function scratch(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-fortress-war-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runGodot(executable, args, env, stage) {
  fs.mkdirSync(evidence, { recursive: true });
  const log = path.join(evidence, stage + '.log');
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', env, timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  });
  const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join('\n');
  fs.writeFileSync(log, output);
  const diagnostic = '\n' + log + '\n' + output.slice(-4000);
  assert.equal(result.error, undefined, 'Godot ' + stage + ' could not finish.' + diagnostic);
  assert.equal(result.status, 0, 'Godot ' + stage + ' exited unsuccessfully.' + diagnostic);
  assert.doesNotMatch(output, /\b(?:SCRIPT ERROR|ERROR|Parse Error|Assertion failed)\b/i, diagnostic);
  return output;
}

test('Fortress War imports in Godot and passes deterministic simulation and keyboard UI tests', { timeout: 95000 }, t => {
  const requested = process.env.GODOT_BIN || path.resolve(root, '../../../GoDotProjects/Godot_v4.7.2-stable_win64.exe');
  const direct = requested.replace(/_console\.exe$/i, '.exe');
  const executable = fs.existsSync(direct) ? direct : requested;
  assert.ok(path.isAbsolute(executable) && fs.existsSync(executable),
    'Godot executable not found: ' + executable + '. Set GODOT_BIN to its absolute path.');

  const directory = scratch(t);
  const copiedProject = path.join(directory, 'project');
  fs.cpSync(project, copiedProject, {
    recursive: true,
    filter: file => path.basename(file) !== '.godot',
  });
  // Import and play against isolated settings and save data.
  const profile = path.join(directory, 'profile');
  fs.mkdirSync(profile);
  const env = { ...process.env, APPDATA: profile, LOCALAPPDATA: profile, XDG_DATA_HOME: profile, XDG_CACHE_HOME: profile, XDG_CONFIG_HOME: profile };
  const common = ['--headless', '--path', copiedProject];
  runGodot(executable, [...common, '--editor', '--import'], env, 'import');
  assert.match(runGodot(executable, [...common, '--script', 'res://tests/engine_test.gd'], env, 'engine'), /^FORTRESS_WAR_ENGINE_OK\b/m);
  assert.match(runGodot(executable, [...common, '--script', 'res://tests/ui_test.gd'], env, 'ui'), /^FORTRESS_WAR_UI_OK\b/m);
  assert.match(runGodot(executable, [...common, '--script', 'res://tests/remote_test.gd'], env, 'remote'), /^FORTRESS_WAR_REMOTE_OK\b/m);
});

function indexed(files) {
  return Object.fromEntries(files.map(file => [file.path, file.content]));
}

test('Forge supplies all Fortress War assets and persists complete or guided projects', { timeout: 20000 }, async t => {
  const directory = scratch(t);
  const { createServer } = require('../server.cjs');
  const server = createServer({
    publicOrigin: '',
    workspace: path.join(directory, 'workspace'),
    platformWorkspace: path.join(directory, 'platform'),
    buildDirectory: path.join(directory, 'builds'),
  });

  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  t.after(async () => {
    const closed = once(server, 'close');
    server.shutdown();
    await closed;
  });
  const base = 'http://127.0.0.1:' + server.address().port;

  async function json(route, status, method = 'GET', body) {
    const response = await fetch(base + route, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result).slice(0, 2000));
    return result;
  }

  const { templates } = await json('/api/platform/templates', 200);
  const listed = templates.find(template => template.id === templateId);
  assert.equal(listed?.name, 'Fortress War');
  const { template, files } = await json('/api/platform/templates/' + templateId, 200);
  assert.equal(template.dimension, '2d');
  assert.equal(listed.assetCount, template.assetPaths.length);
  const prepared = indexed(files);
  const mainScene = 'scenes/main.tscn';
  const settings = 'project.godot';
  assert.match(prepared[mainScene], /name="FortressWar" type="Node2D"/);

  const dataFiles = fs.readdirSync(path.join(project, 'data'), { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => path.relative(project, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/'));
  assert.ok(dataFiles.length > 0, 'The project must bundle the gameplay data.');
  for (const file of dataFiles) {
    assert.ok(template.assetPaths.includes(file), file + ' is absent from guided assets.');
    assert.ok(JSON.parse(prepared[file]), file + ' must be valid JSON.');
  }
  const webGame = path.join(root, '..', 'games', 'fortress-blue');
  const originalData = path.join(webGame, 'Source', 'Project', 'dist', 'data.js');
  const recoveredData = fs.existsSync(originalData) ? originalData : path.join(webGame, 'Web', 'data.js');
  const web = {};
  vm.runInNewContext(fs.readFileSync(recoveredData, 'utf8'), web, { timeout: 1000, filename: recoveredData });
  assert.deepEqual(JSON.parse(prepared['data/catalog.json']), JSON.parse(JSON.stringify(web.FortData)),
    'The editable Godot catalog must retain the full recovered gameplay data.');

  const projects = '/api/platform/projects';
  const ready = await json(projects, 201, 'POST', { template: templateId, mode: 'ready', name: 'Fortress Ready' });
  const guided = await json(projects, 201, 'POST', { template: templateId, mode: 'guided', name: 'Fortress Guided' });
  assert.equal(ready.revision, 1);
  assert.equal(guided.revision, 1);
  assert.equal(ready.project.template, templateId);
  assert.equal(guided.project.template, templateId);
  const readyFiles = indexed(ready.files);
  const guidedFiles = indexed(guided.files);
  const renamed = (source, name) => source.replace(/^config\/name=.*$/m, 'config/name=' + JSON.stringify(name));
  assert.deepEqual(readyFiles, { ...prepared, [settings]: renamed(prepared[settings], 'Fortress Ready') });
  assert.deepEqual(Object.keys(guidedFiles).sort(), [settings, mainScene, ...template.assetPaths].sort());
  assert.notEqual(guidedFiles[mainScene], prepared[mainScene]);
  for (const asset of template.assetPaths) {
    assert.equal(prepared[asset], fs.readFileSync(path.join(project, asset), 'utf8'), asset);
    assert.equal(guidedFiles[asset], prepared[asset], asset);
  }

  const guidedRoute = projects + '/' + guided.project.id;
  assert.deepEqual(await json(guidedRoute, 200), guided);
  const finish = await json(guidedRoute, 200, 'PUT', {
    baseRevision: guided.revision,
    clientId: 'fortress-war-guide-test',
    files: files.map(file => file.path === settings
      ? { path: settings, content: guidedFiles[settings] }
      : file),
  });
  assert.equal(finish.revision, 2);
  assert.deepEqual(indexed(finish.files), { ...prepared, [settings]: guidedFiles[settings] });
  assert.deepEqual(await json(guidedRoute, 200), finish);
  assert.deepEqual(await json(projects + '/' + ready.project.id, 200), ready);
});
