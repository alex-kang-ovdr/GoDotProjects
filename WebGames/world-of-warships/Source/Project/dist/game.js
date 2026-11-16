/* Iron Tide — browser controller, input, HUD and synthesized audio. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const all = selector => Array.from(document.querySelectorAll(selector));
  const IT = globalThis.IronTide;
  if (!IT || !IT.createGame || !IT.Renderer || !IT.Career || !IT.Training || !IT.Interaction) { $('bootError').hidden = false; return; }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const num = n => Math.round(Number(n) || 0).toLocaleString('ko-KR');
  const sea = $('sea'), renderer = new IT.Renderer(sea);
  const mapCtx = $('minimap').getContext('2d');
  const keys = new Set();
  let shipClass = 'cruiser', difficulty = 'normal', ammo = 'HE', game, playing = false;
  let operationId='northern',loadoutId='balanced',spread='narrow',binocular=false,savedBattle=null,saveTimer=0;
  const ACTIVE_KEY='iron-tide.active.v2', CAREER_KEY='iron-tide.career.v2', TRAINING_KEY='iron-tide.training.v1';
  const difficultyNames={easy:'입문',normal:'표준',hard:'베테랑'};
  let trainingSession=null,trainingNoticeShown=false,sessionContext={sessionType:'free',campaignRunId:null,campaignStage:null};
  let targetChosen=false,contactFocus=null,aimAssistUntil=0;
  let paused = false, helpWasPaused = false, tactical = false, resultShown = false;
  let targetId = null, firing = false, fireQueuedUntil = 0, touchTurn = 0, pointer = null, aim = {x:0,y:0};
  let width = innerWidth, height = innerHeight, zoom = .65, camera = {x:0,y:0};
  let accumulator = 0, previous = performance.now(), uiTimer = 0, eventCursor = 0;
  let oldBreakdown = {}, sustainedUntil = 0, oldKills = 0, oldTaken = 0, lastReload = 0, feedbackUntil = 0;
  let hintUntil = 25, modalReturnFocus = null;
  let career=IT.Career.empty();
  try {
    const raw=JSON.parse(localStorage.getItem(CAREER_KEY)||'null');
    if(raw)career=IT.Career.normalize(raw);
    else {
      const legacy=JSON.parse(localStorage.getItem('iron-tide.stats.v1')||'{}');
      career=IT.Career.normalize({...career,battles:legacy.battles||0,wins:legacy.wins||0,bestDamage:legacy.bestDamage||0});
    }
  }catch(_){}
  const esc = x => String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  class AudioDesk {
    constructor() { this.ctx=null;this.master=null;this.enabled=true;this.noise=null; }
    init() {
      if (!this.ctx) {
        const AudioContext=window.AudioContext||window.webkitAudioContext;
        if (!AudioContext) return;
        try {
          this.ctx=new AudioContext();this.master=this.ctx.createGain();
          this.master.gain.value=this.enabled?.32:0;this.master.connect(this.ctx.destination);
          const n=this.ctx.sampleRate*2;this.noise=this.ctx.createBuffer(1,n,this.ctx.sampleRate);
          const a=this.noise.getChannelData(0);for(let i=0;i<n;i++)a[i]=Math.random()*2-1;
        } catch (_) { return; }
      }
      if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    }
    toggle(){this.enabled=!this.enabled;this.init();if(this.master)this.master.gain.setTargetAtTime(this.enabled?.32:0,this.ctx.currentTime,.05);this.sync();}
    sync(){const b=$('soundButton');b.classList.toggle('muted',!this.enabled);b.setAttribute('aria-label',this.enabled?'소리 끄기':'소리 켜기');b.title=this.enabled?'소리 끄기':'소리 켜기';}
    tone(freq=440,duration=.12,volume=.14,type='sine',end=0){
      if(!this.ctx||!this.enabled)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type=type;o.frequency.setValueAtTime(freq,t);if(end)o.frequency.exponentialRampToValueAtTime(end,t+duration);
      g.gain.setValueAtTime(.001,t);g.gain.exponentialRampToValueAtTime(volume,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);
      o.connect(g);g.connect(this.master);o.start(t);o.stop(t+duration+.05);
    }
    burst(duration=.35,volume=.6,frequency=500){
      if(!this.ctx||!this.enabled||!this.noise)return;const t=this.ctx.currentTime,s=this.ctx.createBufferSource(),f=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
      s.buffer=this.noise;f.type='lowpass';f.frequency.setValueAtTime(frequency,t);f.frequency.exponentialRampToValueAtTime(80,t+duration);
      g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);s.connect(f);f.connect(g);g.connect(this.master);s.start(t);s.stop(t+duration);
    }
    cannon(){this.burst(.7,.85,950);this.tone(83,.4,.3,'triangle',32);}
    impact(){this.burst(.25,.35,1500);this.tone(180,.12,.09,'triangle',70);}
    click(){this.tone(610,.06,.05,'sine',410);}
  }
  const sound = new AudioDesk();

  function resetInput(){keys.clear();firing=false;fireQueuedUntil=0;touchTurn=0;pointer=null;accumulator=0;all('.held').forEach(b=>b.classList.remove('held'));}
  function baseZoom(){return clamp(Math.min(width/1700,height/1050),.37,.78);}
  function resize(){width=innerWidth;height=innerHeight;renderer.resize(width,height,Math.min(devicePixelRatio||1,2));if(!tactical)zoom=baseZoom();$('battleHint').innerHTML=width<=650?'왼쪽 ＋로 증속 · ◀ ▶로 선회<br>바다를 터치해 조준한 뒤 FIRE로 발사':'<kbd>W</kbd> 속도를 올리고 <kbd>A</kbd><kbd>D</kbd>로 선회하세요. <span>마우스로 조준 · 클릭으로 일제사격</span>';}
  function visibleEnemy(s){return s.hp>0&&s.team!==game.player.team&&IT.isVisible(game,s);}
  function selectedTarget(){return game.ships.find(s=>s.id===targetId&&visibleEnemy(s))||null;}
  function displayRecord(){
    const rank=IT.Career.rank(career.xp);
    $('bestRecord').textContent=career.battles?`${career.wins}승 / ${career.battles}회 출격 · 최고 피해 ${num(career.bestDamage)}`:'새로운 항해를 시작하세요';
    $('careerRank').textContent=`${rank.name} · 함장 Lv.${rank.level}`;
    $('careerXp').textContent=rank.next?`${num(rank.current)} / ${num(rank.next)} XP`:`최고 계급 · ${num(career.xp)} XP`;
    $('careerFill').style.width=`${clamp(rank.progress,0,1)*100}%`;
    const expedition=career.campaign,active=expedition.status==='active';
    $('campaignStatus').textContent=active?`${difficultyNames[expedition.difficulty]} · ${expedition.stage+1}/3 작전 · ${expedition.attempts}회 도전`:expedition.status==='completed'?`원정 완료 · 총 ${career.campaignCompletions}회 완주`:'승리로 이어 가는 3연전';
    $('campaignStages').innerHTML=IT.CAMPAIGN_STAGES.map((id,i)=>`<span class="${expedition.stage>i?'done':active&&expedition.stage===i?'active':''}"><small>0${i+1}</small>${esc(IT.OPERATIONS[id].name)}<b>${expedition.stage>i?'✓':active&&expedition.stage===i?'진행':'대기'}</b></span>`).join('');
    $('campaignButton').textContent=active?`원정 ${expedition.stage+1}단계 계속하기 →`:expedition.status==='completed'?'새 원정 시작하기 →':'원정 시작하기 →';
    const progress=loadTrainingProgress();
    $('trainingButton').textContent=progress.completed?'훈련 다시 하기 ↗':progress.step?`훈련 ${progress.step+1}/5 계속하기 ↗`:'기초 훈련 시작 ↗';
  }
  function operation(){return IT.OPERATIONS[operationId]||IT.OPERATIONS.northern;}
  function refreshDossier(){
    const p=IT.CLASSES[shipClass],m=IT.LOADOUTS[loadoutId].modifiers,op=operation();
    $('dossierCode').textContent={destroyer:'DD / DESTROYER',cruiser:'CA / CRUISER',battleship:'BB / BATTLESHIP'}[shipClass];
    $('dossierName').textContent=p.name;$('dossierType').textContent=`${p.type} · ${IT.LOADOUTS[loadoutId].name}`;
    $('dossierHp').textContent=num(p.maxHp*(m.maxHp||1));
    $('dossierSpeed').innerHTML=`${((p.displayKnots||32)*(m.maxSpeed||1)).toFixed(1)} <em>kn</em>`;
    $('dossierReload').innerHTML=`${(p.reloadMax*(m.reload||1)).toFixed(1)} <em>s</em>`;
    $('dossierDesc').textContent=`${p.description} ${IT.LOADOUTS[loadoutId].description}`;
    $('operationTop').textContent=op.name;$('operationDescription').textContent=op.description;
    $('operationEyebrow').innerHTML=`<span></span> OPERATION ${String(Object.keys(IT.OPERATIONS).indexOf(operationId)+1).padStart(2,'0')} · ${esc(op.name)}`;
    Array.from($('operationSelect').options).forEach(o=>{const op=IT.OPERATIONS[o.value],stars=career.operations[o.value]?.bestStars||0;o.textContent=`${op.name} · ${op.mode==='domination'?'거점 점령':op.mode==='control'?'중앙 통제':'함대 격파'}${stars?' ★'+stars:''}`;});
    Array.from($('loadoutSelect').options).forEach(o=>o.textContent=IT.LOADOUTS[o.value].name);
    $('operationSelect').value=operationId;$('loadoutSelect').value=loadoutId;
    const mastery=career.operations[operationId]?.bestByDifficulty||{};
    $('operationMastery').innerHTML=Object.entries(difficultyNames).map(([id,name])=>`<span class="${id===difficulty?'active':''}"><small>${name}</small><b>${'★'.repeat(mastery[id]||0)}${'☆'.repeat(3-(mastery[id]||0))}</b></span>`).join('');
    const record=career.classes[shipClass];$('classRecord').textContent=record?.battles?`함종 기록 · ${record.battles}회 출격 / ${record.wins}승 · 최고 피해 ${num(record.bestDamage)}`:'이 함종의 첫 전투 기록을 남겨 보세요.';
    all('[data-class]').forEach(b=>{const active=b.dataset.class===shipClass;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
    all('[data-difficulty]').forEach(b=>{const active=b.dataset.difficulty===difficulty;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  }
  function saveBattle(){
    if(trainingSession)return saveTraining();
    if(!playing||!game||game.phase!=='playing'||!IT.serializeGame)return false;
    try{
      const snapshot=IT.serializeGame(game);if(!snapshot)return false;
      const control=IT.Interaction.control({ammo,spread,aimX:aim.x,aimY:aim.y,binocular,targetId,...sessionContext},game);
      const envelope={version:3,savedAt:Date.now(),snapshot,control};localStorage.setItem(ACTIVE_KEY,JSON.stringify(envelope));
      savedBattle=envelope;saveTimer=0;$('autosaveNotice').textContent='현재 작전이 자동 저장되었습니다. 항구에서 계속할 수 있습니다.';return true;
    }catch(_){$('autosaveNotice').textContent='이 브라우저에서 자동 저장을 사용할 수 없습니다.';return false;}
  }
  function refreshResume(){
    savedBattle=null;
    try{const raw=JSON.parse(localStorage.getItem(ACTIVE_KEY)||'null');if(raw?.snapshot){const restored=IT.restoreGame(raw.snapshot);if(restored?.phase==='playing'&&!career.recordedMatchIds.includes(restored.matchId))savedBattle=raw;}}catch(_){}
    $('resumeBattle').hidden=!savedBattle;
    $('startButton').querySelector('small').textContent=savedBattle?'새 출격 시 진행 중인 작전을 대체합니다':'DEPLOY TO BATTLE';
    if(savedBattle){const restored=IT.restoreGame(savedBattle.snapshot);const op=IT.OPERATIONS[restored.operationId]||IT.OPERATIONS.northern;
      $('resumeLabel').textContent=`${op.name} · ${restored.player.name} · ${Math.floor(restored.time/60)}분 ${Math.floor(restored.time%60)}초 진행`;}
  }
  function loadTrainingProgress(){
    try{return IT.Training.normalizeProgress(JSON.parse(localStorage.getItem(TRAINING_KEY)||'null'));}catch(_){return IT.Training.normalizeProgress(null);}
  }
  function saveTraining(){
    if(!trainingSession)return false;
    try{localStorage.setItem(TRAINING_KEY,JSON.stringify(IT.Training.mergeProgress(loadTrainingProgress(),IT.Training.progress(trainingSession))));$('autosaveNotice').textContent='훈련 진도를 저장했습니다. 다시 열면 현재 단계의 시작부터 진행합니다.';return true;}
    catch(_){$('autosaveNotice').textContent='훈련 진도를 저장할 수 없습니다. 이 페이지에서는 계속할 수 있습니다.';return false;}
  }
  function saveCareer(){try{localStorage.setItem(CAREER_KEY,JSON.stringify(career));return true;}catch(_){return false;}}
  function harbor(){
    if(trainingSession)saveTraining();else if(playing&&game?.phase==='playing')saveBattle();
    resetInput();playing=false;paused=false;tactical=false;binocular=false;resultShown=false;trainingSession=null;trainingNoticeShown=false;sessionContext={sessionType:'free',campaignRunId:null,campaignStage:null};$('helpButton').disabled=false;
    ['historyOverlay','pauseOverlay','helpOverlay','resultOverlay','trainingOverlay','trainingHud','battleHud','scoreboard','pauseButton'].forEach(id=>$(id).hidden=true);
    $('harbor').hidden=false;$('menuTop').hidden=false;document.body.classList.remove('battle-active','training-active','no-cursor');
    game=IT.createGame({shipClass,difficulty,operationId,loadoutId,seed:31415});
    game.player.angle=-.66;game.player.gunAngle=-.66;game.player.speed=6;
    camera.x=game.player.x;camera.y=game.player.y;refreshDossier();displayRecord();refreshResume();
  }
  function prepareBattle(isResume, savedControl){
    sound.init();sound.click();resetInput();playing=true;paused=false;tactical=false;resultShown=false;trainingNoticeShown=false;$('helpButton').disabled=false;saveTimer=0;
    const restored=IT.Interaction.control(savedControl,game);
    ammo=restored.ammo;spread=restored.spread;binocular=restored.binocular;targetId=restored.targetId;targetChosen=!!targetId;contactFocus=null;aimAssistUntil=0;
    oldBreakdown={...game.damageBreakdown};sustainedUntil=0;oldKills=game.stats.kills;oldTaken=game.stats.damageTaken;lastReload=game.player.reload;
    eventCursor=isResume?Math.max(0,...game.events.map(e=>Number(e.id)||0)):0;hintUntil=game.time+(isResume?8:25);feedbackUntil=0;
    camera.x=game.player.x;camera.y=game.player.y;zoom=baseZoom();
    aim={x:restored.aimX,y:restored.aimY};
    ['harbor','menuTop','historyOverlay','pauseOverlay','helpOverlay','resultOverlay','trainingOverlay'].forEach(id=>$(id).hidden=true);
    ['battleHud','scoreboard','pauseButton'].forEach(id=>$(id).hidden=false);
    $('tacticalLabel').hidden=true;$('combatFeed').replaceChildren();$('hitFeedback').textContent='';$('sustainedDamage').textContent='';
    document.body.classList.add('battle-active','no-cursor');document.body.classList.toggle('training-active',!!trainingSession);
    $('trainingHud').hidden=!trainingSession;document.querySelector('.mission').hidden=!!trainingSession;$('scoreboard').hidden=!!trainingSession;
    $('playerCode').textContent=IT.CLASSES[game.player.classId].code;$('playerName').textContent=game.player.name;
    const torp=all('[data-ammo="TORP"]')[0];torp.disabled=game.player.torpReloadMax<=0;torp.classList.toggle('unavailable',torp.disabled);torp.title=torp.disabled?'이 전함에는 어뢰가 없습니다':'어뢰 (3)';
    $('abilityLabel').textContent=game.player.consumables.ability.kind==='smoke'?'연막':'음파';
    all('[data-consumable]').forEach(b=>b.title=game.player.consumables[b.dataset.consumable].label);
    const op=IT.OPERATIONS[game.operationId];$('missionName').textContent=(sessionContext.sessionType==='campaign'?`원정 ${sessionContext.campaignStage+1}/3 · `:'')+op.subtitle;
    $('missionGoal').textContent=op.mode==='elimination'?'적 함대를 격파하고 기함을 지키세요':op.mode==='control'?'중앙 거점을 확보하고 유지하세요':'거점을 확보하고 적 함대를 격파하세요';
    $('missionDetail').textContent=op.mode==='elimination'?`${Math.round(op.duration/60)}분 결전 · 시간 종료 시 팀 잔존 HP 비율 판정`:`${op.targetScore}점 선취 · 거점 ${game.zones.map(z=>z.id).join(' / ')}`;
    $('mapOperationName').textContent=trainingSession?'기초 훈련 해역':op.name;
    $('captureButton').innerHTML=op.mode==='elimination'?'<kbd>G</kbd> 아군 집결':'<kbd>G</kbd> 거점 지시';$('captureButton').disabled=!!trainingSession;
    $('binocularButton').setAttribute('aria-pressed',String(binocular));$('binocularButton').classList.toggle('active',binocular);
    $('spreadButton').innerHTML=spread==='wide'?'<kbd>C</kbd> 넓은 확산':'<kbd>C</kbd> 좁은 확산';$('spreadButton').setAttribute('aria-pressed',String(spread==='wide'));$('spreadButton').disabled=torp.disabled;
    if(trainingSession){const brief=IT.Training.brief(trainingSession);targetId=brief.targetId;targetChosen=!!targetId;$('restartButton').textContent='이 훈련 다시 시작';}
    else $('restartButton').textContent=sessionContext.sessionType==='campaign'?'현재 원정 단계 재시작':'다시 출격';
    setAmmo(ammo);updateHUD();if(!trainingSession)saveBattle();document.activeElement?.blur();
  }
  function launchBattle(context){
    trainingSession=null;sessionContext=context;
    game=IT.createGame({shipClass,difficulty,operationId,loadoutId,seed:Date.now()>>>0});
    game.matchId=`it3-${Date.now().toString(36)}-${game.seed.toString(36)}`;game.player.throttle=2;prepareBattle(false);
  }
  function start(){launchBattle({sessionType:'free',campaignRunId:null,campaignStage:null});}
  function startCampaign(){
    career=IT.Career.startCampaign(career,{runId:`run-${Date.now().toString(36)}`,difficulty});saveCareer();
    const expedition=career.campaign;if(expedition.status!=='active')return;
    operationId=IT.CAMPAIGN_STAGES[expedition.stage];difficulty=expedition.difficulty;
    launchBattle({sessionType:'campaign',campaignRunId:expedition.runId,campaignStage:expedition.stage});
  }
  function startTraining(){
    const progress=loadTrainingProgress();trainingSession=IT.Training.create({step:progress.completed?0:progress.step});
    sessionContext={sessionType:'training',campaignRunId:null,campaignStage:null};game=trainingSession.game;prepareBattle(false);
  }
  function restartBattle(){
    if(trainingSession){trainingSession=IT.Training.restart(trainingSession);game=trainingSession.game;prepareBattle(false);}
    else if(sessionContext.sessionType==='campaign')startCampaign();else start();
  }
  function showTrainingResult(){
    if(trainingNoticeShown)return;trainingNoticeShown=true;paused=true;resetInput();$('helpButton').disabled=true;
    const brief=IT.Training.brief(trainingSession),passed=brief.complete,last=trainingSession.step===4;
    $('trainingResultTitle').textContent=passed?(last?'기초 훈련 수료':'훈련 목표 달성'):'이 단계 다시 도전';
    $('trainingResultNote').textContent=passed?(last?'조함, 두 탄종, 어뢰와 거점 점령을 모두 실제 전투 규칙으로 완료했습니다. 항구에서 작전이나 원정에 출격하세요.':`${brief.title} 완료. 다음 단계는 새로운 훈련 장면에서 시작합니다.`):(brief.instruction||'표적이나 기함을 잃었습니다. 이 단계를 다시 시작하세요.');
    const saved=saveTraining();if(!saved)$('trainingResultNote').textContent+=' 브라우저에 진도를 저장하지 못했습니다.';
    $('trainingContinue').hidden=!passed;$('trainingContinue').textContent=last?'수료하고 항구로 →':'다음 훈련으로 →';
    $('trainingRetry').textContent=passed?'이 단계 한 번 더 훈련':'이 단계 다시 도전';$('trainingOverlay').hidden=false;(passed?$('trainingContinue'):$('trainingRetry')).focus();
  }
  function continueTraining(){
    if(!trainingSession?.stageComplete)return;
    trainingSession=IT.Training.advance(trainingSession);
    if(trainingSession.complete){harbor();return;}
    game=trainingSession.game;prepareBattle(false);
  }
  function resumeSaved(){
    const envelope=savedBattle,restored=envelope&&IT.restoreGame(envelope.snapshot);
    if(!restored){refreshResume();return;}
    game=restored;trainingSession=null;shipClass=game.player.classId;difficulty=game.difficulty;operationId=game.operationId||'northern';loadoutId=game.loadoutId||'balanced';
    if(!game.matchId)game.matchId=`it3-resume-${game.seed}`;
    const control=IT.Interaction.control(envelope.control,game);
    sessionContext={sessionType:control.sessionType,campaignRunId:control.campaignRunId,campaignStage:control.campaignStage};prepareBattle(true,control);
  }

  function setAmmo(next){
    if(next==='TORP'&&game.player.torpReloadMax<=0)return;
    ammo=next;fireQueuedUntil=0;aimAssistUntil=0;all('[data-ammo]').forEach(b=>{const on=b.dataset.ammo===ammo;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
    $('ammoDescription').textContent={HE:'고폭탄 · 안정적인 피해와 화재 유발',AP:'철갑탄 · 적 측면을 노려 장갑을 관통',TORP:'어뢰 · 함선 측면 발사 구역 안에서 조준'}[ammo];
  }
  function throttleStep(delta){game.player.throttle=clamp(game.player.throttle+delta,-1,4);sound.click();}
  function activate(key){if(!playing||paused||game.phase!=='playing')return;sound.init();if(IT.useConsumable(game,key)){sound.tone(480,.18,.1,'sine',720);updateHUD();}else sound.tone(150,.1,.03);}
  function toggleMap(){if(!playing||paused)return;tactical=!tactical;resetInput();binocular=false;$('binocularButton').classList.remove('active');$('binocularButton').setAttribute('aria-pressed','false');$('tacticalLabel').hidden=!tactical;pointer=null;sound.click();}
  function toggleBinocular(){if(!playing||paused)return;fireQueuedUntil=0;binocular=!binocular;tactical=false;$('tacticalLabel').hidden=true;$('binocularButton').classList.toggle('active',binocular);$('binocularButton').setAttribute('aria-pressed',String(binocular));pointer=null;sound.click();}
  function toggleSpread(){if(!playing||paused||game.player.torpReloadMax<=0)return;spread=spread==='narrow'?'wide':'narrow';$('spreadButton').innerHTML=spread==='wide'?'<kbd>C</kbd> 넓은 확산':'<kbd>C</kbd> 좁은 확산';$('spreadButton').setAttribute('aria-pressed',String(spread==='wide'));sound.click();}
  function orderFocus(){if(!playing||paused||trainingSession)return;const t=selectedTarget();if(t&&IT.issueOrder(game,{type:'focus',targetId:t.id}))sound.tone(640,.12,.07);}
  function orderCapture(){if(!playing||paused||trainingSession)return;if(!game.zones.length){IT.issueOrder(game,{type:'regroup'});return;}const zones=[...game.zones].sort((a,b)=>Math.hypot(a.x-game.player.x,a.y-game.player.y)-Math.hypot(b.x-game.player.x,b.y-game.player.y));const current=game.order?.type==='capture'?zones.findIndex(z=>z.id===game.order.zoneId):-1;IT.issueOrder(game,{type:'capture',zoneId:zones[(current+1)%zones.length].id});sound.click();}
  function selectTarget(id){targetId=id;targetChosen=true;contactFocus=null;fireQueuedUntil=0;aimAssistUntil=0;}
  function cycleTarget(){
    if(!playing||paused)return;
    const targets=game.ships.filter(visibleEnemy).sort((a,b)=>Math.hypot(a.x-game.player.x,a.y-game.player.y)-Math.hypot(b.x-game.player.x,b.y-game.player.y));
    if(targets.length){selectTarget(targets[(targets.findIndex(s=>s.id===targetId)+1)%targets.length].id);pointer=null;sound.click();}
  }
  function leadAim(){
    if(!playing||paused)return;const target=selectedTarget();if(!target)return;
    const profile=IT.CLASSES[game.player.classId],speed=ammo==='TORP'?profile.torpSpeed:profile.shellSpeed;
    if(!(speed>0))return;
    const point=IT.predictIntercept(game.player,target,speed);aim={x:point.x,y:point.y};pointer=null;fireQueuedUntil=0;aimAssistUntil=game.time+2.2;sound.click();
  }
  function queueShot(){
    const solution=IT.getWeaponSolution(game,game.player,ammo,aim.x,aim.y,spread);
    const duration=IT.Interaction.queueDuration(solution);fireQueuedUntil=duration>0?game.time+duration:0;
  }

  function pause(on=!paused){
    if(!playing||game.phase!=='playing'||trainingNoticeShown)return;
    paused=on;resetInput();$('pauseOverlay').hidden=!on;if(on)saveBattle();
    if(on){modalReturnFocus=document.activeElement;$('resumeButton').focus();}else document.activeElement?.blur();
  }
  function help(){if(resultShown||trainingNoticeShown)return;helpWasPaused=paused;if(playing){paused=true;resetInput();}$('pauseOverlay').hidden=true;modalReturnFocus=document.activeElement;$('helpOverlay').hidden=false;$('closeHelp').focus();sound.click();}
  function closeHelp(){ $('helpOverlay').hidden=true;if(playing){paused=helpWasPaused;$('pauseOverlay').hidden=!paused;}modalReturnFocus?.focus?.();resetInput();}
  function fleetHpRatio(team){const ships=game.ships.filter(s=>s.team===team);return ships.reduce((sum,s)=>sum+s.hp,0)/Math.max(1,ships.reduce((sum,s)=>sum+s.maxHp,0));}
  function finish(){
    if(trainingSession){showTrainingResult();return;}
    if(resultShown)return;resultShown=true;resetInput();paused=true;$('helpButton').disabled=true;
    const report=IT.Career.summarize(game,sessionContext),won=game.phase==='won',draw=game.phase==='draw';
    $('resultOverlay').hidden=false;$('resultOverlay').querySelector('.modal').classList.toggle('lost',!won&&!draw);
    $('resultEyebrow').textContent=won?'OPERATION COMPLETE':draw?'OPERATION ENDED':'OPERATION FAILED';
    $('resultTitle').textContent=won?'작전 성공':draw?'무승부':'작전 종료';$('resultEmblem').textContent=won?'✦':draw?'◇':'⌁';
    $('resultReason').textContent=`${operation().name} · ${game.reason||'전투 종료'}`;
    $('resultBlue').textContent=game.mode==='elimination'?`${Math.round(fleetHpRatio(0)*100)}%`:Math.round(game.score[0]);$('resultRed').textContent=game.mode==='elimination'?`${Math.round(fleetHpRatio(1)*100)}%`:Math.round(game.score[1]);
    $('resultScoreLabel').textContent=game.mode==='elimination'?'FLEET HP':'FINAL SCORE';
    $('resultDamage').textContent=num(game.stats.damage);$('resultKills').textContent=game.stats.kills;$('resultHits').textContent=game.stats.hits;$('resultCaps').textContent=game.stats.caps;
    $('resultAccuracy').textContent=`${Math.round(report.accuracy*100)}%`;
    $('resultStars').innerHTML=[0,1,2].map(i=>`<span class="${i<report.stars?'earned':''}">★</span>`).join('');$('resultStars').setAttribute('aria-label',`작전 평가 ${report.stars} / 3`);
    // A resumed match may already have been settled by another view of the same browser.
    try{const raw=JSON.parse(localStorage.getItem(CAREER_KEY)||'null');if(raw){const latest=IT.Career.normalize(raw);if(latest.battles>=career.battles)career=latest;}}catch(_){}
    const beforeXp=career.xp,before=IT.Career.rank(beforeXp);career=IT.Career.record(career,report,game.matchId);const after=IT.Career.rank(career.xp);
    $('resultXp').textContent=`+${num(career.xp-beforeXp)} XP · ${after.name}${after.level>before.level?' 진급!':''}`;
    const breakdown={...(report.damageBreakdown||game.damageBreakdown||{})};
    const remaining=game.stats.damage-Object.values(breakdown).reduce((sum,value)=>sum+value,0);
    const labels={HE:'고폭탄',AP:'철갑탄',TORP:'어뢰',FIRE:'화재',FLOOD:'침수',SECONDARY:'부포'};
    if(remaining>.5){breakdown.RAM=remaining;labels.RAM='충돌';}
    const max=Math.max(1,...Object.values(breakdown));
    $('damageBreakdown').innerHTML=Object.entries(labels).map(([key,label])=>`<div><span>${label}</span><div><i style="width:${clamp((breakdown[key]||0)/max*100,0,100)}%"></i></div><strong>${num(breakdown[key])}</strong></div>`).join('');
    $('resultAchievements').innerHTML=(report.achievements||[]).map(a=>`<span>✦ ${esc(a.label)}</span>`).join('');
    $('campaignReport').hidden=sessionContext.sessionType!=='campaign';
    $('playAgain').innerHTML='다시 출격하기 <span>↗</span>';$('nextOperation').textContent='다음 작전 준비하기 →';
    if(sessionContext.sessionType==='campaign'){
      const expedition=career.campaign,complete=expedition.status==='completed';
      $('campaignReport').innerHTML=`<strong>${complete?'군도 원정 완주':won?`${sessionContext.campaignStage+1}단계 승리 · 다음 해역 개방`:'현재 원정 단계를 다시 도전하세요'}</strong><p>${complete?'세 해역을 모두 승리했습니다.':`다음 출격: ${esc(IT.OPERATIONS[IT.CAMPAIGN_STAGES[expedition.stage]].name)} · ${difficultyNames[expedition.difficulty]}`}</p><span>${expedition.attempts}회 도전 · 누적 피해 ${num(expedition.totalDamage)} · ${num(expedition.totalXp)} XP</span>`;
      $('playAgain').textContent=complete?'새 원정 시작하기 ↗':won?'다음 원정 단계 출격 →':'같은 원정 단계 재도전 ↗';
      $('nextOperation').textContent='항구에서 출격 준비하기 →';
    }
    const recordSaved=saveCareer();
    try{localStorage.removeItem(ACTIVE_KEY);}catch(_){}
    $('resultSaveNotice').hidden=recordSaved;$('resultSaveNotice').textContent=recordSaved?'':'브라우저 저장 공간을 사용할 수 없어 전투 기록을 저장하지 못했습니다.';
    savedBattle=null;sound.tone(won?523:196,.8,.15,'sine',won?784:98);$('playAgain').focus();
  }

  function openHistory(){
    $('historySummary').textContent=`${career.battles}회 출격 · ${career.wins}승 · 최고 피해 ${num(career.bestDamage)}`;
    $('historyList').innerHTML=career.history.length?'<table><thead><tr><th>작전</th><th>결과</th><th>피해</th><th>평가</th></tr></thead><tbody>'+career.history.map(h=>`<tr><td>${esc(IT.OPERATIONS[h.operationId].name)}<small>${esc(new Date(h.date).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}))} · ${esc(IT.CLASSES[h.shipClass].type)}<br>${esc(difficultyNames[h.difficulty]||'표준')} · ${esc(IT.LOADOUTS[h.loadoutId||'balanced'].name)}${h.sessionType==='campaign'?' · 원정':''}</small></td><td class="${h.won?'won':'lost'}">${h.won?'승리':h.phase==='draw'?'무승부':'패배'}</td><td>${num(h.damage)}</td><td>${'★'.repeat(h.stars)}${'☆'.repeat(3-h.stars)}</td></tr>`).join('')+'</tbody></table>':'<p class="empty-history">첫 작전을 완료하면 이곳에 전투 보고서가 기록됩니다.</p>';
    $('historyOverlay').hidden=false;$('closeHistory').focus();
  }
  function closeHistory(){$('historyOverlay').hidden=true;$('historyButton').focus();}
  function setText(id,value){const e=$(id);if(e.textContent!==String(value))e.textContent=value;}
  function updateHUD(){
    if(!playing)return;const p=game.player;
    const hpMode=game.mode==='elimination',blue=hpMode?fleetHpRatio(0):game.score[0]/game.targetScore,red=hpMode?fleetHpRatio(1):game.score[1]/game.targetScore;
    setText('blueScore',hpMode?`${Math.round(blue*100)}%`:Math.floor(game.score[0]));setText('redScore',hpMode?`${Math.round(red*100)}%`:Math.floor(game.score[1]));
    $('blueBar').style.width=`${clamp(blue*100,0,100)}%`;$('redBar').style.width=`${clamp(red*100,0,100)}%`;
    const t=Math.max(0,Math.ceil(game.duration-game.time));setText('battleClock',`${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`);
    const zonesMarkup=game.zones.map(z=>`<span class="${z.owner===0?'blue-zone':z.owner===1?'red-zone':''} ${z.contested?'contested':''}" title="거점 ${z.id}"><b>${z.id}</b></span>`).join('');
    if($('zoneBadges').innerHTML!==zonesMarkup)$('zoneBadges').innerHTML=zonesMarkup;
    const fleet=game.ships.filter(s=>s.team===0).map(s=>`<span class="${s.hp<=0?'dead':''}" title="${esc(s.name)}"></span>`).join('')+'<i></i>'+game.ships.filter(s=>s.team===1).map(s=>`<span class="red-ship ${s.hp<=0?'dead':''}" title="적 함선"></span>`).join('');
    if($('fleetIcons').innerHTML!==fleet)$('fleetIcons').innerHTML=fleet;
    setText('playerHp',`${num(p.hp)} / ${num(p.maxHp)}`);$('hpFill').style.width=`${Math.max(0,p.hp/p.maxHp)*100}%`;$('hpFill').style.background=p.hp/p.maxHp<.25?'var(--coral)':'var(--mint)';
    setText('speedNumber',((p.speed/IT.CLASSES[p.classId].maxSpeed)*(IT.CLASSES[p.classId].displayKnots||32)).toFixed(1));
    const preview=Math.max(0,p.repairPreview||0);$('healFill').style.display=preview>0?'block':'none';$('healFill').style.width=`${clamp((p.hp+preview)/p.maxHp,0,1)*100}%`;
    $('moduleStatus').innerHTML=['engine','rudder','guns'].map(k=>{const m=p.modules?.[k]||{state:'normal',time:0};const label={engine:'기관',rudder:'조타',guns:'주포'}[k];return `<span class="${m.state}" title="${label} ${m.state==='critical'?'치명적 손상':m.state==='damaged'?'손상':'정상'}">${label}${m.time>0?` <small>${Math.ceil(m.time)}s</small>`:''}</span>`;}).join('');
    setText('throttleText',{'-1':'ASTERN','0':'STOP','1':'1/4 AHEAD','2':'1/2 AHEAD','3':'3/4 AHEAD','4':'FULL AHEAD'}[p.throttle]);
    all('#throttleBars i').forEach((e,i)=>e.classList.toggle('active',i<p.throttle));
    $('rudderIndicator').style.left=`${50+(touchTurn||(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0))*43}%`;
    const heading=((p.angle*180/Math.PI+90)%360+360)%360;setText('heading',`${Math.round(heading).toString().padStart(3,'0')}° ${['N','NE','E','SE','S','SW','W','NW'][Math.round(heading/45)%8]}`);
    all('[data-ammo]').forEach(b=>{const torp=b.dataset.ammo==='TORP',left=torp?p.torpReload:p.reload,max=torp?p.torpReloadMax:p.reloadMax;b.classList.toggle('reloading',left>.05);b.querySelector('small').textContent=torp&&max<=0?'미탑재':left>.05?`${left.toFixed(1)}s`:'READY';b.querySelector('.reload-fill').style.width=`${max>0?clamp(1-left/max,0,1)*100:0}%`;});
    all('[data-consumable]').forEach(b=>{const c=p.consumables[b.dataset.consumable];const active=c.active>0;b.classList.toggle('active',active);b.classList.toggle('cooldown',c.cooldown>0);const noRepair=c.kind==='repair'&&(p.repairPreview||0)<=.01;b.disabled=c.charges===0||c.cooldown>0||active||noRepair;b.title=noRepair?'회복 가능한 피해가 없습니다':c.label;b.querySelector('small').textContent=active?`${Math.ceil(c.active)}s`:c.cooldown>0?`${Math.ceil(c.cooldown)}s`:c.charges<0?'READY':`${c.charges} / ${c.maxCharges}`;});
    const target=selectedTarget();$('targetInfo').hidden=!target&&!targetId;$('focusButton').disabled=!target||!!trainingSession;$('leadButton').disabled=!target;$('targetButton').disabled=!game.ships.some(visibleEnemy);
    if(!target&&targetId){setText('targetClass','CONTACT LOST');setText('targetName','표적 접촉 상실');$('targetHp').style.width='0%';setText('targetRange','마지막 위치 유지 · Tab으로 다른 표적 선택');}
    if(target){setText('targetClass',`ENEMY ${IT.CLASSES[target.classId]?.code||''}`);setText('targetName',target.name);$('targetHp').style.width=`${target.hp/target.maxHp*100}%`;const d=Math.hypot(target.x-p.x,target.y-p.y);setText('targetRange',`${(d/1000).toFixed(2)} km · ${d<=(ammo==='TORP'?IT.CLASSES[p.classId].torpRange:p.range)?'사거리 내':'사거리 밖'}`);}
    const alerts=[];
    if(p.detected)alerts.push('<span class="danger">발각됨</span>');
    if(p.fireTime>0)alerts.push(`<span class="danger">화재 ${Math.ceil(p.fireTime)}s · Q 복구</span>`);
    if(p.floodTime>0)alerts.push(`<span class="danger">침수 ${Math.ceil(p.floodTime)}s · Q 복구</span>`);
    if(p.smokeTime>0)alerts.push(`<span class="positive">연막 ${Math.ceil(p.smokeTime)}s</span>`);
    if(p.repairTime>0)alerts.push(`<span class="positive">수리 중 ${Math.ceil(p.repairTime)}s</span>`);
    if(p.consumables.ability.active>0&&p.consumables.ability.kind==='sonar')alerts.push('<span class="positive">음파 탐지 작동</span>');
    if(p.gunAlignment>(IT.GUN_ALIGNMENT_TOLERANCE||.025)&&(firing||keys.has('Space')||game.time<fireQueuedUntil)&&ammo!=='TORP')alerts.push('<span>포탑 정렬 중</span>');
    if(game.order&&game.order.until>game.time)alerts.push(`<span class="positive">${game.order.type==='focus'?'아군 집중 공격':game.order.type==='capture'?`${esc(game.order.zoneId)} 점령 지시`:'기함으로 집결'} ${Math.ceil(game.order.until-game.time)}s</span>`);
    const alertMarkup=alerts.join('');if($('statusAlerts').innerHTML!==alertMarkup)$('statusAlerts').innerHTML=alertMarkup;
    $('battleHint').style.opacity=!trainingSession&&game.time<hintUntil?'1':'0';
    if(trainingSession){const brief=IT.Training.brief(trainingSession);setText('trainingStep',`TRAINING ${String(brief.index).padStart(2,'0')} / 05`);setText('trainingTitle',brief.title);setText('trainingInstruction',brief.instruction);$('trainingProgress').style.width=`${clamp(brief.progress,0,1)*100}%`;}
    const solution=IT.getWeaponSolution(game,p,ammo,aim.x,aim.y,spread),reason={ready:'발사 준비',cooldown:'재장전',traverse:'포탑 정렬 중',arc:'함선 측면으로 조준하세요',range:'사거리 밖',obstructed:'섬에 가려진 사선',noammo:'무장 미탑재',disabled:'주포 복구 중'}[solution.reason]||'';
    $('weaponSolution').textContent=`${reason}${solution.reason==='cooldown'?` ${solution.reload.toFixed(1)}s`:solution.reason==='traverse'?` ${(solution.alignmentTime||0).toFixed(1)}s`:''} · ${solution.barrels}/${solution.totalBarrels}${ammo==='TORP'?'발':'문'} · 비행 ${solution.flightTime.toFixed(1)}s`;
    $('weaponSolution').className='weapon-solution '+(solution.ready?'ready':['arc','range','obstructed','noammo','disabled'].includes(solution.reason)?'blocked':'waiting');
    const counters=[['관통',game.stats.penetrations],['집중방호',game.stats.citadels],['도탄',game.stats.ricochets],['화재',game.stats.fires],['어뢰',game.stats.torpHits]];
    const ribbonHtml=counters.map(([label,count])=>`<span class="${count?'active':''}">${label} <b>${count||0}</b></span>`).join('');if($('damageRibbons').innerHTML!==ribbonHtml)$('damageRibbons').innerHTML=ribbonHtml;
    const warning=game.warnings||{};$('torpedoAlert').hidden=!warning.torpedo;
    if(warning.torpedo)$('torpedoAlert').textContent=`⚠ 어뢰 접근 · ${Math.round(warning.torpedoDistance||0)}m · 회피 조타`;

    if(game.time>feedbackUntil)$('hitFeedback').style.opacity='0';
    readEvents();drawMinimap();
  }
  function readEvents(){
    const fresh=game.events.filter(e=>typeof e.id==='number'?e.id>eventCursor:!e._uiSeen);
    fresh.forEach(e=>{if(typeof e.id==='number')eventCursor=Math.max(eventCursor,e.id);else e._uiSeen=true;
      if(e.type==='kill'&&e.visible!==false&&e.shipId===targetId){targetId=null;contactFocus=null;fireQueuedUntil=0;aimAssistUntil=0;}
      if(!e.text||e.visible===false)return;
      // Individual impacts are communicated through damage feedback, not a wall of log entries.
      if(['hit','damage','muzzle','fire','ricochet','overpen','penetration','citadel'].includes(e.type))return;
      const item=document.createElement('div');item.className='feed-item '+(e.team===0?'positive':e.team===1?'negative':'');item.textContent=e.text;item.dataset.time=String(game.time);$('combatFeed').prepend(item);
    });
    const feed=$('combatFeed');Array.from(feed.children).forEach((e,i)=>{if(i>=4||game.time-Number(e.dataset.time)>9)e.remove();});
    const direct=IT.Interaction.shotFeedback(fresh,game.player.id);
    if(direct){$('hitFeedback').innerHTML=`${direct.damage>0?'+'+num(direct.damage):'0'}<small>${esc(direct.label)}${direct.count>1?' · '+direct.count+'발':''}</small>`;$('hitFeedback').style.opacity='1';$('hitFeedback').classList.remove('flash');void $('hitFeedback').offsetWidth;$('hitFeedback').classList.add('flash');feedbackUntil=game.time+2.2;if(direct.damage>0)sound.impact();else sound.tone(160,.1,.035);}
    const ongoing=[['FIRE','화재'],['FLOOD','침수'],['SECONDARY','부포']].filter(([id])=>(game.damageBreakdown[id]||0)>(oldBreakdown[id]||0)+.01);
    if(ongoing.length){$('sustainedDamage').textContent=ongoing.map(([id,label])=>`${label} 누적 ${num(game.damageBreakdown[id])}`).join(' · ');sustainedUntil=game.time+2.5;}
    $('sustainedDamage').style.opacity=game.time<sustainedUntil?'1':'0';oldBreakdown={...game.damageBreakdown};
    if(game.stats.kills>oldKills)sound.burst(.9,.6,700);
    if(game.stats.damageTaken>oldTaken){document.querySelector('.vignette').classList.add('damage-flash');setTimeout(()=>document.querySelector('.vignette').classList.remove('damage-flash'),230);sound.burst(.18,.15,350);}
    if(game.player.reload>lastReload+.5)sound.cannon();
    lastReload=game.player.reload;oldKills=game.stats.kills;oldTaken=game.stats.damageTaken;
  }
  function drawMinimap(){
    const c=mapCtx,w=c.canvas.width,h=c.canvas.height,sx=w/game.world.w,sy=h/game.world.h;
    c.clearRect(0,0,w,h);c.fillStyle='#0b2b39';c.fillRect(0,0,w,h);c.strokeStyle='#7fa1ac14';c.lineWidth=1;
    for(let x=0;x<w;x+=w/7){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=h/5){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
    game.islands.forEach(i=>{c.save();c.translate(i.x*sx,i.y*sy);c.rotate(i.rotation||0);c.fillStyle='#53665e';c.beginPath();c.ellipse(0,0,i.rx*sx,i.ry*sy,0,0,Math.PI*2);c.fill();c.restore();});
    game.zones.forEach(z=>{const col=z.owner===0?'#67cfe5':z.owner===1?'#f37a6c':'#9ab0b7';c.strokeStyle=col;c.fillStyle=col+'22';c.beginPath();c.arc(z.x*sx,z.y*sy,z.radius*sx,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=col;c.font='10px monospace';c.textAlign='center';c.fillText(z.id,z.x*sx,z.y*sy+3);});
    const known=game.lastKnown||{};Object.entries(known).forEach(([id,k])=>{const s=game.ships.find(s=>String(s.id)===id);if(!s||s.hp<=0||visibleEnemy(s)||game.time-k.time>14)return;c.strokeStyle='#ca8e7966';c.setLineDash([2,2]);c.strokeRect(k.x*sx-3,k.y*sy-3,6,6);c.setLineDash([]);});
    game.ships.forEach(s=>{if(s.hp<=0||s.team!==0&&!visibleEnemy(s))return;c.save();c.translate(s.x*sx,s.y*sy);c.rotate(s.angle);c.fillStyle=s.isPlayer?'#e1fff4':s.team===0?'#67cfe5':'#f37a6c';c.beginPath();c.moveTo(s.isPlayer?7:5,0);c.lineTo(-4,-3);c.lineTo(-2,0);c.lineTo(-4,3);c.closePath();c.fill();c.restore();});
    if(!tactical){c.strokeStyle='#d1f0e655';c.lineWidth=1;c.strokeRect((camera.x-width/renderer.zoom/2)*sx,(camera.y-height/renderer.zoom/2)*sy,width/renderer.zoom*sx,height/renderer.zoom*sy);}
  }

  function aimFromPointer(e){const r=sea.getBoundingClientRect();pointer={x:e.clientX-r.left,y:e.clientY-r.top};aim=renderer.screenToWorld(pointer.x,pointer.y);aimAssistUntil=0;}
  sea.addEventListener('pointermove',e=>{if(!playing||paused)return;if(e.pointerType==='mouse'||e.buttons)aimFromPointer(e);});
  sea.addEventListener('pointerdown',e=>{
    if(!playing||paused||game.phase!=='playing')return;if(e.button!==0&&e.pointerType==='mouse')return;
    e.preventDefault();sound.init();aimFromPointer(e);
    const picked=IT.Interaction.pickTarget(game.ships.filter(visibleEnemy),pointer,renderer);if(picked)selectTarget(picked.id);
    if(tactical){const zone=game.zones.find(z=>Math.hypot(z.x-aim.x,z.y-aim.y)<z.radius+80);if(!trainingSession){if(zone)IT.issueOrder(game,{type:'capture',zoneId:zone.id});else if(picked)IT.issueOrder(game,{type:'focus',targetId:picked.id});}pointer=null;return;}
    if(e.pointerType==='mouse'){firing=true;queueShot();}sea.setPointerCapture(e.pointerId);
  });
  sea.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')firing=false;else pointer=null;});
  sea.addEventListener('pointercancel',e=>{if(e.pointerType==='mouse')firing=false;pointer=null;});
  sea.addEventListener('lostpointercapture',e=>{if(e.pointerType==='mouse')firing=false;});
  sea.addEventListener('contextmenu',e=>e.preventDefault());
  sea.addEventListener('wheel',e=>{if(!playing||paused)return;e.preventDefault();if(!tactical)zoom=clamp(zoom*Math.exp(-e.deltaY*.001),.28,1.2);},{passive:false});
  window.addEventListener('pointerup',e=>{if(e.pointerType==='mouse')firing=false;});
  all('[data-touch]').forEach(b=>{
    const dir=b.dataset.touch;b.addEventListener('pointerdown',e=>{if(!playing||paused)return;e.preventDefault();sound.init();b.setPointerCapture(e.pointerId);b.classList.add('held');if(dir==='up'||dir==='down')throttleStep(dir==='up'?1:-1);else touchTurn=dir==='left'?-1:1;});
    const release=()=>{b.classList.remove('held');if(dir==='left'||dir==='right')touchTurn=0;};['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,release));
  });
  $('touchFire').addEventListener('pointerdown',e=>{if(!playing||paused)return;e.preventDefault();sound.init();$('touchFire').setPointerCapture(e.pointerId);firing=true;queueShot();$('touchFire').classList.add('held');});
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>$('touchFire').addEventListener(ev,()=>{firing=false;$('touchFire').classList.remove('held');}));

  document.addEventListener('keydown',e=>{
    const overlay=all('.overlay').find(x=>!x.hidden&&!x.closest('noscript'));
    if(overlay&&e.code==='Tab'){const focusable=Array.from(overlay.querySelectorAll('button:not(:disabled):not([hidden]),a[href]'));const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
    if(trainingNoticeShown)return;
    if(e.code==='Escape'){if(!$('historyOverlay').hidden){closeHistory();return;}if(!$('helpOverlay').hidden){closeHelp();return;}if(playing&&game.phase==='playing'){e.preventDefault();pause();}return;}
    if(!$('helpOverlay').hidden||!playing||game.phase!=='playing')return;
    if(e.code==='KeyP'&&!e.repeat){e.preventDefault();pause();return;}
    if(paused)return;
    if(['KeyW','KeyS','KeyA','KeyD','Space','Tab','Digit1','Digit2','Digit3','KeyQ','KeyR','KeyE','KeyM','KeyV','KeyC','KeyF','KeyG','KeyL'].includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.repeat)return;sound.init();if(e.code==='Space')queueShot();
    if(e.code==='KeyW')throttleStep(1);if(e.code==='KeyS')throttleStep(-1);
    if(e.code==='Digit1')setAmmo('HE');if(e.code==='Digit2')setAmmo('AP');if(e.code==='Digit3')setAmmo('TORP');
    if(e.code==='KeyQ')activate('damageControl');if(e.code==='KeyR')activate('repair');if(e.code==='KeyE')activate('ability');
    if(e.code==='KeyM')toggleMap();if(e.code==='Tab')cycleTarget();if(e.code==='KeyV')toggleBinocular();if(e.code==='KeyC')toggleSpread();if(e.code==='KeyF')orderFocus();if(e.code==='KeyG')orderCapture();if(e.code==='KeyL')leadAim();
  });
  document.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>{resetInput();if(playing&&!paused&&game.phase==='playing')pause(true);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing&&!paused&&game.phase==='playing')pause(true);});
  window.addEventListener('resize',resize);window.addEventListener('pagehide',()=>saveBattle());
  all('[data-class]').forEach(b=>b.addEventListener('click',()=>{shipClass=b.dataset.class;all('[data-class]').forEach(x=>{const selected=x===b;x.classList.toggle('selected',selected);x.setAttribute('aria-pressed',String(selected));});sound.init();sound.click();harbor();}));
  all('[data-difficulty]').forEach(b=>b.addEventListener('click',()=>{difficulty=b.dataset.difficulty;all('[data-difficulty]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});refreshDossier();sound.init();sound.click();}));
  all('[data-ammo]').forEach(b=>b.addEventListener('click',()=>{if(!paused){setAmmo(b.dataset.ammo);sound.click();}}));
  all('[data-consumable]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.consumable)));
  $('operationSelect').addEventListener('change',e=>{operationId=e.target.value;harbor();sound.click();});
  $('loadoutSelect').addEventListener('change',e=>{loadoutId=e.target.value;harbor();sound.click();});
  $('resumeBattle').addEventListener('click',resumeSaved);$('historyButton').addEventListener('click',openHistory);$('closeHistory').addEventListener('click',closeHistory);
  $('binocularButton').addEventListener('click',toggleBinocular);$('spreadButton').addEventListener('click',toggleSpread);$('focusButton').addEventListener('click',orderFocus);$('captureButton').addEventListener('click',orderCapture);
  $('targetButton').addEventListener('click',cycleTarget);$('leadButton').addEventListener('click',leadAim);
  $('trainingButton').addEventListener('click',startTraining);$('campaignButton').addEventListener('click',startCampaign);
  $('trainingContinue').addEventListener('click',continueTraining);$('trainingRetry').addEventListener('click',restartBattle);$('trainingExit').addEventListener('click',harbor);
  $('nextOperation').addEventListener('click',()=>{if(sessionContext.sessionType==='campaign'){if(career.campaign.status==='active')operationId=IT.CAMPAIGN_STAGES[career.campaign.stage];}else{const ids=Object.keys(IT.OPERATIONS);operationId=ids[(ids.indexOf(operationId)+1)%ids.length];}harbor();});
  $('startButton').addEventListener('click',start);$('restartButton').addEventListener('click',restartBattle);$('playAgain').addEventListener('click',()=>{if(sessionContext.sessionType==='campaign')startCampaign();else start();});
  $('returnButton').addEventListener('click',harbor);$('resultHarbor').addEventListener('click',harbor);
  $('resumeButton').addEventListener('click',()=>pause(false));$('pauseButton').addEventListener('click',()=>pause());
  ['helpButton','harborHelp','pauseHelp'].forEach(id=>$(id).addEventListener('click',help));['closeHelp','helpDone'].forEach(id=>$(id).addEventListener('click',closeHelp));
  $('soundButton').addEventListener('click',()=>sound.toggle());$('minimapButton').addEventListener('click',toggleMap);
  $('brand').addEventListener('click',e=>{e.preventDefault();if(playing&&game.phase==='playing')pause(true);});

  function frame(now){
    const dt=Math.min((now-previous)/1000,.12);previous=now;
    let renderZoom=zoom;
    const target=playing?selectedTarget():null;
    if(target)contactFocus={x:target.x,y:target.y,time:game.time};
    const lostPoint=targetId&&!target?(game.lastKnown[targetId]||contactFocus):null;
    if(!playing){
      const p=game.player,small=width<=650;renderZoom=clamp((small?width*.39:width*.28)/p.length,1.3,3);
      camera.x=p.x-(small?0:width*.23)/renderZoom;camera.y=p.y+(small?height*.33:height*.1)/renderZoom;
    }else if(tactical){renderZoom=Math.min(width/game.world.w,height/game.world.h)*.9;camera.x=game.world.w/2;camera.y=game.world.h/2;}
    else{
      const p=game.player,f=1-Math.exp(-dt*4),profile=IT.CLASSES[p.classId];
      const speed=ammo==='TORP'?profile.torpSpeed:profile.shellSpeed;
      const focal=binocular?(target?IT.predictIntercept(p,target,speed):lostPoint||{x:p.x+Math.cos(p.angle)*700,y:p.y+Math.sin(p.angle)*700}):{x:p.x+Math.cos(p.angle)*150,y:p.y+Math.sin(p.angle)*150};
      camera.x+=(focal.x-camera.x)*f;camera.y+=(focal.y-camera.y)*f;if(binocular)renderZoom=clamp(zoom*1.85,.7,1.8);
    }
    // Project input through the exact transform that will render this frame.
    renderer.setViewTransform(camera.x,camera.y,renderZoom);
    if(playing&&!paused&&game.phase==='playing'){
      if(pointer)aim=renderer.screenToWorld(pointer.x,pointer.y);
      accumulator+=dt;let steps=0;
      while(accumulator>=1/60&&steps<8){
        const oldReload=game.player.reload,oldTorpReload=game.player.torpReload;
        const controls={turn:touchTurn||((keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0)),throttle:game.player.throttle,aimX:aim.x,aimY:aim.y,fire:!tactical&&(firing||keys.has('Space')||game.time<fireQueuedUntil),ammo,spread};
        if(trainingSession)IT.Training.tick(trainingSession,1/60,controls);else IT.tickGame(game,1/60,controls);
        if(game.player.reload>oldReload+.1||game.player.torpReload>oldTorpReload+.1)fireQueuedUntil=0;
        accumulator-=1/60;steps++;
        if(trainingSession&&(trainingSession.stageComplete||trainingSession.failed)){updateHUD();showTrainingResult();break;}
        if(game.phase!=='playing')break;
      }
      if(steps>=8)accumulator=0;
      if(!trainingSession){saveTimer+=dt;if(saveTimer>=3)saveBattle();}
      if(!targetChosen){const near=game.ships.filter(visibleEnemy).sort((a,b)=>Math.hypot(a.x-game.player.x,a.y-game.player.y)-Math.hypot(b.x-game.player.x,b.y-game.player.y));if(near.length){targetId=near[0].id;targetChosen=true;}}
      if(game.phase!=='playing'&&!trainingNoticeShown){updateHUD();finish();}
    }else accumulator=0;
    renderer.render(game,{cameraX:camera.x,cameraY:camera.y,zoom:renderZoom,time:now/1000,aimX:aim.x,aimY:aim.y,targetId,ammo,spread,binocular,solution:playing?IT.getWeaponSolution(game,game.player,ammo,aim.x,aim.y,spread):null,menu:!playing,tactical,training:trainingSession?IT.Training.brief(trainingSession):null,contactLost:!!targetId&&!selectedTarget(),contactLostPoint:lostPoint,aimAssistHint:playing&&game.time<aimAssistUntil});
    uiTimer+=dt;if(uiTimer>=.1){uiTimer=0;updateHUD();}
    requestAnimationFrame(frame);
  }
  if(location.protocol==='file:')$('downloadSource').hidden=true;
  resize();harbor();sound.sync();requestAnimationFrame(frame);
})();
