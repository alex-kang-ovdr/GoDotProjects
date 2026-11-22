'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { PlatformStore } = require('../../Tools/platform-store.cjs');
const { createPlatformApi } = require('../../Tools/platform-api.cjs');

async function setup(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-platform-'));
  const store = new PlatformStore(root);
  const api = createPlatformApi(store, {
    buildMode: options.buildMode,
    validateBuild: async (buildId, projectId, revision) => buildId === `build-${projectId}-${revision}`
      ? { buildId, previewUrl: `/api/builds/${buildId}`, downloadUrl: `/api/builds/${buildId}/files/game.zip` } : null,
  });
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/platform/')) { if (await api(req, res, req.url)) return; }
    res.writeHead(404).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { api.close(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const request = async (route, method = 'GET', body) => {
    const response = await fetch(base + route, { method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  return { store, request, base, root, api };
}

test('two clients merge independent file edits while same-file edits return latest revision', async t => {
  const { request } = await setup(t);
  const created = await request('/api/platform/projects', 'POST', { name: 'Pair test', template: 'blank3d' });
  assert.equal(created.status, 201);
  const id = created.body.project.id;
  const first = created.body;
  const aFiles = [...first.files, { path: 'scripts/a.gd', content: 'extends Node\n' }];
  const bFiles = [...first.files, { path: 'scripts/b.gd', content: 'extends Node3D\n' }];
  const a = await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: first.revision, files: aFiles, clientId: 'client_a' });
  assert.equal(a.status, 200);
  const b = await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: first.revision, files: bFiles, clientId: 'client_b' });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.revision, 3);
  assert.deepEqual(b.body.files.filter(file => file.path.startsWith('scripts/')).map(file => file.path).sort(), ['scripts/a.gd', 'scripts/b.gd']);

  const c = await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: b.body.revision, files: b.body.files.map(file => file.path === 'scripts/a.gd' ? { ...file, content: 'A newer edit' } : file), clientId: 'client_a' });
  assert.equal(c.status, 200);
  const staleFiles = b.body.files.map(file => file.path === 'scripts/a.gd' ? { ...file, content: 'B stale edit' } : file);
  const conflict = await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: b.body.revision, files: staleFiles, clientId: 'client_b' });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error, 'revision_conflict');
  assert.equal(conflict.body.revision, c.body.revision);
  assert.deepEqual(conflict.body.conflictingFiles, ['scripts/a.gd']);
});

test('history restore creates a new revision and releases remain immutable snapshots', async t => {
  const { request, root } = await setup(t);
  const created = await request('/api/platform/projects', 'POST', { name: 'Release test', template: 'playground3d' });
  const id = created.body.project.id;
  const base = created.body;
  const rev2 = await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: base.revision,
    files: base.files.map(file => file.path === 'scenes/main.tscn' ? { ...file, content: '[gd_scene format=3]\n[node name="A" type="Node3D"]\n' } : file) });
  const release = await request(`/api/platform/projects/${id}/releases`, 'POST', { revision: rev2.body.revision, label: 'First playtest', buildId: `build-${id}-${rev2.body.revision}` });
  assert.equal(release.status, 201, JSON.stringify(release.body));
  assert.equal(release.body.release.previewUrl, `/api/builds/build-${id}-2`);

  const rev3 = await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: rev2.body.revision,
    files: rev2.body.files.map(file => file.path === 'scenes/main.tscn' ? { ...file, content: '[gd_scene format=3]\n[node name="B" type="Node3D"]\n' } : file) });
  const history = await request(`/api/platform/projects/${id}/history`);
  assert.deepEqual(history.body.history.map(item => item.revision), [1, 2, 3]);
  const restored = await request(`/api/platform/projects/${id}/restore`, 'POST', { revision: 1, baseRevision: rev3.body.revision, clientId: 'client_a' });
  assert.equal(restored.body.revision, 4);
  assert.equal(restored.body.activeReleaseId, release.body.release.id);
  assert.match(restored.body.files.find(file => file.path === 'scenes/main.tscn').content, /name="Main"/);
  const after = await request(`/api/platform/projects/${id}`);
  assert.match(after.body.files.find(file => file.path === 'scenes/main.tscn').content, /name="Main"/);
  const releases = await request(`/api/platform/projects/${id}/releases`);
  assert.equal(releases.body.releases[0].revision, 2);
  assert.equal(releases.body.releases[0].id, release.body.release.id);
  assert.equal(releases.body.releases[0].buildId, `build-${id}-2`);
  assert.equal((await request(`/api/platform/projects/${id}/releases`, 'POST', { buildId: 'wrong' })).status, 409);
  const rolledBack = await request(`/api/platform/projects/${id}/releases/${release.body.release.id}/rollback`, 'POST', { baseRevision: 4 });
  assert.equal(rolledBack.body.revision, 5);
  assert.equal(rolledBack.body.activeReleaseId, release.body.release.id);
  assert.match(rolledBack.body.files.find(file => file.path === 'scenes/main.tscn').content, /name="A"/);
  const persisted = new PlatformStore(root);
  assert.equal(persisted.getProject(id).activeReleaseId, release.body.release.id);
});

