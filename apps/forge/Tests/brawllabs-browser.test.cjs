'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('@playwright/test');const {createServer}=require('../server.cjs');
test('actual Godot clients share a build, a late spectator takes over a bot, and departures return slots to bots',{timeout:300000},async t=>{
 const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-multi-'));
 const server=createServer({workspace:path.join(temporary,'workspace'),platformWorkspace:path.join(temporary,'platform'),buildDirectory:path.join(temporary,'builds')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
 t.after(async()=>{await browser.close();await new Promise(r=>{server.once('close',r);server.shutdown();});fs.rmSync(temporary,{recursive:true,force:true});});
 const evidence=path.join(root,'Saved/Tests/brawllabs-multiplayer');fs.mkdirSync(evidence,{recursive:true});const errors=[],log=[];
 const a=await browser.newPage({viewport:{width:1280,height:900}}),b=await browser.newPage({viewport:{width:1280,height:900}}),c=await browser.newPage({viewport:{width:1280,height:900}});
 for(const page of [a,b,c]){page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{log.push(m.text());if(/SCRIPT ERROR|Parse Error|Invalid call|Invalid access/.test(m.text()))errors.push(m.text());});}
 try{
  await a.goto(base+'/OfficialGodot/brawllabs-lobby.html');await a.locator('#name').fill('Alice');await a.locator('#join').click();
  await a.locator('#lobby').waitFor({state:'visible',timeout:120000});await a.locator('[data-team="0"]').click();await a.locator('#ready').click();
  const invite=a.url();await b.goto(invite);await b.locator('#name').fill('Bob');await b.locator('#join').click();
  await b.locator('#lobby').waitFor({state:'visible',timeout:120000});await b.locator('[data-team="1"]').click();await b.locator('#ready').click();
  for(const page of [a,b])await page.waitForFunction(()=>window.PlayForgeBrawl?.state?.phase==='playing',null,{timeout:15000});
  const state=await a.evaluate(()=>window.PlayForgeBrawl.state),alice=await a.evaluate(()=>window.PlayForgeBrawl.playerId);
  assert.equal(state.game.actors.filter(x=>x.isBot).length,4);assert.equal(state.game.actors.length,6);
  const pin={projectId:state.projectId,buildId:state.buildId,revision:state.revision};
  const edited=await a.evaluate(async projectId=>{const current=await(await fetch('/api/platform/projects/'+projectId)).json();const files=current.files.map(file=>file.path==='project.godot'?{...file,content:file.content.replace('BrawlLabs Multiplayer','BrawlLabs Multiplayer Edited')}:file);const response=await fetch('/api/platform/projects/'+projectId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseRevision:current.revision,files})});const result=await response.json();return {status:response.status,revision:result.revision};},pin.projectId);
  assert.equal(edited.status,200);assert.ok(edited.revision>pin.revision);
  const own=state.game.actors.find(x=>x.controllerId===alice);assert.ok(own);
  await c.goto(invite);await c.locator('#name').fill('Late spectator');await c.locator('#join').click();
  await c.waitForFunction(()=>window.PlayForgeBrawl?.state?.phase==='playing',null,{timeout:120000});await c.locator('#takeover').waitFor({state:'visible'});
  const spectatorId=await c.evaluate(()=>window.PlayForgeBrawl.playerId),claimTeam=state.game.actors.find(x=>x.isBot).team;
  await c.locator(`[data-takeover-team="${claimTeam}"]`).click();
  await b.waitForFunction(({id})=>window.PlayForgeBrawl.state.game.actors.some(actor=>actor.controllerId===id&&!actor.isBot),{id:spectatorId},{timeout:5000});
  const claimed=await b.evaluate(id=>window.PlayForgeBrawl.state.game.actors.find(actor=>actor.controllerId===id),spectatorId),claimedSlot=claimed.slot;
  const lateCanvas=c.frameLocator('#game').locator('canvas').first();await lateCanvas.waitFor({state:'visible'});await lateCanvas.click({position:{x:200,y:200}});
  await c.keyboard.down('KeyS');await b.waitForFunction(({id,y})=>window.PlayForgeBrawl.state.game.actors.find(actor=>actor.controllerId===id)?.y>y+40,{id:spectatorId,y:claimed.y},{timeout:5000});await c.keyboard.up('KeyS');
  assert.equal((await b.evaluate(id=>window.PlayForgeBrawl.state.game.actors.find(actor=>actor.controllerId===id).slot,spectatorId)),claimedSlot);
  await c.screenshot({path:path.join(evidence,'late-spectator-takeover.png')});await c.close();
  await b.waitForFunction(slot=>window.PlayForgeBrawl.state.game.actors[slot].isBot,claimedSlot,{timeout:7000});
  const canvas=a.frameLocator('#game').locator('canvas').first();await canvas.waitFor({state:'visible'});await canvas.click({position:{x:200,y:200}});
  await a.keyboard.down('KeyS');await new Promise(r=>setTimeout(r,600));await a.keyboard.up('KeyS');
  await b.waitForFunction(({id,y})=>window.PlayForgeBrawl.state.game.actors.find(x=>x.controllerId===id)?.y>y+50,{id:alice,y:own.y},{timeout:5000});
  await a.screenshot({path:path.join(evidence,'alice.png')});await b.screenshot({path:path.join(evidence,'bob.png')});
  await a.close();await b.waitForFunction(slot=>window.PlayForgeBrawl.state.game.actors[slot].isBot,own.slot,{timeout:7000});
  const after=await b.evaluate(()=>window.PlayForgeBrawl.state);assert.equal(after.game.actors.filter(x=>x.isBot).length,5);assert.equal(after.phase,'playing');
  assert.equal(after.buildId,pin.buildId);assert.equal(after.revision,pin.revision);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,playersAtStart:2,botsAtStart:4,botsAfterLateTakeover:3,botsAfterLateDisconnect:4,botsAfterHostDisconnect:5,room:after.roomId,takeoverSlot:claimedSlot,slotReplaced:own.slot,pinnedBuild:pin.buildId,pinnedRevision:pin.revision,projectRevisionAfterEdit:edited.revision},null,2));
 }finally{fs.writeFileSync(path.join(evidence,'browser.log'),log.join('\n'));if(!a.isClosed()){console.log('Alice:',await a.locator('#status').textContent());await a.screenshot({path:path.join(evidence,'alice-last.png')});}if(!b.isClosed())await b.screenshot({path:path.join(evidence,'last-state.png')});if(!c.isClosed())await c.close();}
});
