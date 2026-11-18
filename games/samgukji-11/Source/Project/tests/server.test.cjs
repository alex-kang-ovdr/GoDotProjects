'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http'),net=require('node:net'),path=require('node:path');
const {spawn}=require('node:child_process');
let child,port;
function request(url,method='GET'){return new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:url,method},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks).toString('utf8')}));});req.on('error',reject);req.end();});}
before(async()=>{
 port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 child=spawn(process.execPath,[path.join(__dirname,'../server.cjs')],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timeout')),5000);child.once('error',err=>{clearTimeout(timer);reject(err);});child.stdout.on('data',data=>{if(String(data).includes('RTK11 Web:')){clearTimeout(timer);resolve();}});child.stderr.on('data',data=>{clearTimeout(timer);reject(new Error(String(data)));});});
});
after(()=>{if(child)child.kill();});
test('local server serves Korean HTML with UTF-8 and proper MIME',async()=>{const r=await request('/');assert.equal(r.status,200);assert.match(r.headers['content-type'],/text\/html.*utf-8/);assert.match(r.body,/군웅의 시대/);});
test('standalone HTML has all game code embedded and no external scripts/styles',async()=>{const r=await request('/PLAY.html');assert.equal(r.status,200);assert.match(r.body,/class Engine/);assert.match(r.body,/class Renderer/);assert.doesNotMatch(r.body,/<script[^>]+src=|<link[^>]+stylesheet/);});
test('JavaScript MIME and HEAD requests are correct',async()=>{const r=await request('/js/engine.js','HEAD');assert.equal(r.status,200);assert.match(r.headers['content-type'],/javascript/);assert.ok(Number(r.headers['content-length'])>10000);assert.equal(r.body,'');});
test('encoded path traversal cannot escape project root',async()=>{const r=await request('/%2e%2e%2fREADME.md');assert.equal(r.status,403);});
test('missing files return 404 and writes return 405',async()=>{assert.equal((await request('/does-not-exist')).status,404);assert.equal((await request('/','POST')).status,405);});
