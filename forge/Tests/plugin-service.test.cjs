'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const { createServer } = require('../server.cjs');
const { findGodot } = require('../Tools/native-runtime.cjs');

const root = path.resolve(__dirname, '..');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => server.close(() => resolve()));
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function runGodot(executable, args, cwd) {
  return new Promise(resolve => {
    const child = spawn(executable, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30000);
    child.once('error', error => { clearTimeout(timer); resolve({ status: null, stdout, stderr, error }); });
    child.once('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr, error: timedOut ? new Error('Godot test timed out') : null });
    });
  });
}

test('native Godot plugin requests source, handles stale revisions, and polls build states', async t => {
  const executable = findGodot(root);
  assert.ok(fs.existsSync(executable), `Godot executable does not exist: ${executable}`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-plugin-service-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const backend = createServer({
    workspace: path.join(temp, 'workspace'),
    buildDirectory: path.join(temp, 'builds'),
  });
  const backendPort = await listen(backend);

  let buildPoll = 0;
  const fakeBuild = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/builds') {
      let raw = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { raw += chunk; });
      req.on('end', () => {
        const body = JSON.parse(raw);
        if (body.target !== 'web' || !Number.isSafeInteger(body.revision)) return json(res, 400, { ok: false, error: 'bad build request' });
        buildPoll = 0;
        json(res, 202, { ok: true, build: { id: '0123456789abcdef', status: 'queued', revision: body.revision, target: 'web' } });
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/api/builds/0123456789abcdef') {
      buildPoll += 1;
      const status = buildPoll === 1 ? 'running' : 'succeeded';
      return json(res, 200, { ok: true, build: {
        id: '0123456789abcdef', status, revision: 2, target: 'web',
        ...(status === 'succeeded' ? {
          previewUrl: '/api/builds/0123456789abcdef/files/index.html',
          downloadUrl: '/api/builds/0123456789abcdef/files/PlayForge-Web.zip',
        } : {}),
      } });
    }
    json(res, 404, { ok: false, error: 'not found' });
  });
  const buildPort = await listen(fakeBuild);
  t.after(async () => {
    backend.shutdown();
    await Promise.all([close(fakeBuild), new Promise(resolve => backend.once('close', resolve))]);
  });

  const godotProject = path.join(root, 'Godot');
  const args = [
    '--headless', '--path', godotProject,
    '--script', 'res://tests/plugin_service.gd', '--',
    '--backend-url=http://127.0.0.1:' + backendPort,
    '--build-url=http://127.0.0.1:' + buildPort,
  ];
  const result = await runGodot(executable, args, godotProject);
  const output = result.stdout + result.stderr + (result.error ? '\n' + result.error.message : '');
  assert.equal(result.status, 0, output);
  assert.match(output, /PASS native Godot service contract/);
  t.diagnostic(output.trim());
});
