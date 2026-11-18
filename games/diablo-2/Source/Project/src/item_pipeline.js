// XXVII: sockets are item-owned ordered IDs, never a second shared currency.
// Published runeword totals include their rune properties. Do NOT add them twice.
const RUNE = Object.fromEntries(D2DATA.runes.map(r=>[r.id,r]));
const RUNTIME_WORDS = new Set(['ancient_s_pledge','leaf','lore','rhyme','smoke','stealth','steel','strength']);
const PROPERTY_MAP = {
 attack_rating:'ar',defense:'flatDefense',target_defense_percent:'targetDefense',mana_after_kill:'manaAfterKill',
 mana_regeneration_percent:'manaRegen',minimum_damage:'minDamage',maximum_damage:'maxDamage',
 fire_resistance_percent:'fireRes',cold_resistance_percent:'coldRes',lightning_resistance_percent:'lightningRes',poison_resistance_percent:'poisonRes',
 all_resistances_percent:'resist',life_leech_percent:'leech',mana_leech_percent:'manaLeech',
 physical_damage_reduction_flat:'drFlat',magic_damage_reduction_flat:'mdr',physical_damage_reduction_percent:'drPercent',
 increased_attack_speed_percent:'ias',faster_cast_rate_percent:'fcr',faster_run_walk_percent:'frw',
 vitality:'vitality',energy:'energy',dexterity:'dexterity',strength:'strength',
 enhanced_defense_percent:'edef',enhanced_damage_percent:'ed',magic_find_percent:'mf',extra_gold_percent:'goldFind',
 increased_chance_of_blocking_percent:'block',attack_rating_percent:'arPercent',
 maximum_fire_resistance_percent:'maxFireRes',maximum_cold_resistance_percent:'maxColdRes',maximum_lightning_resistance_percent:'maxLightningRes',maximum_poison_resistance_percent:'maxPoisonRes',
 maximum_mana_percent:'maxManaPercent',maximum_life_percent:'maxLifePercent',mana:'mana',life:'life',
 deadly_strike_percent:'deadlyStrike',all_skills:'allSkills',fire_skills:'fireSkills',defense_per_character_level:'defensePerLevel',
 damage_taken_to_mana_percent:'damageToMana',cannot_be_frozen:'cannotBeFrozen',requirements_percent:'requirementsPercent',
 knockback:'knockback',replenish_life:'replenishLife',damage_vs_undead_percent:'damageUndead',attack_rating_vs_undead:'arUndead',
 crushing_blow_percent:'crushingBlow',open_wounds_chance_percent:'openWounds'
};
// Effects below remain inspectable evidence rather than pretending to work.
const DEFERRED_EFFECTS = new Set(['light_radius','stamina_drain_percent','maximum_stamina','defense_vs_missiles','attacker_takes_damage','faster_hit_recovery_percent','faster_block_rate_percent','hit_causes_flee_percent','damage_vs_demons_percent','attack_rating_vs_demons','prevent_monster_heal','ignore_target_defense','hit_blinds_target','freezes_target','indestructible','charged_skill']);
function clone27(v){return JSON.parse(JSON.stringify(v));}
function addMod27(o,k,v){o[k]=(o[k]||0)+Number(v);}
function itemTypeMatches(b,type){
 if(type==='body_armor')return b.slot==='armor';
 if(type==='weapon')return b.slot==='weapon';
 if(type==='melee_weapon')return b.slot==='weapon'&&!['bow','crossbow','orb'].includes(b.type);
 if(type==='missile_weapon')return ['bow','crossbow'].includes(b.type);
 if(type==='paladin_shield')return b.type==='shield'&&b.classOnly==='paladin';
 return b.type===type;
}
function runeWordMatch(it,sequence=it.gems){
 const b=BASE[it.baseId];if(!b||it.rarity!=='normal'||!Array.isArray(sequence)||it.sockets!==sequence.length)return null;
 return D2DATA.runewords.find(r=>r.exact_socket_count===it.sockets&&r.allowed_item_types.some(t=>itemTypeMatches(b,t))&&r.ordered_runes.every((id,i)=>id===sequence[i]))||null;
}
function propertyEffects(props,profileVersion=VERSION){
 const mods={},grants={},deferred=[];
 for(const p of props){
  if(profileVersion<28&&['crushing_blow_percent','open_wounds_chance_percent'].includes(p.stat))deferred.push(clone27(p));
  else if(PROPERTY_MAP[p.stat])addMod27(mods,PROPERTY_MAP[p.stat],p.value);
  else if(['fire_damage','cold_damage','lightning_damage'].includes(p.stat)){
   const e=p.stat.split('_')[0];addMod27(mods,e+'Min',p.minimum);addMod27(mods,e+'Max',p.maximum);
   if(e==='cold')mods.coldDuration=Math.max(mods.coldDuration||0,p.duration_seconds||3);
  }else if(p.stat==='poison_damage_total'){
   addMod27(mods,'poisonTotal',p.value);mods.poisonDuration=Math.max(mods.poisonDuration||0,p.duration_seconds||5);
  }else if(p.stat==='class_skill_bonus'&&p.skill_id){addMod27(grants,p.skill_id,p.value);}
  else deferred.push(clone27(p));
 }
 return {mods,grants,deferred};
}
function socketOrigin(it){
 if(it.socketOrigin)return it.socketOrigin;
 const b=BASE[it.baseId],factor=it.ethereal?1.5:1;
 return {name:it.name,mods:clone27(it.mods),staffmods:clone27(it.staffmods),reqLevel:it.reqLevel,requirements:clone27(it.requirements),
  rawDamage:b.damage?.map(v=>Math.floor(v*factor))||null,
  rawDefense:b.defense?((it.mods.edef||0)>0?Math.floor((b.defense[1]+1)*factor):it.def):0,
  damage:clone27(it.damage),def:it.def};
}
function recomputeSockets(it,profileVersion=VERSION){
 if(!it.socketOrigin)return it;
 const origin=it.socketOrigin,b=BASE[it.baseId],word=runeWordMatch(it),live=word&&RUNTIME_WORDS.has(word.id);
 const kind=b.slot==='weapon'?'weapon':b.type==='shield'?'shield':'armor_helm';
 // Published totals replace rune contributions, not the underlying base/staffmods.
 const properties=live?word.display_modifiers_including_runes:it.gems.flatMap(id=>RUNE[id].socket_effects[kind]);
 const e=propertyEffects(properties,profileVersion);it.mods=clone27(origin.mods);for(const[k,v]of Object.entries(e.mods))addMod27(it.mods,k,v);
 it.staffmods=clone27(origin.staffmods);it.runewordSkills=e.grants;
 it.runewordId=live?word.id:null;it.referenceWordId=word&&!live?word.id:null;it.deferredEffects=e.deferred;
 it.name=live?word.name_en+' · '+b.name:origin.name;
 it.reqLevel=Math.max(origin.reqLevel,...it.gems.map(id=>RUNE[id].required_level||0));
 const reqScale=1+(it.mods.requirementsPercent||0)/100;
 it.requirements={strength:Math.max(0,Math.floor(origin.requirements.strength*reqScale)),dexterity:Math.max(0,Math.floor(origin.requirements.dexterity*reqScale))};
 if(origin.rawDamage){const ed=1+(it.mods.ed||0)/100;it.damage=[Math.floor(origin.rawDamage[0]*ed)+(it.mods.minDamage||0),Math.floor(origin.rawDamage[1]*ed)+(it.mods.maxDamage||0)];it.damage[1]=Math.max(it.damage[0],it.damage[1]);it.atk=Math.round((it.damage[0]+it.damage[1])/2);}
 if(b.defense)it.def=Math.floor(origin.rawDefense*(1+(it.mods.edef||0)/100))+(it.mods.flatDefense||0);
 return it;
}
function ownedItem(id){return [...S.p.inv,...Object.values(S.p.eq).filter(Boolean)].find(i=>i.id===id);}
function socketPreview(itemId,runeId){
 const it=ownedItem(itemId),r=RUNE[runeId];
 if(!it?.baseId||!r)return {ok:false,reason:'장비 또는 룬을 선택하세요.'};
 if(!it.sockets||it.gems.length>=it.sockets)return {ok:false,reason:'빈 소켓이 없습니다.'};
 if(!S.p.inv.some(i=>i.runeId===runeId))return {ok:false,reason:'해당 룬이 가방에 없습니다.'};
 const next=clone27(it);next.socketOrigin=clone27(socketOrigin(it));next.gems.push(runeId);recomputeSockets(next);
 return {ok:true,item:next,word:runeWordMatch(next),reason:next.referenceWordId?'레시피는 일치하지만 총옵션 미지원입니다. 개별 룬 효과만 적용됩니다.':next.deferredEffects.length?'일부 원작 효과는 참조 전용입니다. 미지원 목록을 확인하세요.':''};
}
function insertRune(itemId,runeId){
 if(!active()||!atTown())return false;const preview=socketPreview(itemId,runeId);if(!preview.ok){log(preview.reason);return false;}
 const it=ownedItem(itemId),index=S.p.inv.findIndex(i=>i.runeId===runeId);if(!it||index<0)return false;
 S.p.inv.splice(index,1);Object.assign(it,preview.item);recalcResources();lastTreeSignature='';log((it.runewordId?'룬워드 완성 · ':'룬 삽입 · ')+it.name+' ['+it.gems.join(' → ')+']');refresh();return true;
}
function stashItem(id,take=false){
 if(!active()||!atTown())return false;S.stash??=[];
 const from=take?S.stash:S.p.inv,to=take?S.p.inv:S.stash,cap=take?40:80,index=from.findIndex(i=>i.id===id);
 if(index<0||to.length>=cap){log('아이템 또는 빈 공간을 확인하세요.');return false;}
 to.push(from.splice(index,1)[0]);refresh();return true;
}
function sellItem(id){
 if(!active()||!atTown())return false;const index=S.p.inv.findIndex(i=>i.id===id);if(index<0)return false;
 const it=S.p.inv.splice(index,1)[0];S.p.gold+=it.value;log(it.name+' 판매 · '+it.value+'G');refresh();return true;
}
// Deterministic, local shop supply; deliberately not a claim about D2 vendor probabilities.
function socketStock(){const plans=[['short_sword',2],['quilted_armor',2],['short_staff',2],['cap',2],['large_shield',3],['small_shield',2]];return plans.map(([baseId,sockets])=>({baseId,sockets,price:120+BASE[baseId].qlvl*10}));}
function buySocketBase(baseId){
 if(!active()||!atTown())return false;const stock=socketStock().find(v=>v.baseId===baseId);if(!stock||S.p.gold<stock.price||S.p.inv.length>=40)return false;
 const it=generateItem({baseId,ilvl:Math.max(BASE[baseId].qlvl,Math.min(99,S.p.level)),quality:'normal',noSockets:true,noEthereal:true,noStaffmods:true});it.sockets=stock.sockets;S.p.gold-=stock.price;S.p.inv.push(it);log('소켓 베이스 구매 · '+it.name);refresh();return true;
}
const stats26=stats;
stats=function(){
 const st=stats26(),m=st.mods;if(!S.p.running)st.def+=Math.floor((m.defensePerLevel||0)*S.p.level);
 st.ar=Math.floor(st.ar*(1+(m.arPercent||0)/100));st.crit=1-(1-st.crit)*(1-clamp((m.deadlyStrike||0)/100,0,1));
 for(const e of ['fire','cold','lightning','poison']){const key='max'+e[0].toUpperCase()+e.slice(1)+'Res';st.resistances[e]=clamp((m[e+'Res']||0)+(m.resist||0)+(S.world.flags.anya?10:0),-100,Math.min(95,75+(m[key]||0)));}
 st.resist=Math.min(...Object.values(st.resistances));st.life=Math.max(1,Math.floor(st.life*(1+(m.maxLifePercent||0)/100)));st.mana=Math.max(1,Math.floor(st.mana*(1+(m.maxManaPercent||0)/100)));return st;
};
softRank=function(id){const sk=SKILL[id];if(!sk||sk.class_id!==S.hero)return 0;let invested=S.p.skills[id]||0,specific=0,bonus=0;
 for(const it of activeEquipment()){specific+=(it.staffmods?.[id]||0)+(it.runewordSkills?.[id]||0);bonus+=(it.mods.allSkills||0)+(it.mods[S.hero+'Skills']||0);if(sk.tree_id.includes('fire')||sk.runtime?.element==='fire'){bonus+=(it.mods.fireSkills||0)+(S.hero==='sorceress'?it.mods.sorceressFireSkills||0:0);}}
 return invested+specific>0?invested+specific+bonus:0;
};
const packet26=applyPacket;
applyPacket=function(e,packet){
 if(!e||e.hp<=0||e.sealed)return 0;const q={...packet},st=stats(),m=st.mods,original=e.defense;
 if(q.weaponHit){
  for(const element of ['fire','cold','lightning'])if(m[element+'Max'])q[element]=(q[element]||0)+rand(m[element+'Min']||0,m[element+'Max']);
  if(m.poisonTotal){q.poison=(q.poison||0)+m.poisonTotal;q.poisonDuration=Math.max(q.poisonDuration||0,m.poisonDuration||5);}
  if(m.coldDuration)q.coldDuration=Math.max(q.coldDuration||0,m.coldDuration);
  if(e.undead){q.physical=(q.physical||0)*(1+(m.damageUndead||0)/100);q.attackRating=(q.attackRating||0)+(m.arUndead||0);}
  // Existing prototype uses a shared on-hit packet. These effects are marked web adapters.
  e.defense=Math.max(0,original*(1+(m.targetDefense||0)/100));
 }
 let actual=0;try{actual=packet26(e,q);}finally{e.defense=original;}
 if(actual>0&&q.weaponHit){const total=['physical','fire','cold','lightning','magic'].reduce((n,k)=>n+(q[k]||0),0);if(!q.noLeech)S.p.mp=Math.min(S.p.maxMp,S.p.mp+actual*Math.min(1,(q.physical||0)/Math.max(1,total))*(m.manaLeech||0)/100);
  if(e.hp>0&&m.knockback&&e.type!=='boss'){const d=distance(S.p,e)||1;move(e,(e.x-S.p.x)/d*25,(e.y-S.p.y)/d*25);}}
 return actual;
};
const damage26=damagePlayer;
damagePlayer=function(raw,element='physical',opts={}){const p=S.p,st=stats(),m=st.mods;
 if(element==='physical')raw=Math.max(0,raw-(m.drFlat||0))*(1-clamp(m.drPercent||0,0,50)/100);
 else if(element!=='poison')raw=Math.max(0,raw-(m.mdr||0));
 const damage=damage26(raw,element,opts);if(damage>0)p.mp=Math.min(p.maxMp,p.mp+damage*(m.damageToMana||0)/100);return damage;
};
const kill26=kill;
kill=function(e){if(!S.enemies.includes(e))return;const st=stats(),before=S.p.gold;kill26(e);S.p.mp=Math.min(S.p.maxMp,S.p.mp+(st.mods.manaAfterKill||0));S.p.gold+=Math.floor((S.p.gold-before)*(st.mods.goldFind||0)/100);
 if(e.questFlag==='countess'&&!e.summoned){const n=rand(1,3);for(let i=0;i<n;i++)S.drops.push({x:e.x+i*9,y:e.y,item:rollRune27(Math.max(10,e.level),true)});log('백작 룬 보상 · 웹용 추첨표');}
};
function rollRune27(level,countess=false){const cap=countess?9:Math.min(20,Math.max(3,Math.floor(level/2)+2)),weights=Array.from({length:cap+1},(_,i)=>Math.max(1,Math.round(100*Math.pow(.76,i))));let p=random()*weights.reduce((a,b)=>a+b,0),index=0;for(;index<cap;index++){p-=weights[index];if(p<0)break;}return makeRune(D2DATA.runes[index].id);}
lootRoll=function(e){const ilvl=e.level||1,ref=pickTreasureRef(e.type==='boss'?D2DATA.loot.bossRoot:D2DATA.loot.root);if(ref==='NoDrop')return null;if(ref==='health'||ref==='mana')return makeItem(ref);if(ref==='runes')return rollRune27(ilvl);return generateItem({ilvl,quality:ref==='rare_equipment'?'rare':undefined});};
const updateRestored26=updateRestoredSystems;
updateRestoredSystems=function(dt){updateRestored26(dt);const m=stats().mods;if(m.cannotBeFrozen)S.p.slow=0;if(m.replenishLife)S.p.hp=Math.min(S.p.maxHp,S.p.hp+dt*m.replenishLife*25/256);};
// Snapshot validation happens before state assignment. Rejected imports never alter the live game.
const validate26=validateState;
validateState=function(s){validate26(s);assertSave(!s.stash||Array.isArray(s.stash)&&s.stash.length<=80,'창고 크기 오류');
 const items=[...s.p.inv,...Object.values(s.p.eq).filter(Boolean),...(s.stash||[])];for(const a of [s,...Object.values(s.world.states)])items.push(...a.drops.map(d=>d.item));
 let maxId=0;for(const it of items){const n=Number(it.id.split('-').at(-1));if(Number.isFinite(n))maxId=Math.max(maxId,n);if(!it.baseId)continue;
  assertSave(it.gems.every(id=>!!RUNE[id]),'소켓 룬 ID 오류');if(!it.gems.length){assertSave(!it.runewordId,'빈 소켓 룬워드 오류');continue;}
  assertSave(it.socketOrigin&&typeof it.socketOrigin.name==='string'&&it.socketOrigin.mods&&it.socketOrigin.requirements,'소켓 원본 스냅샷 없음');
  const rebuilt=recomputeSockets(clone27(it),s.version);for(const k of ['mods','damage','def','reqLevel','requirements','runewordId','runewordSkills'])assertSave(JSON.stringify(rebuilt[k])===JSON.stringify(it[k]),'소켓 계산 불일치: '+k);
 }
 assertSave(Number.isInteger(s.nextId)&&s.nextId>maxId,'다음 아이템 ID 충돌');return true;
};
const decode26=decodeSave;
decodeSave=function(input){
 const s=decode26(input),oldVersion=s.version;s.stash??=[];s.trackedGoal??=null;
 // decode26 validates the original serialized values with their original profile first.
 // Only already-valid older states may gain newly implemented socket modifiers.
 if(oldVersion<28){
  const items=[...s.p.inv,...Object.values(s.p.eq).filter(Boolean),...s.stash];
  for(const area of [s,...Object.values(s.world.states)])items.push(...area.drops.map(d=>d.item));
  for(const it of items)if(it.baseId&&it.socketOrigin&&it.gems.length)recomputeSockets(it,28);
  // Older idle pets counted their elapsed cooldown below zero. Preserve their
  // readiness while converting that valid legacy representation to v28.
  s.minions=s.minions.filter(minion=>minion.hp>0&&minion.left>0);
  for(const minion of s.minions)minion.cd=Math.max(0,minion.cd);
 }
 s.version=VERSION;validateState(s);return s;
};
const create26=create;
create=function(hero,seed){create26(hero,seed);S.stash=[];S.trackedGoal=null;};
