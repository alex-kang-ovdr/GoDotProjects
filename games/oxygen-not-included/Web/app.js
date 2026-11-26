import { Game, BUILDINGS } from './engine.js';
import { Renderer } from './renderer.js';
import { BUILDING_FOOTPRINTS, buildingBounds, buildingPort } from './footprint.js';
import { clearResearchQueue, selectResearch, researchTechName, RESEARCH_UNLOCKS, isBuildingResearchUnlocked } from './research.js';
import { renderResearchPanel } from './research-ui.js';
import { MODERN_RULES } from './rules.js';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const updateHTML = (element, html) => { if (element.innerHTML !== html) element.innerHTML = html; };
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const number = value => Math.floor(Number(value) || 0).toLocaleString('ko-KR');
const SAVE_KEY = 'breath-colony-save-v4';
const LEGACY_SAVE_KEYS = ['breath-colony-save-v3','breath-colony-save-v2','breath-colony-save-v1'];
const PREF_KEY = 'breath-colony-preferences-v1';
const ICONS = {
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.1 2.4c-.7.3-.6 1.2-.6 1.8M12 17h.01"/>',
  save:'<path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7M14 6h1"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16M17 8h1M17 12h1"/>',
  oxygen:'<circle cx="9" cy="14" r="6"/><circle cx="17" cy="6" r="3"/><path d="m13 9 2-2M16 15h5M19 12v6"/>',
  food:'<path d="M6 3v7m3-7v7M3 3v5a3 3 0 0 0 6 0M6 11v10M18 3c-3 2-4 5-4 9h4m0-9v18"/>',
  power:'<path d="m14 2-9 12h7l-2 8 9-12h-7l2-8Z"/>',
  water:'<path d="M12 3c-3 5-7 8-7 12a7 7 0 0 0 14 0c0-4-4-7-7-12ZM8 15c0 2 1 3 3 3"/>',
  leaf:'<path d="M5 16C2 8 11 3 21 3c0 10-5 19-14 15M3 21 16 8"/>',
  rock:'<path d="m3 17 3-10 9-4 6 8-3 9H8l-5-3Zm3-10 6 6 9-2M12 13l-4 7m4-7 3-10"/>',
  cursor:'<path d="m5 3 14 10-7 1-3 7L5 3Z"/>',
  pickaxe:'<path d="m5 21 12-14M5 4c6-2 12 0 16 6M12 4l6-1 3 6"/>',
  hand:'<path d="M7 12V6a2 2 0 0 1 4 0m0 7V4a2 2 0 0 1 4 0v9m0-6a2 2 0 0 1 4 0v7m0-4a2 2 0 0 1 3 1v4c0 4-3 7-7 7h-2c-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l3 3"/>',
  cancel:'<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/>',
  remove:'<path d="m4 20 10-10M12 5l4-3 6 6-3 4-7-7ZM3 17l4 4M4 4l3 3M3 10h3m4-8v3"/>',
  priority:'<path d="m5 15 7-7 7 7M5 21l7-7 7 7M12 3v1"/>',
  asteroid:'<path d="m8 3 9 1 5 8-5 8-9 2-6-7L8 3Z"/><circle cx="9" cy="10" r="2"/><path d="m15 8 2 2m-6 7h2"/>',
  pause:'<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play:'<path d="m8 4 12 8-12 8V4Z" fill="currentColor" stroke="none"/>',
  layers:'<path d="m2 8 10-5 10 5-10 5L2 8Zm0 5 10 5 10-5M2 18l10 5 10-5"/>',
  temperature:'<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0ZM12 7v10M18 5h3M18 9h2"/><circle cx="12" cy="18" r="1"/>',
  fit:'<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5M9 9h6v6H9Z"/>',
  focus:'<circle cx="12" cy="12" r="6"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  ladder:'<path d="M6 2v20M18 2v20M6 6h12M6 12h12M6 18h12"/>',
  tile:'<path d="M3 4h18v16H3ZM3 12h18M11 4v8m5 0v8M6 12v8"/>',
  wire:'<path d="M3 6h5v12h8V6h5"/><circle cx="3" cy="6" r="1.5"/><circle cx="21" cy="6" r="1.5"/>',
  diffuser:'<path d="M5 11h14v10H5ZM8 11V8m8 3V8M8 4V2m8 2V2M11 7V5M8 15h8M8 18h5"/>',
  generator:'<circle cx="12" cy="10" r="8"/><circle cx="12" cy="10" r="2"/><path d="m12 2 0 6m-8-1 6 2m-3 8 4-5m7 4-5-4m7-5-6 2M6 22h12m-9-4-2 4m8-4 2 4"/>',
  battery:'<rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 5V2h6v3M12 8l-3 5h6l-3 5"/>',
  farm:'<path d="M3 15h18l-2 6H5l-2-6Zm9 0V7m0 4c-5 0-7-3-7-6 5 0 7 2 7 6Zm0-2c0-5 3-7 7-7 0 5-2 7-7 7Z"/>',
  cot:'<path d="M3 6v15m18-10v10M3 16h18M6 10h4v6H6Zm4 2h8l3 4M3 19h18"/>',
  research:'<path d="M9 2h6M10 2v7L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3L14 9V2M7 15h10M10 18h1"/>',
  pump:'<path d="M7 10h10v10H7Zm3 0V5h10V2M4 14h3m-3 0v8M17 15h4m-7-2-4 5M8 6H5"/>',
  gasPump:'<path d="M7 10h10v10H7Zm3 0V5h10V2M4 14h3m-3 0v8M17 15h4m-7-2-4 5M8 6H5"/>',
  steamRocket:'<path d="M12 2C8 6 7 9 7 15h10c0-6-1-9-5-13Zm-5 9-3 5v4l4-3m9-6 3 5v4l-4-3m-6 1 2 4 2-4"/><circle cx="12" cy="9" r="2"/>',
  gasVent:'<path d="M4 7h16v4H4Zm2 4v9h12v-9M8 15h8m-6-8V3m4 4V3"/>',
  gaspipe:'<path d="M3 6h7v12h11M3 3v6m15 6v6M7 6v12h4"/>',
  scrubber:'<path d="M5 8h14v14H5ZM8 8V5h8v3M9 2h6M8 12h8M8 16h8M8 19h8"/>',
  coalgen:'<path d="M4 10h16v12H4Zm3 0V4h4v6m6 0V2h3v8M8 18c-2-3 2-4 3-7 0 3 5 4 3 7-1 2-5 2-6 0Z"/>',
  pipe:'<path d="M3 6h7v12h11M3 3v6m15 6v6M7 6v12h4"/><circle cx="10" cy="6" r="2"/><circle cx="10" cy="18" r="2"/>',
  wastepipe:'<path d="M3 6h7v12h11" stroke-dasharray="3 2"/><path d="M3 3v6m15 6v6M7 3h6v6H7Zm0 12h6v6H7Z"/>',
  toilet:'<path d="M5 3h7v9H5Zm-1 9h16c0 5-3 6-8 6H8c-3 0-4-3-4-6Zm6 6v4h7m-7-14h.01"/>',
  sink:'<path d="M3 12h18c0 5-4 7-9 7s-9-2-9-7Zm9 7v3M8 12V5a3 3 0 0 1 6 0M14 5h3v3m-3 2v2"/>',
  reservoir:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 13c3 3 13 3 16 0M8 18h2"/>',
  purifier:'<path d="M3 4h18l-7 9v7l-4 2v-9L3 4Zm4 4h10m-5 6v3"/>',
  electrolyzer:'<path d="M3 10h18v12H3ZM6 10V3h4v7m4 0V3h4v7M6 6h4m4 1h4M10 14l-2 3h5l-2 3M5 1h6m2 0h6"/>',
  hydrogenGen:'<rect x="3" y="7" width="18" height="15" rx="2"/><path d="M7 3h10v4M8 11v7m8-7v7m-8-4h8M10 1h4"/>',
  cooler:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 6v12M7 9l10 6M7 15l10-6m-7-2 2 2 2-2m-4 14 2-2 2 2"/>',
  storage:'<path d="M3 5h18v16H3ZM3 11h18M8 5v6m8-6v6M8 16h8M8 21v-4m8 4v-4"/>',
  kitchen:'<path d="M3 12h18v9H3ZM5 12V8h14v4M9 2v3m6-3v3M7 16h2m6 0h2M7 19h10"/>',
  mess:'<path d="M2 11h20M5 11v10m14-10v10M8 8V4h8v4M2 16h5m10 0h5M3 16v6m18-6v6"/>',
  fridge:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M8 5v2m0 7v4M12 4v4m-2-3 4 2m-4 0 4-2"/>',
  logistics:'<path d="M3 5h10v9H3ZM6 5V2h4v3M3 18h14l4-8M6 14v4m8-13h7m-3-3 3 3-3 3"/><circle cx="6" cy="21" r="1"/><circle cx="16" cy="21" r="1"/>',
  door:'<path d="M4 22V2h16v20M7 22V5h10v17M11 5v17M8 14h1m6 0h1M2 22h20"/>',
  oxygenDock:'<path d="M4 22V9a4 4 0 0 1 8 0v13H4Zm2-17V2h4v3M4 17h8m0-7h5v7h4M16 5h5v6h-5Z"/><circle cx="8" cy="11" r="1"/>',
  rooms:'<path d="M3 3h18v18H3ZM3 10h8V3m0 7v4m0 4v3m0-7h10M7 10v4M17 14v4"/>',
  skill:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  'volume-off':'<path d="m11 4-5 4H2v8h4l5 4V4Zm5 5 6 6m0-6-6 6"/>',
  volume:'<path d="m11 4-5 4H2v8h4l5 4V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS[BUILDINGS[name]?.icon] || ICONS.rock}</svg>`; }
$$('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });

const game = new Game(73);
const canvas = $('world');
const renderer = new Renderer(canvas, game);
let speed = 1, previousSpeed = 1, dialogSpeed = 1;
let tool = 'inspect', category = 'life', activePanel = 'colony';
let lastSaveTime = 0, accumulator = 0, lastTime = 0, lastUI = 0;
let currentSelection = null, seenEnd = '', crewSignature = '', eventSignature = '', objectiveSignature = '';
let soundEnabled = false, audioContext = null, selectedPointer = null, pinchState = null;
let saveUnavailable = false, saveBlocked = false, inspectorKey = '', operationsSignature = '';
let lastUnlockSignature = '', logisticsSignature = '', roomSignature = '';
let trainingCrewId = null;
const SCHEDULE_LABELS={auto:'자율',day:'주간',swing:'엇교대',night:'야간'};
const PHASE_LABELS={work:'작업 시간',break:'여가 시간',sleep:'수면 시간'};
const ROOM_LABELS={bedroom:'침실',messhall:'식당',greenhouse:'온실',generic:'미분류 공간'};
const SKILL_LABELS={dig:'굴착',engineering:'공학',life:'생활'};
const DOOR_LABELS={auto:'자동 출입',open:'열어 두기',locked:'잠금'};
const emptyInspector = $('inspector').innerHTML;
const pointers = new Map();
let oxygenHistory = [], lastOxygenSample = -10;
const resources = {soil:'흙',rock:'광석',metal:'금속',algae:'조류',coal:'석탄',water:'청수',waste:'오수',hydrogen:'수소',food:'수확 식량',meals:'조리식'};
const categories = {base:['ladder','tile','door','wire','cot','storage'],life:['diffuser','farm','toilet','sink','kitchen','mess','fridge','oxygenDock','scrubber','cooler'],industry:['generator','battery','research','supercomputer','planetarium','steamRocket','coalgen','electrolyzer','hydrogenGen','steamTurbine'],plumbing:['pipe','wastepipe','liquidBridge','liquidVent','reservoir','pump','purifier'],gas:['gasPump','gasVent','gaspipe','gasBridge']};
const infrastructure = {
  wire:{name:'전선',description:'발전기부터 시설이 있는 칸까지 연결하세요. 드래그하면 가로→세로 경로로 이어집니다.',cost:{metal:1},color:'#dabd7b'},
  pipe:{name:'급수관',description:'청수가 흐르는 배관입니다. 코어·저수조·물 수집기에서 소비 시설의 칸까지 이어 주세요.',cost:{metal:1},color:'#82c7e5'},
  wastepipe:{name:'배수관',description:'오수가 흐르는 배관입니다. 화장실·세면대에서 저수조와 정화기로 이어 주세요. 급수관과 겹쳐 설치할 수 있어요.',cost:{metal:1},color:'#caab80'},
  gaspipe:{name:'기체관',description:'산소·이산화탄소·증기·수소를 운반합니다. 기체 펌프, 배출구 또는 수소 발전기 칸에 연결하세요.',cost:{metal:1},color:'#8bc8b7'},
};
const sourceDescriptions={
  generator:'대원이 발전기를 돌리는 동안 400 W를 생산합니다.',
  coalgen:'석탄 1 kg/s로 600 W를 생산하고 이산화탄소를 배출합니다.',
  hydrogenGen:'수소 100 g/s로 최대 800 W를 생산합니다.',
  electrolyzer:'청수 1 kg/s를 산소 888 g/s와 수소 112 g/s로 분해합니다. 전력 120 W, 최소 출력 온도 70°C.',
  diffuser:'조류 550 g/s를 소비해 산소 500 g/s를 생산합니다. 전력 120 W, 최소 출력 온도 30°C.',
  battery:'연결된 회로의 잉여 전력으로 최대 10 kJ를 저장합니다.',
  pump:'인접한 물을 청수 배관으로 보냅니다. 최대 10 kg/s, 전력 240 W.',
  farm:'끼니나무는 10~30°C에서 흙 10 kg/주기를 소비합니다. 3주기 자라면 600 kcal를 수확합니다.'
};
const definitionFor = type => {
  const source=infrastructure[type]||BUILDINGS[type],def=source&&game.originalRules?{...source,power:game.buildingPower(type)}:source;
  if(game.modernRules&&type==='research')return {...def,description:'흙과 60 W 전력을 사용하는 기초 연구 작업대입니다. 연구 탭에서 기술을 선택하세요.'};
  if(game.modernRules&&type==='pump')return {...def,description:'인접한 물 또는 오수를 최대 10 kg/s로 취수해 녹색 액체 출구로 보냅니다.'};
  if(game.modernRules&&type==='reservoir')return {...def,name:'액체 저장소',description:'입구로 들어온 청수와 오수를 합계 5,000 kg까지 저장해 출구로 보냅니다.'};
  if(game.modernRules&&type==='pipe')return {...def,name:'액체관',description:'청수와 오수를 칸당 최대 10 kg씩 보냅니다. 한 칸에는 한 종류의 액체만 흐릅니다.'};
  return game.originalRules&&sourceDescriptions[type]?{...def,description:sourceDescriptions[type]}:def;
};
const AUTO_OPTIONS = {generator:['always','battery'],coalgen:['always','battery'],hydrogenGen:['always','battery'],diffuser:['always','oxygen'],electrolyzer:['always','oxygen'],cooler:['always','temperature']};
const AUTO_LABELS = {always:'항상 가동',battery:'배터리 충전율에 맞추기',oxygen:'산소 농도에 맞추기',temperature:'온도에 맞추기'};
const GOAL_TOOLS = {dig:'dig',oxygen:'diffuser',battery:'battery',farms:'farm',research:'research',sanitation:'toilet',hygiene:'sink',water:'pump',pumped:'pump',recycle:'purifier',purify:'purifier',electrolysis:'electrolyzer',hydrogen:'hydrogenGen',haul:'storage',cooking:'kitchen',dining:'mess',rooms:'door',portable:'oxygenDock'};

const toolNotes = {
  inspect:['살아 있는 기지를 살펴보세요','타일이나 시설을 선택하면 자원, 환경과 작동 상태를 자세히 볼 수 있어요.','오른쪽 초상화를 누르면 대원이 있는 곳으로 이동합니다.'],
  dig:['새로운 공간을 만드세요','흙과 광맥을 드래그해 채굴 작업을 지정하세요. 대원은 접근 가능한 곳부터 자동으로 작업합니다.','채굴한 고체는 현장에 남습니다. 운반이 끝나야 건설에 쓸 수 있어요.'],
  cancel:['계획은 언제든 바꿀 수 있어요','드래그한 영역의 대기 작업을 취소합니다. 건설 중인 시설의 비용은 돌아옵니다.','완성된 시설을 없애려면 철거를 사용하세요.'],
  pan:['더 넓은 세계를 살펴보세요','화면을 드래그해 기지 주변을 탐색하세요. 휠이나 두 손가락으로 확대할 수 있어요.','아래의 기지로 버튼으로 언제든 돌아옵니다.'],
  deconstruct:['다시 쓸 수 있는 자원','완성된 시설을 선택하면 대원이 철거합니다. 건설 자원의 일부를 돌려받아요.','바닥과 사다리는 대원의 귀환 경로를 확인하세요.'],
  removePipe:['급수관 제거','선택한 칸의 급수관만 제거합니다. 다른 시설과 배수관은 유지됩니다.','물이 남아 있다면 먼저 연결된 저장 공간을 확보하세요.'],
  removeWastepipe:['배수관 제거','선택한 칸의 배수관만 제거합니다.','오수가 남아 있다면 연결된 저장 공간을 확보하세요.'],
  priority:['이 일부터 부탁할게요','지정한 영역의 작업 우선순위를 높입니다. 급한 채굴이나 건설에 사용하세요.','대원의 역할 설정으로 작업 성향을 바꿀 수 있어요.'],
};

function toast(message, tone='good', duration=3200) {
  if (!message) return;
  const el = document.createElement('div'); el.className = `toast ${tone}`; el.textContent = message;
  $('toasts').appendChild(el);
  while ($('toasts').children.length > 3) $('toasts').firstElementChild.remove();
  setTimeout(() => el.remove(), duration);
}

function beep(kind='click') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();
    const osc = audioContext.createOscillator(), gain = audioContext.createGain(), now = audioContext.currentTime;
    osc.type = 'sine'; osc.frequency.setValueAtTime(kind === 'error' ? 180 : kind === 'build' ? 540 : 420, now);
    osc.frequency.exponentialRampToValueAtTime(kind === 'error' ? 110 : 720, now+.08);
    gain.gain.setValueAtTime(.035, now); gain.gain.exponentialRampToValueAtTime(.001, now+.12);
    osc.connect(gain).connect(audioContext.destination); osc.start(now); osc.stop(now+.13);
  } catch { soundEnabled = false; }
}

