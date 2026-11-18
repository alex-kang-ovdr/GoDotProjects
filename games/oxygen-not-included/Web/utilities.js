/** New utility definitions. All values are original game-balance units. */
export const UTILITY_BUILDINGS={
 toilet:{name:'수세식 화장실',icon:'toilet',description:'대원이 용변을 해결합니다. 청수 공급과 오수 배출이 필요해요.',cost:{rock:18,metal:8},color:'#d5cfbf'},
 sink:{name:'세면대',icon:'sink',description:'대원의 위생을 회복합니다. 청수와 오수 배관을 연결하세요.',cost:{rock:12,metal:6},color:'#90d8e1'},
 reservoir:{name:'급수 탱크',icon:'reservoir',description:'연결된 청수와 오수를 서로 섞지 않고 각각 80L씩 저장합니다.',cost:{rock:22,metal:12},color:'#79c7ed'},
 purifier:{name:'오수 정화기',icon:'purifier',description:'오수망의 물을 여과해 청수망으로 돌려보냅니다.',cost:{rock:24,metal:20},power:14,unlock:15,color:'#8ebcaf'},
 electrolyzer:{name:'물 전해장치',icon:'electrolyzer',description:'연결된 청수를 산소와 수소로 바꿉니다.',cost:{rock:25,metal:25},power:22,unlock:35,color:'#89e6cf'},
 hydrogenGen:{name:'수소 발전기',icon:'hydrogen',description:'전해장치가 만든 수소를 소비해 자동 발전합니다.',cost:{rock:28,metal:30},power:-70,unlock:35,color:'#c8a7ef'},
 cooler:{name:'순환 냉각기',icon:'cooler',description:'급수와 전력을 사용해 주변 설비의 열을 밖으로 내보냅니다.',cost:{rock:28,metal:25},power:18,unlock:60,color:'#8ecde7'}
};

export const PRODUCTION_KEYS=['pumpedWater','purifiedWater','oxygenProduced','hydrogenProduced','hydrogenConsumed','hydrogenEnergy','toiletUses','washUses','harvestedFood','mealsEaten','coolingWaterUsed','springWater','energyGenerated'];
export const UTILITY_OBJECTIVES=[
 {id:'sanitation',stage:2,label:'깨끗한 생활',description:'화장실과 세면대를 각각 3번 실제 이용하세요.',target:6},
 {id:'pumping',stage:2,label:'지하수의 발견',description:'지하수에서 청수 20L를 취수하세요.',target:20},
 {id:'purifying',stage:2,label:'돌고 도는 물',description:'오수 8L 이상을 정화해 회수하세요.',target:8},
 {id:'hydrogen',stage:3,label:'물에서 태어나는 전력',description:'전해장치의 수소로 2,000J를 발전하세요.',target:2000},
 {id:'advanced',stage:3,label:'생활 유지 기술',description:'연구 100을 달성하세요.',target:100},
 {id:'stable',stage:3,label:'계속되는 아침',description:'실제 순환 설비와 건강한 대원 3명을 180초 유지하세요.',target:180}
];
const cap=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const goodNum=v=>typeof v==='number'&&Number.isFinite(v);
const adjacent=[[1,0],[-1,0],[0,1],[0,-1]];
const schema={water:{flag:'pipe',amount:'cleanWater',capacity:'cleanCapacity',network:'waterNetworkId',connected:'waterConnected',flow:'pipeFlow'},waste:{flag:'wastepipe',amount:'dirtyWater',capacity:'dirtyCapacity',network:'wasteNetworkId',connected:'wasteConnected',flow:'wasteFlow'}};
const fluidConsumers=new Set(['farm','research','toilet','sink','purifier','electrolyzer','cooler','pump','reservoir']);
const clone=v=>JSON.parse(JSON.stringify(v));
function equipBuilding(b){
 b.cleanCapacity=b.type==='core'?120:b.type==='reservoir'?80:0;
 b.dirtyCapacity=b.type==='reservoir'?80:0;
 b.cleanWater=0;b.dirtyWater=0;b.waterConnected=false;b.wasteConnected=false;
 b.waterNetworkId=-1;b.wasteNetworkId=-1;
 b.automation=['generator','coalgen','hydrogenGen'].includes(b.type)?'battery':['diffuser','electrolyzer'].includes(b.type)?'oxygen':b.type==='cooler'?'temperature':'always';
 b.autoState=true;
}
function ensureNumericTree(v,fail,depth=0,state={nodes:0}){if(++state.nodes>160000||depth>30)fail('데이터가 너무 복잡합니다.');if(typeof v==='number'&&!Number.isFinite(v))fail('유효하지 않은 숫자입니다.');if(v&&typeof v==='object')for(const[k,n]of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))fail('허용되지 않는 키입니다.');ensureNumericTree(n,fail,depth+1,state);}}

