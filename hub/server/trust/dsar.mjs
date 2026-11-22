// Phase 0 Atomic DSAR Account Deletion (DELETE /api/account)
// Foreign-Key (PRAGMA foreign_keys=ON) & Statutory 5-Year Financial/Sanction Retention Safe.
// Protocol:
//   1. Pre-Check Gate: blocks with 409 ACCOUNT_DELETE_PRECONDITION_FAILED on reserved/debt coins,
//      active subscriptions, or active published games.
//   2. Hard Purge: auth/tokens, preferences/saves/wishlists, consents, agent logs, social graph,
//      avatar inventory/loadouts, and leaderboard/stat rows (guarded with table-existence checks).
//   3. Anonymize/Redact: social_messages, community_items, shorts_videos, play_sessions, events,
//      ad_handoff_tokens, ad_attributions, datastore_entries.
//   4. Tombstone: users (kind = 'deleted', display_name = NULL) while preserving statutory 5-year
//      billing_* ledgers and user_sanctions with zero FK constraint violations.

import { transaction } from '../db.mjs';
import { ApiError, digest, uid } from '../security.mjs';

function existingTables(db) {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return new Set(rows.map(r => r.name));
}

function runDelete(db, tables, counts, table, sql, ...params) {
  if (!tables.has(table)) return 0;
  const info = db.prepare(sql).run(...params);
  counts[table] = (counts[table] || 0) + (info.changes || 0);
  return info.changes || 0;
}

function runUpdate(db, tables, counts, table, sql, ...params) {
  if (!tables.has(table)) return 0;
  const info = db.prepare(sql).run(...params);
  counts[table] = (counts[table] || 0) + (info.changes || 0);
  return info.changes || 0;
}

export function checkAccountDeletionPreconditions(db, principalId) {
  const tables = existingTables(db);
  const blockers = [];

  if (tables.has('billing_wallet_accounts')) {
    const wallet = db.prepare(
      'SELECT reserved_coins, debt_coins FROM billing_wallet_accounts WHERE principal_id=?'
    ).get(principalId);
    if (wallet) {
      if (Number(wallet.reserved_coins || 0) > 0) {
        blockers.push({
          code: 'RESERVED_COINS_ACTIVE',
          reservedCoins: wallet.reserved_coins,
          message: '진행 중인 PlayCoin 보류(Hold) 잔액 정산 완료 후 계정을 삭제할 수 있습니다.'
        });
      }
      if (Number(wallet.debt_coins || 0) > 0) {
        blockers.push({
          code: 'DEBT_COINS_OUTSTANDING',
          debtCoins: wallet.debt_coins,
          message: '미정산 환불/차지백 채무 잔액이 있어 계정을 삭제할 수 없습니다.'
        });
      }
    }
  }

  if (tables.has('billing_subscriptions')) {
    const sub = db.prepare(
      "SELECT id, plan_tier FROM billing_subscriptions WHERE principal_id=? AND status='ACTIVE' LIMIT 1"
    ).get(principalId);
    if (sub) {
      blockers.push({
        code: 'ACTIVE_SUBSCRIPTION',
        subscriptionId: sub.id,
        planTier: sub.plan_tier,
        message: '활성 구독을 해지한 후 계정을 삭제할 수 있습니다.'
      });
    }
  }

  if (tables.has('hub_publications')) {
    const pubs = db.prepare(
      "SELECT game_id FROM hub_publications WHERE owner_id=? AND status='published'"
    ).all(principalId);
    if (pubs.length > 0) {
      blockers.push({
        code: 'ACTIVE_PUBLICATIONS',
        gameIds: pubs.map(p => p.game_id),
        message: '게시 중인 UGC 게임을 비공개 전환하거나 이관한 후 계정을 삭제할 수 있습니다.'
      });
    }
  }

  return blockers;
}

