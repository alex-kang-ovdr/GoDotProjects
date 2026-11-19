'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { chromium, expect } = require('@playwright/test');

const model = 'fixture-model';
const editTool = 'pf_workspace_apply';
const responseText = 'The fixture response arrived.';
const evidence = path.resolve(__dirname, '../../Saved/Tests/agent-iframe');
const projectScene = '[gd_scene format=3]\n\n[node name="Main" type="Node3D"]\n\n[node name="Status" type="Label" parent="."]\ntext = "Before"\n';
const editorProbe = `
var _iframe_test_callback: JavaScriptObject

func _iframe_test_start() -> void:
	_iframe_test_callback = JavaScriptBridge.create_callback(_iframe_test_action)
	JavaScriptBridge.get_interface("window")["__playforgeAgentTestAction"] = _iframe_test_callback
	var timer := Timer.new()
	timer.wait_time = 0.15
	timer.timeout.connect(_iframe_test_observe)
	add_child(timer)
	timer.start()

func _iframe_test_observe() -> void:
	var root := EditorInterface.get_edited_scene_root()
	if root != null and not EditorInterface.get_resource_filesystem().is_scanning():
		var label := root.get_node_or_null("Status") as Label
		if label != null:
			JavaScriptBridge.get_interface("window")["__playforgeAgentTestText"] = label.text

func _iframe_test_action(args: Array) -> void:
	if args == ["hide"]:
		_dock.close()
	elif args == ["show"]:
		_open_chat()
	elif args == ["stage-source"]:
		var selection := EditorInterface.get_selection()
		selection.clear()
		selection.add_node(EditorInterface.get_edited_scene_root().get_node("Status"))
`;

