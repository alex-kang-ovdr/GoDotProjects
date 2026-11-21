import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveProjectRoot } from '../../core/paths.mjs';
import { average, percentile, roundNum } from '../../core/perf-profiler.mjs';
import { formatKstTimestamp } from '../../core/trend-tracker.mjs';
import { writeUseCaseReportArtifacts } from '../../reporters/usecase-report.mjs';
import { launchCdpBrowser } from './cdp-client.mjs';
import { startIsolatedHubStack } from './hub-harness.mjs';
import { FINDING_TYPES, HUB_USE_CASES } from './usecase-catalog.mjs';

const HANGUL_RE = /[가-힣]{2,}/g;

function makeFinding(useCaseId, type, severity, title, evidence, remediation) {
  return { useCaseId, type, severity, title, evidence, remediation };
}

function summarizeScenarioStatus(findings, hardError = null) {
  if (hardError) return 'failed';
  if (findings.some((f) => f.severity === 'critical' || f.severity === 'high')) return 'failed';
  if (findings.length > 0) return 'warned';
  return 'passed';
}

function computeDimensionScores(scenarios, findings) {
  const byDim = { 기능: 100, 성능: 100, 안정성: 100, 편의성: 100 };
  const deduct = (dim, sev) => {
    const pts = sev === 'critical' ? 25 : sev === 'high' ? 15 : sev === 'medium' ? 8 : 3;
    byDim[dim] = Math.max(0, byDim[dim] - pts);
  };
  for (const f of findings) {
    if (f.type === FINDING_TYPES.BROKEN || f.type === FINDING_TYPES.UNIMPLEMENTED) deduct('기능', f.severity);
    else if (f.type === FINDING_TYPES.SLOW) deduct('성능', f.severity);
    else if (f.type === FINDING_TYPES.STABILITY) deduct('안정성', f.severity);
    else if (f.type === FINDING_TYPES.USABILITY) deduct('편의성', f.severity);
  }
  const overall = Math.round((byDim.기능 + byDim.성능 + byDim.안정성 + byDim.편의성) / 4);
  return { ...byDim, overall };
}

