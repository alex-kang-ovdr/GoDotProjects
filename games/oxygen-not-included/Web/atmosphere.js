import { ELEMENTS } from './elements.js';

// 4.3 stores one atmospheric element per cell. Oxygen and CO2 retain the
// historic UI/save unit; this module exposes their mass in kilograms.
export const ATMOSPHERE_FIELDS = Object.freeze(['oxygen','co2','hydrogen','steam']);
export const MAX_ATMOSPHERE_KG = 10;
const RESTORED_MAX_ATMOSPHERE_KG = 1_000_000; // web safety bound; native isolated O2 probes were measured through this value
const MASS_PER_UNIT = .5328;
const SPECIFIC_HEAT = Object.freeze({
  oxygen:ELEMENTS.Oxygen.specificHeatCapacity,
  co2:ELEMENTS.CarbonDioxide.specificHeatCapacity,
  hydrogen:ELEMENTS.Hydrogen.specificHeatCapacity,
  steam:ELEMENTS.Steam.specificHeatCapacity
});
const DIRECTIONS=[[0,-1],[1,0],[0,1],[-1,0]];
const EPS=1e-10;
const MIN_RESTORED_GAS_MASS_KG=Math.fround(1e-9);
// Installed gas.yaml flow values; the Oxygen coefficient is also confirmed
// by native 4.4 transfer of 2 kg into vacuum at 0.2 s: 0.12 * (2 - 0).
const RESTORED_GAS_FLOW=Object.freeze({oxygen:.12,co2:.1,hydrogen:.1,steam:.1});
const fieldMass=(cell,field)=>Math.max(0,Number(cell?.[field])||0)*(field==='oxygen'||field==='co2'?MASS_PER_UNIT:1);
const unitsFor=(field,kg)=>kg/(field==='oxygen'||field==='co2'?MASS_PER_UNIT:1);
const maxAtmosphereKg=game=>game?.restoredRules?RESTORED_MAX_ATMOSPHERE_KG:MAX_ATMOSPHERE_KG;

export function atmosphereOf(cell) {
  if(!cell)return null;
  for(const element of ATMOSPHERE_FIELDS){const massKg=fieldMass(cell,element);if(massKg>EPS)return{element,massKg};}
  return null;
}

function validElement(element){return ATMOSPHERE_FIELDS.includes(element);}
function usableCell(cell){return !!cell&&!cell.solid&&(cell.water||0)<=EPS&&(cell.frost||0)<=EPS;}
function gasRoomKg(game,cell,element){
  if(!usableCell(cell)||!validElement(element))return 0;
  const current=atmosphereOf(cell);
  if(current&&current.element!==element)return 0;
  return Math.max(0,maxAtmosphereKg(game)-(current?.massKg||0));
}

function adjacentCells(game,cell,eligible=usableCell){
  if(!game||!cell)return[];
  let x=cell.x,y=cell.y;
  if(!Number.isInteger(x)||!Number.isInteger(y)){const index=game.cells.indexOf(cell);if(index<0)return[];x=index%game.w;y=Math.floor(index/game.w);}
  const out=[];
  for(const[dx,dy]of DIRECTIONS){const nx=x+dx,ny=y+dy,c=game.cell(nx,ny);if(c&&eligible(c)&&!game._doorBlocksFluid?.(nx,ny)&&!game._doorBlocksFluid?.(x,y))out.push(c);}
  return out;
}

function planLiquidDisplacement(game,cell){
  const waterKgPerCell=game?.waterKgPerCell||1000;
  if(!cell||cell.frost>EPS||cell.water<=EPS)return cell?.frost>EPS?null:[];
  const dirty=cell.liquidElement==='dirtyWater';let remaining=cell.water*waterKgPerCell;const plan=[];
  for(const dest of adjacentCells(game,cell,c=>!c.solid&&!atmosphereOf(c)&&!(c.frost>EPS))){
    const destDirty=dest.liquidElement==='dirtyWater';
    if(dest.water>EPS&&destDirty!==dirty)continue;
    const room=Math.max(0,(1-dest.water-(dest.frost||0))*waterKgPerCell),amount=Math.min(remaining,room);
    if(amount>EPS)plan.push({cell:dest,amountKg:amount});
    remaining-=amount;if(remaining<=EPS)return plan;
  }
  return null;
}

