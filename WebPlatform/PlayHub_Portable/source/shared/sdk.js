/* Sandboxed classic-script SDK: all persistence crosses a nonce-bound MessagePort. */
(function (root) {
  'use strict';
  let port = null, serial = 0, connected = false, resolveConnect, rejectConnect;
  const pending = new Map(), statusListeners = [], pauseListeners = [], snapshotListeners = [];
  const nonce = new URLSearchParams(location.hash.slice(1)).get('nonce') || '';
  const connection = new Promise((resolve, reject) => { resolveConnect = resolve; rejectConnect = reject; });
  connection.catch(() => {});
  const status = value => statusListeners.forEach(fn => { try { fn(value); } catch (_) {} });
  function attach(event) {
    if (event.source !== parent || event.data?.type !== 'playhub:init' || event.data?.nonce !== nonce || !event.ports?.[0] || connected) return;
    port = event.ports[0]; connected = true; clearInterval(retry); clearTimeout(deadline); window.removeEventListener('message', attach);
    port.onmessage = message => {
      const data = message.data; if (!data || typeof data !== 'object') return;
      if (data.type === 'host_pause') { pauseListeners.forEach(fn => fn()); return; }
      if (data.type === 'host_snapshot') { let value=null; for(const fn of snapshotListeners){try{value=fn();}catch(_){}} port.postMessage({type:'host_snapshot_result',id:data.id,payload:value}); return; }
      if (data.type === 'save_status') { status(data.payload); return; }
      const job = pending.get(data.id); if (!job) return; pending.delete(data.id); clearTimeout(job.timer);
      if (data.ok) job.resolve(data.payload); else { const error = new Error(data.error?.message || '플랫폼 요청을 처리하지 못했습니다.'); error.code = data.error?.code; job.reject(error); }
    };
    port.start(); status({ state: 'connected', message: '플랫폼 연결됨' }); resolveConnect();
  }
  function hello() { if (parent !== window && /^[a-f0-9]{32,64}$/i.test(nonce)) parent.postMessage({ type: 'playhub:connect', version: 1, nonce }, '*'); }
  window.addEventListener('message', attach);
  const retry = setInterval(hello, 600);
  const deadline = setTimeout(() => { if (!connected) { clearInterval(retry); rejectConnect(new Error('플랫폼 연결을 기다리는 시간이 지났습니다.')); status({ state: 'offline', message: '연결 없음 · 이 화면에서만 진행' }); } }, 6000);
  hello();
  async function request(type, payload) {
    await connection;
    if (pending.size >= 20) throw new Error('플랫폼 요청이 너무 많습니다.');
    const id = 'g' + (++serial);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('응답이 지연되고 있습니다.')); }, 12000);
      pending.set(id, { resolve, reject, timer }); port.postMessage({ id, type, payload });
    });
  }
  root.GameSDK = {
    connect: () => connection,
    ready: () => request('ready', { version: 1 }),
    load: () => request('load', { slot: 'main', schemaVersion: 1 }),
    save: payload => request('save', { slot: 'main', schemaVersion: 1, value: payload }),
    event: (name, properties = {}) => request('event', { name, properties }),
    activity: () => request('activity', { updating: true }),
    onStatus: fn => statusListeners.push(fn),
    onPause: fn => pauseListeners.push(fn),
    onSnapshot: fn => snapshotListeners.push(fn)
  };
})(globalThis);
