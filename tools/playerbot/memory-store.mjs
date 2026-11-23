// PlayHub PlayerBot Gateway — Isolated Memory Store & GDPR Art. 17 Hard Erase (Research §3.4 R10)
// Strictly separates:
//  1) authoritative_game_fact (provided per-request by Zone 2)
//  2) unverified_user_claims  (<user_claim verified="false">, NEVER promoted to authoritative facts)
//  3) session_dialogue        (short-lived session turns, hard-deleted on erase)
//  4) tombstones              (immutable erasure audit proof, zero PII)

export function createMemoryStore({ utcNow = () => Date.now() } = {}) {
  const partitions = new Map(); // Keyed by deterministic user_id partition
  const tombstones = [];

  function ensurePartition(userId) {
    const key = String(userId || 'local-user');
    if (!partitions.has(key)) {
      partitions.set(key, {
        user_id: key,
        dialogue_turns: [],
        unverified_user_claims: [],
        prompt_cache_meta: { hits: 0, misses: 0 },
      });
    }
    return partitions.get(key);
  }

  function recordTurn(userId, { botId, userText, botReply, unverifiedClaim = false }) {
    const p = ensurePartition(userId);
    const ts = utcNow();
    p.dialogue_turns.push({ ts, bot_id: botId, user: String(userText || ''), bot: String(botReply || '') });
    if (p.dialogue_turns.length > 16) p.dialogue_turns.shift();
    if (unverifiedClaim) {
      p.unverified_user_claims.push({ ts, bot_id: botId, claim: String(userText || ''), verified: false });
      if (p.unverified_user_claims.length > 12) p.unverified_user_claims.shift();
    }
  }

  function getSessionContext(userId, botId) {
    const p = partitions.get(String(userId || 'local-user'));
    if (!p) return { recent_turns: [], unverified_claims: [] };
    return {
      recent_turns: p.dialogue_turns.filter(t => t.bot_id === botId).slice(-6),
      unverified_claims: p.unverified_user_claims.filter(c => c.bot_id === botId).slice(-4),
    };
  }

  // GDPR Art. 17 Hard Erase: removes raw turns, claims, and cache metadata under user_id partition + emits Tombstone.
  function eraseUserData(userId) {
    const key = String(userId || 'local-user');
    const existed = partitions.has(key);
    const prev = partitions.get(key);
    const removedCounts = {
      dialogue_turns: prev?.dialogue_turns?.length || 0,
      unverified_user_claims: prev?.unverified_user_claims?.length || 0,
    };
    partitions.delete(key);
    const tombstone = {
      tombstone_id: `tmb-${tombstones.length + 1}`,
      partition_key_hash: `uid_${key.length}_${Array.from(key).reduce((a, c) => ((a * 31 + c.charCodeAt(0)) >>> 0), 7).toString(16)}`,
      erased_at_utc_ms: utcNow(),
      hard_deleted: true,
      removed_counts: removedCounts,
      existed,
    };
    tombstones.push(tombstone);
    return tombstone;
  }

  return {
    recordTurn,
    getSessionContext,
    eraseUserData,
    hasUserPartition: userId => partitions.has(String(userId || 'local-user')),
    getTombstones: () => [...tombstones],
  };
}
