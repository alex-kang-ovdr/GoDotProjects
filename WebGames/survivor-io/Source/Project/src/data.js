'use strict';
/* v12 independent prototype balance, not the official game's extracted data. */
const $=id=>document.getElementById(id);
const cvs=$('game'),ctx=cvs.getContext('2d');
let W=innerWidth,H=innerHeight,dpr=1;
function resize(){dpr=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
addEventListener('resize',resize);resize();
const rand=(a,b)=>a+Math.random()*(b-a),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TAU=Math.PI*2;
let state='menu',last=0,elapsed=0,spawnTimer=0,bossStage=0,nextHazard=120,shake=0,flash=0,score=0,enemyId=0;
const enemies=[],shots=[],gems=[],particles=[],areas=[],enemyShots=[],texts=[],hazards=[],threats=[];
const keys=new Set();
let joy={active:false,id:null,x:0,y:0,dx:0,dy:0};
let player=null,pendingLevels=0,rerolls=3,banishes=2,banished=new Set(),dashCooldown=0,dashTime=0,dashVector={x:0,y:1};
let difficulty='normal',chapter=0,startingWeapon='kunai',paidRun=false,runStats={},stageEvents=new Set(),missionClaims=new Set(),hudTimer=0;
const chapters=[
 {name:'도시 외곽',boss:'철갑 돌격대장',mult:1,desc:'돌진 경로를 벗어나고 충격파를 대시로 통과하세요.',ground:['#284d4b','#233f4b','#1c3544'],accent:'#426c58'},
 {name:'사막 폐허',boss:'사막 포격사령관',mult:1.18,desc:'포격 표식을 피하고 소환된 호위대를 정리하세요.',ground:['#79664b','#6e5a43','#62503c'],accent:'#a28b61'},
 {name:'빙결 연구소',boss:'프로스트 센티널',mult:1.35,desc:'고정된 레이저 경로와 빙결 탄막을 회피하세요.',ground:['#35586c','#31516b','#263f58'],accent:'#75b2c5'}
];
const definitions={
 kunai:{name:'쿠나이',icon:'🥷',desc:'가까운 적을 추적하는 수리검',kind:'weapon',max:5},
 guardian:{name:'수호자',icon:'🛡️',desc:'주위를 회전하는 방어 칼날',kind:'weapon',max:5},
 rocket:{name:'로켓',icon:'🚀',desc:'직격 후 광역 폭발',kind:'weapon',max:5},
 lightning:{name:'번개',icon:'⚡',desc:'가까운 적에게 즉시 낙뢰',kind:'weapon',max:5},
 molotov:{name:'화염병',icon:'🔥',desc:'적의 진입 경로에 지속 화염',kind:'weapon',max:5},
 drill:{name:'드릴',icon:'🌀',desc:'일직선으로 적을 관통',kind:'weapon',max:5},
 droneA:{name:'A형 드론',icon:'🛸',desc:'추적 조준 탄환. B형과 합체 가능',kind:'weapon',max:5},
 droneB:{name:'B형 드론',icon:'🚁',desc:'확산 포격. A형과 합체 가능',kind:'weapon',max:5},
 destroyer:{name:'파괴자 드론',icon:'✦',desc:'쌍발 유도 폭격 · 슬롯 1개로 합체',kind:'weapon',max:5,hidden:true},
 atk:{name:'고화력 탄약',icon:'💥',desc:'공격력 레벨당 +12%',kind:'passive',max:5},
 speed:{name:'운동화',icon:'👟',desc:'이동 속도 레벨당 +9%',kind:'passive',max:5},
 cooldown:{name:'에너지 큐브',icon:'🔋',desc:'공격 간격 레벨당 -7%',kind:'passive',max:5},
 hp:{name:'피트니스 가이드',icon:'❤️',desc:'최대 HP 레벨당 +15%',kind:'passive',max:5},
 magnet:{name:'자석',icon:'🧲',desc:'흡수 범위 +35 · 경험치 +8%/레벨',kind:'passive',max:5},
 heal:{name:'에너지 드링크',icon:'🥤',desc:'초당 최대 HP의 0.4%/레벨 회복',kind:'passive',max:5},
 range:{name:'고성능 렌즈',icon:'🔭',desc:'범위·타깃 사거리 레벨당 +8%',kind:'passive',max:5},
 armor:{name:'방탄 섬유',icon:'🦺',desc:'받는 피해 레벨당 -8%',kind:'passive',max:5}
};
const evoPairs={kunai:'atk',guardian:'cooldown',rocket:'hp',lightning:'cooldown',molotov:'heal',drill:'speed'};
const evolutionNames={kunai:'유령 수리검',guardian:'절대 수호자',rocket:'심판의 미사일',lightning:'천둥의 사슬',molotov:'지옥 화염',drill:'귀환 화살',destroyer:'파괴자 드론'};
const evolutionDescriptions={kunai:'4발 추적 + 연쇄 타격',guardian:'칼날 추가 · 적 탄환 파괴',rocket:'대폭발 + 잔류 화염',lightning:'추가 타격 + 연쇄 번개',molotov:'주변 3곳에 추가 화염',drill:'관통 후 플레이어 쪽으로 귀환',destroyer:'두 드론 소모 → 유도 폭격 드론 · 슬롯 1칸 회수'};
const weaponData={
 kunai:{damage:[37,50,63,76,89],cooldown:.85,color:'#ffe19a'},
 guardian:{damage:[21,30,39,48,57],cooldown:.3,color:'#b1f3ef'},
 rocket:{damage:[69,93,117,141,165],cooldown:3.3,color:'#ff9964'},
 lightning:{damage:[75,100,125,150,175],cooldown:2.8,color:'#ace8ff'},
 molotov:{damage:[18,24,30,36,42],cooldown:3.5,color:'#ffb169'},
 drill:{damage:[32,44,56,68,80],cooldown:1.5,color:'#7be3f5'},
 droneA:{damage:[22,31,40,49,58],cooldown:.75,color:'#8deaf3'},
 droneB:{damage:[16,23,30,37,44],cooldown:1.4,color:'#f5bc84'},
 destroyer:{damage:[90,90,90,90,90],cooldown:.5,color:'#ffe89c'}
};
const enemyData={
 grunt:[30,60,10,12,'#9bdb83',3],runner:[24,102,9,10,'#ffb86e',3],tank:[145,34,17,18,'#a99bea',8],
 ranged:[46,48,11,12,'#70c5e6',5],elite:[650,53,24,24,'#f6c24f',40],splitter:[98,43,13,17,'#c9a0ff',7],
 sniper:[58,40,16,12,'#f48fb1',6],mini:[16,115,7,8,'#d5baff',1],boss:[3600,43,32,35,'#e36b9c',90],
 charger:[105,62,18,15,'#f39866',6],medic:[90,40,10,13,'#a0e7bd',7]
};
const heroCatalog={
 assault:{name:'선봉대원',icon:'⚡',skill:'충격파',cooldown:18,color:'#37bea1',shirt:'#36bca0',hat:'#294e72',desc:'반경 180 충격파 · 공격력 비례 피해 · 탄환 제거 · 0.8초 보호'},
 engineer:{name:'공병',icon:'⚙',skill:'자동 포탑',cooldown:24,color:'#f2b65e',shirt:'#e6a858',hat:'#a16e3b',desc:'10초간 포탑 설치 · 사거리 420 · 0.32초마다 자동 사격'},
 medic:{name:'구조대원',icon:'✚',skill:'회복장',cooldown:22,color:'#69c3e1',shirt:'#72bad2',hat:'#edf6ed',desc:'반경 135 회복장 · 6초 유지 · 영역 안에서 초당 최대 체력 5% 회복'}
};
const gearCatalog={blade:{name:'전술 블레이드',icon:'⚔️',cost:110,desc:'공격력 +6%/강화'},vest:{name:'방탄 조끼',icon:'🦺',cost:100,desc:'HP +10/강화'},boots:{name:'경량 부츠',icon:'🥾',cost:90,desc:'속도 +4%/강화'}};
const rarities=[{name:'일반',color:'#78909c'},{name:'우수',color:'#209e7c'},{name:'희귀',color:'#5184cf'},{name:'에픽',color:'#ad6dcc'}];
const missions=[{id:'kills',name:'좀비 150마리 처치',goal:150,reward:45,value:()=>player.kills},{id:'chest',name:'보급 상자 2개 열기',goal:2,reward:50,value:()=>runStats.chests},{id:'evolve',name:'무기 1종 진화',goal:1,reward:90,value:()=>runStats.evolutions}];
const int=(v,def=0,max=1e9)=>Number.isFinite(v)?clamp(Math.floor(v),0,max):def;
function normalizeProfile(raw,legacy=false){
 const p=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const out={schema:12,hero:Object.hasOwn(heroCatalog,p.hero)?p.hero:'assault',settledRuns:Array.isArray(p.settledRuns)?p.settledRuns.filter(x=>typeof x==='string'&&/^run_[a-zA-Z0-9_-]{1,90}$/.test(x)).slice(-64):[],gold:int(p.gold),attack:int(p.attack,0,500),hp:int(p.hp,0,500),armor:int(p.armor,0,500),best:int(p.best),wins:int(p.wins),runs:int(p.runs),parts:int(p.parts,0,100000),gear:{},inventory:{},campaign:[]};
 for(const k of Object.keys(gearCatalog)){
  out.gear[k]=int(p.gear?.[k],0,10);
  out.inventory[k]=Array.from({length:4},(_,i)=>int(p.inventory?.[k]?.[i],i===0?1:0,10000));
  if(!out.inventory[k].some(x=>x>0))out.inventory[k][0]=1;
 }
 out.unlocked=int(p.unlocked,legacy?3:1,3)||1;
 for(let i=0;i<3;i++)out.campaign.push({clears:int(p.campaign?.[i]?.clears),stars:int(p.campaign?.[i]?.stars,0,3),bestKills:int(p.campaign?.[i]?.bestKills),bestTime:int(p.campaign?.[i]?.bestTime,0,36000)});
 return out;
}
let storageAvailable=true,rawProfile=null;
try{rawProfile=JSON.parse(localStorage.getItem('survivor_profile_v2')||'null');}catch(e){storageAvailable=false;}
let profile=normalizeProfile(rawProfile,!!rawProfile&&!rawProfile.schema);
let selectedHero=profile.hero;
function saveProfile(){try{localStorage.setItem('survivor_profile_v2',JSON.stringify(profile));storageAvailable=true;return true;}catch(e){storageAvailable=false;return false;}}
let graphics={quality:'normal',zoom:1,stats:false,sound:false,shake:true,radar:true};
try{graphics={...graphics,...JSON.parse(localStorage.getItem('survivor_graphics_v10')||'{}')};}catch(e){}
if(!['low','normal','high'].includes(graphics.quality))graphics.quality='normal';
if(![.85,1,1.2].includes(graphics.zoom))graphics.zoom=1;
graphics.stats=false;graphics.sound=!!graphics.sound;graphics.shake=graphics.shake!==false;
function saveGraphics(){try{localStorage.setItem('survivor_graphics_v10',JSON.stringify(graphics));}catch(e){}}
function equippedTier(k,p=profile){const list=p.inventory[k];for(let i=3;i>=0;i--)if(list[i]>0)return i;return 0;}
function combatMeta(){return runMeta||profile;}
function baseHP(){const p=combatMeta();return 100+p.hp*15+p.gear.vest*10+[0,15,40,75][equippedTier('vest',p)];}
function attackPower(){const p=combatMeta();return (1+.12*(player?.levels.atk||0))*(1+.08*p.attack+.06*p.gear.blade+[0,.08,.2,.4][equippedTier('blade',p)]);}
function moveSpeed(){const p=combatMeta();return 190*(1+.09*(player?.levels.speed||0)+.04*p.gear.boots+[0,.03,.08,.15][equippedTier('boots',p)]);}
function rangePower(){return 1+.08*(player?.levels.range||0);}
function weaponLevel(k){return clamp(player.levels[k]||1,1,5);}
function weaponDamage(k){return weaponData[k].damage[weaponLevel(k)-1]*attackPower()*(player.evolved[k]&&k!=='destroyer'?1.8:1)*(hasPerk('overclock')?.92:1);}
function weaponInterval(k){return weaponData[k].cooldown*Math.max(.35,1-.07*(player.levels.cooldown||0))/(1+.1*(weaponLevel(k)-1))/(player.evolved[k]&&k!=='destroyer'?1.4:1)*(hasPerk('overclock')?.82:1);}
function owned(kind){return Object.keys(player.levels).filter(k=>player.levels[k]>0&&definitions[k]?.kind===kind);}
function evolutionEligible(){const keys=Object.keys(evoPairs).filter(k=>player.levels[k]===5&&player.levels[evoPairs[k]]>0&&!player.evolved[k]);if(player.levels.droneA===5&&player.levels.droneB===5&&!player.levels.destroyer)keys.push('destroyer');return keys;}
function nextXp(lv){return Math.round(12+7*(lv-1)+.65*(lv-1)*(lv-1));}
function fmt(t){let n=Math.floor(t);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');}
