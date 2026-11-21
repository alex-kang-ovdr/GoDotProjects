(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const frame = $('game');
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const forgePath = route => typeof route === 'string' && route.startsWith('/') && forgeBase && !route.startsWith(forgeBase + '/') ? forgeBase + route : route;

  let csrfToken = null;
  async function ensureCsrf() {
    if (csrfToken !== null) return csrfToken;
    const r = await fetch(forgePath('/api/session'), { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'PlayHub 로그인이 필요합니다.');
    csrfToken = typeof d.csrfToken === 'string' ? d.csrfToken : '';
    return csrfToken;
  }

  if (query.has('embedded')) document.body.classList.add('embedded');
  let socket = null;
  let playerId = null;
  let welcomePayload = null;
  let roomId = query.get('room');
  let projectId = query.get('project');
  let buildId = query.get('build');
  let revision = null;
  let previewUrl = null;
  let state = null;
  let gameReady = false;
  let buildPromise = null;
  let pendingRpcQueue = [];
  let nearbyCount = 0;
  let onlineCount = 0;
  let rpcsSent = 0;
  let rpcsReceived = 0;

  const status = text => { $('status').textContent = text; };
  if (query.has('name')) $('name').value = query.get('name').slice(0, 24);
  const sendWs = message => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  async function api(url, body) {
    const headers = body ? { 'Content-Type': 'application/json' } : {};
    if (body) {
      const token = await ensureCsrf();
      if (token) headers['X-CSRF-Token'] = token;
    }
    const r = await fetch(forgePath(url), body
      ? { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers, body: JSON.stringify(body) }
      : { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || '요청 실패');
    return d;
  }

  function postToGame(payload) {
    if (!gameReady || !frame.contentWindow) {
      pendingRpcQueue.push(payload);
      if (pendingRpcQueue.length > 128) pendingRpcQueue.shift();
      return;
    }
    frame.contentWindow.postMessage({ source: 'playforge-captain-mmo-lobby', ...payload }, location.origin);
  }

  function flushToGame() {
    if (!gameReady || !frame.contentWindow) return;
    if (welcomePayload) {
      frame.contentWindow.postMessage({ source: 'playforge-captain-mmo-lobby', ...welcomePayload }, location.origin);
    }
    while (pendingRpcQueue.length > 0) {
      const item = pendingRpcQueue.shift();
      frame.contentWindow.postMessage({ source: 'playforge-captain-mmo-lobby', ...item }, location.origin);
    }
  }

  function relayParent(type = 'state', detail = {}) {
    if (window.parent === window) return;
    const message = {
      source: 'playforge-captain-mmo-client',
      type,
      playerId,
      roomId,
      projectId,
      buildId,
      revision,
      previewUrl,
      ...detail,
    };
    if (type === 'state' && state) message.state = state;
    window.parent.postMessage(message, location.origin);
  }

  function updatePresenceUi() {
    $('presence-label').textContent = `주변 ${nearbyCount} · 온라인 ${onlineCount}`;
  }

  async function prepareGame() {
    if (buildPromise) return buildPromise;
    buildPromise = (async () => {
      if (roomId) {
        const response = await api('/api/captain-forever-mmo/rooms/' + encodeURIComponent(roomId));
        const meta = response.room;
        if (projectId && meta.projectId !== projectId) {
          throw Error('이 초대 링크의 프로젝트가 MMO 섹터와 일치하지 않습니다.');
        }
        projectId = meta.projectId;
        buildId = meta.buildId;
        revision = meta.revision;
        previewUrl = meta.previewUrl;
      } else {
        const project = await api('/api/platform/projects/' + encodeURIComponent(projectId));
        const requested = buildId ? await api('/api/builds/' + encodeURIComponent(buildId)) : null;
        let build = requested?.build;
        if (!build) {
          build = (await api('/api/platform-builds/' + encodeURIComponent(projectId), { revision: project.revision })).build;
        }
        const deadline = Date.now() + 240000;
        while (['queued', 'running'].includes(build.status)) {
          if (Date.now() > deadline) throw Error('게임 빌드 준비 시간이 초과되었습니다.');
          await new Promise(r => setTimeout(r, 600));
          build = (await api('/api/builds/' + encodeURIComponent(build.id))).build;
        }
        if (build.status !== 'succeeded') throw Error(build.error || '게임 준비 실패');
        buildId = build.id;
        revision = build.revision;
        previewUrl = build.previewUrl;
      }
      if (!/^\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/.test(previewUrl || '')) {
        throw Error('고정된 게임 빌드 주소가 올바르지 않습니다.');
      }
      frame.src = forgePath(previewUrl) + '?multiplayer=1';
      return { buildId, revision, previewUrl };
    })().catch(error => {
      status(error.message);
      $('game-loading').textContent = error.message;
      buildPromise = null;
      throw error;
    });
    return buildPromise;
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'playforge-captain-mmo-game') return;
    if (event.data.type === 'ready') {
      gameReady = true;
      $('game-loading').hidden = true;
      flushToGame();
      relayParent('log', { text: '게임 캔버스 준비 완료' });
      return;
    }
    if (event.data.type === 'rpc') {
      rpcsSent += 1;
      sendWs({ type: 'rpc', method: event.data.method, params: event.data.params });
      return;
    }
    if (event.data.type === 'log' || event.data.type === 'error') {
      relayParent(event.data.type, { text: String(event.data.text || event.data.message || '').slice(0, 2000) });
    }
  });

  async function startDropIn() {
    $('join').disabled = true;
    try {
      if (!roomId && !projectId) {
        const d = await api('/api/platform/projects', {
          name: 'Captain Forever MMO',
          template: 'captain-forever-mmo',
          mode: 'ready',
        });
        projectId = d.project.id;
      }
      status('Captain Forever MMO를 준비하고 섹터에 출격합니다…');
      $('join-form').hidden = true;
      $('arena').hidden = false;
      await prepareGame();

      socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + forgePath('/captain-forever-mmo'));
      const handleRpcMessage = rpcMsg => {
        if (!rpcMsg || rpcMsg.type !== 'rpc') return;
        if (rpcMsg.method === 'client_multicast_event' || rpcMsg.method === 'client_incoming_hit') rpcsReceived += 1;
        if (rpcMsg.method === 'client_presence' && rpcMsg.params) {
          onlineCount = Number(rpcMsg.params.onlineCount || onlineCount);
          nearbyCount = Number(rpcMsg.params.nearbyCount || 0);
          updatePresenceUi();
        }
        postToGame(rpcMsg);
      };
      socket.onopen = () => sendWs({
        type: 'join',
        roomId: roomId || undefined,
        projectId,
        buildId,
        name: $('name').value,
        supportsBatch: true,
        subscribeState: query.has('embedded'),
      });
      socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.type === 'welcome') {
          playerId = data.playerId;
          roomId = data.roomId;
          projectId = data.projectId;
          buildId = data.buildId;
          revision = data.revision;
          previewUrl = data.previewUrl;
          onlineCount = data.onlineCount || 1;
          welcomePayload = data;
          const nextUrl = new URL(location.href);
          nextUrl.searchParams.set('room', roomId);
          nextUrl.searchParams.set('project', projectId);
          if (buildId) nextUrl.searchParams.set('build', buildId);
          history.replaceState(null, '', nextUrl.pathname + nextUrl.search);
          $('room-label').textContent = 'MMO 섹터 ' + roomId;
          $('invite').hidden = false;
          $('leave').hidden = false;
          updatePresenceUi();
          status(`섹터 합류 완료 · 반경 ${data.proximityRadius}px 내 선장들의 모듈 함선과 실시간 교전·회수 가능`);
          if (gameReady) flushToGame();
          relayParent('log', { text: `MMO 섹터 ${roomId} 출격 완료 (시드 ${data.sectorSeed})` });
        } else if (data.type === 'rpc') {
          handleRpcMessage(data);
        } else if (data.type === 'rpc_batch' && Array.isArray(data.items)) {
          for (const item of data.items) handleRpcMessage(item);
        } else if (data.type === 'state') {
          state = data;
          onlineCount = Number(data.onlineCount || onlineCount);
          const me = (data.players || []).find(p => p.id === playerId);
          if (me) nearbyCount = Number(me.nearbyCount || 0);
          updatePresenceUi();
          relayParent('state');
        } else if (data.type === 'error') {
          status('출격 실패: ' + data.error);
          relayParent('error', { text: data.error });
          if (!playerId) {
            socket.close();
            $('join').disabled = false;
            $('join-form').hidden = false;
            $('arena').hidden = true;
          }
        }
      };
      socket.onclose = () => {
        if (playerId) status('MMO 서버와 연결이 끊어졌습니다. 단독 항해는 계속할 수 있습니다.');
        relayParent('log', { text: 'MMO 연결 종료' });
        if (!playerId) $('join').disabled = false;
      };
      socket.onerror = () => status('MMO 서버에 연결할 수 없습니다.');
    } catch (error) {
      status(error.message);
      $('join').disabled = false;
      $('join-form').hidden = false;
      $('arena').hidden = true;
    }
  }

  $('join-form').onsubmit = event => {
    event.preventDefault();
    startDropIn();
  };
  $('invite').onclick = async () => {
    const url = location.origin + forgePath('/OfficialGodot/captain-forever-mmo-lobby.html')
      + '?room=' + encodeURIComponent(roomId)
      + '&project=' + encodeURIComponent(projectId)
      + (buildId ? '&build=' + encodeURIComponent(buildId) : '');
    try {
      await navigator.clipboard.writeText(url);
      status('섹터 초대 링크를 복사했습니다.');
    } catch {
      status(url);
    }
  };
  $('leave').onclick = () => {
    socket?.close();
    location.href = forgePath('/OfficialGodot/captain-forever-mmo-lobby.html')
      + (projectId ? '?project=' + encodeURIComponent(projectId) : '');
  };

  window.PlayForgeCaptainMmo = Object.freeze({
    get playerId() { return playerId; },
    get roomId() { return roomId; },
    get projectId() { return projectId; },
    get buildId() { return buildId; },
    get revision() { return revision; },
    get previewUrl() { return previewUrl; },
    get gameReady() { return gameReady; },
    get nearbyCount() { return nearbyCount; },
    get onlineCount() { return onlineCount; },
    get rpcsSent() { return rpcsSent; },
    get rpcsReceived() { return rpcsReceived; },
    get state() { return state; },
  });

  if (query.has('embedded') || query.get('auto') === '1') {
    startDropIn();
  }
})();
