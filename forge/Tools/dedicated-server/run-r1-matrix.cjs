#!/usr/bin/env node
'use strict';
/**
 * R1 라이브 네트워크 매트릭스 실행기 (로드맵 26 Iris 복제 + 27 이동 예측/보간 + 30 서버 Validator).
 *
 * 실제 Godot DS + 2 clients 프로세스를 NetEmulationProxy(실제 UDP 지연·손실) 경유로 실행해
 * LAN(0ms/0%), RTT 150ms + 1% loss, RTT 300ms + 5% loss 프로파일을 실측 판정한다.
 *
 * 사용: node forge/Tools/dedicated-server/run-r1-matrix.cjs [--godot <exe>] [--json] [--seed N]
 */
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { resolveGodot, freeUdpPort } = require('./run-ds-2clients.cjs');
const { NetEmulationProxy } = require('./net-emulation-proxy.cjs');

const REPO = path.resolve(__dirname, '../../..');
const PROJECT = path.join(REPO, 'forge', 'Godot');
const SCENE = 'res://addons/playforge_netframework/demo/net_r1_live.tscn';

const PROFILES = [
  { name: 'lan_0ms_0pct', upDelayMs: 0, downDelayMs: 0, lossRate: 0.0, playTicks: 100, settleTicks: 40 },
  { name: 'rtt150_loss1', upDelayMs: 75, downDelayMs: 75, lossRate: 0.01, playTicks: 100, settleTicks: 50 },
  { name: 'rtt300_loss5', upDelayMs: 150, downDelayMs: 150, lossRate: 0.05, playTicks: 100, settleTicks: 65 },
];

function parseArgs(argv) {
  const out = { json: false, seed: 27 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--godot') out.godot = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--seed') out.seed = Number(argv[++i]);
  }
  return out;
}

function launchProc(name, godot, userArgs, logPath) {
  const child = spawn(godot, ['--headless', '--path', PROJECT, SCENE, '--', ...userArgs], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const events = [];
  const waiters = [];
  const logStream = fs.createWriteStream(logPath);
  for (const pipe of [child.stdout, child.stderr]) {
    readline.createInterface({ input: pipe }).on('line', (line) => {
      logStream.write(line + '\n');
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
      } catch { /* ignore non-JSON */ }
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
        w.reject(new Error(`${name}: closed (${code}) before ${w.label}`));
      });
      logStream.end(() => resolve(code));
    });
  });
  return {
    name,
    child,
    events,
    exited,
    get exitCode() { return exitCode; },
    first(evName) { return events.find((e) => e.ev === evName); },
    waitFor(pred, timeoutMs, label) {
      const hit = events.find(pred);
      if (hit) return Promise.resolve(hit);
      if (exitedAt !== undefined) return Promise.reject(new Error(`${name}: already closed before ${label}`));
      return new Promise((resolve, reject) => {
        const w = { pred, resolve, reject, label, timer: null };
        w.timer = setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`${name}: timeout waiting for ${label}`));
        }, timeoutMs);
        waiters.push(w);
      });
    },
    kill() { if (exitedAt === undefined) child.kill(); },
  };
}

