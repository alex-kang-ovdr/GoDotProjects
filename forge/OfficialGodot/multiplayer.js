window.mountPlayForgeMultiplayer = function(root, options) {
  'use strict';
  options ||= {};
  root ||= document;
  const forgeBase=(location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1])||'';
  const forgePath=route=>typeof route==='string'&&route.startsWith('/')&&forgeBase&&!route.startsWith(forgeBase+'/')?forgeBase+route:route;
  const query=new URLSearchParams(location.search),projectId=query.get('project')||'',projectName=query.get('name')||'멀티플레이 테스트 워크스페이스';
  const templateId = options.template || query.get('template') || 'brawllabs';
  const buildProfile = options.buildProfile || query.get('buildProfile') || 'playhub-publish';
  const fortress = templateId === 'fortress-war';
  const tappyMmo = templateId === 'tappy-chicken-mmo';
  const lobbyPath = forgePath(tappyMmo ? '/OfficialGodot/tappy-chicken-mmo-lobby.html' : fortress ? '/OfficialGodot/fortress-war-lobby.html' : '/OfficialGodot/brawllabs-lobby.html');
  const messagePrefix = tappyMmo ? 'playforge-tappy-mmo' : fortress ? 'playforge-fortress' : 'playforge-brawl';
  const nodes=new Map([...root.querySelectorAll('[id]')].map(node=>[node.id,node]));
  const $=id=>nodes.get(id),tabs=$('viewport-tabs'),serverView=$('server-view'),clientsView=$('clients-view');
  const serverFrame=$('server-game');let serverBuild=null,serverWorld=null,serverReady=false;
  const clients=new Map(),worlds=new Map();let nextClient=1,activeView='server',activeWorldId=null;
  $('project-name').textContent=projectName;
  function worldForActive(){return worlds.get(activeWorldId)||Array.from(worlds.values()).find(world=>world.clients.size>0)||null;}
  function appendLog(world,message,key){
    if(!world)return;world.logs ||= [];world.logKeys ||= new Set();if(key&&world.logKeys.has(key))return;if(key)world.logKeys.add(key);
    world.logs.push('['+new Date().toLocaleTimeString()+'] '+String(message).slice(0,500));if(world.logs.length>300)world.logs.shift();renderDiagnostics();
  }
  function renderLogs(){const world=worldForActive();$('log-target').textContent=world?.roomId?'방 '+world.roomId:world?'월드 '+world.id:'선택한 월드';const lines=world?.logs||[];$('logs').textContent=lines.length?lines.join('\n'):'아직 메시지가 없습니다.';$('log-count').textContent=String(lines.length);}
  function renderInspector(){
    const world=worldForActive(),state=world?.lastState,root=$('inspector');root.replaceChildren();
    if(!state){const empty=document.createElement('span');empty.className='muted';empty.textContent='클라이언트 상태를 기다리는 중입니다.';root.append(empty);return;}
    if(tappyMmo){
      const stats=state.stats||{};
      const details=document.createElement('div');details.className='snapshot-summary';details.textContent=`난입 MMO · 방 ${world.roomId||'연결 중'} · 온라인 ${state.onlineCount??0}명 · 반경 ${state.proximityRadius??520}px · RPC 수신 ${stats.eventsReceived??0} · 멀티캐스트 ${stats.multicastsSent??0} · 거리 제외 ${stats.filteredOut??0}`;root.append(details);
      const players=state.players||[];if(!players.length){const text=document.createElement('p');text.className='muted';text.textContent='아직 난입한 플레이어가 없습니다.';root.append(text);return;}
      const table=document.createElement('table');table.className='actor-table';table.innerHTML='<thead><tr><th>이름</th><th>상태</th><th>진행 거리</th><th>높이(Y)</th><th>점수</th><th>주변 피어</th></tr></thead>';
      const body=document.createElement('tbody');for(const p of players){const row=document.createElement('tr');for(const value of [p.name||'—',p.phase||'menu',`${Math.round(p.runDistance||0)}px`,Math.round(p.y||290),p.score??0,p.nearbyCount??0]){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}body.append(row);}table.append(body);root.append(table);
      return;
    }
    const details=document.createElement('div');details.className='snapshot-summary';details.textContent=`${state.phase==='playing'?'경기 중':state.phase==='finished'?'경기 종료':'로비'} · 방 ${world.roomId||'연결 중'} · 빌드 ${world.buildId||'준비 중'} · 리비전 ${world.revision??'—'}`;root.append(details);
    const actors=state.game?.actors||state.game?.tanks?.map((tank,index)=>({...tank,slot:index,isBot:false}))||[];if(!actors.length){const text=document.createElement('p');text.className='muted';text.textContent='아직 경기 액터가 없습니다.';root.append(text);return;}
    const table=document.createElement('table');table.className='actor-table';table.innerHTML='<thead><tr><th>슬롯</th><th>팀</th><th>이름</th><th>제어</th><th>위치</th><th>체력</th></tr></thead>';
    const body=document.createElement('tbody');for(const actor of actors){const row=document.createElement('tr');for(const value of [actor.slot,actor.team===0?'블루':'레드',actor.name||'—',actor.isBot?'봇':'플레이어',`${Math.round(actor.x)}, ${Math.round(actor.y)}`,actor.hp??'—']){const cell=document.createElement('td');cell.textContent=String(value);row.append(cell);}body.append(row);}table.append(body);root.append(table);
  }
  function renderServerGame(){
    const world=worldForActive();
    if(!world?.buildId||!world.previewUrl){$('server-wait').hidden=false;return;}
    if(!/^\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/.test(world.previewUrl))return;
    if(serverBuild!==world.buildId||serverWorld!==world.id){serverBuild=world.buildId;serverWorld=world.id;serverReady=false;serverFrame.src=forgePath(world.previewUrl)+'?multiplayer=1';}
    $('server-wait').hidden=serverReady;
    if(serverReady&&world.lastState)serverFrame.contentWindow.postMessage({source:messagePrefix+'-lobby',type:'state',playerId:null,state:world.lastState},location.origin);
  }
  function renderDiagnostics(){renderLogs();renderInspector();renderServerGame();}
  function renderRooms(){const list=$('room-list');list.replaceChildren();if(!worlds.size){const empty=document.createElement('span');empty.className='muted';empty.textContent='첫 클라이언트가 참가하면 방이 시작됩니다.';list.append(empty);return;}for(const world of worlds.values()){const row=document.createElement('div');row.className='room-item';const left=document.createElement('span');left.textContent=world.roomId?'방 '+world.roomId:'월드 '+world.id+' · 첫 클라이언트 대기 중';const right=document.createElement('small');right.textContent=world.roomId?'빌드 '+(world.buildId||'준비 중')+' · 클라이언트 '+world.clients.size+'명':'클라이언트 없음';row.append(left,right);list.append(row);}}
  function selectView(view){
    activeView=view;const selected=clients.get(view);if(selected)activeWorldId=selected.world.id;
    serverView.hidden=view!=='server';clientsView.hidden=view==='server';
    for(const button of tabs.querySelectorAll('.tab'))button.classList.toggle('active',button.dataset.view===view);
    for(const client of clients.values())client.pane.hidden=view!==client.id;
    renderDiagnostics();updateActions();
  }
  function updateActions(){const world=worldForActive(),available=!!world?.roomId;$('add-client').disabled=!available;$('separate-client').disabled=!available;}
  function makeWorld(id,roomId=null,buildId=null){const world={id,roomId,buildId,projectId,clients:new Set(),logs:[],logKeys:new Set(),lastState:null};worlds.set(id,world);return world;}
  function clientUrl(world,label,join=true,embedded=true){const url=new URL(lobbyPath,location.origin);if(embedded)url.searchParams.set('embedded','1');url.searchParams.set('project',world.projectId||projectId);url.searchParams.set('name',label);if(buildProfile&&buildProfile!=='playhub-publish')url.searchParams.set('buildProfile',buildProfile);if(world.buildId)url.searchParams.set('build',world.buildId);if(join&&world.roomId)url.searchParams.set('room',world.roomId);return url;}
  function addClient(world,joiningRoom=true){
    const id='client-'+nextClient,number=nextClient++,label='클라이언트 '+number;world.clients.add(id);activeWorldId=world.id;
    const tab=document.createElement('button');tab.type='button';tab.className='tab closeable';tab.dataset.view=id;tab.dataset.clientId=id;tab.setAttribute('aria-label',label);tab.textContent=label;
    const close=document.createElement('span');close.className='close';close.textContent='×';close.title='클라이언트 닫기';close.setAttribute('role','button');close.setAttribute('aria-label',label+' 닫기');tab.append(close);tabs.insertBefore(tab,tabs.querySelector('.project-label'));
    const pane=document.createElement('div');pane.className='client-pane';pane.dataset.clientId=id;
    const iframe=document.createElement('iframe');iframe.className='client-frame';iframe.dataset.clientId=id;iframe.title=label+' 로비 및 게임';iframe.allow='autoplay; fullscreen; gamepad';
    const placeholder=document.createElement('div');placeholder.className='client-placeholder';placeholder.textContent='클라이언트를 준비하는 중…';pane.append(iframe,placeholder);clientsView.append(pane);
    const client={id,label,world,tab,pane,iframe,placeholder,waitingForRoom:joiningRoom&&!world.roomId,state:null,roomId:null,buildId:world.buildId,revision:null,previewUrl:null,lastLogSeq:0};clients.set(id,client);
    iframe.addEventListener('load',()=>{if(!client.waitingForRoom)placeholder.hidden=true;});
    tab.addEventListener('click',event=>{if(event.target===close){event.stopPropagation();removeClient(id);return;}selectView(id);});
    if(client.waitingForRoom){placeholder.hidden=false;placeholder.textContent='첫 클라이언트가 방에 참가하면 같은 서버로 연결됩니다. Client 1 탭에서 먼저 참가하세요.';}else{const url=clientUrl(world,label,joiningRoom);iframe.src=url.pathname+url.search;}
    appendLog(world,label+' 열림'+(world.roomId?' · 방 '+world.roomId:''),'open:'+id);renderRooms();selectView(id);return client;
  }
  function removeClient(id){
    const client=clients.get(id);if(!client)return;client.iframe.src='about:blank';client.tab.remove();client.pane.remove();client.world.clients.delete(id);clients.delete(id);
    appendLog(client.world,client.label+' 연결 종료','close:'+id);
    if(!client.world.clients.size){worlds.delete(client.world.id);if(activeWorldId===client.world.id)activeWorldId=null;}
    if(activeView===id)selectView('server');else{renderDiagnostics();updateActions();}
    renderRooms();
  }
  function clientMessage(event){
    if(event.origin!==location.origin)return;if(event.source===serverFrame.contentWindow){if(event.data?.source===messagePrefix+'-game'&&event.data.type==='ready'){serverReady=true;renderServerGame();}return;}const client=Array.from(clients.values()).find(item=>item.iframe.contentWindow===event.source);if(!client)return;
    const data=event.data;if(data?.source!==messagePrefix+'-client')return;
    if(data.type==='state'){
      if(Number.isFinite(data.state?.serverTime)&&Number.isFinite(client.world.lastState?.serverTime)&&data.state.serverTime<client.world.lastState.serverTime)return;
      client.state=data.state||null;client.roomId=data.roomId||client.roomId;client.buildId=data.buildId||client.buildId;client.revision=data.revision??client.revision;client.previewUrl=data.previewUrl||client.previewUrl;
      if(client.roomId){client.world.roomId=client.roomId;client.world.buildId=client.buildId;
        for(const pending of clients.values())if(pending.world===client.world&&pending.waitingForRoom){pending.waitingForRoom=false;const url=clientUrl(pending.world,pending.label,true);pending.iframe.src=url.pathname+url.search;}
      }
      client.world.previewUrl=client.previewUrl;client.world.lastState=client.state;client.world.buildId=client.buildId;client.world.revision=client.revision;
      for(const item of client.state?.logs||[]){if(Number.isSafeInteger(item.seq)&&item.seq>client.lastLogSeq){client.lastLogSeq=item.seq;appendLog(client.world,'서버 · '+item.event+': '+item.message,'server:'+client.roomId+':'+item.seq);}}
      renderRooms();if(activeWorldId===client.world.id)renderDiagnostics();updateActions();
    }else if(data.type==='log'||data.type==='error')appendLog(client.world,client.label+' · '+(data.text||data.message||data.type),'client:'+client.id+':'+data.type+':'+String(data.text||data.message||''));
  }
  window.addEventListener('message',clientMessage);
  $('server-tab').addEventListener('click',()=>selectView('server'));
  $('add-client').addEventListener('click',()=>{const world=worldForActive();if(world?.roomId)addClient(world,true);});
  $('separate-client').addEventListener('click',()=>{const world=worldForActive();if(!world?.roomId)return;const label='클라이언트 '+nextClient++,url=clientUrl(world,label,true,false);window.open(url.href,'_blank','noopener,noreferrer');appendLog(world,'새 창에서 '+label+' 로비를 열었습니다. 현재 뷰포트 탭은 새 창으로 이동하지 않습니다.','popup:'+label);});
  $('new-world').addEventListener('click',()=>{const source=worldForActive(),id='world-'+Date.now().toString(36),world=makeWorld(id,null,source?.buildId||null);appendLog(world,'독립된 새 월드입니다. 첫 클라이언트가 참가하면 별도 서버 방이 생성됩니다.','world-created');addClient(world,false);});
  const first=makeWorld('world-1');addClient(first,false);
  const api=Object.freeze({selectView,removeClient,newWorld(){const world=makeWorld('world-'+Date.now().toString(36));addClient(world,false);},get snapshot(){return worldForActive()?.lastState||{};},get logs(){return worldForActive()?.logs||[];},addClient(){const world=worldForActive();if(!world)return false;addClient(world,true);return true;},get clients(){return Array.from(clients.values()).map(client=>({id:client.id,roomId:client.roomId,buildId:client.buildId,revision:client.revision,state:client.state}));},get worlds(){return Array.from(worlds.values()).map(world=>({id:world.id,roomId:world.roomId,buildId:world.buildId,clients:[...world.clients]}));},get activeView(){return activeView;},get activeWorldId(){return activeWorldId;}});
if(root.host){
  tabs.remove();root.querySelector('.diagnostics')?.remove();$('room-list').remove();
  root.host.dataset.gameplayOnly='true';
}
window.PlayForgeMultiplayer=api;return api;
};
if(document.getElementById('viewport-tabs'))window.mountPlayForgeMultiplayer();
