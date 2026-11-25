'use strict';
// Godot 데디케이티드 서버 R0 스파이크 통합 시험(로드맵 25/28): 1 서버 + 2 클라이언트(+늦은 입장·공격 probe).
// Godot 4.7.2 바이너리가 필요하므로 integration/godot 계층에서만 실행한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runner = path.resolve(__dirname, '../../Tools/dedicated-server/run-ds-2clients.cjs');
const { resolveGodot } = require(runner);
const godot = resolveGodot();

test('Godot DS + 2 clients: convergence, owner RPC rejection, JoinTicket rejection, drain', {
  skip: godot.executable ? false : `Godot not found (${godot.reason || godot.source})`,
  timeout: 120000,
}, () => {
  const r = spawnSync(process.execPath, [runner, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 110000 });
  assert.equal(r.error, undefined, r.error && r.error.message);
  let summary;
  try {
    summary = JSON.parse(r.stdout);
  } catch {
    assert.fail(`runner output is not JSON (exit=${r.status}): ${r.stdout}\n${r.stderr}`);
  }
  const failed = summary.checks.filter((c) => !c.ok);
  assert.deepEqual(failed, [], `failed checks (evidence: ${summary.outDir})`);
  assert.equal(r.status, 0);
  for (const id of ['clients_converge_to_server', 'illegal_owner_rpc_rejected', 'ticket_ticket_reused', 'ticket_hmac_invalid',
    'ticket_slot_taken', 'ticket_draining', 'server_not_in_player_list', 'drain_waited_for_players', 'ticket_selftest']) {
    assert.ok(summary.checks.some((c) => c.id === id && c.ok), `${id} must pass`);
  }
});
