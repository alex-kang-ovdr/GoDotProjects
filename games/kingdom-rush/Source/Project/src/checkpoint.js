/* v18 battle checkpoints. No DOM/storage dependency; only explicit engine state is restored. */
(function (G) {
  'use strict';
  const VERSION=18, FORMAT='kingdom-rush-battle';
  // Definitions remain constant during a battle. Cache only on capture, per world;
  // loading/describing a save always checks freshly hashed data, even for the same object.
  const captureFingerprints=new WeakMap();
  const LIMITS=Object.freeze({characters:2000000,nodes:180000,depth:16,towers:128,facilities:32,enemies:4096,units:512,projectiles:8192,pending:12000,effects:300,events:32});
  const TREES=['archer','barracks','mage','artillery','meteor','reinforcements'];
  const TYPES=['physical','magic','magical','explosive','true'];
  const RUNTIME_FIELDS=['seed','serial','state','time','wave','totalWaves','maxLives','lives','gold','nextWaveIn','callLock','canCallWave','bossSpawned','invincible','unlimitedGold','_autoWait','_activeEmpty','battleStartedAt','heroEnabled'];
  const TOWER_FIELDS='id siteIndex defId x y cd skills skillCds rally invested disabled slots damage kills targetMode shots preplaced attackAnim'.split(' ');
  const FACILITY_FIELDS='id siteIndex type x y restored workers cd cooldown rally damage kills shots invested disabled'.split(' ');
  const UNIT_FIELDS='id kind ownerId x y hp maxHp targetX targetY rally damage interval armor resist speed cd healCd axeCd deadUntil targetId moveOrder attackAnim slot respawn towerDefId level xp name skillCd disabled expiresAt expired ranged rangedDamage rangedInterval rangedRange rangedMinRange rangedDamageType rangedKind regenerationPerSecond regenerationDelay autoRespawn hitFlash lastCombat'.split(' ');
  const ENEMY_FIELDS='id defId x y dx dy pathIndex progress hp maxHp hpEvidence armor resist speed air boss blockable damage damageType attackTime cd abilityCd healCd gold lifeCost radius dead root slow curse poison wrath teleports phase shield regenAccumulator hitFlash turbo enrage frozen stunned phaseMaxHp eggPeriod sourceWave sourceEntryLabel sourceEventId routingStatus summoned summonerId summons transformed sheep turboUsed turboMultiplier enrageArmor enrageDamage enrageSpeed slowMultiplier curseAccumulator curseInterval cursePulse curseSource wrathUses attackAnim escaped'.split(' ');
  const PROJECTILE_FIELDS='id x y startX startY tx ty targetId sourceId targetUnitId enemyId hostile damage kind type age duration splash poison curse mageHit affectAir done'.split(' ');
  const EFFECT_FIELDS='kind x y age duration radius color text x2 y2 originX originY'.split(' ');
  const PENDING_FIELDS='time type enemyId pathIndex wave sourceEntryLabel routingStatus x y damage radius damageType source'.split(' ');
  const EVENT_FIELDS='id nameKo enabled status nextAt remaining count occurrences routeIndex warningIssued routingStatus'.split(' ');
  const STAT_FIELDS='kills damage leaks spent cheated duration goldEarned killsByEnemy damageByType unitLosses enemyRangedAttacks spellCasts waves facilityHires sunrayShots stageEventSpawns escapedEnemies lifeLoss leaksByEnemy lifeLossByEnemy retiredTowers'.split(' ');
  const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>own(o,k)&&o[k]!==undefined).map(k=>[k,o[k]]));
  function error(code,message,path){const e=new Error(`${message}${path?` (${path})`:''}`);e.name='KRCheckpointError';e.code=code;throw e;}
  function requireThat(condition,path,message='저장된 전투 데이터가 올바르지 않습니다.'){if(!condition)error('CHECKPOINT_INVALID',message,path);}
  function plain(value,path){requireThat(value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null),path);return value;}

  // Check the entire input before any engine state is assigned. This bounds both work and memory,
  // rejects getters/cycles/prototype keys, and never returns an alias into the caller's payload.
  function inputCopy(payload){
    if(typeof payload==='string'){
      if(payload.length>LIMITS.characters)error('CHECKPOINT_TOO_LARGE','전투 저장 파일이 허용 크기를 초과했습니다.');
      try{payload=JSON.parse(payload);}catch(e){error('CHECKPOINT_INVALID','전투 저장 파일을 읽을 수 없습니다.');}
    }
    let nodes=0,characters=0;const ancestors=new Set();
    const walk=(v,path,depth)=>{
      if(++nodes>LIMITS.nodes||depth>LIMITS.depth)error('CHECKPOINT_TOO_LARGE','전투 저장 파일의 구조가 너무 큽니다.',path);
      if(v===null||typeof v==='boolean')return v;
      if(typeof v==='number'){requireThat(Number.isFinite(v),path,'유한하지 않은 수치가 저장되어 있습니다.');return v;}
      if(typeof v==='string'){characters+=v.length;requireThat(v.length<=4000,path);if(characters>LIMITS.characters)error('CHECKPOINT_TOO_LARGE','전투 저장 파일이 허용 크기를 초과했습니다.');return v;}
      requireThat(typeof v==='object',path);requireThat(!ancestors.has(v),path,'순환 참조가 포함된 저장 데이터입니다.');ancestors.add(v);
      let out;
      if(Array.isArray(v)){
        if(v.length>LIMITS.pending)error('CHECKPOINT_TOO_LARGE','저장된 전투 항목 수가 너무 많습니다.',path);
        out=[];for(let i=0;i<v.length;i++){requireThat(own(v,i),`${path}[${i}]`);const descriptor=Object.getOwnPropertyDescriptor(v,String(i));requireThat(!!descriptor&&own(descriptor,'value'),`${path}[${i}]`);out.push(walk(descriptor.value,`${path}[${i}]`,depth+1));}
      }else{
        plain(v,path);out={};const keys=Object.keys(v);requireThat(keys.length<=256,path);
        for(const k of keys){requireThat(!['__proto__','prototype','constructor'].includes(k)&&k.length<=120,`${path}.${k}`);const descriptor=Object.getOwnPropertyDescriptor(v,k);requireThat(!!descriptor&&own(descriptor,'value'),`${path}.${k}`);characters+=k.length;out[k]=walk(descriptor.value,`${path}.${k}`,depth+1);}
      }
      ancestors.delete(v);return out;
    };
    const copied=walk(payload,'save',0);
    if(JSON.stringify(copied).length>LIMITS.characters)error('CHECKPOINT_TOO_LARGE','전투 저장 파일이 허용 크기를 초과했습니다.');
    return copied;
  }

  const number=(min=-1e12,max=1e12)=>(v,p)=>{requireThat(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max,p);return v;};
  const integer=(min=0,max=Number.MAX_SAFE_INTEGER)=>(v,p)=>{number(min,max)(v,p);requireThat(Number.isSafeInteger(v),p);return v;};
  const boolean=(v,p)=>{requireThat(typeof v==='boolean',p);return v;};
  const string=(max=200)=>(v,p)=>{requireThat(typeof v==='string'&&v.length<=max,p);return v;};
  const oneOf=(values)=>(v,p)=>{requireThat(values.includes(v),p);return v;};
  const nullable=validator=>(v,p)=>v===null?null:validator(v,p);
  const n=number(),positive=number(0),id=integer(1),maybeId=nullable(id),coord=number(-20000,20000),time=number(0,1e7);
  function record(v,p,schema,required=[]){plain(v,p);for(const key of Object.keys(v))requireThat(own(schema,key),`${p}.${key}`,'지원하지 않는 저장 필드가 있습니다.');for(const key of required)requireThat(own(v,key),`${p}.${key}`,'필수 저장 항목이 없습니다.');const out={};for(const key of Object.keys(v))out[key]=schema[key](v[key],`${p}.${key}`);return out;}
  const array=(validator,max)=>(v,p)=>{requireThat(Array.isArray(v)&&v.length<=max,p);return v.map((x,i)=>validator(x,`${p}[${i}]`));};
  const point=(v,p)=>record(v,p,{x:coord,y:coord,dx:number(-1,1),dy:number(-1,1)},['x','y']);
  const timer=(v,p)=>{if(v&&typeof v==='object'){record(v,p,{$number:oneOf(['Infinity'])},['$number']);return Infinity;}return time(v,p);};
  const damageType=oneOf(TYPES);
  const poison=(v,p)=>record(v,p,{dps:positive,remaining:n,source:maybeId},['dps','remaining']);
  const wrath=(v,p)=>v===null||v===0?v:poison(v,p);
  const textOrNull=nullable(string());
  const scalarSchema=(fields,overrides={})=>Object.fromEntries(fields.map(k=>[k,overrides[k]||n]));
  function map(v,p,keyCheck,valueCheck,max=128){plain(v,p);const keys=Object.keys(v);requireThat(keys.length<=max,p);const out={};for(const key of keys){requireThat(keyCheck(key),`${p}.${key}`);out[key]=valueCheck(v[key],`${p}.${key}`);}return out;}
  function canonical(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;return `{${Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;}
  function fingerprint(data){
    requireThat(data&&Array.isArray(data.stages)&&data.towers&&data.enemies&&data.abilities,'data','게임 구성 데이터를 읽을 수 없습니다.');
    const stageKeys='id order paths sites waves modes originalModes startingGold bossId bossAfterWaves unlockEvents availableTowerIdsAtStart referencePaths referenceSites'.split(' ');
    const snapshot={version:data.version,stages:data.stages.map(s=>({...pick(s,stageKeys),referenceGeometry:pick(s.referenceGeometry||{},['pathSpecs','terrainFeatures'])})),towers:data.towers,enemies:data.enemies,abilities:data.abilities,starUpgrades:data.starUpgrades,specialComponents:data.specialComponents};
    const text=canonical(snapshot);let a=0x811c9dc5,b=0x9e3779b9;
    for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,0x01000193);b=Math.imul(b^c,0x85ebca6b);b=b^b>>>13;}
    // A compatibility checksum, not a security signature or a source-fidelity claim.
    return `kr18:${text.length}:${(a>>>0).toString(16).padStart(8,'0')}${(b>>>0).toString(16).padStart(8,'0')}`;
  }
  function encodeUnit(unit){const out=pick(unit,UNIT_FIELDS);for(const k of ['respawn','deadUntil'])if(out[k]===Infinity)out[k]={$number:'Infinity'};return out;}
  function captureFingerprint(world){let cached=captureFingerprints.get(world);if(!cached||cached.data!==world.data||cached.version!==world.data.version){cached={data:world.data,version:world.data.version,value:fingerprint(world.data)};captureFingerprints.set(world,cached);}return cached.value;}
  function capture(world){
    requireThat(world&&world.data&&world.stage&&typeof world.isActive==='function','world','진행 중인 전투가 없습니다.');
    if(!world.isActive())error('CHECKPOINT_TERMINAL','종료된 전투는 이어하기 대상으로 저장할 수 없습니다.');
    requireThat(!world.heroEnabled||world.units.includes(world.hero),'world.hero','영웅의 전투 개체 참조가 올바르지 않습니다.');
    const runtime={...pick(world,RUNTIME_FIELDS),availableTowerIds:[...world.availableTowerIds],heroId:world.hero.id,inactiveHero:world.heroEnabled?null:encodeUnit(world.hero),
      towers:world.towers.map(t=>pick(t,TOWER_FIELDS)),facilities:world.facilities.map(f=>pick(f,FACILITY_FIELDS)),enemies:world.enemies.map(e=>pick(e,ENEMY_FIELDS)),units:world.units.map(encodeUnit),projectiles:world.projectiles.map(p=>pick(p,PROJECTILE_FIELDS)),effects:world.effects.map(e=>pick(e,EFFECT_FIELDS)),pending:world.pending.map(e=>pick(e,PENDING_FIELDS)),
      spells:world.spells,stats:pick(world.stats,STAT_FIELDS),notifications:world.notifications,stageEventState:world.stageEventState.map(e=>pick(e,EVENT_FIELDS)),eventLog:world.eventLog,
      eventRoutes:world.paths.slice(world.stage.paths.length).map((p,i)=>({eventId:p.eventId,index:world.stage.paths.length+i}))};
    const payload={format:FORMAT,version:VERSION,dataFingerprint:captureFingerprint(world),capturedAt:Date.now(),stageId:world.stage.id,options:{mode:world.mode,difficulty:world.difficulty,ruleset:world.ruleset,layout:world.layoutRequested,upgrades:{...world.permanent}},runtime};
    // Validation here prevents overwriting a good save with an unsupported/corrupt live state.
    const clean=inputCopy(payload);validate(world.data,clean,payload.dataFingerprint);return clean;
  }

  function validate(data,payload,knownFingerprint){
    plain(payload,'save');
    if(payload.format!==FORMAT)error('CHECKPOINT_FORMAT','이 파일은 전투 이어하기 저장 파일이 아닙니다.');
    if(payload.version!==VERSION)error('CHECKPOINT_VERSION','이 전투 저장 파일은 다른 게임 버전에서 만들어졌습니다.');
    record(payload,'save',{format:oneOf([FORMAT]),version:oneOf([VERSION]),dataFingerprint:string(100),capturedAt:integer(0,8640000000000000),stageId:string(80),options:v=>v,runtime:v=>v},['format','version','dataFingerprint','capturedAt','stageId','options','runtime']);
    if(payload.dataFingerprint!==(knownFingerprint||fingerprint(data)))error('CHECKPOINT_DATA_MISMATCH','게임 구성 데이터가 변경되어 이 전투를 이어할 수 없습니다.');
    const stage=data.stages.find(s=>s.id===payload.stageId);requireThat(!!stage,'stageId','저장된 전장을 찾을 수 없습니다.');
    const upgrades=(v,p)=>record(v,p,Object.fromEntries(TREES.map(k=>[k,integer(0,5)])),TREES);
    const options=record(payload.options,'options',{mode:oneOf(['campaign','heroic','iron']),difficulty:oneOf(['casual','normal','veteran']),ruleset:oneOf(['assisted','reference']),layout:oneOf(['authored','reconstructed']),upgrades},['mode','difficulty','ruleset','layout','upgrades']);
    requireThat(Array.isArray(stage.waves?.[options.mode])&&stage.waves[options.mode].length>0,'options.mode');
    requireThat(typeof G.KRWorld==='function','engine','전투 엔진을 불러오지 못했습니다.');
    const world=new G.KRWorld(data,payload.stageId,{...options,seed:1});
    requireThat(TREES.every(k=>options.upgrades[k]===world.permanent[k]),'options.upgrades','이 규칙에서 사용할 수 없는 영구 강화 수치입니다.');
    const validTower=k=>own(data.towers,k),validEnemy=k=>own(data.enemies,k),validSkill=k=>own(data.abilities,k);
    const defId=(valid)=>(v,p)=>{string(80)(v,p);requireThat(valid(v),p,'알 수 없는 구성요소 ID가 저장되어 있습니다.');return v;};
    const eventDefs=new Map(world.stageEventState.map(e=>[e.id,e.definition]));
    const tower=(v,p)=>record(v,p,scalarSchema(TOWER_FIELDS,{id,siteIndex:integer(0,stage.sites.length+100),defId:defId(validTower),x:coord,y:coord,skills:(v,p)=>map(v,p,validSkill,integer(1,5)),skillCds:(v,p)=>map(v,p,validSkill,n),rally:point,invested:positive,disabled:positive,slots:array(id,64),damage:positive,kills:integer(),targetMode:oneOf(['first','strongest','closest','air']),shots:integer(),preplaced:boolean}),TOWER_FIELDS.filter(k=>!['preplaced','attackAnim'].includes(k)));
    const facility=(v,p)=>record(v,p,scalarSchema(FACILITY_FIELDS,{id,siteIndex:integer(0,1000),type:defId(k=>own(data.specialComponents?.facilities||{},k)),x:coord,y:coord,restored:boolean,workers:integer(0,100),cd:positive,cooldown:positive,rally:point,damage:positive,kills:integer(),shots:integer(),invested:positive,disabled:positive}),FACILITY_FIELDS);
    const unit=(v,p)=>record(v,p,scalarSchema(UNIT_FIELDS,{id,kind:oneOf(['hero','soldier','elemental','reinforcement','elf']),ownerId:maybeId,x:coord,y:coord,hp:positive,maxHp:number(.001,1e9),targetX:coord,targetY:coord,rally:point,damage:positive,interval:number(.001,1e6),armor:number(0,1),resist:number(0,1),speed:number(0,1e5),deadUntil:timer,targetId:maybeId,moveOrder:integer(0,1),slot:integer(0,100),respawn:timer,towerDefId:defId(validTower),level:integer(1,10),xp:positive,name:string(80),disabled:boolean,expiresAt:time,expired:boolean,ranged:boolean,rangedDamage:positive,rangedInterval:number(.001,1e6),rangedRange:positive,rangedMinRange:positive,rangedDamageType:damageType,rangedKind:oneOf(['arrow','axe','bolt']),regenerationPerSecond:positive,regenerationDelay:positive,autoRespawn:boolean,lastCombat:time}),['id','kind','ownerId','x','y','hp','maxHp','targetX','targetY','rally','damage','interval','armor','speed','cd','healCd','axeCd','deadUntil','targetId','moveOrder','attackAnim']);
    const enemy=(v,p)=>record(v,p,scalarSchema(ENEMY_FIELDS,{id,defId:defId(validEnemy),x:coord,y:coord,dx:number(-1,1),dy:number(-1,1),pathIndex:integer(0,1000),progress:positive,maxHp:number(.001,1e9),hpEvidence:oneOf(['custom_difficulty_fallback','source_candidate']),armor:number(0,1),resist:number(0,1),speed:number(0,1e5),air:boolean,boss:boolean,blockable:boolean,damage:positive,damageType,attackTime:number(.001,1e6),gold:positive,lifeCost:positive,radius:number(.001,1000),dead:boolean,poison:nullable(poison),wrath,teleports:integer(),phase:integer(1,2),shield:integer(),phaseMaxHp:number(.001,1e9),sourceWave:nullable(integer(1,world.totalWaves)),sourceEntryLabel:textOrNull,sourceEventId:defId(k=>eventDefs.has(k)),routingStatus:string(),summoned:boolean,summonerId:id,summons:integer(),transformed:boolean,sheep:boolean,turboUsed:boolean,curseSource:maybeId,wrathUses:integer(),escaped:boolean}),['id','defId','x','y','dx','dy','pathIndex','progress','hp','maxHp','hpEvidence','armor','resist','speed','air','boss','blockable','damage','damageType','attackTime','cd','abilityCd','healCd','gold','lifeCost','radius','dead','root','slow','curse','poison','wrath','teleports','phase','shield','regenAccumulator','hitFlash','turbo','enrage','frozen','stunned','phaseMaxHp']);
    const projectile=(v,p)=>record(v,p,scalarSchema(PROJECTILE_FIELDS,{id,x:coord,y:coord,startX:coord,startY:coord,tx:coord,ty:coord,targetId:maybeId,sourceId:maybeId,targetUnitId:id,enemyId:id,hostile:boolean,damage:positive,kind:oneOf(['arrow','bolt','shell','missile','axe']),type:damageType,age:positive,duration:number(.001,1e5),splash:positive,poison:nullable(poison),curse:boolean,mageHit:boolean,affectAir:boolean,done:boolean}),['id','x','y','startX','startY','tx','ty','damage','kind','type','age','duration']);
    const effect=(v,p)=>record(v,p,scalarSchema(EFFECT_FIELDS,{kind:oneOf(['upgrade','spawn','ring','sunray','event_spawn','meteor','text','blast','death','hit','lightning','heal','roots','teleport']),x:coord,y:coord,age:positive,duration:number(.001,1e5),radius:positive,color:string(50),text:string(200),x2:coord,y2:coord,originX:coord,originY:coord}),['kind','x','y','age','duration']);
    const pending=(v,p)=>record(v,p,scalarSchema(PENDING_FIELDS,{time,type:oneOf(['spawn','meteor','explosion','burn']),enemyId:defId(validEnemy),pathIndex:integer(0,1000),wave:integer(1,world.totalWaves),sourceEntryLabel:textOrNull,routingStatus:string(),x:coord,y:coord,damage:positive,radius:positive,damageType,source:maybeId}),['time','type']);
    const stageEvent=(v,p)=>record(v,p,scalarSchema(EVENT_FIELDS,{id:defId(k=>eventDefs.has(k)),nameKo:string(100),enabled:boolean,status:oneOf(['waiting','armed']),nextAt:nullable(time),remaining:nullable(time),count:integer(),occurrences:integer(),routeIndex:nullable(integer(0,1000)),warningIssued:boolean,routingStatus:string()}),EVENT_FIELDS.filter(k=>k!=='routingStatus'));
    const waveStat=(v,p)=>record(v,p,{number:integer(1,world.totalWaves),time,inventory:integer(0,12000),goldAtCall:positive,earlyBonus:positive},['number','time','inventory','goldAtCall','earlyBonus']);
    const retiredTower=(v,p)=>record(v,p,{id,defId:defId(validTower),nameKo:string(100),kind:oneOf(['tower']),sold:oneOf([true]),damage:positive,kills:integer(),invested:positive},['id','defId','nameKo','kind','sold','damage','kills','invested']);
    const stats=(v,p)=>record(v,p,scalarSchema(STAT_FIELDS,{kills:integer(),damage:positive,leaks:positive,spent:positive,duration:time,goldEarned:positive,cheated:boolean,killsByEnemy:(v,p)=>map(v,p,validEnemy,integer()),damageByType:(v,p)=>map(v,p,k=>TYPES.includes(k),positive),spellCasts:(v,p)=>map(v,p,k=>['reinforcements','meteor'].includes(k),integer()),waves:array(waveStat,world.totalWaves),unitLosses:integer(),enemyRangedAttacks:integer(),facilityHires:integer(),sunrayShots:integer(),stageEventSpawns:integer(),escapedEnemies:integer(),lifeLoss:positive,leaksByEnemy:(v,p)=>map(v,p,validEnemy,integer()),lifeLossByEnemy:(v,p)=>map(v,p,validEnemy,positive),retiredTowers:array(retiredTower,4096)}),STAT_FIELDS);
    const spell=(v,p)=>record(v,p,{remaining:positive,total:number(.001,1e5)},['remaining','total']);
    const eventLog=(v,p)=>record(v,p,{id,time,eventId:defId(k=>eventDefs.has(k)),label:string(100),enemyId:defId(validEnemy),count:integer(),x:coord,y:coord,routingStatus:string()},['id','time','eventId','label','enemyId','count','x','y','routingStatus']);
    const runtimeSchema={...scalarSchema(RUNTIME_FIELDS,{seed:integer(),serial:integer(1,1e9),state:oneOf(['ready','playing']),time,wave:integer(0,world.totalWaves),totalWaves:oneOf([world.totalWaves]),maxLives:oneOf([world.maxLives]),lives:number(0,world.maxLives),gold:positive,nextWaveIn:positive,callLock:positive,canCallWave:boolean,bossSpawned:boolean,invincible:boolean,unlimitedGold:boolean,_autoWait:positive,_activeEmpty:positive,battleStartedAt:nullable(time),heroEnabled:oneOf([world.heroEnabled])}),availableTowerIds:array(defId(validTower),Object.keys(data.towers).length),heroId:id,inactiveHero:nullable(unit),towers:array(tower,LIMITS.towers),facilities:array(facility,LIMITS.facilities),enemies:array(enemy,LIMITS.enemies),units:array(unit,LIMITS.units),projectiles:array(projectile,LIMITS.projectiles),effects:array(effect,LIMITS.effects),pending:array(pending,LIMITS.pending),spells:(v,p)=>record(v,p,{reinforcements:spell,meteor:spell},['reinforcements','meteor']),stats,notifications:array(string(300),8),stageEventState:array(stageEvent,LIMITS.events),eventLog:array(eventLog,24),eventRoutes:array((v,p)=>record(v,p,{eventId:defId(k=>eventDefs.has(k)),index:integer(0,1000)},['eventId','index']),LIMITS.events)};
    const rt=record(payload.runtime,'runtime',runtimeSchema,Object.keys(runtimeSchema));
    requireThat(rt.lives>0&&((rt.state==='ready'&&rt.wave===0&&rt.battleStartedAt===null)||(rt.state==='playing'&&rt.wave>0&&rt.battleStartedAt!==null)),'runtime.state');
    requireThat(rt.battleStartedAt===null||rt.battleStartedAt<=rt.time,'runtime.battleStartedAt');
    requireThat(new Set(rt.availableTowerIds).size===rt.availableTowerIds.length,'runtime.availableTowerIds');
    requireThat(rt.stageEventState.length===eventDefs.size&&new Set(rt.stageEventState.map(e=>e.id)).size===eventDefs.size,'runtime.stageEventState');
    const eventStates=new Map(rt.stageEventState.map(e=>[e.id,e]));
    const eventRoutes=new Set();
    for(const route of rt.eventRoutes){requireThat(!eventRoutes.has(route.eventId)&&route.index===world.paths.length,'runtime.eventRoutes');eventRoutes.add(route.eventId);const state=world.stageEventState.find(e=>e.id===route.eventId);const actual=world.eventPath(state);requireThat(actual===route.index&&world.paths[actual]?.eventOnly===true,'runtime.eventRoutes');}
    for(const s of rt.stageEventState){
      requireThat((rt.state==='ready'&&s.status==='waiting'&&s.nextAt===null)||(rt.state==='playing'&&s.status==='armed'&&s.nextAt!==null),'runtime.stageEventState.status');
      if(s.routeIndex!==null){requireThat(s.routeIndex<world.paths.length,'runtime.stageEventState.routeIndex');const path=world.paths[s.routeIndex];requireThat(!path.eventOnly||path.eventId===s.id,'runtime.stageEventState.routeIndex');if(world.layout==='reconstructed'&&s.occurrences>0)requireThat(eventRoutes.has(s.id),'runtime.eventRoutes');}
      else requireThat(s.occurrences===0,'runtime.stageEventState.routeIndex');
    }
    const ids=new Map();
    function register(entity,kind){requireThat(entity.id<=rt.serial&&!ids.has(entity.id),`runtime.${kind}.id`,'중복되거나 잘못된 개체 ID가 있습니다.');ids.set(entity.id,kind);}
    for(const [kind,items] of [['tower',rt.towers],['facility',rt.facilities],['enemy',rt.enemies],['unit',rt.units],['projectile',rt.projectiles],['eventLog',rt.eventLog]])for(const e of items)register(e,kind);
    if(rt.inactiveHero)register(rt.inactiveHero,'inactiveHero');
    for(const retired of rt.stats.retiredTowers||[])register(retired,'tower');
    const historical=(value,path,kinds)=>{if(value===null||value===undefined)return;requireThat(value<=rt.serial,path,'존재할 수 없는 개체 참조가 있습니다.');if(ids.has(value)&&kinds)requireThat(kinds.includes(ids.get(value)),path,'개체 참조 유형이 올바르지 않습니다.');};
    const owners=new Map([...rt.towers,...rt.facilities].map(t=>[t.id,t]));
    const occupiedSites=new Set();
    for(const t of rt.towers){
      const site=world.stage.sites[t.siteIndex],def=data.towers[t.defId];requireThat(!!site&&!occupiedSites.has(t.siteIndex)&&site.x===t.x&&site.y===t.y,'runtime.towers.siteIndex');occupiedSites.add(t.siteIndex);
      for(const skillId of Object.keys(t.skills))requireThat(def.abilities?.includes(skillId)&&t.skills[skillId]<=data.abilities[skillId].maxLevel,'runtime.towers.skills');
      for(const skillId of Object.keys(t.skillCds))requireThat(own(t.skills,skillId),'runtime.towers.skillCds');
      for(const slot of t.slots)historical(slot,'runtime.towers.slots',['unit']);
    }
    requireThat(rt.facilities.length===world.facilities.length,'runtime.facilities');
    for(const f of rt.facilities){const expected=world.facilities.find(e=>e.siteIndex===f.siteIndex&&e.type===f.type);requireThat(expected&&expected.x===f.x&&expected.y===f.y&&!occupiedSites.has(f.siteIndex),'runtime.facilities.siteIndex');occupiedSites.add(f.siteIndex);const def=data.specialComponents.facilities[f.type].runtime;requireThat(f.workers<=Number(def.maxWorkers||0),'runtime.facilities.workers');}
    let hero=rt.heroEnabled?rt.units.find(u=>u.id===rt.heroId):rt.inactiveHero;
    requireThat(hero&&hero.kind==='hero'&&hero.id===rt.heroId&&hero.ownerId===null,'runtime.heroId');
    requireThat(rt.heroEnabled?rt.inactiveHero===null&&rt.units.filter(u=>u.kind==='hero').length===1:rt.units.every(u=>u.kind!=='hero')&&hero.disabled===true&&hero.hp===0&&hero.deadUntil===Infinity,'runtime.hero');
    for(const u of [...rt.units,...(rt.inactiveHero?[rt.inactiveHero]:[])]){
      requireThat(u.hp<=u.maxHp,'runtime.units.hp');historical(u.targetId,'runtime.units.targetId',['enemy']);
      if(['soldier','elemental','elf'].includes(u.kind)){
        const owner=owners.get(u.ownerId);requireThat(owner&&Number.isInteger(u.slot),'runtime.units.ownerId');
        if(u.kind==='elf')requireThat(owner.type==='sylvan_elf_hall'&&owner.restored&&u.autoRespawn===false&&u.respawn===Infinity,'runtime.units.ownerId');
        else {requireThat(!!owner.defId&&u.towerDefId===owner.defId,'runtime.units.towerDefId');if(u.kind==='soldier')requireThat(data.towers[owner.defId].family==='barracks','runtime.units.kind');else requireThat(owner.skills.summon_elemental>0,'runtime.units.kind');}
      }else requireThat(u.ownerId===null,'runtime.units.ownerId');
      if(u.kind==='hero')requireThat(own(u,'skillCd')&&own(u,'level')&&own(u,'xp'),'runtime.hero');
      if(u.kind==='reinforcement')requireThat(own(u,'expiresAt'),'runtime.units.expiresAt');
      if(u.respawn===Infinity)requireThat(u.kind==='elf'&&u.autoRespawn===false,'runtime.units.respawn');
      if(u.deadUntil===Infinity)requireThat((u.kind==='hero'&&!rt.heroEnabled)||(u.kind==='elf'&&u.autoRespawn===false&&u.hp===0),'runtime.units.deadUntil');
    }
    for(const e of rt.enemies){
      requireThat(e.pathIndex<world.paths.length&&e.progress<=world.paths[e.pathIndex].length+10000,'runtime.enemies.pathIndex');
      historical(e.summonerId,'runtime.enemies.summonerId',['enemy']);historical(e.curseSource,'runtime.enemies.curseSource',['tower','facility']);for(const dot of [e.poison,e.wrath])if(dot)historical(dot.source,'runtime.enemies.dot.source',['tower','facility']);
      if(e.sourceEventId)requireThat(eventStates.get(e.sourceEventId)?.routeIndex===e.pathIndex,'runtime.enemies.sourceEventId');
      e.ranged=data.enemies[e.defId].ranged||null;
    }
    for(const p of rt.projectiles){
      if(p.hostile){requireThat(own(p,'targetUnitId')&&own(p,'enemyId'),'runtime.projectiles');historical(p.targetUnitId,'runtime.projectiles.targetUnitId',['unit','inactiveHero']);historical(p.enemyId,'runtime.projectiles.enemyId',['enemy']);}
      else {requireThat(own(p,'targetId')&&own(p,'sourceId'),'runtime.projectiles');historical(p.targetId,'runtime.projectiles.targetId',['enemy']);historical(p.sourceId,'runtime.projectiles.sourceId',['tower','facility','unit']);}
      if(p.poison)historical(p.poison.source,'runtime.projectiles.poison.source',['tower','facility']);
    }
    for(const p of rt.pending){if(p.type==='spawn')requireThat(own(p,'enemyId')&&own(p,'pathIndex')&&p.pathIndex<world.paths.length,'runtime.pending');else requireThat(['x','y','damage','radius'].every(k=>own(p,k)),'runtime.pending');historical(p.source,'runtime.pending.source',['tower','facility']);}
    requireThat(rt.stats.waves.length===rt.wave&&rt.stats.waves.every((s,i)=>s.number===i+1&&s.time<=rt.time),'runtime.stats.waves');
    requireThat(Math.abs(rt.stats.duration-rt.time)<1e-7,'runtime.stats.duration');
    // Only the following fields are assigned. Constructors, methods, source definitions and
    // derived geometry never come from payload object keys.
    for(const field of RUNTIME_FIELDS)world[field]=rt[field];
    for(const field of ['towers','facilities','enemies','units','projectiles','effects','pending','spells','stats','notifications','eventLog'])world[field]=rt[field];
    world.availableTowerIds=new Set(rt.availableTowerIds);world.hero=hero;
    world.stageEventState=rt.stageEventState.map(s=>({...s,definition:eventDefs.get(s.id)}));
    captureFingerprints.set(world,{data,version:data.version,value:payload.dataFingerprint});
    return world;
  }
  function restore(data,payload){return validate(data,inputCopy(payload));}
  function describe(data,payload){
    try{const clean=inputCopy(payload),world=validate(data,clean);return {valid:true,version:VERSION,capturedAt:clean.capturedAt,stageId:world.stage.id,stageName:world.stage.nameKo||world.stage.name,mode:world.mode,difficulty:world.difficulty,ruleset:world.ruleset,layout:world.layout,state:world.state,time:world.time,wave:world.wave,totalWaves:world.totalWaves,lives:world.lives,maxLives:world.maxLives,gold:world.gold,cheated:world.stats.cheated,towerCount:world.towers.length,enemyCount:world.enemies.length,heroEnabled:world.heroEnabled};}
    catch(e){return {valid:false,reason:e?.name==='KRCheckpointError'?e.message:'전투 저장 데이터를 읽을 수 없습니다.',code:e?.code||'CHECKPOINT_INVALID'};}
  }
  const api=Object.freeze({capture,restore,describe,supportedVersion:VERSION});
  G.KRCheckpoint=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
