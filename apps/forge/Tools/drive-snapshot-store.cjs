"use strict";
const crypto = require('node:crypto');
const MAX_BYTES = 4 * 1024 * 1024;
const idOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
function failure(code, status = 503) { return Object.assign(new Error(code), { code, status }); }
function descriptor(input) {
  if (!input || typeof input.accountKey !== 'string' || typeof input.projectId !== 'string' || !/^[a-f0-9]{64}$/.test(input.accountKey) || !/^[a-f0-9]{24}$/.test(input.projectId) ||
      !Number.isSafeInteger(input.revision) || input.revision < 1 || !idOK(input.fileId)) throw failure('invalid_snapshot', 400);
  return { accountKey: input.accountKey, projectId: input.projectId, revision: input.revision, fileId: input.fileId };
}
function encodeSnapshot(input) {
  const d = descriptor(input);
  if (!input.files || typeof input.files !== 'object' || Array.isArray(input.files)) throw failure('invalid_files', 400);
  const entries = Object.entries(input.files).sort(([a],[b]) => a.localeCompare(b, 'en'));
  if (!entries.length || entries.length > 512) throw failure('invalid_files', 400);
  for (const [name, content] of entries) {
    if (!name || name.length > 240 || name.includes('\\') || name.startsWith('/') || name.split('/').some(x => !x || x === '.' || x === '..') ||
        /[\x00-\x1f\x7f]/.test(name) || typeof content !== 'string') throw failure('invalid_files', 400);
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, accountKey: d.accountKey, projectId: d.projectId,
    revision: d.revision, files: Object.fromEntries(entries) }));
  if (bytes.length > MAX_BYTES) throw failure('snapshot_too_large', 413);
  return { ...d, bytes, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

class DriveSnapshotStore {
  constructor({ enabled = false, folderId, getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
    this.enabled = enabled === true;
    this.folderId = folderId;
    this.getAccessToken = getAccessToken;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
    if (this.enabled && (!idOK(folderId) || typeof getAccessToken !== 'function' || typeof fetchImpl !== 'function')) throw failure('drive_configuration_required');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw failure('invalid_timeout', 400);
  }
  ensureEnabled() { if (!this.enabled) throw failure('drive_disabled'); }
  async request(url, options = {}) {
    this.ensureEnabled();
    let target;
    try { target = new URL(url); } catch { throw failure('invalid_drive_endpoint', 400); }
    if (target.origin !== 'https://www.googleapis.com' || target.username || target.password ||
        !/^\/(?:upload\/)?drive\/v3\/files(?:\/|$)/.test(target.pathname)) throw failure('invalid_drive_endpoint', 400);
    let token;
    try { token = await this.getAccessToken(); } catch { throw failure('drive_credentials_unavailable'); }
    if (typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw failure('drive_credentials_unavailable');
    try {
      return await this.fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { ...(options.headers || {}), Authorization: 'Bearer ' + token } });
    } catch { throw failure('drive_transport_failed'); }
  }
  async json(response) {
    if (!response.ok) throw failure('drive_request_failed', response.status === 401 ? 401 : response.status === 429 ? 429 : 502);
    try { return await response.json(); } catch { throw failure('drive_invalid_response', 502); }
  }
  // Persist this ID in a durable transaction keyed by account/project/revision
  // BEFORE putSnapshot. Retry the exact same ID and content after any ambiguity.
  async allocateFileId() {
    const data = await this.json(await this.request('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files'));
    if (!Array.isArray(data.ids) || data.ids.length !== 1 || !idOK(data.ids[0])) throw failure('drive_invalid_response', 502);
    return data.ids[0];
  }
  async metadata(d) {
    const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(d.fileId) + '?fields=id,parents,trashed,size,appProperties';
    return this.json(await this.request(url));
  }
  assertMetadata(meta, d, expectedHash) {
    const props = meta.appProperties || {};
    if (meta.id !== d.fileId || meta.trashed || !Array.isArray(meta.parents) || !meta.parents.includes(this.folderId) ||
        props.pfAccount !== d.accountKey || props.pfProject !== d.projectId || props.pfRevision !== String(d.revision) ||
        !/^[a-f0-9]{64}$/.test(props.pfSha256 || '') || (expectedHash && props.pfSha256 !== expectedHash)) throw failure('snapshot_identity_conflict', 409);
    return props.pfSha256;
  }
  async putSnapshot(input) {
    this.ensureEnabled();
    const d = encodeSnapshot(input);
    const metadata = { id: d.fileId, name: `${d.projectId}-r${d.revision}.json`, mimeType: 'application/json', parents: [this.folderId],
      appProperties: { pfAccount: d.accountKey, pfProject: d.projectId, pfRevision: String(d.revision), pfSha256: d.sha256 } };
    const boundary = 'pf_' + crypto.randomBytes(18).toString('hex');
    const body = Buffer.concat([Buffer.from('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) +
      '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n'), d.bytes, Buffer.from('\r\n--' + boundary + '--\r\n')]);
    const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body });
    let reused = false;
    if (response.status === 409) {
      this.assertMetadata(await this.metadata(d), d, d.sha256); reused = true;
    } else {
      const result = await this.json(response);
      if (result.id !== d.fileId) throw failure('drive_invalid_response', 502);
    }
    return { fileId: d.fileId, accountKey: d.accountKey, projectId: d.projectId, revision: d.revision, sha256: d.sha256, bytes: d.bytes.length, reused };
  }
  async getSnapshot(input) {
    this.ensureEnabled();
    const d = descriptor(input);
    const meta = await this.metadata(d);
    const hash = this.assertMetadata(meta, d);
    const size = Number(meta.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) throw failure('snapshot_too_large', 413);
    const response = await this.request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(d.fileId) + '?alt=media');
    if (!response.ok) throw failure('drive_request_failed', 502);
    // Bound the actual response too; metadata alone is not a memory limit.
    const chunks = []; let length = 0;
    try {
      for await (const chunk of response.body) { length += chunk.length; if (length > MAX_BYTES) throw failure('snapshot_too_large', 413); chunks.push(Buffer.from(chunk)); }
    } catch (error) { if (error.code === 'snapshot_too_large') throw error; throw failure('drive_transport_failed'); }
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== size || crypto.createHash('sha256').update(bytes).digest('hex') !== hash) throw failure('snapshot_integrity_failed', 409);
    let value;
    try { value = JSON.parse(bytes); } catch { throw failure('snapshot_integrity_failed', 409); }
    const canonical = encodeSnapshot({ ...d, files: value.files });
    if (value.schemaVersion !== 1 || value.accountKey !== d.accountKey || value.projectId !== d.projectId || value.revision !== d.revision || canonical.sha256 !== hash) throw failure('snapshot_integrity_failed', 409);
    return value;
  }
}
module.exports = { DriveSnapshotStore, encodeSnapshot, MAX_BYTES };
