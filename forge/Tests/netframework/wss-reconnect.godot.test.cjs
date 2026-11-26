'use strict';
// WSS 전송(TLS 인증서 검증) 및 재접속(owner_epoch·슬롯 보존·하이재킹 차단) 멀티프로세스 통합 시험.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');

const runner = path.resolve(__dirname, '../../Tools/dedicated-server/run-ds-2clients.cjs');
const { resolveGodot, freeUdpPort, freeTcpPort } = require(runner);
const godot = resolveGodot();
const PROJECT = path.resolve(__dirname, '../../Godot');
const SCENE = 'res://addons/playforge_netframework/demo/spike.tscn';
const godotSkip = !godot.executable && `Godot not found (${godot.reason || godot.source})`;

function launch(name, userArgs) {
  const child = spawn(godot.executable, ['--headless', '--path', PROJECT, SCENE, '--', ...userArgs], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const events = [];
  const waiters = [];
  let output = '';
  for (const pipe of [child.stdout, child.stderr]) {
    readline.createInterface({ input: pipe }).on('line', (line) => {
      output += line + '\n';
      const idx = line.indexOf('NETEV ');
      if (idx < 0) return;
      try {
        const ev = JSON.parse(line.slice(idx + 6));
        events.push(ev);
        for (let i = waiters.length - 1; i >= 0; i -= 1) {
          if (waiters[i].pred(ev)) {
            clearTimeout(waiters[i].timer);
            waiters[i].resolve(ev);
            waiters.splice(i, 1);
          }
        }
      } catch { /* ignore */ }
    });
  }
  let exitedAt;
  let exitCode = null;
  const exited = new Promise((resolve) => {
    child.once('close', (code) => {
      exitCode = code;
      exitedAt = Date.now();
      waiters.splice(0).forEach((w) => {
        clearTimeout(w.timer);
        w.reject(new Error(`${name}: closed (${code}) before ${w.label}\n${output}`));
      });
      resolve(code);
    });
  });
  return {
    events,
    exited,
    get output() { return output; },
    get exitCode() { return exitCode; },
    first(evName) { return events.find((e) => e.ev === evName); },
    ev(evName) { return events.filter((e) => e.ev === evName); },
    waitFor(pred, timeoutMs, label) {
      const hit = events.find(pred);
      if (hit) return Promise.resolve(hit);
      if (exitedAt !== undefined) return Promise.reject(new Error(`${name}: already closed before ${label}\n${output}`));
      return new Promise((resolve, reject) => {
        const w = { pred, resolve, reject, label, timer: null };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`${name}: timeout waiting for ${label}\n${output}`));
        }, timeoutMs);
        waiters.push(w);
      });
    },
    kill() { if (exitedAt === undefined) child.kill(); },
  };
}

test('Godot DS + 2 clients over verified WSS TLS: convergence, probes, late join, drain', {
  skip: godotSkip,
  timeout: 120000,
}, () => {
  const r = spawnSync(process.execPath, [runner, '--transport=wss', '--json'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 110000,
  });
  assert.equal(r.error, undefined, r.error && r.error.message);
  const summary = JSON.parse(r.stdout);
  assert.equal(r.status, 0, `WSS DS spike failed: ${JSON.stringify(summary.checks.filter((c) => !c.ok))}`);
  assert.equal(summary.measurements.transport, 'wss');
  assert.equal(summary.measurements.transportCaps.encrypted, true);
  assert.equal(summary.measurements.transportCaps.tlsVerified, true);
  assert.equal(summary.measurements.transportCaps.unreliableNative, false);
});

