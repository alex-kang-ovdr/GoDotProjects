import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_IGNORED_DIRS = new Set(['.godot', '.git', 'node_modules', 'Saved']);
const RESOURCE_REF_EXTENSIONS = new Set(['.gd', '.tscn', '.tres']);
const TEST_SCRIPT_PATTERN = /(?:^|\/)tests?\/|_test\.gd$/i;

function toPosix(filePath) {
  return filePath.replace(/\\/g, '/');
}

export function resolveDefaultForgeDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../../../..', 'forge');
}

function unquoteGodotString(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parsePackedStringArray(raw) {
  const match = /PackedStringArray\(([\s\S]*?)\)/.exec(raw);
  if (!match) return [];
  const items = [];
  for (const entry of match[1].matchAll(/"([^"\r\n]*)"/g)) {
    items.push(entry[1]);
  }
  return items;
}

/**
 * Parse a Godot `project.godot` INI-style configuration file into structured metadata.
 */
export function parseProjectGodot(content) {
  const sections = Object.create(null);
  let currentSection = '';
  sections[currentSection] = Object.create(null);

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1).trim();
      if (!sections[currentSection]) sections[currentSection] = Object.create(null);
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    sections[currentSection][key] = value;
  }

  const root = sections[''] || {};
  const app = sections.application || {};
  const rendering = sections.rendering || {};
  const autoloadSection = sections.autoload || {};
  const editorPlugins = sections.editor_plugins || {};

  const autoloads = Object.entries(autoloadSection).map(([name, value]) => {
    const cleaned = unquoteGodotString(value);
    const singleton = cleaned.startsWith('*');
    return {
      name,
      singleton,
      raw: cleaned,
      path: singleton ? cleaned.slice(1) : cleaned,
    };
  });

  return {
    configVersion: root['config_version'] ? Number(root['config_version']) : null,
    appName: app['config/name'] ? unquoteGodotString(app['config/name']) : null,
    mainScene: app['run/main_scene'] ? unquoteGodotString(app['run/main_scene']) : null,
    icon: app['config/icon'] ? unquoteGodotString(app['config/icon']) : null,
    features: app['config/features'] ? parsePackedStringArray(app['config/features']) : [],
    renderingMethod: rendering['renderer/rendering_method'] ? unquoteGodotString(rendering['renderer/rendering_method']) : null,
    autoloads,
    enabledPlugins: editorPlugins.enabled ? parsePackedStringArray(editorPlugins.enabled) : [],
    sections,
  };
}

/**
 * Resolve a `res://` path safely within `projectDir`.
 */
export function resolveResPath(projectDir, resPath) {
  if (typeof resPath !== 'string' || !resPath.startsWith('res://')) {
    return { valid: false, reason: 'not_res_scheme', relPath: null, absPath: null };
  }
  const relPath = resPath.slice('res://'.length).replace(/^\/+/, '');
  if (!relPath) {
    return { valid: false, reason: 'empty_res_path', relPath: '', absPath: null };
  }
  const root = path.resolve(projectDir);
  const absPath = path.resolve(root, relPath);
  const relativeFromRoot = path.relative(root, absPath);
  if (relativeFromRoot.startsWith('..') || path.isAbsolute(relativeFromRoot)) {
    return { valid: false, reason: 'escapes_project_root', relPath, absPath: null };
  }
  return { valid: true, relPath: toPosix(relativeFromRoot), absPath };
}

function walkProjectFiles(projectDir) {
  const files = [];
  function visit(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (DEFAULT_IGNORED_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push({
          relPath: toPosix(path.relative(projectDir, fullPath)),
          absPath: fullPath,
        });
      }
    }
  }
  visit(projectDir);
  return files;
}

function isDynamicTemplateRef(resPath) {
  // Format templates like "res://Assets/%s.svg" or concatenation prefixes like "res://assets/audio/"
  return resPath.endsWith('/') || /%[sdfox]|\{[^}]*\}/.test(resPath);
}

function extractStaticResRefs(content, { strictPreloadOnly = false, commentPrefix = null } = {}) {
  const effectiveText = commentPrefix
    ? content.split(/\r?\n/).filter(line => !line.trimStart().startsWith(commentPrefix)).join('\n')
    : content;

  const refs = new Set();
  if (strictPreloadOnly) {
    for (const match of effectiveText.matchAll(/\bpreload\(\s*["'](res:\/\/[^"'\r\n]+)["']\s*\)/g)) {
      refs.add(match[1]);
    }
    return [...refs];
  }

  for (const match of effectiveText.matchAll(/["'](res:\/\/[^"'\r\n]+)["']/g)) {
    const ref = match[1];
    if (!isDynamicTemplateRef(ref)) refs.add(ref);
  }
  return [...refs];
}

