'use strict';

const dgram = require('node:dgram');
const net = require('node:net');
const { EventEmitter } = require('node:events');

const DIRECTIONS = ['up', 'down'];
const MAX_UDP_PAYLOAD = 65_507;
const DEFAULT_QUEUE_PACKETS = 2_048;
const DEFAULT_QUEUE_BYTES = 4 * 1024 * 1024;

function isLoopbackIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  return Number(address.split('.')[0]) === 127;
}

function profile(value = {}) {
  const delayMs = value.delayMs ?? 0;
  const lossRate = value.lossRate ?? 0;
  if (!Number.isFinite(delayMs) || delayMs < 0 || !Number.isInteger(delayMs)) {
    throw new TypeError('delayMs must be a non-negative integer');
  }
  if (!Number.isFinite(lossRate) || lossRate < 0 || lossRate > 1) {
    throw new TypeError('lossRate must be a number from 0 to 1');
  }
  return { delayMs, lossRate };
}

function mergeProfile(previous, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new TypeError('profile patch must be an object');
  }
  const keys = Object.keys(patch);
  if (!keys.length) throw new TypeError('profile patch must include delayMs and/or lossRate');
  if (keys.some((key) => key !== 'delayMs' && key !== 'lossRate')) {
    throw new TypeError('profile patch only supports delayMs and lossRate');
  }
  if (Object.hasOwn(patch, 'delayMs')
    && (!Number.isInteger(patch.delayMs) || patch.delayMs < 0)) {
    throw new TypeError('delayMs must be a non-negative integer');
  }
  if (Object.hasOwn(patch, 'lossRate')
    && (!Number.isFinite(patch.lossRate) || patch.lossRate < 0 || patch.lossRate > 1)) {
    throw new TypeError('lossRate must be a number from 0 to 1');
  }
  return { ...previous, ...patch };
}

