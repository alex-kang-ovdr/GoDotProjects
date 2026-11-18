// XXVIII: reject malformed persistent combat data before assigning the live state.
// v26/v27 socket records are checked by their original profile in item_pipeline.js.
const validateCombatBase28 = validateState;
function validateCombatState28(s) {
 const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
 const number = (v, min=0, max=1e8) => Number.isFinite(v) && v >= min && v <= max;
 const integer = (v, min=0, max=1e8) => Number.isInteger(v) && number(v,min,max);
 const timer = (v, max=86400) => number(v,0,max);
 const check = (ok, name) => assertSave(ok, '전투 저장 데이터 오류: '+name);
 const p = s.p;
 check(object(p.buffs), '버프 목록');
 const buffSkills = {speed:'assassin_burst_of_speed',shout:'barbarian_shout',orders:'barbarian_battle_orders',frozenarmor:'sorceress_frozen_armor'};
 for (const [key,b] of Object.entries(p.buffs)) {
  check(object(b) && number(b.left,Number.EPSILON,86400), '버프 시간 '+key);
  if (key==='shape') {
   check(['druid_werewolf','druid_werebear'].includes(b.id) && s.hero==='druid', '변신 스킬');
   check(SKILL[b.id]?.runtime.form===b.form, '변신 종류');
  } else {
   check(!!buffSkills[key] && SKILL[buffSkills[key]].class_id===s.hero, '버프 종류 '+key);
   check(integer(b.rank,1,100), '버프 레벨 '+key);
  }
 }
 check(object(p.skillCooldowns), '재사용 시간 목록');
 for (const [id,t] of Object.entries(p.skillCooldowns)) {
  check(SKILL[id]?.class_id===s.hero && !!SKILL[id].runtime && timer(t), '재사용 시간 '+id);
 }
 for (const key of ['cd','dashCd','globalCd','ultimateCd','guard','slow','invuln','attackAnim','flash']) {
  check(timer(p[key]), '플레이어 '+key);
 }
 if (p.boneArmor!==undefined) check(number(p.boneArmor), '뼈 갑옷');
 if (p.charges!==undefined) check(integer(p.charges,0,3), '충전 단계');
 if (p.aura!==undefined && p.aura!==null) check(SKILL[p.aura]?.runtime.kind==='aura' && SKILL[p.aura].class_id===s.hero, '오라');
 check(typeof p.dead==='boolean', '생존 상태');
 check(number(p.hp,0,p.maxHp) && number(p.mp,0,p.maxMp), '현재 자원');
 if (s.trackedGoal!==undefined && s.trackedGoal!==null) check(!!AREA[s.trackedGoal], '추적 지역');
 for (const area of [s,...Object.values(s.world.states)]) for (const e of area.enemies) {
  for (const key of ['atk','speed','defense','attackRating']) if (e[key]!==undefined) check(number(e[key]), '적 '+key);
  if (e.level!==undefined) check(integer(e.level,1,200), '적 레벨');
  if (e.resists!==undefined) {
   check(object(e.resists), '적 저항');
   for (const [element,res] of Object.entries(e.resists)) check(Object.hasOwn(ELEMENT_COLORS,element) && number(res,-100,100), '적 속성 저항');
  }
  if (e.chill!==undefined) check(timer(e.chill), '냉기 지속 시간');
  if (e.drainEffectiveness!==undefined) check(number(e.drainEffectiveness,0,100), '흡수 효율');
  for (const key of ['poison','openWounds']) if (e[key]!==undefined) {
   const d=e[key];check(object(d), key+' 상태');
   check(number(d.dps,0,1e6) && number(d.left,Number.EPSILON,key==='openWounds'?8.000001:86400), key+' 피해/시간');
   if (d.pending!==undefined) check(number(d.pending,0,1e8), key+' 누적 피해');
   if (d.timer!==undefined) check(timer(d.timer,1), key+' 틱 시간');
   if (key==='openWounds') check(integer(d.sourceLevel,1,99), '상처 악화 시전자 레벨');
  }
  for (const key of ['amplify','innerSight']) if(e[key]!==undefined) {
   const b=e[key];check(object(b) && number(b.left,Number.EPSILON,86400), key+' 시간');
   if(key==='innerSight')check(number(b.value), '내면의 시야 감소량');
  }
 }
 if (s.minions!==undefined) {
  check(Array.isArray(s.minions) && s.minions.length<=30, '소환수 목록');
  for (const m of s.minions) {
   check(SKILL[m.skillId]?.class_id===s.hero && !!SKILL[m.skillId].runtime, '소환수 스킬');
   for (const key of ['x','y','maxHp','atk','rank']) check(number(m[key]), '소환수 '+key);
   check(number(m.hp,s.version<28?-1e8:Number.EPSILON) && number(m.left,s.version<28?-86400:Number.EPSILON), '소환수 생존/남은 시간');
   check(number(m.x,0,NX*T) && number(m.y,0,NY*T) && m.maxHp>0, '소환수 범위');
   check(number(m.cd,s.version<28?-86400:0,86400), '소환수 재사용 시간');
  }
 }
 return true;
}
validateState=function(s) { validateCombatBase28(s); return validateCombatState28(s); };

const exportBeforeCombat28=exportState;
exportState=function(){
 const state=exportBeforeCombat28();
 // An autosave or player death can happen before the next pet cleanup tick.
 // Persist only surviving pets without mutating the live simulation.
 state.minions=(state.minions||[]).filter(m=>m.hp>0&&m.left>0);
 return state;
};
