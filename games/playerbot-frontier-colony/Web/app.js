import { ColonyGame, BUILDINGS, RESOURCE_LABELS, JOB_LABELS, RESEARCH, SCHEDULE_MODES, SCHEDULE_PRESETS, RECIPES, EQUIPMENT, TRADE_PRICES } from './engine.js?v=4.0.0';
import { ColonyRenderer } from './renderer.js?v=4.0.0';
import { createColonyBotController } from './colony-bot.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} aria-hidden="true"><use href="#i-${name}"/></svg>`;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pct = n => Math.round(clamp(Number(n) || 0, 0, 100));
const SAVE_KEY = 'frontier-colony-save-v1';
const PREFS_KEY = 'frontier-colony-preferences';
const RECOVERY_KEY = 'frontier-colony-recovery';
const WEATHER = {clear:'맑음',rain:'비',heat:'폭염',cold:'한파'};
const TERRAIN = {grass:'풀밭',soil:'비옥한 토양',water:'강',stone:'암반'};
const FEATURE = {tree:'나무',berry:'야생 열매',ore:'강철 광맥'};
const RES_ICONS = {wood:'wood',steel:'steel',rawfood:'leaf',meals:'food',medicine:'medicine',silver:'coin',rifle:'rifle',armor:'armor',tool:'craft'};
const BUILD_ICONS = {wall:'wall',door:'door',bed:'bed',stove:'stove',sandbag:'shield',beacon:'beacon',researchbench:'research',solar:'solar',battery:'battery',conduit:'cable',heater:'heat',cooler:'snow',horseshoes:'recreation',workbench:'craft'};
const SCHEDULE_LABELS = {anything:'자율',work:'작업',sleep:'수면',recreation:'여가'};
const SCHEDULE_ICONS = {anything:'sun',work:'axe',sleep:'bed',recreation:'recreation'};
const PRESET_LABELS = {balanced:'균형 생활',night:'야간 작업',free:'자율 생활'};
const UTILITY_TYPES = new Set(['solar','battery','conduit','heater','cooler']);
const ui = {
  speed:1,lastSpeed:1,category:'orders',tool:'select',pane:'colony',selectedId:null,selectedTile:null,
  hover:null,showGrid:false,showZones:true,drag:null,keys:new Set(),interacting:false,
  selectedIds:[],layer:'normal',previewTiles:[],autoPause:true,hadRaid:false,hadFire:false,downedIds:new Set(),persistenceBlocked:false,
  scheduleBrush:'work',schedulePawnId:null,tradeSide:'buy',tradeItem:'medicine',tradeCount:1,seenTraderId:null,
  dialogSpeed:null,seenVictory:false,seenGameOver:false,lastLogId:null,saveTime:0,errorTime:0,
};
let game;
let renderer;
let colonyBot = null;
let frameTime = 0;
let lastUiTime = 0;
let restored = false;
const canvas = $('#world');
const dialog = $('#dialog');
const pointers = new Map();
let pinch = null;
let recoverySave = null;

const buildingTool = ([id,b]) => ({id:`build:${id}`,label:b.label,icon:BUILD_ICONS[id]||'wall',hint:`${b.label} 건설 위치를 선택하세요. 주민이 자재를 운반해 건설합니다.`,sub:Object.entries(b.cost).map(([r,n])=>`${RESOURCE_LABELS[r]} ${n}`).join(' · '),tech:b.tech,cost:b.cost});

const toolsByCategory = {
  orders:[
    {id:'select',label:'선택',icon:'select',hint:'주민이나 지형을 선택하세요',sub:'이동 · 살펴보기'},
    {id:'gather',label:'채집 지정',icon:'axe',hint:'나무·열매·광맥 위를 드래그해 작업을 지정하세요',sub:'벌목 · 수확 · 채광'},
    {id:'draft-all',label:'전체 징집',icon:'shield',hint:'정착민 모두를 전투에 배치합니다',sub:'전투 / 작업 복귀'},
    {id:'hold',label:'위치 사수',icon:'hold',hint:'선택한 징집 주민의 이동을 멈추고 현재 위치에서 방어합니다',sub:'이동 중단 · 경계'},
    {id:'care',label:'의료·소방',icon:'medicine',hint:'부상자 구조·치료와 화재 대응을 관리합니다',sub:'동료를 구하기'},
    {id:'prioritize',label:'우선 작업',icon:'prioritize',hint:'주민 선택 후 불·청사진·지정 자원·농지·손상 건물을 눌러 먼저 처리할 일을 정하세요',sub:'선택 주민에게 지시'},
    {id:'cancel',label:'지정 취소',icon:'cancel',hint:'취소할 청사진·작업·구역을 선택하세요. 청사진 재료는 돌려받습니다.',sub:'청사진 · 구역'},
    {id:'demolish',label:'건물 철거',icon:'wall',hint:'완성된 건물을 철거합니다. 일부 재료를 돌려받습니다.',sub:'일부 재료 회수'},
    {id:'pan',label:'지도 이동',icon:'focus',hint:'드래그해 지도를 이동하세요',sub:'드래그'},
  ],
  build:Object.entries(BUILDINGS).filter(([id])=>!UTILITY_TYPES.has(id)).map(buildingTool),
  utilities:Object.entries(BUILDINGS).filter(([id])=>UTILITY_TYPES.has(id)).map(buildingTool),
  zones:[
    {id:'zone:farm',label:'농사 구역',icon:'leaf',hint:'드래그해 사각형 농지를 정하세요. 손을 떼면 구역을 지정합니다.',sub:'영역 드래그'},
    {id:'zone:stockpile',label:'창고 구역',icon:'box',hint:'드래그해 사각형 창고를 정하세요. 냉각한 실내에서는 음식을 오래 보관합니다.',sub:'영역 드래그'},
    {id:'cancel',label:'구역 지우기',icon:'cancel',hint:'지울 구역을 선택하세요. 청사진이나 작업 지정도 함께 취소됩니다.',sub:'지정 해제'},
  ],
};

function toast(message, type = 'info', duration = 3300) {
  if (!message) return;
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('#toasts').append(node);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
  setTimeout(() => { node.classList.add('out'); setTimeout(() => node.remove(), 250); }, duration);
}

function setContent(node, content) {
  if (node._html === content) return;
  const scroll = node.scrollTop;
  const focused=document.activeElement;
  const scheduleFocus=node.contains?.(focused)&&focused?.dataset
    ? Object.entries(focused.dataset).filter(([key])=>/^(schedule|bill|trade|gear|equip|unequip)/.test(key)) : [];
  node.innerHTML = content;
  node._html = content;
  node.scrollTop = scroll;
  if(scheduleFocus.length){const replacement=[...node.querySelectorAll('button')].find(button=>scheduleFocus.every(([key,value])=>button.dataset[key]===value));replacement?.focus({preventScroll:true});}
}

function setSpeed(speed) {
  const autoOn = Boolean(colonyBot?.isAutoPlayMode?.()) && !game?.state?.gameOver && !game?.state?.victory;
  let nextSpeed = Number(speed);
  if (autoOn && nextSpeed <= 0) {
    nextSpeed = Math.max(0.5, Number(ui.lastSpeed) || 5);
  }
  ui.speed = nextSpeed;
  if (ui.speed > 0) ui.lastSpeed = ui.speed;
  $$('[data-speed]').forEach(b => {
    const val = Number(b.dataset.speed);
    const active = val === ui.speed;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
    if (val === 0) {
      b.disabled = autoOn;
      b.hidden = autoOn;
    }
  });
  $('#paused-badge').hidden = autoOn || ui.speed !== 0;
}

function setPane(pane, openMobile = false) {
  ui.pane = pane;
  $$('[data-pane]').forEach(b => {
    b.classList.toggle('active', b.dataset.pane === pane);
    b.setAttribute('aria-selected', String(b.dataset.pane === pane));
  });
  if (openMobile) $('#app').classList.add('show-panel');
  renderSidebar();
}

function selectedPawns() {
  return game.state.colonists.filter(p=>!p.dead&&ui.selectedIds.includes(p.id));
}

function selectPawn(id, focus = false, additive = false) {
  ui.selectedIds=additive ? ui.selectedIds.includes(id)?ui.selectedIds.filter(p=>p!==id):[...ui.selectedIds,id] : [id];
  ui.selectedId = ui.selectedIds.includes(id)?id:ui.selectedIds[0]||null;
  ui.selectedTile = null;
  setPane('inspect');
  const pawn = game.state.colonists.find(p => p.id === id);
  if (focus && pawn) renderer.focus(pawn.x, pawn.y);
  renderUI();
  updateToolHint();
}

function setCategory(category) {
  ui.category = category;
  if(!toolsByCategory[category].some(t=>t.id===ui.tool)){ui.tool='select';canvas.dataset.tool='select';updateToolHint();}
  $$('[data-category]').forEach(b => b.classList.toggle('active', b.dataset.category === category));
  renderTools();
}

function setTool(tool) {
  if(tool==='prioritize'&&!selectedPawns().length){toast('먼저 아래 카드에서 작업할 주민을 선택하세요.','info');return;}
  ui.tool = tool;
  canvas.dataset.tool = tool;
  renderTools();
  updateToolHint();
}

function getTool() {
  return Object.values(toolsByCategory).flat().find(t => t.id === ui.tool) || toolsByCategory.orders[0];
}

function updateToolHint() {
  const selected = game?.state.colonists.find(p=>p.id===ui.selectedId && !p.dead);
  const drafted=game?selectedPawns().filter(p=>p.drafted):[];
  const tool = getTool();
  const hint = ui.tool === 'select' && drafted.length
    ? `${drafted.length>1?drafted.length+'명 선택':drafted[0].name} · 땅을 눌러 대형 이동, 적을 눌러 집중 공격`
    : tool.hint;
  setContent($('#tool-hint'), `${icon(selected?.drafted && ui.tool==='select'?'shield':tool.icon)}<span>${esc(hint)}</span>${ui.tool==='select'&&!selected?.drafted?'<kbd>드래그 · 지도 이동</kbd>':''}`);
  $('#active-tool-label').textContent = tool.label + ' 모드';
}

function renderTools() {
  const allDrafted = game?.state.colonists.filter(p=>!p.dead).every(p=>p.drafted);
  setContent($('#tool-list'), toolsByCategory[ui.category].map(t => {
    const locked=t.tech&&!game?.state.research?.unlocked.includes(t.tech);
    const short=t.cost&&Object.entries(t.cost).some(([r,n])=>(game?.state.resources[r]||0)<n);
    const sub=locked?`${RESEARCH[t.tech]?.label||t.tech} 필요`:t.sub;
    return `<button class="tool ${ui.tool===t.id?'active':''} ${t.id==='demolish'?'negative':''} ${locked?'locked':''} ${short?'unaffordable':''}" data-tool="${t.id}" aria-pressed="${ui.tool===t.id}" title="${esc(t.hint)}${sub?' / '+esc(sub):''}">${icon(locked?'lock':t.icon)}<span>${t.id==='draft-all'&&allDrafted?'전체 해제':esc(t.label)}</span><small>${esc(sub)}</small></button>`;
  }).join(''));
}

function execute(type, payload, {silent=false,success=false} = {}) {
  const result = game.command(type, payload);
  if (!result.ok && !silent && performance.now()-ui.errorTime > 600) {
    ui.errorTime = performance.now();
    toast(result.message || '이곳에는 명령을 내릴 수 없습니다.', 'error');
  } else if (result.ok && success && !silent) toast(result.message || '명령을 전달했습니다.');
  lastUiTime = 0;
  return result;
}

function draftAll() {
  const living = game.state.colonists.filter(p=>!p.dead&&p.health>=15);
  if (!living.length) return;
  const value = !living.every(p=>p.drafted);
  living.forEach(p=>execute('draft',{id:p.id,value},{silent:true}));
  ui.selectedIds=living.map(p=>p.id);ui.selectedId=living[0].id;
  setTool('select');
  toast(value ? `${living.length}명을 징집하고 선택했습니다. 땅을 누르면 대형을 갖춰 함께 이동합니다.` : '징집을 해제했습니다. 주민들이 맡은 작업으로 돌아갑니다.', value?'info':'success', 4500);
  renderUI();
}

function actorAt(tile) {
  const near = a => !a.dead && Math.hypot(a.x-(tile.x+.5),a.y-(tile.y+.5))<.95;
  return game.state.colonists.find(near) || game.state.raiders.find(near);
}

function selectAt(tile, orderOnly = false, additive = false) {
  const target = actorAt(tile);
  const visitor=game.state.trade.visitor;
  if(!target&&!orderOnly&&visitor&&Math.hypot(visitor.x-tile.x-.5,visitor.y-tile.y-.5)<.85){setPane('trade',true);return;}
  const selected = game.state.colonists.find(p=>p.id===ui.selectedId&&!p.dead);
  const drafted=selectedPawns().filter(p=>p.drafted);
  if (target && game.state.colonists.includes(target) && !orderOnly) {
    selectPawn(target.id,false,additive);
  } else if (drafted.length) {
    if (target && game.state.raiders.includes(target)) {
      let count=0;drafted.forEach(p=>{if(execute('attack',{id:p.id,targetId:target.id},{silent:true}).ok)count++;});
      if(count)toast(`${count}명이 선택한 적을 집중 공격합니다.`);
    }else if(drafted.length>1)execute('moveGroup',{ids:drafted.map(p=>p.id),x:tile.x,y:tile.y});
    else execute('move',{id:drafted[0].id,x:tile.x,y:tile.y});
  } else if(orderOnly&&selected){
    execute('prioritize',{id:selected.id,...tile},{success:true});
  } else if (!orderOnly) {
    ui.selectedId=target?.id || null;
    ui.selectedIds=[];
    ui.selectedTile=tile;
    setPane('inspect');
    updateToolHint();
  }
}

function applyTool(tile, silent = false) {
  if (!tile || ui.tool==='pan') return;
  if (ui.tool==='select') { selectAt(tile); return; }
  const [type,kind] = ui.tool.split(':');
  if (type==='build') execute('build',{...tile,kind},{silent});
  else if (type==='zone') execute('zone',{...tile,kind},{silent});
  else if (type==='gather') execute('designate',{...tile,kind:'gather'},{silent});
  else if (type==='prioritize') execute('prioritize',{id:ui.selectedId,...tile},{silent,success:true});
  else if (type==='cancel'||type==='demolish') execute(type,tile,{silent});
}

function rectangleTiles(from,to){
  const tiles=[];
  for(let y=Math.min(from.y,to.y);y<=Math.max(from.y,to.y);y++)for(let x=Math.min(from.x,to.x);x<=Math.max(from.x,to.x);x++)tiles.push({x,y});
  return tiles;
}

