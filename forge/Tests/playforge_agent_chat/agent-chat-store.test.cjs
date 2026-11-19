'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { appendEditorPlugin } = require('../../Tools/platform-project.cjs');
const { loadAssetStore } = require('../../Tools/template-catalog.cjs');

const root = path.resolve(__dirname, '../..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('native editor MCP imports the 29-file original Tappy pack once and exposes its real completion', {
  skip: !fs.existsSync(godot) && 'Native Godot unavailable',
  timeout: 65000,
}, t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const project = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-agent-pack-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(project)), temporaryRoot);
    assert.ok(path.basename(project).startsWith('playforge-agent-pack-'));
    fs.rmSync(project, { recursive: true, force: true });
  });
  const write = (name, content) => {
    const destination = path.join(project, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  const plugins = ['playforge_replay', 'playforge_agent_chat', 'agent_chat_store_probe'];
  const config = 'config_version=5\n\n[application]\nconfig/name="AssetPackMcpProbe"\nrun/main_scene="res://scenes/main.tscn"\n';
  write('project.godot', plugins.reduce((text, plugin) => appendEditorPlugin(text, `res://addons/${plugin}/plugin.cfg`), config));
  const scene = '[gd_scene format=3]\n\n[node name="AssetPackMcpProbe" type="Node2D"]\n';
  write('scenes/main.tscn', scene);
  for (const plugin of plugins.slice(0, 2)) {
    const directory = path.join(root, 'Godot', 'addons', plugin);
    for (const file of fs.readdirSync(directory).filter(name => /\.(?:cfg|gd)$/.test(name))) {
      write(`addons/${plugin}/${file}`, fs.readFileSync(path.join(directory, file)));
    }
  }
  write('addons/agent_chat_store_probe/plugin.cfg', '[plugin]\nname="MCP asset pack probe"\nscript="probe.gd"\n');
  write('addons/agent_chat_store_probe/probe.gd', fs.readFileSync(path.join(__dirname, 'fixtures', 'agent-chat-store-probe.gd')));
  const { catalog, sources } = loadAssetStore(root);
  const pack = catalog.packs.find(entry => entry.id === 'tappy-original');
  const existingPath = 'Assets/chicken.svg';
  const existingSource = sources[existingPath] + '\n<!-- User texture edit -->\n';
  assert.equal(pack.files.length, 29);
  write('.playforge-store.json', JSON.stringify(catalog));
  for (const file of pack.files) write(`.playforge-store/${file}`, sources[file]);
  write(existingPath, existingSource);

  const result = spawnSync(godot, ['--headless', '--editor', '--path', project, 'res://scenes/main.tscn'], {
    cwd: root, encoding: 'utf8', timeout: 55000, windowsHide: true,
    env: { ...process.env, PLAYFORGE_ASSET_LIBRARY_URL: '' },
  });
  const output = (result.stdout || '') + (result.stderr || '');
  const evidence = path.join(root, 'Saved', 'Tests', 'agent-chat');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'native-store-mcp.log'), output);
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(output, /PLAYFORGE_ASSET_PACK_MCP_OK/);
  assert.equal(fs.readFileSync(path.join(project, 'scenes/main.tscn'), 'utf8'), scene);
  for (const file of pack.files) {
    assert.equal(fs.readFileSync(path.join(project, file), 'utf8'), file === existingPath ? existingSource : sources[file], file);
  }
});
