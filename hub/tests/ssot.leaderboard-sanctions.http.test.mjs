import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { computePeriodKey } from '../server/ssot/leaderboard.mjs';
import { createBackup } from '../tools/backup.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const userOrigin = 'http://127.0.0.1:8080';
const adminOrigin = 'http://127.0.0.1:8081';
const password = 'isolated-test-password';

class Client {
  constructor(port, origin) {
    this.port = port;
    this.origin = origin;
    this.jar = new Map();
    this.csrf = null;
  }

  headers(method, hasBody, csrf = true, extra = {}) {
    const headers = { ...(this.origin ? { Origin: this.origin } : {}), ...extra };
    if (this.jar.size) headers.Cookie = [...this.jar.values()].join('; ');
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (csrf && this.csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    return headers;
  }

  cookieHeader() {
    return [...this.jar.values()].join('; ');
  }

  async call(target, { method = 'GET', body, csrf = true, headers = {} } = {}) {
    const response = await fetch('http://127.0.0.1:' + this.port + target, {
      method,
      headers: this.headers(method, body !== undefined, csrf, headers),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const token = value.split(';')[0];
      this.jar.set(token.split('=')[0], token);
    }
    const data = await response.json();
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data };
  }
}

async function fixture(t, initialTime = Date.UTC(2026, 10, 21, 12, 0, 0), extraConfig = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-ssot-'));
  const dataDir = path.join(root, 'data');
  const configPath = path.join(root, 'config.json');
  const entries = ['one', 'two'].map(id => ({ id, path: 'games/' + id, enabled: true }));
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.writeFileSync(path.join(root, 'catalog/games.json'), JSON.stringify({ schemaVersion: 1, entries }));
  for (const { id, path: relative } of entries) {
    fs.mkdirSync(path.join(root, relative), { recursive: true });
    fs.writeFileSync(path.join(root, relative, 'game.manifest.json'), JSON.stringify({ id, entry: 'index.html', title: { en: id } }));
  }
  const salt = 'b'.repeat(32);
  const config = {
    publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0,
    userOrigins: [userOrigin], adminOrigins: [adminOrigin], userBaseUrl: userOrigin, dataDir,
    admin: { username: 'admin', salt, passwordHash: scryptSync(password, salt, 64).toString('hex') },
    ...extraConfig,
  };
  fs.writeFileSync(configPath, JSON.stringify(config));
  let nowMs = initialTime;
  const clock = () => { nowMs += 10; return nowMs; };
  const app = createApp(config, { rootDir: root, platformRoot: repoRoot, clock });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  const { public: publicServer, admin: adminServer } = await app.listen();
  return {
    root, dataDir, configPath, config, app, db: app.db,
    now: () => nowMs,
    setNow: ms => { nowMs = ms; },
    visitor: () => new Client(publicServer.port, userOrigin),
    admin: new Client(adminServer.port, adminOrigin),
    internal: new Client(adminServer.port, null),
  };
}

async function loginAdmin(admin) {
  assert.equal((await admin.call('/api/admin/session')).status, 200);
  assert.equal((await admin.call('/api/admin/login', { method: 'POST', body: { username: 'admin', password } })).status, 200);
}

async function startPlay(client, gameId = 'one') {
  assert.equal((await client.call('/api/session')).status, 200);
  const play = await client.call('/api/play-sessions', { method: 'POST', body: { gameId } });
  assert.equal(play.status, 201, JSON.stringify(play.data));
  return play.data.id;
}

test('leaderboard SSOT: anonymous reads, play-session verified score submission, idempotency, and restart persistence', async t => {
  const f = await fixture(t);
  const p1 = f.visitor(), p2 = f.visitor(), anon = f.visitor();

  // Anonymous read auto-provisions default board cleanly
  const initial = await anon.call('/api/games/one/leaderboards/default');
  assert.equal(initial.status, 200);
  assert.equal(initial.data.total, 0);
  assert.equal(initial.data.board.boardKey, 'default');
  assert.equal(initial.data.periodKey, 'all');

  const play1 = await startPlay(p1, 'one');
  const play2 = await startPlay(p2, 'one');

  // Missing idempotency key rejected
  const noKey = await p1.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST', body: { playSessionId: play1, score: 1500 },
  });
  assert.equal(noKey.status, 400);

