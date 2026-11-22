// Phase 0 Granular Consent, PIPA Art. 37-2 Opt-Out & Non-Breaking Web Play Age Guard.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transaction } from '../db.mjs';
import { ApiError } from '../security.mjs';
import { ensureTrustSchema } from './schema.mjs';

export const ALLOWED_CONSENT_PURPOSES = Object.freeze([
  'analytics',
  'personalization',
  'ai_training_play',
  'ai_training_creator',
  'marketing_push',
  'marketing_email'
]);

export const ADULT_ONLY_PURPOSES = Object.freeze(new Set([
  'personalization',
  'ai_training_play',
  'ai_training_creator',
  'marketing_push',
  'marketing_email'
]));

export const DEFAULT_POLICY_VERSION = '2026-11-v1';

const VALID_PURPOSES_SET = new Set(ALLOWED_CONSENT_PURPOSES);
const VALID_RATINGS = new Set(['ALL', '12+', '15+', '18+']);

function hasTable(db, tableName) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
  );
}

export function readAgeCompliance(db, principalId) {
  if (!principalId || !hasTable(db, 'user_age_compliance')) {
    return { hasRecord: false, ageTier: null, regionCode: null, parentalConsentStatus: 'not_required' };
  }
  const row = db.prepare(
    'SELECT age_tier, region_code, parental_consent_status FROM user_age_compliance WHERE principal_id=?'
  ).get(principalId);
  if (!row) {
    return { hasRecord: false, ageTier: null, regionCode: null, parentalConsentStatus: 'not_required' };
  }
  return {
    hasRecord: true,
    ageTier: row.age_tier,
    regionCode: row.region_code,
    parentalConsentStatus: row.parental_consent_status || 'not_required'
  };
}

function isAgeRestrictedForAdultPurposes(ageCompliance, childRestricted = false) {
  if (ageCompliance.hasRecord) {
    return ageCompliance.ageTier !== 'ADULT';
  }
  return childRestricted === true;
}

export function getConsents(db, principalId, { childRestricted = false } = {}) {
  ensureTrustSchema(db);
  if (typeof principalId !== 'string' || !principalId) {
    throw new ApiError(401, 'SESSION_REQUIRED');
  }
  const ageCompliance = readAgeCompliance(db, principalId);
  const restricted = isAgeRestrictedForAdultPurposes(ageCompliance, childRestricted);
  const rows = db.prepare(
    'SELECT purpose, granted, policy_version, source, updated_at FROM user_consents WHERE principal_id=?'
  ).all(principalId);
  const byPurpose = new Map(rows.map(row => [row.purpose, row]));

  const consents = {};
  for (const purpose of ALLOWED_CONSENT_PURPOSES) {
    const row = byPurpose.get(purpose);
    const adultOnly = ADULT_ONLY_PURPOSES.has(purpose);
    const blockedByAge = restricted && adultOnly;
    consents[purpose] = {
      granted: blockedByAge ? false : row?.granted === 1,
      policyVersion: row?.policy_version || DEFAULT_POLICY_VERSION,
      source: row?.source || 'default',
      updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
      ageRestricted: blockedByAge
    };
  }

  return {
    principalId,
    ageTier: ageCompliance.ageTier || (childRestricted ? 'UNKNOWN' : null),
    isAgeRestricted: restricted,
    purposes: consents
  };
}

export function setConsents(
  db,
  principalId,
  updates,
  {
    policyVersion = DEFAULT_POLICY_VERSION,
    source = 'web',
    now = Date.now,
    childRestricted = false
  } = {}
) {
  ensureTrustSchema(db);
  if (typeof principalId !== 'string' || !principalId) {
    throw new ApiError(401, 'SESSION_REQUIRED');
  }
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    throw new ApiError(422, 'CONSENT_INPUT_INVALID', '유효한 동의 항목 객체가 필요합니다.');
  }
  const entries = Object.entries(updates);
  if (!entries.length) {
    throw new ApiError(422, 'CONSENT_INPUT_INVALID', '변경할 동의 항목을 1개 이상 지정해야 합니다.');
  }
  for (const [purpose, granted] of entries) {
    if (!VALID_PURPOSES_SET.has(purpose) || typeof granted !== 'boolean') {
      throw new ApiError(422, 'CONSENT_INPUT_INVALID', `지원하지 않는 동의 항목 또는 형식입니다: ${purpose}`);
    }
  }
  const safePolicyVersion = typeof policyVersion === 'string' && policyVersion.trim().length > 0
    ? policyVersion.trim().slice(0, 64)
    : DEFAULT_POLICY_VERSION;
  const safeSource = typeof source === 'string' && source.trim().length > 0
    ? source.trim().slice(0, 32)
    : 'web';

  const ageCompliance = readAgeCompliance(db, principalId);
  const restricted = isAgeRestrictedForAdultPurposes(ageCompliance, childRestricted);
  if (restricted) {
    const blockedPurposes = entries
      .filter(([purpose, granted]) => granted === true && ADULT_ONLY_PURPOSES.has(purpose))
      .map(([purpose]) => purpose);
    if (blockedPurposes.length > 0) {
      throw new ApiError(
        403,
        'CONSENT_AGE_RESTRICTED',
        '아동·청소년 또는 연령 미확인 계정은 개인화·AI 학습·마케팅 목적에 동의할 수 없습니다.',
        {
          ageTier: ageCompliance.ageTier || 'UNKNOWN',
          blockedPurposes
        }
      );
    }
  }

  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  transaction(db, () => {
    const upsert = db.prepare(`
      INSERT INTO user_consents(principal_id, purpose, granted, policy_version, source, updated_at)
      VALUES(?, ?, ?, ?, ?, ?)
      ON CONFLICT(principal_id, purpose) DO UPDATE SET
        granted = excluded.granted,
        policy_version = excluded.policy_version,
        source = excluded.source,
        updated_at = excluded.updated_at
    `);
    for (const [purpose, granted] of entries) {
      const effectiveGranted = restricted && ADULT_ONLY_PURPOSES.has(purpose) ? 0 : (granted ? 1 : 0);
      upsert.run(principalId, purpose, effectiveGranted, safePolicyVersion, safeSource, stamp);
    }
    if (restricted) {
      db.prepare(`
        UPDATE user_consents
        SET granted = 0, updated_at = ?
        WHERE principal_id = ?
          AND purpose IN ('personalization', 'ai_training_play', 'ai_training_creator', 'marketing_push', 'marketing_email')
      `).run(stamp, principalId);
    }
  });

  return getConsents(db, principalId, { childRestricted });
}