function checkMetadataFile(projectDir, containerDir, issues) {
  const metaPath = [path.join(projectDir, 'metadata.json'), containerDir ? path.join(containerDir, 'metadata.json') : null]
    .find(candidate => candidate && fs.existsSync(candidate));
  if (!metaPath) return null;

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  } catch (error) {
    issues.push({
      severity: 'fail',
      code: 'invalid_metadata_json',
      message: `Invalid metadata.json: ${error.message}`,
      file: toPosix(path.relative(projectDir, metaPath)),
      ref: null,
    });
    return { valid: false, metadata: null, missingAssets: [], assetCount: 0 };
  }

  if (!/^[a-z0-9-]+$/.test(metadata.id || '') || !['2d', '3d'].includes(metadata.dimension)) {
    issues.push({
      severity: 'fail',
      code: 'invalid_template_metadata',
      message: `Template metadata.json has invalid id or dimension (${metadata.id}, ${metadata.dimension})`,
      file: 'metadata.json',
      ref: null,
    });
  }

  const assetPaths = Array.isArray(metadata.assetPaths) ? metadata.assetPaths : [];
  const missingAssets = [];
  for (const assetRel of assetPaths) {
    const absAsset = path.resolve(projectDir, assetRel);
    const relFromRoot = path.relative(path.resolve(projectDir), absAsset);
    const escapes = relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot);
    if (escapes || !fs.existsSync(absAsset) || !fs.statSync(absAsset).isFile()) {
      missingAssets.push(assetRel);
      issues.push({
        severity: 'fail',
        code: 'missing_metadata_asset',
        message: `Missing asset declared in metadata.json: ${assetRel}`,
        file: 'metadata.json',
        ref: assetRel,
      });
    }
  }

  const showcasePath = path.join(path.dirname(metaPath), 'showcase.json');
  if (fs.existsSync(showcasePath)) {
    try {
      const showcase = JSON.parse(fs.readFileSync(showcasePath, 'utf8'));
      if (![1, 3].includes(showcase?.schemaVersion)) {
        issues.push({
          severity: 'fail',
          code: 'invalid_showcase_version',
          message: `Unsupported showcase.json schemaVersion: ${showcase?.schemaVersion}`,
          file: 'showcase.json',
          ref: null,
        });
      }
    } catch (error) {
      issues.push({
        severity: 'fail',
        code: 'invalid_showcase_json',
        message: `Invalid showcase.json: ${error.message}`,
        file: 'showcase.json',
        ref: null,
      });
    }
  }

  return {
    valid: missingAssets.length === 0,
    metadata,
    missingAssets,
    assetCount: assetPaths.length,
  };
}

function checkResReference(projectDir, sourceRel, resRef, seenMissing, issues, missingList) {
  const resolved = resolveResPath(projectDir, resRef);
  const exists = resolved.valid && fs.existsSync(resolved.absPath);
  if (exists) return true;

  const key = `${sourceRel}::${resRef}`;
  if (!seenMissing.has(key)) {
    seenMissing.add(key);
    missingList.push({ file: sourceRel, ref: resRef, reason: resolved.reason || 'not_found' });
    issues.push({
      severity: 'fail',
      code: 'missing_resource_reference',
      message: `Missing resource referenced in ${sourceRel}: ${resRef}`,
      file: sourceRel,
      ref: resRef,
    });
  }
  return false;
}

/**
 * Inspect a single Godot project directory for structural completeness:
 * `project.godot`, `run/main_scene`, `.gd` scripts, `.tscn`/`.tres` resources,
 * autoloads/plugins, and template `metadata.json` assets.
 */
