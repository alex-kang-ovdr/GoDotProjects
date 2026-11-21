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
const availableTemplates = ['tappy-chicken', 'tappy-chicken-mmo', 'captain-forever-mmo', 'survivor-io', 'iron-wood', 'voxel-frontier', 'brawllabs', 'fortress-war'];
const runtimeTemplates = process.env.PLAYFORGE_RUNTIME_TEMPLATE ? [process.env.PLAYFORGE_RUNTIME_TEMPLATE] : availableTemplates;
assert.ok(runtimeTemplates.every(id => availableTemplates.includes(id)), 'Unknown runtime template');

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

async function inspectFortressFrame(page, frame, region) {
  return page.evaluate(async ({ encoded, region }) => {
    const image = new Image();
    image.src = 'data:image/png;base64,' + encoded;
    await image.decode();
    const target = document.createElement('canvas');
    target.width = image.naturalWidth;
    target.height = image.naturalHeight;
    const ctx = target.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const sx = target.width / 1280, sy = target.height / 900;
    const [x, y, w, h] = { headline: [260, 139, 145, 42], terrain: [40, 320, 1200, 335], shot: [40, 140, 1200, 547] }[region];
    const width = Math.floor(w * sx), height = Math.floor(h * sy);
    const rgba = ctx.getImageData(Math.floor(x * sx), Math.floor(y * sy), width, height).data;

    if (region === 'headline') {
      // Godot's missing glyphs appear as aligned codepoint boxes. A Hangul
      // heading must have visible ink without several identical box borders.
      let ink = 0, boxRows = 0;
      for (let row = 0; row < height; row++) {
        let run = 0, boxEdges = 0;
        for (let col = 0; col <= width; col++) {
          const offset = (row * width + col) * 4;
          if (col < width && rgba[offset] > 175 && rgba[offset + 1] > 190 && rgba[offset + 2] > 205) {
            run++;
            ink++;
          } else {
            if (run >= 20 * sx) boxEdges++;
            run = 0;
          }
        }
        if (boxEdges >= 3) boxRows++;
      }
      return { ink, boxRows };
    }

    const matches = (r, g, b, dr, dg, db, tolerance) =>
      Math.abs(r - dr) <= tolerance && Math.abs(g - dg) <= tolerance && Math.abs(b - db) <= tolerance;
    let shell = 0, soil = 0, grass = 0;
    for (let offset = 0; offset < rgba.length; offset += 4) {
      const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
      if (region === 'shot') {
        if (matches(r, g, b, 255, 243, 176, 4)) shell++;
      } else {
        // Detect both shader colors in volumes larger than fine HUD or tank details.
        if (matches(r, g, b, 54, 70, 61, 10)) soil++;
        if (matches(r, g, b, 143, 196, 117, 10)) grass++;
      }
    }
    return region === 'shot' ? shell : { soil, grass };
  }, { encoded: frame.toString('base64'), region });
}

async function playFortressWar(page, canvas) {
  const capture = phase => canvas.screenshot({ path: path.join(evidenceDirectory, 'fortress-war-' + phase + '.png') });
  const lobby = await capture('lobby');
  const { ink, boxRows } = await inspectFortressFrame(page, lobby, 'headline');
  assert.ok(ink >= 250 && boxRows === 0,
    'The Korean setup heading should render text instead of codepoint boxes (ink=' + ink + ', box rows=' + boxRows + ').');

  await canvas.focus();
  await page.keyboard.press('Enter');
  await wait(500);
  const battle = await capture('battle');
  assert.ok(!lobby.equals(battle), 'Enter should open the battle from the lobby.');
  const { soil, grass } = await inspectFortressFrame(page, battle, 'terrain');
  assert.ok(soil >= 8000 && grass >= 300,
    'The destructible terrain should be visible over the backdrop (' + soil + ' soil, ' + grass + ' grass pixels).');

  // Keep the countdown and battlefield out of the detector for the charge meter.
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  const meter = {
    x: bounds.x + 800 * bounds.width / 1280,
    y: bounds.y + 786 * bounds.height / 900,
    width: 280 * bounds.width / 1280,
    height: 32 * bounds.height / 900,
  };
  const idleMeter = await page.screenshot({ clip: meter });
  await page.keyboard.down('Space');
  let chargedMeter, chargedFrame;
  try {
    await wait(900);
    chargedMeter = await page.screenshot({ clip: meter });
    chargedFrame = await capture('charge');
  } finally {
    await page.keyboard.up('Space');
  }
  assert.ok(!idleMeter.equals(chargedMeter), 'Holding Space should fill the charge meter.');

  // A projectile has a solid pale-yellow core. Check the game surface itself,
  // where that color is absent in the pre-launch frame.
  await wait(150);
  const fired = await capture('shot');
  const [before, after] = await Promise.all([
    inspectFortressFrame(page, chargedFrame, 'shot'),
    inspectFortressFrame(page, fired, 'shot'),
  ]);
  assert.ok(after >= before + 8, 'Releasing Space should visibly launch a shell into the battlefield (' + before + ' -> ' + after + ' shell pixels).');
}

test('Game templates export and start in headless Chrome without runtime errors', { timeout: 900000 }, async t => {
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const runDirectory = fs.mkdtempSync(path.join(evidenceDirectory, 'run-'));
  const server = createServer({
    workspace: path.join(runDirectory, 'workspace'),
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

    const page = await browser.newPage({ viewport: { width: 1280, height: templateId === 'fortress-war' ? 900 : 800 } });
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
      if (templateId === 'fortress-war') {
        await page.locator('#status').waitFor({ state: 'hidden', timeout: 90000 });
        await playFortressWar(page, canvas);
      } else if (templateId === 'tappy-chicken' || templateId === 'tappy-chicken-mmo') {
        // The 480 × 640 game is centered inside the browser canvas.
        const bounds = await canvas.boundingBox();
        const scale = Math.min(bounds.width / 480, bounds.height / 640);
        await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 + (467 - 320) * scale } });
        await page.keyboard.press('Space');
      } else {
        await canvas.click({ position: templateId === 'iron-wood' ? { x: 230, y: 125 } : { x: 240, y: 320 } });
        await canvas.focus();
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
      fs.writeFileSync(path.join(evidenceDirectory, templateId + '-browser.log'), consoleLog.join('\n') + '\n');
      await page.close();
    }
  }
  passed = true;
});
