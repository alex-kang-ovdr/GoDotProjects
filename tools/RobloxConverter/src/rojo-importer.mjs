import fs from 'node:fs';
import path from 'node:path';

const SERVICE_CLASS_NAMES = new Set([
  'Workspace',
  'Players',
  'Lighting',
  'ReplicatedStorage',
  'ReplicatedFirst',
  'ServerScriptService',
  'ServerStorage',
  'StarterGui',
  'StarterPack',
  'StarterPlayer',
  'StarterPlayerScripts',
  'StarterCharacterScripts',
  'SoundService',
  'TextChatService'
]);

function classifyScriptFilename(filename) {
  if (/^init\.server\.luau?$/i.test(filename)) return { isInit: true, className: 'Script', baseName: null };
  if (/^init\.client\.luau?$/i.test(filename)) return { isInit: true, className: 'LocalScript', baseName: null };
  if (/^init\.luau?$/i.test(filename)) return { isInit: true, className: 'ModuleScript', baseName: null };
  let m;
  if ((m = filename.match(/^(.+)\.server\.luau?$/i))) return { isInit: false, className: 'Script', baseName: m[1] };
  if ((m = filename.match(/^(.+)\.client\.luau?$/i))) return { isInit: false, className: 'LocalScript', baseName: m[1] };
  if ((m = filename.match(/^(.+)\.luau?$/i))) return { isInit: false, className: 'ModuleScript', baseName: m[1] };
  return null;
}

