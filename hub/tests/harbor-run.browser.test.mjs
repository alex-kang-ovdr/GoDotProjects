import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { gunzipSync } from 'node:zlib';
import { runInNewContext } from 'node:vm';
import { syncWebGames } from '../tools/sync-webgames.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const chrome = process.env.PLAYHUB_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const require = createRequire(import.meta.url);
const id = 'harbor-run';
const saveKey = 'harbor-run-save-v1';
const type = { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml' };
const frameSandbox = 'allow-scripts allow-pointer-lock';
const host = `<!doctype html><meta charset="utf-8"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}</style><script>
  let iframe, nonce, port;
  const result = window.harborHost = { ready: 0, saves: 0, origins: [], gameErrors: [], saved: null };
  function openGame() {
    port?.close();
    iframe?.remove();
    nonce = crypto.randomUUID().replaceAll('-', '');
    iframe = document.createElement('iframe');
    iframe.sandbox = '${frameSandbox}';
    iframe.src = '/games/harbor-run/index.html?lang=ko#nonce=' + nonce;
    document.body.append(iframe);
  }
  window.openGame = openGame;
  window.addEventListener('message', event => {
    if (event.source !== iframe?.contentWindow || event.origin !== 'null' || event.data?.type !== 'playhub:connect' || event.data.nonce !== nonce) return;
    const channel = new MessageChannel();
    port = channel.port1;
    result.origins.push(event.origin);
    port.onmessage = message => {
      const { type, id, payload } = message.data;
      let response = {};
      if (type === 'load') response = { value: result.saved };
      if (type === 'ready') result.ready++;
      if (type === 'save') { result.saved = payload.value; result.saves++; }
      if (type === 'event' && payload.name === 'runtime_error') result.gameErrors.push(payload.properties);
      port.postMessage({ id, ok: true, payload: response });
    };
    event.source.postMessage({ type: 'playhub:init', nonce }, '*', [channel.port2]);
  });
  window.addEventListener('DOMContentLoaded', openGame);
</script><body></body>`;

function staticPath(directory, pathname) {
  const filename = path.resolve(directory, '.' + pathname);
  if (!filename.startsWith(directory + path.sep) || !type[path.extname(filename)]) return null;
  return filename;
}

test('Harbor Run excludes the first playable render from the frame-stall guard', () => {
  const html = fs.readFileSync(path.join(root, 'games', id, 'Web/index.html'), 'utf8');
  const frameSource = html.match(/p\.frame = function\(now\) \{[\s\S]+?\n    \};/)[0];
  const p = {};
  let clock = 1000;
  runInNewContext(frameSource, {
    p,
    performance: { now: () => clock },
    HarborGameplayData: { clock: { maxUiFrameSeconds: 0.1, stallPauseSeconds: 0.25 } },
    HM: { damp: current => current, clamp: current => current },
    requestAnimationFrame: () => {}
  });
  const elapsed = [];
  const game = {
    lastFrame: null, running: true, acc: 0, uiTimer: 1, wanted: { level: 0 }, stats: { frames: 0 },
    audio: { update() {} }, activeCar() { return null; }, updateHUD() {}, toast() {},
    pause() { this.running = false; },
    advanceReal(seconds) { elapsed.push(seconds); },
    renderWorld() { if (!this.stats.frames) clock += 500; }
  };
  p.frame.call(game, 1000);
  assert.equal(game.lastFrame, 1500);
  p.frame.call(game, 1516);
  assert.equal(game.running, true);
  assert.deepEqual(elapsed, [0, 0.016]);
  p.frame.call(game, 1816);
  assert.equal(game.running, false);
  assert.deepEqual(elapsed, [0, 0.016]);
});

test('Harbor Run renders, locks the pointer, moves, and restores an unchanged game save contract in an opaque Hub frame',
  { skip: !fs.existsSync(chrome), timeout: 90000 }, async t => {
    const { chromium } = require(path.join(root, 'forge/node_modules/@playwright/test'));
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-run-browser-'));
    const source = path.join(root, 'games', id);
    const sourceFixture = path.join(fixture, 'source');
    const hubFixture = path.join(fixture, 'hub');
    const shared = path.join(hubFixture, 'shared');
    fs.mkdirSync(shared, { recursive: true });
    t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
    fs.cpSync(path.join(source, 'Web'), path.join(sourceFixture, id, 'Web'), { recursive: true });
    fs.copyFileSync(path.join(source, 'game.manifest.json'), path.join(sourceFixture, id, 'game.manifest.json'));
    fs.writeFileSync(path.join(sourceFixture, 'catalog.json'), JSON.stringify({
      schemaVersion: 1, entries: [{ id, path: id, enabled: true, priority: 0, kind: 'imported' }]
    }));
    for (const name of ['sdk.js', 'legacy.js']) fs.copyFileSync(path.join(root, 'hub/shared', name), path.join(shared, name));
    syncWebGames({ root: hubFixture, webgames: sourceFixture });

    const fileErrors = [];
    const server = createServer((request, response) => {
      const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
      if (pathname === '/') return response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(host);
      if (pathname === '/favicon.ico') return response.writeHead(204).end();
      const standalone = pathname.startsWith('/standalone/');
      const filename = standalone
        ? staticPath(path.join(sourceFixture, id, 'Web'), pathname.slice('/standalone'.length))
        : staticPath(hubFixture, pathname);
      if (!filename || !fs.existsSync(filename)) {
        fileErrors.push(pathname);
        return response.writeHead(404).end();
      }
      response.writeHead(200, { 'Content-Type': type[path.extname(filename)] + '; charset=utf-8' });
      response.end(fs.readFileSync(filename));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: chrome, headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    t.after(() => browser.close());
    const context = await browser.newContext({ viewport: { width: 960, height: 720 }, locale: 'ko-KR' });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(origin);
    await page.waitForFunction(() => window.harborHost.ready === 1);
    assert.equal(await page.locator('iframe').getAttribute('sandbox'), frameSandbox);
    const game = () => page.frames().find(frame => frame.url().startsWith(origin + '/games/harbor-run/'));
    const frame = game();
    assert.ok(frame);
    await frame.evaluate(() => {
      window.harborFocusTrace = [];
      // Use the shipped low preset so software-rendering load does not
      // deliberately trigger the game's independent frame-stall watchdog.
      const quality = document.getElementById('quality');
      quality.value = 'low';
      quality.dispatchEvent(new Event('change'));
      // Simulate a delayed title frame immediately before the original Start
      // listener runs. The next session must establish a fresh frame clock.
      document.getElementById('startMission').addEventListener('click', () => {
        HARBOR.lastFrame = performance.now() - 1000;
      }, { capture: true, once: true });
      for (const [target, event] of [[window, 'focus'], [window, 'blur'], [document, 'visibilitychange'], [document, 'pointerlockchange']]) {
        target.addEventListener(event, () => window.harborFocusTrace.push({ event, mode: HARBOR.mode,
          focus: document.hasFocus(), locked: document.pointerLockElement?.id, hidden: document.hidden }));
      }
      document.addEventListener('keydown', event => window.harborFocusTrace.push({ key: event.code, trusted: event.isTrusted }));
    });
    await frame.locator('#startMission').click();
    await frame.waitForFunction(() => document.pointerLockElement === document.getElementById('game'));
    const initial = await frame.evaluate(() => ({ yaw: HARBOR.cam.yaw, pos: HARBOR.player.pos.slice() }));
    // Chrome's headless CDP mouse moves supply absolute coordinates. Send a
    // relative movement vector through the real listener after verifying OS lock.
    const look = await frame.evaluate(() => {
      const move = new MouseEvent('mousemove');
      Object.defineProperties(move, { movementX: { value: 64 }, movementY: { value: -6 } });
      document.dispatchEvent(move);
      return { yaw: HARBOR.cam.yaw, running: HARBOR.running, mode: HARBOR.mode, touch: HARBOR.touch,
        focus: document.hasFocus(), locked: document.pointerLockElement?.id, wheel: HARBOR.wheel?.open, trace: window.harborFocusTrace };
    });
    const { yaw } = look;
    assert.ok(Math.abs(yaw - initial.yaw) > 0.015, JSON.stringify({ initial, look, errors }));
    try {
      await page.keyboard.down('w');
      await frame.waitForFunction(pos => Math.hypot(HARBOR.player.pos[0] - pos[0], HARBOR.player.pos[2] - pos[2]) > 0.8, initial.pos);
    } catch (error) {
      const details = await frame.evaluate(() => ({ mode: HARBOR.mode, pos: HARBOR.player.pos, fps: HARBOR.fps,
        keys: [...HARBOR.keys], trace: window.harborFocusTrace }));
      throw new Error('W movement did not reach the expected distance: ' + JSON.stringify(details), { cause: error });
    } finally { await page.keyboard.up('w'); }
    const render = await frame.evaluate(() => {
      const { gl } = HARBOR.render;
      HARBOR.renderWorld();
      const samples = new Set();
      const pixel = new Uint8Array(4);
      for (let row = 1; row <= 5; row++) for (let col = 1; col <= 7; col++) {
        gl.readPixels(Math.floor(gl.drawingBufferWidth * col / 8), Math.floor(gl.drawingBufferHeight * row / 6),
          1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.add(pixel.join(','));
      }
      return { webgl2: gl instanceof WebGL2RenderingContext, draws: HARBOR.render.drawCalls,
        width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, distinctPixels: samples.size, glError: gl.getError() };
    });
    assert.ok(render.webgl2 && render.width >= 640 && render.height >= 480 && render.draws > 0 && render.distinctPixels > 4, render);
    assert.equal(render.glError, 0);

    if (process.env.PLAYHUB_CAPTURE_HARBOR === '1') {
      const report = path.join(root, 'hub/reports/local-intro-captures/harbor-run.png');
      fs.mkdirSync(path.dirname(report), { recursive: true });
      await page.screenshot({ path: report });
    }
    if (await frame.evaluate(() => HARBOR.mode === 'play')) await page.keyboard.press('p');
    await frame.locator('#pauseScreen').waitFor();
    await frame.waitForFunction(() => !document.pointerLockElement);
    assert.equal(await frame.locator('#exportBtn').isVisible(), false);
    assert.equal(await frame.locator('#importBtn').isVisible(), true);
    await frame.locator('#saveBtn').click();
    await page.waitForFunction(() => window.harborHost.saves > 0);
    const saved = await page.evaluate(() => window.harborHost.saved);
    assert.equal(saved.gameId, id);
    assert.equal(saved.schemaVersion, 1);
    const entries = saved.legacyStorage || JSON.parse(gunzipSync(Buffer.from(saved.legacyStorageGzip, 'base64')).toString('utf8'));
    const savedGame = JSON.parse(new Map(entries).get(saveKey));
    const moved = Math.hypot(savedGame.player.pos[0] - initial.pos[0], savedGame.player.pos[2] - initial.pos[2]);
    assert.ok(moved > 0.8);
    await page.evaluate(() => window.openGame());
    await page.waitForFunction(() => window.harborHost.ready === 2);
    const next = game();
    assert.notEqual(next, frame);
    await next.locator('#continueGame').click();
    const restored = await next.evaluate(() => HARBOR.capture());
    assert.deepEqual(restored.player.pos, savedGame.player.pos);
    assert.equal(restored.cam.yaw, savedGame.cam.yaw);
    assert.equal(restored.runId, savedGame.runId);
    const protocol = await page.evaluate(() => ({ origins: window.harborHost.origins, gameErrors: window.harborHost.gameErrors }));
    assert.deepEqual(protocol.origins, ['null', 'null']);
    assert.deepEqual(protocol.gameErrors, []);

    await page.goto(origin + '/standalone/index.html?lang=ko');
    await page.locator('#startFree').click();
    if (await page.evaluate(() => HARBOR.mode === 'play')) await page.keyboard.press('p');
    await page.locator('#pauseScreen').waitFor();
    assert.equal(await page.locator('#exportBtn').isVisible(), true);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportBtn').click()]);
    assert.equal(download.suggestedFilename(), 'harbor-run-save.json');
    const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.phase, 'free');
    assert.equal(exported.gameplayV4.version, 4);
    assert.deepEqual(fileErrors, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ game: id, sandbox: frameSandbox, graphicsPreset: 'low', pointerLock: true, relativeMotionEvent: true, yawDelta: yaw - initial.yaw,
      moved, render, saveKey, restored: true, standaloneJsonExport: true }));
  });