function lockedTool(type){
  return game.modernRules?!isBuildingResearchUnlocked(game,type):(definitionFor(type)?.unlock||0)>game.stats.research;
}
function rotateBridge(){
  game.buildRotation=((game.buildRotation||0)+1)%4;
  setTool(tool);
}
function setTool(next) {
  if ((BUILDINGS[next]||infrastructure[next])&&lockedTool(next)) { toast(game.modernRules?`필요한 연구 · ${researchTechName(RESEARCH_UNLOCKS[next])}`:`연구 ${BUILDINGS[next].unlock} 포인트가 필요해요.`, 'warn'); return; }
  tool = next; renderer.tool = next; renderer.dragRect = null;
  $$('[data-tool]').forEach(el => { el.classList.toggle('active', el.dataset.tool === next); el.setAttribute('aria-pressed',el.dataset.tool === next); });
  $$('.build-card').forEach(el => el.classList.toggle('active', el.dataset.build === next));
  canvas.style.cursor = next === 'pan' ? 'grab' : next === 'inspect' ? 'default' : 'crosshair';
  const definition = definitionFor(next);
  if(['pipe','wastepipe','liquidBridge','liquidVent'].includes(next))setOverlay('plumbing');
  if(['gaspipe','removeGasPipe','gasPump','gasVent','gasBridge'].includes(next))setOverlay('gas');
  const note = definition ? [definition.name,definition.description,`${costText(definition.cost)}${definition.power ? ` · ${definition.power>0?'소비':'생산'} ${Math.abs(definition.power)} W` : ''} · ${infrastructure[next]?'드래그로 즉시 연결':'빈 칸을 눌러 건설 예약'}`] : toolNotes[next];
  if(note&&game.modernRules&&BUILDING_FOOTPRINTS[next]){const {width,height}=BUILDING_FOOTPRINTS[next];note[2]+=' · '+width+'×'+height+'칸';}
  if (note) $('tool-note').innerHTML = `<span class="note-eyebrow">${escapeHTML(note[0])}</span><p>${escapeHTML(note[1])}</p><div class="note-rule"></div><small>${escapeHTML(note[2])}</small>`;
  if(game.modernRules&&BUILDING_FOOTPRINTS[next]?.rotatable){
    const rotate=document.createElement('button');rotate.type='button';
    rotate.textContent=`회전 (R) · ${(game.buildRotation||0)*90}°`;rotate.onclick=rotateBridge;$('tool-note').append(rotate);
  }
  beep();
}
function costText(cost) { return Object.entries(cost || {}).filter(([,value])=>value>0).map(([key,value]) => `${resources[key] || key} ${value}`).join(' · '); }
function renderBuildMenu() {
  const visibleCategories=Object.keys(categories).filter(key=>key!=='gas'||game.originalRules);
  if(!visibleCategories.includes(category))category='base';
  $$('.category-tabs button').forEach(el => { const visible=visibleCategories.includes(el.dataset.category),active=el.dataset.category===category;el.hidden=!visible; el.classList.toggle('active',active); el.setAttribute('aria-selected',active); });
  $('build-grid').innerHTML = categories[category].filter(type=>game.modernRules?type!=='wastepipe':!['supercomputer','planetarium','steamRocket','liquidVent','gasBridge','liquidBridge'].includes(type)&&(game.originalRules||!['gasPump','gasVent','gaspipe'].includes(type))).map(type => {
    const def = definitionFor(type);
    if (!def) return '';
    const locked = lockedTool(type);
    return `<button class="build-card ${tool===type?'active':''} ${locked?'locked':''}" data-build="${type}" style="--item-color:${def.color || '#8de0bd'}" title="${escapeHTML(def.description)} · ${escapeHTML(costText(def.cost))}${locked?(game.modernRules?` · ${researchTechName(RESEARCH_UNLOCKS[type])} 연구 필요`:` · 연구 ${def.unlock} 필요`):''}"><span class="build-symbol">${icon(type)}</span><b>${escapeHTML(def.name)}</b><small>${escapeHTML(costText(def.cost))}</small>${locked?`<span class="locked-tag">${icon('lock')}</span>`:''}</button>`;
  }).join('');
  $$('.build-card').forEach(el => el.addEventListener('click',()=>setTool(el.dataset.build)));
}
function setOverlay(next) {
  renderer.overlay = next;
  $$('[data-overlay]').forEach(el => { el.classList.toggle('active',el.dataset.overlay===next); el.setAttribute('aria-pressed',el.dataset.overlay===next); });
  const legend = $('overlay-legend'); legend.hidden = next==='normal';
  if (next==='oxygen') legend.innerHTML='<div class="legend-ramp"></div><div class="legend-ends"><span>숨쉬기 어려움</span><span>풍부함</span></div>';
  if (next==='temperature') legend.innerHTML='<div class="legend-ramp" style="background:linear-gradient(90deg,#65a5d8,#8ed6b2,#e8a65e,#de7573)"></div><div class="legend-ends"><span>차가움</span><span>뜨거움</span></div>';
  if (next==='plumbing') legend.innerHTML='<span style="color:#8bc8e3">━ ○ 급수</span>　<span style="color:#d5b47f">┄ □ 배수</span><br><small>X 배관 없음 · 황색 연결 확인 · 펄스 실제 유량</small>';
  if (next==='gas') legend.innerHTML='<span style="color:#8bc8b7">━ ◇ 기체관</span>　<span style="color:#59a4db">■ H₂ 농도</span><br><small>색이 진할수록 수소 비율이 높아요 · 수소는 부력으로 위쪽에 모입니다.</small>';
  if(game.modernRules&&next==='gas')legend.innerHTML='<span style="color:#85d2b0">■ 산소</span>　<span style="color:#bf9f73">■ 이산화탄소</span>　<span style="color:#db9de1">■ 수소</span>　<span style="color:#d9e3ef">■ 증기</span><br><small>○ 흰색 입구 · 녹색 출구 · 관 한 칸 1 kg</small>';
  if(game.modernRules&&next==='plumbing')legend.innerHTML='<span style="color:#a8e5df">● 청수</span>　<span style="color:#d6aa59">● 오수</span><br><small>○ 흰색 입구 · 녹색 출구 · 관 한 칸 10 kg</small>';
  if (next==='logistics') legend.innerHTML='<span style="color:#e8c48d">◇ 현장 자원</span>　<span style="color:#a3c9e0">▣ 수거 거점</span><br><small>상자를 든 대원은 실제 운반 중 · H로 전환</small>';
  if (next==='rooms') legend.innerHTML='<span style="color:#bbade3">■ 침실</span>　<span style="color:#e0bd85">■ 식당</span>　<span style="color:#a1c88a">■ 온실</span><br><small>벽·타일·문으로 나눈 실제 공간 · R로 전환</small>';
  if (next==='power') legend.innerHTML='<span style="color:#e8cb7f">━ 전력망</span>　<span style="color:#ef9887">○ 미연결</span>';
  beep();
}
function setSpeed(next) {
  if (game.lost && next) { toast('탐사가 종료되었어요. 새 기지를 시작해 주세요.','warn'); return; }
  speed=next; if (next) previousSpeed=next;
  $$('[data-speed]').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===next));
  $('pause-button').classList.toggle('paused',next===0);
  $('pause-button').innerHTML=icon(next===0?'play':'pause');
  $('pause-button').setAttribute('aria-label',next===0?'계속 진행':'일시정지');
  $('paused-stamp').hidden=next!==0 || !!document.querySelector('dialog[open]');
}
function switchPanel(next, open=false) {
  activePanel=next;
  $$('[data-panel]').forEach(el=>el.classList.toggle('active',el.dataset.panel===next));
  ['colony','systems','logistics','rooms','goals','research','inspect','log'].forEach(key=>{$(`${key}-panel`).hidden=key!==next;});
  if (open && window.innerWidth<=1000) document.body.classList.add('panel-open');
  if (next==='log') $('event-dot').style.opacity='0';
  if (next==='systems') renderOperations();
  if (next==='research') renderGoals();
  if (next==='logistics') renderLogistics();
  if (next==='rooms') renderRooms();
  if (next==='inspect') renderInspector();
}
function openDialog(id) {
  if (document.querySelector('dialog[open]')) return;
  dialogSpeed=speed; setSpeed(0); $(id).showModal(); $('paused-stamp').hidden=true;
}
function closeDialog(id) { $(id).close(); setSpeed(dialogSpeed); }
$$('dialog').forEach(dialog=> {
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog(dialog.id);});
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog(dialog.id);}});
});

