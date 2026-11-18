/* Menus, build cards, safe persistence, audio and opt-in integration hooks. */
const Sound=(()=>{
 let ac=null,master=null,voices=0,lastPlay={};
 const tones={shot:[670,.035,'triangle',.025],kill:[145,.07,'triangle',.035],rocket:[78,.15,'sawtooth',.035],zap:[1150,.11,'sine',.045],hurt:[105,.2,'triangle',.09],dash:[430,.14,'sine',.04],warn:[320,.22,'triangle',.06],upgrade:[790,.12,'sine',.055],level:[620,.18,'sine',.06],evolve:[880,.3,'sine',.08],win:[1046,.5,'sine',.08]};
 function unlock(){if(!graphics.sound)return;try{if(!ac){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ac=new C();master=ac.createGain();master.gain.value=.5;master.connect(ac.destination);}if(ac.state==='suspended')ac.resume().catch(()=>{});}catch(e){}}
 function play(name){
  if(!graphics.sound||!ac||ac.state!=='running'||voices>=10)return;
  const now=performance.now(),interval=name==='shot'?95:name==='kill'?90:name==='warn'?300:40;if(now-(lastPlay[name]??-1e6)<interval)return;lastPlay[name]=now;
  const [freq,dur,type,volume]=tones[name]||tones.upgrade,t=ac.currentTime,osc=ac.createOscillator(),gain=ac.createGain();voices++;
  osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(name==='level'||name==='evolve'||name==='win'?freq*1.5:Math.max(40,freq*.45),t+dur);
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+dur);
  osc.connect(gain);gain.connect(master);osc.onended=()=>{voices--;osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+dur+.02);
 }
 function suspend(){if(ac&&ac.state==='running')ac.suspend().catch(()=>{});}
 return {unlock,play,suspend,get state(){return ac?.state||'uninitialized';}};
})();
function toast(message){const el=$('notice');el.textContent=message;el.style.opacity='1';clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.style.opacity='0',2100);}
function clearInputs(){
 keys.clear();const pid=joy.id;joy.active=false;joy.id=null;joy.dx=joy.dy=0;
 if(pid!==null)try{if(cvs.hasPointerCapture(pid))cvs.releasePointerCapture(pid);}catch(e){}
 if($('stick')){$('stick').style.left='35px';$('stick').style.top='35px';$('joystick').style.left='40px';$('joystick').style.top='auto';$('joystick').style.bottom='85px';}
}
function show(html){clearInputs();$('panel').innerHTML=html;$('overlay').classList.remove('hidden');document.body.dataset.screen=state;}
function hide(){$('overlay').classList.add('hidden');document.body.dataset.screen=state;}
function refreshSettingsButtons(){$('qualitybutton').textContent={normal:'보통',high:'높음',low:'낮음'}[graphics.quality];$('viewmode').textContent=renderer3d.mode;$('soundbutton').textContent=graphics.sound?'효과음 ON':'음소거';$('soundbutton').setAttribute('aria-pressed',String(graphics.sound));}
function toggleSound(){graphics.sound=!graphics.sound;saveGraphics();if(graphics.sound){Sound.unlock();Sound.play('upgrade');}else Sound.suspend();refreshSettingsButtons();}
function menu(){
 state='menu';clearInputs();renderer3d.resetCamera(0,0);if(chapter>=profile.unlocked)chapter=0;
 show(`<div class="eyebrow">SURVIVOR ARENA · BLOCK WORLD · V13</div><h1 class="hero-title">작은 블록.<br><span>나만의 생존 빌드.</span></h1><p class="intro">전투 특성 9종 · 속성 정예 · 나만의 생존 빌드.<br>5분의 공세를 버티고 최종 보스를 격파하세요.</p>
 <div id="continueSlot"></div><div class="hero-selector">${Object.entries(heroCatalog).map(([k,h])=>`<button type="button" class="hero-card ${selectedHero===k?'chosen':''}" data-hero="${k}" aria-pressed="${selectedHero===k}" style="--hero:${h.color}"><span class="mini-person"><i></i><b></b></span><strong>${h.name}</strong><small>${h.skill}</small></button>`).join('')}</div><p class="hero-description" id="heroDescription"></p><div class="menu-grid"><label class="field">CHAPTER / 전장<select id="chapter">${chapters.map((c,i)=>`<option value="${i}" ${i>=profile.unlocked?'disabled':''}>0${i+1} · ${c.name}${i>=profile.unlocked?' 🔒':''}</option>`).join('')}</select></label><label class="field">DIFFICULTY / 난이도<select id="difficulty"><option value="normal">일반 · 기본 생존</option><option value="hard">도전 · 적 능력치 ×1.5</option></select></label></div>
 <div id="chapterInfo" class="chapter-info"></div><label class="field start-weapon">STARTING WEAPON / 시작 무기<select id="startingWeapon">${Object.keys(weaponData).filter(k=>k!=='destroyer').map(k=>`<option value="${k}">${definitions[k].icon} ${definitions[k].name}</option>`).join('')}</select></label>
 <p class="hint start-tip">처음 플레이: 쿠나이 추천 · 수호자는 적 가까이에서 효과적입니다.</p><div class="meta-box" id="meta"></div><button class="action" id="start">전장으로 출발 →</button>
 <div class="menu-buttons"><button class="action secondary" id="gear">장비 · 합성</button><button class="action secondary" id="campaign">챕터 기록</button><button class="action secondary" id="guide">진화 도감</button><button class="action secondary" id="settings">설정 · 저장</button></div>
 <div class="menu-buttons training"><button class="action gold" id="buyAtk"></button><button class="action gold" id="buyHp"></button><button class="action gold" id="buyArmor"></button></div>
 <div class="controls"><span><kbd>WASD</kbd>이동</span><span><kbd>SPACE</kbd>대시</span><span><kbd>E</kbd>특수기</span><span><kbd>B</kbd>빌드</span><span><kbd>P</kbd>일시정지</span></div><p class="hint">공식 게임이 아닌 독립 웹 프로토타입 · 원작 에셋 / 실제 결제 없음</p>`);
 $('chapter').value=chapter;$('difficulty').value=difficulty;$('startingWeapon').value=startingWeapon;
 function info(){const c=profile.campaign[chapter];$('chapterInfo').innerHTML=`<span class="stars">${'★'.repeat(c.stars)}${'☆'.repeat(3-c.stars)}</span> ${chapters[chapter].desc}`;}
 $('chapter').onchange=e=>{chapter=+e.target.value;info();};$('difficulty').onchange=e=>difficulty=e.target.value;$('startingWeapon').onchange=e=>startingWeapon=e.target.value;
 $('start').onclick=requestNewRun;renderContinueCard();
 document.querySelectorAll('[data-hero]').forEach(b=>b.onclick=()=>{selectedHero=b.dataset.hero;profile.hero=selectedHero;saveProfile();document.querySelectorAll('[data-hero]').forEach(el=>{el.classList.toggle('chosen',el===b);el.setAttribute('aria-pressed',String(el===b));});$('heroDescription').textContent=heroCatalog[selectedHero].desc;});$('heroDescription').textContent=heroCatalog[selectedHero].desc;$('gear').onclick=gearMenu;$('campaign').onclick=campaignMenu;$('guide').onclick=guideMenu;$('settings').onclick=settingsMenu;
 function refresh(){
  $('meta').innerHTML=`<b>🪙 ${profile.gold.toLocaleString()} GOLD</b> &nbsp; · &nbsp; 부품 ${profile.parts} &nbsp; · &nbsp; 최고 ${profile.best} 처치<br>영구 강화: 공격 ${profile.attack} / 체력 ${profile.hp} / 방어 ${profile.armor}${!storageAvailable?'<br><strong class="warning">저장소 접근 불가 · 설정에서 JSON을 백업하세요.</strong>':''}`;
  for(const [id,k,base,mul,label] of [['buyAtk','attack',30,25,'공격'],['buyHp','hp',30,25,'체력'],['buyArmor','armor',40,30,'방어']]){const cost=base+profile[k]*mul;$(id).textContent=label+' + · '+cost+' G';$(id).disabled=profile.gold<cost||profile[k]>=500;$(id).onclick=()=>{if(profile.gold>=cost&&profile[k]<500){profile.gold-=cost;profile[k]++;saveProfile();Sound.play('upgrade');refresh();}};}
 }
 refresh();info();updateHud(true);
}
function skillDetail(k){
 const lv=(player.levels[k]||0)+1,d=definitions[k];let detail=d.desc;
 if(d.kind==='weapon'){const from=player.levels[k]?weaponData[k].damage[player.levels[k]-1]:0,to=weaponData[k].damage[lv-1];detail+=`<br><span class="statdiff">기본 피해 ${from?from+' → ':''}${to}</span>`;if(evoPairs[k])detail+=`<br><span class="pairhint">진화: ${definitions[evoPairs[k]].icon} ${definitions[evoPairs[k]].name}${player.levels[evoPairs[k]]?' ✓':''}</span>`;if(k==='droneA'||k==='droneB')detail+='<br><span class="pairhint">A형 5 + B형 5 → 파괴자</span>';}
 return detail;
}
function levelUp(restored=null){
 state='level';Sound.play('level');const opts=restored||upgradeOptions();levelDraft=[...opts];
 if(!opts.length){player.hp=Math.min(player.maxHp,player.hp+15);player.gold+=5*(pendingLevels+1);pendingLevels=0;resumePlay();return;}
 show(`<div class="eyebrow">LEVEL UP · LV.${player.lv}</div><h1>다음 한 수를 선택하세요.</h1><div class="slot-summary">무기 ${owned('weapon').length}/6 &nbsp; · &nbsp; 보조 ${owned('passive').length}/6 &nbsp; · &nbsp; 남은 선택 ${pendingLevels+1}회</div>
 <div class="cards">${opts.map((k,i)=>`<button class="card" data-skill="${k}"><span class="keycap">${i+1}</span><span class="emoji">${definitions[k].icon}</span><b>${definitions[k].name}</b><span class="tag">${player.levels[k]?'강화':'신규'} · Lv.${(player.levels[k]||0)+1}</span><br><small>${skillDetail(k)}</small></button>`).join('')}</div>
 <div class="menu-buttons"><button class="action secondary" id="reroll" ${rerolls<=0?'disabled':''}>다시 뽑기 R · ${rerolls}</button><button class="action secondary" id="banish" ${banishes<=0?'disabled':''}>첫 카드 제외 · ${banishes}</button></div><p class="hint">1 / 2 / 3으로 선택 · 같은 무기 5레벨 + 대응 보조 + 상자 → 진화</p>`);
 $('reroll').onclick=()=>{if(state==='level'&&rerolls>0){rerolls--;levelUp();}};
 $('banish').onclick=()=>{if(state==='level'&&banishes>0){banishes--;banished.add(opts[0]);levelUp();}};
 document.querySelectorAll('[data-skill]').forEach(b=>b.onclick=()=>{if(state!=='level')return;applyUpgrade(b.dataset.skill);resumePlay();});
 updateHud(true);saveRun();
}
function openChest(restored=null){
 if(state!=='playing'||paidRun)return;state='chest';const eligible=restored?restored.eligible:evolutionEligible(),reward=restored?restored.reward:20+Math.floor(elapsed/15);let chosen=restored?.chosen||eligible[0];
 const up=restored?restored.up:owned('weapon').filter(k=>!definitions[k].hidden&&player.levels[k]<5).sort((a,b)=>player.levels[b]-player.levels[a])[0];chestDraft={eligible:[...eligible],reward,chosen:chosen||null,up:up||null};
 show(`<div class="eyebrow">SUPPLY CACHE</div><h1>${eligible.length?'진화할 무기를 선택하세요.':'보급품을 확보했습니다.'}</h1>${eligible.length?`<div class="evolution-list">${eligible.map(k=>`<button class="evolution-option ${k===chosen?'selected':''}" data-evolution="${k}"><span>${definitions[k].icon}</span><div><b>${evolutionNames[k]}</b><small>${evolutionDescriptions[k]}</small></div></button>`).join('')}</div>`:`<p>골드 <b>+${reward}</b> · 체력 <b>+25</b>${up?`<br>${definitions[up].icon} ${definitions[up].name} Lv.${player.levels[up]} → ${player.levels[up]+1}`:''}</p>`}<button class="action" id="claim">${eligible.length?'진화 확정':'보급품 받기'} →</button><p class="hint">상자 화면에서는 전투 시간이 멈춥니다.</p>`);
 document.querySelectorAll('[data-evolution]').forEach(b=>b.onclick=()=>{chosen=b.dataset.evolution;chestDraft.chosen=chosen;saveRun();document.querySelectorAll('[data-evolution]').forEach(el=>el.classList.toggle('selected',el===b));});
 $('claim').onclick=()=>{if(state!=='chest'||paidRun)return;if(eligible.length)evolveWeapon(chosen);else{player.gold+=reward;player.hp=Math.min(player.maxHp,player.hp+25);if(up)applyUpgrade(up);Sound.play('upgrade');}runStats.chests++;checkMissions();resumePlay();};saveRun();
}
function damageTable(){
 const entries=Object.entries(runStats.byWeapon||{}).sort((a,b)=>b[1]-a[1]),total=Math.max(1,runStats.damage||0);
 if(!entries.length)return '<p class="hint">아직 피해 기록이 없습니다.</p>';
 return '<div class="damage-table">'+entries.map(([k,value])=>`<div class="damage-row"><span>${definitions[k]?.icon||'💣'} ${definitions[k]?.name||({hero_burst:'선봉 충격파',turret:'자동 포탑',bomb:'전장 폭탄',dash_pulse:'충격 기동',perk_blast:'연쇄 폭파'}[k]||'기타')}</span><b>${Math.round(value).toLocaleString()} <small>${(value/total*100).toFixed(1)}%</small></b><div><i style="width:${value/total*100}%"></i></div></div>`).join('')+'</div>';
}
function pause(){
 if(state==='playing'){
  state='paused';Sound.suspend();show(`<div class="eyebrow">PAUSED</div><h1>잠시 숨을 고르세요.</h1><p>${chapters[chapter].name} · ${fmt(elapsed)} · ${player.kills} 처치<br>전투와 재사용 대기시간이 정지되었습니다.</p><button class="action" id="resume">계속하기</button><button class="action secondary" id="pauseBuild">현재 빌드</button><button class="action gold" id="suspendRun">저장 후 로비</button><button class="action secondary" id="restart">다시 시작</button><button class="action secondary" id="quit">로비로 종료</button>`);
  $('resume').onclick=()=>{Sound.unlock();resumePlay();};$('pauseBuild').onclick=buildMenu;
  $('suspendRun').onclick=suspendRun;saveRun();
  $('restart').onclick=()=>confirmExit(true);$('quit').onclick=()=>confirmExit(false);
 }else if(state==='paused'||state==='build'){Sound.unlock();resumePlay();}
}
function confirmExit(restart){
 state='paused';show(`<h1>${restart?'새로 시작할까요?':'이번 전투를 종료할까요?'}</h1><p>지금까지 얻은 골드는 정산됩니다.<br>이 버튼으로 종료하면 중간 저장도 삭제됩니다. 이어하려면 취소 후 ‘저장 후 로비’를 사용하세요.</p><button class="action" id="confirmQuit">${restart?'정산 후 다시 시작':'정산 후 결과 보기'}</button><button class="action secondary" id="cancelQuit">계속하기</button>`);
 $('confirmQuit').onclick=()=>{finish(false,'전투 중단');if(restart)reset();};$('cancelQuit').onclick=()=>{Sound.unlock();resumePlay();};
}
function buildMenu(){
 if(!player||paidRun)return;state='build';
 show(`<div class="eyebrow">CURRENT LOADOUT · BUILD</div><h1>현재 빌드</h1><div class="meta-box">${heroCatalog[activeHero].icon} ${heroCatalog[activeHero].name} · ${heroCatalog[activeHero].skill}<br>특수기 ${tactics.casts}회 · 거점 ${tactics.completed}곳 · 추가 부품 ${tactics.parts}개</div><div class="build-grid">${['weapon','passive'].map(kind=>`<section><h3>${kind==='weapon'?'무기':'보조'} ${owned(kind).length}/6</h3>${owned(kind).map(k=>`<div class="build-row"><span>${definitions[k].icon}</span><div><b>${player.evolved[k]?evolutionNames[k]:definitions[k].name}</b><small>${player.evolved[k]?'★ 진화 완료':'Lv.'+player.levels[k]+(evoPairs[k]?' · '+definitions[evoPairs[k]].name+(player.levels[evoPairs[k]]?' ✓':' 필요'):'')}</small></div></div>`).join('')}</section>`).join('')}</div>${perkPanel()}<h3>현장 임무</h3>${missions.map(m=>`<p class="mission-line">${missionClaims.has(m.id)?'✓':'○'} ${m.name} <b>${Math.min(m.goal,m.value())}/${m.goal}</b> <small>+${m.reward} G</small></p>`).join('')}<h3>무기별 실제 피해</h3>${damageTable()}<button class="action" id="buildBack">전투 계속하기 · B</button>`);
 $('buildBack').onclick=()=>{Sound.unlock();resumePlay();};
}
function resultMenu(r){
 show(`<div class="eyebrow">${r.win?'CHAPTER CLEAR':'RUN COMPLETE'}</div><h1>${r.win?'승리! 다음 전장을 향해.':r.reason||'다음에는 더 강하게.'}</h1><p>${chapters[chapter].name} · ${fmt(elapsed)} · Lv.${player.lv} · ${player.kills} 처치</p>${r.win?`<div class="result-stars">${'★'.repeat(r.stars)}${'☆'.repeat(3-r.stars)}</div>`:''}<div class="reward-grid"><div><small>획득 골드</small><b>+${r.baseGold+r.clearGold}</b><small>전투 ${r.baseGold} + 클리어 ${r.clearGold}</small></div><div><small>제작 부품</small><b>+${r.parts}</b><small>생존 + 클리어 + 거점 ${tactics.parts||0}개</small></div></div>${r.drops.length?'<div class="loot-row">'+r.drops.map(d=>`<span style="border-color:${rarities[d.tier].color}">${gearCatalog[d.kind].icon} ${rarities[d.tier].name} ${gearCatalog[d.kind].name}</span>`).join('')+'</div>':''}<p class="hint">임무 ${missionClaims.size}/3 · 임무 골드 ${runStats.missionGold} 포함 · 진화 ${runStats.evolutions}회 · 받은 피해 ${Math.round(runStats.taken)}</p>${perkPanel()}${recapPanel()}<details class="damage-details"><summary>무기별 피해 통계</summary>${damageTable()}</details><div class="menu-buttons"><button class="action" id="again">다시 도전</button><button class="action secondary" id="resultLobby">로비 · 장비 강화</button>${r.win&&chapter<2?'<button class="action gold" id="nextChapter">다음 챕터 →</button>':''}</div>${!storageAvailable?'<p class="warning">저장소에 기록하지 못했습니다. 로비 → 설정 → 저장 백업을 이용하세요.</p>':''}`);
 $('again').onclick=reset;$('resultLobby').onclick=menu;if($('nextChapter'))$('nextChapter').onclick=()=>{chapter++;reset();};
}
function mergeGear(k,tier){if(!gearCatalog[k]||tier<0||tier>=3||profile.inventory[k][tier]<3)return false;profile.inventory[k][tier]-=3;profile.inventory[k][tier+1]++;saveProfile();Sound.play('evolve');return true;}
function craftGear(k){if(!gearCatalog[k]||profile.parts<4)return false;profile.parts-=4;profile.inventory[k][0]++;saveProfile();Sound.play('upgrade');return true;}
function gearMenu(){
 state='menu';show(`<div class="eyebrow">WORKSHOP · EQUIPMENT</div><h1>강화하고, 합성하고.</h1><p class="intro">동일 부위·등급 3개 → 상위 등급 1개.<br>가장 높은 등급을 자동 장착하며 기존 강화 레벨은 유지됩니다.</p><div class="meta-box" id="gearGold"></div><div id="gearList"></div><button class="action" id="gearBack">← 로비</button>`);
 function render(){
  $('gearGold').textContent=`🪙 ${profile.gold.toLocaleString()} G · 제작 부품 ${profile.parts}개`;
  $('gearList').innerHTML=Object.entries(gearCatalog).map(([k,g])=>{const lv=profile.gear[k],tier=equippedTier(k),cost=g.cost+lv*70;const extra=k==='blade'?['',' · 공격 +8%',' · 공격 +20%',' · 공격 +40%'][tier]:k==='vest'?['',' · HP +15',' · HP +40',' · HP +75'][tier]:['',' · 속도 +3%',' · 속도 +8%',' · 속도 +15%'][tier];return `<section class="gear-card"><div class="gear-heading"><span>${g.icon}</span><div><b>${g.name}</b><small style="color:${rarities[tier].color}">${rarities[tier].name} 자동 장착 · 강화 Lv.${lv}/10${extra}</small></div></div><p class="hint">${g.desc}</p><div class="tier-grid">${rarities.map((r,i)=>`<div style="border-color:${r.color}"><small>${r.name}</small><b>${profile.inventory[k][i]}</b>${i<3?`<button data-merge="${k}:${i}" ${profile.inventory[k][i]<3?'disabled':''}>3개 합성</button>`:'<small>최고 등급</small>'}</div>`).join('')}</div><button class="action secondary" data-gear="${k}" ${lv>=10||profile.gold<cost?'disabled':''}>${lv>=10?'최대 강화':cost+' G 강화'}</button><button class="action gold" data-craft="${k}" ${profile.parts<4?'disabled':''}>일반 제작 · 부품 4</button></section>`;}).join('');
  document.querySelectorAll('[data-gear]').forEach(b=>b.onclick=()=>{const k=b.dataset.gear,lv=profile.gear[k],c=gearCatalog[k].cost+lv*70;if(lv<10&&profile.gold>=c){profile.gold-=c;profile.gear[k]++;saveProfile();Sound.play('upgrade');render();}});
  document.querySelectorAll('[data-merge]').forEach(b=>b.onclick=()=>{const [k,t]=b.dataset.merge.split(':');if(mergeGear(k,+t))render();});
  document.querySelectorAll('[data-craft]').forEach(b=>b.onclick=()=>{if(craftGear(b.dataset.craft))render();});
 }
 $('gearBack').onclick=menu;render();
}
function campaignMenu(){
 state='menu';show(`<div class="eyebrow">CHAPTER PROGRESS</div><h1>전장의 기록</h1><p class="intro">별 조건: 클리어 / 500처치 / 진화 1종.<br>클리어하면 다음 챕터가 열립니다.</p>${chapters.map((c,i)=>{const p=profile.campaign[i];return `<section class="gear-card"><div class="chapter-heading"><b>0${i+1} · ${c.name}</b><span class="stars">${'★'.repeat(p.stars)}${'☆'.repeat(3-p.stars)}</span></div><p class="hint">${c.boss} · ${c.desc}</p><p>클리어 ${p.clears}회 · 최고 ${p.bestKills} 처치${p.bestTime?' · 최단 '+fmt(p.bestTime):''}</p><button class="action secondary" data-chapter="${i}" ${i>=profile.unlocked?'disabled':''}>${i>=profile.unlocked?'이전 챕터 클리어 필요':'이 챕터 선택'}</button></section>`;}).join('')}<button class="action" id="campaignBack">← 로비</button><p class="hint">v10 저장을 가져온 경우 기존처럼 세 챕터를 모두 선택할 수 있습니다.</p>`);
 document.querySelectorAll('[data-chapter]').forEach(b=>b.onclick=()=>{chapter=+b.dataset.chapter;menu();});$('campaignBack').onclick=menu;
}
function guideMenu(){
 state='menu';show(`<div class="eyebrow">EVOLUTION CODEX</div><h1>6칸으로 만드는 전략.</h1><p class="intro">무기와 보조는 각각 6슬롯입니다. 무기 Lv.5 + 대응 보조 Lv.1 이상을 갖춘 뒤 보급 상자에서 진화를 선택하세요.</p><div class="codex">${Object.entries(evoPairs).map(([w,p])=>`<div><b>${definitions[w].icon} ${definitions[w].name} + ${definitions[p].icon} ${definitions[p].name}</b><small>→ ${evolutionNames[w]} · ${evolutionDescriptions[w]}</small></div>`).join('')}<div class="fusion"><b>🛸 A형 5 + 🚁 B형 5 + 보급 상자</b><small>→ ✦ 파괴자 드론 · 두 드론 소모, 1개 슬롯 반환</small></div></div><p>황금 상자는 엘리트·보스 처치와 정기 보급으로 획득합니다. 진화 조건이 없으면 골드·회복과 보유 무기 1레벨을 제공합니다.</p><p class="hint">1/2/3: 스킬 선택 · R: 다시 뽑기 · B: 빌드 · V: 2D/3D · M: 효과음<br>조합과 밸런스는 이 프로토타입의 자체 규칙입니다.</p>${perkCodex()}<button class="action" id="guideBack">← 로비</button>`);$('guideBack').onclick=menu;
}
function settingsMenu(){
 state='menu';show(`<div class="eyebrow">SETTINGS & SAVE</div><h1>플레이 환경</h1><div class="menu-grid"><label class="field">화질<select id="quality"><option value="low">낮음</option><option value="normal">보통</option><option value="high">높음</option></select></label><label class="field">시야<select id="zoom"><option value="0.85">넓게</option><option value="1">기본</option><option value="1.2">가까이</option></select></label><label class="field">효과음<select id="audio"><option value="off">음소거</option><option value="on">켜기</option></select></label><label class="field">화면 피격 연출<select id="shakeOption"><option value="on">켜기</option><option value="off">끄기</option></select></label></div><p class="hint">효과음은 코드 합성음입니다. 기본값은 음소거입니다.<br>V: 2D/3D · F2: 렌더링 통계 · 배경 소품은 장식이며 충돌하지 않습니다.</p><button class="action secondary" id="saveTools">저장 백업 · 가져오기</button><p class="hint">${storageAvailable?'로컬 저장 사용 중':'로컬 저장소 접근 불가'} · 전투는 5초마다·선택 화면·일시정지 때 자동 저장됩니다. 중간 저장은 이 브라우저의 현재 경로에서만 이어집니다.</p><button class="action" id="settingsBack">← 로비</button>`);
 $('quality').value=graphics.quality;$('zoom').value=String(graphics.zoom);$('audio').value=graphics.sound?'on':'off';$('shakeOption').value=graphics.shake?'on':'off';
 $('quality').onchange=e=>{graphics.quality=e.target.value;saveGraphics();refreshSettingsButtons();};$('zoom').onchange=e=>{graphics.zoom=+e.target.value;saveGraphics();};$('audio').onchange=e=>{graphics.sound=e.target.value==='on';saveGraphics();if(graphics.sound){Sound.unlock();Sound.play('upgrade');}else Sound.suspend();refreshSettingsButtons();};$('shakeOption').onchange=e=>{graphics.shake=e.target.value==='on';saveGraphics();};$('saveTools').onclick=saveMenu;$('settingsBack').onclick=menu;
}
function serializeBackup(){return JSON.stringify({format:'SurvivorArena',version:12,savedAt:new Date().toISOString(),profile},null,2);}
function parseBackup(text){
 if(typeof text!=='string'||text.length>65536)throw Error('64KB 이하의 저장 JSON만 지원합니다.');
 let obj;try{obj=JSON.parse(text);}catch(e){throw Error('JSON 형식이 올바르지 않습니다.');}
 if(!obj||obj.format!=='SurvivorArena'||![11,12].includes(obj.version)||!obj.profile||Array.isArray(obj.profile))throw Error('Survivor Arena v11/v12 백업이 아닙니다.');
 for(const k of ['gold','attack','hp','armor','wins','runs'])if(!Number.isFinite(obj.profile[k])||obj.profile[k]<0)throw Error('저장 수치가 올바르지 않습니다: '+k);
 return normalizeProfile(obj.profile);
}
function saveMenu(){
 state='menu';show(`<div class="eyebrow">LOCAL SAVE BACKUP</div><h1>내 기록을 안전하게.</h1><p>다른 파일 경로·브라우저로 옮길 때 JSON 백업을 사용하세요. 아래 텍스트를 복사해 보관하거나 파일로 저장할 수 있습니다.</p><textarea id="saveText" spellcheck="false" aria-label="저장 JSON"></textarea><div id="saveMessage" role="status"></div><div class="menu-buttons"><button class="action" id="exportSave">현재 기록 표시</button><button class="action secondary" id="downloadSave">JSON 파일 저장</button><button class="action secondary" id="importSave">붙여넣은 기록 검사</button></div><button class="action secondary" id="saveBack">← 설정</button>`);
 $('saveText').value=serializeBackup();$('exportSave').onclick=()=>{$('saveText').value=serializeBackup();$('saveMessage').textContent='현재 기록을 표시했습니다.';};
 $('downloadSave').onclick=()=>{const url=URL.createObjectURL(new Blob([serializeBackup()],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='survivor_reference_save_v14.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('importSave').onclick=()=>{try{const imported=parseBackup($('saveText').value);$('saveMessage').innerHTML=`<p>가져올 기록: ${imported.gold.toLocaleString()} G · ${imported.wins}승 · ${imported.unlocked}챕터<br><b>현재 영구 성장을 덮어쓰고, 이어하기 전투는 삭제합니다.</b></p><button class="action gold" id="confirmImport">이 기록으로 교체</button>`;$('confirmImport').onclick=()=>{dropRunSave();profile=imported;selectedHero=profile.hero;runMeta=null;saveProfile();chapter=0;toast('저장 기록을 가져왔습니다.');menu();};}catch(e){$('saveMessage').textContent=e.message;}};
 $('saveBack').onclick=settingsMenu;
}
function updateHud(force=false){
 document.body.dataset.screen=state;updateTacticalHud();updatePerkHud();
 if(!player){$('bossHUD').style.display='none';return;}
 $('hptext').textContent=Math.ceil(player.hp)+' / '+Math.ceil(player.maxHp);$('hpbar').style.width=clamp(player.hp/player.maxHp*100,0,100)+'%';$('lv').textContent=player.lv;$('kills').textContent=player.kills;$('xpfill').style.width=clamp(player.xp/player.need*100,0,100)+'%';
 $('time').textContent=fmt(elapsed);$('wave').textContent=elapsed>=300?'최종 보스 격파':chapters[chapter].name+' · 웨이브 '+(1+Math.floor(elapsed/30));
 const slots=owned('weapon'),html=slots.map(k=>`<span class="weapon-slot ${player.evolved[k]?'evolved':''}" title="${definitions[k].name} Lv.${player.levels[k]}">${definitions[k].icon}<small>${player.evolved[k]?'★':player.levels[k]}</small></span>`).join('')+Array.from({length:6-slots.length},()=>'<span class="weapon-slot empty">·</span>').join('');
 if($('loadout').innerHTML!==html)$('loadout').innerHTML=html;
 $('gold').textContent='🪙 '+player.gold;$('dashstat').textContent=dashCooldown>0?'대시 '+dashCooldown.toFixed(1)+'s':'대시 준비';$('dashbutton').textContent=dashCooldown>0?'대시\n'+dashCooldown.toFixed(1)+'s':(matchMedia('(pointer:coarse)').matches?'대시':'대시\nSPACE');$('dashbutton').style.opacity=dashCooldown>0?'.65':'1';
 const boss=enemies.filter(e=>e.type==='boss'&&e.hp>0).sort((a,b)=>(b.role==='final')-(a.role==='final'))[0];$('bossHUD').style.display=boss&&state!=='menu'?'block':'none';
 if(boss){$('bossname').textContent=(boss.role==='final'?'FINAL · ':'MID · ')+chapters[chapter].boss+(boss.phase===2?' · 분노':'');$('bossfill').style.width=clamp(boss.hp/boss.max*100,0,100)+'%';}
 const next=missions.find(m=>!missionClaims.has(m.id));$('missionHUD').innerHTML=`<span class="mission-label">현장 임무 ${missionClaims.size}/3</span> ${next?next.name+' <b>'+Math.min(next.goal,next.value())+'/'+next.goal+'</b>':'<b>모든 임무 완료 ✓</b>'}`;
 $('timelineFill').style.width=clamp(elapsed/300*100,0,100)+'%';const event=elapsed<60?'01:00 엘리트':elapsed<150?'02:30 중간 보스':elapsed<240?'04:00 엘리트':elapsed<300?'05:00 최종 보스':'보스 격파 시 클리어';$('timelineText').textContent=event;
}
function toggleView(){if(renderer3d.fallback){toast('WebGL을 사용할 수 없어 2D로 실행 중입니다.');return;}renderer3d.setMode(renderer3d.mode==='3D'?'2D':'3D');refreshSettingsButtons();toast(renderer3d.mode+' 렌더링');}
function screenPoint(x,y,z=0){return renderer3d.mode==='2D'||renderer3d.fallback?{x:W/2+x-player.x,y:H/2+y-player.y-z*.45}:renderer3d.project(x,y,z);}
function drawOverlay(){
 const is3D=renderer3d.mode==='3D'&&!renderer3d.fallback;if(is3D)ctx.clearRect(0,0,W,H);if(!player||state==='menu')return;
 drawTacticalOverlay(is3D);drawDoctrineOverlay(is3D);
 if(!is3D){
  ctx.save();ctx.translate(W/2-player.x,H/2-player.y);
  for(const h of threats){const active=h.age>=h.warn;ctx.strokeStyle=h.color;ctx.fillStyle=h.color;ctx.lineWidth=2;ctx.globalAlpha=active?.32:.14;
   if(h.shape==='line'){const dx=h.x2-h.x,dy=h.y2-h.y,len=Math.hypot(dx,dy);ctx.save();ctx.translate(h.x,h.y);ctx.rotate(Math.atan2(dy,dx));ctx.fillRect(0,-h.width/2,len,h.width);ctx.globalAlpha=.9;ctx.strokeRect(0,-h.width/2,len,h.width);ctx.restore();}
   else{const r=h.shape==='ring'&&active?h.r*clamp((h.age-h.warn)/h.duration,0,1):h.r;ctx.beginPath();ctx.arc(h.x,h.y,Math.max(1,r),0,TAU);if(h.shape==='circle')ctx.fill();ctx.globalAlpha=.9;ctx.stroke();}
  }
  ctx.globalAlpha=1;for(const d of dronePositions()){ctx.fillStyle=d.kind==='droneA'?'#7ce7ec':d.kind==='droneB'?'#ffc18c':'#ffe17d';ctx.fillRect(d.x-10,d.y-10,20,20);ctx.fillRect(d.x-19,d.y-3,38,6);}
  ctx.restore();
 }
 // Damage numbers and bars use the actual camera projection.
 for(const e of enemies){if(e.hp<=0||e.hp>=e.max)continue;const z=e.type==='boss'?(e.role==='mid'?122:158):e.type==='elite'?102:e.type==='tank'?80:62,p=screenPoint(e.x,e.y,z);if(p.x<0||p.x>W||p.y<0||p.y>H)continue;const w=e.type==='boss'?88:e.type==='elite'?52:25;ctx.fillStyle='#17344cc4';ctx.fillRect(p.x-w/2,p.y,w,4);ctx.fillStyle=e.type==='boss'?'#f99a98':'#fac181';ctx.fillRect(p.x-w/2,p.y,w*clamp(e.hp/e.max,0,1),4);}
 ctx.font='800 11px system-ui';ctx.textAlign='center';
 for(const t of texts){const p=screenPoint(t.x,t.y,64+(1-t.life/t.max)*28);ctx.globalAlpha=clamp(t.life/t.max,0,1);ctx.lineWidth=3;ctx.strokeStyle='#2b493ea0';ctx.strokeText(t.text,p.x,p.y);ctx.fillStyle=t.color;ctx.fillText(t.text,p.x,p.y);}ctx.globalAlpha=1;
 // Countdown labels for high-risk attacks; shapes remain visible in both render modes.
 for(const h of threats){if(h.age>=h.warn||h.kind==='sniper')continue;const p=screenPoint(h.shape==='line'?(h.x+h.x2)/2:h.x,h.shape==='line'?(h.y+h.y2)/2:h.y,12);if(p.x<20||p.x>W-20||p.y<90||p.y>H-85)continue;const name={charge:'돌진',mortar:'포격',laser:'레이저',shock:'충격파',summon:'소환',ice:'빙결탄',zone:'위험',elitePulse:'정예 파동'}[h.kind]||'위험';ctx.font='800 11px system-ui';ctx.lineWidth=4;ctx.strokeStyle='#4b3f53';const txt=name+' '+Math.max(0,h.warn-h.age).toFixed(1);ctx.strokeText(txt,p.x,p.y);ctx.fillStyle='#fff4c9';ctx.fillText(txt,p.x,p.y);}
 // Off-screen objective markers, clamped away from HUD and mobile controls.
 const tracked=[...enemies.filter(e=>e.hp>0&&(e.type==='boss'||e.type==='elite')).map(e=>({...e,label:e.type==='boss'?'보스':'엘리트',marker:'#d76e8e'})),...tactics.beacons.filter(b=>b.status==='active').map(b=>({...b,label:'거점',marker:'#278e9e'})),...gems.filter(g=>g.chest).map(g=>({...g,label:'보급',marker:'#dbaf5d'}))].sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y)).slice(0,4);
 for(const g of tracked){const p=screenPoint(g.x,g.y),cx=W/2,cy=H*.56;if(p.x>25&&p.x<W-25&&p.y>155&&p.y<H-100)continue;const dx=p.x-cx,dy=p.y-cy,f=Math.min((W/2-24)/Math.max(1,Math.abs(dx)),(H*.5-125)/Math.max(1,Math.abs(dy))),x=clamp(cx+dx*f,25,W-25),y=clamp(cy+dy*f,160,H-110);ctx.save();ctx.translate(x,y);ctx.rotate(Math.atan2(dy,dx));ctx.fillStyle=g.marker;ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-6,-6);ctx.lineTo(-6,6);ctx.fill();ctx.restore();ctx.font='700 9px system-ui';ctx.fillStyle='#213e51';ctx.fillText(g.label,x,y+19);}
 if(graphics.shake&&flash>0){ctx.fillStyle=`rgba(255,60,70,${flash*.24})`;ctx.fillRect(0,0,W,H);}
 if(is3D){const v=ctx.createRadialGradient(W/2,H*.55,H*.25,W/2,H*.55,Math.max(W,H)*.72);v.addColorStop(0,'#123c4c00');v.addColorStop(1,'#123c4c16');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);}
 if(elapsed<7&&state==='playing'){ctx.font='700 11px system-ui';ctx.textAlign='center';ctx.fillStyle='#173d50';ctx.fillText(matchMedia('(pointer:coarse)').matches?'드래그 이동 · 공격은 자동 · 경험치를 모으세요':'W 위 / S 아래 · 자동 공격 · B 빌드 · P 일시정지',W/2,H-121);}
}
function draw(){renderer3d.render();drawOverlay();}
let fpsSmoothed=60,frameCost=0,simAccumulator=0;
function loop(now){
 const before=performance.now(),rawDt=Math.max(0,(now-last)/1000||0);last=now;
 if(state==='playing'){simAccumulator+=Math.min(rawDt,.1);let steps=0;while(simAccumulator>=1/60&&steps<6&&state==='playing'){update(1/60);simAccumulator-=1/60;steps++;}if(state!=='playing')simAccumulator=0;}else simAccumulator=0;
 draw();fpsSmoothed=fpsSmoothed*.95+.05/Math.max(rawDt,.001);frameCost=performance.now()-before;
 if(graphics.stats)$('diagnostics').textContent=`${renderer3d.mode} · ${fpsSmoothed.toFixed(0)} frame/s\n${renderer3d.stats.instances} instances · ${renderer3d.stats.drawCalls} draws\n${enemies.length} enemies · ${shots.length} shots\n${threats.length} telegraphs · CPU ${frameCost.toFixed(1)}ms`;
 requestAnimationFrame(loop);
}
if(location.hash==='#test'){
 window.__test={
  get state(){return state;},get player(){return player;},get enemies(){return enemies;},get shots(){return shots;},get enemyShots(){return enemyShots;},get gems(){return gems;},get profile(){return profile;},get areas(){return areas;},get graphics(){return graphics;},get chapter(){return chapter;},get threats(){return threats;},get stats(){return runStats;},get claimedMissions(){return [...missionClaims];},get definitions(){return definitions;},get time(){return elapsed;},get pending(){return pendingLevels;},get dashCooldown(){return dashCooldown;},get joy(){return joy;},get audioState(){return Sound.state;},get paid(){return paidRun;},
  get doctrine(){return doctrine;},get perkCatalog(){return perkCatalog;},choosePerk,maybeOfferPerk,perkMenu,decorateElite,tickDoctrine,slowFactor,perkIncoming,hasPerk,heroCooldown,spawnRing,
  get tactics(){return tactics;},get hero(){return activeHero;},get runId(){return runId;},get runMeta(){return runMeta;},get levelDraft(){return levelDraft;},get chestDraft(){return chestDraft;},
  setHero(k){selectedHero=k;},castHeroSkill,updateTactics,spawnBeacon,saveRun,readRunSave,restoreRun,dropRunSave,suspendRun,requestNewRun,parseRunSave,serializeRun,
  reset,menu,update,draw,updateHud,spawnEnemy,spawnBoss,fire,damage,hurt,openChest,gainXp,pause,dash,finish,bossPattern,addThreat,updateThreats,updateEnemies,updatePickups,updateWeapons,updateProjectiles,updateAreas,rebuildGrid,evolutionEligible,evolveWeapon,upgradeOptions,applyUpgrade,weaponDamage,weaponInterval,owned,mergeGear,craftGear,equippedTier,serializeBackup,parseBackup,normalizeProfile,checkMissions,buildMenu,renderer:renderer3d,
  setTime(t){elapsed=t;},setState(s){state=s;},setChapter(c){chapter=c;},setStartingWeapon(k){startingWeapon=k;},setDifficulty(d){difficulty=d;},setSpawn(t){spawnTimer=t;},disableDirector(){stageEvents.add('disabled');},enableDirector(){stageEvents.delete('disabled');},setBossStage(s){bossStage=s;if(s===4)stageEvents.add('disabled');},setKeys(...list){keys.clear();list.forEach(k=>keys.add(k));},
  clearEnemies(){for(const a of [enemies,enemyShots,shots,gems,threats,hazards,areas,texts])a.length=0;rebuildGrid();},setProfile(p){profile=normalizeProfile(p);},clearMissionClaims(){missionClaims.clear();},
  snapshot(){return {state,elapsed,x:player?.x,y:player?.y,hp:player?.hp,kills:player?.kills,enemyCount:enemies.length,shotCount:shots.length,mode:renderer3d.mode,stats:{...renderer3d.stats}};}
 };
}
