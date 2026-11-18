'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { zipFiles } = require('../Tools/export-godot-project.cjs');

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
const tappyTemplate = path.join(root, 'Templates', 'tappy-chicken');
const tappyAssets = require('../Templates/tappy-chicken/metadata.json').assetPaths;
const tabLocations = new Map([['2D', 609], ['3D', 665]]);
const nativeFollowButton = { x: 650, y: 727 };

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

function assertAuthoredFiles(directory, before, message) {
  const after = authoredFiles(directory);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), message);
  for (const [file, content] of Object.entries(before)) {
    assert.ok(content.equals(after[file]), message + ': ' + file);
  }
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

function stagedAssets(manifest) {
  return manifest.cues.filter(cue => cue.action === 'import').flatMap(cue => cue.staged || []);
}

function pendingPaths(manifest) {
  return [...stagedAssets(manifest), ...(manifest.bootstrapFiles || [])];
}

function assertImportReceipt(receipt, cue, first) {
  if (!cue) return;
  assert.equal(receipt?.state, 'done', JSON.stringify(receipt));
  assert.equal(receipt.first, first ? cue.staged.length : 0);
  assert.equal(receipt.count, cue.files.length);
  assert.deepEqual(receipt.files, cue.files);
}

function installEditorProbe(directory, fixture) {
  const probe = path.join(directory, 'addons', 'showcase_probe');
  fs.mkdirSync(probe);
  fs.writeFileSync(path.join(probe, 'plugin.cfg'), '[plugin]\nname="Showcase editor probe"\nscript="probe.gd"\n');
  fs.copyFileSync(path.join(__dirname, 'fixtures', fixture), path.join(probe, 'probe.gd'));
  const project = path.join(directory, 'project.godot');
  fs.writeFileSync(project, fs.readFileSync(project, 'utf8').replace(
    /^(enabled\s*=\s*PackedStringArray\()([^)]*)(\))/m,
    '$1$2, "res://addons/showcase_probe/plugin.cfg"$3',
  ));
  return probe;
}

function assertStorePack(catalog) {
  const pack = catalog.packs.find(pack => pack.id === 'tappy-flight');
  assert.deepEqual(pack.files, ['Assets/chicken-wing-up.svg', 'Assets/chicken-wing-down.svg', 'Assets/chicken-hit.svg']);
  assert.match(pack.title, /[가-힣]/);
  assert.match(pack.description, /[가-힣]/);
  return pack;
}

function assertOriginalPack(catalog) {
  const pack = catalog.packs.find(pack => pack.id === 'tappy-original');
  assert.deepEqual(pack.files, tappyAssets);
  assert.equal(pack.files.filter(file => file.endsWith('.svg')).length, 21);
  assert.equal(pack.files.filter(file => file.startsWith('Assets/Audio/') && file.endsWith('.tres')).length, 8);
  assert.match(pack.title, /[가-힣]/);
  return pack;
}

