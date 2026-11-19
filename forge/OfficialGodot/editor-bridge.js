(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const projectId = query.get('project') || '';
  const playShowcase = query.get('showcase') === '1';
  const projectLabel = document.getElementById('project');
  const status = document.getElementById('status');
  const notice = document.getElementById('notice');
  const canvas = document.getElementById('editor-canvas');
  let gameCanvas = document.getElementById('game-canvas');
  const gameOverlay = document.getElementById('game-overlay');
  const returnToEditorButton = document.getElementById('return-to-editor');
  const nativeGameOverlay = document.getElementById('native-game-overlay');
  const nativeGameFrame = document.getElementById('native-game-frame');
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
  let noticeTimer = null;

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
    if(multiplayerApi)return multiplayerApi;
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

  async function loadNativeGame() {
    const latest = await fetchProject();
    if (['brawllabs', 'fortress-war'].includes(latest.project?.template)) {
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
    nativeGameRevision = build.revision;
    nativeGameFrame.src = forgePath(build.previewUrl);
  }

  function showNativeGame(screenMessage) {
    const rect = screenMessage.rect;
    if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) ||
        rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1.01 || rect.y + rect.height > 1.01) return;
    nativeGameRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    window.__playforgeNativeGameRect = { ...nativeGameRect };
    nativeGameVisible = true;
    nativeGameOverlay.style.display = 'block';
    positionNativeGame();
    if (!nativeGameLoad) {
      nativeGameLoad = loadNativeGame().catch(error => {
        showNotice(`Game workspace failed: ${error.message}`);
        console.error(error);
      }).finally(() => { nativeGameLoad = null; });
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

  function prepareProjectFiles(files, revision, addonFiles, showcase) {
    if (!Array.isArray(files) || files.length > 512) throw new Error('Invalid project file list.');
    const seen = new Set();
    let totalBytes = 0;
    const dir = `/home/web_user/projects/${projectId}`;
    const projectFiles = files.map((entry) => {
      if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') throw new Error('Invalid project file.');
      const file = entry.path.replaceAll('\\', '/');
      if (/^addons\/playforge_(platform|showcase)\//.test(file)) return null;
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
    const originalProjectConfig = projectFile.content;
    const pluginPaths = ['res://addons/playforge_platform/plugin.cfg'];
    if (showcase) pluginPaths.push('res://addons/playforge_showcase/plugin.cfg');
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
    if (showcase) {
      projectFiles.push({ path: '.playforge-showcase.json', content: JSON.stringify(showcase.manifest) });
      for (const [name, content] of Object.entries(showcase.files)) {
        projectFiles.push({ path: `addons/playforge_showcase/${name}`, content });
      }
    }
    return projectFiles.map(file => ({ path: `${dir}/${file.path}`, buffer: new TextEncoder().encode(file.content) }));
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
  async function fetchShowcase(template) {
    if (typeof template !== 'string' || !/^[a-z0-9-]{1,40}$/.test(template)) throw new Error('Invalid showcase template.');
    const response = await fetch(forgePath(`/api/platform-addon/showcase/${encodeURIComponent(template)}`), { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    const names = ['plugin.cfg', 'plugin.gd', 'showcase_panel.gd', 'showcase_canvas.gd', 'showcase_timeline.gd'];
    if (!response.ok || data?.ok !== true || data.manifest?.schemaVersion !== 1 || !data.files ||
        Object.keys(data.files).length !== names.length || names.some(name => !Object.hasOwn(data.files, name) ||
          typeof data.files[name] !== 'string' || data.files[name].length > 300000)) {
      throw new Error('템플릿 제작 시연을 준비하지 못했습니다.');
    }
    return data;
  }
  async function start() {
    try {
      status.textContent = 'Fetching project files';
      await ensureCsrfToken();
      const [project, addonFiles] = await Promise.all([fetchProject(), fetchAddon()]);
      const showcase = playShowcase ? await fetchShowcase(project.project?.template) : null;
      const files = prepareProjectFiles(project.files, project.revision, addonFiles, showcase);
      projectLabel.textContent = project.project?.name || projectId;
      status.textContent = `Project revision ${project.revision} · starting Godot`;
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
        onExit: () => notify('editor-exit'),
        onExecute: (args) => execute(args, project),
      });
      await engine.init(forgePath('/OfficialGodot/vendor/godot.editor'));
      engine.copyToFS('/home/web_user/keep', new Uint8Array());
      for (const file of files) engine.copyToFS(file.path, file.buffer);
      notify('loading', { projectName: project.project?.name || projectId, revision: project.revision });
      started = true;
      status.textContent = '';
      canvas.focus();
      window.__playforgeShowcaseAutoStart = Boolean(showcase);
      engine.start({ args: ['--editor', '--path', `/home/web_user/projects/${projectId}`, '--single-window'], canvas })
        .then(() => notify('ready', { revision: project.revision, projectName: project.project?.name || projectId }))
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
  });
  start();
})();