export function installUtilities(Game,{BUILDINGS,OBJECTIVES,CYCLE_SECONDS}){
 const proto=Game.prototype;
 const base={reset:proto.reset,add:proto._addBuilding,newCrew:proto._newCrew,pay:proto._pay,queue:proto.queue,canPlace:proto.canPlace,complete:proto._completeTask,stats:proto._updateStats,choose:proto._choose,serialize:proto.serialize,load:proto.load,inspect:proto.inspect};
 const legacyObjectives=OBJECTIVES.map(o=>({...o}));
 const objectiveTools={dig:'dig',oxygen:'diffuser',battery:'battery',farms:'farm',research:'research',sanitation:'toilet',pumping:'pump',purifying:'purifier',hydrogen:'electrolyzer',advanced:'research'};
 for(const o of OBJECTIVES){o.stage=1;if(objectiveTools[o.id])o.tool=objectiveTools[o.id];}
 for(const o of UTILITY_OBJECTIVES)if(objectiveTools[o.id])o.tool=objectiveTools[o.id];
 OBJECTIVES.push(...UTILITY_OBJECTIVES);
 proto._addBuilding=function(...args){const b=base.add.apply(this,args);equipBuilding(b);this._fluidDirty=true;return b;};
 proto._newCrew=function(...args){const c=base.newCrew.apply(this,args);c.bladder=25;c.hygiene=100;c._accidentCooldown=0;return c;};
 proto.reset=function(seed){this._utilitiesReady=false;const result=base.reset.call(this,seed);this.version=2;this._allowBaseWin=false;
  for(const c of this.cells)Object.assign(c,{pipe:false,wastepipe:false,cleanWater:0,dirtyWater:0,pipeFlow:0,wasteFlow:0,spring:false});
  const core=this.buildings.find(b=>b.type==='core');core.cleanWater=this.resources.water;
  for(let x=24;x<=30;x++)this.cell(x,11).pipe=true;
  this.cell(40,10).spring=true;
  this.resources.waste=0;this.resources.hydrogen=0;
  this.production=Object.fromEntries(PRODUCTION_KEYS.map(k=>[k,0]));
  this.plumbing={waterStored:0,waterCapacity:0,wasteStored:0,wasteCapacity:0,waterFlow:0,wasteFlow:0,waterDemand:0};
  this.research={tier:0,cap:100,nextLabel:'연구 15 · 오수 정화'};
  this.stability={seconds:0,target:180,healthy:false,reasons:['생활 유지 시설을 준비하세요.']};
  this.history=[];this._historyClock=0;this._fluidDirty=true;this._fluidNetworks={water:[],waste:[]};this._utilitiesReady=true;this._rebuildFluids();this._syncFluidTotals();this._updateStats();return result;
 };
 proto._slots=function(layer){const s=schema[layer],slots=[];for(let i=0;i<this.cells.length;i++){const c=this.cells[i];if(c[s.flag])slots.push({object:c,key:s.amount,capacity:1,index:i});}for(const b of this.buildings)if(b.progress>=1&&b[s.capacity]>0)slots.push({object:b,key:s.amount,capacity:b[s.capacity],index:b.y*this.w+b.x});return slots;};
 proto._rebuildFluids=function(){
  if(!this._utilitiesReady)return;this._fluidDirty=false;this._fluidNetworks={water:[],waste:[]};
  for(const layer of ['water','waste']){const s=schema[layer],seen=new Set(),map=new Map(),nets=this._fluidNetworks[layer];
   for(let i=0;i<this.cells.length;i++){if(!this.cells[i][s.flag]||seen.has(i))continue;const n={id:nets.length,layer,cells:[],slots:[],input:0,output:0},q=[i];seen.add(i);
    for(let k=0;k<q.length;k++){const v=q[k],x=v%this.w,y=Math.floor(v/this.w);n.cells.push(v);map.set(v,n.id);n.slots.push({object:this.cells[v],key:s.amount,capacity:1,index:v});for(const[dx,dy]of adjacent){const c=this.cell(x+dx,y+dy),ix=(y+dy)*this.w+x+dx;if(c?.[s.flag]&&!seen.has(ix)){seen.add(ix);q.push(ix);}}}nets.push(n);
   }
   for(const b of this.buildings){const id=b.progress>=1?(map.get(b.y*this.w+b.x)??-1):-1;b[s.network]=id;b[s.connected]=id>=0;if(id>=0&&b[s.capacity]>0)nets[id].slots.push({object:b,key:s.amount,capacity:b[s.capacity],index:b.y*this.w+b.x});}
  }
 };
 proto._fluidNet=function(b,layer='water'){if(this._fluidDirty)this._rebuildFluids();return this._fluidNetworks?.[layer]?.[b[schema[layer].network]]||null;};
 proto._fluidAmount=function(net){return net?net.slots.reduce((s,v)=>s+v.object[v.key],0):0;};
 proto._fluidSpace=function(net,except=null){return net?net.slots.reduce((s,v)=>s+(v.object===except?0:Math.max(0,v.capacity-v.object[v.key])),0):0;};
 proto._takeFluid=function(net,amount,port=null){if(!net||amount<=0)return 0;let left=Math.min(amount,this._fluidAmount(net)),moved=left;for(const s of net.slots){const n=Math.min(left,s.object[s.key]);s.object[s.key]=Math.max(0,s.object[s.key]-n);left-=n;if(left<1e-9)break;}net.output+=moved;if(port){const p=this.cell(port.x,port.y);p[schema[net.layer].flow]+=moved/Math.max(.001,this._utilityDt||.1);}return moved;};
 proto._putFluid=function(net,amount,port=null,except=null){if(!net||amount<=0)return 0;let left=Math.min(amount,this._fluidSpace(net,except)),moved=left;const slots=[...net.slots].sort((a,b)=>b.capacity-a.capacity);for(const s of slots){if(s.object===except)continue;const n=Math.min(left,Math.max(0,s.capacity-s.object[s.key]));s.object[s.key]+=n;left-=n;if(left<1e-9)break;}net.input+=moved;if(port)this.cell(port.x,port.y)[schema[net.layer].flow]+=moved/Math.max(.001,this._utilityDt||.1);return moved;};
 proto._consumeWater=function(b,amount){const n=this._fluidNet(b,'water');if(!n||this._fluidAmount(n)+1e-8<amount)return false;this._takeFluid(n,amount,b);return true;};
 proto._addWaterStock=function(amount){if(amount<=0)return;const core=this.buildings.find(b=>b.type==='core');if(!core)return;core.cleanCapacity=Math.max(core.cleanCapacity,core.cleanWater+amount);core.cleanWater+=amount;this._fluidDirty=true;};
 proto._syncFluidTotals=function(){if(!this._utilitiesReady)return;const ws=this._slots('water'),ds=this._slots('waste');this.resources.water=ws.reduce((s,v)=>s+v.object[v.key],0);this.resources.waste=ds.reduce((s,v)=>s+v.object[v.key],0);this.plumbing.waterStored=this.resources.water;this.plumbing.wasteStored=this.resources.waste;this.plumbing.waterCapacity=ws.reduce((s,v)=>s+v.capacity,0);this.plumbing.wasteCapacity=ds.reduce((s,v)=>s+v.capacity,0);};
 proto._pay=function(prices,sign=-1){if(!this._utilitiesReady)return base.pay.call(this,prices,sign);for(const[k,v]of Object.entries(prices||{})){if(k==='water'){if(sign>0)this._addWaterStock(v);else{let left=v;for(const s of this._slots('water')){const n=Math.min(left,s.object[s.key]);s.object[s.key]-=n;left-=n;if(left<1e-8)break;}}}else this.resources[k]=Math.max(0,this.resources[k]+sign*v);}this._syncFluidTotals();};
 proto.canPlace=function(tool,x,y){
  if(['pipe','wastepipe','removePipe','removeWastepipe'].includes(tool)){const c=this.cell(x,y);if(!c||!c.revealed)return{ok:false,message:'탐사한 지도 안의 칸을 선택하세요.'};if(this.lost)return{ok:false,message:'새 기지를 시작하거나 저장을 불러오세요.'};const remove=tool.startsWith('remove'),layer=tool==='pipe'||tool==='removePipe'?'water':'waste',s=schema[layer];if(remove){if(!c[s.flag])return{ok:false,message:'해당 배관이 없어요.'};if(this._fluidDirty)this._rebuildFluids();const net=this._fluidNetworks[layer].find(n=>n.cells.includes(y*this.w+x));if(c[s.amount]>this._fluidSpace(net,c)+1e-8)return{ok:false,message:'관 속 물을 옮길 공간이 부족해요. 탱크를 연결하거나 물을 먼저 사용하세요.'};return{ok:true,message:'배관을 철거하고 금속 1을 회수합니다.'};}if(c[s.flag])return{ok:false,message:'이미 해당 배관이 있어요.'};if(c.solid==='bedrock')return{ok:false,message:'기반암에는 설치할 수 없어요.'};return{ok:this.resources.metal>=1,message:this.resources.metal>=1?'금속 1로 배관을 즉시 설치합니다.':'금속이 부족해요.'};}
  const r=base.canPlace.call(this,tool,x,y);if(r.ok&&tool==='deconstruct'){const b=this._buildingAt(x,y);if(b&&b.progress>=1)for(const layer of ['water','waste']){const s=schema[layer];if(b[s.amount]>this._fluidSpace(this._fluidNet(b,layer),b)+1e-8)return{ok:false,message:'탱크의 물을 옮길 저장 공간이 필요해요.'};}}return r;
 };
 proto.queue=function(tool,x,y){if(['pipe','wastepipe','removePipe','removeWastepipe'].includes(tool)){const r=this.canPlace(tool,x,y);if(!r.ok)return r;const c=this.cell(x,y),remove=tool.startsWith('remove'),layer=tool==='pipe'||tool==='removePipe'?'water':'waste',s=schema[layer];if(remove){const n=this._fluidNetworks[layer].find(v=>v.cells.includes(y*this.w+x));const amount=c[s.amount];c[s.amount]=0;this._putFluid(n,amount,null,c);c[s.flag]=false;c[s.flow]=0;this.resources.metal++;}else{c[s.flag]=true;this.resources.metal--;}this._fluidDirty=true;this._rebuildFluids();this._syncFluidTotals();return r;}return base.queue.call(this,tool,x,y);};
 proto._completeTask=function(t){
  const b=this.buildings.find(b=>b.id===t.buildingId);
  if(this._utilitiesReady&&t.type==='deconstruct'&&b){for(const layer of ['water','waste']){const s=schema[layer];if(b[s.amount]>this._fluidSpace(this._fluidNet(b,layer),b)+1e-8){t.progress=.95;t.blockedReason='탱크 물을 옮길 공간 부족';return;}}for(const layer of ['water','waste']){const s=schema[layer],amount=b[s.amount];b[s.amount]=0;this._putFluid(this._fluidNet(b,layer),amount,null,b);}}
  const waterBefore=this.resources.water;base.complete.call(this,t);if(this._utilitiesReady&&this.resources.water>waterBefore)this._addWaterStock(this.resources.water-waterBefore);this._fluidDirty=true;this._syncFluidTotals();
 };
 proto.setAutomation=function(id,mode){const b=this.buildings.find(v=>v.id===id);if(!b)return{ok:false,message:'설비를 찾을 수 없어요.'};const allowed=['always'];if(['generator','coalgen','hydrogenGen'].includes(b.type))allowed.push('battery');if(['diffuser','electrolyzer'].includes(b.type))allowed.push('oxygen');if(b.type==='cooler')allowed.push('temperature');if(!allowed.includes(mode))return{ok:false,message:'이 설비에는 해당 자동 제어를 사용할 수 없어요.'};b.automation=mode;b.autoState=true;return{ok:true,message:mode==='always'?'항상 가동으로 설정했어요.':'자동 제어를 설정했어요.'};};
 proto._automationAllows=function(b){if(!b.enabled)return false;if(b.automation==='always'||!b.automation)return true;if(b.automation==='battery'){const n=this._networks[b.networkId],bs=n?.buildings.filter(v=>v.type==='battery'&&v.enabled)||[],capacity=bs.reduce((s,v)=>s+v.capacity,0),stored=bs.reduce((s,v)=>s+v.charge,0);if(capacity===0){b.autoState=true;return true;}const fraction=stored/capacity;if(fraction<=.25)b.autoState=true;if(fraction>=.90)b.autoState=false;}else if(b.automation==='oxygen'){const value=this._nearbyOxygen(b);if(value<=.65)b.autoState=true;if(value>=1.25)b.autoState=false;}else if(b.automation==='temperature'){const value=this._nearbyTemperature(b);if(value>=27)b.autoState=true;if(value<=23.5)b.autoState=false;}return b.autoState;};
 proto._nearbyOxygen=function(b){let total=0,count=0;for(let dy=-2;dy<=2;dy++)for(let dx=-3;dx<=3;dx++){const c=this.cell(b.x+dx,b.y+dy);if(c&&!c.solid){total+=c.oxygen;count++;}}return count?total/count:0;};
 proto._nearbyTemperature=function(b){let temp=0,n=0;for(let dy=-2;dy<=2;dy++)for(let dx=-3;dx<=3;dx++){const c=this.cell(b.x+dx,b.y+dy);if(c&&!c.solid){temp+=c.temp;n++;}}return n?temp/n:22;};
 proto._needsGenerator=function(b){if(!b.enabled||!b.connected||!this._automationAllows(b))return false;const n=this._networks[b.networkId];if(!n)return false;const bats=n.buildings.filter(v=>v.type==='battery'&&v.enabled),needs=n.buildings.filter(v=>v.enabled&&v.progress>=1&&(BUILDINGS[v.type]?.power||0)>0).reduce((s,v)=>s+BUILDINGS[v.type].power,0);const auto=n.buildings.filter(v=>v.enabled&&((v.type==='coalgen'&&this.resources.coal>0)||(v.type==='hydrogenGen'&&this.resources.hydrogen>.02))).reduce((s,v)=>s-Math.min(0,BUILDINGS[v.type]?.power||0),0);if(auto>=needs&&auto>0)return false;return needs>0||bats.some(v=>v.charge<v.capacity*.90);};
 proto._sanitationReason=function(b){const clean=this._fluidNet(b,'water'),dirty=this._fluidNet(b,'waste'),input=b.type==='toilet'?2:.65,output=b.type==='toilet'?2.2:.65;if(!clean)return'청수 배관 연결 필요';if(!dirty)return'오수 배관 연결 필요';if(this._fluidAmount(clean)+1e-8<input)return'청수 공급 부족';if(this._fluidSpace(dirty)+1e-8<output)return'오수 가득 참 · 정화/저장 필요';return null;};
 proto._choose=function(c){if(this._utilitiesReady&&c.breath>=45&&c.hunger>=25&&c.energy>=10){const type=c.bladder>=70?'toilet':c.hygiene<65?'sink':null;if(type){for(const b of this.buildings){if(b.type!==type||b.progress<1||!b.enabled||this._busy(b.id))continue;const reason=this._sanitationReason(b);if(reason){b.status=reason;continue;}const path=this._path(c,[{x:b.x,y:b.y}]);if(path){this._assign(c,type==='toilet'?'toilet':'wash',path,{targetId:b.id});return;}}}}return base.choose.call(this,c);};
 proto._sanitationNeeds=function(c,dt){if(!this._utilitiesReady||c.health<=0)return;c.bladder=cap(c.bladder+dt*.15);c.hygiene=cap(c.hygiene-dt*(c._job?.kind==='dig'?.055:.022));c._accidentCooldown=Math.max(0,(c._accidentCooldown||0)-dt);
  if(c.bladder>=80&&c._job&&!['toilet','wash','breathe','rest','eat'].includes(c._job.kind))this._release(c);
  if(c.bladder>=100&&c._accidentCooldown<=0){c.bladder=15;c.hygiene=cap(c.hygiene-28);c.stress=cap(c.stress+12);c._accidentCooldown=120;this._event(`${c.name} 대원이 화장실을 찾지 못했어요. 청수·오수 연결과 접근 경로를 확인하세요.`,'warn');}
  if(c.hygiene<35)c.stress=cap(c.stress+dt*.06);
 };
 proto._sanitationWork=function(c,j,b,dt){if(!['toilet','wash'].includes(j.kind))return false;if(!b){this._release(c);return true;}const reason=this._sanitationReason(b);if(reason){b.status=reason;c.action=reason;this._release(c);return true;}c.action=j.kind==='toilet'?'화장실 이용 중':'손을 씻는 중';b.status=c.action;b.active=true;b.workerId=c.id;
  if(j.elapsed>=(j.kind==='toilet'?4:2.5)){const clean=this._fluidNet(b,'water'),dirty=this._fluidNet(b,'waste'),input=j.kind==='toilet'?2:.65,output=j.kind==='toilet'?2.2:.65;this._takeFluid(clean,input,b);this._putFluid(dirty,output,b);if(j.kind==='toilet'){c.bladder=0;c.hygiene=cap(c.hygiene-25);this.production.toiletUses++;}else{c.hygiene=100;this.production.washUses++;}this._release(c);this._syncFluidTotals();}return true;
 };
 proto._utilityReady=function(b,dt=.1){if(!this._utilitiesReady)return null;if(!this._automationAllows(b))return'자동 제어 대기';const clean=this._fluidNet(b,'water'),waste=this._fluidNet(b,'waste');
  if(['farm','research','electrolyzer','cooler'].includes(b.type)){if(!clean)return'청수 배관 연결 필요';const demand=b.type==='electrolyzer'?.18:b.type==='cooler'?.025:b.type==='farm'?.012:.008;if(this._fluidAmount(clean)<demand*dt-1e-9)return'청수 공급 부족';}
  if(b.type==='pump'){if(!clean)return'청수 출력 배관 필요';if(this._fluidSpace(clean)<.001)return'청수 저장 가득 참';}
  if(b.type==='purifier'){if(!waste)return'오수 입력 배관 필요';if(!clean)return'청수 출력 배관 필요';if(this._fluidAmount(waste)<.001)return'정화할 오수 없음';if(this._fluidSpace(clean)<.001)return'청수 출력 가득 참';if(this.resources.rock<.001)return'여과용 광석 부족';}
  if(b.type==='cooler'){if(!waste)return'오수 출력 배관 필요';if(this._fluidSpace(waste)<.025*dt)return'오수 출력 가득 참';}
  if(b.type==='electrolyzer'&&this.resources.hydrogen>=40)return'공용 수소 저장고 가득 참';return null;
 };
 proto._startUtilities=function(dt){if(!this._utilitiesReady)return;this._utilityDt=dt;if(this._fluidDirty)this._rebuildFluids();for(const c of this.cells){c.pipeFlow=0;c.wasteFlow=0;}for(const layer of ['water','waste'])for(const n of this._fluidNetworks[layer]){n.input=0;n.output=0;}this.plumbing.waterDemand=0;
  for(const c of this.cells)if(c.spring&&!c.solid){const added=Math.min(1-c.water,.025*dt);c.water+=added;this.production.springWater+=added*12;}
 };
 proto._pumpWater=function(b,dt){const n=this._fluidNet(b,'water');if(!n)return;let wanted=Math.min(.4*dt,this._fluidSpace(n));for(const[dx,dy]of adjacent){const c=this.cell(b.x+dx,b.y+dy);if(!c||wanted<=0)continue;const amount=Math.min(c.water*12,wanted);c.water-=amount/12;this._putFluid(n,amount,b);this.production.pumpedWater+=amount;wanted-=amount;}};
 proto._hydrogenPower=function(b,dt,needed){if(!b.enabled||!this._automationAllows(b)){b.status=b.enabled?'자동 제어 대기':'수동 정지';return 0;}if(this.resources.hydrogen<.04*dt){b.status='수소 부족 · 전해장치 확인';return 0;}if(!needed){b.status='전력 충분';return 0;}this.resources.hydrogen=Math.max(0,this.resources.hydrogen-.04*dt);this.production.hydrogenConsumed+=.04*dt;this.production.hydrogenEnergy+=70*dt;this.cell(b.x,b.y).temp+=.09*dt;b.active=true;b.status='수소 발전 중 · 70W';return 70;};
 proto._finishUtilities=function(dt){if(!this._utilitiesReady)return;
  for(const b of this.buildings){if(b.progress<1||!b.enabled)continue;if(['toilet','sink'].includes(b.type)&&!b.workerId)b.status=this._sanitationReason(b)||'사용 가능';if(b.type==='reservoir')b.status=b.waterConnected||b.wasteConnected?'연결된 물 저장 중':'배관 연결 필요';if(b.type==='core')b.status='초기 청수 저장소';
   if(!b.active)continue;const clean=this._fluidNet(b,'water'),waste=this._fluidNet(b,'waste');
   if(b.type==='purifier'){const input=Math.min(.16*dt,this._fluidAmount(waste),this._fluidSpace(clean)/.95,this.resources.rock/.05);if(input>0){this._takeFluid(waste,input,b);this._putFluid(clean,input*.95,b);this.resources.rock-=input*.05;this.production.purifiedWater+=input*.95;this.cell(b.x,b.y).temp+=.018*dt;}}
   if(b.type==='electrolyzer'){const input=Math.min(.18*dt,this._fluidAmount(clean),(40-this.resources.hydrogen)/(.055/.18));if(input>0){this._takeFluid(clean,input,b);const ratio=input/.18;const oxygen=.30*ratio,hydrogen=.055*ratio;this.resources.hydrogen+=hydrogen;this.production.oxygenProduced+=oxygen;this.production.hydrogenProduced+=hydrogen;const p=this.cell(b.x,b.y);p.oxygen=Math.min(3,p.oxygen+oxygen);p.temp+=.06*ratio;}}
   if(b.type==='cooler'){const amount=Math.min(.025*dt,this._fluidAmount(clean),this._fluidSpace(waste));if(amount>0){this._takeFluid(clean,amount,b);this._putFluid(waste,amount,b);this.production.coolingWaterUsed+=amount;for(let dy=-3;dy<=3;dy++)for(let dx=-4;dx<=4;dx++){const p=this.cell(b.x+dx,b.y+dy);if(p&&!p.solid&&p.temp>23)p.temp=Math.max(23,p.temp-dt*.10);}}}
  }
  for(const layer of ['water','waste'])for(const net of this._fluidNetworks[layer]){const total=this._fluidAmount(net),capacity=net.slots.reduce((s,v)=>s+v.capacity,0);if(capacity>0)for(const s of net.slots)s.object[s.key]=total*s.capacity/capacity;}
  this.plumbing.waterFlow=this._fluidNetworks.water.reduce((s,n)=>s+Math.max(n.input,n.output),0)/dt;this.plumbing.wasteFlow=this._fluidNetworks.waste.reduce((s,n)=>s+Math.max(n.input,n.output),0)/dt;
  this.plumbing.waterDemand=this.buildings.filter(b=>b.enabled&&b.progress>=1).reduce((s,b)=>s+(b.type==='electrolyzer'?.18:b.type==='cooler'?.025:b.type==='farm'?.012:b.type==='research'&&this.stats.research<100?.008:0),0);
  this.production.energyGenerated+=this.power.production*dt;this._syncFluidTotals();this._updateStability(dt);this._historyClock+=dt;if(this._historyClock>=10){this._historyClock-=10;this.history.push({time:this.time,oxygen:this.stats.oxygen,food:this.resources.food+(this.resources.meals||0),water:this.resources.water,power:this.power.capacity?Math.min(100,this.power.stored/this.power.capacity*100):0});if(this.history.length>90)this.history.shift();}
 };
 proto._updateStability=function(dt){const reasons=[],alive=this.crew.filter(c=>c.health>0);if(alive.length<3||alive.some(c=>c.health<70))reasons.push('건강 70 이상의 대원 3명 필요');if(this.stats.oxygen<55)reasons.push('생활 구역 산소 55% 이상 필요');if(this.resources.food+(this.resources.meals||0)<8)reasons.push('식량 8 이상 비축 필요');if(this.resources.water<20)reasons.push('청수 20L 이상 비축 필요');if(alive.some(c=>c.hygiene<65||c.bladder>90))reasons.push('대원 위생과 화장실 운영 필요');if(this.stats.research<100)reasons.push('연구 100 필요');if(this.production.pumpedWater<20)reasons.push('실제 취수 20L 필요');if(this.production.purifiedWater<8)reasons.push('실제 정화 8L 필요');if(this.production.hydrogenEnergy<2000)reasons.push('수소 발전 2,000J 필요');if(this.production.toiletUses<3||this.production.washUses<3)reasons.push('화장실·세면대 각 3회 이용 필요');
  const ready=b=>b.progress>=1&&b.enabled;
  if(!this.buildings.some(b=>b.type==='pump'&&ready(b)&&b.connected&&b.waterConnected))reasons.push('연결된 취수 설비 필요');
  for(const type of ['toilet','sink'])if(!this.buildings.some(b=>b.type===type&&ready(b)&&b.waterConnected&&b.wasteConnected))reasons.push(type==='toilet'?'청수·오수가 연결된 화장실 필요':'청수·오수가 연결된 세면대 필요');
  if(!this.buildings.some(b=>b.type==='purifier'&&ready(b)&&b.connected&&b.waterConnected&&b.wasteConnected))reasons.push('전력·청수·오수가 연결된 정화기 필요');
  if(!this.buildings.some(b=>b.type==='electrolyzer'&&ready(b)&&b.connected&&b.waterConnected))reasons.push('전력·청수가 연결된 전해장치 필요');
  if(!this.buildings.some(b=>b.type==='hydrogenGen'&&ready(b)&&b.connected))reasons.push('연결된 자동 수소 발전 필요');if(this.resources.waste>this.plumbing.wasteCapacity*.90&&this.resources.waste>1)reasons.push('오수 저장 여유 필요');
  this.stability.reasons=reasons;this.stability.healthy=reasons.length===0;this.stability.seconds=this.stability.healthy?Math.min(this.stability.target,this.stability.seconds+dt):0;
 };
 proto._updateStats=function(){base.stats.call(this);if(!this._utilitiesReady)return;this.stats.blockedTasks=0;for(const t of this.tasks){if(t.assigned!==null){t.blockedReason='';continue;}const accessible=this.crew.some(c=>c.health>0&&this._path(c,this._workGoals(t.x,t.y,t.type!=='build'||this.buildings.find(b=>b.id===t.buildingId)?.type!=='tile'))!==null);t.blockedReason=accessible?'대원 작업 순서 대기':'도달할 길이 없어요 · 사다리/바닥 확인';if(!accessible)this.stats.blockedTasks++;}
  const value=this.stats.research;this.research.tier=value>=60?3:value>=35?2:value>=15?1:0;this.research.nextLabel=value<15?'연구 15 · 오수 정화':value<35?'연구 35 · 전해·수소 발전':value<60?'연구 60 · 순환 냉각':value<100?'연구 100 · 자립 기술':'자립 기술 완성';
  const counts={sanitation:Math.min(3,this.production.toiletUses)+Math.min(3,this.production.washUses),pumping:this.production.pumpedWater,purifying:this.production.purifiedWater,hydrogen:this.production.hydrogenEnergy,advanced:value,stable:this.stability.seconds};for(const o of this.objectives){if(!(o.id in counts)||o.done)continue;o.progress=Math.min(o.target,counts[o.id]);if(o.progress>=o.target-1e-7){o.progress=o.target;o.done=true;this._event(`목표 달성 · ${o.label}`,'good');}}
  if(this.objectives.every(o=>o.done)&&!this.won){this.won=true;this._event('자립 운영 완료! 물·산소·전력과 생활을 이어가는 기지가 되었습니다.','good');}
  if(this.crew.some(c=>c.health>0&&c.bladder>80))this.alerts.push({id:'toilet',text:'화장실이 급한 대원이 있어요. 배관과 접근 경로를 확인하세요.',tone:'warn'});if(this.crew.some(c=>c.health>0&&c.hygiene<45))this.alerts.push({id:'hygiene',text:'대원의 위생이 낮아요. 세면대와 청수·오수 연결을 확인하세요.',tone:'warn'});if(this.resources.water<8)this.alerts.push({id:'water',text:'청수 재고가 적어요. 오른쪽 지하수에 취수기를 연결하세요.',tone:'danger'});if(this.buildings.some(b=>b.status?.includes('오수')&&b.status?.includes('가득')))this.alerts.push({id:'waste',text:'오수 배출이 막혔어요. 저장 탱크나 정화기를 연결하세요.',tone:'warn'});if(this.stats.blockedTasks)this.alerts.push({id:'blocked',text:`${this.stats.blockedTasks}개 작업에 도달할 길이 없어요.`,tone:'warn'});
 };
 proto.inspect=function(x,y){const result=base.inspect.call(this,x,y),c=this.cell(x,y);if(!c?.revealed)return result;if(c.pipe)result.lines.push(`청수관 ${c.cleanWater.toFixed(2)} / 1L`);if(c.wastepipe)result.lines.push(`오수관 ${c.dirtyWater.toFixed(2)} / 1L`);if(c.spring)result.lines.push('지하수 유입구 · 최대 0.30L/s 자연 유입');const b=result.building;if(b){if(fluidConsumers.has(b.type)||b.type==='core')result.lines.push(`청수 ${b.waterConnected?'연결':'미연결'} · 오수 ${b.wasteConnected?'연결':'미연결'}`);if(b.cleanCapacity)result.lines.push(`청수 저장 ${b.cleanWater.toFixed(1)} / ${b.cleanCapacity.toFixed(0)}L`);if(b.dirtyCapacity)result.lines.push(`오수 저장 ${b.dirtyWater.toFixed(1)} / ${b.dirtyCapacity.toFixed(0)}L`);if(b.type==='hydrogenGen')result.lines.push(`공용 수소 저장고 ${this.resources.hydrogen.toFixed(2)} / 40`);if(['generator','coalgen','hydrogenGen','diffuser','electrolyzer','cooler'].includes(b.type))result.lines.push(`자동 제어 · ${{always:'항상 가동',battery:'배터리 잔량',oxygen:'주변 산소',temperature:'주변 온도'}[b.automation]||'항상 가동'}`);}if(result.crew)result.lines.push(`용변 ${Math.round(result.crew.bladder)} · 위생 ${Math.round(result.crew.hygiene)}`);const t=this.tasks.find(t=>t.x===x&&t.y===y);if(t?.blockedReason)result.lines.push(t.blockedReason);return result;};
 proto.serialize=function(){const result=base.serialize.call(this);result.version=2;for(const key of ['plumbing','research','stability','history','production','_historyClock'])result[key]=clone(this[key]);return result;};
 const migrate=function(raw,fail){
  if(!Array.isArray(raw.objectives)||raw.objectives.length!==legacyObjectives.length||!legacyObjectives.every(o=>raw.objectives.some(v=>v.id===o.id&&v.target===o.target&&typeof v.done==='boolean')))fail('기존 목표 데이터가 손상되었습니다.');
  const s=clone(raw);s.version=2;s.won=false;
  if(!Array.isArray(s.cells)||!Array.isArray(s.buildings)||!Array.isArray(s.crew)||!s.resources||!goodNum(s.resources.water))fail('기존 저장 데이터가 손상되었습니다.');
  for(const c of s.cells)Object.assign(c,{pipe:false,wastepipe:false,cleanWater:0,dirtyWater:0,pipeFlow:0,wasteFlow:0,spring:false});
  for(const b of s.buildings)equipBuilding(b);
  const core=s.buildings.find(b=>b.type==='core');if(!core)fail('기지 코어가 없습니다.');core.cleanCapacity=Math.max(120,s.resources.water);core.cleanWater=s.resources.water;
  for(let x=24;x<=30;x++){const c=s.cells[11*s.w+x];if(c)c.pipe=true;}
  if(s.cells[10*s.w+40])s.cells[10*s.w+40].spring=true;
  for(const c of s.crew){c.bladder=25;c.hygiene=100;c._accidentCooldown=0;}
  for(const t of s.tasks||[])t.blockedReason='';s.resources.waste=0;s.resources.hydrogen=0;
  s.production=Object.fromEntries(PRODUCTION_KEYS.map(k=>[k,0]));s.history=[];s._historyClock=0;s.stats.blockedTasks=0;
  s.research={tier:s.stats.research>=60?3:s.stats.research>=35?2:s.stats.research>=15?1:0,cap:100,nextLabel:'생활 유지 기술을 계속 연구하세요.'};
  s.stability={seconds:0,target:180,healthy:false,reasons:['새로운 생활 유지 시설을 연결하세요.']};
  s.objectives=s.objectives.map(o=>({...o,stage:1,...(objectiveTools[o.id]?{tool:objectiveTools[o.id]}:{})})).concat(UTILITY_OBJECTIVES.map(o=>({...o,done:false,progress:0})));
  const waterCapacity=s.cells.filter(c=>c.pipe).length+s.buildings.filter(b=>b.progress>=1).reduce((sum,b)=>sum+b.cleanCapacity,0);
  const wasteCapacity=s.cells.filter(c=>c.wastepipe).length+s.buildings.filter(b=>b.progress>=1).reduce((sum,b)=>sum+b.dirtyCapacity,0);
  s.plumbing={waterStored:s.resources.water,waterCapacity,wasteStored:0,wasteCapacity,waterFlow:0,wasteFlow:0,waterDemand:0};return s;
 };
 proto._prepareUtilitiesSave=function(raw){const fail=s=>{throw new Error('저장 파일을 불러올 수 없어요: '+s);};if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('올바른 저장 파일이 아닙니다.');ensureNumericTree(raw,fail);if(![1,2,3,4].includes(raw.version))fail('지원하지 않는 저장 버전입니다.');return raw.version===1?migrate(raw,fail):clone(raw);};
 proto.load=function(raw){const fail=s=>{throw new Error('저장 파일을 불러올 수 없어요: '+s);};const object=this._prepareUtilitiesSave(raw);
  if(!Array.isArray(object.cells)||!Array.isArray(object.buildings)||!Array.isArray(object.crew))fail('지도 또는 설비 정보가 없습니다.');
  for(const c of object.cells){if(typeof c.pipe!=='boolean'||typeof c.wastepipe!=='boolean'||typeof c.spring!=='boolean'||!['cleanWater','dirtyWater','pipeFlow','wasteFlow'].every(k=>goodNum(c[k])&&c[k]>=0)||c.cleanWater>1.000001||c.dirtyWater>1.000001||!c.pipe&&c.cleanWater>1e-8||!c.wastepipe&&c.dirtyWater>1e-8)fail('배관 저장량 또는 형식이 올바르지 않습니다.');}
  for(const b of object.buildings){if(!['cleanWater','dirtyWater','cleanCapacity','dirtyCapacity'].every(k=>goodNum(b[k])&&b[k]>=0)||b.cleanWater>b.cleanCapacity+1e-7||b.dirtyWater>b.dirtyCapacity+1e-7||typeof b.waterConnected!=='boolean'||typeof b.wasteConnected!=='boolean'||typeof b.autoState!=='boolean')fail('탱크 또는 배관 연결 상태가 올바르지 않습니다.');const allowed=['always'];if(['generator','coalgen','hydrogenGen'].includes(b.type))allowed.push('battery');if(['diffuser','electrolyzer'].includes(b.type))allowed.push('oxygen');if(b.type==='cooler')allowed.push('temperature');if(!allowed.includes(b.automation))fail('허용되지 않는 자동 제어입니다.');if(b.paidCost&&Object.entries(b.paidCost).some(([k,v])=>!['rock','metal','algae','coal','water','food'].includes(k)||!goodNum(v)||v<0))fail('예약 자원 정보가 올바르지 않습니다.');}
  for(const c of object.crew){if(!['bladder','hygiene'].every(k=>goodNum(c[k])&&c[k]>=0&&c[k]<=100)||!goodNum(c._accidentCooldown)||c._accidentCooldown<0)fail('대원 위생 상태가 올바르지 않습니다.');}
  if(!object.resources||!['waste','hydrogen'].every(k=>goodNum(object.resources[k])&&object.resources[k]>=0)||object.resources.hydrogen>40.00001)fail('물 또는 수소 재고가 올바르지 않습니다.');
  const waterTotal=object.cells.reduce((sum,c)=>sum+c.cleanWater,0)+object.buildings.reduce((sum,b)=>sum+b.cleanWater,0),wasteTotal=object.cells.reduce((sum,c)=>sum+c.dirtyWater,0)+object.buildings.reduce((sum,b)=>sum+b.dirtyWater,0);
  const waterCapacity=object.cells.filter(c=>c.pipe).length+object.buildings.filter(b=>b.progress>=1).reduce((sum,b)=>sum+b.cleanCapacity,0),wasteCapacity=object.cells.filter(c=>c.wastepipe).length+object.buildings.filter(b=>b.progress>=1).reduce((sum,b)=>sum+b.dirtyCapacity,0);
  if(!object.plumbing||!['waterStored','waterCapacity','wasteStored','wasteCapacity','waterFlow','wasteFlow','waterDemand'].every(k=>goodNum(object.plumbing[k])&&object.plumbing[k]>=0)||Math.abs(waterTotal-object.resources.water)>1e-5||Math.abs(wasteTotal-object.resources.waste)>1e-5||Math.abs(object.plumbing.waterStored-waterTotal)>1e-5||Math.abs(object.plumbing.wasteStored-wasteTotal)>1e-5||Math.abs(object.plumbing.waterCapacity-waterCapacity)>1e-5||Math.abs(object.plumbing.wasteCapacity-wasteCapacity)>1e-5)fail('청수·오수 총량과 실제 저장량이 일치하지 않습니다.');
  if(!object.production||!PRODUCTION_KEYS.every(k=>goodNum(object.production[k])&&object.production[k]>=0))fail('생산 기록이 올바르지 않습니다.');
  if(!object.research||!Number.isInteger(object.research.tier)||object.research.tier<0||object.research.tier>3||object.research.cap!==100||typeof object.research.nextLabel!=='string')fail('연구 단계가 올바르지 않습니다.');
  if(!object.stability||!goodNum(object.stability.seconds)||object.stability.seconds<0||object.stability.seconds>180.0001||object.stability.target!==180||typeof object.stability.healthy!=='boolean'||!Array.isArray(object.stability.reasons)||!object.stability.reasons.every(v=>typeof v==='string'))fail('자립 진행 상태가 올바르지 않습니다.');
  if(!Array.isArray(object.history)||object.history.length>90||!object.history.every(v=>['time','oxygen','food','water','power'].every(k=>goodNum(v[k])&&v[k]>=0)&&v.oxygen<=100&&v.power<=100)||!goodNum(object._historyClock)||object._historyClock<0||object._historyClock>10.0001)fail('추세 기록이 올바르지 않습니다.');
  if(!Array.isArray(object.objectives)||object.objectives.some(o=>!Number.isInteger(o.stage)||o.stage!==OBJECTIVES.find(expected=>expected.id===o.id)?.stage))fail('목표 단계가 올바르지 않습니다.');
  // The legacy validator performs all remaining checks before it mutates this instance.
  const result=base.load.call(this,object);for(const k of ['plumbing','research','stability','history','production','_historyClock'])this[k]=clone(object[k]);this.version=2;this._utilitiesReady=true;this._allowBaseWin=false;this._utilityDt=.1;this._fluidDirty=true;this._fluidNetworks={water:[],waste:[]};this._rebuildFluids();this._syncFluidTotals();return result;
 };
}
