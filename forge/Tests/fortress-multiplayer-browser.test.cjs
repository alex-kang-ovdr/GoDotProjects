'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('@playwright/test');
const { createServer } = require('../server.cjs');

const evidence = path.resolve(__dirname, '../Saved/Tests/fortress-war/multiplayer');
const lobby = '/OfficialGodot/fortress-war-lobby.html';
const canvasOf = page => page.frameLocator('#game').locator('canvas').first();
const waitForState = (page, predicate, arg, timeout = 10000) => page.waitForFunction(predicate, arg, { timeout });
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function clickCanvas(page, x, y) {
  const bounds = await canvasOf(page).boundingBox();
  assert.ok(bounds, 'The built Godot canvas must be visible.');
  const scale = Math.min(bounds.width / 1280, bounds.height / 900);
  await page.mouse.click(bounds.x + (bounds.width - 1280 * scale) / 2 + x * scale,
    bounds.y + (bounds.height - 900 * scale) / 2 + y * scale);
}

async function join(page, url, name, host = false) {
  await page.goto(url);
  await page.locator('#name').fill(name);
  if (host) await page.locator('#teamSize').selectOption('1');
  await page.locator('#join').click();
  await page.locator('#lobby').waitFor({ state: 'visible', timeout: 150000 });
}

function record(page, name, logs, errors, buildRequests) {
  const actions = [];
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => {
    const entry = `${name} ${message.type()}: ${message.text()}`;
    logs.push(entry);
    if (/SCRIPT ERROR|Parse Error|Invalid (?:call|access)/.test(entry)) errors.push(entry);
  });
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/platform-builds/')) {
      buildRequests.push(request.url());
    }
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    const entry = `${name} HTTP ${response.status()}: ${response.url()}`;
    logs.push(entry);
    if (new URL(response.url()).pathname !== '/favicon.ico') errors.push(entry);
  });
  page.on('websocket', socket => {
    if (new URL(socket.url()).pathname !== '/fortress-war') return;
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return;
      const frame = JSON.parse(payload);
      if (frame.type === 'action') actions.push(frame);
    });
  });
  return actions;
}

async function readBoard(page) {
  return page.evaluate(() => {
    const { game, terrain } = window.PlayForgeFortress.state;
    return {
      activeId: game.activeId, turn: game.turnNumber, hp: game.tanks.map(tank => tank.hp),
      action: game.lastAction, terrain: {
        version: terrain.version, solidCount: terrain.runs.reduce((count, [, length]) => count + length, 0), runs: terrain.runs,
      },
    };
  });
}

