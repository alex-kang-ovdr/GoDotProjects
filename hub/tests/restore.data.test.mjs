import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/db.mjs';
import {createApp} from '../server/app.mjs';
import {createBackup,hashFile} from '../tools/backup.mjs';
import {restoreData} from '../tools/restore-data.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const guestToken='test-current-guest-token',guestHash=createHash('sha256').update(guestToken).digest('hex');
async function sparePorts(){
  const servers=[];const ports=[];
  for(let i=0;i<2;i++){const server=net.createServer();await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});servers.push(server);ports.push(server.address().port);}
  for(const server of servers)await new Promise(ok=>server.close(ok));return ports;
}
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-restore-test-')),closeBeforeCleanup=[];
  t.after(async()=>{
    for(const close of closeBeforeCleanup.reverse())await close();
    fs.rmSync(root,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  });
  const dataDir=path.join(root,'data'),configPath=path.join(root,'private.json'),backupPath=path.join(root,'backups','snapshot.sqlite');
  const [publicPort,adminPort]=await sparePorts();
  const config={dataDir,publicPort,adminPort,publicHost:'127.0.0.1',adminHost:'127.0.0.1',userOrigins:['http://127.0.0.1:8080'],adminOrigins:['http://127.0.0.1:8081'],userBaseUrl:'http://127.0.0.1:8080',publicBaseUrl:`http://127.0.0.1:${publicPort}`,adminBaseUrl:'http://127.0.0.1:8081',google:{}};
  fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600});
  fs.mkdirSync(path.join(root,'catalog'));fs.mkdirSync(path.join(root,'games','test-puzzle'),{recursive:true});
  fs.writeFileSync(path.join(root,'catalog','games.json'),JSON.stringify({schemaVersion:1,entries:[{id:'test-puzzle',path:'games/test-puzzle',enabled:true}]}));
  fs.writeFileSync(path.join(root,'games','test-puzzle','game.manifest.json'),JSON.stringify({schemaVersion:1,id:'test-puzzle',slug:'test-puzzle',entry:'index.html',version:'0.1.0',title:{ko:'검증용 퍼즐'},summary:{ko:'테스트'},instructions:{ko:'테스트 전용'},tags:['puzzle'],controls:['keyboard'],save:{schemaVersion:1},media:{cover:'assets/cover.svg'}}));
  const db=openDatabase(dataDir),now=Date.now();
  for(const [id,kind] of [['guest-existing','guest'],['guest-logged-out','guest'],['member-existing','google']])db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,kind,null,now-10000);
  db.prepare('INSERT INTO identities VALUES(?,?,?)').run('google','subject-member','member-existing');
  const session=(id,principal,options={})=>db.prepare('INSERT INTO sessions(id_hash,kind,principal_id,analytics_subject,csrf,admin_authenticated,admin_username,created_at,expires_at,traffic_type,qa_run_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,options.kind||'public',principal,'a:'+id,'csrf-'+id,options.kind==='admin'?1:0,options.kind==='admin'?'admin':null,now-1000,options.expired?now-1:now+3600000,options.qa?'qa':'live',options.qa?randomUUID():null);
  session(guestHash,'guest-existing');session('logged-out-session','guest-logged-out');session('google-session','member-existing');session('admin-session',null,{kind:'admin'});session('expired-session','guest-existing',{expired:true});session('qa-session','guest-existing',{qa:true});
  db.prepare('INSERT INTO save_slots VALUES(?,?,?,?,?,?,?)').run('guest-existing','test-puzzle','main',1,1,JSON.stringify({level:3}),now-1000);
  db.prepare('INSERT INTO save_slot_versions VALUES(?,?,?,?)').run('guest-existing','test-puzzle','retired-slot',27);
  db.prepare('INSERT INTO save_idempotency VALUES(?,?,?,?,?,?,?)').run('guest-existing','test-puzzle','main','old-request','hash','{}',now);
  db.prepare('INSERT INTO oauth_states VALUES(?,?,?,?,?,?,?,?,?)').run('old-state',guestHash,'guest-existing','a:guest','old-nonce','old-verifier','/',now+100000,null);
  db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)').run('pending-merge','guest-existing','member-existing','a:guest','u:member','pending',now+100000,null);
  db.prepare('INSERT INTO merge_requests VALUES(?,?,?,?,?,?,?,?)').run('completed-merge','guest-existing','member-existing','a:guest','u:member','completed',now+100000,'{}');
  db.prepare('INSERT INTO play_sessions(id,session_hash,principal_id,subject_id,game_id,build_id,started_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run('unfinished-play',guestHash,'guest-existing','a:guest','test-puzzle','0.1.0',now-1000,now+100000);
  db.close();
  const f={root,config,configPath,dataDir,backupPath,database:path.join(dataDir,'platform.sqlite'),
    beforeCleanup:close=>closeBeforeCleanup.push(close)};
  f.backup=()=>createBackup({configPath,out:backupPath});
  f.mutateCurrent=()=>{const d=openDatabase(dataDir);d.prepare('UPDATE save_slots SET payload=?,revision=9').run(JSON.stringify({level:9}));d.prepare('DELETE FROM sessions WHERE id_hash=?').run('logged-out-session');d.prepare('INSERT INTO users VALUES(?,?,?,?)').run('guest-after-backup','guest',null,now);d.prepare('INSERT INTO sessions(id_hash,kind,principal_id,analytics_subject,csrf,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run('new-guest-session','public','guest-after-backup','a:new','csrf-new',now,now+3600000);d.close();};
  f.saved=()=>{const d=new DatabaseSync(f.database,{readOnly:true});try{return JSON.parse(d.prepare('SELECT payload FROM save_slots').get().payload);}finally{d.close();}};
  return f;
}
async function metadata(filename){fs.writeFileSync(filename+'.json',JSON.stringify({ok:true,createdAt:new Date().toISOString(),bytes:fs.statSync(filename).size,sha256:await hashFile(filename),integrity:'ok'}));}

test('backup creates a standalone private snapshot and rejects overwrite',async t=>{
  const f=await fixture(t),db=openDatabase(f.dataDir);f.beforeCleanup(()=>db.close());
  db.prepare('UPDATE save_slots SET payload=?').run('{"level":4}');
  const report=await f.backup();assert.equal(report.databaseUserVersion,1);assert.equal(report.snapshotType,'sqlite-online-backup');
  for(const suffix of ['-wal','-shm','-journal'])assert.equal(fs.existsSync(f.backupPath+suffix),false);
  assert.equal(await hashFile(f.backupPath),report.sha256);assert.ok(fs.existsSync(f.backupPath+'.json'));
  if(process.platform!=='win32'){assert.equal(fs.statSync(f.backupPath).mode&0o777,0o600);assert.equal(fs.statSync(f.backupPath+'.json').mode&0o777,0o600);}
  await assert.rejects(f.backup(),/existing files/);
});

test('verify-only checks backup without changing current database or active service',async t=>{
  const f=await fixture(t);await f.backup();f.mutateCurrent();
  const before=await hashFile(f.database),app=createApp(f.config,{rootDir:f.root});f.beforeCleanup(()=>app.close());await app.listen();
  const report=await restoreData({configPath:f.configPath,from:f.backupPath,reportPath:path.join(f.root,'reports','verify.json')});
  assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.applied,false);assert.equal(report.mode,'verify');
  assert.equal(fs.existsSync(path.join(f.dataDir,'maintenance.lock')),false);assert.equal(f.saved().level,9);assert.equal(await hashFile(f.database),before);
  assert.ok(fs.existsSync(path.join(f.root,'reports','verify.html')));
});

test('restore reverts save and preserves only current valid matching guest session; HTTP resume works',async t=>{
  const f=await fixture(t);await f.backup();f.mutateCurrent();
  const report=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(report.ok,true,JSON.stringify(report));
  assert.equal(report.guestSessions.preserved,1);assert.equal(report.guestSessions.missingOrLinkedInBackup,1);assert.equal(f.saved().level,3);
  const db=new DatabaseSync(f.database);
  assert.deepEqual(db.prepare('SELECT id_hash FROM sessions').all().map(s=>s.id_hash),[guestHash]);
  for(const table of ['oauth_states','save_idempotency'])assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n,0);
  assert.deepEqual(db.prepare('SELECT id FROM merge_requests').all().map(s=>s.id),['completed-merge']);
  assert.ok(db.prepare('SELECT ended_at FROM play_sessions').get().ended_at);assert.equal(db.prepare('SELECT action FROM audit').get().action,'data_restore');db.close();
  const versions=new DatabaseSync(f.database,{readOnly:true});assert.equal(versions.prepare("SELECT last_revision FROM save_slot_versions WHERE slot='retired-slot'").get().last_revision,27);versions.close();
  assert.ok(fs.existsSync(path.join(report.recoveryDirectory,'original','platform.sqlite')));assert.equal(fs.existsSync(path.join(f.dataDir,'maintenance.lock')),false);
  const printed=JSON.stringify(report);assert.ok(!printed.includes(guestHash));assert.ok(!printed.includes('csrf-'));
  const app=createApp(f.config,{rootDir:f.root});f.beforeCleanup(()=>app.close());const addresses=await app.listen();
  const response=await fetch(`http://127.0.0.1:${addresses.public.port}/api/saves/test-puzzle`,{headers:{Origin:f.config.userBaseUrl,Cookie:'poc_public_session='+guestToken}});
  assert.equal(response.status,200);assert.equal((await response.json()).payload.level,3);
  const old=await fetch(`http://127.0.0.1:${addresses.public.port}/api/saves/test-puzzle`,{headers:{Origin:f.config.userBaseUrl,Cookie:'poc_public_session=logged-out-session'}});assert.equal(old.status,401);
});

