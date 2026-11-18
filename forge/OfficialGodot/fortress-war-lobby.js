(() => {
  'use strict';
  const $ = id => document.getElementById(id), query = new URLSearchParams(location.search), frame = $('game');
  if (query.has('embedded')) document.body.classList.add('embedded');
  let socket, playerId, state, roomId = query.get('room'), projectId = query.get('project'), buildId = query.get('build');
  let revision, previewUrl, gameReady = false, lastError = '', buildPromise;
  const rosters = {
    classic: [['catapult','캐터펄트'],['crossbow','크로스보우'],['cannon','캐논'],['carrot','캐롯탱크'],['duke','듀크탱크'],['mine_lander','마인랜더'],['missile','미사일'],['multi_missile','멀티미사일'],['super_tank','슈퍼탱크'],['laser','레이저탱크'],['ion_attacker','이온어태커'],['secwind','세크윈드'],['poseidon','포세이돈']],
    blue3: [['catapult','캐터펄트'],['mecha_punch','메카펀치'],['evil_bella','이블벨라'],['baseball_boy','야구소년']],
  };
  function updateRoster() {
    for (const id of ['playerTank','opponentTank']) {
      $(id).replaceChildren(...rosters[$('profile').value].map(([value,text]) => new Option(text,value)));
    }
    $('opponentTank').value = $('profile').value === 'classic' ? 'cannon' : 'mecha_punch';
    $('teamSize').disabled = $('profile').value === 'blue3';
    if ($('teamSize').disabled) $('teamSize').value = '4';
  }
  updateRoster(); $('profile').onchange = updateRoster;
  if (roomId) $('match-options').hidden = true;
  if (query.has('name')) $('name').value = query.get('name').slice(0,24);
  const status = text => $('status').textContent = text;
  const send = message => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
  async function api(url, body) {
    const response = await fetch(url, body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
    const data = await response.json(); if (!response.ok) throw Error(data.error || '요청 실패'); return data;
  }
  function relay(type = 'state', detail = {}) {
    if (gameReady && frame.contentWindow && state) frame.contentWindow.postMessage({source:'playforge-fortress-lobby',type,playerId,state,...detail},location.origin);
    if (window.parent !== window) window.parent.postMessage({source:'playforge-fortress-client',type,playerId,roomId,projectId,buildId,revision,previewUrl,state,...detail},location.origin);
  }
  function render() {
    if (!state) return;
    const me = state.players.find(p => p.id === playerId), playing = ['playing','finished'].includes(state.phase);
    $('lobby').hidden = playing; $('arena').hidden = !playing;
    if (playing) {
      status(state.phase === 'finished' ? '경기가 끝났습니다. 나가기 후 새 방에서 다시 대전할 수 있습니다.' : (me?.spectator ? '관전 중' : (me?.team === 0 ? '블루 팀' : '레드 팀')) + ' · 자신의 팀 차례에 조작하세요.');
      return;
    }
    $('ready').disabled = !me || me.spectator;
    $('ready').textContent = me?.ready ? '준비 취소' : 'Ready · 준비';
    for (const team of [0,1]) {
      const list = $('team-' + team); list.replaceChildren();
      const player = state.players.find(p => !p.spectator && p.team === team);
      const row = document.createElement('div'); row.className = 'player' + (player?.ready ? ' is-ready' : '');
      const name = document.createElement('span'), info = document.createElement('small');
      name.textContent = player ? player.name + (player.id === playerId ? ' · 나' : '') : '참가 대기';
      info.textContent = player ? (player.ready ? 'READY' : '준비 전') : '초대 링크를 공유하세요'; row.append(name,info); list.append(row);
    }
    $('spectators').textContent = '관전자: ' + (state.players.filter(p => p.spectator).map(p => p.name).join(', ') || '없음');
    $('countdown').textContent = state.phase === 'countdown' ? Math.max(0,Math.ceil((state.countdownEndsAt - state.serverTime)/1000)) + '초 후 시작합니다.' : '양 팀이 준비하면 대전이 시작됩니다.';
    const config = state.config || {};
    $('match-summary').textContent = `${config.profile === 'blue3' ? 'BLUE3' : '클래식'} · ${config.teamSize || 2} vs ${config.teamSize || 2} · ${config.map || 'highlands'}`;
  }
  async function prepareGame() {
    if (buildPromise) return buildPromise;
    buildPromise = (async () => {
      if (roomId) {
        const meta = (await api('/api/fortress-war/rooms/' + encodeURIComponent(roomId))).room;
        if (projectId && projectId !== meta.projectId) throw Error('초대 링크의 프로젝트가 방과 다릅니다.');
        projectId = meta.projectId; buildId = meta.buildId; revision = meta.revision; previewUrl = meta.previewUrl;
      } else {
        if (!projectId) projectId = (await api('/api/platform/projects',{name:'Fortress War Multiplayer',template:'fortress-war',mode:'ready'})).project.id;
        const project = await api('/api/platform/projects/' + encodeURIComponent(projectId));
        let build = buildId ? (await api('/api/builds/' + encodeURIComponent(buildId))).build : (await api('/api/platform-builds/' + encodeURIComponent(projectId),{revision:project.revision})).build;
        const deadline = Date.now() + 240000;
        while (['queued','running'].includes(build.status)) {
          if (Date.now() > deadline) throw Error('게임 준비 시간이 초과되었습니다.');
          await new Promise(resolve => setTimeout(resolve,600)); build = (await api('/api/builds/' + build.id)).build;
        }
        if (build.status !== 'succeeded') throw Error(build.error || '게임 빌드 실패');
        buildId = build.id; revision = build.revision; previewUrl = build.previewUrl;
      }
      if (!/^\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/.test(previewUrl || '')) throw Error('게임 빌드 주소가 올바르지 않습니다.');
      frame.src = previewUrl + '?multiplayer=1';
    })().catch(error => { buildPromise = null; throw error; });
    return buildPromise;
  }
  window.addEventListener('message',event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'playforge-fortress-game') return;
    if (event.data.type === 'ready') { gameReady = true; $('game-loading').hidden = true; relay(); }
    if (event.data.type === 'input' && state?.phase === 'playing') send({...event.data.input,type:'action'});
    if (['log','error'].includes(event.data.type)) relay(event.data.type,{text:String(event.data.text || '').slice(0,2000)});
  });
  $('join-form').onsubmit = async event => {
    event.preventDefault(); $('join').disabled = true; lastError = '';
    try {
      status('Godot 게임을 준비하고 있습니다…'); $('join-form').hidden = true; $('arena').hidden = false;
      await prepareGame();
      const deadline = Date.now() + 90000;
      while (!gameReady) { if (Date.now() > deadline) throw Error('게임 화면 연결 시간이 초과되었습니다.'); await new Promise(resolve => setTimeout(resolve,100)); }
      socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/fortress-war');
      socket.onopen = () => send({type:'join',roomId:roomId || undefined,projectId,buildId,name:$('name').value,
        options:{profile:$('profile').value,map:$('map').value,teamSize:Number($('teamSize').value),seed:Number($('seed').value),playerTank:$('playerTank').value,opponentTank:$('opponentTank').value}});
      socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'welcome') {
          playerId = data.playerId; roomId = data.roomId; projectId = data.projectId; buildId = data.buildId; revision = data.revision; previewUrl = data.previewUrl;
          const url = new URL(location.href); for (const [key,value] of Object.entries({room:roomId,project:projectId,build:buildId})) url.searchParams.set(key,value);
          history.replaceState(null,'',url); $('invite').hidden = false; $('leave').hidden = false; $('room-label').textContent = '방 ' + roomId;
          $('arena').hidden = true; $('lobby').hidden = false;
        } else if (data.type === 'state') {
          const oldTerrain = state?.terrain; state = data;
          if (!state.terrain && oldTerrain) state.terrain = oldTerrain;
          render(); relay();
        } else if (data.type === 'error') {
          lastError = data.error; status(data.error); relay('error',{text:data.error});
          if (!playerId) { socket.close(); $('join-form').hidden = false; $('arena').hidden = true; $('join').disabled = false; }
        }
      };
      socket.onclose = () => { status('연결이 종료되었습니다. 다시 참가하거나 새 방을 만드세요.'); $('ready').disabled = true; relay('disconnect'); if (!playerId) $('join').disabled = false; };
      socket.onerror = () => status('멀티플레이 서버에 연결할 수 없습니다.');
    } catch (error) { lastError = error.message; status(error.message); $('join').disabled = false; $('join-form').hidden = false; $('arena').hidden = true; }
  };
  document.querySelectorAll('[data-team]').forEach(button => button.onclick = () => send({type:'team',team:Number(button.dataset.team)}));
  $('ready').onclick = () => send({type:'ready',ready:!state?.players.find(p => p.id === playerId)?.ready});
  $('spectate').onclick = () => send({type:'spectate'});
  $('invite').onclick = async () => {
    const url = new URL('/OfficialGodot/fortress-war-lobby.html',location.origin);
    for (const [key,value] of Object.entries({room:roomId,project:projectId,build:buildId})) url.searchParams.set(key,value);
    try { await navigator.clipboard.writeText(url.href); status('초대 링크를 복사했습니다.'); } catch { status(url.href); }
  };
  $('leave').onclick = () => { socket?.close(); location.href = '/OfficialGodot/fortress-war-lobby.html?project=' + encodeURIComponent(projectId || ''); };
  window.addEventListener('pagehide',() => socket?.close());
  window.PlayForgeFortress = Object.freeze({get state(){return state;},get playerId(){return playerId;},get roomId(){return roomId;},get buildId(){return buildId;},get revision(){return revision;},get previewUrl(){return previewUrl;},get lastError(){return lastError;}});
})();
