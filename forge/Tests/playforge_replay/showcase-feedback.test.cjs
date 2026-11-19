'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { appendEditorPlugin } = require('../../Tools/platform-project.cjs');

const root = path.resolve(__dirname, '../..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('Godot feedback reports verified edits, import progress, gestures and live editor settings', {
  skip: !fs.existsSync(godot) && 'Native Godot unavailable',
  timeout: 50000,
}, t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-feedback-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(temporary)), temporaryRoot);
    assert.ok(path.basename(temporary).startsWith('playforge-feedback-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const project = path.join(temporary, 'project');
  const settings = path.join(temporary, 'settings');
  fs.mkdirSync(settings);
  const write = (name, content) => {
    const destination = path.join(project, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  const plugin = 'addons/feedback_probe';
  write('project.godot', appendEditorPlugin('config_version=5\n', `res://${plugin}/plugin.cfg`));
  write('scene.tscn', '[gd_scene format=3]\n\n[node name="FeedbackProbe" type="Node2D"]\n\n[node name="Title" type="Label" parent="."]\ntext = "Before"\n');
  write(`${plugin}/plugin.cfg`, '[plugin]\nname="Showcase feedback probe"\nscript="probe.gd"\n');
  write(`${plugin}/probe.gd`, fs.readFileSync(path.join(__dirname, 'fixtures/showcase-feedback.gd')));
  for (const name of ['showcase_feedback.gd', 'showcase_gestures.gd', 'showcase_import.gd', 'showcase_import_history.gd', 'showcase_repository.gd']) {
    write(`${plugin}/${name}`, fs.readFileSync(path.join(root, 'Godot/addons/playforge_replay', name)));
  }
  write(`${plugin}/scene_commands.gd`, fs.readFileSync(path.join(root, 'Godot/addons/playforge_agent_chat/scene_commands.gd')));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="blue"/></svg>';
  write('.playforge-store/Assets/first.svg', svg);
  write('.playforge-store/Assets/second.svg', svg);
  write('Assets/fixture.txt', 'Existing source directory');
  const result = spawnSync(godot, ['--headless', '--editor', '--path', project, 'res://scene.tscn'], {
    cwd: root, encoding: 'utf8', timeout: 45000, windowsHide: true,
    env: { ...process.env, APPDATA: settings, XDG_CONFIG_HOME: settings, XDG_DATA_HOME: settings, XDG_CACHE_HOME: settings },
  });
  const output = (result.stdout || '') + (result.stderr || '');
  const evidence = path.join(root, 'Saved/Tests/template-showcase');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'native-feedback.log'), output);
  assert.ok(!result.error, `${result.error}\n${output}`);
  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(output, /PLAYFORGE_SHOWCASE_FEEDBACK_OK/);
});