function applyLiquidDisplacement(game,cell){
  const plan=planLiquidDisplacement(game,cell);if(!plan)return false;
  if(!plan.length)return true;
  const waterKgPerCell=game.waterKgPerCell||1000,dirty=cell.liquidElement==='dirtyWater',temp=cell.temp;
  cell.water=0;delete cell.liquidElement;
  for(const item of plan){
    const dest=item.cell,oldMass=dest.water*waterKgPerCell,capacity=.05+oldMass*ELEMENTS.Water.specificHeatCapacity;
    const incoming=item.amountKg*ELEMENTS.Water.specificHeatCapacity;
    dest.temp=(dest.temp*capacity+temp*incoming)/(capacity+incoming||1);
    dest.water+=item.amountKg/waterKgPerCell;
    if(dirty)dest.liquidElement='dirtyWater';else if(dest.water<=item.amountKg/waterKgPerCell+EPS)delete dest.liquidElement;
  }
  return true;
}

function planDisplacement(game,cell,gasElement){
  const existing=atmosphereOf(cell);if(!existing||existing.element===gasElement)return[];
  let remaining=existing.massKg;const plan=[];
  for(const dest of adjacentCells(game,cell)){
    const at=atmosphereOf(dest);if(at&&at.element!==existing.element)continue;
    const amount=Math.min(remaining,Math.max(0,maxAtmosphereKg(game)-(at?.massKg||0)));
    if(amount>EPS)plan.push({cell:dest,amountKg:amount});
    remaining-=amount;if(remaining<=EPS)return plan;
  }
  return null;
}

function applyDisplacement(game,cell,gasElement,tempC){
  const existing=atmosphereOf(cell);if(!existing||existing.element===gasElement)return true;
  const plan=planDisplacement(game,cell,gasElement);if(!plan)return false;
  const removed=takeAtmosphere(cell,existing.massKg);
  if(removed+EPS<existing.massKg)return false;
  for(const item of plan){const accepted=addAtmosphere(game,item.cell,existing.element,item.amountKg,cell.temp);if(accepted+EPS<item.amountKg)throw new Error('Atmosphere displacement plan was not atomic.');}
  return true;
}

export function displaceAtmosphereForLiquid(game,cell){
  if(!cell||cell.solid)return false;
  return applyDisplacement(game,cell,null,cell.temp);
}

export function atmosphereSpaceKg(game,cell,element) {
  if(!cell||cell.solid||!validElement(element))return 0;
  const liquidDisplacement=!usableCell(cell);
  if(liquidDisplacement&&!planLiquidDisplacement(game,cell))return 0;
  if(gasRoomKg(game,cell,element)>EPS)return gasRoomKg(game,cell,element);
  const existing=atmosphereOf(cell);
  if(existing&&existing.element!==element&&planDisplacement(game,cell,element))return maxAtmosphereKg(game);
  if(liquidDisplacement)return existing?.element===element?Math.max(0,maxAtmosphereKg(game)-existing.massKg):maxAtmosphereKg(game);
  return 0;
}

export function atmosphereSpaceNearKg(game,x,y,element) {
  const origin=game?.cell(x,y);if(!origin)return 0;
  return [origin,...adjacentCells(game,origin)].reduce((sum,cell)=>sum+atmosphereSpaceKg(game,cell,element),0);
}

