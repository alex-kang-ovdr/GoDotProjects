'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { appendEditorPlugin } = require('../Tools/platform-project.cjs');

const root = path.resolve(__dirname, '..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('installed Godot records MCP edits and real Undo/Redo, then replays from the initial scene', {
  skip: fs.existsSync(godot) ? false : 'Native Godot unavailable',
  timeout: 180000,
}, t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-agent-chat-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(temporary)), temporaryRoot);
    assert.ok(path.basename(temporary).startsWith('playforge-agent-chat-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const evidence = path.join(root, 'Saved', 'Tests', 'agent-chat');
  fs.mkdirSync(evidence, { recursive: true });
  const run = (command, args, label) => {
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 55000, windowsHide: true });
    const log = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(evidence, label + '.log'), log);
    assert.ifError(result.error);
    assert.equal(result.status, 0, log);
    assert.doesNotMatch(log, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
    return log;
  };

  const project = path.join(temporary, 'project');
  run(process.execPath, ['Tools/prepare-template-showcase.cjs', 'tappy-chicken', project], 'prepare');
  const projectConfig = path.join(project, 'project.godot');
  const addonPaths = fs.readFileSync(projectConfig, 'utf8');
  assert.match(addonPaths, /res:\/\/addons\/playforge_agent_chat\/plugin\.cfg/);
  assert.ok(fs.existsSync(path.join(project, 'addons', 'playforge_agent_chat', 'plugin.gd')));
  run(godot, ['--headless', '--editor', '--path', project, '--import', '--quit'], 'import');

  const testAddon = path.join(project, 'addons', 'agent_chat_probe');
  fs.mkdirSync(testAddon);
  fs.writeFileSync(path.join(testAddon, 'plugin.cfg'), '[plugin]\nname="Agent chat test probe"\nscript="probe.gd"\n');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'agent-chat-probe.gd'), path.join(testAddon, 'probe.gd'));
  fs.writeFileSync(projectConfig, appendEditorPlugin(fs.readFileSync(projectConfig, 'utf8'), 'res://addons/agent_chat_probe/plugin.cfg'));
  const sceneFile = path.join(project, 'scenes', 'main.tscn');
  const before = fs.readFileSync(sceneFile);
  const output = run(godot, ['--headless', '--editor', '--path', project, 'res://scenes/main.tscn'], 'native-recording');
  assert.match(output, /PLAYFORGE_AGENT_CHAT_PROBE_OK/);
  assert.deepEqual(fs.readFileSync(sceneFile), before, 'Replay must leave the original scene file intact.');
});
