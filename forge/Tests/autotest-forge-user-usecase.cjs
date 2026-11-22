'use strict';

/**
 * PlayForge User Use-Case Scenario Comprehensive Verification Suite (UC-01 ~ UC-10)
 *
 * Evaluates 4 quality axes across real user journeys:
 *   - Functionality (미구현 / 미동작 / 계약 불일치)
 *   - Performance   (응답시간 P50/P95/Max, 로딩시간, WASM 부팅, FPS/프레임타임, 동시 부하)
 *   - Stability     (충돌·예외·보안 경계·리비전 락·메모리·Godot 헤드리스 임포트/부팅)
 *   - Usability     (UX 결함, 모바일 레이아웃, 오류 메시지, 검색/필터/삭제/안내 부재 등)
 *
 * Usage:
 *   node forge/Tests/autotest-forge-user-usecase.cjs [--skip-godot] [--skip-wasm] [--out=<dir>]
 */

const { spawn, execSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const forgeRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(forgeRoot, '..');

// Worktree node_modules fallback
const fallbackNodeModules = process.env.PLAYFORGE_NODE_MODULES_FALLBACK || 'D:\\Github\\GoDotProjects-worktrees\\PlayHub-Platform\\forge\\node_modules';
if (!fs.existsSync(path.join(forgeRoot, 'node_modules', 'yjs')) && fs.existsSync(fallbackNodeModules)) {
  process.env.NODE_PATH = process.env.NODE_PATH
    ? `${process.env.NODE_PATH}${path.delimiter}${fallbackNodeModules}`
    : fallbackNodeModules;
  Module._initPaths();
}

const { createServer } = require(path.join(forgeRoot, 'server.cjs'));
const { loadGameTemplates } = require(path.join(forgeRoot, 'Tools', 'template-catalog.cjs'));
const WebSocket = require('ws');

const VENDOR_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

function parseArgs(argv) {
  const opts = {
    skipGodot: false,
    skipWasm: false,
    godot: process.env.GODOT_EDITOR || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64.exe',
    vendorFallback: process.env.PLAYFORGE_VENDOR_FALLBACK || 'D:\\Github\\GoDotProjects-worktrees\\PlayHub-Platform\\forge\\OfficialGodot\\vendor',
    out: path.join(repoRoot, 'artifacts', 'forge-usecase-qa'),
  };
  for (const arg of argv) {
    if (arg === '--skip-godot') opts.skipGodot = true;
    else if (arg === '--skip-wasm') opts.skipWasm = true;
    else if (arg.startsWith('--godot=')) opts.godot = arg.slice(8);
    else if (arg.startsWith('--out=')) opts.out = path.resolve(arg.slice(6));
  }
  return opts;
}

function round(n, d = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function pct(values, p) {
  const s = (values || []).filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

function resolvePlaywright() {
  for (const dir of [path.join(forgeRoot, 'node_modules'), fallbackNodeModules]) {
    for (const pkg of ['@playwright/test', 'playwright', 'playwright-core']) {
      try { return require(require.resolve(pkg, { paths: [dir] })); } catch {}
    }
  }
  throw new Error('Playwright not found');
}

async function timedFetch(url, init) {
  const t0 = performance.now();
  const res = await fetch(url, init);
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = round(performance.now() - t0, 2);
  let json = null;
  try { json = JSON.parse(buf.toString('utf8')); } catch {}
  return { status: res.status, ok: res.ok, ms, bytes: buf.length, headers: Object.fromEntries(res.headers.entries()), json, text: buf.toString('utf8'), buf };
}

async function startForgeServer(tempRoot, extraOpts = {}) {
  const dir = path.join(tempRoot, 'srv-' + crypto.randomBytes(3).toString('hex'));
  const workspace = path.join(dir, 'workspace');
  const platformWorkspace = path.join(dir, 'platform');
  const buildDirectory = path.join(dir, 'builds');
  const cacheDir = path.join(dir, 'cache');
  fs.mkdirSync(workspace, { recursive: true });
  fs.mkdirSync(platformWorkspace, { recursive: true });
  fs.mkdirSync(buildDirectory, { recursive: true });
  const server = createServer({
    workspace,
    platformWorkspace,
    buildDirectory,
    hubAuth: false,
    httpCache: { enabled: true, cacheDir },
    ...extraOpts,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return { server, port, baseUrl: `http://127.0.0.1:${port}`, wsBase: `ws://127.0.0.1:${port}` };
}

function runCmd(cmd, args, { cwd = forgeRoot, timeoutMs = 60000, env = process.env } = {}) {
  return new Promise(resolve => {
    const t0 = performance.now();
    const child = spawn(cmd, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', c => { stdout += c.toString('utf8'); });
    child.stderr.on('data', c => { stderr += c.toString('utf8'); });
    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch {} }, timeoutMs);
    child.on('error', err => { clearTimeout(timer); resolve({ code: -1, ms: round(performance.now() - t0), stdout, stderr: stderr + err.message, timedOut }); });
    child.on('close', code => { clearTimeout(timer); resolve({ code, ms: round(performance.now() - t0), stdout, stderr, timedOut }); });
  });
}

function resolveVendorDir(fallback) {
  const local = path.join(forgeRoot, 'OfficialGodot', 'vendor');
  if (fs.existsSync(path.join(local, 'godot.editor.wasm'))) return { dir: local, fallbackUsed: false };
  if (fallback && fs.existsSync(path.join(fallback, 'godot.editor.wasm'))) return { dir: fallback, fallbackUsed: true };
  return { dir: null, fallbackUsed: false };
}

async function startVendorStreamingProxy(targetPort, vendorDir) {
  const proxy = http.createServer((req, res) => {
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
    if (vendorDir && pathname.startsWith('/OfficialGodot/vendor/')) {
      const rel = pathname.slice('/OfficialGodot/vendor/'.length);
      const filePath = path.resolve(vendorDir, rel);
      if (filePath.startsWith(path.resolve(vendorDir) + path.sep) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
          'Content-Type': VENDOR_MIME[ext] || 'application/octet-stream',
          'Content-Length': stat.size,
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cache-Control': 'public, max-age=86400',
        });
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(filePath).pipe(res);
        return;
      }
    }
    const fwdHeaders = { ...req.headers, host: `127.0.0.1:${targetPort}` };
    if (fwdHeaders.origin) fwdHeaders.origin = `http://127.0.0.1:${targetPort}`;
    if (fwdHeaders.referer) fwdHeaders.referer = fwdHeaders.referer.replace(/http:\/\/127\.0\.0\.1:\d+/, `http://127.0.0.1:${targetPort}`);
    const up = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: fwdHeaders,
    }, upRes => {
      res.writeHead(upRes.statusCode || 502, upRes.headers);
      upRes.pipe(res);
    });
    up.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end(); } });
    req.pipe(up);
  });
  await new Promise((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen(0, '127.0.0.1', resolve);
  });
  return { proxy, baseUrl: `http://127.0.0.1:${proxy.address().port}` };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tStart = performance.now();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-uc-qa-'));
  const findings = []; // { id, severity: P0|P1|P2|P3, category: functionality|performance|stability|usability, useCase, title, detail }
  const cases = [];

  const addFinding = (severity, category, useCase, title, detail) => {
    findings.push({ id: `F-${String(findings.length + 1).padStart(2, '0')}`, severity, category, useCase, title, detail });
  };
  const recordCase = (id, title, axis, status, metrics, notes = []) => {
    cases.push({ id, title, axis, status, metrics, notes });
    console.error(`[${status}] ${id} ${title}${status !== 'PASS' ? ' :: ' + JSON.stringify(metrics) : ''}`);
  };

  let srv = null;
  let browser = null;
  const vendorInfo = resolveVendorDir(opts.vendorFallback);

  try {
    srv = await startForgeServer(tempRoot);
    const { baseUrl, wsBase } = srv;
    const { chromium } = resolvePlaywright();
    browser = await chromium.launch({
      headless: true,
      channel: 'chrome',
      args: ['--enable-unsafe-swiftshader', '--enable-precise-memory-info'],
    });

    // =========================================================================
    // UC-01: 첫 방문 · 런처 진입 · 템플릿 카탈로그 · 모바일 레이아웃 · COOP/COEP
    // =========================================================================
    {
      const health = await timedFetch(`${baseUrl}/api/health`);
      const tplApi = await timedFetch(`${baseUrl}/api/platform/templates`);
      const templates = tplApi.json?.templates || [];
      const localVendorExists = !vendorInfo.fallbackUsed && Boolean(vendorInfo.dir);

      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      const pageErrors = [];
      page.on('pageerror', e => pageErrors.push(e.message));

      // 1a. First-visit check (0 projects): check if launcher skips the template gallery!
      const tFirst0 = performance.now();
      await page.goto(`${baseUrl}/OfficialGodot/`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      const firstVisitState = await page.evaluate(() => ({
        libraryHidden: Boolean(document.getElementById('library')?.hidden),
        workspaceVisible: !document.getElementById('workspace')?.hidden,
        url: location.href,
      }));
      if (firstVisitState.libraryHidden && firstVisitState.workspaceVisible) {
        addFinding('P1', 'usability', 'UC-01', '신규 사용자 첫 방문 시 18종 템플릿 갤러리를 건너뛰고 즉시 빈 3D(96MB WASM) 에디터로 진입',
          'platform.js:357에서 프로젝트 0개일 때 blank3d("나의 첫 번째 세계")를 자동 생성·오픈해 첫 방문자가 템플릿 갤러리와 제작과정 보기를 보지 못한 채 96MB WASM 로딩을 강제로 기다리게 됨.');
      }

      // 1b. Returning-user check (with seeded project so #library renders)
      await timedFetch(`${baseUrl}/api/platform/projects`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Seed Project', template: 'blank3d' }),
      });
      const tNav0 = performance.now();
      await page.goto(`${baseUrl}/OfficialGodot/`, { waitUntil: 'networkidle' });
      await page.locator('#templates .card').first().waitFor({ state: 'visible', timeout: 10000 });
      const desktopLoadMs = round(performance.now() - tNav0);

      const uiAudit = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#templates .card')];
        const hasSearch = Boolean(document.querySelector('input[type="search"], input[placeholder*="검색"], #templateSearch'));
        const hasCategoryFilter = Boolean(document.querySelector('[data-filter], .filter-tabs, .category-tabs'));
        const hasProjectDelete = Boolean(document.querySelector('#projects button[data-action="delete"], #projects .delete'));
        const overflowX = document.documentElement.scrollWidth > window.innerWidth + 1;
        return {
          cardCount: cards.length,
          crossOriginIsolated: Boolean(window.crossOriginIsolated),
          hasSearch,
          hasCategoryFilter,
          hasProjectDelete,
          overflowX,
          scrollHeight: document.documentElement.scrollHeight,
        };
      });

      // Mobile viewport check (390x844)
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(150);
      const mobileAudit = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        cardCount: document.querySelectorAll('#templates .card').length,
      }));
      await page.close();

      const vendorProbe = await timedFetch(`${baseUrl}/OfficialGodot/vendor/godot.editor.wasm`, { method: 'HEAD' });
      if (vendorProbe.status !== 200) {
        addFinding('P1', 'usability', 'UC-01', '워크트리 단독 실행 시 OfficialGodot/vendor WASM 바이너리 404',
          `HEAD /OfficialGodot/vendor/godot.editor.wasm -> ${vendorProbe.status}`);
      }
      if (!uiAudit.hasSearch || !uiAudit.hasCategoryFilter) {
        addFinding('P2', 'usability', 'UC-01', `템플릿 ${uiAudit.cardCount}종에 검색·카테고리(2D/3D/멀티/포팅) 필터 부재`,
          `런처(/OfficialGodot/)에 18종 템플릿 카드가 일렬로 나열되나 검색창·카테고리 필터·제작과정 보기 배지가 없어 원하는 템플릿 탐색이 불편함.`);
      }
      if (mobileAudit.overflowX) {
        addFinding('P2', 'usability', 'UC-01', '모바일 뷰포트(390px) 가로 오버플로우 발생',
          `scrollWidth=${mobileAudit.scrollWidth}px > innerWidth=${mobileAudit.innerWidth}px`);
      }
      if (tplApi.ms > 300) {
        addFinding('P2', 'performance', 'UC-01', '템플릿 카탈로그 API 응답 지연', `GET /api/platform/templates ${tplApi.ms}ms`);
      }

      const ok = health.status === 200 && tplApi.status === 200 && uiAudit.cardCount === templates.length && uiAudit.crossOriginIsolated && pageErrors.length === 0;
      recordCase('UC-01', '런처 진입 · 카탈로그 탐색 · COOP/COEP · 모바일 레이아웃', '기능/성능/편의성', ok ? 'PASS' : 'FAIL', {
        healthMs: health.ms,
        catalogApiMs: tplApi.ms,
        catalogKb: round(tplApi.bytes / 1024, 1),
        templateCount: templates.length,
        desktopLoadMs,
        crossOriginIsolated: uiAudit.crossOriginIsolated,
        mobileOverflowX: mobileAudit.overflowX,
        vendorWasmStatus: vendorProbe.status,
      }, pageErrors);
    }

    // =========================================================================
    // UC-02: 전체 18종 템플릿 생성 (ready / guided / showcase) 및 미구현 탐지
    // =========================================================================
    {
      const tplListRes = await timedFetch(`${baseUrl}/api/platform/templates`);
      const templates = tplListRes.json?.templates || [];
      const guidedSource = fs.readFileSync(path.join(forgeRoot, 'OfficialGodot', 'guided.js'), 'utf8');

      const readyResults = [];
      const guidedResults = [];
      const showcaseSupported = [];
      const showcaseMissing = [];
      const guidedNoCustomSteps = [];

      for (const tpl of templates) {
        const r = await timedFetch(`${baseUrl}/api/platform/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `Ready ${tpl.id}`, template: tpl.id, mode: 'ready' }),
        });
        readyResults.push({ id: tpl.id, status: r.status, ms: r.ms, files: r.json?.files?.length || 0, error: r.json?.error || null });

        if (tpl.id !== 'blank3d' && tpl.id !== 'playground3d') {
          const g = await timedFetch(`${baseUrl}/api/platform/projects`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: `Guided ${tpl.id}`, template: tpl.id, mode: 'guided' }),
          });
          guidedResults.push({ id: tpl.id, status: g.status, ms: g.ms, error: g.json?.error || null });
          if (tpl.showcase === true) showcaseSupported.push(tpl.id);
          else showcaseMissing.push(tpl.id);
          // Check if guided.js has dedicated walkthrough copy or relies on generic fallback
          if (!guidedSource.includes(`"${tpl.id}"`) && !guidedSource.includes(`'${tpl.id}'`)) {
            guidedNoCustomSteps.push(tpl.id);
          }
        }
      }

      // Test showcase mode rejection on a template without showcase.json
      const nonShowcaseId = showcaseMissing[0];
      let nonShowcaseStatus = null;
      if (nonShowcaseId) {
        const badShowcase = await timedFetch(`${baseUrl}/api/platform/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Bad Showcase', template: nonShowcaseId, mode: 'showcase' }),
        });
        nonShowcaseStatus = badShowcase.status;
      }

      const readyFailed = readyResults.filter(x => x.status !== 201);
      const guidedFailed = guidedResults.filter(x => x.status !== 201);
      const createTimes = readyResults.map(x => x.ms);

      if (readyFailed.length > 0) {
        addFinding('P0', 'functionality', 'UC-02', `ready 모드 프로젝트 생성 실패 ${readyFailed.length}건`,
          readyFailed.map(x => `${x.id}(${x.status}: ${x.error})`).join(', '));
      }
      if (guidedFailed.length > 0) {
        addFinding('P1', 'functionality', 'UC-02', `guided 모드 프로젝트 생성 실패 ${guidedFailed.length}건`,
          guidedFailed.map(x => `${x.id}(${x.status}: ${x.error})`).join(', '));
      }
      if (showcaseMissing.length > 0) {
        addFinding('P2', 'functionality', 'UC-02', `제작과정 보기(showcase.json) 미구현 템플릿 ${showcaseMissing.length}/${showcaseSupported.length + showcaseMissing.length}종`,
          `지원(${showcaseSupported.length}): ${showcaseSupported.join(', ')} / 미지원(${showcaseMissing.length}): ${showcaseMissing.join(', ')}`);
      }
      // Check blocking window.prompt usage in platform.js (allow only if gated behind native-prompt check + inline modal)
      const platformJs = fs.readFileSync(path.join(forgeRoot, 'OfficialGodot', 'platform.js'), 'utf8');
      const hasInlineModal = platformJs.includes('createProjectModal') && platformJs.includes('showModal');
      if (/\bprompt\(/.test(platformJs) && !hasInlineModal) {
        addFinding('P2', 'usability', 'UC-02', '프로젝트 생성 시 브라우저 블로킹 window.prompt() 사용',
          'platform.js에서 네이티브 prompt()를 사용해 모바일·임베디드 웹뷰 UX가 떨어지고 자동화/접근성이 취약함. 인라인 모달 다이얼로그 권장.');
      }

      const maxCreate = readyResults.reduce((a, b) => (b.ms > a.ms ? b : a), { id: '-', ms: 0 });
      if (maxCreate.ms > 400) {
        addFinding('P2', 'performance', 'UC-02', `대형 템플릿 생성 지연 (${maxCreate.id}: ${maxCreate.ms}ms)`,
          `전체 생성 P50=${pct(createTimes, 50)}ms, P95=${pct(createTimes, 95)}ms, Max=${maxCreate.ms}ms (${maxCreate.id}, ${maxCreate.files}개 파일)`);
      }

      recordCase('UC-02', '전체 18종 템플릿 생성 (ready/guided/showcase) 전수 검증', '기능/성능/편의성',
        readyFailed.length === 0 && guidedFailed.length === 0 ? 'PASS' : 'FAIL', {
          readyPass: `${readyResults.length - readyFailed.length}/${readyResults.length}`,
          guidedPass: `${guidedResults.length - guidedFailed.length}/${guidedResults.length}`,
          showcaseSupportedCount: showcaseSupported.length,
          showcaseMissingCount: showcaseMissing.length,
          createP50Ms: pct(createTimes, 50),
          createP95Ms: pct(createTimes, 95),
          slowestTemplate: `${maxCreate.id} (${maxCreate.ms}ms, ${maxCreate.files} files)`,
          nonShowcaseModeStatus: nonShowcaseStatus,
        });
    }

    // =========================================================================
    // UC-03: 프로젝트 편집 · 저장 · 동시편집 충돌(409) · 버전 이력 · 복원 · 삭제 확인
    // =========================================================================
    {
      const created = await timedFetch(`${baseUrl}/api/platform/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Edit Lifecycle QA', template: 'tappy-chicken', mode: 'ready' }),
      });
      const pid = created.json.project.id;
      const rev1 = created.json.revision;
      const files1 = created.json.files;

      // Save valid edit (rev 1 -> rev 2)
      const modifiedFiles = files1.map(f => f.path === 'project.godot' ? { ...f, content: f.content + '\n; uc03-edit\n' } : f);
      const saveOk = await timedFetch(`${baseUrl}/api/platform/projects/${pid}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseRevision: rev1, files: modifiedFiles }),
      });

      // Stale revision conflict check (expect 409)
      const saveConflict = await timedFetch(`${baseUrl}/api/platform/projects/${pid}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseRevision: rev1, files: modifiedFiles }),
      });

      // History & restore check (restore requires baseRevision)
      const historyRes = await timedFetch(`${baseUrl}/api/platform/projects/${pid}/history`);
      const restoreRes = await timedFetch(`${baseUrl}/api/platform/projects/${pid}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ revision: rev1, baseRevision: saveOk.json?.revision }),
      });

      // Rename (PATCH) & Delete (DELETE) check
      const renameRes = await timedFetch(`${baseUrl}/api/platform/projects/${pid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed Lifecycle QA' }),
      });
      const deleteRes = await timedFetch(`${baseUrl}/api/platform/projects/${pid}`, { method: 'DELETE' });
      const afterDeleteRes = await timedFetch(`${baseUrl}/api/platform/projects/${pid}`);
      const missingRes = await timedFetch(`${baseUrl}/api/platform/projects/nonexistent-id-999`);

      if (missingRes.status !== 404) {
        addFinding('P2', 'functionality', 'UC-03', `존재하지 않는/비UUID 프로젝트 ID 조회 시 404 대신 HTTP ${missingRes.status} 반환`,
          `GET /api/platform/projects/nonexistent-id-999 -> ${missingRes.status} ("Method not supported"). platform-api.cjs의 UUID 정규식 미매칭 시 405로 폴스루됨.`);
      }
      if (renameRes.status !== 200 || renameRes.json?.project?.name !== 'Renamed Lifecycle QA') {
        addFinding('P2', 'functionality', 'UC-03', `프로젝트 이름 변경(PATCH) 실패 (HTTP ${renameRes.status})`, JSON.stringify(renameRes.json || renameRes.text));
      }
      if (deleteRes.status !== 200 || afterDeleteRes.status !== 404) {
        addFinding('P2', 'usability', 'UC-03', '프로젝트 삭제(DELETE /api/platform/projects/:id) 미구현 또는 미동작',
          `DELETE 응답=${deleteRes.status}, 삭제 후 조회=${afterDeleteRes.status}`);
      }
      if (restoreRes.status !== 200 && restoreRes.status !== 201) {
        addFinding('P1', 'functionality', 'UC-03', `버전 복원(restore) API 실패 (HTTP ${restoreRes.status})`,
          JSON.stringify(restoreRes.json || restoreRes.text).slice(0, 200));
      }

      const ok = saveOk.status === 200 && saveOk.json?.revision === 2 && saveConflict.status === 409 && historyRes.status === 200 && restoreRes.status === 200 && renameRes.status === 200 && deleteRes.status === 200 && afterDeleteRes.status === 404 && missingRes.status === 404;
      recordCase('UC-03', '프로젝트 저장 · 리비전 충돌(409) · 이력 · 복원 · 이름변경 · 삭제', '기능/안정성/편의성', ok ? 'PASS' : 'FAIL', {
        saveMs: saveOk.ms,
        conflictStatus: saveConflict.status,
        historyCount: historyRes.json?.history?.length ?? historyRes.json?.revisions?.length ?? null,
        restoreStatus: restoreRes.status,
        renameStatus: renameRes.status,
        deleteStatus: deleteRes.status,
        afterDeleteStatus: afterDeleteRes.status,
        missing404Status: missingRes.status,
      });
    }

    // =========================================================================
    // UC-04: 실제 Godot 4.7.2 Web WASM 에디터 부팅 & 제작과정 보기(Showcase) E2E
    // =========================================================================
    if (!opts.skipWasm && vendorInfo.dir) {
      let wasmProxy = null;
      let page = null;
      try {
        wasmProxy = vendorInfo.fallbackUsed ? await startVendorStreamingProxy(srv.port, vendorInfo.dir) : null;
        const wasmBase = wasmProxy ? wasmProxy.baseUrl : baseUrl;
        page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');

        const consoleErrors = [];
        let wasmTransferMs = null;
        let wasmBytes = 0;
        const reqTimes = new Map();
        const apiMsList = [];

        page.on('request', r => reqTimes.set(r, performance.now()));
        page.on('response', r => {
          const t0 = reqTimes.get(r);
          const pn = new URL(r.url()).pathname;
          if (t0 !== undefined && pn.startsWith('/api/')) apiMsList.push(performance.now() - t0);
          if (pn.endsWith('/godot.editor.wasm') && t0 !== undefined) {
            wasmTransferMs = round(performance.now() - t0);
            wasmBytes = Number(r.headers()['content-length'] || 0);
          }
        });
        page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
        page.on('console', m => {
          if (/SCRIPT ERROR:|Parse Error|Invalid call|Invalid access|Failed to save IDB/i.test(m.text())) {
            consoleErrors.push(m.text());
          }
        });
        await page.addInitScript(() => { window.prompt = () => 'UC04 WASM Showcase'; });

        await page.goto(`${wasmBase}/OfficialGodot/`, { waitUntil: 'domcontentloaded' });
        const cardBtn = page.locator('#templates .card', { has: page.locator('strong', { hasText: /^Tappy Chicken$/ }) }).first();
        await cardBtn.waitFor({ state: 'visible', timeout: 15000 });
        await cardBtn.click();
        const watchBtn = page.getByRole('button', { name: '만드는 과정 보기' });
        await watchBtn.waitFor({ state: 'visible', timeout: 10000 });

        const tBoot0 = performance.now();
        await watchBtn.click();
        await page.waitForFunction(() => new URL(location.href).searchParams.get('project'), undefined, { timeout: 20000 });
        const projectId = new URL(page.url()).searchParams.get('project');

        const editor = page.frames().find(f => f.url().includes('/editor.html') && f.url().includes(projectId))
          || await page.waitForEvent('framenavigated', {
            predicate: f => f !== page.mainFrame() && f.url().includes(projectId),
            timeout: 30000,
          });

        const loadingOverlaySeen = await editor.locator('#editor-loading').isVisible().catch(() => false);

        await editor.waitForFunction(() => window.__playforgeShowcaseState?.ready === true, undefined, { timeout: 120000 });
        const wasmBootReadyMs = round(performance.now() - tBoot0);

        await page.evaluate(() => {
          window.__ucFrames = [];
          window.__ucRaf = true;
          let prev = performance.now();
          function step(now) {
            if (!window.__ucRaf) return;
            const dt = now - prev; prev = now;
            if (dt > 0 && dt < 5000) window.__ucFrames.push(dt);
            requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });

        await editor.waitForFunction(() => {
          const s = window.__playforgeShowcaseState;
          return s?.ready && s.playing && s.time > 0.5;
        }, undefined, { timeout: 60000 });

        const rolesVisible = await page.waitForFunction(() => {
          const iframe = document.getElementById('editor');
          const s = iframe?.contentWindow?.__playforgeShowcaseState;
          return s?.roles?.length === 4 && document.querySelectorAll('.peer-cursor.showcase-cursor[data-showcase-role]').length >= 4;
        }, undefined, { timeout: 25000 }).then(() => true).catch(() => false);

        const tPlay0 = performance.now();
        await editor.waitForFunction(() => {
          const s = window.__playforgeShowcaseState;
          return s?.ready && !s.playing && s.duration > 0 && Math.abs(s.time - s.duration) < 0.01;
        }, undefined, { timeout: 120000 });
        const replayWallMs = round(performance.now() - tPlay0);

        const frameDeltas = await page.evaluate(() => { window.__ucRaf = false; return window.__ucFrames || []; });
        const perfMetrics = await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
        const mMap = Object.fromEntries((perfMetrics.metrics || []).map(x => [x.name, x.value]));
        const jsHeapMb = round((mMap.JSHeapUsedSize || 0) / (1024 * 1024), 1);
        const afterProj = await timedFetch(`${baseUrl}/api/platform/projects/${projectId}`);
        const revUnchanged = afterProj.json?.revision === 1;

        const fP50 = round(pct(frameDeltas, 50), 2);
        const fP95 = round(pct(frameDeltas, 95), 2);
        const fpsAvg = frameDeltas.length ? round(1000 / (frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length), 1) : null;

        if (wasmBootReadyMs > 15000) {
          addFinding('P2', 'performance', 'UC-04', `웹 Godot WASM 초기 부팅 시간 체감 지연 (${round(wasmBootReadyMs / 1000, 1)}초)`,
            `96MB WASM 로드+에디터 초기화에 ${wasmBootReadyMs}ms 소요 (로컬 루프백 기준, 외부망에서는 더 길어짐). 브로틀리 사전압축·CDN 캐시·서비스워커 프리페치 중요.`);
        }
        if (fP95 && fP95 > 50) {
          addFinding('P2', 'performance', 'UC-04', `웹 리플레이 프레임 P95 스파이크 (${fP95}ms)`,
            `평균 FPS=${fpsAvg}, P50=${fP50}ms, P95=${fP95}ms (소프트웨어 WebGL SwiftShader 헤드리스 환경 포함)`);
        }

        const ok = consoleErrors.length === 0 && rolesVisible && revUnchanged;
        recordCase('UC-04', '실제 Godot 4.7.2 Web WASM 부팅 & 제작과정 보기(tappy-chicken) E2E', '기능/성능/메모리/안정성', ok ? 'PASS' : 'FAIL', {
          loadingOverlaySeen,
          wasmTransferMs,
          wasmMb: wasmBytes ? round(wasmBytes / (1024 * 1024), 1) : null,
          wasmBootReadyMs,
          replayWallMs,
          rolesVisible,
          revUnchanged,
          fpsAvg,
          frameP50Ms: fP50,
          frameP95Ms: fP95,
          jsHeapMb,
          apiP95Ms: round(pct(apiMsList, 95), 1),
          consoleErrors: consoleErrors.length,
        }, consoleErrors);
      } catch (err) {
        addFinding('P1', 'stability', 'UC-04', '실제 Godot 4.7.2 Web WASM E2E 실행 중 예외/크래시', err.message);
        recordCase('UC-04', '실제 Godot 4.7.2 Web WASM 부팅 & 제작과정 보기(tappy-chicken) E2E', '기능/성능/메모리/안정성', 'FAIL', { error: err.message });
      } finally {
        if (page) await page.close().catch(() => {});
        if (wasmProxy?.proxy) {
          wasmProxy.proxy.closeAllConnections?.();
          await new Promise(resolve => wasmProxy.proxy.close(resolve));
        }
      }
    } else {
      recordCase('UC-04', '실제 Godot 4.7.2 Web WASM 부팅 & 제작과정 보기 E2E', '기능/성능', 'SKIP', { reason: 'skipped or missing vendor WASM' });
    }

    // =========================================================================
    // UC-05: 전체 16개 게임 템플릿 네이티브 Godot 4.7.2 헤드리스 임포트 & 씬 로드 전수 검증
    // =========================================================================
    if (!opts.skipGodot && fs.existsSync(opts.godot)) {
      const gameTemplates = loadGameTemplates(forgeRoot);
      const ids = Object.keys(gameTemplates).sort();
      const probeGd = `extends Node
func _ready() -> void:
\tcall_deferred("_check")
func _check() -> void:
\tvar scene := load("res://scenes/main.tscn") as PackedScene
\tif scene == null:
\t\tpush_error("MAIN_SCENE_LOAD_NULL")
\t\tget_tree().quit(2)
\t\treturn
\tvar inst := scene.instantiate()
\tadd_child(inst)
\tawait get_tree().process_frame
\tawait get_tree().process_frame
\tprint("UC05_BOOT_OK:" + inst.name)
\tinst.queue_free()
\tawait get_tree().process_frame
\tget_tree().quit(0)
`;
      const probeTscn = `[gd_scene load_steps=2 format=3]\n[ext_resource type="Script" path="res://_uc05_probe.gd" id="1"]\n[node name="Uc05Probe" type="Node"]\nscript = ExtResource("1")\n`;

      const results = [];
      for (const id of ids) {
        const projDir = path.join(tempRoot, `gd-${id}`);
        const created = await timedFetch(`${baseUrl}/api/platform/projects`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: `GD ${id}`, template: id, mode: 'ready' }),
        });
        for (const f of created.json.files) {
          const out = path.join(projDir, f.path);
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, f.content, 'utf8');
        }
        fs.writeFileSync(path.join(projDir, '_uc05_probe.gd'), probeGd, 'utf8');
        fs.writeFileSync(path.join(projDir, '_uc05_probe.tscn'), probeTscn, 'utf8');

        const isoEnv = {
          ...process.env,
          APPDATA: projDir, LOCALAPPDATA: projDir, HOME: projDir,
          XDG_DATA_HOME: projDir, XDG_CONFIG_HOME: projDir, XDG_CACHE_HOME: projDir,
        };
        const imp = await runCmd(opts.godot, ['--headless', '--path', projDir, '--editor', '--import', '--quit'], { env: isoEnv, timeoutMs: 45000 });
        const boot = await runCmd(opts.godot, ['--headless', '--path', projDir, 'res://_uc05_probe.tscn'], { env: isoEnv, timeoutMs: 30000 });
        const bootOut = boot.stdout + '\n' + boot.stderr;
        const impOut = imp.stdout + '\n' + imp.stderr;
        const hasScriptErr = /SCRIPT ERROR:|Parse Error:|Assertion failed|MAIN_SCENE_LOAD_NULL/.test(bootOut + impOut);
        const bootOk = imp.code === 0 && boot.code === 0 && /UC05_BOOT_OK:/.test(bootOut) && !hasScriptErr;
        const errSnippet = !bootOk ? (bootOut + '\n' + impOut).split(/\r?\n/).filter(l => /ERROR|Parse|SCRIPT|failed/i.test(l)).slice(0, 3).join(' | ') : '';
        results.push({ id, ok: bootOk, importMs: imp.ms, bootMs: boot.ms, impCode: imp.code, bootCode: boot.code, errSnippet });
      }

      const failed = results.filter(r => !r.ok);
      const slowImports = results.filter(r => r.importMs > 8000);
      for (const f of failed) {
        addFinding('P0', 'stability', 'UC-05', `템플릿 '${f.id}' Godot 4.7.2 헤드리스 임포트/부팅 실패`,
          `import=${f.impCode}(${f.importMs}ms), boot=${f.bootCode}(${f.bootMs}ms): ${f.errSnippet || 'see log'}`);
      }
      for (const s of slowImports) {
        addFinding('P2', 'performance', 'UC-05', `템플릿 '${s.id}' Godot 초기 임포트 느림 (${s.importMs}ms)`,
          `importMs=${s.importMs}ms, bootMs=${s.bootMs}ms`);
      }

      recordCase('UC-05', `전체 ${ids.length}종 게임 템플릿 Godot 4.7.2 임포트·부팅 전수 검증`, '기능/성능/안정성',
        failed.length === 0 ? 'PASS' : 'FAIL', {
          passed: `${results.length - failed.length}/${results.length}`,
          importP50Ms: pct(results.map(r => r.importMs), 50),
          importMax: results.reduce((a, b) => (b.importMs > a.importMs ? b : a), { id: '-', importMs: 0 }),
          bootP50Ms: pct(results.map(r => r.bootMs), 50),
          failedIds: failed.map(f => f.id),
        }, failed.map(f => `${f.id}: ${f.errSnippet}`));
    } else {
      recordCase('UC-05', '전체 게임 템플릿 Godot 4.7.2 임포트·부팅 검증', '기능/안정성', 'SKIP', { reason: 'skipped or Godot missing' });
    }

    // =========================================================================
    // UC-06: 로컬 에셋 스토어 탐색 · 검색 · 필터 · ZIP 무결성 · 보안 경계
    // =========================================================================
    {
      const repo = `${baseUrl}/api/asset-library`;
      const list = await timedFetch(`${repo}/search/query/?require_release=true&type=0&compatibility=4.7.2`);
      const search = await timedFetch(`${repo}/search/query/?require_release=true&type=0&compatibility=4.7.2&query=Tappy`);
      const empty = await timedFetch(`${repo}/search/query/?require_release=true&type=0&compatibility=4.7.2&query=zzznomatch999`);
      const badTraversal = await timedFetch(`${repo}/packs/..%2F..%2Fpackage.json`);
      const badMethod = await timedFetch(`${repo}/packs/tappy-original.zip`, { method: 'POST' });

      let zipOk = false;
      let zipMs = null;
      const hit = list.json?.hits?.[0];
      if (hit?.asset?.publisher?.slug && hit?.asset?.slug) {
        const rel = await timedFetch(`${repo}/releases/${hit.asset.publisher.slug}/${hit.asset.slug}/`);
        const r0 = rel.json?.[0];
        if (r0?.download_url && r0?.sha256) {
          const dl = await timedFetch(r0.download_url);
          zipMs = dl.ms;
          const hash = crypto.createHash('sha256').update(dl.buf).digest('hex');
          zipOk = dl.status === 200 && hash === r0.sha256;
        }
      }

      if ((list.json?.count || 0) <= 2) {
        addFinding('P3', 'usability', 'UC-06', `로컬 에셋 스토어 등록 팩이 ${list.json?.count || 0}개뿐 (Tappy Chicken 한정)`,
          '에셋 스토어 API·브리지·보안은 정상 동작하나 카탈로그가 Tappy Chicken 팩 위주여서 다른 템플릿 제작 시 활용도가 제한적임.');
      }

      const ok = list.status === 200 && search.status === 200 && empty.json?.count === 0 && zipOk && badTraversal.status === 404 && badMethod.status === 405;
      recordCase('UC-06', '로컬 에셋 스토어 검색 · ZIP SHA-256 무결성 · 경로/메서드 보안', '기능/성능/안정성', ok ? 'PASS' : 'FAIL', {
        assetCount: list.json?.count,
        listMs: list.ms,
        searchMs: search.ms,
        zipDownloadMs: zipMs,
        zipSha256Ok: zipOk,
        traversalStatus: badTraversal.status,
        postMethodStatus: badMethod.status,
      });
    }

    // =========================================================================
    // UC-07: AI 에이전트 채팅(Agent Chat) UI 로드 & 프로바이더 미설정/오류 UX
    // =========================================================================
    {
      const statusApi = await timedFetch(`${baseUrl}/api/agent-chat/status`);
      const providersApi = await timedFetch(`${baseUrl}/api/agent-chat/providers`);
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      const t0 = performance.now();
      const resp = await page.goto(`${baseUrl}/OfficialGodot/agent.html`, { waitUntil: 'domcontentloaded' });
      const loadMs = round(performance.now() - t0);
      await page.waitForTimeout(400);
      const bodyLen = await page.evaluate(() => (document.body?.innerText || '').trim().length);
      await page.close();

      // Check graceful error when sending chat message with no API key configured
      const chatTry = await timedFetch(`${baseUrl}/api/agent-chat/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', message: '안녕' }),
      });

      if (errs.length > 0) {
        addFinding('P1', 'stability', 'UC-07', 'AI Agent Chat 페이지 런타임 예외 발생', errs.join(' | '));
      }
      if (chatTry.status === 500) {
        addFinding('P1', 'usability', 'UC-07', 'AI 프로바이더 미설정 시 500 내부 오류 반환', `status=${chatTry.status}, body=${chatTry.text.slice(0, 160)}`);
      }

      const ok = resp.status() === 200 && bodyLen > 20 && errs.length === 0 && chatTry.status !== 500;
      recordCase('UC-07', 'AI 에이전트 채팅 UI 로드 · 프로바이더 상태 · 미설정 오류 UX', '기능/안정성/편의성', ok ? 'PASS' : 'FAIL', {
        agentHtmlStatus: resp.status(),
        agentHtmlLoadMs: loadMs,
        statusApiCode: statusApi.status,
        providersApiCode: providersApi.status,
        unconfiguredChatStatus: chatTry.status,
        pageErrors: errs.length,
      }, errs);
    }

    // =========================================================================
    // UC-08: 실시간 협업(WS) & 멀티플레이어 로비 3종 (BrawlLabs / Fortress / Tappy MMO)
    // =========================================================================
    {
      const lobbies = ['brawllabs-lobby.html', 'fortress-war-lobby.html', 'tappy-chicken-mmo-lobby.html', 'multiplayer.html'];
      const lobbyStats = [];
      for (const file of lobbies) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errs = [];
        page.on('pageerror', e => errs.push(e.message));
        const t0 = performance.now();
        const r = await page.goto(`${baseUrl}/OfficialGodot/${file}`, { waitUntil: 'domcontentloaded' });
        const ms = round(performance.now() - t0);
        await page.waitForTimeout(300);
        await page.close();
        lobbyStats.push({ file, status: r.status(), ms, errs: errs.length });
        if (r.status() !== 200 || errs.length > 0) {
          addFinding('P1', 'functionality', 'UC-08', `멀티플레이어 로비 페이지 오류 (${file})`, `status=${r.status()}, errs=${errs.join(' | ')}`);
        }
      }

      // Test live WebSocket connection to BrawlLabs & Tappy Chicken MMO multiplayer endpoints
      async function probeWs(wsPath) {
        return new Promise(resolve => {
          const t0 = performance.now();
          let settled = false;
          const finish = res => { if (!settled) { settled = true; resolve(res); } };
          const ws = new WebSocket(`${wsBase}${wsPath}`);
          const timer = setTimeout(() => { try { ws.terminate(); } catch {} finish({ ok: false, reason: 'timeout', ms: round(performance.now() - t0) }); }, 5000);
          ws.on('open', () => {
            const openMs = round(performance.now() - t0);
            ws.once('message', data => {
              clearTimeout(timer);
              try { ws.close(); } catch {}
              finish({ ok: true, openMs, firstMsgMs: round(performance.now() - t0), sample: data.toString('utf8').slice(0, 100) });
            });
            setTimeout(() => {
              clearTimeout(timer);
              try { ws.close(); } catch {}
              finish({ ok: true, openMs, firstMsgMs: null });
            }, 600);
          });
          ws.on('error', err => { clearTimeout(timer); finish({ ok: false, reason: err.message, ms: round(performance.now() - t0) }); });
        });
      }

      const wsBrawl = await probeWs('/brawllabs');
      const wsFortress = await probeWs('/fortress-war');
      const wsTappy = await probeWs('/tappy-chicken-mmo');

      // Test SSE collaboration stream + activity broadcast on a project
      const pRes = await timedFetch(`${baseUrl}/api/platform/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Collab QA', template: 'blank3d' }),
      });
      const pid = pRes.json.project.id;
      const actRes = await timedFetch(`${baseUrl}/api/platform/projects/${pid}/activity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: 'qa-client-001', label: 'QA User', kind: 'cursor', x: 0.4, y: 0.6 }),
      });

      const ok = lobbyStats.every(l => l.status === 200 && l.errs === 0) && wsBrawl.ok && wsFortress.ok && wsTappy.ok && actRes.status < 400;
      recordCase('UC-08', '멀티플레이어 로비 4종 · WS 서버 3종 · 실시간 협업 활동 브로드캐스트', '기능/성능/안정성', ok ? 'PASS' : 'FAIL', {
        lobbies: lobbyStats,
        wsBrawl,
        wsFortress,
        wsTappy,
        collabActivityStatus: actRes.status,
      });
    }

    // =========================================================================
    // UC-09: 배포 센터(Publish 4단계 UI) · SinglePlay/MO/MMO 계산기 · ZIP 내보내기
    // =========================================================================
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.addInitScript(() => { window.prompt = () => 'Publish QA Project'; });

      await page.goto(`${baseUrl}/OfficialGodot/`, { waitUntil: 'domcontentloaded' });
      // Create a blank3d project & open Publish panel directly via JS hook (without waiting for 96MB WASM)
      const proj = await timedFetch(`${baseUrl}/api/platform/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Publish Panel QA', template: 'tappy-chicken', mode: 'ready' }),
      });
      const publishAudit = await page.evaluate(selected => {
        if (!window.PlayForgePublish?.open) return { opened: false, reason: 'PlayForgePublish missing' };
        window.PlayForgePublish.open({ selected, hubAuth: false, status: () => {} });
        const panel = document.getElementById('panel');
        const body = document.getElementById('panelBody');
        const text = body?.innerText || '';
        const hasSingleMoMmo = /SinglePlay/i.test(text) && /\bMO\b/.test(text) && /\bMMO\b/.test(text);
        const hasStandaloneWarning = /Hub|로그인|단독|연동/i.test(text);
        return {
          opened: !panel.hidden,
          title: document.getElementById('panelTitle')?.textContent,
          hasSingleMoMmo,
          hasStandaloneWarning,
          textSample: text.slice(0, 260),
        };
      }, proj.json);
      await page.close();

      // Export Godot ZIP check
      const zipRes = await timedFetch(`${baseUrl}/api/export/godot-project.zip`);
      const isZip = zipRes.status === 200 && zipRes.buf[0] === 0x50 && zipRes.buf[1] === 0x4b;

      // Test Forge build endpoint when Godot build is triggered without Hub
      const manifestCheck = await timedFetch(`${baseUrl}/api/platform/projects/${proj.json.project.id}/publish-config`).catch(() => ({ status: 0 }));

      if (!publishAudit.hasSingleMoMmo) {
        addFinding('P1', 'functionality', 'UC-09', 'Publish 패널 Step 1에 SinglePlay/MO/MMO 선택 UI 미노출', publishAudit.textSample);
      }

      const ok = publishAudit.opened && isZip && errs.length === 0;
      recordCase('UC-09', '배포 센터(Publish 4단계 UI) · SinglePlay/MO/MMO · 프로젝트 ZIP 내보내기', '기능/편의성/성능', ok ? 'PASS' : 'FAIL', {
        publishOpened: publishAudit.opened,
        publishTitle: publishAudit.title,
        hasSingleMoMmo: publishAudit.hasSingleMoMmo,
        hasStandaloneWarning: publishAudit.hasStandaloneWarning,
        exportZipOk: isZip,
        exportZipMs: zipRes.ms,
        exportZipKb: round(zipRes.bytes / 1024, 1),
        publishConfigStatus: manifestCheck.status,
      }, errs);
    }

    // =========================================================================
    // UC-10: 동시성 부하 · 잘못된 입력 · 보안 경계 (Hub-Auth P0 Fail-Closed)
    // =========================================================================
    {
      // 1. 20 concurrent template catalog & project creation burst
      const burstT0 = performance.now();
      const burstReqs = Array.from({ length: 20 }, (_, i) => i % 2 === 0
        ? timedFetch(`${baseUrl}/api/platform/templates`)
        : timedFetch(`${baseUrl}/api/platform/projects`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: `Burst ${i}`, template: 'blank3d' }),
          }));
      const burstRes = await Promise.all(burstReqs);
      const burstTotalMs = round(performance.now() - burstT0);
      const burstErrors = burstRes.filter(r => !r.ok).length;
      const burstMsList = burstRes.map(r => r.ms);

      // 2. Malformed JSON & Path Traversal
      const badJson = await timedFetch(`${baseUrl}/api/platform/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{invalid-json',
      });
      const badPath = await timedFetch(`${baseUrl}/OfficialGodot/..%2F..%2Fserver.cjs`);

      // 3. Hub-Auth mode fail-closed check (unauthenticated -> 401)
      const hubSrv = await startForgeServer(tempRoot, {
        hubAuth: {
          verifyUrl: 'http://127.0.0.1:1/internal/session/verify',
          internalSecret: 'a'.repeat(40),
          loginUrl: '/?view=account',
        },
      });
      let hubUnauthStatus = null;
      try {
        const r = await timedFetch(`${hubSrv.baseUrl}/api/platform/projects`);
        hubUnauthStatus = r.status;
      } finally {
        hubSrv.server.closeAllConnections?.();
        await new Promise(resolve => hubSrv.server.close(resolve));
      }

      if (burstErrors > 0) {
        addFinding('P1', 'stability', 'UC-10', `동시 20요청 부하 중 오류 ${burstErrors}건 발생`, `statuses=${burstRes.map(r => r.status).join(',')}`);
      }
      if (pct(burstMsList, 95) > 500) {
        addFinding('P2', 'performance', 'UC-10', `동시 20요청 P95 응답 지연 (${pct(burstMsList, 95)}ms)`, `total=${burstTotalMs}ms`);
      }

      const ok = burstErrors === 0 && badJson.status === 400 && (badPath.status === 400 || badPath.status === 403 || badPath.status === 404) && (hubUnauthStatus === 401 || hubUnauthStatus === 503);
      recordCase('UC-10', '동시 부하(20x) · 잘못된 JSON · 경로 순회 · Hub-Auth Fail-Closed 보안', '성능/안정성', ok ? 'PASS' : 'FAIL', {
        burstTotalMs,
        burstErrors,
        burstP50Ms: pct(burstMsList, 50),
        burstP95Ms: pct(burstMsList, 95),
        burstMaxMs: pct(burstMsList, 100),
        malformedJsonStatus: badJson.status,
        pathTraversalStatus: badPath.status,
        hubAuthUnauthStatus: hubUnauthStatus,
      });
    }

    // =========================================================================
    // Generate Report (JSON + Markdown)
    // =========================================================================
    const totalMs = round(performance.now() - tStart);
    const passCount = cases.filter(c => c.status === 'PASS').length;
    const failCount = cases.filter(c => c.status === 'FAIL').length;
    const skipCount = cases.filter(c => c.status === 'SKIP').length;
    const gitSha = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim(); } catch { return '?'; } })();

    const summary = {
      generatedAt: new Date().toISOString(),
      gitSha,
      totalMs,
      counts: { total: cases.length, pass: passCount, fail: failCount, skip: skipCount },
      findingsCount: {
        P0: findings.filter(f => f.severity === 'P0').length,
        P1: findings.filter(f => f.severity === 'P1').length,
        P2: findings.filter(f => f.severity === 'P2').length,
        P3: findings.filter(f => f.severity === 'P3').length,
      },
      cases,
      findings,
    };

    fs.mkdirSync(opts.out, { recursive: true });
    fs.writeFileSync(path.join(opts.out, 'report.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

    const md = [
      `# PlayForge 사용자 Use-Case 복합 검증 리포트 (UC-01 ~ UC-10)`,
      '',
      `- **기준 커밋**: \`PlayForge-Main @ ${gitSha}\` | **총 소요 시간**: ${round(totalMs / 1000, 1)}초`,
      `- **시나리오 판정**: **PASS ${passCount}** / **FAIL ${failCount}** / **SKIP ${skipCount}** (총 ${cases.length}개)`,
      `- **발견 이슈**: P0=${summary.findingsCount.P0} · P1=${summary.findingsCount.P1} · P2=${summary.findingsCount.P2} · P3=${summary.findingsCount.P3}`,
      '',
      '## 1. Use-Case 시나리오별 실행 결과',
      '',
      '| ID | 시나리오 | 검증 축 | 판정 | 핵심 실측 지표 |',
      '|---|---|---|---|---|',
      ...cases.map(c => `| ${c.id} | ${c.title} | ${c.axis} | **${c.status}** | \`${JSON.stringify(c.metrics).slice(0, 180)}\` |`),
      '',
      '## 2. 발견된 미구현 · 미동작 · 성능 · 편의성 이슈',
      '',
      '| ID | 심각도 | 분류 | UC | 제목 | 상세 근거 |',
      '|---|---|---|---|---|---|',
      ...findings.map(f => `| ${f.id} | **${f.severity}** | ${f.category} | ${f.useCase} | ${f.title} | ${f.detail} |`),
      '',
    ].join('\n');

    fs.writeFileSync(path.join(opts.out, 'REPORT.md'), md, 'utf8');
    process.stdout.write(md + '\n');
    if (failCount > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (srv?.server) {
      srv.server.closeAllConnections?.();
      await new Promise(resolve => srv.server.close(resolve));
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