export function addAtmosphere(game,cell,element,kg,tempC=cell?.temp) {
  if(!cell||cell.solid||!validElement(element)||!Number.isFinite(kg)||kg<=0||!Number.isFinite(tempC))return 0;
  if(!usableCell(cell)&&!applyLiquidDisplacement(game,cell))return 0;
  if(!usableCell(cell))return 0;
  if(atmosphereOf(cell)?.element&&atmosphereOf(cell).element!==element&&!applyDisplacement(game,cell,element,tempC))return 0;
  const current=atmosphereOf(cell),room=Math.max(0,maxAtmosphereKg(game)-(current?.massKg||0));
  const accepted=Math.min(kg,room);if(accepted<=EPS)return 0;
  const oldMass=current?.massKg||0,oldTemp=cell.temp,cp=SPECIFIC_HEAT[element];
  const oldCp=.05+oldMass*(SPECIFIC_HEAT[current?.element]||cp),incomingCp=accepted*cp;
  cell.temp=(oldTemp*oldCp+tempC*incomingCp)/(oldCp+incomingCp||1);
  cell[element]=(cell[element]||0)+unitsFor(element,accepted);
  return accepted;
}

export function emitAtmosphere(game,x,y,element,kg,tempC) {
  if(!game||!validElement(element)||!Number.isFinite(kg)||kg<=0)return 0;
  const origin=game.cell(x,y);if(!origin)return 0;
  let remaining=kg,accepted=0;
  const candidates=[...(game._doorBlocksFluid?.(x,y)?[]:[origin]),...adjacentCells(game,origin)];
  for(const cell of candidates){
    if(remaining<=EPS)break;
    const can=atmosphereSpaceKg(game,cell,element);if(can<=EPS)continue;
    const moved=addAtmosphere(game,cell,element,Math.min(remaining,can),tempC);
    remaining-=moved;accepted+=moved;
  }
  return accepted;
}

function emitAtmosphereNeighbors(game,x,y,element,kg,tempC){
  const origin=game?.cell(x,y);if(!origin)return 0;let remaining=kg,accepted=0;
  const candidates=adjacentCells(game,origin).sort((a,b)=>{
    const score=c=>{const state=atmosphereOf(c);return !state||state.element===element?0:1;};return score(a)-score(b);
  });
  for(const cell of candidates){
    if(remaining<=EPS)break;
    const can=atmosphereSpaceKg(game,cell,element);if(can<=EPS)continue;
    const moved=addAtmosphere(game,cell,element,Math.min(remaining,can),tempC);remaining-=moved;accepted+=moved;
  }
  return accepted;
}

// Preview a set of simultaneous machine outputs on a local shadow of the grid.
// Nothing is committed unless every requested product can be emitted in full.
export function emitAtmosphereBatch(game,emissions) {
  if(!game||!Array.isArray(emissions)||!emissions.length)return 0;
  const cells=game.cells.slice(),touched=new Set();
  for(const e of emissions){
    if(!Number.isInteger(e.x)||!Number.isInteger(e.y)||!validElement(e.element)||!Number.isFinite(e.kg)||e.kg<0||!Number.isFinite(e.tempC))return 0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=e.x+dx,y=e.y+dy,index=y*game.w+x,c=game.cell(x,y);
      if(c&&!touched.has(index)){cells[index]={...c};touched.add(index);}
    }
  }
  const shadow={...game,restoredRules:!!game.restoredRules,cells,_doorBlocksFluid:(x,y)=>game._doorBlocksFluid?.(x,y)||false,cell(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<this.w&&y<this.h?cells[y*this.w+x]:null;}};
  let scale=1;
  for(const e of emissions){if(e.kg<=EPS)continue;const accepted=emitAtmosphere(shadow,e.x,e.y,e.element,e.kg,e.tempC);scale=Math.min(scale,accepted/e.kg);}
  if(scale<1-1e-9)return Math.max(0,scale);
  for(const i of touched){
    const source=cells[i],target=game.cells[i];
    for(const field of ATMOSPHERE_FIELDS)target[field]=source[field]||0;
    target.temp=source.temp;target.water=source.water;
    if(source.liquidElement)target.liquidElement=source.liquidElement;else delete target.liquidElement;
  }
  return 1;
}

