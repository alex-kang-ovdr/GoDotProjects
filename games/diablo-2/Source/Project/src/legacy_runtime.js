
/* Dark Descent XXV. Original procedural art and independent ARPG rules.
   Units: world pixels (32 per cell); time: seconds; fixed simulation: 60 Hz. */
const $=s=>document.querySelector(s),T=32,NX=85,NY=50,W=960,H=624,TAU=Math.PI*2;
const KEY='dark-descent-xxviii',VERSION=28;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tile=(x,y)=>({x:Math.floor(x/T),y:Math.floor(y/T)});
const center=p=>({x:p.x*T+T/2,y:p.y*T+T/2});
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let S=null,paused=false,keys={},pointer={x:400,y:272,down:false},anim=0,accumulator=0,lastTime=0,frameCount=0,fps=60;
let renderMode='3d',squadDebug=false,mapExpanded=false,motionReduced=false,audioEnabled=false;
const MAP_SPEC=Object.freeze({width:85,height:50,oldWidth:25,oldHeight:17,areaMultiplier:10,corridorWidth:4,roomAxisMultiplier:4});
let gateCacheVersion=-1,gateCacheSet=null,gateCacheGates=null;
let autoSaveClock=0,uiClock=0,navVersion=0,screenShake=0;
let camera={x:400,y:272,zoom:1.15},clickGoal=null,clickPath=[],attackTarget=null;
const seedRng=seed=>{let v=(seed>>>0)||0x6d2b79f5;return()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296;}};
function random(){if(!S)return Math.random();let v=(S.rngState>>>0)||0x6d2b79f5;v^=v<<13;v^=v>>>17;v^=v<<5;S.rngState=v>>>0;return (v>>>0)/4294967296;}
const rand=(a,b)=>Math.floor(random()*(b-a+1))+a,choose=a=>a[rand(0,a.length-1)];
function hashSeed(text){if(/^\d+$/.test(String(text)))return Number(text)>>>0;let h=2166136261;for(const c of String(text)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
const CLASS=Object.fromEntries(D2DATA.classes.map(c=>[c.id,c]));
const SKILL=Object.fromEntries(D2DATA.skills.map(c=>[c.id,c]));
const CURVE=Object.fromEntries(D2DATA.curves.map(c=>[c.skill_id,c]));
const AREA=Object.fromEntries(D2DATA.world.areas.map(c=>[c.id,c]));
const BASE=Object.fromEntries(D2DATA.bases.map(c=>[c.id,c]));
const heroLabels=Object.fromEntries(D2DATA.classes.map(c=>[c.id,c.label_ko_editorial]));
const skillNames=Object.fromEntries(D2DATA.classes.map(c=>[c.id,['기본 공격','미지정','미지정','미지정','미지정']]));
const itemDefs={sword:['검','⚔','weapon'],axe:['도끼','⚒','weapon'],staff:['지팡이','♜','weapon'],wand:['원드','♜','weapon'],bow:['활','➶','weapon'],spear:['창','↟','weapon'],javelin:['재벌린','➚','weapon'],claw:['클러','⋔','weapon'],dagger:['단검','†','weapon'],armor:['갑옷','▣','armor'],helm:['투구','◈','helm'],shield:['방패','⛨','offhand'],ring:['반지','◉','ring'],amulet:['목걸이','◇','amulet'],rune:['룬','ᚱ','rune'],health:['체력 물약','♥','consumable'],mana:['마나 물약','✦','consumable']};
function heroStyle(){return ['amazon'].includes(S.hero)?'ranger':['sorceress','necromancer','druid'].includes(S.hero)?'mage':'knight';}
const roleLabels={captain:'지휘관',guardian:'호위',flanker:'측면',skirmisher:'척후'};
const orderLabels={dormant:'경계',engage:'교전',retreat:'후퇴',regroup:'재집결'};
const themes=[{name:'잊힌 지하묘지',wall:[.27,.31,.36],floor:[.15,.19,.22],light:[.94,.62,.24]},
 {name:'녹슨 수로',wall:[.23,.34,.31],floor:[.12,.23,.23],light:[.25,.86,.66]},
 {name:'잿빛 용광로',wall:[.37,.25,.22],floor:[.24,.14,.13],light:[1,.38,.15]},
 {name:'황혼의 서고',wall:[.3,.25,.42],floor:[.18,.15,.25],light:[.68,.43,1]},
 {name:'심연의 왕좌',wall:[.3,.23,.3],floor:[.19,.11,.17],light:[1,.24,.38]}];
const fieldThemes=[{floor:[.17,.27,.19],wall:[.23,.33,.22],light:[.95,.75,.34]},{floor:[.43,.33,.21],wall:[.57,.43,.25],light:[1,.8,.42]},{floor:[.13,.25,.20],wall:[.18,.34,.24],light:[.6,.85,.45]},{floor:[.25,.14,.12],wall:[.36,.24,.2],light:[1,.4,.1]},{floor:[.4,.47,.51],wall:[.52,.61,.63],light:[.55,.83,1]}];
const townTheme={floor:[.27,.29,.26],wall:[.39,.42,.36],light:[1,.77,.35]};
const bossNames=['망자의 파수꾼','수로의 추방자','재의 집행자','황혼의 예언자','심연 군주'];
function log(text){if(!S)return;S.logs.unshift(String(text));S.logs=S.logs.slice(0,18);$('#toast').textContent=text;}
function active(){return S&&!paused&&!S.p.dead&&!S.completed;}
function float(x,y,text,color='#f7e7aa'){if(!S)return;S.fx.push({x,y,text,color,t:.85,total:.85});}
function eventVfx(kind,x,y,r,color,life=.45,angle=0){S.vfx.push({kind,x,y,r,color,life,total:life,angle});}
function freshStats(hero,start){const c=CLASS[hero];return {...start,r:10,hp:c.initial_resources.life,maxHp:c.initial_resources.life,mp:c.initial_resources.mana,maxMp:c.initial_resources.mana,xp:0,level:1,points:0,statPoints:0,gold:100,baseAtk:2,baseDef:0,crit:0,resist:0,leech:0,attributes:{...c.initial_attributes},skills:{},passives:{},skillBindings:[null,null,null,null],buffs:{},skillCooldowns:{},inv:[],eq:{weapon:null,offhand:null,armor:null,helm:null,ring:null,ring2:null,amulet:null},cd:0,dashCd:0,globalCd:0,ultimateCd:0,guard:0,slow:0,invuln:0,dead:false,face:1.57,walkPhase:0,attackAnim:0,flash:0,bonusSkills:0,bonusStats:0};}
// Use physical game keys so the same controls work with a Korean IME or other
// keyboard layouts. Text fields and browser shortcuts are gated separately.
function gameKey(e){
 const code=typeof e?.code==='string'?e.code:'',key=typeof e?.key==='string'?e.key:'';
 if(/^Key[A-Z]$/.test(code))return code.slice(3).toLowerCase();
 if(/^Digit[0-9]$/.test(code))return code.slice(5);
 if(code==='Space')return ' ';
 if(code==='ShiftLeft'||code==='ShiftRight')return 'Shift';
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Escape'].includes(code))return code;
 return key.length===1?key.toLowerCase():key;
}
function gameInputBlocked(e){
 const target=e?.target;
 return !!(e?.ctrlKey||e?.metaKey||e?.altKey||target?.isContentEditable||
  target?.closest?.('input,select,textarea,[contenteditable]:not([contenteditable="false"])')||
  $('#modal')?.open||$('#offlineLauncher')?.open||$('#offlineTransfer')?.open);
}
function clearGameplayInput(){
 keys={};pointer.down=false;clickGoal=null;clickPath=[];attackTarget=null;accumulator=0;
 if(S){S.channel=null;if(S.p){S.p.path=[];S.p.pathTime=0;}}
}
function resetTransient(){clearGameplayInput();autoSaveClock=0;navVersion++;screenShake=0;}
function create(hero='paladin',seed){hero=({knight:'paladin',mage:'sorceress',ranger:'amazon'})[hero]||hero;hero=CLASS[hero]?hero:'paladin';const runSeed=seed===undefined?((Math.random()*4294967296)>>>0):hashSeed(seed);
 S={version:VERSION,runSeed,rngState:(runSeed^0xa57f349b)>>>0,dungeonSeed:runSeed,floor:1,hero,p:freshStats(hero,{x:80,y:80}),map:[],rooms:[],exit:{x:80,y:80},discovered:[],visible:[],director:{objects:[],gates:[]},squads:{},materials:{essence:0,runes:0},enemies:[],drops:[],shots:[],fx:[],vfx:[],hazards:[],logs:[],kills:0,questKills:0,questRewarded:false,bossDead:false,completed:false,elapsed:0,step:0,nextId:1,keyCount:1,roomProgress:{},townReturn:null,channel:null,mapSpec:{...MAP_SPEC},minions:[],corpses:[],fields:[],barriers:[],world:{areaId:null,states:{},visited:{},waypoints:{},flags:{},claims:{},actUnlocked:1,trueTomb:(runSeed%7)+1,returnPortal:null}};
 paused=false;resetTransient();for(let i=0;i<3;i++)S.p.inv.push(makeItem('health'));S.p.inv.push(makeItem('mana'));
 const starter={amazon:'javelin',assassin:'katar',barbarian:'hand_axe',druid:'hand_axe',necromancer:'wand',paladin:'short_sword',sorceress:'short_staff'}[hero];S.p.eq.weapon=generateItem({baseId:starter,quality:'normal',ilvl:1,noSockets:true,noEthereal:true,noStaffmods:true});
 if(hero==='sorceress'){S.p.eq.weapon.staffmods={sorceress_fire_bolt:1};S.p.skillBindings[0]='sorceress_fire_bolt';}
 if(hero==='necromancer'){S.p.eq.weapon.staffmods={necromancer_raise_skeleton:1};S.p.skillBindings[0]='necromancer_raise_skeleton';}
 if(['amazon','paladin'].includes(hero))S.p.eq.offhand=generateItem({baseId:'buckler',quality:'normal',ilvl:1,noSockets:true,noEthereal:true});
 recalcResources();enterArea(D2DATA.world.towns['1'],{initial:true});log('원작 규칙 프로필 · 7직업 / 5액트 · H 출입구, O 지역 지도, K 성장.');if(!GL)log('3D를 사용할 수 없어 2D 모드로 시작했습니다. 게임은 계속 플레이할 수 있습니다.');refresh();
}

// XXV: exactly 10x rectangular map area. Corridor width is a spatial rule,
// not a camera/actor scale. Room width/height are each 4x their base template.
function dungeon(seed=0){
 const rng=seedRng(seed^0x4bc91e73),ri=(a,b)=>a+Math.floor(rng()*(b-a+1));
 const map=Array.from({length:NY},()=>Array(NX).fill(1)),rooms=[],corridors=[];
 // Six large, non-overlapping sectors with a continuous wall border.
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
  const baseW=ri(4,6),baseH=ri(3,5),w=baseW*4,h=baseH*4;
  const cx=14+col*28,cy=12+row*25;
  const x=cx-Math.floor(w/2),y=cy-Math.floor(h/2),c={x:cx,y:cy};
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)map[yy][xx]=0;
  rooms.push({x,y,w,h,c,sector:row*3+col,baseW,baseH,kind:'normal'});
 }
 const candidates=[];
 for(let row=0;row<2;row++)for(let col=0;col<3;col++){
  const i=row*3+col;if(col<2)candidates.push({i,j:i+1,weight:rng()});
  if(row<1)candidates.push({i,j:i+3,weight:rng()});
 }
 candidates.sort((a,b)=>a.weight-b.weight);
 const parent=rooms.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;},links=[];
 for(const e of candidates){const a=root(e.i),b=root(e.j);if(a!==b){parent[a]=b;links.push(e);}}
 function graphDistances(start){const ds=Array(6).fill(-1),q=[start];ds[start]=0;for(let n=0;n<q.length;n++)for(const e of links){const v=e.i===q[n]?e.j:e.j===q[n]?e.i:-1;if(v>=0&&ds[v]<0){ds[v]=ds[q[n]]+1;q.push(v);}}return ds;}
 const farthest=ds=>ds.indexOf(Math.max(...ds));const startIdx=farthest(graphDistances(ri(0,5))),bossIdx=farthest(graphDistances(startIdx));
 // Optional shortcuts never add another route through the boss sector.
 for(const e of candidates)if(!links.includes(e)&&e.i!==bossIdx&&e.j!==bossIdx&&rng()<.6)links.push(e);
 const width=MAP_SPEC.corridorWidth;
 for(const e of links){const a=rooms[e.i].c,b=rooms[e.j].c;
  // Adjacent macro sectors share an axis; every throat is exactly four cells.
  let x0,y0,w,h;
  if(a.y===b.y){x0=Math.min(a.x,b.x);y0=a.y-1;w=Math.abs(a.x-b.x)+1;h=width;}
  else{x0=a.x-1;y0=Math.min(a.y,b.y);w=width;h=Math.abs(a.y-b.y)+1;}
  for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++)map[y][x]=0;
  corridors.push({x:x0,y:y0,w,h,width,fromSector:e.i,toSector:e.j});
 }
 const ordered=[rooms[startIdx],...rooms.filter((r,i)=>i!==startIdx&&i!==bossIdx),rooms[bossIdx]];
 ordered.forEach((r,i)=>r.index=i);ordered[0].kind='start';ordered.at(-1).kind='boss';
 const start=center(ordered[0].c),exit=center(ordered.at(-1).c);
 const result={map,rooms:ordered,start,exit,seed:seed>>>0,links:links.length,corridors,mapSpec:{...MAP_SPEC},fallback:false};
 result.shortestPath=tileDistance(map,start,exit);return result;
}
function tileDistance(map,start,end){const a=tile(start.x,start.y),b=tile(end.x,end.y),ds=new Int32Array(NX*NY).fill(-1),q=[a.y*NX+a.x];ds[q[0]]=0;
 for(let i=0;i<q.length;i++){const k=q[i],x=k%NX,y=Math.floor(k/NX);if(x===b.x&&y===b.y)return ds[k];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*NX+xx;if(xx<0||yy<0||xx>=NX||yy>=NY||map[yy][xx]||ds[j]>=0)continue;ds[j]=ds[k]+1;q.push(j);}}return -1;}
function dungeonFallback(seed){const d=dungeon(0x714a);d.seed=seed>>>0;d.fallback=true;return d;}
function validateDungeon(d){if(!d||!d.rooms?.length||d.map.length!==NY||d.map.some(r=>r.length!==NX))return false;
 const a=tile(d.start.x,d.start.y),q=[a],seen=new Set([a.y*NX+a.x]);if(d.map[a.y]?.[a.x]!==0)return false;
 for(let i=0;i<q.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i].x+dx,y=q[i].y+dy,k=y*NX+x;if(x>=0&&y>=0&&x<NX&&y<NY&&!d.map[y][x]&&!seen.has(k)){seen.add(k);q.push({x,y});}}
 const end=tile(d.exit.x,d.exit.y);return seen.has(end.y*NX+end.x)&&d.rooms.every(r=>seen.has(r.c.y*NX+r.c.x))&&d.map.every((row,y)=>row.every((v,x)=>v!==0||seen.has(y*NX+x)))&&d.map[0].every(v=>v===1)&&d.map[NY-1].every(v=>v===1)&&d.map.every(row=>row[0]===1&&row[NX-1]===1);
}

// Equipment activation is a fixed-point pass: an item cannot bootstrap its own Strength/Dexterity requirement.
function activeEquipment(excluded=[]){const p=S.p,attrs={...p.attributes},remaining=Object.entries(p.eq).filter(([slot,i])=>i&&!excluded.includes(slot)),out=[];for(let pass=0;pass<8;pass++){let added=false;for(let i=remaining.length-1;i>=0;i--){const [slot,it]=remaining[i],b=BASE[it.baseId];if(!b||p.level<it.reqLevel||b.classOnly&&b.classOnly!==S.hero||attrs.strength<(it.requirements?.strength||0)||attrs.dexterity<(it.requirements?.dexterity||0))continue;out.push(it);for(const k of ['strength','dexterity','vitality','energy'])attrs[k]+=it.mods?.[k]||0;remaining.splice(i,1);added=true;}if(!added)break;}return out;}
// Restored published growth / affix constraints. Drop weights are independent web balancing, not ItemRatio.txt.
function softRank(id){const sk=SKILL[id];if(!sk||sk.class_id!==S.hero)return 0;let hard=S.p.skills[id]||0,specific=0,bonus=0;for(const i of activeEquipment()){specific+=i.staffmods?.[id]||0;bonus+=i.mods?.allSkills||0;bonus+=i.mods?.[S.hero+'Skills']||0;if(S.hero==='sorceress'&&sk.tree_id.includes('fire'))bonus+=i.mods?.sorceressFireSkills||0;}return hard+specific>0?hard+specific+bonus:0;}
function curveRow(id,rank=softRank(id)){const c=CURVE[id];return c?{...c.constants,...c.rows[clamp(Math.floor(rank||1),1,20)-1]}:{};}
function stats(){const p=S.p,c=CLASS[S.hero],eq=activeEquipment(),mods={};for(const i of eq)for(const [k,v] of Object.entries(i.mods||{}))mods[k]=(mods[k]||0)+v;
 const attr={...p.attributes};for(const k of ['strength','dexterity','vitality','energy'])attr[k]+=(mods[k]||0);
 const w=eq.includes(p.eq.weapon)?p.eq.weapon:null,b=w&&BASE[w.baseId],isBow=b?.type==='bow',mastery=b?.type==='sword'?'barbarian_sword_mastery':b?.type==='claw'?'assassin_claw_mastery':null,mr=mastery&&softRank(mastery)>0?curveRow(mastery):{};
 const shape=p.buffs?.shape,shapeRow=shape?curveRow(shape.id):{},strengthBonus=isBow?attr.dexterity:b?.type==='javelin'||b?.type==='claw'?Math.floor(.75*(attr.strength+attr.dexterity)):attr.strength;
 let offED=(mods.offED||0)+strengthBonus+(mr.damage_percent||0)+(shapeRow.damage_percent||0);if(p.aura==='paladin_might')offED+=40+20*Math.max(0,softRank(p.aura)-1);
 const baseMin=w?.damage?.[0]??1,baseMax=w?.damage?.[1]??2,minD=Math.max(1,Math.floor(baseMin*(1+offED/100))),maxD=Math.max(minD,Math.floor(baseMax*(1+offED/100)));
 let defense=Math.floor(attr.dexterity/4)+eq.reduce((n,i)=>n+(i.def||0),0),defPercent=shapeRow.defense_percent||0;if(p.aura==='paladin_defiance')defPercent+=60+10*softRank(p.aura);if(p.buffs?.shout)defPercent+=80+20*p.buffs.shout.rank;if(p.buffs?.frozenarmor)defPercent+=30+5*p.buffs.frozenarmor.rank;defense=Math.floor(defense*(1+defPercent/100));
 const baseAR=Math.max(5,5*attr.dexterity-35+({amazon:5,assassin:15,barbarian:20,druid:5,necromancer:-10,paladin:20,sorceress:-15})[S.hero]);let ar=Math.floor((baseAR+(mods.ar||0))*(1+(mr.attack_rating_percent||0)/100));if(shape)ar=Math.floor(ar*(1+(shapeRow.attack_rating_percent||0)/100));
 let crit=0;if(softRank('amazon_critical_strike'))crit=(curveRow('amazon_critical_strike').double_physical_damage_chance_percent||0)/100;crit=Math.max(crit,(mr.critical_chance_percent||0)/100);
 const res={};for(const k of ['fire','cold','lightning','poison'])res[k]=clamp((mods[k+'Res']||0)+(mods.resist||0)+(S.world?.flags.anya?10:0),-100,75);
 let life=c.initial_resources.life+(p.level-1)*c.per_character_level.life+(attr.vitality-c.initial_attributes.vitality)*c.per_attribute_point.life_per_vitality+(mods.life||0),mana=c.initial_resources.mana+(p.level-1)*c.per_character_level.mana+(attr.energy-c.initial_attributes.energy)*c.per_attribute_point.mana_per_energy+(mods.mana||0);
 let hpPct=shape?((shapeRow.life_percent??(shape.form==='bear'?75:25))+(softRank('druid_lycanthropy')?curveRow('druid_lycanthropy').life_percent||0:0)):0;if(p.buffs?.orders){hpPct+=35+3*p.buffs.orders.rank;mana*=1+(35+3*p.buffs.orders.rank)/100;}if(S.minions?.some(m=>m.pet==='oak'))hpPct+=30+5*softRank('druid_oak_sage');life*=1+hpPct/100;
 const sh=eq.includes(p.eq.offhand)&&BASE[p.eq.offhand.baseId],classBlock=['paladin'].includes(S.hero)?10:['amazon','assassin','barbarian'].includes(S.hero)?5:0;let block=sh?.type==='shield'?clamp(Math.floor(((sh.block||0)+classBlock+(mods.block||0))*(attr.dexterity-15)/(p.level*2)),0,75):0;if(p.running)block/=3;
 const warmth=softRank('sorceress_warmth')?curveRow('sorceress_warmth').mana_regeneration_percent||0:0;
 return{...attr,minDamage:minD,maxDamage:maxD,weaponDamage:[baseMin,baseMax],offED,atk:Math.round((minD+maxD)/2),def:p.running?0:defense,ar,crit,resist:Math.min(...Object.values(res)),resistances:res,leech:(mods.leech||0)/100,life:Math.max(1,Math.floor(life)),mana:Math.max(1,Math.floor(mana)),mf:mods.mf||0,block,regen:Math.max(1,mana)/120*(1+(warmth+(mods.manaRegen||0))/100),ias:(mods.ias||0)+(shapeRow.increased_attack_speed_percent||0)+(p.buffs?.speed?curveRow('assassin_burst_of_speed').increased_attack_speed_percent||0:0),fcr:mods.fcr||0,mods};}
