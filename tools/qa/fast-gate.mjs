#!/usr/bin/env node
// Tier 1 Fast QA 게이트 러너.
// 사용법: node tools/qa/fast-gate.mjs [--list] [--include-quarantine] [--only-quarantine] [--reporter <dot|spec|tap>]
// 정본 카탈로그(tools/qa/test-catalog.json)에서 tier === 'fast' 항목을 우선 읽어 node --test로 실행한다.
// 카탈로그가 없을 때만 레거시 tools/qa/fast-gate.json의 include/exclude glob으로 폴백한다.
// quarantine 항목은 기본 제외하고 목록만 출력한다(삭제 금지, 수정 후 등록 해제).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const has = (flag) => process.argv.includes(flag);

const [major] = process.versions.node.split('.').map(Number);
if (major < 24) {
  console.error(
    `[fast-gate] Node.js 24 이상이 필요합니다(현재 ${process.version}). artifacts/local-runtime/node24/node.exe 또는 .nvmrc 버전을 사용하세요.`
  );
  process.exit(2);
}

function getReporter() {
  const idx = process.argv.indexOf('--reporter');
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith('--reporter='));
  if (eq) return eq.slice('--reporter='.length);
  return process.env.FAST_GATE_REPORTER || 'dot';
}

function formatQuarantine(meta) {
  if (!meta) return '';
  if (typeof meta === 'string') return meta;
  const parts = [];
  if (meta.reason) parts.push(meta.reason);
  if (meta.owner) parts.push(`담당: ${meta.owner}`);
  if (meta.expiresAt) parts.push(`만료: ${meta.expiresAt}`);
  return parts.join(' · ');
}

function loadFromCatalog(catalogPath) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const fastEntries = (catalog.tests || []).filter((t) => t.tier === 'fast');
  const all = [...new Set(fastEntries.map((t) => t.path))].sort();
  const quarantine = catalog.quarantine || {};
  return { all, quarantine, source: 'tools/qa/test-catalog.json' };
}

function loadFromLegacyConfig(configPath) {
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
  const SPECIAL = /[.+^${}()|[\]\\]/g;
  const globToRe = (g) =>
    new RegExp(
      '^' +
        g
          .replace(SPECIAL, (c) => '\\' + c)
          .replace(/\*\*\//g, '\u0001')
          .replace(/\*\*/g, '\u0000')
          .replace(/\*/g, '[^/]*')
          .replace(/\u0001/g, '(?:.*/)?')
          .replace(/\u0000/g, '.*') +
        '$'
    );

  const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', '.venv-inference', 'Saved', 'dist', 'artifacts']);
  function walk(dir, out) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out);
      } else if (/\.test\.(mjs|cjs|js)$/.test(e.name)) {
        out.push(relative(root, join(dir, e.name)).split(sep).join('/'));
      }
    }
  }

  function expand(pattern) {
    if (!/[*]/.test(pattern)) {
      try {
        statSync(join(root, pattern));
        return [pattern];
      } catch {
        console.warn(`[fast-gate] 경고: 파일 없음 ${pattern}`);
        return [];
      }
    }
    const base = pattern.split('/').filter((p) => !p.includes('*'));
    const stop = pattern.split('/').findIndex((p) => p.includes('*'));
    const dir = join(root, ...base.slice(0, stop));
    const found = [];
    walk(dir, found);
    const re = globToRe(pattern);
    return found.filter((f) => re.test(f));
  }

  const excludes = (cfg.exclude || []).map(globToRe);
  const quarantine = cfg.quarantine || {};
  const all = [...new Set((cfg.include || []).flatMap(expand))]
    .filter((f) => !excludes.some((re) => re.test(f)))
    .sort();
  return { all, quarantine, source: 'tools/qa/fast-gate.json' };
}

const catalogPath = join(root, 'tools/qa/test-catalog.json');
const legacyConfigPath = join(root, 'tools/qa/fast-gate.json');
const { all, quarantine, source } = existsSync(catalogPath)
  ? loadFromCatalog(catalogPath)
  : loadFromLegacyConfig(legacyConfigPath);

let files;
if (has('--only-quarantine')) files = all.filter((f) => quarantine[f]);
else if (has('--include-quarantine')) files = all;
else files = all.filter((f) => !quarantine[f]);

const quarantined = Object.keys(quarantine);
console.log(`[fast-gate] 대상 ${files.length}개 / 격리(quarantine) ${quarantined.length}개 (source: ${source})`);
for (const f of quarantined) console.log(`  ⚠ QUARANTINE ${f} — ${formatQuarantine(quarantine[f])}`);
if (has('--list')) {
  for (const f of files) console.log(`  ${f}`);
  process.exit(0);
}
if (!files.length) {
  console.error('[fast-gate] 실행할 테스트가 없습니다.');
  process.exit(1);
}

const started = Date.now();
const reporter = getReporter();
const rawConcurrency = Number(process.env.FAST_GATE_CONCURRENCY || process.env.QA_CONCURRENCY || 0);
const concurrency =
  Number.isInteger(rawConcurrency) && rawConcurrency > 0
    ? rawConcurrency
    : Math.min(6, Math.max(2, availableParallelism() - 1));
const result = spawnSync(
  process.execPath,
  ['--test', `--test-concurrency=${concurrency}`, `--test-reporter=${reporter}`, ...files],
  {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, PLAYHUB_FAST_GATE: '1' },
  }
);
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`[fast-gate] 종료 코드 ${result.status} · ${secs}s`);
process.exit(result.status ?? 1);