export function takeAtmosphere(cell,kg) {
  if(!cell||!Number.isFinite(kg)||kg<=0)return 0;
  const state=atmosphereOf(cell);if(!state)return 0;
  const amount=Math.min(kg,state.massKg);
  cell[state.element]=Math.max(0,(cell[state.element]||0)-unitsFor(state.element,amount));
  if(fieldMass(cell,state.element)<=EPS)cell[state.element]=0;
  return amount;
}

export function recordRespirationCO2(game,crew,cell,x,y,oxygenUsedKg) {
  if(!crew||!cell||!Number.isFinite(oxygenUsedKg)||oxygenUsedKg<=0)return 0;
  const pending=Math.max(0,crew.co2BufferKg||0)+oxygenUsedKg*.02;
  const emitted=emitAtmosphereNeighbors(game,x,y,'co2',pending,cell.temp);
  crew.co2BufferKg=Math.max(0,pending-emitted);
  return emitted;
}

export function canBreatheAtmosphere(cell) {
  const state=atmosphereOf(cell);
  return !!state&&state.element==='oxygen'&&state.massKg>=.16*MASS_PER_UNIT;
}

function transfer(game,from,to,state,amount){
  const accepted=Math.min(amount,gasRoomKg(game,to,state.element));if(accepted<=EPS)return 0;
  const added=addAtmosphere(game,to,state.element,accepted,from.temp);if(added<=EPS)return 0;
  takeAtmosphere(from,added);return added;
}

function exchangePair(game,a,b,vertical,dt){
  if(!usableCell(a)||!usableCell(b))return;
  const left=atmosphereOf(a),right=atmosphereOf(b);
  if(!left&&!right)return;
  if(left&&right&&left.element!==right.element)return;
  const state=left||right,top=left?.massKg||0,bottom=right?.massKg||0;
  let flow=(top-bottom)*.32*dt;
  if(vertical&&state.element==='co2')flow+=top*.06*dt;
  if(vertical&&state.element==='hydrogen')flow-=bottom*.75*dt;
  if(vertical&&state.element==='steam')flow-=bottom*.09*dt;
  if(flow>EPS)transfer(game,a,b,state,Math.min(flow,top));
  else if(flow< -EPS)transfer(game,b,a,state,Math.min(-flow,bottom));
}

function restoredElement(cell){
  const state=atmosphereOf(cell);
  return state&&state.massKg>=MIN_RESTORED_GAS_MASS_KG?state:null;
}

const RESTORED_MOLAR_MASS=Object.freeze({
  oxygen:ELEMENTS.Oxygen.molarMass,
  co2:ELEMENTS.CarbonDioxide.molarMass,
  hydrogen:ELEMENTS.Hydrogen.molarMass,
  steam:ELEMENTS.Steam.molarMass
});
function densitySample(seed,index,tick){
  let value=(seed>>>0)^Math.imul(index+1,0x9e3779b1)^Math.imul(tick,0x85ebca6b);
  value^=value>>>16;value=Math.imul(value,0x7feb352d);value^=value>>>15;
  value=Math.imul(value,0x846ca68b);value^=value>>>16;
  return value>>>0;
}