test('two exported Fortress War clients share a pinned build, firing and resolving the same match', { timeout: 300000 }, async t => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-fortress-multiplayer-'));
  const server = createServer({
    workspace: path.join(temporary, 'workspace'), platformWorkspace: path.join(temporary, 'platform'),
    buildDirectory: path.join(temporary, 'builds'),
  });
  let browser;
  t.after(async () => {
    await browser?.close();
    await new Promise(resolve => { server.once('close', resolve); server.shutdown(); });
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const viewport = { width: 1280, height: 1024 };
  const blue = await browser.newPage({ viewport, permissions: ['clipboard-read', 'clipboard-write'] });
  const red = await browser.newPage({ viewport });
  const logs = [], errors = [], buildRequests = [];
  const blueActions = record(blue, 'Blue', logs, errors, buildRequests);
  const redActions = record(red, 'Red', logs, errors, buildRequests);
  fs.mkdirSync(evidence, { recursive: true });

  try {
    await join(blue, base + lobby, 'Blue Tester', true);
    await blue.locator('[data-team="0"]').click();
    await blue.locator('#ready').click();
    await waitForState(blue, () => window.PlayForgeFortress.state.players.some(player => player.team === 0 && player.ready));
    await blue.locator('#invite').click();
    const invitation = new URL(await blue.evaluate(() => navigator.clipboard.readText()));
    assert.equal(invitation.origin, base);
    assert.equal(invitation.pathname, lobby);
    assert.match(invitation.searchParams.get('room'), /^[\w-]+$/);
    const room = invitation.searchParams.get('room');
    const metadataResponse = await fetch(`${base}/api/fortress-war/rooms/${room}`);
    assert.equal(metadataResponse.status, 200);
    const { room: metadata } = await metadataResponse.json();
    assert.equal(metadata.buildId, invitation.searchParams.get('build'));
    assert.equal(metadata.projectId, invitation.searchParams.get('project'));

    await join(red, invitation.href, 'Red Tester');
    await red.locator('[data-team="1"]').click();
    await red.locator('#ready').click();
    for (const page of [blue, red]) {
      await waitForState(page, () => window.PlayForgeFortress.state?.phase === 'playing');
      await canvasOf(page).waitFor({ state: 'visible' });
      const pin = await page.evaluate(() => {
        const client = window.PlayForgeFortress;
        return [client.roomId, client.buildId, client.revision, document.querySelector('#game').getAttribute('src')];
      });
      assert.deepEqual(pin, [metadata.roomId, metadata.buildId, metadata.revision, `${metadata.previewUrl}?multiplayer=1`]);
    }
    assert.equal(buildRequests.length, 1, 'The guest should use the existing export.');
    const before = await readBoard(blue);
    assert.equal(before.activeId, 't0_0');
    assert.equal(before.turn, 1);
    assert.deepEqual(before.hp, [960, 880]);

    await canvasOf(red).focus();
    await red.keyboard.press('Space', { delay: 200 });
    await delay(150);
    assert.deepEqual(redActions, [], 'The inactive client should send no action on Space.');
    assert.equal(await red.evaluate(() => window.PlayForgeFortress.state.game.phase), 'aim');

    // Fixed one-on-one seed from the source parity test. Use real Godot sliders
    // to target the cannon before checking the separate keyboard charge path.
    await clickCanvas(blue, 955, 754);
    await clickCanvas(blue, 963, 715);
    await waitForState(blue, () => {
      const { aiming } = window.PlayForgeFortress.state.game;
      return aiming.power >= 42 && aiming.power <= 44 && Math.abs(aiming.localAngle - 42) <= 2;
    });
    await clickCanvas(blue, 1130, 812);
    for (const page of [blue, red]) {
      await waitForState(page, () => window.PlayForgeFortress.state?.game.turnNumber === 2 && window.PlayForgeFortress.state?.game.phase === 'aim');
    }
    assert.equal(blueActions.filter(action => action.action === 'fire').length, 1);
    const after = await readBoard(blue);
    assert.deepEqual(await readBoard(red), after);
    assert.equal(after.activeId, 't1_0');
    assert.equal(after.action.reason, 'hit');
    assert.ok(after.hp[1] < before.hp[1]);
    assert.ok(after.terrain.version > before.terrain.version);
    assert.notDeepEqual(after.terrain.runs, before.terrain.runs);
    assert.ok(after.action.terrainRemoved > 0);
    assert.equal(before.terrain.solidCount - after.terrain.solidCount, after.action.terrainRemoved);
    await blue.screenshot({ path: path.join(evidence, 'blue-after-hit.png') });
    await red.screenshot({ path: path.join(evidence, 'red-after-hit.png') });

    await canvasOf(red).focus();
    await red.keyboard.press('Space', { delay: 650 });
    await waitForState(blue, () => window.PlayForgeFortress.state.logs.some(entry => entry.event === 'shot' && entry.team === 1));
    const release = redActions.find(action => action.action === 'fire');
    assert.equal(release?.turnNumber, 2);
    assert.ok(release.power > 0 && release.power < 100, `Space release must transmit a charged power, received ${release?.power}.`);

    await red.close();
    await waitForState(blue, () => window.PlayForgeFortress.state.phase === 'finished');
    const end = await blue.evaluate(() => {
      const { game } = window.PlayForgeFortress.state;
      return { winner: game.winner, reason: game.endReason };
    });
    assert.deepEqual(end, { winner: 0, reason: 'forfeit' });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(evidence, 'result.json'), JSON.stringify({
      room, build: metadata.buildId, revision: metadata.revision, hitPoints: after.hp,
      terrainVersion: after.terrain.version, terrainRemoved: after.action.terrainRemoved,
      keyboardPower: release.power, result: end,
    }, null, 2));
  } finally {
    fs.writeFileSync(path.join(evidence, 'browser.log'), [...logs, ...errors].join('\n'));
    for (const [name, page] of [['blue', blue], ['red', red]]) {
      if (page.isClosed()) continue;
      const status = await page.locator('#status').textContent({ timeout: 2000 }).catch(() => '');
      t.diagnostic(`${name}: ${status}`);
      await page.screenshot({ path: path.join(evidence, `${name}.png`), timeout: 5000 }).catch(error => t.diagnostic(error.message));
    }
  }
});
