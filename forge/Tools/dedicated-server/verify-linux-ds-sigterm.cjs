#!/usr/bin/env node
'use strict';
/**
 * Linux 전용 데디케이티드 서버 ELF 기동 + POSIX SIGTERM → graceful drain 검증기 (로드맵 28).
 *
 * Linux 호스트(CI ubuntu-latest 또는 Linux VM)에서:
 *   1) export-linux-ds.cjs로 Linux x86_64 dedicated_server ELF 생성(또는 --binary 경로 사용)
 *   2) Export된 Linux ELF를 --headless로 기동
 *   3) 클라이언트 2명 접속 → PHASE_PLAY 진입 확인
 *   4) 서버에 실제 POSIX SIGTERM 전송 → NOTIFICATION_WM_CLOSE_REQUEST → drain_started 확인
 *   5) drain 중 신규 입장 probe 거부(draining) 확인
 *   6) 기존 클라이언트 퇴장 허용 → drain_complete(forced=false, remaining=0) 및 exit code 0 검증
 *
 * 비Linux(Windows/macOS)에서는 거짓 통과를 보고하지 않으며, --dry-run 시 계약/인자 검증만 수행한다.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');
const { resolveGodot, freeUdpPort } = require('./run-ds-2clients.cjs');

const REPO = path.resolve(__dirname, '../../..');
const PROJECT = path.join(REPO, 'forge', 'Godot');
const SCENE = 'res://addons/playforge_netframework/demo/spike.tscn';
const EXPORT_SCRIPT = path.join(__dirname, 'export-linux-ds.cjs');

function parseArgs(argv) {
  const out = { binary: '', godot: '', json: false, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--binary') out.binary = argv[++i];
    else if (a === '--godot') out.godot = argv[++i];
    else if (a === '--json') out.json = true;
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

function spawnTracked(name, exe, args, cwd) {
  const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const events = [];
  const waiters = [];
  let output = '';
  for (const pipe of [child.stdout, child.stderr]) {
    readline.createInterface({ input: pipe }).on('line', (line) => {
      output += `${line}\n`;
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
  let exitSignal = null;
  const exited = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      exitedAt = Date.now();
      waiters.splice(0).forEach((w) => {
        clearTimeout(w.timer);
        w.reject(new Error(`${name}: exited (${code}/${signal}) before ${w.label}\n${output}`));
      });
      resolve({ code, signal });
    });
  });
  return {
    child,
    events,
    exited,
    get output() { return output; },
    get exitCode() { return exitCode; },
    get exitSignal() { return exitSignal; },
    first(evName) { return events.find((e) => e.ev === evName); },
    waitFor(pred, timeoutMs, label) {
      const hit = events.find(pred);
      if (hit) return Promise.resolve(hit);
      if (exitedAt !== undefined) return Promise.reject(new Error(`${name}: already exited before ${label}\n${output}`));
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
    kill(sig) { if (exitedAt === undefined) child.kill(sig); },
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.dryRun || process.platform !== 'linux') {
    const summary = {
      ok: opts.dryRun,
      skipped: process.platform !== 'linux',
      platform: process.platform,
      reason: process.platform !== 'linux'
        ? 'Linux ELF execution and POSIX SIGTERM require a Linux host (CI ubuntu-latest or Linux VM).'
        : 'dry-run contract check ok',
      exportScriptExists: fs.existsSync(EXPORT_SCRIPT),
    };
    if (opts.json) console.log(JSON.stringify(summary, null, 2));
    else console.log(`[linux-ds-sigterm] ${summary.reason}`);
    process.exit(opts.dryRun ? 0 : 3);
  }

  const g = resolveGodot(opts.godot);
  if (!g.executable) {
    console.error(`[linux-ds-sigterm] Godot client binary not found (${g.reason || g.source})`);
    process.exit(2);
  }

  let binary = opts.binary ? path.resolve(opts.binary) : '';
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-linux-sigterm-'));
  const runDir = path.join(tmpRoot, 'run');
  const controlDir = path.join(runDir, 'control');
  fs.mkdirSync(controlDir, { recursive: true });
  const leaveFile = path.join(controlDir, 'leave');
  const procs = [];

  try {
    if (!binary) {
      const expOut = path.join(tmpRoot, 'export');
      const er = spawnSync(process.execPath, [EXPORT_SCRIPT, '--godot', g.executable, '--out', expOut], {
        encoding: 'utf8',
        timeout: 120000,
      });
      if (er.status !== 0) {
        throw new Error(`export-linux-ds failed (${er.status}): ${er.stdout}\n${er.stderr}`);
      }
      binary = path.join(expOut, 'playforge-ds.x86_64');
    }
    fs.chmodSync(binary, 0o755);

    const port = await freeUdpPort();
    const server = spawnTracked('linux-ds', binary, [
      '--headless', '--', '--netmode=dedicated-server', `--port=${port}`, `--run-dir=${runDir}`, '--play-ticks=0', '--max-seconds=45',
    ], tmpRoot);
    procs.push(server);

    const listening = await server.waitFor((e) => e.ev === 'server_listening', 20000, 'server_listening');
    await server.waitFor((e) => e.ev === 'tickets_issued', 10000, 'tickets_issued');
    const ticket = (u) => path.join(runDir, 'tickets', `${u}.ticket`);

    const cliA = spawnTracked('client-a', g.executable, [
      '--headless', '--path', PROJECT, SCENE, '--',
      '--netmode=client', '--bot=a', `--port=${port}`, `--ticket=${ticket('bot-a')}`, `--leave-file=${leaveFile}`, '--max-seconds=35',
    ], PROJECT);
    const cliB = spawnTracked('client-b', g.executable, [
      '--headless', '--path', PROJECT, SCENE, '--',
      '--netmode=client', '--bot=b', `--port=${port}`, `--ticket=${ticket('bot-b')}`, `--leave-file=${leaveFile}`, '--max-seconds=35',
    ], PROJECT);
    procs.push(cliA, cliB);

    await server.waitFor((e) => e.ev === 'phase' && e.to === 'play', 20000, 'phase play');
    await Promise.all([
      cliA.waitFor((e) => e.ev === 'possessed', 15000, 'client-a possessed'),
      cliB.waitFor((e) => e.ev === 'possessed', 15000, 'client-b possessed'),
    ]);

    // 실제 POSIX SIGTERM 전송 → Godot NOTIFICATION_WM_CLOSE_REQUEST → drain_started 검증
    server.child.kill('SIGTERM');
    const drainStarted = await server.waitFor((e) => e.ev === 'drain_started', 10000, 'drain_started after SIGTERM');

    // drain 중 신규 접속 probe 거부 확인
    const probeDrain = spawnTracked('probe-drain', g.executable, [
      '--headless', '--path', PROJECT, SCENE, '--',
      '--netmode=client', '--bot=probe-drain', `--port=${port}`, `--ticket=${ticket('bot-c')}`, '--max-seconds=15',
    ], PROJECT);
    procs.push(probeDrain);
    const refused = await probeDrain.waitFor((e) => e.ev === 'join_refused', 10000, 'join_refused during SIGTERM drain');

    // 기존 클라이언트 퇴장 허용 후 깔끔한 종료 확인
    fs.writeFileSync(leaveFile, 'leave\n');
    const srvExit = await server.exited;
    await Promise.all(procs.map((p) => p.exited));
    const drainComplete = server.first('drain_complete');

    const checks = [
      { id: 'dedicated_server_feature_tag', ok: listening.dedicatedServerFeature === true },
      { id: 'sigterm_triggered_drain', ok: Boolean(drainStarted && drainStarted.reason === 'close_request') },
      { id: 'drain_refused_new_join', ok: Boolean(refused && refused.reason === 'draining') },
      { id: 'drain_complete_clean', ok: Boolean(drainComplete && drainComplete.forced === false && drainComplete.remaining === 0) },
      { id: 'server_exit_zero', ok: srvExit.code === 0 && srvExit.signal === null },
    ];
    const ok = checks.every((c) => c.ok);
    const summary = { ok, platform: process.platform, binary, checks };
    if (opts.json) console.log(JSON.stringify(summary, null, 2));
    else {
      for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'} ${c.id}`);
    }
    process.exit(ok ? 0 : 1);
  } finally {
    for (const p of procs) p.kill('SIGKILL');
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
