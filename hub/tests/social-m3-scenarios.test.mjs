import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createApp } from '../server/app.mjs';
import { sanitizeSnapshot } from '../tools/sanitize-snapshot.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

function makeFixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-social-m3-'));
  fs.mkdirSync(path.join(root, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(root, 'games/survivor-arena-g2/Web'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'catalog/games.json'),
    JSON.stringify({ schemaVersion: 1, entries: [{ id: 'survivor-arena-g2', path: 'games/survivor-arena-g2', enabled: true }] })
  );
  fs.writeFileSync(
    path.join(root, 'games/survivor-arena-g2/game.manifest.json'),
    JSON.stringify({
      id: 'survivor-arena-g2',
      entry: 'index.html',
      title: 'Survivor Arena G2',
      summary: 'Godot 4.7.2 3D Survival',
      tags: ['action', 'godot']
    })
  );
  return root;
}

async function reqJson(baseUrl, urlPath, { method = 'GET', token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function createMobileUser(baseUrl, { displayName, handle, birthYear, birthMonth, regionCode = 'KR', avatarColor = '#00B06F' }) {
  const auth = await reqJson(baseUrl, '/api/mobile/auth/guest', { method: 'POST', body: {} });
  assert.equal(auth.status, 201);
  const token = auth.data.accessToken;
  const principalId = auth.data.profile.principalId;

  const age = await reqJson(baseUrl, '/api/mobile/age-gate', {
    method: 'POST',
    token,
    body: { birthYear, birthMonth, regionCode }
  });
  assert.equal(age.status, 200);

  const prof = await reqJson(baseUrl, '/api/mobile/social/profile', {
    method: 'PUT',
    token,
    body: { displayName, handle, avatarColor, bio: `${displayName} bio` }
  });
  assert.equal(prof.status, 200);
  return { token, principalId, profile: prof.data, ageTier: age.data.ageCompliance.ageTier };
}

test('M3 Social User Scenarios 1~7: Friends, Presence, DM, Party Lifecycle, Child Safe Quick-Message, Block/Report, Leaderboards & Sanitizer', async () => {
  const rootDir = makeFixtureRoot();
  const app = createApp(
    {
      dataDir: path.join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: 'https://dev.playhub.example.com',
      userOrigins: ['https://dev.playhub.example.com', 'http://127.0.0.1'],
      adminOrigins: ['http://127.0.0.1'],
      mobile: { enabled: true, jwtSecret: 'social-m3-test-secret-32-chars-minimum!' }
    },
    { rootDir }
  );

  const server = http.createServer((req, res) => app.publicHandler(req, res));
  const port = await new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Setup 4 real player personas: Alice (Adult), Bob (Adult), Charlie (Adult), Kid (Child <14 KR)
    const alice = await createMobileUser(baseUrl, { displayName: '민지', handle: 'minji#1001', birthYear: 1998, birthMonth: 5, avatarColor: '#00B06F' });
    const bob = await createMobileUser(baseUrl, { displayName: '민준', handle: 'minjun#2002', birthYear: 1999, birthMonth: 8, avatarColor: '#2563EB' });
    const charlie = await createMobileUser(baseUrl, { displayName: '철수', handle: 'chulsoo#3003', birthYear: 2000, birthMonth: 1, avatarColor: '#7C3AED' });
    const kid = await createMobileUser(baseUrl, { displayName: '지우', handle: 'jiwoo#4004', birthYear: 2016, birthMonth: 3 });

    assert.equal(alice.ageTier, 'ADULT');
    assert.equal(kid.ageTier, 'CHILD_PROTECTED');
    // Child bio must be stripped automatically & privacy cannot be public
    assert.equal(kid.profile.bio, '');
    assert.notEqual(kid.profile.privacyLevel, 'public');

    // === SCENARIO 1: Search -> Friend Request -> Accept -> Live Presence ===
    const search = await reqJson(baseUrl, '/api/mobile/social/users/search?q=minjun', { token: alice.token });
    assert.equal(search.status, 200);
    assert.equal(search.data.users.length, 1);
    assert.equal(search.data.users[0].handle, 'minjun#2002');
    // Child account must NEVER appear in public user search
    const kidSearch = await reqJson(baseUrl, '/api/mobile/social/users/search?q=jiwoo', { token: alice.token });
    assert.equal(kidSearch.data.users.length, 0);

    const freq = await reqJson(baseUrl, '/api/mobile/social/friends/request', {
      method: 'POST',
      token: alice.token,
      body: { targetHandle: 'minjun#2002' }
    });
    assert.equal(freq.status, 201);
    assert.equal(freq.data.status, 'pending');

    // Bob checks incoming requests and accepts
    const bobFriendsBefore = await reqJson(baseUrl, '/api/mobile/social/friends', { token: bob.token });
    assert.equal(bobFriendsBefore.data.incomingRequests.length, 1);
    assert.equal(bobFriendsBefore.data.incomingRequests[0].handle, 'minji#1001');

    const accept = await reqJson(baseUrl, '/api/mobile/social/friends/respond', {
      method: 'POST',
      token: bob.token,
      body: { requesterId: alice.principalId, action: 'accept' }
    });
    assert.equal(accept.status, 200);
    assert.equal(accept.data.status, 'accepted');

    // Bob enters Survivor Arena G2 and updates live presence
    const pres = await reqJson(baseUrl, '/api/mobile/social/presence', {
      method: 'POST',
      token: bob.token,
      body: { status: 'in_game', gameId: 'survivor-arena-g2', gameTitle: 'Survivor Arena G2', roomCode: 'ARENA7', joinable: true }
    });
    assert.equal(pres.status, 200);

    const aliceFriends = await reqJson(baseUrl, '/api/mobile/social/friends', { token: alice.token });
    assert.equal(aliceFriends.data.friends.length, 1);
    assert.equal(aliceFriends.data.friends[0].presence.status, 'in_game');
    assert.equal(aliceFriends.data.friends[0].presence.gameId, 'survivor-arena-g2');
    assert.equal(aliceFriends.data.friends[0].presence.roomCode, 'ARENA7');

    // === SCENARIO 2: Real-Time 1:1 Friend DM Chat ===
    const dm1 = await reqJson(baseUrl, '/api/mobile/social/messages', {
      method: 'POST',
      token: alice.token,
      body: { channelType: 'dm', peerId: bob.principalId, body: '지금 웨이브 5 같이 깰래?' }
    });
    assert.equal(dm1.status, 201);

    const dm2 = await reqJson(baseUrl, '/api/mobile/social/messages', {
      method: 'POST',
      token: bob.token,
      body: { channelType: 'dm', peerId: alice.principalId, body: '좋아 바로 들어와!' }
    });
    assert.equal(dm2.status, 201);

    const dmHistory = await reqJson(baseUrl, `/api/mobile/social/messages?channelType=dm&peerId=${bob.principalId}`, { token: alice.token });
    assert.equal(dmHistory.status, 200);
    assert.equal(dmHistory.data.messages.length, 2);
    assert.equal(dmHistory.data.messages[0].senderMe, true);
    assert.equal(dmHistory.data.messages[1].senderMe, false);
    assert.equal(dmHistory.data.messages[1].body, '좋아 바로 들어와!');

    // Non-friend DM must be rejected (403 FRIENDSHIP_REQUIRED)
    const dmStranger = await reqJson(baseUrl, '/api/mobile/social/messages', {
      method: 'POST',
      token: charlie.token,
      body: { channelType: 'dm', peerId: alice.principalId, body: '스팸' }
    });
    assert.equal(dmStranger.status, 403);
    assert.equal(dmStranger.data.error.code, 'FRIENDSHIP_REQUIRED');

    // === SCENARIO 3: Party Create -> Invite Link/Code Join -> Ready -> Set Game -> Party Chat -> Leave & Leader Transfer ===
    const createdParty = await reqJson(baseUrl, '/api/mobile/social/parties', {
      method: 'POST',
      token: alice.token,
      body: { title: '주말 서바이벌 파티', targetGameId: 'survivor-arena-g2' }
    });
    assert.equal(createdParty.status, 201);
    const partyId = createdParty.data.party.id;
    const roomCode = createdParty.data.party.roomCode;
    assert.equal(roomCode.length, 6);
    assert.match(createdParty.data.party.inviteUrl, /\/join\/survivor-arena-g2\?room=/);
    assert.match(createdParty.data.party.deepLinkUrl, /^playhub:\/\/join\/survivor-arena-g2\?room=/);

    const joined = await reqJson(baseUrl, '/api/mobile/social/parties/join', {
      method: 'POST',
      token: bob.token,
      body: { roomCode }
    });
    assert.equal(joined.status, 200);
    assert.equal(joined.data.party.members.length, 2);

    const bobReady = await reqJson(baseUrl, `/api/mobile/social/parties/${partyId}/ready`, {
      method: 'POST',
      token: bob.token,
      body: { ready: true }
    });
    assert.equal(bobReady.status, 200);
    assert.equal(bobReady.data.party.members.every(m => m.ready), true);

    // Non-leader cannot change party game
    const bobSetGame = await reqJson(baseUrl, `/api/mobile/social/parties/${partyId}/game`, {
      method: 'POST',
      token: bob.token,
      body: { targetGameId: 'match3-garden' }
    });
    assert.equal(bobSetGame.status, 403);

    // Leader sets game & sends party chat
    const aliceSetGame = await reqJson(baseUrl, `/api/mobile/social/parties/${partyId}/game`, {
      method: 'POST',
      token: alice.token,
      body: { targetGameId: 'survivor-arena-g2' }
    });
    assert.equal(aliceSetGame.status, 200);

    const partyMsg = await reqJson(baseUrl, '/api/mobile/social/messages', {
      method: 'POST',
      token: bob.token,
      body: { channelType: 'party', partyId, body: '준비 완료! 시작하자' }
    });
    assert.equal(partyMsg.status, 201);

    // Alice leaves -> leadership automatically transfers to Bob
    const aliceLeave = await reqJson(baseUrl, `/api/mobile/social/parties/${partyId}/leave`, {
      method: 'POST',
      token: alice.token,
      body: {}
    });
    assert.equal(aliceLeave.status, 200);
    const bobParty = await reqJson(baseUrl, '/api/mobile/social/parties/me', { token: bob.token });
    assert.equal(bobParty.data.party.leaderId, bob.principalId);
    assert.equal(bobParty.data.party.members.length, 1);

    // === SCENARIO 4: Child Protected Age Gate & Safe Quick Messages (Fail-Closed) ===
    const kidJoinBlocked = await reqJson(baseUrl, '/api/mobile/social/parties/join', {
      method: 'POST',
      token: kid.token,
      body: { roomCode }
    });
    assert.equal(kidJoinBlocked.status, 403);
    assert.equal(kidJoinBlocked.data.error.code, 'PARENTAL_CONSENT_REQUIRED');

    // Verify parental consent for child
    const consent = await reqJson(baseUrl, '/api/mobile/parental-consent', {
      method: 'POST',
      token: kid.token,
      body: { guardianContact: 'parent-kr@example.com', method: 'email' }
    });
    assert.equal(consent.status, 200);

    // Now child can join party, STILL blocked from free text chat, but ALLOWED Safe Quick Messages!
    const kidJoinOk = await reqJson(baseUrl, '/api/mobile/social/parties/join', {
      method: 'POST',
      token: kid.token,
      body: { roomCode }
    });
    assert.equal(kidJoinOk.status, 200);

    const kidFreeChat = await reqJson(baseUrl, '/api/mobile/social/messages', {
      method: 'POST',
      token: kid.token,
      body: { channelType: 'party', partyId, body: '내 전화번호는 010-1234' }
    });
    assert.equal(kidFreeChat.status, 403);
    assert.equal(kidFreeChat.data.error.code, 'CHILD_FREE_CHAT_BLOCKED');

    const kidQuickChat = await reqJson(baseUrl, '/api/mobile/social/messages', {
      method: 'POST',
      token: kid.token,
      body: { channelType: 'party', partyId, quickMessageId: 'qm_ready' }
    });
    assert.equal(kidQuickChat.status, 201);
    assert.equal(kidQuickChat.data.isQuickMessage, true);
    assert.equal(kidQuickChat.data.body, '준비 완료!');

    // === SCENARIO 5: Report & Block (Cascading Unfriend + Party/DM/Search Isolation) ===
    // Make Alice & Charlie friends first, then Alice reports & blocks Charlie
    await reqJson(baseUrl, '/api/mobile/social/friends/request', { method: 'POST', token: charlie.token, body: { targetHandle: 'minji#1001' } });
    await reqJson(baseUrl, '/api/mobile/social/friends/respond', { method: 'POST', token: alice.token, body: { requesterId: charlie.principalId, action: 'accept' } });

    const rep = await reqJson(baseUrl, '/api/mobile/social/reports', {
      method: 'POST',
      token: alice.token,
      body: { targetType: 'user', targetId: charlie.principalId, reason: '비매너 채팅 신고' }
    });
    assert.equal(rep.status, 201);

    const blk = await reqJson(baseUrl, '/api/mobile/social/blocks', {
      method: 'POST',
      token: alice.token,
      body: { targetPrincipalId: charlie.principalId }
    });
    assert.equal(blk.status, 201);

    // Friendship auto-removed & Charlie cannot re-request or DM Alice
    const charlieRetry = await reqJson(baseUrl, '/api/mobile/social/friends/request', {
      method: 'POST',
      token: charlie.token,
      body: { targetHandle: 'minji#1001' }
    });
    assert.equal(charlieRetry.status, 403);
    assert.equal(charlieRetry.data.error.code, 'USER_BLOCKED');

    const charlieSearchAlice = await reqJson(baseUrl, '/api/mobile/social/users/search?q=minji', { token: charlie.token });
    assert.equal(charlieSearchAlice.data.users.length, 0);

    // === SCENARIO 6: Leaderboards (Global vs Friends Scope) ===
    await reqJson(baseUrl, '/api/mobile/social/leaderboards/survivor-arena-g2/high_score/scores', { method: 'POST', token: alice.token, body: { score: 1500 } });
    await reqJson(baseUrl, '/api/mobile/social/leaderboards/survivor-arena-g2/high_score/scores', { method: 'POST', token: bob.token, body: { score: 2400 } });
    await reqJson(baseUrl, '/api/mobile/social/leaderboards/survivor-arena-g2/high_score/scores', { method: 'POST', token: charlie.token, body: { score: 9999 } });

    // Global for Bob includes Charlie (#1 9999), Bob (#2 2400), Alice (#3 1500)
    const lbGlobal = await reqJson(baseUrl, '/api/mobile/social/leaderboards/survivor-arena-g2/high_score?scope=global', { token: bob.token });
    assert.equal(lbGlobal.data.entries.length, 3);
    assert.equal(lbGlobal.data.entries[0].score, 9999);

    // Friends scope for Alice shows ONLY Bob (#1 2400) & Alice (#2 1500) — Charlie is blocked & not friend!
    const lbFriends = await reqJson(baseUrl, '/api/mobile/social/leaderboards/survivor-arena-g2/high_score?scope=friends', { token: alice.token });
    assert.equal(lbFriends.data.entries.length, 2);
    assert.equal(lbFriends.data.entries[0].principalId, bob.principalId);
    assert.equal(lbFriends.data.entries[1].principalId, alice.principalId);

    // === SCENARIO 7: Sanitizer & Restore Compatibility with All 9 Social Tables ===
    const sanitizedOut = path.join(rootDir, 'sanitized-social.sqlite');
    const sanReport = await sanitizeSnapshot({
      from: path.join(rootDir, 'data/platform.sqlite'),
      out: sanitizedOut,
      sourceEnv: 'live',
      targetEnv: 'dev',
      salt: 'social-sanitize-salt'
    });
    assert.equal(sanReport.ok, true);
    assert.equal(sanReport.sanitized, true);
    assert.ok(sanReport.stats.droppedTables.includes('social_messages'));
    assert.ok(sanReport.stats.droppedTables.includes('social_reports'));
    const inspected = inspectDatabase(sanitizedOut);
    assert.equal(inspected.integrity, 'ok');
    assert.equal(inspected.foreignKeys, 'ok');
  } finally {
    await new Promise(r => server.close(r));
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