test('WSS client fails fast without explicit TLS trust root (no client_unsafe fallback)', {
  skip: godotSkip,
  timeout: 30000,
}, async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-wss-noca-'));
  const ticketPath = path.join(runDir, 'dummy.ticket');
  fs.writeFileSync(ticketPath, 'dummy.ticket');
  const port = await freeTcpPort();
  try {
    const cli = launch('wss-noca', [
      '--netmode=client', '--transport=wss', `--port=${port}`, '--bot=a', `--ticket=${ticketPath}`, '--max-seconds=5',
    ]);
    const code = await cli.exited;
    assert.equal(code, 2, `WSS without --tls-ca must fail with code 2: ${cli.output}`);
    const fatal = cli.first('fatal');
    assert.ok(fatal && fatal.reason === 'tls_ca_required', `expected tls_ca_required: ${cli.output}`);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('Reconnect preserves slot/Pawn/health, bumps owner_epoch, blocks hijacking and stale-epoch RPCs', {
  skip: godotSkip,
  timeout: 60000,
}, async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-reconnect-'));
  const controlDir = path.join(runDir, 'control');
  fs.mkdirSync(controlDir, { recursive: true });
  const port = await freeUdpPort();
  const settleFile = path.join(controlDir, 'settle');
  const drainFile = path.join(controlDir, 'drain');
  const leaveFile = path.join(controlDir, 'leave');
  const procs = [];
  const start = (name, args) => { const p = launch(name, args); procs.push(p); return p; };
  try {
    const server = start('server', [
      '--netmode=dedicated-server', `--port=${port}`, `--run-dir=${runDir}`,
      '--play-ticks=80', `--settle-file=${settleFile}`, '--reconnect-grace=10', '--max-seconds=35',
    ]);
    await server.waitFor((e) => e.ev === 'tickets_issued', 15000, 'tickets_issued');
    const ticket = (u) => path.join(runDir, 'tickets', `${u}.ticket`);

    const cliA1 = start('client-a-initial', [
      '--netmode=client', `--port=${port}`, '--bot=a', `--ticket=${ticket('bot-a')}`,
      '--disconnect-after-ticks=35', '--max-seconds=30',
    ]);
    const cliB = start('client-b', [
      '--netmode=client', `--port=${port}`, '--bot=b', `--ticket=${ticket('bot-b')}`,
      `--leave-file=${leaveFile}`, '--max-seconds=35',
    ]);

    const initialPossessed = await cliA1.waitFor((e) => e.ev === 'possessed', 15000, 'initial possession');
    assert.equal(initialPossessed.ownerEpoch, 1);

    // Client A drops abruptly; server keeps slot 0 in grace and emits resume ticket.
    const dropEv = await cliA1.waitFor((e) => e.ev === 'client_simulated_drop', 15000, 'simulated drop');
    const graceEv = await server.waitFor((e) => e.ev === 'player_disconnected_grace' && e.slot === 0, 15000, 'player_disconnected_grace');
    const resumeIssued = await server.waitFor((e) => e.ev === 'resume_ticket_issued' && e.user === 'bot-a', 15000, 'resume_ticket_issued');

    // Attacker tries to hijack slot 0 during grace window -> rejected with slot_taken!
    const hijack = start('probe-hijack', [
      '--netmode=client', `--port=${port}`, '--bot=probe-hijack', `--ticket=${ticket('bot-x')}`, '--max-seconds=15',
    ]);
    const hijackRefused = await hijack.waitFor((e) => e.ev === 'join_refused', 15000, 'hijack refused');
    assert.equal(hijackRefused.reason, 'slot_taken');

    // Original user reconnects with resume ticket and sends stale-epoch probe RPCs!
    const cliA2 = start('client-a-reconnected', [
      '--netmode=client', `--port=${port}`, '--bot=a', `--ticket=${resumeIssued.ticketPath}`,
      '--stale-epoch-probe', `--leave-file=${leaveFile}`, '--max-seconds=30',
    ]);
    const reconnEv = await server.waitFor((e) => e.ev === 'player_reconnected' && e.slot === 0, 15000, 'player_reconnected');
    assert.deepEqual(reconnEv.netId, initialPossessed.netId, 'same NetObjectId preserved across reconnect');
    assert.equal(reconnEv.ownerEpoch, 2, 'owner_epoch bumped on reconnect');
    assert.notEqual(reconnEv.peer, reconnEv.oldPeer, 'new connection peer id issued');
    assert.ok(reconnEv.pos[0] >= graceEv.pos[0] - 0.5 && reconnEv.pos[0] > 100, 'Pawn position preserved');
    assert.equal(reconnEv.health, graceEv.health, 'Pawn health preserved');

    const poss2 = await cliA2.waitFor((e) => e.ev === 'possessed', 15000, 'reconnected possession');
    assert.equal(poss2.ownerEpoch, 2);
    await cliA2.waitFor((e) => e.ev === 'stale_epoch_rpc_sent' && e.n === 2, 15000, 'stale epoch probes sent');

    // Finish match and drain cleanly
    fs.writeFileSync(settleFile, 'go\n');
    await server.waitFor((e) => e.ev === 'phase' && e.to === 'settle', 15000, 'settle');
    fs.writeFileSync(drainFile, 'go\n');
    await server.waitFor((e) => e.ev === 'drain_started', 10000, 'drain_started');
    fs.writeFileSync(leaveFile, 'go\n');
    const srvCode = await server.exited;
    await Promise.all(procs.map((p) => p.exited));

    assert.equal(srvCode, 0, server.output);
    const metrics = server.first('server_metrics');
    assert.ok(metrics && metrics.rpc.stale_owner_epoch >= 2, `server must reject stale owner_epoch RPCs: ${JSON.stringify(metrics && metrics.rpc)}`);
    assert.ok(dropEv.inputsSent >= 35);
    assert.equal(cliB.exitCode, 0);
    assert.equal(cliA2.exitCode, 0);
  } finally {
    for (const p of procs) p.kill();
    await Promise.all(procs.map((p) => p.exited));
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});