test('installed Godot imports and reimports the store pack in a blank project', {
  skip: fs.existsSync(nativeGodot) ? false : 'Native Godot unavailable', timeout: 60000,
}, t => {
  const directory = path.join(scratch(t), 'blank');
  const log = name => path.join(evidence, 'blank3d', name + '.log');
  run(process.execPath, ['Tools/prepare-template-showcase.cjs', 'blank3d', directory, 'ready'], log('native-prepare'));
  assert.ok(!fs.existsSync(path.join(directory, 'Assets')), 'Blank projects start without an Assets directory.');
  const pack = assertStorePack(JSON.parse(fs.readFileSync(path.join(directory, '.playforge-store.json'), 'utf8')));
  run(nativeGodot, ['--headless', '--path', directory, '--editor', '--import', '--quit'], log('native-import'));
  installEditorProbe(directory, 'showcase-store-probe.gd');
  const output = run(nativeGodot, ['--headless', '--path', directory, '--editor', 'res://scenes/main.tscn'], log('native-store'));
  assert.match(output, /PLAYFORGE_MANUAL_STORE_OK/);
  for (const file of pack.files) {
    const original = fs.readFileSync(path.join(root, 'Templates/tappy-chicken', file));
    assert.deepEqual(fs.readFileSync(path.join(directory, '.playforge-store', file)), original);
    assert.ok(fs.existsSync(path.join(directory, file + '.import')));
  }
});

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
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.playforge-showcase.json'), 'utf8'));
    assert.deepEqual(manifest, JSON.parse(fs.readFileSync(path.join(source, 'showcase.json'), 'utf8')));
    const staged = stagedAssets(manifest);
    if (staged.length) {
      const ready = path.join(path.dirname(directory), 'ready');
      run(process.execPath, ['Tools/prepare-template-showcase.cjs', templateId, ready, 'ready'], log('native-ready'));
      for (const asset of staged) {
        const expected = fs.readFileSync(path.join(source, asset));
        assert.deepEqual(fs.readFileSync(path.join(ready, asset)), expected, 'Ready projects have all runtime assets.');
        assert.deepEqual(fs.readFileSync(path.join(directory, '.playforge-import', asset)), expected);
        assert.ok(!fs.existsSync(path.join(directory, asset)), 'Godot must first see this file during the replay import.');
      }
    }
    assert.match(fs.readFileSync(path.join(directory, 'project.godot'), 'utf8'), /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
    const starter = fs.readFileSync(path.join(directory, 'scenes', 'main.tscn'), 'utf8');
    const original = fs.readFileSync(path.join(source, 'scenes', 'main.tscn'), 'utf8');
    assertBlankReplayScene(starter, original);
    const dependencies = manifest.bootstrapFiles || [];
    if (templateId === 'tappy-chicken') {
      assert.deepEqual(staged, tappyAssets);
      assert.deepEqual([...dependencies].sort(), ['Scripts/Game.gd', 'Scripts/Main.gd', sourceScene].sort());
      assert.ok(!fs.existsSync(path.join(directory, 'Assets')));
    }
    for (const file of dependencies) {
      assert.ok(!fs.existsSync(path.join(directory, file)), 'The initial editor scan must skip ' + file);
      const originalPath = file === sourceScene ? 'scenes/main.tscn' : file;
      assert.deepEqual(fs.readFileSync(path.join(directory, '.playforge-import', file)), fs.readFileSync(path.join(source, originalPath)));
    }
    const sceneDirectory = dependencies.includes(sourceScene) ? path.join(directory, '.playforge-import') : directory;
    assert.equal(fs.readFileSync(path.join(sceneDirectory, sourceScene), 'utf8'), original);
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'showcase-headless.gd'), path.join(directory, 'showcase-headless.gd'));
    run(nativeGodot, ['--headless', '--path', directory, '--editor', '--import', '--quit'], log('native-import'));
    for (const asset of staged) {
      assert.ok(!fs.existsSync(path.join(directory, asset + '.import')), 'The initial editor scan must skip staged files.');
    }
    const before = authoredFiles(directory);
    const output = run(nativeGodot, ['--headless', '--path', directory, '--script', 'res://showcase-headless.gd'], log('native-replay'));
    assert.match(output, /PLAYFORGE_SHOWCASE_HEADLESS_OK/);
    assertAuthoredFiles(directory, before, 'Playback must not modify authored files, assets or settings');

    const probe = installEditorProbe(directory, 'showcase-editor-probe.gd');
    if (staged.length) fs.copyFileSync(path.join(root, 'Godot/addons/playforge_platform/plugin.gd'), path.join(probe, 'sync_probe.gd'));
    const floatingProbe = templateId === 'tappy-chicken' && process.env.PLAYFORGE_SHOWCASE_FLOATING === '1';
    const displayArgs = floatingProbe ? ['--rendering-method', 'gl_compatibility'] : ['--headless'];
    const editorOutput = run(nativeGodot, [...displayArgs, '--path', directory, '--editor'],
      log(floatingProbe ? 'native-floating-dock' : 'native-editor-overlay'));
    if (floatingProbe) {
      assert.match(editorOutput, /PLAYFORGE_SHOWCASE_FLOATING_DOCK_OK/);
    } else {
      assert.match(editorOutput, /PLAYFORGE_SHOWCASE_DOCK_FOLLOW_OK/);
      assert.match(editorOutput, /PLAYFORGE_SHOWCASE_EDITOR_OVERLAY_OK/);
    }
    for (const asset of staged) {
      assert.deepEqual(fs.readFileSync(path.join(directory, asset)), fs.readFileSync(path.join(source, asset)));
      assert.equal(fs.existsSync(path.join(directory, asset + '.import')), asset.endsWith('.svg'), asset);
      assert.ok(!fs.existsSync(path.join(directory, '.playforge-import', asset)), 'The consumed stage must stop masking later user deletions.');
    }
    for (const file of dependencies) {
      const originalPath = file === sourceScene ? 'scenes/main.tscn' : file;
      assert.deepEqual(fs.readFileSync(path.join(directory, file)), fs.readFileSync(path.join(source, originalPath)));
      assert.ok(!fs.existsSync(path.join(directory, '.playforge-import', file)));
    }
    assert.deepEqual(fs.readFileSync(path.join(directory, 'scenes', 'main.tscn'), 'utf8'), starter,
      'Opening, advancing and restarting in the native editor do not implicitly save the starter scene.');
    assert.equal(fs.readFileSync(path.join(directory, sourceScene), 'utf8'), original);
    assertAuthoredFiles(source, sourceBefore, 'The shipped template remains byte-for-byte intact.');
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

