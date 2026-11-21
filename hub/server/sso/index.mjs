import { ApiError } from '../security.mjs';
import { ensureSsoSchema } from './schema.mjs';
import { createEmailAuth } from './email.mjs';
import { createNaverAuth } from './naver.mjs';

export function providerForUser(db, principalId) {
  if (!principalId) return null;
  const row = db.prepare('SELECT provider FROM identities WHERE user_id=? LIMIT 1').get(principalId);
  return row?.provider || null;
}

export function createSso(ctx) {
  ensureSsoSchema(ctx.db);
  const email = createEmailAuth(ctx);
  const naver = createNaverAuth(ctx);

  async function publicRoute(req, res, url) {
    const path = url.pathname;
    if (path === '/api/auth/naver/start' && req.method === 'GET') {
      const s = ctx.sessionFor(req, 'public') || ctx.newSession(res, 'public');
      if (s.traffic_type === 'qa') throw new ApiError(403, 'QA_NAVER_DISABLED');
      await naver.start(req, res, s, url);
      return true;
    }
    if (path === '/api/auth/naver/callback' && req.method === 'GET') {
      const current = ctx.requireSession(req, 'public');
      if (current.traffic_type === 'qa') throw new ApiError(403, 'QA_NAVER_DISABLED');
      await naver.callback(req, res, current, url);
      return true;
    }
    if (path === '/api/auth/email/register' && req.method === 'POST') {
      await email.register(req, res);
      return true;
    }
    if (path === '/api/auth/email/login' && req.method === 'POST') {
      await email.login(req, res);
      return true;
    }
    if (path === '/api/auth/email/password' && req.method === 'POST') {
      await email.changePassword(req, res);
      return true;
    }
    return false;
  }

  return { email, naver, publicRoute };
}
