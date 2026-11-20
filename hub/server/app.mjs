import http from 'node:http';
import { isIP } from 'node:net';
import { createHubForge, googleIdentityForSession, forgeAccountKey } from './forge-account.mjs';
import { createCreatorReview } from './creator-review.mjs';
import { createAdminConsole } from './admin-console.mjs';
import { createForgeGateway } from './forge-gateway.mjs';
import { createL10n } from './l10n.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { openDatabase, transaction } from './db.mjs';
import { readCatalog, findGame } from './catalog.mjs';
import { liveMetrics, demoMetrics } from './metrics.mjs';
import { createGoogle } from './google.mjs';
import { resolveRuntimeConfig } from './runtime-config.mjs';
import { createLocalAdminLogin } from './local-admin-login.mjs';
import { createCommunity, mergeGuestCommunity } from './community.mjs';
import { createCdn } from './cdn/routes.mjs';
import { createVersionCompat } from './version-compat.mjs';
import { PUBLIC_COOKIE, FORGE_COOKIE, ADMIN_COOKIE, uid, secret, digest, equal, ApiError, cookies, setCookie, readJson, json, cors, checkPassword, safeString, assertId } from './security.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DAY = 86400000;
const UI_EVENTS = new Set(['game_impression', 'game_card_click', 'game_detail_view', 'play_click']);
const GAME_EVENTS = new Set(['game_ready', 'play_heartbeat', 'game_pause', 'game_resume', 'game_end', 'round_start', 'round_complete', 'runtime_error']);
const EVENT_KEYS = new Set(['event_id','event_name','game_id','play_session_id','impression_id','occurred_at','properties','page_view_id','web_session_id','placement_id','creative_id','slot_index','schema_version']);
const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const cookieName = kind => kind === 'admin' ? ADMIN_COOKIE : PUBLIC_COOKIE;
function extractTrustedClientIp(req, { trustProxy, trustedProxySecret }) {
  const peer = req.socket?.remoteAddress || 'unknown';
  if (!LOOPBACK_PEERS.has(peer)) return peer;
  const proxyAuthed = Boolean(trustedProxySecret) && equal(req.headers['x-playhub-proxy-secret'], trustedProxySecret);
  if (!proxyAuthed && !trustProxy) return peer;
  const cfIp = typeof req.headers['cf-connecting-ip'] === 'string' ? req.headers['cf-connecting-ip'].trim() : '';
  if (cfIp && isIP(cfIp)) return cfIp;
  const xff = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : '';
  if (xff) {
    const parts = xff.split(',').map(part => part.trim()).filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (isIP(parts[i])) return parts[i];
    }
  }
  return peer;
}

