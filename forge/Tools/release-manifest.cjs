'use strict';

const {
  GAME_ID_RE,
  DEPLOY_MODES,
  SERVER_RUNTIMES,
  LOBBY_MODES,
  VISIBILITIES,
  ALLOWED_CONTROLS,
  ALLOWED_ORIENTATIONS,
  ALLOWED_RESIZE,
  cleanText,
  slugifyGameId,
} = require('../../tools/ugc-shared/publish-contract.cjs');

const SCHEMA_VERSION = 1;
const ENGINE_VERSION = '4.7.2-stable';
const SDK_BRIDGE_VERSION = 'playhub-godot-shell-v1';
const USD_PER_POINT = 0.01;
const KRW_PER_POINT = 14;
const FREE_MONTHLY_POINT_LIMIT = 100;

const SPEC_TIERS = Object.freeze({
  'free-nano': Object.freeze({
    id: 'free-nano',
    label: 'Free-Nano (무료 체험)',
    vcpu: 0.25,
    ramMb: 512,
    recommendedCcu: 10,
    pointsPerHour: 0,
    includedEgressGbPerHour: 0.2,
    freeOnly: true
  }),
  nano: Object.freeze({
    id: 'nano',
    label: 'Nano (초소형 룸)',
    vcpu: 0.25,
    ramMb: 512,
    recommendedCcu: 10,
    pointsPerHour: 3,
    includedEgressGbPerHour: 0.2,
    freeOnly: false
  }),
  micro: Object.freeze({
    id: 'micro',
    label: 'Micro S (소규모 MO)',
    vcpu: 0.5,
    ramMb: 1024,
    recommendedCcu: 30,
    pointsPerHour: 6,
    includedEgressGbPerHour: 0.5,
    freeOnly: false
  }),
  small: Object.freeze({
    id: 'small',
    label: 'Small M (중형 MO · 소형 MMO)',
    vcpu: 1.0,
    ramMb: 2048,
    recommendedCcu: 80,
    pointsPerHour: 12,
    includedEgressGbPerHour: 1.2,
    freeOnly: false
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'Medium L (MMO 기본 채널)',
    vcpu: 2.0,
    ramMb: 4096,
    recommendedCcu: 200,
    pointsPerHour: 24,
    includedEgressGbPerHour: 3.0,
    freeOnly: false
  }),
  large: Object.freeze({
    id: 'large',
    label: 'Large XL (MMO 대형 · 물리)',
    vcpu: 4.0,
    ramMb: 8192,
    recommendedCcu: 400,
    pointsPerHour: 48,
    includedEgressGbPerHour: 6.0,
    freeOnly: false
  })
});

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function estimateMonthlyHubPoints({
  deployMode = 'singleplay',
  specTier = 'free-nano',
  activeHoursPerDay = 2,
  avgCcu = 10,
  alwaysOn = false
} = {}) {
  const mode = DEPLOY_MODES.has(deployMode) ? deployMode : 'singleplay';
  if (mode === 'singleplay') {
    return {
      deployMode: 'singleplay',
      specTier: 'free-nano',
      pointsPerHour: 0,
      estimatedInstances: 0,
      monthlyHours: 0,
      monthlyPoints: 0,
      monthlyUsd: 0,
      monthlyKrw: 0,
      freeTierEligible: true,
      warnings: []
    };
  }

  const tier = Object.hasOwn(SPEC_TIERS, specTier) ? SPEC_TIERS[specTier] : SPEC_TIERS.nano;
  const hoursPerDay = alwaysOn ? 24 : Math.max(0, Math.min(24, Number(activeHoursPerDay) || 0));
  const ccu = Math.max(1, Math.min(100000, Number(avgCcu) || 1));
  const capacity = Math.max(1, tier.recommendedCcu);
  const estimatedInstances = Math.max(1, Math.ceil(ccu / capacity));
  const monthlyHours = Math.round(hoursPerDay * 30);
  const effectiveRate = tier.id === 'free-nano' ? SPEC_TIERS.nano.pointsPerHour : tier.pointsPerHour;
  const rawMonthlyPoints = Math.ceil(estimatedInstances * effectiveRate * monthlyHours);
  const warnings = [];

  let freeTierEligible = false;
  if (mode === 'mmo') {
    warnings.push('MMO 라이브 배포는 유료 허브 포인트 충전이 필요합니다 (Free 티어는 1시간 Sandbox 프리뷰 전용).');
  } else if (tier.id === 'free-nano') {
    freeTierEligible = rawMonthlyPoints <= FREE_MONTHLY_POINT_LIMIT && ccu <= 10;
    if (ccu > 10) warnings.push('Free-Nano 프리셋은 동접 최대 10명·세션 60분·유휴 2분 종료 제약이 적용됩니다.');
    if (rawMonthlyPoints > FREE_MONTHLY_POINT_LIMIT) {
      warnings.push(`예상 사용량(${rawMonthlyPoints} P)이 월 무료 한도(${FREE_MONTHLY_POINT_LIMIT} P)를 초과합니다.`);
    }
  }
  if (mode === 'mmo' && alwaysOn) {
    warnings.push('24시간 상시 유지(alwaysOn) 선택 시 유저가 없어도 시간당 허브 포인트가 차감됩니다.');
  }

  const billedPoints = tier.id === 'free-nano' && mode === 'mo' ? 0 : rawMonthlyPoints;
  return {
    deployMode: mode,
    specTier: tier.id,
    pointsPerHour: tier.pointsPerHour,
    estimatedInstances,
    monthlyHours,
    monthlyPoints: billedPoints,
    estimatedUsagePoints: rawMonthlyPoints,
    monthlyUsd: Number((billedPoints * USD_PER_POINT).toFixed(2)),
    monthlyKrw: Math.round(billedPoints * KRW_PER_POINT),
    freeTierEligible,
    warnings
  };
}

