/* Dark Descent XXIV. Original procedural art and independent ARPG rules.
   Units: world pixels (32 per cell); time: seconds; fixed simulation: 60 Hz. */
const $=s=>document.querySelector(s),T=32,NX=25,NY=17,W=960,H=624,TAU=Math.PI*2;
const KEY='dark-descent-xxiv',VERSION=24;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tile=(x,y)=>({x:Math.floor(x/T),y:Math.floor(y/T)});
const center=p=>({x:p.x*T+T/2,y:p.y*T+T/2});
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S=null,paused=false,keys={},pointer={x:400,y:272,down:false},anim=0,accumulator=0,lastTime=0,frameCount=0,fps=60;
let renderMode='3d',squadDebug=false,mapExpanded=false,motionReduced=false,audioEnabled=false;
let autoSaveClock=0,uiClock=0,navVersion=0,screenShake=0;
let camera={x:400,y:272,zoom:1.45},clickGoal=null,clickPath=[],attackTarget=null;
const seedRng=seed=>{let v=(seed>>>0)||0x6d2b79f5;return()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296;}};
function random(){if(!S)return Math.random();let v=(S.rngState>>>0)||0x6d2b79f5;v^=v<<13;v^=v>>>17;v^=v<<5;S.rngState=v>>>0;return (v>>>0)/4294967296;}
const rand=(a,b)=>Math.floor(random()*(b-a+1))+a,choose=a=>a[rand(0,a.length-1)];
function hashSeed(text){if(/^\d+$/.test(String(text)))return Number(text)>>>0;let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const heroLabels={knight:'기사',ranger:'사냥꾼',mage:'마법사'};
const skillNames={knight:['검격','방패 강타','회오리','신성한 방패','성역의 심판'],ranger:['조준 사격','삼연사','회피 사격','연막탄','화살 폭풍'],mage:['마력탄','화염구','빙결 파동','마력 회복','빙하 폭발']};
const affixes=[{name:'강인한',def:3},{name:'맹렬한',atk:5},{name:'정밀한',crit:.05},{name:'수호자의',resist:9},{name:'흡혈의',leech:.04},{name:'생기의',def:2}];
const itemDefs={sword:['검','⚔','weapon'],axe:['도끼','🪓','weapon'],staff:['지팡이','♜','weapon'],armor:['갑옷','▣','armor'],helm:['투구','◈','helm'],ring:['반지','◉','ring'],health:['체력 물약','♥','consumable'],mana:['마나 물약','✦','consumable']};
const roleLabels={captain:'지휘관',guardian:'호위',flanker:'측면',skirmisher:'척후'};
const orderLabels={dormant:'경계',engage:'교전',retreat:'후퇴',regroup:'재집결'};
const themes=[{name:'잊힌 지하묘지',wall:[.27,.31,.36],floor:[.15,.19,.22],light:[.94,.62,.24]},
 {name:'녹슨 수로',wall:[.23,.34,.31],floor:[.12,.23,.23],light:[.25,.86,.66]},
 {name:'잿빛 용광로',wall:[.37,.25,.22],floor:[.24,.14,.13],light:[1,.38,.15]},
 {name:'황혼의 서고',wall:[.3,.25,.42],floor:[.18,.15,.25],light:[.68,.43,1]},
 {name:'심연의 왕좌',wall:[.3,.23,.3],floor:[.19,.11,.17],light:[1,.24,.38]}];
const bossNames=['망자의 파수꾼','수로의 추방자','재의 집행자','황혼의 예언자','심연 군주'];
function log(text){if(!S)return;S.logs.unshift(String(text));S.logs=S.logs.slice(0,18);$('#toast').textContent=text;}
function active(){return S&&!paused&&!S.p.dead&&!S.completed;}
function float(x,y,text,color='#f7e7aa'){if(!S)return;S.fx.push({x,y,text,color,t:.85,total:.85});}
function eventVfx(kind,x,y,r,color,life=.45,angle=0){S.vfx.push({kind,x,y,r,color,life,total:life,angle});}
function freshStats(hero,start){return {...start,r:10,hp:hero==='knight'?145:hero==='mage'?100:115,maxHp:hero==='knight'?145:hero==='mage'?100:115,mp:hero==='mage'?115:85,maxMp:hero==='mage'?115:85,xp:0,level:1,points:0,gold:50,baseAtk:hero==='knight'?15:hero==='ranger'?14:12,baseDef:hero==='knight'?5:2,crit:.08,resist:0,leech:0,skills:{fire:1,whirl:1,heal:1},passives:{power:0,fortitude:0,fortune:0},inv:[],eq:{weapon:null,armor:null,helm:null,ring:null},cd:0,dashCd:0,globalCd:0,ultimateCd:0,guard:0,slow:0,invuln:0,dead:false,face:1.57,walkPhase:0,attackAnim:0,flash:0};}
function resetTransient(){clickGoal=null;clickPath=[];attackTarget=null;keys={};pointer.down=false;accumulator=0;autoSaveClock=0;navVersion++;screenShake=0;}
function create(hero='knight',seed){hero=heroLabels[hero]?hero:'knight';const runSeed=seed===undefined?((Math.random()*4294967296)>>>0):hashSeed(seed);const d=compileDungeon(runSeed,1);
 S={version:VERSION,runSeed,rngState:(runSeed^0xa57f349b)>>>0,dungeonSeed:runSeed,floor:1,hero,p:freshStats(hero,d.start),map:d.map,rooms:d.rooms,exit:d.exit,discovered:[],visible:[],director:null,squads:{},materials:{essence:0,runes:0},enemies:[],drops:[],shots:[],fx:[],vfx:[],hazards:[],logs:[],kills:0,questKills:0,questRewarded:false,bossDead:false,completed:false,elapsed:0,step:0,nextId:1,keyCount:0};
 paused=false;resetTransient();applyContent(d);S.p.inv.push(makeItem('health'),makeItem('health'),makeItem('health'),makeItem('mana'));S.p.eq.weapon=makeItem(hero==='mage'?'staff':'sword');S.p.eq.weapon.atk=Math.min(8,S.p.eq.weapon.atk||5);camera.x=S.p.x;camera.y=S.p.y;pointer.x=S.p.x+40;pointer.y=S.p.y;reveal();log('분기방에서 봉인 열쇠를 찾으세요. H로 상호작용합니다.');refresh();
}
