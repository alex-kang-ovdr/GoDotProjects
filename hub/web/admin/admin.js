import { createSubmissionReview } from './submission-review.js';

let localLoginToken=window.takePlayHubLocalAdminToken?.();
const config=window.PLAYHUB_ADMIN_CONFIG||{};
const Rules=window.AdminRules;
const hostname=location.hostname.includes(':')&&!location.hostname.startsWith('[')?`[${location.hostname}]`:location.hostname;
const apiBase=(config.apiBaseUrl||`${location.protocol}//${hostname}:${config.apiPort||8091}`).replace(/\/$/,'');
const $=id=>document.getElementById(id);
const text=(tag,value,className)=>{const e=document.createElement(tag);e.textContent=value??'';if(className)e.className=className;return e;};
const locale=()=>document.documentElement.lang||'ko';
const number=value=>Number(value||0).toLocaleString(locale(),{maximumFractionDigits:1});
const percent=value=>Rules.rateText(value,'—');
const kstToday=(daysAgo=0)=>new Date(Date.now()+9*3600000-daysAgo*86400000).toISOString().slice(0,10);
const kstStamp=value=>new Date(value).toLocaleString(locale(),{timeZone:'Asia/Seoul'})+' KST';
function activeTime(value){
  if(value==null)return '—';
  const minutes=Math.floor(value/60),seconds=value-minutes*60;
  return minutes?`${number(minutes)}분 ${number(seconds)}초`:`${number(seconds)}초`;
}
let csrf='',authenticated=false,dataset='live',busy=false,refreshTimer,generation=0,catalog=[];
let filters={from:'',to:'',gameId:''};
let communityRequest=0,communityOffset=0,communityLoaded=false,communityBusy=false;
let gameRows=null,gameSort={key:'activePlayers',direction:'descending'};
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
function clearDashboard(){
  for(const id of ['overview','funnel','journey-summary','trend-period','trend-cards','trend-body','games-body','games-result','retention-cards','cohort-body','errors-list','audit-list','updated'])$(id).replaceChildren();
  $('trend-values').hidden=true;
  gameRows=null;
  communityRequest++;communityLoaded=false;communityBusy=false;communityOffset=0;
  $('community-list').replaceChildren();$('community-message').textContent='';
  $('community-prev').disabled=true;$('community-next').disabled=true;
}
function showSession(session){
  csrf=session.csrfToken||'';authenticated=session.authenticated===true;
  $('login-panel').hidden=authenticated;$('dashboard').hidden=!authenticated;$('logout').hidden=!authenticated;
  $('session-label').textContent=authenticated?`${session.username} · 관리자`:'관리자 인증 필요';
  $('login-form').querySelector('button').disabled=false;
  if(authenticated)submissionReview.start();
  else{generation++;clearDashboard();submissionReview.reset();}
}
function metric(label,value,detail,key){const box=text('div','', 'metric');box.dataset.metric=key;box.append(text('small',label),text('strong',value),text('p',detail));return box;}
function gameTitle(id){
  const title=catalog.find(item=>item.id===id)?.title;
  return typeof title==='string'?title:title?.[locale()]||title?.ko||title?.en||id;
}
const trendMetrics=[
  ['visitors','방문 주체',number],
  ['playSessions','세션 시작',number],
  ['activePlayers','유효 플레이어',number],
  ['activeSeconds','활성 시간',activeTime]
];

function svgNode(tag,attributes){
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
  return node;
}

function trendChart(values){
  const width=240,height=66,left=5,right=235,bottom=61,top=5;
  const maximum=Math.max(1,...values);
  const points=values.map((value,i)=>[
    values.length>1?left+i*(right-left)/(values.length-1):width/2,
    bottom-(bottom-top)*value/maximum
  ]);
  const positions=points.map(([x,y])=>`${x},${y}`).join(' ');
  const svg=svgNode('svg',{viewBox:`0 0 ${width} ${height}`,'aria-hidden':'true',focusable:'false'});
  const first=points[0],last=points.at(-1);
  for(const y of [top,33,bottom])svg.append(svgNode('line',{x1:left,x2:right,y1:y,y2:y,class:'trend-gridline'}));
  if(points.length>1)svg.append(
    svgNode('polygon',{points:`${first[0]},${bottom} ${positions} ${last[0]},${bottom}`,class:'trend-area'}),
    svgNode('polyline',{points:positions,class:'trend-line'})
  );
  svg.append(svgNode('circle',{cx:last[0],cy:last[1],r:3.8,class:'trend-point'}));
  return svg;
}

