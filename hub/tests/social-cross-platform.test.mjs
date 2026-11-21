import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.mjs';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-social-xplat-'));
}

function cookieHeader(setCookies) {
  const list = Array.isArray(setCookies) ? setCookies : (setCookies ? [setCookies] : []);
  return list.map(c => c.split(';')[0]).join('; ');
}

async function createMobileClient(baseUrl, platform) {
  const headers = {
    'Content-Type': 'application/json',
    'X-PlayHub-Platform': platform,
    'X-PlayHub-Engine-Version': '4.7.2',
    'X-PlayHub-App-Version-Code': '1'
  };
  const authRes = await fetch(`${baseUrl}/api/mobile/auth/guest`, {
    method: 'POST',
    headers,
    body: '{}'
  });
  assert.equal(authRes.status, 201);
  const auth = await authRes.json();
  const token = auth.accessToken;

  const req = async (subPath, { method = 'GET', body } = {}) => {
    const res = await fetch(`${baseUrl}/api/mobile${subPath}`, {
      method,
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  // Complete adult age gate by default
  const ageRes = await req('/age-gate', {
    method: 'POST',
    body: { birthYear: 1995, birthMonth: 5, regionCode: 'KR' }
  });
  assert.equal(ageRes.status, 200);
  return { principalId: auth.profile.principalId, token, req };
}

async function createWebClient(baseUrl) {
  let cookieJar = new Map();
  let csrf = '';

  const absorbCookies = res => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieStr = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

  const sessionRes = await fetch(`${baseUrl}/api/session`, {
    headers: { Origin: baseUrl }
  });
  assert.equal(sessionRes.status, 200);
  absorbCookies(sessionRes);
  const session = await sessionRes.json();
  csrf = session.csrfToken;

  const req = async (apiPath, { method = 'GET', body, omitCsrf = false } = {}) => {
    const headers = {
      Origin: baseUrl,
      Cookie: cookieStr()
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!omitCsrf && method !== 'GET' && method !== 'HEAD') {
      headers['X-CSRF-Token'] = csrf;
    }
    const res = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    absorbCookies(res);
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  };

  return { req, getCsrf: () => csrf };
}

test('Cross-Platform Social: PC Hub Web (/api/social/*) <-> iOS <-> Android full interop', async t => {
  const dir = makeTempDir();
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const app2 = createApp({
    publicHost: '127.0.0.1',
    publicPort: 18293,
    adminHost: '127.0.0.1',
    adminPort: 18294,
    dataDir,
    userBaseUrl: 'http://127.0.0.1:18293',
    userOrigins: ['http://127.0.0.1:18293'],
    adminOrigins: ['http://127.0.0.1:18294'],
    mobile: { enabled: true, jwtSecret: 'xplat-test-secret-0123456789abcdef' }
  });
  await app2.listen();
  t.after(async () => {
    await app2.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const url = 'http://127.0.0.1:18293';
  const pcWeb = await createWebClient(url);
  const ios = await createMobileClient(url, 'ios');
  const android = await createMobileClient(url, 'android');

  // 1. CSRF Protection check on PC Web mutation
  const noCsrf = await pcWeb.req('/api/social/profile', {
    method: 'PUT',
    body: { displayName: 'NoCsrf' },
    omitCsrf: true
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.data.error?.code, 'CSRF_INVALID');

  // 2. Profile setup across all 3 platforms
  const pcProf = await pcWeb.req('/api/social/profile', {
    method: 'PUT',
    body: { displayName: 'PC웹유저', handle: 'pcweb#1001', avatarColor: '#142C25' }
  });
  assert.equal(pcProf.status, 200);
  assert.equal(pcProf.data.handle, 'pcweb#1001');

  const iosProf = await ios.req('/social/profile', {
    method: 'PUT',
    body: { displayName: '아이폰유저', handle: 'iospro#2002', avatarColor: '#2563EB' }
  });
  assert.equal(iosProf.status, 200);

  const aosProf = await android.req('/social/profile', {
    method: 'PUT',
    body: { displayName: '안드로이드유저', handle: 'aospro#3003', avatarColor: '#00B06F' }
  });
  assert.equal(aosProf.status, 200);

  // 3. Cross-Platform Search & Friendships (PC Web -> iOS, Android -> PC Web)
  const searchRes = await pcWeb.req('/api/social/users/search?q=iospro');
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.data.users.length, 1);
  assert.equal(searchRes.data.users[0].principalId, ios.principalId);

  const reqToIos = await pcWeb.req('/api/social/friends/request', {
    method: 'POST',
    body: { targetPrincipalId: ios.principalId }
  });
  assert.equal(reqToIos.status, 201);

  const iosAccept = await ios.req('/social/friends/respond', {
    method: 'POST',
    body: { requesterId: pcProf.data.principalId, action: 'accept' }
  });
  assert.equal(iosAccept.status, 200);
  assert.equal(iosAccept.data.status, 'accepted');

  const aosReqToPc = await android.req('/social/friends/request', {
    method: 'POST',
    body: { handle: 'pcweb#1001' }
  });
  assert.equal(aosReqToPc.status, 201);

  const pcAcceptAos = await pcWeb.req('/api/social/friends/respond', {
    method: 'POST',
    body: { requesterId: android.principalId, action: 'accept' }
  });
  assert.equal(pcAcceptAos.status, 200);

  // 4. Cross-Platform Presence & 1:1 DM (PC Web <-> iOS)
  const iosPresence = await ios.req('/social/presence', {
    method: 'POST',
    body: { status: 'in_game', gameId: 'survivor-arena-g2', gameTitle: 'Survivor Arena G2', roomCode: 'IOS888' }
  });
  assert.equal(iosPresence.status, 200);

  const pcFriends = await pcWeb.req('/api/social/friends');
  assert.equal(pcFriends.status, 200);
  assert.equal(pcFriends.data.friends.length, 2);
  const iosFriend = pcFriends.data.friends.find(f => f.principalId === ios.principalId);
  assert.equal(iosFriend.presence.gameTitle, 'Survivor Arena G2');
  assert.equal(iosFriend.presence.roomCode, 'IOS888');

  const dmFromPc = await pcWeb.req('/api/social/messages', {
    method: 'POST',
    body: { channelType: 'dm', peerId: ios.principalId, body: 'PC 웹에서 iOS로 인사합니다!' }
  });
  assert.equal(dmFromPc.status, 201);

  const dmReplyIos = await ios.req('/social/messages', {
    method: 'POST',
    body: { channelType: 'dm', peerId: pcProf.data.principalId, body: 'iOS에서 PC 웹으로 답장!' }
  });
  assert.equal(dmReplyIos.status, 201);

  const dmThreadPc = await pcWeb.req(`/api/social/messages?channelType=dm&peerId=${encodeURIComponent(ios.principalId)}`);
  assert.equal(dmThreadPc.status, 200);
  assert.equal(dmThreadPc.data.messages.length, 2);
  assert.equal(dmThreadPc.data.messages[0].senderMe, true);
  assert.equal(dmThreadPc.data.messages[1].body, 'iOS에서 PC 웹으로 답장!');

  // 5. 3-Platform Shared Party (PC Web Leader + iOS + Android) + Leader Transfer
  const partyCreate = await pcWeb.req('/api/social/parties', {
    method: 'POST',
    body: { title: '크로스플랫폼 3인 파티', targetGameId: 'survivor-arena-g2' }
  });
  assert.equal(partyCreate.status, 201);
  const roomCode = partyCreate.data.party.roomCode;
  const partyId = partyCreate.data.party.id;

  const iosJoin = await ios.req('/social/parties/join', { method: 'POST', body: { roomCode } });
  assert.equal(iosJoin.status, 200);
  const aosJoin = await android.req('/social/parties/join', { method: 'POST', body: { roomCode } });
  assert.equal(aosJoin.status, 200);
  assert.equal(aosJoin.data.party.members.length, 3);

  const iosReady = await ios.req(`/social/parties/${partyId}/ready`, { method: 'POST', body: { ready: true } });
  assert.equal(iosReady.status, 200);
  assert.equal(iosReady.data.party.members.find(m => m.principalId === ios.principalId).ready, true);

  const partyMsg = await pcWeb.req('/api/social/messages', {
    method: 'POST',
    body: { channelType: 'party', partyId, body: '3개 플랫폼 모두 준비 완료!' }
  });
  assert.equal(partyMsg.status, 201);

  const aosPartyMsgs = await android.req(`/social/messages?channelType=party&partyId=${encodeURIComponent(partyId)}`);
  assert.equal(aosPartyMsgs.status, 200);
  assert.equal(aosPartyMsgs.data.messages[0].body, '3개 플랫폼 모두 준비 완료!');

  // 5b. Synchronized Co-Entry Cross-Play Launch (PC Web Leader launches -> iOS & Android join EXACT same matchRoomId!)
  const launchRes = await pcWeb.req(`/api/social/parties/${partyId}/launch`, {
    method: 'POST',
    body: { gameId: 'survivor-arena-g2', gameTitle: 'Survivor Arena G2', platform: 'web' }
  });
  assert.equal(launchRes.status, 201);
  const { launchId, matchRoomId } = launchRes.data.launch;
  assert.ok(launchId.startsWith('launch_'));
  assert.ok(matchRoomId.startsWith(`match_${roomCode}_`));

  // iOS and Android poll /parties/me and receive the EXACT SAME activeLaunch ticket
  const iosPoll = await ios.req('/social/parties/me');
  const aosPoll = await android.req('/social/parties/me');
  assert.equal(iosPoll.data.party.activeLaunch.launchId, launchId);
  assert.equal(iosPoll.data.party.activeLaunch.matchRoomId, matchRoomId);
  assert.equal(aosPoll.data.party.activeLaunch.launchId, launchId);
  assert.equal(aosPoll.data.party.activeLaunch.matchRoomId, matchRoomId);

  // iOS and Android acknowledge entry into the SAME matchRoomId
  const iosAck = await ios.req(`/social/parties/${partyId}/launch/ack`, {
    method: 'POST',
    body: { launchId, state: 'entered', gameTitle: 'Survivor Arena G2' }
  });
  assert.equal(iosAck.status, 200);
  const aosAck = await android.req(`/social/parties/${partyId}/launch/ack`, {
    method: 'POST',
    body: { launchId, state: 'entered', gameTitle: 'Survivor Arena G2' }
  });
  assert.equal(aosAck.status, 200);

  // Verify ALL 3 platforms (web, ios, android) are entered in the exact same matchRoomId!
  const participants = aosAck.data.launch.participants;
  assert.equal(participants.length, 3);
  assert.deepEqual(
    participants.map(p => ({ platform: p.platform, state: p.state })).sort((a, b) => a.platform.localeCompare(b.platform)),
    [
      { platform: 'android', state: 'entered' },
      { platform: 'ios', state: 'entered' },
      { platform: 'web', state: 'entered' }
    ]
  );

  // PC Web leaves -> leader auto-transfers to iOS (first joined member)
  const pcLeave = await pcWeb.req(`/api/social/parties/${partyId}/leave`, { method: 'POST', body: {} });
  assert.equal(pcLeave.status, 200);
  const iosPartyAfter = await ios.req('/social/parties/me');
  assert.equal(iosPartyAfter.data.party.leaderId, ios.principalId);
  assert.equal(iosPartyAfter.data.party.members.length, 2);

  // 6. Cross-Platform Unified Leaderboard (PC Web + iOS + Android)
  await pcWeb.req('/api/social/leaderboards/survivor-arena-g2/score/scores', { method: 'POST', body: { score: 1500 } });
  await ios.req('/social/leaderboards/survivor-arena-g2/score/scores', { method: 'POST', body: { score: 3200 } });
  await android.req('/social/leaderboards/survivor-arena-g2/score/scores', { method: 'POST', body: { score: 2400 } });

  const lbWeb = await pcWeb.req('/api/social/leaderboards/survivor-arena-g2/score?scope=global');
  assert.equal(lbWeb.status, 200);
  assert.deepEqual(
    lbWeb.data.entries.map(e => ({ handle: e.handle, score: e.score })),
    [
      { handle: 'iospro#2002', score: 3200 },
      { handle: 'aospro#3003', score: 2400 },
      { handle: 'pcweb#1001', score: 1500 }
    ]
  );

  // Quick messages endpoint available on both web and mobile
  const qmWeb = await pcWeb.req('/api/social/quick-messages');
  assert.equal(qmWeb.status, 200);
  assert.equal(qmWeb.data.quickMessages.length, 5);
});
