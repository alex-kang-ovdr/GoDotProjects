'use strict';
const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { ProjectStore } = require('./Tools/project-store.cjs');
const { NativeRuntime } = require('./Tools/native-runtime.cjs');
const { attachCollaboration } = require('./Tools/collaboration.cjs');
const { attachBrawlLabs } = require('./Tools/brawllabs-multiplayer.cjs');
const { attachFortressWar } = require('./Tools/fortress-multiplayer.cjs');
const { attachTappyChickenMmo } = require('./Tools/tappy-chicken-mmo-multiplayer.cjs');
const { attachCaptainForeverMmo } = require('./Tools/captain-forever-mmo-multiplayer.cjs');
const { createOriginPolicy, requestOrigin } = require('./Tools/origin-policy.cjs');
const { exportGodotProject } = require('./Tools/export-godot-project.cjs');
const { BuildQueue } = require('./Tools/build-queue.cjs');
const { OwnedBuildPackages } = require('./Tools/owned-build-packages.cjs');
const { createExecutionPolicy, EXECUTION_NOT_ALLOWED } = require('./Tools/execution-allowlist.cjs');
const { PlatformStore } = require('./Tools/platform-store.cjs');
const { createPlatformApi } = require('./Tools/platform-api.cjs');
const { createHubSessionAuth, hubAuthConfigFromEnv, validateHubAccountUrl } = require('./Tools/hub-session-auth.cjs');
const { loadAssetStore, showcaseStagedFiles } = require('./Tools/template-catalog.cjs');
const { createAssetLibraryHandler } = require('./Tools/asset-library.cjs');
const { createAgentChatProvider, isAgentChatRoute } = require('./Tools/agent-chat-provider.cjs');
const { createInternalApi } = require('./Tools/internal-api.cjs');
const { loadSealedAvatarBundle, resolveSealedAssetFile } = require('./Tools/avatar-seal.cjs');
const { createBlenderPipelineHandler } = require('./Tools/blender-pipeline/job-manager.cjs');
const { createHubAgentBridge } = require('./Tools/hub-agent-bridge.cjs');

const root = fs.realpathSync(__dirname);
const MAX_ACCOUNTS = 1024;
const MAX_RUNTIMES_PER_ACCOUNT = 4;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.lua': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.zip': 'application/zip' };
const COMPRESSIBLE_EXTS = new Set(['.wasm', '.pck', '.js', '.css', '.html', '.svg', '.json']);
const DEFAULT_HTTP_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_HTTP_CACHE_MAX_FILES = 256;
const CLOUDRUN_HTTP_CACHE_MAX_BYTES = 32 * 1024 * 1024;
const CLOUDRUN_HTTP_CACHE_MAX_FILES = 64;

function envFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function parseNonNegativeInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function internalApiConfigFromEnv(env = process.env) {
  const directory = env.PLAYHUB_FORGE_DIR ? path.resolve(env.PLAYHUB_FORGE_DIR) : null;
  const buildsEnabled = envFlag(env.PLAYHUB_FORGE_BUILDS_ENABLED);
  const driveEnabled = envFlag(env.PLAYHUB_DRIVE_ENABLED) || envFlag(env.PLAYHUB_FORGE_DRIVE_ENABLED);
  const folderId = String(env.PLAYHUB_DRIVE_FOLDER_ID || env.PLAYHUB_FORGE_DRIVE_FOLDER_ID || '').trim();
  const packageFolderId = String(env.PLAYHUB_DRIVE_PACKAGE_FOLDER_ID || env.PLAYHUB_FORGE_DRIVE_PACKAGE_FOLDER_ID || '').trim();
  const packagesEnabled = envFlag(env.PLAYHUB_FORGE_PACKAGES_ENABLED) || envFlag(env.PLAYHUB_PACKAGES_ENABLED);
  return {
    directory,
    builds: buildsEnabled ? { enabled: true } : undefined,
    drive: driveEnabled ? { enabled: true, folderId, packageFolderId } : undefined,
    packages: packagesEnabled ? { enabled: true } : undefined,
  };
}

