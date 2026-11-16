#!/usr/bin/env node
/** Optional real-browser acceptance checks. No trace, screenshot, video, HAR or auth-state files. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAMES = ['match3-garden','falling-blocks','bubble-split','brick-breaker','slide-puzzle','mines-grid','memory-pairs','merge-tiles'];
const SELECTORS = {
  card: id => `[data-testid="game-card"][data-game-id="${id}"], .game-card[data-game-link="${id}"]`,
  launch: '[data-testid="launch-game"], #play-button',
  frame: 'iframe[data-testid="game-frame"], #player-panel iframe',
  save: '[data-testid="save-status"], #save-indicator'
};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
class CheckError extends Error { constructor(code, message) { super(message); this.name='CheckError'; this.code=code; } }
function requireCheck(value, code, message) { if (!value) throw new CheckError(code, message); }
function origin(value) {
  const url = new URL(value);
  requireCheck(['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname==='/', 'INVALID_ENDPOINT', '주소는 자격증명·경로·query 없는 HTTP(S) origin이어야 합니다.');
  return url.origin;
}
function parseArgs(args) {
  const result = {};
  const flags = new Set(['headed','help']);
  const values = new Set(['user','admin','public-api','admin-api','channel','executable','report','timeout']);
  for (let i=0;i<args.length;i++) {
    const name = args[i].replace(/^--/, '');
    if (!args[i].startsWith('--') || (!flags.has(name) && !values.has(name))) throw new CheckError('INVALID_ARGUMENT','지원하지 않는 인수가 있습니다. --help를 확인하세요. 비밀번호는 stdin JSON으로만 전달합니다.');
    if (flags.has(name)) result[name]=true;
    else {
      requireCheck(i+1<args.length && !args[i+1].startsWith('--'),'MISSING_ARGUMENT','옵션 값이 빠졌습니다.');
      result[name]=args[++i];
    }
  }
  return result;
}
async function readCredentials() {
  if (process.stdin.isTTY) return {};
  let size=0; const chunks=[];
  for await (const chunk of process.stdin) {
    size+=chunk.length;
    requireCheck(size<=16384,'STDIN_TOO_LARGE','stdin JSON은 16KiB 이하여야 합니다.');
    chunks.push(chunk);
  }
  const text=Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,'').trim();
  let value;
  try { value=text?JSON.parse(text):{}; } catch { throw new CheckError('INVALID_STDIN','stdin은 빈 객체 또는 관리자 username/password JSON이어야 합니다.'); }
  requireCheck(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(key=>['username','password'].includes(key)),'INVALID_STDIN','stdin에는 username/password만 허용합니다.');
  const provided=typeof value.username==='string' && value.username.length>0 && value.username.length<=128 && typeof value.password==='string' && value.password.length>0 && value.password.length<=1024;
  requireCheck(Object.keys(value).length===0 || provided,'INVALID_STDIN','관리자 이름과 비밀번호는 함께 전달해야 합니다.');
  return value;
}
function safeError(error) {
  // Playwright call logs can include the value passed to fill(). Never persist
  // arbitrary exception messages/stacks, page console text, request headers or bodies.
  if (error instanceof CheckError) return {code:error.code,message:error.message};
  if (error?.name==='TimeoutError') return {code:'BROWSER_TIMEOUT',message:'정해진 시간 안에 화면·응답 조건을 확인하지 못했습니다. 해당 단계의 선택자와 IIS/API 연결을 확인하세요.'};
  if (error?.code==='ERR_ASSERTION') return {code:'ASSERTION_FAILED',message:'화면 또는 저장 상태의 예상값과 실제값이 다릅니다.'};
  return {code:'BROWSER_ACTION_ERROR',message:'브라우저 동작 또는 HTTP 요청에 실패했습니다. 비밀정보가 포함될 수 있는 원문 오류는 보고서에 기록하지 않습니다.'};
}
function newReport() {
  return {
    schemaVersion:1,tool:'playhub-browser-e2e',toolVersion:'0.2.0',status:'not_run',passed:false,
    generatedAt:new Date().toISOString(),browserExecuted:false,
    environment:{node:process.version,platform:process.platform},endpoints:null,
    evidencePolicy:{screenshots:false,video:false,trace:false,har:false,storageState:false,credentialsRecorded:false},
    impact:{liveDataCreated:false,qaDataCreated:false,qaRunIds:[],adminStateRestored:null,notice:'페이지를 열기 전에 서버가 분류한 QA 세션을 준비합니다. QA 게스트·플레이·저장·노출은 실제 지표와 분리됩니다. 인증한 관리자 검사는 게임 하나의 공개 상태를 잠시 바꾼 뒤 원래 값으로 복원합니다.'},
    limitations:['실제 Google 계정 인증은 검사하지 않습니다.','다른 LAN 기기에서의 접속과 Windows 방화벽 경계는 별도 확인이 필요합니다.','게임 핵심 규칙 검사를 대체하지 않으며 tests/games.rules.test.mjs를 함께 사용합니다.'],
    checks:[],summary:{pass:0,fail:0,skip:0,not_run:0}
  };
}
function saveReport(report, filename) {
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
  const rows=report.checks.map(check=>`<tr><td>${escapeHtml(check.id)}</td><td class="${check.status}">${escapeHtml(check.status)}</td><td>${escapeHtml(check.title)}</td><td>${escapeHtml(check.message || check.error?.message || '')}</td><td>${escapeHtml(check.error?.code || '')}</td></tr>`).join('');
  const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>PlayHub 브라우저 검증 보고서</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#193731;max-width:1180px;margin:36px auto;padding:0 20px}h1{font-size:28px}.notice{background:#fff4dc;border-left:4px solid #d8a541;padding:16px}.summary{display:flex;gap:18px;flex-wrap:wrap}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #ccdcd7;padding:10px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#edf4f0}.pass{color:#0d6e45}.fail{color:#a92929}.skip,.not_run{color:#805900}code{background:#edf4f0;padding:2px 6px}</style></head><body><h1>PlayHub 브라우저 검증</h1><p><strong>상태: ${escapeHtml(report.status)} · passed: ${report.passed}</strong></p><p>${escapeHtml(report.generatedAt)} · ${escapeHtml(report.environment.node)} · ${escapeHtml(report.environment.platform)} · 브라우저 실행 ${report.browserExecuted?'확인':'미실행'}</p><p class="summary">pass ${report.summary.pass} / fail ${report.summary.fail} / skip ${report.summary.skip} / not_run ${report.summary.not_run}</p><p class="notice">${escapeHtml(report.impact.notice)}</p>${report.blocker?`<p class="notice">${escapeHtml(report.blocker.code)} · ${escapeHtml(report.blocker.message)}</p>`:''}<table><thead><tr><th>ID</th><th>상태</th><th>검사</th><th>결과</th><th>오류 코드</th></tr></thead><tbody>${rows}</tbody></table><h2>해석 범위</h2><ul>${report.limitations.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul><p>스크린샷, 비디오, trace, HAR, cookie/CSRF, 관리자 비밀번호, 저장 payload를 기록하지 않습니다. skip 또는 not_run이 있는 결과는 전체 통과가 아닙니다.</p></body></html>`;
  fs.writeFileSync(filename.replace(/\.json$/i,'')+'.html',html,{encoding:'utf8',mode:0o600});
}
async function until(predicate, timeout, message) {
  const end=Date.now()+timeout;
  while (Date.now()<end) { if (await predicate()) return; await delay(100); }
  throw new CheckError('CONDITION_TIMEOUT',message);
}
async function hasText(locator, pattern, timeout) {
  await until(async()=>pattern.test((await locator.textContent()) || ''),timeout,'화면의 예상 상태 문구를 확인하지 못했습니다.');
}
async function apiJson(request, base, route, requestOrigin, {method='GET',body,headers={},expected=200}={}) {
  const response=await request.fetch(base+route,{method,headers:{Origin:requestOrigin,...headers},...(body===undefined?{}:{data:body}),timeout:15000,failOnStatusCode:false});
  const statuses=Array.isArray(expected)?expected:[expected];
  requireCheck(statuses.includes(response.status()),'HTTP_STATUS',`HTTP 상태 ${response.status()}이며 예상 상태 ${statuses.join('/')}와 다릅니다.`);
  return await response.json();
}
async function prepareQaContext(context,endpoints,report){
  const session=await apiJson(context.request,endpoints.publicApi,'/api/session',endpoints.user);
  requireCheck(session.kind==='anonymous','QA_FRESH_CONTEXT','QA는 새 익명 브라우저 context에서 시작해야 합니다.');
  const qa=await apiJson(context.request,endpoints.publicApi,'/api/qa/session',endpoints.user,{method:'POST',body:{},headers:{'X-CSRF-Token':session.csrfToken},expected:[200,201]});
  requireCheck(qa.trafficType==='qa' && /^[0-9a-f-]{36}$/i.test(qa.qaRunId || ''),'QA_CLASSIFICATION','서버 QA 분류를 확인하지 못해 페이지를 열지 않았습니다.');
  report.impact.qaRunIds.push(qa.qaRunId);return qa;
}
function legalMatchPair(symbols) {
  const matching=cells=>{
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const i=r*8+c;
      if (c<6 && cells[i]===cells[i+1] && cells[i]===cells[i+2]) return true;
      if (r<6 && cells[i]===cells[i+8] && cells[i]===cells[i+16]) return true;
    }
    return false;
  };
  for (let i=0;i<64;i++) for (const j of [i%8<7?i+1:-1,i<56?i+8:-1]) {
    if (j<0 || symbols[i]===symbols[j]) continue;
    const trial=[...symbols];[trial[i],trial[j]]=[trial[j],trial[i]];
    if (matching(trial)) return [i,j];
  }
  return null;
}
async function openGame(page, id, timeout, fromCard=true) {
  if (fromCard) {
    await page.goto(new URL('/',page.url()).href,{waitUntil:'domcontentloaded'});
    const card=page.locator(SELECTORS.card(id)).first();
    await card.waitFor({state:'visible'});await card.scrollIntoViewIfNeeded();
    // The product's visible-impression definition is 1 second; this is intentional.
    await delay(1100);await card.click();
  }
  await page.waitForURL(url=>url.pathname===`/play/${id}/` || url.pathname===`/play/${id}`);
  const launch=page.locator(SELECTORS.launch).first();await launch.waitFor({state:'visible'});
  requireCheck(!(await launch.isDisabled()),'LAUNCH_DISABLED','공개 게임의 실행 버튼이 비활성입니다. API 연결 또는 게임 공개 상태를 확인하세요.');
  await launch.click();
  const frameElement=page.locator(SELECTORS.frame).first();await frameElement.waitFor({state:'visible'});
  assert.deepEqual((await frameElement.getAttribute('sandbox') || '').trim().split(/\s+/).filter(Boolean).sort(),['allow-scripts']);
  const src=new URL(await frameElement.getAttribute('src'),page.url());
  requireCheck(src.origin===new URL(page.url()).origin && src.pathname===`/games/${id}/index.html` && !src.search,'FRAME_ENTRY','iframe 진입 경로 또는 query 정책이 예상과 다릅니다.');
  requireCheck(await frameElement.getAttribute('referrerpolicy')==='no-referrer','FRAME_REFERRER','게임 iframe의 referrer policy가 no-referrer가 아닙니다.');
  await frameElement.scrollIntoViewIfNeeded();
  await frameElement.evaluate(element=>element.scrollIntoView({behavior:'instant',block:'center'}));
  const frame=page.frameLocator(SELECTORS.frame).first();
  await frame.locator('#primary').waitFor({state:'visible'});
  await until(async()=>!(await frame.locator('#primary').isDisabled()),timeout,'게임의 시작 버튼 준비가 끝나지 않았습니다.');
  return frame;
}
async function startAndInput(page, frame, id, timeout, touch=false) {
  const primary=frame.locator('#primary');
  if (touch) await primary.tap(); else await primary.click();
  await frame.locator('#overlay').waitFor({state:'hidden'});
  const infoBefore=await frame.locator('#info').textContent();
  if (id==='match3-garden') {
    const cells=frame.locator('#board button'),symbols=await cells.allTextContents(),pair=legalMatchPair(symbols);
    requireCheck(pair,'MATCH_INPUT','현재 보드에서 인접한 유효 매치 입력을 찾지 못했습니다.');
    await cells.nth(pair[0]).click();await cells.nth(pair[1]).click();
    await until(async()=>await frame.locator('#info').textContent()!==infoBefore,timeout,'매치 입력 뒤 남은 이동 수가 바뀌지 않았습니다.');
  } else if (id==='slide-puzzle') {
    const cells=frame.locator('#board button'),values=await cells.allTextContents();
    const empty=values.findIndex(value=>!value.trim());
    requireCheck(empty>=0,'SLIDE_BOARD','슬라이드 보드의 빈칸을 찾지 못했습니다.');
    const adjacent=empty%3>0?empty-1:empty+1;await cells.nth(adjacent).click();
    await until(async()=>await frame.locator('#info').textContent()!==infoBefore,timeout,'슬라이드 입력 뒤 이동 횟수가 바뀌지 않았습니다.');
  } else if (id==='memory-pairs') {
    await frame.locator('#board button').nth(0).click();await frame.locator('#board button').nth(1).click();
    await until(async()=>await frame.locator('#info').textContent()!==infoBefore,timeout,'카드 두 장 입력 뒤 시도 수가 바뀌지 않았습니다.');
  } else if (id==='mines-grid') {
    await frame.locator('#board button').first().click();
    await until(async()=>await frame.locator('#board .revealed').count()>0,timeout,'첫 칸 입력 뒤 보드가 열리지 않았습니다.');
  } else if (id==='merge-tiles') {
    for (const action of ['left','up','right','down']) {
      if (touch) await frame.locator(`[data-action="${action}"]`).tap();else await frame.locator(`[data-action="${action}"]`).click();
    }
    await until(async()=>await frame.locator('#info').textContent()!==infoBefore,timeout,'숫자 퍼즐 조작 뒤 이동 횟수가 바뀌지 않았습니다.');
  } else if (id==='falling-blocks') {
    await frame.locator('[data-action="rotate"]').click();await frame.locator('[data-action="drop"]').click();
    await page.keyboard.press('ArrowLeft');
  } else {
    await frame.locator('[data-action="fire"]').click();
    await page.keyboard.down('ArrowRight');await delay(180);await page.keyboard.up('ArrowRight');
    await frame.locator('#canvas').click({position:{x:80,y:80}});
  }
}
async function pauseAndReadSave(page, frame, id, endpoints, timeout) {
  const savedResponse=page.waitForResponse(response=>{
    const url=new URL(response.url());
    return url.origin===endpoints.publicApi && url.pathname===`/api/saves/${id}` && response.request().method()==='PUT' && [200,201].includes(response.status());
  },{timeout});
  const pauseAction=(async()=>{
    if (!(await frame.locator('#overlay').isVisible())) await frame.locator('#pause').click();
    else {
      await frame.locator('#primary').click();await frame.locator('#overlay').waitFor({state:'hidden'});await frame.locator('#pause').click();
    }
  })();
  await Promise.all([savedResponse,pauseAction]);
  await hasText(frame.locator('#save-state'),/^진행 저장됨$/,timeout);
  await hasText(page.locator(SELECTORS.save).first(),/서버.*저장/,timeout);
  const save=await apiJson(page.context().request,endpoints.publicApi,`/api/saves/${id}`,endpoints.user);
  requireCheck(Number.isInteger(save.revision) && save.revision>=1 && save.payload?.gameId===id && save.payload.runStarted===true && save.payload.state && typeof save.payload.state==='object','SAVE_STATE','실제 게스트 저장의 revision 또는 게임 진행 형식이 예상과 다릅니다.');
  return save;
}

export async function runBrowserQA(options={},credentials={}) {
  const report=newReport(), filename=path.resolve(options.report || path.join(HERE,'reports','browser-e2e.json'));
  const timeout=Number(options.timeout || 20000);
  let browser,userContext,adminContext,mobileContext,adminPage,userPage,changed=null,authenticated=false;
  const runtimeErrors={user:0,admin:0,mobile:0};
  const step=async(id,title,fn)=>{
    const check={id,title,status:'not_run'},started=Date.now();report.checks.push(check);
    try { const result=await fn();check.status='pass';check.message=result?.message || '실제 브라우저에서 확인했습니다.';if(result?.evidence)check.evidence=result.evidence;return result?.value; }
    catch(error) {check.status='fail';check.error=safeError(error);return undefined;}
    finally {check.durationMs=Date.now()-started;console.log(`${check.status.toUpperCase()} ${id}`);}
  };
  const skip=(id,title,message)=>report.checks.push({id,title,status:'skip',message});
  try {
    requireCheck(Number(process.versions.node.split('.')[0])>=24,'NODE_VERSION','Node.js 24 이상이 필요합니다.');
    requireCheck(Number.isFinite(timeout) && timeout>=3000 && timeout<=120000,'TIMEOUT_RANGE','timeout은 3,000~120,000ms 범위여야 합니다.');
    const endpoints={user:origin(options.user || 'http://localhost:8080'),admin:origin(options.admin || 'http://127.0.0.1:8081'),publicApi:origin(options['public-api'] || 'http://localhost:8090'),adminApi:origin(options['admin-api'] || 'http://127.0.0.1:8091')};
    requireCheck(new Set(Object.values(endpoints)).size===4,'ENDPOINT_ISOLATION','사용자·관리자 사이트와 두 API는 서로 다른 origin이어야 합니다.');
    report.endpoints=endpoints;
    const executable=options.executable || process.env.PLAYHUB_BROWSER_EXECUTABLE;
    const channel=options.channel || process.env.PLAYHUB_BROWSER_CHANNEL || (process.platform==='win32' && !executable?'msedge':undefined);
    requireCheck(!(executable && channel),'BROWSER_SELECTION','executable과 channel은 하나만 지정하세요.');
    requireCheck(Boolean(executable || channel),'BROWSER_SELECTION','Windows 외 환경에서는 --executable 또는 --channel을 명시하세요.');
    report.environment.browser=executable?'explicit executable':channel;report.environment.headless=!options.headed;
    let chromium;
    try { ({chromium}=await import('playwright')); }
    catch { throw new CheckError('TOOLS_NOT_INSTALLED','선택형 QA 도구가 없습니다. Windows에서는 -InstallTools 옵션으로 qa 폴더에만 설치하세요.'); }
    try { browser=await chromium.launch({headless:!options.headed,timeout,...(executable?{executablePath:path.resolve(executable)}:{channel})}); }
    catch { throw new CheckError('BROWSER_LAUNCH_FAILED','선택한 실제 브라우저를 실행하지 못했습니다. Edge 설치·실행 권한·환경을 확인하세요. 우회 옵션이나 가짜 통과는 적용하지 않았습니다.'); }
    report.browserExecuted=true;report.environment.browserVersion=browser.version();
    userContext=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
    adminContext=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
    for (const context of [userContext,adminContext]) {context.setDefaultTimeout(timeout);context.setDefaultNavigationTimeout(timeout);}
    await prepareQaContext(userContext,endpoints,report);
    userPage=await userContext.newPage();adminPage=await adminContext.newPage();
    userPage.on('pageerror',()=>runtimeErrors.user++);adminPage.on('pageerror',()=>runtimeErrors.admin++);

    await step('BROWSER-SITES','사용자·관리자 별도 문서와 API 상태',async()=>{
      await userPage.goto(endpoints.user+'/',{waitUntil:'domcontentloaded'});report.impact.qaDataCreated=true;
      await adminPage.goto(endpoints.admin+'/',{waitUntil:'domcontentloaded'});
      await userPage.locator('#search-form').waitFor({state:'visible'});await adminPage.locator('#login-panel').waitFor({state:'visible'});
      requireCheck(await userPage.locator('#login-panel').count()===0 && await adminPage.locator('#search-form').count()===0,'DOCUMENT_ISOLATION','사용자·관리자 문서가 분리되어 있지 않습니다.');
      const publicHealth=await apiJson(userContext.request,endpoints.publicApi,'/api/health',endpoints.user);
      const adminHealth=await apiJson(adminContext.request,endpoints.adminApi,'/api/health',endpoints.admin);
      requireCheck(publicHealth.service==='public' && adminHealth.service==='admin','LISTENER_IDENTITY','API listener 식별이 다릅니다.');
      return {message:'두 실제 문서와 독립 public/admin API health를 확인했습니다.'};
    });
    await step('BROWSER-BOUNDARIES','공개·관리자 API의 403/404 및 무인증 401',async()=>{
      await apiJson(userContext.request,endpoints.publicApi,'/api/admin/metrics?dataset=live',endpoints.user,{expected:404});
      await apiJson(adminContext.request,endpoints.adminApi,'/api/games',endpoints.admin,{expected:404});
      await apiJson(adminContext.request,endpoints.adminApi,'/api/admin/metrics?dataset=live',endpoints.admin,{expected:401});
      await apiJson(userContext.request,endpoints.adminApi,'/api/admin/metrics?dataset=live',endpoints.user,{expected:403});
      await apiJson(userContext.request,endpoints.publicApi,'/api/session',endpoints.user);
      await apiJson(userContext.request,endpoints.publicApi,'/api/play-sessions',endpoints.user,{method:'POST',body:{gameId:GAMES[0]},expected:403});
      return {message:'실제 HTTP 응답으로 listener 404, 미허용 Origin/누락 CSRF 403, 관리자 무인증 401을 확인했습니다.'};
    });
    await step('BROWSER-CATALOG','기본 게임 8종의 실제 카드',async()=>{
      await userPage.bringToFront();await userPage.goto(endpoints.user+'/',{waitUntil:'domcontentloaded'});
      const catalog=await apiJson(userContext.request,endpoints.publicApi,'/api/games',endpoints.user);
      requireCheck(Array.isArray(catalog.games) && GAMES.every(id=>catalog.games.some(game=>game.id===id)),'EIGHT_GAMES_REQUIRED','기본 8종이 모두 공개되어 있어야 전체 브라우저 검사를 진행할 수 있습니다.');
      for (const id of GAMES) {const card=userPage.locator(SELECTORS.card(id)).first();await card.waitFor({state:'attached'});assert.equal(await card.getAttribute('href'),`/play/${id}/`);}
      return {message:'기본 8종 카드와 /play/<id>/ 링크를 확인했습니다.',evidence:{gameIds:GAMES}};
    });
    let resumeProof=null;
    for (const id of GAMES) await step('BROWSER-GAME-'+id,id+' 카드 → iframe → 실제 입력 → 서버 저장',async()=>{
      await userPage.bringToFront();const errorsBefore=runtimeErrors.user;
      const frame=await openGame(userPage,id,timeout);await startAndInput(userPage,frame,id,timeout);
      const save=await pauseAndReadSave(userPage,frame,id,endpoints,timeout);
      requireCheck(runtimeErrors.user===errorsBefore,'GAME_SCRIPT_ERROR','이 게임 검사 중 처리되지 않은 JavaScript 오류가 발생했습니다.');
      if (id==='slide-puzzle') resumeProof={runId:save.payload.runId,revision:save.revision,board:await frame.locator('#board button').allTextContents(),info:await frame.locator('#info').textContent()};
      return {message:'sandbox=allow-scripts, 실제 시작·조작, pause와 서버 저장을 확인했습니다.',evidence:{gameId:id,revision:save.revision,sandbox:['allow-scripts']}};
    });
    await step('BROWSER-RESUME','슬라이드 퍼즐 reload 뒤 진행 복원',async()=>{
      requireCheck(resumeProof,'RESUME_PREREQUISITE','앞선 슬라이드 게임 저장 검사가 성공해야 복원을 확인할 수 있습니다.');
      await userPage.bringToFront();await userPage.goto(endpoints.user+'/play/slide-puzzle/',{waitUntil:'domcontentloaded'});
      await userPage.reload({waitUntil:'domcontentloaded'});
      const frame=await openGame(userPage,'slide-puzzle',timeout,false);
      await hasText(frame.locator('#status'),/저장된 진행을 불러왔어요/,timeout);
      await hasText(frame.locator('#primary'),/^이어서 하기$/,timeout);
      assert.deepEqual(await frame.locator('#board button').allTextContents(),resumeProof.board);
      assert.equal(await frame.locator('#info').textContent(),resumeProof.info);
      const save=await apiJson(userContext.request,endpoints.publicApi,'/api/saves/slide-puzzle',endpoints.user);
      assert.equal(save.payload.runId,resumeProof.runId);requireCheck(save.revision>=resumeProof.revision,'SAVE_REVISION','복원한 저장 revision이 이전보다 작습니다.');
      await frame.locator('#primary').click();await frame.locator('#overlay').waitFor({state:'hidden'});
      await pauseAndReadSave(userPage,frame,'slide-puzzle',endpoints,timeout);
      return {message:'전체 reload 뒤 같은 runId·보드·이동 수가 복원되고 다시 저장되는 것을 확인했습니다.'};
    });
    let conflictProof=null,archivedSlot=null;
    await step('BROWSER-SAVE-CONFLICT','동시 저장 충돌과 현재 탭의 진행 보존',async()=>{
      await userPage.bringToFront();
      const frame=userPage.frameLocator(SELECTORS.frame).first();
      const current=await apiJson(userContext.request,endpoints.publicApi,'/api/saves/slide-puzzle',endpoints.user);
      const profile=await apiJson(userContext.request,endpoints.publicApi,'/api/session',endpoints.user);
      // A second writer advances the server revision while this iframe still holds the old one.
      const other=await apiJson(userContext.request,endpoints.publicApi,'/api/saves/slide-puzzle',endpoints.user,{method:'PUT',body:{schemaVersion:current.schemaVersion,payload:current.payload},headers:{'X-CSRF-Token':profile.csrfToken,'If-Match':`"r${current.revision}"`,'Idempotency-Key':crypto.randomUUID()},expected:200});
      const conflict=userPage.waitForResponse(response=>new URL(response.url()).origin===endpoints.publicApi && new URL(response.url()).pathname==='/api/saves/slide-puzzle' && response.request().method()==='PUT' && response.status()===412,{timeout});
      await startAndInput(userPage,frame,'slide-puzzle',timeout);await frame.locator('#pause').click();await conflict;
      await hasText(userPage.locator(SELECTORS.save).first(),/충돌/,timeout);
      const board=await frame.locator('#board button').allTextContents();
      await userPage.locator('[data-testid="save-manager-open"]').click();await userPage.locator('#saves-dialog').waitFor({state:'visible'});
      const archive=userPage.locator('[data-testid="archive-tab-save"]');await archive.waitFor({state:'visible'});
      await until(async()=>!(await archive.isDisabled()),timeout,'충돌한 현재 탭 기록을 보관할 수 없습니다.');
      const still=await apiJson(userContext.request,endpoints.publicApi,'/api/saves/slide-puzzle',endpoints.user);
      assert.equal(still.revision,other.revision);assert.deepEqual(still.payload,current.payload);
      conflictProof={serverBefore:still,board};
      return {message:'실제 412 뒤 서버 원본을 보존하고 최신 탭 진행의 보관 선택을 표시했습니다.'};
    });
    await step('BROWSER-SAVE-ARCHIVE-RESTORE','현재 탭의 별도 보관과 조건부 이어하기',async()=>{
      requireCheck(conflictProof,'CONFLICT_PREREQUISITE','충돌 보존 검사가 먼저 성공해야 합니다.');
      const stored=userPage.waitForResponse(response=>new URL(response.url()).origin===endpoints.publicApi && new URL(response.url()).pathname==='/api/saves/slide-puzzle' && new URL(response.url()).searchParams.get('slot')?.startsWith('recovery-') && response.request().method()==='PUT' && response.status()===201,{timeout});
      await userPage.locator('[data-testid="archive-tab-save"]').click();const archive=await (await stored).json();archivedSlot=archive.slot;
      requireCheck(archivedSlot?.startsWith('recovery-'),'ARCHIVE_SLOT','임시 기록의 서버 보관 슬롯을 확인하지 못했습니다.');
      const main=await apiJson(userContext.request,endpoints.publicApi,'/api/saves/slide-puzzle',endpoints.user);assert.equal(main.revision,conflictProof.serverBefore.revision);
      const button=userPage.locator(`[data-testid="save-restore"][data-slot="${archivedSlot}"]`);
      await button.waitFor({state:'visible'});await until(async()=>!(await button.isDisabled()),timeout,'보관 슬롯 복구 버튼을 사용할 수 없습니다.');
      userPage.once('dialog',dialog=>dialog.accept().catch(()=>{}));
      const restored=userPage.waitForResponse(response=>new URL(response.url()).origin===endpoints.publicApi && new URL(response.url()).pathname==='/api/saves/slide-puzzle/restore' && response.request().method()==='POST' && response.status()===200,{timeout});
      await button.click();const result=await (await restored).json();
      requireCheck(result.previousBackupId && result.revision===main.revision+1,'RESTORE_BACKUP','이전 main 백업과 revision 증가를 확인하지 못했습니다.');
      await userPage.locator('#saves-dialog').waitFor({state:'hidden'});
      const frame=userPage.frameLocator(SELECTORS.frame).first();await hasText(frame.locator('#status'),/저장된 진행을 불러왔어요/,timeout);
      await until(async()=>!(await frame.locator('#primary').isDisabled()),timeout,'보관 기록의 게임 준비와 보드 렌더가 끝나지 않았습니다.');
      assert.deepEqual(await frame.locator('#board button').allTextContents(),conflictProof.board);
      conflictProof.previousBackupId=result.previousBackupId;
      return {message:'UI에서 탭 진행을 별도 슬롯에 보관하고, 기존 main을 백업한 뒤 새 이어하기로 복구했습니다.'};
    });
    await step('BROWSER-SAVE-BACKUP-RESTORE','교체 전 백업으로 다시 복구',async()=>{
      requireCheck(conflictProof?.previousBackupId,'BACKUP_PREREQUISITE','앞선 main 교체 전 백업이 필요합니다.');
      await userPage.locator('[data-testid="save-manager-open"]').click();
      const button=userPage.locator(`[data-testid="save-backup-restore"][data-slot="${conflictProof.previousBackupId}"]`);await button.waitFor({state:'visible'});
      await until(async()=>!(await button.isDisabled()),timeout,'이전 백업 복구 버튼을 사용할 수 없습니다.');
      userPage.once('dialog',dialog=>dialog.accept().catch(()=>{}));
      const restored=userPage.waitForResponse(response=>new URL(response.url()).origin===endpoints.publicApi && new URL(response.url()).pathname==='/api/saves/slide-puzzle/restore' && response.request().method()==='POST' && response.status()===200,{timeout});
      await button.click();const value=await (await restored).json();assert.deepEqual(value.payload,conflictProof.serverBefore.payload);
      await userPage.locator('#saves-dialog').waitFor({state:'hidden'});
      const frame=userPage.frameLocator(SELECTORS.frame).first();
      await hasText(frame.locator('#status'),/저장된 진행을 불러왔어요/,timeout);
      await until(async()=>!(await frame.locator('#primary').isDisabled()),timeout,'백업 기록의 게임 준비와 보드 렌더가 끝나지 않았습니다.');
      const expectedBoard=conflictProof.serverBefore.payload.state.board.map(value=>value===0?'':String(value));
      assert.deepEqual(await frame.locator('#board button').allTextContents(),expectedBoard);
      return {message:'보관 슬롯 적용 전 서버 기록을 백업 목록에서 복구하고, 새 iframe의 실제 보드도 원본과 일치함을 확인했습니다.'};
    });
    await step('BROWSER-MOBILE','390×844 모바일 viewport와 터치 조작',async()=>{
      mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,reducedMotion:'reduce'});mobileContext.setDefaultTimeout(timeout);mobileContext.setDefaultNavigationTimeout(timeout);
      await prepareQaContext(mobileContext,endpoints,report);
      const page=await mobileContext.newPage();page.on('pageerror',()=>runtimeErrors.mobile++);
      await page.goto(endpoints.user+'/',{waitUntil:'domcontentloaded'});await page.bringToFront();
      const frame=await openGame(page,'merge-tiles',timeout);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
      requireCheck(!overflow,'MOBILE_OVERFLOW','모바일 문서에 가로 넘침이 있습니다.');
      const bounds=await page.locator(SELECTORS.frame).first().boundingBox();
      requireCheck(bounds && bounds.width<=392,'MOBILE_FRAME_WIDTH','모바일 iframe 너비가 viewport를 벗어납니다.');
      await startAndInput(page,frame,'merge-tiles',timeout,true);await pauseAndReadSave(page,frame,'merge-tiles',endpoints,timeout);
      requireCheck(runtimeErrors.mobile===0,'MOBILE_SCRIPT_ERROR','모바일 검사 중 처리되지 않은 JavaScript 오류가 발생했습니다.');
      await mobileContext.close();mobileContext=null;
      return {message:'모바일 viewport의 게임 배치·시작·방향 버튼 터치·저장을 확인했습니다. 실제 휴대전화 성능 검증을 뜻하지 않습니다.'};
    });
    await step('BROWSER-ADMIN-ANONYMOUS','관리자 무인증 로그인 화면',async()=>{
      await adminPage.bringToFront();await adminPage.reload({waitUntil:'domcontentloaded'});
      await adminPage.locator('#login-panel').waitFor({state:'visible'});requireCheck(!(await adminPage.locator('#dashboard').isVisible()),'ADMIN_DASHBOARD_EXPOSED','무인증에서 관리자 dashboard가 노출됩니다.');
      requireCheck(await adminPage.locator('#password').getAttribute('type')==='password','ADMIN_PASSWORD_FIELD','관리자 비밀번호 입력이 password 필드가 아닙니다.');
      return {message:'관리자 미인증에서는 로그인 화면만 표시됩니다.'};
    });
    const hasCredentials=typeof credentials.username==='string' && typeof credentials.password==='string';
    if (hasCredentials) {
      await step('BROWSER-ADMIN-LOGIN','실제 관리자 폼 로그인',async()=>{
        await adminPage.locator('#username').fill(credentials.username);await adminPage.locator('#password').fill(credentials.password);
        const [response]=await Promise.all([
          adminPage.waitForResponse(response=>new URL(response.url()).origin===endpoints.adminApi && new URL(response.url()).pathname==='/api/admin/login' && response.request().method()==='POST'),
          adminPage.locator('#login-form button[type="submit"]').click()
        ]);
        requireCheck(response.status()===200,'ADMIN_LOGIN_FAILED','관리자 로그인 응답이 성공이 아닙니다. 자격증명 원문은 기록하지 않습니다.');
        await adminPage.locator('#dashboard').waitFor({state:'visible'});authenticated=true;
        requireCheck(await adminPage.locator('#password').inputValue()==='','PASSWORD_REMAINS','로그인 뒤 비밀번호 필드가 비워지지 않았습니다.');
        return {message:'stdin 자격증명으로 실제 관리자 UI 로그인에 성공했습니다.'};
      });
    } else skip('BROWSER-ADMIN-LOGIN','실제 관리자 폼 로그인','관리자 자격증명을 입력하지 않아 인증 검사를 건너뛰었습니다. 전체 통과로 표시하지 않습니다.');
    credentials.username='';credentials.password='';
    if (authenticated) {
      await step('BROWSER-ADMIN-METRICS','관리자 live/demo dashboard 분리',async()=>{
        await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'관리 dashboard 초기 로딩이 끝나지 않았습니다.');
        await adminPage.locator('#overview .metric').first().waitFor({state:'visible'});
        const before=await apiJson(adminContext.request,endpoints.adminApi,'/api/admin/metrics?dataset=live',endpoints.admin);
        requireCheck(before.dataset==='live','LIVE_DATASET','live 응답의 dataset 구분이 올바르지 않습니다.');
        await adminPage.locator('#demo').click();await adminPage.locator('#demo-banner').waitFor({state:'visible'});
        await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'예제 dashboard 로딩이 끝나지 않았습니다.');
        const demo=await apiJson(adminContext.request,endpoints.adminApi,'/api/admin/metrics?dataset=demo',endpoints.admin);
        requireCheck(demo.dataset==='demo' && demo.retention?.platform?.d1?.cohortSize===240 && demo.retention.platform.d1.retained===74,'DEMO_DATASET','독립 예제 리텐션의 데이터 계약이 다릅니다.');
        const controls=adminPage.locator('#games-body button.toggle');
        requireCheck(await controls.count()>=8,'ADMIN_GAME_ROWS','관리자 게임 현황에서 기본 8종을 확인하지 못했습니다.');
        for (const button of await controls.all()) requireCheck(await button.isDisabled(),'DEMO_MUTATION_ENABLED','예제 dashboard에서 공개 상태 변경 버튼이 활성입니다.');
        await adminPage.locator('#live').click();await adminPage.locator('#demo-banner').waitFor({state:'hidden'});
        await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'live dashboard 재로딩이 끝나지 않았습니다.');
        const after=await apiJson(adminContext.request,endpoints.adminApi,'/api/admin/metrics?dataset=live',endpoints.admin);
        requireCheck(after.dataset==='live','LIVE_DATASET','예제 조회 뒤에도 실제 데이터 구분을 유지해야 합니다.');
        return {message:'live/demo 전환, 가상 데이터 표시, 예제 모드의 변경 버튼 비활성을 확인했습니다. 동시 이용자가 있는 live 집계의 수치 고정은 요구하지 않습니다.'};
      });
      await step('BROWSER-ADMIN-FILTERS','QA 지표·KST 기간·게임별 리텐션 필터',async()=>{
        await adminPage.locator('#qa').click();await adminPage.locator('#qa-banner').waitFor({state:'visible'});
        await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'QA 지표를 불러오지 못했습니다.');
        const fromDay=new Date(Date.parse(report.generatedAt)+9*3600000).toISOString().slice(0,10);
        const toDay=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
        await adminPage.locator('#metrics-from').fill(fromDay);await adminPage.locator('#metrics-to').fill(toDay);await adminPage.locator('#metrics-game').selectOption('slide-puzzle');
        const response=adminPage.waitForResponse(response=>{const url=new URL(response.url());return url.origin===endpoints.adminApi && url.pathname==='/api/admin/metrics' && url.searchParams.get('dataset')==='qa' && url.searchParams.get('gameId')==='slide-puzzle' && url.searchParams.get('from')===fromDay && url.searchParams.get('to')===toDay && response.status()===200;},{timeout});
        await adminPage.locator('#metrics-apply').click();const selected=await (await response).json();
        requireCheck(selected.filters?.from===fromDay && selected.filters?.to===toDay && selected.filters?.gameId==='slide-puzzle' && selected.retentionScope==='game' && selected.summary.saveWrites>0,'FILTER_RESULT','실행 시작 KST일부터 조회 시점까지의 기간·게임·저장·리텐션 범위를 확인하지 못했습니다.');
        await hasText(adminPage.locator('#metrics-scope'),/QA.*슬라이드/,timeout);await hasText(adminPage.locator('#retention-scope'),/슬라이드.*최초일/,timeout);
        requireCheck(await adminPage.locator('#games-body tr').count()===1,'FILTER_ROWS','선택한 게임 이외의 표 행이 표시됐습니다.');
        await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'필터 조회가 끝나지 않았습니다.');
        await adminPage.locator('#metrics-reset').click();await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'필터 초기화가 끝나지 않았습니다.');
        await adminPage.locator('#live').click();await adminPage.locator('#qa-banner').waitFor({state:'hidden'});
        await until(async()=>!(await adminPage.locator('#refresh').isDisabled()),timeout,'실제 이용 기록으로 복귀하지 못했습니다.');
        return {message:'QA와 실제 화면 분리, 날짜·게임 조건, 선택 게임 리텐션과 필터 초기화를 실제 UI에서 확인했습니다.'};
      });
      await step('BROWSER-ADMIN-VISIBILITY','관리자 공개 상태 변경과 사용자 목록 반영',async()=>{
        const list=await apiJson(adminContext.request,endpoints.adminApi,'/api/admin/games',endpoints.admin);
        const game=list.games?.find(item=>item.id==='memory-pairs');
        requireCheck(game?.enabled===true,'VISIBILITY_PREREQUISITE','공개 상태 검사를 위해 memory-pairs가 처음에 공개 상태여야 합니다.');
        changed={id:game.id,enabled:game.enabled};report.impact.adminStateRestored=false;
        const row=adminPage.locator('#games-body tr').filter({has:adminPage.locator('small',{hasText:game.id})});
        adminPage.once('dialog',dialog=>dialog.accept().catch(()=>{}));
        const [patch]=await Promise.all([
          adminPage.waitForResponse(response=>new URL(response.url()).origin===endpoints.adminApi && new URL(response.url()).pathname===`/api/admin/games/${game.id}` && response.request().method()==='PATCH'),
          row.locator('button.toggle').click()
        ]);
        requireCheck(patch.status()===200,'VISIBILITY_PATCH','관리자 UI 공개 상태 변경 요청이 실패했습니다.');
        const publicGames=await apiJson(userContext.request,endpoints.publicApi,'/api/games',endpoints.user);
        requireCheck(!publicGames.games.some(item=>item.id===game.id),'DISABLED_IN_API','비공개 게임이 공개 API 목록에 남아 있습니다.');
        await userPage.bringToFront();await userPage.goto(endpoints.user+'/',{waitUntil:'domcontentloaded'});
        await userPage.locator(SELECTORS.card('match3-garden')).first().waitFor({state:'attached'});
        requireCheck(await userPage.locator(SELECTORS.card(game.id)).count()===0,'DISABLED_CARD','비공개 게임 카드가 사용자 목록에 남아 있습니다.');
        const session=await apiJson(userContext.request,endpoints.publicApi,'/api/session',endpoints.user);
        await apiJson(userContext.request,endpoints.publicApi,'/api/play-sessions',endpoints.user,{method:'POST',body:{gameId:game.id},headers:{'X-CSRF-Token':session.csrfToken},expected:404});
        return {message:'관리자 UI에서 비공개로 전환하고 공개 목록·새 play session에서 제외됨을 확인했습니다. 다음 복원 단계에서 원래 공개 상태로 돌립니다.'};
      });
    } else {
      skip('BROWSER-ADMIN-METRICS','관리자 live/demo dashboard 분리','관리자 인증이 없어 검사하지 않았습니다.');
      skip('BROWSER-ADMIN-FILTERS','QA 지표·KST 기간·게임별 리텐션 필터','관리자 인증이 없어 필터 화면과 집계를 검사하지 않았습니다.');
      skip('BROWSER-ADMIN-VISIBILITY','관리자 공개 상태 변경','관리자 인증이 없어 상태를 변경하지 않았습니다.');
    }
  } catch(error) {
    report.blocker=safeError(error);
    report.checks.push({id:'BROWSER-ENVIRONMENT',title:'브라우저 실행 환경',status:report.browserExecuted?'fail':'not_run',error:report.blocker});
  } finally {
    credentials.username='';credentials.password='';
    if (changed && adminContext && report.endpoints) await step('BROWSER-ADMIN-RESTORE','변경한 게임 공개 상태 복원',async()=>{
      const e=report.endpoints;
      const session=await apiJson(adminContext.request,e.adminApi,'/api/admin/session',e.admin);
      requireCheck(session.authenticated===true,'RESTORE_AUTH','관리자 세션을 확인할 수 없어 자동 복원하지 못했습니다. 관리자 화면에서 memory-pairs 공개 상태를 직접 확인하세요.');
      await apiJson(adminContext.request,e.adminApi,`/api/admin/games/${changed.id}`,e.admin,{method:'PATCH',body:{enabled:changed.enabled},headers:{'X-CSRF-Token':session.csrfToken}});
      const publicGames=await apiJson(userContext.request,e.publicApi,'/api/games',e.user);
      requireCheck(publicGames.games.some(game=>game.id===changed.id)===changed.enabled,'RESTORE_STATE','게임 공개 상태 복원 확인에 실패했습니다. 관리자 화면에서 memory-pairs 상태를 직접 확인하세요.');
      report.impact.adminStateRestored=true;
      return {message:'게임 공개 상태를 검사 전 값으로 복원하고 공개 API에서 확인했습니다.'};
    });
    if (authenticated && adminPage && report.endpoints) await step('BROWSER-ADMIN-LOGOUT','관리자 UI 로그아웃과 권한 폐기',async()=>{
      await adminPage.bringToFront();await adminPage.locator('#logout').click();await adminPage.locator('#login-panel').waitFor({state:'visible'});
      await apiJson(adminContext.request,report.endpoints.adminApi,'/api/admin/metrics?dataset=live',report.endpoints.admin,{expected:401});
      return {message:'관리자 로그아웃 뒤 dashboard 접근 권한이 폐기됩니다.'};
    });
    if (report.browserExecuted) await step('BROWSER-SCRIPT-ERRORS','처리되지 않은 UI JavaScript 오류',async()=>{
      requireCheck(Object.values(runtimeErrors).every(count=>count===0),'UNHANDLED_SCRIPT_ERROR','검사 중 처리되지 않은 JavaScript 오류가 발생했습니다. 오류 원문·화면·자격증명은 저장하지 않았습니다.');
      return {message:'관찰한 사용자·관리자·모바일 문서에서 처리되지 않은 JavaScript 오류가 없습니다.',evidence:{...runtimeErrors}};
    });
    for (const object of [mobileContext,userContext,adminContext,browser]) if (object) await object.close().catch(()=>{});
    report.summary=Object.fromEntries(['pass','fail','skip','not_run'].map(status=>[status,report.checks.filter(check=>check.status===status).length]));
    report.status=!report.browserExecuted?'not_run':report.summary.fail?'failed':report.summary.skip || report.summary.not_run?'partial':'passed';
    report.passed=report.status==='passed';report.generatedAt=new Date().toISOString();
    saveReport(report,filename);
    console.log(`Browser QA: ${report.status}; report: ${filename}`);
  }
  return report;
}

const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (invoked) {
  let options={},credentials={};
  try {
    options=parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('node qa/browser.e2e.mjs --user ORIGIN --admin ORIGIN --public-api ORIGIN --admin-api ORIGIN [--channel msedge | --executable PATH] [--headed] [--report FILE.json] [--timeout 20000]\nCredentials: stdin JSON {"username":"...","password":"..."}, or {} to skip authenticated admin checks. Never use command-line credentials. Windows defaults to installed msedge. No browser downloads or install commands are run by this script.');
    } else {
      credentials=await readCredentials();const report=await runBrowserQA(options,credentials);
      process.exitCode=report.status==='passed'?0:report.status==='not_run'?2:report.status==='partial'?3:1;
    }
  } catch(error) {
    const report=newReport();report.blocker=safeError(error);report.checks=[{id:'BROWSER-INPUT',title:'검사 입력',status:'not_run',error:report.blocker}];report.summary.not_run=1;
    const filename=path.resolve(options.report || path.join(HERE,'reports','browser-e2e.json'));saveReport(report,filename);
    console.error(`${report.blocker.code}: ${report.blocker.message}`);process.exitCode=2;
  } finally {credentials.username='';credentials.password='';}
}
