import { MODERN_RULES, usesOriginalRates, ORIGINAL_RULES, LEGACY_RULES, ORIGINAL_POWER, BATTERY_LEAK_J_PER_S, MEALWOOD, breathingUnitsPerSecond, cycleSecondsFor } from './rules.js';
import { GAS_KG_PER_UNIT, addGasKg, addWarmOxygen, canBreathe, conductivity, displaceForTile, materialFor, oxygenOutletSpace, stepEnvironment, NATURAL_MASS_KG, ORIGINAL_WATER_PER_CELL, WATER_PER_CELL } from './environment.js';
import { atmosphereOf, atmosphereSpaceKg, addAtmosphere, emitAtmosphere, takeAtmosphere, recordRespirationCO2 } from './atmosphere.js';
import { UTILITY_BUILDINGS, installUtilities } from './utilities.js';
import { COMMUNITY_BUILDINGS, installCommunity } from './community.js';
import { EXPEDITION_BUILDING, installExpeditions } from './expedition.js';
import { PIPE_BUILDINGS, installPacketPipes } from './pipe-system.js';
import { GAS_BUILDINGS, installGasNetwork } from './gas-network.js';
import { FRONTIER_BUILDINGS, installFrontier } from './frontier.js';
import { installResearch } from './research.js';
import { BUILDING_FOOTPRINTS, buildingBounds, buildingCells, buildingPort } from './footprint.js';
/* BREATH COLONY — purpose-designed, DOM-free colony simulation. */
export const WORLD_W=48, WORLD_H=28, CYCLE_SECONDS=120;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v)=>typeof v==='number'&&Number.isFinite(v);
const copy=(v)=>JSON.parse(JSON.stringify(v));
const cost=(rock=0,metal=0,water=0)=>({rock,metal,water});
export const MATERIALS={
 rock:{name:'암석',color:'#96764f',hardness:3,yield:'rock',amount:9},
 dirt:{name:'토양',color:'#ad8655',hardness:2,yield:'rock',amount:6},
 copper:{name:'구리 광맥',color:'#ca875e',hardness:3.5,yield:'metal',amount:9},
 algae:{name:'조류층',color:'#71a784',hardness:2.3,yield:'algae',amount:12},
 coal:{name:'석탄층',color:'#515368',hardness:3,yield:'coal',amount:10},
 ice:{name:'얼음',color:'#a8d6e0',hardness:2,yield:'water',amount:12},
 abyssalite:{name:'심연석',color:'#635975',hardness:7,yield:'rock',amount:8},
 bedrock:{name:'기반암',color:'#353b50',hardness:999,yield:'rock',amount:0},
 tile:{name:'바닥 타일',color:'#a5b8bd',hardness:2,yield:'rock',amount:2}
};
export const BUILDINGS={
 ladder:{name:'사다리',icon:'ladder',description:'층 사이를 연결합니다. 바닥 없이 설치할 수 있어요.',cost:cost(2),color:'#c6a677'},
 tile:{name:'바닥 타일',icon:'tile',description:'대원과 설비를 지탱하며 물과 기체를 막습니다.',cost:cost(3),color:'#b4c4cb'},
 diffuser:{name:'산소 확산기',icon:'oxygen',description:'전력과 조류를 소비해 주변에 산소를 공급합니다.',cost:cost(25,15),power:12,color:'#78e2bc'},
 generator:{name:'수동 발전기',icon:'power',description:'대원이 현장에서 일할 때 45W를 생산합니다.',cost:cost(20,15),power:-45,color:'#e8bb70'},
 battery:{name:'축전지',icon:'battery',description:'전선으로 연결된 전기에너지를 최대 1,200J 저장합니다.',cost:cost(15,25),color:'#d0b7f6'},
 farm:{name:'재배 상자',icon:'leaf',description:'청수와 적당한 온도·산소가 필요합니다. 120초 성장 후 수확하면 식량 1.5를 얻어요.',cost:cost(15,0,5),color:'#92c97d'},
 cot:{name:'휴식 침상',icon:'bed',description:'지친 대원이 찾아와 에너지를 회복합니다.',cost:cost(12),color:'#a7b9e8'},
 research:{name:'연구 작업대',icon:'research',description:'대원의 작업과 8W 전력으로 연구를 진행합니다.',cost:cost(30,30),power:8,color:'#b9a2e9'},
 pump:{name:'물 수집기',icon:'water',description:'인접한 지형의 물을 연결된 청수 배관으로 취수합니다. 최대 0.40L/s, 전력 8W.',cost:cost(20,20),power:8,color:'#81c9e2'},
 scrubber:{name:'탄소 정화기',icon:'filter',description:'주변 이산화탄소를 줄입니다. 연구 10, 전력 10W.',cost:cost(25,25),power:10,unlock:10,color:'#8ccac7'},
 coalgen:{name:'석탄 발전기',icon:'coal',description:'석탄으로 60W를 생산하며 열과 이산화탄소를 배출합니다.',cost:cost(35,35),power:-60,unlock:20,color:'#e8a275'}
};
Object.assign(BUILDINGS,UTILITY_BUILDINGS,COMMUNITY_BUILDINGS,FRONTIER_BUILDINGS,GAS_BUILDINGS,PIPE_BUILDINGS,{steamRocket:EXPEDITION_BUILDING});
const RESOURCE_KEYS=['rock','metal','algae','coal','water','food'];
const ROLES=['balanced','dig','build','operate','farm','haul','cook'];
const NAMES=['나루','모아','솔','루미','이안','보라','다온','하루'];
const COLORS=['#f2bc73','#9ab5fa','#94d6b1','#d5a6ed','#f49795','#79cfdd','#c9ce84','#f1b6ce'];
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const OBJECTIVES=[
 {id:'dig',label:'새로운 공간',description:'주변 지형 12칸을 채굴하세요.',target:12},
 {id:'oxygen',label:'스스로 만드는 숨',description:'산소 확산기 1대를 완공하세요.',target:1},
 {id:'battery',label:'내일을 위한 전력',description:'발전망에 축전지를 연결하고 충전하세요.',target:1},
 {id:'farms',label:'작은 식량 정원',description:'재배 상자 3개를 새로 완공하세요.',target:3},
 {id:'research',label:'다음 가능성',description:'연구 작업대에서 연구 30을 달성하세요.',target:30},
 {id:'survive',label:'다섯 번의 아침',description:'대원 3명 이상과 5사이클을 보내세요.',target:5}
];
function rngFor(seed){let t=seed>>>0;return()=>{t+=0x6d2b79f5;let a=Math.imul(t^t>>>15,1|t);a^=a+Math.imul(a^a>>>7,61|a);return((a^a>>>14)>>>0)/4294967296;};}

