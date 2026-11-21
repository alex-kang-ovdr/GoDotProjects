import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import { assertNoLinks, regularFile, hashFile } from './backup.mjs';

export const SANITIZER_VERSION = '1.0.0';

/**
 * Fail-Closed Schema Allowlist for PlayHub SQLite snapshots.
 * Any table or column not listed here causes sanitization to abort immediately
 * so newly added PII fields can never leak silently from live to dev/local.
 */
export const SCHEMA_ALLOWLIST = Object.freeze({
  users: ['id', 'kind', 'display_name', 'created_at'],
  identities: ['provider', 'subject', 'user_id'],
  sessions: ['id_hash', 'kind', 'principal_id', 'analytics_subject', 'csrf', 'admin_authenticated', 'admin_username', 'created_at', 'expires_at', 'traffic_type', 'qa_run_id'],
  play_sessions: ['id', 'session_hash', 'principal_id', 'subject_id', 'game_id', 'build_id', 'started_at', 'ready_at', 'last_heartbeat_at', 'last_sequence', 'active_ms', 'paused', 'ended_at', 'expires_at', 'traffic_type', 'qa_run_id'],
  save_slots: ['principal_id', 'game_id', 'slot', 'schema_version', 'revision', 'payload', 'updated_at'],
  save_slot_versions: ['principal_id', 'game_id', 'slot', 'last_revision'],
  save_idempotency: ['principal_id', 'game_id', 'slot', 'request_key', 'request_hash', 'response_json', 'created_at'],
  wishlist_items: ['principal_id', 'game_id', 'added_at'],
  user_preferences: ['principal_id', 'locale', 'updated_at'],
  community_items: ['id', 'game_id', 'author_id', 'kind', 'title', 'body', 'status', 'hidden', 'created_at', 'updated_at'],
  community_votes: ['item_id', 'principal_id', 'created_at'],
  community_reports: ['item_id', 'principal_id', 'reason', 'created_at'],
  oauth_states: ['state_hash', 'session_hash', 'guest_id', 'source_subject', 'nonce', 'verifier', 'return_to', 'expires_at', 'used_at'],
  merge_requests: ['id', 'source_user', 'target_user', 'source_subject', 'target_subject', 'status', 'expires_at', 'result_json'],
  save_backups: ['id', 'merge_id', 'principal_id', 'game_id', 'slot', 'schema_version', 'revision', 'payload', 'created_at', 'reason'],
  analytics_links: ['source_subject', 'target_subject', 'created_at'],
  events: ['id', 'fingerprint', 'name', 'subject_id', 'visit_id', 'play_session_id', 'game_id', 'impression_id', 'occurred_at', 'received_at', 'properties', 'source', 'traffic_type', 'qa_run_id'],
  game_overrides: ['game_id', 'enabled', 'updated_at'],
  errors: ['id', 'code', 'message', 'game_id', 'created_at', 'traffic_type', 'qa_run_id'],
  audit: ['id', 'action', 'target', 'detail', 'created_at'],
  creator_submissions: ['id', 'owner_key', 'owner_id', 'project_id', 'release_id', 'release_revision', 'release_label', 'title', 'description', 'status', 'revision', 'review_note', 'created_at', 'updated_at', 'submitted_at', 'decided_at', 'game_slug', 'visibility', 'deploy_mode', 'artifact_sha256', 'manifest_json', 'package_validation', 'publication_status', 'published_game_id'],
  qa_runs: ['id', 'submission_id', 'target_type', 'target_id', 'release_revision', 'policy_version', 'qa_status', 'score', 'report_path', 'summary_json', 'started_at', 'finished_at'],
  submission_checklists: ['submission_id', 'submission_revision', 'checklist_version', 'items_json', 'updated_by', 'updated_at'],
  l10n_keys: ['key', 'namespace', 'source_text', 'source_hash', 'context_id', 'description', 'max_chars', 'placeholders_json', 'code_refs_json', 'unused_since', 'revision', 'updated_at'],
  l10n_translations: ['key', 'locale', 'value', 'status', 'ai_provider', 'ai_model', 'lint_json', 'updated_by', 'updated_at'],
  l10n_glossary: ['id', 'term_ko', 'term_en', 'is_dnt', 'context_tags_json', 'translations_json', 'forbidden_json', 'notes', 'updated_at'],
  l10n_prompts: ['id', 'name', 'context_id', 'system_prompt', 'rules_json', 'disambiguation_json', 'updated_at'],
  l10n_media_slots: ['slot_key', 'description', 'alt_text_key', 'width', 'height', 'max_bytes', 'allowed_formats_json', 'updated_at'],
  l10n_media_assets: ['slot_key', 'locale', 'filename', 'mime_type', 'bytes', 'sha256', 'updated_by', 'updated_at'],
  l10n_releases: ['version', 'tag', 'sha256', 'key_count', 'media_count', 'coverage_json', 'bundle_json', 'notes', 'is_active', 'created_by', 'created_at'],
  hub_publications: ['game_id', 'host_slug', 'owner_key', 'owner_id', 'project_id', 'active_release_id', 'active_submission_id', 'visibility', 'deploy_mode', 'status', 'artifact_sha256', 'artifact_base_url', 'manifest_json', 'deploy_profile_json', 'cas_version', 'published_at', 'updated_at'],
  hub_publication_history: ['id', 'game_id', 'from_release_id', 'to_release_id', 'action', 'actor_id', 'reason', 'cas_version', 'created_at'],
  hub_publish_idempotency: ['idempotency_key', 'scope', 'request_hash', 'response_json', 'created_at'],
  mobile_tokens: ['id_hash', 'principal_id', 'family_id', 'rotated_from', 'revoked_at', 'expires_at', 'created_at'],
  user_age_compliance: ['principal_id', 'region_code', 'age_tier', 'parental_consent_status', 'parental_consent_at', 'kyc_verified_at', 'updated_at'],
  parental_consent_logs: ['id', 'principal_id', 'guardian_contact_hash', 'method', 'status', 'created_at'],
  cdn_storage: ['owner', 'plan', 'used_bytes', 'reserved_bytes', 'updated_at'],
  cdn_projects: ['id', 'owner', 'host_slug', 'name', 'head_commit_id', 'created_at', 'updated_at', 'trashed_at'],
  cdn_blobs: ['id', 'owner', 'kind', 'sha256', 'bytes', 'object_key', 'state', 'ref_count', 'lease_until', 'created_at', 'state_at'],
  cdn_save_plans: ['id', 'project_id', 'owner', 'base_commit_id', 'files_json', 'state', 'reserved_bytes', 'expires_at', 'created_at'],
  cdn_uploads: ['id', 'plan_id', 'owner', 'path', 'sha256', 'bytes', 'quarantine_key', 'state', 'reserved_bytes', 'blob_id', 'error_code', 'created_at', 'updated_at'],
  cdn_commits: ['id', 'project_id', 'parent_id', 'manifest_blob_id', 'manifest_sha256', 'file_count', 'total_bytes', 'author', 'message', 'restored_from', 'created_at', 'pruned_at'],
  cdn_pins: ['commit_id', 'owner', 'reason', 'created_at'],
  cdn_idempotency: ['owner', 'key', 'scope', 'status', 'response_json', 'created_at'],
  user_profiles: ['principal_id', 'handle', 'avatar_color', 'bio', 'privacy_level', 'updated_at'],
  social_friendships: ['requester_id', 'addressee_id', 'status', 'created_at', 'updated_at'],
  social_blocks: ['blocker_id', 'blocked_id', 'created_at'],
  social_presence: ['principal_id', 'status', 'game_id', 'game_title', 'room_code', 'joinable', 'updated_at'],
  social_parties: ['id', 'leader_id', 'title', 'target_game_id', 'room_code', 'max_members', 'created_at', 'updated_at'],
  social_party_members: ['party_id', 'principal_id', 'role', 'ready_state', 'joined_at'],
  social_messages: ['id', 'channel_type', 'channel_key', 'sender_id', 'body', 'is_quick_message', 'created_at'],
  social_leaderboards: ['game_id', 'board_id', 'principal_id', 'score', 'period_key', 'updated_at'],
  social_reports: ['id', 'reporter_id', 'target_type', 'target_id', 'reason', 'created_at'],
  social_party_launches: ['launch_id', 'party_id', 'game_id', 'room_code', 'match_room_id', 'launched_by', 'status', 'created_at'],
  social_party_launch_acks: ['launch_id', 'principal_id', 'platform', 'state', 'updated_at']
});

