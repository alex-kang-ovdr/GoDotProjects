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

test('native chat manages conversation UI, cancels requests and keeps Plan mode read-only', {
  skip: process.platform !== 'win32' || !fs.existsSync(godot) ? 'Windows Godot unavailable' : false,
  timeout: 100000,
}, async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'playforge-chat-workspace-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(temporary)), tempRoot);
    assert.ok(path.basename(temporary).startsWith('playforge-chat-workspace-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const project = path.join(temporary, 'project');
  const config = prepareTemplateShowcase('blank3d', project, 'ready');
  const requests = [];
  let canceledConnection = false;
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = JSON.parse(Buffer.concat(parts).toString());
    const prompt = body.messages.at(-1).content;
    requests.push({ method: req.method, url: req.url, body, prompt });
    if (prompt === 'Cancel this turn') {
      res.once('close', () => { canceledConnection = !res.writableEnded; });
      return;
    }
    const message = {
      role: 'assistant',
      content: prompt === 'Original narrative' ? 'First mock reply' : 'Second mock reply',
    };
    if (prompt === 'Plan a scene edit') {
      message.tool_calls = [{ function: { name: 'pf_workspace_apply', arguments: { operations: [
        { kind: 'node.add', objectId: 'ForbiddenPlanNode', type: 'Label', role: 'gui' },
      ] } } }];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const evidence = path.join(__dirname, '../Saved/Tests/agent-chat-workspace');
  fs.mkdirSync(evidence, { recursive: true });
  const env = { ...process.env, APPDATA: temporary,
    PLAYFORGE_AGENT_CHAT_URL: `http://127.0.0.1:${server.address().port}/api/agent-chat` };
  async function launch(args, label) {
    let result;
    try {
      result = await run(godot, ['--headless', '--editor', '--path', project, ...args],
        { env, timeout: 42000, windowsHide: true });
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
  const probe = path.join(project, 'addons', 'chat_workspace_probe');
  fs.mkdirSync(probe);
  fs.copyFileSync(path.join(__dirname, 'fixtures/agent-chat-workspace.gd'), path.join(probe, 'probe.gd'));
  fs.writeFileSync(path.join(probe, 'plugin.cfg'), '[plugin]\nname="Agent Chat Workspace Probe"\nscript="probe.gd"\n');
  fs.writeFileSync(config, appendEditorPlugin(fs.readFileSync(config, 'utf8'), 'res://addons/chat_workspace_probe/plugin.cfg'));
  const scene = path.join(project, 'scenes/main.tscn');
  const original = fs.readFileSync(scene);
  const output = await launch(['res://scenes/main.tscn'], 'workspace');
  assert.match(output, /PLAYFORGE_AGENT_CHAT_WORKSPACE_OK/);
  assert.deepEqual(fs.readFileSync(scene), original);
  assert.deepEqual(requests.map(request => request.prompt), [
    'Original narrative', 'Alternative workspace', 'Cancel this turn', 'Plan a scene edit',
  ]);
  assert.ok(requests.every(request => request.method === 'POST' && request.url === '/api/agent-chat'));
  assert.equal(canceledConnection, true);
  assert.deepEqual(requests[1].body.messages.slice(1).map(message => message.content), ['Alternative workspace']);
  const plan = requests.at(-1).body;
  assert.deepEqual(plan.tools, []);
  assert.deepEqual(plan.messages.slice(1).map(message => message.content), [
    'Alternative workspace', 'Second mock reply', 'Plan a scene edit',
  ]);
});