function setLayer(layer){
  ui.layer=ui.layer===layer?'normal':layer;
  $('#temperature-layer').classList.toggle('active',ui.layer==='temperature');
  $('#power-layer').classList.toggle('active',ui.layer==='power');
  $('#temperature-layer').setAttribute('aria-pressed',String(ui.layer==='temperature'));
  $('#power-layer').setAttribute('aria-pressed',String(ui.layer==='power'));
  const legend=$('#layer-legend');legend.hidden=ui.layer==='normal';
  legend.innerHTML=ui.layer==='temperature'?`${icon('thermometer')}<div><b>온도 · 자동 지붕</b><span class="temperature-spectrum"></span><small>냉장 0°C · 쾌적 21°C · 고온 38°C</small></div>`:`${icon('power')}<div><b>전력 연결망</b><small><i class="legend-dot powered"></i>전력 공급 <i class="legend-dot offline"></i>공급 없음</small><small>설비는 전력선에서 3칸 이내 연결</small></div>`;
}

function paintLine(from, to) {
  const distance = Math.max(Math.abs(to.x-from.x),Math.abs(to.y-from.y));
  for(let i=1;i<=distance;i++) applyTool({x:Math.round(from.x+(to.x-from.x)*i/distance),y:Math.round(from.y+(to.y-from.y)*i/distance)},true);
}

function renderResources() {
  const r=game.state.resources;
  setContent($('#resource-list'), ['wood','steel','rawfood','meals','medicine','silver'].map(key=>`<div class="resource ${key}" title="${esc(RESOURCE_LABELS[key])}: 창고에 보관된 수량${key==='rawfood'?' · 조리하면 식사가 됩니다.':key==='silver'?' · 교역 대금은 운반 후 반영됩니다.':''}">${icon(RES_ICONS[key])}<span><span class="resource-label">${esc(RESOURCE_LABELS[key])}</span><strong class="resource-value ${key==='meals'&&r[key]<5?'low':''}">${Math.floor(r[key]||0)}</strong></span></div>`).join(''));
}

function renderDock() {
  const dock=$('#colonist-dock');
  if (dock.dataset.ids !== game.state.colonists.map(p=>p.id).join(',')) {
    dock.innerHTML=game.state.colonists.map(p=>`<button class="pawn-card" data-pawn="${esc(p.id)}" title="${esc(p.name)} 선택 · 두 번 클릭하면 위치로 이동"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span class="pawn-info"><span class="pawn-heading"><b>${esc(p.name)}</b><small>${esc(p.role)}</small><span class="draft-tag" hidden>징집</span></span><span class="pawn-status"></span><span class="mini-needs"><span class="mini-bar health"><i></i></span><span class="mini-bar hunger"><i></i></span><span class="mini-bar energy"><i></i></span></span></span><span class="pawn-health"></span></button>`).join('');
    dock.dataset.ids=game.state.colonists.map(p=>p.id).join(',');
  }
  game.state.colonists.forEach((p,i)=>{
    const card=dock.children[i];
    card.classList.toggle('selected',ui.selectedIds.includes(p.id));
    card.classList.toggle('dead',p.dead);
    card.setAttribute('aria-pressed',String(ui.selectedIds.includes(p.id)));
    $('.pawn-status',card).textContent=p.dead?'사망':p.status||'주변을 살피는 중';
    $('.draft-tag',card).hidden=!p.drafted;
    const hp=$('.pawn-health',card);hp.textContent=p.dead?'—':`${pct(p.health)}%`;hp.classList.toggle('hurt',p.health<65);
    ['health','hunger','energy'].forEach(k=>{
      const bar=$(`.mini-bar.${k}`,card);$('i',bar).style.width=pct(p[k])+'%';bar.classList.toggle('low',p[k]<25);
      bar.title=`${{health:'건강',hunger:'포만',energy:'휴식'}[k]} ${pct(p[k])}%`;
    });
  });
}

function objectiveHtml(o,index) {
  return `<div class="objective ${o.done?'done':''}"><span class="objective-check">${o.done?icon('check'):String(index+1).padStart(2,'0')}</span><div><strong>${esc(o.label)}</strong><p>${esc(o.detail)}</p>${!o.done&&o.progress>0?`<div class="progress-track"><i style="width:${pct(o.progress*100)}%"></i></div>`:''}</div></div>`;
}

function colonyPane() {
  const s=game.getSummary(), state=game.state;
  const objectives=game.getObjectives();
  const complete=objectives.filter(o=>o.done).length;
  const food=Math.max(0,Number(s.foodDays)||0);
  const alert=state.raiders.some(r=>!r.dead);
  const fires=activeFires(),downed=state.colonists.filter(p=>!p.dead&&p.health<15);
  let advice='<strong>거처부터 완성하세요</strong>벽과 문으로 침대 주변을 완전히 둘러싸면 지붕이 생깁니다. 세 번째 침대도 실내에 배치하세요.';
  if(alert)advice='<strong>함께 정착지를 지키세요</strong>전체 징집 후 빈 땅을 누르면 세 사람이 대형을 갖춰 이동합니다. 전투가 끝나면 징집을 해제하세요.';
  else if(downed.length)advice='<strong>동료를 안전한 곳으로 옮기세요</strong>의료·소방 탭에서 구조를 지시하고, 치료 담당과 약품을 준비하세요. 의료 침상을 비워 두면 회복을 도울 수 있습니다.';
  else if(fires.length)advice='<strong>불길을 막아 주세요</strong>소방 담당의 징집을 해제하세요. 의료·소방 탭에서 불이 난 곳을 찾아 우선 진화를 지시할 수 있습니다.';
  else if(food<1)advice='<strong>식량을 먼저 확보하세요</strong>열매를 채집하고 농지를 넓히세요. 냉각한 실내 창고는 음식 부패를 늦춥니다.';
  else if((s.indoorBeds||0)>=3&&!state.research.unlocked.includes('electricity'))advice='<strong>다음은 전기 공학입니다</strong>연구대에서 주민이 실제로 연구합니다. 작업 탭에서 연구 우선순위를 높일 수 있습니다.';
  else if((s.indoorBeds||0)>=3&&!state.research.unlocked.includes('communications'))advice='<strong>발전하고, 다음 연구를 고르세요</strong>태양광과 축전지를 전력선으로 잇고 냉장 보관 또는 장거리 통신을 연구하세요.';
  else if(state.research.unlocked.includes('communications'))advice='<strong>구조 신호를 보내세요</strong>신호기에 전력을 공급하세요. 신호가 절반에 도달하면 마지막 습격이 찾아옵니다. 방어를 마치고 전송을 완료하세요.';
  const power=state.power||{},charge=power.capacity?pct(power.stored/power.capacity*100):0;
  return `<div class="eyebrow">A HOME, THEN A HORIZON</div><h2>${state.victory?'숲 너머로 닿은 신호':'오늘을 넘어, 내일로'}</h2><p class="section-intro">거처를 닫고, 불을 밝히고,<br>우리의 목소리를 먼 곳까지 보내세요.</p>${(fires.length||downed.length)?`<button class="crisis-callout" data-action="show-care">${icon(fires.length?'fire':'rescue')}<span>${downed.length?`쓰러진 주민 ${downed.length}명`:``}${downed.length&&fires.length?' · ':''}${fires.length?`화재 ${fires.length}칸`:``}</span>${icon('arrow')}</button>`:''}<div class="colony-pulse"><button data-action="show-systems">${icon('roof')}<span>실내 침대 <b>${s.indoorBeds||0}/3</b></span></button><button data-action="show-systems">${icon('battery')}<span>저장 전력 <b>${charge}%</b></span></button></div><div class="signal-block"><div class="signal-icon">${icon('beacon')}</div><div class="signal-copy"><strong>구조 신호 <b>${pct(state.beaconProgress*100)}%</b></strong><div class="progress-track"><i style="width:${pct(state.beaconProgress*100)}%"></i></div><p>${state.victory?'구조대가 신호를 확인했습니다.':fires.length?'화재 진압을 기다리며 전송을 멈췄습니다.':state.extractionAlarmTriggered?'마지막 방어를 마치고 전송을 이어가세요.':'안정된 생활과 전력이 신호를 지탱합니다.'}</p></div></div><div class="section-divider"></div><div class="section-head"><h3>정착지의 목표</h3><span>${complete} / ${objectives.length}</span></div><div class="objectives">${objectives.map(objectiveHtml).join('')}</div><div class="section-divider"></div><div class="advice">${advice}</div><div class="button-row"><button class="button ghost" data-action="show-research">${icon('research')}연구 보기</button><button class="button ghost" data-action="show-systems">${icon('power')}설비 보기</button></div><div class="button-row compact"><button class="button ghost" data-action="show-care">${icon('medicine')}의료·소방</button><button class="button ghost" data-action="show-schedule">${icon('clock')}하루 일정</button></div><div class="button-row compact"><button class="button ghost" data-action="show-industry">${icon('craft')}제작·장비</button><button class="button ghost ${state.trade.visitor?.phase==='trading'?'trader-ready':''}" data-action="show-trade">${icon('trade')}${state.trade.visitor?.phase==='trading'?'상인 방문 중':'교역 보기'}</button></div><div class="section-divider"></div><div class="section-head"><h3>생활과 주변 상황</h3><span>${esc(WEATHER[state.weather]||state.weather)}</span></div><div class="colony-facts"><div class="fact"><span>현재 식량의 영양량</span><strong class="${food<1?'danger':''}">약 ${food.toFixed(1)}일분</strong></div><div class="fact"><span>현재 위협</span><strong class="${alert||fires.length||downed.length?'danger':''}">${alert?`습격자 ${state.raiders.filter(r=>!r.dead).length}명`:downed.length?`쓰러진 주민 ${downed.length}명`:fires.length?`화재 ${fires.length}칸`:'주변은 조용합니다'}</strong></div><div class="fact"><span>다음 정기 습격까지</span><strong>${alert?'전투 중':formatDuration(s.nextRaidIn)}</strong></div><div class="fact"><span>버텨 낸 습격</span><strong>${state.stats.survivedRaids}회</strong></div><div class="fact"><span>누적 부패 식량</span><strong>${state.systemStats?.spoiled||0}개</strong></div></div><p class="small-note">식량의 일분 표시는 영양량 기준입니다. 보관 온도에 따른 부패는 별도로 진행됩니다.</p>`;
}

function needHtml(label,value) {
  return `<div class="need ${value<25?'low':''}"><div><span>${label}</span><b>${pct(value)} / 100</b></div><div class="progress-track"><i style="width:${pct(value)}%"></i></div></div>`;
}

function activeFires() {
  return game.state.tiles.filter(t => (t.fire || 0) > 0);
}

function moodFactorsHtml(pawn) {
  const factors=game.getMoodFactors?.(pawn)||[];
  return factors.length?`<div class="mood-factors"><span>기분에 영향을 주는 것</span>${factors.filter(f=>Math.abs(f.value)>.05).map(f=>`<div><span>${esc(f.label)}</span><b class="${f.value<0?'negative':'positive'}">${f.value>0?'+':''}${Number(f.value).toFixed(1)}</b></div>`).join('')}</div>`:'';
}

function careStatus(pawn) {
  if(pawn.carriedBy){const carrier=game.state.colonists.find(p=>p.id===pawn.carriedBy);return `${carrier?.name||'동료'}이(가) 이송 중`;}
  if(pawn.health<15)return pawn.patientBedId?'침상 안정 · 치료 필요':'쓰러짐 · 구조 필요';
  if(pawn.bleed>0)return '출혈 중 · 치료 필요';
  if(pawn.patientBedId)return '침상에서 회복 중';
  return pawn.health<78?'부상 회복 중':'건강 안정';
}

function requestCare(kind,targetId) {
  const patient=game.state.colonists.find(p=>p.id===targetId&&!p.dead);
  if(!patient)return;
  const selected=new Set(ui.selectedIds);
  const candidates=game.state.colonists.filter(p=>!p.dead&&!p.drafted&&p.health>=15&&!p.carriedBy&&!p.carryingPawnId&&(kind!=='rescue'||p.id!==patient.id));
  candidates.sort((a,b)=>Number(selected.has(b.id)&&b.id!==patient.id)-Number(selected.has(a.id)&&a.id!==patient.id)
    ||Math.hypot(a.x-patient.x,a.y-patient.y)-Math.hypot(b.x-patient.x,b.y-patient.y));
  let reason='먼저 건강한 주민의 징집을 해제하세요.';
  for(const worker of candidates){const result=execute(kind,{id:worker.id,targetId},{silent:true});if(result.ok){toast(result.message||`${worker.name}에게 ${kind==='rescue'?'구조':'치료'}를 지시했습니다.`,'success');renderUI();return;}reason=result.message||reason;}
  toast(reason,'error',5000);
}

