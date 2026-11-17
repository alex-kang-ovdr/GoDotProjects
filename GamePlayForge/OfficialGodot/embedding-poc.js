(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('poc-editor'), game = $('poc-game');
  let project, generation = 0, editorReady = false, active = '3D', lastEditor = '3D', lastBuild, building;
  const pending = new Map();
  const status = text => { $('poc-status').textContent = text; };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function api(url, body) {
    const response = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  }
  function layout() {
    const showGame = active === 'Game';
    const split = showGame && $('split').checked;
    $('stage').classList.toggle('split', split);
    $('editor-pane').hidden = showGame && !split;
    $('game-pane').hidden = !showGame;
    document.querySelectorAll('[data-screen]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.screen === active)));
    $('restart').disabled = !lastBuild || !!building;
    $('stop').disabled = !game.hasAttribute('src') && !building;
  }
  function cancelRequests() {
    for (const request of pending.values()) request.reject(Error('프로젝트가 변경되었습니다.'));
    pending.clear();
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== editor.contentWindow || event.data?.source !== 'playforge-godot-editor') return;
    const data = event.data;
    if (data.type === 'pluginready') {
      if (data.projectId !== project?.project.id) return;
      editorReady = true;
      editor.dataset.ready = 'true';
      document.querySelectorAll('[data-screen]').forEach(button => button.disabled = false);
      status('편집기가 준비되었습니다. 2D · 3D · 스크립트 · 게임 버튼을 눌러보세요.');
    }
    if (data.type === 'loadingerror') status('에디터를 불러오지 못했습니다: ' + data.message);
    if (data.type === 'guide-result') {
      const request = pending.get(data.requestId);
      if (!request) return;
      pending.delete(data.requestId);
      data.ok ? request.resolve(data) : request.reject(Error(data.error || '화면을 전환하지 못했습니다.'));
    }
  });
  function switchEditor(screen) {
    if (!editorReady) return Promise.reject(Error('편집기가 준비될 때까지 잠시 기다려 주세요.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(Error('에디터 응답 시간이 초과되었습니다.')); }, 15000);
      pending.set(requestId, { resolve: data => { clearTimeout(timer); resolve(data); }, reject: error => { clearTimeout(timer); reject(error); } });
      editor.contentWindow.postMessage({ source: 'playforge-platform-guide', type: 'screen', requestId, screen }, location.origin);
    });
  }
  async function loadProject(snapshot) {
    ++generation;
    cancelRequests();
    project = snapshot;
    editorReady = false;
    editor.dataset.ready = '';
    lastBuild = null;
    building = null;
    game.removeAttribute('src');
    active = snapshot.project.template === 'iron-wood' || snapshot.project.template === 'playground3d' || snapshot.project.template === 'blank3d' ? '3D' : '2D';
    lastEditor = active;
    $('project-name').textContent = snapshot.project.name;
    $('template').value = snapshot.project.template;
    document.querySelectorAll('[data-screen]').forEach(button => button.disabled = true);
    $('welcome').hidden = true;
    $('game-loading').hidden = true;
    editor.src = 'editor.html?project=' + encodeURIComponent(snapshot.project.id);
    history.replaceState(null, '', '?project=' + encodeURIComponent(snapshot.project.id));
    status('Godot 편집기를 불러오고 있습니다…');
    layout();
  }
  async function ensureGame(token) {
    const current = await api('/api/platform/projects/' + project.project.id);
    if (token !== generation) return;
    if (lastBuild?.revision === current.revision) {
      if (!game.hasAttribute('src')) game.src = lastBuild.previewUrl;
      status('게임 화면을 클릭하면 키보드와 마우스로 조작할 수 있습니다.');
      return;
    }
    $('game-loading').hidden = false;
    status('현재 저장된 버전으로 게임을 준비하고 있습니다…');
    let build = (await api('/api/platform-builds/' + current.project.id, { revision: current.revision })).build;
    const deadline = Date.now() + 240000;
    while (['queued', 'running'].includes(build.status)) {
      if (token !== generation) return;
      if (Date.now() > deadline) throw Error('게임 준비 시간이 초과되었습니다. 게임 버튼을 눌러 다시 시도하세요.');
      await sleep(600);
      build = (await api('/api/builds/' + build.id)).build;
    }
    if (token !== generation) return;
    if (build.status !== 'succeeded') throw Error(build.error || '게임을 준비하지 못했습니다.');
    lastBuild = build;
    game.src = build.previewUrl;
    $('game-revision').textContent = '저장 버전 ' + build.revision;
    status('게임 화면을 클릭하면 키보드와 마우스로 조작할 수 있습니다.');
  }
  async function select(screen) {
    if (!project) return;
    const token = generation;
    active = screen;
    layout();
    if (screen !== 'Game') {
      lastEditor = screen;
      await switchEditor(screen);
      if (token !== generation) return;
      status((screen === 'Script' ? '스크립트' : screen) + ' 편집 화면 · 게임 버튼으로 실행 화면을 열 수 있습니다.');
      editor.contentWindow.focus();
      return;
    }
    if (!building) {
      building = ensureGame(token).finally(() => {
        if (token === generation) { building = null; $('game-loading').hidden = true; layout(); }
      });
    }
    await building;
    if (token === generation && active === 'Game') game.contentWindow.focus();
  }
  function action(work) { return () => Promise.resolve().then(work).catch(error => status(error.message)); }
  document.querySelectorAll('[data-screen]').forEach(button => button.onclick = action(() => select(button.dataset.screen)));
  $('split').onchange = layout;
  $('open').onclick = action(async () => {
    $('open').disabled = true;
    try {
      const name = $('template').selectedOptions[0].textContent;
      await loadProject(await api('/api/platform/projects', { name: '임베딩 PoC · ' + name, template: $('template').value, mode: 'ready' }));
    } finally { $('open').disabled = false; }
  });
  $('stop').onclick = action(async () => {
    // Invalidate a pending build's UI result without destroying the editor.
    ++generation;
    building = null;
    game.removeAttribute('src');
    $('game-loading').hidden = true;
    await select(lastEditor);
    status('게임을 닫았습니다. 편집 화면은 그대로 유지됩니다.');
  });
  $('restart').onclick = () => { if (lastBuild) { game.src = lastBuild.previewUrl; status('같은 저장 버전으로 게임을 다시 실행합니다.'); } };
  (async () => {
    const listing = await api('/api/platform/templates');
    for (const template of listing.templates) {
      const option = document.createElement('option');
      option.value = template.id; option.textContent = template.name;
      $('template').append(option);
    }
    $('template').value = 'playground3d';
    const id = new URLSearchParams(location.search).get('project');
    if (id) await loadProject(await api('/api/platform/projects/' + encodeURIComponent(id)));
  })().catch(error => status(error.message));
})();