export function scanGodotProject(projectDir, options = {}) {
  const absProjectDir = path.resolve(projectDir);
  const id = options.id || path.basename(absProjectDir);
  const kind = options.kind || 'project';
  const relativePath = options.relativePath || toPosix(absProjectDir);
  const issues = [];

  if (!fs.existsSync(absProjectDir) || !fs.statSync(absProjectDir).isDirectory()) {
    issues.push({
      severity: 'fail',
      code: 'missing_project_dir',
      message: `Project directory does not exist: ${absProjectDir}`,
      file: null,
      ref: null,
    });
    return {
      id,
      name: id,
      kind,
      projectDir: absProjectDir,
      relativePath,
      status: 'error',
      checks: null,
      issues,
      stats: { totalFiles: 0, gdFiles: 0, testGdFiles: 0, tscnFiles: 0, tresFiles: 0, resRefsChecked: 0 },
    };
  }

  const projectGodotPath = path.join(absProjectDir, 'project.godot');
  if (!fs.existsSync(projectGodotPath)) {
    issues.push({
      severity: 'fail',
      code: 'missing_project_godot',
      message: `Missing project.godot in ${relativePath}`,
      file: 'project.godot',
      ref: null,
    });
    return {
      id,
      name: id,
      kind,
      projectDir: absProjectDir,
      relativePath,
      status: 'fail',
      checks: {
        projectGodot: { ok: false, path: projectGodotPath, configVersion: null, appName: null, features: [] },
        mainScene: { ok: false, raw: null, resolvedPath: null, exists: false },
        scripts: { ok: false, count: 0, testCount: 0, emptyScripts: [], missingRefs: [] },
        scenes: { ok: false, count: 0, invalidScenes: [] },
        assets: { ok: false, checkedRefsCount: 0, metadataAssetCount: 0, missingRefs: [], missingMetadataAssets: [] },
        autoloads: { ok: true, entries: [], missing: [] },
        plugins: { ok: true, enabled: [], missing: [] },
      },
      issues,
      stats: { totalFiles: 0, gdFiles: 0, testGdFiles: 0, tscnFiles: 0, tresFiles: 0, resRefsChecked: 0 },
    };
  }

  const projectGodotText = fs.readFileSync(projectGodotPath, 'utf8');
  const parsedConfig = parseProjectGodot(projectGodotText);
  const seenMissing = new Set();
  const missingAssets = [];
  const missingScriptRefs = [];
  let resRefsChecked = 0;

  // 1. Validate run/main_scene
  let mainSceneOk = false;
  let mainSceneResolved = null;
  if (!parsedConfig.mainScene) {
    issues.push({
      severity: 'fail',
      code: 'missing_main_scene_config',
      message: 'project.godot does not define application/run/main_scene',
      file: 'project.godot',
      ref: null,
    });
  } else {
    const resolved = resolveResPath(absProjectDir, parsedConfig.mainScene);
    mainSceneResolved = resolved.relPath;
    if (!resolved.valid || !fs.existsSync(resolved.absPath) || !fs.statSync(resolved.absPath).isFile()) {
      issues.push({
        severity: 'fail',
        code: 'missing_main_scene_file',
        message: `Main scene file does not exist: ${parsedConfig.mainScene}`,
        file: 'project.godot',
        ref: parsedConfig.mainScene,
      });
    } else {
      mainSceneOk = true;
    }
  }

  // 2. Validate config/icon, autoloads, enabled plugins
  if (parsedConfig.icon) {
    resRefsChecked += 1;
    checkResReference(absProjectDir, 'project.godot', parsedConfig.icon, seenMissing, issues, missingAssets);
  }

  const missingAutoloads = [];
  for (const entry of parsedConfig.autoloads) {
    resRefsChecked += 1;
    const resolved = resolveResPath(absProjectDir, entry.path);
    if (!resolved.valid || !fs.existsSync(resolved.absPath)) {
      missingAutoloads.push(entry);
      issues.push({
        severity: 'fail',
        code: 'missing_autoload_target',
        message: `Autoload "${entry.name}" target missing: ${entry.path}`,
        file: 'project.godot',
        ref: entry.path,
      });
    }
  }

  const missingPlugins = [];
  for (const pluginPath of parsedConfig.enabledPlugins) {
    resRefsChecked += 1;
    const resolved = resolveResPath(absProjectDir, pluginPath);
    if (!resolved.valid || !fs.existsSync(resolved.absPath)) {
      missingPlugins.push(pluginPath);
      issues.push({
        severity: 'fail',
        code: 'missing_editor_plugin',
        message: `Enabled plugin config missing: ${pluginPath}`,
        file: 'project.godot',
        ref: pluginPath,
      });
    }
  }

  // 3. Walk all project files
  const files = walkProjectFiles(absProjectDir);
  const gdFiles = files.filter(f => f.relPath.endsWith('.gd'));
  const testGdFiles = gdFiles.filter(f => TEST_SCRIPT_PATTERN.test(f.relPath));
  const tscnFiles = files.filter(f => f.relPath.endsWith('.tscn'));
  const tresFiles = files.filter(f => f.relPath.endsWith('.tres'));

  if (gdFiles.length === 0) {
    issues.push({
      severity: 'warn',
      code: 'no_gd_scripts',
      message: 'Project contains no .gd scripts',
      file: null,
      ref: null,
    });
  }

  const emptyScripts = [];
  const invalidScenes = [];

  for (const file of files) {
    const ext = path.extname(file.relPath).toLowerCase();
    if (!RESOURCE_REF_EXTENSIONS.has(ext)) continue;

    const text = fs.readFileSync(file.absPath, 'utf8');
    if (ext === '.gd') {
      if (!text.trim()) {
        emptyScripts.push(file.relPath);
        issues.push({
          severity: 'fail',
          code: 'empty_script',
          message: `GDScript file is empty: ${file.relPath}`,
          file: file.relPath,
          ref: null,
        });
      }
      const preloads = extractStaticResRefs(text, { strictPreloadOnly: true, commentPrefix: '#' });
      const staticRefs = extractStaticResRefs(text, { strictPreloadOnly: false, commentPrefix: '#' });
      for (const ref of new Set([...preloads, ...staticRefs])) {
        resRefsChecked += 1;
        checkResReference(absProjectDir, file.relPath, ref, seenMissing, issues, missingScriptRefs);
      }
    } else if (ext === '.tscn' || ext === '.tres') {
      const expectedHeader = ext === '.tscn' ? '[gd_scene' : '[gd_resource';
      if (!text.includes(expectedHeader)) {
        invalidScenes.push(file.relPath);
        issues.push({
          severity: 'fail',
          code: ext === '.tscn' ? 'invalid_tscn_header' : 'invalid_tres_header',
          message: `Missing ${expectedHeader} header in ${file.relPath}`,
          file: file.relPath,
          ref: null,
        });
      }
      for (const ref of extractStaticResRefs(text, { commentPrefix: ';' })) {
        resRefsChecked += 1;
        checkResReference(absProjectDir, file.relPath, ref, seenMissing, issues, missingAssets);
      }
    }
  }

  // 4. Validate metadata.json if present (Forge templates)
  const metadataCheck = checkMetadataFile(absProjectDir, options.containerDir, issues);
  const missingMetadataAssets = metadataCheck ? metadataCheck.missingAssets : [];

  const failCount = issues.filter(i => i.severity === 'fail').length;
  const warnCount = issues.filter(i => i.severity === 'warn').length;
  const status = failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';

  return {
    id,
    name: parsedConfig.appName || metadataCheck?.metadata?.name || id,
    kind,
    dimension: metadataCheck?.metadata?.dimension || null,
    projectDir: absProjectDir,
    relativePath,
    status,
    checks: {
      projectGodot: {
        ok: Number.isInteger(parsedConfig.configVersion),
        path: toPosix(projectGodotPath),
        configVersion: parsedConfig.configVersion,
        appName: parsedConfig.appName,
        features: parsedConfig.features,
        renderingMethod: parsedConfig.renderingMethod,
      },
      mainScene: {
        ok: mainSceneOk,
        raw: parsedConfig.mainScene,
        resolvedPath: mainSceneResolved,
        exists: mainSceneOk,
      },
      scripts: {
        ok: emptyScripts.length === 0 && missingScriptRefs.length === 0,
        count: gdFiles.length,
        runtimeCount: gdFiles.length - testGdFiles.length,
        testCount: testGdFiles.length,
        emptyScripts,
        missingRefs: missingScriptRefs,
      },
      scenes: {
        ok: mainSceneOk && invalidScenes.length === 0,
        count: tscnFiles.length,
        tresCount: tresFiles.length,
        invalidScenes,
      },
      assets: {
        ok: missingAssets.length === 0 && missingScriptRefs.length === 0 && missingMetadataAssets.length === 0,
        checkedRefsCount: resRefsChecked,
        metadataAssetCount: metadataCheck ? metadataCheck.assetCount : 0,
        missingRefs: [...missingAssets, ...missingScriptRefs],
        missingMetadataAssets,
      },
      autoloads: {
        ok: missingAutoloads.length === 0,
        entries: parsedConfig.autoloads,
        missing: missingAutoloads,
      },
      plugins: {
        ok: missingPlugins.length === 0,
        enabled: parsedConfig.enabledPlugins,
        missing: missingPlugins,
      },
    },
    issues,
    stats: {
      totalFiles: files.length,
      gdFiles: gdFiles.length,
      testGdFiles: testGdFiles.length,
      tscnFiles: tscnFiles.length,
      tresFiles: tresFiles.length,
      resRefsChecked,
    },
  };
}

