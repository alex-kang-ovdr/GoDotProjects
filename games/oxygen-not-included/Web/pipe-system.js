import { usesModernRules } from './rules.js';
import { buildConduitGraph, advanceConduits, pipeDue, cellConduitAdapter } from './conduits.js';
import { buildingPort } from './footprint.js';
import { atmosphereOf, displaceAtmosphereForLiquid, takeAtmosphere, emitAtmosphere } from './atmosphere.js';

export const PIPE_BUILDINGS={
  gasBridge:{name:'기체관 다리',icon:'gaspipe',description:'흰색 입구에서 녹색 출구로 기체를 보내 다른 관 위를 건넙니다.',cost:{rock:10},color:'#89bdaf'},
  liquidBridge:{name:'액체관 다리',icon:'pipe',description:'두 끝의 관을 연결합니다. 가운데 칸의 액체관은 독립적으로 흐릅니다.',cost:{rock:10},color:'#81b9d1'},
  liquidVent:{name:'액체 배출구',icon:'water',description:'액체관의 물을 방 안으로 배출합니다.',cost:{metal:8},color:'#75b4cf'}
};
const EPS=1e-9;
const keyFor=layer=>layer==='waste'?'dirtyWater':'cleanWater';
const sourceEnd=(type,layer)=>type==='core'||type==='pump'||type==='steamTurbine'||type==='reservoir'||
  (type==='purifier'?layer==='water':['toilet','sink','cooler'].includes(type)&&layer==='waste');
const at=(g,p)=>p&&g.cell(p.x,p.y);
const index=(g,p)=>p&&g.cell(p.x,p.y)?p.y*g.w+p.x:-1;
function addPacket(c,element,mass,temperature,gas){
  const existing=gas?c.gasPacket:null;
  if(!Number.isFinite(mass)||mass<=0||!Number.isFinite(temperature))return 0;
  if(gas&&existing&&existing.element!==element)return 0;
  if(!gas&&c[element==='dirtyWater'?'cleanWater':'dirtyWater']>EPS)return 0;
  const current=gas?(existing?.mass||0):(c[element]||0),used=Math.max(0,Math.min(mass,(gas?1:10)-current));
  if(!used)return 0;
  const temp=((gas?(existing?.temp??temperature):(c.liquidPacketTemp??temperature))*current+temperature*used)/(current+used);
  if(gas)c.gasPacket={element,mass:current+used,temp};
  else{c[element]+=used;c.liquidPacketTemp=temp;}
  return used;
}
function storeLiquid(b,key,mass,temp){
  if(mass<=0)return;
  const before=b[key]||0,field=key+'Temp';
  b[field]=((b[field]??temp)*before+temp*mass)/(before+mass);
  b[key]=before+mass;
}
function pulse(game,layer,graph,devices){
  const bridges=[],byInput=new Map(),flag=layer==='gas'?'gasPipe':'pipe';
  for(const b of devices){
    if(b.type!==layer+'Bridge'||!b.enabled)continue;
    const from=index(game,buildingPort(b,layer+'In')),to=index(game,buildingPort(b,layer+'Out'));
    b.active=false;b.status='배관 대기';
    if(!game.cells[from]?.[flag]||!game.cells[to]?.[flag])continue;
    bridges.push({from,to});byInput.set(from,b);
  }
  const io=cellConduitAdapter(game.cells,layer);
  io.onBridge=from=>{const b=byInput.get(from);b.active=true;b.status='관 다리 이송 중';};
  advanceConduits(graph,io,bridges);
}

