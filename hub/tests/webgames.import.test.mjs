import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync, gunzipSync } from 'node:zlib';
import { syncWebGames } from '../tools/sync-webgames.mjs';
import { build } from '../tools/build.mjs';
import { catalogPath, gameLockPath, hashFile, previousBundledGames, refreshGameWorkspace } from '../portable/game-workspace.mjs';

function put(root, name, text) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}
const json = value => JSON.stringify(value, null, 2);
const get = (root, name) => fs.readFileSync(path.join(root, name), 'utf8');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-webgames-'));
  assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const webgames = path.join(directory, 'WebGames'), root = path.join(directory, 'PlayHub');
  const local = { ko: '게임 안내', en: 'Game instructions' };
  const entries = [
    { id: 'original', path: 'original', enabled: true, priority: 0, kind: 'builtin' },
    { id: 'imported', path: 'imported', enabled: true, priority: 25, kind: 'imported' },
    { id: 'excluded', path: 'excluded', enabled: false, priority: 100, kind: 'imported' }
  ];
  put(webgames, 'catalog.json', json({ schemaVersion: 1, entries }));
  for (const { id, kind } of entries) {
    put(webgames, `${id}/game.manifest.json`, json({
      id, slug: id, entry: 'index.html', integration: kind === 'builtin' ? 'native-sdk' : 'legacy-localstorage',
      updatedOn: kind === 'imported' ? '2026-11-17' : undefined,
      publishedOn: id === 'imported' ? '2026-11-10' : undefined,
      title: local, summary: local, instructions: local, seo: { title: local, description: local, indexable: true },
      media: { cover: 'assets/cover.svg' }, capabilities: { workers: false, externalNetwork: [] }
    }));
    put(webgames, `${id}/Web/index.html`, '<!doctype html><html><head><meta charset=utf-8><title>Test</title></head><body><script src="app.js?v=2"></script><script>window.init = true;</script><script type="application/json">{"info":"keep this"}</script></body></html>');
    put(webgames, `${id}/Web/app.js`, 'window.appLoaded = true;');
    put(webgames, `${id}/Web/assets/cover.svg`, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    put(webgames, `${id}/Source/secret.js`, 'source only');
    put(webgames, `${id}/Archive/old.html`, 'archive only');
  }
  put(root, 'web/user/index.html', '<html><head><title>PlayHub</title></head><body><!-- SEO_CONTENT --></body></html>');
  put(root, 'web/admin/index.html', '<html><head><title>Admin</title></head></html>');
  for (const file of ['legacy.js', 'sdk.js']) put(root, `shared/${file}`, '/* mount */');
  return { root, webgames, entries };
}

test('build retries transient directory locks and restores the previous site after persistent locks', t => {
  const { root, webgames } = fixture(t);
  syncWebGames({ root, webgames });
  build({ root });
  const original = fs.renameSync;
  let failures = 2;
  try {
    fs.renameSync = (from, to) => {
      if (path.basename(from).startsWith('.dist-') && failures-- > 0) throw Object.assign(new Error('scanner lock'), { code: 'EPERM' });
      return original(from, to);
    };
    assert.equal(build({ root }).ok, true);
    const previous = get(root, 'dist/user/index.html');
    put(root, 'web/user/index.html', '<html><head></head><body>Next version</body></html>');
    fs.renameSync = (from, to) => {
      if (path.basename(from).startsWith('.dist-')) throw Object.assign(new Error('persistent scanner lock'), { code: 'EBUSY' });
      return original(from, to);
    };
    assert.throws(() => build({ root }), /persistent scanner lock/);
    assert.equal(get(root, 'dist/user/index.html'), previous);
  } finally { fs.renameSync = original; }
});

