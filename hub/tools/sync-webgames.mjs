import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseFragment, serialize } from 'parse5';
import launcher from '../portable/launcher.cjs';
import { catalogPath, refreshGameWorkspace, regularFile, writeGameLock } from '../portable/game-workspace.mjs';
import { projectRoot, readCatalog, staticExtensions } from './build.mjs';
import { syncLocales } from './sync-locales.mjs';

export const webGamesRoot = fileURLToPath(new URL('../../games/', import.meta.url));
const identifier = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const legacyScriptType = 'application/x-playhub-script';
const scriptTypes = new Set(['', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']);
const sourceExtensions = new Set([...staticExtensions, '.md']);

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
}

function gameCatalog(root) {
  const filename = regularFile(root, 'catalog.json');
  if (!filename) throw new Error('Missing WebGames catalog.json in ' + root);
  const source = readJson(filename);
  if (source.schemaVersion !== 1 || !Array.isArray(source.entries) || !source.entries.length || source.entries.length > 1000) throw new Error('Invalid WebGames catalog.');
  const ids = new Set();
  for (const entry of source.entries) {
    if (typeof entry.id !== 'string' || entry.id.length > 64 || !identifier.test(entry.id) || entry.path !== entry.id || ids.has(entry.id) ||
      typeof entry.enabled !== 'boolean' || !Number.isSafeInteger(entry.priority) || !['imported', 'builtin'].includes(entry.kind)) {
      throw new Error('Invalid or duplicate WebGames catalog entry: ' + entry.id);
    }
    ids.add(entry.id);
  }
  return source.entries;
}

function copyGameFiles(source, destination, files, base) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const input = path.join(source, entry.name);
    if (entry.isSymbolicLink()) throw new Error('WebGames runtime cannot contain links: ' + input);
    if (entry.name === '_playhub' || entry.name === 'game.manifest.json') throw new Error('Reserved PlayHub path: ' + input);
    const relative = `${base}/${entry.name}`;
    launcher.safeRelative(relative);
    if (entry.isDirectory()) { copyGameFiles(input, destination, files, relative); continue; }
    if (!entry.isFile()) throw new Error('WebGames runtime contains a special file: ' + input);
    if (!sourceExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const target = path.join(destination, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(input, target, fs.constants.COPYFILE_EXCL);
    files.add(relative);
  }
}

function legacyEntry(root, id, files) {
  const base = `games/${id}`;
  const index = regularFile(root, base + '/index.html');
  if (!index) throw new Error('Missing Web/index.html: ' + id);
  const document = parse(fs.readFileSync(index, 'utf8'));
  const head = document.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'head');
  let count = 0;
  function deferScripts(node) {
    if (node.tagName === 'script') {
      const type = node.attrs.find(attr => attr.name === 'type')?.value.trim().toLowerCase() ?? '';
      if (['module', 'importmap'].includes(type)) throw new Error(`${id} requires its classic standalone HTML entry for PlayHub’s sandbox.`);
      if (!scriptTypes.has(type)) return;
      const src = node.attrs.find(attr => attr.name === 'src')?.value;
      let url = src;
      if (src) {
        const file = decodeURIComponent(src.split(/[?#]/, 1)[0]).replace(/^\.\//, '');
        launcher.safeRelative(file);
        if (!files.has(`${base}/${file}`)) throw new Error(`Missing local script ${src} in ${id}.`);
      } else {
        url = `_playhub/script-${count + 1}.js`;
        const relative = `${base}/${url}`, target = path.join(root, ...relative.split('/'));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, node.childNodes.map(child => child.value).join(''), { flag: 'wx' });
        files.add(relative);
      }
      node.attrs = [{ name: 'type', value: legacyScriptType }, { name: 'data-src', value: url }];
      node.childNodes = [];
      count++;
      return;
    }
    node.childNodes?.forEach(deferScripts);
  }
  deferScripts(document);
  if (!count) throw new Error('Legacy game entry has no executable scripts: ' + id);
  const boot = parseFragment(`<script defer src="/shared/sdk.js"></script><script defer src="/shared/legacy.js" data-game-id="${id}"></script>`);
  for (const node of boot.childNodes) { node.parentNode = head; head.childNodes.push(node); }
  fs.writeFileSync(index, serialize(document));
}

export function syncWebGames({ webgames = webGamesRoot, root = projectRoot } = {}) {
  const source = launcher.assertNoLinks(webgames), destination = launcher.assertNoLinks(root);
  if (!fs.statSync(source).isDirectory() || !fs.statSync(destination).isDirectory()) throw new Error('WebGames and PlayHub roots must be directories.');
  const entries = gameCatalog(source);
  syncLocales({ root: destination, webgames: source });
  const enabled = entries.filter(entry => entry.enabled).sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const stage = fs.mkdtempSync(path.join(destination, '.webgames-sync-'));
  const files = new Set([catalogPath]);
  try {
    for (const { id } of enabled) {
      const manifestFile = regularFile(source, `${id}/game.manifest.json`);
      const entryFile = regularFile(source, `${id}/Web/index.html`);
      if (!manifestFile || !entryFile) throw new Error('Missing WebGames manifest or Web/index.html: ' + id);
      const { integration, ...manifest } = readJson(manifestFile);
      if (!['native-sdk', 'legacy-localstorage'].includes(integration)) throw new Error('Invalid PlayHub integration: ' + id);
      manifest.seo ??= { title: manifest.title, description: manifest.summary, indexable: false };
      const base = `games/${id}`;
      copyGameFiles(path.dirname(entryFile), stage, files, base);
      const manifestPath = base + '/game.manifest.json';
      fs.writeFileSync(path.join(stage, ...manifestPath.split('/')), JSON.stringify(manifest, null, 2) + '\n');
      files.add(manifestPath);
      if (integration === 'legacy-localstorage') legacyEntry(stage, id, files);
    }
    fs.mkdirSync(path.join(stage, 'catalog'));
    fs.writeFileSync(path.join(stage, catalogPath), JSON.stringify({
      schemaVersion: 1,
      entries: enabled.map(({ id }) => ({ id, path: `games/${id}`, enabled: true }))
    }, null, 2) + '\n');
    readCatalog(stage);
    writeGameLock(stage, files);
    refreshGameWorkspace(stage, destination);
    return { ok: true, webgames: source, root: destination, games: enabled.map(entry => entry.id), excluded: entries.filter(entry => !entry.enabled).map(entry => entry.id), files: files.size };
  } finally {
    // The staging directory was created as a direct child of the verified destination.
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--webgames' || args[1].startsWith('--'))) throw new Error('Usage: node tools/sync-webgames.mjs [--webgames <WebGames directory>]');
    console.log(JSON.stringify(syncWebGames({ webgames: args[1] }), null, 2));
  } catch (error) {
    console.error('WebGames sync failed: ' + error.message);
    process.exitCode = 1;
  }
}