export function createApp(input, dependencies = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required');
  const env = dependencies.env || process.env;
  const config = resolveRuntimeConfig({ publicHost: '0.0.0.0', publicPort: 8090, adminHost: '127.0.0.1', adminPort: 8091, secureCookies: false, ...input }, env);
  const internalForgeSecret = config.forge?.internalSecret || env.PLAYHUB_FORGE_INTERNAL_SECRET || '';
  const previousInternalForgeSecret = config.forge?.previousInternalSecret || env.PLAYHUB_FORGE_INTERNAL_SECRET_PREVIOUS || '';
  // Opt-in: serve the Forge session verifier on the public listener so a Forge on another host can
  // reach it. Never enabled by default; requires a strong shared secret and is meant to sit behind HTTPS.
  const remoteForgeVerify = config.forge?.remoteVerify === true || env.PLAYHUB_FORGE_REMOTE_VERIFY === '1';
  if (remoteForgeVerify && internalForgeSecret.length < 32) throw new Error('Remote Forge session verification requires PLAYHUB_FORGE_INTERNAL_SECRET of at least 32 characters');
  if (previousInternalForgeSecret && previousInternalForgeSecret.length < 32) throw new Error('PLAYHUB_FORGE_INTERNAL_SECRET_PREVIOUS must be at least 32 characters when set');
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.adminHost)) throw new Error('adminHost must be loopback');
  for (const key of ['userOrigins','adminOrigins']) {
    if (!Array.isArray(config[key]) || !config[key].length || config[key].some(o => { try { return new URL(o).origin !== o || !['http:','https:'].includes(new URL(o).protocol); } catch { return true; } })) throw new Error(`${key} must contain explicit HTTP(S) origins`);
  }
  if (!config.userBaseUrl || !config.userOrigins.includes(new URL(config.userBaseUrl).origin)) throw new Error('userBaseUrl origin must be in userOrigins');
  if (config.admin?.passwordHash && (!/^[a-f0-9]{128}$/i.test(config.admin.passwordHash) || !/^[a-f0-9]{32}$/i.test(config.admin.salt || ''))) throw new Error('Invalid scrypt administrator configuration');
  const rootDir = dependencies.rootDir || DEFAULT_ROOT;
  const platformRoot = dependencies.platformRoot || resolve(rootDir, '..');
  const now = dependencies.clock || Date.now;
  const localAdminLogin = createLocalAdminLogin(config, now);
  const db = openDatabase(config.dataDir);
  const trustedProxySecret = typeof dependencies.trustedProxySecret === 'string' ? dependencies.trustedProxySecret : '';
  const trustProxy = config.trustProxy === true || env.PLAYHUB_TRUST_PROXY === '1';
  const rateLimitIp = req => extractTrustedClientIp(req, { trustProxy, trustedProxySecret });
  const limiter = new Map();
  function rate(key, max, windowMs) {
    const stamp = now(); let r = limiter.get(key);
    if (!r || r.until <= stamp) { r = { count: 0, until: stamp + windowMs }; limiter.set(key, r); }
    if (++r.count > max) throw new ApiError(429, 'RATE_LIMITED');
    if (limiter.size > 10000) for (const [k, v] of limiter) if (v.until <= stamp) limiter.delete(k);
  }
  function audit(action, target, detail = {}) { db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(uid(), action, target || null, JSON.stringify(detail), now()); }
  function newSession(res, kind, principal = null, subject = null, authenticated = false, traffic = {}) {
    const registered=principal && db.prepare('SELECT kind FROM users WHERE id=?').get(principal)?.kind==='registered';
    const token = secret(), hash = digest(token), csrf = secret(), stamp=now(), ttl = kind === 'admin' ? (authenticated ? 8 * 3600000 : 600000) : (registered ? 30 : 90) * DAY;
    db.prepare('INSERT INTO sessions(id_hash,kind,principal_id,analytics_subject,csrf,admin_authenticated,admin_username,created_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(hash, kind, principal, subject || `a:${uid()}`, csrf, authenticated ? 1 : 0, authenticated ? (config.admin?.username || 'admin') : null, stamp, stamp + ttl,traffic.trafficType || 'live',traffic.qaRunId || null);
    const maxAge = Math.floor(ttl / 1000);
    setCookie(res, cookieName(kind), token, config.secureCookies, maxAge);
    if (kind === 'public' && registered && (traffic.trafficType || 'live') !== 'qa') {
      setCookie(res, FORGE_COOKIE, token, config.secureCookies, maxAge, '/forge');
    }
    return db.prepare('SELECT * FROM sessions WHERE id_hash=?').get(hash);
  }
  function sessionFor(req, kind) {
    const token = cookies(req)[cookieName(kind)];
    if (!token) return null;
    const s = db.prepare('SELECT * FROM sessions WHERE id_hash=? AND kind=?').get(digest(token), kind);
    return s && s.expires_at > now() ? s : null;
  }
  function requireSession(req, kind, adminRequired = false) {
    const s = sessionFor(req, kind);
    if (!s) throw new ApiError(401, 'SESSION_REQUIRED');
    if (adminRequired && !s.admin_authenticated) throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED');
    if ((['POST','PUT','PATCH','DELETE'].includes(req.method) || req.headers['x-csrf-token']!==undefined) && !equal(req.headers['x-csrf-token'], s.csrf)) throw new ApiError(403, 'CSRF_INVALID');
    return s;
  }
  function revokeSession(s) {
    db.prepare('DELETE FROM sessions WHERE id_hash=?').run(s.id_hash);
    db.prepare('UPDATE play_sessions SET ended_at=COALESCE(ended_at,?) WHERE session_hash=?').run(now(), s.id_hash);
  }
  function renewGuestSession(req,res,s) {
    if(!s || !s.principal_id || db.prepare('SELECT kind FROM users WHERE id=?').get(s.principal_id)?.kind!=='guest')return s;
    const stamp=now(),expires=stamp+90*DAY;
    const updated=db.prepare("UPDATE sessions SET expires_at=? WHERE id_hash=? AND kind='public' AND expires_at>?").run(expires,s.id_hash,stamp);
    if(updated.changes!==1)return null;
    setCookie(res,PUBLIC_COOKIE,cookies(req)[PUBLIC_COOKIE],config.secureCookies,90*DAY/1000);
    return {...s,expires_at:expires};
  }
  function promote(s,req,res) {
    // Recheck after the request body await: a revoked/expired cookie cannot be
    // brought back by a request that began while it was still valid.
    const current=sessionFor(req,'public');
    if(!current || current.id_hash!==s.id_hash)throw new ApiError(401,'SESSION_REQUIRED');
    if (current.principal_id) return current;
    const userId = uid(),stamp=now(),expires=stamp+90*DAY;
    transaction(db, () => {
      db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(userId, 'guest', null, stamp);
      const updated=db.prepare('UPDATE sessions SET principal_id=?,expires_at=? WHERE id_hash=? AND expires_at>?').run(userId,expires,current.id_hash,stamp);
      if(updated.changes!==1)throw new ApiError(401,'SESSION_REQUIRED');
    });
    setCookie(res,PUBLIC_COOKIE,cookies(req)[PUBLIC_COOKIE],config.secureCookies,90*DAY/1000);
    return { ...current, principal_id: userId,expires_at:expires };
  }
  const google = createGoogle({ config, db, now, fetch: dependencies.fetch || globalThis.fetch, newSession, revokeSession, audit });
  if(config.forge?.enabled===true && (!config.secureCookies || config.userOrigins.some(o=>!o.startsWith('https://'))))throw new Error('Forge requires HTTPS and secure Hub cookies');
  // One gateway for every Hub module that needs Forge (forge-gateway.mjs); supports both local and remote modes.
  const forgeGateway=dependencies.forgeGateway||createForgeGateway({config:config.forge||{},root:platformRoot,env:dependencies.env||process.env,fetchImpl:dependencies.fetch||globalThis.fetch});
  const forge=createHubForge({config:config.forge,db,requireSession,root:platformRoot,fetchImpl:dependencies.fetch||globalThis.fetch,gateway:forgeGateway});
  const creatorReview=createCreatorReview({config:config.forge,db,requireSession,root:platformRoot,now,audit,forgeGateway});
  const adminConsole=createAdminConsole({config,db,rootDir,platformRoot,now,audit,env:dependencies.env||process.env,rate,requireSession,forgeGateway});
  const l10n=createL10n({config,db,rootDir,now,audit,env:dependencies.env||process.env,fetchImpl:dependencies.fetch||globalThis.fetch,requireSession});
  const community = createCommunity({ db, rootDir, now, sessionFor, requireSession, promote, rate, audit });
  // PlayHub-CDN (R2 UGC storage). Inert unless config.cdn.enabled === true.
  const cdn = createCdn({ config, db, requireSession, now, audit, rate, env: dependencies.env || process.env, fetchImpl: dependencies.cdnFetch || globalThis.fetch });
  // Build version identity, COMPAT_* compatibility gate, and per-target force/optional release policy.
  const versionCompat = createVersionCompat({ config, rootDir, platformRoot, now, audit, env: dependencies.env || process.env });
  function pendingMerge(principal) {
    const m = principal && db.prepare("SELECT * FROM merge_requests WHERE target_user=? AND status='pending' AND expires_at>? ORDER BY expires_at DESC LIMIT 1").get(principal, now());
    if (!m) return null;
    const source = db.prepare('SELECT * FROM save_slots WHERE principal_id=?').all(m.source_user);
    const conflicts = source.flatMap(s => {
      const t = db.prepare('SELECT * FROM save_slots WHERE principal_id=? AND game_id=? AND slot=?').get(m.target_user,s.game_id,s.slot);
      return t && (t.payload !== s.payload || t.schema_version !== s.schema_version) ? [{ gameId:s.game_id,slot:s.slot,sourceRevision:s.revision,targetRevision:t.revision }] : [];
    });
    return { id:m.id,sourceSaveCount:source.length,conflicts };
  }
  function profile(s) {
    const user = s.principal_id && db.prepare('SELECT kind,display_name FROM users WHERE id=?').get(s.principal_id);
    return { kind:user?.kind || 'anonymous',csrfToken:s.csrf,displayName:user?.display_name || null,googleEnabled:google.enabled && s.traffic_type!=='qa',pendingMerge:pendingMerge(s.principal_id),trafficType:s.traffic_type,qaRunId:s.qa_run_id || null };
  }
  const supportedLocales = new Set(['ko','en','ja','zh-CN','fr','es','pt-BR','hi']);
  function wishlist(s) {
    if (!s?.principal_id) return {items:[],kind:'anonymous'};
    const kind=db.prepare('SELECT kind FROM users WHERE id=?').get(s.principal_id)?.kind || 'anonymous';
    const availableGames=new Set(readCatalog(rootDir,db).filter(game=>game.enabled).map(game=>game.id));
    const items=db.prepare('SELECT game_id,added_at FROM wishlist_items WHERE principal_id=? ORDER BY added_at DESC,game_id').all(s.principal_id).map(row => {
      return {gameId:row.game_id,addedAt:new Date(row.added_at).toISOString(),available:availableGames.has(row.game_id)};
    });
    return {items,kind};
  }
  function serverEvent(name, s, gameId, playId, properties = {}, fixedId = null) {
    db.prepare('INSERT OR IGNORE INTO events(id,fingerprint,name,subject_id,visit_id,play_session_id,game_id,impression_id,occurred_at,received_at,properties,source,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(fixedId || uid(), digest(JSON.stringify(properties)), name, s.analytics_subject, s.id_hash, playId || null, gameId || null, null, now(), now(), JSON.stringify(properties), 'server',s.traffic_type,s.qa_run_id);
  }
  function getSave(s, gameId, slot) {
    if (!s.principal_id) throw new ApiError(401, 'PLAY_FIRST');
    return db.prepare('SELECT * FROM save_slots WHERE principal_id=? AND game_id=? AND slot=?').get(s.principal_id,gameId,slot);
  }
  function saveJson(row) { return { slot:row.slot,schemaVersion:row.schema_version,revision:row.revision,payload:JSON.parse(row.payload),updatedAt:new Date(row.updated_at).toISOString() }; }
  function nextSaveRevision(principal,gameId,slot,current){
    const prior=db.prepare('SELECT last_revision FROM save_slot_versions WHERE principal_id=? AND game_id=? AND slot=?').get(principal,gameId,slot);
    const revision=Math.max(prior?.last_revision || 0,current?.revision || 0)+1;
    db.prepare('INSERT INTO save_slot_versions VALUES(?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET last_revision=excluded.last_revision').run(principal,gameId,slot,revision);
    return revision;
  }
  function trimRecoveryBackups(principal,gameId){
    db.prepare("DELETE FROM save_backups WHERE id IN(SELECT id FROM save_backups WHERE principal_id=? AND game_id=? AND reason IN('restore_previous','slot_deleted') ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 20)").run(principal,gameId);
  }
  function recoverableBackups(principal,gameId) {
    return db.prepare("SELECT b.* FROM save_backups b WHERE b.game_id=? AND (b.principal_id=? OR EXISTS(SELECT 1 FROM merge_requests m WHERE m.id=b.merge_id AND m.target_user=? AND m.status='completed')) ORDER BY b.created_at DESC,b.rowid DESC").all(gameId,principal,principal);
  }
  function metricsOptions(url) {
    const dataset=url.searchParams.get('dataset') || 'live';
    if(!['live','qa','demo'].includes(dataset))throw new ApiError(400,'DATASET_INVALID');
    const result={dataset,from:url.searchParams.get('from') || null,to:url.searchParams.get('to') || null,gameId:url.searchParams.get('gameId') || null,qaRunId:url.searchParams.get('qaRunId') || null};
    for(const value of [result.from,result.to])if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value+'T00:00:00Z')) || new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value))throw new ApiError(400,'DATE_FILTER_INVALID');
    if(result.from && result.to && result.from>result.to)throw new ApiError(400,'DATE_RANGE_INVALID');
    if(result.qaRunId && (dataset!=='qa' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(result.qaRunId)))throw new ApiError(400,'QA_RUN_FILTER_INVALID');
    if(result.qaRunId)result.qaRunId=result.qaRunId.toLowerCase();
    if(dataset==='demo' && [result.from,result.to,result.gameId,result.qaRunId].some(Boolean))throw new ApiError(400,'DEMO_FILTERS_UNSUPPORTED');
    if(result.gameId)findGame(rootDir,db,assertId(result.gameId),false);
    return result;
  }
  function processEvent(event, s) {
    if (!event || typeof event !== 'object' || Array.isArray(event) || Object.keys(event).some(k => !EVENT_KEYS.has(k))) throw new ApiError(422,'EVENT_FIELDS_INVALID');
    if (!safeString(event.event_id,128) || !/^[A-Za-z0-9:_-]+$/.test(event.event_id)) throw new ApiError(422,'EVENT_ID_INVALID');
    if (!UI_EVENTS.has(event.event_name) && !GAME_EVENTS.has(event.event_name)) throw new ApiError(422,'EVENT_NAME_INVALID');
    const fingerprint = digest(JSON.stringify(event));
    const existing = db.prepare('SELECT fingerprint,subject_id FROM events WHERE id=?').get(event.event_id);
    if (existing) { if (existing.fingerprint !== fingerprint || existing.subject_id !== s.analytics_subject) throw new ApiError(409,'EVENT_ID_CONFLICT'); return 'duplicate'; }
    const stamp = now(), occurred = event.occurred_at ? Date.parse(event.occurred_at) : stamp;
    if (!Number.isFinite(occurred) || occurred > stamp + 60000 || occurred < stamp - DAY) throw new ApiError(422,'EVENT_TIME_INVALID');
    if (event.properties && (typeof event.properties !== 'object' || Array.isArray(event.properties))) throw new ApiError(422,'EVENT_PROPERTIES_INVALID');
    const p = event.properties || {};
    if (JSON.stringify(p).length > 4096 || Object.keys(p).some(k => /token|password|secret|email|cookie|payload/i.test(k))) throw new ApiError(422,'EVENT_PROPERTIES_INVALID');
    let gameId = event.game_id, play = null, props = { ...p };
    if (GAME_EVENTS.has(event.event_name)) {
      if (!s.principal_id || !safeString(event.play_session_id)) throw new ApiError(403,'PLAY_SESSION_REQUIRED');
      play = db.prepare('SELECT * FROM play_sessions WHERE id=?').get(event.play_session_id);
      if (!play || play.session_hash !== s.id_hash || play.principal_id !== s.principal_id || play.expires_at <= stamp || play.ended_at !== null) throw new ApiError(403,'PLAY_SESSION_INVALID');
      if (gameId && gameId !== play.game_id) throw new ApiError(403,'GAME_SCOPE_INVALID');
      gameId = play.game_id;
    } else findGame(rootDir,db,assertId(gameId));
    if (event.event_name === 'game_impression' && (!(p.visible_fraction >= 0.5 && p.visible_fraction <= 1) || !Number.isFinite(p.visible_duration_ms) || p.visible_duration_ms < 1000 || p.document_visible !== true || !safeString(event.impression_id))) throw new ApiError(422,'IMPRESSION_NOT_VISIBLE');
    if (event.event_name === 'game_card_click' && !safeString(event.impression_id)) throw new ApiError(422,'IMPRESSION_ID_REQUIRED');
    if (event.event_name === 'game_ready') db.prepare('UPDATE play_sessions SET ready_at=COALESCE(ready_at,?),last_heartbeat_at=COALESCE(last_heartbeat_at,?) WHERE id=?').run(stamp,stamp,play.id);
    if (event.event_name === 'game_pause' || event.event_name === 'game_resume') db.prepare('UPDATE play_sessions SET paused=?,last_heartbeat_at=? WHERE id=?').run(event.event_name === 'game_pause' ? 1 : 0,stamp,play.id);
    if (event.event_name === 'game_end') db.prepare('UPDATE play_sessions SET ended_at=? WHERE id=?').run(stamp,play.id);
    if (event.event_name === 'play_heartbeat') {
      if (play.ready_at === null || !Number.isInteger(p.sequence) || p.sequence <= play.last_sequence || !Number.isFinite(p.active_delta_ms) || p.active_delta_ms < 0 || p.active_delta_ms > 60000) throw new ApiError(422,'HEARTBEAT_INVALID');
      const elapsed = Math.max(0,stamp - play.last_heartbeat_at);
      const active = p.document_visible === true && p.paused === false && p.game_updating === true && play.paused === 0;
      const accepted = active ? Math.floor(Math.min(p.active_delta_ms,elapsed,30000)) : 0;
      // Server-clock interval: client occurred_at and supplied interval fields cannot
      // move validated activity to another day. Pauses reset last_heartbeat_at.
      props = { ...p, accepted_active_ms:accepted, active_interval_start_at:stamp-accepted, active_interval_end_at:stamp };
      const total = play.active_ms + accepted;
      db.prepare('UPDATE play_sessions SET active_ms=?,last_heartbeat_at=?,last_sequence=? WHERE id=?').run(total,stamp,p.sequence,play.id);
      for (const threshold of [10,60]) if (total >= threshold*1000) serverEvent(`active_play_${threshold}s`,s,gameId,play.id,{threshold_seconds:threshold,validated_active_ms:total},`milestone:${play.id}:${threshold}`);
    }
    if (event.event_name === 'round_complete' || event.event_name === 'round_start') {
      if (play.ready_at === null || !safeString(p.run_id)) throw new ApiError(422,'ROUND_INVALID');
      if (event.event_name === 'round_complete') {
        if (!['win','loss','abandoned'].includes(p.result)) throw new ApiError(422,'ROUND_INVALID');
        const repeated = db.prepare("SELECT id FROM events WHERE name='round_complete' AND play_session_id=? AND json_extract(properties,'$.run_id')=? LIMIT 1").get(play.id,p.run_id);
        if (repeated) return 'duplicate';
      }
    }
    if (event.event_name === 'runtime_error') {
      props = { code:String(p.code || 'GAME_RUNTIME_ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,64) };
      db.prepare('INSERT INTO errors(id,code,message,game_id,created_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?)').run(uid(),props.code,'게임 실행 오류가 보고되었습니다.',gameId,stamp,s.traffic_type,s.qa_run_id);
    }
    db.prepare('INSERT INTO events(id,fingerprint,name,subject_id,visit_id,play_session_id,game_id,impression_id,occurred_at,received_at,properties,source,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(event.event_id,fingerprint,event.event_name,s.analytics_subject,s.id_hash,play?.id || null,gameId,event.impression_id || null,occurred,stamp,JSON.stringify(props),play ? 'sdk' : 'portal',s.traffic_type,s.qa_run_id);
    return 'accepted';
  }

  async function publicRoute(req,res,url) {
    if (await versionCompat.publicRoute(req,res,url)) return;
    if (await cdn.publicRoute(req,res,url)) return;
    if (await l10n.publicRoute(req,res,url)) return;
    if (await creatorReview.publicRoute(req,res,url)) return;
    const path = url.pathname;
    if(await forge.handle(req,res,url))return;
    if (path === '/api/session' && req.method === 'GET') {
      let s = renewGuestSession(req,res,sessionFor(req,'public'));
      if (!s) { rate(`session:${rateLimitIp(req)}`,120,60000); s = newSession(res,'public'); }
      json(res,200,profile(s)); return;
    }
    if (path === '/api/wishlist' && req.method === 'GET') { json(res,200,wishlist(sessionFor(req,'public'))); return; }
    if (path === '/api/preferences' && req.method === 'GET') {
      const current=sessionFor(req,'public'); const row=current?.principal_id && db.prepare('SELECT locale FROM user_preferences WHERE principal_id=?').get(current.principal_id);
      json(res,200,{locale:row?.locale || null}); return;
    }
    if (path === '/api/games' && req.method === 'GET') { json(res,200,{ games:readCatalog(rootDir,db).filter(g => g.enabled) }); return; }
    const gamePath = path.match(/^\/api\/games\/([a-zA-Z0-9_-]+)$/);
    if (gamePath && req.method === 'GET') { json(res,200,findGame(rootDir,db,gamePath[1])); return; }
    if (path === '/api/auth/google/start' && req.method === 'GET') {
      const s = sessionFor(req,'public') || newSession(res,'public');if(s.traffic_type==='qa')throw new ApiError(403,'QA_GOOGLE_DISABLED');await google.start(req,res,s,url); return;
    }
    if (path === '/api/auth/google/callback' && req.method === 'GET') { const current=requireSession(req,'public');if(current.traffic_type==='qa')throw new ApiError(403,'QA_GOOGLE_DISABLED');await google.callback(req,res,current,url); return; }
    if ((path.endsWith('/community') || path.startsWith('/api/community/')) && await community.publicRoute(req,res,url)) return;
    const s = requireSession(req,'public');
    const wishlistPath=path.match(/^\/api\/wishlist\/([a-zA-Z0-9_-]+)$/);
    if (wishlistPath && req.method === 'PUT') {
      rate(`wishlist:${s.id_hash}`,120,60000);
      const body=await readJson(req,4096); if(Object.keys(body).length)throw new ApiError(422,'WISHLIST_BODY_INVALID');
      const game=findGame(rootDir,db,wishlistPath[1]); const principal=promote(s,req,res);
      transaction(db,()=>{
        const inserted=db.prepare('INSERT OR IGNORE INTO wishlist_items VALUES(?,?,?)').run(principal.principal_id,game.id,now());
        if(inserted.changes)serverEvent('wishlist_add',principal,game.id,null);
      });
      json(res,200,wishlist(principal)); return;
    }
    if (wishlistPath && req.method === 'DELETE') {
      rate(`wishlist:${s.id_hash}`,120,60000);
      const principal=promote(s,req,res);
      transaction(db,()=>{
        const removed=db.prepare('DELETE FROM wishlist_items WHERE principal_id=? AND game_id=?').run(principal.principal_id,wishlistPath[1]);
        if(removed.changes)serverEvent('wishlist_remove',principal,wishlistPath[1],null);
      });
      json(res,200,wishlist(principal)); return;
    }
    if (path === '/api/preferences' && req.method === 'PUT') {
      rate(`preferences:${s.id_hash}`,120,60000);
      const body=await readJson(req,4096); if(Object.keys(body).length!==1 || !supportedLocales.has(body.locale))throw new ApiError(422,'LOCALE_INVALID');
      const principal=promote(s,req,res);
      db.prepare('INSERT INTO user_preferences VALUES(?,?,?) ON CONFLICT(principal_id) DO UPDATE SET locale=excluded.locale,updated_at=excluded.updated_at').run(principal.principal_id,body.locale,now());
      json(res,200,{locale:body.locale}); return;
    }
    if(path==='/api/qa/session' && req.method==='POST'){
      const body=await readJson(req,4096);
      if(Object.keys(body).length)throw new ApiError(422,'QA_BODY_INVALID');
      if(s.principal_id)throw new ApiError(409,'QA_REQUIRES_FRESH_SESSION');
      if(s.traffic_type==='qa'){json(res,200,profile(s));return;}
      rate(`qa:${rateLimitIp(req)}`,60,60000);
      const next=newSession(res,'public',null,null,false,{trafficType:'qa',qaRunId:uid()});revokeSession(s);
      json(res,201,profile(next));return;
    }
    if (path === '/api/play-sessions' && req.method === 'POST') {
      rate(`play:${s.id_hash}`,60,60000);
      const body = await readJson(req,8192), game = findGame(rootDir,db,assertId(body.gameId)), principal = promote(s,req,res), id = uid();
      db.prepare('INSERT INTO play_sessions(id,session_hash,principal_id,subject_id,game_id,build_id,started_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,principal.id_hash,principal.principal_id,principal.analytics_subject,game.id,game.buildId,now(),now()+2*3600000,principal.traffic_type,principal.qa_run_id);
      serverEvent('play_session_created',principal,game.id,id);
      json(res,201,{ id,gameId:game.id,entryUrl:game.entryUrl,kind:profile(principal).kind,saveSchemaVersion:game.saveSchemaVersion,buildId:game.buildId }); return;
    }
    const slotsPath=path.match(/^\/api\/saves\/([a-zA-Z0-9_-]+)\/slots$/);
    if(slotsPath && req.method==='GET'){
      const game=findGame(rootDir,db,slotsPath[1],false);
      if(!s.principal_id)throw new ApiError(401,'PLAY_FIRST');
      const slots=db.prepare('SELECT slot,schema_version,revision,updated_at FROM save_slots WHERE principal_id=? AND game_id=? ORDER BY slot').all(s.principal_id,game.id).map(row=>({slot:row.slot,schemaVersion:row.schema_version,revision:row.revision,updatedAt:new Date(row.updated_at).toISOString(),reason:row.slot==='main'?'main':row.slot.startsWith('guest-')?'merge_guest_copy':'additional_slot'}));
      const backups=recoverableBackups(s.principal_id,game.id).map(row=>({id:row.id,sourceSlot:row.slot,schemaVersion:row.schema_version,revision:row.revision,createdAt:new Date(row.created_at).toISOString(),reason:row.reason,source:row.principal_id===s.principal_id?'account':'guest'}));
      json(res,200,{gameId:game.id,mainRevision:slots.find(row=>row.slot==='main')?.revision || 0,slotLimit:10,slots,backups});return;
    }
    const restorePath=path.match(/^\/api\/saves\/([a-zA-Z0-9_-]+)\/restore$/);
    if(restorePath && req.method==='POST'){
      const game=findGame(rootDir,db,restorePath[1],false);
      if(!s.principal_id)throw new ApiError(401,'PLAY_FIRST');
      rate(`restore:${s.principal_id}`,20,60000);
      const body=await readJson(req,8192),requestKey=req.headers['idempotency-key'];
      if(Object.keys(body).some(key=>!['sourceSlot','backupId','expectedSourceRevision','expectedMainRevision'].includes(key)) || !Number.isSafeInteger(body.expectedMainRevision) || body.expectedMainRevision<0)throw new ApiError(422,'RESTORE_INPUT_INVALID');
      if(Boolean(body.sourceSlot)===Boolean(body.backupId))throw new ApiError(422,'RESTORE_SOURCE_REQUIRED');
      if(body.sourceSlot && (typeof body.sourceSlot!=='string' || !/^[A-Za-z0-9_-]{1,64}$/.test(body.sourceSlot) || body.sourceSlot==='main' || !Number.isSafeInteger(body.expectedSourceRevision) || body.expectedSourceRevision<1))throw new ApiError(422,'RESTORE_SLOT_INVALID');
      if(body.backupId && (!safeString(body.backupId) || body.expectedSourceRevision!==undefined))throw new ApiError(422,'RESTORE_BACKUP_INVALID');
      if(typeof requestKey!=='string' || !/^[A-Za-z0-9:_-]{8,128}$/.test(requestKey))throw new ApiError(400,'IDEMPOTENCY_KEY_REQUIRED');
      const hash=digest(JSON.stringify({sourceSlot:body.sourceSlot || null,backupId:body.backupId || null,expectedSourceRevision:body.expectedSourceRevision || null,expectedMainRevision:body.expectedMainRevision}));
      const value=transaction(db,()=>{
        const previous=db.prepare('SELECT * FROM save_idempotency WHERE principal_id=? AND game_id=? AND slot=? AND request_key=?').get(s.principal_id,game.id,'@restore',requestKey);
        if(previous){if(previous.request_hash!==hash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT');return JSON.parse(previous.response_json);}
        const current=getSave(s,game.id,'main');
        if((current?.revision || 0)!==body.expectedMainRevision)throw new ApiError(412,'SAVE_REVISION_CONFLICT');
        const source=body.sourceSlot?getSave(s,game.id,body.sourceSlot):recoverableBackups(s.principal_id,game.id).find(row=>row.id===body.backupId);
        if(!source)throw new ApiError(404,'RESTORE_SOURCE_NOT_FOUND');
        if(body.sourceSlot && source.revision!==body.expectedSourceRevision)throw new ApiError(412,'SOURCE_REVISION_CONFLICT');
        if(source.schema_version!==game.saveSchemaVersion)throw new ApiError(422,'SAVE_SCHEMA_MISMATCH');
        if(!current && db.prepare('SELECT COUNT(*) count FROM save_slots WHERE principal_id=? AND game_id=?').get(s.principal_id,game.id).count>=10)throw new ApiError(409,'SAVE_SLOT_LIMIT');
        const backupId=current?uid():null,revision=nextSaveRevision(s.principal_id,game.id,'main',current);
        if(current)db.prepare('INSERT INTO save_backups(id,merge_id,principal_id,game_id,slot,schema_version,revision,payload,created_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(backupId,`restore:${requestKey}`,s.principal_id,game.id,'main',current.schema_version,current.revision,current.payload,now(),'restore_previous');
        db.prepare('INSERT INTO save_slots VALUES(?,?,?,?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET schema_version=excluded.schema_version,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(s.principal_id,game.id,'main',source.schema_version,revision,source.payload,now());
        trimRecoveryBackups(s.principal_id,game.id);
        const result={...saveJson(getSave(s,game.id,'main')),restoredFrom:{type:body.sourceSlot?'slot':'backup',id:body.sourceSlot || body.backupId},previousBackupId:backupId};
        db.prepare('INSERT INTO save_idempotency VALUES(?,?,?,?,?,?,?)').run(s.principal_id,game.id,'@restore',requestKey,hash,JSON.stringify(result),now());
        serverEvent('save_write_success',s,game.id,null,{slot:'main',revision,operation:'restore'});audit('save_restored',game.id,{sourceType:result.restoredFrom.type,revision});return result;
      });
      res.setHeader('ETag',`"r${value.revision}"`);json(res,200,value);return;
    }
    const savePath = path.match(/^\/api\/saves\/([a-zA-Z0-9_-]+)$/);
    if (savePath && ['GET','PUT','DELETE'].includes(req.method)) {
      const game = findGame(rootDir,db,savePath[1],false), slot = url.searchParams.get('slot') || 'main';
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(slot)) throw new ApiError(400,'SLOT_INVALID');
      if (!s.principal_id) throw new ApiError(401,'PLAY_FIRST');
      const existing = getSave(s,game.id,slot);
      if (req.method === 'GET') {
        if (!existing) throw new ApiError(404,'SAVE_NOT_FOUND');
        res.setHeader('ETag',`"r${existing.revision}"`); json(res,200,saveJson(existing)); return;
      }
      if(req.method==='DELETE'){
        if(slot==='main')throw new ApiError(403,'MAIN_SLOT_DELETE_FORBIDDEN');
        rate(`restore:${s.principal_id}`,20,60000);
        const match=req.headers['if-match'];
        if(!match)throw new ApiError(428,'SAVE_PRECONDITION_REQUIRED');
        if(req.headers['if-none-match'] || !/^"r\d+"$/.test(match))throw new ApiError(400,'SAVE_PRECONDITION_INVALID');
        const result=transaction(db,()=>{
          const current=getSave(s,game.id,slot);
          if(!current || match!==`"r${current.revision}"`)throw new ApiError(412,'SAVE_REVISION_CONFLICT');
          const backupId=uid();
          db.prepare('INSERT INTO save_backups(id,merge_id,principal_id,game_id,slot,schema_version,revision,payload,created_at,reason) VALUES(?,?,?,?,?,?,?,?,?,?)').run(backupId,`delete:${backupId}`,s.principal_id,game.id,slot,current.schema_version,current.revision,current.payload,now(),'slot_deleted');
          db.prepare('INSERT INTO save_slot_versions VALUES(?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET last_revision=MAX(last_revision,excluded.last_revision)').run(s.principal_id,game.id,slot,current.revision);
          db.prepare('DELETE FROM save_slots WHERE principal_id=? AND game_id=? AND slot=?').run(s.principal_id,game.id,slot);
          db.prepare('DELETE FROM save_idempotency WHERE principal_id=? AND game_id=? AND slot=?').run(s.principal_id,game.id,slot);
          trimRecoveryBackups(s.principal_id,game.id);audit('save_slot_deleted',game.id,{slot,revision:current.revision});
          return {ok:true,deletedSlot:slot,previousBackupId:backupId};
        });
        json(res,200,result);return;
      }
      rate(`save:${s.principal_id}`,120,60000);
      const body = await readJson(req);
      if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) throw new ApiError(422,'SAVE_PAYLOAD_INVALID');
      const payload = JSON.stringify(body.payload);
      if (Buffer.byteLength(payload) > 262144) throw new ApiError(413,'SAVE_TOO_LARGE');
      if (body.schemaVersion !== undefined && body.schemaVersion !== game.saveSchemaVersion) throw new ApiError(422,'SAVE_SCHEMA_MISMATCH');
      const match = req.headers['if-match'], none = req.headers['if-none-match'];
      if (!match && !none) throw new ApiError(428,'SAVE_PRECONDITION_REQUIRED');
      if ((match && none) || (none && none !== '*') || (match && !/^"r\d+"$/.test(match))) throw new ApiError(400,'SAVE_PRECONDITION_INVALID');
      const requestKey = req.headers['idempotency-key'];
      if (requestKey && !/^[A-Za-z0-9:_-]{8,128}$/.test(requestKey)) throw new ApiError(400,'IDEMPOTENCY_KEY_INVALID');
      const hash = digest(JSON.stringify({payload,match,none,schema:game.saveSchemaVersion}));
      const result = transaction(db,() => {
        if (requestKey) {
          const old = db.prepare('SELECT * FROM save_idempotency WHERE principal_id=? AND game_id=? AND slot=? AND request_key=?').get(s.principal_id,game.id,slot,requestKey);
          if (old) { if (old.request_hash !== hash) throw new ApiError(409,'IDEMPOTENCY_CONFLICT'); return JSON.parse(old.response_json); }
        }
        const current = getSave(s,game.id,slot);
        if ((none && current) || (match && (!current || match !== `"r${current.revision}"`))) throw new ApiError(412,'SAVE_REVISION_CONFLICT');
        if (!current && db.prepare('SELECT COUNT(*) AS count FROM save_slots WHERE principal_id=? AND game_id=?').get(s.principal_id,game.id).count >= 10) throw new ApiError(409,'SAVE_SLOT_LIMIT');
        const revision = nextSaveRevision(s.principal_id,game.id,slot,current);
        db.prepare('INSERT INTO save_slots VALUES(?,?,?,?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET schema_version=excluded.schema_version,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(s.principal_id,game.id,slot,game.saveSchemaVersion,revision,payload,now());
        const value = saveJson(getSave(s,game.id,slot));
        if (requestKey) db.prepare('INSERT INTO save_idempotency VALUES(?,?,?,?,?,?,?)').run(s.principal_id,game.id,slot,requestKey,hash,JSON.stringify(value),now());
        serverEvent('save_write_success',s,game.id,null,{slot,revision}); return value;
      });
      res.setHeader('ETag',`"r${result.revision}"`); json(res,existing ? 200 : 201,result); return;
    }
    if (path === '/api/events' && req.method === 'POST') {
      rate(`events:${s.id_hash}`,240,60000);
      const body = await readJson(req,65536);
      if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 50) throw new ApiError(422,'EVENT_BATCH_INVALID');
      const answer = { accepted:[],duplicates:[],rejected:[] };
      for (const event of body.events) {
        try { const outcome = transaction(db,() => processEvent(event,s)); answer[outcome === 'duplicate' ? 'duplicates' : 'accepted'].push(event.event_id); }
        catch(error) { if (!(error instanceof ApiError)) throw error; answer.rejected.push({event_id:typeof event?.event_id === 'string' ? event.event_id.slice(0,128) : null,code:error.code}); }
      }
      json(res,202,answer); return;
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      await readJson(req,4096); revokeSession(s); setCookie(res,PUBLIC_COOKIE,'',config.secureCookies,0); setCookie(res,FORGE_COOKIE,'',config.secureCookies,0,'/forge'); json(res,200,{ok:true}); return;
    }
    if (path === '/api/auth/merge' && req.method === 'POST') {
      const body = await readJson(req,32768);
      const current = requireSession(req,'public');
      if(current.principal_id!==s.principal_id)throw new ApiError(401,'SESSION_REQUIRED');
      const target = s.principal_id && db.prepare('SELECT kind FROM users WHERE id=?').get(s.principal_id);
      if (target?.kind !== 'registered' || body.consent !== true) throw new ApiError(403,'MERGE_CONSENT_REQUIRED');
      const m = safeString(body.mergeId) && db.prepare('SELECT * FROM merge_requests WHERE id=? AND target_user=?').get(body.mergeId,s.principal_id);
      if (!m || m.expires_at <= now()) throw new ApiError(404,'MERGE_NOT_FOUND');
      if (m.status === 'completed') { json(res,200,JSON.parse(m.result_json)); return; }
      const choices = Array.isArray(body.choices) ? body.choices : [];
      const result = transaction(db,() => {
        const source = db.prepare('SELECT * FROM save_slots WHERE principal_id=?').all(m.source_user);
        const prepared = source.map(row => {
          const current = getSave(s,row.game_id,row.slot), conflict = current && (current.payload !== row.payload || current.schema_version !== row.schema_version);
          const choice = choices.find(c => c.gameId === row.game_id && c.slot === row.slot);
          if (conflict && (!choice || !['keep_account','keep_guest','copy_guest'].includes(choice.action) || choice.expectedTargetRevision !== current.revision)) throw new ApiError(409,'MERGE_CONFLICT','진행도 선택이 필요합니다.',{conflicts:pendingMerge(s.principal_id)?.conflicts || []});
          return {row,current,conflict,choice};
        });
        for (const {row,current,conflict,choice} of prepared) {
          if(!current && db.prepare('SELECT COUNT(*) AS count FROM save_slots WHERE principal_id=? AND game_id=?').get(s.principal_id,row.game_id).count>=10)throw new ApiError(409,'SAVE_SLOT_LIMIT');
          if (conflict) for (const original of [row,current]) db.prepare('INSERT INTO save_backups(id,merge_id,principal_id,game_id,slot,schema_version,revision,payload,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(uid(),m.id,original.principal_id,original.game_id,original.slot,original.schema_version,original.revision,original.payload,now());
          if (!current || (conflict && choice.action === 'keep_guest')) db.prepare('INSERT INTO save_slots VALUES(?,?,?,?,?,?,?) ON CONFLICT(principal_id,game_id,slot) DO UPDATE SET schema_version=excluded.schema_version,revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(s.principal_id,row.game_id,row.slot,row.schema_version,nextSaveRevision(s.principal_id,row.game_id,row.slot,current),row.payload,now());
          else if (conflict && choice.action === 'copy_guest') {
            if (db.prepare('SELECT COUNT(*) AS count FROM save_slots WHERE principal_id=? AND game_id=?').get(s.principal_id,row.game_id).count >= 10) throw new ApiError(409,'SAVE_SLOT_LIMIT');
            const slot = `guest-${m.id.slice(0,8)}-${row.slot}`.slice(0,64);
            db.prepare('INSERT INTO save_slots VALUES(?,?,?,?,?,?,?)').run(s.principal_id,row.game_id,slot,row.schema_version,nextSaveRevision(s.principal_id,row.game_id,slot,null),row.payload,now());
          }
        }
        db.prepare('INSERT OR IGNORE INTO wishlist_items(principal_id,game_id,added_at) SELECT ?,game_id,added_at FROM wishlist_items WHERE principal_id=?').run(s.principal_id,m.source_user);
        mergeGuestCommunity(db,m.source_user,s.principal_id);
        const guestPreference=db.prepare('SELECT locale,updated_at FROM user_preferences WHERE principal_id=?').get(m.source_user);
        if(guestPreference)db.prepare('INSERT OR IGNORE INTO user_preferences VALUES(?,?,?)').run(s.principal_id,guestPreference.locale,guestPreference.updated_at);
        if (body.linkAnalyticsHistory === true) db.prepare('INSERT INTO analytics_links VALUES(?,?,?) ON CONFLICT(source_subject) DO UPDATE SET target_subject=excluded.target_subject,created_at=excluded.created_at').run(m.source_subject,m.target_subject,now());
        const value = {ok:true,status:'completed'};
        db.prepare("UPDATE merge_requests SET status='completed',result_json=? WHERE id=?").run(JSON.stringify(value),m.id);
        audit('guest_merge',s.principal_id,{mergeId:m.id,analyticsLinked:body.linkAnalyticsHistory === true}); return value;
      });
      json(res,200,result); return;
    }
    throw new ApiError(404,'NOT_FOUND');
  }

  async function adminRoute(req,res,url) {
    const path = url.pathname;
    if (path === '/api/admin/session' && req.method === 'GET') {
      const s = sessionFor(req,'admin') || newSession(res,'admin');
      json(res,200,{authenticated:Boolean(s.admin_authenticated),csrfToken:s.csrf,username:s.admin_username || null,localAutoLogin:Boolean(localAdminLogin)}); return;
    }
    if (path === '/api/admin/login' && req.method === 'POST') {
      const old = requireSession(req,'admin');
      if (!config.admin?.passwordHash || !config.admin?.username) throw new ApiError(503,'ADMIN_NOT_CONFIGURED');
      rate(`adminlogin:${req.socket.remoteAddress}`,8,60000);
      const body = await readJson(req,8192), valid = await checkPassword(body.password,config.admin);
      if (!valid || !equal(body.username,config.admin.username)) { audit('admin_login_failed',null); throw new ApiError(401,'ADMIN_CREDENTIALS_INVALID'); }
      revokeSession(old); const s = newSession(res,'admin',null,null,true);
      audit('admin_login',config.admin.username); json(res,200,{authenticated:true,csrfToken:s.csrf,username:config.admin.username}); return;
    }
    if ((path === '/api/admin/local-login' || path === '/api/admin/local-auto-login') && req.method === 'POST') {
      if (!localAdminLogin || config.admin?.passwordHash || url.search || url.hash) throw new ApiError(404,'NOT_FOUND');
      localAdminLogin.requireDirectRequest(req,adminServer.address()?.port);
      const old = requireSession(req,'admin');
      rate(`localadminlogin:${req.socket.remoteAddress}`,8,60000);
      const { token } = await readJson(req,4096);
      if (requireSession(req,'admin').id_hash !== old.id_hash) throw new ApiError(401,'SESSION_REQUIRED');
      localAdminLogin.consume(token);
      const auditAction = path === '/api/admin/local-auto-login' ? 'admin_local_auto_login' : 'admin_local_login';
      const previousCookies = res.getHeader('Set-Cookie');
      let s;
      try {
        s = transaction(db,()=>{
          revokeSession(old);
          const next = newSession(res,'admin',null,null,true);
          audit(auditAction,next.admin_username);
          return next;
        });
      } catch (error) {
        if (previousCookies === undefined) res.removeHeader('Set-Cookie');
        else res.setHeader('Set-Cookie',previousCookies);
        throw error;
      }
      json(res,200,{authenticated:true,csrfToken:s.csrf,username:s.admin_username,localAutoLogin:true}); return;
    }
    const s = requireSession(req,'admin',true);
    if (await versionCompat.adminRoute(req,res,url,s)) return;
    if (await cdn.adminRoute(req,res,url,s)) return;
    if (await l10n.adminRoute(req,res,url,s)) return;
    if (await adminConsole.adminRoute(req,res,url,s)) return;
    if (await creatorReview.adminRoute(req,res,url)) return;
    if ((path === '/api/admin/community' || path.startsWith('/api/admin/community/')) && await community.adminRoute(req,res,url)) return;
    if (path === '/api/admin/logout' && req.method === 'POST') { await readJson(req,4096); revokeSession(s); setCookie(res,ADMIN_COOKIE,'',config.secureCookies,0); audit('admin_logout',s.admin_username); json(res,200,{ok:true}); return; }
    if (path === '/api/admin/metrics' && req.method === 'GET') {
      const filters=metricsOptions(url),games=readCatalog(rootDir,db);
      const result=filters.dataset==='demo'?demoMetrics(games):liveMetrics(db,games,now(),filters);
      if(filters.dataset==='demo'){result.filters={from:null,to:null,gameId:null,qaRunId:null};result.retentionScope='platform';result.retention.selected=result.retention.platform;}
      json(res,200,result);return;
    }
    if (path === '/api/admin/games' && req.method === 'GET') { json(res,200,{games:readCatalog(rootDir,db)}); return; }
    const game = path.match(/^\/api\/admin\/games\/([a-zA-Z0-9_-]+)$/);
    if (game && req.method === 'PATCH') {
      findGame(rootDir,db,game[1],false); const body = await readJson(req,4096);
      if (typeof body.enabled !== 'boolean') throw new ApiError(422,'ENABLED_REQUIRED');
      db.prepare('INSERT INTO game_overrides VALUES(?,?,?) ON CONFLICT(game_id) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at').run(game[1],body.enabled ? 1 : 0,now());
      audit('game_enabled',game[1],{enabled:body.enabled,admin:s.admin_username}); json(res,200,{game:findGame(rootDir,db,game[1],false)}); return;
    }
    if (path === '/api/admin/errors' && req.method === 'GET') {
      const filters=metricsOptions(url);
      const rows=filters.dataset==='demo'?[]:db.prepare('SELECT id,code,message,game_id AS gameId,created_at AS createdAt,traffic_type AS trafficType,qa_run_id AS qaRunId FROM errors WHERE traffic_type=? AND (? IS NULL OR qa_run_id=?) AND (? IS NULL OR game_id=?) AND created_at>=? AND created_at<? ORDER BY created_at DESC LIMIT 100').all(filters.dataset,filters.qaRunId,filters.qaRunId,filters.gameId,filters.gameId,filters.from?Date.parse(filters.from+'T00:00:00+09:00'):0,filters.to?Date.parse(filters.to+'T00:00:00+09:00')+DAY:Number.MAX_SAFE_INTEGER);
      json(res,200,{errors:rows.map(r=>({...r,createdAt:new Date(r.createdAt).toISOString()})),filters});return;
    }
    throw new ApiError(404,'NOT_FOUND');
  }
  function matchesInternalSecret(provided) {
    if (!internalForgeSecret) return true;
    const currentMatch = equal(provided, internalForgeSecret);
    const previousMatch = Boolean(previousInternalForgeSecret) && equal(provided, previousInternalForgeSecret);
    return currentMatch || previousMatch;
  }
  async function verifyInternalSession(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (req.method !== 'POST') { json(res, 405, { authenticated: false, error: 'METHOD_NOT_ALLOWED' }); return; }
    const remote = req.socket?.remoteAddress || '';
    if (!remoteForgeVerify && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) { json(res, 403, { authenticated: false, error: 'LOOPBACK_REQUIRED' }); return; }
    if (req.headers.origin !== undefined) { json(res, 403, { authenticated: false, error: 'ORIGIN_NOT_ALLOWED' }); return; }
    if (!matchesInternalSecret(req.headers['x-playhub-internal-secret'])) {
      if (remoteForgeVerify) rate(`forgeverify-denied:${remote}`, 60, 60000);
      json(res, 403, { authenticated: false, error: 'INTERNAL_SECRET_INVALID' });
      return;
    }
    const body = await readJson(req, 8192);
    const rawCookie = typeof body.cookie === 'string' && body.cookie.length <= 8192 ? body.cookie : '';
    const parsed = cookies({ headers: { cookie: rawCookie } });
    const token = parsed[FORGE_COOKIE] || parsed[PUBLIC_COOKIE];
    if (!token) {
      if (remoteForgeVerify) rate(`forgeverify-anon:${remote}`, 300, 60000);
      json(res, 401, { authenticated: false, error: 'SESSION_REQUIRED' });
      return;
    }
    const tokenHash = digest(token);
    if (remoteForgeVerify) rate(`forgeverify:${tokenHash}`, 1200, 60000);
    const s = db.prepare("SELECT * FROM sessions WHERE id_hash=? AND kind='public'").get(tokenHash);
    if (!s || s.expires_at <= now()) { json(res, 401, { authenticated: false, error: 'SESSION_REQUIRED' }); return; }
    let identity;
    try { identity = googleIdentityForSession(db, s); }
    catch { json(res, 401, { authenticated: false, error: 'GOOGLE_LOGIN_REQUIRED' }); return; }
    const method = typeof body.method === 'string' ? body.method.toUpperCase() : 'GET';
    const requireCsrf = typeof body.requireCsrf === 'boolean'
      ? body.requireCsrf
      : (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || body.csrfToken !== undefined);
    if (requireCsrf && !equal(body.csrfToken, s.csrf)) { json(res, 403, { authenticated: false, error: 'CSRF_INVALID' }); return; }
    const user = db.prepare('SELECT display_name FROM users WHERE id=?').get(s.principal_id);
    json(res, 200, {
      authenticated: true,
      userId: s.principal_id,
      displayName: user?.display_name || null,
      accountKey: forgeAccountKey(identity),
      identity,
      csrfToken: s.csrf,
      expiresAt: s.expires_at,
    });
  }
  function handler(kind) {
    return async (req,res) => {
      const requestId = uid(); res.setHeader('X-Request-Id',requestId);
      try {
        const url = new URL(req.url,'http://internal.invalid');
        if ((kind === 'admin' || remoteForgeVerify) && url.pathname === '/internal/session/verify') {
          await verifyInternalSession(req, res);
          return;
        }
        if ((kind === 'public' && (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/internal/'))) || (kind === 'admin' && !url.pathname.startsWith('/api/admin') && url.pathname !== '/api/health' && url.pathname !== '/api/version')) throw new ApiError(404,'NOT_FOUND');
        const isMutation = ['POST','PUT','PATCH','DELETE'].includes(req.method) && !(kind === 'public' && url.pathname === '/api/compat/check');
        if (cors(req,res,kind === 'public' ? config.userOrigins : config.adminOrigins,isMutation)) return;
        if (url.pathname === '/api/health' && req.method === 'GET') { json(res,200,{ok:true,service:kind,version:versionCompat.buildInfo.semver,buildId:versionCompat.buildInfo.buildId,buildCode:versionCompat.buildInfo.buildCode}); return; }
        if (url.pathname === '/api/version' && req.method === 'GET') { versionCompat.handleVersion(res); return; }
        await (kind === 'public' ? publicRoute : adminRoute)(req,res,url);
      } catch(error) {
        const known = error instanceof ApiError;
        if (!known) { try { const context=sessionFor(req,kind);db.prepare('INSERT INTO errors(id,code,message,game_id,created_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?)').run(uid(),'SERVER_ERROR','서버 요청 처리에 실패했습니다.',null,now(),context?.traffic_type || 'live',context?.qa_run_id || null); } catch {} }
        if (!res.headersSent) json(res,known ? error.status : 500,{error:{code:known ? error.code : 'SERVER_ERROR',message:known ? error.message : '요청 처리에 실패했습니다.',...(known && error.extra ? error.extra : {})},requestId});
        else res.end();
      }
    };
  }
  const publicHandler = handler('public'), adminHandler = handler('admin');
  const publicServer = http.createServer(publicHandler), adminServer = http.createServer(adminHandler);
  for (const server of [publicServer,adminServer]) { server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=5000; }
  let closed = false;
  return { db,cdn,publicHandler,adminHandler,publicServer,adminServer,
    issueLocalAdminLoginUrl() {
      return !closed && adminServer.listening && localAdminLogin ? localAdminLogin.issue() : null;
    },
    async listen() {
      const start = (server,port,host) => new Promise((resolve,reject) => { server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve(server.address());}); });
      try { const pub = await start(publicServer,config.publicPort,config.publicHost); const admin = await start(adminServer,config.adminPort,config.adminHost); return {public:pub,admin}; }
      catch(error) { if(publicServer.listening) publicServer.close();throw error; }
    },
    async close() {
      if (closed) return; closed=true;
      localAdminLogin?.clear();
      await Promise.all([publicServer,adminServer].map(server => new Promise(resolve => { if (!server.listening) return resolve();server.close(resolve);server.closeAllConnections(); })));
      forge.close(); forgeGateway.close();
      await cdn.close();
      db.close();
    }
  };
}