function save(manual=false) {
  if(saveBlocked&&!manual)return false;
  try {
    const payload = {format:'breath-colony',savedAt:new Date().toISOString(),game:game.serialize()};
    localStorage.setItem(SAVE_KEY,JSON.stringify(payload)); saveUnavailable=false; saveBlocked=false; lastSaveTime=performance.now();
    $('autosave-status').textContent='방금 전'; if(manual)toast('지금의 기지를 저장했어요.');
    return true;
  } catch { saveUnavailable=true; $('autosave-status').textContent='사용 불가'; if(manual)toast('저장 공간을 사용할 수 없어요. 세이브 내보내기를 이용해 주세요.','warn',5000); return false; }
}
function afterLoad() {
  renderer.game=game; renderer.selection=null; renderer.dragRect=null; currentSelection=null; inspectorKey=''; operationsSignature=''; logisticsSignature=''; roomSignature=''; trainingCrewId=null; $('inspector').innerHTML=emptyInspector;
  crewSignature='';eventSignature='';objectiveSignature='';lastUnlockSignature='';game.buildRotation=0;seenEnd=game.won?'won':game.lost?'lost':'';
  accumulator=0; oxygenHistory=[]; lastOxygenSample=-10; renderer.fit(); renderBuildMenu(); renderUI();
  $('onboarding').hidden=game.time>20;
  const rulesetLabel=$('ruleset-label');if(rulesetLabel)rulesetLabel.textContent=game.modernRules?'4.3 원작 규칙':game.originalRules?'4.2 호환 규칙':'4.1 호환 규칙';
  $('open-research-tree').hidden=!game.modernRules;
  const rulesetInput=$('ruleset-input');if(rulesetInput)rulesetInput.value=game.ruleset;
  document.querySelector('.world-location strong').textContent=`소행성 H–${game.seed || 73}`;
  document.querySelector('.session-label').innerHTML=`<i></i> COLONY ${String(game.seed || 73).padStart(3,'0')}`;
}
function loadSave(manual=false) {
  try {
    const raw=[SAVE_KEY,...LEGACY_SAVE_KEYS].map(key=>localStorage.getItem(key)).find(Boolean);
    if(!raw){if(manual)toast('이 브라우저에 저장한 기지가 없어요.','warn');return false;}
    const payload=JSON.parse(raw); if(payload.format!=='breath-colony'||!payload.game)throw new Error('다른 형식의 파일입니다.');
    const migrated=payload.game.version<4;
    if(game.load(payload.game)===false)throw new Error('유효한 세이브가 아닙니다.'); saveBlocked=false;afterLoad();
    if(migrated){dialogSpeed=0;setSpeed(0);toast('이전 세이브를 4.1 호환 규칙으로 이어왔어요. 기지 상태를 확인한 뒤 시간을 재개하세요.','good',7000);}
    else if(manual)toast('저장한 기지로 돌아왔어요.');return true;
  } catch(error){saveBlocked=true;toast(`저장한 기지를 불러오지 못했어요. 기존 파일은 보존했습니다. ${error.message}`,'warn',7000);return false;}
}
function newGame(seed,ruleset=MODERN_RULES) {
  saveBlocked=false;game.reset(clamp(Math.floor(Number(seed)||73),1,999999),ruleset);
  afterLoad(); seenEnd=''; $('onboarding').hidden=false;setTool('inspect');setOverlay('normal');setSpeed(1);save();
  toast('새로운 탐사가 시작됩니다. 기지 옆의 흙을 채굴해 보세요.');
}

