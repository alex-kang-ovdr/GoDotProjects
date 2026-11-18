'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const templateId = 'tappy-chicken';
const manifestPath = path.join(root, 'Templates', templateId, 'showcase.json');
const nativeGodot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';
const realWeb = process.env.PLAYFORGE_REAL_SHOWCASE === '1';
const evidence = path.join(root, 'Saved', 'Tests', 'template-showcase');

function scratch(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'playforge-showcase-'));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync(directory)), parent);
    assert.ok(path.basename(directory).startsWith('playforge-showcase-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function run(command, args, label, timeout = 30000) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout, windowsHide: true });
  const output = (result.stdout || '') + (result.stderr || '');
  fs.mkdirSync(evidence, { recursive: true });
  fs.writeFileSync(path.join(evidence, label + '.log'), output);
  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
  assert.doesNotMatch(output, /SCRIPT ERROR:|Parse Error|^ERROR:/m);
  return output;
}

function authoredFiles(directory) {
  const result = {};
  function visit(parent, relative = '') {
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.name === '.godot' || /\.(?:import|uid)$/.test(entry.name)) continue;
      const file = path.join(parent, entry.name);
      const key = relative + entry.name;
      if (entry.isDirectory()) visit(file, key + '/');
      else if (entry.isFile()) result[key] = fs.readFileSync(file);
    }
  }
  visit(directory);
  return result;
}

test('installed Godot shows four role cursors on the editor and replays without saving authored files', {
  skip: fs.existsSync(nativeGodot) ? false : 'Native Godot unavailable',
  timeout: 100000,
}, t => {
  const directory = path.join(scratch(t), 'demo');
  run(process.execPath, ['Tools/prepare-template-showcase.cjs', templateId, directory], 'native-prepare');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(directory, '.playforge-showcase.json'), 'utf8')),
    JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  );
  assert.match(fs.readFileSync(path.join(directory, 'project.godot'), 'utf8'), /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'showcase-headless.gd'), path.join(directory, 'showcase-headless.gd'));
  run(nativeGodot, ['--headless', '--path', directory, '--editor', '--import', '--quit'], 'native-import');
  const before = authoredFiles(directory);
  const output = run(nativeGodot, ['--headless', '--path', directory, '--script', 'res://showcase-headless.gd'], 'native-replay');
  assert.match(output, /PLAYFORGE_SHOWCASE_HEADLESS_OK/);
  assert.deepEqual(authoredFiles(directory), before, 'Playback must not modify authored files, assets or settings');

  const probe = path.join(directory, 'addons', 'showcase_probe');
  fs.mkdirSync(probe);
  fs.writeFileSync(path.join(probe, 'plugin.cfg'), '[plugin]\nname="Showcase editor probe"\nscript="probe.gd"\n');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'showcase-editor-probe.gd'), path.join(probe, 'probe.gd'));
  const project = path.join(directory, 'project.godot');
  fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replace(
    /^(enabled\s*=\s*PackedStringArray\()([^)]*)(\))/m,
    '$1$2, "res://addons/showcase_probe/plugin.cfg"$3',
  ));
  const editorOutput = run(nativeGodot, ['--headless', '--path', directory, '--editor'], 'native-editor-overlay');
  assert.match(editorOutput, /PLAYFORGE_SHOWCASE_EDITOR_OVERLAY_OK/);
});