function normalizeDeployProfile(raw = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const deployMode = DEPLOY_MODES.has(input.deployMode) ? input.deployMode : 'singleplay';
  let serverRuntime = SERVER_RUNTIMES.has(input.serverRuntime) ? input.serverRuntime : (deployMode === 'singleplay' ? 'none' : 'node-wss-v1');
  if (deployMode === 'singleplay') serverRuntime = 'none';
  else if (serverRuntime === 'none') serverRuntime = 'node-wss-v1';

  let specTier = Object.hasOwn(SPEC_TIERS, input.specTier)
    ? input.specTier
    : (deployMode === 'singleplay' ? 'free-nano' : deployMode === 'mo' ? 'free-nano' : 'small');
  if (deployMode === 'singleplay') specTier = 'free-nano';

  const lobbyMode = LOBBY_MODES.has(input.lobbyMode) ? input.lobbyMode : 'stateless_ui';
  const rawChannel = input.channelPolicy && typeof input.channelPolicy === 'object' ? input.channelPolicy : {};
  const rawLifecycle = input.lifecycle && typeof input.lifecycle === 'object' ? input.lifecycle : {};
  const rawBilling = input.billing && typeof input.billing === 'object' ? input.billing : {};

  const notifyEmail = typeof rawBilling.notifyEmail === 'string' && rawBilling.notifyEmail.trim().length <= 160
    ? rawBilling.notifyEmail.trim()
    : '';

  return {
    deployMode,
    serverRuntime,
    specTier,
    lobbyMode,
    channelPolicy: {
      autoChanneling: deployMode === 'mmo' ? rawChannel.autoChanneling !== false : false,
      softCapPerChannel: clampInt(rawChannel.softCapPerChannel, 10, 500, deployMode === 'mmo' ? 100 : SPEC_TIERS[specTier].recommendedCcu),
      hideChannelUiWhenSingle: rawChannel.hideChannelUiWhenSingle !== false
    },
    lifecycle: {
      alwaysOn: deployMode === 'mmo' && rawLifecycle.alwaysOn === true,
      idleSleepSec: clampInt(rawLifecycle.idleSleepSec, 60, 3600, deployMode === 'mmo' ? 600 : 180),
      afkKickSec: clampInt(rawLifecycle.afkKickSec, 120, 7200, 1200)
    },
    billing: {
      currency: 'HUB_POINT',
      pricingRule: 'flat_rate_no_peak_discount',
      ccuCap: deployMode === 'mo' && specTier === 'free-nano' ? 10 : null,
      autoTopUp: rawBilling.autoTopUp === true,
      notifyEmail,
      onExhausted: 'graceful_stop_or_hibernate'
    }
  };
}

function normalizeLocalized(value, fallbackKo, fallbackEn, maxLen) {
  if (typeof value === 'string') {
    const text = cleanText(value, maxLen, fallbackKo);
    return { ko: text, en: text };
  }
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const ko = cleanText(obj.ko, maxLen, cleanText(obj.en, maxLen, fallbackKo));
  const en = cleanText(obj.en, maxLen, ko || fallbackEn);
  return { ko: ko || fallbackKo, en: en || fallbackEn };
}

