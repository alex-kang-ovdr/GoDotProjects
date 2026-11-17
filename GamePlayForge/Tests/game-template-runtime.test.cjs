'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const evidenceDirectory = path.join(root, 'Saved', 'Tests', 'game-templates');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const runtimeTemplates = process.env.PLAYFORGE_RUNTIME_TEMPLATE ? [process.env.PLAYFORGE_RUNTIME_TEMPLATE] : ['tappy-chicken', 'iron-wood', 'brawllabs'];
assert.ok(runtimeTemplates.every(id => ['tappy-chicken', 'iron-wood', 'brawllabs'].includes(id)), 'Unknown runtime template');

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

async function buildProject(base, project) {
  const queued = await jsonRequest(base, `/api/platform-builds/${project.project.id}`, 'POST', { revision: project.revision });
  assert.equal(queued.response.status, 202, `${project.project.template} build enqueue failed: ${JSON.stringify(queued.data)}`);
  const buildId = queued.data.build.id;
  const deadline = Date.now() + 360000;
  let build = queued.data.build;
  while (Date.now() < deadline) {
    const result = await jsonRequest(base, `/api/builds/${buildId}`);
    assert.equal(result.response.status, 200, `${project.project.template} build status failed: ${JSON.stringify(result.data)}`);
    build = result.data.build;
    if (build.status === 'succeeded' || build.status === 'failed') break;
    await wait(1000);
  }
  assert.equal(build.status, 'succeeded', `${project.project.template} Godot Web build failed: ${build.error || build.log || JSON.stringify(build)}`);
  assert.equal(build.projectId, project.project.id);
  assert.equal(build.revision, project.revision);
  return build;
}

test('Game templates export and start in headless Chrome without runtime errors', { timeout: 900000 }, async t => {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const runDirectory = fs.mkdtempSync(path.join(evidenceDirectory, 'run-'));
  const server = createServer({
    platformWorkspace: path.join(runDirectory, 'platform'),
    buildDirectory: path.join(runDirectory, 'builds'),
  });
  let browser;
  let passed = false;
  const closeServer = () => new Promise(resolve => {
    if (!server.listening) return resolve();
    server.once('close', resolve);
    server.shutdown();
  });
  t.after(async () => {
    await browser?.close();
    await closeServer();
    if (passed) fs.rmSync(runDirectory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });

  for (const templateId of runtimeTemplates) {
    const created = await jsonRequest(base, '/api/platform/projects', 'POST', {
      name: `Runtime QA ${templateId}`,
      template: templateId,
    });
    assert.equal(created.response.status, 201, `could not create ${templateId}: ${JSON.stringify(created.data)}`);
    const project = created.data;
    assert.equal(project.project.template, templateId);
    assert.ok(project.files.some(file => file.path === 'scenes/main.tscn' || file.path === 'Scenes/main.tscn'), `${templateId} has no main scene`);

    const build = await buildProject(base, project);
    fs.writeFileSync(path.join(evidenceDirectory, `${templateId}-build.json`), JSON.stringify(build, null, 2) + '\n');
    fs.writeFileSync(path.join(evidenceDirectory, `${templateId}-build.log`), build.log || 'Godot emitted no build output.\n');
    assert.ok(build.previewUrl, `${templateId} build has no web preview`);
    const preview = await fetch(base + build.previewUrl);
    assert.equal(preview.status, 200, `${templateId} preview returned ${preview.status}`);
    assert.match(preview.headers.get('content-type') || '', /text\/html/);

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    const runtimeErrors = [];
    const consoleLog = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      const line = `${message.type()}: ${message.text()}`;
      consoleLog.push(line);
      if (/SCRIPT ERROR:|ERROR:|Parse Error|Failed loading resource/i.test(message.text())) runtimeErrors.push(line);
    });
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText;
      if (failure && failure !== 'net::ERR_ABORTED') pageErrors.push(`requestfailed ${request.url()}: ${failure}`);
    });
    try {
      await page.goto(base + build.previewUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const canvas = page.locator('canvas').first();
      await canvas.waitFor({ state: 'visible', timeout: 90000 });
      await wait(2500);
      await canvas.click({ position: templateId === 'iron-wood' ? { x: 230, y: 125 } : { x: 240, y: 320 } });
      await canvas.focus();
      if (templateId === 'tappy-chicken') await page.keyboard.press('Space');
      else {
        await page.keyboard.down('KeyW');
        await wait(900);
        await page.keyboard.up('KeyW');
        await page.keyboard.press('KeyF');
      }
      await wait(2200);
      const screenshotPath = path.join(evidenceDirectory, `${templateId}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      assert.ok(fs.statSync(screenshotPath).size > 10000, `${templateId} runtime screenshot is unexpectedly small`);
      assert.deepEqual(pageErrors, [], `${templateId} browser page failed: ${pageErrors.join('\n')}`);
      assert.deepEqual(runtimeErrors, [], `${templateId} runtime reported errors: ${runtimeErrors.join('\n')}`);
      fs.writeFileSync(path.join(evidenceDirectory, `${templateId}-browser.log`), consoleLog.join('\n') + '\n');
      fs.writeFileSync(path.join(evidenceDirectory, `${templateId}-runtime.json`), JSON.stringify({
        passed: true,
        template: templateId,
        projectId: project.project.id,
        revision: project.revision,
        buildId: build.id,
        previewUrl: build.previewUrl,
        screenshot: path.basename(screenshotPath),
        consoleLines: consoleLog.length,
      }, null, 2) + '\n');
    } finally {
      await page.close();
    }
  }
  passed = true;
});
