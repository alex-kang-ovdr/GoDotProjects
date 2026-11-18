/* Field Command v22. Observed data + explicitly custom tactical rules. */
(function(root){
'use strict';
const DATA=typeof module!=='undefined'&&module.exports?require('./source-data.js'):root.FQData;
const WIDTH=960, HEIGHT=600, STEP=1/60, MAX_ARMY=40;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clone=o=>JSON.parse(JSON.stringify(o));
const CLASSES={
 infantry:{name:'보병',hp:105,atk:16,def:6,speed:66,range:25,rate:56,windup:12,color:'#86b6cf',skill:'방패 결속'},
 knight:{name:'기사',hp:170,atk:25,def:10,speed:74,range:29,rate:66,windup:16,color:'#d4b465',skill:'회전 베기'},
 archer:{name:'궁수',hp:78,atk:15,def:3,speed:68,range:168,rate:76,windup:20,color:'#8cbb85',skill:'일제사격'},
 mage:{name:'마법사',hp:82,atk:22,def:3,speed:62,range:155,rate:100,windup:25,color:'#b497d3',skill:'비전 파동'},
 healer:{name:'치료사',hp:86,atk:7,def:4,speed:64,range:125,rate:102,windup:22,color:'#c1a6d8',skill:'치유 파동'}
};
const REGIONS=[
 {id:0,name:'카리온',x:160,y:326,links:[1,3],kind:'capital'},
 {id:1,name:'평원',x:355,y:243,links:[0,2,4],kind:'field'},
 {id:2,name:'북부 성채',x:550,y:130,links:[1,5],kind:'fort'},
 {id:3,name:'숲의 마을',x:285,y:465,links:[0,4],kind:'forest'},
 {id:4,name:'강변 요새',x:565,y:412,links:[1,3,5],kind:'river'},
 {id:5,name:'바르시아',x:790,y:260,links:[2,4],kind:'capital'}
];
// v15: original prototype encounters, not a reconstruction of the original game's events.
const CAMPAIGN_EVENTS={
 1:{title:'평원 보급선',text:'평원을 확보했습니다. 보급대를 어떻게 활용할지 결정하세요.',choices:[{id:'supply',label:'보급금 확보',detail:'금화 +120',gold:120},{id:'recruits',label:'지역 의용병 합류',detail:'보병 4명 · Lv.2',units:[['infantry',2,4]]}]},
 2:{title:'성채의 전투 교범',text:'북부 성채의 병기고와 전투 교범을 확보했습니다.',choices:[{id:'veterans',label:'기사단 재편',detail:'기사 2명 · Lv.2',units:[['knight',2,2]]},{id:'fund',label:'병기고 물자 판매',detail:'금화 +150',gold:150}]},
 3:{title:'숲의 구호단',text:'숲의 마을에서 구호단이 합류를 요청합니다. 병력과 보급 중 하나를 선택하세요.',choices:[{id:'healers',label:'구호단 합류',detail:'치료사 2명 · Lv.2',units:[['healer',2,2]]},{id:'supplies',label:'약초 교역',detail:'금화 +160',gold:160}]},
 4:{title:'강변 교역로',text:'강변의 두 다리를 확보했습니다. 교역로를 재건하거나 궁수대를 모집할 수 있습니다.',choices:[{id:'trade',label:'교역로 재건',detail:'금화 +60 / 이 거점을 보유한 동안 매 턴 +12G',gold:60},{id:'archers',label:'강변 궁수대',detail:'궁수 4명 · Lv.2',units:[['archer',2,4]]}]},
 5:{title:'수도의 기록',text:'바르시아를 확보했습니다. 남은 적 군단과 거점을 정리하면 캠페인이 완료됩니다.',choices:[{id:'treasury',label:'전후 복구 기금',detail:'금화 +240',gold:240},{id:'guard',label:'수도 수비대 재편',detail:'기사 2명 + 보병 2명 · Lv.3',units:[['knight',3,2],['infantry',3,2]]}]}
};
const MAP_INFO={field:{title:'평원 · 개활지',hint:'바위 양쪽을 활용해 전선을 분산하세요.'},forest:{title:'숲 · 우회로',hint:'나무와 바위 사이를 돌아 후방 병력을 보호하세요.'},fort:{title:'북부 성채 · 돌파전',hint:'성문 파괴 후 안쪽 수비대를 제압하세요.'},river:{title:'강변 · 두 다리',hint:'강물은 통행 불가입니다. 상·하단 다리로 병력을 나누세요.'},capital:{title:'수도 · 최종 공성',hint:'강화 성문과 안쪽 장애물에 대비하세요.'}};
const ORDERS={attack:'공격',hold:'방어',rest:'휴식',regroup:'집결',retreat:'후퇴',move:'이동',attackmove:'교전 이동',siege:'공성',charge:'돌격'};
const RECOVERY_TICKS=180, RECOVERY_RADIUS=180;
const PERFORMANCE_KEYS=['damage','received','healing','kills','hits','misses','gateDamage'];
const emptyPerformance=()=>Object.fromEntries(PERFORMANCE_KEYS.map(k=>[k,0]));
// Source observations never mutate. Runtime level is a CUSTOM training rank, not the raw level field.
function source(u){return DATA.source(u);}
function stats(u){const r=source(u),c=CLASSES[u.type],growth=Math.max(0,u.level-1),f=r?.raw;
 const out={HP:(f?Math.max(1,f.hitPoint):c.hp)+growth*7,AT:f?f.attack+growth:c.atk+u.level*2,AR:f?f.attackRate:36,DF:f?f.defence:c.def,DR:f?f.defenceRate:32,AA:f?f.arrowAvoid:0,AD:f?f.arrowDef:0,MD:f?f.magicDef:0,HR:f?f.hpRate:0};
 const item=DATA.item(u.equipmentId);if(item)for(const [key,value] of Object.entries(item.mods))out[key]+=value;
 for(const key of Object.keys(out))out[key]=Math.max(0,out[key]);return out;
}
function maxHP(u){return stats(u).HP;}
function fatigueEffects(u){const ft=clamp(u.fatigue,0,100);return {attackMultiplier:source(u)?1-.2*ft/100:1,movementMultiplier:1-.2*ft/100,attackIntervalMultiplier:1+ft/230};}
function attackPower(u){return stats(u).AT*fatigueEffects(u).attackMultiplier;}
function unitLabel(u){return DATA.label(u)||CLASSES[u.type].name;}
function plainUnit(u){const out={id:u.id,type:u.type,level:u.level,exp:u.exp,hp:Math.max(1,Math.ceil(u.hp)),fatigue:Math.round(u.fatigue)};if(u.origin)out.origin=clone(u.origin);if(u.equipmentId)out.equipmentId=u.equipmentId;return out;}
function hitChance(attacker,target,kind='melee'){if(!source(attacker)&&!source(target))return 1;const a=stats(attacker),d=stats(target);return clamp(.72+(a.AR-d.DR)/160-(kind==='arrow'?d.AA/300:0),.2,.96);}
function damageValue(target,amount,kind='melee'){const d=stats(target);if(!source(target))return Math.max(1,Math.round(amount-d.DF*.45));const extra=kind==='arrow'?d.AD:kind==='magic'?d.MD:0;return Math.max(1,Math.round(amount*100/(100+d.DF)*(1-clamp(extra,0,70)/100)));}
function validateOrigin(u){if(u.origin){const o=u.origin,r=DATA.get(o.recordId);if(!r||o.hash!==r.hash||Object.keys(o).sort().join(',')!=='hash,recordId')throw Error('복원 출처 참조 또는 기록 지문 오류');}if(u.equipmentId&&!DATA.item(u.equipmentId))throw Error('장비 참조 오류');}

function rectHit(x,y,b,r=0){return Math.abs(x-b.x)<b.w/2+r && Math.abs(y-b.y)<b.h/2+r;}
function segmentRect(ax,ay,bx,by,r,pad=0){
 let lo=0,hi=1;const mins=[r.x-r.w/2-pad,r.y-r.h/2-pad],maxs=[r.x+r.w/2+pad,r.y+r.h/2+pad];
 for(let i=0;i<2;i++){let a=i?ay:ax,d=(i?by:bx)-a;if(Math.abs(d)<1e-8){if(a<mins[i]||a>maxs[i])return false;}else{let t1=(mins[i]-a)/d,t2=(maxs[i]-a)/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return false;}}
 return true;
}
class Navigation{
 constructor(blocks){this.cell=24;this.cols=40;this.rows=25;this.setBlocks(blocks);}
 setBlocks(blocks){this.blocks=blocks;this.version=(this.version||0)+1;this.grid=new Uint8Array(1000);for(let y=0;y<25;y++)for(let x=0;x<40;x++)if(blocks.some(b=>rectHit(x*24+12,y*24+12,b,14)))this.grid[y*40+x]=1;}
 clear(a,b,pad=8){return !this.blocks.some(r=>(pad!==0||r.kind!=='water')&&segmentRect(a.x,a.y,b.x,b.y,r,pad));}
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
function battlefield(kind,defenderTeam='red'){
 if(!MAP_INFO[kind])throw Error('전장 유형 오류');
 const siege=['fort','capital','river'].includes(kind),wallX=kind==='river'?682:596;
 const obstacles=siege?[
  {id:'wall-a',x:wallX,y:112,w:28,h:224,height:62,kind:'wall'},
  {id:'wall-b',x:wallX,y:488,w:28,h:224,height:62,kind:'wall'},
  {id:'tower-a',x:wallX,y:210,w:55,h:44,height:83,kind:'tower'},
  {id:'tower-b',x:wallX,y:390,w:55,h:44,height:83,kind:'tower'}
 ]:[];
 if(kind==='river'){
  obstacles.push(...[{id:'water-n',x:464,y:90,w:86,h:180},{id:'water-m',x:464,y:300,w:86,h:120},{id:'water-s',x:464,y:510,w:86,h:180}].map(r=>({...r,height:.5,kind:'water'})));
 }else if(kind==='forest'){
  for(const [i,[x,y]] of [[340,130],[370,240],[330,440],[460,380],[570,180],[625,320],[580,485],[710,120]].entries())obstacles.push({id:'tree-'+i,x,y,w:32,h:32,height:58,kind:'tree'});
  obstacles.push({id:'rock-f',x:470,y:140,w:55,h:40,height:25,kind:'rock'});
 }else if(siege){
  obstacles.push({id:'rock-a',x:365,y:160,w:48,h:54,height:22,kind:'rock'},{id:'rock-b',x:370,y:457,w:60,h:40,height:21,kind:'rock'});
  if(kind==='capital')obstacles.push({id:'barricade-n',x:730,y:160,w:65,h:32,height:22,kind:'crate'},{id:'barricade-s',x:730,y:448,w:65,h:32,height:22,kind:'crate'});
 }else obstacles.push({id:'rock-a',x:440,y:180,w:64,h:60,height:26,kind:'rock'},{id:'rock-b',x:530,y:427,w:56,h:66,height:24,kind:'rock'});
 const hp=kind==='capital'?920:640;
 const gate=siege?{id:'gate',x:wallX,y:300,w:28,h:152,height:48,kind:'gate',hp,maxHp:hp,open:false,destroyed:false}:null;
 if(defenderTeam==='blue'){for(const obstacle of obstacles)obstacle.x=WIDTH-obstacle.x;if(gate)gate.x=WIDTH-gate.x;}
 return {kind,title:MAP_INFO[kind].title,hint:MAP_INFO[kind].hint,obstacles,gate};
}
class Game{
 constructor(){this.onChange=()=>{};this.log=[];this.nextId=1;this.options={speed:1,enemyAuto:false};this.newGame();}
 note(message){this.log.unshift({message,turn:this.world?.turn||0});if(this.log.length>60)this.log.length=60;this.onChange();}
 make(type,level=1){if(this.world?.profile?.id==='hybrid-repoN-v19'){const pool=DATA.records.filter(r=>DATA.role(r)===type&&r.raw.hitPoint<=650);return this.makeObserved(pool[(this.nextId-1)%pool.length]?.id||DATA.records[0].id,type,level);}const u={id:this.nextId++,type,level,exp:0,hp:CLASSES[type].hp+(level-1)*7,fatigue:0};return u;}
 makeRoster(n,level=1){const list=[];for(let i=0;i<n;i++)list.push(this.make(i%13===12?'healer':i%5===4?'archer':i%7===5?'knight':'infantry',level));return list;}
 newGame(profile='custom-v15'){
  if(!['custom-v15','hybrid-repoN-v19'].includes(profile))throw Error('지원하지 않는 규칙 프로필');this.world=null;
  this.nextId=1;this.log=[];this.mode='world';this.battle=null;this.report=null;this.paused=false;this.direct=false;this.selectedUnitId=null;this.selectedGroupId=null;this.supportIds=[];this.autoClock=0;
  const roster=[];for(let i=0;i<26;i++)roster.push(this.make(i<14?'infantry':i<19?'knight':i<24?'archer':'healer'));
  this.world={regions:REGIONS.map(r=>({...r,owner:r.id===0?'blue':r.id===3?'neutral':'red',garrison:[]})),armies:[{id:0,name:'카리온 주력군',region:0,roster}],reserve:this.makeRoster(12),activeArmyId:0,turn:0,wins:0,gold:300,enemyArmies:[],graveyard:[],committedBattles:[],battleSerial:0};
  for(const r of this.world.regions)if(r.owner==='red')r.garrison=this.makeRoster(r.id===5?30:r.id===1?22:20,r.id===5?2:1);
  this.world.enemyArmies=[{id:'e0',name:'바르시아 원정대',region:5,roster:this.makeRoster(10,1)},{id:'e1',name:'북부 경비대',region:2,roster:this.makeRoster(8,1)}];
  this.world.campaign={seen:[0],pending:[],choices:{},status:'active'};this.world.profile={id:profile,ruleset:profile==='hybrid-repoN-v19'?'hybrid-combat-1':'custom-v15',datasetRevision:profile==='hybrid-repoN-v19'?DATA.manifest.datasetRevision:null};this.world.equipmentStock={};if(profile==='hybrid-repoN-v19')this.setupObservedCampaign();this.options.enemyAuto=false;this.selectedRegion=1;this.note('카리온 군단 준비 완료. 거점을 선택하거나 전장 연습으로 전투를 익히세요.');
 }
 makeObserved(recordId,type=null,rank=1){const r=DATA.get(recordId);if(!r)throw Error('알 수 없는 관측 기록');type=type||DATA.role(r);if(!Object.hasOwn(CLASSES,type)||!Number.isInteger(rank)||rank<1||rank>99)throw Error('전투 역할/훈련 단계 오류');const u={id:this.nextId++,type,level:rank,exp:0,hp:Math.max(1,r.raw.hitPoint)+(rank-1)*7,fatigue:clamp(r.raw.fatigue,0,100),origin:{recordId:r.id,hash:r.hash}};return u;}
 setupObservedCampaign(){
  this.nextId=1;const w=this.world;
  w.armies=[{id:0,name:'관측 0x10 편성대',region:0,roster:DATA.records.filter(r=>r.raw.team===16).map(r=>this.makeObserved(r.id))}];
  w.reserve=['healer','mage','archer','infantry','infantry','healer'].map(t=>this.make(t));
  const pool=DATA.records.filter(r=>r.raw.team!==16&&r.raw.hitPoint>=150&&r.raw.hitPoint<=330&&r.raw.attack>=20&&r.raw.attack<=48&&['infantry','archer'].includes(DATA.role(r)));
  let at=0;const squad=n=>Array.from({length:n},()=>this.makeObserved(pool[at++%pool.length].id));
  for(const r of w.regions)r.garrison=r.owner==='red'?squad(r.id===5?22:r.id===1?14:18):[];
  w.enemyArmies=[{id:'e0',name:'재구성 원정대',region:5,roster:squad(6)},{id:'e1',name:'재구성 경비대',region:2,roster:squad(6)}];w.gold=450;
 }
 enlistRecord(id,type){if(this.mode!=='world'||this.world.profile?.id!=='hybrid-repoN-v19')return false;const r=DATA.get(id);if(!r||!Object.hasOwn(CLASSES,type))return false;const cost=this.recordCost(id);if(this.world.gold<cost||this.world.reserve.length>=120){this.note('금화 또는 예비군 빈자리가 부족합니다.');return false;}this.world.gold-=cost;this.world.reserve.push(this.makeObserved(id,type));this.note(`관측 기록 병사 모집 · ${r.offset} · ${CLASSES[type].name} 역할 / 비용 ${cost}G (자체 규칙)`);return true;}
 recordCost(id){const r=DATA.get(id);return r?Math.ceil((r.raw.hitPoint/10+r.raw.attack+r.raw.defence)/5)*5:Infinity;}
 buyEquipment(id){if(this.mode!=='world')return false;const item=DATA.item(id);if(!item||this.world.gold<item.price)return false;const stock=this.world.equipmentStock||(this.world.equipmentStock={});if((stock[id]||0)>=120)return false;this.world.gold-=item.price;stock[id]=(stock[id]||0)+1;this.note(`${item.name} 구매 · ${item.price}G / 추가 장비 시험 슬롯`);return true;}
 equip(unitId,itemId){if(this.mode!=='world')return false;const u=[...this.activeArmy.roster,...this.world.reserve].find(u=>u.id===unitId);if(!u||itemId!==null&&!DATA.item(itemId))return false;const stock=this.world.equipmentStock||(this.world.equipmentStock={});if(u.equipmentId===itemId)return false;if(u.equipmentId&&(stock[u.equipmentId]||0)>=120){this.note('회수할 장비 재고가 가득 찼습니다.');return false;}if(itemId&&(stock[itemId]||0)<1)return false;if(u.equipmentId)stock[u.equipmentId]=(stock[u.equipmentId]||0)+1;if(itemId){stock[itemId]--;u.equipmentId=itemId;}else delete u.equipmentId;this.note(`${unitLabel(u)} · ${itemId?DATA.item(itemId).name:'추가 장비 해제'}`);return true;}
 get activeArmy(){return this.world.armies.find(a=>a.id===this.world.activeArmyId)||this.world.armies[0];}
 get selected(){return this.battle?.units.find(u=>u.id===this.selectedUnitId)||null;}
 get selectedGroup(){return this.battle?.groups.find(g=>g.id===this.selectedGroupId)||null;}
 switchArmy(id){if(this.mode!=='world')return false;const a=this.world.armies.find(a=>a.id===id);if(!a)return false;this.world.activeArmyId=id;this.selectedRegion=a.region;this.note(`${a.name} 선택 · ${a.roster.length}명`);return true;}
 split(){if(this.mode!=='world')return false;const a=this.activeArmy;if(a.roster.length<4||this.world.armies.length>=5){this.note('분할은 병력 4명 이상, 최대 5개 군단까지 가능합니다.');return false;}const roster=a.roster.splice(Math.ceil(a.roster.length/2));const id=Math.max(...this.world.armies.map(v=>v.id))+1;this.world.armies.push({id,name:`제${id+1}군단`,region:a.region,roster});this.note(`제${id+1}군단 창설 · ${roster.length}명`);return true;}
 merge(){if(this.mode!=='world')return false;const a=this.activeArmy,b=this.world.armies.find(b=>b.id!==a.id&&b.region===a.region);if(!b||a.roster.length>=MAX_ARMY){this.note('같은 거점의 군단과 합류할 수 있습니다. 정원은 40명입니다.');return false;}a.roster.push(...b.roster.splice(0,MAX_ARMY-a.roster.length));if(!b.roster.length){this.world.armies=this.world.armies.filter(x=>x!==b);this.supportIds=this.supportIds.filter(id=>id!==b.id);}this.note('군단 합류 완료');return true;}
 transfer(id,toMain){if(this.mode!=='world')return false;const from=toMain?this.world.reserve:this.activeArmy.roster,to=toMain?this.activeArmy.roster:this.world.reserve;const at=from.findIndex(u=>u.id===id);if(at<0||(toMain?to.length>=MAX_ARMY:to.length>=120)){this.note('편성 대상의 정원이 가득 찼습니다.');return false;}to.push(from.splice(at,1)[0]);this.onChange();return true;}
 transferMany(ids,toMain){
  if(this.mode!=='world'||!Array.isArray(ids)||!ids.length||ids.length>120||typeof toMain!=='boolean'||ids.some(id=>!Number.isSafeInteger(id))||new Set(ids).size!==ids.length)return false;
  const from=toMain?this.world.reserve:this.activeArmy.roster,to=toMain?this.activeArmy.roster:this.world.reserve;
  const chosen=new Set(ids),moving=from.filter(u=>chosen.has(u.id));
  if(moving.length!==ids.length||to.length+moving.length>(toMain?MAX_ARMY:120)){this.note('선택 병력 전체를 옮길 수 없습니다. 병사와 남은 정원을 확인하세요.');return false;}
  // Keep the original order and the complete unit object, including source and equipment.
  const remaining=from.filter(u=>!chosen.has(u.id));from.splice(0,from.length,...remaining);to.push(...moving);
  this.note(`${moving.length}명 일괄 편성 완료 · ${toMain?'주력군':'예비군'}`);return true;
 }
 equipmentPreview(unitId,itemId){
  const u=[...this.activeArmy.roster,...this.world.reserve].find(x=>x.id===unitId);
  if(!u||itemId!==null&&!DATA.item(itemId))return null;
  const current=stats(u),projected=stats({...u,equipmentId:itemId});
  return {current,projected,delta:Object.fromEntries(Object.keys(current).map(k=>[k,projected[k]-current[k]]))};
 }
 recruit(){if(this.mode!=='world')return false;if(this.world.gold<60||this.world.reserve.length>114){this.note('고용에 금화 60과 예비군 빈자리 6칸이 필요합니다.');return false;}this.world.gold-=60;for(const t of ['infantry','infantry','infantry','archer','knight','healer'])this.world.reserve.push(this.make(t));this.note('신병 6명 고용 · 금화 -60');return true;}
 rest(){if(this.mode!=='world')return false;for(const u of [...this.activeArmy.roster,...this.world.reserve]){u.hp=Math.min(maxHP(u),u.hp+Math.ceil(maxHP(u)*.4));u.fatigue=Math.max(0,u.fatigue-45);}this.note('선택 군단·예비군 휴식. 전략 턴이 진행됩니다.');this.advanceTurn();return true;}
 eligibleSupport(regionId){return this.world.armies.filter(a=>a.id!==this.activeArmy.id&&a.roster.length>0&&(a.region===regionId||REGIONS[a.region].links.includes(regionId)));}
 toggleSupport(id){if(this.mode!=='world')return;this.supportIds=this.supportIds.includes(id)?this.supportIds.filter(x=>x!==id):[...this.supportIds,id];this.onChange();}
 go(regionId){
  if(this.mode!=='world')return false;const a=this.activeArmy,r=this.world.regions[regionId];if(!r||(!REGIONS[a.region].links.includes(regionId)&&a.region!==regionId)){this.note('현재 군단의 인접 거점을 선택하세요.');return false;}
  if(!a.roster.length){this.note('출전 가능한 병력이 없습니다. 예비군을 편성하세요.');return false;}
  if(r.owner==='red'||this.world.enemyArmies.some(e=>e.region===regionId&&e.roster.length))return this.startBattle(regionId);
  if(a.region===regionId)return false;a.region=regionId;if(r.owner==='neutral'){r.owner='blue';this.world.gold+=80;this.note(`${r.name} 확보 · 금화 +80`);}else this.note(`${r.name}으로 이동`);this.processCampaign(this.world);this.advanceTurn();return true;
 }
 advanceTurn(){
  if(this.mode!=='world')return false;this.world.turn++;this.world.gold+=this.world.regions.filter(r=>r.owner==='blue').length*12;if(this.world.campaign?.choices['4']==='trade'&&this.world.regions[4].owner==='blue')this.world.gold+=12;
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
  }this.processCampaign(w);this.onChange();return true;
 }
 startBattle(regionId,training=false){
  if(this.mode!=='world')return false;const a=this.activeArmy,r=this.world.regions[regionId];if(!r||!a.roster.length)return false;
  if(!training&&a.region!==regionId&&!REGIONS[a.region].links.includes(regionId))return false;
  const enemies=this.world.enemyArmies.filter(e=>e.region===regionId&&e.roster.length);
  if(!training&&r.owner!=='red'&&!enemies.length)return false;
  const before=clone(this.world),battleId=training?'training':`b${++this.world.battleSerial}`;
  const defenderTeam=!training&&r.owner==='blue'?'blue':'red',map=battlefield(REGIONS[regionId].kind,defenderTeam);
  const b={id:battleId,training,defenderTeam,regionId,originRegion:a.region,ownerBefore:r.owner,activeArmyId:a.id,tick:0,time:0,map,groups:[],units:[],projectiles:[],effects:[],particles:[],nav:new Navigation([...map.obstacles,...(map.gate?[map.gate]:[])]),before,healCooldown:0,seed:1414,stats:{damage:0,healing:0,kills:0,attempts:0,hits:0,misses:0},combatLog:[],resultApplied:false,selectedTarget:null,metricsSinceTick:0};
  this.battle=b;this.mode='battle';this.paused=false;this.direct=false;this.report=null;this.autoClock=0;
  this.addGroup('army',a.id,a.name,'blue',a.roster,0);
  if(training){if(this.world.reserve.length)this.addGroup('reserve',null,'예비 지원대','blue',this.world.reserve.slice(0,12),180);const demo=Array.from({length:24},(_,i)=>({id:-100-i,type:i%7===0?'knight':i%6===0?'archer':i%11===0?'healer':'infantry',level:1,exp:0,hp:null,fatigue:0}));if(this.world.profile?.id==='hybrid-repoN-v19'){const counter=this.nextId;let pool=this.world.regions[regionId].garrison.length?this.world.regions[regionId].garrison:this.world.regions[1].garrison;if(!pool.length){const records=DATA.records.filter(r=>r.raw.team!==16&&r.raw.hitPoint>=150&&r.raw.hitPoint<=330&&r.raw.attack>=20&&r.raw.attack<=48&&['infantry','archer'].includes(DATA.role(r)));pool=Array.from({length:14},(_,i)=>this.makeObserved(records[i%records.length].id));}demo.splice(0,demo.length,...pool.map((u,i)=>({...clone(u),id:-100-i})));this.nextId=counter;}this.addGroup('training',null,'연습 수비대','red',demo,0);}
  else{
   if(r.owner==='red'&&r.garrison.length)this.addGroup('garrison',r.id,'거점 수비대','red',r.garrison,0);
   for(const e of enemies)this.addGroup('enemy',e.id,e.name,'red',e.roster,0);
   for(const s of this.eligibleSupport(regionId).filter(s=>this.supportIds.includes(s.id)))this.addGroup('army',s.id,s.name,'blue',s.roster,240);
  }
  this.supportIds=[];this.selectedGroupId=b.groups[0].id;this.selectedUnitId=b.units.find(u=>u.team==='blue'&&u.type==='knight')?.id??b.units.find(u=>u.team==='blue')?.id;
  this.note(training?'전장 연습 시작 · 병력 손실과 성장은 캠페인에 반영되지 않습니다.':`${r.name} ${r.owner==='blue'?'방어':'공격'}전 시작`);return true;
 }
 addGroup(kind,sourceId,name,team,roster,arrival=0){
  const b=this.battle;if(!b)return null;const g={id:`g${b.groups.length}`,sourceKind:kind,sourceId,name,team,roster:clone(roster),arrival,spawned:false,unitIds:[],order:team===b.defenderTeam&&b.map.gate?'hold':'attack',formation:'line',anchor:{x:team==='blue'?180:770,y:300},chargeUntil:0,shieldUntil:0,waypoints:[],autoRetreat:false,focusTargetId:null,focusOrigin:null,engagement:null,engageAfter:0};b.groups.push(g);if(arrival<=b.tick)this.spawnGroup(g);return g;
 }
 spawnGroup(g){
  const b=this.battle;if(g.spawned)return;g.spawned=true;
  const alliedIndex=b.groups.filter(x=>x.team===g.team&&x.spawned).length-1;
  for(let i=0;i<g.roster.length;i++){const d=g.roster[i],mx=maxHP(d),x=(g.team==='blue'?115:827)+(g.team==='blue'?-1:1)*Math.floor(i/9)*24,y=195+(i%9)*24+(alliedIndex%2?12:0);const u={...d,hp:d.hp??mx,maxHp:mx,team:g.team,groupId:g.id,x,y,vx:0,vy:0,yaw:g.team==='blue'?Math.PI/2:-Math.PI/2,phase:0,cool:(i%5)*7,skillCooldown:0,alive:true,evacuated:false,action:null,hitFlash:0,deadAt:null,targetId:null,path:[],pathIndex:0,pathKey:'',pathExpiry:0,protectedUntil:0,individualRetreat:false,recoveryTicks:0,lastHurtTick:null,performance:emptyPerformance()};b.units.push(u);g.unitIds.push(u.id);b.nav.resolve(u);}
  if(this.selectedGroupId===g.id&&!this.selectedUnitId)this.selectedUnitId=g.unitIds[0]??null;
  if(g.arrival>0)this.note(`${g.name} 도착 · ${g.roster.length}명`);
 }
 reinforce(){const b=this.battle;if(!b||this.paused||b.groups.some(g=>g.sourceKind==='reserve'))return false;if(!this.world.reserve.length)return false;this.addGroup('reserve',null,'예비 지원대','blue',this.world.reserve.slice(0,12),b.tick+180);this.note('예비군 출발 · 3초 후 도착');return true;}
 selectUnit(id,manual=false){const u=this.battle?.units.find(u=>u.id===id&&u.team==='blue'&&u.alive&&!u.evacuated);if(!u)return false;const previous=this.selected;if(previous&&previous.id!==id&&previous.hp/previous.maxHp<.45)previous.protectedUntil=this.battle.tick+240;this.selectedUnitId=id;this.selectedGroupId=u.groupId;if(manual)this.direct=true;this.onChange();return true;}
 selectGroup(id){const g=this.battle?.groups.find(g=>g.id===id&&g.team==='blue');if(!g)return false;this.selectedGroupId=id;const u=this.battle.units.find(u=>u.groupId===id&&u.alive&&!u.evacuated);this.selectedUnitId=u?u.id:null;this.direct=false;this.onChange();return true;}
 cycleUnit(delta=1){const all=this.battle?.units.filter(u=>u.team==='blue'&&u.alive&&!u.evacuated)||[];if(!all.length)return;this.selectUnit(all[(all.findIndex(u=>u.id===this.selectedUnitId)+delta+all.length)%all.length].id);}
 cycleGroup(){const all=this.battle?.groups.filter(g=>g.team==='blue')||[];if(!all.length)return;this.selectGroup(all[(all.findIndex(g=>g.id===this.selectedGroupId)+1)%all.length].id);}
 issue(order,all=false,point=null,append=false){
  const b=this.battle;if(!b||!ORDERS[order])return false;
  if(order==='siege'&&(!b.map.gate||b.map.gate.open)){this.note('공격할 성문이 없습니다.');return false;}
  if(point&&(!Number.isFinite(point.x)||!Number.isFinite(point.y)))return false;
  const groups=b.groups.filter(g=>g.team==='blue'&&(all||g.id===this.selectedGroupId));
  const route=['move','attackmove'].includes(order);
  if(!groups.length||route&&!point)return false;
  if(order==='siege'&&b.defenderTeam==='blue'){this.note('아군 수비 성문은 공격할 수 없습니다.');return false;}
  if(append&&route&&groups.some(g=>g.order===order&&g.waypoints.length>=8)){this.note('이동 예약은 부대당 최대 8개입니다.');return false;}
  for(const g of groups){
   const live=b.units.filter(u=>u.groupId===g.id&&u.alive&&!u.evacuated);
   const target=point?{x:clamp(point.x,24,936),y:clamp(point.y,24,576)}:null;
   if(append&&route&&g.order===order){g.waypoints.push(target);continue;}
   g.order=order;g.waypoints=[];g.focusTargetId=null;g.focusOrigin=null;g.engagement=null;g.engageAfter=0;
   if(target)g.anchor=target;
   else if(['hold','regroup','rest'].includes(order)&&live.length)g.anchor={x:live.reduce((v,u)=>v+u.x,0)/live.length,y:live.reduce((v,u)=>v+u.y,0)/live.length};
   if(order==='charge')g.chargeUntil=b.tick+480;
   for(const u of live){u.pathKey='';u.protectedUntil=0;u.recoveryTicks=0;if(order==='retreat'||order==='rest')u.action=null;}
  }
  this.direct=false;this.note(`${all?'전군':this.selectedGroup?.name||'부대'} · ${append&&route?'이동 예약':ORDERS[order]}`);return true;
 }
 focusEnemy(targetId,all=false){
  const b=this.battle,target=b?.units.find(u=>u.id===targetId&&u.team==='red'&&u.alive&&!u.evacuated);
  if(!target)return false;
  const groups=b.groups.filter(g=>g.team==='blue'&&(all||g.id===this.selectedGroupId));
  if(!groups.length||groups.some(g=>g.order==='retreat')){this.note('철수 중인 부대는 새 명령을 내린 뒤 표적을 지정하세요.');return false;}
  for(const g of groups){
   g.focusTargetId=target.id;g.focusOrigin={x:target.x,y:target.y};g.engagement=null;
   for(const u of b.units.filter(u=>u.groupId===g.id)){u.pathKey='';u.targetId=null;u.recoveryTicks=0;if(u.action?.kind!=='heal'&&!u.action?.done)u.action=null;}
  }
  this.direct=false;this.note(`${all?'전군':this.selectedGroup?.name||'부대'} · #${target.id} 우선 공격. 종료 후 기존 명령으로 복귀`);return true;
 }
 clearFocus(all=false){
  if(!this.battle)return false;
  for(const g of this.battle.groups)if(g.team==='blue'&&(all||g.id===this.selectedGroupId))this.releaseFocus(g);
  this.note('집중 표적 해제 · 기존 명령 재개');return true;
 }
 releaseFocus(g){
  g.focusTargetId=null;g.focusOrigin=null;
  for(const u of this.battle.units.filter(u=>u.groupId===g.id)){u.pathKey='';u.targetId=null;if(u.action?.kind==='attack'&&!u.action.done)u.action=null;}
 }
 refreshTactics(){
  const b=this.battle;
  for(const g of b.groups){
   if(g.focusTargetId!==null){
    const target=b.units.find(u=>u.id===g.focusTargetId);
    if(!target?.alive||target.evacuated||dist(target,g.focusOrigin)>240)this.releaseFocus(g);
   }
   if(g.order!=='attackmove'||!g.spawned||g.focusTargetId!==null||b.tick<g.engageAfter)continue;
   const fighters=b.units.filter(u=>u.groupId===g.id&&u.alive&&!u.evacuated&&!u.individualRetreat&&u.type!=='healer');
   if(!fighters.length){g.engagement=null;continue;}
   const foes=b.units.filter(u=>u.team!==g.team&&u.alive&&!u.evacuated);
   if(g.engagement){
    if(!foes.some(e=>dist(e,g.engagement)<=210&&fighters.some(u=>b.nav.clear(u,e,0)))){
     g.engagement=null;g.engageAfter=b.tick+120;for(const u of fighters){u.pathKey='';u.targetId=null;}
    }
   }else if(fighters.some(u=>foes.some(e=>dist(u,e)<=185&&b.nav.clear(u,e,0)))){
    g.engagement={x:fighters.reduce((v,u)=>v+u.x,0)/fighters.length,y:fighters.reduce((v,u)=>v+u.y,0)/fighters.length};
    for(const u of fighters)u.pathKey='';
   }
  }
 }
 tacticalEnemy(u,g){
  const b=this.battle;
  const options=b.units.filter(e=>e.team!==u.team&&e.alive&&!e.evacuated&&dist(e,g.engagement)<=210&&b.nav.clear(u,e,0));
  options.sort((a,c)=>dist(u,a)-dist(u,c)||a.id-c.id);
  const best=options[0],current=options.find(e=>e.id===u.targetId);
  return current&&best&&dist(u,current)<=dist(u,best)*1.2+8?current:best||null;
 }
 engage(u,enemy,g){
  const b=this.battle,c=CLASSES[u.type],d=dist(u,enemy),gate=b.map.gate;
  u.targetId=enemy.id;
  if(gate&&!gate.open&&(u.x-gate.x)*(enemy.x-gate.x)<0){this.siegeAI(u,g);return;}
  if(d<c.range+3&&b.nav.clear(u,enemy,0)){
   if(['archer','mage'].includes(u.type)&&d<65)this.move(u,{x:u.x+(u.x-enemy.x),y:u.y+(u.y-enemy.y)},1.08);
   else this.beginAttack(u,enemy);
  }else{this.move(u,enemy,g.chargeUntil>b.tick?1.5:1);if(u.pathFailed)this.siegeAI(u,g);}
 }
 performanceRows(b=this.battle,team='blue'){
  if(!b)return [];
  return b.units.filter(u=>u.team===team).map(u=>({id:u.id,label:unitLabel(u),type:u.type,groupId:u.groupId,group:b.groups.find(g=>g.id===u.groupId)?.name||'',status:!u.alive?'dead':u.evacuated?'retreated':'active',hp:u.hp,maxHp:u.maxHp,recordId:u.origin?.recordId||null,...clone(u.performance)}));
 }
 clearWaypoints(all=false){
  if(!this.battle)return false;
  for(const g of this.battle.groups)if(g.team==='blue'&&(all||g.id===this.selectedGroupId))g.waypoints=[];
  this.note('후속 이동 예약 해제 · 현재 목적지는 유지');return true;
 }
 setAutoRetreat(enabled,all=false){
  if(!this.battle||typeof enabled!=='boolean')return false;
  for(const g of this.battle.groups)if(g.team==='blue'&&(all||g.id===this.selectedGroupId))g.autoRetreat=enabled;
  this.note(`부상병 자동 철수 ${enabled?'ON · HP 25% 이하':'OFF'} (직접 조작 병사 제외)`);return true;
 }
 retreatUnit(id=this.selectedUnitId,enabled=true){
  const u=this.battle?.units.find(u=>u.id===id&&u.team==='blue'&&u.alive&&!u.evacuated);
  if(!u||typeof enabled!=='boolean')return false;
  u.individualRetreat=enabled;u.pathKey='';u.action=null;u.recoveryTicks=0;
  if(id===this.selectedUnitId)this.direct=false;
  this.note(`#${u.id} ${enabled?'개별 철수 · 전장 가장자리까지 이동':'철수 취소 · 부대 명령 복귀'}`);return true;
 }
 criticalUnits(){return (this.battle?.units||[]).filter(u=>u.team==='blue'&&u.alive&&!u.evacuated&&u.hp/u.maxHp<.45).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);}
 selectCritical(){const u=this.criticalUnits()[0];if(!u){this.note('HP 45% 미만의 위험 병사가 없습니다.');return false;}this.direct=false;return this.selectUnit(u.id);}
 recoveryBlock(u){
  const b=this.battle,g=b?.groups.find(g=>g.id===u?.groupId);
  if(!b||!u?.alive||u.evacuated||u.individualRetreat||!g||g.order==='retreat'||g.focusTargetId!==null)return 'inactive';
  if(this.direct&&this.selectedUnitId===u.id)return 'manual';
  if(u.lastHurtTick!==null&&b.tick-u.lastHurtTick<RECOVERY_TICKS||b.units.some(v=>v.team!==u.team&&v.alive&&!v.evacuated&&dist(u,v)<=RECOVERY_RADIUS))return 'threat';
  if(Math.hypot(u.vx,u.vy)>.5||g.order==='rest'&&dist(u,this.slot(u,g))>24)return 'positioning';
  if(u.action)return 'settling';
  return null;
 }
 restStatus(u){
  const b=this.battle,g=b?.groups.find(g=>g.id===u?.groupId),block=this.recoveryBlock(u);
  const state=!g||g.order!=='rest'?'inactive':block||(u.recoveryTicks>=RECOVERY_TICKS?'recovering':'settling');
  const labels={inactive:'휴식 대기',manual:'직접 조작 중',threat:'위협 감지',positioning:'집결 중',settling:'안전 대기',recovering:'회복 중'};
  return {state,label:labels[state],safeTicks:block?0:(u?.recoveryTicks||0),neededTicks:RECOVERY_TICKS};
 }
 updateRecovery(){
  const b=this.battle;
  for(const u of b.units){
   if(this.recoveryBlock(u)){u.recoveryTicks=0;continue;}
   u.recoveryTicks=Math.min(RECOVERY_TICKS,u.recoveryTicks+1);
   if(u.recoveryTicks<RECOVERY_TICKS)continue;
   const resting=b.groups.find(g=>g.id===u.groupId).order==='rest';
   u.fatigue=Math.max(0,u.fatigue-(resting?4:.1)*STEP);
   if(source(u)&&b.tick%120===((u.id%120)+120)%120&&u.hp<u.maxHp)this.heal(u,stats(u).HR*(resting?.7:.35));
   if(u.protectedUntil>b.tick&&b.tick%60===0)this.heal(u,2);
  }
 }
 retreatMotion(u){
  this.move(u,{x:u.team==='blue'?16:944,y:clamp(u.y,60,540)},1.25);
  if(u.team==='blue'?u.x<30:u.x>930){u.evacuated=true;u.action=null;this.text(u,'철수','#b0dbed');if(u.id===this.selectedUnitId){this.direct=false;this.cycleUnit(1);}}
 }
 completeMoves(){
  const b=this.battle;
  for(const g of b.groups){
   if(!['move','attackmove'].includes(g.order)||!g.spawned||g.focusTargetId!==null||g.engagement)continue;
   const live=b.units.filter(u=>u.groupId===g.id&&u.alive&&!u.evacuated&&!u.individualRetreat);
   // One soldier arriving must not change the order of every other soldier.
   if(!live.length||!live.every(u=>dist(u,this.slot(u,g))<=24))continue;
   if(g.waypoints.length){g.anchor=g.waypoints.shift();for(const u of live)u.pathKey='';}
   else g.order='hold';
  }
 }
 formation(name){if(this.selectedGroup&&['line','column','wedge','loose'].includes(name)){this.selectedGroup.formation=name;this.onChange();}}
 gateDamage(amount,attacker){const b=this.battle,gate=b?.map.gate;if(!gate||gate.open||attacker?.team===b.defenderTeam)return 0;const actual=Math.min(gate.hp,Math.max(0,amount));gate.hp-=actual;if(attacker?.performance)attacker.performance.gateDamage+=actual;this.fx(gate.x,gate.y,'#d6b27c',5);if(gate.hp===0){gate.open=true;gate.destroyed=true;b.nav.setBlocks(b.map.obstacles);for(const u of b.units)u.pathKey='';this.note('성문 파괴 · 모든 부대의 경로를 갱신했습니다.');for(const g of b.groups)if(g.order==='siege')g.order='attack';}}
 gateToggle(){const b=this.battle,g=b?.map.gate;if(!g)return;if(g.destroyed){this.note('파괴된 성문은 다시 닫을 수 없습니다.');return;}if(g.open&&b.units.some(u=>u.alive&&!u.evacuated&&rectHit(u.x,u.y,g,12))){this.note('성문 통로에 병사가 있어 닫을 수 없습니다.');return;}g.open=!g.open;b.nav.setBlocks([...b.map.obstacles,...(!g.open?[g]:[])]);for(const u of b.units)u.pathKey='';this.note(g.open?'성문 개방':'성문 폐쇄');}
 random(){const b=this.battle;b.seed^=b.seed<<13;b.seed^=b.seed>>>17;b.seed^=b.seed<<5;return (b.seed>>>0)/4294967296;}
 fx(x,y,color,n=4){const b=this.battle;if(!b)return;for(let i=0;i<n;i++)b.particles.push({x,y,z:18,vx:(this.random()-.5)*65,vy:(this.random()-.5)*65,vz:20+this.random()*30,life:.55,maxLife:.55,color});if(b.particles.length>240)b.particles.splice(0,b.particles.length-240);}
 text(u,text,color){this.battle.effects.push({x:u.x,y:u.y,text,color,life:.85});if(this.battle.effects.length>90)this.battle.effects.shift();}
 combatEvent(type,u,target,extra={}){const b=this.battle;if(!b)return;b.combatLog=b.combatLog||[];b.combatLog.push({tick:b.tick,type,actorId:u?.id??null,targetId:target?.id??null,record:u?.origin?.recordId??null,...extra});if(b.combatLog.length>120)b.combatLog.shift();}
 heal(u,amount,healer=null){if(!u.alive||u.evacuated)return 0;const healed=Math.min(amount,u.maxHp-u.hp);if(healed>0){u.hp+=healed;this.text(u,'+'+Math.ceil(healed),'#a9efb2');this.fx(u.x,u.y,'#91e4b3',3);this.battle.stats.healing+=healed;if(healer?.performance)healer.performance.healing+=healed;this.combatEvent('heal',healer,u,{amount:healed});}return healed;}
 hurt(u,amount,attacker,kind='melee'){if(!u?.alive||u.evacuated)return;const b=this.battle,g=b.groups.find(g=>g.id===u.groupId);if(attacker){const chance=hitChance(attacker,u,kind);b.stats.attempts=(b.stats.attempts||0)+1;if(chance<1&&this.random()>=chance){b.stats.misses=(b.stats.misses||0)+1;if(attacker.performance)attacker.performance.misses++;this.text(u,'회피','#c0cbd5');this.combatEvent('miss',attacker,u,{chance,kind});return 0;}b.stats.hits=(b.stats.hits||0)+1;if(attacker.performance)attacker.performance.hits++;}let dmg=damageValue(u,amount,kind);if(g.shieldUntil>b.tick)dmg=Math.round(dmg*.65);dmg=Math.min(u.hp,dmg);if(dmg>0){u.lastHurtTick=b.tick;u.recoveryTicks=0;}u.performance.received+=dmg;if(attacker?.performance)attacker.performance.damage+=dmg;u.hp=Math.max(0,u.hp-dmg);this.combatEvent('hit',attacker,u,{amount:dmg,kind,chance:attacker?hitChance(attacker,u,kind):1});u.hitFlash=9;this.text(u,'−'+dmg,'#f7cf96');this.fx(u.x,u.y,u.team==='blue'?'#d7c0a0':'#d99c76',3);if(attacker?.team==='blue')b.stats.damage+=dmg;
  if(u.hp===0){u.alive=false;u.deadAt=b.tick;u.action=null;if(attacker?.performance)attacker.performance.kills++;if(attacker?.team==='blue'&&attacker.alive){attacker.exp+=18;b.stats.kills++;while(attacker.level<99&&attacker.exp>=attacker.level*60){attacker.exp-=attacker.level*60;attacker.level++;attacker.maxHp=maxHP(attacker);attacker.hp=Math.min(attacker.maxHp,attacker.hp+15);this.text(attacker,'LEVEL UP','#f5e3a1');}}if(this.selectedUnitId===u.id){this.direct=false;this.cycleUnit(1);}}
 return dmg;
 }
 skill(){const b=this.battle,u=this.selected;if(!b||this.paused||!u?.alive||u.evacuated)return false;if(u.skillCooldown>0){this.note('고유 스킬 재사용 대기 중');return false;}const g=b.groups.find(g=>g.id===u.groupId),enemies=b.units.filter(v=>v.team!==u.team&&v.alive&&!v.evacuated);
  if(u.type==='infantry'){g.shieldUntil=b.tick+480;for(const v of b.units.filter(v=>v.groupId===g.id&&v.alive))this.fx(v.x,v.y,'#9bbde8',2);}
  if(u.type==='knight'){let hit=0;for(const v of enemies)if(dist(u,v)<65&&b.nav.clear(u,v,0)){this.hurt(v,source(u)?attackPower(u)*1.2:38+u.level*3,u);hit++;}if(!hit){this.note('회전 베기 범위 안에 적이 없습니다.');return false;}}
  if(u.type==='archer'){const targets=enemies.filter(v=>dist(u,v)<215&&b.nav.clear(u,v,0)).sort((a,c)=>dist(u,a)-dist(u,c)).slice(0,5);if(!targets.length){this.note('사선 안에 표적이 없습니다.');return false;}for(const v of targets)this.shoot(u,v,source(u)?attackPower(u)*.9:22+u.level*2);}
  if(u.type==='mage'){const t=enemies.filter(v=>dist(u,v)<210&&b.nav.clear(u,v,0)).sort((a,c)=>dist(u,a)-dist(u,c))[0];if(!t){this.note('마법 사선 안에 적이 없습니다.');return false;}for(const v of enemies)if(dist(t,v)<70&&b.nav.clear(u,v,0)){this.hurt(v,attackPower(u)*1.15,u,'magic');this.fx(v.x,v.y,'#b998ee',5);}}
  if(u.type==='healer'){let healed=0;for(const v of b.units)if(v.team===u.team&&dist(u,v)<145&&b.nav.clear(u,v,0))healed+=this.heal(v,source(u)?18+stats(u).HR*2:34+u.level*2,u);if(!healed){this.note('주변에 회복할 아군이 없습니다.');return false;}}
  u.recoveryTicks=0;u.skillCooldown=14*60;this.note(`${CLASSES[u.type].name} · ${CLASSES[u.type].skill}`);return true;
 }
 healSpell(){const b=this.battle,u=this.selected;if(!b||this.paused||!u?.alive||u.evacuated||b.healCooldown>0)return false;let sum=0;for(const v of b.units)if(v.team==='blue'&&dist(u,v)<145&&b.nav.clear(u,v,0))sum+=this.heal(v,20+u.level*2,u);if(!sum){this.note('회복이 필요한 아군이 없습니다.');return false;}u.recoveryTicks=0;b.healCooldown=960;this.note(`전술 회복 · HP ${Math.round(sum)}`);return true;}
 shoot(u,target,damage,kind=u.type==='mage'?'magic':'arrow'){const d=Math.max(1,dist(u,target));this.battle.projectiles.push({x:u.x,y:u.y,z:20,sx:u.x,sy:u.y,dx:(target.x-u.x)/d,dy:(target.y-u.y)/d,travel:0,total:d,life:d/340+.2,attackerId:u.id,team:u.team,damage,kind});}
 beginAttack(u,target,kind='attack'){if(u.cool>0||u.action||kind==='gate'&&u.team===this.battle.defenderTeam)return;u.recoveryTicks=0;const b=this.battle,c=CLASSES[u.type];u.cool=Math.round(c.rate*fatigueEffects(u).attackIntervalMultiplier);u.action={kind,targetId:target.id,start:b.tick,hit:b.tick+c.windup,end:b.tick+c.windup+18,done:false};u.yaw=Math.atan2(target.x-u.x,target.y-u.y);u.fatigue=clamp(u.fatigue+1,0,100);}
 move(u,target,mult=1,direct=false){
  const b=this.battle;let p=target;u.pathFailed=false;
  if(!direct&&!b.nav.clear(u,target)){const key=`${Math.floor(target.x/24)}:${Math.floor(target.y/24)}:${b.nav.version}`;if(u.pathKey!==key||u.pathExpiry<=b.tick){u.path=b.nav.path(u,target)||[];u.pathIndex=0;u.pathKey=key;u.pathExpiry=b.tick+100;}while(u.pathIndex<u.path.length&&dist(u,u.path[u.pathIndex])<10)u.pathIndex++;p=u.path[u.pathIndex];if(!p){u.pathFailed=true;return;}}
  else{u.path=[];u.pathIndex=0;}
  const dx=p.x-u.x,dy=p.y-u.y,d=Math.hypot(dx,dy);if(d<2)return;const speed=CLASSES[u.type].speed*fatigueEffects(u).movementMultiplier*mult,step=Math.min(d,speed*STEP);const ox=u.x,oy=u.y;u.x+=dx/d*step;u.y+=dy/d*step;b.nav.resolve(u);u.vx=(u.x-ox)/STEP;u.vy=(u.y-oy)/STEP;u.yaw=Math.atan2(dx,dy);u.fatigue=clamp(u.fatigue+.26*STEP,0,100);
 }
 closestEnemy(u){let best=null,value=Infinity;for(const v of this.battle.units){if(v.team===u.team||!v.alive||v.evacuated)continue;const d=dist(u,v);if(d<value){value=d;best=v;}}return best;}
 slot(u,g){const i=g.unitIds.indexOf(u.id),n=g.unitIds.length,dir=u.team==='blue'?1:-1;let depth=0,side=0;
  if(g.formation==='column'){depth=Math.floor(i/3)*23;side=(i%3-1)*22;}else if(g.formation==='wedge'){const row=Math.floor(Math.sqrt(i)),offset=i-row*row;depth=row*22;side=(offset-row)*19;}else{const cols=g.formation==='loose'?6:8;depth=Math.floor(i/cols)*(g.formation==='loose'?35:24);side=(i%cols-(Math.min(cols,n)-1)/2)*(g.formation==='loose'?36:22);}
  const p={x:clamp(g.anchor.x-dir*depth,28,932),y:clamp(g.anchor.y+side,28,572)};
  if(this.battle.nav.blocks.some(b=>rectHit(p.x,p.y,b,12))){const cell=this.battle.nav.nearest(p.x,p.y);if(cell)return {x:cell[0]*24+12,y:cell[1]*24+12};}return p;
 }
 siegeAI(u,g){const b=this.battle,gate=b.map.gate;if(!gate||gate.open||u.team===b.defenderTeam)return false;const c=CLASSES[u.type];if(u.type==='healer')return false;const left=u.x<gate.x;let y=clamp(u.y,gate.y-gate.h/2+15,gate.y+gate.h/2-15),point={x:gate.x+(left?-1:1)*(gate.w/2+16),y};const edgeDist=Math.max(0,Math.abs(u.x-gate.x)-gate.w/2);if(edgeDist<=c.range&&u.y>=gate.y-gate.h/2&&u.y<=gate.y+gate.h/2){this.beginAttack(u,gate,'gate');}else this.move(u,point,1);return true;}
 ai(u,g){
  const b=this.battle,c=CLASSES[u.type];
  if(g.order==='retreat'||u.individualRetreat){this.retreatMotion(u);return;}
  if(g.team==='blue'&&g.autoRetreat&&u.hp/u.maxHp<=.25){u.individualRetreat=true;u.action=null;u.pathKey='';this.retreatMotion(u);return;}
  if(u.action)return;
  if(u.protectedUntil>b.tick){this.move(u,{x:u.team==='blue'?85:880,y:u.y});return;}
  const focus=g.focusTargetId!==null?b.units.find(v=>v.id===g.focusTargetId&&v.alive&&!v.evacuated):null;
  if(g.order==='rest'&&!focus){
   const enemy=this.closestEnemy(u),p=this.slot(u,g);
   if(u.type==='healer'){
    const patient=b.units.filter(v=>v.team===u.team&&v.alive&&!v.evacuated&&v.hp<v.maxHp*.85&&dist(u,v)<=c.range&&b.nav.clear(u,v,0)).sort((a,c)=>a.hp/a.maxHp-c.hp/c.maxHp||a.id-c.id)[0];
    if(patient){this.beginAttack(u,patient,'heal');return;}
   }else if(enemy&&dist(u,enemy)<=c.range+3&&b.nav.clear(u,enemy,0)){this.beginAttack(u,enemy);return;}
   if(dist(u,p)>12)this.move(u,p);
   return;
  }
  const advancing=g.order==='attackmove',contact=advancing&&g.engagement;
  if(advancing&&!focus&&!contact){const p=this.slot(u,g);if(dist(u,p)>12)this.move(u,p);return;}
  const enemy=focus||(contact?this.tacticalEnemy(u,g):this.closestEnemy(u));
  if(!enemy){if(contact){const p=this.slot(u,{...g,anchor:g.engagement});if(dist(u,p)>16)this.move(u,p);}return;}
  u.targetId=enemy.id;const d=dist(u,enemy);
  // Explicit movement wins over healer chasing. Arrival is evaluated once, per group.
  if(!focus&&(g.order==='move'||g.order==='regroup')){const p=this.slot(u,g);if(dist(u,p)>12){this.move(u,p);return;}if(d>90&&u.type!=='healer')return;}
  if(!focus&&g.order==='hold'){const p=this.slot(u,g);if(dist(u,p)>19&&d>45){this.move(u,p);return;}if(dist(enemy,g.anchor)>170&&u.type!=='healer')return;}
  if(u.type==='healer'){
   if(d<65){this.move(u,{x:u.x+(u.x-enemy.x),y:u.y+(u.y-enemy.y)},1.05);return;}
   const allies=b.units.filter(v=>v.team===u.team&&v.alive&&!v.evacuated&&v.hp<v.maxHp*.85&&dist(u,v)<230&&(!(g.order==='hold'||g.order==='move')||dist(g.anchor,v)<170)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp||a.id-b.id);
   const patient=allies.find(v=>dist(u,v)<=c.range&&b.nav.clear(u,v,0));
   if(patient){this.beginAttack(u,patient,'heal');return;}
   if(allies.length&&!['move','hold'].includes(g.order)){this.move(u,allies[0]);return;}
   if(['move','hold'].includes(g.order))return;
   if(focus||advancing){const friends=b.units.filter(v=>v.groupId===g.id&&v.alive&&!v.evacuated&&v.type!=='healer');if(friends.length){const p={x:friends.reduce((n,v)=>n+v.x,0)/friends.length+(u.team==='blue'?-48:48),y:friends.reduce((n,v)=>n+v.y,0)/friends.length};if(dist(u,p)>30)this.move(u,p);}return;}
  }
  if(focus||contact){
   if(u.hp/u.maxHp<.2&&u.type!=='knight'){this.move(u,{x:u.team==='blue'?70:890,y:u.y},1.05);return;}
   this.engage(u,enemy,g);return;
  }
  if(g.order==='siege'&&this.siegeAI(u,g))return;
  if(u.hp/u.maxHp<.2&&u.type!=='knight'&&g.order!=='hold'){this.move(u,{x:u.team==='blue'?70:890,y:u.y},1.05);return;}
  const gate=b.map.gate;
  if(gate&&!gate.open&&(u.x-gate.x)*(enemy.x-gate.x)<0){
   if(this.siegeAI(u,g))return;
   const p={x:gate.x+(u.x<gate.x?-120:120),y:clamp(u.y,140,460)};if(dist(u,p)>20)this.move(u,p);return;
  }
  const range=c.range,clear=b.nav.clear(u,enemy,0);
  if(d<range+3&&clear){if(['archer','mage'].includes(u.type)&&d<65)this.move(u,{x:u.x+(u.x-enemy.x),y:u.y+(u.y-enemy.y)},1.08);else this.beginAttack(u,enemy);}
  else{this.move(u,enemy,g.chargeUntil>b.tick?1.5:1);if(u.pathFailed)this.siegeAI(u,g);}
 }
 tick(input={}){
  const b=this.battle;if(this.mode!=='battle'||this.paused||!b)return;b.tick++;b.time=b.tick*STEP;b.healCooldown=Math.max(0,b.healCooldown-1);
  for(const g of b.groups){if(!g.spawned&&b.tick>=g.arrival)this.spawnGroup(g);if(g.order==='charge'&&b.tick>=g.chargeUntil)g.order='attack';}
  this.refreshTactics();
  for(const u of b.units){u.vx=0;u.vy=0;if(!u.alive||u.evacuated)continue;u.cool=Math.max(0,u.cool-1);u.skillCooldown=Math.max(0,u.skillCooldown-1);u.hitFlash=Math.max(0,u.hitFlash-1);if(u.action&&b.tick>u.action.end)u.action=null;const g=b.groups.find(g=>g.id===u.groupId);
   if(u.id===this.selectedUnitId&&this.direct){if(!u.action&&input.move){this.move(u,{x:u.x+input.move.x*100,y:u.y+input.move.y*100},1.12,true);}if(input.attack){const e=this.closestEnemy(u);if(e&&dist(u,e)<=CLASSES[u.type].range+3&&b.nav.clear(u,e,0))this.beginAttack(u,e);else if(b.map.gate&&!b.map.gate.open&&Math.abs(u.x-b.map.gate.x)-b.map.gate.w/2<CLASSES[u.type].range&&Math.abs(u.y-b.map.gate.y)<b.map.gate.h/2)this.beginAttack(u,b.map.gate,'gate');}}
   else this.ai(u,g);u.phase+=Math.hypot(u.vx,u.vy)*STEP*.12;
  }
  // Collect hit intents before applying damage: both attacks can land on the same tick.
  const hits=[];
  for(const u of b.units){if(!u.alive||u.evacuated||!u.action||u.action.done||b.tick<u.action.hit)continue;const a=u.action;a.done=true;const c=CLASSES[u.type];if(a.kind==='gate'){const gate=b.map.gate;if(gate&&!gate.open&&Math.abs(u.x-gate.x)-gate.w/2<=c.range+8&&Math.abs(u.y-gate.y)<gate.h/2+8)hits.push({gate:true,damage:(source(u)?attackPower(u):c.atk)*.7,attacker:u});continue;}const t=b.units.find(v=>v.id===a.targetId);if(!t?.alive||t.evacuated)continue;
   if(a.kind==='heal'){if(dist(u,t)<=c.range+8&&b.nav.clear(u,t,0))hits.push({heal:true,target:t,damage:source(u)?12+stats(u).HR:18,attacker:u});}else if(dist(u,t)<=c.range+8&&b.nav.clear(u,t,0)){if(['archer','mage'].includes(u.type))this.shoot(u,t,attackPower(u));else hits.push({target:t,damage:attackPower(u),attacker:u});}
  }
  for(const hit of hits){if(hit.gate)this.gateDamage(hit.damage,hit.attacker);else if(hit.heal)this.heal(hit.target,hit.damage,hit.attacker);else this.hurt(hit.target,hit.damage,hit.attacker);}
  this.refreshTactics();this.separate();this.completeMoves();
  for(const p of b.projectiles){const ox=p.x,oy=p.y;p.x+=p.dx*340*STEP;p.y+=p.dy*340*STEP;p.travel+=340*STEP;p.life-=STEP;p.z=19+Math.sin(Math.min(1,p.travel/Math.max(1,p.total))*Math.PI)*22;if(b.nav.blocks.some(r=>r.kind!=='water'&&segmentRect(ox,oy,p.x,p.y,r))){p.life=0;continue;}for(const u of b.units)if(u.team!==p.team&&u.alive&&!u.evacuated&&dist(p,u)<12){this.hurt(u,p.damage,b.units.find(u=>u.id===p.attackerId),p.kind||'arrow');p.life=0;break;}}
  b.projectiles=b.projectiles.filter(p=>p.life>0);this.updateRecovery();
  for(const p of b.particles){p.life-=STEP;p.x+=p.vx*STEP;p.y+=p.vy*STEP;p.z+=p.vz*STEP;p.vz-=95*STEP;}b.particles=b.particles.filter(p=>p.life>0);
  for(const e of b.effects)e.life-=STEP;b.effects=b.effects.filter(e=>e.life>0);
  const active=team=>b.units.filter(u=>u.team===team&&u.alive&&!u.evacuated).length;
  if(!active('red'))this.endBattle('victory');else if(!active('blue')&&!b.groups.some(g=>g.team==='blue'&&!g.spawned))this.endBattle('defeat');
 }
 separate(){const b=this.battle,grid=new Map(),size=24;for(const u of b.units){if(!u.alive||u.evacuated)continue;const x=Math.floor(u.x/size),y=Math.floor(u.y/size);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const v of grid.get(`${x+dx}:${y+dy}`)||[]){let ox=u.x-v.x,oy=u.y-v.y,d=Math.hypot(ox,oy);if(d>=17)continue;if(d<.001){ox=(u.id%2?1:-1)*.001;oy=.001;d=Math.hypot(ox,oy);}const s=(17-d)*.5;u.x+=ox/d*s;u.y+=oy/d*s;v.x-=ox/d*s;v.y-=oy/d*s;b.nav.resolve(v);}b.nav.resolve(u);const key=`${x}:${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(u);}}
 endBattle(outcome){
  const b=this.battle;if(!b||b.resultApplied)return false;
  const report={outcome,training:b.training,region:REGIONS[b.regionId].name,time:b.time,profile:this.world.profile?.id||'custom-v15',combatLog:clone(b.combatLog||[]),metricsSinceTick:b.metricsSinceTick,units:this.performanceRows(b),groups:b.groups.filter(g=>g.team==='blue').map(g=>{const all=b.units.filter(u=>u.groupId===g.id);return {name:g.name,joined:g.spawned,total:all.length,survived:all.filter(u=>u.alive).length,lost:all.filter(u=>!u.alive).length,retreated:all.filter(u=>u.evacuated).length};}),...b.stats};
  if(!b.training){
   const next=clone(this.world);if(next.committedBattles.includes(b.id))return false;
   for(const g of b.groups){if(!g.spawned)continue;let holder,key='roster';if(g.sourceKind==='army')holder=next.armies.find(a=>a.id===g.sourceId);else if(g.sourceKind==='reserve'){holder=next;key='reserve';}else if(g.sourceKind==='enemy')holder=next.enemyArmies.find(e=>e.id===g.sourceId);else if(g.sourceKind==='garrison'){holder=next.regions[g.sourceId];key='garrison';}if(!holder)continue;
    const ids=new Set(g.unitIds);holder[key]=holder[key].filter(u=>!ids.has(u.id));for(const u of b.units.filter(u=>u.groupId===g.id)){if(u.alive)holder[key].push(plainUnit(u));else if(u.team==='blue')next.graveyard.push({...plainUnit(u),turn:next.turn,battle:b.id});}
   }
   next.enemyArmies=next.enemyArmies.filter(e=>e.roster.length);
   const a=next.armies.find(a=>a.id===b.activeArmyId),r=next.regions[b.regionId];
   if(outcome==='victory'){r.owner='blue';a.region=r.id;next.wins++;next.gold+=90;for(const e of next.enemyArmies.filter(e=>e.region===r.id)){const back=REGIONS[e.region].links.find(id=>next.regions[id].owner==='red');if(back!==undefined)e.region=back;}}
   else if(b.ownerBefore==='blue'){r.owner='red';for(const a of next.armies.filter(a=>a.region===r.id)){const safe=REGIONS[r.id].links.find(id=>next.regions[id].owner==='blue');if(safe!==undefined)a.region=safe;else{for(const u of a.roster)next.graveyard.push({...plainUnit(u),turn:next.turn,battle:b.id,captured:true});a.roster=[];}}}
   next.committedBattles.push(b.id);next.committedBattles=next.committedBattles.slice(-300);this.processCampaign(next);report.newEvents=next.campaign.pending.filter(id=>!this.world.campaign.pending.includes(id));report.campaignWon=next.campaign.status==='won';this.validate(next);this.world=next;
  }
  b.resultApplied=true;this.report=report;this.mode='world';this.paused=false;this.direct=false;this.battle=null;this.selectedUnitId=null;this.selectedGroupId=null;this.autoClock=0;
  this.note(b.training?'연습 종료 · 캠페인 상태 유지':outcome==='victory'?'전투 승리 · 생존자와 경험치를 원래 군단에 반영했습니다.':'전투 종료 · 철수한 병력은 보존됩니다.');this.onChange();return true;
 }
 processCampaign(w){
  if(!w.campaign)w.campaign={seen:w.regions.filter(r=>r.owner==='blue').map(r=>r.id),pending:[],choices:{},status:'active'};
  const c=w.campaign;
  for(const r of w.regions)if(r.owner==='blue'&&!c.seen.includes(r.id)){c.seen.push(r.id);if(CAMPAIGN_EVENTS[r.id])c.pending.push(r.id);}
  c.status=w.regions.every(r=>r.owner==='blue')&&!w.enemyArmies.some(e=>e.roster.length)?'won':'active';
 }
 chooseReward(regionId,choiceId){
  if(this.mode!=='world')return false;
  const event=CAMPAIGN_EVENTS[regionId],choice=event?.choices.find(c=>c.id===choiceId),c=this.world.campaign;
  if(!choice||!c.pending.includes(regionId)||Object.hasOwn(c.choices,String(regionId)))return false;
  const count=(choice.units||[]).reduce((n,u)=>n+u[2],0);
  if(this.world.reserve.length+count>120){this.note('예비군 자리가 부족합니다. 부대를 편성한 뒤 보상을 다시 선택하세요.');return false;}
  const next=clone(this.world);let nextId=this.nextId;
  for(const [type,level,n] of choice.units||[])for(let i=0;i<n;i++){if(this.world.profile?.id==='hybrid-repoN-v19'){const pool=DATA.records.filter(r=>DATA.role(r)===type&&r.raw.hitPoint<=650),r=pool[nextId%pool.length];next.reserve.push({id:nextId++,type,level,exp:0,hp:r.raw.hitPoint+(level-1)*7,fatigue:0,origin:{recordId:r.id,hash:r.hash}});}else next.reserve.push({id:nextId++,type,level,exp:0,hp:maxHP({type,level}),fatigue:0});}
  next.gold+=choice.gold||0;next.campaign.choices[regionId]=choiceId;next.campaign.pending=next.campaign.pending.filter(id=>id!==regionId);
  this.validate(next);this.world=next;this.nextId=nextId;this.note(`${event.title} · ${choice.label}: ${choice.detail}`);return true;
 }
 validate(w=this.world){
  if(!w||!Array.isArray(w.regions)||w.regions.length!==6||!Array.isArray(w.armies)||w.armies.length<1||w.armies.length>5||!Array.isArray(w.reserve)||w.reserve.length>120||!Array.isArray(w.enemyArmies))throw Error('캠페인 구조 오류');
  if(w.profile){const p=w.profile;if(!['custom-v15','hybrid-repoN-v19'].includes(p.id)||p.ruleset!==(p.id==='hybrid-repoN-v19'?'hybrid-combat-1':'custom-v15')||p.datasetRevision!==(p.id==='hybrid-repoN-v19'?DATA.manifest.datasetRevision:null))throw Error('규칙 프로필 또는 복원 데이터 지문 불일치');}
  if(w.equipmentStock){if(typeof w.equipmentStock!=='object'||Array.isArray(w.equipmentStock)||Object.entries(w.equipmentStock).some(([id,n])=>!DATA.item(id)||!Number.isSafeInteger(n)||n<0||n>120))throw Error('장비 재고 오류');}
  const ids=new Set(),aids=new Set(),eids=new Set();const checkRoster=(list,limit)=>{if(!Array.isArray(list)||list.length>limit)throw Error('병력 정원 오류');for(const u of list){validateOrigin(u);if(!u.origin&&w.profile?.id==='hybrid-repoN-v19')throw Error('복원 캠페인 병사의 출처가 누락되었습니다.');if(u.origin&&w.profile?.id!=='hybrid-repoN-v19')throw Error('커스텀 캠페인에 복원 병사가 혼입되었습니다.');if(!Number.isInteger(u.id)||u.id<=0||ids.has(u.id)||!Object.hasOwn(CLASSES,u.type)||!Number.isInteger(u.level)||u.level<1||u.level>99||!Number.isFinite(u.hp)||u.hp<=0||u.hp>maxHP(u)||!Number.isFinite(u.exp)||u.exp<0||!Number.isFinite(u.fatigue)||u.fatigue<0||u.fatigue>100)throw Error('병사 데이터 또는 중복 ID 오류: '+u.id);ids.add(u.id);}};
  for(const [i,r] of w.regions.entries()){if(r.id!==i||!['blue','red','neutral'].includes(r.owner))throw Error('거점 데이터 오류');checkRoster(r.garrison,80);}
  for(const a of w.armies){if(!Number.isInteger(a.id)||a.id<0||aids.has(a.id)||!Number.isInteger(a.region)||!w.regions[a.region])throw Error('군단 데이터 오류');aids.add(a.id);checkRoster(a.roster,MAX_ARMY);}
  if(!aids.has(w.activeArmyId))throw Error('활성 군단 오류');checkRoster(w.reserve,120);
  for(const e of w.enemyArmies){if(typeof e.id!=='string'||eids.has(e.id)||!Number.isInteger(e.region)||!w.regions[e.region])throw Error('적 군단 데이터 오류');eids.add(e.id);checkRoster(e.roster,40);}
  if(!Number.isInteger(w.turn)||w.turn<0||!Number.isInteger(w.gold)||w.gold<0||!Number.isInteger(w.wins)||w.wins<0||!Number.isInteger(w.battleSerial)||w.battleSerial<0||!Array.isArray(w.committedBattles)||w.committedBattles.some(v=>typeof v!=='string')||!Array.isArray(w.graveyard))throw Error('진행 상태 오류');
  const deadIds=new Set();for(const dead of w.graveyard){validateOrigin(dead);if(!Number.isSafeInteger(dead.id)||dead.id<=0||ids.has(dead.id)||deadIds.has(dead.id))throw Error('사망 병사 ID 오류');deadIds.add(dead.id);}
  const c=w.campaign;
  if(c){
   if(!Array.isArray(c.seen)||!Array.isArray(c.pending)||!c.choices||typeof c.choices!=='object'||Array.isArray(c.choices)||!['active','won'].includes(c.status))throw Error('캠페인 목표 데이터 오류');
   if(c.seen.length>6||new Set(c.seen).size!==c.seen.length||c.seen.some(id=>!Number.isInteger(id)||!REGIONS[id]))throw Error('캠페인 발견 거점 오류');
   if(c.pending.length>5||new Set(c.pending).size!==c.pending.length||c.pending.some(id=>!c.seen.includes(id)||!CAMPAIGN_EVENTS[id]||Object.hasOwn(c.choices,String(id))))throw Error('중복/잘못된 미결 보상');
   for(const [id,choice] of Object.entries(c.choices))if(!c.seen.includes(Number(id))||!CAMPAIGN_EVENTS[id]?.choices.some(x=>x.id===choice))throw Error('캠페인 선택 기록 오류');
   if(c.status==='won'&&(!w.regions.every(r=>r.owner==='blue')||w.enemyArmies.some(e=>e.roster.length)))throw Error('캠페인 승리 상태 오류');
  }
  return {units:ids.size,armies:w.armies.length,maxId:Math.max(0,...ids,...w.graveyard.map(u=>u.id))};
 }
 snapshotBattle(){
  const b=this.battle;if(!b)return null;
  const data=clone({...b,nav:undefined});data.navVersion=b.nav.version;return data;
 }
 export(){
  const audit=this.validate();if(!Number.isSafeInteger(this.nextId)||this.nextId<=audit.maxId)throw Error('ID 카운터 오류');
  const session={mode:this.mode,selectedRegion:this.selectedRegion,selectedUnitId:this.selectedUnitId,selectedGroupId:this.selectedGroupId,direct:this.direct,speed:this.options.speed,battle:this.snapshotBattle()};
  if(session.battle)this.validateBattle(session.battle,this.world,session);
  return {schemaVersion:22,game:'FirstQueen4_Web',savedAt:new Date().toISOString(),nextId:this.nextId,world:clone(this.world),supportIds:[...this.supportIds],session};
 }
 import(payload){
  let p=clone(payload);const oldNext=this.nextId;
  try{
   if(!p||p.game!=='FirstQueen4_Web'&&!(p.world&&p.uid))throw Error('퍼스트퀸 저장 파일이 아닙니다.');
   if(![22,21,20,19,15,14].includes(p.schemaVersion)){if(p.schemaVersion!==13&&p.schemaVersion!==undefined)throw Error('지원하지 않는 저장 버전');p=this.migrate13(p);}
   if(![22,21,20,19,15].includes(p.schemaVersion)){p.world.campaign={seen:p.world.regions.filter(r=>r.owner==='blue').map(r=>r.id),pending:[],choices:{},status:'active'};this.processCampaign(p.world);p.session={mode:'world',selectedRegion:p.world.armies.find(a=>a.id===p.world.activeArmyId)?.region??0,direct:false,speed:1,battle:null};}
   if([22,21,20,19].includes(p.schemaVersion)&&(!p.world?.profile||!p.world?.equipmentStock))throw Error('규칙 프로필/장비 기록 누락');if(![22,21,20,19].includes(p.schemaVersion)){if(p.world.profile?.id==='hybrid-repoN-v19')throw Error('구형 저장에 복원 프로필을 넣을 수 없습니다.');p.world.profile={id:'custom-v15',ruleset:'custom-v15',datasetRevision:null};p.world.equipmentStock={};if(p.session?.battle?.before){p.session.battle.before.profile=clone(p.world.profile);p.session.battle.before.equipmentStock={};}}
   if(![22,21,20].includes(p.schemaVersion)&&p.session?.battle){
    for(const g of p.session.battle.groups||[]){g.waypoints=[];g.autoRetreat=false;}
    for(const u of p.session.battle.units||[])u.individualRetreat=false;
   }
   if(![22,21].includes(p.schemaVersion)&&p.session?.battle){
    const b=p.session.battle;b.metricsSinceTick=b.tick;
    for(const g of b.groups||[]){g.focusTargetId=null;g.focusOrigin=null;g.engagement=null;g.engageAfter=0;}
    for(const u of b.units||[])u.performance=emptyPerformance();
   }
   if(p.schemaVersion!==22&&p.session?.battle){
    const b=p.session.battle;b.defenderTeam='red';
    for(const u of b.units||[]){u.recoveryTicks=0;u.lastHurtTick=null;}
   }
   const audit=this.validate(p.world);if(!p.world.campaign)throw Error('캠페인 기록 누락');if(!Number.isSafeInteger(p.nextId)||p.nextId<=audit.maxId)throw Error('저장 ID 카운터 오류');
   const session=p.session;if(!session||!['world','battle'].includes(session.mode)||![.5,1,2,4].includes(session.speed)||typeof session.direct!=='boolean')throw Error('세션 데이터 오류');
   let restored=null;
   if(session.mode==='battle'){
    this.validateBattle(session.battle,p.world,session);restored=session.battle;
    restored.nav=new Navigation([...restored.map.obstacles,...(restored.map.gate&&!restored.map.gate.open?[restored.map.gate]:[])]);restored.nav.version=restored.navVersion;delete restored.navVersion;
   }else if(session.battle!==null)throw Error('전략 단계에 전투 데이터가 있습니다.');
   // All validation completes before replacing live state. A malformed file never destroys current progress.
   this.world=p.world;this.nextId=p.nextId;this.supportIds=Array.isArray(p.supportIds)?[...new Set(p.supportIds.filter(id=>p.world.armies.some(a=>a.id===id&&id!==p.world.activeArmyId)))]:[];
   this.battle=restored;this.report=null;this.mode=session.mode;this.selectedRegion=Number.isInteger(session.selectedRegion)&&REGIONS[session.selectedRegion]?session.selectedRegion:this.activeArmy.region;
   this.selectedUnitId=restored?session.selectedUnitId:null;this.selectedGroupId=restored?session.selectedGroupId:null;this.paused=!!restored;this.direct=!!restored&&session.direct;
   this.options.speed=session.speed;this.options.enemyAuto=false;this.autoClock=0;
   this.note(restored?'전투 복원 완료 · P로 재개하세요. 명령·투사체·증원·성문 상태를 복구했습니다.':'캠페인 불러오기 완료 · 무결성 검사 통과');return true;
  }catch(err){this.nextId=oldNext;throw err;}
 }
 validateBattle(b,w,session){
  const fail=msg=>{throw Error('전투 저장 오류: '+msg);};
  const num=(v,min=-1e8,max=1e8)=>Number.isFinite(v)&&v>=min&&v<=max;
  const integer=(v,min=0,max=1e9)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const point=p=>p&&num(p.x,-1000,1960)&&num(p.y,-1000,1600);
  if(!b||typeof b.id!=='string'||b.id.length>80||!integer(b.regionId,0,5)||!integer(b.originRegion,0,5)||typeof b.training!=='boolean'||!integer(b.tick)||!num(b.time,0)||Math.abs(b.time-b.tick*STEP)>.00001||!integer(b.seed,-2147483648,4294967295)||!integer(b.navVersion,1)||b.resultApplied!==false)fail('전투 기본 상태');
  if(!w.armies.some(a=>a.id===b.activeArmyId)||!['blue','red','neutral'].includes(b.ownerBefore)||w.committedBattles.includes(b.id))fail('이미 적용되었거나 잘못된 전투');
  if(b.training&&b.id!=='training')fail('연습 전투 ID');
  if(!b.training&&b.id!==`b${w.battleSerial}`)fail('전투 일련번호 불일치');
  if(!b.map||!MAP_INFO[b.map.kind]||b.map.kind!==REGIONS[b.regionId].kind)fail('전장 정보');
  if(!['blue','red'].includes(b.defenderTeam)||b.training&&b.defenderTeam!=='red'||b.ownerBefore!=='blue'&&b.defenderTeam!=='red')fail('성문 수비 진영');
  const expected=battlefield(b.map.kind,b.defenderTeam);
  if(JSON.stringify(b.map.obstacles)!==JSON.stringify(expected.obstacles))fail('전장 장애물');
  const gate=b.map.gate;
  if(!!gate!==!!expected.gate)fail('성문 누락');
  if(gate){for(const k of ['id','kind','x','y','w','h','height','maxHp'])if(gate[k]!==expected.gate[k])fail('성문 구조');if(!num(gate.hp,0,gate.maxHp)||typeof gate.open!=='boolean'||typeof gate.destroyed!=='boolean'||(gate.hp===0)!==gate.destroyed||gate.destroyed&&!gate.open)fail('성문 상태');}
  if(!Array.isArray(b.groups)||b.groups.length<1||b.groups.length>12||!Array.isArray(b.units)||b.units.length>500||!integer(b.healCooldown,0,100000))fail('부대/유닛 목록');
  if(!integer(b.metricsSinceTick,0,b.tick))fail('기여도 집계 시작 시각');
  const sources=new Set(),gids=new Set(),rosterIds=new Set(),runtimeIds=new Set();
  for(const g of b.groups){
   if(!integer(g.engageAfter,0,b.tick+120))fail('교전 재탐색 시각');
   if(g.focusTargetId!==null&&(!Number.isSafeInteger(g.focusTargetId)||!b.units.some(u=>u.id===g.focusTargetId&&u.team!==g.team))||(g.focusTargetId===null)!==(g.focusOrigin===null)||g.focusOrigin!==null&&!point(g.focusOrigin)||g.engagement!==null&&(!point(g.engagement)||g.order!=='attackmove')||g.focusTargetId!==null&&g.order==='retreat')fail('집중 표적 / 교전 이동 상태');
   if(!Array.isArray(g.waypoints)||g.waypoints.length>8||g.waypoints.length&&!['move','attackmove'].includes(g.order)||g.waypoints.some(p=>!p||!num(p.x,24,936)||!num(p.y,24,576))||typeof g.autoRetreat!=='boolean')fail('이동 예약 또는 자동 철수 설정');
   if(typeof g.id!=='string'||gids.has(g.id)||typeof g.name!=='string'||g.name.length>120||!['blue','red'].includes(g.team)||!ORDERS[g.order]||!['line','column','wedge','loose'].includes(g.formation)||!point(g.anchor)||typeof g.spawned!=='boolean'||!integer(g.arrival)||!integer(g.chargeUntil)||!integer(g.shieldUntil)||!Array.isArray(g.roster)||g.roster.length>120||!Array.isArray(g.unitIds))fail('부대 상태');gids.add(g.id);
   let original,team;const sourceKey=g.sourceKind+':'+g.sourceId;
   if(sources.has(sourceKey))fail('중복 출전 부대');sources.add(sourceKey);
   if(g.sourceKind==='army'){original=w.armies.find(a=>a.id===g.sourceId)?.roster;team='blue';}
   else if(g.sourceKind==='reserve'){original=w.reserve;team='blue';}
   else if(g.sourceKind==='enemy'){original=w.enemyArmies.find(e=>e.id===g.sourceId)?.roster;team='red';}
   else if(g.sourceKind==='garrison'){original=w.regions[g.sourceId]?.garrison;team='red';}
   else if(g.sourceKind==='training'&&b.training){original=g.roster;team='red';}
   if(!original||team!==g.team)fail('원래 소속');
   for(const u of g.roster){validateOrigin(u);if(!integer(u.id,g.sourceKind==='training'?-10000:1)||rosterIds.has(u.id)||!Object.hasOwn(CLASSES,u.type)||!integer(u.level,1,99)||!num(u.exp,0)||!num(u.fatigue,0,100)||!(u.hp===null&&g.sourceKind==='training')&&!num(u.hp,1,maxHP(u)))fail('출전 명부');rosterIds.add(u.id);if(!original.some(o=>o.id===u.id&&o.type===u.type&&JSON.stringify(o.origin||null)===JSON.stringify(u.origin||null)&&o.equipmentId===u.equipmentId))fail('원래 소속에 없는 병사');}
   if(new Set(g.unitIds).size!==g.unitIds.length||g.spawned&&JSON.stringify(g.unitIds)!==JSON.stringify(g.roster.map(u=>u.id))||!g.spawned&&g.unitIds.length)fail('출전 ID 불일치');
  }
  for(const u of b.units){
   validateOrigin(u);const g=b.groups.find(g=>g.id===u.groupId),base=g?.roster.find(x=>x.id===u.id);
   if(!base||!g.spawned||runtimeIds.has(u.id)||u.type!==base.type||JSON.stringify(u.origin||null)!==JSON.stringify(base.origin||null)||u.equipmentId!==base.equipmentId||u.team!==g.team||!integer(u.level,base.level,99)||!num(u.exp,0)||u.maxHp!==maxHP(u)||!num(u.hp,0,u.maxHp)||typeof u.alive!=='boolean'||u.alive!==(u.hp>0)||typeof u.evacuated!=='boolean'||!num(u.fatigue,0,100)||!point(u))fail('병사 런타임');runtimeIds.add(u.id);
   if(!u.performance||typeof u.performance!=='object'||Array.isArray(u.performance)||Object.keys(u.performance).sort().join(',')!==PERFORMANCE_KEYS.slice().sort().join(',')||PERFORMANCE_KEYS.some(k=>!num(u.performance[k],0,1e10))||['kills','hits','misses'].some(k=>!integer(u.performance[k])))fail('병사 기여도');
   if(typeof u.individualRetreat!=='boolean')fail('개별 철수 상태');
   if(!integer(u.recoveryTicks,0,Math.min(RECOVERY_TICKS,b.tick))||u.lastHurtTick!==null&&!integer(u.lastHurtTick,0,b.tick)||u.lastHurtTick!==null&&u.recoveryTicks>Math.max(0,b.tick-u.lastHurtTick-RECOVERY_TICKS+1)||(!u.alive||u.evacuated||u.individualRetreat)&&u.recoveryTicks!==0)fail('안전 회복 상태');
   for(const key of ['vx','vy','yaw','phase'])if(!num(u[key]))fail('이동 수치');
   for(const key of ['cool','skillCooldown','hitFlash','pathExpiry','protectedUntil'])if(!integer(u[key]))fail('행동 타이머');
   if(u.deadAt!==null&&!integer(u.deadAt,0,b.tick))fail('전사 시각');
   if(!Array.isArray(u.path)||u.path.length>1002||u.path.some(p=>!point(p))||!integer(u.pathIndex,0,u.path.length)||typeof u.pathKey!=='string'||u.pathKey.length>120)fail('경로 데이터');
   if(u.action){const a=u.action;if(!['attack','heal','gate'].includes(a.kind)||!integer(a.start,0,b.tick)||!integer(a.hit,a.start)||!integer(a.end,a.hit)||a.end>b.tick+10000||typeof a.done!=='boolean'||(a.kind==='gate'?a.targetId!=='gate':!b.units.some(x=>x.id===a.targetId)))fail('공격 준비 상태');}
  }
  for(const g of b.groups)if(g.spawned&&g.unitIds.some(id=>!runtimeIds.has(id)))fail('생성된 병사 누락');
  if(session.selectedGroupId!==null&&!b.groups.some(g=>g.id===session.selectedGroupId&&g.team==='blue'))fail('선택 부대');
  if(session.selectedUnitId!==null&&!b.units.some(u=>u.id===session.selectedUnitId&&u.team==='blue'))fail('선택 병사');
  if(!Array.isArray(b.projectiles)||b.projectiles.length>1000||!Array.isArray(b.particles)||b.particles.length>240||!Array.isArray(b.effects)||b.effects.length>90)fail('시각 효과 목록');
  for(const p of b.projectiles){for(const key of ['x','y','z','sx','sy','dx','dy','travel','total','life','damage'])if(!num(p[key]))fail('투사체 수치');if(!b.units.some(u=>u.id===p.attackerId&&u.team===p.team)||p.damage<0||p.damage>1e5||p.life<=0||p.life>10)fail('투사체 참조');}
  const color=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
  for(const p of b.particles){for(const key of ['x','y','z','vx','vy','vz','life','maxLife'])if(!num(p[key]))fail('파티클 수치');if(!color(p.color))fail('파티클 색');}
  for(const e of b.effects)if(!point(e)||!num(e.life,0,10)||typeof e.text!=='string'||e.text.length>100||!color(e.color))fail('전투 표시');
  if(b.combatLog!==undefined){if(!Array.isArray(b.combatLog)||b.combatLog.length>120)fail('전투 관측 로그');for(const e of b.combatLog)if(!e||!integer(e.tick,0,b.tick)||!['hit','miss','heal'].includes(e.type)||e.record&&!DATA.get(e.record)||e.chance!==undefined&&!num(e.chance,0,1)||e.amount!==undefined&&!num(e.amount,0,1e7))fail('전투 관측 이벤트');}
  if(!b.stats||!num(b.stats.damage,0)||!num(b.stats.healing,0)||!integer(b.stats.kills)||['attempts','hits','misses'].some(k=>b.stats[k]!==undefined&&!integer(b.stats[k])))fail('전투 통계');
  this.validate(b.before);if(JSON.stringify(b.before.profile||null)!==JSON.stringify(w.profile||null))fail('전투 이전 프로필 불일치');return true;
 }
 migrate13(p){
  const old=p.world;if(!old||!Array.isArray(old.regions)||old.regions.length!==6||!Array.isArray(old.reserve))throw Error('이전 저장 구조 오류');
  let armies=old.armies||[{id:0,name:'카리온 주력군',region:old.current,roster:old.roster}];if(!armies.length||armies.length>5)throw Error('이전 군단 구조 오류');
  const clean=u=>{if(!u||!Object.hasOwn(CLASSES,u.type))throw Error('이전 병종 오류');return {id:u.id,type:u.type,level:u.level??1,exp:u.exp??0,hp:u.hp??maxHP({...u,level:u.level??1}),fatigue:u.fatigue??0};};
  armies=armies.map(a=>({id:a.id,name:String(a.name||'군단').slice(0,60),region:a.region,roster:a.roster.map(clean)}));
  const reserve=old.reserve.map(clean);const oldIds=[...armies.flatMap(a=>a.roster),...reserve].map(u=>u.id);if(oldIds.some(id=>!Number.isInteger(id)||id<=0)||new Set(oldIds).size!==oldIds.length)throw Error('이전 저장에 중복/잘못된 병사 ID가 있습니다.');
  if(!Number.isInteger(p.uid)||p.uid<=Math.max(0,...oldIds))throw Error('이전 ID 카운터 오류');this.nextId=p.uid;
  const legacyRoster=n=>Array.from({length:n},(_,i)=>{const type=i%13===12?'healer':i%5===4?'archer':i%7===5?'knight':'infantry';return {id:this.nextId++,type,level:1,exp:0,hp:CLASSES[type].hp,fatigue:0};});
  const regions=REGIONS.map((r,i)=>({...r,owner:old.regions[i].owner,garrison:old.regions[i].owner==='red'?legacyRoster(i===5?30:22):[]}));
  const enemies=(old.enemyArmies||[]).map(e=>{if(!Number.isInteger(e.strength)||e.strength<0||e.strength>40)throw Error('이전 적군 병력 오류');return {id:e.id,name:String(e.name||'적군').slice(0,60),region:e.region,roster:legacyRoster(e.strength)};});
  return {game:'FirstQueen4_Web',schemaVersion:14,nextId:this.nextId,supportIds:old.supportArmyIds||[],world:{regions,armies,reserve,activeArmyId:old.armyActiveId??armies[0].id,turn:old.strategicTurn||0,wins:old.wins||0,gold:300,enemyArmies:enemies,graveyard:[],battleSerial:0,committedBattles:[]}};
 }
 debugWin(){if(!this.battle)return;for(const u of this.battle.units)if(u.team==='red'){u.hp=0;u.alive=false;u.deadAt=this.battle.tick;}this.endBattle('victory');}
 debugLose(){if(!this.battle)return;for(const u of this.battle.units)if(u.team==='blue'){u.hp=0;u.alive=false;u.deadAt=this.battle.tick;}for(const g of this.battle.groups)if(g.team==='blue'&&!g.spawned)g.spawned=true;this.endBattle('defeat');}
}
const API={fatigueEffects,RECOVERY_TICKS,emptyPerformance,PERFORMANCE_KEYS,Game,Navigation,CLASSES,REGIONS,ORDERS,CAMPAIGN_EVENTS,MAP_INFO,STEP,WIDTH,HEIGHT,clamp,dist,maxHP,clone,segmentRect,battlefield,DATA,stats,source,unitLabel,attackPower,hitChance,damageValue};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.FQ=API;
})(typeof globalThis!=='undefined'?globalThis:this);