function recalcResources(){if(!S)return;const v=stats();S.p.maxHp=v.life;S.p.maxMp=v.mana;S.p.hp=clamp(S.p.hp,0,v.life);S.p.mp=clamp(S.p.mp,0,v.mana);}
function allocateStat(k){if(!active()||!['strength','dexterity','vitality','energy'].includes(k)||S.p.statPoints<1)return false;S.p.attributes[k]++;S.p.statPoints--;recalcResources();refresh();return true;}
function skillReason(id){const p=S.p,s=SKILL[id];if(!s||s.class_id!==S.hero)return '다른 직업';if(!s.runtime)return '참조 전용 · 런타임 미복원';const r=p.skills[id]||0;if(r>=20)return '직접 투자 최대 20';if(p.level<s.required_character_level+r)return `캐릭터 Lv.${s.required_character_level+r} 필요`;const missing=s.requires.filter(k=>!(p.skills[k]>0));if(missing.length)return '선행: '+missing.map(k=>SKILL[k]?.label_ko||k).join(', ');if(p.points<1)return '포인트 부족';return '';}
function learnSkill(id){if(!active()||skillReason(id))return false;S.p.skills[id]=(S.p.skills[id]||0)+1;S.p.points--;if(SKILL[id].runtime.kind!=='passive'&&!S.p.skillBindings.includes(id)){const i=S.p.skillBindings.indexOf(null);if(i>=0)S.p.skillBindings[i]=id;}recalcResources();log(SKILL[id].label_ko+' · 직접 투자 '+S.p.skills[id]);refresh();return true;}
function levelCheck(){const p=S.p;while(p.level<99&&p.xp>=D2DATA.experience[p.level].total_experience){p.level++;p.points++;p.statPoints+=5;recalcResources();p.hp=p.maxHp;p.mp=p.maxMp;log(`레벨 ${p.level} · 능력치 +5 / 스킬 +1`);}}
function upgrade(id){return learnSkill(id);}function trainPassive(id){return learnSkill(id);}
function affixLevelForBase(a,b){return a.levelByType?.[b.type]??a.levelByType?.[b.slot]??a.level;}
function affixEligible(a,b,alvl,quality){if(affixLevelForBase(a,b)>alvl||quality==='rare'&&!a.rare||a.excludeTypes?.includes(b.type))return false;return a.types.some(t=>t===b.type||t===b.slot||t==='physical_weapon'&&b.slot==='weapon'||t==='weapon'&&b.slot==='weapon');}
function affixProperties(a,b,alvl){let v=a.propertiesByType?.[b.type]||a.properties;for(const alt of a.variants||[])if(alvl>=alt.minLevel)v=alt.properties;return v;}
function affixLevel(ilvl,b){ilvl=clamp(Math.max(ilvl,b.qlvl),1,99);return Math.min(99,b.magicLevel?ilvl+b.magicLevel:ilvl<99-Math.floor(b.qlvl/2)?ilvl-Math.floor(b.qlvl/2):2*ilvl-99);}
function rollQuality(mf=0,rng=random){const q=D2DATA.loot.quality;mf=Math.max(0,mf);const effective=mf*q.rareMFDiminishing/(mf+q.rareMFDiminishing);if(rng()<Math.min(q.rareCap,q.rareBase*(1+effective/100)))return 'rare';return rng()<Math.min(q.magicCap,q.magicBase*(1+mf/100))?'magic':'normal';}
function generateItem(options={}){const ilvl=clamp(options.ilvl??(AREA[S?.world?.areaId]?.webEncounterLevel||1),1,99),eligible=D2DATA.bases.filter(b=>b.qlvl<=ilvl&&(options.type?b.type===options.type||b.slot===options.type:true)),b=BASE[options.baseId]||(eligible.length?choose(eligible):BASE.short_sword);let quality=options.quality||rollQuality(stats().mf);const alvl=affixLevel(ilvl,b),pool=D2DATA.affixes.filter(a=>affixEligible(a,b,alvl,quality)),picked=[],groups=new Set();
 function pick(side){const list=pool.filter(a=>a.side===side&&!groups.has(a.side+':'+a.group)&&picked.filter(v=>v.side===side).length<(quality==='rare'?3:1));if(!list.length)return false;const a=choose(list),properties={};for(const[k,v]of Object.entries(affixProperties(a,b,alvl)))properties[k]=rand(v[0],v[1]);picked.push({id:a.id,name:a.name,side:a.side,group:a.group,properties,reqLevel:Math.floor(affixLevelForBase(a,b)*.75)});groups.add(a.side+':'+a.group);return true;}
 if(quality==='magic'){const r=random();if(r<.25){pick('prefix');pick('suffix');}else if(r<.5)pick('prefix');else pick('suffix');if(!picked.length){if(!pick('prefix'))pick('suffix');}}
 if(quality==='rare'){const count=rand(2,6);for(let n=0;n<count;n++){const side=random()<.5?'prefix':'suffix';if(!pick(side))pick(side==='prefix'?'suffix':'prefix');}}
 if(quality==='rare'&&picked.length<2)quality=picked.length?'magic':'normal';if(quality!=='normal'&&!picked.length)quality='normal';const mods={};for(const a of picked)for(const[k,v]of Object.entries(a.properties))mods[k]=(mods[k]||0)+v;
 const ethereal=!options.noEthereal&&b.durability>0&&!['bow','javelin'].includes(b.type)&&random()<.05;const ed=1+(mods.ed||mods.enhancedDamage||0)/100,edef=1+(mods.edef||mods.enhancedDefense||0)/100;
 const damage=b.damage?b.damage.map(v=>Math.floor(Math.floor(v*(ethereal?1.5:1))*ed)):null,def=b.defense?Math.floor(Math.floor(((mods.edef||0)>0?b.defense[1]+1:rand(...b.defense))*(ethereal?1.5:1))*edef):0;
 const cap=Math.min(b.maxSockets||0,ilvl<=25?3:ilvl<=40?4:6),sockets=quality==='normal'&&!options.noSockets&&cap>0&&random()<.18?rand(1,cap):0;
 const it={id:'item-'+S.nextId++,baseId:b.id,kind:b.type,slot:b.slot,rarity:quality,name:b.name,symbol:itemDefs[b.type]?.[1]||'◇',ilvl,qlvl:b.qlvl,alvl,reqLevel:Math.max(b.reqLevel||0,...picked.map(a=>a.reqLevel||0)),requirements:{strength:Math.max(0,b.strength-(ethereal?10:0)),dexterity:Math.max(0,b.dexterity-(ethereal?10:0))},damage,atk:damage?Math.round((damage[0]+damage[1])/2):0,def,mods,affixes:picked,sockets,gems:[],ethereal,durability:b.durability||0,maxDurability:b.durability||0,value:Math.round((10+ilvl*4)*(quality==='rare'?3:quality==='magic'?2:1)),staffmods:{},ruleProfile:'web-selected-subset-v26'};
 if(quality==='magic')it.name=(picked.find(a=>a.side==='prefix')?.name+' ').replace('undefined ','')+b.name+(picked.find(a=>a.side==='suffix')?' of '+picked.find(a=>a.side==='suffix').name:'');if(quality==='rare')it.name=choose(['Ash','Dread','Rune','Storm'])+' '+choose(['Crest','Song','Mark','Grasp'])+' · '+b.name;
 if(!options.noStaffmods&&['staff','wand'].includes(b.type)&&random()<.45){const cl=b.type==='staff'?'sorceress':'necromancer',candidates=D2DATA.skills.filter(s=>s.class_id===cl&&s.runtime&&s.required_character_level<=Math.min(30,ilvl+4));if(candidates.length)it.staffmods[choose(candidates).id]=rand(1,3);}
 return it;}
function makeItem(kind,forceRare=false){if(kind==='health'||kind==='mana')return{id:'item-'+S.nextId++,kind,slot:'consumable',name:itemDefs[kind][0],symbol:itemDefs[kind][1],rarity:'normal',value:10};return generateItem({type:kind==='axe'?'axe':kind,quality:forceRare?'rare':undefined});}
function makeRune(id){const r=D2DATA.runes.find(v=>v.id===id);return{id:'item-'+S.nextId++,kind:'rune',runeId:id,slot:'rune',name:r.name_en+' Rune',symbol:'ᚱ',rarity:'normal',value:r.ordinal*12,reqLevel:r.required_level};}
function canEquip(it,slot=it.slot){if(!it.baseId)return '장비가 아닙니다.';const b=BASE[it.baseId],p=S.p;if(!Object.hasOwn(p.eq,slot))return '장비 슬롯 오류';if(slot!==b.slot&&!(b.slot==='ring'&&slot==='ring2')&&!(b.slot==='weapon'&&slot==='offhand'))return '맞지 않는 장비 슬롯';if(b.classOnly&&b.classOnly!==S.hero)return '직업 전용 장비';if(p.level<it.reqLevel)return `Lv.${it.reqLevel} 필요`;if(slot==='offhand'&&p.eq.weapon&&BASE[p.eq.weapon.baseId]?.twoHand)return '양손 무기를 먼저 해제하세요.';if(slot==='offhand'&&b.slot==='weapon'&&!(S.hero==='barbarian'&&!b.twoHand||S.hero==='assassin'&&b.type==='claw'))return '보조 손 무기 제한';const check={...p.attributes};const excluded=slot==='weapon'&&b.twoHand?[slot,'offhand']:[slot];for(const e of activeEquipment(excluded))for(const a of ['strength','dexterity'])check[a]+=e.mods?.[a]||0;for(const a of ['strength','dexterity'])if(check[a]<(it.requirements?.[a]||0))return `${a==='strength'?'힘':'민첩'} ${it.requirements[a]} 필요`;return '';}
function useItem(index,slotOverride){const p=S.p,it=p.inv[index];if(!it||!active())return false;if(it.slot==='consumable'){if(it.kind==='health')p.hp=Math.min(p.maxHp,p.hp+60);else p.mp=Math.min(p.maxMp,p.mp+60);p.inv.splice(index,1);log(it.name+' 사용 · 회복량은 웹 조정값');refresh();return true;}if(it.slot==='rune'){openItemInspector(it);return false;}let slot=slotOverride||it.slot;if(slot==='ring'&&p.eq.ring&&!p.eq.ring2)slot='ring2';const why=canEquip(it,slot);if(why){log(why);return false;}let removed=[];if(p.eq[slot])removed.push(p.eq[slot]);if(slot==='weapon'&&BASE[it.baseId].twoHand&&p.eq.offhand){removed.push(p.eq.offhand);}if(slot==='offhand'&&BASE[p.eq.weapon?.baseId]?.twoHand){log('양손 무기를 먼저 해제하세요.');return false;}if(p.inv.length-1+removed.length>40){log('가방 공간이 부족합니다.');return false;}if(slot==='weapon'&&BASE[it.baseId].twoHand)p.eq.offhand=null;p.inv.splice(index,1);p.eq[slot]=it;p.inv.push(...removed);recalcResources();log(it.name+' 장착');refresh();return true;}
function equipOff(slot){if(!active()||!S.p.eq[slot]||S.p.inv.length>=40)return;const p=S.p;p.inv.push(p.eq[slot]);p.eq[slot]=null;recalcResources();refresh();}
function potion(kind){const i=S.p.inv.findIndex(x=>x.kind===kind);if(i<0){log('물약이 없습니다.');return;}useItem(i);}
function atTown(){return AREA[S?.world?.areaId]?.kind==='town';}function materials(){return S.materials;}
function salvage(){log('원작 규칙 모드에서는 임의 정수 분해를 사용하지 않습니다.');}function forge(){log('원작에는 +5 강화가 없습니다. 장비 생성/룬 데이터는 정보 창에서 확인하세요.');}function inscribe(){showItemLab();}function socketRune(){showItemLab();}
function gamble(){if(!active()||!atTown()||S.p.gold<120||S.p.inv.length>=40){log('마을 · 120G · 빈 슬롯이 필요합니다.');return;}S.p.gold-=120;S.p.inv.push(generateItem({ilvl:clamp(S.p.level+rand(-5,4),1,99),quality:random()<.12?'rare':'magic'}));log('웹 시험 도박 · 원작 품질/가격 확률 미복원');refresh();}
function pickTreasureRef(ref,rng=random,depth=0){if(depth>16)throw Error('TC 순환/깊이 오류');const table=D2DATA.loot.tables[ref];if(!table){if(!D2DATA.loot.terminalRefs.includes(ref))throw Error('TC 참조 오류: '+ref);return ref;}const total=table.entries.reduce((n,e)=>n+e.weight,0);let roll=rng()*total;for(const e of table.entries){roll-=e.weight;if(roll<0)return pickTreasureRef(e.ref,rng,depth+1);}return pickTreasureRef(table.entries.at(-1).ref,rng,depth+1);}
function lootRoll(e){const ilvl=e.level||1,ref=pickTreasureRef(e.type==='boss'?D2DATA.loot.bossRoot:D2DATA.loot.root);if(ref==='NoDrop')return null;if(ref==='health'||ref==='mana')return makeItem(ref);if(ref==='runes')return makeRune(D2DATA.runes[rand(0,Math.min(10,Math.floor(ilvl/3)))].id);return generateItem({ilvl,quality:ref==='rare_equipment'?'rare':undefined});}

// One source of truth for wall / gate queries. Never ignore a closed gate in pathfinding.
function gateTiles(d){const r=d.rooms.at(-1),out=[];if(!r)return out;const inside=(x,y)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
 for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){if(d.map[y]?.[x]!==0)continue;if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!inside(x+dx,y+dy)&&d.map[y+dy]?.[x+dx]===0))out.push({x,y});}return out;}
function tileOpen(map,x,y,locked){return x>=0&&y>=0&&x<NX&&y<NY&&map[y][x]===0&&!(locked&&locked.has(y*NX+x));}
function reachTiles(map,start,locked){const a=tile(start.x,start.y),seen=new Set(),q=[];if(!tileOpen(map,a.x,a.y,locked))return {seen,q};seen.add(a.y*NX+a.x);q.push(a);for(let i=0;i<q.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i].x+dx,y=q[i].y+dy,k=y*NX+x;if(tileOpen(map,x,y,locked)&&!seen.has(k)){seen.add(k);q.push({x,y});}}return {seen,q};}
function gatesLocked(){if(!S||S.keyCount>=1)return null;if(gateCacheVersion!==navVersion||!gateCacheSet||gateCacheGates!==S.director?.gates){gateCacheSet=new Set((S.director?.gates||[]).map(a=>a.y*NX+a.x));gateCacheVersion=navVersion;gateCacheGates=S.director?.gates;}return gateCacheSet;}
function gateBlocked(x,y){const t=tile(x,y);return !!gatesLocked()?.has(t.y*NX+t.x);}
function walk(x,y,r=10,ignoreGate=false){const minX=Math.floor((x-r)/T),maxX=Math.floor((x+r)/T),minY=Math.floor((y-r)/T),maxY=Math.floor((y+r)/T),locked=ignoreGate?null:gatesLocked();
 for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++){const solid=tx<0||ty<0||tx>=NX||ty>=NY||S.map[ty][tx]!==0||locked?.has(ty*NX+tx);if(!solid)continue;const cx=clamp(x,tx*T,(tx+1)*T),cy=clamp(y,ty*T,(ty+1)*T);if((cx-x)**2+(cy-y)**2<r*r-.001)return false;}return true;}
function move(o,dx,dy){const n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5)),sx=dx/n,sy=dy/n,ox=o.x,oy=o.y;for(let i=0;i<n;i++){if(walk(o.x+sx,o.y,o.r||10))o.x+=sx;if(walk(o.x,o.y+sy,o.r||10))o.y+=sy;}const m=Math.hypot(o.x-ox,o.y-oy);if(m>.01){o.walkPhase=(o.walkPhase||0)+m*.13;if(!o.attackAnim)o.face=Math.atan2(o.y-oy,o.x-ox);}return m;}
function lineClear(a,b,r=2){const d=distance(a,b),n=Math.max(1,Math.ceil(d/5));for(let i=0;i<=n;i++)if(!walk(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,r))return false;return true;}
// A* uses four-neighbour collision-safe nodes; direct sight skips path search.
function route(from,to,r=10){
 if(walk(to.x,to.y,r)&&lineClear(from,to,r))return distance(from,to)>2?[{x:to.x,y:to.y}]:[];
 const a=tile(from.x,from.y),want=tile(to.x,to.y),locked=gatesLocked(),start=a.y*NX+a.x;
 const costs=new Float64Array(NX*NY).fill(Infinity),prev=new Int32Array(NX*NY).fill(-1),closed=new Uint8Array(NX*NY),heap=[];
 const heur=k=>Math.abs(k%NX-want.x)+Math.abs(Math.floor(k/NX)-want.y);
 function push(k,f){let i=heap.length;heap.push({k,f});while(i){let j=(i-1)>>1;if(heap[j].f<=f)break;heap[i]=heap[j];i=j;}heap[i]={k,f};}
 function pop(){const out=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let j=i*2+1;if(j+1<heap.length&&heap[j+1].f<heap[j].f)j++;if(heap[j].f>=last.f)break;heap[i]=heap[j];i=j;}heap[i]=last;}return out.k;}
 costs[start]=0;push(start,heur(start));let best=start,bestH=heur(start),end=-1;
 while(heap.length){const k=pop();if(closed[k])continue;closed[k]=1;const x=k%NX,y=Math.floor(k/NX),hh=heur(k);if(hh<bestH){best=k;bestH=hh;}if(x===want.x&&y===want.y){end=k;break;}
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,j=yy*NX+xx;if(!tileOpen(S.map,xx,yy,locked)||closed[j]||!walk((xx+.5)*T,(yy+.5)*T,r))continue;const g=costs[k]+1;if(g<costs[j]){costs[j]=g;prev[j]=k;push(j,g+heur(j));}}
 }
 let k=end<0?best:end;const path=[];while(k!==start&&prev[k]>=0){path.push(center({x:k%NX,y:Math.floor(k/NX)}));k=prev[k];}path.reverse();
 if(end>=0&&walk(to.x,to.y,r)&&path.length)path[path.length-1]={x:to.x,y:to.y};return path;
}
function navigate(e,goal,dt,speed){e.pathTime=(e.pathTime||0)-dt;const movedGoal=!e.pathGoal||distance(e.pathGoal,goal)>34;if(e.pathTime<=0||e.navVersion!==navVersion||movedGoal){e.path=route(e,goal,e.r||10);e.pathGoal={x:goal.x,y:goal.y};e.pathTime=.48+((e.id||0)%5)*.04;e.navVersion=navVersion;}
 while(e.path?.length&&distance(e,e.path[0])<4)e.path.shift();let dest=e.path?.[0];if(!dest)return;
 const d=distance(e,dest),step=Math.min(speed*dt,d),vx=(dest.x-e.x)/(d||1),vy=(dest.y-e.y)/(d||1);const walked=move(e,vx*step,vy*step);if(walked<step*.15)e.pathTime=0;
}
function tacticalPoint(e,target,mode){const reachable=localReach(e,modeRadius(mode));let best={x:e.x,y:e.y},score=-Infinity;const player=S.p;
 for(const t of reachable){const p=center(t),selfDist=distance(e,p),pd=distance(player,p);if(selfDist>modeRadius(mode)||!walk(p.x,p.y,e.r))continue;let val;
 if(mode==='retreat')val=Math.min(pd,230)*1.6-selfDist*.38+(lineClear(p,player)?0:38);
 else if(mode==='kite')val=-Math.abs(pd-145)*1.5-selfDist*.3+(lineClear(p,player)?30:-45);
 else val=-distance(p,target)-selfDist*.12;
 if(val>score){score=val;best=p;}}
 return best;
}
function localReach(origin,radius){const a=tile(origin.x,origin.y),q=[a],seen=new Set([a.y*NX+a.x]),locked=gatesLocked();for(let n=0;n<q.length;n++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[n].x+dx,y=q[n].y+dy,k=y*NX+x;if(seen.has(k)||!tileOpen(S.map,x,y,locked)||Math.hypot((x+.5)*T-origin.x,(y+.5)*T-origin.y)>radius)continue;seen.add(k);q.push({x,y});}return q;}
function modeRadius(mode){return mode==='retreat'?180:mode==='kite'?140:230;}
// Geometry, locked-state reachability and key placement are checked on the SAME compiled data.
function compileDungeon(seed,floor=1){let d=dungeon(seed);if(!validateDungeon(d))d=dungeonFallback(seed);let content=compileContent(d,floor);
 if(!content.validation.ok){d=dungeonFallback(seed);content=compileContent(d,floor);}
 return {...d,content};
}
function compileContent(d,floor){const rng=seedRng((d.seed^Math.imul(floor,2654435761))>>>0),gates=gateTiles(d),locked=new Set(gates.map(a=>a.y*NX+a.x)),reach=reachTiles(d.map,d.start,locked),full=reachTiles(d.map,d.start,null),end=tile(d.exit.x,d.exit.y);
 const rooms=d.rooms.map((r,i)=>({...r,index:i,kind:i===0?'start':i===d.rooms.length-1?'boss':'combat'}));
 const optional=rooms.slice(1,-1);for(let i=optional.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[optional[i],optional[j]]=[optional[j],optional[i]];}
 const kinds=['treasure','elite','shrine','trap','combat'];optional.forEach((r,i)=>r.kind=kinds[i%kinds.length]);
 const candidates=rooms.slice(1,-1).filter(r=>reach.seen.has(r.c.y*NX+r.c.x));let keyRoom=candidates.filter(r=>r.kind!=='shrine').sort((a,b)=>distance(center(b.c),d.start)-distance(center(a.c),d.start))[0]||candidates[0]||rooms[0];
 const objects=[];for(const r of rooms){let kind=({treasure:'chest',shrine:'shrine',trap:'trap'})[r.kind];if(kind)objects.push({id:`${kind}-${r.index}`,kind,...center(r.c),used:false,room:r.index});}
 let keyPos=center(keyRoom.c);if(objects.some(o=>distance(o,keyPos)<20)){const options=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:keyRoom.c.x+dx,y:keyRoom.c.y+dy})).filter(t=>reach.seen.has(t.y*NX+t.x));if(options.length)keyPos=center(options[0]);}
 objects.push({id:`key-${keyRoom.index}`,kind:'key',...keyPos,used:false,room:keyRoom.index});
 const encounters=rooms.filter(r=>r.kind!=='start'&&r.kind!=='boss').map(r=>({room:r.index,kind:r.kind,budget:7+floor*2+(r.kind==='elite'?4:0),count:r.kind==='shrine'?0:6+Math.min(3,Math.floor(floor/2))+(r.kind==='elite'?2:0),groups:r.kind==='elite'?3:2}));
 const kp=tile(keyPos.x,keyPos.y),validKey=reach.seen.has(kp.y*NX+kp.x),exitOpen=full.seen.has(end.y*NX+end.x),exitLocked=!reach.seen.has(end.y*NX+end.x);
 return {rooms,objects,gates,encounters,validation:{ok:validKey&&exitOpen&&exitLocked&&gates.length>0,keyReachable:validKey,exitOpen,exitLocked},keyRoom:keyRoom.index};
}
function makeEnemy(x,y,type='grunt',extra={}){const f=S.floor,boss=type==='boss',elite=type==='elite',caster=type==='caster';const hp=boss?220+f*82:elite?64+f*20:caster?28+f*10:36+f*12;
 return {id:S.nextId++,x,y,r:boss?12:10,visualRadius:boss?20:elite?14:12,type,hp,maxHp:hp,speed:boss?39:elite?58:caster?49:54,atk:boss?15+f*3:elite?8+f*2:6+f*2,modifier:elite?choose(['swift','armored','vampiric','volatile','frost']):null,cd:.3+random(),skillCd:2,phase:0,stun:0,activated:false,aggro:0,path:[],pathTime:0,face:1.57,walkPhase:0,attackAnim:0,flash:0,windup:null,...extra};
}
function applyContent(d){S.map=d.map;S.rooms=d.rooms;S.exit=d.exit;S.dungeonSeed=d.seed;S.director=d.content||compileContent(d,S.floor);S.keyCount=0;S.squads={};S.enemies=[];S.shrines=[];S.roomProgress={};S.mapSpec={...MAP_SPEC};S.townReturn=null;S.channel=null;navVersion++;
 const rng=seedRng((d.seed^0x45d9f3b)>>>0);
 for(const enc of S.director.encounters){const r=S.rooms[enc.room];S.roomProgress[r.index]={started:false,cleared:enc.count===0,rewardClaimed:false};if(!enc.count)continue;
  const anchors=[{x:(r.x+r.w*.27)*T,y:(r.y+r.h*.3)*T},{x:(r.x+r.w*.73)*T,y:(r.y+r.h*.7)*T},{x:(r.x+r.w*.73)*T,y:(r.y+r.h*.27)*T}];
  let remaining=enc.count;
  for(let group=0;group<enc.groups;group++){
   const anchor=anchors[group],places=[];for(let y=r.y+1;y<r.y+r.h-1;y++)for(let x=r.x+1;x<r.x+r.w-1;x++){const p=center({x,y});if(walk(p.x,p.y,10)&&distance(p,S.p)>110&&distance(p,anchor)<112&&!S.director.objects.some(o=>distance(o,p)<36)&&!S.enemies.some(e=>distance(e,p)<26))places.push(p);}
   for(let i=places.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[places[i],places[j]]=[places[j],places[i]];}
   const n=Math.min(Math.ceil(remaining/(enc.groups-group)),places.length),id=`f${S.floor}r${enc.room}g${group}`;remaining-=n;if(!n)continue;
   S.squads[id]={id,initialSize:n,room:enc.room,order:'dormant',morale:1,orderTime:0,retreatUntil:0,leaderLost:false};
   for(let j=0;j<n;j++){const type=j===0&&enc.kind==='elite'?'elite':j===n-1&&n>2?'caster':'grunt';S.enemies.push(makeEnemy(places[j].x,places[j].y,type,{squadId:id,encounterRoom:enc.room,tactic:j===0?'captain':type==='caster'?'skirmisher':j%2?'flanker':'guardian',formationIndex:j,home:{...anchor}}));}
  }
 }
 S.enemies.push(makeEnemy(S.exit.x,S.exit.y,'boss',{home:{...S.exit},bossName:bossNames[S.floor-1]}));S.bossDead=false;S.questKills=0;S.questTarget=Math.min(14,Math.max(6,S.enemies.length-1));S.questRewarded=false;
}
function verifyDirector(count=1000){let failures=0,minRooms=99,maxRooms=0,fallbacks=0,firstFailure=null,repeatOK=true;const start=performance.now();for(let i=0;i<count;i++){const seed=(Math.imul(i,7919)+23)>>>0,d=compileDungeon(seed,1+i%5),b=compileDungeon(seed,1+i%5);const valid=validateDungeon(d)&&d.content.validation.ok&&JSON.stringify(d)===JSON.stringify(b);if(!valid){failures++;firstFailure??=seed;}if(d.fallback)fallbacks++;if(JSON.stringify(d)!==JSON.stringify(b))repeatOK=false;minRooms=Math.min(minRooms,d.rooms.length);maxRooms=Math.max(maxRooms,d.rooms.length);}
 return {count,failures,firstFailure,deterministic:repeatOK,minRooms,maxRooms,fallbacks,ms:Math.round(performance.now()-start)};
}

