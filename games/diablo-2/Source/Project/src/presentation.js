// UI exposes exact versus adapted coverage; no decorative controls without handlers.
const STAT_LABELS27={ar:'명중률 수치',flatDefense:'방어',targetDefense:'대상 방어 %',manaAfterKill:'처치 시 마나',manaRegen:'마나 재생 %',minDamage:'최소 피해',maxDamage:'최대 피해',fireRes:'화염 저항',coldRes:'냉기 저항',lightningRes:'번개 저항',poisonRes:'독 저항',resist:'모든 저항',leech:'생명 흡수 %',manaLeech:'마나 흡수 %',drFlat:'물리 피해 감소',mdr:'마법/원소 피해 감소',drPercent:'물리 피해 감소 %',ias:'공격 속도 %',fcr:'시전 속도 %',frw:'달리기 속도 %',strength:'힘',dexterity:'민첩',vitality:'활력',energy:'마력',ed:'무기 피해 증가 %',edef:'방어 증가 %',mf:'마법 아이템 발견 %',goldFind:'골드 증가 %',block:'막기 확률 보정',allSkills:'모든 스킬',fireSkills:'화염 스킬',defensePerLevel:'레벨당 방어',damageToMana:'받은 피해 마나 전환 %',cannotBeFrozen:'빙결 방지',requirementsPercent:'요구 능력치 %',life:'생명력',mana:'마나',fireMin:'화염 최소 피해',fireMax:'화염 최대 피해',coldMin:'냉기 최소 피해',coldMax:'냉기 최대 피해',lightningMin:'번개 최소 피해',lightningMax:'번개 최대 피해',poisonTotal:'독 총 피해',poisonDuration:'독 지속 초'};
let craftSelection=null,treeDialogTab=null,stashMode='deposit';
const dialog26=showDialog;
showDialog=function(title,html){$('#modal').classList.remove('wide');dialog26(title,html);};
function effectHtml27(item){return `<ul class="effectList">${Object.entries(item.mods||{}).map(([k,v])=>`<li>${esc(STAT_LABELS27[k]||k)} <b>${v>0?'+':''}${v}</b></li>`).join('')}${Object.entries(item.runewordSkills||{}).map(([k,v])=>`<li>${esc(SKILL[k]?.label_ko||k)} +${v}</li>`).join('')}</ul>`;}
function summary27(it){return `${it.name} · ${it.rarity}${it.ethereal?' / 무형':''}${it.damage?' · 피해 '+it.damage.join('–'):''}${it.def?' · 방어 '+it.def:''} · Lv.${it.reqLevel}`;}
function openWorkbench(id=craftSelection){
 if(!atTown()){log('룬 제작은 마을에서 이용하세요.');return;}
 const items=[...S.p.inv,...Object.values(S.p.eq).filter(Boolean)].filter(i=>i.baseId&&i.sockets>0);
 if(!items.some(i=>i.id===id))id=items[0]?.id||'';craftSelection=id;
 const runeIds=[...new Set(S.p.inv.filter(i=>i.runeId).map(i=>i.runeId))].sort((a,b)=>RUNE[a].ordinal-RUNE[b].ordinal);
 showDialog('룬 공방 · 순서가 힘을 만듭니다',`<p class="muted">일반 품질 · 정확한 소켓 수 · 허용 장비 종류 · 룬 순서가 모두 일치해야 룬워드가 됩니다. 삽입한 룬은 되돌릴 수 없습니다.</p><div class="workgrid"><section class="workpanel"><h3>01 · 소켓 장비 선택</h3><select id="craftItem"><option value="">장비 선택</option>${items.map(i=>`<option value="${i.id}" ${i.id===id?'selected':''}>${esc(i.name)} [${i.gems.length}/${i.sockets}]${S.p.inv.includes(i)?'':' · 장착 중'}</option>`).join('')}</select><div id="socketState"></div><h3>02 · 다음 룬 선택</h3><select id="craftRune"><option value="">룬 선택</option>${runeIds.map(k=>`<option value="${k}">${RUNE[k].name_en} · ${S.p.inv.filter(i=>i.runeId===k).length}개 · Lv.${RUNE[k].required_level||0}</option>`).join('')}</select><p class="modalFootnote">가방의 실제 룬 1개를 소비합니다. 미보유 룬을 생성하거나 장비 소켓 수를 변경하지 않습니다.</p><button id="insertRuneConfirm" class="primary" disabled>선택 룬 삽입 — 되돌릴 수 없음</button></section><section class="workpanel"><h3>03 · 결과 미리보기</h3><div id="craftPreview">장비와 룬을 선택하세요.</div></section></div><details style="margin-top:16px"><summary>소켓 베이스 상점 · 웹용 고정 재고</summary><p class="muted">원작 상점의 확률/가격을 복원한 것은 아닙니다. 룬은 사냥으로 획득합니다.</p><div class="actions">${socketStock().map(v=>`<button data-socket-buy="${v.baseId}">${esc(BASE[v.baseId].name)} · ${v.sockets}소켓 · ${v.price}G</button>`).join('')}</div></details><div class="modalFootnote">총옵션 적용 8종: Ancient's Pledge / Leaf / Lore / Rhyme / Smoke / Stealth / Steel / Strength. 일부 부가 효과는 아래 미지원 목록에 표시됩니다. 나머지 레시피는 참조만 제공하며 보너스를 가장하지 않습니다.</div>`);
 $('#modal').classList.add('wide');updateCraftPreview();
}
function updateCraftPreview(){
 const item=ownedItem($('#craftItem')?.value),rune=$('#craftRune')?.value;
 $('#socketState').innerHTML=item?`<div class="socketRow">${Array.from({length:item.sockets},(_,i)=>`<div class="socketCell ${item.gems[i]?'filled':''}"><small>${i+1}번째</small>${item.gems[i]?RUNE[item.gems[i]].name_en:'빈 소켓'}</div>`).join('')}</div><p class="itemSummary">${esc(summary27(item))}</p>`:'<p class="muted">소켓 장비를 획득하거나 아래 상점에서 준비하세요.</p>';
 craftSelection=item?.id||null;const preview=socketPreview(item?.id,rune);$('#insertRuneConfirm').disabled=!preview.ok;
 if(!preview.ok){$('#craftPreview').innerHTML=`<p class="muted">${esc(preview.reason)}</p>${item?effectHtml27(item):''}`;return;}
 const next=preview.item;
 $('#craftPreview').innerHTML=`<h3 class="${next.runewordId?'success':''}">${esc(next.name)}</h3><p class="itemSummary">${esc(summary27(next))}<br>요구 힘 ${next.requirements.strength} · 민첩 ${next.requirements.dexterity}</p>${next.runewordId?'<span class="liveBadge">룬워드 판정 성공 · 총옵션 사용</span>':next.referenceWordId?'<span class="refBadge">일치 레시피 참조 · 개별 룬만 적용</span>':'<span class="refBadge">개별 룬 효과</span>'}${effectHtml27(next)}${preview.reason?`<p class="warning">${esc(preview.reason)}</p>`:''}${next.deferredEffects.length?`<details open><summary>표시만 보존 · 전투 미지원 ${next.deferredEffects.length}개</summary><ul class="effectList">${next.deferredEffects.map(p=>`<li>${esc(p.stat)}${p.value!==undefined?' : '+p.value:''}</li>`).join('')}</ul></details>`:''}`;
}
function openStash(mode=stashMode){
 if(!atTown()){log('개인 창고는 마을에서 이용하세요.');return;}stashMode=mode;S.stash??=[];const list=mode==='withdraw'?S.stash:S.p.inv;
 showDialog('개인 창고 · 탐험 장비 보관',`<nav class="treeTools"><button data-stash-mode="deposit" class="${mode==='deposit'?'selected':''}">가방 → 창고</button><button data-stash-mode="withdraw" class="${mode==='withdraw'?'selected':''}">창고 → 가방</button></nav><p>가방 ${S.p.inv.length}/40 · 창고 ${S.stash.length}/80 · ${S.p.gold}G</p><div class="inventoryList">${list.length?list.map(i=>`<div class="inventoryRow"><span class="${i.rarity}">${esc(i.name)}<small>${i.baseId?esc(summary27(i)):i.runeId?'룬 · Lv.'+(i.reqLevel||0):'소모품'}</small></span><div class="actions"><button data-stash-move="${i.id}" data-withdraw="${mode==='withdraw'}">${mode==='withdraw'?'꺼내기':'보관'}</button>${mode==='deposit'?`<button data-sell-one="${i.id}">${i.value}G 판매</button>`:''}</div></div>`).join(''):'<p class="muted">비어 있습니다.</p>'}</div><p class="modalFootnote">창고는 이 캐릭터의 저장 데이터에 포함됩니다. 계정 공용 창고나 온라인 동기화는 아닙니다.</p>`);
 $('#modal').classList.add('wide');
}
const oldItemInfo27=itemInfo;
itemInfo=function(it){return oldItemInfo27(it)+(it.gems?.length?'\n삽입 순서: '+it.gems.map(r=>RUNE[r]?.name_en||r).join(' → '):'')+(it.runewordId?'\n룬워드 총옵션 적용 (개별 룬 중복 합산 안 함)':'')+(it.deferredEffects?.length?'\n참조 전용 효과: '+it.deferredEffects.map(p=>p.stat).join(', '):'');};
const inspector26=openItemInspector;
openItemInspector=function(it){inspector26(it);if(it.baseId&&it.sockets&&atTown())$('#dialogBody').insertAdjacentHTML('beforeend',`<button data-craft-inspect="${it.id}">이 장비로 룬 제작</button>`);};
showItemLab=function(){
 showDialog('데이터 규칙 · 구현 범위',`<p><b>기반 데이터:</b> 7직업 · 210스킬 노드 · 131지역 · 39순간이동진 · 58 장비 베이스 · 36접사 · 33룬 · 78룬워드 레시피.</p><p><b>실행:</b> 71스킬, 무기·주문별 효과 분리, 강타·8초 상처 악화, 일반/마법/희귀 생성, 하드 포인트와 장비 스킬 분리, 요구 능력치, 순서 있는 소켓, 8종 룬워드 총옵션.</p><p class="warning">원본 게임 파일 전체 추출본이 아닙니다. TC 가중치·품질 확률·가격·적 수치는 웹용입니다. 8종 룬워드도 공개 수치 중 현재 전투에서 지원하는 효과만 적용합니다. 회복 프레임/충전 스킬 등 미지원 효과는 아이템에 명시됩니다.</p><select id="recipePick">${D2DATA.runewords.map(r=>`<option value="${r.id}">${RUNTIME_WORDS.has(r.id)?'[총옵션 연결]':'[참조]'} ${esc(r.name_en)}</option>`).join('')}</select><div id="recipeView"></div><p class="modalFootnote">마법: 접두 1개/접미 1개 한도. 희귀: 총 2–6개, 각 3개 한도, 같은 접사 그룹 중복 배제. 유니크/세트/크래프트 생성과 원작 전체 드롭 확률은 미구현입니다.</p>`);renderRecipe();
};
function fullSkillTree(tab=treeDialogTab){
 const trees=D2DATA.trees.filter(t=>t.class_id===S.hero);if(!trees.some(t=>t.id===tab))tab=trees[0].id;treeDialogTab=tab;
 const nodes=D2DATA.skills.filter(s=>s.tree_id===tab).sort((a,b)=>a.required_character_level-b.required_character_level),rowCount={},tiers=[1,6,12,18,24,30];
 showDialog(heroLabels[S.hero]+' · 스킬 트리',`<div class="treeTools">${trees.map(t=>`<button data-full-tree="${t.id}" class="${t.id===tab?'selected':''}">${esc(t.label_ko_editorial)}</button>`).join('')}</div><p class="treeLegend">투자 가능 <span class="liveBadge">밝은 테두리</span> · 습득 <span class="liveBadge">청록</span> · 미지원 <span class="refBadge">회색 참조</span><br>스킬 포인트 <b>${S.p.points}</b> · 선행 조건은 직접 투자로만 충족됩니다. 장비 보너스는 시너지에 포함되지 않습니다.</p><div class="treeBoard"><svg class="treeLines" aria-hidden="true"></svg><div class="treeGrid">${nodes.map(s=>{const row=Math.max(0,tiers.indexOf(s.required_character_level)),col=(rowCount[row]||0);rowCount[row]=col+1;const hard=S.p.skills[s.id]||0,rank=softRank(s.id),reason=skillReason(s.id);return `<article class="skillNode ${s.runtime?'supported':'reference'} ${hard?'learned':!reason?'unlocked':''}" id="tree-${s.id}" style="grid-row:${row+1};grid-column:${col%3+1}"><h4>${esc(s.label_ko)}</h4><small>요구 Lv.${s.required_character_level} · <b>${hard}</b>${rank>hard?' +'+(rank-hard):''} / 20</small><p>${s.runtime?(CURVE[s.id]?'공개 표시 수치':'웹 근사 수치'):'실행 미지원'}</p><div class="skillActions"><button data-tree-learn="${s.id}" title="${esc(reason||'포인트 투자')}" ${reason?'disabled':''}>＋</button><button data-tree-info="${s.id}">수치</button>${s.runtime&&s.runtime.kind!=='passive'?`<select data-tree-bind="${s.id}" aria-label="${esc(s.label_ko)} 단축키" ${rank<1?'disabled':''}><option value="">배정</option>${[2,3,4,5].map(n=>`<option value="${n}" ${S.p.skillBindings[n-2]===s.id?'selected':''}>${n}번</option>`).join('')}</select>`:''}</div></article>`;}).join('')}</div></div><p class="modalFootnote">원작 UI 이미지를 사용하지 않는 데이터 기반 배치입니다. 회색 노드는 스킬명만 복원되어 투자가 잠겨 있습니다. 20 초과 효과 외삽은 하지 않습니다.</p>`);
 $('#modal').classList.add('wide');requestAnimationFrame(drawTreeLines27);
}
function drawTreeLines27(){const root=$('.treeBoard'),svg=$('.treeLines');if(!root||!svg)return;const rect=root.getBoundingClientRect(),lines=[];
 for(const sk of D2DATA.skills.filter(s=>s.tree_id===treeDialogTab))for(const id of sk.requires||[]){const a=document.getElementById('tree-'+id),b=document.getElementById('tree-'+sk.id);if(!a||!b)continue;const r=a.getBoundingClientRect(),t=b.getBoundingClientRect(),x=r.x+r.width/2-rect.x,y=r.bottom-rect.y,tx=t.x+t.width/2-rect.x,ty=t.top-rect.y;
  lines.push(`<path d="M${x},${y} C${x},${y+13} ${tx},${ty-13} ${tx},${ty}" fill="none" stroke="${S.p.skills[id]>0?'#83b4a6':'#516678'}" stroke-width="1.6"/><path d="M${tx-3},${ty-5} L${tx},${ty} L${tx+3},${ty-5}" fill="none" stroke="#83a8af"/>`);}
 svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);svg.innerHTML=lines.join('');
}
function openRespec(){const why=respecReason();showDialog('악의 소굴 보상 · 빌드 초기화',`<p>투자한 능력치와 스킬 포인트를 전부 돌려받습니다. 레벨·경험치·퀘스트 보상·장비는 유지합니다.</p><p>장비 보너스는 반환 포인트에 포함되지 않습니다. 요구 능력치가 부족해진 장비는 미활성화되며 오라·소환수·버프는 해제됩니다.</p><p class="warning">보통 난이도에서 1회만 사용할 수 있습니다.</p>${why?`<p>${esc(why)}</p>`:'<button id="respecConfirm" class="primary">보상 1회 사용 · 초기화</button>'}`);}
const worldMap26=openWorldMap;
openWorldMap=function(act=S.floor){worldMap26(act);$('#modal').classList.add('wide');const goal=goalState(),path=goal.path;
 $('#dialogBody').insertAdjacentHTML('afterbegin',`<section class="workpanel"><h3>다음 목표 · ${esc(goal.label)}</h3><div class="routeSteps">${path?path.map((id,i)=>`${i?'<i>→</i>':''}<span>${i===0?'<b>':''}${esc(AREA[id].label||AREA[id].name)}${i===0?'</b>':''}</span>`).join(''):'<span>잠긴 관문 / 다른 액트 · 퀘스트 조건 확인</span>'}</div><button id="routeNow">다음 출입구로 이동</button> <button id="clearTracked">자동 목표로 복귀</button></section>`);
 const rows=$('#dialogBody').querySelectorAll('.regionList .region');const areas=D2DATA.world.areas.filter(a=>a.act===act);rows.forEach((row,i)=>{const a=areas[i];if(!a)return;row.classList.toggle('routeFocus',!!path?.includes(a.id));row.insertAdjacentHTML('beforeend',`<button class="miniAction" data-track-area="${a.id}">경로</button>`);});
};
const refresh26=refresh;
refresh=function(){refresh26();if(!S?.world?.areaId)return;const goal=goalState();$('#routeHint').textContent=goal.path?.length>1?'다음 경유지 · '+(AREA[goal.path[1]].label||AREA[goal.path[1]].name):goal.label;
 for(const b of $('#attributes').querySelectorAll('[data-stat]')){const pr=previewAttribute(b.dataset.stat,1),a=pr.after,c=pr.before;b.title=`+1 미리보기: 생명 ${c.life}→${a.life} / 마나 ${c.mana}→${a.mana} / 명중 ${c.ar}→${a.ar} / 피해 ${c.minDamage}–${c.maxDamage}→${a.minDamage}–${a.maxDamage}`;}
 $('#craftStats').textContent='33룬 · 8 룬워드 · 창고 '+(S.stash?.length||0)+'/80';
};
const bind26=bindUI;
bindUI=function(){bind26();$('#workbench').onclick=()=>openWorkbench();$('#stash').onclick=()=>openStash();$('#fullTree').onclick=()=>fullSkillTree();$('#respec').onclick=openRespec;$('#trackObjective').onclick=()=>routeToObjective();$('#sell').onclick=()=>openStash('deposit');
 $('#attributes').onclick=e=>{const b=e.target.closest('[data-stat]');if(b)allocateBatch(b.dataset.stat,e.shiftKey?5:1);};
 $('#dialogBody').addEventListener('change',e=>{if(['craftItem','craftRune'].includes(e.target.id))updateCraftPreview();const id=e.target.dataset.treeBind;if(id&&e.target.value){assignSkill(id,+e.target.value-2);refresh();}});
 $('#dialogBody').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
  if(b.id==='insertRuneConfirm'){const id=$('#craftItem').value,rune=$('#craftRune').value;closeForAction(()=>insertRune(id,rune));openWorkbench(id);}
  if(d.socketBuy){closeForAction(()=>buySocketBase(d.socketBuy));openWorkbench();}
  if(d.craftInspect)openWorkbench(d.craftInspect);
  if(d.stashMode)openStash(d.stashMode);
  if(d.stashMove){closeForAction(()=>stashItem(d.stashMove,d.withdraw==='true'));openStash();}
  if(d.sellOne){closeForAction(()=>sellItem(d.sellOne));openStash();}
  if(d.fullTree)fullSkillTree(d.fullTree);
  if(d.treeLearn){closeForAction(()=>learnSkill(d.treeLearn));fullSkillTree();}
  if(d.treeInfo)showSkillInfo(d.treeInfo);
  if(b.id==='respecConfirm'){closeForAction(respecCharacter);fullSkillTree();}
  if(b.id==='routeNow')closeForAction(routeToObjective);
  if(b.id==='clearTracked'){S.trackedGoal=null;openWorldMap();}
  if(d.trackArea){trackArea(d.trackArea);openWorldMap(AREA[d.trackArea].act);}
 });
 const originalHelp=$('#help').onclick;$('#help').onclick=()=>{originalHelp();$('#dialogBody').insertAdjacentHTML('beforeend','<p><b>이전 기능:</b> 마을 룬 제작·개인 창고, 스킬 트리 펼치기, Shift+능력치 버튼 5점 투자, 악의 소굴 1회 초기화, 다음 목표 경로 안내. v26/v27 저장 JSON을 가져올 수 있으며 v28 독립 저장 슬롯을 사용합니다.</p>');};
 window.addEventListener('resize',()=>{if($('.treeBoard'))drawTreeLines27();});
};
