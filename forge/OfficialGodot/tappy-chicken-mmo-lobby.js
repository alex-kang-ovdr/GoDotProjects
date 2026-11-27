(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const query = new URLSearchParams(location.search);
  const frame = $('game');
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const forgePath = route => typeof route === 'string' && route.startsWith('/') && forgeBase && !route.startsWith(forgeBase + '/') ? forgeBase + route : route;

  let csrfToken = null;
  async function ensureCsrf() {
    if (csrfToken !== null) return csrfToken;
    const r = await fetch(forgePath('/api/session'), { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Error(d.error || 'PlayHub Google 로그인이 필요합니다.');
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
    frame.contentWindow.postMessage({ source: 'playforge-tappy-mmo-lobby', ...payload }, location.origin);
  }

  function flushToGame() {
    if (!gameReady || !frame.contentWindow) return;
    if (welcomePayload) {
      frame.contentWindow.postMessage({ source: 'playforge-tappy-mmo-lobby', ...welcomePayload }, location.origin);
    }
    while (pendingRpcQueue.length > 0) {
      const item = pendingRpcQueue.shift();
      frame.contentWindow.postMessage({ source: 'playforge-tappy-mmo-lobby', ...item }, location.origin);
    }
  }

  function relayParent(type = 'state', detail = {}) {
    if (window.parent === window) return;
    const message = {
      source: 'playforge-tappy-mmo-client',
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
        const response = await api('/api/tappy-chicken-mmo/rooms/' + encodeURIComponent(roomId));
        const meta = response.room;
        if (projectId && meta.projectId !== projectId) {
          throw Error('이 초대 링크의 프로젝트가 MMO 월드와 일치하지 않습니다.');
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
          const buildProfile = query.get('buildProfile') === 'playhub-publish' ? 'playhub-publish' : 'standard-godot';
          build = (await api('/api/platform-builds/' + encodeURIComponent(projectId), { revision: project.revision, buildProfile, includePlatformAvatar: buildProfile === 'playhub-publish' })).build;
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

  const EVENT_TO_CODE = { join: 0, flap: 1, phase: 2, sync: 3, leave: 4 };
  const CODE_TO_EVENT = ['join', 'flap', 'phase', 'sync', 'leave'];
  const PHASE_TO_CODE = { menu: 0, ready: 1, playing: 2, paused: 3, crashing: 4, over: 5 };
  const CODE_TO_PHASE = ['menu', 'ready', 'playing', 'paused', 'crashing', 'over'];
  const compactPeers = new Map();

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.source !== 'playforge-tappy-mmo-game') return;
    if (event.data.type === 'ready') {
      gameReady = true;
      $('game-loading').hidden = true;
      flushToGame();
      relayParent('log', { text: '게임 캔버스 준비 완료' });
      return;
    }
    if (event.data.type === 'rpc') {
      rpcsSent += 1;
      const p = event.data.params || {};
      const evType = p.event_type ?? p.eventType ?? 'sync';
      const evCode = EVENT_TO_CODE[evType];
      if (event.data.method === 'server_player_event' && evCode !== undefined) {
        const dist = Math.round(Number(p.run_distance ?? p.runDistance ?? 0));
        const y = Math.round(Number(p.y ?? 290));
        const score = Math.max(0, Math.floor(Number(p.score ?? 0)));
        const phaseCode = PHASE_TO_CODE[p.phase] ?? 2;
        const seq = Math.max(0, Math.floor(Number(p.seq ?? 0)));
        if (evCode === 1 && phaseCode === 2) {
          sendWs({ e: [1, dist, y, score, 2, seq] });
        } else {
          const flap100 = Math.round(Number(p.flap_time ?? p.flapTime ?? 0) * 100);
          const vy = Math.round(Number(p.vy ?? 0));
          const speed = p.speed !== undefined ? Math.round(Number(p.speed)) : undefined;
          const tuple = speed !== undefined
            ? [evCode, dist, y, score, phaseCode, seq, flap100, vy, speed]
            : [evCode, dist, y, score, phaseCode, seq, flap100, vy];
          sendWs({ e: tuple });
        }
      } else {
        sendWs({ type: 'rpc', method: event.data.method, params: event.data.params });
      }
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
          name: 'Tappy Chicken MMO',
          template: 'tappy-chicken-mmo',
          mode: 'ready',
        });
        projectId = d.project.id;
      }
      status('Tappy Chicken MMO를 준비하고 즉시 난입합니다…');
      $('join-form').hidden = true;
      $('arena').hidden = false;
      await prepareGame();

      socket = new WebSocket((location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + forgePath('/tappy-chicken-mmo'));
      const handleRpcMessage = rpcMsg => {
        if (!rpcMsg || rpcMsg.type !== 'rpc') return;
        if (rpcMsg.method === 'client_multicast_event') rpcsReceived += 1;
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
        compact: true,
        subscribeState: query.has('embedded'),
      });
      socket.onmessage = event => {
        const data = JSON.parse(event.data);
        if (data.b || data.r || data.p) {
          if (Array.isArray(data.b)) {
            for (const t of data.b) {
              if (!Array.isArray(t) || t.length < 5) continue;
              const shortId = t[0];
              const evType = CODE_TO_EVENT[t[1]] || 'sync';
              const peerId = 's-' + shortId;
              if (typeof t[8] === 'string' && t[8]) compactPeers.set(shortId, t[8]);
              const isFlap = t[1] === 1;
              const phase = t[5] !== undefined ? (CODE_TO_PHASE[t[5]] || 'playing') : 'playing';
              const flapTime = isFlap ? 0 : (t[6] !== undefined ? t[6] / 100 : 0);
              const vy = isFlap ? -345 : (t[7] ?? 0);
              const angle = isFlap ? -0.785 : 0;
              handleRpcMessage({
                type: 'rpc',
                method: 'client_multicast_event',
                params: {
                  peerId,
                  name: compactPeers.get(shortId) || ('P-' + shortId),
                  eventType: evType,
                  runDistance: t[2],
                  y: t[3],
                  score: t[4],
                  phase,
                  flapTime,
                  vy,
                  angle,
                },
              });
            }
          }
          if (Array.isArray(data.r)) {
            for (const shortId of data.r) {
              compactPeers.delete(shortId);
              handleRpcMessage({
                type: 'rpc',
                method: 'client_peer_removed',
                params: { peerId: 's-' + shortId },
              });
            }
          }
          if (Array.isArray(data.p)) {
            handleRpcMessage({
              type: 'rpc',
              method: 'client_presence',
              params: { onlineCount: data.p[0], nearbyCount: data.p[1] },
            });
          }
          return;
        }
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
          $('room-label').textContent = 'MMO 월드 ' + roomId;
          $('invite').hidden = false;
          $('leave').hidden = false;
          updatePresenceUi();
          status(`난입 완료 · 반경 ${data.proximityRadius}px 내 플레이어만 50% 반투명 고스트로 표시됩니다.`);
          if (gameReady) flushToGame();
          relayParent('log', { text: `MMO 월드 ${roomId} 난입 완료 (시드 ${data.courseSeed})` });
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
          status('난입 실패: ' + data.error);
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
        if (playerId) status('MMO 서버와 연결이 끊어졌습니다. 로컬 플레이는 계속 진행할 수 있습니다.');
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
    const url = location.origin + forgePath('/OfficialGodot/tappy-chicken-mmo-lobby.html')
      + '?room=' + encodeURIComponent(roomId)
      + '&project=' + encodeURIComponent(projectId)
      + (buildId ? '&build=' + encodeURIComponent(buildId) : '');
    try {
      await navigator.clipboard.writeText(url);
      status('난입 초대 링크를 복사했습니다.');
    } catch {
      status(url);
    }
  };
  $('leave').onclick = () => {
    socket?.close();
    location.href = forgePath('/OfficialGodot/tappy-chicken-mmo-lobby.html')
      + (projectId ? '?project=' + encodeURIComponent(projectId) : '');
  };

  window.PlayForgeTappyMmo = Object.freeze({
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

  // Seamless drop-in when embedded in PlayForge Multiplayer Workspace or with ?auto=1.
  if (query.has('embedded') || query.get('auto') === '1') {
    startDropIn();
  }
})();