test('legacy user_version=0 and 0.1 metadata restore and migrate on next start',async t=>{
  const f=await fixture(t),db=new DatabaseSync(f.database);
  db.exec('DROP INDEX IF EXISTS events_by_traffic_date; DROP INDEX IF EXISTS plays_by_traffic_date');
  for(const table of ['sessions','play_sessions','events','errors'])db.exec(`ALTER TABLE ${table} DROP COLUMN traffic_type; ALTER TABLE ${table} DROP COLUMN qa_run_id`);
  db.exec('ALTER TABLE save_backups DROP COLUMN reason; DROP TABLE save_slot_versions; PRAGMA user_version=0');db.close();
  await f.backup();await metadata(f.backupPath);
  const report=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.backup.metadataFormat,'legacy');assert.equal(report.restored.databaseUserVersion,0);
  const migrated=openDatabase(f.dataDir);assert.equal(migrated.prepare('PRAGMA user_version').get().user_version,1);migrated.close();
});

test('wrong checksum, missing metadata, and sidecar backup are blocked without mutation',async t=>{
  const f=await fixture(t);await f.backup();const hash=await hashFile(f.database),meta=fs.readFileSync(f.backupPath+'.json');
  const record=JSON.parse(meta);record.sha256='0'.repeat(64);fs.writeFileSync(f.backupPath+'.json',JSON.stringify(record));
  assert.equal((await restoreData({configPath:f.configPath,from:f.backupPath,apply:true})).ok,false);
  fs.unlinkSync(f.backupPath+'.json');assert.equal((await restoreData({configPath:f.configPath,from:f.backupPath,apply:true})).ok,false);
  fs.writeFileSync(f.backupPath+'.json',meta);fs.writeFileSync(f.backupPath+'-wal','not-a-standalone-snapshot');
  const sidecar=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(sidecar.ok,false);assert.ok(sidecar.checks.some(c=>c.id==='RESTORE-BACKUP-SIDECAR'));
  assert.equal(await hashFile(f.database),hash);assert.equal(fs.existsSync(path.join(f.dataDir,'maintenance.lock')),false);
});

