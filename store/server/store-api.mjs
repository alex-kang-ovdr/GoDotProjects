import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  SAMPLE_CATALOG,
  PUBLISHER_DRAFTS,
  extractCatalogCategories,
  extractCatalogLicenses,
  extractCatalogTiers,
  extractCatalogSources,
  extractTopTags,
  filterCatalogEntries,
  validateReleaseContract
} from '../web/store-catalog.js';
import {
  createCatalogArtifacts,
  formatSha256Digest,
  sha256Hex
} from './package-builder.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_WEB_DIR = path.resolve(HERE, '..', 'web');
const DEFAULT_DATA_DIR = path.resolve(HERE, '..', 'Saved');
const DEFAULT_LOCAL_ACCOUNT_LABEL = 'creator-demo@playhub.local';

const VALID_ACCOUNT_ID = /^[a-zA-Z0-9._:@-]{2,128}$/;
const VALID_SLUG = /^[a-z][a-z0-9-]{1,63}$/;
const HEX64 = /^[a-f0-9]{64}$/i;
const VALID_RELEASE_KINDS = new Set(['', 'all', 'package', 'editorial']);
const MOCK_SESSION_COOKIE = 'playforge_store_mock_user';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

export class StoreApiError extends Error {
  constructor(status, code, message = code, extra = undefined) {
    super(message);
    this.name = 'StoreApiError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function parseCookies(req) {
  const result = {};
  const raw = String(req?.headers?.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      // ignore malformed cookie value
    }
  }
  return result;
}

function firstHeader(req, names) {
  for (const name of names) {
    const val = req?.headers?.[name];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

function safeDecodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new StoreApiError(400, 'INVALID_PATH', 'Malformed percent-encoding in request path');
  }
}

export function parseAllowedOrigins(input) {
  if (input === undefined || input === null) return null;
  if (typeof input === 'string' && !input.trim()) return null;
  const rawList = Array.isArray(input) ? input : String(input).split(',');
  const origins = [];
  for (const entry of rawList) {
    const trimmed = String(entry ?? '').trim();
    if (!trimmed) {
      if (!Array.isArray(input)) continue;
      throw new Error('Allowed origin entry must not be empty');
    }
    let parsed;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error(`Invalid allowed origin: ${trimmed}`);
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    ) {
      throw new Error(`Allowed origin must be an HTTP(S) origin without path or credentials: ${trimmed}`);
    }
    if (!origins.includes(parsed.origin)) {
      origins.push(parsed.origin);
    }
  }
  if (!Array.isArray(input) && origins.length === 0) {
    throw new Error('Allowed origins list must contain at least one valid HTTP(S) origin');
  }
  return origins;
}

