import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {assertRuntimeOutput,requiredOutput} from '../tools/runtime-output.cjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-prebuilt-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  return root;
}
function write(root,relative,text='deployed-marker'){
  const file=path.join(root,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;
}
test('missing deployment fails without creating output; local login requires deployed bootstrap',t=>{
  const root=fixture(t);
  assert.throws(()=>assertRuntimeOutput(root),/manual deployment/);
  assert.equal(fs.existsSync(path.join(root,'dist')),false);
  for(const name of requiredOutput)write(root,'dist/'+name);
  write(root,'dist/user/catalog/games.json','{"schemaVersion":1,"entries":[]}');
  write(root,'dist/user/config.js','window.PLAYHUB_CONFIG={"apiPort":8090,"apiBaseUrl":""};');
  write(root,'dist/admin/config.js','window.PLAYHUB_ADMIN_CONFIG={"apiPort":8091,"apiBaseUrl":""};');
  assert.equal(assertRuntimeOutput(root).user,path.join(root,'dist/user'));
  const config={admin:{localAutoLogin:true}};
  assert.throws(()=>assertRuntimeOutput(root,config),/manual deployment/);
  write(root,'dist/admin/local-login-bootstrap.js');
  assert.throws(()=>assertRuntimeOutput(root,config),/bootstrap/);
  write(root,'dist/admin/index.html','<script src="/local-login-bootstrap.js"></script>');
  assert.doesNotThrow(()=>assertRuntimeOutput(root,config));
  assert.throws(()=>assertRuntimeOutput(root,{publicPort:9999}),/API settings/);
  write(root,'dist/admin/config.js','window.PLAYHUB_ADMIN_CONFIG={"apiPort":8091,"apiBaseUrl":"https://unexpected.invalid"};');
  assert.throws(()=>assertRuntimeOutput(root),/API settings/);
  write(root,'dist/user/catalog/games.json','invalid');
  assert.throws(()=>assertRuntimeOutput(root),/Invalid deployed Hub catalog/);
});
async function freePorts(){
  const holders=Array.from({length:4},()=>net.createServer());
  await Promise.all(holders.map(server=>new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))));
  const ports=holders.map(server=>server.address().port);
  await Promise.all(holders.map(server=>new Promise(resolve=>server.close(resolve))));return ports;
}
test('two real starts serve identical deployed files with no build tools or source tree',async t=>{
  const root=fixture(t);
  for(const name of ['server','shared'])fs.cpSync(path.join(project,name),path.join(root,name),{recursive:true});
  for(const name of ['dev.mjs','runtime-output.cjs'])write(root,'tools/'+name,fs.readFileSync(path.join(project,'tools',name),'utf8'));
  write(root,'catalog/games.json',JSON.stringify({schemaVersion:1,entries:[]}));
  for(const name of requiredOutput)write(root,'dist/'+name,name.endsWith('.json')?'{"schemaVersion":1,"entries":[]}':'deployed-marker');
  // An unpublished source edit must not leak into the API when a server starts.
  write(root,'catalog/games.json','invalid source catalog that must never be read');
  const watched=requiredOutput.map(name=>path.join(root,'dist',name));
  const [publicPort,adminPort,userPort,adminUiPort]=await freePorts();
  const config={publicHost:'127.0.0.1',adminHost:'127.0.0.1',publicPort,adminPort,userPort,adminUiPort,
    dataDir:path.join(root,'data'),userBaseUrl:`http://127.0.0.1:${userPort}`,userOrigins:[`http://127.0.0.1:${userPort}`],adminOrigins:[`http://127.0.0.1:${adminUiPort}`]};
  const configPath=write(root,'config.json',JSON.stringify(config));
  write(root,'dist/user/config.js','window.PLAYHUB_CONFIG='+JSON.stringify({apiPort:publicPort,apiBaseUrl:''})+';');
  write(root,'dist/admin/config.js','window.PLAYHUB_ADMIN_CONFIG='+JSON.stringify({apiPort:adminPort,apiBaseUrl:''})+';');
  const before=watched.map(file=>({text:fs.readFileSync(file,'utf8'),mtime:fs.statSync(file).mtimeMs}));
  for(let attempt=0;attempt<2;attempt++){
    const child=spawn(process.execPath,[path.join(root,'tools/dev.mjs'),'--config',configPath],{env:{...process.env,PLAYHUB_NO_BROWSER:'1'},windowsHide:true});
    let output='';child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
    const exited=once(child,'exit');
    try{
      const deadline=Date.now()+15000;
      while(!output.includes('READY - ')&&child.exitCode===null&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
      assert.match(output,/READY - /,output);
      assert.doesNotMatch(output,/synchronizing|building/i);
      assert.equal(await (await fetch(`http://127.0.0.1:${userPort}/`)).text(),'deployed-marker');
      assert.equal(await (await fetch(`http://127.0.0.1:${adminUiPort}/`)).text(),'deployed-marker');
      assert.deepEqual(await (await fetch(`http://127.0.0.1:${publicPort}/api/games`)).json(),{games:[]});
    }finally{if(child.exitCode===null)child.kill();await exited;}
  }
  assert.deepEqual(watched.map(file=>({text:fs.readFileSync(file,'utf8'),mtime:fs.statSync(file).mtimeMs})),before);
  for(const name of ['web','games','.dist-previous'])assert.equal(fs.existsSync(path.join(root,name)),false);
});
