const config=window.PLAYHUB_ADMIN_CONFIG||{};
const Rules=window.AdminRules;
const hostname=location.hostname.includes(':')&&!location.hostname.startsWith('[')?`[${location.hostname}]`:location.hostname;
const apiBase=(config.apiBaseUrl||`${location.protocol}//${hostname}:${config.apiPort||8091}`).replace(/\/$/,'');
const $=id=>document.getElementById(id);
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value??'';if(className)e.className=className;return e;};
const number=value=>Number(value||0).toLocaleString('ko-KR');
const percent=value=>Rules.rateText(value);
let csrf='',authenticated=false,dataset='live',busy=false,refreshTimer,generation=0,catalog=[];
let filters={from:'',to:'',gameId:''};
const datasetLabels={live:'실제 이용 기록',qa:'QA 실행 기록',demo:'독립 가상 예제'};
function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message;$('notice').classList.toggle('error',error);}
async function api(route,{method='GET',body}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(method!=='GET')headers['X-CSRF-Token']=csrf;
    const response=await fetch(apiBase+route,{method,headers,credentials:'include',cache:'no-store',body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error?.message||`요청 실패 (${response.status})`);error.status=response.status;error.code=data.error?.code;throw error;}
    return data;
  }catch(error){if(!error.status)error.message='관리 API에 연결할 수 없습니다. 현재 표는 갱신되지 않았습니다.';throw error;}finally{clearTimeout(timer);}
}
function clearDashboard(){for(const id of ['overview','funnel','journey-summary','games-body','retention-cards','cohort-body','errors-list','audit-list'])$(id).replaceChildren();$('updated').textContent='';}
function showSession(session){
  csrf=session.csrfToken||'';authenticated=session.authenticated===true;
  $('login-panel').hidden=authenticated;$('dashboard').hidden=!authenticated;$('logout').hidden=!authenticated;
  $('session-label').textContent=authenticated?`${session.username} · 관리자`:'관리자 인증 필요';
  $('login-form').querySelector('button').disabled=false;
  if(!authenticated){generation++;clearDashboard();}
}
function metric(label,value,detail,key){const box=text('div','', 'metric');box.dataset.metric=key;box.append(text('small',label),text('strong',value),text('p',detail));return box;}
function gameTitle(id){const g=catalog.find(item=>item.id===id);return typeof g?.title==='string'?g.title:g?.title?.ko||id;}
function paintMetrics(data){
  const s=data.summary||{},selected=Rules.selectedRetention(data),applied=data.filters||{},gameId=applied.gameId;
  $('overview').replaceChildren(metric('유효 플레이어',number(s.activePlayers),'선택 범위의 활성 플레이 10초 이상','activePlayers'),metric('카드 클릭률',percent(s.ctr),`${number(s.clicks)} 클릭 / ${number(s.impressions)} 가시 노출`,'ctr'),metric('플레이 세션',number(s.playSessions),'서버가 발급한 실행 세션','playSessions'),metric('활성 플레이 시간',`${number(Math.round((s.totalActiveSeconds||0)/60))}분`,'숨김 탭·일시정지·중복 구간 제외','totalActiveSeconds'));
  const stages=[['카드 노출',s.impressions,'impressions'],['카드 클릭',s.clicks,'clicks'],['게임 준비',s.readySessions,'readySessions'],['10초 플레이',s.active10sSessions,'active10sSessions'],['60초 플레이',s.active60sSessions,'active60sSessions']];
  const maximum=Math.max(1,...stages.map(x=>Number(x[1])||0));
  $('funnel').replaceChildren(...stages.map(([label,value,key])=>{const box=text('div','','funnel-item'),bar=text('div','','bar'),fill=document.createElement('span');box.dataset.metric=key;fill.style.width=`${Math.max(0,Math.min(100,Number(value||0)/maximum*100))}%`;bar.append(fill);box.append(text('small',label),text('strong',number(value)),bar);return box;}));
  $('journey-summary').replaceChildren(...[['방문 주체',s.visitors,'visitors'],['라운드 완료',s.roundsCompleted,'roundsCompleted'],['서버 저장 성공',s.saveWrites,'saveWrites']].map(([label,value,key])=>{const box=text('span','');box.dataset.metric=key;box.append(text('strong',number(value)),document.createTextNode(' '+label));return box;}));
  $('retention-cards').replaceChildren(...[1,7,30].map(day=>{const r=selected['d'+day]||{},box=text('div','','retention-card');box.dataset.metric='d'+day;box.append(text('span','D'+day,'day'),text('strong',r.eligible?Rules.rateText(r.rate,'대상 없음'):'집계 대기'),text('p',r.eligible?`${number(r.retained)} / ${number(r.cohortSize)}명`:'확정 가능한 코호트가 없습니다'));return box;}));
  $('cohort-body').replaceChildren(...(selected.cohorts||[]).map(r=>{const tr=document.createElement('tr');for(const v of [r.cohortDate,'D'+r.day,number(r.cohortSize),r.eligible?number(r.retained):'—',r.eligible?Rules.rateText(r.rate,'대상 없음'):'—',r.eligible?'확정':'집계 대기'])tr.append(text('td',v));return tr;}));
  if(!selected.cohorts?.length){const tr=document.createElement('tr'),td=text('td','선택한 최초 플레이 기간에 해당하는 코호트가 없습니다.','empty');td.colSpan=6;tr.append(td);$('cohort-body').append(tr);}
  const period=!applied.from&&!applied.to?'전체 기간':`${applied.from||'최초 기록'} – ${applied.to||'현재'}`;
  $('metrics-scope').textContent=data.dataset==='demo'?'독립 가상 예제 · 고정된 계산 검증 데이터 · 기간·게임 필터 미적용':`${datasetLabels[data.dataset]} · ${period} (KST, 양 끝 날짜 포함) · ${gameId?gameTitle(gameId):'전체 게임'} · QA와 실제 이용 기록은 별도 집계`;
  $('retention-scope').textContent=`${data.retentionScope==='game'?gameTitle(gameId)+'의':'플랫폼 전체의'} 첫 유효 플레이 코호트 · 날짜 필터는 최초일 기준`;
  $('updated').textContent=data.asOf?new Date(data.asOf).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST 기준':'';
  return data.games||[];
}
function paintGameFilter(games){const selected=$('metrics-game').value;$('metrics-game').replaceChildren();const all=document.createElement('option');all.value='';all.textContent='전체 게임';$('metrics-game').append(all);for(const g of games){const option=document.createElement('option');option.value=g.id;option.textContent=gameTitle(g.id)+(g.enabled?'':' · 비공개');$('metrics-game').append(option);}$('metrics-game').value=selected;}
function paintGames(games,metrics,gameId){
  const byId=new Map(metrics.map(g=>[g.id,g])),shown=gameId?games.filter(g=>g.id===gameId):games;
  $('games-body').replaceChildren(...shown.map(game=>{
    const m=byId.get(game.id)||{},tr=document.createElement('tr'),name=document.createElement('td');tr.dataset.gameId=game.id;name.append(text('strong',gameTitle(game.id)),text('small',game.id));tr.append(name);
    for(const value of [number(m.impressions),percent(m.ctr),number(m.plays),number(m.active10s)])tr.append(text('td',value));
    const status=document.createElement('td');status.append(text('span',game.enabled?'공개':'비공개','badge'+(game.enabled?'':' off')));tr.append(status);
    const action=document.createElement('td'),button=text('button',game.enabled?'비공개로 전환':'공개로 전환','toggle');button.disabled=dataset!=='live';button.dataset.testid='game-visibility-toggle';button.dataset.gameId=game.id;button.title=dataset==='live'?'실제 공개 상태를 변경합니다.':'실제 이용 기록 탭에서 공개 상태를 변경할 수 있습니다.';
    button.addEventListener('click',async()=>{
      if(dataset!=='live'||busy)return;if(!confirm(`${gameTitle(game.id)}을(를) ${game.enabled?'비공개':'공개'} 상태로 변경할까요?`))return;
      button.disabled=true;
      try{await api('/api/admin/games/'+encodeURIComponent(game.id),{method:'PATCH',body:{enabled:!game.enabled}});notice('게임 공개 상태를 변경했습니다. 사용자 목록과 새 실행 요청에 반영됩니다.');await refresh();}catch(error){if(error.status===401||(error.status===403&&error.code==='CSRF_INVALID'))showSession({authenticated:false});notice(error.message,true);button.disabled=false;}
    });action.append(button);tr.append(action);return tr;
  }));
}
function paintActivity(element,items,kind){
  if(!items?.length){element.replaceChildren(text('div',kind==='error'?'선택한 데이터·기간·게임의 실행 오류가 없습니다.':'아직 운영 변경 기록이 없습니다.','empty'));return;}
  element.replaceChildren(...items.slice(0,30).map(item=>{const row=text('div','','activity');row.append(text('strong',kind==='error'?`${item.code||'오류'} · ${item.gameId||'플랫폼'}`:`${item.action} · ${item.target||'서비스'}`),text('p',kind==='error'?item.message:typeof item.detail==='string'?item.detail:JSON.stringify(item.detail||{})),text('time',new Date(item.createdAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST'));return row;}));
}
function updateControls(){
  for(const value of ['live','qa','demo']){$(value).classList.toggle('active',dataset===value);$(value).setAttribute('aria-pressed',String(dataset===value));$(value).disabled=busy;}
  $('refresh').disabled=busy;
  for(const id of ['metrics-from','metrics-to','metrics-game','metrics-apply','metrics-reset'])$(id).disabled=busy||dataset==='demo';
  $('demo-banner').hidden=dataset!=='demo';$('qa-banner').hidden=dataset!=='qa';
}
async function refresh(){
  if(!authenticated||busy)return;let query;try{query=Rules.metricsQuery(dataset,filters);}catch(error){notice(error.message,true);return;}busy=true;updateControls();const token=generation;
  try{
    const responses=await Promise.all([api('/api/admin/metrics?'+query),api('/api/admin/games'),api('/api/admin/errors?'+query),api('/api/admin/audit')]);
    if(!authenticated||token!==generation)return;if(responses[0].dataset!==dataset)throw new Error('요청한 데이터 종류와 응답이 달라 표시를 중단했습니다.');
    catalog=responses[1].games||[];paintGameFilter(catalog);paintGames(catalog,paintMetrics(responses[0]),responses[0].filters?.gameId);paintActivity($('errors-list'),responses[2].errors,'error');paintActivity($('audit-list'),responses[3].audit,'audit');
  }catch(error){
    if(token!==generation)return;clearDashboard();$('metrics-scope').textContent='조회 실패 · 이전 통계는 표시하지 않습니다.';
    if(error.status===401||(error.status===403&&error.code==='CSRF_INVALID')){showSession({authenticated:false});notice('관리자 세션이 끝났거나 변경됐습니다. 다시 로그인해 주세요.');}
    else notice(error.message||'관리 API에 연결할 수 없습니다.',true);
  }finally{busy=false;updateControls();}
}
$('login-form').addEventListener('submit',async event=>{
  event.preventDefault();$('login-error').textContent='';const button=event.currentTarget.querySelector('button');button.disabled=true;
  try{const fresh=await api('/api/admin/session');csrf=fresh.csrfToken||'';const session=await api('/api/admin/login',{method:'POST',body:{username:$('username').value,password:$('password').value}});$('password').value='';generation++;showSession(session);notice('');await refresh();}catch(error){$('login-error').textContent=error.message;}finally{button.disabled=false;}
});
$('logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:{}});showSession({authenticated:false});showSession(await api('/api/admin/session'));notice('로그아웃했습니다.');}catch(error){if(error.status===401||(error.status===403&&error.code==='CSRF_INVALID'))showSession({authenticated:false});notice(error.message,true);}});
$('refresh').addEventListener('click',()=>{notice('');refresh();});
for(const value of ['live','qa','demo'])$(value).addEventListener('click',()=>{if(busy)return;dataset=value;notice('');updateControls();refresh();});
$('metrics-filters').addEventListener('submit',event=>{event.preventDefault();if(busy||dataset==='demo')return;const next={from:$('metrics-from').value,to:$('metrics-to').value,gameId:$('metrics-game').value};try{Rules.metricsQuery(dataset,next);filters=next;notice('');refresh();}catch(error){notice(error.message,true);}});
$('metrics-reset').addEventListener('click',()=>{if(busy)return;filters={from:'',to:'',gameId:''};$('metrics-from').value='';$('metrics-to').value='';$('metrics-game').value='';notice('');refresh();});
try{showSession(await api('/api/admin/session'));if(authenticated)await refresh();}catch(error){$('session-label').textContent='연결 실패';$('login-panel').hidden=false;notice('관리 API 연결을 확인해 주세요. 서버가 준비되면 관리자 로그인을 다시 누를 수 있습니다. '+error.message,true);}
refreshTimer=setInterval(()=>{if(!document.hidden)refresh();},30000);window.addEventListener('pagehide',()=>clearInterval(refreshTimer));
