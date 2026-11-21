/* PlayForge -> PlayHub Sandboxed Godot Web Shell Bridge (playhub-godot-shell-v1)
 * Automatically performs PlayHub iframe MessageChannel handshake when embedded,
 * exposes GameSDK + PlayHubBridge to Godot JavaScriptBridge, and is a safe no-op standalone.
 */
(function (root) {
  'use strict';
  if (root.__PLAYHUB_GODOT_SHELL_LOADED__) return;
  root.__PLAYHUB_GODOT_SHELL_LOADED__ = true;

  var searchParams = new URLSearchParams(root.location ? root.location.search : '');
  var hashParams = new URLSearchParams(root.location ? root.location.hash.slice(1) : '');
  var locale = searchParams.get('lang') || 'ko';
  var nonce = hashParams.get('nonce') || '';
  root.__PLAYHUB_LOCALE__ = locale;

  var embedded = Boolean(root.parent && root.parent !== root && /^[a-f0-9]{32,64}$/i.test(nonce));
  var port = null;
  var serial = 0;
  var connected = false;
  var readySent = false;
  var resolveConnect;
  var rejectConnect;
  var pending = new Map();
  var statusListeners = [];
  var pauseListeners = [];
  var snapshotListeners = [];
  var platformActionListeners = [];

  var connection = new Promise(function (resolve, reject) {
    resolveConnect = resolve;
    rejectConnect = reject;
  });
  connection.catch(function () {});

  function emitStatus(value) {
    for (var i = 0; i < statusListeners.length; i++) {
      try { statusListeners[i](value); } catch (_) {}
    }
  }

  function request(type, payload) {
    if (!embedded) return Promise.resolve({ offline: true });
    return connection.then(function () {
      if (pending.size >= 20) return Promise.reject(new Error('Too many platform requests'));
      var id = 'g' + (++serial);
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          pending.delete(id);
          reject(new Error('Platform request timed out'));
        }, 12000);
        pending.set(id, { resolve: resolve, reject: reject, timer: timer });
        port.postMessage({ id: id, type: type, payload: payload });
      });
    });
  }

  function sendReadyOnce() {
    if (!embedded || readySent) return Promise.resolve();
    readySent = true;
    return request('ready', { version: 1 }).catch(function () {
      readySent = false;
    });
  }

  if (embedded) {
    var retry = null;
    var deadline = null;

    var onMessage = function (event) {
      if (event.source !== root.parent || !event.data || event.data.type !== 'playhub:init' || event.data.nonce !== nonce || !event.ports || !event.ports[0] || connected) {
        return;
      }
      port = event.ports[0];
      connected = true;
      clearInterval(retry);
      clearTimeout(deadline);
      root.removeEventListener('message', onMessage);
      port.onmessage = function (message) {
        var data = message.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'host_pause') {
          for (var i = 0; i < pauseListeners.length; i++) {
            try { pauseListeners[i](); } catch (_) {}
          }
          return;
        }
        if (data.type === 'host_snapshot') {
          Promise.resolve().then(function () {
            var value = null;
            for (var i = 0; i < snapshotListeners.length; i++) {
              try { value = snapshotListeners[i](); } catch (_) {}
            }
            return value;
          }).then(function (value) {
            port.postMessage({ type: 'host_snapshot_result', id: data.id, payload: value });
          }).catch(function () {
            port.postMessage({ type: 'host_snapshot_result', id: data.id, payload: null });
          });
          return;
        }
        if (data.type === 'save_status') {
          emitStatus(data.payload);
          return;
        }
        if (data.type === 'platform_action') {
          for (var k = 0; k < platformActionListeners.length; k++) {
            try { platformActionListeners[k](data.payload || {}); } catch (_) {}
          }
          return;
        }
        var job = pending.get(data.id);
        if (!job) return;
        pending.delete(data.id);
        clearTimeout(job.timer);
        if (data.ok) job.resolve(data.payload);
        else {
          var err = new Error((data.error && data.error.message) || 'Platform request failed');
          err.code = data.error && data.error.code;
          job.reject(err);
        }
      };
      port.start();
      emitStatus({ state: 'connected', message: 'PlayHub connected' });
      resolveConnect();
      sendReadyOnce();
    };

    var hello = function () {
      try {
        root.parent.postMessage({ type: 'playhub:connect', version: 1, nonce: nonce }, '*');
      } catch (_) {}
    };

    root.addEventListener('message', onMessage);
    retry = setInterval(hello, 500);
    deadline = setTimeout(function () {
      if (!connected) {
        clearInterval(retry);
        rejectConnect(new Error('PlayHub handshake timed out'));
        emitStatus({ state: 'offline', message: 'Standalone mode' });
      }
    }, 8000);
    hello();

    // Send periodic activity pulses while visible so PlayHub tracks active play cleanly.
    setInterval(function () {
      if (connected && readySent && (!root.document || !root.document.hidden)) {
        request('activity', { updating: true }).catch(function () {});
      }
    }, 5000);
  } else {
    resolveConnect();
  }

  var sdk = {
    version: 'playhub-godot-shell-v1',
    embedded: embedded,
    locale: locale,
    connect: function () { return connection; },
    ready: sendReadyOnce,
    load: function () { return request('load', { slot: 'main', schemaVersion: 1 }); },
    save: function (payload) { return request('save', { slot: 'main', schemaVersion: 1, value: payload }); },
    getAvatarLoadout: function () {
      if (!embedded) return Promise.resolve({ offline: true, loadout: null });
      return request('avatar_loadout', {});
    },
    event: function (name, properties) { return request('event', { name: name, properties: properties || {} }); },
    activity: function () { return request('activity', { updating: true }); },
    onStatus: function (fn) { if (typeof fn === 'function') statusListeners.push(fn); },
    onPause: function (fn) { if (typeof fn === 'function') pauseListeners.push(fn); },
    onSnapshot: function (fn) { if (typeof fn === 'function') snapshotListeners.push(fn); },
    onPlatformAction: function (fn) { if (typeof fn === 'function') platformActionListeners.push(fn); }
  };

  if (!root.GameSDK) root.GameSDK = sdk;
  root.PlayHubBridge = sdk;
})(typeof globalThis !== 'undefined' ? globalThis : window);
