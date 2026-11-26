'use strict';

/**
 * PlayHub Target Farm Server Registry (Web Forge & Hub Publish SSOT)
 *
 * Mirrors android/app/src/main/java/com/playhub/aos/config/FarmServerRegistry.kt:
 * - Enabled ONLY on non-production stages: debug | dev | development | test.
 * - Strictly disabled (fail-closed) on release | live | prod | production.
 * - Blocks live.playhub.* / playhub-live-* hosts in Dev builds.
 */

const LOCKED_STAGES = new Set(['release', 'live', 'prod', 'production']);

const LIVE_HOST_PATTERNS = [
  /(^|\.)live\.playhub\..*/i,
  /(^|\.)playhub-live-[a-z0-9-]+\..*/i,
  /^playhub\.example\.com$/i,
];

const CUSTOM_FARM_ID = 'custom';

const PRESET_FARMS = Object.freeze([
  Object.freeze({
    id: 'dev-cloudrun',
    label: 'DEV · Cloud Run (playhub-dev-2611)',
    baseUrl: 'https://playhub-hub-88778617121.us-west1.run.app',
  }),
  Object.freeze({
    id: 'local',
    label: 'Local Hub (127.0.0.1:18130)',
    baseUrl: 'http://127.0.0.1:18130',
  }),
  Object.freeze({
    id: 'dev-farm-1',
    label: 'Dev Farm 1',
    baseUrl: 'https://dev-farm1.playhub.example.com',
  }),
  Object.freeze({
    id: 'dev-farm-2',
    label: 'Dev Farm 2',
    baseUrl: 'https://dev-farm2.playhub.example.com',
  }),
  Object.freeze({
    id: 'qa-farm',
    label: 'QA Farm',
    baseUrl: 'https://qa-farm.playhub.example.com',
  }),
  Object.freeze({
    id: 'staging-farm',
    label: 'Staging Farm',
    baseUrl: 'https://staging-farm.playhub.example.com',
  }),
]);

function normalizeStage(rawStage) {
  return String(rawStage || process.env.PLAYFORGE_BUILD_MODE || process.env.PLAYHUB_CHANNEL || process.env.NODE_ENV || 'dev')
    .trim()
    .toLowerCase();
}

function isFarmSelectorAllowed(buildStage) {
  const stage = normalizeStage(buildStage);
  return !LOCKED_STAGES.has(stage);
}

function isBlockedLiveHost(host) {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) return false;
  return LIVE_HOST_PATTERNS.some((re) => re.test(normalized));
}