// High-risk auth, session, token, private chat, and moderation log tables wiped unconditionally
const DROP_TABLES = [
  'sessions',
  'oauth_states',
  'mobile_tokens',
  'audit',
  'save_idempotency',
  'hub_publish_idempotency',
  'cdn_idempotency',
  'merge_requests',
  'social_messages',
  'social_reports',
  'social_presence',
  'social_party_launch_acks',
  'social_party_launches'
];

export const DEFAULT_PRESERVE_PREFIXES = Object.freeze(['local_', 'dev_', 'qa_']);

export class SanitizeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function hmacHex(salt, domain, value, length = 16) {
  return createHmac('sha256', salt).update(`${domain}:${String(value ?? '')}`).digest('hex').slice(0, length);
}

function validateAllowlist(db) {
  const objects = db.prepare("SELECT type, name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
  for (const obj of objects) {
    if (obj.type === 'trigger' || obj.type === 'view' || /\bCREATE\s+VIRTUAL\s+TABLE\b/i.test(obj.sql || '')) {
      throw new SanitizeError('SANITIZE_FORBIDDEN_OBJECT', `Forbidden SQLite schema object: ${obj.type} ${obj.name}`);
    }
  }
  const tables = new Set(objects.filter(o => o.type === 'table').map(o => o.name));
  const tableColumns = new Map();
  for (const table of tables) {
    const allowedCols = SCHEMA_ALLOWLIST[table];
    if (!allowedCols) {
      throw new SanitizeError(
        'SANITIZE_UNKNOWN_TABLE',
        `Unregistered table '${table}' blocked by Fail-Closed Allowlist. Classify its PII policy before cloning.`
      );
    }
    const allowedSet = new Set(allowedCols);
    const actualCols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    for (const col of actualCols) {
      if (!allowedSet.has(col)) {
        throw new SanitizeError(
          'SANITIZE_UNKNOWN_COLUMN',
          `Unregistered column '${table}.${col}' blocked by Fail-Closed Allowlist. Classify its PII policy before cloning.`
        );
      }
    }
    tableColumns.set(table, actualCols);
  }
  return { tables, tableColumns };
}

function hasPrefix(value, prefixes) {
  if (typeof value !== 'string') return false;
  return prefixes.some(p => value.startsWith(p));
}

function upsertRows(destDb, table, columns, rows) {
  if (!rows.length) return 0;
  const colList = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const stmt = destDb.prepare(`INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`);
  let count = 0;
  for (const row of rows) {
    stmt.run(...columns.map(c => row[c]));
    count++;
  }
  return count;
}

function preserveLocalAndDevData(destDb, destTables, destColumns, preserveFromPath, preservePrefixes) {
  const preserved = { users: 0, identities: 0, saves: 0, compliance: 0, overrides: 0, publications: 0, submissions: 0 };
  const srcPath = assertNoLinks(preserveFromPath);
  regularFile(srcPath, 'Preserve-from SQLite database');
  const srcDb = new DatabaseSync(srcPath, { readOnly: true, timeout: 5000 });
  try {
    const srcTables = new Set(
      srcDb.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name)
    );
    const commonCols = (table) => {
      if (!srcTables.has(table) || !destTables.has(table)) return null;
      const sCols = new Set(srcDb.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
      return destColumns.get(table).filter(c => sCols.has(c));
    };

    // 1. Preserve local/dev test users and their dependent graph
    const userCols = commonCols('users');
    const keptUserIds = new Set();
    if (userCols) {
      const allSrcUsers = srcDb.prepare(`SELECT ${userCols.join(', ')} FROM users`).all();
      const localUsers = allSrcUsers.filter(u => hasPrefix(u.id, preservePrefixes));
      for (const u of localUsers) keptUserIds.add(u.id);
      preserved.users = upsertRows(destDb, 'users', userCols, localUsers);
    }

    if (keptUserIds.size > 0) {
      const idCols = commonCols('identities');
      if (idCols) {
        const rows = srcDb.prepare(`SELECT ${idCols.join(', ')} FROM identities`).all().filter(r => keptUserIds.has(r.user_id));
        preserved.identities = upsertRows(destDb, 'identities', idCols, rows);
      }
      for (const [tbl, keyField, counter] of [
        ['save_slots', 'principal_id', 'saves'],
        ['save_slot_versions', 'principal_id', null],
        ['wishlist_items', 'principal_id', null],
        ['user_preferences', 'principal_id', null],
        ['user_age_compliance', 'principal_id', 'compliance'],
        ['parental_consent_logs', 'principal_id', null],
        ['user_profiles', 'principal_id', null]
      ]) {
        const cols = commonCols(tbl);
        if (!cols) continue;
        const rows = srcDb.prepare(`SELECT ${cols.join(', ')} FROM ${tbl}`).all().filter(r => keptUserIds.has(r[keyField]));
        const n = upsertRows(destDb, tbl, cols, rows);
        if (counter) preserved[counter] += n;
      }
    }

    // 2. Preserve local/dev-only game overrides, unreleased publications, and creator submissions
    const ovCols = commonCols('game_overrides');
    if (ovCols) {
      const destIds = new Set(destDb.prepare('SELECT game_id FROM game_overrides').all().map(r => r.game_id));
      const rows = srcDb.prepare(`SELECT ${ovCols.join(', ')} FROM game_overrides`).all().filter(r => !destIds.has(r.game_id));
      preserved.overrides = upsertRows(destDb, 'game_overrides', ovCols, rows);
    }

    const pubCols = commonCols('hub_publications');
    if (pubCols) {
      const destIds = new Set(destDb.prepare('SELECT game_id FROM hub_publications').all().map(r => r.game_id));
      const rows = srcDb.prepare(`SELECT ${pubCols.join(', ')} FROM hub_publications`).all().filter(r => !destIds.has(r.game_id));
      preserved.publications = upsertRows(destDb, 'hub_publications', pubCols, rows);
    }

    const subCols = commonCols('creator_submissions');
    if (subCols) {
      const destIds = new Set(destDb.prepare('SELECT id FROM creator_submissions').all().map(r => r.id));
      const rows = srcDb.prepare(`SELECT ${subCols.join(', ')} FROM creator_submissions`).all().filter(r => !destIds.has(r.id));
      preserved.submissions = upsertRows(destDb, 'creator_submissions', subCols, rows);
    }
  } finally {
    srcDb.close();
  }
  return preserved;
}

/**
 * Creates a sanitized, Fail-Closed Allowlist SQLite snapshot suitable for live -> dev
 * (or dev -> local) replication while optionally preserving existing local/dev test records.
 */
export async function sanitizeSnapshot({
  from,
  out,
  sourceEnv = 'live',
  targetEnv = 'dev',
  salt = null,
  eventsDays = 7,
  targetOrigin = null,
  preserveFrom = null,
  preservePrefixes = DEFAULT_PRESERVE_PREFIXES,
  now = () => Date.now()
}) {
  if (!from || !out) {
    throw new SanitizeError('SANITIZE_ARGS', 'Both --from and --out paths are required.');
  }
  const normalizedTarget = String(targetEnv).trim().toLowerCase();
  if (normalizedTarget === 'live' || normalizedTarget === 'prod' || normalizedTarget === 'production') {
    throw new SanitizeError('SANITIZE_FORBIDDEN_TARGET', 'One-way guardrail: targetEnv cannot be live/production.');
  }
  if (!Number.isFinite(eventsDays) || eventsDays < 0) {
    throw new SanitizeError('SANITIZE_ARGS', 'eventsDays must be a non-negative number.');
  }

  const sourcePath = assertNoLinks(from);
  regularFile(sourcePath, 'Source SQLite database');
  const outPath = assertNoLinks(out);
  const metadataPath = outPath + '.json';
  if (sourcePath === outPath || ['', '-wal', '-shm', '-journal', '.json'].some(s => fs.existsSync(outPath + s))) {
    throw new SanitizeError('SANITIZE_TARGET_EXISTS', 'Choose a new output path; existing files will not be overwritten.');
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true, mode: 0o700 });
  const hmacSalt = salt || randomBytes(32).toString('hex');
  const createdFiles = [];

  try {
    // Online WAL-safe snapshot copy
    const srcDb = new DatabaseSync(sourcePath, { readOnly: true, timeout: 5000 });
    try {
      await backup(srcDb, outPath);
      createdFiles.push(outPath);
    } finally {
      srcDb.close();
    }

    const db = new DatabaseSync(outPath, { timeout: 5000 });
    let stats = {
      droppedTables: [],
      pseudonymizedUsers: 0,
      pseudonymizedIdentities: 0,
      sanitizedConsentLogs: 0,
      prunedEvents: 0,
      prunedErrors: 0,
      prunedPlaySessions: 0,
      rewrittenPublications: 0,
      preserved: null
    };
    let dbVersion = 0;

    try {
      db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON');
      const { tables, tableColumns } = validateAllowlist(db);
      dbVersion = db.prepare('PRAGMA user_version').get().user_version;

      db.exec('BEGIN IMMEDIATE');
      try {
        // 1. Wipe all auth/session/token/audit/idempotency tables unconditionally
        for (const tbl of DROP_TABLES) {
          if (tables.has(tbl)) {
            db.exec(`DELETE FROM ${tbl}`);
            stats.droppedTables.push(tbl);
          }
        }

        // 2. Deterministic HMAC pseudonymization of users.display_name
        if (tables.has('users')) {
          const users = db.prepare('SELECT id, display_name FROM users').all();
          const upd = db.prepare('UPDATE users SET display_name = ? WHERE id = ?');
          for (const u of users) {
            const label = `DevUser_${hmacHex(hmacSalt, 'user_display', u.id, 8)}`;
            upd.run(label, u.id);
            stats.pseudonymizedUsers++;
          }
        }

        // 2b. Pseudonymize user_profiles.handle and clear free-text bio
        if (tables.has('user_profiles')) {
          const profs = db.prepare('SELECT principal_id FROM user_profiles').all();
          const upd = db.prepare("UPDATE user_profiles SET handle = ?, bio = '' WHERE principal_id = ?");
          for (const p of profs) {
            const code = String((parseInt(hmacHex(hmacSalt, 'profile_tag', p.principal_id, 4), 16) % 9000) + 1000);
            const h = `DevUser_${hmacHex(hmacSalt, 'profile_handle', p.principal_id, 6)}#${code}`;
            upd.run(h, p.principal_id);
          }
        }

        // 3. Deterministic HMAC pseudonymization of identities.subject (preserving FK to users.id)
        if (tables.has('identities')) {
          const idents = db.prepare('SELECT provider, subject, user_id FROM identities').all();
          db.exec('DELETE FROM identities');
          const ins = db.prepare('INSERT INTO identities (provider, subject, user_id) VALUES (?, ?, ?)');
          for (const row of idents) {
            const fakeSubject = `devsub_${hmacHex(hmacSalt, `ident:${row.provider}`, row.subject, 16)}`;
            ins.run(row.provider, fakeSubject, row.user_id);
            stats.pseudonymizedIdentities++;
          }
        }

        // 4. Re-hash parental_consent_logs.guardian_contact_hash so live guardian contacts are unlinkable
        if (tables.has('parental_consent_logs')) {
          const logs = db.prepare('SELECT id, guardian_contact_hash FROM parental_consent_logs').all();
          const upd = db.prepare('UPDATE parental_consent_logs SET guardian_contact_hash = ? WHERE id = ?');
          for (const log of logs) {
            upd.run(`sanitized_${hmacHex(hmacSalt, 'guardian', log.guardian_contact_hash, 16)}`, log.id);
            stats.sanitizedConsentLogs++;
          }
        }

        // 5. Prune high-volume telemetry tables to recent N days (or drop all if eventsDays === 0)
        const cutoff = eventsDays === 0 ? Number.MAX_SAFE_INTEGER : now() - eventsDays * 86400000;
        if (tables.has('events')) {
          stats.prunedEvents = db.prepare('DELETE FROM events WHERE received_at < ?').run(cutoff).changes;
        }
        if (tables.has('errors')) {
          stats.prunedErrors = db.prepare('DELETE FROM errors WHERE created_at < ?').run(cutoff).changes;
        }
        if (tables.has('play_sessions')) {
          stats.prunedPlaySessions = db.prepare('DELETE FROM play_sessions WHERE started_at < ?').run(cutoff).changes;
        }

        // 6. Optional targetOrigin rewrite for hub_publications.artifact_base_url
        if (targetOrigin && tables.has('hub_publications')) {
          const cleanOrigin = String(targetOrigin).trim().replace(/\/$/, '');
          const pubs = db.prepare('SELECT game_id, artifact_base_url FROM hub_publications').all();
          const upd = db.prepare('UPDATE hub_publications SET artifact_base_url = ? WHERE game_id = ?');
          for (const pub of pubs) {
            if (typeof pub.artifact_base_url === 'string' && /^https?:\/\//i.test(pub.artifact_base_url)) {
              const parsed = new URL(pub.artifact_base_url);
              upd.run(`${cleanOrigin}${parsed.pathname}`, pub.game_id);
              stats.rewrittenPublications++;
            }
          }
        }

        // 7. Preserve existing local/dev test accounts & unreleased local/dev games if requested
        if (preserveFrom) {
          stats.preserved = preserveLocalAndDevData(db, tables, tableColumns, preserveFrom, preservePrefixes);
        }

        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      // Self-contained DELETE journal + integrity + FK verification
      db.exec('PRAGMA journal_mode=DELETE; VACUUM;');
      const integrity = Object.values(db.prepare('PRAGMA integrity_check(1)').get())[0];
      if (integrity !== 'ok') {
        throw new SanitizeError('SANITIZE_INTEGRITY', `Post-sanitize integrity check failed: ${integrity}`);
      }
      if (db.prepare('PRAGMA foreign_key_check').get()) {
        throw new SanitizeError('SANITIZE_FOREIGN_KEYS', 'Post-sanitize foreign key check failed.');
      }
    } finally {
      db.close();
    }

    if (process.platform !== 'win32') fs.chmodSync(outPath, 0o600);
    const sha256 = await hashFile(outPath);
    const bytes = fs.statSync(outPath).size;
    const report = {
      schemaVersion: 1,
      sanitizerVersion: SANITIZER_VERSION,
      ok: true,
      sanitized: true,
      sourceEnv,
      targetEnv: normalizedTarget,
      createdAt: new Date(now()).toISOString(),
      path: outPath,
      bytes,
      sha256,
      integrity: 'ok',
      foreignKeys: 'ok',
      databaseUserVersion: dbVersion,
      snapshotType: 'sqlite-sanitized-clone',
      stats
    };
    fs.writeFileSync(metadataPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    createdFiles.push(metadataPath);
    return report;
  } catch (err) {
    for (const f of [metadataPath, outPath, outPath + '-wal', outPath + '-shm', outPath + '-journal']) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
    throw err;
  }
}

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--help') return { help: true };
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) throw new SanitizeError('SANITIZE_ARGS', `Missing value for ${flag}`);
    switch (flag) {
      case '--from': opts.from = next; break;
      case '--out': opts.out = next; break;
      case '--source-env': opts.sourceEnv = next; break;
      case '--target-env': opts.targetEnv = next; break;
      case '--salt': opts.salt = next; break;
      case '--events-days': opts.eventsDays = Number(next); break;
      case '--target-origin': opts.targetOrigin = next; break;
      case '--preserve-from': opts.preserveFrom = next; break;
      case '--preserve-prefixes': opts.preservePrefixes = next.split(',').map(s => s.trim()).filter(Boolean); break;
      default: throw new SanitizeError('SANITIZE_ARGS', `Unknown option: ${flag}`);
    }
    i++;
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
      console.log(
        'Usage: node hub/tools/sanitize-snapshot.mjs --from <live.sqlite> --out <sanitized.sqlite> ' +
        '[--source-env live] [--target-env dev|local] [--events-days 7] [--target-origin https://dev...] ' +
        '[--preserve-from <existing-dev-or-local.sqlite>] [--preserve-prefixes local_,dev_,qa_]'
      );
    } else {
      const report = await sanitizeSnapshot(args);
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (err) {
    console.error(`Sanitize failed [${err.code || 'ERROR'}]: ${err.message}`);
    process.exitCode = 1;
  }
}
