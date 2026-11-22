// N4 — AI Scene Kitbasher & Project-Root Third-Party Notices / CREDITS Aggregator
// Pure Node 24 ESM (zero external dependencies)

import {
  NO_AI_DISCLOSURE,
  hasLocalBundle,
  needsExternalHydration,
  searchHybrid,
} from './indexer.mjs';

export const SCENE_ROLES = Object.freeze({
  hdri: {
    id: 'hdri',
    label: 'HDRI / Skybox Lighting',
    categories: ['HDRI · 스카이박스/조명'],
    fallbackHint: 'sky lighting environment hdri',
  },
  pbr_materials: {
    id: 'pbr_materials',
    label: 'PBR Materials & Surfaces',
    categories: ['PBR 텍스처 · 머티리얼'],
    fallbackHint: 'material texture surface floor wall',
  },
  models_3d: {
    id: 'models_3d',
    label: '3D Models, Props & Characters',
    categories: ['3D 모델 · 환경/소품', '3D 모델 · 캐릭터/장비'],
    fallbackHint: '3d prop model environment character',
  },
  ui_icons: {
    id: 'ui_icons',
    label: 'UI Icons & Interface Themes',
    categories: ['2D · UI/아이콘', 'UI · 테마 · Addon'],
    fallbackHint: 'icon ui button hud',
  },
  audio_sfx: {
    id: 'audio_sfx',
    label: 'Audio & Sound Effects',
    categories: ['오디오 · 효과음'],
    fallbackHint: 'sound audio sfx',
  },
  godot_tools: {
    id: 'godot_tools',
    label: 'Godot Addons, Shaders & Systems',
    categories: [
      'Godot 애드온 · 셰이더/VFX',
      'Godot 애드온 · 3D 도구',
      'Godot 애드온 · 2D 도구',
      'Godot 애드온 · 에디터/개발 도구',
      'Godot 애드온 · 스크립트/시스템',
    ],
    fallbackHint: 'godot shader camera 3d tool',
  },
});

export const DEFAULT_ROLE_ORDER = Object.freeze([
  'hdri',
  'pbr_materials',
  'models_3d',
  'ui_icons',
  'audio_sfx',
  'godot_tools',
]);

function resolveHydrationInfo(item) {
  const local = hasLocalBundle(item);
  const externalHydrate = needsExternalHydration(item);
  let hydrationStrategy = 'external_link_only';
  if (local) hydrationStrategy = 'local_bundle';
  else if (externalHydrate) hydrationStrategy = 'r2_cas_hydrate';

  return {
    hasLocalBundle: local,
    needsExternalHydration: externalHydrate,
    hydrationStrategy,
    artifactDigest: item.artifact_digest || null,
    localFileCount: local ? item.local_bundle_files.length : 0,
    downloadUrl: item.download_url || item.external_download_url || item.source_url || null,
  };
}

