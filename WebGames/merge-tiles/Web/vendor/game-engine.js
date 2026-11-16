(function (root) {
  'use strict';
  const L = root.GameLogic, palette = ['#f5bd59','#76cda9','#a09be9','#e999b4','#71b8df','#ed9a76','#b5cf75'];
  const symbols = ['●','◆','▲','★','✿','■'];
  const uuid = () => { const a = new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(x=>x.toString(16).padStart(2,'0')).join(''); };
  const safe = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function boot(config) {
    const id = config.id, rules = L.games[id]; if (!rules) throw new Error('Unknown game');
    const element = document.getElementById('game-root');
    const actionGame = ['falling-blocks','bubble-split','brick-breaker'].includes(id);
    element.innerHTML = '<div class="game-shell"><header class="game-top"><div><h1 class="game-title">'+safe(config.title)+'</h1><div class="save-state" id="save-state" role="status">플랫폼 연결 중…</div></div><div class="toolbar"><button id="pause" type="button" aria-label="게임 일시정지">잠시 쉬기</button><button id="reset" type="button">다시 시작</button><button id="help" type="button" aria-expanded="false">도움말</button></div></header><div class="hud"><div><span class="hud-label">점수</span><strong class="hud-value" id="score">0</strong></div><div><span class="hud-label" id="info-label">진행</span><strong class="hud-value" id="info">—</strong></div><div><span class="hud-label">플레이 시간</span><strong class="hud-value" id="timer">0:00</strong></div></div><div class="stage '+(actionGame?'canvas-stage':'')+'" id="stage" tabindex="0">'+(actionGame?'<canvas id="canvas" width="640" height="440" aria-label="'+safe(config.title)+' 게임 화면"></canvas>':'<div id="board" class="board" aria-label="게임 보드"></div>')+'<div class="overlay" id="overlay"><div class="overlay-box"><h2 id="overlay-title">잠깐의 틈, 한 판</h2><p id="overlay-text">'+safe(config.instructions)+'</p><button class="primary" type="button" id="primary" disabled>준비하고 있어요…</button></div></div></div><div class="controls" id="controls" aria-label="게임 조작"></div><div class="statusline" id="status" role="status">'+safe(config.instructions)+'</div><div id="help-panel" class="help-panel" hidden>'+safe(config.instructions)+'</div></div>';
    const $ = x=>document.getElementById(x), sdk = root.GameSDK;
    $('pause').disabled=true;$('reset').disabled=true;
    let state = rules.newState(), phase = 'loading', runId = uuid(), runStarted = false, runEnded = false, selected = -1, flagMode = false, hasConnection = false;
    let lastPulse = 0;
    let lastTime = 0, gravity = 0, memoryWait = 0, elapsedWhole = -1, saveTimer = 0, lastAutoSave = 0, saving = false, saveAgain = false, resetArmed = false;
    const held = new Set(), input = { direction: 0, fire: false, target: undefined };
    const send = (name, properties={}) => { if (hasConnection) sdk.event(name, properties).catch(()=>{}); };
    const status = message => { $('status').textContent = message; };
    function overlay(title,text,button) { $('overlay-title').textContent=title; $('overlay-text').textContent=text; $('primary').textContent=button; $('overlay').hidden=false; $('primary').disabled=false; }
    function snapshot() { return { gameId:id, schemaVersion:1, state:L.copy(state), runId, runStarted, runEnded }; }
    async function saveNow() {
      clearTimeout(saveTimer); if (!hasConnection) return;
      if (saving) { saveAgain=true; return; } saving=true;
      try { const result = await sdk.save(snapshot()); $('save-state').textContent=result?.local?'이 탭에 임시 저장됨':'진행 저장됨'; }
      catch (error) { $('save-state').textContent=error.code==='SAVE_CONFLICT'?'서버 기록과 충돌 · 포털의 저장 기록에서 선택':'저장 연결 지연 · 화면을 유지하세요'; }
      finally { saving=false; if(saveAgain){saveAgain=false;saveNow();} }
    }
    function queueSave() { clearTimeout(saveTimer); saveTimer=setTimeout(saveNow,650); }
    function start() {
      if (phase==='loading') return;
      if (state.status!=='playing') reset(false);
      phase='running'; $('overlay').hidden=true; $('pause').textContent='잠시 쉬기'; resetArmed=false; $('reset').textContent='다시 시작';
      if (!runStarted) { runStarted=true; send('round_start',{run_id:runId}); }
      send('game_resume');if(hasConnection)sdk.activity().catch(()=>{}); lastTime=performance.now(); $('stage').focus?.();
    }
    function pause(reason='잠시 쉬어가세요',persist=true) {
      if(phase!=='running') return; phase='paused'; held.clear(); input.direction=0; input.fire=false; input.target=undefined;
      $('pause').textContent='이어서 하기'; overlay(reason,'게임 시간은 쉬는 동안 흐르지 않습니다. 준비되면 이어서 플레이하세요.','이어서 하기'); send('game_pause'); clearTimeout(saveTimer);if(persist)saveNow();
    }
    function reset(autoStart=true) {
      if(runStarted&&!runEnded) { send('round_complete',{run_id:runId,result:'abandoned',score:state.score}); }
      state=rules.newState(); runId=uuid(); runStarted=false;runEnded=false;selected=-1;gravity=0;memoryWait=0;held.clear();input.target=undefined;input.fire=false;
      phase='ready';render();queueSave();status(config.instructions); if(autoStart)start();
    }
    function finish() {
      if(state.status==='playing'||runEnded)return;
      runEnded=true;phase='ended';renderHud();held.clear();input.fire=false;
      const won=state.status==='won'; overlay(won?'멋지게 완료했어요!':'이번 한 판, 수고했어요',`${state.score.toLocaleString()}점 · ${Math.floor(state.elapsed)}초. 기록을 저장하고 새로운 한 판을 시작할 수 있어요.`,'새로 시작');
      send('round_complete',{run_id:runId,result:won?'win':'loss',score:state.score}); send('game_pause');saveNow();
    }
    function assign(next,message) { if(next===state)return;state=next;render();queueSave();if(message)status(message);finish(); }
    function action(name) {
      if(phase!=='running')return;
      if(id==='falling-blocks'){ const before=state.lines; assign(rules.step(state,name)); if(state.lines>before)status(`${state.lines-before}줄을 지웠어요!`); if(name==='drop')gravity=0; }
      else if(id==='slide-puzzle')assign(rules.direction(state,name));
      else if(id==='merge-tiles')assign(rules.move(state,name));
      else if(id==='bubble-split'||id==='brick-breaker'){if(name==='fire')input.fire=true;}
    }
    function buildControls() {
      const a=id==='falling-blocks'?[['left','←'],['rotate','회전 ↻'],['right','→'],['down','↓'],['drop','바로 내리기']]:id==='bubble-split'||id==='brick-breaker'?[['left','←'],['fire',id==='bubble-split'?'발사 ↑':'공 발사'],['right','→']]:id==='merge-tiles'?[['left','←'],['up','↑'],['down','↓'],['right','→']]:id==='mines-grid'?[['flag','깃발 모드: 꺼짐']]:[];
      $('controls').replaceChildren();
      for(const [name,label] of a){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.action=name;
        if(name==='flag'){b.addEventListener('click',()=>{flagMode=!flagMode;b.classList.toggle('active',flagMode);b.textContent='깃발 모드: '+(flagMode?'켜짐':'꺼짐');b.setAttribute('aria-pressed',String(flagMode));});}
        else if((id==='bubble-split'||id==='brick-breaker')&&(name==='left'||name==='right')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);held.add(name);input.target=undefined;});b.addEventListener('pointerup',()=>held.delete(name));b.addEventListener('pointercancel',()=>held.delete(name));}
        else b.addEventListener('click',()=>action(name));$('controls').append(b);
      }
    }
    let cells=[];
    if(!actionGame){const klass={'match3-garden':'match','slide-puzzle':'slide','mines-grid':'mines','memory-pairs':'memory','merge-tiles':'merge'}[id];const count={'match3-garden':64,'slide-puzzle':9,'mines-grid':81,'memory-pairs':16,'merge-tiles':16}[id];$('board').classList.add(klass);
      for(let i=0;i<count;i++){const b=document.createElement(id==='merge-tiles'?'div':'button');if(b.tagName==='BUTTON'){b.type='button';b.addEventListener('click',()=>cellClick(i));b.addEventListener('contextmenu',e=>{if(id==='mines-grid'){e.preventDefault();if(phase==='running')assign(L.mines.flag(state,i));}});}cells.push(b);$('board').append(b);}
    }
    function cellClick(i){if(phase!=='running')return;
      if(id==='match3-garden'){if(selected===i){selected=-1;render();return;}if(selected<0){selected=i;render();return;}const result=L.match3.swap(state,selected,i);if(result.changed){selected=-1;assign(result.state,result.reshuffled?'새로운 조합으로 보드를 섞었어요.':result.chain>1?`${result.chain}번 연쇄! +${result.cleared}개 조각`:'좋아요! 다음 조합을 찾아보세요.');}else{selected=i;render();status('바로 옆 조각으로 같은 색 세 개 이상을 연결하세요.');}}
      else if(id==='slide-puzzle')assign(L.slide.move(state,i));
      else if(id==='mines-grid')assign(flagMode?L.mines.flag(state,i):L.mines.reveal(state,i));
      else if(id==='memory-pairs'){assign(L.memory.flip(state,i));if(state.open.length===2)memoryWait=.8;}
    }
    function renderBoard(){
      const icons=['☀','◆','●','✿','▲','♥','★','☂'];
      cells.forEach((b,i)=>{
        if(id==='match3-garden'){b.className='gem'+(selected===i?' selected':'');b.style.background=palette[state.board[i]];b.textContent=symbols[state.board[i]];b.setAttribute('aria-label',`${Math.floor(i/8)+1}행 ${i%8+1}열, ${state.board[i]+1}번 조각`);b.setAttribute('aria-pressed',String(selected===i));}
        else if(id==='slide-puzzle'){b.className='tile'+(!state.board[i]?' empty':'');b.textContent=state.board[i]||'';b.setAttribute('aria-label',state.board[i]?`${state.board[i]} 타일`:'빈칸');}
        else if(id==='mines-grid'){const shown=state.revealed[i]||(state.status==='lost'&&state.mines[i]);const n=L.mines.count(state,i);b.className='mine-cell'+(shown?' revealed':'')+(state.flags[i]?' flagged':'')+(shown&&state.mines[i]?' danger':'');b.textContent=shown?(state.mines[i]?'✹':n||''):state.flags[i]?'⚑':'';b.style.color=shown&&!state.mines[i]?['','#78b8ed','#8cd1ac','#f6ba74','#d0aaed','#ef9dba'][Math.min(n,5)]:'';b.setAttribute('aria-label',`${Math.floor(i/9)+1}행 ${i%9+1}열, ${shown?(state.mines[i]?'지뢰':`주변 지뢰 ${n}개`):state.flags[i]?'깃발':'닫힌 칸'}`);}
        else if(id==='memory-pairs'){const open=state.open.includes(i)||state.matched[i];b.className='memory-card'+(state.matched[i]?' matched':open?' open':'');b.textContent=open?icons[state.board[i]]:'?';b.setAttribute('aria-label',open?`${state.board[i]+1}번 그림${state.matched[i]?' 짝 찾음':''}`:`${i+1}번 카드`);}
        else if(id==='merge-tiles'){const v=state.board[i];b.className='merge-cell';b.textContent=v||'';const cols={2:'#d8e5d7',4:'#c7dcc1',8:'#e7be79',16:'#e9a46f',32:'#e38d77',64:'#d8797b',128:'#c69be3',256:'#a293df',512:'#7db5ce',1024:'#71bea8',2048:'#f3ce66'};b.style.background=cols[v]||'#263c50';b.style.color=v>=32?'#fff':'#203746';b.setAttribute('aria-label',v?String(v):'빈칸');}
      });
    }
    let canvas,ctx;
    if(actionGame){canvas=$('canvas');ctx=canvas.getContext('2d');if(id==='falling-blocks'){canvas.width=360;canvas.height=540;$('stage').style.aspectRatio='360/540';$('stage').style.maxWidth='330px';$('stage').style.margin='0 auto';}
      if(id==='brick-breaker'){const track=e=>{if(phase!=='running')return;const r=canvas.getBoundingClientRect();input.target=(e.clientX-r.left)/r.width*640;if(e.type==='pointerdown')input.fire=true;};canvas.addEventListener('pointermove',track);canvas.addEventListener('pointerdown',e=>{e.preventDefault();canvas.setPointerCapture(e.pointerId);track(e);});}
    }
    function roundRect(x,y,w,h,r,fill){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
    function renderCanvas(){const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#102333';ctx.fillRect(0,0,w,h);
      if(id==='falling-blocks'){const size=26,x=50,y=17;roundRect(x-3,y-3,266,474,8,'#091a28');ctx.strokeStyle='#1c3345';ctx.lineWidth=1;for(let i=0;i<=10;i++){ctx.beginPath();ctx.moveTo(x+i*size,y);ctx.lineTo(x+i*size,y+468);ctx.stroke();}for(let i=0;i<=18;i++){ctx.beginPath();ctx.moveTo(x,y+i*size);ctx.lineTo(x+260,y+i*size);ctx.stroke();}const block=(c,r,color,alpha=1)=>{ctx.globalAlpha=alpha;roundRect(x+c*size+1,y+r*size+1,24,24,4,color);ctx.globalAlpha=1;};state.board.forEach((v,i)=>{if(v)block(i%10,Math.floor(i/10),palette[v-1]);});if(state.status==='playing'){const ghost=L.copy(state.piece);while(!L.falling.collides(state.board,ghost,0,1))ghost.y++;ghost.cells.forEach((row,r)=>row.forEach((v,c)=>{if(v)block(ghost.x+c,ghost.y+r,palette[ghost.kind],.18);}));state.piece.cells.forEach((row,r)=>row.forEach((v,c)=>{if(v)block(state.piece.x+c,state.piece.y+r,palette[state.piece.kind]);}));}ctx.fillStyle='#8faabd';ctx.font='13px system-ui';ctx.textAlign='center';ctx.fillText('20줄을 완성하면 클리어',180,516);}
      else if(id==='bubble-split'){ctx.fillStyle='#18384a';ctx.fillRect(0,394,640,46);ctx.strokeStyle='#5a8491';ctx.beginPath();ctx.moveTo(0,394);ctx.lineTo(640,394);ctx.stroke();for(const ball of state.balls){const radius=L.bubble.radius(ball.level);ctx.fillStyle=palette[ball.level===2?0:ball.level===1?3:1];ctx.beginPath();ctx.arc(ball.x,ball.y,radius,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ffffff55';ctx.beginPath();ctx.arc(ball.x-radius*.26,ball.y-radius*.28,radius*.22,0,Math.PI*2);ctx.fill();}if(state.harpoon){ctx.strokeStyle='#e9e6aa';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(state.harpoon.x,394);ctx.lineTo(state.harpoon.x,state.harpoon.y);ctx.stroke();}if(state.invulnerable<=0||Math.floor(state.elapsed*10)%2===0){roundRect(state.playerX-14,386,28,31,7,'#7ddac3');ctx.fillStyle='#172b3c';ctx.fillRect(state.playerX-8,392,5,5);ctx.fillRect(state.playerX+3,392,5,5);}ctx.fillStyle='#8faabd';ctx.font='12px system-ui';ctx.textAlign='left';ctx.fillText('공을 피해 위쪽으로 발사!',15,425);}
      else if(id==='brick-breaker'){state.bricks.forEach((v,i)=>{if(v){const r=L.brick.rect(i);roundRect(r.x,r.y,r.w,r.h,5,palette[Math.floor(i/8)]);}});roundRect(state.paddleX-52,407,104,12,6,'#82dcc6');ctx.fillStyle='#f3d078';ctx.beginPath();ctx.arc(state.ball.x,state.ball.y,7,0,Math.PI*2);ctx.fill();if(state.ball.attached){ctx.fillStyle='#a8c1d2';ctx.font='14px system-ui';ctx.textAlign='center';ctx.fillText('Space 또는 공 발사',320,272);}}
    }
    function renderHud(){ $('score').textContent=Math.floor(state.score).toLocaleString();let label='',text='';
      if(id==='match3-garden'){label='남은 이동 / 목표';text=`${state.moves}회 / 1,200점`;}
      if(id==='falling-blocks'){label='완성한 줄';text=`${state.lines} / 20`;}
      if(id==='bubble-split'){label='기회 / 남은 시간';text=`${'♥'.repeat(Math.max(0,state.lives))} ${Math.ceil(state.remaining)}초`;}
      if(id==='brick-breaker'){label='기회 / 남은 벽돌';text=`${'♥'.repeat(Math.max(0,state.lives))} ${state.bricks.filter(Boolean).length}개`;}
      if(id==='slide-puzzle'||id==='merge-tiles'){label='이동 횟수';text=`${state.moves}회`;}
      if(id==='mines-grid'){label='지뢰 / 깃발';text=`10 / ${state.flags.filter(Boolean).length}`;}
      if(id==='memory-pairs'){label='찾은 짝 / 시도';text=`${state.matched.filter(Boolean).length/2}쌍 / ${state.moves}회`;}
      $('info-label').textContent=label;$('info').textContent=text;const seconds=Math.floor(state.elapsed);$('timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    }
    function render(){renderHud();if(actionGame)renderCanvas();else renderBoard();}
    function tick(now){const dt=lastTime?Math.min((now-lastTime)/1000,.05):0;lastTime=now;
      if(phase==='running'&&!document.hidden){if(hasConnection&&now-lastPulse>=1000){lastPulse=now;sdk.activity().catch(()=>{});}input.direction=(held.has('right')?1:0)-(held.has('left')?1:0);
        if(id==='bubble-split')state=L.bubble.step(state,dt,input);
        else if(id==='brick-breaker'){let remain=dt;while(remain>0){const step=Math.min(remain,.016);state=L.brick.step(state,step,input);input.fire=false;remain-=step;}}
        else{state.elapsed+=dt;if(id==='falling-blocks'){gravity+=dt;const interval=Math.max(.13,.75-(state.level-1)*.11);if(gravity>=interval){gravity=0;state=L.falling.step(state,'down');queueSave();}}
          if(id==='memory-pairs'&&state.open.length===2){memoryWait-=dt;if(memoryWait<=0){state=L.memory.close(state);renderBoard();queueSave();}}}
        input.fire=false;
        if(actionGame)renderCanvas();if(Math.floor(state.elapsed)!==elapsedWhole){elapsedWhole=Math.floor(state.elapsed);renderHud();}
        if(state.elapsed-lastAutoSave>=10){lastAutoSave=state.elapsed;saveNow();}finish();
      }
      requestAnimationFrame(tick);
    }
    $('primary').addEventListener('click',start);
    $('pause').addEventListener('click',()=>phase==='running'?pause():start());
    $('reset').addEventListener('click',()=>{if(!resetArmed&&runStarted&&state.status==='playing'){resetArmed=true;$('reset').textContent='한 번 더 눌러 초기화';setTimeout(()=>{resetArmed=false;$('reset').textContent='다시 시작';},3500);return;}reset();});
    $('help').addEventListener('click',()=>{const shown=!$('help-panel').hidden;$('help-panel').hidden=shown;$('help').setAttribute('aria-expanded',String(!shown));});
    document.addEventListener('keydown',event=>{if(event.target.tagName==='BUTTON'&&['Enter',' '].includes(event.key))return;
      const map={ArrowLeft:'left',ArrowRight:'right',ArrowDown:'down',ArrowUp:id==='falling-blocks'?'rotate':'up',' ':id==='falling-blocks'?'drop':'fire',z:'rotate',Z:'rotate'};
      if(event.key==='Escape'){pause();return;}const name=map[event.key];if(!name)return;event.preventDefault();
      if(phase!=='running'){if(event.key===' '||event.key==='Enter')start();return;}
      if(['bubble-split','brick-breaker'].includes(id)&&['left','right'].includes(name)){held.add(name);input.target=undefined;}else if(!event.repeat||!['drop','fire','rotate'].includes(name))action(name);
    });
    document.addEventListener('keyup',event=>{if(event.key==='ArrowLeft')held.delete('left');if(event.key==='ArrowRight')held.delete('right');});
    window.addEventListener('blur',()=>{held.clear();input.direction=0;});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)pause('화면을 떠나 잠시 멈췄어요');});
    window.addEventListener('pagehide',()=>{if(phase==='running')pause();else saveNow();});
    if(id==='merge-tiles'){let point=null;$('board').addEventListener('pointerdown',e=>{point={x:e.clientX,y:e.clientY};});$('board').addEventListener('pointerup',e=>{if(!point)return;const dx=e.clientX-point.x,dy=e.clientY-point.y;point=null;if(Math.max(Math.abs(dx),Math.abs(dy))>25)action(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));});}
    sdk.onPause(()=>pause('플레이 화면이 잠시 가려졌어요'));
    sdk.onSnapshot(()=>{if(phase==='loading')return null;pause('잠시 쉬어가세요',false);return snapshot();});
    window.addEventListener('error',event=>{send('runtime_error',{code:'GAME_RUNTIME',message:String(event.message||'게임 실행 오류').slice(0,240)});});
    sdk.onStatus(value=>{if(value?.message)$('save-state').textContent=value.message;});
    buildControls();render();requestAnimationFrame(tick);
    (async()=>{try{await sdk.connect();hasConnection=true;const loaded=await sdk.load();const value=loaded?.value??loaded?.payload??null;
      if(value?.gameId===id&&value?.schemaVersion===1&&L.valid(id,value.state)){state=value.state;runId=typeof value.runId==='string'&&value.runId.length<100?value.runId:uuid();runStarted=!!value.runStarted;runEnded=!!value.runEnded;memoryWait=.8;status('저장된 진행을 불러왔어요.');}
      else if(value)status('이전 저장 형식이 달라 새 게임으로 시작합니다.');
      await sdk.ready();$('save-state').textContent=loaded?.local?'이 탭의 임시 기록':'게스트도 진행 자동 저장';
    }catch(error){$('save-state').textContent='연결 없음 · 이 화면에서만 진행';status('플랫폼 연결을 사용할 수 없어 이번 화면에서만 플레이합니다.');}
      phase='ready';$('pause').disabled=false;$('reset').disabled=false;render();overlay(state.status!=='playing'?'저장된 한 판':runStarted?'다시 만나 반가워요':'잠깐의 틈, 한 판',state.status!=='playing'?`${state.score.toLocaleString()}점으로 마친 기록이 있어요. 새로 시작할까요?`:runStarted?'마지막 진행을 불러왔습니다. 이어서 플레이하세요.':config.instructions,state.status!=='playing'?'새로 시작':runStarted?'이어서 하기':'게임 시작');
    })();
  }
  root.GameEngine={boot};
})(globalThis);
