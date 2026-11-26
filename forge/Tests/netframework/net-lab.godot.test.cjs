'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { setTimeout: sleep } = require('node:timers/promises');
const { resolveGodot } = require('../../Tools/dedicated-server/run-ds-2clients.cjs');

test('live ENet match applies per-client loss, recovers, and records actual RPC and transport traffic', {
  skip: !resolveGodot().executable && 'Godot not installed', timeout: 60000,
}, async () => {
  const child = spawn(process.execPath, [path.resolve(__dirname, '../../Tools/dedicated-server/run-net-lab.cjs'), '--seed', '17'],
    { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  child.stdin.on('error', (err) => { if (err.code !== 'EPIPE') throw err; });
  const closed = once(child, 'close');
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  async function until(select) {
    for (;;) {
      const { value, done } = await lines.next();
      assert.ok(!done, 'runner exited before expected reply');
      const match = select(value);
      if (match) return match;
    }
  }
  const send = (cmd) => child.stdin.write(cmd + '\n');
  async function status() {
    send('NetEmulation.Status');
    return until((s) => s.startsWith('{"state"') && JSON.parse(s));
  }
  try {
    const dir = await until((s) => s.startsWith('Evidence: ') && s.slice(10));
    await until((s) => s === 'NET_LAB_READY');
    send('a NetEmulation.PktLag 60');
    send('a NetEmulation.PktLoss 100');
    const start = await status();
    assert.deepEqual(start.clients.a.profiles.up, { delayMs: 60, lossRate: 1 });
    assert.equal(start.clients.b.profiles.up.lossRate, 0);
    await sleep(900);
    const impaired = await status();
    assert.ok(impaired.clients.a.directions.up.droppedLoss > start.clients.a.directions.up.droppedLoss);
    assert.ok(impaired.clients.b.directions.up.forwardedPackets > start.clients.b.directions.up.forwardedPackets);
    send('a NetEmulation.Off');
    send('server NetEmulation.PktLag 30');
    const recovered = await status();
    assert.equal(recovered.clients.a.profiles.up.delayMs, 0);
    assert.equal(recovered.clients.a.profiles.up.lossRate, 0);
    assert.equal(recovered.clients.a.profiles.down.delayMs, 30);
    send('NetEmulation.Off');
    await sleep(1200);
    const end = await status();
    assert.ok(end.clients.a.directions.up.forwardedPackets > impaired.clients.a.directions.up.forwardedPackets);
    send('server stat net');
    const report = await until((line) => line.includes('server_submit_input: sent') && line.includes('received') && line);
    send('quit');
    assert.equal((await closed)[0], 0);
    const summary = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8'));
    if (summary.profiles.server.rpcSource === 'engine') {
      assert.match(report, /RPC bytes: TX \d+ B .*RX [1-9]\d* B /);
    } else {
      assert.equal(summary.profiles.server.rpcSource, 'wrapper_fallback');
      assert.doesNotMatch(report, /RPC bytes/);
    }
    const samples = fs.readFileSync(path.join(dir, 'profile.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    for (const id of ['server', 'a', 'b']) {
      const series = samples.filter((s) => s.process === id);
      assert.ok(series.length >= 2, 'time series missing for ' + id);
      const profile = summary.profiles[id];
      assert.ok(profile.enet.sentBytes.total > 0 && profile.enet.receivedBytes.total > 0);
      assert.ok(profile.enet.sentPackets.total > 0 && profile.enet.receivedPackets.total > 0);
      assert.equal(series.reduce((sum, s) => sum + s.enet.sentBytes.delta, 0), profile.enet.sentBytes.total);
      const rpc = profile.rpc;
      assert.ok(rpc.server_submit_input[id === 'server' ? 'received' : 'sent'].total > 0);
      assert.ok(rpc.client_input_ack[id === 'server' ? 'sent' : 'received'].total > 0);
      if (profile.rpcSource === 'engine') {
        const direction = id === 'server' ? 'received_bytes' : 'sent_bytes';
        const total = series.reduce((sum, s) => sum + (s.rpc.server_submit_input?.[direction]?.delta ?? 0), 0);
        assert.ok(total > 0);
        assert.equal(total, rpc.server_submit_input[direction].total);
      }
    }
  } finally {
    if (child.exitCode === null && !child.signalCode) {
      if (!child.stdin.destroyed) child.stdin.end('quit\n');
      await closed;
    }
  }
});
