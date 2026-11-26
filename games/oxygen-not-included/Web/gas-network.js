import { GAS_KG_PER_UNIT, addGasKg } from './environment.js';
import { ORIGINAL_RULES } from './rules.js';

// Web-game gas network. These rates/capacities are simulation choices; only the
// gas pump's 240 W / 0.5 kg/s values are grounded in the installed ONI build.
export const GAS_BUILDINGS = {
  gasPump: {name:'기체 펌프', icon:'pump', description:'현재 칸의 주된 기체를 최대 0.5 kg/s로 기체관에 보냅니다.', cost:{rock:12,metal:8}, power:240, unlock:20, color:'#7fc4e8'},
  gasVent: {name:'기체 배출구', icon:'vent', description:'연결된 기체관의 기체를 주변 칸으로 배출합니다.', cost:{rock:8,metal:5}, color:'#84d0bf'}
};

const DIRECTIONS = [[1,0],[-1,0],[0,1],[0,-1]];
const VALID_GASES = new Set(['oxygen','co2','steam','hydrogen']);
const PIPE_CAPACITY_KG = 1;
const PUMP_RATE_KG_S = .5;
const TRANSFER_RATE_KG_S = 1;
const GENERATOR_BUFFER_KG = 2;
const VENT_PRESSURE_KG = 2;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const pipeMass = c => c?.gasPacket?.mass || 0;

