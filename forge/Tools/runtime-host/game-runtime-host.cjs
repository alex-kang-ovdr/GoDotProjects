'use strict';

// Type 2 Isolated Authoritative Runtime Host & WSS Gateway (Game-Agnostic).
// Discovers server runtime configuration dynamically from each game package's metadata.json
// (`node-wss-v1` -> server/entry.cjs, `godot-linux-wss-v1` -> server/server.pck),
// spawns 1 isolated child process per session with sanitized env vars, enforces JoinTicket auth
// at the WSS Gateway, proxies WebSocket frames, and shuts down cleanly via SIGTERM.
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { WebSocket, WebSocketServer } = require('ws');
const {
  GAME_ID_RE,
  SERVER_RUNTIMES,
  normalizeRelayConfig,
  normalizeRuntimeConfig,
} = require('../../../tools/ugc-shared/publish-contract.cjs');
const {
  RelayTicketAuthority,
  resolveClientIp,
  extractTicketFromRequest,
} = require('../../../tools/ugc-shared/relay-ticket.cjs');

const DEFAULT_BOOT_TIMEOUT_MS = 10000;
const DEFAULT_STOP_TIMEOUT_MS = 5000;
const DEFAULT_MAX_SESSIONS = 32;
const DEFAULT_MAX_SOCKETS_PER_IP = 32;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function readGameManifest(gameDir) {
  const metaPath = path.join(gameDir, 'metadata.json');
  if (!fs.existsSync(metaPath)) return null;
  const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8').replace(/^\uFEFF/, ''));
  const dp = raw.publishDefaults?.deployProfile || raw.deployProfile || {};
  const runtime = SERVER_RUNTIMES.has(dp.serverRuntime) ? dp.serverRuntime : 'none';
  return {
    gameId: String(raw.id || path.basename(gameDir)),
    gameDir,
    deployMode: String(dp.deployMode || 'singleplay'),
    serverRuntime: runtime,
    relayConfig: normalizeRelayConfig(dp.relayConfig),
    runtimeConfig: normalizeRuntimeConfig(dp.runtimeConfig),
  };
}

function assertSafeChildPath(baseDir, relPath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, relPath);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new Error('UNSAFE_SERVER_ENTRY_PATH');
  }
  return resolvedTarget;
}

async function waitForHealth(port, timeoutMs = DEFAULT_BOOT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return true;
    } catch {
      // retry until ready
    }
    await new Promise(r => setTimeout(r, 60));
  }
  return false;
}

function writeUpgradeError(socket, status, reason) {
  try {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  } catch {
    try { socket.destroy(); } catch {}
  }
}

