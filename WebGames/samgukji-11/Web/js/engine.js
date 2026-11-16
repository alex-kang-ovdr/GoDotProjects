/* RTK11 Web prototype — deterministic, DOM-free game rules.
 * All balance/formulas/map coordinates are reconstructions, not original engine code.
 * Node: const {Engine}=require('./engine.js'); Browser: window.RTK.Engine
 */
(function(root){
'use strict';
const D=typeof module!=='undefined'&&module.exports?require('./data.js'):root.RTK_DATA;
const DIRS=[[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
const RANK={C:0,B:1,A:2,S:3};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clone=o=>JSON.parse(JSON.stringify(o));
const key=(q,r)=>q+','+r;
const axial=t=>({q:t.q-Math.floor(t.r/2),r:t.r});
const offset=t=>({q:t.q+Math.floor(t.r/2),r:t.r});
function distance(a,b){a=axial(a);b=axial(b);return (Math.abs(a.q-b.q)+Math.abs(a.r-b.r)+Math.abs(a.q+a.r-b.q-b.r))/2;}
function neighbors(p){const a=axial(p);return DIRS.map(([q,r])=>offset({q:a.q+q,r:a.r+r}));}
function cubeRound(q,r){let x=q,z=r,y=-x-z,rx=Math.round(x),ry=Math.round(y),rz=Math.round(z);const dx=Math.abs(rx-x),dy=Math.abs(ry-y),dz=Math.abs(rz-z);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return offset({q:rx,r:rz});}
function line(a,b){const n=distance(a,b),aa=axial(a),bb=axial(b),out=[];for(let i=0;i<=n;i++){const t=n?i/n:0;out.push(cubeRound(aa.q+(bb.q-aa.q)*t+1e-6,aa.r+(bb.r-aa.r)*t+1e-6));}return out;}
function extend(a,b,steps=1){const aa=axial(a),bb=axial(b),n=distance(a,b)||1;return cubeRound(bb.q+(bb.q-aa.q)/n*steps,bb.r+(bb.r-aa.r)/n*steps);}
function hash(q,r,s=711){let x=Math.imul(q+319,374761393)^Math.imul(r+471,668265263)^s;x=Math.imul(x^(x>>>13),1274126177);return ((x^(x>>>16))>>>0)/4294967296;}
function terrainMap(){
 const m={cols:D.map.cols,rows:D.map.rows,tiles:[]};
 for(let r=0;r<m.rows;r++)for(let q=0;q<m.cols;q++){
  const h=hash(q,r);let terrain='plain';
  if(q>39+Math.sin(r*.35)*2)terrain='water';
  else if((q<15&&h<.23)||(r<13&&q<24&&h<.13))terrain='mountain';
  else if(h<.22)terrain='forest';else if(h<.36)terrain='hill';
  if(q>=11&&q<=36&&Math.abs(r-(12+Math.sin(q*.27)*2))<.48)terrain='water';
  if(q>=11&&q<=39&&Math.abs(r-(25.4+Math.sin(q*.34)*1.5))<.5)terrain='water';
  m.tiles.push({q,r,terrain,road:false});
 }
 const tile=p=>m.tiles[p.r*m.cols+p.q];
 const inside=p=>p.q>=0&&p.r>=0&&p.q<m.cols&&p.r<m.rows;
 for(const c of D.cities){
  for(const p of [c,...neighbors(c)])if(inside(p)){const t=tile(p);t.terrain='plain';}
 }
 // Every city is linked to three nearest cities, guaranteeing usable corridors.
 for(const c of D.cities){
  const near=D.cities.filter(x=>x.id!==c.id).sort((a,b)=>distance(c,a)-distance(c,b)).slice(0,3);
  for(const other of near)for(const p of line(c,other))if(inside(p)){const t=tile(p);t.road=true;t.terrain=t.terrain==='water'?'ford':t.terrain==='mountain'?'hill':t.terrain;}
 }
 return m;
}
const MAP=terrainMap();
class RuleError extends Error{constructor(message){super(message);this.name='RuleError';}}
class Engine {
 constructor(save){this.s=save?clone(save):null;this.effects=[];if(save)this.validate();}
 static fresh(opts={}){const e=new Engine();e.start(opts);return e;}
 start({faction='cao',difficulty='normal',goal=8,seed=1101200}={}){
  if(!['cao','liu','sun'].includes(faction))throw new RuleError('선택할 수 없는 세력입니다.');
  const s=this.s={schema:1,version:D.version,turn:0,player:faction,difficulty:['easy','normal','hard'].includes(difficulty)?difficulty:'normal',goal:[8,42].includes(Number(goal))?Number(goal):8,rng:(Number(seed)>>>0)||1101200,nextId:1,factions:{},cities:[],officers:[],units:[],fires:[],shipments:[],logs:[],eventQueue:[],eventDone:[],missions:{build:false,recruit:false,battle:false},stats:{battlesWon:0,citiesTaken:0},outcome:null};
  for(const f of D.factions) s.factions[f.id]={id:f.id,ap:100,tp:1500,tech:Object.fromEntries(Object.keys(D.techs).map(k=>[k,0])),research:null,truce:{}};
  s.cities=D.cities.map(c=>({...clone(c),hp:c.faction==='neutral'?1200:c.maxHP,troops:c.faction==='neutral'?2200:13500+(c.specialty==='대도시'?3000:0),gold:c.faction==='neutral'?1200:6500,food:c.faction==='neutral'?10000:47000,order:85,energy:85,gear:{spear:15000,halberd:12000,crossbow:12000,cavalry:12000,ram:1,siege:1},buildings:[],development:[],commands:0}));
  // Development cells are world-space hexes. Claim globally to avoid overlaps.
  const claimed=new Set(s.cities.map(c=>key(c.q,c.r)));
  for(const c of s.cities){
   const candidates=MAP.tiles.filter(t=>distance(c,t)>=1&&distance(c,t)<=4&&t.terrain!=='water'&&t.terrain!=='mountain'&&!claimed.has(key(t.q,t.r))).sort((a,b)=>distance(c,a)-distance(c,b)||a.r-b.r||a.q-b.q);
   c.development=candidates.slice(0,c.slots).map(t=>({q:t.q,r:t.r}));
   for(const p of c.development)claimed.add(key(p.q,p.r));
   ['market','farm','barracks','forge','stable','workshop'].slice(0,c.faction==='neutral'?2:6).forEach((type,slot)=>{if(c.development[slot])c.buildings.push({slot,type,level:1,remaining:0});});
  }
  s.officers=D.officers.map(o=>({...clone(o),acted:false,unit:null,loyalty:100}));
  for(const c of s.cities.filter(c=>c.faction===faction)){c.gold+=2500;c.food+=15000;if(s.difficulty==='easy'){c.troops+=4000;c.gold+=4000;c.food+=15000;}}
  this.log('군웅의 시대가 시작되었습니다. 지도와 세력 배치는 재구성 시나리오입니다.','event');
  const home=this.city(D.factions.find(f=>f.id===faction).capital);
  const name={cao:'하후돈',liu:'관우',sun:'주유'}[faction];
  const leader=s.officers.find(o=>o.name===name);
  const initial=this.deploy(home.id,{leader:leader.id,type:faction==='sun'?'crossbow':'spear',troops:6000,food:10000},true);
  s.factions[faction].ap=this.maxAP(faction);
  // A small hostile force makes first-turn tactical interaction accessible.
  const bpos=MAP.tiles.filter(t=>distance(home,t)>=4&&distance(home,t)<=5&&this.passable(t)&&!this.occupant(t)&&!this.cityAt(t)).sort((a,b)=>distance(initial,a)-distance(initial,b))[0];
  if(bpos){
   const bo={id:'bandit_leader',name:'산적 두목',hanja:'賊',faction:'bandit',city:null,unit:'u'+s.nextId,acted:false,loyalty:100,leadership:58,war:62,intelligence:39,politics:15,charisma:29,skill:'없음',apt:{spear:'B',halberd:'C',crossbow:'C',cavalry:'C',siege:'C',navy:'C'},provenance:'fictional_garrison'};
   s.officers.push(bo);s.units.push({id:'u'+s.nextId++,name:'산적 잔당',faction:'bandit',officers:[bo.id],q:bpos.q,r:bpos.r,type:'spear',troops:s.difficulty==='hard'?4200:2800,food:8000,energy:65,move:4,acted:false,confused:0,home:null,target:home.id});
  }
  this.effects=[];this.validate();return s;
 }
 rand(){let x=this.s.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;this.s.rng=x>>>0;return this.s.rng/4294967296;}
 city(id){return this.s.cities.find(x=>x.id===id);}
 unit(id){return this.s.units.find(x=>x.id===id);}
 officer(id){return this.s.officers.find(x=>x.id===id);}
 tile(p){if(!p||!Number.isInteger(p.q)||!Number.isInteger(p.r)||p.q<0||p.r<0||p.q>=MAP.cols||p.r>=MAP.rows)return null;return MAP.tiles[p.r*MAP.cols+p.q];}
 cityAt(p){return this.s.cities.find(c=>c.q===p.q&&c.r===p.r);}
 occupant(p){return this.s.units.find(u=>u.q===p.q&&u.r===p.r);}
 passable(p){const t=this.tile(p);return !!t&&t.terrain!=='mountain'&&t.terrain!=='water';}
 ownCities(f=this.s.player){return this.s.cities.filter(c=>c.faction===f);}
 ownUnits(f=this.s.player){return this.s.units.filter(u=>u.faction===f);}
 available(c){return this.s.officers.filter(o=>o.city===c.id&&o.faction===c.faction&&!o.unit&&!o.acted);}
 stationed(c){return this.s.officers.filter(o=>o.city===c.id&&o.faction===c.faction&&!o.unit);}
 enemy(a,b){return a!==b&&!(this.s.factions[a]?.truce[b]>this.s.turn);}
 maxAP(f){return Math.min(140,60+this.ownCities(f).length*5+(this.s.factions[f]?.tech.domestic||0)*5);}
 log(text,type='info'){this.s.logs.unshift({turn:this.s.turn,text,type});if(this.s.logs.length>180)this.s.logs.length=180;}
 require(ok,msg){if(!ok)throw new RuleError(msg);}
 assertActive(){this.require(!this.s.outcome,'종료된 캠페인입니다. 새 게임을 시작하세요.');}
 assertCity(c,f=this.s.player){this.assertActive();this.require(c&&c.faction===f,'아군 도시에서만 명령할 수 있습니다.');}
 charge(c,ap=20,gold=0,stat='politics',f=this.s.player){
  this.assertCity(c,f);const fs=this.s.factions[f];this.require(fs.ap>=ap,'행동력이 부족합니다. 다음 턴을 진행하세요.');this.require(c.gold>=gold,'도시의 금이 부족합니다.');
  const o=this.available(c).sort((a,b)=>b[stat]-a[stat])[0];this.require(o,'이번 턴에 행동 가능한 주둔 무장이 없습니다.');
  fs.ap-=ap;c.gold-=gold;c.commands++;o.acted=true;return o;
 }
 ability(u,stat){return Math.max(...u.officers.map(id=>this.officer(id)?.[stat]||0));}
 aptitude(u){const k=['ram','siege'].includes(u.type)?'siege':u.type==='sword'?'spear':u.type;return Math.max(...u.officers.map(id=>RANK[this.officer(id)?.apt[k]]??0));}
 hasSkill(u,skill){return u.officers.some(id=>this.officer(id)?.skill===skill);}
 maxMove(u){const t=D.troops[u.type];return t.move+(u.type==='cavalry'?Math.floor((this.s.factions[u.faction]?.tech.cavalry||0)/2):0);}
 moveCost(u,p){const t=this.tile(p);if(!this.passable(p))return Infinity;if(t.road)return 1;if(t.terrain==='forest')return u.type==='cavalry'?3:2;if(t.terrain==='hill'||t.terrain==='ford')return 2;return 1;}
 zoc(u,p){return this.s.units.some(e=>this.enemy(u.faction,e.faction)&&distance(p,e)===1);}
 reachable(u,budget=u.move){
  const costs=new Map([[key(u.q,u.r),0]]),prev=new Map(),open=[{q:u.q,r:u.r,cost:0}];
  while(open.length){open.sort((a,b)=>a.cost-b.cost);const p=open.shift(),pk=key(p.q,p.r);if(p.cost!==costs.get(pk))continue;
   if(p.cost>0&&this.zoc(u,p))continue;
   for(const n of neighbors(p)){
    const c=this.cityAt(n),occupier=this.occupant(n);if(occupier&&occupier.id!==u.id)continue;if(c&&c.faction!==u.faction)continue;
    const cost=p.cost+this.moveCost(u,n),k=key(n.q,n.r);if(cost>budget||!Number.isFinite(cost)||(costs.has(k)&&costs.get(k)<=cost))continue;
    costs.set(k,cost);prev.set(k,pk);open.push({...n,cost});
   }
  }return {costs,prev};
 }
 pathTo(u,target,budget=999){
  const range=D.troops[u.type].range,goal=p=>distance(p,target)<=range&&distance(p,target)>0&&this.lineClear(p,target);
  const open=[{q:u.q,r:u.r,g:0,f:distance(u,target)}],best=new Map([[key(u.q,u.r),0]]),prev=new Map();let found=null,iterations=0;
  while(open.length&&iterations++<MAP.tiles.length*2){open.sort((a,b)=>a.f-b.f);const p=open.shift(),pk=key(p.q,p.r);if(p.g!==best.get(pk))continue;if(goal(p)){found=p;break;}
   for(const n of neighbors(p)){const occ=this.occupant(n),c=this.cityAt(n);if(occ&&occ.id!==u.id)continue;if(c&&c.faction!==u.faction)continue;const g=p.g+this.moveCost(u,n),k=key(n.q,n.r);if(g>budget||!Number.isFinite(g)||(best.has(k)&&best.get(k)<=g))continue;best.set(k,g);prev.set(k,pk);open.push({...n,g,f:g+Math.max(0,distance(n,target)-range)});}
  }
  if(!found)return [];const out=[];let k=key(found.q,found.r);while(k!==key(u.q,u.r)){out.unshift(k.split(',').map(Number));k=prev.get(k);if(!k)break;}return out.map(([q,r])=>({q,r}));
 }
 move(id,p,f=this.s.player){
  this.assertActive();const u=this.unit(id);this.require(u&&u.faction===f,'아군 부대를 선택하세요.');this.require(!u.acted&&!u.confused,'행동을 마쳤거나 혼란 상태입니다.');
  const res=this.reachable(u),cost=res.costs.get(key(p.q,p.r));this.require(cost!==undefined&&cost>0,'이동할 수 없는 위치입니다.');const from={q:u.q,r:u.r};
  u.q=p.q;u.r=p.r;u.move-=cost;if(this.zoc(u,p))u.move=0;
  this.effects.push({type:'move',from,to:{q:u.q,r:u.r},unit:u.id});return u;
 }
 train(cId,f=this.s.player){const c=this.city(cId);this.require(c&&c.energy<100,'이미 훈련 기력이 최대입니다.');const o=this.charge(c,20,200,'leadership',f);const gain=12+Math.floor(o.leadership/8);c.energy=clamp(c.energy+gain,0,100);this.s.factions[f].tp+=20;this.log(`${c.name}: ${o.name}의 훈련, 기력 +${gain}.`);}
 patrol(cId,f=this.s.player){const c=this.city(cId);this.require(c&&c.order<100,'이미 치안이 최대입니다.');const o=this.charge(c,20,150,'charisma',f);const gain=8+Math.floor(o.charisma/10);c.order=clamp(c.order+gain,0,100);this.s.factions[f].tp+=15;this.log(`${c.name}: ${o.name}의 순찰, 치안 +${gain}.`);}
 recruit(cId,f=this.s.player){
  const c=this.city(cId);this.require(c&&c.troops<80000,'병력 수용 한도입니다.');this.require(c.order>=45,'치안 45 이상이 필요합니다.');const o=this.charge(c,20,400,'charisma',f),lev=this.facilityLevel(c,'barracks');
  const gain=Math.floor((600+o.charisma*12)*(1+lev*.25));c.troops=Math.min(80000,c.troops+gain);c.energy=clamp(c.energy-6,0,100);c.order=clamp(c.order-7,0,100);this.s.factions[f].tp+=25;
  this.log(`${c.name}: ${o.name}이 ${gain.toLocaleString()}명을 모집했습니다.`);if(f===this.s.player)this.mission('recruit');return gain;
 }
 repair(cId,f=this.s.player){const c=this.city(cId);this.require(c&&c.hp<c.maxHP,'성벽 내구도가 최대입니다.');const o=this.charge(c,20,400,'politics',f);const gain=Math.floor((400+o.politics*6)*(1+this.s.factions[f].tech.engineering*.1));c.hp=Math.min(c.maxHP,c.hp+gain);this.log(`${c.name}: 성벽 복구 +${gain}.`);}
 facilityLevel(c,type){return Math.max(0,...c.buildings.filter(b=>b.type===type&&!b.remaining).map(b=>b.level));}
 build(cId,type,slot,f=this.s.player){
  const c=this.city(cId),def=D.facilities[type];this.require(c&&def,'시설 종류를 확인하세요.');this.require(Number.isInteger(slot)&&slot>=0&&slot<c.development.length,'개발지를 선택하세요.');this.require(!c.buildings.some(b=>b.slot===slot),'이미 사용 중인 개발지입니다.');
  const o=this.charge(c,20,def.cost,'politics',f);c.buildings.push({slot,type,level:1,remaining:Math.max(1,def.turns-(o.politics>=90?1:0))});this.s.factions[f].tp+=25;this.log(`${c.name}: ${o.name}이 ${def.name} 건설을 시작했습니다.`);if(f===this.s.player)this.mission('build');
 }
 upgrade(cId,slot,f=this.s.player){const c=this.city(cId),b=c?.buildings.find(x=>x.slot===slot);this.require(b&&!b.remaining&&b.level<3,'완공된 1~2레벨 시설만 강화할 수 있습니다.');this.charge(c,20,D.facilities[b.type].cost*b.level,'politics',f);b.level++;b.remaining=2;this.log(`${c.name}: ${D.facilities[b.type].name} ${b.level}단계 강화 시작. (재구성 규칙)`);}
 demolish(cId,slot,f=this.s.player){const c=this.city(cId),b=c?.buildings.find(x=>x.slot===slot);this.require(b,'시설이 없습니다.');this.charge(c,10,0,'politics',f);c.buildings=c.buildings.filter(x=>x!==b);this.log(`${c.name}: 시설 철거.`);}
 produce(cId,type,f=this.s.player){
  const c=this.city(cId),def=D.troops[type];this.require(c&&def&&def.gear,'생산할 병장을 선택하세요.');const lv=this.facilityLevel(c,def.facility);this.require(lv>0,`${D.facilities[def.facility].name} 완공이 필요합니다.`);
  const o=this.charge(c,20,['ram','siege'].includes(type)?1000:600,'politics',f);const amount=['ram','siege'].includes(type)?1:Math.floor((1300+o.politics*12)*(1+.25*(lv-1))*(o.skill==='능리'?1.2:1));c.gear[type]+=amount;this.s.factions[f].tp+=25;this.log(`${c.name}: ${def.name} 병장 ${amount.toLocaleString()} 생산.`);return amount;
 }
 trade(cId,direction,f=this.s.player){const c=this.city(cId);this.require(['buy','sell'].includes(direction),'거래 종류가 잘못되었습니다.');if(direction==='buy'){this.charge(c,10,500,'politics',f);c.food+=5000;}else{this.require(c&&c.food>=6000,'판매할 군량 6,000이 필요합니다.');this.charge(c,10,0,'politics',f);c.food-=6000;c.gold+=500;}this.log(`${c.name}: 군량 ${direction==='buy'?'5,000 구매':'6,000 판매'}.`);}
 deploy(cId,opts={},initial=false,f=this.s.player){
  const c=this.city(cId);this.assertCity(c,f);const type=opts.type||'spear',def=D.troops[type];this.require(def,'병과를 확인하세요.');
  const count=Number(opts.troops),food=Number(opts.food),ids=[opts.leader,...(opts.deputies||[])];
  this.require(ids.length<=3&&new Set(ids).size===ids.length,'주장 1명과 서로 다른 부장 최대 2명이 필요합니다.');
  const officers=ids.map(id=>this.officer(id));this.require(officers.every(o=>o&&o.faction===f&&o.city===c.id&&!o.unit&&(!o.acted||initial)),'출진 가능한 주둔 무장을 선택하세요.');
  this.require(Number.isInteger(count)&&count>=1000&&count<=10000&&c.troops>=count+500,'병력 1,000~10,000명, 주둔 병력 500명 이상을 남겨야 합니다.');
  this.require(Number.isInteger(food)&&food>=1000&&c.food>=food,'군량 1,000 이상을 적재해야 합니다.');
  const gearNeed=['ram','siege'].includes(type)?1:count;if(def.gear)this.require(c.gear[def.gear]>=gearNeed,'병장이 부족합니다. 생산하거나 병력을 줄이세요.');
  const enemies=this.s.cities.filter(x=>x.faction!==f),near=enemies.sort((a,b)=>distance(c,a)-distance(c,b))[0]||c;
  const pos=neighbors(c).filter(t=>this.passable(t)&&!this.occupant(t)&&!this.cityAt(t)).sort((a,b)=>distance(a,near)-distance(b,near))[0];this.require(pos,'도시 주변에 출진할 빈 공간이 없습니다.');
  const fs=this.s.factions[f];this.require(initial||fs.ap>=10,'출진 행동력 10이 필요합니다.');if(!initial)fs.ap-=10;c.troops-=count;c.food-=food;if(def.gear)c.gear[def.gear]-=gearNeed;
  const u={id:'u'+this.s.nextId++,name:officers[0].name+' 부대',faction:f,officers:ids,q:pos.q,r:pos.r,type,troops:count,food,energy:c.energy,move:0,acted:false,confused:0,home:c.id,target:null};u.move=this.maxMove(u);this.s.units.push(u);for(const o of officers){o.unit=u.id;o.city=null;o.acted=true;}
  this.log(`${c.name}: ${officers[0].name} ${def.name} ${count.toLocaleString()}명 출진.`,'deploy');return u;
 }
 lineClear(a,b){return line(a,b).slice(1,-1).every(p=>{const t=this.tile(p);return t&&t.terrain!=='mountain';});}
 tactics(u){return D.tactics.filter(t=>t.troop===u.type&&RANK[t.rank]<=this.aptitude(u));}
 energyCost(u,amount){return this.hasSkill(u,'백출')?1:amount;}
 legalTarget(u,target,mode='attack',tactic=null){
  if(!target||!this.enemy(u.faction,target.faction))return false;
  if(mode==='confuse')return !!target.officers&&distance(u,target)<=2+(this.hasSkill(u,'귀모')?1:0);
  if(mode==='tactic'&&!target.officers)return false;
  const d=distance(u,target);if(d<1||d>D.troops[u.type].range||!this.lineClear(u,target))return false;
  if(mode==='tactic'&&u.type==='cavalry'&&['forest','ford'].includes(this.tile(target).terrain))return false;
  return true;
 }
 damage(u,target,power=1,variation=1){
  const troop=D.troops[u.type],war=this.ability(u,'war'),lead=this.ability(u,'leadership'),apt=.7+.1*this.aptitude(u),tech=this.s.factions[u.faction].tech;
  let offense=(35+war*.62+lead*.18)*troop.attack*apt*(.55+u.energy/200)*(1+Math.sqrt(u.troops/6000)*.7)*power;
  if(['spear','halberd','crossbow'].includes(u.type))offense*=1+.08*tech.infantry;
  if(u.type==='cavalry')offense*=1+.1*tech.cavalry;
  if(!target.officers){let n=Math.floor(offense*2.1*variation);if(u.type==='ram')n*=3.4;if(u.type==='siege')n*=1.7;return Math.max(30,Math.floor(n*(1+tech.engineering*.15)));}
  let defense=(40+this.ability(target,'leadership')*.65)*D.troops[target.type].defense*(.7+.1*this.aptitude(target));
  if(['spear','halberd','crossbow'].includes(target.type))defense*=1+.08*this.s.factions[target.faction].tech.infantry;
  const terrain=this.tile(target)?.terrain;if(terrain==='forest')defense*=1.15;if(terrain==='hill')defense*=1.1;
  const beats={spear:'cavalry',cavalry:'halberd',halberd:'spear'};let match=beats[u.type]===target.type?1.18:beats[target.type]===u.type?.88:1;
  return Math.max(80,Math.floor((offense*7)*(100/(defense+45))*match*variation));
 }
 prediction(u,t,mode='attack',tacticId=null){
  if(mode==='confuse'){const immune=this.hasSkill(t,'통찰');return {min:0,max:0,success:immune?0:clamp(60+(this.ability(u,'intelligence')-this.ability(t,'intelligence'))*1.1,10,95),counter:0};}
  const tac=D.tactics.find(x=>x.id===tacticId),pow=mode==='tactic'?(tac?.power||1):1,n=this.damage(u,t,pow);
  return {min:Math.floor(n*.9),max:Math.floor(n*1.1),success:mode==='tactic'?clamp(67+this.aptitude(u)*7+(this.ability(u,'war')-(t.officers?this.ability(t,'war'):70))*.2,50,98):100,counter:t.officers&&distance(u,t)===1&&mode==='attack'?Math.floor(this.damage(t,u)*.35):0};
 }
 combatReady(u,f){this.assertActive();this.require(u&&u.faction===f,'아군 부대를 선택하세요.');this.require(!u.acted&&!u.confused,'행동 완료 또는 혼란 상태입니다.');}
 hit(target,amount,actor,kind='damage'){
  if(target.officers){target.troops=Math.max(0,target.troops-amount);this.effects.push({type:kind,at:{q:target.q,r:target.r},text:'−'+amount,color:'#efaa91'});if(target.troops<=0)this.destroy(target,actor);}
  else{target.hp=Math.max(0,target.hp-amount);target.troops=Math.max(0,target.troops-Math.floor(amount*.55));this.effects.push({type:kind,at:{q:target.q,r:target.r},text:'성벽 −'+amount,color:'#edc079'});if(target.hp===0)this.capture(target,actor);}
 }
 destroy(u,actor=null){
  if(!this.unit(u.id))return;this.log(`${u.name}이 궤멸했습니다.`,'battle');const homes=this.ownCities(u.faction).sort((a,b)=>distance(a,u)-distance(b,u));
  for(const id of u.officers){const o=this.officer(id);o.unit=null;o.city=homes[0]?.id||null;o.acted=true;if(!homes.length)o.faction='neutral';}
  this.s.units=this.s.units.filter(x=>x.id!==u.id);if(actor?.faction===this.s.player){this.s.stats.battlesWon++;this.s.factions[actor.faction].tp+=100;this.mission('battle');}
 }
 capture(c,u){
  this.require(u,'점령 부대가 없습니다.');const old=c.faction;c.faction=u.faction;c.hp=Math.floor(c.maxHP*.28);c.troops=Math.max(800,Math.min(c.troops,2500));c.order=50;c.energy=55;c.gold=Math.floor(c.gold*.8);
  const fallback=this.ownCities(old).sort((a,b)=>distance(a,c)-distance(b,c))[0];
  for(const o of this.s.officers.filter(o=>o.city===c.id&&!o.unit)){if(o.provenance==='fictional_garrison'||!fallback){o.faction=u.faction;o.loyalty=70;o.acted=true;}else o.city=fallback.id;}
  this.s.factions[u.faction].tp+=150;this.log(`${u.name}이 ${c.name}을 점령했습니다!`,'capture');
  if(u.faction===this.s.player){this.s.stats.citiesTaken++;this.mission('battle');}this.checkEnd();
 }
 attack(id,targetId,mode='attack',tacticId=null,f=this.s.player){
  const u=this.unit(id),target=this.unit(targetId)||this.city(targetId);this.combatReady(u,f);
  this.require(['attack','tactic','confuse'].includes(mode),'공격 명령이 잘못되었습니다.');
  const tac=mode==='tactic'?this.tactics(u).find(t=>t.id===tacticId):null;if(mode==='tactic')this.require(tac,'적성이 부족하거나 사용할 수 없는 전법입니다.');
  this.require(this.legalTarget(u,target,mode,tac),'사거리·지형·대상 조건을 확인하세요.');const cost=mode==='tactic'?tac.cost:mode==='confuse'?this.energyCost(u,15):0;this.require(u.energy>=cost,'기력이 부족합니다.');
  const prediction=this.prediction(u,target,mode,tacticId);u.energy-=cost;u.acted=true;u.move=0;const success=this.rand()*100<prediction.success;
  if(!success){this.log(`${u.name}: ${mode==='confuse'?'교란':tac?.name||'공격'} 실패.`,'battle');this.effects.push({type:'text',at:target,text:'실패',color:'#dccda8'});return {success:false};}
  if(mode==='confuse'){target.confused=2;this.s.factions[f].tp+=20;this.log(`${u.name}의 교란! ${target.name} 혼란.`,'battle');this.effects.push({type:'text',at:target,text:'혼란',color:'#d9a6dd'});return {success:true};}
  let power=tac?.power||1;const crit=mode==='tactic'&&(this.rand()<.12||this.hasSkill(u,'비장')||(u.type==='halberd'&&this.hasSkill(u,'극신'))||(u.type==='cavalry'&&this.hasSkill(u,'기신')));if(crit)power*=1.25;
  const amount=this.damage(u,target,power,.9+this.rand()*.2),targetPos={q:target.q,r:target.r};
  let others=[];
  if(tac?.effect==='area')others=this.s.units.filter(e=>e.id!==target.id&&this.enemy(f,e.faction)&&distance(u,e)===1);
  if(tac?.effect==='sweep')others=this.s.units.filter(e=>e.id!==target.id&&this.enemy(f,e.faction)&&distance(u,e)===1&&distance(target,e)===1);
  if(tac?.effect==='splash')others=this.s.units.filter(e=>e.id!==target.id&&this.enemy(f,e.faction)&&distance(target,e)===1);
  if(tac?.effect==='pierce'){const b=extend(u,target,1),e=this.occupant(b);if(e&&this.enemy(f,e.faction))others=[e];}
  this.hit(target,amount,u);for(const e of others)if(this.unit(e.id))this.hit(e,Math.floor(this.damage(u,e,power)*.8),u);
  if(mode==='attack'&&this.unit(target.id)&&distance(u,target)===1){const retaliation=Math.floor(this.damage(target,u,.35,.9+this.rand()*.2));this.hit(u,retaliation,target);}
  if(this.unit(target.id)&&tac){
   if(tac.effect==='confuse'&&!this.hasSkill(target,'통찰'))target.confused=2;
   if(['push','charge'].includes(tac.effect)){for(let i=0;i<tac.distance;i++){const p=extend(u,target,1);if(!this.passable(p)||this.occupant(p)||this.cityAt(p)){this.hit(target,180,u);break;}target.q=p.q;target.r=p.r;}if(tac.effect==='charge'&&!this.occupant(targetPos)&&!this.cityAt(targetPos)){u.q=targetPos.q;u.r=targetPos.r;}}
   if(tac.effect==='break'){const p=extend(u,target,1);if(this.passable(p)&&!this.occupant(p)&&!this.cityAt(p)){u.q=p.q;u.r=p.r;}}
   if(tac.effect==='pull'){const p=extend(target,u,1);if(this.passable(p)&&!this.occupant(p)&&!this.cityAt(p)){target.q=u.q;target.r=u.r;u.q=p.q;u.r=p.r;}}
  }
  if(tac?.effect==='fire')this.ignite(targetPos,f);
  this.s.factions[f].tp+=mode==='tactic'?25:12;this.log(`${u.name} → ${target.name}: ${tac?.name||'공격'}${crit?' 회심':''}, ${amount.toLocaleString()} 피해.`,'battle');this.checkEnd();return {success:true,damage:amount,crit};
 }
 ignite(p,owner){const fire=this.s.fires.find(x=>x.q===p.q&&x.r===p.r);if(fire){fire.remaining=2;fire.owner=owner;}else this.s.fires.push({q:p.q,r:p.r,remaining:2,owner});}
 fire(id,p,f=this.s.player){const u=this.unit(id);this.combatReady(u,f);this.require(this.tile(p)&&distance(u,p)>0&&distance(u,p)<=2,'화계는 1~2칸 안의 헥스에 사용합니다.');this.require(this.tile(p).terrain!=='water','수면에는 불을 붙일 수 없습니다.');const cost=this.energyCost(u,15);this.require(u.energy>=cost,'기력이 부족합니다.');u.energy-=cost;u.acted=true;u.move=0;this.ignite(p,f);this.s.factions[f].tp+=20;this.log(`${u.name}이 화계를 사용했습니다. 아군도 화재 피해를 받습니다.`,'battle');}
 rest(id,f=this.s.player){const u=this.unit(id);this.combatReady(u,f);u.acted=true;u.move=0;u.energy=clamp(u.energy+18,0,100);this.log(`${u.name}: 대기, 기력 +18.`);}
 resupply(id,f=this.s.player){const u=this.unit(id);this.combatReady(u,f);const c=this.ownCities(f).find(c=>distance(c,u)<=1&&c.food>=1000);this.require(c,'군량이 있는 아군 도시에 인접해야 합니다.');const n=Math.min(8000,c.food);c.food-=n;u.food+=n;u.acted=true;u.move=0;u.energy=clamp(u.energy+10,0,100);this.log(`${u.name}: ${c.name}에서 군량 ${n.toLocaleString()} 보급.`);}
 enter(id,f=this.s.player){const u=this.unit(id);this.combatReady(u,f);const c=this.ownCities(f).find(c=>distance(c,u)<=1);this.require(c,'아군 도시에 인접해야 합니다.');c.troops=Math.min(80000,c.troops+u.troops);c.food+=u.food;const def=D.troops[u.type];if(def.gear)c.gear[def.gear]+=['ram','siege'].includes(u.type)?1:u.troops;for(const oid of u.officers){const o=this.officer(oid);o.city=c.id;o.unit=null;o.acted=true;}this.s.units=this.s.units.filter(x=>x.id!==id);this.log(`${u.name}이 ${c.name}에 입성했습니다.`);}
 research(type,f=this.s.player){
  this.assertActive();const fs=this.s.factions[f],tech=D.techs[type],lv=fs.tech[type];this.require(tech,'기교를 선택하세요.');this.require(!fs.research,'이미 연구를 진행 중입니다.');this.require(lv<4,'최대 연구 단계입니다.');const gold=[1000,2000,5000,10000][lv],tp=[1000,2000,3000,5000][lv];
  const c=this.ownCities(f).filter(c=>c.gold>=gold&&this.available(c).length).sort((a,b)=>b.gold-a.gold)[0];this.require(c,'비용과 행동 가능한 무장을 갖춘 도시가 없습니다.');this.require(fs.tp>=tp,`기교 포인트 ${tp.toLocaleString()}이 필요합니다.`);
  this.charge(c,20,gold,'intelligence',f);fs.tp-=tp;fs.research={type,level:lv+1,remaining:3+lv*2};this.log(`${D.factions.find(x=>x.id===f).name}: ${tech.name} ${lv+1}단계 연구 시작.`);
 }
 diplomacy(other,f=this.s.player){const fs=this.s.factions[f];this.require(this.ownCities(other).length&&other!==f,'정전 대상 세력을 확인하세요.');this.require(!(fs.truce[other]>this.s.turn),'이미 정전 중입니다.');const c=this.ownCities(f).filter(c=>c.gold>=1500&&this.available(c).length).sort((a,b)=>b.gold-a.gold)[0];this.require(c,'금 1,500과 행동 가능한 무장이 필요합니다.');this.charge(c,20,1500,'charisma',f);fs.truce[other]=this.s.turn+7;this.s.factions[other].truce[f]=this.s.turn+7;this.log(`${D.factions.find(x=>x.id===other).name} 세력과 6턴 정전 체결. (확정 수락 재구성 규칙)`,'event');}
 transfer(fromId,toId,amounts,f=this.s.player){
  const a=this.city(fromId),b=this.city(toId);this.assertCity(a,f);this.assertCity(b,f);this.require(a.id!==b.id,'서로 다른 도시를 선택하세요.');const v={gold:0,food:0,troops:0};
  for(const k of Object.keys(v)){v[k]=Number(amounts[k]||0);this.require(Number.isInteger(v[k])&&v[k]>=0&&v[k]<=a[k]-(k==='troops'?500:0),'수송 자원을 확인하세요.');}this.require(v.gold+v.food+v.troops>0,'수송할 자원이 없습니다.');this.charge(a,20,0,'politics',f);for(const k of Object.keys(v))a[k]-=v[k];this.s.shipments.push({id:'s'+this.s.nextId++,from:a.id,to:b.id,faction:f,...v,remaining:Math.max(1,Math.ceil(distance(a,b)/4))});this.log(`${a.name} → ${b.name} 수송 출발. (자동 수송, 지도 부대 아님)`);
 }
 mission(type){if(this.s.missions[type])return;this.s.missions[type]=true;const c=this.ownCities()[0];if(c)c.gold+=500;this.s.factions[this.s.player].tp+=100;this.log(`첫 ${ {build:'개발',recruit:'징병',battle:'전과'}[type]} 목표 달성: 금 +500, 기교 +100.`,'event');}
 income(c){
  let gold=c.baseGold,food=c.baseFood;
  for(const b of c.buildings){if(b.remaining)continue;const p=c.development[b.slot];const boost=type=>c.buildings.some(x=>x.type===type&&!x.remaining&&distance(c.development[x.slot],p)===1)?1.5:1;
   if(b.type==='market')gold+=D.facilities.market.income*b.level*boost('mint');if(b.type==='farm')food+=D.facilities.farm.income*b.level*boost('granary');}
  const factor=(.55+c.order*.0045)*(1+this.s.factions[c.faction].tech.domestic*.1);return {gold:Math.floor(gold*factor),food:Math.floor(food*factor)};
 }
 resolveEvent(index){this.assertActive();const id=this.s.eventQueue[0],e=D.events.find(x=>x.id===id),choice=e?.choices[index];this.require(choice,'이벤트 선택지를 확인하세요.');const c=this.ownCities()[0];this.require(c,'선택을 적용할 도시가 없습니다.');this.require(c.gold+(choice.gold||0)>=0&&c.food+(choice.food||0)>=0,'선택에 필요한 자원이 부족합니다.');c.gold+=choice.gold||0;c.food+=choice.food||0;c.order=clamp(c.order+(choice.order||0),0,100);c.gear.spear+=choice.gear||0;this.s.factions[this.s.player].tp+=choice.tp||0;if(choice.allOrder)for(const x of this.ownCities())x.order=clamp(x.order+choice.allOrder,0,100);this.s.eventQueue.shift();this.s.eventDone.push(id);this.log(`${e.title} — ${choice.label}`,'event');}
 ai(f){
  if(f==='neutral'||f===this.s.player)return;const cities=this.ownCities(f),fs=this.s.factions[f];
  for(const c of cities){
   try{
    const hostile=this.s.units.some(u=>this.enemy(f,u.faction)&&distance(c,u)<5);
    if((this.s.turn%3===0||hostile)&&c.troops>9500&&this.available(c).length&&this.ownUnits(f).length<Math.min(12,cities.length+2)){
     const leader=this.available(c).sort((a,b)=>b.leadership+b.war-a.leadership-a.war)[0];let type=['spear','halberd','crossbow','cavalry'][Math.floor(this.rand()*4)];if(c.gear[type]<5000)type='sword';
     const count=Math.min(7500,c.troops-4000,type==='sword'?10000:c.gear[type]);if(count>=1000&&c.food>=6000)this.deploy(c.id,{leader:leader.id,type,troops:count,food:Math.min(12000,c.food-2000)},false,f);
    }
    if(!this.available(c).length)continue;
    if(c.hp<c.maxHP*.7&&c.gold>=400)this.repair(c.id,f);
    else if(c.order<65&&c.gold>=150)this.patrol(c.id,f);
    else if(c.troops<12000&&c.gold>=400&&c.order>=45)this.recruit(c.id,f);
    else if(c.energy<80&&c.gold>=200)this.train(c.id,f);
    else if(c.gold>1400&&this.s.turn%3===1){const slot=c.development.findIndex((p,i)=>!c.buildings.some(b=>b.slot===i));if(slot>=0)this.build(c.id,this.s.turn%2?'market':'farm',slot,f);}
   }catch(err){if(!(err instanceof RuleError))throw err;}
  }
  for(const copy of [...this.ownUnits(f)]){
   const u=this.unit(copy.id);if(!u||u.acted||u.confused)continue;
   try{
    const supply=cities.filter(c=>distance(c,u)<=1&&c.food>1000)[0];
    if(u.food<1500&&supply){this.resupply(u.id,f);continue;}
    if(u.troops<1200&&cities.length){const home=cities.sort((a,b)=>distance(a,u)-distance(b,u))[0];if(distance(home,u)<=1){this.enter(u.id,f);continue;}u.target=home.id;const path=this.pathTo(u,home);this.aiMove(u,path);continue;}
    let targets=[...this.s.units.filter(e=>this.enemy(f,e.faction)),...this.s.cities.filter(e=>this.enemy(f,e.faction))];
    let close=targets.filter(t=>this.legalTarget(u,t)).sort((a,b)=>(a.officers?0:1)-(b.officers?0:1)||(a.troops||0)-(b.troops||0))[0];
    if(!close){
     const danger=this.s.units.filter(e=>this.enemy(f,e.faction)&&cities.some(c=>distance(c,e)<5)&&distance(u,e)<10).sort((a,b)=>distance(a,u)-distance(b,u))[0];
     const target=danger||this.s.cities.filter(c=>this.enemy(f,c.faction)).sort((a,b)=>(distance(a,u)+(a.faction==='neutral'?-2:0))-(distance(b,u)+(b.faction==='neutral'?-2:0)))[0];
     if(target){u.target=target.id;this.aiMove(u,this.pathTo(u,target));}
     close=targets.filter(t=>(!t.officers||this.unit(t.id))&&this.legalTarget(u,t)).sort((a,b)=>(a.officers?0:1)-(b.officers?0:1))[0];
    }
    if(close&&this.unit(u.id)){
     const ts=this.tactics(u).filter(t=>u.energy>=t.cost&&this.legalTarget(u,close,'tactic',t));
     if(close.officers&&this.ability(u,'intelligence')-this.ability(close,'intelligence')>30&&u.energy>=this.energyCost(u,15)&&!close.confused&&this.rand()<.35)this.attack(u.id,close.id,'confuse',null,f);
     else if(close.officers&&ts.length&&this.rand()<.7){const t=ts[ts.length-1];this.attack(u.id,close.id,'tactic',t.id,f);}else this.attack(u.id,close.id,'attack',null,f);
    }else if(!u.acted&&this.unit(u.id))this.rest(u.id,f);
   }catch(err){if(!(err instanceof RuleError))throw err;}
  }
  if(fs.tp>=1000&&!fs.research&&this.s.turn%6===3){try{this.research(['infantry','logistics','cavalry'][Math.floor(this.rand()*3)],f);}catch(err){if(!(err instanceof RuleError))throw err;}}
 }
 aiMove(u,path){let last=null,cost=0;const reachable=this.reachable(u);for(const p of path){const n=reachable.costs.get(key(p.q,p.r));if(n===undefined||n>u.move)break;last=p;cost=n;if(this.zoc(u,p))break;}if(last&&cost>0)this.move(u.id,last,u.faction);}
 nextTurn(){
  this.assertActive();this.require(!this.s.eventQueue.length,'먼저 도착한 이벤트의 선택을 마쳐주세요.');this.effects=[];
  for(const f of D.factions){if(this.s.outcome)break;this.ai(f.id);}
  if(this.s.outcome)return;
  this.s.turn++;
  for(const fire of this.s.fires){const u=this.occupant(fire),c=this.cityAt(fire);if(u&&!this.hasSkill(u,'화신')){const damage=Math.min(u.troops,Math.floor(180+u.troops*.06));this.hit(u,damage,null);this.log(`${u.name}: 화재 ${damage} 피해.`,'battle');}if(c)c.hp=Math.max(1,c.hp-100);fire.remaining--;}
  this.s.fires=this.s.fires.filter(f=>f.remaining>0);
  for(const c of this.s.cities){
   for(const b of c.buildings)if(b.remaining>0&&--b.remaining===0&&c.faction===this.s.player)this.log(`${c.name}: ${D.facilities[b.type].name} ${b.level}단계 완공.`,'event');
   const consumption=Math.ceil(c.troops*.015);if(c.food<consumption){c.troops=Math.max(0,c.troops-Math.floor(c.troops*.03));c.order=clamp(c.order-3,0,100);}c.food=Math.max(0,c.food-consumption);
   const inc=this.income(c);if(this.s.turn%3===0)c.gold+=inc.gold;if(this.s.turn%9===0)c.food+=inc.food;c.commands=0;
   if(c.faction!=='neutral')for(const u of [...this.s.units])if(this.enemy(c.faction,u.faction)&&distance(c,u)===1){const damage=Math.min(600,Math.floor(110+c.troops*.025));this.hit(u,damage,null);}
   if(c.faction!==this.s.player&&c.faction!=='neutral'&&this.s.turn%3===0){const bonus={easy:0,normal:100,hard:600}[this.s.difficulty];c.gold+=bonus;if(this.s.difficulty==='hard')c.food+=1500;}
  }
  for(const u of [...this.s.units]){
   const tech=this.s.factions[u.faction].tech.logistics,n=Math.ceil(u.troops*.055*(1-.1*tech));u.food=Math.max(0,u.food-n);if(u.food===0){const lost=Math.ceil(u.troops*.1);this.hit(u,lost,null);u.energy=clamp(u.energy-15,0,100);if(u.faction===this.s.player)this.log(`${u.name}: 군량 고갈! ${lost}명 이탈.`,'warning');}
   u.confused=Math.max(0,u.confused-1);u.acted=u.confused>0;u.move=u.confused?0:this.maxMove(u);
  }
  for(const o of this.s.officers)o.acted=false;
  for(const fs of Object.values(this.s.factions)){fs.ap=this.maxAP(fs.id);if(fs.research&&--fs.research.remaining<=0){fs.tech[fs.research.type]=fs.research.level;this.log(`${D.factions.find(f=>f.id===fs.id).name}: ${D.techs[fs.research.type].name} 연구 완료.`,'event');fs.research=null;}}
  for(const t of this.s.shipments){if(--t.remaining<=0){let c=this.city(t.to);if(c.faction!==t.faction)c=this.city(t.from);if(c.faction!==t.faction)c=this.ownCities(t.faction)[0];if(c){c.gold+=t.gold;c.food+=t.food;c.troops=Math.min(80000,c.troops+t.troops);this.log(`${c.name}: 수송 물자 도착.`);}else this.log('수송대가 목적지를 잃고 해산했습니다.','warning');}}
  this.s.shipments=this.s.shipments.filter(t=>t.remaining>0);
  for(const e of D.events)if(this.ownCities().length>0&&this.s.turn>=e.turn&&!this.s.eventDone.includes(e.id)&&!this.s.eventQueue.includes(e.id))this.s.eventQueue.push(e.id);
  if(this.s.turn%3===0)this.log('월초 수입이 각 도시에 지급되었습니다.','economy');if(this.s.turn%9===0)this.log('계절 군량 수확이 각 도시의 창고에 들어왔습니다.','economy');this.checkEnd();return this.s;
 }
 checkEnd(){
  if(this.s.outcome)return;
  if(this.ownCities().length>=this.s.goal){this.s.outcome={type:'victory',turn:this.s.turn};this.log(this.s.goal===42?'천하 통일! 42개 도시가 하나의 깃발 아래 모였습니다.':'패권 달성! 단기 캠페인 목표를 완수했습니다.','event');}
  else if(this.ownCities().length===0&&this.ownUnits().length===0){this.s.outcome={type:'defeat',turn:this.s.turn};this.log('모든 도시와 부대를 잃었습니다.','event');}
 }
 date(){const t=this.s.turn,month=Math.floor(t/3)%12+1;return {year:200+Math.floor(t/36),month,day:(t%3)*10+1,season:['봄','여름','가을','겨울'][Math.floor((month-1)/3)]};}
 serialize(){return JSON.stringify({magic:'RTK11_WEB_SAVE',schema:1,state:this.s});}
 static load(text){if(typeof text!=='string'||text.length>4_000_000)throw new RuleError('저장 파일 크기가 올바르지 않습니다.');let obj;try{obj=JSON.parse(text);}catch{throw new RuleError('JSON 저장 파일을 읽을 수 없습니다.');}if(obj.magic!=='RTK11_WEB_SAVE'||obj.schema!==1)throw new RuleError('지원하지 않는 저장 파일입니다.');return new Engine(obj.state);}
 validate(){
  const s=this.s,fail=msg=>{throw new RuleError('저장 데이터 오류: '+msg);},num=(v,lo=0,hi=1e10)=>typeof v==='number'&&Number.isFinite(v)&&v>=lo&&v<=hi;
  if(!s||s.schema!==1||!['cao','liu','sun'].includes(s.player)||![8,42].includes(s.goal)||!['easy','normal','hard'].includes(s.difficulty)||!Number.isInteger(s.turn)||!num(s.turn,0,1000000)||!Number.isInteger(s.nextId)||!num(s.nextId,1,1e9)||(!Number.isInteger(s.rng)||!num(s.rng,0,4294967295)))fail('헤더');
  if(!Array.isArray(s.cities)||s.cities.length!==42||!Array.isArray(s.officers)||s.officers.length!==D.officers.length+1||!Array.isArray(s.units)||s.units.length>500)fail('개체 수');
  if(!s.factions||Object.keys(s.factions).length!==D.factions.length||Object.keys(s.factions).some(k=>!D.factions.some(f=>f.id===k)))fail('세력 목록');
  for(const f of D.factions){const fs=s.factions?.[f.id];if(!fs||fs.id!==f.id||!num(fs.ap,0,10000)||!num(fs.tp)||!fs.tech||!fs.truce)fail('세력');for(const t of Object.keys(D.techs))if(!Number.isInteger(fs.tech[t])||!num(fs.tech[t],0,4))fail('기교');for(const [id,end]of Object.entries(fs.truce))if(!D.factions.some(f=>f.id===id)||!num(end))fail('정전');if(fs.research&&(!own(D.techs,fs.research.type)||!num(fs.research.remaining,1,100)||!num(fs.research.level,1,4)))fail('연구');}
  const cityIds=new Set(),unitIds=new Set(),positions=new Set(),offIds=new Set(),assigned=new Set();
  for(const c of s.cities){const def=D.cities.find(x=>x.id===c.id);if(!def||cityIds.has(c.id)||c.name!==def.name||c.q!==def.q||c.r!==def.r||!s.factions[c.faction])fail('도시 ID/위치');cityIds.add(c.id);for(const k of ['troops','gold','food','hp','maxHP','baseGold','baseFood'])if(!num(c[k]))fail('도시 자원');if(c.hp>c.maxHP||!num(c.order,0,100)||!num(c.energy,0,100))fail('도시 상태');for(const k of ['spear','halberd','crossbow','cavalry','ram','siege'])if(!num(c.gear?.[k]))fail('병장');if(!Array.isArray(c.development)||c.development.length>20||c.development.some(t=>!this.tile(t)))fail('개발지');if(!Array.isArray(c.buildings)||c.buildings.length>20)fail('시설');const slots=new Set();for(const b of c.buildings){if(!own(D.facilities,b.type)||!Number.isInteger(b.slot)||b.slot<0||b.slot>=c.development.length||slots.has(b.slot)||!num(b.level,1,3)||!num(b.remaining,0,20))fail('시설 상태');slots.add(b.slot);}}
  for(const o of s.officers){const def=D.officers.find(x=>x.id===o.id);if(!def&&o.id!=='bandit_leader')fail('무장 ID');if(offIds.has(o.id)||!s.factions[o.faction]||typeof o.name!=='string'||o.name.length>40||!o.apt)fail('무장');offIds.add(o.id);for(const k of ['leadership','war','intelligence','politics','charisma'])if(!num(o[k],0,100))fail('능력치');for(const k of ['spear','halberd','crossbow','cavalry','siege','navy'])if(!own(RANK,o.apt[k]))fail('병과 적성');if(o.city&&!cityIds.has(o.city))fail('무장 도시');if(o.city&&o.unit)fail('중복 배치');}
  for(const u of s.units){if(typeof u.id!=='string'||!/^u\d+$/.test(u.id)||Number(u.id.slice(1))>=s.nextId||unitIds.has(u.id)||!this.passable(u)||positions.has(key(u.q,u.r))||!s.factions[u.faction]||!own(D.troops,u.type))fail('부대 ID/위치');unitIds.add(u.id);positions.add(key(u.q,u.r));if(typeof u.name!=='string'||u.name.length>70||!num(u.troops,1,10000)||!num(u.food)||!num(u.energy,0,100)||!num(u.move,0,15)||!num(u.confused,0,2)||!Array.isArray(u.officers)||u.officers.length<1||u.officers.length>3)fail('부대 상태');for(const id of u.officers){const o=this.officer(id);if(!o||assigned.has(id)||o.unit!==u.id||o.faction!==u.faction)fail('부대 편성');assigned.add(id);}}
  for(const o of s.officers)if(o.unit&&!unitIds.has(o.unit))fail('없는 부대의 무장');
  if(!Array.isArray(s.fires)||s.fires.length>1000||s.fires.some(f=>!this.tile(f)||!num(f.remaining,1,2)||!s.factions[f.owner]))fail('화재');
  if(!Array.isArray(s.logs)||s.logs.length>180||s.logs.some(x=>typeof x.text!=='string'||x.text.length>1000||!num(x.turn)))fail('기록');
  if(!Array.isArray(s.eventQueue)||!Array.isArray(s.eventDone)||s.eventQueue.length>D.events.length||s.eventDone.length>D.events.length||[...s.eventQueue,...s.eventDone].some(id=>!D.events.some(e=>e.id===id))||new Set([...s.eventQueue,...s.eventDone]).size!==s.eventQueue.length+s.eventDone.length)fail('이벤트');
  if(!Array.isArray(s.shipments)||s.shipments.length>200)fail('수송');for(const t of s.shipments){if(!cityIds.has(t.from)||!cityIds.has(t.to)||!s.factions[t.faction]||!num(t.remaining,1,100))fail('수송 경로');for(const k of ['gold','food','troops'])if(!num(t[k]))fail('수송 자원');}
  if(!s.missions||!s.stats||!num(s.stats.battlesWon)||!num(s.stats.citiesTaken)||Object.values(s.missions).some(v=>typeof v!=='boolean'))fail('진행 기록');if(s.outcome&&!['victory','defeat'].includes(s.outcome.type))fail('결과');return true;
 }
}
const API={Engine,RuleError,DATA:D,MAP,distance,neighbors,axial,offset,line,key,RANK,clone,clamp};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.RTK=API;
})(typeof globalThis!=='undefined'?globalThis:this);
