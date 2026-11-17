(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const projectId = query.get('project') || '';
  const projectLabel = document.getElementById('project');
  const status = document.getElementById('status');
  const notice = document.getElementById('notice');
  const bar = document.getElementById('bar');
  const canvas = document.getElementById('editor-canvas');
  let gameCanvas = document.getElementById('game-canvas');
  const gameOverlay = document.getElementById('game-overlay');
  const returnToEditorButton = document.getElementById('return-to-editor');
  const origin = location.origin;
  let engine;
  let game;
  let gameStarting = false;
  let gameExitRequested = false;
  let lastPointerAt = 0;
  let lastCursorX = 0.5;
  let lastCursorY = 0.5;
  let started = false;

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

  function prepareProjectFiles(files, revision, addonFiles) {
    if (!Array.isArray(files) || files.length > 512) throw new Error('Invalid project file list.');
    const seen = new Set();
    let totalBytes = 0;
    const dir = `/home/web_user/projects/${projectId}`;
    const projectFiles = files.map((entry) => {
      if (!entry || typeof entry.path !== 'string' || typeof entry.content !== 'string') throw new Error('Invalid project file.');
      const file = entry.path.replaceAll('\\', '/');
      if (file.startsWith('addons/playforge_platform/')) return null;
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
    const originalProjectConfig = projectFile.content;
    const pluginCfg = 'res://addons/playforge_platform/plugin.cfg';
    if (!projectFile.content.includes(pluginCfg)) {
      if (/^\[editor_plugins\]\s*$/m.test(projectFile.content)) {
        projectFile.content = projectFile.content.replace(/^\[editor_plugins\]\s*$/m, (header, offset, source) => {
          const end = source.indexOf('\n[', offset + header.length);
          const body = source.slice(offset + header.length, end < 0 ? source.length : end);
          const existing = body.match(/^enabled\s*=\s*PackedStringArray\(([^)]*)\)\s*$/m);
          const values = existing ? existing[1].trim() : '';
          const assignment = `enabled=PackedStringArray(${values}${values ? ', ' : ''}"${pluginCfg}")`;
          return `${header}\n${existing ? body.replace(existing[0], assignment) : `${body.trimEnd()}\n${assignment}`}`;
        });
      } else projectFile.content += `\n[editor_plugins]\nenabled=PackedStringArray("${pluginCfg}")\n`;
    }
    projectFiles.push({ path: '.playforge-platform.json', content: JSON.stringify({ id: projectId, revision,
      baseProjectConfig: originalProjectConfig, editorProjectConfig: projectFile.content }) });
    for (const [name, content] of Object.entries(addonFiles)) {
      if (typeof content !== 'string' || content.length > 300000) throw new Error('Invalid PlayForge platform add-on.');
      const file = `addons/playforge_platform/${name}`;
      const existing = projectFiles.findIndex(item => item.path === file);
      if (existing >= 0) projectFiles[existing].content = content;
      else projectFiles.push({ path: file, content });
    }
    return projectFiles.map(file => ({ path: `${dir}/${file.path}`, buffer: new TextEncoder().encode(file.content) }));
  }

  function notify(type, detail = {}) {
    const message = { source: 'playforge-godot-editor', type, projectId, ...detail };
    if (window.parent !== window && window.parent.location.origin === origin) window.parent.postMessage(message, origin);
  }
  function fail(error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = 'Could not open editor';
    notice.textContent = message;
    notice.style.display = 'block';
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
    status.textContent = `Godot editor · ${project.project?.name || projectId}`;
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
      status.textContent = `Godot editor · ${project.project?.name || projectId}`;
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
    activeGame.init('/OfficialGodot/vendor/godot.editor').then(() => {
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
  function setProgress(current, total) {
    if (total > 0) bar.style.width = `${Math.min(100, Math.round(current * 100 / total))}%`;
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
    if (!game) notify('activity', { kind: 'step', text: '클릭', x: lastCursorX, y: lastCursorY });
  });
  // The Godot plugin reports text from focused name/property fields only.
  // Canvas key events cannot distinguish those fields from the script editor.
  async function fetchProject() {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(projectId)) throw new Error('A valid project ID is required.');
    const response = await fetch(`/api/platform/projects/${encodeURIComponent(projectId)}`, { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok !== true || !Number.isSafeInteger(data.revision)) {
      throw new Error(data?.error || `Project request failed (${response.status}).`);
    }
    return data;
  }
  async function fetchAddon() {
    const files = {};
    for (const name of ['plugin.cfg', 'plugin.gd']) {
      const response = await fetch(`/api/platform-addon/${encodeURIComponent(name)}`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error(`PlayForge platform add-on could not be loaded (${response.status}).`);
      files[name] = await response.text();
    }
    return files;
  }
  async function start() {
    try {
      status.textContent = 'Fetching project files';
      const [project, addonFiles] = await Promise.all([fetchProject(), fetchAddon()]);
      const files = prepareProjectFiles(project.files, project.revision, addonFiles);
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
        onProgress: setProgress,
        onExit: () => notify('editor-exit'),
        onExecute: (args) => execute(args, project),
      });
      await engine.init('/OfficialGodot/vendor/godot.editor');
      engine.copyToFS('/home/web_user/keep', new Uint8Array());
      for (const file of files) engine.copyToFS(file.path, file.buffer);
      notify('loading', { projectName: project.project?.name || projectId, revision: project.revision });
      started = true;
      status.textContent = `Godot editor · ${project.project?.name || projectId}`;
      bar.style.width = '100%';
      setTimeout(() => { bar.style.display = 'none'; }, 400);
      canvas.focus();
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
  });
  start();
})();
