'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Y = require('yjs');

const MAX_SOURCE_BYTES = 256000;
const MAX_UPDATE_BYTES = 512000;
const LOCK_LEASE_MS = 30000;
const ID_PATTERN = /^[a-zA-Z0-9_-]{8,100}$/;

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
    this.textRevision = 1;
    this.settingsRevision = 1;
    this.lockFence = 0;
    this.lock = null;
    this.operations = [];
    this.file = path.join(workspace || path.join(root, 'Saved', 'GodotWorkspace'), 'tappy.json');
    this.pending = Promise.resolve();
    this.textDoc = new Y.Doc();

    if (fs.existsSync(this.file)) {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const savedSettings = knownSettings(this.settingsSchema, saved.settings);
      this.validate({ ...saved, settings: savedSettings }, savedSettings);
      if (!Number.isSafeInteger(saved.revision) || saved.revision < 1) throw new Error('Invalid saved workspace revision');
      if (saved.textState !== undefined) {
        if (typeof saved.textState !== 'string' || saved.textState.length > 700000) throw new Error('Invalid saved text state');
        Y.applyUpdate(this.textDoc, decodeBase64(saved.textState, MAX_UPDATE_BYTES));
        this.source = this.textDoc.getText('lua').toString();
        if (saved.source !== this.source) throw new Error('Saved GDScript source does not match its Yjs state');
      } else {
        this.textDoc.getText('lua').insert(0, saved.source);
        this.source = saved.source;
      }
      this.settings = savedSettings;
      this.revision = saved.revision;
      this.textRevision = Number.isSafeInteger(saved.textRevision) && saved.textRevision >= 1 ? saved.textRevision : 1;
      this.settingsRevision = Number.isSafeInteger(saved.settingsRevision) && saved.settingsRevision >= 1 ? saved.settingsRevision : 1;
      this.lockFence = Number.isSafeInteger(saved.lockFence) && saved.lockFence >= 0 ? saved.lockFence : 0;
      this.operations = Array.isArray(saved.operations) ? saved.operations : [];
      for (const operation of this.operations) {
        if (!operation || typeof operation.clientId !== 'string' || typeof operation.requestId !== 'string' ||
            typeof operation.hash !== 'string' || typeof operation.update !== 'string') {
          throw new Error('Invalid saved collaboration journal');
        }
      }
    } else {
      this.textDoc.getText('lua').insert(0, this.source);
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
      textRevision: this.textRevision,
      settingsRevision: this.settingsRevision,
      source: this.source,
      textState: encodeBase64(Y.encodeStateAsUpdate(this.textDoc)),
      settings: { ...this.settings },
    };
  }

  snapshotLock(clientId) {
    this.expireLock();
    const state = { resource: 'settings', owner: this.lock?.clientId ?? null, expiresAt: this.lock?.expiresAt ?? null };
    if (this.lock && clientId === this.lock.clientId) state.token = this.lock.token;
    return state;
  }

  acquireLock(clientId) {
    this.validateClientId(clientId);
    return this.enqueue(async () => {
      this.expireLock();
      const now = Date.now();
      if (this.lock && this.lock.clientId !== clientId) {
        return { acquired: false, ...this.snapshotLock() };
      }
      if (this.lock?.clientId === clientId) {
        this.lock.expiresAt = now + LOCK_LEASE_MS;
        return { acquired: true, ...this.snapshotLock(clientId) };
      }

      if (!Number.isSafeInteger(this.lockFence + 1)) throw new Error('Settings lock fence exhausted');
      const nextFence = this.lockFence + 1;
      const state = this.persistedState({ lockFence: nextFence });
      await this.persist(state);
      this.lockFence = nextFence;
      this.lock = { clientId, token: nextFence, expiresAt: Date.now() + LOCK_LEASE_MS };
      return { acquired: true, ...this.snapshotLock(clientId) };
    });
  }

  releaseLock(clientId, token) {
    return this.enqueue(async () => {
      this.expireLock();
      if (!this.lock || this.lock.clientId !== clientId || (token !== undefined && token !== this.lock.token)) return false;
      this.lock = null;
      return true;
    });
  }

  update(change) {
    return this.enqueue(async () => {
      if (!change || typeof change !== 'object' || Array.isArray(change)) throw new Error('Project update must be an object');
      this.validate(change);
      const sourceChanged = change.source !== this.source;
      const settingsChanged = !sameJson(change.settings, this.settings);

      if (sourceChanged && change.baseRevision !== this.revision) {
        return { conflict: true, reason: 'revision_conflict', document: this.snapshot() };
      }
      if (settingsChanged) {
        if (!Object.prototype.hasOwnProperty.call(change, 'settingsRevision')) {
          const error = new Error('settings_lock_required');
          error.status = 423;
          throw error;
        }
        if (change.settingsRevision !== this.settingsRevision) {
          return { conflict: true, reason: 'settings_revision_conflict', document: this.snapshot() };
        }
        this.requireLock(change.clientId, change.lockToken);
      }
      if (!sourceChanged && !settingsChanged) return { conflict: false, document: this.snapshot() };

      let candidateDoc = this.textDoc;
      if (sourceChanged) {
        candidateDoc = cloneDoc(this.textDoc);
        const text = candidateDoc.getText('lua');
        candidateDoc.transact(() => {
          if (text.length) text.delete(0, text.length);
          if (change.source.length) text.insert(0, change.source);
        });
      }
      const next = this.persistedState({
        source: sourceChanged ? change.source : this.source,
        settings: settingsChanged ? { ...change.settings } : this.settings,
        revision: this.revision + 1,
        textRevision: this.textRevision + (sourceChanged ? 1 : 0),
        settingsRevision: this.settingsRevision + (settingsChanged ? 1 : 0),
        textState: encodeBase64(Y.encodeStateAsUpdate(candidateDoc)),
      });
      try {
        await this.persist(next);
      } catch (error) {
        if (candidateDoc !== this.textDoc) candidateDoc.destroy();
        throw error;
      }
      if (candidateDoc !== this.textDoc) {
        this.textDoc.destroy();
        this.textDoc = candidateDoc;
      }
      this.assignState(next);
      return { conflict: false, document: this.snapshot() };
    });
  }

  applyText(update, clientId, requestId) {
    this.validateClientId(clientId);
    if (!ID_PATTERN.test(requestId || '')) throw new Error('Invalid text update request ID');
    const bytes = decodeBase64(update, MAX_UPDATE_BYTES);
    const base64 = bytes.toString('base64');
    const hash = crypto.createHash('sha256').update(bytes).digest('hex');
    return this.enqueue(async () => {
      const previous = this.operations.find(operation => operation.clientId === clientId && operation.requestId === requestId);
      if (previous) {
        if (previous.hash !== hash) throw new Error('Text request ID was reused with a different update');
        return { duplicate: true, update: base64, revision: previous.revision, textRevision: previous.textRevision,
          document: this.snapshot() };
      }

      const candidateDoc = cloneDoc(this.textDoc);
      try {
        Y.applyUpdate(candidateDoc, bytes);
        const source = candidateDoc.getText('lua').toString();
        if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) throw new Error('GDScript source must be under 256 KB');
        const revision = this.revision + 1;
        const textRevision = this.textRevision + 1;
        const operation = { clientId, requestId, hash, update: base64, revision, textRevision, at: Date.now() };
        const next = this.persistedState({
          source,
          revision,
          textRevision,
          textState: encodeBase64(Y.encodeStateAsUpdate(candidateDoc)),
          operations: [...this.operations, operation],
        });
        await this.persist(next);
        this.textDoc.destroy();
        this.textDoc = candidateDoc;
        this.assignState(next);
        return { duplicate: false, update: base64, revision, textRevision, document: this.snapshot() };
      } catch (error) {
        candidateDoc.destroy();
        throw error;
      }
    });
  }

  requireLock(clientId, token) {
    this.expireLock();
    if (!this.lock || this.lock.clientId !== clientId || token !== this.lock.token) {
      const error = new Error('settings_lock_required');
      error.status = 423;
      throw error;
    }
  }

  validateClientId(clientId) {
    if (typeof clientId !== 'string' || !ID_PATTERN.test(clientId)) throw new Error('Invalid client ID');
  }

  expireLock() {
    if (this.lock && this.lock.expiresAt <= Date.now()) this.lock = null;
  }

  enqueue(operation) {
    const task = this.pending.then(operation);
    this.pending = task.catch(() => {});
    return task;
  }

  persistedState(overrides = {}) {
    return {
      source: this.source,
      settings: this.settings,
      revision: this.revision,
      textRevision: this.textRevision,
      settingsRevision: this.settingsRevision,
      textState: encodeBase64(Y.encodeStateAsUpdate(this.textDoc)),
      operations: this.operations,
      lockFence: this.lockFence,
      ...overrides,
    };
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

  assignState(state) {
    this.source = state.source;
    this.settings = state.settings;
    this.revision = state.revision;
    this.textRevision = state.textRevision;
    this.settingsRevision = state.settingsRevision;
    this.operations = state.operations;
    this.lockFence = state.lockFence;
  }
}

function sameJson(a, b) {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && a[key] === b[key]);
}
function knownSettings(schema, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const keys = new Set(schema.fields.map(field => field.key));
  return Object.fromEntries(Object.entries(value).filter(([key]) => keys.has(key)));
}
function encodeBase64(bytes) { return Buffer.from(bytes).toString('base64'); }
function decodeBase64(value, maximumBytes) {
  if (typeof value !== 'string' || value.length === 0 || value.length > Math.ceil(maximumBytes * 4 / 3) + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid collaboration update');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0 || bytes.length > maximumBytes || bytes.toString('base64') !== value) {
    throw new Error('Invalid collaboration update');
  }
  return bytes;
}
function cloneDoc(doc) {
  const clone = new Y.Doc();
  Y.applyUpdate(clone, Y.encodeStateAsUpdate(doc));
  return clone;
}

module.exports = { ProjectStore };