  // Submit scores for p1 and p2
  const s1 = await p1.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'run-p1-score-0001' },
    body: { playSessionId: play1, score: 1500, tieBreakerMs: 4200, metadata: { wave: 7 } },
  });
  assert.equal(s1.status, 201, JSON.stringify(s1.data));
  assert.equal(s1.data.improved, true);
  assert.equal(s1.data.rank, 1);

  // Exact idempotent replay returns 200 without duplicating submission_count
  const replay = await p1.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'run-p1-score-0001' },
    body: { playSessionId: play1, score: 1500, tieBreakerMs: 4200, metadata: { wave: 7 } },
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.idempotentReplay, true);

  // Conflicting payload on same idempotency key returns 409
  const conflict = await p1.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'run-p1-score-0001' },
    body: { playSessionId: play1, score: 9999 },
  });
  assert.equal(conflict.status, 409);

  // Lower score in best mode does not overwrite high score
  const lower = await p1.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'run-p1-score-0002' },
    body: { playSessionId: play1, score: 800 },
  });
  assert.equal(lower.status, 201);
  assert.equal(lower.data.improved, false);
  assert.equal(lower.data.entry.score, 1500);
  assert.equal(lower.data.entry.submissionCount, 2);

  // p2 takes #1 rank
  const s2 = await p2.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'run-p2-score-0001' },
    body: { playSessionId: play2, score: 2500 },
  });
  assert.equal(s2.status, 201);
  assert.equal(s2.data.rank, 1);

  // p1 sees rank 2 and me object
  const boardView = await p1.call('/api/games/one/leaderboards/default');
  assert.equal(boardView.status, 200);
  assert.equal(boardView.data.total, 2);
  assert.equal(boardView.data.entries[0].score, 2500);
  assert.equal(boardView.data.entries[1].score, 1500);
  assert.equal(boardView.data.me.rank, 2);

  // Online backup & restore validation accepts SSOT tables cleanly
  const backup = await createBackup({ configPath: f.configPath, out: path.join(f.root, 'backup.sqlite') });
  const inspected = inspectDatabase(backup.path);
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');

  // Restart server from the same SQLite dataDir and verify persistence
  await f.app.close();
  const restarted = createApp(f.config, { rootDir: f.root, clock: () => Date.UTC(2026, 10, 21, 13, 0, 0) });
  try {
    const ports = await restarted.listen();
    const reader = new Client(ports.public.port, userOrigin);
    const persisted = await reader.call('/api/games/one/leaderboards/default');
    assert.equal(persisted.status, 200);
    assert.equal(persisted.data.total, 2);
    assert.equal(persisted.data.entries[0].score, 2500);
    assert.equal(persisted.data.entries[1].score, 1500);
  } finally {
    await restarted.close();
  }
});