function networkParts(game) {
  const cache=game._packetNetworks;
  if(cache&&cache.cells===game.cells&&cache.revision===game._navRevision&&!game._packetDirty)return cache;
  const result={cells:game.cells,revision:game._navRevision};
  for(const layer of ['gas','liquid']){
    const flag=layer==='gas'?'gasPipe':'pipe',nodes=[],sources=[],sinks=[],devices=[];
    for(let i=0;i<game.cells.length;i++)if(game.cells[i][flag])nodes.push(i);
    for(const b of game.buildings){
      if(b.progress<1)continue;
      const input=index(game,buildingPort(b,layer+'In')),output=index(game,buildingPort(b,layer+'Out'));
      if(input>=0)sinks.push(input);
      if(output>=0)sources.push(output);
      if(input>=0||output>=0)devices.push(b);
    }
    result[layer]={graph:buildConduitGraph(game.w,nodes,sources,sinks),devices};
  }
  game._packetDirty=false;game._packetNetworks=result;return result;
}
function gasIntake(g,b){
  // Try cells in the footprint and its immediate inlet neighborhood. The
  // selected cell supplies a single element; the outlet cannot mix packets.
  const pipe=at(g,buildingPort(b,'gasOut'));
  if(!pipe?.gasPipe)return {reason:'녹색 출구에 기체관 필요'};
  if(g.cell(b.x,b.y).water>=.7)return {reason:'펌프 침수'};
  const points=[[0,0],[0,-1],[1,0],[1,-1],[-1,0],[0,1]];
  for(const [dx,dy] of points){
    const cell=g.cell(b.x+dx,b.y+dy),parcel=cell&&atmosphereOf(cell);
    if(!parcel||cell.solid||g._doorBlocksFluid(b.x+dx,b.y+dy))continue;
    if(pipe.gasPacket&&(pipe.gasPacket.element!==parcel.element||pipe.gasPacket.mass>=1-EPS))continue;
    return {cell,pipe,parcel};
  }
  return {reason:pipe.gasPacket?'출구 패킷 대기':'흡입구 진공'};
}
function stepGases(game,dt){
  const {graph,devices}=networkParts(game).gas;
  for(const b of devices){
    if(!b.enabled)continue;
    if(b.type==='gasPump'&&b.active){
      const inlet=gasIntake(game,b);if(inlet.reason)continue;
      const {cell,pipe,parcel}=inlet,amount=addPacket(pipe,parcel.element,Math.min(.5*dt,parcel.massKg),cell.temp,true);
      takeAtmosphere(cell,amount);
    }
    if(b.type==='gasVent'||b.type==='hydrogenGen'){
      const port=buildingPort(b,'gasIn'),inlet=at(game,port),parcel=inlet?.gasPacket;
      if(!parcel)continue;
      let used=0;
      if(b.type==='gasVent'){
        const room=game.cell(b.x,b.y), total=atmosphereOf(room)?.massKg||0;
        if(total<2)used=emitAtmosphere(game,b.x,b.y,parcel.element,Math.min(1*dt,2-total,parcel.mass),parcel.temp);
        b.active=used>0;b.status=used?'기체 배출 중':'배출구 과압 또는 막힘';
      }else if(parcel.element==='hydrogen'){
        used=Math.min(parcel.mass,1*dt,2-(b.hydrogenBuffer||0));b.hydrogenBuffer=(b.hydrogenBuffer||0)+used;
      }else b.status='연료 입구에 다른 기체 · 배관 확인';
      parcel.mass-=used;if(parcel.mass<=EPS)inlet.gasPacket=null;
    }
  }
  if(pipeDue(game.time,dt,.25)){
    pulse(game,'gas',graph,devices);
  }
}