function stepRestoredGas(game,dt){
  const {w,h,cells}=game;
  const before=cells.map(cell=>{
    const state=restoredElement(cell);
    return {element:state?.element||null,massKg:state?.massKg||0,tempC:cell.temp};
  });
  const edges=[];
  const blocked=i=>{const door=game._doorMap?.get(i);return !!door&&!door.doorOpen;};
  const addEdge=(a,b)=>{
    if(blocked(a)||blocked(b)||!usableCell(cells[a])||!usableCell(cells[b]))return;
    const left=before[a],right=before[b];
    if(left.element&&right.element&&left.element!==right.element)return;
    const element=left.element||right.element;if(!element)return;
    const difference=left.massKg-right.massKg;if(Math.abs(difference)<=MIN_RESTORED_GAS_MASS_KG)return;
    const moved=Math.abs(difference)*RESTORED_GAS_FLOW[element]*Math.max(0,dt)/.2;
    if(moved<=MIN_RESTORED_GAS_MASS_KG)return;
    edges.push(difference>0?{from:a,to:b,element,massKg:moved}:{from:b,to:a,element,massKg:moved});
  };
  const addDiagonal=(a,b,corner1,corner2)=>{
    if(!usableCell(cells[corner1])||!usableCell(cells[corner2])||blocked(corner1)||blocked(corner2))return;
    addEdge(a,b);
  };
  // Native 4.4 applies one snapshot-based flux on each orthogonal edge.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(x+1<w)addEdge(i,i+1);
    if(y+1<h)addEdge(i,i+w);
  }
  // A single diagonal orientation alternates each processed 0.2 s frame.
  const tick=Math.max(1,Math.round(game.time/.2));
  for(let y=0;y+1<h;y++)for(let x=0;x+1<w;x++){
    const northwest=y*w+x,northeast=northwest+1,southwest=northwest+w,southeast=southwest+1;
    if(tick%2===1){ // NE ↔ SW; both orthogonal routes through the corner must be open.
      addDiagonal(northeast,southwest,northwest,southeast);
    } else { // NW ↔ SE, y-down coordinates.
      addDiagonal(northwest,southeast,northeast,southwest);
    }
  }
  // A vacuum cell receiving from several donors selects the first donor on
  // its first fill. Once occupied, the ordinary simultaneous exchange applies.
  const vacuumWriters=new Set();
  const acceptedEdges=edges.filter(edge=>before[edge.to].element);
  const vacuumCandidates=edges.filter(edge=>!before[edge.to].element).sort((a,b)=>{
    const ay=Math.floor(a.from/w),by=Math.floor(b.from/w);
    return by-ay||(a.from%w)-(b.from%w)||(a.to-b.to);
  });
  for(const edge of vacuumCandidates){if(vacuumWriters.has(edge.to))continue;vacuumWriters.add(edge.to);acceptedEdges.push(edge);}
  // Each edge reads the pre-update frame. Scale only if a donor has more
  // simultaneous outgoing flux than its recorded mass.
  const requestedOut=new Float64Array(cells.length),outgoing=new Float64Array(cells.length),incoming=new Float64Array(cells.length),heatIn=new Float64Array(cells.length),heatOut=new Float64Array(cells.length),elementByCell=before.map(c=>c.element);
  for(const edge of acceptedEdges)requestedOut[edge.from]+=edge.massKg;
  for(const edge of acceptedEdges){
    const available=before[edge.from].massKg,scale=requestedOut[edge.from]>available?available/requestedOut[edge.from]:1;
    edge.massKg*=scale;
    const cp=SPECIFIC_HEAT[edge.element];
    incoming[edge.to]+=edge.massKg;outgoing[edge.from]+=edge.massKg;
    heatIn[edge.to]+=edge.massKg*cp*before[edge.from].tempC;
    heatOut[edge.from]+=edge.massKg*cp*before[edge.from].tempC;
    elementByCell[edge.to]=edge.element;
  }
  for(let i=0;i<cells.length;i++){
    const cell=cells[i],old=before[i],element=old.element||elementByCell[i];
    if(!element){for(const field of ATMOSPHERE_FIELDS)if(fieldMass(cell,field)<MIN_RESTORED_GAS_MASS_KG)cell[field]=0;continue;}
    const mass=old.massKg-outgoing[i]+incoming[i];
    if(mass<MIN_RESTORED_GAS_MASS_KG){cell[element]=0;continue;}
    const cp=SPECIFIC_HEAT[element],oldCapacity=.05+old.massKg*cp,newCapacity=.05+mass*cp;
    const energy=old.tempC*oldCapacity+heatIn[i]-heatOut[i];
    for(const field of ATMOSPHERE_FIELDS)cell[field]=0;
    cell[element]=unitsFor(element,mass);
    cell.temp=old.massKg<=MIN_RESTORED_GAS_MASS_KG&&incoming[i]>0
      ? heatIn[i]/(incoming[i]*cp)
      : energy/newCapacity;
  }
  // ONI occasionally exchanges an inverted vertical pair. The installation
  // measurements support an event rate near 1/16 per exposed pair/tick, but
  // not the proprietary PRNG; use a stable seed/cell/tick hash so saves replay.
  const seed=Number.isFinite(game.seed)?game.seed>>>0:73,exchanged=new Set();
  for(let y=0;y+1<h;y++)for(let x=0;x<w;x++){
    const top=y*w+x,bottom=top+w,upper=before[top].element,lower=before[bottom].element;
    if(!upper||!lower||upper===lower||RESTORED_MOLAR_MASS[upper]<=RESTORED_MOLAR_MASS[lower])continue;
    if((densitySample(seed,top,tick)&15)!==0||exchanged.has(top)||exchanged.has(bottom))continue;
    exchanged.add(top);exchanged.add(bottom);
    const a=cells[top],b=cells[bottom];
    for(const field of ATMOSPHERE_FIELDS){const held=a[field];a[field]=b[field]||0;b[field]=held||0;}
    const heldTemp=a.temp;a.temp=b.temp;b.temp=heldTemp;
  }
}

