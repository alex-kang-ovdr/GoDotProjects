'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const artifactDirectory = path.join(root, 'Saved', 'Tests', 'platform');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise(resolve => {
    if (!server.listening) return resolve();
    server.once('close', resolve);
    server.shutdown ? server.shutdown() : server.close();
  });
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function jsonRequest(base, route, method = 'GET', body) {
  const response = await fetch(base + route, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { response, data };
}

async function startServer(options) {
  const server = createServer(options);
  const port = await listen(server);
  return { server, base: `http://127.0.0.1:${port}` };
}

async function pollBuild(base, buildId, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    const result = await jsonRequest(base, `/api/builds/${buildId}`);
    assert.equal(result.response.status, 200, `build status endpoint returned ${result.response.status}: ${JSON.stringify(result.data)}`);
    latest = result.data.build;
    assert.ok(latest, `missing build record: ${JSON.stringify(result.data)}`);
    if (latest.status === 'succeeded' || latest.status === 'failed') return latest;
    await wait(1000);
  }
  throw new Error(`Godot build ${buildId} did not finish within ${timeoutMs}ms; last state: ${JSON.stringify(latest)}`);
}

async function buildProject(base, project) {
  const queued = await jsonRequest(base, `/api/platform-builds/${project.project.id}`, 'POST', { revision: project.revision });
  assert.equal(queued.response.status, 202, `build enqueue failed: ${JSON.stringify(queued.data)}`);
  const build = await pollBuild(base, queued.data.build.id);
  assert.equal(build.status, 'succeeded', `Godot build failed: ${build.error || build.log || JSON.stringify(build)}`);
  assert.equal(build.projectId, project.project.id);
  assert.equal(build.revision, project.revision);
  return build;
}

