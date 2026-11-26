'use strict';
// 외부 JoinTicket Control Plane API(로드맵 28·29·30):
//   1) 1,000회 cancel/allocate/join 경합에서 중복 슬롯·무한 예약 0건 + stale leaseEpoch 거절 + idempotent 결과 확정 + 비밀키 비노출
//   2) 실제 Godot DS + 2 clients가 외부 Control Plane 발급 티켓으로 입장하고, 무중단 키 로테이션(k1→k2) 후
//      폐기 키(k1) 티켓 거절·신규 키(k2) 티켓 수용 검증
//   3) Linux SIGTERM 검증기 dry-run 계약 확인
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { spawn, spawnSync } = require('node:child_process');

const { JoinTicketControlPlane, createControlPlaneServer } = require('../../Tools/dedicated-server/join-ticket-service.cjs');
const { resolveGodot, freeUdpPort } = require('../../Tools/dedicated-server/run-ds-2clients.cjs');
const verifyLinuxScript = path.resolve(__dirname, '../../Tools/dedicated-server/verify-linux-ds-sigterm.cjs');
const godot = resolveGodot();
const PROJECT = path.resolve(__dirname, '../../Godot');
const SCENE = 'res://addons/playforge_netframework/demo/spike.tscn';

async function httpJson(baseUrl, method, urlPath, body) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { status: res.status, data };
}