function renderCrew() {
  const signature=game.crew.map(c=>c.id).join(',');
  if(signature!==crewSignature){
    crewSignature=signature;
    const roles=[['balanced','균형'],['dig','채굴'],['build','건설'],['operate','운영'],['farm','농사'],['haul','운반'],['cook','조리']];
    $('crew-list').innerHTML=game.crew.map(c=>`<div class="crew-card" data-crew="${c.id}"><button class="crew-avatar" style="--crew-color:${escapeHTML(c.color)}" aria-label="${escapeHTML(c.name)}에게 이동"><i></i></button><div class="crew-body"><div class="crew-top"><b>${escapeHTML(c.name)}</b><select class="crew-role" aria-label="${escapeHTML(c.name)} 역할">${roles.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></div><div class="crew-action"></div><div class="crew-bars"><span class="bar" title="건강"><i style="background:#8ad4ac"></i></span><span class="bar" title="포만감"><i style="background:#dfbd7e"></i></span><span class="bar" title="기력"><i style="background:#a89ed2"></i></span><span class="bar" title="위생"><i style="background:#86c5e3"></i></span></div><div class="crew-needs"><span class="need-bladder"></span><span class="need-hygiene"></span><span class="need-stress"></span></div><div class="crew-routine"><select class="crew-schedule" aria-label="${escapeHTML(c.name)} 교대">${Object.entries(SCHEDULE_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select><span class="schedule-phase"></span><small class="schedule-rests"></small></div><div class="crew-growth"><span class="crew-level"></span><button class="crew-training" aria-label="${escapeHTML(c.name)} 기술 배분">기술 ↗</button></div><div class="crew-xp"><i></i></div><div class="crew-equipment"><button class="crew-mask" aria-label="${escapeHTML(c.name)} 휴대 산소 모드"></button><span class="crew-portable"></span></div><div class="crew-cargo" hidden></div></div></div>`).join('');
    $$('.crew-card').forEach(el=>{
      const findCrew=()=>game.crew.find(c=>String(c.id)===el.dataset.crew);
      el.querySelector('.crew-avatar').addEventListener('click',()=>{const c=findCrew();if(c)renderer.centerOn(c.x,c.y);});
      el.querySelector('.crew-role').addEventListener('change',event=>{const c=findCrew();if(c&&game.setCrewRole(c.id,event.target.value))toast(`${c.name}의 역할을 바꿨어요.`);});
      el.querySelector('.crew-schedule').addEventListener('change',event=>{const c=findCrew();if(c&&game.setCrewSchedule){const result=game.setCrewSchedule(c.id,event.target.value);toast(result.message,result.ok?'good':'warn');}});
      el.querySelector('.crew-training').addEventListener('click',()=>{const c=findCrew();if(c)openTraining(c.id);});
      el.querySelector('.crew-mask').addEventListener('click',()=>{const c=findCrew();if(c){const result=game.setCrewMaskMode(c.id,c.maskMode==='off'?'auto':'off');toast(result.message,result.ok?'good':'warn');renderCrew();}});
    });
  }
  $$('.crew-card').forEach(el=>{
    const c=game.crew.find(c=>String(c.id)===el.dataset.crew);if(!c)return;
    el.classList.toggle('dead',c.health<=0);el.querySelector('.crew-action').textContent=c.health<=0?'탐사 종료':c.action||'주변을 살피는 중';
    el.querySelector('.crew-action').title=`건강 ${Math.round(c.health)} · 포만 ${Math.round(c.hunger)} · 기력 ${Math.round(c.energy)} · 스트레스 ${Math.round(c.stress)} · 호흡 ${Math.round(c.breath)}`;
    const bladder=el.querySelector('.need-bladder'),hygiene=el.querySelector('.need-hygiene'),stress=el.querySelector('.need-stress');
    bladder.textContent=`용변 ${Math.round(c.bladder||0)}`;bladder.className=`need-bladder ${c.bladder>80?'critical':c.bladder>55?'urgent':''}`;
    hygiene.textContent=`위생 ${Math.round(c.hygiene??100)}`;hygiene.className=`need-hygiene ${(c.hygiene??100)<30?'critical':(c.hygiene??100)<55?'urgent':''}`;
    stress.textContent=`긴장 ${Math.round(c.stress||0)}`;stress.className=`need-stress ${c.stress>75?'critical':c.stress>40?'urgent':''}`;
    const role=el.querySelector('.crew-role'),schedule=el.querySelector('.crew-schedule');
    if(document.activeElement!==role)role.value=c.role;
    if(document.activeElement!==schedule)schedule.value=c.schedule||'auto';
    const phase=el.querySelector('.schedule-phase');phase.textContent=(c.schedule||'auto')==='auto'?'필요에 맞춰':PHASE_LABELS[c.schedulePhase]||'작업 시간';phase.className=`schedule-phase ${c.schedulePhase||'work'}`;
    el.querySelector('.schedule-rests').textContent=`휴식 ${c.restedCycles||0}회`;
    el.querySelector('.crew-level').textContent=`숙련 ${c.level||0} · 경험 ${Math.floor(c.experience||0)}`;
    const training=el.querySelector('.crew-training');training.textContent=c.skillPoints>0?`기술 +${c.skillPoints} ↗`:'기술 ↗';training.classList.toggle('available',c.skillPoints>0);
    const xp=el.querySelector('.crew-xp');xp.title=c.level>=6?'최대 숙련 달성':`다음 숙련까지 경험 ${Math.max(0,Math.ceil(((c.level||0)+1)*60-(c.experience||0)))}`;
    xp.firstElementChild.style.width=`${c.level>=6?100:clamp(((c.experience||0)%60)/60*100,0,100)}%`;
    const mask=el.querySelector('.crew-mask');mask.textContent=c.maskMode==='off'?'휴대 산소 꺼짐':'휴대 산소 자동';mask.setAttribute('aria-pressed',c.maskMode!=='off');mask.disabled=c.health<=0;
    const portable=el.querySelector('.crew-portable');portable.textContent=`${Number(c.portableOxygen||0).toFixed(1)} / ${c.portableCapacity||6}`;portable.title=c.usingPortable?'현재 휴대 산소로 호흡 중':`저산소 환경에서 약 ${Math.floor((c.portableOxygen||0)/game.breathRate)}초 호흡할 수 있어요.`;el.querySelector('.crew-equipment').classList.toggle('using',!!c.usingPortable);
    const cargo=el.querySelector('.crew-cargo');cargo.hidden=!c.cargo;cargo.textContent=c.cargo?`${resources[c.cargo.resource]||'자원'} ${Number(c.cargo.amount||0).toFixed(1)} 운반 중`:'';
    el.querySelectorAll('.bar i').forEach((bar,i)=>{bar.style.width=`${clamp([c.health,c.hunger,c.energy,c.hygiene??100][i]||0,0,100)}%`;});
  });
}
function openTraining(id){trainingCrewId=id;renderTraining();openDialog('skills-dialog');}
function renderTraining(){
  const c=game.crew.find(c=>c.id===trainingCrewId);if(!c)return;
  $('skills-name').textContent=`${c.name}의 다음 가능성`;
  $('skills-level').textContent=`숙련 ${c.level||0} / 6`;$('skills-points').textContent=`배분 가능 ${c.skillPoints||0}`;
  $('skills-experience').textContent=c.level>=6?'최대 숙련에 도달했어요.':`누적 경험 ${Math.floor(c.experience||0)} / ${((c.level||0)+1)*60}`;
  $('skills-progress-fill').style.width=`${c.level>=6?100:clamp(((c.experience||0)%60)/60*100,0,100)}%`;
  $$('[data-skill-card]').forEach(card=>{const key=card.dataset.skillCard,rank=c.skills?.[key]||0,button=card.querySelector('button');card.querySelector('.skill-rank').textContent=`${rank} / 3`;button.disabled=c.health<=0||!c.skillPoints||rank>=3;button.textContent=rank>=3?'최대 단계':`${SKILL_LABELS[key]} 훈련 +1`;card.classList.toggle('mastered',rank>=3);});
}
function renderInspector() {
  if(!currentSelection)return;
  const {x,y}=currentSelection,data=game.inspect(x,y),b=data.building;
  const selectedCell=game.cell(x,y);
  const canInsulate=selectedCell?.revealed&&selectedCell.solid==='tile'&&!selectedCell.insulated;
  const key=`${x},${y}:${b?.id||0}:${b?.progress>=1}:${canInsulate}`;
  if(key!==inspectorKey){
    inspectorKey=key;
    const modes=b?AUTO_OPTIONS[b.type]:null;
    $('inspector').innerHTML=`<div class="inspect-heading"><small>COLONY OBSERVATION</small><h3 id="inspect-title"></h3><p>좌표 ${x}, ${y} · 심도 ${y*8} m</p></div><div id="inspect-connections" class="inspect-connections"></div><div id="inspect-lines"></div>${b?.type==='steamRocket'&&b.progress>=1?'<button class="inspect-action" id="launch-flight">연구 로켓 출항</button>':''}${canInsulate?'<button class="inspect-action" id="insulate-tile">단열 보강 · 암석 6</button>':''}${b&&b.progress>=1&&!['core','ladder','tile','door'].includes(b.type)?'<button class="inspect-action" id="toggle-building"></button>':''}${modes&&b.progress>=1?`<label class="automation-field">설비 자동 제어<select id="automation-select">${modes.map(mode=>`<option value="${mode}">${AUTO_LABELS[mode]}</option>`).join('')}</select></label><p class="automation-note">목표 범위에 들어가면 잠시 대기하고, 다시 필요해지면 가동합니다. 수동 정지가 우선합니다.</p>`:''}${b?.type==='kitchen'&&b.progress>=1?'<label class="automation-field" for="kitchen-target">공용 조리식 목표 비축량</label><div class="kitchen-target-wrap"><input type="number" id="kitchen-target" min="0" max="60" step="1"><span>끼</span></div><p class="automation-note">목표량에 도달하면 새 조리를 쉬어요. 0은 조리 대기입니다. 조리 중인 한 배치가 목표를 넘길 수 있어요.</p><div class="recipe-track"><i id="recipe-fill"></i></div>':''}${b?.type==='door'&&b.progress>=1?`<label class="automation-field">출입문 모드<select id="door-mode">${Object.entries(DOOR_LABELS).map(([mode,label])=>`<option value="${mode}">${label}</option>`).join('')}</select></label><p id="door-state" class="automation-note"></p><p class="automation-note">닫힌 문은 기체와 물을 막아요. 잠금은 이동도 막습니다. 대원이 문 칸에 서 있으면 잠글 수 없어요.</p>`:''}${b?.type==='oxygenDock'&&b.progress>=1?'<div class="inspect-oxygen"><span>저장한 산소</span><b id="inspect-oxygen-amount"></b><div class="oxygen-track"><i id="inspect-oxygen-fill"></i></div><small>대원이 직접 방문해 휴대통을 채웁니다.</small></div>':''}<div id="inspect-room"></div><div id="inspect-piles" class="inspect-piles"></div><div class="pipe-actions" id="pipe-actions"></div>`;
    if($('insulate-tile'))$('insulate-tile').addEventListener('click',()=>{
      const result=game.queue('insulate',x,y);toast(result.message,result.ok?'good':'warn');renderInspector();
    });
    if($('launch-flight'))$('launch-flight').onclick=()=>{const r=game.launchResearchFlight(b.id);toast(r.message,r.ok?'good':'warn');renderInspector();};
    if($('automation-select'))$('automation-select').addEventListener('change',event=>{const result=game.setAutomation(b.id,event.target.value);toast(result.message,result.ok?'good':'warn');});
    if($('toggle-building'))$('toggle-building').addEventListener('click',()=>{game.toggleBuilding(b.id);renderInspector();});
    if($('door-mode'))$('door-mode').addEventListener('change',event=>{const result=game.setDoorMode(b.id,event.target.value);toast(result.message,result.ok?'good':'warn');event.target.value=b.doorMode;renderInspector();});
    if($('kitchen-target'))$('kitchen-target').addEventListener('change',event=>{const result=game.setKitchenTarget(b.id,Number(event.target.value));toast(result.message,result.ok?'good':'warn');event.target.value=b.mealTarget;});
  }
  $('inspect-title').textContent=data.title;
  $('inspect-lines').innerHTML=(data.lines||[]).map(line=>`<div class="inspect-line">${escapeHTML(line)}</div>`).join('');
  const needsClean=!(game.originalRules&&b?.type==='farm')&&['steamTurbine','farm','research','toilet','sink','electrolyzer','cooler','pump','purifier','reservoir','core','kitchen'].includes(b?.type);
  const needsWaste=['toilet','sink','cooler','purifier','reservoir'].includes(b?.type);
  $('inspect-connections').innerHTML=b&&b.progress>=1?`${BUILDINGS[b.type]?.power?`<span class="connection-chip ${b.connected?'':'off'}">전력 ${b.connected?'연결':'미연결'}</span>`:''}${needsClean?`<span class="connection-chip ${b.waterConnected?'':'off'}">급수 ${b.waterConnected?'연결':'미연결'}</span>`:''}${needsWaste?`<span class="connection-chip ${b.wasteConnected?'':'off'}">배수 ${b.wasteConnected?'연결':'미연결'}</span>`:''}`:'';
  if(game.modernRules&&b){
    const labels={power:'전력',gasIn:'기체 입구',gasOut:'기체 출구',liquidIn:'액체 입구',liquidOut:'액체 출구'};
    $('inspect-connections').innerHTML=Object.keys(BUILDING_FOOTPRINTS[b.type]?.ports||{}).map(key=>{
      const pos=buildingPort(b,key),cell=game.cell(pos.x,pos.y),ok=cell?.[key==='power'?'wire':key.startsWith('gas')?'gasPipe':'pipe'];
      return `<span class="connection-chip ${ok?'':'off'}">${labels[key]} (${pos.x}, ${pos.y}) · ${ok?'연결':'미연결'}</span>`;
    }).join('');
  }
  if($('toggle-building'))$('toggle-building').textContent=b.enabled?'시설 일시정지':'시설 다시 가동';
  if($('automation-select')&&document.activeElement!==$('automation-select'))$('automation-select').value=b.automation||'always';
  if($('kitchen-target')&&document.activeElement!==$('kitchen-target'))$('kitchen-target').value=b.mealTarget??12;
  if($('recipe-fill'))$('recipe-fill').style.width=`${clamp(b.recipeProgress||0,0,1)*100}%`;
  if($('door-mode')&&document.activeElement!==$('door-mode'))$('door-mode').value=b.doorMode||'auto';
  if($('door-state'))$('door-state').textContent=`현재 ${b.doorOpen?'열림':'닫힘'} · ${DOOR_LABELS[b.doorMode]||'자동 출입'}`;
  if($('inspect-oxygen-amount'))$('inspect-oxygen-amount').textContent=`${Number(b.oxygenStored||0).toFixed(2)} / ${b.oxygenCapacity||18}`;
  if($('inspect-oxygen-fill'))$('inspect-oxygen-fill').style.width=`${clamp((b.oxygenStored||0)/(b.oxygenCapacity||18),0,1)*100}%`;
  const currentRoom=game.roomAt?.(x,y),adjacentRooms=b?.type==='door'?(game.rooms||[]).filter(r=>(r.doorIds||[]).includes(b.id)):[];
  const observedRooms=currentRoom?[currentRoom]:adjacentRooms;
  updateHTML($('inspect-room'),observedRooms.map(room=>`<section class="inspect-room ${escapeHTML(room.type)}"><span>${escapeHTML(room.name||ROOM_LABELS[room.type]||'공간')} · ${room.area}칸</span><p>${escapeHTML(room.valid?room.bonus:(room.reasons||[]).join(' · '))}</p><button data-room-details>구역 현황 보기 ↗</button></section>`).join(''));
  const piles=(game.debris||[]).filter(p=>p.x===x&&p.y===y&&p.amount>0);
  updateHTML($('inspect-piles'),piles.map(p=>`<div class="pile-inspect"><span>${escapeHTML(resources[p.resource]||p.resource)} ${Number(p.amount).toFixed(1)}</span><button data-pile-priority="${p.id}" title="운반 우선순위를 높입니다">운반 우선 ${p.priority||3} ↑</button><small>${escapeHTML(p.blockedReason||(p.reservedBy?'수거 대원이 이동 중이에요.':'수거를 기다리고 있어요.'))}</small></div>`).join(''));
  const cell=game.cells[y*game.w+x];
  const bridges=game.modernRules?game.buildings.filter(v=>{
    if(v.type!=='gasBridge'&&v.type!=='liquidBridge')return false;
    const r=buildingBounds(v);return x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height;
  }):[];
  const bridgeActions=bridges.map(v=>`<button data-remove-pipe="${v.type==='gasBridge'?'removeGasBridge':'removeLiquidBridge'}">${escapeHTML(BUILDINGS[v.type].name)} 해체</button>`).join('');
  updateHTML($('pipe-actions'),bridgeActions+`${cell?.pipe?`<button data-remove-pipe="removePipe">${game.modernRules?'액체관':'급수관'}만 제거</button>`:''}${cell?.wastepipe?'<button data-remove-pipe="removeWastepipe">배수관만 제거</button>':''}${game.originalRules&&cell?.gasPipe?'<button data-remove-pipe="removeGasPipe">기체관만 제거</button>':''}`);
}
function trendSVG(values,color){
  if(values.length<2)values=[values[0]||0,values[0]||0];
  const min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min);
  const points=values.map((value,i)=>`${3+i*214/(values.length-1)},${37-(value-min)/range*30}`);
  return `<svg viewBox="0 0 220 43" role="img" aria-label="실제 기록의 변화 추세"><path d="M3 38H217" stroke="#38515e" stroke-width=".6"/><path d="M${points.join(' L')} L217 40 L3 40Z" fill="${color}" opacity=".07"/><polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/></svg><div class="trend-caption">최소 ${min.toFixed(1)} · 최대 ${max.toFixed(1)}</div>`;
}
function renderLogistics(){
  const l=game.logistics||{},piles=(game.debris||[]).filter(p=>p.amount>0),crew=game.crew;
  $('logistics-stored').textContent=number(l.stored||0);$('logistics-capacity').textContent=`전체 용량 ${number(l.capacity||0)}`;
  $('logistics-loose').textContent=number(l.loose||0);$('logistics-carry').textContent=`운반 중 ${Number(l.carried||0).toFixed(1)}`;
  const fill=(l.capacity||0)>0?(l.stored||0)/l.capacity:0;$('storage-fill').style.width=`${clamp(fill,0,1)*100}%`;
  $('logistics-status').textContent=l.blockedPiles?`${l.blockedPiles}곳 점검`:fill>=.98?'비축 공간이 가득해요':'수거 경로를 살펴보세요';
  $('logistics-status').classList.toggle('warning',!!l.blockedPiles||fill>=.98);
  $('haul-count').textContent=`누적 ${number(game.production?.hauledItems||0)}`;
  const signature=`${piles.length}:`+piles.map(p=>`${p.id}:${Math.floor(p.amount*10)}:${p.priority}:${p.reservedBy}:${p.blockedReason||''}`).join('|');
  if(signature!==logisticsSignature){
    logisticsSignature=signature;
    const rows=[...piles].sort((a,b)=>Number(!!b.blockedReason)-Number(!!a.blockedReason)||(b.priority||3)-(a.priority||3)).slice(0,16);
    $('pile-list').innerHTML=rows.length?rows.map(p=>`<div class="pile-card ${p.blockedReason?'blocked':''}"><button class="pile-priority" data-pile-priority="${p.id}" aria-label="${escapeHTML(resources[p.resource]||p.resource)} 운반 우선순위 ${p.priority||3}, 누르면 증가">${p.priority||3}</button><div><b>${escapeHTML(resources[p.resource]||p.resource)} <span>${Number(p.amount).toFixed(1)}</span></b><small>${escapeHTML(p.blockedReason||(p.reservedBy?'수거 예약됨':'수거 대기'))} · ${p.x}, ${p.y}</small></div><button class="job-jump" data-pile-jump="${p.id}" aria-label="${escapeHTML(resources[p.resource]||p.resource)} 더미 위치로 이동">↗</button></div>`).join('')+(piles.length>16?`<p class="panel-explanation">전체 ${piles.length}곳 중 우선 확인할 16곳을 표시합니다.</p>`:''):'<p class="empty-state">현장에 남은 자원이 없어요.<br>채굴한 고체는 수거한 뒤 비축에 들어갑니다.</p>';
  }
  const hauling=crew.filter(c=>c.cargo||c._job?.kind==='haul');
  updateHTML($('haul-workers'),hauling.length?hauling.map(c=>`<button class="haul-worker" data-crew-jump="${c.id}"><i style="background:${escapeHTML(c.color)}"></i><span>${escapeHTML(c.name)}<small>${escapeHTML(c.cargo?`${resources[c.cargo.resource]||'자원'} ${Number(c.cargo.amount).toFixed(1)} 운반 중`:c.action||'수거하러 이동')}</small></span><b>↗</b></button>`).join(''):'<p class="panel-explanation">현재 운반 중인 대원이 없어요. 운반 역할을 지정하면 수거를 우선합니다.</p>');
  $('stock-by-resource').innerHTML=(game.originalRules?['rock','metal','algae','coal','soil']:['rock','metal','algae','coal']).map(key=>`<div><span>${resources[key]}</span><b>${number(game.resources[key])}</b><small>현장 ${number(piles.filter(p=>p.resource===key).reduce((sum,p)=>sum+p.amount,0))}</small></div>`).join('');
}

