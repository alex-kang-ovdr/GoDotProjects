 'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),MAIN_PORT=22999,HOST='127.0.0.1';
const ID=/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.wasm':'application/wasm','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav','.mp4':'video/mp4','.webm':'video/webm','.bin':'application/octet-stream'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function portFor(id){return 24000+crypto.createHash('sha256').update('playhub-local-v1:'+id).digest().readUInt32BE(0)%30000;}
function safeFile(base,relative){
 if(!relative||/[:%\x00-\x1f\x7f]/.test(relative)||relative.includes('\\')||relative.includes('\0')||relative.split('/').some(s=>!s||s==='.'||s==='..'||s.startsWith('.')))throw Error('Invalid path');
 let current=base;if(fs.lstatSync(base).isSymbolicLink())throw Error('Links forbidden');
 for(const part of relative.split('/')){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())throw Error('Links forbidden');}
 const root=fs.realpathSync(base),real=fs.realpathSync(current);if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw Error('Outside runtime');return real;
}
function inventory(root=ROOT){
 const games=path.join(root,'games'),entries=new Map(),warnings=[];
 try{for(const e of json(path.join(games,'catalog.json')).entries||[]){if(!ID.test(e.id)||e.path!==e.id){warnings.push('Invalid catalog entry: '+String(e.id));continue;}if(entries.has(e.id))warnings.push('Duplicate catalog ID: '+e.id);entries.set(e.id,e);}}catch(e){warnings.push('Catalog unreadable: '+e.message);}
 for(const d of fs.readdirSync(games,{withFileTypes:true}))if(d.isDirectory()&&ID.test(d.name)&&!entries.has(d.name))entries.set(d.name,{id:d.name,path:d.name,unregistered:true});
 const rows=[];
 for(const e of entries.values()){
  const row={id:e.id,title:e.displayName||e.id,enabled:e.enabled===true,unregistered:!!e.unregistered,port:portFor(e.id),warnings:['원본 로컬 실행 · 전체 플레이 미검증','계정·서버 저장 및 이용 통계 없음'],blocked:null};
  try{const dir=path.join(games,e.id);if(fs.lstatSync(dir).isSymbolicLink())throw Error('Game directory link blocked');const m=json(safeFile(dir,'game.manifest.json'));if(m.id!==e.id||m.entry!=='index.html')throw Error('Manifest ID/entry mismatch');row.title=m.title?.ko||m.title?.en||row.title;row.version=m.version;row.locales=m.supportedLocales||[];row.integration=m.integration;safeFile(dir,'Web/index.html');
   if(m.integration!=='legacy-localstorage')row.blocked='이 독립 로컬 런처는 Hub SDK 호스트를 제공하지 않습니다. 기존 tools/Run_Hub.bat에서 실행하세요 (게임 고장 아님).';
   if(m.capabilities?.externalNetwork?.length)row.warnings.push('외부 네트워크 기능은 로컬 실행 정책으로 차단됨');
   if(e.id==='duck-extraction')row.warnings.push('손상된 JSON 저장 또는 저장소 차단 시 초기화 실패. 저장 자동 삭제/복구 없음. 보관함 강화 효과 미구현.');
  }catch(error){row.blocked='실행 파일/manifest 검증 실패: '+error.message;}
  rows.push(row);
 }
 const ports=new Map();for(const r of rows){if(ports.has(r.port)){r.blocked='게임 포트 충돌: '+ports.get(r.port).id;ports.get(r.port).blocked='게임 포트 충돌: '+r.id;}else ports.set(r.port,r);}
 try{for(const e of json(path.join(__dirname,'pending-sources.json')))if(!entries.has(e.id))rows.push({...e,blocked:e.reason,pending:true,warnings:[e.kind==='documentation'?'문서 자료만 존재 · 실행 게임 수에 포함하지 않음':'실행 산출물 미확보 · 실행 가능 게임 수에 포함하지 않음']});}catch(e){warnings.push('Pending source list unavailable');}
 return {rows:rows.sort((a,b)=>a.id.localeCompare(b.id)),warnings};
}
const style='body{margin:0;background:#101923;color:#e7edf3;font:16px system-ui}main{max-width:1150px;margin:auto;padding:24px}h1{margin-bottom:8px}p{line-height:1.6}a{color:#8edac0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}article{background:#1c2936;padding:18px;border:1px solid #394b5b;border-radius:12px}small{color:#bbc9d6}.warn{color:#ffd38c}.button{display:inline-block;padding:10px 15px;background:#174f42;border-radius:7px}iframe{width:100%;height:calc(100vh - 155px);border:0}header{padding:12px 20px}input{padding:12px;width:min(80%,480px);margin:15px 0}';
function page(title,body){return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+style+'</style>'+body+'</html>';}
function send(res,status,body,type='text/html; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body);}
function allowed(req,port){return ['GET','HEAD'].includes(req.method)&&req.headers.host===HOST+':'+port;}
function listen(server,port){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,HOST,()=>{server.removeListener('error',reject);resolve(server);});});}
function createApp(root=ROOT){
 const servers=new Map();const opening=new Map();
 async function gameServer(row){if(servers.has(row.id))return;if(opening.has(row.id))return opening.get(row.id);const work=(async()=>{
 const base=path.join(root,'games',row.id,'Web');
 const s=http.createServer((req,res)=>{if(!allowed(req,row.port))return send(res,403,'Forbidden');try{let rel=decodeURIComponent(req.url.split('?')[0]);if(rel==='/')rel='/index.html';rel=rel.slice(1);const ext=path.extname(rel).toLowerCase();if(!MIME[ext])return send(res,404,'Not found');const f=safeFile(base,rel);res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors http://${HOST}:${MAIN_PORT}`);res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',MIME[ext]);if(req.method==='HEAD')return res.end();fs.createReadStream(f).on('error',()=>res.destroy()).pipe(res);}catch{send(res,404,'Not found');}});
 try{await listen(s,row.port);servers.set(row.id,s);}catch(e){s.close();throw Error('고정 게임 포트 '+row.port+' 사용 불가. 다른 포트로 우회하지 않습니다. '+e.code);}
 })().finally(()=>opening.delete(row.id));opening.set(row.id,work);return work;}
 const server=http.createServer(async(req,res)=>{
 if(!allowed(req,MAIN_PORT))return send(res,403,'Forbidden');
 if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,'Cross-site access denied');
 res.setHeader('Content-Security-Policy',`default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src http://${HOST}:*; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
 const route=req.url.split('?')[0],data=inventory(root);
 if(route==='/'){
 const cards=data.rows.map(r=>'<article data-name="'+esc(r.title+' '+r.id)+'"><h2>'+esc(r.title)+'</h2><small>'+esc(r.id)+' · '+esc(r.version||'미확보')+' · '+esc((r.locales||[]).join(', '))+'</small><p>온라인 설정: '+(r.enabled?'기존 공개 후보':'비공개/미등록')+' / 로컬 목록에서는 제외하지 않음</p>'+(r.unregistered?'<p class="warn">카탈로그 미등록 폴더</p>':'')+r.warnings.map(w=>'<p class="warn">'+esc(w)+'</p>').join('')+(r.blocked?'<p role="status">실행 차단: '+esc(r.blocked)+'</p>':'<a class="button" href="/play/'+r.id+'">로컬 실행 (미검증)</a>')+'</article>').join('');
 return send(res,200,page('PlayHub 로컬 게임','<main><h1>PlayHub · 로컬 게임</h1><p>이 PC 전용입니다. 인터넷 공개·게임 제출 심사·Hub 계정 연동이 아닙니다. 게임별 고정 포트로 브라우저 저장소를 분리합니다. 기존 Hub/파일 실행 기록은 자동 이전되지 않습니다.</p><p>브라우저 쿠키/사이트 데이터 삭제 또는 포트 규칙 변경 시 저장을 잃을 수 있습니다. 서버 종료: 실행 창 Ctrl+C.</p><p>'+data.rows.length+'개 항목 (게임 '+data.rows.filter(r=>!r.pending).length+' / 미확보 실행 '+data.rows.filter(r=>r.kind==='missing-playable').length+' / 문서 '+data.rows.filter(r=>r.kind==='documentation').length+') · 실행 버튼은 완성도/안전성 인증이 아닙니다.</p>'+data.warnings.map(x=>'<p>'+esc(x)+'</p>').join('')+'<label>게임 찾기 <input id="q" type="search" placeholder="이름 또는 ID"></label><div class="grid">'+cards+'</div><script>document.getElementById("q").oninput=e=>document.querySelectorAll("article").forEach(a=>a.hidden=!a.dataset.name.toLowerCase().includes(e.target.value.toLowerCase()));</script></main>'));
 }
 const match=route.match(/^\/play\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/);if(!match)return send(res,404,'Not found');const r=data.rows.find(x=>x.id===match[1]);if(!r||r.blocked)return send(res,409,page('실행 차단','<main><a href="/">목록</a><h1>실행 차단</h1><p>'+esc(r?.blocked||'미등록 게임')+'</p></main>'));
 try{await gameServer(r);send(res,200,page(r.title,'<header><a href="/">← 전체 목록</a> · '+esc(r.title)+'<p>로컬 실행 · 계정 저장/통계 없음 · 게임별 포트 '+r.port+' · '+esc(r.warnings.join(' / '))+'</p></header><iframe title="'+esc(r.title)+'" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads" allow="fullscreen; gamepad" allowfullscreen src="http://'+HOST+':'+r.port+'/index.html"></iframe>'));}catch(e){send(res,503,page('실행 불가','<main><a href="/">목록</a><p>'+esc(e.message)+'</p></main>'));}
 });
 return {server,servers,close:async()=>{for(const s of servers.values())s.close();server.close();}};
}
if(require.main===module){const app=createApp();listen(app.server,MAIN_PORT).then(()=>console.log('LOCAL ONLY http://'+HOST+':'+MAIN_PORT+'/ (Ctrl+C to stop)')).catch(e=>{console.error('Local Hub cannot start:',e.message);process.exitCode=1;});for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>app.close().then(()=>process.exit(0)));}
module.exports={inventory,portFor,safeFile,createApp,listen,MAIN_PORT};