test('custom asc/weekly board, anti-cheat bounds/minPlayMs, QA traffic isolation, and snapshot export', async t => {
  const f = await fixture(t, Date.UTC(2026, 10, 21, 12, 0, 0));
  await loginAdmin(f.admin);

  // Configure custom time-attack board (asc, weekly, maxScoreBound=600000, minPlayMs=5000)
  const cfg = await f.admin.call('/api/admin/games/one/leaderboards/time_attack', {
    method: 'PUT',
    body: { sortOrder: 'asc', scoreMode: 'best', resetPeriod: 'weekly', maxScoreBound: 600000, minPlayMs: 5000 },
  });
  assert.equal(cfg.status, 201, JSON.stringify(cfg.data));
  assert.equal(cfg.data.board.sortOrder, 'asc');
  assert.equal(cfg.data.board.resetPeriod, 'weekly');

  const p1 = f.visitor(), p2 = f.visitor(), qa = f.visitor();
  const play1 = await startPlay(p1, 'one');
  const play2 = await startPlay(p2, 'one');

  // QA session submits to QA dataset, isolated from live
  assert.equal((await qa.call('/api/session')).status, 200);
  assert.equal((await qa.call('/api/qa/session', { method: 'POST', body: {} })).status, 201);
  const qaPlay = (await qa.call('/api/play-sessions', { method: 'POST', body: { gameId: 'one' } })).data.id;

  // Min play time rejection before active_ms threshold is met
  const tooFast = await p1.call('/api/games/one/leaderboards/time_attack/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ta-p1-too-fast-01' },
    body: { playSessionId: play1, score: 12000 },
  });
  assert.equal(tooFast.status, 422);
  assert.equal(tooFast.data.error.code, 'MIN_PLAY_TIME_NOT_MET');

  // Simulate validated active play time on play sessions
  f.db.prepare('UPDATE play_sessions SET active_ms=10000 WHERE id IN (?,?,?)').run(play1, play2, qaPlay);

  // Out-of-bounds score rejected and logged
  const cheat = await p1.call('/api/games/one/leaderboards/time_attack/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ta-p1-cheat-0001' },
    body: { playSessionId: play1, score: 9999999 },
  });
  assert.equal(cheat.status, 422);
  assert.equal(cheat.data.error.code, 'SCORE_OUT_OF_BOUNDS');

  // Valid asc times: 15000ms beats 20000ms
  const r1 = await p1.call('/api/games/one/leaderboards/time_attack/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ta-p1-valid-0001' },
    body: { playSessionId: play1, score: 20000 },
  });
  assert.equal(r1.status, 201);

  const r2 = await p2.call('/api/games/one/leaderboards/time_attack/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ta-p2-valid-0001' },
    body: { playSessionId: play2, score: 15000 },
  });
  assert.equal(r2.status, 201);
  assert.equal(r2.data.rank, 1);

  // QA score is accepted in QA traffic_type without leaking into live leaderboard
  const rQa = await qa.call('/api/games/one/leaderboards/time_attack/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'ta-qa-valid-0001' },
    body: { playSessionId: qaPlay, score: 1000 },
  });
  assert.equal(rQa.status, 201);
  assert.equal(rQa.data.rank, 1);

  const expectedWeek = computePeriodKey('weekly', Date.UTC(2026, 10, 21, 12, 0, 0));
  const liveView = await f.visitor().call('/api/games/one/leaderboards/time_attack');
  assert.equal(liveView.data.periodKey, expectedWeek);
  assert.equal(liveView.data.total, 2);
  assert.equal(liveView.data.entries[0].score, 15000);
  assert.equal(liveView.data.entries[1].score, 20000);

  // Admin snapshot exports live entries with deterministic SHA-256 digest
  const snap = await f.admin.call('/api/admin/games/one/leaderboards/time_attack/snapshot');
  assert.equal(snap.status, 200);
  assert.equal(snap.data.totalEntries, 2);
  assert.match(snap.data.sha256, /^[a-f0-9]{64}$/);

  // Advance into next week: old week stays permanently queryable while new week starts clean
  f.setNow(Date.UTC(2026, 10, 28, 12, 0, 0));
  const nextWeekView = await f.visitor().call('/api/games/one/leaderboards/time_attack');
  assert.notEqual(nextWeekView.data.periodKey, expectedWeek);
  assert.equal(nextWeekView.data.total, 0);
  const archiveView = await f.visitor().call(`/api/games/one/leaderboards/time_attack?period=${expectedWeek}`);
  assert.equal(archiveView.data.total, 2);
});

