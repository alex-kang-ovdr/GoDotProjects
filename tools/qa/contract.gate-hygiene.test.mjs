import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'tools/qa/test-catalog.json');
const FAST_GATE_JSON_PATH = path.join(REPO_ROOT, 'tools/qa/fast-gate.json');
const RUN_SUITE_PATH = path.join(REPO_ROOT, 'tools/qa/run-suite.mjs');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function loadCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

function walkRepoTests(dir, excludeSet, rel = '', out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excludeSet.has(entry.name)) continue;
      walkRepoTests(
        path.join(dir, entry.name),
        excludeSet,
        rel ? `${rel}/${entry.name}` : entry.name,
        out
      );
    } else if (/\.test\.(mjs|cjs|js)$/.test(entry.name)) {
      out.push(rel ? `${rel}/${entry.name}` : entry.name);
    }
  }
  return out;
}

export function validateQuarantineMap(quarantine, catalogPaths, nowMs = Date.now()) {
  const errors = [];
  if (!quarantine || typeof quarantine !== 'object' || Array.isArray(quarantine)) {
    return ['quarantine must be a plain object'];
  }
  for (const [testPath, meta] of Object.entries(quarantine)) {
    if (catalogPaths && !catalogPaths.has(testPath)) {
      errors.push(`${testPath}: quarantine entry is not registered in test-catalog.json`);
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      errors.push(`${testPath}: quarantine value must be { reason, owner, expiresAt } object`);
      continue;
    }
    if (typeof meta.reason !== 'string' || !meta.reason.trim()) {
      errors.push(`${testPath}: quarantine.reason must be a non-empty string`);
    }
    if (typeof meta.owner !== 'string' || !meta.owner.trim()) {
      errors.push(`${testPath}: quarantine.owner must be a non-empty string`);
    }
    if (typeof meta.expiresAt !== 'string' || !meta.expiresAt.trim()) {
      errors.push(`${testPath}: quarantine.expiresAt must be an ISO-8601 date string`);
      continue;
    }
    const expiresMs = Date.parse(meta.expiresAt);
    if (Number.isNaN(expiresMs)) {
      errors.push(`${testPath}: quarantine.expiresAt is not a valid date (${meta.expiresAt})`);
      continue;
    }
    if (expiresMs < nowMs) {
      errors.push(`${testPath}: quarantine expired at ${meta.expiresAt}`);
    }
    const anchorMs = meta.addedAt && !Number.isNaN(Date.parse(meta.addedAt)) ? Date.parse(meta.addedAt) : nowMs;
    if (expiresMs - anchorMs > SEVEN_DAYS_MS + 60_000) {
      errors.push(`${testPath}: quarantine TTL exceeds 7 days (${meta.expiresAt})`);
    }
  }
  return errors;
}

export function findUnescapedXcconfigUrls(content, fileName = '<inline>') {
  const findings = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#include')) continue;
    const eqIdx = raw.indexOf('=');
    if (eqIdx < 0) continue;
    const valuePart = raw.slice(eqIdx + 1);
    // In Xcode .xcconfig, an unescaped '//' starts a comment and silently truncates URLs.
    // Valid escaped URLs use forms like 'https:/$()/' or 'http:/$()/'.
    const match = valuePart.match(/\b(?:https?|wss?):\/\//i);
    if (match) {
      findings.push(`${fileName}:${i + 1} unescaped URL scheme "${match[0]}" in "${trimmed}"`);
    }
  }
  return findings;
}