function normalizeFarmUrl(rawUrl, { buildStage = 'dev', allowLiveHost = false } = {}) {
  const trimmed = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw Object.assign(new Error('대상 팜 서버 URL을 입력해 주세요.'), { code: 'FARM_URL_REQUIRED', status: 400 });
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw Object.assign(new Error('올바른 http:// 또는 https:// 주소가 아닙니다.'), { code: 'FARM_URL_INVALID', status: 400 });
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw Object.assign(new Error('http:// 또는 https:// 주소만 허용됩니다.'), { code: 'FARM_URL_INVALID', status: 400 });
  }
  if (!parsed.hostname) {
    throw Object.assign(new Error('올바른 호스트 주소가 필요합니다.'), { code: 'FARM_URL_INVALID', status: 400 });
  }
  if (!allowLiveHost && isFarmSelectorAllowed(buildStage) && isBlockedLiveHost(parsed.hostname)) {
    throw Object.assign(
      new Error('Dev 환경에서는 Live 서버에 직접 배포할 수 없습니다. Dev Farm을 선택해 주세요.'),
      { code: 'FARM_LIVE_HOST_BLOCKED', status: 403 }
    );
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, '')}`;
}

function buildSelectableFarms({ buildStage = 'dev', defaultBaseUrl = '', extraFarms = [] } = {}) {
  const allowed = isFarmSelectorAllowed(buildStage);
  const result = [];
  const seen = new Set();
  const addUnique = (farm) => {
    if (!farm || !farm.baseUrl) return;
    const key = String(farm.baseUrl).trim().replace(/\/+$/, '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push({
      id: String(farm.id || 'custom'),
      label: String(farm.label || farm.id || key),
      baseUrl: String(farm.baseUrl).trim().replace(/\/+$/, ''),
    });
  };

  if (defaultBaseUrl) {
    addUnique({
      id: 'default',
      label: allowed ? `현재 연결 허브 (${normalizeStage(buildStage).toUpperCase()})` : 'PlayHub (Live)',
      baseUrl: defaultBaseUrl,
    });
  }
  if (!allowed) return result;

  for (const farm of extraFarms) addUnique(farm);
  for (const preset of PRESET_FARMS) addUnique(preset);
  return result;
}

function resolveTargetFarm({ buildStage = 'dev', defaultBaseUrl = '', farmId = '', customUrl = '' } = {}) {
  const allowed = isFarmSelectorAllowed(buildStage);
  const cleanDefault = defaultBaseUrl ? String(defaultBaseUrl).trim().replace(/\/+$/, '') : '';
  if (!allowed) {
    if ((farmId && farmId !== 'default') || (customUrl && customUrl.trim().replace(/\/+$/, '') !== cleanDefault)) {
      throw Object.assign(
        new Error('Live 환경에서는 대상 팜을 변경할 수 없습니다.'),
        { code: 'FARM_SELECTOR_LOCKED', status: 403 }
      );
    }
    return cleanDefault ? { id: 'default', label: 'PlayHub (Live)', baseUrl: cleanDefault } : null;
  }

  if (farmId === CUSTOM_FARM_ID || (!farmId && customUrl)) {
    const normalized = normalizeFarmUrl(customUrl, { buildStage });
    return { id: CUSTOM_FARM_ID, label: 'Custom Farm', baseUrl: normalized };
  }
  if (farmId === 'default' || !farmId) {
    if (cleanDefault) return { id: 'default', label: `현재 연결 허브 (${normalizeStage(buildStage).toUpperCase()})`, baseUrl: cleanDefault };
    return PRESET_FARMS[0];
  }
  const preset = PRESET_FARMS.find((f) => f.id === farmId);
  if (preset) return { ...preset };
  if (customUrl) {
    const normalized = normalizeFarmUrl(customUrl, { buildStage });
    return { id: CUSTOM_FARM_ID, label: 'Custom Farm', baseUrl: normalized };
  }
  throw Object.assign(new Error(`알 수 없는 대상 팜입니다: ${farmId}`), { code: 'FARM_NOT_FOUND', status: 400 });
}

async function probeFarmHealth(baseUrl, { timeoutMs = 3500, fetchImpl = globalThis.fetch } = {}) {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '');
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${clean}/_healthz`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const latencyMs = Math.max(1, Date.now() - started);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, status: 'red', httpStatus: res.status, latencyMs, revision: body?.revision || null };
    }
    const tier = latencyMs < 200 ? 'green' : latencyMs < 600 ? 'yellow' : 'orange';
    return {
      ok: true,
      status: tier,
      httpStatus: res.status,
      latencyMs,
      revision: body?.revision || null,
      role: body?.role || null,
    };
  } catch (err) {
    return {
      ok: false,
      status: 'red',
      httpStatus: 0,
      latencyMs: Date.now() - started,
      error: err?.name === 'AbortError' ? 'timeout' : (err?.message || 'unreachable'),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  LOCKED_STAGES,
  CUSTOM_FARM_ID,
  PRESET_FARMS,
  normalizeStage,
  isFarmSelectorAllowed,
  isBlockedLiveHost,
  normalizeFarmUrl,
  buildSelectableFarms,
  resolveTargetFarm,
  probeFarmHealth,
};
