import { buildingPort } from './footprint.js';

// A single engine and research payload represent a short base-game expedition on
// this map. Fuel and trip duration are scenario settings. The five discoveries
// and the recurring return award follow the installed destination research data.
const FUEL_KG=100, FLIGHT_SECONDS=600;
const DISCOVERIES=5, FIRST_STUDY_KG=50, RETURN_KG=10;
export const EXPEDITION_BUILDING={
  name:'증기 연구 로켓',icon:'steamRocket',color:'#c18f6e',cost:{metal:160,rock:100},
  description:'증기 엔진과 연구 모듈로 가까운 천체를 탐사합니다. 증기 100 kg을 채우고 출항하면 한 주기 뒤 데이터뱅크를 가져옵니다.'
};
export function installExpeditions(Game){
  const p=Game.prototype;
  const base={finish:p._finishUtilities,place:p.canPlace,reset:p.reset,load:p.load,inspect:p.inspect};
  p.reset=function(...args){
    const r=base.reset.apply(this,args);
    if(this.modernRules){this.resources.dataBank=0;this.resources.researchFlights=0;}
    return r;
  };
  p.launchResearchFlight=function(id){
    const b=this.buildings.find(b=>b.id===id);
    if(!this.modernRules||!b||b.type!=='steamRocket'||b.progress<1||!b.enabled||this.lost)return {ok:false,message:'가동 가능한 연구 로켓이 필요합니다.'};
    if(b.returnAt>0)return {ok:false,message:'천체 탐사 중입니다.'};
    if(this.tasks.some(t=>t.type==='deconstruct'&&t.x===b.x&&t.y===b.y))return {ok:false,message:'해체 예정인 로켓입니다.'};
    if((b.steamFuel||0)<FUEL_KG-1e-8)return {ok:false,message:'연료 포트에 증기 100 kg을 공급하세요.'};
    b.steamFuel=0;b.returnAt=this.time+FLIGHT_SECONDS;
    return {ok:true,message:'연구 로켓이 출항했습니다.'};
  };
  p._finishUtilities=function(dt){
    base.finish.call(this,dt);
    if(!this.modernRules)return;
    for(const b of this.buildings){
      if(b.type!=='steamRocket'||b.progress<1)continue;
      if(b.returnAt>0){
        if(this.time+1e-8<b.returnAt){b.active=true;b.status='천체 탐사 중';continue;}
        const recovered=RETURN_KG+((this.resources.researchFlights||0)<DISCOVERIES?FIRST_STUDY_KG:0);
        this.resources.dataBank=(this.resources.dataBank||0)+recovered;
        this.resources.researchFlights=(this.resources.researchFlights||0)+1;b.returnAt=0;
        this._event(`연구 로켓 귀환 · 데이터뱅크 ${recovered} kg`,'good');
      }
      if(!b.enabled||this.tasks.some(t=>t.type==='deconstruct'&&t.x===b.x&&t.y===b.y))continue;
      const port=buildingPort(b,'gasIn'),pipe=port&&this.cell(port.x,port.y),packet=pipe?.gasPacket;
      if(packet?.element==='steam'&&pipe.gasPipe){
        const used=Math.min(packet.mass,10*dt,FUEL_KG-(b.steamFuel||0));
        b.steamFuel=(b.steamFuel||0)+used;packet.mass-=used;
        if(packet.mass<=1e-9)pipe.gasPacket=null;
      }
      b.status=b.steamFuel>=FUEL_KG-1e-8?'출항 준비 완료':'증기 연료 대기';
    }
  };
  p.canPlace=function(tool,x,y,...args){
    if(tool==='steamRocket'&&!this.modernRules)return {ok:false,message:'4.3 기지 전용 시설입니다.'};
    const b=tool==='deconstruct'&&this._buildingAt(x,y);
    if(b?.type==='steamRocket'&&(b.returnAt>0||b.steamFuel>0))return {ok:false,message:'연료를 사용하고 로켓이 귀환한 후 해체하세요.'};
    return base.place.call(this,tool,x,y,...args);
  };
  p.inspect=function(x,y){
    const r=base.inspect.call(this,x,y),b=r.building;
    if(b?.type==='steamRocket'){
      r.lines.unshift(b.returnAt>0?`귀환까지 ${Math.ceil(b.returnAt-this.time)}초`:`증기 ${(b.steamFuel||0).toFixed(1)} / ${FUEL_KG} kg`);
      r.lines.push(`데이터뱅크 비축 ${(this.resources.dataBank||0).toFixed(1)} kg · 탐사 ${this.resources.researchFlights||0}회`);
    }
    return r;
  };
  p.load=function(s){
    if(s?.ruleset==='oni-4.3'){
      const {dataBank=0,researchFlights=0}=s.resources||{};
      if(!Number.isFinite(dataBank)||dataBank<0||!Number.isSafeInteger(researchFlights)||researchFlights<0)throw new Error('우주 탐사 기록이 올바르지 않습니다.');
      for(const b of s.buildings||[])if(b.type==='steamRocket'){
        const {steamFuel=0,returnAt=0}=b;
        if(!Number.isFinite(steamFuel)||steamFuel<0||steamFuel>FUEL_KG+1e-8||!Number.isFinite(returnAt)||returnAt<0||returnAt>s.time+FLIGHT_SECONDS+1e-6||returnAt>0&&steamFuel>0)throw new Error('연구 로켓 상태가 올바르지 않습니다.');
      }
    }
    return base.load.call(this,s);
  };
}
