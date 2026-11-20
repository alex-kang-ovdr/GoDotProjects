'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

test('Tappy Chicken MMO workspace exports Godot Web, supports instant drop-in, spatial RPC multicast, and server observer', { timeout: 300000 }, async t => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tappy-mmo-browser-'));
  const server = createServer({
    workspace: path.join(temp, 'workspace'),
    platformWorkspace: path.join(temp, 'platform'),
    buildDirectory: path.join(temp, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });

  t.after(async () => {
    await browser.close();
    await new Promise(resolve => {
      if (!server.listening) return resolve();
      server.once('close', resolve);
      server.shutdown();
    });
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const evidence = path.join(root, 'Saved', 'Tests', 'tappy-chicken-mmo-browser');
  fs.mkdirSync(evidence, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const consoleLog = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    const line = `${m.type()}: ${m.text()}`;
    consoleLog.push(line);
    if (/SCRIPT ERROR:|Parse Error|Invalid call|Invalid access|Failed loading resource/i.test(m.text())) {
      errors.push(line);
    }
  });

  try {
    await page.goto(`${base}/OfficialGodot/multiplayer.html?template=tappy-chicken-mmo&name=Tappy%20Chicken%20MMO`);

    // Client 1 auto-drops into a fresh live MMO room without lobby wait.
    await page.waitForFunction(() => {
      const c = window.PlayForgeMultiplayer?.clients?.[0];
      return Boolean(c?.roomId && c?.state?.phase === 'playing' && c?.state?.onlineCount === 1);
    }, null, { timeout: 180000 });

    const client1Canvas = page.frameLocator('[data-client-id="client-1"].client-frame').frameLocator('#game').locator('canvas').first();
    await client1Canvas.waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(() => {
      const iframe = document.querySelector('[data-client-id="client-1"].client-frame');
      return Boolean(iframe?.contentWindow?.PlayForgeTappyMmo?.gameReady);
    }, null, { timeout: 60000 });

    // Click Client 1 canvas and press Space twice (menu -> ready -> playing + flap).
    const c1Box = await client1Canvas.boundingBox();
    assert.ok(c1Box);
    await client1Canvas.click({ position: { x: c1Box.width / 2, y: c1Box.height / 2 } });
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('Space');

    // Add Client 2 (instant drop-in / 난입 while Client 1 is already live).
    await page.locator('#add-client').click();
    await page.waitForFunction(() => {
      const list = window.PlayForgeMultiplayer?.clients || [];
      return list.length === 2 && list.every(c => c.roomId && c.state?.onlineCount === 2);
    }, null, { timeout: 120000 });

    const client2Canvas = page.frameLocator('[data-client-id="client-2"].client-frame').frameLocator('#game').locator('canvas').first();
    await client2Canvas.waitFor({ state: 'visible', timeout: 90000 });
    await page.waitForFunction(() => {
      const iframe = document.querySelector('[data-client-id="client-2"].client-frame');
      return Boolean(iframe?.contentWindow?.PlayForgeTappyMmo?.gameReady);
    }, null, { timeout: 60000 });

    // Flap Client 2 so Client 2 sends RPC -> Server -> Multicast to Client 1!
    const c2Box = await client2Canvas.boundingBox();
    assert.ok(c2Box);
    await client2Canvas.click({ position: { x: c2Box.width / 2, y: c2Box.height / 2 } });
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 200));
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 600));

    // Verify RPC delivery and spatial multicast metrics.
    const metrics = await page.evaluate(() => {
      const c1 = document.querySelector('[data-client-id="client-1"].client-frame')?.contentWindow?.PlayForgeTappyMmo;
      const c2 = document.querySelector('[data-client-id="client-2"].client-frame')?.contentWindow?.PlayForgeTappyMmo;
      return {
        snapshot: window.PlayForgeMultiplayer.snapshot,
        c1: c1 ? { roomId: c1.roomId, nearbyCount: c1.nearbyCount, onlineCount: c1.onlineCount, rpcsSent: c1.rpcsSent, rpcsReceived: c1.rpcsReceived } : null,
        c2: c2 ? { roomId: c2.roomId, nearbyCount: c2.nearbyCount, onlineCount: c2.onlineCount, rpcsSent: c2.rpcsSent, rpcsReceived: c2.rpcsReceived } : null,
      };
    });

    assert.ok(metrics.c1 && metrics.c2, 'Both drop-in clients must expose PlayForgeTappyMmo state');
    assert.equal(metrics.c1.roomId, metrics.c2.roomId, 'Both clients must share the same MMO room');
    assert.equal(metrics.snapshot.onlineCount, 2);
    assert.ok(metrics.snapshot.stats.eventsReceived >= 2, `Expected server RPC eventsReceived >= 2, got ${metrics.snapshot.stats.eventsReceived}`);
    assert.ok(metrics.snapshot.stats.multicastsSent >= 2, `Expected server multicastsSent >= 2, got ${metrics.snapshot.stats.multicastsSent}`);
    assert.ok(metrics.c1.rpcsReceived >= 1, `Expected Client 1 to receive multicast RPC from Client 2, got ${metrics.c1.rpcsReceived}`);
    assert.ok(metrics.c2.rpcsReceived >= 1, `Expected Client 2 to receive multicast RPC from Client 1, got ${metrics.c2.rpcsReceived}`);

    await page.screenshot({ path: path.join(evidence, 'client-2-dropin.png') });

    // Switch to Server tab and confirm Server Observer renders without joining as a player.
    await page.locator('#server-tab').click();
    await page.locator('#server-wait').waitFor({ state: 'hidden', timeout: 120000 });
    await page.frameLocator('#server-game').locator('canvas').waitFor({ state: 'visible' });
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(evidence, 'server-observer.png') });

    const finalOnline = await page.evaluate(() => window.PlayForgeMultiplayer.snapshot.onlineCount);
    assert.equal(finalOnline, 2, 'Server observer must not join as a third player');
    assert.deepEqual(errors, [], `Browser/Godot runtime errors: ${errors.join('\n')}`);

    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
      passed: true,
      roomId: metrics.c1.roomId,
      onlineCount: finalOnline,
      serverStats: metrics.snapshot.stats,
      client1: metrics.c1,
      client2: metrics.c2,
    }, null, 2) + '\n');
  } finally {
    try {
      const diag = await page.evaluate(() => {
        const frames = [...document.querySelectorAll('.client-frame')].map(f => ({
          id: f.dataset.clientId,
          src: f.src,
          status: f.contentDocument?.getElementById('status')?.textContent || null,
          loading: f.contentDocument?.getElementById('game-loading')?.textContent || null,
          mmo: f.contentWindow?.PlayForgeTappyMmo ? {
            roomId: f.contentWindow.PlayForgeTappyMmo.roomId,
            gameReady: f.contentWindow.PlayForgeTappyMmo.gameReady,
            onlineCount: f.contentWindow.PlayForgeTappyMmo.onlineCount,
          } : null,
        }));
        return { clients: window.PlayForgeMultiplayer?.clients || [], frames };
      });
      consoleLog.push('DIAG: ' + JSON.stringify(diag));
    } catch {}
    fs.writeFileSync(path.join(evidence, 'browser.log'), consoleLog.join('\n') + '\n');
    await page.close();
  }
});