function stepLiquids(game,dt){
  const {graph,devices}=networkParts(game).liquid;
  for(const b of devices){
    if(!b.enabled||!['reservoir','liquidVent'].includes(b.type))continue;
    const inlet=at(game,buildingPort(b,'liquidIn'));
    if(!inlet?.pipe)continue;
    const key=inlet.dirtyWater>0?'dirtyWater':'cleanWater';
    if(!inlet[key])continue;
    let moved=0;
    if(b.type==='reservoir'){
      moved=Math.min(10*dt,inlet[key],Math.max(0,b.cleanCapacity-b.cleanWater-b.dirtyWater));
      storeLiquid(b,key,moved,inlet.liquidPacketTemp??inlet.temp);
    }else{
      const room=game.cell(b.x,b.y);
      const atmosphere=atmosphereOf(room);
      if(!room.solid&&(!atmosphere||displaceAtmosphereForLiquid(game,room))&&(room.water<=EPS||(room.liquidElement||'cleanWater')===key)){
        moved=Math.min(10*dt,inlet[key],Math.max(0,1-room.water-(room.frost||0))*game.waterKgPerCell);
        if(moved>0){
          const kg=room.water*game.waterKgPerCell;
          room.temp=(room.temp*kg+(inlet.liquidPacketTemp??inlet.temp)*moved)/(kg+moved);
          room.water+=moved/game.waterKgPerCell;
          if(key==='dirtyWater')room.liquidElement=key;else delete room.liquidElement;
        }
      }
      b.status=moved?'물 배출 중':'배출구 막힘';
    }
    inlet[key]-=moved;
  }
  if(!pipeDue(game.time,dt,.75))return;
  pulse(game,'liquid',graph,devices);
  for(const b of devices){
    if(!b.enabled)continue;
    if(!['core','pump','reservoir'].includes(b.type))continue;
    const outlet=at(game,buildingPort(b,'liquidOut'));
    if(!outlet?.pipe)continue;
    const key=b.cleanWater>EPS?'cleanWater':'dirtyWater';
    b[key]-=addPacket(outlet,key,b[key],b[key+'Temp']??game.cell(b.x,b.y).temp,false);
  }
}