function hurtEnemy(e,raw,critChance=0){if(!e||e.hp<=0||!S.enemies.includes(e))return 0;if(e.type==='boss'&&!S.keyCount){float(e.x,e.y,'봉인','#edc97c');return 0;}
 const crit=random()<critChance,mult=e.modifier==='armored'?.7:1,dmg=Math.max(1,Math.round(raw*mult*(crit?1.75:1))),actual=Math.min(e.hp,dmg);e.hp-=dmg;e.flash=.12;e.activated=true;e.aggro=8;S.p.hp=Math.min(S.p.maxHp,S.p.hp+actual*stats().leech);float(e.x,e.y-8,(crit?'✦ ':'')+dmg,crit?'#ffe095':'#ffffff');eventVfx('impact',e.x,e.y,14,crit?'#ffe2a1':'#b5f0ee',.18);sound(crit?'crit':'hit');if(e.hp<=0)kill(e);return actual;
}
function kill(e){const i=S.enemies.indexOf(e);if(i<0)return;S.enemies.splice(i,1);S.kills++;if(!e.summoned)S.questKills++;const boss=e.type==='boss',elite=e.type==='elite',p=S.p;
 if(!e.summoned){if(random()<(boss?1:elite?.45:.14))S.materials.essence++;if(random()<(boss?1:elite?.18:.035))S.materials.runes++;p.gold+=rand(5,12)*S.floor*(boss?6:1);p.xp+=(boss?115:elite?35:18)*S.floor;
 if(random()<(boss?1:elite?.85:.53)){const kind=choose(['sword','axe','staff','armor','helm','ring','health','health','mana']);S.drops.push({x:e.x,y:e.y,item:makeItem(kind,boss)});}if(boss)S.drops.push({x:e.x+8,y:e.y,item:makeItem(choose(['sword','armor','ring']),true)});
 }else{p.xp+=3*S.floor;p.gold+=2;}
 if(e.modifier==='volatile')S.hazards.push({x:e.x,y:e.y,r:53,delay:.95,total:.95,damage:e.atk*1.4,kind:'blast'});
 if(boss){S.bossDead=true;S.enemies=S.enemies.filter(a=>!a.summoned);S.hazards=[];S.shots=S.shots.filter(s=>s.friendly);log('수호자 처치! 황금 계단에서 F로 다음 층에 진입하세요.');sound('reward');eventVfx('ring',e.x,e.y,115,'#f6d98c',1.2);}
 levelCheck();if(S.questKills>=S.questTarget&&!S.questRewarded){S.questRewarded=true;p.gold+=60*S.floor;p.points++;log('현상금 완료 · 골드와 스킬 포인트 +1');}
}
function damagePlayer(raw){const p=S.p;if(p.dead||p.invuln>0||S.completed)return 0;const st=stats(),d=Math.max(1,Math.round((raw-st.def*.5)*(1-st.resist/100)*(p.guard>0?.48:1)));if(random()<Math.min(.18,st.def*.003)){float(p.x,p.y,'방어','#9fd4fa');return 0;}p.hp=Math.max(0,p.hp-d);if(S.channel){S.channel=null;log('피격으로 귀환이 취소되었습니다.');}p.flash=.16;float(p.x,p.y-8,'−'+d,'#ff8b87');screenShake=motionReduced?0:3;sound('hurt');if(!p.hp){p.dead=true;clickGoal=null;pointer.down=false;log('쓰러졌습니다. 부활하면 현재 층의 탐험과 처치 기록은 유지됩니다.');refresh();}return d;
}
function attackAnim(o,angle,duration=.3){o.face=angle;o.attackAnim=duration;o.attackTotal=duration;}
function fireShot(from,angle,speed,damage,kind,friendly=true,aoe=0){S.shots.push({x:from.x,y:from.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,dmg:damage,kind,friendly,aoe,r:kind==='arrow'?3:5,life:1.6});}
function targetsInCone(p,angle,range,arc){return S.enemies.filter(e=>e.hp>0&&distance(e,p)<range+e.r&&Math.abs(Math.atan2(Math.sin(Math.atan2(e.y-p.y,e.x-p.x)-angle),Math.cos(Math.atan2(e.y-p.y,e.x-p.x)-angle)))<arc/2&&lineClear(p,e,1));}
function cast(n,target=pointer){if(!active())return false;if(n===5)return ultimate();const p=S.p,st=stats(),angle=Math.atan2(target.y-p.y,target.x-p.x),name=skillNames[S.hero][n-1];
 if(n===1){if(p.cd>0)return false;p.cd=S.hero==='knight'?.34:S.hero==='ranger'?.38:.44;attackAnim(p,angle);if(S.hero==='knight'){const hits=targetsInCone(p,angle,49,2.5).sort((a,b)=>distance(a,p)-distance(b,p));if(hits[0])hurtEnemy(hits[0],rand(Math.max(1,st.atk-2),st.atk+4),st.crit);eventVfx('slash',p.x,p.y,46,'#f4d78e',.22,angle);}else{fireShot(p,angle,S.hero==='ranger'?440:355,st.atk*(S.hero==='mage'?1.06:1),S.hero==='ranger'?'arrow':'arcane',true);eventVfx('muzzle',p.x,p.y,13,'#b8f7f5',.2,angle);}sound('swing');return true;}
 if(n===2){if(p.cd>0||p.mp<11)return false;p.mp-=11;p.cd=.48;attackAnim(p,angle,.4);
 if(S.hero==='knight'){for(const e of targetsInCone(p,angle,68,2.8).slice(0,4)){hurtEnemy(e,st.atk*1.2+p.skills.fire*7,st.crit);if(e.hp>0){e.stun=.6;e.windup=null;const d=distance(e,p)||1;move(e,(e.x-p.x)/d*15,(e.y-p.y)/d*15);}}eventVfx('slash',p.x,p.y,72,'#a9e8ff',.38,angle);}
 else if(S.hero==='ranger'){for(const spread of [-.14,0,.14])fireShot(p,angle+spread,465,10+p.skills.fire*7+st.atk*.6,'arrow',true,8);}
 else{fireShot(p,angle,310,17+p.skills.fire*9+st.atk*.45,'fire',true,43);}sound('cast');return true;}
 if(n===3){if(p.cd>0||p.mp<23)return false;p.mp-=23;p.cd=.8;attackAnim(p,angle,.6);const radius=S.hero==='mage'?115:88;for(const e of [...S.enemies])if(distance(e,p)<radius&&lineClear(p,e,1)){hurtEnemy(e,st.atk*.9+p.skills.whirl*13,st.crit);if(e.hp>0){e.stun=S.hero==='mage'?1:.3;e.windup=null;}}if(S.hero==='ranger')p.dashCd=0;eventVfx('ring',p.x,p.y,radius,S.hero==='mage'?'#9ee4ff':'#f5da9a',.65);sound('cast');return true;}
 if(n===4){if(p.globalCd>0||p.mp<20)return false;p.mp-=20;p.globalCd=5;if(S.hero==='knight'){p.hp=Math.min(p.maxHp,p.hp+40+p.skills.heal*23);p.guard=4;}else if(S.hero==='ranger'){p.hp=Math.min(p.maxHp,p.hp+22+p.skills.heal*15);for(const e of S.enemies)if(distance(e,p)<135&&lineClear(p,e,1)){e.stun=1.3;e.windup=null;}}else{p.hp=Math.min(p.maxHp,p.hp+32+p.skills.heal*20);p.mp=Math.min(p.maxMp,p.mp+15);}eventVfx('ring',p.x,p.y,72,'#78e9c0',.8);log(name+' 시전');sound('heal');return true;}
 return false;
}
function ultimate(){const p=S.p;if(!active()||p.level<3||p.ultimateCd>0||p.mp<40)return false;p.mp-=40;p.ultimateCd=16;const st=stats(),radius=S.hero==='knight'?170:245;for(const e of [...S.enemies])if(distance(p,e)<radius&&lineClear(p,e,1)){hurtEnemy(e,st.atk*2.4+45+p.skills.fire*5,st.crit+.1);if(e.hp>0){e.stun=1.8;e.windup=null;}}if(S.hero==='knight')p.guard=6;eventVfx('ring',p.x,p.y,radius,'#f5d48b',1);screenShake=motionReduced?0:5;attackAnim(p,p.face,.6);log('궁극기 · '+skillNames[S.hero][4]);sound('reward');return true;}
function dash(){const p=S.p;if(!active()||p.dashCd>0||p.mp<8)return;let dx=+(keys.d||keys.ArrowRight||false)-+(keys.a||keys.ArrowLeft||false),dy=+(keys.s||keys.ArrowDown||false)-+(keys.w||keys.ArrowUp||false);if(!dx&&!dy){dx=pointer.x-p.x;dy=pointer.y-p.y;}const d=Math.hypot(dx,dy)||1;p.mp-=8;p.dashCd=2.7;p.invuln=.22;eventVfx('ring',p.x,p.y,24,'#b2ebff',.3);move(p,dx/d*106,dy/d*106);clickGoal=null;clickPath=[];attackTarget=null;eventVfx('ring',p.x,p.y,30,'#b2ebff',.4);sound('dash');}
function updateSquads(dt){for(const squad of Object.values(S.squads)){const mates=S.enemies.filter(e=>e.squadId===squad.id&&e.hp>0);if(!mates.length)continue;const captain=mates.find(e=>e.tactic==='captain'),r=S.rooms[squad.room],seen=mates.some(e=>e.activated||distance(e,S.p)<175&&lineClear(e,S.p,1));
 if(squad.order==='dormant'&&!seen)continue;for(const e of mates)e.activated=true;
 const hp=mates.reduce((n,e)=>n+clamp(e.hp/e.maxHp,0,1),0)/mates.length,alive=mates.length/Math.max(1,squad.initialSize);const recovered=squad.order==='regroup'?.14:0;
 squad.morale=clamp(hp*.65+alive*.35-(captain?0:.27)+recovered,0,1);squad.orderTime+=dt;
 const minDistance=Math.min(...mates.map(e=>distance(e,S.p)));let next=squad.order;
 if(next==='dormant')next='engage';
 if(next==='engage'&&squad.morale<.32&&minDistance<180&&S.elapsed>=(squad.retreatUntil||0))next='retreat';
 else if(next==='retreat'&&(squad.orderTime>2.6||minDistance>210))next='regroup';
 else if(next==='regroup'&&(squad.orderTime>1.5||minDistance<70)){next='engage';squad.retreatUntil=S.elapsed+5;}
 if(next!==squad.order){squad.order=next;squad.orderTime=0;for(const e of mates){e.pathTime=0;e.goalTime=0;}}
 if(!captain&&!squad.leaderLost){squad.leaderLost=true;float(mates[0].x,mates[0].y,'지휘관 상실','#ffd28c');}
 for(const e of mates){e.squadOrder=squad.order;e.squadMorale=squad.morale;e.leaderId=(captain||mates[0]).id;}
 }}
function resolveWindup(e){const w=e.windup;e.windup=null;if(!w||e.hp<=0)return;attackAnim(e,w.angle,.28);
 if(w.kind==='melee'){if(distance(e,S.p)<e.r+S.p.r+w.reach&&lineClear(e,S.p,1)){damagePlayer(e.atk);if(e.modifier==='frost')S.p.slow=1.4;if(e.modifier==='vampiric')e.hp=Math.min(e.maxHp,e.hp+e.atk*.18);}eventVfx('slash',e.x,e.y,w.reach+20,'#ff9a7b',.22,w.angle);}
 else if(w.kind==='bolt'){fireShot(e,w.angle,190,e.atk,'shadow',false);}
 else if(w.kind==='bossFan'){for(let k=-1;k<=1;k++)fireShot(e,w.angle+k*.3,178+S.floor*8,e.atk*.8,'shadow',false);}
}
function startAttack(e,kind,seconds,angle,reach=18){e.windup={kind,left:seconds,total:seconds,angle,reach};e.face=angle;e.cd=kind==='melee'?1.35:2.1;}
function summonBoss(e){const max=4-S.enemies.filter(a=>a.summoned).length;if(max<=0)return;const r=S.rooms.at(-1),places=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const p=center({x,y});if(walk(p.x,p.y,10)&&distance(p,S.p)>38&&distance(p,e)>20&&!S.enemies.some(a=>distance(a,p)<23))places.push(p);}const count=Math.min(2,max,places.length),id=`boss-${e.phase}`;
 if(count){S.squads[id]={id,initialSize:count,room:S.rooms.length-1,order:'engage',morale:1,orderTime:0,retreatUntil:0};for(let i=0;i<count;i++){const spot=places.splice(rand(0,places.length-1),1)[0];S.enemies.push(makeEnemy(spot.x,spot.y,i?'caster':'grunt',{summoned:true,activated:true,squadId:id,tactic:i?'skirmisher':'captain',formationIndex:i,home:{...spot}}));eventVfx('ring',spot.x,spot.y,25,'#bda2ff',.7);}log('보스가 수호 분대를 소환했습니다.');}}
function ai(e,dt){if(e.hp<=0)return;e.cd=Math.max(0,e.cd-dt);e.skillCd=Math.max(0,e.skillCd-dt);e.stun=Math.max(0,e.stun-dt);e.flash=Math.max(0,e.flash-dt);e.attackAnim=Math.max(0,e.attackAnim-dt);
 if(e.type==='boss'&&!S.keyCount)return;
 if(e.stun>0){e.windup=null;return;}
 if(e.windup){e.windup.left-=dt;if(e.windup.left<=0)resolveWindup(e);return;}
 const p=S.p,d=distance(e,p),squad=S.squads[e.squadId];
 if(e.type==='boss'){if(d<240&&lineClear(e,p,1))e.activated=true;if(!e.activated)return;const phase=e.hp/e.maxHp<=.33?2:e.hp/e.maxHp<=.66?1:0;if(phase>e.phase){e.phase=phase;summonBoss(e);e.skillCd=.8;log(e.bossName+' · '+(phase+1)+'페이즈');}
 if(e.skillCd<=0&&d<260&&lineClear(e,p,1)){S.hazards.push({x:p.x,y:p.y,r:50+S.floor*3,delay:1.15,total:1.15,damage:e.atk*1.5,kind:'meteor'});startAttack(e,'bossFan',.65,Math.atan2(p.y-e.y,p.x-e.x));e.skillCd=Math.max(2.7,4.6-e.phase*.6);return;}
 }else if(!e.activated)return;
 if(d>600&&e.home){if(distance(e,e.home)>32)navigate(e,e.home,dt,e.speed);else e.activated=false;return;}
 const order=squad?.order||'engage';
 if(order==='engage'&&d<e.r+p.r+19&&e.cd<=0&&lineClear(e,p,1)){startAttack(e,'melee',e.type==='boss'?.62:.43,Math.atan2(p.y-e.y,p.x-e.x),20);return;}
 if(order==='engage'&&e.type==='caster'&&d>65&&d<230&&e.cd<=0&&lineClear(e,p,1)){startAttack(e,'bolt',.66,Math.atan2(p.y-e.y,p.x-e.x));return;}
 e.goalTime=(e.goalTime||0)-dt;
 if(e.goalTime<=0||!e.goal||e.goalMode!==order){e.goalTime=.45+(e.id%4)*.06;e.goalMode=order;const leader=S.enemies.find(a=>a.id===e.leaderId)||e;
 if(order==='retreat')e.goal=tacticalPoint(e,p,'retreat');
 else if(order==='regroup'){const home=e.home||center(S.rooms[squad?.room||0].c);e.goal=tacticalPoint(e,home,'regroup');}
 else if(e.type==='caster')e.goal=tacticalPoint(e,p,'kite');
 else if(e.tactic==='guardian'&&leader!==e&&d>70&&distance(e,leader)>64){e.goal=tacticalPoint(e,{x:leader.x+(p.x-leader.x)*.28,y:leader.y+(p.y-leader.y)*.28},'guard');}
 else if(e.tactic==='flanker'&&d>65){let a=Math.atan2(p.y-leader.y,p.x-leader.x)+(e.formationIndex%2?1:-1)*1.15;const flank={x:p.x+Math.cos(a)*42,y:p.y+Math.sin(a)*42};e.goal=tacticalPoint(e,flank,'flank');}
 else e.goal={x:p.x,y:p.y};}
 const hold=order==='engage'&&((e.type==='caster'&&d>105&&d<180&&lineClear(e,p,1))||(e.type!=='caster'&&d<e.r+p.r+12));if(!hold)navigate(e,e.goal,dt,e.speed*(order==='retreat'?1.2:1)*(e.modifier==='swift'?1.35:1));
}
function reveal(){if(!S.discovered.length)S.discovered=Array.from({length:NY},()=>Array(NX).fill(false));S.visible=Array.from({length:NY},()=>Array(NX).fill(false));const a=tile(S.p.x,S.p.y);
 for(let y=Math.max(0,a.y-9);y<=Math.min(NY-1,a.y+9);y++)for(let x=Math.max(0,a.x-9);x<=Math.min(NX-1,a.x+9);x++){if(Math.hypot(x-a.x,y-a.y)>9)continue;const end=center({x,y}),d=distance(S.p,end),n=Math.max(1,Math.ceil(d/6));let visible=true;for(let i=1;i<n;i++){const t=tile(S.p.x+(end.x-S.p.x)*i/n,S.p.y+(end.y-S.p.y)*i/n);if(t.x===x&&t.y===y)break;if(S.map[t.y]?.[t.x]!==0||gateBlocked((t.x+.5)*T,(t.y+.5)*T)){visible=false;break;}}if(visible){S.visible[y][x]=true;S.discovered[y][x]=true;}}
}
function seen(o){const t=tile(o.x,o.y);return !!S.discovered[t.y]?.[t.x];}
function visible(o){const t=tile(o.x,o.y);return !!S.visible[t.y]?.[t.x];}
function updateProjectiles(dt){for(const s of [...S.shots]){s.life-=dt;let dead=s.life<=0;const n=Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy)*dt/4));for(let k=0;k<n&&!dead;k++){s.x+=s.vx*dt/n;s.y+=s.vy*dt/n;if(!walk(s.x,s.y,s.r)){dead=true;break;}const hit=s.friendly?S.enemies.find(e=>e.hp>0&&distance(e,s)<e.r+s.r):distance(S.p,s)<S.p.r+s.r;
 if(hit){if(s.friendly){hurtEnemy(hit,s.dmg,stats().crit*.4);if(s.aoe>0)for(const e of [...S.enemies])if(e!==hit&&distance(e,s)<s.aoe+e.r&&lineClear(s,e,1))hurtEnemy(e,s.dmg*.65,0);}else damagePlayer(s.dmg);dead=true;}}
 if(dead){const idx=S.shots.indexOf(s);if(idx>=0)S.shots.splice(idx,1);eventVfx('impact',s.x,s.y,s.kind==='fire'?36:12,s.kind==='fire'?'#ffb174':'#b9a6f8',.25);}}
}
function update(dt){if(!active())return;S.elapsed+=dt;S.step++;const p=S.p;for(const k of ['cd','dashCd','globalCd','ultimateCd','guard','slow','invuln','attackAnim','flash'])p[k]=Math.max(0,(p[k]||0)-dt);p.mp=Math.min(p.maxMp,p.mp+dt*stats().regen);
 const dx=+(keys.d||keys.ArrowRight||false)-+(keys.a||keys.ArrowLeft||false),dy=+(keys.s||keys.ArrowDown||false)-+(keys.w||keys.ArrowUp||false);
 p.running=!!keys.Shift&&!!(dx||dy||clickGoal)&&!nearThreat();if(dx||dy){clickGoal=null;clickPath=[];attackTarget=null;const l=Math.hypot(dx,dy);const speed=runSpeed();move(p,dx/l*speed*dt,dy/l*speed*dt);}
 else if(attackTarget){const e=S.enemies.find(a=>a.id===attackTarget);if(!e||!visible(e)){attackTarget=null;clickPath=[];}else{pointer.x=e.x;pointer.y=e.y;const range=weaponRange();if(distance(p,e)<=range&&lineClear(p,e,1))cast(1,e);else navigate(p,e,dt,150);}}
 else if(clickGoal){if(distance(p,clickGoal)<7){clickGoal=null;p.path=[];}else{navigate(p,clickGoal,dt,runSpeed());if(!p.path?.length)clickGoal=null;}}
 if(keys['1'])cast(1);if(keys['2'])cast(2);if(keys['3'])cast(3);if(keys['4'])cast(4);if(keys['5'])ultimate();
 if(S.step%5===0)reveal();updateSquads(dt);for(const e of [...S.enemies])if(e.activated||e.windup||e.stun>0||distance(e,p)<400)ai(e,dt);updateProjectiles(dt);
 for(const h of [...S.hazards]){h.delay-=dt;if(h.delay<=0){if(distance(h,p)<h.r+p.r&&lineClear(h,p,1))damagePlayer(h.damage,h.element||'physical',{noBlock:true});eventVfx('impact',h.x,h.y,h.r,h.kind==='meteor'?'#ffb56e':'#f3757b',.5);const idx=S.hazards.indexOf(h);if(idx>=0)S.hazards.splice(idx,1);sound('blast');}}
 for(const o of S.director.objects)if(o.kind==='trap'&&!o.used&&distance(o,p)<27&&lineClear(o,p,1)){o.used=true;S.hazards.push({x:o.x,y:o.y,r:52,delay:1.05,total:1.05,damage:12+S.floor*5,kind:'blast'});log('압력판 작동! 붉은 원을 벗어나세요.');}
 updateTravel(dt);if(S.step%15===0)updateRoomProgress();
 S.fx=S.fx.filter(f=>(f.t-=dt)>0);S.vfx=S.vfx.filter(f=>(f.life-=dt)>0);autoSaveClock+=dt;if(autoSaveClock>=45){autoSaveClock=0;save(true);}uiClock+=dt;if(uiClock>.15){refresh();uiClock=0;}
}
function interactionTarget(){if(!S?.director)return null;return S.director.objects.filter(o=>!o.used&&['key','chest','shrine','trap'].includes(o.kind)&&distance(o,S.p)<53&&lineClear(S.p,o,1)).sort((a,b)=>distance(a,S.p)-distance(b,S.p))[0]||null;}
function interactContent(){if(!active())return;const o=interactionTarget();if(!o){log('가까운 오브젝트로 이동하세요. 벽 너머로는 상호작용할 수 없습니다.');return;}o.used=true;
 if(o.kind==='key'){S.keyCount=1;navVersion++;S.p.pathTime=0;eventVfx('ring',o.x,o.y,65,'#f5d081',.7);log('봉인 열쇠 획득! 보스 관문이 열렸습니다.');sound('reward');}
 if(o.kind==='chest'){S.p.gold+=45*S.floor;S.drops.push({x:o.x,y:o.y,item:makeItem(choose(['sword','armor','ring']),true)});log('보물 상자 · 희귀 장비와 골드 획득');sound('reward');}
 if(o.kind==='shrine'){S.p.hp=Math.min(S.p.maxHp,S.p.hp+S.p.maxHp*.45);S.p.mp=Math.min(S.p.maxMp,S.p.mp+S.p.maxMp*.45);eventVfx('ring',o.x,o.y,75,'#7fe5ce',.9);log('고대 성소 · 체력과 마나 45% 회복');sound('heal');}
 if(o.kind==='trap'){S.materials.essence++;log('압력판을 안전하게 해체했습니다. 정수 +1');}
 reveal();refresh();
}
function pickup(){if(!active())return;let n=0;for(const d of [...S.drops])if(distance(d,S.p)<58&&lineClear(S.p,d,1)){if(S.p.inv.length>=40){log('가방이 가득 찼습니다.');break;}S.p.inv.push(d.item);S.drops.splice(S.drops.indexOf(d),1);n++;}if(n){log(`아이템 ${n}개 획득`);sound('reward');}refresh();}
function shop(kind='health'){if(!active())return;if(!atTown()){log('마을에서 상점을 이용하세요.');return;}if(S.p.gold<35||S.p.inv.length>=40){log('35G와 가방 공간이 필요합니다.');return;}S.p.gold-=35;S.p.inv.push(makeItem(kind));log(itemDefs[kind][0]+' 구매 · 35G');refresh();}
function sell(){if(!active())return;if(!atTown()){log('판매는 시작 방에서 가능합니다.');return;}const i=S.p.inv.findIndex(x=>x.slot!=='consumable');if(i<0)return;const item=S.p.inv.splice(i,1)[0];S.p.gold+=item.value;log(item.name+' 판매 · '+item.value+'G');refresh();}
function descend(){if(!active())return;if(distance(S.p,S.exit)>48||!lineClear(S.p,S.exit,1)){log('황금 계단에 가까이 이동하세요.');return;}if(!S.keyCount||!S.bossDead){log('열쇠 획득과 보스 처치를 완료하세요.');return;}
 if(S.floor===5){S.completed=true;paused=true;resetTransient();log('심연 군주 처치! 5개 층을 모두 정복했습니다.');save(true);refresh();return;}
 S.floor++;const seed=(S.runSeed^Math.imul(S.floor,0x9e3779b1))>>>0,d=compileDungeon(seed,S.floor);S.p.x=d.start.x;S.p.y=d.start.y;S.p.hp=Math.min(S.p.maxHp,S.p.hp+40);S.p.mp=S.p.maxMp;S.p.path=[];S.p.invuln=1;S.discovered=[];S.visible=[];S.drops=[];S.shots=[];S.fx=[];S.vfx=[];S.hazards=[];applyContent(d);resetTransient();camera.x=S.p.x;camera.y=S.p.y;reveal();log(themes[S.floor-1].name+'에 진입했습니다.');save(true);refresh();
}
function revive(){if(!S?.p.dead)return;const p=S.p,start=center(S.rooms[0].c);p.dead=false;p.hp=p.maxHp*.8;p.mp=p.maxMp*.8;p.gold=Math.floor(p.gold*.8);p.xp=Math.floor(p.xp*.85);p.x=start.x;p.y=start.y;p.invuln=2;S.shots=[];S.hazards=[];paused=false;resetTransient();for(const e of S.enemies){e.windup=null;e.pathTime=0;if(distance(e,p)<90&&e.home&&walk(e.home.x,e.home.y,e.r)){e.x=e.home.x;e.y=e.home.y;}}reveal();log('시작 방에서 부활 · 골드 20%, 현재 경험치 15% 손실');refresh();}

