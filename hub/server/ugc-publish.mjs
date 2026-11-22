// Hub UGC Publication Engine: bridges verified Forge releases into dynamic PlayHub catalog
// and isolated /play-ugc/<hostSlug>/<releaseId>/ serving via CAS pointers.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { transaction } from './db.mjs';
import { forgeAccountKey, googleIdentityForSession } from './forge-account.mjs';
import { createArtifactStorage } from './artifact-storage.mjs';
import { resolveUgcOrigin } from './runtime-config.mjs';
import { ApiError, digest, json, readJson, uid } from './security.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadPublishContract() {
  const repoShared = path.resolve(__dirname, '../../tools/ugc-shared/publish-contract.cjs');
  if (fs.existsSync(repoShared)) return require(repoShared);
  return require(path.resolve(__dirname, 'ugc-shared/publish-contract.cjs'));
}
const { GAME_ID_RE, DEPLOY_MODES, VISIBILITIES, cleanText, slugifyGameId } = loadPublishContract();

const FORGE_ID_RE = /^[a-f0-9]{24}$/;
const SUBMISSION_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const HOST_SLUG_RE = /^p[a-z2-7]{16}$/;
const PLAY_UGC_RE = /^\/play-ugc\/(p[a-z2-7]{16})\/([a-f0-9]{24})(?:\/(.*))?$/;
const ADMIN_PUBLISH_SUBMISSION_RE = /^\/api\/admin\/submissions\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/publish$/;
const ADMIN_PUB_ITEM_RE = /^\/api\/admin\/publications\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\/(rollback|status))?$/;
const CREATOR_PUB_STATUS_RE = /^\/api\/creator\/publications\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\/status$/;
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const PUB_STATUSES = new Set(['published', 'unpublished', 'suspended']);

function generateHostSlug(ownerKey, projectId) {
  const hash = crypto.createHash('sha256').update(`${ownerKey}:${projectId}`).digest();
  let out = 'p';
  for (let i = 0; i < 16; i++) {
    out += BASE32_ALPHABET[hash[i] & 31];
  }
  return out;
}

function localizedPair(value, fallbackKo, fallbackEn, maxLen) {
  if (typeof value === 'string') {
    const text = cleanText(value, maxLen, fallbackKo);
    return { ko: text, en: text };
  }
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ko = cleanText(obj.ko, maxLen, cleanText(obj.en, maxLen, fallbackKo));
  const en = cleanText(obj.en, maxLen, ko || fallbackEn);
  return { ko: ko || fallbackKo, en: en || fallbackEn };
}

function buildHubGameManifest({ gameId, title, description, release, metadataOverride, visibility, nowMs }) {
  const rm = release?.releaseManifest || null;
  const gm = {
    ...(rm?.gameMetadata || {}),
    ...(release?.gameMetadata || {}),
    ...(metadataOverride && typeof metadataOverride === 'object' ? metadataOverride : {})
  };
  const fallbackTitle = cleanText(title || release?.label, 80, gameId);
  const locTitle = localizedPair(gm.title, fallbackTitle, fallbackTitle, 80);
  const locSummary = localizedPair(
    gm.summary,
    cleanText(description, 240, `${locTitle.ko} — PlayForge 제작 게임`),
    cleanText(description, 240, `${locTitle.en} — Built with PlayForge`),
    240
  );
  const locInstructions = localizedPair(
    gm.instructions,
    '키보드 또는 터치로 플레이하세요.',
    'Play with keyboard or touch controls.',
    600
  );
  const tags = Array.isArray(gm.tags) && gm.tags.length
    ? [...new Set(gm.tags.map(t => cleanText(String(t || ''), 24, '').toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean))].slice(0, 6)
    : ['arcade'];
  const controls = Array.isArray(gm.controls) && gm.controls.length
    ? [...new Set(gm.controls.map(c => String(c || '').toLowerCase()).filter(c => ['keyboard', 'mouse', 'touch', 'gamepad'].includes(c)))]
    : ['keyboard', 'mouse'];
  const vp = gm.viewport && typeof gm.viewport === 'object' ? gm.viewport : {};
  const viewport = {
    width: Number.isSafeInteger(vp.width) ? Math.max(320, Math.min(3840, vp.width)) : 1280,
    height: Number.isSafeInteger(vp.height) ? Math.max(240, Math.min(2160, vp.height)) : 720,
    orientation: ['landscape', 'portrait', 'any'].includes(vp.orientation) ? vp.orientation : 'landscape',
    resize: ['fit', 'fill', 'fixed'].includes(vp.resize) ? vp.resize : 'fit'
  };
  const cap = gm.capabilities && typeof gm.capabilities === 'object' ? gm.capabilities : {};
  const sv = gm.save && typeof gm.save === 'object' ? gm.save : {};
  const md = gm.media && typeof gm.media === 'object' ? gm.media : {};
  const rev = Number.isSafeInteger(release?.revision) ? release.revision : 1;
  const today = new Date(nowMs).toISOString().slice(0, 10);

  return {
    schemaVersion: 1,
    id: gameId,
    slug: gameId,
    title: locTitle,
    summary: locSummary,
    instructions: locInstructions,
    entry: 'index.html',
    version: `0.1.${rev}`,
    tags: tags.length ? tags : ['arcade'],
    controls: controls.length ? controls : ['keyboard', 'mouse'],
    viewport,
    capabilities: {
      webgl: cap.webgl !== false,
      wasm: cap.wasm !== false,
      workers: false,
      fullscreen: cap.fullscreen !== false,
      pointerLock: cap.pointerLock === true,
      externalNetwork: []
    },
    save: {
      enabled: sv.enabled !== false,
      schemaVersion: Number.isSafeInteger(sv.schemaVersion) ? Math.max(1, sv.schemaVersion) : 1,
      maxSlots: Number.isSafeInteger(sv.maxSlots) ? Math.max(1, Math.min(10, sv.maxSlots)) : 1
    },
    seo: {
      title: `${locTitle.ko} | PlayHub`,
      description: locSummary.ko,
      indexable: visibility === 'public'
    },
    media: {
      cover: typeof md.cover === 'string' && !md.cover.includes('..') && !md.cover.startsWith('/') ? md.cover : '',
      screenshots: Array.isArray(md.screenshots) ? md.screenshots.slice(0, 5) : []
    },
    publishedOn: today,
    updatedOn: today
  };
}

