#!/usr/bin/env node
'use strict';
/**
 * Godot 데디케이티드 서버 R0 스파이크 실행기 (로드맵 25/28).
 *
 * 1 headless 서버 + 2 headless 클라이언트(+ 늦은 입장 1, 공격 probe 4)를 별도 프로세스로 띄우고
 * 서버/클라이언트 JSON 이벤트(NETEV)로 다음을 판정한다.
 *   - 클라이언트 상태가 서버 권위 상태(위치·체력)로 수렴
 *   - 다른 플레이어 Controller에 보낸 owner RPC 거부
 *   - JoinTicket 재사용·slot 위조·점유 slot·drain 중 입장 거부
 *   - 서버가 플레이어 목록/슬롯에 없음
 *   - drain: 새 입장 거부 → 기존 플레이어 퇴장 대기 → 종료 코드 0
 *
 * 사용: node forge/Tools/dedicated-server/run-ds-2clients.cjs [--godot <exe>] [--out <dir>] [--no-late] [--json]
 * Godot 결정: --godot > GODOT_BIN > 저장소 옆 GoDotProjects/Godot_v4.7.2-stable_win64.exe > tools/engine/resolve-godot.cjs
 * 실패 시 종료 코드 1, Godot 미발견 시 2.
 */
const fs = require('node:fs');
const path = require('node:path');
const dgram = require('node:dgram');
const net = require('node:net');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '../../..');
const PROJECT = path.join(REPO, 'forge', 'Godot');
const SCENE = 'res://addons/playforge_netframework/demo/spike.tscn';
const SELFTEST = 'res://addons/playforge_netframework/demo/ticket_selftest.gd';
const POS_TOLERANCE = 0.5;

function parseArgs(argv) {
  const out = { late: true, json: false, transport: 'enet' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--godot') out.godot = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--transport') out.transport = argv[++i];
    else if (a.startsWith('--transport=')) out.transport = a.slice('--transport='.length);
    else if (a === '--no-late') out.late = false;
    else if (a === '--json') out.json = true;
  }
  return out;
}

function resolveGodot(explicit) {
  const candidates = [explicit, process.env.GODOT_BIN].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return { executable: path.resolve(c), source: 'explicit' };
    return { executable: null, source: 'explicit', reason: `not found: ${c}` };
  }
  const exe = process.platform === 'win32' ? 'Godot_v4.7.2-stable_win64.exe' : 'Godot_v4.7.2-stable_linux.x86_64';
  for (const dir of [path.resolve(REPO, '..', '..', 'GoDotProjects'), path.resolve(REPO, '..', 'GoDotProjects'), path.resolve(REPO, '..')]) {
    const p = path.join(dir, exe);
    if (fs.existsSync(p)) return { executable: p, source: 'stock-4.7.2' };
  }
  try {
    // eslint-disable-next-line global-require
    const { resolveGodotBinary } = require(path.join(REPO, 'tools', 'engine', 'resolve-godot.cjs'));
    const r = resolveGodotBinary({});
    if (r.found) return { executable: r.executable, source: `resolver:${r.source}` };
    return { executable: null, source: 'resolver', reason: r.reason };
  } catch (err) {
    return { executable: null, source: 'resolver', reason: err.message };
  }
}

