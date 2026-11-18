'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createApp, inventory, listen } = require('./server.cjs');

const root = path.resolve(__dirname, '../..');
const brick = 'brick-breaker';
const key = id => `playhub-local-sdk-v1:${id}`;

test('SDK connection requires the assigned iframe window, origin, version and nonce', () => {
  const launcherOrigin = 'http://127.0.0.1:22999';
  const gameOrigin = 'http://127.0.0.1:24000';
  const nonce = '12ab'.repeat(12);
  const responses = [];
  const contentWindow = { postMessage: (...args) => responses.push(args) };
  const frame = { src: `${gameOrigin}/index.html#nonce=${nonce}`, dataset: { gameId: brick, gameOrigin, nonce }, contentWindow };
  const indicator = { dataset: {} };
  const handlers = new Map();
  const window = {
    addEventListener: (type, fn) => handlers.set(type, fn),
    removeEventListener: type => handlers.delete(type)
  };
  const document = {
    getElementById: id => ({ 'game-frame': frame, 'runtime-status': indicator })[id],
    addEventListener() {}
  };
  let channelCount = 0;
  class MessageChannel {
    constructor() {
      channelCount++;
      this.port1 = { start() {} };
      this.port2 = {};
    }
  }
  vm.runInNewContext(readFileSync(path.join(__dirname, 'sdk-host.js'), 'utf8'), {
    window, document, location: { origin: launcherOrigin }, MessageChannel,
    URL, URLSearchParams, TextEncoder, performance, setTimeout: () => 0
  });
  const connect = handlers.get('message');
  const payload = { type: 'playhub:connect', version: 1, nonce };
  connect({ source: {}, origin: gameOrigin, data: payload });
  connect({ source: contentWindow, origin: launcherOrigin, data: payload });
  connect({ source: contentWindow, origin: 'null', data: payload });
  connect({ source: contentWindow, origin: gameOrigin, data: { ...payload, nonce: '34cd'.repeat(12) } });
  connect({ source: contentWindow, origin: gameOrigin, data: { ...payload, version: 2 } });
  assert.equal(channelCount, 0);
  assert.deepEqual(responses, []);

  connect({ source: contentWindow, origin: gameOrigin, data: payload });
  assert.equal(channelCount, 1);
  assert.equal(responses.length, 1);
  assert.equal(responses[0][0].type, 'playhub:init');
  assert.equal(responses[0][0].nonce, nonce);
  assert.equal(responses[0][1], gameOrigin);
  assert.equal(responses[0][2].length, 1);
  assert.equal(handlers.has('message'), false);
});

test('native SDK launch, storage validation, tab conflicts and resume in Chrome', { timeout: 120000 }, async t => {
  const { chromium, expect } = require(path.join(root, 'forge/node_modules/@playwright/test'));
  const app = createApp(root, { port: 0, env: {} });
  t.after(() => app.close());
  await listen(app.server, 0);
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  context.on('page', item => item.on('pageerror', error => pageErrors.push(error.message)));
  page.on('pageerror', error => pageErrors.push(error.message));

  async function open(player, id, state = 'ready') {
    const response = await player.goto(`${origin}/play/${id}?mode=local`);
    assert.equal(response.status(), 200, id);
    await expect(player.locator('#runtime-status')).toHaveAttribute('data-state', state);
    const frame = player.frameLocator('#game-frame');
    await expect(frame.locator('#primary')).toBeEnabled();
    return frame;
  }

  async function saveFromFrame(player, changes = {}) {
    return player.frameLocator('#game-frame').locator('#game-root').evaluate(async (_, { gameId, changes }) => {
      const value = {
        gameId, schemaVersion: 1, state: GameLogic.games[gameId].newState(),
        runId: 'a'.repeat(32), runStarted: true, runEnded: false, ...changes
      };
      try { return await GameSDK.save(value); }
      catch (error) { return { code: error.code }; }
    }, { gameId: brick, changes });
  }

  await t.test('all eight native games handshake and start', async () => {
    const games = inventory(root).rows.filter(row => row.integration === 'native-sdk');
    assert.equal(games.length, 8);
    for (const game of games) {
      const frame = await open(page, game.id);
      await frame.locator('#primary').click();
      await expect(frame.locator('#overlay')).toBeHidden();
    }
  });

  await t.test('back navigation persists a snapshot, and reopening reloads only the selected game', async () => {
    await page.goto(origin);
    await page.evaluate(keys => keys.forEach(storageKey => localStorage.removeItem(storageKey)), [key(brick), key('memory-pairs')]);
    const frame = await open(page, brick);
    await frame.locator('#primary').click();
    await page.locator('#game-list-link').click();
    await page.waitForURL(`${origin}/?mode=local`);
    const saved = await page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)), key(brick));
    assert.ok(saved.revision >= 1);
    assert.equal(saved.gameId, brick);
    assert.equal(saved.value.runStarted, true);

    const reopened = await open(page, brick);
    await expect(reopened.locator('#primary')).toHaveText('이어서 하기');
    const another = await open(page, 'memory-pairs');
    await expect(another.locator('#primary')).not.toHaveText('이어서 하기');
  });

  await t.test('malformed, foreign and oversized updates preserve the prior saved game', async () => {
    await open(page, brick);
    const read = () => page.evaluate(storageKey => localStorage.getItem(storageKey), key(brick));
    assert.ok((await saveFromFrame(page)).revision >= 1);
    const prior = await read();
    for (const values of [{ gameId: 'memory-pairs' }, { schemaVersion: 9 }, { state: {} }]) {
      assert.deepEqual(await saveFromFrame(page, values), { code: 'SAVE_INVALID' });
      assert.equal(await read(), prior);
    }
    assert.deepEqual(await saveFromFrame(page, { extra: '가'.repeat(23000) }), { code: 'SAVE_TOO_LARGE' });
    assert.equal(await read(), prior);
  });

  await t.test('two tabs preserve the first valid write and treat corrupt state as read-only', async () => {
    const second = await context.newPage();
    try {
      await open(page, brick);
      await open(second, brick);
      const [first, next] = await Promise.all([saveFromFrame(page), saveFromFrame(second)]);
      const winner = first.revision ? first : next;
      const stale = first.revision ? next : first;
      assert.ok(winner.revision > 0);
      assert.deepEqual(stale, { code: 'SAVE_CONFLICT' });
      await expect((first.revision ? second : page).locator('#runtime-status')).toHaveAttribute('data-state', 'read-only');
    } finally { await second.close(); }

    await page.goto(origin);
    const damaged = await page.evaluate(storageKey => {
      const record = JSON.parse(localStorage.getItem(storageKey));
      record.value.state = { status: 'playing', score: 0, elapsed: 0 };
      const raw = JSON.stringify(record);
      localStorage.setItem(storageKey, raw);
      return raw;
    }, key(brick));
    const stillPlayable = await open(page, brick, 'read-only');
    await stillPlayable.locator('#primary').click();
    await expect(stillPlayable.locator('#overlay')).toBeHidden();
    assert.deepEqual(await saveFromFrame(page), { code: 'SAVE_CORRUPT' });
    assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key(brick)), damaged);
  });

  assert.deepEqual(pageErrors, []);
});