function resolveProjectDirInContainer(containerDir) {
  const direct = path.join(containerDir, 'project.godot');
  if (fs.existsSync(direct)) return containerDir;
  const nestedProject = path.join(containerDir, 'Project');
  if (fs.existsSync(path.join(nestedProject, 'project.godot'))) return nestedProject;
  return containerDir;
}

/**
 * Discover Godot projects under `forge/Samples/*` and `forge/Templates/*`.
 * Handles nested `Project/` folders in Forge samples as well as root `project.godot` templates.
 */
export function discoverForgeProjects(options = {}) {
  const forgeDir = path.resolve(options.forgeDir || resolveDefaultForgeDir());
  const includeSamples = options.includeSamples !== false;
  const includeTemplates = options.includeTemplates !== false;
  const discovered = [];

  const groups = [];
  if (includeSamples) groups.push({ kind: 'sample', dir: path.join(forgeDir, 'Samples') });
  if (includeTemplates) groups.push({ kind: 'template', dir: path.join(forgeDir, 'Templates') });

  for (const group of groups) {
    if (!fs.existsSync(group.dir)) continue;
    const entries = fs.readdirSync(group.dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const containerDir = path.join(group.dir, entry.name);
      const projectDir = resolveProjectDirInContainer(containerDir);
      const relativePath = toPosix(path.relative(forgeDir, projectDir));
      discovered.push({
        id: entry.name,
        kind: group.kind,
        containerDir,
        projectDir,
        relativePath: `forge/${relativePath}`,
        hasProjectGodot: fs.existsSync(path.join(projectDir, 'project.godot')),
      });
    }
  }

  return discovered;
}

