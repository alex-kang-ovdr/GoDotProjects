'use strict';
// Deterministic loopback coverage for bidirectional UDP impairment and lifecycle cleanup.
const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { once } = require('node:events');
const { performance } = require('node:perf_hooks');
const { NetEmulationProxy } = require('../../Tools/dedicated-server/net-emulation-proxy.cjs');

const LOOPBACK = '127.0.0.1';

function bindUdp(socket, port = 0) {
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
    socket.bind(port, LOOPBACK);
  });
}

function closeUdp(socket) {
  if (!socket || socket.closed) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', resolve);
    try { socket.close(); } catch { resolve(); }
  });
}

function capture(socket, onMessage) {
  const records = [];
  const waiters = [];
  socket.on('message', (buffer, remote) => {
    let payload;
    try { payload = JSON.parse(buffer.toString('utf8')); } catch { payload = null; }
    const record = { buffer: Buffer.from(buffer), payload, remote, at: performance.now() };
    records.push(record);
    onMessage?.(record);
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].predicate(record)) {
        clearTimeout(waiters[i].timer);
        waiters[i].resolve(record);
        waiters.splice(i, 1);
      }
    }
  });
  return {
    records,
    waitFor(predicate, label, timeoutMs = 2000) {
      const found = records.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve, timer: null };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for ${label}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, label, timeoutMs = 2000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) return;
    await sleep(5);
  }
  assert.fail(`Timed out waiting for ${label}`);
}

function seqRecord(records, seq) {
  return records.find((record) => record.payload?.seq === seq);
}

