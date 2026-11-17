'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const colors = ['#b7f46a', '#74c8ff', '#ffab7a', '#cf9dff', '#ffd768', '#82e5cd'];
const CLIENT_ID = /^[a-zA-Z0-9_-]{8,100}$/;

function attachCollaboration(server, store, onLeave = () => {}, originAllowed = request => !request.headers.origin || request.headers.origin === 'http://' + request.headers.host) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 700000 });
  const peers = new Map();
  const users = () => [...peers.values()].map(peer => ({
    clientId: peer.clientId, name: peer.name, color: peer.color,
    focus: peer.focus, focusField: peer.focusField, selectedAsset: peer.selectedAsset, cursor: peer.cursor,
  }));
  const send = (socket, message) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const broadcast = message => {
    const encoded = JSON.stringify(message);
    for (const socket of peers.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
  };
  const presence = () => broadcast({ type: 'presence', users: users() });
  const lockState = () => store.snapshotLock();
  const sendLockState = state => {
    for (const [socket, peer] of peers) {
      const message = { type: 'lock', resource: 'settings', owner: state.owner, expiresAt: state.expiresAt };
      if (state.owner === peer.clientId) message.token = store.snapshotLock(peer.clientId).token;
      send(socket, message);
    }
  };

  server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/collaboration' || !originAllowed(request)) {
      socket.destroy(); return;
    }
    wss.handleUpgrade(request, socket, head, client => wss.emit('connection', client));
  });

  wss.on('connection', socket => {
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    const joinTimeout = setTimeout(() => { if (!peers.has(socket)) socket.close(1008, 'Join required'); }, 5000);

    socket.on('message', raw => {
      let message;
      try {
        message = JSON.parse(raw.toString());
        if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Message must be an object');
      } catch {
        socket.close(1007, 'Invalid JSON message'); return;
      }

      if (message.type === 'join') {
        if (peers.has(socket)) return;
        if (!CLIENT_ID.test(message.clientId || '') || peers.size >= 16 || users().some(user => user.clientId === message.clientId)) {
          socket.close(1008, 'Invalid or duplicate session'); return;
        }
        const name = String(message.name || 'Guest').trim().slice(0, 40) || 'Guest';
        peers.set(socket, { clientId: message.clientId, name, color: colors[peers.size % colors.length],
          focus: '', focusField: '', selectedAsset: '', cursor: null });
        clearTimeout(joinTimeout);
        send(socket, { type: 'welcome', clientId: message.clientId, users: users(), document: store.snapshot(), lock: store.snapshotLock(message.clientId) });
        presence();
        sendLockState(lockState());
        return;
      }

      const peer = peers.get(socket);
      if (!peer) return;
      if (message.type === 'presence') {
        peer.focus = typeof message.focus === 'string' ? message.focus.slice(0, 80) : '';
        peer.focusField = typeof message.focusField === 'string' ? message.focusField.slice(0, 120) : '';
        peer.selectedAsset = typeof message.selectedAsset === 'string' ? message.selectedAsset.slice(0, 160) : '';
        const cursor = message.cursor;
        if (cursor && typeof cursor === 'object' && !Array.isArray(cursor) &&
            Number.isFinite(cursor.x) && Number.isFinite(cursor.y) &&
            ['scene', 'lua', 'assets', 'settings', 'pie'].includes(cursor.pane)) {
          peer.cursor = { pane: cursor.pane, x: Math.max(0, Math.min(1, cursor.x)), y: Math.max(0, Math.min(1, cursor.y)) };
        } else peer.cursor = null;
        if (typeof message.name === 'string') peer.name = message.name.trim().slice(0, 40) || peer.name;
        presence();
        return;
      }

      if (message.type === 'text-update') {
        Promise.resolve().then(() => store.applyText(message.update, peer.clientId, message.requestId)).then(result => {
          send(socket, { type: 'text-ack', requestId: message.requestId, revision: result.revision,
            textRevision: result.textRevision, duplicate: result.duplicate });
          if (!result.duplicate) {
            broadcast({ type: 'text-update', update: result.update, revision: result.revision,
              textRevision: result.textRevision, clientId: peer.clientId, requestId: message.requestId });
          }
        }).catch(error => send(socket, { type: 'error', requestId: message.requestId, error: error.message }));
        return;
      }

      if (message.type === 'lock') {
        if (message.resource !== 'settings' || !['acquire', 'release'].includes(message.action)) {
          send(socket, { type: 'error', requestId: message.requestId, error: 'Invalid lock request' });
          return;
        }
        if (message.action === 'release' && !Number.isSafeInteger(message.token)) {
          send(socket, { type: 'error', requestId: message.requestId, error: 'Invalid settings lock token' });
          return;
        }
        const operation = message.action === 'acquire'
          ? store.acquireLock(peer.clientId)
          : store.releaseLock(peer.clientId, message.token);
        operation.then(result => {
          if (message.action === 'release' && !result) {
            send(socket, { type: 'error', requestId: message.requestId, error: 'settings_lock_lost' });
          }
          sendLockState(lockState());
        }).catch(error => send(socket, { type: 'error', requestId: message.requestId, error: error.message }));
        return;
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimeout);
      const peer = peers.get(socket);
      peers.delete(socket);
      if (!peer) return;
      store.releaseLock(peer.clientId).then(() => sendLockState(lockState())).catch(() => {});
      onLeave(peer.clientId);
      presence();
    });
    socket.on('error', () => {});
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false; socket.ping();
    }
  }, 10000);
  const lockPoll = setInterval(() => {
    const state = lockState();
    const signature = `${state.owner ?? ''}:${state.expiresAt ?? ''}`;
    if (signature !== previousLockSignature) sendLockState(state);
    previousLockSignature = signature;
  }, 1000);
  let previousLockSignature = `${lockState().owner ?? ''}:${lockState().expiresAt ?? ''}`;
  heartbeat.unref();
  lockPoll.unref();

  return {
    documentChanged: (document, clientId) => broadcast({ type: 'document', document, clientId }),
    close: () => {
      clearInterval(heartbeat);
      clearInterval(lockPoll);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
    },
  };
}

module.exports = { attachCollaboration };