test('foreign database, future schema, and added trigger backups are rejected',async t=>{
  const f=await fixture(t);await f.backup();
  const foreign=path.join(f.root,'foreign.sqlite'),alien=new DatabaseSync(foreign);alien.exec('CREATE TABLE foreign_data(v)');alien.close();await metadata(foreign);
  assert.equal((await restoreData({configPath:f.configPath,from:foreign})).ok,false);
  const future=new DatabaseSync(f.backupPath);future.exec('PRAGMA user_version=2');future.close();await metadata(f.backupPath);
  const r=await restoreData({configPath:f.configPath,from:f.backupPath});assert.equal(r.ok,false);assert.ok(r.checks.some(c=>c.id==='RESTORE-SCHEMA-VERSION'));
  const malicious=new DatabaseSync(f.backupPath);malicious.exec('PRAGMA user_version=1; CREATE TRIGGER injected AFTER INSERT ON users BEGIN UPDATE save_slots SET revision=0; END;');malicious.close();await metadata(f.backupPath);
  assert.ok((await restoreData({configPath:f.configPath,from:f.backupPath})).checks.some(c=>c.id==='RESTORE-SCHEMA-OBJECTS'&&c.status==='fail'));
});

test('API listener and SQLite writer lock prevent apply',async t=>{
  const f=await fixture(t);await f.backup();
  const listener=net.createServer();await new Promise(ok=>listener.listen(f.config.publicPort,'127.0.0.1',ok));
  try{const running=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(running.ok,false);assert.ok(running.checks.some(c=>c.id==='RESTORE-SERVICE-RUNNING'));}finally{await new Promise(ok=>listener.close(ok));}
  const db=openDatabase(f.dataDir);db.exec('BEGIN IMMEDIATE');
  try{const locked=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(locked.ok,false);assert.equal(fs.existsSync(path.join(f.dataDir,'maintenance.lock')),false);}finally{db.exec('ROLLBACK');db.close();}
});