export function importRojoProject(projectJsonPath) {
  const absJson = path.resolve(projectJsonPath);
  const projectDir = path.dirname(absJson);
  const spec = JSON.parse(fs.readFileSync(absJson, 'utf8'));

  let refSeq = 1;
  const nextRef = () => `ROJO${String(refSeq++).padStart(8, '0')}`;

  const root = {
    schema: 'playforge.roblox.ir.v1',
    source: absJson,
    sourceFormat: 'rojo',
    projectName: spec.name || path.basename(projectDir),
    robloxXmlVersion: 'rojo-project',
    unitPolicy: {
      robloxUnit: 'stud',
      godotUnit: 'meter',
      metersPerStud: 0.28,
      handedness: 'left_y_up_to_right_y_up'
    },
    stats: {
      totalInstances: 0,
      classCounts: {},
      scriptCount: 0,
      partCount: 0
    },
    diagnostics: [],
    children: []
  };

  function track(node) {
    root.stats.totalInstances++;
    root.stats.classCounts[node.className] = (root.stats.classCounts[node.className] || 0) + 1;
    if (['Script', 'LocalScript', 'ModuleScript'].includes(node.className)) root.stats.scriptCount++;
    if (['Part', 'SpawnLocation', 'MeshPart'].includes(node.className)) root.stats.partCount++;
    return node;
  }

  function loadFsPath(fsPath, displayName, { explicitPath = false } = {}) {
    const relPath = path.relative(projectDir, fsPath).replace(/\\/g, '/');
    if (!fs.existsSync(fsPath)) {
      root.diagnostics.push({
        severity: 'warning',
        code: 'ROJO_MISSING_PATH',
        name: displayName,
        path: relPath,
        reason: `Rojo $path '${relPath}' for '${displayName}' does not exist — skipped`
      });
      return null;
    }
    const stat = fs.statSync(fsPath);
    if (stat.isFile()) {
      const info = classifyScriptFilename(path.basename(fsPath));
      if (!info) {
        if (explicitPath) {
          root.diagnostics.push({
            severity: 'warning',
            code: 'ROJO_UNSUPPORTED_FILE',
            name: displayName,
            path: relPath,
            reason: `Rojo $path '${relPath}' for '${displayName}' is not a supported Luau/Lua script file — skipped`
          });
        }
        return null;
      }
      const source = fs.readFileSync(fsPath, 'utf8').replace(/\r\n/g, '\n');
      return track({
        className: info.className,
        referent: nextRef(),
        name: displayName || info.baseName,
        properties: { Name: displayName || info.baseName, Source: source },
        sourceFile: relPath,
        children: []
      });
    }
    if (!stat.isDirectory()) {
      if (explicitPath) {
        root.diagnostics.push({
          severity: 'warning',
          code: 'ROJO_UNSUPPORTED_PATH',
          name: displayName,
          path: relPath,
          reason: `Rojo $path '${relPath}' for '${displayName}' is neither a file nor a directory — skipped`
        });
      }
      return null;
    }

    const entries = fs.readdirSync(fsPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    let dirClass = 'Folder';
    let dirSource = null;
    let dirSourceFile = null;
    for (const e of entries) {
      if (e.isFile()) {
        const info = classifyScriptFilename(e.name);
        if (info?.isInit) {
          dirClass = info.className;
          const full = path.join(fsPath, e.name);
          dirSource = fs.readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
          dirSourceFile = path.relative(projectDir, full).replace(/\\/g, '/');
          break;
        }
      }
    }

    const props = { Name: displayName };
    if (dirSource !== null) props.Source = dirSource;
    const node = track({
      className: dirClass,
      referent: nextRef(),
      name: displayName,
      properties: props,
      ...(dirSourceFile ? { sourceFile: dirSourceFile } : {}),
      children: []
    });

    for (const e of entries) {
      const childFull = path.join(fsPath, e.name);
      if (e.isDirectory()) {
        const childDir = loadFsPath(childFull, e.name);
        if (childDir) node.children.push(childDir);
      } else if (e.isFile()) {
        const info = classifyScriptFilename(e.name);
        if (!info || info.isInit) continue;
        const childNode = loadFsPath(childFull, info.baseName);
        if (childNode) node.children.push(childNode);
      }
    }
    return node;
  }

  function buildTreeNode(name, def) {
    if (typeof def === 'string') {
      return loadFsPath(path.resolve(projectDir, def), name, { explicitPath: true });
    }
    if (!def || typeof def !== 'object') {
      root.diagnostics.push({
        severity: 'warning',
        code: 'ROJO_INVALID_TREE_ENTRY',
        name,
        path: null,
        reason: `Rojo tree entry '${name}' has unsupported definition type (${typeof def}) — skipped`
      });
      return null;
    }
    if (def.$path) {
      const targetPath = path.resolve(projectDir, def.$path);
      const loaded = loadFsPath(targetPath, name, { explicitPath: true });
      if (!loaded) {
        if (def.$properties) {
          root.diagnostics.push({
            severity: 'warning',
            code: 'ROJO_PROPERTIES_DROPPED',
            name,
            path: path.relative(projectDir, targetPath).replace(/\\/g, '/'),
            reason: `Skipped $properties on '${name}' because $path '${def.$path}' resolved to null`
          });
        }
        return null;
      }
      if (def.$properties) Object.assign(loaded.properties, def.$properties);
      return loaded;
    }

    const cls = def.$className || (SERVICE_CLASS_NAMES.has(name) ? name : 'Folder');
    const props = { Name: name, ...(def.$properties || {}) };
    const node = track({
      className: cls,
      referent: nextRef(),
      name,
      properties: props,
      children: []
    });

    for (const [k, v] of Object.entries(def)) {
      if (k.startsWith('$')) continue;
      const child = buildTreeNode(k, v);
      if (child) node.children.push(child);
    }
    return node;
  }

  const tree = spec.tree || {};
  for (const [k, v] of Object.entries(tree)) {
    if (k.startsWith('$')) continue;
    const child = buildTreeNode(k, v);
    if (child) root.children.push(child);
  }

  // Ensure Workspace exists for scene export
  if (!root.children.some((c) => c.className === 'Workspace')) {
    root.children.unshift(
      track({
        className: 'Workspace',
        referent: nextRef(),
        name: 'Workspace',
        properties: { Name: 'Workspace', Gravity: 196.2 },
        children: []
      })
    );
  }

  return root;
}
