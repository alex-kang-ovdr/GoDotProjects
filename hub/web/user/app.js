(function () {
  'use strict';
  const Rules=window.PortalRules;
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=()=>{const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
  const conf=window.PLAYHUB_CONFIG||{}, hostname=location.hostname.includes(':')&&!location.hostname.startsWith('[')?'['+location.hostname+']':location.hostname;
  const API=(conf.apiBaseUrl||`${location.protocol==='https:'?'https:':'http:'}//${hostname}:${Number(conf.apiPort)||8090}`).replace(/\/$/,'');
  const state={session:null,games:[],allMetadata:new Map(),trusted:new Set(),limited:false,genre:'all',query:'',active:null,route:0,events:[],flushing:false,flushAgain:false,impressions:[],observer:null,cacheScope:'',closing:null,sessionEpoch:0,authStale:false,authChanging:false,reconnecting:false,saveManager:null,preparedPlay:null};
  const genres={strategy:'전략',simulation:'시뮬레이션',action:'액션',arcade:'아케이드',puzzle:'퍼즐',classic:'클래식',logic:'두뇌',casual:'캐주얼',memory:'기억력',numbers:'숫자',match3:'매치3',blocks:'블록',survival:'생존',building:'건설',management:'경영',shooter:'슈팅',tactics:'전술',rpg:'RPG',roguelike:'로그라이크',sports:'스포츠',racing:'레이싱'};
  const nativeGames=new Set(['match3-garden','falling-blocks','bubble-split','brick-breaker','slide-puzzle','mines-grid','memory-pairs','merge-tiles']);
  const controlLabels={keyboard:'키보드',mouse:'마우스',touch:'터치',gamepad:'게임패드'};
  const supportedLocales=new Set(['ko','en','ja','zh-CN','fr','es','pt-BR','hi']);
  const wishlistPath='/?view=wishlist';
  const browsePath='/?view=browse';
  state.view='home';
  state.wishlist=new Map();
  state.wishlistStatus='loading';
  state.wishlistRequest=0;
  state.wishlistBusy=false;
  state.preferenceWrite=Promise.resolve();
  state.locale=initialLocale();
  state.localeRevision=0;
  let toastTimer;
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200);}
  function banner(message){$('connection-banner').hidden=!message;$('connection-banner').textContent=message||'';if(message){const b=document.createElement('button');b.type='button';b.textContent=state.reconnecting?'연결 확인 중…':'서버 연결 확인';b.dataset.testid='reconnect';b.disabled=state.reconnecting;b.onclick=()=>refreshConnection(true);$('connection-banner').append(b);}}
  async function api(path,{method='GET',body,headers={},meta=false,keepalive=false,timeout=7000}={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    const epoch=state.sessionEpoch,h={...headers};if(body!==undefined)h['Content-Type']='application/json';if((!['GET','HEAD'].includes(method)||path.startsWith('/api/saves/'))&&state.session?.csrfToken)h['X-CSRF-Token']=state.session.csrfToken;
    try{const response=await fetch(API+path,{method,credentials:'include',cache:'no-store',headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,keepalive});let data;try{data=await response.json();}catch(_){data={};}
      if(epoch!==state.sessionEpoch)throw Object.assign(new Error('로그인 상태가 변경되어 이전 요청을 취소했습니다.'),{code:'SESSION_CHANGED',status:409});
      if(!response.ok){const error=new Error(data.error?.message||`요청을 처리하지 못했습니다. (${response.status})`);error.code=data.error?.code||(typeof data.error==='string'?data.error:'HTTP_ERROR');error.status=response.status;error.details=data;if(Rules.authFailure(error))markAuthStale();throw error;}
      return meta?{data,etag:response.headers.get('ETag')}:data;
    }catch(error){if(!error.status){error.code='NETWORK';error.message='서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';}throw error;}finally{clearTimeout(timer);}
  }
  function storageScope(value){let a=2166136261,b=2246822519,c=3266489917,d=668265263;for(const ch of String(value)){const n=ch.charCodeAt(0);a=Math.imul(a^n,16777619);b=Math.imul(b^n,3266489917);c=Math.imul(c^n,668265263);d=Math.imul(d^n,374761393);}return [a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');}
  function localScope(){try{let scope=sessionStorage.getItem('ph-local-scope');if(!scope){scope=uuid().replace(/-/g,'');sessionStorage.setItem('ph-local-scope',scope);}return 'local-'+scope;}catch(_){return 'local-'+uuid().replace(/-/g,'');}}
  function cacheKey(id,backup=false,scope=state.cacheScope){return `ph-${backup?'backup':'save'}-${scope}-${id}`;}
  function cacheGet(id,backup=false,scope=state.cacheScope){try{const value=JSON.parse(sessionStorage.getItem(cacheKey(id,backup,scope))||'null');return value&&value.gameId===id?value:null;}catch(_){return null;}}
  function cacheSet(id,value,baseRevision,dirty=false,backup=false,scope=state.cacheScope){try{sessionStorage.setItem(cacheKey(id,backup,scope),JSON.stringify({gameId:id,value,baseRevision,dirty,updatedAt:Date.now()}));return true;}catch(_){return false;}}
  function clearPrivateCache(){try{for(const key of Object.keys(sessionStorage))if(/^ph-(save|backup|local-scope)/.test(key))sessionStorage.removeItem(key);}catch(_) {}}
  function setSession(session){const next=storageScope(session.csrfToken||uuid());if(state.cacheScope&&state.cacheScope!==next){clearPrivateCache();resetWishlist();state.sessionEpoch++;state.events=[];state.preparedPlay=null;}state.session=session;state.cacheScope=next;state.authStale=false;updateAccount();}
  function markAuthStale(){if(!state.session||state.authStale)return;state.authStale=true;state.events=[];if(state.active&&!state.active.local){heartbeat(state.active);state.active.authPreviousSaveBlocked=state.active.saveBlocked;state.active.saveBlocked=true;state.active.port?.postMessage({type:'host_pause'});saveStatus('로그인 상태가 바뀌었거나 만료됐어요. 서버 연결을 확인해 주세요.',true);}if(state.view==='create')renderCreator();else updateAccount();banner('로그인 상태를 다시 확인해야 합니다. 이전 기록을 다른 계정에 자동 적용하지 않습니다.');}
  function updateAccount(){
    const session=state.session;
    const registered=session?.kind==='registered';
    const loopback=['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname);
    const canSignIn=Boolean(session?.googleEnabled&&!registered&&!state.limited&&!state.authStale&&(location.protocol==='https:'||loopback));
    let identity='로그인 없이 플레이';
    if(registered)identity=session.displayName||'연결된 계정';
    else if(session?.kind==='guest')identity='게스트로 플레이 중';
    if(!session||state.limited||state.active?.local)identity='로컬 모드';
    if(state.authStale)identity='로그인 상태 확인 필요';
    $('identity').textContent=identity;
    $('google-login').hidden=!canSignIn;
    $('google-login').disabled=!canSignIn;
    $('logout').hidden=!registered;
    $('merge-open').hidden=!session?.pendingMerge;
    $('account-help').textContent=accountHelp(canSignIn);
    for(const button of document.querySelectorAll('[data-google-login]')){
      button.hidden=!canSignIn;
      button.disabled=!canSignIn;
    }
    updateWishlistControls();
  }
  function accountHelp(canSignIn){
    if(state.authStale)return '서버 연결을 확인한 뒤 계정을 다시 불러올 수 있습니다.';
    if(state.limited||!state.session)return '서버에 연결되면 로그인할 수 있습니다. 로컬 진행은 이 탭에 보관됩니다.';
    if(state.session.kind==='registered')return state.session.pendingMerge?'이 기기의 게스트 기록을 계정에 연결할 수 있습니다.':'이 계정에 저장된 진행으로 이어할 수 있습니다.';
    if(canSignIn)return 'Google 계정에 로그인하고 이 기기의 게스트 기록을 연결할 수 있습니다.';
    if(state.session.googleEnabled)return 'Google 로그인은 HTTPS 연결에서 사용할 수 있습니다.';
    return '현재 Google 로그인을 사용할 수 없습니다. 게스트로 플레이하고 진행을 저장할 수 있습니다.';
  }
  function localeFromUrl(){const value=new URLSearchParams(location.search).get('lang');return supportedLocales.has(value)?value:null;}
  function initialLocale(){
    const explicit=localeFromUrl();
    if(explicit)return explicit;
    try{const value=localStorage.getItem('playhub.locale');if(supportedLocales.has(value))return value;}catch(_){}
    const browser=window.navigator?.language||'';
    if(supportedLocales.has(browser))return browser;
    const language=browser.split('-')[0];
    if(language==='zh')return 'zh-CN';
    if(language==='pt')return 'pt-BR';
    return supportedLocales.has(language)?language:'ko';
  }
  function applyLocale(locale,{remember=false,updateUrl=false}={}){
    if(!supportedLocales.has(locale))return;
    state.locale=locale;
    document.documentElement.lang=locale;
    $('language-select').value=locale;
    if($('player-language'))$('player-language').value=locale;
    if(remember){state.localeRevision++;try{localStorage.setItem('playhub.locale',locale);}catch(_){}}
    if(updateUrl){const url=new URL(location.href);url.searchParams.set('lang',locale);history.replaceState(null,'',url);}
    for(const time of document.querySelectorAll('.card-new time,.card-update time'))time.textContent=formatGameUpdateDate(new Date(time.dateTime));
    window.dispatchEvent?.(new CustomEvent('playhub:locale-change',{detail:{locale}}));
    const active=state.active;
    active?.iframe.contentWindow?.postMessage({type:'playhub:locale',locale,nonce:active.nonce},'*');
  }
  async function loadPreference(){
    if(!state.session||state.limited||state.authStale||localeFromUrl())return;
    const revision=state.localeRevision;
    try{
      const preference=await api('/api/preferences',{timeout:3500});
      if(state.localeRevision===revision&&!localeFromUrl()&&supportedLocales.has(preference.locale))applyLocale(preference.locale,{remember:true});
    }catch(_){}
  }
  function savePreference(locale){
    const epoch=state.sessionEpoch;
    state.preferenceWrite=state.preferenceWrite.then(async()=>{
      if(epoch!==state.sessionEpoch||state.locale!==locale||!state.session||state.limited||state.authStale||state.authChanging)return;
      try{await api('/api/preferences',{method:'PUT',body:{locale},timeout:3500});}
      catch(error){if(epoch===state.sessionEpoch&&state.locale===locale)toast('언어는 이 브라우저에만 저장했습니다.');}
    });
  }
  function resetWishlist(){
    state.wishlist=new Map();
    state.wishlistStatus='loading';
    state.wishlistRequest++;
    state.wishlistBusy=false;
  }
  function wishlistEnabled(){return state.session&&!state.limited&&!state.authStale&&!state.authChanging&&state.wishlistStatus==='ready'&&!state.wishlistBusy;}
  function updateWishlistControls(){
    const count=$('wishlist-count');
    count.hidden=!state.wishlist.size;
    count.textContent=String(state.wishlist.size);
    for(const button of document.querySelectorAll('[data-wishlist-game]')){
      const saved=state.wishlist.has(button.dataset.wishlistGame);
      button.disabled=!wishlistEnabled();
      button.setAttribute('aria-pressed',String(saved));
      const heart=button.querySelector('.heart');
      if(heart)heart.textContent=saved?'♥':'♡';
      const label=button.querySelector('.wishlist-button-label');
      if(label)label.textContent=saved?'찜한 게임에서 제거':'찜하기';
    }
  }
  function applyWishlist(data){
    if(!Array.isArray(data.items))throw new Error('찜한 게임을 확인하지 못했습니다.');
    const entries=data.items.filter(item=>item&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(item.gameId));
    const changed=state.wishlistStatus!=='ready'||JSON.stringify([...state.wishlist.values()])!==JSON.stringify(entries);
    state.wishlist=new Map(entries.map(item=>[item.gameId,item]));
    state.wishlistStatus='ready';
    if(data.kind==='guest'&&state.session?.kind==='anonymous')state.session.kind='guest';
    updateAccount();
    return changed;
  }
  async function refreshWishlist(){
    if(state.wishlistBusy||state.authChanging)return;
    const request=++state.wishlistRequest;
    let changed=false;
    try{
      if(!state.session||state.limited||state.authStale)throw new Error('연결 확인 필요');
      const result=await api('/api/wishlist',{timeout:3500});
      if(request!==state.wishlistRequest)return;
      changed=applyWishlist(result);
    }catch(_){
      if(request!==state.wishlistRequest)return;
      changed=state.wishlistStatus!=='error';
      state.wishlistStatus='error';
    }
    updateWishlistControls();
    if(changed&&state.view==='wishlist')renderWishlist();
  }
  async function toggleWishlist(button){
    if(!wishlistEnabled())return;
    const id=button.dataset.wishlistGame;
    const wasSaved=state.wishlist.has(id);
    const epoch=state.sessionEpoch;
    state.wishlistRequest++;
    state.wishlistBusy=true;
    updateWishlistControls();
    try{
      const data=await api('/api/wishlist/'+encodeURIComponent(id),{method:wasSaved?'DELETE':'PUT',body:{},timeout:4500});
      if(epoch!==state.sessionEpoch)return;
      applyWishlist(data);
      toast(wasSaved?'찜한 게임에서 제거했습니다.':'찜한 게임에 추가했습니다.');
      if(state.view==='wishlist'){
        renderWishlist();
        $('wishlist-title').focus({preventScroll:true});
      }
    }catch(error){if(epoch===state.sessionEpoch)toast(error.message||'찜한 게임을 저장하지 못했습니다.');}
    finally{
      if(epoch===state.sessionEpoch){
        state.wishlistBusy=false;
        updateWishlistControls();
        if(document.activeElement===document.body&&document.contains(button))button.focus();
      }
    }
  }
  function event(name,gameId,properties={},extra={}){if(!state.session||state.limited||state.authStale)return;const item={event_id:uuid(),event_name:name,game_id:gameId,occurred_at:new Date().toISOString(),properties,...extra};state.events.push(item);if(state.events.length>300)state.events.splice(0,state.events.length-300);if(state.events.length>=12)flushEvents();}
  async function flushEvents(keepalive=false){if(!state.events.length||!state.session||state.limited||state.authStale)return;if(state.flushing){state.flushAgain=true;return;}state.flushing=true;const batch=state.events.slice(0,30);
    try{const result=await api('/api/events',{method:'POST',body:{events:batch},keepalive,timeout:5000});const handled=new Set([...(result.accepted||[]),...(result.duplicates||[]),...(result.rejected||[]).map(x=>x.event_id)]);state.events=state.events.filter(x=>!handled.has(x.event_id));}
    catch(_){}finally{state.flushing=false;if(state.flushAgain){state.flushAgain=false;flushEvents();}}
  }
  function cardMarkup(game,heading='h3'){
    const badge=Rules.gameReleaseBadge(game.publishedOn,game.updatedOn);
    return `<div class="card-wrap"><a class="game-card" data-testid="game-card" data-game-id="${esc(game.id)}" href="/play/${game.id}/" data-game-link="${esc(game.id)}" data-impression="${esc(game.id)}">
      <img class="game-cover" src="${esc(game.cover)}" alt="" loading="lazy" decoding="async" width="640" height="400">
      <div class="card-copy">
        <div class="card-topline"><${heading} class="card-title">${esc(game.title)}</${heading}><span class="card-arrow" aria-hidden="true">↗</span></div>
        <p class="card-description">${esc(game.description)}</p>
        <div class="card-footer">
          <span class="card-genre">${esc(genres[game.tags[0]]||game.tags[0]||'게임')}</span>
          ${game.controls.includes('touch')?'<span class="card-control">터치 지원</span>':''}
          ${releaseBadgeMarkup('new',game.publishedOn,badge)}
          ${releaseBadgeMarkup('update',game.updatedOn,badge)}
        </div>
      </div>
    </a>${wishlistButton(game)}</div>`;
  }
  function releaseBadgeMarkup(kind,value,active){
    const date=Rules.parseGameUpdateDate(value);
    if(!date)return '';
    const label=kind==='new'?'New':'업데이트';
    return `<span class="card-${kind}"${kind===active?'':' hidden'}><span class="card-${kind}-label">${label}</span><time datetime="${esc(value)}" data-no-translate>${esc(formatGameUpdateDate(date))}</time></span>`;
  }
  function formatGameUpdateDate(date){return date.toLocaleDateString(state.locale,{dateStyle:'medium',timeZone:'UTC'});}
  function refreshGameUpdateBadges(){
    const now=Date.now();
    for(const footer of document.querySelectorAll('.card-footer')){
      const released=footer.querySelector('.card-new');
      const updated=footer.querySelector('.card-update');
      const badge=Rules.gameReleaseBadge(released?.querySelector('time').dateTime,updated?.querySelector('time').dateTime,now);
      if(released)released.hidden=badge!=='new';
      if(updated)updated.hidden=badge!=='update';
    }
  }
  function wishlistButton(game,detail=false){
    const saved=state.wishlist.has(game.id);
    return `<button class="${detail?'button secondary detail-wishlist':'card-wishlist'}" type="button" data-wishlist-game="${esc(game.id)}" aria-pressed="${saved}" aria-label="${esc(game.title)} 찜하기" ${wishlistEnabled()?'':'disabled'}>
      <span class="heart" aria-hidden="true">${saved?'♥':'♡'}</span>${detail?`<span class="wishlist-button-label" aria-hidden="true">${saved?'찜한 게임에서 제거':'찜하기'}</span>`:''}
    </button>`;
  }
  function recentMarkup(game){
    return `<div class="recent-entry">
      <a class="recent-card" href="/play/${game.id}/" data-game-link="${esc(game.id)}" data-impression="${esc(game.id)}">
        <img src="${esc(game.cover)}" alt="" loading="lazy" decoding="async" width="64" height="48">
        <span>${esc(game.title)}<small data-recent-save="${game.id}"></small></span><span class="card-arrow" aria-hidden="true">↗</span>
      </a>
      <button class="text-button" type="button" data-recent-records="${game.id}" aria-label="${esc(game.title)} 저장 기록">저장 기록</button>
    </div>`;
  }
  async function refreshRecentSaves(){
    const epoch=state.sessionEpoch;
    await Promise.all([...$('app').querySelectorAll('[data-recent-save]')].map(async label=>{
      const id=label.dataset.recentSave;
      if(tabCandidate(id)){label.textContent='이 탭의 임시 진행';return;}
      if(state.limited||state.authStale||!state.session){label.textContent='서버 저장 확인 불가';return;}
      if(state.session.kind==='anonymous'){label.textContent='확인된 저장 없음';return;}
      label.textContent='저장 시각 확인 중…';
      try{
        const data=await api('/api/saves/'+encodeURIComponent(id)+'/slots',{timeout:3500});
        if(epoch!==state.sessionEpoch||!label.isConnected)return;
        const main=data.slots.find(slot=>slot.slot==='main');
        label.textContent=main?`이어하기 · ${dateLabel(main.updatedAt)}`:'이어하기 기록 없음';
      }catch(error){
        if(epoch===state.sessionEpoch&&label.isConnected)label.textContent=error.code==='PLAY_FIRST'?'이어하기 기록 없음':'서버 저장 확인 불가';
      }
    }));
  }
  function recentSection(recent){
    return recent.length?`<section class="recent-section" aria-labelledby="recent-title">
      <div class="section-heading"><h2 id="recent-title">최근 플레이</h2></div>
      <div class="recent-list">${recent.map(recentMarkup).join('')}</div>
    </section>`:'';
  }
  function stopImpressions(){state.observer?.disconnect();for(const item of state.impressions)clearTimeout(item.timer);state.impressions=[];}
  function checkImpression(item){clearTimeout(item.timer);if(item.recorded||document.hidden||item.ratio<.5){item.started=0;return;}item.started=performance.now();item.timer=setTimeout(()=>{if(Rules.eligibleImpression(item,performance.now(),!document.hidden)){item.recorded=true;event('game_impression',item.gameId,{visible_fraction:Math.min(1,item.ratio),visible_duration_ms:1000,document_visible:true},{impression_id:item.id});}},1000);}
  function watchImpressions(){stopImpressions();if(!('IntersectionObserver'in window))return;state.observer=new IntersectionObserver(entries=>{for(const e of entries){const item=state.impressions.find(i=>i.element===e.target);if(!item)continue;const before=item.ratio;item.ratio=e.intersectionRatio;if(before<.5||item.ratio<.5)checkImpression(item);}},{threshold:[0,.5,1]});
    for(const element of $('app').querySelectorAll('[data-impression]')){const item={element,gameId:element.dataset.impression,id:uuid(),ratio:0,started:0,timer:0,recorded:false};state.impressions.push(item);state.observer.observe(element);}
  }
  function recentGames(){try{return JSON.parse(localStorage.getItem('ph-recent')||'[]').filter(id=>state.games.some(g=>g.id===id)).slice(0,5);}catch(_){return [];}}
  function rememberGame(id){try{localStorage.setItem('ph-recent',JSON.stringify([id,...recentGames().filter(x=>x!==id)].slice(0,5)));}catch(_) {}}
  function meta(title,description,path='/'){document.title=title;const descriptionTag=document.querySelector('meta[name=description]');if(descriptionTag)descriptionTag.content=description;let canonical=document.querySelector('link[rel=canonical]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.append(canonical);}canonical.href=location.origin+path;}
  function searchTerms(){return state.query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);}
  function gameMatches(game,terms){
    const metadata=state.allMetadata.get(game.id)||{};
    const localizedFields=['title','summary'].flatMap(field=>typeof metadata[field]==='object'?Object.values(metadata[field]):[]);
    const genreNames=game.tags.map(tag=>genres[tag]||tag);
    const translatedGenres=genreNames.map(label=>window.PlayHubLocale?.translate(label)||label);
    const searchText=[game.title,game.englishTitle,...localizedFields,game.id.replace(/-/g,' '),game.description,...game.tags,...genreNames,...translatedGenres].join(' ').toLocaleLowerCase();
    return terms.every(term=>searchText.includes(term));
  }
  function filterOptions(options,selected){
    return options.map(([value,label])=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`).join('');
  }
  function renderBrowse(){
    const terms=searchTerms();
    const tagOptions=[...new Set(state.games.flatMap(game=>game.tags))].map(tag=>[tag,genres[tag]||tag]);
    const {genre,device,control,sort}=state;
    const games=state.games.filter(game=>{
      const touch=game.controls.includes('touch');
      return (genre==='all'||game.tags.includes(genre))&&
        (device==='all'||(device==='touch'?touch:game.controls.length>0&&!touch))&&
        (control==='all'||game.controls.includes(control))&&gameMatches(game,terms);
    });
    if(sort==='updated')games.sort((a,b)=>(Rules.parseGameUpdateDate(b.updatedOn)?.getTime()||0)-(Rules.parseGameUpdateDate(a.updatedOn)?.getTime()||0));
    if(sort==='title')games.sort((a,b)=>a.title.localeCompare(b.title,state.locale));
    const genreButtons=[['all','전체'],...tagOptions].map(([value,label])=>`<button class="filter${value===genre?' active':''}" type="button" data-genre-filter="${esc(value)}" aria-pressed="${value===genre?'true':'false'}">${esc(label)}</button>`).join('');
    $('app').innerHTML=`<div class="page">
      <div class="section-heading library-heading">
        <h1 id="library-title">${terms.length?`“${esc(state.query)}” 검색 결과`:'전체 게임'}</h1>
        <span class="section-count">${games.length}개 게임</span>
      </div>
      <div class="filters genre-filters" role="group" aria-label="장르 필터">${genreButtons}</div>
      <form class="browse-filters" id="browse-filters" aria-label="세부 필터">
        <label>모바일<select name="device">${filterOptions([['all','전체'],['touch','터치 지원'],['non-touch','터치 미지원']],device)}</select></label>
        <label>조작 방식<select name="control">${filterOptions([['all','전체'],...Object.entries(controlLabels)],control)}</select></label>
        <label>정렬<select name="sort">${filterOptions([['default','기본순'],['updated','최근 업데이트순'],['title','이름순']],sort)}</select></label>
      </form>
      ${games.length?`<div class="game-grid">${games.map(game=>cardMarkup(game,'h2')).join('')}</div>`:`<div class="no-results"><p>${state.games.length?'조건에 맞는 게임이 없습니다.':'지금 플레이할 수 있는 게임이 없습니다.'}</p>${state.games.length?`<a class="button secondary" href="${browsePath}" data-route>필터 초기화</a>`:''}</div>`}
    </div>`;
    const filterForm=$('browse-filters');
    const applyBrowseFilters=(nextGenre=state.genre)=>{
      const params=new URLSearchParams({view:'browse'});
      if(state.query)params.set('q',state.query);
      if(nextGenre&&nextGenre!=='all')params.set('genre',nextGenre);
      for(const [name,value] of new FormData(filterForm))if(!['all','default'].includes(value))params.set(name,value);
      navigate('/?'+params);
    };
    for(const button of $('app').querySelectorAll('[data-genre-filter]')){
      button.addEventListener('click',()=>applyBrowseFilters(button.dataset.genreFilter));
    }
    filterForm.addEventListener('change',()=>applyBrowseFilters());
    filterForm.addEventListener('submit',event=>{
      event.preventDefault();
      applyBrowseFilters();
    });
    if(state.view==='home')meta('PLAY HUB — 브라우저 게임 라이브러리','전략, 시뮬레이션, 액션부터 가벼운 퍼즐까지. 설치 없이 브라우저에서 게임을 즐기세요.');
    else meta('게임 찾기 | PLAY HUB','장르, 지원 조작과 모바일 지원 여부로 게임을 찾아보세요.',browsePath);
    document.documentElement.classList.add('js');
    watchImpressions();
  }
  function renderWishlist(){
    const terms=searchTerms();
    const items=[...state.wishlist.values()].sort((a,b)=>(Date.parse(b.addedAt)||0)-(Date.parse(a.addedAt)||0));
    const byId=new Map(state.games.map(game=>[game.id,game]));
    const available=items.filter(item=>item.available!==false&&byId.has(item.gameId));
    const unavailable=items.length-available.length;
    const games=available.map(item=>byId.get(item.gameId)).filter(game=>gameMatches(game,terms));
    const ready=state.wishlistStatus==='ready';
    const loading=state.wishlistStatus==='loading';
    const feedback=loading?'<p>찜한 게임을 불러오고 있습니다.</p>':!ready?'<p>찜한 게임을 불러오지 못했습니다.</p><button class="text-button" type="button" data-wishlist-retry>다시 시도</button>':'';
    let emptyMessage='게임 카드의 하트를 눌러 관심 있는 게임을 모아 보세요.';
    if(terms.length)emptyMessage='검색 조건에 맞는 찜한 게임이 없습니다.';
    else if(unavailable)emptyMessage='현재 플레이할 수 있는 찜한 게임이 없습니다.';
    const recent=recentGames().map(id=>byId.get(id));
    $('app').innerHTML=`<div class="page wishlist-page">
      <div class="section-heading"><h1 id="wishlist-title" tabindex="-1">내 게임</h1></div>
      ${recentSection(recent)||'<p class="no-results">이 브라우저에서 최근 플레이한 게임이 없습니다.</p>'}
      <section class="wishlist-section" aria-labelledby="wishlist-section-title">
        <div class="section-heading"><h2 id="wishlist-section-title">찜한 게임</h2>${ready?`<span class="section-count">${items.length}개 게임</span>`:''}</div>
        ${feedback?`<div class="wishlist-feedback" role="status">${feedback}</div>`:''}
        ${unavailable?`<div class="wishlist-feedback"><p>찜한 게임 중 ${unavailable}개는 현재 플레이할 수 없습니다.</p></div>`:''}
        ${games.length?`<div class="game-grid">${games.map(game=>cardMarkup(game)).join('')}</div>`:''}
        ${!games.length&&ready?`<div class="no-results"><p>${emptyMessage}</p>${terms.length?'<a class="button secondary" href="/?view=wishlist" data-wishlist-link>검색 지우기</a>':`<a class="button secondary" href="${browsePath}" data-route>게임 찾기</a>`}</div>`:''}
      </section>
    </div>`;
    meta('내 게임 | PLAY HUB','최근 플레이한 게임과 찜한 게임을 찾아보세요.',wishlistPath);
    document.documentElement.classList.add('js');
    watchImpressions();
    void refreshRecentSaves();
  }
  function empty(title,message){stopImpressions();$('app').innerHTML=`<section class="empty-state"><h1>${esc(title)}</h1><p>${esc(message)}</p><a class="button primary" href="/" data-home>게임 목록으로</a></section>`;}
  async function renderDetail(id,route){const game=state.games.find(g=>g.id===id);if(!game){
    if(state.allMetadata.has(id)&&!state.limited)empty('지금은 쉬고 있는 게임이에요','이 게임은 현재 공개 상태가 아닙니다. 다른 게임을 만나보세요.');
    else empty('게임을 찾을 수 없어요','주소를 확인하거나 지금 이용할 수 있는 다른 게임을 골라보세요.');
    return;}
    if(!state.limited){try{await api('/api/games/'+encodeURIComponent(id));}catch(error){if(route!==state.route)return;if(error.status===404){empty('지금은 쉬고 있는 게임이에요','운영자가 이 게임의 공개를 중단했습니다. 다른 게임을 만나보세요.');return;}banner('서버의 최신 게임 상태를 확인하지 못했습니다. 게임 시작 때 다시 확인합니다.');}}
    if(route!==state.route)return;
    const related=state.games.filter(g=>g.id!==id).slice(0,3);
    const deviceHelp=game.controls.includes('touch')?'터치 화면에서 플레이할 수 있습니다.':
      game.controls.length?'터치 조작을 지원하지 않습니다. 표시된 조작 기기를 사용해 주세요.':'게임 화면에서 지원 조작을 확인해 주세요.';
    $('app').innerHTML=`<div class="page detail-page">
      <nav class="breadcrumb" aria-label="이동 경로"><a href="${browsePath}" data-route><span aria-hidden="true">←</span> 게임 찾기</a></nav>
      <div class="detail-heading">
        <div>
          <h1>${esc(game.title)}</h1>
          <p>${esc(game.description)}</p>
        </div>
        <div class="detail-meta">
          ${game.controls.length?`<ul class="control-list" aria-label="지원 조작">${game.controls.map(control=>`<li>${esc(controlLabels[control]||control)}</li>`).join('')}</ul>`:''}
          ${wishlistButton(game,true)}
        </div>
      </div>
      <div class="device-guide" aria-label="플레이 환경 안내">
        <p>${deviceHelp}${game.orientation==='landscape'?' 가로 화면으로 플레이하세요.':game.orientation==='portrait'?' 세로 화면으로 플레이하세요.':''}</p>
        ${document.fullscreenEnabled?'':'<p>이 브라우저에서는 전체 화면을 사용할 수 없습니다.</p>'}
      </div>
      <div class="player-panel fullscreen-player" id="player-panel">
        <div class="player-poster">
          <img src="${esc(game.cover)}" alt="" fetchpriority="high" width="640" height="400">
          <div class="poster-actions">
            <button class="button accent large" id="play-button" data-testid="launch-game" type="button"><span class="play-symbol" aria-hidden="true"></span>${state.limited?'로컬 모드로 플레이':'게임 시작'}</button>
            <p>${state.limited?'진행은 이 탭에 임시 저장됩니다.':'진행은 자동으로 저장됩니다.'}</p>
          </div>
        </div>
      </div>
      <div class="player-tools">
        <span id="save-indicator" data-testid="save-status" class="save-indicator" role="status"></span>
        <div class="player-tools-right" id="player-tools-right">
          <button id="saves-open" data-testid="save-manager-open" class="text-button" type="button">저장 기록</button>
          <button id="save-retry" data-testid="save-retry" class="text-button" type="button" hidden>서버 저장 다시 시도</button>
          <button id="backup-download" class="text-button" type="button" hidden>임시 기록 받기</button>
          <button id="fullscreen" class="text-button" type="button"${document.fullscreenEnabled?'':' hidden'}>전체 화면 <span aria-hidden="true">↗</span></button>
          <button class="text-button" type="button" data-google-login hidden>Google로 기록 보관</button>
          <button id="close-game" class="text-button" type="button" hidden>게임 닫기</button>
        </div>
      </div>
      <div class="detail-select" role="group" aria-label="게임 정보">
        <button class="filter active" type="button" data-detail-panel="game-info" aria-pressed="true" aria-controls="game-info">소개</button>
        <button class="filter" type="button" data-detail-panel="community" aria-pressed="false" aria-controls="community">커뮤니티</button>
      </div>
      <div id="game-info" class="detail-info">
        <section><h2>플레이 방법</h2><p>${esc(game.instructions)}</p></section>
        <section><h2>게임 목표</h2><p>${esc(game.rules)}</p></section>
      </div>
      <section id="community" class="community" aria-labelledby="community-title" data-testid="community" data-game-id="${esc(id)}" hidden></section>
      ${related.length?`<section class="related" aria-labelledby="related-title">
        <div class="section-heading"><h2 id="related-title">다른 게임</h2></div>
        <div class="game-grid">${related.map(game=>cardMarkup(game)).join('')}</div>
      </section>`:''}
    </div>`;
    meta(`${game.title} | PLAY HUB 무료 웹 게임`,game.description,`/play/${id}/`);document.documentElement.classList.add('js');watchImpressions();event('game_detail_view',id);
    updateAccount();
    const playerLanguage=$('language-select').cloneNode(true);
    playerLanguage.id='player-language';
    playerLanguage.value=state.locale;
    playerLanguage.addEventListener('change',changeLocale);
    $('player-tools-right').prepend(playerLanguage);
    for(const tab of $('app').querySelectorAll('[data-detail-panel]'))tab.onclick=()=>selectDetailPanel(tab.dataset.detailPanel,id);
    if(location.hash==='#community')selectDetailPanel('community',id);
    $('play-button').onclick=()=>startPlay(game);$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('player-panel').requestFullscreen();}catch(_){toast('이 브라우저에서는 전체 화면을 사용할 수 없어요.');}};
    $('close-game').onclick=async()=>{await teardown('user_close');await renderRoute();};$('backup-download').onclick=()=>downloadBackup(id);$('saves-open').onclick=()=>openSaveManager(game);$('save-retry').onclick=()=>retrySave();
  }
  function selectDetailPanel(panel,id){
    for(const tab of $('app').querySelectorAll('[data-detail-panel]')){
      const active=tab.dataset.detailPanel===panel;
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-pressed',String(active));
      $(tab.dataset.detailPanel).hidden=!active;
    }
    const community=$('community');
    if(panel==='community'&&!community.hasChildNodes())window.PlayHubCommunity?.mount(community,id,api);
  }
  function renderCreator(){
    stopImpressions();
    const session=state.session;
    const available=session?.kind==='registered'&&!state.limited&&!state.authStale;
    $('app').innerHTML=`<div class="page creator-page">
      <div class="section-heading"><h1>만들기</h1></div>
      <section class="surface" aria-labelledby="forge-title">
        <h2 id="forge-title">PlayForge</h2>
        <p>새 탭에서 PlayForge 웹 에디터를 열어 게임을 만들 수 있습니다. PlayHub에 로그인한 Google 계정으로 연결됩니다.</p>
        <a class="button secondary" href="/PlayForge/" target="_blank" rel="noopener">PlayForge 열기 <span aria-hidden="true">↗</span></a>
      </section>
      <div id="creator">${available?'':`<section class="surface">
        <h2>창작자 대시보드</h2>
        <p>${session?.kind==='registered'?accountHelp(false):'소유 프로젝트와 제출 상태를 보려면 PlayHub에서 Google로 로그인하세요.'}</p>
        <button class="button primary" type="button" data-google-login hidden>Google로 로그인</button>
        <a class="button secondary" href="/?view=account" data-route>계정 상태 확인</a>
      </section>`}</div>
    </div>`;
    meta('만들기 | PLAY HUB','소유 프로젝트와 릴리스, 제출 상태를 확인하세요.','/?view=create');
    updateAccount();
    if(available){
      const epoch=state.sessionEpoch;
      window.PlayHubCreator?.mount($('creator'),api,()=>epoch===state.sessionEpoch&&!state.authStale);
    }
  }
  async function renderRoute(){
    const token=++state.route;
    const params=new URLSearchParams(location.search);
    let id=null;
    try{id=decodeURIComponent(location.pathname.match(/^\/play\/([^/]+)\/?/)?.[1]||params.get('game')||'');}catch(_){}
    state.query=(params.get('q')||'').slice(0,100);
    $('search').value=state.query;
    const explicitLocale=localeFromUrl();
    if(explicitLocale&&state.locale!==explicitLocale)applyLocale(explicitLocale,{remember:true});
    state.genre=state.games.some(game=>game.tags.includes(params.get('genre')))?params.get('genre'):'all';
    state.device=['touch','non-touch'].includes(params.get('device'))?params.get('device'):'all';
    state.control=Object.hasOwn(controlLabels,params.get('control'))?params.get('control'):'all';
    state.sort=['updated','title'].includes(params.get('sort'))?params.get('sort'):'default';
    const view=params.get('view');
    if(id&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id))state.view='detail';
    else if(['wishlist','create','account'].includes(view))state.view=view;
    else state.view=view==='browse'||state.query?'library':'home';
    $('app').hidden=state.view==='account';
    $('account-panel').hidden=state.view!=='account';
    document.documentElement.classList.add('js');
    for(const link of document.querySelectorAll('[data-nav-view]')){
      if(link.dataset.navView===state.view)link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    }
    if(state.view==='detail')await renderDetail(id,token);
    else if(state.view==='wishlist')renderWishlist();
    else if(state.view==='library'||state.view==='home')renderBrowse();
    else if(state.view==='create')renderCreator();
    else if(state.view==='account'){
      stopImpressions();
      $('app').replaceChildren();
      meta('내 계정 | PLAY HUB','Google 계정, 게스트 기록, 언어 설정을 관리하세요.','/?view=account');
      updateAccount();
    }
  }
  async function navigate(path){
    await teardown('navigation');
    stopImpressions();
    const url=new URL(path,location.origin);
    if(localeFromUrl())url.searchParams.set('lang',state.locale);
    history.pushState({},'',url);
    await renderRoute();
    window.scrollTo({top:0,behavior:'auto'});
    $(state.view==='account'?'account-panel':'app').focus({preventScroll:true});
  }
  function saveStatus(message,warning=false){const el=$('save-indicator');if(el){el.textContent=message;el.classList.toggle('warning',warning);}const a=state.active;if($('save-retry'))$('save-retry').hidden=!warning||!a||a.local||a.saveBlocked||state.authStale;if(a?.port&&!a.closed)a.port.postMessage({type:'save_status',payload:{state:warning?'local':'saved',message}});}
  function showBackup(){if($('backup-download'))$('backup-download').hidden=false;}
  function downloadProgress(id,record){
    const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=id+'-progress-backup.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadBackup(id){const scope=state.active?.cacheScope||state.cacheScope;const value=cacheGet(id,true,scope)||cacheGet(id,false,scope);if(!value){toast('받을 수 있는 임시 기록이 없습니다.');return;}downloadProgress(id,value);}
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
      const iframe=document.createElement('iframe');iframe.className='game-frame'+(game.id==='falling-blocks'?' tall':nativeGames.has(game.id)?'':' imported');iframe.title=game.title+' 게임 실행 화면';iframe.setAttribute('data-testid','game-frame');iframe.sandbox='allow-scripts'+(game.pointerLock===true?' allow-pointer-lock':'');iframe.referrerPolicy='no-referrer';
      const nonce=uuid().replace(/-/g,'');iframe.src=`/games/${encodeURIComponent(game.id)}/index.html?lang=${encodeURIComponent(state.locale)}#nonce=${nonce}`;
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
    try{const choices=(pending.conflicts||[]).map((c,i)=>({gameId:c.gameId,slot:c.slot,action:$('conflict-'+i).value,expectedTargetRevision:c.targetRevision}));await api('/api/auth/merge',{method:'POST',body:{mergeId:pending.id,consent:true,linkAnalyticsHistory:$('merge-analytics').checked,choices}});state.session.pendingMerge=null;updateAccount();$('merge-dialog').close();toast('기록을 연결했어요. 별도 보관한 진행은 게임의 저장 기록에서 복구할 수 있습니다.');void refreshWishlist();void loadPreference();}catch(error){if(error.status===409){try{const session=await api('/api/session');if(Rules.sameSession(state.session,session)){setSession(session);await openMerge();}}catch(_){}}$('merge-error').hidden=false;$('merge-error').textContent=error.status===409?'다른 탭에서 기록이 바뀌었습니다. 최신 충돌 목록을 확인하고 다시 선택해 주세요.':error.message;}finally{button.disabled=false;}
  });
  function cleanAuthUrl(){
    const url=new URL(location.href);
    url.searchParams.delete('auth');
    url.searchParams.delete('authError');
    return url;
  }
  function showAuthResult(){
    const params=new URLSearchParams(location.search);
    if(!params.has('auth')&&!params.has('authError'))return;
    history.replaceState(history.state,'',cleanAuthUrl());
    const notice=$('account-notice');
    const message=document.createElement('span');
    if(params.get('authError')==='GOOGLE_CANCELLED')message.textContent='Google 로그인을 취소했습니다. 현재 게스트 기록을 계속 사용할 수 있습니다.';
    else if(params.get('auth')==='success'&&!params.has('authError')&&state.session?.kind==='registered'){
      message.textContent='Google 계정에 로그인했습니다.';
    }else message.textContent='Google 로그인을 확인할 수 없습니다. 계정 화면에서 다시 시도해 주세요.';
    const dismiss=document.createElement('button');
    dismiss.className='text-button';
    dismiss.type='button';
    dismiss.textContent='닫기';
    dismiss.onclick=()=>notice.hidden=true;
    notice.replaceChildren(message,dismiss);
    notice.hidden=false;
  }
  function goToGoogle(){
    const start=new URL(API+'/api/auth/google/start');
    start.searchParams.set('returnTo',cleanAuthUrl().href);
    location.href=start.href;
  }
  function loginProgress(){
    const dialog=$('login-progress-dialog');
    const list=$('login-progress-records');
    const scopes=[...new Set([state.cacheScope,localScope()])].filter(Boolean);
    const ids=new Set([...state.games.map(game=>game.id),...state.allMetadata.keys()]);
    list.replaceChildren();
    const proceed=$('login-continue');
    let remaining=0;
    for(const id of ids)for(const scope of scopes)for(const backup of [false,true]){
      const record=cacheGet(id,backup,scope);
      if(!record?.dirty)continue;
      remaining++;
      const row=document.createElement('div');
      row.className='save-record';
      const details=document.createElement('div');
      const title=document.createElement('strong');
      title.textContent=(state.games.find(game=>game.id===id)?.title||id)+(backup?' · 백업':'');
      const date=document.createElement('p');
      date.textContent=dateLabel(record.updatedAt);
      details.append(title,date);
      const download=document.createElement('button');
      download.type='button';
      download.className='button secondary small';
      download.textContent='파일로 받기';
      download.onclick=()=>{
        downloadProgress(id,record);
        download.disabled=true;
        download.textContent='다운로드 요청함';
        proceed.disabled=--remaining>0;
      };
      row.append(details,download);
      list.append(row);
    }
    if(!remaining)return false;
    proceed.disabled=true;
    dialog.showModal();
    return true;
  }
  async function signIn(){
    if($('google-login').disabled||state.authChanging||$('login-progress-dialog').open)return;
    state.authChanging=true;
    try{
      const route=state.route;
      const wasPlaying=Boolean(state.active);
      await teardown('account_link');
      if(route!==state.route)return;
      if(wasPlaying)await renderRoute();
      if(!loginProgress())goToGoogle();
    }finally{state.authChanging=false;}
  }
  $('google-login').onclick=signIn;
  $('login-continue').onclick=()=>{
    if($('login-continue').disabled||$('google-login').disabled)return;
    $('login-progress-dialog').close();
    goToGoogle();
  };
  $('logout').onclick=async()=>{if(state.authChanging)return;state.authChanging=true;$('logout').disabled=true;const a=state.active;
    try{await teardown('logout');if(a?.dirty&&!window.confirm('서버에 저장하지 못한 임시 기록이 있습니다. 로그아웃하면 이 탭의 임시 기록도 지워집니다. 계속할까요?')){await renderRoute();return;}
      await api('/api/auth/logout',{method:'POST',body:{}});state.events=[];resetWishlist();state.sessionEpoch++;state.session=null;state.cacheScope='';state.preparedPlay=null;state.authStale=false;state.limited=true;clearPrivateCache();try{localStorage.removeItem('ph-recent');}catch(_){}updateAccount();
      try{setSession(await api('/api/session'));state.limited=false;banner('');}catch(_){banner('로그아웃했습니다. 서버 연결이 복구될 때까지 로컬 모드로 이용할 수 있습니다.');}
      await renderRoute();toast('로그아웃했습니다. 다음 게임은 새 게스트로 시작해요.');
    }catch(error){toast(error.message);await renderRoute();}finally{state.authChanging=false;$('logout').disabled=false;updateAccount();void refreshWishlist();void loadPreference();}
  };
  $('merge-open').onclick=openMerge;$('privacy-open').onclick=()=>{state.active?.port?.postMessage({type:'host_pause'});$('privacy-dialog').showModal();};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  $('search-form').addEventListener('submit',e=>{
    e.preventDefault();
    const search=new URLSearchParams(state.view==='library'?location.search:'');
    search.set('view',state.view==='wishlist'?'wishlist':'browse');
    const q=$('search').value.trim();
    if(q)search.set('q',q);
    else search.delete('q');
    navigate('/?'+search);
  });
  function changeLocale(e){
    const locale=e.target.value;
    applyLocale(locale,{remember:true,updateUrl:true});
    savePreference(locale);
  }
  $('language-select').addEventListener('change',changeLocale);
  document.addEventListener('click',e=>{
    if(e.target.closest('.skip-link')){
      e.preventDefault();
      $(state.view==='account'?'account-panel':'app').focus();
      return;
    }
    if(e.target.closest('[data-google-login]')){void signIn();return;}
    if(e.target.closest('[data-privacy-open]')){$('privacy-open').click();return;}
    const records=e.target.closest('[data-recent-records]');
    if(records){
      const game=state.games.find(game=>game.id===records.dataset.recentRecords);
      if(game)void openSaveManager(game);
      return;
    }
    const wishlistToggle=e.target.closest('[data-wishlist-game]');if(wishlistToggle){toggleWishlist(wishlistToggle);return;}
    const retry=e.target.closest('[data-wishlist-retry]');if(retry){retry.disabled=true;refreshWishlist().finally(()=>retry.disabled=false);return;}
    const routeLink=e.target.closest('[data-route],[data-wishlist-link],[data-home],a.brand,a.footer-brand');
    if(routeLink&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();navigate(routeLink.getAttribute('href'));return;}
    const link=e.target.closest('[data-game-link]');if(link){const item=state.impressions.find(x=>x.element===link.closest('[data-impression]'));if(item&&Rules.eligibleImpression(item,performance.now(),!document.hidden)){item.recorded=true;clearTimeout(item.timer);event('game_impression',item.gameId,{visible_fraction:item.ratio,visible_duration_ms:1000,document_visible:true},{impression_id:item.id});}event('game_card_click',link.dataset.gameLink,{viewability_met:!!item?.recorded},{impression_id:item?.id||uuid()});if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();navigate(link.getAttribute('href'));}return;}
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
      const records=(data.games||[]).filter(isPublicGame).map(normalizeGame),ids=new Set(records.map(g=>g.id));
      const changed=records.length!==state.games.length||records.some((game,i)=>game.id!==state.games[i].id||
        game.publishedOn!==state.games[i].publishedOn||game.updatedOn!==state.games[i].updatedOn);
      const wasLimited=state.limited||state.authStale;
      const newSession=state.session&&!Rules.sameSession(state.session,session);
      state.games=records;
      if(newSession)await applySessionChange(session);
      else{setSession(session);state.limited=false;
        if(state.active&&'authPreviousSaveBlocked'in state.active){state.active.saveBlocked=state.active.authPreviousSaveBlocked;delete state.active.authPreviousSaveBlocked;}
        if(state.active&&!ids.has(state.active.game.id)){await teardown('game_disabled');toast('운영자가 게임의 공개를 중단했습니다.');await renderRoute();}
        else if(!state.active&&(changed||wasLimited||manual))await renderRoute();
      }
      updateAccount();
      void refreshWishlist();
      if(newSession||wasLimited)void loadPreference();
      if(state.active?.local)banner('서버 연결이 복구됐습니다. 현재 로컬 진행은 이 탭에 유지됩니다. 저장 기록에서 직접 서버에 적용할 수 있습니다.');
      else if(state.active?.saveBlocked)banner('서버 연결은 정상입니다. 저장 기록을 열어 충돌한 기록 중 이어갈 기록을 선택하세요.');
      else if(state.active?.dirty){saveStatus('연결 복구 · 서버 저장 다시 시도를 눌러주세요.',true);banner('서버 연결이 복구됐습니다. 이 탭의 진행을 조건부로 다시 저장할 수 있습니다.');}
      else banner('');
      if(manual&&!state.active)toast('서버 연결과 로그인 상태를 확인했습니다.');
    }catch(error){if(manual||state.limited)banner(error.message||'서버 연결을 확인하지 못했습니다. 현재 진행을 유지합니다.');}
    finally{state.reconnecting=false;const button=$('connection-banner').querySelector('button');if(button){button.disabled=false;button.textContent='서버 연결 확인';}}
  }
  function isPublicGame(game){return game.enabled!==false&&/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(game.id);}
  function normalizeGame(game){
    const manifest=state.allMetadata.get(game.id)||{};
    const localize=value=>typeof value==='string'?value:value?.ko||value?.en||'';
    const assetRoot=`/games/${game.id}/`;
    const apiCover=typeof game.coverUrl==='string'&&game.coverUrl.startsWith(assetRoot)?game.coverUrl.slice(assetRoot.length):'';
    const cover=manifest.media?.cover||apiCover;
    const safeCover=typeof cover==='string'&&/^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(cover)&&!cover.includes('..');
    return {
      id:game.id,
      title:localize(game.title)||localize(manifest.title)||game.id,
      englishTitle:manifest.title?.en||'',
      description:localize(game.description)||localize(manifest.summary),
      instructions:localize(manifest.instructions)||localize(game.instructions)||'게임 화면의 도움말과 조작 버튼을 확인하세요.',
      rules:localize(manifest.rules)||'게임 화면에서 달성할 목표를 확인하세요.',
      tags:Array.isArray(manifest.tags)?manifest.tags:Array.isArray(game.tags)?game.tags:game.genre?[game.genre]:[],
      controls:Array.isArray(game.controls)?game.controls:Array.isArray(manifest.controls)?manifest.controls:[],
      orientation:game.orientation||manifest.viewport?.orientation,
      pointerLock:manifest.capabilities?.pointerLock===true,
      cover:assetRoot+(safeCover?cover:'assets/cover.svg'),
      publishedOn:game.publishedOn??manifest.publishedOn,
      updatedOn:game.updatedOn??manifest.updatedOn,
    };
  }
  async function init(){
    applyLocale(state.locale,{remember:!!localeFromUrl()});
    const sessionAndGames=Promise.allSettled([api('/api/session'),api('/api/games')]);
    let localEntries=[];try{const result=await fetch('/catalog/games.json',{cache:'no-store'});const catalog=await result.json();if(catalog.schemaVersion!==1||!Array.isArray(catalog.entries))throw new Error('잘못된 게임 목록');localEntries=catalog.entries.filter(x=>/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(x.id)&&x.path==='games/'+x.id);state.trusted=new Set(localEntries.filter(x=>x.enabled===true).map(x=>x.id));await Promise.all(localEntries.map(async item=>{try{const r=await fetch('/'+item.path+'/game.manifest.json');if(!r.ok)return;const m=await r.json();if(m.id!==item.id)return;state.allMetadata.set(item.id,m);}catch(_){}}));}catch(_){}
    const sessionResult=await sessionAndGames;if(sessionResult[0].status==='fulfilled')setSession(sessionResult[0].value);
    let records;if(sessionResult[1].status==='fulfilled'&&Array.isArray(sessionResult[1].value.games)){records=sessionResult[1].value.games;state.limited=!state.session;if(state.limited){banner('세션 쿠키를 사용할 수 없어 로컬 모드로 제공합니다. 이 탭에만 임시 저장되며 서버 저장·통계는 제공되지 않습니다.');updateAccount();}}else{const error=sessionResult[1].reason;if(error&&!Rules.allowsLocal(error))throw error;state.limited=true;records=localEntries.filter(x=>x.enabled===true);banner('서버 연결 없이 로컬 모드로 플레이할 수 있습니다. 이 탭의 임시 기록은 서버 저장·통계에 포함되거나 자동 연결되지 않습니다.');updateAccount();}
    state.games=records.filter(isPublicGame).map(normalizeGame);
    await renderRoute();
    showAuthResult();
    void refreshWishlist();
    void loadPreference();
    if(state.session?.pendingMerge)openMerge();
  }
  setInterval(()=>{if(!document.hidden){refreshGameUpdateBadges();refreshConnection();}},30000);
  window.addEventListener('online',()=>refreshConnection());
  window.addEventListener('focus',()=>{if(state.session&&!state.closing)refreshConnection();});

  init().catch(error=>{banner(error.message||'서비스를 불러오지 못했습니다.');empty('게임 목록을 불러오지 못했습니다','연결을 확인한 뒤 잠시 후 다시 시도해 주세요.');});
})();