function checkTemplateCatalogConsistency(forgeDir, templateProjects) {
  const catalogPath = path.join(forgeDir, 'Tools', 'template-catalog.cjs');
  if (!fs.existsSync(catalogPath)) {
    return { checked: false, ok: true, reason: 'template-catalog.cjs not found', templateIds: [] };
  }
  try {
    const requireCjs = createRequire(import.meta.url);
    const { loadGameTemplates, loadAssetStore } = requireCjs(catalogPath);
    const catalog = loadGameTemplates(forgeDir);
    const assetStore = loadAssetStore(forgeDir);
    const catalogIds = Object.keys(catalog).sort();
    const scannedIds = templateProjects.map(p => p.id).sort();
    const missingFromCatalog = scannedIds.filter(id => !Object.hasOwn(catalog, id));
    return {
      checked: true,
      ok: missingFromCatalog.length === 0 && assetStore.catalog.packs.length > 0,
      templateIds: catalogIds,
      packCount: assetStore.catalog.packs.length,
      missingFromCatalog,
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      error: error.message,
      templateIds: [],
      packCount: 0,
      missingFromCatalog: [],
    };
  }
}

/**
 * Scan all Forge samples and templates and return a structured report.
 */
export function scanForgeProjects(options = {}) {
  const forgeDir = path.resolve(options.forgeDir || resolveDefaultForgeDir());
  const onlySet = Array.isArray(options.only) && options.only.length > 0 ? new Set(options.only) : null;
  const targets = discoverForgeProjects({ ...options, forgeDir })
    .filter(item => !onlySet || onlySet.has(item.id));

  const projects = targets.map(target => scanGodotProject(target.projectDir, {
    id: target.id,
    kind: target.kind,
    containerDir: target.containerDir,
    relativePath: target.relativePath,
  }));

  const templateTargets = targets.filter(t => t.kind === 'template');
  const catalogCheck = options.checkTemplateCatalog === false
    ? { checked: false, ok: true, templateIds: [] }
    : checkTemplateCatalogConsistency(forgeDir, templateTargets);

  const summary = {
    total: projects.length,
    passed: projects.filter(p => p.status === 'pass').length,
    warned: projects.filter(p => p.status === 'warn').length,
    failed: projects.filter(p => p.status === 'fail').length,
    errored: projects.filter(p => p.status === 'error').length,
    samples: projects.filter(p => p.kind === 'sample').length,
    templates: projects.filter(p => p.kind === 'template').length,
  };

  const overallStatus = summary.total === 0 || summary.errored > 0
    ? 'error'
    : summary.failed > 0 || !catalogCheck.ok
      ? 'fail'
      : summary.warned > 0
        ? 'warn'
        : 'pass';

  return {
    suite: 'forge-scanner',
    status: overallStatus,
    scannedAt: new Date().toISOString(),
    forgeDir: toPosix(forgeDir),
    catalogCheck,
    summary,
    projects,
  };
}
