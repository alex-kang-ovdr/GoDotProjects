'use strict';

// Type 1 Data Plane SSOT: 100% Game-Agnostic Generic Spatial Interest Relay Room.
// Knows NOTHING about any specific game's events, physics, entities, or screen coordinates.
// Operates strictly on N-dimensional position vectors (1D/2D/3D), optional velocity vectors,
// and opaque game payloads forwarded in batched frames to nearby peers within AOI radius.
const crypto = require('node:crypto');
const { normalizeRelayConfig } = require('./publish-contract.cjs');

const VALID_PLATFORMS = new Set(['web', 'android', 'ios', 'desktop']);
const MAX_OUTBOUND_QUEUE = 256;
const MAX_EXTRAPOLATION_SEC = 10;

function cleanName(raw, fallback) {
  const text = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 24);
  return text || fallback;
}

function cleanPlatform(raw) {
  const p = String(raw || '').trim().toLowerCase();
  return VALID_PLATFORMS.has(p) ? p : 'web';
}

function normalizeVector(raw, dims, fallback, minVal = -1e8, maxVal = 1e8) {
  const out = new Array(dims);
  for (let i = 0; i < dims; i += 1) {
    const v = Array.isArray(raw) ? Number(raw[i]) : NaN;
    if (Number.isFinite(v)) {
      out[i] = Math.max(minVal, Math.min(maxVal, v));
    } else {
      out[i] = Array.isArray(fallback) && Number.isFinite(fallback[i]) ? fallback[i] : 0;
    }
  }
  return out;
}

function roundVector(vec) {
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i += 1) {
    out[i] = Math.round(vec[i] * 100) / 100;
  }
  return out;
}

