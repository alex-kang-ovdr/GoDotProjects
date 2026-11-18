/* Limited Node fixture for UI event integration. Not a browser or layout engine.
 * Parses the project's HTML, models its used DOM/event subset, and stubs canvas.
 * It must not be used to claim pixel, accessibility-tree, or device validation.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const decode=s=>String(s).replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g,(_,s)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",'#x27':"'",nbsp:' '})[s]);
const dataKey=s=>s.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
class Element {
 constructor(tag,attrs={}){this.tagName=tag.toUpperCase();this.attrs={...attrs};this.children=[];this.parentElement=null;this.listeners={};this.style={};this.dataset={};this._text='';this._html='';this._value=attrs.value;this.clientWidth=960;this.width=Number(attrs.width)||960;this.height=Number(attrs.height)||600;for(const k of Object.keys(attrs))if(k.startsWith('data-'))this.dataset[dataKey(k)]=attrs[k];const self=this;this.classList={contains:k=>self.classes().includes(k),add:(...ks)=>self.setClasses([...new Set([...self.classes(),...ks])]),remove:(...ks)=>self.setClasses(self.classes().filter(k=>!ks.includes(k))),toggle:(k,force)=>{const yes=force===undefined?!self.classes().includes(k):!!force;yes?self.classList.add(k):self.classList.remove(k);return yes;}};}
 classes(){return (this.attrs.class||'').split(/\s+/).filter(Boolean);}
 setClasses(c){this.attrs.class=c.join(' ');}
 get id(){return this.attrs.id||'';}
 get type(){return this.attrs.type||'';}
 get textContent(){return this.tagName==='#TEXT'?this._text:this.children.map(c=>c.textContent).join('');}
 set textContent(v){this._html='';this.children=[];const n=new Element('#text');n._text=String(v);n.parentElement=this;this.children.push(n);}
 get innerHTML(){return this._html;}
 set innerHTML(v){this._html=String(v);this.children=[];parse(this._html,this);}
 get value(){if(this.tagName==='SELECT')return (this.options.find(x=>x.selected)||this.options[0])?.value||'';return String(this._value??this.attrs.value??'');}
 set value(v){this._value=String(v);if(this.tagName==='SELECT'){let found=false;for(const o of this.options){o.selected=!found&&o.value===String(v);if(o.selected)found=true;}}}
 get options(){return this.children.filter(x=>x.tagName==='OPTION');}
 get selectedOptions(){return this.options.filter(x=>x.selected);}
 get isContentEditable(){return this.attrs.contenteditable==='true';}
 getAttribute(k){return this.attrs[k]??null;}
 setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[dataKey(k)]=String(v);}
 removeAttribute(k){delete this.attrs[k];}
 hasAttribute(k){return k in this.attrs;}
 appendChild(n){n.parentElement=this;this.children.push(n);return n;}
 replaceChildren(...ns){this.children=[];for(const n of ns)this.appendChild(n);}
 matches(sel){return sel.split(',').some(s=>match(this,s.trim()));}
 closest(sel){for(let e=this;e;e=e.parentElement)if(e.matches(sel))return e;return null;}
 querySelectorAll(sel){return descendants(this).filter(n=>n.matches(sel));}
 querySelector(sel){return this.querySelectorAll(sel)[0]||null;}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
 dispatchEvent(event){event.target??=this;event.currentTarget=this;event.preventDefault??=function(){this.defaultPrevented=true;};event.stopPropagation??=function(){this.cancelBubble=true;};this['on'+event.type]?.(event);for(const fn of this.listeners[event.type]||[])fn(event);if(event.bubbles&&!event.cancelBubble&&this.parentElement)this.parentElement.dispatchEvent(event);return !event.defaultPrevented;}
 click(){if(!this.disabled)this.dispatchEvent({type:'click',bubbles:true,target:this});}
 showModal(){this.open=true;}
 close(){this.open=false;}
 focus(){}
 setPointerCapture(){}
 getBoundingClientRect(){return {left:0,top:0,x:0,y:0,width:960,height:600};}
 getContext(type){if(type!=='2d')return null;return new Proxy({measureText:t=>({width:String(t).length*6})},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}
}
for(const k of ['disabled','hidden','checked','selected','open'])Object.defineProperty(Element.prototype,k,{get(){return this.hasAttribute(k);},set(v){v?this.attrs[k]='':delete this.attrs[k];}});
function descendants(root){const out=[];for(const n of root.children){out.push(n,...descendants(n));}return out;}
function match(n,s){if(n.tagName==='#TEXT')return false;for(const m of s.matchAll(/:not\(([^)]+)\)/g))if(match(n,m[1]))return false;s=s.replace(/:not\([^)]+\)/g,'');const tag=s.match(/^[a-z][\w-]*/i);if(tag&&n.tagName!==tag[0].toUpperCase())return false;for(const m of s.matchAll(/#([\w-]+)/g))if(n.id!==m[1])return false;for(const m of s.matchAll(/\.([\w-]+)/g))if(!n.classList.contains(m[1]))return false;for(const m of s.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)){if(!n.hasAttribute(m[1]))return false;if(m[2]!==undefined&&n.getAttribute(m[1])!==m[2])return false;}return true;}
function parse(html,parent){const stack=[parent];for(const m of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/g)){const token=m[0];if(token.startsWith('<!'))continue;if(token.startsWith('</')){const tag=token.slice(2).match(/^[\w-]+/)[0].toUpperCase();while(stack.length>1){if(stack.pop().tagName===tag)break;}continue;}if(token.startsWith('<')){const tag=token.slice(1).match(/^[\w-]+/)[0],attrs={};const body=token.slice(tag.length+1,-1);for(const a of body.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attrs[a[1]]=decode(a[2]??a[3]??a[4]??'');const node=new Element(tag,attrs);stack.at(-1).appendChild(node);if(!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag)&&!token.endsWith('/>'))stack.push(node);}else{const n=new Element('#text');n._text=decode(token);stack.at(-1).appendChild(n);}}}
function createFixture(root,initialStorage={}){
 const document=new Element('document');parse(fs.readFileSync(path.join(root,'src/layout.html'),'utf8'),document);document.body=document.querySelector('body');document.getElementById=id=>descendants(document).find(x=>x.id===id)||null;document.createElement=tag=>new Element(tag);
 const store=new Map(Object.entries(initialStorage)),storageCalls=[],errors=[],listeners={},frames=[];let now=0;
 const localStorage={getItem(k){storageCalls.push(['get',k]);return store.get(k)??null;},setItem(k,v){storageCalls.push(['set',k]);store.set(k,String(v));},removeItem(k){store.delete(k);}};
 const context={document,localStorage,performance:{now:()=>now},console:{log(){},warn(){},error:e=>errors.push(String(e))},devicePixelRatio:1,requestAnimationFrame:fn=>(frames.push(fn),frames.length),setTimeout:()=>1,clearTimeout(){},confirm:()=>true,Blob,URL:{createObjectURL:()=> 'blob:mock',revokeObjectURL(){}},addEventListener:(type,fn)=>(listeners[type]??=[]).push(fn)};context.window=context;
 vm.createContext(context);for(const file of ['source-data.js','engine.js','renderer.js','ui.js'])vm.runInContext(fs.readFileSync(path.join(root,'src',file),'utf8'),context,{filename:file});
 const api=context.FQ22||context.FQ21;
 const refresh=()=>api.refresh();
 const dispatch=(type,extra={})=>{const e={type,target:document.body,repeat:false,ctrlKey:false,metaKey:false,shiftKey:false,preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of listeners[type]||[])fn(e);refresh();return e;};
 const key=(code,target=document.body,extra={})=>{const e=dispatch('keydown',{code,target,...extra});dispatch('keyup',{code,target});return e;};
 const click=id=>{document.getElementById(id).click();refresh();};
 const pointer=(x,y,extra={})=>{const stage=document.getElementById('stage'),ev={pointerId:1,clientX:x,clientY:y,button:0,shiftKey:false,...extra};stage.dispatchEvent({type:'pointerdown',...ev});stage.dispatchEvent({type:'pointerup',...ev});refresh();};
 const frame=(ms=17)=>{now+=ms;const fn=frames.shift();if(fn)fn(now);};
 return {document,context,api,store,storageCalls,errors,dispatch,key,click,pointer,frame,refresh,$:id=>document.getElementById(id)};
}
module.exports={createFixture,Element};