// Large-map travel: independent prototype rules, not Diablo II town portal rules.
function nearThreat(){return S.enemies.some(e=>e.hp>0&&distance(e,S.p)<240&&e.activated&&lineClear(e,S.p,1));}
function townTravel(){if(!active())return false;if(S.channel){S.channel=null;log('귀환 취소');return false;}
 if(atTown()){
  if(!S.townReturn){log('던전에서 Z로 귀환하면 이곳에서 다시 돌아갈 수 있습니다.');return false;}
  const dest=S.townReturn;if(!walk(dest.x,dest.y,S.p.r)){log('복귀 지점이 막혔습니다. 탐험 상태를 확인하세요.');return false;}
  S.p.x=dest.x;S.p.y=dest.y;resetTransient();S.p.invuln=.8;camera.x=S.p.x;camera.y=S.p.y;reveal();log('포탈로 탐험 지점에 복귀했습니다.');return true;
 }
 if(nearThreat()){log('주변 적을 따돌린 뒤 귀환하세요.');return false;}
 clickGoal=null;attackTarget=null;S.p.path=[];S.channel={left:3,total:3,x:S.p.x,y:S.p.y,hp:S.p.hp};log('마을 귀환 준비 · 3초간 이동하거나 피격되면 취소');return true;
}
function updateTravel(dt){const ch=S.channel;if(!ch)return;
 if(distance(ch,S.p)>3||S.p.hp<ch.hp||nearThreat()||S.p.dead){S.channel=null;log('귀환 취소 · 이동 / 위협 감지');return;}
 ch.left-=dt;if(ch.left>0)return;S.townReturn={x:ch.x,y:ch.y};S.channel=null;const dest=center(S.rooms[0].c);S.p.x=dest.x;S.p.y=dest.y;resetTransient();S.p.invuln=.8;camera.x=S.p.x;camera.y=S.p.y;reveal();log('마을 귀환 완료 · 상점 이용 후 Z로 탐험 지점 복귀');refresh();
}
function updateRoomProgress(){for(const [room,entry] of Object.entries(S.roomProgress||{})){
 if(entry.cleared)continue;const remaining=S.enemies.filter(e=>e.encounterRoom===Number(room)&&!e.summoned);
 if(remaining.some(e=>e.activated))entry.started=true;
 if(remaining.length)continue;entry.cleared=true;entry.started=true;
 if(!entry.rewardClaimed){entry.rewardClaimed=true;const r=S.rooms[Number(room)],pos=center(r.c);S.p.gold+=30*S.floor;S.director.objects.push({id:`clear-${room}`,kind:'chest',...pos,room:Number(room),used:false,clearReward:true});log('광장 정화 완료 · 중앙 보급 상자와 골드 획득');sound('reward');}
 }}

// v26 is a distinct slot. Region snapshots, quest claims, hard points and item instances are authoritative.
function exportState(){const state=JSON.parse(JSON.stringify(S));state.version=VERSION;state.fx=[];state.vfx=[];state.visible=[];state.shots=[];state.hazards=[];state.fields=[];state.barriers=[];state.channel=null;state.p.path=[];state.p.pathTime=0;for(const a of [state,...Object.values(state.world.states)])for(const e of a.enemies){e.path=[];e.pathTime=0;e.windup=null;delete e.navVersion;}return state;}
function encodeSave(){return JSON.stringify({format:'dark-descent',schema:VERSION,dataProfile:D2DATA.meta.profile,savedAt:new Date().toISOString(),state:exportState()});}
function assertSave(ok,message){if(!ok)throw new Error(message);}
function validateState(s){assertSave(s&&[26,27,28].includes(s.version),'v26, v27 또는 v28 저장 파일이 필요합니다. 이전 버전은 원래 HTML에서 실행하세요.');assertSave(CLASS[s.hero]&&s.world&&AREA[s.world.areaId],'직업 / 지역 오류');assertSave(s.floor===AREA[s.world.areaId].act,'액트 불일치');const p=s.p;assertSave(p&&p.eq&&p.attributes&&p.skills&&p.buffs&&p.skillCooldowns,'캐릭터 구조 오류');
 const finite=(x,min=0,max=1e11)=>Number.isFinite(x)&&x>=min&&x<=max;
 for(const k of ['hp','maxHp','mp','maxMp','xp','level','gold','points','statPoints','bonusSkills','bonusStats'])assertSave(finite(p[k]),'캐릭터 수치 오류: '+k);
 assertSave(Number.isInteger(p.level)&&p.level>=1&&p.level<=99&&p.maxHp>0&&p.maxMp>0,'레벨 / 최대 자원 오류');
 for(const k of ['strength','dexterity','vitality','energy'])assertSave(Number.isInteger(p.attributes[k])&&p.attributes[k]>=CLASS[s.hero].initial_attributes[k]&&p.attributes[k]<=10000,'능력치 오류');
 let spent=0;for(const [id,n] of Object.entries(p.skills)){assertSave(SKILL[id]?.class_id===s.hero&&SKILL[id].runtime&&Number.isInteger(n)&&n>=0&&n<=20,'스킬 투자 데이터 오류');assertSave(!n||p.level>=SKILL[id].required_character_level+n-1,'스킬 레벨 제한 오류');if(n)for(const pre of SKILL[id].requires)assertSave(p.skills[pre]>0,'선행 스킬 오류');spent+=n;}
 assertSave(Number.isInteger(p.points)&&spent+p.points<=p.level-1+p.bonusSkills,'스킬 포인트 예산 오류');const statSpent=Object.keys(CLASS[s.hero].initial_attributes).reduce((n,k)=>n+p.attributes[k]-CLASS[s.hero].initial_attributes[k],0);assertSave(Number.isInteger(p.statPoints)&&statSpent+p.statPoints<=5*(p.level-1)+p.bonusStats,'능력치 포인트 예산 오류');
 assertSave(Array.isArray(p.inv)&&p.inv.length<=40&&Array.isArray(p.skillBindings)&&p.skillBindings.length===4,'가방 / 단축 슬롯 오류');for(const id of p.skillBindings)assertSave(id===null||SKILL[id]?.class_id===s.hero&&SKILL[id].runtime,'단축 슬롯 스킬 오류');
 const ids=new Set();function item(it){assertSave(it&&typeof it.id==='string'&&!ids.has(it.id),'아이템 ID 중복');ids.add(it.id);assertSave(typeof it.name==='string'&&it.name.length<=200&&typeof it.symbol==='string'&&it.symbol.length<=12,'아이템 표시 오류');assertSave(['normal','magic','rare'].includes(it.rarity),'지원하지 않는 품질');assertSave(finite(it.value),'아이템 가격 오류');if(it.slot==='consumable'){assertSave(['health','mana'].includes(it.kind),'소모품 오류');return;}if(it.slot==='rune'){assertSave(D2DATA.runes.some(r=>r.id===it.runeId),'룬 오류');return;}const b=BASE[it.baseId];assertSave(b&&b.slot===it.slot&&b.type===it.kind,'베이스 아이템 오류');assertSave(it.mods&&it.staffmods&&it.requirements,'아이템 속성 구조 오류');for(const [k,v]of Object.entries(it.mods))assertSave(/^[a-zA-Z][a-zA-Z0-9]*$/.test(k)&&finite(v,-1e5,1e5),'아이템 옵션 오류');for(const [id,n]of Object.entries(it.staffmods))assertSave(SKILL[id]&&Number.isInteger(n)&&n>=1&&n<=3,'개별 스킬 옵션 오류');assertSave(Number.isInteger(it.sockets)&&it.sockets>=0&&it.sockets<=b.maxSockets&&Array.isArray(it.gems)&&it.gems.length<=it.sockets,'소켓 오류');assertSave(finite(it.reqLevel)&&finite(it.def)&&finite(it.requirements.strength)&&finite(it.requirements.dexterity),'장비 수치 오류');if(it.damage)assertSave(it.damage.length===2&&it.damage.every(x=>finite(x))&&it.damage[0]<=it.damage[1],'무기 피해 오류');}
 for(const i of [...p.inv,...Object.values(p.eq).filter(Boolean),...(s.stash||[])])item(i);
 function region(a){assertSave(Array.isArray(a.map)&&a.map.length===NY&&a.map.every(r=>Array.isArray(r)&&r.length===NX&&r.every(v=>v===0||v===1)),'지역 맵 오류');assertSave(Array.isArray(a.rooms)&&a.rooms.length===6,'광장 구조 오류');for(const r of a.rooms)assertSave(r.c&&[r.x,r.y,r.w,r.h,r.c.x,r.c.y].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.w>0&&r.h>0&&r.x+r.w<=NX&&r.y+r.h<=NY,'광장 경계 오류');assertSave(a.director&&Array.isArray(a.director.objects)&&a.director.objects.length<100,'오브젝트 오류');for(const o of a.director.objects)assertSave(['exit','waypoint','quest','seal','chest','shrine','trap'].includes(o.kind)&&finite(o.x,0,NX*T)&&finite(o.y,0,NY*T)&&(!o.target||AREA[o.target]),'오브젝트 속성 오류');assertSave(Array.isArray(a.enemies)&&a.enemies.length<200&&Array.isArray(a.drops)&&a.drops.length<500,'지역 객체 수 오류');for(const e of a.enemies)assertSave(finite(e.x,0,NX*T)&&finite(e.y,0,NY*T)&&finite(e.hp)&&finite(e.maxHp,1)&&['grunt','caster','elite','boss'].includes(e.type),'몬스터 수치 오류');for(const d of a.drops){assertSave(finite(d.x,0,NX*T)&&finite(d.y,0,NY*T),'드롭 좌표 오류');item(d.item);}assertSave(Array.isArray(a.corpses)&&a.corpses.length<=120,'시체 데이터 오류');assertSave(a.discovered.length===NY&&a.discovered.every(r=>Array.isArray(r)&&r.length===NX),'탐험 지도 오류');}
 region(s);assertSave(s.world.states&&Object.keys(s.world.states).length<=130&&!s.world.states[s.world.areaId],'지역 캐시 오류');for(const [id,a]of Object.entries(s.world.states)){assertSave(AREA[id],'미등록 지역 캐시');region(a);}
 assertSave(s.world.flags&&s.world.claims&&s.world.waypoints&&s.world.visited,'월드 상태 오류');assertSave(Number.isInteger(s.world.trueTomb)&&s.world.trueTomb>=1&&s.world.trueTomb<=7,'탈 라샤 무덤 오류');assertSave(s.world.actUnlocked>=1&&s.world.actUnlocked<=5,'액트 해금 오류');for(const id of Object.keys(s.world.waypoints))assertSave(AREA[id]?.waypoint,'순간이동진 오류');assertSave(finite(p.x,0,NX*T)&&finite(p.y,0,NY*T),'플레이어 좌표 오류');assertSave(finite(s.rngState,0,4294967295)&&Number.isInteger(s.rngState)&&finite(s.nextId,1)&&finite(s.elapsed),'시뮬레이션 상태 오류');return true;}