function readStaticGameIds(rootDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'catalog/games.json'), 'utf8'));
    if (Array.isArray(raw?.entries)) {
      return new Set(raw.entries.map(e => e?.id).filter(Boolean));
    }
  } catch {}
  return new Set();
}

function toPublication(row, ugcOrigin = null) {
  let manifest = null;
  let deployProfile = null;
  try { manifest = JSON.parse(row.manifest_json); } catch {}
  try { deployProfile = JSON.parse(row.deploy_profile_json); } catch {}
  const rawBaseUrl = String(row.artifact_base_url || '');
  const artifactBaseUrl = ugcOrigin && rawBaseUrl.startsWith('/') ? `${ugcOrigin}${rawBaseUrl}` : rawBaseUrl;
  return {
    gameId: row.game_id,
    hostSlug: row.host_slug,
    ownerId: row.owner_id,
    projectId: row.project_id,
    activeReleaseId: row.active_release_id,
    activeSubmissionId: row.active_submission_id || null,
    visibility: row.visibility,
    deployMode: row.deploy_mode,
    status: row.status,
    unpublishedBy: row.unpublished_by || null,
    artifactSha256: row.artifact_sha256,
    artifactBaseUrl,
    entryUrl: `${artifactBaseUrl}index.html`,
    manifest,
    deployProfile,
    casVersion: row.cas_version,
    publishedAt: new Date(row.published_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString()
  };
}

function toHistoryRow(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    fromReleaseId: row.from_release_id || null,
    toReleaseId: row.to_release_id,
    action: row.action,
    actorId: row.actor_id,
    reason: row.reason || null,
    casVersion: row.cas_version,
    createdAt: new Date(row.created_at).toISOString()
  };
}

