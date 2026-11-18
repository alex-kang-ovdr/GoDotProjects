'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ProjectStore } = require('./Tools/project-store.cjs');
const { NativeRuntime } = require('./Tools/native-runtime.cjs');
const { attachCollaboration } = require('./Tools/collaboration.cjs');
const { attachBrawlLabs } = require('./Tools/brawllabs-multiplayer.cjs');
const { createOriginPolicy } = require('./Tools/origin-policy.cjs');
const { exportGodotProject } = require('./Tools/export-godot-project.cjs');
const { BuildQueue } = require('./Tools/build-queue.cjs');
const { PlatformStore } = require('./Tools/platform-store.cjs');
const { createPlatformApi } = require('./Tools/platform-api.cjs');
const { loadAssetStore } = require('./Tools/template-catalog.cjs');

const root = fs.realpathSync(__dirname);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.lua': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.zip': 'application/zip' };

function insideRoot(file) {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function createServer(options = {}) {
  const originAllowed = createOriginPolicy(options.publicOrigin ?? process.env.PUBLIC_ORIGIN);
  const store = new ProjectStore(root, options.workspace);
  const builds = new BuildQueue(root, options.buildDirectory);
  const platform = new PlatformStore(root, options.platformWorkspace);
  const platformApi = createPlatformApi(platform, { validateBuild: (id, projectId, revision) => { const b = builds.get(id); return b?.status === 'succeeded' && b.projectId === projectId && b.revision === revision ? b : null; } });
  const runtimes = new Map();
  const sessionCommands = new Map();
  // Serialize the whole lifecycle, including asynchronous process teardown.
  const inSession = async (id, operation) => {
    const previous = sessionCommands.get(id) || Promise.resolve();
    const next = previous.catch(() => {}).then(operation);
    sessionCommands.set(id, next);
    try { return await next; }
    finally { if (sessionCommands.get(id) === next) sessionCommands.delete(id); }
  };
  const closeRuntime = id => { const closed = runtimes.get(id)?.runtime.close(); runtimes.delete(id); return closed; };
  let collaboration;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const reply = (status, message, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };
    const publishedRoute = req.url.match(new RegExp('^/play/([a-f0-9]{24})/?$'));
    if (publishedRoute && req.method === 'GET') {
      try {
        const project = platform.getProject(publishedRoute[1]);
        const release = platform.listReleases(project.id).find(item => item.id === project.activeReleaseId);
        if (!release?.previewUrl) return reply(404,'No published version');
        res.writeHead(302,{Location:release.previewUrl,'Cache-Control':'no-store'}); return res.end();
      } catch { return reply(404,'Project not found'); }
    }
    if (req.url.startsWith('/api/')) {
      if (req.url === '/api/agent-chat') {
        return require('./Tools/agent-chat-provider.cjs').handleAgentChat(req, res, json);
      }
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      const showcaseRoute = req.url.match(/^\/api\/platform-addon\/showcase\/([a-z0-9-]{1,40})$/);
      const sharedReplay = req.url === '/api/platform-addon/replay';
      const agentChat = req.url === '/api/platform-addon/agent-chat';
      if ((showcaseRoute || sharedReplay || agentChat) && req.method === 'GET') {
        try {
          const manifest = showcaseRoute ? platform.getShowcase(showcaseRoute[1]) : undefined;
          const directory = agentChat ? 'playforge_agent_chat' : 'playforge_showcase';
          const names = agentChat ? ['plugin.cfg', 'plugin.gd', 'chat_panel.gd', 'scene_commands.gd']
            : ['plugin.cfg', 'plugin.gd', 'showcase_panel.gd', 'showcase_canvas.gd',
            'showcase_timeline.gd', 'showcase_scene_replay.gd', 'showcase_targets.gd', 'showcase_import.gd', 'showcase_store.gd',
            'showcase_import_history.gd', 'showcase_feedback.gd', 'showcase_gestures.gd'];
          const entries = await Promise.all(names.map(async name => [name,
            await fs.promises.readFile(path.join(root, 'Godot/addons', directory, name), 'utf8')]));
          return json(200, { ok: true, manifest, files: Object.fromEntries(entries), store: agentChat ? undefined : loadAssetStore(root) });
        } catch (error) {
          return json(error.status === 404 ? 404 : 503, { ok: false, error: 'Editor add-on unavailable' });
        }
      }
      const addonFile = req.url.match(new RegExp("^/api/platform-addon/(plugin[.]gd|plugin[.]cfg)$"));
      if (addonFile && req.method === 'GET') {
        try { return reply(200, await fs.promises.readFile(path.join(root,'Godot/addons/playforge_platform',addonFile[1]),'utf8')); }
        catch { return reply(404,'Plugin unavailable'); }
      }
      if (req.url.startsWith('/api/platform/')) { if (await platformApi(req, res, new URL(req.url, 'http://localhost'))) return; }
      const brawlRoomRoute = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/brawllabs\/rooms\/([a-f0-9]{12})$/);
      if (brawlRoomRoute && req.method === 'GET') {
        const metadata = brawllabs.metadata(brawlRoomRoute[1]);
        return metadata ? json(200, { ok: true, room: metadata }) : json(404, { ok: false, error: 'Room not found' });
      }
      if (req.url === '/api/export/godot-project.zip' && req.method === 'GET') {
        const document = store.snapshot();
        const archive = exportGodotProject(root, document, options.publicOrigin || process.env.PUBLIC_ORIGIN || 'http://' + req.headers.host);
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="PlayForge-Godot-r' + document.revision + '.zip"', 'Content-Length': archive.length, 'Cache-Control': 'no-store' });
        return res.end(archive);
      }
      if (req.url === '/api/project' && req.method === 'GET') return json(200, store.snapshot());
      const buildRoute = new URL(req.url, 'http://localhost').pathname.match(/^\/api\/builds\/([a-f0-9]{16})(?:\/files\/([a-zA-Z0-9_.-]+))?$/);
      if (buildRoute && req.method === 'GET') {
        const build = builds.get(buildRoute[1]);
        if (!build) return json(404, { ok: false, error: 'Build not found' });
        if (!buildRoute[2]) return json(200, { ok: true, build });
        const file = builds.file(buildRoute[1], buildRoute[2]);
        if (!file) return json(404, { ok: false, error: 'Build file not found' });
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(file.endsWith('.zip') ? { 'Content-Disposition': 'attachment; filename="PlayForge-Web-' + build.id + '.zip"' } : {}) });
        const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res); return;
      }
      if (req.url === '/api/health' && req.method === 'GET') { const status = NativeRuntime.availability(root); return json(200, { ok: true, runtime: status.available, engine: 'Godot', brawllabsMultiplayer: true, multiplayerTestWorkspace: 1, nativeGameIframe: 1 }); }
      if (!['POST', 'PUT'].includes(req.method)) return json(405, { ok: false, error: 'Method not supported' });
      if (!req.headers['content-type']?.startsWith('application/json')) return json(415, { ok: false, error: 'JSON required' });
      try {
        if (Number(req.headers['content-length']) > 512000) { req.resume(); return json(413, { ok: false, error: 'Request too large' }); }
        const raw = await new Promise((resolve, reject) => {
          const chunks = []; let size = 0, failed = false;
          req.on('data', chunk => {
            if (failed) return;
            size += chunk.length;
            if (size > 512000) { failed = true; chunks.length = 0; reject(Object.assign(new Error('Request too large'), { status: 413 })); }
            else chunks.push(chunk);
          });
          req.once('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
          req.once('error', reject);
        });
        const body = JSON.parse(raw);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { ok: false, error: 'Expected an object' });
        const platformBuild = req.url.match(/^\/api\/platform-builds\/([a-zA-Z0-9_-]+)$/);
        if (platformBuild && req.method === 'POST') {
          const snapshot = platform.getProject(platformBuild[1]);
          if (body.revision !== snapshot.revision) return json(409, {ok:false,error:'revision_conflict'});
          return json(202, {ok:true,build:builds.enqueue({id:platformBuild[1], revision:snapshot.revision, files:Object.entries(snapshot.files).map(([path,content])=>({path,content}))})});
        }
        if (req.url === '/api/editor/source' && req.method === 'PUT') {
          if (typeof body.source !== 'string' || Buffer.byteLength(body.source) > 256000 || !Number.isSafeInteger(body.baseRevision)) return json(400, { ok: false, error: 'Source and baseRevision required' });
          const current = store.snapshot();
          if (body.baseRevision !== current.revision) return json(409, { ok: false, error: 'revision_conflict', document: current });
          const result = await store.update({ source: body.source, settings: current.settings, baseRevision: body.baseRevision });
          if (result.conflict) return json(409, { ok: false, error: 'revision_conflict', document: result.document });
          collaboration.documentChanged(result.document, 'official-editor');
          return json(200, { ok: true, document: result.document });
        }
        if (req.url === '/api/builds' && req.method === 'POST') {
          if (body.target !== 'web') return json(400, { ok: false, error: 'This PoC builds the web target only' });
          const document = store.snapshot();
          if (body.revision !== document.revision) return json(409, { ok: false, error: 'revision_conflict', document });
          return json(202, { ok: true, build: builds.enqueue(document) });
        }
        if (req.url === '/api/project' && req.method === 'PUT') {
          const result = await store.update(body);
          if (result.conflict) return json(409, { ok: false, error: 'revision_conflict', document: result.document });
          collaboration.documentChanged(result.document, body.clientId);
          return json(200, { ok: true, ...result.document, document: result.document });
        }
        if (req.url === '/api/pie' && req.method === 'POST') {
          const id = body.sessionId;
          if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id || '')) return json(400, { ok: false, error: 'Invalid session ID' });
          if (!['load', 'step', 'input', 'snapshot', 'settings', 'stop'].includes(body.op)) return json(400, { ok: false, error: 'Unknown PIE command' });
          return await inSession(id, async () => {
          if (body.op === 'stop') { await closeRuntime(id); return json(200, { ok: true, state: null }); }
          if (body.op === 'load' || body.op === 'settings') {
            if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings) || Object.keys(body.settings).length > 128
              || Object.values(body.settings).some(value => !(typeof value === 'number' && Number.isFinite(value)) && !(typeof value === 'string' && value.length <= 128) && typeof value !== 'boolean')) {
              return json(400, { ok: false, error: 'Runtime settings must contain bounded scalar values' });
            }
          }
          if (body.op === 'load') {
            if (typeof body.source !== 'string' || Buffer.byteLength(body.source, 'utf8') > 256000) return json(400, { ok: false, error: 'GDScript source exceeds the allowed size' });
            await closeRuntime(id);
            if (runtimes.size >= 16) return json(429, { ok: false, error: 'Runtime session limit reached' });
            const runtime = new NativeRuntime(root, () => {
              if (runtimes.get(id)?.runtime === runtime) runtimes.delete(id);
            }, { realtime: true });
            runtimes.set(id, { runtime, lastUsed: Date.now() });
          }
          const session = runtimes.get(id);
          if (!session) return json(409, { ok: false, error: 'Start PIE first' });
          session.lastUsed = Date.now();
          const { sessionId, ...command } = body;
          let result;
          try { result = await session.runtime.request(command); }
          catch (error) { await closeRuntime(id); throw error; }
          if (body.op === 'load' && !result.ok) await closeRuntime(id);
          return json(200, result);
          });
        }
        return json(404, { ok: false, error: 'Unknown API' });
      } catch (error) { return json(error.status || 400, { ok: false, error: error.message }); }
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Read-only server', { Allow: 'GET, HEAD' });
    let pathname;
    try { pathname = decodeURIComponent(req.url.split('?')[0]); }
    catch { return reply(400, 'Invalid URL encoding'); }
    if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\0:]/.test(pathname)) return reply(400, 'Invalid path');
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(part => part.startsWith('.') || ['node_modules', 'saved', 'engine', 'tools', 'godot'].includes(part.toLowerCase()))) {
      return reply(403, 'Private path');
    }
    let file = path.resolve(root, '.' + pathname);
    if (!insideRoot(file)) return reply(403, 'Outside project');
    try {
      let info = await fs.promises.stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(308, { Location: encodeURI(pathname + '/') });
          return res.end();
        }
        file = path.join(file, 'index.html');
      }
      file = await fs.promises.realpath(file);
      if (!insideRoot(file)) return reply(403, 'Outside project');
      info = await fs.promises.stat(file);
      if (!info.isFile()) return reply(404, 'Not found');
      res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': info.size, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer' });
      if (req.method === 'HEAD') return res.end();
      const stream = fs.createReadStream(file);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) reply(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, 'File unavailable');
      else res.destroy();
    }
  });
  collaboration = attachCollaboration(server, store, closeRuntime, originAllowed);
  const brawllabs = attachBrawlLabs(server, { originAllowed, validateBuild: (id, projectId) => {
    try {
      const b = builds.get(id);
      return platform.getProject(projectId).template === 'brawllabs' && b?.status === 'succeeded' && b.projectId === projectId ? b : null;
    } catch { return null; }
  } });
  server.on('close', () => brawllabs.close());
  const cleanup = setInterval(() => {
    for (const [id, session] of runtimes) if (Date.now() - session.lastUsed > 60000) closeRuntime(id);
  }, 10000);
  cleanup.unref();
  server.on('close', () => { platformApi.close?.(); clearInterval(cleanup); builds.close(); collaboration.close(); for (const id of runtimes.keys()) closeRuntime(id); });
  server.shutdown = () => { brawllabs.close(); platformApi.close?.(); builds.close(); collaboration.close(); for (const id of runtimes.keys()) closeRuntime(id); server.close(); };
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('PORT must be an integer from 1 to 65535.');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.on('error', error => {
      console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Set PORT to another value.` : error.message);
      process.exitCode = 1;
    });
    const host = process.env.HOST || '127.0.0.1';
    server.listen(port, host, () => {
      console.log(`GamePlayForge: http://127.0.0.1:${port}/`);
      if (host === '0.0.0.0') {
        for (const adapters of Object.values(require('node:os').networkInterfaces())) for (const adapter of adapters || []) {
          if (adapter.family === 'IPv4' && !adapter.internal) console.log(`LAN collaboration: http://${adapter.address}:${port}/Studio/`);
        }
      }
    });
    process.on('SIGINT', () => server.shutdown());
    process.on('SIGTERM', () => server.shutdown());
  }
}
module.exports = { createServer };
