/* Structural rooms, portable oxygen and productive work specialization. No DOM dependency. */
import { breathingUnitsPerSecond } from './rules.js';
import { canBreathe } from './environment.js';
import { atmosphereOf, atmosphereSpaceKg, emitAtmosphere, takeAtmosphere } from './atmosphere.js';
import { GAS_KG_PER_UNIT } from './environment.js';
import { buildingCells } from './footprint.js';

export const FRONTIER_BUILDINGS = {
  door: { name:'기밀문', icon:'door', description:'자동으로 여닫히며 닫혔을 때 기체와 물을 막습니다. 열림·잠금 모드도 선택할 수 있어요.', cost:{rock:6,metal:4}, color:'#b4c8cf' },
  oxygenDock: { name:'산소 충전소', icon:'oxygenDock', description:'8W로 주변의 실제 산소를 압축합니다. 대원이 방문해 휴대 산소통을 채우고 저산소 탐사에 사용해요.', cost:{rock:20,metal:12}, power:8, unlock:45, color:'#8ccfe2' },
};
export const FRONTIER_OBJECTIVES = [
  {id:'rooms',stage:5,label:'머무를 공간',description:'사용 가능한 침실과 식당을 각각 하나 이상 만드세요.',target:2,tool:'door'},
  {id:'training',stage:5,label:'쌓이는 경험',description:'실제 작업으로 얻은 기술 포인트 3개를 대원에게 배분하세요.',target:3},
  {id:'portable',stage:5,label:'숨을 가지고 나아가다',description:'대원들이 실제 저산소 구역에서 휴대 산소로 합계 30초 호흡하세요.',target:30,tool:'oxygenDock'},
  {id:'frontier',stage:5,label:'안전한 확장',description:'방·기술·휴대 산소와 건강한 정착 조건을 180초 연속 유지하세요.',target:180},
];
export const FRONTIER_PRODUCTION_KEYS = ['oxygenCompressed','oxygenRefilled','portableOxygenUsed','protectedSeconds','trainingPointsSpent','bedroomRestSeconds','messhallMeals','greenhouseHarvests'];
const MODES=['auto','open','locked'];
const usesFootprints=state=>state.modernRules===true||state.ruleset==='oni-4.3';
const MASK_MODES=['auto','off'];
const SKILLS=['dig','engineering','life'];
const SKILL_NAMES={dig:'굴착',engineering:'공학',life:'생활'};
const INDUSTRIAL=new Set(['generator','coalgen','hydrogenGen','research','purifier','electrolyzer','pump']);
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const PORTABLE_CAPACITY=6,DOCK_CAPACITY=18,COMPRESS_RATE=.08,SOURCE_FLOOR=.35;
const EPS=1e-8;
const cap=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const number=(v,min=0,max=1e9)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const clone=v=>JSON.parse(JSON.stringify(v));
const complete=b=>b.progress>=1;
const usable=b=>complete(b)&&b.enabled;
const rankSum=crew=>crew.reduce((sum,c)=>sum+SKILLS.reduce((n,key)=>n+(c.skills?.[key]||0),0),0);
const levelFor=xp=>Math.min(6,Math.floor((xp+EPS)/60));
const emptyFrontier=()=>({seconds:0,target:180,healthy:false,reasons:['침실·식당과 기술·휴대 산소를 준비하세요.']});
function equipCrew(c){Object.assign(c,{portableOxygen:0,portableCapacity:PORTABLE_CAPACITY,maskMode:'auto',usingPortable:false,experience:0,level:0,skillPoints:0,skills:{dig:0,engineering:0,life:0}});}
function equipBuilding(b){Object.assign(b,{doorMode:b.type==='door'?'auto':null,doorOpen:false,oxygenStored:0,oxygenCapacity:b.type==='oxygenDock'?DOCK_CAPACITY:0});}
function equipmentSnapshot(state){return {
  stored:state.buildings.reduce((sum,b)=>sum+(b.type==='oxygenDock'&&complete(b)?b.oxygenStored:0),0),
  carried:state.crew.reduce((sum,c)=>sum+c.portableOxygen,0),
  capacity:state.buildings.reduce((sum,b)=>sum+(b.type==='oxygenDock'&&complete(b)?b.oxygenCapacity:0),0),
  chargingStations:state.buildings.filter(b=>b.type==='oxygenDock'&&usable(b)&&b.active).length,
};}

