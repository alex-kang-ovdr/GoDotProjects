#!/usr/bin/env node
/** HTTP acceptance smoke. All simulated play uses a server-classified QA session. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILTINS = ['match3-garden','falling-blocks','bubble-split','brick-breaker','slide-puzzle','mines-grid','memory-pairs','merge-tiles'];
const MAX_BODY = 4 * 1024 * 1024;
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decode = value => value.replace(/&(amp|lt|gt|quot|apos|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"}[name]));
function assert(condition,message) { if (!condition) throw new Error(message); }
function baseUrl(value) {
  const url = new URL(value);
  assert(['http:','https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'URLs must be HTTP(S) origins without credentials, query, or path.');
  return url.origin;
}
function attributes(tag) {
  const value = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) value[match[1].toLowerCase()] = decode(match[2] ?? match[3]);
  return value;
}
function assetReferences(html,{allowInlineSvg=false}={}) {
  const refs = [];
  const add=(reference,imageContext=false)=>{
    if(/^data:/i.test(reference)){
      const raster=/^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(reference);
      const svg=allowInlineSvg && /^data:image\/svg\+xml(?:;[^,]*)?,/i.test(reference);
      assert(imageContext && (raster || svg),'지원하지 않는 data URI 자산입니다. 스크립트·스타일의 data URI는 허용하지 않습니다.');
      return; // Embedded image bytes are not an external HTTP request.
    }
    refs.push(reference);
  };
  for (const match of html.matchAll(/<(script|link|img|source|audio|video)\b[^>]*>/gi)) {
    const attrs = attributes(match[0]), tag = match[1].toLowerCase();
    if (attrs.src) add(attrs.src,tag==='img');
    if (attrs.poster) add(attrs.poster,true);
    if (tag === 'link' && /(?:^|\s)(stylesheet|icon|preload|modulepreload)(?:\s|$)/i.test(attrs.rel || '') && attrs.href) add(attrs.href,/(?:^|\s)icon(?:\s|$)/i.test(attrs.rel || ''));
  }
  assert(refs.length <= 100,'Too many declared static references for this smoke profile.');
  return [...new Set(refs)];
}
async function responseBody(response) {
  const length = Number(response.headers.get('content-length'));
  if(Number.isFinite(length) && length>MAX_BODY){await response.body?.cancel().catch(()=>{});throw new Error('HTTP response exceeds the inspection budget.');}
  const parts = []; let total = 0;
  if (response.body) for await (const chunk of response.body) {
    total += chunk.length;
    if (total > MAX_BODY) { await response.body.cancel().catch(()=>{}); throw new Error('HTTP response exceeds the inspection budget.'); }
    parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts).toString('utf8');
}
async function request(url,{method='GET',headers={},body}={}) {
  const response = await fetch(url,{method,headers,...(body === undefined ? {} : {body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(12000)});
  const text = await responseBody(response);
  let data = null;
  if ((response.headers.get('content-type') || '').includes('application/json') && text) {
    try { data = JSON.parse(text); } catch { throw new Error('API response is not valid JSON.'); }
  }
  return {status:response.status,headers:response.headers,text,data};
}
function expected(response,status) {
  const list = Array.isArray(status) ? status : [status];
  if (!list.includes(response.status)) {
    const code = /^[A-Z0-9_]{1,80}$/.test(response.data?.error?.code || '') ? response.data.error.code : 'UNEXPECTED_RESPONSE';
    throw new Error(`HTTP ${response.status}; expected ${list.join('/')}; ${code}.`);
  }
  return response;
}
class CookieJar {
  constructor() { this.values = new Map(); }
  store(headers,url) {
    const target = new URL(url);
    for (const line of headers.getSetCookie()) {
      const [pair,...fields] = line.split(';'), at = pair.indexOf('=');
      if (at <= 0) continue;
      const name = pair.slice(0,at).trim(), value = pair.slice(at+1).trim(), attributes = {};
      for (const field of fields) { const split = field.indexOf('='); attributes[(split < 0 ? field : field.slice(0,split)).trim().toLowerCase()] = split < 0 ? true : field.slice(split+1).trim(); }
      const domain = String(attributes.domain || target.hostname).replace(/^\./,'').toLowerCase();
      if (target.hostname !== domain && !target.hostname.endsWith('.'+domain)) continue;
      const cookie = {value,domain,hostOnly:!attributes.domain,path:typeof attributes.path === 'string' ? attributes.path : '/',httpOnly:Boolean(attributes.httponly),sameSite:String(attributes.samesite||'').toLowerCase(),secure:Boolean(attributes.secure),expires:attributes['max-age'] === undefined ? Date.parse(String(attributes.expires || '')) : Date.now()+Number(attributes['max-age'])*1000};
      const key = `${domain}|${cookie.path}|${name}`;
      if (value === '' || (Number.isFinite(cookie.expires) && cookie.expires <= Date.now())) this.values.delete(key);
      else this.values.set(key,{name,...cookie});
      if (this.values.size > 32) throw new Error('Cookie count exceeded the smoke limit.');
    }
  }
  header(url) {
    const target = new URL(url), result = [];
    for (const cookie of this.values.values()) {
      if (cookie.secure && target.protocol !== 'https:') continue;
      if (Number.isFinite(cookie.expires) && cookie.expires <= Date.now()) continue;
      if (cookie.hostOnly ? target.hostname !== cookie.domain : target.hostname !== cookie.domain && !target.hostname.endsWith('.'+cookie.domain)) continue;
      if (!target.pathname.startsWith(cookie.path)) continue;
      result.push(`${cookie.name}=${cookie.value}`);
    }
    return result.join('; ');
  }
}
class Api {
  constructor(base,origin) { this.base=base;this.origin=origin;this.jar=new CookieJar();this.csrf=null; }
  async call(method,route,{body,headers={},csrf=true}={}) {
    const url = new URL(route,this.base);
    assert(url.origin === this.base,'API route leaves its configured origin.');
    const cookie = this.jar.header(url);
    const response = await request(url,{method,body,headers:{Origin:this.origin,...(cookie ? {Cookie:cookie} : {}),...(body === undefined ? {} : {'Content-Type':'application/json'}),...(csrf && this.csrf && !['GET','HEAD','OPTIONS'].includes(method) ? {'X-CSRF-Token':this.csrf} : {}),...headers}});
    this.jar.store(response.headers,url);
    if (typeof response.data?.csrfToken === 'string') this.csrf=response.data.csrfToken;
    return response;
  }
}
function summary(checks) { return Object.fromEntries(['pass','fail','warning','skip'].map(s=>[s,checks.filter(c=>c.status===s).length])); }
export function saveReport(report,file) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  const rows=report.checks.map(c=>`<tr><td>${escape(c.id)}</td><td>${escape(c.status)}</td><td>${escape(c.title)}</td><td>${escape(c.message)}</td></tr>`).join('');
  const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PoC 서비스 HTTP 검증</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:1200px;margin:32px auto;padding:0 20px;color:#203331}h1{color:#126b5b}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cdd9d5;padding:10px;text-align:left;vertical-align:top}th{background:#eaf3ef}td{overflow-wrap:anywhere}.notice{background:#fff3d9;padding:14px}</style><h1>PoC 서비스 HTTP 검증</h1><p>${escape(report.generatedAt)} · ${escape(report.environment.node)} · ${escape(report.environment.platform)}</p><p>pass ${report.summary.pass} / fail ${report.summary.fail} / warning ${report.summary.warning} / skip ${report.summary.skip}</p><p class="notice">${escape(report.impact.notice)}</p><p>실제 브라우저 조작과 실제 Google 인증은 실행하지 않았습니다. HTTP 대상 환경의 선언만으로 Windows·Rebex·IIS 프로세스 및 바인딩 검증을 대신하지 않습니다.</p><table><thead><tr><th>ID</th><th>상태</th><th>검사</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table></html>`;
  fs.writeFileSync(file.replace(/\.json$/i,'')+'.html',html);
}

export async function runSmoke(options={},credentials={}) {
  assert(Number(process.versions.node.split('.')[0])>=24,'Node.js 24 or newer is required.');
  const endpoints={user:baseUrl(options.user || 'http://localhost:8080'),admin:baseUrl(options.admin || 'http://localhost:8081'),publicApi:baseUrl(options.publicApi || options['public-api'] || 'http://localhost:8090'),adminApi:baseUrl(options.adminApi || options['admin-api'] || 'http://localhost:8091')};
  const checks=[],runId=randomUUID(),started=Date.now(),hidden=new Set([credentials.username,credentials.password].filter(value=>typeof value==='string' && value));
  const provided=typeof credentials.username==='string' && typeof credentials.password==='string' && credentials.username.length>0 && credentials.password.length>0;
  assert((!credentials.username && !credentials.password) || provided,'stdin must contain both username and password, or an empty object.');
  const add=(id,title,status,message,evidence)=>checks.push({id,title,status,message,...(evidence ? {evidence} : {})});
  const pub=new Api(endpoints.publicApi,endpoints.user),adm=new Api(endpoints.adminApi,endpoints.admin);
  let interrupted=false;
  const cancelled=new AbortController();
  const onSignal=()=>{interrupted=true;cancelled.abort();};
  process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
  const safeError=error=>{let message=String(error.message || 'HTTP 검사 실패');if(/^[A-Z0-9_]{1,64}$/.test(error.cause?.code || ''))message+=` (${error.cause.code})`;for(const client of [pub,adm]){if(client.csrf)hidden.add(client.csrf);for(const cookie of client.jar.values.values())hidden.add(cookie.value);}for(const value of hidden)message=message.replaceAll(value,'[REDACTED]');return message.slice(0,500);};
  const step=async(id,title,fn)=>{if(interrupted && !['SMOKE-ADMIN-RESTORE','SMOKE-ADMIN-LOGOUT','SMOKE-GUEST-LOGOUT'].includes(id)){add(id,title,'skip','중단 요청으로 생략했습니다. 필요한 상태 복원과 로그아웃만 수행합니다.');return undefined;}try {const result=await fn();add(id,title,'pass',result?.message || '확인했습니다.',result?.evidence);return result?.value;}catch(error){add(id,title,'fail',safeError(error));return undefined;}};
  let games=[],gameId,play,authenticated=false,baseline=null,impressionBefore=null,changed=null,qaRunId=null;
  const metricsRoute=()=>'/api/admin/metrics?dataset=qa'+(qaRunId?'&qaRunId='+encodeURIComponent(qaRunId):'');
  const impact={notice:'이 검사는 서버가 분류한 QA 세션에 게스트·플레이·저장·노출 기록을 남깁니다. 실제 이용 지표에서 제외되며 QA 화면에서 조회합니다. 관리자 상태 변경은 원래 값으로 복원합니다.',qaRun:runId,serverQaRunId:null,qaTrafficCreated:false,liveTrafficCreated:false,adminStateRestored:null};
  const hints={user:null,admin:null};
  for(const [name,url] of [['user',endpoints.user],['admin',endpoints.admin]]) await step('SMOKE-STATIC-'+name.toUpperCase(),name+' 정적 사이트',async()=>{
    const response=expected(await request(url+'/'),200);assert(/text\/html/i.test(response.headers.get('content-type') || ''),'정적 사이트 응답이 HTML이 아닙니다.');assert(/<html\b/i.test(response.text),'HTML 문서가 없습니다.');
    hints[name]=/Microsoft-IIS/i.test(response.headers.get('server') || '') ? 'Microsoft-IIS header observed' : 'No IIS header observed';
    for(const ref of assetReferences(response.text,{allowInlineSvg:true})) {const asset=new URL(ref,url+'/');assert(asset.origin===url,'정적 사이트가 외부 자산을 요구합니다.');expected(await request(asset),200);}
    return {message:'HTML과 선언된 정적 자산의 HTTP 응답 확인. 내장 data 이미지에는 HTTP 요청을 하지 않으며 JavaScript·이미지 렌더링은 별도입니다.'};
  });
  for(const [name,client] of [['PUBLIC',pub],['ADMIN',adm]]) await step('SMOKE-HEALTH-'+name,name+' API health',async()=>{const r=expected(await client.call('GET','/api/health'),200);assert(r.data?.ok===true && r.data.service===name.toLowerCase(),'health service 식별이 다릅니다.');return {message:'독립 API listener health 확인'};});
  await step('SMOKE-CORS','브라우저 요청용 CORS preflight',async()=>{
    for(const client of [pub,adm]) {const r=expected(await client.call('OPTIONS',client===pub?'/api/play-sessions':'/api/admin/login',{headers:{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-csrf-token'}}),204);assert(r.headers.get('access-control-allow-origin')===client.origin && r.headers.get('access-control-allow-credentials')==='true','CORS origin/credentials 응답이 맞지 않습니다.');}
    return {message:'사용자·관리자 origin의 credentials preflight 확인'};
  });
  await step('SMOKE-ADMIN-ISOLATION','공개 API의 관리자 경로 차단',async()=>{expected(await pub.call('GET','/api/admin/metrics?dataset=live'),404);return {message:'public listener의 /api/admin 경로는 404'};});
  await step('SMOKE-ADMIN-UNAUTH','관리자 무인증 접근 거부',async()=>{expected(await adm.call('GET','/api/admin/metrics?dataset=live'),401);return {message:'admin listener의 metrics는 무인증 401'};});
  await step('SMOKE-ADMIN-SESSION','독립 관리자 CSRF 세션',async()=>{const r=expected(await adm.call('GET','/api/admin/session'),200);assert(r.data?.authenticated===false && typeof adm.csrf==='string','새 관리자 세션 상태가 올바르지 않습니다.');return {message:'관리자 미인증 세션과 CSRF 발급 확인'};});
  if(provided) await step('SMOKE-ADMIN-LOGIN','관리자 실제 인증',async()=>{const r=expected(await adm.call('POST','/api/admin/login',{body:{username:credentials.username,password:credentials.password}}),200);assert(r.data?.authenticated===true && typeof adm.csrf==='string','관리자 인증 응답이 올바르지 않습니다.');authenticated=true;return {message:'stdin으로 받은 자격 증명으로 인증했습니다. 비밀번호·cookie·CSRF는 기록하지 않습니다.'};});
  else add('SMOKE-ADMIN-LOGIN','관리자 실제 인증','skip','stdin 자격 증명이 없어 인증 후 metrics·상태 변경·로그아웃 검사를 수행하지 않습니다.');
  credentials={};
  await step('SMOKE-CATALOG','등록 8종과 현재 공개 게임 목록',async()=>{
    const source=expected(await request(endpoints.user+'/catalog/games.json'),200).data;
    assert(source?.schemaVersion===1 && Array.isArray(source.entries),'배포 카탈로그가 없습니다.');
    const registered=new Map(source.entries.map(entry=>[entry.id,entry]));
    assert(BUILTINS.every(id=>registered.has(id)),'배포 카탈로그에 기본 8종 중 누락이 있습니다.');
    const r=expected(await pub.call('GET','/api/games'),200);
    assert(Array.isArray(r.data?.games) && r.data.games.length<=1000,'games 배열이 없거나 검사 한도를 넘었습니다.');
    const ids=r.data.games.map(g=>g.id);
    assert(ids.every(id=>typeof id==='string' && id.length<=64 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) && registered.get(id)?.enabled===true) && new Set(ids).size===ids.length,'공개 목록의 ID/등록/공개 의도가 올바르지 않습니다.');
    if(options.requireAllGames)assert(BUILTINS.every(id=>ids.includes(id)),'전체 8종 수용 시험에는 모든 기본 게임이 공개되어야 합니다.');
    games=r.data.games;gameId=ids[0];
    return {message:`등록 기본 8종, 현재 공개 ${ids.length}종 확인. 운영자가 비공개한 게임은 정상 상태로 인정합니다.`,evidence:{gameIds:ids,registeredBuiltins:8}};
  });
  for(const game of games) await step('SMOKE-GAME-'+game.id,game.id+' 진입 파일·자산',async()=>{
    const detail=expected(await pub.call('GET','/api/games/'+encodeURIComponent(game.id)),200);assert(detail.data?.id===game.id,'게임 상세 ID 불일치');
    const url=new URL(game.entryUrl,endpoints.user+'/'),prefix=`/games/${game.id}/`;assert(url.origin===endpoints.user && url.pathname.startsWith(prefix),'게임 entryUrl이 지정된 사용자 게임 폴더를 벗어납니다.');
    const response=expected(await request(url),200);assert(/text\/html/i.test(response.headers.get('content-type') || ''),'게임 진입 파일 MIME이 HTML이 아닙니다.');
    const manifest=expected(await request(new URL('game.manifest.json',url)),200);assert(manifest.data?.id===game.id,'실제 게임 manifest가 일치하지 않습니다.');
    const refs=[...assetReferences(response.text),manifest.data.media?.cover,...(manifest.data.media?.screenshots || [])].filter(Boolean);
    for(const ref of [...new Set(refs)]) {const asset=new URL(ref,url);assert(asset.origin===endpoints.user && asset.pathname.startsWith(prefix),'게임 자산이 게임 폴더 밖을 참조합니다.');const r=expected(await request(asset),200);const type=r.headers.get('content-type') || '';if(/\.js$/i.test(asset.pathname))assert(/javascript|ecmascript/i.test(type),'JS MIME 오류');if(/\.css$/i.test(asset.pathname))assert(/text\/css/i.test(type),'CSS MIME 오류');if(/\.svg$/i.test(asset.pathname))assert(/image\/svg\+xml/i.test(type),'SVG MIME 오류');}
    return {message:`진입 HTML·manifest·정적 자산 ${new Set(refs).size}개 HTTP 확인. 실제 게임 조작은 별도입니다.`};
  });
  const anonymous=await step('SMOKE-ANONYMOUS','로그인 없는 방문 세션',async()=>{const r=expected(await pub.call('GET','/api/session'),200);assert(r.data?.kind==='anonymous' && typeof pub.csrf==='string','새 방문 세션은 anonymous여야 합니다.');return {value:r.data,message:'익명 수집 세션과 CSRF 확인; 아직 guest 승격 전'};});
  const qaReady=anonymous?await step('SMOKE-QA-SESSION','서버가 고정한 QA 전용 세션',async()=>{
    const r=expected(await pub.call('POST','/api/qa/session',{body:{}}),[200,201]);
    assert(r.data?.kind==='anonymous' && r.data.trafficType==='qa' && /^[0-9a-f-]{36}$/i.test(r.data.qaRunId || ''),'QA 세션 식별을 확인하지 못했습니다. live 데이터는 생성하지 않습니다.');
    qaRunId=r.data.qaRunId;impact.serverQaRunId=qaRunId;
    const profile=expected(await pub.call('GET','/api/session'),200);
    assert(profile.data?.trafficType==='qa' && profile.data.qaRunId===qaRunId,'서버 QA 분류가 유지되지 않습니다.');
    return {value:true,message:'새 익명 세션을 QA로 고정하고 서버 발급 실행 ID를 확인했습니다.'};
  }):false;
  await step('SMOKE-COOKIE','서버 세션 cookie 속성',async()=>{
    for(const [client,name] of [[pub,'poc_public_session'],[adm,'poc_admin_session']]){
      const cookie=[...client.jar.values.values()].find(item=>item.name===name);
      assert(cookie&&cookie.httpOnly&&cookie.sameSite==='lax'&&cookie.hostOnly&&cookie.path==='/api','세션 cookie의 HttpOnly/SameSite/host-only/Path 속성이 올바르지 않습니다.');
      assert(cookie.secure===(new URL(client.base).protocol==='https:'),'HTTP(S) 프로필과 cookie Secure 속성이 일치하지 않습니다.');
    }
    return {message:'공개·관리자 세션의 HttpOnly, SameSite=Lax, host-only, Path=/api 및 HTTP(S)별 Secure를 실제 응답에서 확인했습니다. cookie 값은 보고하지 않습니다.'};
  });
  if(authenticated && qaReady) await step('SMOKE-METRICS-BASELINE','이번 QA 실행의 지표 초기값',async()=>{
    const r=expected(await adm.call('GET',metricsRoute()),200);
    assert(r.data?.dataset==='qa' && r.data.timezone==='Asia/Seoul' && r.data.summary?.impressions===0,'새 QA 실행의 초기 집계가 0이 아닙니다.');
    baseline=r.data;impressionBefore=0;return {message:'서버 qaRunId로 이번 실행만 필터한 초기값을 확인했습니다.'};
  });
  if(anonymous && qaReady && gameId) {
    await step('SMOKE-CSRF','CSRF 없는 쓰기 거부',async()=>{expected(await pub.call('POST','/api/play-sessions',{body:{gameId},csrf:false}),403);return {message:'세션 cookie만 있는 쓰기는 거부됩니다.'};});
    await step('SMOKE-ORIGIN','미허용 Origin 쓰기 거부',async()=>{expected(await pub.call('POST','/api/play-sessions',{body:{gameId},headers:{Origin:'https://smoke-denied.invalid'}}),403);return {message:'미허용 Origin 쓰기는 거부됩니다.'};});
    const impression={event_id:randomUUID(),event_name:'game_impression',game_id:gameId,impression_id:randomUUID(),occurred_at:new Date().toISOString(),properties:{visible_fraction:0.5,visible_duration_ms:1000,document_visible:true,qa_run:runId}};
    await step('SMOKE-IMPRESSION','가시 노출·재전송 중복',async()=>{
      const first=expected(await pub.call('POST','/api/events',{body:{events:[impression]}}),202);assert(first.data?.accepted?.includes(impression.event_id),'가시 노출이 accepted되지 않았습니다.');impact.qaTrafficCreated=true;
      const retry=expected(await pub.call('POST','/api/events',{body:{events:[impression]}}),202);assert(retry.data?.duplicates?.includes(impression.event_id) && !retry.data.accepted.length,'같은 event_id 재전송이 중복 처리되지 않았습니다.');
      const sameOpportunity={...impression,event_id:randomUUID()};const second=expected(await pub.call('POST','/api/events',{body:{events:[sameOpportunity]}}),202);assert(second.data?.accepted?.includes(sameOpportunity.event_id),'두 번째 event_id가 처리되지 않았습니다.');
      const below={...impression,event_id:randomUUID(),impression_id:randomUUID(),properties:{visible_fraction:0.49,visible_duration_ms:900,document_visible:true}};const rejected=expected(await pub.call('POST','/api/events',{body:{events:[below]}}),202);assert(rejected.data?.rejected?.some(e=>e.code==='IMPRESSION_NOT_VISIBLE'),'미달 노출이 거부되지 않았습니다.');
      return {message:'50%·1초 노출 수집, 같은 event_id 재전송 중복, 미달 노출 거부 확인'};
    });
    if(authenticated && Number.isFinite(impressionBefore)) {
      const observed=await step('SMOKE-IMPRESSION-METRICS','노출 기회별 집계',async()=>{const r=expected(await adm.call('GET',metricsRoute()),200);const difference=r.data.summary.impressions-impressionBefore;assert(difference===1,'이번 QA 실행의 동일 노출 기회가 한 번만 집계되지 않았습니다.');return {value:difference,message:'이번 QA 실행에서 동일 impression_id의 집계가 정확히 1 증가했습니다.',evidence:{observedDelta:difference}};});
    } else add('SMOKE-IMPRESSION-METRICS','노출 기회별 집계','skip','관리자 metrics 권한이 없어 집계 분모를 직접 확인하지 못했습니다.');
    await step('SMOKE-CLICK','노출에서 진입 클릭',async()=>{const event={event_id:randomUUID(),event_name:'game_card_click',game_id:gameId,impression_id:impression.impression_id,properties:{viewability_met:true,qa_run:runId}};const r=expected(await pub.call('POST','/api/events',{body:{events:[event]}}),202);assert(r.data.accepted?.includes(event.event_id),'클릭이 수집되지 않았습니다.');return {message:'실제 노출 기회와 연결된 클릭 수집 확인'};});
    play=await step('SMOKE-GUEST','첫 실행의 자동 guest 승격',async()=>{const r=expected(await pub.call('POST','/api/play-sessions',{body:{gameId}}),201);assert(r.data?.kind==='guest' && r.data.gameId===gameId && typeof r.data.id==='string','play session/guest 응답 오류');const session=expected(await pub.call('GET','/api/session'),200);assert(session.data?.kind==='guest','guest 상태가 유지되지 않습니다.');impact.qaTrafficCreated=true;return {value:r.data,message:'가입·Google 로그인 없이 guest와 play session 발급'};});
  }
  if(play) {
    const slot='smoke_'+runId.replaceAll('-','').slice(0,20),route=`/api/saves/${encodeURIComponent(gameId)}?slot=${slot}`,schemaVersion=play.saveSchemaVersion || 1;
    await step('SMOKE-SAVE','최초·수정·충돌·멱등 저장',async()=>{
      expected(await pub.call('GET',route),404);
      const body={schemaVersion,payload:{fixture:'http-smoke',stage:1,qaRun:runId}},key=randomUUID(),headers={'If-None-Match':'*','Idempotency-Key':key};
      const created=expected(await pub.call('PUT',route,{body,headers}),201);assert(created.data?.revision===1 && created.headers.get('etag')==='"r1"','최초 revision/ETag 오류');
      const replay=expected(await pub.call('PUT',route,{body,headers}),[200,201]);assert(replay.data?.revision===1,'동일 요청의 revision이 증가했습니다.');
      expected(await pub.call('PUT',route,{body:{...body,payload:{fixture:'http-smoke',stage:9}},headers}),409);
      const updated=expected(await pub.call('PUT',route,{body:{schemaVersion,payload:{fixture:'http-smoke',stage:2,qaRun:runId}},headers:{'If-Match':'"r1"','Idempotency-Key':randomUUID()}}),200);assert(updated.data?.revision===2,'수정 revision이 2가 아닙니다.');
      expected(await pub.call('PUT',route,{body,headers:{'If-Match':'"r1"','Idempotency-Key':randomUUID()}}),412);
      const final=expected(await pub.call('GET',route),200);assert(final.data?.revision===2 && final.data.payload?.stage===2,'충돌 요청이 기존 저장을 덮어썼습니다.');
      return {message:'최초 r1·멱등 재시도·본문 충돌409·수정 r2·오래된 revision412·저장 보존 확인'};
    });
    await step('SMOKE-SAVE-RESTORE','보관 슬롯·이전 진행 복구',async()=>{
      const base=`/api/saves/${encodeURIComponent(gameId)}`,main=`${base}?slot=main`;
      const original={schemaVersion,payload:{fixture:'http-smoke',stage:10,qaRun:runId}};
      expected(await pub.call('PUT',main,{body:original,headers:{'If-None-Match':'*','Idempotency-Key':randomUUID()}}),201);
      const list=expected(await pub.call('GET',`${base}/slots`),200);
      assert(list.data.mainRevision===1 && list.data.slotLimit===10 && list.data.slots?.some(s=>s.slot===slot && s.revision===2),'슬롯 목록과 revision이 실제 저장과 일치하지 않습니다.');
      const body={sourceSlot:slot,expectedSourceRevision:2,expectedMainRevision:1},headers={'Idempotency-Key':randomUUID()};
      const restored=expected(await pub.call('POST',`${base}/restore`,{body,headers}),200);
      assert(restored.data.revision===2 && restored.data.payload?.stage===2 && restored.data.previousBackupId && restored.data.restoredFrom?.id===slot,'보관 슬롯 복구/이전 main 백업 계약 오류');
      const replay=expected(await pub.call('POST',`${base}/restore`,{body,headers}),200);
      assert(replay.data.revision===2 && replay.data.previousBackupId===restored.data.previousBackupId,'복구 재전송이 중복 변경을 만들었습니다.');
      expected(await pub.call('POST',`${base}/restore`,{body,headers:{'Idempotency-Key':randomUUID()}}),412);
      const backups=expected(await pub.call('GET',`${base}/slots`),200);
      assert(backups.data.backups?.some(b=>b.id===restored.data.previousBackupId && b.revision===1),'이전 main 백업을 다시 조회할 수 없습니다.');
      const back=expected(await pub.call('POST',`${base}/restore`,{body:{backupId:restored.data.previousBackupId,expectedMainRevision:2},headers:{'Idempotency-Key':randomUUID()}}),200);
      assert(back.data.revision===3 && back.data.payload?.stage===10,'이전 main 재복구가 실패했습니다.');
      const source=expected(await pub.call('GET',route),200);
      assert(source.data.revision===2 && source.data.payload?.stage===2,'복구 과정에서 원본 보관 슬롯이 변경되었습니다.');
      return {message:'목록·슬롯 복구·이전 main 백업·멱등 재시도·stale412·백업 재복구·원본 슬롯 보존 확인'};
    });
    const event=(name,properties={})=>({event_id:randomUUID(),event_name:name,game_id:gameId,play_session_id:play.id,properties:{...properties,qa_run:runId}});
    const ready=await step('SMOKE-READY','ready 이벤트',async()=>{const value=event('game_ready');const r=expected(await pub.call('POST','/api/events',{body:{events:[value]}}),202);assert(r.data?.accepted?.includes(value.event_id),'ready가 수집되지 않았습니다.');return {value:true,message:'play session에 연결된 ready 수집 확인'};});
    await step('SMOKE-MILESTONE-AUTHORITY','클라이언트 임계 이벤트 거부',async()=>{const value=event('active_play_10s');const r=expected(await pub.call('POST','/api/events',{body:{events:[value]}}),202);assert(r.data?.rejected?.some(e=>e.code==='EVENT_NAME_INVALID'),'클라이언트가 10초 임계 이벤트를 직접 확정했습니다.');return {message:'active_play_10s 직접 제출 거부 확인'};});
    if(ready) {
      console.log('Smoke: waiting about 11 seconds for a real-time heartbeat check.');
      const waitStart=Date.now();await delay(11050,undefined,{signal:cancelled.signal}).catch(error=>{if(!interrupted)throw error;});
      await step('SMOKE-HEARTBEAT','실시간 10초 활성 구간',async()=>{const elapsed=Date.now()-waitStart,value=event('play_heartbeat',{sequence:0,active_delta_ms:Math.min(elapsed,20000),document_visible:true,paused:false,game_updating:true});const r=expected(await pub.call('POST','/api/events',{body:{events:[value]}}),202);assert(elapsed>=10000 && r.data?.accepted?.includes(value.event_id),'실제 경과 후 heartbeat가 수집되지 않았습니다.');return {message:'실제 11초 이상 기다린 heartbeat 수집 확인',evidence:{elapsedMs:elapsed}};});
      if(authenticated && baseline) await step('SMOKE-ACTIVE10-METRICS','서버 10초 milestone 집계',async()=>{const r=expected(await adm.call('GET',metricsRoute()),200);const old=baseline.games?.find(g=>g.id===gameId)?.active10s || 0,newCount=r.data.games?.find(g=>g.id===gameId)?.active10s;assert(Number.isFinite(newCount) && newCount===old+1,'이번 QA 실행의 active10s 집계가 정확히 한 번 증가하지 않았습니다.');return {message:'서버가 파생한 이번 QA 실행의 10초 milestone 1회 확인',evidence:{increase:1}};});
      else add('SMOKE-ACTIVE10-METRICS','서버 10초 milestone 집계','skip','실제 경과 heartbeat는 보냈지만 관리자 metrics 권한이 없어 서버 milestone 집계를 직접 확인하지 못했습니다.');
    }
    await step('SMOKE-END','라운드 완료·세션 종료',async()=>{const run=randomUUID(),start=event('round_start',{run_id:run}),complete=event('round_complete',{run_id:run,result:'win',score:1}),end=event('game_end');const r=expected(await pub.call('POST','/api/events',{body:{events:[start,complete,end]}}),202);assert([start,complete,end].every(e=>r.data?.accepted?.includes(e.event_id)),'라운드/종료 이벤트가 모두 수집되지 않았습니다.');return {message:'HTTP QA 라운드와 정상 종료 수집 확인. 실제 게임 조작 기록은 아닙니다.'};});
  } else add('SMOKE-PLAY-DEPENDENTS','저장·수명주기','skip','play session 생성이 실패해 관련 쓰기 검사를 수행하지 않았습니다.');
  if(authenticated) {
    await step('SMOKE-METRICS-DATASETS','실제·QA·가상 지표 분리',async()=>{const live=expected(await adm.call('GET','/api/admin/metrics?dataset=live'),200),demo=expected(await adm.call('GET','/api/admin/metrics?dataset=demo'),200),qa=expected(await adm.call('GET',metricsRoute()),200);if(qaRunId)expected(await adm.call('GET','/api/admin/metrics?dataset=live&qaRunId='+encodeURIComponent(qaRunId)),400);for(const [r,label] of [[live,'live'],[qa,'qa'],[demo,'demo']]){assert(r.data?.dataset===label && r.data.timezone==='Asia/Seoul' && r.data.retention?.platform?.d30,'metrics dataset/retention 계약 오류');for(const n of ['d1','d7','d30']){const d=r.data.retention.platform[n];assert(d && (d.eligible ? Number.isFinite(d.rate) && d.rate>=0 && d.rate<=1 : d.rate===null && d.retained===null),'코호트 성숙도/null 계약 오류');}}return {message:'실제/QA/가상 구분, Asia/Seoul, D1·D7·D30 성숙도/null 구조 확인. 실제 D30 성과 검증은 아닙니다.'};});
    if(play && qaRunId) await step('SMOKE-METRICS-FILTERS','KST 기간·게임별 지표 필터',async()=>{
      const fromDay=new Date(started+9*3600000).toISOString().slice(0,10),day=new Date(Date.now()+9*3600000).toISOString().slice(0,10),query=`dataset=qa&qaRunId=${encodeURIComponent(qaRunId)}&from=${fromDay}&to=${day}&gameId=${encodeURIComponent(gameId)}`;
      const r=expected(await adm.call('GET',`/api/admin/metrics?${query}`),200);
      assert(r.data.filters?.from===fromDay && r.data.filters.to===day && r.data.filters.gameId===gameId && r.data.retentionScope==='game' && r.data.retention?.selected?.d30,'기간·게임별 리텐션 범위 계약 오류');
      assert(r.data.games?.length===1 && r.data.games[0].id===gameId && r.data.summary.saveWrites>=5,'게임 필터가 저장 집계/행에 적용되지 않았습니다.');
      const errors=expected(await adm.call('GET',`/api/admin/errors?${query}`),200);
      assert(errors.data.filters?.dataset==='qa' && errors.data.filters?.gameId===gameId,'오류 목록에 같은 필터가 적용되지 않았습니다.');
      expected(await adm.call('GET','/api/admin/metrics?dataset=live&from=2026-02-30'),400);
      expected(await adm.call('GET',`/api/admin/metrics?dataset=demo&from=${day}`),400);
      return {message:'KST 양끝 날짜·선택 게임·QA 실행 범위 및 오류 필터, 잘못된 날짜/가상 필터 거부 확인'};
    });
    try {
      if(gameId && qaReady) await step('SMOKE-ADMIN-TOGGLE','게임 중단과 신규 실행 차단',async()=>{
        assert(gameId && pub.csrf,'사용자 게임 세션이 없어 상태 변경 검사를 생략해야 합니다.');
        const list=expected(await adm.call('GET','/api/admin/games'),200),original=list.data?.games?.find(g=>g.id===gameId);assert(original && typeof original.enabled==='boolean','관리자 게임 상태가 없습니다.');changed={id:gameId,enabled:original.enabled};
        expected(await adm.call('PATCH','/api/admin/games/'+encodeURIComponent(gameId),{body:{enabled:false}}),200);
        expected(await pub.call('GET','/api/games/'+encodeURIComponent(gameId)),404);
        expected(await pub.call('POST','/api/play-sessions',{body:{gameId}}),404);
        return {message:'관리자 비활성화 뒤 상세 API·신규 play session 차단 확인. 정적 asset 회수는 이 PoC 검사 범위가 아닙니다.'};
      });
      else add('SMOKE-ADMIN-TOGGLE','게임 중단과 신규 실행 차단','skip','공개 게임 또는 QA 세션이 없어 운영 상태를 변경하지 않았습니다.');
    } finally {
      if(changed) await step('SMOKE-ADMIN-RESTORE','게임 상태 복원',async()=>{impact.adminStateRestored=false;const r=expected(await adm.call('PATCH','/api/admin/games/'+encodeURIComponent(changed.id),{body:{enabled:changed.enabled}}),200);assert(r.data?.game?.enabled===changed.enabled,'enabled 원래 값 복원 실패');expected(await pub.call('GET','/api/games/'+encodeURIComponent(changed.id)),changed.enabled?200:404);impact.adminStateRestored=true;return {message:'검사 전 enabled 값으로 복원했습니다. 감사 기록과 QA 데이터는 삭제하지 않았습니다.'};});
    }
    await step('SMOKE-ADMIN-LOGOUT','관리자 로그아웃과 재접근 거부',async()=>{expected(await adm.call('POST','/api/admin/logout',{body:{}}),200);expected(await adm.call('GET','/api/admin/metrics?dataset=live'),401);authenticated=false;return {message:'로그아웃 후 metrics 재접근401 확인'};});
  } else add('SMOKE-ADMIN-AUTHENTICATED','관리자 인증 이후 흐름','skip','관리자 인증이 없어 live/demo·게임 중단/복원·로그아웃을 실행하지 않았습니다.');
  if(anonymous) await step('SMOKE-GUEST-LOGOUT','QA 방문 세션 로그아웃',async()=>{expected(await pub.call('POST','/api/auth/logout',{body:{}}),200);if(gameId)expected(await pub.call('GET',`/api/saves/${encodeURIComponent(gameId)}?slot=main`),401);return {message:'QA 세션 폐기와 저장 접근 거부 확인. 생성한 QA 저장·이벤트 데이터는 남아 있습니다.'};});
  add('SMOKE-BROWSER','실제 브라우저 게임 조작','skip','HTTP 응답과 API만 검사했습니다. 화면 렌더링·마우스·키보드·터치·SDK postMessage는 실제 브라우저에서 별도로 확인하세요.');
  add('SMOKE-GOOGLE','실제 Google 로그인','skip',anonymous?.googleEnabled?'Google 설정 활성 상태는 관측했지만 실제 계정 로그인·callback·저장 이전을 실행하지 않았습니다.':'Google 실제 계정 연동은 수행하지 않았습니다. 미설정 상태의 guest 플레이와 별개 게이트입니다.');
  add(options.rebex?'SMOKE-REBEX':'SMOKE-IIS',options.rebex?'실제 Rebex 프로세스·설정 증거':'실제 IIS 설치 증거','skip',options.rebex?'Rebex 대상으로 HTTP를 검사했습니다. 실제 프로세스·웹 루트·관리자 loopback은 portable/windows-acceptance.ps1에서 관측합니다.':options.iis?'--iis 대상으로 HTTP 검사를 수행했습니다. 이 플래그 자체는 Windows/IIS 사이트·바인딩·ACL·작업 스케줄러의 설치 증거가 아닙니다. Test-IIS.ps1 현장 결과를 함께 확인하세요.':'Node HTTP smoke입니다. 실제 IIS 설치를 검증했다고 보고하지 않습니다.');
  if(interrupted)add('SMOKE-INTERRUPTED','검사 중단','fail','중단 요청으로 전체 흐름을 완료하지 않았습니다. 상태 복원 결과를 확인하세요.');
  process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);hidden.clear();
  const report={schemaVersion:1,kind:'poc-http-smoke',generatedAt:new Date().toISOString(),durationMs:Date.now()-started,endpoints,environment:{node:process.version,platform:process.platform,iisTargetDeclared:Boolean(options.iis),rebexTargetDeclared:Boolean(options.rebex),iisServerHints:hints,browserExecuted:false,googleLoginExecuted:false,adminCredentialsProvided:provided,interrupted},impact,summary:summary(checks),checks};
  report.ok=report.summary.fail===0;
  saveReport(report,path.resolve(options.report || path.join(DEFAULT_ROOT,'reports/smoke.json')));
  return report;
}

async function stdinCredentials() {
  if(process.stdin.isTTY)return {};
  const chunks=[];let bytes=0;
  for await(const chunk of process.stdin){const buffer=Buffer.from(chunk);bytes+=buffer.length;if(bytes>8192)throw new Error('stdin JSON exceeds 8 KiB.');chunks.push(buffer);}
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text.trim())return {};
  let value;try{value=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('stdin must be JSON.');}
  assert(value && typeof value==='object' && !Array.isArray(value) && Object.keys(value).every(k=>['username','password'].includes(k)),'stdin accepts only username/password.');
  return value;
}
async function main(){
  const options={},args=process.argv.slice(2);
  for(let i=0;i<args.length;i++){
    if(args[i]==='--iis')options.iis=true;
    else if(args[i]==='--require-all-games')options.requireAllGames=true;
    else if(['--user','--admin','--public-api','--admin-api','--report'].includes(args[i])){assert(args[i+1] && !args[i+1].startsWith('--'),'Missing option value.');options[args[i].slice(2)]=args[++i];}
    else if(args[i]==='--help'){console.log('node tools/smoke.mjs --user http://localhost:8080 --admin http://localhost:8081 --public-api http://localhost:8090 --admin-api http://localhost:8091 [--report path.json] [--iis] [--require-all-games]\nstdin JSON: {} or {"username":"...","password":"..."}. Never put credentials in command-line options.\nNOTICE: creates server-classified QA traffic, excluded from live metrics; no data is deleted.');return;}
    else throw new Error('Unknown option. Credentials must use stdin, not command-line options.');
  }
  console.log('Smoke notice: server-classified QA data will remain separately; temporary admin enabled changes are restored.');
  const report=await runSmoke(options,await stdinCredentials());
  console.log(JSON.stringify({ok:report.ok,summary:report.summary,report:path.resolve(options.report || path.join(DEFAULT_ROOT,'reports/smoke.json'))},null,2));process.exitCode=report.ok?0:1;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error('Smoke could not finish: '+String(error.message || 'Unknown error').slice(0,400));process.exitCode=2;});
