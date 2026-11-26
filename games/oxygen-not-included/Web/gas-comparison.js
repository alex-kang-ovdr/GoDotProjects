import { atmosphereOf, stepAtmosphere } from './atmosphere.js';
import { GAS_KG_PER_UNIT } from './environment.js';

const fields={Oxygen:'oxygen',CarbonDioxide:'co2',Hydrogen:'hydrogen',Steam:'steam'};
const names={oxygen:'산소',co2:'이산화탄소',hydrogen:'수소',steam:'증기',solid:'벽'};
const grams=kg=>(kg*1000).toLocaleString('ko-KR',{maximumFractionDigits:3});

function massLabel(kg){
  if(kg!==0&&Math.abs(kg)<.000001)return (kg*1e9).toLocaleString('ko-KR',{maximumFractionDigits:3})+' µg';
  return grams(kg)+' g';
}

export function replayGasFrame(reference,test,tick,restoredRules=true){
  const {width:w,height:h}=reference.world;
  const cells=Array.from({length:w*h},()=>({solid:'bedrock',temp:20,oxygen:0,co2:0,steam:0,hydrogen:0,water:0,frost:0}));
  const game={w,h,cells,seed:test.seed,time:0,modernRules:true,restoredRules,waterKgPerCell:1000,cycleSeconds:600,
    cell(x,y){return x>=0&&y>=0&&x<w&&y<h?cells[y*w+x]:null;}};
  for(const [x,y,element,mass,temp] of test.frames[0]){
    const c=game.cell(x,y),field=fields[element];
    if(element!=='solid')c.solid=null;
    c.temp=temp??20;
    if(field)c[field]=mass/(field==='oxygen'||field==='co2'?GAS_KG_PER_UNIT:1);
  }
  for(let i=1;i<=tick;i++){game.time=i*test.dt;stepAtmosphere(game,test.dt,600);}
  return game;
}

function condition(test){
  const cells=test.frames[0].filter(c=>c[2]!=='solid'),species=new Set(cells.map(c=>names[fields[c[2]]]||'진공'));
  const xs=cells.map(c=>c[0]),ys=cells.map(c=>c[1]);
  const width=Math.max(...xs)-Math.min(...xs)+1,height=Math.max(...ys)-Math.min(...ys)+1;
  const top=cells.filter(c=>c[2]).sort((a,b)=>a[1]-b[1])[0];
  const topic=test.id.startsWith('anchor-')?'기준 실험 (15, 16)':test.id.startsWith('buoyancy')?'위쪽 '+names[fields[top[2]]]:test.id.includes('horizontal')?'좌우 배치':test.id.includes('vertical')?'상하 배치':test.id.includes('thermal')?'온도 차이':test.id.includes('isolated')?'밀폐된 한 칸':width+'×'+height+'칸';
  const peak=Math.max(...cells.map(c=>c[3]));
  return topic+' / '+[...species].join('·')+' / '+(peak>0&&peak<.000001?(peak*1e9).toPrecision(2)+' µg':grams(peak)+' g');
}

let reference;
export function startGasComparison(){
  const el=id=>document.getElementById(id),cases=el('gas-case'),slider=el('gas-frame');
  if(!reference){
    reference=JSON.parse(el('gas-measurements').content.textContent);
    for(const [i,test] of reference.cases.entries())cases.add(new Option(condition(test),String(i)));
    el('gas-source').textContent='Windows Steam 빌드 '+reference.build+'의 측정값과 같은 배치에서 실행한 웹 시뮬레이션을 비교합니다. 기체 압력은 각 타일의 질량(g)으로 표시합니다.';
  }
  function show(){
    const test=reference.cases[Number(cases.value)],tick=Number(slider.value),game=replayGasFrame(reference,test,tick);
    const body=el('gas-observations');body.replaceChildren();
    let maxError=0,mismatches=0;
    for(const [x,y,element,mass] of test.frames[tick]){
      if(element==='solid')continue;
      const expected=fields[element],actual=atmosphereOf(game.cell(x,y)),difference=(actual?.massKg||0)-mass;
      if((expected||null)!==(actual?.element||null))mismatches++;
      maxError=Math.max(maxError,Math.abs(difference));
      const row=body.insertRow();
      for(const value of [x+', '+y,expected?names[expected]+' '+massLabel(mass):'진공',actual?names[actual.element]+' '+massLabel(actual.massKg):'진공',(difference>0?'+':'')+massLabel(difference)])row.insertCell().textContent=value;
    }
    el('gas-frame-time').textContent=tick+'틱 · '+(tick*test.dt).toFixed(1)+'초';
    el('gas-difference').textContent='최대 질량 차이 '+massLabel(maxError)+' · 원소가 다른 타일 '+mismatches+'칸';
  }
  function select(){const test=reference.cases[Number(cases.value)];slider.max=String(test.frames.length-1);slider.value=String(Math.min(1,test.frames.length-1));show();}
  cases.onchange=select;slider.oninput=show;select();
}
