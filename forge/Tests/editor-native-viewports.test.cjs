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
const embedTemplate = 'brawllabs';
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
  const artifacts = path.join(root, 'Saved', 'Tests', 'editor-native-viewports');
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
    await page.addInitScript(() => { window.__nativeClickLabels = []; window.addEventListener('message', e => { if(e.origin === location.origin && e.data?.source === 'playforge-godot-editor' && e.data.type === 'activity' && e.data.clickLabel) window.__nativeClickLabels.push(e.data); }); });
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

    await page.goto(`${origin}/OfficialGodot/?project=${encodeURIComponent(projectId)}#editor`, { waitUntil: 'domcontentloaded' });
    const editor = page.locator('#editor');
    await page.waitForFunction(() => document.querySelector('#editor')?.dataset.ready === 'true', null, { timeout: 210000 });
    const editorSrc = await editor.getAttribute('src');
    assert.ok(editorSrc?.includes(`project=${projectId}`), `real editor iframe URL should identify the created project: ${editorSrc}`);
    const shellGeometry = await page.evaluate(() => {
      const frame = document.querySelector('#editor');
      const rect = frame?.getBoundingClientRect();
      return {
        frame: rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        headers: document.querySelectorAll('header').length,
        footers: document.querySelectorAll('footer').length,
        outerBars: document.querySelectorAll('header, footer, [role="toolbar"]').length,
      };
    });
    assert.equal(shellGeometry.headers, 0, 'the parent workspace should not add a second header');
    assert.equal(shellGeometry.footers, 0, 'the parent workspace should not add a footer bar');
    assert.equal(shellGeometry.outerBars, 0, 'the parent workspace should contain no duplicate toolbar or status bar');
    assert.deepEqual(shellGeometry.frame, { x: 0, y: 0, width: 1600, height: 1000 }, `editor should fill the viewport: ${JSON.stringify(shellGeometry)}`);
    const godotEditor = page.frameLocator('#editor');
    const canvas = godotEditor.locator('#editor-canvas');
    await canvas.waitFor({ state: 'visible', timeout: 15000 });
    const innerGeometry = await godotEditor.locator('body').evaluate(body => {
      const toolbar = body.querySelector('#toolbar');
      const canvasElement = body.querySelector('#editor-canvas');
      const rect = element => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      };
      return { toolbarCount: body.querySelectorAll('#toolbar').length, toolbar: rect(toolbar), canvas: rect(canvasElement), body: rect(body) };
    });
    assert.equal(innerGeometry.toolbarCount, 1, 'the Godot editor should have exactly one PlayForge toolbar');
    assert.equal(innerGeometry.toolbar.height, 40, `the editor toolbar should be 40px high: ${JSON.stringify(innerGeometry)}`);
    assert.equal(innerGeometry.canvas.height, 960, `the canvas should occupy the remaining 960px: ${JSON.stringify(innerGeometry)}`);
    assert.equal(innerGeometry.body.width, 1600);
    assert.equal(innerGeometry.body.height, 1000);
    await godotEditor.locator('#actions [data-action="versions"]').click();
    await page.locator('#panel').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal((await page.locator('#panelTitle').textContent())?.trim(), '버전과 배포 기록');
    await page.locator('#closePanel').click();
    await page.locator('#panel').waitFor({ state: 'hidden', timeout: 10000 });
    await godotEditor.locator('#actions [data-action="collaboration"]').click();
    await page.locator('#panel').waitFor({ state: 'visible', timeout: 10000 });
    assert.equal((await page.locator('#panelTitle').textContent())?.trim(), '협업 현황');
    await page.waitForFunction(() => /Live sync|All project/.test(document.querySelector('#panelBody')?.innerText || ''), null, { timeout: 15000 });
    const collaborationText = await page.locator('#panelBody').innerText();
    assert.match(collaborationText, /나/, 'collaboration should identify the current session');
    assert.match(collaborationText, /Live sync|All project/, 'collaboration should show the editor sync status');
    await page.locator('#closePanel').click();
    await page.locator('#panel').waitFor({ state: 'hidden', timeout: 10000 });
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
    await godotEditor.locator('#editor-multiplayer-workspace').waitFor({state:'attached',timeout:30000});
    const workspace=godotEditor.locator('#editor-multiplayer-workspace');
    await workspace.frameLocator('.client-frame[data-client-id="client-1"]').locator('#join-form').waitFor({state:'visible',timeout:20000});
    assert.equal(await gameFrame.getAttribute('src'),null,'editor controls must not be embedded inside the game iframe');
    assert.equal(await workspace.locator('#viewport-tabs').count(),0);
    assert.equal(await workspace.locator('.diagnostics').count(),0);
    assert.equal(await workspace.locator('#room-list').count(),0);
    await page.waitForTimeout(1200);
    const toolbar=await canvas.evaluate(()=>window.__playforgeSessionBarRect);
    assert.ok(toolbar,'native Godot viewport tab bar exists');
    diagnostics.toolbar=toolbar;
    const firstLobby=workspace.frameLocator('.client-frame[data-client-id="client-1"]');
    await firstLobby.locator('#join').click();
    await firstLobby.locator('#lobby').waitFor({state:'visible',timeout:150000});
    await canvas.click({position:{x:toolbar.menuX+12,y:toolbar.menuY+16}});
    await page.waitForTimeout(300);
    await page.screenshot({path:path.join(artifacts,'native-add-viewport-menu.png')});
    await canvas.press('ArrowDown');await canvas.press('Enter');
    await workspace.locator('.client-frame[data-client-id="client-2"]').waitFor({state:'attached',timeout:10000});
    diagnostics.nativeViewportAdd=true;
    await page.waitForTimeout(1000);
    await canvas.click({position:{x:toolbar.x+toolbar.width-60,y:toolbar.y+16}});
    assert.equal(await canvas.evaluate(()=>window.__playforgeRuntimeInspectorActive),true);
    diagnostics.nativeInspector=true;
    await page.waitForTimeout(500);
    const frameState={src:null,loadCount:0};

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
    await page.waitForFunction(() => window.__nativeClickLabels.some(e => /2D/.test(e.clickLabel)), null, {timeout:5000});
    diagnostics.nativeClick = await page.evaluate(() => window.__nativeClickLabels.find(e => /2D/.test(e.clickLabel)));
    assert.ok(diagnostics.nativeClick.y > 0.04 && diagnostics.nativeClick.y < 0.09, 'native click coordinates include the toolbar offset');
    assert.equal(await gameFrame.getAttribute('src'), gameSrc, 'leaving Game should hide the runtime without destroying it');
    assert.equal(Number(await gameFrame.getAttribute('data-load-count')), 0, 'the hidden runtime should remain loaded');
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
          editorSrc: document.querySelector('#editor')?.getAttribute('src'),
          editorReady: document.querySelector('#editor')?.dataset.ready,
          nativeOverlay: document.querySelector('#editor')?.contentDocument?.getElementById('native-game-overlay')?.getAttribute('style'),
          gameSrc: document.querySelector('#editor')?.contentDocument?.getElementById('native-game-frame')?.getAttribute('src'),
          editorStatus: document.querySelector('#editor')?.contentDocument?.getElementById('status')?.textContent,
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