test('WebGames sync generates an ordered playable catalog, protects authored source, and adapts only legacy entries', t => {
  const { root, webgames } = fixture(t);
  const original = get(webgames, 'imported/Web/index.html');
  const result = syncWebGames({ root, webgames });
  assert.deepEqual(result.games, ['imported', 'original']);
  assert.deepEqual(result.excluded, ['excluded']);
  const catalog = JSON.parse(get(root, catalogPath));
  assert.deepEqual(catalog.entries.map(entry => entry.path), ['games/imported', 'games/original']);
  assert.equal(get(webgames, 'imported/Web/index.html'), original);
  assert.equal(get(root, 'games/original/index.html'), original);
  assert.equal(get(root, 'games/imported/_playhub/script-2.js'), 'window.init = true;');
  const legacy = get(root, 'games/imported/index.html');
  assert.match(legacy, /type="application\/x-playhub-script" data-src="app.js\?v=2"/);
  assert.match(legacy, /data-game-id="imported"/);
  assert.match(legacy, /type="application\/json"/);
  for (const name of ['games/excluded', 'games/imported/Source', 'games/imported/Archive']) assert.equal(fs.existsSync(path.join(root, name)), false);
  assert.equal(build({ root }).games, 2);
  assert.equal(JSON.parse(get(root, 'dist/user/games/imported/game.manifest.json')).updatedOn, '2026-11-17');
  assert.equal(JSON.parse(get(root, 'dist/user/games/imported/game.manifest.json')).publishedOn, '2026-11-10');
  assert.equal(Object.hasOwn(JSON.parse(get(root, 'dist/user/games/original/game.manifest.json')), 'updatedOn'), false);
  assert.equal(Object.hasOwn(JSON.parse(get(root, 'dist/user/games/original/game.manifest.json')), 'publishedOn'), false);
  assert.match(get(root, 'dist/user/games/imported/index.html'), /src="vendor\/legacy\.js"/);
  assert.equal(fs.existsSync(path.join(root, 'dist/user', gameLockPath)), false);
  const lock = get(root, gameLockPath);
  assert.deepEqual(syncWebGames({ root, webgames }), result);
  assert.equal(get(root, gameLockPath), lock);
});

test('WebGames sync rejects invalid public update dates without replacing the current game', t => {
  const { root, webgames } = fixture(t);
  syncWebGames({ root, webgames });
  const target = 'games/imported/game.manifest.json';
  const prior = get(root, target);
  const source = 'imported/game.manifest.json';
  put(webgames, source, json({ ...JSON.parse(get(webgames, source)), updatedOn: '2026-11-31' }));
  assert.throws(() => syncWebGames({ root, webgames }), /Invalid updatedOn date: imported/);
  assert.equal(get(root, target), prior);
  put(webgames, source, json({ ...JSON.parse(get(webgames, source)), updatedOn: '2026-11-17', publishedOn: '2026-02-29' }));
  assert.throws(() => syncWebGames({ root, webgames }), /Invalid publishedOn date: imported/);
  assert.equal(get(root, target), prior);
});

test('sync refuses overlapping edits and unsafe roots without replacing its previous catalog', t => {
  const { root, webgames, entries } = fixture(t);
  syncWebGames({ root, webgames });
  const prior = get(root, catalogPath);
  put(root, 'games/imported/app.js', 'custom edit');
  put(webgames, 'imported/Web/app.js', 'upstream edit');
  assert.throws(() => syncWebGames({ root, webgames }), /overlaps edited workspace files.*games\/imported\/app\.js/);
  assert.equal(get(root, catalogPath), prior);
  assert.equal(get(root, 'games/imported/app.js'), 'custom edit');
  entries[0].path = '../outside';
  put(webgames, 'catalog.json', json({ schemaVersion: 1, entries }));
  assert.throws(() => syncWebGames({ root, webgames }), /Invalid or duplicate WebGames catalog entry/);
  assert.equal(get(root, catalogPath), prior);
});

test('portable refresh applies upstream changes and exclusions while retaining unrelated local edits', t => {
  const { root, webgames, entries } = fixture(t);
  const instance = path.join(path.dirname(root), 'editable-instance');
  fs.mkdirSync(instance);
  syncWebGames({ root, webgames });
  refreshGameWorkspace(root, instance, { preserveEdits: true });
  put(instance, 'games/original/app.js', 'custom native edit');
  put(instance, 'games/local-extra/index.html', 'additional local game');

  entries[1].enabled = false;
  put(webgames, 'catalog.json', json({ schemaVersion: 1, entries }));
  syncWebGames({ root, webgames });
  refreshGameWorkspace(root, instance, { preserveEdits: true });
  assert.equal(get(instance, 'games/original/app.js'), 'custom native edit');
  assert.equal(get(instance, 'games/local-extra/index.html'), 'additional local game');
  assert.equal(fs.existsSync(path.join(instance, 'games/imported/app.js')), false);
  assert.deepEqual(JSON.parse(get(instance, catalogPath)).entries.map(entry => entry.id), ['original']);
});