class GameRuntimeHost {
  constructor({
    templatesDir = path.resolve(__dirname, '../../Templates'),
    extraGameDirs = null,
    nodeExecutable = process.execPath,
    godotExecutable = process.env.GODOT_SERVER_BIN || '',
    controlPlaneUrl = '',
    ticketAuthority = null,
    ticketSecret = process.env.PLAYHUB_RELAY_TICKET_SECRET || '',
    requireTicket = true,
    trustedProxies = true,
    maxSessions = DEFAULT_MAX_SESSIONS,
    maxSocketsPerIp = DEFAULT_MAX_SOCKETS_PER_IP,
    bootTimeoutMs = DEFAULT_BOOT_TIMEOUT_MS,
    now = Date.now,
  } = {}) {
    this.templatesDir = path.resolve(templatesDir);
    this.extraGameDirs = new Map(extraGameDirs || []); // gameId -> absDir
    this.nodeExecutable = nodeExecutable;
    this.godotExecutable = godotExecutable;
    this.controlPlaneUrl = controlPlaneUrl;
    this.authority = ticketAuthority || new RelayTicketAuthority({
      secret: ticketSecret || crypto.randomBytes(32),
      now,
    });
    this.requireTicket = Boolean(requireTicket);
    this.trustedProxies = trustedProxies;
    this.maxSessions = maxSessions;
    this.maxSocketsPerIp = maxSocketsPerIp;
    this.bootTimeoutMs = bootTimeoutMs;
    this.now = now;

    this.sessions = new Map(); // sessionId -> SessionRecord
    this.socketsByIp = new Map();
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 64 * 1024,
      handleProtocols: protocols => {
        if (protocols.has('playhub.v1')) return 'playhub.v1';
        return false;
      },
    });
  }

  registerGameDir(gameId, absDir) {
    if (!GAME_ID_RE.test(gameId)) throw new Error('INVALID_GAME_ID');
    this.extraGameDirs.set(gameId, path.resolve(absDir));
  }

  resolveGameManifest(gameId) {
    if (!GAME_ID_RE.test(gameId)) return null;
    if (this.extraGameDirs.has(gameId)) {
      return readGameManifest(this.extraGameDirs.get(gameId));
    }
    const dir = path.join(this.templatesDir, gameId);
    if (!fs.existsSync(dir)) return null;
    return readGameManifest(dir);
  }

  listSupportedGames() {
    const out = [];
    const seen = new Set();
    for (const [gid, dir] of this.extraGameDirs.entries()) {
      const m = readGameManifest(dir);
      if (m && m.serverRuntime !== 'none') { out.push(m); seen.add(gid); }
    }
    if (fs.existsSync(this.templatesDir)) {
      for (const ent of fs.readdirSync(this.templatesDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || seen.has(ent.name)) continue;
        const m = readGameManifest(path.join(this.templatesDir, ent.name));
        if (m && m.serverRuntime !== 'none') out.push(m);
      }
    }
    return out;
  }

  async launchSession(gameId, { sessionId = '', idleTimeoutSec = null } = {}) {
    const manifest = this.resolveGameManifest(gameId);
    if (!manifest) throw new Error('GAME_NOT_FOUND');
    if (manifest.serverRuntime !== 'node-wss-v1' && manifest.serverRuntime !== 'godot-linux-wss-v1') {
      throw new Error(`UNSUPPORTED_TYPE2_RUNTIME:${manifest.serverRuntime}`);
    }
    if (this.sessions.size >= this.maxSessions) {
      throw new Error('RUNTIME_HOST_CAPACITY_FULL');
    }

    const sid = sessionId || crypto.randomBytes(6).toString('hex');
    if (this.sessions.has(sid)) {
      return this.publicSession(this.sessions.get(sid));
    }

    const port = await getFreePort();
    const idleSec = idleTimeoutSec || manifest.runtimeConfig.idleSleepSec || 180;
    const nodeModulesPaths = [
      path.resolve(__dirname, '../../node_modules'),
      path.join(manifest.gameDir, 'server', 'node_modules'),
    ].filter(p => fs.existsSync(p));

    // Sanitized minimal environment: NEVER forward host secrets, Hub cookies, or cloud credentials into game runtime.
    const sanitizedEnv = {
      PATH: process.env.PATH || '',
      SYSTEMROOT: process.env.SYSTEMROOT || '',
      TMP: process.env.TMP || process.env.TEMP || '/tmp',
      TEMP: process.env.TEMP || process.env.TMP || '/tmp',
      NODE_ENV: 'production',
      NODE_PATH: nodeModulesPaths.join(path.delimiter),
      PLAYHUB_PORT: String(port),
      PLAYHUB_HOST: '127.0.0.1',
      PLAYHUB_SESSION_ID: sid,
      PLAYHUB_GAME_ID: manifest.gameId,
      PLAYHUB_MAX_PLAYERS: String(manifest.runtimeConfig.maxPlayersPerSession),
      PLAYHUB_TICK_HZ: String(manifest.runtimeConfig.tickRateHz),
      PLAYHUB_IDLE_TIMEOUT_SEC: String(idleSec),
      ...(this.controlPlaneUrl ? { PLAYHUB_CONTROL_PLANE_URL: this.controlPlaneUrl } : {}),
    };

    let cmd;
    let args;
    if (manifest.serverRuntime === 'node-wss-v1') {
      if (!manifest.runtimeConfig.serverEntry) throw new Error('MISSING_SERVER_ENTRY');
      const entryAbs = assertSafeChildPath(manifest.gameDir, manifest.runtimeConfig.serverEntry);
      if (!fs.existsSync(entryAbs)) throw new Error('SERVER_ENTRY_NOT_FOUND');
      cmd = this.nodeExecutable;
      args = [entryAbs];
    } else {
      if (!this.godotExecutable) throw new Error('GODOT_SERVER_BIN_UNAVAILABLE');
      if (!manifest.runtimeConfig.serverPck) throw new Error('MISSING_SERVER_PCK');
      const pckAbs = assertSafeChildPath(manifest.gameDir, manifest.runtimeConfig.serverPck);
      if (!fs.existsSync(pckAbs)) throw new Error('SERVER_PCK_NOT_FOUND');
      cmd = this.godotExecutable;
      args = ['--headless', '--main-pack', pckAbs, '--', `--port=${port}`, `--session-id=${sid}`];
    }

    const child = spawn(cmd, args, {
      cwd: manifest.gameDir,
      env: sanitizedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const stderrChunks = [];
    child.stderr?.on('data', chunk => {
      if (stderrChunks.length < 32) stderrChunks.push(chunk.toString('utf8'));
    });

    const record = {
      sessionId: sid,
      gameId: manifest.gameId,
      runtime: manifest.serverRuntime,
      port,
      child,
      pid: child.pid,
      createdAt: this.now(),
      lastActivityAt: this.now(),
      state: 'starting',
      clients: new Set(),
      stderrChunks,
    };
    this.sessions.set(sid, record);

    child.once('exit', () => {
      record.state = 'stopped';
      for (const ws of record.clients) {
        try { ws.close(1012, 'Session stopped'); } catch {}
      }
      record.clients.clear();
      this.sessions.delete(sid);
    });

    const healthy = await waitForHealth(port, this.bootTimeoutMs);
    if (!healthy) {
      await this.stopSession(sid);
      throw new Error(`RUNTIME_BOOT_TIMEOUT:${stderrChunks.join('').slice(0, 300)}`);
    }
    record.state = 'running';
    return this.publicSession(record);
  }

  publicSession(rec) {
    return {
      sessionId: rec.sessionId,
      gameId: rec.gameId,
      runtime: rec.runtime,
      state: rec.state,
      wsPath: `/ws/runtime/${rec.sessionId}`,
      connectedClients: rec.clients.size,
      createdAt: rec.createdAt,
    };
  }

  async stopSession(sessionId) {
    const rec = this.sessions.get(sessionId);
    if (!rec) return false;
    rec.state = 'stopping';
    for (const ws of rec.clients) {
      try { ws.close(1001, 'Session closing'); } catch {}
    }
    rec.clients.clear();
    if (rec.child && rec.child.exitCode === null && !rec.child.killed) {
      await new Promise(resolve => {
        const timer = setTimeout(() => {
          try { rec.child.kill('SIGKILL'); } catch {}
          resolve();
        }, DEFAULT_STOP_TIMEOUT_MS);
        timer.unref();
        rec.child.once('exit', () => { clearTimeout(timer); resolve(); });
        try { rec.child.kill('SIGTERM'); } catch { clearTimeout(timer); resolve(); }
      });
    }
    this.sessions.delete(sessionId);
    return true;
  }

  async shutdown() {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map(id => this.stopSession(id)));
    try { this.wss.close(); } catch {}
  }

  handleUpgrade(req, socket, head) {
    let pathname = '';
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { return false; }
    const match = pathname.match(/^\/ws\/runtime\/([a-zA-Z0-9_-]{4,64})$/);
    if (!match) return false;

    const sessionId = match[1];
    const rec = this.sessions.get(sessionId);
    if (!rec || rec.state !== 'running') {
      writeUpgradeError(socket, 404, 'Session Not Found');
      return true;
    }

    const clientIp = resolveClientIp(req, { trustedProxies: this.trustedProxies });
    const ipCount = this.socketsByIp.get(clientIp) || 0;
    if (ipCount >= this.maxSocketsPerIp) {
      writeUpgradeError(socket, 503, 'Service Unavailable');
      return true;
    }

    let verified = null;
    const token = extractTicketFromRequest(req);
    if (this.requireTicket || token) {
      if (!token) {
        writeUpgradeError(socket, 401, 'Unauthorized');
        return true;
      }
      const check = this.authority.verify(token, {
        expectedGameId: rec.gameId,
        expectedRoomId: sessionId,
        expectedRuntime: rec.runtime,
        consume: true,
      });
      if (!check.ok) {
        writeUpgradeError(socket, 401, 'Unauthorized');
        return true;
      }
      verified = check.payload;
    }

    this.wss.handleUpgrade(req, socket, head, clientWs => {
      this.socketsByIp.set(clientIp, ipCount + 1);
      rec.clients.add(clientWs);
      rec.lastActivityAt = this.now();

      const upstreamHeaders = {};
      if (verified) {
        upstreamHeaders['X-PlayHub-Principal'] = verified.sub || '';
        upstreamHeaders['X-PlayHub-Display-Name'] = verified.name || '';
        upstreamHeaders['X-PlayHub-Platform'] = verified.platform || 'web';
        upstreamHeaders['X-PlayHub-Role'] = verified.role || 'player';
      }

      const upstream = new WebSocket(`ws://127.0.0.1:${rec.port}/`, { headers: upstreamHeaders });
      const pending = [];

      const cleanup = () => {
        if (rec.clients.delete(clientWs)) {
          const rem = (this.socketsByIp.get(clientIp) || 1) - 1;
          if (rem <= 0) this.socketsByIp.delete(clientIp);
          else this.socketsByIp.set(clientIp, rem);
        }
        try { if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(); } catch {}
        try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(); } catch {}
      };

      upstream.on('open', () => {
        for (const item of pending) {
          if (upstream.readyState === WebSocket.OPEN) upstream.send(item.data, { binary: item.isBinary });
        }
        pending.length = 0;
      });
      upstream.on('message', (data, isBinary) => {
        rec.lastActivityAt = this.now();
        if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
      });
      upstream.on('close', cleanup);
      upstream.on('error', cleanup);

      clientWs.on('message', (data, isBinary) => {
        rec.lastActivityAt = this.now();
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        } else if (pending.length < 32) {
          pending.push({ data, isBinary });
        }
      });
      clientWs.on('close', cleanup);
      clientWs.on('error', cleanup);
    });
    return true;
  }

  createStandaloneGatewayServer() {
    const server = http.createServer(async (req, res) => {
      const json = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      let url;
      try { url = new URL(req.url || '/', 'http://localhost'); } catch { return json(400, { ok: false }); }

      if (url.pathname === '/healthz' && req.method === 'GET') {
        return json(200, { ok: true, service: 'game-runtime-host-v1', activeSessions: this.sessions.size });
      }
      if (url.pathname === '/api/runtime/sessions' && req.method === 'GET') {
        return json(200, { ok: true, sessions: [...this.sessions.values()].map(s => this.publicSession(s)) });
      }
      if (url.pathname === '/api/runtime/sessions' && req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) { raw += chunk.toString('utf8'); if (raw.length > 8192) return json(413, { ok: false }); }
        try {
          const body = JSON.parse(raw || '{}');
          const session = await this.launchSession(String(body.gameId || ''), { sessionId: body.sessionId });
          return json(201, { ok: true, session });
        } catch (err) {
          return json(400, { ok: false, error: err.message });
        }
      }
      return json(404, { ok: false, error: 'NOT_FOUND' });
    });
    server.on('upgrade', (req, socket, head) => {
      if (!this.handleUpgrade(req, socket, head)) {
        writeUpgradeError(socket, 404, 'Not Found');
      }
    });
    server.on('close', () => { this.shutdown(); });
    return server;
  }
}

module.exports = {
  GameRuntimeHost,
  readGameManifest,
};
