/* Frontier Defense: custom playable simulation using KR v14 reference candidates.
   Maps, spawn timing, targeting, hero, skill timing and unresolved rules are authored
   approximations. This DOM-free fixed-step engine never claims original fidelity. */
(function (G) {
  'use strict';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const d2=(a,b)=>(a.x-b.x)**2+(a.y-b.y)**2;
  const hypot=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const ok=(message)=>({ok:true,message});
  const fail=(message)=>({ok:false,message});
  const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const point=(p)=>Array.isArray(p)?{x:p[0],y:p[1]}:p;
  const damageAvg=(d)=>Array.isArray(d)?(num(d[0])+num(d[1]))/2:num(d,5);
  const familyNames={archer:'궁수',barracks:'병영',mage:'마법',artillery:'포병'};
  class KRWorld {
    constructor(data,stageId,options={}) {
      this.data=data; this.stage=data.stages.find(s=>s.id===stageId)||data.stages[0];
      if(!this.stage)throw new Error('No stage definitions');
      this.mode=options.mode||'campaign';
      this.difficulty=options.difficulty||'normal';
      this.permanent={archer:0,barracks:0,mage:0,artillery:0,meteor:0,reinforcements:0,...options.upgrades};
      this.seed=(options.seed||137+this.stage.order*991)>>>0;this.serial=0;
      this.state='ready';this.time=0;this.wave=0;
      this.waveDefs=this.stage.waves?.[this.mode]||this.stage.waves?.campaign||[];
      this.totalWaves=this.waveDefs.length;
      this.modeDef=this.stage.modes?.[this.mode]||{};
      this.maxLives=num(this.modeDef.lives, this.mode==='campaign'?20:1)||20;
      this.lives=this.maxLives;
      this.gold=num(this.modeDef.startingGold,this.stage.startingGold||400)+(this.difficulty==='casual'?120:0);
      this.towers=[];this.enemies=[];this.units=[];this.projectiles=[];this.effects=[];this.pending=[];
      this.nextWaveIn=0;this.callLock=0;this.canCallWave=true;
      this.spells={reinforcements:{remaining:0,total:14},meteor:{remaining:0,total:55}};
      this.stats={kills:0,damage:0,leaks:0,spent:0,cheated:false,duration:0};
      this.notifications=[];this.result=null;this.bossSpawned=false;this.invincible=false;this.unlimitedGold=false;
      this._autoWait=0;this._activeEmpty=0;
      this.paths=(this.stage.paths||[]).map(ps=>{
        const points=ps.map(point),segments=[];let length=0;
        for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],l=hypot(a,b);if(l>0){segments.push({a,b,start:length,len:l});length+=l;}}
        return {points,segments,length};
      });
      if(!this.paths.length)throw new Error('Stage path missing');
      const hp=320+num(this.permanent.barracks)*20;
      const heroPos=this.pathPosition(0,this.paths[0].length*.72);
      this.hero=this.makeUnit('hero',null,heroPos.x,heroPos.y,{maxHp:hp,damage:11,interval:1.05,armor:.3,speed:130,level:1,xp:0});
      this.hero.name='아렌';this.hero.skillCd=5;this.hero.rally={...heroPos};this.units.push(this.hero);
      this.notify('건설 지점을 눌러 타워를 배치하세요.');
    }
    rng(){let t=this.seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;}
    id(){return ++this.serial;}
    notify(text){this.notifications.push(text);if(this.notifications.length>8)this.notifications.shift();}
    effect(kind,x,y,props={}){this.effects.push({kind,x,y,age:0,duration:.55,...props});if(this.effects.length>300)this.effects.splice(0,this.effects.length-300);}
    getTower(id){return this.towers.find(t=>t.id===id)||null;}
    getEnemy(id){return this.enemies.find(e=>e.id===id&&!e.dead)||null;}
    isActive(){return this.state==='ready'||this.state==='playing';}
    pathPosition(pi,dist){const p=this.paths[pi]||this.paths[0];dist=clamp(dist,0,p.length);let s=p.segments[p.segments.length-1];for(const seg of p.segments){if(dist<=seg.start+seg.len){s=seg;break;}}if(!s)return {...p.points[0],dx:1,dy:0};const f=clamp((dist-s.start)/s.len,0,1);return {x:s.a.x+(s.b.x-s.a.x)*f,y:s.a.y+(s.b.y-s.a.y)*f,dx:(s.b.x-s.a.x)/s.len,dy:(s.b.y-s.a.y)/s.len};}
    nearestPath(x,y){let best={distance:Infinity,x,y,pathIndex:0,progress:0};for(let pi=0;pi<this.paths.length;pi++){for(const s of this.paths[pi].segments){const t=clamp(((x-s.a.x)*(s.b.x-s.a.x)+(y-s.a.y)*(s.b.y-s.a.y))/(s.len*s.len),0,1);const q={x:s.a.x+(s.b.x-s.a.x)*t,y:s.a.y+(s.b.y-s.a.y)*t};const d=Math.hypot(x-q.x,y-q.y);if(d<best.distance)best={...q,distance:d,pathIndex:pi,progress:s.start+s.len*t};}}return best;}
    towerDef(t){return this.data.towers[t.defId];}
    skill(t,name){for(const [id,rank]of Object.entries(t.skills||{})){if(id===name||(name==='wrath_forest'&&id.includes('wrath'))||(name==='shield_valor'&&id.includes('shield'))||(name==='whirlwind'&&id.includes('whirlwind'))||(name==='dragonbreath'&&id.includes('dragonbreath'))){const def=this.data.abilities[id]||{};const val=def.values?.[rank-1]||def.levels?.[rank-1]?.parameters||{};return {id,rank,def,val};}}return null;}
    range(t){const d=this.towerDef(t);return num(d.range,145)*(1+num(this.permanent[d.family])*.025);}
    allowed(def){const a=this.modeDef.allowedFamilies;return !a||a.includes(def.family);}
    spend(amount){if(this.unlimitedGold)return true;if(!Number.isFinite(amount)||amount<0||this.gold<amount)return false;this.gold-=amount;this.stats.spent+=amount;return true;}
    build(siteIndex,defId){
      if(!this.isActive())return fail('전투가 종료되었습니다.');
      const def=this.data.towers[defId],site=this.stage.sites?.[siteIndex];
      if(!site||!def||def.tier!==1)return fail('건설할 수 없습니다.');
      if(this.towers.some(t=>t.siteIndex===siteIndex))return fail('이미 타워가 있습니다.');
      if(!this.allowed(def))return fail('이 모드에서 사용할 수 없는 타워입니다.');
      if(!this.spend(def.cost))return fail('골드가 부족합니다.');
      const p=this.nearestPath(site.x,site.y);
      const tower={id:this.id(),siteIndex,defId,x:site.x,y:site.y,cd:.15,skills:{},skillCds:{},rally:{x:p.x,y:p.y},invested:def.cost,disabled:0,slots:[],damage:0,kills:0};
      this.towers.push(tower);this.syncSoldiers(tower,true);this.effect('upgrade',tower.x,tower.y,{color:'#f4d785',radius:40});
      return ok(`${def.nameKo||def.name} 건설`);
    }
    upgrade(towerId,nextDefId){
      const t=this.getTower(towerId),d=t&&this.towerDef(t),next=this.data.towers[nextDefId];
      if(!this.isActive()||!t||!next||!d.upgrades.includes(nextDefId))return fail('올바른 강화 경로가 아닙니다.');
      if(next.tier>num(this.modeDef.maxTier,4))return fail('이 모드의 최대 강화 단계입니다.');
      if(!this.spend(next.cost))return fail('골드가 부족합니다.');
      const phase=d.interval?clamp(t.cd/d.interval,0,1):0;
      t.defId=nextDefId;t.invested+=next.cost;t.cd=phase*(next.interval||1);
      this.syncSoldiers(t,true);this.effect('upgrade',t.x,t.y,{radius:55,color:'#fff0a6'});return ok(`${next.nameKo||next.name} 완성`);
    }
    buySkill(towerId,skillId){
      const t=this.getTower(towerId),d=t&&this.towerDef(t),a=this.data.abilities[skillId];
      if(!this.isActive()||!t||!a||!d.abilities?.includes(skillId))return fail('사용할 수 없는 능력입니다.');
      const rank=t.skills[skillId]||0,max=a.maxLevel||a.costs?.length||3;
      if(rank>=max)return fail('최대 강화 상태입니다.');
      const cost=a.costs?.[rank]??a.levels?.[rank]?.purchaseCostIncremental;
      if(!Number.isFinite(cost)||!this.spend(cost))return fail('골드가 부족합니다.');
      t.skills[skillId]=rank+1;t.skillCds[skillId]=Math.min(t.skillCds[skillId]||0,1);t.invested+=cost;
      this.syncSoldiers(t,true);this.effect('upgrade',t.x,t.y,{radius:45,color:'#91e9c1'});return ok(`${a.nameKo||a.name} ${rank+1}단계`);
    }
    sell(towerId){const t=this.getTower(towerId);if(!t||!this.isActive())return fail('판매할 수 없습니다.');const refund=Math.floor(t.invested*(this.wave===0?1:.65));this.gold+=refund;this.towers=this.towers.filter(x=>x!==t);this.units=this.units.filter(u=>u.ownerId!==t.id);this.effect('text',t.x,t.y,{text:`+${refund}`,color:'#ffd472',duration:1});return ok(`${refund} 골드 환급`);}
    setRally(towerId,x,y){const t=this.getTower(towerId);if(!t||!this.isActive())return fail('집결 위치를 지정할 수 없습니다.');if(this.towerDef(t).family!=='barracks'&&!this.skill(t,'summon_elemental'))return fail('집결 가능한 병력이 없습니다.');const p=this.nearestPath(x,y),range=170;if(p.distance>65||hypot(t,p)>range)return fail('병영 가까운 길에 집결 지점을 지정하세요.');t.rally={x:p.x,y:p.y};for(const u of this.units.filter(u=>u.ownerId===t.id)){u.rally={...t.rally};u.targetId=null;u.moveOrder=1;u.targetX=p.x;u.targetY=p.y;}this.effect('ring',p.x,p.y,{radius:22,color:'#89dce7'});return ok('집결 위치 변경');}
    moveHero(x,y){if(!this.isActive()||this.hero.hp<=0)return fail('영웅이 회복 중입니다.');if(!Number.isFinite(x)||!Number.isFinite(y))return fail('이동 위치가 올바르지 않습니다.');this.hero.targetX=clamp(x,20,980);this.hero.targetY=clamp(y,30,590);this.hero.rally={x:this.hero.targetX,y:this.hero.targetY};this.hero.moveOrder=1;this.hero.targetId=null;this.effect('ring',x,y,{radius:18,color:'#7ec9ff'});return ok('영웅 이동');}
    cast(spellId,x,y){
      if(this.state!=='playing')return fail('웨이브를 시작한 뒤 사용하세요.');const spell=this.spells[spellId];
      if(!spell||spell.remaining>0)return fail('아직 재사용 대기 중입니다.');if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1000||y<0||y>620)return fail('전장 안의 위치를 선택하세요.');
      if(spellId==='reinforcements'){
        const p=this.nearestPath(x,y);if(p.distance>85)return fail('길 가까이에 지원군을 배치하세요.');
        const tier=num(this.permanent.reinforcements);for(let i=0;i<2;i++){const u=this.makeUnit('reinforcement',null,p.x+(i?13:-13),p.y,{maxHp:100+tier*32,damage:7+tier*3,interval:.9,armor:.1+tier*.035,speed:105});u.rally={x:p.x,y:p.y};u.expiresAt=this.time+23;u.ranged=tier>=3;this.units.push(u);this.effect('spawn',u.x,u.y,{color:'#9bd8ff',radius:25});}
      }else{
        const tier=num(this.permanent.meteor),count=3+(tier>=3?1:0);for(let i=0;i<count;i++){this.pending.push({time:this.time+.35+i*.22,type:'meteor',x:x+(this.rng()-.5)*55,y:y+(this.rng()-.5)*42,damage:130+tier*24,radius:72+tier*3});}
        this.effect('meteor',x,y,{duration:1.5,radius:82,color:'#ff9047'});
      }
      spell.remaining=Math.max(6,spell.total-num(this.permanent[spellId])*1.4);return ok(spellId==='meteor'?'유성 폭격!':'지원군 도착!');
    }
    callWave(){
      if(!this.isActive()||this.wave>=this.totalWaves)return fail('마지막 웨이브입니다.');if(this.callLock>0)return fail('잠시 후 다음 웨이브를 호출할 수 있습니다.');
      const first=this.wave===0,bonus=first?0:Math.max(0,Math.floor(this.nextWaveIn*.65));
      if(bonus){this.gold+=bonus;this.effect('text',850,65,{text:`조기 호출 +${bonus}`,color:'#ffd06a',duration:1.5});for(const s of Object.values(this.spells))s.remaining=Math.max(0,s.remaining-this.nextWaveIn*.4);}
      const groups=this.waveDefs[this.wave]||[];this.wave++;this.state='playing';this.callLock=3.2;let last=0;
      groups.forEach((g,gi)=>{
        const enemyId=g.enemy||g.enemyId,def=this.data.enemies[enemyId];if(!def)return;
        const interval=def.boss?2:clamp(.72+(def.hp>500?.4:0)-(this.stage.order||1)*.015,.48,1.12);
        const delay=gi*.85;
        for(let i=0;i<g.count;i++){const at=delay+i*interval;last=Math.max(last,at);this.pending.push({time:this.time+at+.4,type:'spawn',enemyId,pathIndex:Number.isInteger(g.path)?g.path%this.paths.length:(gi+i)%this.paths.length,wave:this.wave});}
      });
      this.nextWaveIn=Math.max(35,Math.min(65,last+24));this.canCallWave=false;
      this.notify(`웨이브 ${this.wave} / ${this.totalWaves}`);return ok(first?'방어 시작!':`다음 웨이브 · +${bonus} 골드`);
    }
    cheat(action,value){
      if(!this.isActive())return fail('전투를 시작하세요.');this.stats.cheated=true;
      if(action==='gold'||action==='addGold')this.gold+=num(value,1000);
      if(action==='invincible')this.invincible=value===undefined?!this.invincible:!!value;
      if(action==='unlimitedGold'){this.unlimitedGold=!!value;if(value)this.gold=Math.max(this.gold,99999);}
      if(action==='cooldowns'||action==='resetCooldowns')for(const s of Object.values(this.spells))s.remaining=0;
      if(action==='clear')for(const e of this.enemies)if(!e.dead)this.killEnemy(e,null,{instant:true});
      return ok('개발자 설정 적용 · 기록 저장 제외');
    }
    makeUnit(kind,ownerId,x,y,props={}){const maxHp=num(props.maxHp,100);return {id:this.id(),kind,ownerId,x,y,hp:maxHp,maxHp,targetX:x,targetY:y,rally:{x,y},damage:8,interval:1,armor:0,speed:95,cd:.1,healCd:0,axeCd:0,deadUntil:0,targetId:null,moveOrder:0,attackAnim:0,...props};}
    syncSoldiers(t,heal){
      const d=this.towerDef(t),isBarracks=d.family==='barracks',elem=this.skill(t,'summon_elemental');
      if(!isBarracks&&!elem)return;
      const count=isBarracks?(d.soldierCount||3):1,kind=isBarracks?'soldier':'elemental',ep=elem?.val||{},rank=elem?.rank||1;
      for(let slot=0;slot<count;slot++){
        let u=this.units.find(u=>u.ownerId===t.id&&u.slot===slot&&u.kind===kind);
        const hp=isBarracks?num(d.soldierHp,50)*(1+.06*num(this.permanent.barracks)):num(ep.hpNormal,600+100*(rank-1));
        const shield=this.skill(t,'shield_valor');
        const armor=isBarracks?clamp(num(d.armor)+num(this.permanent.barracks)*.025+(shield?.15:0),0,.85):num(ep.armorFraction,.4+(rank-1)*.1);
        const axes=this.skill(t,'more_axes');
        const attack=isBarracks?(num(d.damageMin,1)+num(d.damageMax,3))/2+(axes?num(axes.val.damageBonusCumulative,axes.rank*10):0):damageAvg(ep.damage||[30+10*(rank-1),50+10*(rank-1)]);
        if(!u){const offsets=[[-15,0],[14,1],[0,16]],off=offsets[slot%3];u=this.makeUnit(kind,t.id,t.rally.x+off[0],t.rally.y+off[1],{maxHp:hp,slot,damage:attack,armor,interval:isBarracks?num(d.interval,1.15):2,respawn:isBarracks?num(d.respawn,10):8});this.units.push(u);}
        else {u.maxHp=hp;u.damage=attack;u.armor=armor;u.interval=isBarracks?num(d.interval,1.15):2;u.respawn=isBarracks?num(d.respawn,10):8;if(heal){u.hp=hp;u.deadUntil=0;}}
        u.rally={...t.rally};u.towerDefId=t.defId;
      }
    }
    spawn(enemyId,pathIndex=0,progress=0,props={}){
      const d=this.data.enemies[enemyId];if(!d)return null;
      pathIndex=Math.max(0,pathIndex)%this.paths.length;const p=this.pathPosition(pathIndex,progress),factor=this.difficulty==='casual'?.78:this.difficulty==='veteran'?1.2:1;
      const hp=Math.max(1,num(d.hp,50)*factor);const e={id:this.id(),defId:enemyId,x:p.x,y:p.y,dx:p.dx,dy:p.dy,pathIndex,progress,hp,maxHp:hp,armor:num(d.armor),resist:num(d.resist),speed:num(d.speed,35),air:!!d.air,boss:!!d.boss||['juggernaut','jt','veznan'].includes(enemyId),blockable:d.blockable!==false&&!d.air,damage:(d.boss?(enemyId==='jt'?150:enemyId==='juggernaut'?110:95):damageAvg(d.damage||5))*(this.difficulty==='casual'?.8:1),attackTime:num(d.attackTime,1),cd:.4,abilityCd:5+this.rng()*3,healCd:5+this.rng()*3,gold:num(d.gold,3),lifeCost:num(d.lifeCost,1),radius:d.radius||12,dead:false,root:0,slow:0,curse:0,poison:null,wrath:0,teleports:0,phase:1,shield:0,regenAccumulator:0,hitFlash:0,...props};
      this.enemies.push(e);if(e.boss){this.bossSpawned=true;this.notify(`${d.nameKo||d.name} 등장!`);this.effect('ring',e.x,e.y,{radius:60,color:'#fa8b6d',duration:1.3});}return e;
    }
    target(t,range=this.range(t),predicate=null){let best=null,metric=Infinity;const d=this.towerDef(t);for(const e of this.enemies){if(e.dead||e.hp<=0||d2(t,e)>range*range)continue;if(e.air&&(d.kind==='shell'||d.family==='barracks'))continue;if(predicate&&!predicate(e))continue;const m=this.paths[e.pathIndex].length-e.progress;if(m<metric){metric=m;best=e;}}return best;}
    targetsAt(x,y,radius,filter=null){const p={x,y},r2=radius*radius;return this.enemies.filter(e=>!e.dead&&e.hp>0&&d2(e,p)<=r2&&(!filter||filter(e)));}
    hit(e,raw,type='physical',source=null,opts={}){
      if(!e||e.dead||e.hp<=0||raw<=0)return 0;
      if(opts.instant&&e.boss)return 0;
      if(e.shield>0&&!opts.instant){if(!opts.dot)e.shield--;this.effect('ring',e.x,e.y,{radius:16,color:'#d386ed',duration:.2});return 0;}
      let armor=e.armor*(e.curse>0?.5:1),damage=raw;
      if(!opts.instant){if(type==='physical')damage*=1-clamp(armor,0,.99);else if(type==='explosive')damage*=1-clamp(armor*.5,0,.99);else if(type==='magic'||type==='magical')damage*=1-clamp(e.resist,0,.99);}
      const loss=Math.min(e.hp,damage);e.hp-=damage;e.hitFlash=.13;this.stats.damage+=loss;
      if(source&&this.getTower(source))this.getTower(source).damage+=loss;
      if(e.defId==='rocket_rider'&&!e.turboUsed){e.turboUsed=true;e.turbo=2;}
      if(e.hp<=0)this.killEnemy(e,source,opts);
      return loss;
    }
    killEnemy(e,source,opts={}){
      if(e.dead)return;
      if(e.defId==='veznan'&&e.phase===1&&!opts.instant){e.phase=2;e.maxHp=Math.max(e.maxHp,6666)*(this.difficulty==='casual'?.85:1);e.hp=e.maxHp;e.speed*=1.25;e.radius=31;e.root=0;e.poison=null;e.shield=0;this.effect('blast',e.x,e.y,{radius:100,color:'#ef6b45',duration:1.2});this.notify('베즈난이 악마의 모습으로 변신했습니다!');return;}
      e.dead=true;this.stats.kills++;this.gold+=e.gold;
      const t=source&&this.getTower(source);if(t)t.kills++;
      if(e.gold)this.effect('text',e.x,e.y-14,{text:`+${e.gold}`,color:'#f4d987',duration:.7});
      this.effect('death',e.x,e.y,{radius:e.radius,color:e.boss?'#f77e52':'#aeb68a',duration:.45});
      if(this.hero.hp>0){this.hero.xp+=e.boss?200:Math.min(35,3+e.maxHp/25);const req=this.hero.level*40;while(this.hero.level<10&&this.hero.xp>=this.hero.level*40){this.hero.xp-=this.hero.level*40;this.hero.level++;this.hero.maxHp+=30;this.hero.hp=Math.min(this.hero.maxHp,this.hero.hp+90);this.hero.damage+=2;this.effect('text',this.hero.x,this.hero.y-30,{text:`LEVEL ${this.hero.level}`,color:'#9fe0ff',duration:1.4});}}
      if(!e.transformed&&['demon_spawn','demon_hound','demon_lord'].includes(e.defId)){
        const raw=e.defId==='demon_lord'?100:e.defId==='demon_hound'?65:45;
        for(const u of this.units)if(u.hp>0&&hypot(e,u)<65)this.hurtUnit(u,raw);
        this.effect('blast',e.x,e.y,{radius:55,color:'#f98448',duration:.5});
      }
    }
    hurtUnit(u,raw,type='physical'){
      if(!u||u.hp<=0)return;u.hp-=raw*(type==='true'?1:1-clamp(u.armor||0,0,.95));u.hitFlash=.12;
      if(u.hp<=0){u.hp=0;u.targetId=null;u.deadUntil=this.time+(u.kind==='hero'?15:num(u.respawn,10));this.effect('death',u.x,u.y,{radius:13,color:'#a6b9c0',duration:.5});if(u.kind==='hero')this.notify('영웅이 쓰러졌습니다. 15초 후 복귀합니다.');}
    }
    launch(t,e,damage,kind,type,opts={}){
      const target={x:e.x,y:e.y};const speed=kind==='shell'?300:kind==='missile'?340:550;
      this.projectiles.push({id:this.id(),x:t.x,y:t.y-18,startX:t.x,startY:t.y-18,tx:target.x,ty:target.y,targetId:e.id,sourceId:t.id,damage,kind,type,age:0,duration:Math.max(.12,hypot(t,e)/speed),...opts});
    }
    tickTower(t,dt){
      if(t.disabled>0){t.disabled=Math.max(0,t.disabled-dt);return;}
      const d=this.towerDef(t),r=this.range(t);t.cd-=dt;
      for(const id of Object.keys(t.skillCds))t.skillCds[id]=Math.max(0,t.skillCds[id]-dt);
      if(d.family==='barracks')return;
      const ready=(s)=>s&&(t.skillCds[s.id]||0)<=0;
      const cooldown=(s,seconds)=>{t.skillCds[s.id]=seconds;};
      let s=this.skill(t,'wrath_forest');
      if(ready(s)){
        const victims=this.targetsAt(t.x,t.y,r,e=>!e.air&&!e.boss&&!e.transformed&&(e.wrathUses||0)<3);
        if(victims.length>=2){for(const e of victims.slice(0,num(s.val.maxTargets,4+s.rank))){e.root=Math.max(e.root,num(s.val.durationSeconds,s.rank));e.wrath={remaining:num(s.val.durationSeconds,s.rank),dps:num(s.val.damagePerSecond,40),source:t.id};e.wrathUses=(e.wrathUses||0)+1;this.effect('roots',e.x,e.y,{radius:20,duration:e.root,color:'#87bc6d'});}cooldown(s,num(s.val.cooldownSeconds,9));}
      }
      s=this.skill(t,'sniper_shot');
      if(ready(s)){
        const victims=this.targetsAt(t.x,t.y,r,e=>!e.boss).sort((a,b)=>b.hp-a.hp);
        const e=victims[0];if(e){const instant=this.rng()<num(s.val.instantKillChance,.2*s.rank);this.effect('lightning',t.x,t.y-20,{x2:e.x,y2:e.y,color:'#f7e3b0',duration:.2});this.hit(e,instant?e.hp+1:e.maxHp*.2+25*s.rank,'physical',t.id,{instant});cooldown(s,num(s.val.cooldownSeconds,14));}
      }
      s=this.skill(t,'shrapnel_shot');
      if(ready(s)){
        const e=this.target(t,r*.72,e=>!e.air);if(e){const raw=damageAvg(s.val.perGrapeDamage||[10,40])*3;for(const target of this.targetsAt(e.x,e.y,75,target=>!target.air))this.hit(target,raw,'explosive',t.id);this.effect('blast',e.x,e.y,{radius:75,color:'#ffc98b'});cooldown(s,num(s.val.cooldownSeconds,9));}
      }
      s=this.skill(t,'death_ray');
      if(ready(s)){
        const e=this.targetsAt(t.x,t.y,r,e=>!e.boss).sort((a,b)=>b.hp-a.hp)[0];if(e){this.effect('lightning',t.x,t.y-30,{x2:e.x,y2:e.y,color:'#e2adff',duration:.55});this.hit(e,e.hp+1,'true',t.id,{instant:true});cooldown(s,num(s.val.cooldownSeconds,20-2*(s.rank-1)));}
      }
      s=this.skill(t,'teleport');
      if(ready(s)){
        const victims=this.targetsAt(t.x,t.y,r,e=>!e.boss&&!e.transformed&&e.teleports<3&&e.progress>160);
        if(victims.length){for(const e of victims.slice(0,num(s.val.maxTargets,4+s.rank))){const old={x:e.x,y:e.y};e.progress=Math.max(0,e.progress-150-s.rank*35);Object.assign(e,this.pathPosition(e.pathIndex,e.progress));e.teleports++;this.effect('teleport',old.x,old.y,{x2:e.x,y2:e.y,radius:24,color:'#ba8af5',duration:.7});for(const u of this.units)if(u.targetId===e.id)u.targetId=null;}cooldown(s,num(s.val.cooldownSeconds,10));}
      }
      s=this.skill(t,'polymorph');
      if(ready(s)){
        const e=this.targetsAt(t.x,t.y,r,e=>!e.boss&&!e.transformed).sort((a,b)=>b.hp-a.hp)[0];
        if(e){e.transformed=true;e.sheep=true;e.hp=Math.max(1,e.hp*.5);e.maxHp=Math.max(1,e.maxHp*.5);e.armor=0;e.resist=0;e.blockable=false;e.speed*=1.15;e.poison=null;e.wrath=0;e.shield=0;this.effect('spawn',e.x,e.y,{radius:30,color:'#e8d3fa',duration:.7});cooldown(s,num(s.val.cooldownSeconds,20-2*(s.rank-1)));}
      }
      s=this.skill(t,'dragonbreath');
      if(ready(s)){
        const victims=this.targetsAt(t.x,t.y,r*num(s.val.detectRangeMultiplier,1.2));victims.sort((a,b)=>(this.paths[a.pathIndex].length-a.progress)-(this.paths[b.pathIndex].length-b.progress));
        if(victims[0]){this.launch(t,victims[0],damageAvg(s.val.damage||[100+40*(s.rank-1),140+40*(s.rank-1)]),'missile','explosive',{splash:62,affectAir:true});cooldown(s,num(s.val.cooldownSeconds,11));}
      }
      s=this.skill(t,'cluster_launcher');
      if(ready(s)){
        const e=this.target(t,r,e=>!e.air);if(e){const count=num(s.val.bomblets,3+2*(s.rank-1));for(let i=0;i<count;i++)this.pending.push({time:this.time+.45+i*.08,type:'explosion',x:e.x+(this.rng()-.5)*90,y:e.y+(this.rng()-.5)*65,damage:damageAvg(s.val.damagePerBomblet||[60,80]),radius:46,source:t.id});cooldown(s,num(s.val.reportedCycleSeconds,17.5));}
      }
      if(t.cd>0)return;
      const e=this.target(t,r);if(!e){t.cd=Math.max(t.cd,-.15);return;}
      const damage=(num(d.damageMin,4)+this.rng()*(num(d.damageMax,6)-num(d.damageMin,4)))*(1+num(this.permanent[d.family])*.055);
      t.cd+=Math.max(.15,num(d.interval,1));t.attackAnim=.2;
      if(d.kind==='chain'){
        const sb=this.skill(t,'supercharged_bolt'),count=sb?num(sb.val.maxChainTargets,3+sb.rank):3;
        let current=e,previous=t;const used=new Set();
        for(let i=0;current&&i<count;i++){used.add(current.id);this.effect('lightning',previous.x,previous.y-(i===0?24:0),{x2:current.x,y2:current.y,color:'#9af0ff',duration:.22});this.hit(current,damage*Math.max(.55,1-i*.12),'explosive',t.id);previous=current;current=this.targetsAt(previous.x,previous.y,125,v=>!used.has(v.id)).sort((a,b)=>d2(previous,a)-d2(previous,b))[0];}
        const o=this.skill(t,'overcharge');if(o){for(const target of this.targetsAt(t.x,t.y,r*.8))this.hit(target,damageAvg(o.val.damage||[10*o.rank,20*o.rank]),'explosive',t.id);this.effect('ring',t.x,t.y,{radius:r*.8,color:'#8deaff',duration:.35});}
      }else {
        const poison=this.skill(t,'poison_arrows');
        this.launch(t,e,damage,d.kind||'arrow',d.family==='mage'?'magic':d.family==='artillery'?'explosive':'physical',{splash:d.kind==='shell'?num(d.splash,55):0,poison:poison?{dps:num(poison.val.dps,5*poison.rank),remaining:num(poison.val.durationSeconds,3)}:null,curse:t.defId==='sorcerer'});
      }
    }
    moveUnit(u,x,y,dt){const dist=Math.hypot(x-u.x,y-u.y),step=u.speed*dt;if(dist<=step){u.x=x;u.y=y;return true;}if(dist>0){u.x+=(x-u.x)/dist*step;u.y+=(y-u.y)/dist*step;}return false;}
    tickUnit(u,dt){
      if(u.expiresAt&&this.time>=u.expiresAt){u.expired=true;return;}
      const owner=u.ownerId&&this.getTower(u.ownerId);
      if(u.ownerId&&!owner){u.expired=true;return;}
      if(u.hp<=0){
        if(u.kind==='reinforcement')return;
        if(this.time>=u.deadUntil){u.hp=u.maxHp;u.x=u.rally.x;u.y=u.rally.y;u.targetX=u.x;u.targetY=u.y;u.targetId=null;u.moveOrder=0;this.effect('spawn',u.x,u.y,{radius:25,color:u.kind==='hero'?'#83c9ff':'#a0d5b2'});}
        else return;
      }
      if(owner&&owner.disabled>0)return;
      u.cd=Math.max(0,u.cd-dt);u.healCd-=dt;u.axeCd-=dt;u.hitFlash=Math.max(0,(u.hitFlash||0)-dt);u.attackAnim=Math.max(0,u.attackAnim-dt);
      if(u.kind==='hero')u.skillCd-=dt;
      if(u.moveOrder){if(this.moveUnit(u,u.targetX,u.targetY,dt))u.moveOrder=0;return;}
      let e=this.getEnemy(u.targetId);
      if(e&&(e.air||!e.blockable||hypot(e,u.rally)>(u.kind==='hero'?115:105)||hypot(e,u)>135))e=null;
      if(!e){const candidates=this.targetsAt(u.rally.x,u.rally.y,u.kind==='hero'?100:87,e=>!e.air&&e.blockable);candidates.sort((a,b)=>hypot(u,a)-hypot(u,b));e=candidates.find(candidate=>this.units.filter(v=>v.hp>0&&v.id!==u.id&&v.targetId===candidate.id).length<(candidate.boss?4:3))||null;u.targetId=e?.id||null;}
      const healing=owner&&this.skill(owner,'healing_light');
      if(healing&&u.healCd<=0&&u.hp<u.maxHp*.8){const val=healing.val.healRange||[40*healing.rank,60*healing.rank];u.hp=Math.min(u.maxHp,u.hp+damageAvg(val));u.healCd=num(healing.val.cooldownSeconds,10);this.effect('heal',u.x,u.y,{radius:20,color:'#c9f19c'});}
      const axes=owner&&this.skill(owner,'throwing_axes');
      if((axes||u.ranged)&&u.axeCd<=0){const victim=this.targetsAt(u.x,u.y,axes?150:110).sort((a,b)=>hypot(u,a)-hypot(u,b))[0];if(victim){this.launch(u,victim,axes?damageAvg(axes.val.damage||[34,42]):u.damage,'axe','physical',{sourceId:owner?.id||null});u.axeCd=axes?num(axes.val.cooldownSeconds,3.5):1.5;}}
      if(e){
        u.lastCombat=this.time;const dist=hypot(u,e),reach=e.boss?e.radius+12:25;
        if(dist>reach){const desired=reach*.72;this.moveUnit(u,e.x+(u.x-e.x)/Math.max(1,dist)*desired,e.y+(u.y-e.y)/Math.max(1,dist)*desired,dt);}
        else if(u.cd<=0){
          u.cd+=Math.max(.35,u.interval);u.attackAnim=.23;
          const dodge=(this.data.enemies[e.defId].behaviors||[]).find(b=>['melee_dodge','dodge_melee'].includes(b.type||b.kind));
          const dodged=!e.root&&dodge&&this.rng()<num(dodge.probability,.3);
          if(dodged)this.effect('text',e.x,e.y-16,{text:'회피',color:'#d2d0ad',duration:.45});
          else {
            this.hit(e,u.damage,'physical',owner?.id||null);
            if(u.kind==='elemental')for(const nearby of this.targetsAt(e.x,e.y,42,v=>!v.air&&v!==e).slice(0,3))this.hit(nearby,u.damage,'physical',owner?.id);
            const holy=owner&&this.skill(owner,'holy_strike'),whirl=owner&&this.skill(owner,'whirlwind');
            for(const s of [holy,whirl])if(s&&this.rng()<num(s.val.chance,.1*s.rank)){for(const nearby of this.targetsAt(u.x,u.y,55,v=>!v.air))this.hit(nearby,damageAvg(s.val.damage||[25,45]),holy===s?'true':'physical',owner.id);this.effect('ring',u.x,u.y,{radius:55,color:holy===s?'#ffe5a0':'#c8d4e2'});}
          }
          this.effect('hit',e.x,e.y,{radius:10,color:u.kind==='hero'?'#b2e4ff':'#ffe4b0',duration:.18});
        }
        if(u.kind==='hero'&&u.skillCd<=0){for(const nearby of this.targetsAt(u.x,u.y,78,v=>!v.air))this.hit(nearby,25+u.level*4,'true');this.effect('ring',u.x,u.y,{radius:78,color:'#a3d9f5',duration:.55});u.skillCd=11;}
      }else {
        const off=u.kind==='soldier'?[-13,13,0][u.slot%3]:0;this.moveUnit(u,u.rally.x+off,u.rally.y+(u.slot===2?13:0),dt);
        if(this.time-num(u.lastCombat,-10)>3)u.hp=Math.min(u.maxHp,u.hp+u.maxHp*(u.kind==='hero'?.045:.03)*dt);
      }
    }
    behavior(e,name){return (this.data.enemies[e.defId].behaviors||[]).some(b=>typeof b==='string'?b.includes(name):String(b.type||b.kind||b.id||'').includes(name));}
    summon(e,id,count=3){
      if(!this.data.enemies[id]||this.enemies.length>220)return;
      for(let i=0;i<count;i++){const baby=this.spawn(id,e.pathIndex,Math.max(0,e.progress+(i-1)*17),{summoned:true,gold:0});if(baby)this.effect('spawn',baby.x,baby.y,{radius:19,color:'#abdf9b',duration:.5});}
    }
    tickEnemy(e,dt){
      if(e.dead)return;e.cd=Math.max(0,e.cd-dt);e.abilityCd-=dt;e.healCd-=dt;e.hitFlash=Math.max(0,e.hitFlash-dt);e.slow=Math.max(0,e.slow-dt);e.root=Math.max(0,e.root-dt);e.curse=Math.max(0,e.curse-dt);e.turbo=Math.max(0,(e.turbo||0)-dt);
      if(e.poison){const poison=e.poison,elapsed=Math.min(dt,poison.remaining);this.hit(e,poison.dps*elapsed,'true',poison.source,{dot:true});poison.remaining-=dt;if(poison.remaining<=0)e.poison=null;}
      if(e.wrath){const wrath=e.wrath,elapsed=Math.min(dt,wrath.remaining);this.hit(e,wrath.dps*elapsed,'physical',wrath.source,{dot:true});wrath.remaining-=dt;if(wrath.remaining<=0)e.wrath=null;}
      if(e.curse>0)this.hit(e,8*dt,'true',e.curseSource,{dot:true});
      if(e.dead)return;
      if(!e.transformed){
        if(['troll','troll_champion','troll_chieftain','forest_troll'].includes(e.defId)){const regen=e.defId==='forest_troll'?20:e.defId==='troll_chieftain'?14:7;e.hp=Math.min(e.maxHp,e.hp+regen*dt);}
        if((e.defId==='shaman'||this.behavior(e,'heal'))&&e.healCd<=0){for(const ally of this.targetsAt(e.x,e.y,150,v=>v!==e&&!v.boss)){ally.hp=Math.min(ally.maxHp,ally.hp+45);this.effect('heal',ally.x,ally.y,{radius:15,color:'#bce892'});}e.healCd=8;}
        if(e.abilityCd<=0){
          if(e.defId==='necromancer'){this.summon(e,'skeleton',3);e.abilityCd=9;}
          else if(['spider_matriarch','matriarch'].includes(e.defId)&&num(e.summons)<3){this.summon(e,'spider_hatchling',3);e.summons=num(e.summons)+1;e.abilityCd=9;}
          else if(e.defId==='demon_lord'){for(const ally of this.targetsAt(e.x,e.y,145,v=>!v.boss&&v!==e).slice(0,5)){ally.shield=4;this.effect('ring',ally.x,ally.y,{radius:18,color:'#c382e5'});}e.abilityCd=8;}
          else if(e.defId==='troll_chieftain'){for(const ally of this.targetsAt(e.x,e.y,140,v=>v.defId.includes('troll'))){ally.enrage=6;ally.hp=Math.min(ally.maxHp,ally.hp+50);}this.effect('ring',e.x,e.y,{radius:100,color:'#9ccbd8'});e.abilityCd=10;}
          else if(e.defId==='juggernaut'){this.summon(e,this.data.enemies.golem_head?'golem_head':'goblin',3);this.effect('blast',e.x,e.y,{radius:75,color:'#e9ab66'});e.abilityCd=10;}
          else if(e.defId==='jt'){const towers=this.towers.filter(t=>hypot(t,e)<250).sort((a,b)=>hypot(a,e)-hypot(b,e));for(const t of towers.slice(0,2)){t.disabled=6;this.effect('ring',t.x,t.y,{radius:35,color:'#a6e9fa',duration:1});}e.abilityCd=10;}
          else if(e.defId==='veznan'){const towers=this.towers.filter(t=>hypot(t,e)<270).sort((a,b)=>hypot(a,e)-hypot(b,e));for(const t of towers.slice(0,e.phase===2?2:1)){t.disabled=5;this.effect('lightning',e.x,e.y,{x2:t.x,y2:t.y,color:'#e19af7',duration:.8});}if(e.phase===1)this.summon(e,'demon_spawn',2);e.abilityCd=e.phase===2?8:12;}
          else e.abilityCd=7;
        }
      }
      e.enrage=Math.max(0,(e.enrage||0)-dt);
      let blockers=[];
      if(e.blockable)blockers=this.units.filter(u=>u.hp>0&&!u.expired&&!u.moveOrder&&u.targetId===e.id&&hypot(u,e)<(e.boss?e.radius+18:32));
      let victim=blockers[0];
      if(!victim&&!e.transformed&&['shadow_archer','troll_champion','necromancer'].includes(e.defId))victim=this.units.filter(u=>u.hp>0&&!u.expired&&hypot(u,e)<110).sort((a,b)=>hypot(e,a)-hypot(e,b))[0];
      if(victim&&!e.transformed){
        if(e.cd<=0){e.cd+=Math.max(.3,e.attackTime);const raw=e.damage*(e.enrage>0?1.7:1);this.hurtUnit(victim,raw);e.attackAnim=.25;
          if(e.boss||e.defId==='ogre'||e.defId==='yeti'||e.defId==='forest_troll')for(const u of this.units)if(u!==victim&&u.hp>0&&hypot(victim,u)<40)this.hurtUnit(u,raw*.7);
          if(!blockers.length)this.effect('lightning',e.x,e.y-8,{x2:victim.x,y2:victim.y,color:'#e0a677',duration:.12});
        }
      }else if(e.root<=0){
        const movement=e.speed*(e.slow>0?.55:1)*(e.turbo>0?2.1:1)*(e.enrage>0?1.3:1);e.progress+=movement*dt;
        if(e.progress>=this.paths[e.pathIndex].length){e.dead=true;e.escaped=true;this.stats.leaks+=e.lifeCost;if(!this.invincible)this.lives=Math.max(0,this.lives-e.lifeCost);this.effect('text',920,315,{text:`−${e.lifeCost} ♥`,color:'#f18d87',duration:1});return;}
        const pos=this.pathPosition(e.pathIndex,e.progress),lane=((e.id%5)-2)*3;e.x=pos.x-pos.dy*lane;e.y=pos.y+pos.dx*lane;e.dx=pos.dx;e.dy=pos.dy;
      }
      e.attackAnim=Math.max(0,(e.attackAnim||0)-dt);
    }
    tickProjectile(p,dt){
      p.age+=dt;const target=this.getEnemy(p.targetId);
      if(p.kind!=='shell'&&target){p.tx=target.x;p.ty=target.y;}
      const f=clamp(p.age/p.duration,0,1);p.x=p.startX+(p.tx-p.startX)*f;p.y=p.startY+(p.ty-p.startY)*f-(p.kind==='shell'?Math.sin(f*Math.PI)*65:0);
      if(f<1)return;p.done=true;
      if(p.splash){
        if(p.kind==='missile'&&!target){const alternate=this.targetsAt(p.tx,p.ty,100).sort((a,b)=>d2(p,a)-d2(p,b))[0];if(alternate){p.tx=alternate.x;p.ty=alternate.y;}}
        for(const e of this.targetsAt(p.tx,p.ty,p.splash,e=>p.affectAir||!e.air))this.hit(e,p.damage,p.type,p.sourceId);
        this.effect('blast',p.tx,p.ty,{radius:p.splash,color:p.kind==='missile'?'#fc9b50':'#e5bd83',duration:.4});
      }else if(target){
        this.hit(target,p.damage,p.type,p.sourceId);
        if(!target.dead&&p.poison&&!(this.data.enemies[target.defId].behaviors||[]).some(b=>(b.type||b.kind)==='immunity'&&b.effect==='poison_arrows'))target.poison={...p.poison,source:p.sourceId};
        if(!target.dead&&p.curse){target.curse=5;target.curseSource=p.sourceId;}
        this.effect('hit',target.x,target.y,{radius:p.kind==='bolt'?15:7,color:p.kind==='bolt'?'#b6a6f1':'#e9d5b1',duration:.16});
      }
    }
    tapEnemy(id){const e=this.getEnemy(id);if(this.state!=='playing'||!e||!e.transformed)return fail('변이된 적만 직접 공격할 수 있습니다.');this.hit(e,e.maxHp/3+.01,'true');this.effect('hit',e.x,e.y,{radius:16,color:'#fff0bd',duration:.25});return ok('변이된 적 공격');}
    finish(won){
      this.state=won?'won':'lost';this.canCallWave=false;
      const stars=won?(this.mode==='campaign'?(this.lives>=this.maxLives*.9?3:this.lives>=this.maxLives*.3?2:1):1):0;
      this.result={won,stars,lives:this.lives,kills:this.stats.kills,duration:this.time,gold:Math.floor(this.gold),cheated:this.stats.cheated};
      this.notify(won?'전장을 지켜냈습니다!':'방어선이 무너졌습니다. 다시 도전하세요.');
    }
    update(dt){
      if(this.state!=='playing'||!Number.isFinite(dt)||dt<=0)return;
      // Subdivide external large steps to keep collision and cooldown behavior stable.
      if(dt>.05){let left=Math.min(dt,1);while(left>0&&this.state==='playing'){const step=Math.min(left,1/60);this.update(step);left-=step;}return;}
      this.time+=dt;this.stats.duration=this.time;this.callLock=Math.max(0,this.callLock-dt);
      this.canCallWave=this.wave<this.totalWaves&&this.callLock<=0;
      for(const s of Object.values(this.spells))s.remaining=Math.max(0,s.remaining-dt);
      for(const e of this.effects)e.age+=dt;this.effects=this.effects.filter(e=>e.age<e.duration);
      const pending=this.pending;this.pending=[];
      for(const event of pending){
        if(event.time>this.time){this.pending.push(event);continue;}
        if(event.type==='spawn')this.spawn(event.enemyId,event.pathIndex,0);
        else if(event.type==='meteor'||event.type==='explosion'){
          for(const e of this.targetsAt(event.x,event.y,event.radius,v=>!v.air))this.hit(e,event.damage,event.type==='meteor'?'true':'explosive',event.source);
          this.effect('blast',event.x,event.y,{radius:event.radius,color:event.type==='meteor'?'#fb9855':'#e9bb80',duration:.65});
        }
      }
      for(const t of this.towers)this.tickTower(t,dt);
      for(const u of this.units)this.tickUnit(u,dt);
      // Snapshot length: new summons begin acting on the following fixed step.
      const enemyCount=this.enemies.length;for(let i=0;i<enemyCount;i++)this.tickEnemy(this.enemies[i],dt);
      for(const p of this.projectiles)this.tickProjectile(p,dt);
      this.enemies=this.enemies.filter(e=>!e.dead);this.projectiles=this.projectiles.filter(p=>!p.done);this.units=this.units.filter(u=>!u.expired&&!(u.kind==='reinforcement'&&u.hp<=0));
      if(this.lives<=0){this.finish(false);return;}
      const pendingSpawn=this.pending.some(p=>p.type==='spawn'),empty=this.enemies.length===0&&!pendingSpawn;
      if(empty&&this.wave>=this.totalWaves){
        if(this.stage.bossAfterWaves&&this.stage.bossId&&!this.bossSpawned&&this.mode==='campaign'&&this.data.enemies[this.stage.bossId])this.spawn(this.stage.bossId,0,0);
        else this.finish(true);
        return;
      }
      if(this.wave<this.totalWaves){
        this.nextWaveIn=Math.max(0,this.nextWaveIn-dt);
        if(empty)this.nextWaveIn=Math.min(this.nextWaveIn,3);
        if(this.nextWaveIn<=0&&this.callLock<=0)this.callWave();
      }else this.nextWaveIn=0;
    }
  }
  G.KRWorld=KRWorld;
  if(typeof module!=='undefined'&&module.exports)module.exports={KRWorld};
})(typeof globalThis!=='undefined'?globalThis:window);
