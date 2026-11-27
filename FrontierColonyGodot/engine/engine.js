/** Frontier Colony: deterministic, DOM-free colony simulation. Original rules/assets. */
import { SYSTEM_BUILDINGS, initializeSystems, updateSystems, refreshSystems, outsideTemperature, depositStock, withdrawStock, validateSystems } from './colony-systems.js?v=4.0.0';
import { initializeHazards, updateHazards, igniteTile, validateHazards } from './hazards.js?v=4.0.0';
import { SCHEDULE_MODES, SCHEDULE_PRESETS, initializeLife, validateLife, moodFactors, moodTarget } from './colonist-life.js?v=4.0.0';
import { EXTRA_RESOURCE_LABELS, RECIPES, EQUIPMENT, TRADE_PRICES } from './economy-data.js?v=4.0.0';
import { initializeIndustry, validateIndustry, ownedCount, canStartCraft, equipmentStats } from './industry.js?v=4.0.0';
import { initializeTrade, updateTrade, executeTrade, validateTrade } from './trade.js?v=4.0.0';
export { SCHEDULE_MODES, SCHEDULE_PRESETS } from './colonist-life.js?v=4.0.0';
export { EXTRA_RESOURCE_LABELS, RECIPES, EQUIPMENT, TRADE_PRICES } from './economy-data.js?v=4.0.0';
export const RESEARCH = Object.freeze({
  electricity:{label:'전기 공학',points:100,requires:[],description:'태양광과 축전지를 전력선으로 연결해 정착지에 전기를 공급합니다.',unlocks:['solar','battery','conduit','heater']},
  refrigeration:{label:'냉장 보관',points:140,requires:['electricity'],description:'밀폐된 방을 식히는 냉각기를 해금합니다. 저온 창고는 음식의 부패를 늦춥니다.',unlocks:['cooler']},
  communications:{label:'장거리 통신',points:180,requires:['electricity'],description:'전력을 공급받는 구조 신호기를 건설해 구조선을 부릅니다.',unlocks:['beacon']}
});
export const BUILDINGS = Object.freeze({
  wall: {label:'나무 벽',cost:{wood:3},work:3,hp:160},
  door: {label:'문',cost:{wood:5},work:4,hp:120},
  bed: {label:'침대',cost:{wood:10},work:6,hp:80},
  stove: {label:'조리대',cost:{wood:16,steel:8},work:9,hp:120},
  sandbag: {label:'방벽',cost:{wood:6},work:4,hp:180},
  researchbench: {label:'연구대',cost:{wood:18,steel:8},work:8,hp:100},
  horseshoes: {label:'고리 던지기',cost:{wood:12,steel:4},work:6,hp:80},
  workbench: {label:'제작 작업대',cost:{wood:20,steel:8},work:10,hp:120},
  beacon: {label:'구조 신호기',cost:{wood:40,steel:40},work:20,hp:200,tech:'communications'},
  ...SYSTEM_BUILDINGS
});
export const RESOURCE_LABELS = Object.freeze({wood:'목재',steel:'강철',rawfood:'식재료',meals:'식사',medicine:'약품',...EXTRA_RESOURCE_LABELS});
export const JOB_LABELS = Object.freeze({doctor:'치료',rescue:'구조',firefight:'소방',build:'건설',grow:'농사',cook:'조리',haul:'운반',harvest:'채집',mine:'채광',research:'연구',craft:'제작'});
const KEYS=Object.keys(RESOURCE_LABELS), WORK=Object.keys(JOB_LABELS), STEP=.1, DAY=120;
const LEGACY_KEYS=['wood','steel','rawfood','meals','medicine'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const copy=v=>JSON.parse(JSON.stringify(v));
const validInt=n=>Number.isInteger(n)&&Number.isFinite(n);
const DIRS=[[0,-1],[1,0],[0,1],[-1,0]];

export class ColonyGame {
  constructor(options={}) {
    const seed=validInt(options.seed)?options.seed:72831;
    const difficulty=options.difficulty==='relaxed'?'relaxed':'standard';
    this.state={version:4,seed,width:48,height:32,time:0,difficulty,tiles:[],colonists:[],raiders:[],items:[],
      resources:{wood:70,steel:24,rawfood:26,meals:12,medicine:5},effects:[],logs:[],
      stats:{harvested:0,buildingsBuilt:0,mealsCooked:0,raidersDefeated:0,survivedRaids:0},
      weather:'clear',nextRaidAt:difficulty==='relaxed'?340:210,beaconProgress:0,victory:false,gameOver:false,
      autoCook:true,mealTarget:20,rngState:(seed>>>0)||184631,nextId:1,accumulator:0,systemTimer:0,
      weatherTimer:0,raidNumber:0,activeRaid:false,reservations:{},lastAlerts:{},autoRepair:true,extractionAlarmTriggered:false,
      research:{active:'electricity',progress:{electricity:0,refrigeration:0,communications:0},unlocked:[]}};
    this._generateMap();
    this._createColonists();
    initializeSystems(this);
    initializeLife(this);
    initializeHazards(this);
    initializeIndustry(this);
    initializeTrade(this);
    this._log('info','새로운 시작','거처의 동쪽과 남쪽 틈을 문이나 벽으로 막으세요. 실내 침대, 연구, 전력으로 구조 신호를 준비합니다.');
    this._log('info','자율 작업 시작','표시된 나무와 광석을 채집하고, 창고로 나른 뒤 조리합니다. 주민을 선택하면 업무를 조정할 수 있습니다.');
  }
  _rand(){let x=this.state.rngState>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;this.state.rngState=x>>>0;return (x>>>0)/4294967296;}
  _id(prefix){return `${prefix}_${this.state.nextId++}`;}
  tile(x,y){if(!validInt(x)||!validInt(y)||x<0||y<0||x>=this.state.width||y>=this.state.height)return null;return this.state.tiles[y*this.state.width+x]||null;}
  _generateMap(){
    const s=this.state;
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
      const river=8+Math.sin(y*.23)*2.1;
      let terrain=Math.abs(x-river)<1.35?'water':(this._rand()<.09?'soil':'grass');
      if(y>=15&&y<=17&&Math.abs(x-river)<1.65)terrain='stone';
      let feature=null,amount=0;
      if(terrain!=='water'){
        const r=this._rand();
        if(r<.14){feature='tree';amount=10+Math.floor(this._rand()*7);}
        else if(r<.18){feature='berry';amount=8+Math.floor(this._rand()*5);}
        else if(r<.215){feature='ore';amount=14+Math.floor(this._rand()*7);terrain='stone';}
      }
      if(x>=17&&x<=29&&y>=10&&y<=22){feature=null;amount=0;terrain='grass';}
      s.tiles.push({x,y,terrain,feature,amount,zone:null,crop:null,building:null,designation:null});
    }
    for(let y=17;y<=18;y++)for(let x=20;x<=22;x++)this.tile(x,y).zone='stockpile';
    for(let y=18;y<=19;y++)for(let x=29;x<=31;x++){
      const t=this.tile(x,y);t.terrain='soil';t.feature=null;t.amount=0;t.zone='farm';t.crop=x===29?{growth:.5}:null;
    }
    const put=(x,y,type)=>{const t=this.tile(x,y);t.feature=null;t.amount=0;t.building={id:this._id('building'),type,hp:BUILDINGS[type].hp,maxHp:BUILDINGS[type].hp,progress:1,complete:true,paidCost:{},materials:{},refunded:false};};
    for(let x=19;x<=27;x++)put(x,11,x===23?'door':'wall');
    for(let y=12;y<=15;y++)put(19,y,'wall');
    for(let y=12;y<=19;y++)if(!this.tile(19,y).building)put(19,y,'wall');
    for(let y=12;y<=19;y++)if(y!==16)put(27,y,'wall');
    for(let x=20;x<=26;x++)if(x!==23)put(x,19,'wall');
    put(21,13,'bed');put(23,13,'bed');put(25,14,'stove');
    put(24,17,'researchbench');
    [[16,15,'tree',14,'chop'],[16,18,'tree',14,'chop'],[30,14,'ore',18,'mine'],[32,15,'ore',18,'mine'],[26,23,'berry',12,'harvest'],[28,24,'berry',10,'harvest']].forEach(([x,y,feature,amount,designation])=>{const t=this.tile(x,y);t.terrain=feature==='ore'?'stone':'grass';t.feature=feature;t.amount=amount;t.designation=designation;});
  }
  _createColonists(){
    const people=[
      ['서윤','건축가','#edb86c',22.5,15.5,{doctor:4,build:12,grow:4,cook:5,haul:7,harvest:6,mine:10,shoot:9},{doctor:2,build:1,grow:4,cook:3,haul:2,harvest:3,mine:2}],
      ['도현','개척자','#7dc1b3',24.5,16.5,{doctor:5,build:5,grow:12,cook:10,haul:6,harvest:9,mine:4,shoot:8},{doctor:2,build:3,grow:1,cook:1,haul:2,harvest:2,mine:3}],
      ['미나','의무관','#a9ace7',22.5,18.5,{doctor:12,build:4,grow:5,cook:6,haul:10,harvest:10,mine:7,shoot:12},{doctor:1,build:3,grow:3,cook:3,haul:1,harvest:2,mine:2}]
    ];
    for(const [name,role,color,x,y,skills,priorities] of people){skills.research=name==='미나'?10:name==='도현'?7:6;priorities.research=name==='미나'?2:4;this.state.colonists.push({id:this._id('colonist'),name,role,color,x,y,health:100,hunger:76,energy:83,mood:78,bleed:0,dead:false,drafted:false,status:'주변 살피는 중',skills,priorities,job:null,path:[],carry:null,destination:null,thinkAt:0,shotCooldown:0,order:null,blockedTargets:{},breakUntil:0,nextBreakAt:80});}
  }
  _log(kind,title,text){this.state.logs.unshift({id:this._id('log'),time:this.state.time,kind,title,text});if(this.state.logs.length>80)this.state.logs.length=80;}
  _effect(kind,x,y,tx=x,ty=y,color='#f5c875',text=''){this.state.effects.push({kind,x,y,tx,ty,age:0,life:kind==='shot'?.22:.85,color,text});if(this.state.effects.length>100)this.state.effects.splice(0,this.state.effects.length-100);}
  _wake(){for(const c of this.state.colonists)c.thinkAt=0;}
  _walkable(x,y,raider=false){const t=this.tile(x,y);return !!t&&t.terrain!=='water'&&!(t.building?.complete&&(t.building.type==='wall'||(raider&&t.building.type==='door')));}
  _pathTo(actor,tx,ty,adjacent=false,raider=false){
    const s=this.state,startX=Math.floor(actor.x),startY=Math.floor(actor.y),start=startY*s.width+startX;
    if(!this.tile(tx,ty)||!this.tile(startX,startY))return null;
    const baseGoals=[];
    if(adjacent){for(const [dx,dy]of DIRS)if(this._walkable(tx+dx,ty+dy,raider))baseGoals.push((ty+dy)*s.width+tx+dx);}
    else if(this._walkable(tx,ty,raider))baseGoals.push(ty*s.width+tx);
    // Civilians prefer a safe detour. The second pass retains escape/access
    // through fire when no safe route exists; military orders remain explicit.
    for(const avoidFire of !actor.drafted&&!raider?[true,false]:[false]){
      const goals=baseGoals.filter(i=>!avoidFire||!(s.tiles[i].fire>.15));if(goals.includes(start))return [];if(!goals.length)continue;
      const prev=new Int32Array(s.tiles.length);prev.fill(-2);prev[start]=-1;
      const q=new Int32Array(s.tiles.length);let head=0,tail=0;q[tail++]=start;let found=-1;
      while(head<tail){const k=q[head++],x=k%s.width,y=Math.floor(k/s.width);for(const [dx,dy]of DIRS){const nx=x+dx,ny=y+dy;if(!this._walkable(nx,ny,raider))continue;const n=ny*s.width+nx;if(prev[n]!==-2||avoidFire&&s.tiles[n].fire>.15)continue;prev[n]=k;if(goals.includes(n)){found=n;head=tail;break;}q[tail++]=n;}}
      if(found>=0){const path=[];for(let k=found;k!==start;k=prev[k])path.push({x:k%s.width,y:Math.floor(k/s.width)});return path.reverse();}
    }return null;
  }
  _goto(actor,x,y,adjacent=false,raider=false){const path=this._pathTo(actor,x,y,adjacent,raider);if(path===null)return false;actor.path=path;actor.destination={x,y,adjacent,raider};return true;}
  _moveAlong(actor,dt,speed){
    if(!actor.path?.length)return true;
    // A fire may appear after this route was planned. Reconsider once per 1.5 s,
    // outside the movement loop, so an unavoidable-fire fallback cannot spin.
    const next=actor.path[0];
    if(!actor.drafted&&!actor.destination?.raider&&actor.blockedTargets&&this.tile(next.x,next.y)?.fire>.15&&this.state.time>=(actor.blockedTargets['fire-route-check']||0)){
      actor.blockedTargets['fire-route-check']=this.state.time+1.5;
      const d=actor.destination;if(d){const route=this._pathTo(actor,d.x,d.y,d.adjacent,d.raider);if(route!==null)actor.path=route;}
      if(!actor.path.length)return true;
    }
    let travel=speed*dt;
    while(travel>0&&actor.path.length){const p=actor.path[0];if(!this._walkable(p.x,p.y,actor.destination?.raider)){
      const d=actor.destination;if(!d||!this._goto(actor,d.x,d.y,d.adjacent,d.raider)){actor.path=[];return null;}
      if(!actor.path.length)return true;continue;
    }
      const gx=p.x+.5,gy=p.y+.5,d=Math.hypot(gx-actor.x,gy-actor.y);
      if(d<=travel+.000001){actor.x=gx;actor.y=gy;travel-=d;actor.path.shift();}
      else{actor.x+=(gx-actor.x)/d*travel;actor.y+=(gy-actor.y)/d*travel;travel=0;}
    }
    return !actor.path.length;
  }
  _stockpileSpot(actor){
    const spots=this.state.tiles.filter(t=>t.zone==='stockpile'&&this._walkable(t.x,t.y)).sort((a,b)=>Math.hypot(a.x+.5-actor.x,a.y+.5-actor.y)-Math.hypot(b.x+.5-actor.x,b.y+.5-actor.y));
    for(const t of spots.slice(0,18)){const path=this._pathTo(actor,t.x,t.y);if(path!==null)return {x:t.x,y:t.y,path};}return null;
  }
  _reserve(key,owner){const r=this.state.reservations[key];if(r&&r.owner!==owner)return false;this.state.reservations[key]={owner,target:key,quantity:1,expiry:this.state.time+45};return true;}
  _reserved(key,owner){return this.state.reservations[key]&&this.state.reservations[key].owner!==owner;}
  _dropItem(type,count,x,y,freshness=1){
    if(!KEYS.includes(type)||count<=0)return;
    x=clamp(Math.floor(x),0,this.state.width-1);y=clamp(Math.floor(y),0,this.state.height-1);
    const old=this.state.items.find(i=>i.x===x&&i.y===y&&i.type===type&&!i.reservedBy);
    const food=type==='rawfood'||type==='meals';
    if(old){old.count+=count;if(food)old.freshness=Math.min(old.freshness??1,clamp(freshness,0,1));}else this.state.items.push({id:this._id('item'),x,y,type,count,reservedBy:null,...(food?{freshness:clamp(freshness,0,1)}:{})});
  }
  _bedAvailable(t,patient=null,worker=null){
    const b=t?.building;if(!b?.complete||b.type!=='bed'||t.fire>0)return false;
    return !this.state.colonists.some(c=>!c.dead&&c.id!==patient?.id&&(
      c.patientBedId===b.id||c.id!==worker?.id&&(c.job?.type==='rescue'&&c.job.bedId===b.id||c.job?.type==='rest'&&c.job.targetId===b.id)));
  }
  _dropCarriedPawn(c){
    const p=this.state.colonists.find(p=>p.id===c.carryingPawnId);c.carryingPawnId=null;if(!p)return;
    p.carriedBy=null;p.patientBedId=null;p.x=c.x;p.y=c.y;
    const x=Math.floor(c.x),y=Math.floor(c.y);
    if(!this._walkable(x,y)||this.tile(x,y)?.fire>.15){for(const [dx,dy]of DIRS){const t=this.tile(x+dx,y+dy);if(t&&this._walkable(t.x,t.y)&&!(t.fire>.15)){p.x=t.x+.5;p.y=t.y+.5;break;}}}
    if(!p.dead)p.status='구조 중단 · 치료와 침상 필요';
  }
  _syncCarried(c){const p=this.state.colonists.find(p=>p.id===c.carryingPawnId);if(p&&p.carriedBy===c.id){p.x=c.x;p.y=c.y;}}
  _downPawn(c){
    if(c.dead)return;if(c.job||c.order||c.drafted||c.carry||c.carryingPawnId)this._releaseJob(c);
    c.drafted=false;c.order=null;c.path=[];c.destination=null;c.status=c.carriedBy?'구조되어 이동 중':c.patientBedId?'침상 안정 · 간호 필요':'쓰러짐 · 구조와 치료 필요';
  }
  _onBuildingDestroyed(building,tile,reason='destroyed'){
    for(const c of this.state.colonists){
      if(c.job?.targetId===building.id||c.job?.bedId===building.id)this._releaseJob(c);
      if(c.patientBedId===building.id){c.patientBedId=null;if(!c.dead)c.status='침상이 없어 구조를 기다립니다';}
      c.thinkAt=0;
    }
  }
  _releaseJob(c,dropCarry=true){
    if(c.carryingPawnId)this._dropCarriedPawn(c);
    if(c.job?.type==='craft'&&c.job.materials){const staged=c.job.materials;c.job.materials={};for(const [type,count]of Object.entries(staged))this._dropItem(type,count,c.job.tx,c.job.ty);}
    for(const [key,r]of Object.entries(this.state.reservations))if(r.owner===c.id)delete this.state.reservations[key];
    for(const i of this.state.items)if(i.reservedBy===c.id)i.reservedBy=null;
    if(c.carry&&dropCarry&&c.carry.source!=='construction')this._dropItem(c.carry.type,c.carry.count,c.x,c.y,c.carry.freshness??1);
    c.carry=null;c.job=null;c.path=[];c.destination=null;
  }
  _finish(c){this._releaseJob(c);c.thinkAt=this.state.time+.15;c.status='다음 작업 확인';}
  _fail(c,reason,key){if(key)c.blockedTargets[key]=this.state.time+8;this._releaseJob(c);c.status=reason;c.thinkAt=this.state.time+1;}
  _job(c,job,x=job.tx,y=job.ty,adjacent=false){
    const key=job.key;
    if(key&&(this._reserved(key,c.id)||(c.blockedTargets[key]||0)>this.state.time))return false;
    const path=this._pathTo(c,x,y,adjacent);if(path===null){if(key)c.blockedTargets[key]=this.state.time+8;return false;}
    if(key&&!this._reserve(key,c.id))return false;
    c.job={progress:0,total:1,stage:'work',targetId:null,...job};c.path=path;c.destination={x,y,adjacent,raider:false};return true;
  }
  _nearest(c,list){return list.sort((a,b)=>Math.hypot(a.x+.5-c.x,a.y+.5-c.y)-Math.hypot(b.x+.5-c.x,b.y+.5-c.y));}
  _countFood(type='meals'){return (this.state.resources[type]||0)+this.state.items.filter(i=>i.type===type).reduce((n,i)=>n+i.count,0)+this.state.colonists.filter(c=>!c.dead&&c.carry?.type===type&&c.carry.source!=='construction').reduce((n,c)=>n+c.carry.count,0);}
  _tryEat(c){
    for(const type of ['meals','rawfood']){
      if(this.state.resources[type]>0){const spot=this._stockpileSpot(c);if(spot&&this._job(c,{type:'eat',tx:spot.x,ty:spot.y,total:1.5,stage:'fetch',foodType:type,source:'stock'},spot.x,spot.y)){c.status=type==='meals'?'식사하러 이동':'비상 식재료로 허기 달래기';return true;}}
      const items=this._nearest(c,this.state.items.filter(i=>i.type===type&&i.count>0&&!i.reservedBy));
      for(const item of items.slice(0,8))if(this._job(c,{type:'eat',tx:item.x,ty:item.y,targetId:item.id,key:`item:${item.id}`,total:1.5,stage:'fetch',foodType:type,source:'item'})){item.reservedBy=c.id;c.status='가까운 음식을 먹으러 이동';return true;}
    }
    if(c.hunger<27){const berries=this._nearest(c,this.state.tiles.filter(t=>t.feature==='berry'&&t.amount>0));for(const t of berries.slice(0,8))if(this._job(c,{type:'harvest',tx:t.x,ty:t.y,key:`feature:${t.x},${t.y}`,action:'forageeat',total:3},t.x,t.y,true)){c.status='비상 식량 채집';return true;}}
    return false;
  }
  _tryRest(c,allowGround=false){
    const beds=this._nearest(c,this.state.tiles.filter(t=>this._bedAvailable(t,c,c)&&(!t.building.medical||c.health<78)));
    for(const t of beds)if(this._job(c,{type:'rest',tx:t.x,ty:t.y,targetId:t.building.id,key:`bed:${t.building.id}`,total:1,recovering:c.health<38})){c.status='침대로 이동';return true;}
    if(allowGround||c.energy<12||c.health<30){
      const ground=this._nearest(c,this.state.tiles.filter(t=>!(t.fire>0)&&this._walkable(t.x,t.y)&&Math.hypot(t.x+.5-c.x,t.y+.5-c.y)<=3));
      for(const t of ground.slice(0,12))if(this._job(c,{type:'rest',tx:t.x,ty:t.y,total:1,ground:true})){c.status='안전한 바닥에서 휴식';return true;}
    }return false;
  }
  _plan(c,job,x=job.tx,y=job.ty,adjacent=false,status='',forced=false){
    if(job.key&&(this._reserved(job.key,c.id)||!forced&&(c.blockedTargets[job.key]||0)>this.state.time))return null;
    const path=this._pathTo(c,x,y,adjacent);if(path===null){if(job.key&&!forced)c.blockedTargets[job.key]=this.state.time+8;return null;}
    return {job,x,y,adjacent,path,status};
  }
  _carePlan(c,p,kind='doctor',forced=false){
    if(!p||p.dead||p.carriedBy||c.carriedBy||c.carryingPawnId)return null;
    if(this._reserved(`patient:${p.id}`,c.id)||this._pathTo(c,Math.floor(p.x),Math.floor(p.y),p.id!==c.id)===null)return null;
    if(kind==='feed'){
      if(p.id===c.id||p.hunger>=35||!(p.health<15||p.patientBedId))return null;
      const foodType=['meals','rawfood'].find(type=>this.state.resources[type]>0),spot=foodType?this._stockpileSpot(c):null;if(!spot)return null;
      return this._plan(c,{type:'feed',tx:Math.floor(p.x),ty:Math.floor(p.y),targetId:p.id,key:`patient:${p.id}`,total:2.5,stage:'fetch',foodType},spot.x,spot.y,false,`${p.name}의 식사 준비`,forced);
    }
    if(p.health>=100&&p.bleed<=0)return null;
    const spot=this.state.resources.medicine>0?this._stockpileSpot(c):null;
    const job={type:'doctor',tx:Math.floor(p.x),ty:Math.floor(p.y),targetId:p.id,key:`patient:${p.id}`,total:spot?5:8,stage:spot?'fetch':'work',usesMedicine:!!spot};
    return this._plan(c,job,spot?spot.x:job.tx,spot?spot.y:job.ty,!spot&&p.id!==c.id,spot?'치료 약품 준비':`${p.name} 응급 처치`,forced);
  }
  _rescuePlan(c,p,forced=false){
    if(!p||p.id===c.id||p.dead||p.health>=15||p.carriedBy||p.patientBedId||c.carriedBy||c.carryingPawnId||this._reserved(`patient:${p.id}`,c.id))return null;
    const beds=this.state.tiles.filter(t=>this._bedAvailable(t,p,c)).sort((a,b)=>Number(b.building.medical)-Number(a.building.medical)||dist({x:a.x+.5,y:a.y+.5},p)-dist({x:b.x+.5,y:b.y+.5},p));
    for(const bed of beds){if(this._pathTo(p,bed.x,bed.y)===null)continue;
      const job={type:'rescue',tx:Math.floor(p.x),ty:Math.floor(p.y),targetId:p.id,bedId:bed.building.id,key:`patient:${p.id}`,total:1,stage:'pickup'};
      const plan=this._plan(c,job,job.tx,job.ty,true,`${p.name} 구조하러 이동`,forced);if(plan)return plan;
    }return null;
  }
  _firePlan(c){
    const people=this.state.colonists.filter(p=>!p.dead),score=t=>(t.building?80:0)+(t.crop?40:0)+(people.some(p=>Math.hypot(p.x-t.x-.5,p.y-t.y-.5)<4)?60:0)-Math.hypot(c.x-t.x-.5,c.y-t.y-.5);
    const fires=this.state.tiles.filter(t=>t.fire>0).sort((a,b)=>score(b)-score(a));
    for(const t of fires.slice(0,16)){const plan=this._plan(c,{type:'firefight',tx:t.x,ty:t.y,key:`fire:${t.x},${t.y}`,total:1},t.x,t.y,true,'불을 끄러 이동');if(plan)return plan;}return null;
  }
  _emergencyPlan(c){
    const patients=this.state.colonists.filter(p=>!p.dead&&!p.carriedBy).sort((a,b)=>(b.bleed*300+(100-b.health))-(a.bleed*300+(100-a.health)));
    if(c.priorities.doctor>0){for(const p of patients)if(p.health<25&&p.bleed>.1){const plan=this._carePlan(c,p);if(plan)return plan;}
      for(const p of patients)if(p.hunger<20&&(p.health<15||p.patientBedId)){const plan=this._carePlan(c,p,'feed');if(plan)return plan;}}
    if(c.priorities.rescue>0)for(const p of patients){const plan=this._rescuePlan(c,p);if(plan)return plan;}
    if(c.priorities.firefight>0)return this._firePlan(c);return null;
  }
  _startPlan(c,plan,{forced=false,interrupt=false}={}){
    if(!plan)return false;if(interrupt||forced)this._releaseJob(c);if(forced&&plan.job.key)delete c.blockedTargets[plan.job.key];
    if(!this._job(c,{...plan.job,forced},plan.x,plan.y,plan.adjacent))return false;c.status=plan.status;return true;
  }
  _tryRecreate(c){
    const posts=this._nearest(c,this.state.tiles.filter(t=>t.building?.complete&&t.building.type==='horseshoes'&&!(t.fire>0)));
    for(const t of posts)if(this._job(c,{type:'recreate',tx:t.x,ty:t.y,targetId:t.building.id,key:`leisure:${t.building.id}`,total:90},t.x,t.y,true)){c.status='고리 던지기 하러 이동';return true;}
    const candidates=this._nearest(c,this.state.tiles.filter(t=>!t.roofed&&!(t.fire>0)&&this._walkable(t.x,t.y)&&Math.hypot(t.x+.5-c.x,t.y+.5-c.y)<=3));
    for(const t of candidates.slice(0,8))if(this._job(c,{type:'recreate',tx:t.x,ty:t.y,total:90,ground:true})){c.status='산책과 조용한 휴식';return true;}
    if(this._job(c,{type:'recreate',tx:Math.floor(c.x),ty:Math.floor(c.y),total:90,ground:true})){c.status='잠시 쉬며 여가';return true;}return false;
  }
  _scheduleMode(c){return c.schedule[Math.floor((8+this.state.time/DAY*24)%24)];}
  _scheduleRelease(c){
    if(c.job&&!c.job.forced&&!['doctor','feed','rescue','firefight'].includes(c.job.type)&&!(c.job.type==='eat'&&c.hunger<25)&&!(c.job.type==='rest'&&c.energy<12))this._releaseJob(c);
    c.thinkAt=0;
  }
  _tileJobPlan(c,t){
    if(!t)return null;const s=this.state,b=t.building;let job,x=t.x,y=t.y,adjacent=false,status='';
    if(t.fire>0){
      job={type:'firefight',tx:t.x,ty:t.y,key:`fire:${t.x},${t.y}`,total:1};adjacent=true;status='우선 진화';
    }else if(b&&!b.complete){
      const needed=Object.keys(b.paidCost).some(k=>(b.materials[k]||0)<b.paidCost[k]);const spot=needed?this._stockpileSpot(c):null;if(needed&&!spot)return null;
      job={type:'build',tx:t.x,ty:t.y,targetId:b.id,key:`build:${b.id}`,total:BUILDINGS[b.type].work,stage:needed?'fetch':'work'};
      if(spot){x=spot.x;y=spot.y;}else adjacent=true;status=`${BUILDINGS[b.type].label} 우선 건설`;
      if(this._pathTo(c,t.x,t.y,true)===null)return null;
    }else if(b?.complete&&b.hp<b.maxHp-.01){
      const resource=BUILDINGS[b.type].cost.wood?'wood':'steel',spot=this._stockpileSpot(c);if(!spot||s.resources[resource]<1||this._pathTo(c,t.x,t.y,true)===null)return null;
      job={type:'repair',tx:t.x,ty:t.y,targetId:b.id,key:`repair:${b.id}`,total:4,stage:'fetch',resource};x=spot.x;y=spot.y;status=`${BUILDINGS[b.type].label} 수리 자재 준비`;
    }else if(t.zone==='farm'&&!b&&!t.feature&&(!t.crop||t.crop.growth>=1)){
      job={type:'grow',tx:t.x,ty:t.y,key:`crop:${t.x},${t.y}`,total:3,action:t.crop?'reap':'sow'};status=t.crop?'작물 우선 수확':'우선 파종';
    }else if(t.designation&&t.feature&&t.amount>0){
      job={type:t.designation==='mine'?'mine':'harvest',tx:t.x,ty:t.y,key:`feature:${t.x},${t.y}`,action:t.designation,total:t.feature==='ore'?6:t.feature==='tree'?5:3};adjacent=true;status='지정 자원 우선 작업';
    }else return null;
    if(this._reserved(job.key,c.id))return null;const path=this._pathTo(c,x,y,adjacent);if(path===null)return null;
    return {job,x,y,adjacent,path,status};
  }
  _startTilePlan(c,plan,forced=false){
    if(!plan)return false;
    if(forced){this._releaseJob(c);delete c.blockedTargets[plan.job.key];}
    if(!this._job(c,{...plan.job,forced},plan.x,plan.y,plan.adjacent))return false;c.status=plan.status;return true;
  }
  _craftPlan(c){
    const s=this.state,benches=this._nearest(c,s.tiles.filter(t=>t.building?.complete&&t.building.type==='workbench'&&!(t.fire>0)));
    if(!benches.length)return null;const spot=this._stockpileSpot(c);if(!spot)return null;
    for(const [recipeId,recipe]of Object.entries(RECIPES)){
      if(!canStartCraft(s,recipeId))continue;
      for(const t of benches){if(this._pathTo(c,t.x,t.y,true)===null)continue;
        const job={type:'craft',recipeId,tx:t.x,ty:t.y,targetId:t.building.id,key:`craft:${t.building.id}`,stage:'fetch',total:recipe.work,materials:{}};
        const plan=this._plan(c,job,spot.x,spot.y,false,`${recipe.label} 재료 수령`);if(plan)return plan;
      }
    }return null;
  }
  _workMultiplier(c,work){return ['build','repair','grow','harvest','mine','craft'].includes(work)?equipmentStats(c).workSpeed:1;}
  _chooseJob(c){
    const s=this.state,hour=(8+s.time/DAY*24)%24,mode=this._scheduleMode(c);
    if(c.hunger<25&&this._tryEat(c))return;
    if(c.energy<12&&this._tryRest(c,true))return;
    if(this._startPlan(c,this._emergencyPlan(c)))return;
    if(mode!=='work'&&c.hunger<48&&this._tryEat(c))return;
    if((c.health<38||mode!=='work'&&(c.energy<28||mode==='anything'&&(hour>=21||hour<5)&&c.energy<77))&&this._tryRest(c))return;
    if(mode==='sleep'&&c.energy<92&&this._tryRest(c,true))return;
    if(mode==='recreation'&&c.recreation<88&&this._tryRecreate(c))return;
    const order=WORK.filter(k=>c.priorities[k]>0).sort((a,b)=>c.priorities[a]-c.priorities[b]||WORK.indexOf(a)-WORK.indexOf(b));
    for(const work of order){
      if(work==='doctor'){
        const patients=s.colonists.filter(p=>!p.dead&&!p.carriedBy).sort((a,b)=>(b.bleed*200+(100-b.health))-(a.bleed*200+(100-a.health)));
        for(const p of patients)if(p.hunger<35&&(p.health<15||p.patientBedId)&&this._startPlan(c,this._carePlan(c,p,'feed')))return;
        for(const p of patients)if((p.bleed>.015||p.health<78)&&this._startPlan(c,this._carePlan(c,p)))return;
      }else if(work==='rescue'){
        for(const p of s.colonists.filter(p=>!p.dead&&p.health<15))if(this._startPlan(c,this._rescuePlan(c,p)))return;
      }else if(work==='firefight'){
        if(this._startPlan(c,this._firePlan(c)))return;
      }else if(work==='build'){
        const plans=this._nearest(c,s.tiles.filter(t=>t.building&&!t.building.complete));
        for(const t of plans){const b=t.building;if(this._reserved(`build:${b.id}`,c.id))continue;
          const needed=Object.keys(b.paidCost).find(k=>(b.materials[k]||0)<b.paidCost[k]);const spot=needed?this._stockpileSpot(c):null;if(needed&&!spot)continue;
          const job={type:'build',tx:t.x,ty:t.y,targetId:b.id,key:`build:${b.id}`,total:BUILDINGS[b.type].work,stage:needed?'fetch':'work'};
          if(this._job(c,job,spot?spot.x:t.x,spot?spot.y:t.y,!spot)){c.status=needed?'건축 자재 가지러 이동':`${BUILDINGS[b.type].label} 건설`;return;}
        }
        if(s.autoRepair){const damaged=this._nearest(c,s.tiles.filter(t=>t.building?.complete&&t.building.hp<t.building.maxHp-.01&&!(t.fire>0)));for(const t of damaged)if(this._startTilePlan(c,this._tileJobPlan(c,t)))return;}
      }else if(work==='grow'){
        const plots=this._nearest(c,s.tiles.filter(t=>t.zone==='farm'&&!t.building&&!t.feature&&!(t.fire>0)&&(!t.crop||t.crop.growth>=1)));
        for(const t of plots)if(this._job(c,{type:'grow',tx:t.x,ty:t.y,key:`crop:${t.x},${t.y}`,total:3,action:t.crop?'reap':'sow'})){c.status=t.crop?'작물 수확':'씨앗 심기';return;}
      }else if(work==='cook'&&s.autoCook&&s.resources.rawfood>=2&&this._countFood()<s.mealTarget){
        const stoves=this._nearest(c,s.tiles.filter(t=>t.building?.complete&&t.building.type==='stove'&&!(t.fire>0)));
        for(const t of stoves){if(this._reserved(`stove:${t.building.id}`,c.id))continue;const spot=this._stockpileSpot(c);if(spot&&this._job(c,{type:'cook',tx:t.x,ty:t.y,key:`stove:${t.building.id}`,targetId:t.building.id,total:4,stage:'fetch'},spot.x,spot.y)){c.status='조리 재료 준비';return;}}
      }else if(work==='haul'){
        const items=this._nearest(c,s.items.filter(i=>i.count>0&&!i.reservedBy&&!(this.tile(i.x,i.y)?.fire>0)));
        for(const item of items.slice(0,16)){if(!this._stockpileSpot({x:item.x+.5,y:item.y+.5}))continue;if(this._job(c,{type:'haul',tx:item.x,ty:item.y,targetId:item.id,key:`item:${item.id}`,stage:'pickup',total:1})){item.reservedBy=c.id;c.status=`${RESOURCE_LABELS[item.type]} 운반`;return;}}
      }else if(work==='harvest'||work==='mine'){
        const tiles=this._nearest(c,s.tiles.filter(t=>t.designation&&(work==='mine'?t.designation==='mine':t.designation!=='mine')&&t.feature&&t.amount>0&&!(t.fire>0)));
        for(const t of tiles.slice(0,14))if(this._job(c,{type:work,tx:t.x,ty:t.y,key:`feature:${t.x},${t.y}`,action:t.designation,total:t.feature==='ore'?6:t.feature==='tree'?5:3},t.x,t.y,true)){c.status=t.feature==='tree'?'나무 벌목':t.feature==='ore'?'강철 채광':'열매 채집';return;}
      }else if(work==='research'&&s.research.active){
        const rid=s.research.active,def=RESEARCH[rid];if(!def||s.research.unlocked.includes(rid)||!def.requires.every(id=>s.research.unlocked.includes(id)))continue;
        const benches=this._nearest(c,s.tiles.filter(t=>t.building?.complete&&t.building.type==='researchbench'&&!(t.fire>0)));
        for(const t of benches)if(this._job(c,{type:'research',tx:t.x,ty:t.y,targetId:t.building.id,key:`research:${t.building.id}`,researchId:rid,total:def.points},t.x,t.y,true)){c.status=`${def.label} 연구`;return;}
      }else if(work==='craft'){
        if(this._startPlan(c,this._craftPlan(c)))return;
      }
    }
    if(c.hunger<68&&this._tryEat(c))return;
    if(c.energy<55&&this._tryRest(c))return;
    if(c.recreation<40&&this._tryRecreate(c))return;
    c.status='여유 시간 · 대기';c.thinkAt=s.time+1.6;
    // Idle colonists return to separate gathering spots instead of visually stacking in storage.
    const homes=[[22,15],[24,16],[24,18]],home=homes[s.colonists.indexOf(c)%homes.length];
    if(!c.path.length&&this._walkable(home[0],home[1])&&Math.hypot(c.x-home[0]-.5,c.y-home[1]-.5)>.2)this._goto(c,home[0],home[1]);
  }
  _tickJob(c,dt){
    const s=this.state,j=c.job;if(!j)return;
    if(j.key&&s.reservations[j.key])s.reservations[j.key].expiry=s.time+45;
    let t=this.tile(j.tx,j.ty);
    if((j.type==='doctor'||j.type==='feed')&&j.stage==='work'){
      const p=s.colonists.find(p=>p.id===j.targetId&&!p.dead);if(!p){this._fail(c,'치료 대상 없음',j.key);return;}
      if(p.carriedBy){this._fail(c,'환자가 구조되어 이동 중입니다',j.key);return;}
      if(dist(c,p)>1.7&&(!c.path.length||Math.floor(p.x)!==j.tx||Math.floor(p.y)!==j.ty)){j.tx=Math.floor(p.x);j.ty=Math.floor(p.y);if(!this._goto(c,j.tx,j.ty,p.id!==c.id)){this._fail(c,'환자에게 접근할 수 없음',j.key);return;}}
    }
    if(j.type==='rescue'){
      const p=s.colonists.find(p=>p.id===j.targetId&&!p.dead),bed=s.tiles.find(t=>t.building?.id===j.bedId);
      if(!p||!this._bedAvailable(bed,p,c)||j.stage==='pickup'&&(p.health>=15||p.carriedBy)){this._fail(c,'환자 또는 구조 침상 상태가 변경됨',j.key);return;}
      if(j.stage==='deliver'&&(c.carryingPawnId!==p.id||p.carriedBy!==c.id)){this._fail(c,'환자 운반 상태를 다시 확인합니다',j.key);return;}
      if(j.stage==='pickup'&&(Math.floor(p.x)!==j.tx||Math.floor(p.y)!==j.ty)){j.tx=Math.floor(p.x);j.ty=Math.floor(p.y);if(!this._goto(c,j.tx,j.ty,true)){this._fail(c,'환자에게 접근할 수 없음',j.key);return;}}
    }
    const speed=(c.carryingPawnId?1.5:2.45+c.skills.haul*.025)*clamp(c.health/100,.48,1)*(c.energy<15?.7:1);
    if(c.path.length){const moved=this._moveAlong(c,dt,speed);if(moved===null){this._fail(c,'이동 경로를 찾을 수 없음',j.key);return;}if(!moved)return;}
    const depotPhase=j.stage==='fetch'&&(['build','repair','cook','doctor','feed','craft','equip'].includes(j.type)||j.type==='eat'&&j.source==='stock')||j.type==='haul'&&j.stage==='deliver';
    if(depotPhase&&(!c.destination||this.tile(c.destination.x,c.destination.y)?.zone!=='stockpile')){this._fail(c,'창고 구역이 변경됨',j.key);return;}
    if(j.type==='rest'){
      if(t?.fire>0){this._fail(c,'휴식 장소에 불이 나 대피합니다',j.key);return;}
      if(!j.ground&&(!t?.building?.complete||t.building.id!==j.targetId)){this._fail(c,'침대가 없어 휴식을 다시 계획합니다',j.key);return;}
      c.status=j.ground?'바닥에서 수면':'침대에서 수면';const comfort=clamp(1-(c.thermalStress||0)*.006,.4,1)*(c.sheltered?1:.85);c.energy=clamp(c.energy+dt*(j.ground?1.7:3.3)*comfort,0,100);
      if(c.bleed<=0&&c.hunger>25)c.health=clamp(c.health+dt*.25,0,100);
      if(c.energy>=98||(c.hunger<20&&c.energy>15)||(j.recovering&&c.health>=55&&c.energy>=83)){this._finish(c);}return;
    }
    if(j.type==='rescue'){
      const p=s.colonists.find(p=>p.id===j.targetId&&!p.dead),bed=s.tiles.find(t=>t.building?.id===j.bedId);if(!p||!bed){this._fail(c,'구조 대상이 변경됨',j.key);return;}
      if(j.stage==='pickup'){
        if(dist(c,p)>1.8){if(!this._goto(c,Math.floor(p.x),Math.floor(p.y),true))this._fail(c,'환자에게 접근할 수 없음',j.key);return;}
        this._downPawn(p);this._releaseJob(p);p.carriedBy=c.id;p.patientBedId=bed.building.id;c.carryingPawnId=p.id;this._syncCarried(c);
        j.stage='deliver';j.tx=bed.x;j.ty=bed.y;c.status=`${p.name}을(를) 침상으로 운반`;p.status=`${c.name}에게 구조되어 이동 중`;
        if(!this._goto(c,bed.x,bed.y))this._fail(c,'침상으로 이동할 수 없음',j.key);return;
      }
      c.carryingPawnId=null;p.carriedBy=null;p.x=bed.x+.5;p.y=bed.y+.5;p.patientBedId=bed.building.id;p.status='침상 안정 · 간호 필요';
      s.careStats.rescued++;this._effect('heal',p.x,p.y,p.x,p.y,'#92d8c3','구조 완료');this._log('success','침상으로 구조',`${c.name}이(가) ${p.name}을(를) 침상으로 옮겼습니다. 치료와 급식 담당이 회복을 돕습니다.`);this._finish(c);return;
    }
    if(j.type==='feed'){
      const p=s.colonists.find(p=>p.id===j.targetId&&!p.dead&&!p.carriedBy);if(!p){this._fail(c,'급식 대상이 변경됨',j.key);return;}
      if(j.stage==='fetch'){const taken=withdrawStock(this,j.foodType,1);if(!taken.ok){this._fail(c,'환자에게 줄 음식이 부족함',j.key);return;}c.carry={type:j.foodType,count:1,freshness:taken.freshness};j.stage='work';j.tx=Math.floor(p.x);j.ty=Math.floor(p.y);if(!this._goto(c,j.tx,j.ty,true))this._fail(c,'환자에게 접근할 수 없음',j.key);return;}
      if(c.carry?.type!==j.foodType||c.carry.count!==1){this._fail(c,'급식 음식을 다시 준비합니다',j.key);return;}
      if(dist(c,p)>1.8)return;c.status=`${p.name} 식사 돕기`;j.progress+=dt;
      if(j.progress>=j.total){p.hunger=clamp(p.hunger+(j.foodType==='meals'?64:30),0,100);c.carry=null;s.careStats.fed++;this._effect('heal',p.x,p.y,p.x,p.y,'#e5ca83','급식');this._finish(c);p.thinkAt=0;}return;
    }
    if(j.type==='firefight'){
      if(!t||!(t.fire>0)){this._finish(c);return;}
      c.status='불 끄는 중';const amount=dt*(.25+c.skills.firefight*.025);t.fire=Math.max(0,t.fire-amount);j.progress=clamp(j.progress+amount,0,1);
      if(t.fire<=.001){t.fire=0;t.burned=true;s.hazards.extinguished++;this._effect('build',t.x+.5,t.y+.5,t.x+.5,t.y+.5,'#8bcbd1','진화');this._finish(c);this._wake();}return;
    }
    if(j.type==='recreate'){
      if(t?.fire>0||!j.ground&&(!t?.building?.complete||t.building.type!=='horseshoes'||t.building.id!==j.targetId)){this._fail(c,'여가 장소를 다시 찾습니다',j.key);return;}
      const comfort=clamp(1-(c.thermalStress||0)*.005,.5,1);c.status=j.ground?'산책과 조용한 휴식':'고리 던지기';c.recreation=clamp(c.recreation+dt*(j.ground?.8:3)*comfort,0,100);c.energy=clamp(c.energy+dt*.25*comfort,0,100);j.progress=c.recreation;
      if(c.recreation>=90)this._finish(c);return;
    }
    if(j.type==='haul'){
      if(j.stage==='pickup'){
        const item=s.items.find(i=>i.id===j.targetId&&i.reservedBy===c.id);if(!item||item.count<=0){this._fail(c,'운반할 물품 없음',j.key);return;}
        const count=Math.min(item.type==='silver'?100:12,item.count);item.count-=count;c.carry={type:item.type,count,...(['rawfood','meals'].includes(item.type)?{freshness:item.freshness??1}:{})};item.reservedBy=null;if(item.count===0)s.items=s.items.filter(i=>i!==item);
        const spot=this._stockpileSpot(c);if(!spot){this._fail(c,'접근 가능한 창고 없음',j.key);return;}
        j.stage='deliver';this._goto(c,spot.x,spot.y);return;
      }
      if(c.carry){depositStock(this,c.carry.type,c.carry.count,Math.floor(c.x),Math.floor(c.y),c.carry.freshness??1);c.carry=null;}this._finish(c);return;
    }
    if(j.type==='eat'){
      if(j.stage==='fetch'){
        let freshness=1;
        if(j.source==='stock'){const taken=withdrawStock(this,j.foodType,1);if(!taken.ok){this._fail(c,'음식이 먼저 소비됨');return;}freshness=taken.freshness;}
        else{const i=s.items.find(i=>i.id===j.targetId&&i.reservedBy===c.id);if(!i||i.count<1){this._fail(c,'음식을 찾을 수 없음',j.key);return;}freshness=i.freshness??1;i.count--;i.reservedBy=null;if(i.count===0)s.items=s.items.filter(x=>x!==i);}
        c.carry={type:j.foodType,count:1,freshness};j.stage='eat';
      }
      if(!c.carry||c.carry.type!==j.foodType||c.carry.count<1){this._fail(c,'음식이 상해 다시 식사를 찾습니다',j.key);return;}
      c.status=j.foodType==='meals'?'따뜻한 식사':'식재료로 허기 달래기';j.progress+=dt;
      if(j.progress>=j.total){c.hunger=clamp(c.hunger+(j.foodType==='meals'?64:30),0,100);c.mood=clamp(c.mood+(j.foodType==='meals'?5:-2),0,100);c.carry=null;this._finish(c);}return;
    }
    if(j.type==='equip'){
      if(!Object.hasOwn(EQUIPMENT,j.item)||c.equipment[j.slot]!==null){this._fail(c,'장비 슬롯 상태가 변경됨',j.key);return;}
      if(j.stage==='fetch'){if(!withdrawStock(this,j.item,1).ok){this._fail(c,'다른 주민이 장비를 먼저 수령했습니다',j.key);return;}c.carry={type:j.item,count:1};j.stage='work';}
      if(c.carry?.type!==j.item||c.carry.count!==1){this._fail(c,'장착할 장비가 없습니다',j.key);return;}
      c.status=`${EQUIPMENT[j.item].label} 장착`;j.progress+=dt;
      if(j.progress>=j.total){c.equipment[j.slot]=j.item;c.carry=null;this._effect('build',c.x,c.y,c.x,c.y,'#d3bd83','장착');this._finish(c);}return;
    }
    if(j.type==='craft'){
      const recipe=RECIPES[j.recipeId],bill=s.industry.bills[j.recipeId];
      if(!recipe||!bill||bill.paused||bill.target<=0||!t?.building?.complete||t.building.type!=='workbench'||t.building.id!==j.targetId||t.fire>0){this._fail(c,'제작 주문이나 작업대 상태가 변경됨',j.key);return;}
      if(bill.mode==='maintain'&&ownedCount(s,recipe.output,{includeCraft:true})>bill.target){this._fail(c,'목표 보유량이 이미 확보되었습니다',j.key);return;}
      if(j.stage==='fetch'){
        const type=Object.keys(recipe.cost).find(k=>(j.materials[k]||0)<recipe.cost[k]);
        if(!type){j.stage='work';if(!this._goto(c,j.tx,j.ty,true))this._fail(c,'작업대에 접근할 수 없음',j.key);return;}
        const count=Math.min(12,recipe.cost[type]-(j.materials[type]||0));
        if(!withdrawStock(this,type,count).ok){this._fail(c,'제작 자재가 부족해 주문을 다시 준비합니다',j.key);return;}
        c.carry={type,count,source:'craft',benchId:j.targetId,recipeId:j.recipeId};j.stage='deliver';
        if(!this._goto(c,j.tx,j.ty,true))this._fail(c,'작업대에 접근할 수 없음',j.key);return;
      }
      if(j.stage==='deliver'){
        if(c.carry?.source!=='craft'||c.carry.benchId!==j.targetId||c.carry.recipeId!==j.recipeId){this._fail(c,'운반 중인 제작 자재를 확인합니다',j.key);return;}
        j.materials[c.carry.type]=(j.materials[c.carry.type]||0)+c.carry.count;c.carry=null;
        if(Object.keys(recipe.cost).some(k=>(j.materials[k]||0)<recipe.cost[k])){
          const spot=this._stockpileSpot(c);if(!spot){this._fail(c,'제작 자재 창고에 접근할 수 없음',j.key);return;}j.stage='fetch';this._goto(c,spot.x,spot.y);return;
        }j.stage='work';
      }
      c.status=`${recipe.label} 제작`;j.progress+=dt*(.65+c.skills.craft*.075)*this._workMultiplier(c,'craft');
      if(j.progress>=j.total){j.materials={};this._dropItem(recipe.output,recipe.count,t.x,t.y);s.industry.crafted[j.recipeId]++;if(bill.mode==='count')bill.target=Math.max(0,bill.target-1);this._effect('harvest',t.x+.5,t.y+.5,t.x+.5,t.y+.5,'#d3bd83',`${recipe.label} +${recipe.count}`);this._finish(c);this._wake();}return;
    }
    if(j.type==='build'){
      if(!t?.building||t.building.id!==j.targetId||t.building.complete){this._fail(c,'건축 계획 변경됨',j.key);return;}
      const b=t.building;
      if(j.stage==='fetch'){
        const type=Object.keys(b.paidCost).find(k=>(b.materials[k]||0)<b.paidCost[k]);
        if(type)c.carry={type,count:Math.min(12,b.paidCost[type]-(b.materials[type]||0)),source:'construction',blueprintId:b.id};
        j.stage='deliver';if(!this._goto(c,j.tx,j.ty,true)){this._fail(c,'건축 위치에 접근 불가',j.key);}return;
      }
      if(j.stage==='deliver'){
        if(c.carry?.blueprintId===b.id){b.materials[c.carry.type]=(b.materials[c.carry.type]||0)+c.carry.count;c.carry=null;}
        const more=Object.keys(b.paidCost).some(k=>(b.materials[k]||0)<b.paidCost[k]);
        if(more){const spot=this._stockpileSpot(c);if(!spot){this._fail(c,'자재 공급 창고에 접근 불가',j.key);return;}j.stage='fetch';this._goto(c,spot.x,spot.y);return;}
        j.stage='work';
      }
      c.status=`${BUILDINGS[b.type].label} 건설`;j.progress=(b.progress||0)*j.total+dt*(.65+c.skills.build*.075)*this._workMultiplier(c,'build');b.progress=clamp(j.progress/j.total,0,1);
      if(b.progress>=1&&b.type==='wall'&&s.colonists.some(p=>!p.dead&&Math.floor(p.x)===t.x&&Math.floor(p.y)===t.y)){c.status='통로가 비기를 기다리는 중';return;}
      if(b.progress>=1){b.complete=true;b.hp=b.maxHp;s.stats.buildingsBuilt++;refreshSystems(this);this._effect('build',t.x+.5,t.y+.5);this._log('success',`${BUILDINGS[b.type].label} 완공`,`${c.name}이(가) 건설을 마쳤습니다.`);this._finish(c);this._wake();}return;
    }
    if(j.type==='repair'){
      if(!t?.building?.complete||t.building.id!==j.targetId){this._fail(c,'수리 대상이 변경됨',j.key);return;}const b=t.building;
      if(b.hp>=b.maxHp-.001){this._finish(c);return;}
      if(j.stage==='fetch'){if(!withdrawStock(this,j.resource,1).ok){this._fail(c,'수리 자재 부족',j.key);return;}c.carry={type:j.resource,count:1};j.stage='work';if(!this._goto(c,j.tx,j.ty,true))this._fail(c,'수리 대상에 접근 불가',j.key);return;}
      if(!c.carry||c.carry.type!==j.resource||c.carry.count!==1){this._fail(c,'수리 자재를 다시 준비합니다',j.key);return;}
      c.status=`${BUILDINGS[b.type].label} 수리`;j.progress+=dt*(.65+c.skills.build*.075)*this._workMultiplier(c,'repair');
      if(j.progress>=j.total){b.hp=Math.min(b.maxHp,b.hp+40);c.carry=null;this._effect('build',t.x+.5,t.y+.5,t.x+.5,t.y+.5,'#89d5af','수리 +40');this._finish(c);refreshSystems(this);}return;
    }
    if(j.type==='research'){
      const def=RESEARCH[j.researchId];if(!def||s.research.active!==j.researchId||s.research.unlocked.includes(j.researchId)||!t?.building?.complete||t.building.type!=='researchbench'||t.building.id!==j.targetId||t.fire>0){this._fail(c,'연구 계획이나 연구대 상태가 변경됨',j.key);return;}
      c.status=`${def.label} 연구`;s.research.progress[j.researchId]=Math.min(def.points,s.research.progress[j.researchId]+dt*(.8+c.skills.research*.08));j.progress=s.research.progress[j.researchId];
      if(j.progress>=def.points){s.research.unlocked.push(j.researchId);s.research.active=null;this._log('success',`${def.label} 연구 완료`,`${def.unlocks.map(id=>BUILDINGS[id].label).join(' · ')} 건설이 가능해졌습니다. 다음 연구를 선택하세요.`);for(const worker of s.colonists)if(worker.job?.type==='research')this._finish(worker);this._wake();}return;
    }
    if(j.type==='cook'){
      if(!t?.building?.complete||t.building.id!==j.targetId||!s.autoCook||t.fire>0){this._fail(c,'조리 작업 중단',j.key);return;}
      if(j.stage==='fetch'){const taken=withdrawStock(this,'rawfood',2);if(!taken.ok){this._fail(c,'식재료가 부족함',j.key);return;}c.carry={type:'rawfood',count:2,freshness:taken.freshness};j.stage='work';if(!this._goto(c,j.tx,j.ty,true))this._fail(c,'조리대에 접근 불가',j.key);return;}
      if(c.carry?.type!=='rawfood'||c.carry.count!==2){this._fail(c,'조리 재료가 상했습니다',j.key);return;}
      c.status='식사 조리';j.progress+=dt*(.65+c.skills.cook*.065);
      if(j.progress>=j.total){const freshness=c.carry.freshness??1;c.carry=null;this._dropItem('meals',1,t.x,t.y,freshness);s.stats.mealsCooked++;this._effect('harvest',t.x+.5,t.y+.5,t.x+.5,t.y+.5,'#f1b669','식사 +1');this._finish(c);}return;
    }
    if(j.type==='doctor'){
      const p=s.colonists.find(p=>p.id===j.targetId&&!p.dead);if(!p){this._fail(c,'치료 대상 없음',j.key);return;}
      if(j.stage==='fetch'){
        if(withdrawStock(this,'medicine',1).ok){c.carry={type:'medicine',count:1};}else{j.usesMedicine=false;j.total=8;}
        j.stage='work';j.tx=Math.floor(p.x);j.ty=Math.floor(p.y);if(!this._goto(c,j.tx,j.ty,p.id!==c.id))this._fail(c,'환자에게 접근 불가',j.key);return;
      }
      if(dist(c,p)>1.8)return;c.status=`${p.name} ${j.usesMedicine?'치료':'응급 처치'}`;j.progress+=dt*(.65+c.skills.doctor*.07);
      if(j.progress>=j.total){const used=!!c.carry;p.health=clamp(p.health+(used?38:19),0,100);p.bleed=0;c.carry=null;s.careStats.tended++;this._effect('heal',p.x,p.y,p.x,p.y,'#89d5af');this._log('success','치료 완료',`${c.name} → ${p.name}: ${used?'약품을 사용해':'응급 처치로'} 출혈을 멈추고 회복했습니다.`);this._finish(c);p.thinkAt=0;}return;
    }
    if(j.type==='grow'){
      if(!t||t.zone!=='farm'||t.building||t.feature||(j.action==='reap'&&(!t.crop||t.crop.growth<1))){this._fail(c,'경작지가 변경됨',j.key);return;}
      j.progress+=dt*(.65+c.skills.grow*.065)*this._workMultiplier(c,'grow');c.status=j.action==='reap'?'작물 수확':'씨앗 심기';
      if(j.progress>=j.total){if(j.action==='sow')t.crop={growth:0};else{t.crop=null;this._dropItem('rawfood',5,t.x,t.y);s.stats.harvested+=5;this._effect('harvest',t.x+.5,t.y+.5,t.x+.5,t.y+.5,'#a5ce79','식재료 +5');}this._finish(c);}return;
    }
    if(j.type==='harvest'||j.type==='mine'){
      if(!t?.feature||t.amount<=0||(j.action!=='forageeat'&&!t.designation)){this._fail(c,'작업 대상이 변경됨',j.key);return;}
      j.progress+=dt*(.65+c.skills[j.type]*.065)*this._workMultiplier(c,j.type);
      if(j.progress>=j.total){const type=t.feature==='tree'?'wood':t.feature==='ore'?'steel':'rawfood';let n=t.amount;t.amount=0;t.feature=null;t.designation=null;
        if(j.action==='forageeat'){n=Math.max(0,n-1);c.hunger=clamp(c.hunger+30,0,100);}
        this._dropItem(type,n,t.x,t.y);s.stats.harvested+=n;this._effect('harvest',t.x+.5,t.y+.5,t.x+.5,t.y+.5,'#dcbd85',`${RESOURCE_LABELS[type]} +${n}`);this._finish(c);
      }return;
    }
    this._fail(c,'작업 상태를 다시 계획합니다');
  }
  _los(a,b){const steps=Math.ceil(dist(a,b)*3);for(let i=1;i<steps;i++){const f=i/steps,t=this.tile(Math.floor(a.x+(b.x-a.x)*f),Math.floor(a.y+(b.y-a.y)*f));if(!t||t.building?.complete&&t.building.type==='wall')return false;}return true;}
  _cover(actor,attacker=null){
    for(const [dx,dy]of DIRS){const t=this.tile(Math.floor(actor.x)+dx,Math.floor(actor.y)+dy),b=t?.building;if(!b?.complete||!['sandbag','wall'].includes(b.type))continue;
      if(!attacker)return .24;const ax=attacker.x-actor.x,ay=attacker.y-actor.y,bx=t.x+.5-actor.x,by=t.y+.5-actor.y,n=Math.hypot(ax,ay)*Math.hypot(bx,by);
      if(n>0&&(ax*bx+ay*by)/n>=.55)return .24;
    }return 0;
  }
  _hitPawn(c,amount){if(c.dead)return;const protection=equipmentStats(c).damageTaken;c.health=clamp(c.health-amount*protection,0,100);c.bleed=Math.min(.3,c.bleed+.025*protection);this._effect('hit',c.x,c.y,c.x,c.y,'#ef7b75');if(c.health<=0)this._killPawn(c);else if(c.health<15)this._downPawn(c);}
  _killPawn(c){
    if(c.dead)return;c.dead=true;c.health=0;c.drafted=false;c.order=null;
    if(c.carriedBy){const carrier=this.state.colonists.find(p=>p.id===c.carriedBy);if(carrier)this._releaseJob(carrier);c.carriedBy=null;}
    this._releaseJob(c);c.patientBedId=null;
    for(const [slot,item]of Object.entries(c.equipment||{}))if(item){c.equipment[slot]=null;this._dropItem(item,1,c.x,c.y);}
    for(const worker of this.state.colonists)if(worker.job?.targetId===c.id&&['doctor','feed','rescue'].includes(worker.job.type))this._releaseJob(worker);
    this._log('danger',`${c.name} 사망`,'정착지가 소중한 동료를 잃었습니다.');for(const other of this.state.colonists)if(!other.dead)other.mood=clamp(other.mood-14,0,100);
  }
  _shootColonist(c,r,automatic=false){if(c.shotCooldown>0||r.dead)return;const weapon=equipmentStats(c);c.shotCooldown=automatic?1.7:weapon.cooldown;c.status='사격';this._effect('shot',c.x,c.y,r.x,r.y,'#f1cf85');if(this._rand()<(automatic?.64:.76)+c.skills.shoot*.012+weapon.accuracy-this._cover(r,c)){r.health-=(15+c.skills.shoot*.6+this._rand()*5)*weapon.damage*(automatic?.6:1);this._effect('hit',r.x,r.y,r.x,r.y,'#ea8e73');if(r.health<=0){r.health=0;r.dead=true;r.status='제압됨';this.state.stats.raidersDefeated++;const loot=this._rand()<.5?'steel':'medicine';this._dropItem(loot,loot==='steel'?5:1,r.x,r.y);}}}
  _tickDraft(c,dt){
    const enemies=this.state.raiders.filter(r=>!r.dead),range=equipmentStats(c).range,orderedTarget=c.order?.type==='attack'?enemies.find(r=>r.id===c.order.targetId):null;let target=orderedTarget;
    if(c.order?.type==='move'&&c.path.length){this._moveAlong(c,dt,2.8*clamp(c.health/100,.5,1));c.status='전투 위치로 이동';}
    // A nearby target behind a wall still needs an approach. Failed routes wait
    // for the same retry interval as moving targets instead of running BFS every tick.
    if(target&&(dist(c,target)>range-.5||!this._los(c,target))&&this.state.time>=(c.nextCombatPath??0)){
      c.nextCombatPath=this.state.time+1.3;
      if(!this._goto(c,Math.floor(target.x),Math.floor(target.y),true)){c.path=[];c.destination=null;}
    }
    if(target&&c.path.length&&(dist(c,target)>range-.7||!this._los(c,target))){this._moveAlong(c,dt,2.7);c.status='시야를 확보하며 적에게 접근';}
    if(!target||dist(c,target)>range||!this._los(c,target))target=enemies.filter(r=>dist(c,r)<=range&&this._los(c,r)).sort((a,b)=>dist(c,a)-dist(c,b))[0];
    if(target&&dist(c,target)<=range&&this._los(c,target)){if(c.order?.type==='attack')c.path=[];this._shootColonist(c,target);}
    else if(!c.path.length)c.status=orderedTarget&&(dist(c,orderedTarget)>range-.5||!this._los(c,orderedTarget))?'적에게 접근할 수 없음 · 경로 재탐색 대기':c.order?.type==='hold'?'거점 유지 · 경계 중':'징집 · 경계 중';
  }
  _tickColonist(c,dt){
    if(c.dead)return;c.shotCooldown=Math.max(0,c.shotCooldown-dt);
    c.hunger=clamp(c.hunger-dt*(this.state.difficulty==='relaxed'?.22:.28),0,100);
    c.recreation=clamp(c.recreation-dt*.12,0,100);
    if(c.job?.type!=='rest'&&!c.patientBedId)c.energy=clamp(c.energy-dt*(c.drafted?.23:.145),0,100);
    if(c.bleed>0)c.health=clamp(c.health-c.bleed*dt,0,100);
    if(c.hunger<=0)c.health=clamp(c.health-dt*.2,0,100);
    if((c.thermalStress||0)>70)c.health=clamp(c.health-dt*(c.thermalStress-70)*.006,0,100);
    if(c.health<=0){this._killPawn(c);return;}
    if(c.health<15)this._downPawn(c);
    const targetMood=moodTarget(c);
    c.mood=clamp(c.mood+clamp(targetMood-c.mood,-dt*1.8,dt*.65),0,100);
    if(c.health>=15&&c.hunger>50&&c.energy>50&&c.bleed===0)c.health=clamp(c.health+dt*.025,0,100);
    const hour=Math.floor((8+this.state.time/DAY*24)%24);if(c.lastScheduleHour!==hour){const old=c.lastScheduleHour;c.lastScheduleHour=hour;if(old>=0&&c.schedule[old]!==c.schedule[hour])this._scheduleRelease(c);}
    if(c.carriedBy){c.status='구조되어 침상으로 이동 중';return;}
    if(c.patientBedId){const bed=this.state.tiles.find(t=>t.building?.id===c.patientBedId&&t.building.complete&&t.building.type==='bed');
      if(!bed||bed.fire>0||Math.hypot(c.x-bed.x-.5,c.y-bed.y-.5)>.8||c.health>=25){c.patientBedId=null;c.thinkAt=0;}
      else{c.energy=clamp(c.energy+dt*2.2,0,100);if(c.bleed<=0&&c.hunger>0)c.health=clamp(c.health+dt*.55,0,100);c.status='침상 안정 · 간호와 회복';return;}}
    if(c.health<15)return;
    if(c.drafted){this._tickDraft(c,dt);return;}
    const closeEnemy=this.state.raiders.filter(r=>!r.dead&&dist(c,r)<5.8&&this._los(c,r)).sort((a,b)=>dist(c,a)-dist(c,b))[0];
    if(closeEnemy){if(c.job)this._releaseJob(c);c.status='긴급 방어 · 징집으로 지휘 가능';this._shootColonist(c,closeEnemy,true);return;}
    if(c.breakUntil>this.state.time){c.status='잠시 마음을 가다듬는 중';c.energy=clamp(c.energy+dt*.35,0,100);return;}
    if(c.mood<19&&this.state.time>c.nextBreakAt){this._releaseJob(c);c.breakUntil=this.state.time+5;c.nextBreakAt=this.state.time+45;this._log('warning',`${c.name} 지침`,'허기와 휴식을 살펴주세요. 잠시 쉬고 다시 작업합니다.');return;}
    if(c.job&&c.job.type!=='eat'&&((c.hunger<14&&c.job.type!=='harvest')||c.energy<4&&c.job.type!=='rest')){this._releaseJob(c);c.thinkAt=0;}
    if(c.job&&!c.job.forced&&!['doctor','feed','rescue','firefight'].includes(c.job.type)&&c.hunger>=25&&c.energy>=12&&this.state.time>=c.emergencyCheckAt){c.emergencyCheckAt=this.state.time+1.5;const emergency=this._emergencyPlan(c);if(emergency)this._startPlan(c,emergency,{interrupt:true});}
    if(c.job){this._tickJob(c,dt);return;}
    if(c.path.length)this._moveAlong(c,dt,1.65);
    if(this.state.time>=c.thinkAt)this._chooseJob(c);
  }
  _spawnRaid(){
    if(this.state.activeRaid)return false;const s=this.state;s.raidNumber++;const count=s.difficulty==='relaxed'?Math.min(3,1+s.raidNumber):Math.min(4,1+s.raidNumber);
    for(let n=0;n<count;n++){let x=46,y=12+n*5;while(!this._walkable(x,y,true)&&x>35)x--;s.raiders.push({id:this._id('raider'),x:x+.5,y:y+.5,health:65+(s.raidNumber-1)*8,maxHp:65+(s.raidNumber-1)*8,dead:false,status:'정착지로 접근',path:[],destination:null,shotCooldown:1+n*.3,thinkAt:0,targetId:null});}
    s.activeRaid=true;s.nextRaidAt=s.time+(s.difficulty==='relaxed'?370:270);this._log('danger','습격 경보',`${count}명의 약탈자가 동쪽에서 접근합니다. 주민을 징집하고 방벽 가까이 모으세요.`);return true;
  }
  _tickRaider(r,dt){
    if(r.dead)return;r.shotCooldown=Math.max(0,r.shotCooldown-dt);
    const living=this.state.colonists.filter(c=>!c.dead),standing=living.filter(c=>c.health>=15);const targets=standing.length?standing:living;
    if(!targets.length)return;const p=targets.slice().sort((a,b)=>dist(r,a)-dist(r,b))[0];
    if(dist(r,p)<=5.1&&this._los(r,p)){
      r.path=[];r.status='사격';if(r.shotCooldown<=0){r.shotCooldown=2.25;this._effect('shot',r.x,r.y,p.x,p.y,'#ee8274');if(this._rand()<.65-this._cover(p,r))this._hitPawn(p,7+this._rand()*5);}return;
    }
    if(this.state.time>=r.thinkAt){r.thinkAt=this.state.time+1.1;r.targetId=p.id;if(!this._goto(r,Math.floor(p.x),Math.floor(p.y),true,true)){
      const walls=this._nearest(r,this.state.tiles.filter(t=>t.building?.complete&&(t.building.type==='wall'||t.building.type==='door')));
      r.bashTarget=null;for(const t of walls.slice(0,20))if(this._goto(r,t.x,t.y,true,true)){r.bashTarget={x:t.x,y:t.y,id:t.building.id};break;}
    }else r.bashTarget=null;}
    if(r.path.length)this._moveAlong(r,dt,1.65);
    if(r.bashTarget&&!r.path.length){const tile=this.tile(r.bashTarget.x,r.bashTarget.y),b=tile?.building;if(b&&b.id===r.bashTarget.id){r.status='벽을 부수는 중';b.hp-=dt*16;if(b.hp<=0){this._onBuildingDestroyed(b,tile,'raid');tile.building=null;r.bashTarget=null;r.thinkAt=0;refreshSystems(this);this._wake();}}}
    else r.status='정착지로 접근';
  }
  _periodic(dt){
    const s=this.state,hour=(8+s.time/DAY*24)%24,growthRate=(hour>=6&&hour<20?1:.38)*(s.weather==='rain'?1.2:s.weather==='heat'?.85:1)/130;
    for(const t of s.tiles)if(t.crop&&t.zone==='farm'&&!t.building)t.crop.growth=clamp(t.crop.growth+dt*growthRate,0,1);
    for(const [k,r]of Object.entries(s.reservations))if(r.expiry<s.time||!s.colonists.some(c=>c.id===r.owner&&!c.dead&&c.job))delete s.reservations[k];
    s.items=s.items.filter(i=>i.count>0);
    updateSystems(this,dt);
    updateHazards(this,dt);
    updateTrade(this,dt);
    if(s.activeRaid&&!s.raiders.some(r=>!r.dead)){
      s.activeRaid=false;s.stats.survivedRaids++;this._log('success','정착지 방어 성공','적이 물러났습니다. 징집을 해제하고 부상자를 치료하세요.');this._wake();
    }
    const living=s.colonists.filter(c=>!c.dead);
    if(!living.length&&!s.gameOver){s.gameOver=true;this._log('danger','정착지의 마지막 날','모든 주민을 잃었습니다. 새 정착지에서 다시 시작할 수 있습니다.');}
    const beacon=s.tiles.some(t=>t.building?.complete&&t.building.type==='beacon'&&t.building.powered);
    const beds=s.tiles.filter(t=>t.building?.complete&&t.building.type==='bed'&&t.roofed).length;
    if(!s.victory&&beacon&&beds>=3&&s.research.unlocked.includes('communications')&&this._countFood()>=6&&s.stats.survivedRaids>=1&&!s.activeRaid&&!s.tiles.some(t=>t.fire>0)&&living.length>0){
      if(!s.extractionAlarmTriggered&&s.beaconProgress>=.5){s.extractionAlarmTriggered=true;this._spawnRaid();this._log('danger','구조 신호가 노출되었습니다','마지막 습격을 물리치면 신호 전송을 이어갑니다. 전력과 실내 침상, 식량을 지키세요.');}
      else{s.beaconProgress=clamp(s.beaconProgress+dt/90,0,s.extractionAlarmTriggered?1:.5);
        if(!s.extractionAlarmTriggered&&s.beaconProgress>=.5){s.extractionAlarmTriggered=true;this._spawnRaid();this._log('danger','구조 신호가 노출되었습니다','마지막 습격을 물리치면 신호 전송을 이어갑니다. 전력과 실내 침상, 식량을 지키세요.');}
        if(s.beaconProgress>=1){s.victory=true;this._log('success','구조 신호가 닿았습니다','실내 침상과 식량, 전력을 지키고 마지막 습격을 견뎠습니다. 구조선이 응답했습니다! 계속 정착지를 운영할 수 있습니다.');}
      }
    }
    if(living.some(c=>c.hunger<18)&&s.time-(s.lastAlerts.hunger??-100)>45){s.lastAlerts.hunger=s.time;this._log('warning','허기 위험','먹을 수 있는 식량과 창고 접근 경로를 확인하세요. 딸기 채집이나 농사가 도움이 됩니다.');}
    if(living.some(c=>c.health<45)&&s.time-(s.lastAlerts.health??-100)>35){s.lastAlerts.health=s.time;this._log('warning','치료가 필요합니다','징집을 해제하면 의무관이 약품을 가져와 자동으로 치료합니다. 약이 없어도 응급 처치를 합니다.');}
  }
  update(dt){
    if(!Number.isFinite(dt)||dt<=0||this.state.gameOver)return;
    this.state.accumulator+=Math.min(dt,3600);
    let steps=0;while(this.state.accumulator>=STEP-1e-9&&steps++<36000){this.state.accumulator=Math.max(0,this.state.accumulator-STEP);const s=this.state;s.time=+(s.time+STEP).toFixed(7);
      for(const e of s.effects)e.age+=STEP;s.effects=s.effects.filter(e=>e.age<e.life);
      if(!s.activeRaid&&s.time>=s.nextRaidAt)this._spawnRaid();
      for(const c of s.colonists)this._tickColonist(c,STEP);
      for(const c of s.colonists)if(c.carryingPawnId)this._syncCarried(c);
      for(const r of s.raiders)this._tickRaider(r,STEP);
      s.systemTimer+=STEP;if(s.systemTimer>=.5-1e-8){this._periodic(s.systemTimer);s.systemTimer=0;}
      s.weatherTimer+=STEP;if(s.weatherTimer>=180){s.weatherTimer=0;const r=this._rand();s.weather=r<.2?'rain':r<.3?'heat':'clear';this._log('info','날씨 변화',s.weather==='rain'?'비가 내려 작물의 성장을 돕습니다.':s.weather==='heat'?'따뜻한 바람이 불어옵니다.':'하늘이 맑게 개었습니다.');}
      if(s.gameOver)break;
    }
  }
  command(type,payload={}){
    try{return this._command(type,payload&&typeof payload==='object'?payload:{});}catch{return {ok:false,message:'명령을 적용할 수 없습니다. 대상과 조건을 다시 확인하세요.'};}
  }
  _command(type,p){
    const s=this.state,no=message=>({ok:false,message}),yes=message=>{this._wake();refreshSystems(this);return {ok:true,message};};
    if(s.gameOver)return no('정착이 끝났습니다. 새 게임을 시작하세요.');
    if(type==='trade'){const result=executeTrade(this,p);return result.ok?yes(result.message):result;}
    if(type==='bill'){
      if(!Object.hasOwn(RECIPES,p.recipeId)||!['count','maintain'].includes(p.mode)||!validInt(p.target)||p.target<0||p.target>99||typeof p.paused!=='boolean')return no('제작 품목, 주문 방식, 0~99 목표와 일시정지 상태를 모두 지정하세요.');
      const old=s.industry.bills[p.recipeId];if(old.mode===p.mode&&old.target===p.target&&old.paused===p.paused)return yes('같은 제작 주문을 유지합니다. 진행 중인 작업은 계속됩니다.');
      for(const c of s.colonists)if(c.job?.type==='craft'&&c.job.recipeId===p.recipeId)this._releaseJob(c);
      s.industry.bills[p.recipeId]={mode:p.mode,target:p.target,paused:p.paused};
      return yes(`${RECIPES[p.recipeId].label}: ${p.paused?'일시정지':p.mode==='count'?`앞으로 ${p.target}개 제작`:`총 ${p.target}개 보유 유지`}. 변경된 작업의 자재는 현장에 반환했습니다.`);
    }
    if(type==='equip'||type==='unequip'){
      const c=s.colonists.find(c=>c.id===p.id&&!c.dead);
      if(!c||c.drafted||c.health<15||c.carriedBy||c.carryingPawnId||c.patientBedId)return no('걸을 수 있고 징집되지 않은 주민을 선택하세요.');
      if(type==='equip'){
        if(!Object.hasOwn(EQUIPMENT,p.item))return no('장착할 소총·조끼·도구를 선택하세요.');const def=EQUIPMENT[p.item];
        if(c.equipment[def.slot]===p.item)return no('이미 같은 장비를 장착하고 있습니다.');
        if(c.job?.type==='equip'&&c.job.item===p.item)return yes('이미 해당 장비를 가지러 가거나 장착하고 있습니다.');
        if(s.resources[p.item]<1)return no('창고에 있는 장비만 장착할 수 있습니다. 바닥 물품을 먼저 운반하세요.');
        const spot=this._stockpileSpot(c);if(!spot)return no('장비를 수령할 창고에 접근할 수 없습니다.');
        const plan=this._plan(c,{type:'equip',item:p.item,slot:def.slot,tx:spot.x,ty:spot.y,key:`equip:${c.id}`,stage:'fetch',total:1.5},spot.x,spot.y,false,`${def.label} 수령하러 이동`,true);
        if(!plan||!this._startPlan(c,plan,{forced:true}))return no('장비 수령 작업을 시작할 수 없습니다.');return yes(`${c.name}이(가) 창고에서 ${def.label}을(를) 가져와 장착합니다.`);
      }
      if(!['weapon','armor','tool'].includes(p.slot))return no('해제할 장비 슬롯을 선택하세요.');const item=c.equipment[p.slot],pending=c.job?.type==='equip'&&c.job.slot===p.slot;
      if(!item&&!pending)return no('해당 슬롯에 장착하거나 준비 중인 장비가 없습니다.');
      if(c.job?.type==='equip')this._releaseJob(c);
      if(item){c.equipment[p.slot]=null;this._dropItem(item,1,c.x,c.y);}return yes('장비를 해제했습니다. 수령한 장비는 주민 위치의 바닥에 남습니다.');
    }
    if(type==='ignite'){const result=igniteTile(this,p.x,p.y,p.strength===undefined?.35:p.strength);return result.ok?yes(result.message):result;}
    if(['designate','zone','build','cancel','demolish','medicalBed'].includes(type)){
      const t=this.tile(p.x,p.y);if(!t)return no('지도 안의 칸을 선택하세요.');
      if(type==='medicalBed'){
        if(typeof p.value!=='boolean'||!t.building?.complete||t.building.type!=='bed')return no('완성된 침대와 의료 침상 상태를 지정하세요.');
        const b=t.building;if(b.medical!==p.value&&s.colonists.some(c=>!c.dead&&(c.patientBedId===b.id||c.job?.type==='rescue'&&c.job.bedId===b.id||c.job?.type==='rest'&&c.job.targetId===b.id)))return no('사용 중이거나 환자 운반이 예약된 침상은 전환할 수 없습니다.');
        b.medical=p.value;return yes(p.value?'의료 침상으로 지정했습니다. 건강한 주민은 일반 침대를 사용합니다.':'일반 침대로 전환했습니다.');
      }
      if(type==='designate'){
        let kind=p.kind;if(kind==='gather')kind=t.feature==='tree'?'chop':t.feature==='ore'?'mine':t.feature==='berry'?'harvest':null;
        if(!['chop','mine','harvest'].includes(kind))return no('채집할 나무·열매·광석을 선택하세요.');
        const expected=kind==='chop'?'tree':kind==='mine'?'ore':'berry';if(t.feature!==expected||t.amount<=0)return no(kind==='chop'?'나무가 있는 칸을 선택하세요.':kind==='mine'?'광석이 있는 칸을 선택하세요.':'열매 덤불을 선택하세요.');
        t.designation=kind;return yes('작업을 지정했습니다. 가능한 주민이 순서대로 수행합니다.');
      }
      if(type==='zone'){
        if(t.fire>0)return no('불을 먼저 끈 뒤 구역을 지정하세요.');
        if(!['farm','stockpile'].includes(p.kind))return no('지원하지 않는 구역입니다.');
        if(t.terrain==='water'||t.building||t.feature)return no('건물·자원·물이 없는 빈 땅을 선택하세요.');
        if(p.kind==='farm'&&t.terrain==='stone')return no('돌 지형에는 작물을 심을 수 없습니다.');
        if(t.zone!==p.kind){for(const c of s.colonists)if(c.job?.tx===t.x&&c.job?.ty===t.y)this._releaseJob(c);t.zone=p.kind;if(p.kind!=='farm')t.crop=null;}
        return yes(p.kind==='farm'?'경작지를 지정했습니다. 농사 담당자가 파종합니다.':'창고 구역을 지정했습니다. 운반 담당자가 물자를 모읍니다.');
      }
      if(type==='build'){
        if(t.fire>0)return no('불타는 칸에는 건설할 수 없습니다. 소방 작업으로 먼저 진화하세요.');
        const def=Object.hasOwn(BUILDINGS,p.kind)?BUILDINGS[p.kind]:null;if(!def)return no('지원하지 않는 건물입니다.');
        if(def.tech&&!s.research.unlocked.includes(def.tech))return no(`${RESEARCH[def.tech].label} 연구를 먼저 완료하세요.`);
        if(t.terrain==='water'||t.building||t.feature||t.crop||t.zone==='farm')return no('건물·자원·작물·물이 없는 땅에 설치하세요.');
        if(t.zone==='stockpile')return no('창고 구역을 먼저 취소하거나 다른 위치를 선택하세요.');
        if(s.colonists.some(c=>!c.dead&&Math.floor(c.x)===t.x&&Math.floor(c.y)===t.y)&&p.kind==='wall')return no('주민이 있는 칸에는 벽을 계획할 수 없습니다.');
        if(p.kind==='beacon'&&s.tiles.some(q=>q.building?.type==='beacon'))return no('구조 신호기는 하나면 충분합니다.');
        const missing=Object.entries(def.cost).filter(([k,v])=>s.resources[k]<v);if(missing.length)return no(`창고 자원 부족: ${missing.map(([k,v])=>`${RESOURCE_LABELS[k]} ${v-s.resources[k]}`).join(', ')}`);
        if(!s.colonists.some(c=>!c.dead&&this._pathTo(c,t.x,t.y,true)!==null))return no('주민이 이 건축 위치에 접근할 수 없습니다.');
        for(const [k,v]of Object.entries(def.cost))withdrawStock(this,k,v);
        t.building={id:this._id('building'),type:p.kind,hp:def.hp,maxHp:def.hp,progress:0,complete:false,paidCost:{...def.cost},materials:{},refunded:false,...(p.kind==='bed'?{medical:false}:{})};
        return yes(`${def.label} 계획을 세웠습니다. 자재를 예약하고 운반합니다.`);
      }
      if(type==='cancel'){
        if(t.building&&!t.building.complete){const b=t.building;for(const c of s.colonists)if(c.job?.targetId===b.id||c.carry?.blueprintId===b.id)this._releaseJob(c,false);
          if(!b.refunded){for(const [k,v]of Object.entries(b.paidCost))depositStock(this,k,v,t.x,t.y);b.refunded=true;}t.building=null;return yes('건축을 취소하고 예약한 자재를 돌려받았습니다.');}
        if(t.designation||t.zone){for(const c of s.colonists)if(c.job?.tx===t.x&&c.job?.ty===t.y)this._releaseJob(c);t.designation=null;t.zone=null;t.crop=null;return yes('작업 또는 구역 지정을 해제했습니다.');}
        return no(t.building?'완성된 건물은 철거 도구를 사용하세요.':'취소할 작업이나 구역이 없습니다.');
      }
      if(type==='demolish'){
        if(t.fire>0)return no('불타는 건물은 먼저 진화해야 철거 자재를 회수할 수 있습니다.');
        if(!t.building?.complete)return no('완성된 건물을 선택하세요.');const b=t.building;
        this._onBuildingDestroyed(b,t,'demolish');
        for(const [k,v]of Object.entries(BUILDINGS[b.type].cost))this._dropItem(k,Math.floor(v*.5),t.x,t.y);
        t.building=null;return yes('건물을 철거했습니다. 회수한 자재는 창고로 운반해야 합니다.');
      }
    }
    if(type==='rescue'||type==='tend'){
      const c=s.colonists.find(c=>c.id===p.id&&!c.dead),patient=s.colonists.find(c=>c.id===p.targetId&&!c.dead);
      if(!c||c.drafted||c.health<15||c.carriedBy||c.carryingPawnId||c.patientBedId)return no('걸을 수 있고 징집되지 않은 주민을 선택하세요.');
      const plan=type==='rescue'?this._rescuePlan(c,patient,true):this._carePlan(c,patient,'doctor',true);
      if(!plan)return no(type==='rescue'?'쓰러진 환자, 접근 경로, 비어 있는 침상과 예약을 확인하세요.':'치료할 환자와 접근 경로·예약을 확인하세요.');
      if(!this._startPlan(c,plan,{forced:true}))return no('간호 작업을 예약할 수 없습니다.');return yes(`${c.name}: ${type==='rescue'?'환자를 실제로 침상까지 운반합니다.':'약품을 가져오거나 응급 처치로 치료합니다.'}`);
    }
    if(type==='schedule'||type==='schedulePreset'){
      const c=s.colonists.find(c=>c.id===p.id&&!c.dead);if(!c)return no('살아 있는 주민을 선택하세요.');const hour=Math.floor((8+s.time/DAY*24)%24),before=c.schedule[hour];
      if(type==='schedule'){if(!validInt(p.hour)||p.hour<0||p.hour>23||!Object.hasOwn(SCHEDULE_MODES,p.mode))return no('0~23시와 유효한 일정 모드를 선택하세요.');c.schedule[p.hour]=p.mode;}
      else{if(!Object.hasOwn(SCHEDULE_PRESETS,p.preset))return no('지원하지 않는 일정입니다.');c.schedule=[...SCHEDULE_PRESETS[p.preset]];}
      if(c.schedule[hour]!==before)this._scheduleRelease(c);return yes(`${c.name}의 일정을 변경했습니다. 긴급한 욕구와 간호·소방은 먼저 처리합니다.`);
    }
    if(type==='research'){
      if(!Object.hasOwn(RESEARCH,p.id))return no('지원하지 않는 연구입니다.');const def=RESEARCH[p.id];
      if(s.research.unlocked.includes(p.id))return no('이미 완료한 연구입니다.');
      if(!def.requires.every(id=>s.research.unlocked.includes(id)))return no(`선행 연구 필요: ${def.requires.map(id=>RESEARCH[id].label).join(', ')}`);
      if(s.research.active!==p.id){for(const c of s.colonists)if(c.job?.type==='research')this._releaseJob(c);s.research.active=p.id;}
      return yes(`${def.label} 연구를 선택했습니다. 연구 담당자가 완성된 연구대에서 진행합니다.`);
    }
    if(type==='autoRepair'){if(typeof p.value!=='boolean')return no('자동 수리 상태를 지정하세요.');s.autoRepair=p.value;if(!p.value)for(const c of s.colonists)if(c.job?.type==='repair'&&!c.job.forced)this._releaseJob(c);return yes(p.value?'건설 담당자가 손상된 건물을 자동 수리합니다.':'자동 수리를 중지했습니다. 우선 작업으로 개별 수리가 가능합니다.');}
    if(type==='moveGroup'){
      if(!Array.isArray(p.ids)||p.ids.length>100||p.ids.some(id=>typeof id!=='string')||!this.tile(p.x,p.y))return no('징집된 주민과 지도 안의 목적지를 선택하세요.');
      const requested=[...new Set(p.ids)],group=requested.map(id=>s.colonists.find(c=>c.id===id&&!c.dead&&c.drafted&&c.health>=15&&!c.carriedBy)).filter(Boolean);if(!group.length)return no('이동 가능한 징집 주민이 없습니다.');
      const candidates=[];for(let radius=0;radius<=6;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)if(Math.abs(dx)+Math.abs(dy)===radius&&this._walkable(p.x+dx,p.y+dy))candidates.push({x:p.x+dx,y:p.y+dy});
      const used=new Set(),assigned=[];for(const c of group){for(const cell of candidates){const key=`${cell.x},${cell.y}`;if(used.has(key))continue;const path=this._pathTo(c,cell.x,cell.y);if(path===null)continue;
          this._releaseJob(c);c.path=path;c.destination={...cell,adjacent:false,raider:false};c.order={type:'move',...cell};c.status='분산 대형으로 이동';used.add(key);assigned.push(c.id);break;}}
      if(!assigned.length)return no('선택한 주민이 접근할 수 있는 주변 칸이 없습니다.');return {...yes(`${assigned.length}/${requested.length}명이 서로 다른 칸으로 이동합니다.`),count:assigned.length,assigned};
    }
    if(['draft','move','attack','hold','priority','prioritize'].includes(type)){
      const c=s.colonists.find(c=>c.id===p.id&&!c.dead);if(!c)return no('살아 있는 주민을 선택하세요.');
      if(type==='prioritize'){
        if(c.drafted)return no('우선 작업을 하려면 징집을 해제하세요.');if(c.health<15||c.carriedBy||c.patientBedId)return no('회복 중인 주민은 먼저 치료해야 합니다.');const t=this.tile(p.x,p.y);if(!t)return no('지도 안의 작업 대상을 선택하세요.');
        if(c.job?.forced&&c.job.tx===t.x&&c.job.ty===t.y)return yes('이미 해당 작업을 우선 수행하고 있습니다.');
        const plan=this._tileJobPlan(c,t);if(!plan)return no('접근·자재·예약을 확인하세요. 건축 계획, 지정 자원, 경작지 또는 손상된 건물이 필요합니다.');
        if(!this._startTilePlan(c,plan,true))return no('우선 작업을 예약할 수 없습니다.');return yes(`${c.name}: ${plan.status}. 긴급한 식사와 휴식은 먼저 처리합니다.`);
      }
      if(type==='priority'){
        if(!WORK.includes(p.work)||!validInt(p.value)||p.value<0||p.value>4)return no('우선순위는 0~4입니다.');
        c.priorities[p.work]=p.value;if(p.value===0&&(c.job?.type===p.work||p.work==='doctor'&&c.job?.type==='feed'||p.work==='build'&&c.job?.type==='repair'))this._releaseJob(c);return yes(`${JOB_LABELS[p.work]} ${p.value===0?'비활성':`우선순위 ${p.value}`}`);
      }
      if(type==='draft'){
        if(typeof p.value!=='boolean')return no('징집 상태를 지정하세요.');if(c.carriedBy||p.value&&(c.health<15||c.patientBedId))return no('구조·회복 중인 주민은 먼저 치료해야 합니다.');
        this._releaseJob(c);c.drafted=p.value;c.order=null;c.status=p.value?'징집 · 경계 중':'일상 업무 복귀';return yes(p.value?'징집했습니다. 우클릭으로 이동·공격을 지휘하세요.':'징집을 해제했습니다. 자동으로 일상 업무에 복귀합니다.');
      }
      if(!c.drafted)return no('전투 명령을 내리려면 주민을 먼저 징집하세요.');
      if(type==='hold'){c.path=[];c.destination=null;c.order={type:'hold'};c.status='거점 유지 · 경계 중';return yes('현재 위치를 지킵니다. 사거리와 시야 안의 적에게 사격합니다.');}
      if(type==='move'){
        if(!this.tile(p.x,p.y)||!this._walkable(p.x,p.y))return no('이동 가능한 땅을 선택하세요.');
        if(!this._goto(c,p.x,p.y))return no('그 위치로 이동하는 경로가 없습니다.');c.order={type:'move',x:p.x,y:p.y};c.status='지정 위치로 이동';return yes('이동 명령을 내렸습니다. 도착한 뒤 주변을 경계합니다.');
      }
      const r=s.raiders.find(r=>r.id===p.targetId&&!r.dead);if(!r)return no('살아 있는 적을 선택하세요.');c.order={type:'attack',targetId:r.id};c.nextCombatPath=0;c.path=[];return yes('적을 공격합니다. 사거리 안에서 자동 사격합니다.');
    }
    if(type==='autoCook'){if(typeof p.value!=='boolean')return no('자동 조리 상태를 지정하세요.');if(p.target!==undefined&&(!validInt(p.target)||p.target<1||p.target>100))return no('목표 식사는 1~100개입니다.');s.autoCook=p.value;if(p.target!==undefined)s.mealTarget=p.target;if(!s.autoCook)for(const c of s.colonists)if(c.job?.type==='cook')this._releaseJob(c);return yes(s.autoCook?`식사 ${s.mealTarget}개까지 자동 조리합니다.`:'자동 조리를 중지했습니다.');}
    if(type==='raid'){if(s.activeRaid)return no('이미 습격이 진행 중입니다.');this._spawnRaid();return yes('약탈자들이 접근합니다. 방어 준비를 하세요.');}
    return no('알 수 없는 명령입니다.');
  }
  getSummary(){
    const s=this.state,alive=s.colonists.filter(c=>!c.dead).length,hour=(8+s.time/DAY*24)%24;
    return {day:Math.floor((s.time+DAY/3)/DAY)+1,hour,temperature:Math.round(outsideTemperature(s)),foodDays:alive?(this._countFood('meals')*64+this._countFood('rawfood')*30)/(alive*(s.difficulty==='relaxed'?.22:.28)*DAY):0,threat:s.activeRaid?'습격 진행':s.nextRaidAt-s.time<35?'습격 임박':'평온',beaconProgress:s.beaconProgress,alive,nextRaidIn:Math.max(0,s.nextRaidAt-s.time),
      indoorBeds:s.tiles.filter(t=>t.roofed&&t.building?.complete&&t.building.type==='bed').length,coldStorage:s.tiles.some(t=>t.zone==='stockpile'&&t.roofed&&t.temperature<=8),
      powerGeneration:s.power.generation,powerDemand:s.power.demand,powerStored:s.power.stored,powerCapacity:s.power.capacity,researchActive:s.research.active,spoiled:s.systemStats.spoiled,
      fireCount:s.tiles.filter(t=>t.fire>0).length,downed:s.colonists.filter(c=>!c.dead&&c.health<15).length};
  }
  getMoodFactors(c){if(typeof c==='string')c=this.state.colonists.find(p=>p.id===c);return moodFactors(c);}
  getEquipmentStats(c){if(typeof c==='string')c=this.state.colonists.find(p=>p.id===c);return equipmentStats(c);}
  getRoomAt(x,y){const t=this.tile(x,y);return t?.roomId===null||t?.roomId===undefined?null:this.state.rooms.find(r=>r.id===t.roomId)||null;}
  getObjectives(){const s=this.state,beds=this.getSummary().indoorBeds,beacon=s.tiles.find(t=>t.building?.complete&&t.building.type==='beacon')?.building,food=this._countFood(),tech=s.research.unlocked.includes('communications'),fires=s.tiles.filter(t=>t.fire>0).length;return [
    {id:'beds',label:'실내 침대 3개 확보',detail:`밀폐된 방의 침대 ${beds}/3 · 동쪽·남쪽 틈을 막으세요`,done:beds>=3,progress:clamp(beds/3,0,1)},
    {id:'food',label:'식사 6개 비축',detail:`완성된 식사 ${food}/6`,done:food>=6,progress:clamp(food/6,0,1)},
    {id:'research',label:'전기 공학 → 장거리 통신',detail:tech?'장거리 통신 해금 완료':`${s.research.active?RESEARCH[s.research.active].label:'다음 연구 선택'} · 연구대에서 실제 연구`,done:tech,progress:clamp((s.research.progress.electricity+s.research.progress.communications)/280,0,1)},
    {id:'raid',label:'습격에서 살아남기',detail:`방어 성공 ${s.stats.survivedRaids}회`,done:s.stats.survivedRaids>=1,progress:Math.min(1,s.stats.survivedRaids)},
    {id:'beacon',label:'전력이 연결된 구조 신호기',detail:beacon?(beacon.powered?'240 W 공급 중':'전력선·발전량·축전지를 확인하세요'):'목재 40 · 강철 40 · 장거리 통신 필요',done:!!beacon?.powered,progress:beacon?.powered?1:(beacon ? 0.5 : 0)},
    {id:'safety',label:'불을 끄고 정착지 안전 확보',detail:fires?`화재 ${fires}칸 · 진화할 때까지 신호 전송 중단`:`현재 화재 없음 · 진화 ${s.hazards.extinguished}회`,done:fires===0,progress:fires?0:1},
    {id:'signal',label:'최종 습격을 견디고 구조 신호 전송',detail:s.victory?'구조선이 응답했습니다':fires?'화재로 전송 일시 중단':s.activeRaid&&s.extractionAlarmTriggered?'습격 중 전송 일시 중단':`조건 충족 중 전송 · ${Math.floor(s.beaconProgress*100)}% · 50%에서 최종 습격`,done:s.victory,progress:s.beaconProgress}
  ];}
  toJSON(){return copy(this.state);}
  static fromJSON(data){
    const bad=reason=>{throw new Error(`저장 파일이 올바르지 않습니다: ${reason}`);};
    if(!data||typeof data!=='object'||Array.isArray(data))bad('게임 상태 없음');
    if(![1,2,3,4].includes(data.version))bad('지원하지 않는 버전');const legacy=data.version===1,previous=data.version<3,previousIndustry=data.version<4,resourceKeys=previousIndustry?LEGACY_KEYS:KEYS,workKeys=WORK.filter(k=>(!legacy||k!=='research')&&(!previous||!['rescue','firefight'].includes(k))&&(!previousIndustry||k!=='craft'));
    if(data.width!==48||data.height!==32||!Array.isArray(data.tiles)||data.tiles.length!==1536)bad('지도 크기');
    const number=(v,a,b,label)=>{if(!Number.isFinite(v)||v<a||v>b)bad(label);};
    if(!validInt(data.seed)||!['standard','relaxed'].includes(data.difficulty))bad('시나리오');
    number(data.time,0,1e10,'시간');number(data.rngState,0,4294967295,'난수');number(data.nextId,1,1e10,'개체 ID');number(data.accumulator,0,3601,'누적 시간');
    number(data.nextRaidAt,0,1e10,'습격 시간');number(data.beaconProgress,0,1,'신호 진행');
    if(!data.resources||resourceKeys.some(k=>!validInt(data.resources[k])||data.resources[k]<0||data.resources[k]>1e8))bad('자원');
    if(!Array.isArray(data.colonists)||!data.colonists.length||data.colonists.length>100||!Array.isArray(data.raiders)||data.raiders.length>1000||!Array.isArray(data.items)||data.items.length>10000)bad('개체 목록');
    const ids=new Set(),id=v=>{if(typeof v!=='string'||!v||v.length>100||ids.has(v))bad('중복 또는 잘못된 ID');ids.add(v);};
    const xy=(o,cell=false)=>{number(o.x,0,cell?47:47.999999,'x 좌표');number(o.y,0,cell?31:31.999999,'y 좌표');if(cell&&(!validInt(o.x)||!validInt(o.y)))bad('셀 좌표');};
    for(let i=0;i<data.tiles.length;i++){const t=data.tiles[i];if(!t||t.x!==i%48||t.y!==Math.floor(i/48)||!['grass','soil','water','stone'].includes(t.terrain)||![null,'tree','berry','ore'].includes(t.feature)||![null,'farm','stockpile'].includes(t.zone)||![null,'chop','mine','harvest'].includes(t.designation))bad('지형');number(t.amount,0,1e6,'자원량');if(t.crop)number(t.crop.growth,0,1,'작물');if(t.building){const b=t.building;id(b.id);if(!Object.hasOwn(BUILDINGS,b.type)||typeof b.complete!=='boolean')bad('건물');number(b.hp,0,1e6,'건물 내구도');number(b.maxHp,1,1e6,'건물 최대 내구도');number(b.progress,0,1,'건설 진행');if(!b.paidCost||!b.materials)bad('건설 자재');for(const obj of [b.paidCost,b.materials])for(const [k,v]of Object.entries(obj))if(!resourceKeys.includes(k)||!validInt(v)||v<0||v>1e6)bad('건설 자재 수량');}}
    const colonistIds=new Set(data.colonists.map(c=>c?.id));
    for(const c of data.colonists){if(!c)bad('주민');id(c.id);xy(c);for(const k of ['health','hunger','energy','mood'])number(c[k],0,100,k);number(c.bleed,0,100,'출혈');if(typeof c.dead!=='boolean'||typeof c.drafted!=='boolean'||typeof c.name!=='string'||c.name.length>100)bad('주민 상태');if(!c.skills||!c.priorities||!Array.isArray(c.path))bad('주민 작업');for(const k of [...workKeys,'shoot'])number(c.skills[k],0,100,'기술');for(const k of workKeys)if(!validInt(c.priorities[k])||c.priorities[k]<0||c.priorities[k]>4)bad('우선순위');if(c.path.length>1536)bad('경로 길이');for(const p of c.path)xy(p,true);if(c.job){if(typeof c.job.type!=='string'||![...workKeys,'eat','rest',...(!legacy?['repair']:[]),...(!previous?['feed','recreate']:[]),...(!previousIndustry?['equip']:[])].includes(c.job.type))bad('작업 종류');number(c.job.tx,0,47,'작업 x');number(c.job.ty,0,31,'작업 y');number(c.job.progress,0,1e8,'작업 진행');number(c.job.total,.00001,1e8,'작업량');}if(c.carry){if(!resourceKeys.includes(c.carry.type)||!validInt(c.carry.count)||c.carry.count<=0||c.carry.count>1e6)bad('운반 중 물품');}}
    for(const r of data.raiders){id(r.id);xy(r);number(r.health,0,1e6,'적 체력');number(r.maxHp,1,1e6,'적 최대 체력');if(typeof r.dead!=='boolean'||!Array.isArray(r.path))bad('적 상태');for(const p of r.path)xy(p,true);}
    for(const i of data.items){id(i.id);xy(i,true);if(!resourceKeys.includes(i.type)||!validInt(i.count)||i.count<=0||i.count>1e8||i.reservedBy!==null&&!colonistIds.has(i.reservedBy))bad('물품');}
    if(!data.reservations||typeof data.reservations!=='object'||Array.isArray(data.reservations))bad('예약');for(const r of Object.values(data.reservations)){if(!r||!colonistIds.has(r.owner))bad('예약 소유자');number(r.expiry,0,1e10,'예약 기한');}
    if(!Array.isArray(data.logs)||data.logs.length>100||!Array.isArray(data.effects)||data.effects.length>500||!data.stats)bad('기록');
    for(const k of ['harvested','buildingsBuilt','mealsCooked','raidersDefeated','survivedRaids'])if(!validInt(data.stats[k])||data.stats[k]<0)bad('통계');
    for(const k of ['victory','gameOver','autoCook','activeRaid'])if(typeof data[k]!=='boolean')bad('진행 상태');
    if(!['clear','rain','heat'].includes(data.weather)||!validInt(data.mealTarget)||data.mealTarget<1||data.mealTarget>100)bad('환경 설정');
    for(const k of ['systemTimer','weatherTimer','raidNumber'])number(data[k],0,1e10,'시스템 시간');
    const record=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
    const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)bad(label);};
    const destination=d=>{if(d!==null&&d!==undefined){if(!record(d))bad('이동 목적지');xy(d,true);if(typeof d.adjacent!=='boolean'||typeof d.raider!=='boolean')bad('이동 정책');}};
    if(!record(data.lastAlerts))bad('알림 시각');for(const v of Object.values(data.lastAlerts))number(v,0,1e10,'알림 시각');
    if(!validInt(data.rngState)||!validInt(data.nextId)||!validInt(data.raidNumber))bad('정수 시스템 상태');
    for(const t of data.tiles)if(t.building){const b=t.building;if(!record(b.paidCost)||!record(b.materials)||typeof b.refunded!=='boolean')bad('건설 자재 상태');for(const [key,n]of Object.entries(b.materials))if(n>(b.paidCost[key]||0))bad('예약량을 넘는 건설 자재');}
    if(!legacy){
      if(typeof data.autoRepair!=='boolean'||typeof data.extractionAlarmTriggered!=='boolean')bad('자동 수리 또는 구조 경보');
      const r=data.research;if(!record(r)||!record(r.progress)||!Array.isArray(r.unlocked)||r.unlocked.length>3||new Set(r.unlocked).size!==r.unlocked.length)bad('연구 상태');
      if(r.active!==null&&!Object.hasOwn(RESEARCH,r.active))bad('진행 연구');
      for(const [rid,def]of Object.entries(RESEARCH))number(r.progress[rid],0,def.points,'연구 진행');
      if(Object.keys(r.progress).some(rid=>!Object.hasOwn(RESEARCH,rid)))bad('알 수 없는 연구 진행');
      for(const rid of r.unlocked){if(!Object.hasOwn(RESEARCH,rid)||r.progress[rid]!==RESEARCH[rid].points||!RESEARCH[rid].requires.every(prereq=>r.unlocked.includes(prereq)))bad('연구 해금 조건');}
      if(r.active!==null&&(r.unlocked.includes(r.active)||!RESEARCH[r.active].requires.every(prereq=>r.unlocked.includes(prereq))))bad('진행 연구 선행 조건');
      validateSystems(data,bad);
    }
    for(const c of data.colonists){
      text(c.status,500,'주민 행동 표시');text(c.role,100,'역할');text(c.color,50,'주민 색상');
      for(const k of ['thinkAt','shotCooldown','breakUntil','nextBreakAt'])number(c[k],0,1e10,'주민 행동 시간');
      if(c.nextCombatPath!==undefined)number(c.nextCombatPath,0,1e10,'전투 갱신 시간');
      if(!record(c.blockedTargets))bad('경로 재시도 상태');for(const v of Object.values(c.blockedTargets))number(v,0,1e10,'경로 재시도 시간');
      destination(c.destination);
      if(c.order!==null){if(!record(c.order)||!['move','attack',...(!previous?['hold']:[])].includes(c.order.type))bad('전투 명령');if(c.order.type==='move')xy(c.order,true);else if(c.order.type==='attack'&&typeof c.order.targetId!=='string')bad('공격 대상');}
      if(c.job){if(!['work','fetch','deliver','pickup','eat'].includes(c.job.stage))bad('작업 단계');if(!validInt(c.job.tx)||!validInt(c.job.ty))bad('작업 목적지');if(c.job.key!==undefined)text(c.job.key,250,'작업 예약키');
        if(c.job.forced!==undefined&&typeof c.job.forced!=='boolean')bad('우선 작업 상태');
        if(c.job.type==='research'&&(!Object.hasOwn(RESEARCH,c.job.researchId)||typeof c.job.targetId!=='string'||c.job.stage!=='work'))bad('연구 작업');
        if(c.job.type==='repair'&&(!['wood','steel'].includes(c.job.resource)||typeof c.job.targetId!=='string'||!['fetch','work'].includes(c.job.stage)))bad('수리 작업');
      }
      if(c.carry?.source==='construction'){
        const b=data.tiles.find(t=>t.building?.id===c.carry.blueprintId)?.building;
        if(!b||b.complete||!Object.hasOwn(b.paidCost,c.carry.type)||c.carry.count+(b.materials[c.carry.type]||0)>b.paidCost[c.carry.type])bad('운반 중 건축 자재 참조');
      }
    }
    for(const item of data.items)if(item.reservedBy){const owner=data.colonists.find(c=>c.id===item.reservedBy);if(!owner||owner.dead||owner.job?.targetId!==item.id)bad('고아 물품 예약');}
    for(const [key,r]of Object.entries(data.reservations)){const owner=data.colonists.find(c=>c.id===r.owner);if(!owner||owner.dead||owner.job?.key!==key)bad('고아 작업 예약');}
    for(const r of data.raiders){for(const k of ['shotCooldown','thinkAt'])number(r[k],0,1e10,'적 행동 시간');destination(r.destination);text(r.status,500,'적 행동 표시');}
    for(const e of data.effects){if(!record(e)||!['shot','hit','harvest','heal','build'].includes(e.kind))bad('효과');for(const k of ['x','tx'])number(e[k],0,48,'효과 좌표');for(const k of ['y','ty'])number(e[k],0,32,'효과 좌표');number(e.age,0,100,'효과 시간');number(e.life,.00001,100,'효과 수명');text(e.color,50,'효과 색상');text(e.text,500,'효과 설명');}
    for(const l of data.logs){if(!record(l)||!['info','success','warning','danger'].includes(l.kind))bad('기록 종류');id(l.id);number(l.time,0,1e10,'기록 시각');text(l.title,300,'기록 제목');text(l.text,2000,'기록 본문');}
    if(!previous){validateLife(data,bad);validateHazards(data,bad);}
    if(!previousIndustry){validateIndustry(data,bad);validateTrade(data,bad);}
    // Reject incomplete internal state before it can reach an update or renderer.
    // A save is a state snapshot, not executable data or an alternate rule definition.
    const game=Object.create(ColonyGame.prototype);game.state=copy(data);
    if(legacy){const s=game.state;s.version=2;s.autoRepair=true;s.extractionAlarmTriggered=s.victory;
      const grandfather=s.tiles.some(t=>t.building?.type==='beacon');
      s.research={active:grandfather?null:'electricity',progress:{electricity:grandfather?100:0,refrigeration:0,communications:grandfather?180:0},unlocked:grandfather?['electricity','communications']:[]};
      for(const c of s.colonists){c.skills.research=c.name==='미나'?10:c.name==='도현'?7:6;c.priorities.research=c.name==='미나'?2:4;}
      initializeSystems(game,{migration:true});validateSystems(s,bad);
    }
    if(previous){game.state.version=3;initializeLife(game,{migration:true});initializeHazards(game,{migration:true});validateLife(game.state,bad);validateHazards(game.state,bad);}
    if(previousIndustry){game.state.version=4;initializeIndustry(game,{migration:true});initializeTrade(game,{migration:true});validateIndustry(game.state,bad);validateTrade(game.state,bad);}
    return game;
  }
}
