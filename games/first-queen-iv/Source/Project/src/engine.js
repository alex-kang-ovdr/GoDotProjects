/* First Queen IV-inspired independent prototype. Reconstructed/custom rules, not original game data. */
(function(root){
'use strict';
const WIDTH=960, HEIGHT=600, STEP=1/60, MAX_ARMY=40;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=o=>JSON.parse(JSON.stringify(o));
const CLASSES={
 infantry:{name:'보병',hp:105,atk:16,def:6,speed:66,range:25,rate:56,windup:12,color:'#86b6cf',skill:'방패 결속'},
 knight:{name:'기사',hp:170,atk:25,def:10,speed:74,range:29,rate:66,windup:16,color:'#d4b465',skill:'회전 베기'},
 archer:{name:'궁수',hp:78,atk:15,def:3,speed:68,range:168,rate:76,windup:20,color:'#8cbb85',skill:'일제사격'},
 healer:{name:'치료사',hp:86,atk:7,def:4,speed:64,range:125,rate:102,windup:22,color:'#c1a6d8',skill:'치유 파동'}
};
const REGIONS=[
 {id:0,name:'카리온',x:160,y:326,links:[1,3],kind:'capital'},
 {id:1,name:'평원',x:355,y:243,links:[0,2,4],kind:'field'},
 {id:2,name:'북부 성채',x:550,y:130,links:[1,5],kind:'fort'},
 {id:3,name:'숲의 마을',x:285,y:465,links:[0,4],kind:'forest'},
 {id:4,name:'강변 요새',x:565,y:412,links:[1,3,5],kind:'fort'},
 {id:5,name:'바르시아',x:790,y:260,links:[2,4],kind:'capital'}
];
const ORDERS={attack:'공격',hold:'방어',regroup:'집결',retreat:'후퇴',move:'이동',siege:'공성',charge:'돌격'};
function maxHP(u){return CLASSES[u.type].hp+(u.level-1)*7;}
function plainUnit(u){return {id:u.id,type:u.type,level:u.level,exp:u.exp,hp:Math.max(1,Math.ceil(u.hp)),fatigue:Math.round(u.fatigue)};}
function rectHit(x,y,b,r=0){return Math.abs(x-b.x)<b.w/2+r && Math.abs(y-b.y)<b.h/2+r;}
function segmentRect(ax,ay,bx,by,r,pad=0){
 let lo=0,hi=1;const mins=[r.x-r.w/2-pad,r.y-r.h/2-pad],maxs=[r.x+r.w/2+pad,r.y+r.h/2+pad];
 for(let i=0;i<2;i++){let a=i?ay:ax,d=(i?by:bx)-a;if(Math.abs(d)<1e-8){if(a<mins[i]||a>maxs[i])return false;}else{let t1=(mins[i]-a)/d,t2=(maxs[i]-a)/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}}
 return true;
}
class Navigation{
 constructor(blocks){this.cell=24;this.cols=40;this.rows=25;this.setBlocks(blocks);}
 setBlocks(blocks){this.blocks=blocks;this.version=(this.version||0)+1;this.grid=new Uint8Array(1000);for(let y=0;y<25;y++)for(let x=0;x<40;x++)if(blocks.some(b=>rectHit(x*24+12,y*24+12,b,14)))this.grid[y*40+x]=1;}
 clear(a,b,pad=8){return !this.blocks.some(r=>segmentRect(a.x,a.y,b.x,b.y,r,pad));}
 blocked(x,y){return x<0||y<0||x>=40||y>=25||this.grid[y*40+x]===1;}
 nearest(x,y){x=clamp(Math.floor(x/24),0,39);y=clamp(Math.floor(y/24),0,24);if(!this.blocked(x,y))return [x,y];for(let r=1;r<7;r++){let opts=[];for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(!this.blocked(x+dx,y+dy))opts.push([x+dx,y+dy,dx*dx+dy*dy]);if(opts.length){opts.sort((a,b)=>a[2]-b[2]||a[1]-b[1]||a[0]-b[0]);return opts[0];}}return null;}
 path(a,b){
  const s=this.nearest(a.x,a.y),t=this.nearest(b.x,b.y);if(!s||!t)return null;
  const start=s[1]*40+s[0],goal=t[1]*40+t[0],g=new Float32Array(1000).fill(Infinity),prev=new Int16Array(1000).fill(-1),closed=new Uint8Array(1000),open=[start];g[start]=0;
  const h=n=>Math.hypot(n%40-t[0],Math.floor(n/40)-t[1]);let iterations=0;
  while(open.length&&iterations++<2500){let best=0;for(let i=1;i<open.length;i++)if(g[open[i]]+h(open[i])<g[open[best]]+h(open[best]))best=i;let n=open.splice(best,1)[0];if(closed[n])continue;if(n===goal){const route=[];while(n!==start){route.push({x:(n%40)*24+12,y:Math.floor(n/40)*24+12});n=prev[n];}route.reverse();if(this.clear(route.at(-1)||a,b))route.push({...b});return route;}closed[n]=1;let x=n%40,y=Math.floor(n/40);
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(this.blocked(nx,ny))continue;if(dx&&dy&&(this.blocked(x+dx,y)||this.blocked(x,y+dy)))continue;const ni=ny*40+nx,v=g[n]+(dx&&dy?1.414214:1);if(v<g[ni]){g[ni]=v;prev[ni]=n;open.push(ni);}}
  }return null;
 }
 resolve(u){
  u.x=clamp(u.x,11,949);u.y=clamp(u.y,11,589);
  for(let pass=0;pass<2;pass++)for(const b of this.blocks){const x=clamp(u.x,b.x-b.w/2,b.x+b.w/2),y=clamp(u.y,b.y-b.h/2,b.y+b.h/2),dx=u.x-x,dy=u.y-y,d=Math.hypot(dx,dy);if(d>=9)continue;if(d>1e-7){u.x=x+dx/d*9;u.y=y+dy/d*9;}else{const choices=[{d:u.x-(b.x-b.w/2),x:b.x-b.w/2-9,y:u.y},{d:b.x+b.w/2-u.x,x:b.x+b.w/2+9,y:u.y},{d:u.y-(b.y-b.h/2),x:u.x,y:b.y-b.h/2-9},{d:b.y+b.h/2-u.y,x:u.x,y:b.y+b.h/2+9}];choices.sort((a,b)=>a.d-b.d);u.x=choices[0].x;u.y=choices[0].y;}}
 }
}
function battlefield(kind){
 const siege=['fort','capital'].includes(kind);
 const obstacles=siege?[
  {id:'wall-a',x:596,y:112,w:28,h:224,height:62,kind:'wall'},
  {id:'wall-b',x:596,y:488,w:28,h:224,height:62,kind:'wall'},
  {id:'tower-a',x:596,y:210,w:55,h:44,height:83,kind:'tower'},
  {id:'tower-b',x:596,y:390,w:55,h:44,height:83,kind:'tower'},
  {id:'rock-a',x:365,y:160,w:48,h:54,height:22,kind:'rock'},
  {id:'rock-b',x:370,y:457,w:60,h:40,height:21,kind:'rock'}
 ]:[{id:'rock-a',x:440,y:180,w:64,h:60,height:26,kind:'rock'},{id:'rock-b',x:530,y:427,w:56,h:66,height:24,kind:'rock'}];
 const gate=siege?{id:'gate',x:596,y:300,w:28,h:152,height:48,kind:'gate',hp:640,maxHp:640,open:false,destroyed:false}:null;
 return {kind,obstacles,gate};
}
class Game{
 constructor(){this.onChange=()=>{};this.log=[];this.nextId=1;this.options={speed:1,enemyAuto:false};this.newGame();}
 note(message){this.log.unshift({message,turn:this.world?.turn||0});if(this.log.length>60)this.log.length=60;this.onChange();}
 make(type,level=1){const u={id:this.nextId++,type,level,exp:0,hp:CLASSES[type].hp+(level-1)*7,fatigue:0};return u;}
 makeRoster(n,level=1){const list=[];for(let i=0;i<n;i++)list.push(this.make(i%13===12?'healer':i%5===4?'archer':i%7===5?'knight':'infantry',level));return list;}
 newGame(){
  this.nextId=1;this.log=[];this.mode='world';this.battle=null;this.report=null;this.paused=false;this.direct=false;this.selectedUnitId=null;this.selectedGroupId=null;this.supportIds=[];this.autoClock=0;
  const roster=[];for(let i=0;i<26;i++)roster.push(this.make(i<14?'infantry':i<19?'knight':i<24?'archer':'healer'));
  this.world={regions:REGIONS.map(r=>({...r,owner:r.id===0?'blue':r.id===3?'neutral':'red',garrison:[]})),armies:[{id:0,name:'카리온 주력군',region:0,roster}],reserve:this.makeRoster(12),activeArmyId:0,turn:0,wins:0,gold:300,enemyArmies:[],graveyard:[],committedBattles:[],battleSerial:0};
  for(const r of this.world.regions)if(r.owner==='red')r.garrison=this.makeRoster(r.id===5?30:r.id===1?22:20,r.id===5?2:1);
  this.world.enemyArmies=[{id:'e0',name:'바르시아 원정대',region:5,roster:this.makeRoster(10,1)},{id:'e1',name:'북부 경비대',region:2,roster:this.makeRoster(8,1)}];
  this.options.enemyAuto=false;this.selectedRegion=1;this.note('카리온 군단 준비 완료. 거점을 선택하거나 공성 연습으로 전투를 익히세요.');
 }
 get activeArmy(){return this.world.armies.find(a=>a.id===this.world.activeArmyId)||this.world.armies[0];}
 get selected(){return this.battle?.units.find(u=>u.id===this.selectedUnitId)||null;}
 get selectedGroup(){return this.battle?.groups.find(g=>g.id===this.selectedGroupId)||null;}
 switchArmy(id){if(this.mode!=='world')return false;const a=this.world.armies.find(a=>a.id===id);if(!a)return false;this.world.activeArmyId=id;this.selectedRegion=a.region;this.note(`${a.name} 선택 · ${a.roster.length}명`);return true;}
 split(){if(this.mode!=='world')return false;const a=this.activeArmy;if(a.roster.length<4||this.world.armies.length>=5){this.note('분할은 병력 4명 이상, 최대 5개 군단까지 가능합니다.');return false;}const roster=a.roster.splice(Math.ceil(a.roster.length/2));const id=Math.max(...this.world.armies.map(v=>v.id))+1;this.world.armies.push({id,name:`제${id+1}군단`,region:a.region,roster});this.note(`제${id+1}군단 창설 · ${roster.length}명`);return true;}
 merge(){if(this.mode!=='world')return false;const a=this.activeArmy,b=this.world.armies.find(b=>b.id!==a.id&&b.region===a.region);if(!b||a.roster.length>=MAX_ARMY){this.note('같은 거점의 군단과 합류할 수 있습니다. 정원은 40명입니다.');return false;}a.roster.push(...b.roster.splice(0,MAX_ARMY-a.roster.length));if(!b.roster.length){this.world.armies=this.world.armies.filter(x=>x!==b);this.supportIds=this.supportIds.filter(id=>id!==b.id);}this.note('군단 합류 완료');return true;}
 transfer(id,toMain){if(this.mode!=='world')return false;const from=toMain?this.world.reserve:this.activeArmy.roster,to=toMain?this.activeArmy.roster:this.world.reserve;const at=from.findIndex(u=>u.id===id);if(at<0||toMain&&to.length>=MAX_ARMY)return false;to.push(from.splice(at,1)[0]);this.onChange();return true;}
 recruit(){if(this.mode!=='world')return false;if(this.world.gold<60||this.world.reserve.length>114){this.note('고용에 금화 60과 예비군 빈자리 6칸이 필요합니다.');return false;}this.world.gold-=60;for(const t of ['infantry','infantry','infantry','archer','knight','healer'])this.world.reserve.push(this.make(t));this.note('신병 6명 고용 · 금화 -60');return true;}
 rest(){if(this.mode!=='world')return false;for(const u of [...this.activeArmy.roster,...this.world.reserve]){u.hp=Math.min(maxHP(u),u.hp+Math.ceil(maxHP(u)*.4));u.fatigue=Math.max(0,u.fatigue-45);}this.note('선택 군단·예비군 휴식. 전략 턴이 진행됩니다.');this.advanceTurn();return true;}
 eligibleSupport(regionId){return this.world.armies.filter(a=>a.id!==this.activeArmy.id&&a.roster.length>0&&(a.region===regionId||REGIONS[a.region].links.includes(regionId)));}
 toggleSupport(id){if(this.mode!=='world')return;this.supportIds=this.supportIds.includes(id)?this.supportIds.filter(x=>x!==id):[...this.supportIds,id];this.onChange();}
 go(regionId){
  if(this.mode!=='world')return false;const a=this.activeArmy,r=this.world.regions[regionId];if(!r||(!REGIONS[a.region].links.includes(regionId)&&a.region!==regionId)){this.note('현재 군단의 인접 거점을 선택하세요.');return false;}
  if(!a.roster.length){this.note('출전 가능한 병력이 없습니다. 예비군을 편성하세요.');return false;}
  if(r.owner==='red'||this.world.enemyArmies.some(e=>e.region===regionId&&e.roster.length))return this.startBattle(regionId);
  if(a.region===regionId)return false;a.region=regionId;if(r.owner==='neutral'){r.owner='blue';this.world.gold+=80;this.note(`${r.name} 확보 · 금화 +80`);}else this.note(`${r.name}으로 이동`);this.advanceTurn();return true;
 }
 advanceTurn(){
  if(this.mode!=='world')return false;this.world.turn++;this.world.gold+=this.world.regions.filter(r=>r.owner==='blue').length*12;
  const w=this.world;
  for(const e of w.enemyArmies){if(!e.roster.length)continue;const home=w.regions[e.region];
   // A threatened occupied region remains a pending battle; no invisible auto-resolve.
   if(home.owner==='blue'&&w.armies.some(a=>a.region===e.region&&a.roster.length)){this.note(`${e.name}이 ${home.name}을 봉쇄 중입니다.`);continue;}
   const links=REGIONS[e.region].links;
   if(e.roster.length<=5){const safe=links.find(i=>w.regions[i].owner==='red');if(safe!==undefined){e.region=safe;this.note(`${e.name} 후퇴`);}}
   else if(w.turn%2===0){const targets=links.map(id=>w.regions[id]).sort((a,b)=>(a.owner==='blue'?-1:0)-(b.owner==='blue'?-1:0)||a.id-b.id);const target=targets[0];if(target){e.region=target.id;this.note(`${e.name} → ${target.name}`);}}
   const place=w.regions[e.region];
   if(place.owner!=='red'&&!w.armies.some(a=>a.region===place.id&&a.roster.length)){place.owner='red';this.note(`거점 함락: ${place.name}`);}
   if(place.owner==='red'&&w.turn%2===0){const n=Math.min(3,32-e.roster.length);e.roster.push(...this.makeRoster(n));for(const u of e.roster){u.hp=Math.min(maxHP(u),u.hp+12);u.fatigue=Math.max(0,u.fatigue-20);}}
  }this.onChange();return true;
 }
 startBattle(regionId,training=false){
  if(this.mode!=='world')return false;const a=this.activeArmy,r=this.world.regions[regionId];if(!r||!a.roster.length)return false;
  if(!training&&a.region!==regionId&&!REGIONS[a.region].links.includes(regionId))return false;
  const enemies=this.world.enemyArmies.filter(e=>e.region===regionId&&e.roster.length);
  if(!training&&r.owner!=='red'&&!enemies.length)return false;
  const before=clone(this.world),battleId=training?'training':`b${++this.world.battleSerial}`;
  const map=battlefield(training?'fort':REGIONS[regionId].kind);
  const b={id:battleId,training,regionId,originRegion:a.region,ownerBefore:r.owner,activeArmyId:a.id,tick:0,time:0,map,groups:[],units:[],projectiles:[],effects:[],particles:[],nav:new Navigation([...map.obstacles,...(map.gate?[map.gate]:[])]),before,healCooldown:0,seed:1414,stats:{damage:0,healing:0,kills:0},resultApplied:false,selectedTarget:null};
  this.battle=b;this.mode='battle';this.paused=false;this.direct=false;this.report=null;this.autoClock=0;
  this.addGroup('army',a.id,a.name,'blue',a.roster,0);
  if(training){if(this.world.reserve.length)this.addGroup('reserve',null,'예비 지원대','blue',this.world.reserve.slice(0,12),180);const demo=Array.from({length:24},(_,i)=>({id:-100-i,type:i%7===0?'knight':i%6===0?'archer':i%11===0?'healer':'infantry',level:1,exp:0,hp:null,fatigue:0}));this.addGroup('training',null,'성채 수비대','red',demo,0);}
  else{
   if(r.owner==='red'&&r.garrison.length)this.addGroup('garrison',r.id,'거점 수비대','red',r.garrison,0);
   for(const e of enemies)this.addGroup('enemy',e.id,e.name,'red',e.roster,0);
   for(const s of this.eligibleSupport(regionId).filter(s=>this.supportIds.includes(s.id)))this.addGroup('army',s.id,s.name,'blue',s.roster,240);
  }
  this.supportIds=[];this.selectedGroupId=b.groups[0].id;this.selectedUnitId=b.units.find(u=>u.team==='blue'&&u.type==='knight')?.id??b.units.find(u=>u.team==='blue')?.id;
  this.note(training?'공성 연습 시작 · 병력 손실과 성장은 캠페인에 반영되지 않습니다.':`${r.name} ${r.owner==='blue'?'방어':'공격'}전 시작`);return true;
 }
 addGroup(kind,sourceId,name,team,roster,arrival=0){
  const b=this.battle;if(!b)return null;const g={id:`g${b.groups.length}`,sourceKind:kind,sourceId,name,team,roster:clone(roster),arrival,spawned:false,unitIds:[],order:team==='red'&&b.map.gate?'hold':'attack',formation:'line',anchor:{x:team==='blue'?180:770,y:300},chargeUntil:0,shieldUntil:0};b.groups.push(g);if(arrival<=b.tick)this.spawnGroup(g);return g;
 }
 spawnGroup(g){
  const b=this.battle;if(g.spawned)return;g.spawned=true;
  const alliedIndex=b.groups.filter(x=>x.team===g.team&&x.spawned).length-1;
  for(let i=0;i<g.roster.length;i++){const d=g.roster[i],mx=maxHP(d),x=(g.team==='blue'?115:827)+(g.team==='blue'?-1:1)*Math.floor(i/9)*24,y=195+(i%9)*24+(alliedIndex%2?12:0);const u={...d,hp:d.hp??mx,maxHp:mx,team:g.team,groupId:g.id,x,y,vx:0,vy:0,yaw:g.team==='blue'?Math.PI/2:-Math.PI/2,phase:0,cool:(i%5)*7,skillCooldown:0,alive:true,evacuated:false,action:null,hitFlash:0,deadAt:null,targetId:null,path:[],pathIndex:0,pathKey:'',pathExpiry:0,protectedUntil:0};b.units.push(u);g.unitIds.push(u.id);b.nav.resolve(u);}
  if(g.arrival>0)this.note(`${g.name} 도착 · ${g.roster.length}명`);
 }
 reinforce(){const b=this.battle;if(!b||this.paused||b.groups.some(g=>g.sourceKind==='reserve'))return false;if(!this.world.reserve.length)return false;this.addGroup('reserve',null,'예비 지원대','blue',this.world.reserve.slice(0,12),b.tick+180);this.note('예비군 출발 · 3초 후 도착');return true;}
 selectUnit(id,manual=false){const u=this.battle?.units.find(u=>u.id===id&&u.team==='blue'&&u.alive&&!u.evacuated);if(!u)return false;const previous=this.selected;if(previous&&previous.id!==id&&previous.hp/previous.maxHp<.45)previous.protectedUntil=this.battle.tick+240;this.selectedUnitId=id;this.selectedGroupId=u.groupId;if(manual)this.direct=true;this.onChange();return true;}
 selectGroup(id){const g=this.battle?.groups.find(g=>g.id===id&&g.team==='blue');if(!g)return false;this.selectedGroupId=id;const u=this.battle.units.find(u=>u.groupId===id&&u.alive&&!u.evacuated);if(u)this.selectedUnitId=u.id;this.direct=false;this.onChange();return true;}
 cycleUnit(delta=1){const all=this.battle?.units.filter(u=>u.team==='blue'&&u.alive&&!u.evacuated)||[];if(!all.length)return;this.selectUnit(all[(all.findIndex(u=>u.id===this.selectedUnitId)+delta+all.length)%all.length].id);}
 cycleGroup(){const all=this.battle?.groups.filter(g=>g.team==='blue')||[];if(!all.length)return;this.selectGroup(all[(all.findIndex(g=>g.id===this.selectedGroupId)+1)%all.length].id);}
 issue(order,all=false,point=null){
  const b=this.battle;if(!b||!ORDERS[order])return false;if(order==='siege'&&(!b.map.gate||b.map.gate.open)){this.note('공격할 성문이 없습니다.');return false;}
  for(const g of b.groups.filter(g=>g.team==='blue'&&(all||g.id===this.selectedGroupId))){g.order=order;const live=b.units.filter(u=>u.groupId===g.id&&u.alive&&!u.evacuated);if(point)g.anchor={x:clamp(point.x,24,936),y:clamp(point.y,24,576)};else if(['hold','regroup'].includes(order)&&live.length)g.anchor={x:live.reduce((v,u)=>v+u.x,0)/live.length,y:live.reduce((v,u)=>v+u.y,0)/live.length};if(order==='charge')g.chargeUntil=b.tick+480;for(const u of live){u.pathKey='';u.protectedUntil=0;}}
  this.direct=false;this.note(`${all?'전군':this.selectedGroup?.name||'부대'} · ${ORDERS[order]}`);return true;
 }
 formation(name){if(this.selectedGroup&&['line','column','wedge','loose'].includes(name)){this.selectedGroup.formation=name;this.onChange();}}
 gateDamage(amount,attacker){const b=this.battle,gate=b?.map.gate;if(!gate||gate.open)return;gate.hp=Math.max(0,gate.hp-amount);this.fx(gate.x,gate.y,'#d6b27c',5);if(gate.hp===0){gate.open=true;gate.destroyed=true;b.nav.setBlocks(b.map.obstacles);for(const u of b.units)u.pathKey='';this.note('성문 파괴 · 모든 부대의 경로를 갱신했습니다.');for(const g of b.groups)if(g.order==='siege')g.order='attack';}}
 gateToggle(){const b=this.battle,g=b?.map.gate;if(!g)return;if(g.destroyed){this.note('파괴된 성문은 다시 닫을 수 없습니다.');return;}if(g.open&&b.units.some(u=>u.alive&&!u.evacuated&&rectHit(u.x,u.y,g,12))){this.note('성문 통로에 병사가 있어 닫을 수 없습니다.');return;}g.open=!g.open;b.nav.setBlocks([...b.map.obstacles,...(!g.open?[g]:[])]);for(const u of b.units)u.pathKey='';this.note(g.open?'성문 개방':'성문 폐쇄');}
 random(){const b=this.battle;b.seed^=b.seed<<13;b.seed^=b.seed>>>17;b.seed^=b.seed<<5;return (b.seed>>>0)/4294967296;}
 fx(x,y,color,n=4){const b=this.battle;if(!b)return;for(let i=0;i<n;i++)b.particles.push({x,y,z:18,vx:(this.random()-.5)*65,vy:(this.random()-.5)*65,vz:20+this.random()*30,life:.55,maxLife:.55,color});if(b.particles.length>240)b.particles.splice(0,b.particles.length-240);}
 text(u,text,color){this.battle.effects.push({x:u.x,y:u.y,text,color,life:.85});if(this.battle.effects.length>90)this.battle.effects.shift();}
 heal(u,amount){if(!u.alive||u.evacuated)return 0;const healed=Math.min(amount,u.maxHp-u.hp);if(healed>0){u.hp+=healed;this.text(u,'+'+Math.ceil(healed),'#a9efb2');this.fx(u.x,u.y,'#91e4b3',3);this.battle.stats.healing+=healed;}return healed;}
 hurt(u,amount,attacker){if(!u?.alive||u.evacuated)return;const b=this.battle,g=b.groups.find(g=>g.id===u.groupId);let dmg=Math.max(1,Math.round(amount-CLASSES[u.type].def*.45));if(g.shieldUntil>b.tick)dmg=Math.round(dmg*.65);u.hp=Math.max(0,u.hp-dmg);u.hitFlash=9;this.text(u,'−'+dmg,'#f7cf96');this.fx(u.x,u.y,u.team==='blue'?'#d7c0a0':'#d99c76',3);if(attacker?.team==='blue')b.stats.damage+=dmg;
  if(u.hp===0){u.alive=false;u.deadAt=b.tick;u.action=null;if(attacker?.team==='blue'&&attacker.alive){attacker.exp+=18;b.stats.kills++;while(attacker.exp>=attacker.level*60){attacker.exp-=attacker.level*60;attacker.level++;attacker.maxHp=maxHP(attacker);attacker.hp=Math.min(attacker.maxHp,attacker.hp+15);this.text(attacker,'LEVEL UP','#f5e3a1');}}if(this.selectedUnitId===u.id){this.direct=false;this.cycleUnit(1);}}
 }
 skill(){const b=this.battle,u=this.selected;if(!b||this.paused||!u?.alive||u.evacuated)return false;if(u.skillCooldown>0){this.note('고유 스킬 재사용 대기 중');return false;}const g=b.groups.find(g=>g.id===u.groupId),enemies=b.units.filter(v=>v.team!==u.team&&v.alive&&!v.evacuated);
  if(u.type==='infantry'){g.shieldUntil=b.tick+480;for(const v of b.units.filter(v=>v.groupId===g.id&&v.alive))this.fx(v.x,v.y,'#9bbde8',2);}
  if(u.type==='knight'){let hit=0;for(const v of enemies)if(dist(u,v)<65&&b.nav.clear(u,v,0)){this.hurt(v,38+u.level*3,u);hit++;}if(!hit){this.note('회전 베기 범위 안에 적이 없습니다.');return false;}}
  if(u.type==='archer'){const targets=enemies.filter(v=>dist(u,v)<215&&b.nav.clear(u,v,0)).sort((a,c)=>dist(u,a)-dist(u,c)).slice(0,5);if(!targets.length){this.note('사선 안에 표적이 없습니다.');return false;}for(const v of targets)this.shoot(u,v,22+u.level*2);}
  if(u.type==='healer'){let healed=0;for(const v of b.units)if(v.team===u.team&&dist(u,v)<145)healed+=this.heal(v,34+u.level*2);if(!healed){this.note('주변에 회복할 아군이 없습니다.');return false;}}
  u.skillCooldown=14*60;this.note(`${CLASSES[u.type].name} · ${CLASSES[u.type].skill}`);return true;
 }
 healSpell(){const b=this.battle,u=this.selected;if(!b||this.paused||!u?.alive||u.evacuated||b.healCooldown>0)return false;let sum=0;for(const v of b.units)if(v.team==='blue'&&dist(u,v)<145)sum+=this.heal(v,20+u.level*2);if(!sum){this.note('회복이 필요한 아군이 없습니다.');return false;}b.healCooldown=960;this.note(`전술 회복 · HP ${Math.round(sum)}`);return true;}
 shoot(u,target,damage){const d=Math.max(1,dist(u,target));this.battle.projectiles.push({x:u.x,y:u.y,z:20,sx:u.x,sy:u.y,dx:(target.x-u.x)/d,dy:(target.y-u.y)/d,travel:0,total:d,life:d/340+.2,attackerId:u.id,team:u.team,damage});}
 beginAttack(u,target,kind='attack'){if(u.cool>0||u.action)return;const b=this.battle,c=CLASSES[u.type];u.cool=Math.round(c.rate*(1+u.fatigue/230));u.action={kind,targetId:target.id,start:b.tick,hit:b.tick+c.windup,end:b.tick+c.windup+18,done:false};u.yaw=Math.atan2(target.x-u.x,target.y-u.y);u.fatigue=clamp(u.fatigue+1,0,100);}
 move(u,target,mult=1,direct=false){
  const b=this.battle;let p=target;u.pathFailed=false;
  if(!direct&&!b.nav.clear(u,target)){const key=`${Math.floor(target.x/24)}:${Math.floor(target.y/24)}:${b.nav.version}`;if(u.pathKey!==key||u.pathExpiry<=b.tick){u.path=b.nav.path(u,target)||[];u.pathIndex=0;u.pathKey=key;u.pathExpiry=b.tick+100;}while(u.pathIndex<u.path.length&&dist(u,u.path[u.pathIndex])<10)u.pathIndex++;p=u.path[u.pathIndex];if(!p){u.pathFailed=true;return;}}
  else{u.path=[];u.pathIndex=0;}
  const dx=p.x-u.x,dy=p.y-u.y,d=Math.hypot(dx,dy);if(d<2)return;const speed=CLASSES[u.type].speed*(1-.20*u.fatigue/100)*mult,step=Math.min(d,speed*STEP);const ox=u.x,oy=u.y;u.x+=dx/d*step;u.y+=dy/d*step;b.nav.resolve(u);u.vx=(u.x-ox)/STEP;u.vy=(u.y-oy)/STEP;u.yaw=Math.atan2(dx,dy);u.fatigue=clamp(u.fatigue+.26*STEP,0,100);
 }
 closestEnemy(u){let best=null,value=Infinity;for(const v of this.battle.units){if(v.team===u.team||!v.alive||v.evacuated)continue;const d=dist(u,v);if(d<value){value=d;best=v;}}return best;}
 slot(u,g){const i=g.unitIds.indexOf(u.id),n=g.unitIds.length,dir=u.team==='blue'?1:-1;let depth=0,side=0;
  if(g.formation==='column'){depth=Math.floor(i/3)*23;side=(i%3-1)*22;}else if(g.formation==='wedge'){const row=Math.floor(Math.sqrt(i)),offset=i-row*row;depth=row*22;side=(offset-row)*19;}else{const cols=g.formation==='loose'?6:8;depth=Math.floor(i/cols)*(g.formation==='loose'?35:24);side=(i%cols-(Math.min(cols,n)-1)/2)*(g.formation==='loose'?36:22);}
  return {x:clamp(g.anchor.x-dir*depth,28,932),y:clamp(g.anchor.y+side,28,572)};
 }
 siegeAI(u,g){const b=this.battle,gate=b.map.gate;if(!gate||gate.open)return false;const c=CLASSES[u.type];if(u.type==='healer')return false;const left=u.x<gate.x;let y=clamp(u.y,gate.y-gate.h/2+15,gate.y+gate.h/2-15),point={x:gate.x+(left?-1:1)*(gate.w/2+16),y};const edgeDist=Math.max(0,Math.abs(u.x-gate.x)-gate.w/2);if(edgeDist<=c.range&&u.y>=gate.y-gate.h/2&&u.y<=gate.y+gate.h/2){this.beginAttack(u,gate,'gate');}else this.move(u,point,1);return true;}
 ai(u,g){
  const b=this.battle,c=CLASSES[u.type];if(g.order==='retreat'){this.move(u,{x:u.team==='blue'?16:944,y:clamp(u.y,60,540)},1.25);if(u.team==='blue'?u.x<30:u.x>930){u.evacuated=true;u.action=null;this.text(u,'철수','#b0dbed');}return;}
  if(u.action)return;
  if(u.protectedUntil>b.tick){this.move(u,{x:u.team==='blue'?85:880,y:u.y});if(b.tick%60===0)this.heal(u,2);return;}
  const enemy=this.closestEnemy(u);if(!enemy)return;u.targetId=enemy.id;const d=dist(u,enemy);
  if(c.name==='치료사'){
   if(d<65){this.move(u,{x:u.x+(u.x-enemy.x),y:u.y+(u.y-enemy.y)},1.05);return;}
   const allies=b.units.filter(v=>v.team===u.team&&v.alive&&!v.evacuated&&v.hp<v.maxHp*.85).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);const hurt=allies.find(v=>dist(u,v)<230);if(hurt){if(dist(u,hurt)>c.range)this.move(u,hurt);else this.beginAttack(u,hurt,'heal');return;}
  }
  if(g.order==='move'||g.order==='regroup'){const p=this.slot(u,g);if(dist(u,p)>12){this.move(u,p);return;}if(g.order==='move')g.order='hold';if(d>90)return;}
  if(g.order==='hold'){const p=this.slot(u,g);if(dist(u,p)>19&&d>45){this.move(u,p);return;}if(dist(enemy,g.anchor)>170)return;}
  if(g.order==='siege'&&this.siegeAI(u,g))return;
  if(u.hp/u.maxHp<.2&&u.type!=='knight'&&g.order!=='hold'){this.move(u,{x:u.team==='blue'?70:890,y:u.y},1.05);return;}
  const range=c.range,clear=b.nav.clear(u,enemy,0);
  if(d<range+3&&clear){if(u.type==='archer'&&d<65)this.move(u,{x:u.x+(u.x-enemy.x),y:u.y+(u.y-enemy.y)},1.08);else this.beginAttack(u,enemy);}
  else{this.move(u,enemy,g.chargeUntil>b.tick?1.5:1);if(u.pathFailed)this.siegeAI(u,g);}
 }
 tick(input={}){
  const b=this.battle;if(this.mode!=='battle'||this.paused||!b)return;b.tick++;b.time=b.tick*STEP;b.healCooldown=Math.max(0,b.healCooldown-1);
  for(const g of b.groups){if(!g.spawned&&b.tick>=g.arrival)this.spawnGroup(g);if(g.order==='charge'&&b.tick>=g.chargeUntil)g.order='attack';}
  for(const u of b.units){u.vx=0;u.vy=0;if(!u.alive||u.evacuated)continue;u.cool=Math.max(0,u.cool-1);u.skillCooldown=Math.max(0,u.skillCooldown-1);u.hitFlash=Math.max(0,u.hitFlash-1);u.fatigue=Math.max(0,u.fatigue-.1*STEP);if(u.action&&b.tick>u.action.end)u.action=null;const g=b.groups.find(g=>g.id===u.groupId);
   if(u.id===this.selectedUnitId&&this.direct){if(!u.action&&input.move){this.move(u,{x:u.x+input.move.x*100,y:u.y+input.move.y*100},1.12,true);}if(input.attack){const e=this.closestEnemy(u);if(e&&dist(u,e)<=CLASSES[u.type].range+3&&b.nav.clear(u,e,0))this.beginAttack(u,e);else if(b.map.gate&&!b.map.gate.open&&Math.abs(u.x-b.map.gate.x)-b.map.gate.w/2<CLASSES[u.type].range&&Math.abs(u.y-b.map.gate.y)<b.map.gate.h/2)this.beginAttack(u,b.map.gate,'gate');}}
   else this.ai(u,g);u.phase+=Math.hypot(u.vx,u.vy)*STEP*.12;
  }
  // Collect hit intents before applying damage: both attacks can land on the same tick.
  const hits=[];
  for(const u of b.units){if(!u.alive||u.evacuated||!u.action||u.action.done||b.tick<u.action.hit)continue;const a=u.action;a.done=true;const c=CLASSES[u.type];if(a.kind==='gate'){const gate=b.map.gate;if(gate&&!gate.open&&Math.abs(u.x-gate.x)-gate.w/2<=c.range+8&&Math.abs(u.y-gate.y)<gate.h/2+8)hits.push({gate:true,damage:c.atk*.7,attacker:u});continue;}const t=b.units.find(v=>v.id===a.targetId);if(!t?.alive||t.evacuated)continue;
   if(a.kind==='heal'){if(dist(u,t)<=c.range+8)hits.push({heal:true,target:t,damage:18,attacker:u});}else if(dist(u,t)<=c.range+8&&b.nav.clear(u,t,0)){if(u.type==='archer')this.shoot(u,t,c.atk+u.level*2);else hits.push({target:t,damage:c.atk+u.level*2,attacker:u});}
  }
  for(const hit of hits){if(hit.gate)this.gateDamage(hit.damage,hit.attacker);else if(hit.heal)this.heal(hit.target,hit.damage);else this.hurt(hit.target,hit.damage,hit.attacker);}
  this.separate();
  for(const p of b.projectiles){const ox=p.x,oy=p.y;p.x+=p.dx*340*STEP;p.y+=p.dy*340*STEP;p.travel+=340*STEP;p.life-=STEP;p.z=19+Math.sin(Math.min(1,p.travel/Math.max(1,p.total))*Math.PI)*22;if(b.nav.blocks.some(r=>segmentRect(ox,oy,p.x,p.y,r))){p.life=0;continue;}for(const u of b.units)if(u.team!==p.team&&u.alive&&!u.evacuated&&dist(p,u)<12){this.hurt(u,p.damage,b.units.find(u=>u.id===p.attackerId));p.life=0;break;}}
  b.projectiles=b.projectiles.filter(p=>p.life>0);
  for(const p of b.particles){p.life-=STEP;p.x+=p.vx*STEP;p.y+=p.vy*STEP;p.z+=p.vz*STEP;p.vz-=95*STEP;}b.particles=b.particles.filter(p=>p.life>0);
  for(const e of b.effects)e.life-=STEP;b.effects=b.effects.filter(e=>e.life>0);
  const active=team=>b.units.filter(u=>u.team===team&&u.alive&&!u.evacuated).length;
  if(!active('red'))this.endBattle('victory');else if(!active('blue')&&!b.groups.some(g=>g.team==='blue'&&!g.spawned))this.endBattle('defeat');
 }
 separate(){const b=this.battle,grid=new Map(),size=24;for(const u of b.units){if(!u.alive||u.evacuated)continue;const x=Math.floor(u.x/size),y=Math.floor(u.y/size);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const v of grid.get(`${x+dx}:${y+dy}`)||[]){let ox=u.x-v.x,oy=u.y-v.y,d=Math.hypot(ox,oy);if(d>=17)continue;if(d<.001){ox=(u.id%2?1:-1)*.001;oy=.001;d=Math.hypot(ox,oy);}const s=(17-d)*.5;u.x+=ox/d*s;u.y+=oy/d*s;v.x-=ox/d*s;v.y-=oy/d*s;b.nav.resolve(v);}b.nav.resolve(u);const key=`${x}:${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(u);}}
 endBattle(outcome){
  const b=this.battle;if(!b||b.resultApplied)return false;
  const report={outcome,training:b.training,region:REGIONS[b.regionId].name,time:b.time,groups:b.groups.filter(g=>g.team==='blue').map(g=>{const all=b.units.filter(u=>u.groupId===g.id);return {name:g.name,joined:g.spawned,total:all.length,survived:all.filter(u=>u.alive).length,lost:all.filter(u=>!u.alive).length,retreated:all.filter(u=>u.evacuated).length};}),...b.stats};
  if(!b.training){
   const next=clone(this.world);if(next.committedBattles.includes(b.id))return false;
   for(const g of b.groups){if(!g.spawned)continue;let holder,key='roster';if(g.sourceKind==='army')holder=next.armies.find(a=>a.id===g.sourceId);else if(g.sourceKind==='reserve'){holder=next;key='reserve';}else if(g.sourceKind==='enemy')holder=next.enemyArmies.find(e=>e.id===g.sourceId);else if(g.sourceKind==='garrison'){holder=next.regions[g.sourceId];key='garrison';}if(!holder)continue;
    const ids=new Set(g.unitIds);holder[key]=holder[key].filter(u=>!ids.has(u.id));for(const u of b.units.filter(u=>u.groupId===g.id)){if(u.alive)holder[key].push(plainUnit(u));else if(u.team==='blue')next.graveyard.push({id:u.id,type:u.type,level:u.level,turn:next.turn,battle:b.id});}
   }
   next.enemyArmies=next.enemyArmies.filter(e=>e.roster.length);
   const a=next.armies.find(a=>a.id===b.activeArmyId),r=next.regions[b.regionId];
   if(outcome==='victory'){r.owner='blue';a.region=r.id;next.wins++;next.gold+=90;for(const e of next.enemyArmies.filter(e=>e.region===r.id)){const back=REGIONS[e.region].links.find(id=>next.regions[id].owner==='red');if(back!==undefined)e.region=back;}}
   else if(b.ownerBefore==='blue'){r.owner='red';for(const a of next.armies.filter(a=>a.region===r.id)){const safe=REGIONS[r.id].links.find(id=>next.regions[id].owner==='blue');if(safe!==undefined)a.region=safe;else{for(const u of a.roster)next.graveyard.push({id:u.id,type:u.type,level:u.level,turn:next.turn,battle:b.id,captured:true});a.roster=[];}}}
   next.committedBattles.push(b.id);next.committedBattles=next.committedBattles.slice(-300);this.validate(next);this.world=next;
  }
  b.resultApplied=true;this.report=report;this.mode='world';this.paused=false;this.direct=false;this.battle=null;this.selectedUnitId=null;this.selectedGroupId=null;this.autoClock=0;
  this.note(b.training?'연습 종료 · 캠페인 상태 유지':outcome==='victory'?'전투 승리 · 생존자와 경험치를 원래 군단에 반영했습니다.':'전투 종료 · 철수한 병력은 보존됩니다.');this.onChange();return true;
 }
 validate(w=this.world){
  if(!w||!Array.isArray(w.regions)||w.regions.length!==6||!Array.isArray(w.armies)||w.armies.length<1||w.armies.length>5||!Array.isArray(w.reserve)||w.reserve.length>120||!Array.isArray(w.enemyArmies))throw Error('캠페인 구조 오류');
  const ids=new Set(),aids=new Set(),eids=new Set();const checkRoster=(list,limit)=>{if(!Array.isArray(list)||list.length>limit)throw Error('병력 정원 오류');for(const u of list){if(!Number.isInteger(u.id)||u.id<=0||ids.has(u.id)||!Object.hasOwn(CLASSES,u.type)||!Number.isInteger(u.level)||u.level<1||u.level>99||!Number.isFinite(u.hp)||u.hp<=0||u.hp>maxHP(u)||!Number.isFinite(u.exp)||u.exp<0||!Number.isFinite(u.fatigue)||u.fatigue<0||u.fatigue>100)throw Error('병사 데이터 또는 중복 ID 오류: '+u.id);ids.add(u.id);}};
  for(const [i,r] of w.regions.entries()){if(r.id!==i||!['blue','red','neutral'].includes(r.owner))throw Error('거점 데이터 오류');checkRoster(r.garrison,80);}
  for(const a of w.armies){if(!Number.isInteger(a.id)||a.id<0||aids.has(a.id)||!Number.isInteger(a.region)||!w.regions[a.region])throw Error('군단 데이터 오류');aids.add(a.id);checkRoster(a.roster,MAX_ARMY);}
  if(!aids.has(w.activeArmyId))throw Error('활성 군단 오류');checkRoster(w.reserve,120);
  for(const e of w.enemyArmies){if(typeof e.id!=='string'||eids.has(e.id)||!Number.isInteger(e.region)||!w.regions[e.region])throw Error('적 군단 데이터 오류');eids.add(e.id);checkRoster(e.roster,40);}
  if(!Number.isInteger(w.turn)||w.turn<0||!Number.isInteger(w.gold)||w.gold<0||!Number.isInteger(w.wins)||w.wins<0||!Number.isInteger(w.battleSerial)||w.battleSerial<0||!Array.isArray(w.committedBattles)||w.committedBattles.some(v=>typeof v!=='string')||!Array.isArray(w.graveyard))throw Error('진행 상태 오류');
  for(const dead of w.graveyard)if(ids.has(dead.id))throw Error('사망 병사가 생존 목록에 존재합니다.');return {units:ids.size,armies:w.armies.length,maxId:Math.max(0,...ids,...w.graveyard.map(u=>u.id))};
 }
 export(){if(this.mode!=='world')throw Error('전투 종료 후 저장하세요.');const audit=this.validate();if(this.nextId<=audit.maxId)throw Error('ID 카운터 오류');return {schemaVersion:14,game:'FirstQueen4_Web',savedAt:new Date().toISOString(),nextId:this.nextId,world:clone(this.world),supportIds:[...this.supportIds]};}
 import(payload){
  if(this.mode!=='world')throw Error('전투 중에는 불러올 수 없습니다.');let p=clone(payload);const oldNext=this.nextId;
  try{
   if(!p||p.game!=='FirstQueen4_Web'&&!(p.world&&p.uid))throw Error('퍼스트퀸 캠페인 파일이 아닙니다.');if(p.schemaVersion!==14){if(p.schemaVersion!==13&&p.schemaVersion!==undefined)throw Error('지원하지 않는 저장 버전');p=this.migrate13(p);}
   const audit=this.validate(p.world);if(!Number.isInteger(p.nextId)||p.nextId<=audit.maxId)throw Error('저장 ID 카운터 오류');
   this.world=p.world;this.nextId=p.nextId;this.supportIds=Array.isArray(p.supportIds)?[...new Set(p.supportIds.filter(id=>p.world.armies.some(a=>a.id===id&&id!==p.world.activeArmyId)))]:[];
   this.battle=null;this.report=null;this.mode='world';this.selectedRegion=this.activeArmy.region;this.selectedUnitId=null;this.selectedGroupId=null;this.paused=false;this.direct=false;this.options.enemyAuto=false;this.autoClock=0;this.note('캠페인 불러오기 완료 · 무결성 검사 통과');return true;
  }catch(err){this.nextId=oldNext;throw err;}
 }
 migrate13(p){
  const old=p.world;if(!old||!Array.isArray(old.regions)||old.regions.length!==6||!Array.isArray(old.reserve))throw Error('이전 저장 구조 오류');
  let armies=old.armies||[{id:0,name:'카리온 주력군',region:old.current,roster:old.roster}];if(!armies.length||armies.length>5)throw Error('이전 군단 구조 오류');
  const clean=u=>{if(!u||!Object.hasOwn(CLASSES,u.type))throw Error('이전 병종 오류');return {id:u.id,type:u.type,level:u.level??1,exp:u.exp??0,hp:u.hp??maxHP({...u,level:u.level??1}),fatigue:u.fatigue??0};};
  armies=armies.map(a=>({id:a.id,name:String(a.name||'군단').slice(0,60),region:a.region,roster:a.roster.map(clean)}));
  const reserve=old.reserve.map(clean);const oldIds=[...armies.flatMap(a=>a.roster),...reserve].map(u=>u.id);if(oldIds.some(id=>!Number.isInteger(id)||id<=0)||new Set(oldIds).size!==oldIds.length)throw Error('이전 저장에 중복/잘못된 병사 ID가 있습니다.');
  if(!Number.isInteger(p.uid)||p.uid<=Math.max(0,...oldIds))throw Error('이전 ID 카운터 오류');this.nextId=p.uid;
  const regions=REGIONS.map((r,i)=>({...r,owner:old.regions[i].owner,garrison:old.regions[i].owner==='red'?this.makeRoster(i===5?30:22):[]}));
  const enemies=(old.enemyArmies||[]).map(e=>{if(!Number.isInteger(e.strength)||e.strength<0||e.strength>40)throw Error('이전 적군 병력 오류');return {id:e.id,name:String(e.name||'적군').slice(0,60),region:e.region,roster:this.makeRoster(e.strength)};});
  return {game:'FirstQueen4_Web',schemaVersion:14,nextId:this.nextId,supportIds:old.supportArmyIds||[],world:{regions,armies,reserve,activeArmyId:old.armyActiveId??armies[0].id,turn:old.strategicTurn||0,wins:old.wins||0,gold:300,enemyArmies:enemies,graveyard:[],battleSerial:0,committedBattles:[]}};
 }
 debugWin(){if(!this.battle)return;for(const u of this.battle.units)if(u.team==='red'){u.hp=0;u.alive=false;u.deadAt=this.battle.tick;}this.endBattle('victory');}
 debugLose(){if(!this.battle)return;for(const u of this.battle.units)if(u.team==='blue'){u.hp=0;u.alive=false;u.deadAt=this.battle.tick;}for(const g of this.battle.groups)if(g.team==='blue'&&!g.spawned)g.spawned=true;this.endBattle('defeat');}
}
const API={Game,Navigation,CLASSES,REGIONS,ORDERS,STEP,WIDTH,HEIGHT,clamp,dist,maxHP,clone,segmentRect,battlefield};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.FQ=API;
})(typeof globalThis!=='undefined'?globalThis:this);