/** Only revealed air participates: unknown cavities never leak their shapes into the overlay. */
export function analyzeRooms(state){
  const {w,h,cells,buildings}=state,doors=new Map(),seen=new Set(),rooms=[];
  for(const b of buildings)if(b.type==='door'&&complete(b))for(const pos of usesFootprints(state)?buildingCells(b):[{x:b.x,y:b.y}])doors.set(pos.y*w+pos.x,b);
  const open=i=>i>=0&&i<cells.length&&cells[i].revealed&&!cells[i].solid&&!doors.has(i);
  for(let start=0;start<cells.length;start++){
    if(seen.has(start)||!open(start))continue;
    const queue=[start],indices=[],doorIds=new Set();seen.add(start);let sealed=true;
    let x1=w,y1=h,x2=0,y2=0;
    for(let cursor=0;cursor<queue.length;cursor++){
      const index=queue[cursor],x=index%w,y=Math.floor(index/w);indices.push(index);
      x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);
      if(x===0||y===0||x===w-1||y===h-1)sealed=false;
      for(const [dx,dy]of DIRS){
        const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h){sealed=false;continue;}
        const next=ny*w+nx,door=doors.get(next);
        if(door){doorIds.add(door.id);continue;}
        if(cells[next].solid)continue;
        if(!cells[next].revealed){sealed=false;continue;}
        if(!seen.has(next)){seen.add(next);queue.push(next);}
      }
    }
    indices.sort((a,b)=>a-b);const inside=new Set(indices);
    const furniture=buildings.filter(b=>complete(b)&&inside.has(b.y*w+b.x));
    const ready=furniture.filter(b=>b.enabled),has=type=>ready.some(b=>b.type===type),present=type=>furniture.some(b=>b.type===type),count=type=>ready.filter(b=>b.type===type).length;
    const industry=furniture.some(b=>INDUSTRIAL.has(b.type));
    let type='generic',name='미분류 공간',bonus='방 조건을 갖추면 생활 보너스를 얻습니다.';
    const reasons=[];
    if(has('cot')){type='bedroom';name='침실';bonus='침상 기력 회복 +25% · 수면 중 긴장 추가 회복';if(present('farm')||present('kitchen')||present('toilet')||present('mess')||industry)reasons.push('침실에는 침상과 생활 보관 설비만 두세요.');}
    else if(has('mess')){type='messhall';name='식당';bonus='식탁에서 실제 식사할 때 긴장 추가 -3';if(present('cot')||present('farm')||present('toilet')||industry)reasons.push('식당에서 침상·농장·화장실·산업 설비를 분리하세요.');}
    else if(has('farm')){type='greenhouse';name='온실';bonus='급수·생장 조건이 맞을 때 성장 +20%';if(count('farm')<2)reasons.push('온실에는 사용 가능한 농장 2개 이상이 필요해요.');if(present('cot')||present('mess')||present('kitchen')||present('toilet')||industry)reasons.push('온실에서 침상·식탁·조리·화장실·산업 설비를 분리하세요.');}
    else reasons.push('침상·식탁·농장을 배치해 공간의 용도를 정하세요.');
    if(!sealed)reasons.push('지도 끝이나 미탐사 공간으로 열린 경계가 있어요.');
    if(indices.length<6)reasons.push('내부 공간이 최소 6칸 필요해요.');
    if(indices.length>64)reasons.push('공간이 64칸을 넘어요. 벽과 문으로 나누세요.');
    if(doorIds.size===0)reasons.push('완공된 출입문이 필요해요.');
    rooms.push({id:indices[0],type,name,cells:indices,area:indices.length,bounds:{x1,y1,x2,y2},buildingIds:furniture.map(b=>b.id).sort((a,b)=>a-b),doorIds:[...doorIds].sort((a,b)=>a-b),sealed,valid:type!=='generic'&&reasons.length===0,reasons,bonus});
  }
  return rooms;
}

function frontierReasons(state,canReach){
  const reasons=[],alive=state.crew.filter(c=>c.health>0),rooms=state.rooms||[],bedrooms=rooms.filter(r=>r.valid&&r.type==='bedroom'),halls=rooms.filter(r=>r.valid&&r.type==='messhall');
  if(!state.settlement.healthy)reasons.push(...state.settlement.reasons);
  if(!bedrooms.length)reasons.push('사용 가능한 침실이 필요해요.');
  else if(!bedrooms.some(r=>alive.every(c=>canReach(c,r.cells))))reasons.push('모든 대원이 침실에 도달할 수 있어야 해요.');
  if(!halls.length)reasons.push('사용 가능한 식당이 필요해요.');
  else if(!halls.some(r=>alive.every(c=>canReach(c,r.cells))))reasons.push('모든 대원이 식당에 도달할 수 있어야 해요.');
  if(rankSum(state.crew)<3)reasons.push('대원 기술 포인트를 합계 3개 배분하세요.');
  if(state.production.protectedSeconds<30-EPS)reasons.push('저산소 구역에서 휴대 산소로 합계 30초 호흡하세요.');
  const docks=state.buildings.filter(b=>b.type==='oxygenDock'&&usable(b)&&b.connected&&state.cells[b.y*state.w+b.x].water<.5);
  if(!docks.length)reasons.push('전력이 연결되고 침수되지 않은 산소 충전소가 필요해요.');
  else if(!docks.some(b=>alive.every(c=>canReach(c,[b.y*state.w+b.x]))))reasons.push('모든 대원이 산소 충전소에 도달할 수 있어야 해요.');
  return [...new Set(reasons)];
}