test('TC-6.1: 100% of repository test files are registered in test-catalog.json with zero blind spots and zero ghosts', () => {
  const catalog = loadCatalog();
  const validTiers = new Set(catalog.tiers || []);
  const validSuites = new Set(catalog.suites || []);
  const validEnvs = new Set(catalog.envs || []);
  const excludeSet = new Set(
    catalog.excludeDirs || ['node_modules', 'fixtures', 'ported', 'references', 'Saved', 'dist', '.git', 'artifacts']
  );

  assert.equal(catalog.schemaVersion, 1);
  assert.ok(Array.isArray(catalog.tests) && catalog.tests.length > 0);
  assert.ok(Array.isArray(catalog.changedRules) && catalog.changedRules.length > 0);

  const catalogPaths = new Set();
  const duplicates = [];
  const schemaErrors = [];

  for (const entry of catalog.tests) {
    if (catalogPaths.has(entry.path)) duplicates.push(entry.path);
    catalogPaths.add(entry.path);

    if (!validTiers.has(entry.tier)) {
      schemaErrors.push(`${entry.path}: invalid tier "${entry.tier}"`);
    }
    if (!Array.isArray(entry.suites) || entry.suites.length === 0) {
      schemaErrors.push(`${entry.path}: suites must be non-empty`);
    } else {
      for (const s of entry.suites) {
        if (!validSuites.has(s)) schemaErrors.push(`${entry.path}: invalid suite "${s}"`);
      }
    }
    if (!Array.isArray(entry.envs) || entry.envs.length === 0) {
      schemaErrors.push(`${entry.path}: envs must be non-empty`);
    } else {
      for (const e of entry.envs) {
        if (!validEnvs.has(e)) schemaErrors.push(`${entry.path}: invalid env "${e}"`);
      }
    }
  }

  assert.deepEqual(duplicates, [], `Duplicate catalog entries found: ${duplicates.join(', ')}`);
  assert.deepEqual(schemaErrors, [], `Catalog schema errors:\n${schemaErrors.join('\n')}`);

  const diskTests = walkRepoTests(REPO_ROOT, excludeSet).sort();
  const diskSet = new Set(diskTests);

  const unregistered = diskTests.filter((p) => !catalogPaths.has(p));
  const ghosts = [...catalogPaths].filter((p) => !diskSet.has(p)).sort();

  assert.deepEqual(
    unregistered,
    [],
    `Unregistered test files (blind spots = ${unregistered.length}):\n  - ${unregistered.join('\n  - ')}`
  );
  assert.deepEqual(
    ghosts,
    [],
    `Ghost test-catalog.json entries not found on disk (${ghosts.length}):\n  - ${ghosts.join('\n  - ')}`
  );
});

test('TC-6.2: Tier 1 fast tests never launch Chrome CDP or Playwright directly and exclude browser/godot/portable filenames', () => {
  const catalog = loadCatalog();
  const fastEntries = catalog.tests.filter((t) => t.tier === 'fast');
  assert.ok(fastEntries.length > 0, 'Expected fast tier entries');

  // Construct patterns without tripping self-check; also explicitly skip this contract test itself.
  const SELF_PATH = 'tools/qa/contract.gate-hygiene.test.mjs';
  const forbiddenLaunchPatterns = [
    { name: 'CDP --remote-debugging-port', re: new RegExp('--remote-' + 'debugging-port', 'i') },
    { name: 'launchCdpBrowser', re: new RegExp('\\blaunch' + 'CdpBrowser\\b') },
    { name: 'ESM playwright import', re: new RegExp('\\bfrom\\s+[\'"](?:@playwright/test|play' + 'wright)[\'"]') },
    { name: 'CJS playwright require', re: new RegExp('\\brequire\\(\\s*[\'"](?:@playwright/test|play' + 'wright)[\'"]') },
    { name: 'chromium.launch()', re: new RegExp('\\bchromium\\.' + 'launch\\s*\\(') },
  ];

  const badNames = [];
  const violations = [];

  for (const entry of fastEntries) {
    if (/(?:\.browser|\.godot|\.portable)\.test\.(?:mjs|cjs|js)$|\/portable\.[^/]+\.test\.(?:mjs|cjs|js)$/i.test(entry.path)) {
      badNames.push(entry.path);
    }
    if (entry.path === SELF_PATH) continue;
    const fullPath = path.join(REPO_ROOT, entry.path);
    if (!fs.existsSync(fullPath)) continue;
    const src = fs.readFileSync(fullPath, 'utf8');
    for (const rule of forbiddenLaunchPatterns) {
      if (rule.re.test(src)) {
        violations.push(`${entry.path}: matched forbidden Tier 1 browser pattern [${rule.name}]`);
      }
    }
  }

  assert.deepEqual(badNames, [], `Browser/Godot/Portable test filenames classified as fast: ${badNames.join(', ')}`);
  assert.deepEqual(
    violations,
    [],
    `Direct Chrome CDP / Playwright launch found in Tier 1 fast tests:\n  - ${violations.join('\n  - ')}`
  );
});

