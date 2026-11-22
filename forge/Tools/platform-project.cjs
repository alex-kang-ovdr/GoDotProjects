'use strict';

const PLUGIN_ROOT = 'addons/playforge_platform';
const PROJECT_HOME = '/home/web_user/projects';
const PROJECT_ID_RE = /^[a-zA-Z0-9_-]{1,100}$/;
const MAX_FILES = 512;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PROJECT_BYTES = 8 * 1024 * 1024;

function validateProjectId(id) {
  if (typeof id !== 'string' || !PROJECT_ID_RE.test(id)) throw new Error('Invalid platform project ID');
  return id;
}

function normalizeFiles(files) {
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new Error('Invalid project file list');
  const seen = new Set();
  let total = 0;
  return files.map((entry) => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') throw new Error('Invalid project file');
    const file = entry.path.replaceAll('\\', '/');
    const lowerFile = file.replace(/^(\.\/)+/, '').toLowerCase();
    if (
      lowerFile === 'addons/playforge_platform' || lowerFile.startsWith('addons/playforge_platform/') ||
      lowerFile === 'addons/playforge_avatar' || lowerFile.startsWith('addons/playforge_avatar/')
    ) return null;
    if (file.startsWith('/') || file.includes(':') || /[\\\0-\x1f]/.test(file) ||
        file.split('/').some(part => !part || part === '.' || part === '..') || lowerFile === '.playforge-platform.json') {
      throw new Error('Unsafe project file path');
    }
    if (seen.has(file)) throw new Error('Duplicate project file path');
    seen.add(file);
    const bytes = new TextEncoder().encode(entry.content).byteLength;
    if (bytes > MAX_FILE_BYTES) throw new Error('Project file is too large: ' + file);
    total += bytes;
    if (total > MAX_PROJECT_BYTES) throw new Error('Project is too large');
    return { path: file, content: entry.content };
  }).filter(Boolean);
}

function projectDirectory(id) {
  return `${PROJECT_HOME}/${validateProjectId(id)}`;
}

function withPlatformPlugin(files, id, revision, addonFiles = {}) {
  const normalized = normalizeFiles(files);
  const byPath = new Map(normalized.map(file => [file.path, file.content]));
  let project = byPath.get('project.godot');
  if (typeof project !== 'string') throw new Error('Project is missing project.godot');
  const originalProjectConfig = project;
  const enabledPlugin = 'res://addons/playforge_platform/plugin.cfg';
  if (!project.includes(enabledPlugin)) project = appendEditorPlugin(project, enabledPlugin);
  byPath.set('project.godot', project);
  byPath.set('.playforge-platform.json', JSON.stringify({ id, revision,
    baseProjectConfig: originalProjectConfig, editorProjectConfig: project }, null, 2));
  for (const [name, content] of Object.entries(addonFiles)) {
    if (!['plugin.cfg', 'plugin.gd'].includes(name) || typeof content !== 'string') throw new Error('Invalid PlayForge platform add-on file');
    byPath.set(`${PLUGIN_ROOT}/${name}`, content);
  }
  return [...byPath].map(([filePath, content]) => ({ path: filePath, content }));
}

function appendEditorPlugin(project, pluginPath) {
  const section = /^\[editor_plugins\][ \t]*(?=\r?$)/m.exec(project);
  const newline = project.includes('\r\n') ? '\r\n' : '\n';
  const quotedPath = JSON.stringify(pluginPath);
  if (!section) {
    return [project, '[editor_plugins]', `enabled=PackedStringArray(${quotedPath})`, ''].join(newline);
  }
  const start = section.index + section[0].length;
  const remainder = project.slice(start);
  const nextSection = /^\[[^\r\n]+\][ \t]*\r?$/m.exec(remainder);
  const end = nextSection ? nextSection.index : remainder.length;
  const body = remainder.slice(0, end);
  const match = /^[ \t]*enabled[ \t]*=[ \t]*PackedStringArray\(([^\r\n]*)\)[ \t]*(?=\r?$)/m.exec(body);
  const values = match ? match[1].trim() : '';
  if (values.includes(quotedPath)) return project;
  const assignment = `enabled=PackedStringArray(${values ? values + ', ' : ''}${quotedPath})`;
  const updated = match
    ? body.slice(0, match.index) + assignment + body.slice(match.index + match[0].length)
    : body.trimEnd() + newline + assignment + newline;
  return project.slice(0, start) + updated + remainder.slice(end);
}

function toEngineFiles(files, id, revision, addonFiles = {}) {
  const dir = projectDirectory(id);
  return withPlatformPlugin(files, id, revision, addonFiles).map(file => ({
    path: `${dir}/${file.path}`,
    buffer: new TextEncoder().encode(file.content),
  }));
}

module.exports = { MAX_FILES, MAX_FILE_BYTES, MAX_PROJECT_BYTES, PLUGIN_ROOT, PROJECT_HOME,
  appendEditorPlugin, normalizeFiles, projectDirectory, toEngineFiles, validateProjectId, withPlatformPlugin };
