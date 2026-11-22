#!/usr/bin/env node
// N4 CLI — Bilingual Hybrid Search & Scene Kitbashing over 11,826 Open Assets
// Usage:
//   node tools/ai-supply/semantic-store/cli.mjs --query "비 오는 중세 돌바닥" [--limit 10] [--json]
//   node tools/ai-supply/semantic-store/cli.mjs --kitbash "사이버펑크 네온 골목 아레나" [--max-per-role 2] [--json]

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATALOG_PATH, loadAndBuildDefaultIndex, searchHybrid } from './indexer.mjs';
import { planSceneKitbash } from './kitbasher.mjs';

function parseArgs(argv) {
  const args = {
    query: null,
    kitbash: null,
    catalog: DEFAULT_CATALOG_PATH,
    limit: 10,
    maxPerRole: 3,
    categories: null,
    licenseTiers: null,
    noAiOnly: true,
    excludeExternalOnly: true,
    writeNoticesDir: null,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--allow-ai') args.noAiOnly = false;
    else if (a === '--include-external') args.excludeExternalOnly = false;
    else if (a === '--query' || a === '-q') args.query = argv[++i] ?? '';
    else if (a === '--kitbash' || a === '-k') args.kitbash = argv[++i] ?? '';
    else if (a === '--catalog') args.catalog = resolve(argv[++i]);
    else if (a === '--limit') args.limit = Math.max(1, Number(argv[++i]) || 10);
    else if (a === '--max-per-role') args.maxPerRole = Math.max(1, Number(argv[++i]) || 3);
    else if (a === '--categories') args.categories = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--license-tiers') args.licenseTiers = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--write-notices') args.writeNoticesDir = resolve(argv[++i]);
  }
  return args;
}

function printHelp() {
  console.log([
    'PlayForge N4 Semantic Store CLI (11,826 Open Assets)',
    '',
    'Options:',
    '  --query, -q <text>         Run bilingual hybrid (BM25 + Dense + RRF) search',
    '  --kitbash, -k <prompt>     Plan a multi-role 3D scene kitbash bundle + Notices',
    '  --limit <n>                Max search results (default: 10)',
    '  --max-per-role <n>         Max assets per scene role in kitbash mode (default: 3)',
    '  --categories <a,b>         Comma-separated category filters',
    '  --license-tiers <a,b>      Comma-separated license tier filters (e.g. tier1_cc0,tier2_attribution)',
    '  --catalog <path>           Override collected-catalog.json path',
    '  --write-notices <dir>      Write Third-Party Notices.txt and CREDITS.md to dir (kitbash mode)',
    '  --json                     Emit machine-readable JSON output',
  ].join('\n'));
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || (args.query === null && args.kitbash === null)) {
    printHelp();
    return 0;
  }

  const index = loadAndBuildDefaultIndex(args.catalog);

  if (args.kitbash !== null) {
    const plan = planSceneKitbash(index, {
      prompt: args.kitbash,
      maxPerRole: args.maxPerRole,
      noAiOnly: args.noAiOnly,
      excludeExternalOnly: args.excludeExternalOnly,
      licenseTiers: args.licenseTiers,
    });

    if (args.writeNoticesDir) {
      mkdirSync(args.writeNoticesDir, { recursive: true });
      writeFileSync(join(args.writeNoticesDir, 'Third-Party Notices.txt'), plan.thirdPartyNoticesTxt, 'utf8');
      writeFileSync(join(args.writeNoticesDir, 'CREDITS.md'), plan.creditsMd, 'utf8');
    }

    if (args.json) {
      const compactRoles = {};
      for (const [roleId, roleData] of Object.entries(plan.roles)) {
        compactRoles[roleId] = {
          ...roleData,
          assets: roleData.assets.map(({ item: _item, ...rest }) => rest),
        };
      }
      console.log(JSON.stringify({
        prompt: plan.prompt,
        indexSize: index.n,
        indexBuildMs: index.buildMs,
        tookMs: plan.tookMs,
        complianceSummary: plan.complianceSummary,
        roles: compactRoles,
        noticesUniqueCount: plan.notices.uniqueCount,
      }, null, 2));
    } else {
      console.log(`[N4 Kitbash] "${plan.prompt}" (${index.n} catalog items, ${plan.tookMs}ms)`);
      console.log(`Compliance: ${plan.complianceSummary.noAiCompliantCount}/${plan.complianceSummary.totalAssets} No-AI | Local bundles: ${plan.complianceSummary.localBundleCount} | Needs R2 Hydration: ${plan.complianceSummary.externalHydrationCount}`);
      for (const [roleId, roleData] of Object.entries(plan.roles)) {
        console.log(`\n  [${roleId}] ${roleData.label} (${roleData.count})`);
        for (const a of roleData.assets) {
          console.log(`    - ${a.title} (${a.asset_id}) | ${a.license} | ${a.hydrationStrategy} | score=${a.score}`);
        }
      }
    }
    return 0;
  }

  const res = searchHybrid(index, {
    query: args.query,
    limit: args.limit,
    categories: args.categories,
    licenseTiers: args.licenseTiers,
    noAiOnly: args.noAiOnly,
    excludeExternalOnly: args.excludeExternalOnly,
  });

  if (args.json) {
    console.log(JSON.stringify({
      query: res.query,
      indexSize: index.n,
      indexBuildMs: index.buildMs,
      tookMs: res.tookMs,
      originalTerms: res.originalTerms,
      expandedTerms: res.expandedTerms,
      concepts: res.concepts,
      totalMatched: res.totalMatched,
      results: res.results.map(({ item: _item, ...rest }) => rest),
    }, null, 2));
  } else {
    console.log(`[N4 Search] "${res.query}" -> ${res.results.length}/${res.totalMatched} hits in ${res.tookMs}ms (index ${index.n} items)`);
    for (let i = 0; i < res.results.length; i++) {
      const r = res.results[i];
      const hyd = r.hasLocalBundle ? 'local' : (r.needsExternalHydration ? 'hydrate' : 'ext');
      console.log(`  ${i + 1}. ${r.title} [${r.category}] (${r.license}, ${hyd}) score=${r.score}`);
    }
  }
  return 0;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  process.exit(runCli());
}
