'use strict';
// Exercises the embedded JS with a small DOM harness. This is NOT browser rendering.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements=new Map();let downloaded=null,lastBlob=null;
class Element{
 constructor(id){this.id=id;this.value='';this.textContent='';this._html='';this.handlers={};this.dataset={};this.classList={toggle(){}};}
 addEventListener(type,fn){this.handlers[type]=fn;}
 set innerHTML(value){this._html=value;if(this.id==='kind'||this.id==='category')this.value='';}
 get innerHTML(){return this._html;}
 querySelectorAll(selector){if(selector!=='button')return[];return [...this._html.matchAll(/<button[^>]*data-id="([^"]+)"/g)].map(m=>{let e=new Element();e.dataset.id=m[1];return e;});}
 click(){if(this.id==='anchor')downloaded={filename:this.download,href:this.href};else this.handlers.click?.();}
}
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
const nav=[...html.matchAll(/<button[^>]*data-set="([^"]+)"/g)].map(m=>{let e=new Element();e.dataset.set=m[1];return e;});
const document={getElementById:get,querySelectorAll:s=>s==='nav button'?nav:[],createElement:()=>new Element('anchor')};
const context=vm.createContext({document,Blob,URL:{createObjectURL:b=>(lastBlob=b,'blob:test'),revokeObjectURL(){}},setTimeout(){}});
new vm.Script(script+'\nglobalThis.testApi={DATA,state,init,renderList,renderDetail,current};').runInContext(context,{timeout:3000});
const api=context.testApi,checks=[];
function test(name,fn){fn();checks.push(name);}
test('original counts',()=>{assert.equal(get('stat-records').textContent,'219');assert.equal(get('stat-values').textContent,'1,655');assert.equal(get('stat-null').textContent,'452');});
test('restored field search',()=>{get('search').value='nuclear_missile_factory';get('search').handlers.input();assert.equal(get('list').querySelectorAll('button').length,1);assert.match(get('detail').innerHTML,/25000/);});
test('current v4 dataset',()=>{nav.find(b=>b.dataset.set==='prototype').click();assert.equal(get('stat-records').textContent,'29');assert.match(get('scope').textContent,/starforge_v4/);});
test('current factory row',()=>{get('search').value='ammo_factory';get('search').handlers.input();assert.match(get('detail').innerHTML,/420/);});
test('download current filename',()=>{get('download').click();assert.equal(downloaded.filename,'starforge_v4.json');});
const downloadPromise=lastBlob.text();
test('historical dataset',()=>{nav.find(b=>b.dataset.set==='historical').click();assert.equal(get('stat-records').textContent,'109');assert.match(get('scope').textContent,/starforge_v3/);});
test('resource filter',()=>{nav.find(b=>b.dataset.set==='original').click();get('kind').value='resource';get('kind').handlers.change();assert.equal(get('list').querySelectorAll('button').length,22);});
test('empty search result',()=>{get('search').value='<img onerror=test>';get('search').handlers.input();assert.equal(get('list').querySelectorAll('button').length,0);assert.doesNotMatch(get('detail').innerHTML,/<img/);});
test('all record detail generation',()=>{get('search').value='';get('kind').value='';api.renderList();for(const r of api.DATA.original.records){api.state.selected=r.id;api.renderDetail();assert.match(get('detail').innerHTML,new RegExp(r.id));assert.doesNotMatch(get('detail').innerHTML,/<script/);}});
(async()=>{assert.deepEqual(JSON.parse(await downloadPromise),JSON.parse(fs.readFileSync(path.join(root,'data/starforge_v4.json'),'utf8')));checks.push('download payload equality');
const result={status:'logic_passed_browser_unverified',logic_checks:checks,actual_browser_render:false,browser_attempt:'System Chromium launch failed: process_singleton_posix socket() Operation not permitted. Bundled Playwright browser also unavailable.',scope:'Node VM DOM harness checks data selection, search, filter, detail generation and JSON payload. CSS layout, screenshots and real browser click behavior remain unverified.'};
fs.writeFileSync(path.join(root,'docs/viewer_validation.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,logic_checks:checks.length,actual_browser_render:false}));})();
