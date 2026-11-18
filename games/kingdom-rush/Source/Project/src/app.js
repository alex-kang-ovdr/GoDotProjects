/* Browser controls, accessible menus, local progression and audio. No network. */
(function () {
  'use strict';
  const D=globalThis.KR_DATA, $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v)), modeNames={campaign:'캠페인',heroic:'영웅 도전',iron:'강철 도전'}, familyNames={archer:'궁수',barracks:'병영',mage:'마법',artillery:'포병'};
  const icons={
    map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/>',
    star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
    settings:'<path d="m9 3-1 3-3 1 1 4-2 3 3 3 3-1 3 3 3-2 1-3 3-1-1-4-3-1-1-3z"/><circle cx="12" cy="11" r="3"/>',
    heart:'<path d="M20 4c-3-2-6 0-8 3-2-3-5-5-8-3-5 4 0 11 8 17C20 15 25 8 20 4Z"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-10h-5a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H9"/>',
    flag:'<path d="M5 22V3m0 1c6-4 8 4 15 0v10c-7 4-9-4-15 0"/>',
    pause:'<path d="M8 4v16M16 4v16" stroke-width="4"/>',
    play:'<path d="m8 4 12 8-12 8z"/>',
    volumeOff:'<path d="M11 4 5 9H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',
    volume:'<path d="M11 4 5 9H2v6h3l6 5zM15 7c4 2 4 8 0 10m3-13c7 4 7 12 0 16"/>',
    expand:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    hammer:'<path d="m8 4 5-2 8 8-4 4-5-5-8 12-3-3 9-11z"/>',
    soldiers:'<path d="M2 21v-5l5-3 5 3v5M12 18l6-5 4 3v5M3 6l4-3 4 3v4l-4 3-4-3zM15 6l3-2 3 2v4l-3 3-3-3z"/>',
    flame:'<path d="M12 2c1 7 5 5 4 10 4-1 3-4 3-4 7 10 0 15-7 14C1 21 1 12 6 8c0 4 3 4 3 4-2-5 2-8 3-10Z"/><path d="M11 13c-5 6-1 9 3 7 3-2 0-5 0-5 0 3-2 2-3-2Z"/>',
    restart:'<path d="M3 10a9 9 0 1 1 1 9M3 3v7h7"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9 8c0-3 6-3 6 0 0 2-3 2-3 5m0 3v1"/>',
    target:'<circle cx="12" cy="12" r="7"/><path d="M12 1v7m0 8v7M1 12h7m8 0h7"/>',
    arrow:'<path d="M3 12h17m-6-7 7 7-7 7"/>',
    trash:'<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
    sword:'<path d="m4 21 6-6m-5-3 7 7m-4-7 10-10h4v4L12 16z"/>',
    shield:'<path d="M3 4h18v9c-1 5-5 8-9 10-4-2-8-5-9-10zM8 12l3 3 6-7"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>'
  };
  const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.star}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  function towerIcon(def) {
    const f=def.family,t=def.tier||1,c=f==='archer'?'#89aa57':f==='barracks'?'#6b8eaa':f==='mage'?'#9981c5':'#b48353';
    let art='';
    if(f==='archer')art=`<path d="M21 57V29h29v28" fill="#b0a480"/><path d="M18 31V18h7v5h6v-5h7v5h6v-5h8v13z" fill="#d0c197"/><path d="M18 31h35v5H18z" fill="${c}"/><path d="M29 41h8v16h-8z" fill="#39443c"/><path d="m43 28 9-13m-9 0c8 0 12 9 8 15m-8-15 8 15" fill="none" stroke="#ddc68b" stroke-width="2"/>`;
    if(f==='barracks')art=`<path d="M12 37h48v23H12z" fill="#b5ac8c"/><path d="M7 38 22 15h28l15 23z" fill="${c}"/><path d="m22 15 14 23h29L50 15z" fill="#47677b"/><path d="M29 44q7-7 14 0v16H29z" fill="#344740"/><path d="M17 44h6v9h-6zM49 44h6v9h-6z" fill="#d4bf7f"/><path d="M37 13V2l15 5-15 5" fill="#d3b765" stroke="#5b6351" stroke-width="1.5"/>`;
    if(f==='mage')art=`<path d="M23 60 26 27h20l4 33" fill="#a0a6a8"/><path d="m19 28 17-22 17 22z" fill="${c}"/><path d="m36 5 6 15-6 4-6-4z" fill="#c1dff2"/><path d="M31 37q5-7 10 0v9H31z" fill="#a0d9e6"/><path d="M21 48h29v5H21z" fill="#8274a0"/><circle cx="36" cy="10" r="4" fill="#c2f6ef"/>`;
    if(f==='artillery')art=`<path d="M12 57V38l10-10h28l12 10v19z" fill="#a89d7b"/><ellipse cx="36" cy="45" rx="25" ry="13" fill="#6e7873"/><path d="m25 44 8-26 14 3-4 27z" fill="#5e6d69"/><ellipse cx="40" cy="20" rx="8" ry="5" fill="#a5b0a1"/><ellipse cx="40" cy="20" rx="5" ry="3" fill="#253c35"/><path d="M16 52v7m40-7v7" stroke="#655946" stroke-width="6"/>`;
    const stars=t>1?`<text x="36" y="66" text-anchor="middle" fill="#f6d483" font-size="8" letter-spacing="2">${'◆'.repeat(t-1)}</text>`:'';
    return `<svg class="tower-icon" viewBox="0 0 72 70" aria-hidden="true"><ellipse cx="36" cy="60" rx="29" ry="6" fill="#0b1d1d66"/>${art}${stars}</svg>`;
  }
  const SAVE_KEY='kr_frontier_v15_progress';
  const defaultSave=()=>({version:15,best:{},upgrades:{archer:0,barracks:0,mage:0,artillery:0,meteor:0,reinforcements:0},settings:{difficulty:'normal',sound:false,speed:1},tutorial:false});
  let save=defaultSave(),storageOK=true;
  try {const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');if(s&&s.version===15){save.best=s.best&&typeof s.best==='object'?s.best:{};for(const k in save.upgrades)save.upgrades[k]=clamp(Math.floor(Number(s.upgrades?.[k])||0),0,3);save.settings={...save.settings,...s.settings};save.tutorial=!!s.tutorial;}}catch(e){storageOK=false;}
  if(!['casual','normal','veteran'].includes(save.settings.difficulty))save.settings.difficulty='normal';
  if(![.75,1,1.5,2].includes(save.settings.speed))save.settings.speed=1;
  function persist(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(save));storageOK=true;}catch(e){storageOK=false;}$('saveStatus').textContent=storageOK?'활성화':'현재 세션만';}
  function earnedStars(){return Object.values(save.best).reduce((n,v)=>n+clamp(Number(v.stars)||0,0,3),0);}
  function spentStars(){return Object.values(save.upgrades).reduce((n,r)=>n+r*(r+1)/2,0);}
  const canvas=$('battleCanvas'), renderer=new KRRenderer(canvas,D);
  const ui={selectedSite:null,selectedTowerId:null,placementMode:null,pointer:null,selectedHero:false,selectedEnemyId:null};
  let world,paused=false,modalKind=null,modalPriorFocus=null,finished=false,acc=0,last=0,lastUI=0,selectionKey='',nextKey='',speed=save.settings.speed,sound=!!save.settings.sound;
  let mapStage=D.stages[0].id,mapMode='campaign',audioCtx=null,ambienceAt=0,toastAt=0;
  function tone(freq,dur=.06,type='sine',gain=.035,slide=0){
    if(!sound)return;
    try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),audioCtx.currentTime+dur);g.gain.setValueAtTime(gain,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch(e){}
  }
  function notify(text,warn=false){if(!text)return;const el=document.createElement('div');el.className='toast'+(warn?' warn':'');el.textContent=text;$('toasts').append(el);setTimeout(()=>el.remove(),2800);while($('toasts').children.length>3)$('toasts').firstChild.remove();}
  function command(result,quiet=false){if(result?.ok){if(!quiet)notify(result.message);tone(520,.07,'triangle',.035,140);selectionKey='';refresh(true);}else{notify(result?.message||'지금은 사용할 수 없습니다.',true);tone(160,.1,'triangle',.03,-40);}return !!result?.ok;}
  function startStage(id,mode='campaign'){
    closeModal();world=new KRWorld(D,id,{mode,difficulty:save.settings.difficulty,upgrades:{...save.upgrades},seed:15137});
    paused=false;finished=false;acc=0;selectionKey='';nextKey='';Object.assign(ui,{selectedSite:null,selectedTowerId:null,placementMode:null,pointer:null,selectedHero:false,selectedEnemyId:null});
    mapStage=world.stage.id;mapMode=mode;
    $('stageName').textContent=world.stage.nameKo;$('stageEyebrow').textContent=`${mode==='campaign'?'CAMPAIGN':mode==='heroic'?'HEROIC CHALLENGE':'IRON CHALLENGE'} · ${String(world.stage.order).padStart(2,'0')}`;
    $('heroLabel').textContent='아렌 · 왕국의 수호자';$('tutorialHint').classList.toggle('hidden',save.tutorial||world.stage.order!==1);$('pauseOverlay').classList.add('hidden');
    updateTarget();refresh(true);renderer.resize();
  }
  function chooseSite(i){ui.selectedSite=i;ui.selectedTowerId=world.towers.find(t=>t.siteIndex===i)?.id??null;ui.selectedHero=false;ui.selectedEnemyId=null;selectionKey='';refresh(true);tone(380,.035,'triangle',.02);}
  function selectTarget(mode){
    if(finished)return;
    if(ui.placementMode===mode){cancelTarget();return;}
    if(['meteor','reinforcements'].includes(mode)){
      if(world.state!=='playing'){notify('먼저 웨이브를 시작하세요.',true);return;}
      if(world.spells[mode].remaining>0){notify('스킬이 충전 중입니다.',true);return;}
    }
    ui.placementMode=mode;ui.selectedHero=mode==='hero';updateTarget();tone(600,.06,'sine');
  }
  function cancelTarget(){ui.placementMode=null;ui.selectedHero=false;updateTarget();}
  function updateTarget(){const mode=ui.placementMode;$('targetBanner').classList.toggle('hidden',!mode);$('targetText').textContent=({meteor:'불의 비를 내릴 위치를 선택하세요',reinforcements:'길 위에 지원군을 배치하세요',hero:'아렌이 이동할 위치를 선택하세요',rally:'병영 가까운 길에 집결 지점을 지정하세요'})[mode]||'';canvas.style.cursor=mode?'crosshair':'default';$('heroBtn').classList.toggle('selected',mode==='hero');$('reinforceBtn').classList.toggle('selected',mode==='reinforcements');$('meteorBtn').classList.toggle('selected',mode==='meteor');}
  function pointFromEvent(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*1000,y:(e.clientY-r.top)/r.height*620};}
  let pointerDown=null;
  canvas.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY};canvas.focus({preventScroll:true});});
  canvas.addEventListener('pointermove',e=>{ui.pointer=pointFromEvent(e);});
  canvas.addEventListener('pointerleave',()=>{ui.pointer=null;$('floatTip').classList.add('hidden');});
  canvas.addEventListener('pointerup',e=>{
    if(!pointerDown||Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>14)return;pointerDown=null;
    if(paused||modalKind||finished)return;const p=pointFromEvent(e);ui.pointer=p;
    if(ui.placementMode){let result;
      if(ui.placementMode==='hero')result=world.moveHero(p.x,p.y);
      else if(ui.placementMode==='rally')result=world.setRally(ui.selectedTowerId,p.x,p.y);
      else result=world.cast(ui.placementMode,p.x,p.y);
      if(command(result,true)){if(ui.placementMode==='meteor')tone(100,.5,'sawtooth',.025,-70);cancelTarget();}return;
    }
    const bodyTower=[...world.towers].reverse().find(t=>Math.abs(t.x-p.x)<38&&p.y>t.y-88&&p.y<t.y+22);
    if(bodyTower){chooseSite(bodyTower.siteIndex);return;}
    let best=-1,dist=42;world.stage.sites.forEach((s,i)=>{let d=Math.hypot(s.x-p.x,s.y-p.y);if(d<dist){best=i;dist=d;}});if(best>=0){chooseSite(best);return;}
    const enemy=world.enemies.filter(x=>!x.dead).find(x=>Math.hypot(x.x-p.x,x.y-(x.air?35:x.boss?35:12)-p.y)<(x.boss?45:25));
    if(enemy){if((enemy.sheep||enemy.polymorphed)&&typeof world.tapEnemy==='function')command(world.tapEnemy(enemy.id),true);else{ui.selectedEnemyId=enemy.id;ui.selectedSite=null;ui.selectedTowerId=null;selectionKey='';refresh(true);}return;}
    if(world.hero.hp>0&&Math.hypot(world.hero.x-p.x,world.hero.y-p.y)<30){selectTarget('hero');return;}
    ui.selectedSite=null;ui.selectedTowerId=null;ui.selectedEnemyId=null;selectionKey='';refresh(true);
  });
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();cancelTarget();});
  function title(eyebrow,name,sub){$('panelEyebrow').textContent=eyebrow;$('panelTitle').textContent=name;$('panelSubtitle').textContent=sub;}
  function selectionHTML(){
    const enemy=world.enemies.find(e=>e.id===ui.selectedEnemyId&&!e.dead);
    if(enemy){const d=D.enemies[enemy.defId];title(enemy.boss?'BOSS ENCOUNTER':'ENEMY INTELLIGENCE',d.nameKo||d.name,enemy.air?'공중 · 지상 병력으로 저지할 수 없음':'지상 · 경로를 따라 진격');return`<div class="tower-detail"><div class="tower-stats"><span>체력 <b>${Math.ceil(enemy.hp)} / ${Math.ceil(enemy.maxHp)}</b></span><span>물리 방어 <b>${Math.round(enemy.armor*100)}%</b></span><span>마법 저항 <b>${Math.round(enemy.resist*100)}%</b></span><span>처치 보상 <b>${d.gold} G</b></span></div></div><p class="source-note">${enemy.armor>.3?'마법 타워로 높은 물리 방어를 공략하세요.':enemy.resist>.3?'궁수와 포병으로 마법 저항을 돌파하세요.':enemy.air?'궁수와 마법 타워로 공중 경로를 방어하세요.':'병영과 지원군으로 적을 붙잡고 타워의 공격을 집중하세요.'}</p><button class="secondary-btn" data-action="deselect">건설 메뉴</button>`;}
    if(ui.selectedEnemyId)ui.selectedEnemyId=null;
    const t=world.towers.find(t=>t.id===ui.selectedTowerId);
    if(!t){
      const picked=ui.selectedSite!==null;title('BUILD YOUR DEFENSE',picked?`건설 터 ${String(ui.selectedSite+1).padStart(2,'0')}`:'방어선 구축',picked?'이곳에 세울 타워를 선택하세요.':'길 옆의 + 건설 터를 선택하세요.');
      const info={archer:'빠른 공격 · 지상/공중',barracks:'병사 3명 · 진로 차단',mage:'마법 공격 · 방어 관통',artillery:'범위 피해 · 지상 공격'};
      return `<div class="build-grid">${Object.values(D.towers).filter(d=>d.tier===1).map(d=>{const allowed=world.modeDef.allowedFamilies?.includes(d.family)!==false;return`<button class="build-card ${picked?'':'unselected'}" data-build="${d.id}" ${(!allowed||picked&&world.gold<d.cost)?'disabled':''} title="${allowed?info[d.family]:'이 도전에서는 사용할 수 없습니다'}">${towerIcon(d)}<strong>${esc(familyNames[d.family])} ${d.family==='barracks'?'':'타워'}</strong><span class="family-tag">${info[d.family]}</span><span class="price">${icon('coin')}${d.cost}</span></button>`;}).join('')}</div><p class="build-footnote">${picked?'각 타워는 3단계를 거쳐 두 가지 전문 타워로 진화합니다.':'첫 방어선: 궁수로 길을 덮고 병영으로 적을 붙잡으세요.'}</p>`;
    }
    const d=D.towers[t.defId],rally=d.family==='barracks'||t.skills.summon_elemental;
    title(`TOWER · TIER ${d.tier}`,d.nameKo,({archer:'빠르고 정확한 원거리 공격',barracks:'전선을 지키는 왕국의 병사',mage:'단단한 방어를 깨는 마법',artillery:'밀집한 적을 무너뜨리는 화력'})[d.family]);
    const stat=d.family==='barracks'?`<span>병사 체력 <b>${d.soldierHp}</b></span><span>병사 공격 <b>${d.damageMin}–${d.damageMax}</b></span><span>재훈련 <b>${d.respawn||10}초</b></span>`:`<span>공격력 <b>${d.damageMin}–${d.damageMax}</b></span><span>공격 간격 <b>${d.interval}초</b></span><span>사거리 <b>${Math.round(world.range?world.range(t):d.range)}</b></span>`;
    return `<div class="tower-detail">${towerIcon(d)}<div class="tower-stats">${stat}</div></div>${d.upgrades.filter(id=>D.towers[id].tier<=(world.modeDef.maxTier||4)).map(id=>{const n=D.towers[id];return`<button class="upgrade-option" data-upgrade="${id}" ${world.gold<n.cost?'disabled':''}>${towerIcon(n)}<div><strong>${esc(n.nameKo)}</strong><small>${n.tier===4?'전문 타워로 진화':'타워 강화 · 단계 '+n.tier}</small></div><span class="price">${icon('coin')}${n.cost}</span></button>`;}).join('')}${(d.abilities||[]).map(id=>{const a=D.abilities[id],rank=t.skills[id]||0,max=a.maxLevel,cost=a.costs[rank];return`<button class="skill-option" data-skill="${id}" ${rank>=max||world.gold<cost?'disabled':''} title="${esc(a.description)}"><div><strong>${esc(a.nameKo)} <span class="skill-dots">${'●'.repeat(rank)}${'○'.repeat(max-rank)}</span></strong><small>${esc(a.description)}</small></div><span class="price">${rank>=max?'MAX':icon('coin')+cost}</span></button>`;}).join('')}${d.tier===4?'<div class="max-label">전문 타워 · 능력을 강화하세요</div>':''}<div class="tower-actions">${rally?`<button data-action="rally">${icon('flag')}집결 위치</button>`:''}<button class="sell-btn" data-action="sell">${icon('coin')}판매 +${Math.floor(t.invested*(world.wave? .65:1))}</button></div><p class="build-footnote">전투 전 판매 100% · 전투 중 65% 환급</p>`;
  }
  $('selectionPanel').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.build){if(ui.selectedSite===null){notify('먼저 전장의 + 건설 터를 선택하세요.');return;}if(command(world.build(ui.selectedSite,b.dataset.build))){ui.selectedTowerId=world.towers.find(t=>t.siteIndex===ui.selectedSite).id;save.tutorial=true;$('tutorialHint').classList.add('hidden');persist();selectionKey='';refresh(true);}}
    if(b.dataset.upgrade)command(world.upgrade(ui.selectedTowerId,b.dataset.upgrade));
    if(b.dataset.skill)command(world.buySkill(ui.selectedTowerId,b.dataset.skill));
    if(b.dataset.action==='rally')selectTarget('rally');
    if(b.dataset.action==='sell'){if(command(world.sell(ui.selectedTowerId))){if(ui.placementMode==='rally')cancelTarget();ui.selectedTowerId=null;selectionKey='';refresh(true);}}
    if(b.dataset.action==='deselect'){ui.selectedEnemyId=null;selectionKey='';refresh(true);}
  });
  function refresh(force=false){
    if(!world)return;
    $('goldValue').textContent=Math.floor(world.gold).toLocaleString();$('livesValue').textContent=Math.max(0,world.lives);$('waveValue').textContent=`${world.wave} / ${world.totalWaves}`;
    $('mapStatus').textContent=world.state==='ready'?'방어선 준비':world.state==='won'?'왕국을 지켜냈습니다':world.state==='lost'?'방어선 붕괴':`전투 중 · ${world.enemies.filter(e=>!e.dead).length}기 진격`;
    $('speedBtn').textContent=speed+'×';$('pauseBtn').innerHTML=icon(paused?'play':'pause');$('pauseBtn').setAttribute('aria-label',paused?'계속하기':'일시정지');$('soundBtn').innerHTML=icon(sound?'volume':'volumeOff');$('soundBtn').setAttribute('aria-label',sound?'소리 끄기':'소리 켜기');
    $('heroHealth').style.width=clamp(world.hero.hp/world.hero.maxHp*100,0,100)+'%';$('heroLevel').textContent='LV '+world.hero.level;
    $('heroState').textContent=world.hero.hp<=0?`회복 중 · ${Math.ceil(Math.max(0,world.hero.deadUntil-world.time))}초`:`체력 ${Math.ceil(world.hero.hp)} / ${Math.ceil(world.hero.maxHp)}`;
    $('heroBtn').disabled=world.hero.hp<=0||finished;
    for(const [id,short]of[['reinforcements','reinforce'],['meteor','meteor']]){const s=world.spells[id];$(short+'State').textContent=s.remaining>.1?`${Math.ceil(s.remaining)}초`:'준비 완료';$(short+'Shade').style.height=clamp(s.remaining/s.total*100,0,100)+'%';$(short+'Btn').disabled=s.remaining>.1||finished;}
    const tower=world.towers.find(t=>t.id===ui.selectedTowerId),enemy=world.enemies.find(e=>e.id===ui.selectedEnemyId&&!e.dead);
    const key=[ui.selectedSite,ui.selectedTowerId,world.gold,tower?.defId,JSON.stringify(tower?.skills),enemy?.id,enemy?Math.ceil(enemy.hp):'',world.wave===0,world.state].join('|');
    if(force||selectionKey!==key){selectionKey=key;$('selectionPanel').innerHTML=selectionHTML();}
    const next=world.waveDefs[Math.min(world.wave,world.totalWaves-1)]||[];
    const nk=world.stage.id+world.mode+world.wave;
    if(force||nextKey!==nk){nextKey=nk;$('nextWaveNumber').textContent=world.wave>=world.totalWaves?'FINAL WAVE':`WAVE ${String(world.wave+1).padStart(2,'0')}`;const totals={};for(const g of next)totals[g.enemy]=(totals[g.enemy]||0)+g.count;$('nextEnemies').innerHTML=Object.entries(totals).map(([id,n])=>`<span class="enemy-chip ${D.enemies[id]?.air?'air':''}" title="${esc(D.enemies[id]?.name||id)}">${esc(D.enemies[id]?.nameKo||id)}<b>${n}</b></span>`).join('');}
    const final=world.wave>=world.totalWaves;
    $('waveBtn').disabled=finished||!world.canCallWave||final;
    $('waveButtonLabel').textContent=world.wave===0?'전투 시작':final?'마지막 방어전':'다음 웨이브 호출';
    $('waveButtonSub').textContent=world.wave===0?'준비가 되면 출발하세요':final?'남은 적을 모두 처치하세요':world.canCallWave?`조기 호출 +${Math.floor(world.nextWaveIn*.65)} 골드`:'적이 진입하고 있습니다';
    $('waveTip').textContent=world.wave===0?'배치를 마치면 첫 웨이브를 시작하세요.':final?'끝까지 버티세요. 마지막 적까지 막으면 승리합니다.':`다음 공격까지 ${Math.ceil(Math.max(0,world.nextWaveIn))}초 · 조기 호출하면 골드와 스킬 충전을 얻습니다.`;
    while(world.notifications?.length){const message=world.notifications.shift();if(world.state!=='ready')notify(message);}
    if(world.result&&!finished){finished=true;cancelTarget();if(world.result.won&&!world.result.cheated){const k=world.stage.id+':'+world.mode,old=save.best[k]||{};save.best[k]={stars:Math.max(old.stars||0,world.result.stars),bestKills:Math.max(old.bestKills||0,world.result.kills)};persist();}setTimeout(()=>{if(finished)openResult();},650);}
  }
  function togglePause(value){if(finished)return;paused=value===undefined?!paused:!!value;acc=0;$('pauseOverlay').classList.toggle('hidden',!paused);refresh(true);}
  function openModal(kind,html,compact=false){modalKind=kind;acc=0;if(!modalPriorFocus)modalPriorFocus=document.activeElement;$('modalRoot').innerHTML=`<div class="modal ${compact?'compact':''}">${html}</div>`;$('modalRoot').classList.remove('hidden');$('modalRoot').setAttribute('aria-label',({campaign:'원정 지도',settings:'설정',upgrades:'왕국 강화',help:'플레이 가이드',data:'구현 및 데이터 안내',result:'전투 결과',restart:'다시 시작'})[kind]||'게임 메뉴');document.body.style.overflow='hidden';setTimeout(()=>$('modalRoot').querySelector('button,select')?.focus({preventScroll:true}),0);}
  function closeModal(){if(!modalKind)return;modalKind=null;$('modalRoot').classList.add('hidden');$('modalRoot').innerHTML='';document.body.style.overflow='';acc=0;modalPriorFocus?.focus?.({preventScroll:true});modalPriorFocus=null;}
  const heading=(tag,name,sub='')=>`<div class="modal-head"><div><span class="eyebrow">${tag}</span><h2>${name}</h2>${sub?`<p>${sub}</p>`:''}</div><button class="close-btn" data-modal="close" aria-label="닫기">×</button></div>`;
  function mapArt(s){const snow=s.biome==='snow',ash=s.biome==='ash',base=snow?'#a7babe':ash?'#6a6352':'#789759',path=snow?'#d6d4bd':ash?'#97866a':'#c8b37e',tree=snow?'#5e8279':ash?'#4f5545':'#456e42';const paths=s.paths.map(p=>`<polyline points="${p.map(x=>x.join(',')).join(' ')}" fill="none" stroke="${path}" stroke-width="37" stroke-linejoin="round"/>`).join('');return `<svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice"><rect width="1000" height="620" fill="${base}"/>${paths}${s.sites.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="20" fill="#dbd1ae" stroke="#776e4f" stroke-width="5"/>`).join('')}<path d="M60 410 10 510h100zm100-370-45 100h90zM470 35l-45 100h90zM740 480l-50 110h100zM900 20l-45 90h90z" fill="${tree}"/></svg>`;}
  function campaign(){
    const st=D.stages.find(s=>s.id===mapStage)||D.stages[0];
    openModal('campaign',heading('THE KINGDOM AWAITS','왕국의 방어선','숲을 지나 설원과 잿빛 황무지까지. 다음 전장을 선택하세요.')+`<div class="campaign-cards">${D.stages.map(s=>{const stars=save.best[s.id+':'+mapMode]?.stars||0;return`<button class="stage-card ${s.id===mapStage?'selected':''}" data-stage="${s.id}"><div class="stage-art">${mapArt(s)}<span class="stage-index">${String(s.order).padStart(2,'0')}</span></div><strong>${esc(s.nameKo)}</strong><span class="stars ${stars?'':'empty'}">${'★'.repeat(stars)}${'☆'.repeat((mapMode==='campaign'?3:1)-Math.min(stars,mapMode==='campaign'?3:1))}</span></button>`;}).join('')}</div><div class="campaign-bottom"><div><div class="mode-options">${Object.entries(modeNames).map(([id,n])=>`<button data-mode="${id}" class="${id===mapMode?'active':''}">${n}</button>`).join('')}</div><p style="font-size:10px;margin:8px 0 0">${mapMode==='campaign'?'20 생명 · 3별에 도전하세요':mapMode==='heroic'?'1 생명 · 6개의 압축 웨이브':'1 생명 · 제한된 타워와 하나의 대규모 웨이브'} · ${st.waves[mapMode].length} 웨이브</p></div><button class="primary-btn" data-modal="start">${esc(st.nameKo)} 출전 ${icon('arrow')}</button></div>`);
  }
  const permanentDescriptions={archer:'궁수 공격력 +5.5%, 사거리 +2.5% / 단계',barracks:'병사 체력 +6%, 방어 +2.5%p / 단계',mage:'마법 공격력 +5.5%, 사거리 +2.5% / 단계',artillery:'포병 공격력 +5.5%, 사거리 +2.5% / 단계',meteor:'유성 피해 +24, 범위 +3 / 단계 · 3단계에 유성 추가',reinforcements:'지원군 체력 +32, 공격 +3 / 단계 · 3단계에 원거리 공격'};
  function upgrades(){const available=earnedStars()-spentStars();openModal('upgrades',heading('POWER OF THE KINGDOM','왕국 강화',`사용 가능한 별 <b class="star-total">★ ${available}</b> &nbsp; / &nbsp; 획득한 별 ${earnedStars()}`)+`<div class="upgrades-grid">${Object.keys(save.upgrades).map(k=>{const r=save.upgrades[k],name=familyNames[k]||({meteor:'불의 비',reinforcements:'지원군'})[k];return`<div class="kingdom-upgrade"><strong>${name}</strong><span class="ranks">${'◆'.repeat(r)}${'◇'.repeat(3-r)}</span><p>${permanentDescriptions[k]}</p><button data-permanent="${k}" ${r>=3||available<r+1?'disabled':''}>${r>=3?'최대 강화':`강화하기 · ★ ${r+1}`}</button></div>`;}).join('')}</div><p class="source-note">강화는 다음 전투부터 적용됩니다. 각 전장의 최고 별 기록이 누적되며, 별은 무료로 다시 배분할 수 있습니다.</p><button class="secondary-btn" data-modal="reset-upgrades">강화 초기화 · 별 돌려받기</button>`);}
  function settings(){openModal('settings',heading('MAKE IT YOURS','게임 설정','전투 중 메뉴를 열면 시간이 멈춥니다.')+`<div class="settings-row"><div><strong>난이도</strong><small>다음 전투부터 적용</small></div><select id="difficultySelect" aria-label="난이도"><option value="casual" ${save.settings.difficulty==='casual'?'selected':''}>캐주얼</option><option value="normal" ${save.settings.difficulty==='normal'?'selected':''}>일반</option><option value="veteran" ${save.settings.difficulty==='veteran'?'selected':''}>베테랑</option></select></div><div class="settings-row"><div><strong>효과음</strong><small>간단한 합성 전투 효과음</small></div><button class="toggle-btn ${sound?'on':''}" data-modal="sound">${sound?'켜짐':'꺼짐'}</button></div><div class="settings-row"><div><strong>전투 속도</strong><small>0.75× · 1× · 1.5× · 2×</small></div><button class="toggle-btn" data-modal="speed">${speed}×</button></div><div class="settings-row"><div><strong>저장된 원정</strong><small>최고 별 기록과 설정을 이 브라우저에 저장</small></div><span class="star-total">★ ${earnedStars()}</span></div><details style="margin-top:20px"><summary style="cursor:pointer;font-size:12px;color:#c9b089">실험실 · 전투 테스트 도구</summary><p style="font-size:11px">적용한 전투는 별 기록에 포함되지 않습니다.</p><div class="cheat-grid"><button data-cheat="gold">+1,000 골드</button><button data-cheat="cooldowns">스킬 충전</button><button data-cheat="invincible">성문 무적 ${world.invincible?'해제':'켜기'}</button><button data-cheat="clear">현재 적 처치</button></div></details>`,true);}
  function help(){openModal('help',heading('FIELD MANUAL','전장의 지휘관에게','배치, 저지, 집중 공격. 세 가지를 기억하세요.')+`<div class="help-grid"><div class="help-card"><b>01 · 방어선 구축</b><p>길 옆의 + 건설 터를 누른 뒤 오른쪽 패널에서 타워를 고릅니다. 첫 웨이브 전에는 타워 판매 시 전액을 돌려받습니다.</p></div><div class="help-card"><b>02 · 적에 맞춘 조합</b><p>궁수는 빠르게 공격하고, 마법은 물리 방어를 무시합니다. 포병은 지상 범위 피해를 주며, 병영은 적을 붙잡습니다.</p></div><div class="help-card"><b>03 · 전술 지휘</b><p>영웅을 선택하고 이동할 곳을 누르세요. 병영을 선택하면 집결 위치를 옮길 수 있습니다. 지원군과 불의 비로 빈틈을 메우세요.</p></div><div class="help-card"><b>04 · 전문 타워와 별</b><p>타워를 강화해 두 전문 계열 중 하나로 진화시키세요. 스킬을 구매하면 자동 사용합니다. 승리로 얻은 별로 다음 전투를 강화하세요.</p></div></div><table class="key-table"><tr><td><kbd>1</kbd> / <kbd>2</kbd></td><td>지원군 / 불의 비 → 전장 클릭</td></tr><tr><td><kbd>H</kbd></td><td>영웅 선택 → 이동 위치 클릭</td></tr><tr><td><kbd>N</kbd></td><td>첫 웨이브 시작 / 다음 웨이브 조기 호출</td></tr><tr><td><kbd>Space</kbd> / <kbd>P</kbd></td><td>일시정지 / 재개</td></tr><tr><td><kbd>F</kbd></td><td>전투 배속 변경</td></tr><tr><td><kbd>Esc</kbd> / 우클릭</td><td>선택 취소 · 메뉴 닫기</td></tr></table><p class="source-note">모바일에서는 모든 기능을 터치 버튼으로 사용할 수 있습니다. 앱을 닫으면 전투는 초기화되며, 최고 별 기록·강화·설정은 저장됩니다.</p>`);}
  function dataInfo(){openModal('data',heading('ABOUT THIS BUILD','구현·데이터 안내','Kingdom Rush v14 복원 자료 기반 · 독립적인 웹 플레이 구현')+`<p>12개 스테이지의 260개 웨이브 슬롯, 적 34종(보스 3종 포함), 타워 20종, 전문 능력 18종의 참조 데이터를 연결했습니다. 상충하는 13개 웨이브는 기록된 후보 하나를 선택했습니다.</p><p>맵 좌표, 생성 간격, 사거리, 적 이동 속도 변환, 영웅 아렌, 일부 적 행동과 보스 패턴은 이 웹 게임을 위해 작성한 규칙입니다. 원작 실행 파일의 정확한 재현이나 공식 서비스가 아닙니다.</p><p>초반 캠페인과 도전 모드에는 시작 골드 보정을 적용했고, 도전에서도 영웅과 4단계 타워를 사용할 수 있습니다. 성채 강철 도전은 원작의 사전 배치 자료가 없어 허용 타워를 보완했습니다.</p><div class="source-note">참조: 사용자가 제공한 <b>KingdomRush_Reconstructed_v14.zip</b>. 전체 선택 근거와 보완값은 소스 ZIP의 <b>data/provenance.json</b> 및 <b>data/DATA_NOTES.md</b>에 있습니다. 그래픽은 코드로 새로 그렸으며, 외부 이미지·음원·폰트 없이 실행됩니다.</div><p style="font-size:11px">Kingdom Rush 및 관련 명칭은 원 권리자에게 귀속됩니다. 이 빌드는 분석 자료를 이용한 비공식 플레이 프로토타입입니다.</p>`,true);}
  function restart(){openModal('restart',heading('A FRESH START','전투를 다시 시작할까요?')+`<p>현재 배치와 전투 진행이 초기화됩니다. 저장된 별과 왕국 강화는 유지됩니다.</p><div class="result-actions"><button class="secondary-btn" data-modal="close">전투로 돌아가기</button><button class="primary-btn" data-modal="retry">다시 시작</button></div>`,true);}
  function openResult(){const r=world.result;if(!r)return;const next=D.stages.find(s=>s.order===world.stage.order+1),mins=Math.floor(r.duration/60),secs=Math.floor(r.duration%60);openModal('result',`<div class="result"><div class="result-crest">${r.won?'♜':'◇'}</div><span class="eyebrow">${r.won?'THE KINGDOM STANDS':'THE KINGDOM NEEDS YOU'}</span><h2>${r.won?'방어 성공':'다시 일어설 시간'}</h2><p>${esc(world.stage.nameKo)} · ${modeNames[world.mode]}</p>${r.won?`<div class="result-stars">${'★'.repeat(r.stars)}${'☆'.repeat((world.mode==='campaign'?3:1)-r.stars)}</div>`:'<p>타워 배치와 집결 위치를 조정해 다시 도전하세요.</p>'}<div class="result-stats"><div><strong>${r.kills}</strong><span>처치한 적</span></div><div><strong>${Math.max(0,r.lives)}</strong><span>남은 생명</span></div><div><strong>${mins}:${String(secs).padStart(2,'0')}</strong><span>전투 시간</span></div></div>${r.cheated?'<p class="source-note">실험실을 사용한 전투입니다. 별 기록은 저장하지 않습니다.</p>':''}<div class="result-actions"><button class="secondary-btn" data-modal="campaign">원정 지도</button><button class="primary-btn" data-modal="${r.won&&next?'next':'retry'}">${r.won&&next?'다음 전장':'다시 도전'} ${icon('arrow')}</button></div></div>`,true);if(r.won){tone(520,.18,'triangle');setTimeout(()=>tone(660,.2,'triangle'),150);setTimeout(()=>tone(780,.4,'triangle'),300);}else tone(180,.7,'triangle',.035,-80);}
  $('modalRoot').addEventListener('click',e=>{
    if(e.target===$('modalRoot')&&modalKind!=='result'){closeModal();return;}const b=e.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.stage){mapStage=b.dataset.stage;campaign();return;}
    if(b.dataset.mode){mapMode=b.dataset.mode;campaign();return;}
    if(b.dataset.permanent){const k=b.dataset.permanent,r=save.upgrades[k];if(r<3&&earnedStars()-spentStars()>=r+1){save.upgrades[k]++;persist();tone(660,.12,'triangle');upgrades();}return;}
    if(b.dataset.cheat){command(world.cheat(b.dataset.cheat,b.dataset.cheat==='gold'?1000:undefined));closeModal();return;}
    const a=b.dataset.modal;
    if(a==='close')closeModal();
    if(a==='start')startStage(mapStage,mapMode);
    if(a==='campaign'){mapStage=world.stage.id;mapMode=world.mode;campaign();}
    if(a==='retry')startStage(world.stage.id,world.mode);
    if(a==='next'){const next=D.stages.find(s=>s.order===world.stage.order+1);if(next)startStage(next.id,world.mode);}
    if(a==='sound'){toggleSound();settings();}
    if(a==='speed'){cycleSpeed();settings();}
    if(a==='reset-upgrades'){for(const k in save.upgrades)save.upgrades[k]=0;persist();upgrades();notify('별을 모두 돌려받았습니다.');}
  });
  $('modalRoot').addEventListener('change',e=>{if(e.target.id==='difficultySelect'){save.settings.difficulty=e.target.value;persist();}});
  function toggleSound(){sound=!sound;save.settings.sound=sound;persist();tone(440,.15,'triangle');refresh(true);}
  function cycleSpeed(){const speeds=[.75,1,1.5,2];speed=speeds[(speeds.indexOf(speed)+1)%speeds.length];save.settings.speed=speed;persist();refresh(true);}
  function callWave(){if(!paused&&!modalKind)command(world.callWave(),true);}
  function openCampaign(){mapStage=world.stage.id;mapMode=world.mode;campaign();}
  $('campaignBtn').onclick=openCampaign;$('brandBtn').onclick=openCampaign;$('upgradesBtn').onclick=upgrades;$('settingsBtn').onclick=settings;$('helpBtn').onclick=help;$('dataInfoBtn').onclick=dataInfo;$('restartBtn').onclick=restart;
  $('waveBtn').onclick=callWave;$('heroBtn').onclick=()=>selectTarget('hero');$('reinforceBtn').onclick=()=>selectTarget('reinforcements');$('meteorBtn').onclick=()=>selectTarget('meteor');$('cancelTarget').onclick=cancelTarget;$('pauseBtn').onclick=()=>togglePause();$('resumeBtn').onclick=()=>togglePause(false);$('soundBtn').onclick=toggleSound;$('speedBtn').onclick=cycleSpeed;
  $('dismissHint').onclick=()=>{save.tutorial=true;persist();$('tutorialHint').classList.add('hidden');};
  $('fullscreenBtn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('gameApp').requestFullscreen)await $('gameApp').requestFullscreen();else notify('이 브라우저에서는 전체 화면을 지원하지 않습니다.');}catch(e){notify('전체 화면으로 전환할 수 없습니다.');}};
  document.addEventListener('keydown',e=>{
    if(modalKind){if(e.key==='Escape'&&modalKind!=='result'){e.preventDefault();closeModal();}if(e.key==='Tab'){const els=[...$('modalRoot').querySelectorAll('button:not(:disabled),select,summary,a[href]')].filter(el=>el.getClientRects().length>0);const first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}return;}
    if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
    const k=e.key.toLowerCase();if([' ','p','1','2','h','n','f','escape'].includes(k))e.preventDefault();
    if(k===' '||k==='p')togglePause();if(k==='1')selectTarget('reinforcements');if(k==='2')selectTarget('meteor');if(k==='h')selectTarget('hero');if(k==='n')callWave();if(k==='f')cycleSpeed();if(k==='escape'){if(ui.placementMode)cancelTarget();else if(ui.selectedSite!==null||ui.selectedEnemyId){ui.selectedSite=null;ui.selectedTowerId=null;ui.selectedEnemyId=null;selectionKey='';refresh(true);}else togglePause();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&world.state==='playing'&&!finished&&!modalKind)togglePause(true);last=0;acc=0;});
  window.addEventListener('resize',()=>renderer.resize());
  function frame(ms){
    const dt=last?Math.min((ms-last)/1000,.12):0;last=ms;
    if(!paused&&!modalKind&&!finished){acc+=dt*speed;let n=0;while(acc>=1/60&&n<16){world.update(1/60);acc-=1/60;n++;}}
    renderer.draw(world,ui,ms/1000);
    if(ms-lastUI>110){refresh();lastUI=ms;}
    if(sound&&world.state==='playing'&&!paused&&!modalKind&&world.projectiles.length&&ms-ambienceAt>420){tone(230+(world.projectiles.length%6)*65,.025,'triangle',.009,-80);ambienceAt=ms;}
    requestAnimationFrame(frame);
  }
  persist();startStage(D.stages[0].id);requestAnimationFrame(frame);
  globalThis.KR_APP={get world(){return world;},get ui(){return ui;},get paused(){return paused;},startStage,pause:togglePause,version:'15.0.0'};
})();
