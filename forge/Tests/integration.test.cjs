'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const http = require('node:http');
const { createServer } = require('../server.cjs');
const root = path.resolve(__dirname, '..');
let server, port;
before(async () => {
  server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });
function request(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject); req.end();
  });
}
test('catalog launches available entries and links to existing analysis', async t => {
  const response = await request('/projects.json');
  assert.equal(response.status, 200);
  const { projects } = JSON.parse(response.body);
  assert.equal(new Set(projects.map(p => p.id)).size, projects.length);
  const missingEntries = [];
  for (const project of projects) {
    assert.ok(project.title && project.description && project.kind);
    for (const field of ['entrypoint', 'reference']) {
      assert.ok(project[field], `${project.id}.${field}`);
      assert.ok(!/^(https?:|\/|.*\.\.)/.test(project[field]));
      const status = (await request('/' + encodeURI(project[field]))).status;
      if (field === 'entrypoint' && status === 404) {
        missingEntries.push(`${project.id}: ${project[field]}`);
        continue;
      }
      assert.equal(status, 200, project[field]);
    }
  }
  assert.ok(projects.some(project => project.id === 'official-godot'));
  if (missingEntries.length) t.diagnostic(`Historical catalog entries unavailable in this checkout:\n${missingEntries.join('\n')}`);
});
test('available imported reference files retain their original bytes', t => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Docs/imports.json')));
  let available = 0;
  const missing = [];
  for (const archive of manifest.archives) for (const file of archive.files) {
    const filename = path.join(root, file.destination);
    if (!fs.existsSync(filename)) {
      missing.push(file.destination);
      continue;
    }
    const content = fs.readFileSync(filename);
    assert.equal(crypto.createHash('sha256').update(content).digest('hex'), file.sha256, file.destination);
    available++;
  }
  assert.equal(available + missing.length, manifest.archives.reduce((sum, archive) => sum + archive.files.length, 0));
  assert.ok(available > 0, 'At least one imported source file must be available and verified');
  if (missing.length) {
    const groups = missing.reduce((counts, filename) => {
      const archive = filename.startsWith('WebProjects/') ? 'WebProjects archive' : 'Studio archive';
      counts[archive] = (counts[archive] || 0) + 1;
      return counts;
    }, {});
    t.diagnostic(`Imported file inventory: verified ${available}; missing ${missing.length} (${JSON.stringify(groups)}). Full paths are recorded in Saved/Tests/latest/summary.json.`);
  }
});
test('available entry HTML dependencies resolve locally and classic scripts compile', async t => {
  const { projects } = JSON.parse(fs.readFileSync(path.join(root, 'projects.json')));
  const entries = ['index.html', ...projects.map(p => p.entrypoint)];
  const unavailable = entries.filter(entry => !fs.existsSync(path.join(root, entry.split('?')[0].split('#')[0])));
  if (unavailable.length) t.diagnostic(`Skipped unavailable catalog pages: ${unavailable.join(', ')}`);
  for (const entry of entries.filter(entry => fs.existsSync(path.join(root, entry.split('?')[0].split('#')[0])))) {
    const filename = entry.split('?')[0].split('#')[0];
    const html = fs.readFileSync(path.join(root, filename), 'utf8');
    const urls = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]);
    for (const url of urls) {
      assert.ok(!/^(https?:)?\/\//.test(url), `Unexpected runtime network dependency: ${url}`);
      if (url.startsWith('data:')) continue; // Embedded favicon; no HTTP request needed.
      const target = new URL(url, 'http://local/' + encodeURI(filename));
      const response = await request(target.pathname);
      assert.equal(response.status, 200, `${entry} -> ${url}`);
      if (url.endsWith('.js')) new vm.Script(response.body, { filename: url });
    }
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc=|application\/json|type=["']module/.test(match[1])) new vm.Script(match[2], { filename: entry });
    }
  }
});
test('HTTP preserves UTF-8, script MIME, HEAD and directory-relative links', async () => {
  const korean = await request('/' + encodeURI('References/삼국지 11/ANALYSIS.md'));
  assert.equal(korean.status, 200); assert.match(korean.headers['content-type'], /text\/plain.*utf-8/);
  assert.match(korean.body, /삼국지/);
  const script = await request('/OfficialGodot/platform.js', 'HEAD');
  assert.equal(script.status, 200); assert.match(script.headers['content-type'], /javascript/); assert.equal(script.body, '');
  assert.equal((await request('/OfficialGodot')).status, 308);
  assert.equal((await request('/OfficialGodot/')).status, 200);
  // The legacy HTML/JS Studio was retired on 2026-11-25.
  for (const url of ['/Studio/', '/StudioGodot/', '/Studio/studio.js']) assert.equal((await request(url)).status, 404, url);
});
test('server rejects traversal, metadata and writes without exposing other worktree files', async () => {
  for (const url of ['/%2e%2e%2fAGENTS.md', '/.git/config', '/Saved/Tests/latest/summary.json', '/sAvEd/test', '/Engine/build/a.exe', '/node_modules/a', '/WebProjects/League%20of%20Legends/Playable/Current/.openai/hosting.json']) {
    assert.equal((await request(url)).status, 403, url);
  }
  for (const url of ['/%00', '/%5c..%5cREADME.md', '/%zz', '/file:stream']) assert.equal((await request(url)).status, 400, url);
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/missing-entry')).status, 404);
});