function paintTrends(data,applied,isDemo){
  const days=data?.days||[],first=days[0]?.date,last=days.at(-1)?.date;
  let period=first?(first===last?first:`${first} – ${last}`):'';
  if(period){
    period+=' · KST';
    if(!isDemo&&!applied.from)period+=' · 기본 최근 30일';
    if(data.truncated)period+=` · 선택 범위 끝에서 최근 ${number(data.maxDays)}일`;
  }
  $('trend-period').textContent=period;
  $('trend-body').replaceChildren();
  const hasData=days.some(day=>trendMetrics.some(([key])=>day[key]>0));
  $('trend-values').hidden=!hasData;
  if(!hasData){
    $('trend-cards').replaceChildren(text('p',days.length?'표시 기간에 수집된 활동이 없습니다.':'조회 시점에 도달한 날짜가 없습니다.','empty trend-empty'));
    return;
  }
  $('trend-cards').replaceChildren(...trendMetrics.map(([key,label,format])=>{
    const values=days.map(d=>d[key]),card=text('figure','','trend-card'),caption=text('figcaption','');
    card.dataset.metric=key;
    caption.append(text('span',label),text('strong',format(values.at(-1))));
    card.append(caption,trendChart(values),text('p',`마지막 날 ${last.slice(5)} · 기간 최고 ${format(Math.max(...values))}`));
    return card;
  }));
  $('trend-body').replaceChildren(...days.map(day=>{
    const row=document.createElement('tr');
    const date=text('th',day.date);
    date.scope='row';
    row.append(date,...trendMetrics.map(([key,,format])=>text('td',format(day[key]))));
    return row;
  }));
}