export function installGasNetwork(Game) {
  const proto = Game.prototype;
  const base = {
    canPlace: proto.canPlace,
    queue: proto.queue,
    reset: proto.reset,
    utilityReady: proto._utilityReady,
    finishUtilities: proto._finishUtilities,
    addBuilding: proto._addBuilding,
    complete: proto._completeTask,
    load: proto.load,
    inspect: proto.inspect
  };

  proto._gasNetworks = function() {
    const cached=this._gasTopologyCache;
    if(cached&&!this._gasTopologyDirty&&cached.cells===this.cells)return cached.topology;
    const components = [], byIndex = new Map(), seen = new Set();
    for (let i=0;i<this.cells.length;i++) {
      if (!this.cells[i].gasPipe || seen.has(i)) continue;
      const cells=[], queue=[i]; seen.add(i);
      for (let head=0;head<queue.length;head++) {
        const at=queue[head], x=at%this.w, y=Math.floor(at/this.w);
        cells.push(at); byIndex.set(at,components.length);
        for (const [dx,dy] of DIRECTIONS) {
          const nx=x+dx, ny=y+dy, next=ny*this.w+nx, c=this.cell(nx,ny);
          if (c?.gasPipe&&!seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
      components.push({cells});
    }
    const topology={components,byIndex};
    this._gasTopologyCache={cells:this.cells,topology};this._gasTopologyDirty=false;
    return topology;
  };
  proto._gasNetworkAt = function(x,y,topology=this._gasNetworks()) {
    const c=this.cell(x,y); if(!c?.gasPipe) return null;
    const id=topology.byIndex.get(y*this.w+x);
    return id===undefined?null:topology.components[id];
  };
  proto._gasBuildingsAt = function(network,types=null) {
    if(!network)return [];
    const indexes=new Set(network.cells);
    return this.buildings.filter(b=>b.progress>=1&&indexes.has(b.y*this.w+b.x)&&(!types||types.includes(b.type)));
  };
  proto._gasAmbientSpace = function(cell) {
    if(!cell||cell.solid)return 0;
    return Math.max(0,VENT_PRESSURE_KG-(cell.hydrogen||0)-(cell.steam||0)-((cell.oxygen||0)+(cell.co2||0))*GAS_KG_PER_UNIT);
  };
  proto.hydrogenOutputSpace = function(b,reservedKg=0) {
    if(!b||!finite(reservedKg)||reservedKg<0)return 0;
    return Math.max(0,this._gasAmbientSpace(this.cell(b.x,b.y))-reservedKg);
  };
  proto.emitHydrogen = function(b,kg,tempC) {
    if(!b||!finite(kg)||kg<=0||!finite(tempC))return 0;
    const c=this.cell(b.x,b.y);if(!c)return 0;
    const amount=Math.min(kg,this._gasAmbientSpace(c));
    if(amount>0)addGasKg(c,'hydrogen',amount,tempC,this.waterKgPerCell);
    return amount;
  };
  proto.hydrogenFuelAt = function(b) {
    if(!b)return 0;
    // Only staged fuel at the generator is immediately available; pipe packets
    // must arrive through finite per-cell transport before they can be burned.
    return b.hydrogenBuffer||0;
  };
  proto.takeHydrogen = function(b,kg) {
    if(!b||!finite(kg)||kg<=0)return 0;
    const taken=Math.min(kg,b.hydrogenBuffer||0);
    b.hydrogenBuffer=Math.max(0,(b.hydrogenBuffer||0)-taken);
    return taken;
  };
  proto.storedHydrogenKg = function() {
    return this.cells.reduce((s,c)=>s+(c.gasPacket?.element==='hydrogen'?pipeMass(c):0),0)
      +this.buildings.reduce((s,b)=>s+(b.hydrogenBuffer||0),0);
  };

  proto.canPlace = function(tool,x,y) {
    if(tool==='gaspipe'||tool==='removeGasPipe') {
      const c=this.cell(x,y);
      if(!c||!c.revealed)return{ok:false,message:'탐사한 지도 안의 칸을 선택하세요.'};
      if(this.lost)return{ok:false,message:'새 기지를 시작하거나 저장을 불러오세요.'};
      if(tool==='removeGasPipe') {
        if(!c.gasPipe)return{ok:false,message:'해당 기체관이 없어요.'};
        if(pipeMass(c)>1e-8)return{ok:false,message:'관 속 기체를 먼저 배출하거나 사용하세요.'};
        return{ok:true,message:'기체관을 철거하고 금속 1을 회수합니다.'};
      }
      if(!this.originalRules)return{ok:false,message:'기체관은 원작 규칙 기지에서만 설치할 수 있어요.'};
      if(c.gasPipe)return{ok:false,message:'이미 기체관이 있어요.'};
      if(c.solid==='bedrock')return{ok:false,message:'기반암에는 설치할 수 없어요.'};
      return{ok:this.resources.metal>=1,message:this.resources.metal>=1?'금속 1로 기체관을 즉시 설치합니다.':'금속이 부족해요.'};
    }
    if(['gasPump','gasVent'].includes(tool)&&!this.originalRules)
      return{ok:false,message:'기체 설비는 원작 규칙 기지에서만 설치할 수 있어요.'};
    const result=base.canPlace.call(this,tool,x,y);
    if(result.ok&&tool==='deconstruct') {
      const b=this._buildingAt(x,y);
      if(b?.type==='hydrogenGen'&&(b.hydrogenBuffer||0)>1e-9&&this._gasAmbientSpace(this.cell(x,y))+1e-9<(b.hydrogenBuffer||0))
        return{ok:false,message:'발전기 내부 수소를 주변으로 배출할 공간이 필요해요.'};
    }
    return result;
  };
  proto.queue = function(tool,x,y) {
    if(tool==='gaspipe'||tool==='removeGasPipe') {
      const result=this.canPlace(tool,x,y);if(!result.ok)return result;
      const c=this.cell(x,y);
      if(tool==='gaspipe'){c.gasPipe=true;c.gasPacket=null;this._gasTopologyDirty=true;this._pay({metal:1},-1);}
      else {c.gasPipe=false;c.gasPacket=null;this._gasTopologyDirty=true;this._pay({metal:1},1);}
      this._syncCommunity?.();
      return result;
    }
    return base.queue.call(this,tool,x,y);
  };

  proto._gasExtractAtPump = function(b,dt,topology) {
    const c=this.cell(b.x,b.y),network=this._gasNetworkAt(b.x,b.y,topology);
    if(!c||!c.gasPipe||!network||b.progress<1||!b.enabled||!b.connected||!b.active)return;
    const options=[['oxygen',Math.max(0,c.oxygen)*GAS_KG_PER_UNIT],['co2',Math.max(0,c.co2)*GAS_KG_PER_UNIT],['steam',Math.max(0,c.steam||0)],['hydrogen',Math.max(0,c.hydrogen||0)]];
    options.sort((a,b)=>b[1]-a[1]);
    const [element,available]=options[0]||[];
    if(!element||available<=1e-9||c.gasPacket&&c.gasPacket.element!==element||pipeMass(c)>=PIPE_CAPACITY_KG-1e-9)return;
    const pipeIndex=b.y*this.w+b.x;
    const moved=Math.min(PUMP_RATE_KG_S*dt,available,PIPE_CAPACITY_KG-pipeMass(c),this._gasInRemaining?.get(pipeIndex)??PUMP_RATE_KG_S*dt);
    if(moved>0) {
      if(c.gasPacket){const total=c.gasPacket.mass+moved;c.gasPacket.temp=(c.gasPacket.temp*c.gasPacket.mass+c.temp*moved)/total;c.gasPacket.mass=total;}
      else c.gasPacket={element,mass:moved,temp:c.temp};
    }
    if(this._gasInRemaining)this._gasInRemaining.set(pipeIndex,Math.max(0,(this._gasInRemaining.get(pipeIndex)||0)-moved));
    if(element==='oxygen'||element==='co2')c[element]=Math.max(0,c[element]-moved/GAS_KG_PER_UNIT);
    else c[element]=Math.max(0,c[element]-moved);
    b.active=moved>0;b.status=moved>0?`기체 펌핑 · ${(moved/dt).toFixed(2)} kg/s`:'관 용량 가득 참';
  };
  proto._gasPumpReason = function(b) {
    const c=this.cell(b.x,b.y);
    if(!c?.gasPipe)return '기체관 연결 필요';
    if(c.water>=.7)return '본체 침수';
    const options=[['oxygen',Math.max(0,c.oxygen)*GAS_KG_PER_UNIT],['co2',Math.max(0,c.co2)*GAS_KG_PER_UNIT],['steam',Math.max(0,c.steam||0)],['hydrogen',Math.max(0,c.hydrogen||0)]];
    options.sort((a,b)=>b[1]-a[1]);
    const [element,available]=options[0]||[];
    if(!element||available<=1e-9)return '흡입구 진공';
    if(c.gasPacket&&c.gasPacket.element!==element)return `관 흡입구 막힘 · ${c.gasPacket.element} 잔류`;
    if(pipeMass(c)>=PIPE_CAPACITY_KG-1e-9)return '관 가득 참';
    return null;
  };
  proto._utilityReady = function(b,dt) {
    const inherited=base.utilityReady?.call(this,b,dt);
    if(inherited)return inherited;
    return b?.type==='gasPump'?this._gasPumpReason(b):null;
  };
  proto._gasTargetDistances = function(network,targets,blockedElement=null) {
    const allowed=new Set(network.cells), distance=new Map(), queue=[];
    for(const i of targets){if(allowed.has(i)&&(!blockedElement||!this.cells[i].gasPacket||this.cells[i].gasPacket.element===blockedElement)){distance.set(i,0);queue.push(i);}}
    for(let head=0;head<queue.length;head++){
      const i=queue[head],x=i%this.w,y=Math.floor(i/this.w),nextDistance=distance.get(i)+1;
      for(const[dx,dy]of DIRECTIONS){const nx=x+dx,ny=y+dy,j=ny*this.w+nx,dest=this.cells[j];if(allowed.has(j)&&!distance.has(j)&&(!blockedElement||!dest.gasPacket||dest.gasPacket.element===blockedElement)){distance.set(j,nextDistance);queue.push(j);}}
    }
    return distance;
  };
  proto._gasProcess = function(dt) {
    if(!this.originalRules)return;
    const topology=this._gasNetworks();
    this._gasInRemaining=new Map();this._gasOutRemaining=new Map();
    for(const network of topology.components)for(const i of network.cells){this._gasInRemaining.set(i,TRANSFER_RATE_KG_S*dt);this._gasOutRemaining.set(i,TRANSFER_RATE_KG_S*dt);}
    for(const b of this.buildings)if(b.type==='gasPump')this._gasExtractAtPump(b,dt,topology);
    for(const network of topology.components) {
      const attached=this._gasBuildingsAt(network),vents=attached.filter(b=>b.type==='gasVent'&&b.enabled),generators=attached.filter(b=>b.type==='hydrogenGen'&&b.enabled);
      // Devices connect only when their own tile carries a pipe. Vents accept every species;
      // generators stage hydrogen only, and never consume oxygen/CO2/steam packets.
      for(const b of vents) {
        const c=this.cell(b.x,b.y),p=c?.gasPacket;if(!p)continue;
        const i=b.y*this.w+b.x,remaining=this._gasOutRemaining.get(i)||0;
        const accepted=Math.min(p.mass,remaining,this._gasAmbientSpace(c));
        this._gasOutRemaining.set(i,Math.max(0,remaining-accepted));
        addGasKg(c,p.element,accepted,p.temp,this.waterKgPerCell);p.mass-=accepted;if(p.mass<=1e-9)c.gasPacket=null;
        b.active=accepted>0;b.status=accepted>0?'기체 배출 중':'대기';
      }
      for(const b of generators) {
        const c=this.cell(b.x,b.y),p=c?.gasPacket;
        b.hydrogenBuffer=clamp(b.hydrogenBuffer||0,0,GENERATOR_BUFFER_KG);
        if(p?.element==='hydrogen'&&b.hydrogenBuffer<GENERATOR_BUFFER_KG) {
          const i=b.y*this.w+b.x,remaining=this._gasOutRemaining.get(i)||0;
          const accepted=Math.min(p.mass,GENERATOR_BUFFER_KG-b.hydrogenBuffer,remaining);
          this._gasOutRemaining.set(i,Math.max(0,remaining-accepted));
          b.hydrogenBuffer+=accepted;p.mass-=accepted;if(p.mass<=1e-9)c.gasPacket=null;
        }
      }
      const snapshot=network.cells.map(i=>({i,packet:this.cells[i].gasPacket?{...this.cells[i].gasPacket}:null}));
      const availableGenerators=generators.filter(b=>(b.hydrogenBuffer||0)<GENERATOR_BUFFER_KG-1e-9);
      const generatorDistances=availableGenerators.length?this._gasTargetDistances(network,availableGenerators.map(b=>b.y*this.w+b.x),'hydrogen'):null;
      const ventDistances=vents.length?this._gasTargetDistances(network,vents.map(b=>b.y*this.w+b.x)):null;
      for(const {i,packet} of snapshot) {
        if(!packet||packet.mass<=1e-9)continue;
        const distance=packet.element==='hydrogen'&&generatorDistances?.has(i)?generatorDistances:ventDistances;
        if(!distance)continue;
        const x=i%this.w,y=Math.floor(i/this.w),currentDistance=distance.get(i);
        if(currentDistance===undefined||currentDistance===0)continue;
        let target=null,targetIndex=-1,best=currentDistance;
        for(const[dx,dy]of DIRECTIONS){const nx=x+dx,ny=y+dy,j=ny*this.w+nx,d=distance.get(j),dest=this.cell(nx,ny);if(d===undefined||d>=best||dest.gasPacket&&dest.gasPacket.element!==packet.element||pipeMass(dest)>=PIPE_CAPACITY_KG-1e-9)continue;best=d;target=dest;targetIndex=j;}
        if(!target)continue;
        const source=this.cells[i],live=source.gasPacket;if(!live||live.element!==packet.element)continue;
        const sourceRemaining=this._gasOutRemaining.get(i)||0,targetRemaining=this._gasInRemaining.get(targetIndex)||0;
        const amount=Math.min(packet.mass,live.mass,sourceRemaining,targetRemaining,PIPE_CAPACITY_KG-pipeMass(target));
        if(amount<=1e-9)continue;
        if(target.gasPacket){const total=target.gasPacket.mass+amount;target.gasPacket.temp=(target.gasPacket.temp*target.gasPacket.mass+live.temp*amount)/total;target.gasPacket.mass=total;}
        else target.gasPacket={element:live.element,mass:amount,temp:live.temp};
        live.mass-=amount;if(live.mass<=1e-9)source.gasPacket=null;
        this._gasOutRemaining.set(i,Math.max(0,sourceRemaining-amount));this._gasInRemaining.set(targetIndex,Math.max(0,targetRemaining-amount));
      }
    }
    this._gasInRemaining=null;this._gasOutRemaining=null;
  };

  proto._finishUtilities = function(dt) {
    base.finishUtilities?.call(this,dt);
    this._gasProcess(dt);
  };
  proto.reset = function(...args) {
    const result=base.reset.apply(this,args);
    this._gasTopologyDirty=true;this._gasTopologyCache=null;
    return result;
  };
  proto._addBuilding = function(...args) {
    const b=base.addBuilding.apply(this,args);
    if(b.type==='hydrogenGen')b.hydrogenBuffer=0;
    return b;
  };
  proto._completeTask = function(task) {
    const b=task.type==='deconstruct'?this._buildingAt(task.x,task.y):null;
    const hydrogen=b?.type==='hydrogenGen'?(b.hydrogenBuffer||0):0;
    const result=base.complete.call(this,task);
    if(hydrogen>0&&b&&!this.buildings.includes(b))addGasKg(this.cell(task.x,task.y),'hydrogen',hydrogen,this.cell(task.x,task.y).temp,this.waterKgPerCell);
    return result;
  };
  proto.load = function(raw) {
    if(!raw||typeof raw!=='object')return base.load.call(this,raw);
    const saved=JSON.parse(JSON.stringify(raw));
    const original=saved.ruleset===ORIGINAL_RULES;
    if(Array.isArray(saved.cells))for(const c of saved.cells) {
      if('gasPipe' in c&&typeof c.gasPipe!=='boolean')throw new Error('기체관 상태가 올바르지 않습니다.');
      if('gasPacket' in c&&c.gasPacket!==null&&(!c.gasPipe||!c.gasPacket||!VALID_GASES.has(c.gasPacket.element)||!finite(c.gasPacket.mass)||c.gasPacket.mass<=0||c.gasPacket.mass>PIPE_CAPACITY_KG+1e-8||!finite(c.gasPacket.temp)||c.gasPacket.temp< -100||c.gasPacket.temp>300))throw new Error('기체관 저장량 또는 온도가 올바르지 않습니다.');
      if(!original&&((c.gasPipe===true)||(c.gasPacket!=null)||(c.hydrogen||0)>0))throw new Error('구버전 규칙 저장에는 원작 전용 기체 상태가 없습니다.');
    }
    if(Array.isArray(saved.buildings))for(const b of saved.buildings) {
      if(Object.hasOwn(b,'hydrogenBuffer')&&(!finite(b.hydrogenBuffer)||b.hydrogenBuffer<0||b.hydrogenBuffer>GENERATOR_BUFFER_KG+1e-8))throw new Error('발전기 수소 저장량이 올바르지 않습니다.');
      if((b.hydrogenBuffer||0)>1e-9&&(b.type!=='hydrogenGen'||b.progress<1))throw new Error('완공된 수소 발전기만 내부 수소를 저장할 수 있습니다.');
      if(!original&&(b.type==='gasPump'||b.type==='gasVent'||(b.hydrogenBuffer||0)>0))throw new Error('구버전 규칙 저장에 원작 전용 기체 설비가 있습니다.');
    }
    const ok=base.load.call(this,saved);if(ok!==false){this._gasTopologyDirty=true;this._gasTopologyCache=null;}return ok;
  };
  proto.inspect = function(x,y) {
    const result=base.inspect.call(this,x,y),c=this.cell(x,y);
    if(c?.gasPipe)result.lines.push(c.gasPacket?`기체관 ${c.gasPacket.element} ${c.gasPacket.mass.toFixed(3)} / 1 kg`:'기체관 비어 있음');
    const b=result.building;
    if(b?.type==='hydrogenGen')result.lines.push(`기체 수소 ${this.hydrogenFuelAt(b).toFixed(3)} kg · 내부 ${Number(b.hydrogenBuffer||0).toFixed(3)} kg`);
    return result;
  };
}
