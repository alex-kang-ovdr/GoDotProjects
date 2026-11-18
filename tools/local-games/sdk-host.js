(function () {
  'use strict';

  const frame = document.getElementById('game-frame');
  const indicator = document.getElementById('runtime-status');
  if (!frame || !indicator) return;

  const { gameId, gameOrigin, nonce } = frame.dataset;
  const frameUrl = new URL(frame.src);
  if (typeof gameId !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(gameId)
      || !/^[a-f0-9]{32,64}$/i.test(nonce)
      || frameUrl.origin !== gameOrigin || gameOrigin === location.origin
      || new URLSearchParams(frameUrl.hash.slice(1)).get('nonce') !== nonce) return;

  const version = 1;
  const storageKey = `playhub-local-sdk-v1:${gameId}`;
  const maxBytes = 64 * 1024;
  const encoder = new TextEncoder();
  const events = new Set(['round_start', 'round_complete', 'game_pause', 'game_resume', 'runtime_error']);
  const loadingText = '게임 연결을 기다리고 있어요.';
  const readyText = '게임을 시작할 수 있어요. 진행은 이 브라우저에 저장됩니다.';
  const savedText = '진행을 이 브라우저에 저장했어요.';
  let port, closed = false, ready = false, loaded = false, problem = null;
  let lastRead = { raw: null, revision: 0, value: null };
  let pendingSnapshot, leaving = false;
  let requests = 0, requestWindow = performance.now(), inFlight = 0;

  function report(state, message) {
    indicator.dataset.state = state;
    indicator.textContent = message;
    port?.postMessage({ type: 'save_status', payload: { state, message } });
  }

  function error(code, message) {
    return Object.assign(new Error(message), { code });
  }

  function unavailable() {
    return error('LOCAL_STORAGE_UNAVAILABLE', '브라우저 저장소를 사용할 수 없어요. 이번 화면의 진행을 저장하지 못했습니다.');
  }

  function damaged() {
    return error('SAVE_CORRUPT', '저장 기록을 읽을 수 없어요. 기존 기록을 보존하고 이 화면의 저장을 멈췄습니다.');
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function validSnapshot(value) {
    if (!object(value) || value.gameId !== gameId || value.schemaVersion !== version
        || typeof value.runId !== 'string' || !value.runId || value.runId.length >= 100
        || typeof value.runStarted !== 'boolean' || typeof value.runEnded !== 'boolean') return false;
    try { return window.GameLogic?.valid(gameId, value.state) === true; }
    catch { return false; }
  }

  function withinLimit(text) {
    return text.length <= maxBytes && encoder.encode(text).byteLength <= maxBytes;
  }

  function readSave() {
    let raw;
    try { raw = localStorage.getItem(storageKey); }
    catch { throw unavailable(); }
    if (raw === null) return { raw, revision: 0, value: null };
    if (!withinLimit(raw)) throw damaged();

    let record;
    try { record = JSON.parse(raw); }
    catch { throw damaged(); }
    if (!object(record) || record.gameId !== gameId || record.schemaVersion !== version
        || !Number.isSafeInteger(record.revision) || record.revision < 1 || !validSnapshot(record.value)) throw damaged();
    return { raw, revision: record.revision, value: record.value };
  }

  function load() {
    if (!loaded) {
      try { lastRead = readSave(); }
      catch (failure) { problem = failure; }
      loaded = true;
    }
    return { value: lastRead.value, revision: lastRead.revision, local: false };
  }

  function save(value) {
    if (!loaded || !ready) throw error('GAME_NOT_READY', '게임 준비를 마친 뒤에 저장할 수 있어요.');
    if (problem) throw problem;
    if (!validSnapshot(value)) throw error('SAVE_INVALID', '게임 저장 형식이 올바르지 않아요.');

    const write = () => {
      if (closed) throw error('GAME_CLOSED', '종료된 게임의 진행은 저장할 수 없어요.');
      if (problem) throw problem;
      const current = readSave();
      if (current.revision !== lastRead.revision || current.raw !== lastRead.raw) {
        throw error('SAVE_CONFLICT', '다른 탭의 저장을 보존했어요. 최신 기록을 불러오려면 게임을 다시 열어 주세요.');
      }
      const revision = current.revision + 1;
      if (!Number.isSafeInteger(revision)) throw damaged();
      let raw;
      try { raw = JSON.stringify({ gameId, schemaVersion: version, revision, value }); }
      catch { throw error('SAVE_INVALID', '게임 저장 형식이 올바르지 않아요.'); }
      if (!withinLimit(raw)) throw error('SAVE_TOO_LARGE', '진행 기록이 브라우저 저장 한도보다 커요.');
      const snapshot = JSON.parse(raw).value;
      if (!validSnapshot(snapshot)) throw error('SAVE_INVALID', '게임 저장 형식이 올바르지 않아요.');
      try { localStorage.setItem(storageKey, raw); }
      catch { throw unavailable(); }
      lastRead = { raw, revision, value: snapshot };
      return { revision, local: false };
    };
    return navigator.locks ? navigator.locks.request(storageKey, write) : write();
  }

  function showSaveError(failure) {
    if (failure.code === 'SAVE_CORRUPT' || failure.code === 'SAVE_CONFLICT' || failure.code === 'LOCAL_STORAGE_UNAVAILABLE') {
      problem = failure;
    }
    report(problem ? 'read-only' : 'error', failure.message);
  }

  function settleSnapshot(value) {
    if (!pendingSnapshot) return;
    const { resolve, timer } = pendingSnapshot;
    pendingSnapshot = null;
    clearTimeout(timer);
    resolve(value);
  }

  async function handle({ data }) {
    if (closed || !object(data)) return;
    const { id, type, payload } = data;
    if (type === 'host_snapshot_result') {
      if (pendingSnapshot && id === pendingSnapshot.id) settleSnapshot(payload);
      return;
    }
    if (!/^g[1-9][0-9]{0,15}$/.test(typeof id === 'string' ? id : '') || typeof type !== 'string') return;

    const now = performance.now();
    if (now - requestWindow > 1000) { requests = 0; requestWindow = now; }
    const reply = body => { if (!closed) port.postMessage({ id, ...body }); };
    if (++requests > 80 || inFlight >= 24) {
      reply({ ok: false, error: { code: 'RATE_LIMITED', message: '게임 요청이 너무 많아요.' } });
      return;
    }
    inFlight++;
    try {
      let result = {};
      switch (type) {
        case 'ready':
          if (payload?.version !== version || !loaded) throw error('GAME_NOT_READY', '지원하지 않는 게임 연결입니다.');
          ready = true;
          clearTimeout(deadline);
          break;
        case 'load':
        case 'save':
          if (payload?.slot !== 'main' || payload.schemaVersion !== version) throw error('SAVE_INVALID', '지원하지 않는 게임 저장 형식입니다.');
          result = type === 'load' ? load() : await save(payload.value);
          break;
        case 'event':
          if (!events.has(payload?.name)) throw error('EVENT_INVALID', '지원하지 않는 게임 이벤트입니다.');
          break;
        case 'activity':
          if (payload?.updating !== true) throw error('ACTIVITY_INVALID', '지원하지 않는 활동 요청입니다.');
          break;
        default: throw error('REQUEST_INVALID', '지원하지 않는 게임 요청입니다.');
      }
      reply({ ok: true, payload: result });
      if (!closed && type === 'ready') report(problem ? 'read-only' : 'ready', problem?.message || readyText);
      if (!closed && type === 'save') report('saved', savedText);
    } catch (failure) {
      const code = failure.code || 'LOCAL_HOST_ERROR';
      const message = failure.code ? failure.message : '게임 요청을 처리하지 못했어요.';
      reply({ ok: false, error: { code, message } });
      if (!closed && type === 'save') showSaveError({ code, message });
    } finally { inFlight--; }
  }

  function connect(event) {
    const { data } = event;
    if (closed || port || event.source !== frame.contentWindow || event.origin !== gameOrigin
        || data?.type !== 'playhub:connect' || data.version !== version || data.nonce !== nonce) return;
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = handle;
    port.start();
    frame.contentWindow.postMessage({ type: 'playhub:init', nonce }, gameOrigin, [channel.port2]);
    window.removeEventListener('message', connect);
  }

  window.addEventListener('message', connect);
  report('loading', loadingText);
  const deadline = setTimeout(() => report('error', '게임 준비 응답이 지연되고 있어요. 목록에서 게임을 다시 열어 주세요.'), 12000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !closed) port?.postMessage({ type: 'host_pause' });
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    closed = true;
    clearTimeout(deadline);
    window.removeEventListener('message', connect);
    settleSnapshot(null);
    port?.close();
  });

  const backLink = document.getElementById('game-list-link');
  backLink?.addEventListener('click', async event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
        || !ready || !port || problem) return;
    event.preventDefault();
    if (leaving) return;
    leaving = true;
    const snapshot = await new Promise(resolve => {
      const id = `host-${crypto.randomUUID()}`;
      pendingSnapshot = { id, resolve, timer: setTimeout(() => settleSnapshot(null), 800) };
      port.postMessage({ type: 'host_snapshot', id });
    });
    if (closed) return;
    try {
      if (snapshot) await save(snapshot);
      location.assign(backLink.href);
    } catch (failure) {
      showSaveError({ code: failure.code, message: failure.code ? failure.message : '게임 진행을 저장하지 못했어요.' });
      leaving = false;
    }
  });
})();
