'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const templatesToReplay = [
  { id: 'tappy-chicken', name: 'Tappy Chicken', landmark: { id: 'Hud/Score', label: '0' } },
  { id: 'iron-wood', name: 'Iron Wood', landmark: { id: 'Preview/Cart', position: [0, 0.86, 4] } },
  { id: 'brawllabs', name: 'BrawlLabs', landmark: { id: 'Preview/SceneTitle', label: 'BRAWLLABS · GEM GRAB' } },
];
const nativeGodot = process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe';
const realWeb = process.env.PLAYFORGE_REAL_SHOWCASE === '1';
const evidence = path.join(root, 'Saved', 'Tests', 'template-showcase');
const sourceScene = 'playforge_replay_source.tscn';
const tabLocations = new Map([['2D', 609], ['3D', 665]]);
const nativeFollowButton = { x: 650, y: 765 };

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

function run(command, args, logPath, timeout = 30000) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout, windowsHide: true });
  const output = (result.stdout || '') + (result.stderr || '');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, output);
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

function sceneDeclarations(source) {
  return [...source.matchAll(/^\[node ([^\]]+)\]/gm)].map(([, attrs]) => {
    const name = /\bname="([^"]+)"/.exec(attrs)?.[1];
    const kind = /\btype="([^"]+)"/.exec(attrs)?.[1];
    const parent = /\bparent="([^"]+)"/.exec(attrs)?.[1];
    return { name, kind, id: parent === undefined ? '' : parent === '.' ? name : `${parent}/${name}` };
  });
}

function assertBlankReplayScene(source, original) {
  assert.deepEqual(sceneDeclarations(source).map(({ name, kind }) => ({ name, kind })),
    [{ name: 'ForgeReplay', kind: sceneDeclarations(original)[0].kind }]);
  assert.equal((source.match(/^\[node /gm) || []).length, 1, 'The replay starts on an empty Godot scene.');
  assert.doesNotMatch(source, /^\[ext_resource /m, 'Starter projects must not attach the game scripts to the replay scene.');
}

for (const { id: templateId } of templatesToReplay) {
  test(`installed Godot builds the actual ${templateId} scene and replays without saving authored files`, {
    skip: fs.existsSync(nativeGodot) ? false : 'Native Godot unavailable',
    timeout: 100000,
  }, t => {
    const directory = path.join(scratch(t), 'demo');
    const log = name => path.join(evidence, templateId, name + '.log');
    const source = path.join(root, 'Templates', templateId);
    const sourceBefore = authoredFiles(source);
    run(process.execPath, ['Tools/prepare-template-showcase.cjs', templateId, directory], log('native-prepare'));
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(directory, '.playforge-showcase.json'), 'utf8')),
      JSON.parse(fs.readFileSync(path.join(source, 'showcase.json'), 'utf8')),
    );
    assert.match(fs.readFileSync(path.join(directory, 'project.godot'), 'utf8'), /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
    const starter = fs.readFileSync(path.join(directory, 'scenes', 'main.tscn'), 'utf8');
    const original = fs.readFileSync(path.join(source, 'scenes', 'main.tscn'), 'utf8');
    assertBlankReplayScene(starter, original);
    assert.equal(fs.readFileSync(path.join(directory, sourceScene), 'utf8'), original,
      'The native source scene must retain the entire original scene byte for byte.');
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'showcase-headless.gd'), path.join(directory, 'showcase-headless.gd'));
    run(nativeGodot, ['--headless', '--path', directory, '--editor', '--import', '--quit'], log('native-import'));
    const before = authoredFiles(directory);
    const output = run(nativeGodot, ['--headless', '--path', directory, '--script', 'res://showcase-headless.gd'], log('native-replay'));
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
    const editorOutput = run(nativeGodot, ['--headless', '--path', directory, '--editor'], log('native-editor-overlay'));
    assert.match(editorOutput, /PLAYFORGE_SHOWCASE_EDITOR_OVERLAY_OK/);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'scenes', 'main.tscn'), 'utf8'), starter,
      'Opening, advancing and restarting in the native editor do not implicitly save the starter scene.');
    assert.equal(fs.readFileSync(path.join(directory, sourceScene), 'utf8'), original);
    assert.deepEqual(authoredFiles(source), sourceBefore, 'The shipped template remains byte-for-byte intact.');
  });
}

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

