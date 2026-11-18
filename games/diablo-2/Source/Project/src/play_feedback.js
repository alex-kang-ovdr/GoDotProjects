// Player-facing combat feedback. Readouts never roll RNG or mutate combat state.
const ELEMENT_NAMES28={physical:'물리',fire:'화염',cold:'냉기',lightning:'번개',poison:'독',magic:'마법'};
Object.assign(STAT_LABELS27,{crushingBlow:'강타 확률 %',openWounds:'상처 악화 확률 %',manaLeech:'마나 흡수 %',replenishLife:'생명 회복',coldDuration:'냉기 지속 초',deadlyStrike:'치명적 공격 확률 %'});
function manaRegenPerSecond28(maxMana,bonusPercent=0) {
 return 25*Math.floor(Math.floor(256*Math.max(0,maxMana)/3000)*(100+Math.max(0,bonusPercent))/100)/256;
}
const statsBeforeRegen28=stats;
stats=function(){
 const st=statsBeforeRegen28(),warmth=softRank('sorceress_warmth')?curveRow('sorceress_warmth').mana_regeneration_percent||0:0;
 st.regen=manaRegenPerSecond28(st.mana,warmth+(st.mods.manaRegen||0));
 return st;
};
function combatTarget28() {
 if(!S||atTown())return null;
 const candidates=S.enemies.filter(e=>e.hp>0&&!e.sealed&&visible(e));
 const selected=candidates.find(e=>e.id===attackTarget);
 return selected||candidates.filter(e=>distance(e,S.p)<290).sort((a,b)=>distance(a,S.p)-distance(b,S.p))[0]||null;
}
function combatTargetSummary28(e=combatTarget28()) {
 if(!e)return null;
 const names={grunt:'파수꾼',caster:'원소 술사',elite:'정예 수호자',boss:'지역 수호자'};
 const mods={frost:'냉기',vampiric:'흡혈',volatile:'폭발',armored:'중갑',swift:'신속'};
 const status=[];
 if(e.openWounds?.left>0)status.push({label:'출혈',seconds:e.openWounds.left,color:'#ed9393'});
 if(e.poison?.left>0&&e.poison.dps>0)status.push({label:'중독',seconds:e.poison.left,color:ELEMENT_COLORS.poison});
 if(e.chill>0)status.push({label:'둔화',seconds:e.chill,color:ELEMENT_COLORS.cold});
 if(e.stun>0)status.push({label:'기절',seconds:e.stun,color:'#edd39a'});
 if(e.amplify?.left>0)status.push({label:'피해 증폭',seconds:e.amplify.left,color:'#cab7ec'});
 return {id:e.id,name:e.bossName||[mods[e.modifier],names[e.type]].filter(Boolean).join(' '),hp:e.hp,maxHp:e.maxHp,level:e.level||1,
  profile:encounterProfile28(e),attackElement:['boss','caster'].includes(e.type)?encounterProfile28(e).shotElement:'physical',statuses:status,resists:Object.fromEntries(Object.keys(ELEMENT_NAMES28).map(k=>[k,e.resists?.[k]||0]))};
}
function combatReadout28(){
 const st=stats(),m=st.mods;
 const effects=[];
 if(m.crushingBlow)effects.push('강타 '+Math.min(100,m.crushingBlow)+'%');
 if(m.openWounds)effects.push('상처 악화 '+Math.min(100,m.openWounds)+'%');
 if(st.leech)effects.push('생명 흡수 '+Math.round(st.leech*100)+'%');
 if(m.manaLeech)effects.push('마나 흡수 '+m.manaLeech+'%');
 for(const k of ['fire','cold','lightning'])if(m[k+'Max'])effects.push(ELEMENT_NAMES28[k]+' '+(m[k+'Min']||0)+'–'+m[k+'Max']);
 if(m.poisonTotal)effects.push('독 '+m.poisonTotal+' / '+(m.poisonDuration||5)+'초');
 return {effects,manaRegen:st.regen,target:combatTargetSummary28()};
}
function refreshCombatReadout28(){
 if(!S)return;const read=combatReadout28(),target=read.target;
 const targetNode=$('#combatTarget'),effectsNode=$('#combatEffects');if(!targetNode||!effectsNode)return;
 targetNode.innerHTML=target?`<div class="targetHeading"><b>${esc(target.name)}</b><span>Lv.${target.level} · ${Math.ceil(target.hp)} / ${Math.ceil(target.maxHp)}</span></div><div class="targetLife"><span style="width:${clamp(target.hp/target.maxHp*100,0,100)}%"></span></div><div class="combatTags">${target.profile?.shotElement?`<span style="color:${ELEMENT_COLORS[target.attackElement]||'#d4dcdd'}">${ELEMENT_NAMES28[target.attackElement]} 공격</span>`:''}${Object.entries(target.resists).filter(([,v])=>v!==0).map(([k,v])=>`<span>${ELEMENT_NAMES28[k]} 저항 ${v}%</span>`).join('')}${target.statuses.map(s=>`<span style="color:${s.color}">${s.label} ${s.seconds.toFixed(1)}초</span>`).join('')}</div>`:`<div class="targetHeading"><b>${atTown()?'탐험 준비':'주변을 탐색하세요'}</b></div><small>${atTown()?'룬 공방에서 장비를 준비하고 출입구에서 H로 필드에 진입하세요.':'시야 안의 적을 클릭하면 대상의 생명력과 상태를 확인할 수 있습니다.'}</small>`;
 effectsNode.innerHTML=`<b>현재 무기 효과</b><div class="combatTags">${read.effects.length?read.effects.map(t=>`<span>${esc(t)}</span>`).join(''):'<small>장비를 바꾸면 무기 효과가 여기에 표시됩니다.</small>'}</div><small>마나 회복 ${read.manaRegen.toFixed(2)} / 초</small>`;
}
function openCombatGuide28(){
 const st=stats(),m=st.mods;
 showDialog('전투 효과 · 장비와 스킬',`<div class="workgrid"><section class="workpanel"><h3>무기 명중 시</h3><p>강타 <b>${Math.min(100,m.crushingBlow||0)}%</b> · 상처 악화 <b>${Math.min(100,m.openWounds||0)}%</b></p><p>강타는 일반 피해보다 먼저 적의 현재 생명력을 줄입니다. 보스·정예와 원거리 무기에는 감소된 비율이 적용됩니다.</p><p>상처 악화는 8초 동안 출혈 피해를 줍니다. 다시 발동하면 지속시간을 갱신하며 여러 겹으로 중첩되지 않습니다.</p><p>생명·마나 흡수는 실제로 준 물리 피해에 적용됩니다. 면역에 막힌 물리 피해, 강타와 출혈은 흡수량에 포함되지 않습니다.</p></section><section class="workpanel"><h3>공격에 따라 달라지는 효과</h3><p>활·재벌린 공격에는 무기 효과가 적용됩니다. 주문·소환수·차지드 스트라이크의 보조 번개탄에는 무기의 강타·출혈·흡수가 붙지 않습니다.</p><p>스마이트는 강타·출혈을 발동할 수 있습니다. 무기에 붙은 원소 피해, 생명·마나 흡수, 치명타는 적용되지 않습니다.</p><p>적의 속성 공격은 같은 속성의 저항으로 줄일 수 있습니다. 범위 공격의 색과 속성 표시를 보고 예고 영역을 피하세요.</p></section></div><p class="modalFootnote">보통 난이도 싱글플레이 기준입니다. 몬스터 저항·공격 패턴과 출혈 갱신 방식은 이 게임의 조정값이며 원본 몬스터·프레임 데이터의 완전 복원은 아닙니다.</p>`);
 $('#modal').classList.add('wide');
}
const refreshBeforeCombat28=refresh;
refresh=function(){refreshBeforeCombat28();refreshCombatReadout28();};
const bindBeforeCombat28=bindUI;
bindUI=function(){
 bindBeforeCombat28();$('#combatGuide').onclick=openCombatGuide28;
 const help=$('#help').onclick;$('#help').onclick=()=>{help();$('#dialogBody').insertAdjacentHTML('beforeend','<p><b>XXVIII:</b> 무기·주문 판정, 강타·8초 출혈, 보스 속성 공격과 대상 상태 표시를 추가했습니다. v26/v27 JSON을 불러오면 보유 룬워드에도 새 효과가 적용됩니다.</p>');};
};
