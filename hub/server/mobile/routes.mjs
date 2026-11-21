import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { transaction } from '../db.mjs';
import { readCatalog, findGame } from '../catalog.mjs';
import { ApiError, assertId, digest, equal, json, readJson, safeString, secret, uid } from '../security.mjs';
import { ensureMobileSchema } from './schema.mjs';
import { createSocial } from '../social/routes.mjs';
import {
  canPlayAgeRating,
  classifyAgeTier,
  evaluateMobileCapabilities,
  normalizeAgeRating
} from './age-gate.mjs';

const ACCESS_TTL_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload, hmacSecret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac('sha256', hmacSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token, hmacSecret, nowMs) {
  if (typeof token !== 'string' || token.length > 4096) throw new ApiError(401, 'MOBILE_TOKEN_INVALID');
  const parts = token.split('.');
  if (parts.length !== 3) throw new ApiError(401, 'MOBILE_TOKEN_INVALID');
  const expected = createHmac('sha256', hmacSecret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (!equal(parts[2], expected)) throw new ApiError(401, 'MOBILE_TOKEN_INVALID');
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(401, 'MOBILE_TOKEN_INVALID');
  }
  if (!payload || typeof payload.sub !== 'string' || !Number.isFinite(payload.exp) || payload.exp <= Math.floor(nowMs / 1000)) {
    throw new ApiError(401, 'MOBILE_TOKEN_EXPIRED');
  }
  return payload;
}

