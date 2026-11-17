'use strict';
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

function engineExecutable(executable) {
  // The Windows console executable is a launcher. Own the real engine process
  // so a blocked GDScript is terminated, rather than only its console wrapper.
  const direct = executable.replace(/_console\.exe$/i, '.exe');
  return direct !== executable && fs.existsSync(direct) ? direct : executable;
}
function findGodot(root) {
  if (process.env.GODOT_BIN) return engineExecutable(process.env.GODOT_BIN);
  const folders = [path.resolve(root, '..'), path.resolve(root, '../../..', 'GoDotProjects')];
  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    const name = fs.readdirSync(folder).filter(n => /^Godot_v4\..*_win64_console\.exe$/.test(n)).sort().at(-1);
    if (name) return engineExecutable(path.join(folder, name));
  }
  for (const name of ['godot', 'godot4']) {
    const found = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true });
    if (found.status === 0) return engineExecutable(found.stdout.trim().split(/\r?\n/)[0]);
  }
  throw new Error('Godot 4.7+ was not found. Set GODOT_BIN to its executable.');
}

class NativeRuntime {
  static availability(root) {
    try {
      const executable = findGodot(root);
      return { available: fs.existsSync(executable) && fs.existsSync(path.join(root, 'Godot/project.godot')), executable, engine: 'Godot' };
    } catch (error) { return { available: false, engine: 'Godot', error: error.message }; }
  }
  constructor(root, onClose = () => {}, options = {}) {
    this.executable = findGodot(root);
    if (!fs.existsSync(path.join(root, 'Godot/project.godot'))) throw new Error('Godot project is missing.');
    this.queue = []; this.pending = null; this.closed = false; this.onClose = onClose;
    this.diagnostics = ''; this.sequence = 0; this.socket = null; this.child = null;
    this.timeoutMs = options.timeoutMs || 3000;
    this.token = crypto.randomBytes(24).toString('hex');
    this.closedPromise = new Promise(resolve => { this.resolveClosed = resolve; });
    this.server = net.createServer(socket => this.accept(socket));
    this.connections = new Set();
    this.server.on('error', error => this.fail(error));
    this.startTimer = setTimeout(() => this.fail(new Error('Godot startup timed out: ' + this.diagnostics)), options.startupTimeoutMs || 15000);
    this.server.listen(0, '127.0.0.1', () => {
      if (this.closed) { if (this.server.listening) this.server.close(); return; }
      const args = ['--path', path.join(root, 'Godot'), '--rendering-method', 'gl_compatibility', '--audio-driver', 'Dummy'];
      if (options.headless ?? process.env.PLAYFORGE_HEADLESS === '1') args.push('--headless');
      args.push('--', '--bridge-port=' + this.server.address().port, '--bridge-token=' + this.token);
      if (options.realtime) args.push('--realtime');
      this.child = spawn(this.executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const record = data => { this.diagnostics = (this.diagnostics + data.toString()).slice(-12000); };
      this.child.stdout.on('data', record); this.child.stderr.on('data', record);
      this.child.on('error', error => this.fail(error));
      this.child.on('exit', (code, signal) => this.fail(new Error('Godot exited: ' + (code ?? signal) + ' ' + this.diagnostics)));
      this.child.on('close', () => this.resolveClosed());
    });
  }
  accept(socket) {
    if (this.closed || this.socket) { socket.destroy(); return; }
    this.connections.add(socket); socket.setNoDelay(true); socket.setEncoding('utf8');
    let buffer = '', authenticated = false;
    socket.setTimeout(5000, () => { if (!authenticated) socket.destroy(); });
    socket.on('error', error => { if (authenticated) this.fail(error); });
    socket.on('close', () => { this.connections.delete(socket); if (authenticated && !this.closed) this.fail(new Error('Godot bridge disconnected')); });
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 32 * 1024 * 1024) { this.fail(new Error('Godot response exceeded limit')); return; }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0 && !this.closed) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        let response;
        try { response = JSON.parse(line); } catch { socket.destroy(); if (authenticated) this.fail(new Error('Invalid Godot response')); return; }
        if (!authenticated) {
          if (response.token !== this.token || response.type !== 'ready' || this.socket) { socket.destroy(); return; }
          authenticated = true; socket.setTimeout(0); this.socket = socket;
          clearTimeout(this.startTimer); this.server.close(); this.pump(); continue;
        }
        const request = this.pending;
        if (!request || response.id !== request.id) { this.fail(new Error('Godot response order mismatch')); return; }
        clearTimeout(request.timer); this.pending = null;
        request.resolve(response.result); this.pump();
      }
    });
  }
  request(message) {
    if (this.closed) return Promise.reject(new Error('Runtime is stopped'));
    if (this.queue.length >= 10) return Promise.reject(new Error('Too many queued runtime commands'));
    let encoded;
    try { encoded = JSON.stringify({ id: ++this.sequence, command: message }); }
    catch (error) { return Promise.reject(error); }
    if (Buffer.byteLength(encoded) > 512000) return Promise.reject(new Error('Runtime command exceeds 512000 bytes'));
    return new Promise((resolve, reject) => { this.queue.push({ encoded, id: this.sequence, resolve, reject }); this.pump(); });
  }
  pump() {
    if (this.pending || this.closed || !this.socket || !this.queue.length) return;
    const request = this.pending = this.queue.shift();
    request.timer = setTimeout(() => this.fail(new Error('Godot script execution timed out')), this.timeoutMs);
    this.socket.write(request.encoded + '\n');
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.startTimer);
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = null; }
    for (const request of this.queue.splice(0)) request.reject(error);
    for (const socket of this.connections) socket.destroy();
    if (this.server.listening) this.server.close();
    if (this.child && this.child.exitCode === null && !this.child.killed) this.child.kill();
    if (!this.child) this.resolveClosed();
    this.onClose();
  }
  close() { this.fail(new Error('Runtime stopped')); return this.closedPromise; }
}
module.exports = { NativeRuntime, GodotRuntime: NativeRuntime, findGodot };