function paintMetrics(data){
  const s=data.summary||{},selected=Rules.selectedRetention(data),applied=data.filters||{},gameId=applied.gameId;
  const funnel=data.funnel||{},runtime=data.health?.runtimeErrors||{},saves=data.health?.saves||{};
  $('overview').replaceChildren(
    metric('방문 주체',number(s.visitors),'기록을 남긴 고유 이용 주체','visitors'),
    metric('플레이 세션',number(s.playSessions),'선택 기간 내 서버 발급','playSessions'),
    metric('유효 플레이어',number(s.activePlayers),'서버 확인 활성 플레이 10초 기준','activePlayers'),
    metric('활성 플레이 시간',activeTime(s.totalActiveSeconds),'숨김 탭·일시정지·중복 구간 제외','totalActiveSeconds'),
    metric('카드 클릭률',percent(s.ctr),`${number(s.clicks)} 클릭 / ${number(s.impressions)} 가시 노출`,'ctr'),
    metric('실행 오류 세션율',percent(runtime.rate),`${number(runtime.sessions)} 오류 세션 / ${number(s.playSessions)} 시작`,'runtimeErrorRate')
  );
  paintTrends(data.dailyTrend,applied,data.dataset==='demo');
  const stages=[
    ['세션 시작',funnel.started,funnel.started?1:null,'playSessions'],
    ['게임 준비',funnel.ready,funnel.readyRate,'readySessions'],
    ['10초 플레이',funnel.active10s,funnel.active10sRate,'active10sSessions'],
    ['60초 플레이',funnel.active60s,funnel.active60sRate,'active60sSessions']
  ];
  $('funnel').replaceChildren(...stages.map(([label,value,ratio,key])=>{
    const box=text('div','','funnel-item'),figures=text('div','','funnel-value'),bar=text('div','','bar');
    const fill=document.createElement('span');
    box.dataset.metric=key;
    fill.style.width=`${(ratio||0)*100}%`;
    bar.setAttribute('aria-hidden','true');
    bar.append(fill);
    figures.append(text('strong',number(value)),text('span',percent(ratio)));
    box.append(text('small',label),figures,bar);
    return box;
  }));
  $('journey-summary').replaceChildren(...[
    ['카드 가시 노출',s.impressions,`${number(s.clicks)}회 카드 클릭`,'impressions'],
    ['라운드 완료 기록',s.roundsCompleted,'라운드를 보고하는 게임 기준','roundsCompleted'],
    ['서버 저장 성공',saves.successes??s.saveWrites,`복원 ${number(saves.restores)}건 포함 · 시도·실패 미수집`,'saveWrites'],
    ['찜 추가',s.wishlistAdds,`찜 해제 ${number(s.wishlistRemovals)}회`,'wishlistAdds']
  ].map(([label,value,detail,key])=>metric(label,number(value),detail,key)));
  $('retention-cards').replaceChildren(...[1,7,30].map(day=>{const r=selected['d'+day]||{},box=text('div','','retention-card');box.dataset.metric='d'+day;box.append(text('span','D'+day,'day'),text('strong',r.eligible?Rules.rateText(r.rate,'대상 없음'):'집계 대기'),text('p',r.eligible?`${number(r.retained)} / ${number(r.cohortSize)}명`:'확정 가능한 코호트가 없습니다'));return box;}));
  $('cohort-body').replaceChildren(...(selected.cohorts||[]).map(r=>{const tr=document.createElement('tr');for(const v of [r.cohortDate,'D'+r.day,number(r.cohortSize),r.eligible?number(r.retained):'—',r.eligible?Rules.rateText(r.rate,'대상 없음'):'—',r.eligible?'확정':'집계 대기'])tr.append(text('td',v));return tr;}));
  if(!selected.cohorts?.length){const tr=document.createElement('tr'),td=text('td','선택한 최초 플레이 기간에 해당하는 코호트가 없습니다.','empty');td.colSpan=6;tr.append(td);$('cohort-body').append(tr);}
  const period=!applied.from&&!applied.to?'전체 기간':`${applied.from||'최초 기록'} – ${applied.to||'현재'}`;
  $('metrics-scope').textContent=data.dataset==='demo'?'독립 가상 예제 · 고정된 계산 검증 데이터 · 기간·게임 필터 미적용':`${datasetLabels[data.dataset]} · ${period} (KST, 양 끝 날짜 포함) · ${gameId?gameTitle(gameId):'전체 게임'} · QA와 실제 이용 기록은 별도 집계`;
  $('retention-scope').textContent=`${data.retentionScope==='game'?gameTitle(gameId)+'의':'플랫폼 전체의'} 첫 유효 플레이 코호트 · 날짜 필터는 최초일 기준`;
  $('updated').textContent=data.asOf?kstStamp(data.asOf)+' 기준':'';
  return data.games||[];
}
function paintGameFilter(games){const selected=$('metrics-game').value;$('metrics-game').replaceChildren();const all=document.createElement('option');all.value='';all.textContent='전체 게임';$('metrics-game').append(all);for(const g of games){const option=document.createElement('option');option.value=g.id;option.textContent=gameTitle(g.id)+(g.enabled?'':' · 비공개');$('metrics-game').append(option);}$('metrics-game').value=selected;}
const sortButtons=[...$('games').querySelectorAll('button[data-sort]')];
const gameCollator=()=>new Intl.Collator(locale(),{numeric:true,sensitivity:'base'});
function sortValue(row,key){
  if(key==='title')return row.title;
  if(key==='readyRate')return row.metrics.funnel?.readyRate;
  if(key==='errorRate')return row.metrics.health?.runtimeErrors?.rate;
  return row.metrics[key];
}