function renderFrontierSummary(){
  const f=game.frontier||{seconds:0,target:180,healthy:false,reasons:['침실·식당, 대원 기술과 휴대 산소를 준비하세요.']};
  const time=`${Math.floor(f.seconds)} / ${f.target}초`;
  $('frontier-value').textContent=time;$('goal-frontier-time').textContent=time;
  $('frontier-fill').style.width=`${clamp(f.seconds/f.target,0,1)*100}%`;
  $('frontier-reason').textContent=f.healthy?'생활과 탐사 준비가 이어지고 있어요. 이 상태를 유지하세요.':(f.reasons||[]).slice(0,3).join(' · ');
  $('goal-frontier-reasons').innerHTML=f.healthy?'<p class="ready">생활 공간과 대원의 탐사 준비가 안정적이에요.</p>':(f.reasons||[]).map(reason=>`<p>${escapeHTML(reason)}</p>`).join('');
  document.querySelector('.frontier-card').classList.toggle('healthy',f.healthy);
}
function renderRooms(){
  renderFrontierSummary();
  const rooms=game.rooms||[],valid=rooms.filter(r=>r.valid),equipment=game.equipment||{};
  $('room-count').textContent=`유효 ${valid.length} / ${rooms.length}개`;
  const signature='rooms:'+rooms.map(r=>`${r.id}:${r.type}:${r.valid}:${r.area}:${r.sealed}:${(r.doorIds||[]).join(',')}:${(r.cells||[]).join(',')}:${r.bonus}:${(r.reasons||[]).join(',')}`).join('|');
  if(signature!==roomSignature){
    roomSignature=signature;
    const ordered=[...rooms].sort((a,b)=>Number(b.valid)-Number(a.valid)||a.id-b.id);
    $('room-list').innerHTML=ordered.length?ordered.map(r=>`<section class="room-card ${escapeHTML(r.type)} ${r.valid?'valid':''}"><div><span class="room-symbol">${icon(r.type==='bedroom'?'cot':r.type==='messhall'?'mess':r.type==='greenhouse'?'farm':'rooms')}</span><h3>${escapeHTML(r.name||ROOM_LABELS[r.type]||'공간')}</h3><button data-room-jump="${r.id}" class="job-jump" aria-label="${escapeHTML(r.name||'방')} 위치로 이동">↗</button></div><small>${r.area}칸 · 출입문 ${(r.doorIds||[]).length}개 · ${r.sealed?'둘러싸인 공간':'열린 공간'}</small><p>${escapeHTML(r.valid?r.bonus:(r.reasons||[]).join(' · ')||'용도에 맞는 시설을 배치해 주세요.')}</p><div class="room-air" data-room-air="${r.id}"><span></span><small></small></div></section>`).join(''):'<div class="room-empty"><span>'+icon('rooms')+'</span><h3>나눌수록 편안한 공간</h3><p>6~64칸의 공간을 벽과 문으로 둘러싸세요. 침상이 있는 침실부터 시작해 보세요.</p></div>';
  }
  $$('#room-list [data-room-air]').forEach(el=>{const r=rooms.find(r=>String(r.id)===el.dataset.roomAir);if(!r?.cells?.length)return;const cells=r.cells.map(i=>game.cells[i]),oxygen=Math.round(cells.reduce((sum,c)=>sum+clamp(c.oxygen/.8,0,1),0)/cells.length*100),temperature=cells.reduce((sum,c)=>sum+c.temp,0)/cells.length;el.querySelector('span').textContent=`평균 산소 ${oxygen}%`;el.querySelector('small').textContent=`${temperature.toFixed(1)}°C`;el.classList.toggle('low-oxygen',oxygen<35);});
  $('compression-status').textContent=equipment.chargingStations?`${equipment.chargingStations}곳 압축 중`:'압축 대기';
  $('equipment-stored').textContent=Number(equipment.stored||0).toFixed(1);$('equipment-carried').textContent=Number(equipment.carried||0).toFixed(1);
  $('equipment-capacity').textContent=`저장 용량 ${Number(equipment.capacity||0).toFixed(0)}`;
  $('equipment-duration').textContent=`생존 대원 약 ${Math.floor(game.crew.filter(c=>c.health>0).reduce((sum,c)=>sum+(c.portableOxygen||0),0)/game.breathRate)}초 호흡`;
  const docks=game.buildings.filter(b=>b.type==='oxygenDock');
  updateHTML($('dock-list'),docks.length?docks.map(b=>`<div class="dock-card"><div><span>${b.progress<1?'건설 중인 충전소':'산소 충전소'}</span><button data-dock-jump="${b.id}" class="job-jump" aria-label="산소 충전소 ${b.x}, ${b.y} 위치로 이동">↗</button></div><strong>${Number(b.oxygenStored||0).toFixed(1)} <small>/ ${b.oxygenCapacity||18}</small></strong><div class="oxygen-track"><i style="width:${clamp((b.oxygenStored||0)/(b.oxygenCapacity||18),0,1)*100}%"></i></div><small>${escapeHTML(b.progress<1?`건설 ${Math.floor(b.progress*100)}%`:b.status||'대기 중')}</small></div>`).join(''):'<p class="empty-state">연구 45에 산소 충전소가 열립니다.<br>산소가 풍부한 곳에 두고 전선을 연결하세요.</p>');
  const p=game.production||{};
  $('bedroom-seconds').textContent=`${number(p.bedroomRestSeconds)}초`;$('messhall-meals').textContent=`${number(p.messhallMeals)}회`;
  $('greenhouse-harvests').textContent=`${number(p.greenhouseHarvests)}회`;$('protected-seconds').textContent=`${number(p.protectedSeconds)}초`;
}

