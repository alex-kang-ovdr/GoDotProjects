// HTTP Router for Flywheel 3 [Trust, Quality & Margin Defense Engine].
// Public routes:
//   - GET/PUT  /api/me/consents
//   - DELETE   /api/account
//   - GET      /api/me/risk-reviews
//   - POST     /api/me/risk-reviews/:id/appeal
//   - POST     /api/desktop/telemetry/shader
//   - POST     /api/dda/profile
// Admin routes (loopback admin listener, admin session + CSRF verified by app.mjs):
//   - GET      /api/admin/risk/reviews
//   - POST     /api/admin/risk/reviews/:id/resolve
//   - GET      /api/admin/infra/shader-priorities

import {
  PUBLIC_COOKIE,
  FORGE_COOKIE,
  ApiError,
  json,
  readJson,
  setCookie
} from '../security.mjs';
import { ensureTrustSchema } from './schema.mjs';
import { getConsents, setConsents } from './consent.mjs';
import { executeAccountDeletion } from './dsar.mjs';
import {
  listUserRiskReviews,
  listAdminRiskReviews,
  submitAppeal,
  resolveReview
} from './risk-engine.mjs';
import {
  recordShaderTelemetry,
  rankShaderPrewarmPriorities
} from './infra-ml.mjs';
import { computeEthicalDdaProfile } from './ethical-dda.mjs';

const USER_APPEAL_RE = /^\/api\/me\/risk-reviews\/([A-Za-z0-9_-]{4,128})\/appeal$/;
const ADMIN_RESOLVE_RE = /^\/api\/admin\/risk\/reviews\/([A-Za-z0-9_-]{4,128})\/resolve$/;

