import { ELEMENTS } from './elements.js';

// 4.3 stores one atmospheric element per cell. Oxygen and CO2 retain the
// historic UI/save unit; this module exposes their mass in kilograms.
export const ATMOSPHERE_FIELDS = Object.freeze(['oxygen','co2','hydrogen','steam']);
export const MAX_ATMOSPHERE_KG = 10;
const MASS_PER_UNIT = .5328;
const SPECIFIC_HEAT = Object.freeze({
  oxygen:ELEMENTS.Oxygen.specificHeatCapacity,
  co2:ELEMENTS.CarbonDioxide.specificHeatCapacity,
  hydrogen:ELEMENTS.Hydrogen.specificHeatCapacity,
  steam:ELEMENTS.Steam.specificHeatCapacity
});
const DIRECTIONS=[[0,-1],[1,0],[0,1],[-1,0]];
const EPS=1e-10;
const fieldMass=(cell,field)=>Math.max(0,Number(cell?.[field])||0)*(field==='oxygen'||field==='co2'?MASS_PER_UNIT:1);
const unitsFor=(field,kg)=>kg/(field==='oxygen'||field==='co2'?MASS_PER_UNIT:1);

export function atmosphereOf(cell) {
  if(!cell)return null;
  for(const element of ATMOSPHERE_FIELDS){const massKg=fieldMass(cell,element);if(massKg>EPS)return{element,massKg};}
  return null;
}

function validElement(element){return ATMOSPHERE_FIELDS.includes(element);}
function usableCell(cell){return !!cell&&!cell.solid&&(cell.water||0)<=EPS&&(cell.frost||0)<=EPS;}
function gasRoomKg(cell,element){
  if(!usableCell(cell)||!validElement(element))return 0;
  const current=atmosphereOf(cell);
  if(current&&current.element!==element)return 0;
  return Math.max(0,MAX_ATMOSPHERE_KG-(current?.massKg||0));
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
    const amount=Math.min(remaining,Math.max(0,MAX_ATMOSPHERE_KG-(at?.massKg||0)));
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
  if(gasRoomKg(cell,element)>EPS)return gasRoomKg(cell,element);
  const existing=atmosphereOf(cell);
  if(existing&&existing.element!==element&&planDisplacement(game,cell,element))return MAX_ATMOSPHERE_KG;
  if(liquidDisplacement)return existing?.element===element?Math.max(0,MAX_ATMOSPHERE_KG-existing.massKg):MAX_ATMOSPHERE_KG;
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
  const current=atmosphereOf(cell),room=Math.max(0,MAX_ATMOSPHERE_KG-(current?.massKg||0));
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
  const shadow={...game,cells,_doorBlocksFluid:(x,y)=>game._doorBlocksFluid?.(x,y)||false,cell(x,y){return Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<this.w&&y<this.h?cells[y*this.w+x]:null;}};
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
  const accepted=Math.min(amount,gasRoomKg(to,state.element));if(accepted<=EPS)return 0;
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
  const {w,h,cells}=game;
  const reverse=Math.floor(game.time*5+.5)%2===1;
  const blocked=i=>{const door=game._doorMap?.get(i);return !!door&&!door.doorOpen;};
  for(let n=0;n<cells.length;n++){
    const i=reverse?cells.length-1-n:n,a=cells[i];
    if(i%w+1<w&&!blocked(i)&&!blocked(i+1))exchangePair(game,a,cells[i+1],false,dt);
    if(i+w<cells.length&&!blocked(i)&&!blocked(i+w))exchangePair(game,a,cells[i+w],true,dt);
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