function freeUdpPort() {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.once('error', reject);
    s.bind(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function freeTcpPort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

class GodotProc {
  constructor(name, godot, userArgs, outDir) {
    this.name = name;
    this.events = [];
    this.waiters = [];
    this.exitCode = null;
    this.signal = null;
    this.status = { state: 'starting', code: null, signal: null, error: null };
    this.lastEvent = null;
    this.startedAt = Date.now();
    this.logPath = path.join(outDir, `${name}.log`);
    const logStream = fs.createWriteStream(this.logPath);
    const args = ['--headless', '--path', PROJECT, SCENE, '--', ...userArgs];
    this.child = spawn(godot, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    GodotProc.active.add(this);
    this.child.once('spawn', () => { this.status.state = 'running'; });
    this.child.on('error', (err) => {
      this.status.state = 'spawn_error';
      this.status.error = err.message;
    });
    for (const stream of [this.child.stdout, this.child.stderr]) {
      if (!stream) continue;
      readline.createInterface({ input: stream }).on('line', (line) => {
        logStream.write(`${line}\n`);
        const idx = line.indexOf('NETEV ');
        if (idx < 0) return;
        try {
          const ev = JSON.parse(line.slice(idx + 6));
          ev._wall = Date.now();
          this.events.push(ev);
          this.lastEvent = ev;
          this.waiters = this.waiters.filter((w) => {
            if (!w.pred(ev)) return true;
            clearTimeout(w.timer);
            w.resolve(ev);
            return false;
          });
        } catch { /* 비JSON 줄 무시 */ }
      });
    }
    this.exited = new Promise((resolve) => {
      this.child.once('close', (code, signal) => {
        this.exitCode = code;
        this.signal = signal;
        this.exitedAt = Date.now();
        if (this.status.state !== 'spawn_error') this.status.state = 'closed';
        this.status.code = code;
        this.status.signal = signal;
        this.waiters.splice(0).forEach((w) => {
          clearTimeout(w.timer);
          w.reject(new Error(`${this.name}: process closed before ${w.label}; ${this.describe()}`));
        });
        // Child 'close' follows stdout/stderr closure. Wait for the file stream
        // to flush too, so exited means both process output and log are complete.
        logStream.end(() => {
          GodotProc.active.delete(this);
          resolve(code);
        });
      });
    });
  }

  waitFor(pred, timeoutMs, label) {
    const hit = this.events.find(pred);
    if (hit) return Promise.resolve(hit);
    if (this.exitedAt !== undefined) return Promise.reject(new Error(`${this.name}: process already closed before ${label}; ${this.describe()}`));
    return new Promise((resolve, reject) => {
      const w = { pred, resolve, reject, label, timer: null };
      this.waiters.push(w);
      w.timer = setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new Error(`${this.name}: timeout waiting for ${label}; ${this.describe()}`));
      }, timeoutMs);
    });
  }

  ev(name) { return this.events.filter((e) => e.ev === name); }
  first(name) { return this.events.find((e) => e.ev === name); }
  describe() {
    const event = this.lastEvent ? `${this.lastEvent.ev || 'event'}@${this.lastEvent.t_ms ?? '?'}ms` : 'no NETEV';
    const detail = this.status.error ? ` error=${this.status.error}` : '';
    return `status=${this.status.state} code=${this.exitCode} signal=${this.signal} last=${event}${detail}`;
  }
  kill() { if (this.exitedAt === undefined) this.child.kill(); }
}

