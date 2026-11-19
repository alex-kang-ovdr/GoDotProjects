'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');
const { setTimeout: delay } = require('node:timers/promises');
const { appendEditorPlugin } = require('../../Tools/platform-project.cjs');
const { prepareTemplateShowcase } = require('../../Tools/prepare-template-showcase.cjs');

const run = promisify(execFile);
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('native chat Settings connects Claude and ChatGPT through the local provider bridge', {
  skip: process.platform !== 'win32' || !fs.existsSync(godot) ? 'Windows Godot unavailable' : false,
  timeout: 100000,
}, async t => {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const temporary = fs.mkdtempSync(path.join(tempRoot, 'playforge-chat-settings-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(temporary)), tempRoot);
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const project = path.join(temporary, 'project');
  const config = prepareTemplateShowcase('blank3d', project, 'ready');
  const providers = {
    ollama: {
      id: 'ollama', auth: 'connected', configured: true, model: 'fixture-ollama', available: true,
      url: 'http://127.0.0.1:11434', models: ['fixture-ollama', 'qwen3:4b', 'large:test'],
      model_details: [{ name: 'qwen3:4b', recommended: true },
        { name: 'large:test', below_minimum: true, minimum_memory_bytes: 128 * 1024 ** 3 }],
    },
    'claude-console': { id: 'claude-console', auth: 'disconnected', configured: false, detail: 'claude disconnected' },
    'chatgpt-connect': { id: 'chatgpt-connect', auth: 'disconnected', configured: false, detail: 'chatgpt disconnected' },
  };
  const calls = [];
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    const body = parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {};
    calls.push({ method: req.method, url: req.url, body });
    const claude = providers['claude-console'];
    const chatgpt = providers['chatgpt-connect'];
    let extra = {};
    if (req.method === 'GET' && req.url === '/api/agent-chat/providers') {
      if (chatgpt.auth === 'pending') Object.assign(chatgpt, {
        auth: 'connected', configured: true, detail: 'chatgpt connected', streaming: true,
        model: 'fixture-default', models: ['fixture-default', 'fixture-fast'],
        reasoning_efforts: { 'fixture-fast': ['high'] },
      });
    } else if (req.url === '/api/agent-chat/providers/connect' && body.provider === 'ollama') {
      Object.assign(providers.ollama, { model: body.model, url: body.url ?? providers.ollama.url });
    } else if (req.url === '/api/agent-chat/providers/connect' && body.provider === 'claude-console') {
      Object.assign(claude, { auth: 'connected', configured: true, model: body.model, detail: 'claude connected' });
    } else if (req.url === '/api/agent-chat/providers/connect' && body.provider === 'chatgpt-connect') {
      Object.assign(chatgpt, { auth: 'pending', detail: 'chatgpt pending' });
      extra = { connect_url: 'https://auth.openai.com/fixture' };
    } else if (req.url === '/api/agent-chat/providers/disconnect' && body.provider === 'chatgpt-connect') {
      Object.assign(chatgpt, { auth: 'disconnected', configured: false, detail: 'chatgpt disconnected' });
    } else if (req.url === '/api/agent-chat' && providers[body.provider]?.auth === 'connected') {
      const message = { role: 'assistant', content: 'reply from ' + body.provider };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(JSON.stringify({ type: 'delta', text: '응답 작성 중' }) + '\n');
        await delay(500);
        res.end(JSON.stringify({ type: 'final', message }) + '\n');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message }));
      }
      return;
    } else {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unexpected fixture request' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ providers: Object.values(providers), ...extra }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const evidence = path.join(__dirname, '../../Saved/Tests/agent-chat-settings');
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
  const probe = path.join(project, 'addons', 'chat_settings_probe');
  fs.mkdirSync(probe);
  fs.copyFileSync(path.join(__dirname, 'fixtures/agent-chat-settings.gd'), path.join(probe, 'probe.gd'));
  fs.writeFileSync(path.join(probe, 'plugin.cfg'), '[plugin]\nname="Agent Chat Settings Probe"\nscript="probe.gd"\n');
  fs.writeFileSync(config, appendEditorPlugin(fs.readFileSync(config, 'utf8'), 'res://addons/chat_settings_probe/plugin.cfg'));
  const output = await launch(['res://scenes/main.tscn'], 'settings');
  assert.match(output, /PLAYFORGE_AGENT_CHAT_SETTINGS_OK/);
  assert.doesNotMatch(output, /fixture-claude-key/);
  assert.deepEqual(calls.map(({ method, url, body }) => [method, url, body.provider]), [
    ['GET', '/api/agent-chat/providers', undefined],
    ['POST', '/api/agent-chat/providers/connect', 'ollama'],
    ['POST', '/api/agent-chat/providers/connect', 'ollama'],
    ['POST', '/api/agent-chat/providers/connect', 'claude-console'],
    ['POST', '/api/agent-chat', 'claude-console'],
    ['POST', '/api/agent-chat/providers/connect', 'chatgpt-connect'],
    ['GET', '/api/agent-chat/providers', undefined],
    ['POST', '/api/agent-chat', 'chatgpt-connect'],
    ['POST', '/api/agent-chat/providers/disconnect', 'chatgpt-connect'],
  ]);
  assert.deepEqual(calls[1].body, { provider: 'ollama', model: 'qwen3:4b' });
  assert.deepEqual(calls[2].body, { provider: 'ollama', model: 'alternate:latest', url: 'http://127.0.0.1:11555' });
  assert.equal(calls[3].body.api_key, 'fixture-claude-key');
  assert.equal(calls[3].body.model, 'fixture-claude-model');
  assert.equal(calls[7].body.stream, true);
  assert.equal(calls[7].body.model, 'fixture-fast');
  assert.equal(calls[7].body.reasoning_effort, 'high');
  assert.equal(calls[7].body.service_tier, 'fast');
  assert.ok(calls.filter(({ body }) => Object.hasOwn(body, 'api_key')).length === 1);
});