function decodeSave(input){assertSave(typeof input==='string'&&input.length<20e6,'20MB 이하 JSON 파일이 필요합니다.');const obj=JSON.parse(input),s=obj.state||obj;validateState(s);s.fx=[];s.vfx=[];s.visible=[];s.shots=[];s.fields=[];s.barriers=[];s.hazards=[];s.channel=null;s.keyCount=1;s.minions=Array.isArray(s.minions)?s.minions.filter(m=>Number.isFinite(m.x)&&Number.isFinite(m.y)&&m.hp>0&&Number.isFinite(m.atk)).slice(0,30):[];s.logs=Array.isArray(s.logs)?s.logs.filter(x=>typeof x==='string').slice(0,18):[];s.p.path=[];s.p.pathTime=0;s.p.r=10;s.p.dead=s.p.hp<=0;for(const a of [s,...Object.values(s.world.states)])for(const e of a.enemies){e.path=[];e.pathTime=0;e.windup=null;e.navVersion=-1;}return s;}
function restoreSave(text){const next=decodeSave(text);S=next;paused=false;resetTransient();recalcResources();if(!walk(S.p.x,S.p.y,S.p.r))Object.assign(S.p,center(S.rooms[0].c));camera.x=S.p.x;camera.y=S.p.y;reveal();refresh();return true;}
function save(silent=false){try{localStorage.setItem(KEY,encodeSave());$('#storageStatus').textContent='v28 저장 완료 · 지역/성장/퀘스트 유지';if(!silent)log('XXVIII 저장 완료');return true;}catch(err){$('#storageStatus').textContent='저장소 제한 · JSON 백업을 사용하세요';if(!silent)log('브라우저 저장소 제한: JSON 내보내기를 이용하세요.');return false;}}
function load(){try{const s=localStorage.getItem(KEY);if(!s)throw Error('XXVIII 저장 없음');restoreSave(s);log('저장 복원 완료');}catch(err){log('불러오기 실패: '+err.message);}refresh();}
function downloadText(name,text,type='application/json'){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

const C=$('#game'),g=C.getContext('2d'),gfx=$('#view3d'),hud=$('#hud'),h=hud.getContext('2d');
let GL=null,glProg,glBuf,glPos,glCol,vertexCount=0;
try{GL=gfx.getContext('webgl',{antialias:true,alpha:false});if(GL){const vs='attribute vec3 p;attribute vec3 c;varying vec3 v;void main(){gl_Position=vec4(p,1.);v=c;}',fs='precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.);}';
 const shader=(type,source)=>{const sh=GL.createShader(type);GL.shaderSource(sh,source);GL.compileShader(sh);if(!GL.getShaderParameter(sh,GL.COMPILE_STATUS))throw Error(GL.getShaderInfoLog(sh));return sh;};
 glProg=GL.createProgram();GL.attachShader(glProg,shader(GL.VERTEX_SHADER,vs));GL.attachShader(glProg,shader(GL.FRAGMENT_SHADER,fs));GL.linkProgram(glProg);if(!GL.getProgramParameter(glProg,GL.LINK_STATUS))throw Error(GL.getProgramInfoLog(glProg));GL.useProgram(glProg);glBuf=GL.createBuffer();glPos=GL.getAttribLocation(glProg,'p');glCol=GL.getAttribLocation(glProg,'c');GL.enable(GL.DEPTH_TEST);GL.depthFunc(GL.LEQUAL);
 }}catch(err){console.warn('WebGL unavailable; falling back to Canvas 2D.',err.message);GL=null;}
if(!GL)renderMode='2d';
$('#mode').disabled=!GL;$('#mode').title=GL?'2D / 3D 전환':'3D를 사용할 수 없어 2D 모드로 실행합니다.';
gfx.addEventListener('webglcontextlost',e=>{e.preventDefault();GL=null;renderMode='2d';gfx.style.display='none';$('#mode').disabled=true;$('#mode').title='3D 연결이 중단되어 2D 모드로 실행합니다.';clearGameplayInput();paused=true;log('그래픽 연결이 중단되어 2D 모드로 전환했습니다. P 또는 계속 버튼으로 플레이하세요.');refresh();});
function cameraUpdate(dt){if(!S)return;const blend=1-Math.exp(-dt*7),halfW=13.5*T/camera.zoom,halfH=8.9*T/camera.zoom;
 const tx=halfW>=NX*T/2?NX*T/2:clamp(S.p.x,halfW,NX*T-halfW),ty=halfH>=NY*T/2?NY*T/2:clamp(S.p.y,halfH,NY*T-halfH);camera.x+=(tx-camera.x)*blend;camera.y+=(ty-camera.y)*blend;screenShake=Math.max(0,screenShake-dt*18);}
function project(x,y,z=0){const scale=camera.zoom,shake=screenShake&&!motionReduced?Math.sin(anim*67)*screenShake:0;return {x:W/2+(x-camera.x)/T/13.5*W/2*scale+shake,y:H/2-( -(y-camera.y)/T*.84+z*.66)/8.9*H/2*scale,depth:-(y-camera.y)/T*.027-z*.037};}
function unproject(x,y){return {x:camera.x+(x-W/2)*2/W*13.5*T/camera.zoom,y:camera.y+(y-H/2)*2/H*8.9*T/(.84*camera.zoom)};}
function color(hex){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];}
function viewBounds(){const dx=14.5*T/camera.zoom,dy=11*T/camera.zoom;return {x0:clamp(Math.floor((camera.x-dx)/T),0,NX-1),x1:clamp(Math.ceil((camera.x+dx)/T),0,NX-1),y0:clamp(Math.floor((camera.y-dy)/T),0,NY-1),y1:clamp(Math.ceil((camera.y+dy)/T),0,NY-1)};}
function onScreen(o,pad=120){const p=project(o.x,o.y,0);return p.x>-pad&&p.x<W+pad&&p.y>-pad&&p.y<H+pad;}
function render3D(){if(!GL||renderMode!=='3d')return;const verts=[],area=AREA[S.world.areaId],theme=area.kind==='field'?fieldThemes[S.floor-1]:area.kind==='town'?townTheme:themes[S.floor-1];
 function tri(a,b,c,col,shade=1){for(const v of [a,b,c]){const p=project(v[0]*T,v[1]*T,v[2]);verts.push(p.x/W*2-1,1-p.y/H*2,p.depth,Math.min(1,col[0]*shade),Math.min(1,col[1]*shade),Math.min(1,col[2]*shade));}}
 function quad(a,b,c,d,col,shade=1){tri(a,b,c,col,shade);tri(a,c,d,col,shade);}
 function box(x,y,z,w,ht,d,col,angle=0){const ca=Math.cos(angle),sa=Math.sin(angle),v=(xx,yy,zz)=>[x+xx*ca-yy*sa,y+xx*sa+yy*ca,zz],a=v(-w/2,-d/2,z),b=v(w/2,-d/2,z),c=v(w/2,d/2,z),dd=v(-w/2,d/2,z),at=v(-w/2,-d/2,z+ht),bt=v(w/2,-d/2,z+ht),ct=v(w/2,d/2,z+ht),dt=v(-w/2,d/2,z+ht);
 quad(at,bt,ct,dt,col,1.25);quad(a,b,bt,at,col,.62);quad(b,c,ct,bt,col,.84);quad(c,dd,dt,ct,col,.94);quad(dd,a,at,dt,col,.7);}
 function disk(x,y,z,r,col,segments=20){for(let i=0;i<segments;i++){const a=i*TAU/segments,b=(i+1)*TAU/segments;tri([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],col);}}
 function ring(x,y,z,r,th,col,progress=1,start=0){const n=Math.max(3,Math.floor(40*progress));for(let i=0;i<n;i++){const a=start+i/n*TAU*progress,b=start+(i+1)/n*TAU*progress;quad([x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],[x+Math.cos(b)*(r-th),y+Math.sin(b)*(r-th),z],[x+Math.cos(a)*(r-th),y+Math.sin(a)*(r-th),z],col);}}
 const bounds=viewBounds();for(let y=bounds.y0;y<=bounds.y1;y++)for(let x=bounds.x0;x<=bounds.x1;x++){const discovered=S.discovered[y]?.[x],now=S.visible[y]?.[x],b=discovered?(now?1:.43):.18;
 if(!discovered){box(x+.5,y+.5,-.12,1,.06,1,[.035,.043,.057]);continue;}
 const env=environmentAt(x,y),variation=.88+env.variation*.002;let tileColor=theme.floor.map(c=>c*b*variation);if((env.field||env.town)&&env.road&&S.map[y][x]===0)tileColor=tileColor.map((c,i)=>c*.72+[.29,.24,.16][i]*b*.55);box(x+.5,y+.5,-.13,.99,.13,.99,tileColor);
 if(S.map[y][x]&&env.field&&x>0&&y>0&&x<NX-1&&y<NY-1){
 if(env.act===1||env.act===3){box(x+.5,y+.5,0,.24,1.1,.24,[.23*b,.18*b,.12*b]);box(x+.5,y+.5,.62,.84,.65,.84,[.16*b,.31*b,.18*b]);if(env.act===3)box(x+.5,y+.5,1.1,.54,.35,.54,[.19*b,.38*b,.22*b]);}
 else if(env.act===2){box(x+.5,y+.5,0,.8,.38+(env.variation%3)*.12,.8,[.52*b,.42*b,.27*b],.2);}
 else if(env.act===4){box(x+.5,y+.5,0,.74,.5,.8,[.27*b,.13*b,.12*b],.3);box(x+.5,y+.5,.51,.42,.04,.35,[.8*b,.24*b,.05*b]);}
 else{box(x+.5,y+.5,0,.85,.48,.85,[.39*b,.48*b,.56*b]);box(x+.5,y+.5,.48,.86,.08,.86,[.65*b,.74*b,.78*b]);}
 }else if(S.map[y][x]){const px=S.p.x/T,py=S.p.y/T,cut=Math.abs(x+.5-px)<1.7&&y+.5>py&&y+.5-py<3.1;const ht=cut?.24:.92;box(x+.5,y+.5,0,.96,ht,.96,theme.wall.map(c=>c*b));box(x+.5,y+.5,ht,.97,.09,.97,theme.wall.map(c=>c*b*1.16));if(!cut&&(x+y*3)%4===0)box(x+.5,y+.5,ht+.09,.74,.12,.74,theme.wall.map(c=>c*b*.8));}
 else{if(x%4===0&&y%4===0&&now)box(x+.5,y+.5,.005,.76,.012,.76,theme.floor.map(c=>c*1.25));if((x*13+y*7)%19===0)box(x+.22,y+.28,0,.22,.035,.16,[.31*b,.30*b,.26*b]);}}
 for(const r of S.rooms){if(!S.discovered[r.c.y]?.[r.c.x])continue;const room=S.director.rooms[r.index??S.rooms.indexOf(r)];if(room?.kind==='start'){ring(r.c.x+.5,r.c.y+.5,.04,.95,.07,[.25,.52,.59]);}
 const tx=r.x+.7,ty=r.y+.7;if(S.visible[Math.floor(ty)]?.[Math.floor(tx)]){box(tx,ty,.04,.16,.58,.16,[.3,.26,.22]);const flick=.03*Math.sin(anim*8+tx);box(tx,ty,.65,.13,.24+flick,.13,theme.light);}}
 for(const o of S.director.objects){if(!seen(o)||!onScreen(o))continue;const x=o.x/T,y=o.y/T,dimmer=visible(o)?1:.45;
 if(o.kind==='exit'){const closed=o.requires&&!S.world.flags[o.requires],col=closed?[.68,.3,.23]:[.26,.65,.74];box(x-.58,y,0,.20,1.65,.25,[.43,.46,.43]);box(x+.58,y,0,.20,1.65,.25,[.43,.46,.43]);box(x,y,1.56,1.36,.22,.28,col);ring(x,y,.025,.78,.07,col);if(closed)for(let j=-2;j<=2;j++)box(x+j*.2,y,0,.05,1.5,.1,col);}
 else if(o.kind==='waypoint'){disk(x,y,.035,.78,S.world.waypoints[S.world.areaId]?[.12,.43,.58]:[.19,.26,.31]);ring(x,y,.05,.78,.08,[.34,.8,.9]);for(let j=0;j<6;j++){const a=j*TAU/6;box(x+Math.cos(a)*.66,y+Math.sin(a)*.66,.07,.12,.24,.12,[.49,.78,.84]);}}
 else if((o.kind==='quest'||o.kind==='seal')&&!o.used){box(x,y,.02,.8,.32,.8,[.32,.35,.34]);box(x,y,.35,.25,.85,.25,o.kind==='seal'?[.94,.38,.2]:[.88,.74,.4]);ring(x,y,.02,.55,.06,[.65,.49,.2]);}
 else if(o.kind==='chest'){box(x,y,.03,.72,.34,.49,[.31*dimmer,.19*dimmer,.12*dimmer]);box(x+(o.used?.28:0),y,.4,.75,.16,.52,[.68*dimmer,.45*dimmer,.18*dimmer],o.used?.6:0);box(x,y,.17,.12,.26,.53,[.85*dimmer,.69*dimmer,.37*dimmer]);}
 else if(o.kind==='key'&&!o.used){ring(x,y,.4+Math.sin(anim*2)*.06,.23,.07,[1*dimmer,.81*dimmer,.3*dimmer]);box(x+.24,y,.4,.4,.07,.09,[1*dimmer,.81*dimmer,.3*dimmer]);box(x+.4,y+.09,.4,.07,.07,.2,[1*dimmer,.81*dimmer,.3*dimmer]);ring(x,y,.015,.58,.04,[.48*dimmer,.37*dimmer,.14*dimmer]);}
 else if(o.kind==='shrine'){box(x,y,0,.79,.22,.79,[.27*dimmer,.36*dimmer,.38*dimmer]);box(x,y,.22,.5,.44,.5,[.35*dimmer,.44*dimmer,.46*dimmer]);box(x,y,.75,.27,.27,.27,o.used?[.2,.25,.25]:[.25*dimmer,.9*dimmer,.78*dimmer],anim*.5);}
 else if(o.kind==='trap'){box(x,y,.005,.9,.025,.9,o.used?[.21,.21,.22]:[.42*dimmer,.24*dimmer,.2*dimmer]);for(let i=-1;i<=1;i++)box(x+i*.22,y,.035,.06,.05,.66,[.47*dimmer,.43*dimmer,.4*dimmer]);}}
 if(S.townReturn)for(const point of [S.townReturn,center(S.rooms[0].c)])if(seen(point)&&onScreen(point)){ring(point.x/T,point.y/T,.06,.8,.09,[.24,.78,.9],1,anim);for(let i=0;i<6;i++){const a=i*TAU/6+anim;box(point.x/T+Math.cos(a)*.72,point.y/T+Math.sin(a)*.72,.25,.07,.6,.07,[.24,.63,.82]);}}
 for(const a of S.director.gates){if(!S.discovered[a.y]?.[a.x])continue;const x=a.x+.5,y=a.y+.5;if(S.keyCount<1){box(x-.39,y,0,.16,1.4,.22,[.54,.41,.26]);box(x+.39,y,0,.16,1.4,.22,[.54,.41,.26]);box(x,y,1.34,.94,.18,.26,[.72,.57,.31]);for(let k=-1;k<=1;k++)box(x+k*.21,y,0,.065,1.32,.12,[.87,.67,.24]);}else{box(x-.42,y,0,.13,.65,.19,[.38,.34,.29]);box(x+.42,y,0,.13,.65,.19,[.38,.34,.29]);}}
 if(seen(S.exit)){const x=S.exit.x/T,y=S.exit.y/T;for(let i=0;i<4;i++)box(x,y+(i-1.5)*.18,.025+i*.04,.82,.08,.16,S.bossDead?[.71,.55,.28]:[.37,.31,.36]);if(S.bossDead)ring(x,y,.04,.8,.07,[.94,.72,.33],1,anim);}
 for(const d of S.drops){if(!seen(d)||!onScreen(d))continue;const col=d.item.rarity==='rare'?[1,.76,.25]:d.item.rarity==='magic'?[.4,.66,1]:[.77,.79,.74];box(d.x/T,d.y/T,.09,.23,.18,.23,col,anim*.7);if(d.item.rarity==='rare')box(d.x/T,d.y/T,.3,.04,.75,.04,col.map(c=>c*.7));}
 for(const hazard of S.hazards){if(!seen(hazard))continue;const x=hazard.x/T,y=hazard.y/T,r=hazard.r/T,prog=1-hazard.delay/(hazard.total||1);disk(x,y,.016,r,[.24,.07,.07]);ring(x,y,.025,r,.06,[1,.33,.2]);ring(x,y,.026,r*.93,.10,[1,.76,.39],prog,-Math.PI/2);}
 function actor(o,hero=false){const x=o.x/T,y=o.y/T,scale=hero?1:o.type==='boss'?1.48:o.type==='elite'?1.1:.95,face=o.face||0,ca=Math.cos(face),sa=Math.sin(face),step=Math.sin(o.walkPhase||0)*.12,atk=o.attackAnim>0?Math.sin((1-o.attackAnim/(o.attackTotal||.3))*Math.PI)*.5:0;const body=hero?(heroStyle()==='knight'?[.33,.53,.63]:heroStyle()==='ranger'?[.3,.51,.37]:[.43,.34,.62]):o.type==='boss'?[.57,.26,.21]:o.type==='elite'?[.49,.29,.59]:o.type==='caster'?[.34,.35,.53]:[.46,.3,.31];const co=o.flash>0?[.94,.91,.79]:body;
 const part=(f,side,z,w,ht,dep,col)=>box(x+(f*ca-side*sa)*scale,y+(f*sa+side*ca)*scale,z*scale,w*scale,ht*scale,dep*scale,col,face);
 disk(x,y,.004,.43*scale,[.06,.075,.08]);part(step,-.16,.04,.18,.35,.19,[.18,.2,.24]);part(-step,.16,.04,.18,.35,.19,[.18,.2,.24]);part(0,0,.35,.44,.5,.5,co);part(-.16,0,.34,.13,.58,.58,body.map(c=>c*.68));part(0,0,.86,.34,.32,.33,hero?[.81,.69,.53]:[.62,.61,.56]);part(.18,-.09,1.04,.045,.045,.05,[.95,.76,.31]);part(.18,.09,1.04,.045,.045,.05,[.95,.76,.31]);part(.05+atk,-.33,.5,.16,.39,.16,co);part(-.05,.33,.5,.17,.39,.17,co);
 if(hero&&heroStyle()==='ranger'){part(.32+atk,-.34,.63,.07,.52,.47,[.63,.43,.26]);part(.36+atk,-.34,.65,.035,.48,.32,[.84,.77,.59]);}
 else if(hero&&heroStyle()==='mage'||o.type==='caster'){part(.15+atk,-.38,.15,.08,1.1,.08,[.57,.4,.27]);part(.15+atk,-.38,1.2,.18,.22,.18,[.44,.75,.91]);}
 else{part(.4+atk,-.32,.63,.66,.07,.09,[.82,.83,.78]);part(.12,.4,.48,.13,.5,.43,hero?[.36,.54,.6]:[.43,.38,.3]);}
 if(o.type==='boss'){part(0,0,1.19,.46,.16,.47,[.75,.56,.26]);part(0,-.18,1.35,.1,.16,.1,[.92,.7,.32]);part(0,.18,1.35,.1,.16,.1,[.92,.7,.32]);}
 if(hero){ring(x,y,.01,.48,.045,p.guard>0?[.79,.86,.69]:[.28,.73,.79]);if(p.invuln>0)ring(x,y,.08,.65,.08,[.6,.87,1]);}
 if(o.windup){const pr=1-o.windup.left/o.windup.total;ring(x,y,.02,.62*scale,.075,[1,.45,.22],pr,-Math.PI/2);}
 }
 const p=S.p;for(const c of S.corpses||[])if(!c.used&&seen(c)&&onScreen(c)){box(c.x/T,c.y/T,.025,.65,.08,.22,[.58,.6,.51]);box(c.x/T+.23,c.y/T,.07,.18,.18,.18,[.68,.67,.58]);}
 for(const b of S.barriers||[])if(seen(b)&&onScreen(b)){for(let i=-1;i<=1;i++)box(b.x/T+i*.23,b.y/T,0,.16,1.1,.22,[.7,.68,.57]);}
 for(const m of S.minions||[])if(visible(m)){actor(m);ring(m.x/T,m.y/T,.03,.4,.06,[.25,.8,.65]);}
 for(const e of S.enemies)if(visible(e)&&!e.sealed)actor(e);actor(p,true);
 if(p.buffs?.shape){ring(p.x/T,p.y/T,.03,.65,.08,[.72,.48,.24]);box(p.x/T,p.y/T,1.16,.52,.23,.4,[.46,.32,.2]);}
 
 if(!S.keyCount){const b=S.enemies.find(e=>e.type==='boss');if(b&&seen(b))ring(b.x/T,b.y/T,.05,1,.09,[.75,.56,.22],1,anim);}
 for(const s of S.shots){if(!visible(s))continue;const col=s.kind==='fire'?[1,.51,.16]:s.kind==='arrow'?[.94,.83,.58]:s.friendly?[.4,.85,.97]:[.74,.45,.97],a=Math.atan2(s.vy,s.vx);box(s.x/T,s.y/T,.53,s.kind==='arrow'?.44:.19,.12,.12,col,a);}
 for(const f of S.vfx){if(!seen(f))continue;const k=1-f.life/f.total,col=color(f.color).map(c=>c*(.7+.3*(1-k))),r=f.r/T*(f.kind==='impact'?.3+k*.7:1);if(f.kind==='slash')ring(f.x/T,f.y/T,.42,r,.14,col,.33,f.angle-Math.PI/3);else if(f.kind==='ring')ring(f.x/T,f.y/T,.06,r*(.3+k*.7),.075,col);else if(f.kind==='impact')ring(f.x/T,f.y/T,.2,r,.1,col);}
 GL.viewport(0,0,W,H);GL.clearColor(.026,.035,.047,1);GL.clear(GL.COLOR_BUFFER_BIT|GL.DEPTH_BUFFER_BIT);GL.useProgram(glProg);GL.bindBuffer(GL.ARRAY_BUFFER,glBuf);GL.bufferData(GL.ARRAY_BUFFER,new Float32Array(verts),GL.DYNAMIC_DRAW);GL.vertexAttribPointer(glPos,3,GL.FLOAT,false,24,0);GL.vertexAttribPointer(glCol,3,GL.FLOAT,false,24,12);GL.enableVertexAttribArray(glPos);GL.enableVertexAttribArray(glCol);GL.drawArrays(GL.TRIANGLES,0,verts.length/6);vertexCount=verts.length/6;
}
function render2D(){g.clearRect(0,0,W,H);g.fillStyle='#080d13';g.fillRect(0,0,W,H);const q=(x,y)=>project(x,y,0);
 const bounds=viewBounds();for(let y=bounds.y0;y<=bounds.y1;y++)for(let x=bounds.x0;x<=bounds.x1;x++){const a=q(x*T,y*T),b=q((x+1)*T,(y+1)*T);g.fillStyle=!S.discovered[y]?.[x]?'#10161f':S.map[y][x]?(S.visible[y]?.[x]?'#465159':'#242f39'):(S.visible[y]?.[x]?'#25383d':'#17242d');g.fillRect(a.x,a.y,b.x-a.x-.7,b.y-a.y-.7);}
 for(const a of S.director.gates)if(!S.keyCount&&S.discovered[a.y]?.[a.x]){const t=q((a.x+.5)*T,(a.y+.5)*T);g.fillStyle='#e1b665';g.fillRect(t.x-9,t.y-9,18,18);}
 for(const o of S.director.objects)if(!o.used&&seen(o)){const p=q(o.x,o.y);g.fillStyle=({key:'#efd38d',chest:'#d4a35c',shrine:'#72cfbd',trap:'#d87569',exit:'#7ad6e1',waypoint:'#6ee4f8',quest:'#e7cb84',seal:'#f99a71'})[o.kind];g.font='bold 22px sans-serif';g.textAlign='center';g.fillText(({key:'⚿',chest:'▣',shrine:'✦',trap:'△',exit:'⇧',waypoint:'◈',quest:'!',seal:'◆'})[o.kind],p.x,p.y+7);}
 if(seen(S.exit)){const p=q(S.exit.x,S.exit.y);g.fillStyle=S.bossDead?'#f4d48c':'#7b6579';g.font='26px sans-serif';g.fillText('⇩',p.x,p.y+8);}
 for(const d of S.drops)if(seen(d)){const p=q(d.x,d.y);g.fillStyle=d.item.rarity==='rare'?'#e9c77c':d.item.rarity==='magic'?'#86bafb':'#c6d1cf';g.fillRect(p.x-4,p.y-4,8,8);}
 for(const s of S.shots){const p=q(s.x,s.y);g.fillStyle=s.friendly?'#f6d79c':'#b7a0e8';g.beginPath();g.arc(p.x,p.y,4,0,TAU);g.fill();}
 const actors=[...S.minions.filter(visible),...S.enemies.filter(e=>visible(e)&&!e.sealed),S.p];for(const e of actors){const p=q(e.x,e.y),hero=e===S.p,r=e.type==='boss'?19:hero?12:11;g.fillStyle=hero?'#9ac7cf':e.flash>0?'#f6e7c1':e.type==='boss'?'#b95e4b':e.type==='caster'?'#8474aa':'#a76c70';g.beginPath();g.arc(p.x,p.y,r,0,TAU);g.fill();g.strokeStyle=hero?'#d0edf0':'#e7bba1';g.lineWidth=2;g.stroke();g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x+Math.cos(e.face||0)*(r+9),p.y+Math.sin(e.face||0)*(r+9));g.stroke();}
}
function label(text,x,y,size=12,col='#d3dee2',align='center'){h.font=`${size>=16?'600':'500'} ${size}px system-ui`;h.textAlign=align;h.textBaseline='middle';h.shadowColor='#000';h.shadowBlur=4;h.fillStyle=col;h.fillText(text,x,y);h.shadowBlur=0;}
function roundRect(ctx,x,y,w,ht,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,ht,r);ctx.fillStyle=fill;ctx.fill();}
function minimapRect(){const unit=mapExpanded?Math.min((W-100)/NX,(H-130)/NY):Math.min(180/NX,112/NY),ww=NX*unit,hh=NY*unit;return {unit,ww,hh,x0:mapExpanded?(W-ww)/2:W-ww-19,y0:mapExpanded?(H-hh)/2:18};}
function mapClick(screen){if(!mapExpanded)return false;const m=minimapRect(),x=Math.floor((screen.x-m.x0)/m.unit),y=Math.floor((screen.y-m.y0)/m.unit);if(x<0||y<0||x>=NX||y>=NY)return true;
 if(!S.discovered[y]?.[x]||S.map[y][x]!==0){log('탐험한 바닥 타일을 선택하세요.');return true;}
 const dest=center({x,y});if(!walk(dest.x,dest.y,S.p.r)){log('닫힌 관문이나 장애물을 먼저 해결하세요.');return true;}
 const path=route(S.p,dest,S.p.r);if(!path.length||distance(path.at(-1),dest)>T){log('현재 위치에서 도달할 수 없습니다.');return true;}
 clickGoal=dest;attackTarget=null;S.p.pathTime=0;mapExpanded=false;log('지도 경로 이동 · WASD로 취소 / Shift로 비전투 질주');return true;
}
function drawMinimap(){const {unit,ww,hh,x0,y0}=minimapRect();roundRect(h,x0-8,y0-8,ww+16,hh+16,6,'#09121bf5');
 for(let y=0;y<NY;y++)for(let x=0;x<NX;x++)if(S.discovered[y]?.[x]){h.fillStyle=S.map[y][x]?'#34444e':S.visible[y]?.[x]?'#839999':'#4e626c';h.fillRect(x0+x*unit,y0+y*unit,Math.max(.8,unit-.25),Math.max(.8,unit-.25));}
 for(const a of S.director.gates)if(!S.keyCount&&S.discovered[a.y]?.[a.x]){h.fillStyle='#e4b86d';h.fillRect(x0+a.x*unit,y0+a.y*unit,unit,unit);}
 for(const o of S.director.objects)if(!o.used&&seen(o)){const t=tile(o.x,o.y);h.fillStyle=o.kind==='key'?'#ffe0a1':o.kind==='shrine'?'#69d9c3':'#c2a38c';h.fillRect(x0+t.x*unit-1,y0+t.y*unit-1,unit+2,unit+2);}
 for(const [i,r] of S.rooms.entries())if(S.discovered[r.c.y]?.[r.c.x]&&mapExpanded){const type=S.director.rooms[i]?.kind,names={start:'진입',boss:'보스',shrine:'성소',treasure:'보물',elite:'정예',trap:'함정',combat:'전투'};label((S.roomProgress?.[i]?.cleared?'✓ ':'')+names[type],x0+(r.c.x+.5)*unit,y0+(r.c.y+.5)*unit-12,11,'#ebddbc');}
 if(seen(S.exit)){const t=tile(S.exit.x,S.exit.y);h.fillStyle=S.bossDead?'#f9d779':'#cf7b78';h.fillRect(x0+t.x*unit,y0+t.y*unit,unit+1,unit+1);}
 if(S.p.path?.length){h.beginPath();h.strokeStyle='#98d8d4';h.lineWidth=1.5;h.moveTo(x0+S.p.x/T*unit,y0+S.p.y/T*unit);for(const p of S.p.path)h.lineTo(x0+p.x/T*unit,y0+p.y/T*unit);h.stroke();}
 h.fillStyle='#8ff2f3';h.beginPath();h.arc(x0+S.p.x/T*unit,y0+S.p.y/T*unit,Math.max(2.5,unit*.6),0,TAU);h.fill();label(mapExpanded?'탐험한 바닥 클릭: 경로 이동 · TAB 닫기':'TAB · 지도 / 85 × 50',x0+ww/2,y0+hh+18,mapExpanded?13:10,'#a9c4c8');
}
function renderHUD(){h.clearRect(0,0,W,H);if(!S)return;
 label(`ACT ${String(S.floor).padStart(2,'0')} / 05 · NORMAL`,22,26,11,'#d1af73','left');label(AREA[S.world.areaId].label||AREA[S.world.areaId].name,22,50,20,'#f2e5cc','left');label(questSummary(),22,77,12,'#9eb6bd','left');
 for(const hazard of S.hazards){if(!seen(hazard))continue;const p=project(hazard.x,hazard.y,0),sx=hazard.r/T/13.5*W/2*camera.zoom,sy=hazard.r/T*.84/8.9*H/2*camera.zoom;h.beginPath();h.ellipse(p.x,p.y,sx,sy,0,0,TAU);h.strokeStyle='#ffb177';h.lineWidth=2;h.setLineDash([5,4]);h.stroke();h.setLineDash([]);if(renderMode==='2d'){h.fillStyle='#ff573333';h.fill();}label(hazard.delay.toFixed(1),p.x,p.y,12,'#ffdbab');}
 for(const e of S.enemies){if(!visible(e))continue;const pos=project(e.x,e.y,renderMode==='3d'?(e.type==='boss'?2.2:1.45):.5),width=e.type==='boss'?70:35;roundRect(h,pos.x-width/2,pos.y-3,width,5,2,'#121c25');roundRect(h,pos.x-width/2,pos.y-3,width*clamp(e.hp/e.maxHp,0,1),5,2,e.type==='boss'?'#ddb27b':'#d57e7a');
 if(e.windup){label(e.windup.kind==='melee'?'!':'◆',pos.x,pos.y-17,17,'#ffd58b');}
 if(e.type==='boss')label(e.bossName,pos.x,pos.y-18,12,'#f5d4a3');
 if(squadDebug&&e.squadId){label(`${roleLabels[e.tactic]||'졸개'} · ${orderLabels[e.squadOrder]||'경계'} ${Math.round((e.squadMorale??1)*100)}%`,pos.x,pos.y-18,10,'#8ce5ce');if(e.path?.length){h.strokeStyle=e.squadOrder==='retreat'?'#ef9e8d99':'#77d8cb77';h.lineWidth=1;h.beginPath();const p=project(e.x,e.y,.05);h.moveTo(p.x,p.y);for(const n of e.path){const q=project(n.x,n.y,.05);h.lineTo(q.x,q.y);}h.stroke();}}
 }
 for(const f of S.fx){const pos=project(f.x,f.y,renderMode==='3d'?1.3:.4);h.globalAlpha=clamp(f.t/.4,0,1);label(f.text,pos.x,pos.y-(f.total-f.t)*30,15,f.color);h.globalAlpha=1;}
 if(clickGoal){const p=project(clickGoal.x,clickGoal.y,.02);h.strokeStyle='#94e2dd';h.beginPath();h.ellipse(p.x,p.y,8,5,0,0,TAU);h.stroke();}
 const obj=interactionTarget();if(obj&&active()){const p=project(obj.x,obj.y,.85);const text='H · '+(obj.label||({key:'열쇠 획득',chest:'상자 열기',shrine:'회복',trap:'함정 해체',exit:'지역 이동',waypoint:'순간이동진',quest:'퀘스트',seal:'봉인'})[obj.kind]);roundRect(h,p.x-58,p.y-13,116,26,5,'#0c1822e8');label(text,p.x,p.y,12,'#ffe0a0');}
 for(const o of S.director.objects)if(['exit','waypoint','quest','seal'].includes(o.kind)&&!o.used&&visible(o)&&distance(o,S.p)<280){const pt=project(o.x,o.y,1.7);label((o.requires&&!S.world.flags[o.requires]?'🔒 ':'')+(o.label||'순간이동진'),pt.x,pt.y,11,o.kind==='exit'?'#a7dde3':'#e6ce9d');}
 drawMinimap();if(S.channel){roundRect(h,W/2-130,H-64,260,34,5,'#0b1f2bec');label('마을 귀환 '+S.channel.left.toFixed(1)+'s · 이동 시 취소',W/2,H-47,13,'#92e7ee');}
 if(squadDebug){roundRect(h,16,H-46,365,31,4,'#09131be8');label(`60 Hz SIM · ${Math.round(fps)} FPS · ${S.enemies.length} ENEMIES · ${Math.round(vertexCount/3)} TRI`,27,H-30,11,'#8fc9c4','left');}
 if(paused||S.p.dead||S.completed){roundRect(h,0,0,W,H,0,'#06101bd6');label(S.completed?'THE ABYSS IS SILENT':S.p.dead?'YOU HAVE FALLEN':'PAUSED',W/2,H/2-30,35,S.completed?'#f5d394':S.p.dead?'#e59c93':'#d7e7e9');label(S.completed?'5층 정복 완료 · 새로운 Seed와 직업으로 다시 도전하세요':S.p.dead?'아래 부활 버튼으로 탐험을 계속하세요':'P 또는 일시정지 버튼으로 계속',W/2,H/2+18,16,'#a9bec9');}
}
function render(dt){if(!S)return;cameraUpdate(dt);gfx.style.display=renderMode==='3d'&&GL?'block':'none';if(renderMode==='3d'&&GL)render3D();else render2D();renderHUD();}