function assertReplayScene(replay, original, landmark) {
  assert.equal(replay.scenePath, 'res://scenes/main.tscn');
  assert.equal(replay.finished, true);
  assert.equal(replay.error, '');
  const [sceneRoot, ...expected] = sceneDeclarations(original);
  assert.equal(replay.rootName, sceneRoot.name);
  assert.equal(replay.rootClass, sceneRoot.kind);
  const script = /^\[ext_resource type="Script" path="([^"]+)"/m.exec(original)?.[1];
  assert.equal(replay.rootScript, script || '', 'The finished scene retains the original root script resource.');
  const byId = (left, right) => left.id.localeCompare(right.id);
  assert.deepEqual(replay.nodes.map(({ id, name, kind }) => ({ id, name, kind })).sort(byId), expected.sort(byId),
    'Real scene node paths, names and Godot classes match the original.');
  const actual = replay.nodes.find(node => node.id === landmark.id);
  if (landmark.label !== undefined) assert.equal(actual.label, landmark.label);
  if (landmark.position) {
    assert.equal(actual.position.length, 3);
    assert.ok(actual.position.every((part, index) => Math.abs(part - landmark.position[index]) < 1e-5),
      `${landmark.id} retains its exact original 3D translation.`);
  }
}

test('showcase addon API isolates the three blank replay projects from completed templates', async t => {
  await withServer(t, async base => {
    const templates = await getJson(base, '/api/platform/templates');
    assert.notEqual(templates.templates.find(item => item.id === 'blank3d').showcase, true);
    for (const { id: templateId } of templatesToReplay) {
      assert.equal(templates.templates.find(item => item.id === templateId).showcase, true);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Templates', templateId, 'showcase.json'), 'utf8'));
      const addon = await getJson(base, '/api/platform-addon/showcase/' + templateId);
      assert.equal(addon.ok, true);
      assert.equal(manifest.schemaVersion, 3);
      assert.deepEqual(addon.manifest, manifest);
      assert.deepEqual(manifest.roles.map(role => role.id).sort(), ['assets', 'gui', 'level', 'script']);
      assert.ok(addon.files['showcase_scene_replay.gd'], 'Both editors receive the real scene adapter.');
      for (const [name, content] of Object.entries(addon.files)) {
        assert.equal(content, fs.readFileSync(path.join(root, 'Godot', 'addons', 'playforge_showcase', name), 'utf8'));
      }
      const template = await getJson(base, '/api/platform/templates/' + templateId);
      assert.ok(!template.files.some(file => /showcase\.json$|playforge_showcase\//.test(file.path)));
      const projects = {};
      for (const mode of ['ready', 'showcase']) {
        const response = await fetch(base + '/api/platform/projects', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `QA ${templateId} ${mode}`, template: templateId, mode }),
        });
        assert.equal(response.status, 201, `${templateId} ${mode}`);
        projects[mode] = await response.json();
      }
      assert.equal(projects.showcase.project.mode, 'showcase');
      assert.notEqual(projects.ready.project.id, projects.showcase.project.id);
      const complete = indexedFiles(template.files);
      const ready = indexedFiles(projects.ready.files);
      const starter = indexedFiles(projects.showcase.files);
      assert.equal(ready['scenes/main.tscn'], complete['scenes/main.tscn']);
      assertBlankReplayScene(starter['scenes/main.tscn'], complete['scenes/main.tscn']);
      assert.equal(starter[sourceScene], complete['scenes/main.tscn']);
      for (const [name, content] of Object.entries(complete)) {
        if (/^(Assets|Scripts)\//i.test(name)) assert.equal(starter[name], content, `${templateId}: ${name}`);
      }
    }
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

async function watchShowcaseBrowser(t, { id: templateId, name: templateName, landmark }, real) {
  const artifacts = path.join(evidence, templateId);
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
            fs.mkdirSync(artifacts, { recursive: true });
            fs.writeFileSync(path.join(artifacts, 'project-before.godot'), initialFiles['project.godot']);
            fs.writeFileSync(path.join(artifacts, 'project-after.godot'), sentProject);
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
      await page.getByRole('button', { name: templateName, exact: false }).click();
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
      assert.equal(created.project.mode, 'showcase');
      initialFiles = indexedFiles(created.files);
      const expectedFiles = indexedFiles(template.files);
      assertBlankReplayScene(initialFiles['scenes/main.tscn'], expectedFiles['scenes/main.tscn']);
      assert.equal(initialFiles[sourceScene], expectedFiles['scenes/main.tscn']);
      for (const [name, content] of Object.entries(expectedFiles)) {
        if (/^(Assets|Scripts)\//i.test(name)) assert.equal(initialFiles[name], content, name);
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
              const style = getComputedStyle(cursor);
              return {
                ...role,
                positioned: Math.abs(parseFloat(cursor.style.left) - (rect.left + canvas.left + role.x * canvas.width)) < 1
                  && Math.abs(parseFloat(cursor.style.top) - (rect.top + canvas.top + role.y * canvas.height)) < 1,
                inputTransparent: style.pointerEvents === 'none',
                opacityShown: Math.abs(Number(style.opacity) - role.opacity) < 0.02
                  && cursor.classList.contains('dimmed') === (role.opacity < 1),
                labelShown: cursor.querySelector('small')?.textContent === role.label,
                captionShown: Boolean(role.caption?.trim()) && cursor.querySelector('em')?.textContent === role.caption,
              };
            });
            return roles.every(role => role?.positioned && role.labelShown && role.captionShown && role.opacityShown) && roles;
          }, minimum, { timeout: 20000 });
          const roles = await frame.jsonValue();
          await frame.dispose();
          assert.deepEqual(roles.map(role => role.id).sort(), ['assets', 'gui', 'level', 'script']);
          assert.ok(roles.every(role => role.inputTransparent && [role.x, role.y].every(value => value >= 0 && value <= 1)));
          assert.equal(new Set(roles.map(role => `${role.x},${role.y}`)).size, 4);
          return roles;
        };
        fs.mkdirSync(artifacts, { recursive: true });
        try {
          await editor.waitForFunction(() => window.__playforgeShowcaseState?.ready, undefined, { timeout: 90000 });
          browserLog.push('Showcase boot: ' + JSON.stringify(await status()));
          await waitForPlaying(3, 12);
          const earlier = await waitForRenderedRoles(3);
          const free = (await status()).state.focus;
          assert.equal(free.activeRole, '');
          assert.ok(earlier.every(role => role.opacity === 1), 'Free mode keeps all real Web role cursors at full opacity.');
          await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-playing.png') });
          const peer = await fetch(base + '/api/platform/projects/' + id + '/activity', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clientId: 'showcase_qa_peer', label: '공동 작업 확인', kind: 'cursor', x: 0.9, y: 0.4 }),
          });
          assert.equal(peer.status, 202, 'A live collaborator can appear while the local showcase is running.');
          await page.locator('.peer-cursor:not(.showcase-cursor)').filter({ hasText: '공동 작업 확인' })
            .waitFor({ state: 'visible', timeout: 5000 });
          assert.equal(await renderedRoles.count(), 4, 'The live peer and the four showcase roles coexist.');
          await page.setViewportSize({ width: 1260, height: 870 });
          const later = await waitForRenderedRoles(6);
          assert.ok(later.some((role, index) => role.x !== earlier[index].x || role.y !== earlier[index].y),
            'A role cursor should move between real editor locations as its work changes.');
          await waitForDone();
          await renderedRoles.first().waitFor({ state: 'hidden' });
          const finished = (await status()).state.replay;
          assertReplayScene(finished, expectedFiles['scenes/main.tscn'], landmark);
          await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase.png') });
          await page.setViewportSize({ width: 1440, height: 960 });
          await editor.evaluate(() => window.__playforgeStartShowcase());
          await waitForPlaying(0, 1);
          assert.ok((await status()).state.replay.nodes.length < finished.nodes.length,
            'Restart must remove the prior run’s scene nodes before rebuilding it.');
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
          // Godot renders its main screen buttons on the canvas at this fixed test viewport.
          const canvas = editor.locator('#editor-canvas');
          const mainView = sceneDeclarations(expectedFiles['scenes/main.tscn'])[0].kind === 'Node3D' ? '3D' : '2D';
          const alternateView = mainView === '3D' ? '2D' : '3D';
          await canvas.click({ position: { x: tabLocations.get(alternateView), y: 22 } });
          await editor.waitForFunction(view => window.__playforgeTestScreens.includes(view), alternateView, { timeout: 5000 });
          await waitForRenderedRoles(2);
          await canvas.click({ position: { x: tabLocations.get(mainView), y: 22 } });
          await editor.waitForFunction(view => window.__playforgeTestScreens.includes(view), mainView, { timeout: 5000 });
          await waitForRenderedRoles(3);
          await page.screenshot({ path: path.join(artifacts, `actual-godot-web-showcase-${mainView.toLowerCase()}.png`) });
          assert.deepEqual(await editor.evaluate(() => window.__playforgeTestScreens), [alternateView, mainView],
            'Free view preserves the user’s editor tab changes.');
          if (templateId === 'tappy-chicken') {
            // Godot renders its role selector in the fixed 1440px test canvas.
            await canvas.click({ position: nativeFollowButton });
            await page.keyboard.press('Home');
            const scriptIndex = addon.manifest.roles.findIndex(role => role.id === 'script') + 1;
            for (let index = 0; index <= scriptIndex; index++) await page.keyboard.press('ArrowDown');
            await page.keyboard.press('Enter');
            await editor.waitForFunction(() => window.__playforgeShowcaseState.focus.activeRole === 'script', undefined, { timeout: 5000 });
            const focused = await waitForRenderedRoles(3);
            assert.ok(focused.every(role => role.opacity === (role.id === 'script' ? 1 : 0.3)),
              'Following the script role dims the other real Web cursors.');
            const waitForScriptPhase = async phase => {
              await editor.waitForFunction(phase => {
                const { focus } = window.__playforgeShowcaseState;
                return focus?.screen === 'Script' && focus.scriptPhase === phase;
              }, phase, { timeout: 10000 });
              return (await status()).state.focus;
            };
            const open = await waitForScriptPhase('open');
            assert.deepEqual(await editor.evaluate(() => window.__playforgeTestScreens), [alternateView, mainView, 'Script']);
            await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-script-open.png') });
            const paste = await waitForScriptPhase('paste');
            assert.match(paste.scriptPath, /\/Main\.gd$/i);
            assert.equal(paste.scriptPath, open.scriptPath);
            assert.equal(paste.pasteCount, open.pasteCount + 1, 'One authored paste completes the full-script presentation.');
            await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-script-paste.png') });
          }
          await waitForDone();
          await renderedRoles.first().waitFor({ state: 'hidden' });
          if (templateId !== 'tappy-chicken') {
            assert.deepEqual(await editor.evaluate(() => window.__playforgeTestScreens), [alternateView, mainView],
              'Playback must preserve the user’s editor view changes.');
          }
          const completed = await status();
          assert.deepEqual(completed.state.replay, finished, 'Restart must reproduce the real edited scene.');
          browserLog.push('Showcase completed replay: ' + JSON.stringify(completed));
        } catch (error) {
          try { browserLog.push('Showcase failure: ' + JSON.stringify(await status())); } catch { /* The renderer may have closed. */ }
          await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-failure.png'), timeout: 10000 }).catch(() => {});
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
          roles: [
            { id: 'gui', label: 'GUI', color: '#ce8afa', caption: '점수판 배치', x: 0.25, y: 0.25, opacity: 0.3 },
            { id: 'script', label: '스크립트', color: '#eaa745', caption: '코드 전체 붙여넣기', x: 0.4, y: 0.4, opacity: 1 },
          ],
        }));
        const dimmed = renderedRoles.filter({ hasText: '점수판 배치' });
        await dimmed.waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
          const faded = document.querySelector('[data-showcase-role="gui"].dimmed');
          const followed = document.querySelector('[data-showcase-role="script"]:not(.dimmed)');
          return faded && followed && Number(getComputedStyle(faded).opacity) === 0.3
            && Number(getComputedStyle(followed).opacity) === 1;
        });
        await editor.evaluate(() => window.__playforgeShowcaseChanged({ roles: [] }));
        await renderedRoles.first().waitFor({ state: 'hidden' });

        const response = await fetch(base + '/api/platform/projects', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Ordinary workspace', template: templateId, mode: 'ready' }),
        });
        assert.equal(response.status, 201);
        const ordinary = await response.json();
        await editor.goto(base + '/OfficialGodot/editor.html?project=' + ordinary.project.id + '&showcase=1');
        await editor.waitForFunction(() => window.__showcaseTestFiles);
        const regularEngine = await editor.evaluate(() => ({
          files: window.__showcaseTestFiles, autoStart: window.__showcaseTestAutoStart,
        }));
        assert.notEqual(regularEngine.autoStart, true, 'A query parameter cannot initiate replay in an ordinary project.');
        const regularPath = '/home/web_user/projects/' + ordinary.project.id + '/';
        assert.equal(regularEngine.files[regularPath + 'scenes/main.tscn'], expectedFiles['scenes/main.tscn']);
        assert.equal(regularEngine.files[regularPath + '.playforge-showcase.json'], undefined);
        const readyConfig = regularEngine.files[regularPath + 'project.godot'];
        assert.doesNotMatch(readyConfig, /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
        assert.equal(regularEngine.files[regularPath + 'addons/playforge_showcase/plugin.gd'], undefined);
      }

      const after = await getJson(base, '/api/platform/projects/' + id);
      const finalFiles = indexedFiles(after.files);
      const changedPaths = [...new Set([...Object.keys(initialFiles), ...Object.keys(finalFiles)])]
        .filter(name => initialFiles[name] !== finalFiles[name]);
      assert.equal(after.revision, created.revision, `Playback must not create a new project revision. Changed paths: ${changedPaths.join(', ')}`);
      assert.deepEqual(finalFiles, initialFiles);
      assert.equal(await page.locator('#guideStep').isVisible(), false, 'The legacy wait-and-write walkthrough did not open.');
      const clickedControls = new Map([...tabLocations].map(([name, x]) => [name, { x, y: 22 }]));
      if (templateId === 'tappy-chicken') clickedControls.set('자유 보기', nativeFollowButton);
      const userClicks = mutations.filter(({ route, method, body }) => {
        const control = clickedControls.get(body?.clickLabel);
        return real && method === 'POST' && route.endsWith('/activity') && body?.kind === 'step' && control
          && Math.abs(body.x - control.x / 1440) < 0.02 && Math.abs(body.y - (40 + control.y) / 960) < 0.02;
      });
      assert.equal(new Set(userClicks.map(({ body }) => body.clickLabel)).size, userClicks.length,
        'Only actual manual clicks may produce semantic activity events.');
      assert.deepEqual(mutations.filter(request => !userClicks.includes(request))
        .map(({ route, method, body }) => ({ route, method, mode: body?.mode })),
        [{ route: '/api/platform/projects', method: 'POST', mode: 'showcase' }],
        'A separate starter project is created. The showcase sends no file writes or synthetic cursor activity.');
      assert.deepEqual(errors, []);
    } finally {
      fs.mkdirSync(artifacts, { recursive: true });
      fs.writeFileSync(path.join(artifacts, real ? 'actual-web-browser.log' : 'stub-web-browser.log'), browserLog.join('\n'));
      await browser.close();
    }
  });
}
test('Web launcher injects the addon and renders showcase roles with the collaboration cursors', { timeout: 45000 },
  t => watchShowcaseBrowser(t, templatesToReplay[0], false));

for (const template of templatesToReplay) {
  test(`official Godot Web editor builds ${template.id} in its real scene and replays without writes`, {
    skip: !realWeb && 'Set PLAYFORGE_REAL_SHOWCASE=1 to run the actual WASM editor',
    timeout: 240000,
  }, t => {
    assert.ok(fs.existsSync(path.join(root, 'OfficialGodot', 'vendor', 'godot.editor.wasm')),
      'Real Web test requires the Godot 4.7.2 vendor bundle.');
    return watchShowcaseBrowser(t, template, true);
  });
}
