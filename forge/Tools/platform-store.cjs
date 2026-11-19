'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { loadGameTemplates, MAIN_SCENE_PATH, showcaseSceneFiles } = require('./template-catalog.cjs');
const MAX_FILES = 512;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PROJECT_BYTES = 8 * 1024 * 1024;
const MAX_HISTORY = 20;
const MAX_RELEASES = 20;
const MAX_RECORD_BYTES = 128 * 1024 * 1024;

const templates = Object.freeze({
  ...loadGameTemplates(path.resolve(__dirname, '..')),
  blank3d: Object.freeze({
    id: 'blank3d', name: 'Blank 3D', description: 'A clean Godot 3D project with an empty scene.',
    files: Object.freeze({
      'project.godot': `; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="New Godot Project"\nrun/main_scene="res://scenes/main.tscn"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\n`,
      'scenes/main.tscn': `[gd_scene load_steps=1 format=3]\n\n[node name="Main" type="Node3D"]\n`,
    }),
  }),
  playground3d: Object.freeze({
    id: 'playground3d', name: '3D Playground', description: 'A small 3D scene with a camera, light, and floor.',
    files: Object.freeze({
      'project.godot': `; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="3D Playground"\nrun/main_scene="res://scenes/main.tscn"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n\n[rendering]\nrenderer/rendering_method="gl_compatibility"\nrenderer/rendering_method.mobile="gl_compatibility"\n`,
      'scenes/main.tscn': `[gd_scene load_steps=4 format=3]\n\n[ext_resource type="Script" path="res://scripts/spin.gd" id="1_spin"]\n\n[sub_resource type="BoxMesh" id="FloorMesh"]\nsize = Vector3(12, 0.2, 12)\n\n[sub_resource type="BoxMesh" id="CubeMesh"]\n\n[node name="Main" type="Node3D"]\n\n[node name="Floor" type="MeshInstance3D" parent="."]\nposition = Vector3(0, -0.1, 0)\nmesh = SubResource("FloorMesh")\n\n[node name="Camera3D" type="Camera3D" parent="."]\nposition = Vector3(0, 5, 9)\nrotation_degrees = Vector3(-25, 0, 0)\ncurrent = true\n\n[node name="DirectionalLight3D" type="DirectionalLight3D" parent="."]\nrotation_degrees = Vector3(-45, -30, 0)\n\n[node name="Cube" type="MeshInstance3D" parent="."]\nposition = Vector3(0, 0.5, 0)\nmesh = SubResource("CubeMesh")\nscript = ExtResource("1_spin")\n`,
      'scripts/spin.gd': `extends MeshInstance3D\n\n@export var degrees_per_second := 45.0\n\nfunc _process(delta: float) -> void:\n\trotate_y(deg_to_rad(degrees_per_second) * delta)\n`,
    }),
  }),
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function validId(id) { return typeof id === 'string' && /^[a-f0-9]{24}$/.test(id); }
function cleanPath(value) {
  if (typeof value !== 'string' || !value || value.length > 240 || value.includes('\\') || value.includes('\0') || value.startsWith('/')) throw httpError(400, 'Invalid project file path');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) throw httpError(400, 'Invalid project file path');
  if (parts.some(part => !/^[A-Za-z0-9 _.-]+$/.test(part))) throw httpError(400, 'Project file path contains unsupported characters');
  return parts.join('/');
}
function reservedPath(value) {
  return ['addons/playforge_platform', 'addons/playforge_replay', 'addons/playforge_showcase', 'addons/playforge_agent_chat', '.godot'].some(folder => value === folder || value.startsWith(folder + '/'));
}
function httpError(status, message, extra) { return Object.assign(new Error(message), { status, ...(extra || {}) }); }
function snapshot(project) {
  return { id: project.id, name: project.name, template: project.template, revision: project.revision,
    ...(project.mode === 'showcase' ? { mode: 'showcase' } : {}),
    files: clone(project.files), updatedAt: project.updatedAt, activeReleaseId: project.activeReleaseId || null };
}

class PlatformStore {
  constructor(root, workspace) {
    this.directory = path.resolve(workspace || path.join(root, 'Saved', 'Platform'));
    this.projectsDirectory = path.join(this.directory, 'projects');
    fs.mkdirSync(this.projectsDirectory, { recursive: true });
    this.listeners = new Map();
    this.pending = new Map();
  }

  listTemplates() {
    return Object.values(templates).map(({ id, name, description, assetPaths, showcase }) => ({
      id, name, description, assetCount: (assetPaths || []).length, showcase: Boolean(showcase),
    }));
  }
  getShowcase(id) {
    if (!Object.hasOwn(templates, id) || !templates[id].showcase) throw httpError(404, 'Template showcase not found');
    return JSON.parse(templates[id].showcase);
  }
  getTemplate(id) {
    const template = templates[id];
    if (!template) throw httpError(404, 'Template not found');
    return { id: template.id, name: template.name, description: template.description, dimension: template.dimension || '3d', assetPaths: clone(template.assetPaths || []), guideOrder: clone(template.guideOrder || []), files: clone(template.files) };
  }
  listProjects() {
    return fs.readdirSync(this.projectsDirectory, { withFileTypes: true }).filter(entry => entry.isDirectory() && validId(entry.name))
      .map(entry => { try { const project = this.read(entry.name); return { id: project.id, name: project.name, template: project.template, revision: project.revision, updatedAt: project.updatedAt }; } catch { return null; } })
      .filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createProject({ name, template = 'blank3d', mode = 'ready' } = {}) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw httpError(400, 'Project name must be 1–80 characters');
    if (!Object.hasOwn(templates, template)) throw httpError(400, 'Unknown project template');
    const source = templates[template];
    const id = crypto.randomBytes(12).toString('hex');
    const now = new Date().toISOString();
    if (!['ready', 'guided', 'showcase'].includes(mode)) throw httpError(400,'Invalid template start mode');
    if (mode === 'showcase' && !source.showcase) throw httpError(400, 'Template showcase not found');
    const files = mode === 'guided' ? {
      'project.godot': source.files['project.godot'],
      'scenes/main.tscn': '[gd_scene format=3]\n\n[node name="Main" type="'+(source.dimension === '2d' ? 'Node2D' : 'Node3D')+'"]\n',
      ...Object.fromEntries((source.assetPaths || []).map(file => [file,source.files[file]]))
    } : clone(source.files);
    if (mode === 'showcase' && JSON.parse(source.showcase).schemaVersion === 3) {
      Object.assign(files, showcaseSceneFiles(source.files[MAIN_SCENE_PATH]));
    }
    files['project.godot'] = files['project.godot'].replace(/^config\/name=.*$/m, () => 'config/name=' + JSON.stringify(name.trim()));
    const initial = { revision: 1, files: clone(files), createdAt: now, clientId: null, message: 'Project created' };
    const project = { id, name: name.trim(), template, revision: 1, files, updatedAt: now, activeReleaseId: null,
      ...(mode === 'showcase' ? { mode } : {}),
      history: [initial], releases: [] };
    this.persist(project);
    this.emit(id, { type: 'created', project: snapshot(project) });
    return snapshot(project);
  }

  getProject(id) { return snapshot(this.read(id)); }
  history(id) { return this.read(id).history.map(item => ({ revision: item.revision, createdAt: item.createdAt, clientId: item.clientId, message: item.message, fileCount: Object.keys(item.files).length })); }
  listReleases(id) { return clone(this.read(id).releases).map(({ files, build, ...release }) => ({ ...(build || {}), ...release })); }

  updateFile(id, { path: rawPath, content, baseRevision, clientId = null } = {}) {
    const filePath = cleanPath(rawPath);
    if (reservedPath(filePath)) throw httpError(400, 'The PlayForge platform addon is read-only');
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) throw httpError(413, 'Project files must be text under 1 MB');
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 1) throw httpError(400, 'baseRevision is required');
    return this.enqueue(id, async () => {
      const project = this.read(id);
      if (baseRevision !== project.revision) throw httpError(409, 'revision_conflict', { project: snapshot(project) });
      const files = { ...project.files, [filePath]: content };
      return this.commit(project, files, clientId, `Updated ${filePath}`);
    });
  }

  updateFiles(id, { files: incoming, baseRevision, clientId = null } = {}) {
    if (!Array.isArray(incoming) || incoming.length > MAX_FILES) throw httpError(400, 'files must be a bounded array');
    const desired = Object.create(null);
    for (const item of incoming) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw httpError(400, 'Each file needs a path and text content');
      const filePath = cleanPath(item.path);
      if (reservedPath(filePath)) continue;
      if (Object.hasOwn(desired, filePath)) throw httpError(400, 'Duplicate project file path');
      if (typeof item.content !== 'string' || Buffer.byteLength(item.content, 'utf8') > MAX_FILE_BYTES) throw httpError(413, 'Project files must be text under 1 MB');
      desired[filePath] = item.content;
    }
    return this.enqueue(id, async () => {
      const project = this.read(id);
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 1) throw httpError(400, 'baseRevision is required');
      const base = project.history.find(item => item.revision === baseRevision);
      if (!base) throw httpError(409, 'revision_conflict', { project: snapshot(project) });
      const paths = new Set([...Object.keys(base.files), ...Object.keys(desired)].filter(file => !reservedPath(file)));
      const changed = [...paths].filter(file => base.files[file] !== desired[file]);
      for (const file of changed) {
        if (base.files[file] !== project.files[file]) throw httpError(409, 'revision_conflict', { project: snapshot(project), conflictingFiles: [file] });
      }
      if (!changed.length) return snapshot(project);
      const merged = { ...project.files };
      for (const file of changed) {
        if (Object.hasOwn(desired, file)) merged[file] = desired[file];
        else delete merged[file];
      }
      return this.commit(project, merged, clientId, `Updated ${changed.length} file${changed.length === 1 ? '' : 's'}`);
    });
  }

  restoreRevision(id, revision, { baseRevision, clientId = null } = {}) {
    return this.enqueue(id, async () => {
      const project = this.read(id);
      this.checkBase(project, baseRevision);
      const previous = project.history.find(item => item.revision === revision);
      if (!previous) throw httpError(404, 'Revision not found');
      return this.commit(project, clone(previous.files), clientId, `Restored revision ${revision}`);
    });
  }

  createRelease(id, { revision, label, build = null } = {}) {
    return this.enqueue(id, async () => {
      const project = this.read(id);
      const targetRevision = revision === undefined ? project.revision : revision;
      const source = project.history.find(item => item.revision === targetRevision);
      if (!source) throw httpError(404, 'Revision not found');
      if (project.releases.length >= MAX_RELEASES) throw httpError(409, 'Release limit reached');
      const release = { id: crypto.randomBytes(12).toString('hex'), label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : `Release r${targetRevision}`,
        revision: source.revision, createdAt: new Date().toISOString(), build: build ? clone(build) : null, files: clone(source.files) };
      project.releases.push(release);
      project.activeReleaseId = release.id;
      this.persist(project);
      this.emit(id, { type: 'release', release: { id: release.id, label: release.label, revision: release.revision, createdAt: release.createdAt } });
      return { ...(release.build || {}), id: release.id, label: release.label, revision: release.revision, createdAt: release.createdAt };
    });
  }

  rollbackRelease(id, releaseId, { baseRevision, clientId = null } = {}) {
    return this.enqueue(id, async () => {
      const project = this.read(id);
      this.checkBase(project, baseRevision);
      const release = project.releases.find(item => item.id === releaseId);
      if (!release) throw httpError(404, 'Release not found');
      project.activeReleaseId = release.id;
      return this.commit(project, clone(release.files), clientId, `Rolled back to ${release.label}`);
    });
  }

  subscribe(id, listener) {
    this.read(id);
    let listeners = this.listeners.get(id);
    if (!listeners) this.listeners.set(id, listeners = new Set());
    listeners.add(listener);
    return () => { listeners.delete(listener); if (!listeners.size) this.listeners.delete(id); };
  }

  checkBase(project, baseRevision) {
    if (!Number.isSafeInteger(baseRevision) || baseRevision < 1) throw httpError(400, 'baseRevision is required');
    if (baseRevision !== project.revision) throw httpError(409, 'revision_conflict', { project: snapshot(project) });
  }

  commit(project, files, clientId, message) {
    if (Object.keys(files).length > MAX_FILES || Object.entries(files).reduce((size, [file, value]) => size + Buffer.byteLength(file) + Buffer.byteLength(value), 0) > MAX_PROJECT_BYTES) throw httpError(413, 'Project exceeds its file or size limit');
    const now = new Date().toISOString();
    const revision = project.revision + 1;
    const history = [...project.history, { revision, files: clone(files), createdAt: now, clientId: typeof clientId === 'string' ? clientId.slice(0, 100) : null, message }].slice(-MAX_HISTORY);
    const next = { ...project, files, revision, updatedAt: now, history };
    this.persist(next);
    this.emit(project.id, { type: 'project', project: snapshot(next), clientId: typeof clientId === 'string' ? clientId.slice(0, 100) : null, message });
    return snapshot(next);
  }

  enqueue(id, operation) {
    if (!validId(id)) return Promise.reject(httpError(404, 'Project not found'));
    const previous = this.pending.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    this.pending.set(id, next);
    return next.finally(() => { if (this.pending.get(id) === next) this.pending.delete(id); });
  }
  emit(id, event) { for (const listener of this.listeners.get(id) || []) { try { listener(clone(event)); } catch {} } }
  projectFile(id) { if (!validId(id)) throw httpError(404, 'Project not found'); return path.join(this.projectsDirectory, id, 'project.json'); }
  read(id) {
    try {
      const project = JSON.parse(fs.readFileSync(this.projectFile(id), 'utf8'));
      if (!project || project.id !== id || !project.files || !Array.isArray(project.history) || !Array.isArray(project.releases)) throw new Error('Invalid project record');
      return project;
    } catch (error) { if (error.status) throw error; if (error.code === 'ENOENT') throw httpError(404, 'Project not found'); throw error; }
  }
  persist(project) {
    const target = this.projectFile(project.id);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = target + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    const serialized = JSON.stringify(project);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) throw httpError(413, 'Project history and releases exceed the storage limit');
    try { fs.writeFileSync(temp, serialized, { flag: 'wx' }); fs.renameSync(temp, target); }
    finally { try { fs.unlinkSync(temp); } catch {} }
  }
}

module.exports = { PlatformStore, templates };
