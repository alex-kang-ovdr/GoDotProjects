'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const evidenceDirectory = path.join(root, 'Saved', 'Tests', 'cosmoteer-web');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  assert.equal(queued.response.status, 202, `cosmoteer build enqueue failed: ${JSON.stringify(queued.data)}`);
  const buildId = queued.data.build.id;
  const deadline = Date.now() + 360000;
  let build = queued.data.build;
  while (Date.now() < deadline) {
    const result = await jsonRequest(base, `/api/builds/${buildId}`);
    assert.equal(result.response.status, 200, `cosmoteer build status failed: ${JSON.stringify(result.data)}`);
    build = result.data.build;
    if (build.status === 'succeeded' || build.status === 'failed') break;
    await wait(1000);
  }
  assert.equal(build.status, 'succeeded', `cosmoteer Godot Web build failed: ${build.error || build.log || JSON.stringify(build)}`);
  return build;
}

test('Cosmoteer template exports to Godot Web (WASM) and runs interactively in headless Chrome', { timeout: 600000 }, async t => {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const runDirectory = fs.mkdtempSync(path.join(evidenceDirectory, 'run-'));
  const server = createServer({
    workspace: path.join(runDirectory, 'workspace'),
    platformWorkspace: path.join(runDirectory, 'platform'),
    buildDirectory: path.join(runDirectory, 'builds'),
  });
  const extractedAssetsDir = path.join(root, 'Templates', 'cosmoteer', 'extracted_assets');
  let webAtlasFetched = false;
  if (fs.existsSync(path.join(extractedAssetsDir, 'web_atlas.png'))) {
    const prevListeners = server.listeners('request').slice();
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      if (req.url && req.url.startsWith('/cosmoteer-assets/')) {
        const rel = path.basename(req.url.split('?')[0]);
        if (rel === 'web_atlas.json' || rel === 'web_atlas.png') {
          const fp = path.join(extractedAssetsDir, rel);
          if (fs.existsSync(fp)) {
            if (rel === 'web_atlas.png') webAtlasFetched = true;
            res.writeHead(200, {
              'Content-Type': rel.endsWith('.png') ? 'image/png' : 'application/json; charset=utf-8',
              'Cross-Origin-Resource-Policy': 'same-origin',
            });
            fs.createReadStream(fp).pipe(res);
            return;
          }
        }
      }
      for (const fn of prevListeners) fn.call(server, req, res);
    });
  }
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

  const created = await jsonRequest(base, '/api/platform/projects', 'POST', {
    name: 'Cosmoteer Web E2E',
    template: 'cosmoteer',
  });
  assert.equal(created.response.status, 201, `could not create cosmoteer project: ${JSON.stringify(created.data)}`);
  const project = created.data;
  assert.equal(project.project.template, 'cosmoteer');

  const build = await buildProject(base, project);
  fs.writeFileSync(path.join(evidenceDirectory, 'cosmoteer-build.log'), build.log || '');
  assert.ok(build.previewUrl, 'cosmoteer build has no web previewUrl');

  const page = await browser.newPage({ viewport: { width: 1240, height: 800 } });
  const pageErrors = [];
  const runtimeErrors = [];
  const consoleLog = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => {
    const line = `${message.type()}: ${message.text()}`;
    consoleLog.push(line);
    if (/PlayForgeAvatarCatalog:|PlayForgeAvatarRig:/.test(message.text())) return;
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
    await page.locator('#status').waitFor({ state: 'hidden', timeout: 90000 }).catch(() => {});
    await wait(2500);

    const shipyardPng = await canvas.screenshot({ path: path.join(evidenceDirectory, 'cosmoteer-shipyard.png') });
    assert.ok(shipyardPng.length > 15000, `shipyard screenshot unexpectedly small (${shipyardPng.length} bytes)`);

    // Click "전투 출격 →" button in top-right header (x ~93%, y ~14.5% in 1240x800).
    const bounds = await canvas.boundingBox();
    assert.ok(bounds && bounds.width > 100 && bounds.height > 100, 'canvas has valid bounding box');
    await canvas.click({ position: { x: bounds.width * 0.93, y: bounds.height * 0.145 } });
    await canvas.focus();
    await wait(1400);
    await page.keyboard.down('KeyW');
    await wait(900);
    await page.keyboard.up('KeyW');
    await wait(1200);

    const battlePng = await canvas.screenshot({ path: path.join(evidenceDirectory, 'cosmoteer-battle.png') });
    assert.ok(battlePng.length > 15000, `battle screenshot unexpectedly small (${battlePng.length} bytes)`);
    assert.ok(!shipyardPng.equals(battlePng), 'Launching battle and flying should visibly update the Web Godot canvas');

    assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(runtimeErrors, [], `Godot WASM runtime errors:\n${runtimeErrors.join('\n')}`);
    if (fs.existsSync(path.join(extractedAssetsDir, 'web_atlas.png'))) {
      assert.equal(webAtlasFetched, true, 'Web Godot runtime should fetch /cosmoteer-assets/web_atlas.png when present');
    }

    fs.writeFileSync(path.join(evidenceDirectory, 'cosmoteer-runtime.json'), JSON.stringify({
      passed: true,
      template: 'cosmoteer',
      projectId: project.project.id,
      buildId: build.id,
      previewUrl: build.previewUrl,
      shipyardBytes: shipyardPng.length,
      battleBytes: battlePng.length,
      consoleLines: consoleLog.length,
    }, null, 2) + '\n');
  } finally {
    fs.writeFileSync(path.join(evidenceDirectory, 'cosmoteer-browser.log'), consoleLog.join('\n') + '\n');
    await page.close();
  }
  passed = true;
});