test('user sanctions master SSOT blocks/hides leaderboard entries, tracks EOS sync status, and survives guest merge', async t => {
  const f = await fixture(t);
  await loginAdmin(f.admin);

  const cheater = f.visitor(), honest = f.visitor();
  const playC = await startPlay(cheater, 'one');
  const playH = await startPlay(honest, 'one');

  const cSub = await cheater.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'sanction-c-0001' },
    body: { playSessionId: playC, score: 9000 },
  });
  assert.equal(cSub.status, 201);
  const cheaterId = cSub.data.entry.principalId;

  const hSub = await honest.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'sanction-h-0001' },
    body: { playSessionId: playH, score: 3000 },
  });
  assert.equal(hSub.status, 201);
  assert.equal(hSub.data.rank, 2);

  // Admin issues a platform-wide sanction with EOS target PUID -> eosSyncStatus='pending'
  const sanctioned = await f.admin.call('/api/admin/sanctions', {
    method: 'POST',
    body: {
      principalId: cheaterId,
      scope: 'all',
      action: 'ban',
      reason: 'Confirmed score tampering',
      eosTargetPuid: '0002a1b2c3d4e5f6',
    },
  });
  assert.equal(sanctioned.status, 201, JSON.stringify(sanctioned.data));
  assert.equal(sanctioned.data.sanction.eosSyncStatus, 'pending');

  // Public leaderboard hides cheater immediately; honest player becomes rank 1
  const board = await honest.call('/api/games/one/leaderboards/default');
  assert.equal(board.data.total, 1);
  assert.equal(board.data.entries[0].score, 3000);
  assert.equal(board.data.me.rank, 1);

  // Cheater sees own restriction via /api/me/sanctions and cannot submit new scores
  const mySanctions = await cheater.call('/api/me/sanctions');
  assert.equal(mySanctions.status, 200);
  assert.equal(mySanctions.data.sanctions.length, 1);

  const blocked = await cheater.call('/api/games/one/leaderboards/default/scores', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'sanction-c-0002' },
    body: { playSessionId: playC, score: 9500 },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, 'LEADERBOARD_SANCTIONED');

  // Merging guest into a registered account via real /api/auth/merge preserves both scores AND active sanctions (no ban evasion)
  const account = f.visitor();
  await account.call('/api/session');
  const targetUserId = 'google-user-target-1';
  const mergeNow = Date.UTC(2026, 10, 21, 12, 0, 0);
  f.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?, 'registered', 'MergedPlayer', ?)").run(targetUserId, mergeNow);
  f.db.prepare("UPDATE sessions SET principal_id=? WHERE principal_id IS NULL").run(targetUserId);
  f.db.prepare("INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)").run('merge-ssot-1', cheaterId, targetUserId, 'src-sub', 'dst-sub', 'pending', mergeNow + 3600000, null);
  const merged = await account.call('/api/auth/merge', { method: 'POST', body: { consent: true, mergeId: 'merge-ssot-1' } });
  assert.equal(merged.status, 200, JSON.stringify(merged.data));
  const transferred = f.db.prepare('SELECT principal_id, active FROM user_sanctions WHERE id=?').get(sanctioned.data.sanction.id);
  assert.equal(transferred.principal_id, targetUserId);
  assert.equal(transferred.active, 1);

  // Revoking sanction restores visibility cleanly
  const revoked = await f.admin.call(`/api/admin/sanctions/${sanctioned.data.sanction.id}/revoke`, {
    method: 'POST',
    body: { reason: 'Appeal approved' },
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.sanction.active, false);

  const restoredBoard = await honest.call('/api/games/one/leaderboards/default');
  assert.equal(restoredBoard.data.total, 2);
  assert.equal(restoredBoard.data.entries[0].displayName, 'MergedPlayer');
  assert.equal(restoredBoard.data.entries[0].score, 9000);
});

