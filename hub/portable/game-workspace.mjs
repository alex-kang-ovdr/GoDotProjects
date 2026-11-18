import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const catalogPath = 'catalog/games.json';
export const gameLockPath = 'catalog/webgames-lock.json';
const gameFile = /^games\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/.+$/;
const digestPattern = /^[a-f0-9]{64}$/;

export function regularFile(root, relative) {
  const parts = relative.split('/');
  if (!fs.lstatSync(root).isDirectory()) throw new Error('Game workspace is not a directory: ' + root);
  let filename = root;
  for (const [index, part] of parts.entries()) {
    if (!part || part === '.' || part === '..' || /[\\:]/.test(part)) throw new Error('Unsafe game workspace path: ' + relative);
    filename = path.join(filename, part);
    const stat = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (!stat) return null;
    if (stat.isSymbolicLink()) throw new Error('Game workspace path is a link: ' + filename);
    if (index === parts.length - 1) {
      if (!stat.isFile()) throw new Error('Game workspace path is not a regular file: ' + filename);
      return filename;
    }
    if (!stat.isDirectory()) throw new Error('Game workspace path is not a directory: ' + filename);
  }
  return null;
}

export function hashFile(filename) {
  return createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function inventory(entries) {
  const files = new Map(), seen = new Set();
  if (!Array.isArray(entries)) throw new Error('Invalid WebGames workspace inventory.');
  for (const { path: relative, sha256 } of entries) {
    if (typeof relative !== 'string' || !digestPattern.test(sha256) || (relative !== catalogPath && !gameFile.test(relative)) ||
      relative.split('/').some(name => !name || name === '.' || name === '..' || name.endsWith('.') || name !== name.trimEnd() || /[\\<>:"|?*\u0000-\u001f]/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) || seen.has(relative.toLowerCase())) {
      throw new Error('Invalid WebGames workspace file: ' + relative);
    }
    files.set(relative, sha256);
    seen.add(relative.toLowerCase());
  }
  if (!files.has(catalogPath)) throw new Error('WebGames workspace inventory requires its catalog.');
  return files;
}

export function readGameLock(root) {
  const filename = regularFile(root, gameLockPath);
  if (!filename) return null;
  const lock = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (lock.schemaVersion !== 1) throw new Error('Unsupported WebGames workspace inventory.');
  return inventory(lock.files);
}

export function writeGameLock(root, files) {
  const records = [...files].sort().map(relative => ({ path: relative, sha256: hashFile(regularFile(root, relative)) }));
  inventory(records);
  fs.writeFileSync(path.join(root, gameLockPath), JSON.stringify({ schemaVersion: 1, files: records }, null, 2) + '\n');
}

// Older SEA versions did not record ownership in the editable workspace. Adopt the
// cached bundle with the same catalog and the highest number of intact game files.
export function previousBundledGames(instanceRoot, workspaceRoot, appRoot) {
  const catalog = regularFile(workspaceRoot, catalogPath), cache = path.join(instanceRoot, 'app');
  if (!catalog || !fs.existsSync(cache) || fs.lstatSync(cache).isSymbolicLink()) return null;
  const currentCatalog = hashFile(catalog);
  let best = null, bestMatches = -1;
  for (const entry of fs.readdirSync(cache, { withFileTypes: true })) {
    const directory = path.join(cache, entry.name);
    if (!entry.isDirectory() || !digestPattern.test(entry.name) || directory === appRoot) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(regularFile(directory, 'bundle-manifest.json'), 'utf8'));
      if (manifest.payloadSha256 !== entry.name || !Array.isArray(manifest.files)) continue;
      const gameFiles = inventory(manifest.files.filter(file => file.path === catalogPath || gameFile.test(file.path)));
      if (gameFiles.get(catalogPath) !== currentCatalog) continue;
      let matches = 0;
      for (const [relative, expected] of gameFiles) {
        const cached = regularFile(directory, relative);
        if (!cached || hashFile(cached) !== expected) throw new Error('Changed prior application cache.');
        const local = regularFile(workspaceRoot, relative);
        if (local && hashFile(local) === expected) matches++;
      }
      if (matches > bestMatches) { best = gameFiles; bestMatches = matches; }
    } catch { /* This candidate cannot prove ownership. */ }
  }
  return best;
}

export function refreshGameWorkspace(source, destination, { previous = null, preserveEdits = false } = {}) {
  const desired = readGameLock(source);
  if (!desired) throw new Error('Missing generated WebGames workspace inventory.');
  destination = path.resolve(destination);
  const stage = path.join(destination, '.webgames-update');
  try { fs.mkdirSync(stage); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Game workspace already has an active or interrupted update: ' + stage);
    throw error;
  }
  const applied = [];
  let cleanup = true;
  try {
    const recorded = readGameLock(destination);
    const owned = recorded || previous || new Map();
    const changes = [], conflicts = [];
    for (const relative of new Set([...owned.keys(), ...desired.keys()])) {
      const before = owned.get(relative), after = desired.get(relative);
      const incoming = after ? regularFile(source, relative) : null;
      if (after && (!incoming || hashFile(incoming) !== after)) throw new Error('Generated WebGames file differs from its inventory: ' + relative);
      if (before === after && preserveEdits) continue;
      const current = regularFile(destination, relative);
      const actual = current ? hashFile(current) : undefined;
      if (actual === after) continue;
      if (actual !== before) { conflicts.push(relative); continue; }
      changes.push({ relative, incoming, actual });
    }
    if (conflicts.length) throw new Error(`WebGames update overlaps edited workspace files in ${destination}: ${conflicts.join(', ')}`);
    const incomingLock = regularFile(source, gameLockPath), currentLock = regularFile(destination, gameLockPath);
    const lockHash = currentLock ? hashFile(currentLock) : undefined;
    if (lockHash !== hashFile(incomingLock)) changes.push({ relative: gameLockPath, incoming: incomingLock, actual: lockHash });
    if (!changes.length) return;

    for (const [index, change] of changes.entries()) {
      if (change.incoming) fs.copyFileSync(change.incoming, path.join(stage, `new-${index}`));
    }
    try {
      for (const [index, change] of changes.entries()) {
        const target = path.join(destination, ...change.relative.split('/'));
        const current = regularFile(destination, change.relative);
        if ((current ? hashFile(current) : undefined) !== change.actual) throw new Error('Game workspace changed during update: ' + change.relative);
        const backup = path.join(stage, `old-${index}`);
        const operation = { target, backup, moved: false, installed: false };
        fs.mkdirSync(path.dirname(target), { recursive: true });
        applied.push(operation);
        if (current) { fs.renameSync(current, backup); operation.moved = true; }
        if (change.incoming) { fs.renameSync(path.join(stage, `new-${index}`), target); operation.installed = true; }
      }
    } catch (error) {
      cleanup = false;
      for (const operation of applied.reverse()) {
        if (operation.installed) fs.unlinkSync(operation.target);
        if (operation.moved) fs.renameSync(operation.backup, operation.target);
      }
      cleanup = true;
      throw error;
    }
  } finally {
    // This directory is a new, directly named child of the verified workspace.
    if (cleanup) fs.rmSync(stage, { recursive: true, force: true });
  }
}