function renderOperations(){
  const p=game.plumbing||{},r=game.resources,f=game.foodStatus||{};
  $('raw-food').textContent=`${Number(r.food||0).toFixed(1)} 끼`;$('cooked-food').textContent=`${Number(r.meals||0).toFixed(1)} 끼`;
  $('cold-state').textContent=f.cold?'냉장 보관 중':'실온 보관';$('cold-state').classList.toggle('cold',!!f.cold);
  $('food-loss').textContent=`현재 부패 ${((f.rawDecayPerSecond||0)+(f.cookedDecayPerSecond||0)).toFixed(3)} 끼/초 · 누적 ${Number(game.production?.foodSpoiled||0).toFixed(1)}끼`;
  $('meal-production').textContent=`조리 ${number(game.production?.mealsCooked||0)} · 식탁 식사 ${number(game.production?.tableMeals||0)}회`;
  $('clean-store').textContent=`${Number(r.water||0).toFixed(1)} L`;$('waste-store').textContent=`${Number(r.waste||0).toFixed(1)} L`;
  $('clean-capacity').textContent=`저장 용량 ${number(p.waterCapacity)} L`;$('waste-capacity').textContent=`저장 용량 ${number(p.wasteCapacity)} L`;
  $('water-flow').textContent=Number(p.waterFlow||0).toFixed(2);$('waste-flow').textContent=Number(p.wasteFlow||0).toFixed(2);
  const disconnected=game.buildings.filter(b=>b.progress>=1&&b.enabled&&['급수','배수','오수','청수'].some(word=>(b.status||'').includes(word))&&/부족|없|연결|막힘/.test(b.status||''));
  $('network-status').textContent=disconnected.length?`${disconnected.length}개 설비 점검`:'배관 현황';
  const history=(game.history||[]).slice(-60),last=history[history.length-1];
  const signature=`${last?.time||0}:${game.tasks.map(t=>`${t.id}-${Math.floor(t.progress*100)}-${t.blockedReason||''}`).join(',')}`;
  if(signature!==operationsSignature){
    operationsSignature=signature;
    const records=history.length?history:[{oxygen:game.stats.oxygen,food:r.food+(r.meals||0),water:r.water,power:game.power.capacity?game.power.stored/game.power.capacity*100:0}];
    $('history-period').textContent=history.length>1?`최근 ${Math.round((last.time-history[0].time)/60*10)/10}분`:'기록을 모으는 중';
    $('trend-charts').innerHTML=[['oxygen','호흡 환경','%','#8ad4ac'],['food','식량','끼','#dfbd7e'],['water','청수','L','#86c5e3'],['power','배터리','%','#b8a5d8']].map(([key,label,unit,color])=>`<div class="trend-card"><div><span>${label}</span><strong>${Number(records.at(-1)[key]||0).toFixed(1)} ${unit}</strong></div>${trendSVG(records.map(v=>Number(v[key])||0),color)}</div>`).join('');
    const tasks=[...game.tasks].sort((a,b)=>Number(!!b.blockedReason)-Number(!!a.blockedReason)||b.priority-a.priority).slice(0,10);
    $('task-list').innerHTML=tasks.length?tasks.map(t=>{const b=game.buildings.find(b=>b.id===t.buildingId),label=t.type==='dig'?'채굴':t.type==='deconstruct'?'철거':BUILDINGS[b?.type]?.name||'건설';return `<div class="job-card ${t.blockedReason?'blocked':''}"><span class="job-status">${t.blockedReason?'!':t.priority}</span><div class="job-body">${escapeHTML(label)} · ${Math.round(t.progress*100)}%<small>${escapeHTML(t.blockedReason||(t.assigned?'대원 작업 중':'작업 배정 대기'))} · ${t.x}, ${t.y}</small></div><button class="job-jump" data-task-jump="${t.id}" aria-label="${escapeHTML(label)} 작업 위치로 이동">↗</button></div>`;}).join(''):'<p class="empty-state">대기 중인 작업이 없어요.<br>대원들이 생활과 생산을 돌보고 있습니다.</p>';
  }
  $('blocked-count').textContent=`${number(game.stats.blockedTasks||game.tasks.filter(t=>t.blockedReason).length)}개 막힘`;
  const production=game.production||{};
  const entries=[['pumpedWater','취수한 청수','L'],['purifiedWater','정화한 청수','L'],['oxygenProduced','생산한 산소',''],['hydrogenProduced','생산한 수소',''],['hydrogenEnergy','수소 발전','J'],['toiletUses','화장실 이용','회'],['washUses','손 씻기','회'],['harvestedFood','수확한 식량','끼'],['hauledItems','수거한 고체',''],['mealsCooked','조리한 식사','끼'],['cookedEaten','먹은 조리식','끼'],['tableMeals','식탁에서 식사','회'],['scheduledRests','계획 수면','회'],['foodSpoiled','부패한 식품','끼'],['oxygenCompressed','충전소에 압축한 산소',''],['oxygenRefilled','휴대통에 옮긴 산소',''],['portableOxygenUsed','휴대통에서 소비한 산소',''],['protectedSeconds','휴대 산소 호흡','초'],['trainingPointsSpent','배분한 기술','점'],['bedroomRestSeconds','침실에서 수면','초'],['messhallMeals','식당에서 식사','회'],['greenhouseHarvests','온실에서 수확','회']];
  $('production-list').innerHTML=entries.filter(([key])=>Object.hasOwn(production,key)).map(([key,label,unit])=>`<div><span>${label}</span><b>${['oxygenCompressed','oxygenRefilled','portableOxygenUsed'].includes(key)?Number(production[key]).toFixed(2):number(production[key])} ${unit}</b></div>`).join('');
}
let researchQuery='';
function filterResearch(){
  const target=$('research-unlocks'),q=researchQuery.trim().toLowerCase();
  for(const group of target.querySelectorAll('.research-tier-group')){
    let count=0;
    for(const button of group.querySelectorAll('[data-research-tech]')){
      const matches=!q||(button.textContent+' '+button.dataset.researchTech).toLowerCase().includes(q);
      button.hidden=!matches;if(matches)count++;
    }
    group.hidden=!count;if(q&&count)group.open=true;
  }
}
function renderGoals(){
  const objectives=game.objectives,done=objectives.filter(o=>o.done).length;
  $('objective-count').textContent=`${done} / ${objectives.length}`;$('objective-fill').style.width=`${done/Math.max(1,objectives.length)*100}%`;
  const next=objectives.find(o=>!o.done);
  $('next-objective-title').textContent=next?`${next.stage||1}단계 · ${next.label}`:'자립 기지 완성';
  $('next-objective-description').textContent=next?next.description:'더 깊은 지층을 탐사하고 기지를 계속 운영해 보세요.';
  const signature=objectives.map(o=>`${o.id}:${o.done}:${Math.floor(o.progress)}`).join('|');
  if(signature!==objectiveSignature){
    objectiveSignature=signature;let currentStage=0;
    $('objectives-list').innerHTML=objectives.map(o=>{
      const stage=o.stage||1,heading=stage!==currentStage?`<div class="goal-stage"><span>0${stage}</span><strong>${['','초기 정착','생활 기반','자립 운영','잘 사는 기지','안전한 확장'][stage]||'기지 확장'}</strong><small>${objectives.filter(v=>(v.stage||1)===stage&&v.done).length}/${objectives.filter(v=>(v.stage||1)===stage).length}</small></div>`:'';currentStage=stage;
      const goalTool=o.tool||GOAL_TOOLS[o.id];
      return heading+`<div class="objective ${o.done?'done':''}"><span class="objective-check">${o.done?'✓':''}</span><div class="objective-body"><b>${escapeHTML(o.label)}</b><p>${escapeHTML(o.description)}</p>${!o.done&&goalTool?`<button class="goal-tool" data-goal-tool="${escapeHTML(goalTool)}">${goalTool==='dig'?'채굴':escapeHTML(definitionFor(goalTool)?.name||'도구')} 선택 ↗</button>`:!o.done&&o.id==='training'?'<button class="goal-tool" data-goal-training>대원의 기술 배분 ↗</button>':''}</div><span class="objective-count">${Math.min(Math.floor(o.progress),o.target)}<span style="opacity:.5">/${o.target}</span></span></div>`;
    }).join('');
  }
  const stability=game.stability||{seconds:0,target:180,healthy:false,reasons:['생활 기반을 갖추세요.']};
  $('stability-value').textContent=`${Math.floor(stability.seconds)} / ${stability.target}초`;
  $('stability-fill').style.width=`${clamp(stability.seconds/stability.target*100,0,100)}%`;
  $('stability-reason').textContent=stability.healthy?'안정된 생활을 유지하고 있어요. 이 상태를 이어가세요.':(stability.reasons||[]).slice(0,3).join(' · ')||'생활 기반을 갖추면 안정 유지가 시작됩니다.';
  $('goal-stability-time').textContent=`${Math.floor(stability.seconds)} / ${stability.target}초`;
  $('goal-stability-reasons').innerHTML=stability.healthy?'<p class="ready">모든 생활 조건이 안정적이에요. 이 상태를 유지하세요.</p>':(stability.reasons||[]).map(reason=>`<p>${escapeHTML(reason)}</p>`).join('');
  document.querySelector('.stability-card').classList.toggle('healthy',stability.healthy);
  const settlement=game.settlement||{seconds:0,target:240,healthy:false,reasons:['운반과 식사, 교대 휴식을 준비하세요.']};
  const settlementTime=`${Math.floor(settlement.seconds)} / ${settlement.target}초`;
  $('settlement-value').textContent=settlementTime;$('goal-settlement-time').textContent=settlementTime;
  $('settlement-fill').style.width=`${clamp(settlement.seconds/settlement.target,0,1)*100}%`;
  $('settlement-reason').textContent=settlement.healthy?'건강한 일상이 이어지고 있어요.':(settlement.reasons||[]).slice(0,3).join(' · ');
  $('goal-settlement-reasons').innerHTML=settlement.healthy?'<p class="ready">물류·식사·휴식이 안정적이에요. 이 상태를 이어가세요.</p>':(settlement.reasons||[]).map(reason=>`<p>${escapeHTML(reason)}</p>`).join('');
  $('settlement-card').classList.toggle('healthy',settlement.healthy);
  renderFrontierSummary();
  if(activePanel!=='research')return;
  if(game.modernRules){
    $('research-tier').textContent='기술 트리';
    const html=renderResearchPanel(game);
    const panel=$('research-unlocks');
    if(html!==lastUnlockSignature&&!document.activeElement?.matches('[data-research-search]')){
      const open=[...panel.querySelectorAll('details')].map(el=>el.open);
      lastUnlockSignature=html;panel.innerHTML=html;
      [...panel.querySelectorAll('details')].forEach((el,i)=>{if(i<open.length)el.open=open[i];});
      const search=panel.querySelector('[data-research-search]');if(search)search.value=researchQuery;
      filterResearch();
    }
    return;
  }
  $('research-tier').textContent=`${['기초','생활','순환','자립'][game.research?.tier||0]} · ${number(game.stats.research)}/${game.research?.cap||100}`;
  const unlocked=Object.entries(BUILDINGS).filter(([,b])=>b.unlock).sort((a,b)=>a[1].unlock-b[1].unlock);
  const unlockSignature=unlocked.map(([key,b])=>`${key}:${game.stats.research>=b.unlock}`).join(',');
  if(unlockSignature!==lastUnlockSignature){lastUnlockSignature=unlockSignature;$('research-unlocks').innerHTML=unlocked.map(([key,b])=>`<div class="unlock-row ${game.stats.research>=b.unlock?'available':''}"><span>${icon(key)}</span><b>${escapeHTML(b.name)}</b><small>${game.stats.research>=b.unlock?'해금 완료':`연구 ${b.unlock}`}</small></div>`).join('');}
}

