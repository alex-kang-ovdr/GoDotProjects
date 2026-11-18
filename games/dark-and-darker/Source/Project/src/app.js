/* DOM/input/audio adapter. One input binding, one fixed-step loop, one result commit. */
(function(){
'use strict';
const R=CryptRules,C=CryptCore,{clamp,yawAxes,localPoint,sizeOf,N,TILE,lineClear,angleDelta}=C,$=id=>document.getElementById(id);
const PATHS={
 sword:'M5 20l4-4m-3-3 5 5m-3-3L19 3l2 1-1 3L10 17M4 20l1 1',dagger:'M7 20l4-6m-3-3 7 4m-5-1L18 4l1 6-6 6',axe:'M7 22L16 3M12 6l7-2 3 7-8 2M10 14l6-1',bow:'M6 3q18 9 0 18M6 3l4 9-4 9M3 12h18m-4-3 4 3-4 3',flame:'M12 2c1 6 6 6 6 12 0 4-3 7-6 7s-7-3-7-7c0-3 2-5 3-7 0 4 2 5 3 5 2-3 2-6 1-10z',armor:'M7 3l5 2 5-2 5 6-5 3v9H7v-9L2 9zM9 5l3 3 3-3',gem:'M7 3h10l5 7-10 12L2 10zM2 10h20M7 3l5 19 5-19',potion:'M9 2h6v6l4 7c3 7-17 7-14 0l4-7zM9 5h6M6 14h12',arrow:'M3 21L21 3m-6 0h6v6M3 16v5h5',relic:'M5 4h14v16H5zM8 7h8v10H8zM5 4L3 2m16 2 2-2M5 20l-2 2m16-2 2 2',crown:'M3 7l5 5 4-9 4 9 5-5-2 12H5zM5 16h14',chalice:'M6 3h12v6a6 6 0 01-12 0zM12 15v6m-4 0h8',shield:'M4 4l8-2 8 2v8c0 5-8 10-8 10S4 17 4 12zM12 5v14'};
function icon(name){return`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]||PATHS.gem}"/></svg>`}
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));
let renderer;
try{renderer=new CryptRender.Renderer($('gl'))}catch(e){$('fatalMessage').textContent=e.message;$('fatal').hidden=false;return}
const game=new CryptGame.Game();
let keys={},inventoryOpen=false,spellWheelOpen=false,spellWheelKeyboard=false,spellSource='touch',selected=null,inventoryDirty=false,debugOpen=false,debugGeometry=false,toastUntil=0,hitUntil=0,flashUntil=0,guardUntil=0,autoStep=true,autoRender=true,rafId=0,frames=0,last=performance.now(),acc=0,uiTimer=0,footstep=0,pointerFallback=false,expectedUnlock=false;
const settings={fov:75,sensitivity:.0023,audio:true,bob:false,keyboardLook:false};
let touch=null,mousePrimary=false,mouseSecondary=false,storageAvailable=true;
function resetInput(){
 keys={};mousePrimary=false;mouseSecondary=false;game.cancelInputs();touch?.reset();
 if(game.action&&['container','exit'].includes(game.action.kind))game.cancelAction();
}
let savedProfile=null,legacyProfile=null;
try{
 savedProfile=localStorage.getItem('crypt_v15_profile');legacyProfile=localStorage.getItem('crypt_v13_save');
 if(!legacyProfile){const old=Number(localStorage.getItem('crypt_v3_gold')||0);legacyProfile={schema:13,gold:Number.isSafeInteger(old)&&old>=0?old:0,runs:0,escapes:0}}
 localStorage.setItem('crypt_v15_probe','1');localStorage.removeItem('crypt_v15_probe');
}catch(_){storageAvailable=false}
const profile=new CryptProgress.Profile(savedProfile,legacyProfile);
function saveBank(){try{localStorage.setItem('crypt_v15_profile',JSON.stringify(profile.serialize()))}catch(_){storageAvailable=false}updateBank()}
function updateBank(){
 $('bankGold').textContent=profile.gold+' G';$('bankRuns').textContent=profile.runs;$('bankEscapes').textContent=profile.escapes;
 $('storageNotice').textContent=storageAvailable?(profile.interruptedRuns?'중단된 출전 '+profile.interruptedRuns+'회를 손실 처리했습니다.':''):'이 브라우저에서는 저장이 제한됩니다. 장비와 골드는 현재 탭에서만 유지됩니다.';
}
saveBank();
class Sound{
 constructor(){this.ctx=null}
 init(){if(!settings.audio)return;try{this.ctx=this.ctx||new(window.AudioContext||window.webkitAudioContext)();this.ctx.resume().catch(()=>{})}catch(_){}}
 play(name){if(!this.ctx||!settings.audio||this.ctx.state!=='running')return;const c=this.ctx,t=c.currentTime,osc=c.createOscillator(),gain=c.createGain();const params={swing:[130,55,.10,.027,'triangle'],hit:[180,52,.09,.055,'square'],hurt:[95,40,.20,.065,'sawtooth'],block:[960,300,.21,.055,'triangle'],bow:[440,120,.10,.025,'triangle'],magic:[190,650,.30,.025,'sine'],heal:[480,800,.40,.028,'sine'],loot:[660,990,.15,.03,'triangle'],step:[75,45,.07,.018,'triangle']}[name]||[200,100,.1,.02,'sine'];osc.type=params[4];osc.frequency.setValueAtTime(params[0],t);osc.frequency.exponentialRampToValueAtTime(params[1],t+params[2]);gain.gain.setValueAtTime(.0001,t);gain.gain.linearRampToValueAtTime(params[3],t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+params[2]);osc.connect(gain);gain.connect(c.destination);osc.start(t);osc.stop(t+params[2]+.03);osc.onended=()=>{osc.disconnect();gain.disconnect()}}
}
const sound=new Sound();
function toast(text,duration=2){$('toast').textContent=text;toastUntil=performance.now()+duration*1000}
function releasePointer(){
 resetInput();if(document.pointerLockElement){expectedUnlock=true;document.exitPointerLock?.()}touch?.sync();
}
async function capture(){
 if(touch?.enabled||!game.running||game.paused||inventoryOpen||spellWheelOpen||document.pointerLockElement===$('gl'))return;
 try{const result=$('gl').requestPointerLock?.();if(result&&result.catch)await result;pointerFallback=!document.pointerLockElement}
 catch(_){pointerFallback=true}
 if(pointerFallback)$('captureHint').textContent='마우스 잠금 제한 · 방향키 시점 보조 사용 가능';
}
function input(){
 if(!game.running||inventoryOpen||spellWheelOpen||game.paused||game.ended)return{};
 const keyboardLook=settings.keyboardLook||(!touch?.enabled&&pointerFallback);
 return{
  forward:clamp((keys.KeyW?1:0)-(keys.KeyS?1:0)+(touch?.forward||0),-1,1),
  strafe:clamp((keys.KeyD?1:0)-(keys.KeyA?1:0)+(touch?.strafe||0),-1,1),
  walk:!!(keys.ShiftLeft||keys.ShiftRight||touch?.held('walk')),
  crouch:!!(keys.ControlLeft||keys.ControlRight||touch?.held('crouch')),
  jump:!!(keys.Space||touch?.held('jump')),
  interact:!!(keys.KeyF||touch?.held('interact')),
  lookX:keyboardLook?(keys.ArrowRight?1:0)-(keys.ArrowLeft?1:0):0,
  lookY:keyboardLook?(keys.ArrowUp?1:0)-(keys.ArrowDown?1:0):0
 };
}
function closeSpellWheel(recapture=true){
 spellWheelOpen=false;spellWheelKeyboard=false;$('spellWheel').hidden=true;resetInput();touch?.sync();if(recapture)capture();
}
function openSpellWheel(fromKeyboard=false){
 if(game.classId!=='wizard'||!game.running||game.paused||inventoryOpen)return;
 spellWheelOpen=true;spellWheelKeyboard=fromKeyboard;$('spellWheel').hidden=false;releasePointer();
 const list=$('spellChoices');list.replaceChildren();
 game.spellInfo().forEach((sp,i)=>{
  const b=document.createElement('button');b.type='button';b.className='spellChoice'+(sp.selected?' active':'');b.dataset.spell=sp.id;
  b.innerHTML=icon(sp.id==='icebolt'?'gem':sp.id==='zap'?'relic':'flame');
  const title=document.createElement('b');title.textContent=sp.name;
  const info=document.createElement('small');info.textContent=`${i+1} · ${sp.remaining}/${sp.charges}회 · ${sp.castTime}초`;
  b.append(title,info);
  const choose=()=>{game.selectSpell(sp.id);list.querySelectorAll('button').forEach(el=>el.classList.toggle('active',el===b))};
  b.addEventListener('pointerenter',()=>{if(spellWheelKeyboard)choose()});
  b.onclick=()=>{choose();closeSpellWheel()};list.appendChild(b);
 });
 touch?.sync();
}
function setInventory(open){
 if(spellWheelOpen)closeSpellWheel(false);
 inventoryOpen=!!open&&game.running&&!game.paused;$('inventoryPanel').hidden=!inventoryOpen;resetInput();game.cancelAction();touch?.sync();
 if(inventoryOpen){releasePointer();renderInventory()}else{game.openContainer=null;selected=null;if(game.running&&!game.paused)capture()}
}
function pauseGame(){
 if(!game.running)return;if(spellWheelOpen)closeSpellWheel(false);game.paused=true;inventoryOpen=false;
 $('inventoryPanel').hidden=true;$('pause').hidden=false;releasePointer();
}
function resumeGame(){resetInput();game.paused=false;$('pause').hidden=true;acc=0;touch?.sync();capture()}
function chosenClass(){return R.classes[$('classSelect').value]?$('classSelect').value:'fighter'}
function updateClassSummary(){
 const id=chosenClass(),c=R.classes[id];
 const details={fighter:'아밍 소드·방패 / 쇠뇌. 질주와 두 번째 바람으로 버팁니다.',ranger:'롱보우 / 아밍 소드. 활을 당겼다가 놓아 발사하고 백스텝으로 거리를 벌립니다.',wizard:'지팡이 / 단검. 주문을 고르고 보조 행동을 유지한 뒤 놓아 시전합니다.'};
 $('classSummary').textContent=`${c.name} · HP ${c.maxHealth} · ${details[id]}`;
}
const slotNames={weapon:'주무기 세트',secondary:'보조 무기 세트',shield:'방패',armor:'방어구',trinket:'장신구'};
function renderStash(message=''){
 const id=chosenClass(),kit=profile.getKit(id),list=$('stashList'),kitList=$('kitList');list.replaceChildren();kitList.replaceChildren();
 $('stashStatus').textContent=message||`${R.classes[id].name} · 보관 ${profile.stash.length}개 · ${profile.gold} G. 빈 장비 슬롯은 기본 지급 장비로 출전합니다.`;
 $('stashEmpty').hidden=profile.stash.length>0;
 for(const item of profile.stash){
  const row=document.createElement('article');row.className='stashItem';
  const desc=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');
  name.textContent=item.name;meta.textContent=(item.supplied?'기본 지급 · 판매 불가':item.value+' G')+(profile.getSelectedSlots(item.uid).length?' · 출전 장비 선택됨':'');
  desc.append(name,meta);row.appendChild(desc);
  const actions=document.createElement('div');actions.className='stashActions';
  const slots=item.type==='weapon'?['weapon','secondary']:Object.keys(slotNames).includes(item.type)?[item.type]:[];
  for(const slot of slots){const b=document.createElement('button');b.type='button';b.textContent=slotNames[slot];b.disabled=!profile.canEquip(item,id,slot);b.onclick=()=>{const r=profile.select(item.uid,slot,id);saveBank();renderStash(r.ok?item.name+' 출전 준비':r.reason)};actions.appendChild(b)}
  const sell=document.createElement('button');sell.type='button';sell.textContent=item.supplied?'지급 장비':'판매 '+item.value+' G';sell.disabled=!!item.supplied;sell.onclick=()=>{const r=profile.sell(item.uid);saveBank();renderStash(r.ok?item.name+' 판매 완료':r.reason)};actions.appendChild(sell);row.appendChild(actions);list.appendChild(row);
 }
 for(const [slot,label] of Object.entries(slotNames)){
  const row=document.createElement('article');row.className='kitItem';const item=kit[slot],desc=document.createElement('div'),name=document.createElement('b'),meta=document.createElement('small');
  name.textContent=label;meta.textContent=item?.name||(C.ITEMS[R.classes[id][slot]]?.name?C.ITEMS[R.classes[id][slot]].name+' · 기본 지급':'없음');desc.append(name,meta);row.appendChild(desc);
  if(item){const b=document.createElement('button');b.type='button';b.textContent='선택 해제';b.onclick=()=>{profile.unselect(slot,id);saveBank();renderStash()};row.appendChild(b)}kitList.appendChild(row);
 }
}
function setStash(open){if(game.running)return;$('stashPanel').hidden=!open;if(open)renderStash()}
function startGame(training=false){
 if(game.running)game.finish(false,'새 출전 시작으로 이전 출전을 종료했습니다');
 resetInput();closeSpellWheel(false);photoMode=false;document.body.classList.remove('photoMode');
 const seed=$('seed').value.trim()||'ASHEN-15',loadout=profile.beginRun(chosenClass(),{training});
 if(!loadout.ok){toast(loadout.reason,4);return}
 saveBank(); // Commit withdrawal before starting the simulation; a reload cannot duplicate equipment.
 inventoryOpen=false;selected=null;game.reset(seed,$('difficulty').value,training,loadout);renderer.upload(CryptRender.buildDungeonMesh(game.map));
 $('home').hidden=true;$('stashPanel').hidden=true;$('pause').hidden=true;$('inventoryPanel').hidden=true;$('hud').hidden=false;$('result').hidden=true;
 expectedUnlock=false;acc=0;last=performance.now();sound.init();touch?.sync();capture();
 toast(training?'전투 연습 · 보관 장비와 출전 통계는 사용하지 않습니다':game.classDef.name+' · 전리품을 챙겨 푸른 포탈로 탈출하세요',4);updateHUD();
}
game.onEvent=e=>{
 if(e.type==='reset')inventoryDirty=true;
 else if(e.type==='notice')toast(e.text);
 else if(e.type==='sound')sound.play(e.name);
 else if(e.type==='spellMenu')openSpellWheel(spellSource==='keyboard');
 else if(e.type==='hit'){hitUntil=performance.now()+140;$('hitMarker').style.color=e.part==='head'?'#ffc26e':'#e9dfbd'}
 else if(e.type==='hurt'){flashUntil=performance.now()+200;toast('-'+e.amount+' HP',.8)}
 else if(e.type==='guard'){guardUntil=performance.now()+220;toast(game.getGuardKind()==='shield'?'방패 방어':'무기 방어',.8)}
 else if(e.type==='loot'){setInventory(true);inventoryDirty=true}
 else if(e.type==='inventory')inventoryDirty=true;
 else if(e.type==='finish'){
  if(spellWheelOpen)closeSpellWheel(false);releasePointer();inventoryOpen=false;$('inventoryPanel').hidden=true;$('pause').hidden=true;$('hud').hidden=true;$('home').hidden=false;$('result').hidden=false;
  const r=e.result,settlement=profile.commitResult(r);saveBank();
  $('result').className=r.success?'':'failure';$('result').replaceChildren();
  const h=document.createElement('h3');h.textContent=r.reason;$('result').appendChild(h);
  const t=document.createElement('p');t.textContent=`처치 ${r.stats.kills} · 명중 ${r.stats.hits} · 방어 ${r.stats.blocks} · ${Math.floor(r.time/60)}분 ${Math.floor(r.time%60)}초`;$('result').appendChild(t);
  const p=document.createElement('p');p.textContent=r.training?'연습 종료 · 장비와 골드 정산 없음':r.cheated?'개발자 모드 · 이 출전의 획득물은 저장되지 않습니다':!settlement.ok?'출전 정산을 확인하지 못했습니다: '+settlement.reason:r.success?`아이템 ${settlement.added}개 보관 · 골드 +${settlement.gold} G. 보관함에서 장비를 준비하거나 판매하세요.`:'이번 출전의 장비와 전리품을 잃었습니다. 남은 보관함과 골드는 유지됩니다.';
  $('result').appendChild(p);$('start').innerHTML='다시 던전 입장 <span>→</span>';
 }
};
function renderInventory(){
 inventoryDirty=false;const inv=game.inventory,grid=$('bagGrid');grid.replaceChildren();$('bagCount').textContent=inv.used()+' / 24 칸';$('bagValue').textContent=inv.value()+' G';
 for(let i=0;i<24;i++){const c=document.createElement('div');c.className='gridCell';c.style.gridColumn=i%6+1;c.style.gridRow=Math.floor(i/6)+1;grid.appendChild(c)}
 for(const it of inv.items){const [w,h]=sizeOf(it),el=document.createElement('div');el.className='bagItem rarity'+it.rarity+(selected===it.uid?' selected':'');el.dataset.uid=it.uid;el.style.gridColumn=`${it.x+1} / span ${w}`;el.style.gridRow=`${it.y+1} / span ${h}`;el.innerHTML=icon(it.icon)+`<span class="name">${it.name}</span><small>${it.value}G</small>`;el.title=it.name;el.tabIndex=0;el.setAttribute('role','button');el.setAttribute('aria-label',it.name);let drag=null;
  el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();selected=it.uid;grid.querySelectorAll('.bagItem').forEach(n=>n.classList.toggle('selected',n===el));updateDetails();const rect=el.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,offX:e.clientX-rect.left,offY:e.clientY-rect.top,active:false,tx:it.x,ty:it.y};el.setPointerCapture(e.pointerId)});
  el.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)drag.active=true;if(!drag.active)return;el.classList.add('dragging');el.style.transform=`translate(${dx}px,${dy}px)`;const rect=grid.getBoundingClientRect(),sx=(rect.width+4)/6,sy=(rect.height+4)/4;drag.tx=Math.round((e.clientX-rect.left-drag.offX)/sx);drag.ty=Math.round((e.clientY-rect.top-drag.offY)/sy);let preview=grid.querySelector('.gridPreview');if(!preview){preview=document.createElement('div');preview.className='gridPreview';grid.appendChild(preview)}preview.className='gridPreview'+(inv.fits(it,drag.tx,drag.ty)?'':' bad');preview.style.gridColumn=`${clamp(drag.tx,0,6-w)+1} / span ${w}`;preview.style.gridRow=`${clamp(drag.ty,0,4-h)+1} / span ${h}`});
  const finish=e=>{if(!drag)return;const moved=drag.active;try{el.releasePointerCapture(drag.id)}catch(_){}if(moved&&e.type!=='pointercancel'&&!inv.place(it,drag.tx,drag.ty))toast('배치 불가 · 아이템이 겹치거나 범위를 벗어납니다');drag=null;el.style.transform='';el.classList.remove('dragging');grid.querySelector('.gridPreview')?.remove();if(moved)renderInventory()};el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',finish);
  el.addEventListener('dblclick',()=>useSelected());el.addEventListener('keydown',e=>{if(e.code==='Enter'){selected=it.uid;useSelected()}});grid.appendChild(el);
 }
 const gear=$('equipmentList');gear.replaceChildren();for(const type of['weapon','secondary','shield','armor','trinket']){const it=game.equipment[type],d=document.createElement('div');d.className='gearCard';d.innerHTML=icon(it?.icon||'gem')+`<span><small>${slotNames[type]}</small>${it?.name||'장착 없음'}</span>`;gear.appendChild(d)}$('equipmentSummary').textContent=`${game.classDef.name} · 현재 무기 ${game.activeWeapon.name} · 피해 ${game.activeWeapon.damage||0} · 방어 ${game.armor}`;
 const c=game.openContainer;$('lootTitle').textContent=c?.name||'주변 전리품';$('lootList').replaceChildren();if(c&&c.items.length){for(const it of c.items){const b=document.createElement('button');b.className='lootItem';b.dataset.uid=it.uid;b.innerHTML=icon(it.icon)+`<span>${it.name}<small>${it.w}×${it.h} · ${it.value} G · 클릭하여 획득</small></span>`;b.onclick=()=>{game.transfer(it.uid);renderInventory()};$('lootList').appendChild(b)}}else{const p=document.createElement('p');p.className='lootEmpty';p.textContent=c?'모두 가져왔습니다.':'F 또는 수색 버튼을 길게 눌러 상자나 시체를 수색하세요.';$('lootList').appendChild(p)}$('takeAll').hidden=!c?.items.length;updateDetails();
}
function updateDetails(){const it=game.inventory.get(selected);$('selectedInfo').replaceChildren();const h=document.createElement('h4'),p=document.createElement('p');h.textContent=it?.name||'아이템을 선택하세요';p.textContent=it?`${sizeOf(it).join('×')} 칸 · ${it.value} G${it.damage?' · 무기 피해 '+it.damage+' · '+(C.PROFILES[it.profile]?.name||it.weaponKind||'무기'):''}${it.armor?' · 방어 '+it.armor:''}${it.type==='trinket'?' · 수집용 장신구':''}${it.supplied?' · 지급 장비':''}`:'공간이 부족한 전리품은 상자에 남습니다.';$('selectedInfo').append(h,p);$('equipItem').disabled=!it||it.type==='treasure'||(it.type!=='consumable'&&!game.canEquip(it,it.type==='weapon'?(game.weaponSetIndex?'secondary':'weapon'):it.type));$('rotateItem').disabled=!it;$('dropItem').disabled=!it;$('equipItem').textContent=it?.type==='consumable'?'소모품 보관':'장비 장착'}
function useSelected(){const it=game.inventory.get(selected);if(!it)return;if(it.type==='consumable')game.consume(it.uid);else game.equip(it.uid);renderInventory()}
function drawMap(){const c=$('map'),ctx=c.getContext('2d'),sz=c.width,s=sz/N;ctx.fillStyle='#071016';ctx.fillRect(0,0,sz,sz);for(const k of game.explored){const x=k%N,z=Math.floor(k/N);ctx.fillStyle=game.map.grid[z]?.[x]?'#34413e':game.visible.has(k)?'#59665c':'#293933';ctx.fillRect(x*s,z*s,s-.4,s-.4)}
 for(const chest of game.containers){if(!chest.items.length&&!chest.gold)continue;const k=Math.floor(chest.z/TILE)*N+Math.floor(chest.x/TILE);if(game.explored.has(k)){ctx.fillStyle=chest.corpse?'#8b8170':'#bd9857';ctx.fillRect(chest.x/TILE*s-1.5,chest.z/TILE*s-1.5,3,3)}}
 const exit=game.map.exit,k=Math.floor(exit.z/TILE)*N+Math.floor(exit.x/TILE);if(game.explored.has(k)){ctx.strokeStyle='#69c4df';ctx.strokeRect(exit.x/TILE*s-3,exit.z/TILE*s-3,6,6)}
 for(const e of game.enemies){const k=Math.floor(e.z/TILE)*N+Math.floor(e.x/TILE);if(e.hp>0&&game.visible.has(k)&&lineClear(game.map,game.player.x,game.player.z,e.x,e.z)){ctx.fillStyle=e.type==='warden'?'#e8a357':'#b16f5b';ctx.beginPath();ctx.arc(e.x/TILE*s,e.z/TILE*s,e.type==='warden'?2.8:1.6,0,Math.PI*2);ctx.fill()}}
 const p=game.player,x=p.x/TILE*s,z=p.z/TILE*s;ctx.fillStyle='#e7dec2';ctx.beginPath();ctx.arc(x,z,2.8,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#f0dfb6';ctx.beginPath();ctx.moveTo(x,z);ctx.lineTo(x+Math.sin(p.yaw)*8,z-Math.cos(p.yaw)*8);ctx.stroke();
}
function updateHUD(){
 const p=game.player,m=game.maxHealth,w=game.activeWeapon,mobile=!!touch?.enabled;
 $('hpText').textContent=(Math.round(p.hp*10)/10)+' / '+m;$('hpFill').style.width=clamp(p.hp/m*100,0,100)+'%';
 $('hpRecoverableFill').style.width=clamp((p.hp+p.recoverableHp)/m*100,0,100)+'%';$('classHudName').textContent=game.classDef.name.toUpperCase();
 for(const [i,skill] of game.skillInfo().entries()){
  const n=i+1,def=R.skills[skill.id];let text=skill.remaining>0?Math.ceil(skill.remaining)+'초':skill.cooldown>0?Math.ceil(skill.cooldown)+'초':skill.charges!==null?skill.charges+'회':'준비';
  if(skill.id==='spellMemory')text=game.currentSpell?.name||'주문 선택';
  $('skill'+n+'Name').textContent=skill.key+' '+skill.name;$('skill'+n+'Text').textContent=text;
  $('skill'+n+'Fill').style.width=(skill.charges===0?0:skill.cooldown>0?clamp(1-skill.cooldown/(def.cooldown||1),0,1)*100:100)+'%';
  $('touchSkill'+n+'Name').textContent=skill.name;$('touchSkill'+n+'Text').textContent=text;
 }
 $('goldText').textContent=p.gold+' G';$('potionText').textContent='물약 '+p.potions;$('armorText').textContent='방어 '+game.armor;
 $('weapon1Label').textContent=game.equipment.weapon?.name||'주무기 없음';$('weapon2Label').textContent=game.equipment.secondary?.name||'보조무기 없음';
 $('utility1Label').textContent='물약 '+p.potions;$('utility2Label').textContent='횃불';
 for(const n of [1,2])$('touchWeapon'+n+'Label').textContent=game.equipment[n===1?'weapon':'secondary']?.name||'없음';
 $('touchUtility1Label').textContent='물약 '+p.potions;$('touchUtility2Label').textContent='횃불';
 const casting=game.classId==='wizard'&&w.weaponKind==='staff'&&game.currentSpell&&game.selectedUtility===null;
 $('touchSecondaryLabel').textContent=casting?game.currentSpell.name:'방어';
 $('stanceText').textContent=p.resting?'휴식 · 회복 가능한 체력 재생':p.crouching?'웅크리기':p.walking?'걷기':p.sheathed?'무기 넣음':'서 있기';
 $('resourceText').textContent=game.selectedUtility===0?'공격 버튼으로 물약 사용':game.selectedUtility===1?'횃불 사용 중':w.quiver?`장전 ${p.arrows}/${w.quiver} · 예비 ${p.reserve}`:casting?`${game.currentSpell.name} ${p.charges[game.currentSpell.id]}/${game.currentSpell.charges}회`:'피해 '+(w.damage||0);
 $('clock').textContent=Math.floor(Math.max(0,game.remaining)/60).toString().padStart(2,'0')+':'+Math.floor(Math.max(0,game.remaining)%60).toString().padStart(2,'0');$('difficultyLabel').textContent=game.training?'TRAINING':game.difficulty.toUpperCase();
 const activeAction=game.selectedUtility!==null?'utility'+(game.selectedUtility+1):'set'+(game.weaponSetIndex+1);
 document.querySelectorAll('[data-action]').forEach(el=>el.classList.toggle('active',el.dataset.action===activeAction));
 touch?.sync();document.querySelectorAll('[data-touch-action]').forEach(el=>{const action=el.dataset.touchAction;if(['set1','set2','utility1','utility2','sheath','rest'].includes(action)){const active=action===activeAction||(action==='sheath'&&p.sheathed)||(action==='rest'&&p.resting);el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active))}});
 const dirs=['N','NE','E','SE','S','SW','W','NW'],dir=((Math.round(p.yaw/(Math.PI/4))%8)+8)%8;$('compass').innerHTML=`<span>${dirs[(dir+7)%8]}</span><b>${dirs[dir]}</b><i>│</i><span>${dirs[(dir+1)%8]}</span>`;
 const b=game.boss,show=b&&b.hp>0&&Math.hypot(b.x-p.x,b.z-p.z)<14&&lineClear(game.map,p.x,p.z,b.x,b.z);$('bossHud').hidden=!show;if(show){$('bossFill').style.width=b.hp/b.maxHp*100+'%';$('bossPhase').textContent='PHASE '+b.phase;$('bossState').textContent=b.attack?({slam:'내려찍기 · 옆으로 피하세요',sweep:'휩쓸기 · 거리를 벌리세요',pulse:'영혼파 · 점프하거나 범위 밖으로'}[b.attack.kind]||''):'틈을 노리세요'}
 $('combatState').textContent=p.attack?({windup:'공격 준비',active:'타격 구간',recovery:'공격 회복'}[C.attackPhase(p.attack)[0]]):p.stagger>0?'경직':p.guard?(game.getGuardKind()==='shield'?'방패 방향 방어':'무기 방향 방어'):casting?'보조 행동 유지 → 완료 후 놓기':w.weaponKind==='bow'?'공격 유지 → 당긴 뒤 놓기':mobile?'공격 · 보조 행동':'좌클릭 공격 · 우클릭 보조 행동';
 const charge=p.cast||p.draw;$('castTrack').hidden=!charge;if(charge){$('castFill').style.width=clamp(charge.t/charge.duration*100,0,100)+'%';$('castText').textContent=charge.ready?'준비 완료 · 놓아 발사':p.cast?(R.spells[charge.spellId]?.name||'주문')+' 시전 중':'활 당기는 중'}
 const a=game.action,target=game.getInteraction(),hold=mobile?'[수색 유지]':'[F 유지]',press=mobile?'[수색 길게]':'[F 길게]';$('actionTrack').hidden=!a;
 if(a){$('prompt').textContent={container:hold+' 수색 중',exit:hold+' 탈출 중',heal:'물약 마시는 중',reload:'장전 중',ration:'야전 식량 사용 중',meditate:'명상 · 주문 횟수 복원'}[a.kind]||'사용 중';$('actionFill').style.width=clamp(a.t/a.duration*100,0,100)+'%'}
 else $('prompt').textContent=inventoryOpen||spellWheelOpen?'':target?target.kind==='exit'?press+' 푸른 포탈로 탈출':target.object.searched?(mobile?'[수색] ':'[F] ')+target.object.name:press+' '+target.object.name:'';
 let enemy=null,dist=Infinity;for(const e of game.enemies){if(e.hp<=0)continue;const d=Math.hypot(e.x-p.x,e.z-p.z),a=Math.abs(angleDelta(Math.atan2(e.x-p.x,-(e.z-p.z)),p.yaw));if(d<12&&d<dist&&a<.08+.25/d&&lineClear(game.map,p.x,p.z,e.x,e.z)){enemy=e;dist=d}}$('targetLabel').innerHTML=enemy&&!inventoryOpen?`${enemy.name}<div class="targetTrack"><div style="width:${enemy.hp/enemy.maxHp*100}%"></div></div>`:'';
 if(!$('map').hidden)drawMap();if(debugOpen)$('debugText').textContent=`v15 · ${game.classId} · seed ${game.seed}\nSIM 60 Hz · render ${renderer.frames}\nvertices ${renderer.vertexCount.toLocaleString()} · calls ${renderer.drawCalls}\nquality ${renderer.preset} · textures ${renderer.texturesReady}/2\nHP ${p.hp.toFixed(1)} + recoverable ${p.recoverableHp.toFixed(1)}\nposition ${p.x.toFixed(2)}, ${p.z.toFixed(2)}\n공격 ${game.stats.swings} · 명중 ${game.stats.hits} · 방어 ${game.stats.blocks}\n가방 무결성 ${game.inventory.validate()?'OK':'ERROR'}\n무적 ${game.god} · AI 정지 ${game.aiFrozen}`;
}
function drawFloating(){const frag=document.createDocumentFragment();for(const n of game.numbers){const p=renderer.project([n.pos[0],n.pos[1]+(.8-n.life)*.7,n.pos[2]]);if(!p)continue;const el=document.createElement('span');el.className='number'+(n.head?' head':'');el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.opacity=Math.min(1,n.life*3);el.textContent=n.text;frag.appendChild(el)}$('floating').replaceChildren(frag)}
function render(){const p=game.player,bob=settings.bob&&game.running&&!game.paused?Math.sin(p.walkPhase)*Math.min(p.moveAmount,3)*.006:0;const eye=game.getEye();eye[1]+=bob;renderer.draw({eye,yaw:p.yaw,pitch:p.pitch},game.map,CryptScene.scene(game,{debug:debugGeometry,particles:renderer.options.particles,visualTime:game.running?game.time:performance.now()/1000}),game.time,settings.fov);drawFloating()}
function frame(t){try{const dt=Math.min(.10,(t-last)/1000);last=t;if(autoStep&&game.running&&!game.paused){acc+=dt;let count=0;while(acc>=1/60&&count++<6){game.tick(1/60,input());acc-=1/60}if(game.player.moveAmount>1&&!inventoryOpen){footstep+=dt;if(footstep>.40){footstep=0;sound.play('step')}}}else acc=0;
  if(inventoryOpen&&inventoryDirty)renderInventory();uiTimer+=dt;if(uiTimer>.08){uiTimer=0;updateHUD()}if(autoRender)render();frames++;
  if(performance.now()>toastUntil)$('toast').textContent='';$('hitMarker').style.opacity=performance.now()<hitUntil?'1':'0';$('flash').style.opacity=performance.now()<flashUntil?'.65':'0';$('crosshair').style.filter=performance.now()<guardUntil?'drop-shadow(0 0 6px #ffd267)':'';
 }catch(e){console.error(e);$('fatalMessage').textContent='실행 오류: '+e.message;$('fatal').hidden=false;game.paused=true;return}rafId=requestAnimationFrame(frame)}