export function createMobile({ config, db, rootDir, now, rate, audit, google, verifyMobileGoogleToken, env = process.env }) {
  const mobileConfig = config.mobile || {};
  const enabled = mobileConfig.enabled === true;
  if (!enabled) {
    return { enabled: false, async publicRoute() { return false; } };
  }

  ensureMobileSchema(db);
  const jwtSecret = mobileConfig.jwtSecret || env.PLAYHUB_MOBILE_JWT_SECRET || secret();

  function setNativeHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
  }

  function rejectBrowserOrigin(req) {
    if (req.headers.origin) throw new ApiError(403, 'MOBILE_ORIGIN_FORBIDDEN');
  }

  function bearerPayload(req, required = true) {
    const auth = req.headers.authorization || '';
    if (!auth) {
      if (required) throw new ApiError(401, 'MOBILE_AUTH_REQUIRED');
      return null;
    }
    const match = auth.match(/^Bearer\s+([^\s]+)$/i);
    if (!match) throw new ApiError(401, 'MOBILE_AUTH_REQUIRED');
    const payload = verifyJwt(match[1], jwtSecret, now());
    const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(payload.sub);
    if (!user) throw new ApiError(401, 'MOBILE_TOKEN_INVALID');
    return { user, familyId: payload.fam };
  }

  function issueTokenPair(principalId, existingFamilyId = null, rotatedFrom = null) {
    const stamp = now();
    const familyId = existingFamilyId || uid();
    const refreshToken = `phr_${secret()}`;
    const refreshHash = digest(refreshToken);
    db.prepare(
      'INSERT INTO mobile_tokens(id_hash,principal_id,family_id,rotated_from,revoked_at,expires_at,created_at) VALUES(?,?,?,?,NULL,?,?)'
    ).run(refreshHash, principalId, familyId, rotatedFrom, stamp + REFRESH_TTL_MS, stamp);

    const accessToken = signJwt(
      {
        sub: principalId,
        fam: familyId,
        iat: Math.floor(stamp / 1000),
        exp: Math.floor((stamp + ACCESS_TTL_MS) / 1000)
      },
      jwtSecret
    );
    return {
      accessToken,
      refreshToken,
      expiresInSec: Math.floor(ACCESS_TTL_MS / 1000)
    };
  }

  function getCompliance(principalId) {
    const row = principalId
      ? db.prepare('SELECT * FROM user_age_compliance WHERE principal_id=?').get(principalId)
      : null;
    if (!row) {
      return {
        completed: false,
        regionCode: 'KR',
        ageTier: 'UNKNOWN',
        parentalConsentStatus: 'not_required'
      };
    }
    return {
      completed: row.age_tier !== 'UNKNOWN',
      regionCode: row.region_code,
      ageTier: row.age_tier,
      parentalConsentStatus: row.parental_consent_status
    };
  }

  function buildProfileResponse(user) {
    const isGuest = user.kind !== 'registered';
    const compliance = getCompliance(user.id);
    const pendingMerge = db
      .prepare("SELECT id, source_user FROM merge_requests WHERE target_user=? AND status='pending' AND expires_at>? ORDER BY expires_at DESC LIMIT 1")
      .get(user.id, now());
    return {
      principalId: user.id,
      kind: user.kind,
      isGuest,
      displayName: user.display_name || (isGuest ? '게스트 플레이어' : 'PlayHub 유저'),
      handle: `@${isGuest ? 'guest' : 'player'}#${user.id.replace(/-/g, '').slice(-4)}`,
      ageCompliance: compliance,
      capabilities: evaluateMobileCapabilities(compliance.ageTier, isGuest, compliance.parentalConsentStatus),
      pendingMerge: pendingMerge ? { id: pendingMerge.id } : null
    };
  }

  function gameAgeRating(game) {
    if (game.ageRating) return normalizeAgeRating(game.ageRating);
    if ((game.tags || []).includes('18+')) return '18+';
    if ((game.tags || []).includes('15+')) return '15+';
    if ((game.tags || []).includes('12+')) return '12+';
    return 'ALL';
  }

  function parseSemver(raw) {
    const m = String(raw || '').trim().match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3] || 0) };
  }

  function checkVersionCompatibility({ runtime, requiredEngineVersion, minAppVersionCode, clientEngineVersion, clientAppVersionCode }) {
    if (Number.isFinite(clientAppVersionCode) && minAppVersionCode > clientAppVersionCode) {
      return {
        compatible: false,
        reason: 'APP_UPDATE_REQUIRED',
        message: `Play Hub 앱 업데이트가 필요합니다 (요구 버전코드 ${minAppVersionCode}, 현재 ${clientAppVersionCode}).`
      };
    }
    if (runtime === 'godot-pck' && requiredEngineVersion && clientEngineVersion) {
      const reqVer = parseSemver(requiredEngineVersion);
      const curVer = parseSemver(clientEngineVersion);
      if (reqVer && curVer) {
        if (reqVer.major !== curVer.major) {
          return {
            compatible: false,
            reason: 'ENGINE_MAJOR_MISMATCH',
            message: `엔진 메이저 버전이 호환되지 않습니다 (게임 요구 Godot ${requiredEngineVersion}, 앱 내장 ${clientEngineVersion}).`
          };
        }
        if (reqVer.minor > curVer.minor || (reqVer.minor === curVer.minor && reqVer.patch > curVer.patch)) {
          return {
            compatible: false,
            reason: 'ENGINE_UPDATE_REQUIRED',
            message: `상위 Godot 엔진이 필요합니다 (게임 요구 ${requiredEngineVersion}, 앱 내장 ${clientEngineVersion}). 앱을 업데이트해 주세요.`
          };
        }
      }
    }
    return { compatible: true, reason: null, message: null };
  }

  function readGameAndroidMeta(gameId) {
    const manifestPath = resolve(rootDir, 'games', gameId, 'game.manifest.json');
    let manifestAndroid = null;
    try {
      if (existsSync(manifestPath)) {
        const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'));
        manifestAndroid = parsed?.android || null;
      }
    } catch {}
    const pckDiskPath = resolve(rootDir, 'games', gameId, 'Web', 'index.pck');
    const hasPck = existsSync(pckDiskPath) || manifestAndroid?.runtime === 'godot-pck';
    const pckBytes = existsSync(pckDiskPath) ? statSync(pckDiskPath).size : (Number(manifestAndroid?.bundle?.bytes) || 0);
    return {
      runtime: hasPck ? 'godot-pck' : 'web',
      requiredEngineVersion: hasPck ? (manifestAndroid?.engineVersion || '4.7.2') : null,
      minAppVersionCode: Number(manifestAndroid?.minAppVersionCode) || 1,
      pckUrl: hasPck ? (manifestAndroid?.bundle?.url || `/games/${gameId}/index.pck`) : null,
      pckBytes
    };
  }

  function enrichMobileGame(game, compliance, clientVersions = {}) {
    const rating = gameAgeRating(game);
    const meta = readGameAndroidMeta(game.id);
    const compat = checkVersionCompatibility({
      runtime: meta.runtime,
      requiredEngineVersion: meta.requiredEngineVersion,
      minAppVersionCode: meta.minAppVersionCode,
      clientEngineVersion: clientVersions.engineVersion,
      clientAppVersionCode: clientVersions.appVersionCode
    });
    return {
      id: game.id,
      title: game.title,
      description: game.description,
      genre: game.genre,
      tags: game.tags,
      controls: game.controls,
      orientation: game.orientation,
      coverUrl: game.coverUrl,
      entryUrl: game.entryUrl,
      buildId: game.buildId,
      saveSchemaVersion: game.saveSchemaVersion,
      ageRating: rating,
      allowed: canPlayAgeRating(compliance.ageTier, rating, compliance.parentalConsentStatus),
      runtime: meta.runtime,
      compatibility: compat,
      android: meta.runtime === 'godot-pck'
        ? {
            engineVersion: meta.requiredEngineVersion,
            minAppVersionCode: meta.minAppVersionCode,
            pckUrl: meta.pckUrl,
            pckBytes: meta.pckBytes
          }
        : { minAppVersionCode: meta.minAppVersionCode }
    };
  }

  const social = createSocial({
    db,
    now,
    rate,
    audit,
    bearerPayload,
    ensureCompliance: getCompliance,
    rejectBrowserOrigin,
    config
  });

  async function publicRoute(req, res, url) {
    const path = url.pathname;
    if (!path.startsWith('/api/mobile/')) return false;
    setNativeHeaders(res);

    if (path.startsWith('/api/mobile/social/')) {
      if (await social.route(req, res, url)) return true;
    }

    // 1. Guest immediate login (no Google required)
    if (path === '/api/mobile/auth/guest' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      rate(`mobile:guest:${req.socket.remoteAddress}`, 60, 60000);
      const userId = uid();
      const stamp = now();
      let tokens;
      transaction(db, () => {
        db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)').run(userId, 'guest', null, stamp);
        tokens = issueTokenPair(userId);
      });
      const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(userId);
      json(res, 201, { ...tokens, profile: buildProfileResponse(user) });
      return true;
    }

    // 2. Google Credential Manager mobile login + optional Guest merge handoff
    if (path === '/api/mobile/auth/google' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      rate(`mobile:google:${req.socket.remoteAddress}`, 30, 60000);
      const body = await readJson(req, 16384);
      if (!safeString(body.idToken, 32768)) throw new ApiError(422, 'GOOGLE_TOKEN_REQUIRED');
      const existingBearer = bearerPayload(req, false);

      let claims;
      if (verifyMobileGoogleToken) {
        claims = await verifyMobileGoogleToken(body.idToken, body.nonce || null);
      } else if (google?.verifyIdToken) {
        claims = await google.verifyIdToken(body.idToken, body.nonce || '');
      } else {
        throw new ApiError(503, 'GOOGLE_MOBILE_AUTH_UNAVAILABLE');
      }
      if (!claims || typeof claims.sub !== 'string' || !claims.sub) throw new ApiError(401, 'GOOGLE_TOKEN_INVALID');

      const stamp = now();
      let userId;
      let tokens;
      transaction(db, () => {
        const identity = db.prepare("SELECT user_id FROM identities WHERE provider='google' AND subject=?").get(claims.sub);
        if (identity) {
          userId = identity.user_id;
          if (claims.name) {
            db.prepare('UPDATE users SET display_name=COALESCE(?, display_name) WHERE id=?').run(String(claims.name).slice(0, 80), userId);
          }
        } else {
          userId = uid();
          db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)').run(
            userId,
            'registered',
            claims.name ? String(claims.name).slice(0, 80) : 'PlayHub Player',
            stamp
          );
          db.prepare("INSERT INTO identities(provider,subject,user_id) VALUES('google',?,?)").run(claims.sub, userId);
        }

        // Preserve existing guest saves via merge_requests when upgrading from a Guest mobile session
        if (existingBearer && existingBearer.user.kind === 'guest' && existingBearer.user.id !== userId) {
          const guestSaveCount = db.prepare('SELECT COUNT(*) AS n FROM save_slots WHERE principal_id=?').get(existingBearer.user.id).n;
          if (guestSaveCount > 0) {
            db.prepare(
              "INSERT INTO merge_requests(id,source_user,target_user,source_subject,target_subject,status,expires_at,result_json) VALUES(?,?,?,?,?,'pending',?,NULL)"
            ).run(uid(), existingBearer.user.id, userId, `m:${existingBearer.user.id}`, `m:${userId}`, stamp + 7 * 86400000);
          }
          // Carry forward stricter child compliance if guest was marked CHILD_PROTECTED
          const guestComp = db.prepare('SELECT * FROM user_age_compliance WHERE principal_id=?').get(existingBearer.user.id);
          const targetComp = db.prepare('SELECT * FROM user_age_compliance WHERE principal_id=?').get(userId);
          if (guestComp && !targetComp) {
            db.prepare(
              'INSERT INTO user_age_compliance(principal_id,region_code,age_tier,parental_consent_status,parental_consent_at,kyc_verified_at,updated_at) VALUES(?,?,?,?,?,?,?)'
            ).run(userId, guestComp.region_code, guestComp.age_tier, guestComp.parental_consent_status, guestComp.parental_consent_at, guestComp.kyc_verified_at, stamp);
          }
        }
        tokens = issueTokenPair(userId);
      });

      const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(userId);
      json(res, 200, { ...tokens, profile: buildProfileResponse(user) });
      return true;
    }

    // 3. Rotating Refresh Token with reuse detection
    if (path === '/api/mobile/auth/refresh' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      const body = await readJson(req, 4096);
      if (!safeString(body.refreshToken, 256)) throw new ApiError(400, 'REFRESH_TOKEN_REQUIRED');
      const tokenHash = digest(body.refreshToken);
      const row = db.prepare('SELECT * FROM mobile_tokens WHERE id_hash=?').get(tokenHash);
      const stamp = now();
      if (!row || row.expires_at <= stamp) throw new ApiError(401, 'REFRESH_TOKEN_INVALID');

      if (row.revoked_at !== null) {
        // Reuse of an already-rotated refresh token -> revoke entire token family immediately!
        db.prepare('UPDATE mobile_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?').run(stamp, row.family_id);
        audit('mobile_token_reuse_detected', row.principal_id, { familyId: row.family_id });
        throw new ApiError(401, 'TOKEN_REUSE_DETECTED');
      }

      let tokens;
      transaction(db, () => {
        const updated = db.prepare('UPDATE mobile_tokens SET revoked_at=? WHERE id_hash=? AND revoked_at IS NULL').run(stamp, tokenHash);
        if (updated.changes !== 1) throw new ApiError(401, 'TOKEN_REUSE_DETECTED');
        tokens = issueTokenPair(row.principal_id, row.family_id, tokenHash);
      });
      const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(row.principal_id);
      json(res, 200, { ...tokens, profile: buildProfileResponse(user) });
      return true;
    }

    // 4. Logout (revoke refresh family)
    if (path === '/api/mobile/auth/logout' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      const auth = bearerPayload(req, true);
      db.prepare('UPDATE mobile_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?').run(now(), auth.familyId);
      json(res, 200, { ok: true });
      return true;
    }

    // 5. Current profile & capabilities
    if (path === '/api/mobile/me' && req.method === 'GET') {
      const auth = bearerPayload(req, true);
      json(res, 200, buildProfileResponse(auth.user));
      return true;
    }

    // 6. Neutral Age Gate submission (KR PIPA / COPPA / GDPR-K)
    if (path === '/api/mobile/age-gate' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      const auth = bearerPayload(req, true);
      const body = await readJson(req, 4096);
      const regionCode = String(body.regionCode || 'KR').toUpperCase().slice(0, 8);
      if (!/^[A-Z]{2,8}$/.test(regionCode)) throw new ApiError(422, 'REGION_INVALID');
      const computedTier = classifyAgeTier(body.birthYear, body.birthMonth, now(), regionCode);

      const existing = db.prepare('SELECT * FROM user_age_compliance WHERE principal_id=?').get(auth.user.id);
      if (existing && existing.age_tier === 'CHILD_PROTECTED' && computedTier !== 'CHILD_PROTECTED' && !existing.kyc_verified_at) {
        throw new ApiError(403, 'AGE_TIER_LOCKED', '아동 보호 모드는 임의로 상향 변경할 수 없습니다.');
      }

      const consentStatus = computedTier === 'CHILD_PROTECTED'
        ? (existing?.parental_consent_status === 'verified' ? 'verified' : 'pending')
        : 'not_required';
      const stamp = now();
      db.prepare(
        `INSERT INTO user_age_compliance(principal_id,region_code,age_tier,parental_consent_status,parental_consent_at,kyc_verified_at,updated_at)
         VALUES(?,?,?,?,?,NULL,?)
         ON CONFLICT(principal_id) DO UPDATE SET
           region_code=excluded.region_code,
           age_tier=excluded.age_tier,
           parental_consent_status=excluded.parental_consent_status,
           updated_at=excluded.updated_at`
      ).run(auth.user.id, regionCode, computedTier, consentStatus, existing?.parental_consent_at || null, stamp);

      json(res, 200, buildProfileResponse(auth.user));
      return true;
    }

    // 7. Parental consent verification (for CHILD_PROTECTED)
    if (path === '/api/mobile/parental-consent' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      const auth = bearerPayload(req, true);
      const body = await readJson(req, 4096);
      if (!safeString(body.guardianContact, 200) || !['email', 'kyc_pass'].includes(body.method)) {
        throw new ApiError(422, 'PARENTAL_CONSENT_INVALID');
      }
      const existing = db.prepare('SELECT * FROM user_age_compliance WHERE principal_id=?').get(auth.user.id);
      if (!existing || existing.age_tier !== 'CHILD_PROTECTED') {
        throw new ApiError(409, 'PARENTAL_CONSENT_NOT_REQUIRED');
      }
      const stamp = now();
      transaction(db, () => {
        db.prepare('INSERT INTO parental_consent_logs VALUES(?,?,?,?,?,?)').run(
          uid(),
          auth.user.id,
          digest(body.guardianContact.trim().toLowerCase()),
          body.method,
          'verified',
          stamp
        );
        db.prepare(
          "UPDATE user_age_compliance SET parental_consent_status='verified', parental_consent_at=?, updated_at=? WHERE principal_id=?"
        ).run(stamp, stamp, auth.user.id);
      });
      json(res, 200, buildProfileResponse(auth.user));
      return true;
    }

    // 8. Mobile Catalog (runtime-only, Forge excluded, ageRating & version compatibility annotated)
    if (path === '/api/mobile/catalog' && req.method === 'GET') {
      const auth = bearerPayload(req, false);
      const compliance = auth ? getCompliance(auth.user.id) : getCompliance(null);
      const clientVersions = {
        engineVersion: req.headers['x-playhub-engine-version'] || url.searchParams.get('engineVersion') || '4.7.2',
        appVersionCode: Number(req.headers['x-playhub-app-version-code'] || url.searchParams.get('appVersionCode') || 1)
      };
      const games = readCatalog(rootDir, db)
        .filter(g => g.enabled)
        .map(g => enrichMobileGame(g, compliance, clientVersions));
      json(res, 200, {
        forgeSupported: false,
        engineVersion: '4.7.2',
        ageCompliance: compliance,
        games
      });
      return true;
    }

    // 9. Mobile Play Session creation (Fail-Closed server-side ageRating + version compatibility check)
    if (path === '/api/mobile/play-sessions' && req.method === 'POST') {
      rejectBrowserOrigin(req);
      const auth = bearerPayload(req, true);
      const body = await readJson(req, 4096);
      const game = findGame(rootDir, db, assertId(body.gameId));
      const compliance = getCompliance(auth.user.id);
      const rating = normalizeAgeRating(body.overrideRating || gameAgeRating(game));
      if (!canPlayAgeRating(compliance.ageTier, rating, compliance.parentalConsentStatus)) {
        throw new ApiError(403, 'AGE_RATING_RESTRICTED', `연령 등급(${rating}) 제한으로 실행할 수 없습니다.`);
      }
      const meta = readGameAndroidMeta(game.id);
      const compat = checkVersionCompatibility({
        runtime: meta.runtime,
        requiredEngineVersion: meta.requiredEngineVersion,
        minAppVersionCode: meta.minAppVersionCode,
        clientEngineVersion: req.headers['x-playhub-engine-version'] || body.engineVersion || '4.7.2',
        clientAppVersionCode: Number(req.headers['x-playhub-app-version-code'] || body.appVersionCode || 1)
      });
      if (!compat.compatible) {
        throw new ApiError(409, compat.reason, compat.message, {
          requiredEngineVersion: meta.requiredEngineVersion,
          minAppVersionCode: meta.minAppVersionCode
        });
      }
      const id = uid();
      const stamp = now();
      db.prepare(
        'INSERT INTO play_sessions(id,session_hash,principal_id,subject_id,game_id,build_id,started_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?)'
      ).run(id, `mobile:${auth.familyId}`, auth.user.id, `m:${auth.user.id}`, game.id, game.buildId, stamp, stamp + 2 * 3600000, 'live', null);
      json(res, 201, {
        id,
        gameId: game.id,
        buildId: game.buildId,
        ageRating: rating,
        compatibility: compat,
        saveSchemaVersion: game.saveSchemaVersion
      });
      return true;
    }

    // 10. Mobile Cloud Saves (shared save_slots table with Web Hub + If-Match optimistic locking)
    const saveMatch = path.match(/^\/api\/mobile\/saves\/([a-zA-Z0-9_-]+)$/);
    if (saveMatch && req.method === 'GET') {
      const auth = bearerPayload(req, true);
      const game = findGame(rootDir, db, saveMatch[1], false);
      const slot = url.searchParams.get('slot') || 'main';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(slot)) throw new ApiError(400, 'SAVE_SLOT_INVALID');
      const row = db.prepare('SELECT * FROM save_slots WHERE principal_id=? AND game_id=? AND slot=?').get(auth.user.id, game.id, slot);
      if (!row) throw new ApiError(404, 'SAVE_NOT_FOUND');
      res.setHeader('ETag', `"r${row.revision}"`);
      json(res, 200, {
        slot: row.slot,
        schemaVersion: row.schema_version,
        revision: row.revision,
        payload: JSON.parse(row.payload),
        updatedAt: new Date(row.updated_at).toISOString()
      });
      return true;
    }

    if (saveMatch && req.method === 'PUT') {
      rejectBrowserOrigin(req);
      const auth = bearerPayload(req, true);
      const game = findGame(rootDir, db, saveMatch[1], false);
      const slot = url.searchParams.get('slot') || 'main';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(slot)) throw new ApiError(400, 'SAVE_SLOT_INVALID');
      const body = await readJson(req, 128 * 1024);
      if (!body.payload || typeof body.payload !== 'object' || JSON.stringify(body.payload).length > 65536) {
        throw new ApiError(422, 'SAVE_PAYLOAD_INVALID');
      }
      const ifMatch = req.headers['if-match'];
      const ifNoneMatch = req.headers['if-none-match'];
      const stamp = now();
      const saved = transaction(db, () => {
        const current = db.prepare('SELECT * FROM save_slots WHERE principal_id=? AND game_id=? AND slot=?').get(auth.user.id, game.id, slot);
        if (ifNoneMatch === '*' && current) throw new ApiError(412, 'SAVE_REVISION_CONFLICT');
        if (ifMatch && (!current || ifMatch !== `"r${current.revision}"`)) throw new ApiError(412, 'SAVE_REVISION_CONFLICT');
        const prior = db.prepare('SELECT last_revision FROM save_slot_versions WHERE principal_id=? AND game_id=? AND slot=?').get(auth.user.id, game.id, slot);
        const revision = Math.max(prior?.last_revision || 0, current?.revision || 0) + 1;
        db.prepare(
          'INSERT INTO save_slot_versions VALUES(?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET last_revision=excluded.last_revision'
        ).run(auth.user.id, game.id, slot, revision);
        const payloadText = JSON.stringify(body.payload);
        db.prepare(
          'INSERT INTO save_slots(principal_id,game_id,slot,schema_version,revision,payload,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET schema_version=excluded.schema_version,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at'
        ).run(auth.user.id, game.id, slot, Number(body.schemaVersion) || 1, revision, payloadText, stamp);
        return { slot, schemaVersion: Number(body.schemaVersion) || 1, revision, updatedAt: new Date(stamp).toISOString() };
      });
      res.setHeader('ETag', `"r${saved.revision}"`);
      json(res, 200, saved);
      return true;
    }

    return false;
  }

  return { enabled: true, publicRoute };
}