function normalizeGameMetadata(raw = {}, defaults = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const fallbackTitle = cleanText(defaults.projectName, 80, 'PlayForge Game');
  const title = normalizeLocalized(input.title, fallbackTitle, fallbackTitle, 80);
  const summary = normalizeLocalized(
    input.summary,
    cleanText(defaults.description, 240, `${title.ko} — PlayForge에서 제작된 웹 게임`),
    cleanText(defaults.description, 240, `${title.en} — Web game built with PlayForge`),
    240
  );
  const instructions = normalizeLocalized(
    input.instructions,
    '키보드 또는 터치로 플레이하세요.',
    'Play with keyboard or touch controls.',
    600
  );

  const rawSlug = typeof input.slug === 'string' && input.slug.trim() ? input.slug.trim().toLowerCase() : '';
  const slug = GAME_ID_RE.test(rawSlug)
    ? rawSlug
    : slugifyGameId(rawSlug || title.en || title.ko, defaults.projectId || fallbackTitle);

  const tags = Array.isArray(input.tags)
    ? [...new Set(input.tags.map(t => cleanText(String(t || ''), 24, '').toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean))].slice(0, 6)
    : [];
  if (!tags.length) tags.push('arcade');

  const controls = Array.isArray(input.controls)
    ? [...new Set(input.controls.map(c => String(c || '').toLowerCase()).filter(c => ALLOWED_CONTROLS.has(c)))]
    : [];
  if (!controls.length) controls.push('keyboard', 'mouse');

  const vp = input.viewport && typeof input.viewport === 'object' ? input.viewport : {};
  const viewport = {
    width: clampInt(vp.width, 320, 3840, 1280),
    height: clampInt(vp.height, 240, 2160, 720),
    orientation: ALLOWED_ORIENTATIONS.has(vp.orientation) ? vp.orientation : 'landscape',
    resize: ALLOWED_RESIZE.has(vp.resize) ? vp.resize : 'fit'
  };

  const cap = input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : {};
  const capabilities = {
    webgl: cap.webgl !== false,
    wasm: cap.wasm !== false,
    workers: false,
    fullscreen: cap.fullscreen !== false,
    pointerLock: cap.pointerLock === true,
    externalNetwork: []
  };

  const sv = input.save && typeof input.save === 'object' ? input.save : {};
  const save = {
    enabled: sv.enabled !== false,
    schemaVersion: clampInt(sv.schemaVersion, 1, 99, 1),
    maxSlots: clampInt(sv.maxSlots, 1, 10, 1)
  };

  const md = input.media && typeof input.media === 'object' ? input.media : {};
  const cover = typeof md.cover === 'string' && /^[a-zA-Z0-9._/-]{1,120}$/.test(md.cover) && !md.cover.includes('..') && !md.cover.startsWith('/')
    ? md.cover
    : '';
  const screenshots = Array.isArray(md.screenshots)
    ? md.screenshots.filter(s => typeof s === 'string' && /^[a-zA-Z0-9._/-]{1,120}$/.test(s) && !s.includes('..') && !s.startsWith('/')).slice(0, 5)
    : [];

  return {
    slug,
    title,
    summary,
    instructions,
    tags,
    controls,
    viewport,
    capabilities,
    save,
    media: { cover, screenshots }
  };
}

function buildReleaseManifest({
  releaseId,
  projectId,
  projectName = '',
  sourceRevision = 1,
  sourceHash = '',
  build = {},
  deployProfile = {},
  gameMetadata = {},
  visibility = 'private',
  createdAt = new Date().toISOString()
} = {}) {
  const normalizedProfile = normalizeDeployProfile(deployProfile);
  const normalizedMeta = normalizeGameMetadata(gameMetadata, { projectId, projectName });
  const normalizedVisibility = VISIBILITIES.has(visibility) ? visibility : 'private';

  return {
    schemaVersion: SCHEMA_VERSION,
    releaseId: typeof releaseId === 'string' ? releaseId : '',
    projectId: typeof projectId === 'string' ? projectId : '',
    sourceRevision: clampInt(sourceRevision, 1, 1000000, 1),
    sourceHash: typeof sourceHash === 'string' ? sourceHash : '',
    visibility: normalizedVisibility,
    engine: {
      name: 'godot',
      version: ENGINE_VERSION,
      exportPreset: 'web-nothreads-v1'
    },
    artifacts: {
      clientWeb: {
        buildId: typeof build.buildId === 'string' ? build.buildId : (typeof build.id === 'string' ? build.id : ''),
        zipFile: 'PlayForge-Web.zip',
        sha256: typeof build.artifactSha256 === 'string' ? build.artifactSha256 : (typeof build.sha256 === 'string' ? build.sha256 : ''),
        bytes: Number.isSafeInteger(build.bytes) ? build.bytes : null,
        expandedBytes: Number.isSafeInteger(build.expandedBytes) ? build.expandedBytes : null,
        entryPoint: 'index.html',
        sdkBridgeVersion: SDK_BRIDGE_VERSION
      },
      serverBundle: null
    },
    deployProfile: normalizedProfile,
    gameMetadata: normalizedMeta,
    createdAt
  };
}

