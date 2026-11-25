'use strict';
// 실행 모드: dedicated-server, listen-server, standalone, client 실행과 잘못된 인자 거부를 검증한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runner = path.resolve(__dirname, '../../Tools/dedicated-server/run-ds-2clients.cjs');
const { resolveGodot } = require(runner);
const godot = resolveGodot();
const PROJECT = path.resolve(__dirname, '../../Godot');
const SCENE = 'res://addons/playforge_netframework/demo/spike.tscn';
const hasDisplay = process.platform === 'win32' || !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const godotSkip = !godot.executable && `Godot not found (${godot.reason || godot.source})`;
const rendererSkip = godotSkip || (!hasDisplay && 'A graphical display is required for renderer mode coverage');

function freeUdpPort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });
}

function launch(name, { headless, modeArgs, timeoutMs = 10000 }) {
  const displayArgs = headless
    ? ['--headless']
    : ['--windowed', '--resolution', '480x270'];
  const child = spawn(godot.executable, [
    ...displayArgs,
    '--path', PROJECT,
    SCENE,
    '--',
    ...modeArgs,
  ], { cwd: PROJECT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const events = [];
  let output = '';
  let partialLine = '';
  const waiters = [];
  const capture = (stream) => stream.on('data', (chunk) => {
    const data = chunk.toString();
    output += data;
    const lines = (partialLine + data).split(/\r?\n/);
    partialLine = lines.pop();
    for (const line of lines) {
      const marker = line.indexOf('NETEV ');
      if (marker < 0) continue;
      try {
        const event = JSON.parse(line.slice(marker + 6));
        events.push(event);
        for (let i = waiters.length - 1; i >= 0; i -= 1) {
          if (waiters[i].predicate(event)) {
            clearTimeout(waiters[i].timer);
            waiters[i].resolve(event);
            waiters.splice(i, 1);
          }
        }
      } catch { /* Other Godot output is preserved in output. */ }
    }
  });
  capture(child.stdout);
  capture(child.stderr);

  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  function waitForExit(label = name) {
    let timer;
    return Promise.race([
      exited,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: process did not exit; output:\n${output}`)), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  function waitFor(predicate, label) {
    const found = events.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, timer: null };
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`${name}: timed out waiting for ${label}; output:\n${output}`));
      }, timeoutMs);
      waiters.push(waiter);
    });
  }
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    return exited;
  }
  return { child, events, get output() { return output; }, exited, waitFor, waitForExit, stop };
}

function assertGodotAvailable(t) {
  if (!godot.executable) t.skip(`Godot not found (${godot.reason || godot.source})`);
}

async function runTimedMode(name, options, eventName) {
  const proc = launch(name, options);
  try {
    const event = await proc.waitFor((e) => e.ev === eventName, `${eventName} event`);
    const exit = await proc.waitForExit();
    return { event, events: proc.events, exit, output: proc.output };
  } finally {
    await proc.stop();
  }
}

test('explicit dedicated-server and implicit headless default start an authority', {
  skip: godotSkip,
  timeout: 30000,
}, async () => {
  for (const [label, modeArgs, expectedMode] of [
    ['dedicated-server', ['--netmode=dedicated-server'], 'dedicated-server'],
    ['default-headless', [], 'dedicated-server'],
  ]) {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), `pf-net-${label}-`));
    const port = await freeUdpPort();
    try {
      const { event, events, exit, output } = await runTimedMode(label, {
        headless: true,
        modeArgs: [...modeArgs, `--port=${port}`, `--run-dir=${runDir}`, '--max-seconds=0.5'],
      }, 'server_listening');
      assert.equal(event.netMode, expectedMode, `${label}: ${output}`);
      assert.equal(event.rendered, false, `${label}: dedicated server must be headless`);
      assert.equal(event.serverIsPlayer, false, `${label}: authority must not create a player slot`);
      assert.equal(exit.code, 0, `${label}: ${output}`);
      assert.ok(events.some((e) => e.ev === 'server_exit' && e.code === 0), `${label}: missing clean server_exit`);
    } finally {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  }
});

test('netmode=listen-server uses a renderer and creates no automatic local slot', {
  skip: rendererSkip,
  timeout: 30000,
}, async () => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-net-listen-'));
  const port = await freeUdpPort();
  try {
    const { event, events, exit, output } = await runTimedMode('listen-server', {
      headless: false,
      modeArgs: ['--netmode=listen-server', `--port=${port}`, `--run-dir=${runDir}`, '--max-seconds=0.5'],
      timeoutMs: 20000,
    }, 'listen_server_ready');
    const listening = events.find((e) => e.ev === 'server_listening');
    assert.ok(listening, output);
    assert.equal(listening.netMode, 'listen-server', output);
    assert.equal(listening.rendered, true, `listen server must use a renderer: ${output}`);
    assert.notEqual(listening.displayServer, 'headless', output);
    assert.equal(listening.serverIsPlayer, false, output);
    assert.equal(event.localPlayer, false, output);
    assert.equal(events.some((e) => e.ev === 'player_joined'), false, 'listen server must not auto-join a local player');
    assert.equal(exit.code, 0, output);
  } finally {
    fs.rmSync(runDir, { recursive: true, force: true });
  }
});

test('netmode=standalone creates an offline local player and applies movement', {
  skip: godotSkip,
  timeout: 15000,
}, async () => {
  const { event, events, exit, output } = await runTimedMode('standalone', {
    headless: true,
    modeArgs: ['--netmode=standalone', '--bot=a', '--max-seconds=1'],
  }, 'standalone_ready');
  const progress = events.find((e) => e.ev === 'standalone_progress' && e.inputs > 0
    && Array.isArray(e.world.players) && e.world.players.some((p) => p.pos[0] > 100));
  assert.equal(event.localPlayer, true, output);
  assert.equal(event.network, false, output);
  assert.ok(progress, `offline input did not move the local Pawn: ${output}`);
  assert.equal(progress.netMode, 'standalone', output);
  assert.equal(progress.network, false, output);
  assert.ok(progress.inputs > 0, output);
  assert.equal(exit.code, 0, output);
});

test('invalid headless netmode arguments exit with code 2', {
  skip: godotSkip,
  timeout: 60000,
}, async () => {
  for (const [label, headless, modeArgs] of [
    ['listen-headless', true, ['--netmode=listen-server']],
    ['old-role', true, ['--role=server']],
    ['old-spelling', true, ['--net-mode=dedicated-server']],
    ['mixed-spelling', true, ['--netmode=dedicated-server', '--net-mode=dedicated-server']],
    ['unknown-mode', true, ['--netmode=unknown']],
  ]) {
    const proc = launch(label, { headless, modeArgs, timeoutMs: 12000 });
    try {
      const exit = await proc.waitForExit();
      assert.equal(exit.code, 2, `${label} should fail fast: ${proc.output}`);
    } finally {
      await proc.stop();
    }
  }
});

test('dedicated-server rejects a graphical launch', {
  skip: rendererSkip,
  timeout: 30000,
}, async () => {
  const proc = launch('dedicated-rendered', {
    headless: false,
    modeArgs: ['--netmode=dedicated-server'],
    timeoutMs: 20000,
  });
  try {
    const exit = await proc.waitForExit();
    assert.equal(exit.code, 2, `dedicated server should reject graphical mode: ${proc.output}`);
  } finally {
    await proc.stop();
  }
});
