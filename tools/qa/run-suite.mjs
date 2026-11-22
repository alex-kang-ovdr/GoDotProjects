#!/usr/bin/env node
// PlayHub-Platform 선택적 QA 테스트 스위트 실행기 (SSOT: tools/qa/test-catalog.json).
// 사용법:
//   node tools/qa/run-suite.mjs --summary
//   node tools/qa/run-suite.mjs --suite smoke
//   node tools/qa/run-suite.mjs --suite 허브,포지 --env live --list
//   node tools/qa/run-suite.mjs --suite 허브 --suite 유저 --env live
//   node tools/qa/run-suite.mjs --suite 브라우저 --dry-run
//   node tools/qa/run-suite.mjs --changed [baseRef]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const REPO_ROOT = resolve(__dirname, '..', '..');
export const CATALOG_PATH = join(REPO_ROOT, 'tools/qa/test-catalog.json');

const AUTO_ALL_TIER_SUITES = new Set(['browser', 'godot', 'portable']);
const VALID_REPORTERS = new Set(['dot', 'spec', 'tap']);

const BUILTIN_SUITE_ALIASES = {
  스모크: 'smoke',
  컴포넌트: 'component',
  허브: 'hub',
  포지: 'forge',
  시스템: 'system',
  변경회귀: 'regression',
  회귀: 'regression',
  멀티플랫폼: 'multiplatform',
  유저: 'user',
  게임: 'game',
  브라우저: 'browser',
  고도: 'godot',
  포터블: 'portable',
};

const BUILTIN_ENV_ALIASES = {
  로컬: 'local',
  dev: 'dev',
  개발: 'dev',
  live: 'live',
  라이브: 'live',
};

export function loadCatalog(catalogPath = CATALOG_PATH) {
  return JSON.parse(readFileSync(catalogPath, 'utf8'));
}

export function formatQuarantineEntry(meta) {
  if (!meta) return '';
  if (typeof meta === 'string') return meta;
  const parts = [];
  if (meta.reason) parts.push(meta.reason);
  if (meta.owner) parts.push(`담당: ${meta.owner}`);
  if (meta.expiresAt) parts.push(`만료: ${meta.expiresAt}`);
  return parts.join(' · ');
}