function validateReleaseManifest(manifest) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { ok: false, errors: ['INVALID_MANIFEST_OBJECT'], warnings };
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) errors.push('UNSUPPORTED_SCHEMA_VERSION');
  if (typeof manifest.projectId !== 'string' || !/^[a-f0-9]{24}$/.test(manifest.projectId)) errors.push('INVALID_PROJECT_ID');
  if (!Number.isSafeInteger(manifest.sourceRevision) || manifest.sourceRevision < 1) errors.push('INVALID_SOURCE_REVISION');
  if (!VISIBILITIES.has(manifest.visibility)) errors.push('INVALID_VISIBILITY');

  const clientWeb = manifest.artifacts?.clientWeb;
  if (!clientWeb || typeof clientWeb.buildId !== 'string' || !/^[a-f0-9]{16}$/.test(clientWeb.buildId)) {
    errors.push('INVALID_CLIENT_BUILD_ID');
  }
  if (clientWeb?.entryPoint !== 'index.html') errors.push('INVALID_ENTRY_POINT');

  const dp = manifest.deployProfile;
  if (!dp || !DEPLOY_MODES.has(dp.deployMode)) errors.push('INVALID_DEPLOY_MODE');
  if (!dp || !SERVER_RUNTIMES.has(dp.serverRuntime)) errors.push('INVALID_SERVER_RUNTIME');
  if (!dp || !Object.hasOwn(SPEC_TIERS, dp.specTier)) errors.push('INVALID_SPEC_TIER');
  if (dp?.deployMode === 'singleplay' && dp.serverRuntime !== 'none') errors.push('SINGLEPLAY_MUST_NOT_HAVE_SERVER_RUNTIME');
  if (dp?.deployMode === 'mmo' && dp.specTier === 'free-nano' && manifest.visibility === 'public') {
    errors.push('MMO_PUBLIC_REQUIRES_PAID_TIER');
  }
  if (dp?.deployMode !== 'singleplay') {
    warnings.push('멀티플레이 서버 실행 풀 프로비저닝은 Phase C에서 활성화됩니다 (현재는 배포 프로필만 고정).');
  }

  const gm = manifest.gameMetadata;
  if (!gm || typeof gm.slug !== 'string' || !GAME_ID_RE.test(gm.slug)) errors.push('INVALID_GAME_SLUG');
  if (!gm?.title?.ko || !gm?.title?.en) errors.push('INVALID_GAME_TITLE');
  if (!gm?.summary?.ko || !gm?.summary?.en) errors.push('INVALID_GAME_SUMMARY');
  if (!Array.isArray(gm?.tags) || gm.tags.length < 1) errors.push('INVALID_GAME_TAGS');

  return { ok: errors.length === 0, errors, warnings };
}

function deriveHubGameManifest(releaseManifest, overrides = {}) {
  const gm = normalizeGameMetadata(releaseManifest?.gameMetadata || {}, overrides);
  const slug = typeof overrides.slug === 'string' && GAME_ID_RE.test(overrides.slug) ? overrides.slug : gm.slug;
  const rev = Number.isSafeInteger(releaseManifest?.sourceRevision) ? releaseManifest.sourceRevision : 1;
  const version = typeof overrides.version === 'string' && /^\d+\.\d+\.\d+$/.test(overrides.version)
    ? overrides.version
    : `0.1.${rev}`;
  const today = new Date().toISOString().slice(0, 10);
  const publishedOn = typeof overrides.publishedOn === 'string' ? overrides.publishedOn : today;
  const updatedOn = typeof overrides.updatedOn === 'string' ? overrides.updatedOn : today;

  return {
    schemaVersion: 1,
    id: slug,
    slug,
    title: gm.title,
    summary: gm.summary,
    instructions: gm.instructions,
    entry: 'index.html',
    version,
    tags: gm.tags,
    controls: gm.controls,
    viewport: gm.viewport,
    capabilities: gm.capabilities,
    save: gm.save,
    seo: {
      title: `${gm.title.ko} | PlayHub`,
      description: gm.summary.ko,
      indexable: releaseManifest?.visibility === 'public'
    },
    media: {
      cover: gm.media.cover || '',
      screenshots: gm.media.screenshots || []
    },
    publishedOn,
    updatedOn
  };
}

module.exports = {
  SCHEMA_VERSION,
  ENGINE_VERSION,
  SDK_BRIDGE_VERSION,
  USD_PER_POINT,
  KRW_PER_POINT,
  FREE_MONTHLY_POINT_LIMIT,
  GAME_ID_RE,
  SPEC_TIERS,
  slugifyGameId,
  estimateMonthlyHubPoints,
  normalizeDeployProfile,
  normalizeGameMetadata,
  buildReleaseManifest,
  validateReleaseManifest,
  deriveHubGameManifest
};