function phaseChange(game,cell,x,y){
  if(cell.solid)return;
  const water=ELEMENTS.Water,ice=ELEMENTS.Ice,steam=ELEMENTS.Steam;
  if(cell.water>0&&cell.temp<water.lowTempC-1){cell.frost=(cell.frost||0)+cell.water;cell.water=0;}
  else if((cell.frost||0)>0&&cell.temp>ice.highTempC+1){cell.water+=(cell.frost||0);cell.frost=0;}
  if(cell.water>0&&cell.liquidElement!=='dirtyWater'&&cell.temp>water.highTempC+1){
    const waterKgPerCell=game.waterKgPerCell||1000,amount=cell.water*waterKgPerCell;
    const emitted=emitAtmosphereNeighbors(game,x,y,'steam',amount,cell.temp);
    cell.water=Math.max(0,cell.water-emitted/(game.waterKgPerCell||1000));
  } else {
    const state=atmosphereOf(cell);
    if(state?.element==='steam'&&cell.liquidElement!=='dirtyWater'&&cell.temp<steam.lowTempC-1){
      const waterKgPerCell=game.waterKgPerCell||1000,space=Math.max(0,1-cell.water-(cell.frost||0))*waterKgPerCell;
      const amount=Math.min(state.massKg,space);if(amount>=state.massKg-EPS&&amount>EPS){takeAtmosphere(cell,amount);cell.water+=amount/waterKgPerCell;}
    }
  }
}

export function stepAtmosphere(game,dt,cycleSeconds=game.cycleSeconds||600){
  const {w,cells}=game;
  if(game.restoredRules)stepRestoredGas(game,dt);
  else {
    const reverse=Math.floor(game.time*5+.5)%2===1;
    const blocked=i=>{const door=game._doorMap?.get(i);return !!door&&!door.doorOpen;};
    for(let n=0;n<cells.length;n++){
      const i=reverse?cells.length-1-n:n,a=cells[i];
      if(i%w+1<w&&!blocked(i)&&!blocked(i+1))exchangePair(game,a,cells[i+1],false,dt);
      if(i+w<cells.length&&!blocked(i)&&!blocked(i+w))exchangePair(game,a,cells[i+w],true,dt);
    }
  }
  for(let i=0;i<cells.length;i++){
    const cell=cells[i],x=i%w,y=Math.floor(i/w);
    if(cell.steamVent&&!cell.solid&&game.time%cycleSeconds<36){
      const local=atmosphereOf(cell),pressure=local?.element==='steam'?local.massKg:local?2.5:0;
      const room=local&&local.element!=='steam'?0:Math.max(0,2.5-pressure);
      const mass=Math.min(dt*.2,room);
      const emitted=emitAtmosphere(game,x,y,'steam',mass,165);
      cell.ventOutput=(cell.ventOutput||0)+emitted;
    }
    phaseChange(game,cell,x,y);
  }
}
