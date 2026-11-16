/* Resource collection, food preparation and crew routines. No DOM dependency. */
export const COMMUNITY_BUILDINGS = {
 storage:{name:'자원 보관함',icon:'storage',description:'대원이 채굴품을 가져오는 수거 거점입니다. 공용 고체 비축 용량을 240 늘립니다.',cost:{rock:15,metal:5},color:'#d9b681'},
 kitchen:{name:'조리대',icon:'kitchen',description:'대원이 식량 2와 청수 0.3L를 6초간 조리해 조리식 3을 만듭니다. 10W가 필요합니다.',cost:{rock:20,metal:10},power:10,unlock:10,color:'#e7b397'},
 mess:{name:'식탁',icon:'mess',description:'대원이 이곳으로 이동해 식사와 여가를 즐기며 스트레스를 낮춥니다.',cost:{rock:12},color:'#cbb291'},
 fridge:{name:'냉장고',icon:'fridge',description:'6W로 공용 식품을 냉장합니다. 실제 가동 중 식량과 조리식의 부패를 80% 줄입니다.',cost:{rock:20,metal:15},power:6,unlock:30,color:'#9fcedc'}
};
export const COMMUNITY_OBJECTIVES = [
 {id:'haul',stage:4,label:'손에서 창고로',description:'채굴품 80개를 수거 거점까지 실제 운반하세요.',target:80,tool:'storage'},
 {id:'cooking',stage:4,label:'따뜻한 한 끼',description:'조리대에서 조리식 12끼를 실제 생산하세요.',target:12,tool:'kitchen'},
 {id:'dining',stage:4,label:'함께 앉는 자리',description:'대원들이 식탁에서 6번 식사하도록 운영하세요.',target:6,tool:'mess'},
 {id:'community',stage:4,label:'잘 사는 기지',description:'교대 수면·식사·보관과 건강한 생활 조건을 240초 연속 유지하세요.',target:240}
];
export const COMMUNITY_PRODUCTION_KEYS=['hauledItems','mealsCooked','cookedEaten','tableMeals','foodSpoiled','scheduledRests'];
const SOLIDS=['rock','metal','algae','coal'];
const RESOURCE_NAMES={rock:'광석',metal:'금속',algae:'조류',coal:'석탄'};
const SCHEDULES=['auto','day','swing','night'];
const SCHEDULE_NAMES={auto:'자율',day:'주간',swing:'엇교대',night:'야간'};
const PHASE_NAMES={work:'작업',break:'여가',sleep:'수면'};
const RAW_DECAY=.00015,COOKED_DECAY=.00030,CARGO_CAPACITY=12,CORE_CAPACITY=600,STORAGE_CAPACITY=240;
const cap=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const num=(v,min=0,max=1e9)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const clone=v=>JSON.parse(JSON.stringify(v));
const offset=s=>s==='swing'?1/3:s==='night'?2/3:0;
function phaseAt(time,schedule,cycleSeconds){if(schedule==='auto')return'work';const p=((time/cycleSeconds+offset(schedule))%1+1)%1;return p<.66?'work':p<.84?'break':'sleep';}
function equipCrew(c){Object.assign(c,{cargo:null,schedule:'auto',schedulePhase:'work',restedCycles:0,_lastRestCycle:-1});}
function equipBuilding(b){b.storageCapacity=b.type==='core'?CORE_CAPACITY:b.type==='storage'?STORAGE_CAPACITY:0;b.mealTarget=b.type==='kitchen'?12:0;b.recipeProgress=0;}
function stockAmount(resources){return SOLIDS.reduce((sum,key)=>sum+resources[key],0);}
function storageCapacity(buildings){return buildings.filter(b=>b.progress>=1).reduce((sum,b)=>sum+(b.type==='core'?CORE_CAPACITY:b.type==='storage'?STORAGE_CAPACITY:0),0);}
function foodSnapshot(state){const raw=state.resources.food,cooked=state.resources.meals||0,cold=state.buildings.some(b=>b.type==='fridge'&&b.progress>=1&&b.enabled&&b.connected&&b.active);const factor=cold?.2:1;return{raw,cooked,total:raw+cooked,cold,rawDecayPerSecond:raw*RAW_DECAY*factor,cookedDecayPerSecond:cooked*COOKED_DECAY*factor};}
function logisticsSnapshot(state){return{loose:state.debris.reduce((s,p)=>s+p.amount,0),carried:state.crew.reduce((s,c)=>s+(c.cargo?.amount||0),0),stored:stockAmount(state.resources),capacity:storageCapacity(state.buildings),blockedPiles:state.debris.filter(p=>p.blockedReason).length,activeHaulers:state.crew.filter(c=>c.health>0&&c._job?.kind==='haul').length};}

