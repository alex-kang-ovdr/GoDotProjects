import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const WEB_SOCIAL_PATH = path.join(repoRoot, 'hub/web/user/social.js');
const IOS_API_CLIENT_PATH = path.join(
  repoRoot,
  'ios/Packages/PlayHubCore/Sources/PlayHubCore/Network/PlayHubApiClient.swift'
);
const ANDROID_ROOT_DIR = path.join(repoRoot, 'android/app/src/main/java/com/playhub/aos');
const ANDROID_API_CLIENT_PATH = path.join(ANDROID_ROOT_DIR, 'network/PlayHubApiClient.kt');

/**
 * Documented client-vs-server DTO drifts currently present in client code.
 * - Any NEW drift NOT listed here will FAIL the contract test immediately.
 * - All 8 prior Web + iOS drifts have been resolved and promoted to strict
 *   0-drift contract assertions across Web, iOS, and Android.
 */
export const KNOWN_CLIENT_DRIFT = Object.freeze({});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const HANDLE_RE = /^.{2,24}#[0-9]{4}$/;

function assertString(v, label) {
  assert.equal(typeof v, 'string', `${label} must be string, got ${typeof v}`);
}

function assertNonEmptyString(v, label) {
  assertString(v, label);
  assert.ok(v.length > 0, `${label} must be non-empty string`);
}

function assertNullableString(v, label) {
  assert.ok(v === null || typeof v === 'string', `${label} must be string|null, got ${typeof v}`);
}

function assertBoolean(v, label) {
  assert.equal(typeof v, 'boolean', `${label} must be boolean, got ${typeof v}`);
}

function assertNumber(v, label) {
  assert.equal(typeof v, 'number', `${label} must be number, got ${typeof v}`);
  assert.ok(Number.isFinite(v), `${label} must be finite number`);
}

function assertIsoDate(v, label) {
  assertString(v, label);
  assert.match(v, ISO_DATE_RE, `${label} must be ISO-8601 UTC timestamp, got ${v}`);
}

function assertPlainObject(v, label) {
  assert.ok(v && typeof v === 'object' && !Array.isArray(v), `${label} must be plain object`);
}

function assertPresenceDto(p, label) {
  assertPlainObject(p, label);
  assert.ok(['online', 'in_game', 'offline'].includes(p.status), `${label}.status invalid: ${p.status}`);
  assertBoolean(p.online, `${label}.online`);
  assertNullableString(p.gameId, `${label}.gameId`);
  assertNullableString(p.gameTitle, `${label}.gameTitle`);
  assertNullableString(p.roomCode, `${label}.roomCode`);
  assertBoolean(p.joinable, `${label}.joinable`);
}

function createFixtureCatalogRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-dto-contract-'));
  fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games/pck-arena/Web'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games/web-puzzle'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });

  fs.writeFileSync(
    path.join(dir, 'catalog/games.json'),
    JSON.stringify({
      schemaVersion: 1,
      entries: [
        { id: 'pck-arena', path: 'games/pck-arena', enabled: true },
        { id: 'web-puzzle', path: 'games/web-puzzle', enabled: true },
      ],
    })
  );

  fs.writeFileSync(
    path.join(dir, 'games/pck-arena/game.manifest.json'),
    JSON.stringify({
      id: 'pck-arena',
      entry: 'index.html',
      title: { ko: 'PCK 아레나', en: 'PCK Arena' },
      summary: { ko: 'Godot PCK 멀티플레이 게임', en: 'Godot PCK game' },
      tags: ['action'],
      deployMode: 'mmo',
    })
  );
  fs.writeFileSync(
    path.join(dir, 'games/pck-arena/Web/index.pck'),
    Buffer.from('GDPC\x02\x00\x00\x00\x04\x00\x00\x00\x07\x00\x00\x00\x02\x00\x00\x00')
  );

  fs.writeFileSync(
    path.join(dir, 'games/web-puzzle/game.manifest.json'),
    JSON.stringify({
      id: 'web-puzzle',
      entry: 'index.html',
      title: { ko: '웹 퍼즐', en: 'Web Puzzle' },
      summary: { ko: '웹 기반 퍼즐 게임', en: 'Web puzzle game' },
      tags: ['puzzle'],
    })
  );

  return dir;
}

