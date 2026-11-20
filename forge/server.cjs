'use strict';
const { EventEmitter } = require('node:events');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { ProjectStore } = require('./Tools/project-store.cjs');
const { NativeRuntime } = require('./Tools/native-runtime.cjs');
const { attachCollaboration } = require('./Tools/collaboration.cjs');
const { attachBrawlLabs } = require('./Tools/brawllabs-multiplayer.cjs');
const { attachFortressWar } = require('./Tools/fortress-multiplayer.cjs');
const { createOriginPolicy, requestOrigin } = require('./Tools/origin-policy.cjs');
const { exportGodotProject } = require('./Tools/export-godot-project.cjs');
const { BuildQueue } = require('./Tools/build-queue.cjs');
const { PlatformStore } = require('./Tools/platform-store.cjs');
const { createPlatformApi } = require('./Tools/platform-api.cjs');
const { createHubSessionAuth, hubAuthConfigFromEnv, validateHubAccountUrl } = require('./Tools/hub-session-auth.cjs');
const { loadAssetStore, showcaseStagedFiles } = require('./Tools/template-catalog.cjs');
const { createAssetLibraryHandler } = require('./Tools/asset-library.cjs');
const { createAgentChatProvider, isAgentChatRoute } = require('./Tools/agent-chat-provider.cjs');

const root = fs.realpathSync(__dirname);
const MAX_ACCOUNTS = 1024;
const MAX_RUNTIMES_PER_ACCOUNT = 4;
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