test('platform project APIs build with Godot, publish matching releases, and serve the editor shell', { timeout: 600000 }, async t => {
  fs.mkdirSync(artifactDirectory, { recursive: true });
  const runDirectory = fs.mkdtempSync(path.join(artifactDirectory, 'run-'));
  t.after(() => fs.rmSync(runDirectory, { recursive: true, force: true }));
  const options = {
    platformWorkspace: path.join(runDirectory, 'platform'),
    buildDirectory: path.join(runDirectory, 'builds'),
  };
  let { server, base } = await startServer(options);
  let browser;
  const browserErrors = [];
  const browserConsole = [];
  const browserNotFound = [];
  const browserFailedRequests = [];
  const browserMessages = [];
  t.after(async () => {
    if (browser) await browser.close();
    await close(server);
  });

  const head = await fetch(`${base}/OfficialGodot/`, { method: 'HEAD' });
  assert.equal(head.status, 200, 'OfficialGodot shell must support HEAD');
  assert.equal(head.headers.get('content-type')?.split(';')[0], 'text/html');
  const shell = await fetch(`${base}/OfficialGodot/`);
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /PlayForge Creator/);

  const templates = await jsonRequest(base, '/api/platform/templates');
  assert.equal(templates.response.status, 200);
  assert.ok(templates.data.templates.some(template => template.id === 'blank3d'));
  assert.ok(templates.data.templates.some(template => template.id === 'playground3d'));

  const blankResult = await jsonRequest(base, '/api/platform/projects', 'POST', { name: 'Platform blank build', template: 'blank3d' });
  const playgroundResult = await jsonRequest(base, '/api/platform/projects', 'POST', { name: 'Platform playground build', template: 'playground3d' });
  assert.equal(blankResult.response.status, 201, JSON.stringify(blankResult.data));
  assert.equal(playgroundResult.response.status, 201, JSON.stringify(playgroundResult.data));
  const blank = blankResult.data;
  const playground = playgroundResult.data;
  assert.equal(blank.project.template, 'blank3d');
  assert.equal(playground.project.template, 'playground3d');
  assert.ok(blank.files.some(file => file.path === 'project.godot'));
  assert.ok(playground.files.some(file => file.path === 'scenes/main.tscn'));

  const blankBuild = await buildProject(base, blank);
  const preview = await fetch(base + blankBuild.previewUrl);
  assert.equal(preview.status, 200, `build preview failed for ${blankBuild.id}`);
  assert.match(preview.headers.get('content-type') || '', /text\/html/);
  assert.match(await preview.text(), /Godot|<html/i);

  const playgroundBuild = await buildProject(base, playground);
  assert.ok(playgroundBuild.previewUrl);
  assert.equal((await fetch(base + playgroundBuild.previewUrl)).status, 200);

  const releaseResult = await jsonRequest(base, `/api/platform/projects/${blank.project.id}/releases`, 'POST', {
    revision: blank.revision,
    buildId: blankBuild.id,
    label: 'Godot integration release',
  });
  assert.equal(releaseResult.response.status, 201, JSON.stringify(releaseResult.data));
  const release = releaseResult.data.release;
  assert.equal(release.revision, blank.revision);
  assert.equal(release.buildId, blankBuild.id);
  assert.equal(release.previewUrl, blankBuild.previewUrl);
  assert.equal(release.downloadUrl, blankBuild.downloadUrl);

  const crossProjectRelease = await jsonRequest(base, `/api/platform/projects/${playground.project.id}/releases`, 'POST', {
    revision: playground.revision,
    buildId: blankBuild.id,
    label: 'Must reject a build from another project',
  });
  assert.equal(crossProjectRelease.response.status, 409, JSON.stringify(crossProjectRelease.data));

  // Verify that both platform records and successful build metadata are read
  // back from disk after a full server restart, and the linked artifact still serves.
  await close(server);
  ({ server, base } = await startServer(options));
  const persistedProject = await jsonRequest(base, `/api/platform/projects/${blank.project.id}`);
  assert.equal(persistedProject.response.status, 200);
  assert.equal(persistedProject.data.activeReleaseId, release.id);
  const persistedReleases = await jsonRequest(base, `/api/platform/projects/${blank.project.id}/releases`);
  assert.equal(persistedReleases.response.status, 200);
  assert.equal(persistedReleases.data.releases.length, 1);
  assert.equal(persistedReleases.data.releases[0].buildId, blankBuild.id);
  assert.equal(persistedReleases.data.releases[0].previewUrl, blankBuild.previewUrl);
  assert.equal(persistedReleases.data.releases[0].downloadUrl, blankBuild.downloadUrl);
  const persistedBuild = await jsonRequest(base, `/api/builds/${blankBuild.id}`);
  assert.equal(persistedBuild.response.status, 200);
  assert.equal(persistedBuild.data.build.status, 'succeeded');
  assert.equal(persistedBuild.data.build.projectId, blank.project.id);
  assert.equal((await fetch(base + persistedReleases.data.releases[0].previewUrl)).status, 200);

  // Exercise the embedded editor through Chromium and wait until the add-on's
  // initial platform GET has been applied, not only until Godot has launched.
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });
  } catch (error) {
    assert.fail(`Could not launch Chromium channel=chrome headless: ${error.message}`);
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('console', message => {
    const record = { type: message.type(), text: message.text(), location: message.location() };
    if (['warning', 'error'].includes(record.type)) browserConsole.push(record);
    if (record.type === 'error') browserErrors.push(record);
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('response', response => { if (response.status() === 404) browserNotFound.push(response.url()); });
  page.on('requestfailed', request => browserFailedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.addInitScript(() => {
    window.__platformEditorMessages = [];
    window.addEventListener('message', event => {
      let message = event.data;
      if (typeof message === 'string') {
        try { message = JSON.parse(message); } catch { return; }
      }
      if (message?.source === 'playforge-godot-editor') window.__platformEditorMessages.push(message);
    });
  });
  await page.goto(`${base}/OfficialGodot/?project=${blank.project.id}`, { waitUntil: 'domcontentloaded' });
  const screenshotPath = path.join(artifactDirectory, 'officialgodot-platform.png');
  const bootState = await page.waitForFunction(() => {
    const messages = window.__platformEditorMessages || [];
    const ready = messages.find(message => message.type === 'pluginready');
    const failed = messages.find(message => message.type === 'loadingerror');
    return ready ? { outcome: 'ready', message: ready } : failed ? { outcome: 'failed', message: failed } : null;
  }, null, { timeout: 180000 }).catch(() => null);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const messages = bootState
    ? [await bootState.jsonValue()]
    : await page.evaluate(() => window.__platformEditorMessages || []);
  browserMessages.push(...messages);
  t.diagnostic(`Chromium editor events: ${JSON.stringify(browserMessages)}`);
  t.diagnostic(`Chromium console warnings/errors: ${JSON.stringify(browserConsole)}`);
  t.diagnostic(`Chromium 404 responses: ${JSON.stringify(browserNotFound)}`);
  t.diagnostic(`Chromium failed requests: ${JSON.stringify(browserFailedRequests)}`);
  t.diagnostic(`Editor screenshot: ${screenshotPath}`);
  if (bootState) {
    const state = messages[0];
    assert.equal(state.outcome, 'ready', `Godot editor failed to boot: ${JSON.stringify(state.message)}; console=${JSON.stringify(browserErrors)}`);
    assert.equal(state.message.projectId, blank.project.id);
    assert.ok(Number.isSafeInteger(state.message.revision) && state.message.revision >= blank.revision,
      `pluginready reported an invalid project revision: ${JSON.stringify(state.message)}`);
    const syncedProject = await jsonRequest(base, `/api/platform/projects/${blank.project.id}`);
    assert.equal(syncedProject.response.status, 200);
    assert.equal(state.message.revision, syncedProject.data.revision, 'pluginready revision should match the server after initial sync');
    assert.match(syncedProject.data.files.find(file => file.path === 'project.godot')?.content || '', /config\/name="Platform blank build"/,
      'the project configuration should remain available after its initial sync');
    assert.equal(await page.locator('#editor').count(), 1);
    const canvas = await page.frameLocator('#editor').locator('#editor-canvas').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { width: element.width, height: element.height, cssWidth: rect.width, cssHeight: rect.height, dpr: window.devicePixelRatio };
    });
    assert.ok(canvas.width > 0 && canvas.height > 0, `Godot canvas has no backing size: ${JSON.stringify(canvas)}`);
    assert.ok(canvas.width <= Math.ceil(canvas.cssWidth * canvas.dpr) + 2, `Godot canvas is oversized: ${JSON.stringify(canvas)}`);
    assert.ok(canvas.height <= Math.ceil(canvas.cssHeight * canvas.dpr) + 2, `Godot canvas is oversized: ${JSON.stringify(canvas)}`);
  } else {
    assert.fail(`Godot editor did not emit pluginready within 180s. Messages=${JSON.stringify(messages)}; console=${JSON.stringify(browserConsole)}`);
  }
});
