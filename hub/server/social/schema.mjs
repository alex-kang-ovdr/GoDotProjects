/**
 * PlayHub M3 Social, Friends, Party, Presence, Messaging, Moderation & Leaderboards schema.
 * Additive CREATE TABLE IF NOT EXISTS only (preserves PRAGMA user_version = 1 compatibility).
 */
export function ensureSocialSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      handle TEXT NOT NULL UNIQUE,
      avatar_color TEXT NOT NULL DEFAULT '#00B06F',
      bio TEXT NOT NULL DEFAULT '',
      privacy_level TEXT NOT NULL DEFAULT 'public'
        CHECK(privacy_level IN ('public','friends','private')),
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS user_profiles_handle ON user_profiles(handle);

    CREATE TABLE IF NOT EXISTS social_friendships (
      requester_id TEXT NOT NULL REFERENCES users(id),
      addressee_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(requester_id, addressee_id),
      CHECK(requester_id <> addressee_id)
    );
    CREATE INDEX IF NOT EXISTS social_friendships_addressee ON social_friendships(addressee_id, status);

    CREATE TABLE IF NOT EXISTS social_blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id),
      blocked_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(blocker_id, blocked_id),
      CHECK(blocker_id <> blocked_id)
    );
    CREATE INDEX IF NOT EXISTS social_blocks_blocked ON social_blocks(blocked_id);

    CREATE TABLE IF NOT EXISTS social_presence (
      principal_id TEXT PRIMARY KEY REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('online','in_game','offline')),
      game_id TEXT,
      game_title TEXT,
      room_code TEXT,
      joinable INTEGER NOT NULL DEFAULT 1 CHECK(joinable IN (0,1)),
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_parties (
      id TEXT PRIMARY KEY,
      leader_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      target_game_id TEXT,
      room_code TEXT NOT NULL UNIQUE,
      max_members INTEGER NOT NULL DEFAULT 8 CHECK(max_members BETWEEN 2 AND 16),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_party_members (
      party_id TEXT NOT NULL REFERENCES social_parties(id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK(role IN ('leader','member')),
      ready_state INTEGER NOT NULL DEFAULT 0 CHECK(ready_state IN (0,1)),
      joined_at INTEGER NOT NULL,
      PRIMARY KEY(party_id, principal_id)
    );
    CREATE INDEX IF NOT EXISTS social_party_members_principal ON social_party_members(principal_id);

    CREATE TABLE IF NOT EXISTS social_messages (
      id TEXT PRIMARY KEY,
      channel_type TEXT NOT NULL CHECK(channel_type IN ('dm','party')),
      channel_key TEXT NOT NULL,
      sender_id TEXT NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      is_quick_message INTEGER NOT NULL DEFAULT 0 CHECK(is_quick_message IN (0,1)),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS social_messages_channel ON social_messages(channel_type, channel_key, created_at DESC);

    CREATE TABLE IF NOT EXISTS social_leaderboards (
      game_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      principal_id TEXT NOT NULL REFERENCES users(id),
      score INTEGER NOT NULL,
      period_key TEXT NOT NULL DEFAULT 'all',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(game_id, board_id, principal_id, period_key)
    );
    CREATE INDEX IF NOT EXISTS social_leaderboards_rank ON social_leaderboards(game_id, board_id, period_key, score DESC);

    CREATE TABLE IF NOT EXISTS social_reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id),
      target_type TEXT NOT NULL CHECK(target_type IN ('user','message','party')),
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS social_reports_created ON social_reports(created_at DESC);

    CREATE TABLE IF NOT EXISTS social_party_launches (
      launch_id TEXT PRIMARY KEY,
      party_id TEXT NOT NULL REFERENCES social_parties(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL,
      room_code TEXT NOT NULL,
      match_room_id TEXT NOT NULL,
      launched_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS social_party_launches_party ON social_party_launches(party_id, status, created_at DESC);

    CREATE TABLE IF NOT EXISTS social_party_launch_acks (
      launch_id TEXT NOT NULL REFERENCES social_party_launches(launch_id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL REFERENCES users(id),
      platform TEXT NOT NULL DEFAULT 'web',
      state TEXT NOT NULL CHECK(state IN ('joining','entered','declined')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(launch_id, principal_id)
    );
  `);
}