function requestFirefight(x,y) {
  const t=game.tile(x,y);
  if(!t?.fire){toast('이곳의 불은 이미 꺼졌습니다.');return;}
  const selected=new Set(ui.selectedIds);
  const workers=game.state.colonists.filter(p=>!p.dead&&!p.drafted&&p.health>=15&&!p.carriedBy&&!p.carryingPawnId)
    .sort((a,b)=>Number(selected.has(b.id))-Number(selected.has(a.id))||Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
  let reason='진화할 수 있는 주민의 징집을 해제하세요.';
  for(const worker of workers){const result=execute('prioritize',{id:worker.id,x,y},{silent:true});if(result.ok){toast(result.message||`${worker.name}에게 진화를 지시했습니다.`,'success');renderUI();return;}reason=result.message||reason;}
  toast(reason,'error',5000);
}

function carePane() {
  const living=game.state.colonists.filter(p=>!p.dead);
  const patients=living.slice().sort((a,b)=>(a.health<15?-200:0)-(b.health<15?-200:0)+a.health-b.health);
  const downed=patients.filter(p=>p.health<15),wounded=patients.filter(p=>p.health<78||p.bleed>0);
  const beds=game.state.tiles.filter(t=>t.building?.complete&&t.building.type==='bed');
  const medical=beds.filter(t=>t.building.medical),fires=activeFires();
  const stats=game.state.careStats||{},hazards=game.state.hazards||{};
  return `<div class="eyebrow">NO ONE LEFT BEHIND</div><h2>서로를 돌보는 일</h2><p class="section-intro">부상자를 안전한 침상으로 옮기고,<br>치료와 식사를 이어 주세요.</p>
  <div class="care-summary"><div class="${downed.length?'danger':''}">${icon('rescue')}<strong>${downed.length}</strong><span>쓰러진 주민</span></div><div>${icon('medicine')}<strong>${medical.length}</strong><span>의료 침상</span></div><div class="${fires.length?'danger':''}">${icon('fire')}<strong>${fires.length}</strong><span>불이 난 칸</span></div></div>
  <div class="care-status-line ${downed.length||fires.length?'urgent':''}">${icon(downed.length||fires.length?'heart':'check')}<span>${downed.length?'구조와 출혈 치료가 필요합니다.':fires.length?'소방 담당의 징집을 해제해 진화하세요.':wounded.length?'다친 주민이 회복하고 있습니다.':'모든 주민의 건강이 안정적입니다.'}</span></div>
  <div class="patient-list">${patients.map(p=>`<article class="patient-card ${p.health<15?'critical':''}"><div class="patient-heading"><button data-focus-pawn="${esc(p.id)}" title="지도에서 ${esc(p.name)} 위치 보기"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span><b>${esc(p.name)}</b><small>${esc(careStatus(p))}</small></span></button><strong>${pct(p.health)}<small>%</small></strong></div><div class="patient-metrics"><span class="${p.bleed>0?'danger':''}">출혈 ${p.bleed>0?`${p.bleed.toFixed(2)}/초`:'없음'}</span><span class="${p.hunger<35?'danger':''}">포만 ${pct(p.hunger)}%</span></div><div class="progress-track"><i style="width:${pct(p.health)}%"></i></div>${p.health<78||p.bleed>0||p.health<15?`<div class="button-row compact"><button class="button ${p.health<15?'primary':'ghost'}" data-care="rescue" data-patient="${esc(p.id)}" ${p.health>=15||p.carriedBy||p.patientBedId?'disabled':''}>${icon('rescue')}${p.carriedBy?'이송 중':'구조 지시'}</button><button class="button ghost" data-care="tend" data-patient="${esc(p.id)}" ${p.carriedBy?'disabled':''}>${icon('medicine')}치료 지시</button></div>`:''}</article>`).join('')}</div>
  <p class="small-note">지시는 선택한 작업 가능 주민을 우선 사용합니다. 없으면 가까운 비징집 주민을 찾습니다. 구조·치료·급식에는 이동과 작업 시간이 필요합니다.</p>
  <div class="section-divider"></div><div class="section-head"><h3>침상 용도</h3><span>${medical.length} 의료 / ${beds.length} 전체</span></div><div class="medical-bed-list">${beds.length?beds.map(t=>{const patient=living.find(p=>p.patientBedId===t.building.id&&!p.carriedBy);const incoming=living.find(p=>p.job?.type==='rescue'&&p.job.bedId===t.building.id);return `<div class="medical-bed-row"><button data-focus-tile="${t.x},${t.y}">${icon(t.building.medical?'medicine':'bed')}<span><b>${t.building.medical?'의료 침상':'일반 침대'} <small>${t.x}, ${t.y}</small></b><small>${patient?`${esc(patient.name)} 회복 중`:incoming?'환자 이송 예정':t.roofed?'실내 · 사용 가능':'실외 침상'}</small></span></button><button class="bed-mode ${t.building.medical?'medical':''}" data-medical-bed="${t.x},${t.y}" aria-label="침대 ${t.x}, ${t.y} ${t.building.medical?'일반 침대로 변경':'의료 침상으로 변경'}">${t.building.medical?'의료':'일반'}</button></div>`;}).join(''):'<p class="empty-inline">침대를 건설하면 용도를 정할 수 있습니다.</p>'}</div>
  <p class="small-note">의료 침상은 부상자를 위해 비워 둡니다. 건강한 주민이 잘 일반 침대도 준비하세요. 치료 담당은 도움이 필요한 환자에게 식사를 가져갑니다.</p>
  <div class="section-divider"></div><div class="section-head"><h3>소방 상황</h3><span>진화 ${hazards.extinguished||0}회</span></div>${fires.length?`<div class="fire-list">${fires.slice().sort((a,b)=>Number(!!b.building)-Number(!!a.building)||b.fire-a.fire).slice(0,8).map(t=>`<div class="fire-row"><button data-focus-tile="${t.x},${t.y}">${icon('fire')}<span><b>${esc(t.building?BUILDINGS[t.building.type]?.label:t.feature?FEATURE[t.feature]:t.crop?'농작물':'불길')}</b><small>${t.x}, ${t.y} · 강도 ${pct(t.fire*100)}%</small></span></button><button class="button ghost" data-extinguish="${t.x},${t.y}">진화 지시</button></div>`).join('')}</div>${fires.length>8?`<p class="small-note">외 ${fires.length-8}칸에서 불이 타고 있습니다.</p>`:''}`:'<p class="empty-inline">불이 난 곳이 없습니다. 소방 작업을 켜 두면 화재 때 주민이 대응합니다.</p>'}
  <div class="button-row compact"><button class="button ghost" data-action="enable-emergency">${icon('check')}소방·구조 작업 켜기</button><button class="button ghost" data-action="show-work">분업 설정</button></div>
  <div class="care-record">구조 ${stats.rescued||0}회 · 치료 ${stats.tended||0}회 · 환자 급식 ${stats.fed||0}회</div>`;
}

function schedulePane() {
  const pawns=game.state.colonists.filter(p=>!p.dead);
  const pawn=pawns.find(p=>p.id===ui.schedulePawnId)||pawns.find(p=>p.id===ui.selectedId)||pawns[0];
  if(!pawn)return '<div class="eyebrow">A RHYTHM OF OUR OWN</div><h2>하루의 리듬</h2><p class="empty-inline">일정을 정할 생존 주민이 없습니다.</p>';
  const hour=Math.floor(game.getSummary().hour)%24;
  const schedule=pawn.schedule||Array(24).fill('anything');
  const mode=schedule[hour],counts=Object.keys(SCHEDULE_MODES).map(k=>({mode:k,count:schedule.filter(m=>m===k).length}));
  return `<div class="eyebrow">A RHYTHM OF OUR OWN</div><h2>하루의 리듬</h2><p class="section-intro">일할 때와 쉴 때를 정하세요.<br>활동을 고른 뒤 시간칸을 누르면 바뀝니다.</p>
  <div class="schedule-pawns" role="group" aria-label="일정을 편집할 주민">${pawns.map(p=>`<button class="${p.id===pawn.id?'active':''}" data-schedule-pawn="${esc(p.id)}" aria-pressed="${p.id===pawn.id}"><span style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join('')}</div>
  <div class="schedule-now"><span>${icon(SCHEDULE_ICONS[mode])}<b>지금 ${String(hour).padStart(2,'0')}시 · ${esc(SCHEDULE_LABELS[mode])}</b></span><small>${esc(pawn.status)}</small></div>
  <div class="schedule-brushes" role="group" aria-label="일정 활동 선택">${Object.keys(SCHEDULE_MODES).map(k=>`<button class="schedule-brush mode-${k} ${ui.scheduleBrush===k?'active':''}" data-schedule-brush="${k}" aria-pressed="${ui.scheduleBrush===k}">${icon(SCHEDULE_ICONS[k])}<span>${SCHEDULE_LABELS[k]}</span></button>`).join('')}</div>
  <div class="schedule-grid" role="group" aria-label="${esc(pawn.name)}의 24시간 일정">${schedule.map((m,h)=>`<button class="schedule-hour mode-${m} ${h===hour?'current':''}" data-schedule-hour="${h}" data-schedule-id="${esc(pawn.id)}" title="${h}시 ${SCHEDULE_LABELS[m]} → ${SCHEDULE_LABELS[ui.scheduleBrush]}" aria-label="${h}시 ${SCHEDULE_LABELS[m]}, 누르면 ${SCHEDULE_LABELS[ui.scheduleBrush]}로 변경"><b>${String(h).padStart(2,'0')}</b><span>${SCHEDULE_LABELS[m]}</span></button>`).join('')}</div>
  <div class="schedule-totals">${counts.filter(c=>c.count).map(c=>`<span class="mode-${c.mode}"><i></i>${SCHEDULE_LABELS[c.mode]} ${c.count}h</span>`).join('')}</div>
  <div class="schedule-presets">${Object.keys(SCHEDULE_PRESETS).map(k=>`<button class="button ghost" data-schedule-preset="${k}" data-schedule-id="${esc(pawn.id)}">${esc(PRESET_LABELS[k]||k)}</button>`).join('')}</div>
  <p class="small-note">긴급한 생존·구조·소방·전투가 일정보다 우선합니다. 자율 시간에는 필요와 작업 우선순위에 따라 행동합니다. 일정은 다음 날에도 반복됩니다.</p>
  <div class="section-divider"></div><div class="section-head"><h3>쉴 곳도 필요합니다</h3>${icon('recreation')}</div>${needHtml('여가 충족',pawn.recreation??70)}<p class="section-intro">고리 던지기 시설에서 시간을 보내면 여가를 더 빨리 채울 수 있습니다. 여가가 부족하면 기분이 떨어집니다.</p><div class="button-row"><button class="button ghost" data-action="build-horseshoes">${icon('recreation')}여가 시설 건설</button><button class="button ghost" data-action="show-work">작업 우선순위</button></div>${moodFactorsHtml(pawn)}`;
}


function inspectPane() {
  const group=selectedPawns();
  if(group.length>1){
    const standing=group.filter(p=>p.health>=15&&!p.carriedBy);
    return `<div class="eyebrow">STAND TOGETHER</div><h2>${group.length}명 선택</h2><p class="section-intro">함께 이동하고, 같은 적을 공격합니다.<br>주민 이름을 누르면 한 명만 선택합니다.</p>
    <div class="group-list">${group.map(p=>`<button class="group-pawn" data-pawn="${esc(p.id)}"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span><b>${esc(p.name)}</b><small>${esc(p.status)}</small></span><em class="${p.health<15?'danger':''}">${pct(p.health)}%</em></button>`).join('')}</div>
    <div class="button-row"><button class="button primary" data-action="draft-selected" ${!standing.length?'disabled':''}>${icon('shield')}${standing.length&&standing.every(p=>p.drafted)?'선택 주민 해제':'선택 주민 징집'}</button><button class="button ghost" data-action="focus-selected">${icon('focus')}위치</button></div>
    <div class="button-row compact"><button class="button ghost" data-action="hold-selected" ${standing.some(p=>p.drafted)?'':'disabled'}>${icon('hold')}현재 위치 사수</button><button class="button ghost" data-action="show-care">${icon('medicine')}의료·소방</button></div>
    <button class="button ghost wide margin-top" data-action="close-panel">지도에서 명령하기</button><div class="section-divider"></div><div class="advice"><strong>지휘 방법</strong>징집한 상태에서 땅을 누르면 서로 다른 칸으로 이동합니다. 적을 누르면 집중 사격합니다. 방벽을 적과 주민 사이에 두면 엄폐 효과를 받습니다.</div>`;
  }
  const pawn=game.state.colonists.find(p=>p.id===ui.selectedId);
  if(pawn){
    const downed=!pawn.dead&&pawn.health<15;
    return `<div class="eyebrow">SURVIVOR DOSSIER</div><div class="inspect-avatar"><span class="pawn-avatar" style="--pawn-color:${esc(pawn.color)}"></span><div><h2>${esc(pawn.name)}</h2><small>${esc(pawn.role)}</small></div></div>
    <span class="status-pill ${pawn.dead||downed||pawn.drafted?'danger':''}">${esc(pawn.dead?'사망':pawn.status)}</span>
    ${pawn.carriedBy?`<p class="care-status-line urgent">${icon('rescue')}${esc(careStatus(pawn))}</p>`:''}
    <div class="pawn-environment">${icon(pawn.sheltered?'roof':'sun')}<span>${pawn.sheltered?'실내':'실외'} · ${Math.round(pawn.ambientTemperature??game.getSummary().temperature)}°C</span>${pawn.thermalStress>20?'<b>온도 스트레스</b>':''}</div>
    ${['health','hunger','energy','mood','recreation'].map(k=>needHtml({health:'건강',hunger:'포만감',energy:'휴식',mood:'기분',recreation:'여가'}[k],pawn[k]??70)).join('')}
    ${pawn.bleed>0?`<p class="file-error">출혈 ${pawn.bleed.toFixed(2)}/초 · 치료 담당의 징집을 해제하세요.</p>`:''}
    ${downed?`<div class="button-row"><button class="button primary" data-care="rescue" data-patient="${esc(pawn.id)}" ${pawn.carriedBy||pawn.patientBedId?'disabled':''}>${icon('rescue')}침상으로 구조</button><button class="button ghost" data-care="tend" data-patient="${esc(pawn.id)}" ${pawn.carriedBy?'disabled':''}>치료 지시</button></div>`:''}
    <div class="button-row"><button class="button ${pawn.drafted?'primary':''}" data-action="draft-selected" ${pawn.dead||downed||pawn.carriedBy?'disabled':''}>${icon('shield')}${pawn.drafted?'징집 해제':'징집하기'}</button><button class="button ghost" data-action="focus-selected">${icon('focus')}위치 보기</button></div>
    <div class="button-row compact"><button class="button ghost" data-action="show-schedule" ${pawn.dead?'disabled':''}>${icon('clock')}하루 일정</button><button class="button ghost" data-action="show-care">${icon('medicine')}의료·소방</button></div>
    <div class="button-row compact"><button class="button ghost" data-action="select-all">전원 선택</button><button class="button ghost" data-action="prioritize-tool" ${pawn.dead||downed||pawn.drafted?'disabled':''}>우선 작업 지시</button></div>
    ${pawn.drafted?`<div class="draft-controls"><p>땅을 누르면 이동, 적을 누르면 공격합니다. 가까운 적은 자동 사격합니다. 방벽은 적이 있는 방향에 있어야 보호합니다.</p><div class="button-row"><button class="button ghost" data-action="hold-selected">${icon('hold')}위치 사수</button><button class="button ghost" data-action="close-panel">지도에서 명령</button></div></div>`:''}
    ${equipmentHtml(pawn)}${!pawn.dead?moodFactorsHtml(pawn):''}<div class="section-divider"></div><div class="section-head"><h3>작업 능력</h3><span>높을수록 능숙합니다</span></div><div class="skill-list">${Object.entries(pawn.skills).map(([k,n])=>`<div class="skill"><span>${esc(JOB_LABELS[k]||{shoot:'사격'}[k]||k)}</span><strong>${n}</strong></div>`).join('')}</div>`;
  }
  const raider=game.state.raiders.find(r=>r.id===ui.selectedId);
  if(raider)return `<div class="eyebrow">HOSTILE CONTACT</div><h2>침입자</h2><p class="section-intro">정착지로 접근하는 적입니다.</p>${needHtml('건강',raider.health/(raider.maxHp||100)*100)}<div class="advice"><strong>방어 명령</strong>주민을 징집하고 이 적을 눌러 공격하세요. 적과 주민 사이에 방벽이나 벽을 두면 엄폐 효과를 받습니다.</div><button class="button danger wide margin-top" data-action="draft-all">${icon('shield')}전원 징집</button>`;
  const t=ui.selectedTile&&game.tile(ui.selectedTile.x,ui.selectedTile.y);
  if(t){
    const b=t.building;
    const title=b?BUILDINGS[b.type]?.label:t.feature?FEATURE[t.feature]:t.zone==='farm'?'농사 구역':t.zone==='stockpile'?'창고 구역':TERRAIN[t.terrain];
    return `<div class="eyebrow">SITE INSPECTION · ${t.x}, ${t.y}</div><div class="tile-preview">${icon(t.fire?'fire':b?BUILD_ICONS[b.type]:t.feature==='ore'?'steel':t.feature==='tree'?'wood':t.zone==='stockpile'?'box':'leaf')}</div><h2>${esc(title)}</h2>
    ${t.fire?`<div class="fire-inspection">${icon('fire')}<span>불이 타고 있습니다 · ${pct(t.fire*100)}%</span><button data-extinguish="${t.x},${t.y}">진화 지시</button></div>`:''}
    <div class="inspect-stat"><span>지형</span><strong>${esc(TERRAIN[t.terrain])}${t.burned?' · 탄 흔적':''}</strong></div><div class="inspect-stat"><span>거처 · 온도</span><strong>${t.roofed?'지붕 있음':'실외'} · ${Math.round(t.temperature??game.getSummary().temperature)}°C</strong></div>
    ${b?.complete&&['solar','battery','conduit','cooler','heater','beacon'].includes(b.type)?`<div class="inspect-stat"><span>전력 연결</span><strong>${b.networkId!=null?'연결됨':'연결 없음'}${['cooler','heater','beacon'].includes(b.type)?b.powered?' · 가동 중':' · 전원 없음':''}</strong></div>${b.type==='battery'?`<div class="inspect-stat"><span>충전량</span><strong>${pct((b.charge||0)/18000*100)}%</strong></div>`:''}`:''}
    ${t.feature?`<div class="inspect-stat"><span>채집 가능량</span><strong>${Math.floor(t.amount)}</strong></div>`:''}
    ${b?`<div class="inspect-stat"><span>상태</span><strong>${b.complete?'완공':`건설 중 ${pct(b.progress*100)}%`}</strong></div><div class="inspect-stat"><span>내구도</span><strong>${Math.ceil(b.hp)} / ${b.maxHp}</strong></div>`:''}
    ${b?.complete&&b.type==='bed'?`<div class="setting-row"><span>의료 전용 침상</span><button class="toggle ${b.medical?'on':''}" data-medical-bed="${t.x},${t.y}" role="switch" aria-checked="${!!b.medical}" aria-label="의료 침상 전환"></button></div><p class="small-note">의료 침상은 구조된 환자와 부상자를 위해 비워 둡니다. 건강한 주민은 일반 침대를 사용합니다.</p>`:''}
    ${b?.complete&&b.type==='workbench'?`<p class="small-note">제작 담당이 창고의 재료를 가져와 장비를 만듭니다. 완성품은 운반 후 지급할 수 있습니다.</p><button class="button primary wide" data-action="show-industry">${icon('craft')}생산 주문 관리</button>`:''}
    ${b?.complete&&b.type==='horseshoes'?'<p class="small-note">주민이 여가 시간에 이용합니다. 이동해 실제로 시간을 보내야 여가가 충족됩니다.</p>':''}
    ${t.zone?`<div class="inspect-stat"><span>지정 구역</span><strong>${t.zone==='farm'?'농사':'창고'}</strong></div>`:''}${t.crop?`<div class="inspect-stat"><span>작물 성장</span><strong>${pct(t.crop.growth*100)}%</strong></div>`:''}${t.designation?'<div class="inspect-stat"><span>작업</span><strong>채집 작업 대기</strong></div>':''}
    <div class="button-row">${t.feature?'<button class="button" data-action="gather-selected">채집 지정</button>':''}${b?.complete?'<button class="button danger" data-action="demolish-selected">건물 철거</button>':(b||t.zone||t.designation)?'<button class="button ghost" data-action="cancel-selected">지정 취소</button>':''}</div>`;
  }
  return `<div class="eyebrow">A CLOSER LOOK</div><h2>선택한 대상</h2><div class="empty-state">${icon('select')}지도에서 주민, 건물, 지형을<br>선택하면 자세히 살펴볼 수 있습니다.</div><button class="button wide" data-action="select-all">${icon('users')}정착민 전원 선택</button><div class="section-divider"></div><div class="advice"><strong>주민을 선택해 보세요</strong>Shift+클릭으로 여러 명을 고를 수 있습니다. 선택한 주민에게 징집이나 우선 작업을 지시하세요.</div>`;
}

function researchPane(){
  const research=game.state.research;
  const benches=game.state.tiles.filter(t=>t.building?.complete&&t.building.type==='researchbench').length;
  const workers=game.state.colonists.filter(p=>!p.dead&&p.job?.type==='research');
  return `<div class="eyebrow">KNOWLEDGE BECOMES A HOME</div><h2>내일을 위한 연구</h2><p class="section-intro">주민이 연구대에서 시간을 들여<br>새로운 설비와 구조 방법을 알아냅니다.</p><div class="research-status">${icon('research')}<div><strong>${research.active?esc(RESEARCH[research.active]?.label):'다음 연구를 선택하세요'}</strong><small>${!benches?'먼저 연구대를 건설하세요.':workers.length?`${workers.map(p=>p.name).map(esc).join(', ')} · 연구 작업 중`:'연구 작업 대기 · 작업 우선순위를 확인하세요.'}</small></div></div><div class="research-list">${Object.entries(RESEARCH).map(([id,t])=>{
    const done=research.unlocked.includes(id),active=research.active===id,missing=(t.requires||[]).filter(p=>!research.unlocked.includes(p)),progress=Math.min(t.points,research.progress[id]||0);
    return `<button class="research-card ${done?'done':''} ${active?'active':''} ${missing.length?'locked':''}" data-research="${id}" ${done?'disabled':''}><div class="research-card-head">${icon(done?'check':id==='electricity'?'power':id==='refrigeration'?'snow':'beacon')}<strong>${esc(t.label)}</strong><span>${done?'완료':active?'연구 중':missing.length?'선행 연구':'선택 가능'}</span></div><p>${esc(t.description||'')}</p><div class="unlock-list">${(t.unlocks||[]).map(b=>`<span>${esc(BUILDINGS[b]?.label||b)}</span>`).join('')}</div><div class="progress-track"><i style="width:${pct(progress/t.points*100)}%"></i></div><div class="research-card-bottom"><span>${missing.length?`${missing.map(p=>RESEARCH[p]?.label).map(esc).join(' · ')} 필요`:done?'새로운 설비를 사용할 수 있습니다.':active?'다른 연구로 바꿔도 진행도는 유지됩니다.':'눌러서 연구 시작'}</span><b>${Math.floor(progress)} / ${t.points}</b></div></button>`;
  }).join('')}</div><div class="advice"><strong>연구에도 사람이 필요합니다</strong>연구 우선순위를 높이면 다른 작업보다 먼저 연구합니다. 허기·피로·전투는 연구를 멈추게 할 수 있습니다.</div><div class="button-row"><button class="button ghost" data-action="show-work">작업 배분</button><button class="button ghost" data-action="build-researchbench">연구대 건설</button></div>`;
}

function foodFreshness(type){
  const batches=game.state.foodBatches?.[type]||[];
  const count=batches.reduce((n,b)=>n+b.count,0);
  return {count,freshness:count?batches.reduce((n,b)=>n+b.count*b.freshness,0)/count:1,nearSpoil:batches.filter(b=>b.freshness<.25).reduce((n,b)=>n+b.count,0)};
}

function systemsPane(){
  const s=game.state,p=s.power||{},summary=game.getSummary();
  const percent=p.capacity?pct(p.stored/p.capacity*100):0;
  const consumers=s.tiles.filter(t=>t.building?.complete&&['cooler','heater','beacon'].includes(t.building.type));
  const offline=consumers.filter(t=>!t.building.powered);
  const raw=foodFreshness('rawfood'),meals=foodFreshness('meals');
  return `<div class="eyebrow">THE SYSTEMS THAT SUSTAIN US</div><h2>거처를 유지하는 힘</h2><p class="section-intro">전력은 불빛과 냉기를 유지하고,<br>닫힌 벽은 그 온도를 지켜 줍니다.</p><div class="power-summary"><div>${icon('solar')}<strong>${Math.round(p.generation||0)}<small> W</small></strong><span>발전량</span></div><div>${icon('power')}<strong>${Math.round(p.demand||0)}<small> W</small></strong><span>필요 전력</span></div><div>${icon('battery')}<strong>${percent}<small> %</small></strong><span>축전지</span></div></div><div class="power-state ${offline.length?'warning':''}">${icon(offline.length?'power':'check')}<span>${!consumers.length?'아직 연결할 소비 설비가 없습니다.':offline.length?`${offline.length}개 설비에 전력이 공급되지 않습니다.`:'모든 소비 설비에 전력을 공급하고 있습니다.'}</span></div><div class="button-row"><button class="button ghost" data-action="layer-power">전력망 보기</button><button class="button ghost" data-action="build-utilities">발전 설비 건설</button></div><div class="section-divider"></div><div class="section-head"><h3>실내와 온도</h3><span>실외 ${Math.round(summary.temperature)}°C</span></div><div class="room-list">${(s.rooms||[]).map((r,i)=>{const storage=Array.isArray(r.stockpileTiles)?r.stockpileTiles.length:r.stockpileTiles;return `<button class="room-card" data-room="${esc(r.id)}">${icon(storage&&r.temperature<=8?'snow':'roof')}<span><b>방 ${i+1} · ${r.area}칸</b><small>침대 ${r.beds||0} · 창고 ${storage||0}칸</small></span><strong class="${r.temperature<=8?'cold':r.temperature>32?'hot':''}">${Math.round(r.temperature)}°C</strong></button>`;}).join('')||'<div class="empty-inline">닫힌 실내가 없습니다. 벽과 문으로 공간을 완전히 둘러싸세요.</div>'}</div><button class="button ghost wide margin-top" data-action="layer-temperature">${icon('thermometer')}온도와 지붕 보기</button><div class="section-divider"></div><div class="section-head"><h3>창고 식량 상태</h3><span>${summary.coldStorage?'냉장 구역 있음':'냉장 구역 없음'}</span></div>${[['식재료',raw],['식사',meals]].map(([label,f])=>`<div class="food-freshness"><div><span>${label} ${f.count}개</span><b>${pct(f.freshness*100)}%</b></div><div class="progress-track"><i style="width:${pct(f.freshness*100)}%;background:${f.freshness<.25?'var(--red)':'var(--green)'}"></i></div>${f.nearSpoil?`<small>곧 상할 수 있는 음식 ${f.nearSpoil}개</small>`:''}</div>`).join('')}<p class="small-note">신선도는 남은 보존 정도입니다. 0°C 이하는 부패를 멈추고, 8°C 이하는 크게 늦춥니다. 음식이 놓인 실제 위치의 온도를 사용합니다.</p><div class="advice"><strong>연결 규칙</strong>발전기·축전지·전력선은 상하좌우로 이어집니다. 소비 설비는 연결망에서 3칸 이내에 두세요. 냉난방기는 닫힌 실내에서 작동합니다.</div>`;
}

function workPane() {
  const pawns=game.state.colonists.filter(p=>!p.dead);
  return `<div class="eyebrow">EVERY PAIR OF HANDS</div><h2>오늘의 역할</h2><p class="section-intro">숫자를 눌러 우선순위를 바꾸세요.<br>주민은 높은 우선순위부터 일을 찾습니다.</p><div class="button-row compact"><button class="button ghost" data-action="show-schedule">${icon('clock')}하루 일정</button><button class="button ghost" data-action="show-care">${icon('medicine')}의료·소방</button></div><table class="priority-table"><thead><tr><th>작업</th>${pawns.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${Object.entries(JOB_LABELS).map(([k,label])=>`<tr><td>${esc(label)}</td>${pawns.map(p=>`<td><button class="priority-button" data-priority="${p.priorities[k]}" data-work="${k}" data-worker="${esc(p.id)}" title="${esc(p.name)} · ${esc(label)} 우선순위 ${p.priorities[k]||'해제'} · 클릭해서 변경">${p.priorities[k]||'—'}</button></td>`).join('')}</tr>`).join('')}</tbody></table><div class="priority-help"><span><b>1</b> 높음 → <b>4</b> 낮음</span><span><b>—</b> 작업 안 함</span></div><div class="section-divider"></div><div class="setting-row"><span>손상 건물 자동 수리</span><button class="toggle ${game.state.autoRepair?'on':''}" data-action="toggle-repair" role="switch" aria-label="자동 수리" aria-checked="${game.state.autoRepair}"></button></div><p class="small-note">건설 담당이 자재를 소비해 손상된 건물을 수리합니다. 새 청사진을 먼저 처리합니다.</p><div class="section-divider"></div><div class="section-head"><h3>식사 생산</h3>${icon('stove')}</div><div class="setting-row"><span>자동 조리</span><button class="toggle ${game.state.autoCook?'on':''}" data-action="toggle-cook" role="switch" aria-label="자동 조리" aria-checked="${game.state.autoCook}"></button></div><div class="setting-row"><label for="meal-target">목표 비축 식사</label><input class="inline-number" id="meal-target" type="number" min="1" max="100" value="${game.state.mealTarget}" aria-label="목표 비축 식사"></div><p class="section-intro">완성된 조리대와 식재료가 있으면 목표량까지 조리합니다. 만들어진 식사는 운반 후 창고 수량에 반영됩니다.</p><div class="section-divider"></div><div class="advice"><strong>운반 담당도 필요합니다</strong>채집·조리한 물자는 먼저 땅에 놓입니다. 운반 작업을 끄면 창고가 비어 있어도 사용할 수 없는 물자가 쌓입니다.</div>`;
}

function logsPane() {
  return `<div class="eyebrow">THE STORY SO FAR</div><h2>정착지의 기록</h2><p class="section-intro">조용한 하루도, 아슬아슬한 순간도.<br>우리의 이야기는 이곳에 남습니다.</p><div class="section-divider"></div><div class="event-log">${game.state.logs.slice(0,45).map(l=>`<article class="event ${esc(l.kind)}"><div class="event-time">${formatGameTime(l.time)}</div><strong>${esc(l.title)}</strong><p>${esc(l.text)}</p></article>`).join('')||'<p class="empty-state">아직 기록된 사건이 없습니다.</p>'}</div>`;
}

function gearCount(item) {
  const s=game.state;
  const stock=s.resources[item]||0;
  const loose=s.items.filter(i=>i.type===item).reduce((n,i)=>n+i.count,0);
  const carried=s.colonists.filter(p=>p.carry?.type===item&&p.carry.source!=='construction').reduce((n,p)=>n+p.carry.count,0);
  const equipped=s.colonists.filter(p=>Object.values(p.equipment||{}).includes(item)).length;
  return {stock,loose,carried,equipped,total:stock+loose+carried+equipped};
}

function equipmentHtml(pawn) {
  const eligible=!pawn.dead&&pawn.health>=15&&!pawn.carriedBy&&!pawn.drafted;
  const pending=pawn.job?.type==='equip';
  return `<div class="section-divider"></div><div class="section-head"><h3>장비와 도구</h3><button class="text-link" data-action="show-industry">제작 보기 ${icon('arrow')}</button></div>
  <div class="equipment-list">${Object.entries(EQUIPMENT).map(([item,def])=>{
    const equipped=pawn.equipment?.[def.slot]===item,stock=game.state.resources[item]||0,pickingUp=pending&&pawn.job.item===item;
    return `<div class="equipment-row ${equipped?'equipped':''}"><span class="equipment-icon">${icon(RES_ICONS[item])}</span><div><b>${equipped?esc(def.label):pickingUp?`${esc(def.label)} 수령 중`:item==='rifle'?'기본 권총':item==='armor'?'방어구 없음':'기본 작업 도구'}</b><small>${equipped?item==='rifle'?'사거리 9 · 피해 +35%':item==='armor'?'총탄 피해 −35%':'대상 작업 속도 +25%':`창고 ${stock}개 · ${esc(def.label)}`}</small></div><button class="gear-button" ${equipped||pickingUp?`data-unequip="${def.slot}"`:`data-equip="${item}"`} data-gear-pawn="${esc(pawn.id)}" title="${esc(def.description)}" ${!eligible||!(equipped||pickingUp)&&(!stock||pending)?'disabled':''}>${pickingUp?'취소':equipped?'해제':'장착'}</button></div>`;
  }).join('')}</div>${pending?`<p class="equipment-pending">${icon('clock')}${esc(pawn.status)} · 실제 수령 후 장착됩니다.</p>`:''}<p class="small-note">징집을 해제한 주민이 창고로 가서 장비를 받습니다. 해제한 장비는 발밑에 내려놓습니다.</p>`;
}

function changeBill(recipeId, patch) {
  const bill=game.state.industry.bills[recipeId];
  if(!bill)return;
  execute('bill',{recipeId,...bill,...patch},{success:true});
  renderSidebar();
}

function industryPane() {
  const s=game.state,benches=s.tiles.filter(t=>t.building?.complete&&t.building.type==='workbench');
  const craftJobs=s.colonists.filter(p=>p.job?.type==='craft');
  const totalCrafted=Object.values(s.industry.crafted).reduce((n,v)=>n+v,0);
  const capable=s.colonists.filter(p=>!p.dead&&p.priorities.craft>0&&!p.drafted);
  return `<div class="eyebrow">MADE FOR TOMORROW</div><h2>손으로 만드는 대비</h2><p class="section-intro">목재와 강철을 필요한 장비로 바꾸세요.<br>제작과 운반, 두 일손이 이어져야 합니다.</p>
  <div class="industry-summary"><div>${icon('craft')}<strong>${benches.length}</strong><span>완성된 제작대</span></div><div>${icon('box')}<strong>${totalCrafted}</strong><span>지금까지 제작</span></div></div>
  <div class="button-row"><button class="button primary" data-action="build-workbench">${icon('craft')}제작대 건설</button><button class="button ghost" data-action="assign-crafter">${icon('users')}제작 담당 배치</button></div>
  <p class="small-note">제작대: 목재 20 · 강철 8. 전기 없이 작업합니다. ${capable.length?`비징집 제작 담당 ${capable.length}명이 있습니다.`:'제작 담당이 없거나 모두 징집 중입니다.'}</p>
  <div class="section-divider"></div><div class="section-head"><h3>생산 주문</h3><span>목표는 0–99개</span></div>
  <div class="recipe-list">${Object.entries(RECIPES).map(([recipeId,recipe])=>{
    const bill=s.industry.bills[recipeId],owned=gearCount(recipe.output),workers=craftJobs.filter(p=>p.job.recipeId===recipeId);
    const missing=Object.entries(recipe.cost).filter(([type,n])=>(s.resources[type]||0)<n);
    const satisfied=bill.mode==='maintain'?owned.total+workers.length>=bill.target:bill.target===0;
    const stateText=bill.paused?'주문 일시정지':workers.length?`${workers.length}명 제작 중`:satisfied?'목표 충족':!benches.length?'제작대 필요':!capable.length?'제작 담당 필요':missing.length?'창고 재료 대기':'작업 시작 대기';
    return `<section class="recipe-card ${workers.length?'working':''}"><div class="recipe-heading"><span>${icon(RES_ICONS[recipe.output])}</span><div><h4>${esc(recipe.label)}</h4><small>${esc(recipe.description)}</small></div></div><div class="recipe-materials">${Object.entries(recipe.cost).map(([type,n])=>`<span class="${(s.resources[type]||0)<n?'short':''}">${icon(RES_ICONS[type])}${esc(RESOURCE_LABELS[type])} ${n}</span>`).join('')}</div>
    <div class="recipe-ownership"><span>창고 <b>${owned.stock}</b></span><span>바닥·운반 <b>${owned.loose+owned.carried}</b></span><span>장착 <b>${owned.equipped}</b></span></div>
    <div class="segmented bill-mode" aria-label="${esc(recipe.label)} 생산 방식"><button data-bill-mode="count" data-bill-recipe="${recipeId}" class="${bill.mode==='count'?'active':''}" aria-pressed="${bill.mode==='count'}">횟수 지정</button><button data-bill-mode="maintain" data-bill-recipe="${recipeId}" class="${bill.mode==='maintain'?'active':''}" aria-pressed="${bill.mode==='maintain'}">보유량 유지</button></div>
    <div class="bill-control"><span>${bill.mode==='count'?'앞으로 만들 개수':'전체 보유 목표'}</span><div class="quantity-stepper"><button data-bill-delta="-1" data-bill-recipe="${recipeId}" aria-label="${esc(recipe.label)} 목표 줄이기" ${bill.target===0?'disabled':''}>−</button><output aria-label="${esc(recipe.label)} 목표">${bill.target}</output><button data-bill-delta="1" data-bill-recipe="${recipeId}" aria-label="${esc(recipe.label)} 목표 늘리기" ${bill.target===99?'disabled':''}>+</button></div></div>
    ${workers.map(p=>`<div class="craft-progress"><span><b>${esc(p.name)}</b> · ${esc(p.job.stage==='work'?'제작 중':'재료 운반 중')}</span><div class="progress-track"><i style="width:${p.job.stage==='work'?pct(p.job.progress/p.job.total*100):0}%"></i></div></div>`).join('')}
    <div class="recipe-footer"><span class="${workers.length?'positive':bill.paused?'muted':''}">${esc(stateText)}</span><button data-bill-pause="${recipeId}" aria-label="${esc(recipe.label)} ${bill.paused?'재개':'일시정지'}">${bill.paused?'재개':'일시정지'}</button><button data-bill-clear="${recipeId}" ${!bill.target&&!workers.length?'disabled':''}>주문 해제</button></div></section>`;
  }).join('')}</div>
  <p class="small-note">보유량에는 창고·바닥·운반·장착 장비와 제작 중인 물품을 포함합니다. 주문 설정을 바꾸면 해당 제작을 중단하고 받은 재료를 바닥에 돌려놓습니다.</p>
  <div class="section-divider"></div><div class="section-head"><h3>주민에게 장비 지급</h3><span>이름을 눌러 선택</span></div><div class="gear-roster">${s.colonists.filter(p=>!p.dead).map(p=>`<button data-pawn="${esc(p.id)}"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span><b>${esc(p.name)}</b><small>${Object.values(p.equipment||{}).filter(Boolean).map(id=>esc(EQUIPMENT[id]?.label||id)).join(' · ')||'기본 장비'}</small></span>${icon('arrow')}</button>`).join('')}</div>
  <button class="button ghost wide margin-top" data-action="show-trade">${icon('trade')}상인과 잉여 물품 거래</button>`;
}

function tradePane() {
  const s=game.state,trade=s.trade,visitor=trade.visitor,item=ui.tradeItem,prices=TRADE_PRICES[item];
  const buying=ui.tradeSide==='buy',price=buying?prices.buy:prices.sell,count=ui.tradeCount;
  const available=buying?(visitor?.stock?.[item]||0):(s.resources[item]||0),cash=buying?s.resources.silver:(visitor?.silver||0);
  const max=price?Math.min(100,available,Math.floor(cash/price)):0;
  const civilian=s.colonists.some(p=>!p.dead&&p.health>=15&&!p.drafted&&!p.carriedBy);
  const open=visitor?.phase==='trading'&&!s.activeRaid&&civilian;
  const ok=open&&price!==null&&count<=max;
  const status=!visitor?'다음 방문을 기다리는 중':visitor.phase==='arriving'?'정착지로 이동 중':visitor.phase==='leaving'?'거래를 마치고 떠나는 중':'물품을 거래할 수 있습니다';
  const reason=!visitor?'상인 도착 후 거래할 수 있습니다.':visitor.phase!=='trading'?'상인이 머무는 동안 거래할 수 있습니다.':s.activeRaid?'습격 중에는 거래할 수 없습니다.':!civilian?'일어선 비징집 주민이 필요합니다.':price===null?'상인은 음식 재판매를 받지 않습니다.':available<count?'선택한 수량만큼 재고가 없습니다.':cash<count*price?buying?'창고 은화가 부족합니다.':'상인의 은화가 부족합니다.':'구매품과 판매 대금은 상인 발밑에 놓입니다.';
  return `<div class="eyebrow">A ROAD BETWEEN COLONIES</div><h2>길 위에서 만난 이웃</h2><p class="section-intro">남는 물자는 팔고, 필요한 것은 구하세요.<br>방문 시간과 상인의 자금은 한정되어 있습니다.</p>
  <div class="trader-visit ${visitor?.phase==='trading'?'open':''}"><span class="trader-emblem">${icon('trade')}</span><div><b>${esc(visitor?.name||'순회 상인')}</b><small>${esc(status)}</small><span>${!visitor?`다음 방문까지 ${formatDuration(trade.nextVisitAt-s.time)}`:visitor.phase==='trading'?`머무는 시간 ${formatDuration(visitor.leavesAt-s.time)}`:visitor.phase==='arriving'?'지도에 도착했습니다. 만남 지점으로 이동합니다.':'이미 받은 물품은 정착지에 남습니다.'}</span></div>${visitor?`<button class="icon-button" data-action="focus-trader" title="상인 위치" aria-label="상인 위치 보기">${icon('focus')}</button>`:''}</div>
  <div class="trade-balances"><div><span>창고 은화</span><b>${icon('coin')}${s.resources.silver}</b></div><div><span>상인 은화</span><b>${icon('coin')}${visitor?visitor.silver:'—'}</b></div></div>
  <div class="segmented trade-side" role="group" aria-label="거래 방향"><button data-trade-side="buy" class="${buying?'active':''}" aria-pressed="${buying}">구매하기</button><button data-trade-side="sell" class="${!buying?'active':''}" aria-pressed="${!buying}">판매하기</button></div>
  <div class="trade-table-head"><span>품목</span><span>${buying?'상인 재고':'창고 수량'}</span><span>${buying?'구매':'판매'} 단가</span></div><div class="trade-items">${Object.entries(TRADE_PRICES).map(([type,p])=>{
    const unit=buying?p.buy:p.sell,quantity=buying?(visitor?.stock?.[type]||0):s.resources[type];
    return `<button class="trade-item ${type===item?'selected':''}" data-trade-item="${type}" aria-pressed="${type===item}"><span>${icon(RES_ICONS[type])}<b>${esc(RESOURCE_LABELS[type])}</b></span><span>${visitor||!buying?quantity:'—'}</span><strong>${unit===null?'매입 안 함':`${unit} 은화`}</strong></button>`;
  }).join('')}</div>
  <div class="trade-order"><div class="trade-order-heading"><b>${esc(RESOURCE_LABELS[item])} ${buying?'구매':'판매'}</b><span>${max}개까지 가능</span></div><div class="trade-quantity"><label for="trade-count">수량</label><div class="quantity-stepper"><button data-trade-delta="-1" aria-label="거래 수량 줄이기" ${count<=1?'disabled':''}>−</button><input id="trade-count" type="number" min="1" max="100" step="1" value="${count}" aria-label="거래 수량"><button data-trade-delta="1" aria-label="거래 수량 늘리기" ${count>=100?'disabled':''}>+</button></div><button class="small-button" data-trade-quantity="${Math.max(1,max)}" ${!max?'disabled':''}>최대</button></div><div class="trade-total"><span>${buying?'지불할 은화':'수거할 은화'}</span><b>${icon('coin')}${price===null?'—':count*price}</b></div><button class="button primary wide" data-action="confirm-trade" data-trade-trader="${esc(visitor?.id||'')}" ${ok?'':'disabled'}>${icon('trade')}${count}개 ${buying?'구매':'판매'}</button><p class="trade-reason ${ok?'':'muted'}">${esc(reason)}</p></div>
  <div class="advice"><strong>물품과 대금을 창고로 옮기세요</strong>구매품과 판매 은화는 상인 위치에 배송됩니다. 운반 담당을 남겨 두고 상인과 창고 사이의 길을 열어 두세요. 장착 장비와 제작에 투입한 자재는 팔 수 없습니다.</div><p class="small-note">습격이나 상인 위치의 화재가 발생하면 상인은 떠납니다. 음식은 구매만 가능하며, 구매 후에는 보관 온도에 따라 부패합니다.</p><p class="economy-record">구매 ${trade.stats.bought}개 · 판매 ${trade.stats.sold}개<br>지불 ${trade.stats.spent} 은화 · 받은 대금 ${trade.stats.earned} 은화</p>`;
}

function renderSidebar() {
  if(!game)return;
  const node=$('#sidebar-content'),focused=document.activeElement;
  // Keep in-progress number edits intact, but allow switching away from the pane.
  if(node.dataset.pane===ui.pane&&node.contains?.(focused)&&/INPUT|SELECT|TEXTAREA/.test(focused?.tagName||''))return;
  const renderers={colony:colonyPane,inspect:inspectPane,work:workPane,care:carePane,schedule:schedulePane,research:researchPane,systems:systemsPane,industry:industryPane,trade:tradePane,logs:logsPane};
  setContent(node,renderers[ui.pane]());node.dataset.pane=ui.pane;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds))return '—';
  seconds=Math.max(0,Math.ceil(seconds));
  return `${Math.floor(seconds/60)}분 ${String(seconds%60).padStart(2,'0')}초`;
}

function formatGameTime(time) {
  const totalHours=(Number(time)||0)/120*24+8;
  return `${Math.floor(totalHours/24)+1}일 · ${String(Math.floor(totalHours%24)).padStart(2,'0')}:${String(Math.floor(totalHours%1*60)).padStart(2,'0')}`;
}

function renderUI() {
  if(!game)return;
  renderResources();renderDock();renderTools();
  if(!ui.interacting)renderSidebar();
  const s=game.getSummary(),hour=Number(s.hour)||0;
  $('#world-time').textContent=`${s.day}일 · ${String(Math.floor(hour)).padStart(2,'0')}:${String(Math.floor(hour%1*60)).padStart(2,'0')}`;
  $('#temperature').textContent=`${Math.round(s.temperature)}°C · ${WEATHER[game.state.weather]||'맑음'}`;
  $('#living-count').textContent=`${s.alive}명의 생존자`;
  const enemies=game.state.raiders.filter(r=>!r.dead),fires=activeFires();
  const downed=game.state.colonists.filter(p=>!p.dead&&p.health<15);
  const newRaid=enemies.length&&!ui.hadRaid,newFire=fires.length&&!ui.hadFire,newDowned=downed.some(p=>!ui.downedIds.has(p.id));
  if(ui.autoPause&&!colonyBot?.isAutoPlayMode?.()&&(newRaid||newFire||newDowned)){
    if(dialog.open)ui.dialogSpeed=0;else setSpeed(0);
    const reason=newDowned?'쓰러진 주민이 있습니다. 의료·소방 탭에서 구조와 치료를 준비하세요.':newRaid?'습격을 발견했습니다. 주민을 배치한 뒤 재생하세요.':'화재를 발견했습니다. 소방 담당의 징집을 해제하고 대응하세요.';
    toast(`시간을 멈췄습니다. ${reason}`,'error',7000);
  }
  ui.hadRaid=enemies.length>0;ui.hadFire=fires.length>0;ui.downedIds=new Set(downed.map(p=>p.id));
  const visitor=game.state.trade.visitor;
  if(visitor?.phase==='trading'&&ui.seenTraderId!==visitor.id){ui.seenTraderId=visitor.id;toast('순회 상인이 도착했습니다. 교역 탭에서 필요한 물자를 구하세요.','success',6500);}
  const banner=$('#threat-banner');banner.hidden=!enemies.length&&!fires.length&&!downed.length;
  if(!banner.hidden){const details=[enemies.length?`습격자 ${enemies.length}명`:'',fires.length?`화재 ${fires.length}칸`:'',downed.length?`쓰러짐 ${downed.length}명`:''].filter(Boolean).join(' · ');
    const standing=game.state.colonists.filter(p=>!p.dead&&p.health>=15);
    setContent(banner,`${icon(enemies.length?'shield':fires.length?'fire':'medicine')}<span>${details}</span>${enemies.length?`<button data-action="draft-all">${standing.length&&standing.every(p=>p.drafted)?'전원 해제':'전원 징집'}</button>`:''}${fires.length||downed.length?'<button data-action="show-care">의료·소방</button>':''}`);
  }
  $('#sidebar-footer-text').textContent=downed.length?'혼자 남겨 두지 않겠습니다.':fires.length?'불길을 멈추고 거처를 지켜 주세요.':enemies.length?'서로의 등을 지켜 주세요.':game.state.victory?'이제, 다음 이야기를 시작합니다.':'생존은 함께하는 일입니다.';
  const recent=game.state.logs[0];
  if(recent&&recent.id!==ui.lastLogId){
    if(ui.lastLogId&&recent.kind==='danger')toast(`${recent.title} · ${recent.text}`,'error',6000);
    ui.lastLogId=recent.id;
  }
  if(game.state.victory&&!ui.seenVictory){ui.seenVictory=true;showOutcome(true);}
  else if(game.state.gameOver&&!ui.seenGameOver){ui.seenGameOver=true;showOutcome(false);}
}

function makeSave() {
  return {format:'frontier-colony-save',version:1,savedAt:new Date().toISOString(),game:game.toJSON()};
}

function readSave(text) {
  if(text.length>4000000)throw new Error('저장 파일이 너무 큽니다.');
  const data=JSON.parse(text);
  if(!data||data.format!=='frontier-colony-save'||data.version!==1||!data.game)throw new Error('지원하는 정착지 저장 파일이 아닙니다.');
  return ColonyGame.fromJSON(data.game);
}

function saveGame(manual=false) {
  if(!game)return false;
  if(ui.persistenceBlocked&&!manual)return false;
  try{
    localStorage.setItem(SAVE_KEY,JSON.stringify(makeSave()));
    ui.persistenceBlocked=false;
    ui.saveTime=Date.now();
    $('#save-status').textContent='방금 저장됨';
    setTimeout(()=>{if(Date.now()-ui.saveTime>=3500)$('#save-status').textContent='브라우저 자동 저장';},4000);
    if(manual)toast('현재 정착지를 이 브라우저에 저장했습니다.','success');
    return true;
  }catch(error){
    $('#save-status').textContent='자동 저장 불가';
    if(manual)toast('브라우저 저장 공간에 접근할 수 없습니다. 메뉴에서 저장 파일을 내보내세요.','error',6000);
    return false;
  }
}

function replaceGame(next, announce) {
  game=next;renderer.setGame(game);
  ui.selectedId=null;ui.selectedIds=[];ui.selectedTile=null;ui.previewTiles=[];ui.hadRaid=false;ui.hadFire=false;ui.downedIds=new Set();ui.schedulePawnId=null;ui.tradeCount=1;ui.tradeItem='medicine';ui.tradeSide='buy';ui.seenTraderId=game.state.trade.visitor?.id||null;ui.persistenceBlocked=false;ui.seenVictory=game.state.victory;ui.seenGameOver=false;ui.lastLogId=game.state.logs[0]?.id;
  ui.pane='colony';ui.category='orders';ui.tool='select';
  $('#colonist-dock').dataset.ids='';
  $('#app').classList.remove('show-panel');
  setPane('colony');setCategory('orders');setTool('select');
  renderer.focus(23,16);setSpeed(game.state.gameOver?0:1);saveGame();renderUI();
  if(announce)toast(announce,'success',4500);
}

function openDialog(title,eyebrow,body) {
  if(!dialog.open&&!colonyBot?.isAutoPlayMode?.()){ui.dialogSpeed=ui.speed;setSpeed(0);}
  $('#dialog-content').innerHTML=`<div class="dialog-header"><div><div class="eyebrow">${esc(eyebrow)}</div><h2 id="dialog-title">${esc(title)}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="닫기">${icon('cancel')}</button></div><div class="dialog-body">${body}</div>`;
  if(!dialog.open)dialog.showModal();
}

function closeDialog() {
  if(dialog.open)dialog.close();
  const previous=ui.dialogSpeed;ui.dialogSpeed=null;
  if(previous!==null)setSpeed(previous);
}

function showHelp() {
  openDialog('함께 돌아갈 곳을 만들기','FIELD GUIDE · 생활과 위기 대응',`<p>주민들은 스스로 먹고, 쉬고, 일합니다. 당신은 <b>생활 공간과 하루 일정을 정하고, 위험할 때 동료를 지키는 역할</b>을 맡습니다.</p>
  <div class="guide-steps recovery-guide"><div class="guide-step"><span>01</span><strong>거처와 식량</strong><p>시작 거처의 동쪽·남쪽 빈틈을 닫고 실내 침대를 3개 준비하세요. 농사·채집·조리·운반 담당을 정합니다.</p></div><div class="guide-step"><span>02</span><strong>연구와 생활</strong><p>전기 공학을 연구해 발전·축전·냉장을 연결하세요. 고리 던지기와 여가 시간도 마련합니다.</p></div><div class="guide-step"><span>03</span><strong>구조와 회복</strong><p>의료 침상을 준비하고 소방·구조·치료 담당을 남겨 두세요. 전투 후 징집을 해제해야 위기 대응을 시작합니다.</p></div><div class="guide-step"><span>04</span><strong>마지막 전송</strong><p>통신을 연구하고 신호기에 전기를 공급하세요. 전송 도중 마지막 습격을 막고, 남은 화재도 진압합니다.</p></div></div>
  <h3>부상자를 혼자 두지 마세요</h3><p>건강이 크게 떨어지면 주민이 쓰러집니다. <b>의료·소방</b> 탭에서 구조를 지시하면 다른 주민이 부상자를 들어 침상으로 옮깁니다. 침대를 선택해 의료용으로 바꿀 수 있습니다. 건강한 주민이 잘 일반 침대도 남겨 두세요.</p><p>치료 담당은 약품을 가져와 출혈을 멈추고 회복을 돕습니다. 약품이 없으면 응급 처치를 합니다. 도움이 필요한 환자는 식사도 가져다주어야 합니다. 출혈과 허기는 이송 중에도 진행되므로 담당 주민의 징집과 작업 설정을 확인하세요.</p>
  <h3>화재는 실제로 번집니다</h3><p>낙뢰로 시작한 불은 인접한 가연물로 번지고 나무·작물·건물을 태웁니다. 소방 담당이 불 옆으로 이동해 작업해야 꺼집니다. <b>의료·소방 → 진화 지시</b> 또는 주민 선택 후 <b>우선 작업</b> 도구로 불을 누르세요. 비는 지붕이 없는 곳의 불을 약하게 만듭니다.</p><p>건물이 타면 방이 열리거나 전력망이 끊길 수 있습니다. 불을 끈 뒤 수리·재건과 냉장실 온도를 확인하세요. 화재가 남아 있으면 구조 신호 충전이 멈춥니다.</p>
  <h3>하루 일정을 정하세요</h3><p><b>일정</b> 탭에서 주민과 활동을 선택한 뒤 24시간 칸을 눌러 바꿉니다. 균형 생활·야간 작업·자율 생활 설정도 있습니다. 긴급한 생존과 위기 대응은 일정보다 우선합니다. 기존 저장의 주민은 자율 일정으로 이어집니다.</p><p>고리 던지기 시설은 여가 회복을 돕습니다. 주민 상세 화면에서 허기·휴식·온도·여가가 기분에 주는 영향을 확인할 수 있습니다.</p>
  <h3>실내 · 전력 · 식량</h3><p>벽과 문으로 둘러싸인 120칸 이하 공간에는 자동 지붕이 생깁니다. 발전기·축전지·전력선은 상하좌우로 연결하고, 소비 설비는 연결망에서 3칸 이내에 두세요. 밤에는 태양광이 멈춥니다.</p><p>냉각기가 작동하는 실내 창고는 음식 부패를 늦춥니다. 0°C 이하에서는 부패가 멈추고 8°C 이하는 크게 느려집니다. 지도 오른쪽에서 온도와 전력망을 확인하세요.</p>
  <h3>만들고, 장착하고, 거래하세요</h3><p><b>제작</b> 탭에서 제작대를 건설하고 생산 주문을 정하세요. 횟수 지정은 남은 제작 개수, 보유량 유지는 창고·바닥·운반·장착 장비를 모두 합한 목표입니다. 담당 주민이 목재와 강철을 옮겨 실제로 작업하며, 완성품도 창고로 나른 뒤 사용할 수 있습니다.</p><p>주민을 선택해 소총·조끼·작업 도구를 지급하세요. <b>비징집 주민이 직접 창고에서 수령해야 장착</b>됩니다. 소총은 더 멀리 강하게 사격하고, 조끼는 총탄 피해를 줄이며, 도구는 건설·수리·농사·채집·채광·제작을 빠르게 합니다.</p><p><b>교역</b> 탭에서는 방문 중인 상인에게 물품을 사고 팔 수 있습니다. 상인의 재고와 은화에는 한도가 있습니다. 구매품과 판매 대금은 상인 발밑에 놓이므로 운반 담당을 남겨 두세요. 음식은 구매만 가능하고, 습격이나 상인 위치의 화재가 발생하면 상인은 떠납니다.</p>
  <h3>주요 조작</h3><div class="guide-controls"><span><kbd>클릭 / 터치</kbd> 선택 · 도구 사용</span><span><kbd>구역 드래그</kbd> 사각형 영역 지정</span><span><kbd>선택 모드 드래그</kbd> 지도 이동</span><span><kbd>휠 / 핀치 / ＋ −</kbd> 확대 · 축소</span><span><kbd>Shift+주민 선택</kbd> 여러 명 선택</span><span><kbd>Ctrl+A</kbd> 정착민 전원 선택</span><span><kbd>SPACE</kbd> 정지 · 재생</span><span><kbd>1 / 2 / 3</kbd> 1× · 3× · 6×</span><span><kbd>Q / B / E / Z</kbd> 명령 · 건설 · 설비 · 구역</span><span><kbd>R / X</kbd> 징집 · 현재 위치 사수</span><span><kbd>C / L</kbd> 의료·소방 · 하루 일정</span><span><kbd>I / O</kbd> 제작·장비 · 교역</span><span><kbd>J / T / P</kbd> 연구 · 온도 · 전력망</span><span><kbd>WASD / 방향키</kbd> 지도 이동</span><span><kbd>ESC</kbd> 선택 도구로 복귀</span></div>
  <div class="guide-note"><b>엄폐와 전투 후 회복</b><br>방벽은 적과 주민 사이에 두세요. 뒤쪽에 있는 방벽은 앞에서 오는 공격을 막아 주지 않습니다. 징집 주민 선택 후 땅을 누르면 이동하고, 적을 누르면 공격합니다. 위치 사수는 이동을 멈추고 현재 자리를 지킵니다. 전투 후에는 징집을 해제하세요.</div>
  <h3>저장과 진행</h3><p>20초마다 이 브라우저에 자동 저장됩니다. JSON 내보내기·가져오기로 다른 기기에서도 이어갈 수 있습니다. v1·v2·v3 저장을 지원하며, 다른 탭을 보는 동안에는 시간이 진행되지 않습니다.</p><p>습격·새 화재·주민 쓰러짐 시 자동 정지가 기본으로 켜져 있습니다. 메뉴에서 바꿀 수 있습니다. 경보를 확인한 뒤 재생 버튼으로 진행하세요.</p><p class="menu-meta">독립적으로 구현한 정착지 생존 게임입니다. 원작 에셋이나 코드를 사용하지 않았습니다.</p><button class="button primary wide" data-action="close-dialog">정착지로 돌아가기 ${icon('arrow')}</button>`);
}

function showMenu() {
  let available=false;
  try{available=!!localStorage.getItem(SAVE_KEY);}catch{}
  openDialog('잠시, 숨을 고르기','COLONY MENU',`<p>정착지의 시간은 잠시 멈췄습니다.</p><div class="menu-grid"><button class="button" data-action="save">${icon('save')}지금 저장</button><button class="button" data-action="load" ${available?'':'disabled'}>${icon('clock')}마지막 저장 불러오기</button><button class="button ghost" data-action="export">저장 파일 내보내기</button><button class="button ghost" data-action="import">저장 파일 가져오기</button><button class="button ghost" data-action="fit-all">지도 전체 보기</button><button class="button ghost" data-action="help">플레이 가이드</button></div><div class="setting-row"><span>습격·화재·쓰러짐 자동 정지</span><button class="toggle ${ui.autoPause?'on':''}" data-action="toggle-autopause" role="switch" aria-label="위기 발생 시 자동 정지" aria-checked="${ui.autoPause}"></button></div>${recoverySave?'<button class="button ghost wide" data-action="export-recovery">읽지 못한 이전 저장 원본 내보내기</button>':''}<div class="section-divider"></div><button class="button wide" data-action="new-game">새로운 정착지 시작</button><p class="menu-meta">지도 씨앗 ${game.state.seed} · ${game.state.difficulty==='relaxed'?'여유로운 정착':'표준 생존'}<br>저장은 이 브라우저에 보관됩니다. 기기를 바꾸기 전 파일로 내보내 주세요.</p><button class="button primary wide" data-action="close-dialog">정착지로 돌아가기 ${icon('arrow')}</button>`);
}

function showNewGame() {
  const randomSeed=crypto.getRandomValues(new Uint32Array(1))[0]%2147483647;
  openDialog('또 다른 첫날','NEW BEGINNING',`<p>새로운 땅에 세 명의 정착민이 도착합니다. 시작하면 현재 자동 저장을 새 정착지로 바꿉니다.</p><div class="difficulty-grid"><label class="difficulty-choice"><input type="radio" name="difficulty" value="standard" checked><strong>표준 생존</strong><small>생활을 준비하고 습격에 대비하는 기본 경험입니다.</small></label><label class="difficulty-choice"><input type="radio" name="difficulty" value="relaxed"><strong>여유로운 정착</strong><small>느긋하게 건설하고 더 여유롭게 습격을 준비합니다.</small></label></div><label for="seed" class="muted">지도 씨앗</label><input id="seed" class="seed-input" type="number" min="1" max="2147483647" value="${randomSeed}"><div class="button-row"><button class="button ghost" data-action="export">현재 저장 내보내기</button><button class="button primary" data-action="confirm-new">정착지 시작 ${icon('arrow')}</button></div>`);
}

function showOutcome(won) {
  const s=game.getSummary();
  openDialog(won?'우리의 신호가 닿았습니다':'숲에 남겨진 이야기',won?'SIGNAL RECEIVED':'COLONY LOST',`<div class="victory-hero">${icon(won?'beacon':'mark')}</div><p>${won?'멀리서 응답이 들려옵니다. 낯선 땅에서 시작한 작은 정착지가 끝내 내일을 얻었습니다. 이곳에 남아 이야기를 이어갈 수도 있습니다.':'마지막 정착민이 쓰러졌습니다. 다음 정착지에서는 이곳에서 배운 것을 가져갈 수 있습니다.'}</p><div class="stats-grid"><div><strong>${s.day}</strong><span>기록된 날</span></div><div><strong>${s.alive}</strong><span>생존자</span></div><div><strong>${game.state.stats.survivedRaids}</strong><span>막아 낸 습격</span></div></div><div class="button-row">${won?'<button class="button primary" data-action="close-dialog">이야기 계속하기</button>':''}<button class="button ${won?'ghost':'primary'}" data-action="new-game">새로운 정착지</button></div>`);
  saveGame();
}

function exportSave() {
  const blob=new Blob([JSON.stringify(makeSave(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`frontier-colony-day${game.getSummary().day}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('저장 파일을 내보냈습니다.','success');
}

function action(name, element = null) {
  const pawn=game.state.colonists.find(p=>p.id===ui.selectedId&&!p.dead);
  const group=selectedPawns();
  switch(name){
    case 'close-dialog':closeDialog();break;
    case 'save':saveGame(true);break;
    case 'help':showHelp();break;
    case 'new-game':showNewGame();break;
    case 'confirm-new':{
      const seed=Number($('#seed').value);
      if(!Number.isInteger(seed)||seed<1||seed>2147483647){toast('지도 씨앗은 1~2147483647 사이의 정수로 입력해 주세요.','error');return;}
      const difficulty=$('input[name="difficulty"]:checked').value;
      closeDialog();replaceGame(new ColonyGame({seed,difficulty}),'새로운 정착지가 시작되었습니다.');break;
    }
    case 'load':
      try{const next=readSave(localStorage.getItem(SAVE_KEY)||'');closeDialog();replaceGame(next,'마지막 저장을 불러왔습니다.');}
      catch{toast('저장 내용을 불러올 수 없습니다. 파일을 가져오거나 새 정착지를 시작해 주세요.','error',5000);}break;
    case 'export':exportSave();break;
    case 'import':$('#import-input').click();break;
    case 'fit-all':closeDialog();renderer.fit();break;
    case 'draft-all':draftAll();break;
    case 'draft-selected':{const standing=group.filter(p=>p.health>=15&&!p.carriedBy);if(standing.length){const value=!standing.every(p=>p.drafted);standing.forEach(p=>execute('draft',{id:p.id,value}));setTool('select');renderUI();}break;}
    case 'hold-selected':{const drafted=group.filter(p=>p.drafted&&p.health>=15);if(!drafted.length){toast('위치를 사수할 징집 주민을 먼저 선택하세요.');break;}let count=0;for(const p of drafted)if(execute('hold',{id:p.id},{silent:true}).ok)count++;toast(`${count}명이 이동을 멈추고 현재 위치를 지킵니다.`);renderUI();break;}
    case 'focus-selected':if(group.length){renderer.focus(group.reduce((n,p)=>n+p.x,0)/group.length,group.reduce((n,p)=>n+p.y,0)/group.length);$('#app').classList.remove('show-panel');}break;
    case 'select-all':ui.selectedIds=game.state.colonists.filter(p=>!p.dead).map(p=>p.id);ui.selectedId=ui.selectedIds[0]||null;ui.selectedTile=null;setPane('inspect');setTool('select');renderUI();break;
    case 'prioritize-tool':setCategory('orders');setTool('prioritize');$('#app').classList.remove('show-panel');break;
    case 'show-research':setPane('research');break;
    case 'show-systems':setPane('systems');break;
    case 'show-work':setPane('work');break;
    case 'show-industry':setPane('industry',true);break;
    case 'show-trade':setPane('trade',true);break;
    case 'build-workbench':setCategory('build');setTool('build:workbench');$('#app').classList.remove('show-panel');break;
    case 'assign-crafter':{
      const worker=game.state.colonists.filter(p=>!p.dead&&p.health>=15&&!p.drafted&&!p.carriedBy).sort((a,b)=>b.skills.craft-a.skills.craft)[0];
      if(!worker){toast('제작할 수 있는 비징집 주민이 없습니다.','error');break;}
      execute('priority',{id:worker.id,work:'craft',value:1});toast(`${worker.name}의 제작 우선순위를 1로 정했습니다.`,'success');renderSidebar();break;
    }
    case 'focus-trader':{const visitor=game.state.trade.visitor;if(visitor){renderer.focus(visitor.x,visitor.y);$('#app').classList.remove('show-panel');}break;}
    case 'confirm-trade':{
      execute('trade',{traderId:element?.dataset.tradeTrader||game.state.trade.visitor?.id,side:ui.tradeSide,type:ui.tradeItem,count:ui.tradeCount},{success:true});
      renderUI();break;
    }
    case 'show-care':setPane('care',true);break;
    case 'show-schedule':ui.schedulePawnId=pawn?.id||ui.schedulePawnId;setPane('schedule',true);break;
    case 'enable-emergency':for(const p of game.state.colonists.filter(p=>!p.dead))for(const work of ['firefight','rescue'])execute('priority',{id:p.id,work,value:1},{silent:true});toast('소방·구조 작업을 우선순위 1로 켰습니다. 비징집 주민이 대응합니다.','success');renderUI();break;
    case 'layer-power':setLayer('power');$('#app').classList.remove('show-panel');break;
    case 'layer-temperature':setLayer('temperature');$('#app').classList.remove('show-panel');break;
    case 'build-researchbench':setCategory('build');setTool('build:researchbench');$('#app').classList.remove('show-panel');break;
    case 'build-horseshoes':setCategory('build');setTool('build:horseshoes');$('#app').classList.remove('show-panel');break;
    case 'build-utilities':if(game.state.research.unlocked.includes('electricity')){setCategory('utilities');setTool('build:solar');$('#app').classList.remove('show-panel');}else{setPane('research');toast('전기 공학 연구가 완료되면 발전 설비를 건설할 수 있습니다.');}break;
    case 'close-panel':$('#app').classList.remove('show-panel');break;
    case 'gather-selected':if(ui.selectedTile)execute('designate',{...ui.selectedTile,kind:'gather'},{success:true});renderSidebar();break;
    case 'demolish-selected':if(ui.selectedTile)execute('demolish',ui.selectedTile,{success:true});renderSidebar();break;
    case 'cancel-selected':if(ui.selectedTile)execute('cancel',ui.selectedTile,{success:true});renderSidebar();break;
    case 'toggle-cook':execute('autoCook',{value:!game.state.autoCook});renderSidebar();break;
    case 'toggle-repair':execute('autoRepair',{value:!game.state.autoRepair});renderSidebar();break;
    case 'toggle-autopause':ui.autoPause=!ui.autoPause;try{localStorage.setItem(PREFS_KEY,JSON.stringify({autoPause:ui.autoPause}));}catch{}showMenu();break;
    case 'export-recovery':if(recoverySave){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([recoverySave],{type:'application/json'}));a.href=url;a.download='frontier-colony-recovery.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}break;
  }
}

function bindUI() {
  document.addEventListener('pointerdown',e=>{if(e.target!==canvas)ui.interacting=true;});
  document.addEventListener('pointerup',()=>{ui.interacting=false;});
  document.addEventListener('pointercancel',()=>{ui.interacting=false;});
  document.addEventListener('click',e=>{
    const el=e.target.closest('button');if(!el)return;
    if(el.dataset.action){action(el.dataset.action,el);return;}
    if(el.dataset.speed!==undefined){setSpeed(Number(el.dataset.speed));return;}
    if(el.dataset.category){setCategory(el.dataset.category);return;}
    if(el.dataset.tool){
      const tool=Object.values(toolsByCategory).flat().find(t=>t.id===el.dataset.tool);
      if(tool?.tech&&!game.state.research.unlocked.includes(tool.tech)){setPane('research',true);toast(`${RESEARCH[tool.tech].label}을 먼저 연구하세요.`);return;}
      if(el.dataset.tool==='draft-all')draftAll();else if(el.dataset.tool==='hold')action('hold-selected');else if(el.dataset.tool==='care')action('show-care');else setTool(el.dataset.tool);return;
    }
    if(el.dataset.pane){setPane(el.dataset.pane);return;}
    if(el.dataset.pawn){selectPawn(el.dataset.pawn,false,e.shiftKey);return;}
    if(el.dataset.focusPawn){const p=game.state.colonists.find(p=>p.id===el.dataset.focusPawn);if(p){renderer.focus(p.x,p.y);$('#app').classList.remove('show-panel');}return;}
    if(el.dataset.focusTile){const [x,y]=el.dataset.focusTile.split(',').map(Number);renderer.focus(x+.5,y+.5);ui.selectedTile={x,y};ui.selectedId=null;ui.selectedIds=[];$('#app').classList.remove('show-panel');return;}
    if(el.dataset.care){requestCare(el.dataset.care,el.dataset.patient);return;}
    if(el.dataset.extinguish){const [x,y]=el.dataset.extinguish.split(',').map(Number);requestFirefight(x,y);return;}
    if(el.dataset.medicalBed){const [x,y]=el.dataset.medicalBed.split(',').map(Number),bed=game.tile(x,y)?.building;if(bed)execute('medicalBed',{x,y,value:!bed.medical},{success:true});renderSidebar();return;}
    if(el.dataset.schedulePawn){ui.schedulePawnId=el.dataset.schedulePawn;renderSidebar();return;}
    if(el.dataset.scheduleBrush){ui.scheduleBrush=el.dataset.scheduleBrush;renderSidebar();return;}
    if(el.dataset.scheduleHour!==undefined){execute('schedule',{id:el.dataset.scheduleId,hour:Number(el.dataset.scheduleHour),mode:ui.scheduleBrush});renderSidebar();return;}
    if(el.dataset.schedulePreset){execute('schedulePreset',{id:el.dataset.scheduleId,preset:el.dataset.schedulePreset},{success:true});renderSidebar();return;}
    if(el.dataset.billMode){changeBill(el.dataset.billRecipe,{mode:el.dataset.billMode});return;}
    if(el.dataset.billDelta!==undefined){const b=game.state.industry.bills[el.dataset.billRecipe];if(b)changeBill(el.dataset.billRecipe,{target:clamp(b.target+Number(el.dataset.billDelta),0,99)});return;}
    if(el.dataset.billPause){const b=game.state.industry.bills[el.dataset.billPause];if(b)changeBill(el.dataset.billPause,{paused:!b.paused});return;}
    if(el.dataset.billClear){changeBill(el.dataset.billClear,{target:0,paused:false});return;}
    if(el.dataset.equip){execute('equip',{id:el.dataset.gearPawn,item:el.dataset.equip},{success:true});renderSidebar();return;}
    if(el.dataset.unequip){execute('unequip',{id:el.dataset.gearPawn,slot:el.dataset.unequip},{success:true});renderSidebar();return;}
    if(el.dataset.tradeSide){ui.tradeSide=el.dataset.tradeSide;renderSidebar();return;}
    if(el.dataset.tradeItem){ui.tradeItem=el.dataset.tradeItem;renderSidebar();return;}
    if(el.dataset.tradeDelta!==undefined){ui.tradeCount=clamp(ui.tradeCount+Number(el.dataset.tradeDelta),1,100);renderSidebar();return;}
    if(el.dataset.tradeQuantity){ui.tradeCount=clamp(Number(el.dataset.tradeQuantity),1,100);renderSidebar();return;}
    if(el.dataset.research){execute('research',{id:el.dataset.research},{success:true});renderSidebar();renderTools();return;}
    if(el.dataset.room!==undefined){const room=game.state.rooms.find(r=>String(r.id)===el.dataset.room);if(room?.tiles.length){const x=room.tiles.reduce((n,i)=>n+i%game.state.width+.5,0)/room.tiles.length,y=room.tiles.reduce((n,i)=>n+Math.floor(i/game.state.width)+.5,0)/room.tiles.length;renderer.focus(x,y);if(ui.layer!=='temperature')setLayer('temperature');$('#app').classList.remove('show-panel');}return;}
    if(el.dataset.worker){execute('priority',{id:el.dataset.worker,work:el.dataset.work,value:(Number(el.dataset.priority)+1)%5});renderSidebar();return;}
  });
  $('#colonist-dock').addEventListener('dblclick',e=>{const el=e.target.closest('[data-pawn]');if(el)selectPawn(el.dataset.pawn,true);});
  $('#sidebar-content').addEventListener('change',e=>{
    if(e.target.id==='meal-target'){const n=clamp(Math.round(Number(e.target.value)||1),1,100);execute('autoCook',{value:game.state.autoCook,target:n});e.target.value=n;}
    if(e.target.id==='trade-count'){ui.tradeCount=clamp(Math.round(Number(e.target.value)||1),1,100);e.target.value=ui.tradeCount;renderSidebar();}
  });
  $('#save-button').onclick=()=>saveGame(true);$('#help-button').onclick=showHelp;$('#menu-button').onclick=showMenu;
  $('#mobile-panel-toggle').onclick=()=>$('#app').classList.toggle('show-panel');
  $('#panel-close').onclick=()=>$('#app').classList.remove('show-panel');
  $('#fit-map').onclick=()=>renderer.focus(23,16);
  const zoom=factor=>{const r=canvas.getBoundingClientRect();renderer.zoomAt(factor,r.left+r.width/2,r.top+r.height/2);};
  $('#zoom-in').onclick=()=>zoom(1.25);$('#zoom-out').onclick=()=>zoom(.8);
  $('#grid-toggle').onclick=()=>{ui.showGrid=!ui.showGrid;$('#grid-toggle').classList.toggle('active',ui.showGrid);$('#grid-toggle').setAttribute('aria-pressed',String(ui.showGrid));};
  $('#temperature-layer').onclick=()=>setLayer('temperature');$('#power-layer').onclick=()=>setLayer('power');
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
  $('#import-input').addEventListener('change',async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>4000000)throw new Error('저장 파일이 너무 큽니다.');
      const next=readSave(await file.text());
      closeDialog();replaceGame(next,'가져온 정착지를 불러왔습니다.');
    }catch(error){toast(`가져오지 못했습니다. ${error.message||'저장 파일을 확인해 주세요.'}`,'error',6000);}
    e.target.value='';
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveGame(true);return;}
    if(dialog.open||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
    const key=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&key==='a'){e.preventDefault();action('select-all');return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(key))e.preventDefault();
    ui.keys.add(key);
    if(e.repeat)return;
    if(key===' ')setSpeed(ui.speed===0?ui.lastSpeed:0);
    else if(key==='1')setSpeed(1);else if(key==='2')setSpeed(3);else if(key==='3')setSpeed(6);
    else if(key==='escape'){setTool('select');setCategory('orders');$('#app').classList.remove('show-panel');}
    else if(key==='b'){setCategory('build');setTool('build:wall');}
    else if(key==='e'){setCategory('utilities');}
    else if(key==='q'){setCategory('orders');setTool('select');}
    else if(key==='z'){setCategory('zones');setTool('zone:farm');}
    else if(key==='f')renderer.focus(23,16);
    else if(key==='g')$('#grid-toggle').click();
    else if(key==='t')setLayer('temperature');
    else if(key==='p')setLayer('power');
    else if(key==='j')setPane('research',true);
    else if(key==='c')setPane('care',true);
    else if(key==='l')action('show-schedule');
    else if(key==='i')action('show-industry');
    else if(key==='o')action('show-trade');
    else if(key==='x')action('hold-selected');
    else if(key==='r'){if(game.state.colonists.some(p=>p.id===ui.selectedId))action('draft-selected');else draftAll();}
    else if(key==='?'||key==='h')showHelp();
  });
  document.addEventListener('keyup',e=>ui.keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur',()=>{ui.keys.clear();ui.drag=null;ui.previewTiles=[];pointers.clear();pinch=null;});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();renderer.zoomAt(e.deltaY<0?1.1:1/1.1,e.clientX,e.clientY);},{passive:false});
  canvas.addEventListener('pointerdown',e=>{
    if(dialog.open)return;
    e.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};ui.drag=null;ui.previewTiles=[];return;}
    const tile=renderer.screenToTile(e.clientX,e.clientY);
    const pan=e.button===1||e.button===2||ui.tool==='pan';
    ui.drag={pointerId:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,pan,moved:false,tile,painted:false,additive:e.shiftKey,shape:!pan&&ui.tool.startsWith('zone:')?'rect':'stroke'};
    // The first touch may become a pinch. Commit only after a single-finger
    // drag is established, or after that single tap ends.
    if(!pan&&ui.tool!=='select'&&ui.drag.shape!=='rect'&&tile&&e.pointerType!=='touch'){applyTool(tile);ui.drag.painted=true;}
  });
  canvas.addEventListener('pointermove',e=>{
    ui.hover=renderer.screenToTile(e.clientX,e.clientY);
    if(ui.hover){const t=game.tile(ui.hover.x,ui.hover.y);$('#coordinates').textContent=`${String(ui.hover.x).padStart(2,'0')} : ${String(ui.hover.y).padStart(2,'0')} · ${t?.roofed?'실내':'실외'}${ui.layer==='temperature'?` ${Math.round(t?.temperature??0)}°C`:''}`;}
    if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pinch&&pointers.size===2){
      const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y),x=(a.x+b.x)/2,y=(a.y+b.y)/2;
      if(pinch.distance>0)renderer.zoomAt(d/pinch.distance,x,y);
      renderer.pan(x-pinch.x,y-pinch.y);pinch={distance:d,x,y};return;
    }
    const drag=ui.drag;if(!drag||drag.pointerId!==e.pointerId)return;
    const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
    if(drag.pan||(ui.tool==='select'&&drag.moved))renderer.pan(dx,dy);
    else if(drag.shape==='rect'&&ui.hover){if(!drag.tile)drag.tile=ui.hover;ui.previewTiles=rectangleTiles(drag.tile,ui.hover);}
    else if(ui.tool!=='select'&&ui.hover&&drag.moved){
      if(!drag.painted&&drag.tile){applyTool(drag.tile);drag.painted=true;}
      if(drag.tile)paintLine(drag.tile,ui.hover);else applyTool(ui.hover,true);
      drag.tile=ui.hover;
    }
    drag.x=e.clientX;drag.y=e.clientY;
  });
  function pointerEnd(e){
    const drag=ui.drag;
    if(drag&&drag.pointerId===e.pointerId&&drag.shape==='rect'&&e.type==='pointerup'){
      const end=renderer.screenToTile(e.clientX,e.clientY)||ui.hover;
      if(end){const tiles=rectangleTiles(drag.tile||end,end);let count=0,reason='';for(const tile of tiles){const result=execute('zone',{...tile,kind:ui.tool.split(':')[1]},{silent:true});if(result.ok)count++;else reason=result.message;}
        toast(count?`${count}칸에 ${ui.tool==='zone:farm'?'농사':'창고'} 구역을 지정했습니다.${count<tiles.length?` ${tiles.length-count}칸은 배치할 수 없어 제외했습니다.`:''}`:reason,count?'success':'error');}
    } else if(drag&&drag.pointerId===e.pointerId&&!drag.moved&&e.type==='pointerup'){
      const tile=renderer.screenToTile(e.clientX,e.clientY);
      if(tile&&drag.button===2)selectAt(tile,true);
      else if(tile&&!drag.painted&&ui.tool==='select')selectAt(tile,false,drag.additive);
      else if(tile&&!drag.painted&&!drag.pan)applyTool(tile);
    }
    pointers.delete(e.pointerId);pinch=null;ui.drag=null;ui.previewTiles=[];
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  }
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
  canvas.addEventListener('pointerleave',()=>{if(!ui.drag)ui.hover=null;});
  const ro=new ResizeObserver(()=>renderer.resize());ro.observe($('#map-stage'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden){saveGame();ui.keys.clear();}frameTime=0;});
  window.addEventListener('pagehide',()=>saveGame());
  setInterval(()=>{if(!document.hidden&&!dialog.open)saveGame();},20000);
}

