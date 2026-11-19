'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const evidence = path.join(root, 'Saved', 'Tests', 'agent-chat-web');
const prompt = 'Describe this image in one sentence.';
const reply = 'A small red image from the PlayForge browser probe.';
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==';
const liveSignIn = process.env.PLAYFORGE_LIVE_AUTH_START === '1';

test(liveSignIn ? 'mounted Godot Web editor navigates to the live ChatGPT login endpoint' :
  'mounted Godot Web editor opens browser sign-in, submits an attached image and restores chat', {
  skip: process.env.PLAYFORGE_REAL_CHAT !== '1' && 'Set PLAYFORGE_REAL_CHAT=1 to run the actual WASM editor',
  timeout: 180000,
}, async t => {
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(temporaryRoot, 'playforge-chat-web-'));
  const { createServer } = require('../../server.cjs');
  const server = createServer({
    publicOrigin: '',
    workspace: path.join(directory, 'workspace'),
    platformWorkspace: path.join(directory, 'platform'),
    buildDirectory: path.join(directory, 'builds'),
    agentChatEnv: liveSignIn ? { ...process.env, LOCALAPPDATA: path.join(directory, 'auth-profile') } : undefined,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const log = [];
  let browser;
  t.after(async () => {
    try {
      await browser?.close();
      await new Promise(resolve => {
        server.once('close', resolve);
        server.shutdown();
      });
    } finally {
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(path.join(evidence, liveSignIn ? 'live-signin.log' : 'browser.log'), log.join('\n'));
      assert.equal(path.dirname(fs.realpathSync(directory)), temporaryRoot);
      assert.ok(path.basename(directory).startsWith('playforge-chat-web-'));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  const base = 'http://127.0.0.1:' + server.address().port;
  const created = await fetch(base + '/api/platform/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'PlayForge chat browser probe', template: 'blank3d' }),
  });
  assert.equal(created.status, 201);
  const { project } = await created.json();

  const { chromium } = require('@playwright/test');
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on('console', message => log.push(message.type() + ': ' + message.text()));
  page.on('pageerror', error => log.push('pageerror: ' + error.message));
  // Exercise the GDScript fallback used when the web dock host is unavailable.
  await page.route('**/OfficialGodot/editor-bridge.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()) + '\nwindow.__playforgeAgentDockChanged = null;' });
  });

  const probe = fs.readFileSync(path.join(__dirname, 'fixtures', 'agent-chat-web-probe.gd.inc'), 'utf8');
  await page.route('**/api/platform-addon/agent-chat', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const script = body.files['plugin.gd'];
    const start = '\t_refresh_context.call_deferred()';
    assert.ok(script.includes(start));
    body.files['plugin.gd'] = script.replace(start, start + '\n\t_web_chat_probe_start.call_deferred()') + '\n' + probe;
    await route.fulfill({ response, json: body });
  });
  let auth = 'disconnected';
  let loginAttempts = 0;
  const loginUrl = 'https://auth.openai.com/forge-web-login-fixture/';
  const loginError = 'Codex could not start the fixture login.';
  const providerRows = () => [{
    id: 'chatgpt-connect', auth, configured: auth === 'connected',
    model: 'mock-chat', models: ['mock-chat'], streaming: false,
  }];
  const requests = [];
  if (!liveSignIn) {
    await page.route('**/api/agent-chat/providers', route => route.fulfill({ json: { providers: providerRows() } }));
    await page.route('**/api/agent-chat/providers/connect', route => {
      assert.equal(route.request().postDataJSON().provider, 'chatgpt-connect');
      loginAttempts += 1;
      if (loginAttempts === 1) return route.fulfill({ status: 502, json: { error: loginError } });
      auth = 'pending';
      return route.fulfill({ json: { providers: providerRows(), connect_url: loginUrl } });
    });
    await page.context().route(loginUrl, route => {
      auth = 'connected';
      return route.fulfill({ body: 'Mock sign-in complete' });
    });
    await page.route('**/api/agent-chat', async route => {
      const request = route.request();
      requests.push({ method: request.method(), body: request.postDataJSON() });
      await route.fulfill({ json: { message: { role: 'assistant', content: reply } } });
    });
  }

  async function mountedEditor() {
    const iframe = await page.waitForSelector('#editor[src^="editor.html"]');
    const editor = await iframe.contentFrame();
    assert.ok(editor);
    return editor;
  }
  await page.goto(base + '/OfficialGodot/?project=' + project.id);
  let editor = await mountedEditor();
  await editor.waitForFunction(() => window.__playforgeChatProbe?.settings.x > 0,
    undefined, { timeout: 90000 });
  async function clickControl(name) {
    const canvas = editor.locator('#editor-canvas');
    const box = await canvas.boundingBox();
    const position = await editor.evaluate(name => window.__playforgeChatProbe[name], name);
    assert.ok(box && position.x > 0 && position.x < 1 && position.y > 0 && position.y < 1, JSON.stringify(position));
    await canvas.click({ position: { x: box.width * position.x, y: box.height * position.y } });
  }

  await clickControl('settings');
  await editor.waitForFunction(() => window.__playforgeChatProbe?.login.x > 0 && !window.__playforgeChatProbe.loginDisabled);
  if (!liveSignIn) {
    const failurePage = page.context().waitForEvent('page', { timeout: 15000 });
    await clickControl('login');
    const failedPopup = await failurePage;
    await failedPopup.waitForFunction(error => document.getElementById('status')?.textContent.includes(error),
      loginError, { timeout: 15000 });
    await failedPopup.close();
    await editor.waitForFunction(() => window.__playforgeChatProbe?.login.x > 0 && !window.__playforgeChatProbe.loginDisabled);
    log.push('A failed sign-in request appeared in the popup, and the editor allowed a retry.');
  }
  const liveEndpoint = liveSignIn && page.context().waitForEvent('response', {
    timeout: 30000,
    predicate: response => {
      const url = new URL(response.url());
      return response.request().isNavigationRequest() &&
        ['auth.openai.com', 'chatgpt.com'].includes(url.hostname);
    },
  });
  const loginPage = page.context().waitForEvent('page', { timeout: 15000 });
  await clickControl('login');
  const popup = await loginPage.catch(async error => {
    const probe = await editor.evaluate(() => window.__playforgeChatProbe);
    log.push(`Sign-in diagnostic: auth=${auth} starts=${loginAttempts} probe=${JSON.stringify(probe)}`);
    throw error;
  });
  if (liveSignIn) {
    try {
      const result = await liveEndpoint;
      const endpoint = new URL(result.url());
      log.push(`Live sign-in navigation reached ${endpoint.origin}${endpoint.pathname} (HTTP ${result.status()}).`);
      assert.ok(result.ok() || (result.status() >= 300 && result.status() < 400),
        `External sign-in endpoint returned HTTP ${result.status()}`);
    } finally {
      await popup.close();
      const cancel = await fetch(base + '/api/agent-chat/providers/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'chatgpt-connect' }),
      });
      assert.equal(cancel.status, 200);
    }
    return;
  }
  await popup.waitForURL(loginUrl, { timeout: 15000 }).catch(error => {
    log.push(`Sign-in diagnostic: popup=${popup.url()} auth=${auth} starts=${loginAttempts}`);
    throw error;
  });
  assert.equal(await popup.evaluate(() => window.opener === null), true);
  await popup.close();
  await editor.waitForFunction(() => window.__playforgeChatProbe?.configured);
  await clickControl('settings');
  log.push('The production settings opened the external login URL and reported the mock connection.');

  const fileChooser = page.waitForEvent('filechooser', { timeout: 15000 });
  await clickControl('attach');
  await (await fileChooser).setFiles([{ name: 'sample.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') }]);
  await editor.waitForFunction(() => window.__playforgeChatProbe?.attachments === 1);
  assert.equal(requests.length, 0, 'Selecting a file must not submit the chat.');
  await clickControl('input');
  await page.keyboard.type(prompt);
  await clickControl('send');
  await editor.waitForFunction(reply => window.__playforgeChatProbe?.transcript.includes(reply), reply, { timeout: 20000 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].body.provider, 'chatgpt-connect');
  assert.equal(requests[0].body.messages.at(-1).content, prompt);
  assert.deepEqual(requests[0].body.images, [{ mime: 'image/png', data: image }]);
  await editor.waitForFunction(() => window.__playforgeChatProbe?.attachments === 0);
  log.push('The production dock sent one explicitly attached PNG and rendered the mock reply.');

  await editor.waitForFunction(async ({ prompt, reply, image }) => {
    const mount = '/home/web_user';
    if (!(await indexedDB.databases()).some(database => database.name === mount)) return false;
    return new Promise(resolve => {
      const request = indexedDB.open(mount);
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        const saved = db.transaction('FILE_DATA').objectStore('FILE_DATA').get(window.__playforgeChatProbe.storagePath);
        saved.onerror = () => { db.close(); resolve(false); };
        saved.onsuccess = () => {
          db.close();
          const contents = saved.result?.contents;
          const text = contents ? new TextDecoder().decode(contents) : '';
          resolve(text.includes(prompt) && text.includes(reply) && !text.includes(image));
        };
      };
    });
  }, { prompt, reply, image }, { timeout: 20000, polling: 500 });
  log.push('IndexedDB contains both messages without the attached PNG data: ' +
    await editor.evaluate(() => window.__playforgeChatProbe.storagePath));

  await page.reload();
  editor = await mountedEditor();
  await editor.waitForFunction(({ prompt, reply }) => {
    const state = window.__playforgeChatProbe;
    return state?.transcript.includes(prompt) && state.transcript.includes(reply) && state.attachments === 0;
  }, { prompt, reply }, { timeout: 30000 }).catch(async error => {
    const state = await editor.evaluate(() => window.__playforgeChatProbe).catch(() => null);
    log.push('Chat probe after reload: ' + JSON.stringify(state ?? null));
    throw error;
  });
  assert.equal(requests.length, 1, 'Reload must render the transcript without resubmitting the attachment.');
  assert.equal(loginAttempts, 2, 'Reload must reuse the provider status without starting login again.');
  assert.doesNotMatch(log.join('\n'), /SCRIPT ERROR:|pageerror:|Failed to save IDB file system/);
  log.push('PLAYFORGE_WEB_CHAT_IMAGE_AND_TRANSCRIPT_OK');
});