test('project event stream emits snapshots and live file events', async t => {
  const { request, base } = await setup(t);
  const created = await request('/api/platform/projects', 'POST', { name: 'Events' });
  const id = created.body.project.id;
  const abort = new AbortController();
  t.after(() => abort.abort());
  const response = await fetch(`${base}/api/platform/projects/${id}/events`, { signal: abort.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const readUntil = async pattern => {
    while (!pattern.test(text)) {
      const next = await reader.read();
      if (next.done) break;
      text += decoder.decode(next.value, { stream: true });
    }
    assert.match(text, pattern);
  };
  await readUntil(/"type":"snapshot"/);
  await request(`/api/platform/projects/${id}`, 'PUT', { baseRevision: 1, files: [...created.body.files, { path: 'notes.txt', content: 'hello' }], clientId: 'client_a' });
  await readUntil(/"type":"project"/);
  assert.match(text, /"revision":2/);
  await reader.cancel();
});

test('SSE presence tracks anonymous project sessions and shutdown closes streams', async t => {
  const { request, base, api } = await setup(t);
  const created = await request('/api/platform/projects', 'POST', { name: 'Presence' });
  const id = created.body.project.id;
  const streams = [];
  const connect = async () => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/platform/projects/${id}/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const state = { buffer: '', offset: 0, decoder: new TextDecoder() };
    const nextEvent = async (name, predicate = () => true) => {
      for (;;) {
        const match = new RegExp(`event: ${name}\\ndata: (\\{[^\\n]*\\})\\n\\n`, 'g');
        match.lastIndex = state.offset;
        let event;
        while ((event = match.exec(state.buffer))) {
          state.offset = match.lastIndex;
          const data = JSON.parse(event[1]);
          if (predicate(data)) return data;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error(`SSE stream ended before ${name} event`);
        state.buffer += state.decoder.decode(chunk.value, { stream: true });
      }
    };
    const stream = { controller, reader, nextEvent };
    streams.push(stream);
    await stream.nextEvent('project');
    return stream;
  };

  const first = await connect();
  const one = await first.nextEvent('presence', event => event.count === 1);
  assert.equal(one.sessions.length, 1);
  assert.match(one.sessionId, /^[a-f0-9]{32}$/);
  assert.equal(one.sessions[0].sessionId, one.sessionId);

  const second = await connect();
  const two = await first.nextEvent('presence', event => event.count === 2);
  const twoSecond = await second.nextEvent('presence', event => event.count === 2);
  const sessionIds = two.sessions.map(session => session.sessionId).sort();
  assert.deepEqual(twoSecond.sessions.map(session => session.sessionId).sort(), sessionIds);
  assert.equal(new Set(sessionIds).size, 2);

  await second.reader.cancel();
  const backToOne = await first.nextEvent('presence', event => event.count === 1);
  assert.deepEqual(backToOne.sessions.map(session => session.sessionId), [one.sessionId]);

  const finalStream = await connect();
  await first.nextEvent('presence', event => event.count === 2);
  assert.ok(finalStream);
  api.close();
  const drained = Promise.all(streams.map(async stream => {
    for (;;) { const result = await stream.reader.read(); if (result.done) return; }
  }));
  let timeout;
  try {
    const result = await Promise.race([drained, new Promise(resolve => { timeout = setTimeout(() => resolve('timeout'), 1000); })]);
    assert.notEqual(result, 'timeout', 'handler.close must end every SSE response');
  } finally { clearTimeout(timeout); }
});

test('activity broadcasts to project peers only and never changes project history', async t => {
  const { request, base } = await setup(t);
  const projectA = await request('/api/platform/projects', 'POST', { name: 'Activity A' });
  const projectB = await request('/api/platform/projects', 'POST', { name: 'Activity B' });
  const open = async projectId => {
    const response = await fetch(`${base}/api/platform/projects/${projectId}/events`);
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const state = { buffer: '', offset: 0, decoder: new TextDecoder() };
    const nextEvent = async (name, predicate = () => true) => {
      for (;;) {
        const match = new RegExp(`event: ${name}\\ndata: (\\{[^\\n]*\\})\\n\\n`, 'g');
        match.lastIndex = state.offset;
        let found;
        while ((found = match.exec(state.buffer))) {
          state.offset = match.lastIndex;
          const data = JSON.parse(found[1]);
          if (predicate(data)) return data;
        }
        const chunk = await reader.read();
        if (chunk.done) throw new Error(`SSE stream ended before ${name} event`);
        state.buffer += state.decoder.decode(chunk.value, { stream: true });
      }
    };
    return { reader, nextEvent };
  };
  const a1 = await open(projectA.body.project.id);
  await a1.nextEvent('project');
  await a1.nextEvent('presence', event => event.count === 1);
  const a2 = await open(projectA.body.project.id);
  await a2.nextEvent('project');
  await a1.nextEvent('presence', event => event.count === 2);
  await a2.nextEvent('presence', event => event.count === 2);
  const b1 = await open(projectB.body.project.id);
  await b1.nextEvent('project');
  await b1.nextEvent('presence', event => event.count === 1);

  const projectId = projectA.body.project.id;
  const cursor = await request(`/api/platform/projects/${projectId}/activity`, 'POST', {
    clientId: 'guided_client_1', label: '<b>Alex</b> cursor', kind: 'cursor', x: 0.25, y: 0.75,
  });
  assert.equal(cursor.status, 202);
  const event1 = await a1.nextEvent('activity');
  const event2 = await a2.nextEvent('activity');
  assert.deepEqual(event1, event2);
  assert.equal(event1.clientId, 'guided_client_1');
  assert.equal(event1.label, 'Alex cursor');
  assert.equal(event1.x, 0.25);
  assert.equal(event1.y, 0.75);

  const click = await request(`/api/platform/projects/${projectId}/activity`, 'POST', {
    clientId: 'guided_client_1', label: 'Alex', kind: 'step', clickLabel: '<b>게임 실행</b>', x: 0.25, y: 0.75,
  });
  assert.equal(click.status, 202);
  const clickEvent1 = await a1.nextEvent('activity');
  const clickEvent2 = await a2.nextEvent('activity');
  assert.equal(clickEvent1.clickLabel, '게임 실행');
  assert.equal(clickEvent1.x, 0.25);
  assert.equal(clickEvent1.y, 0.75);
  assert.deepEqual(clickEvent1, clickEvent2);
  const invalidClick = await request(`/api/platform/projects/${projectId}/activity`, 'POST', {
    clientId: 'guided_client_1', label: 'Alex', kind: 'typing', clickLabel: 'should not pass', text: 'safe',
  });
  assert.equal(invalidClick.status, 400);

  const typing = await request(`/api/platform/projects/${projectId}/activity`, 'POST', {
    clientId: 'guided_client_1', label: 'Alex', kind: 'typing', text: '<script>move()</script>',
  });
  assert.equal(typing.status, 202);
  assert.equal((await a1.nextEvent('activity')).text, 'move()');
  const isolated = await Promise.race([b1.reader.read(), new Promise(resolve => setTimeout(() => resolve('quiet'), 80))]);
  assert.equal(isolated, 'quiet', 'activity must not cross project boundaries');
  const current = await request(`/api/platform/projects/${projectId}`);
  const history = await request(`/api/platform/projects/${projectId}/history`);
  assert.equal(current.body.revision, projectA.body.revision);
  assert.equal(history.body.history.length, 1);
  assert.equal(current.body.files.some(file => file.path.includes('activity')), false);
});

test('template details are immutable and include the guided rotating cube files', async t => {
  const { request } = await setup(t);
  const response = await request('/api/platform/templates/playground3d');
  assert.equal(response.status, 200);
  assert.equal(response.body.template.id, 'playground3d');
  const scene = response.body.files.find(file => file.path === 'scenes/main.tscn').content;
  const script = response.body.files.find(file => file.path === 'scripts/spin.gd').content;
  assert.match(scene, /name="Cube"/);
  assert.match(scene, /res:\/\/scripts\/spin\.gd/);
  assert.match(script, /rotate_y/);
  assert.equal((await request('/api/platform/templates/missing-template')).status, 404);
});

test('project session telemetry stores bounded editor logs, live state, and dispatches remote commands', async t => {
  const { request, base } = await setup(t);
  const created = await request('/api/platform/projects', 'POST', { name: 'RemoteSession' });
  const id = created.body.project.id;
  const response = await fetch(`${base}/api/platform/projects/${id}/events`);
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  t.after(() => reader.cancel());
  const decoder = new TextDecoder();
  let buffer = '';
  const readEvent = async pattern => {
    while (!pattern.test(buffer)) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
    }
    assert.match(buffer, pattern);
  };
  await readEvent(/event: project/);

  const remote = await request(`/api/platform/projects/${id}/remote`, 'POST', {
    command: 'showcase.play',
    arguments: { scenePath: 'res://scenes/custom.tscn' },
  });
  assert.equal(remote.status, 202);
  assert.equal(remote.body.command.command, 'showcase.play');
  assert.equal(remote.body.command.status, 'queued');
  await readEvent(/event: remote-command/);

  const telemetry = await request(`/api/platform/projects/${id}/session`, 'POST', {
    logs: [
      { source: 'editor', level: 'info', text: 'Scene loaded: res://scenes/custom.tscn' },
      { source: 'game', level: 'error', text: 'SCRIPT ERROR: Simulated runtime diagnostic' },
    ],
    editorState: { scene: 'res://scenes/custom.tscn', rootType: 'Node2D' },
    commandResult: { id: remote.body.command.id, ok: true, message: 'Showcase started' },
  });
  assert.equal(telemetry.status, 200);
  assert.equal(telemetry.body.logCount, 2);
  assert.deepEqual(telemetry.body.queuedCommands, []);

  const session = await request(`/api/platform/projects/${id}/session`);
  assert.equal(session.status, 200);
  assert.equal(session.body.logs.length, 2);
  assert.equal(session.body.logs[1].level, 'error');
  assert.equal(session.body.editorState.scene, 'res://scenes/custom.tscn');
  assert.equal(session.body.commands[0].status, 'completed');
});

test('Live build mode blocks Remote Control and session log endpoints while keeping normal project APIs active', async t => {
  const { request } = await setup(t, { buildMode: 'live' });
  const created = await request('/api/platform/projects', 'POST', { name: 'LiveBuildProject' });
  assert.equal(created.status, 201);
  const id = created.body.project.id;

  const remote = await request(`/api/platform/projects/${id}/remote`, 'POST', { command: 'showcase.play' });
  assert.equal(remote.status, 403);
  assert.match(remote.body.error, /disabled in Live builds/);

  const sessionGet = await request(`/api/platform/projects/${id}/session`);
  assert.equal(sessionGet.status, 403);

  const logsGet = await request(`/api/platform/projects/${id}/logs`);
  assert.equal(logsGet.status, 403);

  const sessionPost = await request(`/api/platform/projects/${id}/session`, 'POST', { logs: [{ text: 'blocked' }] });
  assert.equal(sessionPost.status, 403);
});

test('renameProject commits a new revision so subsequent updateFiles saves cleanly without 409 conflict', async t => {
  const { request } = await setup(t);
  const created = await request('/api/platform/projects', 'POST', { name: 'Before Rename', template: 'blank3d' });
  assert.equal(created.status, 201);
  const id = created.body.project.id;
  assert.equal(created.body.revision, 1);

  const renamed = await request(`/api/platform/projects/${id}`, 'PATCH', { name: 'After Rename', clientId: 'client_rename' });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.equal(renamed.body.project.name, 'After Rename');
  assert.equal(renamed.body.revision, 2);
  const projectGodotAfterRename = renamed.body.files.find(f => f.path === 'project.godot');
  assert.match(projectGodotAfterRename.content, /config\/name="After Rename"/);

  const history = await request(`/api/platform/projects/${id}/history`);
  assert.equal(history.status, 200);
  assert.deepEqual(history.body.history.map(item => item.revision), [1, 2]);
  assert.equal(history.body.history[1].message, 'Project renamed');

  const updatedFiles = [
    ...renamed.body.files.map(f => f.path === 'project.godot'
      ? { ...f, content: f.content + '\n; edited after rename\n' }
      : f),
    { path: 'scripts/after_rename.gd', content: 'extends Node\n' },
  ];
  const saved = await request(`/api/platform/projects/${id}`, 'PUT', {
    baseRevision: renamed.body.revision,
    files: updatedFiles,
    clientId: 'client_after_rename',
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.revision, 3);
  assert.equal(saved.body.files.find(f => f.path === 'scripts/after_rename.gd')?.content, 'extends Node\n');
  assert.match(saved.body.files.find(f => f.path === 'project.godot')?.content || '', /edited after rename/);
});