function frame(now) {
  const dt=frameTime?Math.min((now-frameTime)/1000,.1):0;frameTime=now;
  if(!document.hidden){
    if(ui.speed>0&&!dialog.open&&!game.state.gameOver){
      let remaining=dt*ui.speed;
      while(remaining>0){const step=Math.min(remaining,.1);game.update(step);remaining-=step;}
      colonyBot?.step(dt);
    }
    if(!dialog.open){
      const x=(ui.keys.has('a')||ui.keys.has('arrowleft')?1:0)-(ui.keys.has('d')||ui.keys.has('arrowright')?1:0);
      const y=(ui.keys.has('w')||ui.keys.has('arrowup')?1:0)-(ui.keys.has('s')||ui.keys.has('arrowdown')?1:0);
      if(x||y)renderer.pan(x*dt*400,y*dt*400);
    }
    renderer.render({selectedId:ui.selectedId,selectedIds:ui.selectedIds,tool:ui.tool,hover:ui.hover,showGrid:ui.showGrid,showZones:ui.showZones,layer:ui.layer,previewTiles:ui.previewTiles,time:now,botToasts:colonyBot?.getActiveToasts(now)});
    if(now-lastUiTime>350){renderUI();colonyBot?.render();lastUiTime=now;}
  }
  requestAnimationFrame(frame);
}

