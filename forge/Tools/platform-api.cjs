'use strict';

const crypto = require('node:crypto');
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_PRESENCE_PER_PROJECT = 64;
const MAX_ACTIVITY_PER_SECOND = 30;
const MAX_ACTIVITY_RATE_BUCKETS = 2048;

function projectResponse(project) {
  const { id, name, template, mode, revision } = project;
  return { project: { id, name, template, ...(mode ? { mode } : {}) }, revision,
    updatedAt: project.updatedAt, activeReleaseId: project.activeReleaseId || null,
    files: Object.entries(project.files).map(([path, content]) => ({ path, content })) };
}
function reply(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req, provided, maxBytes = MAX_BODY_BYTES) {
  if (provided !== undefined) return provided;
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw Object.assign(new Error('JSON required'), { status: 415 });
  if (Number(req.headers['content-length']) > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  const raw = await new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0, failed = false;
    req.on('data', chunk => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > maxBytes) { failed = true; chunks.length = 0; reject(Object.assign(new Error('Request too large'), { status: 413 })); }
      else chunks.push(chunk);
    });
    req.once('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.once('error', reject);
  });
  let body;
  try { body = JSON.parse(raw); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Object.assign(new Error('Expected an object'), { status: 400 });
  return body;
}

function createPlatformApi(store, { validateBuild } = {}) {
  if (!store) throw new TypeError('PlatformStore is required');
  const presenceByProject = new Map();
  const connections = new Set();
  const activityBuckets = new Map();
  let shuttingDown = false;
  const presencePayload = (id, recipient) => {
    const peers = [...(presenceByProject.get(id) || [])];
    return { count: peers.length, sessionId: recipient.sessionId,
      sessions: peers.map(peer => ({ sessionId: peer.sessionId, connectedAt: peer.connectedAt })) };
  };
  const broadcastPresence = id => {
    for (const peer of presenceByProject.get(id) || []) {
      if (!peer.closed && !peer.res.writableEnded) {
        try { peer.res.write(`event: presence\ndata: ${JSON.stringify(presencePayload(id, peer))}\n\n`); }
        catch { peer.cleanup(); }
      }
    }
  };
  const broadcastActivity = (id, event) => {
    for (const peer of presenceByProject.get(id) || []) {
      if (!peer.closed && !peer.res.writableEnded) {
        try { peer.res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`); }
        catch { peer.cleanup(); }
      }
    }
  };
  const allowActivity = (projectId, clientId) => {
    const now = Date.now();
    const key = projectId + ':' + clientId;
    let bucket = activityBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= 1000) {
      if (!bucket && activityBuckets.size >= MAX_ACTIVITY_RATE_BUCKETS) activityBuckets.delete(activityBuckets.keys().next().value);
      bucket = { startedAt: now, count: 0 };
      activityBuckets.set(key, bucket);
    }
    if (bucket.count >= MAX_ACTIVITY_PER_SECOND) return false;
    bucket.count += 1;
    return true;
  };
  const handle = async function handlePlatformApi(req, res, inputUrl, providedBody) {
    const pathname = new URL(typeof inputUrl === 'string' ? inputUrl : inputUrl.href, 'http://localhost').pathname;
    const method = req.method || 'GET';
    const sendProject = project => ({ ok: true, ...projectResponse(project) });
    const templateRoute = pathname.match(/^\/api\/platform\/templates\/([a-z0-9_-]{1,40})$/);
    const projectRoute = pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})(?:\/(history|restore|releases|events|activity|releases\/([a-f0-9]{24})\/rollback))?$/);
    const matched = pathname === '/api/platform/templates' || pathname === '/api/platform/projects' || !!templateRoute || !!projectRoute;
    if (!matched) return false;
    try {
      if (pathname === '/api/platform/templates' && method === 'GET') return reply(res, 200, { ok: true, templates: store.listTemplates() }), true;
      if (templateRoute && method === 'GET') {
        const template = store.getTemplate(templateRoute[1]);
        const { files, ...metadata } = template;
        return reply(res, 200, { ok: true, template: metadata, files: Object.entries(files).map(([path, content]) => ({ path, content })) }), true;
      }
      if (pathname === '/api/platform/projects' && method === 'GET') return reply(res, 200, { ok: true, projects: store.listProjects() }), true;
      if (pathname === '/api/platform/projects' && method === 'POST') {
        const body = await readBody(req, providedBody);
        const project = store.createProject(body);
        return reply(res, 201, sendProject(project)), true;
      }
      if (!projectRoute) return reply(res, 405, { ok: false, error: 'Method not supported' }), true;
      const [, id, action, rollbackId] = projectRoute;
      if (action === 'events' && method === 'GET') {
        const existing = presenceByProject.get(id);
        if ((existing?.size || 0) >= MAX_PRESENCE_PER_PROJECT) return reply(res, 429, { ok: false, error: 'Project presence limit reached' }), true;
        const initial = store.getProject(id);
        const unsubscribe = store.subscribe(id, event => { if (!res.writableEnded) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); });
        const connection = { res, sessionId: crypto.randomBytes(16).toString('hex'), connectedAt: new Date().toISOString(), closed: false, unsubscribe, heartbeat: null };
        const peers = existing || new Set();
        peers.add(connection);
        presenceByProject.set(id, peers);
        connections.add(connection);
        connection.cleanup = () => {
          if (connection.closed) return;
          connection.closed = true;
          clearInterval(connection.heartbeat);
          connection.unsubscribe();
          connections.delete(connection);
          const active = presenceByProject.get(id);
          active?.delete(connection);
          if (active && !active.size) presenceByProject.delete(id);
          if (!shuttingDown) broadcastPresence(id);
        };
        res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write(`event: project\ndata: ${JSON.stringify({ type: 'snapshot', project: projectResponse(initial) })}\n\n`);
        connection.heartbeat = setInterval(() => { if (!connection.closed && !res.writableEnded) res.write(': keep-alive\n\n'); }, 20000);
        connection.heartbeat.unref();
        res.once('close', connection.cleanup);
        broadcastPresence(id);
        return true;
      }
      if (action === 'activity' && method === 'POST') {
        const body = await readBody(req, providedBody, 4096);
        if (typeof body.clientId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.clientId)) throw Object.assign(new Error('Invalid clientId'), { status: 400 });
        if (!['cursor', 'typing', 'step'].includes(body.kind)) throw Object.assign(new Error('Invalid activity kind'), { status: 400 });
        if (typeof body.label !== 'string' || body.label.length > 160) throw Object.assign(new Error('label must be a bounded string'), { status: 400 });
        const label = body.label.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
        if (!label) throw Object.assign(new Error('label is required'), { status: 400 });
        const event = { clientId: body.clientId, label, kind: body.kind, timestamp: new Date().toISOString() };
        if (body.clickLabel !== undefined) {
          if (body.kind !== 'step' || typeof body.clickLabel !== 'string' || body.clickLabel.length > 120) throw Object.assign(new Error('clickLabel must be a bounded string on step activity'), { status: 400 });
          const clickLabel = body.clickLabel.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60);
          if (clickLabel) {
            event.clickLabel = clickLabel;
            if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || body.x < 0 || body.x > 1 || body.y < 0 || body.y > 1) throw Object.assign(new Error('click coordinates must be normalized to [0,1]'), { status: 400 });
            event.x = body.x;
            event.y = body.y;
          }
        }
        if (body.kind === 'cursor') {
          if (!Number.isFinite(body.x) || !Number.isFinite(body.y) || body.x < 0 || body.x > 1 || body.y < 0 || body.y > 1) throw Object.assign(new Error('cursor coordinates must be normalized to [0,1]'), { status: 400 });
          event.x = body.x;
          event.y = body.y;
        }
        if (body.kind === 'typing' && body.text !== undefined) {
          if (typeof body.text !== 'string' || body.text.length > 240) throw Object.assign(new Error('typing text must be at most 240 characters'), { status: 400 });
          event.text = body.text.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120);
        }
        store.getProject(id);
        if (!allowActivity(id, body.clientId)) return reply(res, 429, { ok: false, error: 'activity_rate_limited' }), true;
        broadcastActivity(id, event);
        return reply(res, 202, { ok: true }), true;
      }
      if (!action && method === 'GET') return reply(res, 200, sendProject(store.getProject(id))), true;
      if (!action && method === 'PUT') {
        const body = await readBody(req, providedBody);
        const project = await store.updateFiles(id, body);
        return reply(res, 200, sendProject(project)), true;
      }
      if (action === 'history' && method === 'GET') return reply(res, 200, { ok: true, history: store.history(id) }), true;
      if (action === 'restore' && method === 'POST') {
        const body = await readBody(req, providedBody);
        const project = await store.restoreRevision(id, body.revision, body);
        return reply(res, 200, sendProject(project)), true;
      }
      if (action === 'releases' && method === 'GET') return reply(res, 200, { ok: true, releases: store.listReleases(id) }), true;
      if (action === 'releases' && method === 'POST') {
        const body = await readBody(req, providedBody);
        const project = store.getProject(id);
        const revision = body.revision === undefined ? project.revision : body.revision;
        let buildInfo = null;
        if (typeof body.buildId !== 'string' || !validateBuild) throw Object.assign(new Error('A matching successful build is required to publish a release'), { status: 409 });
        buildInfo = await validateBuild(body.buildId, id, revision);
        if (!buildInfo) throw Object.assign(new Error('Build does not match this project revision'), { status: 409 });
        const build = {
          buildId: buildInfo.buildId || buildInfo.id || body.buildId,
          ...(typeof buildInfo.previewUrl === 'string' ? { previewUrl: buildInfo.previewUrl } : {}),
          ...(typeof buildInfo.downloadUrl === 'string' ? { downloadUrl: buildInfo.downloadUrl } : {}),
        };
        const release = await store.createRelease(id, { revision, label: body.label, build });
        return reply(res, 201, { ok: true, release }), true;
      }
      if (rollbackId && method === 'POST') {
        const body = await readBody(req, providedBody);
        const project = await store.rollbackRelease(id, rollbackId, body);
        return reply(res, 200, sendProject(project)), true;
      }
      return reply(res, 405, { ok: false, error: 'Method not supported' }), true;
    } catch (error) {
      const status = error.status || 400;
      const details = { ok: false, error: error.message };
      if (error.project) Object.assign(details, projectResponse(error.project));
      if (error.conflictingFiles) details.conflictingFiles = error.conflictingFiles;
      return reply(res, status, details), true;
    }
  };
  handle.close = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const connection of [...connections]) {
      connection.cleanup();
      if (!connection.res.writableEnded) connection.res.end();
    }
    presenceByProject.clear();
    connections.clear();
    activityBuckets.clear();
  };
  return handle;
}

module.exports = { createPlatformApi, projectResponse };
