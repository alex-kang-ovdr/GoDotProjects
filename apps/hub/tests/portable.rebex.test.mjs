import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {launchRebex} from '../portable/rebex.mjs';

function launchTestGuard(t, announcement) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-rebex-test-'));
  const directory = path.join(root, 'portable');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'rebex-guard.ps1'), [
    'param([string]$ExecutablePath)',
    `[Console]::WriteLine('${announcement}')`,
    '[void][Console]::In.ReadLine()',
  ].join('\n'));
  const server = launchRebex({appRoot:root, rebex:{directory, executable:'unused.exe'}, userRoot:root, userPort:8080});
  const closed = once(server.child, 'close');
  t.after(async () => {
    if (server.child.exitCode === null && server.child.signalCode === null) server.child.kill();
    try { await closed; }
    finally { fs.rmSync(root, {recursive:true, force:true}); }
  });
  return {server, closed};
}

test('Rebex startup timeout and launcher cleanup share one shutdown', {skip:process.platform !== 'win32', timeout:10000}, async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const {server, closed} = launchTestGuard(t, 'waiting for shutdown');
  const failed = assert.rejects(server.started, {message:'REBEX_PROCESS_START_FAILED'});
  await once(server.child.stdout, 'data');

  t.mock.timers.tick(20000);
  await failed;
  await server.stop();
  assert.deepEqual(await closed, [0, null]);
});

test('Rebex graceful shutdown is idempotent before and after the guard exits', {skip:process.platform !== 'win32', timeout:10000}, async t => {
  const {server, closed} = launchTestGuard(t, '{"type":"rebex-process","pid":123}');
  assert.deepEqual(await server.started, {pid:123, supervisorPid:server.child.pid});

  const stopping = server.stop();
  assert.equal(server.stop(), stopping);
  await stopping;
  assert.deepEqual(await closed, [0, null]);
  await server.stop();
});
