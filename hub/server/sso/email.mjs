import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { ApiError, equal, json, readJson, uid } from '../security.mjs';
import { transaction } from '../db.mjs';

const scrypt = promisify(scryptCallback);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 5 * 60 * 1000;
const DUMMY_SALT = '00000000000000000000000000000000';
const DUMMY_HASH = '0'.repeat(128);

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !EMAIL_RE.test(trimmed)) return '';
  return trimmed;
}

export function validateNewPassword(raw) {
  if (typeof raw !== 'string') {
    throw new ApiError(422, 'PASSWORD_INVALID', '비밀번호를 입력해 주세요.');
  }
  if (raw.length < 8 || raw.length > 128) {
    throw new ApiError(422, 'PASSWORD_TOO_WEAK', '비밀번호는 8자 이상 128자 이하로 입력해 주세요.');
  }
  if (!/[A-Za-z]/.test(raw) || !/[0-9]/.test(raw)) {
    throw new ApiError(422, 'PASSWORD_TOO_WEAK', '비밀번호는 영문과 숫자를 모두 포함해야 합니다.');
  }
  return raw;
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64);
  return { salt, passwordHash: derived.toString('hex') };
}

export async function verifyPassword(password, salt, passwordHash) {
  if (typeof password !== 'string' || password.length === 0 || password.length > 1024 || !salt || !passwordHash) {
    return false;
  }
  const derived = await scrypt(password, salt, 64);
  return equal(derived.toString('hex'), passwordHash);
}

function normalizeDisplayName(raw, email) {
  if (raw !== undefined && raw !== null && raw !== '') {
    if (typeof raw !== 'string') throw new ApiError(422, 'DISPLAY_NAME_INVALID', '표시 이름이 올바르지 않습니다.');
    const trimmed = raw.trim().replace(/[\x00-\x1f\x7f]/g, '');
    if (!trimmed || trimmed.length > 100) {
      throw new ApiError(422, 'DISPLAY_NAME_INVALID', '표시 이름은 1자 이상 100자 이하로 입력해 주세요.');
    }
    return trimmed;
  }
  const localPart = email.split('@')[0] || 'PlayHub 사용자';
  return localPart.slice(0, 100);
}