async function fixture(t, label, { routeDefaultProviders = true } = {}) {
  const tmp = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tmp, 'playforge-agent-iframe-'));
  const { createServer } = require('../../server.cjs');
  const server = createServer({
    publicOrigin: '', workspace: path.join(directory, 'workspace'),
    platformWorkspace: path.join(directory, 'platform'), buildDirectory: path.join(directory, 'builds'),
  });
  const log = [];
  let browser;
  t.after(async () => {
    try {
      await browser?.close();
      await new Promise(resolve => { server.once('close', resolve); server.shutdown(); });
    } finally {
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(path.join(evidence, label + '.log'), log.join('\n'));
      assert.equal(path.dirname(fs.realpathSync(directory)), tmp);
      assert.ok(path.basename(directory).startsWith('playforge-agent-iframe-'));
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.on('console', message => log.push(message.type() + ': ' + message.text()));
  page.on('pageerror', error => log.push('pageerror: ' + error.message));
  if (routeDefaultProviders) {
    await page.route('**/api/agent-chat/providers', route => route.fulfill({
      json: { providers: [{ id: 'ollama', label: 'Ollama', configured: true, auth: 'connected',
        available: true, model, models: [model], streaming: false }] },
    }));
  }
  return { base: 'http://127.0.0.1:' + server.address().port, page, log };
}

async function send(agent, prompt) {
  await agent.locator('#agent-prompt').fill(prompt);
  await agent.locator('#agent-send').click();
}

test('standalone Agent renders Config with Godot AI MCP Tools above Skills, listed Connect AI browser OAuth (ChatGPT/Claude/Gemini) + API labels, Model/Effort popover, Sidebar and Queueing', { timeout: 45000 }, async t => {
  const { base, page, log } = await fixture(t, 'standalone', { routeDefaultProviders: false });
  const loginUrl = 'https://auth.openai.com/playforge-standalone-oauth/';
  const claudeUrl = 'https://claude.com/cai/oauth/authorize?code=true';
  const geminiUrl = 'https://accounts.google.com/o/oauth2/v2/auth?scope=openid';
  let chatgptAuth = 'disconnected';
  let claudeAuth = 'disconnected';
  let geminiAuth = 'disconnected';
  const providerRows = () => [
    {
      id: 'chatgpt-connect',
      label: 'ChatGPT',
      configured: chatgptAuth === 'connected',
      auth: chatgptAuth,
      streaming: false,
      model: 'gpt-6.2-sol',
      default_model: 'gpt-6.2-sol',
      models: ['gpt-6.2-sol', 'gpt-6-astra', 'gpt-6-luna'],
      reasoning_efforts: {
        'gpt-6.2-sol': ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
        'gpt-6-astra': ['low', 'medium', 'high', 'xhigh', 'max'],
        'gpt-6-luna': ['low', 'medium', 'high'],
      },
    },
    {
      id: 'claude-connect',
      label: 'Claude',
      configured: claudeAuth === 'connected',
      auth: claudeAuth,
      streaming: false,
      model: 'claude-sonnet-5-5',
      default_model: 'claude-sonnet-5-5',
      models: ['claude-sonnet-5-5', 'claude-opus-5-5'],
      reasoning_efforts: { 'claude-sonnet-5-5': ['low', 'medium', 'high', 'max'] },
    },
    {
      id: 'gemini-connect',
      label: 'Gemini',
      configured: geminiAuth === 'connected',
      auth: geminiAuth,
      streaming: false,
      model: 'gemini-3.5-flash',
      default_model: 'gemini-3.5-flash',
      models: ['gemini-3.5-flash', 'gemini-3.1-pro-preview'],
      reasoning_efforts: {},
    },
    { id: 'claude-console', label: 'Claude API', configured: false, auth: 'disconnected', model: 'claude-sonnet-5-5', models: [] },
    { id: 'openai-api', label: 'OpenAI API', configured: false, auth: 'disconnected', model: 'gpt-5.4-mini', models: [] },
    { id: 'gemini', label: 'Gemini API', configured: false, auth: 'disconnected', model: 'gemini-4-hydrogen', models: [] },
    { id: 'zai-coding-plan', label: 'z.ai Coding Plan API', configured: false, auth: 'disconnected', model: 'glm-5.3', models: [] },
    { id: 'ollama', label: 'Ollama', configured: true, auth: 'connected', available: true, model, models: [model], streaming: false },
  ];

  await page.route('**/api/agent-chat/providers', route => route.fulfill({ json: { providers: providerRows() } }));
  await page.route('**/api/agent-chat/providers/connect', route => {
    const body = route.request().postDataJSON();
    if (body.provider === 'chatgpt-connect') {
      chatgptAuth = 'pending';
      return route.fulfill({ json: { providers: providerRows(), connect_url: loginUrl } });
    }
    if (body.provider === 'claude-connect') {
      claudeAuth = 'pending';
      return route.fulfill({ json: { providers: providerRows(), connect_url: claudeUrl, browser_opened: true } });
    }
    if (body.provider === 'gemini-connect') {
      geminiAuth = 'pending';
      return route.fulfill({ json: { providers: providerRows(), connect_url: geminiUrl, browser_opened: true } });
    }
    throw new Error('Unexpected provider connect: ' + body.provider);
  });
  await page.context().route(loginUrl, route => {
    chatgptAuth = 'connected';
    return route.fulfill({ body: 'Mock ChatGPT OAuth complete' });
  });

  const requests = [];
  let releaseFirstTurn;
  await page.route('**/api/agent-chat', async route => {
    const payload = route.request().postDataJSON();
    requests.push(payload);
    if (requests.length === 1) {
      await new Promise(resolve => { releaseFirstTurn = resolve; });
    }
    await route.fulfill({ json: { message: { role: 'assistant', content: `${responseText} #${requests.length}` } } });
  });

  await page.goto(base + '/OfficialGodot/agent.html');

  // 0. Header has ONLY mode tabs (OpenAI Chat <-> Claude Console) + Config gear (no MCP or Skills shortcut icons)
  assert.equal(await page.locator('#agent-btn-tools').count(), 0);
  assert.equal(await page.locator('#agent-btn-skills').count(), 0);
  assert.equal(await page.locator('#agent-open-mcp').count(), 0);
  assert.equal(await page.locator('#agent-mcp-dialog').count(), 0);
  await expect(page.locator('#agent-tab-chat')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#agent-tab-claude-console')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#agent-chat-view')).toBeVisible();
  await expect(page.locator('#agent-claude-console-view')).toBeHidden();

  // Switch to Claude Console tab and back to Chat tab
  await page.locator('#agent-tab-claude-console').click();
  await expect(page.locator('#agent-tab-claude-console')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#agent-tab-chat')).toHaveAttribute('aria-selected', 'false');
  await expect(page.locator('#agent-claude-console-view')).toBeVisible();
  await expect(page.locator('#agent-chat-view')).toBeHidden();
  await page.locator('#agent-console-input').fill('/status');
  await page.locator('#agent-console-run').click();
  await expect(page.locator('#agent-console-output')).toContainText('Claude status:');

  await page.locator('#agent-tab-chat').click();
  await expect(page.locator('#agent-tab-chat')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#agent-chat-view')).toBeVisible();
  await expect(page.locator('#agent-claude-console-view')).toBeHidden();

  // 1. Config overlay (SSOT): Godot AI MCP Tools checklist + Editor Bridge ABOVE Skills
  await page.locator('#agent-settings').click();
  await expect(page.locator('#agent-config-overlay')).toBeVisible();
  await expect(page.locator('#agent-connected-badges')).toContainText('OLLAMA (LOCAL)');

  const mcpBox = await page.locator('#agent-config-mcp-tools-section').boundingBox();
  const skillsBox = await page.locator('#agent-config-skills-section').boundingBox();
  assert.ok(mcpBox && skillsBox && mcpBox.y < skillsBox.y, 'MCP Tools section must appear above Skills section');
  assert.equal(await page.locator('#agent-tools input').count(), 0);

  await expect(page.locator('#agent-mcp-tools-count')).toHaveText('47 / 47');
  await page.locator('#agent-mcp-domains input[value="node"]').uncheck();
  await expect(page.locator('#agent-mcp-tools-count')).toHaveText('43 / 47');
  await expect(page.locator('#agent-mcp-tools-dirty')).toBeVisible();
  await page.locator('#agent-mcp-tools-reset').click();
  await expect(page.locator('#agent-mcp-tools-count')).toHaveText('47 / 47');
  await page.locator('#agent-mcp-domains input[value="csg"]').uncheck();
  await expect(page.locator('#agent-mcp-tools-count')).toHaveText('46 / 47');

  // 2. Connect AI modal lists Browser OAuth (ChatGPT, Claude, Gemini) + API-labeled providers with AI logo icons to the right of status dots
  await page.locator('#agent-open-connect').click();
  await expect(page.locator('#agent-connect-dialog')).toBeVisible();
  assert.equal(await page.locator('#agent-connect-dialog select').count(), 0);
  assert.deepEqual(
    await page.locator('#agent-provider-list .provider-name').allTextContents(),
    ['ChatGPT', 'Claude', 'Gemini', 'Claude API', 'OpenAI API', 'Gemini API', 'z.ai Coding Plan API', 'Ollama'],
  );
  assert.deepEqual(
    await page.locator('#agent-provider-list .provider-logo').evaluateAll(nodes => nodes.map(n => n.dataset.logo)),
    ['openai', 'claude', 'gemini', 'claude', 'openai', 'gemini', 'zai', 'ollama'],
  );
  const logoPositionsValid = await page.locator('#agent-provider-list .provider-identity').evaluateAll(rows =>
    rows.every(row => {
      const dot = row.querySelector('.status-dot');
      const logo = row.querySelector('.provider-logo');
      const logoSvg = row.querySelector('.provider-logo svg');
      const name = row.querySelector('.provider-name');
      if (!dot || !logo || !logoSvg || !name) return false;
      const dotBox = dot.getBoundingClientRect();
      const logoBox = logo.getBoundingClientRect();
      const nameBox = name.getBoundingClientRect();
      return dotBox.right <= logoBox.left + 2 && logoBox.right <= nameBox.left + 2;
    }),
  );
  assert.equal(logoPositionsValid, true, 'Each AI logo icon must appear immediately to the right of the status dot');

  // Test ChatGPT browser popup OAuth
  const popupPromise = page.context().waitForEvent('page', { timeout: 15000 });
  await page.locator('[data-provider-action="chatgpt-connect"]').click();
  const popup = await popupPromise;
  await popup.waitForURL(loginUrl, { timeout: 15000 });
  await popup.close();
  await expect(page.locator('[data-provider-card="chatgpt-connect"] .provider-auth-tag')).toHaveText('OAuth', { timeout: 10000 });
  await expect(page.locator('[data-provider-action="chatgpt-connect"]')).toHaveText('Disconnect');

  // Test Claude & Gemini browser OAuth pending -> connected transitions
  await page.locator('[data-provider-action="claude-connect"]').click();
  await expect(page.locator('[data-provider-card="claude-connect"] .provider-browser-link')).toHaveAttribute('href', claudeUrl);
  claudeAuth = 'connected';
  await expect(page.locator('[data-provider-card="claude-connect"] .provider-auth-tag')).toHaveText('OAuth', { timeout: 10000 });

  await page.locator('[data-provider-action="gemini-connect"]').click();
  await expect(page.locator('[data-provider-card="gemini-connect"] .provider-browser-link')).toHaveAttribute('href', geminiUrl);
  geminiAuth = 'connected';
  await expect(page.locator('[data-provider-card="gemini-connect"] .provider-auth-tag')).toHaveText('OAuth', { timeout: 10000 });

  await page.locator('#agent-connect-close').click();

  // Skills & Enter-to-send persisted on Save
  await page.locator('#agent-skills input[value="godot-script"]').check();
  await expect(page.locator('#agent-enter-sends')).toBeChecked();
  await page.locator('#agent-enter-sends').uncheck();
  await page.locator('#agent-config-save').click();
  await expect(page.locator('#agent-config-overlay')).toBeHidden();

  // 3. Model & Effort popover (including Ultra effort)
  await page.locator('#agent-model-trigger').click();
  await expect(page.locator('#agent-model-menu')).toBeVisible();
  await page.locator('#agent-model-list [data-provider="chatgpt-connect"][data-model="gpt-6.2-sol"]').click();
  await page.locator('#agent-model-trigger').click();
  await page.locator('#agent-fast-toggle').click();
  await expect(page.locator('#agent-fast-state')).toHaveText('On');
  await page.locator('#agent-effort-trigger').click();
  await expect(page.locator('#agent-effort-submenu')).toBeVisible();
  await page.locator('#agent-effort-submenu [data-effort="ultra"]').click();
  await expect(page.locator('#agent-model-label')).toHaveText('gpt-6.2-sol');
  await expect(page.locator('#agent-effort-label')).toHaveText('Ultra');

  // 4. Enter does not submit when enter-sends is unchecked
  await page.locator('#agent-prompt').fill('Describe a Godot script.');
  await page.locator('#agent-prompt').press('Enter');
  await expect(page.locator('#agent-prompt')).toHaveValue('Describe a Godot script.\n');
  assert.equal(requests.length, 0);

  // 5. Running state, Thinking pill, Sidebar, and Message Queueing
  await page.locator('#agent-send').click();
  await expect(page.locator('#agent-running-label')).toBeVisible();
  await expect(page.locator('#agent-thinking')).toBeVisible();
  await expect(page.locator('#agent-stop')).toBeVisible();
  await expect(page.locator('#agent-prompt')).toHaveAttribute('placeholder', 'Queue a message...');

  await page.locator('#agent-sidebar-toggle').click();
  await expect(page.locator('#agent-sidebar')).toBeVisible();
  await expect(page.locator('#agent-session-list .session-item')).toHaveCount(1);

  await page.locator('#agent-prompt').fill('Follow-up queued prompt');
  await page.locator('#agent-queue-btn').click();
  await expect(page.locator('#agent-queue-list')).toContainText('Follow-up queued prompt');

  releaseFirstTurn();
  await expect(page.locator('#agent-transcript')).toContainText(`${responseText} #1`, { timeout: 10000 });
  await expect(page.locator('#agent-transcript')).toContainText(`${responseText} #2`, { timeout: 10000 });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].provider, 'chatgpt-connect');
  assert.equal(requests[0].model, 'gpt-6.2-sol');
  assert.equal(requests[0].reasoning_effort, 'ultra');
  assert.equal(requests[0].service_tier, 'fast');
  assert.match(requests[0].messages[0].content, /Godot 4 GDScript/);
  assert.equal(requests[0].tools?.length ?? 0, 0);
  assert.doesNotMatch(log.join('\n'), /pageerror:/);
  log.push('PLAYFORGE_STANDALONE_AGENT_OK');
});

test('real Godot WASM iframe filters tools and only applies a reviewed permitted edit', {
  skip: process.env.PLAYFORGE_REAL_AGENT_IFRAME !== '1' && 'Set PLAYFORGE_REAL_AGENT_IFRAME=1 to run the real WASM dock',
  timeout: 155000,
}, async t => {
  const { base, page, log } = await fixture(t, 'wasm');
  const projectsPath = '/api/platform/projects';
  const created = await fetch(base + projectsPath, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Agent iframe probe', template: 'blank3d' }),
  });
  assert.equal(created.status, 201);
  const project = await created.json();
  const seeded = await fetch(base + projectsPath + '/' + project.project.id, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ baseRevision: project.revision, files: project.files.map(file =>
      file.path === 'scenes/main.tscn' ? { ...file, content: projectScene } : file) }),
  });
  assert.equal(seeded.status, 200);
  await page.route('**/api/platform-addon/agent-chat', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const hook = '\t_refresh_context.call_deferred()';
    const script = body.files['plugin.gd'];
    assert.ok(script.includes(hook));
    body.files['plugin.gd'] = script.replace(hook, hook + '\n\t_iframe_test_start.call_deferred()') + editorProbe;
    await route.fulfill({ response, json: body });
  });
  const calls = [];
  await page.route('**/api/agent-chat', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { message: { role: 'assistant', content: responseText, tool_calls: [{ function: {
      name: editTool, arguments: { operations: [{ kind: 'property.set', objectId: 'Status', propertyId: 'text',
        value: calls.length === 1 ? 'Approved edit' : 'Unsolicited edit', role: 'gui', description: 'Update the fixture label' }] },
    } }] } } });
  });
  const runtimeAbort = page.waitForEvent('pageerror', {
    predicate: error => /Aborted\(native code/.test(error.message), timeout: 60000,
  }).then(error => { throw error; });
  runtimeAbort.catch(() => {});
  await page.goto(base + '/OfficialGodot/?project=' + project.project.id);
  const host = page.frameLocator('#editor');
  const agent = host.frameLocator('#agent-dock-frame');
  const editorFrame = await (await page.locator('#editor').elementHandle()).contentFrame();
  await Promise.race([
    editorFrame.waitForFunction(() => window.__playforgeAgentTestText === 'Before', undefined, { timeout: 60000 }),
    runtimeAbort,
  ]).catch(async error => {
    const state = await editorFrame.evaluate(() => ({
      ready: window.__playforgeAgentDockReady,
      visible: window.__playforgeAgentDockState?.visible,
      probeText: window.__playforgeAgentTestText,
    })).catch(() => null);
    log.push(JSON.stringify(state));
    throw error;
  });
  await editorFrame.evaluate(() => window.__playforgeAgentTestAction('stage-source'));
  await editorFrame.evaluate(() => window.__playforgeAgentTestAction('show'));
  await editorFrame.waitForFunction(() => window.__playforgeAgentDockReady);
  await expect(host.locator('#agent-dock-frame')).toBeVisible();

  await agent.locator('#agent-settings').click();
  await agent.locator('#agent-tools input[value="pf_asset_pack_import"]').uncheck();
  await agent.locator('#agent-tools input[value="pf_asset_pack_status"]').uncheck();
  await agent.locator('#agent-skills input[value="godot-script"]').check();
  await agent.locator('#agent-config-save').click();

  await agent.locator('#agent-stage').click();
  await send(agent, 'Update the selected fixture label.');
  await expect(agent.locator('#agent-approval')).toBeVisible({ timeout: 15000 });
  assert.equal(await editorFrame.evaluate(() => window.__playforgeAgentTestText), 'Before');
  assert.deepEqual(calls[0].tools.map(tool => tool.function.name), [editTool]);
  assert.match(calls[0].messages[0].content, /GDScript/);
  assert.match(calls[0].messages[0].content, /"path":"Status"/);
  await agent.locator('#agent-approve').click();
  await editorFrame.waitForFunction(() => window.__playforgeAgentTestText === 'Approved edit');
  await expect(agent.locator('#agent-transcript')).toContainText(responseText);

  await agent.locator('#agent-settings').click();
  await agent.locator('#agent-tools input[value="pf_workspace_apply"]').uncheck();
  await agent.locator('#agent-config-save').click();

  await send(agent, 'Test rejection of any disabled tool.');
  await expect(agent.locator('#agent-status')).toContainText('허용하지 않은 작업');
  assert.deepEqual(calls[1].tools, []);
  assert.equal(await editorFrame.evaluate(() => window.__playforgeAgentTestText), 'Approved edit');
  await expect(agent.locator('#agent-approval')).toBeHidden();

  const documentKey = await agent.locator('body').evaluate(body => body.dataset.probeDocument = 'same-document');
  const dock = host.locator('#agent-dock-frame');
  const original = await dock.boundingBox();
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect.poll(async () => (await dock.boundingBox())?.x).not.toBe(original.x);
  await editorFrame.evaluate(() => window.__playforgeAgentTestAction('hide'));
  await expect(dock).toBeHidden();
  await editorFrame.evaluate(() => window.__playforgeAgentTestAction('show'));
  await expect(dock).toBeVisible();
  assert.equal(await agent.locator('body').getAttribute('data-probe-document'), documentKey);
  assert.doesNotMatch(log.join('\n'), /SCRIPT ERROR:|pageerror:/);
  log.push('PLAYFORGE_WASM_AGENT_IFRAME_OK');
});