export function resolveSuiteAlias(rawToken, catalog) {
  const trimmed = String(rawToken || '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const validSuites = new Set(catalog.suites || []);
  if (validSuites.has(lower)) return lower;

  const aliases = catalog.aliases || {};
  const fromCatalog = aliases[trimmed] || aliases[lower];
  if (fromCatalog) {
    if (fromCatalog.type === 'suite' && validSuites.has(fromCatalog.value)) {
      return fromCatalog.value;
    }
    if (fromCatalog.type === 'env') {
      throw new Error(
        `[run-suite] "${trimmed}"은(는) suite가 아니라 env 별칭입니다. --env ${fromCatalog.value} 옵션을 사용하세요.`
      );
    }
  }

  if (BUILTIN_SUITE_ALIASES[trimmed]) return BUILTIN_SUITE_ALIASES[trimmed];
  if (BUILTIN_SUITE_ALIASES[lower]) return BUILTIN_SUITE_ALIASES[lower];
  if (BUILTIN_ENV_ALIASES[trimmed] || BUILTIN_ENV_ALIASES[lower]) {
    const envVal = BUILTIN_ENV_ALIASES[trimmed] || BUILTIN_ENV_ALIASES[lower];
    throw new Error(
      `[run-suite] "${trimmed}"은(는) suite가 아니라 env 별칭입니다. --env ${envVal} 옵션을 사용하세요.`
    );
  }

  throw new Error(
    `[run-suite] 알 수 없는 suite "${trimmed}". 허용 값: ${(catalog.suites || []).join(', ')}`
  );
}

export function resolveEnvAlias(rawToken, catalog) {
  const trimmed = String(rawToken || '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const validEnvs = new Set(catalog.envs || []);
  if (validEnvs.has(lower)) return lower;

  const aliases = catalog.aliases || {};
  const fromCatalog = aliases[trimmed] || aliases[lower];
  if (fromCatalog && fromCatalog.type === 'env' && validEnvs.has(fromCatalog.value)) {
    return fromCatalog.value;
  }

  if (BUILTIN_ENV_ALIASES[trimmed]) return BUILTIN_ENV_ALIASES[trimmed];
  if (BUILTIN_ENV_ALIASES[lower]) return BUILTIN_ENV_ALIASES[lower];

  throw new Error(
    `[run-suite] 알 수 없는 env "${trimmed}". 허용 값: ${(catalog.envs || []).join(', ')}`
  );
}

export function resolveTierTokens(rawValue, catalog) {
  const validTiers = new Set(catalog.tiers || ['fast', 'integration', 'nightly']);
  const tokens = String(rawValue || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) {
    throw new Error('[run-suite] --tier 값이 비어 있습니다. 허용 값: fast, integration, nightly, all');
  }
  if (tokens.includes('all')) return new Set(validTiers);
  const out = new Set();
  for (const tok of tokens) {
    if (!validTiers.has(tok)) {
      throw new Error(
        `[run-suite] 알 수 없는 tier "${tok}". 허용 값: ${[...validTiers, 'all'].join(', ')}`
      );
    }
    out.add(tok);
  }
  return out;
}

export function parseArgs(argv) {
  const opts = {
    suiteArgs: [],
    envArgs: [],
    andMode: false,
    tier: null,
    allTiers: false,
    changed: false,
    changedBase: null,
    list: false,
    summary: false,
    dryRun: false,
    json: false,
    reporter: process.env.QA_REPORTER || process.env.FAST_GATE_REPORTER || 'dot',
    includeQuarantine: false,
    onlyQuarantine: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--suite' || arg === '-s') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) throw new Error(`[run-suite] ${arg} 뒤에 스위트 이름을 지정하세요.`);
      opts.suiteArgs.push(next);
      i += 1;
    } else if (arg.startsWith('--suite=')) {
      opts.suiteArgs.push(arg.slice('--suite='.length));
    } else if (arg.startsWith('-s=')) {
      opts.suiteArgs.push(arg.slice('-s='.length));
    } else if (arg === '--env' || arg === '-e') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) throw new Error(`[run-suite] ${arg} 뒤에 환경(local|dev|live)을 지정하세요.`);
      opts.envArgs.push(next);
      i += 1;
    } else if (arg.startsWith('--env=')) {
      opts.envArgs.push(arg.slice('--env='.length));
    } else if (arg.startsWith('-e=')) {
      opts.envArgs.push(arg.slice('-e='.length));
    } else if (arg === '--tier' || arg === '-t') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) throw new Error(`[run-suite] ${arg} 뒤에 계층(fast|integration|nightly|all)을 지정하세요.`);
      opts.tier = next;
      i += 1;
    } else if (arg.startsWith('--tier=')) {
      opts.tier = arg.slice('--tier='.length);
    } else if (arg.startsWith('-t=')) {
      opts.tier = arg.slice('-t='.length);
    } else if (arg === '--all-tiers') {
      opts.allTiers = true;
    } else if (arg === '--and') {
      opts.andMode = true;
    } else if (arg === '--changed') {
      opts.changed = true;
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        opts.changedBase = next;
        i += 1;
      }
    } else if (arg.startsWith('--changed=')) {
      opts.changed = true;
      opts.changedBase = arg.slice('--changed='.length) || null;
    } else if (arg === '--list') {
      opts.list = true;
    } else if (arg === '--summary') {
      opts.summary = true;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--reporter') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) throw new Error('[run-suite] --reporter 뒤에 dot|spec|tap을 지정하세요.');
      opts.reporter = next;
      i += 1;
    } else if (arg.startsWith('--reporter=')) {
      opts.reporter = arg.slice('--reporter='.length);
    } else if (arg === '--include-quarantine') {
      opts.includeQuarantine = true;
    } else if (arg === '--only-quarantine') {
      opts.onlyQuarantine = true;
    } else {
      throw new Error(`[run-suite] 알 수 없는 옵션: ${arg} (--help 로 사용법 확인)`);
    }
  }

  if (!VALID_REPORTERS.has(opts.reporter)) {
    throw new Error(`[run-suite] 알 수 없는 --reporter "${opts.reporter}". 허용 값: dot, spec, tap`);
  }

  return opts;
}

function tryGit(args, cwd = REPO_ROOT) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, '/'))
      .filter(Boolean);
  } catch {
    return null;
  }
}