export function installCommunity(Game,{BUILDINGS,OBJECTIVES,CYCLE_SECONDS}){
 const proto=Game.prototype;
 const base={reset:proto.reset,add:proto._addBuilding,newCrew:proto._newCrew,release:proto._release,afford:proto._afford,pay:proto._pay,queue:proto.queue,canPlace:proto.canPlace,complete:proto._completeTask,utilityReady:proto._utilityReady,stats:proto._updateStats,inspect:proto.inspect,serialize:proto.serialize,load:proto.load};
 const legacyObjectives=OBJECTIVES.map(o=>({...o}));
 OBJECTIVES.push(...COMMUNITY_OBJECTIVES);

 proto._addBuilding=function(...args){const b=base.add.apply(this,args);equipBuilding(b);return b;};
 proto._newCrew=function(...args){const c=base.newCrew.apply(this,args);equipCrew(c);return c;};
 proto.reset=function(seed){this._communityReady=false;const result=base.reset.call(this,seed);this.version=3;this.debris=[];this.resources.meals=0;for(const key of COMMUNITY_PRODUCTION_KEYS)this.production[key]=0;this.logistics=logisticsSnapshot(this);this.foodStatus=foodSnapshot(this);this.settlement={seconds:0,target:240,healthy:false,reasons:['운반·조리·식탁과 교대 수면을 준비하세요.']};this._communityReady=true;this._updateStats();return result;};
 proto._syncCommunity=function(){if(!this._communityReady)return;for(const c of this.crew)if(c.health<=0)c.schedulePhase=phaseAt(this.time,c.schedule,CYCLE_SECONDS);this.logistics=logisticsSnapshot(this);this.foodStatus=foodSnapshot(this);this.stats.foodDays=this.foodStatus.total/Math.max(1,this.crew.filter(c=>c.health>0).length);this.stats.edibleFood=this.foodStatus.total;};
 proto._afford=function(prices){if(!this._communityReady)return base.afford.call(this,prices);return Object.entries(prices).every(([k,v])=>(k==='food'?this.resources.food+this.resources.meals:this.resources[k])>=v);};
 proto._pay=function(prices,sign=-1){let charge=prices;if(this._communityReady&&sign<0&&prices?.food>this.resources.food){const remainder=prices.food-this.resources.food;charge={...prices,food:this.resources.food};this.resources.meals=Math.max(0,this.resources.meals-remainder);}const result=base.pay.call(this,charge,sign);this._syncCommunity();return result;};
 proto.queue=function(...args){const result=base.queue.apply(this,args);this._syncCommunity();return result;};

 proto._spawnDebris=function(resource,amount,x,y){if(!SOLIDS.includes(resource)||amount<=1e-9)return;const old=this.debris.find(p=>p.x===x&&p.y===y&&p.resource===resource&&p.reservedBy===null);if(old){old.amount+=amount;return old;}const pile={id:this._id(),x:cap(Math.floor(x),1,this.w-2),y:cap(Math.floor(y),1,this.h-2),resource,amount,priority:3,reservedBy:null,blockedReason:''};this.debris.push(pile);return pile;};
 proto._minedResource=function(resource,amount,x,y){if(this._communityReady&&SOLIDS.includes(resource))this._spawnDebris(resource,amount,x,y);else this.resources[resource]+=amount;};
 proto._release=function(c){if(this._communityReady){for(const pile of this.debris)if(pile.reservedBy===c.id)pile.reservedBy=null;if(c.cargo){this._spawnDebris(c.cargo.resource,c.cargo.amount,Math.floor(c.x),Math.floor(c.y));c.cargo=null;}}const result=base.release.call(this,c);this._syncCommunity();return result;};
 proto.setHaulPriority=function(id,priority){const p=this.debris.find(v=>v.id===id);if(!p||!Number.isInteger(priority)||priority<1||priority>5)return{ok:false,message:'남아 있는 자원 더미와 우선순위 1~5를 선택하세요.'};p.priority=priority;return{ok:true,message:`${RESOURCE_NAMES[p.resource]} 운반 우선순위 ${priority}`};};
 proto._depots=function(){return this.buildings.filter(b=>['core','storage'].includes(b.type)&&b.progress>=1&&b.enabled&&this.cell(b.x,b.y).water<.7);};
 proto._findDepot=function(c){let best=null;for(const b of this._depots()){const path=this._path(c,[{x:b.x,y:b.y}]);if(path&&(!best||path.length<best.path.length))best={building:b,path};}return best;};
 proto._storageRemovalReason=function(b){if(b?.type!=='storage'||b.progress<1)return null;const salvage=Object.entries(BUILDINGS.storage.cost).filter(([k])=>SOLIDS.includes(k)).reduce((s,[,v])=>s+Math.floor(v*.75),0);return stockAmount(this.resources)+salvage>storageCapacity(this.buildings)-STORAGE_CAPACITY+1e-8?'보관함 해체 뒤 고체 저장 공간이 부족해요. 자원을 사용하거나 다른 보관함을 지으세요.':null;};
 proto.canPlace=function(tool,x,y){const result=base.canPlace.call(this,tool,x,y);if(result.ok&&tool==='deconstruct'){const reason=this._storageRemovalReason(this._buildingAt(x,y));if(reason)return{ok:false,message:reason};}return result;};
 proto._completeTask=function(t){const b=this.buildings.find(b=>b.id===t.buildingId);if(this._communityReady&&t.type==='deconstruct'){const reason=this._storageRemovalReason(b);if(reason){t.progress=.95;t.blockedReason=reason;return;}}const result=base.complete.call(this,t);this._syncCommunity();return result;};

 proto._chooseMeal=function(c){let waiting=false;for(const b of this.buildings.filter(b=>b.type==='mess'&&b.progress>=1&&b.enabled&&this.cell(b.x,b.y).water<.5).sort((a,b)=>Math.abs(c.x-a.x)+Math.abs(c.y-a.y)-Math.abs(c.x-b.x)-Math.abs(c.y-b.y))){const path=this._path(c,[{x:b.x,y:b.y}]);if(!path)continue;if(this._busy(b.id)){waiting=true;continue;}this._assign(c,'eat',path,{targetId:b.id});return true;}if(waiting&&c.hunger>=25){c.action='식탁 자리를 기다리는 중';c._idle=.6;return true;}this._assign(c,'eat',[]);return true;};
 proto.setKitchenTarget=function(id,target){const b=this.buildings.find(b=>b.id===id&&b.type==='kitchen');if(!b||!Number.isInteger(target)||target<0||target>60)return{ok:false,message:'조리대와 목표 조리식 0~60끼를 선택하세요.'};b.mealTarget=target;return{ok:true,message:target===0?'조리 목표를 0으로 설정해 생산을 멈춥니다.':`조리식 목표를 ${target}끼로 설정했어요.`};};
 proto._kitchenReason=function(b,requireWorker=false){if(b.progress<1)return'건설 대기';if(!b.enabled)return'수동 정지';if(this.cell(b.x,b.y).water>.5)return'침수 · 조리할 수 없어요';if(this.resources.meals>=b.mealTarget||b.mealTarget===0)return'목표 조리식 확보';if(this.resources.food<2)return'수확 식량 2 필요';const net=this._fluidNet(b,'water');if(!net)return'청수 배관 연결 필요';if(this._fluidAmount(net)<.3-1e-8)return'조리용 청수 0.3L 필요';if(requireWorker&&!b.workerId)return'조리 대원 대기';return null;};
 proto._utilityReady=function(b,dt){const reason=base.utilityReady.call(this,b,dt);if(reason)return reason;if(b.type==='kitchen')return this._kitchenReason(b,true);if(b.type==='fridge'&&this.resources.food+(this.resources.meals||0)<1e-8)return'보관할 식품 없음';return null;};
 proto._workEfficiency=function(c){return c?cap(1-Math.max(0,c.stress-35)*.008,.48,1):1;};

 proto.setCrewSchedule=function(id,schedule){const c=this.crew.find(c=>c.id===id&&c.health>0);if(!c||!SCHEDULES.includes(schedule))return{ok:false,message:'대원과 사용할 교대표를 선택하세요.'};this._release(c);c.schedule=schedule;c.schedulePhase=phaseAt(this.time,schedule,CYCLE_SECONDS);return{ok:true,message:`${c.name} 대원을 ${SCHEDULE_NAMES[schedule]} 일정으로 바꿨어요.`};};
 proto._chooseRoutine=function(c){if(!this._communityReady||c.schedule==='auto')return false;const phase=phaseAt(this.time,c.schedule,CYCLE_SECONDS);c.schedulePhase=phase;if(phase==='sleep'){for(const b of this.buildings.filter(b=>b.type==='cot'&&b.progress>=1&&b.enabled&&!this._busy(b.id))){const path=this._path(c,[{x:b.x,y:b.y}]);if(path){this._assign(c,'rest',path,{targetId:b.id,scheduled:true});return true;}}}if(phase==='break'&&c.stress>1){for(const b of this.buildings.filter(b=>b.type==='mess'&&b.progress>=1&&b.enabled&&!this._busy(b.id)&&this.cell(b.x,b.y).water<.5)){const path=this._path(c,[{x:b.x,y:b.y}]);if(path){this._assign(c,'relax',path,{targetId:b.id});return true;}}}return false;};
 proto._communityNeeds=function(c,dt){if(!this._communityReady||c.health<=0)return;const phase=phaseAt(this.time,c.schedule,CYCLE_SECONDS),previous=c.schedulePhase;c.schedulePhase=phase;const j=c._job;if(j&&['dig','build','deconstruct','operate','harvest','research','haul','cook'].includes(j.kind))c.stress=cap(c.stress+dt*.060);if(j&&((c.hunger<25&&!['eat','breathe'].includes(j.kind))||(c.energy<14&&!['rest','eat','breathe','toilet','wash'].includes(j.kind))))this._release(c);if(c.schedule!=='auto'&&previous!==phase&&phase!=='work'&&c._job&&!['eat','breathe','toilet','wash','rest'].includes(c._job.kind))this._release(c);};
 proto._communityChoices=function(c,choices){if(!this._communityReady)return;
  for(const b of this.buildings){if(b.type!=='kitchen'||b.progress<1||!b.enabled||!b.connected||this._busy(b.id)||this._kitchenReason(b))continue;const path=this._path(c,this._workGoals(b.x,b.y));if(path)choices.push({kind:'cook',path,targetId:b.id,score:(this.resources.meals<3?76:47)+(c.role==='cook'?24:0)-path.length*.5});}
  if(stockAmount(this.resources)>=storageCapacity(this.buildings)-1e-8)return;
  for(const p of this.debris){if(p.amount<=1e-8||p.reservedBy!==null&&p.reservedBy!==c.id)continue;const path=this._path(c,this._workGoals(p.x,p.y));if(!path)continue;const end=path.at(-1),from=end?{x:end.x+.5,y:end.y+.5}:c;const depot=this._findDepot(from);if(!depot)continue;choices.push({kind:'haul',path,pileId:p.id,phase:'pickup',targetId:depot.building.id,score:p.priority*12+10+(c.role==='haul'?25:0)-(path.length+depot.path.length)*.35});}
 };
 proto._communityTravelLabel=function(c){if(c._job?.kind==='haul')return c.cargo?`${RESOURCE_NAMES[c.cargo.resource]} ${c.cargo.amount.toFixed(0)} 운반 중`:'채굴품을 주우러 이동';if(c._job?.kind==='cook')return'조리대로 이동';if(c._job?.kind==='eat'&&c._job.targetId)return'식탁으로 이동';if(c._job?.kind==='relax')return'여가 장소로 이동';if(c._job?.kind==='rest'&&c._job.scheduled)return'교대 수면을 위해 이동';return null;};
 proto._communityWork=function(c,j,b,dt){if(!this._communityReady)return false;
  if(j.kind==='haul'){
   if(j.phase==='pickup'){const p=this.debris.find(p=>p.id===j.pileId);if(!p||p.reservedBy!==c.id||p.amount<=1e-8){this._release(c);return true;}const dx=Math.abs(c.x-(p.x+.5)),dy=Math.abs(c.y-(p.y+.5));if(dx+dy>2.05){const path=this._path(c,this._workGoals(p.x,p.y));if(!path){this._release(c);return true;}j.path=path;c.path=path;j.elapsed=0;return true;}c.action='채굴품을 담는 중';if(j.elapsed<.6)return true;const space=Math.max(0,storageCapacity(this.buildings)-stockAmount(this.resources));const amount=Math.min(CARGO_CAPACITY,p.amount,space);if(amount<=1e-8){this._release(c);return true;}c.cargo={resource:p.resource,amount};this._gainExperience?.(c,.6);p.amount-=amount;p.reservedBy=null;if(p.amount<=1e-8)this.debris=this.debris.filter(v=>v!==p);const depot=this._findDepot(c);if(!depot){this._release(c);return true;}j.phase='deliver';j.targetId=depot.building.id;j.path=depot.path;c.path=j.path;j.elapsed=0;this._syncCommunity();return true;}
   const depot=b&&['core','storage'].includes(b.type)&&b.progress>=1&&b.enabled&&this.cell(b.x,b.y).water<.7?b:null;
   if(!c.cargo){this._release(c);return true;}
   if(!depot||Math.abs(c.x-(depot.x+.5))+Math.abs(c.y-(depot.y+.5))>.1){const next=this._findDepot(c);if(next){j.targetId=next.building.id;j.path=next.path;c.path=j.path;j.elapsed=0;}else this._release(c);return true;}
   c.action='창고에 자원을 정리하는 중';depot.active=true;depot.workerId=c.id;if(j.elapsed<.6)return true;const amount=Math.min(c.cargo.amount,Math.max(0,storageCapacity(this.buildings)-stockAmount(this.resources)));if(amount>0){this.resources[c.cargo.resource]+=amount;this.production.hauledItems+=amount;c.cargo.amount-=amount;this._gainExperience?.(c,.6);}if(c.cargo.amount<=1e-8)c.cargo=null;this._release(c);return true;
  }
  if(j.kind==='cook'){if(!b||b.type!=='kitchen'||!b.connected||this._kitchenReason(b)||c.energy<18||c.hunger<25){this._release(c);return true;}b.workerId=c.id;c.action=b.status==='전력 부족'?'조리 · 전력 대기':'식사를 조리하는 중';return true;}
  if(j.kind==='eat'){if(b&&(b.type!=='mess'||!b.enabled||b.progress<1||this.cell(b.x,b.y).water>=.5)){this._release(c);return true;}if(b){b.active=true;b.workerId=c.id;}c.action=b?'식탁에서 식사 중':'간단히 식사하는 중';if(j.elapsed>=2){const cooked=this.resources.meals>=1,raw=this.resources.food>=1;if(cooked||raw){if(cooked){this.resources.meals-=1;this.production.cookedEaten++;}else this.resources.food-=1;c.hunger=cap(c.hunger+(cooked?30:24));c.stress=cap(c.stress-(cooked?3:0)-(b?4:0));this.production.mealsEaten++;if(b)this.production.tableMeals++;}this._release(c);}return true;}
  if(j.kind==='rest'){if(b&&(b.type!=='cot'||!b.enabled||b.progress<1)){this._release(c);return true;}c.action=j.scheduled?'교대 수면 중':'잠깐 쉬는 중';c.energy=cap(c.energy+dt*(b?3:1.2));c.stress=cap(c.stress-dt*(b?.3:.08));if(b){b.active=true;b.workerId=c.id;}if(b&&c.schedule!=='auto'&&c.schedulePhase==='sleep'&&j.elapsed>=6){const cycle=Math.floor(this.time/CYCLE_SECONDS+offset(c.schedule));if(c._lastRestCycle!==cycle){c._lastRestCycle=cycle;c.restedCycles++;this.production.scheduledRests++;}}if(c.energy>=95&&(!j.scheduled||j.elapsed>=6))this._release(c);return true;}
  if(j.kind==='relax'){if(!b||b.type!=='mess'||!b.enabled||b.progress<1||this.cell(b.x,b.y).water>=.5){this._release(c);return true;}b.active=true;b.workerId=c.id;c.action='식탁에서 잠시 여유를 즐기는 중';c.stress=cap(c.stress-dt*.9);c.energy=cap(c.energy+dt*.22);if(j.elapsed>=8||c.stress<=1||c.schedulePhase!=='break')this._release(c);return true;}
  return false;
 };

 proto._communityProduction=function(dt){if(!this._communityReady)return;
  for(const b of this.buildings){if(b.type!=='kitchen'||!b.active||!b.workerId||this._kitchenReason(b))continue;const c=this.crew.find(c=>c.id===b.workerId);if(!c||c._job?.kind!=='cook')continue;const previous=b.recipeProgress,efficiency=this._workEfficiency(c);b.recipeProgress=Math.min(1,b.recipeProgress+dt/6*efficiency);this._gainExperience?.(c,(b.recipeProgress-previous)*6/efficiency);b.status=`조리 ${Math.floor(b.recipeProgress*100)}%`;if(b.recipeProgress>=1-1e-8&&this.resources.food>=2&&this._consumeWater(b,.3)){this.resources.food-=2;this.resources.meals+=3;this.production.mealsCooked+=3;b.recipeProgress=0;this.cell(b.x,b.y).temp+=.12;}}
  const status=foodSnapshot(this),raw=Math.min(this.resources.food,status.rawDecayPerSecond*dt),cooked=Math.min(this.resources.meals,status.cookedDecayPerSecond*dt);this.resources.food=Math.max(0,this.resources.food-raw);this.resources.meals=Math.max(0,this.resources.meals-cooked);this.production.foodSpoiled+=raw+cooked;
  for(const b of this.buildings){if(b.progress<1||!b.enabled)continue;if(b.type==='storage')b.status='운반품 수거 가능 · 용량 +240';if(b.type==='mess'&&!b.workerId)b.status=this.cell(b.x,b.y).water>=.5?'침수 · 사용 불가':'식사와 여가 준비';if(b.type==='fridge'&&b.active)b.status='냉장 중 · 부패 80% 감소';}
 };
 proto._updateSettlement=function(dt){const reasons=[],alive=this.crew.filter(c=>c.health>0),ready=b=>b.progress>=1&&b.enabled;
  if(!this.stability.healthy)reasons.push(...this.stability.reasons);
  if(alive.length<3||alive.some(c=>c.health<80))reasons.push('건강 80 이상의 대원 3명 필요');
  if(alive.some(c=>c.stress>35))reasons.push('모든 대원 스트레스 35 이하 필요');
  if(this.foodStatus.total<20)reasons.push('전체 식품 20끼 이상 필요');
  if(this.resources.meals<3)reasons.push('조리식 3끼 이상 비축 필요');
  if(alive.some(c=>c.schedule==='auto'||c.restedCycles<1))reasons.push('대원마다 교대표 선택 후 침상 수면 1회 필요');
  if(this.production.hauledItems<80)reasons.push('채굴품 80개 실제 운반 필요');
  if(this.production.mealsCooked<12)reasons.push('조리식 12끼 실제 생산 필요');
  if(this.production.tableMeals<6)reasons.push('식탁에서 실제 식사 6회 필요');
  if(!this.buildings.some(b=>b.type==='storage'&&ready(b)))reasons.push('사용 가능한 자원 보관함 필요');
  if(!this.buildings.some(b=>b.type==='kitchen'&&ready(b)&&b.connected&&b.waterConnected&&this.cell(b.x,b.y).water<=.5))reasons.push('전력·청수가 연결된 조리대 필요');
  if(!this.buildings.some(b=>b.type==='mess'&&ready(b)&&this.cell(b.x,b.y).water<.5&&alive.every(c=>this._path(c,[{x:b.x,y:b.y}])!==null)))reasons.push('대원들이 접근 가능한 식탁 필요');
  if(!this.foodStatus.cold)reasons.push('전력이 공급되는 냉장고 필요');
  this.settlement.reasons=[...new Set(reasons)];this.settlement.healthy=reasons.length===0;this.settlement.seconds=this.settlement.healthy?Math.min(this.settlement.target,this.settlement.seconds+dt):0;
 };
 proto._finishCommunity=function(dt){if(!this._communityReady)return;this._syncCommunity();this._updateSettlement(dt);};
 proto._updateStats=function(){base.stats.call(this);if(!this._communityReady)return;this._syncCommunity();const alive=this.crew.filter(c=>c.health>0);this.stats.avgStress=alive.length?alive.reduce((s,c)=>s+c.stress,0)/alive.length:0;
  for(const p of this.debris){if(p.reservedBy!==null){p.blockedReason='';continue;}if(this.logistics.stored>=this.logistics.capacity-1e-8){p.blockedReason='공용 고체 창고가 가득 찼어요';continue;}const accessible=alive.some(c=>{const path=this._path(c,this._workGoals(p.x,p.y));if(!path)return false;const end=path.at(-1);return !!this._findDepot(end?{x:end.x+.5,y:end.y+.5}:c);});p.blockedReason=accessible?'':'수거와 창고 사이에 도달할 길이 없어요';}
  this.logistics=logisticsSnapshot(this);for(const t of this.tasks)if(t.type==='deconstruct'){const reason=this._storageRemovalReason(this.buildings.find(b=>b.id===t.buildingId));if(reason)t.blockedReason=reason;}
  const values={haul:this.production.hauledItems,cooking:this.production.mealsCooked,dining:this.production.tableMeals,community:this.settlement.seconds};for(const o of this.objectives){if(!(o.id in values)||o.done)continue;o.progress=Math.min(o.target,values[o.id]);if(o.progress>=o.target-1e-7){o.progress=o.target;o.done=true;if(o.id==='haul')this._pay({metal:12},1);this._event(`목표 달성 · ${o.label}${o.id==='haul'?' — 금속 12 보급':''}`,'good');}}
  if(this.objectives.every(o=>o.done)&&!this.won){this.won=true;this._event('정착지 완성! 운반·식사·교대와 생활 유지가 연결됐습니다. 계속 기지를 돌볼 수 있어요.','good');}
  if(this.logistics.blockedPiles)this.alerts.push({id:'hauling',text:`${this.logistics.blockedPiles}개 자원 더미의 수거가 막혔어요. 통로와 보관함을 확인하세요.`,tone:'warn'});
  if(alive.some(c=>c.stress>60))this.alerts.push({id:'stress',text:'스트레스가 작업 효율을 낮추고 있어요. 식탁·조리식·교대 수면을 준비하세요.',tone:'warn'});
 };
 proto.inspect=function(x,y){const result=base.inspect.call(this,x,y);if(!this.cell(x,y)?.revealed)return result;const piles=this.debris.filter(p=>p.x===x&&p.y===y);result.debris=piles;for(const p of piles)result.lines.push(`${RESOURCE_NAMES[p.resource]} 더미 ${p.amount.toFixed(1)} · 운반 우선순위 ${p.priority}${p.blockedReason?' · '+p.blockedReason:''}`);const b=result.building;if(b?.type==='storage'||b?.type==='core')result.lines.push(`공용 고체 비축 ${stockAmount(this.resources).toFixed(1)} / ${storageCapacity(this.buildings)}`,`이 수거 거점 용량 ${b.storageCapacity}`);if(b?.type==='kitchen')result.lines.push(`목표 조리식 ${b.mealTarget}끼 · 조리 ${Math.floor(b.recipeProgress*100)}%`,'한 번에 식량 2 + 청수 0.3L → 조리식 3');if(b?.type==='fridge')result.lines.push(this.foodStatus.cold?'냉장 보관 · 식품 부패 80% 감소':'냉장 중단 · 식품 부패 정상 속도');if(result.crew){const c=result.crew;result.lines.push(`일정 ${SCHEDULE_NAMES[c.schedule]} · 현재 ${PHASE_NAMES[c.schedulePhase]}`,`계획 수면 ${c.restedCycles}회 · 스트레스 ${Math.round(c.stress)}`);if(c.cargo)result.lines.push(`운반 중 ${RESOURCE_NAMES[c.cargo.resource]} ${c.cargo.amount.toFixed(1)}`);}return result;};
 proto.serialize=function(){const result=base.serialize.call(this);result.version=3;result.debris=clone(this.debris);result.logistics=logisticsSnapshot(this);result.foodStatus=foodSnapshot(this);result.settlement=clone(this.settlement);return result;};

 proto._prepareCommunitySave=function(raw){
  const fail=message=>{throw new Error('저장 파일을 불러올 수 없어요: '+message);};
  const s=this._prepareUtilitiesSave(raw),migrated=s.version<3;
  if(migrated){
   if(!Array.isArray(s.objectives)||s.objectives.length!==legacyObjectives.length||!legacyObjectives.every(o=>s.objectives.some(v=>v.id===o.id&&v.target===o.target&&typeof v.done==='boolean')))fail('이전 목표 데이터가 손상되었습니다.');
   if(!Array.isArray(s.crew)||!Array.isArray(s.buildings)||!s.resources||!s.production||!s.stats)fail('이전 생활 데이터가 손상되었습니다.');
   s.version=3;s.won=false;s.debris=[];s.resources.meals=0;for(const c of s.crew)equipCrew(c);for(const b of s.buildings)equipBuilding(b);for(const key of COMMUNITY_PRODUCTION_KEYS)s.production[key]=0;
   s.objectives.push(...COMMUNITY_OBJECTIVES.map(o=>({...o,done:false,progress:0})));s.logistics=logisticsSnapshot(s);s.foodStatus=foodSnapshot(s);s.settlement={seconds:0,target:240,healthy:false,reasons:['운반·조리·식탁과 교대 수면을 준비하세요.']};s.stats.edibleFood=s.foodStatus.total;s.stats.avgStress=s.crew.filter(c=>c.health>0).reduce((sum,c)=>sum+c.stress,0)/Math.max(1,s.crew.filter(c=>c.health>0).length);
  }
  return s;
 };
 proto.load=function(raw){
  const fail=message=>{throw new Error('저장 파일을 불러올 수 없어요: '+message);};
  const s=this._prepareCommunitySave(raw);
  if(!s.resources||!num(s.resources.meals)||!Array.isArray(s.crew)||!Array.isArray(s.buildings)||!Array.isArray(s.debris)||s.debris.length>6000)fail('식품 또는 자원 더미 정보가 올바르지 않습니다.');
  if(!s.production||!COMMUNITY_PRODUCTION_KEYS.every(k=>num(s.production[k])))fail('운반·생활 생산 기록이 올바르지 않습니다.');
  for(const b of s.buildings){if(!num(b.storageCapacity)||b.storageCapacity!==(b.type==='core'?CORE_CAPACITY:b.type==='storage'?STORAGE_CAPACITY:0)||!Number.isInteger(b.mealTarget)||b.mealTarget<0||b.mealTarget>60||!num(b.recipeProgress,0,1)||b.type!=='kitchen'&&(b.mealTarget!==0||b.recipeProgress!==0))fail('보관함 또는 조리대 상태가 올바르지 않습니다.');}
  const cargoValid=cargo=>cargo===null||cargo&&SOLIDS.includes(cargo.resource)&&num(cargo.amount,1e-9,CARGO_CAPACITY);
  for(const c of s.crew){if(!SCHEDULES.includes(c.schedule)||!['work','break','sleep'].includes(c.schedulePhase)||!Number.isInteger(c.restedCycles)||c.restedCycles<0||!Number.isInteger(c._lastRestCycle)||c._lastRestCycle< -1||!cargoValid(c.cargo))fail('대원의 일정 또는 운반 화물이 올바르지 않습니다.');if(c.schedulePhase!==phaseAt(s.time,c.schedule,CYCLE_SECONDS))fail('교대표와 현재 생활 구간이 일치하지 않습니다.');if(c.cargo&&(c.health<=0||c._job?.kind!=='haul'||c._job.phase!=='deliver'))fail('운반 화물과 대원 작업이 일치하지 않습니다.');if(c._job?.kind==='haul'&&(!['pickup','deliver'].includes(c._job.phase)||!Number.isInteger(c._job.pileId)||!Number.isInteger(c._job.targetId)||c._job.phase==='deliver'&&!c.cargo))fail('운반 작업의 단계가 올바르지 않습니다.');}
  const ids=new Set();for(const p of s.debris){if(!Number.isInteger(p.id)||p.id<1||ids.has(p.id)||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>=48||p.y<0||p.y>=28||!SOLIDS.includes(p.resource)||!num(p.amount,1e-9)||!Number.isInteger(p.priority)||p.priority<1||p.priority>5||typeof p.blockedReason!=='string'||p.blockedReason.length>300)fail('채굴품 더미가 올바르지 않습니다.');ids.add(p.id);if(p.reservedBy!==null){const c=s.crew.find(c=>c.id===p.reservedBy);if(!c||c.health<=0||c._job?.kind!=='haul'||c._job.phase!=='pickup'||c._job.pileId!==p.id)fail('자원 더미의 운반 예약이 올바르지 않습니다.');}}
  for(const c of s.crew)if(c._job?.kind==='haul'&&c._job.phase==='pickup'&&!s.debris.some(p=>p.id===c._job.pileId&&p.reservedBy===c.id))fail('수거 예약이 없는 운반 작업입니다.');
  if([...s.crew,...s.buildings,...(s.tasks||[]),...(s.events||[])].some(v=>ids.has(v.id))||s.debris.some(p=>p.id>=s._nextId))fail('자원 더미 식별자가 충돌합니다.');
  const expectedLogistics=logisticsSnapshot(s);if(!s.logistics||!Object.entries(expectedLogistics).every(([k,v])=>num(s.logistics[k])&&Math.abs(s.logistics[k]-v)<1e-5))fail('운반 재고 합계가 실제 더미·화물·비축과 일치하지 않습니다.');
  const expectedFood=foodSnapshot(s);if(!s.foodStatus||typeof s.foodStatus.cold!=='boolean'||s.foodStatus.cold!==expectedFood.cold||!['raw','cooked','total','rawDecayPerSecond','cookedDecayPerSecond'].every(k=>num(s.foodStatus[k])&&Math.abs(s.foodStatus[k]-expectedFood[k])<1e-5))fail('식품 재고와 보관 상태가 일치하지 않습니다.');
  if(!s.settlement||!num(s.settlement.seconds,0,240.00001)||s.settlement.target!==240||typeof s.settlement.healthy!=='boolean'||!Array.isArray(s.settlement.reasons)||!s.settlement.reasons.every(v=>typeof v==='string'&&v.length<=500))fail('정착 유지 상태가 올바르지 않습니다.');
  if(s.settlement.healthy!==(s.settlement.reasons.length===0)||!s.settlement.healthy&&s.settlement.seconds>1e-8)fail('정착 유지 시간과 현재 조건이 일치하지 않습니다.');
  if(!Array.isArray(s.objectives)||s.won!==s.objectives.every(o=>o.done))fail('최종 승리 상태와 완료한 목표가 일치하지 않습니다.');
  if(!s.stats||!num(s.stats.edibleFood)||!num(s.stats.avgStress,0,100))fail('생활 통계가 올바르지 않습니다.');
  const payload=clone(s);payload.version=2;const result=base.load.call(this,payload);
  for(const key of ['debris','logistics','foodStatus','settlement'])this[key]=clone(s[key]);this.version=3;this._communityReady=true;return result;
 };
}
