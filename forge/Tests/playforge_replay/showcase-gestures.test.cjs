'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('real GraphEdit pins and controls drive showcase gestures through zoom, completion and cancellation', {
  skip: !fs.existsSync(godot) && 'Native Godot unavailable',
  timeout: 30000,
}, t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const project = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-gesture-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(project)), temporaryRoot);
    assert.ok(path.basename(project).startsWith('playforge-gesture-'));
    fs.rmSync(project, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(project, 'project.godot'), 'config_version=5\n');
  fs.copyFileSync(path.join(root, 'Godot/addons/playforge_replay/showcase_gestures.gd'), path.join(project, 'showcase_gestures.gd'));
  fs.copyFileSync(path.join(__dirname, 'fixtures/showcase-gestures.gd'), path.join(project, 'probe.gd'));
  const result = spawnSync(godot, ['--headless', '--path', project, '--script', 'res://probe.gd'], {
    cwd: root, encoding: 'utf8', timeout: 25000, windowsHide: true,
  });
  const output = (result.stdout || '') + (result.stderr || '');
  const evidence = path.join(root, 'Saved/Tests/template-showcase');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'native-gesture.log'), output);
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(output, /PLAYFORGE_SHOWCASE_GESTURES_OK/);
});
