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
const embedTemplate = process.env.PLAYFORGE_EMBED_TEMPLATE || 'playground3d';
if (!['playground3d', 'brawllabs'].includes(embedTemplate)) throw new Error(`Unsupported PLAYFORGE_EMBED_TEMPLATE: ${embedTemplate}`);
const skipReason = !availability.available
  ? availability.error || 'Godot is not available'
  : !fs.existsSync(path.join(root, 'OfficialGodot', 'vendor', 'godot.editor.js'))
    ? 'The official Godot Web editor bundle is not installed' : false;

test(`native Godot Game workspace overlays its central viewport (${embedTemplate})`, { skip: skipReason, timeout: 480000 }, async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-native-game-'));
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
  const artifacts = path.join(root, 'Saved', 'Tests', 'editor-game-embedding');
  const screenshotName = embedTemplate === 'brawllabs' ? 'native-brawllabs.png' : 'native-game.png';
  const screenshot = path.join(artifacts, screenshotName);
  const logPath = path.join(artifacts, embedTemplate === 'brawllabs' ? 'brawllabs-run.log' : 'run.log');
  const diagnostics = { origin, embedTemplate, pageErrors: [], engineErrors: [], failedRequests: [], exportRequests: [], exportResponses: [] };
  let browser;
  let page;
  let projectId = '';
  try {
    fs.mkdirSync(artifacts, { recursive: true });
    const createResponse = await fetch(`${origin}/api/platform/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Native Game Screen Test', template: embedTemplate, mode: 'ready' }),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    projectId = created.project?.id;
    assert.ok(projectId, 'the starter project should be created for the real editor');

    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    page = await context.newPage();
    page.on('pageerror', error => diagnostics.pageErrors.push(error.message));
    page.on('console', message => {
      if (/SCRIPT ERROR|Parse Error|Invalid access|Invalid call|Game workspace failed/.test(message.text())) diagnostics.engineErrors.push(message.text());
    });
    page.on('requestfailed', request => {
      const failure = request.failure()?.errorText;
      if (failure && failure !== 'net::ERR_ABORTED') diagnostics.failedRequests.push(`${failure} ${request.url()}`);
    });
    page.on('request', request => {
      if (request.method() === 'POST' && /\/api\/platform-builds\//.test(new URL(request.url()).pathname)) {
        diagnostics.exportRequests.push({ url: request.url(), body: request.postDataJSON() });
      }
    });
    page.on('response', async response => {
      if (!/\/api\/platform-builds\//.test(new URL(response.url()).pathname)) return;
      try { diagnostics.exportResponses.push({ status: response.status(), body: await response.json() }); } catch {}
    });

    await page.goto(`${origin}/OfficialGodot/embedding-poc.html?project=${encodeURIComponent(projectId)}`, { waitUntil: 'domcontentloaded' });
    const editor = page.locator('#poc-editor');
    await page.waitForFunction(() => document.querySelector('#poc-editor')?.dataset.ready === 'true', null, { timeout: 210000 });
    const editorSrc = await editor.getAttribute('src');
    assert.ok(editorSrc?.includes(`project=${projectId}`), `real editor iframe URL should identify the created project: ${editorSrc}`);
    const godotEditor = page.frameLocator('#poc-editor');
    const canvas = godotEditor.locator('#editor-canvas');
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const nativeGame = godotEditor.locator('#native-game-overlay');
    const gameFrame = godotEditor.locator('#native-game-frame');
    await gameFrame.evaluate(frame => {
      frame.dataset.loadCount = '0';
      frame.addEventListener('load', () => { frame.dataset.loadCount = String(Number(frame.dataset.loadCount || 0) + 1); });
    });

    // Ctrl+F4 is Godot's native Game workspace shortcut, targeting the real editor canvas.
    await canvas.focus();
    await canvas.press('Control+F4');
    await godotEditor.locator('#native-game-overlay[style*="display: block"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForFunction(() => {
      const editorDocument = document.querySelector('#poc-editor')?.contentDocument;
      const frame = editorDocument?.getElementById('native-game-frame');
      const editorStatus = editorDocument?.getElementById('status')?.textContent || '';
      return frame?.getAttribute('src') || editorStatus.startsWith('Game workspace failed:');
    }, null, { timeout: 250000 });
    const nativeBuildState = await godotEditor.locator('#status').textContent();
    if (!(await gameFrame.getAttribute('src'))) throw new Error(`Native Game workspace did not set the local export URL: ${nativeBuildState}`);
    const frameState = await gameFrame.evaluate(frame => ({ src: frame.getAttribute('src'), loadCount: Number(frame.dataset.loadCount) }));
    if (embedTemplate === 'brawllabs') {
      assert.equal(frameState.src, `/OfficialGodot/brawllabs-lobby.html?project=${projectId}`);
      await godotEditor.frameLocator('#native-game-frame').locator('#join-form').waitFor({ state: 'visible', timeout: 20000 });
      assert.equal(frameState.loadCount, 1, 'native Game screen should load one BrawlLabs lobby iframe');
      assert.equal(diagnostics.exportRequests.length, 0, 'BrawlLabs should reuse its lobby route without requesting a regular export');
      diagnostics.lobbyForm = await godotEditor.frameLocator('#native-game-frame').locator('#join-form').innerText();
    } else {
      await godotEditor.frameLocator('#native-game-frame').locator('canvas').first().waitFor({ state: 'visible', timeout: 120000 });
      await page.waitForFunction(() => {
        const doc = document.querySelector('#poc-editor')?.contentDocument?.getElementById('native-game-frame')?.contentDocument;
        const gameCanvas = doc?.querySelector('canvas');
        return doc?.readyState === 'complete' && !doc.getElementById('status') && gameCanvas && gameCanvas.width > 0 && gameCanvas.height > 0;
      }, null, { timeout: 120000 });
      await page.waitForTimeout(2000);
      assert.match(frameState.src, /\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/);
      assert.equal(frameState.loadCount, 1, 'native Game screen should load one actual exported game iframe');
      assert.ok(diagnostics.exportRequests.length >= 1, 'native Game screen should request a platform Web export');
      assert.ok(diagnostics.exportResponses.some(entry => entry.status === 202 && entry.body?.build?.target === 'web'), 'the game export should be enqueued by the build API');
    }

    const geometry = await canvas.evaluate(canvasElement => {
      const overlay = document.getElementById('native-game-overlay');
      const canvasRect = canvasElement.getBoundingClientRect();
      const overlayRect = overlay.getBoundingClientRect();
      return {
        reported: window.__playforgeNativeGameRect,
        canvas: { x: canvasRect.x, y: canvasRect.y, width: canvasRect.width, height: canvasRect.height },
        overlay: { x: overlayRect.x, y: overlayRect.y, width: overlayRect.width, height: overlayRect.height },
      };
    });
    diagnostics.geometry = geometry;
    assert.ok(geometry.reported, 'the plugin should report a normalized native workspace rectangle');
    assert.ok(geometry.overlay.x >= geometry.canvas.x + 50, `overlay should leave editor side docks visible: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.overlay.width > geometry.canvas.width * 0.3 && geometry.overlay.width < geometry.canvas.width * 0.85,
      `overlay should cover the central viewport, not the full editor: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.overlay.height > geometry.canvas.height * 0.4 && geometry.overlay.height < geometry.canvas.height,
      `overlay should fit inside the native Game workspace: ${JSON.stringify(geometry)}`);
    assert.ok(Math.abs(geometry.overlay.x - (geometry.canvas.x + geometry.reported.x * geometry.canvas.width)) < 3,
      'iframe overlay x-position should match the plugin-reported normalized workspace geometry');
    assert.ok(Math.abs(geometry.overlay.y - (geometry.canvas.y + geometry.reported.y * geometry.canvas.height)) < 3,
      'iframe overlay y-position should match the plugin-reported normalized workspace geometry');
    assert.ok(Math.abs(geometry.overlay.width - geometry.reported.width * geometry.canvas.width) < 3);
    assert.ok(Math.abs(geometry.overlay.height - geometry.reported.height * geometry.canvas.height) < 3);
    await page.screenshot({ path: screenshot, fullPage: false });

    const gameSrc = frameState.src;
    const editorCanvasBounds = await canvas.boundingBox();
    assert.ok(editorCanvasBounds);
    // The native Godot workspace selector is directly above the Game viewport, outside the iframe overlay.
    await canvas.click({ position: { x: editorCanvasBounds.width * 0.43, y: 24 } });
    await nativeGame.waitFor({ state: 'hidden', timeout: 15000 });
    assert.equal(await gameFrame.getAttribute('src'), gameSrc, 'leaving Game should hide the runtime without destroying it');
    assert.equal(Number(await gameFrame.getAttribute('data-load-count')), 1, 'the hidden runtime should remain loaded');
    const editorUrlAfterReturn = await editor.getAttribute('src');
    assert.equal(editorUrlAfterReturn, editorSrc, 'switching screens should preserve the same editor iframe');
    diagnostics.editorSrc = editorSrc;
    diagnostics.nativeGameSrc = gameSrc;
    diagnostics.nativeGameLoads = frameState.loadCount;
    diagnostics.screenshot = path.basename(screenshot);
    assert.ok(fs.statSync(screenshot).size > 20000, 'native Game screen screenshot should be captured');
    assert.deepEqual(diagnostics.pageErrors, [], 'the editor and game frames should not report JavaScript exceptions');
    assert.deepEqual(diagnostics.engineErrors, [], 'the editor and game should not report GDScript or invalid-call errors');
    assert.deepEqual(diagnostics.failedRequests, [], 'the editor and exported game should not have failed requests');
    diagnostics.passed = true;
    await context.close();
  } catch (error) {
    diagnostics.passed = false;
    diagnostics.error = error.stack || error.message;
    if (page) {
      try {
        diagnostics.ui = await page.evaluate(() => ({
          editorSrc: document.querySelector('#poc-editor')?.getAttribute('src'),
          editorReady: document.querySelector('#poc-editor')?.dataset.ready,
          pocStatus: document.querySelector('#poc-status')?.textContent,
          nativeOverlay: document.querySelector('#poc-editor')?.contentDocument?.getElementById('native-game-overlay')?.getAttribute('style'),
          gameSrc: document.querySelector('#poc-editor')?.contentDocument?.getElementById('native-game-frame')?.getAttribute('src'),
          editorStatus: document.querySelector('#poc-editor')?.contentDocument?.getElementById('status')?.textContent,
        }));
      } catch {}
      try { await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: false }); } catch {}
    }
    throw error;
  } finally {
    fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(logPath, JSON.stringify(diagnostics, null, 2) + '\n');
    await browser?.close();
    await new Promise(resolve => { if (!server.listening) return resolve(); server.once('close', resolve); server.shutdown(); });
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