function normalizeBasePath(raw) {
  const value = String(raw || '').trim();
  if (!value || value === '/') return '';
  if (!/^\/[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error('PLAYFORGE_BASE_PATH must be empty or a single path segment like /forge.');
  }
  return value;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function loginGateHtml(loginUrl) {
  const href = escapeHtml(loginUrl);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlayForge 로그인 필요</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#161a22;color:#e8edf5;font:15px/1.6 system-ui,sans-serif}main{max-width:420px;padding:28px;border:1px solid #343d4d;border-radius:12px;background:#1f2531}h1{margin:0 0 8px;font-size:20px}p{margin:0 0 18px;color:#b4c0d2}a{display:inline-block;padding:10px 16px;border-radius:8px;background:#4c8df6;color:#fff;text-decoration:none;font-weight:600}</style></head><body><main><h1>PlayHub Google 로그인이 필요합니다</h1><p>PlayForge 에디터와 개인 프로젝트는 PlayHub Google 계정으로 로그인한 뒤 이용할 수 있습니다.</p><a href="${href}">PlayHub 로그인으로 이동</a></main></body></html>`;
}

function firstOrigin(configured) {
  if (!configured) return '';
  if (Array.isArray(configured)) return String(configured[0] || '').trim();
  return String(configured).split(',')[0].trim();
}

function createServer(options = {}) {
  const configuredOrigin = options.publicOrigin ?? process.env.PUBLIC_ORIGIN;
  const originAllowed = createOriginPolicy(configuredOrigin);
  const basePath = normalizeBasePath(options.basePath ?? process.env.PLAYFORGE_BASE_PATH ?? '');
  const resolvedBuildMode = String(options.buildMode || process.env.PLAYFORGE_BUILD_MODE || process.env.NODE_ENV || 'debug').trim().toLowerCase();
  const remoteControlEnabled = ['debug', 'test', 'development'].includes(resolvedBuildMode);
  const hubAuthConfig = options.hubAuth === false ? null : (options.hubAuth || hubAuthConfigFromEnv());
  const hubAccountUrl = validateHubAccountUrl(options.hubAccountUrl || hubAuthConfig?.loginUrl || process.env.PLAYHUB_FORGE_HUB_ACCOUNT_URL || '/?view=account');
  const hubAuth = hubAuthConfig ? createHubSessionAuth({ ...hubAuthConfig, loginUrl: hubAuthConfig.loginUrl || hubAccountUrl }) : null;
  const accountsDirectory = hubAuth ? path.resolve(hubAuthConfig.accountsDirectory || path.join(root, 'Saved/HubAccounts')) : null;
  const studioDirectory = hubAuth ? path.resolve(hubAuthConfig.studioDirectory || path.join(root, 'Saved/HubStudios')) : null;

  const stripBasePath = rawUrl => {
    if (!basePath || typeof rawUrl !== 'string') return rawUrl;
    if (rawUrl === basePath) return '/';
    if (rawUrl.startsWith(basePath + '/')) return rawUrl.slice(basePath.length);
    if (rawUrl.startsWith(basePath + '?')) return '/' + rawUrl.slice(basePath.length);
    return rawUrl;
  };

  const store = hubAuth ? null : new ProjectStore(root, options.workspace);
  const builds = new BuildQueue(root, options.buildDirectory);
  const assetLibrary = createAssetLibraryHandler(root);
  const agentChatProvider = hubAuth ? null : createAgentChatProvider({ env: options.agentChatEnv });
  const platform = hubAuth ? null : new PlatformStore(root, options.platformWorkspace);
  const platformApi = hubAuth ? null : createPlatformApi(platform, {
    buildMode: options.buildMode,
    validateBuild: (id, projectId, revision) => {
      const b = builds.get(id);
      return b?.status === 'succeeded' && b.projectId === projectId && b.revision === revision ? b : null;
    },
  });
  const accountPlatforms = new Map();
  const accountStudios = new Map();
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

  const getPlatformFor = accountKey => {
    if (!hubAuth) return { store: platform, api: platformApi };
    let entry = accountPlatforms.get(accountKey);
    if (!entry) {
      if (accountPlatforms.size >= MAX_ACCOUNTS) throw Object.assign(new Error('Account capacity reached'), { status: 503 });
      const accountStore = new PlatformStore(root, path.join(accountsDirectory, accountKey));
      const api = createPlatformApi(accountStore, {
        buildMode: options.buildMode,
        validateBuild: (id, projectId, revision) => {
          const b = builds.get(id);
          return b?.status === 'succeeded' && b.ownerKey === accountKey && b.projectId === projectId && b.revision === revision ? b : null;
        },
      });
      entry = { store: accountStore, api };
      accountPlatforms.set(accountKey, entry);
    }
    return entry;
  };

  const getStudioFor = accountKey => {
    if (!hubAuth) return { store, collaboration };
    let entry = accountStudios.get(accountKey);
    if (!entry) {
      if (accountStudios.size >= MAX_ACCOUNTS) throw Object.assign(new Error('Account capacity reached'), { status: 503 });
      const accountStore = new ProjectStore(root, path.join(studioDirectory, accountKey));
      const bus = new EventEmitter();
      const accountCollaboration = attachCollaboration(bus, accountStore, clientId => closeRuntime(`${accountKey}:${clientId}`), originAllowed);
      entry = { store: accountStore, collaboration: accountCollaboration, bus };
      accountStudios.set(accountKey, entry);
    }
    return entry;
  };

  const upgradeBus = new EventEmitter();
  let collaboration = hubAuth ? null : attachCollaboration(upgradeBus, store, closeRuntime, originAllowed);

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

    const requestUrl = stripBasePath(req.url);
    let parsedUrl;
    try { parsedUrl = new URL(requestUrl, 'http://localhost'); }
    catch { return reply(400, 'Invalid URL'); }
    const routePath = parsedUrl.pathname;

    // Legacy standalone Forge account paths always redirect to Hub's account screen.
    if (routePath === '/PrivateAccount' || routePath.startsWith('/PrivateAccount/') || routePath === '/account' || routePath.startsWith('/account/')) {
      res.writeHead(302, { Location: hubAccountUrl, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (routePath === '/api/health' && req.method === 'GET') {
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      const status = NativeRuntime.availability(root);
      return json(200, { ok: true, runtime: status.available, engine: 'Godot', brawllabsMultiplayer: true, fortressWarMultiplayer: true, multiplayerTestWorkspace: 1, nativeGameIframe: 1, hubAuth: Boolean(hubAuth) });
    }

    if (routePath === '/api/session' && req.method === 'GET') {
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      if (!hubAuth) return json(200, { ok: true, authenticated: true, hubAuth: false, csrfToken: null });
      const auth = await hubAuth.verify(req, { requireCsrf: false });
      if (!auth.authenticated) return json(auth.status, { ok: false, authenticated: false, error: auth.error, loginUrl: auth.loginUrl });
      return json(200, { ok: true, authenticated: true, hubAuth: true, displayName: auth.displayName, accountKey: auth.accountKey, csrfToken: auth.csrfToken });
    }

    let auth = null;
    if (hubAuth) {
      if (routePath.startsWith('/api/')) {
        if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
        auth = await hubAuth.verify(req);
        if (!auth.authenticated) return json(auth.status, { ok: false, error: auth.error, loginUrl: auth.loginUrl });
      } else {
        auth = await hubAuth.verify(req, { requireCsrf: false });
        if (!auth.authenticated) {
          if (auth.status === 503) return reply(503, 'Authentication service unavailable', { 'Cache-Control': 'no-store' });
          if (req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) {
            res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
            return res.end(loginGateHtml(auth.loginUrl));
          }
          return reply(401, 'Google login required', { 'Cache-Control': 'no-store' });
        }
      }
    }

    const publishedRoute = routePath.match(/^\/play\/([a-f0-9]{24})\/?$/);
    if (publishedRoute && req.method === 'GET') {
      try {
        const activePlatform = getPlatformFor(auth?.accountKey).store;
        const project = activePlatform.getProject(publishedRoute[1]);
        const release = activePlatform.listReleases(project.id).find(item => item.id === project.activeReleaseId);
        if (!release?.previewUrl) return reply(404, 'No published version');
        const target = basePath && release.previewUrl.startsWith('/') && !release.previewUrl.startsWith(basePath + '/')
          ? basePath + release.previewUrl
          : release.previewUrl;
        res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
        return res.end();
      } catch { return reply(404, 'Project not found'); }
    }

    if (routePath.startsWith('/api/')) {
      req.url = requestUrl;
      if (!originAllowed(req)) return json(403, { ok: false, error: 'Foreign origin' });
      if (isAgentChatRoute(requestUrl)) {
        // The provider uses this host's CLI/OAuth sessions, so it is never exposed to shared Hub accounts.
        if (!agentChatProvider) return json(404, { ok: false, error: 'Agent chat is unavailable in Hub mode' });
        return agentChatProvider(req, res, json);
      }
      if (assetLibrary(req, res)) return;
      const showcaseRoute = routePath.match(/^\/api\/platform-addon\/showcase\/([a-z0-9-]{1,40})$/);
      const sharedReplay = routePath === '/api/platform-addon/replay';
      const agentChat = routePath === '/api/platform-addon/agent-chat';
      const remoteControl = routePath === '/api/platform-addon/remote-control';
      if (remoteControl && req.method === 'GET') {
        if (!remoteControlEnabled) {
          return json(403, { ok: false, error: 'Remote Control add-on is disabled in Live builds (Debug/Test only).' });
        }
        try {
          const names = ['plugin.cfg', 'plugin.gd', 'remote_workspace.gd', 'remote_reflection.gd'];
          const entries = await Promise.all(names.map(async name => [name,
            await fs.promises.readFile(path.join(root, 'Godot/addons/playforge_remote_control', name), 'utf8')]));
          return json(200, { ok: true, files: Object.fromEntries(entries) });
        } catch {
          return json(503, { ok: false, error: 'Remote Control add-on unavailable' });
        }
      }
      if ((showcaseRoute || sharedReplay || agentChat) && req.method === 'GET') {
        try {
          const manifest = showcaseRoute ? getPlatformFor(auth?.accountKey).store.getShowcase(showcaseRoute[1]) : undefined;
          const directory = agentChat ? 'playforge_agent_chat' : 'playforge_replay';
          const names = agentChat ? ['plugin.cfg', 'plugin.gd', 'chat_panel.gd', 'chat_settings.gd', 'chat_context.gd',
            'chat_sessions.gd', 'chat_attachments.gd', 'chat_stream.gd', 'chat_web_dock.gd', 'scene_commands.gd']
            : ['plugin.cfg', 'plugin.gd', 'showcase_panel.gd', 'showcase_canvas.gd',
            'showcase_timeline.gd', 'showcase_scene_replay.gd', 'showcase_targets.gd', 'showcase_import.gd', 'showcase_store.gd',
            'showcase_import_history.gd', 'showcase_feedback.gd', 'showcase_gestures.gd', 'showcase_game_launch.gd', 'showcase_repository.gd'];
          const entries = await Promise.all(names.map(async name => [name,
            await fs.promises.readFile(path.join(root, 'Godot/addons', directory, name), 'utf8')]));
          return json(200, { ok: true, manifest, stagedFiles: manifest ? showcaseStagedFiles(manifest) : undefined,
            files: Object.fromEntries(entries), store: agentChat ? undefined : loadAssetStore(root) });
        } catch (error) {
          return json(error.status === 404 ? 404 : 503, { ok: false, error: 'Editor add-on unavailable' });
        }
      }
      const addonFile = routePath.match(/^\/api\/platform-addon\/(plugin[.]gd|plugin[.]cfg)$/);
      if (addonFile && req.method === 'GET') {
        try { return reply(200, await fs.promises.readFile(path.join(root, 'Godot/addons/playforge_platform', addonFile[1]), 'utf8')); }
        catch { return reply(404, 'Plugin unavailable'); }
      }
      if (routePath.startsWith('/api/platform/')) {
        try {
          const activeApi = getPlatformFor(auth?.accountKey).api;
          if (await activeApi(req, res, parsedUrl)) return;
        } catch (error) {
          return json(error.status || 503, { ok: false, error: error.message });
        }
      }
      const brawlRoomRoute = routePath.match(/^\/api\/brawllabs\/rooms\/([a-f0-9]{12})$/);
      if (brawlRoomRoute && req.method === 'GET') {
        const metadata = brawllabs.metadata(brawlRoomRoute[1]);
        return metadata ? json(200, { ok: true, room: metadata }) : json(404, { ok: false, error: 'Room not found' });
      }
      const fortressRoomRoute = routePath.match(/^\/api\/fortress-war\/rooms\/([a-f0-9]{12})$/);
      if (fortressRoomRoute && req.method === 'GET') {
        const metadata = fortressWar.metadata(fortressRoomRoute[1]);
        return metadata ? json(200, { ok: true, room: metadata }) : json(404, { ok: false, error: 'Room not found' });
      }
      if (routePath === '/api/export/godot-project.zip' && req.method === 'GET') {
        const activeStudio = getStudioFor(auth?.accountKey);
        const document = activeStudio.store.snapshot();
        const archive = exportGodotProject(root, document, firstOrigin(configuredOrigin) || 'http://' + req.headers.host);
        res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="PlayForge-Godot-r' + document.revision + '.zip"', 'Content-Length': archive.length, 'Cache-Control': 'no-store' });
        return res.end(archive);
      }
      if (routePath === '/api/project' && req.method === 'GET') {
        return json(200, getStudioFor(auth?.accountKey).store.snapshot());
      }
      const buildRoute = routePath.match(/^\/api\/builds\/([a-f0-9]{16})(?:\/files\/([a-zA-Z0-9_.-]+))?$/);
      if (buildRoute && req.method === 'GET') {
        const build = builds.get(buildRoute[1]);
        if (!build || (hubAuth && build.ownerKey !== auth.accountKey)) return json(404, { ok: false, error: 'Build not found' });
        if (!buildRoute[2]) return json(200, { ok: true, build });
        const file = builds.file(buildRoute[1], buildRoute[2]);
        if (!file) return json(404, { ok: false, error: 'Build file not found' });
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', ...(file.endsWith('.zip') ? { 'Content-Disposition': 'attachment; filename="PlayForge-Web-' + build.id + '.zip"' } : {}) });
        const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res); return;
      }
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
        const platformBuild = routePath.match(/^\/api\/platform-builds\/([a-zA-Z0-9_-]+)$/);
        if (platformBuild && req.method === 'POST') {
          const activePlatform = getPlatformFor(auth?.accountKey).store;
          const snapshot = activePlatform.getProject(platformBuild[1]);
          if (body.revision !== snapshot.revision) return json(409, { ok: false, error: 'revision_conflict' });
          return json(202, { ok: true, build: builds.enqueue({ id: platformBuild[1], revision: snapshot.revision, ...(hubAuth ? { ownerKey: auth.accountKey } : {}), files: Object.entries(snapshot.files).map(([filePath, content]) => ({ path: filePath, content })) }) });
        }
        if (routePath === '/api/editor/source' && req.method === 'PUT') {
          if (typeof body.source !== 'string' || Buffer.byteLength(body.source) > 256000 || !Number.isSafeInteger(body.baseRevision)) return json(400, { ok: false, error: 'Source and baseRevision required' });
          const activeStudio = getStudioFor(auth?.accountKey);
          const current = activeStudio.store.snapshot();
          if (body.baseRevision !== current.revision) return json(409, { ok: false, error: 'revision_conflict', document: current });
          const result = await activeStudio.store.update({ source: body.source, settings: current.settings, baseRevision: body.baseRevision });
          if (result.conflict) return json(409, { ok: false, error: 'revision_conflict', document: result.document });
          activeStudio.collaboration.documentChanged(result.document, 'official-editor');
          return json(200, { ok: true, document: result.document });
        }
        if (routePath === '/api/builds' && req.method === 'POST') {
          if (body.target !== 'web') return json(400, { ok: false, error: 'This PoC builds the web target only' });
          const activeStudio = getStudioFor(auth?.accountKey);
          const document = activeStudio.store.snapshot();
          if (body.revision !== document.revision) return json(409, { ok: false, error: 'revision_conflict', document });
          return json(202, { ok: true, build: builds.enqueue({ ...document, ...(hubAuth ? { ownerKey: auth.accountKey } : {}) }) });
        }
        if (routePath === '/api/project' && req.method === 'PUT') {
          const activeStudio = getStudioFor(auth?.accountKey);
          const result = await activeStudio.store.update(body);
          if (result.conflict) return json(409, { ok: false, error: 'revision_conflict', document: result.document });
          activeStudio.collaboration.documentChanged(result.document, body.clientId);
          return json(200, { ok: true, ...result.document, document: result.document });
        }
        if (routePath === '/api/pie' && req.method === 'POST') {
          const id = body.sessionId;
          if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id || '')) return json(400, { ok: false, error: 'Invalid session ID' });
          if (!['load', 'step', 'input', 'snapshot', 'settings', 'stop'].includes(body.op)) return json(400, { ok: false, error: 'Unknown PIE command' });
          const runtimeKey = hubAuth ? `${auth.accountKey}:${id}` : id;
          return await inSession(runtimeKey, async () => {
            if (body.op === 'stop') { await closeRuntime(runtimeKey); return json(200, { ok: true, state: null }); }
            if (body.op === 'load' || body.op === 'settings') {
              if (!body.settings || typeof body.settings !== 'object' || Array.isArray(body.settings) || Object.keys(body.settings).length > 128
                || Object.values(body.settings).some(value => !(typeof value === 'number' && Number.isFinite(value)) && !(typeof value === 'string' && value.length <= 128) && typeof value !== 'boolean')) {
                return json(400, { ok: false, error: 'Runtime settings must contain bounded scalar values' });
              }
            }
            if (body.op === 'load') {
              if (typeof body.source !== 'string' || Buffer.byteLength(body.source, 'utf8') > 256000) return json(400, { ok: false, error: 'GDScript source exceeds the allowed size' });
              await closeRuntime(runtimeKey);
              if (runtimes.size >= 16) return json(429, { ok: false, error: 'Runtime session limit reached' });
              if (hubAuth) {
                let ownedCount = 0;
                for (const entry of runtimes.values()) if (entry.ownerKey === auth.accountKey) ownedCount++;
                if (ownedCount >= MAX_RUNTIMES_PER_ACCOUNT) return json(429, { ok: false, error: 'Account runtime session limit reached' });
              }
              const runtime = new NativeRuntime(root, () => {
                if (runtimes.get(runtimeKey)?.runtime === runtime) runtimes.delete(runtimeKey);
              }, { realtime: true });
              runtimes.set(runtimeKey, { runtime, lastUsed: Date.now(), ownerKey: hubAuth ? auth.accountKey : null });
            }
            const session = runtimes.get(runtimeKey);
            if (!session || (hubAuth && session.ownerKey !== auth.accountKey)) return json(409, { ok: false, error: 'Start PIE first' });
            session.lastUsed = Date.now();
            const { sessionId, ...command } = body;
            let result;
            try { result = await session.runtime.request(command); }
            catch (error) { await closeRuntime(runtimeKey); throw error; }
            if (body.op === 'load' && !result.ok) await closeRuntime(runtimeKey);
            return json(200, result);
          });
        }
        return json(404, { ok: false, error: 'Unknown API' });
      } catch (error) { return json(error.status || 400, { ok: false, error: error.message }); }
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Read-only server', { Allow: 'GET, HEAD' });
    let pathname;
    try { pathname = decodeURIComponent(requestUrl.split('?')[0]); }
    catch { return reply(400, 'Invalid URL encoding'); }
    if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\0:]/.test(pathname)) return reply(400, 'Invalid path');
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(part => part.startsWith('.') || ['node_modules', 'saved', 'engine', 'tools', 'godot', 'privateaccount'].includes(part.toLowerCase()))) {
      return reply(403, 'Private path');
    }
    let file = path.resolve(root, '.' + pathname);
    if (!insideRoot(file)) return reply(403, 'Outside project');
    try {
      let info = await fs.promises.stat(file);
      if (info.isDirectory()) {
        if (!pathname.endsWith('/')) {
          res.writeHead(308, { Location: encodeURI(basePath + pathname + '/') });
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

  const validateTemplateBuild = template => (id, projectId, ownerKey) => {
    try {
      const build = builds.get(id);
      if (hubAuth && (!ownerKey || build?.ownerKey !== ownerKey)) return null;
      const activePlatform = getPlatformFor(ownerKey).store;
      return activePlatform.getProject(projectId).template === template &&
        build?.status === 'succeeded' && build.projectId === projectId ? build : null;
    } catch { return null; }
  };
  const brawllabs = attachBrawlLabs(upgradeBus, { originAllowed, validateBuild: validateTemplateBuild('brawllabs') });
  const fortressWar = attachFortressWar(upgradeBus, { originAllowed, validateBuild: validateTemplateBuild('fortress-war') });

  server.on('upgrade', async (req, socket, head) => {
    req.url = stripBasePath(req.url || '');
    if (!originAllowed(req)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    if (!hubAuth) {
      upgradeBus.emit('upgrade', req, socket, head);
      return;
    }
    const auth = await hubAuth.verify(req, { requireCsrf: false });
    if (!auth.authenticated) {
      const reason = auth.status === 401 ? 'Unauthorized' : auth.status === 403 ? 'Forbidden' : 'Service Unavailable';
      socket.end(`HTTP/1.1 ${auth.status} ${reason}\r\nConnection: close\r\n\r\n`);
      return;
    }
    req.hubAuth = auth;
    if (req.url === '/collaboration') {
      try { getStudioFor(auth.accountKey).bus.emit('upgrade', req, socket, head); }
      catch { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); }
      return;
    }
    if (req.url === '/brawllabs' || req.url === '/fortress-war') {
      upgradeBus.emit('upgrade', req, socket, head);
      return;
    }
    socket.destroy();
  });

  const closeOwned = () => {
    agentChatProvider?.close();
    brawllabs.close();
    fortressWar.close();
    platformApi?.close?.();
    collaboration?.close?.();
    for (const entry of accountPlatforms.values()) entry.api.close?.();
    accountPlatforms.clear();
    for (const entry of accountStudios.values()) entry.collaboration.close?.();
    accountStudios.clear();
    builds.close();
    for (const id of runtimes.keys()) closeRuntime(id);
  };
  const cleanup = setInterval(() => {
    for (const [id, session] of runtimes) if (Date.now() - session.lastUsed > 60000) closeRuntime(id);
  }, 10000);
  cleanup.unref();
  server.on('close', () => { clearInterval(cleanup); closeOwned(); });
  server.shutdown = () => { clearInterval(cleanup); closeOwned(); server.closeAllConnections?.(); server.close(); };
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
