import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {TOOL_VERSION,assertNoLinks,regularFile,readConfig,hashFile,writeJsonAtomic} from './backup.mjs';

const PRODUCT='playhub-iis-poc', DB_NAME='platform.sqlite';
const FILE_NAMES=[DB_NAME,DB_NAME+'-wal',DB_NAME+'-shm',DB_NAME+'-journal'];
const BASE_COLUMNS={
  users:['id','kind','display_name','created_at'],
  identities:['provider','subject','user_id'],
  sessions:['id_hash','kind','principal_id','analytics_subject','csrf','admin_authenticated','admin_username','created_at','expires_at'],
  play_sessions:['id','session_hash','principal_id','subject_id','game_id','build_id','started_at','ready_at','last_heartbeat_at','last_sequence','active_ms','paused','ended_at','expires_at'],
  save_slots:['principal_id','game_id','slot','schema_version','revision','payload','updated_at'],
  save_idempotency:['principal_id','game_id','slot','request_key','request_hash','response_json','created_at'],
  oauth_states:['state_hash','session_hash','guest_id','source_subject','nonce','verifier','return_to','expires_at','used_at'],
  merge_requests:['id','source_user','target_user','source_subject','target_subject','status','expires_at','result_json'],
  save_backups:['id','merge_id','principal_id','game_id','slot','schema_version','revision','payload','created_at'],
  analytics_links:['source_subject','target_subject','created_at'],
  events:['id','fingerprint','name','subject_id','visit_id','play_session_id','game_id','impression_id','occurred_at','received_at','properties','source'],
  game_overrides:['game_id','enabled','updated_at'],
  errors:['id','code','message','game_id','created_at'],
  audit:['id','action','target','detail','created_at']
};
const VERSION_ONE_TABLES={save_slot_versions:['principal_id','game_id','slot','last_revision']};
// Additive schema-one features: old snapshots legitimately predate these tables.
const OPTIONAL_TABLES={
  wishlist_items:['principal_id','game_id','added_at'],
  user_preferences:['principal_id','locale','updated_at'],
  community_items:['id','game_id','author_id','kind','title','body','status','hidden','created_at','updated_at'],
  community_votes:['item_id','principal_id','created_at'],
  community_reports:['item_id','principal_id','reason','created_at'],
  creator_submissions:['id','owner_key','owner_id','project_id','release_id','release_revision','release_label','title','description','status','revision','review_note','created_at','updated_at','submitted_at','decided_at'],
  qa_runs:['id','submission_id','target_type','target_id','release_revision','policy_version','qa_status','score','report_path','summary_json','started_at','finished_at'],
  submission_checklists:['submission_id','submission_revision','checklist_version','items_json','updated_by','updated_at'],
  l10n_keys:['key','namespace','source_text','source_hash','context_id','description','max_chars','placeholders_json','code_refs_json','unused_since','revision','updated_at'],
  l10n_translations:['key','locale','value','status','ai_provider','ai_model','lint_json','updated_by','updated_at'],
  l10n_glossary:['id','term_ko','term_en','is_dnt','context_tags_json','translations_json','forbidden_json','notes','updated_at'],
  l10n_prompts:['id','name','context_id','system_prompt','rules_json','disambiguation_json','updated_at'],
  l10n_media_slots:['slot_key','description','alt_text_key','width','height','max_bytes','allowed_formats_json','updated_at'],
  l10n_media_assets:['slot_key','locale','filename','mime_type','bytes','sha256','updated_by','updated_at'],
  l10n_releases:['version','tag','sha256','key_count','media_count','coverage_json','bundle_json','notes','is_active','created_by','created_at'],
  hub_publications:['game_id','host_slug','owner_key','owner_id','project_id','active_release_id','active_submission_id','visibility','deploy_mode','status','artifact_sha256','artifact_base_url','manifest_json','deploy_profile_json','cas_version','published_at','updated_at'],
  hub_publication_history:['id','game_id','from_release_id','to_release_id','action','actor_id','reason','cas_version','created_at'],
  hub_publish_idempotency:['idempotency_key','scope','request_hash','response_json','created_at'],
  leaderboard_boards:['game_id','board_key','sort_order','score_mode','reset_period','max_score_bound','min_play_ms','guest_visible','enabled','created_at','updated_at'],
  leaderboard_entries:['game_id','board_key','period_key','principal_id','score','sort_score','tie_breaker_ms','metadata_json','submission_count','source','traffic_type','qa_run_id','excluded','exclude_reason','achieved_at','updated_at'],
  leaderboard_submissions:['id','game_id','board_key','period_key','principal_id','play_session_id','request_key','request_hash','raw_score','accepted','reject_reason','response_json','source','traffic_type','qa_run_id','created_at'],
  user_sanctions:['id','principal_id','scope','action','reason','evidence_json','active','expires_at','created_by','created_at','revoked_at','revoked_by','eos_target_puid','eos_sync_status','eos_synced_at']
};
class RestoreError extends Error{constructor(code,message){super(message);this.code=code;}}
const requireState=(condition,code,message)=>{if(!condition)throw new RestoreError(code,message);};
const noDataInError=error=>error instanceof RestoreError?error.message:({EACCES:'File access was denied.',EPERM:'File operation was not permitted.',ENOENT:'A required file is missing.',EBUSY:'A required file is in use.',EEXIST:'An exclusive operation path already exists.'}[error.code]||'The operation failed; original data was preserved or recovery is required. Inspect the operation status before restarting.');
const check=(report,id,status,message,details)=>report.checks.push({id,title:id.replace(/^RESTORE-/,'').replaceAll('-',' '),status,message,...(details?{details}:{})});
const isCorruption=error=>[11,26].includes(error.errcode)||['SQLITE_CORRUPT','SQLITE_NOTADB'].includes(error.code);
const inside=(root,filename)=>{const relative=path.relative(root,filename);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;

function readJsonBounded(filename,max=1024*1024){
  const stat=regularFile(filename);
  requireState(stat.size>0&&stat.size<=max,'RESTORE-JSON','JSON record size is invalid.');
  try{return JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));}catch{throw new RestoreError('RESTORE-JSON','A required JSON record could not be parsed.');}
}
function openChecked(filename,{write=false}={}){
  regularFile(filename,'SQLite file');
  const header=Buffer.alloc(16),fd=fs.openSync(filename,'r');try{fs.readSync(fd,header,0,16,0);}finally{fs.closeSync(fd);}
  requireState(header.equals(Buffer.from('SQLite format 3\0')),'RESTORE-SQLITE-HEADER','The file is not a SQLite database.');
  const db=new DatabaseSync(filename,{readOnly:!write,timeout:200});
  try{
    db.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON');
    requireState(Object.values(db.prepare('PRAGMA integrity_check(1)').get())[0]==='ok','RESTORE-INTEGRITY','SQLite integrity verification failed.');
    requireState(!db.prepare('PRAGMA foreign_key_check').get(),'RESTORE-FOREIGN-KEYS','SQLite foreign-key verification failed.');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    requireState(Number.isInteger(version)&&version>=0&&version<=1,'RESTORE-SCHEMA-VERSION','The database version is newer than this restoration tool supports.');
    const objects=db.prepare("SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all();
    requireState(!objects.some(o=>o.type==='trigger'||o.type==='view'||/\bCREATE\s+VIRTUAL\s+TABLE\b/i.test(o.sql||'')),'RESTORE-SCHEMA-OBJECTS','Views, triggers, and virtual tables are not accepted in a platform backup.');
    const tables=new Set(objects.filter(o=>o.type==='table').map(o=>o.name));
    const requiredTables={...BASE_COLUMNS,...(version===1?VERSION_ONE_TABLES:{})};
    for(const [table,columns] of Object.entries(OPTIONAL_TABLES))if(tables.has(table))requiredTables[table]=columns;
    requireState(tables.size===Object.keys(requiredTables).length&&Object.keys(requiredTables).every(t=>tables.has(t)),'RESTORE-SCHEMA-TABLES','The backup does not contain the expected platform tables.');
    const columns={};
    for(const [table,required] of Object.entries(requiredTables)){
      columns[table]=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));
      const expected=[...required];if(version===1&&['sessions','play_sessions','events','errors'].includes(table))expected.push('traffic_type','qa_run_id');if(version===1&&table==='save_backups')expected.push('reason');
      requireState(expected.every(c=>columns[table].has(c)),'RESTORE-SCHEMA-COLUMNS','A required platform database column is missing.');
    }
    return {db,version,columns};
  }catch(error){db.close();throw error;}
}
export function inspectDatabase(filename){
  const {db,version,columns}=openChecked(filename);
  try{return {databaseUserVersion:version,integrity:'ok',foreignKeys:'ok',tables:Object.keys(columns).length,users:db.prepare('SELECT count(*) n FROM users').get().n,saves:db.prepare('SELECT count(*) n FROM save_slots').get().n};}
  finally{db.close();}
}
function nonEmptySidecars(filename){
  for(const suffix of ['-wal','-journal'])if(fs.existsSync(filename+suffix)){
    const stat=regularFile(filename+suffix,'Backup sidecar');
    requireState(stat.size===0,'RESTORE-BACKUP-SIDECAR','The backup has a nonempty journal or WAL. Use the standalone snapshot produced by backup.mjs.');
  }
}
async function copyPrivate(source,target){
  assertNoLinks(target);fs.copyFileSync(source,target,fs.constants.COPYFILE_EXCL);
  if(process.platform!=='win32')fs.chmodSync(target,0o600);
  const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
async function verifyBackup(from){
  const source=assertNoLinks(from),stat=regularFile(source,'Backup');nonEmptySidecars(source);
  const metadata=readJsonBounded(source+'.json',65536);
  requireState(metadata?.ok===true&&metadata.integrity==='ok'&&/^[a-f0-9]{64}$/i.test(metadata.sha256||'')&&Number.isSafeInteger(metadata.bytes)&&metadata.bytes===stat.size,'RESTORE-BACKUP-METADATA','Backup metadata is missing required fields or the byte length differs.');
  const sha256=await hashFile(source);
  requireState(sha256===metadata.sha256.toLowerCase(),'RESTORE-BACKUP-HASH','The SHA-256 checksum differs from the backup metadata. No data was replaced.');
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-restore-verify-'));if(process.platform!=='win32')fs.chmodSync(temporary,0o700);
  try{
    const staged=path.join(temporary,DB_NAME);await copyPrivate(source,staged);
    requireState(await hashFile(staged)===sha256,'RESTORE-BACKUP-CHANGED','The backup changed during validation.');
    return {source,sha256,bytes:stat.size,...inspectDatabase(staged),createdAt:metadata.createdAt||null,metadataFormat:metadata.schemaVersion===1?'v1':'legacy'};
  }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
function portOpen(port,host){
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection({port,host});let settled=false;
    const finish=(error,open)=>{if(settled)return;settled=true;socket.destroy();error?reject(error):resolve(open);};
    socket.setTimeout(500,()=>finish(new RestoreError('RESTORE-PORT-CHECK','A local listener check timed out; restoration was refused.')));
    socket.once('connect',()=>finish(null,true));
    socket.once('error',error=>error.code==='ECONNREFUSED'?finish(null,false):finish(new RestoreError('RESTORE-PORT-CHECK','A local listener check failed; restoration was refused.')));
  });
}
async function requireStopped(config){
  for(const key of ['publicPort','adminPort']){
    const port=config[key];requireState(Number.isInteger(port)&&port>0&&port<=65535,'RESTORE-PORT-CONFIG','Restoration requires the configured nonzero API ports.');
    const host=key==='adminPort'?config.adminHost:config.publicHost;
    requireState(['127.0.0.1','localhost','::1','0.0.0.0','::',undefined].includes(host),'RESTORE-HOST-CONFIG','This tool supports the local PoC API binding profile only.');
    requireState(!await portOpen(port,host==='::1'||host==='::'?'::1':'127.0.0.1'),'RESTORE-SERVICE-RUNNING','An API port is still accepting connections. Stop the API service before restoring data.');
  }
}
function updateLock(lock,state){
  requireState(fs.existsSync(lock.path)&&readJsonBounded(lock.path,65536).nonce===lock.nonce,'RESTORE-LOCK-OWNER','The maintenance lock changed; recovery requires operator review.');
  writeJsonAtomic(lock.path,{product:PRODUCT,operation:'restore-data',schemaVersion:1,pid:process.pid,nonce:lock.nonce,startedAt:lock.startedAt,recoveryDirectory:lock.directory,phase:state.phase});
}
function removeOwnedLock(lock){
  if(!lock||!fs.existsSync(lock.path))return;
  requireState(readJsonBounded(lock.path,65536).nonce===lock.nonce,'RESTORE-LOCK-OWNER','The maintenance lock changed; it was not removed.');
  fs.unlinkSync(lock.path);
}
function stateWrite(lock,state){writeJsonAtomic(path.join(lock.directory,'recovery.json'),state);updateLock(lock,state);}

