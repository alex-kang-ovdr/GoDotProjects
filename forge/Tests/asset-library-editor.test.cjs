'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createAssetLibraryHandler } = require('../Tools/asset-library.cjs');
const { appendEditorPlugin } = require('../Tools/platform-project.cjs');
const { loadAssetStore } = require('../Tools/template-catalog.cjs');

const root = path.join(__dirname, '..');
const godot = process.env.GODOT_EDITOR || 'D:/Github/GoDotProjects/Godot_v4.7.2-stable_win64.exe';

test('native Godot Asset Store searches, downloads and installs the PlayForge Local pack', {
  skip: !fs.existsSync(godot) && 'Native Godot unavailable',
  timeout: 45000,
}, async t => {
  const temporary = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'playforge-native-store-'));
  const project = path.join(temporary, 'project');
  const settings = path.join(temporary, 'settings');
  const showcase = 'res://addons/playforge_showcase/plugin.cfg';
  const probe = 'res://addons/asset_library_probe/plugin.cfg';
  const { catalog, sources } = loadAssetStore(root);
  const pack = catalog.packs.find(entry => entry.id === 'tappy-original');
  assert.ok(pack);
  const handler = createAssetLibraryHandler(root);
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(new URL(request.url, 'http://localhost'));
    if (!handler(request, response)) response.writeHead(404).end();
  });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}/api/asset-library`;
  const write = (relative, content) => {
    const file = path.join(project, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  fs.mkdirSync(settings);
  write('project.godot', appendEditorPlugin(appendEditorPlugin('config_version=5\n', showcase), probe));
  write('addons/asset_library_probe/plugin.cfg', '[plugin]\nname="Asset Store Probe"\nscript="probe.gd"\n');
  write('addons/asset_library_probe/probe.gd', fs.readFileSync(path.join(__dirname, 'fixtures/asset-library-editor.gd')));
  fs.cpSync(path.join(root, 'Godot/addons/playforge_showcase'), path.join(project, 'addons/playforge_showcase'), { recursive: true });
  assert.ok(!fs.existsSync(path.join(project, 'Assets')));
  const child = spawn(godot, ['--headless', '--editor', '--path', project], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      APPDATA: settings,
      XDG_CONFIG_HOME: settings,
      XDG_DATA_HOME: settings,
      XDG_CACHE_HOME: settings,
      PLAYFORGE_ASSET_LIBRARY_URL: url,
      PLAYFORGE_ASSET_LIBRARY_TITLE: pack.title,
    },
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 35000);
  let exit;
  try {
    exit = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });
  } finally {
    clearTimeout(timer);
    const evidence = path.join(root, 'Saved/Tests/template-showcase');
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(evidence, 'native-asset-library.log'), output + '\nAsset Store requests:\n'
      + requests.map(request => request.pathname + request.search).join('\n'));
  }
  assert.equal(exit, 0, output);
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(output, /PLAYFORGE_NATIVE_ASSET_LIBRARY_OK/);
  const matchesPath = (request, suffix) => request.pathname.replace(/\/$/, '').endsWith(suffix);
  const called = suffix => requests.some(request => matchesPath(request, suffix));
  assert.ok(called('/tags') && called('/licenses') && called('/assets/playforge-local/tappy-original'));
  assert.ok(called('/releases/playforge-local/tappy-original'));
  assert.ok(requests.some(request => matchesPath(request, '/search/query')
    && request.searchParams.get('query') === 'tappy chicken'));
  assert.ok(requests.some(request => matchesPath(request, '/packs/tappy-original.zip')
    && /^[a-f0-9]{64}$/.test(request.searchParams.get('sha256') || '')));
  for (const file of pack.files) {
    assert.equal(fs.readFileSync(path.join(project, file), 'utf8'), sources[file], file);
  }
});
