(() => {
  'use strict';
  const $=id=>document.getElementById(id),query=new URLSearchParams(location.search),frame=$('game');
  let socket,playerId,roomId=query.get('room'),projectId=query.get('project'),state,gameReady=false,buildPromise;
  const status=text=>$('status').textContent=text;
  const send=message=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));};
  async function api(url,body){const r=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();if(!r.ok)throw Error(d.error||'요청 실패');return d;}
  function relay(){if(gameReady&&state)frame.contentWindow.postMessage({source:'playforge-brawl-lobby',type:'state',playerId,state},location.origin);}
  function render(){
    if(!state)return;const me=state.players.find(p=>p.id===playerId),playing=['playing','finished'].includes(state.phase);
    $('lobby').hidden=playing;$('arena').hidden=!playing;
    if(playing){status((me?.spectator?'관전 중':'경기 진행 중')+' · 이탈한 자리는 봇이 이어받습니다.');return;}
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
      const project=await api('/api/platform/projects/'+projectId);
      let build=(await api('/api/platform-builds/'+projectId,{revision:project.revision})).build;
      const deadline=Date.now()+240000;
      while(['queued','running'].includes(build.status)){if(Date.now()>deadline)throw Error('게임 준비 시간이 초과되었습니다.');await new Promise(r=>setTimeout(r,600));build=(await api('/api/builds/'+build.id)).build;}
      if(build.status!=='succeeded')throw Error(build.error||'게임 준비 실패');
      frame.src=build.previewUrl+'?multiplayer=1';
    })().catch(error=>{status(error.message);$('game-loading').textContent=error.message;buildPromise=null;throw error;});
    return buildPromise;
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.source!=='playforge-brawl-game')return;
    if(event.data.type==='ready'){gameReady=true;$('game-loading').hidden=true;relay();}
    if(event.data.type==='input'&&state?.phase==='playing')send({type:'input',...event.data.input});
  });
  $('join-form').onsubmit=async event=>{
    event.preventDefault();$('join').disabled=true;
    try{
      if(!roomId&&!projectId){const d=await api('/api/platform/projects',{name:'BrawlLabs Multiplayer',template:'brawllabs',mode:'ready'});projectId=d.project.id;}
      if(projectId){
        status('게임을 먼저 준비하고 있습니다. 로비 대기 시간은 입장 후부터 계산됩니다.');
        $('join-form').hidden=true;$('arena').hidden=false;
        await prepareGame();
        const deadline=Date.now()+90000;
        while(!gameReady){if(Date.now()>deadline)throw Error('게임 화면 연결 시간이 초과되었습니다.');await new Promise(r=>setTimeout(r,100));}
      }
      socket=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/brawllabs');
      socket.onopen=()=>send({type:'join',roomId:roomId||undefined,projectId,name:$('name').value});
      socket.onmessage=event=>{
        const data=JSON.parse(event.data);
        if(data.type==='welcome'){
          playerId=data.playerId;roomId=data.roomId;projectId=data.projectId;
          history.replaceState(null,'','?room='+roomId+'&project='+projectId);
          $('join-form').hidden=true;$('lobby').hidden=false;$('invite').hidden=false;$('leave').hidden=false;$('room-label').textContent='로비 '+roomId;
          status('초대 링크를 공유하고 팀과 Ready를 선택하세요.');prepareGame().catch(error=>status(error.message));
        }else if(data.type==='state'){state=data;render();relay();}
        else if(data.type==='error'){status(data.error);if(!playerId){socket.close();$('join').disabled=false;$('join-form').hidden=false;$('arena').hidden=true;}}
      };
      socket.onclose=()=>{status('연결이 종료되었습니다. 경기 중이었다면 봇이 이어받습니다.');$('ready').disabled=true;if(!playerId)$('join').disabled=false;};
      socket.onerror=()=>status('서버에 연결할 수 없습니다.');
    }catch(error){status(error.message);$('join').disabled=false;$('join-form').hidden=false;$('arena').hidden=true;}
  };
  document.querySelectorAll('[data-team]').forEach(button=>button.onclick=()=>send({type:'team',team:Number(button.dataset.team)}));
  $('ready').onclick=()=>send({type:'ready',ready:!state?.players.find(p=>p.id===playerId)?.ready});
  $('spectate').onclick=()=>send({type:'spectate'});
  $('invite').onclick=async()=>{const url=location.origin+'/OfficialGodot/brawllabs-lobby.html?room='+roomId+'&project='+projectId;try{await navigator.clipboard.writeText(url);status('초대 링크를 복사했습니다.');}catch{status(url);}};
  $('leave').onclick=()=>{socket?.close();location.href='brawllabs-lobby.html?project='+projectId;};
  window.addEventListener('pagehide',()=>socket?.close());
  window.PlayForgeBrawl=Object.freeze({get state(){return state;},get playerId(){return playerId;}});
})();