test('Control plane: 1,000 cancel/reserve/join races, stale leaseEpoch, idempotent results, zero secret leak', async () => {
  let fakeNowMs = 1_800_000_000_000;
  const cp = new JoinTicketControlPlane({ nowFn: () => fakeNowMs });
  const { server } = createControlPlaneServer(cp);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    const created = await httpJson(base, 'POST', '/sessions', {
      sessionId: 'sess-race',
      instanceId: 'inst-race',
      projectId: 'proj-a',
      buildId: 'build-1',
      protocolHash: 'proto-abc',
      maxPlayers: 4,
    });
    assert.equal(created.status, 201);
    const createdStr = JSON.stringify(created.data);
    assert.ok(!createdStr.includes('keys') && !createdStr.includes('secret'), 'HTTP response must never expose signing keys');

    // 1,000회 동시/연속 reserve/cancel/join 경합 → 중복 슬롯 0건
    let duplicateSlots = 0;
    for (let i = 0; i < 1000; i += 1) {
      const uid = `u-${i % 10}`;
      const r1 = cp.reserveSlot('sess-race', { userId: uid, projectId: 'proj-a', buildId: 'build-1', protocolHash: 'proto-abc', idempotencyKey: `idem-${i}` });
      const r2 = cp.reserveSlot('sess-race', { userId: uid, projectId: 'proj-a', buildId: 'build-1', protocolHash: 'proto-abc', idempotencyKey: `idem-${i}` });
      if (r1.ok) {
        assert.equal(r2.ok, true);
        assert.equal(r2.idempotent, true);
        assert.equal(r2.reservation.slot, r1.reservation.slot);
        // 같은 슬롯을 두 사용자가 동시 소유했는지 불변량 검사
        const s = cp.sessions.get('sess-race');
        const usedSlots = new Set();
        for (const rec of s.reservations.values()) {
          if (usedSlots.has(rec.slot)) duplicateSlots += 1;
          usedSlots.add(rec.slot);
        }
        if (i % 2 === 0) {
          const t = cp.issueJoinTicket('sess-race', { userId: uid, buildId: 'build-1', protocolHash: 'proto-abc' }, false);
          assert.equal(t.ok, true);
        }
        cp.cancelReservation('sess-race', r1.reservation.reservationId);
      }
    }
    assert.equal(duplicateSlots, 0, 'zero duplicate slot assignments across 1,000 races');

    // 잘못된 build/protocol 거부
    const badProto = await httpJson(base, 'POST', '/sessions/sess-race/reserve', { userId: 'bad', protocolHash: 'wrong' });
    assert.equal(badProto.status, 409);
    assert.equal(badProto.data.reason, 'protocol_mismatch');

    // Lease fencing + stale epoch 거절 + idempotent MatchResult 확정
    const renew = await httpJson(base, 'POST', '/sessions/sess-race/lease/renew', { leaseEpoch: 1, bumpEpoch: true });
    assert.equal(renew.status, 200);
    assert.equal(renew.data.leaseEpoch, 2);

    const staleCommit = await httpJson(base, 'POST', '/sessions/sess-race/results', { leaseEpoch: 1, resultRevision: 1, resultHash: 'h1' });
    assert.equal(staleCommit.status, 409);
    assert.equal(staleCommit.data.reason, 'stale_lease_epoch');

    const okCommit1 = await httpJson(base, 'POST', '/sessions/sess-race/results', { leaseEpoch: 2, resultRevision: 1, resultHash: 'h1' });
    const okCommit2 = await httpJson(base, 'POST', '/sessions/sess-race/results', { leaseEpoch: 2, resultRevision: 1, resultHash: 'h1' });
    assert.equal(okCommit1.status, 201);
    assert.equal(okCommit1.data.duplicate, false);
    assert.equal(okCommit2.status, 200);
    assert.equal(okCommit2.data.duplicate, true);

    // Health 응답에 비밀키 비노출 확인
    const health = await httpJson(base, 'GET', '/sessions/sess-race/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.session.leaseEpoch, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Live Godot DS + External JoinTicket Control Plane: brokered keyring, live key rotation, retired-key rejection', {
  skip: godot.executable ? false : `Godot not found (${godot.reason || godot.source})`,
  timeout: 60000,
}, async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-cp-live-'));
  const controlDir = path.join(runDir, 'control');
  const ticketsDir = path.join(runDir, 'tickets');
  fs.mkdirSync(controlDir, { recursive: true });
  fs.mkdirSync(ticketsDir, { recursive: true });
  const keyringPath = path.join(controlDir, 'keyring.json');
  const settleFile = path.join(controlDir, 'settle');
  const drainFile = path.join(controlDir, 'drain');
  const leaveFile = path.join(controlDir, 'leave');

  const cp = new JoinTicketControlPlane();
  const { server: httpSrv } = createControlPlaneServer(cp);
  await new Promise((resolve) => httpSrv.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${httpSrv.address().port}`;
  const procs = [];

  const launch = (name, userArgs) => {
    const child = spawn(godot.executable, ['--headless', '--path', PROJECT, SCENE, '--', ...userArgs], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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
    const exited = new Promise((resolve) => {
      child.once('close', (code) => {
        exitCode = code;
        exitedAt = Date.now();
        waiters.splice(0).forEach((w) => {
          clearTimeout(w.timer);
          w.reject(new Error(`${name}: exited (${code}) before ${w.label}\n${output}`));
        });
        resolve(code);
      });
    });
    const p = {
      events,
      exited,
      get exitCode() { return exitCode; },
      get output() { return output; },
      first(n) { return events.find((e) => e.ev === n); },
      waitFor(pred, ms, label) {
        const hit = events.find(pred);
        if (hit) return Promise.resolve(hit);
        if (exitedAt !== undefined) return Promise.reject(new Error(`${name}: exited before ${label}\n${output}`));
        return new Promise((resolve, reject) => {
          const w = { pred, resolve, reject, label, timer: null };
          w.timer = setTimeout(() => {
            const idx = waiters.indexOf(w);
            if (idx >= 0) waiters.splice(idx, 1);
            reject(new Error(`${name}: timeout waiting for ${label}\n${output}`));
          }, ms);
          waiters.push(w);
        });
      },
      kill() { if (exitedAt === undefined) child.kill(); },
    };
    procs.push(p);
    return p;
  };

  try {
    const sess = await httpJson(base, 'POST', '/sessions', {
      sessionId: 'sess-live-01',
      instanceId: 'inst-live-01',
      maxPlayers: 3,
      leaseEpoch: 3,
      keyringFile: keyringPath,
    });
    assert.equal(sess.status, 201);

    // k1으로 bot-a, bot-b 예약 및 외부 JoinTicket 발급 + 폐기 테스트용 bot-retired(k1) 미리 발급
    for (const [uid, slot] of [['bot-a', 0], ['bot-b', 1], ['bot-c', 2]]) {
      const rr = await httpJson(base, 'POST', '/sessions/sess-live-01/reserve', { userId: uid, slot });
      assert.equal(rr.status, 201);
    }
    const tA = await httpJson(base, 'POST', '/sessions/sess-live-01/join-ticket', { userId: 'bot-a' });
    const tB = await httpJson(base, 'POST', '/sessions/sess-live-01/join-ticket', { userId: 'bot-b' });
    const tRetired = await httpJson(base, 'POST', '/sessions/sess-live-01/join-ticket', { userId: 'bot-c' });
    assert.equal(tA.data.claims.kid, 'k1');
    assert.equal(tRetired.data.claims.kid, 'k1');

    const writeTicket = (name, val) => {
      const p = path.join(ticketsDir, `${name}.ticket`);
      fs.writeFileSync(p, val);
      return p;
    };
    const pathA = writeTicket('bot-a', tA.data.ticket);
    const pathB = writeTicket('bot-b', tB.data.ticket);
    const pathRetired = writeTicket('bot-c-k1', tRetired.data.ticket);

    const dsPort = await freeUdpPort();
    const ds = launch('ds', [
      '--netmode=dedicated-server', `--port=${dsPort}`, `--run-dir=${runDir}`,
      '--session-id=sess-live-01', '--instance-id=inst-live-01', '--lease-epoch=3',
      `--keyring-file=${keyringPath}`, '--play-ticks=40', `--settle-file=${settleFile}`, '--max-seconds=35',
    ]);
    const listening = await ds.waitFor((e) => e.ev === 'server_listening', 15000, 'server_listening');
    assert.equal(listening.externalKeyring, true);

    const cliA = launch('cli-a', ['--netmode=client', '--bot=a', `--port=${dsPort}`, `--ticket=${pathA}`, `--leave-file=${leaveFile}`, '--max-seconds=30']);
    const cliB = launch('cli-b', ['--netmode=client', '--bot=b', `--port=${dsPort}`, `--ticket=${pathB}`, `--leave-file=${leaveFile}`, '--max-seconds=30']);
    await ds.waitFor((e) => e.ev === 'phase' && e.to === 'play', 20000, 'phase play');

    // 파일 mtime 해상도 확보 후 키 로테이션: k2 활성화 + k1 즉시 폐기!
    await new Promise((r) => setTimeout(r, 1100));
    const rot = await httpJson(base, 'POST', '/sessions/sess-live-01/keys/rotate', { retirePrevious: true });
    assert.equal(rot.status, 200);
    assert.equal(rot.data.activeKid, 'k2');
    assert.deepEqual(rot.data.retired, ['k1']);

    // 폐기된 k1 티켓으로 입장 시도 → key_retired_or_unknown 거절!
    const probeRetired = launch('probe-retired', ['--netmode=client', '--bot=probe-retired', `--port=${dsPort}`, `--ticket=${pathRetired}`, '--max-seconds=15']);
    const refused = await probeRetired.waitFor((e) => e.ev === 'join_refused', 15000, 'retired key refused');
    assert.equal(refused.reason, 'key_retired_or_unknown');

    // 새 키 k2로 발급한 bot-c 티켓으로 입장 → 성공!
    const tCNew = await httpJson(base, 'POST', '/sessions/sess-live-01/join-ticket', { userId: 'bot-c' });
    assert.equal(tCNew.data.claims.kid, 'k2');
    const pathCNew = writeTicket('bot-c-k2', tCNew.data.ticket);
    const cliC = launch('cli-c', ['--netmode=client', '--bot=c', `--port=${dsPort}`, `--ticket=${pathCNew}`, `--leave-file=${leaveFile}`, '--max-seconds=30']);
    const possC = await cliC.waitFor((e) => e.ev === 'possessed', 15000, 'cli-c possessed with k2');
    assert.equal(possC.slot, 2);

    // 정상 종료
    fs.writeFileSync(settleFile, 'go\n');
    await ds.waitFor((e) => e.ev === 'phase' && e.to === 'settle', 15000, 'settle');
    fs.writeFileSync(drainFile, 'go\n');
    await ds.waitFor((e) => e.ev === 'drain_started', 10000, 'drain_started');
    fs.writeFileSync(leaveFile, 'go\n');
    await ds.exited;
    await Promise.all(procs.map((p) => p.exited));
    assert.equal(ds.exitCode, 0);
    assert.equal(cliA.exitCode, 0);
    assert.equal(cliB.exitCode, 0);
    assert.equal(cliC.exitCode, 0);
  } finally {
    for (const p of procs) p.kill();
    await Promise.all(procs.map((p) => p.exited));
    await new Promise((resolve) => httpSrv.close(resolve));
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('Linux DS SIGTERM verifier contract dry-run passes on all hosts', () => {
  const r = spawnSync(process.execPath, [verifyLinuxScript, '--dry-run', '--json'], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.exportScriptExists, true);
});
