import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const exeExt = process.platform === 'win32' ? '.exe' : '';
const bootstrapperExe = path.join(repoRoot, 'native', 'target', 'release', `playhub-bootstrapper${exeExt}`);

/**
 * In-process mock Hub Common Auth Service implementing `contracts/desktop/launch-ticket.v1.schema.json`.
 * Used to verify L9 (Launch Ticket misuse: valid exchange, replay, expiry, gameId/os/arch binding).
 */
function startMockLaunchTicketServer() {
  const tickets = new Map();

  function issue({ gameId, os = 'windows', arch = 'x86_64', ttlSec = 60, expired = false }) {
    const ticket = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    const expiresAtMs = expired ? now - 5_000 : now + ttlSec * 1000;
    tickets.set(ticket, {
      ticket,
      gameId,
      os,
      arch,
      expiresAtMs,
      used: false,
    });
    return {
      version: 1,
      ticket,
      gameId,
      os,
      arch,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ttlSec,
      singleUse: true,
      deepLink: `playhub://launch?ticket=${ticket}`,
    };
  }

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/launch-tickets/exchange') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'NOT_FOUND' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'BAD_JSON' }));
        return;
      }

      const rec = tickets.get(payload.ticket);
      if (!rec) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'TICKET_UNKNOWN' }));
        return;
      }
      if (rec.used) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'TICKET_REPLAY' }));
        return;
      }
      if (Date.now() > rec.expiresAtMs) {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'TICKET_EXPIRED' }));
        return;
      }
      if (payload.gameId !== rec.gameId || payload.os !== rec.os || payload.arch !== rec.arch) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'TICKET_BINDING_MISMATCH' }));
        return;
      }

      // Atomic single-use consumption
      rec.used = true;
      const sessionToken = crypto.randomBytes(32).toString('base64url');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        version: 1,
        sessionToken,
        sessionExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
        gameId: rec.gameId,
        manifestUrl: `https://cdn.playhub.local/games/${rec.gameId}/manifest.json`,
        profile: {
          displayName: 'Test Player',
          handle: '@tester',
          isGuest: false,
          ageTier: 'ADULT',
          locale: 'ko-KR',
        },
      }));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({
        apiBase: `http://127.0.0.1:${addr.port}`,
        issue,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function runBootstrapper(args) {
  try {
    const { stdout, stderr } = await execFileAsync(bootstrapperExe, args, { encoding: 'utf8' });
    return { code: 0, stdout, stderr };
  } catch (err) {
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

test('L9 Launch Ticket end-to-end misuse rejection via real playhub-bootstrapper', { skip: !fs.existsSync(bootstrapperExe) }, async () => {
  const srv = await startMockLaunchTicketServer();
  const hostOs = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  const hostArch = process.arch === 'arm64' ? 'arm64' : 'x86_64';

  try {
    // 1. Valid single-use exchange succeeds & redacts raw sessionToken from stdout
    const issued = srv.issue({ gameId: 'survivor-arena-g2', os: hostOs, arch: hostArch });
    const ok = await runBootstrapper(['exchange-ticket', '--api-base', srv.apiBase, '--ticket', issued.ticket, '--game-id', 'survivor-arena-g2']);
    assert.equal(ok.code, 0, ok.stderr);
    const parsed = JSON.parse(ok.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.gameId, 'survivor-arena-g2');
    assert.equal(parsed.sessionTokenPresent, true);
    assert.equal('sessionToken' in parsed, false, 'raw sessionToken must not be printed');

    // 2. Replay attack must be rejected (HTTP 409)
    const replay = await runBootstrapper(['exchange-ticket', '--api-base', srv.apiBase, '--ticket', issued.ticket, '--game-id', 'survivor-arena-g2']);
    assert.notEqual(replay.code, 0);
    assert.match(replay.stderr, /409|TICKET_REPLAY/);

    // 3. Expired ticket must be rejected (HTTP 410)
    const expired = srv.issue({ gameId: 'survivor-arena-g2', os: hostOs, arch: hostArch, expired: true });
    const expRes = await runBootstrapper(['exchange-ticket', '--api-base', srv.apiBase, '--ticket', expired.ticket, '--game-id', 'survivor-arena-g2']);
    assert.notEqual(expRes.code, 0);
    assert.match(expRes.stderr, /410|TICKET_EXPIRED/);

    // 4. Wrong gameId binding must be rejected (HTTP 403)
    const bound = srv.issue({ gameId: 'survivor-arena-g2', os: hostOs, arch: hostArch });
    const wrongGame = await runBootstrapper(['exchange-ticket', '--api-base', srv.apiBase, '--ticket', bound.ticket, '--game-id', 'other-game']);
    assert.notEqual(wrongGame.code, 0);
    assert.match(wrongGame.stderr, /403|TICKET_BINDING_MISMATCH/);

    // 5. Wrong OS binding must be rejected (HTTP 403)
    const wrongOs = await runBootstrapper([
      'exchange-ticket', '--api-base', srv.apiBase,
      '--ticket', bound.ticket, '--game-id', 'survivor-arena-g2',
      '--os', hostOs === 'windows' ? 'linux' : 'windows',
    ]);
    assert.notEqual(wrongOs.code, 0);
    assert.match(wrongOs.stderr, /403|TICKET_BINDING_MISMATCH/);

    // 6. DeepLink carrying access_token must be rejected by parse-deeplink
    const badLink = await runBootstrapper(['parse-deeplink', `${issued.deepLink}&access_token=leaked`]);
    assert.notEqual(badLink.code, 0);
    assert.match(badLink.stderr, /forbidden parameter: access_token/);
  } finally {
    await srv.close();
  }
});