GodotProc.active = new Set();

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const processes = [...GodotProc.active].map((p) => `${p.name}[${p.describe()}]`);
      reject(new Error(`timeout: ${label}${processes.length ? `; active: ${processes.join('; ')}` : '; no active Godot processes'}`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function pct(values, q) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const g = resolveGodot(opts.godot);
  if (!g.executable) {
    console.error(`[ds-spike] Godot not found (${g.reason || g.source})`);
    process.exit(2);
  }
  const godot = g.executable;
  const version = spawnSync(godot, ['--version'], { encoding: 'utf8', windowsHide: true }).stdout.trim().split(/\r?\n/).pop();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(opts.out || path.join(REPO, 'forge', 'Saved', 'Tests', 'netframework', `ds-spike-${stamp}`));
  fs.mkdirSync(outDir, { recursive: true });
  const runDir = opts.out ? fs.mkdtempSync(path.join(outDir, 'match-')) : outDir;
  const control = path.join(runDir, 'control');
  fs.mkdirSync(control);
  const ticket = (u) => path.join(runDir, 'tickets', `${u}.ticket`);
  const settleFile = path.join(control, 'settle');
  const drainFile = path.join(control, 'drain');
  const probeFile = path.join(control, 'probe-connect');
  const leaveFile = path.join(control, 'leave');
  const release = (file) => fs.writeFileSync(file, 'ready\n', { flag: 'wx' });
  const checks = [];
  const check = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
  const procs = [];
  const start = (name, args) => { const p = new GodotProc(name, godot, args, outDir); procs.push(p); return p; };
  const t0 = Date.now();
  let fatal = null;

  // 0) JoinTicket 단위 자가 시험
  const st = spawnSync(godot, ['--headless', '--path', PROJECT, '--script', SELFTEST], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  fs.writeFileSync(path.join(outDir, 'ticket-selftest.log'), `${st.stdout || ''}${st.stderr || ''}`);
  check('ticket_selftest', st.status === 0 && /TICKET_SELFTEST_OK/.test(st.stdout || ''), `exit=${st.status}`);

  const transport = String(opts.transport || 'enet').toLowerCase();
  const port = transport === 'enet' ? await freeUdpPort() : await freeTcpPort();
  const common = [`--port=${port}`, `--transport=${transport}`, '--max-seconds=45'];
  const server = start('server', ['--netmode=dedicated-server', ...common, `--run-dir=${runDir}`,
    '--play-ticks=150', `--settle-file=${settleFile}`]);
  try {
    const listeningEv = await server.waitFor((e) => e.ev === 'server_listening', 15000, 'server_listening');
    await server.waitFor((e) => e.ev === 'tickets_issued', 15000, 'tickets_issued');
    const tlsClientArgs = transport === 'wss' && listeningEv.tlsCertPath
      ? [`--tls-ca=${listeningEv.tlsCertPath}`, '--tls-hostname=localhost']
      : [];
    const playerArgs = ['--netmode=client', ...common, ...tlsClientArgs, `--leave-file=${leaveFile}`];
    start('client-a', [...playerArgs, '--bot=a', `--ticket=${ticket('bot-a')}`]);
    start('client-b', [...playerArgs, '--bot=b', `--ticket=${ticket('bot-b')}`]);
    await server.waitFor((e) => e.ev === 'phase' && e.to === 'play', 20000, 'phase play');

    // Start C after the normal play budget to exercise slow startup on every run.
    await server.waitFor((e) => e.ev === 'play_ticks_elapsed', 15000, 'minimum play ticks');
    const late = opts.late && start('client-c-late', [...playerArgs, '--bot=c', `--ticket=${ticket('bot-c')}`]);
    const playProbes = [
      start('probe-reuse', ['--netmode=client', '--bot=probe-reuse', ...common, ...tlsClientArgs, `--ticket=${ticket('bot-a')}`]),
      start('probe-tamper', ['--netmode=client', '--bot=probe-tamper', ...common, ...tlsClientArgs, `--ticket=${ticket('bot-b')}`, '--tamper-slot=0']),
      start('probe-wrongslot', ['--netmode=client', '--bot=probe-wrongslot', ...common, ...tlsClientArgs, `--ticket=${ticket('bot-x')}`]),
    ];

    await Promise.all([
      ...playProbes.map((p) => p.waitFor((e) => e.ev === 'join_refused', 20000, 'play admission result')),
      ...(late ? [late.waitFor((e) => e.ev === 'possessed', 20000, 'late player possession')] : []),
    ]);
    const probeDrain = start('probe-drain', ['--netmode=client', '--bot=probe-drain', ...common, ...tlsClientArgs,
      `--ticket=${ticket('bot-c')}`, `--wait-file=${probeFile}`]);
    await probeDrain.waitFor((e) => e.ev === 'client_boot', 15000, 'probe-drain boot');
    release(settleFile);
    await server.waitFor((e) => e.ev === 'phase' && e.to === 'settle', 10000, 'phase settle');
    release(drainFile);
    await server.waitFor((e) => e.ev === 'drain_started', 10000, 'drain started');
    release(probeFile);
    await probeDrain.waitFor((e) => e.ev === 'join_refused', 10000, 'drain admission result');
    release(leaveFile);
    await withTimeout(server.exited, 25000, 'server exit');
    await withTimeout(Promise.all(procs.map((p) => p.exited)), 10000, 'all processes exit');
  } catch (err) {
    fatal = err.message;
  } finally {
    for (const p of procs) p.kill();
    await Promise.all(procs.map((p) => p.exited));
  }

  // ------------------------------------------------------------------ 판정
  const byName = Object.fromEntries(procs.map((p) => [p.name, p]));
  const players = ['client-a', 'client-b', ...(opts.late ? ['client-c-late'] : [])].map((n) => byName[n]).filter(Boolean);
  const listening = server.first('server_listening');
  const serverSnap = server.first('server_snapshot');
  const metrics = server.first('server_metrics');
  const drainDone = server.first('drain_complete');
  check('no_fatal', !fatal, fatal || 'ok');
  check('server_clean_exit', server.exitCode === 0, `exit=${server.exitCode}`);
  check('dedicated_server_net_mode', listening && listening.netMode === 'dedicated-server', `netMode=${listening && listening.netMode}`);
  check('drain_waited_for_players', drainDone && drainDone.forced === false && drainDone.remaining === 0, drainDone ? `forced=${drainDone.forced} remaining=${drainDone.remaining}` : 'missing');
  for (const p of players) check(`${p.name}_clean_exit`, p.exitCode === 0, `exit=${p.exitCode}`);
  for (const p of players) {
    const boot = p.first('client_boot');
    check(`${p.name}_client_net_mode`, boot && boot.netMode === 'client', `netMode=${boot && boot.netMode}`);
  }

  // 서버는 플레이어가 아니다
  const serverInList = !serverSnap
    || serverSnap.playerPeers.includes(1)
    || serverSnap.players.some((pl) => pl.peer === 1)
    || players.some((p) => { const s = p.first('client_snapshot'); return !s || s.playerPeers.includes(1) || s.players.some((pl) => pl.peer === 1); });
  check('server_not_in_player_list', listening && listening.serverIsPlayer === false && !serverInList,
    serverSnap ? `playerPeers=${JSON.stringify(serverSnap.playerPeers)}` : 'no server snapshot');

  // 수렴
  const convergence = [];
  for (const p of players) {
    const cs = p.first('client_snapshot');
    if (!serverSnap || !cs) { convergence.push({ client: p.name, ok: false, detail: 'snapshot missing' }); continue; }
    let maxPos = 0; let healthMismatch = 0; let missing = 0;
    for (const sp of serverSnap.players) {
      const cp = cs.players.find((x) => x.slot === sp.slot && x.peer === sp.peer);
      if (!cp) { missing += 1; continue; }
      maxPos = Math.max(maxPos, Math.hypot(cp.pos[0] - sp.pos[0], cp.pos[1] - sp.pos[1]));
      if (cp.health !== sp.health) healthMismatch += 1;
    }
    const extra = cs.players.length - serverSnap.players.length;
    const ok = missing === 0 && extra === 0 && healthMismatch === 0 && maxPos <= POS_TOLERANCE;
    convergence.push({ client: p.name, ok, maxPosErr: Number(maxPos.toFixed(3)), healthMismatch, missing, extra });
  }
  check('clients_converge_to_server', convergence.length > 0 && convergence.every((c) => c.ok), JSON.stringify(convergence));

  // 게임 규칙이 실제로 작동했는가(이동·피해)
  const sA = serverSnap && serverSnap.players.find((x) => x.slot === 0);
  const sB = serverSnap && serverSnap.players.find((x) => x.slot === 1);
  check('server_rules_applied', sA && sB && sA.pos[0] > 100 && sB.health < 100,
    sA && sB ? `A.pos=${JSON.stringify(sA.pos)} B.health=${sB.health}` : 'missing');

  // 불법 owner RPC
  const illegalSent = (byName['client-b'] && byName['client-b'].ev('illegal_rpc_sent').length) || 0;
  const notOwner = metrics ? metrics.rpc.not_owner : -1;
  check('illegal_owner_rpc_rejected', illegalSent > 0 && notOwner >= illegalSent && sA && sA.ackedSeq < 1000000,
    `sent=${illegalSent} rejected_not_owner=${notOwner} A.ackedSeq=${sA ? sA.ackedSeq : 'n/a'}`);

  // JoinTicket 거부
  const rej = server.ev('join_rejected');
  const probeExpect = { 'probe-reuse': 'ticket_reused', 'probe-tamper': 'hmac_invalid', 'probe-wrongslot': 'slot_taken', 'probe-drain': 'draining' };
  for (const [name, reason] of Object.entries(probeExpect)) {
    const p = byName[name];
    const refused = p && p.first('join_refused');
    const serverSaw = rej.some((e) => e.reason === reason);
    check(`ticket_${reason}`, p && p.exitCode === 0 && refused && refused.reason === reason && serverSaw && !p.first('connected'),
      `client=${refused ? refused.reason : 'none'} exit=${p ? p.exitCode : 'n/a'} serverSaw=${serverSaw}`);
  }

  // 늦은 입장
  if (opts.late) {
    const c = byName['client-c-late'];
    const poss = c && c.first('possessed');
    const conv = convergence.find((x) => x.client === 'client-c-late');
    const joined = server.ev('player_joined').find((e) => e.user === 'bot-c');
    check('late_join_receives_world', joined && joined.phase === 'play' && joined.playTick >= 150 && poss && poss.phase === 'play' && poss.visiblePlayers >= 3 && conv && conv.ok,
      poss ? `serverPhaseAtJoin=${joined && joined.phase} serverPlayTick=${joined && joined.playTick} clientPhase=${poss.phase} visible=${poss.visiblePlayers}` : 'not possessed');
  }

  // WorldKey 일관성: 모든 클라이언트가 같은 WorldKey(session 포함)를 받았다
  {
    const wk = serverSnap && serverSnap.worldKey;
    const seen = players.map((p) => (p.first('possessed') || {}).worldKey);
    check('world_key_consistent', wk && listening && wk.includes(listening.worldKey.sessionId) && seen.every((x) => x === wk), `worldKey=${wk}`);
  }

  // drain 순서: drain_started → 플레이어 퇴장 → drain_complete
  const drainStart = server.first('drain_started');
  const lefts = server.ev('player_left');
  const drainRejection = rej.find((e) => e.reason === 'draining');
  check('drain_refusal_before_player_departure', drainStart && drainRejection && lefts.length > 0
    && drainStart.t_ms <= drainRejection.t_ms && lefts.every((e) => e.t_ms >= drainRejection.t_ms),
  `start=${drainStart?.t_ms} refusal=${drainRejection?.t_ms} firstLeave=${lefts[0]?.t_ms} ms`);
  check('drain_order', drainStart && drainDone && lefts.length === players.length
    && lefts.every((e) => e.phase === 'draining' && e._wall >= drainStart._wall && e._wall <= drainDone._wall),
  `left=${lefts.length}/${players.length}`);

  // 계측
  const connectMs = players.map((p) => (p.first('connected') || {}).connectMs).filter((x) => typeof x === 'number');
  const leaving = players.map((p) => ({ name: p.name, ...(p.first('client_leaving') || {}) }));
  const measurements = {
    godot: { executable: godot, source: g.source, version },
    transport,
    transportCaps: listening ? listening.transportCaps : null,
    port,
    wallMs: Date.now() - t0,
    serverReadyMs: listening ? listening._wall - server.startedAt : null,
    connectMs: { values: connectMs, p50: pct(connectMs, 0.5), max: connectMs.length ? Math.max(...connectMs) : null },
    serverTick: metrics ? { hz: metrics.tickHz, ticks: metrics.ticks, us: metrics.tickUs } : null,
    serverEnet: metrics ? metrics.enet : null,
    rpcCounters: metrics ? metrics.rpc : null,
    tickets: metrics ? metrics.tickets : null,
    joinRejected: metrics ? metrics.joinRejected : null,
    clients: leaving.map((l) => ({ name: l.name, inputsSent: l.inputsSent, acksReceived: l.acksReceived, ackedSeq: l.ackedSeq, enet: l.enet })),
    serverSnapshot: serverSnap ? serverSnap.players : null,
  };
  const failed = checks.filter((c) => !c.ok);
  const summary = { ok: failed.length === 0, outDir, checks, measurements };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  if (opts.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`[ds-spike] godot=${version} (${g.source}) port=${port} out=${outDir}`);
    for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  ${c.detail || ''}`);
    const m = measurements;
    console.log(`  server ready ${m.serverReadyMs} ms; connect(auth incl.) ms ${JSON.stringify(m.connectMs.values)}`);
    if (m.serverTick) console.log(`  server tick ${m.serverTick.hz}Hz x${m.serverTick.ticks}: p50 ${m.serverTick.us.p50}us p95 ${m.serverTick.us.p95}us p99 ${m.serverTick.us.p99}us max ${m.serverTick.us.max}us`);
    if (m.serverEnet) console.log(`  server ENet sent ${m.serverEnet.sentBytes} B / ${m.serverEnet.sentPackets} pkts, recv ${m.serverEnet.recvBytes} B / ${m.serverEnet.recvPackets} pkts`);
    console.log(`  total wall ${m.wallMs} ms -> ${summary.ok ? 'OK' : `FAILED (${failed.length})`}`);
  }
  process.exit(summary.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { resolveGodot, freeUdpPort, freeTcpPort };
