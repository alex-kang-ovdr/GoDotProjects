'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const WebSocket=require('ws');
const {BrawlRoom}=require('../Tools/brawllabs-multiplayer.cjs');
const {createServer}=require('../server.cjs');
function fixture(){let time=0;const room=new BrawlRoom('test','a'.repeat(24),()=>time);return {room,advance(ms){time+=ms;room.tick();}};}
test('two ready humans start after five seconds with four bots and three slots per team',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1);
 room.command(a.id,{type:'ready',ready:true});room.command(b.id,{type:'ready',ready:true});
 assert.equal(room.phase,'countdown');advance(4999);assert.equal(room.game,null);advance(1);
 assert.equal(room.phase,'playing');assert.equal(room.game.actors.filter(a=>a.isBot).length,4);
 assert.equal(room.game.actors.filter(a=>a.team===0).length,3);assert.equal(room.game.actors.filter(a=>a.team===1).length,3);
});
test('waiting humans block start until >20 seconds, spectators do not block and cannot send gameplay input',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1),c=room.join('Waiting',1);
 for(const p of [a,b])room.command(p.id,{type:'ready',ready:true});advance(20000);assert.equal(room.phase,'lobby');
 room.command(c.id,{type:'team',team:0});advance(1);assert.equal(c.spectator,true);assert.equal(room.phase,'countdown');
 advance(5000);assert.equal(room.phase,'playing');room.command(c.id,{type:'input',seq:1,moveX:1,moveY:0,aimX:0,aimY:0});assert.equal(c.input,null);
});
test('unready or departure cancels countdown and a new ready period gets a fresh five seconds',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1);for(const p of [a,b])room.command(p.id,{type:'ready',ready:true});
 advance(3000);room.command(a.id,{type:'ready',ready:false});assert.equal(room.phase,'lobby');advance(3000);assert.equal(room.game,null);
 room.command(a.id,{type:'ready',ready:true});assert.equal(room.countdownEndsAt,11000);room.leave(b.id);advance(6000);assert.equal(room.phase,'lobby');
});
test('team capacity, late spectators, and disconnect replacement retain the same match and actor',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',0),c=room.join('C',0),d=room.join('D',0);
 assert.equal(d.spectator,true);assert.throws(()=>room.command(d.id,{type:'team',team:0}));
 for(const p of [a,b,c])room.command(p.id,{type:'ready',ready:true});advance(5000);
 const actor=room.game.actors.find(x=>x.controllerId===a.id);actor.hp=75;const game=room.game;
 room.leave(a.id);assert.equal(room.game,game);assert.equal(actor.isBot,true);assert.equal(actor.hp,75);assert.equal(actor.controllerId,null);
 assert.equal(room.join('Late',1).spectator,true);assert.equal(game.actors.length,6);
});
test('server moves only the sender actor, clamps input and ignores stale or invalid sequences',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1);for(const p of [a,b])room.command(p.id,{type:'ready',ready:true});advance(5000);
 const actor=room.game.actors.find(x=>x.controllerId===a.id),other=room.game.actors.find(x=>x.controllerId===b.id),x=actor.x,otherX=other.x;
 room.command(a.id,{type:'input',seq:1,moveX:999,moveY:0,aimX:800,aimY:400,fire:true});advance(50);
 assert.ok(actor.x>x&&actor.x-x<=13);assert.equal(other.x,otherX);assert.ok(room.game.shots.length>0);
 room.command(a.id,{type:'input',seq:0,moveX:-1,moveY:0,aimX:0,aimY:0});assert.equal(a.input.moveX,1);
 assert.throws(()=>room.command(a.id,{type:'input',seq:2,moveX:NaN,moveY:0,aimX:0,aimY:0}));
 advance(501);const stopX=actor.x;advance(50);assert.equal(actor.x,stopX);
});
test('six ready humans occupy all slots and rooms do not share readiness or game state',()=>{
 const {room,advance}=fixture(),isolated=fixture().room;
 for(let i=0;i<6;i++){const p=room.join('P'+i,i%2);room.command(p.id,{type:'ready',ready:true});}
 advance(5000);assert.equal(room.game.actors.filter(a=>a.isBot).length,0);
 assert.equal(new Set(room.game.actors.map(a=>a.controllerId)).size,6);assert.equal(isolated.game,null);assert.equal(isolated.players.size,0);
});
test('spectator takeover atomically claims an unowned bot and preserves its live state',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1);for(const p of [a,b])room.command(p.id,{type:'ready',ready:true});advance(5000);
 const spectator=room.join('Late spectator',1),actor=room.game.actors.find(x=>x.isBot);Object.assign(actor,{hp:47,x:701,y:333,gems:2,cooldown:.31,gadgetCooldown:2.4,ammo:1,reload:.42,superCharge:.6,alive:false,respawn:1.1});
 room.command(spectator.id,{type:'takeover',slot:actor.slot});
 assert.equal(spectator.spectator,false);assert.equal(spectator.team,actor.team);assert.equal(actor.controllerId,spectator.id);assert.equal(actor.isBot,false);assert.equal(actor.name,spectator.name);
 for(const key of ['hp','x','y','gems','cooldown','gadgetCooldown','ammo','reload','superCharge','alive','respawn'])assert.equal(actor[key],({hp:47,x:701,y:333,gems:2,cooldown:.31,gadgetCooldown:2.4,ammo:1,reload:.42,superCharge:.6,alive:false,respawn:1.1})[key]);
 assert.equal(spectator.input,null);assert.equal(spectator.seq,-1);assert.equal(room.snapshot().game.actors.length,6);
 const entry=room.snapshot().logs.at(-1);assert.equal(entry.event,'takeover');assert.equal(entry.source,'server');assert.equal(entry.roomId,room.id);assert.equal(entry.tick,room.game.tick);
});
test('simultaneous takeover requests cannot claim one bot twice and failed claims leave spectators unchanged',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1);for(const p of [a,b])room.command(p.id,{type:'ready',ready:true});advance(5000);
 const onlyBot=room.game.actors.find(x=>x.isBot);for(const actor of room.game.actors)if(actor!==onlyBot){actor.isBot=false;actor.controllerId=`occupied-${actor.slot}`;}
 const s1=room.join('First',0),s2=room.join('Second',1);room.command(s1.id,{type:'takeover',slot:onlyBot.slot});assert.throws(()=>room.command(s2.id,{type:'takeover',slot:onlyBot.slot}));
 assert.equal(onlyBot.controllerId,s1.id);assert.equal(s2.spectator,true);assert.equal(s2.team,1);
 assert.throws(()=>room.command(s2.id,{type:'takeover',slot:99}));assert.equal(s2.spectator,true);assert.equal(onlyBot.controllerId,s1.id);
});
test('finished matches reject takeover and player departure returns the actor to bot control',()=>{
 const {room,advance}=fixture(),a=room.join('A',0),b=room.join('B',1);for(const p of [a,b])room.command(p.id,{type:'ready',ready:true});advance(5000);
 const spectator=room.join('Late',1),actor=room.game.actors.find(x=>x.isBot);room.command(spectator.id,{type:'takeover',slot:actor.slot});
 room.leave(spectator.id);assert.equal(actor.controllerId,null);assert.equal(actor.isBot,true);assert.equal(actor.name,`BOT ${actor.slot+1}`);
 const next=room.join('Next',0);room.phase='finished';assert.throws(()=>room.command(next.id,{type:'takeover'}));assert.equal(next.spectator,true);
});
test('HTTP room metadata and websocket welcome/state pin spectators to the successful build',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'brawllabs-build-')),buildId='b'.repeat(16);let projectId;
 fs.mkdirSync(path.join(directory,buildId),{recursive:true});
 const server=createServer({buildDirectory:directory,platformWorkspace:path.join(directory,'platform'),workspace:path.join(directory,'workspace')});t.after(async()=>{await new Promise(resolve=>{if(!server.listening)return resolve();server.once('close',resolve);server.shutdown?server.shutdown():server.close();});fs.rmSync(directory,{recursive:true,force:true});});
 const port=await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));}),base=`http://127.0.0.1:${port}`;
 const projectResponse=await fetch(base+'/api/platform/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Build pinning fixture',template:'brawllabs',mode:'ready'})});assert.equal(projectResponse.status,201);projectId=(await projectResponse.json()).project.id;
 fs.writeFileSync(path.join(directory,buildId,'result.json'),JSON.stringify({id:buildId,projectId,revision:19,status:'succeeded',previewUrl:`/api/builds/${buildId}/files/index.html`}));
 const wsJoin=(payload)=>new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/brawllabs`),messages=[];ws.on('error',reject);ws.on('message',data=>{const value=JSON.parse(data);messages.push(value);if(value.type==='welcome'){resolve({ws,messages});}else if(value.type==='error')reject(new Error(value.error));});ws.on('open',()=>ws.send(JSON.stringify(payload)));});
 const failed=await new Promise(resolve=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/brawllabs`);ws.on('message',data=>{const value=JSON.parse(data);if(value.type==='error'){resolve(value);ws.close();}});ws.on('open',()=>ws.send(JSON.stringify({type:'join',projectId,buildId:'c'.repeat(16)})));});assert.match(failed.error,/성공한 프로젝트 빌드/);
 const {ws,messages}=await wsJoin({type:'join',projectId,buildId,name:'Host'});t.after(()=>ws.close());
 const welcome=messages[0];assert.equal(welcome.buildId,buildId);assert.equal(welcome.revision,19);assert.equal(welcome.previewUrl,`/api/builds/${buildId}/files/index.html`);
 const roomId=welcome.roomId,roomResponse=await fetch(`${base}/api/brawllabs/rooms/${roomId}`),metadata=await roomResponse.json();assert.equal(roomResponse.status,200);assert.deepEqual(metadata.room,{roomId,projectId,buildId,revision:19,previewUrl:`/api/builds/${buildId}/files/index.html`,phase:'lobby',players:1});
 assert.equal((await fetch(`${base}/api/brawllabs/rooms/${'f'.repeat(12)}`)).status,404);
});