export function canUseForMlTraining(
  db,
  principalId,
  purpose = 'ai_training_play',
  { childRestricted = false } = {}
) {
  ensureTrustSchema(db);
  if (!VALID_PURPOSES_SET.has(purpose)) {
    return { allowed: false, reason: 'INVALID_PURPOSE' };
  }
  if (!principalId) {
    return { allowed: false, reason: 'PRINCIPAL_REQUIRED' };
  }
  const user = db.prepare('SELECT kind FROM users WHERE id=?').get(principalId);
  if (!user || user.kind === 'deleted') {
    return { allowed: false, reason: 'ACCOUNT_DELETED_OR_MISSING' };
  }
  const ageCompliance = readAgeCompliance(db, principalId);
  const restricted = isAgeRestrictedForAdultPurposes(ageCompliance, childRestricted);
  if (restricted && ADULT_ONLY_PURPOSES.has(purpose)) {
    return {
      allowed: false,
      reason: 'AGE_RESTRICTED',
      ageTier: ageCompliance.ageTier || 'UNKNOWN'
    };
  }
  const row = db.prepare(
    'SELECT granted, policy_version FROM user_consents WHERE principal_id=? AND purpose=?'
  ).get(principalId, purpose);
  if (!row || row.granted !== 1) {
    return { allowed: false, reason: 'CONSENT_NOT_GRANTED' };
  }
  return {
    allowed: true,
    reason: 'CONSENT_GRANTED',
    policyVersion: row.policy_version
  };
}

function normalizeAgeRating(raw) {
  const code = String(raw || 'ALL').trim().toUpperCase();
  return VALID_RATINGS.has(code) ? code : 'ALL';
}

export function resolveGameAgeRating(db, game, rootDir = null) {
  if (!game) return 'ALL';
  if (game.ageRating) return normalizeAgeRating(game.ageRating);
  const tags = Array.isArray(game.tags) ? game.tags.map(t => String(t).toUpperCase()) : [];
  if (tags.includes('18+')) return '18+';
  if (tags.includes('15+')) return '15+';
  if (tags.includes('12+')) return '12+';

  if (game.source === 'ugc' && hasTable(db, 'hub_publications')) {
    try {
      const pub = db.prepare('SELECT manifest_json FROM hub_publications WHERE game_id=?').get(game.id);
      if (pub?.manifest_json) {
        const parsed = JSON.parse(pub.manifest_json);
        if (parsed?.ageRating) return normalizeAgeRating(parsed.ageRating);
      }
    } catch {}
  }

  if (rootDir && game.id) {
    try {
      const manifestRaw = readFileSync(resolve(rootDir, 'games', game.id, 'game.manifest.json'), 'utf8');
      const parsed = JSON.parse(manifestRaw);
      if (parsed?.ageRating) return normalizeAgeRating(parsed.ageRating);
    } catch {}
  }

  return 'ALL';
}

// Non-breaking web play-session age-rating guard:
// Preserves all existing flows where user_age_compliance is absent,
// while strictly blocking CHILD_PROTECTED (and TEEN_MINOR) accounts from '18+' games.
export function assertWebPlayAgeAllowed(db, principalId, game, rootDir = null) {
  const compliance = readAgeCompliance(db, principalId);
  if (!compliance.hasRecord) return { allowed: true, rating: 'ALL' };
  const rating = resolveGameAgeRating(db, game, rootDir);
  if (rating === '18+' && (compliance.ageTier === 'CHILD_PROTECTED' || compliance.ageTier === 'TEEN_MINOR')) {
    throw new ApiError(
      403,
      'AGE_RATING_RESTRICTED',
      `연령 등급(${rating}) 제한으로 이 게임을 실행할 수 없습니다.`,
      { ageTier: compliance.ageTier, gameId: game?.id || null, ageRating: rating }
    );
  }
  return { allowed: true, rating };
}