export function executeAccountDeletion(db, principalId, { now = Date.now } = {}) {
  if (typeof principalId !== 'string' || !principalId.trim()) {
    throw new ApiError(401, 'SESSION_REQUIRED');
  }

  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  const anonToken = `anon_${digest(`playhub-dsar:${principalId}:${stamp}`).slice(0, 16)}`;

  return transaction(db, () => {
    const user = db.prepare('SELECT id, kind, display_name FROM users WHERE id=?').get(principalId);
    if (!user) {
      throw new ApiError(404, 'ACCOUNT_NOT_FOUND', '계정을 찾을 수 없습니다.');
    }
    if (user.kind === 'deleted') {
      throw new ApiError(409, 'ACCOUNT_ALREADY_DELETED', '이미 삭제 처리된 계정입니다.');
    }

    // 1. Pre-Check Gate
    const blockers = checkAccountDeletionPreconditions(db, principalId);
    if (blockers.length > 0) {
      throw new ApiError(
        409,
        'ACCOUNT_DELETE_PRECONDITION_FAILED',
        '계정 삭제 사전 조건이 충족되지 않았습니다.',
        { blockers }
      );
    }

    const tables = existingTables(db);
    const purgedCounts = {};
    const anonymizedCounts = {};

    // Collect session hashes and analytics subjects before deleting sessions
    const sessionHashes = new Set();
    const analyticsSubjects = new Set([principalId]);
    if (tables.has('sessions')) {
      const sRows = db.prepare('SELECT id_hash, analytics_subject FROM sessions WHERE principal_id=?').all(principalId);
      for (const r of sRows) {
        if (r.id_hash) sessionHashes.add(r.id_hash);
        if (r.analytics_subject) analyticsSubjects.add(r.analytics_subject);
      }
    }
    if (tables.has('play_sessions')) {
      const psRows = db.prepare('SELECT subject_id FROM play_sessions WHERE principal_id=?').all(principalId);
      for (const r of psRows) {
        if (r.subject_id) analyticsSubjects.add(r.subject_id);
      }
    }

    // 2. Hard Purge: Auth & Tokens
    if (tables.has('oauth_states')) {
      runDelete(db, tables, purgedCounts, 'oauth_states', 'DELETE FROM oauth_states WHERE guest_id=?', principalId);
      for (const sh of sessionHashes) {
        runDelete(db, tables, purgedCounts, 'oauth_states', 'DELETE FROM oauth_states WHERE session_hash=?', sh);
      }
    }
    runDelete(db, tables, purgedCounts, 'sessions', 'DELETE FROM sessions WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'mobile_tokens', 'DELETE FROM mobile_tokens WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'identities', 'DELETE FROM identities WHERE user_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'email_credentials', 'DELETE FROM email_credentials WHERE user_id=?', principalId);

    // 2b. Hard Purge: Preferences, Saves, Wishlists, Merges, Analytics Links
    runDelete(db, tables, purgedCounts, 'user_preferences', 'DELETE FROM user_preferences WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'wishlist_items', 'DELETE FROM wishlist_items WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'save_slots', 'DELETE FROM save_slots WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'save_slot_versions', 'DELETE FROM save_slot_versions WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'save_idempotency', 'DELETE FROM save_idempotency WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'save_backups', 'DELETE FROM save_backups WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'merge_requests', 'DELETE FROM merge_requests WHERE source_user=? OR target_user=?', principalId, principalId);
    if (tables.has('analytics_links')) {
      for (const subj of analyticsSubjects) {
        runDelete(
          db, tables, purgedCounts, 'analytics_links',
          'DELETE FROM analytics_links WHERE source_subject=? OR target_subject=?',
          subj, subj
        );
      }
    }

    // 2c. Hard Purge: Consents & Age Compliance Logs
    runDelete(db, tables, purgedCounts, 'user_consents', 'DELETE FROM user_consents WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'user_age_compliance', 'DELETE FROM user_age_compliance WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'parental_consent_logs', 'DELETE FROM parental_consent_logs WHERE principal_id=?', principalId);

    // 2d. Hard Purge: Hub Agent Quotas & Usage Logs
    runDelete(db, tables, purgedCounts, 'hub_agent_usage_logs', 'DELETE FROM hub_agent_usage_logs WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'hub_agent_quotas', 'DELETE FROM hub_agent_quotas WHERE principal_id=?', principalId);

    // 2e. Hard Purge: Social Graph (child-before-parent FK order)
    runDelete(db, tables, purgedCounts, 'social_party_launch_acks', 'DELETE FROM social_party_launch_acks WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'social_party_members', 'DELETE FROM social_party_members WHERE principal_id=?', principalId);
    if (tables.has('social_parties')) {
      const ledParties = db.prepare('SELECT id FROM social_parties WHERE leader_id=?').all(principalId);
      for (const party of ledParties) {
        const nextMember = tables.has('social_party_members')
          ? db.prepare('SELECT principal_id FROM social_party_members WHERE party_id=? ORDER BY joined_at ASC LIMIT 1').get(party.id)
          : null;
        if (nextMember) {
          db.prepare('UPDATE social_parties SET leader_id=?, updated_at=? WHERE id=?').run(nextMember.principal_id, stamp, party.id);
          db.prepare("UPDATE social_party_members SET role='leader' WHERE party_id=? AND principal_id=?").run(party.id, nextMember.principal_id);
        } else {
          runDelete(db, tables, purgedCounts, 'social_parties', 'DELETE FROM social_parties WHERE id=?', party.id);
        }
      }
    }
    runDelete(db, tables, purgedCounts, 'social_presence', 'DELETE FROM social_presence WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'social_friendships', 'DELETE FROM social_friendships WHERE requester_id=? OR addressee_id=?', principalId, principalId);
    runDelete(db, tables, purgedCounts, 'social_blocks', 'DELETE FROM social_blocks WHERE blocker_id=? OR blocked_id=?', principalId, principalId);
    runDelete(db, tables, purgedCounts, 'social_leaderboards', 'DELETE FROM social_leaderboards WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'social_reports', 'DELETE FROM social_reports WHERE reporter_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'user_profiles', 'DELETE FROM user_profiles WHERE principal_id=?', principalId);

    // 2f. Hard Purge: Community reactions, Shorts likes, Avatar inventory/loadouts, Leaderboards & Stats
    runDelete(db, tables, purgedCounts, 'community_votes', 'DELETE FROM community_votes WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'community_reports', 'DELETE FROM community_reports WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'shorts_likes', 'DELETE FROM shorts_likes WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'shorts_idempotency', 'DELETE FROM shorts_idempotency WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'avatar_inventory', 'DELETE FROM avatar_inventory WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'avatar_loadouts', 'DELETE FROM avatar_loadouts WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'avatar_purchase_idempotency', 'DELETE FROM avatar_purchase_idempotency WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'leaderboard_entries', 'DELETE FROM leaderboard_entries WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'leaderboard_submissions', 'DELETE FROM leaderboard_submissions WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'player_stats', 'DELETE FROM player_stats WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'player_achievements', 'DELETE FROM player_achievements WHERE principal_id=?', principalId);
    runDelete(db, tables, purgedCounts, 'progression_idempotency', 'DELETE FROM progression_idempotency WHERE principal_id=?', principalId);

    // 3. Anonymize / Redact (maintaining FK integrity with tombstoned users(id))
    runUpdate(
      db, tables, anonymizedCounts, 'social_messages',
      "UPDATE social_messages SET body='[deleted]' WHERE sender_id=?",
      principalId
    );
    runUpdate(
      db, tables, anonymizedCounts, 'community_items',
      "UPDATE community_items SET title='[deleted]', body='[deleted]', hidden=1, updated_at=? WHERE author_id=?",
      stamp, principalId
    );
    runUpdate(
      db, tables, anonymizedCounts, 'shorts_videos',
      "UPDATE shorts_videos SET creator_id=?, creator_name='[deleted]', caption='', prompt='', flow_prompt='', visibility='draft', updated_at=? WHERE creator_id=?",
      anonToken, stamp, principalId
    );
    runUpdate(
      db, tables, anonymizedCounts, 'play_sessions',
      'UPDATE play_sessions SET principal_id=?, subject_id=?, session_hash=?, ended_at=COALESCE(ended_at,?), paused=1 WHERE principal_id=?',
      anonToken, anonToken, anonToken, stamp, principalId
    );
    if (tables.has('events')) {
      for (const subj of analyticsSubjects) {
        runUpdate(
          db, tables, anonymizedCounts, 'events',
          'UPDATE events SET subject_id=?, visit_id=? WHERE subject_id=?',
          anonToken, anonToken, subj
        );
      }
    }
    runUpdate(
      db, tables, anonymizedCounts, 'ad_handoff_tokens',
      'UPDATE ad_handoff_tokens SET claimed_user_id=NULL, claimed_device_hash=NULL WHERE claimed_user_id=?',
      principalId
    );
    runUpdate(
      db, tables, anonymizedCounts, 'ad_attributions',
      'UPDATE ad_attributions SET user_id=? WHERE user_id=?',
      anonToken, principalId
    );
    runUpdate(
      db, tables, anonymizedCounts, 'datastore_entries',
      'UPDATE datastore_entries SET owner_principal_id=NULL, lock_holder=NULL, lock_expires_at=NULL, updated_by=?, updated_at=? WHERE owner_principal_id=?',
      anonToken, stamp, principalId
    );

    // 4. Tombstone users row (0 bytes PII; keeps FK intact for statutory 5yr billing_* & user_sanctions)
    db.prepare("UPDATE users SET kind='deleted', display_name=NULL WHERE id=?").run(principalId);

    if (tables.has('audit')) {
      db.prepare('INSERT INTO audit(id, action, target, detail, created_at) VALUES(?, ?, ?, ?, ?)')
        .run(
          uid(),
          'account_deleted_dsar',
          anonToken,
          JSON.stringify({
            anonymizedRef: anonToken,
            purgedTables: Object.keys(purgedCounts).filter(k => purgedCounts[k] > 0),
            anonymizedTables: Object.keys(anonymizedCounts).filter(k => anonymizedCounts[k] > 0)
          }),
          stamp
        );
    }

    return {
      ok: true,
      status: 'deleted',
      deletedAt: new Date(stamp).toISOString(),
      tombstoneId: principalId,
      anonymizedToken: anonToken,
      purgedCounts,
      anonymizedCounts,
      preservedStatutory: ['billing_*', 'user_sanctions']
    };
  });
}