export function aggregateThirdPartyNotices(items, options = {}) {
  const projectName = options.projectName || 'PlayForge Generated Scene';
  const list = Array.isArray(items) ? items : [];

  const seenAssetIds = new Set();
  const seenNoticeKeys = new Set();
  const entries = [];
  let duplicateCount = 0;

  for (const raw of list) {
    const item = raw?.item || raw;
    if (!item || typeof item !== 'object') continue;

    const assetId = String(item.asset_id || item.id || '').trim();
    const title = String(item.title || assetId || 'Untitled Asset').trim();
    const author = String(item.author || item.source_provider || 'Unknown Author').trim();
    const license = String(item.license || 'Unknown').trim();
    const licenseTier = String(item.license_tier || 'unknown').trim();
    const sourceUrl = String(item.source_url || item.download_url || '').trim();
    const aiDisclosure = String(item.ai_disclosure || '').trim();
    const attributionText = String(
      item.attribution_text ||
        `Asset uses ${title} by ${author} under ${license}${sourceUrl ? ` (${sourceUrl})` : ''}.${aiDisclosure ? ` (AI Disclosure: ${aiDisclosure})` : ''}`
    ).trim();

    const normalizedNoticeKey = attributionText.toLowerCase().replace(/\s+/g, ' ');
    if ((assetId && seenAssetIds.has(assetId)) || seenNoticeKeys.has(normalizedNoticeKey)) {
      duplicateCount++;
      continue;
    }
    if (assetId) seenAssetIds.add(assetId);
    seenNoticeKeys.add(normalizedNoticeKey);

    entries.push({
      asset_id: assetId,
      title,
      author,
      license,
      license_tier: licenseTier,
      source_provider: String(item.source_provider || '').trim(),
      source_url: sourceUrl,
      ai_disclosure: aiDisclosure,
      attribution_text: attributionText,
      artifact_digest: item.artifact_digest || null,
    });
  }

  // Deterministic ordering: license_tier -> asset_id -> title
  entries.sort(
    (a, b) =>
      a.license_tier.localeCompare(b.license_tier) ||
      a.asset_id.localeCompare(b.asset_id) ||
      a.title.localeCompare(b.title)
  );

  // Build project-root Third-Party Notices.txt
  const noticeLines = [
    `THIRD-PARTY NOTICES — ${projectName}`,
    '========================================================================',
    `Total Unique Open Assets: ${entries.length} (Deduplicated: ${duplicateCount})`,
    'All assets listed below are open-licensed and verified from the PlayForge Store catalog.',
    '',
  ];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    noticeLines.push(`[${i + 1}] ${e.title} (${e.asset_id || 'custom'})`);
    noticeLines.push(`    Author / Provider : ${e.author}${e.source_provider && e.source_provider !== e.author ? ` / ${e.source_provider}` : ''}`);
    noticeLines.push(`    License           : ${e.license} (${e.license_tier})`);
    if (e.source_url) noticeLines.push(`    Source URL        : ${e.source_url}`);
    if (e.ai_disclosure) noticeLines.push(`    AI Disclosure     : ${e.ai_disclosure}`);
    noticeLines.push(`    Attribution       : ${e.attribution_text}`);
    noticeLines.push('');
  }
  const thirdPartyNoticesTxt = noticeLines.join('\n').trimEnd() + '\n';

  // Build CREDITS.md
  const escapeMd = (v) => String(v || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const creditsLines = [
    `# Third-Party Asset Credits — ${projectName}`,
    '',
    `- **Total Unique Assets**: ${entries.length}`,
    `- **Deduplicated Duplicates**: ${duplicateCount}`,
    `- **No-AI Verified**: ${entries.filter((e) => e.ai_disclosure === NO_AI_DISCLOSURE).length} / ${entries.length}`,
    '',
    '| # | Asset | Author / Provider | License | Source | AI Disclosure |',
    '|---|---|---|---|---|---|',
  ];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const sourceCell = e.source_url ? `[Link](${e.source_url})` : '-';
    creditsLines.push(
      `| ${i + 1} | ${escapeMd(e.title)} (\`${escapeMd(e.asset_id)}\`) | ${escapeMd(e.author)} | ${escapeMd(e.license)} | ${sourceCell} | ${escapeMd(e.ai_disclosure || 'N/A')} |`
    );
  }
  creditsLines.push('', '## Full Attribution Notices', '');
  for (const e of entries) {
    creditsLines.push(`- **${e.title}**: ${e.attribution_text}`);
  }
  const creditsMd = creditsLines.join('\n').trimEnd() + '\n';

  return {
    entries,
    uniqueCount: entries.length,
    duplicateCount,
    thirdPartyNoticesTxt,
    creditsMd,
  };
}

