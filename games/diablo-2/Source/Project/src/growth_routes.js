// Explicit progression contracts: invested points, granted ranks and item stats stay separate.
function assignSkill(id,slot){if(!SKILL[id]?.runtime||SKILL[id].runtime.kind==='passive'||softRank(id)<1||slot<0||slot>3)return false;
 S.p.skillBindings=S.p.skillBindings.map(v=>v===id?null:v);S.p.skillBindings[slot]=id;lastTreeSignature='';return true;}
function previewAttribute(key,amount=1){if(!Object.hasOwn(S.p.attributes,key))return null;const before=stats(),old=S.p.attributes[key];let after;
 try{S.p.attributes[key]=old+amount;after=stats();}finally{S.p.attributes[key]=old;}
 return {amount,before,after};
}
function allocateBatch(key,amount=1){if(!active()||!Object.hasOwn(S.p.attributes,key))return false;amount=Math.min(S.p.statPoints,Math.max(1,Math.floor(amount)));if(!amount)return false;
 S.p.attributes[key]+=amount;S.p.statPoints-=amount;recalcResources();refresh();return true;
}
function respecReason(){if(!atTown())return '마을에서 이용할 수 있습니다.';if(!S.world.flags.den)return '악의 소굴 퀘스트를 먼저 완료하세요.';if(S.world.claims.den_respec)return '보통 난이도 초기화 보상을 이미 사용했습니다.';return '';}
function respecCharacter(){if(!active()||respecReason())return false;
 const p=S.p;p.points+=Object.values(p.skills).reduce((n,v)=>n+v,0);
 for(const k of Object.keys(p.attributes))p.statPoints+=p.attributes[k]-CLASS[S.hero].initial_attributes[k];
 p.attributes=clone27(CLASS[S.hero].initial_attributes);p.skills={};p.buffs={};p.skillCooldowns={};p.skillBindings=[null,null,null,null];p.aura=null;p.charges=0;p.boneArmor=0;S.minions=[];
 S.world.claims.den_respec=true;lastTreeSignature='';recalcResources();p.hp=p.maxHp;p.mp=p.maxMp;log('악의 소굴 보상 사용 · 투자한 스킬·능력치 전부 반환. 요구 능력치 미달 장비는 미활성화됩니다.');refresh();return true;
}
function areaRoute(from,to,{ignoreLocks=false}={}){
 if(!AREA[from]||!AREA[to])return null;const queue=[from],visited=new Set(queue),parents={};
 for(let i=0;i<queue.length;i++){const id=queue[i];if(id===to){const path=[id];for(let p=id;parents[p];){p=parents[p];path.push(p);}return path.reverse();}
  for(const e of adjacentAreas(id)){if(!ignoreLocks&&e.requires&&!S.world.flags[e.requires])continue;if(!visited.has(e.id)){visited.add(e.id);parents[e.id]=id;queue.push(e.id);}}
 }return null;
}
function nextObjective(){const f=S.world.flags,act=S.floor;
 const go=(area,label,action=null)=>({area,label,action});
 if(act===1){if(!f.den)return go('a1_den_of_evil','악의 소굴 정화 · 스킬 +1 / 초기화 해금');if(!f.andariel)return go('a1_catacombs_level_4','지하묘지 4층 · 안다리엘 처치');return go(D2DATA.world.towns[1],'ACT II로 이동','act2');}
 if(act===2){if(!f.cube)return go('a2_halls_of_the_dead_level_3','죽음의 전당 3층 · 호라드림 함');if(!f.shaft)return go('a2_maggot_lair_level_3','구더기 굴 3층 · 지팡이 자루');if(!f.amulet)return go('a2_claw_viper_temple_level_2','발톱 독사 사원 2층 · 목걸이');if(!f.staff)return go(S.world.areaId,'퀘스트 창에서 호라드림 지팡이 조립','staff');if(!f.summoner)return go('a2_arcane_sanctuary','비전의 성역 · 소환사');if(!f.duriel)return go('a2_tal_rasha_s_chamber','진짜 무덤 '+S.world.trueTomb+'번 · 두리엘');return go(D2DATA.world.towns[2],'ACT III로 이동','act3');}
 if(act===3){if(!f.cube)return go(D2DATA.world.towns[3],'ACT II에서 호라드림 함 획득 필요','act2');if(!f.eye)return go('a3_spider_cavern','거미 동굴 · 칼림의 눈');if(!f.brain)return go('a3_flayer_dungeon_level_3','약탈자 소굴 3층 · 칼림의 뇌');if(!f.heart)return go('a3_sewers_level_2','하수도 2층 · 칼림의 심장');if(!f.flail)return go('a3_travincal','트라빈칼 의회원 · 칼림의 도리깨');if(!f.will)return go(S.world.areaId,'퀘스트 창에서 칼림의 의지 조립','will');if(!f.orb)return go('a3_travincal','칼림의 의지로 유혹의 보주 파괴');if(!f.mephisto)return go('a3_durance_of_hate_level_3','증오의 억류지 3층 · 메피스토');return go(D2DATA.world.towns[3],'ACT IV로 이동','act4');}
 if(act===4){if(!f.diablo)return go('a4_chaos_sanctuary','혼돈의 성역 · 봉인 5개와 수호자');return go(D2DATA.world.towns[4],'ACT V로 이동','act5');}
 if(!f.ancients)return go('a5_arreat_summit','Lv.20 이상 · 아리앗 정상 고대인');if(!f.baal_waves)return go('a5_throne_of_destruction','파괴의 왕좌 · 5파 공세');if(!f.baal)return go('a5_worldstone_chamber','세계석 보관실 · 바알');return go(S.world.areaId,'보통 난이도 완료 · 탐험과 파밍 계속');
}
function goalState(){const o=S.trackedGoal&&AREA[S.trackedGoal]?{area:S.trackedGoal,label:AREA[S.trackedGoal].label||AREA[S.trackedGoal].name}:nextObjective();return {...o,path:areaRoute(S.world.areaId,o.area)};}
function routeToObjective(){if(!active())return false;const goal=goalState();
 if(goal.action==='staff'||goal.action==='will'){showQuests();return true;}
 if(goal.action?.startsWith('act')&&atTown())return travelAct(Number(goal.action.slice(3)));
 if(goal.path?.length>1){const o=S.director.objects.find(o=>o.kind==='exit'&&o.target===goal.path[1]);if(!o)return false;clickGoal={x:o.x,y:o.y};attackTarget=null;S.p.pathTime=0;mapExpanded=false;log('다음 출입구: '+(AREA[o.target].label||AREA[o.target].name)+' · 도착 후 H');return true;}
 if(goal.path?.length===1){const o=S.director.objects.find(o=>o.kind==='quest'&&!o.used)||S.director.objects.find(o=>o.kind==='seal'&&!o.used);
  if(o){clickGoal={x:o.x,y:o.y};S.p.pathTime=0;log(o.label+' 위치로 이동');return true;}
  log(goal.label+' · 현재 지역에서 탐험/전투하세요.');return true;
 }
 log('현재 진행 조건으로 연결되는 경로가 없습니다. 퀘스트 관문과 액트 이동을 확인하세요.');return false;
}
function trackArea(id){if(!AREA[id])return false;S.trackedGoal=id;refresh();return true;}
// Use region IDs rather than random colors: visual topology is an independent procedural adapter.
function environmentAt(x,y){const a=AREA[S.world.areaId],id=S.dungeonSeed>>>0;
 const v=(Math.imul(x+11,73856093)^Math.imul(y+17,19349663)^id)>>>0;
 return {field:a.kind==='field',town:a.kind==='town',act:a.act,variation:v%101,road:S.rooms.some(r=>Math.abs(x-r.c.x)<=1||Math.abs(y-r.c.y)<=1)};
}
// Human-visible progression status is kept current when transitioning or restoring an area.
const enter26=enterArea;
enterArea=function(id,opts={}){const result=enter26(id,opts);if(S.trackedGoal===id)S.trackedGoal=null;return result;};
