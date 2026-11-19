'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const run = promisify(execFile);
const godot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';

test('loopback streaming client emits partial UTF-8, final and error events, and cancels the request', {
  skip: !fs.existsSync(godot) && 'Native Godot unavailable',
  timeout: 30000,
}, async t => {
  const root = path.resolve(__dirname, '..');
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const project = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-chat-stream-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(project)), temporaryRoot);
    assert.ok(path.basename(project).startsWith('playforge-chat-stream-'));
    fs.rmSync(project, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(project, 'project.godot'), 'config_version=5\n');
  fs.copyFileSync(path.join(root, 'Godot/addons/playforge_agent_chat/chat_stream.gd'), path.join(project, 'chat_stream.gd'));
  fs.copyFileSync(path.join(__dirname, 'fixtures/agent-chat-stream.gd'), path.join(project, 'probe.gd'));
  const requests = [];
  let canceled = false;
  const line = (type, payload) => JSON.stringify({ type, ...payload }) + '\n';
  const server = http.createServer(async (req, res) => {
    const parts = [];
    for await (const part of req) parts.push(part);
    requests.push({ url: req.url, body: parts.length ? JSON.parse(Buffer.concat(parts).toString()) : {} });
    if (req.url === '/normal-error') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end('{"error":"Try later"}');
      return;
    }
    if (req.url === '/redirect') {
      res.writeHead(307, { Location: '/must-not-receive' });
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'Application/X-NDJSON; charset=utf-8' });
    switch (req.url) {
      case '/complete': {
        const delta = Buffer.from(line('delta', { text: '안녕' }));
        const split = delta.indexOf(Buffer.from('안')) + 1;
        res.write(delta.subarray(0, split));
        setTimeout(() => res.write(delta.subarray(split)), 30);
        setTimeout(() => res.end(line('delta', { text: ' world' })
          + line('final', { message: { role: 'assistant', content: '안녕 world' } }).trimEnd()), 400);
        return;
      }
      case '/truncated':
        res.end(line('delta', { text: 'unfinished' }));
        return;
      case '/large-line':
        res.end('x'.repeat(525000));
        return;
      case '/cancel':
        res.once('close', () => { canceled = !res.writableEnded; });
        res.write(line('delta', { text: 'canceled' }));
        return;
      default:
        res.end(line('error', { error: 'Provider connection ended' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  let result;
  try {
    result = await run(godot, ['--headless', '--path', project, '--script', 'res://probe.gd', '--', endpoint],
      { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true });
  } catch (error) {
    result = error;
  }
  const output = (result.stdout || '') + (result.stderr || '');
  const evidence = path.join(root, 'Saved/Tests/agent-chat-stream');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, 'native.log'), output);
  if (result instanceof Error) throw result;
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  assert.match(output, /PLAYFORGE_AGENT_CHAT_STREAM_OK/);
  assert.deepEqual(requests.map(request => request.url), [
    '/complete', '/normal-error', '/redirect', '/truncated', '/large-line', '/cancel', '/stream-error',
  ]);
  assert.ok(requests.every(request => request.body.stream === true));
  assert.equal(canceled, true);
});