test('UDP proxy applies bidirectional delay/loss, restores zero, and cleans up on close', {
  timeout: 12000,
}, async (t) => {
  const backend = dgram.createSocket('udp4');
  const backendAddress = await bindUdp(backend);
  const backendCapture = capture(backend, (record) => {
    backend.send(record.buffer, record.remote.port, record.remote.address);
  });
  const client = dgram.createSocket('udp4');
  await bindUdp(client);
  const clientCapture = capture(client);
  const proxy = new NetEmulationProxy({
    backendHost: LOOPBACK,
    backendPort: backendAddress.port,
    bindHost: LOOPBACK,
    seed: 0x1234,
    maxQueuePackets: 32,
    maxQueueBytes: 16_384,
    profiles: {
      up: { delayMs: 80, lossRate: 0 },
      down: { delayMs: 120, lossRate: 0 },
    },
  });
  t.after(async () => {
    await proxy.close();
    await Promise.all([closeUdp(client), closeUdp(backend)]);
  });

  await proxy.start();
  const endpoint = await proxy.addClient({ id: 'client-a' });
  assert.equal(endpoint.host, LOOPBACK);
  assert.ok(endpoint.port > 0);
  assert.equal(proxy.metrics().state, 'started');
  assert.equal(proxy.metrics().activeClients, 1);

  const send = (seq) => new Promise((resolve, reject) => {
    const sentAt = performance.now();
    client.send(Buffer.from(JSON.stringify({ seq })), endpoint.port, endpoint.host, (error) => {
      if (error) reject(error);
      else resolve(sentAt);
    });
  });

  // The up and down delays are measured independently at the backend and client endpoints.
  const sentAt = await send('delay-both');
  const backendPacket = await backendCapture.waitFor((r) => r.payload?.seq === 'delay-both', 'up delayed packet');
  const clientReply = await clientCapture.waitFor((r) => r.payload?.seq === 'delay-both', 'down delayed reply');
  assert.ok(backendPacket.at - sentAt >= 55, `up delay too short: ${(backendPacket.at - sentAt).toFixed(1)}ms`);
  assert.ok(clientReply.at - backendPacket.at >= 85, `down delay too short: ${(clientReply.at - backendPacket.at).toFixed(1)}ms`);
  let metrics = proxy.metrics();
  assert.equal(metrics.directions.up.forwardedPackets, 1);
  assert.equal(metrics.directions.down.forwardedPackets, 1);
  assert.ok(metrics.directions.up.bytesForwarded > 0);
  assert.ok(metrics.directions.down.bytesForwarded > 0);

  // 100% loss is deterministic for either direction and proves their counters are separate.
  const upDroppedBefore = metrics.clients['client-a'].directions.up.droppedLoss;
  proxy.reconfigure({ delayMs: 0, lossRate: 1 }, 'up', 'client-a');
  await send('loss-up');
  await waitUntil(() => proxy.metrics().clients['client-a'].directions.up.droppedLoss > upDroppedBefore, 'up loss counter');
  await sleep(30);
  assert.equal(seqRecord(backendCapture.records, 'loss-up'), undefined, 'up-loss datagram reached backend');

  proxy.reconfigure({ delayMs: 0, lossRate: 0 }, 'up', 'client-a');
  const downDroppedBefore = proxy.metrics().clients['client-a'].directions.down.droppedLoss;
  proxy.reconfigure({ delayMs: 0, lossRate: 1 }, 'down', 'client-a');
  await send('loss-down');
  await backendCapture.waitFor((r) => r.payload?.seq === 'loss-down', 'down-loss backend receipt');
  await waitUntil(() => proxy.metrics().clients['client-a'].directions.down.droppedLoss > downDroppedBefore, 'down loss counter');
  await sleep(30);
  assert.equal(seqRecord(clientCapture.records, 'loss-down'), undefined, 'down-loss datagram reached client');

  // Queue a delayed packet, then switch both directions to zero without restarting the proxy.
  proxy.reconfigure({ lossRate: 0 }, 'down', 'client-a');
  proxy.reconfigure({ delayMs: 350 }, 'both');
  assert.deepEqual(proxy.metrics().clients['client-a'].profiles, {
    up: { delayMs: 350, lossRate: 0 },
    down: { delayMs: 350, lossRate: 0 },
  }, 'partial delay patch must preserve each direction loss profile');
  const restoreSentAt = await send('restore-zero');
  await waitUntil(() => proxy.metrics().clients['client-a'].directions.up.queuePackets > 0, 'up queue before restore');
  proxy.reconfigure({ lossRate: 0 }, 'both');
  await sleep(20);
  assert.ok(proxy.metrics().clients['client-a'].directions.up.queuePackets > 0,
    'loss-only patch must preserve the queued delay');
  const restoreAt = performance.now();
  const restoreEvent = proxy.reconfigure({ delayMs: 0 }, 'both');
  assert.equal(restoreEvent.direction, 'both');
  assert.equal(restoreEvent.clientId, null);
  assert.deepEqual(restoreEvent.profile, { delayMs: 0 });
  metrics = proxy.metrics();
  assert.deepEqual(metrics.clients['client-a'].profiles, {
    up: { delayMs: 0, lossRate: 0 },
    down: { delayMs: 0, lossRate: 0 },
  });
  const restoredBackendPacket = await backendCapture.waitFor((r) => r.payload?.seq === 'restore-zero', 'restored packet at backend');
  const restoredClientReply = await clientCapture.waitFor((r) => r.payload?.seq === 'restore-zero', 'restored reply at client');
  assert.ok(restoredBackendPacket.at - restoreAt < 200, 'queued up packet retained its old delay after zero restore');
  assert.ok(restoredClientReply.at - restoredBackendPacket.at < 200, 'down path retained its old delay after zero restore');
  assert.ok(restoredBackendPacket.at >= restoreSentAt);
  await waitUntil(() => {
    const current = proxy.metrics().directions;
    return current.up.queuePackets === 0 && current.down.queuePackets === 0;
  }, 'restored queues to drain');

  // Closing with queued work cancels timers, clears counters, closes sockets, and prevents late forwarding.
  proxy.reconfigure({ delayMs: 1000, lossRate: 0 }, 'both');
  const shutdownSeq = 'close-clears-queue';
  await send(shutdownSeq);
  await waitUntil(() => proxy.metrics().clients['client-a'].directions.up.queuePackets > 0, 'queued packet before close');
  const backendCountBeforeClose = backendCapture.records.length;
  const closedEventPromise = once(proxy, 'closed');
  await proxy.close();
  const [closedMetrics] = await closedEventPromise;
  assert.equal(closedMetrics.state, 'closed');
  assert.equal(closedMetrics.activeClients, 0);
  assert.equal(closedMetrics.directions.up.queuePackets, 0);
  assert.equal(closedMetrics.directions.up.queueBytes, 0);
  assert.equal(closedMetrics.directions.down.queuePackets, 0);
  assert.equal(closedMetrics.directions.down.queueBytes, 0);
  assert.equal(closedMetrics.clients['client-a'].active, false);

  const rebound = dgram.createSocket('udp4');
  const reboundAddress = await bindUdp(rebound, endpoint.port);
  assert.equal(reboundAddress.port, endpoint.port, 'proxy front socket was not released');
  await closeUdp(rebound);
  await sleep(1050);
  assert.equal(backendCapture.records.length, backendCountBeforeClose, 'queued packet forwarded after proxy close');
});