function seedFor(seed, id, direction) {
  let h = (Number(seed) >>> 0) ^ 0x9e3779b9;
  for (const ch of `${id}:${direction}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 0x45d9f3b) >>> 0;
    h ^= h >>> 16;
  }
  return h || 0x6d2b79f5;
}

function makeRandom(seed, id, direction) {
  let state = seedFor(seed, id, direction);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function emptyCounters() {
  return {
    receivedPackets: 0,
    forwardedPackets: 0,
    droppedLoss: 0,
    droppedQueue: 0,
    droppedNoClient: 0,
    droppedClientMismatch: 0,
    droppedUnexpectedSource: 0,
    sendErrors: 0,
    bytesReceived: 0,
    bytesForwarded: 0,
    queuePackets: 0,
    queueBytes: 0,
  };
}

function waitListening(socket, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      socket.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      socket.off('error', onError);
      resolve(socket.address());
    };
    socket.once('error', onError);
    socket.once('listening', onListening);
    socket.bind(port, host);
  });
}

function closeSocket(socket) {
  return new Promise((resolve) => {
    let address = null;
    try { address = socket?.address?.() ?? null; } catch { /* An unbound socket has no address. */ }
    if (!socket || !address?.port) {
      try { socket?.close(); } catch { /* An unbound socket is already closed. */ }
      resolve();
      return;
    }
    socket.once('close', resolve);
    try {
      socket.close();
    } catch {
      socket.off('close', resolve);
      resolve();
    }
  });
}

/**
 * Loopback UDP impairment fixture for one ENet server and multiple local clients.
 * Each client gets a dedicated front socket and a dedicated backend socket so the
 * ENet server sees a unique source endpoint for each peer.
 */
class NetEmulationProxy extends EventEmitter {
  constructor(options = {}) {
    super();
    const { backendHost, backendPort } = options;
    if (typeof backendHost !== 'string' || !isLoopbackIPv4(backendHost)) {
      throw new TypeError('backendHost must be a loopback IPv4 address');
    }
    if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65_535) {
      throw new TypeError('backendPort must be an integer from 1 to 65535');
    }
    const bindHost = options.bindHost ?? '127.0.0.1';
    if (!isLoopbackIPv4(bindHost)) {
      throw new TypeError('bindHost must be a loopback IPv4 address');
    }
    const maxQueuePackets = options.maxQueuePackets ?? DEFAULT_QUEUE_PACKETS;
    const maxQueueBytes = options.maxQueueBytes ?? DEFAULT_QUEUE_BYTES;
    const maxClients = options.maxClients ?? 8;
    if (!Number.isInteger(maxQueuePackets) || maxQueuePackets < 1) {
      throw new TypeError('maxQueuePackets must be a positive integer');
    }
    if (!Number.isInteger(maxQueueBytes) || maxQueueBytes < 1) {
      throw new TypeError('maxQueueBytes must be a positive integer');
    }
    if (!Number.isInteger(maxClients) || maxClients < 1) throw new TypeError('maxClients must be a positive integer');
    const seed = options.seed ?? 1;
    if (!Number.isInteger(seed)) throw new TypeError('seed must be an integer');

    const common = profile({ delayMs: options.delayMs, lossRate: options.lossRate });
    const configured = options.profiles ?? {};
    this.backendHost = backendHost;
    this.backendPort = backendPort;
    this.bindHost = bindHost;
    this.seed = seed >>> 0;
    this.maxQueuePackets = maxQueuePackets;
    this.maxQueueBytes = maxQueueBytes;
    this.maxClients = maxClients;
    this._defaults = {
      up: profile(configured.up ?? common),
      down: profile(configured.down ?? common),
    };
    this._pairs = new Map();
    this._state = 'created';
    this._revision = 0;
    this._aggregate = { up: emptyCounters(), down: emptyCounters() };
    this._closePromise = null;
  }

  async start() {
    if (this._state !== 'created') throw new Error(`Cannot start proxy in state ${this._state}`);
    this._state = 'started';
    this.emit('started', { backendHost: this.backendHost, backendPort: this.backendPort });
    return this;
  }

  async addClient(options = {}) {
    if (this._state !== 'started') throw new Error('Call start() before addClient()');
    const id = String(options.id ?? '');
    if (!id || this._pairs.has(id)) throw new TypeError('client id must be non-empty and unique');
    if (this._pairs.size >= this.maxClients) throw new Error(`Maximum proxy clients reached (${this.maxClients})`);
    if (/[\r\n\0]/.test(id)) throw new TypeError('client id contains invalid characters');
    const listenHost = options.listenHost ?? this.bindHost;
    if (!isLoopbackIPv4(listenHost)) {
      throw new TypeError('listenHost must be a loopback IPv4 address');
    }
    const listenPort = options.listenPort ?? 0;
    if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65_535) {
      throw new TypeError('listenPort must be an integer from 0 to 65535');
    }

    const pair = {
      id,
      front: dgram.createSocket('udp4'),
      back: dgram.createSocket('udp4'),
      client: null,
      frontAddress: null,
      profile: { up: { ...this._defaults.up }, down: { ...this._defaults.down } },
      random: { up: makeRandom(this.seed, id, 'up'), down: makeRandom(this.seed, id, 'down') },
      counters: { up: emptyCounters(), down: emptyCounters() },
      queues: { up: [], down: [] },
      timers: { up: null, down: null },
      active: true,
    };
    this._pairs.set(id, pair);
    pair.front.on('message', (data, remote) => this._onFront(pair, data, remote));
    pair.back.on('message', (data, remote) => this._onBack(pair, data, remote));
    pair.front.on('error', (error) => this.emit('socket-error', { clientId: id, socket: 'front', error }));
    pair.back.on('error', (error) => this.emit('socket-error', { clientId: id, socket: 'back', error }));

    try {
      pair.frontAddress = await waitListening(pair.front, listenPort, listenHost);
      await waitListening(pair.back, 0, this.bindHost);
    } catch (error) {
      this._pairs.delete(id);
      await Promise.all([closeSocket(pair.front), closeSocket(pair.back)]);
      throw error;
    }
    const result = { id, host: pair.frontAddress.address, port: pair.frontAddress.port };
    this.emit('client-added', result);
    return result;
  }

  _onFront(pair, data, remote) {
    if (!pair.active) return;
    const stats = pair.counters.up;
    const total = this._aggregate.up;
    stats.receivedPackets += 1;
    stats.bytesReceived += data.length;
    total.receivedPackets += 1;
    total.bytesReceived += data.length;
    if (!pair.client) pair.client = { address: remote.address, port: remote.port };
    if (pair.client.address !== remote.address || pair.client.port !== remote.port) {
      stats.droppedClientMismatch += 1;
      total.droppedClientMismatch += 1;
      return;
    }
    this._enqueue(pair, 'up', data, this.backendHost, this.backendPort);
  }

  _onBack(pair, data, remote) {
    if (!pair.active) return;
    const stats = pair.counters.down;
    const total = this._aggregate.down;
    stats.receivedPackets += 1;
    stats.bytesReceived += data.length;
    total.receivedPackets += 1;
    total.bytesReceived += data.length;
    if (remote.address !== this.backendHost || remote.port !== this.backendPort) {
      stats.droppedUnexpectedSource += 1;
      total.droppedUnexpectedSource += 1;
      return;
    }
    if (!pair.client) {
      stats.droppedNoClient += 1;
      total.droppedNoClient += 1;
      return;
    }
    this._enqueue(pair, 'down', data, pair.client.address, pair.client.port);
  }

  _enqueue(pair, direction, data, address, port) {
    const stats = pair.counters[direction];
    const total = this._aggregate[direction];
    if (pair.random[direction]() < pair.profile[direction].lossRate) {
      stats.droppedLoss += 1;
      total.droppedLoss += 1;
      return;
    }
    const queue = pair.queues[direction];
    if (queue.length >= this.maxQueuePackets || stats.queueBytes + data.length > this.maxQueueBytes) {
      stats.droppedQueue += 1;
      total.droppedQueue += 1;
      return;
    }
    const packet = Buffer.from(data);
    queue.push({ packet, address, port, dueAt: Date.now() + pair.profile[direction].delayMs });
    stats.queuePackets += 1;
    stats.queueBytes += packet.length;
    total.queuePackets += 1;
    total.queueBytes += packet.length;
    this._schedule(pair, direction);
  }

  _schedule(pair, direction) {
    if (pair.timers[direction] !== null || !pair.queues[direction].length) return;
    const wait = Math.max(0, pair.queues[direction][0].dueAt - Date.now());
    const timer = setTimeout(() => {
      pair.timers[direction] = null;
      this._flush(pair, direction);
    }, wait);
    timer.unref?.();
    pair.timers[direction] = timer;
  }

  _flush(pair, direction) {
    if (!pair.active) return;
    const queue = pair.queues[direction];
    const socket = direction === 'up' ? pair.back : pair.front;
    const stats = pair.counters[direction];
    const total = this._aggregate[direction];
    const now = Date.now();
    while (queue.length && queue[0].dueAt <= now) {
      const item = queue.shift();
      stats.queuePackets -= 1;
      stats.queueBytes -= item.packet.length;
      total.queuePackets -= 1;
      total.queueBytes -= item.packet.length;
      socket.send(item.packet, item.port, item.address, (error) => {
        if (error) {
          stats.sendErrors += 1;
          total.sendErrors += 1;
          return;
        }
        stats.forwardedPackets += 1;
        stats.bytesForwarded += item.packet.length;
        total.forwardedPackets += 1;
        total.bytesForwarded += item.packet.length;
        if (this.listenerCount('packet-forwarded')) {
          this.emit('packet-forwarded', { clientId: pair.id, direction, bytes: item.packet.length });
        }
      });
    }
    this._schedule(pair, direction);
  }

  /** Applies a profile to up/down/both, to one client or to all current/future clients. */
  reconfigure(options, direction = 'both', clientId = null) {
    if (this._state !== 'started') throw new Error(`Cannot reconfigure proxy in state ${this._state}`);
    if (!['up', 'down', 'both'].includes(direction)) throw new TypeError('direction must be up, down, or both');
    if (clientId !== null && !this._pairs.has(String(clientId))) throw new Error(`Unknown client: ${clientId}`);
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('profile patch must be an object');
    }
    const patch = {};
    if (Object.hasOwn(options, 'delayMs')) patch.delayMs = options.delayMs;
    if (Object.hasOwn(options, 'lossRate')) patch.lossRate = options.lossRate;
    if (!Object.keys(patch).length) throw new TypeError('profile patch must include delayMs and/or lossRate');
    const selected = direction === 'both' ? DIRECTIONS : [direction];
    if (clientId === null) {
      for (const item of selected) this._defaults[item] = mergeProfile(this._defaults[item], patch);
    }
    const pairs = clientId === null ? [...this._pairs.values()] : [this._pairs.get(String(clientId))];
    const now = Date.now();
    for (const pair of pairs) {
      if (!pair.active) continue;
      for (const item of selected) {
        const oldDelay = pair.profile[item].delayMs;
        pair.profile[item] = mergeProfile(pair.profile[item], patch);
        const queue = pair.queues[item];
        if (queue.length && patch.delayMs !== undefined && pair.profile[item].delayMs !== oldDelay) {
          for (const queued of queue) queued.dueAt = now + pair.profile[item].delayMs;
          if (pair.timers[item] !== null) clearTimeout(pair.timers[item]);
          pair.timers[item] = null;
          this._schedule(pair, item);
        }
      }
    }
    this._revision += 1;
    const event = {
      direction,
      clientId: clientId === null ? null : String(clientId),
      revision: this._revision,
      profile: { ...patch },
    };
    this.emit('reconfigured', event);
    return event;
  }

  metrics() {
    const clients = {};
    for (const [id, pair] of this._pairs) {
      clients[id] = {
        active: pair.active,
        host: pair.frontAddress?.address ?? null,
        port: pair.frontAddress?.port ?? null,
        client: pair.client ? { ...pair.client } : null,
        profiles: { up: { ...pair.profile.up }, down: { ...pair.profile.down } },
        directions: {
          up: { ...pair.counters.up },
          down: { ...pair.counters.down },
        },
      };
    }
    return {
      state: this._state,
      revision: this._revision,
      seed: this.seed,
      backend: { host: this.backendHost, port: this.backendPort },
      activeClients: [...this._pairs.values()].filter((pair) => pair.active).length,
      maxClients: this.maxClients,
      directions: { up: { ...this._aggregate.up }, down: { ...this._aggregate.down } },
      clients,
    };
  }

  async close() {
    if (this._closePromise) return this._closePromise;
    if (this._state === 'closed') return;
    this._state = 'closing';
    this._closePromise = (async () => {
      const closes = [];
      for (const pair of this._pairs.values()) {
        pair.active = false;
        for (const direction of DIRECTIONS) {
          if (pair.timers[direction] !== null) clearTimeout(pair.timers[direction]);
          pair.timers[direction] = null;
          const count = pair.queues[direction].length;
          const bytes = pair.queues[direction].reduce((sum, item) => sum + item.packet.length, 0);
          pair.queues[direction].length = 0;
          pair.counters[direction].queuePackets = 0;
          pair.counters[direction].queueBytes = 0;
          this._aggregate[direction].queuePackets -= count;
          this._aggregate[direction].queueBytes -= bytes;
        }
        closes.push(closeSocket(pair.front), closeSocket(pair.back));
      }
      await Promise.all(closes);
      this._state = 'closed';
      this.emit('closed', this.metrics());
    })();
    return this._closePromise;
  }
}

module.exports = { NetEmulationProxy };