export function getChangedFiles(baseRef = null, cwd = REPO_ROOT) {
  const files = new Set();
  if (baseRef) {
    for (const f of tryGit(['diff', '--name-only', baseRef], cwd) || []) files.add(f);
  } else {
    const branch = (tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd) || [])[0];
    if (branch && branch !== 'PlayHub-Platform') {
      const defaultBase = ['PlayHub-Platform', 'origin/PlayHub-Platform'].find(
        (ref) => tryGit(['rev-parse', '--verify', '--quiet', ref], cwd) !== null
      );
      if (defaultBase) {
        for (const f of tryGit(['diff', '--name-only', `${defaultBase}...HEAD`], cwd) || []) {
          files.add(f);
        }
      }
    }
    for (const f of tryGit(['diff', '--name-only'], cwd) || []) files.add(f);
    for (const f of tryGit(['diff', '--cached', '--name-only'], cwd) || []) files.add(f);
  }
  for (const f of tryGit(['ls-files', '--others', '--exclude-standard'], cwd) || []) {
    files.add(f);
  }
  return [...files].sort();
}

export function resolveChangedSelection(changedFiles, catalog) {
  const suites = new Set(['smoke', 'regression']);
  const envs = new Set();
  const directTests = new Set();
  const testPaths = new Set((catalog.tests || []).map((t) => t.path));
  const rules = (catalog.changedRules || []).map((rule) => ({
    ...rule,
    re: rule.match ? new RegExp(rule.match) : null,
  }));

  for (const file of changedFiles) {
    if (testPaths.has(file)) directTests.add(file);
    for (const rule of rules) {
      const hit = rule.re
        ? rule.re.test(file)
        : rule.prefix
          ? file.startsWith(rule.prefix)
          : false;
      if (hit) {
        for (const s of rule.suites || []) suites.add(s);
        for (const e of rule.envs || []) envs.add(e);
      }
    }
  }

  return {
    suites: [...suites],
    envs: [...envs],
    directTests: [...directTests],
  };
}

export function selectTests(catalog, opts, { cwd = REPO_ROOT, changedFilesOverride = null } = {}) {
  const suiteGroups = [];
  const allExplicitSuites = [];
  for (const raw of opts.suiteArgs || []) {
    const tokens = raw
      .split(',')
      .map((s) => resolveSuiteAlias(s, catalog))
      .filter(Boolean);
    if (!tokens.length) continue;
    allExplicitSuites.push(...tokens);
    if (opts.andMode) {
      for (const tok of tokens) suiteGroups.push([tok]);
    } else {
      suiteGroups.push(tokens);
    }
  }

  const envGroups = [];
  for (const raw of opts.envArgs || []) {
    const tokens = raw
      .split(',')
      .map((e) => resolveEnvAlias(e, catalog))
      .filter(Boolean);
    if (!tokens.length) continue;
    if (opts.andMode) {
      for (const tok of tokens) envGroups.push([tok]);
    } else {
      envGroups.push(tokens);
    }
  }

  let changedInfo = null;
  if (opts.changed) {
    const changedFiles = changedFilesOverride ?? getChangedFiles(opts.changedBase, cwd);
    const mapped = resolveChangedSelection(changedFiles, catalog);
    changedInfo = { files: changedFiles, ...mapped };
  }

  let activeTiers;
  if (opts.allTiers) {
    activeTiers = new Set(catalog.tiers || ['fast', 'integration', 'nightly']);
  } else if (opts.tier) {
    activeTiers = resolveTierTokens(opts.tier, catalog);
  } else if (allExplicitSuites.some((s) => AUTO_ALL_TIER_SUITES.has(s))) {
    activeTiers = new Set(catalog.tiers || ['fast', 'integration', 'nightly']);
  } else if (opts.summary && !suiteGroups.length && !envGroups.length && !opts.changed) {
    activeTiers = new Set(catalog.tiers || ['fast', 'integration', 'nightly']);
  } else {
    activeTiers = new Set(['fast']);
  }

  const quarantine = catalog.quarantine || {};
  const matched = [];
  const quarantinedMatched = [];

  for (const entry of catalog.tests || []) {
    if (!activeTiers.has(entry.tier)) continue;

    // Explicit --suite filter (AND across groups, OR within group)
    if (suiteGroups.length) {
      const suiteOk = suiteGroups.every((group) => group.some((s) => entry.suites.includes(s)));
      if (!suiteOk) continue;
    }

    // Explicit --env filter (AND with suite filter)
    if (envGroups.length) {
      const envOk = envGroups.every((group) => group.some((e) => entry.envs.includes(e)));
      if (!envOk) continue;
    }

    // --changed filter (matches direct test OR mapped suites+smoke+regression, respecting mapped envs when no explicit --env)
    if (changedInfo) {
      const isDirect = changedInfo.directTests.includes(entry.path);
      const suiteHit = changedInfo.suites.some((s) => entry.suites.includes(s));
      const envHit =
        envGroups.length > 0 ||
        changedInfo.envs.length === 0 ||
        changedInfo.envs.some((e) => entry.envs.includes(e));
      if (!isDirect && !(suiteHit && envHit)) continue;
    }

    const isQuarantined = Boolean(quarantine[entry.path]);
    if (isQuarantined) quarantinedMatched.push(entry);

    if (opts.onlyQuarantine) {
      if (isQuarantined) matched.push(entry);
    } else if (opts.includeQuarantine) {
      matched.push(entry);
    } else if (!isQuarantined) {
      matched.push(entry);
    }
  }

  return {
    entries: matched,
    quarantinedEntries: quarantinedMatched,
    activeTiers: [...activeTiers],
    suiteGroups,
    envGroups,
    changedInfo,
  };
}