async function withServer(t, callback) {
  const directory = scratch(t);
  const { createServer } = require('../server.cjs');
  const server = createServer({
    publicOrigin: '',
    workspace: path.join(directory, 'workspace'),
    platformWorkspace: path.join(directory, 'platform'),
    buildDirectory: path.join(directory, 'builds'),
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await callback('http://127.0.0.1:' + server.address().port);
  } finally {
    await new Promise(resolve => {
      server.once('close', resolve);
      server.shutdown();
    });
  }
}

async function getJson(base, route) {
  const response = await fetch(base + route);
  assert.equal(response.status, 200, route);
  return response.json();
}

function indexedFiles(files) {
  return Object.fromEntries(files.map(file => [file.path, file.content]));
}

test('showcase addon API packages the canonical role timeline separately from the game project', async t => {
  await withServer(t, async base => {
    const templates = await getJson(base, '/api/platform/templates');
    assert.equal(templates.templates.find(item => item.id === templateId).showcase, true);
    assert.notEqual(templates.templates.find(item => item.id === 'blank3d').showcase, true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const addon = await getJson(base, '/api/platform-addon/showcase/' + templateId);
    assert.equal(addon.ok, true);
    assert.deepEqual(addon.manifest, manifest);
    assert.deepEqual(manifest.roles.map(role => role.id).sort(), ['assets', 'gui', 'level', 'script']);
    for (const name of ['plugin.cfg', 'plugin.gd', 'showcase_panel.gd', 'showcase_canvas.gd', 'showcase_timeline.gd']) {
      assert.equal(addon.files[name], fs.readFileSync(path.join(root, 'Godot', 'addons', 'playforge_showcase', name), 'utf8'));
    }
    const template = await getJson(base, '/api/platform/templates/' + templateId);
    assert.ok(template.files.some(file => file.path === 'scenes/main.tscn'));
    assert.ok(!template.files.some(file => /showcase\.json$|playforge_showcase\//.test(file.path)));
  });
});

const stubEngine = `
window.Engine = class {
  static isWebGLAvailable() { return true; }
  static getMissingFeatures() { return []; }
  constructor() { this.files = {}; }
  async init() {}
  copyToFS(file, bytes) { this.files[file] = new TextDecoder().decode(bytes); }
  async start() {
    window.__showcaseTestFiles = this.files;
    window.__showcaseTestAutoStart = window.__playforgeShowcaseAutoStart;
  }
};
`;

async function watchShowcaseBrowser(t, real) {
  await withServer(t, async base => {
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ headless: true, channel: 'chrome',
      ...(real ? { args: ['--enable-unsafe-swiftshader'] } : {}) });
    const browserLog = [];
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      const mutations = [];
      const errors = [];
      let initialFiles;
      page.on('pageerror', error => errors.push(error.message));
      page.on('crash', () => browserLog.push('Page renderer crashed'));
      page.on('requestfailed', request => browserLog.push(request.method() + ' ' + request.url() + ' failed: ' + request.failure()?.errorText));
      page.on('console', message => {
        browserLog.push(message.type() + ': ' + message.text());
        if (/SCRIPT ERROR:|Parse Error|Invalid call|Invalid access/.test(message.text())) errors.push(message.text());
      });
      page.on('request', request => {
        const route = new URL(request.url()).pathname;
        if (route.startsWith('/api/platform/projects') && ['POST', 'PUT', 'DELETE'].includes(request.method())) {
          const body = request.postDataJSON();
          mutations.push({ route, method: request.method(), body });
          if (request.method() === 'PUT') browserLog.push('Project PUT: ' + JSON.stringify({
            route, baseRevision: body?.baseRevision,
            files: body?.files?.filter(file => initialFiles?.[file.path] !== file.content).map(file => file.path),
          }));
          const sentProject = body?.files?.find(file => file.path === 'project.godot')?.content;
          if (real && initialFiles?.['project.godot'] && sentProject && initialFiles['project.godot'] !== sentProject) {
            fs.mkdirSync(evidence, { recursive: true });
            fs.writeFileSync(path.join(evidence, 'project-before.godot'), initialFiles['project.godot']);
            fs.writeFileSync(path.join(evidence, 'project-after.godot'), sentProject);
          }
        }
      });
      await page.addInitScript(() => { window.prompt = () => 'Showcase browser QA'; });
      if (!real) {
        await page.route('**/OfficialGodot/vendor/godot.editor.js', route => route.fulfill({
          body: stubEngine, contentType: 'text/javascript; charset=utf-8',
          headers: { 'Cross-Origin-Resource-Policy': 'same-origin' },
        }));
      }

      const template = await getJson(base, '/api/platform/templates/' + templateId);
      const addon = await getJson(base, '/api/platform-addon/showcase/' + templateId);
      const existing = await fetch(base + '/api/platform/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Initial library project', template: 'blank3d' }),
      });
      assert.equal(existing.status, 201, 'Preload a library entry so it does not open a blank editor first.');
      await page.goto(base + '/OfficialGodot/', { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Tappy Chicken/ }).click();
      await page.getByRole('button', { name: '만드는 과정 보기' }).click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('project'));
      const id = new URL(page.url()).searchParams.get('project');
      const editor = page.frames().find(frame => {
        const url = new URL(frame.url() || base);
        return url.pathname.endsWith('/editor.html') && url.searchParams.get('project') === id;
      }) || await page.waitForEvent('framenavigated', {
        predicate: frame => new URL(frame.url()).searchParams.get('project') === id && frame !== page.mainFrame(),
      });
      assert.equal(new URL(editor.url()).searchParams.get('showcase'), '1');

      const created = await getJson(base, '/api/platform/projects/' + id);
      assert.equal(created.revision, 1);
      initialFiles = indexedFiles(created.files);
      const expectedFiles = indexedFiles(template.files);
      // A named project may amend its configuration on creation. The complete game is already present.
      for (const [name, content] of Object.entries(expectedFiles)) {
        if (name !== 'project.godot') assert.equal(initialFiles[name], content, name);
      }

      const renderedRoles = page.locator('.peer-cursor.showcase-cursor[data-showcase-role]:visible');
      if (real) {
        const status = () => editor.evaluate(() => ({
          state: window.__playforgeShowcaseState, autoStart: window.__playforgeShowcaseAutoStart,
          bridge: typeof window.__playforgeStartShowcase, status: document.getElementById('status')?.textContent,
          isolated: window.crossOriginIsolated,
        }));
        const waitForDone = () => editor.waitForFunction(() => {
          const state = window.__playforgeShowcaseState;
          return state?.ready && !state.playing && state.duration > 0 && Math.abs(state.time - state.duration) < 0.001;
        }, undefined, { timeout: 90000 });
        const waitForPlaying = (minimum, maximum) => editor.waitForFunction(({ minimum, maximum }) => {
          const state = window.__playforgeShowcaseState;
          return state?.ready && state.visible && state.playing && state.time >= minimum && state.time < maximum;
        }, { minimum, maximum }, { timeout: 60000 });
        const waitForRenderedRoles = async minimum => {
          const frame = await page.waitForFunction(minimum => {
            const editorFrame = document.getElementById('editor');
            const state = editorFrame.contentWindow.__playforgeShowcaseState;
            if (!state?.playing || state.time < minimum || state.roles?.length !== 4) return false;
            const rect = editorFrame.getBoundingClientRect();
            const canvas = editorFrame.contentDocument.getElementById('editor-canvas').getBoundingClientRect();
            const all = [...document.querySelectorAll('.peer-cursor.showcase-cursor[data-showcase-role]')];
            const roles = state.roles.map(role => {
              const cursor = all.find(node => node.dataset.showcaseRole === role.id);
              if (!cursor || !cursor.getClientRects().length) return null;
              return {
                ...role,
                positioned: Math.abs(parseFloat(cursor.style.left) - (rect.left + canvas.left + role.x * canvas.width)) < 1
                  && Math.abs(parseFloat(cursor.style.top) - (rect.top + canvas.top + role.y * canvas.height)) < 1,
                inputTransparent: getComputedStyle(cursor).pointerEvents === 'none',
                labelShown: cursor.querySelector('small')?.textContent === role.label,
                captionShown: Boolean(role.caption?.trim()) && cursor.querySelector('em')?.textContent === role.caption,
              };
            });
            return roles.every(role => role?.positioned && role.labelShown && role.captionShown) && roles;
          }, minimum, { timeout: 20000 });
          const roles = await frame.jsonValue();
          await frame.dispose();
          assert.deepEqual(roles.map(role => role.id).sort(), ['assets', 'gui', 'level', 'script']);
          assert.ok(roles.every(role => role.inputTransparent && [role.x, role.y].every(value => value >= 0 && value <= 1)));
          assert.equal(new Set(roles.map(role => `${role.x},${role.y}`)).size, 4);
          return roles;
        };
        fs.mkdirSync(evidence, { recursive: true });
        try {
          await editor.waitForFunction(() => window.__playforgeShowcaseState?.ready, undefined, { timeout: 45000 });
          browserLog.push('Showcase boot: ' + JSON.stringify(await status()));
          await waitForPlaying(3, 12);
          const earlier = await waitForRenderedRoles(3);
          await page.screenshot({ path: path.join(evidence, 'actual-godot-web-showcase-playing.png') });
          const peer = await fetch(base + '/api/platform/projects/' + id + '/activity', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clientId: 'showcase_qa_peer', label: '공동 작업 확인', kind: 'cursor', x: 0.9, y: 0.4 }),
          });
          assert.equal(peer.status, 202, 'A live collaborator can appear while the local showcase is running.');
          await page.locator('.peer-cursor:not(.showcase-cursor)').filter({ hasText: '공동 작업 확인' })
            .waitFor({ state: 'visible', timeout: 5000 });
          assert.equal(await renderedRoles.count(), 4, 'The live peer and the four showcase roles coexist.');
          const later = await waitForRenderedRoles(6);
          assert.ok(later.some((role, index) => role.x !== earlier[index].x || role.y !== earlier[index].y),
            'A role cursor should move between real editor locations as its work changes.');
          await waitForDone();
          await renderedRoles.first().waitFor({ state: 'hidden' });
          await page.screenshot({ path: path.join(evidence, 'actual-godot-web-showcase.png') });
          await editor.evaluate(() => window.__playforgeStartShowcase());
          await waitForPlaying(0, 1);
          await waitForRenderedRoles(0);
          await page.evaluate(() => window.PlayForgeCollaboration.setCursorSharing(false));
          await editor.evaluate(() => {
            const receiveScreen = window.__playforgeNativeGameScreen;
            window.__playforgeTestScreens = [];
            window.__playforgeNativeGameScreen = message => {
              if (message?.type === 'native-screen') window.__playforgeTestScreens.push(message.screen);
              receiveScreen(message);
            };
          });
          // The Godot 2D tab is drawn on the canvas at the fixed 1440px test viewport.
          await editor.locator('#editor-canvas').click({ position: { x: 609, y: 22 } });
          await editor.waitForFunction(() => window.__playforgeTestScreens.includes('2D'), undefined, { timeout: 5000 });
          await waitForRenderedRoles(3);
          await page.screenshot({ path: path.join(evidence, 'actual-godot-web-showcase-2d.png') });
          await waitForDone();
          await renderedRoles.first().waitFor({ state: 'hidden' });
          assert.deepEqual(await editor.evaluate(() => window.__playforgeTestScreens), ['2D'],
            'Playback must preserve the user’s 2D view choice.');
          browserLog.push('Showcase completed replay: ' + JSON.stringify(await status()));
        } catch (error) {
          try { browserLog.push('Showcase failure: ' + JSON.stringify(await status())); } catch { /* The renderer may have closed. */ }
          await page.screenshot({ path: path.join(evidence, 'actual-godot-web-showcase-failure.png'), timeout: 10000 }).catch(() => {});
          throw error;
        }
      } else {
        await editor.waitForFunction(() => window.__showcaseTestFiles);
        const engine = await editor.evaluate(() => ({ files: window.__showcaseTestFiles, autoStart: window.__showcaseTestAutoStart }));
        assert.equal(engine.autoStart, true, 'Autoplay is armed before the Godot editor starts.');
        const projectPath = '/home/web_user/projects/' + id + '/';
        assert.deepEqual(JSON.parse(engine.files[projectPath + '.playforge-showcase.json']), addon.manifest);
        const pluginSection = engine.files[projectPath + 'project.godot'].split('[editor_plugins]')[1].split(/^\[/m)[0];
        const enabledLines = pluginSection.match(/^enabled\s*=.*$/gm) || [];
        assert.equal(enabledLines.length, 1, 'Godot must read one authoritative plugin setting.');
        assert.match(enabledLines[0], /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
        assert.match(enabledLines[0], /res:\/\/addons\/playforge_platform\/plugin\.cfg/);
        for (const [name, content] of Object.entries(addon.files)) {
          assert.equal(engine.files[projectPath + 'addons/playforge_showcase/' + name], content, name);
        }
        await editor.evaluate(() => window.__playforgeShowcaseChanged({
          roles: [{ id: 'gui', label: 'GUI', color: '#ce8afa', caption: '점수판 배치', x: 0.25, y: 0.25 }],
        }));
        await renderedRoles.filter({ hasText: '점수판 배치' }).waitFor({ state: 'visible' });
        await editor.evaluate(() => window.__playforgeShowcaseChanged({ roles: [] }));
        await renderedRoles.first().waitFor({ state: 'hidden' });
      }

      const after = await getJson(base, '/api/platform/projects/' + id);
      const finalFiles = indexedFiles(after.files);
      const changedPaths = [...new Set([...Object.keys(initialFiles), ...Object.keys(finalFiles)])]
        .filter(name => initialFiles[name] !== finalFiles[name]);
      assert.equal(after.revision, created.revision, `Playback must not create a new project revision. Changed paths: ${changedPaths.join(', ')}`);
      assert.deepEqual(finalFiles, initialFiles);
      assert.equal(await page.locator('#guideStep').isVisible(), false, 'The legacy wait-and-write walkthrough did not open.');
      const tabClicks = mutations.filter(({ route, method, body }) => real && method === 'POST'
        && route.endsWith('/activity') && body?.kind === 'step' && body?.clickLabel === '2D'
        && Math.abs(body.x - 609 / 1440) < 0.02 && Math.abs(body.y - 62 / 960) < 0.02);
      assert.ok(tabClicks.length <= 1, 'Only the manual 2D tab click may produce an activity event.');
      assert.deepEqual(mutations.filter(request => !tabClicks.includes(request))
        .map(({ route, method, body }) => ({ route, method, mode: body?.mode })),
        [{ route: '/api/platform/projects', method: 'POST', mode: 'ready' }],
        'A single complete project is created. The showcase sends no legacy file writes or synthetic cursor activity.');
      assert.deepEqual(errors, []);
    } finally {
      fs.mkdirSync(evidence, { recursive: true });
      fs.writeFileSync(path.join(evidence, real ? 'actual-web-browser.log' : 'stub-web-browser.log'), browserLog.join('\n'));
      await browser.close();
    }
  });
}
test('Web launcher injects the addon and renders showcase roles with the collaboration cursors', { timeout: 45000 },
  t => watchShowcaseBrowser(t, false));

test('official Godot Web editor anchors four moving cursors on its canvas and replays without writes', {
  skip: !realWeb && 'Set PLAYFORGE_REAL_SHOWCASE=1 to run the actual WASM editor',
  timeout: 240000,
}, t => {
  assert.ok(fs.existsSync(path.join(root, 'OfficialGodot', 'vendor', 'godot.editor.wasm')),
    'Real Web test requires the Godot 4.7.2 vendor bundle.');
  return watchShowcaseBrowser(t, true);
});