function refresh(){if(!S)return;const p=S.p,st=stats(),names=skillNames[S.hero],fill=(v,max)=>clamp(v/max*100,0,100).toFixed(1)+'%';
 $('#headline').textContent=`LEVEL ${String(p.level).padStart(2,'0')} · ${heroLabels[S.hero]}`;$('#heroName').textContent=heroLabels[S.hero];$('#level').textContent=p.level;
 $('#healthText').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$('#manaText').textContent=`${Math.ceil(p.mp)} / ${p.maxMp}`;$('#healthFill').style.width=fill(p.hp,p.maxHp);$('#manaFill').style.width=fill(p.mp,p.maxMp);$('#xpFill').style.width=fill(p.xp,p.level*65);$('#xpText').textContent=`EXP ${Math.floor(p.xp)} / ${p.level*65}`;
 $('#character').innerHTML=`<div><span>공격력</span><b>${st.atk}</b></div><div><span>방어력</span><b>${st.def}</b></div><div><span>치명타</span><b>${Math.round(st.crit*100)}%</b></div><div><span>저항</span><b>${st.resist}%</b></div><div><span>흡혈</span><b>${Math.round(st.leech*100)}%</b></div><div><span>매직 파인드</span><b>${st.mf}%</b></div>`;
 $('#quest').textContent=S.completed?'심연 정복 완료':!S.keyCount?'01 / 분기방의 봉인 열쇠 찾기':!S.bossDead?'02 / 관문 너머 수호자 처치':'03 / 계단에서 F로 다음 층 진입';$('#bounty').textContent=`현상금 ${Math.min(S.questKills,S.questTarget)} / ${S.questTarget}${S.questRewarded?' · 완료':''}`;$('#gold').textContent=p.gold.toLocaleString()+' G';$('#points').textContent=p.points;
 $('#skills').innerHTML=['fire','whirl','heal'].map((k,i)=>`<button class="skillUpgrade" data-up="${k}" ${!p.points||p.skills[k]>=15?'disabled':''}><span>${i+2} · ${names[i+1]}</span><b>Lv.${p.skills[k]} <em>＋</em></b></button>`).join('');
 $('#passives').innerHTML=['power','fortitude','fortune'].map(k=>`<button class="skillUpgrade" data-passive="${k}" ${!p.points||p.passives[k]>=5?'disabled':''}><span>${{power:'전투 숙련 · 공격 +3',fortitude:'강인함 · 방어 +2 / HP +12',fortune:'행운 · MF +18'}[k]}</span><b>${p.passives[k]} / 5 ＋</b></button>`).join('');
 $('#equipment').innerHTML=Object.entries(p.eq).map(([slot,it])=>`<button class="equip ${it?.rarity||''}" data-off="${slot}" title="${esc(it?itemInfo(it)+' · 클릭하여 해제':'빈 장비 슬롯')}"><span>${{weapon:'무기',armor:'갑옷',helm:'투구',ring:'반지'}[slot]}</span><b>${it?esc(it.symbol+' '+it.name):'—'}</b></button>`).join('');
 $('#inventory').innerHTML=Array.from({length:20},(_,i)=>{const it=p.inv[i];return `<button class="slot ${it?.rarity||''}" data-item="${i}" title="${it?esc(itemInfo(it)+comparison(it)):'빈 슬롯'}">${it?`<b>${it.symbol}</b><span>${esc(it.name)}</span>`:'<i>·</i>'}</button>`;}).join('');$('#bagCount').textContent=p.inv.length+' / 20';$('#craftStats').textContent=`정수 ${S.materials.essence} · 룬 ${S.materials.runes}`;
 $('#log').innerHTML=S.logs.map(s=>`<div>${esc(s)}</div>`).join('');$('#seedDisplay').textContent=String(S.dungeonSeed);$('#squadCount').textContent=Object.values(S.squads).filter(q=>S.enemies.some(e=>e.squadId===q.id)&&q.order!=='dormant').length;$('#enemyCount').textContent=S.enemies.length;$('#mode').textContent=renderMode==='3d'?'3D':'2D';$('#debug').classList.toggle('selected',squadDebug);$('#pause').textContent=paused?'계속':'일시정지';$('#revive').hidden=!p.dead;
 for(let i=1;i<=5;i++){const b=$(`[data-hotbar="${i}"]`),cd=i===4?p.globalCd:i===5?p.ultimateCd:p.cd;b.querySelector('.skillName').textContent=names[i-1];b.querySelector('.skillCd').textContent=i===5&&p.level<3?'Lv.3':cd>.1?cd.toFixed(1)+'s':'';b.classList.toggle('cooling',cd>.1||i===5&&p.level<3);b.title=names[i-1]+(i===1?' · 마나 소모 없음':` · 마나 ${i===2?11:i===3?23:i===4?20:40}`);}
 $('#travel').textContent=S.channel?'귀환 취소':atTown()&&S.townReturn?'Z · 탐험 지점 복귀':'Z · 마을 귀환';$('#worldStats').textContent=`맵 85 × 50 = 4,250타일 · 면적 10배 / 통로 4타일 · 정화 ${Object.values(S.roomProgress||{}).filter(r=>r.cleared).length} / ${Object.keys(S.roomProgress||{}).length}`;
 $('#dashLabel').textContent=p.dashCd>.1?p.dashCd.toFixed(1)+'s':'회피';$('#hpCount').textContent=p.inv.filter(x=>x.kind==='health').length;$('#mpCount').textContent=p.inv.filter(x=>x.kind==='mana').length;$('#interact').disabled=!interactionTarget()||!active();$('#portal').disabled=!S.bossDead||!S.keyCount;$('#storageVersion').textContent='SAVE v'+VERSION;
}
function itemInfo(it){return it.name+' · '+({normal:'일반',magic:'마법',rare:'희귀',unique:'고유',set:'세트'})[it.rarity]+['atk','def','crit','resist','leech'].filter(k=>it[k]).map(k=>' / '+({atk:'공격 ',def:'방어 ',crit:'치명타 ',resist:'저항 ',leech:'흡혈 '})[k]+(['crit','leech'].includes(k)?Math.round(it[k]*100)+'%':it[k])).join('')+(it.sockets?` / 소켓 ${(it.gems||[]).length}/${it.sockets}`:'');}
function comparison(it){if(it.slot==='consumable')return ' · 클릭하여 사용';const old=S.p.eq[it.slot];return '\n현재 장비 대비: '+['atk','def'].map(k=>{const d=(it[k]||0)-(old?.[k]||0);return (k==='atk'?'공격 ':'방어 ')+(d>0?'+':'')+d;}).join(', ');}
let pauseBeforeDialog=false;
function showDialog(title,html){if(!$('#modal').open)pauseBeforeDialog=paused;paused=true;keys={};pointer.down=false;clickGoal=null;refresh();$('#dialogTitle').textContent=title;$('#dialogBody').innerHTML=html;$('#modal').showModal();}
function toggleMode(){if(!GL||GL.isContextLost?.()){GL=null;renderMode='2d';gfx.style.display='none';$('#mode').disabled=true;$('#mode').title='3D를 사용할 수 없어 2D 모드로 실행합니다.';log('3D를 사용할 수 없어 2D 모드를 유지합니다.');refresh();return false;}renderMode=renderMode==='3d'?'2d':'3d';refresh();render(0);return true;}
let audioCtx=null;
function sound(kind){if(!audioEnabled)return;try{audioCtx??=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),time=audioCtx.currentTime;const f=({hit:170,crit:450,hurt:80,swing:210,cast:580,heal:690,dash:320,reward:880,blast:60})[kind]||200;osc.type=['hit','hurt','blast'].includes(kind)?'triangle':'sine';osc.frequency.setValueAtTime(f,time);osc.frequency.exponentialRampToValueAtTime(kind==='reward'?f*1.5:f*.5,time+.13);gain.gain.setValueAtTime(.035,time);gain.gain.exponentialRampToValueAtTime(.0001,time+.17);osc.connect(gain);gain.connect(audioCtx.destination);osc.start();osc.stop(time+.18);}catch{audioEnabled=false;}}
function point(e){const r=hud.getBoundingClientRect(),x=(e.clientX-r.left)*W/r.width,y=(e.clientY-r.top)*H/r.height;Object.assign(pointer,unproject(x,y));return {x,y};}
function selectWorld(e){if(!active()||e.button===2)return;const screen=point(e);hud.focus();if(mapClick(screen))return;if(e.shiftKey){cast(2);return;}const candidates=S.enemies.filter(visible).map(m=>{const p=project(m.x,m.y,renderMode==='3d'?.75:0);return {m,d:Math.hypot(p.x-screen.x,p.y-screen.y)};}).filter(v=>v.d<24).sort((a,b)=>a.d-b.d);if(candidates.length){attackTarget=candidates[0].m.id;clickGoal=null;cast(1,candidates[0].m);return;}attackTarget=null;clickGoal={...pointer};S.p.pathTime=0;pointer.down=true;hud.setPointerCapture(e.pointerId);}
function setPause(){if(!S||S.p.dead||S.completed)return;paused=!paused;keys={};pointer.down=false;clickGoal=null;refresh();}
function guarded(fn){return (...args)=>{if(active())return fn(...args);};}
function bindUI(){
 $('#new').onclick=()=>showDialog('새 탐험 시작',`<p>현재 진행은 자동으로 덮어쓰지 않습니다. 필요한 경우 먼저 저장하세요.</p><label>직업<select id="newClass">${Object.keys(heroLabels).map(k=>`<option value="${k}" ${k===S.hero?'selected':''}>${heroLabels[k]}</option>`).join('')}</select></label><label>던전 Seed<input id="newSeed" placeholder="비우면 무작위" maxlength="50"></label><button id="confirmNew" class="primary">탐험 시작</button>`);
 $('#dialogBody').addEventListener('click',e=>{if(e.target.id==='confirmNew'){const hero=$('#newClass').value,seed=$('#newSeed').value.trim();pauseBeforeDialog=false;$('#modal').close();create(hero,seed||undefined);}});$('#dialogClose').onclick=()=>{const restorePause=pauseBeforeDialog;$('#modal').close();if(!S.completed&&!S.p.dead)paused=restorePause;refresh();};$('#modal').addEventListener('cancel',e=>{e.preventDefault();$('#dialogClose').click();});$('#modal').addEventListener('close',()=>{if($('#modal').open)return;if(!S.completed&&!S.p.dead)paused=pauseBeforeDialog;refresh();});$('#save').onclick=()=>save();$('#load').onclick=load;$('#export').onclick=()=>downloadText('dark_descent_xxv_save.json',encodeSave());$('#import').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>3e6)throw Error('3MB 이하 파일만 지원합니다.');restoreSave(await file.text());log('JSON 저장 파일을 복원했습니다.');}catch(err){log('가져오기 실패: '+err.message);}e.target.value='';};
 $('#mode').onclick=toggleMode;$('#pause').onclick=setPause;$('#revive').onclick=revive;$('#audio').onclick=()=>{audioEnabled=!audioEnabled;$('#audio').textContent=audioEnabled?'소리 ON':'소리 OFF';sound('heal');};$('#debug').onclick=()=>{squadDebug=!squadDebug;refresh();};$('#motion').onchange=e=>{motionReduced=e.target.checked;screenShake=0;};
 $('#help').onclick=()=>showDialog('조작 안내',`<p><strong>열쇠 탐색 → 관문 개방 → 수호자 처치 → 다음 층.</strong> 5층의 심연 군주를 쓰러뜨리면 승리합니다.</p><p>WASD / 방향키 이동 · 바닥 클릭: 경로 이동 · 적 클릭: 접근 후 연속 기본 공격 · Shift+클릭: 2번 스킬.</p><p>1~5 직업 스킬 · Space 회피 · Shift 비전투 질주 · Z 3초 마을 귀환 / 복귀 · Q/R 물약 · H 상호작용/함정 해체 · E 줍기 · F 계단 · Tab 지도(탐험한 바닥 클릭 이동) · T 전술 표시 · P 일시정지 · 휠 확대/축소.</p><p>시작 방에서 상점과 제작을 이용합니다. 스킬 탭에서 포인트를 사용하세요. 붉은 공격 예고는 회피할 수 있으며, 원거리 공격은 벽과 잠긴 관문을 통과하지 않습니다.</p><p>브라우저 저장이 제한되면 JSON 내보내기로 저장을 보관하세요. 파일을 옮기거나 이름을 바꾸면 브라우저 저장 슬롯이 달라질 수 있습니다.</p>`);
 $('#travel').onclick=townTravel;$('#mapToggle').onclick=()=>{mapExpanded=!mapExpanded;};
 $('#interact').onclick=interactContent;$('#pickup').onclick=pickup;$('#portal').onclick=descend;$('#dash').onclick=dash;$('#potion').onclick=guarded(()=>potion('health'));$('#manaPotion').onclick=guarded(()=>potion('mana'));$('#shop').onclick=()=>shop('health');$('#shopMana').onclick=()=>shop('mana');$('#sell').onclick=sell;$('#salvage').onclick=guarded(salvage);$('#forge').onclick=guarded(forge);$('#rune').onclick=guarded(inscribe);$('#gamble').onclick=guarded(gamble);document.querySelectorAll('[data-socket]').forEach(b=>b.onclick=()=>socketRune(b.dataset.socket));
 $('#inventory').onclick=e=>{const b=e.target.closest('[data-item]');if(b)useItem(+b.dataset.item);};$('#equipment').onclick=e=>{const b=e.target.closest('[data-off]');if(b)equipOff(b.dataset.off);};$('#skills').onclick=e=>{const b=e.target.closest('[data-up]');if(b)upgrade(b.dataset.up);};$('#passives').onclick=e=>{const b=e.target.closest('[data-passive]');if(b)trainPassive(b.dataset.passive);};document.querySelectorAll('[data-hotbar]').forEach(b=>b.onclick=()=>cast(+b.dataset.hotbar));
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('selected',t===b));document.querySelectorAll('.tabpage').forEach(t=>t.hidden=t.id!==b.dataset.tab);});
 $('#dungeonTest').onclick=()=>{const result=verifyDirector(250);showDialog('던전 생성 검증',`<p><strong>${result.count.toLocaleString()}개 Seed · 오류 ${result.failures}개</strong></p><p>검사: 시작점 연결, 잠금 전 열쇠 도달, 잠금 전 보스 차단, 개방 후 보스 도달, 동일 Seed 재현.</p><p>방 ${result.minRooms}~${result.maxRooms}개 · 안전 대체 맵 ${result.fallbacks}개 · ${result.ms}ms</p><p>전투 밸런스와 수동 플레이 완주 검증은 별도 항목입니다.</p>`);};
 hud.addEventListener('pointerdown',selectWorld);hud.addEventListener('pointermove',e=>{point(e);if(pointer.down&&active()&&!mapExpanded){clickGoal={...pointer};S.p.pathTime=0;}});hud.addEventListener('pointerup',()=>pointer.down=false);hud.addEventListener('pointercancel',()=>pointer.down=false);hud.addEventListener('contextmenu',e=>e.preventDefault());hud.addEventListener('wheel',e=>{e.preventDefault();camera.zoom=clamp(camera.zoom-e.deltaY*.001,.72,1.8);},{passive:false});
 window.addEventListener('keydown',e=>{if(gameInputBlocked(e))return;const k=gameKey(e);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Tab'].includes(k))e.preventDefault();if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Shift','1','2','3','4','5'].includes(k))keys[k]=true;if(e.repeat)return;
 const action={z:townTravel,e:pickup,h:interactContent,g:interactContent,f:descend,q:()=>potion('health'),r:()=>potion('mana'),' ':dash,b:salvage,v:forge,n:inscribe,m:gamble,'6':()=>socketRune('fire'),'7':()=>socketRune('life'),'8':()=>socketRune('ward')};if(action[k]&&active())action[k]();if(k==='p')setPause();if(k==='t'){squadDebug=!squadDebug;refresh();}if(k==='Tab')mapExpanded=!mapExpanded;if(k==='Escape'){clickGoal=null;attackTarget=null;S.channel=null;mapExpanded=false;}});
 window.addEventListener('keyup',e=>{const k=gameKey(e);if(k)keys[k]=false;});window.addEventListener('blur',()=>{const wasActive=active();clearGameplayInput();if(wasActive){paused=true;refresh();}});document.addEventListener('visibilitychange',()=>{if(document.hidden){const wasActive=active();clearGameplayInput();if(wasActive){paused=true;refresh();}}});
 for(const b of document.querySelectorAll('[data-move]')){b.onpointerdown=e=>{e.preventDefault();keys[b.dataset.move]=true;b.setPointerCapture(e.pointerId);};b.onpointerup=b.onpointercancel=()=>keys[b.dataset.move]=false;}
}
function frame(t){const real=Math.min(.1,(t-lastTime)/1000||1/60);lastTime=t;anim+=real;fps=fps*.94+(1/Math.max(.001,real))*.06;if(active()&&!window.__DD_CONTROLLED__){accumulator=Math.min(.1,accumulator+real);let n=0;while(accumulator>=1/60&&n++<6){update(1/60);accumulator-=1/60;}}else accumulator=0;if(!(window.__DD_TEST__&&window.__DD_MANUAL_RENDER__))render(real);frameCount++;requestAnimationFrame(frame);}

// Region graph uses published area identities. Geometry, encounter budgets and quest interactions are web adapters.
const AREA_FIELDS=['map','rooms','exit','dungeonSeed','director','enemies','squads','drops','discovered','roomProgress','bossDead','corpses','localQuest'];
const QUEST_OBJECTS={
 a1_dark_wood:['inifuss','이니푸스 나무'],a1_tristram:['cain','데커드 케인 구출'],a1_barracks:['malus','호라드림 망치'],
 a2_halls_of_the_dead_level_3:['cube','호라드림 함'],a2_maggot_lair_level_3:['shaft','왕들의 지팡이'],a2_claw_viper_temple_level_2:['amulet','독사의 목걸이'],
 a3_spider_cavern:['eye','칼림의 눈'],a3_flayer_dungeon_level_3:['brain','칼림의 뇌'],a3_sewers_level_2:['heart','칼림의 심장'],a3_ruined_temple:['lam_esen','람 에센의 고서'],a3_travincal:['orb','유혹의 보주'],
 a5_frozen_river:['anya','얼어붙은 안야'],a5_arreat_summit:['ancients_start','고대인의 제단'],a5_throne_of_destruction:['throne_start','파괴의 왕좌 · 5파 공세']};
const FLAG_LABELS={inifuss:'이니푸스 두루마리',amulet:'독사의 목걸이',summoner:'소환사 처치',staff:'호라드림 지팡이 조립',orb:'칼림의 의지로 보주 파괴',anya:'안야 구출',ancients:'고대인 3명 처치 · Lv.20',baal_waves:'왕좌 5파 처치'};
function worldEdges(){const edges=[...D2DATA.world.edges,{from:'a2_tal_rasha_tomb_'+S.world.trueTomb,to:'a2_tal_rasha_s_chamber',requires:'staff',bidirectional:true}];if((S.runSeed&1)===0)edges.push({from:'a3_spider_forest',to:'a3_flayer_jungle',requires:null,bidirectional:true,variant:true});return edges;}
function adjacentAreas(id=S.world.areaId){return worldEdges().filter(e=>e.from===id||e.to===id&&e.bidirectional).map(e=>({id:e.from===id?e.to:e.from,requires:e.requires||null}));}
function areaSeed(id){return hashSeed(S.runSeed+':region:'+id+':v26');}
function compileArea(id){const a=AREA[id],seed=areaSeed(id),d=compileDungeon(seed,a.act);if(a.kind==='field'||a.kind==='town'){
 const base=d.map.map(r=>r.slice()),rng=seedRng(seed^0x71ee);d.map=Array.from({length:NY},(_,y)=>Array.from({length:NX},(_,x)=>x<1||y<1||x>=NX-1||y>=NY-1?1:0));
 if(a.kind==='field')for(let k=0;k<150;k++){const x=2+Math.floor(rng()*(NX-4)),y=2+Math.floor(rng()*(NY-4)),w=1+Math.floor(rng()*3),ht=1+Math.floor(rng()*3);for(let yy=y;yy<Math.min(NY-1,y+ht);yy++)for(let xx=x;xx<Math.min(NX-1,x+w);xx++)if(base[yy][xx]!==0)d.map[yy][xx]=1;}
 // Discard small floor islands enclosed by procedural obstacles. Protecting old
 // corridors alone guarantees the main path, not every newly-open field tile.
 const root=d.rooms[0].c,queue=[root.y*NX+root.x],seen=new Uint8Array(NX*NY);seen[queue[0]]=1;
 for(let n=0;n<queue.length;n++){const key=queue[n],x=key%NX,y=Math.floor(key/NX);for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy,k=yy*NX+xx;if(xx>=0&&yy>=0&&xx<NX&&yy<NY&&!d.map[yy][xx]&&!seen[k]){seen[k]=1;queue.push(k);}}}
 for(let y=1;y<NY-1;y++)for(let x=1;x<NX-1;x++)if(!d.map[y][x]&&!seen[y*NX+x])d.map[y][x]=1;
 d.content=compileContent(d,a.act);
 }return d;}
function snapshotArea(){const snap={};for(const k of AREA_FIELDS)snap[k]=JSON.parse(JSON.stringify(S[k]??(k==='localQuest'?{}:[])));for(const e of snap.enemies){e.path=[];e.pathTime=0;e.windup=null;}return snap;}
function scaleEnemy(e,level){e.level=level;e.defense=8+level*9;e.attackRating=35+level*18;e.undead=random()<1/3;e.resists={fire:0,cold:0,lightning:0,poison:0,magic:0,physical:0};e.hp=e.maxHp=e.type==='boss'?150+level*31:e.type==='elite'?38+level*9:12+level*4;e.atk=e.type==='boss'?6+level*1.2:2+level*.65;e.xp=e.type==='boss'?250+level*70:45+level*30;return e;}
function spawnArea(id){const a=AREA[id],d=compileArea(id),savedRng=S.rngState;S.rngState=(d.seed^0xabc127)>>>0;S.p.x=d.start.x;S.p.y=d.start.y;S.floor=a.act;applyContent(d);S.keyCount=1;S.director.gates=[];S.director.objects=S.director.objects.filter(o=>o.kind!=='key');S.enemies=S.enemies.filter(e=>e.type!=='boss');for(const e of S.enemies)scaleEnemy(e,a.webEncounterLevel);
 S.corpses=[];S.localQuest={};S.discovered=[];S.visible=[];S.drops=[];S.bossDead=!a.boss;
 if(a.kind==='town'){S.enemies=[];S.squads={};S.roomProgress={};S.director.objects=[];S.director.rooms.forEach(r=>r.kind='start');}
 if(a.boss){const pos=center(S.rooms.at(-1).c),boss=scaleEnemy(makeEnemy(pos.x,pos.y,'boss',{bossName:a.boss.name,questFlag:a.boss.flag,encounterRoom:S.rooms.length-1,home:{...pos},undead:['blood_raven','radament'].includes(a.boss.flag)}),a.webEncounterLevel+3);boss.undead=['blood_raven','radament'].includes(a.boss.flag);if(a.boss.flag==='diablo')boss.sealed=true;S.enemies.push(boss);}
 const exits=adjacentAreas(id);exits.forEach((ed,i)=>{const r=a.kind==='town'?S.rooms[0]:S.rooms[i===0?0:i===1?S.rooms.length-1:Math.min(i,S.rooms.length-2)],pos=center(r.c);S.director.objects.push({id:'exit-'+ed.id,kind:'exit',x:pos.x+(a.kind==='town'?i*76:0),y:pos.y+64,target:ed.id,requires:ed.requires,used:false,label:AREA[ed.id].label||AREA[ed.id].name});});
 if(a.waypoint){const pos=center(S.rooms[0].c);S.director.objects.push({id:'waypoint-'+id,kind:'waypoint',x:pos.x+64,y:pos.y-64,used:false,label:'순간이동진'});}
 const qo=QUEST_OBJECTS[id];if(qo){const pos=center(S.rooms[a.kind==='town'?0:Math.max(1,S.rooms.length-2)].c);S.director.objects.push({id:'quest-'+qo[0],kind:'quest',flag:qo[0],label:qo[1],...pos,used:!!S.world.flags[qo[0]]});}
 if(id==='a4_chaos_sanctuary')for(let i=0;i<5;i++){const pos=center(S.rooms[i+1].c);S.director.objects.push({id:'seal-'+i,kind:'seal',seal:i,x:pos.x+80,y:pos.y,used:false,label:'혼돈의 봉인 '+(i+1)});}
 S.rngState=savedRng;S.questTarget=99999;S.questKills=0;S.questRewarded=false;S.exit={...center(S.rooms[0].c)};navVersion++;return d;}
function enterArea(id,opts={}){const a=AREA[id];if(!a)throw Error('알 수 없는 지역: '+id);const old=S.world.areaId;if(old&&!opts.initial)S.world.states[old]=snapshotArea();S.world.areaId=id;S.floor=a.act;
 const saved=S.world.states[id];if(saved){for(const k of AREA_FIELDS)S[k]=saved[k];delete S.world.states[id];}else spawnArea(id);
 S.keyCount=1;S.world.visited[id]=true;if(a.kind==='town')S.world.waypoints[id]=true;
 const entrance=S.director.objects.find(o=>o.kind==='exit'&&o.target===old),start=opts.position||entrance||center(S.rooms[0].c);S.p.x=start.x;S.p.y=start.y+(entrance&&!opts.position?28:0);if(!walk(S.p.x,S.p.y,S.p.r)){Object.assign(S.p,center(S.rooms[0].c));}
 S.shots=[];S.hazards=[];S.fx=[];S.vfx=[];S.fields=[];S.barriers=[];S.townReturn=null;S.visible=[];for(const m of S.minions){m.x=S.p.x+16;m.y=S.p.y;m.path=[];m.pathTime=0;}resetTransient();S.p.invuln=1;camera.x=S.p.x;camera.y=S.p.y;pointer.x=S.p.x+40;pointer.y=S.p.y;reveal();log(`ACT ${a.act} · ${a.label||a.name}${saved?' · 지역 상태 복원':''}`);refresh();return true;}
function canTraverse(target){const e=adjacentAreas().find(e=>e.id===target);return !!e&&(!e.requires||!!S.world.flags[e.requires]);}
function travelExit(o){if(!active()||o.kind!=='exit'||distance(S.p,o)>62||!lineClear(S.p,o,1))return false;if(!canTraverse(o.target)){log('잠금: '+(FLAG_LABELS[o.requires]||o.requires));return false;}enterArea(o.target);save(true);return true;}
function teleportWaypoint(id){if(!AREA[id]||!S.world.waypoints[id]){log('활성화한 순간이동진만 이용할 수 있습니다.');return false;}const near=S.director.objects.some(o=>o.kind==='waypoint'&&distance(o,S.p)<70);if(!atTown()&&!near){log('마을 또는 순간이동진 근처에서 이용하세요.');return false;}enterArea(id);return true;}
function travelAct(act){if(!atTown()||act>S.world.actUnlocked||!D2DATA.world.towns[act])return false;enterArea(D2DATA.world.towns[act]);return true;}
function claimReward(id,{skills=0,attributes=0,xp=0,gold=0}={}){if(S.world.claims[id])return false;S.world.claims[id]=true;S.p.points+=skills;S.p.bonusSkills+=skills;S.p.statPoints+=attributes;S.p.bonusStats+=attributes;S.p.xp+=xp;S.p.gold+=gold;levelCheck();log('퀘스트 완료 · '+id+(skills?' / 스킬 +'+skills:'')+(attributes?' / 능력치 +'+attributes:''));return true;}
function questCraft(kind){const f=S.world.flags;if(kind==='staff'){if(!(f.cube&&f.shaft&&f.amulet)){log('호라드림 함, 지팡이 자루, 목걸이가 필요합니다.');return false;}f.staff=true;log('호라드림 지팡이 완성 · 진짜 무덤 '+S.world.trueTomb+'번');}
 else if(kind==='will'){if(!(f.cube&&f.eye&&f.brain&&f.heart&&f.flail)){log('호라드림 함 · 칼림의 눈/뇌/심장/도리깨가 필요합니다.');return false;}f.will=true;log('칼림의 의지 완성 · 트라빈칼의 보주를 파괴하세요.');}else return false;refresh();return true;}
function spawnQuestGroup(kind,count){const r=S.rooms.at(-1),pos=center(r.c),lv=AREA[S.world.areaId].webEncounterLevel;for(let i=0;i<count;i++){const e=scaleEnemy(makeEnemy(pos.x+(i%3-1)*55,pos.y+Math.floor(i/3)*52,'elite',{questGroup:kind,activated:true,home:{...pos},encounterRoom:S.rooms.length-1}),lv+2);if(kind==='ancients'){e.bossName=['Korlic','Talic','Madawc'][i];e.hp=e.maxHp*=4;}S.enemies.push(e);}}
function useQuest(o){const f=S.world.flags,id=o.flag;if(id==='orb'){if(!f.will){log('칼림의 의지를 먼저 조립하세요.');return false;}f.orb=true;}
 else if(id==='ancients_start'){if(S.p.level<20){log('보통 난이도 고대인 도전은 캐릭터 Lv.20 이상입니다.');return false;}spawnQuestGroup('ancients',3);S.localQuest.ancients=true;f.ancients_start=true;}
 else if(id==='throne_start'){S.localQuest.wave=1;spawnQuestGroup('wave',5);f.throne_start=true;log('바알의 공세 · 1 / 5');}
 else f[id]=true;
 o.used=true;if(id==='lam_esen')claimReward('lam_esen',{attributes:5});if(id==='anya'){claimReward('anya');recalcResources();}log(o.label+' · 획득/활성화');refresh();return true;}