export function installPacketPipes(Game){
  const p=Game.prototype;
  const base={canPlace:p.canPlace,queue:p.queue,net:p._fluidNet,amount:p._fluidAmount,space:p._fluidSpace,
    take:p._takeFluid,put:p._putFluid,finish:p._finishUtilities,gas:p._gasProcess,pumpReason:p._gasPumpReason,
    add:p._addBuilding,pump:p._pumpWater,complete:p._completeTask,load:p.load};
  p._addBuilding=function(...args){
    const b=base.add.apply(this,args);
    if(this.modernRules){
      this._packetDirty=true;
      if(b.type==='reservoir')b.cleanCapacity=b.dirtyCapacity=5000;
      if(b.type==='pump')b.dirtyCapacity=b.cleanCapacity;
    }
    return b;
  };
  p._pumpWater=function(b,dt){
    if(!this.modernRules)return base.pump.call(this,b,dt);
    const n=this._fluidNet(b,'water');if(!n)return;
    let left=Math.max(0,Math.min(10*dt,b.cleanCapacity-b.cleanWater-b.dirtyWater));
    for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){
      const c=this.cell(b.x+dx,b.y+dy);if(!c||!c.water||left<=0)continue;
      const key=c.liquidElement==='dirtyWater'?'dirtyWater':'cleanWater';
      const mass=Math.min(left,c.water*this.waterKgPerCell);storeLiquid(b,key,mass,c.temp);left-=mass;
      c.water=Math.max(0,c.water-mass/this.waterKgPerCell);
      if(c.water<=EPS)delete c.liquidElement;
      this.production.pumpedWater+=mass;if(n.network)n.network.input+=mass;
    }
  };
  p._gasProcess=function(dt){return this.modernRules?stepGases(this,dt):base.gas.call(this,dt);};
  p._gasPumpReason=function(b){return this.modernRules?gasIntake(this,b).reason||null:base.pumpReason.call(this,b);};
  p._liquidPort=function(b,layer){return buildingPort(b,sourceEnd(b.type,layer)?'liquidOut':'liquidIn');};
  p._fluidNet=function(b,layer='water'){
    if(!this.modernRules)return base.net.call(this,b,layer);
    if(this._fluidDirty)this._rebuildFluids();
    const pos=this._liquidPort(b,layer),pipe=at(this,pos);
    if(!pipe?.pipe)return null;
    const key=keyFor(layer);
    return {local:true,layer,pipe,key,network:this._fluidNetworks[layer][b[layer==='waste'?'wasteNetworkId':'waterNetworkId']],storage:b.type==='pump'?b:null,capacity:b.type==='pump'?b.cleanCapacity:10};
  };
  p._fluidAmount=function(n){return n?.local?n.pipe[n.key]:base.amount.call(this,n);};
  p._fluidSpace=function(n,except=null){
    if(!n?.local)return base.space.call(this,n,except);
    if(n.storage)return Math.max(0,n.capacity-n.storage.cleanWater-n.storage.dirtyWater);
    return n.pipe[n.key==='cleanWater'?'dirtyWater':'cleanWater']>EPS?0:Math.max(0,10-n.pipe[n.key]);
  };
  p._takeFluid=function(n,amount,b){
    if(!n?.local)return base.take.call(this,n,amount,b);
    const used=Math.min(amount,n.pipe[n.key]);n.pipe[n.key]-=used;if(n.network)n.network.output+=used;
    n.pipe.pipeFlow+=used/(this._utilityDt||.1);return used;
  };
  p._putFluid=function(n,amount,b,except){
    if(!n?.local)return base.put.call(this,n,amount,b,except);
    let used;
    if(n.storage){used=Math.min(amount,this._fluidSpace(n));storeLiquid(n.storage,n.key,used,b?this.cell(b.x,b.y).temp:n.pipe.temp);}
    else used=addPacket(n.pipe,n.key,amount,b?this.cell(b.x,b.y).temp:n.pipe.temp,false);
    if(n.network)n.network.input+=used;return used;
  };
  p.canPlace=function(tool,x,y,rotation){
    if(!this.modernRules&&Object.hasOwn(PIPE_BUILDINGS,tool))return {ok:false,message:'4.3 기지에서 건설할 수 있어요.'};
    if(this.modernRules){
      if(tool==='wastepipe'||tool==='removeWastepipe')return {ok:false,message:'액체관 한 종류로 청수·오수를 이송합니다.'};
      const c=this.cell(x,y);
      if(tool==='removePipe'&&c?.pipe&&(c.cleanWater||c.dirtyWater))return {ok:false,message:'액체관을 비운 뒤 철거하세요.'};
      const b=tool==='deconstruct'&&this._buildingAt(x,y);
      if(b&&b.type!=='core'&&(b.cleanWater>EPS||b.dirtyWater>EPS))return {ok:false,message:'저장된 액체를 출구로 보낸 뒤 철거하세요.'};
    }
    return base.canPlace.call(this,tool,x,y,rotation);
  };
  p.queue=function(tool,x,y,...args){
    const result=base.queue.call(this,tool,x,y,...args);
    if(result.ok)this._packetDirty=true;
    return result;
  };
  p._completeTask=function(t){const result=base.complete.call(this,t);this._packetDirty=true;return result;};
  p._finishUtilities=function(dt){base.finish.call(this,dt);if(this.modernRules){stepLiquids(this,dt);this._syncFluidTotals();}};
  p.load=function(s){
    if(usesModernRules(s?.ruleset)&&Array.isArray(s.cells))for(const c of s.cells){
      if(c.wastepipe||c.cleanWater>0&&c.dirtyWater>0||(c.dirtyWater>0&&!c.pipe))throw new Error('한 액체관에는 한 원소만 저장할 수 있습니다.');
      for(const key of ['gasLastIn','gasLastOut','liquidLastIn','liquidLastOut'])if(key in c&&(!Number.isInteger(c[key])||c[key]<0||c[key]>=s.cells.length))throw new Error('배관 분기 순서가 올바르지 않습니다.');
      if('liquidElement' in c&&!['dirtyWater','cleanWater'].includes(c.liquidElement))throw new Error('바닥 액체 종류가 올바르지 않습니다.');
      if('liquidPacketTemp' in c&&(!Number.isFinite(c.liquidPacketTemp)||c.liquidPacketTemp< -100||c.liquidPacketTemp>300))throw new Error('액체관 온도가 올바르지 않습니다.');
    }
    if(usesModernRules(s?.ruleset)&&Array.isArray(s.buildings))for(const b of s.buildings){
      for(const field of ['cleanWaterTemp','dirtyWaterTemp'])if(field in b&&(!Number.isFinite(b[field])||b[field]< -100||b[field]>300))throw new Error('저장 액체 온도가 올바르지 않습니다.');
      if(b.type==='reservoir'&&b.cleanWater+b.dirtyWater>5000+EPS||b.type==='pump'&&b.cleanWater+b.dirtyWater>20+EPS)throw new Error('액체 저장 용량을 초과했습니다.');
    }
    const result=base.load.call(this,s);this._packetDirty=true;return result;
  };
}