export function createEmailAuth(ctx) {
  const { config, db, now, rate, rateLimitIp, requireSession, newSession, revokeSession, audit, profile } = ctx;
  const enabled = config.auth?.emailEnabled !== false;

  async function register(req, res) {
    if (!enabled) throw new ApiError(503, 'EMAIL_AUTH_DISABLED', '이메일 로그인 기능이 비활성화되어 있습니다.');
    const session = requireSession(req, 'public');
    if (session.traffic_type === 'qa') throw new ApiError(403, 'QA_AUTH_DISABLED', 'QA 세션에서는 로그인할 수 없습니다.');
    rate(`email-register-ip:${rateLimitIp(req)}`, 10, 60000);

    const body = await readJson(req, 8192);
    const email = normalizeEmail(body.email);
    if (!email) throw new ApiError(422, 'EMAIL_INVALID', '올바른 이메일 주소를 입력해 주세요.');
    const password = validateNewPassword(body.password);
    const displayName = normalizeDisplayName(body.displayName, email);

    rate(`email-register:${email}`, 5, 60000);

    const existing = db.prepare('SELECT user_id FROM email_credentials WHERE email=?').get(email);
    if (existing) {
      throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', '이미 가입된 이메일 주소입니다. 로그인을 시도해 주세요.');
    }

    const { salt, passwordHash } = await hashPassword(password);

    const previousCookies = res.getHeader('Set-Cookie');
    let nextSession;
    try {
      nextSession = transaction(db, () => {
        const current = db.prepare("SELECT * FROM sessions WHERE id_hash=? AND kind='public' AND expires_at>?").get(session.id_hash, now());
        if (!current) throw new ApiError(401, 'SESSION_REQUIRED');
        const duplicate = db.prepare('SELECT user_id FROM email_credentials WHERE email=?').get(email);
        if (duplicate) throw new ApiError(409, 'EMAIL_ALREADY_REGISTERED', '이미 가입된 이메일 주소입니다. 로그인을 시도해 주세요.');

        const currentUser = current.principal_id
          ? db.prepare('SELECT kind FROM users WHERE id=?').get(current.principal_id)
          : null;
        const guestId = currentUser?.kind === 'guest' ? current.principal_id : null;

        const stamp = now();
        const userId = uid();
        db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)').run(userId, 'registered', displayName, stamp);
        db.prepare('INSERT INTO identities(provider,subject,user_id) VALUES(?,?,?)').run('email', email, userId);
        db.prepare(
          'INSERT INTO email_credentials(user_id,email,password_hash,salt,failed_attempts,locked_until,created_at,updated_at) VALUES(?,?,?,?,0,NULL,?,?)'
        ).run(userId, email, passwordHash, salt, stamp, stamp);

        const analyticsSubject = `u:${userId}`;
        revokeSession(current);
        if (guestId && guestId !== userId) {
          db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,NULL)').run(
            uid(),
            guestId,
            userId,
            current.analytics_subject,
            analyticsSubject,
            'pending',
            stamp + 86400000
          );
        }
        audit('email_register', userId, { provider: 'email' });
        return newSession(res, 'public', userId, analyticsSubject);
      });
    } catch (error) {
      if (previousCookies === undefined) res.removeHeader('Set-Cookie');
      else res.setHeader('Set-Cookie', previousCookies);
      throw error;
    }

    json(res, 201, profile(nextSession));
  }

  async function login(req, res) {
    if (!enabled) throw new ApiError(503, 'EMAIL_AUTH_DISABLED', '이메일 로그인 기능이 비활성화되어 있습니다.');
    const session = requireSession(req, 'public');
    if (session.traffic_type === 'qa') throw new ApiError(403, 'QA_AUTH_DISABLED', 'QA 세션에서는 로그인할 수 없습니다.');
    rate(`email-login-ip:${rateLimitIp(req)}`, 20, 60000);

    const body = await readJson(req, 8192);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password || password.length > 1024) {
      throw new ApiError(401, 'EMAIL_CREDENTIALS_INVALID', '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    rate(`email-login:${email}`, 12, 60000);

    const stamp = now();
    const cred = db.prepare('SELECT * FROM email_credentials WHERE email=?').get(email);
    if (!cred) {
      await verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
      audit('email_login_failed', null, { reason: 'not_found' });
      throw new ApiError(401, 'EMAIL_CREDENTIALS_INVALID', '이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    if (cred.locked_until && cred.locked_until > stamp) {
      const waitSeconds = Math.ceil((cred.locked_until - stamp) / 1000);
      throw new ApiError(429, 'EMAIL_ACCOUNT_LOCKED', `로그인 시도가 너무 많습니다. ${waitSeconds}초 후 다시 시도해 주세요.`);
    }

    const valid = await verifyPassword(password, cred.salt, cred.password_hash);
    if (!valid) {
      const attempts = (cred.failed_attempts || 0) + 1;
      const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? stamp + LOCK_DURATION_MS : null;
      db.prepare('UPDATE email_credentials SET failed_attempts=?,locked_until=?,updated_at=? WHERE user_id=?')
        .run(attempts >= MAX_FAILED_ATTEMPTS ? 0 : attempts, lockedUntil, stamp, cred.user_id);
      audit('email_login_failed', cred.user_id, { locked: Boolean(lockedUntil) });
      if (lockedUntil) {
        throw new ApiError(429, 'EMAIL_ACCOUNT_LOCKED', '로그인 실패가 누적되어 5분간 계정이 잠겼습니다.');
      }
      throw new ApiError(401, 'EMAIL_CREDENTIALS_INVALID', '이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const previousCookies = res.getHeader('Set-Cookie');
    let nextSession;
    try {
      nextSession = transaction(db, () => {
        const current = db.prepare("SELECT * FROM sessions WHERE id_hash=? AND kind='public' AND expires_at>?").get(session.id_hash, now());
        if (!current) throw new ApiError(401, 'SESSION_REQUIRED');

        db.prepare('UPDATE email_credentials SET failed_attempts=0,locked_until=NULL,updated_at=? WHERE user_id=?')
          .run(now(), cred.user_id);

        const currentUser = current.principal_id
          ? db.prepare('SELECT kind FROM users WHERE id=?').get(current.principal_id)
          : null;
        const guestId = currentUser?.kind === 'guest' ? current.principal_id : null;

        const analyticsSubject = `u:${cred.user_id}`;
        revokeSession(current);
        if (guestId && guestId !== cred.user_id) {
          db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,NULL)').run(
            uid(),
            guestId,
            cred.user_id,
            current.analytics_subject,
            analyticsSubject,
            'pending',
            now() + 86400000
          );
        }
        audit('email_login', cred.user_id, { provider: 'email' });
        return newSession(res, 'public', cred.user_id, analyticsSubject);
      });
    } catch (error) {
      if (previousCookies === undefined) res.removeHeader('Set-Cookie');
      else res.setHeader('Set-Cookie', previousCookies);
      throw error;
    }

    json(res, 200, profile(nextSession));
  }

  async function changePassword(req, res) {
    if (!enabled) throw new ApiError(503, 'EMAIL_AUTH_DISABLED', '이메일 로그인 기능이 비활성화되어 있습니다.');
    const session = requireSession(req, 'public');
    if (session.traffic_type === 'qa') throw new ApiError(403, 'QA_AUTH_DISABLED');
    if (!session.principal_id) throw new ApiError(401, 'LOGIN_REQUIRED');
    rate(`email-pw:${session.principal_id}`, 8, 60000);

    const cred = db.prepare('SELECT * FROM email_credentials WHERE user_id=?').get(session.principal_id);
    if (!cred) throw new ApiError(404, 'EMAIL_ACCOUNT_NOT_FOUND', '이메일 계정이 아닙니다.');

    const body = await readJson(req, 8192);
    const valid = await verifyPassword(body.currentPassword, cred.salt, cred.password_hash);
    if (!valid) throw new ApiError(401, 'EMAIL_CREDENTIALS_INVALID', '현재 비밀번호가 올바르지 않습니다.');

    const nextPassword = validateNewPassword(body.newPassword);
    const { salt, passwordHash } = await hashPassword(nextPassword);
    db.prepare('UPDATE email_credentials SET password_hash=?,salt=?,failed_attempts=0,locked_until=NULL,updated_at=? WHERE user_id=?')
      .run(passwordHash, salt, now(), cred.user_id);
    audit('email_password_changed', cred.user_id, { provider: 'email' });
    json(res, 200, { ok: true });
  }

  return { enabled, register, login, changePassword };
}