function makeCookieClient(baseUrl, origin) {
  const jar = new Map();
  let csrf = null;

  return {
    async call(pathname, { method = 'GET', body, headers = {} } = {}) {
      const h = { ...headers };
      if (jar.size) h.Cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
      if (method !== 'GET' && method !== 'HEAD') {
        h.Origin = origin;
        if (csrf) h['X-CSRF-Token'] = csrf;
        if (body !== undefined) h['Content-Type'] = 'application/json';
      }
      const res = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      for (const line of res.headers.getSetCookie?.() || []) {
        const [pair] = line.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
      const data = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
      if (data?.csrfToken) csrf = data.csrfToken;
      return { status: res.status, headers: res.headers, data };
    },
  };
}

async function mobileReq(baseUrl, pathname, { method = 'GET', token = null, body } = {}) {
  const h = {
    'X-PlayHub-Engine-Version': '4.7.2',
    'X-PlayHub-App-Version-Code': '1',
  };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

async function bootLiveHubAndCollectSnapshots(t) {
  const rootDir = createFixtureCatalogRoot();
  const origin = 'http://localhost:8080';
  const nowMs = Date.parse('2026-11-22T09:00:00Z');
  const app = createApp(
    {
      dataDir: path.join(rootDir, 'data'),
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userBaseUrl: origin,
      userOrigins: [origin],
      adminOrigins: ['http://127.0.0.1:8081'],
      secureCookies: false,
      mobile: { enabled: true, jwtSecret: 'dto-contract-mobile-jwt-secret-32c!' },
      billing: { enabled: true, allowMockProvider: true },
    },
    { rootDir, platformRoot: repoRoot, clock: () => nowMs, env: {} }
  );
  t.after(async () => {
    await app.close();
    fs.rmSync(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  });

  const ports = await app.listen();
  const baseUrl = `http://localhost:${ports.public.port}`;

  async function createAdultUser(email, displayName) {
    const client = makeCookieClient(baseUrl, origin);
    await client.call('/api/session');
    const reg = await client.call('/api/auth/email/register', {
      method: 'POST',
      body: { email, password: 'Password123', displayName },
    });
    assert.equal(reg.status, 201);
    const prof = await client.call('/api/social/profile');
    assert.equal(prof.status, 200);
    app.db.prepare(
      `INSERT OR REPLACE INTO user_age_compliance(principal_id,region_code,age_tier,parental_consent_status,parental_consent_at,kyc_verified_at,updated_at)
       VALUES(?,'KR','ADULT','not_required',NULL,NULL,?)`
    ).run(prof.data.principalId, nowMs);
    return { client, principalId: prof.data.principalId, handle: prof.data.handle };
  }

  const mainUser = await createAdultUser('dto-main@example.com', 'ContractMain');
  const friendUser = await createAdultUser('dto-friend@example.com', 'AcceptedFriend');
  const incomingUser = await createAdultUser('dto-incoming@example.com', 'IncomingPeer');
  const outgoingUser = await createAdultUser('dto-outgoing@example.com', 'OutgoingPeer');
  const blockedUser = await createAdultUser('dto-blocked@example.com', 'BlockedPeer');
  const searchUser = await createAdultUser('dto-search@example.com', 'SearchTargetHero');

  // Establish accepted friendship + live DM message + presence so every field is populated
  assert.equal(
    (await mainUser.client.call('/api/social/friends/request', {
      method: 'POST',
      body: { targetPrincipalId: friendUser.principalId },
    })).status,
    201
  );
  assert.equal(
    (await friendUser.client.call('/api/social/friends/respond', {
      method: 'POST',
      body: { requesterId: mainUser.principalId, action: 'accept' },
    })).status,
    200
  );
  assert.equal(
    (await friendUser.client.call('/api/social/presence', {
      method: 'POST',
      body: { status: 'in_game', gameId: 'pck-arena', gameTitle: 'PCK 아레나', roomCode: 'ROOM99', joinable: true },
    })).status,
    200
  );
  assert.equal(
    (await mainUser.client.call('/api/social/messages', {
      method: 'POST',
      body: { channelType: 'dm', peerId: friendUser.principalId, body: '계약 테스트 DM' },
    })).status,
    201
  );

  // Incoming request, outgoing request, and blocked user
  assert.equal(
    (await incomingUser.client.call('/api/social/friends/request', {
      method: 'POST',
      body: { targetPrincipalId: mainUser.principalId },
    })).status,
    201
  );
  assert.equal(
    (await mainUser.client.call('/api/social/friends/request', {
      method: 'POST',
      body: { targetPrincipalId: outgoingUser.principalId },
    })).status,
    201
  );
  assert.equal(
    (await mainUser.client.call('/api/social/blocks', {
      method: 'POST',
      body: { targetPrincipalId: blockedUser.principalId },
    })).status,
    201
  );

  // Also get Mobile Bearer token for the same mainUser to verify Web <-> Mobile parity
  const mobLogin = await mobileReq(baseUrl, '/api/mobile/auth/email/login', {
    method: 'POST',
    body: { email: 'dto-main@example.com', password: 'Password123' },
  });
  assert.equal(mobLogin.status, 200);
  const mobileToken = mobLogin.data.accessToken;

  // Capture all 8 live endpoint payloads (+ party launch & DM history for complete DTO coverage)
  const socialProfile = await mainUser.client.call('/api/social/profile');
  const mobileSocialProfile = await mobileReq(baseUrl, '/api/mobile/social/profile', { token: mobileToken });

  const socialSearch = await mainUser.client.call('/api/social/users/search?q=SearchTarget');
  const mobileSocialSearch = await mobileReq(baseUrl, '/api/mobile/social/users/search?q=SearchTarget', { token: mobileToken });

  const socialFriends = await mainUser.client.call('/api/social/friends');
  const mobileSocialFriends = await mobileReq(baseUrl, '/api/mobile/social/friends', { token: mobileToken });

  const socialMessages = await mainUser.client.call(
    `/api/social/messages?channelType=dm&peerId=${encodeURIComponent(friendUser.principalId)}`
  );

  const partyCreate = await mainUser.client.call('/api/social/parties', {
    method: 'POST',
    body: { title: 'DTO 계약 파티', targetGameId: 'pck-arena', maxMembers: 4 },
  });
  assert.equal(partyCreate.status, 201);
  const partyLaunch = await mainUser.client.call(
    `/api/social/parties/${encodeURIComponent(partyCreate.data.party.id)}/launch`,
    { method: 'POST', body: { gameId: 'pck-arena', gameTitle: 'PCK 아레나', platform: 'web' } }
  );
  assert.equal(partyLaunch.status, 201);
  const socialPartyMe = await mainUser.client.call('/api/social/parties/me');
  const mobilePartyMe = await mobileReq(baseUrl, '/api/mobile/social/parties/me', { token: mobileToken });

  const avatarCatalog = await mainUser.client.call('/api/avatar/catalog');
  const avatarMe = await mainUser.client.call('/api/avatar/me');
  const mobileCatalog = await mobileReq(baseUrl, '/api/mobile/catalog', { token: mobileToken });
  const billingCatalog = await mainUser.client.call('/api/billing/catalog?currency=KRW&channel=web_browser');

  return {
    socialProfile,
    mobileSocialProfile,
    socialSearch,
    mobileSocialSearch,
    socialFriends,
    mobileSocialFriends,
    socialMessages,
    partyCreate,
    partyLaunch,
    socialPartyMe,
    mobilePartyMe,
    avatarCatalog,
    avatarMe,
    mobileCatalog,
    billingCatalog,
    searchUser,
  };
}

/**
 * Parse Swift `public struct <Name>: Codable ... { public let <prop>: <Type> }` declarations.
 */
function parseSwiftCodableStructs(swiftSource) {
  const structs = new Map();
  const structRe = /public\s+struct\s+(\w+)\s*:[^{]*\bCodable\b[^{]*\{/g;
  let m;
  while ((m = structRe.exec(swiftSource)) !== null) {
    const name = m[1];
    let depth = 1;
    let i = m.index + m[0].length;
    const bodyStart = i;
    while (i < swiftSource.length && depth > 0) {
      if (swiftSource[i] === '{') depth++;
      else if (swiftSource[i] === '}') depth--;
      i++;
    }
    const body = swiftSource.slice(bodyStart, i - 1);
    const props = [];
    for (const line of body.split(/\r?\n/)) {
      const propMatch = line.match(/^\s*public\s+let\s+(\w+)\s*:\s*([^=\n/]+)/);
      if (!propMatch) continue;
      const rawType = propMatch[2].trim();
      const optional = rawType.endsWith('?');
      const baseType = optional ? rawType.slice(0, -1).trim() : rawType;
      props.push({ name: propMatch[1], rawType, baseType, optional });
    }
    structs.set(name, props);
  }
  return structs;
}

/**
 * Extract all `/api/...` route prefixes referenced in a source string.
 */
function extractApiRoutes(source) {
  const routes = new Set();
  const re = /['"`](\/api\/[A-Za-z0-9_/${}()?.=&%\-\\]+)['"`]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const normalized = m[1]
      .split('?')[0]
      .replace(/\$\{[^}]+\}/g, ':param')
      .replace(/\\\([^)]+\)/g, ':param')
      .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, ':param');
    routes.add(normalized);
  }
  return routes;
}

/**
 * Extract a named Kotlin function body from PlayHubApiClient.kt.
 */
function extractKotlinFunctionBody(ktSource, fnName) {
  const startRe = new RegExp(`fun\\s+${fnName}\\s*\\(`);
  const match = startRe.exec(ktSource);
  assert.ok(match, `Could not find Kotlin function ${fnName} in PlayHubApiClient.kt`);
  // Find opening `{` after signature (or expression `=` body for single-expression functions)
  let i = match.index;
  let parenDepth = 0;
  let seenParen = false;
  while (i < ktSource.length) {
    if (ktSource[i] === '(') { parenDepth++; seenParen = true; }
    else if (ktSource[i] === ')') parenDepth--;
    else if (seenParen && parenDepth === 0 && (ktSource[i] === '{' || ktSource[i] === '=')) break;
    i++;
  }
  if (ktSource[i] === '=') {
    // Expression body up to next blank line or `fun `
    const rest = ktSource.slice(i);
    const endIdx = rest.search(/\n\s*(?:@Suppress|private\s+fun|fun\s+)/);
    return endIdx >= 0 ? rest.slice(0, endIdx) : rest;
  }
  let depth = 1;
  i++;
  const start = i;
  while (i < ktSource.length && depth > 0) {
    if (ktSource[i] === '{') depth++;
    else if (ktSource[i] === '}') depth--;
    i++;
  }
  return ktSource.slice(start, i - 1);
}

/**
 * Extract JSON dictionary keys accessed on a specific Kotlin map variable (e.g. `b["foo"]`, `obj?.get("foo")`).
 */
function extractKotlinMapKeys(fnBody, varNames) {
  const keys = new Set();
  for (const v of varNames) {
    const bracketRe = new RegExp(`\\b${v}\\s*\\[\\s*"([^"]+)"\\s*\\]`, 'g');
    const getRe = new RegExp(`\\b${v}\\??\\.get\\(\\s*"([^"]+)"\\s*\\)`, 'g');
    let m;
    while ((m = bracketRe.exec(fnBody)) !== null) keys.add(m[1]);
    while ((m = getRe.exec(fnBody)) !== null) keys.add(m[1]);
  }
  return [...keys];
}

function isRuntimeValueCompatibleWithSwiftType(value, baseType, structs) {
  if (value === undefined) return false;
  if (value === null) return false;
  if (baseType === 'String') return typeof value === 'string';
  if (baseType === 'Bool') return typeof value === 'boolean';
  if (baseType === 'Int' || baseType === 'Double') return typeof value === 'number';
  if (baseType.startsWith('[') && baseType.endsWith(']')) return Array.isArray(value);
  if (structs.has(baseType)) return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  return true;
}

function walkKtFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkKtFiles(full));
    else if (entry.name.endsWith('.kt')) out.push(full);
  }
  return out;
}