const oldInteraction=interactContent;
interactionTarget=function(){if(!S?.director)return null;return S.director.objects.filter(o=>(!o.used||['exit','waypoint'].includes(o.kind))&&distance(o,S.p)<62&&lineClear(S.p,o,1)).sort((a,b)=>distance(a,S.p)-distance(b,S.p))[0]||null;};
interactContent=function(){if(!active())return false;const o=interactionTarget();if(!o){log('H: 출입구 / 순간이동진 / 퀘스트 오브젝트에 접근하세요.');return false;}if(o.kind==='exit')return travelExit(o);if(o.kind==='waypoint'){S.world.waypoints[S.world.areaId]=true;log('순간이동진 활성화');openWorldMap();return true;}if(o.kind==='quest')return useQuest(o);if(o.kind==='seal'){o.used=true;S.localQuest.seals=(S.localQuest.seals||0)+1;if([0,2,4].includes(o.seal))spawnQuestGroup('seal',1);log('혼돈의 봉인 '+S.localQuest.seals+' / 5');return true;}return oldInteraction();};
descend=function(){const o=S.director.objects.filter(o=>o.kind==='exit'&&distance(S.p,o)<62).sort((a,b)=>distance(a,S.p)-distance(b,S.p))[0];if(o)return travelExit(o);log('지역 출입구 근처에서 F 또는 H');return false;};
townTravel=function(){if(!active())return false;if(S.channel){S.channel=null;return false;}if(atTown()){const ret=S.world.returnPortal;if(!ret){log('필드에서 Z로 귀환하면 왕복 포탈이 유지됩니다.');return false;}enterArea(ret.areaId,{position:ret});return true;}if(nearThreat()){log('위협을 벗어난 뒤 3초 귀환을 사용하세요. (웹 편의 규칙)');return false;}clickGoal=null;attackTarget=null;S.p.path=[];S.channel={left:3,total:3,x:S.p.x,y:S.p.y,hp:S.p.hp};return true;};
updateTravel=function(dt){const ch=S.channel;if(!ch)return;if(distance(ch,S.p)>3||S.p.hp<ch.hp||nearThreat()){S.channel=null;return;}ch.left-=dt;if(ch.left<=0){S.world.returnPortal={areaId:S.world.areaId,x:S.p.x,y:S.p.y};enterArea(D2DATA.world.towns[S.floor]);}};
revive=function(){if(!S.p.dead)return;S.p.dead=false;S.completed=false;paused=false;S.p.gold=Math.floor(S.p.gold*(1-Math.min(20,S.p.level)/100));enterArea(D2DATA.world.towns[S.floor]);S.p.hp=S.p.maxHp;S.p.mp=S.p.maxMp;log('마을 부활 · 보통 난이도 경험치 손실 없음 / 장비 회수는 웹 간소화');refresh();};
const oldRoomProgress=updateRoomProgress;
updateRoomProgress=function(){if(atTown())return;oldRoomProgress();if(S.world.areaId==='a1_den_of_evil'&&!S.enemies.length){S.world.flags.den=true;claimReward('den',{skills:1});}
 if(S.localQuest.ancients&&!S.enemies.some(e=>e.questGroup==='ancients')){S.world.flags.ancients=true;S.localQuest.ancients=false;claimReward('ancients',{xp:Math.min(1000000,(D2DATA.experience[S.p.level]?.total_experience||S.p.xp)-S.p.xp)});}
 if(S.localQuest.wave&&!S.enemies.some(e=>e.questGroup==='wave')){if(S.localQuest.wave<5){S.localQuest.wave++;spawnQuestGroup('wave',5);log('바알의 공세 · '+S.localQuest.wave+' / 5');}else{S.localQuest.wave=0;S.world.flags.baal_waves=true;log('5파 공세 완료 · 세계석 보관실 개방');}}
 if(S.localQuest.seals===5&&!S.enemies.some(e=>e.questGroup==='seal')){const boss=S.enemies.find(e=>e.questFlag==='diablo');if(boss?.sealed){boss.sealed=false;log('봉인 수호자 처치 · 디아블로 출현');}}
};
kill=function(e){const i=S.enemies.indexOf(e);if(i<0)return;S.enemies.splice(i,1);S.kills++;S.questKills++;if(!e.summoned){S.corpses.push({id:'corpse-'+e.id,x:e.x,y:e.y,maxHp:e.maxHp,used:false});S.corpses=S.corpses.slice(-120);const item=lootRoll(e);if(item)S.drops.push({x:e.x,y:e.y,item});S.p.gold+=rand(2,7)+Math.floor(e.level||1);S.p.xp+=e.xp||60;}else S.p.xp+=5;
 if(e.questFlag){S.world.flags[e.questFlag]=true;S.bossDead=true;log(e.bossName+' 처치');if(e.questFlag==='radament')claimReward('radament',{skills:1});if(e.questFlag==='izual')claimReward('izual',{skills:2});if(e.questFlag==='council')S.world.flags.flail=true;if(e.questFlag==='summoner')log('진짜 탈 라샤 무덤은 '+S.world.trueTomb+'번입니다.');const act=['andariel','duriel','mephisto','diablo','baal'].indexOf(e.questFlag)+1;if(act){S.world.actUnlocked=Math.max(S.world.actUnlocked,Math.min(5,act+1));claimReward(e.questFlag);log(act===5?'보통 난이도 5액트 캠페인 완료!':'마을의 액트 이동으로 다음 액트에 진입하세요.');if(act===5)S.world.flags.campaignComplete=true;}}
 if(e.modifier==='volatile')S.hazards.push({x:e.x,y:e.y,r:53,delay:.95,total:.95,damage:e.atk*1.4,kind:'blast'});levelCheck();};

// Data-backed skill execution. Public rank tables are preserved; animation, missile motion and unsupported formulas are web adapters.
const ELEMENT_COLORS={physical:'#f2d79d',fire:'#ff955a',cold:'#8cd8ff',lightning:'#f5f0b0',poison:'#96d279',magic:'#c5c5ff'};
function synergyValue(id,stat){return (CURVE[id]?.synergies||[]).filter(x=>x.stat===stat).reduce((n,x)=>n+(S.p.skills[x.skill_id]||0)*x.bonus_per_level,0);}
function skillValues(id){const sk=SKILL[id],rank=Math.min(20,softRank(id)),r=curveRow(id,rank),rt=sk?.runtime||{};return {rank,row:r,rt,mana:Math.max(0,r.mana??(id==='paladin_sacrifice'?0:rt.kind==='passive'?0:rt.kind==='aura'?0:rt.kind==='teleport'?24:4+rank*.35)),delay:r.casting_delay_seconds||0};}
function attackChance(ar,def,attackerLevel,defenderLevel){return clamp(2*ar/Math.max(1,ar+Math.max(0,def))*attackerLevel/Math.max(1,attackerLevel+defenderLevel),.05,.95);}
function weaponRange(){const b=activeEquipment().includes(S.p.eq.weapon)?BASE[S.p.eq.weapon?.baseId]:null;return ['bow','javelin'].includes(b?.type)?230:b?.type==='spear'?66:48;}
function skillPacket(id,physical=false){const {rank,row:r,rt}=skillValues(id),st=stats(),packet={physical:0,fire:0,cold:0,lightning:0,poison:0,magic:0},scaled=(key,stat)=>{const a=r[key];return Array.isArray(a)?(a[0]+random()*(a[1]-a[0]))*(1+synergyValue(id,stat)/100):0;};
 if(physical){packet.physical=(rand(...st.weaponDamage)+(r.damage_flat||0))*(1+(st.offED+(r.damage_percent||0)+synergyValue(id,'damage_percent'))/100);}
 if(r.physical_damage)packet.physical=scaled('physical_damage','physical_damage_percent');if(r.healing)packet.healing=scaled('healing','healing_percent');
 for(const k of ['fire','cold','lightning','magic'])packet[k]=scaled(k+'_damage',k+'_damage_percent')||0;
 if(r.poison_damage_total){packet.poison=scaled('poison_damage_total','poison_damage_percent');packet.poisonDuration=r.duration_seconds||2;}
 if(!CURVE[id]&&rt.element)packet[rt.element]=(4+rank*4)*(1+synergyValue(id,rt.element+'_damage_percent')/100);
 if(!CURVE[id]&&physical)packet.physical*=1+(rt.kind==='melee'?.25+rank*.08:0);
 packet.attackRating=Math.floor(st.ar*(1+((r.attack_rating_percent||0)+synergyValue(id,'attack_rating_percent'))/100));packet.needsAR=physical&&!rt.autoHit;packet.undeadOnly=!!rt.undeadOnly;packet.noLeech=!physical||!!rt.autoHit;packet.weaponHit=physical;packet.noCrit=!physical||['amazon_impale','assassin_dragon_talon','paladin_sacrifice','paladin_smite'].includes(id);packet.coldDuration=packet.cold?2+rank*.1:0;packet.skillId=id;return packet;}
hurtEnemy=function(e,raw,critChance=0){if(!e||e.hp<=0||!S.enemies.includes(e)||e.sealed)return 0;const crit=random()<critChance,dmg=Math.max(.01,raw*(crit?2:1)),actual=Math.min(e.hp,dmg);e.hp-=dmg;e.flash=.12;e.activated=true;e.aggro=8;float(e.x,e.y-8,(crit?'✦ ':'')+Math.ceil(dmg),crit?'#ffe095':'#ffffff');eventVfx('impact',e.x,e.y,12,'#b5f0ee',.16);if(e.hp<=0)kill(e);return actual;};
function applyPacket(e,packet){if(!e||e.hp<=0||e.sealed)return 0;if(packet.undeadOnly&&!e.undead){float(e.x,e.y,'언데드 전용','#c0ccd4');return 0;}
 const defense=Math.max(0,(e.defense||0)-(e.innerSight?.value||0));if(packet.needsAR&&random()>attackChance(packet.attackRating,defense,S.p.level,e.level||1)){float(e.x,e.y,'빗나감','#94a7b4');return 0;}
 let total=0,physical=0;for(const k of ['physical','fire','cold','lightning','magic']){let v=packet[k]||0,res=e.resists?.[k]||0;if(k==='physical'&&e.amplify?.left>0)res-=100;v*=1-clamp(res,-100,100)/100;if(k==='physical'){if(!packet.noCrit&&random()<stats().crit)v*=2;physical=v;}total+=v;}
 const actual=total>0?hurtEnemy(e,total):0;if(actual>0&&!packet.noLeech&&physical>0)S.p.hp=Math.min(S.p.maxHp,S.p.hp+actual*Math.min(1,physical/total)*stats().leech);
 if(e.hp>0&&packet.poison>0){const duration=packet.poisonDuration||2,dps=packet.poison/duration*(1-clamp(e.resists?.poison||0,-100,100)/100);if(!e.poison||dps>=e.poison.dps)e.poison={dps,left:duration};}if(e.hp>0&&packet.coldDuration)e.chill=Math.max(e.chill||0,packet.coldDuration);return actual;}
damagePlayer=function(raw,element='physical',opts={}){const p=S.p;if(p.dead||p.invuln>0||atTown())return 0;const st=stats();if(element==='physical'&&!opts.noBlock&&random()<st.block/100){float(p.x,p.y,'막기','#a5d6ff');return 0;}let d=Math.max(0,raw*(element==='physical'?1:1-(st.resistances[element]||0)/100));if(element==='physical'&&p.boneArmor>0){const absorb=Math.min(p.boneArmor,d);p.boneArmor-=absorb;d-=absorb;}d=Math.round(d);if(d<=0)return 0;p.hp=Math.max(0,p.hp-d);p.flash=.16;S.channel=null;float(p.x,p.y-8,'−'+d,'#ff8b87');screenShake=motionReduced?0:3;if(!p.hp){p.dead=true;clickGoal=null;pointer.down=false;log('쓰러졌습니다. 마을에서 부활할 수 있습니다.');refresh();}return d;};
function emitPacket(from,angle,packet,opts={}){fireShot(from,angle,opts.speed||360,0,opts.kind||'arcane',true,opts.aoe||0);Object.assign(S.shots.at(-1),{packet:{...packet},pierce:!!opts.pierce,hitIds:[],life:opts.life||1.6});}
function basicAttack(target){const p=S.p;if(p.cd>0||atTown())return false;const st=stats(),b=activeEquipment().includes(p.eq.weapon)?BASE[p.eq.weapon?.baseId]:null,angle=Math.atan2(target.y-p.y,target.x-p.x);p.cd=.5/(1+st.ias/100);attackAnim(p,angle);const packet={physical:rand(st.minDamage,st.maxDamage),needsAR:true,attackRating:st.ar,weaponHit:true};if(p.charges>0){const row=curveRow('assassin_tiger_strike');packet.physical*=1+(row['charge'+p.charges+'_damage_percent']||0)/100;p.charges=0;}
 if(['bow','javelin'].includes(b?.type)){emitPacket(p,angle,packet,{kind:'arrow',speed:440});}else{const e=targetsInCone(p,angle,weaponRange(),2.5).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(e)applyPacket(e,packet);eventVfx('slash',p.x,p.y,weaponRange(),ELEMENT_COLORS.physical,.22,angle);}sound('swing');return true;}
function skillUseReason(id){const sk=SKILL[id];if(!sk?.runtime||softRank(id)<1)return '스킬 미습득 / 장비 보너스 없음';const {rt,mana}=skillValues(id),p=S.p,b=activeEquipment().includes(p.eq.weapon)?BASE[p.eq.weapon?.baseId]:null;if(rt.kind==='passive')return '패시브 스킬';if(atTown()&&!['buff','armor','shape','aura','summon'].includes(rt.kind))return '마을에서 공격할 수 없습니다.';if(p.mp<mana)return '마나 부족';if(rt.weapon&&!rt.weapon.includes(b?.type))return '필요 무기: '+rt.weapon.join('/');if(rt.shield&&(!activeEquipment().includes(p.eq.offhand)||BASE[p.eq.offhand?.baseId]?.type!=='shield'))return '방패 필요';if(rt.dual&&!activeEquipment().includes(p.eq.offhand))return '양손에 각각 무기 필요';if(rt.dual&&BASE[p.eq.offhand.baseId]?.slot!=='weapon')return '보조 손 무기 필요';if(rt.shapeRequired&&!p.buffs.shape)return '변신 필요';if(rt.form&&p.buffs.shape?.form!==rt.form&&rt.kind!=='shape')return '해당 변신 상태 필요';return '';}
cast=function(n,target=pointer){if(!active())return false;if(n===1)return basicAttack(target);const id=S.p.skillBindings[n-2];return id?castSkill(id,target):false;};
ultimate=function(){return cast(5);};
function castSkill(id,target=pointer){if(!active())return false;const p=S.p,sk=SKILL[id];if(!sk)return false;const why=skillUseReason(id);if(why){if(!keys['2']&&!keys['3']&&!keys['4']&&!keys['5'])log(why);return false;}const {rank,row:r,rt,mana,delay}=skillValues(id);if((p.skillCooldowns[id]||0)>0||p.cd>0)return false;
 const angle=Math.atan2(target.y-p.y,target.x-p.x),nearest=S.enemies.filter(e=>distance(e,target)<100&&lineClear(p,e,1)).sort((a,b)=>distance(a,target)-distance(b,target))[0];let corpse=null,spot={x:target.x,y:target.y};
 if(rt.corpse||rt.kind==='corpse'){corpse=S.corpses.filter(c=>!c.used&&distance(c,target)<110&&distance(c,p)<270&&lineClear(p,c,1)).sort((a,b)=>distance(a,target)-distance(b,target))[0];if(!corpse){log('가까운 사용 가능한 시체가 필요합니다.');return false;}}
 if(['teleport','barrier','trap'].includes(rt.kind)){if(distance(p,target)>350||!walk(target.x,target.y,p.r)){log('범위 안의 빈 바닥을 지정하세요.');return false;}if(rt.kind==='barrier'&&distance(p,target)<40){log('벽은 자신과 떨어진 곳에 설치하세요.');return false;}}
 p.mp-=mana;const usesAttackSpeed=['melee','charge','chargeMove'].includes(rt.kind)||rt.weapon?.includes('bow')||rt.weapon?.includes('javelin');p.cd=(rt.slow?1.4:.42)/(1+(usesAttackSpeed?stats().ias:stats().fcr)/100);p.skillCooldowns[id]=delay;attackAnim(p,angle,.35);const physical=['melee','charge','chargeMove'].includes(rt.kind);let packet=skillPacket(id,physical),boltPacket=rt.bolts?{...packet,physical:0,needsAR:false,noLeech:true,noCrit:true}:null;if(rt.bolts)packet.lightning=0;
 if(rt.kind==='melee'||rt.kind==='charge'||rt.kind==='chargeMove'){
  if(rt.kind==='chargeMove'){const d=distance(p,target)||1;move(p,(target.x-p.x)/d*Math.min(180,d-30),(target.y-p.y)/d*Math.min(180,d-30));}
  let hits=Math.min(7,r.hit_count||rt.hits||1),victims=targetsInCone(p,angle,BASE[p.eq.weapon?.baseId]?.type==='spear'?75:62,2.8).sort((a,b)=>distance(a,target)-distance(b,target));if(rt.shield){const b=BASE[p.eq.offhand.baseId],smite=b.smite||[1,3];packet.physical=rand(...smite)*(1+(stats().strength+(r.damage_percent||0))/100);}
  for(let h=0;h<hits;h++){const living=victims.filter(v=>v.hp>0);if(!living.length)break;const e=living[rt.zeal?h%living.length:0],d=applyPacket(e,packet);if(d>0){if(rt.kind==='charge')p.charges=Math.min(3,(p.charges||0)+1);if(rt.knockback){const dd=distance(p,e)||1;move(e,(e.x-p.x)/dd*32,(e.y-p.y)/dd*32);}if(rt.sacrifice)p.hp=Math.max(1,p.hp-d*(r.damage_to_self_percent||8)/100);if(e.hp>0&&(r.stun_seconds||rt.stun)){e.stun=Math.min(e.type==='boss'?.25:5,r.stun_seconds||rt.stun);e.windup=null;}}}
  if(rt.bolts)for(let i=0;i<Math.min(12,r.charged_bolt_count||3);i++){const magic=boltPacket;emitPacket(p,angle+(i-(r.charged_bolt_count||3)/2)*.18,magic,{kind:'lightning',speed:220});}eventVfx('slash',p.x,p.y,60,rt.element?ELEMENT_COLORS[rt.element]:ELEMENT_COLORS.physical,.3,angle);
 }else if(['projectile','fan'].includes(rt.kind)){
  if(rt.weapon?.includes('bow')&&!packet.physical)packet.physical=rand(stats().minDamage,stats().maxDamage);let count=rt.kind==='fan'?r.projectile_count||r.charged_bolt_count||(id==='sorceress_charged_bolt'?rank+2:3+Math.floor(rank/3)):1;count=Math.min(count,24);for(let i=0;i<count;i++)emitPacket(p,angle+(i-(count-1)/2)*.10,packet,{aoe:rt.aoe||0,pierce:rt.pierce,kind:rt.element||'magic',speed:rt.kind==='fan'?280:360});
 }else if(rt.kind==='target'){if(nearest){applyPacket(nearest,packet);const dd=distance(p,nearest)||1;move(nearest,(nearest.x-p.x)/dd*22,(nearest.y-p.y)/dd*22);}}
 else if(rt.kind==='field'){const d=Math.min(distance(p,target),230),pos={x:p.x+Math.cos(angle)*d,y:p.y+Math.sin(angle)*d},dps=r.fire_damage_per_second?(r.fire_damage_per_second[0]+r.fire_damage_per_second[1])/2*(1+synergyValue(id,'fire_damage_percent')/100):5+rank*4;S.fields.push({id:S.nextId++,...pos,r:rt.element==='lightning'?65:70,element:rt.element||'fire',dps,left:3,tick:0});}
 else if(rt.kind==='curse'||rt.kind==='fear'){for(const e of S.enemies)if(distance(e,p)<260&&lineClear(p,e,1)){if(rt.kind==='fear'&&e.type!=='boss')e.fear=r.enemy_run_seconds||3;else if(rt.curse==='inner')e.innerSight={value:r.defense_reduction||40,left:r.duration_seconds||8};else if(rt.curse==='amplify')e.amplify={left:8+rank*2};}eventVfx('ring',p.x,p.y,180,'#c9c085',.7);}
 else if(rt.kind==='armor'){p.boneArmor=(r.physical_damage_absorb||20)+synergyValue(id,'physical_absorb_flat');eventVfx('ring',p.x,p.y,40,'#dce9e8',.7);}
 else if(rt.kind==='buff'){p.buffs[rt.buff]={rank,left:r.duration_seconds||60};recalcResources();eventVfx('ring',p.x,p.y,45,'#83cfe1',.6);}
 else if(rt.kind==='shape'){p.buffs.shape={id,form:rt.form,left:(r.duration_seconds||40)+(softRank('druid_lycanthropy')?curveRow('druid_lycanthropy').duration_seconds||0:0)};recalcResources();eventVfx('ring',p.x,p.y,48,'#d2b39a',.6);}
 else if(rt.kind==='aura'){p.aura=p.aura===id?null:id;recalcResources();eventVfx('ring',p.x,p.y,100,'#ecd490',.7);}
 else if(rt.kind==='summon'||rt.kind==='trap'){
  if(corpse){corpse.used=true;spot={x:corpse.x,y:corpse.y};}else if(rt.kind==='summon'){spot={x:p.x+Math.cos(angle)*35,y:p.y+Math.sin(angle)*35};if(!walk(spot.x,spot.y,9))spot={x:p.x,y:p.y};}
  const pet=rt.pet||'sentry',max=rt.kind==='trap'?5:['golem','oak'].includes(pet)?1:Math.min(8,1+Math.floor(rank/3)),siblings=S.minions.filter(m=>m.pet===pet);if(siblings.length>=max)S.minions.splice(S.minions.indexOf(siblings[0]),1);
  const master=softRank('necromancer_skeleton_mastery');S.minions.push({id:S.nextId++,pet,skillId:id,...spot,r:9,hp:30+rank*12+master*8,maxHp:30+rank*12+master*8,atk:4+rank*2+master,rank,cd:.3,left:rt.kind==='trap'?35:120,stationary:rt.kind==='trap',shots:10,face:0,path:[],pathTime:0,walkPhase:0,type:rt.kind==='trap'?'caster':'grunt'});recalcResources();}
 else if(rt.kind==='corpse'){corpse.used=true;const damage=corpse.maxHp*(.7+random()*.5);for(const e of [...S.enemies])if(distance(corpse,e)<90+rank*4&&lineClear(corpse,e,1))applyPacket(e,{physical:damage*.5,fire:damage*.5,noCrit:true,noLeech:true});eventVfx('impact',corpse.x,corpse.y,100,'#ff9c71',.6);}
 else if(rt.kind==='barrier'){S.barriers.push({...spot,r:22,left:10+rank*.4,hp:50+rank*10});navVersion++;eventVfx('ring',spot.x,spot.y,22,'#dadacb',.6);}
 else if(rt.kind==='teleport'){p.x=target.x;p.y=target.y;clickGoal=null;p.path=[];reveal();eventVfx('ring',p.x,p.y,35,'#90d7fb',.5);}
 else if(rt.kind==='static'){for(const e of [...S.enemies])if(distance(e,p)<90+rank*8&&lineClear(p,e,1))applyPacket(e,{lightning:Math.max(0,e.hp*.25),noCrit:true,noLeech:true});eventVfx('ring',p.x,p.y,90+rank*8,'#f9eaaa',.5);}
 sound('cast');return true;
}
updateProjectiles=function(dt){for(const s of [...S.shots]){s.life-=dt;let dead=s.life<=0;const n=Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy)*dt/4));for(let k=0;k<n&&!dead;k++){s.x+=s.vx*dt/n;s.y+=s.vy*dt/n;if(!walk(s.x,s.y,s.r)){dead=true;break;}if(s.friendly&&s.packet?.healing){const ally=S.minions.find(m=>distance(m,s)<m.r+s.r);if(ally){ally.hp=Math.min(ally.maxHp,ally.hp+s.packet.healing);eventVfx('ring',ally.x,ally.y,20,'#a8e3cd',.25);dead=true;break;}}const hit=s.friendly?S.enemies.find(e=>e.hp>0&&distance(e,s)<e.r+s.r&&!(s.hitIds||[]).includes(e.id)):distance(S.p,s)<S.p.r+s.r;
 if(hit){if(s.friendly){applyPacket(hit,s.packet||{magic:s.dmg});(s.hitIds??=[]).push(hit.id);if(s.aoe>0)for(const e of [...S.enemies])if(e!==hit&&distance(e,s)<s.aoe+e.r&&lineClear(s,e,1))applyPacket(e,s.packet||{fire:s.dmg});}else damagePlayer(s.dmg,s.element||'magic',{noBlock:true});dead=!s.pierce;}}
 if(dead){const idx=S.shots.indexOf(s);if(idx>=0)S.shots.splice(idx,1);eventVfx('impact',s.x,s.y,s.aoe||12,ELEMENT_COLORS[s.kind]||'#b9a6f8',.2);}}};
