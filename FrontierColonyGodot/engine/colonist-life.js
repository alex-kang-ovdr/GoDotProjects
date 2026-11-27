/** Resident-life rules shared by the simulation and its inspector. No DOM or RNG. */
export const SCHEDULE_MODES = Object.freeze({anything:'자율',work:'작업',sleep:'수면',recreation:'여가'});
const balanced=Array.from({length:24},(_,h)=>h>=22||h<6?'sleep':h>=8&&h<18?'work':h>=18&&h<20?'recreation':'anything');
const night=Array.from({length:24},(_,h)=>h>=10&&h<18?'sleep':h>=20||h<6?'work':h>=6&&h<8?'recreation':'anything');
export const SCHEDULE_PRESETS = Object.freeze({balanced:Object.freeze(balanced),night:Object.freeze(night),free:Object.freeze(Array(24).fill('anything'))});
const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function initializeLife(game,{migration=false}={}){
  const s=game.state;
  if(!record(s.careStats))s.careStats={rescued:0,tended:0,fed:0};
  for(const t of s.tiles)if(t.building?.type==='bed'&&t.building.medical===undefined)t.building.medical=false;
  for(const c of s.colonists){
    if(c.carryingPawnId===undefined)c.carryingPawnId=null;
    if(c.carriedBy===undefined)c.carriedBy=null;
    if(c.patientBedId===undefined)c.patientBedId=null;
    if(c.schedule===undefined)c.schedule=[...SCHEDULE_PRESETS[migration?'free':'balanced']];
    if(c.recreation===undefined)c.recreation=70;
    if(c.lastScheduleHour===undefined)c.lastScheduleHour=-1;
    if(c.emergencyCheckAt===undefined)c.emergencyCheckAt=0;
    if(c.skills.rescue===undefined)c.skills.rescue=c.name==='미나'?8:6;
    if(c.skills.firefight===undefined)c.skills.firefight=6;
    if(c.priorities.rescue===undefined)c.priorities.rescue=1;
    if(c.priorities.firefight===undefined)c.priorities.firefight=1;
  }
}

/** Every entry is an additive term used by the actual target-mood formula. */
export function moodFactors(c){
  if(!c)return [];
  return [
    {id:'baseline',label:'기본 안정감',value:76},
    {id:'pain',label:'부상과 통증',value:-(100-c.health)*.28},
    {id:'hunger',label:'허기',value:c.hunger<35?-(35-c.hunger)*.8:0},
    {id:'fatigue',label:'피로',value:c.energy<30?-(30-c.energy)*.55:0},
    {id:'rest',label:'휴식 중',value:c.job?.type==='rest'||c.patientBedId?5:0},
    {id:'shelter',label:'실내의 안정감',value:c.sheltered?4:0},
    {id:'thermal',label:'불편한 온도',value:-(c.thermalStress||0)*.18},
    {id:'recreation',label:'여가 부족',value:c.recreation<30?-(30-c.recreation)*.35:0}
  ];
}
export function moodTarget(c){return clamp(moodFactors(c).reduce((n,f)=>n+f.value,0),5,92);}

export function validateLife(data,bad){
  const number=(v,a,b,label)=>{if(!Number.isFinite(v)||v<a||v>b)bad(label);};
  if(!record(data.careStats))bad('간호 통계');
  for(const key of ['rescued','tended','fed'])if(!Number.isSafeInteger(data.careStats[key])||data.careStats[key]<0)bad('간호 통계 수량');
  const pawns=new Map(data.colonists.map(c=>[c.id,c])),beds=new Map(data.tiles.filter(t=>t.building?.type==='bed').map(t=>[t.building.id,t]));
  for(const t of beds.values())if(typeof t.building.medical!=='boolean')bad('의료 침상 설정');
  const bookings=new Map();
  const book=(bedId,patientId)=>{const t=beds.get(bedId);if(!t?.building.complete)bad('환자 침상 참조');if(bookings.has(bedId)&&bookings.get(bedId)!==patientId)bad('중복 환자 침상');bookings.set(bedId,patientId);};
  for(const c of data.colonists){
    if(!Array.isArray(c.schedule)||c.schedule.length!==24||Array.from(c.schedule).some(mode=>!Object.hasOwn(SCHEDULE_MODES,mode)))bad('24시간 주민 일정');
    number(c.recreation,0,100,'여가');number(c.emergencyCheckAt,0,1e10,'위기 재평가 시간');
    if(!Number.isInteger(c.lastScheduleHour)||c.lastScheduleHour< -1||c.lastScheduleHour>23)bad('일정 갱신 시각');
    for(const key of ['carryingPawnId','carriedBy','patientBedId'])if(c[key]!==null&&typeof c[key]!=='string')bad('환자 운반 참조');
    if(c.carryingPawnId){
      const p=pawns.get(c.carryingPawnId);
      if(c.dead||c.carry||c.carriedBy||!p||p.dead||p.carriedBy!==c.id||p.carryingPawnId||c.job?.type!=='rescue'||c.job.stage!=='deliver'||c.job.targetId!==p.id||p.patientBedId!==c.job.bedId)bad('운반자와 환자 상호 참조');
      if(Math.abs(c.x-p.x)>1e-6||Math.abs(c.y-p.y)>1e-6)bad('운반 중 환자 위치');
    }
    if(c.carriedBy){const carrier=pawns.get(c.carriedBy);if(c.dead||c.carry||c.job||!carrier||carrier.dead||carrier.carryingPawnId!==c.id)bad('환자 운반자 참조');}
    if(c.patientBedId){if(c.dead)bad('사망한 환자 침상');book(c.patientBedId,c.id);}
    const j=c.job;if(!j)continue;
    if(j.type==='rescue'){
      if(!['pickup','deliver'].includes(j.stage)||!pawns.has(j.targetId)||j.targetId===c.id||typeof j.bedId!=='string')bad('구조 작업');
      book(j.bedId,j.targetId);
      if(j.stage==='deliver'&&c.carryingPawnId!==j.targetId)bad('환자 없는 운반 작업');
    }
    if(j.type==='feed'&&(!['fetch','work'].includes(j.stage)||!pawns.has(j.targetId)||!['meals','rawfood'].includes(j.foodType)))bad('급식 작업');
    if(j.type==='firefight'&&j.stage!=='work')bad('소방 작업');
    if(j.type==='recreate'&&(j.stage!=='work'||j.ground!==undefined&&typeof j.ground!=='boolean'))bad('여가 작업');
  }
}
