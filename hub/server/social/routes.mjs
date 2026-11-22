import { randomBytes } from 'node:crypto';
import { transaction } from '../db.mjs';
import { findGame } from '../catalog.mjs';
import { canPlayAgeRating, normalizeAgeRating } from '../mobile/age-gate.mjs';
import { hasActiveSanction } from '../ssot/sanctions.mjs';
import { ApiError, json, readJson, uid } from '../security.mjs';
import { ensureSocialSchema } from './schema.mjs';

function cleanText(value, max = 128) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

export const SAFE_QUICK_MESSAGES = Object.freeze([
  { id: 'qm_hi', text: '안녕!' },
  { id: 'qm_play', text: '같이 플레이할래?' },
  { id: 'qm_ready', text: '준비 완료!' },
  { id: 'qm_gg', text: '잘했어!' },
  { id: 'qm_wait', text: '잠시만 기다려줘!' }
]);

const QUICK_MESSAGE_MAP = new Map(SAFE_QUICK_MESSAGES.map(q => [q.id, q.text]));
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const HANDLE_RE = /^[A-Za-z0-9가-힣_.-]{2,20}#[0-9]{4}$/;
const GAME_ID_RE = /^[a-zA-Z0-9_-]+$/;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PRESENCE_STALE_MS = 5 * 60 * 1000;

function gameAgeRating(game) {
  if (!game) return 'ALL';
  if (game.ageRating) return normalizeAgeRating(game.ageRating);
  if ((game.tags || []).includes('18+')) return '18+';
  if ((game.tags || []).includes('15+')) return '15+';
  if ((game.tags || []).includes('12+')) return '12+';
  return 'ALL';
}

function generateRoomCode() {
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  }
  return out;
}

