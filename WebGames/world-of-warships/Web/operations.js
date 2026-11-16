/* Iron Tide — immutable operations, loadout tradeoffs and local career progression. */
(function (global) {
  'use strict';
  const N = global.IronTide = global.IronTide || {};
  const freeze = value => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const zone = (id, x, y, radius) => ({id, x, y, radius, progress: 0, owner: null, contested: false});

  const OPERATIONS = freeze({
    northern: {
      id: 'northern', name: '북쪽 군도', subtitle: '세 개의 항로, 하나의 전선',
      description: 'A·B·C 거점을 나눠 점령하세요. 섬을 엄폐물로 삼고, 빈 항로로 우회해 측면을 여세요.',
      mode: 'domination', world: {w: 4200, h: 3200}, duration: 480, targetScore: 800, initialScore: 250,
      islands: [
        {x:1510,y:1300,rx:180,ry:280,rotation:.46,seed:13},
        {x:1410,y:1890,rx:180,ry:150,rotation:-.4,seed:26},
        {x:2700,y:1520,rx:205,ry:330,rotation:-.42,seed:43},
        {x:2870,y:2180,rx:140,ry:100,rotation:.28,seed:79},
        {x:410,y:1940,rx:125,ry:165,rotation:-.6,seed:32},
        {x:3580,y:990,rx:140,ry:98,rotation:.3,seed:59},
        {x:1900,y:380,rx:185,ry:90,rotation:.2,seed:71},
        {x:290,y:480,rx:145,ry:230,rotation:-.28,seed:94},
        {x:3910,y:2760,rx:185,ry:170,rotation:-.65,seed:17}
      ],
      zones: [zone('A',870,1550,235),zone('B',2100,1510,235),zone('C',3320,1600,235)],
      spawns: {blue:[{x:2100,y:2510},{x:920,y:2450},{x:3270,y:2490}],red:[{x:850,y:650},{x:2190,y:710},{x:3270,y:650}]}
    },
    bastion: {
      id: 'bastion', name: '해협의 보루', subtitle: '중앙 거점을 둘러싼 함대전',
      description: '중앙 거점 하나를 지켜 640점을 확보하세요. 엄폐를 벗어나는 순간의 집중사격과 동료의 지원이 중요합니다.',
      mode: 'control', world: {w:4200,h:3200}, duration:420, targetScore:640, initialScore:180,
      islands: [
        {x:1480,y:1250,rx:180,ry:260,rotation:.48,seed:113},
        {x:1410,y:1950,rx:140,ry:220,rotation:-.35,seed:126},
        {x:2780,y:1230,rx:220,ry:180,rotation:-.5,seed:143},
        {x:2800,y:2040,rx:210,ry:140,rotation:.3,seed:179},
        {x:560,y:800,rx:170,ry:250,rotation:-.2,seed:132},
        {x:600,y:2600,rx:170,ry:130,rotation:.8,seed:159},
        {x:3600,y:650,rx:150,ry:230,rotation:.2,seed:171},
        {x:3590,y:2550,rx:180,ry:160,rotation:-.4,seed:194}
      ],
      zones: [zone('B',2100,1600,320)],
      spawns: {blue:[{x:2100,y:2720},{x:1050,y:2500},{x:3150,y:2540}],red:[{x:1050,y:700},{x:2100,y:480},{x:3150,y:660}]}
    },
    openwater: {
      id:'openwater',name:'외해 교전',subtitle:'숨을 곳은 적고, 사격각은 넓다',
      description:'거점 없이 적 함대를 격침하세요. 5분이 지나면 살아남은 팀의 내구도 비율로 승패를 결정합니다.',
      mode:'elimination',world:{w:4200,h:3200},duration:300,targetScore:800,initialScore:0,
      islands:[
        {x:500,y:550,rx:150,ry:200,rotation:.4,seed:213},
        {x:3620,y:720,rx:170,ry:130,rotation:-.2,seed:226},
        {x:430,y:2570,rx:140,ry:210,rotation:.2,seed:243},
        {x:3550,y:2490,rx:180,ry:240,rotation:-.4,seed:279},
        {x:1230,y:1610,rx:150,ry:180,rotation:-.5,seed:232},
        {x:3100,y:1520,rx:130,ry:190,rotation:.3,seed:259}
      ],zones:[],
      spawns:{blue:[{x:2100,y:2550},{x:900,y:2580},{x:3050,y:2630}],red:[{x:900,y:620},{x:2100,y:650},{x:3050,y:570}]}
    }
  });

  const LOADOUTS = freeze({
    balanced:{id:'balanced',name:'표준 장비',description:'기본 성능을 그대로 유지하는 균형형 장비입니다.',modifiers:{reload:1,maxHp:1,maxSpeed:1,turnRate:1}},
    artillery:{id:'artillery',name:'포술 특화',description:'주포 재장전 12% 단축 · 최대 속도 6% 감소',modifiers:{reload:.88,maxHp:1,maxSpeed:.94,turnRate:1}},
    survival:{id:'survival',name:'생존 특화',description:'최대 내구도 10% 증가 · 주포 재장전 8% 증가',modifiers:{reload:1.08,maxHp:1.10,maxSpeed:1,turnRate:1}},
    maneuver:{id:'maneuver',name:'기동 특화',description:'최대 속도 10%·선회 성능 15% 증가 · 최대 내구도 8% 감소',modifiers:{reload:1,maxHp:.92,maxSpeed:1.10,turnRate:1.15}}
  });

  const MAX_XP=10000000, MAX_DAMAGE=10000000, MAX_HISTORY=20;
  const STORAGE_KEY='iron-tide.career.v2';
  const RANKS=freeze([
    {name:'소위',xp:0},{name:'중위',xp:350},{name:'대위',xp:900},
    {name:'소령',xp:1800},{name:'중령',xp:3200},{name:'대령',xp:5200}
  ]);
  const SHIPS=['destroyer','cruiser','battleship'];
  const DIFFICULTIES=['easy','normal','hard'];
  const SESSION_TYPES=['free','campaign','training'];
  const CAMPAIGN_STAGES=freeze(['northern','bastion','openwater']);
  const PHASES=['won','lost','draw'];
  const DAMAGE_KEYS=['HE','AP','TORP','FIRE','FLOOD','SECONDARY'];
  const RIBBON_KEYS=['penetrations','overpens','ricochets','shatters','citadels','fires','floods','torpHits'];
  const BASE_HP={destroyer:18000,cruiser:32000,battleship:58000};
  const recordLike=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const number=(value,max,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(max,value)):fallback;
  const integer=(value,max,fallback=0)=>Math.floor(number(value,max,fallback));
  const member=(value,keys,fallback)=>typeof value==='string'&&keys.includes(value)?value:fallback;
  const validId=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value);
  const ended=phase=>PHASES.includes(phase);

  function baseHp(shipClass) {
    const profile=N.CLASSES&&N.CLASSES[shipClass];
    return profile&&Number.isFinite(profile.maxHp)&&profile.maxHp>0?profile.maxHp:BASE_HP[shipClass];
  }
  function empty() {
    return {version:3,xp:0,battles:0,wins:0,bestDamage:0,history:[],operations:{},classes:{},recordedMatchIds:[],campaign:emptyCampaign(),campaignCompletions:0};
  }
  function emptyCampaign() {
    return {runId:null,status:'idle',stage:0,difficulty:'normal',attempts:0,totalDamage:0,totalXp:0,results:[]};
  }
  function rank(value) {
    const xp=integer(value,MAX_XP);
    let index=0;
    for(let i=1;i<RANKS.length;i++)if(xp>=RANKS[i].xp)index=i;
    const top=index===RANKS.length-1,current=xp-RANKS[index].xp;
    const next=top?0:RANKS[index+1].xp-RANKS[index].xp;
    return {name:RANKS[index].name,level:index+1,current,next,progress:top?1:Math.min(1,current/next)};
  }
  function rewardXp(summary) {
    if(!ended(summary.phase)||summary.sessionType==='training')return 0;
    const damageReward=Math.min(480,summary.damage/baseHp(summary.shipClass)*160);
    const outcome=summary.won?150:summary.phase==='draw'?60:0;
    const value=30+damageReward+outcome+Math.min(120,summary.caps*40)+Math.min(105,summary.kills*35);
    const difficulty=summary.difficulty==='easy'?.85:summary.difficulty==='hard'?1.15:1;
    return Math.min(1200,Math.max(0,Math.round(value*difficulty)));
  }
  function ratingStars(summary) {
    if(!ended(summary.phase)||summary.sessionType==='training')return 0;
    const value=(summary.won?1:0)+(summary.damage>=baseHp(summary.shipClass)*.5?1:0)+(summary.hpRatio>=.35||summary.caps>=1?1:0);
    return Math.min(summary.won?3:1,value);
  }
  function achievements(summary) {
    if(!ended(summary.phase)||summary.sessionType==='training')return [];
    const result=[];
    if(summary.ribbons.citadels>=1)result.push({id:'citadel',label:'집중방호구역 명중'});
    if(summary.ribbons.torpHits>=2)result.push({id:'torpedo_expert',label:'어뢰 명중 2회'});
    if(summary.caps>=2)result.push({id:'objective',label:'거점 2곳 확보'});
    if(summary.kills>=3)result.push({id:'fleetbreaker',label:'적 함대 격파'});
    if(summary.won&&summary.hpRatio>=.6)result.push({id:'survivor',label:'강철의 생존자'});
    if(summary.shots>=12&&summary.accuracy>=.5)result.push({id:'marksman',label:'정밀 사격'});
    return result;
  }
  function cleanSummary(input) {
    const value=recordLike(input)?input:{};
    const summary={
      operationId:member(value.operationId,Object.keys(OPERATIONS),'northern'),
      shipClass:member(value.shipClass,SHIPS,'cruiser'),
      loadoutId:member(value.loadoutId,Object.keys(LOADOUTS),'balanced'),
      difficulty:member(value.difficulty,DIFFICULTIES,'normal'),
      sessionType:member(value.sessionType,SESSION_TYPES,'free'),
      campaignRunId:null,campaignStage:null,
      won:false,phase:member(value.phase,PHASES,'playing'),
      damage:Math.round(number(value.damage,MAX_DAMAGE)),kills:integer(value.kills,3),
      hits:integer(value.hits,100000),shots:integer(value.shots,100000),caps:integer(value.caps,1000),
      time:number(value.time,3600),hpRatio:number(value.hpRatio,1),accuracy:0,
      xp:0,stars:0,score:[0,0],damageBreakdown:{},ribbons:{},achievements:[]
    };
    if(summary.sessionType==='campaign'){
      summary.campaignRunId=validId(value.campaignRunId)?value.campaignRunId:null;
      summary.campaignStage=Number.isInteger(value.campaignStage)&&value.campaignStage>=0&&value.campaignStage<CAMPAIGN_STAGES.length?value.campaignStage:null;
    }
    summary.won=summary.phase==='won';
    summary.accuracy=summary.shots>0?Math.min(1,summary.hits/summary.shots):0;
    if(Array.isArray(value.score))summary.score=[number(value.score[0],100000),number(value.score[1],100000)];
    const breakdown=recordLike(value.damageBreakdown)?value.damageBreakdown:{};
    let total=0;
    for(const key of DAMAGE_KEYS){summary.damageBreakdown[key]=number(breakdown[key],MAX_DAMAGE);total+=summary.damageBreakdown[key];}
    // Corrupt imported counters cannot make the chart exceed total applied damage.
    if(total>summary.damage&&total>0)for(const key of DAMAGE_KEYS)summary.damageBreakdown[key]*=summary.damage/total;
    const ribbons=recordLike(value.ribbons)?value.ribbons:{};
    for(const key of RIBBON_KEYS)summary.ribbons[key]=integer(ribbons[key],100000);
    summary.xp=rewardXp(summary);summary.stars=ratingStars(summary);summary.achievements=achievements(summary);
    return summary;
  }
  function summarize(g,context={}) {
    const game=recordLike(g)?g:{},stats=recordLike(game.stats)?game.stats:{},player=recordLike(game.player)?game.player:{};
    context=recordLike(context)?context:{};
    const ribbons={};for(const key of RIBBON_KEYS)ribbons[key]=stats[key];
    return cleanSummary({
      operationId:game.operationId,shipClass:player.classId,loadoutId:game.loadoutId||context.loadoutId,difficulty:game.difficulty,phase:game.phase,
      sessionType:game.trainingMode===true?'training':context.sessionType,campaignRunId:context.campaignRunId,campaignStage:context.campaignStage,
      damage:stats.damage,kills:stats.kills,hits:stats.hits,shots:stats.shots,caps:stats.caps,time:game.time,
      hpRatio:Number.isFinite(player.hp)&&Number.isFinite(player.maxHp)&&player.maxHp>0?player.hp/player.maxHp:0,
      score:game.score,damageBreakdown:game.damageBreakdown,ribbons
    });
  }
  function normalizeCampaign(value) {
    if(!recordLike(value)||!validId(value.runId)||!['active','completed'].includes(value.status))return emptyCampaign();
    const result=emptyCampaign();result.runId=value.runId;result.status='active';
    result.difficulty=member(value.difficulty,DIFFICULTIES,'normal');
    const matchIds=new Set();
    if(Array.isArray(value.results))for(const raw of value.results.slice(0,3)){
      if(!recordLike(raw)||!validId(raw.matchId)||matchIds.has(raw.matchId))break;
      const entry=cleanSummary(raw),stage=result.results.length;
      if(!entry.won||entry.sessionType!=='campaign'||entry.campaignRunId!==result.runId||entry.campaignStage!==stage||entry.operationId!==CAMPAIGN_STAGES[stage]||entry.difficulty!==result.difficulty)break;
      result.results.push({...entry,matchId:raw.matchId});matchIds.add(raw.matchId);
    }
    result.stage=result.results.length;
    if(result.stage===CAMPAIGN_STAGES.length)result.status='completed';
    result.attempts=Math.max(result.stage,integer(value.attempts,1000000));
    result.totalDamage=Math.max(result.results.reduce((sum,r)=>sum+r.damage,0),number(value.totalDamage,MAX_DAMAGE));
    result.totalXp=Math.max(result.results.reduce((sum,r)=>sum+r.xp,0),integer(value.totalXp,MAX_XP));
    return result;
  }
  function normalize(value) {
    const result=empty();
    if(!recordLike(value))return result;
    result.xp=integer(value.xp,MAX_XP);result.battles=integer(value.battles,1000000);
    result.wins=integer(value.wins,result.battles);result.bestDamage=Math.round(number(value.bestDamage,MAX_DAMAGE));
    const ids=new Set();
    // The small identity ledger survives visible-history truncation. The import limit
    // protects malformed local JSON; ordinary use retains every recorded match ID.
    if(Array.isArray(value.recordedMatchIds))for(const id of value.recordedMatchIds.slice(0,100000))if(validId(id))ids.add(id);
    if(Array.isArray(value.history)){
      const visibleIds=new Set();
      for(const entry of value.history.slice(0,1000)){
        if(!recordLike(entry)||!validId(entry.id)||!ended(entry.phase)||entry.sessionType==='training'||visibleIds.has(entry.id))continue;
        visibleIds.add(entry.id);ids.add(entry.id);
        const summary=cleanSummary(entry);
        const parsed=typeof entry.date==='string'&&entry.date.length<=32?Date.parse(entry.date):NaN;
        const date=Number.isFinite(parsed)?new Date(parsed).toISOString():'1970-01-01T00:00:00.000Z';
        if(result.history.length<MAX_HISTORY)result.history.push({...summary,id:entry.id,date});
      }
    }
    result.recordedMatchIds=Array.from(ids);
    const operations=recordLike(value.operations)?value.operations:{};
    for(const id of Object.keys(OPERATIONS)){
      const item=operations[id];if(!recordLike(item))continue;
      const battles=integer(item.battles,1000000);
      const source=recordLike(item.bestByDifficulty)?item.bestByDifficulty:{};
      result.operations[id]={battles,wins:integer(item.wins,battles),bestStars:integer(item.bestStars,3),bestDamage:Math.round(number(item.bestDamage,MAX_DAMAGE)),bestTime:number(item.bestTime,3600),bestByDifficulty:{easy:integer(source.easy,3),normal:integer(source.normal,3),hard:integer(source.hard,3)}};
    }
    const classes=recordLike(value.classes)?value.classes:{};
    for(const id of SHIPS){
      const item=classes[id];if(!recordLike(item))continue;
      const battles=integer(item.battles,1000000);
      result.classes[id]={battles,wins:integer(item.wins,battles),bestDamage:Math.round(number(item.bestDamage,MAX_DAMAGE))};
    }
    // V2 aggregate stars reveal no difficulty; only known history rows can fill it.
    const knownClasses={};
    for(const entry of result.history){
      const op=result.operations[entry.operationId];
      if(op)op.bestByDifficulty[entry.difficulty]=Math.max(op.bestByDifficulty[entry.difficulty],entry.stars);
      const cls=knownClasses[entry.shipClass]||(knownClasses[entry.shipClass]={battles:0,wins:0,bestDamage:0});
      cls.battles++;if(entry.won)cls.wins++;cls.bestDamage=Math.max(cls.bestDamage,entry.damage);
    }
    for(const id of SHIPS)if(!result.classes[id]&&knownClasses[id])result.classes[id]=knownClasses[id];
    result.campaign=normalizeCampaign(value.campaign);
    result.campaignCompletions=integer(value.campaignCompletions,1000000);
    return result;
  }
  function startCampaign(career,options={}) {
    const result=normalize(career);options=recordLike(options)?options:{};
    if(result.campaign.status==='active'||!validId(options.runId))return result;
    if(result.campaign.status==='completed'&&result.campaign.runId===options.runId)return result;
    result.campaign={...emptyCampaign(),runId:options.runId,status:'active',difficulty:member(options.difficulty,DIFFICULTIES,'normal')};
    return result;
  }
  function record(career,summary,matchId) {
    const result=normalize(career);
    if(!validId(matchId)||!recordLike(summary)||summary.sessionType==='training'||!ended(summary.phase)||result.recordedMatchIds.includes(matchId))return result;
    const entry=cleanSummary(summary);
    result.recordedMatchIds.push(matchId);
    result.xp=Math.min(MAX_XP,result.xp+entry.xp);
    result.battles=Math.min(1000000,result.battles+1);
    result.wins=Math.min(result.battles,result.wins+(entry.won?1:0));
    result.bestDamage=Math.max(result.bestDamage,entry.damage);
    const previous=result.operations[entry.operationId]||{battles:0,wins:0,bestStars:0,bestDamage:0,bestTime:0,bestByDifficulty:{easy:0,normal:0,hard:0}};
    const bestByDifficulty={...previous.bestByDifficulty};bestByDifficulty[entry.difficulty]=Math.max(bestByDifficulty[entry.difficulty],entry.stars);
    result.operations[entry.operationId]={
      battles:Math.min(1000000,previous.battles+1),wins:Math.min(1000000,previous.wins+(entry.won?1:0)),
      bestStars:Math.max(previous.bestStars,entry.stars),bestDamage:Math.max(previous.bestDamage,entry.damage),
      bestTime:entry.won&&entry.time>0?(previous.bestTime>0?Math.min(previous.bestTime,entry.time):entry.time):previous.bestTime,bestByDifficulty
    };
    const cls=result.classes[entry.shipClass]||{battles:0,wins:0,bestDamage:0};
    result.classes[entry.shipClass]={battles:Math.min(1000000,cls.battles+1),wins:Math.min(1000000,cls.wins+(entry.won?1:0)),bestDamage:Math.max(cls.bestDamage,entry.damage)};
    const campaign=result.campaign;
    if(entry.sessionType==='campaign'&&campaign.status==='active'&&entry.campaignRunId===campaign.runId&&entry.campaignStage===campaign.stage&&entry.operationId===CAMPAIGN_STAGES[campaign.stage]&&entry.difficulty===campaign.difficulty){
      campaign.attempts=Math.min(1000000,campaign.attempts+1);
      campaign.totalDamage=Math.min(MAX_DAMAGE,campaign.totalDamage+entry.damage);campaign.totalXp=Math.min(MAX_XP,campaign.totalXp+entry.xp);
      if(entry.won){
        campaign.results.push({...entry,matchId});campaign.stage++;
        if(campaign.stage===CAMPAIGN_STAGES.length){campaign.status='completed';result.campaignCompletions=Math.min(1000000,result.campaignCompletions+1);}
      }
    }
    result.history.unshift({...entry,id:matchId,date:new Date().toISOString()});
    result.history.length=Math.min(MAX_HISTORY,result.history.length);
    return result;
  }
  function read(storage) {
    try{return normalize(JSON.parse(storage.getItem(STORAGE_KEY)||'null'));}catch(_){return empty();}
  }
  function write(storage,career) {
    try{storage.setItem(STORAGE_KEY,JSON.stringify(normalize(career)));return true;}catch(_){return false;}
  }

  const Career=freeze({empty,normalize,rank,summarize,record,startCampaign,read,write,storageKey:STORAGE_KEY,ranks:RANKS});
  Object.assign(N,{OPERATIONS,LOADOUTS,CAMPAIGN_STAGES,Career});
})(typeof globalThis !== 'undefined' ? globalThis : window);