function parseHostHeaderOrigin(req) {
  const host = firstHeader(req, ['host']);
  if (!host || host.includes('/') || host.includes('@') || /\s/.test(host)) {
    return null;
  }
  const protocol = req.socket?.encrypted ? 'https:' : 'http:';
  try {
    const parsed = new URL(`${protocol}//${host}`);
    if (parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

function formatOrigin(protocol, hostname, port) {
  const hostPart = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  return new URL(`${protocol}//${hostPart}:${port}`).origin;
}

export async function resolveAccountIdentity(req, options = {}) {
  const {
    sessionVerifier = null,
    internalSecret = '',
    allowMockSession = false,
    requireAuth = false,
    defaultAccountLabel = DEFAULT_LOCAL_ACCOUNT_LABEL
  } = options;

  if (typeof sessionVerifier === 'function' && (req.headers?.cookie || req.headers?.authorization)) {
    const verified = await sessionVerifier(req);
    if (verified?.authenticated && verified.accountKey) {
      const accountKey = HEX64.test(String(verified.accountKey))
        ? String(verified.accountKey).toLowerCase()
        : sha256Hex(`hub-session:${verified.accountKey}`);
      const accountLabel = String(verified.accountLabel || verified.displayName || verified.userId || accountKey);
      return {
        account_key: accountKey,
        account_label: accountLabel,
        display_name: verified.displayName || accountLabel,
        auth_mode: 'hub_session'
      };
    }
    if (requireAuth) {
      throw new StoreApiError(401, 'AUTHENTICATION_REQUIRED', 'Valid Hub session required');
    }
  }

  const rawKey = firstHeader(req, ['x-playhub-account-key', 'x-hub-account-key']);
  const rawUser = firstHeader(req, ['x-playhub-user', 'x-hub-user', 'x-playhub-sso-user']);
  const rawDisplay = firstHeader(req, ['x-playhub-display-name', 'x-hub-display-name']);
  const normalizedSecret = typeof internalSecret === 'string' ? internalSecret.trim() : '';

  // 내부 시크릿이 설정되지 않았으면 SSO 헤더는 신뢰할 수 없으므로 무시한다(헤더만으로 계정 위조 방지).
  if (normalizedSecret && (rawKey || rawUser)) {
    const providedSecret = firstHeader(req, ['x-playhub-internal-secret']);
    if (!constantTimeEquals(providedSecret, normalizedSecret)) {
      throw new StoreApiError(403, 'INTERNAL_SECRET_INVALID', 'Invalid internal SSO secret');
    }
    if (rawKey) {
      if (!VALID_ACCOUNT_ID.test(rawKey)) {
        throw new StoreApiError(400, 'INVALID_ACCOUNT_HEADER', 'Invalid x-playhub-account-key header');
      }
      const accountKey = HEX64.test(rawKey) ? rawKey.toLowerCase() : sha256Hex(`hub-key:${rawKey}`);
      const label = rawUser && VALID_ACCOUNT_ID.test(rawUser) ? rawUser : rawKey;
      return {
        account_key: accountKey,
        account_label: label,
        display_name: rawDisplay || label,
        auth_mode: 'hub_sso_header'
      };
    }
    if (!VALID_ACCOUNT_ID.test(rawUser)) {
      throw new StoreApiError(400, 'INVALID_ACCOUNT_HEADER', 'Invalid x-playhub-user header');
    }
    return {
      account_key: sha256Hex(`hub-sso:${rawUser}`),
      account_label: rawUser,
      display_name: rawDisplay || rawUser,
      auth_mode: 'hub_sso_header'
    };
  }

  if (allowMockSession === true) {
    const cookies = parseCookies(req);
    const mockUser = firstHeader(req, ['x-store-mock-user']) || String(cookies[MOCK_SESSION_COOKIE] || '').trim();
    if (mockUser) {
      if (!VALID_ACCOUNT_ID.test(mockUser)) {
        throw new StoreApiError(400, 'INVALID_MOCK_SESSION', 'Invalid mock session user identifier');
      }
      return {
        account_key: sha256Hex(`mock-sso:${mockUser}`),
        account_label: mockUser,
        display_name: mockUser,
        auth_mode: 'mock_session'
      };
    }
  }

  if (requireAuth) {
    throw new StoreApiError(401, 'AUTHENTICATION_REQUIRED', 'Hub SSO authentication required');
  }

  return {
    account_key: sha256Hex(`local-default:${defaultAccountLabel}`),
    account_label: defaultAccountLabel,
    display_name: defaultAccountLabel,
    auth_mode: 'local_default'
  };
}

function writeFileAtomically(filePath, content) {
  const dir = path.dirname(filePath);
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmpPath, content, 'utf8');
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (error) {
    if (error && ['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) {
      fs.writeFileSync(filePath, content, 'utf8');
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // ignore temp cleanup failure
      }
      return;
    }
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // ignore temp cleanup failure
    }
    throw error;
  }
}

export class JsonLibraryStore {
  constructor(dataDir, { clock = () => new Date().toISOString() } = {}) {
    this.dataDir = path.resolve(dataDir);
    this.filePath = path.join(this.dataDir, 'store-library.json');
    this.clock = clock;
    this.writeQueue = Promise.resolve();
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.state = this._loadFromDisk();
  }

  _loadFromDisk() {
    if (!fs.existsSync(this.filePath)) {
      return { schema_version: 1, updated_at: null, accounts: {} };
    }
    const raw = fs.readFileSync(this.filePath, 'utf8').replace(/^\uFEFF/, '').trim();
    if (!raw) {
      return { schema_version: 1, updated_at: null, accounts: {} };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.accounts !== 'object' || Array.isArray(parsed.accounts)) {
      throw new Error(`Invalid store library state file: ${this.filePath}`);
    }
    return {
      schema_version: 1,
      updated_at: parsed.updated_at || null,
      accounts: parsed.accounts
    };
  }

  _persist() {
    const serialized = `${JSON.stringify(this.state, null, 2)}\n`;
    writeFileAtomically(this.filePath, serialized);
  }

  _enqueue(fn) {
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  listEntries(accountKey) {
    const bucket = this.state.accounts[accountKey];
    if (!bucket || !bucket.entries) return [];
    return Object.values(bucket.entries)
      .map((entry) => ({ ...entry }))
      .sort((a, b) => {
        const cmp = String(b.saved_at || '').localeCompare(String(a.saved_at || ''));
        return cmp !== 0 ? cmp : String(a.slug || '').localeCompare(String(b.slug || ''));
      });
  }

  getEntry(accountKey, slug) {
    const entry = this.state.accounts[accountKey]?.entries?.[slug];
    return entry ? { ...entry } : null;
  }

  getSavedSet(accountKey) {
    const entries = this.state.accounts[accountKey]?.entries || {};
    return new Set(Object.keys(entries));
  }

  saveEntry(account, pkg) {
    return this._enqueue(() => {
      const stamp = this.clock();
      const existingAccount = this.state.accounts[account.account_key] || {
        account_key: account.account_key,
        account_label: account.account_label,
        entries: {}
      };
      existingAccount.account_label = account.account_label;
      const previous = existingAccount.entries[pkg.asset_id];
      const entry = {
        entry_type: 'StoreLibraryEntry',
        account_key: account.account_key,
        account_label: account.account_label,
        slug: pkg.asset_id,
        asset_id: pkg.asset_id,
        asset_version_id: pkg.asset_version_id,
        release_id: pkg.release_id,
        release_kind: 'package',
        artifact_id: pkg.artifact_id,
        artifact_digest: pkg.artifact_digest,
        dependency_manifest_hash: pkg.dependency_manifest_hash,
        license_snapshot_ref: pkg.license_snapshot_ref,
        store_state: 'saved_to_library',
        installation_record: null,
        saved_at: previous?.saved_at || stamp,
        updated_at: stamp
      };
      existingAccount.entries[pkg.asset_id] = entry;
      this.state.accounts[account.account_key] = existingAccount;
      this.state.updated_at = stamp;
      this._persist();
      return { created: !previous, entry: { ...entry } };
    });
  }

  removeEntry(account, slug) {
    return this._enqueue(() => {
      const stamp = this.clock();
      const bucket = this.state.accounts[account.account_key];
      const existed = Boolean(bucket?.entries?.[slug]);
      if (existed) {
        delete bucket.entries[slug];
        bucket.account_label = account.account_label;
        this.state.updated_at = stamp;
        this._persist();
      }
      return { removed: existed };
    });
  }
}

async function readJsonBody(req, maxBytes = 64 * 1024) {
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new StoreApiError(415, 'JSON_REQUIRED', 'Content-Type application/json is required');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new StoreApiError(413, 'BODY_TOO_LARGE', 'Request body too large');
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    throw new StoreApiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new StoreApiError(400, 'INVALID_JSON', 'Malformed JSON body');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StoreApiError(400, 'INVALID_JSON', 'JSON body must be an object');
  }
  return parsed;
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders
  });
  res.end(body);
}