function dmChannelKey(a, b) {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function sanitizeHandleBase(displayName, principalId) {
  const cleaned = String(displayName || '')
    .replace(/[^A-Za-z0-9가-힣_.-]/g, '')
    .slice(0, 14);
  if (cleaned.length >= 2) return cleaned;
  return `player${String(principalId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 4) || '00'}`;
}

function defaultEnsureCompliance(db, principalId) {
  try {
    const row = principalId
      ? db.prepare('SELECT region_code, age_tier, parental_consent_status FROM user_age_compliance WHERE principal_id=?').get(principalId)
      : null;
    if (row) {
      const ageTier = row.age_tier || 'UNKNOWN';
      return {
        completed: ageTier !== 'UNKNOWN',
        regionCode: row.region_code || 'KR',
        ageTier,
        parentalConsentStatus: row.parental_consent_status || 'not_required'
      };
    }
  } catch {
    // Fail-Closed: return UNKNOWN instead of ADULT when compliance lookup fails
  }
  return { completed: false, regionCode: 'KR', ageTier: 'UNKNOWN', parentalConsentStatus: 'not_required' };
}

export function createSocial({
  db,
  rootDir = null,
  catalogOptions = {},
  now,
  rate,
  audit,
  bearerPayload,
  resolveAuth,
  ensureCompliance,
  rejectBrowserOrigin,
  config,
  prefix = '/api/mobile/social'
}) {
  ensureSocialSchema(db);
  const effectiveRootDir = rootDir || config?._rootDir || null;
  const effectiveCatalogOptions = Object.keys(catalogOptions || {}).length
    ? catalogOptions
    : (config?._catalogOptions || {});
  const complianceLookup = ensureCompliance || (userId => defaultEnsureCompliance(db, userId));
  const authUser = (req, res, required = true) =>
    resolveAuth ? resolveAuth(req, res, required) : bearerPayload(req, required);
  const guardMutation = req => {
    if (rejectBrowserOrigin) rejectBrowserOrigin(req);
  };
  const prefixSlash = prefix.endsWith('/') ? prefix : `${prefix}/`;

  function assertNotSanctioned(principalId, scopes = []) {
    if (!principalId) return;
    const checkScopes = ['all', ...scopes];
    try {
      if (hasActiveSanction(db, principalId, checkScopes, now())) {
        throw new ApiError(403, 'USER_SANCTIONED', '제재가 적용되어 해당 기능을 이용할 수 없습니다.');
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (!String(err?.message || '').includes('no such table')) throw err;
    }
  }

  function validateCatalogGame(gameId, comp = null) {
    if (!GAME_ID_RE.test(gameId)) {
      throw new ApiError(400, 'INVALID_GAME_ID', '올바른 게임 ID 형식이 아닙니다.');
    }
    let game = null;
    if (effectiveRootDir) {
      game = findGame(effectiveRootDir, db, gameId, true, effectiveCatalogOptions);
    }
    if (comp && game) {
      const rating = gameAgeRating(game);
      if (!canPlayAgeRating(comp.ageTier, rating, comp.parentalConsentStatus)) {
        throw new ApiError(403, 'AGE_RATING_RESTRICTED', `연령 등급(${rating}) 제한으로 실행할 수 없습니다.`);
      }
    }
    return game;
  }

  function ensureProfile(user) {
    const existing = db.prepare('SELECT * FROM user_profiles WHERE principal_id=?').get(user.id);
    if (existing) return existing;
    const stamp = now();
    const base = sanitizeHandleBase(user.display_name, user.id);
    let handle = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const num = String((parseInt(randomBytes(2).toString('hex'), 16) % 9000) + 1000);
      const candidate = `${base}#${num}`;
      const clash = db.prepare('SELECT 1 FROM user_profiles WHERE LOWER(handle)=LOWER(?)').get(candidate);
      if (!clash) {
        handle = candidate;
        break;
      }
    }
    if (!handle) {
      handle = `p${uid().slice(0, 8)}#${String((stamp % 9000) + 1000)}`;
    }
    db.prepare(
      "INSERT OR IGNORE INTO user_profiles(principal_id,handle,avatar_color,bio,privacy_level,updated_at) VALUES(?,?,'#00B06F','','public',?)"
    ).run(user.id, handle, stamp);
    return db.prepare('SELECT * FROM user_profiles WHERE principal_id=?').get(user.id);
  }

  function isBlockedBetween(a, b) {
    return Boolean(
      db.prepare('SELECT 1 FROM social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)')
        .get(a, b, b, a)
    );
  }

  function areFriends(a, b) {
    return Boolean(
      db.prepare(
        "SELECT 1 FROM social_friendships WHERE status='accepted' AND ((requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?))"
      ).get(a, b, b, a)
    );
  }

  function formatPresence(row, nowMs, { hideRoomCode = false } = {}) {
    if (!row || row.status === 'offline' || nowMs - row.updated_at > PRESENCE_STALE_MS) {
      return { status: 'offline', online: false, gameId: null, gameTitle: null, roomCode: null, joinable: false };
    }
    const joinable = Boolean(row.joinable);
    return {
      status: row.status,
      online: true,
      gameId: row.game_id || null,
      gameTitle: row.game_title || null,
      roomCode: (joinable && !hideRoomCode) ? (row.room_code || null) : null,
      joinable
    };
  }

  function assertSocialAllowed(user, { allowChildWithConsent = false } = {}) {
    const comp = complianceLookup(user.id);
    if (!comp || !comp.ageTier || comp.ageTier === 'UNKNOWN') {
      throw new ApiError(
        403,
        'AGE_GATE_REQUIRED',
        '연령 확인을 완료한 후 소셜 기능을 이용할 수 있습니다.'
      );
    }
    if (comp.ageTier === 'CHILD_PROTECTED') {
      if (comp.parentalConsentStatus !== 'verified') {
        throw new ApiError(
          403,
          'PARENTAL_CONSENT_REQUIRED',
          '아동 보호 모드에서는 법정대리인 동의 후 안전 소셜 기능을 이용할 수 있습니다.'
        );
      }
      if (!allowChildWithConsent) {
        throw new ApiError(
          403,
          'CHILD_SOCIAL_RESTRICTED',
          '아동 보호 모드에서는 해당 소셜 기능이 제한됩니다.'
        );
      }
    }
    return comp;
  }

  function buildPartyDto(partyId) {
    const party = db.prepare('SELECT * FROM social_parties WHERE id=?').get(partyId);
    if (!party) return null;
    const nowMs = now();
    const members = db.prepare(
      `SELECT m.principal_id, m.role, m.ready_state, m.joined_at, u.display_name, p.handle, p.avatar_color,
              pr.status AS presence_status, pr.game_id AS presence_game_id, pr.game_title AS presence_game_title,
              pr.room_code AS presence_room_code, pr.joinable AS presence_joinable, pr.updated_at AS presence_updated_at
       FROM social_party_members m
       JOIN users u ON u.id = m.principal_id
       LEFT JOIN user_profiles p ON p.principal_id = m.principal_id
       LEFT JOIN social_presence pr ON pr.principal_id = m.principal_id
       WHERE m.party_id = ?
       ORDER BY m.role DESC, m.joined_at ASC`
    ).all(partyId).map(row => ({
      principalId: row.principal_id,
      displayName: row.display_name || 'Player',
      handle: row.handle || `player#${row.principal_id.slice(-4)}`,
      avatarColor: row.avatar_color || '#00B06F',
      role: row.role,
      ready: Boolean(row.ready_state),
      presence: formatPresence(
        row.presence_status ? {
          status: row.presence_status,
          game_id: row.presence_game_id,
          game_title: row.presence_game_title,
          room_code: row.presence_room_code,
          joinable: row.presence_joinable,
          updated_at: row.presence_updated_at
        } : null,
        nowMs
      )
    }));
    const leader = members.find(m => m.principalId === party.leader_id);
    const baseUrl = (config?.userBaseUrl || 'https://playhub.example.com').replace(/\/$/, '');
    const gameSlug = encodeURIComponent(party.target_game_id || 'lobby');
    const roomParam = encodeURIComponent(party.room_code);
    const inviterParam = encodeURIComponent(leader?.handle || 'leader');
    const launchRow = db.prepare(
      "SELECT * FROM social_party_launches WHERE party_id=? AND status='active' ORDER BY created_at DESC LIMIT 1"
    ).get(partyId);
    let activeLaunch = null;
    if (launchRow) {
      const ackRows = db.prepare(
        `SELECT a.principal_id, a.platform, a.state, a.updated_at, u.display_name, p.handle, p.avatar_color
         FROM social_party_launch_acks a
         JOIN users u ON u.id = a.principal_id
         LEFT JOIN user_profiles p ON p.principal_id = a.principal_id
         WHERE a.launch_id=?
         ORDER BY a.updated_at ASC`
      ).all(launchRow.launch_id);
      activeLaunch = {
        launchId: launchRow.launch_id,
        gameId: launchRow.game_id,
        roomCode: launchRow.room_code,
        matchRoomId: launchRow.match_room_id,
        launchedBy: launchRow.launched_by,
        status: launchRow.status,
        createdAt: new Date(launchRow.created_at).toISOString(),
        participants: ackRows.map(r => ({
          principalId: r.principal_id,
          displayName: r.display_name || 'Player',
          handle: r.handle || `player#${r.principal_id.slice(-4)}`,
          avatarColor: r.avatar_color || '#00B06F',
          platform: r.platform || 'web',
          state: r.state,
          updatedAt: new Date(r.updated_at).toISOString()
        }))
      };
    }
    return {
      id: party.id,
      leaderId: party.leader_id,
      title: party.title,
      targetGameId: party.target_game_id || null,
      roomCode: party.room_code,
      maxMembers: party.max_members,
      inviteUrl: `${baseUrl}/join/${gameSlug}?room=${roomParam}&inviter=${inviterParam}`,
      deepLinkUrl: `playhub://join/${gameSlug}?room=${roomParam}&inviter=${inviterParam}`,
      members,
      activeLaunch,
      createdAt: new Date(party.created_at).toISOString(),
      updatedAt: new Date(party.updated_at).toISOString()
    };
  }

  function findActivePartyId(principalId) {
    const row = db.prepare('SELECT party_id FROM social_party_members WHERE principal_id=?').get(principalId);
    return row ? row.party_id : null;
  }

  function leaveCurrentParty(principalId) {
    const partyId = findActivePartyId(principalId);
    if (!partyId) return null;
    const stamp = now();
    transaction(db, () => {
      db.prepare('DELETE FROM social_party_members WHERE party_id=? AND principal_id=?').run(partyId, principalId);
      const remaining = db.prepare(
        'SELECT principal_id FROM social_party_members WHERE party_id=? ORDER BY joined_at ASC'
      ).all(partyId);
      if (remaining.length === 0) {
        db.prepare('DELETE FROM social_parties WHERE id=?').run(partyId);
      } else {
        const party = db.prepare('SELECT leader_id FROM social_parties WHERE id=?').get(partyId);
        if (party && party.leader_id === principalId) {
          const nextLeader = remaining[0].principal_id;
          db.prepare('UPDATE social_parties SET leader_id=?, updated_at=? WHERE id=?').run(nextLeader, stamp, partyId);
          db.prepare("UPDATE social_party_members SET role='leader' WHERE party_id=? AND principal_id=?").run(partyId, nextLeader);
        }
      }
    });
    return partyId;
  }

  async function route(req, res, url) {
    const rawPath = url.pathname;
    if (!rawPath.startsWith(prefixSlash)) return false;
    const path = '/' + rawPath.slice(prefixSlash.length);

    // 1. Safe quick messages list (public/authenticated)
    if (path === '/quick-messages' && req.method === 'GET') {
      json(res, 200, { quickMessages: SAFE_QUICK_MESSAGES });
      return true;
    }

    // 2. Own Social Profile (GET / PUT)
    if (path === '/profile' && req.method === 'GET') {
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      const prof = ensureProfile(auth.user);
      const comp = complianceLookup(auth.user.id);
      const presence = formatPresence(
        db.prepare('SELECT * FROM social_presence WHERE principal_id=?').get(auth.user.id),
        now()
      );
      json(res, 200, {
        principalId: auth.user.id,
        displayName: auth.user.display_name || 'Player',
        handle: prof.handle,
        avatarColor: prof.avatar_color,
        bio: prof.bio,
        privacyLevel: prof.privacy_level,
        ageTier: comp.ageTier,
        parentalConsentStatus: comp.parentalConsentStatus,
        presence
      });
      return true;
    }

    if (path === '/profile' && req.method === 'PUT') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['community']);
      rate(`social-profile:${auth.user.id}`, 30, 60000);
      const body = await readJson(req, 8192);
      const prof = ensureProfile(auth.user);
      const comp = complianceLookup(auth.user.id);
      const stamp = now();

      const nextDisplayName = body.displayName !== undefined
        ? cleanText(body.displayName, 40)
        : (auth.user.display_name || 'Player');
      if (nextDisplayName.length < 2) throw new ApiError(422, 'INVALID_DISPLAY_NAME', '표시 이름은 2자 이상이어야 합니다.');

      const nextAvatarColor = body.avatarColor !== undefined
        ? String(body.avatarColor).trim()
        : prof.avatar_color;
      if (!HEX_COLOR_RE.test(nextAvatarColor)) throw new ApiError(422, 'INVALID_AVATAR_COLOR', '올바른 HEX 색상이 아닙니다.');

      let nextBio = body.bio !== undefined ? cleanText(body.bio, 120) : prof.bio;
      let nextPrivacy = body.privacyLevel !== undefined ? String(body.privacyLevel) : prof.privacy_level;
      if (!['public', 'friends', 'private'].includes(nextPrivacy)) {
        throw new ApiError(422, 'INVALID_PRIVACY_LEVEL');
      }
      if (comp.ageTier === 'CHILD_PROTECTED') {
        nextBio = '';
        if (nextPrivacy === 'public') nextPrivacy = 'friends';
      }

      let nextHandle = prof.handle;
      if (body.handle !== undefined) {
        const candidate = String(body.handle).trim();
        if (!HANDLE_RE.test(candidate)) {
          throw new ApiError(422, 'INVALID_HANDLE', '핸들은 이름#1234 형식이어야 합니다.');
        }
        const taken = db.prepare('SELECT principal_id FROM user_profiles WHERE LOWER(handle)=LOWER(?)').get(candidate);
        if (taken && taken.principal_id !== auth.user.id) {
          throw new ApiError(409, 'HANDLE_TAKEN', '이미 사용 중인 핸들입니다.');
        }
        nextHandle = candidate;
      }

      transaction(db, () => {
        db.prepare('UPDATE users SET display_name=? WHERE id=?').run(nextDisplayName, auth.user.id);
        db.prepare(
          'UPDATE user_profiles SET handle=?, avatar_color=?, bio=?, privacy_level=?, updated_at=? WHERE principal_id=?'
        ).run(nextHandle, nextAvatarColor, nextBio, nextPrivacy, stamp, auth.user.id);
      });

      json(res, 200, {
        principalId: auth.user.id,
        displayName: nextDisplayName,
        handle: nextHandle,
        avatarColor: nextAvatarColor,
        bio: nextBio,
        privacyLevel: nextPrivacy
      });
      return true;
    }

    // 3. Search Players by Handle or Display Name
    if (path === '/users/search' && req.method === 'GET') {
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['community']);
      rate(`social-search:${auth.user.id}`, 60, 60000);
      ensureProfile(auth.user);
      const q = cleanText(url.searchParams.get('q') || '', 40);
      if (q.length < 2) {
        json(res, 200, { users: [] });
        return true;
      }
      const pattern = `%${q.toLowerCase()}%`;
      const nowMs = now();
      const rows = db.prepare(
        `SELECT u.id, u.display_name, p.handle, p.avatar_color, p.privacy_level,
                pr.status AS presence_status, pr.game_id, pr.game_title, pr.room_code, pr.joinable, pr.updated_at AS pr_updated
         FROM users u
         JOIN user_profiles p ON p.principal_id = u.id
         LEFT JOIN social_presence pr ON pr.principal_id = u.id
         LEFT JOIN user_age_compliance c ON c.principal_id = u.id
         WHERE u.id <> ?
           AND p.privacy_level = 'public'
           AND COALESCE(c.age_tier, 'ADULT') <> 'CHILD_PROTECTED'
           AND (LOWER(p.handle) LIKE ? OR LOWER(COALESCE(u.display_name,'')) LIKE ?)
           AND NOT EXISTS (
             SELECT 1 FROM social_blocks b
             WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)
           )
         ORDER BY p.handle ASC
         LIMIT 20`
      ).all(auth.user.id, pattern, pattern, auth.user.id, auth.user.id);

      json(res, 200, {
        users: rows.map(r => {
          const isFriend = areFriends(auth.user.id, r.id);
          return {
            principalId: r.id,
            displayName: r.display_name || 'Player',
            handle: r.handle,
            avatarColor: r.avatar_color || '#00B06F',
            isFriend,
            presence: formatPresence(
              r.presence_status ? {
                status: r.presence_status,
                game_id: r.game_id,
                game_title: r.game_title,
                room_code: r.room_code,
                joinable: r.joinable,
                updated_at: r.pr_updated
              } : null,
              nowMs,
              { hideRoomCode: !isFriend }
            )
          };
        })
      });
      return true;
    }

    // 4. Friends List + Live Presence + Last DM Preview + Pending Requests + Blocked Users
    if (path === '/friends' && req.method === 'GET') {
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      ensureProfile(auth.user);
      const nowMs = now();

      const acceptedRows = db.prepare(
        `SELECT CASE WHEN f.requester_id=? THEN f.addressee_id ELSE f.requester_id END AS peer_id,
                f.updated_at AS friend_since
         FROM social_friendships f
         WHERE f.status='accepted' AND (f.requester_id=? OR f.addressee_id=?)`
      ).all(auth.user.id, auth.user.id, auth.user.id);

      const friends = [];
      for (const rel of acceptedRows) {
        if (isBlockedBetween(auth.user.id, rel.peer_id)) continue;
        const u = db.prepare('SELECT id, display_name FROM users WHERE id=?').get(rel.peer_id);
        if (!u) continue;
        const prof = ensureProfile(u);
        const presRow = db.prepare('SELECT * FROM social_presence WHERE principal_id=?').get(u.id);
        const key = dmChannelKey(auth.user.id, u.id);
        const lastMsg = db.prepare(
          "SELECT body, sender_id, created_at FROM social_messages WHERE channel_type='dm' AND channel_key=? ORDER BY created_at DESC LIMIT 1"
        ).get(key);
        friends.push({
          principalId: u.id,
          displayName: u.display_name || 'Player',
          handle: prof.handle,
          avatarColor: prof.avatar_color || '#00B06F',
          presence: formatPresence(presRow, nowMs),
          lastMessage: lastMsg?.body || null,
          lastMessageAt: lastMsg ? new Date(lastMsg.created_at).toISOString() : null,
          lastMessageFromMe: lastMsg ? lastMsg.sender_id === auth.user.id : false
        });
      }
      friends.sort((a, b) => Number(b.presence.online) - Number(a.presence.online) || a.displayName.localeCompare(b.displayName));

      const incoming = db.prepare(
        `SELECT f.requester_id, f.created_at, u.display_name, p.handle, p.avatar_color
         FROM social_friendships f
         JOIN users u ON u.id = f.requester_id
         LEFT JOIN user_profiles p ON p.principal_id = f.requester_id
         WHERE f.addressee_id=? AND f.status='pending'
         ORDER BY f.created_at DESC`
      ).all(auth.user.id).filter(r => !isBlockedBetween(auth.user.id, r.requester_id)).map(r => ({
        principalId: r.requester_id,
        displayName: r.display_name || 'Player',
        handle: r.handle || `player#${r.requester_id.slice(-4)}`,
        avatarColor: r.avatar_color || '#00B06F',
        createdAt: new Date(r.created_at).toISOString()
      }));

      const outgoing = db.prepare(
        `SELECT f.addressee_id, f.created_at, u.display_name, p.handle, p.avatar_color
         FROM social_friendships f
         JOIN users u ON u.id = f.addressee_id
         LEFT JOIN user_profiles p ON p.principal_id = f.addressee_id
         WHERE f.requester_id=? AND f.status='pending'
         ORDER BY f.created_at DESC`
      ).all(auth.user.id).map(r => ({
        principalId: r.addressee_id,
        displayName: r.display_name || 'Player',
        handle: r.handle || `player#${r.addressee_id.slice(-4)}`,
        avatarColor: r.avatar_color || '#00B06F',
        createdAt: new Date(r.created_at).toISOString()
      }));

      const blocked = db.prepare(
        `SELECT b.blocked_id, b.created_at, u.display_name, p.handle
         FROM social_blocks b
         JOIN users u ON u.id = b.blocked_id
         LEFT JOIN user_profiles p ON p.principal_id = b.blocked_id
         WHERE b.blocker_id=?
         ORDER BY b.created_at DESC`
      ).all(auth.user.id).map(r => ({
        principalId: r.blocked_id,
        displayName: r.display_name || 'Player',
        handle: r.handle || `player#${r.blocked_id.slice(-4)}`
      }));

      json(res, 200, { friends, incomingRequests: incoming, outgoingRequests: outgoing, blocked });
      return true;
    }

    // 5. Send Friend Request (by targetHandle or targetPrincipalId)
    if (path === '/friends/request' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['community']);
      rate(`social-freq:${auth.user.id}`, 30, 60000);
      assertSocialAllowed(auth.user, { allowChildWithConsent: false });
      ensureProfile(auth.user);

      const body = await readJson(req, 4096);
      let targetUser = null;
      if (body.targetPrincipalId) {
        targetUser = db.prepare('SELECT id, display_name FROM users WHERE id=?').get(String(body.targetPrincipalId));
      } else if (body.targetHandle || body.handle) {
        const handleQuery = cleanText(body.targetHandle || body.handle, 40);
        const prof = db.prepare('SELECT principal_id FROM user_profiles WHERE LOWER(handle)=LOWER(?)').get(handleQuery);
        if (prof) {
          targetUser = db.prepare('SELECT id, display_name FROM users WHERE id=?').get(prof.principal_id);
        }
      }
      if (!targetUser) throw new ApiError(404, 'USER_NOT_FOUND', '대상 플레이어를 찾을 수 없습니다.');
      if (targetUser.id === auth.user.id) throw new ApiError(400, 'CANNOT_ADD_SELF', '본인에게는 친구 요청을 보낼 수 없습니다.');
      if (isBlockedBetween(auth.user.id, targetUser.id)) {
        throw new ApiError(403, 'USER_BLOCKED', '차단된 사용자와는 친구 요청을 주고받을 수 없습니다.');
      }
      if (areFriends(auth.user.id, targetUser.id)) {
        json(res, 200, { status: 'accepted', alreadyFriends: true, targetPrincipalId: targetUser.id });
        return true;
      }

      const stamp = now();
      // If reverse pending request already exists, auto-accept both!
      const reverse = db.prepare(
        "SELECT * FROM social_friendships WHERE requester_id=? AND addressee_id=? AND status='pending'"
      ).get(targetUser.id, auth.user.id);
      if (reverse) {
        db.prepare("UPDATE social_friendships SET status='accepted', updated_at=? WHERE requester_id=? AND addressee_id=?")
          .run(stamp, targetUser.id, auth.user.id);
        json(res, 200, { status: 'accepted', mutualAccepted: true, targetPrincipalId: targetUser.id });
        return true;
      }

      db.prepare(
        `INSERT INTO social_friendships(requester_id,addressee_id,status,created_at,updated_at)
         VALUES(?,?,'pending',?,?)
         ON CONFLICT(requester_id,addressee_id) DO UPDATE SET status='pending', updated_at=excluded.updated_at`
      ).run(auth.user.id, targetUser.id, stamp, stamp);
      const targetProf = ensureProfile(targetUser);
      json(res, 201, {
        status: 'pending',
        targetPrincipalId: targetUser.id,
        targetHandle: targetProf.handle,
        targetDisplayName: targetUser.display_name || 'Player'
      });
      return true;
    }

    // 6. Respond to Incoming Friend Request (accept | decline)
    if (path === '/friends/respond' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['community']);
      assertSocialAllowed(auth.user, { allowChildWithConsent: false });
      const body = await readJson(req, 4096);
      const requesterId = String(body.requesterId || '');
      const action = String(body.action || '');
      if (!requesterId || !['accept', 'decline'].includes(action)) {
        throw new ApiError(400, 'INVALID_FRIEND_ACTION');
      }
      const reqRow = db.prepare(
        "SELECT * FROM social_friendships WHERE requester_id=? AND addressee_id=? AND status='pending'"
      ).get(requesterId, auth.user.id);
      if (!reqRow) throw new ApiError(404, 'FRIEND_REQUEST_NOT_FOUND');
      if (action === 'accept' && isBlockedBetween(auth.user.id, requesterId)) {
        throw new ApiError(403, 'USER_BLOCKED');
      }
      const nextStatus = action === 'accept' ? 'accepted' : 'declined';
      db.prepare('UPDATE social_friendships SET status=?, updated_at=? WHERE requester_id=? AND addressee_id=?')
        .run(nextStatus, now(), requesterId, auth.user.id);
      json(res, 200, { requesterId, status: nextStatus });
      return true;
    }

    // 7. Unfriend
    const unfriendMatch = path.match(/^\/friends\/([^/]+)$/);
    if (unfriendMatch && req.method === 'DELETE') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      const targetId = decodeURIComponent(unfriendMatch[1]);
      db.prepare(
        'DELETE FROM social_friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)'
      ).run(auth.user.id, targetId, targetId, auth.user.id);
      json(res, 200, { removed: true, targetPrincipalId: targetId });
      return true;
    }

    // 8. Block / Unblock
    if (path === '/blocks' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      const body = await readJson(req, 4096);
      const targetId = String(body.targetPrincipalId || '');
      if (!targetId || targetId === auth.user.id) throw new ApiError(400, 'INVALID_BLOCK_TARGET');
      const target = db.prepare('SELECT id FROM users WHERE id=?').get(targetId);
      if (!target) throw new ApiError(404, 'USER_NOT_FOUND');

      const stamp = now();
      transaction(db, () => {
        db.prepare('INSERT OR IGNORE INTO social_blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)')
          .run(auth.user.id, targetId, stamp);
        db.prepare(
          'DELETE FROM social_friendships WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)'
        ).run(auth.user.id, targetId, targetId, auth.user.id);
        // Remove blocked user if inside blocker's party
        const myParty = db.prepare('SELECT id FROM social_parties WHERE leader_id=?').get(auth.user.id);
        if (myParty) {
          db.prepare('DELETE FROM social_party_members WHERE party_id=? AND principal_id=?').run(myParty.id, targetId);
        }
      });
      audit('social.block', targetId, `by=${auth.user.id}`);
      json(res, 201, { blocked: true, targetPrincipalId: targetId });
      return true;
    }

    const unblockMatch = path.match(/^\/blocks\/([^/]+)$/);
    if (unblockMatch && req.method === 'DELETE') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      const targetId = decodeURIComponent(unblockMatch[1]);
      db.prepare('DELETE FROM social_blocks WHERE blocker_id=? AND blocked_id=?').run(auth.user.id, targetId);
      json(res, 200, { unblocked: true, targetPrincipalId: targetId });
      return true;
    }

    // 9. Presence Heartbeat
    if (path === '/presence' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      ensureProfile(auth.user);
      const body = await readJson(req, 4096);
      const status = String(body.status || 'online');
      if (!['online', 'in_game', 'offline'].includes(status)) {
        throw new ApiError(400, 'INVALID_PRESENCE_STATUS');
      }
      const gameId = body.gameId ? cleanText(body.gameId, 64) : null;
      const gameTitle = body.gameTitle ? cleanText(body.gameTitle, 80) : null;
      const roomCode = body.roomCode ? cleanText(body.roomCode, 16) : null;
      const joinable = body.joinable === false ? 0 : 1;
      const stamp = now();
      db.prepare(
        `INSERT INTO social_presence(principal_id,status,game_id,game_title,room_code,joinable,updated_at)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(principal_id) DO UPDATE SET
           status=excluded.status, game_id=excluded.game_id, game_title=excluded.game_title,
           room_code=excluded.room_code, joinable=excluded.joinable, updated_at=excluded.updated_at`
      ).run(auth.user.id, status, gameId, gameTitle, roomCode, joinable, stamp);
      json(res, 200, {
        status,
        online: status !== 'offline',
        gameId,
        gameTitle,
        roomCode: joinable ? roomCode : null,
        joinable: Boolean(joinable),
        updatedAt: new Date(stamp).toISOString()
      });
      return true;
    }

    // 10. Real-Time Messages (DM & Party Chat + Safe Quick-Message Gate for Children)
    if (path === '/messages' && req.method === 'GET') {
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      const channelType = url.searchParams.get('channelType') || 'dm';
      if (!['dm', 'party'].includes(channelType)) throw new ApiError(400, 'INVALID_CHANNEL_TYPE');

      let channelKey;
      if (channelType === 'dm') {
        const peerId = url.searchParams.get('peerId') || '';
        if (!peerId) throw new ApiError(400, 'PEER_ID_REQUIRED');
        if (isBlockedBetween(auth.user.id, peerId)) throw new ApiError(403, 'USER_BLOCKED');
        channelKey = dmChannelKey(auth.user.id, peerId);
      } else {
        const partyId = url.searchParams.get('partyId') || findActivePartyId(auth.user.id) || '';
        if (!partyId) throw new ApiError(404, 'PARTY_NOT_FOUND');
        const member = db.prepare('SELECT 1 FROM social_party_members WHERE party_id=? AND principal_id=?').get(partyId, auth.user.id);
        if (!member) throw new ApiError(403, 'NOT_PARTY_MEMBER');
        channelKey = partyId;
      }

      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
      const rows = db.prepare(
        `SELECT m.id, m.sender_id, m.body, m.is_quick_message, m.created_at, u.display_name, p.handle
         FROM social_messages m
         JOIN users u ON u.id = m.sender_id
         LEFT JOIN user_profiles p ON p.principal_id = m.sender_id
         WHERE m.channel_type=? AND m.channel_key=?
         ORDER BY m.created_at ASC
         LIMIT ?`
      ).all(channelType, channelKey, limit);

      json(res, 200, {
        channelType,
        channelKey,
        messages: rows.map(r => ({
          id: r.id,
          senderId: r.sender_id,
          senderName: r.display_name || 'Player',
          senderHandle: r.handle || `player#${r.sender_id.slice(-4)}`,
          senderMe: r.sender_id === auth.user.id,
          body: r.body,
          isQuickMessage: Boolean(r.is_quick_message),
          createdAt: new Date(r.created_at).toISOString()
        }))
      });
      return true;
    }

    if (path === '/messages' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['community']);
      rate(`social-msg:${auth.user.id}`, 60, 60000);
      const comp = assertSocialAllowed(auth.user, { allowChildWithConsent: true });
      const body = await readJson(req, 4096);
      const channelType = String(body.channelType || 'dm');
      if (!['dm', 'party'].includes(channelType)) throw new ApiError(400, 'INVALID_CHANNEL_TYPE');
      if (channelType === 'party') assertNotSanctioned(auth.user.id, ['multiplayer']);

      let text = '';
      let isQuick = 0;
      if (body.quickMessageId) {
        const qText = QUICK_MESSAGE_MAP.get(String(body.quickMessageId));
        if (!qText) throw new ApiError(400, 'INVALID_QUICK_MESSAGE');
        text = qText;
        isQuick = 1;
      } else {
        // Fail-Closed: CHILD_PROTECTED can NEVER send free-form text even after parental consent
        if (comp.ageTier === 'CHILD_PROTECTED') {
          throw new ApiError(
            403,
            'CHILD_FREE_CHAT_BLOCKED',
            '아동 보호 모드에서는 자유 채팅이 차단되며 안전 퀵메시지만 전송할 수 있습니다.'
          );
        }
        text = cleanText(body.body || '', 400);
        if (!text) throw new ApiError(400, 'MESSAGE_EMPTY');
      }

      let channelKey;
      if (channelType === 'dm') {
        const peerId = String(body.peerId || '');
        if (!peerId || peerId === auth.user.id) throw new ApiError(400, 'INVALID_PEER');
        const peer = db.prepare('SELECT id FROM users WHERE id=?').get(peerId);
        if (!peer) throw new ApiError(404, 'USER_NOT_FOUND');
        if (isBlockedBetween(auth.user.id, peerId)) throw new ApiError(403, 'USER_BLOCKED');
        if (!areFriends(auth.user.id, peerId)) {
          throw new ApiError(403, 'FRIENDSHIP_REQUIRED', '친구 관계인 사용자에게만 1:1 메시지를 보낼 수 있습니다.');
        }
        channelKey = dmChannelKey(auth.user.id, peerId);
      } else {
        const partyId = String(body.partyId || findActivePartyId(auth.user.id) || '');
        if (!partyId) throw new ApiError(404, 'PARTY_NOT_FOUND');
        const member = db.prepare('SELECT 1 FROM social_party_members WHERE party_id=? AND principal_id=?').get(partyId, auth.user.id);
        if (!member) throw new ApiError(403, 'NOT_PARTY_MEMBER');
        channelKey = partyId;
      }

      const id = uid();
      const stamp = now();
      db.prepare(
        'INSERT INTO social_messages(id,channel_type,channel_key,sender_id,body,is_quick_message,created_at) VALUES(?,?,?,?,?,?,?)'
      ).run(id, channelType, channelKey, auth.user.id, text, isQuick, stamp);

      json(res, 201, {
        id,
        channelType,
        channelKey,
        senderId: auth.user.id,
        senderMe: true,
        body: text,
        isQuickMessage: Boolean(isQuick),
        createdAt: new Date(stamp).toISOString()
      });
      return true;
    }

    // 11. Party Lobby (Get Current / Create / Join by Room Code / Ready / Set Game / Leave)
    if (path === '/parties/me' && req.method === 'GET') {
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      ensureProfile(auth.user);
      const partyId = findActivePartyId(auth.user.id);
      json(res, 200, { party: partyId ? buildPartyDto(partyId) : null });
      return true;
    }

    if (path === '/parties' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['multiplayer']);
      rate(`social-party-create:${auth.user.id}`, 20, 60000);
      const comp = assertSocialAllowed(auth.user, { allowChildWithConsent: true });
      ensureProfile(auth.user);
      const body = await readJson(req, 4096);
      const title = cleanText(body.title || `${auth.user.display_name || 'Player'}의 파티`, 60);
      const targetGameId = body.targetGameId ? cleanText(body.targetGameId, 64) : null;
      if (targetGameId) validateCatalogGame(targetGameId, comp);
      const maxMembers = Math.min(Math.max(Number(body.maxMembers || 8), 2), 8);

      leaveCurrentParty(auth.user.id);
      const partyId = uid();
      const stamp = now();
      let roomCode = generateRoomCode();
      while (db.prepare('SELECT 1 FROM social_parties WHERE room_code=?').get(roomCode)) {
        roomCode = generateRoomCode();
      }
      transaction(db, () => {
        db.prepare(
          'INSERT INTO social_parties(id,leader_id,title,target_game_id,room_code,max_members,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)'
        ).run(partyId, auth.user.id, title, targetGameId, roomCode, maxMembers, stamp, stamp);
        db.prepare(
          "INSERT INTO social_party_members(party_id,principal_id,role,ready_state,joined_at) VALUES(?,?,'leader',1,?)"
        ).run(partyId, auth.user.id, stamp);
      });
      json(res, 201, { party: buildPartyDto(partyId) });
      return true;
    }

    if (path === '/parties/join' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['multiplayer']);
      rate(`social-party-join:${auth.user.id}`, 20, 60000);
      assertSocialAllowed(auth.user, { allowChildWithConsent: true });
      ensureProfile(auth.user);
      const body = await readJson(req, 4096);
      const roomCode = cleanText(body.roomCode || '', 16).toUpperCase();
      if (!roomCode) throw new ApiError(400, 'ROOM_CODE_REQUIRED');
      const party = db.prepare('SELECT * FROM social_parties WHERE room_code=?').get(roomCode);
      if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND', '존재하지 않는 초대 코드입니다.');

      // Reject join if blocked by leader or any member
      const memberIds = db.prepare('SELECT principal_id FROM social_party_members WHERE party_id=?').all(party.id).map(r => r.principal_id);
      if (memberIds.some(mid => mid !== auth.user.id && isBlockedBetween(auth.user.id, mid))) {
        throw new ApiError(403, 'USER_BLOCKED', '차단된 사용자가 포함된 파티에는 합류할 수 없습니다.');
      }
      if (!memberIds.includes(auth.user.id)) {
        if (memberIds.length >= party.max_members) throw new ApiError(409, 'PARTY_FULL', '파티 정원이 가득 찼습니다.');
        leaveCurrentParty(auth.user.id);
        const stamp = now();
        db.prepare(
          "INSERT INTO social_party_members(party_id,principal_id,role,ready_state,joined_at) VALUES(?,?,'member',0,?)"
        ).run(party.id, auth.user.id, stamp);
        db.prepare('UPDATE social_parties SET updated_at=? WHERE id=?').run(stamp, party.id);
      }
      json(res, 200, { party: buildPartyDto(party.id) });
      return true;
    }

    const partyReadyMatch = path.match(/^\/parties\/([^/]+)\/ready$/);
    if (partyReadyMatch && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['multiplayer']);
      const partyId = decodeURIComponent(partyReadyMatch[1]);
      const member = db.prepare('SELECT 1 FROM social_party_members WHERE party_id=? AND principal_id=?').get(partyId, auth.user.id);
      if (!member) throw new ApiError(403, 'NOT_PARTY_MEMBER');
      const body = await readJson(req, 2048);
      const ready = body.ready ? 1 : 0;
      db.prepare('UPDATE social_party_members SET ready_state=? WHERE party_id=? AND principal_id=?').run(ready, partyId, auth.user.id);
      db.prepare('UPDATE social_parties SET updated_at=? WHERE id=?').run(now(), partyId);
      json(res, 200, { party: buildPartyDto(partyId) });
      return true;
    }

    const partyGameMatch = path.match(/^\/parties\/([^/]+)\/game$/);
    if (partyGameMatch && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['multiplayer']);
      const partyId = decodeURIComponent(partyGameMatch[1]);
      const party = db.prepare('SELECT * FROM social_parties WHERE id=?').get(partyId);
      if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND');
      if (party.leader_id !== auth.user.id) throw new ApiError(403, 'LEADER_ONLY', '파티장만 게임을 변경할 수 있습니다.');
      const comp = assertSocialAllowed(auth.user, { allowChildWithConsent: true });
      const body = await readJson(req, 2048);
      const targetGameId = body.targetGameId ? cleanText(body.targetGameId, 64) : null;
      if (targetGameId) validateCatalogGame(targetGameId, comp);
      db.prepare('UPDATE social_parties SET target_game_id=?, updated_at=? WHERE id=?').run(targetGameId, now(), partyId);
      json(res, 200, { party: buildPartyDto(partyId) });
      return true;
    }

    const partyLeaveMatch = path.match(/^\/parties\/([^/]+)\/leave$/);
    if (partyLeaveMatch && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      const partyId = decodeURIComponent(partyLeaveMatch[1]);
      const activeId = findActivePartyId(auth.user.id);
      if (activeId !== partyId) throw new ApiError(404, 'NOT_IN_PARTY');
      leaveCurrentParty(auth.user.id);
      json(res, 200, { left: true, partyId });
      return true;
    }

    // 11b. Synchronized Cross-Play Co-Entry Launch (PC Web <-> Android <-> iOS)
    const partyLaunchMatch = path.match(/^\/parties\/([^/]+)\/launch$/);
    if (partyLaunchMatch && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['multiplayer']);
      rate(`social-party-launch:${auth.user.id}`, 20, 60000);
      const comp = assertSocialAllowed(auth.user, { allowChildWithConsent: true });
      ensureProfile(auth.user);
      const partyId = decodeURIComponent(partyLaunchMatch[1]);
      const party = db.prepare('SELECT * FROM social_parties WHERE id=?').get(partyId);
      if (!party) throw new ApiError(404, 'PARTY_NOT_FOUND');
      const isMember = db.prepare('SELECT 1 FROM social_party_members WHERE party_id=? AND principal_id=?').get(partyId, auth.user.id);
      if (!isMember) throw new ApiError(403, 'NOT_PARTY_MEMBER');
      if (party.leader_id !== auth.user.id) {
        throw new ApiError(403, 'LEADER_ONLY', '파티장만 함께 입장을 시작할 수 있습니다.');
      }
      const body = await readJson(req, 4096);
      const gameId = cleanText(body.gameId || party.target_game_id || '', 64);
      if (!gameId) throw new ApiError(400, 'TARGET_GAME_REQUIRED', '함께 입장할 게임을 먼저 선택해 주세요.');
      validateCatalogGame(gameId, comp);
      const headerPlatform = cleanText(String(req.headers['x-playhub-platform'] || body.platform || 'web'), 24).toLowerCase() || 'web';
      const platform = ['web', 'pc', 'android', 'ios'].includes(headerPlatform) ? headerPlatform : 'web';
      const stamp = now();
      const launchId = `launch_${uid().replace(/-/g, '').slice(0, 12)}`;
      const matchRoomId = `match_${party.room_code}_${uid().replace(/-/g, '').slice(0, 6).toUpperCase()}`;

      transaction(db, () => {
        db.prepare("UPDATE social_party_launches SET status='ended' WHERE party_id=? AND status='active'").run(partyId);
        db.prepare('UPDATE social_parties SET target_game_id=?, updated_at=? WHERE id=?').run(gameId, stamp, partyId);
        db.prepare(
          "INSERT INTO social_party_launches(launch_id,party_id,game_id,room_code,match_room_id,launched_by,status,created_at) VALUES(?,?,?,?,?,?,'active',?)"
        ).run(launchId, partyId, gameId, party.room_code, matchRoomId, auth.user.id, stamp);
        db.prepare(
          "INSERT OR REPLACE INTO social_party_launch_acks(launch_id,principal_id,platform,state,updated_at) VALUES(?,?,?,'entered',?)"
        ).run(launchId, auth.user.id, platform, stamp);
        db.prepare(
          `INSERT INTO social_presence(principal_id,status,game_id,game_title,room_code,joinable,updated_at)
           VALUES(?,'in_game',?,?,?,1,?)
           ON CONFLICT(principal_id) DO UPDATE SET status='in_game', game_id=excluded.game_id, game_title=COALESCE(excluded.game_title, social_presence.game_title), room_code=excluded.room_code, joinable=1, updated_at=excluded.updated_at`
        ).run(auth.user.id, gameId, cleanText(body.gameTitle || gameId, 80), party.room_code, stamp);
        db.prepare(
          "INSERT INTO social_messages(id,channel_type,channel_key,sender_id,body,is_quick_message,created_at) VALUES(?,'party',?,?,?,1,?)"
        ).run(uid(), partyId, auth.user.id, `🎮 함께 입장 시작! (${gameId} · 매치룸 ${matchRoomId})`, stamp);
      });
      audit('social.party_launch', partyId, `launchId=${launchId} gameId=${gameId} platform=${platform}`);
      const dto = buildPartyDto(partyId);
      json(res, 201, { launch: dto.activeLaunch, party: dto });
      return true;
    }

    const partyLaunchAckMatch = path.match(/^\/parties\/([^/]+)\/launch\/ack$/);
    if (partyLaunchAckMatch && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['multiplayer']);
      const comp = assertSocialAllowed(auth.user, { allowChildWithConsent: true });
      ensureProfile(auth.user);
      const partyId = decodeURIComponent(partyLaunchAckMatch[1]);
      const isMember = db.prepare('SELECT 1 FROM social_party_members WHERE party_id=? AND principal_id=?').get(partyId, auth.user.id);
      if (!isMember) throw new ApiError(403, 'NOT_PARTY_MEMBER');
      const body = await readJson(req, 4096);
      const state = String(body.state || 'entered');
      if (!['joining', 'entered', 'declined'].includes(state)) throw new ApiError(400, 'INVALID_LAUNCH_STATE');
      const launch = body.launchId
        ? db.prepare('SELECT * FROM social_party_launches WHERE launch_id=? AND party_id=?').get(String(body.launchId), partyId)
        : db.prepare("SELECT * FROM social_party_launches WHERE party_id=? AND status='active' ORDER BY created_at DESC LIMIT 1").get(partyId);
      if (!launch) throw new ApiError(404, 'ACTIVE_LAUNCH_NOT_FOUND');
      validateCatalogGame(launch.game_id, comp);
      const headerPlatform = cleanText(String(req.headers['x-playhub-platform'] || body.platform || 'web'), 24).toLowerCase() || 'web';
      const platform = ['web', 'pc', 'android', 'ios'].includes(headerPlatform) ? headerPlatform : 'web';
      const stamp = now();
      transaction(db, () => {
        db.prepare(
          'INSERT OR REPLACE INTO social_party_launch_acks(launch_id,principal_id,platform,state,updated_at) VALUES(?,?,?,?,?)'
        ).run(launch.launch_id, auth.user.id, platform, state, stamp);
        if (state === 'entered') {
          db.prepare(
            `INSERT INTO social_presence(principal_id,status,game_id,game_title,room_code,joinable,updated_at)
             VALUES(?,'in_game',?,?,?,1,?)
             ON CONFLICT(principal_id) DO UPDATE SET status='in_game', game_id=excluded.game_id, room_code=excluded.room_code, joinable=1, updated_at=excluded.updated_at`
          ).run(auth.user.id, launch.game_id, cleanText(body.gameTitle || launch.game_id, 80), launch.room_code, stamp);
        }
      });
      const dto = buildPartyDto(partyId);
      json(res, 200, { launch: dto.activeLaunch, party: dto });
      return true;
    }

    // 12. Leaderboards (Submit Score + Global / Friends Scope)
    const lbScoreMatch = path.match(/^\/leaderboards\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/scores$/);
    if (lbScoreMatch && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id, ['leaderboard']);
      rate(`social-lb-score:${auth.user.id}`, 30, 60000);
      ensureProfile(auth.user);
      const [, gameId, boardId] = lbScoreMatch;
      const body = await readJson(req, 4096);
      const score = Number(body.score);
      if (!Number.isSafeInteger(score) || score < 0 || score > 1_000_000_000) {
        throw new ApiError(422, 'INVALID_SCORE');
      }
      const periodKey = cleanText(body.periodKey || 'all', 32) || 'all';
      const stamp = now();
      db.prepare(
        `INSERT INTO social_leaderboards(game_id,board_id,principal_id,score,period_key,updated_at)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(game_id,board_id,principal_id,period_key) DO UPDATE SET
           score = CASE WHEN excluded.score > social_leaderboards.score THEN excluded.score ELSE social_leaderboards.score END,
           updated_at = excluded.updated_at`
      ).run(gameId, boardId, auth.user.id, score, periodKey, stamp);
      const row = db.prepare(
        'SELECT score FROM social_leaderboards WHERE game_id=? AND board_id=? AND principal_id=? AND period_key=?'
      ).get(gameId, boardId, auth.user.id, periodKey);
      json(res, 201, { gameId, boardId, periodKey, bestScore: row.score });
      return true;
    }

    const lbGetMatch = path.match(/^\/leaderboards\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/);
    if (lbGetMatch && req.method === 'GET') {
      const auth = authUser(req, res, false);
      const [, gameId, boardId] = lbGetMatch;
      const scope = url.searchParams.get('scope') || 'global';
      const periodKey = cleanText(url.searchParams.get('periodKey') || 'all', 32) || 'all';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 20), 1), 50);

      let rows = db.prepare(
        `SELECT l.principal_id, l.score, l.updated_at, u.display_name, p.handle, p.avatar_color
         FROM social_leaderboards l
         JOIN users u ON u.id = l.principal_id
         LEFT JOIN user_profiles p ON p.principal_id = l.principal_id
         WHERE l.game_id=? AND l.board_id=? AND l.period_key=?
         ORDER BY l.score DESC, l.updated_at ASC
         LIMIT 200`
      ).all(gameId, boardId, periodKey);

      if (auth) {
        rows = rows.filter(r => r.principal_id === auth.user.id || !isBlockedBetween(auth.user.id, r.principal_id));
        if (scope === 'friends') {
          rows = rows.filter(r => r.principal_id === auth.user.id || areFriends(auth.user.id, r.principal_id));
        }
      }

      const entries = rows.slice(0, limit).map((r, idx) => ({
        rank: idx + 1,
        principalId: r.principal_id,
        displayName: r.display_name || 'Player',
        handle: r.handle || `player#${r.principal_id.slice(-4)}`,
        avatarColor: r.avatar_color || '#00B06F',
        score: r.score,
        isMe: auth ? r.principal_id === auth.user.id : false
      }));
      json(res, 200, { gameId, boardId, scope, periodKey, entries });
      return true;
    }

    // 13. Moderation Report (User / Message / Party)
    if (path === '/reports' && req.method === 'POST') {
      guardMutation(req);
      const auth = authUser(req, res, true);
      assertNotSanctioned(auth.user.id);
      rate(`social-report:${auth.user.id}`, 10, 60000);
      const body = await readJson(req, 4096);
      const targetType = String(body.targetType || '');
      const targetId = cleanText(body.targetId || '', 120);
      const reason = cleanText(body.reason || '', 240);
      if (!['user', 'message', 'party'].includes(targetType) || !targetId || reason.length < 2) {
        throw new ApiError(400, 'INVALID_REPORT');
      }
      const id = uid();
      const stamp = now();
      db.prepare(
        'INSERT INTO social_reports(id,reporter_id,target_type,target_id,reason,created_at) VALUES(?,?,?,?,?,?)'
      ).run(id, auth.user.id, targetType, targetId, reason, stamp);
      audit('social.report', `${targetType}:${targetId}`, `by=${auth.user.id}`);
      json(res, 201, { id, targetType, targetId, status: 'submitted' });
      return true;
    }

    return false;
  }

  return { route, ensureProfile };
}
