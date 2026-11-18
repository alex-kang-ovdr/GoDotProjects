// This is a logic-test environment, not a browser or layout engine.
// Default behavior stays compatible with the existing engine suites. Opt into
// eventful mode for parsed HTML elements and explicit event dispatch.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{performance}=require('node:perf_hooks');
function createRuntime(root,options={}){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const noop=()=>{},gradient={addColorStop:noop},eventful=options.eventful===true;
 const elements=new Map(),networkAttempts=[],downloads=[],revokedURLs=[],objectURLs=new Map(),timers=new Map(),animationFrames=new Map();
 let document,sandbox,sequence=0;
 const context2d=new Proxy({measureText:text=>({width:String(text).length*7}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,getImageData:()=>({data:new Uint8ClampedArray(4)}),setLineDash:noop},{get:(t,k)=>k in t?t[k]:noop,set:(t,k,v)=>(t[k]=v,true)});
 function blocked(api,url){networkAttempts.push({api,url:String(url??'')});throw Error('Network disabled in offline test: '+api);}
 function eventTarget(target){
  Object.defineProperty(target,'_listeners',{value:new Map()});
  target.addEventListener=(type,fn,opts={})=>{if(!eventful)return;const list=target._listeners.get(type)||[];list.push({fn,capture:typeof opts==='boolean'?opts:!!opts.capture,once:!!opts.once});target._listeners.set(type,list);};
  target.removeEventListener=(type,fn)=>{const list=target._listeners.get(type)||[];target._listeners.set(type,list.filter(v=>v.fn!==fn));};
  target.dispatchEvent=event=>dispatch(target,event);
  return target;
 }
 function dispatch(target,event){
  if(!event||typeof event.type!=='string')throw Error('An event type is required');
  const e={bubbles:true,cancelable:true,defaultPrevented:false,button:0,pointerId:1,repeat:false,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,...event};
  e.target??=target;e.preventDefault=()=>{if(e.cancelable)e.defaultPrevented=true;};e.stopPropagation=()=>e._stopped=true;e.stopImmediatePropagation=()=>{e._stopped=true;e._immediate=true;};e._promises=[];
  const chain=[target];let p=target.parentNode;while(p){chain.push(p);p=p.parentNode;}
  if(target!==sandbox){if(!chain.includes(document))chain.push(document);chain.push(sandbox);}
  function invoke(current,capture){e.currentTarget=current;const list=[...(current?._listeners?.get(e.type)||[])];for(const listener of list){if(listener.capture!==capture)continue;if(listener.once)current.removeEventListener(e.type,listener.fn);const result=listener.fn.call(current,e);if(result&&typeof result.then==='function')e._promises.push(result);if(e._immediate)break;}
   if(!capture&&!e._immediate&&typeof current?.['on'+e.type]==='function'){const result=current['on'+e.type].call(current,e);if(result&&typeof result.then==='function')e._promises.push(result);}}
  for(const current of [...chain].reverse()){invoke(current,true);if(e._stopped)break;}
  if(!e._stopped)for(const current of chain){invoke(current,false);if(e._stopped||!e.bubbles)break;}
  return e;
 }
 const decode=s=>String(s).replace(/&(?:quot|apos|amp|lt|gt|#39|#x27);/g,x=>({'&quot;':'"','&apos;':"'",'&amp;':'&','&lt;':'<','&gt;':'>','&#39;':"'",'&#x27;':"'"}[x]));
 function dataKey(name){return name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());}
 function unregister(e){for(const c of e.children||[])unregister(c);if(e.id&&elements.get('#'+e.id)===e)elements.delete('#'+e.id);}
 function simpleMatch(e,selector){
  let s=selector.trim();if(!s||!e.tagName)return false;
  if(s.includes(':disabled')){if(!e.disabled)return false;s=s.replace(':disabled','');}
  if(s.includes(':checked')){if(!e.checked)return false;s=s.replace(':checked','');}
  for(const a of [...s.matchAll(/\[([^\]=\s]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\]]+))?\]/g)]){const actual=e.getAttribute(a[1]);if(actual===null)return false;if(a[2]!==undefined&&actual!==decode(a[2].trim().replace(/^['"]|['"]$/g,'')))return false;}
  s=s.replace(/\[[^\]]+\]/g,'');const id=s.match(/#([\w-]+)/);if(id&&e.id!==id[1])return false;
  for(const c of s.matchAll(/\.([\w-]+)/g))if(!e.classList.contains(c[1]))return false;
  const tag=s.match(/^[\w-]+/);return !tag||e.tagName.toLowerCase()===tag[0].toLowerCase();
 }
 function match(e,selector){return selector.split(',').some(part=>{const parts=part.trim().split(/\s+(?![^\[]*\])/);let cur=e;if(!simpleMatch(cur,parts.pop()))return false;while(parts.length){const next=parts.pop();cur=cur.parentElement;while(cur&&!simpleMatch(cur,next))cur=cur.parentElement;if(!cur)return false;}return true;});}
 function descendants(e){const out=[];for(const c of e.children||[]){out.push(c,...descendants(c));}return out;}
 function createElement(tag='div'){
  const attrs={},classes=new Set(),e=eventTarget({tagName:tag.toUpperCase(),nodeName:tag.toUpperCase(),nodeType:1,parentNode:null,childNodes:[],dataset:{},style:{setProperty(k,v){this[k]=String(v);},removeProperty(k){delete this[k];}},value:'',checked:false,disabled:false,open:false,hidden:false,width:960,height:624,clientWidth:960,clientHeight:624,scrollWidth:960,scrollHeight:624});
  let content='';
  Object.defineProperties(e,{children:{get:()=>e.childNodes.filter(n=>typeof n!=='string')},parentElement:{get:()=>e.parentNode?.nodeType===1?e.parentNode:null},id:{get:()=>attrs.id||'',set:value=>{if(attrs.id)elements.delete('#'+attrs.id);attrs.id=String(value);if(value)elements.set('#'+value,e);}},className:{get:()=>[...classes].join(' '),set:value=>{classes.clear();String(value).split(/\s+/).filter(Boolean).forEach(c=>classes.add(c));attrs.class=String(value);}},textContent:{get:()=>e.childNodes.map(n=>typeof n==='string'?n:n.textContent).join(''),set:value=>{for(const c of e.children)unregister(c);e.childNodes=[String(value??'')];content=String(value??'');}},innerText:{get:()=>e.textContent,set:value=>{e.textContent=value;}},innerHTML:{get:()=>content,set:value=>{content=String(value??'');for(const c of e.children)unregister(c);e.childNodes=[];if(eventful)parseFragment(content,e);}},href:{get:()=>attrs.href||'',set:v=>{attrs.href=String(v);}},download:{get:()=>attrs.download||'',set:v=>{attrs.download=String(v);}}});
  e.classList={add(...names){names.forEach(c=>classes.add(c));},remove(...names){names.forEach(c=>classes.delete(c));},contains:c=>classes.has(c),toggle(c,force){const yes=force===undefined?!classes.has(c):!!force;if(yes)classes.add(c);else classes.delete(c);return yes;}};
  e.setAttribute=(name,value='')=>{attrs[name]=String(value);if(name==='id')e.id=value;if(name==='class')e.className=value;if(name.startsWith('data-'))e.dataset[dataKey(name.slice(5))]=String(value);if(['hidden','disabled','checked','open'].includes(name))e[name]=true;if(name==='value')e.value=String(value);if(name==='type')e.type=String(value);};
  e.getAttribute=name=>Object.hasOwn(attrs,name)?attrs[name]:name.startsWith('data-')&&Object.hasOwn(e.dataset,dataKey(name.slice(5)))?String(e.dataset[dataKey(name.slice(5))]):null;
  e.hasAttribute=name=>e.getAttribute(name)!==null;e.removeAttribute=name=>{delete attrs[name];if(['hidden','disabled','checked','open'].includes(name))e[name]=false;};
  e.appendChild=child=>{if(child.parentNode){const i=child.parentNode.childNodes.indexOf(child);if(i>=0)child.parentNode.childNodes.splice(i,1);}child.parentNode=e;e.childNodes.push(child);if(child.id)elements.set('#'+child.id,child);return child;};
  e.append=(...children)=>children.forEach(c=>typeof c==='string'?e.childNodes.push(c):e.appendChild(c));
  e.remove=()=>{if(e.parentNode){const i=e.parentNode.childNodes.indexOf(e);if(i>=0)e.parentNode.childNodes.splice(i,1);}unregister(e);e.parentNode=null;};
  e.replaceChildren=(...children)=>{e.innerHTML='';e.append(...children);};
  e.matches=selector=>match(e,selector);e.closest=selector=>{for(let c=e;c;c=c.parentElement)if(match(c,selector))return c;return null;};
  e.querySelectorAll=selector=>eventful?descendants(e).filter(c=>match(c,selector)):[];
  e.querySelector=selector=>eventful?e.querySelectorAll(selector)[0]||null:element((e.id?'#'+e.id:e.tagName)+' '+selector);
  e.getBoundingClientRect=()=>({left:0,top:0,width:960,height:624,right:960,bottom:624,x:0,y:0});
  e.getContext=kind=>{if(options.canvasContext)return options.canvasContext(kind,e,context2d);if(kind==='2d')return context2d;if(kind==='webgl'){if(options.webgl instanceof Error)throw options.webgl;return options.webgl||null;}return null;};
  e.showModal=()=>{e.open=true;};e.show=e.showModal;e.close=()=>{const was=e.open;e.open=false;if(was&&eventful)dispatch(e,{type:'close',bubbles:false});};
  e.focus=()=>{document.activeElement=e;};e.blur=()=>{if(document.activeElement===e)document.activeElement=document.body;};e.select=()=>{e.selectionStart=0;e.selectionEnd=e.value.length;};e.setSelectionRange=(a,b)=>{e.selectionStart=a;e.selectionEnd=b;};
  e.click=()=>{if(e.disabled)return;if(e.tagName==='A'&&e.href)downloads.push({href:e.href,name:e.download,blob:objectURLs.get(e.href)||null});if(eventful)return dispatch(e,{type:'click'});};
  e.insertAdjacentHTML=(where,text)=>{if(where!=='beforeend')throw Error('Unsupported test DOM insertion: '+where);content+=String(text);if(eventful)parseFragment(String(text),e);};
  e.setPointerCapture=noop;e.releasePointerCapture=noop;e.scrollIntoView=noop;
  return e;
 }
 function parseFragment(markup,parent){
  const stack=[parent],voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const token of String(markup).match(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+/g)||[]){if(token.startsWith('<!--'))continue;if(token.startsWith('</')){const name=token.match(/^<\/([\w-]+)/)?.[1]?.toLowerCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName.toLowerCase()===name){stack.length=i;break;}continue;}if(token.startsWith('<')){const m=token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);if(!m)continue;const e=createElement(m[1]);for(const a of m[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))e.setAttribute(a[1],decode(a[2]??a[3]??a[4]??''));stack.at(-1).appendChild(e);if(!voidTags.has(m[1].toLowerCase())&&!token.endsWith('/>'))stack.push(e);}else stack.at(-1).childNodes.push(decode(token));}
 }
 const rootElement=createElement('document-root');
 function element(selector){if(eventful)return document.querySelector(selector);if(!elements.has(selector)){const e=createElement(selector.startsWith('#')?'div':selector.match(/^[\w-]+/)?.[0]||'div');if(selector.startsWith('#'))e.id=selector.slice(1);elements.set(selector,e);}return elements.get(selector);}
 document=eventTarget({nodeType:9,hidden:false,activeElement:null,createElement,createTextNode:text=>String(text),execCommand:()=>false});
 document.querySelectorAll=selector=>eventful?descendants(rootElement).filter(c=>match(c,selector)):[];
 document.querySelector=selector=>eventful?document.querySelectorAll(selector)[0]||null:element(selector);document.getElementById=id=>eventful?elements.get('#'+id)||null:element('#'+id);
 Object.defineProperty(document,'visibilityState',{get:()=>document.hidden?'hidden':'visible'});
 if(eventful){parseFragment(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''),rootElement);document.body=document.querySelector('body');document.head=document.querySelector('head');document.documentElement=document.querySelector('html');}else{document.body=element('body');document.head=element('head');document.documentElement=element('html');}
 document.activeElement=document.body;
 class TestURL extends URL{static createObjectURL(blob){if(options.downloadError)throw options.downloadError;const url='blob:test-'+(++sequence);objectURLs.set(url,blob);return url;}static revokeObjectURL(url){revokedURLs.push(url);objectURLs.delete(url);}}
 const defaultStorage={getItem(){throw Error('No browser origin in Node test double');},setItem(){throw Error('No browser origin in Node test double');},removeItem(){throw Error('No browser origin in Node test double');}};
 sandbox=eventTarget({console:options.console||console,performance,document,Blob,URL:eventful?TestURL:URL,TextEncoder,TextDecoder,Uint8Array,Uint8ClampedArray,Int32Array,Float32Array,Date,Math,JSON,Map,Set,innerWidth:1440,innerHeight:1050,isSecureContext:false,location:{protocol:'file:',origin:'null',href:'file:///test/index.html'},navigator:{userAgent:'Node VM offline logic test',onLine:false,sendBeacon:(url)=>blocked('sendBeacon',url),serviceWorker:{register:url=>blocked('serviceWorker',url)}}});
 Object.defineProperty(sandbox,'localStorage',{configurable:true,get:options.storageGetter||(()=>options.storage||defaultStorage)});
 sandbox.window=sandbox;sandbox.self=sandbox;sandbox.globalThis=sandbox;sandbox.__DD_TEST__=true;sandbox.__DD_CONTROLLED__=options.controlled!==false;sandbox.__DD_MANUAL_RENDER__=options.manualRender!==false;
 sandbox.requestAnimationFrame=callback=>{if(!options.scheduleFrames)return 0;const id=++sequence;animationFrames.set(id,callback);return id;};sandbox.cancelAnimationFrame=id=>animationFrames.delete(id);
 sandbox.setTimeout=(callback,delay=0)=>{if(!eventful)return 0;const id=++sequence;timers.set(id,{callback,delay});return id;};sandbox.clearTimeout=id=>timers.delete(id);sandbox.setInterval=noop;sandbox.clearInterval=noop;
 sandbox.fetch=url=>blocked('fetch',url);sandbox.XMLHttpRequest=class{constructor(){blocked('XMLHttpRequest','');}};sandbox.WebSocket=class{constructor(url){blocked('WebSocket',url);}};sandbox.EventSource=class{constructor(url){blocked('EventSource',url);}};sandbox.Worker=class{constructor(url){blocked('Worker',url);}};
 sandbox.Event=class{constructor(type,props={}){this.type=type;Object.assign(this,props);}};sandbox.CustomEvent=sandbox.Event;
 sandbox.getComputedStyle=e=>({display:e.hidden?'none':e.style.display||'block'});
 if(options.beforeBoot)options.beforeBoot(sandbox);
 vm.createContext(sandbox);for(const script of [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]))vm.runInContext(script,sandbox,{timeout:60000});
 function target(which){if(which==='window')return sandbox;if(which==='document')return document;return typeof which==='string'?element(which):which;}
 return {sandbox,html,elements,element,networkAttempts,downloads,revokedURLs,objectURLs,timers,run:(code,timeout=180000)=>vm.runInContext(code,sandbox,{timeout}),dispatch:(which,type,props={})=>dispatch(target(which),{type,...props}),async dispatchAsync(which,type,props={}){const e=dispatch(target(which),{type,...props});await Promise.all(e._promises);return e;},flushTimers(maxDelay=Infinity){const due=[...timers].filter(([,t])=>t.delay<=maxDelay);for(const [id,t]of due){timers.delete(id);t.callback();}return due.length;},advanceFrames(count=1,ms=16.67){for(let n=0;n<count;n++){const callbacks=[...animationFrames.values()];animationFrames.clear();for(const cb of callbacks)cb((n+1)*ms);}}};
}
function memoryStorage(initial={},hooks={}){
 const values=new Map(Object.entries(initial)),calls=[];
 const storage={getItem(key){calls.push({op:'get',key});hooks.get?.(key);return values.has(key)?values.get(key):null;},setItem(key,value){calls.push({op:'set',key,value:String(value)});hooks.set?.(key,String(value));values.set(key,String(value));},removeItem(key){calls.push({op:'remove',key});hooks.remove?.(key);values.delete(key);},clear(){calls.push({op:'clear'});values.clear();},key:index=>[...values.keys()][index]??null,get length(){return values.size;}};
 return {storage,values,calls,hooks};
}
module.exports={createRuntime,memoryStorage};