function buildSummary(entries, catalog, selection) {
  const byTier = Object.fromEntries((catalog.tiers || []).map((t) => [t, 0]));
  const bySuite = Object.fromEntries((catalog.suites || []).map((s) => [s, 0]));
  const byEnv = Object.fromEntries((catalog.envs || []).map((e) => [e, 0]));

  for (const entry of entries) {
    byTier[entry.tier] = (byTier[entry.tier] || 0) + 1;
    for (const s of entry.suites || []) bySuite[s] = (bySuite[s] || 0) + 1;
    for (const e of entry.envs || []) byEnv[e] = (byEnv[e] || 0) + 1;
  }

  return {
    totalCatalog: (catalog.tests || []).length,
    selected: entries.length,
    quarantineTotal: Object.keys(catalog.quarantine || {}).length,
    activeTiers: selection.activeTiers,
    byTier,
    bySuite,
    byEnv,
  };
}

function printHelp() {
  console.log(`사용법: node tools/qa/run-suite.mjs [옵션]

옵션:
  -s, --suite <a,b>      실행할 스위트 선택 (콤마는 OR, 반복 또는 --and 는 AND)
  -e, --env <e>          환경 필터 (local | dev | live, 스위트와 AND)
  -t, --tier <tier>      계층 선택 (fast | integration | nightly | all)
                         기본값: --suite에 browser/godot/portable 지정 시 all, 그 외 fast
      --all-tiers        모든 계층(fast+integration+nightly) 포함
      --and              콤마로 나열한 스위트/환경을 교집합(AND)으로 결합
      --changed [ref]    git 변경 파일 기반 영향 스위트 + smoke + regression 자동 선택
      --list             선택된 테스트 파일 목록만 출력
      --summary          카탈로그(또는 필터 결과) 계층/스위트/환경별 요약 출력
      --dry-run          실제 실행 없이 실행 명령 미리보기
      --reporter <r>     node --test 리포터 (dot | spec | tap)
      --include-quarantine  격리(quarantine) 테스트 포함 실행
      --only-quarantine     격리(quarantine) 테스트만 실행
      --json             --list/--summary/--dry-run 결과를 JSON으로 출력
  -h, --help             도움말 출력

한글 별칭:
  스위트: 스모크→smoke, 컴포넌트→component, 허브→hub, 포지→forge, 시스템→system,
          변경회귀→regression, 멀티플랫폼→multiplatform, 유저→user, 게임→game,
          브라우저→browser, 고도→godot, 포터블→portable
  환경:   로컬→local, Dev/dev→dev, Live/live→live`);
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

export function main(argv = process.argv.slice(2)) {
  const [major] = process.versions.node.split('.').map(Number);
  if (major < 24) {
    console.error(
      `[run-suite] Node.js 24 이상이 필요합니다(현재 ${process.version}). artifacts/local-runtime/node24/node.exe 또는 .nvmrc 버전을 사용하세요.`
    );
    process.exit(2);
  }

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const catalog = loadCatalog();
  let selection;
  try {
    selection = selectTests(catalog, opts);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const quarantine = catalog.quarantine || {};
  const quarantinedKeys = Object.keys(quarantine);
  const files = selection.entries.map((e) => e.path);

  if (opts.summary) {
    const summary = buildSummary(selection.entries, catalog, selection);
    if (opts.json) {
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
    }
    console.log(
      `[run-suite] 카탈로그 총 ${summary.totalCatalog}개 / 선택 ${summary.selected}개 / 격리(quarantine) ${summary.quarantineTotal}개`
    );
    console.log(`  tiers : ${Object.entries(summary.byTier).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    console.log(`  suites: ${Object.entries(summary.bySuite).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    console.log(`  envs  : ${Object.entries(summary.byEnv).map(([k, v]) => `${k}=${v}`).join(', ')}`);
    process.exit(0);
  }

  if (opts.list) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            tiers: selection.activeTiers,
            count: files.length,
            quarantineCount: quarantinedKeys.length,
            changed: selection.changedInfo,
            files,
          },
          null,
          2
        )
      );
      process.exit(0);
    }
    const filterDesc = [
      `tier=${selection.activeTiers.join(',')}`,
      selection.suiteGroups.length ? `suite=${selection.suiteGroups.map((g) => g.join('|')).join('&')}` : null,
      selection.envGroups.length ? `env=${selection.envGroups.map((g) => g.join('|')).join('&')}` : null,
      selection.changedInfo
        ? `changed=${selection.changedInfo.files.length}files->${selection.changedInfo.suites.join(',')}`
        : null,
    ]
      .filter(Boolean)
      .join(' ');
    console.log(`[run-suite] 대상 ${files.length}개 / 격리 ${quarantinedKeys.length}개 (${filterDesc})`);
    for (const f of quarantinedKeys) {
      console.log(`  ⚠ QUARANTINE ${f} — ${formatQuarantineEntry(quarantine[f])}`);
    }
    for (const f of files) console.log(`  ${f}`);
    process.exit(0);
  }

  if (opts.dryRun) {
    const cmd = [process.execPath, '--test', `--test-reporter=${opts.reporter}`, ...files];
    if (opts.json) {
      console.log(JSON.stringify({ dryRun: true, count: files.length, command: cmd }, null, 2));
      process.exit(0);
    }
    console.log(`[run-suite] DRY-RUN 대상 ${files.length}개 (tier=${selection.activeTiers.join(',')})`);
    if (selection.changedInfo) {
      console.log(
        `  변경 파일 ${selection.changedInfo.files.length}개 → 스위트 [${selection.changedInfo.suites.join(', ')}]`
      );
    }
    console.log(`  명령: node --test --test-reporter=${opts.reporter} (${files.length} files)`);
    for (const f of files) console.log(`    ${f}`);
    process.exit(0);
  }

  console.log(
    `[run-suite] 대상 ${files.length}개 / 격리 ${quarantinedKeys.length}개 (tier=${selection.activeTiers.join(',')})`
  );
  if (selection.changedInfo) {
    console.log(
      `[run-suite] --changed 파일 ${selection.changedInfo.files.length}개 → 스위트 [${selection.changedInfo.suites.join(', ')}]`
    );
  }
  for (const f of quarantinedKeys) {
    console.log(`  ⚠ QUARANTINE ${f} — ${formatQuarantineEntry(quarantine[f])}`);
  }
  if (!files.length) {
    console.error('[run-suite] 실행할 테스트가 없습니다.');
    process.exit(1);
  }

  const missing = files.filter((f) => !existsSync(join(REPO_ROOT, f)));
  if (missing.length) {
    console.error(`[run-suite] 오류: 카탈로그에 등록되었으나 디스크에 없는 테스트 ${missing.length}개:`);
    for (const f of missing) console.error(`  - ${f}`);
    process.exit(1);
  }

  const started = Date.now();
  const isFastOnly = selection.activeTiers.length === 1 && selection.activeTiers[0] === 'fast';
  const rawConcurrency = Number(process.env.QA_CONCURRENCY || process.env.FAST_GATE_CONCURRENCY || 0);
  const concurrency =
    Number.isInteger(rawConcurrency) && rawConcurrency > 0
      ? rawConcurrency
      : Math.min(6, Math.max(2, availableParallelism() - 1));
  const result = spawnSync(
    process.execPath,
    ['--test', `--test-concurrency=${concurrency}`, `--test-reporter=${opts.reporter}`, ...files],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(isFastOnly ? { PLAYHUB_FAST_GATE: '1' } : {}),
      },
    }
  );
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[run-suite] 종료 코드 ${result.status} · ${secs}s`);
  process.exit(result.status ?? 1);
}

if (isMainModule()) {
  main();
}
