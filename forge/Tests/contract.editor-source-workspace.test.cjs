'use strict';
// The Godot editor plugin (Godot/addons/playforge_service/plugin.gd) reads GET /api/project and writes
// PUT /api/editor/source with baseRevision. The legacy HTML/JS Studio, its Yjs collaboration socket and
// PUT /api/project were retired on 2026-11-25; workspaces saved by them must still load.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createServer } = require('../server.cjs');
const { ProjectStore } = require('../Tools/project-store.cjs');

const ROOT = path.resolve(__dirname, '..');
const RETIRED_FIELDS = ['textState', 'textStateVersion', 'operations', 'lockFence', 'textRevision', 'settingsRevision'];

function tempWorkspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-editor-source-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function start(t, workspace) {
  const server = createServer({ workspace, hubAuth: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.shutdown();
    await new Promise(resolve => server.listening ? server.once('close', resolve) : resolve());
  });
  return 'http://127.0.0.1:' + server.address().port;
}

const putSource = (base, body, headers = {}) => fetch(base + '/api/editor/source', {
  method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

test('editor source saves with baseRevision, rejects stale or invalid writes, and survives reload', async t => {
  const workspace = tempWorkspace(t);
  const base = await start(t, workspace);
  const original = await (await fetch(base + '/api/project')).json();
  assert.equal(typeof original.source, 'string');
  assert.ok(Number.isSafeInteger(original.revision));
  assert.equal(original.project.settingsSchema.version, 1);
  for (const field of RETIRED_FIELDS) assert.equal(field in original, false, field);

  const edited = original.source + '\n# editor plugin edit';
  const saved = await putSource(base, { source: edited, baseRevision: original.revision });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.document.revision, original.revision + 1);
  assert.equal(savedBody.document.source, edited);
  assert.deepEqual(savedBody.document.settings, original.settings);

  const stale = await putSource(base, { source: 'stale overwrite', baseRevision: original.revision });
  assert.equal(stale.status, 409);
  const staleBody = await stale.json();
  assert.equal(staleBody.error, 'revision_conflict');
  assert.equal(staleBody.document.source, edited);

  assert.equal((await putSource(base, { source: 'missing revision' })).status, 400);
  assert.equal((await putSource(base, { source: 'x'.repeat(256001), baseRevision: savedBody.document.revision })).status, 400);
  assert.equal((await putSource(base, { source: 'foreign', baseRevision: savedBody.document.revision }, { Origin: 'https://foreign.invalid' })).status, 403);

  const disk = JSON.parse(fs.readFileSync(path.join(workspace, 'tappy.json'), 'utf8'));
  assert.deepEqual(Object.keys(disk).sort(), ['revision', 'settings', 'source']);
  assert.equal(disk.source, edited);
  const reloaded = new ProjectStore(ROOT, workspace).snapshot();
  assert.equal(reloaded.source, edited);
  assert.equal(reloaded.revision, original.revision + 1);
});

test('concurrent editor writes on one revision have exactly one winner', async t => {
  const base = await start(t, tempWorkspace(t));
  const document = await (await fetch(base + '/api/project')).json();
  const results = await Promise.all(['first', 'second'].map(source => putSource(base, { source, baseRevision: document.revision })));
  assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
  const current = await (await fetch(base + '/api/project')).json();
  assert.equal(current.revision, document.revision + 1);
  assert.ok(['first', 'second'].includes(current.source));
});

test('a workspace saved by the retired Studio loads its source and drops collaboration fields on the next write', async t => {
  const fresh = new ProjectStore(ROOT, tempWorkspace(t)).snapshot();
  const workspace = tempWorkspace(t);
  const file = path.join(workspace, 'tappy.json');
  const source = fresh.source + '\n# saved by Studio';
  fs.writeFileSync(file, JSON.stringify({
    source, settings: fresh.settings, revision: 7, textRevision: 4, settingsRevision: 2,
    textStateVersion: 2, textState: 'AQGF', lockFence: 3,
    operations: [{ clientId: 'client-alice', requestId: 'old-request-0001', hash: 'h', update: 'AQGF', revision: 7, textRevision: 4, at: 1 }],
  }));

  const store = new ProjectStore(ROOT, workspace);
  assert.deepEqual(store.snapshot().source, source);
  assert.equal(store.snapshot().revision, 7);
  assert.deepEqual(store.snapshot().settings, fresh.settings);
  // Loading alone does not rewrite the file.
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).lockFence, 3);

  const result = await store.updateSource(source + '\n# next', 7);
  assert.equal(result.conflict, false);
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(disk).sort(), ['revision', 'settings', 'source']);
  assert.equal(disk.revision, 8);
});

test('retired Studio routes, PUT /api/project and the collaboration socket are gone', async t => {
  const base = await start(t, tempWorkspace(t));
  for (const route of ['/Studio/', '/StudioGodot/', '/Studio/studio.js', '/assets/gameplayforge-y.js']) {
    assert.equal((await fetch(base + route)).status, 404, route);
  }
  const document = await (await fetch(base + '/api/project')).json();
  const legacyPut = await fetch(base + '/api/project', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: 'legacy', settings: document.settings, baseRevision: document.revision }),
  });
  assert.equal(legacyPut.status, 404);
  assert.equal((await (await fetch(base + '/api/project')).json()).source, document.source);

  const socket = new WebSocket(base.replace('http:', 'ws:') + '/collaboration', { origin: base });
  t.after(() => socket.terminate());
  await new Promise((resolve, reject) => {
    socket.once('open', () => reject(new Error('Retired /collaboration socket accepted a connection')));
    socket.once('error', resolve);
  });
});