export function planSceneKitbash(index, options = {}) {
  const startedAt = performance.now();
  const {
    prompt = '',
    maxPerRole = 3,
    noAiOnly = true,
    excludeExternalOnly = true,
    licenseTiers = null,
    roles = DEFAULT_ROLE_ORDER,
    projectName = null,
  } = options;

  const roleIds = Array.isArray(roles) && roles.length > 0 ? roles : DEFAULT_ROLE_ORDER;
  const usedIds = new Set();
  const bundle = {};
  const allSelectedItems = [];

  for (const roleId of roleIds) {
    const spec = SCENE_ROLES[roleId];
    if (!spec) continue;

    const picked = [];
    const primary = searchHybrid(index, {
      query: prompt,
      categories: spec.categories,
      noAiOnly,
      excludeExternalOnly,
      licenseTiers,
      limit: Math.max(maxPerRole * 3, 12),
    });

    for (const hit of primary.results) {
      if (picked.length >= maxPerRole) break;
      if (usedIds.has(hit.asset_id)) continue;
      usedIds.add(hit.asset_id);
      picked.push({
        role: roleId,
        asset_id: hit.asset_id,
        title: hit.title,
        category: hit.category,
        license: hit.license,
        license_tier: hit.license_tier,
        ai_disclosure: hit.ai_disclosure,
        source_provider: hit.source_provider,
        score: hit.score,
        ...resolveHydrationInfo(hit.item),
        item: hit.item,
      });
      allSelectedItems.push(hit.item);
    }

    // Graceful fallback with role hint if prompt is sparse for this slot
    if (picked.length < maxPerRole) {
      const fallback = searchHybrid(index, {
        query: `${prompt} ${spec.fallbackHint}`.trim(),
        categories: spec.categories,
        noAiOnly,
        excludeExternalOnly,
        licenseTiers,
        limit: Math.max(maxPerRole * 3, 12),
      });
      for (const hit of fallback.results) {
        if (picked.length >= maxPerRole) break;
        if (usedIds.has(hit.asset_id)) continue;
        usedIds.add(hit.asset_id);
        picked.push({
          role: roleId,
          asset_id: hit.asset_id,
          title: hit.title,
          category: hit.category,
          license: hit.license,
          license_tier: hit.license_tier,
          ai_disclosure: hit.ai_disclosure,
          source_provider: hit.source_provider,
          score: hit.score,
          fallbackUsed: true,
          ...resolveHydrationInfo(hit.item),
          item: hit.item,
        });
        allSelectedItems.push(hit.item);
      }
    }

    bundle[roleId] = {
      role: roleId,
      label: spec.label,
      categories: spec.categories,
      count: picked.length,
      assets: picked,
    };
  }

  const notices = aggregateThirdPartyNotices(allSelectedItems, {
    projectName: projectName || `Kitbash: ${prompt || 'Untitled Scene'}`,
  });

  const licenseBreakdown = {};
  let localBundleCount = 0;
  let externalHydrationCount = 0;
  let noAiCompliantCount = 0;

  for (const item of allSelectedItems) {
    const tier = item.license_tier || 'unknown';
    licenseBreakdown[tier] = (licenseBreakdown[tier] || 0) + 1;
    if (hasLocalBundle(item)) localBundleCount++;
    else if (needsExternalHydration(item)) externalHydrationCount++;
    if (item.ai_disclosure === NO_AI_DISCLOSURE) noAiCompliantCount++;
  }

  const totalAssets = allSelectedItems.length;
  return {
    prompt,
    tookMs: +(performance.now() - startedAt).toFixed(3),
    roles: bundle,
    complianceSummary: {
      totalAssets,
      noAiCompliantCount,
      noAiComplianceRate: totalAssets > 0 ? +(noAiCompliantCount / totalAssets).toFixed(4) : 1,
      licenseBreakdown,
      localBundleCount,
      externalHydrationCount,
    },
    notices: {
      uniqueCount: notices.uniqueCount,
      duplicateCount: notices.duplicateCount,
      entries: notices.entries,
    },
    thirdPartyNoticesTxt: notices.thirdPartyNoticesTxt,
    creditsMd: notices.creditsMd,
  };
}
