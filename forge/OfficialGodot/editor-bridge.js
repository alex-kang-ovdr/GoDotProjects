(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const projectId = query.get('project') || '';
  const playShowcase = query.get('showcase') === '1';
  const projectLabel = document.getElementById('project');
  const status = document.getElementById('status');
  const notice = document.getElementById('notice');
  const loadingOverlay = document.getElementById('editor-loading');
  const loadingTitle = document.getElementById('editor-loading-title');
  const loadingBar = document.getElementById('editor-loading-bar');
  const loadingDetail = document.getElementById('editor-loading-detail');
  function setLoading(title, detail, percent = null) {
    if (!loadingOverlay) return;
    loadingOverlay.hidden = false;
    if (loadingTitle && title !== null) loadingTitle.textContent = title;
    if (loadingDetail && detail !== null) loadingDetail.textContent = detail;
    if (loadingBar && Number.isFinite(percent)) loadingBar.style.width = `${Math.max(4, Math.min(100, Math.round(percent)))}%`;
  }
  function hideLoading() {
    if (loadingOverlay) loadingOverlay.hidden = true;
  }
  const canvas = document.getElementById('editor-canvas');
  let gameCanvas = document.getElementById('game-canvas');
  const gameOverlay = document.getElementById('game-overlay');
  const returnToEditorButton = document.getElementById('return-to-editor');
  const nativeGameOverlay = document.getElementById('native-game-overlay');
  const nativeGameFrame = document.getElementById('native-game-frame');
  const agentFrame = document.getElementById('agent-dock-frame');
  const actionButtons = document.querySelectorAll('#actions [data-action]');
  const collaborationButton = document.querySelector('#actions [data-action="collaboration"]');
  const origin = location.origin;
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const forgePath = route => typeof route === 'string' && route.startsWith('/') && forgeBase && !route.startsWith(forgeBase + '/') ? forgeBase + route : route;
  window.__playforgeBasePath = forgeBase;
  let csrfToken = null;
  async function ensureCsrfToken() {
    if (csrfToken) return csrfToken;
    const response = await fetch(forgePath('/api/session'), { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `Session request failed (${response.status}).`);
    csrfToken = typeof data?.csrfToken === 'string' ? data.csrfToken : null;
    window.__playforgeCsrfToken = csrfToken;
    return csrfToken;
  }
  const agentPath = forgePath('/OfficialGodot/agent.html');
  let agentState = null;
  let agentPort;
  let agentReady = false;
  let agentLoading = false;
  function positionAgentDock() {
    const rect = agentState?.rect;
    agentFrame.hidden = !agentReady || !agentState?.visible || !rect;
    if (agentFrame.hidden) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, rect.x));
    const y = Math.max(0, Math.min(1, rect.y));
    const right = Math.max(x, Math.min(1, rect.x + rect.width));
    const bottom = Math.max(y, Math.min(1, rect.y + rect.height));
    agentFrame.style.left = `${bounds.left + x * bounds.width}px`;
    agentFrame.style.top = `${bounds.top + y * bounds.height}px`;
    agentFrame.style.width = `${(right - x) * bounds.width}px`;
    agentFrame.style.height = `${(bottom - y) * bounds.height}px`;
  }
  function sendAgentState() {
    if (!agentReady || !agentState) return;
    const { rect, visible, ...state } = agentState;
    agentPort.postMessage({ type: 'state', state });
  }
  window.__playforgeAgentDockChanged = state => {
    if (!state || typeof state.visible !== 'boolean') return;
    if (state.visible && (!state.rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(state.rect[key])))) return;
    agentState = state;
    if (state.visible && !agentLoading) {
      agentLoading = true;
      agentFrame.src = agentPath + '?embedded=1';
    }
    positionAgentDock();
    sendAgentState();
  };
  agentFrame.addEventListener('load', () => {
    if (!agentLoading) return;
    agentPort?.close();
    agentReady = false;
    window.__playforgeAgentDockReady = false;
    positionAgentDock();
    const connection = new MessageChannel();
    agentPort = connection.port1;
    agentPort.onmessage = ({ data }) => {
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'ready') {
        agentReady = true;
        window.__playforgeAgentDockReady = true;
        positionAgentDock();
        sendAgentState();
      } else if (agentReady && agentState?.visible && typeof window.__playforgeAgentDockCommand === 'function') {
        const command = JSON.stringify(data);
        if (command.length <= 1500000) window.__playforgeAgentDockCommand(command);
      }
    };
    agentFrame.contentWindow.postMessage({ type: 'playforge-agent:init' }, origin, [connection.port2]);
  });
  window.addEventListener('resize', positionAgentDock);
  window.addEventListener('pagehide', () => agentPort?.close(), { once: true });
  window.__playforgeReserveChatGPTLogin = () => {
    if (!window.BroadcastChannel || !window.crypto?.getRandomValues) return null;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const nonce = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    let channel;
    try {
      channel = new BroadcastChannel('playforge-chatgpt-login:' + nonce);
    } catch {
      return null;
    }
    let ready = false;
    let pending = null;
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      pending = null;
      clearTimeout(expiry);
      removeEventListener('pagehide', close);
      channel.close();
    }
    const expiry = setTimeout(() => {
      close();
      showNotice('로그인 창이 열리지 않았거나 응답 시간이 지났습니다. 채팅 설정에서 다시 열어 주세요.');
    }, 30000);
    addEventListener('pagehide', close, { once: true });
    channel.onmessage = ({ data }) => {
      if (data?.type === 'ready') {
        ready = true;
        if (pending) channel.postMessage(pending);
      } else if (data?.type === 'received' && pending) {
        close();
      }
    };
    function deliver(message) {
      if (closed || pending) return false;
      pending = message;
      if (ready) channel.postMessage(message);
      return true;
    }
    try {
      window.open(forgePath('/OfficialGodot/chatgpt-login.html#' + nonce), '_blank', 'noopener,noreferrer');
    } catch {
      close();
      return null;
    }
    return {
      navigate(address) {
        if (typeof address !== 'string' || address.length > 8192) return false;
        try {
          const url = new URL(address);
          if (url.protocol !== 'https:' || url.username || url.password || url.port ||
              !['auth.openai.com', 'chatgpt.com'].includes(url.hostname)) return false;
          return deliver({ type: 'navigate', url: url.href });
        } catch {
          return false;
        }
      },
      fail(message) {
        const text = typeof message === 'string' ? message.slice(0, 500) : '';
        return deliver({ type: 'failed', message: text });
      },
    };
  };
  let engine;
  let game;
  let gameStarting = false;
  let gameExitRequested = false;
  let lastPointerAt = 0;
  let lastCursorX = 0.5;
  let lastCursorY = 0.5;
  let started = false;
  let nativeGameVisible = false;
  let nativeGameRect = null;
  let nativeGameLoad = null;
  let nativeGameRevision = -1;
  let nativeGameGeneration = 0;
  let showcaseGame = null;
  let showcaseRun = 0;
  let noticeTimer = null;
  const MAX_SESSION_LOGS = 200;
  const sessionLogs = [];
  const pendingSessionLogs = [];
  const processedCommandIds = new Set();
  let sessionSyncTimer = null;
  const buildMode = String(window.__PLAYFORGE_BUILD_MODE__ || query.get('mode') || 'debug').toLowerCase();
  let remoteControlAllowed = ['debug', 'test', 'development'].includes(buildMode) && window.__PLAYFORGE_REMOTE_CONTROL_ENABLED__ !== false;

  function disableRemoteControl() {
    remoteControlAllowed = false;
    window.__PLAYFORGE_REMOTE_CONTROL_ENABLED__ = false;
    delete window.__playforgeRemoteControl;
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === origin) {
        delete window.parent.__playforgeRemoteControl;
      }
    } catch {
    }
  }

  function appendSessionLog(source, level, ...parts) {
    if (!remoteControlAllowed) return;
    const text = parts.map(p => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ').trim();
    if (!text) return;
    const entry = {
      timestamp: new Date().toISOString(),
      source,
      level,
      text: text.slice(0, 1000),
    };
    sessionLogs.push(entry);
    if (sessionLogs.length > MAX_SESSION_LOGS) sessionLogs.splice(0, sessionLogs.length - MAX_SESSION_LOGS);
    pendingSessionLogs.push(entry);
    if (pendingSessionLogs.length > MAX_SESSION_LOGS) pendingSessionLogs.splice(0, pendingSessionLogs.length - MAX_SESSION_LOGS);
    scheduleSessionSync();
  }

  window.__playforgeGetRecentLogs = (limit = 20) => sessionLogs.slice(-Math.max(1, Math.min(200, Number(limit) || 20)));

  function buildSessionEditorState() {
    return {
      ...(window.__playforgeEditorState || {}),
      showcase: window.__playforgeShowcaseState ? {
        playing: Boolean(window.__playforgeShowcaseState.playing),
        time: window.__playforgeShowcaseState.time,
        duration: window.__playforgeShowcaseState.duration,
        session: window.__playforgeShowcaseState.session,
      } : null,
      game: {
        running: Boolean(game) || showcaseGame?.state === 'running' || nativeGameVisible,
        showcaseGameState: showcaseGame?.state || '',
      },
    };
  }

  async function flushSessionSync(commandResult = null) {
    if (!remoteControlAllowed || !projectId || !/^[a-f0-9]{24}$/.test(projectId)) return;
    const logsToSend = pendingSessionLogs.splice(0, pendingSessionLogs.length);
    try {
      const response = await fetch(forgePath(`/api/platform/projects/${encodeURIComponent(projectId)}/session`), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: logsToSend,
          editorState: buildSessionEditorState(),
          ...(commandResult ? { commandResult } : {}),
        }),
      });
      if (response.status === 403) {
        disableRemoteControl();
        return;
      }
      const data = await response.json().catch(() => null);
      if (data?.ok && Array.isArray(data.queuedCommands)) {
        for (const cmd of data.queuedCommands) executeRemoteCommand(cmd);
      }
    } catch {
      // Ignore transient telemetry errors.
    }
  }

  function scheduleSessionSync() {
    if (sessionSyncTimer) return;
    sessionSyncTimer = setTimeout(() => {
      sessionSyncTimer = null;
      flushSessionSync();
    }, 600);
  }

  window.__playforgeOnEditorStateChanged = () => scheduleSessionSync();
  window.__playforgeReportRemoteResult = result => {
    flushSessionSync(result);
  };

  function executeRemoteCommand(cmd) {
    if (!remoteControlAllowed || !cmd || typeof cmd.command !== 'string') return false;
    if (cmd.id && processedCommandIds.has(cmd.id)) return false;
    if (cmd.id) processedCommandIds.add(cmd.id);
    if (cmd.command === 'logs.clear') {
      sessionLogs.length = 0;
      pendingSessionLogs.length = 0;
      flushSessionSync({ id: cmd.id, ok: true, message: '세션 로그를 비웠습니다.' });
      return true;
    }
    if (cmd.command === 'game.stop') {
      stopShowcaseGame();
      if (game) returnToEditor();
      flushSessionSync({ id: cmd.id, ok: true, message: '실행 중인 게임을 중지했습니다.' });
      return true;
    }
    if (typeof window.__playforgeExecuteRemoteCommand === 'function') {
      window.__playforgeExecuteRemoteCommand(JSON.stringify(cmd));
      return true;
    }
    if (cmd.command === 'showcase.play' && typeof window.__playforgeStartShowcase === 'function') {
      window.__playforgeStartShowcase();
      flushSessionSync({ id: cmd.id, ok: true, message: 'Showcase를 시작했습니다.' });
      return true;
    }
    return false;
  }

  const remoteControlApi = {
    getLogs: (limit = 50) => window.__playforgeGetRecentLogs(limit),
    getState: () => buildSessionEditorState(),
    listCapabilities: () => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'capabilities.list',
    }),
    rpc: payload => executeRemoteCommand(payload && typeof payload === 'object' ? {
      jsonrpc: '2.0',
      id: payload.id ?? ('rc-' + Date.now()),
      ...payload,
    } : null),
    playShowcase: (scenePath = '') => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'showcase.play',
      arguments: scenePath ? { scenePath } : {},
    }),
    applyOperations: operations => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'workspace.apply',
      arguments: { operations: Array.isArray(operations) ? operations : [] },
    }),
    describeObject: (objectPath = '.', filter = '') => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'object.describe',
      arguments: { objectPath, filter },
    }),
    getObjectProperty: (objectPath, propertyName) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'object.get',
      arguments: { objectPath, propertyName },
    }),
    setObjectProperty: (objectPath, propertyName, value, generateTransaction = true) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'object.set',
      arguments: { objectPath, propertyName, value, generateTransaction },
    }),
    callObjectMethod: (objectPath, functionName, args = []) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'object.call',
      arguments: { objectPath, functionName, arguments: Array.isArray(args) ? args : [] },
    }),
    evalScript: (code, objectPath = '.', args = {}) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'script.eval',
      arguments: { code, objectPath, args },
    }),
    undo: (steps = 1) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'editor.undo',
      arguments: { steps },
    }),
    redo: (steps = 1) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'editor.redo',
      arguments: { steps },
    }),
    playGame: (main = false) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'game.play',
      arguments: { main: Boolean(main) },
    }),
    stopGame: () => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command: 'game.stop',
    }),
    runCommand: (command, args = {}) => executeRemoteCommand({
      id: 'rc-' + Date.now(),
      command,
      arguments: args,
    }),
  };
  if (remoteControlAllowed) {
    window.__playforgeRemoteControl = remoteControlApi;
    try {
      if (window.parent && window.parent !== window && window.parent.location.origin === origin) {
        window.parent.__playforgeRemoteControl = remoteControlApi;
      }
    } catch {
    }
  }

  function showNotice(message, duration = 6000) {
    if (!notice) return;
    notice.textContent = message;
    notice.style.display = 'block';
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.style.display = 'none'; }, duration);
  }
  actionButtons.forEach(button => button.addEventListener('click', event => {
    const action = button.dataset.action;
    notify('activity', { kind: 'step', clickLabel: ({home:'내 프로젝트',versions:'버전 기록',publish:'배포',collaboration:'협업 현황'})[action] || button.textContent, x: event.clientX / window.innerWidth, y: event.clientY / window.innerHeight });
    if (['home', 'versions', 'publish', 'collaboration'].includes(action)) notify('platform-action', { action });
  }));

  function resizeEditorCanvas() {
    const bounds = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    if (!bounds.width || !bounds.height) return;
    const width = Math.max(1, Math.round(bounds.width * scale));
    const height = Math.max(1, Math.round(bounds.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
  new ResizeObserver(resizeEditorCanvas).observe(canvas);
  window.addEventListener('resize', resizeEditorCanvas);
  resizeEditorCanvas();

  function positionNativeGame() {
    if (!nativeGameVisible || !nativeGameRect) return;
    const bounds = canvas.getBoundingClientRect();
    nativeGameOverlay.style.left = `${bounds.left + nativeGameRect.x * bounds.width}px`;
    nativeGameOverlay.style.top = `${bounds.top + nativeGameRect.y * bounds.height}px`;
    nativeGameOverlay.style.width = `${nativeGameRect.width * bounds.width}px`;
    nativeGameOverlay.style.height = `${nativeGameRect.height * bounds.height}px`;
  }
  new ResizeObserver(positionNativeGame).observe(canvas);
  window.addEventListener('resize', positionNativeGame);
  nativeGameFrame.addEventListener('load', () => {
    if (nativeGameVisible) {
      status.textContent = '';
      nativeGameFrame.contentWindow?.focus();
    }
  });

  let multiplayerHost=null,multiplayerApi=null,multiplayerMount=null;
  async function mountMultiplayerWorkspace(template = 'brawllabs'){
    if(multiplayerApi){
      multiplayerHost.style.display='';
      nativeGameFrame.style.display='none';
      return multiplayerApi;
    }
    if(multiplayerMount)return multiplayerMount;
    multiplayerMount=(async()=>{
      const response=await fetch(forgePath('/OfficialGodot/multiplayer.html'));if(!response.ok)throw Error('Multiplayer workspace unavailable');
      const html=await response.text(),parsed=new DOMParser().parseFromString(html,'text/html');
      multiplayerHost=document.createElement('div');multiplayerHost.id='editor-multiplayer-workspace';multiplayerHost.style.cssText='width:100%;height:100%';
      const shadow=multiplayerHost.attachShadow({mode:'open'}),css=document.createElement('link');css.rel='stylesheet';css.href=forgePath('/OfficialGodot/multiplayer.css');shadow.append(css);
      for(const element of [...parsed.body.children])if(element.tagName!=='SCRIPT')shadow.append(element);
      nativeGameFrame.style.display='none';nativeGameOverlay.append(multiplayerHost);
      if(!window.mountPlayForgeMultiplayer)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=forgePath('/OfficialGodot/multiplayer.js');script.onload=resolve;script.onerror=reject;document.body.append(script);});
      multiplayerApi=window.mountPlayForgeMultiplayer(shadow,{template});return multiplayerApi;
    })().catch(error=>{multiplayerHost?.remove();multiplayerHost=null;multiplayerMount=null;throw error;});
    return multiplayerMount;
  }
  window.__playforgeMultiplayerCommand=(action,id)=>{
    if(!multiplayerApi)return false;
    if(action==='select')multiplayerApi.selectView(id);
    else if(action==='close')multiplayerApi.removeClient(id);
    else if(action==='add')return multiplayerApi.addClient();
    else if(action==='world')multiplayerApi.newWorld();
    return true;
  };
  window.__playforgeMultiplayerSummary=()=>JSON.stringify(multiplayerApi?{clients:multiplayerApi.clients.map(c=>({id:c.id})),active:multiplayerApi.activeView,snapshot:multiplayerApi.snapshot,logs:multiplayerApi.logs}:{clients:[],active:'server',snapshot:{},logs:[]});
  window.__playforgeAddMultiplayerClient=()=>{
    if(!multiplayerApi){showNotice('멀티플레이 Game 화면에서 첫 클라이언트가 입장한 뒤 추가하세요.');return false;}
    if(!multiplayerApi.addClient()){showNotice('첫 클라이언트가 방에 입장할 때까지 기다려 주세요.');return false;}return true;
  };

  async function loadNativeGame(generation) {
    const latest = await fetchProject();
    if (generation !== nativeGameGeneration) return;
    if (['brawllabs', 'fortress-war', 'tappy-chicken-mmo', 'captain-forever-mmo'].includes(latest.project?.template)) {
      nativeGameRevision = latest.revision;
      await mountMultiplayerWorkspace(latest.project.template);
      return;
    }
    if (nativeGameRevision === latest.revision && nativeGameFrame.getAttribute('src')) return;
    status.textContent = 'Building game for the native Game workspace…';
    const token = await ensureCsrfToken();
    const response = await fetch(forgePath(`/api/platform-builds/${encodeURIComponent(projectId)}`), {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
      body: JSON.stringify({ revision: latest.revision }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.build?.id) throw new Error(payload?.error || `Game build request failed (${response.status}).`);
    let build = payload.build;
    const deadline = Date.now() + 240000;
    while (['queued', 'running'].includes(build.status)) {
      if (Date.now() > deadline) throw new Error('Game build timed out.');
      await new Promise(resolve => setTimeout(resolve, 600));
      const result = await fetch(forgePath(`/api/builds/${encodeURIComponent(build.id)}`), { credentials: 'same-origin' });
      const data = await result.json().catch(() => null);
      if (!result.ok || !data?.build) throw new Error(data?.error || `Game build status failed (${result.status}).`);
      build = data.build;
    }
    if (build.status !== 'succeeded' || build.revision !== latest.revision || !/^\/api\/builds\/[a-f0-9]{16}\/files\/index\.html$/.test(build.previewUrl || '')) {
      throw new Error(build.error || 'The current project revision could not be built for the Game workspace.');
    }
    if (generation === nativeGameGeneration) {
      nativeGameRevision = build.revision;
      nativeGameFrame.src = forgePath(build.previewUrl);
    }
  }

  function stopShowcaseGame() {
    if (!showcaseGame) return;
    showcaseGame = null;
    nativeGameFrame.removeAttribute('src');
    nativeGameRevision = -1;
    nativeGameVisible = false;
    nativeGameOverlay.style.display = 'none';
    status.textContent = '';
    canvas.focus();
  }

  window.__playforgeBeginShowcaseGame = scene => {
    stopShowcaseGame();
    nativeGameGeneration += 1;
    nativeGameLoad = null;
    showcaseGame = { run: String(++showcaseRun), scene, files: [], state: 'preparing' };
  };
  window.__playforgeAddShowcaseGameFile = (path, data) => {
    if (showcaseGame?.state !== 'preparing') return false;
    try {
      const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0));
      showcaseGame.files.push({ path, bytes });
      return true;
    } catch {
      return false;
    }
  };
  window.__playforgePlayShowcaseGame = () => {
    if (showcaseGame?.state !== 'preparing') return;
    showcaseGame.state = 'starting';
    if (multiplayerHost) multiplayerHost.style.display = 'none';
    nativeGameFrame.style.display = 'block';
    status.textContent = '시연 게임 시작 중…';
    nativeGameFrame.src = forgePath(`/OfficialGodot/showcase-game.html?run=${showcaseGame.run}`);
  };
  window.__playforgeStopShowcaseGame = stopShowcaseGame;
  window.__playforgeShowcaseGameStatus = () => showcaseGame?.state || '';
  window.__playforgeReadShowcaseGame = (run, source) => {
    if (showcaseGame?.run !== run || source !== nativeGameFrame.contentWindow || showcaseGame.state !== 'starting') return null;
    const { scene, files } = showcaseGame;
    showcaseGame.files = [];
    return { scene, files };
  };
  window.__playforgeShowcaseGameResult = (run, source, error) => {
    if (showcaseGame?.run !== run || source !== nativeGameFrame.contentWindow) return;
    showcaseGame.state = error ? 'failed' : 'running';
    status.textContent = '';
    if (error) {
      appendSessionLog('game', 'error', `Showcase game error: ${error}`);
      showNotice(`시연 게임을 실행하지 못했습니다. ${error}`);
    } else {
      appendSessionLog('game', 'info', 'Showcase game started.');
    }
  };

  function showNativeGame(screenMessage) {
    const rect = screenMessage.rect;
    if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) ||
        rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.01 || rect.y + rect.height > 1.01) return;
    nativeGameRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    window.__playforgeNativeGameRect = { ...nativeGameRect };
    nativeGameVisible = true;
    nativeGameOverlay.style.display = 'block';
    positionNativeGame();
    if (!showcaseGame && !nativeGameLoad) {
      const generation = nativeGameGeneration;
      const load = loadNativeGame(generation).catch(error => {
        if (generation !== nativeGameGeneration) return;
        showNotice(`Game workspace failed: ${error.message}`);
        console.error(error);
      }).finally(() => { if (nativeGameLoad === load) nativeGameLoad = null; });
      nativeGameLoad = load;
    }
  }

  window.__playforgeNativeGameScreen = message => {
    if (!message || message.source !== 'playforge-godot-editor' || message.type !== 'native-screen' || typeof message.screen !== 'string') return;
    if (message.screen === 'Game') {
      showNativeGame(message);
      return;
    }
    nativeGameVisible = false;
    nativeGameOverlay.style.display = 'none';
    status.textContent = '';
    canvas.focus();
  };

  function enableEditorAddons(config, pluginPaths) {
    const section = /^\[editor_plugins\][ \t]*(?=\r?$)/m.exec(config);
    const newline = config.includes('\r\n') ? '\r\n' : '\n';
    const quotedPaths = pluginPaths.map(path => JSON.stringify(path));
    if (!section) {
      return config + newline + '[editor_plugins]' + newline +
        `enabled=PackedStringArray(${quotedPaths.join(', ')})` + newline;
    }

    const start = section.index + section[0].length;
    const remainder = config.slice(start);
    const nextSection = /^\[[^\r\n]+\][ \t]*\r?$/m.exec(remainder);
    const end = nextSection ? nextSection.index : remainder.length;
    const body = remainder.slice(0, end);
    const existing = /^[ \t]*enabled[ \t]*=[ \t]*PackedStringArray\(([^\r\n]*)\)[ \t]*(?=\r?$)/m.exec(body);
    const values = existing?.[1].trim() || '';
    const additions = quotedPaths.filter(path => !values.includes(path));
    if (!additions.length) return config;
    const assignment = `enabled=PackedStringArray(${[values, ...additions].filter(Boolean).join(', ')})`;
    const updated = existing
      ? body.slice(0, existing.index) + assignment + body.slice(existing.index + existing[0].length)
      : body.trimEnd() + newline + assignment + newline;
    return config.slice(0, start) + updated + remainder.slice(end);
  }

  function prepareProjectFiles(files, revision, addonFiles, replay, chatFiles, remoteControlFiles = null, avatarBundle = null) {
    if (!Array.isArray(files) || files.length > 512) throw new Error('Invalid project file list.');
    const seen = new Set();
    let totalBytes = 0;
    const dir = `/home/web_user/projects/${projectId}`;
    const projectFiles = files.map((entry) => {
      if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') throw new Error('Invalid project file.');
      const file = entry.path.replaceAll('\\', '/');
      const lowerFile = file.replace(/^(\.\/)+/, '').toLowerCase();
      if (/^addons\/playforge_(platform|replay|showcase|agent_chat|remote_control|avatar)(?:\/|$)/.test(lowerFile) || lowerFile.startsWith('.godot/') ||
          lowerFile.startsWith('.playforge-import/') || lowerFile.startsWith('.playforge-store/') || lowerFile === '.playforge-store.json') return null;
      if (file.startsWith('/') || file.includes(':') || /[\\\0-\x1f]/.test(file) ||
          file.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe project file path.');
      if (seen.has(file)) throw new Error('Duplicate project file path.');
      seen.add(file);
      const size = new TextEncoder().encode(entry.content).byteLength;
      totalBytes += size;
      if (size > 1024 * 1024 || totalBytes > 8 * 1024 * 1024) throw new Error('Project files exceed the 8 MB / 1 MB per file synchronization limit.');
      return { path: file, content: entry.content };
    }).filter(Boolean);
    const projectFile = projectFiles.find(file => file.path === 'project.godot');
    if (!projectFile) throw new Error('Project is missing project.godot.');
    // Keep the exact copied snapshot as the first three-way merge base.
    // Another editor may save while this WebAssembly instance is still loading.
    const syncBaseline = projectFiles.map(file => ({ path: file.path, content: file.content }));
    // An existing revision may contain user-edited files. Mount those at
    // their authored paths, including when the browser has an older local copy.
    const staged = new Set(revision === 1 && replay.manifest?.schemaVersion === 3
      ? replay.stagedFiles ?? replay.manifest.cues.filter(cue => cue.action === 'import').flatMap(cue => cue.staged || []) : []);
    const originalProjectConfig = projectFile.content;
    const pluginPaths = ['res://addons/playforge_platform/plugin.cfg', 'res://addons/playforge_replay/plugin.cfg',
      'res://addons/playforge_agent_chat/plugin.cfg'];
    if (remoteControlAllowed && remoteControlFiles) {
      pluginPaths.push('res://addons/playforge_remote_control/plugin.cfg');
    }
    if (avatarBundle && avatarBundle.files) {
      pluginPaths.push('res://addons/playforge_avatar/plugin.cfg');
    }
    projectFile.content = enableEditorAddons(projectFile.content, pluginPaths);
    projectFiles.push({ path: '.playforge-platform.json', content: JSON.stringify({ id: projectId, revision,
      baseProjectConfig: originalProjectConfig, editorProjectConfig: projectFile.content, baseFiles: syncBaseline }) });
    for (const [name, content] of Object.entries(addonFiles)) {
      if (typeof content !== 'string' || content.length > 300000) throw new Error('Invalid PlayForge platform add-on.');
      const file = `addons/playforge_platform/${name}`;
      const existing = projectFiles.findIndex(item => item.path === file);
      if (existing >= 0) projectFiles[existing].content = content;
      else projectFiles.push({ path: file, content });
    }
    if (replay.manifest) {
      projectFiles.push({ path: '.playforge-showcase.json', content: JSON.stringify(replay.manifest) });
    }
    const mountedAddons = [['playforge_replay', replay.files], ['playforge_agent_chat', chatFiles]];
    if (remoteControlAllowed && remoteControlFiles) {
      mountedAddons.push(['playforge_remote_control', remoteControlFiles]);
    }
    if (avatarBundle && avatarBundle.files) {
      mountedAddons.push(['playforge_avatar', avatarBundle.files]);
    }
    for (const [directory, files] of mountedAddons) {
      for (const [name, content] of Object.entries(files)) {
        projectFiles.push({ path: `addons/${directory}/${name}`, content });
      }
    }
    const mounted = projectFiles.map(file => {
      // MEMFS keeps short-lived import sources out of concurrent IndexedDB flushes.
      const stage = seen.has(file.path) && staged.has(file.path);
      const base = stage ? '/tmp/playforge-import/' + projectId : dir;
      return { path: base + '/' + file.path, buffer: new TextEncoder().encode(file.content) };
    });
    const catalog = replay.store?.catalog ?? { packs: [] };
    const sources = replay.store?.sources ?? {};
    if (!Array.isArray(catalog.packs)) throw new Error('에셋 스토어 목록을 불러오지 못했습니다.');
    const packFiles = new Set(catalog.packs.flatMap(pack => pack.files));
    for (const file of packFiles) {
      if (typeof file !== 'string' || !/^Assets\/(?:[\w-]+\.svg|Audio\/[\w-]+\.tres)$/.test(file) || typeof sources[file] !== 'string') {
        throw new Error('에셋 스토어의 원본 파일이 잘못되었습니다.');
      }
      mounted.push({ path: '/tmp/playforge-store/' + projectId + '/' + file, buffer: new TextEncoder().encode(sources[file]) });
    }
    mounted.push({ path: dir + '/.playforge-store.json', buffer: new TextEncoder().encode(JSON.stringify(catalog)) });
    if (avatarBundle && Array.isArray(avatarBundle.binaryAssets)) {
      for (const item of avatarBundle.binaryAssets) {
        if (item?.relPath && item.buffer instanceof Uint8Array) {
          mounted.push({ path: `${dir}/addons/playforge_avatar/${item.relPath}`, buffer: item.buffer });
        }
      }
    }
    return mounted;
  }

  function notify(type, detail = {}) {
    const message = { source: 'playforge-godot-editor', type, projectId, ...detail };
    if (window.parent !== window && window.parent.location.origin === origin) window.parent.postMessage(message, origin);
  }
  window.__playforgeShowcaseChanged = state => {
    const roles = Array.isArray(state?.roles) ? state.roles.slice(0, 8) : [];
    notify('showcase-cursors', { roles });
  };
  window.__playforgeSyncStatus = message => {
    if (!message || message.source !== 'playforge-godot-editor' || message.type !== 'sync-status' ||
        typeof message.text !== 'string' || message.text.length > 2000 || !Number.isSafeInteger(message.revision) ||
        typeof message.conflicted !== 'boolean') return;
    // Native dialogs are drawn in the editor canvas, beneath the HTML game iframe.
    nativeGameOverlay.style.visibility = message.conflicted ? 'hidden' : '';
    notify('sync-status', { text: message.text, revision: message.revision, conflicted: message.conflicted });
  };
  function fail(error) {
    const message = error instanceof Error ? error.message : String(error);
    hideLoading();
    status.textContent = 'Could not open editor';
    showNotice(message, 10000);
    notify('loadingerror', { message });
  }
  function finishGame(project) {
    if (gameOverlay.style.display === 'none') return;
    game = null;
    gameStarting = false;
    const replacement = document.createElement('canvas');
    replacement.id = gameCanvas.id;
    replacement.tabIndex = gameCanvas.tabIndex;
    gameCanvas.parentNode.replaceChild(replacement, gameCanvas);
    gameCanvas = replacement;
    gameOverlay.style.display = 'none';
    status.textContent = '';
    canvas.focus();
    notify('game-exit');
  }
  function returnToEditor() {
    gameExitRequested = true;
    if (game && gameStarting) {
      game.requestQuit();
      return;
    }
    finishGame({ project: { name: projectLabel.textContent } });
  }
  returnToEditorButton.addEventListener('click', returnToEditor);
  function execute(args, project) {
    const isEditor = args.includes('--editor') || args.includes('-e');
    notify('execute', { mode: isEditor ? 'editor' : 'game' });
    if (isEditor) {
      status.textContent = '';
      return;
    }
    if (game) {
      console.error('A game is already running. Stop it before starting another.');
      return;
    }
    gameOverlay.style.display = 'block';
    gameExitRequested = false;
    gameStarting = false;
    status.textContent = 'Running game';
    const concurrency = Math.min(24, Math.max(12, navigator.hardwareConcurrency || 1));
    game = new Engine({
      canvas: gameCanvas,
      canvasResizePolicy: 1,
      persistentPaths: ['/home/web_user'],
      unloadAfterInit: false,
      emscriptenPoolSize: concurrency,
      godotPoolSize: Math.floor(concurrency / 3),
      onPrint: (...args) => appendSessionLog('game', 'info', ...args),
      onPrintError: (...args) => appendSessionLog('game', 'error', ...args),
      onExit: () => {
        finishGame(project);
      },
    });
    const activeGame = game;
    activeGame.init(forgePath('/OfficialGodot/vendor/godot.editor')).then(() => {
      if (gameExitRequested) {
        activeGame.requestQuit();
        finishGame(project);
        return;
      }
      gameStarting = true;
      return activeGame.start({ args, canvas: gameCanvas });
    }).catch(fail);
    gameCanvas.focus();
  }
  function sendCursor(event, force = false) {
    if (game) return;
    const now = performance.now();
    if (!force && now - lastPointerAt < 100) return;
    lastPointerAt = now;
    if (!window.innerWidth || !window.innerHeight) return;
    lastCursorX = Math.max(0, Math.min(1, event.clientX / window.innerWidth));
    lastCursorY = Math.max(0, Math.min(1, event.clientY / window.innerHeight));
    notify('activity', { kind: 'cursor', x: lastCursorX, y: lastCursorY });
  }
  canvas.addEventListener('pointermove', event => sendCursor(event));
  canvas.addEventListener('pointerdown', event => {
    sendCursor(event, true);
    // The plugin emits the actual clicked control label after native UI hit testing.
  });
  // The Godot plugin reports text from focused name/property fields only.
  // Canvas key events cannot distinguish those fields from the script editor.
  async function fetchProject() {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) throw new Error('A valid project ID is required.');
    const response = await fetch(forgePath(`/api/platform/projects/${encodeURIComponent(projectId)}`), { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok !== true || !Number.isSafeInteger(data.revision)) {
      throw new Error(data?.error || `Project request failed (${response.status}).`);
    }
    return data;
  }
  async function fetchAddon() {
    const files = {};
    for (const name of ['plugin.cfg', 'plugin.gd']) {
      const response = await fetch(forgePath(`/api/platform-addon/${encodeURIComponent(name)}`), { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`PlayForge platform add-on could not be loaded (${response.status}).`);
      files[name] = await response.text();
    }
    return files;
  }
  async function fetchEditorAddon(route, names, optionalNames = []) {
    const response = await fetch(forgePath(`/api/platform-addon/${route}`), { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data?.ok !== true || !data.files ||
        Object.keys(data.files).some(name => !names.includes(name) && !optionalNames.includes(name)) ||
        optionalNames.some(name => Object.hasOwn(data.files, name) && (typeof data.files[name] !== 'string' || data.files[name].length > 300000)) ||
        names.some(name => !Object.hasOwn(data.files, name) ||
          typeof data.files[name] !== 'string' || data.files[name].length > 300000)) {
      throw new Error('에디터 플러그인을 불러오지 못했습니다.');
    }
    return data;
  }
  async function fetchReplayAddon(template) {
    if (template !== null && (typeof template !== 'string' || !/^[a-z0-9-]{1,40}$/.test(template))) throw new Error('Invalid showcase template.');
    const route = template === null ? 'replay' : `showcase/${encodeURIComponent(template)}`;
    const data = await fetchEditorAddon(route, ['plugin.cfg', 'plugin.gd', 'showcase_panel.gd', 'showcase_canvas.gd',
      'showcase_timeline.gd', 'showcase_scene_replay.gd', 'showcase_targets.gd', 'showcase_import.gd'],
      ['showcase_store.gd', 'showcase_import_history.gd', 'showcase_feedback.gd', 'showcase_gestures.gd', 'showcase_game_launch.gd', 'showcase_repository.gd']);
    if (template !== null && ![1, 3].includes(data.manifest?.schemaVersion)) throw new Error('Invalid showcase manifest.');
    return data;
  }
  async function fetchRemoteControlAddon() {
    if (!remoteControlAllowed) return null;
    try {
      const response = await fetch(forgePath('/api/platform-addon/remote-control'), { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 403) {
        disableRemoteControl();
        return null;
      }
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      const names = ['plugin.cfg', 'plugin.gd', 'remote_workspace.gd', 'remote_reflection.gd'];
      if (!data || data.ok !== true || !data.files ||
          Object.keys(data.files).some(name => !names.includes(name)) ||
          names.some(name => typeof data.files[name] !== 'string' || data.files[name].length > 300000)) {
        return null;
      }
      return data.files;
    } catch {
      return null;
    }
  }
  async function fetchAvatarAddon() {
    try {
      const response = await fetch(forgePath('/api/platform-addon/avatar'), { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      if (!data || data.ok !== true || !data.files || typeof data.files !== 'object') return null;
      const binaryAssets = [];
      const wanted = Array.isArray(data.assets) ? data.assets : [];
      await Promise.all(wanted.map(async (asset) => {
        if (!asset?.url || !asset?.relPath) return;
        const res = await fetch(forgePath(asset.url), { credentials: 'same-origin' });
        if (!res.ok) return;
        const buf = new Uint8Array(await res.arrayBuffer());
        binaryAssets.push({ relPath: asset.relPath, buffer: buf });
      }));
      return { files: data.files, binaryAssets };
    } catch {
      return null;
    }
  }
  async function start() {
    try {
      status.textContent = 'Fetching project files';
      setLoading('프로젝트 파일 불러오는 중…', '프로젝트와 에디터 애드온을 가져오고 있습니다.', 8);
      await ensureCsrfToken();
      const [project, addonFiles, chat, remoteControlFiles, avatarBundle] = await Promise.all([fetchProject(), fetchAddon(),
        fetchEditorAddon('agent-chat', ['plugin.cfg', 'plugin.gd', 'chat_panel.gd', 'scene_commands.gd'],
          ['chat_settings.gd', 'chat_context.gd', 'chat_sessions.gd', 'chat_attachments.gd', 'chat_stream.gd', 'chat_web_dock.gd']),
        fetchRemoteControlAddon(),
        fetchAvatarAddon()]);
      const showcase = playShowcase && project.project?.mode === 'showcase';
      const replay = await fetchReplayAddon(showcase ? project.project.template : null);
      const files = prepareProjectFiles(project.files, project.revision, addonFiles, replay, chat.files, remoteControlFiles, avatarBundle);
      projectLabel.textContent = project.project?.name || projectId;
      status.textContent = `Project revision ${project.revision} · starting Godot`;
      setLoading('Godot 웹 에디터 다운로드 중…', 'WASM 엔진을 받아오고 있습니다 (최초 1회 이후 브라우저 캐시 적용).', 12);
      if (!Engine.isWebGLAvailable()) throw new Error('This browser does not support WebGL.');
      const missing = Engine.getMissingFeatures({ threads: true });
      if (missing.length) throw new Error(`Godot Web Editor requirements are unavailable: ${missing.join(', ')}`);
      const concurrency = Math.min(24, Math.max(12, navigator.hardwareConcurrency || 1));
      engine = new Engine({
        canvas,
        canvasResizePolicy: 0,
        persistentPaths: ['/home/web_user'],
        unloadAfterInit: false,
        emscriptenPoolSize: concurrency,
        godotPoolSize: Math.floor(concurrency / 3),
        onProgress: (current, total) => {
          const mb = bytes => (bytes / (1024 * 1024)).toFixed(1);
          if (total > 0) {
            const ratio = Math.min(1, current / total);
            const pct = Math.round(ratio * 100);
            status.textContent = `Loading Godot ${pct}%`;
            setLoading('Godot 웹 에디터 다운로드 중…', `${mb(current)} MB / ${mb(total)} MB (${pct}%)`, 12 + ratio * 76);
          } else if (current > 0) {
            status.textContent = `Loading Godot (${mb(current)} MB)`;
            setLoading('Godot 웹 에디터 다운로드 중…', `${mb(current)} MB 수신 중…`, Math.min(86, 15 + (current / (100 * 1024 * 1024)) * 70));
          }
        },
        onPrint: (...args) => appendSessionLog('editor', 'info', ...args),
        onPrintError: (...args) => appendSessionLog('editor', 'error', ...args),
        onExit: () => notify('editor-exit'),
        onExecute: (args) => execute(args, project),
      });
      await engine.init(forgePath('/OfficialGodot/vendor/godot.editor'));
      setLoading('Godot 웹 에디터 초기화 중…', '프로젝트 파일을 가상 파일시스템에 배치하고 있습니다.', 92);
      engine.copyToFS('/home/web_user/keep', new Uint8Array());
      for (const file of files) engine.copyToFS(file.path, file.buffer);
      notify('loading', { projectName: project.project?.name || projectId, revision: project.revision });
      started = true;
      status.textContent = '';
      canvas.focus();
      window.__playforgeShowcaseAutoStart = Boolean(showcase);
      setLoading('Godot 에디터 화면 시작 중…', '잠시 후 편집 화면이 표시됩니다.', 96);
      engine.start({ args: ['--editor', '--path', `/home/web_user/projects/${projectId}`, '--single-window'], canvas })
        .then(() => {
          hideLoading();
          notify('ready', { revision: project.revision, projectName: project.project?.name || projectId });
        })
        .catch(fail);
    } catch (error) {
      fail(error);
    }
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== window.parent || !event.data || event.data.source !== 'playforge-platform') return;
    if (event.data.type === 'focus' && started) canvas.focus();
    if (event.data.type === 'show-conflicts' && typeof window.__playforgeShowConflictsCallback === 'function') {
      window.__playforgeShowConflictsCallback('show-conflicts');
    }
    if (event.data.type === 'service-status' && typeof event.data.text === 'string') status.textContent = event.data.text;
    if (event.data.type === 'collaboration-status' && typeof event.data.text === 'string' && collaborationButton) {
      collaborationButton.textContent = event.data.text;
      collaborationButton.title = event.data.text;
    }
    if (event.data.type === 'remote-command' && event.data.command) {
      executeRemoteCommand(event.data.command);
    }
  });
  start();
})();