test('TC-4.1: Live Hub API JSON DTO schema contract across all 8 required endpoints', async t => {
  const snap = await bootLiveHubAndCollectSnapshots(t);

  // 1. /api/social/profile (+ Web <-> Mobile key parity)
  assert.equal(snap.socialProfile.status, 200);
  const prof = snap.socialProfile.data;
  assertNonEmptyString(prof.principalId, 'social/profile.principalId');
  assertNonEmptyString(prof.displayName, 'social/profile.displayName');
  assert.match(prof.handle, HANDLE_RE);
  assert.match(prof.avatarColor, HEX_COLOR_RE);
  assertString(prof.bio, 'social/profile.bio');
  assert.ok(['public', 'friends', 'private'].includes(prof.privacyLevel));
  assert.ok(['UNKNOWN', 'CHILD_PROTECTED', 'TEEN_MINOR', 'ADULT'].includes(prof.ageTier));
  assert.ok(['not_required', 'pending', 'verified'].includes(prof.parentalConsentStatus));
  assertPresenceDto(prof.presence, 'social/profile.presence');
  assert.equal(snap.mobileSocialProfile.status, 200);
  assert.deepEqual(
    Object.keys(snap.mobileSocialProfile.data).sort(),
    Object.keys(prof).sort(),
    'Web /api/social/profile and Mobile /api/mobile/social/profile must have identical top-level keys'
  );

  // 2. /api/social/users/search (+ parity)
  assert.equal(snap.socialSearch.status, 200);
  assert.ok(Array.isArray(snap.socialSearch.data.users) && snap.socialSearch.data.users.length >= 1);
  for (const u of snap.socialSearch.data.users) {
    assertNonEmptyString(u.principalId, 'social/users/search.users[].principalId');
    assertNonEmptyString(u.displayName, 'social/users/search.users[].displayName');
    assert.match(u.handle, HANDLE_RE);
    assert.match(u.avatarColor, HEX_COLOR_RE);
    assertBoolean(u.isFriend, 'social/users/search.users[].isFriend');
    assertPresenceDto(u.presence, 'social/users/search.users[].presence');
  }
  assert.equal(snap.mobileSocialSearch.status, 200);
  assert.deepEqual(
    Object.keys(snap.mobileSocialSearch.data.users[0]).sort(),
    Object.keys(snap.socialSearch.data.users[0]).sort()
  );

  // 3. /api/social/friends (+ parity)
  assert.equal(snap.socialFriends.status, 200);
  const fr = snap.socialFriends.data;
  assert.ok(Array.isArray(fr.friends) && fr.friends.length >= 1);
  assert.ok(Array.isArray(fr.incomingRequests) && fr.incomingRequests.length >= 1);
  assert.ok(Array.isArray(fr.outgoingRequests) && fr.outgoingRequests.length >= 1);
  assert.ok(Array.isArray(fr.blocked) && fr.blocked.length >= 1);

  const friend = fr.friends[0];
  assertNonEmptyString(friend.principalId, 'friends[].principalId');
  assertNonEmptyString(friend.displayName, 'friends[].displayName');
  assert.match(friend.handle, HANDLE_RE);
  assert.match(friend.avatarColor, HEX_COLOR_RE);
  assertPresenceDto(friend.presence, 'friends[].presence');
  assertNonEmptyString(friend.lastMessage, 'friends[].lastMessage');
  assertIsoDate(friend.lastMessageAt, 'friends[].lastMessageAt');
  assertBoolean(friend.lastMessageFromMe, 'friends[].lastMessageFromMe');

  for (const reqList of [fr.incomingRequests, fr.outgoingRequests]) {
    const r = reqList[0];
    assertNonEmptyString(r.principalId, 'friendRequest.principalId');
    assertNonEmptyString(r.displayName, 'friendRequest.displayName');
    assert.match(r.handle, HANDLE_RE);
    assert.match(r.avatarColor, HEX_COLOR_RE);
    assertIsoDate(r.createdAt, 'friendRequest.createdAt');
  }
  assertNonEmptyString(fr.blocked[0].principalId, 'blocked[].principalId');
  assertNonEmptyString(fr.blocked[0].displayName, 'blocked[].displayName');
  assertNonEmptyString(fr.blocked[0].handle, 'blocked[].handle');
  assert.equal(snap.mobileSocialFriends.status, 200);
  assert.deepEqual(Object.keys(snap.mobileSocialFriends.data).sort(), Object.keys(fr).sort());

  // 4. /api/social/parties & /api/social/parties/me (+ activeLaunch & parity)
  assert.equal(snap.socialPartyMe.status, 200);
  const party = snap.socialPartyMe.data.party;
  assertPlainObject(party, 'social/parties/me.party');
  assertNonEmptyString(party.id, 'party.id');
  assertNonEmptyString(party.leaderId, 'party.leaderId');
  assertNonEmptyString(party.title, 'party.title');
  assert.equal(party.targetGameId, 'pck-arena');
  assert.match(party.roomCode, /^[A-Z2-9]{6}$/);
  assertNumber(party.maxMembers, 'party.maxMembers');
  assertNonEmptyString(party.inviteUrl, 'party.inviteUrl');
  assert.ok(party.deepLinkUrl.startsWith('playhub://join/'));
  assertIsoDate(party.createdAt, 'party.createdAt');
  assertIsoDate(party.updatedAt, 'party.updatedAt');
  assert.ok(Array.isArray(party.members) && party.members.length >= 1);
  const member = party.members[0];
  assertNonEmptyString(member.principalId, 'party.members[].principalId');
  assertNonEmptyString(member.displayName, 'party.members[].displayName');
  assert.match(member.handle, HANDLE_RE);
  assert.match(member.avatarColor, HEX_COLOR_RE);
  assert.ok(['leader', 'member'].includes(member.role));
  assertBoolean(member.ready, 'party.members[].ready');
  assertPresenceDto(member.presence, 'party.members[].presence');

  assertPlainObject(party.activeLaunch, 'party.activeLaunch');
  assertNonEmptyString(party.activeLaunch.launchId, 'party.activeLaunch.launchId');
  assert.equal(party.activeLaunch.gameId, 'pck-arena');
  assert.equal(party.activeLaunch.roomCode, party.roomCode);
  assertNonEmptyString(party.activeLaunch.matchRoomId, 'party.activeLaunch.matchRoomId');
  assertNonEmptyString(party.activeLaunch.launchedBy, 'party.activeLaunch.launchedBy');
  assert.equal(party.activeLaunch.status, 'active');
  assertIsoDate(party.activeLaunch.createdAt, 'party.activeLaunch.createdAt');
  assert.ok(Array.isArray(party.activeLaunch.participants) && party.activeLaunch.participants.length >= 1);
  const part = party.activeLaunch.participants[0];
  assertNonEmptyString(part.principalId, 'activeLaunch.participants[].principalId');
  assertNonEmptyString(part.displayName, 'activeLaunch.participants[].displayName');
  assert.match(part.handle, HANDLE_RE);
  assertNonEmptyString(part.platform, 'activeLaunch.participants[].platform');
  assertNonEmptyString(part.state, 'activeLaunch.participants[].state');
  assertIsoDate(part.updatedAt, 'activeLaunch.participants[].updatedAt');
  assert.equal(snap.mobilePartyMe.status, 200);
  assert.deepEqual(Object.keys(snap.mobilePartyMe.data.party).sort(), Object.keys(party).sort());

  // 5. /api/avatar/catalog
  assert.equal(snap.avatarCatalog.status, 200);
  const avCat = snap.avatarCatalog.data;
  assert.equal(avCat.ok, true);
  assert.ok(Number.isInteger(avCat.schemaVersion) && avCat.schemaVersion >= 1);
  assertNonEmptyString(avCat.catalogVersion, 'avatar/catalog.catalogVersion');
  assert.equal(avCat.currency, 'PlayCoin');
  assert.ok(Array.isArray(avCat.attachmentSlots) && avCat.attachmentSlots.length >= 4);
  assertPlainObject(avCat.rigProfiles, 'avatar/catalog.rigProfiles');
  assertPlainObject(avCat.defaultLoadout, 'avatar/catalog.defaultLoadout');
  assertNonEmptyString(avCat.defaultLoadout.skinId, 'avatar/catalog.defaultLoadout.skinId');
  assertPlainObject(avCat.defaultLoadout.attachments, 'avatar/catalog.defaultLoadout.attachments');
  assert.ok(Array.isArray(avCat.defaultLoadout.emoteWheel));
  assert.ok(Array.isArray(avCat.topupPacks) && avCat.topupPacks.length >= 1);
  const pack = avCat.topupPacks[0];
  assertNonEmptyString(pack.id, 'topupPacks[].id');
  assertNonEmptyString(pack.label, 'topupPacks[].label');
  assertNumber(pack.paidCoins, 'topupPacks[].paidCoins');
  assertNumber(pack.bonusCoins, 'topupPacks[].bonusCoins');
  assertNumber(pack.bonusPercent, 'topupPacks[].bonusPercent');
  assert.ok(Array.isArray(avCat.items) && avCat.items.length >= 10);
  for (const item of avCat.items) {
    assertNonEmptyString(item.id, 'avatar/catalog.items[].id');
    assertNonEmptyString(item.name, 'avatar/catalog.items[].name');
    assert.ok(['skin', 'attachment', 'emote'].includes(item.category));
    assertNumber(item.pricePlayCoin, 'avatar/catalog.items[].pricePlayCoin');
  }

  // 6. /api/avatar/me
  assert.equal(snap.avatarMe.status, 200);
  const avMe = snap.avatarMe.data;
  assert.equal(avMe.ok, true);
  assertPlainObject(avMe.principal, 'avatar/me.principal');
  assertNonEmptyString(avMe.principal.id, 'avatar/me.principal.id');
  assert.equal(avMe.principal.kind, 'registered');
  assertNonEmptyString(avMe.principal.displayName, 'avatar/me.principal.displayName');
  assertPlainObject(avMe.wallet, 'avatar/me.wallet');
  assert.equal(avMe.wallet.currency, 'PlayCoin');
  assertNumber(avMe.wallet.paid, 'avatar/me.wallet.paid');
  assertNumber(avMe.wallet.bonus, 'avatar/me.wallet.bonus');
  assertNumber(avMe.wallet.promo, 'avatar/me.wallet.promo');
  assertNumber(avMe.wallet.total, 'avatar/me.wallet.total');
  assert.equal(avMe.wallet.total, avMe.wallet.paid + avMe.wallet.bonus + avMe.wallet.promo);
  assertBoolean(avMe.wallet.welcomePreview, 'avatar/me.wallet.welcomePreview');
  assert.ok(Array.isArray(avMe.inventory) && avMe.inventory.length >= 1);
  assertNonEmptyString(avMe.inventory[0].itemId, 'avatar/me.inventory[].itemId');
  assertNonEmptyString(avMe.inventory[0].category, 'avatar/me.inventory[].category');
  assertNonEmptyString(avMe.inventory[0].acquiredVia, 'avatar/me.inventory[].acquiredVia');
  assertNumber(avMe.inventory[0].pricePaid, 'avatar/me.inventory[].pricePaid');
  assertPlainObject(avMe.loadout, 'avatar/me.loadout');
  assertNonEmptyString(avMe.loadout.skinId, 'avatar/me.loadout.skinId');
  assertNonEmptyString(avMe.loadout.rigProfile, 'avatar/me.loadout.rigProfile');
  assertPlainObject(avMe.loadout.attachments, 'avatar/me.loadout.attachments');
  assertPlainObject(avMe.loadout.attachmentAssetUrls, 'avatar/me.loadout.attachmentAssetUrls');
  assert.ok(Array.isArray(avMe.loadout.emoteWheel));
  assertNumber(avMe.loadout.revision, 'avatar/me.loadout.revision');
  assert.equal(avMe.loadout.verified, true);
  assert.equal(avMe.loadout.immutableInForge, true);
  assert.match(avMe.loadout.signature, /^[a-f0-9]{64}$/);
  assertIsoDate(avMe.loadout.updatedAt, 'avatar/me.loadout.updatedAt');
  assert.ok(Array.isArray(avMe.ledger));

  // 7. /api/mobile/catalog
  assert.equal(snap.mobileCatalog.status, 200);
  const mobCat = snap.mobileCatalog.data;
  assert.equal(mobCat.forgeSupported, false);
  assertNonEmptyString(mobCat.engineVersion, 'mobile/catalog.engineVersion');
  assertPlainObject(mobCat.ageCompliance, 'mobile/catalog.ageCompliance');
  assertBoolean(mobCat.ageCompliance.completed, 'mobile/catalog.ageCompliance.completed');
  assertNonEmptyString(mobCat.ageCompliance.regionCode, 'mobile/catalog.ageCompliance.regionCode');
  assertNonEmptyString(mobCat.ageCompliance.ageTier, 'mobile/catalog.ageCompliance.ageTier');
  assertNonEmptyString(mobCat.ageCompliance.parentalConsentStatus, 'mobile/catalog.ageCompliance.parentalConsentStatus');
  assert.ok(Array.isArray(mobCat.games) && mobCat.games.length === 2);

  for (const g of mobCat.games) {
    assertNonEmptyString(g.id, 'mobile/catalog.games[].id');
    assertNonEmptyString(g.title, 'mobile/catalog.games[].title');
    assertString(g.description, 'mobile/catalog.games[].description');
    assertNonEmptyString(g.genre, 'mobile/catalog.games[].genre');
    assert.ok(Array.isArray(g.tags));
    assert.ok(Array.isArray(g.controls));
    assertNonEmptyString(g.orientation, 'mobile/catalog.games[].orientation');
    assertNonEmptyString(g.coverUrl, 'mobile/catalog.games[].coverUrl');
    assertNonEmptyString(g.entryUrl, 'mobile/catalog.games[].entryUrl');
    assertNonEmptyString(g.buildId, 'mobile/catalog.games[].buildId');
    assertNumber(g.saveSchemaVersion, 'mobile/catalog.games[].saveSchemaVersion');
    assertNonEmptyString(g.source, 'mobile/catalog.games[].source');
    assertNonEmptyString(g.deployMode, 'mobile/catalog.games[].deployMode');
    assert.ok(['ALL', '12+', '15+', '18+'].includes(g.ageRating));
    assertBoolean(g.allowed, 'mobile/catalog.games[].allowed');
    assert.ok(['web', 'godot-pck'].includes(g.runtime));
    assertPlainObject(g.compatibility, 'mobile/catalog.games[].compatibility');
    assertBoolean(g.compatibility.compatible, 'mobile/catalog.games[].compatibility.compatible');
    assertNullableString(g.compatibility.reason, 'mobile/catalog.games[].compatibility.reason');
    assertNullableString(g.compatibility.message, 'mobile/catalog.games[].compatibility.message');
    assertPlainObject(g.android, 'mobile/catalog.games[].android');
    assertNumber(g.android.minAppVersionCode, 'mobile/catalog.games[].android.minAppVersionCode');
    if (g.runtime === 'godot-pck') {
      assertNonEmptyString(g.android.engineVersion, 'godot-pck.android.engineVersion');
      assertNonEmptyString(g.android.pckUrl, 'godot-pck.android.pckUrl');
      assertNumber(g.android.pckBytes, 'godot-pck.android.pckBytes');
      assertPlainObject(g.multiplayer, 'mo game multiplayer descriptor');
      assertNonEmptyString(g.multiplayer.transport, 'multiplayer.transport');
      assertNonEmptyString(g.multiplayer.wsPath, 'multiplayer.wsPath');
      assert.equal(g.multiplayer.gameId, g.id);
    }
  }

  // 8. /api/billing/catalog
  assert.equal(snap.billingCatalog.status, 200);
  const bill = snap.billingCatalog.data;
  assert.equal(bill.unit, 'PLAYCOIN');
  assert.equal(bill.currency, 'KRW');
  assert.equal(bill.channel, 'web_browser');
  assert.equal(bill.maxBonusBps, 2500);
  assertNonEmptyString(bill.billingMode, 'billing/catalog.billingMode');
  assertNonEmptyString(bill.routingStage, 'billing/catalog.routingStage');
  assert.ok(Array.isArray(bill.enabledProviders) && bill.enabledProviders.length >= 1);
  assertBoolean(bill.allowMockProvider, 'billing/catalog.allowMockProvider');
  assertBoolean(bill.allowDemoAccount, 'billing/catalog.allowDemoAccount');
  assert.ok(Array.isArray(bill.items) && bill.items.length === 8);
  for (const sku of bill.items) {
    assert.equal(sku.unit, 'PLAYCOIN');
    assertNonEmptyString(sku.skuId, 'billing.items[].skuId');
    assertNonEmptyString(sku.titleL10nKey, 'billing.items[].titleL10nKey');
    assert.equal(sku.currency, 'KRW');
    assert.equal(sku.channel, 'web_browser');
    assertNumber(sku.amountMinor, 'billing.items[].amountMinor');
    assertNumber(sku.baseCoins, 'billing.items[].baseCoins');
    assertNumber(sku.bonusBps, 'billing.items[].bonusBps');
    assertNumber(sku.bonusPercent, 'billing.items[].bonusPercent');
    assertNumber(sku.bonusCoins, 'billing.items[].bonusCoins');
    assert.equal(sku.totalCoins, sku.baseCoins + sku.bonusCoins);
    assert.equal(sku.mobileBaseCoins, sku.baseCoins);
  }
  assertPlainObject(bill.paymentMethods, 'billing/catalog.paymentMethods');
  assert.ok(Array.isArray(bill.paymentMethods.koreaLocal));
  assertPlainObject(bill.paymentMethods.koreaEasyPay, 'billing/catalog.paymentMethods.koreaEasyPay');
  for (const key of ['kakaopay', 'naverpay', 'tosspay', 'card_kr']) {
    assertPlainObject(bill.paymentMethods.koreaEasyPay[key], `koreaEasyPay.${key}`);
    assertNonEmptyString(bill.paymentMethods.koreaEasyPay[key].method, `koreaEasyPay.${key}.method`);
    assertNonEmptyString(bill.paymentMethods.koreaEasyPay[key].label, `koreaEasyPay.${key}.label`);
    assertBoolean(bill.paymentMethods.koreaEasyPay[key].configured, `koreaEasyPay.${key}.configured`);
  }
  assert.ok(Array.isArray(bill.paymentMethods.global));
  assertNonEmptyString(bill.paymentMethods.googlePayNote, 'billing.paymentMethods.googlePayNote');
  assertPlainObject(bill.plans, 'billing/catalog.plans');
  assertPlainObject(bill.creatorDirectPolicy, 'billing/catalog.creatorDirectPolicy');
  assert.equal(bill.creatorDirectPolicy.platformFeePercent, 0);
  assert.equal(bill.creatorDirectPolicy.playhubHoldsCreatorFunds, false);
  assert.ok(Array.isArray(bill.creatorDirectPolicy.enabledPlatforms));
});

