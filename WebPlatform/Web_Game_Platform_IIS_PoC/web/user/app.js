(function () {
  'use strict';
  const Rules=window.PortalRules;
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
  const conf=window.PLAYHUB_CONFIG||{}, hostname=location.hostname.includes(':')&&!location.hostname.startsWith('[')?'['+location.hostname+']':location.hostname;
  const API=(conf.apiBaseUrl||`${location.protocol==='https:'?'https:':'http:'}//${hostname}:${Number(conf.apiPort)||8090}`).replace(/\/$/,'');
  const state={session:null,games:[],allMetadata:new Map(),trusted:new Set(),limited:false,genre:'all',query:'',active:null,route:0,events:[],flushing:false,flushAgain:false,impressions:[],observer:null,cacheScope:'',closing:null,sessionEpoch:0,authStale:false,authChanging:false,reconnecting:false,saveManager:null,preparedPlay:null};
  const genres={puzzle:'퍼즐',arcade:'아케이드',classic:'클래식',casual:'캐주얼',action:'액션',logic:'두뇌',memory:'기억력',numbers:'숫자',match3:'매치3',blocks:'블록'};
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  function banner(message){$('connection-banner').hidden=!message;$('connection-banner').textContent=message||'';if(message){const b=document.createElement('button');b.type='button';b.textContent=state.reconnecting?'연결 확인 중…':'서버 연결 확인';b.dataset.testid='reconnect';b.disabled=state.reconnecting;b.onclick=()=>refreshConnection(true);$('connection-banner').append(b);}}
  async function api(path,{method='GET',body,headers={},meta=false,keepalive=false,timeout=7000}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    const epoch=state.sessionEpoch,h={...headers};if(body!==undefined)h['Content-Type']='application/json';if((!['GET','HEAD'].includes(method)||path.startsWith('/api/saves/'))&&state.session?.csrfToken)h['X-CSRF-Token']=state.session.csrfToken;
    try{const response=await fetch(API+path,{method,credentials:'include',cache:'no-store',headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,keepalive});let data;try{data=await response.json();}catch(_){data={};}
      if(epoch!==state.sessionEpoch)throw Object.assign(new Error('로그인 상태가 변경되어 이전 요청을 취소했습니다.'),{code:'SESSION_CHANGED',status:409});
      if(!response.ok){const error=new Error(data.error?.message||`요청을 처리하지 못했습니다. (${response.status})`);error.code=data.error?.code||'HTTP_ERROR';error.status=response.status;error.details=data;if(Rules.authFailure(error))markAuthStale();throw error;}
      return meta?{data,etag:response.headers.get('ETag')}:data;
    }catch(error){if(!error.status){error.code='NETWORK';error.message='서버에 연결할 수 없습니다. 설치한 API 서비스와 포트 설정을 확인해 주세요.';}throw error;}finally{clearTimeout(timer);}
  }
  function storageScope(value){let a=2166136261,b=2246822519,c=3266489917,d=668265263;for(const ch of String(value)){const n=ch.charCodeAt(0);a=Math.imul(a^n,16777619);b=Math.imul(b^n,3266489917);c=Math.imul(c^n,668265263);d=Math.imul(d^n,374761393);}return [a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');}
  function localScope(){try{let scope=sessionStorage.getItem('ph-local-scope');if(!scope){scope=uuid().replace(/-/g,'');sessionStorage.setItem('ph-local-scope',scope);}return 'local-'+scope;}catch(_){return 'local-'+uuid().replace(/-/g,'');}}
  function cacheKey(id,backup=false,scope=state.cacheScope){return `ph-${backup?'backup':'save'}-${scope}-${id}`;}
  function cacheGet(id,backup=false,scope=state.cacheScope){try{const value=JSON.parse(sessionStorage.getItem(cacheKey(id,backup,scope))||'null');return value&&value.gameId===id?value:null;}catch(_){return null;}}
  function cacheSet(id,value,baseRevision,dirty=false,backup=false,scope=state.cacheScope){try{sessionStorage.setItem(cacheKey(id,backup,scope),JSON.stringify({gameId:id,value,baseRevision,dirty,updatedAt:Date.now()}));return true;}catch(_){return false;}}
  function clearPrivateCache(){try{for(const key of Object.keys(sessionStorage))if(/^ph-(save|backup|local-scope)/.test(key))sessionStorage.removeItem(key);}catch(_) {}}
  function setSession(session){const next=storageScope(session.csrfToken||uuid());if(state.cacheScope&&state.cacheScope!==next){clearPrivateCache();state.sessionEpoch++;state.events=[];state.preparedPlay=null;}state.session=session;state.cacheScope=next;state.authStale=false;updateAccount();}
  function markAuthStale(){if(!state.session||state.authStale)return;state.authStale=true;state.events=[];if(state.active&&!state.active.local){heartbeat(state.active);state.active.authPreviousSaveBlocked=state.active.saveBlocked;state.active.saveBlocked=true;state.active.port?.postMessage({type:'host_pause'});saveStatus('로그인 상태가 바뀌었거나 만료됐어요. 서버 연결을 확인해 주세요.',true);}updateAccount();banner('로그인 상태를 다시 확인해야 합니다. 이전 기록을 다른 계정에 자동 적용하지 않습니다.');}
  function updateAccount(){const s=state.session;if(!s){$('identity').textContent='로컬 체험 · 서버 연결 없음';$('google-login').textContent='Google 연결 확인 불가';$('google-login').disabled=true;$('google-login').hidden=false;$('logout').hidden=true;$('merge-open').hidden=true;return;}
    $('identity').textContent=state.limited&&s.kind!=='registered'?'로컬 모드 · 이 탭에 임시 기록':s.kind==='registered'?`${s.displayName||'연결된 계정'} · 계정 저장`:s.kind==='guest'?'게스트 · 진행 자동 저장':'로그인 없이 바로 시작';
    const loopback=['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname),lanBlocked=location.protocol!=='https:'&&!loopback;
    if(state.active?.local)$('identity').textContent=(s.kind==='registered'?(s.displayName||'연결된 계정')+' · ':'')+'현재 게임은 로컬 모드';
    if(state.authStale)$('identity').textContent='로그인 상태 확인 필요';else if(s.trafficType==='qa')$('identity').textContent+=' · QA 기록';
    $('google-login').hidden=s.kind==='registered';$('google-login').disabled=state.limited||state.authStale||!s.googleEnabled||lanBlocked;
    $('google-login').textContent=s.trafficType==='qa'?'QA 세션 · 게스트 플레이':state.limited?'서버 연결 후 Google':!s.googleEnabled?'Google 연결 설정 필요':lanBlocked?'Google 연결은 HTTPS에서':'Google로 이어서';
    $('google-login').title=s.trafficType==='qa'?'QA 세션은 실제 계정과 연결하지 않습니다. 이용 지표도 실제 기록과 분리됩니다.':!s.googleEnabled?'서버에 Google OAuth 설정이 필요합니다. 게스트 게임은 바로 시작할 수 있습니다.':lanBlocked?'다른 PC에서의 Google 로그인은 등록된 HTTPS 도메인이 필요합니다. 게스트 게임은 이용할 수 있습니다.':'선택 사항입니다. 게임은 로그인 없이 시작할 수 있습니다.';
    $('logout').hidden=s.kind!=='registered';$('merge-open').hidden=!s.pendingMerge;
  }
  function event(name,gameId,properties={},extra={}){if(!state.session||state.limited||state.authStale)return;const item={event_id:uuid(),event_name:name,game_id:gameId,occurred_at:new Date().toISOString(),properties,...extra};state.events.push(item);if(state.events.length>300)state.events.splice(0,state.events.length-300);if(state.events.length>=12)flushEvents();}
  async function flushEvents(keepalive=false){if(!state.events.length||!state.session||state.limited||state.authStale)return;if(state.flushing){state.flushAgain=true;return;}state.flushing=true;const batch=state.events.slice(0,30);
    try{const result=await api('/api/events',{method:'POST',body:{events:batch},keepalive,timeout:5000});const handled=new Set([...(result.accepted||[]),...(result.duplicates||[]),...(result.rejected||[]).map(x=>x.event_id)]);state.events=state.events.filter(x=>!handled.has(x.event_id));}
    catch(_){}finally{state.flushing=false;if(state.flushAgain){state.flushAgain=false;flushEvents();}}
  }
  function cardMarkup(g,recent=false){const href='/play/'+encodeURIComponent(g.id)+'/';if(recent)return `<a class="recent-card" href="${href}" data-game-link="${esc(g.id)}" data-impression="${esc(g.id)}"><img src="${esc(g.cover)}" alt="" loading="lazy"><div><h3>${esc(g.title)}</h3><p>이어서 한 판 →</p></div></a>`;
    return `<a class="game-card" data-testid="game-card" data-game-id="${esc(g.id)}" href="${href}" data-game-link="${esc(g.id)}" data-impression="${esc(g.id)}"><img class="game-cover" src="${esc(g.cover)}" alt="${esc(g.title)} 게임 표지" loading="lazy" width="640" height="400"><div class="card-copy"><div class="card-topline"><h3 class="card-title">${esc(g.title)}</h3><span class="play-icon" aria-hidden="true">▶</span></div><p class="card-description">${esc(g.description)}</p><div class="card-tags">${g.tags.slice(0,2).map(t=>`<span class="tag">${esc(genres[t]||t)}</span>`).join('')}<span class="tag online">바로 플레이</span></div></div></a>`;
  }
  function stopImpressions(){state.observer?.disconnect();for(const item of state.impressions)clearTimeout(item.timer);state.impressions=[];}
  function checkImpression(item){clearTimeout(item.timer);if(item.recorded||document.hidden||item.ratio<.5){item.started=0;return;}item.started=performance.now();item.timer=setTimeout(()=>{if(Rules.eligibleImpression(item,performance.now(),!document.hidden)){item.recorded=true;event('game_impression',item.gameId,{visible_fraction:Math.min(1,item.ratio),visible_duration_ms:1000,document_visible:true},{impression_id:item.id});}},1000);}
  function watchImpressions(){stopImpressions();if(!('IntersectionObserver'in window))return;state.observer=new IntersectionObserver(entries=>{for(const e of entries){const item=state.impressions.find(i=>i.element===e.target);if(!item)continue;const before=item.ratio;item.ratio=e.intersectionRatio;if(before<.5||item.ratio<.5)checkImpression(item);}},{threshold:[0,.5,1]});
    for(const element of $('app').querySelectorAll('[data-impression]')){const item={element,gameId:element.dataset.impression,id:uuid(),ratio:0,started:0,timer:0,recorded:false};state.impressions.push(item);state.observer.observe(element);}
  }
  function recentGames(){try{return JSON.parse(localStorage.getItem('ph-recent')||'[]').filter(id=>state.games.some(g=>g.id===id)).slice(0,5);}catch(_){return [];}}
  function rememberGame(id){try{localStorage.setItem('ph-recent',JSON.stringify([id,...recentGames().filter(x=>x!==id)].slice(0,5)));}catch(_) {}}
  function meta(title,description,path='/'){document.title=title;const descriptionTag=document.querySelector('meta[name=description]');if(descriptionTag)descriptionTag.content=description;let canonical=document.querySelector('link[rel=canonical]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=location.origin+path;}
  function renderHome(){const q=state.query.toLocaleLowerCase(),games=state.games.filter(g=>(state.genre==='all'||g.tags.includes(state.genre))&&(!q||`${g.title} ${g.englishTitle} ${g.description} ${g.tags.map(t=>genres[t]||t).join(' ')}`.toLocaleLowerCase().includes(q)));
    const featured=state.games.find(g=>g.id==='match3-garden')||state.games[0],recent=recentGames().map(id=>state.games.find(g=>g.id===id));
    $('app').innerHTML=`<div class="page">${!q&&state.genre==='all'&&featured?`<section class="hero" data-impression="${esc(featured.id)}"><div class="hero-copy"><span class="eyebrow">A LITTLE BREAK, A GOOD GAME</span><h1>가볍게 시작하는<br>한 판의 즐거움</h1><p>설치도, 회원가입도 필요 없어요.<br>마음 가는 게임으로 잠깐 쉬어가세요.</p><div class="hero-actions"><a class="button primary" href="/play/${esc(featured.id)}/" data-game-link="${esc(featured.id)}">지금 플레이 <span aria-hidden="true">↗</span></a><span class="hero-note">무료 · 게스트 자동 저장</span></div></div><div class="hero-visual"><img class="hero-cover" src="${esc(featured.cover)}" alt="${esc(featured.title)} 게임 표지" width="640" height="400"><div class="hero-label">오늘은 ${esc(featured.title)}<span>한 번 더 연결하고 싶은 퍼즐</span></div></div></section>`:''}
      ${!q&&state.genre==='all'&&recent.length?`<section class="recent-section"><div class="section-heading"><div><h2>다시 만나 반가운 게임</h2><p>이 브라우저에서 최근 시작한 게임이에요.</p></div></div><div class="recent-list">${recent.map(g=>cardMarkup(g,true)).join('')}</div></section>`:''}
      <section id="all-games"><div class="section-heading"><div><h2>${q?'“'+esc(state.query)+'” 검색 결과':'오늘의 작은 플레이리스트'}</h2><p>클릭 한 번으로 시작하는 가벼운 웹 게임</p></div><span class="section-count">${games.length}개 게임</span></div><div class="filters" aria-label="장르 필터">${[['all','전체'],['puzzle','퍼즐'],['arcade','아케이드'],['classic','클래식'],['logic','두뇌']].map(([v,label])=>`<button type="button" class="filter ${state.genre===v?'active':''}" data-filter="${v}" aria-pressed="${state.genre===v}">${label}</button>`).join('')}</div><div class="game-grid">${games.map(g=>cardMarkup(g)).join('')||'<div class="no-results">조건에 맞는 게임이 없어요. 검색어나 장르를 바꿔보세요.</div>'}</div></section><section class="info-strip"><div><strong aria-hidden="true">↗</strong><h3>설치 없이 바로</h3><p>브라우저만 있으면 준비 끝.<br>내려받는 과정 없이 플레이해요.</p></div><div><strong aria-hidden="true">◇</strong><h3>짧게 즐기는 즐거움</h3><p>퍼즐과 클래식 아케이드.<br>가볍지만 끝까지 즐거운 규칙이에요.</p></div><div><strong aria-hidden="true">✓</strong><h3>게스트도 이어서</h3><p>진행은 자동으로 저장돼요.<br>계정 연결은 필요할 때 선택하세요.</p></div></section></div>`;
    meta('PLAY HUB — 가볍게 시작하는 웹 게임','설치와 회원가입 없이 시작하는 여덟 가지 브라우저 게임. 퍼즐과 클래식 아케이드를 즐겨보세요.');document.documentElement.classList.add('js');watchImpressions();
  }
  function empty(title,message){stopImpressions();$('app').innerHTML=`<section class="empty-state"><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="button primary" href="/" data-home>게임 목록으로</a></section>`;}
  async function renderDetail(id,route){const game=state.games.find(g=>g.id===id);if(!game){empty('게임을 찾을 수 없어요','주소를 확인하거나 지금 이용할 수 있는 다른 게임을 골라보세요.');return;}
    if(!state.limited){try{await api('/api/games/'+encodeURIComponent(id));}catch(error){if(route!==state.route)return;if(error.status===404){empty('지금은 쉬고 있는 게임이에요','운영자가 이 게임의 공개를 중단했습니다. 다른 게임을 만나보세요.');return;}banner('서버의 최신 게임 상태를 확인하지 못했습니다. 게임 시작 때 다시 확인합니다.');}}
    if(route!==state.route)return;const related=state.games.filter(g=>g.id!==id).slice(0,3);
    $('app').innerHTML=`<div class="page"><nav class="breadcrumb" aria-label="이동 경로"><a href="/" data-home>게임 홈</a><span>›</span><span>${esc(genres[game.tags[0]]||'게임')}</span><span>›</span><span>${esc(game.title)}</span></nav><div class="detail-heading"><img class="detail-icon" src="${esc(game.cover)}" alt="" width="94" height="69"><div><h1>${esc(game.title)}</h1><p>${esc(game.description)}</p><div class="card-tags">${game.tags.map(t=>`<span class="tag">${esc(genres[t]||t)}</span>`).join('')}<span class="tag">무료</span></div></div></div><div class="detail-layout"><div><div class="player-panel fullscreen-player" id="player-panel"><div class="player-poster"><img src="${esc(game.cover)}" alt="${esc(game.title)} 표지" width="640" height="400"><button class="button primary large" id="play-button" data-testid="launch-game" type="button">▶ ${state.limited?'로컬 모드로 플레이':'로그인 없이 플레이'}</button><p>${state.limited?'로컬 모드는 이 탭에만 임시 저장되며 서버 저장·통계는 제공되지 않습니다.':'회원가입 없이 시작해요. 게스트 진행도 자동으로 저장됩니다.'}</p></div></div><div class="player-tools"><span id="save-indicator" data-testid="save-status" class="save-indicator">준비되면 플레이 버튼을 눌러주세요.</span><div class="player-tools-right"><button id="saves-open" data-testid="save-manager-open" class="text-button" type="button">저장 기록</button><button id="save-retry" data-testid="save-retry" class="text-button" type="button" hidden>서버 저장 다시 시도</button><button id="backup-download" class="text-button" type="button" hidden>임시 기록 받기</button><button id="fullscreen" class="text-button" type="button">전체 화면 ↗</button><button id="close-game" class="text-button" type="button" hidden>게임 닫기</button></div></div><div class="detail-info"><section><h2>이렇게 플레이해요</h2><p>${esc(game.instructions)}</p></section><section><h2>한 판의 목표</h2><p>${esc(game.rules)}</p></section></div></div><aside class="detail-sidebar"><section class="sidebar-card"><h2>편한 방법으로 즐기세요</h2>${game.controls.map(c=>`<span class="device-badge">${esc({keyboard:'키보드',mouse:'마우스',touch:'터치'}[c]||c)}</span>`).join('')}<p style="margin-top:10px">게임 화면의 도움말과 조작 버튼을 확인하세요. 화면을 떠나면 자동으로 잠시 멈춥니다.</p></section><section class="sidebar-card"><h2>기록은 가볍게, 이어서는 편하게</h2><p>이 브라우저에서는 게스트로도 이어서 할 수 있어요. 다른 기기에서 이어 하려면 설정된 Google 계정 연결을 선택하세요.</p><p style="margin-top:10px">쿠키 삭제 후에는 게스트 기록을 다시 찾지 못할 수 있어요.</p></section></aside></div><section class="related"><div class="section-heading"><div><h2>다음 한 판도 골라볼까요?</h2><p>다른 즐거움이 기다리고 있어요.</p></div></div><div class="game-grid">${related.map(g=>cardMarkup(g)).join('')}</div></section></div>`;
    meta(`${game.title} | PLAY HUB 무료 웹 게임`,game.description,`/play/${id}/`);document.documentElement.classList.add('js');watchImpressions();event('game_detail_view',id);
    $('play-button').onclick=()=>startPlay(game);$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('player-panel').requestFullscreen();}catch(_){toast('이 브라우저에서는 전체 화면을 사용할 수 없어요.');}};
    $('close-game').onclick=async()=>{await teardown('user_close');await renderRoute();};$('backup-download').onclick=()=>downloadBackup(id);$('saves-open').onclick=()=>openSaveManager(game);$('save-retry').onclick=()=>retrySave();
  }
  async function renderRoute(){const token=++state.route;let id=null;try{id=decodeURIComponent(location.pathname.match(/^\/play\/([^/]+)\/?/)?.[1]||new URLSearchParams(location.search).get('game')||'');}catch(_){}
    state.query=(new URLSearchParams(location.search).get('q')||'').slice(0,100);$('search').value=state.query;
    if(id&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id))await renderDetail(id,token);else renderHome();
  }
  async function navigate(path){await teardown('navigation');stopImpressions();history.pushState({},'',path);await renderRoute();window.scrollTo({top:0,behavior:'auto'});}
  function saveStatus(message,warning=false){const el=$('save-indicator');if(el){el.textContent=message;el.classList.toggle('warning',warning);}const a=state.active;if($('save-retry'))$('save-retry').hidden=!warning||!a||a.local||a.saveBlocked||state.authStale;if(a?.port&&!a.closed)a.port.postMessage({type:'save_status',payload:{state:warning?'local':'saved',message}});}
  function showBackup(){if($('backup-download'))$('backup-download').hidden=false;}
  function downloadBackup(id){const scope=state.active?.cacheScope||state.cacheScope;const value=cacheGet(id,true,scope)||cacheGet(id,false,scope);if(!value){toast('받을 수 있는 임시 기록이 없습니다.');return;}const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=id+'-progress-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function loadSave(a){const cached=cacheGet(a.game.id,false,a.cacheScope);
    if(a.local){saveStatus('로컬 모드 · 이 탭에 임시 저장 · 서버 통계 없음',true);showBackup();return {value:cached?.value||null,local:true};}
    try{const result=await api('/api/saves/'+encodeURIComponent(a.game.id)+'?slot=main',{meta:true});if(a.closed||a.epoch!==state.sessionEpoch)return {value:null,local:true};a.revision=result.data.revision;a.etag=result.etag||`"r${a.revision}"`;
      const choice=Rules.saveLoadChoice(cached,a.revision);
      if(choice==='local'){a.dirty=true;saveStatus('임시 진행을 불러왔어요. 서버 저장을 다시 시도할 수 있습니다.',true);showBackup();return {value:cached.value,local:true};}
      if(choice==='conflict'){a.revision=cached.baseRevision;a.saveBlocked=true;a.dirty=true;showBackup();saveStatus('서버와 이 탭의 진행이 달라요. 저장 기록에서 이어갈 기록을 선택하세요.',true);return {value:cached.value,local:true};}
      cacheSet(a.game.id,result.data.payload,a.revision,false,false,a.cacheScope);saveStatus('저장된 진행을 불러왔어요.');return {value:result.data.payload,local:false};
    }catch(error){if(a.closed||a.epoch!==state.sessionEpoch)return {value:null,local:true};if(error.status===404){a.revision=0;a.etag=null;if(cached?.dirty){a.revision=cached.baseRevision;a.saveBlocked=cached.baseRevision!==0;a.dirty=true;saveStatus(a.saveBlocked?'서버 기록과 임시 진행을 확인해야 합니다. 저장 기록을 열어 주세요.':'이 탭의 임시 진행을 불러왔어요.',true);return {value:cached.value,local:true};}saveStatus('첫 한 판이에요. 진행은 자동 저장됩니다.');return {value:null,local:false};}
      if(!error.status&&cached){a.revision=cached.baseRevision||0;a.etag=a.revision?`"r${a.revision}"`:null;saveStatus('서버 연결 지연 · 브라우저 임시 기록 사용',true);showBackup();return {value:cached.value,local:true};}
      saveStatus('저장 기록을 확인하지 못했어요. 연결 상태를 확인해 주세요.',true);a.saveBlocked=true;return {value:null,local:true};
    }
  }
  function writeSave(a,value){const task=async()=>{
      if(!value||value.gameId!==a.game.id||value.schemaVersion!==1||JSON.stringify(value).length>65536)throw Object.assign(new Error('게임 저장 형식이 올바르지 않습니다.'),{code:'SAVE_INVALID'});
      if(a.closed||(!a.local&&a.epoch!==state.sessionEpoch))throw Object.assign(new Error('종료된 게임의 저장 요청입니다.'),{code:'SESSION_CHANGED'});
      const stored=cacheSet(a.game.id,value,a.revision||0,true,false,a.cacheScope);a.dirty=true;
      if(a.local){if(!stored)throw Object.assign(new Error('이 탭의 임시 저장 공간을 사용할 수 없습니다.'),{code:'LOCAL_STORAGE_UNAVAILABLE'});saveStatus('로컬 모드 · 이 탭에 저장됨 · 서버 통계 없음',true);showBackup();return {local:true};}
      if(a.saveBlocked||a.resolving||state.authStale){showBackup();saveStatus('이 탭의 진행을 보관 중입니다. 저장 기록에서 충돌을 해결해 주세요.',true);throw Object.assign(new Error('서버 기록을 보호하기 위해 자동 저장을 멈췄습니다. 저장 기록에서 선택해 주세요.'),{code:'SAVE_CONFLICT'});}
      const key=uuid(),headers={'Idempotency-Key':key,...(a.revision?{'If-Match':a.etag||`"r${a.revision}"`}:{'If-None-Match':'*'})};
      try{let result;for(let attempt=0;attempt<2;attempt++){try{result=await api('/api/saves/'+encodeURIComponent(a.game.id)+'?slot=main',{method:'PUT',body:{payload:value,schemaVersion:1},headers,meta:true,timeout:2000});break;}catch(error){if(error.status||attempt===1)throw error;}}
        if(a.closed||a.epoch!==state.sessionEpoch)throw Object.assign(new Error('로그인 상태가 변경되었습니다.'),{code:'SESSION_CHANGED',status:409});a.revision=result.data.revision;a.etag=result.etag||`"r${a.revision}"`;cacheSet(a.game.id,value,a.revision,false,false,a.cacheScope);a.dirty=false;saveStatus('진행이 서버에 저장됐어요.');return {local:false,revision:a.revision};
      }catch(error){a.dirty=true;showBackup();if(error.status===412){a.saveBlocked=true;saveStatus('다른 탭의 기록과 충돌했어요. 저장 기록에서 이어갈 기록을 선택하세요.',true);a.port?.postMessage({type:'host_pause'});throw Object.assign(new Error('다른 탭의 저장과 충돌했습니다. 저장 기록에서 해결할 수 있습니다.'),{code:'SAVE_CONFLICT'});}
        if(stored&&Rules.allowsLocal(error)&&!Rules.authFailure(error)){saveStatus('연결 지연 · 이 탭에 임시 저장됐어요.',true);banner('서버 저장이 지연되고 있어요. 게임 진행은 이 탭에 보관하며 서버 연결 확인 후 다시 저장할 수 있습니다.');return {local:true};}
        saveStatus('저장하지 못했어요. 게임 화면을 유지해 주세요.',true);throw error;
      }
    };const promise=(a.saveChain||Promise.resolve()).catch(()=>{}).then(task);a.saveChain=promise;return promise;
  }
  async function retrySave(){const a=state.active;if(!a||a.local)return;if(a.saveBlocked){await openSaveManager(a.game);return;}try{const snapshot=await requestSnapshot(a),value=snapshot||cacheGet(a.game.id,false,a.cacheScope)?.value;if(value)await writeSave(a,value);if(!a.dirty)banner('');}catch(error){toast(error.message);}}
  function playEvent(a,name,properties={}){if(a.local)return;event(name,a.game.id,properties,{play_session_id:a.id});if(['game_ready','game_resume','game_pause','game_end','round_complete'].includes(name))flushEvents();}
  function accumulate(a,now=performance.now()){a.activeMs+=Rules.activeDelta(a,now,!document.hidden);a.lastTick=now;}
  function heartbeat(a){if(!a?.ready)return;accumulate(a);const delta=Math.floor(a.activeMs);if(delta<=0)return;a.activeMs-=delta;playEvent(a,'play_heartbeat',{sequence:a.sequence++,active_delta_ms:delta,document_visible:true,paused:false,game_updating:true});}
  async function allowLocal(game){
    if(!state.trusted.has(game.id)||!state.allMetadata.has(game.id))throw new Error('이 게임은 검증된 로컬 카탈로그에 없어 오프라인으로 실행할 수 없습니다.');
    try{await api('/api/games/'+encodeURIComponent(game.id),{timeout:2500});}catch(error){if(!Rules.allowsLocal(error))throw error;}
  }
  async function startPlay(game){if(state.active||state.authChanging)return;if(state.authStale){await refreshConnection(true);return;}const route=state.route;const button=$('play-button');if(!button)return;button.disabled=true;button.textContent='게임을 연결하고 있어요…';
    try{let local=state.limited,play;
      if(local){await allowLocal(game);play={id:'local-'+uuid(),gameId:game.id,kind:'local'};}
      else{try{event('play_click',game.id);if(state.preparedPlay?.gameId===game.id&&state.preparedPlay.epoch===state.sessionEpoch){await api('/api/games/'+encodeURIComponent(game.id));play=state.preparedPlay;state.preparedPlay=null;}else play=await api('/api/play-sessions',{method:'POST',body:{gameId:game.id},timeout:3500});}
        catch(error){if(!Rules.allowsLocal(error))throw error;await allowLocal(game);local=true;state.limited=true;if(state.session?.kind==='anonymous')state.authStale=false;state.events=[];banner('서버 연결 또는 쿠키를 사용할 수 없어 로컬 모드로 제공합니다. 이 탭의 임시 기록은 서버에 자동 연결되지 않습니다.');updateAccount();play={id:'local-'+uuid(),gameId:game.id,kind:'local'};toast('로컬 모드로 시작합니다. 서버 저장·게임 통계 없이 이 탭에만 임시 저장됩니다.');}}
      if(!play.id||play.gameId!==game.id)throw new Error('플레이 세션을 만들지 못했습니다.');if(state.session&&!local){state.session.kind=play.kind||'guest';updateAccount();}
      if(route!==state.route||!document.contains(button)){if(!local)event('game_end',game.id,{reason:'launch_cancelled'},{play_session_id:play.id});return;}
      const iframe=document.createElement('iframe');iframe.className='game-frame'+(game.id==='falling-blocks'?' tall':'');iframe.title=game.title+' 게임 실행 화면';iframe.setAttribute('data-testid','game-frame');iframe.sandbox='allow-scripts';iframe.referrerPolicy='no-referrer';
      const nonce=uuid().replace(/-/g,'');iframe.src=`/games/${encodeURIComponent(game.id)}/index.html#nonce=${nonce}`;
      const a={id:play.id,game,iframe,nonce,local,epoch:state.sessionEpoch,cacheScope:local?localScope():state.cacheScope,port:null,ready:false,paused:true,ratio:0,lastPulse:0,lastTick:performance.now(),activeMs:0,sequence:0,revision:0,etag:null,saveBlocked:false,dirty:false,resolving:false,saveChain:Promise.resolve(),hostPending:new Map(),closed:false,requestWindow:performance.now(),requestCount:0,inFlight:0};state.active=a;
      $('player-panel').replaceChildren(iframe);$('close-game').hidden=false;saveStatus(local?'로컬 모드 · 서버 저장·통계 없음':'게임을 준비하고 있어요.',local);rememberGame(game.id);
      a.observer=new IntersectionObserver(entries=>{if(state.active!==a)return;accumulate(a);a.ratio=entries[0]?.intersectionRatio||0;if(a.ready&&!a.paused&&a.ratio<.5)a.port?.postMessage({type:'host_pause'});},{threshold:[0,.5,1]});a.observer.observe(iframe);
      a.timer=setTimeout(()=>{if(!a.ready&&state.active===a){saveStatus('게임 준비가 지연됩니다. 게임을 닫고 다시 시도해 주세요.',true);playEvent(a,'runtime_error',{code:'READY_TIMEOUT',message:'Game ready timeout'});}},14000);
      $('player-panel').scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){button.disabled=false;button.textContent='다시 시도';toast(error.message);saveStatus(error.message,true);}
  }
  const allowedGameEvents=new Set(['round_start','round_complete','game_pause','game_resume','runtime_error']);
  window.addEventListener('message',e=>{const a=state.active,d=e.data;if(!Rules.trustedConnect(e,a))return;
    const channel=new MessageChannel();a.port=channel.port1;a.port.onmessage=async({data})=>{
      if(a.closed||!data||typeof data!=='object')return;
      if(data.type==='host_snapshot_result'){const job=a.hostPending.get(data.id);if(job){a.hostPending.delete(data.id);clearTimeout(job.timer);job.resolve(data.payload);}return;}
      if(typeof data.id!=='string'||data.id.length>80||typeof data.type!=='string')return;
      const now=performance.now();if(now-a.requestWindow>1000){a.requestWindow=now;a.requestCount=0;}if(++a.requestCount>80||a.inFlight>=24){a.port.postMessage({id:data.id,ok:false,error:{code:'RATE_LIMITED',message:'게임 요청이 너무 많습니다.'}});return;}a.inFlight++;
      const reply=(ok,payload,error)=>{if(!a.closed)a.port.postMessage({id:data.id,ok,payload,error});};
      try{let result={};
        if(data.type==='ready'){if(!a.ready){a.ready=true;clearTimeout(a.timer);playEvent(a,'game_ready',{sdk_version:1});if(a.saveBlocked)saveStatus('서버와 임시 진행이 달라요. 저장 기록에서 선택해 주세요.',true);else if(!a.dirty)saveStatus(a.local?'로컬 모드 · 이 탭에 임시 저장 · 서버 통계 없음':'준비됐어요. 게임 화면에서 시작하세요.',a.local);}}
        else if(data.type==='load')result=await loadSave(a);
        else if(data.type==='save')result=await writeSave(a,data.payload?.value);
        else if(data.type==='activity'){if(data.payload?.updating===true)a.lastPulse=performance.now();}
        else if(data.type==='event'){
          const name=data.payload?.name;if(!allowedGameEvents.has(name))throw new Error('허용되지 않은 게임 이벤트입니다.');const source=data.payload?.properties||{},props={};
          if(name==='round_start'||name==='round_complete'){if(typeof source.run_id!=='string'||!/^[a-f0-9-]{20,64}$/i.test(source.run_id))throw new Error('라운드 ID가 올바르지 않습니다.');props.run_id=source.run_id;if(name==='round_complete'){if(!['win','loss','abandoned'].includes(source.result)||!Number.isFinite(source.score)||source.score<0||source.score>1e9)throw new Error('라운드 결과가 올바르지 않습니다.');props.result=source.result;props.score=Math.round(source.score);heartbeat(a);}}
          if(name==='game_pause'){heartbeat(a);a.paused=true;}
          if(name==='game_resume'){if(!a.ready)throw new Error('게임 준비가 끝나지 않았습니다.');a.paused=false;a.lastTick=performance.now();if(document.hidden||a.ratio<.5)a.port.postMessage({type:'host_pause'});}
          if(name==='runtime_error'){props.code=String(source.code||'GAME_RUNTIME').slice(0,60);props.message=String(source.message||'게임 실행 중 오류').slice(0,240);}
          playEvent(a,name,props);
        }else throw new Error('지원하지 않는 게임 요청입니다.');reply(true,result);
      }catch(error){reply(false,null,{code:error.code||'BROKER_ERROR',message:error.message||'플랫폼 요청 실패'});}finally{a.inFlight--;}
    };a.port.start();a.iframe.contentWindow.postMessage({type:'playhub:init',nonce:a.nonce},'*',[channel.port2]);
  });
  function requestSnapshot(a){if(!a?.port)return Promise.resolve(null);return new Promise(resolve=>{const id='host-'+uuid();const timer=setTimeout(()=>{a.hostPending.delete(id);resolve(null);},800);a.hostPending.set(id,{resolve,timer});a.port.postMessage({type:'host_snapshot',id});});}
  async function teardown(reason,{persist=true,sendEvents=true}={}){if(state.closing)return state.closing;const a=state.active;if(!a)return;
    state.closing=(async()=>{if(persist)saveStatus('마지막 진행을 저장하고 있어요…');if(sendEvents)heartbeat(a);a.paused=true;try{if(persist){const snapshot=await requestSnapshot(a);if(snapshot)await writeSave(a,snapshot);else await a.saveChain;}else await a.saveChain;}catch(_){}if(sendEvents){playEvent(a,'game_end',{reason});flushEvents();}a.closed=true;clearTimeout(a.timer);a.observer?.disconnect();a.port?.close();for(const p of a.hostPending.values()){clearTimeout(p.timer);p.resolve(null);}a.iframe.remove();if(state.active===a)state.active=null;})().finally(()=>state.closing=null);return state.closing;
  }
  function tabCandidate(gameId){
    const scopes=[...new Set([state.active?.game.id===gameId?state.active.cacheScope:null,state.cacheScope,localScope()].filter(Boolean))];
    for(const scope of scopes)for(const backup of [false,true]){const record=cacheGet(gameId,backup,scope);if(record?.dirty)return {...record,scope,backup};}
    return null;
  }
  function progressSummary(value){const s=value?.state;if(!s)return '저장된 진행';return `${Math.floor(Number(s.score)||0).toLocaleString()}점 · ${Math.floor(Number(s.elapsed)||0)}초 · ${{playing:'진행 중',won:'완료',lost:'종료'}[s.status]||'진행 기록'}`;}
  function dateLabel(value){const date=new Date(value);return Number.isNaN(date.getTime())?'시간 정보 없음':date.toLocaleString('ko-KR');}
  function managerError(message){$('saves-error').hidden=!message;$('saves-error').textContent=message||'';}
  function managerBusy(value){const m=state.saveManager;if(!m)return;m.busy=value;for(const button of $('saves-dialog').querySelectorAll('button'))button.disabled=value||button.dataset.unavailable==='true';}
  function saveRow(label,entry,action,testid){const row=document.createElement('div');row.className='save-record';const copy=document.createElement('div'),title=document.createElement('strong'),detail=document.createElement('p');title.textContent=label;detail.textContent=`버전 ${entry.revision} · ${dateLabel(entry.updatedAt||entry.createdAt)}`;copy.append(title,detail);row.append(copy);if(action){const actions=document.createElement('div'),button=document.createElement('button');actions.className='save-record-actions';button.type='button';button.className='button secondary small';button.textContent='이 기록으로 이어하기';button.dataset.testid=testid||'save-restore';button.dataset.slot=entry.slot||entry.id||'';button.onclick=action;actions.append(button);row.append(actions);}return row;}
  function paintSaveManager(){
    const m=state.saveManager;if(!m)return;const online=Boolean(m.server&&!state.limited&&!state.authStale&&state.session);
    $('saves-title').textContent=m.game.title+' · 저장 기록';
    $('saves-summary').textContent=online?`현재 계정의 게임 기록입니다. 슬롯 ${m.server.slots?.length||0}/${m.server.slotLimit||10}개 사용 중(이어하기 포함). 복원하거나 보관 슬롯을 제거하면 원본을 복구 기록에 남깁니다.`:'서버 연결을 확인하면 보관 슬롯과 백업을 불러옵니다. 로컬 기록은 이 탭에 남아 있습니다.';
    $('tab-save-panel').hidden=!m.tab;$('tab-save-description').textContent=m.tab?`${progressSummary(m.tab.value)} · ${dateLabel(m.tab.updatedAt)}${m.tab.scope.startsWith('local-')?' · 로컬 모드 기록':' · 서버 미반영 기록'}`:'';
    for(const id of ['save-use-tab','save-archive-tab']){$(id).dataset.unavailable=String(!online);$(id).disabled=!online;}
    $('save-download-tab').disabled=!m.tab;
    $('main-save').replaceChildren();$('saved-slots').replaceChildren();$('saved-backups').replaceChildren();
    const main=m.server?.slots?.find(x=>x.slot==='main');
    if(main)$('main-save').append(saveRow('현재 이어하기',main,()=>useServerSave(),'save-conflict-load'));
    else $('main-save').textContent=online?'아직 서버에 이어하기 기록이 없습니다.':'서버 기록을 확인하지 못했습니다.';
    const slots=m.server?.slots?.filter(x=>x.slot!=='main')||[];
    for(const entry of slots){const label=entry.reason==='merge_guest_copy'?'연결한 게스트 기록':'별도 보관 · '+entry.slot,row=saveRow(label,entry,()=>restoreSavedRecord(entry),'save-restore'),remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='슬롯 제거';remove.dataset.testid='save-slot-delete';remove.dataset.slot=entry.slot;remove.onclick=()=>removeSavedSlot(entry);row.querySelector('.save-record-actions').append(remove);$('saved-slots').append(row);}
    if(!slots.length)$('saved-slots').textContent=online?'별도 보관한 기록이 없습니다.':'연결 후 확인할 수 있습니다.';
    for(const entry of m.server?.backups||[]){const label=entry.reason==='merge_conflict'?`계정 연결 전 ${entry.source==='guest'?'게스트':'계정'} 기록`:entry.reason==='slot_deleted'?'제거한 보관 슬롯 · '+entry.sourceSlot:'이어하기 교체 전 기록';$('saved-backups').append(saveRow(label,entry,()=>restoreSavedRecord({backupId:entry.id}),'save-backup-restore'));}
    if(!m.server?.backups?.length)$('saved-backups').textContent=online?'교체 전 백업이 없습니다.':'연결 후 확인할 수 있습니다.';
    managerBusy(m.busy);
  }
  async function refreshSaveManager(){const m=state.saveManager;if(!m||m.busy)return;managerError('');m.tab=tabCandidate(m.game.id);m.server=null;managerBusy(true);
    try{if(state.authStale||state.limited||!state.session)throw new Error('서버 연결 확인 후 다시 불러와 주세요.');
      const data=state.session.kind==='anonymous'?{mainRevision:0,slotLimit:10,slots:[],backups:[]}:await api('/api/saves/'+encodeURIComponent(m.game.id)+'/slots');
      if(state.saveManager!==m||m.epoch!==state.sessionEpoch)return;m.server=data;
    }catch(error){if(state.saveManager===m)managerError(error.message);}finally{if(state.saveManager===m){m.busy=false;paintSaveManager();}}
  }
  async function openSaveManager(game){
    if(state.saveManager?.busy)return;const a=state.active;
    if(a?.game.id===game.id){heartbeat(a);try{const value=await requestSnapshot(a);if(value)await writeSave(a,value);else await a.saveChain;}catch(_){}a.resolving=true;}
    state.saveManager={game,epoch:state.sessionEpoch,tab:tabCandidate(game.id),server:null,busy:false,archive:null,restoreAttempt:null};
    if(!$('saves-dialog').open)$('saves-dialog').showModal();paintSaveManager();await refreshSaveManager();
  }
  async function mutation(route,body,headers){let result;for(let attempt=0;attempt<2;attempt++){try{result=await api(route,{method:route.endsWith('/restore')?'POST':'PUT',body,headers,meta:true,timeout:4500});return result;}catch(error){if(error.status||attempt)throw error;}}return result;}
  async function ensureSavePrincipal(game){
    if(!state.session||state.authStale||state.limited)throw new Error('서버 연결 상태를 먼저 확인해 주세요.');
    const current=await api('/api/session');if(!Rules.sameSession(state.session,current)){await applySessionChange(current);throw new Error('로그인 상태가 바뀌었습니다. 새 계정의 저장 기록을 다시 확인해 주세요.');}
    if(current.kind==='anonymous'){const play=await api('/api/play-sessions',{method:'POST',body:{gameId:game.id}});state.preparedPlay={...play,epoch:state.sessionEpoch};state.session.kind=play.kind||'guest';updateAccount();}
  }
  async function archiveTab(m){
    if(!m.tab?.value)throw new Error('보관할 임시 진행이 없습니다.');
    await ensureSavePrincipal(m.game);if(state.saveManager!==m||m.epoch!==state.sessionEpoch)throw new Error('로그인 상태가 변경되었습니다.');
    if(!m.archive)m.archive={slot:'recovery-'+uuid().replace(/-/g,''),key:uuid()};
    const result=await mutation('/api/saves/'+encodeURIComponent(m.game.id)+'?slot='+m.archive.slot,{payload:m.tab.value,schemaVersion:1},{'If-None-Match':'*','Idempotency-Key':m.archive.key});
    m.archive.revision=result.data.revision;return {slot:m.archive.slot,revision:result.data.revision};
  }
  async function restoreRecord(m,entry){
    const body=Rules.restoreRequest(entry,m.server.mainRevision),signature=JSON.stringify(body);
    if(m.restoreAttempt?.signature!==signature)m.restoreAttempt={signature,key:uuid()};
    return mutation('/api/saves/'+encodeURIComponent(m.game.id)+'/restore',body,{'Idempotency-Key':m.restoreAttempt.key});
  }
  async function finishSaveSelection(m,record,{preserveTab=false}={}){
    if(state.saveManager!==m||m.epoch!==state.sessionEpoch)throw new Error('로그인 상태가 변경되어 게임을 다시 열지 않았습니다.');
    await teardown('save_selection',{persist:false});
    if(m.tab){try{sessionStorage.removeItem(cacheKey(m.game.id,m.tab.backup,m.tab.scope));}catch(_){}if(preserveTab)cacheSet(m.game.id,m.tab.value,m.tab.baseRevision,true,true,m.tab.scope);}
    cacheSet(m.game.id,record.payload,record.revision,false,false,state.cacheScope);
    state.saveManager=null;$('saves-dialog').close();await renderRoute();toast('선택한 기록을 불러옵니다. 게임 화면에서 이어서 시작하세요.');await startPlay(m.game);
  }
  async function useServerSave(){const m=state.saveManager;if(!m?.server||m.busy)return;
    if(m.tab&&!confirm('서버의 이어하기 기록으로 게임을 다시 엽니다. 이 탭의 미반영 진행은 임시 백업으로 보관할까요?'))return;
    managerBusy(true);managerError('');try{const result=await api('/api/saves/'+encodeURIComponent(m.game.id)+'?slot=main',{meta:true});if(result.data.revision!==m.server.mainRevision)throw Object.assign(new Error('다른 탭에서 기록을 변경했습니다. 목록을 새로고침한 뒤 선택해 주세요.'),{status:412});await finishSaveSelection(m,result.data,{preserveTab:true});}
    catch(error){managerError(error.message);}finally{if(state.saveManager===m)managerBusy(false);}
  }
  async function restoreSavedRecord(entry){const m=state.saveManager;if(!m?.server||m.busy)return;
    if(!confirm('이 기록을 새 이어하기로 적용할까요? 현재 서버 이어하기는 백업되고, 적용 후 게임을 다시 엽니다.'))return;
    managerBusy(true);managerError('');try{await ensureSavePrincipal(m.game);const result=await restoreRecord(m,entry);await finishSaveSelection(m,result.data,{preserveTab:true});}
    catch(error){managerError(error.status===412?'다른 탭이 먼저 기록을 바꿨습니다. 원본은 유지됩니다. 목록을 새로고침한 뒤 다시 선택해 주세요.':error.message);}finally{if(state.saveManager===m)managerBusy(false);}
  }
  async function applyTabSave(continuePlay){const m=state.saveManager;if(!m?.server||!m.tab||m.busy)return;
    if(continuePlay&&!confirm('이 탭의 진행을 서버에 보관한 뒤 이어하기로 적용할까요? 기존 서버 이어하기는 백업됩니다.'))return;
    managerBusy(true);managerError('');try{const archived=await archiveTab(m);if(continuePlay){const result=await restoreRecord(m,archived);await finishSaveSelection(m,result.data);}
      else{toast('별도 슬롯에 보관했습니다. 서버 이어하기는 그대로입니다.');m.busy=false;await refreshSaveManager();}}
    catch(error){managerError(error.status===412?'다른 탭에서 이어하기가 바뀌어 적용을 멈췄습니다. 별도 슬롯과 기존 이어하기는 보존됩니다. 목록을 새로고침해 주세요.':error.code==='SAVE_SLOT_LIMIT'?'보관 슬롯 10개를 모두 사용했습니다. 목록에서 보관 슬롯을 제거해 한 칸을 비운 뒤 다시 시도하세요. 제거한 원본은 복구 기록으로 남습니다.':error.message);}finally{if(state.saveManager===m)managerBusy(false);}
  }
  async function removeSavedSlot(entry){const m=state.saveManager;if(!m?.server||m.busy)return;
    if(entry.slot==='main'||!/^[A-Za-z0-9_-]{1,64}$/.test(entry.slot||'')||!Number.isInteger(entry.revision)||entry.revision<1){managerError('이어하기는 제거할 수 없습니다. 유효한 보관 슬롯을 선택해 주세요.');return;}
    if(!confirm('이 보관 슬롯을 제거하고 원본을 복구 기록에 보존할까요? 이어하기(main)는 바뀌지 않으며, 보관 슬롯 한 칸을 비웁니다.'))return;
    managerBusy(true);managerError('');
    try{await api('/api/saves/'+encodeURIComponent(m.game.id)+'?slot='+encodeURIComponent(entry.slot),{method:'DELETE',headers:{'If-Match':`"r${entry.revision}"`}});if(m.archive?.slot===entry.slot){m.archive=null;m.restoreAttempt=null;}toast('보관 슬롯을 비웠습니다. 원본은 복구 기록에서 다시 적용할 수 있습니다.');m.busy=false;await refreshSaveManager();}
    catch(error){managerError(error.status===412?'다른 탭에서 슬롯을 바꿔 제거하지 않았습니다. 목록을 새로고침해 주세요.':error.message);}finally{if(state.saveManager===m)managerBusy(false);}
  }
  $('save-use-tab').dataset.testid='save-conflict-keep-local';$('save-use-tab').onclick=()=>applyTabSave(true);$('save-archive-tab').onclick=()=>applyTabSave(false);
  $('save-download-tab').onclick=()=>{const m=state.saveManager;if(!m?.tab)return;const {gameId,value,baseRevision,updatedAt}=m.tab;const blob=new Blob([JSON.stringify({gameId,value,baseRevision,updatedAt},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=m.game.id+'-progress-backup.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('save-refresh').onclick=async()=>{if(state.limited||state.authStale||!state.session)await refreshConnection(true);if(state.saveManager)await refreshSaveManager();};
  $('saves-dialog').addEventListener('cancel',e=>{if(state.saveManager?.busy)e.preventDefault();});
  $('saves-dialog').addEventListener('close',()=>{if(state.active)state.active.resolving=false;state.saveManager=null;});
  async function openMerge(){
    if(state.active){const game=state.active.game;await teardown('merge_review');await renderRoute();if(cacheGet(game.id)?.dirty){toast('먼저 저장 기록에서 미반영 진행을 확인해 주세요.');await openSaveManager(game);return;}}
    const pending=state.session?.pendingMerge;if(!pending)return;$('merge-summary').textContent=`이 기기의 게스트 저장 ${pending.sourceSaveCount||0}개를 연결할 수 있습니다. 다른 기록과 겹치는 게임은 처리 방법을 선택해 주세요.`;
    $('merge-conflicts').innerHTML=(pending.conflicts||[]).map((c,i)=>`<div class="conflict-row"><label for="conflict-${i}">${esc(state.games.find(g=>g.id===c.gameId)?.title||c.gameId)} · ${esc(c.slot)}</label><select id="conflict-${i}" data-conflict="${i}"><option value="keep_account">계정의 기존 기록 유지</option><option value="keep_guest">이 기기의 게스트 기록 사용</option><option value="copy_guest">계정 기록 유지 · 게스트 기록 별도 보관</option></select></div>`).join('');$('merge-consent').checked=false;$('merge-analytics').checked=false;$('merge-error').hidden=true;$('merge-dialog').showModal();
  }
  $('merge-form').addEventListener('submit',async e=>{e.preventDefault();const pending=state.session?.pendingMerge;if(!pending)return;const button=e.submitter;button.disabled=true;
    try{const choices=(pending.conflicts||[]).map((c,i)=>({gameId:c.gameId,slot:c.slot,action:$('conflict-'+i).value,expectedTargetRevision:c.targetRevision}));await api('/api/auth/merge',{method:'POST',body:{mergeId:pending.id,consent:true,linkAnalyticsHistory:$('merge-analytics').checked,choices}});state.session.pendingMerge=null;updateAccount();$('merge-dialog').close();toast('기록을 연결했어요. 별도 보관한 진행은 게임의 저장 기록에서 복구할 수 있습니다.');}catch(error){if(error.status===409){try{const session=await api('/api/session');if(Rules.sameSession(state.session,session)){setSession(session);await openMerge();}}catch(_){}}$('merge-error').hidden=false;$('merge-error').textContent=error.status===409?'다른 탭에서 기록이 바뀌었습니다. 최신 충돌 목록을 확인하고 다시 선택해 주세요.':error.message;}finally{button.disabled=false;}
  });
  $('google-login').onclick=async()=>{if($('google-login').disabled||state.authChanging)return;state.authChanging=true;try{const a=state.active;await teardown('account_link');if(a?.dirty){await renderRoute();await openSaveManager(a.game);toast('계정을 연결하기 전에 미반영 진행을 저장하거나 파일로 받아 주세요.');return;}location.href=API+'/api/auth/google/start?returnTo='+encodeURIComponent(location.origin+'/');}finally{state.authChanging=false;}};
  $('logout').onclick=async()=>{if(state.authChanging)return;state.authChanging=true;$('logout').disabled=true;const a=state.active;
    try{await teardown('logout');if(a?.dirty&&!window.confirm('서버에 저장하지 못한 임시 기록이 있습니다. 로그아웃하면 이 탭의 임시 기록도 지워집니다. 계속할까요?')){await renderRoute();return;}
      await api('/api/auth/logout',{method:'POST',body:{}});state.events=[];state.sessionEpoch++;state.session=null;state.cacheScope='';state.preparedPlay=null;state.authStale=false;state.limited=true;clearPrivateCache();try{localStorage.removeItem('ph-recent');}catch(_){}updateAccount();
      try{setSession(await api('/api/session'));state.limited=false;banner('');}catch(_){banner('로그아웃했습니다. 서버 연결이 복구될 때까지 로컬 모드로 이용할 수 있습니다.');}
      await renderRoute();toast('로그아웃했습니다. 다음 게임은 새 게스트로 시작해요.');
    }catch(error){toast(error.message);await renderRoute();}finally{state.authChanging=false;$('logout').disabled=false;updateAccount();}
  };
  $('merge-open').onclick=openMerge;$('privacy-open').onclick=()=>{state.active?.port?.postMessage({type:'host_pause'});$('privacy-dialog').showModal();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('search-form').addEventListener('submit',e=>{e.preventDefault();state.genre='all';const q=$('search').value.trim();navigate(q?'/?q='+encodeURIComponent(q):'/');});
  document.addEventListener('click',e=>{
    const filter=e.target.closest('[data-filter]');if(filter){state.genre=filter.dataset.filter;renderHome();return;}
    const link=e.target.closest('[data-game-link]');if(link){const item=state.impressions.find(x=>x.element===link.closest('[data-impression]'));if(item&&Rules.eligibleImpression(item,performance.now(),!document.hidden)){item.recorded=true;clearTimeout(item.timer);event('game_impression',item.gameId,{visible_fraction:item.ratio,visible_duration_ms:1000,document_visible:true},{impression_id:item.id});}event('game_card_click',link.dataset.gameLink,{viewability_met:!!item?.recorded},{impression_id:item?.id||uuid()});if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();navigate(link.getAttribute('href'));}return;}
    const home=e.target.closest('[data-home],a.brand,a.footer-brand');if(home&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey){e.preventDefault();state.genre='all';navigate('/');}
  });
  window.addEventListener('popstate',async()=>{await teardown('navigation');await renderRoute();});
  document.addEventListener('visibilitychange',()=>{for(const item of state.impressions)checkImpression(item);const a=state.active;if(document.hidden){if(a){heartbeat(a);a.port?.postMessage({type:'host_pause'});}flushEvents(true);}});
  window.addEventListener('pagehide',()=>{if(state.active){heartbeat(state.active);playEvent(state.active,'game_end',{reason:'pagehide'});}flushEvents(true);});
  setInterval(()=>{if(state.active)accumulate(state.active);},250);setInterval(()=>{if(state.active)heartbeat(state.active);flushEvents();},15000);setInterval(()=>flushEvents(),3500);
  async function applySessionChange(session){
    state.authStale=true;state.events=[];stopImpressions();
    if(state.active){state.active.saveBlocked=true;state.active.port?.postMessage({type:'host_pause'});await teardown('session_changed',{persist:false,sendEvents:false});}
    state.saveManager=null;for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
    setSession(session);state.limited=false;await renderRoute();
    toast('로그인 상태가 바뀌어 이전 게임을 닫았습니다. 이전 계정의 임시 기록은 정리했어요.');
  }
  async function refreshConnection(manual=false){
    if(state.reconnecting||state.closing||state.authChanging||state.saveManager?.busy)return;state.reconnecting=true;
    if(manual)banner('진행을 유지하며 서버 연결을 확인하고 있어요.');
    try{const [session,data]=await Promise.all([api('/api/session'),api('/api/games')]);
      if(state.limited||state.authStale||!state.session){const confirmed=await api('/api/session');if(!Rules.sameSession(session,confirmed)){state.limited=true;state.events=[];if(state.active?.local||state.session?.kind==='anonymous')state.authStale=false;updateAccount();throw new Error('세션 쿠키가 유지되지 않아 로컬 모드를 계속 사용합니다. 현재 게임과 이 탭의 임시 기록은 유지됩니다.');}}
      const records=(data.games||[]).filter(g=>/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(g.id)),ids=new Set(records.map(g=>g.id));
      const changed=[...ids].sort().join(',')!==state.games.map(g=>g.id).sort().join(','),wasLimited=state.limited;
      state.games=records.map(normalizeGame);
      if(state.session&&!Rules.sameSession(state.session,session))await applySessionChange(session);
      else{setSession(session);state.limited=false;
        if(state.active&&'authPreviousSaveBlocked'in state.active){state.active.saveBlocked=state.active.authPreviousSaveBlocked;delete state.active.authPreviousSaveBlocked;}
        if(state.active&&!ids.has(state.active.game.id)){await teardown('game_disabled');toast('운영자가 게임의 공개를 중단했습니다.');await renderRoute();}
        else if(!state.active&&(changed||wasLimited||manual))await renderRoute();
      }
      updateAccount();
      if(state.active?.local)banner('서버 연결이 복구됐습니다. 현재 로컬 진행은 이 탭에 유지됩니다. 저장 기록에서 직접 서버에 적용할 수 있습니다.');
      else if(state.active?.saveBlocked)banner('서버 연결은 정상입니다. 저장 기록을 열어 충돌한 기록 중 이어갈 기록을 선택하세요.');
      else if(state.active?.dirty){saveStatus('연결 복구 · 서버 저장 다시 시도를 눌러주세요.',true);banner('서버 연결이 복구됐습니다. 이 탭의 진행을 조건부로 다시 저장할 수 있습니다.');}
      else banner('');
      if(manual&&!state.active)toast('서버 연결과 로그인 상태를 확인했습니다.');
    }catch(error){if(manual||state.limited)banner(error.message||'서버 연결을 확인하지 못했습니다. 현재 진행을 유지합니다.');}
    finally{state.reconnecting=false;const button=$('connection-banner').querySelector('button');if(button){button.disabled=false;button.textContent='서버 연결 확인';}}
  }
  function normalizeGame(g){const m=state.allMetadata.get(g.id)||{},loc=v=>typeof v==='string'?v:v?.ko||v?.en||'';const cover=m.media?.cover;return {id:g.id,title:loc(g.title)||loc(m.title)||g.id,englishTitle:m.title?.en||'',description:loc(g.description)||loc(m.summary)||'브라우저에서 가볍게 즐기는 게임입니다.',instructions:loc(m.instructions)||'게임 화면의 도움말과 조작 버튼을 확인하세요.',rules:loc(m.rules)||'게임 안의 목표를 달성해 보세요.',tags:Array.isArray(m.tags)?m.tags:[g.genre||'casual'],controls:g.controls||m.controls||['mouse','touch'],cover:typeof cover==='string'&&/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(cover)&&!cover.includes('..')?`/games/${g.id}/${cover}`:`/games/${g.id}/assets/cover.svg`};}
  async function init(){let localEntries=[];try{const result=await fetch('/catalog/games.json',{cache:'no-store'});const catalog=await result.json();if(catalog.schemaVersion!==1||!Array.isArray(catalog.entries))throw new Error('잘못된 게임 목록');localEntries=catalog.entries.filter(x=>/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(x.id)&&x.path==='games/'+x.id);state.trusted=new Set(localEntries.filter(x=>x.enabled).map(x=>x.id));await Promise.all(localEntries.map(async item=>{try{const r=await fetch('/'+item.path+'/game.manifest.json');if(!r.ok)return;const m=await r.json();if(m.id!==item.id)return;state.allMetadata.set(item.id,m);}catch(_){}}));}catch(_){}
    const sessionResult=await Promise.allSettled([api('/api/session'),api('/api/games')]);if(sessionResult[0].status==='fulfilled')setSession(sessionResult[0].value);
    let records;if(sessionResult[1].status==='fulfilled'&&Array.isArray(sessionResult[1].value.games)){records=sessionResult[1].value.games;state.limited=!state.session;if(state.limited){banner('세션 쿠키를 사용할 수 없어 로컬 모드로 제공합니다. 이 탭에만 임시 저장되며 서버 저장·통계는 제공되지 않습니다.');updateAccount();}}else{const error=sessionResult[1].reason;if(error&&!Rules.allowsLocal(error))throw error;state.limited=true;records=localEntries.filter(x=>x.enabled).map(x=>({id:x.id}));banner('서버 연결 없이 로컬 모드로 플레이할 수 있습니다. 이 탭의 임시 기록은 서버 저장·통계에 포함되거나 자동 연결되지 않습니다.');updateAccount();}
    state.games=records.filter(g=>/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(g.id)).map(normalizeGame);
    await renderRoute();if(state.session?.pendingMerge)openMerge();
  }
  setInterval(()=>{if(!document.hidden)refreshConnection();},30000);
  window.addEventListener('online',()=>refreshConnection());
  window.addEventListener('focus',()=>{if(state.session&&!state.closing)refreshConnection();});

  init().catch(error=>{banner(error.message||'서비스를 불러오지 못했습니다.');empty('연결을 확인해 주세요','웹 사이트를 HTTP 서버에서 열고 API 서비스를 시작한 뒤 다시 시도해 주세요.');});
})();
