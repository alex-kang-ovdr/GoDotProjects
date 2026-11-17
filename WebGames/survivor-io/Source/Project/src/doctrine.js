/* v13: run-local specializations, elite affixes and bounded damage recap.
   Pure combat rules: no network dependency, no monetization, no copied assets. */
const PERK_LEVELS=[5,10,15];
const perkCatalog={
 frost:{name:'냉각 탄두',icon:'❄',group:'제어',color:'#369bb7',desc:'무기 적중 시 1.5초 둔화. 일반 적 이동 −30%, 보스 −10%.',detail:'지속 화염·특수기는 제외. 돌진 거리와 공격 예고는 바꾸지 않습니다.'},
 execution:{name:'거물 사냥꾼',icon:'🎯',group:'화력',color:'#c2853a',desc:'보스와 엘리트에게 모든 피해 +25%.',detail:'방호 정예의 보호막에도 적용됩니다. 일반 적 피해는 그대로입니다.'},
 overclock:{name:'오버클럭',icon:'⚙',group:'화력',color:'#a37baf',desc:'자동 무기 공격 간격 −18%, 무기 피해 −8%.',detail:'수호자의 같은 적 재타격 간격에도 적용. 특수기·포탑은 제외됩니다.'},
 scavenger:{name:'전장 수집가',icon:'🧲',group:'성장',color:'#3d9d85',desc:'획득 경험치 +20%, 아이템 흡수 반경 +45.',detail:'자석 보조와 중첩됩니다. 기존 경험치를 소급해서 지급하지 않습니다.'},
 barrier:{name:'적응형 방벽',icon:'⬡',group:'생존',color:'#399eac',desc:'8초간 맞지 않으면 다음 피해 1회를 막는 방벽 충전.',detail:'최대 1회 저장. 방어 직후 0.25초 보호. 충전 중 피격되면 다시 8초.'},
 dashPulse:{name:'충격 기동',icon:'↯',group:'기동',color:'#b48a44',desc:'대시 재사용 −25%, 출발 지점에 반경 110 충격파.',detail:'기본 60 × 공격 배율 피해. 자동 연쇄 폭발과 구별해 집계됩니다.'},
 capacitor:{name:'전술 축전지',icon:'🔋',group:'전술',color:'#3b9f78',desc:'특수기 재사용 −20%. 사용 즉시 최대 체력의 8% 회복.',detail:'선택할 때 남아 있는 대기시간도 20% 단축. 최대 체력 초과 회복 없음.'},
 blast:{name:'연쇄 폭파',icon:'✹',group:'화력',color:'#c47947',desc:'직접 처치 12회마다 마지막 처치 위치에 반경 105 폭발.',detail:'기본 80 × 공격 배율. 이 특성의 폭발 처치는 다음 폭발을 충전하지 않습니다.'},
 fieldMedic:{name:'전투 응급처치',icon:'✚',group:'생존',color:'#48a17b',desc:'20마리 처치마다 최대 체력의 6% 회복.',detail:'선택 이후 처치부터 누적합니다. 모든 처치가 인정되며 초과 회복 없음.'}
};
const eliteAffixes={
 ward:{name:'방호',icon:'⬡',color:'#7bd5f0',desc:'최대 체력의 30%에 해당하는 추가 보호막. 재생하지 않습니다.'},
 frenzy:{name:'광폭',icon:'↯',color:'#ffa276',desc:'이동 속도 +22%, 공격력 +18%. 주황색 회전 장식으로 구별합니다.'},
 pulse:{name:'파동',icon:'◎',color:'#ddb0f6',desc:'5.5초마다 예고 후 확장 파동. 반경 190, 대시 무적으로 회피 가능.'}
};
const causeNames={
 grunt:'일반 감염자 접촉',runner:'질주 감염자 접촉',tank:'중장갑 감염자 접촉',ranged:'원거리 사수',elite:'엘리트 접촉',splitter:'분열체 접촉',sniper:'저격 탄환',mini:'소형 감염자 접촉',boss:'보스 접촉',charger:'돌진병 접촉',medic:'지원병 접촉',
 charge:'돌진 공격',shock:'보스 충격파',mortar:'보스 포격',summon:'소환 충격파',laser:'빙결 레이저',ice:'빙결 탄막',zone:'위험 지역',elitePulse:'파동 정예 충격파',projectile:'적 투사체',other:'전투 피해'
};
function newDoctrine(){return {taken:[],draft:null,barrierReady:false,safeTime:0,blastKills:0,healKills:0,blasts:[],log:[],stats:{blocked:0,healed:0,shieldDamage:0,affixKills:0,explosions:0}};}
let doctrine=newDoctrine();
function hasPerk(k){return doctrine.taken.includes(k);}
function heroCooldown(){return heroCatalog[activeHero].cooldown*(hasPerk('capacitor')?.8:1);}
function perkHealing(amount){const healed=Math.max(0,Math.min(player.maxHp-player.hp,amount));player.hp+=healed;doctrine.stats.healed+=healed;if(healed>=1)floatText(player.x,player.y,'+'+Math.round(healed),'#b2ffd7');return healed;}
function perkSlotsEarned(){return PERK_LEVELS.filter(lv=>player&&player.lv>=lv).length;}
function maybeOfferPerk(){
 if(state!=='playing'||paidRun||!player||doctrine.taken.length>=perkSlotsEarned())return false;
 if(!doctrine.draft){const pool=Object.keys(perkCatalog).filter(k=>!hasPerk(k));for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}doctrine.draft=pool.slice(0,3);}
 perkMenu();return true;
}
function choosePerk(k){
 if(state!=='perk'||paidRun||!doctrine.draft?.includes(k)||hasPerk(k)||doctrine.taken.length>=3||doctrine.taken.length>=perkSlotsEarned())return false;
 doctrine.taken.push(k);doctrine.draft=null;
 if(k==='capacitor')tactics.cooldown*=.8;
 if(k==='dashPulse')dashCooldown*=.75;
 if(k==='barrier'){doctrine.safeTime=0;doctrine.barrierReady=false;}
 Sound.play('evolve');effect(player.x,player.y,'#b8f8df',24);resumePlay();return true;
}
function perkMenu(){
 state='perk';const opts=doctrine.draft||[];
 show(`<div class="eyebrow">SPECIALIZATION / ${doctrine.taken.length+1} OF 3</div><h1>이번 전투의 방식을 바꾸세요.</h1><p class="intro">Lv.5 · 10 · 15에서 특성을 하나씩 선택합니다.<br>무기·보조 슬롯을 사용하지 않으며 이번 전투에만 적용됩니다.</p><div class="cards perk-cards">${opts.map((k,i)=>{const p=perkCatalog[k];return `<button class="card perk-card" data-perk="${k}" style="--perk:${p.color}"><span class="keycap">${i+1}</span><span class="emoji">${p.icon}</span><span class="perk-group">${p.group}</span><b>${p.name}</b><small>${p.desc}</small><span class="perk-detail">${p.detail}</span></button>`;}).join('')}</div><div class="perk-owned">${doctrine.taken.length?doctrine.taken.map(k=>`<span>${perkCatalog[k].icon} ${perkCatalog[k].name}</span>`).join(''):'아직 선택한 특성이 없습니다.'}</div><button class="action secondary" id="savePerkLobby">선택 보류 · 저장 후 로비</button><p class="hint">1 / 2 / 3으로 선택 · 선택 화면에서는 모든 전투 시간이 정지됩니다.</p>`);
 document.querySelectorAll('[data-perk]').forEach(el=>el.onclick=()=>choosePerk(el.dataset.perk));$('savePerkLobby').onclick=suspendRun;updateHud(true);saveRun();
}
function perkPanel(){return `<section class="perk-panel"><h3>전투 특성 <small>${doctrine.taken.length}/3</small></h3><div class="perk-owned">${doctrine.taken.map(k=>`<span title="${perkCatalog[k].desc}">${perkCatalog[k].icon} ${perkCatalog[k].name}</span>`).join('')||'<span>Lv.5 / 10 / 15에서 선택</span>'}</div>${doctrine.taken.map(k=>`<p><b>${perkCatalog[k].name}</b> · ${perkCatalog[k].desc}</p>`).join('')}<small>회복 ${Math.round(doctrine.stats.healed)} · 방벽 방어 ${Math.round(doctrine.stats.blocked)} · 정예 보호막 피해 ${Math.round(doctrine.stats.shieldDamage)}</small></section>`;}
function recapPanel(){return `<section class="recap-panel"><h3>최근 받은 피해</h3>${doctrine.log.length?doctrine.log.slice(-5).reverse().map((h,i)=>`<div class="recap-row ${i===0?'latest':''}"><span>${fmt(h.time)}</span><b>${causeNames[h.cause]||causeNames.other}</b><strong>−${Math.ceil(h.damage)}</strong></div>`).join(''):'<p>받은 피해가 없습니다.</p>'}<p class="hint">피격 시각·원인·실제 감소 체력입니다. 무적과 방벽으로 막은 공격은 제외합니다.</p></section>`;}
function perkCodex(){return `<h3>전투 특성 · Lv.5 / 10 / 15</h3><div class="codex">${Object.values(perkCatalog).map(p=>`<div><b>${p.icon} ${p.name} · ${p.group}</b><small>${p.desc} ${p.detail}</small></div>`).join('')}</div><h3>속성 정예</h3><div class="codex">${Object.values(eliteAffixes).map(p=>`<div><b>${p.icon} ${p.name}</b><small>${p.desc}</small></div>`).join('')}</div>`;}
function perkIncoming(e,amount,source,canChill=true){
 if(hasPerk('execution')&&(e.type==='boss'||e.type==='elite'))amount*=1.25;
 if(canChill&&hasPerk('frost')&&Object.hasOwn(weaponData,source)&&source!=='molotov')e.slow=1.5;
 if(e.ward>0){const absorbed=Math.min(e.ward,amount);e.ward-=absorbed;amount-=absorbed;doctrine.stats.shieldDamage+=absorbed;e.hit=.1;if(!e.ward){effect(e.x,e.y,'#9fe6fc',18);floatText(e.x,e.y,'보호막 파괴','#a4f0ff');}}
 return amount;
}
function perkOnKill(e,source){
 if(e.affix){doctrine.stats.affixKills++;player.gold+=15;}
 if(hasPerk('fieldMedic')){doctrine.healKills++;if(doctrine.healKills>=20){doctrine.healKills-=20;perkHealing(player.maxHp*.06);}}
 if(hasPerk('blast')&&source!=='perk_blast'){doctrine.blastKills++;if(doctrine.blastKills>=12){doctrine.blastKills-=12;if(doctrine.blasts.length<32)doctrine.blasts.push({x:e.x,y:e.y,dmg:80*attackPower()});}}
}
function blockIncoming(amount){
 if(!hasPerk('barrier'))return false;doctrine.safeTime=0;
 if(!doctrine.barrierReady)return false;doctrine.barrierReady=false;doctrine.stats.blocked+=amount;player.inv=Math.max(player.inv,.25);effect(player.x,player.y,'#a0ecff',18);floatText(player.x,player.y,'방어','#b7f4ff');Sound.play('dash');return true;
}
function recordIncoming(amount,cause){doctrine.safeTime=0;doctrine.log.push({time:elapsed,damage:amount,cause:Object.hasOwn(causeNames,cause)?cause:'other'});if(doctrine.log.length>8)doctrine.log.shift();}
function decorateElite(e,key){
 if(!e||e.type!=='elite'||!Object.hasOwn(eliteAffixes,key)||e.affix)return e;
 e.affix=key;e.affixClock=3;e.ward=0;e.wardMax=0;e.xp=Math.round(e.xp*1.5);
 if(key==='ward'){e.wardMax=e.max*.3;e.ward=e.wardMax;}
 if(key==='frenzy'){e.speed*=1.22;e.dmg*=1.18;}
 return e;
}
function tickDoctrine(dt){
 if(hasPerk('barrier')&&!doctrine.barrierReady){doctrine.safeTime=Math.min(8,doctrine.safeTime+dt);if(doctrine.safeTime>=8){doctrine.barrierReady=true;Sound.play('upgrade');}}
 for(const e of enemies){if(e.hp<=0)continue;e.slow=Math.max(0,(e.slow||0)-dt);
  if(e.affix==='pulse'){e.affixClock=Math.max(0,e.affixClock-dt);if(e.affixClock<=0){e.affixClock=5.5;addThreat('ring',{kind:'elitePulse',owner:e,x:e.x,y:e.y,r:190,width:14,warn:1.1,duration:1.1,damage:e.dmg*.65,color:'#d9a8f4'});Sound.play('warn');}}
 }
 // Drain from a snapshot: perk explosions never recursively produce themselves.
 const ready=doctrine.blasts.splice(0,32);for(const b of ready){if(state!=='playing'||paidRun)break;doctrine.stats.explosions++;explosion(b.x,b.y,105,b.dmg,'perk_blast');}
}
function slowFactor(e){return e.slow>0?(e.type==='boss'?.9:.7):1;}
function updatePerkHud(){
 const el=$('perkHUD');if(!el)return;el.style.display=player&&state!=='menu'?'flex':'none';if(!player)return;
 const next=PERK_LEVELS[doctrine.taken.length];el.innerHTML=`<span class="perk-count">${doctrine.taken.length?doctrine.taken.map(k=>`<i title="${perkCatalog[k].name}">${perkCatalog[k].icon}</i>`).join(''):'◇'}</span><span>${next?'다음 특성 Lv.'+next:'특성 완성'}${hasPerk('barrier')?' · '+(doctrine.barrierReady?'방벽 준비':Math.ceil(8-doctrine.safeTime)+'초 충전'):''}</span>`;
}
function drawDoctrineOverlay(is3D){
 if(!player||state==='menu')return;
 for(const e of enemies){if(e.hp<=0)continue;const p=screenPoint(e.x,e.y,e.type==='elite'?100:65);if(p.x<20||p.x>W-20||p.y<90||p.y>H-55)continue;
  if(e.affix){const aff=eliteAffixes[e.affix];ctx.font='800 10px system-ui';ctx.textAlign='center';ctx.strokeStyle='#203646';ctx.lineWidth=4;ctx.strokeText(aff.icon+' '+aff.name+' 정예',p.x,p.y-10);ctx.fillStyle=aff.color;ctx.fillText(aff.icon+' '+aff.name+' 정예',p.x,p.y-10);if(e.ward>0){ctx.fillStyle='#193e55';ctx.fillRect(p.x-24,p.y-3,48,4);ctx.fillStyle='#a6e7ff';ctx.fillRect(p.x-24,p.y-3,48*e.ward/e.wardMax,4);}}
  if(e.slow>0){ctx.fillStyle='#b3f5ff';ctx.font='bold 12px system-ui';ctx.textAlign='center';ctx.fillText('❄',p.x,p.y+6);}
 }
 if(!is3D){ctx.save();ctx.translate(W/2-player.x,H/2-player.y);for(const e of enemies)if(e.hp>0&&(e.affix||e.slow>0)){ctx.strokeStyle=e.slow>0?'#90dff6':eliteAffixes[e.affix].color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,e.r+5,0,TAU);ctx.stroke();}if(doctrine.barrierReady){ctx.strokeStyle='#a6e7ff';ctx.lineWidth=3;ctx.beginPath();ctx.arc(player.x,player.y,28,0,TAU);ctx.stroke();}ctx.restore();}
}
function validateDoctrine(s,err){
 if(s.version===12){s.doctrine=newDoctrine();return;}
 const d=s.doctrine,n=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
 if(!d||!Array.isArray(d.taken)||d.taken.length>3||new Set(d.taken).size!==d.taken.length||d.taken.some(k=>!Object.hasOwn(perkCatalog,k))||d.taken.length>PERK_LEVELS.filter(v=>s.player.lv>=v).length)err();
 if(d.draft!==null&&(!Array.isArray(d.draft)||d.draft.length!==3||new Set(d.draft).size!==3||d.draft.some(k=>!Object.hasOwn(perkCatalog,k)||d.taken.includes(k))))err();
 if(s.mode==='perk'&&(!d.draft||d.taken.length>=PERK_LEVELS.filter(v=>s.player.lv>=v).length))err();
 if(s.mode!=='perk'&&d.draft!==null)err();
 if(typeof d.barrierReady!=='boolean'||!n(d.safeTime,0,8)||(!d.taken.includes('barrier')&&d.barrierReady)||!Number.isInteger(d.blastKills)||!n(d.blastKills,0,11)||!Number.isInteger(d.healKills)||!n(d.healKills,0,19))err();
 if(!Array.isArray(d.blasts)||d.blasts.length>32||d.blasts.some(b=>!b||!n(b.x,-1e7,1e9)||!n(b.y,-1e7,1e9)||!n(b.dmg,0,1e10)))err();
 if(!Array.isArray(d.log)||d.log.length>8||d.log.some(h=>!h||!n(h.time,0,s.timers.elapsed)||!n(h.damage,0,1e9)||!Object.hasOwn(causeNames,h.cause)))err();
 if(!d.stats||['blocked','healed','shieldDamage','affixKills','explosions'].some(k=>!n(d.stats[k],0,1e14)))err();
}