export function createUgcPublish({
  config = {},
  db,
  requireSession,
  rootDir,
  now = Date.now,
  audit = () => {},
  forgeGateway,
  artifactStorage = null,
  env = process.env
}) {
  const ugcOrigin = resolveUgcOrigin(config.publish?.ugcOrigin !== undefined ? config.publish.ugcOrigin : env?.PLAYHUB_UGC_ORIGIN);
  const rawBasePrefix = String(config.publish?.publicBasePrefix || '/play-ugc').replace(/\/+$/, '');
  const publicBasePrefix = ugcOrigin && rawBasePrefix.startsWith('/') ? `${ugcOrigin}${rawBasePrefix}` : rawBasePrefix;
  const frameAncestors = ["'self'", ...((Array.isArray(config.userOrigins) ? config.userOrigins : [])
    .filter(o => typeof o === 'string' && /^https?:\/\//i.test(o)))];
  const ugcCsp = `sandbox allow-scripts allow-pointer-lock; frame-ancestors ${[...new Set(frameAncestors)].join(' ')}`;

  const storage = artifactStorage || createArtifactStorage({
    storageMode: config.publish?.storageMode || 'local-fs',
    dataDir: config.dataDir,
    publicBasePrefix
  });

  const formatPublication = row => toPublication(row, ugcOrigin);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_publications (
      game_id TEXT PRIMARY KEY,
      host_slug TEXT NOT NULL UNIQUE,
      owner_key TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      active_release_id TEXT NOT NULL,
      active_submission_id TEXT,
      visibility TEXT NOT NULL CHECK(visibility IN ('private','unlisted','public')),
      deploy_mode TEXT NOT NULL CHECK(deploy_mode IN ('singleplay','mo','mmo')),
      status TEXT NOT NULL CHECK(status IN ('published','unpublished','suspended')),
      unpublished_by TEXT,
      artifact_sha256 TEXT NOT NULL,
      artifact_base_url TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      deploy_profile_json TEXT NOT NULL,
      cas_version INTEGER NOT NULL DEFAULT 1,
      published_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS hub_publications_owner ON hub_publications(owner_key, updated_at DESC);
    CREATE INDEX IF NOT EXISTS hub_publications_host_slug ON hub_publications(host_slug);
    CREATE INDEX IF NOT EXISTS hub_publications_project ON hub_publications(owner_key, project_id);

    CREATE TABLE IF NOT EXISTS hub_publication_history (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      from_release_id TEXT,
      to_release_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      reason TEXT,
      cas_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      manifest_json TEXT,
      deploy_profile_json TEXT,
      artifact_sha256 TEXT
    );
    CREATE INDEX IF NOT EXISTS hub_publication_history_game ON hub_publication_history(game_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS hub_publish_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const pubCols = new Set(db.prepare('PRAGMA table_info(hub_publications)').all().map(c => c.name));
  if (!pubCols.has('unpublished_by')) {
    db.exec('ALTER TABLE hub_publications ADD COLUMN unpublished_by TEXT');
  }
  const histCols = new Set(db.prepare('PRAGMA table_info(hub_publication_history)').all().map(c => c.name));
  for (const [col, def] of [['manifest_json', 'TEXT'], ['deploy_profile_json', 'TEXT'], ['artifact_sha256', 'TEXT']]) {
    if (!histCols.has(col)) {
      db.exec(`ALTER TABLE hub_publication_history ADD COLUMN ${col} ${def}`);
    }
  }

  const getPubById = db.prepare('SELECT * FROM hub_publications WHERE game_id=?');
  const getPubByHostSlug = db.prepare('SELECT * FROM hub_publications WHERE host_slug=?');
  const getPubByOwnerProject = db.prepare('SELECT * FROM hub_publications WHERE owner_key=? AND project_id=? LIMIT 1');
  const listAllPubs = db.prepare('SELECT * FROM hub_publications ORDER BY updated_at DESC, game_id ASC');
  const listOwnerPubs = db.prepare('SELECT * FROM hub_publications WHERE owner_key=? ORDER BY updated_at DESC, game_id ASC');
  const listPubHistory = db.prepare('SELECT * FROM hub_publication_history WHERE game_id=? ORDER BY created_at DESC, rowid DESC LIMIT 30');
  const findPublishedHistoryForRelease = db.prepare(`SELECT * FROM hub_publication_history
    WHERE game_id=? AND to_release_id=? AND action IN ('publish', 'update')
    ORDER BY created_at DESC, rowid DESC LIMIT 1`);
  const findLastUnpublishAction = db.prepare(`SELECT action FROM hub_publication_history
    WHERE game_id=? AND action IN ('unpublish', 'creator_unpublish')
    ORDER BY created_at DESC, rowid DESC LIMIT 1`);
  const insertHistory = db.prepare(`INSERT INTO hub_publication_history
    (id, game_id, from_release_id, to_release_id, action, actor_id, reason, cas_version, created_at, manifest_json, deploy_profile_json, artifact_sha256)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  function recordHistory(gameId, fromReleaseId, toReleaseId, action, actorId, reason, casVersion, createdAt, extra = {}) {
    insertHistory.run(
      uid(), gameId, fromReleaseId || null, toReleaseId, action, actorId, reason || null, casVersion, createdAt,
      extra.manifestJson ?? null, extra.deployProfileJson ?? null, extra.artifactSha256 ?? null
    );
  }

  function requireForgeEnabled() {
    if (config.forge?.enabled !== true) throw new ApiError(503, 'FORGE_DISABLED');
  }

  function requireCreator(req) {
    const session = requireSession(req, 'public');
    if (req.headers.authorization) throw new ApiError(401, 'GOOGLE_LOGIN_REQUIRED');
    let identity;
    try { identity = googleIdentityForSession(db, session); }
    catch (err) {
      if (err.code !== 'GOOGLE_LOGIN_REQUIRED') throw err;
      throw new ApiError(401, 'GOOGLE_LOGIN_REQUIRED');
    }
    requireForgeEnabled();
    return { id: session.principal_id, key: forgeAccountKey(identity), sessionHash: session.id_hash };
  }

  function assertNotStaticId(gameId) {
    if (readStaticGameIds(rootDir).has(gameId)) {
      throw new ApiError(409, 'GAME_SLUG_RESERVED', '이미 플랫폼 기본 게임으로 예약된 슬러그입니다.');
    }
  }

  async function fetchVerifiedPackage(ownerKey, projectId, releaseId) {
    if (!forgeGateway || typeof forgeGateway.getReleasePackage !== 'function') {
      throw new ApiError(503, 'FORGE_PACKAGE_UNAVAILABLE');
    }
    try {
      return await forgeGateway.getReleasePackage(ownerKey, projectId, releaseId, { toTempFile: true });
    } catch (err) {
      if (err.status === 404) throw new ApiError(404, 'RELEASE_PACKAGE_NOT_FOUND', '배포할 빌드 패키지를 찾을 수 없습니다.');
      if (err.status === 409) throw new ApiError(409, 'BUILD_PACKAGE_INVALID', '빌드 패키지 무결성 검증에 실패했습니다.');
      throw new ApiError(503, 'SERVICE_UNAVAILABLE');
    }
  }

  function checkIdempotency(idempotencyKey, scope, requestHash) {
    if (!idempotencyKey) return null;
    if (typeof idempotencyKey !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey)) {
      throw new ApiError(400, 'INVALID_IDEMPOTENCY_KEY');
    }
    const existing = db.prepare('SELECT * FROM hub_publish_idempotency WHERE idempotency_key=?').get(idempotencyKey);
    if (!existing) return null;
    if (existing.scope !== scope || existing.request_hash !== requestHash) {
      throw new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT');
    }
    return JSON.parse(existing.response_json);
  }

  function saveIdempotency(idempotencyKey, scope, requestHash, responsePayload) {
    if (!idempotencyKey) return;
    db.prepare('INSERT OR IGNORE INTO hub_publish_idempotency VALUES (?,?,?,?,?)')
      .run(idempotencyKey, scope, requestHash, JSON.stringify(responsePayload), now());
  }

  function serveUgcAsset(req, res, pathname) {
    if (pathname !== '/play-ugc' && !pathname.startsWith('/play-ugc/')) return false;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', ugcCsp);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, If-None-Match, If-Modified-Since',
        'Access-Control-Max-Age': '86400',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      res.end();
      return true;
    }
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      throw new ApiError(405, 'METHOD_NOT_ALLOWED');
    }
    const match = pathname.match(PLAY_UGC_RE);
    if (!match) {
      throw new ApiError(404, 'NOT_FOUND');
    }
    const [, hostSlug, releaseId, restPath] = match;
    if (!HOST_SLUG_RE.test(hostSlug) || !FORGE_ID_RE.test(releaseId)) {
      throw new ApiError(404, 'NOT_FOUND');
    }
    const pub = getPubByHostSlug.get(hostSlug);
    if (!pub) {
      throw new ApiError(404, 'GAME_NOT_FOUND');
    }
    if (pub.status === 'suspended') {
      throw new ApiError(403, 'GAME_SUSPENDED', '이 게임은 운영 정책에 의해 일시 차단되었습니다.');
    }
    if (pub.status !== 'published') {
      throw new ApiError(404, 'GAME_NOT_AVAILABLE', '비공개 전환된 게임입니다.');
    }
    if (pub.visibility === 'private') {
      throw new ApiError(404, 'GAME_NOT_AVAILABLE', '비공개 게임은 공개 경로에서 서빙되지 않습니다.');
    }
    if (pub.active_release_id !== releaseId) {
      throw new ApiError(404, 'RELEASE_NOT_ACTIVE', '활성화된 릴리스만 공개 서빙됩니다.');
    }
    const resolved = storage.resolveAssetPath(hostSlug, releaseId, restPath || 'index.html');
    if (!resolved) throw new ApiError(404, 'ASSET_NOT_FOUND');

    const lowerRel = resolved.relativePath.toLowerCase();
    const isHtml = lowerRel.endsWith('.html');
    const isCompressible = /\.(?:html|js|mjs|css|json|svg|txt|wasm|pck)$/.test(lowerRel);
    const acceptEncoding = String(req.headers?.['accept-encoding'] || '');
    const useGzip = req.method !== 'HEAD' && isCompressible && acceptEncoding.includes('gzip');
    const headers = {
      'Content-Type': resolved.contentType,
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': ugcCsp,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': isHtml ? 'no-store' : 'public, max-age=31536000, immutable'
    };
    if (useGzip) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
    } else {
      headers['Content-Length'] = resolved.size;
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    const stream = fs.createReadStream(resolved.filePath);
    stream.on('error', () => { if (!res.writableEnded) res.destroy(); });
    if (useGzip) {
      const gz = zlib.createGzip({ level: 6 });
      gz.on('error', () => { if (!res.writableEnded) res.destroy(); });
      stream.pipe(gz).pipe(res);
    } else {
      stream.pipe(res);
    }
    return true;
  }

  return {
    storage,
    ugcOrigin,
    serveUgcAsset,

    async publicRoute(req, res, url) {
      const { pathname } = url;
      if (pathname === '/play-ugc' || pathname.startsWith('/play-ugc/')) {
        return serveUgcAsset(req, res, pathname);
      }

      if (pathname === '/api/creator/publications' && req.method === 'GET') {
        const owner = requireCreator(req);
        const rows = listOwnerPubs.all(owner.key);
        json(res, 200, {
          publications: rows.map(row => ({
            ...formatPublication(row),
            history: listPubHistory.all(row.game_id).map(toHistoryRow)
          }))
        });
        return true;
      }

      if (pathname === '/api/creator/publications/preview' && req.method === 'POST') {
        const owner = requireCreator(req);
        const body = await readJson(req, 32 * 1024);
        const projectId = body.projectId;
        const releaseId = body.releaseId;
        const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'private';
        if (typeof projectId !== 'string' || !FORGE_ID_RE.test(projectId)
            || typeof releaseId !== 'string' || !FORGE_ID_RE.test(releaseId)) {
          throw new ApiError(400, 'INVALID_PREVIEW_REQUEST');
        }

        const pkg = await fetchVerifiedPackage(owner.key, projectId, releaseId);
        let rawSlug, hostSlug, deployProfile, deployMode, stamp, manifestJson, deployProfileJson, stored;
        try {
          const release = pkg.release;
          const existingByProject = getPubByOwnerProject.get(owner.key, projectId);
          rawSlug = typeof body.gameSlug === 'string' && GAME_ID_RE.test(body.gameSlug.trim())
            ? body.gameSlug.trim()
            : (existingByProject?.game_id || release?.gameMetadata?.slug || slugifyGameId(body.title || release?.label, projectId));
          assertNotStaticId(rawSlug);
          const existingBySlug = getPubById.get(rawSlug);
          if (existingBySlug && existingBySlug.owner_key !== owner.key) {
            throw new ApiError(409, 'GAME_SLUG_TAKEN', '이미 다른 제작자가 사용 중인 슬러그입니다.');
          }
          if (existingBySlug && existingBySlug.project_id !== projectId) {
            throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH', '이미 다른 프로젝트에 연결된 게임 슬러그입니다.');
          }
          if (existingByProject && existingByProject.game_id !== rawSlug) {
            throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH', '이 프로젝트에 이미 연결된 슬러그와 다릅니다.');
          }
          const existingPub = existingByProject || existingBySlug;
          if (existingPub && existingPub.status === 'suspended') {
            throw new ApiError(403, 'PUBLICATION_SUSPENDED_BY_ADMIN', '운영자에 의해 차단된 게임은 미리보기를 생성할 수 없습니다.');
          }

          hostSlug = existingByProject?.host_slug || existingBySlug?.host_slug || generateHostSlug(owner.key, projectId);
          deployProfile = release?.deployProfile || release?.releaseManifest?.deployProfile || {
            deployMode: DEPLOY_MODES.has(body.deployMode) ? body.deployMode : 'singleplay',
            serverRuntime: 'none',
            specTier: 'free-nano'
          };
          deployMode = DEPLOY_MODES.has(deployProfile.deployMode) ? deployProfile.deployMode : 'singleplay';
          stamp = now();
          const gameManifest = buildHubGameManifest({
            gameId: rawSlug,
            title: body.title || release?.gameMetadata?.title?.ko || release?.label,
            description: body.description,
            release,
            metadataOverride: body.gameMetadata,
            visibility,
            nowMs: stamp
          });
          manifestJson = JSON.stringify(gameManifest);
          deployProfileJson = JSON.stringify(deployProfile);

          try {
            stored = storage.putReleaseBundle({
              hostSlug,
              releaseId,
              zipBuffer: pkg.buffer || null,
              zipFilePath: pkg.filePath || null,
              expectedSha256: pkg.sha256,
              releaseManifest: release?.releaseManifest || null,
              gameManifest
            });
          } catch (err) {
            throw new ApiError(err.status || 400, err.code || 'UNSAFE_DEPLOYMENT_ZIP');
          }
        } finally {
          pkg?.cleanup?.();
        }

        const previewResult = transaction(db, () => {
          const current = getPubById.get(rawSlug);
          const currentByProject = getPubByOwnerProject.get(owner.key, projectId);
          if (current && current.owner_key !== owner.key) throw new ApiError(409, 'GAME_SLUG_TAKEN');
          if (current && current.project_id !== projectId) throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH');
          if (currentByProject && currentByProject.game_id !== rawSlug) throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH');
          const existing = current || currentByProject;
          if (existing?.status === 'suspended') {
            throw new ApiError(403, 'PUBLICATION_SUSPENDED_BY_ADMIN', '운영자에 의해 차단된 게임은 미리보기를 생성할 수 없습니다.');
          }
          // Preserve live public or unpublished state; never allow preview to flip unpublished/suspended back to published.
          if (current && (current.status === 'unpublished' || (current.visibility === 'public' && current.status === 'published'))) {
            audit('ugc_preview_staged', current.game_id, { ownerId: owner.id, releaseId, hostSlug, status: current.status });
            return {
              status: 200,
              payload: {
                publication: formatPublication(current),
                previewUrl: `${stored.artifactBaseUrl}index.html`,
                releaseId,
                artifactSha256: stored.sha256,
                liveUnchanged: true
              }
            };
          }

          const nextCas = current ? current.cas_version + 1 : 1;
          if (!current) {
            db.prepare(`INSERT INTO hub_publications
              (game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
               visibility, deploy_mode, status, unpublished_by, artifact_sha256, artifact_base_url, manifest_json, deploy_profile_json,
               cas_version, published_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)`)
              .run(rawSlug, hostSlug, owner.key, owner.id, projectId, releaseId, null,
                visibility, deployMode, 'published', stored.sha256, stored.artifactBaseUrl,
                manifestJson, deployProfileJson, nextCas, stamp, stamp);
          } else {
            const updated = db.prepare(`UPDATE hub_publications
              SET active_release_id=?, visibility=?, deploy_mode=?,
                  artifact_sha256=?, artifact_base_url=?, manifest_json=?, deploy_profile_json=?,
                  cas_version=?, updated_at=?
              WHERE game_id=? AND cas_version=? AND status='published'`)
              .run(releaseId, visibility, deployMode, stored.sha256, stored.artifactBaseUrl,
                manifestJson, deployProfileJson, nextCas, stamp, rawSlug, current.cas_version);
            if (updated.changes !== 1) throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
          }
          recordHistory(rawSlug, current?.active_release_id || null, releaseId,
            current ? 'preview_update' : 'preview_publish', owner.id, null, nextCas, stamp, {
              manifestJson,
              deployProfileJson,
              artifactSha256: stored.sha256
            });
          audit('ugc_preview_published', rawSlug, { ownerId: owner.id, releaseId, visibility, casVersion: nextCas });
          const publication = formatPublication(getPubById.get(rawSlug));
          return {
            status: 201,
            payload: {
              publication,
              previewUrl: publication.entryUrl,
              releaseId,
              artifactSha256: stored.sha256,
              liveUnchanged: false
            }
          };
        });

        json(res, previewResult.status, previewResult.payload);
        return true;
      }

      const creatorStatusMatch = pathname.match(CREATOR_PUB_STATUS_RE);
      if (creatorStatusMatch && req.method === 'POST') {
        const owner = requireCreator(req);
        const gameId = creatorStatusMatch[1];
        const body = await readJson(req, 4096);
        if (!['published', 'unpublished'].includes(body.status)) {
          throw new ApiError(400, 'INVALID_PUBLICATION_STATUS');
        }
        const publication = transaction(db, () => {
          const current = getPubById.get(gameId);
          if (!current || current.owner_key !== owner.key) throw new ApiError(404, 'PUBLICATION_NOT_FOUND');
          if (current.status === 'suspended') throw new ApiError(403, 'PUBLICATION_SUSPENDED_BY_ADMIN');
          if (current.status === 'unpublished') {
            let adminUnpublished = current.unpublished_by === 'admin';
            if (!adminUnpublished && !current.unpublished_by) {
              const lastUnpub = findLastUnpublishAction.get(gameId);
              if (lastUnpub?.action === 'unpublish') adminUnpublished = true;
            }
            if (adminUnpublished) {
              throw new ApiError(403, 'PUBLICATION_UNPUBLISHED_BY_ADMIN', '운영자가 비공개 처리한 게임은 제작자가 상태를 변경할 수 없습니다.');
            }
          }
          const stamp = now();
          const nextCas = current.cas_version + 1;
          const nextUnpublishedBy = body.status === 'unpublished' ? 'creator' : null;
          const updated = db.prepare('UPDATE hub_publications SET status=?, unpublished_by=?, cas_version=?, updated_at=? WHERE game_id=? AND cas_version=?')
            .run(body.status, nextUnpublishedBy, nextCas, stamp, gameId, current.cas_version);
          if (updated.changes !== 1) throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
          recordHistory(gameId, current.active_release_id, current.active_release_id,
            body.status === 'unpublished' ? 'creator_unpublish' : 'creator_republish', owner.id, null, nextCas, stamp);
          audit('ugc_creator_status_changed', gameId, { ownerId: owner.id, status: body.status, casVersion: nextCas });
          return formatPublication(getPubById.get(gameId));
        });
        json(res, 200, { publication });
        return true;
      }

      return false;
    },

    async adminRoute(req, res, url, adminSession) {
      const { pathname } = url;

      if (pathname === '/api/admin/publications' && req.method === 'GET') {
        const rows = listAllPubs.all();
        json(res, 200, {
          publications: rows.map(row => ({
            ...formatPublication(row),
            history: listPubHistory.all(row.game_id).map(toHistoryRow)
          }))
        });
        return true;
      }

      const pubItemMatch = pathname.match(ADMIN_PUB_ITEM_RE);
      if (pubItemMatch) {
        const [, gameId, action] = pubItemMatch;
        if (!action && req.method === 'GET') {
          const row = getPubById.get(gameId);
          if (!row) throw new ApiError(404, 'PUBLICATION_NOT_FOUND');
          json(res, 200, {
            publication: formatPublication(row),
            history: listPubHistory.all(gameId).map(toHistoryRow)
          });
          return true;
        }

        if (action === 'rollback' && req.method === 'POST') {
          const body = await readJson(req, 8192);
          const toReleaseId = body.toReleaseId;
          const reason = cleanText(body.reason, 500, '');
          if (typeof toReleaseId !== 'string' || !FORGE_ID_RE.test(toReleaseId)) {
            throw new ApiError(400, 'INVALID_RELEASE_ID');
          }
          const publication = transaction(db, () => {
            const current = getPubById.get(gameId);
            if (!current) throw new ApiError(404, 'PUBLICATION_NOT_FOUND');
            if (body.expectedCasVersion !== undefined && body.expectedCasVersion !== current.cas_version) {
              throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
            }
            const publishedHistory = findPublishedHistoryForRelease.get(gameId, toReleaseId);
            if (!publishedHistory) {
              throw new ApiError(409, 'ROLLBACK_TARGET_NOT_PUBLISHED', '이전에 관리자가 게시한 릴리스로만 롤백할 수 있습니다.');
            }
            if (!storage.hasRelease(current.host_slug, toReleaseId)) {
              throw new ApiError(404, 'ROLLBACK_ARTIFACT_NOT_FOUND', '롤백 대상 릴리스 아티팩트가 스토리지에 없습니다.');
            }
            const stamp = now();
            const nextCas = current.cas_version + 1;
            const nextBaseUrl = `${storage.publicBasePrefix}/${current.host_slug}/${toReleaseId}/`;
            let nextSha = publishedHistory.artifact_sha256 || current.artifact_sha256;
            let nextManifestJson = publishedHistory.manifest_json || null;
            let nextDeployProfileJson = publishedHistory.deploy_profile_json || null;
            const metaPath = path.join(storage.rootDir, current.host_slug, `${toReleaseId}.meta.json`);
            try {
              const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
              if (!publishedHistory.artifact_sha256 && typeof meta?.sha256 === 'string') nextSha = meta.sha256;
              if (!nextManifestJson && meta?.gameManifest && typeof meta.gameManifest === 'object') {
                nextManifestJson = JSON.stringify(meta.gameManifest);
              }
              if (!nextDeployProfileJson && meta?.releaseManifest?.deployProfile && typeof meta.releaseManifest.deployProfile === 'object') {
                nextDeployProfileJson = JSON.stringify(meta.releaseManifest.deployProfile);
              }
            } catch {}
            if (!nextManifestJson) nextManifestJson = current.manifest_json;
            if (!nextDeployProfileJson) nextDeployProfileJson = current.deploy_profile_json;

            const updated = db.prepare(`UPDATE hub_publications
              SET active_release_id=?, artifact_sha256=?, artifact_base_url=?,
                  manifest_json=?, deploy_profile_json=?, cas_version=?, updated_at=?
              WHERE game_id=? AND cas_version=?`)
              .run(toReleaseId, nextSha, nextBaseUrl, nextManifestJson, nextDeployProfileJson,
                nextCas, stamp, gameId, current.cas_version);
            if (updated.changes !== 1) throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
            recordHistory(gameId, current.active_release_id, toReleaseId,
              'rollback', adminSession.admin_username || 'admin', reason || null, nextCas, stamp, {
                manifestJson: nextManifestJson,
                deployProfileJson: nextDeployProfileJson,
                artifactSha256: nextSha
              });
            if (current.active_submission_id) {
              try {
                db.prepare("UPDATE creator_submissions SET publication_status='rolled_back', updated_at=? WHERE id=?")
                  .run(stamp, current.active_submission_id);
              } catch {}
            }
            audit('ugc_publication_rolled_back', gameId, {
              admin: adminSession.admin_username,
              fromReleaseId: current.active_release_id,
              toReleaseId,
              reason,
              casVersion: nextCas
            });
            return formatPublication(getPubById.get(gameId));
          });
          json(res, 200, { publication, history: listPubHistory.all(gameId).map(toHistoryRow) });
          return true;
        }

        if (action === 'status' && req.method === 'POST') {
          const body = await readJson(req, 8192);
          const nextStatus = body.status;
          const reason = cleanText(body.reason, 500, '');
          if (!PUB_STATUSES.has(nextStatus)) throw new ApiError(400, 'INVALID_PUBLICATION_STATUS');
          const publication = transaction(db, () => {
            const current = getPubById.get(gameId);
            if (!current) throw new ApiError(404, 'PUBLICATION_NOT_FOUND');
            if (body.expectedCasVersion !== undefined && body.expectedCasVersion !== current.cas_version) {
              throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
            }
            const stamp = now();
            const nextCas = current.cas_version + 1;
            const nextUnpublishedBy = nextStatus === 'unpublished' ? 'admin' : null;
            const updated = db.prepare('UPDATE hub_publications SET status=?, unpublished_by=?, cas_version=?, updated_at=? WHERE game_id=? AND cas_version=?')
              .run(nextStatus, nextUnpublishedBy, nextCas, stamp, gameId, current.cas_version);
            if (updated.changes !== 1) throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
            const actionName = nextStatus === 'suspended' ? 'kill_switch' : nextStatus === 'unpublished' ? 'unpublish' : 'republish';
            recordHistory(gameId, current.active_release_id, current.active_release_id,
              actionName, adminSession.admin_username || 'admin', reason || null, nextCas, stamp);
            if (current.active_submission_id) {
              try {
                db.prepare('UPDATE creator_submissions SET publication_status=?, updated_at=? WHERE id=?')
                  .run(nextStatus, stamp, current.active_submission_id);
              } catch {}
            }
            audit('ugc_publication_status_changed', gameId, {
              admin: adminSession.admin_username,
              status: nextStatus,
              reason,
              casVersion: nextCas
            });
            return formatPublication(getPubById.get(gameId));
          });
          json(res, 200, { publication, history: listPubHistory.all(gameId).map(toHistoryRow) });
          return true;
        }

        throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      }

      const publishMatch = pathname.match(ADMIN_PUBLISH_SUBMISSION_RE);
      if (publishMatch) {
        if (req.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
        const submissionId = publishMatch[1];
        if (!SUBMISSION_ID_RE.test(submissionId)) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');
        requireForgeEnabled();

        const body = await readJson(req, 16 * 1024);
        const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
        const scope = `publish:${submissionId}`;
        const requestHash = digest(JSON.stringify({ submissionId, body }));
        const cached = checkIdempotency(idempotencyKey, scope, requestHash);
        if (cached) {
          res.setHeader('X-Idempotent-Replay', 'true');
          json(res, 200, cached);
          return true;
        }

        const submission = db.prepare("SELECT * FROM creator_submissions WHERE id=? AND status<>'draft'").get(submissionId);
        if (!submission) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');

        const approveIfInReview = body.approveIfInReview === true;
        if (submission.status === 'in_review') {
          if (!approveIfInReview) throw new ApiError(409, 'SUBMISSION_NOT_APPROVED', '먼저 메타데이터 승인 후 게시하거나 approveIfInReview 옵션을 사용하세요.');
          if (body.revision !== undefined && body.revision !== submission.revision) {
            throw new ApiError(409, 'SUBMISSION_REVISION_CONFLICT');
          }
        } else if (submission.status !== 'approved') {
          throw new ApiError(409, 'SUBMISSION_NOT_APPROVED', '승인된 제출만 라이브 게시할 수 있습니다.');
        }

        if (body.requireChecklist === true) {
          const ck = db.prepare('SELECT items_json FROM submission_checklists WHERE submission_id=? AND submission_revision=?')
            .get(submissionId, submission.revision);
          let items = null;
          try { items = ck ? JSON.parse(ck.items_json) : null; } catch {}
          const requiredKeys = ['content_safety', 'metadata_match', 'controls_mobile', 'save_runtime', 'copyright_origin'];
          if (!items || requiredKeys.some(k => items[k] !== true)) {
            throw new ApiError(409, 'CHECKLIST_INCOMPLETE', '수동 검수 체크리스트 5개 항목을 모두 확인한 뒤 게시해 주세요.');
          }
        }

        const pkg = await fetchVerifiedPackage(submission.owner_key, submission.project_id, submission.release_id);
        let candidateSlug, deployProfile, deployMode, visibility, hostSlug, stamp, manifestJson, deployProfileJson, stored;
        try {
          const release = pkg.release;
          if (release.revision !== submission.release_revision) {
            throw new ApiError(409, 'SUBMISSION_RELEASE_MISMATCH');
          }

          let submissionManifestMeta = null;
          try { submissionManifestMeta = submission.manifest_json ? JSON.parse(submission.manifest_json) : null; } catch {}

          const existingByProject = getPubByOwnerProject.get(submission.owner_key, submission.project_id);
          candidateSlug = typeof body.gameSlug === 'string' && GAME_ID_RE.test(body.gameSlug.trim())
            ? body.gameSlug.trim()
            : (submission.game_slug && GAME_ID_RE.test(submission.game_slug)
              ? submission.game_slug
              : (existingByProject?.game_id
                || release?.gameMetadata?.slug
                || submissionManifestMeta?.slug
                || slugifyGameId(submission.title, submission.project_id)));
          assertNotStaticId(candidateSlug);

          const existingBySlug = getPubById.get(candidateSlug);
          if (existingBySlug && existingBySlug.owner_key !== submission.owner_key) {
            throw new ApiError(409, 'GAME_SLUG_TAKEN', '이미 다른 제작자가 사용 중인 슬러그입니다.');
          }
          if (existingBySlug && existingBySlug.project_id !== submission.project_id) {
            throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH', '이미 다른 프로젝트에 연결된 게임 슬러그입니다.');
          }
          if (existingByProject && existingByProject.game_id !== candidateSlug) {
            throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH', '이 프로젝트에 이미 연결된 슬러그와 다릅니다.');
          }

          deployProfile = release?.deployProfile || release?.releaseManifest?.deployProfile || {
            deployMode: DEPLOY_MODES.has(submission.deploy_mode) ? submission.deploy_mode : 'singleplay',
            serverRuntime: 'none',
            specTier: 'free-nano'
          };
          deployMode = DEPLOY_MODES.has(deployProfile.deployMode) ? deployProfile.deployMode : 'singleplay';
          visibility = VISIBILITIES.has(submission.visibility) ? submission.visibility : 'public';
          if (deployMode === 'mmo' && deployProfile.specTier === 'free-nano' && visibility === 'public') {
            throw new ApiError(409, 'MMO_PUBLIC_REQUIRES_PAID_TIER', 'MMO 라이브 공개는 유료 허브 포인트 프리셋이 필요합니다.');
          }

          hostSlug = existingByProject?.host_slug || existingBySlug?.host_slug || generateHostSlug(submission.owner_key, submission.project_id);
          stamp = now();
          const gameManifest = buildHubGameManifest({
            gameId: candidateSlug,
            title: submission.title,
            description: submission.description,
            release,
            metadataOverride: submissionManifestMeta,
            visibility,
            nowMs: stamp
          });
          manifestJson = JSON.stringify(gameManifest);
          deployProfileJson = JSON.stringify(deployProfile);

          try {
            stored = storage.putReleaseBundle({
              hostSlug,
              releaseId: submission.release_id,
              zipBuffer: pkg.buffer || null,
              zipFilePath: pkg.filePath || null,
              expectedSha256: pkg.sha256,
              releaseManifest: release?.releaseManifest || null,
              gameManifest
            });
          } catch (err) {
            throw new ApiError(err.status || 400, err.code || 'UNSAFE_DEPLOYMENT_ZIP');
          }
        } finally {
          pkg?.cleanup?.();
        }

        const responsePayload = transaction(db, () => {
          const freshSub = db.prepare("SELECT * FROM creator_submissions WHERE id=? AND status<>'draft'").get(submissionId);
          if (!freshSub) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');

          if (freshSub.status === 'in_review') {
            if (!approveIfInReview) throw new ApiError(409, 'SUBMISSION_NOT_APPROVED');
            if (body.revision !== undefined && body.revision !== freshSub.revision) {
              throw new ApiError(409, 'SUBMISSION_REVISION_CONFLICT');
            }
            const note = cleanText(body.note, 1000, '');
            const approved = db.prepare(`UPDATE creator_submissions
              SET status='approved', review_note=?, revision=revision+1, updated_at=?, decided_at=?
              WHERE id=? AND revision=? AND status='in_review'`)
              .run(note || null, stamp, stamp, submissionId, freshSub.revision);
            if (approved.changes !== 1) throw new ApiError(409, 'SUBMISSION_REVISION_CONFLICT');
            audit('creator_submission_approved', submissionId, {
              admin: adminSession.admin_username,
              note: note || null,
              viaPublish: true
            });
          } else if (freshSub.status !== 'approved') {
            throw new ApiError(409, 'SUBMISSION_NOT_APPROVED');
          }

          const currentPub = getPubById.get(candidateSlug);
          const currentByProject = getPubByOwnerProject.get(freshSub.owner_key, freshSub.project_id);
          if (currentPub && currentPub.owner_key !== freshSub.owner_key) {
            throw new ApiError(409, 'GAME_SLUG_TAKEN');
          }
          if (currentPub && currentPub.project_id !== freshSub.project_id) {
            throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH');
          }
          if (currentByProject && currentByProject.game_id !== candidateSlug) {
            throw new ApiError(409, 'GAME_SLUG_PROJECT_MISMATCH');
          }
          if (body.expectedCasVersion !== undefined && currentPub && body.expectedCasVersion !== currentPub.cas_version) {
            throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
          }
          const nextCas = currentPub ? currentPub.cas_version + 1 : 1;
          if (!currentPub) {
            db.prepare(`INSERT INTO hub_publications
              (game_id, host_slug, owner_key, owner_id, project_id, active_release_id, active_submission_id,
               visibility, deploy_mode, status, unpublished_by, artifact_sha256, artifact_base_url, manifest_json, deploy_profile_json,
               cas_version, published_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?)`)
              .run(candidateSlug, hostSlug, freshSub.owner_key, freshSub.owner_id, freshSub.project_id,
                freshSub.release_id, submissionId, visibility, deployMode, 'published', stored.sha256,
                stored.artifactBaseUrl, manifestJson, deployProfileJson,
                nextCas, stamp, stamp);
          } else {
            const updated = db.prepare(`UPDATE hub_publications
              SET active_release_id=?, active_submission_id=?, visibility=?, deploy_mode=?, status='published',
                  unpublished_by=NULL, artifact_sha256=?, artifact_base_url=?, manifest_json=?, deploy_profile_json=?,
                  cas_version=?, updated_at=?
              WHERE game_id=? AND cas_version=?`)
              .run(freshSub.release_id, submissionId, visibility, deployMode, stored.sha256,
                stored.artifactBaseUrl, manifestJson, deployProfileJson,
                nextCas, stamp, candidateSlug, currentPub.cas_version);
            if (updated.changes !== 1) throw new ApiError(409, 'PUBLICATION_CAS_CONFLICT');
          }

          recordHistory(candidateSlug, currentPub?.active_release_id || null, freshSub.release_id,
            currentPub ? 'update' : 'publish', adminSession.admin_username || 'admin',
            cleanText(body.note, 500, '') || null, nextCas, stamp, {
              manifestJson,
              deployProfileJson,
              artifactSha256: stored.sha256
            });

          db.prepare(`UPDATE creator_submissions
            SET game_slug=?, artifact_sha256=?, package_validation='verified', publication_status='published',
                published_game_id=?, updated_at=?
            WHERE id=?`)
            .run(candidateSlug, stored.sha256, candidateSlug, stamp, submissionId);

          audit('ugc_submission_published', candidateSlug, {
            submissionId,
            releaseId: freshSub.release_id,
            admin: adminSession.admin_username,
            deployMode,
            visibility,
            casVersion: nextCas,
            artifactSha256: stored.sha256
          });

          const payload = {
            publication: formatPublication(getPubById.get(candidateSlug)),
            history: listPubHistory.all(candidateSlug).map(toHistoryRow),
            packageValidation: 'verified',
            publicationStatus: 'published'
          };
          saveIdempotency(idempotencyKey, scope, requestHash, payload);
          return payload;
        });

        json(res, 200, responsePayload);
        return true;
      }

      return false;
    }
  };
}