test('official Godot Web editor manually imports a store pack into an empty blank3d project', {
  skip: !realWeb && 'Set PLAYFORGE_REAL_SHOWCASE=1 to run the actual WASM editor', timeout: 140000,
}, async t => {
  await withServer(t, async base => {
    const response = await fetch(base + '/api/platform/projects', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Blank store probe', template: 'blank3d' }),
    });
    assert.equal(response.status, 201);
    const project = await response.json();
    const id = project.project.id;
    assert.ok(!project.files.some(file => file.path.startsWith('Assets/')));
    const { chromium } = require('@playwright/test');
    const browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--enable-unsafe-swiftshader'] });
    const artifacts = path.join(evidence, 'blank3d');
    fs.mkdirSync(artifacts, { recursive: true });
    const log = [];
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      page.on('console', message => log.push(message.type() + ': ' + message.text()));
      page.on('pageerror', error => log.push('pageerror: ' + error.message));
      await page.goto(base + '/OfficialGodot/editor.html?project=' + id);
      await page.waitForFunction(() => typeof window.__playforgeOpenAssetStore === 'function', undefined, { timeout: 90000 });
      await page.evaluate(() => window.__playforgeOpenAssetStore());
      await page.waitForFunction(() => {
        const store = window.__playforgeAssetStoreState;
        return store?.visible && store.manual && store.selectedPack === 'tappy-flight' && store.importRect?.w > 0;
      }, undefined, { timeout: 10000 });
      const canvas = page.locator('#editor-canvas');
      const box = await canvas.boundingBox();
      const state = await page.evaluate(() => window.__playforgeAssetStoreState);
      await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-store-empty.png') });
      for (const first of [state.files.length, 0]) {
        const rect = await page.evaluate(() => window.__playforgeAssetStoreState.importRect);
        await canvas.click({ position: { x: box.width * (rect.x + rect.w / 2), y: box.height * (rect.y + rect.h / 2) } });
        await page.waitForFunction(first => {
          const receipt = window.__playforgeAssetStoreState?.receipt;
          return receipt?.state === 'done' && receipt.first === first;
        }, first, { timeout: 20000 });
        const receipt = await page.evaluate(() => window.__playforgeAssetStoreState.receipt);
        assert.equal(receipt.count, state.files.length);
        assert.deepEqual(receipt.files, state.files);
        log.push('Manual store receipt: ' + JSON.stringify(receipt));
      }
      await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-store-imported.png') });
      let saved;
      await t.waitFor(async () => {
        saved = indexedFiles((await getJson(base, '/api/platform/projects/' + id)).files);
        assert.ok(state.files.every(file => Object.hasOwn(saved, file)), 'The server must receive the new textures.');
      }, { interval: 250, timeout: 15000 });
      const expected = indexedFiles(project.files);
      for (const file of state.files) expected[file] = fs.readFileSync(path.join(root, 'Templates/tappy-chicken', file), 'utf8');
      const changed = [...new Set([...Object.keys(saved), ...Object.keys(expected)])].filter(name => saved[name] !== expected[name]);
      if (changed.includes('project.godot')) {
        fs.writeFileSync(path.join(artifacts, 'expected-project.godot'), expected['project.godot']);
        fs.writeFileSync(path.join(artifacts, 'synced-project.godot'), saved['project.godot']);
      }
      assert.deepEqual(changed, [], 'Only explicitly imported textures enter the blank project.');
      assert.doesNotMatch(log.join('\n'), /SCRIPT ERROR:|pageerror:|Failed to save IDB file system/);
    } finally {
      fs.writeFileSync(path.join(artifacts, 'actual-web-store.log'), log.join('\n'));
      await browser.close();
    }
  });
});

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
    const [replayAddon, chatAddon] = await Promise.all([
      getJson(base, '/api/platform-addon/replay'), getJson(base, '/api/platform-addon/agent-chat'),
    ]);
    assert.equal(replayAddon.manifest, undefined);
    assertStorePack(replayAddon.store.catalog);
    const pack = assertOriginalPack(replayAddon.store.catalog);
    for (const helper of ['showcase_store.gd', 'showcase_import_history.gd', 'showcase_feedback.gd', 'showcase_gestures.gd', 'showcase_game_launch.gd', 'showcase_repository.gd']) {
      assert.ok(replayAddon.files[helper], helper);
    }
    for (const file of pack.files) {
      assert.equal(replayAddon.store.sources[file], fs.readFileSync(path.join(tappyTemplate, file), 'utf8'));
    }
    assert.deepEqual(Object.keys(chatAddon.files).sort(), ['chat_panel.gd', 'plugin.cfg', 'plugin.gd', 'scene_commands.gd']);
    for (const { id: templateId } of templatesToReplay) {
      assert.equal(templates.templates.find(item => item.id === templateId).showcase, true);
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Templates', templateId, 'showcase.json'), 'utf8'));
      const addon = await getJson(base, '/api/platform-addon/showcase/' + templateId);
      assert.equal(addon.ok, true);
      assert.deepEqual(addon.store, replayAddon.store, 'All project modes use the same store originals.');
      assert.equal(manifest.schemaVersion, 3);
      assert.deepEqual(addon.manifest, manifest);
      assert.deepEqual(addon.stagedFiles, pendingPaths(manifest));
      if (templateId === 'tappy-chicken') {
        const cue = manifest.cues.find(cue => cue.action === 'import');
        assert.equal(cue.storePack, pack.id);
        assert.deepEqual(cue.files, pack.files);
        assert.deepEqual(cue.staged, pack.files);
        assert.ok(cue.at < manifest.cues.find(cue => cue.action === 'add').at);
      }
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

test('local Godot Asset Store publishes deterministic packs and filters its catalog', async t => {
  await withServer(t, async base => {
    const repo = '/api/asset-library';
    assert.deepEqual(await getJson(base, repo + '/'), { name: 'PlayForge Local' });
    const [tag] = await getJson(base, repo + '/tags/?featured_only=true');
    const [license] = await getJson(base, repo + '/licenses/');
    const listing = repo + '/search/query/?require_release=true&type=0&compatibility=4.7.2';
    const results = await getJson(base, listing + '&query=Tappy%20%23' + tag.slug + '&licenses=' + encodeURIComponent(license.type));
    assert.equal(results.count, 1);
    const [hit] = results.hits;
    assert.equal(hit.asset.slug, 'tappy-original');
    for (const filter of ['&query=%23unknown', '&type=1', '&compatibility=4.6.9', '&licenses=unknown', '&query=missing']) {
      const url = new URL(base + listing);
      for (const [key, value] of new URLSearchParams(filter.slice(1))) url.searchParams.set(key, value);
      assert.deepEqual(await getJson(base, url.pathname + url.search), { count: 0, hits: [] });
    }
    assert.deepEqual(await getJson(base, listing + '&page=2'), { count: 1, hits: [] });
    const details = await getJson(base, repo + '/assets/' + hit.asset.publisher.slug + '/' + hit.asset.slug + '/');
    assert.match(details.body_bbcode, /21.*8/);
    assert.equal(details.publisher.slug, hit.asset.publisher.slug);
    const [release] = await getJson(base, repo + '/releases/' + details.publisher.slug + '/' + details.slug + '/');
    assert.match(release.sha256, /^[a-f0-9]{64}$/);
    assert.equal(new URL(release.download_url).origin, base);
    const download = await fetch(release.download_url);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('content-type'), 'application/zip');
    const archive = Buffer.from(await download.arrayBuffer());
    assert.equal(createHash('sha256').update(archive).digest('hex'), release.sha256);
    assert.deepEqual(archive, zipFiles(tappyAssets.map(file => [
      'tappy-original/' + file, fs.readFileSync(path.join(tappyTemplate, file)),
    ])));
    assert.deepEqual(Buffer.from(await (await fetch(base + repo + '/packs/tappy-original.zip')).arrayBuffer()), archive);
    const legacy = assertStorePack((await getJson(base, '/api/platform-addon/replay')).store.catalog);
    assert.deepEqual(Buffer.from(await (await fetch(base + repo + '/packs/tappy-flight.zip')).arrayBuffer()),
      zipFiles(legacy.files.map(file => ['tappy-flight/' + file, fs.readFileSync(path.join(tappyTemplate, file))])));
    assert.equal((await fetch(base + repo + '/packs/tappy-original.zip?sha256=wrong')).status, 404);
    assert.equal((await fetch(base + repo + '/packs/tappy-original.zip', { method: 'POST' })).status, 405);
    const foreignStatus = await new Promise((resolve, reject) => {
      http.get(base + repo + '/', { headers: { Host: 'public.example' } }, response => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(foreignStatus, 403);
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

async function waitForScriptHighlight(page, phase) {
  const match = await page.waitForFunction(phase => {
    const iframe = document.getElementById('editor');
    const state = iframe.contentWindow.__playforgeShowcaseState;
    if (state?.focus?.scriptPhase !== phase || state.focus.screen !== 'Script') return false;
    const role = state.roles.find(role => role.id === 'script');
    const target = role?.target;
    if (target?.kind !== 'script_caret' || !target.label?.trim() ||
        state.roles.some(other => other.id !== role.id && other.target)) return false;
    const highlights = document.querySelectorAll('.showcase-target[data-showcase-target-role]');
    const highlight = highlights[0];
    if (highlights.length !== 1 || highlight.dataset.showcaseTargetRole !== role.id ||
        highlight.dataset.targetKind !== target.kind || highlight.dataset.targetLabel !== target.label ||
        getComputedStyle(highlight).pointerEvents !== 'none') return false;
    const canvas = iframe.contentDocument.getElementById('editor-canvas').getBoundingClientRect();
    const frame = iframe.getBoundingClientRect();
    const expectedX = frame.x + canvas.x + target.x * canvas.width;
    const expectedY = frame.y + canvas.y + target.y * canvas.height;
    const box = highlight.getBoundingClientRect();
    const tipX = frame.x + canvas.x + role.x * canvas.width;
    const tipY = frame.y + canvas.y + role.y * canvas.height;
    if (box.width <= 0 || box.height <= 0 ||
        Math.abs(box.x - expectedX) > 1 || Math.abs(box.y - expectedY) > 1 ||
        Math.abs(box.width - target.w * canvas.width) > 1 || Math.abs(box.height - target.h * canvas.height) > 1 ||
        tipX < box.left - 1 || tipX > box.right + 1 || tipY < box.top - 1 || tipY > box.bottom + 1) return false;
    return state.focus;
  }, phase, { timeout: 10000 });
  try {
    return await match.jsonValue();
  } finally {
    await match.dispose();
  }
}

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
        if (/SCRIPT ERROR:|Parse Error|Invalid call|Invalid access|Failed to save IDB file system/.test(message.text())) errors.push(message.text());
      });
      page.on('response', response => {
        const route = new URL(response.url()).pathname;
        if (route.startsWith('/api/asset-library/')) browserLog.push('Asset library: ' + response.status() + ' ' + route);
      });
      page.on('requestfailed', request => {
        const route = new URL(request.url()).pathname;
        if (route.startsWith('/api/asset-library/')) browserLog.push('Asset library failed: ' + request.failure()?.errorText + ' ' + route);
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
        const waitForShowcaseGame = () => editor.waitForFunction(() => {
          const launch = window.__playforgeShowcaseState?.gameLaunch;
          if (launch?.state === 'error') throw new Error(JSON.stringify(launch));
          const frame = document.getElementById('native-game-frame');
          const gameDocument = frame?.contentDocument;
          if (['failed', 'exited'].includes(gameDocument?.documentElement.dataset.gameState)) {
            throw new Error(gameDocument.getElementById('game-status').textContent);
          }
          return launch?.state === 'started' && new URL(frame.src).pathname === '/OfficialGodot/showcase-game.html'
            && gameDocument?.documentElement.dataset.gameState === 'running'
            && Boolean(gameDocument.getElementById('showcase-game-canvas'));
        }, undefined, { timeout: 60000 });
        const waitForPlaying = (minimum, maximum) => editor.waitForFunction(({ minimum, maximum }) => {
          const state = window.__playforgeShowcaseState;
          if (state?.importReceipt?.state === 'error') throw new Error(state.importReceipt.message);
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
              const idle = role.effect?.phase === 'idle';
              return {
                ...role,
                positioned: Math.abs(parseFloat(cursor.style.left) - (rect.left + canvas.left + role.x * canvas.width)) < 1
                  && Math.abs(parseFloat(cursor.style.top) - (rect.top + canvas.top + role.y * canvas.height)) < 1,
                inputTransparent: style.pointerEvents === 'none',
                visualStateShown: Number(style.opacity) === 1 && cursor.dataset.main === String(role.main)
                  && Number(style.getPropertyValue('--cursor-scale')) === role.scale,
                labelShown: cursor.querySelector('small')?.textContent === role.label,
                captionShown: idle ? cursor.querySelector('em')?.textContent === ''
                  : Boolean(role.caption?.trim()) && cursor.querySelector('em')?.textContent === role.caption,
              };
            });
            return roles.every(role => role?.positioned && role.labelShown && role.captionShown && role.visualStateShown) && roles;
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
          if (addon.manifest.cues.some(cue => cue.storePack)) {
            const packId = addon.manifest.cues.find(cue => cue.storePack).storePack;
            await editor.waitForFunction(packId => {
              const { store, replay } = window.__playforgeShowcaseState;
              return store?.visible && !store.manual && store.selectedPack === packId && replay.nodes.length === 0;
            }, packId, { timeout: 10000 });
            await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-guided-store-empty.png') });
          }
          const firstNodeAt = addon.manifest.cues.find(cue => cue.action === 'add').at;
          const sampleAt = Math.max(3, firstNodeAt + 0.1);
          await waitForPlaying(sampleAt, addon.manifest.duration);
          const earlier = await waitForRenderedRoles(sampleAt);
          const free = (await status()).state.focus;
          assert.equal(free.activeRole, '');
          assert.ok(earlier.every(role => role.opacity === 1 && !role.main && role.scale === 1));
          assert.ok(earlier.every(role => !role.target));
          assert.equal(await page.locator('.showcase-target:visible').count(), 0);
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
          const firstRun = (await status()).state;
          const importCue = addon.manifest.cues.find(cue => cue.action === 'import');
          assertImportReceipt(firstRun.importReceipt, importCue, true);
          if (importCue) assert.equal(firstRun.importReceipt.repository, base + '/api/asset-library');
          const finished = firstRun.replay;
          assertReplayScene(finished, expectedFiles['scenes/main.tscn'], landmark);
          if (templateId === 'tappy-chicken') {
            await waitForShowcaseGame();
            await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-game.png') });
          }
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
            assert.ok(focused.every(role => role.opacity === 1 && role.main === (role.id === 'script')
              && role.scale === (role.id === 'script' ? 1.5 : 1)));
            const open = await waitForScriptHighlight(page, 'open');
            assert.deepEqual(await editor.evaluate(() => window.__playforgeTestScreens), [alternateView, mainView, 'Script']);
            await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-script-open.png') });
            const paste = await waitForScriptHighlight(page, 'paste');
            assert.match(paste.scriptPath, /\/Main\.gd$/i);
            assert.equal(paste.scriptPath, open.scriptPath);
            assert.equal(paste.pasteCount, open.pasteCount + 1, 'One authored paste completes the full-script presentation.');
            assert.ok(paste.result?.trim() && paste.result !== open.result, 'Web reports the completed paste outcome.');
            await page.screenshot({ path: path.join(artifacts, 'actual-godot-web-showcase-script-paste.png') });
          }
          await waitForDone();
          await renderedRoles.first().waitFor({ state: 'hidden' });
          if (templateId === 'tappy-chicken') await waitForShowcaseGame();
          assert.equal(await page.locator('.showcase-target:visible').count(), 0);
          if (templateId !== 'tappy-chicken') {
            assert.deepEqual(await editor.evaluate(() => window.__playforgeTestScreens), [alternateView, mainView],
              'Playback must preserve the user’s editor view changes.');
          }
          const completed = await status();
          assertImportReceipt(completed.state.importReceipt, importCue, false);
          if (importCue) {
            assert.equal(completed.state.importReceipt.repository, base + '/api/asset-library');
            await editor.waitForFunction(async ({ id, pending }) => {
              const mount = '/home/web_user';
              if (!(await indexedDB.databases()).some(database => database.name === mount)) return false;
              return new Promise(resolve => {
                const request = indexedDB.open(mount);
                request.onerror = () => resolve(false);
                request.onsuccess = () => {
                  const db = request.result;
                  const keys = db.transaction('FILE_DATA').objectStore('FILE_DATA').getAllKeys();
                  keys.onerror = () => { db.close(); resolve(false); };
                  keys.onsuccess = () => {
                    db.close();
                    const files = new Set(keys.result);
                    const dir = mount + '/projects/' + id + '/';
                    resolve(pending.every(file => files.has(dir + file) &&
                      files.has(dir + file + '.import') === file.endsWith('.svg') &&
                      !files.has(dir + '.playforge-import/' + file)));
                  };
                };
              });
            }, { id, pending: pendingPaths(addon.manifest) }, { polling: 500, timeout: 15000 });
          }
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
        const baseline = indexedFiles(JSON.parse(engine.files[projectPath + '.playforge-platform.json']).baseFiles);
        assert.deepEqual(baseline, initialFiles, 'Collaboration starts from all original project files.');
        const catalog = JSON.parse(engine.files[projectPath + '.playforge-store.json']);
        assertStorePack(catalog);
        const pack = assertOriginalPack(catalog);
        for (const file of pack.files) {
          assert.equal(engine.files['/tmp/playforge-store/' + id + '/' + file], addon.store.sources[file]);
        }
        for (const file of pendingPaths(addon.manifest)) {
          assert.equal(engine.files[projectPath + file], undefined);
          assert.equal(engine.files['/tmp/playforge-import/' + id + '/' + file], initialFiles[file]);
          assert.equal(engine.files[projectPath + '.playforge-import/' + file], undefined);
        }
        const pluginSection = engine.files[projectPath + 'project.godot'].split('[editor_plugins]')[1].split(/^\[/m)[0];
        const enabledLines = pluginSection.match(/^enabled\s*=.*$/gm) || [];
        assert.equal(enabledLines.length, 1, 'Godot must read one authoritative plugin setting.');
        assert.match(enabledLines[0], /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
        assert.match(enabledLines[0], /res:\/\/addons\/playforge_platform\/plugin\.cfg/);
        for (const [name, content] of Object.entries(addon.files)) {
          assert.equal(engine.files[projectPath + 'addons/playforge_showcase/' + name], content, name);
        }
        await editor.evaluate(() => {
          const state = { activeRole: 'script', focus: { activeRole: 'script', screen: 'Script', scriptPhase: 'paste' }, roles: [
            { id: 'gui', label: 'GUI', color: '#ce8afa', caption: '점수판 배치', x: 0.25, y: 0.25, opacity: 1, main: false, scale: 1 },
            { id: 'script', label: '스크립트', color: '#eaa745', caption: '코드 전체 붙여넣기', x: 0.4, y: 0.4, opacity: 1, main: true, scale: 1.5,
              target: { kind: 'script_caret', label: 'Main.gd', x: 0.39, y: 0.38, w: 0.04, h: 0.03 } },
          ] };
          window.__playforgeShowcaseState = state;
          window.__playforgeShowcaseChanged(state);
        });
        await renderedRoles.filter({ hasText: '점수판 배치' }).waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
          const regular = document.querySelector('[data-showcase-role="gui"][data-main="false"]');
          const followed = document.querySelector('[data-showcase-role="script"][data-main="true"]');
          return regular && followed && Number(getComputedStyle(regular).opacity) === 1
            && Number(getComputedStyle(followed).opacity) === 1
            && getComputedStyle(regular.querySelector('span')).width === '16px'
            && getComputedStyle(followed.querySelector('span')).width === '24px';
        });
        await waitForScriptHighlight(page, 'paste');
        await page.setViewportSize({ width: 1200, height: 820 });
        await waitForScriptHighlight(page, 'paste');
        await editor.evaluate(() => {
          const state = window.__playforgeShowcaseState;
          const script = state.roles.find(role => role.id === 'script');
          script.effect = { phase: 'idle' };
          window.__playforgeShowcaseChanged(state);
        });
        await page.waitForFunction(() => {
          const script = document.querySelector('[data-showcase-role="script"][data-phase="idle"]');
          const gui = document.querySelector('[data-showcase-role="gui"]');
          return script?.querySelector('em').textContent === '' && script.querySelector('small').textContent === '스크립트'
            && gui?.querySelector('em').textContent === '점수판 배치' && !document.querySelector('[data-showcase-target-role="script"]');
        });
        await editor.evaluate(() => window.__playforgeShowcaseChanged({ roles: [] }));
        await renderedRoles.first().waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.showcase-target:visible').count(), 0);

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
        assert.deepEqual(JSON.parse(regularEngine.files[regularPath + '.playforge-store.json']), addon.store.catalog);
        for (const file of pack.files) {
          assert.equal(regularEngine.files['/tmp/playforge-store/' + ordinary.project.id + '/' + file], addon.store.sources[file]);
        }
        for (const file of pendingPaths(addon.manifest)) {
          assert.equal(regularEngine.files[regularPath + file], expectedFiles[file]);
          assert.equal(regularEngine.files['/tmp/playforge-import/' + ordinary.project.id + '/' + file], undefined);
        }
        assert.equal(regularEngine.files[regularPath + 'scenes/main.tscn'], expectedFiles['scenes/main.tscn']);
        assert.equal(regularEngine.files[regularPath + '.playforge-showcase.json'], undefined);
        const readyConfig = regularEngine.files[regularPath + 'project.godot'];
        assert.match(readyConfig, /res:\/\/addons\/playforge_showcase\/plugin\.cfg/);
        assert.match(readyConfig, /res:\/\/addons\/playforge_agent_chat\/plugin\.cfg/);
        assert.ok(regularEngine.files[regularPath + 'addons/playforge_showcase/plugin.gd']);
        assert.ok(regularEngine.files[regularPath + 'addons/playforge_agent_chat/plugin.gd']);
        const [editableAsset] = stagedAssets(addon.manifest);
        if (editableAsset) {
          const response = await fetch(base + '/api/platform/projects', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Previously edited showcase', template: templateId, mode: 'showcase' }),
          });
          assert.equal(response.status, 201);
          const separate = await response.json();
          const previousFiles = indexedFiles(separate.files);
          const updated = expectedFiles[editableAsset] + '\n<!-- retained user edit -->';
          const files = separate.files.map(file => file.path === editableAsset ? { ...file, content: updated } : file);
          const saved = await fetch(base + '/api/platform/projects/' + separate.project.id, {
            method: 'PUT', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ baseRevision: separate.revision, files }),
          });
          assert.equal(saved.status, 200);
          await editor.goto(base + '/OfficialGodot/editor.html?project=' + separate.project.id + '&showcase=1');
          await editor.waitForFunction(() => window.__showcaseTestFiles);
          const restored = await editor.evaluate(() => window.__showcaseTestFiles);
          const directory = '/home/web_user/projects/' + separate.project.id + '/';
          assert.equal(restored[directory + editableAsset], updated);
          assert.equal(restored['/tmp/playforge-import/' + separate.project.id + '/' + editableAsset], undefined);
          for (const file of addon.manifest.bootstrapFiles || []) {
            assert.equal(restored[directory + file], previousFiles[file]);
            assert.equal(restored['/tmp/playforge-import/' + separate.project.id + '/' + file], undefined);
          }
        }
        await page.route('**/api/platform-addon/replay', async route => {
          const response = await route.fetch();
          const older = await response.json();
          delete older.store;
          delete older.files['showcase_store.gd'];
          delete older.files['showcase_import_history.gd'];
          delete older.files['showcase_feedback.gd'];
          delete older.files['showcase_gestures.gd'];
          delete older.files['showcase_game_launch.gd'];
          delete older.files['showcase_repository.gd'];
          await route.fulfill({ response, json: older });
        });
        const blankId = (await existing.json()).project.id;
        await editor.goto(base + '/OfficialGodot/editor.html?project=' + blankId);
        await editor.waitForFunction(() => window.__showcaseTestFiles);
        const legacyFiles = await editor.evaluate(() => window.__showcaseTestFiles);
        assert.deepEqual(JSON.parse(legacyFiles['/home/web_user/projects/' + blankId + '/.playforge-store.json']), { packs: [] });
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

test('installed Godot repeatedly undoes and redoes the finished Tappy scene with an inspected node', {
  skip: fs.existsSync(nativeGodot) ? false : 'Native Godot unavailable', timeout: 60000,
}, t => {
  const directory = path.join(scratch(t), 'tappy');
  const log = name => path.join(evidence, 'tappy-chicken', name + '.log');
  run(process.execPath, ['Tools/prepare-template-showcase.cjs', 'tappy-chicken', directory], log('undo-prepare'));
  run(nativeGodot, ['--headless', '--path', directory, '--editor', '--import', '--quit'], log('undo-import'));
  installEditorProbe(directory, 'showcase-undo-probe.gd');
  const output = run(nativeGodot, ['--headless', '--path', directory, '--editor', 'res://scenes/main.tscn'], log('undo-editor'));
  assert.match(output, /TAPPY_UNDO_STRESS_OK/);
});
