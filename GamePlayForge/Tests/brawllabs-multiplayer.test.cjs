'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {BrawlRoom}=require('../Tools/brawllabs-multiplayer.cjs');
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
