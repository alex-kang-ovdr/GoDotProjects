#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { parseArgs } = require('node:util');
const { once } = require('node:events');
const { setTimeout: sleep } = require('node:timers/promises');
const { resolveGodot, freeUdpPort } = require('./run-ds-2clients.cjs');
const { NetEmulationProxy } = require('./net-emulation-proxy.cjs');

const forge = path.resolve(__dirname, '../..');
const scene = 'res://addons/playforge_netframework/demo/spike.tscn';
const usage = [
  'NetEmulation.PktLag <0..2000 ms> / NetEmulation.PktLoss <0..100 %> (outgoing)',
  'NetEmulation.PktIncomingLag <ms> / NetEmulation.PktIncomingLoss <%> (incoming)',
  'NetEmulation.Off / NetEmulation.Status / netprofile / stat net / quit',
  'Terminal default: all clients, client perspective. Prefix a, b or server to select a viewpoint.',
].join('\n');

function profileReport(profiles, target) {
  const lines = [];
  for (const [id, sample] of Object.entries(profiles)) {
    if (target !== 'all' && target !== id) continue;
    const e = sample.enet;
    lines.push(`[${id}] ${Math.round(sample.windowMs)} ms | TX ${e.sentBytes.perSec.toFixed(0)} B/s, ${e.sentPackets.perSec.toFixed(1)} pkt/s | RX ${e.receivedBytes.perSec.toFixed(0)} B/s, ${e.receivedPackets.perSec.toFixed(1)} pkt/s`);
    for (const [method, stats] of Object.entries(sample.rpc)) {
      const { sent, received, sent_bytes, received_bytes } = stats;
      const bytes = sent_bytes && received_bytes
        ? ` | RPC bytes: TX ${sent_bytes.total} B (${sent_bytes.perSec.toFixed(1)} B/s), RX ${received_bytes.total} B (${received_bytes.perSec.toFixed(1)} B/s)`
        : '';
      lines.push(`  ${method}: sent ${sent.total} (${sent.perSec.toFixed(1)}/s), received ${received.total} (${received.perSec.toFixed(1)}/s)${bytes}`);
    }
  }
  return lines.join('\n') || 'Waiting for first profile sample';
}