export function createTrust({
  config,
  db,
  sessionFor,
  requireSession,
  now = Date.now,
  audit = () => {},
  rate = () => {},
  rateLimitIp = req => req.socket?.remoteAddress || 'unknown'
}) {
  ensureTrustSchema(db);

  function requireRegisteredSession(req) {
    const s = requireSession(req, 'public');
    if (!s.principal_id) {
      throw new ApiError(401, 'REGISTERED_ACCOUNT_REQUIRED', '로그인한 정식 계정이 필요합니다.');
    }
    const user = db.prepare('SELECT id, kind FROM users WHERE id=?').get(s.principal_id);
    if (!user || user.kind !== 'registered') {
      throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', '정식 등록 계정만 이용할 수 있습니다.');
    }
    return s;
  }

  async function publicRoute(req, res, url) {
    const pathname = url.pathname;

    // 1. Granular Consents (GET/PUT /api/me/consents) — authenticated registered user (+ CSRF on PUT)
    if (pathname === '/api/me/consents' && req.method === 'GET') {
      const s = requireRegisteredSession(req);
      json(res, 200, getConsents(db, s.principal_id));
      return true;
    }
    if (pathname === '/api/me/consents' && req.method === 'PUT') {
      const s = requireRegisteredSession(req);
      rate(`consents:${s.principal_id}`, 60, 60000);
      const body = await readJson(req, 8192);
      const updates = body.purposes && typeof body.purposes === 'object' && !Array.isArray(body.purposes)
        ? body.purposes
        : body.consents && typeof body.consents === 'object' && !Array.isArray(body.consents)
          ? body.consents
          : body;
      // Strip optional metadata keys when updates are passed at top level
      const cleanedUpdates = {};
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'policyVersion' || k === 'source' || k === 'childRestricted') continue;
        cleanedUpdates[k] = v;
      }
      const updated = setConsents(db, s.principal_id, cleanedUpdates, {
        policyVersion: body.policyVersion,
        source: body.source || 'web',
        now,
        childRestricted: body.childRestricted === true
      });
      audit('user_consents_updated', s.principal_id, {
        purposes: Object.keys(cleanedUpdates)
      });
      json(res, 200, updated);
      return true;
    }

    // 2. Atomic DSAR Account Deletion (DELETE /api/account) — authenticated registered user + CSRF
    if (pathname === '/api/account' && req.method === 'DELETE') {
      const s = requireRegisteredSession(req);
      rate(`account-delete:${s.principal_id}`, 10, 60000);
      if ((req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
        await readJson(req, 4096);
      }
      const result = executeAccountDeletion(db, s.principal_id, { now });
      setCookie(res, PUBLIC_COOKIE, '', config.secureCookies, 0);
      setCookie(res, FORGE_COOKIE, '', config.secureCookies, 0, '/forge');
      json(res, 200, result);
      return true;
    }

    // 3. PIPA Art. 37-2 User Risk Reviews & Appeal
    if (pathname === '/api/me/risk-reviews' && req.method === 'GET') {
      const s = requireSession(req, 'public');
      if (!s.principal_id) {
        json(res, 200, { reviews: [] });
        return true;
      }
      json(res, 200, { reviews: listUserRiskReviews(db, s.principal_id) });
      return true;
    }
    const appealMatch = pathname.match(USER_APPEAL_RE);
    if (appealMatch && req.method === 'POST') {
      const s = requireSession(req, 'public');
      if (!s.principal_id) throw new ApiError(401, 'SESSION_REQUIRED');
      rate(`risk-appeal:${s.principal_id}`, 20, 60000);
      const body = await readJson(req, 8192);
      const updated = submitAppeal(db, {
        reviewId: appealMatch[1],
        principalId: s.principal_id,
        appealText: body.appealText ?? body.appeal_text,
        now
      });
      audit('risk_review_appealed', appealMatch[1], { principalId: s.principal_id });
      json(res, 200, { review: updated });
      return true;
    }

    // 4. N7 Desktop Shader Telemetry (PII-free)
    if (pathname === '/api/desktop/telemetry/shader' && req.method === 'POST') {
      rate(`shader-telemetry:${rateLimitIp(req)}`, 240, 60000);
      const body = await readJson(req, 16384);
      const recorded = recordShaderTelemetry(db, body, { now });
      json(res, 201, { ok: true, telemetry: recorded });
      return true;
    }

    // 5. N8 Isolated Ethical DDA Profile
    if (pathname === '/api/dda/profile' && req.method === 'POST') {
      rate(`dda:${rateLimitIp(req)}`, 120, 60000);
      const body = await readJson(req, 4096);
      let optIn = body.optIn;
      if (optIn === undefined) {
        const s = sessionFor(req, 'public');
        if (s?.principal_id) {
          const consents = getConsents(db, s.principal_id);
          optIn = consents.purposes.personalization?.granted === true;
        } else {
          optIn = true;
        }
      }
      const profile = computeEthicalDdaProfile({
        recentWinRate: body.recentWinRate,
        consecutiveLosses: body.consecutiveLosses,
        avgSessionMs: body.avgSessionMs,
        optIn,
        playerToggleEnabled: body.playerToggleEnabled,
        mode: body.mode
      });
      json(res, 200, { profile });
      return true;
    }

    return false;
  }

  async function adminRoute(req, res, url, adminSession) {
    const pathname = url.pathname;

    // 1. N5 Admin Risk Review Queue
    if (pathname === '/api/admin/risk/reviews' && req.method === 'GET') {
      const status = url.searchParams.get('status') || null;
      const domain = url.searchParams.get('domain') || null;
      const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 50;
      const reviews = listAdminRiskReviews(db, { status, domain, limit });
      json(res, 200, { reviews });
      return true;
    }

    const resolveMatch = pathname.match(ADMIN_RESOLVE_RE);
    if (resolveMatch && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const updated = resolveReview(db, {
        reviewId: resolveMatch[1],
        adminUser: adminSession?.admin_username || 'admin',
        resolution: body.resolution,
        note: body.note ?? body.resolutionNote ?? '',
        now
      });
      audit('risk_review_resolved', resolveMatch[1], {
        resolution: updated.status,
        admin: adminSession?.admin_username || 'admin'
      });
      json(res, 200, { review: updated });
      return true;
    }

    // 2. N7 Admin Shader Prewarm Priorities
    if (pathname === '/api/admin/infra/shader-priorities' && req.method === 'GET') {
      const days = url.searchParams.get('days') ? Number(url.searchParams.get('days')) : 7;
      const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20;
      const report = rankShaderPrewarmPriorities(db, { days, limit, now });
      json(res, 200, report);
      return true;
    }

    return false;
  }

  return {
    publicRoute,
    adminRoute
  };
}