function boot() {
  let loadError=false;
  try{const pref=JSON.parse(localStorage.getItem(PREFS_KEY)||'{}');if(typeof pref.autoPause==='boolean')ui.autoPause=pref.autoPause;}catch{}
  try{
    const saved=localStorage.getItem(SAVE_KEY);
    if(saved){recoverySave=saved;game=readSave(saved);restored=true;recoverySave=null;}
  }catch{loadError=true;ui.persistenceBlocked=true;if(recoverySave)try{localStorage.setItem(RECOVERY_KEY,recoverySave);}catch{}}
  if(!recoverySave)try{recoverySave=localStorage.getItem(RECOVERY_KEY);}catch{}
  game ||= new ColonyGame({seed:314159,difficulty:'standard'});
  renderer=new ColonyRenderer(canvas,game);
  colonyBot=createColonyBotController({container:$('#colony-bot-panel'),getGame:()=>game,getSpeed:()=>ui.speed,setSpeed,toast});
  const topAutoBtn=$('#top-auto-sim-btn');
  const topOAuthBtn=$('#top-oauth-btn');
  const syncTopBotButtons=()=>{
    const on=colonyBot.isAutoPlayMode();
    if(topAutoBtn){topAutoBtn.classList.toggle('active',on);topAutoBtn.textContent=on?`🤖 봇 시뮬 ON (${ui.speed}×)`:'🤖 봇 전용 시뮬레이션';}
    if(topOAuthBtn){const oa=colonyBot.uiState.oauthStatus;topOAuthBtn.classList.toggle('active',Boolean(oa?.connected));topOAuthBtn.textContent=oa?.connected?'🔑 Gemini OAuth 연결됨':'🔑 AI OAuth';}
    if(on&&ui.speed<=0&&!game.state.gameOver&&!game.state.victory)setSpeed(Math.max(0.5,ui.lastSpeed||5));
    const pauseBtn=$('[data-speed="0"]');
    if(pauseBtn){pauseBtn.disabled=on;pauseBtn.hidden=on;}
  };
  topAutoBtn?.addEventListener('click',()=>{
    const next=!colonyBot.isAutoPlayMode();
    colonyBot.setAutoPlayMode(next);
    if(next&&ui.speed===0)setSpeed(5);
    const c=game.state.colonists.find(p=>!p.dead);
    if(next&&c)colonyBot.showHeadToast(c.id,'봇 전용 시뮬레이션 시작! 정착지 운영을 맡겨주세요.','good');
    toast(next?`봇 전용 자동 시뮬레이션 시작 (${ui.speed}×)`:'봇 전용 자동 시뮬레이션 중지','info');
    syncTopBotButtons();
  });
  topOAuthBtn?.addEventListener('click',()=>{
    colonyBot.uiState.oauthOpen=!colonyBot.uiState.oauthOpen;
    colonyBot.render();
    $('#colony-bot-panel')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  });
  setInterval(syncTopBotButtons,500);
  syncTopBotButtons();
  ui.seenVictory=game.state.victory;ui.seenGameOver=false;ui.lastLogId=game.state.logs[0]?.id;
  if(game.state.gameOver)ui.speed=0;
  bindUI();setTool('select');setSpeed(ui.speed);renderUI();colonyBot.render();
  const _urlParams=typeof location!=='undefined'?new URLSearchParams(location.search):null;
  const _autoStart=_urlParams&&(_urlParams.get('autostart')==='1'||_urlParams.get('headless')==='1'||_urlParams.get('auto')==='1');
  if(_autoStart){
    const _reqSpeed=Math.max(0.5,Math.min(20,Number(_urlParams.get('speed')||20)||20));
    colonyBot.setAutoPlayMode(true);
    setSpeed(_reqSpeed);
    const firstCol=game.state.colonists.find(p=>!p.dead);
    if(firstCol)colonyBot.showHeadToast(firstCol.id,`무인 자동 시뮬레이션 시작 (${_reqSpeed}×)!`,'good');
    syncTopBotButtons();
    toast(`무인 자동 시뮬레이션 시작 (${_reqSpeed}×)`,'success',4500);
  }
  $('#loading-screen').classList.add('hidden');
  requestAnimationFrame(frame);
  if(loadError)toast('이전 저장을 읽지 못했습니다. 원본은 덮어쓰지 않았으며 메뉴에서 내보낼 수 있습니다.','error',7500);
  else if(_autoStart){}
  else if(restored)toast('마지막 기록을 이어갑니다. 의료·소방과 하루 일정에서 새 생활을 준비하세요.','success',5000);
  else toast('거처의 동쪽·남쪽 빈틈을 닫고 세 번째 침대를 준비하세요. 의료·소방과 일정 탭에서 서로를 돌볼 준비도 할 수 있습니다.','info',7500);
}

try{boot();}catch(error){
  console.error(error);
  $('#loading-screen').innerHTML=`${icon('mark','brand-mark')}<b>정착지를 열지 못했습니다.</b><span>페이지를 새로 고침해 주세요. 문제가 계속되면 저장 파일을 확인해 주세요.</span><button class="button" onclick="location.reload()">다시 열기</button>`;
}
