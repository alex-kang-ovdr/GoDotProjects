'use strict';
// Shared GDScript source moved from the legacy Y.Text root to 'script' (textStateVersion 2, 2026-11-25).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const Y = require('yjs');
const { ProjectStore, SCRIPT_TEXT_KEY, TEXT_STATE_VERSION } = require('../Tools/project-store.cjs');

const ROOT = path.resolve(__dirname, '..');
const LEGACY_KEY = 'lua'; // root name used by version 1 workspaces

function tempWorkspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gameplayforge-migrate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function legacyState(source, settings, extra = {}) {
  const doc = new Y.Doc();
  doc.getText(LEGACY_KEY).insert(0, source);
  const textState = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
  doc.destroy();
  return {
    source, settings, revision: 7, textRevision: 4, settingsRevision: 2, textState, lockFence: 3,
    operations: [{ clientId: 'client-alice', requestId: 'old-request-0001', hash: 'h', update: textState, revision: 7, textRevision: 4, at: 1 }],
    ...extra,
  };
}

test('a version 1 workspace is rebuilt under the script root and persisted once', t => {
  const fresh = new ProjectStore(ROOT, tempWorkspace(t)).snapshot();
  const workspace = tempWorkspace(t);
  const file = path.join(workspace, 'tappy.json');
  const source = fresh.source + '\n# saved edit';
  fs.writeFileSync(file, JSON.stringify(legacyState(source, fresh.settings)));

  const store = new ProjectStore(ROOT, workspace);
  const snap = store.snapshot();
  assert.equal(snap.source, source);
  assert.equal(snap.revision, 7);
  assert.equal(snap.textRevision, 4);
  assert.equal(snap.textStateVersion, TEXT_STATE_VERSION);
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(snap.textState, 'base64'));
  assert.equal(doc.getText(SCRIPT_TEXT_KEY).toString(), source);
  assert.equal(doc.share.has(LEGACY_KEY), false);

  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.textStateVersion, TEXT_STATE_VERSION);
  assert.equal(saved.textState, snap.textState);
  assert.deepEqual(saved.operations, []);
  assert.equal(saved.lockFence, 3);

  // A second load reads the migrated state as is: same Y history, no further rewrite.
  const again = new ProjectStore(ROOT, workspace).snapshot();
  assert.equal(again.textState, snap.textState);
});

test('a version 1 workspace whose Yjs text disagrees with its source is refused', t => {
  const fresh = new ProjectStore(ROOT, tempWorkspace(t)).snapshot();
  const workspace = tempWorkspace(t);
  const state = legacyState(fresh.source, fresh.settings);
  state.source = fresh.source + '\n# diverged';
  fs.writeFileSync(path.join(workspace, 'tappy.json'), JSON.stringify(state));
  assert.throws(() => new ProjectStore(ROOT, workspace), /does not match its legacy Yjs state/);
});

test('an update written by a pre-migration editor tab is rejected', async t => {
  const store = new ProjectStore(ROOT, tempWorkspace(t));
  const client = new Y.Doc();
  Y.applyUpdate(client, Buffer.from(store.snapshot().textState, 'base64'));
  const before = Y.encodeStateVector(client);
  client.getText(LEGACY_KEY).insert(0, 'stale');
  const update = Buffer.from(Y.encodeStateAsUpdate(client, before)).toString('base64');
  await assert.rejects(store.applyText(update, 'client-stale1', 'stale-request-01'), /Outdated editor/);
  assert.equal(store.snapshot().source, new ProjectStore(ROOT, tempWorkspace(t)).snapshot().source);
});