function stateReachability(state){
  const ladders=new Set(state.buildings.filter(b=>b.type==='ladder'&&complete(b)).map(b=>b.y*state.w+b.x));
  const modern=usesFootprints(state);
  const doorCells=b=>modern?buildingCells(b):[{x:b.x,y:b.y}];
  const locked=new Set(state.buildings.filter(b=>b.type==='door'&&complete(b)&&b.doorMode==='locked').flatMap(b=>doorCells(b).map(pos=>pos.y*state.w+pos.x)));
  const standable=i=>i>=0&&i<state.cells.length&&!state.cells[i].solid&&!locked.has(i)&&(ladders.has(i)||!!state.cells[i+state.w]?.solid);
  const caches=new Map();
  return(c,goals)=>{
    const start=Math.floor(c.y)*state.w+Math.floor(c.x);let seen=caches.get(start);
    if(!seen){seen=new Set([start]);const q=[start];for(let j=0;j<q.length;j++){const id=q[j],x=id%state.w,y=Math.floor(id/state.w);for(const[dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=state.w||ny>=state.h)continue;const n=ny*state.w+nx;if(!standable(n)||dy&&!ladders.has(id)&&!ladders.has(n)||seen.has(n))continue;seen.add(n);q.push(n);}}caches.set(start,seen);}
    return goals.some(i=>standable(i)&&seen.has(i));
  };
}