function distanceSquared(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function flushGenericSocketQueue(ws, isOpenFn, maxBufferedBytes = 1000000) {
  const isOpen = typeof isOpenFn === 'function' ? isOpenFn(ws) : Boolean(ws && ws.readyState === 1);
  if (!isOpen) {
    if (ws) {
      if (ws._relayBatch) ws._relayBatch.length = 0;
      if (ws._relayRemoved) ws._relayRemoved.length = 0;
      ws._relayPresence = null;
    }
    return;
  }
  const hasBatch = ws._relayBatch && ws._relayBatch.length > 0;
  const hasRemoved = ws._relayRemoved && ws._relayRemoved.length > 0;
  const hasPresence = ws._relayPresence !== null && ws._relayPresence !== undefined;
  if (!hasBatch && !hasRemoved && !hasPresence) return;

  if ((ws.bufferedAmount || 0) < maxBufferedBytes) {
    const parts = [];
    if (hasBatch) parts.push('"b":[' + ws._relayBatch.join(',') + ']');
    if (hasRemoved) parts.push('"r":[' + ws._relayRemoved.join(',') + ']');
    if (hasPresence) parts.push('"o":[' + ws._relayPresence[0] + ',' + ws._relayPresence[1] + ']');
    ws.send('{' + parts.join(',') + '}');
  }
  if (ws._relayBatch) ws._relayBatch.length = 0;
  if (ws._relayRemoved) ws._relayRemoved.length = 0;
  ws._relayPresence = null;
}

class GenericSpatialRoom {
  constructor(id, scope = {}, rawConfig = {}, now = Date.now) {
    this.id = id;
    this.gameId = String(scope.gameId || '');
    this.partyCode = scope.partyCode ? String(scope.partyCode) : null;
    this.now = now;
    this.config = normalizeRelayConfig(rawConfig);
    const defaultSeed = scope.defaultSeed ?? (10000 + (parseInt(String(id).slice(0, 6), 16) % 900000));
    this.roomSeed = this.config.sharedRoomSeed
      ? Math.max(1, Math.min(999999, Math.floor(Number(rawConfig.roomSeed ?? defaultSeed) || 10000)))
      : 0;

    this.players = new Map();
    this.dirtyPresence = new Set();
    this.nextShortId = 1;
    this.nextPlayerNum = 1;
    this.createdAt = now();
    this.stats = {
      eventsReceived: 0,
      multicastsSent: 0,
      filteredOut: 0,
      joins: 0,
      leaves: 0,
    };
  }

  estimatePosition(peer, nowMs = this.now()) {
    if (!this.config.extrapolateVelocity || !peer.moving) {
      return peer.pos;
    }
    const elapsedSec = Math.max(0, Math.min(MAX_EXTRAPOLATION_SEC, (nowMs - peer.stateAt) / 1000));
    if (elapsedSec <= 0) return peer.pos;
    const dims = this.config.dimensions;
    const est = new Array(dims);
    for (let i = 0; i < dims; i += 1) {
      est[i] = peer.pos[i] + peer.vel[i] * elapsedSec;
    }
    return est;
  }

  isWithinAoi(posA, posB, wasNearby) {
    if (this.config.aoiRadius <= 0) return true; // 0 = full-room broadcast
    const limit = this.config.aoiRadius + (wasNearby ? this.config.aoiHysteresis : 0);
    return distanceSquared(posA, posB) <= limit * limit;
  }

  join({ sub = '', name = '', platform = 'web', pos = null, vel = null, moving = false, opaqueState = null, sendImmediate = null, queueEvent = null, queueRemoved = null, setPresence = null } = {}) {
    if (this.players.size >= this.config.maxPlayersPerChannel) {
      throw new Error('CHANNEL_FULL');
    }
    const id = 'p-' + crypto.randomBytes(6).toString('hex');
    const shortId = this.nextShortId++;
    const safeName = cleanName(name, `Player ${this.nextPlayerNum++}`);
    const safePlatform = cleanPlatform(platform);
    const nowMs = this.now();
    const dims = this.config.dimensions;
    const peer = {
      id,
      shortId,
      sub: String(sub || ''),
      name: safeName,
      platform: safePlatform,
      pos: normalizeVector(pos, dims, null),
      vel: normalizeVector(vel, dims, null, -this.config.maxVelocity, this.config.maxVelocity),
      moving: Boolean(moving),
      lastOpaqueState: opaqueState !== undefined ? opaqueState : null,
      seq: 0,
      nearby: new Set(),
      joinedAt: nowMs,
      stateAt: nowMs,
      sendImmediate,
      queueEvent,
      queueRemoved,
      setPresence,
    };

    this.players.set(id, peer);
    this.stats.joins += 1;

    const welcome = {
      t: 'welcome',
      protocol: 'playhub.relay.v1',
      roomId: this.id,
      gameId: this.gameId,
      ...(this.partyCode ? { partyCode: this.partyCode } : {}),
      peerId: id,
      shortId,
      name: safeName,
      platform: safePlatform,
      roomSeed: this.roomSeed,
      config: this.config,
      online: this.players.size,
    };
    if (typeof peer.sendImmediate === 'function') {
      peer.sendImmediate(welcome);
    }

    // Initial symmetric AOI discovery on join
    this._syncAoiForPeer(peer, opaqueState, nowMs, true);
    for (const other of this.players.values()) {
      this.dirtyPresence.add(other.id);
    }
    return { peer, welcome };
  }

  publish(peerId, frame = {}) {
    const peer = this.players.get(peerId);
    if (!peer) throw new Error('PEER_NOT_FOUND');

    const seq = Number(frame.seq || 0);
    if (Number.isFinite(seq) && seq > 0 && seq <= peer.seq) {
      return { ignored: true };
    }
    if (Number.isFinite(seq) && seq > 0) peer.seq = Math.floor(seq);

    const opaqueData = frame.d !== undefined ? frame.d : null;
    if (opaqueData !== null) {
      const serialized = JSON.stringify(opaqueData);
      if (Buffer.byteLength(serialized, 'utf8') > this.config.maxPayloadBytes) {
        throw new Error('PAYLOAD_TOO_LARGE');
      }
      // Cache snapshot when kind === 0 or no snapshot cached yet (enables drop-in AOI sync without knowing game schema)
      if (frame.k === 0 || peer.lastOpaqueState === null || frame.s !== undefined) {
        peer.lastOpaqueState = frame.s !== undefined ? frame.s : opaqueData;
      }
    }

    const nowMs = this.now();
    const dims = this.config.dimensions;
    if (Array.isArray(frame.p)) {
      peer.pos = normalizeVector(frame.p, dims, peer.pos);
    }
    if (Array.isArray(frame.v)) {
      peer.vel = normalizeVector(frame.v, dims, peer.vel, -this.config.maxVelocity, this.config.maxVelocity);
    }
    if (frame.m !== undefined) {
      peer.moving = Boolean(frame.m);
    }
    peer.stateAt = nowMs;
    this.stats.eventsReceived += 1;

    return this._syncAoiForPeer(peer, opaqueData, nowMs, false);
  }

  _encodeTuple(peer, pos, opaqueData, includeName) {
    const rounded = roundVector(pos);
    if (includeName) {
      return JSON.stringify([peer.shortId, rounded, opaqueData, peer.name]);
    }
    return JSON.stringify([peer.shortId, rounded, opaqueData]);
  }

  _syncAoiForPeer(sender, opaqueData, nowMs, isJoin) {
    const cap = this.config.maxVisiblePeers;
    const senderPos = sender.pos;
    const deliveredTo = [];
    const filteredIds = [];
    const enteredIds = [];
    const leftIds = [];

    let cachedRegular = null;
    let cachedWithName = null;

    for (const [otherId, other] of this.players.entries()) {
      if (otherId === sender.id) continue;
      const wasNearby = sender.nearby.has(otherId);
      const otherPos = this.estimatePosition(other, nowMs);
      const inRange = this.isWithinAoi(senderPos, otherPos, wasNearby);
      const nowNearby = inRange && (wasNearby || (sender.nearby.size < cap && other.nearby.size < cap));

      if (nowNearby) {
        if (!wasNearby) {
          sender.nearby.add(otherId);
          other.nearby.add(sender.id);
          enteredIds.push(otherId);
          this.dirtyPresence.add(sender.id);
          this.dirtyPresence.add(otherId);

          // Deliver sender -> other (with verified nickname on first AOI encounter)
          if (opaqueData !== null || isJoin) {
            if (cachedWithName === null) {
              cachedWithName = this._encodeTuple(sender, senderPos, opaqueData !== null ? opaqueData : sender.lastOpaqueState, true);
            }
            if (typeof other.queueEvent === 'function') other.queueEvent(cachedWithName);
            this.stats.multicastsSent += 1;
            deliveredTo.push(otherId);
          }
          // Symmetric drop-in: deliver other's latest cached opaque state -> sender
          if (typeof sender.queueEvent === 'function') {
            sender.queueEvent(this._encodeTuple(other, otherPos, other.lastOpaqueState, true));
            this.stats.multicastsSent += 1;
          }
        } else if (opaqueData !== null) {
          if (cachedRegular === null) {
            cachedRegular = this._encodeTuple(sender, senderPos, opaqueData, false);
          }
          if (typeof other.queueEvent === 'function') other.queueEvent(cachedRegular);
          this.stats.multicastsSent += 1;
          deliveredTo.push(otherId);
        }
      } else {
        filteredIds.push(otherId);
        this.stats.filteredOut += 1;
        if (wasNearby) {
          sender.nearby.delete(otherId);
          other.nearby.delete(sender.id);
          leftIds.push(otherId);
          this.dirtyPresence.add(sender.id);
          this.dirtyPresence.add(otherId);
          if (typeof other.queueRemoved === 'function') other.queueRemoved(sender.shortId);
          if (typeof sender.queueRemoved === 'function') sender.queueRemoved(other.shortId);
        }
      }
    }

    return { ignored: false, deliveredTo, filteredIds, enteredIds, leftIds };
  }

  leave(peerId) {
    const peer = this.players.get(peerId);
    if (!peer) return [];
    const notified = [];
    this.players.delete(peerId);
    this.dirtyPresence.delete(peerId);
    this.stats.leaves += 1;

    for (const otherId of peer.nearby) {
      const other = this.players.get(otherId);
      if (!other) continue;
      other.nearby.delete(peerId);
      if (typeof other.queueRemoved === 'function') {
        other.queueRemoved(peer.shortId);
      }
      notified.push(otherId);
    }
    for (const other of this.players.values()) {
      this.dirtyPresence.add(other.id);
    }
    return notified;
  }

  flushPresence() {
    if (this.dirtyPresence.size === 0) return;
    const online = this.players.size;
    for (const peerId of this.dirtyPresence) {
      const peer = this.players.get(peerId);
      if (!peer) continue;
      if (typeof peer.setPresence === 'function') {
        peer.setPresence(online, peer.nearby.size);
      }
    }
    this.dirtyPresence.clear();
  }

  metadata({ publicView = false } = {}) {
    const platforms = {};
    for (const p of this.players.values()) {
      platforms[p.platform] = (platforms[p.platform] || 0) + 1;
    }
    if (publicView && this.partyCode) {
      return {
        gameId: this.gameId,
        isParty: true,
        online: this.players.size,
        platforms,
      };
    }
    return {
      roomId: this.id,
      gameId: this.gameId,
      ...(!publicView && this.partyCode ? { partyCode: this.partyCode } : {}),
      roomSeed: this.roomSeed,
      dimensions: this.config.dimensions,
      aoiRadius: this.config.aoiRadius,
      online: this.players.size,
      platforms,
      stats: { ...this.stats },
    };
  }
}

module.exports = {
  MAX_OUTBOUND_QUEUE,
  GenericSpatialRoom,
  flushGenericSocketQueue,
};
