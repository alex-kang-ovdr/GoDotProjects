import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

export function openDatabase(dataDir) {
  if (!isAbsolute(dataDir)) throw new Error('dataDir must be an absolute path outside the IIS web roots');
  if (existsSync(join(dataDir,'maintenance.lock'))) throw new Error('Database maintenance is in progress or needs explicit recovery. Startup refused.');
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const filename = join(dataDir, 'platform.sqlite');
  const db = new DatabaseSync(filename);
  if (db.prepare('PRAGMA user_version').get().user_version > 1) { db.close(); throw new Error('This database schema is newer than the supported application version.'); }
  try { chmodSync(filename, 0o600); } catch {}
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,kind TEXT NOT NULL,display_name TEXT,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identities(provider TEXT NOT NULL,subject TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),PRIMARY KEY(provider,subject));
    CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,kind TEXT NOT NULL,principal_id TEXT,analytics_subject TEXT NOT NULL,csrf TEXT NOT NULL,admin_authenticated INTEGER NOT NULL DEFAULT 0,admin_username TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS play_sessions(id TEXT PRIMARY KEY,session_hash TEXT NOT NULL,principal_id TEXT NOT NULL,subject_id TEXT NOT NULL,game_id TEXT NOT NULL,build_id TEXT NOT NULL,started_at INTEGER NOT NULL,ready_at INTEGER,last_heartbeat_at INTEGER,last_sequence INTEGER NOT NULL DEFAULT -1,active_ms INTEGER NOT NULL DEFAULT 0,paused INTEGER NOT NULL DEFAULT 0,ended_at INTEGER,expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS save_slots(principal_id TEXT NOT NULL,game_id TEXT NOT NULL,slot TEXT NOT NULL,schema_version INTEGER NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,updated_at INTEGER NOT NULL,PRIMARY KEY(principal_id,game_id,slot));
    CREATE TABLE IF NOT EXISTS save_slot_versions(principal_id TEXT NOT NULL,game_id TEXT NOT NULL,slot TEXT NOT NULL,last_revision INTEGER NOT NULL,PRIMARY KEY(principal_id,game_id,slot));
    CREATE TABLE IF NOT EXISTS save_idempotency(principal_id TEXT,game_id TEXT,slot TEXT,request_key TEXT,request_hash TEXT,response_json TEXT,created_at INTEGER,PRIMARY KEY(principal_id,game_id,slot,request_key));
    CREATE TABLE IF NOT EXISTS wishlist_items(principal_id TEXT NOT NULL,game_id TEXT NOT NULL,added_at INTEGER NOT NULL,PRIMARY KEY(principal_id,game_id));
    CREATE TABLE IF NOT EXISTS user_preferences(principal_id TEXT PRIMARY KEY,locale TEXT NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS community_items(
      id TEXT PRIMARY KEY,game_id TEXT NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL CHECK(kind IN ('comment','suggestion')),title TEXT NOT NULL,body TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('open','planned','completed','declined') AND (kind='suggestion' OR status='open')),
      hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1)),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS community_items_game_date ON community_items(game_id,created_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS community_items_author ON community_items(author_id);
    CREATE TABLE IF NOT EXISTS community_votes(
      item_id TEXT NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(item_id,principal_id)
    );
    CREATE INDEX IF NOT EXISTS community_votes_principal ON community_votes(principal_id);
    CREATE TABLE IF NOT EXISTS community_reports(
      item_id TEXT NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
      principal_id TEXT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(item_id,principal_id)
    );
    CREATE INDEX IF NOT EXISTS community_reports_principal ON community_reports(principal_id);
    CREATE TABLE IF NOT EXISTS oauth_states(state_hash TEXT PRIMARY KEY,session_hash TEXT NOT NULL,guest_id TEXT,source_subject TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,return_to TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER);
    CREATE TABLE IF NOT EXISTS merge_requests(id TEXT PRIMARY KEY,source_user TEXT NOT NULL,target_user TEXT NOT NULL,source_subject TEXT NOT NULL,target_subject TEXT NOT NULL,status TEXT NOT NULL,expires_at INTEGER NOT NULL,result_json TEXT);
    CREATE TABLE IF NOT EXISTS save_backups(id TEXT PRIMARY KEY,merge_id TEXT NOT NULL,principal_id TEXT NOT NULL,game_id TEXT NOT NULL,slot TEXT NOT NULL,schema_version INTEGER NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS analytics_links(source_subject TEXT PRIMARY KEY,target_subject TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,name TEXT NOT NULL,subject_id TEXT NOT NULL,visit_id TEXT NOT NULL,play_session_id TEXT,game_id TEXT,impression_id TEXT,occurred_at INTEGER NOT NULL,received_at INTEGER NOT NULL,properties TEXT NOT NULL,source TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS events_by_name_date ON events(name,occurred_at);
    CREATE INDEX IF NOT EXISTS events_by_game ON events(game_id,occurred_at);
    CREATE TABLE IF NOT EXISTS game_overrides(game_id TEXT PRIMARY KEY,enabled INTEGER NOT NULL,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS errors(id TEXT PRIMARY KEY,code TEXT NOT NULL,message TEXT NOT NULL,game_id TEXT,created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,action TEXT NOT NULL,target TEXT,detail TEXT NOT NULL,created_at INTEGER NOT NULL);
  `);
  transaction(db,()=>{
    for(const table of ['sessions','play_sessions','events','errors']){
      const names=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(column=>column.name));
      if(!names.has('traffic_type'))db.exec(`ALTER TABLE ${table} ADD COLUMN traffic_type TEXT NOT NULL DEFAULT 'live' CHECK(traffic_type IN ('live','qa'))`);
      if(!names.has('qa_run_id'))db.exec(`ALTER TABLE ${table} ADD COLUMN qa_run_id TEXT`);
    }
    if(!db.prepare('PRAGMA table_info(save_backups)').all().some(column=>column.name==='reason'))db.exec("ALTER TABLE save_backups ADD COLUMN reason TEXT NOT NULL DEFAULT 'merge_conflict'");
    db.exec('INSERT INTO save_slot_versions SELECT principal_id,game_id,slot,revision FROM save_slots WHERE 1 ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET last_revision=MAX(last_revision,excluded.last_revision); INSERT INTO save_slot_versions SELECT principal_id,game_id,slot,MAX(revision) FROM save_backups WHERE 1 GROUP BY principal_id,game_id,slot ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET last_revision=MAX(last_revision,excluded.last_revision)');
    db.exec('CREATE INDEX IF NOT EXISTS events_by_traffic_date ON events(traffic_type,qa_run_id,received_at); CREATE INDEX IF NOT EXISTS plays_by_traffic_date ON play_sessions(traffic_type,qa_run_id,started_at); PRAGMA user_version=1');
  });
  return db;
}
export function transaction(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch (error) { db.exec('ROLLBACK'); throw error; } }

