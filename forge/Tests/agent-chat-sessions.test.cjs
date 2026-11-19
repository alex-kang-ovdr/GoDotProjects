'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('chat conversations retain isolated transcripts across native processes', {
  skip: !fs.existsSync(godot) && 'Native Godot unavailable',
  timeout: 30000,
}, t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const project = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-chat-sessions-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(project)), temporaryRoot);
    assert.ok(path.basename(project).startsWith('playforge-chat-sessions-'));
    fs.rmSync(project, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(project, 'project.godot'), '[application]\nconfig/name="PlayForge Chat Sessions Test"\n');
  fs.copyFileSync(path.join(root, 'Godot/addons/playforge_agent_chat/chat_sessions.gd'), path.join(project, 'chat_sessions.gd'));
  fs.copyFileSync(path.join(__dirname, 'fixtures/agent-chat-sessions.gd'), path.join(project, 'probe.gd'));
  const evidence = path.join(root, 'Saved/Tests/agent-chat-sessions');
  fs.mkdirSync(evidence, { recursive: true });
  for (const mode of ['write', 'reopen']) {
    const result = spawnSync(godot, ['--headless', '--path', project, '--script', 'res://probe.gd', '--', mode], {
      cwd: root, encoding: 'utf8', timeout: 10000, windowsHide: true,
      env: { ...process.env, APPDATA: project, XDG_DATA_HOME: project },
    });
    const output = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(evidence, mode + '.log'), output);
    assert.ifError(result.error);
    assert.equal(result.status, 0, output);
    assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
    assert.ok(output.includes('PLAYFORGE_AGENT_CHAT_SESSIONS_OK ' + mode), output);
  }
});
