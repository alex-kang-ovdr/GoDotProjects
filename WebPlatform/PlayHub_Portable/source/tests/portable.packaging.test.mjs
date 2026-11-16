import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createBundle,stripPeSignature,PIN} from '../portable/build-sea.mjs';
const require=createRequire(import.meta.url),launcher=require('../portable/launcher.cjs');
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const digest=b=>createHash('sha256').update(b).digest('hex');
function temp(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-packaging-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function record(name,text){const bytes=Buffer.from(text);return {path:name,sha256:digest(bytes),data:bytes.toString('base64')};}
function packed(records=[]){return gzipSync(Buffer.from(JSON.stringify({format:1,version:'0.3.0',files:[record('package.json','{"type":"module","version":"0.3.0"}'),record('portable/launch.mjs','export async function run(context){console.log(JSON.stringify({ok:true,args:context.args,sea:context.sea,launcherPath:context.launcherPath,appRoot:context.appRoot,instanceRoot:context.instanceRoot}));}'),...records]})));}
function sourceFixture(t){
 const root=temp(t);for(const dir of ['server','web/user','web/admin','shared','games/test-game','catalog','config','portable','tools','scripts','tests','reports','data'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 const files={'package.json':'{"name":"packaging-test-fixture","version":"0.3.0","type":"module"}','server/app.mjs':'export const fixture=true;','server/db.mjs':'export const fixture=true;','web/user/index.html':'<!doctype html><title>User test fixture</title>','web/admin/index.html':'<!doctype html><title>Admin test fixture</title>','shared/sdk.js':'/* fixture */','games/test-game/index.html':'<!doctype html><title>Fixture only</title>','catalog/games.json':'{"schemaVersion":1,"entries":[]}','config/example.json':'{}','config/local.json':'{"clientSecret":"must-not-ship"}','portable/launch.mjs':'export async function run(){}','portable/workers.mjs':'export async function runWorker(){}','portable/NativeDialog.ps1':'# fixture only','portable/build-sea.mjs':'/* build tool not shipped */','portable/RebexTinyWebServer.exe':'fixture not a real binary','scripts/Install-IIS.ps1':'# must not ship','tests/never.mjs':'/* must not ship */','reports/never.json':'{}','data/platform.sqlite':'fixture not a database'};
 for(const name of ['build.mjs','setup.mjs','backup.mjs','restore-data.mjs','dev.mjs','smoke.mjs','check-stack.mjs'])files['tools/'+name]='export const fixture=true;';
 for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(root,name),value);
 return root;
}

test('portable bundle deterministically selects runtime sources, embeds notices, and excludes IIS/secrets/Rebex/tests',t=>{
 const root=sourceFixture(t),first=createBundle({root,nodeLicenseText:'Node license test fixture'}),second=createBundle({root,nodeLicenseText:'Node license test fixture'});
 assert.equal(first.buffer.equals(second.buffer),true);const parsed=launcher.parseBundle(first.buffer),names=parsed.files.map(f=>f.path);
 assert.ok(names.includes('tools/check-stack.mjs'));assert.ok(names.includes('tools/smoke.mjs'));assert.ok(names.includes('portable/NativeDialog.ps1'));assert.ok(names.includes('licenses/Node-LICENSE.txt'));
 for(const forbidden of ['config/local.json','portable/RebexTinyWebServer.exe','portable/build-sea.mjs','scripts/Install-IIS.ps1','tests/never.mjs','reports/never.json','data/platform.sqlite'])assert.equal(names.includes(forbidden),false,forbidden);
 assert.equal(parsed.files.some(f=>f.bytes.includes(Buffer.from('must-not-ship'))),false);assert.equal(first.manifest.payloadSha256,digest(first.buffer));
});

test('new embedded package extracts to content-addressed cache and verified reuse preserves user data',t=>{
 const instance=path.join(temp(t),'instance'),payload=packed([record('web/user/index.html','<h1>Example</h1>')]);
 const a=launcher.extractBundle(payload,instance);fs.mkdirSync(path.join(instance,'data'));fs.writeFileSync(path.join(instance,'data','user-record.txt'),'retained');
 const b=launcher.extractBundle(payload,instance);assert.equal(a.appRoot,b.appRoot);assert.equal(a.reused,false);assert.equal(b.reused,true);assert.equal(fs.readFileSync(path.join(instance,'data','user-record.txt'),'utf8'),'retained');
 assert.equal(path.basename(a.appRoot),digest(payload));assert.equal(fs.readFileSync(path.join(a.appRoot,'web/user/index.html'),'utf8'),'<h1>Example</h1>');
});

test('changed source produces a separate app cache while old cache and instance data remain',t=>{
 const instance=path.join(temp(t),'instance'),first=launcher.extractBundle(packed([record('asset.txt','one')]),instance),second=launcher.extractBundle(packed([record('asset.txt','two')]),instance);
 assert.notEqual(first.appRoot,second.appRoot);assert.equal(fs.readFileSync(path.join(first.appRoot,'asset.txt'),'utf8'),'one');assert.equal(fs.readFileSync(path.join(second.appRoot,'asset.txt'),'utf8'),'two');
});

test('path traversal, Windows devices, ADS, absolute paths and directory/file collisions are rejected',()=>{
 for(const value of ['../escape','/absolute','C:/drive','a\\b','a//b','a/./b','a/../b','CON.txt','folder/NUL','file:stream','trailing.','trailing ','a\u0000b','bundle-manifest.json'])assert.throws(()=>launcher.parseBundle(packed([record(value,'x')])),'unsafe '+JSON.stringify(value));
 assert.throws(()=>launcher.parseBundle(packed([record('dir','x'),record('dir/child','y')])),/parent directory/);
 assert.throws(()=>launcher.parseBundle(packed([record('Case.txt','x'),record('case.txt','x')])),/case-colliding/);
});

test('file checksum corruption, malformed base64, bad envelope and invalid gzip cannot execute',()=>{
 const entries=[record('package.json','{}'),record('portable/launch.mjs','export async function run(){}')];
 const corrupted={...entries[1],sha256:'0'.repeat(64)};assert.throws(()=>launcher.parseBundle(gzipSync(JSON.stringify({format:1,version:'0.3.0',files:[entries[0],corrupted]}))),/checksum/);
 const malformed={...entries[1],data:'abcd=garbage'};assert.throws(()=>launcher.parseBundle(gzipSync(JSON.stringify({format:1,version:'0.3.0',files:[entries[0],malformed]}))),/base64/);
 assert.throws(()=>launcher.parseBundle(gzipSync(JSON.stringify({format:2,version:'0.3.0',files:entries}))),/format/);assert.throws(()=>launcher.parseBundle(Buffer.from('not gzip')),/decompressed/);
});

test('large valid base64 asset is supported while the file limit is enforced',()=>{
 const bytes=Buffer.alloc(1024*1024,7),valid=record('assets/large.bin',bytes);assert.equal(launcher.parseBundle(packed([valid])).files.at(-1).bytes.length,bytes.length);
 const oversized={path:'assets/too-large.bin',sha256:'0'.repeat(64),data:'A'.repeat(Math.ceil(launcher.LIMITS.file/3)*4+4)};
 assert.throws(()=>launcher.parseBundle(packed([oversized])),/length/);
});

test('tampered existing application cache is refused without deleting saved data',t=>{
 const root=temp(t),instance=path.join(root,'instance'),payload=packed([record('asset.txt','expected')]),first=launcher.extractBundle(payload,instance);
 fs.mkdirSync(path.join(instance,'data'));fs.writeFileSync(path.join(instance,'data','save.txt'),'preserve');fs.writeFileSync(path.join(first.appRoot,'asset.txt'),'modified');
 assert.throws(()=>launcher.extractBundle(payload,instance),/changed|checksum/);assert.equal(fs.readFileSync(path.join(instance,'data','save.txt'),'utf8'),'preserve');assert.equal(fs.readFileSync(path.join(first.appRoot,'asset.txt'),'utf8'),'modified');
});

test('symlink storage roots and cached files cannot escape extraction', {skip:process.platform==='win32'?'Windows symlink creation requires privileges':false},t=>{
 const root=temp(t),outside=path.join(root,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.join(root,'shortcut'));
 assert.throws(()=>launcher.extractBundle(packed(),path.join(root,'shortcut','instance')),/symbolic/);assert.equal(fs.readdirSync(outside).length,0);
 const instance=path.join(root,'instance'),payload=packed([record('asset.txt','expected')]),first=launcher.extractBundle(payload,instance);fs.unlinkSync(path.join(first.appRoot,'asset.txt'));fs.writeFileSync(path.join(outside,'target.txt'),'expected');fs.symlinkSync(path.join(outside,'target.txt'),path.join(first.appRoot,'asset.txt'));
 assert.throws(()=>launcher.extractBundle(payload,instance),/symbolic/);
});

test('bootstrap parsing keeps worker/application args and prevents SEA bundle replacement',()=>{
 const parsed=launcher.parseBootstrapArgs(['--data-dir','folder','--worker=api','--parent-pid=42','--no-browser']);assert.equal(parsed.dataDir,path.resolve('folder'));assert.deepEqual(parsed.args,['--worker=api','--parent-pid=42','--no-browser']);
 assert.throws(()=>launcher.parseBootstrapArgs(['--bundle','external.gz'],{isSea:true}),/cannot replace/);assert.throws(()=>launcher.parseBootstrapArgs(['--data-dir']),/requires a path/);
});

test('development entry imports the embedded ESM run function and supplies the launcher context',t=>{
 const root=temp(t),bundle=path.join(root,'bundle.gz'),instance=path.join(root,'instance');fs.writeFileSync(bundle,packed());
 const result=spawnSync(process.execPath,[path.join(project,'portable/launcher.cjs'),'--bundle',bundle,'--data-dir',instance,'--worker=api','--no-browser'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);assert.equal(data.ok,true);assert.equal(data.sea,false);assert.equal(data.launcherPath,path.join(project,'portable/launcher.cjs'));assert.equal(data.instanceRoot,instance);assert.deepEqual(data.args,['--worker=api','--no-browser']);
});

test('development package check runs embedded-module import and built-in SQLite without starting a service',t=>{
 const root=temp(t),bundle=path.join(root,'bundle.gz');fs.writeFileSync(bundle,packed());const result=spawnSync(process.execPath,[path.join(project,'portable/launcher.cjs'),'--bundle',bundle,'--data-dir',path.join(root,'instance'),'--package-check'],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);assert.equal(data.sqliteResult,42);assert.equal(data.esmEntryImported,true);assert.equal(data.applicationStarted,false);assert.equal(data.sea,false);
});

function fakePe(certificateOffset=1024){const bytes=Buffer.alloc(1088);bytes.write('MZ');bytes.writeUInt32LE(0x80,0x3c);bytes.write('PE\0\0',0x80,'binary');bytes.writeUInt16LE(0x8664,0x84);bytes.writeUInt16LE(1,0x86);bytes.writeUInt16LE(240,0x94);const optional=0x98;bytes.writeUInt16LE(0x20b,optional);bytes.writeUInt32LE(16,optional+108);bytes.writeUInt32LE(certificateOffset,optional+112+32);bytes.writeUInt32LE(64,optional+112+36);const table=optional+240;bytes.writeUInt32LE(512,table+16);bytes.writeUInt32LE(512,table+20);return bytes;}

test('build-time signature removal affects only copied PE certificate metadata and detached tail',t=>{
 const root=temp(t),filename=path.join(root,'copy.exe');fs.writeFileSync(filename,fakePe());const report=stripPeSignature(filename),after=fs.readFileSync(filename);assert.equal(report.originalCertificatePresent,true);assert.equal(report.removedTrailingBytes,64);assert.equal(after.length,1024);assert.equal(after.readUInt32LE(0x98+112+32),0);assert.equal(after.readUInt32LE(0x98+112+36),0);
 const bad=path.join(root,'bad.exe'),original=fakePe(900);fs.writeFileSync(bad,original);assert.throws(()=>stripPeSignature(bad),/overlaps/);assert.equal(fs.readFileSync(bad).equals(original),true);
});

test('runtime packaging rejects symlinks and executable/database files inside game content', {skip:process.platform==='win32'?'Windows symlink creation requires privileges':false},t=>{
 const root=sourceFixture(t),secret=path.join(root,'games/test-game/embedded.exe');fs.writeFileSync(secret,'fixture not executable');assert.throws(()=>createBundle({root,nodeLicenseText:'test license'}),/not permitted/);fs.unlinkSync(secret);
 fs.symlinkSync(path.join(root,'config/local.json'),path.join(root,'shared/leak.json'));assert.throws(()=>createBundle({root,nodeLicenseText:'test license'}),/symbolic|junction/);
});
