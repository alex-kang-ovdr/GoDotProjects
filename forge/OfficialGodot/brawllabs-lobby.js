(() => {
  'use strict';
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),frame=$('game');
  const forgeBase=(location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1])||'';
  const forgePath=route=>typeof route==='string'&&route.startsWith('/')&&forgeBase&&!route.startsWith(forgeBase+'/')?forgeBase+route:route;
  let csrfToken=null;
  async function ensureCsrf(){if(csrfToken!==null)return csrfToken;const r=await fetch(forgePath('/api/session'),{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'PlayHub Google 로그인이 필요합니다.');csrfToken=typeof d.csrfToken==='string'?d.csrfToken:'';return csrfToken;}
  if(query.has('embedded'))document.body.classList.add('embedded');
  let socket,playerId,lastError='',roomId=query.get('room'),projectId=query.get('project'),buildId=query.get('build'),revision,previewUrl,state,gameReady=false,buildPromise;
  const status=text=>$('status').textContent=text;
  if(query.has('name'))$('name').value=query.get('name').slice(0,24);
  const send=message=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));};
  async function api(url,body){const headers=body?{'Content-Type':'application/json'}:{};if(body){const token=await ensureCsrf();if(token)headers['X-CSRF-Token']=token;}const r=await fetch(forgePath(url),body?{method:'POST',credentials:'same-origin',cache:'no-store',headers,body:JSON.stringify(body)}:{credentials:'same-origin',cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error||'요청 실패');return d;}
  function relay(type='state',detail={}){
    if(!state)return;
    if(gameReady&&frame.contentWindow)frame.contentWindow.postMessage({source:'playforge-brawl-lobby',type:'state',playerId,state},location.origin);
    const message={source:'playforge-brawl-client',type,playerId,roomId,projectId,buildId,revision,previewUrl,...detail};
    if(type==='state')message.state=state;
    if(window.parent!==window)window.parent.postMessage(message,location.origin);
  }
  function render(){
    if(!state)return;const me=state.players.find(p=>p.id===playerId),playing=['playing','finished'].includes(state.phase);
    $('lobby').hidden=playing;$('arena').hidden=!playing;
    if(playing){
      status((me?.spectator?'관전 중':'경기 진행 중')+' · 이탈한 자리는 봇이 이어받습니다.');
      const available=state.game?.actors?.some(a=>a.isBot);
      $('takeover').hidden=!gameReady||state.phase!=='playing'||!me?.spectator||!available;
      return;
    }
    $('takeover').hidden=true;
    $('ready').disabled=!me||me.spectator;$('ready').textContent=me?.ready?'준비 취소':'Ready · 준비';
    for(const team of [0,1]){
      const list=$('team-'+team);list.replaceChildren();const players=state.players.filter(p=>!p.spectator&&p.team===team);
      for(let i=0;i<3;i++){
        const p=players[i],row=document.createElement('div');row.className='player'+(!p?' empty':p.ready?' is-ready':'');
        const name=document.createElement('span'),detail=document.createElement('small');name.textContent=p?p.name+(p.id===playerId?' · 나':''):'BOT';
        detail.textContent=p?(p.ready?'READY':Math.max(0,20-Math.floor((state.serverTime-p.waitingSince)/1000))+'초 내 준비'):'빈자리 자동 참여';
        row.append(name,detail);list.append(row);
      }
    }
    $('spectators').textContent='관전자: '+(state.players.filter(p=>p.spectator).map(p=>p.name+(p.id===playerId?' · 나':'')).join(', ')||'없음');
    const remaining=Math.max(0,Math.ceil((state.countdownEndsAt-state.serverTime)/1000));
    $('countdown').textContent=state.phase==='countdown'?remaining+'초 후 시작합니다':me?.spectator?'관전 중입니다. 팀을 선택하면 다시 준비할 수 있습니다.':'두 명 이상 준비하고, 모든 대기자가 준비하면 시작합니다.';
  }
  async function prepareGame(){
    if(buildPromise)return buildPromise;
    buildPromise=(async()=>{
      if(roomId){
        const response=await api('/api/brawllabs/rooms/'+encodeURIComponent(roomId)),meta=response.room;
        if(projectId&&meta.projectId!==projectId)throw Error('이 초대 링크의 프로젝트가 로비와 일치하지 않습니다.');
        projectId=meta.projectId;buildId=meta.buildId;revision=meta.revision;previewUrl=meta.previewUrl;
      }else{
        const project=await api('/api/platform/projects/'+encodeURIComponent(projectId));
        const requested=buildId?await api('/api/builds/'+encodeURIComponent(buildId)):null;
        let build=requested?.build;
        if(!build){build=(await api('/api/platform-builds/'+encodeURIComponent(projectId),{revision:project.revision})).build;}
        const deadline=Date.now()+240000;
        while(['queued','running'].includes(build.status)){if(Date.now()>deadline)throw Error('게임 준비 시간이 초과되었습니다.');await new Promise(r=>setTimeout(r,600));build=(await api('/api/builds/'+encodeURIComponent(build.id))).build;}
        if(build.status!=='succeeded')throw Error(build.error||'게임 준비 실패');
        buildId=build.id;revision=build.revision;previewUrl=build.previewUrl;
      }
      if(!/^\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/.test(previewUrl||''))throw Error('고정된 게임 빌드 주소가 올바르지 않습니다.');
      frame.src=forgePath(previewUrl)+'?multiplayer=1';
      return {buildId,revision,previewUrl};
    })().catch(error=>{status(error.message);$('game-loading').textContent=error.message;buildPromise=null;throw error;});
    return buildPromise;
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='playforge-brawl-game')return;
    if(event.data.type==='ready'){gameReady=true;$('game-loading').hidden=true;relay();}
    if(event.data.type==='input'&&state?.phase==='playing')send({type:'input',...event.data.input});
    if(event.data.type==='log'||event.data.type==='error')relay(event.data.type,{text:String(event.data.text||event.data.message||'').slice(0,2000)});
  });
  $('join-form').onsubmit=async event=>{
    event.preventDefault();$('join').disabled=true;
    try{
      if(!roomId&&!projectId){const d=await api('/api/platform/projects',{name:'BrawlLabs Multiplayer',template:'brawllabs',mode:'ready'});projectId=d.project.id;}
      if(projectId||roomId){status('게임을 준비하고 있습니다. 게임 창이 준비되면 로비에 참가합니다.');$('join-form').hidden=true;$('arena').hidden=false;await prepareGame();const deadline=Date.now()+90000;while(!gameReady){if(Date.now()>deadline)throw Error('게임 화면 연결 시간이 초과되었습니다.');await new Promise(r=>setTimeout(r,100));}}
      socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+forgePath('/brawllabs'));
      socket.onopen=()=>send({type:'join',roomId:roomId||undefined,projectId,name:$('name').value,buildId});
      socket.onmessage=event=>{
        const data=JSON.parse(event.data);
        if(data.type==='welcome'){
          playerId=data.playerId;roomId=data.roomId;projectId=data.projectId;buildId=data.buildId;revision=data.revision;previewUrl=data.previewUrl;
          history.replaceState(null,'','?room='+encodeURIComponent(roomId)+'&project='+encodeURIComponent(projectId)+'&build='+encodeURIComponent(buildId));
          $('join-form').hidden=true;$('lobby').hidden=false;$('invite').hidden=false;$('leave').hidden=false;$('room-label').textContent='로비 '+roomId;
          status('초대 링크를 공유하고 팀과 Ready를 선택하세요.');relay();
        }else if(data.type==='state'){state=data;render();relay();}
        else if(data.type==='log')relay('log',{text:data.text});
        else if(data.type==='error'){lastError=data.error;console.error('BrawlLabs server error:',data.error);status('로비 참가 실패: '+data.error);relay('error',{text:data.error});if(!playerId){socket.close();$('join').disabled=false;$('join-form').hidden=false;$('arena').hidden=true;}}
      };
      socket.onclose=()=>{if(playerId)status('연결이 종료되었습니다. 경기 중이었다면 봇이 이어받습니다.');$('ready').disabled=true;relay('log',{text:'클라이언트 연결 종료'});if(!playerId)$('join').disabled=false;};
      socket.onerror=()=>status('서버에 연결할 수 없습니다.');
    }catch(error){status(error.message);$('join').disabled=false;$('join-form').hidden=false;$('arena').hidden=true;}
  };
  document.querySelectorAll('[data-team]').forEach(button=>button.onclick=()=>send({type:'team',team:Number(button.dataset.team)}));
  $('ready').onclick=()=>send({type:'ready',ready:!state?.players.find(p=>p.id===playerId)?.ready});
  $('spectate').onclick=()=>send({type:'spectate'});
  document.querySelectorAll('[data-takeover-team]').forEach(button=>button.onclick=()=>{if(!gameReady||state?.phase!=='playing')return;const team=Number(button.dataset.takeoverTeam),actor=state?.game?.actors?.find(a=>a.team===team&&a.isBot);if(actor)send({type:'takeover',team,slot:actor.slot});});
  $('invite').onclick=async()=>{const url=location.origin+forgePath('/OfficialGodot/brawllabs-lobby.html')+'?room='+encodeURIComponent(roomId)+'&project='+encodeURIComponent(projectId)+'&build='+encodeURIComponent(buildId);try{await navigator.clipboard.writeText(url);status('초대 링크를 복사했습니다.');}catch{status(url);}};
  $('leave').onclick=()=>{socket?.close();location.href='brawllabs-lobby.html?project='+encodeURIComponent(projectId)+'&build='+encodeURIComponent(buildId);};
  window.addEventListener('pagehide',()=>socket?.close());
  window.PlayForgeBrawl=Object.freeze({get state(){return state;},get playerId(){return playerId;},get lastError(){return lastError;},get buildId(){return buildId;},get revision(){return revision;},get previewUrl(){return previewUrl;}});
})();