function sendMethodNotAllowed(res, allowedMethods) {
  const allow = allowedMethods.join(', ');
  sendJson(
    res,
    405,
    { error: { code: 'METHOD_NOT_ALLOWED', message: `Allowed methods: ${allow}` } },
    { Allow: allow }
  );
}

function resolveStaticFile(webDirReal, pathname) {
  let rel = pathname;
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  if (rel === '/') rel = '/index.html';
  rel = rel.replace(/^\/+/, '');
  if (!rel || rel.includes('\0') || rel.includes('\\')) return null;
  const segments = rel.split('/');
  if (segments.some((seg) => !seg || seg === '.' || seg === '..' || seg.startsWith('.'))) {
    return null;
  }
  const candidate = path.resolve(webDirReal, rel);
  if (!candidate.startsWith(webDirReal + path.sep)) {
    return null;
  }
  try {
    if (!fs.existsSync(candidate)) return null;
    const real = fs.realpathSync(candidate);
    if (!real.startsWith(webDirReal + path.sep)) return null;
    if (!fs.statSync(real).isFile()) return null;
    return real;
  } catch {
    return null;
  }
}

export function createStoreApp(options = {}) {
  const {
    dataDir = DEFAULT_DATA_DIR,
    webDir = DEFAULT_WEB_DIR,
    serveStatic = true,
    catalog = SAMPLE_CATALOG,
    ownCatalog = false,
    publisherDrafts = PUBLISHER_DRAFTS,
    customArtifacts = null,
    clock = () => new Date().toISOString(),
    sessionVerifier = null,
    internalSecret = process.env.PLAYHUB_STORE_INTERNAL_SECRET || '',
    allowMockSession = false,
    requireAuth = false,
    defaultAccountLabel = DEFAULT_LOCAL_ACCOUNT_LABEL,
    allowedOrigins = process.env.PLAYFORGE_STORE_ALLOWED_ORIGINS || process.env.STORE_ALLOWED_ORIGINS || null
  } = options;

  const mockSessionEnabled = allowMockSession === true;
  const configuredOrigins = parseAllowedOrigins(allowedOrigins);
  const configuredOriginSet = configuredOrigins ? new Set(configuredOrigins) : null;

  const catalogList = ownCatalog ? [...catalog] : [...catalog].map((item) => structuredClone(item));
  for (const item of catalogList) {
    const errors = validateReleaseContract(item);
    if (errors.length > 0) {
      throw new Error(`Invalid store catalog entry ${item?.asset_id}: ${errors.join(', ')}`);
    }
  }

  const catalogBySlug = new Map(catalogList.map((item) => [item.asset_id, item]));
  const catalogCategories = extractCatalogCategories(catalogList);
  const catalogLicenses = extractCatalogLicenses(catalogList);
  const catalogTiers = extractCatalogTiers(catalogList);
  const catalogSources = extractCatalogSources(catalogList);
  const catalogTopTags = extractTopTags(catalogList, 24);
  const categoryCounts = {};
  const licenseCounts = {};
  const tierCounts = {};
  for (const item of catalogList) {
    if (item.category) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
    if (item.license) licenseCounts[item.license] = (licenseCounts[item.license] || 0) + 1;
    if (item.license_tier) tierCounts[item.license_tier] = (tierCounts[item.license_tier] || 0) + 1;
  }
  const artifacts = createCatalogArtifacts(catalogList, customArtifacts);
  const store = new JsonLibraryStore(dataDir, { clock });
  const webDirReal = serveStatic && webDir && fs.existsSync(webDir) ? fs.realpathSync(webDir) : null;

  function enrichCatalogItem(item, savedSet) {
    const isPackage = item.release_kind === 'package';
    const isSaved = isPackage && savedSet.has(item.asset_id);
    const enriched = {
      ...structuredClone(item),
      slug: item.asset_id,
      saved_in_library: isSaved,
      store_state: isSaved ? 'saved_to_library' : item.store_state
    };
    delete enriched.local_bundle_files;
    if (isPackage) {
      enriched.artifact_url = `/api/store/packages/${encodeURIComponent(item.asset_id)}/releases/${encodeURIComponent(item.asset_version_id)}/artifact`;
    }
    return enriched;
  }

  function enrichLibraryEntry(entry) {
    const item = catalogBySlug.get(entry.slug);
    return {
      schema_version: 1,
      ...entry,
      title: item?.title || entry.slug,
      summary: item?.summary || '',
      category: item?.category || '',
      tags: Array.isArray(item?.tags) ? [...item.tags] : [],
      license: item?.license || '',
      author: item?.author || '',
      source_provider: item?.source_provider || '',
      source_url: item?.source_url || '',
      thumbnail_url: item?.thumbnail_url || '',
      publisher_id: item?.publisher_id || '',
      engine_compatibility: item?.engine_compatibility ? structuredClone(item.engine_compatibility) : null,
      file_manifest: item?.file_manifest ? structuredClone(item.file_manifest) : [],
      artifact_url: `/api/store/packages/${encodeURIComponent(entry.slug)}/releases/${encodeURIComponent(entry.asset_version_id)}/artifact`
    };
  }

  function isOriginAllowed(req, origin) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      return false;
    }
    if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
      return false;
    }

    if (configuredOriginSet) {
      return configuredOriginSet.has(origin);
    }

    const requestOrigin = parseHostHeaderOrigin(req);
    if (!requestOrigin || origin !== requestOrigin) {
      return false;
    }

    const addr = server.address();
    if (!addr || typeof addr !== 'object') {
      return true;
    }

    const protocol = req.socket?.encrypted ? 'https:' : 'http:';
    const boundHost = addr.address;
    const boundPort = addr.port;
    const effectivePort = parsedOrigin.port || (parsedOrigin.protocol === 'https:' ? '443' : '80');
    if (effectivePort !== String(boundPort)) {
      return false;
    }

    if (boundHost === '0.0.0.0' || boundHost === '::') {
      return true;
    }

    const selfOrigins = new Set([formatOrigin(protocol, boundHost, boundPort)]);
    if (boundHost === '127.0.0.1' || boundHost === '::1') {
      selfOrigins.add(formatOrigin(protocol, 'localhost', boundPort));
    }
    return selfOrigins.has(origin);
  }

  function applyCorsHeaders(req, res) {
    const origin = req.headers?.origin;
    if (!origin) return;
    if (!isOriginAllowed(req, origin)) {
      throw new StoreApiError(403, 'ORIGIN_DENIED', 'Origin not allowed');
    }
    const allowedHeaders = [
      'Content-Type',
      'X-PlayHub-Account-Key',
      'X-PlayHub-User',
      'X-PlayHub-Display-Name',
      'X-PlayHub-Internal-Secret'
    ];
    if (mockSessionEnabled) {
      allowedHeaders.push('X-Store-Mock-User');
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
  }

  async function resolveAccount(req) {
    return resolveAccountIdentity(req, {
      sessionVerifier,
      internalSecret,
      allowMockSession: mockSessionEnabled,
      requireAuth,
      defaultAccountLabel
    });
  }

  async function handler(req, res) {
    try {
      applyCorsHeaders(req, res);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }

      const url = new URL(req.url || '/', 'http://store.local');
      const pathname = url.pathname;

      if (pathname === '/api/store/health' || pathname === '/api/health') {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return sendMethodNotAllowed(res, ['GET', 'HEAD']);
        }
        return sendJson(res, 200, {
          ok: true,
          service: 'playforge-store',
          schema_version: 1,
          catalog_count: catalogList.length,
          package_count: catalogList.filter((item) => item.release_kind === 'package').length,
          editorial_count: catalogList.filter((item) => item.release_kind === 'editorial').length
        });
      }

      if (pathname === '/api/store/session') {
        if (req.method !== 'GET') {
          return sendMethodNotAllowed(res, ['GET']);
        }
        const account = await resolveAccount(req);
        return sendJson(res, 200, {
          account,
          hub_sso_connected: true,
          allow_mock_session: mockSessionEnabled
        });
      }

      if (pathname === '/api/store/session/mock') {
        if (!mockSessionEnabled) {
          throw new StoreApiError(404, 'NOT_FOUND', 'Mock session endpoint disabled');
        }
        if (req.method !== 'POST') {
          return sendMethodNotAllowed(res, ['POST']);
        }
        const body = await readJsonBody(req);
        const user = body.user === null || body.user === '' ? '' : String(body.user || '').trim();
        if (user && !VALID_ACCOUNT_ID.test(user)) {
          throw new StoreApiError(422, 'INVALID_MOCK_USER', 'Invalid mock user identifier');
        }
        const cookieLine = user
          ? `${MOCK_SESSION_COOKIE}=${encodeURIComponent(user)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
          : `${MOCK_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
        const account = user
          ? {
              account_key: sha256Hex(`mock-sso:${user}`),
              account_label: user,
              display_name: user,
              auth_mode: 'mock_session'
            }
          : {
              account_key: sha256Hex(`local-default:${defaultAccountLabel}`),
              account_label: defaultAccountLabel,
              display_name: defaultAccountLabel,
              auth_mode: 'local_default'
            };
        return sendJson(res, 200, { ok: true, account }, { 'Set-Cookie': cookieLine });
      }

      if (pathname === '/api/store/catalog') {
        if (req.method !== 'GET') {
          return sendMethodNotAllowed(res, ['GET']);
        }
        const category = url.searchParams.get('category') || '';
        const q = url.searchParams.get('q') || '';
        const releaseKind = url.searchParams.get('release_kind') || '';
        const license = url.searchParams.get('license') || '';
        const tier = url.searchParams.get('tier') || '';
        const ai = url.searchParams.get('ai') || '';
        const source = url.searchParams.get('source') || '';
        const tag = url.searchParams.get('tag') || '';
        const rawPage = url.searchParams.get('page');
        const rawLimit = url.searchParams.get('limit');
        if (!VALID_RELEASE_KINDS.has(releaseKind)) {
          throw new StoreApiError(400, 'INVALID_FILTER', 'release_kind must be package, editorial, or all');
        }
        const account = await resolveAccount(req);
        const savedSet = store.getSavedSet(account.account_key);
        const filtered = filterCatalogEntries(catalogList, {
          category,
          q,
          release_kind: releaseKind,
          license,
          tier,
          ai,
          source,
          tag
        });
        const total = filtered.length;
        const paginate = rawPage !== null || rawLimit !== null;
        const limit = paginate ? Math.max(1, Math.min(200, Number(rawLimit || 24) || 24)) : total;
        const totalPages = paginate ? Math.max(1, Math.ceil(total / limit)) : 1;
        const page = paginate ? Math.max(1, Math.min(totalPages, Number(rawPage || 1) || 1)) : 1;
        const slice = paginate ? filtered.slice((page - 1) * limit, page * limit) : filtered;
        const items = slice.map((item) => enrichCatalogItem(item, savedSet));
        return sendJson(res, 200, {
          items,
          total,
          catalog_total: catalogList.length,
          page,
          limit,
          total_pages: totalPages,
          categories: catalogCategories,
          licenses: catalogLicenses,
          tiers: catalogTiers,
          sources: catalogSources,
          top_tags: catalogTopTags,
          category_counts: categoryCounts,
          license_counts: licenseCounts,
          tier_counts: tierCounts,
          filters: {
            category: category || null,
            q: q || null,
            release_kind: releaseKind && releaseKind !== 'all' ? releaseKind : null,
            license: license || null,
            tier: tier || null,
            ai: ai || null,
            source: source || null,
            tag: tag || null
          },
          account
        });
      }

      const artifactMatch = pathname.match(/^\/api\/store\/packages\/([^/]+)\/releases\/([^/]+)\/artifact$/);
      if (artifactMatch) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return sendMethodNotAllowed(res, ['GET', 'HEAD']);
        }
        const slug = safeDecodePathSegment(artifactMatch[1]);
        const version = safeDecodePathSegment(artifactMatch[2]);
        const item = catalogBySlug.get(slug);
        if (!item) {
          throw new StoreApiError(404, 'PACKAGE_NOT_FOUND', `Package '${slug}' not found`);
        }
        if (item.release_kind === 'editorial') {
          throw new StoreApiError(
            422,
            'EDITORIAL_NOT_INSTALLABLE',
            'Editorial content cannot be downloaded or installed as a package artifact'
          );
        }
        if (item.asset_version_id !== version) {
          throw new StoreApiError(404, 'RELEASE_NOT_FOUND', `Release '${version}' not found for '${slug}'`);
        }
        const expectedDigestParam = url.searchParams.get('digest');
        if (expectedDigestParam && expectedDigestParam !== item.artifact_digest) {
          throw new StoreApiError(
            409,
            'ARTIFACT_DIGEST_MISMATCH',
            'Requested digest does not match immutable release artifact_digest'
          );
        }
        const artifactKey = `${item.asset_id}@${item.asset_version_id}`;
        const artifact = artifacts.get(artifactKey);
        if (!artifact || formatSha256Digest(artifact.buffer) !== item.artifact_digest) {
          throw new StoreApiError(500, 'ARTIFACT_INTEGRITY_ERROR', 'Artifact digest verification failed');
        }
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(artifact.buffer.length),
          'Content-Disposition': `attachment; filename="${item.asset_id}-${item.asset_version_id}.playforgepkg"`,
          'ETag': `"${item.artifact_digest}"`,
          'X-PlayForge-Artifact-Digest': item.artifact_digest,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Resource-Policy': 'same-origin'
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(artifact.buffer);
        return;
      }

      const packageMatch = pathname.match(/^\/api\/store\/packages\/([^/]+)$/);
      if (packageMatch) {
        if (req.method !== 'GET') {
          return sendMethodNotAllowed(res, ['GET']);
        }
        const slug = safeDecodePathSegment(packageMatch[1]);
        const item = catalogBySlug.get(slug);
        if (!item) {
          throw new StoreApiError(404, 'PACKAGE_NOT_FOUND', `Package '${slug}' not found`);
        }
        const account = await resolveAccount(req);
        const savedSet = store.getSavedSet(account.account_key);
        const libraryEntry = store.getEntry(account.account_key, slug);
        const enriched = enrichCatalogItem(item, savedSet);
        const releases = item.release_kind === 'package'
          ? [
              {
                asset_version_id: item.asset_version_id,
                release_id: item.release_id,
                release_kind: item.release_kind,
                artifact_id: item.artifact_id,
                artifact_digest: item.artifact_digest,
                dependency_manifest_hash: item.dependency_manifest_hash,
                engine_compatibility: structuredClone(item.engine_compatibility),
                file_manifest: structuredClone(item.file_manifest),
                license_snapshot_ref: item.license_snapshot_ref,
                installable: true,
                artifact_url: enriched.artifact_url
              }
            ]
          : [
              {
                asset_version_id: item.asset_version_id,
                release_id: item.release_id,
                release_kind: item.release_kind,
                license_snapshot_ref: item.license_snapshot_ref,
                installable: false
              }
            ];
        return sendJson(res, 200, {
          ...enriched,
          saved: Boolean(libraryEntry),
          library_entry: libraryEntry ? enrichLibraryEntry(libraryEntry) : null,
          releases,
          account
        });
      }

      if (pathname === '/api/store/my-assets') {
        if (req.method === 'GET') {
          const account = await resolveAccount(req);
          const entries = store.listEntries(account.account_key).map(enrichLibraryEntry);
          return sendJson(res, 200, {
            account,
            entries,
            count: entries.length
          });
        }
        if (req.method === 'POST') {
          const account = await resolveAccount(req);
          const body = await readJsonBody(req);
          const slug = String(body.slug ?? body.asset_id ?? '').trim();
          const action = String(body.action ?? '').trim();
          if (!slug || !VALID_SLUG.test(slug)) {
            throw new StoreApiError(422, 'INVALID_REQUEST', 'A valid package slug is required');
          }
          if (action !== 'save' && action !== 'remove') {
            throw new StoreApiError(422, 'INVALID_ACTION', "action must be 'save' or 'remove'");
          }
          const item = catalogBySlug.get(slug);
          if (!item) {
            throw new StoreApiError(404, 'PACKAGE_NOT_FOUND', `Package '${slug}' not found`);
          }
          if (item.release_kind === 'editorial') {
            throw new StoreApiError(
              422,
              'EDITORIAL_NOT_INSTALLABLE',
              'Editorial content cannot be saved or installed as a package library entry'
            );
          }

          let entry = null;
          let removed = false;
          if (action === 'save') {
            const savedResult = await store.saveEntry(account, item);
            entry = enrichLibraryEntry(savedResult.entry);
          } else {
            const removeResult = await store.removeEntry(account, slug);
            removed = removeResult.removed;
          }
          const entries = store.listEntries(account.account_key).map(enrichLibraryEntry);
          return sendJson(res, 200, {
            ok: true,
            action,
            slug,
            saved: action === 'save',
            removed,
            entry,
            account,
            entries,
            count: entries.length
          });
        }
        return sendMethodNotAllowed(res, ['GET', 'POST']);
      }

      if (pathname === '/api/store/publisher/drafts') {
        if (req.method !== 'GET') {
          return sendMethodNotAllowed(res, ['GET']);
        }
        return sendJson(res, 200, {
          drafts: structuredClone(publisherDrafts),
          count: publisherDrafts.length
        });
      }

      if (pathname.startsWith('/api/')) {
        throw new StoreApiError(404, 'NOT_FOUND', `Unknown API route: ${pathname}`);
      }

      if (webDirReal) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return sendMethodNotAllowed(res, ['GET', 'HEAD']);
        }
        const filePath = resolveStaticFile(webDirReal, pathname);
        if (!filePath) {
          return sendJson(res, 404, { error: { code: 'NOT_FOUND', message: 'Static asset not found' } });
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        const content = fs.readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': String(content.length),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Cross-Origin-Resource-Policy': 'same-origin'
        });
        if (req.method === 'HEAD') {
          res.end();
          return;
        }
        res.end(content);
        return;
      }

      throw new StoreApiError(404, 'NOT_FOUND', 'Route not found');
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof StoreApiError) {
        sendJson(res, error.status, {
          error: {
            code: error.code,
            message: error.message,
            ...(error.extra || {})
          }
        });
        return;
      }
      sendJson(res, 500, {
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal store server error'
        }
      });
    }
  }

  const server = http.createServer(handler);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;

  let closed = false;

  return {
    handler,
    server,
    store,
    artifacts,
    catalog: catalogList,
    address() {
      return server.address();
    },
    listen(port = 0, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        server.once('error', onError);
        server.listen(port, host, () => {
          server.off('error', onError);
          resolve(server.address());
        });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await store.writeQueue.catch(() => {});
      await new Promise((resolve) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  };
}