function renderUI() {
  const s=game.stats,r=game.resources,p=game.power;
  if(game.time-lastOxygenSample>=3 || !oxygenHistory.length){
    lastOxygenSample=game.time; oxygenHistory.push(s.oxygen); if(oxygenHistory.length>25)oxygenHistory.shift();
    const points=oxygenHistory.length<2?[s.oxygen,s.oxygen]:oxygenHistory;
    document.querySelector('.sparkline path').setAttribute('d',points.map((v,i)=>`${i?'L':'M'}${1+i*72/(points.length-1)} ${26-clamp(v,0,100)*.24}`).join(' '));
  }
  $('oxygen-value').textContent=`${Math.round(s.oxygen)}%`;
  $('oxygen-value').style.color=s.oxygen<25?'var(--coral)':s.oxygen<50?'var(--amber)':'var(--mint)';
  $('oxygen-detail').textContent=s.oxygen>=65?'편안하게 숨쉬고 있어요':s.oxygen>=35?'산소 공급을 준비하세요':'산소 공급이 급해요';
  const edible=game.foodStatus?.total??((r.food||0)+(r.meals||0));
  $('food-value').textContent=game.originalRules?`${Math.round(edible*1000).toLocaleString()} kcal`:`${number(edible)} 끼`;
  $('food-detail').textContent=`조리 ${number(r.meals||0)}끼 · ${Number(s.foodDays||0).toFixed(1)}주기분`;
  $('food-value').title=`수확 식량 ${Number(r.food||0).toFixed(1)} · 조리식 ${Number(r.meals||0).toFixed(1)} · ${game.foodStatus?.cold?'냉장 보관 중':'실온 보관'}`;
  $('power-value').textContent=p.capacity>0?`${Math.round(p.stored/p.capacity*100)}%`:'미설치';
  $('power-detail').textContent=`${Math.round(p.production)} / ${Math.round(p.demand)} W`;
  $('power-fill').style.height=`${p.capacity>0?clamp(p.stored/p.capacity*100,0,100):0}%`;
  $('water-value').textContent=`${number(r.water)} L`;
  $('water-detail').textContent=`오수 ${number(r.waste||0)} L · 배관 공급`;
  $('hydrogen-detail').textContent=game.originalRules?`기체망 수소 ${Number(game.storedHydrogenKg?.()||0).toFixed(2)} kg`:`수소 저장고 ${Number(r.hydrogen||0).toFixed(1)}`;
  $('build-count').textContent=String(Object.keys(BUILDINGS).length+Object.keys(infrastructure).length);
  $('algae-value').textContent=number(r.algae);$('rock-value').textContent=number(r.rock);$('metal-detail').textContent=`금속 ${number(r.metal)} · 미수거 ${number(game.logistics?.loose||0)}`;
  $('temperature-value').textContent=`${Number(s.temperature||0).toFixed(1)} °C`;
  $('research-value').textContent=number(s.research);$('task-value').textContent=`${game.tasks.length}개`;$('coal-value').textContent=number(r.coal);
  $('crew-count').textContent=`${game.crew.filter(c=>c.health>0).length}명`;
  $('cycle-value').textContent=`사이클 ${game.cycle}`;
  const cycleProgress=game.time%game.cycleSeconds/game.cycleSeconds;
  $('cycle-progress').textContent=`${Math.floor(cycleProgress*100)}% · ${Math.floor(game.time%game.cycleSeconds)} / ${game.cycleSeconds}초`;
  $('cycle-orbit').style.background=`conic-gradient(#e5be7f ${cycleProgress*100}%,#233946 0)`;
  $('simulation-hint').textContent=speed===0?'잠시 멈추고 계획해 보세요':game.tasks.length?`${game.tasks.length}개의 작업을 함께 진행하고 있어요`:'대원들이 기지를 돌보고 있어요';
  $('autosave-status').textContent=saveUnavailable?'사용 불가':lastSaveTime?`${Math.floor((performance.now()-lastSaveTime)/1000)}초 전`:'준비 중';
  const alerts=(game.alerts||[]).slice(0,2);
  $('alerts').innerHTML=alerts.map(a=>`<div class="alert ${escapeHTML(a.tone)}">${escapeHTML(a.text)}</div>`).join('');
  const status=$('world-status'), topAlert=alerts.find(a=>a.tone==='danger')||alerts[0];
  status.className=`world-status ${topAlert?.tone || ''}`;
  status.querySelector('span').textContent=game.lost?'탐사 종료':game.won?'자립 기지 달성':topAlert?'기지를 살펴보세요':speed===0?'기지 일시정지':'기지 가동 중';
  renderCrew();
  renderGoals();
  if(activePanel==='systems')renderOperations();
  if(activePanel==='logistics')renderLogistics();
  if(activePanel==='rooms')renderRooms();
  if($('skills-dialog').open)renderTraining();
  const nextEventSignature=game.events.map(e=>e.id).join(',');
  if(nextEventSignature!==eventSignature){
    if(eventSignature&&activePanel!=='log')$('event-dot').style.opacity='1';
    eventSignature=nextEventSignature;
    $('event-list').innerHTML=game.events.map(e=>`<div class="event ${escapeHTML(e.tone)}"><small>사이클 ${Math.floor(e.time/game.cycleSeconds)+1} · ${Math.floor(e.time%game.cycleSeconds)}초</small><p>${escapeHTML(e.text)}</p></div>`).join('');
  }
  $$('.build-card').forEach(el=>{
    const def=definitionFor(el.dataset.build);
    el.classList.toggle('unaffordable',Object.entries(def.cost||{}).some(([key,n])=>r[key]<n));
    const locked=lockedTool(el.dataset.build);
    if(el.classList.contains('locked')!==locked)renderBuildMenu();
  });
  $('recruit-button').disabled=game.crew.filter(c=>c.health>0).length>=4;
  if(activePanel==='inspect')renderInspector();
  if(game.stats.completedDigs>0)$('onboarding').hidden=true;
  if((game.lost||game.won)&&seenEnd!==(game.lost?'lost':'won')&&!document.querySelector('dialog[open]')){
    seenEnd=game.lost?'lost':'won';
    $('end-eyebrow').textContent=game.lost?'END OF EXPEDITION':'A PLACE TO CALL HOME';
    $('end-title').textContent=game.lost?'이번 탐사가 끝났어요.':'우리가 만든, 살아 있는 기지.';
    $('end-description').textContent=game.lost?'숨과 식량, 대원의 휴식과 귀환 경로를 함께 살펴보세요. 같은 시드로 다시 도전하거나 새로운 소행성을 탐사할 수 있습니다.':`${game.cycle}사이클 동안 생산과 생활, 방과 출입문, 대원의 기술과 휴대 산소를 연결했어요. 20개 목표와 안전한 확장 180초를 달성했습니다. 기지를 계속 돌보고 새로운 구역을 설계해 보세요.`;
    $('end-continue').textContent=game.lost?'기지 살펴보기':'계속 돌보기 ↗';openDialog('end-dialog');
  }
}

function inside(cell) { return cell&&cell.x>=0&&cell.y>=0&&cell.x<game.w&&cell.y<game.h; }
function selectCell(cell) {
  if(!inside(cell))return;
  currentSelection=cell;renderer.selection=cell;switchPanel('inspect',true);renderInspector();
}
function queueArea(start,end) {
  if(!start||!end)return;
  const areaTools=['dig','cancel','priority'];
  const x1=clamp(Math.min(start.x,end.x),0,game.w-1),x2=clamp(Math.max(start.x,end.x),0,game.w-1);
  const y1=clamp(Math.min(start.y,end.y),0,game.h-1),y2=clamp(Math.max(start.y,end.y),0,game.h-1);
  let accepted=0,reason='';
  if(['wire','pipe','wastepipe','gaspipe'].includes(tool)){
    const path=[],stepX=end.x>=start.x?1:-1,stepY=end.y>=start.y?1:-1;
    for(let x=start.x;;x+=stepX){path.push({x,y:start.y});if(x===end.x)break;}
    if(start.y!==end.y)for(let y=start.y+stepY;;y+=stepY){path.push({x:end.x,y});if(y===end.y)break;}
    for(const cell of path){if(!inside(cell))continue;const result=game.queue(tool,cell.x,cell.y);if(result.ok)accepted++;else reason=result.message;}
  }else if(areaTools.includes(tool)){
    for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){const result=game.queue(tool,x,y);if(result.ok)accepted++;else reason=result.message;}
  }else if(inside(end)){const result=game.queue(tool,end.x,end.y,game.buildRotation||0);accepted=result.ok?1:0;reason=result.message;}
  if(accepted){
    const labels={dig:'채굴 지정',cancel:'작업 취소',priority:'우선순위 변경',wire:'전선 설치',pipe:'급수관 설치',wastepipe:'배수관 설치',gaspipe:'기체관 설치',removePipe:'급수관 제거',removeWastepipe:'배수관 제거',removeGasPipe:'기체관 제거',deconstruct:'철거 지정'};
    toast(`${labels[tool] || (BUILDINGS[tool]?.name+' 건설 예약')} · ${accepted}칸`);beep('build');
    if(tool==='dig')$('onboarding').hidden=true;
  }else if(reason){toast(reason,'warn');beep('error');}
  renderUI();
}
function pointerPair(){const list=[...pointers.values()];if(list.length<2)return null;const [a,b]=list;return{x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.hypot(a.x-b.x,a.y-b.y)};}
canvas.addEventListener('pointerdown',event=>{
  if(document.querySelector('dialog[open]'))return;
  event.preventDefault();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size>=2){selectedPointer=null;renderer.dragRect=null;pinchState=pointerPair();return;}
  const cell=renderer.screenToCell(event.clientX,event.clientY);
  selectedPointer={id:event.pointerId,start:cell,lastX:event.clientX,lastY:event.clientY,startX:event.clientX,startY:event.clientY,pan:event.button===1||event.button===2||tool==='pan',moved:false};
  if(selectedPointer.pan)canvas.style.cursor='grabbing';
  else if(['dig','cancel','priority','wire','pipe','wastepipe','gaspipe'].includes(tool))renderer.dragRect={x1:cell.x,y1:cell.y,x2:cell.x,y2:cell.y};
});
canvas.addEventListener('pointermove',event=>{
  const cell=renderer.screenToCell(event.clientX,event.clientY);
  renderer.hover=inside(cell)?cell:null;
  if(pointers.has(event.pointerId))pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size>=2){
    const pair=pointerPair();if(pinchState){renderer.pan(pair.x-pinchState.x,pair.y-pinchState.y);if(pinchState.d>3)renderer.zoomAt(pair.d/pinchState.d,pair.x,pair.y);}pinchState=pair;return;
  }
  if(selectedPointer&&selectedPointer.id===event.pointerId){
    const p=selectedPointer;if(Math.hypot(event.clientX-p.startX,event.clientY-p.startY)>5)p.moved=true;
    if(p.pan)renderer.pan(event.clientX-p.lastX,event.clientY-p.lastY);
    else if(renderer.dragRect){renderer.dragRect.x2=cell.x;renderer.dragRect.y2=cell.y;}
    p.lastX=event.clientX;p.lastY=event.clientY;
  }
  const hover=$('hover-info');
  if(inside(cell)&&!selectedPointer&&!pinchState){
    const data=game.inspect(cell.x,cell.y);const placement=!['inspect','pan','dig','cancel','priority','deconstruct'].includes(tool)?game.canPlace(tool,cell.x,cell.y):null;
    hover.hidden=false;hover.innerHTML=`<b>${escapeHTML(data.title)}</b><span>${escapeHTML(placement?placement.ok?'클릭하면 건설 예약':placement.message:(data.lines||[]).slice(0,2).join(' · '))}</span>`;
    $('depth-value').textContent=String(cell.y*8);
  }else hover.hidden=true;
});
function pointerUp(event,cancelled=false){
  pointers.delete(event.pointerId);
  if(selectedPointer&&selectedPointer.id===event.pointerId&&!cancelled){
    const p=selectedPointer,end=renderer.screenToCell(event.clientX,event.clientY);
    if(!p.pan){if(tool==='inspect'){if(!p.moved)selectCell(end);}else queueArea(p.start,end);}
  }
  selectedPointer=null;renderer.dragRect=null;pinchState=null;
  canvas.style.cursor=tool==='pan'?'grab':tool==='inspect'?'default':'crosshair';
  if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
}
canvas.addEventListener('pointerup',event=>pointerUp(event));
canvas.addEventListener('pointercancel',event=>pointerUp(event,true));
canvas.addEventListener('pointerleave',()=>{renderer.hover=null;$('hover-info').hidden=true;});
canvas.addEventListener('contextmenu',event=>event.preventDefault());
canvas.addEventListener('wheel',event=>{event.preventDefault();renderer.zoomAt(Math.exp(-event.deltaY*.0012),event.clientX,event.clientY);},{passive:false});
document.addEventListener('keydown',event=>{
  if(/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)||event.ctrlKey||event.metaKey||event.altKey||document.querySelector('dialog[open]'))return;
  const key=event.key.toLowerCase();
  if(key===' '){event.preventDefault();if(!event.repeat)setSpeed(speed?0:previousSpeed);}
  else if(key==='d')setTool('dig');else if(key==='x')setTool('cancel');else if(key==='escape'){setTool('inspect');document.body.classList.remove('panel-open');}
  else if(key==='b'){const keys=Object.keys(categories).filter(key=>key!=='gas'||game.originalRules);category=keys[(keys.indexOf(category)+1)%keys.length];renderBuildMenu();}
  else if(key==='o')setOverlay(renderer.overlay==='oxygen'?'normal':'oxygen');
  else if(key==='t')setOverlay(renderer.overlay==='temperature'?'normal':'temperature');
  else if(key==='p')setOverlay(renderer.overlay==='power'?'normal':'power');
  else if(key==='v')setOverlay(renderer.overlay==='plumbing'?'normal':'plumbing');
  else if(key==='g'&&game.originalRules)setOverlay(renderer.overlay==='gas'?'normal':'gas');
  else if(key==='h')setOverlay(renderer.overlay==='logistics'?'normal':'logistics');
  else if(key==='r'&&game.modernRules&&BUILDING_FOOTPRINTS[tool]?.rotatable)rotateBridge();
  else if(key==='r')setOverlay(renderer.overlay==='rooms'?'normal':'rooms');
  else if(key==='l'){category='plumbing';renderBuildMenu();setTool('pipe');}
  else if(key==='q'&&!game.modernRules){category='plumbing';renderBuildMenu();setTool('wastepipe');}
  else if(key==='arrowleft'){event.preventDefault();renderer.pan(45,0);}else if(key==='arrowright'){event.preventDefault();renderer.pan(-45,0);}
  else if(key==='arrowup'){event.preventDefault();renderer.pan(0,45);}else if(key==='arrowdown'){event.preventDefault();renderer.pan(0,-45);}
  else if(['1','2','4'].includes(key))setSpeed(Number(key));
});