test('portable refresh can adopt verified old binary content but refuses overwritten legacy edits', t => {
  const { root, webgames } = fixture(t);
  syncWebGames({ root, webgames });
  const instance = path.join(path.dirname(root), 'old-instance');
  const hash = 'a'.repeat(64), cache = path.join(instance, 'app', hash), workspace = path.join(instance, 'workspace');
  const files = [catalogPath, 'games/original/app.js'];
  for (const base of [cache, workspace]) {
    put(base, catalogPath, json({ schemaVersion: 1, entries: [{ id: 'original', path: 'games/original', enabled: true }] }));
    put(base, 'games/original/app.js', 'from prior binary');
  }
  put(cache, 'bundle-manifest.json', json({ payloadSha256: hash, files: files.map(relative => ({ path: relative, sha256: hashFile(path.join(cache, relative)) })) }));
  const previous = previousBundledGames(instance, workspace, root);
  assert.equal(previous.size, 2);
  put(workspace, 'games/original/app.js', 'user edit');
  assert.throws(() => refreshGameWorkspace(root, workspace, { previous, preserveEdits: true }), /overlaps edited workspace files/);
  assert.equal(get(workspace, 'games/original/app.js'), 'user edit');
  put(workspace, 'games/original/app.js', 'from prior binary');
  refreshGameWorkspace(root, workspace, { previous, preserveEdits: true });
  assert.equal(get(workspace, 'games/original/app.js'), get(root, 'games/original/app.js'));
  assert.equal(get(workspace, catalogPath), get(root, catalogPath));
});

test('legacy adapter hydrates before scripts run and produces lossless bounded storage snapshots', async () => {
  const stored = [['save-slot', 'restored'], ['difficulty', 'hard']];
  const value = { gameId: 'imported', schemaVersion: 1, legacyStorageGzip: gzipSync(json(stored)).toString('base64') };
  let finishLoad, markReady, snapshot;
  const load = new Promise(resolve => { finishLoad = resolve; });
  const ready = new Promise(resolve => { markReady = resolve; });
  const executed = [];
  const GameSDK = {
    load: () => load, ready: markReady, event: () => Promise.resolve(),
    onSnapshot: capture => { snapshot = capture; }
  };
  const sandbox = { GameSDK, location: { hash: '#nonce=abc' }, parent: {}, TextEncoder, TextDecoder, URLSearchParams, Blob, Uint8Array, DOMException, CompressionStream, DecompressionStream, atob, btoa, setTimeout: () => 1 };
  sandbox.window = sandbox;
  sandbox.document = {
    currentScript: { dataset: { gameId: 'imported' } },
    querySelectorAll: () => ['app.js', 'main.js'].map(src => ({ dataset: { src }, replaceWith(script) {
      executed.push([script.src, sandbox.localStorage.getItem('save-slot')]);
      script.onload();
    } })),
    createElement: () => ({})
  };
  vm.runInNewContext(fs.readFileSync(new URL('../shared/legacy.js', import.meta.url), 'utf8'), sandbox);
  assert.deepEqual(executed, []);
  finishLoad({ value });
  await ready;
  assert.deepEqual(executed, [['app.js', 'restored'], ['main.js', 'restored']]);
  assert.deepEqual(JSON.parse(JSON.stringify(await snapshot())), { gameId: 'imported', schemaVersion: 1, legacyStorage: stored });
  const large = 'multi-key saved state '.repeat(12000);
  sandbox.localStorage.setItem('large', large);
  sandbox.localStorage.removeItem('difficulty');
  sandbox.sessionStorage.setItem('session-only', 'temporary');
  const compressed = await snapshot();
  assert.ok(JSON.stringify(compressed).length < 65536);
  assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(compressed.legacyStorageGzip, 'base64'))), [['save-slot', 'restored'], ['large', large]]);
});