// Input bindings are installed once. PC and mobile call the same simulation methods.
$('start').onclick=()=>startGame(false);$('training').onclick=()=>startGame(true);$('randomSeed').onclick=()=>$('seed').value='CRYPT-'+Math.random().toString(36).slice(2,8).toUpperCase();
$('resume').onclick=resumeGame;$('abandon').onclick=()=>game.finish(false,'출전을 포기했습니다');$('closeInventory').onclick=()=>setInventory(false);
$('openStash').onclick=()=>setStash(true);$('closeStash').onclick=()=>setStash(false);$('classSelect').onchange=()=>{updateClassSummary();if(!$('stashPanel').hidden)renderStash()};$('closeSpellWheel').onclick=()=>closeSpellWheel();
$('equipItem').onclick=useSelected;$('rotateItem').onclick=()=>{if(!game.inventory.rotate(selected))toast('회전할 공간이 없습니다');renderInventory()};$('dropItem').onclick=()=>{game.drop(selected);selected=null;renderInventory()};$('takeAll').onclick=()=>{for(const it of [...(game.openContainer?.items||[])])game.transfer(it.uid);renderInventory()};
$('fov').oninput=e=>{settings.fov=Number(e.target.value);$('fovValue').textContent=settings.fov+'°'};$('sensitivity').oninput=e=>settings.sensitivity=Number(e.target.value)/10000;$('quality').onchange=e=>renderer.scale=Number(e.target.value);$('audioEnabled').onchange=e=>{settings.audio=e.target.checked;sound.init()};$('headBob').onchange=e=>settings.bob=e.target.checked;$('keyboardLook').onchange=e=>settings.keyboardLook=e.target.checked;
function cheat(action){if(!game.running)return;game.cheated=true;action();toast('개발자 모드 · 이 출전의 획득물은 저장되지 않습니다')}
$('graphicsPreset').onchange=e=>{renderer.setPreset(e.target.value);$('shadowToggle').checked=renderer.options.shadows;$('bloomToggle').checked=renderer.options.bloom;render()};
$('exposure').oninput=e=>{renderer.options.exposure=Number(e.target.value)/100;$('exposureValue').textContent=e.target.value+'%';render()};$('shadowToggle').onchange=e=>{renderer.options.shadows=e.target.checked;render()};$('bloomToggle').onchange=e=>{renderer.options.bloom=e.target.checked;render()};
let photoMode=false;
$('god').onclick=()=>cheat(()=>game.god=!game.god);$('freezeAI').onclick=()=>cheat(()=>game.aiFrozen=!game.aiFrozen);$('spawnEnemy').onclick=()=>cheat(()=>{const p=game.player,f=yawAxes(p.yaw)[2],x=p.x+f[0]*3,z=p.z+f[2]*3;if(C.free(game.map,x,z))game.spawnEnemy('skeleton',x,z)});$('spawnLoot').onclick=()=>cheat(()=>game.addContainer(game.player.x,game.player.z,'개발자 보급품',['steelSword','axe','plate','amulet'],0,true));
function performAction(action,source='touch'){
 if(!game.running||game.paused||inventoryOpen||spellWheelOpen)return;
 if(action==='interact')game.interact();
 else if(action==='skill1'||action==='skill2'){spellSource=source;game.useSkill(action==='skill1'?0:1)}
 else if(action==='special')game.specialAction();
 else if(action==='sheath')game.toggleSheath();
 else if(action==='rest')game.toggleRest();
 else if(action==='set1'||action==='set2')game.selectWeaponSet(action==='set1'?0:1);
 else if(action==='utility1'||action==='utility2')game.selectUtility(action==='utility1'?0:1);
 else if(action==='inventory')setInventory(true);
 else if(action==='pause')pauseGame();
 else if(action==='map')$('map').hidden=!$('map').hidden;
}
document.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>performAction(el.dataset.action,'keyboard'));
document.addEventListener('keydown',e=>{
 if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)&&!['Escape','F1'].includes(e.code))return;
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','F1','F2'].includes(e.code))e.preventDefault();
 if(e.code==='Escape'&&!e.repeat){if(spellWheelOpen)closeSpellWheel();else if(inventoryOpen)setInventory(false);else if(!$('stashPanel').hidden)setStash(false);else if(game.running){if(game.paused)resumeGame();else pauseGame()}return}
 if(e.code==='F1'&&!e.repeat){if(game.running){if(game.paused)resumeGame();else pauseGame()}return}
 if(!game.running||game.paused)return;
 if(e.code==='Tab'&&!e.repeat){setInventory(!inventoryOpen);return}
 if(spellWheelOpen){if(!e.repeat&&['Digit1','Digit2','Digit3'].includes(e.code)){game.selectSpell(Number(e.code.slice(-1))-1);closeSpellWheel()}return}
 if(inventoryOpen){if(e.code==='KeyR'&&!e.repeat)$('rotateItem').click();return}
 if(e.code==='F2'&&!e.repeat){photoMode=!photoMode;document.body.classList.toggle('photoMode',photoMode);return}
 if(['KeyT','KeyY'].includes(e.code)&&!e.repeat){debugOpen=!debugOpen;$('debug').hidden=!debugOpen;return}if(e.code==='KeyV'&&!e.repeat){debugGeometry=!debugGeometry;return}
 keys[e.code]=true;if(e.repeat)return;
 const action={Digit1:'set1',Digit2:'set2',Digit3:'utility1',Digit4:'utility2',KeyQ:'skill1',KeyE:'skill2',KeyR:'special',KeyF:'interact',KeyX:'sheath',KeyG:'rest',KeyM:'map'}[e.code];
 if(action)performAction(action,'keyboard');
});
document.addEventListener('keyup',e=>{
 keys[e.code]=false;if(e.code==='KeyQ'&&spellWheelOpen&&spellWheelKeyboard)closeSpellWheel();
 if(e.code==='KeyF'&&!touch?.held('interact')&&game.action&&['container','exit'].includes(game.action.kind))game.cancelAction();
});
$('gl').addEventListener('mousedown',e=>{
 if(e.sourceCapabilities?.firesTouchEvents||!game.running||game.paused||inventoryOpen||spellWheelOpen)return;sound.init();
 if(e.button===2){e.preventDefault();if(!mouseSecondary&&!touch?.held('secondary'))game.secondaryDown();mouseSecondary=true}
 else if(e.button===0){if(!touch?.enabled&&document.pointerLockElement!==$('gl')&&!pointerFallback){capture();return}if(!mousePrimary&&!touch?.held('attack'))game.primaryDown();mousePrimary=true}
});
document.addEventListener('mouseup',e=>{if(e.button===0){mousePrimary=false;if(!touch?.held('attack'))game.primaryUp()}else if(e.button===2){mouseSecondary=false;if(!touch?.held('secondary'))game.secondaryUp()}});
$('gl').addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('gl')||!game.running||game.paused||inventoryOpen||spellWheelOpen)return;game.player.yaw+=e.movementX*settings.sensitivity;game.player.pitch=clamp(game.player.pitch-e.movementY*settings.sensitivity,-1.2,1.2)});
document.addEventListener('pointerlockchange',()=>{
 if(touch?.enabled&&document.pointerLockElement){expectedUnlock=true;document.exitPointerLock?.();return}
 if(document.pointerLockElement===$('gl')){pointerFallback=false;expectedUnlock=false;$('captureHint').textContent='Esc 일시정지'}
 else{const expected=expectedUnlock;expectedUnlock=false;if(!touch?.enabled&&game.running&&!inventoryOpen&&!spellWheelOpen&&!game.paused&&!expected)pauseGame()}
});
document.addEventListener('pointerlockerror',()=>{pointerFallback=true;$('captureHint').textContent='마우스 잠금 제한 · 방향키 시점 보조 사용 가능'});
window.addEventListener('blur',()=>{resetInput();if(game.running)pauseGame()});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(game.running)pauseGame()}});
$('gl').addEventListener('webglcontextlost',e=>{e.preventDefault();pauseGame();$('fatalMessage').textContent='그래픽 컨텍스트가 중단되었습니다. 페이지를 다시 열면 현재 출전의 장비를 잃습니다. 저장된 보관함은 유지됩니다.';$('fatal').hidden=false});
function touchAction(action,down,meta={}){
 if(action==='attack'||action==='secondary'){
  if(meta.cancelled){
   // A cancelled finger only relinquishes its channel. A real mouse can still
   // own that channel, or the other channel, on a hybrid touch device.
   if(action==='attack'&&!mousePrimary){game.player.primaryHeld=false;game.player.draw=null}
   if(action==='secondary'&&!mouseSecondary){game.player.secondaryHeld=false;game.player.cast=null;game.setGuard(false)}
   return;
  }
  if(down){if(!game.running||game.paused||inventoryOpen||spellWheelOpen)return;sound.init();if(action==='attack'){if(!mousePrimary)game.primaryDown()}else if(!mouseSecondary)game.secondaryDown()}
  else if(action==='attack'){if(!mousePrimary)game.primaryUp()}else if(!mouseSecondary)game.secondaryUp();return;
 }
 if(action==='interact'&&!down){if(!keys.KeyF&&game.action&&['container','exit'].includes(game.action.kind))game.cancelAction();return}
 if(!down)return;sound.init();performAction(action,'touch');
}
touch=new CryptTouch.TouchControls({document,window,canUse:()=>game.running&&!game.paused&&!game.ended&&!inventoryOpen&&!spellWheelOpen,
 onAction:touchAction,onLook:(x,y)=>{game.player.yaw+=x;game.player.pitch=clamp(game.player.pitch-y,-1.2,1.2)},
 onMode:enabled=>{if(enabled&&document.pointerLockElement){expectedUnlock=true;document.exitPointerLock?.()}$('captureHint').textContent=enabled?'왼쪽 패드 이동 · 오른쪽 드래그 시점':'클릭하여 시점 조작'}
});
$('touchControlsMode').onchange=e=>{resetInput();touch.setMode(e.target.value);if(!touch.enabled)capture()};
$('touchSensitivity').oninput=e=>{touch.sensitivity=Number(e.target.value)/230*.006;$('touchSensitivityValue').textContent=Math.round(Number(e.target.value)/2.3)+'%'};
window.addEventListener('resize',resetInput);window.addEventListener('orientationchange',resetInput);
window.cryptDebug={
 getInput:input,touchState:()=>touch.snapshot(),stepInput:seconds=>{for(let t=0;t<seconds-1e-8;t+=1/60)game.tick(1/60,input());updateHUD();if(autoRender)render()},
 getV15:()=>({version:'15',classId:game.classId,texturesReady:renderer.texturesReady,drawCalls:renderer.drawCalls,vertices:renderer.vertexCount,preset:renderer.preset,renderCpuMs:renderer.lastMs,options:{...renderer.options},static:renderer.staticMeta}),getState:()=>game.snapshot(),
 game,renderer,start:startGame,step:(seconds,controls={})=>{for(let t=0;t<seconds-1e-8;t+=1/60)game.tick(1/60,controls);updateHUD();if(autoRender)render()},setAuto:v=>autoStep=!!v,setRenderAuto:v=>autoRender=!!v,render,openInventory:()=>setInventory(true),closeInventory:()=>setInventory(false),pause:pauseGame,resume:resumeGame,
 bank:()=>profile.serialize(),profile,saveBank,renderStash,openSpellWheel,closeSpellWheel,icon,storageAvailable:()=>storageAvailable
};
updateClassSummary();renderer.upload(CryptRender.buildDungeonMesh(game.map));render();updateHUD();rafId=requestAnimationFrame(frame);
})();