async function main() {
  const { values } = parseArgs({ options: {
    godot: { type: 'string' }, seed: { type: 'string', default: '1' },
    'windowed-client': { type: 'boolean' }, 'listen-server': { type: 'boolean' },
    help: { type: 'boolean' },
  } });
  if (values.help) { console.log('run-net-lab.cjs [--windowed-client] [--listen-server] [--seed N] [--godot PATH]\n' + usage); return; }
  const seed = Number(values.seed);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('--seed must be uint32');
  const { executable } = resolveGodot(values.godot);
  if (!executable) throw new Error('No Godot executable; pass --godot PATH');
  const base = path.join(forge, 'Saved', 'Tests', 'netframework');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'net-lab-'));
  const control = path.join(dir, 'control');
  fs.mkdirSync(control);
  const port = await freeUdpPort();
  const proxy = new NetEmulationProxy({ backendHost: '127.0.0.1', backendPort: port, seed });
  const children = new Map();
  const profiles = {};
  let commands, seq = 0, stopping = false, ready = false, cleanExitRequested = false;
  const stop = Promise.withResolvers();
  const tickets = Promise.withResolvers();
  const playing = Promise.withResolvers();
  function record(file, data) { fs.appendFileSync(path.join(dir, file), JSON.stringify(data) + '\n'); }
  function reply(id, message) {
    if (!children.has(id)) return;
    const filename = path.join(control, id + '-reply.json');
    fs.writeFileSync(filename + '.tmp', JSON.stringify({ seq: ++seq, message }));
    fs.renameSync(filename + '.tmp', filename);
  }
  function command(line, source = 'terminal') {
    let words = line.trim().split(/\s+/);
    if (!words[0]) return;
    let target = source === 'terminal' ? 'all' : source;
    if (source === 'terminal' && ['all', 'server', 'a', 'b'].includes(words[0])) target = words.shift();
    const name = words.shift()?.toLowerCase();
    const client = ['a', 'b'].includes(target) ? target : null;
    let result;
    try {
      if (name === 'help' && !words.length) result = usage;
      else if (source === 'terminal' && name === 'quit' && !words.length) { stop.resolve(); return; }
      else if ((name === 'netprofile' && !words.length) || (name === 'stat' && words.join(' ').toLowerCase() === 'net')) {
        result = profileReport(profiles, target);
      } else if (name === 'netemulation.status' && !words.length) result = proxy.metrics();
      else if (name === 'netemulation.off' && !words.length) {
        proxy.reconfigure({ delayMs: 0, lossRate: 0 }, 'both', client);
        result = 'Emulation off for ' + target;
      } else {
        const match = /^netemulation\.pkt(incoming)?(lag|loss)$/.exec(name);
        if (!match || words.length !== 1 || !/^\d+(?:\.\d+)?$/.test(words[0])) throw new Error('Unknown command or invalid value. Type help.');
        const loss = match[2] === 'loss';
        const value = Number(words[0]);
        if (value > (loss ? 100 : 2000) || (!loss && !Number.isInteger(value))) throw new Error('Expected 0..100% loss or 0..2000 whole milliseconds.');
        const direction = Boolean(match[1]) === (target === 'server') ? 'up' : 'down';
        proxy.reconfigure(loss ? { lossRate: value / 100 } : { delayMs: value }, direction, client);
        result = { target, direction, [loss ? 'lossPercent' : 'delayMs']: value };
      }
      record('commands.jsonl', { at: Date.now(), source, target, command: line, applied: true });
    } catch (e) { result = 'Error: ' + e.message; }
    const message = typeof result === 'string' ? result : JSON.stringify(result);
    console.log(message);
    if (source !== 'terminal') reply(source, message);
  }

  function launch(id, mode, windowed, args) {
    const child = spawn(executable, [...(windowed ? [] : ['--headless']), '--path', path.join(forge, 'Godot'), scene, '--',
      '--netmode=' + mode, '--net-debug', '--net-debug-proxy', '--net-profile', '--net-debug-reply=' + path.join(control, id + '-reply.json'),
      '--max-seconds=0', ...args], { windowsHide: !windowed, stdio: ['ignore', 'pipe', 'pipe'] });
    const closed = once(child, 'close').catch(() => []);
    children.set(id, { child, closed });
    child.on('error', (e) => stop.resolve(id + ': ' + e.message));
    child.on('close', (code) => { if (!stopping) stop.resolve(id + ' exited (' + code + ')'); });
    for (const pipe of [child.stdout, child.stderr]) {
      readline.createInterface({ input: pipe }).on('line', (line) => {
        fs.appendFileSync(path.join(dir, id + '.log'), line + '\n');
        if (line.includes('SCRIPT ERROR:') || line.startsWith('ERROR: Failed to load script')) {
          stop.resolve(id + ': ' + line);
        }
        if (!line.startsWith('NETEV ')) return;
        let ev;
        try { ev = JSON.parse(line.slice(6)); } catch { return; }
        if (id === 'server' && ev.ev === 'tickets_issued') tickets.resolve();
        if (id === 'server' && ev.ev === 'phase' && ev.to === 'play') playing.resolve();
        if (ev.ev === 'net_profile_sample') {
          profiles[id] = ev;
          record('profile.jsonl', { process: id, ...ev });
        }
        if (ready && ev.ev === 'net_debug_command' && typeof ev.command === 'string') command(ev.command, id);
      });
    }
  }
  async function waitReady(signal, label) {
    let timer;
    try {
      await Promise.race([signal.promise, stop.promise.then((why) => { throw new Error(why || 'Stopped during startup'); }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout: ' + label)), 30000); })]);
    } finally { clearTimeout(timer); }
  }
  const interrupt = () => stop.resolve();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  console.log('Evidence: ' + dir);
  try {
    await proxy.start();
    launch('server', values['listen-server'] ? 'listen-server' : 'dedicated-server', values['listen-server'],
      ['--port=' + port, '--run-dir=' + dir, '--play-ticks=0']);
    await waitReady(tickets, 'server ready');
    for (const id of ['a', 'b']) {
      const front = await proxy.addClient({ id });
      const windowed = id === 'a' && values['windowed-client'];
      launch(id, 'client', windowed, ['--port=' + front.port, '--ticket=' + path.join(dir, 'tickets', 'bot-' + id + '.ticket'),
        ...(windowed ? [] : ['--bot=a'])]);
    }
    await waitReady(playing, 'two clients joined');
    ready = true;
    console.log('NET_LAB_READY\n' + usage);
    commands = readline.createInterface({ input: process.stdin });
    commands.on('line', (line) => command(line));
    commands.on('close', interrupt);
    const why = await stop.promise;
    if (why) throw new Error(why);
    cleanExitRequested = true;
  } finally {
    ready = false;
    stopping = true;
    commands?.close();
    try {
      if (children.has('server')) {
        proxy.reconfigure({ delayMs: 0, lossRate: 0 }, 'both', null);
        fs.writeFileSync(path.join(control, 'drain'), 'quit\n');
        const exited = Promise.all(Array.from(children.values(), (p) => p.closed));
        await Promise.race([exited, sleep(7000, null, { ref: false })]);
      }
    } finally {
      const forced = [];
      for (const [id, { child }] of children) {
        if (child.exitCode === null && child.signalCode === null) { forced.push(id); child.kill(); }
      }
      await Promise.all(Array.from(children.values(), (p) => p.closed));
      const exits = Object.fromEntries(Array.from(children, ([id, { child }]) => [id, child.exitCode]));
      const finalMetrics = proxy.metrics();
      await proxy.close();
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ seed, exits, forced, proxy: finalMetrics, profiles }, null, 2));
      process.removeListener('SIGINT', interrupt);
      process.removeListener('SIGTERM', interrupt);
      if (cleanExitRequested && (forced.length || Object.values(exits).some((code) => code !== 0))) {
        throw new Error('Match did not finish cleanly. See ' + dir);
      }
    }
  }
}
main().catch((err) => { console.error(err.message); process.exitCode = 1; });
