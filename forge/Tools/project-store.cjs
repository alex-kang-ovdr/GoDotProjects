'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MAX_SOURCE_BYTES = 256000;
// Fields an earlier workspace file may still carry from the retired Studio/Yjs collaboration
// (textState, textStateVersion, operations, lockFence, textRevision, settingsRevision) are ignored on load
// and dropped on the next write. Only source, settings and revision are kept.

class ProjectStore {
  constructor(root, workspace) {
    this.root = root;
    const folder = path.join(root, 'Projects', 'TappyChicken');
    this.project = JSON.parse(fs.readFileSync(path.join(folder, 'project.json'), 'utf8'));
    this.project.assets = this.project.assets.map(asset => ({ ...asset, path: '/Projects/TappyChicken/' + asset.path }));
    const scenePath = path.resolve(folder, this.project.mainScene);
    if (!scenePath.startsWith(folder + path.sep)) throw new Error('Project scene must stay inside its project folder');
    this.project.scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
    this.project.presenter = '/Projects/TappyChicken/presenter.js';
    this.project.settingsSchema = JSON.parse(fs.readFileSync(path.join(folder, 'settings.schema.json'), 'utf8'));
    this.settingsSchema = this.project.settingsSchema;
    this.settingsFields = new Map(this.settingsSchema.fields.map(field => [field.key, field]));
    const sourcePath = path.resolve(folder, this.project.runtime.entry);
    if (!sourcePath.startsWith(folder + path.sep)) throw new Error('Project script must stay inside its project folder');
    this.source = fs.readFileSync(sourcePath, 'utf8');
    this.settings = knownSettings(this.settingsSchema, JSON.parse(fs.readFileSync(path.join(folder, 'Gameplay.settings.json'), 'utf8')));
    this.revision = 1;
    this.file = path.join(workspace || path.join(root, 'Saved', 'GodotWorkspace'), 'tappy.json');
    this.pending = Promise.resolve();

    if (fs.existsSync(this.file)) {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const savedSettings = knownSettings(this.settingsSchema, saved.settings);
      this.validate({ ...saved, settings: savedSettings }, savedSettings);
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error('Invalid saved workspace revision');
      this.source = saved.source;
      this.settings = savedSettings;
      this.revision = saved.revision;
    }
    this.validate({ source: this.source, settings: this.settings });
  }

  validate(value, previousSettings = this.settings) {
    if (!value || typeof value.source !== 'string' || Buffer.byteLength(value.source, 'utf8') > MAX_SOURCE_BYTES) {
      throw new Error('GDScript source must be a string under 256 KB');
    }
    if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) {
      throw new Error('Project settings must be an object');
    }
    for (const [key, item] of Object.entries(value.settings)) {
      const field = this.settingsFields.get(key);
      if (!field) throw new Error('Unknown setting: ' + key);
      if (field.type === 'number') {
        if (typeof item !== 'number' || !Number.isFinite(item) || item < field.min || item > field.max) {
          throw new Error('Invalid setting: ' + key);
        }
      } else if (field.type === 'select') {
        if (!field.options?.some(option => option.value === item)) throw new Error('Invalid setting: ' + key);
      } else {
        throw new Error('Unsupported setting schema type: ' + field.type);
      }
      if (field.readonly && previousSettings &&
          Object.prototype.hasOwnProperty.call(previousSettings, key) && previousSettings[key] !== item) {
        throw new Error('Setting is read-only: ' + key);
      }
    }
  }

  snapshot() {
    return {
      project: this.project,
      revision: this.revision,
      source: this.source,
      settings: { ...this.settings },
    };
  }

  // Replaces the GDScript source when baseRevision matches the current revision (PUT /api/editor/source).
  updateSource(source, baseRevision) {
    return this.enqueue(async () => {
      this.validate({ source, settings: this.settings });
      if (baseRevision !== this.revision) return { conflict: true, reason: 'revision_conflict', document: this.snapshot() };
      if (source === this.source) return { conflict: false, document: this.snapshot() };
      const next = { source, settings: this.settings, revision: this.revision + 1 };
      await this.persist(next);
      this.source = next.source;
      this.revision = next.revision;
      return { conflict: false, document: this.snapshot() };
    });
  }

  enqueue(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
  }

  async persist(state) {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      await fs.promises.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx' });
      await fs.promises.rename(temporary, this.file);
    } catch (error) {
      await fs.promises.unlink(temporary).catch(() => {});
      throw error;
    }
  }
}

function knownSettings(schema, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const keys = new Set(schema.fields.map(field => field.key));
  return Object.fromEntries(Object.entries(value).filter(([key]) => keys.has(key)));
}

module.exports = { ProjectStore };