export function installFrontier(Game,{BUILDINGS,OBJECTIVES}){
  const proto=Game.prototype;
  const base={reset:proto.reset,add:proto._addBuilding,newCrew:proto._newCrew,complete:proto._completeTask,canPlace:proto.canPlace,toggle:proto.toggleBuilding,standable:proto._standable,choose:proto._choose,release:proto._release,utilityReady:proto._utilityReady,efficiency:proto._workEfficiency,communityWork:proto._communityWork,stats:proto._updateStats,inspect:proto.inspect,serialize:proto.serialize,load:proto.load};
  const legacyObjectives=OBJECTIVES.map(o=>({...o}));OBJECTIVES.push(...FRONTIER_OBJECTIVES);

  proto._addBuilding=function(...args){const b=base.add.apply(this,args);equipBuilding(b);return b;};
  proto._newCrew=function(...args){const c=base.newCrew.apply(this,args);equipCrew(c);return c;};
  proto.reset=function(seed,ruleset){this._frontierReady=false;const result=base.reset.call(this,seed,ruleset);this.version=4;for(const k of FRONTIER_PRODUCTION_KEYS)this.production[k]=0;this.rooms=[];this.equipment=equipmentSnapshot(this);this.frontier=emptyFrontier();this._roomsDirty=true;this._frontierReady=true;this._syncRooms();this._updateDoors();this._updateStats();return result;};
  proto._syncRooms=function(force=false){
    if(!this._frontierReady)return;
    if(force||this._roomsDirty){this.rooms=analyzeRooms(this);this._roomsDirty=false;this._roomIndex=new Map();for(const room of this.rooms)for(const i of room.cells)this._roomIndex.set(i,room);this._doorMap=new Map();for(const b of this.buildings.filter(b=>b.type==='door'&&complete(b)))for(const pos of this.modernRules?buildingCells(b):[{x:b.x,y:b.y}])this._doorMap.set(pos.y*this.w+pos.x,b);}
    this.stats.validRooms=this.rooms.filter(r=>r.valid).length;this.stats.specializedRoomTypes=new Set(this.rooms.filter(r=>r.valid).map(r=>r.type)).size;this.stats.totalSkillRanks=rankSum(this.crew);
  };
  proto.roomAt=function(x,y){if(!this.cell(x,y)||!this.cell(x,y).revealed)return null;this._syncRooms();return this._roomIndex?.get(y*this.w+x)||null;};
  proto._updateDoors=function(){
    if(!this._frontierReady)return;this._syncRooms();
    for(const b of this._doorMap.values()){
      b.doorOpen=b.doorMode==='open'||b.doorMode==='auto'&&this.crew.some(c=>c.health>0&&(Math.hypot(c.x-b.x-.5,c.y-b.y-.5)<=1.3||c._job?.path?.[0]?.x===b.x&&c._job?.path?.[0]?.y===b.y&&Math.hypot(c.x-b.x-.5,c.y-b.y-.5)<=1.8));
      b.status=b.doorMode==='locked'?'잠금 · 대원과 유체 통과 불가':b.doorMode==='open'?'열림 유지 · 기체와 물 통과':b.doorOpen?'대원 통과 중':'자동 · 닫힘';
    }
  };
  proto._doorBlocksFluid=function(x,y){return !!this._doorMap?.get(y*this.w+x)&&!this._doorMap.get(y*this.w+x).doorOpen;};
  proto._standable=function(x,y){const door=this._doorMap?.get(y*this.w+x);return !(this._frontierReady&&door?.doorMode==='locked')&&base.standable.call(this,x,y);};
  proto.setDoorMode=function(id,mode){
    const b=this.buildings.find(b=>b.id===id&&b.type==='door'&&complete(b));if(!b||!MODES.includes(mode))return{ok:false,message:'완공된 문과 올바른 개폐 방식을 선택하세요.'};
    const occupiedCells=this.modernRules?buildingCells(b):[{x:b.x,y:b.y}];
    if(mode==='locked'&&this.crew.some(c=>c.health>0&&occupiedCells.some(pos=>Math.floor(c.x)===pos.x&&Math.floor(c.y)===pos.y)))return{ok:false,message:'문 칸을 통과 중인 대원이 있어요. 지나간 뒤 잠그세요.'};
    b.doorMode=mode;this._navRevision++;this._pathCache=null;this._updateDoors();
    if(mode==='locked')for(const c of this.crew)if(c._job?.path?.some(p=>occupiedCells.some(pos=>p.x===pos.x&&p.y===pos.y)))this._release(c);
    this._updateFrontier(0);return{ok:true,message:mode==='auto'?'문을 자동 개폐로 설정했어요.':mode==='open'?'문을 열린 상태로 유지합니다.':'문을 잠갔어요. 대원과 기체·물이 통과하지 못합니다.'};
  };
  proto.toggleBuilding=function(id){const b=this.buildings.find(b=>b.id===id);if(b?.type==='door')return false;const result=base.toggle.call(this,id);if(result&&this._frontierReady){this._roomsDirty=true;this._syncRooms();this.equipment=equipmentSnapshot(this);this._updateFrontier(0);}return result;};

  proto._nearbyGasCells=function(b,radius=2){
    const start=b.y*this.w+b.x,q=[{x:b.x,y:b.y,d:0}],seen=new Set([start]),out=[];
    for(let cursor=0;cursor<q.length;cursor++){const p=q[cursor],cell=this.cell(p.x,p.y);if(!cell||cell.solid||!cell.revealed||this._doorBlocksFluid(p.x,p.y))continue;if(cell.water<.7)out.push(cell);if(p.d>=radius)continue;for(const[dx,dy]of DIRS){const x=p.x+dx,y=p.y+dy,i=y*this.w+x;if(!this.cell(x,y)||seen.has(i))continue;seen.add(i);q.push({x,y,d:p.d+1});}}
    return out;
  };
  proto._dockReleaseReason=function(b){if(b?.type!=='oxygenDock'||!complete(b)||b.oxygenStored<=EPS)return null;const space=this.modernRules?this._nearbyGasCells(b).reduce((sum,c)=>sum+atmosphereSpaceKg(this,c,'oxygen')/GAS_KG_PER_UNIT,0):this._nearbyGasCells(b).reduce((sum,c)=>sum+Math.max(0,3-c.oxygen),0);return space+EPS<b.oxygenStored?'충전소의 산소를 방출할 공간이 부족해요. 산소통에 옮기거나 주변 공간을 넓히세요.':null;};
  proto._frontierTaskReason=function(t){
    if(t.type!=='deconstruct')return null;
    const b=this.buildings.find(b=>b.id===t.buildingId),reason=this._dockReleaseReason(b)||this._storageRemovalReason?.(b);if(reason)return reason;
    if(b&&complete(b))for(const [layer,key]of [['water','cleanWater'],['waste','dirtyWater']])if(b[key]>EPS&&b[key]>this._fluidSpace(this._fluidNet(b,layer),b)+EPS)return'탱크의 물을 옮길 저장 공간이 필요해요.';
    return null;
  };
  proto.canPlace=function(tool,x,y,rotation){const result=base.canPlace.call(this,tool,x,y,rotation);if(result.ok&&tool==='deconstruct'){const reason=this._dockReleaseReason(this._buildingAt(x,y));if(reason)return{ok:false,message:reason};}return result;};
  proto._completeTask=function(t){
    const b=this.buildings.find(b=>b.id===t.buildingId);
    if(this._frontierReady&&t.type==='deconstruct'&&b?.type==='oxygenDock'){
      const reason=this._dockReleaseReason(b);if(reason){t.progress=.95;t.blockedReason=reason;return;}
      if(this.modernRules){const emitted=emitAtmosphere(this,b.x,b.y,'oxygen',b.oxygenStored*GAS_KG_PER_UNIT,this.cell(b.x,b.y).temp)/GAS_KG_PER_UNIT;b.oxygenStored=Math.max(0,b.oxygenStored-emitted);if(b.oxygenStored>EPS){t.progress=.95;t.blockedReason='저장 산소를 방출할 공간이 부족해요. 주변 공간을 넓히세요.';return;}}
      else for(const cell of this._nearbyGasCells(b)){const amount=Math.min(b.oxygenStored,Math.max(0,3-cell.oxygen));cell.oxygen+=amount;b.oxygenStored-=amount;if(b.oxygenStored<=EPS){b.oxygenStored=0;break;}}
    }
    const result=base.complete.call(this,t);if(this._frontierReady){this._roomsDirty=true;this._syncRooms();this._updateDoors();this.equipment=equipmentSnapshot(this);}return result;
  };
  proto._utilityReady=function(b,dt){const reason=base.utilityReady.call(this,b,dt);if(reason)return reason;if(b.type!=='oxygenDock')return null;if(this.cell(b.x,b.y).water>=.5)return'침수 · 산소 압축 불가';if(b.oxygenStored>=b.oxygenCapacity-EPS)return'산소 저장 가득 참';if(!this._nearbyGasCells(b).some(c=>c.oxygen>SOURCE_FLOOR+EPS))return'주변 산소 부족 · 산소 생산을 늘리세요.';return null;};
  proto._startFrontier=function(){if(!this._frontierReady)return;this._updateDoors();for(const c of this.crew)c.usingPortable=false;};
  proto._frontierProduction=function(dt){
    if(!this._frontierReady)return;
    for(const b of this.buildings){if(b.type!=='oxygenDock'||!usable(b)||!b.active)continue;let left=Math.min(COMPRESS_RATE*dt,b.oxygenCapacity-b.oxygenStored),compressed=0;for(const c of this._nearbyGasCells(b)){if(this.modernRules&&atmosphereOf(c)?.element!=='oxygen')continue;const amount=Math.min(left,Math.max(0,c.oxygen-SOURCE_FLOOR));if(this.modernRules)takeAtmosphere(c,amount*GAS_KG_PER_UNIT);else c.oxygen-=amount;b.oxygenStored+=amount;left-=amount;compressed+=amount;if(left<=EPS)break;}this.production.oxygenCompressed+=compressed;if(compressed>EPS){b.status='주변 산소 압축 중';this.cell(b.x,b.y).temp+=.01*dt;}else{b.active=false;b.status='주변 산소 부족';}}
    this.equipment=equipmentSnapshot(this);
  };
  proto._portableBreath=function(c,p,dt){
    c.usingPortable=false;if(!this._frontierReady||c.health<=0||c.maskMode!=='auto'||canBreathe(p,this.modernRules))return false;
    const needed=this.breathRate*dt,used=Math.min(needed,c.portableOxygen);if(used<=0)return 0;
    c.portableOxygen=Math.max(0,c.portableOxygen-used);c.usingPortable=true;this.production.portableOxygenUsed+=used;this.production.protectedSeconds+=used/this.breathRate;return used/needed;
  };
  proto.setCrewMaskMode=function(id,mode){const c=this.crew.find(c=>c.id===id&&c.health>0);if(!c||!MASK_MODES.includes(mode))return{ok:false,message:'대원과 자동 사용·사용 안 함 중 하나를 선택하세요.'};c.maskMode=mode;if(mode==='off'){c.usingPortable=false;if(c._job?.kind==='refillOxygen')this._release(c);}return{ok:true,message:`${c.name} · ${mode==='auto'?'저산소에서 휴대 산소를 자동 사용합니다.':'남은 산소를 보존하고 마스크를 사용하지 않습니다.'}`};};
  proto._choose=function(c){
    if(this._frontierReady&&c.maskMode==='auto'&&c.portableOxygen<1.5&&c.breath>=70&&c.hunger>=48&&c.energy>=24&&c.bladder<70&&c.hygiene>=65&&(c.schedule==='auto'||c.schedulePhase==='work')){
      let best=null;for(const b of this.buildings){if(b.type!=='oxygenDock'||!usable(b)||b.oxygenStored<.55||this.cell(b.x,b.y).water>=.5||this._busy(b.id))continue;const path=this._path(c,[{x:b.x,y:b.y}]);if(path&&(!best||path.length<best.path.length))best={building:b,path};}
      if(best){this._assign(c,'refillOxygen',best.path,{targetId:best.building.id});return;}
    }
    return base.choose.call(this,c);
  };
  proto._frontierWork=function(c,j,b,dt){
    if(j.kind!=='refillOxygen')return false;
    if(!b||b.type!=='oxygenDock'||!usable(b)||this.cell(b.x,b.y).water>=.5||c.maskMode!=='auto'){this._release(c);return true;}
    if(Math.hypot(c.x-b.x-.5,c.y-b.y-.5)>.05){const path=this._path(c,[{x:b.x,y:b.y}]);if(path){j.path=path.length?path:[{x:b.x,y:b.y}];c.path=j.path;j.elapsed=0;}else this._release(c);return true;}
    c.action='휴대 산소를 채우는 중';b.workerId=c.id;const amount=Math.min(1.5*dt,b.oxygenStored,c.portableCapacity-c.portableOxygen);
    if(amount>0){b.oxygenStored=Math.max(0,b.oxygenStored-amount);c.portableOxygen+=amount;this.production.oxygenRefilled+=amount;this._gainExperience(c,amount/1.5);}
    if(c.portableOxygen>=c.portableCapacity-EPS||b.oxygenStored<=EPS||c.hunger<25||c.energy<14)this._release(c);this.equipment=equipmentSnapshot(this);return true;
  };
  proto._release=function(c){const result=base.release.call(this,c);if(c.health<=0)c.usingPortable=false;return result;};

  proto._gainExperience=function(c,xp){
    if(!this._frontierReady||!c||c.health<=0||xp<=0)return;const previous=c.level;c.experience=Math.min(360,c.experience+xp);c.level=levelFor(c.experience);if(c.level>previous){c.skillPoints+=c.level-previous;this._event(`${c.name} · 레벨 ${c.level}! 기술 포인트 ${c.level-previous}개를 배분할 수 있어요.`,'good');}
  };
  proto.trainCrew=function(id,skill){const c=this.crew.find(c=>c.id===id&&c.health>0);if(!c||!SKILLS.includes(skill))return{ok:false,message:'대원과 굴착·공학·생활 기술을 선택하세요.'};if(c.skillPoints<1)return{ok:false,message:'실제 작업 경험을 쌓아 기술 포인트를 얻으세요.'};if(c.skills[skill]>=3)return{ok:false,message:'이 기술은 이미 최대 3단계입니다.'};c.skillPoints--;c.skills[skill]++;this.production.trainingPointsSpent=rankSum(this.crew);this.stats.totalSkillRanks=this.production.trainingPointsSpent;this._updateStats();this._updateFrontier(0);return{ok:true,message:`${c.name} · ${SKILL_NAMES[skill]} ${c.skills[skill]}단계로 성장했어요.`};};
  proto._workEfficiency=function(c){const efficiency=base.efficiency.call(this,c);if(!c?.skills)return efficiency;const kind=c._job?.kind;return efficiency*(kind==='dig'?1+.20*c.skills.dig:['build','deconstruct'].includes(kind)?1+.15*c.skills.engineering:kind==='research'?1+.10*c.skills.engineering:kind==='cook'?1+.15*c.skills.life:1);};
  proto._harvestWorkMultiplier=function(c){return 1+.15*(c.skills?.life||0);};
  proto._farmGrowthMultiplier=function(b){const room=this.roomAt(b.x,b.y);return room?.valid&&room.type==='greenhouse'?1.2:1;};
  proto._frontierHarvest=function(b){const room=this.roomAt(b.x,b.y);if(room?.valid&&room.type==='greenhouse')this.production.greenhouseHarvests++;};
  proto._communityWork=function(c,j,b,dt){
    const room=b?this.roomAt(b.x,b.y):null,meals=this.production.tableMeals;
    const result=base.communityWork.call(this,c,j,b,dt);
    if(this._frontierReady&&room?.valid){if(j.kind==='rest'&&room.type==='bedroom'&&b.active&&b.workerId===c.id){c.energy=cap(c.energy+.75*dt);c.stress=cap(c.stress-.2*dt);this.production.bedroomRestSeconds+=dt;}if(j.kind==='eat'&&room.type==='messhall'&&this.production.tableMeals>meals){const eaten=this.production.tableMeals-meals;c.stress=cap(c.stress-3*eaten);this.production.messhallMeals+=eaten;}}
    return result;
  };
  proto._updateFrontier=function(dt){
    if(!this._frontierReady)return;this._syncRooms();const reasons=frontierReasons(this,(c,cells)=>this._path(c,cells.map(i=>({x:i%this.w,y:Math.floor(i/this.w)})))!==null);this.frontier.reasons=reasons;this.frontier.healthy=reasons.length===0;this.frontier.seconds=this.frontier.healthy?Math.min(this.frontier.target,this.frontier.seconds+dt):0;
  };
  proto._finishFrontier=function(dt){if(!this._frontierReady)return;this._syncRooms();this.equipment=equipmentSnapshot(this);this._updateFrontier(dt);};
  proto._updateStats=function(){
    base.stats.call(this);if(!this._frontierReady)return;this._syncRooms();this.equipment=equipmentSnapshot(this);
    const types=new Set(this.rooms.filter(r=>r.valid).map(r=>r.type));const values={rooms:Number(types.has('bedroom'))+Number(types.has('messhall')),training:this.stats.totalSkillRanks,portable:this.production.protectedSeconds,frontier:this.frontier.seconds};
    for(const o of this.objectives){if(!(o.id in values)||o.done)continue;o.progress=Math.min(o.target,values[o.id]);if(o.progress>=o.target-EPS){o.progress=o.target;o.done=true;this._event(`목표 달성 · ${o.label}`,'good');}}
    if(this.objectives.every(o=>o.done)&&!this.won){this.won=true;this._event('안전한 확장 완료! 방·기술·휴대 산소와 생활을 연결했습니다. 더 깊은 탐사를 계속할 수 있어요.','good');}
    if(this.crew.some(c=>c.health>0&&c.maskMode==='auto'&&c.portableOxygen<.3&&c.breath<55))this.alerts.push({id:'portable',text:'휴대 산소가 부족한 대원이 있어요. 안전한 공기와 충전소 접근을 확인하세요.',tone:'warn'});
  };
  proto.inspect=function(x,y){
    const result=base.inspect.call(this,x,y);if(!this.cell(x,y)?.revealed)return result;const room=this.roomAt(x,y);result.room=room;
    if(room){result.lines.push(`${room.name} · ${room.area}칸${room.valid?' · 보너스 적용':''}`,...(room.valid?[room.bonus]:room.reasons));}
    const b=result.building;if(b?.type==='door')result.lines.push(...(complete(b)?[`문 설정 · ${{auto:'자동',open:'열림 유지',locked:'잠금'}[b.doorMode]}`,b.doorOpen?'기체·물 통과 가능':'기체·물 차단 중']:['완공 후 기밀·출입 제어가 작동합니다.']));
    if(b?.type==='oxygenDock')result.lines.push(...(complete(b)?[`압축 산소 ${b.oxygenStored.toFixed(2)} / ${b.oxygenCapacity}`,'전력은 압축에 사용 · 저장 산소는 방문한 대원에게 전달']:['완공 후 산소 압축·방문 충전이 가능합니다.']));
    if(result.crew){const c=result.crew;result.lines.push(`휴대 산소 ${c.portableOxygen.toFixed(2)} / ${c.portableCapacity} · ${c.maskMode==='auto'?'자동 사용':'사용 안 함'}`,`경험 ${c.experience.toFixed(1)} · 레벨 ${c.level} · 미배분 포인트 ${c.skillPoints}`,`굴착 ${c.skills.dig} · 공학 ${c.skills.engineering} · 생활 ${c.skills.life}`);}return result;
  };
  proto.serialize=function(){const result=base.serialize.call(this);result.version=4;result.rooms=analyzeRooms(this);result.equipment=equipmentSnapshot(this);result.frontier=clone(this.frontier);return result;};
  proto.load=function(raw){
    const fail=message=>{throw new Error('저장 파일을 불러올 수 없어요: '+message);};
    let s=this._prepareCommunitySave(raw);const migrated=s.version!==4;
    if(migrated){
      if(!Array.isArray(s.objectives)||s.objectives.length!==legacyObjectives.length||!legacyObjectives.every(o=>s.objectives.some(v=>v.id===o.id&&v.target===o.target&&typeof v.done==='boolean'))||s.won!==s.objectives.every(o=>o.done))fail('이전 정착 목표가 손상되었습니다.');
      for(const c of s.crew)equipCrew(c);for(const b of s.buildings)equipBuilding(b);for(const key of FRONTIER_PRODUCTION_KEYS)s.production[key]=0;s.version=4;s.won=false;s.objectives.push(...FRONTIER_OBJECTIVES.map(o=>({...o,progress:0,done:false})));s.rooms=analyzeRooms(s);s.equipment=equipmentSnapshot(s);s.frontier=emptyFrontier();s.stats.totalSkillRanks=0;s.stats.validRooms=s.rooms.filter(r=>r.valid).length;s.stats.specializedRoomTypes=new Set(s.rooms.filter(r=>r.valid).map(r=>r.type)).size;
    }
    if(s.version!==4||!Array.isArray(s.crew)||!Array.isArray(s.buildings)||!s.production||!FRONTIER_PRODUCTION_KEYS.every(k=>number(s.production[k])))fail('확장·산소·기술 기록이 올바르지 않습니다.');
    for(const b of s.buildings){
      if(!number(b.oxygenStored,0,DOCK_CAPACITY)||b.oxygenCapacity!==(b.type==='oxygenDock'?DOCK_CAPACITY:0)||b.oxygenStored>b.oxygenCapacity+EPS||!complete(b)&&b.oxygenStored>EPS||typeof b.doorOpen!=='boolean'||b.type==='door'&&(!MODES.includes(b.doorMode)||b.enabled!==true)||b.type!=='door'&&(b.doorMode!==null||b.doorOpen))fail('문 또는 산소 충전소 상태가 올바르지 않습니다.');
      if(b.type==='door'&&complete(b)&&(b.doorMode==='locked'&&b.doorOpen||b.doorMode==='open'&&!b.doorOpen))fail('문 개폐 설정과 실제 상태가 다릅니다.');
    }
    for(const c of s.crew){
      if(!number(c.portableOxygen,0,PORTABLE_CAPACITY)||c.portableCapacity!==PORTABLE_CAPACITY||!MASK_MODES.includes(c.maskMode)||typeof c.usingPortable!=='boolean'||c.usingPortable&&(c.maskMode!=='auto'||c.health<=0)||!number(c.experience,0,360)||!Number.isInteger(c.level)||c.level!==levelFor(c.experience)||!Number.isInteger(c.skillPoints)||c.skillPoints<0||!c.skills||!SKILLS.every(k=>Number.isInteger(c.skills[k])&&c.skills[k]>=0&&c.skills[k]<=3)||c.skillPoints+SKILLS.reduce((n,k)=>n+c.skills[k],0)!==c.level)fail('대원의 휴대 산소 또는 경험·기술 상태가 올바르지 않습니다.');
      if(c._job?.kind==='refillOxygen'&&(!Number.isInteger(c._job.targetId)||c.maskMode!=='auto'||c.health<=0||!s.buildings.some(b=>b.id===c._job.targetId&&b.type==='oxygenDock'&&complete(b))))fail('휴대 산소 충전 작업이 올바르지 않습니다.');
    }
    const ranks=rankSum(s.crew);if(Math.abs(s.production.trainingPointsSpent-ranks)>EPS||s.stats?.totalSkillRanks!==ranks)fail('배분한 기술 포인트 기록이 일치하지 않습니다.');
    if(Math.abs(s.production.portableOxygenUsed-s.production.protectedSeconds*breathingUnitsPerSecond(s.ruleset))>1e-5)fail('휴대 산소 소비와 보호 호흡 시간이 일치하지 않습니다.');
    const rooms=analyzeRooms(s);if(!Array.isArray(s.rooms)||JSON.stringify(s.rooms)!==JSON.stringify(rooms)||s.stats.validRooms!==rooms.filter(r=>r.valid).length||s.stats.specializedRoomTypes!==new Set(rooms.filter(r=>r.valid).map(r=>r.type)).size)fail('방 정보가 실제 벽·문·설비와 일치하지 않습니다.');
    const equipment=equipmentSnapshot(s);if(!s.equipment||!Object.entries(equipment).every(([k,v])=>number(s.equipment[k])&&Math.abs(s.equipment[k]-v)<1e-5))fail('산소 장비 합계가 실제 저장량과 다릅니다.');
    if(Math.abs(s.production.oxygenRefilled-equipment.carried-s.production.portableOxygenUsed)>1e-5||s.production.oxygenCompressed+1e-5<equipment.stored+s.production.oxygenRefilled)fail('압축·충전·휴대 산소의 물질 수지가 일치하지 않습니다.');
    if(!s.frontier||!number(s.frontier.seconds,0,180.00001)||s.frontier.target!==180||typeof s.frontier.healthy!=='boolean'||!Array.isArray(s.frontier.reasons)||!s.frontier.reasons.every(v=>typeof v==='string'&&v.length<500)||s.frontier.healthy!==(s.frontier.reasons.length===0)||!s.frontier.healthy&&s.frontier.seconds>EPS)fail('안전한 확장 유지 상태가 올바르지 않습니다.');
    if(s.frontier.healthy&&frontierReasons(s,stateReachability(s)).length)fail('확장 유지 조건과 기지 상태가 일치하지 않습니다.');
    if(!Array.isArray(s.objectives)||s.objectives.length!==OBJECTIVES.length||s.objectives.some(o=>o.done&&Math.abs(o.progress-o.target)>EPS||!o.done&&o.progress>=o.target)||s.won!==s.objectives.every(o=>o.done))fail('최종 승리와 전체 목표가 일치하지 않습니다.');
    const payload=clone(s);payload.version=3;const result=base.load.call(this,payload);
    this.rooms=rooms;this.equipment=equipment;this.frontier=clone(s.frontier);this.version=4;this._frontierReady=true;this._roomsDirty=true;this._syncRooms();return result;
  };
}