test('sanctions enforcement: community scope blocks all community writes; all scope blocks play, saves, avatar writes, community, and Forge session verify', async t => {
  const f = await fixture(t, Date.UTC(2026, 10, 21, 12, 0, 0), { avatar: { allowMockTopup: true } });
  await loginAdmin(f.admin);

  // 1. Community-scoped sanction blocks comment/suggestion/edit/delete/vote/report without blocking play sessions
  const commUser = f.visitor();
  await commUser.call('/api/session');
  const createdSuggestion = await commUser.call('/api/games/one/community', {
    method: 'POST',
    body: { kind: 'suggestion', title: 'Idea', body: 'Before mute' },
  });
  assert.equal(createdSuggestion.status, 201);
  const itemId = createdSuggestion.data.item.id;
  const commUserId = f.db.prepare("SELECT id FROM users WHERE kind='guest'").get().id;

  const commSanction = await f.admin.call('/api/admin/sanctions', {
    method: 'POST',
    body: { principalId: commUserId, scope: 'community', action: 'mute', reason: 'Spamming comments' },
  });
  assert.equal(commSanction.status, 201);

  for (const [route, opts] of [
    ['/api/games/one/community', { method: 'POST', body: { kind: 'comment', title: '', body: 'Muted comment' } }],
    ['/api/games/one/community', { method: 'POST', body: { kind: 'suggestion', title: 'T', body: 'Muted suggestion' } }],
    [`/api/community/${itemId}`, { method: 'PATCH', body: { body: 'Edited while muted' } }],
    [`/api/community/${itemId}`, { method: 'DELETE' }],
    [`/api/community/${itemId}/vote`, { method: 'PUT' }],
    [`/api/community/${itemId}/vote`, { method: 'DELETE' }],
    [`/api/community/${itemId}/report`, { method: 'POST', body: { reason: 'Report while muted' } }],
  ]) {
    const res = await commUser.call(route, opts);
    assert.equal(res.status, 403, `${opts.method} ${route}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.error.code, 'COMMUNITY_SANCTIONED');
  }

  // Community read & play session remain allowed under scope='community'
  assert.equal((await commUser.call('/api/games/one/community')).status, 200);
  assert.equal((await commUser.call('/api/play-sessions', { method: 'POST', body: { gameId: 'one' } })).status, 201);

  // 2. Platform-wide scope='all' ban blocks play-sessions, cloud saves, avatar writes, community, and Forge session verify
  const banned = f.visitor();
  await banned.call('/api/session');
  const bannedId = 'registered-banned-1';
  f.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?, 'registered', 'BannedUser', ?)").run(bannedId, f.now());
  f.db.prepare("INSERT INTO identities(provider, subject, user_id) VALUES('google', 'google-sub-banned-1', ?)").run(bannedId);
  f.db.prepare("UPDATE sessions SET principal_id=? WHERE principal_id IS NULL").run(bannedId);

  // Pre-ban baseline succeeds across all protected paths
  assert.equal((await banned.call('/api/play-sessions', { method: 'POST', body: { gameId: 'one' } })).status, 201);
  assert.equal((await banned.call('/api/saves/one', {
    method: 'PUT', headers: { 'If-None-Match': '*' }, body: { payload: { level: 1 } },
  })).status, 201);
  assert.equal((await banned.call('/api/saves/one?slot=slot2', {
    method: 'PUT', headers: { 'If-None-Match': '*' }, body: { payload: { level: 2 } },
  })).status, 201);
  assert.equal((await banned.call('/api/avatar/loadout', {
    method: 'PUT', body: { skinId: 'skin_knight' },
  })).status, 200);
  const preVerify = await f.internal.call('/internal/session/verify', {
    method: 'POST', body: { cookie: banned.cookieHeader(), method: 'GET' },
  });
  assert.equal(preVerify.status, 200);
  assert.equal(preVerify.data.authenticated, true);

  // Issue scope='all' ban
  const ban = await f.admin.call('/api/admin/sanctions', {
    method: 'POST',
    body: { principalId: bannedId, scope: 'all', action: 'ban', reason: 'Severe platform abuse' },
  });
  assert.equal(ban.status, 201);

  // Every write path + Forge session verify is blocked with 403
  const blockedPlay = await banned.call('/api/play-sessions', { method: 'POST', body: { gameId: 'one' } });
  assert.equal(blockedPlay.status, 403);
  assert.equal(blockedPlay.data.error.code, 'USER_SANCTIONED');

  const blockedSavePut = await banned.call('/api/saves/one', {
    method: 'PUT', headers: { 'If-Match': '"r1"' }, body: { payload: { level: 2 } },
  });
  assert.equal(blockedSavePut.status, 403);
  assert.equal(blockedSavePut.data.error.code, 'USER_SANCTIONED');

  const blockedSaveDel = await banned.call('/api/saves/one?slot=slot2', {
    method: 'DELETE', headers: { 'If-Match': '"r1"' },
  });
  assert.equal(blockedSaveDel.status, 403);
  assert.equal(blockedSaveDel.data.error.code, 'USER_SANCTIONED');

  const blockedSaveRestore = await banned.call('/api/saves/one/restore', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'restore-banned-001' },
    body: { sourceSlot: 'slot2', expectedSourceRevision: 1, expectedMainRevision: 1 },
  });
  assert.equal(blockedSaveRestore.status, 403);
  assert.equal(blockedSaveRestore.data.error.code, 'USER_SANCTIONED');

  const blockedAvatarLoadout = await banned.call('/api/avatar/loadout', {
    method: 'PUT', body: { skinId: 'skin_knight' },
  });
  assert.equal(blockedAvatarLoadout.status, 403);
  assert.equal(blockedAvatarLoadout.data.error.code, 'USER_SANCTIONED');

  const blockedAvatarPurchase = await banned.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-banned-001' },
    body: { itemId: 'skin_mage' },
  });
  assert.equal(blockedAvatarPurchase.status, 403);
  assert.equal(blockedAvatarPurchase.data.error.code, 'USER_SANCTIONED');

  const blockedAvatarTopup = await banned.call('/api/avatar/wallet/topup', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'topup-banned-001' },
    body: { packId: 'pack_500' },
  });
  assert.equal(blockedAvatarTopup.status, 403);
  assert.equal(blockedAvatarTopup.data.error.code, 'USER_SANCTIONED');

  const blockedComm = await banned.call('/api/games/one/community', {
    method: 'POST', body: { kind: 'comment', title: '', body: 'Banned user post' },
  });
  assert.equal(blockedComm.status, 403);
  assert.equal(blockedComm.data.error.code, 'COMMUNITY_SANCTIONED');

  const blockedForgeVerify = await f.internal.call('/internal/session/verify', {
    method: 'POST', body: { cookie: banned.cookieHeader(), method: 'GET' },
  });
  assert.equal(blockedForgeVerify.status, 403);
  assert.equal(blockedForgeVerify.data.authenticated, false);
  assert.equal(blockedForgeVerify.data.error, 'USER_SANCTIONED');

  // Reads remain accessible so user can inspect sanctions/saves/avatar state
  assert.equal((await banned.call('/api/me/sanctions')).status, 200);
  assert.equal((await banned.call('/api/saves/one')).status, 200);
  assert.equal((await banned.call('/api/avatar/me')).status, 200);

  // Revoking ban restores access across all paths
  assert.equal((await f.admin.call(`/api/admin/sanctions/${ban.data.sanction.id}/revoke`, {
    method: 'POST', body: { reason: 'Unbanned' },
  })).status, 200);
  assert.equal((await banned.call('/api/play-sessions', { method: 'POST', body: { gameId: 'one' } })).status, 201);
  assert.equal((await banned.call('/api/saves/one', {
    method: 'PUT', headers: { 'If-Match': '"r1"' }, body: { payload: { level: 3 } },
  })).status, 200);
  assert.equal((await banned.call('/api/avatar/loadout', {
    method: 'PUT', body: { skinId: 'skin_knight' },
  })).status, 200);
  const postVerify = await f.internal.call('/internal/session/verify', {
    method: 'POST', body: { cookie: banned.cookieHeader(), method: 'GET' },
  });
  assert.equal(postVerify.status, 200);
  assert.equal(postVerify.data.authenticated, true);
});

test('POST /api/auth/merge transfers guest avatar wallet, inventory, and loadout to registered account', async t => {
  const f = await fixture(t, Date.UTC(2026, 10, 21, 12, 0, 0), { avatar: { allowMockTopup: true } });
  const guest = f.visitor();
  await guest.call('/api/session');

  // Guest tops up PlayCoin, buys skin_mage (300 coins), and equips it
  const topup = await guest.call('/api/avatar/wallet/topup', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'merge-guest-topup-01' },
    body: { packId: 'pack_500' },
  });
  assert.equal(topup.status, 200);
  const bought = await guest.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'merge-guest-buy-01' },
    body: { itemId: 'skin_mage' },
  });
  assert.equal(bought.status, 200);
  assert.equal((await guest.call('/api/avatar/loadout', {
    method: 'PUT', body: { skinId: 'skin_mage' },
  })).status, 200);

  const guestMe = await guest.call('/api/avatar/me');
  const guestId = guestMe.data.principal.id;
  const expectedTotal = guestMe.data.wallet.total;

  // Create registered account with no avatar loadout yet and merge guest into it
  const account = f.visitor();
  await account.call('/api/session');
  const accountId = 'registered-avatar-merge-1';
  f.db.prepare("INSERT INTO users(id, kind, display_name, created_at) VALUES(?, 'registered', 'MergedHero', ?)").run(accountId, f.now());
  f.db.prepare("UPDATE sessions SET principal_id=? WHERE principal_id IS NULL").run(accountId);
  f.db.prepare("INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)").run('merge-avatar-1', guestId, accountId, 'src-av', 'dst-av', 'pending', f.now() + 60000, null);

  const merged = await account.call('/api/auth/merge', {
    method: 'POST', body: { consent: true, mergeId: 'merge-avatar-1' },
  });
  assert.equal(merged.status, 200, JSON.stringify(merged.data));

  const accountMe = await account.call('/api/avatar/me');
  assert.equal(accountMe.status, 200);
  assert.equal(accountMe.data.wallet.total, expectedTotal);
  assert.ok(accountMe.data.inventory.some(item => item.itemId === 'skin_mage'), 'purchased skin must transfer');
  assert.equal(accountMe.data.loadout.skinId, 'skin_mage');
});