const legacyAI=ai;
ai=function(e,dt){if(e.sealed)return;if(e.fear>0){e.fear-=dt;e.windup=null;if(e.fearGoalTime===undefined||e.fearGoalTime<=0){e.fearGoal=tacticalPoint(e,S.p,'retreat');e.fearGoalTime=.7;}e.fearGoalTime-=dt;navigate(e,e.fearGoal,dt,e.speed*1.1);return;}const speed=e.speed;if(e.chill>0)e.speed*=.5;legacyAI(e,dt);e.speed=speed;};
resolveWindup=function(e){const w=e.windup;e.windup=null;if(!w||e.hp<=0)return;attackAnim(e,w.angle,.28);if(w.kind==='melee'){const pet=S.minions.find(m=>distance(e,m)<e.r+m.r+20);if(pet){pet.hp-=e.atk;pet.flash=.1;}else if(distance(e,S.p)<e.r+S.p.r+w.reach&&lineClear(e,S.p,1)){if(random()<attackChance(e.attackRating||50,stats().def,e.level||1,S.p.level))damagePlayer(e.atk);else float(S.p.x,S.p.y,'회피','#b5cbdf');}eventVfx('slash',e.x,e.y,w.reach+20,'#ff9a7b',.22,w.angle);}else if(w.kind==='bolt')fireShot(e,w.angle,190,e.atk,'shadow',false);else for(let k=-1;k<=1;k++)fireShot(e,w.angle+k*.3,180,e.atk*.8,'shadow',false);};
const legacyWalk=walk;
walk=function(x,y,r=10,ignoreGate=false){if(!legacyWalk(x,y,r,ignoreGate))return false;return !(S.barriers||[]).some(b=>b.left>0&&Math.hypot(x-b.x,y-b.y)<r+b.r);};
function updateRestoredSystems(dt){const p=S.p;for(const id of Object.keys(p.skillCooldowns))p.skillCooldowns[id]=Math.max(0,p.skillCooldowns[id]-dt);let dirty=false;for(const k of Object.keys(p.buffs)){p.buffs[k].left-=dt;if(p.buffs[k].left<=0){delete p.buffs[k];dirty=true;}}
 for(const e of [...S.enemies]){for(const k of ['innerSight','amplify'])if(e[k]&&(e[k].left-=dt)<=0)delete e[k];e.chill=Math.max(0,(e.chill||0)-dt);if(e.poison){const tick=Math.min(e.poison.left,dt);e.poison.left-=dt;e.poison.pending=(e.poison.pending||0)+e.poison.dps*tick;e.poison.timer=(e.poison.timer||0)+dt;if(e.poison.timer>=.25||e.poison.left<=0){hurtEnemy(e,e.poison.pending);e.poison.pending=0;e.poison.timer=0;}if(e.poison.left<=0)delete e.poison;}}
 for(const f of S.fields){f.left-=dt;f.tick-=dt;if(f.tick<=0){f.tick=.25;for(const e of [...S.enemies])if(distance(f,e)<f.r&&lineClear(f,e,1))applyPacket(e,{[f.element]:f.dps*.25,noLeech:true,noCrit:true});eventVfx('ring',f.x,f.y,f.r,ELEMENT_COLORS[f.element],.3);}}S.fields=S.fields.filter(f=>f.left>0);
 for(const b of S.barriers)b.left-=dt;const n=S.barriers.length;S.barriers=S.barriers.filter(b=>b.left>0);if(n!==S.barriers.length)navVersion++;
 for(const m of S.minions){m.left-=dt;m.cd=Math.max(0,m.cd-dt);m.flash=Math.max(0,(m.flash||0)-dt);if(m.pet==='oak'){if(distance(m,p)>70)navigate(m,p,dt,150);continue;}const e=S.enemies.filter(e=>e.hp>0&&!e.sealed&&distance(e,m)<300&&lineClear(m,e,1)).sort((a,b)=>distance(a,m)-distance(b,m))[0];if(e&&!atTown()){if(m.stationary){if(m.cd<=0){m.cd=1;emitPacket(m,Math.atan2(e.y-m.y,e.x-m.x),{lightning:4+m.rank*5,noLeech:true,noCrit:true},{kind:'lightning'});m.shots--;if(m.shots<=0)m.left=0;}}else if(distance(m,e)>30)navigate(m,e,dt,160);else if(m.cd<=0){m.cd=.9;attackAnim(m,Math.atan2(e.y-m.y,e.x-m.x));applyPacket(e,{physical:m.atk,noLeech:true,noCrit:true});}}else if(!m.stationary&&distance(m,p)>55){if(distance(m,p)>450){m.x=p.x+20;m.y=p.y;}else navigate(m,p,dt,180);}}
 const old=S.minions.length;S.minions=S.minions.filter(m=>m.hp>0&&m.left>0);if(old!==S.minions.length)dirty=true;
 if(p.aura&&softRank(p.aura)<1){p.aura=null;dirty=true;}if(p.aura&&S.step%60===0){const rank=softRank(p.aura);if(p.aura==='paladin_prayer'&&p.mp>=1){p.mp-=1;p.hp=Math.min(p.maxHp,p.hp+1+rank);}if(p.aura==='paladin_holy_fire')for(const e of [...S.enemies])if(distance(e,p)<150&&lineClear(p,e,1))applyPacket(e,{fire:2+rank*2,noLeech:true,noCrit:true});eventVfx('ring',p.x,p.y,100,'#dbc176',.6);}
 if(dirty)recalcResources();
}
const legacyUpdate=update;
update=function(dt){if(!active())return;legacyUpdate(dt);if(active())updateRestoredSystems(dt);};

function runSpeed(){const base=S.p.slow>0?90:keys.Shift&&!nearThreat()?236:156;const speed=S.p.buffs.speed?curveRow('assassin_burst_of_speed').faster_run_walk_percent||0:0;return base*(1+(speed+(stats().mods.frw||0))/100);}

let selectedTree=null,lastTreeSignature='',selectedBind=2;
const slotLabels={weapon:'주 무기',offhand:'보조 손',armor:'갑옷',helm:'투구',ring:'반지 I',ring2:'반지 II',amulet:'목걸이'};
function currentArea(){return AREA[S.world.areaId];}
function questSummary(){const f=S.world.flags;switch(S.floor){case 1:return f.andariel?'안다리엘 처치 · 마을에서 ACT II 이동':!f.den?'악의 소굴을 정화하면 스킬 +1':'수도원 → 지하묘지 4층 · 안다리엘';case 2:return f.duriel?'두리엘 처치 · ACT III 해금':!f.staff?'함·자루·목걸이를 모아 지팡이 조립':!f.summoner?'비전의 성역 · 소환사 처치':'진짜 무덤 '+S.world.trueTomb+' → 탈 라샤의 방';case 3:return f.mephisto?'메피스토 처치 · ACT IV 해금':!f.orb?'칼림의 유물과 도리깨 → 의지 조립 → 보주':'증오의 억류지 3층 · 메피스토';case 4:return f.diablo?'디아블로 처치 · ACT V 해금':'혼돈의 성역 · 봉인 5개 / 수호자 3명';default:return f.campaignComplete?'보통 난이도 5액트 완료':!f.ancients?'Lv.20 이상 · 아리앗 정상 고대인 도전':!f.baal_waves?'파괴의 왕좌 · 5파 공세':'세계석 보관실 · 바알';}}
refresh=function(){if(!S?.world?.areaId)return;const p=S.p,st=stats(),a=currentArea(),fill=(v,m)=>clamp(v/Math.max(1,m)*100,0,100).toFixed(1)+'%',start=D2DATA.experience[p.level-1].total_experience,end=D2DATA.experience[p.level]?.total_experience||start;
 $('#headline').textContent=`ACT ${a.act} · ${a.label||a.name}`;$('#heroName').textContent=heroLabels[S.hero];$('#level').textContent=p.level;$('#healthText').textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;$('#manaText').textContent=`${Math.ceil(p.mp)} / ${p.maxMp}`;$('#healthFill').style.width=fill(p.hp,p.maxHp);$('#manaFill').style.width=fill(p.mp,p.maxMp);$('#xpFill').style.width=p.level===99?'100%':fill(p.xp-start,end-start);$('#xpText').textContent=`EXP ${Math.floor(p.xp-start).toLocaleString()} / ${(end-start).toLocaleString()}`;$('#gold').textContent=Math.floor(p.gold).toLocaleString()+' G';
 $('#character').innerHTML=`<div><span>무기 피해</span><b>${st.minDamage}–${st.maxDamage}</b></div><div><span>명중률 수치</span><b>${st.ar}</b></div><div><span>방어 / 막기</span><b>${st.def} / ${Math.floor(st.block)}%</b></div><div><span>마법 아이템 발견</span><b>${st.mf}%</b></div><div><span>화염 / 냉기</span><b>${st.resistances.fire} / ${st.resistances.cold}</b></div><div><span>번개 / 독</span><b>${st.resistances.lightning} / ${st.resistances.poison}</b></div>`;
 $('#quest').textContent=questSummary();$('#bounty').textContent=`${Object.keys(S.world.visited).length} / 131 지역 방문 · 순간이동진 ${Object.keys(S.world.waypoints).length} / 39`;
 $('#points').textContent=p.points;$('#statPointCount').textContent=p.statPoints;$('#attributes').innerHTML=Object.entries({strength:'힘',dexterity:'민첩',vitality:'활력',energy:'마력'}).map(([k,v])=>`<div><span>${v}</span><b>${st[k]} <small>기본 ${p.attributes[k]}</small></b><button data-stat="${k}" ${p.statPoints<1?'disabled':''}>＋</button></div>`).join('');
 const trees=D2DATA.trees.filter(t=>t.class_id===S.hero);if(!trees.some(t=>t.id===selectedTree))selectedTree=trees[0].id;const sig=JSON.stringify([S.hero,p.level,p.points,p.skills,Object.values(p.eq).map(i=>i?.id),selectedTree,p.skillBindings,stats().mods]);
 if(sig!==lastTreeSignature){lastTreeSignature=sig;$('#treeTabs').innerHTML=trees.map(t=>`<button data-tree="${t.id}" class="${t.id===selectedTree?'selected':''}">${esc(t.label_ko_editorial)}</button>`).join('');$('#skills').innerHTML=D2DATA.skills.filter(s=>s.tree_id===selectedTree).sort((a,b)=>a.required_character_level-b.required_character_level).map(sk=>{const rank=p.skills[sk.id]||0,soft=softRank(sk.id),reason=skillReason(sk.id),r=sk.runtime,req=(sk.requires||[]).map(k=>SKILL[k]?.label_ko||k).join(' → ');return `<article class="skillNode ${r?'supported':'reference'}"><div><strong>${esc(sk.label_ko)}</strong><span>Lv.${sk.required_character_level} · ${rank}<small>${soft>rank?' +'+(soft-rank):''}</small> / 20</span></div><p>${r?(CURVE[sk.id]?'공개 수치 1–20':'웹 근사 수치')+' · '+r.kind:'참조 목록 · 실행 미복원'}</p>${req?`<small>← ${esc(req)}</small>`:''}<div class="skillActions"><button data-learn="${sk.id}" title="${esc(reason||'직접 투자 +1')}" ${reason?'disabled':''}>＋ 투자</button><button data-skill-info="${sk.id}">수치</button>${r&&r.kind!=='passive'?`<select data-bind="${sk.id}" aria-label="${esc(sk.label_ko)} 단축키" ${soft<1?'disabled':''}><option value="">단축키</option>${[2,3,4,5].map(n=>`<option value="${n}" ${p.skillBindings[n-2]===sk.id?'selected':''}>${n}번</option>`).join('')}</select>`:''}</div></article>`;}).join('');}
 $('#passives').innerHTML='';$('#equipment').innerHTML=Object.entries(p.eq).map(([slot,it])=>`<button class="equip ${it?.rarity||''}" data-off="${slot}" title="${esc(it?itemInfo(it)+' · 클릭 해제':'빈 슬롯')}"><span>${slotLabels[slot]}</span><b>${it?esc((activeEquipment().includes(it)?'':'[미활성] ')+it.symbol+' '+it.name):'—'}</b></button>`).join('');
 $('#inventory').innerHTML=Array.from({length:40},(_,i)=>{const it=p.inv[i];return `<button class="slot ${it?.rarity||''}" data-item="${i}" title="${it?esc(itemInfo(it)+'\n클릭 장착/사용 · 우클릭 데이터/보조 손'):'빈 슬롯'}">${it?`<b>${esc(it.symbol)}</b><span>${esc(it.name)}</span>`:'<i>·</i>'}</button>`;}).join('');$('#bagCount').textContent=p.inv.length+' / 40';$('#craftStats').textContent='원작 제약 / 웹 추첨 가중치';
 $('#log').innerHTML=S.logs.map(t=>`<div>${esc(t)}</div>`).join('');$('#seedDisplay').textContent=S.dungeonSeed;$('#enemyCount').textContent=S.enemies.length;$('#squadCount').textContent=Object.values(S.squads).filter(q=>q.order!=='dormant'&&S.enemies.some(e=>e.squadId===q.id)).length;$('#mode').textContent=renderMode==='3d'?'3D':'2D';$('#pause').textContent=paused?'계속':'일시정지';$('#revive').hidden=!p.dead;$('#storageVersion').textContent='SAVE v28';
 for(let n=1;n<=5;n++){const b=$(`[data-hotbar="${n}"]`),id=n>1?p.skillBindings[n-2]:null,sk=SKILL[id],name=n===1?'기본 공격':sk?.label_ko||'미지정',cd=id?Math.max(p.cd,p.skillCooldowns[id]||0):p.cd;b.querySelector('.skillName').textContent=name;b.querySelector('.skillCd').textContent=cd>.1?cd.toFixed(1)+'s':id?'Lv.'+softRank(id):'';b.classList.toggle('cooling',cd>.1||n>1&&(!id||!softRank(id)));b.title=name+(id?' · 마나 '+skillValues(id).mana.toFixed(1):' · 마나 없음');}
 $('#travel').textContent=S.channel?'귀환 취소':atTown()&&S.world.returnPortal?'Z · 필드 복귀':'Z · 마을 귀환';$('#worldStats').textContent=`${a.label||a.name} · ${a.kind} · 지역별 85×50 / 통로 4타일. 적 Lv.${a.webEncounterLevel}은 웹 조정값입니다.`;$('#dashLabel').textContent=p.dashCd>.1?p.dashCd.toFixed(1)+'s':'회피';$('#hpCount').textContent=p.inv.filter(i=>i.kind==='health').length;$('#mpCount').textContent=p.inv.filter(i=>i.kind==='mana').length;$('#interact').disabled=!interactionTarget()||!active();$('#portal').disabled=!S.director.objects.some(o=>o.kind==='exit'&&distance(o,p)<62);$('#debug').classList.toggle('selected',squadDebug);
};
itemInfo=function(it){if(!it.baseId)return it.name+(it.runeId?' · 요구 Lv.'+it.reqLevel:'');return `${it.name} [${it.rarity}${it.ethereal?' / 무형':''}]\nilvl ${it.ilvl} · qlvl ${it.qlvl} · alvl ${it.alvl}\n요구 Lv.${it.reqLevel} / 힘 ${it.requirements.strength} / 민첩 ${it.requirements.dexterity}${it.damage?'\n무기 피해 '+it.damage.join('–'):''}${it.def?'\n방어 '+it.def:''}\n접사: ${it.affixes.map(a=>a.name).join(', ')||'없음'}\n옵션: ${JSON.stringify(it.mods)}\n소켓 ${it.gems.length}/${it.sockets}\n개별 스킬: ${Object.entries(it.staffmods).map(([id,n])=>(SKILL[id]?.label_ko||id)+' +'+n).join(', ')||'없음'}`;};
function openItemInspector(it){showDialog('생성된 아이템 데이터',`<h3>${esc(it.name)}</h3><pre class="dataView">${esc(itemInfo(it))}</pre><p class="muted">품질 확률·드롭 가중치·일부 옵션 풀은 웹용입니다. 원본 전체 ItemRatio / TreasureClassEx 추출본이 아닙니다.</p>${it.baseId&&S.p.inv.includes(it)?`<button data-inspect-equip="${it.id}">주 슬롯 장착</button> <button data-inspect-off="${it.id}">보조 손 장착</button>`:''}<details><summary>인스턴스 JSON</summary><pre class="dataView">${esc(JSON.stringify(it,null,2))}</pre></details>`);}
function showSkillInfo(id){const s=SKILL[id],c=CURVE[id];showDialog(s.label_ko,`<p>직접 투자 ${S.p.skills[id]||0} / 장비 포함 ${softRank(id)} · 요구 Lv.${s.required_character_level}</p><p>${s.runtime?'행동은 웹 어댑터입니다. '+(c?'공식 표시 수치 1–20레벨을 사용합니다. 20 초과 보너스는 표시하되 효과 수치는 20에 제한합니다.':'이 스킬의 피해/범위/시간은 웹 근사값입니다.'):'현재 참조 전용입니다. 투자/실행을 활성화하지 않았습니다.'}</p><p>선행: ${esc((s.requires||[]).map(k=>SKILL[k]?.label_ko||k).join(', ')|| (s.dependency_status==='not_recovered'?'미복원':'없음'))}</p>${s.runtime?`<pre class="dataView">${esc(JSON.stringify(skillValues(id),null,2))}</pre>`:''}${c?`<details><summary>1–20레벨 복원 수치</summary><pre class="dataView">${esc(JSON.stringify(c.rows,null,2))}</pre></details>`:''}`);}
function openWorldMap(act=S.floor){const w=S.world,a=currentArea(),nearWP=atTown()||S.director.objects.some(o=>o.kind==='waypoint'&&distance(o,S.p)<70),adj=adjacentAreas();showDialog('ACT '+act+' · 지역 연결 / 순간이동진',`<nav class="worldTabs">${[1,2,3,4,5].map(n=>`<button data-world-act="${n}" class="${n===act?'selected':''}">ACT ${n}</button>`).join('')}</nav><p class="muted">실제 지역 이동은 출입구 H/F. 이 창은 인접 지역 경로 안내 및 활성 순간이동진 이동용입니다. 원작 지형 파일은 사용하지 않았습니다.</p>${atTown()?`<div class="actions">${[1,2,3,4,5].filter(n=>n<=w.actUnlocked&&n!==S.floor).map(n=>`<button data-act-travel="${n}">ACT ${n} 마을로 이동</button>`).join('')}</div>`:''}<h3>현재 위치 · ${esc(a.label||a.name)}</h3><div class="adjacent">${adj.map(e=>`<button data-route-exit="${e.id}">${esc(AREA[e.id].label||AREA[e.id].name)}${e.requires&&!w.flags[e.requires]?' 🔒 '+esc(FLAG_LABELS[e.requires]):' →'}</button>`).join('')}</div><div class="regionList">${D2DATA.world.areas.filter(r=>r.act===act).map(r=>`<div class="region ${r.id===w.areaId?'current':''}"><span>${w.visited[r.id]?'✓':'·'} ${esc(r.label||r.name)} <small>${r.kind}</small></span>${r.waypoint?`<button data-waypoint="${r.id}" ${!w.waypoints[r.id]||!nearWP?'disabled':''}>${w.waypoints[r.id]?'◆ 이동':'◇ 미활성'}</button>`:''}</div>`).join('')}</div><p class="muted">탈 라샤 진짜 무덤은 Seed별 1개, 액트 III의 직통 연결은 Seed 변형입니다. 상세 연결은 world.json.</p>`);}
function closeForAction(fn){pauseBeforeDialog=false;$('#modal').close();paused=false;fn();refresh();}
function showQuests(){const f=S.world.flags;showDialog('퀘스트 · 진행 관문',`<p>${esc(questSummary())}</p><p>필수 재료는 퀘스트 플래그로 보관됩니다. 일반 가방이 가득 차도 진행이 막히지 않습니다.</p><div class="actions"><button data-quest-craft="staff">호라드림 지팡이 조립</button><button data-quest-craft="will">칼림의 의지 조립</button></div><div class="regionList">${Object.entries({den:'악의 소굴 (+1 스킬)',inifuss:'이니푸스 나무',cain:'케인 구출',andariel:'안다리엘',cube:'호라드림 함',shaft:'지팡이 자루',amulet:'독사의 목걸이',staff:'호라드림 지팡이',radament:'라다먼트 (+1 스킬)',summoner:'소환사',duriel:'두리엘',eye:'칼림의 눈',brain:'칼림의 뇌',heart:'칼림의 심장',flail:'칼림의 도리깨',will:'칼림의 의지',orb:'보주 파괴',lam_esen:'람 에센 (+5 능력치)',mephisto:'메피스토',izual:'이주얼 (+2 스킬)',diablo:'디아블로',anya:'안야 (+10 모든 저항)',ancients:'고대인',baal_waves:'바알 공세',baal:'바알'}).map(([id,n])=>`<div class="region"><span>${f[id]?'✓':'○'} ${n}</span></div>`).join('')}</div><p class="muted">보통 난이도만 구현. NPC 대사, 모든 27개 퀘스트의 세부 연출/보상은 전체 복원되지 않았습니다.</p>`);}
function showItemLab(){showDialog('아이템 규칙 / 룬 레시피 참조',`<p><b>반영:</b> 베이스 58종, 접사 36종, 일반·마법·희귀 생성, 요구 능력치, 소켓 수, 무형 수치, 장비 스킬.</p><p><b>원작 제약:</b> 마법 접두/접미 1개씩, 희귀 총 2–6개·각 3개 제한·동일 그룹 배제. 실제 이 빌드는 작은 후보 풀 때문에 낮은 레벨에서 희귀 접사가 2개 미만이면 마법/일반으로 강등합니다.</p><p><b>미복원:</b> 전체 드롭 TC 가중치, ItemRatio, 세트/유니크 생성, 모든 룬워드 효과. 기존 창작 강화/각인은 비활성화했습니다. 아래 룬워드는 참조이며 자동 생성 보너스로 적용되지 않습니다.</p><select id="recipePick">${D2DATA.runewords.map(r=>`<option value="${r.id}">${esc(r.name_en)}</option>`).join('')}</select><div id="recipeView"></div><p class="muted">확률 프로필: 장비 희귀 기본 6.5%, 이후 마법 기본 32%; MF를 품질에만 적용. 원작 확률이 아닌 웹 조정값입니다.</p>`);renderRecipe();}
function renderRecipe(){const r=D2DATA.runewords.find(r=>r.id===$('#recipePick').value);$('#recipeView').innerHTML=`<p>${esc(r.ordered_runes.join(' → '))}<br>${esc(r.allowed_item_types.join(', '))} · 정확히 ${r.exact_socket_count}소켓 · 일반 품질</p><pre class="dataView">${esc(JSON.stringify(r.display_modifiers_including_runes||'옵션 전체 미복원',null,2))}</pre>`;}
function openVendor(){if(!atTown()){log('마을에서 이용하세요.');return;}showDialog('마을 장비 상인',`<p class="muted">웹용 재고·가격. 요구 능력치와 장비 기본 수치는 데이터 테이블을 사용합니다.</p><div class="regionList">${D2DATA.bases.filter(b=>b.qlvl<=Math.max(5,S.p.level+4)).map(b=>`<div class="region"><span>${esc(b.name)} <small>${b.type} · 힘${b.strength}/민첩${b.dexterity}</small></span><button data-buy-base="${b.id}">${30+b.qlvl*7}G 구매</button></div>`).join('')}</div>`);}
const oldBind=bindUI;
bindUI=function(){oldBind();$('#worldMap').onclick=()=>openWorldMap();$('#questLog').onclick=showQuests;$('#vendorGear').onclick=openVendor;$('#itemRules').onclick=showItemLab;$('#help').onclick=()=>showDialog('XXVIII 조작 / 원작 복원 범위',`<p>마을 출입구에서 H/F로 필드에 진입하세요. O 지역 지도 · J 퀘스트 · K 스킬/능력치. 순간이동진은 접근 후 H로 활성화합니다.</p><p>WASD 이동 · 클릭 경로 이동/공격 · 1 기본 공격 · 2~5 배정 스킬 · Q/R 물약 · E 줍기 · Z 3초 귀환/복귀 · Shift 비전투 질주 · Space 회피 · Tab 지역 지도 · P 일시정지.</p><p>7직업 210노드를 표시하며 71개만 실행할 수 있습니다. 회색 노드는 참조 전용입니다. 직접 투자 최대20 / 레벨·선행 요구, 장비 보너스, 하드 포인트 시너지를 분리합니다. 기본 공격 및 일반 무기 장착으로 초기 전투가 가능합니다.</p><p>대형맵·실시간 전투·시야·회피·물약·귀환은 기존 웹 프로토타입 규칙이 섞여 있습니다. 원본 클라이언트/엔진/완전한 수치 복제가 아닙니다.</p>`);
 $('#attributes').onclick=e=>{const b=e.target.closest('[data-stat]');if(b)allocateStat(b.dataset.stat);};$('#treeTabs').onclick=e=>{const b=e.target.closest('[data-tree]');if(b){selectedTree=b.dataset.tree;refresh();}};$('#skills').onclick=e=>{const b=e.target.closest('[data-learn]'),i=e.target.closest('[data-skill-info]');if(b)learnSkill(b.dataset.learn);if(i)showSkillInfo(i.dataset.skillInfo);};$('#skills').onchange=e=>{const b=e.target.closest('[data-bind]');if(b&&b.value){assignSkill(b.dataset.bind,+b.value-2);lastTreeSignature='';refresh();}};
 $('#inventory').oncontextmenu=e=>{e.preventDefault();const b=e.target.closest('[data-item]');if(b&&S.p.inv[+b.dataset.item])openItemInspector(S.p.inv[+b.dataset.item]);};
 $('#dialogBody').addEventListener('change',e=>{if(e.target.id==='recipePick')renderRecipe();});$('#dialogBody').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;if(d.worldAct){openWorldMap(+d.worldAct);return;}if(d.waypoint)closeForAction(()=>teleportWaypoint(d.waypoint));if(d.actTravel)closeForAction(()=>travelAct(+d.actTravel));if(d.questCraft)closeForAction(()=>questCraft(d.questCraft));if(d.routeExit)closeForAction(()=>{const o=S.director.objects.find(o=>o.kind==='exit'&&o.target===d.routeExit);if(o){clickGoal={x:o.x,y:o.y};S.p.pathTime=0;mapExpanded=false;log('출입구로 이동 · 도착하면 H');}});if(d.buyBase)closeForAction(()=>{const b=BASE[d.buyBase],price=30+b.qlvl*7;if(!atTown()||S.p.gold<price||S.p.inv.length>=40){log('골드/공간 부족');return;}S.p.gold-=price;S.p.inv.push(generateItem({baseId:b.id,ilvl:Math.max(1,S.p.level),quality:'normal',noSockets:true,noEthereal:true,noStaffmods:true}));log(b.name+' 구매');});if(d.inspectEquip||d.inspectOff)closeForAction(()=>{const i=S.p.inv.findIndex(i=>i.id===(d.inspectEquip||d.inspectOff));if(i>=0)useItem(i,d.inspectOff?'offhand':undefined);});});
 window.addEventListener('keydown',e=>{if(gameInputBlocked(e)||e.repeat)return;const k=gameKey(e);if(k==='o')openWorldMap();if(k==='j')showQuests();if(k==='k')$('[data-tab="skillsTab"]').click();});
 $('#export').onclick=()=>downloadText('dark_descent_xxviii_save.json',encodeSave());$('#importFile').onchange=async e=>{try{const f=e.target.files?.[0];if(f){if(f.size>20e6)throw Error('20MB 제한');restoreSave(await f.text());log('XXVIII JSON 복원 완료');}}catch(err){log('가져오기 거부 · '+err.message);}e.target.value='';};
};