test('ordinary replacement failure automatically restores original and retains both versions',async t=>{
  const f=await fixture(t);await f.backup();f.mutateCurrent();
  const report=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true,hooks:{afterReplacement(){throw new Error('Injected test failure');}}});
  assert.equal(report.ok,false);assert.equal(report.rolledBack,true);assert.equal(report.serviceRestartAllowed,true);assert.equal(f.saved().level,9);assert.equal(fs.existsSync(path.join(f.dataDir,'maintenance.lock')),false);
  assert.ok(fs.readdirSync(report.recoveryDirectory).some(n=>n.startsWith('failed-')));
});

test('process interruption leaves startup blocked, explicit recovery restores original',async t=>{
  const f=await fixture(t);await f.backup();f.mutateCurrent();
  const script=`import {restoreData} from ${JSON.stringify(pathToFileURL(path.join(project,'tools/restore-data.mjs')).href)};await restoreData({configPath:process.argv[1],from:process.argv[2],apply:true,hooks:{afterReplacement(){process.exit(72)}}});`;
  const child=spawnSync(process.execPath,['--input-type=module','--eval',script,f.configPath,f.backupPath],{encoding:'utf8',timeout:10000});
  assert.equal(child.status,72,child.stderr);assert.ok(fs.existsSync(path.join(f.dataDir,'maintenance.lock')));assert.throws(()=>openDatabase(f.dataDir),/maintenance/);
  const recovered=await restoreData({configPath:f.configPath,rollbackInterrupted:true,apply:true});assert.equal(recovered.ok,true,JSON.stringify(recovered));assert.equal(recovered.recoveryAction,'original-restored');assert.equal(f.saved().level,9);
  assert.equal(fs.existsSync(path.join(f.dataDir,'maintenance.lock')),false);
});

test('active maintenance ownership and unsafe report destinations are not overwritten',async t=>{
  const f=await fixture(t);await f.backup();const original=fs.readFileSync(f.configPath,'utf8');
  const result=await restoreData({configPath:f.configPath,from:f.backupPath,reportPath:f.configPath});assert.equal(result.ok,false);assert.equal(result.reportWriteSkipped,true);assert.equal(fs.readFileSync(f.configPath,'utf8'),original);
  const lock=path.join(f.dataDir,'maintenance.lock'),nonce=randomUUID();fs.writeFileSync(lock,JSON.stringify({product:'playhub-iis-poc',operation:'restore-data',schemaVersion:1,nonce,pid:process.pid,recoveryDirectory:path.join(f.dataDir,'recovery','restore-'+nonce),phase:'preparing'}));
  const recovery=await restoreData({configPath:f.configPath,rollbackInterrupted:true,apply:true});assert.equal(recovery.ok,false);assert.ok(recovery.checks.some(c=>c.id==='RESTORE-LOCK-ACTIVE'));assert.ok(fs.existsSync(lock));
});

test('damaged current database can be replaced while its raw bytes remain retained',async t=>{
  const f=await fixture(t);await f.backup();const corrupt=Buffer.from('damaged SQLite bytes retained for inspection');fs.writeFileSync(f.database,corrupt);
  const report=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(report.ok,true,JSON.stringify(report));assert.equal(f.saved().level,3);assert.equal(report.guestSessions.preserved,0);
  assert.deepEqual(fs.readFileSync(path.join(report.recoveryDirectory,'original','platform.sqlite')),corrupt);assert.ok(report.checks.some(c=>c.id==='RESTORE-CURRENT-DAMAGED'));
});

test('linked or reclassified guest principal in the backup cannot inherit a guest cookie',async t=>{
  const f=await fixture(t),db=new DatabaseSync(f.database);db.prepare('INSERT INTO identities VALUES(?,?,?)').run('google','linked-before-backup','guest-existing');db.close();await f.backup();
  const current=new DatabaseSync(f.database);current.prepare('DELETE FROM identities WHERE user_id=?').run('guest-existing');current.close();
  const report=await restoreData({configPath:f.configPath,from:f.backupPath,apply:true});assert.equal(report.ok,true,JSON.stringify(report));assert.equal(report.guestSessions.preserved,1); // only the unrelated still-current guest
  const restored=new DatabaseSync(f.database,{readOnly:true});assert.equal(restored.prepare('SELECT count(*) n FROM sessions WHERE id_hash=?').get(guestHash).n,0);restored.close();
});

test('symlink backup paths are rejected', {skip:process.platform==='win32'?'Windows symlink creation requires additional privileges':false},async t=>{
  const f=await fixture(t);await f.backup();const linked=path.join(f.root,'linked.sqlite');fs.symlinkSync(f.backupPath,linked);fs.symlinkSync(f.backupPath+'.json',linked+'.json');
  assert.equal((await restoreData({configPath:f.configPath,from:linked})).ok,false);
});
