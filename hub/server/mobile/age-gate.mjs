import { ApiError } from '../security.mjs';

const EU_CHILD_AGE_16 = new Set(['DE', 'NL', 'PL', 'IE', 'SK', 'HR', 'HU', 'LT', 'LU']);
export const VALID_RATINGS = new Set(['ALL', '12+', '15+', '18+']);

export function childThresholdForRegion(regionCode) {
  const code = String(regionCode || 'KR').toUpperCase();
  if (code === 'KR') return 14;
  if (EU_CHILD_AGE_16.has(code)) return 16;
  return 13;
}

export function adultThresholdForRegion(regionCode) {
  return String(regionCode || 'KR').toUpperCase() === 'KR' ? 19 : 18;
}

export function classifyAgeTier(birthYear, birthMonth, nowMs, regionCode = 'KR') {
  if (!Number.isInteger(birthYear) || !Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    throw new ApiError(422, 'AGE_INPUT_INVALID');
  }
  const nowDate = new Date(nowMs);
  const nowYear = nowDate.getUTCFullYear();
  const nowMonth = nowDate.getUTCMonth() + 1;
  let age = nowYear - birthYear;
  if (nowMonth < birthMonth) age -= 1;
  if (age < 0 || age > 120) throw new ApiError(422, 'AGE_INPUT_INVALID');

  const childLimit = childThresholdForRegion(regionCode);
  const adultLimit = adultThresholdForRegion(regionCode);
  if (age < childLimit) return 'CHILD_PROTECTED';
  if (age < adultLimit) return 'TEEN_MINOR';
  return 'ADULT';
}

export function normalizeAgeRating(raw) {
  const code = String(raw || 'ALL').toUpperCase();
  return VALID_RATINGS.has(code) ? code : 'ALL';
}

export function canPlayAgeRating(ageTier, gameRating, parentalConsentStatus = 'not_required') {
  const rating = normalizeAgeRating(gameRating);
  const consentOk = parentalConsentStatus === 'verified';
  switch (ageTier) {
    case 'ADULT':
      return true;
    case 'TEEN_MINOR':
      return rating !== '18+';
    case 'CHILD_PROTECTED':
      return rating === 'ALL' || (consentOk && rating === '12+');
    default:
      return rating === 'ALL';
  }
}

export function evaluateMobileCapabilities(ageTier, isGuest, parentalConsentStatus = 'not_required') {
  const isChild = !ageTier || ageTier === 'UNKNOWN' || ageTier === 'CHILD_PROTECTED';
  const consentOk = parentalConsentStatus === 'verified';
  return {
    canPlayAll: true,
    canUseFreeChat: !isChild && !isGuest,
    canUseQuickChatOnly: isChild && consentOk && !isGuest,
    canPurchaseIap: !isGuest && (!isChild || consentOk),
    requiresGoogleLoginForIap: isGuest,
    requiresParentalConsent: isChild && !consentOk,
    disablePersonalizedAds: isChild
  };
}
