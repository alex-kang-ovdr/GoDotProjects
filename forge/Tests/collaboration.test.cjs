'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocket } = require('ws');
const Y = require('yjs');
const { createServer } = require('../server.cjs');

async function setup(t) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gameplayforge-test-'));
  const server = createServer({ workspace });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => {
    server.shutdown();
    await new Promise(resolve => server.listening ? server.once('close', resolve) : resolve());
    const target = fs.realpathSync(workspace);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('gameplayforge-test-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  return { server, workspace, base };
}
async function join(base, clientId, name) {
  const socket = new WebSocket(base.replace('http:', 'ws:') + '/collaboration', { origin: base });
  socket.messages = [];
  socket.on('message', data => socket.messages.push(JSON.parse(data.toString())));
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  socket.send(JSON.stringify({ type: 'join', clientId, name }));
  await until(() => socket.messages.find(m => m.type === 'welcome'));
  return socket;
}
async function until(check) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) { const value = check(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for collaboration state');
}
test('two real sockets share presence, cursor and focus; disconnect removes the user', async t => {
  const { base } = await setup(t);
  const alice = await join(base, 'client-alice', 'Alice');
  const bob = await join(base, 'client-bobby', 'Bob');
  t.after(() => { alice.terminate(); bob.terminate(); });
  await until(() => alice.messages.some(m => m.type === 'presence' && m.users.length === 2));
  bob.send(JSON.stringify({ type: 'presence', focus: 'script-source', focusField: 'f'.repeat(140),
    selectedAsset: 'asset/'.repeat(50), cursor: { x: .25, y: .75, pane: 'pie' } }));
  const update = await until(() => alice.messages.find(m => m.type === 'presence' && m.users.some(u => u.clientId === 'client-bobby' && u.focus === 'script-source')));
  const collaborator = update.users.find(u => u.clientId === 'client-bobby');
  assert.deepEqual(collaborator.cursor, { x: .25, y: .75, pane: 'pie' });
  assert.equal(collaborator.focusField.length, 120);
  assert.equal(collaborator.selectedAsset.length, 160);
  alice.messages.length = 0;
  bob.close();
  await until(() => alice.messages.some(m => m.type === 'presence' && m.users.length === 1));
});
test('invalid collaboration messages are isolated and settings lock tokens stay private', async t => {
  const { base } = await setup(t);
  const alice = await join(base, 'client-alice', 'Alice');
  const bob = await join(base, 'client-bobby', 'Bob');
  t.after(() => { alice.terminate(); bob.terminate(); });

  alice.send(JSON.stringify({ type: 'lock', action: 'acquire', resource: 'settings', requestId: 'alice-lock-0001' }));
  const aliceLock = await until(() => alice.messages.find(message => message.type === 'lock' && message.owner === 'client-alice' && message.token));
  const bobLock = await until(() => bob.messages.find(message => message.type === 'lock' && message.owner === 'client-alice'));
  assert.equal(typeof aliceLock.token, 'number');
  assert.equal(Object.hasOwn(bobLock, 'token'), false);
  alice.messages.length = 0;
  alice.send(JSON.stringify({ type: 'lock', action: 'release', resource: 'settings', requestId: 'alice-release-0001' }));
  const missingToken = await until(() => alice.messages.find(message => message.type === 'error' && message.requestId === 'alice-release-0001'));
  assert.match(missingToken.error, /Invalid settings lock token/);
  assert.equal((await fetch(base + '/api/project')).status, 200);

  const invalid = new WebSocket(base.replace('http:', 'ws:') + '/collaboration', { origin: base });
  await new Promise((resolve, reject) => { invalid.once('open', resolve); invalid.once('error', reject); });
  const closed = new Promise(resolve => invalid.once('close', code => resolve(code)));
  invalid.send('null');
  assert.equal(await closed, 1007);
  assert.equal((await fetch(base + '/api/health')).status, 200);

  alice.messages.length = 0;
  alice.send(JSON.stringify({ type: 'text-update', requestId: 'alice-bad-0001', update: 'not-base64!' }));
  const badUpdate = await until(() => alice.messages.find(message => message.type === 'error' && message.requestId === 'alice-bad-0001'));
  assert.match(badUpdate.error, /Invalid collaboration update/);
  assert.equal((await fetch(base + '/api/project')).status, 200);
});

test('shared document broadcasts, stale edits are rejected, and saved state survives reload', async t => {
  const { base, workspace } = await setup(t);
  const alice = await join(base, 'client-alice', 'Alice');
  t.after(() => alice.terminate());
  const original = await (await fetch(base + '/api/project')).json();
  assert.equal(original.project.presenter, '/Projects/TappyChicken/presenter.js');
  assert.equal(original.project.scene.name, 'Main');
  assert.equal(original.project.settingsSchema.version, 1);
  assert.equal(typeof original.textState, 'string');
  const edit = { baseRevision: original.revision, source: original.source + '\n-- 공동 편집 🐔', settings: original.settings, clientId: 'client-bobby' };
  const put = data => fetch(base + '/api/project', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const saved = await (await put(edit)).json();
  assert.equal(saved.revision, original.revision + 1);
  await until(() => alice.messages.some(m => m.type === 'document' && m.document.source === edit.source));
  const stale = await put({ ...edit, source: 'stale overwrite' });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).document.source, edit.source);
  const disk = JSON.parse(fs.readFileSync(path.join(workspace, 'tappy.json'), 'utf8'));
  assert.equal(disk.source, edit.source);
  const { ProjectStore } = require('../Tools/project-store.cjs');
  assert.equal(new ProjectStore(path.resolve(__dirname, '..'), workspace).snapshot().source, edit.source);
});
test('concurrent writers have one winner and validation cannot mutate saved state', async t => {
  const { base } = await setup(t);
  const document = await (await fetch(base + '/api/project')).json();
  const put = data => fetch(base + '/api/project', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await Promise.all([put({ ...document, baseRevision: document.revision, source: 'first' }), put({ ...document, baseRevision: document.revision, source: 'second' })]);
  assert.deepEqual(result.map(r => r.status).sort(), [200, 409]);
  const current = await (await fetch(base + '/api/project')).json();
  assert.equal((await put({ ...current, baseRevision: current.revision, settings: { gravity: -1 } })).status, 400);
  assert.deepEqual(await (await fetch(base + '/api/project')).json(), current);
  assert.equal((await fetch(base + '/api/project', { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://foreign.invalid' }, body: '{}' })).status, 403);
});

test('concurrent Y.Text inserts converge, duplicate operations are idempotent, and reconnect gets full state', async t => {
  const { base, workspace } = await setup(t);
  const alice = await join(base, 'client-alice', 'Alice');
  const bob = await join(base, 'client-bobby', 'Bob');
  t.after(() => { alice.terminate(); bob.terminate(); });

  const initial = alice.messages.find(message => message.type === 'welcome').document;
  assert.equal(typeof initial.textState, 'string');
  const aliceDoc = new Y.Doc();
  const bobDoc = new Y.Doc();
  Y.applyUpdate(aliceDoc, Buffer.from(initial.textState, 'base64'));
  Y.applyUpdate(bobDoc, Buffer.from(initial.textState, 'base64'));
  const baseline = Y.encodeStateVector(aliceDoc);
  const offset = aliceDoc.getText('script').length;
  aliceDoc.getText('script').insert(offset, '\n# Alice concurrent edit');
  bobDoc.getText('script').insert(offset, '\n# Bob concurrent edit');
  const aliceUpdate = Buffer.from(Y.encodeStateAsUpdate(aliceDoc, baseline)).toString('base64');
  const bobUpdate = Buffer.from(Y.encodeStateAsUpdate(bobDoc, baseline)).toString('base64');
  alice.send(JSON.stringify({ type: 'text-update', requestId: 'alice-edit-0001', update: aliceUpdate }));
  bob.send(JSON.stringify({ type: 'text-update', requestId: 'bobby-edit-0001', update: bobUpdate }));
  await until(() => alice.messages.find(message => message.type === 'text-ack' && message.requestId === 'alice-edit-0001'));
  await until(() => bob.messages.find(message => message.type === 'text-ack' && message.requestId === 'bobby-edit-0001'));

  const document = await (await fetch(base + '/api/project')).json();
  assert.match(document.source, /# Alice concurrent edit/);
  assert.match(document.source, /# Bob concurrent edit/);
  const mergedDoc = new Y.Doc();
  Y.applyUpdate(mergedDoc, Buffer.from(document.textState, 'base64'));
  assert.equal(mergedDoc.getText('script').toString(), document.source);
  assert.equal(document.textRevision, initial.textRevision + 2);

  const storePath = path.resolve(__dirname, '..');
  const { ProjectStore } = require('../Tools/project-store.cjs');
  const restored = new ProjectStore(storePath, workspace).snapshot();
  assert.equal(restored.source, document.source);
  assert.equal(restored.textState, document.textState);
  assert.equal(restored.textRevision, document.textRevision);

  const charlie = await join(base, 'client-charlie', 'Charlie');
  t.after(() => charlie.terminate());
  const rejoined = charlie.messages.find(message => message.type === 'welcome').document;
  const replayDoc = new Y.Doc();
  Y.applyUpdate(replayDoc, Buffer.from(rejoined.textState, 'base64'));
  assert.equal(replayDoc.getText('script').toString(), document.source);

  const beforeDuplicate = document.revision;
  alice.messages.length = 0;
  alice.send(JSON.stringify({ type: 'text-update', requestId: 'alice-edit-0001', update: aliceUpdate }));
  const duplicateAck = await until(() => alice.messages.find(message => message.type === 'text-ack' && message.requestId === 'alice-edit-0001'));
  assert.equal(duplicateAck.duplicate, true);
  assert.equal((await (await fetch(base + '/api/project')).json()).revision, beforeDuplicate);
  alice.messages.length = 0;
  alice.send(JSON.stringify({ type: 'text-update', requestId: 'alice-edit-0001', update: bobUpdate }));
  const reusedId = await until(() => alice.messages.find(message => message.type === 'error' && message.requestId === 'alice-edit-0001'));
  assert.match(reusedId.error, /reused with a different update/);
});

test('settings lock is exclusive, revision checked, persisted, and fenced after release', async t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'gameplayforge-lock-'));
  t.after(() => {
    const target = fs.realpathSync(workspace);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(target).startsWith('gameplayforge-lock-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const root = path.resolve(__dirname, '..');
  const { ProjectStore } = require('../Tools/project-store.cjs');
  const store = new ProjectStore(root, workspace);
  const alice = await store.acquireLock('client-alice');
  assert.equal(alice.acquired, true);
  assert.equal(alice.owner, 'client-alice');
  const bob = await store.acquireLock('client-bobby');
  assert.equal(bob.acquired, false);
  assert.equal(bob.owner, 'client-alice');

  const before = store.snapshot();
  const changedSettings = { ...before.settings, gravity: before.settings.gravity + 10 };
  await assert.rejects(store.update({ source: before.source, settings: changedSettings,
    baseRevision: before.revision, clientId: 'client-alice', lockToken: alice.token }), /settings_lock_required/);
  await assert.rejects(store.update({ source: before.source, settings: changedSettings,
    settingsRevision: before.settingsRevision, clientId: 'client-bobby', lockToken: bob.token }), /settings_lock_required/);
  assert.equal(store.snapshot().settings.gravity, before.settings.gravity);

  const save = await store.update({ source: before.source, settings: changedSettings,
    settingsRevision: before.settingsRevision, clientId: 'client-alice', lockToken: alice.token });
  assert.equal(save.conflict, false);
  assert.equal(save.document.settingsRevision, before.settingsRevision + 1);
  assert.equal(save.document.settings.gravity, changedSettings.gravity);
  assert.equal(await store.releaseLock('client-alice', alice.token), true);

  const bobNext = await store.acquireLock('client-bobby');
  assert.equal(bobNext.acquired, true);
  assert.ok(bobNext.token > alice.token);
  const staleRevision = await store.update({ source: save.document.source, settings: { ...save.document.settings, gravity: 1300 },
    settingsRevision: before.settingsRevision, clientId: 'client-bobby', lockToken: bobNext.token });
  assert.equal(staleRevision.conflict, true);
  assert.equal(staleRevision.reason, 'settings_revision_conflict');
  await assert.rejects(store.update({ source: save.document.source, settings: { ...save.document.settings, gravity: 1300 },
    settingsRevision: save.document.settingsRevision, clientId: 'client-bobby', lockToken: alice.token }), /settings_lock_required/);

  const final = await store.update({ source: save.document.source, settings: { ...save.document.settings, gravity: 1300 },
    settingsRevision: save.document.settingsRevision, clientId: 'client-bobby', lockToken: bobNext.token });
  assert.equal(final.conflict, false);
  assert.equal(final.document.settings.gravity, 1300);
  const reloaded = new ProjectStore(root, workspace).snapshot();
  assert.equal(reloaded.settingsRevision, final.document.settingsRevision);
  assert.equal(reloaded.settings.gravity, 1300);
  const restarted = new ProjectStore(root, workspace);
  const afterRestart = await restarted.acquireLock('client-charlie');
  assert.ok(afterRestart.token > bobNext.token);
  assert.equal(await restarted.releaseLock('client-charlie', afterRestart.token), true);
  assert.equal(await store.releaseLock('client-bobby', alice.token), false);
  assert.equal(await store.releaseLock('client-bobby', bobNext.token), true);
});
