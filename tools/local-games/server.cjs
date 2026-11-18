'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ROOT,MAIN_PORT,HOST,MIME,esc,inventory,portFor,safeFile,deployment,deployedBlock,releaseBadge}=require('./registry.cjs');
const style=`*{box-sizing:border-box}body{margin:0;background:#101923;color:#e7edf3;font:16px system-ui}main{max-width:1150px;margin:auto;padding:24px}h1{margin-bottom:8px}p{line-height:1.6}a{color:#8edac0}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}article{background:#1c2936;padding:18px;border:1px solid #394b5b;border-radius:12px}article[hidden]{display:none}small,.muted{color:#bbc9d6}.warn{color:#ffd38c}.button,button{display:inline-block;padding:10px 15px;background:#174f42;border:1px solid #38836c;color:white;border-radius:7px;font:inherit;text-decoration:none}button:disabled{background:#28323d;color:#a5afba;border-color:#4a5664}.toolbar{display:flex;gap:16px;align-items:end;flex-wrap:wrap;margin:24px 0}.toolbar label{display:grid;gap:8px}.search{flex:1}input,select{padding:12px;border:1px solid #536474;border-radius:7px;background:#1c2936;color:#e7edf3;font:inherit;width:100%;min-height:46px}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #8edac0;outline-offset:3px}.summary{padding:16px;border:1px solid #394b5b;border-radius:10px;overflow-wrap:anywhere}.badge{display:inline-block;font-size:13px;color:#8edac0;margin-bottom:6px}.player{display:flex;flex-direction:column;height:100dvh}.player header{padding:12px 20px}.player p{margin:6px 0;font-size:14px}.player iframe{flex:1;width:100%;min-height:0;border:0}h2{font-size:20px}.card-action{margin-top:16px}.counter{font-variant-numeric:tabular-nums}@media(max-width:500px){main{padding:16px}.toolbar label,.toolbar button{width:100%}.grid{grid-template-columns:minmax(0,1fr)}}`;
const releaseStyles='.card-labels{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;margin-bottom:6px}.card-labels .badge{margin:0}.release-badge{display:inline-flex;gap:5px;align-items:center;font-size:12px;color:#bbc9d6}.release-badge strong{background:#364b65;border-radius:5px;color:#fff;padding:2px 5px}.release-badge.new strong{background:#0d6252}';
function page(title,body){return '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title)+'</title><style>'+style+releaseStyles+'</style>'+body+'</html>';}
function send(res,status,body,type='text/html; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(body);}
function allowed(req,port){return ['GET','HEAD'].includes(req.method)&&req.headers.host===HOST+':'+port;}
function listen(server,port){return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,HOST,()=>{server.removeListener('error',reject);resolve(server);});});}
function listLink(mode,q){const params=new URLSearchParams({mode});if(q)params.set('q',q);return '/?'+params;}
function catalogPage(data,mode,q,target){
 const deployed=mode==='deployed';
 const label=deployed?'배포':'로컬';
 const visible=r=>(r.title+' '+r.id).toLowerCase().includes(q.toLowerCase());
 const excluded=deployed?data.rows.filter(r=>deployedBlock(r)):[];
 const listed=deployed?data.rows.filter(r=>!deployedBlock(r)):data.rows;
 const cards=listed.map(r=>{
  const reason=deployed?(deployedBlock(r)||target.error):r.blocked;
  const params=new URLSearchParams({mode});if(q)params.set('q',q);
  const badge=releaseBadge(r);
  const marker=badge?'<span class="release-badge '+badge.kind+'"><strong>'+badge.label+'</strong><time datetime="'+esc(badge.date)+'">'+esc(badge.date)+'</time></span>':'';
  return '<article data-name="'+esc(r.title+' '+r.id)+'"'+(visible(r)?'':' hidden')+'><div class="card-labels"><span class="badge">'+label+'</span>'+marker+'</div><h2>'+esc(r.title)+'</h2><small>'+esc(r.id)+' · '+esc(r.version||'버전 정보 없음')+'</small><p>'+(deployed?'배포 서버에서 실행합니다.':esc((r.locales||[]).join(', ')||'로컬 원본 게임'))+'</p>'+(r.unregistered?'<p class="warn">카탈로그 미등록</p>':'')+(!deployed?r.warnings.map(w=>'<p class="muted">'+esc(w)+'</p>').join(''):'')+(reason?'<p class="warn" role="status">'+esc(reason)+'</p><button type="button" disabled>실행 불가</button>':'<div class="card-action"><a class="button" href="/play/'+r.id+'?'+esc(params.toString())+'">실행</a></div>')+'</article>';
 }).join('');
 const summary=deployed?(target.error?'<p class="warn" role="status">'+esc(target.error)+'</p>':'<p>실행 서버: <a href="'+esc(target.baseUrl)+'" rel="noreferrer">'+esc(target.baseUrl)+'</a></p><p class="muted">저장소의 공개 설정으로 목록을 표시합니다. 로그인과 최종 실행 가능 여부는 배포 서버에서 확인합니다.</p>'):'<p>이 PC의 게임 원본을 실행합니다. 게임별 브라우저 저장은 유지되며, 배포 서버의 계정·진행 기록과 자동으로 합쳐지지 않습니다.</p>';
 return page('PlayHub · 게임 실행','<main><h1>PlayHub · 게임 실행</h1><p>같은 목록에서 실행 환경을 선택하세요.</p><form class="toolbar" method="get" action="/"><label>실행 환경<select id="mode" name="mode" aria-label="실행 환경"><option value="local"'+(!deployed?' selected':'')+'>로컬</option><option value="deployed"'+(deployed?' selected':'')+'>배포</option></select></label><label class="search">게임 찾기<input id="q" name="q" type="search" value="'+esc(q)+'" placeholder="이름 또는 ID"></label><button type="submit">적용</button></form><section class="summary" aria-label="실행 환경 안내">'+summary+'</section><p class="counter" id="count" aria-live="polite">'+listed.filter(visible).length+' / '+listed.length+'개 게임</p>'+data.warnings.map(x=>'<p class="warn">'+esc(x)+'</p>').join('')+'<div class="grid">'+cards+'</div>'+unavailableMarkup(data.unavailable,excluded)+'<script>const form=document.querySelector("form"),q=document.getElementById("q");document.getElementById("mode").addEventListener("change",()=>form.requestSubmit());q.addEventListener("input",()=>{const value=q.value.toLowerCase();let count=0;document.querySelectorAll("article").forEach(a=>{a.hidden=!a.dataset.name.toLowerCase().includes(value);if(!a.hidden)count++});document.getElementById("count").textContent=count+" / "+document.querySelectorAll("article").length+"개 항목";const url=new URL(location.href);url.searchParams.set("q",q.value);history.replaceState(null,"",url);document.querySelectorAll("article a.button").forEach(a=>{const link=new URL(a.href);link.searchParams.set("q",q.value);a.href=link.href;});});</script></main>');
}
function unavailableMarkup(unavailable=[],excluded=[]){
 const sections=[];
 if(unavailable.length)sections.push('<details class="summary" id="unavailable-sources"><summary>실행본이 없는 자료 · '+unavailable.length+'개</summary><ul>'+unavailable.map(row=>'<li><strong>'+esc(row.title)+'</strong> — '+esc(row.blocked)+'</li>').join('')+'</ul></details>');
 if(excluded.length)sections.push('<details class="summary" id="unpublished-games"><summary>배포 목록에 없는 게임 · '+excluded.length+'개</summary><p>로컬 환경에서 실행할 수 있습니다. 배포 공개 상태는 변경하지 않습니다.</p><ul>'+excluded.map(row=>'<li>'+esc(row.title)+'</li>').join('')+'</ul></details>');
 return sections.join('');
}
function createApp(root=ROOT,{port=MAIN_PORT,env=process.env}={}){
 const servers=new Map(),opening=new Map();let closing=false;
 const mainPort=()=>server.address()?.port||port;
 async function gameServer(row){
  if(closing)throw Error('Launcher is closing');
  if(servers.has(row.id))return;
  if(opening.has(row.id))return opening.get(row.id);
  const work=(async()=>{
   const base=path.join(root,'games',row.id,'Web');
   const s=http.createServer((req,res)=>{
    if(!allowed(req,row.port))return send(res,403,'Forbidden');
    try{
     let rel=decodeURIComponent(req.url.split('?')[0]);if(rel==='/')rel='/index.html';rel=rel.slice(1);
     const ext=path.extname(rel).toLowerCase();if(!MIME[ext])return send(res,404,'Not found');const f=safeFile(base,rel);
     res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors http://"+HOST+':'+mainPort());
     res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',MIME[ext]);
     if(req.method==='HEAD')return res.end();fs.createReadStream(f).on('error',()=>res.destroy()).pipe(res);
    }catch{send(res,404,'Not found');}
   });
   try{await listen(s,row.port);servers.set(row.id,s);}catch(e){s.close();throw Error('고정 게임 포트 '+row.port+' 사용 불가. 다른 포트로 우회하지 않습니다. '+e.code);}
  })().finally(()=>opening.delete(row.id));opening.set(row.id,work);return work;
 }
 const server=http.createServer(async(req,res)=>{
  if(!allowed(req,mainPort()))return send(res,403,'Forbidden');
  if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,'Cross-site access denied');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-src http://"+HOST+":*; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  try{
   const url=new URL(req.url,'http://'+HOST+':'+mainPort()),route=url.pathname,mode=url.searchParams.get('mode')??'local',q=(url.searchParams.get('q')||'').slice(0,200);
   if(url.searchParams.getAll('mode').length>1||!['local','deployed'].includes(mode))return send(res,400,page('실행 환경 오류','<main><h1>실행 환경을 확인하세요</h1><a href="/">게임 목록</a></main>'));
   const runtimeAssets={'/runtime/player-locale.js':path.join(__dirname,'player-locale.js'),'/runtime/sdk-host.js':path.join(__dirname,'sdk-host.js'),'/runtime/game-logic.js':path.join(ROOT,'hub/shared/game-logic.js')};
   if(Object.hasOwn(runtimeAssets,route)){
    const asset=runtimeAssets[route];
    if(!fs.existsSync(asset))return send(res,503,'Runtime asset unavailable','text/plain');
    return send(res,200,req.method==='HEAD'?'':fs.readFileSync(asset),'text/javascript; charset=utf-8');
   }
   const data=inventory(root),target=deployment(root,env);
   if(route==='/')return send(res,200,catalogPage(data,mode,q,target));
   const match=route.match(/^\/play\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/);
   if(!match)return send(res,404,'Not found');
   const row=data.rows.find(r=>r.id===match[1]),back='<a href="'+esc(listLink(mode,q))+'">← 게임 목록</a>';
   const reason=!row?'미등록 게임입니다.':mode==='deployed'?deployedBlock(row):row.blocked;
   if(reason)return send(res,409,page('실행 불가','<main>'+back+'<h1>실행할 수 없습니다</h1><p>'+esc(reason)+'</p></main>'));
   if(mode==='deployed'){
    if(target.error)return send(res,503,page('배포 설정 확인','<main>'+back+'<p>'+esc(target.error)+'</p></main>'));
    const destination=new URL('play/'+row.id+'/',target.baseUrl);
    if(destination.origin==='http://'+HOST+':'+mainPort())return send(res,503,page('배포 설정 확인','<main>'+back+'<p>배포 서버 주소가 게임 런처 자신을 가리킵니다. Hub의 userBaseUrl을 확인하세요.</p></main>'));
    res.setHeader('Location',destination.href);return send(res,302,'');
   }
   try{
    await gameServer(row);
    const native=row.integration==='native-sdk',nonce=crypto.randomBytes(24).toString('hex'),origin='http://'+HOST+':'+row.port;
    const frameUrl=origin+'/index.html#nonce='+nonce;
    const languages={'ko':'한국어','en':'English','ja':'日本語','zh-CN':'简体中文','fr':'Français','es':'Español','pt-BR':'Português','hi':'हिन्दी'};
    const choices=(row.locales||[]).filter(locale=>Object.hasOwn(languages,locale));
    const languageControl=choices.length>1?'<label>언어 / Language <select id="game-language" style="width:auto;padding:4px;min-height:32px">'+choices.map(locale=>'<option value="'+locale+'">'+languages[locale]+'</option>').join('')+'</select></label>':'';
    const listBack=back.replace('<a ','<a id="game-list-link" ');
    send(res,200,page(row.title,'<div class="player"><header>'+listBack+' · '+esc(row.title)+' '+languageControl+'<p id="runtime-status" role="status">'+(native?'게임 연결 중…':'로컬 실행 · 이 기기 브라우저 저장')+'</p></header><iframe id="game-frame" data-game-id="'+row.id+'" data-game-origin="'+origin+'" data-nonce="'+nonce+'" title="'+esc(row.title)+'" sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-downloads" allow="fullscreen; gamepad" allowfullscreen src="'+frameUrl+'"></iframe></div><script src="/runtime/player-locale.js"></script>'+(native?'<script src="/runtime/game-logic.js"></script><script src="/runtime/sdk-host.js"></script>':'')));
   }catch(e){send(res,503,page('실행 불가','<main>'+back+'<p>'+esc(e.message)+'</p></main>'));}
  }catch{send(res,503,page('목록 확인','<main><h1>게임 목록을 읽을 수 없습니다</h1><p>저장소의 games 폴더와 카탈로그를 확인하세요.</p><a href="/">다시 시도</a></main>'));}
 });
 const closeServer=s=>new Promise(resolve=>{if(!s.listening)return resolve();s.close(resolve);s.closeAllConnections();});
 return {server,servers,close:async()=>{closing=true;await closeServer(server);await Promise.allSettled([...opening.values()]);await Promise.all([...servers.values()].map(closeServer));servers.clear();}};
}
function openBrowser(url){
 if(process.env.PLAYHUB_NO_BROWSER==='1')return;
 const {spawn}=require('node:child_process');
 const [command,args]=process.platform==='win32'?['rundll32.exe',['url.dll,FileProtocolHandler',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
 const child=spawn(command,args,{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>console.log('Open '+url));child.unref();
}
if(require.main===module){
 const args=process.argv.slice(2);
 if(Number(process.versions.node.split('.')[0])<22||args.some(arg=>arg!=='--check')){console.error('Usage: Run_Games.bat [--check]. Node.js 22 or newer is required.');process.exitCode=1;}
 else if(args.includes('--check')){
  try{const data=inventory(ROOT),target=deployment(ROOT);if(data.warnings.length)throw Error(data.warnings.join('\n'));console.log('Games ready: '+data.rows.length+' entries; '+(target.error?'deployed configuration unavailable':'deployed target '+target.baseUrl));}catch(e){console.error(e.message);process.exitCode=1;}
 }else{
  const app=createApp();listen(app.server,MAIN_PORT).then(()=>{const url='http://'+HOST+':'+MAIN_PORT+'/';console.log('PlayHub Games '+url+' (local / deployed; Ctrl+C to stop)');openBrowser(url);}).catch(e=>{console.error('Games cannot start:',e.message);process.exitCode=1;});
  for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>app.close().then(()=>process.exit(0)));
 }
}
module.exports={inventory,portFor,safeFile,createApp,listen,MAIN_PORT,deployment};