async function runProfile(godot, profile, outDir, seed) {
  const dir = path.join(outDir, profile.name);
  fs.mkdirSync(dir, { recursive: true });
  const backendPort = await freeUdpPort();
  const proxy = new NetEmulationProxy({ backendHost: '127.0.0.1', backendPort, seed });
  const procs = [];
  let fatal = null;
  try {
    await proxy.start();
    const frontA = await proxy.addClient({ id: 'a' });
    const frontB = await proxy.addClient({ id: 'b' });
    const server = launchProc('server', godot, [
      '--netmode=dedicated-server',
      `--port=${backendPort}`,
      `--play-ticks=${profile.playTicks}`,
      `--settle-ticks=${profile.settleTicks}`,
      '--max-seconds=30',
    ], path.join(dir, 'server.log'));
    procs.push(server);
    await server.waitFor((e) => e.ev === 'r1_server_ready', 15000, 'r1_server_ready');

    const stopFile = path.join(dir, 'stop.flag');
    const cliA = launchProc('client-a', godot, [
      '--netmode=client', '--bot=a', `--port=${frontA.port}`, `--play-ticks=${profile.playTicks}`, `--stop-file=${stopFile}`, '--max-seconds=30',
    ], path.join(dir, 'client-a.log'));
    const cliB = launchProc('client-b', godot, [
      '--netmode=client', '--bot=b', `--port=${frontB.port}`, `--play-ticks=${profile.playTicks}`, `--stop-file=${stopFile}`, '--max-seconds=30',
    ], path.join(dir, 'client-b.log'));
    procs.push(cliA, cliB);

    await server.waitFor((e) => e.ev === 'r1_match_started', 15000, 'r1_match_started');
    // 연결 수립 직후 실제 UDP 지연·손실 프로파일 주입
    if (profile.upDelayMs > 0 || profile.lossRate > 0) {
      proxy.reconfigure({ delayMs: profile.upDelayMs, lossRate: profile.lossRate }, 'up', null);
      proxy.reconfigure({ delayMs: profile.downDelayMs, lossRate: profile.lossRate }, 'down', null);
    }

    const srvSummary = await server.waitFor((e) => e.ev === 'r1_server_summary', 25000, 'r1_server_summary');
    // 종료 직전 손실 해제 후 클라이언트 요약 수집
    proxy.reconfigure({ delayMs: 0, lossRate: 0 }, 'both', null);
    fs.writeFileSync(stopFile, 'done\n');
    await Promise.all(procs.map((p) => p.exited));

    const sumA = cliA.first('r1_client_summary');
    const sumB = cliB.first('r1_client_summary');
    const srvPos = srvSummary.positions || {};

    let maxConvergeErr = 0;
    let missingObjs = 0;
    for (const cs of [sumA, sumB]) {
      if (!cs || !cs.irisPositions) { missingObjs += 1; continue; }
      for (const [k, sp] of Object.entries(srvPos)) {
        const cp = cs.irisPositions[k];
        if (!cp) { missingObjs += 1; continue; }
        maxConvergeErr = Math.max(maxConvergeErr, Math.hypot(cp[0] - sp[0], cp[1] - sp[1]));
      }
    }
    const ownerSecretsOk = Boolean(sumA && sumA.ownerSecretVerified && sumB && sumB.ownerSecretVerified);
    const zeroOwnerLeak = Boolean(sumA && !sumA.leakDetected && sumB && !sumB.leakDetected);
    const remoteInterpOk = Boolean(sumA && sumA.remoteInterp && sumA.remoteInterp.valid && sumA.remoteInterp.pushed > 0);
    const predA = (sumA && sumA.prediction) || {};
    const validatorCounters = srvSummary.validatorCounters || {};
    const irisStats = srvSummary.irisStats || {};

    const checks = [
      { id: 'clean_exits', ok: server.exitCode === 0 && cliA.exitCode === 0 && cliB.exitCode === 0 },
      { id: 'owner_privacy_zero_leak', ok: ownerSecretsOk && zeroOwnerLeak },
      { id: 'iris_delta_and_ack_active', ok: (irisStats.full_sent || 0) >= 4 && (irisStats.delta_sent || 0) > 0 && (irisStats.acks_accepted || 0) > 0 },
      { id: 'iris_converged', ok: missingObjs === 0 && maxConvergeErr <= 5.0, detail: `maxErr=${maxConvergeErr.toFixed(3)} missing=${missingObjs}` },
      { id: 'prediction_and_reconcile_active', ok: (predA.inputsPredicted || 0) > 50 && (predA.snapshotsProcessed || 0) > 5 },
      { id: 'remote_interpolator_active', ok: remoteInterpOk },
      { id: 'validator_zero_auto_bans', ok: (validatorCounters.permanent_bans_auto || 0) === 0 },
    ];
    return {
      profile: profile.name,
      ok: checks.every((c) => c.ok),
      checks,
      metrics: {
        rttMs: profile.upDelayMs + profile.downDelayMs,
        lossPercent: profile.lossRate * 100,
        maxConvergeErr: Number(maxConvergeErr.toFixed(3)),
        irisStats,
        predictionA: predA,
        remoteInterpA: sumA && sumA.remoteInterp,
        validatorCounters,
        proxy: proxy.metrics(),
      },
    };
  } catch (err) {
    fatal = err.message;
    return { profile: profile.name, ok: false, fatal, checks: [{ id: 'no_fatal', ok: false, detail: fatal }] };
  } finally {
    for (const p of procs) p.kill();
    await Promise.all(procs.map((p) => p.exited));
    await proxy.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const g = resolveGodot(opts.godot);
  if (!g.executable) {
    console.error(`[r1-matrix] Godot not found (${g.reason || g.source})`);
    process.exit(2);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(REPO, 'forge', 'Saved', 'Tests', 'netframework', `r1-matrix-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];
  for (let i = 0; i < PROFILES.length; i += 1) {
    results.push(await runProfile(g.executable, PROFILES[i], outDir, opts.seed + i));
  }
  const summary = { ok: results.every((r) => r.ok), outDir, results };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    for (const r of results) {
      console.log(`[r1-matrix] ${r.profile}: ${r.ok ? 'PASS' : 'FAIL'}`);
      if (r.metrics) {
        console.log(`  convergeMaxErr=${r.metrics.maxConvergeErr} iris(full=${r.metrics.irisStats.full_sent}, delta=${r.metrics.irisStats.delta_sent}, ack=${r.metrics.irisStats.acks_accepted}) predA(p95=${r.metrics.predictionA.errorP95}, corr=${r.metrics.predictionA.corrections}, hard=${r.metrics.predictionA.hardCorrections})`);
      }
      for (const c of r.checks || []) {
        if (!c.ok) console.log(`  FAIL ${c.id}: ${c.detail || ''}`);
      }
    }
  }
  process.exit(summary.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