$$('[data-tool]').forEach(el=>el.addEventListener('click',()=>setTool(el.dataset.tool)));
$$('[data-category]').forEach(el=>el.addEventListener('click',()=>{category=el.dataset.category;renderBuildMenu();beep();}));
$$('[data-overlay]').forEach(el=>el.addEventListener('click',()=>setOverlay(el.dataset.overlay)));
$$('[data-speed]').forEach(el=>el.addEventListener('click',()=>setSpeed(Number(el.dataset.speed))));
$$('[data-panel]').forEach(el=>el.addEventListener('click',()=>switchPanel(el.dataset.panel)));
$$('[data-close-dialog]').forEach(el=>el.addEventListener('click',()=>closeDialog(el.dataset.closeDialog)));
$('pause-button').addEventListener('click',()=>setSpeed(speed?0:previousSpeed));
$('help-button').addEventListener('click',()=>openDialog('help-dialog'));
  $('new-button').addEventListener('click',()=>{const current=$('ruleset-input');if(current)current.value=MODERN_RULES;const notice=$('previous-save-note');if(notice){let hasSave=false;try{hasSave=[SAVE_KEY,...LEGACY_SAVE_KEYS].some(key=>localStorage.getItem(key));}catch{}notice.textContent=hasSave?'저장한 기지는 불러오기를 선택하면 저장 당시 규칙으로 이어집니다. 4.1 이전 기지는 호환 규칙을 사용합니다.':'이전에 내보낸 기지도 도움말에서 불러올 수 있습니다. 4.1 이전 기지는 호환 규칙을 사용합니다.';}openDialog('new-dialog');});
$('save-button').addEventListener('click',()=>save(true));
$('load-button').addEventListener('click',()=>{if(loadSave(true)){closeDialog('help-dialog');if(game.lost)setSpeed(0);}});
$('start-dig').addEventListener('click',()=>{setTool('dig');$('onboarding').hidden=true;});
$('dismiss-onboarding').addEventListener('click',()=>{$('onboarding').hidden=true;});
$('panel-button').addEventListener('click',()=>document.body.classList.toggle('panel-open'));
$('close-panel').addEventListener('click',()=>document.body.classList.remove('panel-open'));
$('next-objective').addEventListener('click',()=>switchPanel('goals',true));
$('show-plumbing').addEventListener('click',()=>{setOverlay('plumbing');if(window.innerWidth<=1000)document.body.classList.remove('panel-open');});
$('show-logistics').addEventListener('click',()=>{setOverlay('logistics');if(window.innerWidth<=1000)document.body.classList.remove('panel-open');});
$('schedule-help').addEventListener('click',()=>openDialog('help-dialog'));
$('show-rooms').addEventListener('click',()=>{setOverlay('rooms');if(window.innerWidth<=1000)document.body.classList.remove('panel-open');});
$('room-list').addEventListener('click',event=>{const button=event.target.closest('[data-room-jump]');if(!button)return;const room=(game.rooms||[]).find(r=>String(r.id)===button.dataset.roomJump);if(room){const cx=(room.bounds.x1+room.bounds.x2)/2,cy=(room.bounds.y1+room.bounds.y2)/2,index=room.cells.reduce((best,i)=>Math.hypot(i%game.w-cx,Math.floor(i/game.w)-cy)<Math.hypot(best%game.w-cx,Math.floor(best/game.w)-cy)?i:best,room.cells[0]);currentSelection={x:index%game.w,y:Math.floor(index/game.w)};renderer.selection=currentSelection;inspectorKey='';renderer.centerOn(currentSelection.x+.5,currentSelection.y+.5);setOverlay('rooms');if(window.innerWidth<=1000)document.body.classList.remove('panel-open');}});
$('dock-list').addEventListener('click',event=>{const button=event.target.closest('[data-dock-jump]');if(!button)return;const dock=game.buildings.find(b=>String(b.id)===button.dataset.dockJump);if(dock){renderer.centerOn(dock.x+.5,dock.y+.5);selectCell({x:dock.x,y:dock.y});}});
$$('[data-train-skill]').forEach(button=>button.addEventListener('click',()=>{const c=game.crew.find(c=>c.id===trainingCrewId);if(!c)return;const result=game.trainCrew(c.id,button.dataset.trainSkill);toast(result.message,result.ok?'good':'warn');renderTraining();renderCrew();renderGoals();if(result.ok)save();}));

function changePilePriority(button){const p=(game.debris||[]).find(p=>String(p.id)===button.dataset.pilePriority);if(p&&game.setHaulPriority){const result=game.setHaulPriority(p.id,(p.priority||3)>=5?1:(p.priority||3)+1);toast(result.message,result.ok?'good':'warn');logisticsSignature='';renderLogistics();renderInspector();}}
$('pile-list').addEventListener('click',event=>{const priority=event.target.closest('[data-pile-priority]');if(priority){changePilePriority(priority);return;}const button=event.target.closest('[data-pile-jump]');if(!button)return;const p=(game.debris||[]).find(p=>String(p.id)===button.dataset.pileJump);if(p){renderer.centerOn(p.x+.5,p.y+.5);selectCell({x:p.x,y:p.y});}});
$('haul-workers').addEventListener('click',event=>{const button=event.target.closest('[data-crew-jump]');if(!button)return;const c=game.crew.find(c=>String(c.id)===button.dataset.crewJump);if(c){renderer.centerOn(c.x,c.y);if(window.innerWidth<=1000)document.body.classList.remove('panel-open');}});

$('task-list').addEventListener('click',event=>{const button=event.target.closest('[data-task-jump]');if(!button)return;const task=game.tasks.find(t=>String(t.id)===button.dataset.taskJump);if(task){renderer.centerOn(task.x+.5,task.y+.5);selectCell({x:task.x,y:task.y});}});
$('objectives-list').addEventListener('click',event=>{if(event.target.closest('[data-goal-training]')){const c=game.crew.find(c=>c.health>0&&c.skillPoints>0)||game.crew.find(c=>c.health>0);if(c)openTraining(c.id);return;}const button=event.target.closest('[data-goal-tool]');if(!button)return;const next=button.dataset.goalTool;const found=Object.entries(categories).find(([,types])=>types.includes(next));if(found){category=found[0];renderBuildMenu();}setTool(next);if(window.innerWidth<=1000)document.body.classList.remove('panel-open');});
$('open-research-tree').addEventListener('click',()=>{
  $('research-tree-content').append($('research-unlocks'));openDialog('research-dialog');
});
$('close-research-tree').addEventListener('click',()=>closeDialog('research-dialog'));
$('research-dialog').addEventListener('close',()=>$('open-research-tree').after($('research-unlocks')));
$('research-unlocks').addEventListener('input',e=>{if(e.target.matches('[data-research-search]')){researchQuery=e.target.value;filterResearch();}});
$('research-unlocks').addEventListener('click',event=>{if(event.target.closest('[data-research-clear]')){clearResearchQueue(game);renderUI();return;}const button=event.target.closest('[data-research-tech]');if(!button)return;const result=selectResearch(game,button.dataset.researchTech);toast(result.message,result.ok?'good':'warn');renderUI();});
$('inspector').addEventListener('click',event=>{if(event.target.closest('[data-room-details]')){switchPanel('rooms',true);setOverlay('rooms');return;}const priority=event.target.closest('[data-pile-priority]');if(priority){changePilePriority(priority);return;}const button=event.target.closest('[data-remove-pipe]');if(button&&currentSelection){const result=game.queue(button.dataset.removePipe,currentSelection.x,currentSelection.y);toast(result.message,result.ok?'good':'warn');renderInspector();}});
$('center-button').addEventListener('click',()=>renderer.fit());
$('zoom-fit').addEventListener('click',()=>renderer.fit());
function zoom(factor){const r=canvas.getBoundingClientRect();renderer.zoomAt(factor,r.left+r.width/2,r.top+r.height/2);}
$('zoom-in').addEventListener('click',()=>zoom(1.2));$('zoom-out').addEventListener('click',()=>zoom(1/1.2));
$('recruit-button').addEventListener('click',()=>{const result=game.recruit();toast(result.message,result.ok?'good':'warn');renderUI();});
$('confirm-new').addEventListener('click',()=>{$('new-dialog').close();newGame($('seed-input').value,$('ruleset-input').value);});
$('end-continue').addEventListener('click',()=>closeDialog('end-dialog'));
$('end-restart').addEventListener('click',()=>{const resumeSpeed=dialogSpeed;$('end-dialog').close();openDialog('new-dialog');dialogSpeed=resumeSpeed;});
$('sound-button').addEventListener('click',()=>{
  soundEnabled=!soundEnabled;const button=$('sound-button');button.innerHTML=icon(soundEnabled?'volume':'volume-off');button.setAttribute('aria-pressed',soundEnabled);button.setAttribute('aria-label',soundEnabled?'소리 끄기':'소리 켜기');button.title=soundEnabled?'소리 끄기':'소리 켜기';beep();
  try{localStorage.setItem(PREF_KEY,JSON.stringify({soundEnabled}));}catch{}
});
$('export-button').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify({format:'breath-colony',savedAt:new Date().toISOString(),game:game.serialize()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`breath-colony-cycle-${game.cycle}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('세이브 파일을 내보냈어요.');
});
$('import-button').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    if(file.size>4000000)throw new Error('4MB 이하의 세이브 파일을 선택해 주세요.');
    const payload=JSON.parse(await file.text());if(payload.format!=='breath-colony'||!payload.game)throw new Error('숨 세이브 파일이 아닙니다.');
    const migrated=payload.game.version<4;
    if(game.load(payload.game)===false)throw new Error('유효한 세이브가 아닙니다.');
    saveBlocked=false;afterLoad();save();if(migrated||game.lost)dialogSpeed=0;closeDialog('help-dialog');
    toast(migrated?'기지를 4.0으로 가져왔어요. 구역·휴대 산소·기술 배분을 확인한 뒤 시간을 재개하세요.':'기지를 가져왔어요.');
  }catch(error){toast(`불러오지 못했어요. ${error.message}`,'warn',5500);}
  event.target.value='';
});
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();renderer.fit();});

const resizeObserver=new ResizeObserver(()=>renderer.resize());resizeObserver.observe(canvas);
window.addEventListener('resize',()=>renderer.resize());
document.addEventListener('visibilitychange',()=>{lastTime=0;accumulator=0;if(document.hidden)save();});
window.addEventListener('pagehide',()=>save());
setInterval(()=>{if(!document.hidden)save();},15000);
function frame(now){
  const elapsed=lastTime?Math.min((now-lastTime)/1000,.12):0;lastTime=now;
  if(!document.hidden&&!document.querySelector('dialog[open]')&&!game.lost){
    accumulator+=elapsed*speed;
    while(accumulator>=.1){game.step(.1);accumulator-=.1;}
  }
  renderer.render(now/1000);
  if(now-lastUI>250){renderUI();lastUI=now;}
  requestAnimationFrame(frame);
}
renderBuildMenu();setTool('inspect');renderer.resize();renderer.fit();
const restored=loadSave();if(restored)toast('다시 오셨군요. 저장한 기지를 이어갑니다.');
try{if(JSON.parse(localStorage.getItem(PREF_KEY)||'{}').soundEnabled){soundEnabled=true;$('sound-button').innerHTML=icon('volume');$('sound-button').setAttribute('aria-pressed','true');}}catch{}
if(game.lost||saveBlocked)setSpeed(0);
renderUI();requestAnimationFrame(frame);
window.colony={game,renderer,setTool,setSpeed,setOverlay,save,loadSave,newGame};
