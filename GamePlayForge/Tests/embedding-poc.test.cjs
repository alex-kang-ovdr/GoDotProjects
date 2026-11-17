'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const root = path.resolve(__dirname, '..');
const availability = NativeRuntime.availability(root);
const editorScript = path.join(root, 'OfficialGodot', 'vendor', 'godot.editor.js');
const skipReason = !availability.available
  ? availability.error || 'Godot is not available'
  : !fs.existsSync(editorScript) ? 'The official Godot Web editor bundle is not installed' : false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('real Godot embedding PoC switches editor screens and embeds a reusable exported game', { skip: skipReason, timeout: 480000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-embedding-poc-'));
  const server = createServer({
    workspace: path.join(temporary, 'workspace'),
    platformWorkspace: path.join(temporary, 'platform'),
    buildDirectory: path.join(temporary, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const artifactDirectory = path.join(root, 'Saved', 'Tests', 'embedding-poc');
  const screenshotPath = path.join(artifactDirectory, 'game.png');
  const splitScreenshotPath = path.join(artifactDirectory, 'split.png');
  const logPath = path.join(artifactDirectory, 'run.log');
  let browser;
  let page;
  const pageErrors = [];
  const engineErrors = [];
  const failedRequests = [];
  const exportRequests = [];
  const exportResponses = [];
  let editorLoadCount = 0;
  let gameLoadCount = 0;
  const diagnostics = { origin, pageErrors, engineErrors, failedRequests, exportRequests, exportResponses };

  try {
    fs.mkdirSync(artifactDirectory, { recursive: true });
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (/SCRIPT ERROR|Parse Error|Invalid access|Invalid call/.test(message.text())) engineErrors.push(message.text());
    });
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText;
      if (failure && failure !== 'net::ERR_ABORTED') failedRequests.push(`${failure} ${request.url()}`);
    });
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/platform-builds\//.test(new URL(request.url()).pathname)) {
        exportRequests.push({ url: request.url(), body: request.postDataJSON() });
      }
    });
    page.on('response', async response => {
      if (!/\/api\/platform-builds\//.test(new URL(response.url()).pathname)) return;
      try { exportResponses.push({ status: response.status(), body: await response.json() }); } catch {}
    });

    await page.goto(`${origin}/OfficialGodot/embedding-poc.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#template').waitFor({ state: 'visible' });
    await page.locator('#template').selectOption('playground3d');
    const editor = page.locator('#poc-editor');
    await editor.evaluate(frame => {
      frame.dataset.loadCount = '0';
      frame.addEventListener('load', () => { frame.dataset.loadCount = String(Number(frame.dataset.loadCount || 0) + 1); });
    });
    await page.locator('#open').click();
    await page.waitForFunction(() => document.querySelector('#poc-editor')?.dataset.ready === 'true', null, { timeout: 210000 });
    const editorSrc = await editor.getAttribute('src');
    assert.ok(editorSrc?.includes('editor.html?project='), `expected the real editor iframe, got ${editorSrc}`);
    editorLoadCount = Number(await editor.getAttribute('data-load-count'));
    assert.equal(editorLoadCount, 1, 'the Godot editor should have loaded exactly once');
    const editorCanvas = page.frameLocator('#poc-editor').locator('#editor-canvas');
    await editorCanvas.waitFor({ state: 'visible', timeout: 15000 });

    const switchTab = async (selector, expectedStatus) => {
      await page.locator(selector).click();
      await page.waitForFunction(text => document.querySelector('#poc-status')?.textContent.includes(text), expectedStatus, { timeout: 20000 });
      assert.equal(await page.locator(selector).getAttribute('aria-selected'), 'true', `${selector} should be selected`);
      assert.equal(await editor.getAttribute('src'), editorSrc, 'switching editor screens must retain the same iframe URL');
      editorLoadCount = Number(await editor.getAttribute('data-load-count'));
      assert.equal(editorLoadCount, 1, 'switching editor screens must not reload Godot');
    };
    await switchTab('#tab-2d', '2D 편집 화면');
    await switchTab('#tab-3d', '3D 편집 화면');
    await switchTab('#tab-script', '스크립트 편집 화면');
    await switchTab('#tab-3d', '3D 편집 화면');

    const game = page.locator('#poc-game');
    await game.evaluate(frame => {
      frame.dataset.loadCount = '0';
      frame.addEventListener('load', () => { frame.dataset.loadCount = String(Number(frame.dataset.loadCount || 0) + 1); });
    });
    await page.locator('#tab-game').click();
    await page.waitForFunction(() => !!document.querySelector('#poc-game')?.getAttribute('src'), null, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#poc-status')?.textContent.includes('게임 화면'), null, { timeout: 300000 });
    assert.ok(exportRequests.length >= 1, 'the Game tab must request an actual platform export');
    assert.ok(exportResponses.some(entry => entry.status === 202 && entry.body?.build?.target === 'web'), 'the export API must enqueue a Web build');

    const gameFrame = page.frameLocator('#poc-game');
    const gameCanvas = gameFrame.locator('canvas').first();
    await gameCanvas.waitFor({ state: 'visible', timeout: 120000 });
    await page.waitForFunction(() => {
      const gameDocument = document.querySelector('#poc-game')?.contentDocument;
      const canvas = gameDocument?.querySelector('canvas');
      return gameDocument?.readyState === 'complete' && !gameDocument.getElementById('status') && canvas && canvas.width > 0 && canvas.height > 0;
    }, null, { timeout: 120000 });
    await page.waitForTimeout(2000);
    const gameSrc = await game.getAttribute('src');
    assert.match(gameSrc, /\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/);
    gameLoadCount = Number(await game.getAttribute('data-load-count'));
    assert.equal(gameLoadCount, 1, 'the exported game iframe should load once');
    diagnostics.gameBoot = await gameFrame.locator('body').evaluate(body => ({
      statusRemoved: !body.ownerDocument.getElementById('status'),
      canvasSize: [body.ownerDocument.querySelector('canvas')?.width, body.ownerDocument.querySelector('canvas')?.height],
    }));
    await page.screenshot({ path: screenshotPath, fullPage: false });

    await page.locator('#split').check();
    const editorPane = page.locator('#editor-pane');
    const gamePane = page.locator('#game-pane');
    assert.equal(await editorPane.isVisible(), true, 'editor pane should remain visible in split mode');
    assert.equal(await gamePane.isVisible(), true, 'game pane should be visible in split mode');
    const [editorBox, gameBox] = await Promise.all([editorPane.boundingBox(), gamePane.boundingBox()]);
    for (const [label, box] of [['editor', editorBox], ['game', gameBox]]) {
      assert.ok(box && box.width > 400 && box.height > 450, `${label} pane should have a usable size: ${JSON.stringify(box)}`);
    }
    await page.screenshot({ path: splitScreenshotPath, fullPage: false });

    await switchTab('#tab-2d', '2D 편집 화면');
    assert.equal(await game.getAttribute('src'), gameSrc, 'switching away from Game should keep its exported iframe mounted');
    gameLoadCount = Number(await game.getAttribute('data-load-count'));
    assert.equal(gameLoadCount, 1, 'switching editor screens should not reload the exported game');
    await page.locator('#tab-game').click();
    await page.waitForFunction(() => document.querySelector('#poc-status')?.textContent.includes('게임 화면'), null, { timeout: 20000 });
    assert.equal(await game.getAttribute('src'), gameSrc, 'unchanged project revisions should reuse the same export URL');
    gameLoadCount = Number(await game.getAttribute('data-load-count'));
    assert.equal(gameLoadCount, 1, 'returning to Game should reuse the existing runtime');

    await page.locator('#stop').click();
    await page.waitForFunction(() => document.querySelector('#poc-status')?.textContent.includes('게임을 닫았습니다'), null, { timeout: 20000 });
    assert.equal(await game.getAttribute('src'), null, 'closing the game should remove only the game iframe URL');
    assert.equal(await editor.getAttribute('src'), editorSrc, 'closing the game must preserve the editor iframe URL');
    assert.equal(editorLoadCount, 1, 'closing the game must not reload the editor');
    assert.ok(fs.statSync(screenshotPath).size > 10000, 'game screenshot should be captured');
    assert.ok(fs.statSync(splitScreenshotPath).size > 10000, 'split layout screenshot should be captured');
    assert.deepEqual(pageErrors, [], 'the PoC page and iframe should not report JavaScript exceptions');
    assert.deepEqual(engineErrors, [], 'the real editor should not report GDScript or invalid-call errors');
    assert.deepEqual(failedRequests, [], 'the real editor and exported game should not have failed requests');

    diagnostics.passed = true;
    diagnostics.editorSrc = editorSrc;
    diagnostics.editorLoadCount = editorLoadCount;
    diagnostics.gameSrc = gameSrc;
    diagnostics.gameLoadCount = gameLoadCount;
    diagnostics.screenshots = [path.basename(screenshotPath), path.basename(splitScreenshotPath)];
    await context.close();
  } catch (error) {
    diagnostics.passed = false;
    diagnostics.error = error.stack || error.message;
    try { editorLoadCount = Number(await page?.locator('#poc-editor').getAttribute('data-load-count')); } catch {}
    try { gameLoadCount = Number(await page?.locator('#poc-game').getAttribute('data-load-count')); } catch {}
    diagnostics.editorLoadCount = editorLoadCount;
    diagnostics.gameLoadCount = gameLoadCount;
    if (page) {
      try { diagnostics.ui = await page.evaluate(() => ({ status: document.querySelector('#poc-status')?.textContent, editorSrc: document.querySelector('#poc-editor')?.getAttribute('src'), editorReady: document.querySelector('#poc-editor')?.dataset.ready, gameSrc: document.querySelector('#poc-game')?.getAttribute('src') })); } catch {}
      try { diagnostics.gameBoot = await page.frameLocator('#poc-game').locator('body').evaluate(body => ({ status: body.ownerDocument.getElementById('status')?.textContent, canvasSize: [body.ownerDocument.querySelector('canvas')?.width, body.ownerDocument.querySelector('canvas')?.height] })); } catch {}
      try { await page.screenshot({ path: path.join(artifactDirectory, 'failure.png'), fullPage: false }); } catch {}
    }
    throw error;
  } finally {
    fs.mkdirSync(artifactDirectory, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(diagnostics, null, 2) + '\n');
    await browser?.close();
    await new Promise(resolve => { if (!server.listening) return resolve(); server.once('close', resolve); server.shutdown(); });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