test('TC-4.2: Static endpoint contract parity across Web (social.js), iOS (PlayHubApiClient.swift), and Android (com.playhub.aos)', () => {
  const webSrc = fs.readFileSync(WEB_SOCIAL_PATH, 'utf8');
  const iosSrc = fs.readFileSync(IOS_API_CLIENT_PATH, 'utf8');
  const androidFiles = walkKtFiles(ANDROID_ROOT_DIR);
  assert.ok(androidFiles.length >= 10, 'Expected Android Kotlin source files');
  const androidCombinedSrc = androidFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n');

  const webRoutes = extractApiRoutes(webSrc);
  const iosRoutes = extractApiRoutes(iosSrc);
  const androidRoutes = extractApiRoutes(androidCombinedSrc);

  for (const route of [
    '/api/social/profile',
    '/api/social/users/search',
    '/api/social/friends',
    '/api/social/friends/request',
    '/api/social/friends/respond',
    '/api/social/parties/me',
    '/api/social/parties',
    '/api/social/parties/join',
    '/api/social/messages',
    '/api/social/presence',
    '/api/social/quick-messages',
    '/api/social/blocks',
    '/api/social/reports',
  ]) {
    assert.ok(webRoutes.has(route), `Web social.js missing expected route reference: ${route}`);
  }

  for (const route of [
    '/api/mobile/catalog',
    '/api/mobile/social/profile',
    '/api/mobile/social/users/search',
    '/api/mobile/social/friends',
    '/api/mobile/social/friends/request',
    '/api/mobile/social/friends/respond',
    '/api/mobile/social/parties/me',
    '/api/mobile/social/parties',
    '/api/mobile/social/parties/join',
    '/api/mobile/social/messages',
    '/api/mobile/social/presence',
    '/api/mobile/social/quick-messages',
  ]) {
    assert.ok(iosRoutes.has(route), `iOS PlayHubApiClient.swift missing expected route reference: ${route}`);
    assert.ok(androidRoutes.has(route), `Android com.playhub.aos missing expected route reference: ${route}`);
  }
});

