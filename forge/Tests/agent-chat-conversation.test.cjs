'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const { appendEditorPlugin } = require('../Tools/platform-project.cjs');
const { prepareTemplateShowcase } = require('../Tools/prepare-template-showcase.cjs');

const run = promisify(execFile);
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('native chat applies a provider tool call to the selection and replays its real Undo', {
  skip: process.platform !== 'win32' || !fs.existsSync(godot) ? 'Windows Godot unavailable' : false,
  timeout: 120000,
}, async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'playforge-conversation-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(temporary)), tempRoot);
    assert.ok(path.basename(temporary).startsWith('playforge-conversation-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const project = path.join(temporary, 'project');
  const config = prepareTemplateShowcase('tappy-chicken', project, 'ready');
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    calls.push({ url: req.url, method: req.method, body: JSON.parse(Buffer.concat(parts).toString()) });
    const response = calls.length === 1 ? {
      content: '선택한 문구를 바꿨어요.',
      tool_calls: [{ function: { name: 'pf_workspace_apply', arguments: { operations: [{
        kind: 'property.set', objectId: 'Hud/Status', propertyId: 'text', value: '준비 완료',
        role: 'gui', description: '상태 문구 변경',
      }] } } }],
    } : { content: '현재 상태 문구는 준비 완료입니다.' };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: { role: 'assistant', ...response }, done: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const evidence = path.join(__dirname, '../Saved/Tests/agent-chat-conversation');
  fs.mkdirSync(evidence, { recursive: true });
  const env = { ...process.env, APPDATA: temporary, PLAYFORGE_AGENT_MODEL: 'conversation-fixture',
    PLAYFORGE_OLLAMA_URL: `http://127.0.0.1:${server.address().port}/api/chat` };
  async function launch(args, label) {
    let result;
    try {
      result = await run(godot, ['--headless', '--editor', '--path', project, ...args], { env, timeout: 50000, windowsHide: true });
    } catch (error) {
      result = error;
    }
    const log = (result.stdout || '') + (result.stderr || '');
    fs.writeFileSync(path.join(evidence, label + '.log'), log);
    if (result instanceof Error) throw result;
    assert.doesNotMatch(log, /SCRIPT ERROR:|^ERROR:/m);
    return log;
  }
  await launch(['--import', '--quit'], 'import');
  const probe = path.join(project, 'addons', 'conversation_probe');
  fs.mkdirSync(probe);
  fs.copyFileSync(path.join(__dirname, 'fixtures/agent-chat-conversation.gd'), path.join(probe, 'probe.gd'));
  fs.writeFileSync(path.join(probe, 'plugin.cfg'), '[plugin]\nname="Agent Conversation Probe"\nscript="probe.gd"\n');
  fs.writeFileSync(config, appendEditorPlugin(fs.readFileSync(config, 'utf8'), 'res://addons/conversation_probe/plugin.cfg'));
  const scene = path.join(project, 'scenes/main.tscn');
  const original = fs.readFileSync(scene);
  const output = await launch(['res://scenes/main.tscn'], 'conversation');
  assert.match(output, /PLAYFORGE_AGENT_CONVERSATION_OK/);
  assert.deepEqual(fs.readFileSync(scene), original);
  assert.equal(calls.length, 2);
  for (const { url, method, body } of calls) {
    assert.equal(url, '/api/chat');
    assert.equal(method, 'POST');
    assert.equal(body.model, 'conversation-fixture');
    assert.equal(body.stream, false);
    assert.equal(body.tools[0].function.name, 'pf_workspace_apply');
    const system = body.messages[0];
    assert.equal(system.role, 'system');
    assert.deepEqual(JSON.parse(system.content.slice(system.content.indexOf('{'))), {
      scene: 'res://scenes/main.tscn', rootType: 'Node2D', selection: [{ path: 'Hud/Status', type: 'Label' }],
    });
  }
  const firstTurn = calls[0].body.messages.slice(1);
  assert.deepEqual(firstTurn, [{ role: 'user', content: '선택한 상태 문구를 준비 완료로 바꿔 줘.' }]);
  const nextTurn = calls[1].body.messages.slice(1);
  assert.deepEqual(nextTurn.map(item => item.role), ['user', 'assistant', 'user']);
  assert.deepEqual(nextTurn[0], firstTurn[0]);
  assert.match(nextTurn[1].content, /선택한 문구를 바꿨어요\./);
  assert.equal(nextTurn[2].content, '지금 상태 문구를 설명해 줘.');
});