test('TC-6.3: quarantine entries follow { reason, owner, expiresAt } schema with max 7-day TTL and zero expired items', () => {
  const catalog = loadCatalog();
  const catalogPaths = new Set(catalog.tests.map((t) => t.path));
  const fastGateCfg = JSON.parse(fs.readFileSync(FAST_GATE_JSON_PATH, 'utf8'));

  assert.deepEqual(validateQuarantineMap(catalog.quarantine || {}, catalogPaths), []);
  assert.deepEqual(validateQuarantineMap(fastGateCfg.quarantine || {}, catalogPaths), []);

  // Verify validator logic catches malformed, expired, and >7-day entries
  const now = Date.parse('2026-11-22T12:00:00Z');
  const samplePath = 'tools/qa/contract.gate-hygiene.test.mjs';
  assert.equal(
    validateQuarantineMap(
      { [samplePath]: { reason: 'flaky timer', owner: 'PlayHub-Platform', expiresAt: '2026-11-27T12:00:00Z' } },
      catalogPaths,
      now
    ).length,
    0
  );
  assert.ok(
    validateQuarantineMap({ [samplePath]: 'legacy string' }, catalogPaths, now).length > 0,
    'Legacy string quarantine must be rejected'
  );
  assert.ok(
    validateQuarantineMap(
      { [samplePath]: { reason: 'expired', owner: 'PlayHub-Platform', expiresAt: '2026-11-21T12:00:00Z' } },
      catalogPaths,
      now
    ).some((msg) => msg.includes('expired')),
    'Expired quarantine must fail'
  );
  assert.ok(
    validateQuarantineMap(
      { [samplePath]: { reason: 'too long', owner: 'PlayHub-Platform', expiresAt: '2026-12-05T12:00:00Z' } },
      catalogPaths,
      now
    ).some((msg) => msg.includes('7 days')),
    'Quarantine exceeding 7 days must fail'
  );
});