function paintGameRows(){
  if(!gameRows)return;
  const query=$('game-search').value.trim().toLocaleLowerCase(locale());
  const collator=gameCollator();
  const {key,direction}=gameSort,order=direction==='ascending'?1:-1;
  const shown=gameRows.filter(row=>[row.game.id,row.title].some(value=>value.toLocaleLowerCase(locale()).includes(query)));
  shown.sort((a,b)=>{
    const left=sortValue(a,key),right=sortValue(b,key);
    if(left==null)return right==null?collator.compare(a.title,b.title):1;
    if(right==null)return -1;
    const comparison=key==='title'?collator.compare(left,right):left-right;
    return order*comparison||collator.compare(a.title,b.title);
  });
  for(const button of sortButtons){
    const indicator=button.querySelector('span');
    if(button.dataset.sort===key){
      button.parentElement.setAttribute('aria-sort',direction);
      indicator.textContent=direction==='ascending'?'↑':'↓';
    }else{
      button.parentElement.removeAttribute('aria-sort');
      indicator.textContent='↕';
    }
  }
  $('games-result').textContent=`게임 ${number(shown.length)} / ${number(gameRows.length)}개`;
  if(!shown.length){
    const row=document.createElement('tr'),cell=text('td','검색 조건에 맞는 게임이 없습니다.','empty');
    cell.colSpan=sortButtons.length+2;
    row.append(cell);
    $('games-body').replaceChildren(row);
    return;
  }
  $('games-body').replaceChildren(...shown.map(({game,title,metrics:m})=>{
    const tr=document.createElement('tr'),name=document.createElement('th');
    name.scope='row';
    tr.dataset.gameId=game.id;
    name.append(text('strong',title),text('small',game.id));
    tr.append(name);
    const progress=m.funnel||{},errors=m.health?.runtimeErrors||{};
    const columns=[
      [number(m.plays),`10초 도달 ${number(progress.active10s)}`],
      [number(m.activePlayers)],
      [activeTime(m.totalActiveSeconds??0)],
      [activeTime(m.averageActiveSeconds)],
      [percent(progress.readyRate),`${number(progress.ready)} / ${number(m.plays)}`],
      [percent(errors.rate),`${number(errors.sessions)} / ${number(m.plays)}`],
      [percent(m.ctr),`${number(m.clicks)} / ${number(m.impressions)}`],
      [number(m.wishlistAdds),`해제 ${number(m.wishlistRemovals)}`]
    ];
    for(const [value,detail] of columns){
      const cell=text('td',value,'game-number');
      if(detail)cell.append(text('small',detail));
      tr.append(cell);
    }
    const status=document.createElement('td');
    status.append(text('span',game.enabled?'공개':'비공개','badge'+(game.enabled?'':' off')));
    tr.append(status);
    const action=document.createElement('td');
    const button=text('button',game.enabled?'비공개로 전환':'공개로 전환','toggle');
    button.disabled=dataset!=='live';
    button.dataset.testid='game-visibility-toggle';
    button.dataset.gameId=game.id;
    button.title=dataset==='live'?'실제 공개 상태를 변경합니다.':'실제 이용 기록 탭에서 공개 상태를 변경할 수 있습니다.';
    button.addEventListener('click',async()=>{
      if(dataset!=='live'||busy)return;
      if(!confirm(`${title}을(를) ${game.enabled?'비공개':'공개'} 상태로 변경할까요?`))return;
      button.disabled=true;
      try{
        await api('/api/admin/games/'+encodeURIComponent(game.id),{method:'PATCH',body:{enabled:!game.enabled}});
        notice('게임 공개 상태를 변경했습니다. 사용자 목록과 새 실행 요청에 반영됩니다.');
        await refresh();
      }catch(error){
        if(error.status===401||(error.status===403&&error.code==='CSRF_INVALID'))showSession({authenticated:false});
        notice(error.message,true);
        button.disabled=false;
      }
    });
    action.append(button);
    tr.append(action);
    return tr;
  }));
}
function paintGames(games,metrics,gameId){
  const byId=new Map(metrics.map(g=>[g.id,g]));
  gameRows=games.filter(g=>!gameId||g.id===gameId).map(game=>({game,title:gameTitle(game.id),metrics:byId.get(game.id)||{}}));
  paintGameRows();
}
function paintActivity(element,items,kind){
  if(!items?.length){
    const message=kind==='audit'?'아직 운영 변경 기록이 없습니다.':dataset==='demo'?'오류 상세 기록은 실제 이용 기록과 QA 실행 기록에서 확인할 수 있습니다.':'선택한 데이터·기간·게임의 실행 오류가 없습니다.';
    element.replaceChildren(text('div',message,'empty'));
    return;
  }
  element.replaceChildren(...items.slice(0,30).map(item=>{const row=text('div','','activity');row.append(text('strong',kind==='error'?`${item.code||'오류'} · ${item.gameId||'플랫폼'}`:`${item.action} · ${item.target||'서비스'}`),text('p',kind==='error'?item.message:typeof item.detail==='string'?item.detail:JSON.stringify(item.detail||{})),text('time',kstStamp(item.createdAt)));return row;}));
}
function updateControls(){
  for(const value of ['live','qa','demo']){$(value).classList.toggle('active',dataset===value);$(value).setAttribute('aria-pressed',String(dataset===value));$(value).disabled=busy;}
  $('refresh').disabled=busy;
  for(const id of ['metrics-from','metrics-to','metrics-game','metrics-apply','metrics-last7','metrics-last30','metrics-reset'])$(id).disabled=busy||dataset==='demo';
  for(const days of [7,30]){
    const active=dataset!=='demo'&&filters.to===kstToday()&&filters.from===kstToday(days-1);
    $(`metrics-last${days}`).setAttribute('aria-pressed',String(active));
  }
  $('demo-banner').hidden=dataset!=='demo';$('qa-banner').hidden=dataset!=='qa';
}
async function refresh(){
  if(!authenticated||busy)return;let query;try{query=Rules.metricsQuery(dataset,filters);}catch(error){notice(error.message,true);return;}busy=true;updateControls();const token=generation;
  try{
    const responses=await Promise.all([api('/api/admin/metrics?'+query),api('/api/admin/games'),api('/api/admin/errors?'+query),api('/api/admin/audit')]);
    if(!authenticated||token!==generation)return;if(responses[0].dataset!==dataset)throw new Error('요청한 데이터 종류와 응답이 달라 표시를 중단했습니다.');
    catalog=responses[1].games||[];paintCommunityGames();if(!communityLoaded&&!communityBusy)void refreshCommunity(0);paintGameFilter(catalog);paintGames(catalog,paintMetrics(responses[0]),responses[0].filters?.gameId);paintActivity($('errors-list'),responses[2].errors,'error');paintActivity($('audit-list'),responses[3].audit,'audit');
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
for(const value of ['live','qa','demo'])$(value).addEventListener('click',()=>{
  if(busy||dataset===value)return;
  dataset=value;
  clearDashboard();
  $('metrics-scope').textContent='자료를 불러오는 중입니다.';
  notice('');
  updateControls();
  refresh();
});
function applyFilters(from,to){
  if(busy||dataset==='demo')return;
  const next={from,to,gameId:$('metrics-game').value};
  try{
    Rules.metricsQuery(dataset,next);
    filters=next;
    $('metrics-from').value=from;
    $('metrics-to').value=to;
    notice('');
    refresh();
  }catch(error){notice(error.message,true);}
}
$('metrics-filters').addEventListener('submit',event=>{
  event.preventDefault();
  applyFilters($('metrics-from').value,$('metrics-to').value);
});
for(const days of [7,30])$(`metrics-last${days}`).addEventListener('click',()=>applyFilters(kstToday(days-1),kstToday()));
$('metrics-reset').addEventListener('click',()=>applyFilters('',''));
$('game-search').addEventListener('input',paintGameRows);
for(const button of sortButtons)button.addEventListener('click',()=>{
  const key=button.dataset.sort;
  const direction=gameSort.key===key?(gameSort.direction==='ascending'?'descending':'ascending'):key==='title'?'ascending':'descending';
  gameSort={key,direction};
  paintGameRows();
});

const languageSelect=$('language-select');
const communityStatuses={open:'접수됨',planned:'반영 예정',completed:'반영 완료',declined:'보류'};
function communityRaw(tag,value){const node=text(tag,value);node.dataset.noTranslate='';node.setAttribute('translate','no');return node;}
function paintCommunityGames(){
  const selected=$('community-game').value;
  $('community-game').replaceChildren(new Option('전체 게임',''),...catalog.map(game=>new Option(gameTitle(game.id),game.id)));
  if(catalog.some(game=>game.id===selected))$('community-game').value=selected;
}
async function refreshCommunity(offset=0){
  if(!authenticated)return;
  const request=++communityRequest,sessionGeneration=generation;
  communityBusy=true;$('community-message').textContent='커뮤니티 글을 불러오는 중입니다.';
  $('community-prev').disabled=true;$('community-next').disabled=true;
  const query=new URLSearchParams({kind:$('community-kind').value,visibility:$('community-visibility').value,offset:String(offset),limit:'20'});
  if($('community-game').value)query.set('gameId',$('community-game').value);
  try{
    const result=await api('/api/admin/community?'+query);
    if(request!==communityRequest||sessionGeneration!==generation||!authenticated)return;
    communityLoaded=true;communityOffset=offset;
    $('community-list').replaceChildren(...result.items.map(paintCommunityPost));
    $('community-message').textContent=result.total?`전체 ${result.total}개 글`:'아직 작성된 글이 없습니다.';
    $('community-prev').disabled=offset===0;$('community-next').disabled=!result.hasMore;
  }catch(error){
    if(request!==communityRequest||sessionGeneration!==generation)return;
    $('community-list').replaceChildren();
    $('community-message').textContent='커뮤니티 글을 불러오지 못했습니다. 다시 시도해 주세요.';
    if(error.status===401||(error.status===403&&error.code==='CSRF_INVALID'))showSession({authenticated:false});
  }finally{if(request===communityRequest)communityBusy=false;}
}
function paintCommunityPost(item){
  const article=text('article','','community-post');article.dataset.postId=item.id;
  const header=text('div','','section-heading');header.append(text('strong',gameTitle(item.gameId)),text('span',item.kind==='suggestion'?'개선 제안':'댓글','community-badge'),text('span',item.hidden?'숨김':'공개','community-badge'));
  article.append(header,item.authorName==='Guest'?text('p','게스트'):communityRaw('p',item.authorName),text('time',kstStamp(item.createdAt)));
  if(item.title)article.append(communityRaw('h3',item.title));
  const body=communityRaw('p',item.body);body.className='community-body';article.append(body);
  article.append(text('p',`신고 ${item.reportCount||0}건 · 공감 ${item.voteCount||0}개`,'muted'));
  if(item.reports?.length){const details=document.createElement('details');details.append(text('summary','신고 사유 보기'));for(const report of item.reports){const entry=communityRaw('p',report.reason);entry.className='community-body';details.append(entry,text('time',kstStamp(report.createdAt)));}article.append(details);}
  const form=document.createElement('form');form.className='community-actions';
  const hiddenLabel=text('label','공개 상태');const hidden=document.createElement('select');hidden.name='visibility';hidden.setAttribute('aria-label','공개 상태');hidden.append(new Option('공개','visible'),new Option('숨김','hidden'));hidden.value=item.hidden?'hidden':'visible';hiddenLabel.append(hidden);form.append(hiddenLabel);
  let status;
  if(item.kind==='suggestion'){const label=text('label','제안 상태');status=document.createElement('select');status.name='status';status.setAttribute('aria-label','제안 상태');for(const [value,title]of Object.entries(communityStatuses))status.append(new Option(title,value));status.value=item.status;label.append(status);form.append(label);}
  const save=text('button','변경 저장','primary');save.type='submit';save.dataset.testid='admin-community-save';form.append(save);
  const message=text('span','');message.setAttribute('role','status');form.append(message);
  form.addEventListener('submit',async event=>{
    event.preventDefault();const token=generation;const request=communityRequest;
    save.disabled=true;hidden.disabled=true;if(status)status.disabled=true;
    try{
      await api('/api/admin/community/'+encodeURIComponent(item.id),{method:'PATCH',body:{hidden:hidden.value==='hidden',...(status?{status:status.value}:{})}});
      if(token===generation&&request===communityRequest&&authenticated)await refreshCommunity(communityOffset);
    }catch(error){
      if(token!==generation||request!==communityRequest)return;
      message.textContent='변경을 저장하지 못했습니다. 다시 시도해 주세요.';
      if(error.status===401||(error.status===403&&error.code==='CSRF_INVALID'))showSession({authenticated:false});
    }finally{save.disabled=false;hidden.disabled=false;if(status)status.disabled=false;}
  });article.append(form);return article;
}
$('community-filters').addEventListener('submit',event=>{event.preventDefault();void refreshCommunity(0);});
$('community-prev').addEventListener('click',()=>{if(!communityBusy)void refreshCommunity(Math.max(0,communityOffset-20));});
$('community-next').addEventListener('click',()=>{if(!communityBusy)void refreshCommunity(communityOffset+20);});
const supportedLanguages=new Set([...languageSelect.options].map(option=>option.value));
function setLanguage(language){
  if(!supportedLanguages.has(language))return;
  document.documentElement.lang=language;
  languageSelect.value=language;
  try{localStorage.setItem('playhub.locale',language);}catch{}
  document.dispatchEvent(new CustomEvent('playhub:locale-change',{bubbles:true,detail:{locale:language}}));
}
setLanguage(globalThis.PlayHubLocale?.locale||'ko');
languageSelect.addEventListener('change',()=>{
  setLanguage(languageSelect.value);
  if(authenticated)refresh();
});

const submissionReview=createSubmissionReview({api,kstStamp,onSessionExpired:()=>showSession({authenticated:false}),onDecision:refresh});
try{
  let session=await api('/api/admin/session');
  if(localLoginToken){
    csrf=session.csrfToken;
    try{session=await api('/api/admin/local-login',{method:'POST',body:{token:localLoginToken}});}
    catch{if(!session.authenticated)notice('로컬 자동 로그인에 실패했습니다. 관리자 비밀번호로 로그인하거나 런처를 다시 열어 주세요.',true);}
  }
  showSession(session);
  if(authenticated)await refresh();
}catch(error){$('session-label').textContent='연결 실패';$('login-panel').hidden=false;notice('관리 API 연결을 확인해 주세요. 서버가 준비되면 관리자 로그인을 다시 누를 수 있습니다. '+error.message,true);}
finally{localLoginToken=undefined;}
refreshTimer=setInterval(()=>{if(!document.hidden)refresh();},30000);window.addEventListener('pagehide',()=>clearInterval(refreshTimer));