function createCompressionCache(options = {}) {
  const env = options.env || process.env;
  const isCloudRun = Boolean(env.K_SERVICE);
  const dir = options.dir
    ? path.resolve(options.dir)
    : (env.PLAYFORGE_HTTP_CACHE_DIR ? path.resolve(env.PLAYFORGE_HTTP_CACHE_DIR) : path.join(root, 'Saved', 'HttpCache'));
  const defaultMaxBytes = isCloudRun ? CLOUDRUN_HTTP_CACHE_MAX_BYTES : DEFAULT_HTTP_CACHE_MAX_BYTES;
  const defaultMaxFiles = isCloudRun ? CLOUDRUN_HTTP_CACHE_MAX_FILES : DEFAULT_HTTP_CACHE_MAX_FILES;
  const maxBytes = parseNonNegativeInt(options.maxBytes ?? env.PLAYFORGE_HTTP_CACHE_MAX_BYTES, defaultMaxBytes);
  const maxFiles = parseNonNegativeInt(options.maxFiles ?? env.PLAYFORGE_HTTP_CACHE_MAX_FILES, defaultMaxFiles);
  let enabled;
  if (typeof options.enabled === 'boolean') enabled = options.enabled;
  else if (env.PLAYFORGE_HTTP_CACHE_ENABLED !== undefined && env.PLAYFORGE_HTTP_CACHE_ENABLED !== '') enabled = envFlag(env.PLAYFORGE_HTTP_CACHE_ENABLED);
  else enabled = !isCloudRun;
  if (maxBytes <= 0 || maxFiles <= 0) enabled = false;

  const entries = new Map();
  const activeReaders = new Map();
  const inflight = new Map();
  let totalBytes = 0;
  let scanPromise = null;
  let evictChain = Promise.resolve();

  function touchEntry(name, entryPath, size) {
    const existing = entries.get(name);
    if (existing) {
      totalBytes = Math.max(0, totalBytes - existing.size);
      entries.delete(name);
    }
    entries.set(name, { path: entryPath, size });
    totalBytes += size;
  }

  function acquireReader(name) {
    activeReaders.set(name, (activeReaders.get(name) || 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = (activeReaders.get(name) || 1) - 1;
      if (next <= 0) activeReaders.delete(name);
      else activeReaders.set(name, next);
    };
  }

  function evictIfNeeded(protectName = null) {
    evictChain = evictChain.catch(() => {}).then(async () => {
      while (totalBytes > maxBytes || entries.size > maxFiles) {
        let victimKey = null;
        let victim = null;
        for (const [key, entry] of entries) {
          if (key === protectName || (activeReaders.get(key) || 0) > 0) continue;
          victimKey = key;
          victim = entry;
          break;
        }
        if (!victimKey) break;
        entries.delete(victimKey);
        totalBytes = Math.max(0, totalBytes - victim.size);
        await fs.promises.rm(victim.path, { force: true }).catch(() => {});
      }
    });
    return evictChain;
  }

  async function ensureScanned() {
    if (!scanPromise) {
      scanPromise = (async () => {
        let names;
        try { names = await fs.promises.readdir(dir); }
        catch { return; }
        const found = [];
        const staleBefore = Date.now() - 5 * 60 * 1000;
        for (const name of names) {
          const full = path.join(dir, name);
          let stat;
          try { stat = await fs.promises.stat(full); }
          catch { continue; }
          if (!stat.isFile()) continue;
          if (name.endsWith('.tmp')) {
            if (stat.mtimeMs < staleBefore) await fs.promises.rm(full, { force: true }).catch(() => {});
            continue;
          }
          if (!name.endsWith('.br') && !name.endsWith('.gz')) continue;
          found.push({ name, path: full, size: stat.size, lastUsed: Math.max(stat.atimeMs || 0, stat.mtimeMs || 0) });
        }
        found.sort((a, b) => a.lastUsed - b.lastUsed);
        for (const item of found) touchEntry(item.name, item.path, item.size);
        await evictIfNeeded();
      })();
    }
    return scanPromise;
  }

  async function get(file, info, encoding) {
    if (!enabled) return null;
    await ensureScanned();
    const ext = encoding === 'br' ? '.br' : '.gz';
    const key = crypto.createHash('sha256').update(`${file}:${info.size}:${info.mtimeMs}:${encoding}`).digest('hex').slice(0, 24);
    const name = key + ext;
    const cached = path.join(dir, name);
    try {
      const stat = await fs.promises.stat(cached);
      if (stat.isFile() && stat.size > 0 && stat.size <= maxBytes) {
        touchEntry(name, cached, stat.size);
        const now = new Date();
        fs.promises.utimes(cached, now, now).catch(() => {});
        return { path: cached, size: stat.size, release: acquireReader(name) };
      }
    } catch {}
    let pending = inflight.get(name);
    if (!pending) {
      pending = (async () => {
        await fs.promises.mkdir(dir, { recursive: true });
        const tmp = `${cached}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
        try {
          const compressor = encoding === 'br'
            ? zlib.createBrotliCompress({
              params: {
                [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
                [zlib.constants.BROTLI_PARAM_SIZE_HINT]: info.size,
              },
            })
            : zlib.createGzip({ level: 6 });
          await pipeline(fs.createReadStream(file), compressor, fs.createWriteStream(tmp));
          const tmpStat = await fs.promises.stat(tmp);
          if (!tmpStat.isFile() || tmpStat.size <= 0 || tmpStat.size > maxBytes) {
            await fs.promises.rm(tmp, { force: true }).catch(() => {});
            return null;
          }
          try { await fs.promises.rename(tmp, cached); }
          catch { await fs.promises.rm(tmp, { force: true }).catch(() => {}); }
          const stat = await fs.promises.stat(cached);
          if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
            await fs.promises.rm(cached, { force: true }).catch(() => {});
            return null;
          }
          touchEntry(name, cached, stat.size);
          await evictIfNeeded(name);
          return { path: cached, size: stat.size };
        } catch (error) {
          await fs.promises.rm(tmp, { force: true }).catch(() => {});
          throw error;
        } finally {
          inflight.delete(name);
        }
      })();
      inflight.set(name, pending);
    }
    const result = await pending;
    if (!result) return null;
    const release = acquireReader(name);
    try {
      const stat = await fs.promises.stat(result.path);
      if (!stat.isFile() || stat.size <= 0) { release(); return null; }
      return { path: result.path, size: stat.size, release };
    } catch {
      release();
      return null;
    }
  }

  return {
    enabled,
    get,
    stats() {
      return { enabled, isCloudRun, maxBytes, maxFiles, totalBytes, fileCount: entries.size, dir };
    },
  };
}

async function streamStaticFile(req, res, file, info, baseHeaders, compressionCache) {
  const ext = path.extname(file).toLowerCase();
  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const encoding = /\bbr\b/i.test(acceptEncoding) ? 'br' : /\bgzip\b/i.test(acceptEncoding) ? 'gzip' : null;
  if (compressionCache?.enabled && encoding && COMPRESSIBLE_EXTS.has(ext) && info.size >= 4096) {
    try {
      const compressed = await compressionCache.get(file, info, encoding);
      if (compressed) {
        res.writeHead(200, {
          ...baseHeaders,
          'Content-Encoding': encoding,
          'Content-Length': compressed.size,
          'Vary': 'Accept-Encoding',
        });
        if (req.method === 'HEAD') { compressed.release(); return res.end(); }
        const stream = fs.createReadStream(compressed.path);
        stream.once('close', compressed.release);
        stream.on('error', () => { compressed.release(); res.destroy(); });
        stream.pipe(res);
        return;
      }
    } catch {}
  }
  res.writeHead(200, { ...baseHeaders, 'Content-Length': info.size });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function insideDir(baseDir, file) {
  const relative = path.relative(baseDir, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function insideRoot(file) {
  return insideDir(root, file);
}

function resolveWebEditorVendorDir(options, serverEnv) {
  const candidates = [
    options.webEditorVendorDir,
    serverEnv.PLAYFORGE_WEB_EDITOR_DIR,
    path.join(root, 'OfficialGodot', 'vendor'),
    path.resolve(root, '..', '..', 'PlayHub-Platform', 'forge', 'OfficialGodot', 'vendor'),
    path.resolve(root, '..', 'artifacts', 'local-runtime', 'godot-web'),
    path.resolve(root, '..', '..', 'PlayHub-Platform', 'artifacts', 'local-runtime', 'godot-web'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const resolved = fs.realpathSync(candidate);
      if (fs.statSync(resolved).isDirectory() && fs.existsSync(path.join(resolved, 'godot.editor.js'))) {
        return resolved;
      }
    } catch {}
  }
  return null;
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
  const serverEnv = options.env || options.internalApi?.env || process.env;
  const envInternal = internalApiConfigFromEnv(serverEnv);
  const httpCache = createCompressionCache({ ...(options.httpCache || {}), env: serverEnv });
  const configuredOrigin = options.publicOrigin ?? serverEnv.PUBLIC_ORIGIN;
  const originAllowed = createOriginPolicy(configuredOrigin);
  const basePath = normalizeBasePath(options.basePath ?? serverEnv.PLAYFORGE_BASE_PATH ?? '');
  const webEditorVendorDir = resolveWebEditorVendorDir(options, serverEnv);
  const resolvedBuildMode = String(options.buildMode || serverEnv.PLAYFORGE_BUILD_MODE || serverEnv.NODE_ENV || 'debug').trim().toLowerCase();
  const remoteControlEnabled = ['debug', 'test', 'development'].includes(resolvedBuildMode);
  const hubAuthConfig = options.hubAuth === false ? null : (options.hubAuth || hubAuthConfigFromEnv(serverEnv));
  const hubAccountUrl = validateHubAccountUrl(options.hubAccountUrl || hubAuthConfig?.loginUrl || serverEnv.PLAYHUB_FORGE_HUB_ACCOUNT_URL || '/?view=account');
  const hubAuth = hubAuthConfig ? createHubSessionAuth({ ...hubAuthConfig, loginUrl: hubAuthConfig.loginUrl || hubAccountUrl }) : null;
  const accountsDirectory = hubAuth ? path.resolve(hubAuthConfig.accountsDirectory || (envInternal.directory ? path.join(envInternal.directory, 'accounts') : path.join(root, 'Saved/HubAccounts'))) : null;
  const studioDirectory = hubAuth ? path.resolve(hubAuthConfig.studioDirectory || (envInternal.directory ? path.join(envInternal.directory, 'studios') : path.join(root, 'Saved/HubStudios'))) : null;
  const internalDirectory = options.internalApi?.directory || envInternal.directory || (accountsDirectory ? path.dirname(accountsDirectory) : null);

  const stripBasePath = rawUrl => {
    if (!basePath || typeof rawUrl !== 'string') return rawUrl;
    if (rawUrl === basePath) return '/';
    if (rawUrl.startsWith(basePath + '/')) return rawUrl.slice(basePath.length);
    if (rawUrl.startsWith(basePath + '?')) return '/' + rawUrl.slice(basePath.length);
    return rawUrl;
  };

  const store = hubAuth ? null : new ProjectStore(root, options.workspace);
  const builds = new BuildQueue(root, options.buildDirectory);
  // Hub-auth mode: platform builds use the same canonical snapshot and integrity checks as Hub's
  // OwnedBuildPackages (sourceHash over sorted files, artifactSha256), on this server's queue.
  const accountBuilds = hubAuth ? new OwnedBuildPackages({
    root,
    queue: builds,
    directory: internalDirectory,
    storeFor: key => getPlatformFor(key).store
  }) : null;
  // P0: builds and PIE run user content on this host's Godot without isolation; Hub-auth mode only lets
  // allowlisted accounts trigger them (PLAYHUB_FORGE_EXECUTION_ALLOWLIST, fail closed when unset).
  const executionPolicy = hubAuth ? createExecutionPolicy(hubAuthConfig.executionAllowlist ?? serverEnv.PLAYHUB_FORGE_EXECUTION_ALLOWLIST) : null;
  const executionAllowed = accountKey => {
    if (!executionPolicy || executionPolicy.allows(accountKey)) return true;
    // The key is the pseudonymous Hub account hash; operators copy it into the allowlist.
    console.warn(`[forge] build/PIE refused for account ${accountKey}; add it to PLAYHUB_FORGE_EXECUTION_ALLOWLIST (or Hub config forge.executionAllowlist) to allow.`);
    return false;
  };
  const storeServerUrl = options.storeServerUrl ?? serverEnv.PLAYFORGE_STORE_SERVER_URL ?? '';
  const storeWebUrl = options.storeWebUrl ?? serverEnv.PLAYFORGE_STORE_WEB_URL ?? (storeServerUrl || 'http://127.0.0.1:4180');
  const assetLibrary = createAssetLibraryHandler(root, {
    env: serverEnv,
    storeOptions: {
      ...(options.storeOptions || {}),
      storeServerUrl,
      storeWebUrl,
    },
  });
  const agentChatProvider = hubAuth ? null : createAgentChatProvider({ env: options.agentChatEnv });
  const hubAgentBridge = hubAuth ? createHubAgentBridge({
    hubAuthConfig,
    env: serverEnv,
    fetchImpl: options.hubAgentFetch || globalThis.fetch
  }) : null;
  const blenderPipeline = createBlenderPipelineHandler(root, {
    env: serverEnv,
    storageDir: options.blenderStorageDir,
    registry: options.blenderRegistry,
    binaryPath: options.blenderBinaryPath,
    timeoutMs: options.blenderTimeoutMs,
    agentChatProvider: hubAgentBridge?.enabled() ? hubAgentBridge.internalAgentChatProvider : agentChatProvider,
  });
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

  let internalApi = null;
  const getPlatformFor = accountKey => {
    if (!hubAuth) return { store: platform, api: platformApi };
    let entry = accountPlatforms.get(accountKey);
    if (!entry) {
      if (accountPlatforms.size >= MAX_ACCOUNTS) throw Object.assign(new Error('Account capacity reached'), { status: 503 });
      const accountStore = new PlatformStore(root, path.join(accountsDirectory, accountKey));
      internalApi?.attachStoreSync?.(accountKey, accountStore);
      const api = createPlatformApi(accountStore, {
        buildMode: options.buildMode,
        validateBuild: (id, projectId, revision) => {
          try { return accountBuilds.verified(accountKey, projectId, id, revision).job; }
          catch { return null; }
        },
      });
      entry = { store: accountStore, api };
      accountPlatforms.set(accountKey, entry);
    }
    return entry;
  };
  const validateTemplateBuild = template => (id, projectId, ownerKey) => {
    try {
      const build = builds.get(id);
      if (hubAuth && (!ownerKey || build?.ownerKey !== ownerKey)) return null;
      const activePlatform = getPlatformFor(ownerKey).store;
      return activePlatform.getProject(projectId).template === template &&
        build?.status === 'succeeded' && build.projectId === projectId ? build : null;
    } catch { return null; }
  };
  const resolvedInternalBuilds = options.internalApi?.builds !== undefined
    ? options.internalApi.builds
    : (options.buildsEnabled !== undefined ? { enabled: options.buildsEnabled === true } : envInternal.builds);
  const resolvedInternalDrive = options.internalApi?.drive !== undefined ? options.internalApi.drive : envInternal.drive;
  const resolvedInternalPackages = options.internalApi?.packages !== undefined ? options.internalApi.packages : envInternal.packages;
  internalApi = (hubAuth || options.internalApi) ? createInternalApi({
    root,
    accountsDirectory: accountsDirectory || options.internalApi?.accountsDirectory,
    directory: internalDirectory,
    buildDirectory: builds.directory,
    internalSecret: options.internalApi?.internalSecret ?? hubAuthConfig?.internalSecret ?? serverEnv.PLAYHUB_FORGE_INTERNAL_SECRET,
    previousInternalSecret: options.internalApi?.previousInternalSecret ?? hubAuthConfig?.previousInternalSecret ?? serverEnv.PLAYHUB_FORGE_INTERNAL_SECRET_PREVIOUS,
    getPlatformFor: hubAuth ? getPlatformFor : undefined,
    accountBuilds: hubAuth ? accountBuilds : undefined,
    validateTemplateBuild,
    buildsEnabled: resolvedInternalBuilds?.enabled === true,
    executionAllowed,
    drive: resolvedInternalDrive,
    packages: resolvedInternalPackages,
    env: serverEnv,
    fetchImpl: options.internalApi?.fetchImpl || globalThis.fetch,
    buildMode: options.buildMode,
  }) : null;

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
    const reply = (status, message, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
      res.end(req.method === 'HEAD' ? undefined : message);
    };
    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    let rawParsedUrl;
    try { rawParsedUrl = new URL(req.url, 'http://localhost'); }
    catch { return reply(400, 'Invalid URL'); }
    if (basePath && (rawParsedUrl.pathname === `${basePath}/internal` || rawParsedUrl.pathname.startsWith(`${basePath}/internal/`))) {
      return reply(404, 'Not found');
    }
    if (rawParsedUrl.pathname === '/internal/v1' || rawParsedUrl.pathname.startsWith('/internal/v1/')) {
      if (!internalApi) return json(503, { ok: false, error: 'INTERNAL_API_DISABLED' });
      await internalApi.handle(req, res, rawParsedUrl);
      return;
    }

    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

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
      return json(200, { ok: true, runtime: status.available, engine: 'Godot', brawllabsMultiplayer: true, fortressWarMultiplayer: true, tappyChickenMmoMultiplayer: true, multiplayerTestWorkspace: 1, nativeGameIframe: 1, hubAuth: Boolean(hubAuth) });
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
        if (hubAgentBridge?.enabled()) {
          return await hubAgentBridge.handleAgentChatRoute(req, res, json, auth);
        }
        // Without Hub-Agent bridge configured, host CLI/OAuth sessions are never exposed to shared Hub accounts.
        if (!agentChatProvider) return json(404, { ok: false, error: 'Agent chat is unavailable in Hub mode' });
        return agentChatProvider(req, res, json);
      }
      if (assetLibrary(req, res)) return;
      if (routePath === '/api/porting' || routePath.startsWith('/api/porting/')) {
        if (hubAgentBridge?.enabled()) {
          const getPlatformStore = () => (hubAuth ? getPlatformFor(auth?.accountKey)?.store : platform);
          return await hubAgentBridge.handlePortingRoute(req, res, parsedUrl, auth, { getPlatformStore }, json);
        }
        return json(503, { ok: false, error: 'Project porting requires Hub-Agent mode.' });
      }
      if (routePath === '/api/blender' || routePath.startsWith('/api/blender/')) {
        if (routePath === '/api/blender/jobs' && req.method === 'POST' && !executionAllowed(auth?.accountKey)) {
          return json(403, { ok: false, error: EXECUTION_NOT_ALLOWED });
        }
        if (hubAgentBridge?.enabled()) {
          if (await hubAgentBridge.handleBlenderWithHubAgent(req, res, parsedUrl, auth, blenderPipeline, json)) return;
        } else if (await blenderPipeline(req, res, parsedUrl)) {
          return;
        }
      }
      const showcaseRoute = routePath.match(/^\/api\/platform-addon\/showcase\/([a-z0-9-]{1,40})$/);
      const sharedReplay = routePath === '/api/platform-addon/replay';
      const agentChat = routePath === '/api/platform-addon/agent-chat';
      const remoteControl = routePath === '/api/platform-addon/remote-control';
      const avatarAddon = routePath === '/api/platform-addon/avatar';
      const blenderAddon = routePath === '/api/platform-addon/blender';
      const assetStoreAddon = routePath === '/api/platform-addon/asset-store';
      const avatarAssetRoute = routePath.match(/^\/api\/platform-addon\/avatar\/assets\/(skins|accessories)\/([A-Za-z0-9_-]{1,80}\.glb)$/);
      if (blenderAddon && req.method === 'GET') {
        try {
          const names = ['plugin.cfg', 'plugin.gd', 'blender_dock.gd', 'glb_importer.gd'];
          const entries = await Promise.all(names.map(async name => [name,
            await fs.promises.readFile(path.join(root, 'Godot/addons/playforge_blender', name), 'utf8')]));
          return json(200, { ok: true, files: Object.fromEntries(entries) });
        } catch {
          return json(503, { ok: false, error: 'PlayForge Blender add-on unavailable' });
        }
      }
      if (assetStoreAddon && req.method === 'GET') {
        try {
          const names = ['plugin.cfg', 'plugin.gd', 'store_dock.gd', 'package_installer.gd'];
          const entries = await Promise.all(names.map(async name => [name,
            await fs.promises.readFile(path.join(root, 'Godot/addons/playforge_asset_store', name), 'utf8')]));
          return json(200, {
            ok: true,
            files: Object.fromEntries(entries),
            config: {
              store_web_url: storeWebUrl,
              store_api_url: `${basePath}/api/asset-library/store`,
            },
          });
        } catch {
          return json(503, { ok: false, error: 'PlayForge Asset Store add-on unavailable' });
        }
      }
      if (avatarAddon && req.method === 'GET') {
        try {
          const bundle = loadSealedAvatarBundle(root);
          return json(200, { ok: true, sealed: true, manifest: bundle.manifest, files: bundle.files, assets: bundle.assets });
        } catch {
          return json(503, { ok: false, error: 'PlayForge Avatar add-on unavailable' });
        }
      }
      if (avatarAssetRoute && req.method === 'GET') {
        const assetFile = resolveSealedAssetFile(root, avatarAssetRoute[1], avatarAssetRoute[2]);
        if (!assetFile) return reply(404, 'Avatar asset not found');
        try {
          const bytes = await fs.promises.readFile(assetFile);
          return reply(200, bytes, 'model/gltf-binary', { 'Cache-Control': 'public, max-age=86400, immutable' });
        } catch {
          return reply(503, 'Avatar asset unavailable');
        }
      }
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
          const rawFiles = Object.fromEntries(entries);
          const finalFiles = (agentChat && hubAgentBridge?.enabled())
            ? hubAgentBridge.adaptAgentChatAddonFiles(rawFiles)
            : rawFiles;
          return json(200, { ok: true, manifest, stagedFiles: manifest ? showcaseStagedFiles(manifest) : undefined,
            files: finalFiles, store: agentChat ? undefined : loadAssetStore(root) });
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
      const tappyMmoRoomRoute = routePath.match(/^\/api\/tappy-chicken-mmo\/rooms\/([a-f0-9]{12})$/);
      if (tappyMmoRoomRoute && req.method === 'GET') {
        const metadata = tappyChickenMmo.metadata(tappyMmoRoomRoute[1]);
        return metadata ? json(200, { ok: true, room: metadata }) : json(404, { ok: false, error: 'Room not found' });
      }
      const captainMmoRoomRoute = routePath.match(/^\/api\/captain-forever-mmo\/rooms\/([a-f0-9]{12})$/);
      if (captainMmoRoomRoute && req.method === 'GET') {
        const metadata = captainForeverMmo.metadata(captainMmoRoomRoute[1]);
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
        const buildInfo = await fs.promises.stat(file).catch(() => null);
        if (!buildInfo?.isFile()) return json(404, { ok: false, error: 'Build file not found' });
        await streamStaticFile(req, res, file, buildInfo, {
          'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'private, max-age=3600',
          ...(file.endsWith('.zip') ? { 'Content-Disposition': 'attachment; filename="PlayForge-Web-' + build.id + '.zip"' } : {}),
        }, httpCache);
        return;
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
          if (!executionAllowed(auth?.accountKey)) return json(403, { ok: false, error: EXECUTION_NOT_ALLOWED });
          if (body.revision !== snapshot.revision) return json(409, { ok: false, error: 'revision_conflict' });
          if (accountBuilds) return json(202, { ok: true, build: accountBuilds.enqueueJob(auth.accountKey, snapshot.id, snapshot.revision) });
          return json(202, { ok: true, build: builds.enqueue({ id: platformBuild[1], revision: snapshot.revision, files: Object.entries(snapshot.files).map(([filePath, content]) => ({ path: filePath, content })) }) });
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
          if (!executionAllowed(auth?.accountKey)) return json(403, { ok: false, error: EXECUTION_NOT_ALLOWED });
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
          if (body.op === 'load' && !executionAllowed(auth?.accountKey)) return json(403, { ok: false, error: EXECUTION_NOT_ALLOWED });
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
    const isVendorBinary = pathname.startsWith('/OfficialGodot/vendor/');
    const allowedRoot = isVendorBinary && webEditorVendorDir ? webEditorVendorDir : root;
    let file = isVendorBinary && webEditorVendorDir
      ? path.resolve(webEditorVendorDir, pathname.slice('/OfficialGodot/vendor/'.length))
      : path.resolve(root, '.' + pathname);
    if (!insideDir(allowedRoot, file)) return reply(403, 'Outside project');
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
      if (!insideDir(allowedRoot, file)) return reply(403, 'Outside project');
      info = await fs.promises.stat(file);
      if (!info.isFile()) return reply(404, 'Not found');
      await streamStaticFile(req, res, file, info, {
        'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': isVendorBinary ? 'public, max-age=86400' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      }, httpCache);
    } catch (error) {
      if (!res.headersSent) reply(['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500, 'File unavailable');
      else res.destroy();
    }
  });

  const brawllabs = attachBrawlLabs(upgradeBus, { originAllowed, validateBuild: validateTemplateBuild('brawllabs') });
  const fortressWar = attachFortressWar(upgradeBus, { originAllowed, validateBuild: validateTemplateBuild('fortress-war') });
  const tappyChickenMmo = attachTappyChickenMmo(upgradeBus, { originAllowed, validateBuild: validateTemplateBuild('tappy-chicken-mmo') });
  const captainForeverMmo = attachCaptainForeverMmo(upgradeBus, { originAllowed, validateBuild: validateTemplateBuild('captain-forever-mmo') });

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
    if (req.url === '/brawllabs' || req.url === '/fortress-war' || req.url === '/tappy-chicken-mmo' || req.url === '/captain-forever-mmo') {
      upgradeBus.emit('upgrade', req, socket, head);
      return;
    }
    socket.destroy();
  });

  const closeOwned = () => {
    internalApi?.close();
    agentChatProvider?.close();
    blenderPipeline?.close();
    brawllabs.close();
    fortressWar.close();
    tappyChickenMmo.close();
    captainForeverMmo.close();
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
  server.httpCache = httpCache;
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
module.exports = { createServer, createCompressionCache, internalApiConfigFromEnv };