test('TC-6.4: run-suite.mjs CLI supports --summary, --suite, --env, Korean aliases, OR/AND, auto-tier, and --dry-run', () => {
  const runCli = (...args) =>
    spawnSync(process.execPath, [RUN_SUITE_PATH, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

  // 1. --summary
  const summaryRes = runCli('--summary');
  assert.equal(summaryRes.status, 0, summaryRes.stderr);
  assert.match(summaryRes.stdout, /tiers\s*:\s*fast=\d+,\s*integration=\d+,\s*nightly=\d+/);
  assert.match(summaryRes.stdout, /suites:.*smoke=\d+.*hub=\d+.*forge=\d+/);
  assert.match(summaryRes.stdout, /envs\s*:\s*local=\d+,\s*dev=\d+,\s*live=\d+/);

  // 2. --suite smoke --list
  const smokeRes = runCli('--suite', 'smoke', '--list');
  assert.equal(smokeRes.status, 0, smokeRes.stderr);
  assert.match(smokeRes.stdout, /tools\/qa\/contract\.gate-hygiene\.test\.mjs/);
  assert.match(smokeRes.stdout, /hub\/tests\/smoke\.assets\.test\.mjs/);

  // 3. --suite 허브 --env live --list (Korean alias + env AND filter)
  const hubLiveRes = runCli('--suite', '허브', '--env', 'live', '--list', '--json');
  assert.equal(hubLiveRes.status, 0, hubLiveRes.stderr);
  const hubLive = JSON.parse(hubLiveRes.stdout);
  assert.ok(hubLive.count > 0);
  assert.ok(hubLive.files.includes('hub/tests/backend.http.test.mjs'));
  assert.equal(hubLive.files.includes('hub/tests/local-admin-login.test.mjs'), false, 'local-only test must be excluded from live');
  assert.equal(hubLive.files.includes('forge/Tests/release-manifest.test.cjs'), false, 'non-hub test must be excluded');

  // 4. OR (comma) vs AND (repeated --suite / --and)
  const orRes = JSON.parse(runCli('--suite', '허브,포지', '--list', '--json').stdout);
  const andRepRes = JSON.parse(runCli('--suite', '허브', '--suite', '유저', '--list', '--json').stdout);
  const andFlagRes = JSON.parse(runCli('--suite', '허브,유저', '--and', '--list', '--json').stdout);
  assert.ok(orRes.count > andRepRes.count, 'OR union must be larger than AND intersection');
  assert.deepEqual(andRepRes.files, andFlagRes.files, 'Repeated --suite and --and flag must produce identical intersection');

  // 5. Auto-all-tier for browser suite
  const browserRes = JSON.parse(runCli('--suite', '브라우저', '--list', '--json').stdout);
  assert.ok(browserRes.count > 0, 'Browser suite must auto-select all tiers');
  assert.ok(browserRes.files.includes('hub/tests/site.browser.test.mjs'));

  // 6. --dry-run
  const dryRes = runCli('--suite', '스모크', '--dry-run');
  assert.equal(dryRes.status, 0, dryRes.stderr);
  assert.match(dryRes.stdout, /DRY-RUN/);
});

test('TC-6.5: iOS xcconfig has zero unescaped // URLs and AvatarAndProfileViews.swift guards age-gate reset with #if DEBUG', () => {
  // 5a. Scan all ios/Config/*.xcconfig
  const xcconfigDir = path.join(REPO_ROOT, 'ios/Config');
  const xcconfigFiles = fs
    .readdirSync(xcconfigDir)
    .filter((name) => name.endsWith('.xcconfig'))
    .sort();
  assert.ok(xcconfigFiles.length >= 5, 'Expected iOS xcconfig files in ios/Config');

  const urlViolations = [];
  for (const name of xcconfigFiles) {
    const content = fs.readFileSync(path.join(xcconfigDir, name), 'utf8');
    urlViolations.push(...findUnescapedXcconfigUrls(content, `ios/Config/${name}`));
  }
  assert.deepEqual(
    urlViolations,
    [],
    `Unescaped '//' URLs found in iOS xcconfig (Xcode treats '//' as comments):\n  - ${urlViolations.join('\n  - ')}`
  );

  // Confirm detector actually catches an unescaped URL while allowing /$()/ escaping
  assert.equal(
    findUnescapedXcconfigUrls('PLAYHUB_DEFAULT_HUB_URL = https://broken.example.com').length,
    1
  );
  assert.equal(
    findUnescapedXcconfigUrls('PLAYHUB_DEFAULT_HUB_URL = https:/$()/escaped.example.com').length,
    0
  );

  // Confirm Live & Release xcconfig never enable DEBUG or farm selector
  for (const prodCfg of ['Live.xcconfig', 'Release.xcconfig']) {
    const text = fs.readFileSync(path.join(xcconfigDir, prodCfg), 'utf8');
    assert.match(text, /^PLAYHUB_ALLOW_FARM_SELECTOR\s*=\s*NO\b/m, `${prodCfg} must lock off farm selector`);
    const condMatch = text.match(/^SWIFT_ACTIVE_COMPILATION_CONDITIONS\s*=\s*(.+)$/m);
    assert.ok(condMatch, `${prodCfg} must declare SWIFT_ACTIVE_COMPILATION_CONDITIONS`);
    assert.equal(/\bDEBUG\b/.test(condMatch[1]), false, `${prodCfg} must never define DEBUG`);
  }

  // 5b. Verify AvatarAndProfileViews.swift wraps age-gate reset strictly inside #if DEBUG ... #endif
  const swiftPath = path.join(REPO_ROOT, 'ios/App/UI/AvatarAndProfileViews.swift');
  const swiftLines = fs.readFileSync(swiftPath, 'utf8').split(/\r?\n/);

  const condStack = [];
  const inDebugBranch = () => condStack.some((frame) => frame.isDebug && !frame.inElse);
  const sensitiveMarkers = [
    '연령 게이트 다시 테스트',
    'ageGateCompleted = false',
    'removeObject(forKey: "playhub_age_tier")',
  ];
  const matchedMarkers = new Set();
  const unguardedHits = [];

  for (let i = 0; i < swiftLines.length; i += 1) {
    const trimmed = swiftLines[i].trim();
    if (/^#if\b/.test(trimmed)) {
      condStack.push({ isDebug: /^#if\s+DEBUG\b/.test(trimmed), inElse: false });
    } else if (/^#else\b/.test(trimmed) || /^#elseif\b/.test(trimmed)) {
      const top = condStack.at(-1);
      if (top) {
        top.inElse = true;
        if (/^#elseif\s+DEBUG\b/.test(trimmed)) {
          top.isDebug = true;
          top.inElse = false;
        }
      }
    } else if (/^#endif\b/.test(trimmed)) {
      condStack.pop();
    }

    for (const marker of sensitiveMarkers) {
      if (swiftLines[i].includes(marker)) {
        matchedMarkers.add(marker);
        if (!inDebugBranch()) {
          unguardedHits.push(`AvatarAndProfileViews.swift:${i + 1} "${marker}" is outside #if DEBUG`);
        }
      }
    }
  }

  assert.equal(condStack.length, 0, 'Unbalanced #if/#endif blocks in AvatarAndProfileViews.swift');
  assert.equal(
    matchedMarkers.size,
    sensitiveMarkers.length,
    `Expected all age-gate reset markers to exist in AvatarAndProfileViews.swift (missing: ${sensitiveMarkers.filter((m) => !matchedMarkers.has(m)).join(', ')})`
  );
  assert.deepEqual(unguardedHits, [], `Age-gate reset code not guarded by #if DEBUG:\n  - ${unguardedHits.join('\n  - ')}`);
});