export async function runHubUseCaseSuite({
  projectRoot: explicitRoot,
  outDir: explicitOutDir = null,
  captureScreenshots = true,
} = {}) {
  const startedMs = Date.now();
  const projectRoot = resolveProjectRoot(explicitRoot);
  const outDir = explicitOutDir
    ? path.resolve(explicitOutDir)
    : path.join(projectRoot, 'artifacts', 'gamerqa', 'hub-usecases');
  const shotDir = captureScreenshots ? path.join(outDir, 'screenshots') : null;

  const stack = await startIsolatedHubStack({ projectRoot });
  const browser = await launchCdpBrowser({ viewport: { width: 1280, height: 800, mobile: false } });
  const tab = await browser.openTab();

  const scenarioResults = [];
  const allFindings = [];
  let apiProfile = [];

  const runCase = async (ucDef, fn) => {
    const t0 = Date.now();
    tab.resetTelemetry();
    const findings = [];
    let metrics = {};
    let hardError = null;
    try {
      metrics = (await fn({ findings })) || {};
    } catch (err) {
      hardError = err?.message || String(err);
      findings.push(
        makeFinding(
          ucDef.id,
          FINDING_TYPES.BROKEN,
          'critical',
          `시나리오 실행 중 예외 발생`,
          hardError,
          '해당 사용자 흐름의 DOM/API 오류 및 타임아웃 원인을 즉시 수정해야 합니다.'
        )
      );
    }
    const tel = tab.telemetry();
    if (tel.pageErrors.length > 0) {
      findings.push(
        makeFinding(
          ucDef.id,
          FINDING_TYPES.STABILITY,
          'high',
          `브라우저 Uncaught JS 예외 ${tel.pageErrors.length}건`,
          tel.pageErrors.slice(0, 3).join(' | '),
          '브라우저 콘솔 예외를 제거하고 방어 코드를 추가하세요.'
        )
      );
    }
    const status = summarizeScenarioStatus(findings, hardError);
    allFindings.push(...findings);
    scenarioResults.push({
      id: ucDef.id,
      persona: ucDef.persona,
      title: ucDef.title,
      dimensions: ucDef.dimensions,
      status,
      durationMs: Date.now() - t0,
      metrics,
      consoleErrorCount: tel.consoleErrors.length,
      pageErrorCount: tel.pageErrors.length,
      httpFailureCount: tel.httpFailures.length,
      findings,
    });
  };

  try {
    // -------------------------------------------------------------------------
    // UC-01: 첫 방문 홈 탐색 및 초기 로딩
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[0], async ({ findings }) => {
      const loadMs = await tab.goto(`${stack.userBaseUrl}/`);
      await tab.waitFor('document.querySelectorAll("[data-testid=\\"game-card\\"]").length >= 5', 10000);
      await delay(250);
      const perf = await tab.getPerfMetrics();
      const home = await tab.evalJs(`(() => {
        const nav = performance.getEntriesByType('navigation')?.[0];
        const cards = [...document.querySelectorAll('[data-testid="game-card"]')];
        const imgs = cards.map(c => c.querySelector('img')).filter(Boolean);
        const brokenImgs = imgs.filter(img => img.complete && img.naturalWidth === 0).map(img => img.getAttribute('src'));
        const navLinks = [...document.querySelectorAll('.site-nav a')].map(a => a.textContent.trim());
        const skipLink = Boolean(document.querySelector('.skip-link'));
        const mainLandmark = Boolean(document.querySelector('main#app'));
        const searchAria = Boolean(document.querySelector('#search')?.getAttribute('aria-label'));
        const bannerVisible = !document.getElementById('connection-banner')?.hidden;
        return {
          ttfbMs: nav ? Math.round((nav.responseStart - nav.requestStart) * 10) / 10 : null,
          fcpMs: Math.round((performance.getEntriesByName('first-contentful-paint')?.[0]?.startTime || 0) * 10) / 10 || null,
          cardCount: cards.length,
          brokenImgs,
          navLinks,
          skipLink,
          mainLandmark,
          searchAria,
          bannerVisible,
          title: document.title,
        };
      })()`);

      if (shotDir) await tab.capturePng(path.join(shotDir, 'uc01-home.png'));

      if (home.cardCount === 0) {
        findings.push(makeFinding('UC-01', FINDING_TYPES.BROKEN, 'critical', '홈 게임 카드가 렌더링되지 않음', 'cardCount=0', '/api/games 응답 및 app.js 초기화 확인'));
      }
      if (home.brokenImgs.length > 0) {
        findings.push(makeFinding('UC-01', FINDING_TYPES.BROKEN, 'high', `표지 이미지 깨짐 ${home.brokenImgs.length}건`, home.brokenImgs.slice(0, 5).join(', '), '누락된 cover 자산 경로 수정'));
      }
      if (home.bannerVisible) {
        findings.push(makeFinding('UC-01', FINDING_TYPES.STABILITY, 'high', '정상 접속 상태에서 연결 오류 배너가 노출됨', '#connection-banner visible', '초기 세션/카탈로그 연결 확인'));
      }
      if (loadMs > HUB_USE_CASES[0].sla.maxLoadMs) {
        findings.push(makeFinding('UC-01', FINDING_TYPES.SLOW, 'medium', `홈 초기 로딩 지연 (${loadMs}ms)`, `SLA ${HUB_USE_CASES[0].sla.maxLoadMs}ms 초과`, '초기 번들·이미지 지연 로딩 점검'));
      }
      if (!home.skipLink || !home.mainLandmark || !home.searchAria) {
        findings.push(makeFinding('UC-01', FINDING_TYPES.USABILITY, 'low', '기본 접근성 랜드마크/라벨 누락', JSON.stringify({ skipLink: home.skipLink, mainLandmark: home.mainLandmark, searchAria: home.searchAria }), 'skip-link/main/aria-label 보강'));
      }
      const tel = tab.telemetry();
      if (tel.httpFailures.length > 0) {
        findings.push(makeFinding('UC-01', FINDING_TYPES.BROKEN, 'medium', `홈 초기 로딩 HTTP 오류 ${tel.httpFailures.length}건`, tel.httpFailures.map((x) => `${x.status} ${x.url}`).slice(0, 4).join(', '), '4xx/5xx 정적·API 리소스 확인'));
      }
      return { loadMs, ttfbMs: home.ttfbMs, fcpMs: home.fcpMs, cardCount: home.cardCount, jsHeapUsedMb: perf.jsHeapUsedMb, brokenImgCount: home.brokenImgs.length };
    });

    // -------------------------------------------------------------------------
    // UC-02: 게임 검색·다중 필터·정렬 및 초기화
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[1], async ({ findings }) => {
      const tSearch0 = Date.now();
      await tab.evalJs(`(() => {
        const input = document.getElementById('search');
        input.value = '삼국지';
        document.getElementById('search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()`);
      await tab.waitFor('document.getElementById("library-title")?.textContent?.includes("삼국지")', 5000);
      const koSearchMs = Date.now() - tSearch0;
      const koCount = await tab.evalJs('document.querySelectorAll("[data-testid=\\"game-card\\"]").length');

      // Non-existent search query -> empty state + reset CTA
      await tab.evalJs(`(() => {
        const input = document.getElementById('search');
        input.value = 'zz-no-such-game-9999';
        document.getElementById('search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()`);
      await tab.waitFor('Boolean(document.querySelector(".no-results"))', 5000);
      const emptyState = await tab.evalJs(`({
        text: document.querySelector('.no-results')?.textContent?.trim() || '',
        hasResetBtn: Boolean(document.querySelector('.no-results a[href*="view=browse"]'))
      })`);

      // Click reset CTA -> full browse view
      const tFilter0 = Date.now();
      await tab.evalJs('document.querySelector(".no-results a")?.click()');
      await tab.waitFor('document.querySelectorAll("[data-testid=\\"game-card\\"]").length >= 10', 5000);

      // Apply genre filter + sort=title + device=touch
      const genreResult = await tab.evalJs(`(() => {
        const btns = [...document.querySelectorAll('[data-genre-filter]')].filter(b => b.dataset.genreFilter !== 'all');
        const chosen = btns[0]?.dataset.genreFilter || null;
        if (btns[0]) btns[0].click();
        return chosen;
      })()`);
      await delay(150);
      const afterGenreCount = await tab.evalJs('document.querySelectorAll("[data-testid=\\"game-card\\"]").length');

      await tab.evalJs(`(() => {
        const sel = document.querySelector('#browse-filters select[name="sort"]');
        if (sel) { sel.value = 'title'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      })()`);
      await delay(150);
      const filterMs = Date.now() - tFilter0;

      // Also check whether pressing clear/empty search resets cleanly
      const searchHasClearUx = await tab.evalJs(`Boolean(document.querySelector('#search-form button[type="reset"], .search-clear'))`);

      if (koCount < 1) {
        findings.push(makeFinding('UC-02', FINDING_TYPES.BROKEN, 'high', '한글 게임명 검색("삼국지") 결과 0건', `koCount=${koCount}`, 'gameMatches() 한글 title/summary 색인 확인'));
      }
      if (!emptyState.hasResetBtn) {
        findings.push(makeFinding('UC-02', FINDING_TYPES.USABILITY, 'medium', '검색 결과 없음 화면에 필터 초기화 버튼 누락', emptyState.text, '필터 초기화 CTA 유지'));
      }
      if (koSearchMs > HUB_USE_CASES[1].sla.maxActionMs) {
        findings.push(makeFinding('UC-02', FINDING_TYPES.SLOW, 'medium', `검색 UI 반응 지연 (${koSearchMs}ms)`, `SLA ${HUB_USE_CASES[1].sla.maxActionMs}ms 초과`, '검색 필터 렌더링 최적화'));
      }
      if (!searchHasClearUx) {
        findings.push(makeFinding('UC-02', FINDING_TYPES.USABILITY, 'low', '헤더 검색창에 원클릭 검색어 지우기(×) 커스텀 버튼 미제공', 'type="search" 브라우저 기본 UI에만 의존', '일관된 검색어 초기화 버튼 제공 검토'));
      }
      return { koSearchMs, koCount, genreResult, afterGenreCount, filterMs, emptyStateHasReset: emptyState.hasResetBtn };
    });

    // -------------------------------------------------------------------------
    // UC-03: 찜하기(Wishlist) 추가 → 내 게임 조회 → 새로고침 영속성 → 해제
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[2], async ({ findings }) => {
      await tab.goto(`${stack.userBaseUrl}/?view=browse`);
      await tab.waitFor('document.querySelector("[data-wishlist-game]:not([disabled])")', 8000);

      const tAdd0 = Date.now();
      const targetId = await tab.evalJs(`(() => {
        const btn = document.querySelector('[data-wishlist-game]:not([disabled])');
        const id = btn.dataset.wishlistGame;
        btn.click();
        return id;
      })()`);
      await tab.waitFor(`document.querySelector('[data-wishlist-game="${targetId}"]')?.getAttribute('aria-pressed') === 'true'`, 6000);
      const addMs = Date.now() - tAdd0;
      const badgeAfterAdd = await tab.evalJs('document.getElementById("wishlist-count")?.textContent?.trim()');

      // Navigate to 내 게임 (/?view=wishlist) and reload to verify server persistence
      await tab.goto(`${stack.userBaseUrl}/?view=wishlist`);
      await tab.waitFor(`Boolean(document.querySelector('[data-game-id="${targetId}"]'))`, 8000);
      const persistedAfterReload = await tab.evalJs(`Boolean(document.querySelector('[data-game-id="${targetId}"]'))`);

      // Remove from wishlist
      const tDel0 = Date.now();
      await tab.evalJs(`document.querySelector('[data-wishlist-game="${targetId}"]')?.click()`);
      await tab.waitFor(`!document.querySelector('[data-game-id="${targetId}"]')`, 6000);
      const removeMs = Date.now() - tDel0;

      if (!persistedAfterReload) {
        findings.push(makeFinding('UC-03', FINDING_TYPES.BROKEN, 'high', '찜한 게임이 새로고침 후 유지되지 않음', `gameId=${targetId}`, '게스트 세션 쿠키 및 /api/wishlist 영속화 확인'));
      }
      if (addMs > HUB_USE_CASES[2].sla.maxApiMs || removeMs > HUB_USE_CASES[2].sla.maxApiMs) {
        findings.push(makeFinding('UC-03', FINDING_TYPES.SLOW, 'medium', `찜하기 API 응답 지연 (추가 ${addMs}ms / 해제 ${removeMs}ms)`, `SLA ${HUB_USE_CASES[2].sla.maxApiMs}ms 초과`, 'SQLite 트랜잭션 및 클라이언트 재렌더 최적화'));
      }
      return { targetId, addMs, removeMs, badgeAfterAdd, persistedAfterReload };
    });

    // -------------------------------------------------------------------------
    // UC-04: 게임 상세 진입 → 실제 게임 시작(iframe) → 입력 → 정상 종료
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[3], async ({ findings }) => {
      const playChecks = [];
      for (const gameId of ['bubble-split', 'survivor-io']) {
        const tNav0 = Date.now();
        await tab.goto(`${stack.userBaseUrl}/play/${gameId}/`);
        await tab.waitFor('Boolean(document.querySelector("[data-testid=\\"launch-game\\"]"))', 8000);
        const detailLoadMs = Date.now() - tNav0;

        const detailInfo = await tab.evalJs(`({
          title: document.querySelector('.detail-heading h1')?.textContent?.trim() || '',
          hasDeviceGuide: Boolean(document.querySelector('.device-guide')),
          hasInstructions: Boolean(document.getElementById('game-info')?.textContent?.trim().length > 10),
        })`);

        const tLaunch0 = Date.now();
        await tab.evalJs('document.querySelector("[data-testid=\\"launch-game\\"]").click()');
        await tab.waitFor('Boolean(document.querySelector("#player-panel iframe"))', 10000);
        await delay(1200);
        const hostState = await tab.evalJs(`({
          src: document.querySelector('#player-panel iframe')?.getAttribute('src') || null,
          sandbox: document.querySelector('#player-panel iframe')?.getAttribute('sandbox') || null,
          saveIndicator: document.getElementById('save-indicator')?.textContent?.trim() || '',
          closeVisible: !document.getElementById('close-game')?.hidden,
        })`);
        // Inspect inside the sandboxed game iframe via CDP isolated world
        const childProbe = await tab.evalInChildFrame(
          `/games/${gameId}/`,
          `({
            readyState: document.readyState,
            canvasCount: document.querySelectorAll('canvas').length,
            nonZeroCanvas: [...document.querySelectorAll('canvas')].some(c => c.width > 0 && c.height > 0),
            bodyTextLen: (document.body?.innerText || '').trim().length,
          })`
        ).catch(() => null);
        const iframeState = {
          ...hostState,
          docReady: childProbe?.value?.readyState || null,
          hasCanvas: Boolean(childProbe?.value?.nonZeroCanvas || childProbe?.value?.canvasCount > 0),
          canvasCount: childProbe?.value?.canvasCount ?? 0,
          bodyTextLen: childProbe?.value?.bodyTextLen ?? 0,
        };
        const launchMs = Date.now() - tLaunch0;

        if (shotDir && gameId === 'bubble-split') {
          await tab.capturePng(path.join(shotDir, 'uc04-play-bubble-split.png'));
        }

        // Close game cleanly
        const tClose0 = Date.now();
        await tab.evalJs('document.getElementById("close-game")?.click()');
        await tab.waitFor('!document.querySelector("#player-panel iframe")', 8000);
        const closeMs = Date.now() - tClose0;

        playChecks.push({ gameId, detailLoadMs, launchMs, closeMs, ...detailInfo, ...iframeState });

        if (!iframeState.hasCanvas) {
          findings.push(makeFinding('UC-04', FINDING_TYPES.BROKEN, 'high', `${gameId} iframe 내 게임 캔버스 미마운트`, JSON.stringify(iframeState), '게임 iframe 로딩 및 부팅 스크립트 점검'));
        }
        if (!iframeState.closeVisible) {
          findings.push(makeFinding('UC-04', FINDING_TYPES.BROKEN, 'medium', `${gameId} 실행 후 '게임 닫기' 버튼 미표시`, 'closeVisible=false', 'startPlay() UI 상태 전환 점검'));
        }
        if (launchMs > HUB_USE_CASES[3].sla.maxBootMs) {
          findings.push(makeFinding('UC-04', FINDING_TYPES.SLOW, 'medium', `${gameId} 게임 실행(iframe) 부팅 지연 (${launchMs}ms)`, `SLA ${HUB_USE_CASES[3].sla.maxBootMs}ms 초과`, '게임 번들 초기 로딩 경량화'));
        }
      }
      return { gamesTested: playChecks };
    });

    // -------------------------------------------------------------------------
    // UC-05: 저장 기록(Save Slots) 모달 열기·조회·새로고침·닫기
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[4], async ({ findings }) => {
      await tab.goto(`${stack.userBaseUrl}/play/bubble-split/`);
      await tab.waitFor('Boolean(document.querySelector("[data-testid=\\"save-manager-open\\"]"))', 8000);
      const t0 = Date.now();
      await tab.evalJs('document.querySelector("[data-testid=\\"save-manager-open\\"]").click()');
      await tab.waitFor('Boolean(document.getElementById("saves-dialog")?.open)', 5000);
      await delay(250);
      const openMs = Date.now() - t0;

      const modalState = await tab.evalJs(`({
        open: Boolean(document.getElementById('saves-dialog')?.open),
        summary: document.getElementById('saves-summary')?.textContent?.trim() || '',
        errorVisible: !document.getElementById('saves-error')?.hidden,
        errorText: document.getElementById('saves-error')?.textContent?.trim() || '',
        hasRefreshBtn: Boolean(document.getElementById('save-refresh')),
        mainSaveHtmlLen: (document.getElementById('main-save')?.innerHTML || '').length,
      })`);

      // Click refresh inside modal
      await tab.evalJs('document.getElementById("save-refresh")?.click()');
      await delay(250);

      // Close via close button
      await tab.evalJs('document.querySelector("#saves-dialog [data-close=\\"saves-dialog\\"]")?.click()');
      await delay(150);
      const closedCleanly = await tab.evalJs('!document.getElementById("saves-dialog")?.open');

      if (!modalState.open || !closedCleanly) {
        findings.push(makeFinding('UC-05', FINDING_TYPES.BROKEN, 'high', '저장 기록 모달 열기/닫기 실패', JSON.stringify({ open: modalState.open, closedCleanly }), 'saves-dialog showModal/close 이벤트 점검'));
      }
      if (modalState.errorVisible && /500|SERVER_ERROR/i.test(modalState.errorText)) {
        findings.push(makeFinding('UC-05', FINDING_TYPES.BROKEN, 'high', '저장 기록 조회 중 서버 오류 표시', modalState.errorText, '/api/saves/:id/slots 오류 처리 점검'));
      }
      if (openMs > HUB_USE_CASES[4].sla.maxActionMs) {
        findings.push(makeFinding('UC-05', FINDING_TYPES.SLOW, 'medium', `저장 기록 모달 오픈 지연 (${openMs}ms)`, `SLA ${HUB_USE_CASES[4].sla.maxActionMs}ms 초과`, '슬롯 조회 API 지연 확인'));
      }
      return { openMs, ...modalState, closedCleanly };
    });

    // -------------------------------------------------------------------------
    // UC-06: 커뮤니티 댓글·개선 제안 작성·추천·수정·신고·삭제 풀 CRUD
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[5], async ({ findings }) => {
      await tab.goto(`${stack.userBaseUrl}/play/bubble-split/`);
      await tab.waitFor('Boolean(document.querySelector("[data-detail-panel=\\"community\\"]"))', 8000);
      await tab.evalJs('document.querySelector("[data-detail-panel=\\"community\\"]").click()');
      await tab.waitFor('Boolean(document.querySelector("[data-testid=\\"community-composer\\"]"))', 5000);

      // 1. Post comment
      const tPost0 = Date.now();
      await tab.evalJs(`(() => {
        const f = document.querySelector('[data-testid="community-composer"]');
        f.elements.kind.value = 'comment';
        f.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
        f.elements.body.value = 'E2E 자동화 테스트 댓글입니다.';
        f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()`);
      await tab.waitFor('document.querySelectorAll("[data-testid=\\"community-item\\"]").length >= 1', 6000);
      const commentPostMs = Date.now() - tPost0;

      // 2. Post suggestion
      await tab.evalJs(`(() => {
        const f = document.querySelector('[data-testid="community-composer"]');
        f.elements.kind.value = 'suggestion';
        f.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
        f.elements.title.value = '키보드 단축키 개선 제안';
        f.elements.body.value = 'R 키로 즉시 재시작 기능을 추가해 주세요.';
        f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()`);
      await tab.waitFor('document.querySelectorAll("[data-testid=\\"community-item\\"]").length >= 2', 6000);

      // 3. Upvote suggestion
      const tVote0 = Date.now();
      await tab.evalJs('document.querySelector("[data-testid=\\"community-vote\\"]")?.click()');
      await tab.waitFor('document.querySelector("[data-testid=\\"community-vote\\"]")?.getAttribute("aria-pressed") === "true"', 6000);
      const voteMs = Date.now() - tVote0;

      // 4. Edit first owned post
      await tab.evalJs(`(() => {
        const editBtn = document.querySelector('[data-action="edit"]');
        editBtn?.click();
        const form = editBtn?.closest('.community-item')?.querySelector('[data-form="edit"]');
        if (form) {
          form.elements.body.value = '수정된 E2E 테스트 내용입니다.';
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()`);
      await tab.waitFor('document.querySelector("[data-testid=\\"community-list\\"]")?.textContent?.includes("수정된 E2E 테스트 내용입니다.")', 6000);

      // 5. Report post
      await tab.evalJs(`(() => {
        const repBtn = document.querySelector('[data-action="report"]');
        repBtn?.click();
        const form = repBtn?.closest('.community-item')?.querySelector('[data-form="report"]');
        if (form) {
          form.elements.reason.value = '테스트 신고 사유';
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      })()`);
      await tab.waitFor('document.querySelector(".community-message")?.textContent?.includes("신고를 접수")', 6000);

      // 6. Delete one item
      const beforeDel = await tab.evalJs('document.querySelectorAll("[data-testid=\\"community-item\\"]").length');
      await tab.evalJs(`(() => {
        const delBtn = document.querySelector('[data-action="delete"]');
        delBtn?.click();
        const confirmBtn = delBtn?.closest('.community-item')?.querySelector('[data-action="confirm-delete"]');
        confirmBtn?.click();
      })()`);
      await tab.waitFor(`document.querySelectorAll("[data-testid=\\"community-item\\"]").length === ${beforeDel - 1}`, 6000);

      if (commentPostMs > HUB_USE_CASES[5].sla.maxApiMs || voteMs > HUB_USE_CASES[5].sla.maxApiMs) {
        findings.push(makeFinding('UC-06', FINDING_TYPES.SLOW, 'medium', `커뮤니티 쓰기 응답 지연 (등록 ${commentPostMs}ms / 추천 ${voteMs}ms)`, `SLA ${HUB_USE_CASES[5].sla.maxApiMs}ms 초과`, '커뮤니티 API 및 목록 재조회 최적화'));
      }
      return { commentPostMs, voteMs, itemsBeforeDelete: beforeDel, crudVerified: true };
    });

    // -------------------------------------------------------------------------
    // UC-07: 다국어(L10N) 전환 (ko → en → ja → ko), 미번역 잔존 탐지 & 영속성
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[6], async ({ findings }) => {
      await tab.goto(`${stack.userBaseUrl}/?view=account`);
      await tab.waitFor('Boolean(document.getElementById("language-select"))', 8000);

      const tSwitch0 = Date.now();
      await tab.evalJs(`(() => {
        const sel = document.getElementById('language-select');
        sel.value = 'en';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await delay(300);
      const switchMs = Date.now() - tSwitch0;

      // Navigate to browse in English and inspect visible Korean remnants
      await tab.goto(`${stack.userBaseUrl}/?view=browse`);
      await tab.waitFor('document.querySelectorAll("[data-testid=\\"game-card\\"]").length >= 5', 8000);
      await delay(300);
      const enCheck = await tab.evalJs(`(() => {
        const lang = document.documentElement.lang;
        const navText = document.querySelector('.site-nav')?.innerText || '';
        const headerText = document.querySelector('.site-header')?.innerText || '';
        const browseUiText = [
          document.getElementById('library-title')?.innerText || '',
          document.querySelector('.genre-filters')?.innerText || '',
          document.getElementById('browse-filters')?.innerText || '',
          document.querySelector('.site-footer')?.innerText || '',
        ].join(' ');
        const koMatchesNav = (navText.match(/[가-힣]{2,}/g) || []);
        const koMatchesUi = (browseUiText.match(/[가-힣]{2,}/g) || []);
        return { lang, navText: navText.trim(), koMatchesNav, koMatchesUi: [...new Set(koMatchesUi)].slice(0, 15) };
      })()`);

      if (shotDir) await tab.capturePng(path.join(shotDir, 'uc07-locale-en.png'));

      // Restore Korean
      await tab.goto(`${stack.userBaseUrl}/?view=account`);
      await tab.evalJs(`(() => {
        const sel = document.getElementById('language-select');
        sel.value = 'ko';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await delay(250);

      if (enCheck.lang !== 'en') {
        findings.push(makeFinding('UC-07', FINDING_TYPES.BROKEN, 'high', '영어 전환 후 새로고침/페이지 이동 시 언어 설정 미유지', `html[lang]=${enCheck.lang}`, 'localStorage/서버 /api/preferences 언어 동기화 점검'));
      }
      if (enCheck.koMatchesNav.length > 0) {
        findings.push(makeFinding('UC-07', FINDING_TYPES.USABILITY, 'medium', `영어(en) 모드 주 메뉴에 미번역 한글 잔존 (${enCheck.koMatchesNav.length}건)`, enCheck.koMatchesNav.join(', '), 'index.html data-l10n 키 및 locale-data.js 번역 보강'));
      }
      if (enCheck.koMatchesUi.length > 0) {
        findings.push(makeFinding('UC-07', FINDING_TYPES.USABILITY, 'medium', `영어(en) 모드 탐색 UI에 미번역 한글 잔존 (${enCheck.koMatchesUi.length}개 어구)`, enCheck.koMatchesUi.slice(0, 10).join(', '), 'app.js 동적 렌더링 문자열(전체 게임/장르/세부 필터) L10N 번역 연동'));
      }
      return { switchMs, enLangPersisted: enCheck.lang === 'en', koNavRemnants: enCheck.koMatchesNav, koUiRemnants: enCheck.koMatchesUi };
    });

    // -------------------------------------------------------------------------
    // UC-08: 계정 / 프라이버시 다이얼로그 / 만들기(PlayForge) 진입 & 미구현 탐지
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[7], async ({ findings }) => {
      await tab.goto(`${stack.userBaseUrl}/?view=account`);
      await tab.waitFor('!document.getElementById("account-panel")?.hidden', 8000);
      const acct = await tab.evalJs(`({
        identity: document.getElementById('identity')?.textContent?.trim() || '',
        help: document.getElementById('account-help')?.textContent?.trim() || '',
        googleBtnHidden: Boolean(document.getElementById('google-login')?.hidden),
        logoutHidden: Boolean(document.getElementById('logout')?.hidden),
      })`);

      // Open privacy dialog
      await tab.evalJs('document.querySelector("[data-privacy-open]")?.click()');
      await delay(120);
      const privacyOpen = await tab.evalJs('Boolean(document.getElementById("privacy-dialog")?.open)');
      await tab.evalJs('document.querySelector("#privacy-dialog [data-close=\\"privacy-dialog\\"]")?.click()');
      await delay(100);

      // Navigate to /?view=create
      await tab.goto(`${stack.userBaseUrl}/?view=create`);
      await tab.waitFor('Boolean(document.querySelector(".creator-page"))', 8000);
      const createState = await tab.evalJs(`({
        heading: document.querySelector('.creator-page h1')?.textContent?.trim() || '',
        forgeHref: document.querySelector('a[href*="/PlayForge"]')?.getAttribute('href') || null,
        creatorMsg: document.getElementById('creator')?.textContent?.trim().slice(0, 120) || '',
      })`);

      // Probe /PlayForge/ link availability
      let playForgeStatus = null;
      if (createState.forgeHref) {
        const res = await fetch(`${stack.userBaseUrl}${createState.forgeHref}`, { redirect: 'manual' });
        playForgeStatus = res.status;
      }

      if (!privacyOpen) {
        findings.push(makeFinding('UC-08', FINDING_TYPES.BROKEN, 'medium', '프라이버시 안내 다이얼로그가 열리지 않음', 'privacyOpen=false', 'data-privacy-open 핸들러 확인'));
      }
      if (acct.googleBtnHidden) {
        findings.push(makeFinding('UC-08', FINDING_TYPES.UNIMPLEMENTED, 'low', '로컬/기본 환경에서 Google 로그인 비활성(게스트 전용 모드)', acct.help, '운영/스테이징 배포 시 Google OAuth 환경변수(PLAYHUB_GOOGLE_*) 주입 필요'));
      }
      if (playForgeStatus !== 200 && playForgeStatus !== 302 && playForgeStatus !== 308) {
        findings.push(makeFinding('UC-08', FINDING_TYPES.BROKEN, 'medium', `만들기 탭 PlayForge 링크(${createState.forgeHref}) 응답 오류`, `HTTP ${playForgeStatus}`, 'hub/dist/user/PlayForge/index.html 및 프록시 경로 확인'));
      }
      return { ...acct, privacyOpen, ...createState, playForgeStatus };
    });

    // -------------------------------------------------------------------------
    // UC-09: 예외 복구·비정상 경로·XSS·빠른 연속 탭 전환·관리자 격리
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[8], async ({ findings }) => {
      // 1. Non-existent game URL
      await tab.goto(`${stack.userBaseUrl}/play/nonexistent-game-xyz/`);
      await tab.waitFor('Boolean(document.querySelector(".empty-state"))', 6000);
      const notFoundState = await tab.evalJs(`({
        title: document.querySelector('.empty-state h1')?.textContent?.trim() || '',
        hasHomeBtn: Boolean(document.querySelector('.empty-state a[data-home]')),
      })`);

      // 2. XSS search query
      await tab.evalJs(`(() => {
        window.__xssTriggered = false;
        const input = document.getElementById('search');
        input.value = '<img src=x onerror="window.__xssTriggered=true"><script>window.__xssTriggered=true</script>';
        document.getElementById('search-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      })()`);
      await delay(250);
      const xssTriggered = await tab.evalJs('Boolean(window.__xssTriggered)');

      // 3. Rapid navigation race (Home -> Browse -> Wishlist -> Create -> Account -> Home)
      const tRapid0 = Date.now();
      await tab.evalJs(`(() => {
        for (const sel of ['[data-nav-view="library"]', '[data-nav-view="wishlist"]', '[data-nav-view="create"]', '[data-nav-view="account"]', '[data-nav-view="home"]']) {
          document.querySelector(sel)?.click();
        }
      })()`);
      await tab.waitFor('document.querySelectorAll("[data-testid=\\"game-card\\"]").length >= 5', 6000);
      const rapidNavMs = Date.now() - tRapid0;

      // 4. Security boundary: public listener must block /api/admin/* and /internal/*
      const adminHealthRes = await fetch(`${stack.userBaseUrl}/api/admin/health`);
      const adminPolicyRes = await fetch(`${stack.userBaseUrl}/api/admin/release-policy`);
      const internalRes = await fetch(`${stack.userBaseUrl}/internal/session/verify`, { method: 'POST' });

      if (!notFoundState.hasHomeBtn) {
        findings.push(makeFinding('UC-09', FINDING_TYPES.USABILITY, 'medium', '존재하지 않는 게임(404) 화면에 홈 복귀 버튼 누락', JSON.stringify(notFoundState), 'empty-state 홈 링크 유지'));
      }
      if (xssTriggered) {
        findings.push(makeFinding('UC-09', FINDING_TYPES.STABILITY, 'critical', '검색어 XSS 실행 감지', 'window.__xssTriggered=true', 'esc() 출력 이스케이프 강화'));
      }
      if (adminHealthRes.status !== 404 || adminPolicyRes.status !== 404 || internalRes.status !== 404) {
        findings.push(makeFinding('UC-09', FINDING_TYPES.STABILITY, 'critical', 'Public 리스너에서 관리자/내부 API 노출', `admin/health=${adminHealthRes.status}, admin/release-policy=${adminPolicyRes.status}, internal=${internalRes.status}`, 'publicHandler 경로 격리 유지'));
      }
      return { notFoundState, xssTriggered, rapidNavMs, adminBoundary404: adminHealthRes.status === 404 && adminPolicyRes.status === 404 && internalRes.status === 404 };
    });

    // -------------------------------------------------------------------------
    // UC-10: 버전·호환성 게이트(COMPAT_*) & 핵심 Hub API 응답 지연 프로파일
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[9], async ({ findings }) => {
      const endpoints = [
        { name: 'GET /api/health', url: `${stack.userBaseUrl}/api/health`, method: 'GET' },
        { name: 'GET /api/version', url: `${stack.userBaseUrl}/api/version`, method: 'GET' },
        { name: 'GET /api/games', url: `${stack.userBaseUrl}/api/games`, method: 'GET' },
        {
          name: 'POST /api/compat/check (ALLOW)',
          url: `${stack.userBaseUrl}/api/compat/check`,
          method: 'POST',
          body: { target: 'aos', engineAbi: 'godot-4.7', engineApiRev: 1, netProtocol: '1.0', gameplayHash: 'default' },
          expectStatus: 200,
        },
        {
          name: 'POST /api/compat/check (BLOCK 426)',
          url: `${stack.userBaseUrl}/api/compat/check`,
          method: 'POST',
          body: { target: 'aos', engineAbi: 'godot-4.6' },
          expectStatus: 426,
        },
      ];

      apiProfile = [];
      for (const ep of endpoints) {
        const samples = [];
        let lastStatus = 0;
        let errors = 0;
        for (let i = 0; i < 10; i++) {
          const t0 = performance.now();
          const res = await fetch(ep.url, {
            method: ep.method,
            headers: ep.body ? { 'Content-Type': 'application/json' } : {},
            body: ep.body ? JSON.stringify(ep.body) : undefined,
          });
          await res.text();
          samples.push(performance.now() - t0);
          lastStatus = res.status;
          const expected = ep.expectStatus ?? 200;
          if (res.status !== expected) errors++;
        }
        const p50 = roundNum(percentile(samples, 50), 1);
        const p95 = roundNum(percentile(samples, 95), 1);
        const max = roundNum(Math.max(...samples), 1);
        apiProfile.push({ name: ep.name, status: lastStatus, errors, p50Ms: p50, p95Ms: p95, maxMs: max });

        if (errors > 0) {
          findings.push(makeFinding('UC-10', FINDING_TYPES.BROKEN, 'high', `${ep.name} 기대 상태코드 불일치 (${errors}/10건)`, `status=${lastStatus}`, '해당 API 라우트 응답 상태 확인'));
        }
        if (p95 > HUB_USE_CASES[9].sla.maxP95ApiMs) {
          findings.push(makeFinding('UC-10', FINDING_TYPES.SLOW, 'medium', `${ep.name} P95 응답 지연 (${p95}ms)`, `SLA ${HUB_USE_CASES[9].sla.maxP95ApiMs}ms 초과`, '핸들러 동기 I/O 및 캐싱 점검'));
        }
      }
      return { apiProfile };
    });

    // -------------------------------------------------------------------------
    // UC-11: 모바일 반응형 & 터치 편의성 (390×844 뷰포트)
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[10], async ({ findings }) => {
      await tab.setViewport(390, 844, true);
      const mobileChecks = [];
      for (const route of ['/', '/?view=browse', '/play/bubble-split/', '/?view=account']) {
        const loadMs = await tab.goto(`${stack.userBaseUrl}${route}`);
        await delay(250);
        const check = await tab.evalJs(`(() => {
          const overflowPx = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);
          const interactive = [...document.querySelectorAll('a, button, select, input')].filter(el => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.classList.contains('skip-link');
          });
          const smallTargets = interactive
            .filter(el => el.getBoundingClientRect().height < 36 || el.getBoundingClientRect().width < 36)
            .map(el => ({
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 24),
              w: Math.round(el.getBoundingClientRect().width),
              h: Math.round(el.getBoundingClientRect().height),
            }));
          return { overflowPx, interactiveCount: interactive.length, smallTargetsCount: smallTargets.length, smallSample: smallTargets.slice(0, 5) };
        })()`);
        mobileChecks.push({ route, loadMs, ...check });

        if (shotDir && route === '/') {
          await tab.capturePng(path.join(shotDir, 'uc11-mobile-home.png'));
        }
        if (check.overflowPx > 2) {
          findings.push(makeFinding('UC-11', FINDING_TYPES.USABILITY, 'high', `모바일(390px) ${route} 가로 스크롤 넘침 (+${check.overflowPx}px)`, `overflowPx=${check.overflowPx}`, 'user.css 모바일 미디어쿼리 및 flex/grid min-width:0 점검'));
        }
        if (check.smallTargetsCount > 0) {
          findings.push(makeFinding('UC-11', FINDING_TYPES.USABILITY, 'low', `모바일(390px) ${route} 소형 터치 타깃(<36px) ${check.smallTargetsCount}개`, check.smallSample.map((s) => `${s.tag}("${s.text}" ${s.w}x${s.h})`).join(', '), '모바일 터치 접근성 기준(최소 40~44px) 충족 권장'));
        }
      }
      await tab.setViewport(1280, 800, false);
      return { mobileChecks };
    });

    // -------------------------------------------------------------------------
    // UC-12: 운영자(Admin Console) 로그인 → 6대 탭 + 릴리스·강업 정책 UI 순회
    // -------------------------------------------------------------------------
    await runCase(HUB_USE_CASES[11], async ({ findings }) => {
      const adminTab = await browser.openTab();
      try {
        const loadMs = await adminTab.goto(`${stack.adminBaseUrl}/`);
        await adminTab.waitFor('!document.getElementById("login-panel")?.hidden', 8000);

        const tLogin0 = Date.now();
        await adminTab.evalJs(`(() => {
          document.getElementById('username').value = ${JSON.stringify(stack.adminCredentials.username)};
          document.getElementById('password').value = ${JSON.stringify(stack.adminCredentials.password)};
          document.getElementById('login-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        })()`);
        await adminTab.waitFor('!document.getElementById("dashboard")?.hidden', 10000);
        const loginMs = Date.now() - tLogin0;

        // Walk all 6 primary tabs + system/release-policy
        const tabIds = ['system', 'hub', 'forge', 'qa', 'l10n', 'store'];
        const tabTimings = {};
        for (const tid of tabIds) {
          const t0 = Date.now();
          await adminTab.evalJs(`document.querySelector('[data-testid="admin-tab-${tid}"]')?.click()`);
          await delay(300);
          tabTimings[tid] = Date.now() - t0;
        }

        // Open system -> release-policy subview and verify 6-target force/optional panel renders
        await adminTab.evalJs('document.querySelector("[data-testid=\\"admin-tab-system\\"]")?.click()');
        await delay(250);
        const hasReleasePolicyNav = await adminTab.evalJs('Boolean(document.querySelector("[data-testid=\\"subnav-system-release-policy\\"]"))');
        let releasePolicyControls = 0;
        if (hasReleasePolicyNav) {
          await adminTab.evalJs('document.querySelector("[data-testid=\\"subnav-system-release-policy\\"]")?.click()');
          await adminTab.waitFor('Boolean(document.querySelector("[data-testid=\\"release-policy-form\\"]"))', 6000);
          releasePolicyControls = await adminTab.evalJs('document.querySelectorAll("[data-testid^=\\"target-policy-\\"]").length');
          if (shotDir) await adminTab.capturePng(path.join(shotDir, 'uc12-admin-release-policy.png'));
        }

        const adminTel = adminTab.telemetry();
        if (adminTel.pageErrors.length > 0) {
          findings.push(makeFinding('UC-12', FINDING_TYPES.STABILITY, 'high', `Admin 콘솔 JS 예외 ${adminTel.pageErrors.length}건`, adminTel.pageErrors.slice(0, 3).join(' | '), 'Admin 콘솔 뷰 렌더링 예외 수정'));
        }
        if (adminTel.httpFailures.length > 0) {
          findings.push(makeFinding('UC-12', FINDING_TYPES.BROKEN, 'medium', `Admin 콘솔 순회 중 API/리소스 오류 ${adminTel.httpFailures.length}건`, adminTel.httpFailures.map((x) => `${x.status} ${x.url}`).slice(0, 4).join(', '), '실패한 Admin 엔드포인트 확인'));
        }
        if (!hasReleasePolicyNav || releasePolicyControls < 6) {
          findings.push(makeFinding('UC-12', FINDING_TYPES.UNIMPLEMENTED, 'high', 'Admin 릴리스·강업 정책 UI 미노출 또는 타깃 컨트롤 누락', `nav=${hasReleasePolicyNav}, controls=${releasePolicyControls}`, 'PlayHub-Admin release-policy 뷰 확인'));
        }
        return { loadMs, loginMs, tabTimings, hasReleasePolicyNav, releasePolicyControls };
      } finally {
        adminTab.close();
      }
    });
  } finally {
    tab.close();
    await browser.close();
    await stack.close();
  }

  const finishedMs = Date.now();
  const scores = computeDimensionScores(scenarioResults, allFindings);
  const passedCount = scenarioResults.filter((s) => s.status === 'passed').length;
  const warnedCount = scenarioResults.filter((s) => s.status === 'warned').length;
  const failedCount = scenarioResults.filter((s) => s.status === 'failed').length;

  const findingCounts = {
    [FINDING_TYPES.UNIMPLEMENTED]: allFindings.filter((f) => f.type === FINDING_TYPES.UNIMPLEMENTED).length,
    [FINDING_TYPES.BROKEN]: allFindings.filter((f) => f.type === FINDING_TYPES.BROKEN).length,
    [FINDING_TYPES.SLOW]: allFindings.filter((f) => f.type === FINDING_TYPES.SLOW).length,
    [FINDING_TYPES.STABILITY]: allFindings.filter((f) => f.type === FINDING_TYPES.STABILITY).length,
    [FINDING_TYPES.USABILITY]: allFindings.filter((f) => f.type === FINDING_TYPES.USABILITY).length,
  };

  const report = {
    schemaVersion: 1,
    runId: `hub-uc-${new Date(finishedMs).toISOString().replace(/[:.]/g, '-')}`,
    generatedAtUtc: new Date(finishedMs).toISOString(),
    generatedAtKst: formatKstTimestamp(finishedMs),
    durationMs: finishedMs - startedMs,
    browserExecutable: browser.executablePath,
    nodeVersion: process.version,
    summary: {
      totalScenarios: scenarioResults.length,
      passedScenarios: passedCount,
      warnedScenarios: warnedCount,
      failedScenarios: failedCount,
      totalFindings: allFindings.length,
      findingCounts,
    },
    scores,
    apiProfile,
    scenarios: scenarioResults,
    findings: allFindings,
  };

  const written = writeUseCaseReportArtifacts({ outDir, report });
  return { report, outDir, ...written };
}
