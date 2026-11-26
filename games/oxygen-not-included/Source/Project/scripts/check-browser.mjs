// Run against the exported page with Node 22+ and an installed Chromium browser.
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

const url=process.argv[2]||'http://127.0.0.1:4180/';
const browser=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const profile=await mkdtemp(join(tmpdir(),'breath-browser-'));
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--disable-extensions','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try{
  let port;
  for(let i=0;i<100&&!port;i++){
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{await delay(100);}
  }
  assert.ok(port,'Chromium DevTools ready');
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(v=>v.type==='page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let next=1;
  const tasks=new Map(),errors=[];
  socket.onmessage=event=>{
    const m=JSON.parse(event.data);
    if(m.id&&tasks.has(m.id)){tasks.get(m.id)(m);tasks.delete(m.id);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  };
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=next++,timer=setTimeout(()=>{tasks.delete(id);reject(Error(method+' timed out'));},10000);
    tasks.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result);});
    socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  const click=selector=>evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
  async function inspectWorldCell(x,y){
    const point=await evaluate(`(()=>{const {renderer}=window.colony;renderer.centerOn(${x}+.5,${y}+.5);const rect=renderer.canvas.getBoundingClientRect();return {x:rect.left+renderer.offsetX+(${x}+.5)*renderer.cellSize,y:rect.top+renderer.offsetY+(${y}+.5)*renderer.cellSize};})()`);
    await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  }
  await call('Runtime.enable');await call('Page.enable');
  for(const [width,height,mobile] of [[1365,850,false],[390,844,true]]){
    await call('Emulation.setDeviceMetricsOverride',{width,height,mobile,deviceScaleFactor:mobile?2:1});
    await call('Page.navigate',{url});
    for(let i=0;i<100;i++){await delay(60);if(await evaluate("document.readyState==='complete' && !!document.querySelector('.build-card')"))break;}
    assert.deepEqual(errors,[]);
    await click('#new-button');
    assert.equal(await evaluate("document.querySelector('#ruleset-input').value"),'oni-4.4');
    await click('#confirm-new');
    await click('[data-category="space"]');
    assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('.build-card'),e=>e.dataset.build)"),['steamRocket','researchModule','commandModule']);
    await click('[data-overlay="gas"]');
    await click('#step-atmosphere');
    const firstTick=await evaluate('window.colony.game.time');
    await click('#step-atmosphere');
    const secondTick=await evaluate('window.colony.game.time');
    assert.ok(Math.abs(secondTick-firstTick-.2)<1e-8);
    assert.match(await evaluate("document.querySelector('#gas-tick-reading').textContent"),/틱/);
    await click('#compare-atmosphere');
    assert.equal(await evaluate("document.querySelector('#gas-compare-dialog').open"),true);
    await evaluate("(()=>{const s=document.querySelector('#gas-frame');s.value=0;s.dispatchEvent(new Event('input'));})()");
    assert.match(await evaluate("document.querySelector('#gas-difference').textContent"),/최대 질량 차이 0 g/);
    await evaluate("(()=>{const s=document.querySelector('#gas-frame');s.value=s.max;s.dispatchEvent(new Event('input'));})()");
    assert.ok(await evaluate("document.querySelectorAll('#gas-observations tr').length>=2"));
    await click('[data-close-dialog="gas-compare-dialog"]');
    await click('[data-overlay="normal"]');
    await click('#dismiss-onboarding');
    await evaluate(`(()=>{const g=window.colony.game;for(let y=0;y<=20;y++)for(let x=37;x<=43;x++)Object.assign(g.cell(x,y),{solid:null,water:0,frost:0,revealed:true});const engine=g._addBuilding('steamRocket',37,20);engine.steamFuel=g.getRocketState(engine.id).fuelCapacityKg;g._addBuilding('researchModule',38,15);g._addBuilding('commandModule',38,10);g.cell(37,11).solid='tile';Object.assign(g.crew[0],{x:37.5,y:10.5,skillPoints:1});})()`);
    await inspectWorldCell(40,18);
    assert.equal(await evaluate("document.querySelector('[data-rocket-launch]')?.disabled"),true);
    await evaluate("(()=>{const s=document.querySelector('[data-rocket-distance]');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
    assert.equal(await evaluate("(()=>{const g=window.colony.game;return g.getRocketState(g.buildings.find(b=>b.type==='steamRocket').id).targetId;})()"),1);
    await click('[data-rocket-certify]');
    await click('[data-rocket-assign]');
    assert.equal(await evaluate("document.querySelector('[data-rocket-launch]').disabled"),true);
    await evaluate("window.colony.game.step(.2)");
    for(let i=0;i<20&&await evaluate("document.querySelector('[data-rocket-launch]').disabled");i++)await delay(50);
    assert.equal(await evaluate("document.querySelector('[data-rocket-launch]').disabled"),false);
    await click('[data-rocket-launch]');
    assert.ok(await evaluate("(()=>{const g=window.colony.game;return g.getRocketState(g.buildings.find(b=>b.type==='steamRocket').id).returnAt>g.time;})()"));
    await click('[data-panel="research"]');
    assert.equal(await evaluate("document.querySelectorAll('[data-research-tech]').length"),86);
    await click('#open-research-tree');
    assert.equal(await evaluate("document.querySelector('#research-dialog').open"),true);
    await click('[data-research-tech="GasPiping"]');
    assert.equal(await evaluate("document.querySelector('[data-research-tech=\"GasPiping\"]').classList.contains('selected')"),true);
    await evaluate("(()=>{const e=document.querySelector('[data-research-search]');e.value='GasPiping';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    assert.ok(await evaluate("document.querySelectorAll('[data-research-tech][hidden]').length>0"));
    assert.equal(await evaluate("document.querySelector('[data-research-tech=\"GasPiping\"]').hidden"),false);
    await click('[data-research-clear]');
    assert.equal(await evaluate("window.colony.game.researchProgress.selected"),null);
    await click('#close-research-tree');
    await click('[data-category="plumbing"]');
    assert.equal(await evaluate("document.querySelector('[data-build=\"wastepipe\"]')===null"),true);
    assert.equal(await evaluate("!!document.querySelector('[data-build=\"liquidBridge\"]')"),true);
    await click('#new-button');await evaluate("document.querySelector('#ruleset-input').value='oni-base'");await click('#confirm-new');
    await click('[data-category="plumbing"]');
    assert.equal(await evaluate("!!document.querySelector('[data-build=\"wastepipe\"]')"),true);
    assert.equal(await evaluate("document.querySelector('[data-build=\"liquidBridge\"]')===null"),true);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,height,mobile,modularBuildMenu:true,launchViaInspector:true,gasStepSeconds:.2,researchTechnologies:86,search:true,legacySwitch:true,exceptions:errors.length}));
  }
  await call('Browser.close').catch(()=>{});
}finally{socket?.close();child.kill();}
