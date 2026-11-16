/** Minimal DOM event double for executing the real app.js, not a browser/layout test. */
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import * as engine from '../dist/engine.js';

const decode=text=>String(text).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const dataKey=name=>name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
const voidTags=new Set(['AREA','BASE','BR','COL','EMBED','HR','IMG','INPUT','LINK','META','PARAM','SOURCE','TRACK','WBR']);

class MiniNode {
  constructor(tag='div',doc=null){
    this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.parentElement=null;
    this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};
    this.className='';this.scrollTop=0;this.value='';this.textContent='';this.hidden=false;
    this.disabled=false;this.open=false;this.files=[];this._source='';
    this.classList={
      contains:name=>this.className.split(/\s+/).includes(name),
      add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...names])].join(' ');},
      remove:(...names)=>{this.className=this.className.split(/\s+/).filter(n=>!names.includes(n)).join(' ');},
      toggle:(name,on)=>{const value=on===undefined?!this.classList.contains(name):on;value?this.classList.add(name):this.classList.remove(name);return value;}
    };
  }
  get id(){return this.attributes.id||'';}
  set id(v){this.attributes.id=String(v);}
  get firstElementChild(){return this.children[0]||null;}
  get innerHTML(){return this._source;}
  set innerHTML(html){
    if(this.contains(this.ownerDocument?.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;
    for(const child of this.children)child.parentElement=null;
    this.children=[];this._source=String(html);parseInto(this,this._source,this.ownerDocument);
  }
  setAttribute(name,value){
    this.attributes[name]=String(value);
    if(name==='class')this.className=String(value);
    if(name.startsWith('data-'))this.dataset[dataKey(name)]=String(value);
    if(name==='value')this.value=String(value);
    if(['disabled','hidden','checked'].includes(name))this[name]=true;
  }
  getAttribute(name){return this.attributes[name]??null;}
  removeAttribute(name){delete this.attributes[name];if(['disabled','hidden','checked'].includes(name))this[name]=false;}
  append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node);}}
  appendChild(node){this.append(node);return node;}
  remove(){if(this.parentElement){this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}}
  contains(node){for(let p=node;p;p=p.parentElement)if(p===this)return true;return false;}
  matches(selector){return matches(this,selector);}
  closest(selector){for(let p=this;p;p=p.parentElement)if(p.matches(selector))return p;return null;}
  querySelectorAll(selector){const out=[];const walk=node=>{for(const child of node.children){if(child.matches(selector))out.push(child);walk(child);}};walk(this);return out;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  focus(){if(!this.disabled)this.ownerDocument.activeElement=this;}
  click(){if(!this.disabled){this.focus();this.onclick?.({target:this});this.ownerDocument.emit('click',this);}}
  showModal(){this.open=true;}
  close(){this.open=false;}
  getBoundingClientRect(){return {left:0,top:0,width:900,height:640,right:900,bottom:640};}
  setPointerCapture(){}
  releasePointerCapture(){}
  hasPointerCapture(){return true;}
}

function matches(node,selector){
  if(selector.includes(','))return selector.split(',').some(s=>matches(node,s.trim()));
  const segments=selector.trim().split(/\s+/);
  if(segments.length>1){const last=segments.pop();if(!matches(node,last))return false;for(let p=node.parentElement;p;p=p.parentElement)if(matches(p,segments.join(' ')))return true;return false;}
  let s=selector;
  for(const pseudo of ['checked','disabled'])if(s.includes(':'+pseudo)){if(!node[pseudo])return false;s=s.replace(':'+pseudo,'');}
  const attrs=[...s.matchAll(/\[([^=\]]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
  for(const [,name,value]of attrs){const actual=name.startsWith('data-')?node.dataset[dataKey(name)]:node.getAttribute(name);if(actual===null||actual===undefined||value!==undefined&&actual!==value)return false;}
  s=s.replace(/\[[^\]]+\]/g,'');
  const id=s.match(/#([\w-]+)/)?.[1];if(id&&node.id!==id)return false;
  for(const [,cls]of s.matchAll(/\.([\w-]+)/g))if(!node.classList.contains(cls))return false;
  const tag=s.match(/^[\w-]+/)?.[0];return !tag||node.tagName===tag.toUpperCase();
}

function parseInto(parent,html,doc){
  const stack=[parent];let previous=0;
  for(const match of html.matchAll(/<\/?([A-Za-z][\w:-]*)([^>]*?)>/g)){
    const current=stack.at(-1);current.textContent+=decode(html.slice(previous,match.index).replace(/<[^>]*>/g,''));
    previous=match.index+match[0].length;
    if(match[0].startsWith('</')){const tag=match[1].toUpperCase();for(let i=stack.length-1;i>0;i--)if(stack[i].tagName===tag){stack.length=i;break;}continue;}
    const node=new MiniNode(match[1],doc);
    for(const attr of match[2].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g))node.setAttribute(attr[1],decode(attr[2]??attr[3]??attr[4]??''));
    current.append(node);if(!voidTags.has(node.tagName)&&!match[0].endsWith('/>'))stack.push(node);
  }
}

class MiniDocument extends MiniNode {
  constructor(html){super('document');this.ownerDocument=this;this.activeElement=null;this.visibilityState='visible';parseInto(this,html,this);this.body=this.querySelector('body');this.activeElement=this.body;}
  createElement(tag){return new MiniNode(tag,this);}
  emit(type,target,extra={}){
    const event={target,key:'',preventDefault(){},stopPropagation(){},...extra};
    for(let node=target;node;node=node.parentElement)for(const callback of node.listeners[type]||[])callback(event);
    return event;
  }
}

export function appHarness(game=new engine.ColonyGame({seed:314159,difficulty:'standard'}),saved={}){
  const document=new MiniDocument(fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'));
  const memory=new Map(Object.entries(saved)),windowListeners={};
  const renderer={focus(){},fit(){},zoomAt(){},render(){},setGame(){},pan(){},resize(){},screenToTile(){return {x:22,y:15};}};
  const context=vm.createContext({
    ...engine,document,console,crypto:webcrypto,performance:{now:()=>0},
    window:{innerWidth:1440,innerHeight:900,devicePixelRatio:1,addEventListener(type,fn){(windowListeners[type]??=[]).push(fn);}},
    localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,requestAnimationFrame:()=>0,ResizeObserver:class{observe(){}disconnect(){}},
    Blob,URL:{createObjectURL:()=> 'blob:ui-test',revokeObjectURL(){}},
    __game:game,__renderer:renderer,ColonyRenderer:class{constructor(){return renderer;}}
  });
  const raw=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
  const source=raw.slice(0,raw.indexOf('try{boot();}')).replace(/^import .*;\n/gm,'');
  vm.runInContext(source+`\ngame=__game;renderer=__renderer;bindUI();globalThis.api={ui,renderUI,renderSidebar,setPane,action,setSpeed,saveGame,readSave,replaceGame,gearCount,getGame:()=>game,makeSave};`,context,{filename:'app.js'});
  const api=context.api;
  const select=selector=>{const node=document.querySelector(selector);if(!node)throw new Error('Missing UI node '+selector);return node;};
  return {api,document,memory,context,renderer,select,click(selector){select(selector).click();},change(selector,value){const node=select(selector);node.value=String(value);document.emit('change',node);},key(key,extra={}){document.emit('keydown',document.body,{key,...extra});}};
}
