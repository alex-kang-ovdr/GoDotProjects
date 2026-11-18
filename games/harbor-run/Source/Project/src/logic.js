/* Shared deterministic gameplay primitives. Browser and Node tests use the same code. */
'use strict';
const HarborLogic=(()=>{
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 function rayBox(origin,dir,box,max=Infinity,inflate=0){let near=0,far=max;for(let i=0;i<3;i++){let lo=box.min[i]-inflate,hi=box.max[i]+inflate;if(Math.abs(dir[i])<1e-8){if(origin[i]<lo||origin[i]>hi)return null;continue;}let a=(lo-origin[i])/dir[i],b=(hi-origin[i])/dir[i];if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);if(near>far)return null;}return near<=max?near:null;}
 function raySphere(o,d,c,r,max=Infinity){const q=o.map((x,i)=>x-c[i]),b=q.reduce((s,x,i)=>s+x*d[i],0),cc=q.reduce((s,x)=>s+x*x,0)-r*r,h=b*b-cc;if(h<0)return null;const t=-b-Math.sqrt(h);return t>=0&&t<=max?t:null;}
 function normalizeInput(x,z){const l=Math.hypot(x,z);return l>1?[x/l,z/l]:[x,z];}
 function damage(state,raw,protectedZone=true){raw=Math.max(0,raw);const absorbed=protectedZone?Math.min(Math.max(0,state.armor),raw):0;state.armor=Math.max(0,state.armor-absorbed);state.hp=Math.max(0,state.hp-(raw-absorbed));return{absorbed,healthDamage:raw-absorbed};}
 class Magazine{
  constructor(cap,reserve){this.cap=cap;this.ammo=cap;this.reserve=reserve;this.reload=null;this.serial=0;}
  fire(){if(this.reload||this.ammo<=0)return false;this.ammo--;return true;}
  startReload(duration){if(this.reload||this.ammo===this.cap||this.reserve===0)return false;this.reload={t:0,duration,committed:false,token:++this.serial};return true;}
  update(dt){if(!this.reload)return false;const r=this.reload;r.t+=dt;if(!r.committed&&r.t>=r.duration*.72){const n=Math.min(this.cap-this.ammo,this.reserve);this.ammo+=n;this.reserve-=n;r.committed=true;}if(r.t>=r.duration){this.reload=null;return true;}return false;}
  cancel(){this.reload=null;}
 }
 class Wanted{
  constructor(){this.level=0;this.state='clear';this.lastKnown=[0,0,0];this.search=0;this.maxSearch=0;this.events=new Set();this.observers=new Set();}
  report(id,level,pos){if(this.events.has(id))return false;this.events.add(id);this.level=clamp(Math.max(this.level,level),1,3);this.lastKnown=pos.slice();this.maxSearch=12+this.level*7;this.search=this.maxSearch;this.state='search';return true;}
  update(dt,observers,pos){this.observers=new Set(observers);if(!this.level)return; if(this.observers.size){this.state='pursuit';this.lastKnown=pos.slice();this.search=this.maxSearch;}else{this.state='search';this.search=Math.max(0,this.search-dt);if(this.search<=0)this.clear();}}
  clear(){this.level=0;this.state='clear';this.search=0;this.observers.clear();}
 }
 class Seat{
  constructor(){this.occupant=null;this.lease=null;this.serial=0;}
  reserve(actor,now,generation,allowOccupied=false){if(this.occupant&&!allowOccupied)return null;if(this.lease&&this.lease.until>now&&this.lease.actor!==actor)return null;return this.lease={actor,token:++this.serial,generation,until:now+2};}
  commit(token,now,generation,alive,speed){const l=this.lease;if(!l||l.token!==token||l.generation!==generation||l.until<=now||!alive||Math.abs(speed)>1.5)return false;this.occupant=l.actor;this.lease=null;return true;}
  cancel(token){if(this.lease?.token===token)this.lease=null;}
 }
 class RewardLedger{
  constructor(wallet=0,keys=[]){this.wallet=wallet;this.keys=new Set(keys);}
  grant(runId,amount){const key=`${runId}:delivery`;if(this.keys.has(key))return false;this.keys.add(key);this.wallet+=amount;return true;}
 }
 function canDeliver(s){return s.alive&&s.targetHp>0&&s.inTarget&&s.inZone&&Math.abs(s.speed)<=.5&&s.wanted===0;}
 function validateSave(s){
  const number=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
  const point=p=>Array.isArray(p)&&p.length===3&&p.every(x=>number(x,-500,500));
  const text=(v,max=160)=>typeof v==='string'&&v.length>0&&v.length<=max;
  if(!s||s.version!==1)throw Error('지원하지 않는 저장 버전');
  if(!number(s.wallet,0,1e8)||!Array.isArray(s.rewardKeys)||s.rewardKeys.length>2000||!s.rewardKeys.every(k=>text(k)))throw Error('저장 지갑 오류');
  if(!s.player||!point(s.player.pos)||!number(s.player.hp,1,100)||!number(s.player.armor,0,50)||!number(s.player.yaw,-1e8,1e8)||!Number.isInteger(s.player.weapon)||!number(s.player.weapon,0,4))throw Error('저장 플레이어 오류');
  if(!Array.isArray(s.cars)||s.cars.length>40||s.cars.length<1)throw Error('저장 차량 목록 오류');
  const ids=new Set();for(const c of s.cars){if(!text(c.id,100)||ids.has(c.id)||!['coupe','sedan','police','van'].includes(c.kind)||!number(c.x,-180,180)||!number(c.z,-180,180)||!number(c.hp,0,500)||!number(c.yaw,-1e8,1e8))throw Error('차량 저장 오류');ids.add(c.id);if(!Array.isArray(c.route)||c.route.length>100||!c.route.every(point))throw Error('차량 경로 오류');}
  if(!ids.has('target'))throw Error('목표 차량 데이터가 없습니다.');
  if(s.player.carId!==null&&(!text(s.player.carId,100)||!ids.has(s.player.carId)))throw Error('좌석 참조 오류');
  const occupied=s.cars.filter(c=>c.occupant==='player');if(occupied.length!==(s.player.carId?1:0)||(s.player.carId&&occupied[0].id!==s.player.carId))throw Error('좌석 점유 불일치');
  if(!['reach','recover','escape','deliver','complete','free'].includes(s.phase)||!text(s.runId,100))throw Error('저장 미션 오류');
  if(!number(s.time,0,1e9)||!number(s.missionTime,0,1e9)||!Array.isArray(s.npcs)||s.npcs.length>70)throw Error('저장 시간 또는 NPC 오류');
  const nids=new Set();for(const n of s.npcs){if(!text(n.id,100)||nids.has(n.id)||!point(n.pos)||!point(n.home)||!['guard','police','civilian'].includes(n.type)||!number(n.hp,0,100)||!number(n.yaw,-1e8,1e8))throw Error('NPC 저장 오류');nids.add(n.id);}
  const caps=[12,30,30,6,8];if(!Array.isArray(s.mags)||s.mags.length!==5||s.mags.some((m,i)=>!Number.isInteger(m.ammo)||!number(m.ammo,0,caps[i])||!Number.isInteger(m.reserve)||!number(m.reserve,0,1000)))throw Error('탄약 저장 오류');
  if(!s.wanted||!Number.isInteger(s.wanted.level)||!number(s.wanted.level,0,3)||!point(s.wanted.lastKnown)||!number(s.wanted.search,0,40)||!Array.isArray(s.wanted.events)||s.wanted.events.length>5000)throw Error('수배 저장 오류');
  if(!Array.isArray(s.events)||s.events.length>5000||s.events.some(e=>!text(e.id)||!point(e.pos)||!number(e.time,0,1e9)||!number(e.level,1,3)))throw Error('사건 저장 오류');
  return s;
 }

 return{clamp,rayBox,raySphere,normalizeInput,damage,Magazine,Wanted,Seat,RewardLedger,canDeliver,validateSave};
})();
if(typeof window!=='undefined')window.HarborLogic=HarborLogic;
if(typeof module!=='undefined')module.exports=HarborLogic;
