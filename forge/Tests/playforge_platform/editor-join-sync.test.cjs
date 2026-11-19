'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('@playwright/test');
const { createServer } = require('../../server.cjs');
const { NativeRuntime } = require('../../Tools/native-runtime.cjs');

const root = path.resolve(__dirname, '../..');
const availability = NativeRuntime.availability(root);
const skipReason = !availability.available
  ? availability.error || 'Godot is not available'
  : !fs.existsSync(path.join(root, 'OfficialGodot', 'vendor', 'godot.editor.js'))
    ? 'The official Godot Web editor bundle is not installed' : false;

test('a late Godot editor join preserves a newer server scene from its first sync', { skip: skipReason, timeout: 240000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-editor-join-sync-'));
  const artifacts = path.join(root, 'Saved', 'Tests', 'editor-join-sync');
  const server = createServer({
    workspace: path.join(temporary, 'workspace'),
    platformWorkspace: path.join(temporary, 'platform'),
    buildDirectory: path.join(temporary, 'builds'),
  });
  const diagnostics = { errors: [], engineErrors: [], clientSceneWrites: [], failedRequests: [], projectFetch: null, remoteMutation: null };
  let browser;
  let page;
  let releaseWasm;
  let wasmSeenResolve;
  let projectFetchResolve;
  const wasmSeen = new Promise(resolve => { wasmSeenResolve = resolve; });
  const projectFetched = new Promise(resolve => { projectFetchResolve = resolve; });
  const wasmGate = new Promise(resolve => { releaseWasm = resolve; });
  let serverClosed = false;

  try {
    fs.mkdirSync(artifacts, { recursive: true });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const createResponse = await fetch(`${origin}/api/platform/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Late Editor Join Sync', template: 'blank3d', mode: 'ready' }),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    const projectId = created.project?.id;
    assert.ok(projectId, 'the ready project should be created before launching the guest editor');
    const oldScene = created.files.find(file => file.path === 'scenes/main.tscn')?.content;
    assert.ok(oldScene, 'the initial project snapshot should include its main scene');

    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.on('pageerror', error => diagnostics.errors.push(error.message));
    page.on('console', message => {
      if (/SCRIPT ERROR|Parse Error|Invalid access|Invalid call|Failed to load script|Failed to load project file/.test(message.text())) diagnostics.engineErrors.push(message.text());
    });
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.method() !== 'PUT' || url.pathname !== `/api/platform/projects/${projectId}`) return;
      try {
        const body = request.postDataJSON();
        const scene = body.files?.find(file => file.path === 'scenes/main.tscn')?.content;
        if (scene !== undefined) diagnostics.clientSceneWrites.push({ revision: body.baseRevision, scene });
      } catch {}
    });
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText;
      if (failure && failure !== 'net::ERR_ABORTED') diagnostics.failedRequests.push(`${failure} ${request.url()}`);
    });
    page.on('response', async response => {
      const url = new URL(response.url());
      if (url.pathname !== `/api/platform/projects/${projectId}` || response.request().method() !== 'GET') return;
      try {
        const body = await response.json();
        diagnostics.projectFetch = { status: response.status(), revision: body.revision };
        projectFetchResolve(body);
      } catch (error) { projectFetchResolve({ error: error.message }); }
    });
    await page.route(/\/OfficialGodot\/vendor\/.*\.wasm(?:\?.*)?$/, async route => {
      wasmSeenResolve();
      await wasmGate;
      await route.continue();
    });

    await page.goto(`${origin}/OfficialGodot/?project=${encodeURIComponent(projectId)}`, { waitUntil: 'domcontentloaded' });
    const initialSnapshot = await Promise.race([
      projectFetched,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Guest editor did not fetch its starting project snapshot')), 20000)),
    ]);
    assert.equal(initialSnapshot.revision, created.revision, 'the guest must capture the old snapshot before server changes');
    await Promise.race([
      wasmSeen,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Godot editor WebAssembly startup request was not intercepted')), 45000)),
    ]);

    const latestScene = '[gd_scene load_steps=1 format=3]\n\n[node name="Main" type="Node3D"]\n\n[node name="ServerLatest" type="Node3D" parent="."]\nposition = Vector3(1, 2, 3)\n';
    const nextFiles = created.files.map(file => ({ path: file.path, content: file.path === 'scenes/main.tscn' ? latestScene : file.content }));
    const updateResponse = await fetch(`${origin}/api/platform/projects/${projectId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRevision: created.revision, files: nextFiles, clientId: 'late-join-regression' }),
    });
    const updated = await updateResponse.json();
    assert.equal(updateResponse.status, 200, JSON.stringify(updated));
    assert.equal(updated.revision, created.revision + 1);
    diagnostics.remoteMutation = { revision: updated.revision, scene: latestScene };
    releaseWasm();

    const editor = page.locator('#editor');
    await page.waitForFunction(() => document.querySelector('#editor')?.dataset.ready === 'true', null, { timeout: 190000 });
    const godotEditor = page.frameLocator('#editor');
    const canvas = godotEditor.locator('#editor-canvas');
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    await godotEditor.locator('#actions [data-action="collaboration"]').click();
    await page.locator('#panel').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => /all files current/i.test(document.querySelector('#panelBody')?.innerText || ''), null, { timeout: 15000 });
    diagnostics.syncPanel = await page.locator('#panelBody').innerText();
    const syncedResponse = await fetch(`${origin}/api/platform/projects/${projectId}`);
    const synced = await syncedResponse.json();
    diagnostics.syncedRevision = synced.revision;
    assert.match(diagnostics.syncPanel, new RegExp(`revision\\s*${synced.revision}`, 'i'), 'the guest should display its settled server revision');
    const clientWritesWhenSynced = diagnostics.clientSceneWrites.length;
    await page.waitForTimeout(3500);

    const snapshotResponse = await fetch(`${origin}/api/platform/projects/${projectId}`);
    const latest = await snapshotResponse.json();
    const savedScene = latest.files.find(file => file.path === 'scenes/main.tscn')?.content;
    diagnostics.finalRevision = latest.revision;
    diagnostics.finalScene = savedScene;
    assert.equal(latest.revision, synced.revision, 'the guest must not keep writing client revisions after its initial sync settles');
    assert.equal(diagnostics.clientSceneWrites.length, clientWritesWhenSynced, 'the guest should stop submitting scenes once the first sync completes');
    assert.equal(savedScene, latestScene, 'the server-authored scene must survive guest startup byte-for-byte');
    assert.notEqual(savedScene, oldScene, 'the stale initial scene must not overwrite the newer server scene');
    assert.ok(diagnostics.clientSceneWrites.every(write => write.scene !== oldScene), 'the guest must never submit its stale scene over the server version');
    const canvasState = await canvas.evaluate(element => ({ width: element.width, height: element.height, readyState: document.readyState }));
    assert.ok(canvasState.width > 0 && canvasState.height > 0, `Godot canvas should be active: ${JSON.stringify(canvasState)}`);

    assert.deepEqual(diagnostics.errors, [], 'the editor page and frames should not report JavaScript exceptions');
    assert.deepEqual(diagnostics.engineErrors, [], 'Godot should not report script, parse, or invalid-call errors while loading the newer scene');
    assert.deepEqual(diagnostics.failedRequests, [], 'the guest editor should not leave failed browser requests');

    await page.screenshot({ path: path.join(artifacts, 'editor.png'), fullPage: false });
    diagnostics.passed = true;
    await context.close();
  } catch (error) {
    diagnostics.passed = false;
    diagnostics.error = error.stack || error.message;
    if (page) {
      try {
        diagnostics.ui = await page.evaluate(() => ({
          url: location.href,
          ready: document.querySelector('#editor')?.dataset.ready,
          editorStatus: document.querySelector('#editor')?.contentDocument?.getElementById('status')?.textContent,
          canvas: (() => { const canvas = document.querySelector('#editor')?.contentDocument?.getElementById('editor-canvas'); return canvas ? { width: canvas.width, height: canvas.height } : null; })(),
        }));
      } catch {}
      try { await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: false }); } catch {}
    }
    throw error;
  } finally {
    releaseWasm?.();
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify(diagnostics, null, 2) + '\n');
    await browser?.close();
    if (!serverClosed && server.listening) {
      await new Promise(resolve => { server.once('close', resolve); server.shutdown(); });
      serverClosed = true;
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