export class Game {
 constructor(seed=73,ruleset=MODERN_RULES){this.reset(seed,ruleset);}
 get originalRules(){return usesOriginalRates(this.ruleset);}
 get modernRules(){return this.ruleset===MODERN_RULES;}
 get waterKgPerCell(){return this.originalRules?ORIGINAL_WATER_PER_CELL:WATER_PER_CELL;}
 get cycleSeconds(){return cycleSecondsFor(this.ruleset);}
 get breathRate(){return breathingUnitsPerSecond(this.ruleset);}
 buildingPower(type){
  if(this.originalRules && Object.hasOwn(ORIGINAL_POWER,type))return ORIGINAL_POWER[type];
  return BUILDINGS[type]?.power||0;
 }
 reset(seed=73,ruleset=MODERN_RULES){
  if(!usesOriginalRates(ruleset)&&ruleset!==LEGACY_RULES)throw new Error('지원하지 않는 기지 규칙입니다.');
  this.ruleset=ruleset;
  this.version=2;this.seed=Number.isFinite(Number(seed))?Number(seed)>>>0:73;this.w=WORLD_W;this.h=WORLD_H;
  this.time=0;this.cycle=1;this.lost=false;this.won=false;this._nextId=1;this._stepRemainder=0;this._envClock=0;this._statClock=0;this._networkDirty=true;this._networks=[];this._batteryPowered=false;this._navRevision=0;this._pathCache=null;
  this.resources={rock:240,metal:140,algae:100,coal:30,water:60,food:35};
  if(this.originalRules)this.resources.soil=40;
  this.power={stored:0,capacity:0,production:0,demand:0};
  this.stats={oxygen:100,temperature:22,foodDays:15,completedDigs:0,completedBuilds:0,research:0,population:3};
  this.buildings=[];this.tasks=[];this.crew=[];this.events=[];this.alerts=[];
  this.objectives=OBJECTIVES.map(o=>({...o,done:false,progress:0}));
  const rnd=rngFor(this.seed);
  this.cells=Array.from({length:this.w*this.h},(_,i)=>{
   const x=i%this.w,y=Math.floor(i/this.w);let solid=y<12?'dirt':'rock';const r=rnd();
   if(r<.065)solid='copper';else if(r<.12)solid='algae';else if(r<.17)solid='coal';else if(x<9&&y>8&&y<18&&r<.29)solid='ice';
   if(x===0||y===0||x===this.w-1||y===this.h-1)solid='bedrock';
   const coldPocket=x<9&&y>8&&y<18;
   const thermalVent=x>36&&x<43&&y>20&&y<26;
   if(x>=36&&x<=43&&y>=20&&y<=26&&!thermalVent)solid='abyssalite';
   const temp=coldPocket?-12:thermalVent?142:y>20?32+(y-20)*2:20+y*.16;
   return{solid,oxygen:0,co2:0,temp,water:0,frost:0,steam:0,revealed:x>=9&&x<=38&&y>=5&&y<=20,wire:false};
  });
  const carve=(x1,y1,x2,y2,o=.95)=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){Object.assign(this.cell(x,y),{solid:null,oxygen:o,co2:.02,temp:22,revealed:true});}};
  carve(12,8,35,11);carve(14,13,34,16,.90);
  for(let x=12;x<=35;x++)this.cell(x,12).solid='tile';
  for(let x=14;x<=34;x++)this.cell(x,17).solid='tile';
  for(let y=6;y<=20;y++){carve(23,y,23,y,.9);this._addBuilding('ladder',23,y,true);}
  carve(38,9,41,11,.20);for(let y=10;y<=11;y++)for(let x=38;x<=41;x++)this.cell(x,y).water=.85;
  for(let y=9;y<=11;y++)for(let x=9;x<=11;x++)this.cell(x,y).solid=(x===10?'copper':y===9?'algae':'dirt');
  for(let y=13;y<=16;y++)for(let x=35;x<=38;x++)if(this.cell(x,y).solid!=='bedrock')this.cell(x,y).solid=(x===36?'coal':'dirt');
  // Fresh worlds expose two thermal frontiers beyond the starting galleries.
  for(const [x1,y1,x2,y2,temp] of [[4,12,7,14,-12],[38,22,41,24,142]]){
   for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++){
    Object.assign(this.cell(x,y),{solid:null,oxygen:.12,co2:.04,water:y===y2?.65:0,temp});
   }
  }
  Object.assign(this.cell(40,24),{steamVent:true,ventOutput:0});
  for(let x=14;x<=33;x++){this.cell(x,11).wire=true;this.cell(x,16).wire=true;}
  for(let y=11;y<=16;y++)this.cell(23,y).wire=true;
  if(this.modernRules){
   this._addBuilding('core',24,11,true);
   this._addBuilding('cot',14,11,true);this._addBuilding('cot',17,11,true);this._addBuilding('cot',20,11,true);
   this._addBuilding('generator',27,11,true);
   const farm=this._addBuilding('farm',31,11,true);farm.growth=.35;
   this._newCrew(13,11);this._newCrew(19,11);this._newCrew(32,11);
  }else{
   this._addBuilding('core',24,11,true);
   for(let x=15;x<=17;x++)this._addBuilding('cot',x,11,true);
   this._addBuilding('generator',20,11,true);
   const farm=this._addBuilding('farm',30,11,true);farm.growth=.35;
   this._newCrew(21,11);this._newCrew(25,11);this._newCrew(28,11);
  }
  if(this.modernRules)for(let i=0;i<this.cells.length;i++){const c=this.cells[i];if(c.oxygen>0)c.co2=0;else if(c.co2>0)c.oxygen=0;c.hydrogen=0;c.steam=0;if(c.water>1e-9){const gas=atmosphereOf(c);if(gas){takeAtmosphere(c,gas.massKg);const accepted=emitAtmosphere(this,i%this.w,Math.floor(i/this.w),gas.element,gas.massKg,c.temp);if(accepted<gas.massKg-1e-9)addAtmosphere(this,c,gas.element,gas.massKg-accepted,c.temp);}}}
  this._event('작은 기지가 깨어났습니다. 채굴로 공간을 넓히고 산소와 전력을 준비하세요.','good');
  this._rebuildNetworks();this._updateStats();return this;
 }
 cell(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<this.w&&y<this.h?this.cells[y*this.w+x]:null;}
 _id(){return this._nextId++;}
 _event(text,tone='info'){this.events.unshift({id:this._id(),time:this.time,text,tone});this.events.length=Math.min(this.events.length,25);}
 _addBuilding(type,x,y,starter=false,progress=1){const b={id:this._id(),type,x,y,progress,enabled:true,active:false,connected:false,status:progress<1?'건설 대기':'준비',starter,workerId:null,growth:0,charge:0,capacity:type==='battery'?(this.originalRules?10000:1200):0};this.buildings.push(b);this._networkDirty=true;return b;}
 _newCrew(x,y){const n=this.crew.length;const c={id:this._id(),name:NAMES[n%NAMES.length]+(n>=NAMES.length?Math.floor(n/NAMES.length)+1:''),color:COLORS[n%COLORS.length],x:x+.5,y:y+.5,health:100,hunger:88,energy:90,stress:0,breath:100,action:'주변 살피는 중',role:'balanced',taskId:null,facing:1,path:[],_job:null,_idle:0};this.crew.push(c);return c;}
 _buildingAt(x,y){
  if(!this.modernRules)return this.buildings.find(b=>b.x===x&&b.y===y);
  const matches=this.buildings.filter(b=>buildingCells(b).some(cell=>cell.x===x&&cell.y===y));
  return matches.find(b=>!BUILDING_FOOTPRINTS[b.type]?.overlay)||matches[0];
 }
 _ladder(x,y){return this.buildings.some(b=>b.type==='ladder'&&b.progress>=1&&b.x===x&&b.y===y);}
 _standable(x,y){const c=this.cell(x,y);return !!c&&!c.solid&&(this._ladder(x,y)||!!this.cell(x,y+1)?.solid);}
 _reveal(x,y,r=4){for(let yy=y-r;yy<=y+r;yy++)for(let xx=x-r;xx<=x+r;xx++){const c=this.cell(xx,yy);if(c&&!c.revealed&&Math.hypot(xx-x,yy-y)<=r){c.revealed=true;this._roomsDirty=true;}}}
 _afford(c){return Object.entries(c).every(([k,v])=>this.resources[k]>=v);}
 _pay(c,sign=-1){for(const[k,v]of Object.entries(c))this.resources[k]=Math.max(0,this.resources[k]+sign*v);}
 canPlace(tool,x,y,rotation=this.buildRotation||0){
  if(!Number.isInteger(x)||!Number.isInteger(y)||!this.cell(x,y))return{ok:false,message:'지도 안의 칸을 선택하세요.'};
  const cell=this.cell(x,y),b=this._buildingAt(x,y),t=this.tasks.find(t=>t.x===x&&t.y===y)||
   (b&&this.tasks.find(t=>t.buildingId===b.id));
  if(!cell.revealed)return{ok:false,message:'아직 탐사하지 않은 구역입니다.'};
  if(this.lost)return{ok:false,message:'모든 대원이 쓰러졌습니다. 새 기지를 시작하세요.'};
  if(tool==='insulate'){
   if(cell.solid!=='tile'||t)return{ok:false,message:'공사가 끝난 바닥 타일을 선택하세요.'};
   if(cell.insulated)return{ok:false,message:'이미 단열 보강한 타일이에요.'};
   if(this.resources.rock<6)return{ok:false,message:'단열 보강에 암석 6이 필요해요.'};
   return{ok:true,message:'타일을 단열 보강했어요.'};
  }
  if(tool==='cancel')return{ok:!!t||!!b&&b.progress<1,message:t||b?.progress<1?'작업을 취소합니다.':'취소할 작업이 없어요.'};
  if(tool==='priority')return{ok:!!t,message:t?'작업 우선순위를 높입니다.':'예정된 작업을 선택하세요.'};
  if(this.modernRules&&['removeGasBridge','removeLiquidBridge'].includes(tool)){
   const type=tool==='removeGasBridge'?'gasBridge':'liquidBridge';
   const target=this.buildings.find(item=>item.type===type&&buildingCells(item).some(pos=>pos.x===x&&pos.y===y));
   if(!target)return{ok:false,message:'선택한 칸에 해당 관 다리가 없습니다.'};
   if(this.tasks.some(task=>task.type==='deconstruct'&&task.buildingId===target.id))
    return{ok:false,message:'이미 다리 철거가 예약되어 있어요.'};
   return{ok:true,message:'선택한 관 다리 철거를 예약합니다.'};
  }
  if(tool==='wire')return{ok:!cell.wire&&cell.solid!=='bedrock'&&this.resources.metal>=1,message:cell.wire?'이미 전선이 있어요.':this.resources.metal<1?'금속이 부족해요.':cell.solid==='bedrock'?'기반암에는 설치할 수 없어요.':'금속 1로 전선을 즉시 설치합니다.'};
  if(tool==='dig')return{ok:!!cell.solid&&!['bedrock','tile'].includes(cell.solid)&&!t,message:t?'이미 작업이 예정되어 있어요.':!cell.solid?'이미 비어 있는 칸이에요.':cell.solid==='bedrock'?'기반암은 채굴할 수 없어요.':cell.solid==='tile'?'바닥 타일은 해체 도구를 사용하세요.':'채굴 작업을 예약합니다.'};
  if(tool==='deconstruct')return{ok:(!t&&((!!b&&b.type!=='core')||cell.solid==='tile'||cell.wire)),message:b?.type==='core'?'기지 코어는 해체할 수 없어요.':t?'이미 작업이 예정되어 있어요.':'건물이나 전선을 해체합니다.'};
  const def=BUILDINGS[tool];if(!def)return{ok:false,message:'사용할 수 없는 도구입니다.'};
  if(!this.modernRules&&def.unlock&&this.stats.research<def.unlock)return{ok:false,message:`연구 ${def.unlock}이 필요해요.`};
  if(this.modernRules){
   const spec=BUILDING_FOOTPRINTS[tool];
   if(!spec)return{ok:false,message:'배치 크기 정보가 없는 건물입니다.'};
   if(spec.rotatable&&(!Number.isInteger(rotation)||rotation<0||rotation>3))
    return{ok:false,message:'건물 방향은 0에서 3 사이로 지정하세요.'};
   const candidate={type:tool,x,y,rotation};
   for(const pos of buildingCells(candidate)){
    const target=this.cell(pos.x,pos.y);
    if(!target||!target.revealed)return{ok:false,message:'건물 전체가 탐사된 지도 안에 있어야 합니다.'};
    const blockedBuilding=this.buildings.some(existing=>!BUILDING_FOOTPRINTS[existing.type]?.overlay
     &&buildingCells(existing).some(cell=>cell.x===pos.x&&cell.y===pos.y));
    const blockedTask=this.tasks.some(task=>{
     if(task.x!==pos.x||task.y!==pos.y)return false;
     const existing=this.buildings.find(item=>item.id===task.buildingId);
     return !BUILDING_FOOTPRINTS[existing?.type]?.overlay;
    });
    const terrainBlocked=spec.placement!=='conduit'&&target.solid;
    const buildingBlocked=!spec.overlay&&blockedBuilding;
    if(terrainBlocked||buildingBlocked||!spec.overlay&&blockedTask)
     return{ok:false,message:'건물 크기만큼 비어 있는 공간이 필요해요.'};
   }
   if(spec.placement==='floor'){
    const bounds=buildingBounds(candidate);
    for(let dx=0;dx<bounds.width;dx++)if(!this.cell(bounds.x+dx,bounds.y+bounds.height)?.solid)
     return{ok:false,message:'건물 전체를 지탱할 바닥이 필요해요.'};
   }
  }else{
   if(cell.solid||b||t)return{ok:false,message:'비어 있는 칸에 설치하세요.'};
   if(!['ladder','tile','gasPump','gasVent'].includes(tool)&&!this.cell(x,y+1)?.solid)return{ok:false,message:'설비 바로 아래에 바닥이 필요해요.'};
  }
  if(!this._afford(def.cost))return{ok:false,message:'건설 자원이 부족해요.'};
  return{ok:true,message:`${def.name} 건설을 예약합니다.`};
 }
 queue(tool,x,y,rotation=this.buildRotation||0){
  const check=this.canPlace(tool,x,y,rotation);if(!check.ok)return check;
  const c=this.cell(x,y),b=this._buildingAt(x,y),t=this.tasks.find(t=>t.x===x&&t.y===y);
  if(tool==='insulate'){this._pay({rock:6});c.insulated=true;return check;}
  if(tool==='wire'){c.wire=true;this.resources.metal-=1;this._networkDirty=true;return check;}
  if(tool==='cancel'){if(t)this._cancelTask(t,true);else if(b?.progress<1){this._pay(b.paidCost||BUILDINGS[b.type].cost,1);this.buildings=this.buildings.filter(v=>v!==b);}return{ok:true,message:'작업을 취소하고 예약 자원을 돌려받았어요.'};}
  if(tool==='priority'){t.priority=t.priority>=5?1:t.priority+1;return{ok:true,message:`우선순위 ${t.priority}`};}
  if(this.modernRules&&['removeGasBridge','removeLiquidBridge'].includes(tool)){
   const type=tool==='removeGasBridge'?'gasBridge':'liquidBridge';
   const target=this.buildings.find(item=>item.type===type&&buildingCells(item).some(pos=>pos.x===x&&pos.y===y));
   this.tasks.push({id:this._id(),type:'deconstruct',x:target.x,y:target.y,priority:3,progress:0,assigned:null,buildingId:target.id});
   return check;
  }
  if(tool==='deconstruct'&&!b&&c.solid!=='tile'&&c.wire){c.wire=false;this.resources.metal+=1;this._networkDirty=true;return{ok:true,message:'전선을 철거했어요.'};}
  let buildingId=b?.id||null;
  if(BUILDINGS[tool]){this._pay(BUILDINGS[tool].cost);const n=this._addBuilding(tool,x,y,false,0);if(this.modernRules)n.rotation=BUILDING_FOOTPRINTS[tool]?.rotatable?((rotation%4)+4)%4:0;n.paidCost={...BUILDINGS[tool].cost};buildingId=n.id;}
  this.tasks.push({id:this._id(),type:tool==='dig'?'dig':tool==='deconstruct'?'deconstruct':'build',x,y,priority:3,progress:0,assigned:null,buildingId});
  return check;
 }
 _cancelTask(t,refund){if(t.type==='build'){const b=this.buildings.find(v=>v.id===t.buildingId);if(b){if(refund)this._pay(b.paidCost||BUILDINGS[b.type].cost,1);this.buildings=this.buildings.filter(v=>v!==b);}}this.tasks=this.tasks.filter(v=>v!==t);for(const c of this.crew)if(c.taskId===t.id)this._release(c);this._networkDirty=true;}
 toggleBuilding(id){const b=this.buildings.find(v=>v.id===id);if(!b||['core','tile','ladder'].includes(b.type)||b.progress<1)return false;b.enabled=!b.enabled;this._networkDirty=true;return true;}
 setCrewRole(id,role){const c=this.crew.find(v=>v.id===id);if(!c||!ROLES.includes(role))return false;c.role=role;this._release(c);return true;}
 recruit(){const alive=this.crew.filter(c=>c.health>0).length;if(alive>=4)return{ok:false,message:'이 작은 기지는 대원 4명까지 생활할 수 있어요.'};if(this.stats.research<12)return{ok:false,message:'연구 12를 달성하면 새 대원을 맞을 수 있어요.'};const price={metal:20,water:10,food:8};if(!this._afford(price))return{ok:false,message:'금속 20 · 물 10 · 식량 8이 필요해요.'};this._pay(price);const c=this._newCrew(24,11);this._event(`${c.name} 대원이 합류했어요. 산소와 식량 소비도 늘어납니다.`,'good');this._updateStats();return{ok:true,message:`${c.name} 대원이 합류했습니다.`};}
 _neighbors(x,y){const out=[];for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(!this._standable(nx,ny))continue;if(dy!==0&&!this._ladder(x,y)&&!this._ladder(nx,ny))continue;out.push({x:nx,y:ny});}return out;}
 _path(c,goals){
  const sx=Math.floor(c.x),sy=Math.floor(c.y),start=sy*this.w+sx;
  let cache=this._pathCache;
  if(!cache||cache.start!==start||cache.revision!==this._navRevision){
   const q=[start],prev=new Map([[start,-1]]),distance=new Map([[start,0]]);
   for(let i=0;i<q.length;i++){const v=q[i];for(const n of this._neighbors(v%this.w,Math.floor(v/this.w))){const id=n.y*this.w+n.x;if(prev.has(id))continue;prev.set(id,v);distance.set(id,distance.get(v)+1);q.push(id);}}
   cache={start,revision:this._navRevision,prev,distance};this._pathCache=cache;
  }
  let best=null,bestDistance=Infinity;
  for(const g of goals){if(!this._standable(g.x,g.y))continue;const id=g.y*this.w+g.x,d=cache.distance.get(id);if(d!==undefined&&d<bestDistance){best=id;bestDistance=d;}}
  if(best===null)return null;const path=[];let cursor=best;
  while(cursor!==start){path.unshift({x:cursor%this.w,y:Math.floor(cursor/this.w)});cursor=cache.prev.get(cursor);}return path;
 }
 _workGoals(x,y,inside=true){
  const out=[],targets=this.modernRules?buildingCells(this._buildingAt(x,y)||{type:'',x,y}):[{x,y}],seen=new Set();
  for(const target of targets){
   if(inside&&this._standable(target.x,target.y)){const id=target.y*this.w+target.x;if(!seen.has(id)){seen.add(id);out.push(target);}}
   for(let dy=-2;dy<=2;dy++)for(let dx=-1;dx<=1;dx++){
    if(Math.abs(dx)+Math.abs(dy)>2||dx===0&&dy===0)continue;
    const nx=target.x+dx,ny=target.y+dy;if(!this._standable(nx,ny))continue;
    if(Math.abs(dy)===2&&this.cell(target.x,target.y+dy/2)?.solid)continue;
    if(dx&&dy&&this.cell(target.x+dx,target.y)?.solid&&this.cell(target.x,target.y+dy)?.solid)continue;
    const id=ny*this.w+nx;if(!seen.has(id)){seen.add(id);out.push({x:nx,y:ny});}
   }
  }
  return out;
 }
 _tileBlockReason(t){
  if(t.type!=='build'||t.progress<.95)return null;
  const b=this.buildings.find(v=>v.id===t.buildingId);
  if(b?.type!=='tile')return null;
  if(this.cell(t.x,t.y).frost>0)return '타일 건설 대기 · 바닥의 얼음이 녹아야 해요.';
  return displaceForTile(this,t.x,t.y,false)?null:'타일 건설 대기 · 주변에 물과 기체가 이동할 공간이 필요해요.';
 }
 _busy(id){return this.crew.some(c=>c.health>0&&c._job?.targetId===id);}
 _release(c){const t=this.tasks.find(t=>t.id===c.taskId);if(t&&t.assigned===c.id)t.assigned=null;c.taskId=null;c._job=null;c.path=[];c._idle=.2;}
 _assign(c,kind,path,extra={}){c._job={kind,path,elapsed:0,...extra};c.path=path;c._idle=0;if(extra.taskId){c.taskId=extra.taskId;const t=this.tasks.find(t=>t.id===extra.taskId);if(t)t.assigned=c.id;}}
 _needsGenerator(b){if(!b.enabled||!b.connected)return false;const n=this._networks[b.networkId];if(!n)return false;const consumers=n.buildings.some(v=>v.enabled&&v.progress>=1&&(BUILDINGS[v.type]?.power||0)>0);const bats=n.buildings.filter(v=>v.type==='battery'&&v.enabled);return consumers&&(bats.length===0||bats.reduce((s,v)=>s+v.charge,0)<bats.reduce((s,v)=>s+v.capacity,0)*.90);}
 _choose(c){
  const current=this.cell(Math.floor(c.x),Math.floor(c.y));
  if(c.breath<45){const safe=[],thin=[];for(let y=1;y<this.h-1;y++)for(let x=1;x<this.w-1;x++){const p=this.cell(x,y);if(p.water<.5&&canBreathe(p)&&this._standable(x,y)){if(p.oxygen>.5)safe.push({x,y});else if(p.oxygen>.2)thin.push({x,y});}}const path=this._path(c,safe)||this._path(c,thin);if(path){this._assign(c,'breathe',path);return;}}
  if(c.hunger<48&&Math.max(this.resources.food,this.resources.meals||0)>=(this.originalRules?1e-6:1)){if(!this._chooseMeal?.(c))this._assign(c,'eat',[]);return;}
  if(c.energy<24){const beds=this.buildings.filter(b=>b.type==='cot'&&b.progress>=1&&b.enabled&&!this._busy(b.id));for(const b of beds){const path=this._path(c,[{x:b.x,y:b.y}]);if(path){this._assign(c,'rest',path,{targetId:b.id});return;}}this._assign(c,'rest',[]);return;}
  if(this._chooseRoutine?.(c))return;
  const choices=[];
  for(const b of this.buildings){if(b.progress<1||!b.enabled||this._busy(b.id))continue;let kind=null,score=0;
   if(b.type==='generator'&&this._needsGenerator(b)){kind='operate';score=90;}
   if(b.type==='farm'&&b.growth>=1){kind='harvest';score=65;}
   if(this.modernRules&&['research','supercomputer','planetarium'].includes(b.type)&&this._researchCanWork?.(b)){kind='research';score=30;}
   else if(!this.modernRules&&b.type==='research'&&this.stats.research<100&&this.resources.water>0){kind='research';score=30;}
   if(!kind)continue;const path=this._path(c,this._workGoals(b.x,b.y));if(path)choices.push({kind,path,targetId:b.id,score:score+(c.role==='operate'&&['operate','research'].includes(kind)?12:0)+(c.role==='farm'&&kind==='harvest'?20:0)-path.length*.5});
  }
  this._communityChoices?.(c,choices);
  for(const t of this.tasks){if((t.assigned!==null&&t.assigned!==c.id)||this._tileBlockReason(t))continue;const path=this._path(c,this._workGoals(t.x,t.y,t.type!=='build'||this.buildings.find(b=>b.id===t.buildingId)?.type!=='tile'));if(path)choices.push({kind:t.type,path,taskId:t.id,score:t.priority*13+(c.role===t.type?18:0)-path.length*.5});}
  choices.sort((a,b)=>b.score-a.score);if(choices.length){const q=choices[0];this._assign(c,q.kind,q.path,q);if(q.pileId){const pile=this.debris?.find(p=>p.id===q.pileId);if(pile)pile.reservedBy=c.id;}return;}
  c.action='기지 살피는 중';c._idle=.65;
 }
 _completeTask(t){const p=this.cell(t.x,t.y);if(t.type==='dig'){const m=MATERIALS[p.solid];if(m){
   const resource=this.originalRules&&p.solid==='dirt'?'soil':m.yield;
   const amount=this.originalRules?NATURAL_MASS_KG[p.solid]*0.5:m.amount;
   if(this.originalRules&&p.solid==='ice')p.frost=amount/this.waterKgPerCell;
   else if(this._minedResource)this._minedResource(resource,amount,t.x,t.y);
   else this.resources[resource]+=amount;
   p.solid=null;p.oxygen=0;p.co2=0;this.stats.completedDigs++;this._reveal(t.x,t.y);}}
  else if(t.type==='build'){const b=this.buildings.find(b=>b.id===t.buildingId);if(b){
    if(b.type==='tile'&&!displaceForTile(this,t.x,t.y)){
     b.progress=t.progress=.95;
     b.status=t.blockedReason=this._tileBlockReason(t);
     return;
    }
    b.progress=1;b.status='준비';if(b.type==='tile')p.solid='tile';this.stats.completedBuilds++;this._event(`${BUILDINGS[b.type].name} 완공!`,'good');}}
  else{const b=this.buildings.find(b=>b.id===t.buildingId);if(b){for(const[k,v]of Object.entries(BUILDINGS[b.type]?.cost||{}))this.resources[k]+=Math.floor(v*.75);if(b.type==='tile'){p.solid=null;delete p.insulated;}this.buildings=this.buildings.filter(v=>v!==b);}else if(p.solid==='tile'){p.solid=null;delete p.insulated;this.resources.rock+=2;}}
  this.tasks=this.tasks.filter(v=>v!==t);this._networkDirty=true;this._navRevision++;this._pathCache=null;
 }
 _crewStep(c,dt){
  if(c.health<=0){c.action='쓰러짐';return;}
  this._sanitationNeeds?.(c,dt);this._communityNeeds?.(c,dt);
  const x=Math.floor(c.x),y=Math.floor(c.y),p=this.cell(x,y);if(!p){c.x=24.5;c.y=11.5;this._release(c);return;}
  if(p.solid){const spots=this._workGoals(x,y,false);if(spots.length){c.x=spots[0].x+.5;c.y=spots[0].y+.5;this._release(c);}return;}
  if(!this._standable(x,y)&&!this.cell(x,y+1)?.solid){c.y=Math.min(this.h-1.5,c.y+dt*3);this._release(c);c.action='아래로 내려오는 중';return;}
  c.hunger=clamp(c.hunger-dt*(this.originalRules?25/this.cycleSeconds:.20),0,100);c.energy=clamp(c.energy-dt*(c._job?.kind==='rest' ? 0 : c._job?.path?.length ? .07 : c._job ? .11 : .025),0,100);
  const portableFraction=this._portableBreath?.(c,p,dt)||0,breathable=portableFraction>=1||canBreathe(p,this.modernRules);
  if(portableFraction>0){
   if(this.modernRules)recordRespirationCO2(this,c,p,x,y,this.breathRate*dt*portableFraction*GAS_KG_PER_UNIT);
   else if(this.originalRules)p.co2+=this.breathRate*dt*portableFraction*.02;
   c.breath=clamp(c.breath+dt*(18*portableFraction-7*(1-portableFraction)),0,100);
  }
  else if(breathable){if(this.modernRules){const used=takeAtmosphere(p,this.breathRate*dt*GAS_KG_PER_UNIT);recordRespirationCO2(this,c,p,x,y,used);}else{const used=Math.min(p.oxygen,this.breathRate*dt);p.oxygen-=used;p.co2+=used*.02;}c.breath=clamp(c.breath+dt*18,0,100);}else c.breath=clamp(c.breath-dt*7,0,100);
  let hurt=(c.breath<=0?3:0)+(c.hunger<=0?.3:0)+(p.temp>46?(p.temp-46)*.08:0);c.health=clamp(c.health-hurt*dt+(hurt===0&&c.hunger>35?.018*dt:0),0,100);c.stress=clamp(c.stress+dt*(hurt>0?.5:!breathable?.16:c.energy<12?.08:-.035),0,100);
  if(c.health<=0){this._release(c);this._event(`${c.name} 대원이 쓰러졌습니다.`,'danger');return;}
  if(c.breath<25){if(c._job&&c._job.kind!=='breathe')this._release(c);if(!c._job)c._idle=0;}
  if(c._idle>0){c._idle=Math.max(0,c._idle-dt);return;}if(!c._job)this._choose(c);let j=c._job;if(!j)return;
  if(j.kind==='breathe'){const end=j.path.at(-1)||{x,y},destination=this.cell(end.x,end.y);if(!canBreathe(destination,this.modernRules)){this._release(c);c._idle=0;this._choose(c);j=c._job;if(!j)return;}}
  if(j.path.length){const next=j.path[0];if(!this._standable(next.x,next.y)){this._release(c);return;}const tx=next.x+.5,ty=next.y+.5,dx=tx-c.x,dy=ty-c.y,d=Math.hypot(dx,dy),move=dt*2.25*(1-.65*p.water);if(dx)c.facing=Math.sign(dx);if(d<=move){c.x=tx;c.y=ty;j.path.shift();}else{c.x+=dx/d*move;c.y+=dy/d*move;}c.action=this._communityTravelLabel?.(c)||'작업 장소로 이동';this._reveal(Math.floor(c.x),Math.floor(c.y),3);return;}
  const harvestMultiplier=j.kind==='harvest'?(this._harvestWorkMultiplier?.(c)||1):1;
  j.elapsed+=dt*harvestMultiplier;const b=this.buildings.find(v=>v.id===j.targetId);
  if(this._frontierWork?.(c,j,b,dt))return;
  if(this._communityWork?.(c,j,b,dt))return;
  if(['dig','build','deconstruct'].includes(j.kind)){const t=this.tasks.find(v=>v.id===j.taskId);if(!t){this._release(c);return;}const blocked=this._frontierTaskReason?.(t);if(blocked){t.blockedReason=blocked;c.action='해체 · 저장 공간 대기';this._release(c);return;}delete t.blockedReason;c.action=j.kind==='dig'?'채굴하는 중':j.kind==='build'?'건설하는 중':'해체하는 중';const hardness=j.kind==='dig'?(MATERIALS[this.cell(t.x,t.y).solid]?.hardness||2):j.kind==='build'?4:2.5,efficiency=(c.role===j.kind?1.25:1)*(this._workEfficiency?.(c)||1),previous=t.progress;t.progress=clamp(t.progress+dt/hardness*efficiency,0,1);this._gainExperience?.(c,(t.progress-previous)*hardness/efficiency);const target=this.buildings.find(v=>v.id===t.buildingId);if(t.type==='build'&&target)target.progress=t.progress;if(t.progress>=1){this._completeTask(t);this._release(c);}return;}
  if(j.kind==='eat'){c.action='식사하는 중';if(j.elapsed>=2){if(this.resources.food>=1){this.resources.food-=1;c.hunger=clamp(c.hunger+(this.originalRules?25:24),0,100);if(this.production)this.production.mealsEaten+=1;}this._release(c);}return;}
  if(j.kind==='rest'){c.action='잠깐 쉬는 중';c.energy=clamp(c.energy+dt*(b?3:1.2),0,100);if(b){b.active=true;b.workerId=c.id;}if(c.energy>=95)this._release(c);return;}
  if(j.kind==='breathe'){c.action='숨을 고르는 중';if(c.breath>=95)this._release(c);return;}
  if(!b||!b.enabled||b.progress<1){this._release(c);return;}b.workerId=c.id;if(this._sanitationWork?.(c,j,b,dt))return;
  if(j.kind==='operate'){c.action='발전기를 돌리는 중';if((!this._needsGenerator(b)&&j.elapsed>5)||c.energy<15||c.hunger<25)this._release(c);return;}
  if(j.kind==='research'){c.action=b.status?.includes('연구')?'연구하는 중':'연구 · 전력 대기';if((this.modernRules?!this._researchCanWork?.(b):this.stats.research>=100)||c.energy<18||c.hunger<25||j.elapsed>80)this._release(c);return;}
  if(j.kind==='harvest'){c.action='작물을 수확하는 중';if(b.growth>=1)this._gainExperience?.(c,Math.min(dt,Math.max(0,3-j.elapsed+dt*harvestMultiplier)/harvestMultiplier));if(j.elapsed>=3){if(b.growth>=1){const yieldFood=this.originalRules?MEALWOOD.harvestKcal/1000:1.5;
    this.resources.food+=yieldFood;b.growth=0;if(this.production)this.production.harvestedFood+=yieldFood;
    this._frontierHarvest?.(b);this._event(this.originalRules?'끼니나무 수확 · 600 kcal':'식량 +1.5 수확. 작은 정원이 자라고 있어요.','good');}this._release(c);}}
 }
 _rebuildNetworks(){this._networkDirty=false;this._networks=[];const seen=new Set();for(let i=0;i<this.cells.length;i++){if(!this.cells[i].wire||seen.has(i))continue;const net={id:this._networks.length,cells:[],buildings:[]},q=[i];seen.add(i);for(let n=0;n<q.length;n++){const v=q[n];net.cells.push(v);const x=v%this.w,y=Math.floor(v/this.w);for(const[dx,dy]of DIRS){const p=this.cell(x+dx,y+dy),id=(y+dy)*this.w+x+dx;if(p?.wire&&!seen.has(id)){seen.add(id);q.push(id);}}}this._networks.push(net);}
  const map=new Map();for(const n of this._networks)for(const i of n.cells)map.set(i,n.id);
  for(const b of this.buildings){
   const port=this.modernRules?buildingPort(b,'power'):null;
   const x=port?.x??b.x,y=port?.y??b.y;
   b.networkId=map.get(y*this.w+x)??-1;
   if(b.progress>=1&&b.networkId>=0)this._networks[b.networkId].buildings.push(b);
  }
  for(const b of this.buildings){const n=this._networks[b.networkId];b.connected=!!n&&n.buildings.some(v=>['generator','coalgen','hydrogenGen','steamTurbine','battery'].includes(v.type));}
 }
  _consumerReady(b){const p=this.cell(b.x,b.y);const utilityReason=this._utilityReady?.(b,this._utilityDt||.1);if(utilityReason)return utilityReason;if(!b.enabled)return'수동 정지';if(!this.originalRules&&p.temp>58)return'과열 · 냉각 필요';if(b.type==='diffuser'){if(this.resources.algae<=0)return'조류 부족';if(oxygenOutletSpace(p,this.originalRules,this.modernRules,this)<=1e-9)return'산소 충분 · 압력 대기';}if(b.type==='research'){if(this.stats.research>=100)return'연구 완료';if(this.resources.water<=0)return'물 부족';if(!b.workerId)return'연구원 대기';}if(b.type==='pump'&&!(this.modernRules?[[0,0],...DIRS]:DIRS).some(([dx,dy])=>(this.cell(b.x+dx,b.y+dy)?.water||0)>(this.modernRules?1e-9:.005)))return'주변에 물이 없어요';return null;}
 _buildingStep(dt){if(this._networkDirty)this._rebuildNetworks();let totalStored=0,totalCap=0,totalProd=0,totalDemand=0;
  const original=this.originalRules;
  const powerOf=type=>this.buildingPower?.(type)??BUILDINGS[type]?.power??0;
  const diffuserOxygenRate=original?.5/GAS_KG_PER_UNIT:.35;
  const diffuserAlgaeRate=original?.55:.025;
  const electrolyzerWaterRate=original?1:.18;
  if(original)for(const b of this.buildings){
   if(b.type==='battery'&&b.progress>=1)b.charge=Math.max(0,b.charge-BATTERY_LEAK_J_PER_S*dt);
  }
  for(const b of this.buildings){b.activeFraction=0;if(b.progress<1){b.status='건설 대기';continue;}if(!b.enabled){b.status='수동 정지';continue;}if((powerOf(b.type)>0||b.type==='steamTurbine')&&!b.connected)b.status='전선 연결 필요';}
  const reservedElectrolyzerWater=new Map();let reservedAlgae=0,reservedHydrogen=0;
   for(const n of this._networks){const bats=n.buildings.filter(b=>b.type==='battery'&&b.enabled),consumers=[];let production=0;
   for(const b of n.buildings){
     if(!b.enabled||powerOf(b.type)<=0)continue;
    const reason=this._consumerReady(b);
    if(reason){b.status=reason;b.active=false;}
    else consumers.push(b);
   }
   consumers.sort((a,b)=>(a.type==='diffuser'?-1:0)-(b.type==='diffuser'?-1:0));
   const limits=new Map();
   for(const b of consumers){
    let limit=1;
    if(b.type==='diffuser'){
     const p=this.cell(b.x,b.y),room=oxygenOutletSpace(p,original,this.modernRules,this);
     limit=Math.max(0,Math.min(1,room/(diffuserOxygenRate*dt),(this.resources.algae-reservedAlgae)/(diffuserAlgaeRate*dt)));
     reservedAlgae+=diffuserAlgaeRate*dt*limit;
    }else if(b.type==='electrolyzer'){
     const net=this._fluidNet(b,'water'),reserved=reservedElectrolyzerWater.get(net)||0;
     limit=this._utilityPowerFraction?.(b,dt,{water:reserved,hydrogen:reservedHydrogen})??1;
     reservedElectrolyzerWater.set(net,reserved+electrolyzerWaterRate*dt*limit);
     reservedHydrogen+=electrolyzerWaterRate*.112*dt*limit;
    }
    limits.set(b,limit);
   }
   const need=consumers.reduce((s,b)=>s+powerOf(b.type)*limits.get(b),0);
   const cap=bats.reduce((s,b)=>s+b.capacity,0),oldCharge=bats.reduce((s,b)=>s+b.charge,0);
   for(const turbine of n.buildings)if(turbine.type==='steamTurbine'&&turbine.enabled){
    production+=this._steamPower?.(turbine,dt,Math.max(0,need-production+(cap-oldCharge)/dt))||0;
   }
   for(const b of n.buildings){
    if(!b.enabled)continue;
    if(b.type==='generator'){
     b.active=!!b.workerId;b.activeFraction=b.active?1:0;
     const watts=Math.abs(powerOf('generator'));
     b.status=b.active?`발전 중 · ${watts}W`:'발전 대원 대기';
     if(b.active){production+=watts;this._gainExperience?.(this.crew.find(c=>c.id===b.workerId),dt);}
    }
    if(b.type==='coalgen'){
     const p=this.cell(b.x,b.y),run=this.resources.coal>0&&this._automationAllows(b)
      &&(original||need>0||oldCharge<cap*.95);
     const coalRate=original?1:.025,co2Rate=original?.02:.03;
     // EnergyGenerator.Emit adds its exhaust independently of the oxygen machines' pressure sensors.
     const exhaustLimit=this.modernRules?atmosphereSpaceKg(this,p,'co2')/(co2Rate*dt):original?Infinity:Math.max(0,3-p.co2)/(co2Rate*dt);
     const fuelLimit=this.resources.coal/(coalRate*dt);
     const watts=Math.abs(powerOf('coalgen'));
     const fraction=run?Math.max(0,Math.min(1,fuelLimit,exhaustLimit)):0;
     b.activeFraction=fraction;b.active=fraction>1e-8;
     b.status=b.active?`발전 중 · ${Math.round(watts*fraction)}W`:this.resources.coal<=0?'석탄 부족':exhaustLimit<=1e-8?'CO₂ 배출 대기':'전력 충분';
     if(b.active){
      if(this.modernRules){
       const emitted=emitAtmosphere(this,b.x,b.y,'co2',co2Rate*dt*fraction,Math.max(110,p.temp));
       const actualFraction=emitted/(co2Rate*dt||1);b.activeFraction=actualFraction;b.active=actualFraction>1e-8;
       production+=watts*actualFraction;this.resources.coal=Math.max(0,this.resources.coal-coalRate*dt*actualFraction);
       if(actualFraction<fraction-1e-8)b.status='부분 가동 · CO₂ 배출 공간 제한';
      }else{
       production+=watts*fraction;
       this.resources.coal=Math.max(0,this.resources.coal-coalRate*dt*fraction);
       if(original)addGasKg(p,'co2',co2Rate*dt*fraction,Math.max(110,p.temp),this.waterKgPerCell);
       else{p.co2+=co2Rate*dt*fraction;p.temp+=.12*dt*fraction;}
      }
     }
    }
   }
   for(const b of n.buildings)if(b.type==='hydrogenGen'){
    const maxHydrogenPower=Math.abs(powerOf('hydrogenGen'));
    const chargeW=original?0:cap>oldCharge?Math.max(0,(cap*.95-oldCharge)/dt):0;
    const requested=original?maxHydrogenPower:Math.min(maxHydrogenPower,Math.max(0,need-production)+chargeW);
    production+=this._hydrogenPower?.(b,dt,requested)||0;
   }
   let energy=production*dt+oldCharge;
   for(const b of consumers){
    const watts=powerOf(b.type),limit=limits.get(b);
    const fractional=['diffuser','electrolyzer'].includes(b.type);
    const served=fractional?Math.min(limit,energy/(watts*dt)):(energy+1e-8>=watts*dt?1:0);
    b.activeFraction=fractional?served:served?1:0;b.active=served>1e-8;
    if(b.type==='diffuser')reservedAlgae=Math.max(0,reservedAlgae-diffuserAlgaeRate*dt*(limit-served));
    if(b.type==='electrolyzer'){
     const net=this._fluidNet(b,'water');
     reservedElectrolyzerWater.set(net,Math.max(0,(reservedElectrolyzerWater.get(net)||0)-electrolyzerWaterRate*dt*(limit-served)));
     reservedHydrogen=Math.max(0,reservedHydrogen-electrolyzerWaterRate*.112*dt*(limit-served));
    }
    energy-=watts*dt*served;totalDemand+=watts*served;
    b.status=served<=1e-8?'전력 부족':fractional&&served<.999?'부분 가동 · 전력/공급 제한':'가동 중';
   }
   energy=Math.min(cap,Math.max(0,energy));for(const b of bats){b.charge=cap>0?energy*b.capacity/cap:0;b.status=b.charge>1?`충전 ${Math.round(b.charge/b.capacity*100)}%`:'충전 대기';if(b.charge>10)this._batteryPowered=true;}
   totalStored+=energy;totalCap+=cap;totalProd+=production;
  }
  this.power={stored:totalStored,capacity:totalCap,production:totalProd,demand:totalDemand};
  for(const b of this.buildings){if(b.progress<1||!b.enabled)continue;const p=this.cell(b.x,b.y);
   if(b.type==='farm'&&this.originalRules){
    this._growMealwood(b,p,dt);
    continue;
   }
   if(b.type==='farm'){if(b.growth>=1){b.status='수확 준비 완료';continue;}const reason=this._utilityReady?.(b,dt)||(p.temp<12||p.temp>35?'생장 온도 이탈':p.oxygen<.12?'산소 부족':p.water>.5?'침수':this.resources.water<=0?'물 부족':null);if(reason){b.status=reason;continue;}b.active=true;if(!this._consumeWater(b,.012*dt))continue;b.growth=clamp(b.growth+dt/120*(this._farmGrowthMultiplier?.(b)||1),0,1);b.status=`성장 ${Math.floor(b.growth*100)}%`;}
   if(!b.active)continue;
   if(b.type==='diffuser'){
    const room=oxygenOutletSpace(p,original,this.modernRules,this);
    const fraction=Math.min(b.activeFraction,room/(diffuserOxygenRate*dt),this.resources.algae/(diffuserAlgaeRate*dt));
    b.activeFraction=fraction;b.active=fraction>1e-8;
    if(fraction>0){
     const oxygen=diffuserOxygenRate*dt*fraction;
     if(this.modernRules){
      const emitted=emitAtmosphere(this,b.x,b.y,'oxygen',oxygen*GAS_KG_PER_UNIT,30),actualUnits=emitted/GAS_KG_PER_UNIT,actualFraction=oxygen>0?actualUnits/oxygen:0;
      this.resources.algae=Math.max(0,this.resources.algae-diffuserAlgaeRate*dt*fraction*actualFraction);
      b.activeFraction*=actualFraction;b.active=actualFraction>1e-8;
      if(this.production)this.production.oxygenProduced+=actualUnits;
      if(actualFraction<fraction-1e-8)b.status='부분 가동 · 산소 공간 제한';
     }else{
      this.resources.algae=Math.max(0,this.resources.algae-diffuserAlgaeRate*dt*fraction);
      if(original)addWarmOxygen(p,oxygen,30,this.waterKgPerCell);else p.oxygen+=oxygen;
      if(this.production)this.production.oxygenProduced+=oxygen;
      if(!original)p.temp+=.025*dt*fraction;
     }
     if(fraction<.999)b.status='부분 가동 · 산소 공간 제한';
    }
   }
   if(this.modernRules&&['research','supercomputer','planetarium'].includes(b.type)){const worker=this.crew.find(c=>c.id===b.workerId);if(worker&&b.active)this._researchWork?.(b,dt,worker);}
   else if(b.type==='research'){const prev=this.stats.research,worker=this.crew.find(c=>c.id===b.workerId),efficiency=this._workEfficiency?.(worker)||1;this.stats.research=Math.min(100,prev+.24*dt*efficiency);this._gainExperience?.(worker,(this.stats.research-prev)/(.24*efficiency));this._consumeWater(b,.008*dt);p.temp+=.015*dt;if(prev<10&&this.stats.research>=10)this._event('연구 10! 탄소 정화기를 건설할 수 있어요.','good');if(prev<20&&this.stats.research>=20)this._event('연구 20! 석탄 발전기가 해금됐어요.','good');}
   if(b.type==='pump')this._pumpWater?.(b,dt);
   if(b.type==='scrubber')for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const c=this.cell(b.x+dx,b.y+dy);if(c&&!c.solid)c.co2=Math.max(0,c.co2-dt*.035);}
  }
 }
 _growMealwood(b,cell,dt){
  b.active=false;
  if(b.growth>=1){b.status='수확 준비 완료 · 600 kcal';return;}
  if(cell.water>.5){b.status='침수';return;}
  if(cell.temp<MEALWOOD.minC||cell.temp>MEALWOOD.maxC){b.status='생장 온도 이탈 · 10~30°C 필요';return;}
  if((cell.oxygen+cell.co2)*GAS_KG_PER_UNIT<MEALWOOD.minGasKg||Math.max(cell.steam||0,cell.hydrogen||0)>Math.max(cell.oxygen,cell.co2)*GAS_KG_PER_UNIT){
   b.status='생장 기체 부족 · 산소 또는 이산화탄소 150 g 이상 필요';return;
  }
  const fertilizer=MEALWOOD.dirtKgPerCycle/this.cycleSeconds;
  const seconds=Math.min(dt,(1-b.growth)*MEALWOOD.growthSeconds,this.resources.soil/fertilizer);
  if(seconds<=0){b.status='비료 부족 · 토양을 채굴해 흙을 운반하세요';return;}
  this.resources.soil=Math.max(0,this.resources.soil-seconds*fertilizer);
  b.growth=clamp(b.growth+seconds/MEALWOOD.growthSeconds,0,1);
  b.active=true;b.status=`끼니나무 성장 ${Math.floor(b.growth*100)}% · 흙 10 kg/주기`;
 }
 _environment(dt){stepEnvironment(this,dt,this.cycleSeconds);}
 _updateStats(){const alive=this.crew.filter(c=>c.health>0);const cells=[];const used=new Set();for(const c of alive)for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=Math.floor(c.x)+dx,y=Math.floor(c.y)+dy,i=y*this.w+x,p=this.cell(x,y);if(p&&!p.solid&&!used.has(i)){used.add(i);cells.push(p);}}
  this.stats.oxygen=cells.length?clamp(cells.reduce((s,c)=>s+clamp(c.oxygen/.8,0,1),0)/cells.length*100,0,100):0;this.stats.temperature=cells.length?cells.reduce((s,c)=>s+c.temp,0)/cells.length:22;this.stats.population=alive.length;this.stats.foodDays=(this.resources.food+(this.resources.meals||0))/Math.max(1,alive.length);
  if(alive.length===0&&!this.lost){this.lost=true;this._event('기지의 불빛이 조용해졌습니다. 저장을 불러오거나 다시 시작할 수 있어요.','danger');}
  const counts={dig:this.stats.completedDigs,oxygen:this.buildings.filter(b=>b.type==='diffuser'&&b.progress>=1).length,battery:this._batteryPowered?1:0,farms:this.buildings.filter(b=>b.type==='farm'&&!b.starter&&b.progress>=1).length,research:this.stats.research,survive:alive.length>=3?Math.floor(this.time/this.cycleSeconds):0};
  for(const o of this.objectives){if(o.done)continue;o.progress=Math.min(o.target,counts[o.id]||0);if(o.progress>=o.target){o.done=true;const rewards={dig:{rock:40,metal:20},oxygen:{algae:20},battery:{metal:20,water:12},farms:{food:3,water:18},research:{coal:20,metal:20},survive:{}}[o.id]||{};this._pay(rewards,1);this._event(`목표 달성 · ${o.label}${Object.keys(rewards).length?' — 보급품이 도착했어요.':''}`,'good');}}
  if(this._allowBaseWin!==false&&this.objectives.every(o=>o.done)&&!this.won){this.won=true;this._event('다섯 번의 아침을 함께 만들었습니다. 기지는 계속 자랄 수 있어요!','good');}
  const alerts=[];if(this.stats.oxygen<35)alerts.push({id:'oxygen',text:'숨 쉴 산소가 줄고 있어요. 확산기와 전력을 확인하세요.',tone:'danger'});if(alive.some(c=>c.breath<30))alerts.push({id:'breath',text:'숨이 가쁜 대원이 있어요. 안전한 통로를 확보하세요.',tone:'danger'});if(this.stats.foodDays<2)alerts.push({id:'food',text:'식량이 얼마 남지 않았어요. 재배와 수확을 확인하세요.',tone:'warn'});if(this.buildings.some(b=>b.progress>=1&&b.enabled&&BUILDINGS[b.type]?.power>0&&!b.connected))alerts.push({id:'wire',text:'전선이 연결되지 않은 설비가 있어요.',tone:'warn'});if(this.buildings.some(b=>b.status==='전력 부족'))alerts.push({id:'power',text:'전력이 부족해요. 발전 대원과 축전지를 확인하세요.',tone:'warn'});if(this.stats.temperature>35)alerts.push({id:'heat',text:'기지가 더워지고 있어요. 열이 나는 설비를 분리하세요.',tone:'warn'});this.alerts=alerts;
 }
 step(dt){if(!finite(dt)||dt<0||dt>3600)throw new Error('시뮬레이션 시간은 0~3600초의 유한한 값이어야 합니다.');if(this.lost)return;
  const elapsed=this._stepRemainder+dt;
  const ticks=Math.floor((elapsed+1e-10)/.1), d=.1;
  this._stepRemainder=Math.max(0,Number((elapsed-ticks*d).toFixed(12)));
  for(let tick=0;tick<ticks&&!this.lost;tick++){this.time+=d;this.cycle=Math.floor((this.time+1e-8)/this.cycleSeconds)+1;for(const b of this.buildings){b.active=false;b.workerId=null;}if(this._networkDirty)this._rebuildNetworks();this._startUtilities?.(d);this._startFrontier?.(d);for(const c of this.crew)this._crewStep(c,d);this._buildingStep(d);this._communityProduction?.(d);this._frontierProduction?.(d);this._finishUtilities?.(d);this._finishCommunity?.(d);this._finishFrontier?.(d);this._envClock+=d;this._statClock+=d;if(this._envClock>=.2){this._environment(this._envClock);this._envClock=0;}if(this._statClock>=.5){this._updateStats();this._statClock=0;}}}
 inspect(x,y){const c=this.cell(x,y);if(!c)return{title:'기지 밖',lines:[]};if(!c.revealed)return{title:'미탐사 구역',lines:['가까이 탐사하면 이곳의 지형을 알 수 있어요.']};const b=this._buildingAt(x,y),crew=this.crew.find(v=>Math.floor(v.x)===x&&Math.floor(v.y)===y);const lines=[`온도 ${c.temp.toFixed(1)}°C`];if(c.wire)lines.push('전선 설치됨');if(c.solid||c.water||c.frost||c.steam){
   const material=materialFor(c);
   if(this.originalRules&&Object.hasOwn(NATURAL_MASS_KG,c.solid)){
    const mass=NATURAL_MASS_KG[c.solid];
    lines.push(c.solid==='bedrock'?`지형 질량 ${mass} kg`:`지형 질량 ${mass} kg · 채굴 시 ${mass*.5} kg 회수`);
   }
   if(c.insulated)lines.push('단열 보강 타일');
   lines.push(`비열 ${material.specificHeatCapacity} DTU/g/°C · 열전도도 ${Number(conductivity(c).toFixed(5))}`);
  }
  if(this.modernRules&&!c.solid){
    const gas=atmosphereOf(c),names={oxygen:'산소',co2:'이산화탄소',hydrogen:'수소',steam:'증기'};
    lines.unshift(gas?`${names[gas.element]} ${gas.massKg.toFixed(3)} kg · ${canBreathe(c)?'호흡 가능':'호흡 곤란'}`:(c.water||c.frost?'대기 없음':'대기 · 진공'));
  }else if(!c.solid)lines.push(`산소 ${(c.oxygen*GAS_KG_PER_UNIT).toFixed(3)} kg · 이산화탄소 ${(c.co2*GAS_KG_PER_UNIT).toFixed(3)} kg · ${canBreathe(c)?'호흡 가능':'호흡 곤란'}`);
  if(!c.solid)lines.push(`${c.liquidElement==='dirtyWater'?'오수':'물'} ${(c.water*this.waterKgPerCell).toFixed(2)} L · 얼음 ${((c.frost||0)*this.waterKgPerCell).toFixed(2)} kg · 증기 ${(c.steam||0).toFixed(2)} kg`);
  if(c.steamVent){
   const phase=this.time%this.cycleSeconds;
   lines.push(`증기 분출구 · ${phase<36?'분출기':'휴지기'} · 누적 ${c.ventOutput.toFixed(2)} kg`);
   lines.push('주기 시작 후 36초간 165°C 증기 분출 · 증기 2.5 kg 또는 타일로 막으면 정지');
  }
  if(b){lines.unshift(b.progress<1?`건설 ${Math.round(b.progress*100)}%`:b.status);if(b.type==='battery')lines.push(`저장 ${Math.round(b.charge)} / ${b.capacity}J`);if(this.buildingPower(b.type)>0)lines.push(`필요 전력 ${this.buildingPower(b.type)}W`);}if(crew)lines.push(`${crew.name} · ${crew.action}`,`건강 ${Math.round(crew.health)} · 포만 ${Math.round(crew.hunger)} · 에너지 ${Math.round(crew.energy)}`);const t=this.tasks.find(t=>t.x===x&&t.y===y);if(t)lines.push(`예정 작업 · 우선순위 ${t.priority} · ${Math.round(t.progress*100)}%`);return{title:b?(BUILDINGS[b.type]?.name||'기지 코어'):MATERIALS[c.solid]?.name||'열린 공간',lines,building:b,crew};}
 serialize(){return copy({version:this.version,ruleset:this.ruleset,seed:this.seed,w:this.w,h:this.h,time:this.time,cycle:this.cycle,cells:this.cells,buildings:this.buildings,tasks:this.tasks,crew:this.crew,resources:this.resources,power:this.power,stats:this.stats,objectives:this.objectives,events:this.events,alerts:this.alerts,lost:this.lost,won:this.won,_nextId:this._nextId,_stepRemainder:this._stepRemainder,_envClock:this._envClock,_statClock:this._statClock,_batteryPowered:this._batteryPowered});}
 load(object){
  const fail=(s)=>{throw new Error('저장 파일을 불러올 수 없어요: '+s);};
  if(!object||typeof object!=='object'||Array.isArray(object))fail('올바른 저장 데이터가 아닙니다.');
  let nodes=0;const walk=(v,depth=0)=>{if(++nodes>120000||depth>30)fail('데이터가 너무 복잡합니다.');if(typeof v==='number'&&!finite(v))fail('유효하지 않은 숫자가 있습니다.');if(v&&typeof v==='object')for(const[k,value]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))fail('지원하지 않는 데이터 키입니다.');walk(value,depth+1);}};walk(object);
  if(object.version!==2||object.w!==WORLD_W||object.h!==WORLD_H)fail('버전 또는 지도 크기가 맞지 않습니다.');
  if(!finite(object.time)||object.time<0||!Array.isArray(object.cells)||object.cells.length!==WORLD_W*WORLD_H)fail('시간 또는 지도 데이터가 손상되었습니다.');
  const waterKgPerCell=usesOriginalRates(object.ruleset)?ORIGINAL_WATER_PER_CELL:WATER_PER_CELL;
  const modernSave=object.ruleset===MODERN_RULES,maxOxygenUnits=modernSave?10/GAS_KG_PER_UNIT:10,maxRoomCO2=modernSave?10/GAS_KG_PER_UNIT:usesOriginalRates(object.ruleset)?1e9:10;
  const maxSteamKg=modernSave?10:waterKgPerCell;
  for(const c of object.cells){if(!c||!(c.solid===null||Object.hasOwn(MATERIALS,c.solid))||!['oxygen','co2','temp','water'].every(k=>finite(c[k]))||c.oxygen<0||c.oxygen>maxOxygenUnits||c.co2<0||c.co2>maxRoomCO2||c.water<0||c.water>1.001||('steamVent' in c&&(c.steamVent!==true||!finite(c.ventOutput)||c.ventOutput<0))||('insulated' in c&&(c.insulated!==true||c.solid!=='tile'))||('hydrogen' in c&&(!finite(c.hydrogen)||c.hydrogen<0||c.hydrogen>10.000001||c.solid&&c.hydrogen>0))||('frost' in c&&(!finite(c.frost)||c.frost<0||c.water+c.frost>1.001))||('steam' in c&&(!finite(c.steam)||c.steam<0||c.steam>maxSteamKg+.00001))||c.temp< -100||c.temp>300||typeof c.revealed!=='boolean'||typeof c.wire!=='boolean')fail('지형 데이터가 올바르지 않습니다.');}
  if(modernSave)for(const c of object.cells){const gasCount=['oxygen','co2','hydrogen','steam'].filter(k=>finite(c[k])&&c[k]>1e-9).length;if(gasCount>1||gasCount&&(c.water>1e-9||c.frost>1e-9)||c.liquidElement!==undefined&&(c.liquidElement!=='dirtyWater'||c.water+c.frost<=0))fail('4.3 셀에는 한 종류의 기체와 유효한 액체 종류만 저장할 수 있습니다.');}
  if(!object.resources||!RESOURCE_KEYS.every(k=>finite(object.resources[k])&&object.resources[k]>=0&&object.resources[k]<=1e9))fail('자원 수치가 올바르지 않습니다.');
  if(!Array.isArray(object.crew)||object.crew.length<1||object.crew.length>12)fail('대원 목록이 올바르지 않습니다.');
  const unique=(arr)=>new Set(arr.map(v=>v.id)).size===arr.length;
  for(const c of object.crew){if(!Number.isInteger(c.id)||c.id<1||typeof c.name!=='string'||c.name.length>50||!finite(c.x)||!finite(c.y)||c.x<0||c.x>=WORLD_W||c.y<0||c.y>=WORLD_H||!['health','hunger','energy','stress','breath'].every(k=>finite(c[k])&&c[k]>=0&&c[k]<=100)||!ROLES.includes(c.role)||Object.hasOwn(c,'co2BufferKg')&&(!finite(c.co2BufferKg)||c.co2BufferKg<0||c.co2BufferKg>1e6))fail('대원 상태가 올바르지 않습니다.');if(c._job&&(!['dig','build','deconstruct','operate','harvest','research','rest','eat','breathe','toilet','wash','haul','cook','relax','refillOxygen'].includes(c._job.kind)||!Array.isArray(c._job.path)||!c._job.path.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<WORLD_W&&p.y>=0&&p.y<WORLD_H)))fail('대원 이동 경로가 손상되었습니다.');}
  if(!Array.isArray(object.buildings)||object.buildings.length>3000||!Array.isArray(object.tasks)||object.tasks.length>3000)fail('설비·작업 목록이 올바르지 않습니다.');
  for(const b of object.buildings){if(!Number.isInteger(b.id)||b.id<1||!(b.type==='core'||Object.hasOwn(BUILDINGS,b.type))||!Number.isInteger(b.x)||!Number.isInteger(b.y)||b.x<0||b.x>=WORLD_W||b.y<0||b.y>=WORLD_H||!finite(b.progress)||b.progress<0||b.progress>1||typeof b.enabled!=='boolean'||!finite(b.charge)||b.charge<0||!finite(b.capacity)||b.capacity<0||b.charge>b.capacity+.01||!finite(b.growth)||b.growth<0||b.growth>1)fail('설비 상태가 올바르지 않습니다.');}
  if(modernSave){
   const occupied=new Map();
   for(const b of object.buildings){
    const spec=BUILDING_FOOTPRINTS[b.type];
    if(!spec)fail('건물 footprint 자료가 없습니다.');
    const rotation=b.rotation??0;
    if(!Number.isInteger(rotation)||rotation<0||rotation>3||rotation!==0&&!spec.rotatable)
     fail('건물 회전 정보가 올바르지 않습니다.');
    for(const pos of buildingCells({...b,rotation})){
     if(pos.x<0||pos.y<0||pos.x>=WORLD_W||pos.y>=WORLD_H)fail('건물 footprint가 지도 밖에 있습니다.');
     const index=pos.y*WORLD_W+pos.x;
     const previous=occupied.get(index);
     if(previous&&!(spec.overlay||previous.overlay))fail('건물 footprint가 겹칩니다.');
     if(!previous||!spec.overlay)occupied.set(index,spec);
    }
   }
  }
  for(const t of object.tasks){if(!Number.isInteger(t.id)||t.id<1||!['dig','build','deconstruct'].includes(t.type)||!Number.isInteger(t.x)||!Number.isInteger(t.y)||t.x<0||t.x>=WORLD_W||t.y<0||t.y>=WORLD_H||!finite(t.progress)||t.progress<0||t.progress>1||!Number.isInteger(t.priority)||t.priority<1||t.priority>5||(t.type==='build'&&!object.buildings.some(b=>b.id===t.buildingId)))fail('작업 상태가 올바르지 않습니다.');}
  if(!unique(object.crew)||!unique(object.buildings)||!unique(object.tasks))fail('중복된 개체가 있습니다.');
  if(!object.stats||!['completedDigs','completedBuilds','research'].every(k=>finite(object.stats[k])&&object.stats[k]>=0)||!Array.isArray(object.objectives)||object.objectives.length!==OBJECTIVES.length||!OBJECTIVES.every(o=>object.objectives.some(v=>v.id===o.id&&typeof v.done==='boolean'&&finite(v.progress)))||!Array.isArray(object.events)||object.events.length>25||!Number.isInteger(object._nextId)||object._nextId<1)fail('진행 상태가 올바르지 않습니다.');
  if(!finite(object.seed)||!Number.isInteger(object.cycle)||object.cycle<1||typeof object.lost!=='boolean'||typeof object.won!=='boolean')fail('기지 진행 정보가 올바르지 않습니다.');
  if(!object.power||!['stored','capacity','production','demand'].every(k=>finite(object.power[k])&&object.power[k]>=0)||object.power.stored>object.power.capacity+.01)fail('전력 상태가 올바르지 않습니다.');
  if(!['oxygen','temperature','foodDays','population'].every(k=>finite(object.stats[k]))||object.stats.oxygen<0||object.stats.oxygen>100||object.stats.foodDays<0)fail('통계 데이터가 올바르지 않습니다.');
  if(!object.events.every(e=>Number.isInteger(e.id)&&e.id>0&&finite(e.time)&&e.time>=0&&typeof e.text==='string'&&e.text.length<=1000&&['info','good','warn','danger'].includes(e.tone))||!Array.isArray(object.alerts)||!object.alerts.every(a=>typeof a.id==='string'&&typeof a.text==='string'&&['info','good','warn','danger'].includes(a.tone)))fail('알림 데이터가 올바르지 않습니다.');
  if(!unique(object.objectives)||!OBJECTIVES.every(o=>object.objectives.some(v=>v.id===o.id&&v.target===o.target&&v.progress>=0&&v.progress<=o.target&&typeof v.label==='string'&&typeof v.description==='string')))fail('목표 데이터가 올바르지 않습니다.');
  const uniqueAnchors=new Map();
  for(const b of object.buildings){
   const key=`${b.x},${b.y}`;
   const previous=uniqueAnchors.get(key);
   if(previous&&(!modernSave||!BUILDING_FOOTPRINTS[b.type]?.overlay&&!BUILDING_FOOTPRINTS[previous]?.overlay))
    fail('기지 코어 또는 건물 배치가 올바르지 않습니다.');
   uniqueAnchors.set(key,b.type);
  }
  if(!object.buildings.some(b=>b.type==='core'&&b.progress===1))fail('기지 코어 또는 건물 배치가 올바르지 않습니다.');
  const maxId=Math.max(0,...object.crew.map(v=>v.id),...object.buildings.map(v=>v.id),...object.tasks.map(v=>v.id),...object.events.map(v=>v.id));
  if(object._nextId<=maxId)fail('개체 식별자가 올바르지 않습니다.');
  for(const c of object.crew){if(!Array.isArray(c.path)||!finite(c._idle)||c._idle<0||typeof c.action!=='string'||typeof c.color!=='string')fail('대원 행동 정보가 올바르지 않습니다.');if(c._job&&(!finite(c._job.elapsed)||c._job.elapsed<0))fail('대원 작업 시간이 올바르지 않습니다.');}
  if('_stepRemainder' in object&&(!finite(object._stepRemainder)||object._stepRemainder<0||object._stepRemainder>=.1))fail('틱 진행 시간이 잘못되었어요.');
  const ruleset=object.ruleset===undefined?LEGACY_RULES:object.ruleset;
  if(!usesOriginalRates(ruleset)&&ruleset!==LEGACY_RULES)fail('지원하지 않는 기지 규칙입니다.');
  if(usesOriginalRates(ruleset)&&(!finite(object.resources.soil)||object.resources.soil<0||object.resources.soil>1e9))fail('흙 비축량이 올바르지 않습니다.');
  const saved=copy(object);this.ruleset=ruleset;for(const k of ['seed','w','h','time','cycle','cells','buildings','tasks','crew','resources','power','stats','objectives','events','alerts','lost','won','_nextId','_envClock','_statClock','_batteryPowered'])this[k]=saved[k];if(this.modernRules)for(const b of this.buildings)b.rotation??=0;this._stepRemainder=saved._stepRemainder||0;this.version=2;this._envClock=finite(this._envClock)?this._envClock:0;this._statClock=finite(this._statClock)?this._statClock:0;this._networkDirty=true;this._navRevision=0;this._pathCache=null;for(const c of this.crew)c.path=c._job?.path||[];this._rebuildNetworks();return true;
 }
}

installUtilities(Game,{BUILDINGS,OBJECTIVES,CYCLE_SECONDS});
installCommunity(Game,{BUILDINGS,OBJECTIVES,CYCLE_SECONDS});
installFrontier(Game,{BUILDINGS,OBJECTIVES});
installGasNetwork(Game);
installPacketPipes(Game);
installExpeditions(Game);
installResearch(Game,{BUILDINGS});
