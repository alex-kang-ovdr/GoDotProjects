'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {chromium}=require('@playwright/test');const {createServer}=require('../server.cjs');

test('multiplayer workspace reflects a client snapshot, adds a same-room client, and opens a fresh-world client',{timeout:60000},async t=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playforge-workspace-'));
 const server=createServer({workspace:path.join(temporary,'workspace'),platformWorkspace:path.join(temporary,'platform'),buildDirectory:path.join(temporary,'builds')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({channel:'chrome',headless:true});
 t.after(async()=>{await browser.close();await new Promise(r=>{server.once('close',r);server.shutdown();});fs.rmSync(temporary,{recursive:true,force:true});});
 const page=await browser.newPage();
 try{
  await page.goto(base+'/OfficialGodot/multiplayer.html?project=0123456789abcdef01234567');
  await page.locator('.client-frame[data-client-id="client-1"]').waitFor({state:'attached'});
  await page.waitForFunction(()=>window.PlayForgeMultiplayer?.clients.length===1);
  assert.equal(await page.evaluate(()=>window.PlayForgeMultiplayer.addClient()),true);
  assert.equal(await page.locator('.client-frame[data-client-id="client-2"]').getAttribute('src'),null);
  const lobby=page.frames().find(frame=>frame.url().includes('brawllabs-lobby.html'));assert.ok(lobby);
  await lobby.evaluate(()=>parent.postMessage({source:'playforge-brawl-client',type:'state',playerId:'p1',roomId:'abcdef012345',projectId:'0123456789abcdef01234567',buildId:'a'.repeat(16),revision:4,previewUrl:'/api/builds/'+ 'a'.repeat(16)+'/files/index.html',state:{phase:'playing',roomId:'abcdef012345',players:[{id:'p1',name:'Client 1',team:0,spectator:false}],game:{tick:18,actors:[{slot:0,team:0,isBot:false,controllerId:'p1',x:260,y:260,hp:140}]},logs:[{seq:1,event:'start',message:'Match started'}]}},location.origin));
  await page.locator('#add-client').waitFor({state:'visible'});await assert.doesNotReject(()=>page.waitForFunction(()=>document.querySelector('#add-client')?.disabled===false));
  await page.locator('#server-tab').click();await page.locator('#inspector-panel summary').click();
  await page.locator('#inspector').getByText(/경기 중/).waitFor();
  await page.locator('#logs-panel summary').click();await page.locator('#logs').getByText(/Match started/).waitFor();
  await page.locator('.client-frame[data-client-id="client-2"]').waitFor({state:'attached'});
  const second=page.locator('.client-frame[data-client-id="client-2"]');await page.waitForFunction(()=>document.querySelector('.client-frame[data-client-id="client-2"]')?.src.includes('room=abcdef012345'));
  await page.locator('#new-world').click();await page.locator('.client-frame[data-client-id="client-3"]').waitFor({state:'attached'});
  const third=await page.locator('.client-frame[data-client-id="client-3"]').getAttribute('src');assert.ok(third.includes('embedded=1'));assert.ok(!third.includes('room='));
  await page.waitForFunction(()=>window.PlayForgeMultiplayer.worlds.length===2);
  assert.equal(await page.locator('#server-tab').count(),1);
  await page.screenshot({path:path.join(temporary,'workspace.png')});
 }finally{if(!page.isClosed())await page.close();}
});