test('TC-4.3: Static field reference parsing (Web / iOS / Android) vs live server JSON with strict KNOWN_CLIENT_DRIFT enforcement', async t => {
  const snap = await bootLiveHubAndCollectSnapshots(t);
  const observedKnownDrifts = new Set();
  const unexpectedDrifts = [];

  function recordMismatch(driftId, detail) {
    if (Object.hasOwn(KNOWN_CLIENT_DRIFT, driftId)) {
      observedKnownDrifts.add(driftId);
    } else {
      unexpectedDrifts.push(`${driftId}: ${detail}`);
    }
  }

  // --- A. iOS Swift Codable struct verification against live server payloads ---
  const iosSrc = fs.readFileSync(IOS_API_CLIENT_PATH, 'utf8');
  const swiftStructs = parseSwiftCodableStructs(iosSrc);

  const pckGame = snap.mobileCatalog.data.games.find(g => g.runtime === 'godot-pck');
  assert.ok(pckGame, 'Expected godot-pck game sample in mobile catalog');

  const iosContractPairs = [
    ['MobileCatalogResponse', snap.mobileCatalog.data],
    ['MobileCatalogGame', pckGame],
    ['MobileCatalogGameCompatibility', pckGame.compatibility],
    ['MobileCatalogGameMultiplayer', pckGame.multiplayer],
    ['MobileAgeCompliance', snap.mobileCatalog.data.ageCompliance],
    ['SocialPresence', snap.mobileSocialProfile.data.presence],
    ['SocialProfile', snap.mobileSocialProfile.data],
    ['SocialSearchResponse', snap.mobileSocialSearch.data],
    ['SocialUserHit', snap.mobileSocialSearch.data.users[0]],
    ['SocialFriendsResponse', snap.mobileSocialFriends.data],
    ['SocialFriend', snap.mobileSocialFriends.data.friends[0]],
    ['SocialFriendRequest', snap.mobileSocialFriends.data.incomingRequests[0]],
    ['SocialPartyResponse', snap.mobilePartyMe.data],
    ['SocialParty', snap.mobilePartyMe.data.party],
    ['SocialPartyMember', snap.mobilePartyMe.data.party.members[0]],
    ['SocialPartyLaunch', snap.mobilePartyMe.data.party.activeLaunch],
    ['SocialLaunchParticipant', snap.mobilePartyMe.data.party.activeLaunch.participants[0]],
    ['SocialMessagesResponse', snap.socialMessages.data],
    ['SocialMessage', snap.socialMessages.data.messages[0]],
  ];

  for (const [structName, liveObj] of iosContractPairs) {
    const props = swiftStructs.get(structName);
    assert.ok(props && props.length > 0, `Swift Codable struct ${structName} not found in PlayHubApiClient.swift`);
    assertPlainObject(liveObj, `Live payload for ${structName}`);

    for (const prop of props) {
      const driftId = `ios:PlayHubApiClient.swift:${structName}.${prop.name}`;
      const hasKey = Object.hasOwn(liveObj, prop.name);
      const val = liveObj[prop.name];

      if (!hasKey) {
        recordMismatch(driftId, `key missing in live server JSON (Swift type: ${prop.rawType})`);
        continue;
      }
      if (val === null) {
        if (!prop.optional) {
          recordMismatch(driftId, `server returned null for non-optional Swift type ${prop.rawType}`);
        }
        continue;
      }
      if (!isRuntimeValueCompatibleWithSwiftType(val, prop.baseType, swiftStructs)) {
        recordMismatch(
          driftId,
          `server type (${Array.isArray(val) ? 'array' : typeof val}) incompatible with Swift ${prop.rawType}`
        );
      }
    }
  }

  // --- B. Android Kotlin PlayHubApiClient.kt field access verification (expects 0 drifts!) ---
  const androidSrc = fs.readFileSync(ANDROID_API_CLIENT_PATH, 'utf8');
  const androidChecks = [
    {
      fn: 'fetchSocialProfile',
      vars: ['b'],
      liveObj: snap.mobileSocialProfile.data,
    },
    {
      fn: 'searchSocialUsers',
      vars: ['b'],
      liveObj: snap.mobileSocialSearch.data,
    },
    {
      fn: 'searchSocialUsers',
      vars: ['u'],
      liveObj: snap.mobileSocialSearch.data.users[0],
    },
    {
      fn: 'fetchSocialFriends',
      vars: ['b'],
      liveObj: snap.mobileSocialFriends.data,
    },
    {
      fn: 'fetchSocialFriends',
      vars: ['f'],
      liveObj: snap.mobileSocialFriends.data.friends[0],
    },
    {
      fn: 'fetchSocialFriends',
      vars: ['r'],
      liveObj: snap.mobileSocialFriends.data.incomingRequests[0],
    },
    {
      fn: 'parsePresence',
      vars: ['obj'],
      liveObj: snap.mobileSocialProfile.data.presence,
    },
    {
      fn: 'parseParty',
      vars: ['p'],
      liveObj: snap.mobilePartyMe.data.party,
    },
    {
      fn: 'parseParty',
      vars: ['m'],
      liveObj: snap.mobilePartyMe.data.party.members[0],
    },
    {
      fn: 'parseParty',
      vars: ['launchMap'],
      liveObj: snap.mobilePartyMe.data.party.activeLaunch,
    },
    {
      fn: 'parseParty',
      vars: ['pt'],
      liveObj: snap.mobilePartyMe.data.party.activeLaunch.participants[0],
    },
    {
      fn: 'fetchCatalog',
      vars: ['g'],
      liveObj: pckGame,
    },
    {
      fn: 'fetchCatalog',
      vars: ['androidObj'],
      liveObj: pckGame.android,
    },
    {
      fn: 'fetchCatalog',
      vars: ['mpObj'],
      liveObj: pckGame.multiplayer,
    },
  ];

  for (const chk of androidChecks) {
    const body = extractKotlinFunctionBody(androidSrc, chk.fn);
    const keys = extractKotlinMapKeys(body, chk.vars);
    assert.ok(keys.length > 0, `Expected Kotlin JSON keys extracted from ${chk.fn} (${chk.vars.join(',')})`);
    for (const key of keys) {
      if (!Object.hasOwn(chk.liveObj, key)) {
        recordMismatch(
          `android:PlayHubApiClient.kt:${chk.fn}.${key}`,
          `key "${key}" read by Android is missing from live server response`
        );
      }
    }
  }

  // --- C. Web hub/web/user/social.js field reference verification ---
  const webSrc = fs.readFileSync(WEB_SOCIAL_PATH, 'utf8');

  // Strict matching fields referenced in social.js
  for (const field of ['principalId', 'displayName', 'handle', 'avatarColor']) {
    assert.ok(webSrc.includes(`p.${field}`), `Web social.js should reference profile.${field}`);
    assert.ok(Object.hasOwn(snap.socialProfile.data, field), `Live /api/social/profile missing ${field}`);
  }
  for (const field of ['ageTier', 'parentalConsentStatus']) {
    assert.ok(
      webSrc.includes(`model.profile?.${field}`),
      `Web social.js should reference flat model.profile?.${field}`
    );
    assert.ok(Object.hasOwn(snap.socialProfile.data, field), `Live /api/social/profile missing ${field}`);
  }
  assert.ok(/\bu\.isFriend\b/.test(webSrc), 'Web social.js should reference u.isFriend on search results');
  assert.ok(Object.hasOwn(snap.socialSearch.data.users[0], 'isFriend'), 'Live /api/social/users/search missing isFriend');
  for (const field of ['lastMessage', 'lastMessageAt', 'lastMessageFromMe']) {
    assert.ok(webSrc.includes(`f.${field}`), `Web social.js should reference friend.${field}`);
    assert.ok(Object.hasOwn(snap.socialFriends.data.friends[0], field), `Live /api/social/friends missing ${field}`);
  }
  for (const field of ['friends', 'incomingRequests', 'outgoingRequests']) {
    assert.ok(webSrc.includes(`fr.${field}`), `Web social.js should reference friends.${field}`);
    assert.ok(Object.hasOwn(snap.socialFriends.data, field), `Live /api/social/friends missing ${field}`);
  }
  for (const field of ['id', 'title', 'targetGameId', 'roomCode', 'maxMembers', 'members', 'activeLaunch']) {
    assert.ok(webSrc.includes(`model.party.${field}`), `Web social.js should reference party.${field}`);
    assert.ok(Object.hasOwn(snap.socialPartyMe.data.party, field), `Live /api/social/parties/me missing party.${field}`);
  }
  for (const field of ['launchId', 'gameId', 'roomCode', 'matchRoomId', 'participants']) {
    assert.ok(
      webSrc.includes(`activeLaunch.${field}`) || webSrc.includes(`l.${field}`),
      `Web social.js should reference activeLaunch.${field}`
    );
    assert.ok(
      Object.hasOwn(snap.socialPartyMe.data.party.activeLaunch, field),
      `Live activeLaunch missing ${field}`
    );
  }

  // Static drift checks on Web social.js expressions against live server payloads
  if (/model\.profile\?\.ageCompliance\?\.ageTier/.test(webSrc) && !Object.hasOwn(snap.socialProfile.data, 'ageCompliance')) {
    recordMismatch(
      'web:social.js:/api/social/profile:ageCompliance',
      'social.js reads model.profile?.ageCompliance?.ageTier but server returns flat ageTier'
    );
  }
  if (/\bu\.relation\b/.test(webSrc) && !Object.hasOwn(snap.socialSearch.data.users[0], 'relation')) {
    recordMismatch(
      'web:social.js:/api/social/users/search:relation',
      'social.js reads u.relation on search results but server returns isFriend'
    );
  }
  if (/\bf\.lastMessage\?\.body\b/.test(webSrc) && typeof snap.socialFriends.data.friends[0].lastMessage === 'string') {
    recordMismatch(
      'web:social.js:/api/social/friends:lastMessage.body',
      'social.js reads f.lastMessage?.body assuming object, but server returns string | null'
    );
  }

  // --- Final Assertions ---
  assert.equal(
    Object.keys(KNOWN_CLIENT_DRIFT).length,
    0,
    'KNOWN_CLIENT_DRIFT must remain empty (0-drift strict contract across Web, iOS, and Android)'
  );
  assert.deepEqual(
    unexpectedDrifts,
    [],
    `Undocumented client-vs-server DTO contract drift detected:\n${unexpectedDrifts.join('\n')}`
  );

  // Every documented drift must still exist; if a client was fixed, remove its entry from KNOWN_CLIENT_DRIFT
  const staleDriftEntries = Object.keys(KNOWN_CLIENT_DRIFT).filter(k => !observedKnownDrifts.has(k));
  assert.deepEqual(
    staleDriftEntries,
    [],
    `Stale KNOWN_CLIENT_DRIFT entries (already fixed in code! Remove from allowlist to lock strict contract):\n${staleDriftEntries.join('\n')}`
  );
});