/** Snapshot only current, unexpired, unlinked live guest sessions. Never use backup sessions. */
function currentGuests(db,columns,now){
  const traffic=columns.sessions.has('traffic_type')?" AND s.traffic_type='live'":'';
  const rows=db.prepare(`SELECT s.* FROM sessions s JOIN users u ON u.id=s.principal_id WHERE s.kind='public' AND s.admin_authenticated=0 AND s.admin_username IS NULL AND s.expires_at>? AND u.kind='guest' AND NOT EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id)${traffic} LIMIT 100001`).all(now);
  requireState(rows.length<=100000,'RESTORE-GUEST-LIMIT','The live guest session count exceeds this PoC restoration limit.');
  return rows;
}
async function snapshotCurrent(dataDir,directory,now,report){
  const filename=path.join(dataDir,DB_NAME),snapshot=path.join(directory,'original');fs.mkdirSync(snapshot,{mode:0o700});
  let handle,guests=[],healthy=false;
  if(fs.existsSync(filename)){
    try{
      handle=openChecked(filename,{write:true});
      // This also checkpoints WAL and refuses another reader/writer before files move.
      const journal=handle.db.prepare('PRAGMA journal_mode=DELETE').get();
      requireState(Object.values(journal)[0]==='delete','RESTORE-DATABASE-BUSY','The current database could not leave WAL mode. Stop every process using it.');
      handle.db.exec('PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE');
      guests=currentGuests(handle.db,handle.columns,now);healthy=true;
    }catch(error){
      if(handle){try{handle.db.close();}catch{}handle=undefined;}
      if(isCorruption(error)||error.code==='RESTORE-SQLITE-HEADER'||error.code==='RESTORE-INTEGRITY'){
        check(report,'RESTORE-CURRENT-DAMAGED','warning','The current database is damaged. Its raw files will be retained; current guest sessions cannot be preserved.');
      }else throw error;
    }
  }
  const files=[];
  try{
    for(const name of FILE_NAMES)if(fs.existsSync(path.join(dataDir,name))){
      regularFile(path.join(dataDir,name),'Current database component');
      const target=path.join(snapshot,name);await copyPrivate(path.join(dataDir,name),target);
      files.push({name,bytes:fs.statSync(target).size,sha256:await hashFile(target)});
    }
  }finally{if(handle){try{handle.db.exec('ROLLBACK');}finally{handle.db.close();}}}
  return {original:{exists:files.some(f=>f.name===DB_NAME),healthy,files},guests};
}
function prepareCandidate(filename,guests,now,sourceSha256){
  const {db,columns}=openChecked(filename,{write:true});
  const result={currentEligible:guests.length,preserved:0,missingOrLinkedInBackup:0,revokedBackupSessions:0};
  try{
    db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; BEGIN IMMEDIATE');
    result.revokedBackupSessions=db.prepare('SELECT count(*) n FROM sessions').get().n;
    db.exec("DELETE FROM sessions; DELETE FROM oauth_states; DELETE FROM save_idempotency; DELETE FROM merge_requests WHERE status!='completed'");
    db.prepare('UPDATE play_sessions SET ended_at=COALESCE(ended_at,?),paused=1').run(now);
    const names=[...BASE_COLUMNS.sessions];if(columns.sessions.has('traffic_type'))names.push('traffic_type');if(columns.sessions.has('qa_run_id'))names.push('qa_run_id');
    const insert=db.prepare(`INSERT INTO sessions(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`);
    const eligible=db.prepare("SELECT 1 FROM users u WHERE u.id=? AND u.kind='guest' AND NOT EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id)");
    for(const session of guests){
      if(!eligible.get(session.principal_id)){result.missingOrLinkedInBackup++;continue;}
      insert.run(...names.map(name=>name==='traffic_type'?'live':name==='qa_run_id'?null:session[name]));result.preserved++;
    }
    db.prepare('INSERT INTO audit(id,action,target,detail,created_at) VALUES(?,?,?,?,?)').run(randomUUID(),'data_restore',null,JSON.stringify({sourceSha256,toolVersion:TOOL_VERSION,guestSessions:result,revokedGoogleAndAdminSessions:true}),now);
    db.exec('COMMIT; VACUUM');
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{db.close();}
  inspectDatabase(filename);return result;
}
async function verifyPreimage(directory,state){
  requireState(state.original&&typeof state.original.exists==='boolean'&&Array.isArray(state.original.files),'RESTORE-RECOVERY-RECORD','The recovery record is incomplete.');
  const seen=new Set();
  for(const file of state.original.files){
    requireState(FILE_NAMES.includes(file.name)&&!seen.has(file.name)&&/^[a-f0-9]{64}$/.test(file.sha256||''),'RESTORE-RECOVERY-RECORD','The recovery file inventory is invalid.');seen.add(file.name);
    const original=path.join(directory,'original',file.name);const stat=regularFile(original);
    requireState(stat.size===file.bytes&&await hashFile(original)===file.sha256,'RESTORE-RECOVERY-HASH','An original snapshot component is missing or changed. Nothing else was replaced.');
  }
  requireState(seen.has(DB_NAME)===state.original.exists,'RESTORE-RECOVERY-RECORD','The original database inventory is inconsistent.');
}
async function rollbackPreimage(dataDir,lock,state){
  await verifyPreimage(lock.directory,state);
  const retained=path.join(lock.directory,'failed-'+randomUUID());fs.mkdirSync(retained,{mode:0o700});
  // Copies are prepared first. A partial recovery still has the immutable preimage.
  const replacement=path.join(lock.directory,'rollback-'+randomUUID());fs.mkdirSync(replacement,{mode:0o700});
  for(const file of state.original.files)await copyPrivate(path.join(lock.directory,'original',file.name),path.join(replacement,file.name));
  for(const name of FILE_NAMES)if(fs.existsSync(path.join(dataDir,name))){regularFile(path.join(dataDir,name));fs.renameSync(path.join(dataDir,name),path.join(retained,name));}
  for(const file of state.original.files)fs.renameSync(path.join(replacement,file.name),path.join(dataDir,file.name));
  if(state.original.healthy)inspectDatabase(path.join(dataDir,DB_NAME));
  state.phase='rolled-back';state.completedAt=new Date().toISOString();stateWrite(lock,state);removeOwnedLock(lock);
  return {originalHealthy:state.original.healthy,retained};
}
function processExists(pid){try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
async function recoverInterrupted(config,report){
  const lockPath=path.join(config.dataDir,'maintenance.lock');const record=readJsonBounded(lockPath,65536);
  requireState(record?.product===PRODUCT&&record.operation==='restore-data'&&record.schemaVersion===1&&/^[a-f0-9-]{36}$/.test(record.nonce||''),'RESTORE-LOCK-FORMAT','The maintenance lock is not a recognized data restoration record.');
  requireState(Number.isInteger(record.pid)&&record.pid>0&&!processExists(record.pid),'RESTORE-LOCK-ACTIVE','The recorded restoration process still exists or cannot be checked. Do not recover an active operation.');
  const directory=assertNoLinks(record.recoveryDirectory||'');
  requireState(inside(path.join(config.dataDir,'recovery'),directory)&&path.dirname(directory)===path.join(config.dataDir,'recovery'),'RESTORE-RECOVERY-PATH','The recovery directory is outside this installation.');
  const lock={path:lockPath,nonce:record.nonce,startedAt:record.startedAt,directory};report.recoveryDirectory=directory;
  const statePath=path.join(directory,'recovery.json');
  if(!fs.existsSync(statePath)){
    requireState(record.phase==='preparing','RESTORE-RECOVERY-RECORD','The recovery record is missing after a possible data change.');
    removeOwnedLock(lock);report.serviceRestartAllowed=true;report.recoveryAction='lock-cleared-before-swap';
  }else{
    const state=readJsonBounded(statePath);
    requireState(state.product===PRODUCT&&state.operationId===record.nonce&&state.dataDir===config.dataDir&&state.schemaVersion===1,'RESTORE-RECOVERY-RECORD','The recovery record does not match this installation.');
    if(state.phase==='preparing'||state.phase==='snapshot-complete'||state.phase==='candidate-ready'){
      removeOwnedLock(lock);report.serviceRestartAllowed=true;report.recoveryAction='lock-cleared-before-swap';
    }else{
      requireState(['swapping','applied','rolled-back','rollback-required'].includes(state.phase),'RESTORE-RECOVERY-PHASE','Unknown restoration phase; manual review is required.');
      const result=await rollbackPreimage(config.dataDir,lock,state);report.serviceRestartAllowed=!state.original.exists||result.originalHealthy;report.recoveryAction='original-restored';
    }
  }
  check(report,'RESTORE-INTERRUPTED','pass','The interrupted operation was safely recovered. Retained data was not deleted.');
  report.applied=true;
}

export async function restoreData({configPath='config/local.json',from,apply=false,rollbackInterrupted=false,reportPath,hooks={}}={}){
  const report={schemaVersion:1,tool:'restore-data',appVersion:TOOL_VERSION,mode:rollbackInterrupted?'rollback-interrupted':apply?'apply':'verify',startedAt:new Date().toISOString(),ok:false,applied:false,serviceRestartAllowed:false,environment:{platform:process.platform,node:process.version,windowsIisExecution:false},checks:[]};
  let config,lock,state,swapStarted=false,reportAllowed=false;
  try{
    config=readConfig(configPath);config.dataDir=path.resolve(config.dataDir);
    requireState(!rollbackInterrupted||apply,'RESTORE-APPLY-REQUIRED','Interrupted recovery requires --apply.');
    requireState(rollbackInterrupted?!from:typeof from==='string'&&from.length>0,'RESTORE-SOURCE-REQUIRED','Choose --from <backup.sqlite>, or --rollback-interrupted without --from.');
    if(reportPath){
      const reportFile=assertNoLinks(reportPath);
      requireState(/\.json$/i.test(reportFile),'RESTORE-REPORT-PATH','Use a .json report path.');
      const protectedFiles=[path.resolve(configPath),...(from?[path.resolve(from),path.resolve(from)+'.json']:[])];
      for(const filename of [reportFile,reportFile.replace(/\.json$/i,'')+'.html']){
        assertNoLinks(filename);
        requireState(!inside(config.dataDir,filename)&&!samePath(filename,config.dataDir)&&!protectedFiles.some(p=>samePath(filename,p)),'RESTORE-REPORT-PATH','The report must be outside the data directory and must not replace configuration or backup files.');
      }
      reportAllowed=true;
    }
    check(report,'RESTORE-CONFIG','pass','Private configuration and operation paths were validated.');
    if(rollbackInterrupted){await requireStopped(config);await recoverInterrupted(config,report);}
    else{
      const backup=await verifyBackup(from);report.backup=backup;
      requireState(backup.source!==path.join(config.dataDir,DB_NAME)&&!inside(config.dataDir,backup.source),'RESTORE-SOURCE-PATH','Choose a backup outside the live data directory.');
      check(report,'RESTORE-BACKUP','pass','Backup SHA-256, SQLite integrity, foreign keys, and supported platform schema passed.',{bytes:backup.bytes,databaseUserVersion:backup.databaseUserVersion,metadataFormat:backup.metadataFormat});
      if(!apply){check(report,'RESTORE-DRY-RUN','pass','Verification only. The service and its database were not changed.');}
      else{
        await requireStopped(config);check(report,'RESTORE-SERVICE-STOPPED','pass','Both configured API listener ports were closed.');
        fs.mkdirSync(config.dataDir,{recursive:true,mode:0o700});assertNoLinks(config.dataDir);
        const lockPath=path.join(config.dataDir,'maintenance.lock');requireState(!fs.existsSync(lockPath),'RESTORE-LOCK-EXISTS','Maintenance is active or interrupted. Inspect it and use explicit interrupted recovery if necessary.');
        const nonce=randomUUID(),directory=path.join(config.dataDir,'recovery','restore-'+nonce);assertNoLinks(directory);fs.mkdirSync(directory,{recursive:true,mode:0o700});
        const fd=fs.openSync(lockPath,'wx',0o600);
        lock={path:lockPath,nonce,startedAt:report.startedAt,directory};
        try{fs.writeFileSync(fd,JSON.stringify({product:PRODUCT,operation:'restore-data',schemaVersion:1,pid:process.pid,nonce,startedAt:lock.startedAt,recoveryDirectory:directory,phase:'preparing'}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
        report.recoveryDirectory=directory;
        state={product:PRODUCT,schemaVersion:1,operationId:nonce,dataDir:config.dataDir,startedAt:lock.startedAt,phase:'preparing',sourceSha256:backup.sha256};stateWrite(lock,state);
        // Recheck after acquiring the startup-blocking marker to close the normal start/restore race.
        await requireStopped(config);
        const candidate=path.join(directory,'candidate.sqlite');await copyPrivate(backup.source,candidate);
        requireState(await hashFile(candidate)===backup.sha256,'RESTORE-BACKUP-CHANGED','The backup changed after verification.');
        const snapshot=await snapshotCurrent(config.dataDir,directory,Date.now(),report);state.original=snapshot.original;state.phase='snapshot-complete';stateWrite(lock,state);
        report.guestSessions=prepareCandidate(candidate,snapshot.guests,Date.now(),backup.sha256);state.phase='candidate-ready';stateWrite(lock,state);
        check(report,'RESTORE-GUEST-CONTINUITY','pass','Only currently valid live guest sessions with the same unlinked guest in the backup were preserved. Backup sessions, Google/admin sessions, OAuth, and pending merges were revoked.',report.guestSessions);
        if(report.guestSessions.missingOrLinkedInBackup)check(report,'RESTORE-GUEST-MISSING','warning','Some current guests did not exist as eligible guests in the selected backup; their old cookies cannot recover a restored save.',{count:report.guestSessions.missingOrLinkedInBackup});
        const displaced=path.join(directory,'displaced');fs.mkdirSync(displaced,{mode:0o700});
        state.phase='swapping';stateWrite(lock,state);swapStarted=true;
        for(const name of FILE_NAMES)if(fs.existsSync(path.join(config.dataDir,name))){regularFile(path.join(config.dataDir,name));fs.renameSync(path.join(config.dataDir,name),path.join(displaced,name));}
        fs.renameSync(candidate,path.join(config.dataDir,DB_NAME));
        if(hooks.afterReplacement)await hooks.afterReplacement();
        report.restored=inspectDatabase(path.join(config.dataDir,DB_NAME));
        state.phase='applied';state.completedAt=new Date().toISOString();state.guestSessions=report.guestSessions;stateWrite(lock,state);removeOwnedLock(lock);lock=undefined;
        report.applied=true;report.serviceRestartAllowed=true;
        check(report,'RESTORE-APPLIED','pass','The verified backup was restored and checked again. The original database remains in the recovery directory.');
      }
    }
    report.ok=true;
  }catch(error){
    check(report,error instanceof RestoreError?error.code:'RESTORE-OPERATION','fail',noDataInError(error),error.errcode?{sqliteErrorCode:error.errcode}:undefined);
    if(lock){
      if(swapStarted){
        try{const rolled=await rollbackPreimage(config.dataDir,lock,state);report.rolledBack=true;report.serviceRestartAllowed=!state.original.exists||rolled.originalHealthy;check(report,'RESTORE-AUTO-ROLLBACK','pass','The attempted replacement failed; the original database files were restored.');lock=undefined;}
        catch{report.rollbackRequired=true;report.serviceRestartAllowed=false;try{state.phase='rollback-required';stateWrite(lock,state);}catch{}check(report,'RESTORE-AUTO-ROLLBACK','fail','Automatic rollback was incomplete. Keep the service stopped and use --rollback-interrupted --apply after this process exits.');}
      }else{try{removeOwnedLock(lock);report.serviceRestartAllowed=true;lock=undefined;}catch{report.rollbackRequired=true;}}
    }
  }
  report.finishedAt=new Date().toISOString();report.summary={pass:0,fail:0,warning:0,skip:0};for(const c of report.checks)report.summary[c.status]++;
  if(reportPath&&reportAllowed){try{writeRestoreReport(reportPath,report);}catch{report.ok=false;report.reportWriteFailed=true;report.summary.fail++;process.stderr.write('The restoration report could not be written. Database operation status is still shown on stdout.\n');}}
  else if(reportPath)report.reportWriteSkipped=true;
  return report;
}
export function writeRestoreReport(filename,report){
  const target=path.resolve(filename);writeJsonAtomic(target,report);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const html=target.replace(/\.json$/i,'')+'.html';assertNoLinks(html);
  const rows=report.checks.map(c=>`<tr><td>${esc(c.status)}</td><td>${esc(c.id)}</td><td>${esc(c.message)}</td></tr>`).join('');
  fs.writeFileSync(html,`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>데이터 복구 검증 보고서</title><style>body{max-width:1100px;margin:3rem auto;padding:0 1rem;font:16px/1.6 system-ui;color:#162335}table{border-collapse:collapse;width:100%}td,th{border:1px solid #cbd5e1;padding:.6rem;text-align:left}code{overflow-wrap:anywhere}</style><h1>데이터 복구 검증 보고서</h1><p>결과: <strong>${report.ok?'PASS':'FAIL'}</strong> · 모드 ${esc(report.mode)} · ${esc(report.finishedAt)}</p><p>실행 환경: ${esc(report.environment.platform)} / ${esc(report.environment.node)}. 이 보고서 자체는 Windows IIS 설치·재기동 실행 증거가 아닙니다.</p><p>적용: ${report.applied?'완료':'미완료/검증만'} · 안전한 서비스 재시작: ${report.serviceRestartAllowed?'가능':'별도 확인 필요'}</p><p>원본 보존 위치: <code>${esc(report.recoveryDirectory||'해당 없음')}</code></p><table><thead><tr><th>상태</th><th>검사</th><th>결과</th></tr></thead><tbody>${rows}</tbody></table></html>`,{mode:0o600});
}
function parseArgs(args){
  const parsed={};for(let i=0;i<args.length;i++){
    const flag=args[i];if(flag==='--help')return {help:true};
    const boolean={'--apply':'apply','--rollback-interrupted':'rollbackInterrupted'}[flag];if(boolean){requireState(!parsed[boolean],'RESTORE-ARGUMENTS','Duplicate flag.');parsed[boolean]=true;continue;}
    const value={'--config':'configPath','--from':'from','--report':'reportPath'}[flag];requireState(value&&!parsed[value]&&args[i+1]&&!args[i+1].startsWith('--'),'RESTORE-ARGUMENTS','Invalid restore argument. Use --help.');parsed[value]=args[++i];
  }return parsed;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const options=parseArgs(process.argv.slice(2));
    if(options.help)console.log('node tools/restore-data.mjs --config <private.json> --from <backup.sqlite> [--apply] [--report <outside-data/report.json>]\nnode tools/restore-data.mjs --config <private.json> --rollback-interrupted --apply [--report <report.json>]\nDefault: read-only backup verification. Apply requires both API ports closed. Original files are retained.');
    else{const report=await restoreData(options);console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;}
  }catch(error){console.error('Restore failed: '+noDataInError(error));process.exitCode=1;}
}
