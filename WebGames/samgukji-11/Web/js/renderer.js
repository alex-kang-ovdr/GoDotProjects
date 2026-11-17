/* 3D tactical atlas. Public surface intentionally matches the v1 renderer.
 * Game state lives exclusively in Engine; animation never changes game RNG.
 */
(function(root){
'use strict';
const {MAP,DATA:D,distance,neighbors,clamp,key}=root.RTK;
const {M,V,Geometry:G,GLRenderer,color}=root.RTKGL;
const R=2.65,SQ=Math.sqrt(3),PALETTE={plain:'#819263',forest:'#4c6849',hill:'#939075',mountain:'#8c8b7b',water:'#416f78',ford:'#9eaa8b'};
const h=(q,r,s=0)=>{let x=Math.imul(Math.floor(q*17)+381,1274126177)^Math.imul(Math.floor(r*19)+47,668265263)^s;return((x^(x>>>13))>>>0)/4294967296;};
const pos=p=>({x:SQ*R*(p.q+(p.r%2)/2),z:1.5*R*p.r});
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function roundHex(x,z){let q=SQ/3*x/R-z/(3*R),r=2*z/(3*R),y=-q-r,rx=Math.round(q),ry=Math.round(y),rz=Math.round(r),dx=Math.abs(rx-q),dy=Math.abs(ry-y),dz=Math.abs(rz-r);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;return {q:rx+Math.floor(rz/2),r:rz};}
function pushInstance(a,m,c){for(const n of m)a.push(n);a.push(...color(c));}
function lineQuad(g,a,b,w,c,height){const d=V.norm([b.x-a.x,0,b.z-a.z]),ox=-d[2]*w/2,oz=d[0]*w/2;const v=(p,s)=>[p.x+ox*s,height(p.x+ox*s,p.z+oz*s)+.035,p.z+oz*s];g.quad(v(a,-1),v(a,1),v(b,1),v(b,-1),c);}
class Renderer3D{
 constructor(canvas,mini,getState,options={}){
  canvas.__rtkRenderer=this;this.active=false;this.disposed=false;this.frame=0;this.drawCount=0;
  this.canvas=canvas;this.mini=mini;this.mc=mini.getContext('2d');this.getState=getState;this.gpu=new GLRenderer(canvas);this.is3D=true;
  this.worldW=SQ*R*(MAP.cols+.5);this.worldH=1.5*R*(MAP.rows-1)+R*2;
  this.camera={x:this.worldW/2,y:this.worldH/2,zoom:1,yaw:.28,pitch:.84};this.grid=false;this.selection=null;this.hover=null;this.mode='move';this.reach=new Map();this.fx=[];this.moves=new Map();this.ghosts=[];this.unitCache=new Map();this.needs=true;this.quality=innerWidth<700?'low':'medium';this.sound=false;this.cinematic=false;this.followBattle=true;this.last=0;this.lastFrame=0;this.fps=0;this.frameCount=0;this.fpsTime=0;this.heightCache=new Map();this.surfaceCache=new Map();this.headings=new Map();this.staticBatches=[];this.cityBatches=[];this.dynamicBatches=new Map();this.geo={};this.dataBuffers=new Map();this.lastCitySignature='';this.selectionRing=new G();this.stats={};
  this.overlay=document.createElement('canvas');this.overlay.id='world-labels';this.overlay.setAttribute('aria-hidden','true');canvas.after(this.overlay);this.ctx=this.overlay.getContext('2d');
  this.baseHeights=MAP.tiles.map(t=>{let v={plain:.22,forest:.38,hill:1.35,mountain:5.3,water:-1.05,ford:-.12}[t.terrain];v+=t.terrain==='mountain'?h(t.q,t.r)*4.4:t.terrain==='hill'?h(t.q,t.r)*1.2:h(t.q,t.r)*.25;if(t.road&&t.terrain!=='water'&&t.terrain!=='ford')v=Math.min(v,.58);if(D.cities.some(c=>distance(c,t)<2))v=.3;return v;});
  for(const [name,g]of Object.entries({box:G.cube(),cylinder:G.cylinder(8),cone:G.cylinder(7,0),taper:G.cylinder(8,.36),sphere:G.sphere(),foliage:G.sphere(4,6),roof:G.roof(),ring:G.ring(.94,1),hexring:G.ring(.985,1,6),flag:G.flag()}))this.geo[name]=this.gpu.geometry(g);
  this.buildTerrain();this.buildVegetation();this.buildGrid();this.paintMini();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
  this.contextLostHandler=()=>{this.setActive(false);this.onError?.(new Error('GPU 연결이 중단되었습니다.'));};
  canvas.addEventListener('webglcontextlost',this.contextLostHandler);
  this.loop=t=>{this.frame=0;if(!this.active||this.disposed)return;this.frame=requestAnimationFrame(this.loop);if(document.hidden)return;if(t-this.last<(this.quality==='low'?40:30))return;this.last=t;try{this.draw(t);}catch(err){this.drawError=String(err);this.setActive(false);if(this.onError)this.onError(err);else console.error(err);}};
  if(options.autoStart!==false)this.setActive(true);
 }
 setActive(value){if(this.disposed)return;this.active=!!value;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.canvas.hidden=!this.active;if(this.overlay)this.overlay.hidden=!this.active;if(this.active){this.resize();this.needs=true;this.last=0;this.frame=requestAnimationFrame(this.loop);}}
 dispose(){if(this.disposed)return;this.setActive(false);this.disposed=true;this.observer?.disconnect();this.canvas?.removeEventListener('webglcontextlost',this.contextLostHandler);this.gpu?.dispose();this.overlay?.remove();}
 tile(p){return p&&p.q>=0&&p.r>=0&&p.q<MAP.cols&&p.r<MAP.rows?MAP.tiles[p.r*MAP.cols+p.q]:null;}
 heightAt(x,z){let total=0,sum=0;const row=Math.floor(z/(1.5*R));for(let r=row-1;r<=row+1;r++){const col=Math.floor(x/(SQ*R)-(r%2)/2);for(let q=col-1;q<=col+1;q++){if(q<0||r<0||q>=MAP.cols||r>=MAP.rows)continue;const p=pos({q,r}),dist=Math.hypot(x-p.x,z-p.z),w=Math.max(0,1-dist/(R*1.9))**3;if(w){total+=this.baseHeights[r*MAP.cols+q]*w;sum+=w;}}}return sum?total/sum:-1;}
 cachedHeight(x,z){const k=Math.round(x*1000)+','+Math.round(z*1000);if(this.heightCache.has(k))return this.heightCache.get(k);const y=this.heightAt(x,z);this.heightCache.set(k,y);return y;}
 groundColor(x,z){const k=Math.round(x*1000)+','+Math.round(z*1000);if(this.surfaceCache.has(k))return this.surfaceCache.get(k);let total=[0,0,0],sum=0;const row=Math.floor(z/(1.5*R));for(let r=row-1;r<=row+1;r++){const col=Math.floor(x/(SQ*R)-(r%2)/2);for(let q=col-1;q<=col+1;q++){const t=this.tile({q,r});if(!t)continue;const p=pos(t),w=Math.max(0,1-Math.hypot(x-p.x,z-p.z)/(R*1.9))**2;const c=color(PALETTE[t.terrain]);for(let i=0;i<3;i++)total[i]+=c[i]*w;sum+=w;}}let out=total.map(v=>v/(sum||1));const y=this.heightAt(x,z);if(y>2.4)out=mix(out,[.54,.55,.49],Math.min(.8,(y-2.4)/5));out=out.map(v=>v*(.96+h(x*.12,z*.12)*.09));this.surfaceCache.set(k,out);return out;}
 normal(x,z){const s=.18;return V.norm([this.heightAt(x-s,z)-this.heightAt(x+s,z),s*2,this.heightAt(x,z-s)-this.heightAt(x,z+s)]);}
 staticGeometry(g,kind=0,casts=true,transparent=false){const b=this.gpu.batch(this.gpu.geometry(g),kind,casts);b.transparent=transparent;this.gpu.upload(b,[...M.identity(),1,1,1,1]);return b;}
 buildTerrain(){
  const mesh=new G();for(const t of MAP.tiles){const p=pos(t),points=[[p.x,p.z]];for(let j=0;j<6;j++){const a=(j*60-30)*Math.PI/180;points.push([p.x+Math.cos(a)*R,p.z+Math.sin(a)*R]);}
   for(let j=0;j<6;j++)for(const ix of [0,(j+1)%6+1,j+1]){const [x,z]=points[ix],y=this.cachedHeight(x,z),c=this.groundColor(x,z);mesh.vertex([x,y,z],this.normal(x,z),c);}
  }this.staticBatches.push(this.staticGeometry(mesh,5));
  const sea=new G();sea.quad([-R,-.08,-R],[-R,-.08,this.worldH+R],[this.worldW+R,-.08,this.worldH+R],[this.worldW+R,-.08,-R]);this.water=this.staticGeometry(sea,1,false);
  const roads=new G();for(const t of MAP.tiles)if(t.road)for(const n of neighbors(t)){const other=this.tile(n);if(!other?.road||n.r<t.r||(n.r===t.r&&n.q<t.q))continue;lineQuad(roads,pos(t),pos(n),t.terrain==='ford'?.55:.30,color(t.terrain==='ford'?'#b7af91':'#989173'),(x,z)=>Math.max(t.terrain==='ford'?.02:-2,this.heightAt(x,z)));}this.staticBatches.push(this.staticGeometry(roads,0,false));
  // A dark earthen plinth makes the cut edge of the strategic atlas readable.
  const edge=[];pushInstance(edge,M.model(this.worldW/2,-2.2,this.worldH/2,this.worldW+R,2.8,this.worldH+R),'#3c463c');this.staticBatches.push(this.makeBatch('box',edge));
 }
 makeBatch(geo,values,kind=0,casts=true,transparent=false){const b=this.gpu.batch(this.geo[geo],kind,casts);b.transparent=transparent;this.gpu.upload(b,values);return b;}
 buildVegetation(){
  const trunks=[],canopy=[],rocks=[],grass=[];const placed=[];
  for(const t of MAP.tiles){const p=pos(t);if(t.terrain==='forest'){const count=4+Math.floor(h(t.q,t.r)*4);for(let i=0;i<count;i++){const x=p.x+(h(t.q+i,t.r,11)-.5)*3.5,z=p.z+(h(t.q,t.r+i,22)-.5)*3.5;if(t.road&&Math.hypot(x-p.x,z-p.z)<1.8)continue;const y=this.heightAt(x,z),s=.55+h(t.q+i,t.r,80)*.55;if(y<.1)continue;pushInstance(trunks,M.model(x,y+s*.7,z,.15,s*1.45,.15),'#504b35');const c=mix([.20,.30,.17],[.36,.43,.23],h(t.q+i,t.r));pushInstance(canopy,M.model(x,y+s*1.4,z,s*.95,s*1.5,s*.95,0,0,.12),c);pushInstance(canopy,M.model(x+s*.23,y+s*1.7,z+s*.13,s*.74,s*1.2,s*.78),c);placed.push({x,z,y});}}
   else if(['mountain','hill'].includes(t.terrain)&&!t.road&&h(t.q,t.r)>.54){for(let i=0;i<2;i++){const x=p.x+(i-.5)*1.4,z=p.z+(h(t.q+i,t.r)-.5)*1.6,y=this.heightAt(x,z),s=.4+h(t.q,t.r+i)*.8;pushInstance(rocks,M.model(x,y+.12,z,s,s*.65,s*.8,h(t.q,t.r)*6,.15,.15),'#8b8f80');}}
   else if(t.terrain==='plain'&&!t.road&&h(t.q,t.r)>.76&&!D.cities.some(c=>distance(c,t)<3)){const x=p.x+.7,z=p.z-.5,y=this.heightAt(x,z);pushInstance(grass,M.model(x,y+.11,z,.35,.35,.35),'#7e8853');}
  }
  this.chunkInstances('cylinder',trunks);this.chunkInstances('foliage',canopy);this.chunkInstances('sphere',rocks);this.chunkInstances('cone',grass,0,false);
 }
 chunkInstances(geo,values,kind=0,casts=true,output=this.staticBatches){const cells=new Map(),size=28;for(let i=0;i<values.length;i+=20){const x=Math.floor(values[i+12]/size),z=Math.floor(values[i+14]/size),k=x+','+z;let a=cells.get(k);if(!a)cells.set(k,a=[]);for(let j=0;j<20;j++)a.push(values[i+j]);}for(const [k,a]of cells){const [x,z]=k.split(',').map(Number),b=this.makeBatch(geo,a,kind,casts);b.bounds={x:(x+.5)*size,y:3,z:(z+.5)*size,radius:size*.72+4};output.push(b);}}
 visibleBounds(b){const m=this.vp;for(const [row,sign]of [[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){const x=m[3]+sign*m[row],y=m[7]+sign*m[4+row],z=m[11]+sign*m[8+row],w=m[15]+sign*m[12+row];if(x*b.x+y*b.y+z*b.z+w<-b.radius*Math.hypot(x,y,z))return false;}return true;}
 buildGrid(){const g=new G();for(const t of MAP.tiles){const p=pos(t);for(let i=0;i<3;i++){const a=(i*60-30)*Math.PI/180,b=((i+1)*60-30)*Math.PI/180;lineQuad(g,{x:p.x+Math.cos(a)*R,z:p.z+Math.sin(a)*R},{x:p.x+Math.cos(b)*R,z:p.z+Math.sin(b)*R},.018,[.74,.79,.66],(x,z)=>Math.max(0,this.heightAt(x,z))+.025);}}this.gridBatch=this.staticGeometry(g,3,false);}
 paintMini(){this.minimapBase=document.createElement('canvas');this.minimapBase.width=344;this.minimapBase.height=280;const c=this.minimapBase.getContext('2d');c.fillStyle='#2e4144';c.fillRect(0,0,344,280);for(const t of MAP.tiles){c.fillStyle=PALETTE[t.terrain];c.fillRect(t.q*4,t.r*4,4,4);if(t.road){c.fillStyle='#c2af8c';c.fillRect(t.q*4+1,t.r*4+1,2,2);}}}
 add(geo,x,y,z,sx,sy,sz,tint,yaw=0,pitch=0,roll=0,kind=0){const k=geo+':'+kind;let a=this.dataBuffers.get(k);if(!a)this.dataBuffers.set(k,a=[]);pushInstance(a,M.model(x,y,z,sx,sy,sz,yaw,pitch,roll),tint);}
 local(geo,base,dx,dy,dz,sx,sy,sz,tint,rot=0,pitch=0,roll=0,kind=0){const cs=Math.cos(base.yaw||0),sn=Math.sin(base.yaw||0);this.add(geo,base.x+dx*cs+dz*sn,base.y+dy,base.z-dx*sn+dz*cs,sx,sy,sz,tint,(base.yaw||0)+rot,pitch,roll,kind);}
 flag(base,tint,scale=1){this.local('cylinder',base,0,1.3*scale,0,.06*scale,2.6*scale,.06*scale,'#443e2b');this.local('sphere',base,0,2.65*scale,0,.13*scale,.16*scale,.13*scale,'#c7ad66');this.local('flag',base,.03*scale,1.70*scale,0,.8*scale,.85*scale,1,tint,0,0,0,2);this.local('box',base,.43*scale,2.09*scale,.025,.08*scale,.46*scale,.025,'#ebdfb2');}
 buildCities(e){const sig=e.s.cities.map(c=>c.faction+':'+Math.floor(c.hp/c.maxHP*4)+':'+c.buildings.map(b=>b.type+b.level+b.remaining).join(',')).join('|');if(this.lastCitySignature===sig)return;this.lastCitySignature=sig;for(const b of this.cityBatches)this.gpu.disposeBatch(b);this.cityBatches=[];const keep=this.dataBuffers;this.dataBuffers=new Map();
  for(const c of e.s.cities){const p=pos(c),y=this.heightAt(p.x,p.z),base={...p,y,yaw:0},f=D.factions.find(f=>f.id===c.faction),stone='#a19f88',wood='#685a41',roof='#424e4a';
   this.local('box',base,0,.12,0,3.85,.35,3.75,'#8b8b6d');this.local('box',base,0,.33,0,3.3,.1,3.3,'#b3aa8b');
   for(const side of [-1,1]){this.local('box',base,side*1.7,.8,0,.36,1.05,3.5,stone);this.local('box',base,0,.8,side*1.7,3.5,1.05,.36,stone);
    for(let k=-3;k<=3;k++){for(const [x,z]of [[side*1.7,k*.46],[k*.46,side*1.7]])this.local('box',base,x,1.40,z,.24,.28,.25,'#b0ad96');}
   }
   // Gate dark recess, wooden doors and a roofed barbican.
   this.local('box',base,0,.69,1.895,.85,.89,.03,'#31392e');for(const side of [-1,1])this.local('box',base,side*.19,.64,1.916,.35,.76,.04,'#514735');
   this.local('box',base,0,1.7,1.62,1.15,.62,.72,'#b8b090');this.local('roof',base,0,2.01,1.62,1.24,.65,.94,roof);
   for(const x of [-1.66,1.66])for(const z of [-1.66,1.66]){this.local('box',base,x,1.1,z,.65,1.70,.65,'#aaa68e');this.local('box',base,x,1.87,z,.73,.16,.73,wood);this.local('roof',base,x,1.94,z,.85,.55,.85,roof);}
   this.local('box',base,0,.83,-.24,1.45,.95,1.33,'#bdad89');this.local('roof',base,0,1.32,-.24,1.73,.74,1.59,roof);this.local('box',base,0,1.91,-.24,.8,.48,.75,'#b7a47c');this.local('roof',base,0,2.15,-.24,1.11,.57,1.04,roof);
   for(const x of [-.54,-.18,.18,.54])this.local('box',base,x,.83,.443,.06,.94,.04,wood);for(const x of [-1,1]){this.local('box',base,x*.96,.67,-.9,.55,.6,.5,'#b7aa87');this.local('roof',base,x*.96,.97,-.9,.7,.42,.66,roof);}
   this.flag({x:p.x+1.15,z:p.z-.4,y:y+1.05,yaw:0},f.color,.75);
   if(c.hp/c.maxHP<.6){for(let i=0;i<9;i++)this.local('sphere',base,.9+Math.sin(i)*.8,.35,1.9+Math.cos(i)*.25,.25,.19,.3,'#7e7e6c');}
   for(const b of c.buildings){const t=c.development[b.slot];if(!t)continue;const dp=pos(t),db={...dp,y:this.heightAt(dp.x,dp.z),yaw:0};if(b.type==='farm'){this.local('box',db,0,.03,0,2.4,.08,1.9,b.remaining?'#8a7d5b':'#a7a06b');for(let row=0;row<6;row++)this.local('box',db,-1+row*.38,.12,0,.16,.14,1.85,b.remaining?'#857a55':'#6f824c');}
    else{const n=b.level||1,w=.9+n*.13;this.local('box',db,0,.4,0,w,.75,w*.9,b.remaining?'#82795d':'#bbab83');this.local('roof',db,0,.78,0,w*1.2,.55,w,b.type==='market'?'#715b46':'#52605a');for(const side of [-1,1])this.local('cylinder',db,side*w*.44,.42,w*.43,.07,.9,.07,wood);if(b.type==='forge'||b.type==='workshop')this.local('box',db,.4,.93,-.25,.25,1.2,.25,'#77786a');}
   }
  }
  for(const [k,values]of this.dataBuffers){const [geo,kind]=k.split(':');this.chunkInstances(geo,values,+kind,true,this.cityBatches);}this.dataBuffers=keep;
 }
 resize(){const r=this.canvas.getBoundingClientRect();if(!r.width||!r.height)return;this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.dpr=Math.min(this.quality==='high'?2:this.quality==='low'?1:1.5,devicePixelRatio||1);this.canvas.width=Math.round(this.width*this.dpr);this.canvas.height=Math.round(this.height*this.dpr);this.overlay.width=this.canvas.width;this.overlay.height=this.canvas.height;this.overlay.style.width=this.width+'px';this.overlay.style.height=this.height+'px';this.needs=true;this.updateCamera();}
 updateCamera(){const cam=this.camera,d=46/clamp(cam.zoom,.065,4.8),cp=Math.cos(cam.pitch),sp=Math.sin(cam.pitch),y=Math.max(.3,this.heightAt(cam.x,cam.y));this.eye=[cam.x+Math.sin(cam.yaw)*cp*d,y+sp*d,cam.y+Math.cos(cam.yaw)*cp*d];this.target=[cam.x,y,cam.y];this.vp=M.mul(M.perspective(.70,this.width/this.height,.12,1200),M.lookAt(this.eye,this.target));this.invVP=M.inverse(this.vp);this.sun=V.norm([-.6,1,.38]);const span=clamp(d*1.25,35,110),center=[cam.x,0,cam.y];this.lightVP=M.mul(M.ortho(-span,span,-span,span,1,400),M.lookAt(V.add(center,this.sun.map(x=>x*170)),center));}
 project(x,y,z){const p=M.transform(this.vp,[x,y,z,1]);return {x:(p[0]/p[3]*.5+.5)*this.width,y:(-.5*p[1]/p[3]+.5)*this.height,visible:p[3]>0&&Math.abs(p[0]/p[3])<1.15&&Math.abs(p[1]/p[3])<1.2,depth:p[3]};}
 toScreen(p){const w=pos(p);return this.project(w.x,Math.max(0,this.heightAt(w.x,w.z))+.15,w.z);}
 toHex(x,y){this.updateCamera();const e=this.getState();let found=null,best=20;
  // Prefer actual unit silhouettes/labels; all other points use terrain picking.
  for(const u of e.s.units){const w=this.unitWorld(u,performance.now()),a=this.project(w.x,w.y+1.05,w.z),d=Math.hypot(a.x-x,a.y-y);if(a.visible&&d<best){best=d;found={q:u.q,r:u.r};}}if(found)return found;
  const nx=x/this.width*2-1,ny=1-y/this.height*2,a=M.transform(this.invVP,[nx,ny,-1,1]),b=M.transform(this.invVP,[nx,ny,1,1]),o=a.slice(0,3).map(v=>v/a[3]),end=b.slice(0,3).map(v=>v/b[3]),dir=V.norm(V.sub(end,o));if(dir[1]>=-.002)return null;
  let t=Math.max(0,(13-o[1])/dir[1]),limit=Math.min(1400,(-2-o[1])/dir[1]),prev=t;for(;t<=limit;t+=.65){const wx=o[0]+dir[0]*t,wz=o[2]+dir[2]*t,wy=o[1]+dir[1]*t;if(wy<=Math.max(-.08,this.heightAt(wx,wz))){let lo=prev,hi=t;for(let i=0;i<9;i++){const mid=(lo+hi)/2,px=o[0]+dir[0]*mid,pz=o[2]+dir[2]*mid;if(o[1]+dir[1]*mid>Math.max(-.08,this.heightAt(px,pz)))lo=mid;else hi=mid;}const at=roundHex(o[0]+dir[0]*hi,o[2]+dir[2]*hi);return this.tile(at)?at:null;}prev=t;}return null;
 }
 focus(p,zoom=null){const w=pos(p);this.camera.x=w.x;this.camera.y=w.z;if(zoom!==null)this.camera.zoom=clamp(zoom,.065,4.8);this.updateCamera();this.needs=true;}
 fit(){this.camera.x=this.worldW/2;this.camera.y=this.worldH/2;this.camera.yaw=0;this.camera.pitch=1.30;const d=Math.max(this.worldH/Math.sin(this.camera.pitch),this.worldW/(this.width/this.height))/(2*Math.tan(.35)) *1.13;this.camera.zoom=clamp(46/d,.065,4.8);this.updateCamera();this.needs=true;}
 zoom(factor){this.camera.zoom=clamp(this.camera.zoom*factor,.065,4.8);this.updateCamera();this.needs=true;}
 pan(dx,dy){const c=this.camera,scale=(46/c.zoom)*Math.tan(.35)*2/this.height,cs=Math.cos(c.yaw),sn=Math.sin(c.yaw);c.x=clamp(c.x+(-dx*cs-dy*sn/Math.sin(c.pitch))*scale,-4,this.worldW+4);c.y=clamp(c.y+(dx*sn-dy*cs/Math.sin(c.pitch))*scale,-4,this.worldH+4);this.updateCamera();this.needs=true;}
 orbit(dx,dy){this.camera.yaw-=dx*.006;this.camera.pitch=clamp(this.camera.pitch+dy*.004,.32,1.48);this.updateCamera();this.needs=true;}
 preset(name){if(name==='battle'){this.camera.pitch=.52;this.camera.zoom=2.35;}else{this.camera.pitch=.94;this.camera.zoom=.98;}this.updateCamera();}
 setQuality(q){this.quality=['low','medium','high'].includes(q)?q:'medium';const select=document.getElementById('quality-select');if(select)select.value=this.quality;this.resize();}
 select(type,id,mode='move',reach){this.selection={type,id};this.mode=mode;this.reach=reach||new Map();this.needs=true;}
 reset(){this.fx=[];this.moves.clear();this.ghosts=[];this.unitCache.clear();this.headings.clear();this.lastCitySignature='';}
 consume(effects){const now=performance.now();for(const eff of effects){if(eff.type==='move'){const path=eff.path||[eff.from,eff.to],a=pos(path.at(-2)),b=pos(path.at(-1));this.headings.set(eff.unit,Math.atan2(b.x-a.x,b.z-a.z));this.moves.set(eff.unit,{...eff,path,time:now,duration:Math.min(2400,Math.max(500,(path.length-1)*270))});}
   else if(eff.type==='battle'){const move=this.moves.get(eff.unit),start=move?move.time+move.duration:now;this.fx.push({...eff,time:start,duration:1900});const old=this.unitCache.get(eff.target);if(old&&!this.getState().unit(eff.target))this.ghosts.push({unit:{...old},expires:start+1400,death:start+850});if(this.followBattle&&eff.faction===this.getState().s.player){const a=pos(eff.from),b=pos(eff.to);this.camera.x=(a.x+b.x)/2;this.camera.y=(a.z+b.z)/2;this.updateCamera();}this.playSound(eff);}
   else{const battle=[...this.fx].reverse().find(f=>f.type==='battle'&&f.target===eff.target);this.fx.push({...eff,at:{q:eff.at.q,r:eff.at.r},time:battle?battle.time+850:now,duration:1550});}}
  this.needs=true;
 }
 playSound(f){if(!this.sound)return;try{const ac=this.audio||(this.audio=new (root.AudioContext||root.webkitAudioContext)());if(ac.state==='suspended')ac.resume();const osc=ac.createOscillator(),gain=ac.createGain();osc.type=f.troop==='crossbow'?'triangle':'sine';osc.frequency.setValueAtTime(f.troop==='crossbow'?340:90,ac.currentTime);osc.frequency.exponentialRampToValueAtTime(32,ac.currentTime+.22);gain.gain.setValueAtTime(.13,ac.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ac.currentTime+.3);osc.connect(gain);gain.connect(ac.destination);osc.start();osc.stop(ac.currentTime+.32);}catch{this.sound=false;}}
 unitWorld(u,now){const p=pos(u);let x=p.x,z=p.z,yaw=this.headings.get(u.id)??(u.faction==='cao'||u.faction===this.getState().s.player?Math.PI/2:-Math.PI/2),moving=false,attack=0,recoil=0,death=0;const m=this.moves.get(u.id);
  if(m&&now<m.time+m.duration){const total=m.path.length-1,progress=clamp((now-m.time)/m.duration,0,1)*total,k=Math.min(total-1,Math.floor(progress)),a=pos(m.path[k]),b=pos(m.path[k+1]),t=progress-k;x=a.x+(b.x-a.x)*t;z=a.z+(b.z-a.z)*t;yaw=Math.atan2(b.x-a.x,b.z-a.z);moving=true;}
  const battle=[...this.fx].reverse().find(f=>f.type==='battle'&&now>=f.time&&now<f.time+f.duration&&(f.unit===u.id||f.target===u.id));
  if(battle){const a=pos(battle.from),b=pos(battle.to),t=(now-battle.time)/battle.duration,d=V.norm([b.x-a.x,0,b.z-a.z]);if(battle.unit===u.id){yaw=Math.atan2(d[0],d[2]);attack=Math.sin(Math.min(1,t/.7)*Math.PI);if(!['crossbow','siege'].includes(battle.troop)&&battle.mode!=='confuse'){const reach=Math.min(Math.hypot(b.x-a.x,b.z-a.z)*.42,2.3);x=a.x+d[0]*reach*attack;z=a.z+d[2]*reach*attack;moving=true;}}else{yaw=Math.atan2(-d[0],-d[2]);const blend=clamp((t-.43)/.45,0,1);x=b.x+(p.x-b.x)*blend;z=b.z+(p.z-b.z)*blend;recoil=Math.max(0,Math.sin((t-.4)*Math.PI*2))*.25;x+=d[0]*recoil;z+=d[2]*recoil;}}
  const ghost=this.ghosts.find(g=>g.unit.id===u.id);if(ghost)death=clamp((now-ghost.death)/500,0,1);return {x,z,y:Math.max(.05,this.heightAt(x,z)),yaw,moving,attack,recoil,death};
 }
 // Procedural articulated soldiers, cavalry and siege silhouettes. One figure
 // represents many troops; these are render instances, NOT independent agents.
 soldier(base,type,tint,phase,attack,level=1){const horse=type==='cavalry',lift=horse?.64:0,walk=Math.sin(phase),metal='#59636a',cloth=tint,leather='#534a39',skin='#b79a76';
  if(horse){this.local('sphere',base,0,.58,0,.43,.52,.96,'#776047');this.local('box',base,0,.62,.43,.25,.57,.27,'#6b553e',0,-.38);this.local('sphere',base,0,.94,.53,.26,.32,.4,'#6b553e');this.local('box',base,0,.79,-.02,.42,.12,.46,cloth);for(const dx of [-.15,.15])for(const dz of [-.3,.3])this.local('box',base,dx,.27,dz,.085,.50,.09,'#4c4133',0,walk*(dz>0?.36:-.36));this.local('cone',base,0,.49,-.54,.1,.55,.1,'#333830',0,-.5);}
  const b={...base,y:base.y+lift};this.local('taper',b,0,.64,0,.36,.48,.29,metal);this.local('taper',b,0,.40,0,.40,.24,.34,cloth);this.local('sphere',b,0,.99,.015,.225,.25,.23,skin);this.local('sphere',b,0,1.085,0,.26,.18,.25,metal);this.local('box',b,0,1.17,-.015,.07,.18,.08,cloth);
  if(level>0){for(const side of [-1,1]){this.local('box',b,side*.11,.19,0,.105,.35,.13,leather,0,walk*.42*side);this.local('sphere',b,side*.205,.72,.02,.15,.24,.17,metal);this.local('box',b,side*.22,.65,.13,.09,.22,.11,skin,0,-.75);}
   if(type==='crossbow'){this.local('box',b,0,.72,.26,.58,.065,.075,'#836d43');this.local('box',b,0,.72,.24,.08,.08,.40,'#604d30');}
   else if(type==='spear'||type==='halberd'||type==='cavalry'){const lean=.05+attack*.75;this.local('cylinder',b,.25,.87,.25,.035,1.85,.035,'#7d6b43',0,lean);this.local('cone',b,.25,1.82*Math.cos(lean),.25+Math.sin(lean)*.9,.105,.28,.07,'#c6c9c5',0,lean);if(type==='halberd')this.local('box',b,.34,1.66,.25,.23,.14,.035,'#a7b2b5');if(type!=='cavalry')this.local('cylinder',b,-.25,.62,.23,.42,.07,.5,'#7b7456',0,Math.PI/2);}
   else{this.local('box',b,.26,.75,.37,.06,.7,.045,'#b6c1c0',0,attack*1.1);this.local('box',b,-.24,.62,.2,.27,.43,.06,cloth);}
  }
 }
 siegeModel(base,type,tint,now){const wood='#7d6948',dark='#514735';for(const x of [-.58,.58])for(const z of [-.65,.65]){this.local('cylinder',base,x,.32,z,.6,.16,.6,dark,0,0,Math.PI/2);this.local('cylinder',base,x*1.01,.32,z,.12,.17,.12,'#b7a277',0,0,Math.PI/2);}this.local('box',base,0,.48,0,1.3,.2,1.7,wood);
  if(type==='ram'){for(const x of [-.47,.47])for(const z of [-.55,.55])this.local('box',base,x,1.02,z,.12,1.2,.12,wood);this.local('roof',base,0,1.56,0,1.24,.9,1.8,'#645e49');this.local('cylinder',base,0,.89,.13+Math.sin(now*.01)*base.attack*.2,.3,2.2,.3,wood,0,Math.PI/2);this.local('sphere',base,0,.89,1.25,.42,.35,.35,'#a2a59b');}
  else{for(const x of [-.52,.52])for(const z of [-.6,.6])this.local('box',base,x,1.4,z,.12,2.1,.12,wood);for(const y of [.9,1.6,2.3])this.local('box',base,0,y,0,1.3,.1,1.45,wood);for(let i=0;i<9;i++)this.local('box',base,0,.65+i*.2,-.71,.55,.07,.09,'#b09b6f');this.local('box',base,0,2.48,.67,1.26,.38,.12,wood);this.local('roof',base,0,2.7,0,1.5,.6,1.65,dark);}
  this.flag({...base,x:base.x-.45,y:base.y+1.2},tint,.65);
 }
 drawUnits(e,now){const list=[...e.s.units,...this.ghosts.map(g=>g.unit)];this.visibleUnits=[];
  for(const u of list){const b=this.unitWorld(u,now),screen=this.project(b.x,b.y+1,b.z);if(!screen.visible)continue;this.visibleUnits.push({u,b,screen});const f=D.factions.find(f=>f.id===u.faction),c=color(f.color),selected=this.selection?.type==='unit'&&this.selection.id===u.id;const close=this.camera.zoom>.42&&Math.hypot(b.x-this.camera.x,b.z-this.camera.y)<95;const lod=this.quality==='high'?48:this.quality==='low'?16:30;
   if(close){if(['ram','siege'].includes(u.type)){this.siegeModel(b,u.type,f.color,now);for(let i=0;i<8;i++){const bb={...b,x:b.x+(i%2?1:-1)*.93,z:b.z+(Math.floor(i/2)-1.5)*.52};this.soldier(bb,'sword',f.color,b.moving?now*.018+i:0,b.attack,this.camera.zoom>.6?1:0);}}
    else{let n=clamp(Math.ceil(u.troops/220),8,lod);if(u.type==='cavalry')n=Math.min(n,20);const cols=u.type==='cavalry'?4:Math.ceil(Math.sqrt(n)),gap=u.type==='cavalry'?.65:.47,rows=Math.ceil(n/cols);for(let i=0;i<n;i++){const dx=(i%cols-(cols-1)/2)*gap,dz=(Math.floor(i/cols)-(rows-1)/2)*(u.type==='cavalry'?.95:.5),cs=Math.cos(b.yaw),sn=Math.sin(b.yaw);const bb={x:b.x+dx*cs+dz*sn,z:b.z-dx*sn+dz*cs,y:b.y-b.death*.75,yaw:b.yaw};bb.y=Math.max(.05,this.heightAt(bb.x,bb.z))-b.death*.65;this.soldier(bb,u.type,f.color,b.moving?now*.016+i*.8:0,b.attack,this.camera.zoom>.55?1:0);}}
   }else{for(let i=0;i<3;i++)this.local('box',b,(i-1)*.4,.35,0,.3,.6,.6,f.color);}
   this.flag({x:b.x-1.1,z:b.z-.8,y:b.y,yaw:b.yaw},f.color,close?1:.8);
   if(selected)this.add('ring',b.x,b.y+.08,b.z,1.90,1,1.90,[.86,.72,.38,1],0,0,0,3);
   if(u.confused){this.add('ring',b.x,b.y+1.95,b.z,1.25,1,1.25,[.64,.46,.81,.85],now*.001,0,0,3);}
  }
 }
 tacticalOverlay(e){const selected=this.selection?.type==='unit'?e.unit(this.selection.id):e.city(this.selection?.id);if(!selected)return;
  const hex=(t,tint)=>{const p=pos(t),y=Math.max(.03,this.heightAt(p.x,p.z))+.09;this.add('hexring',p.x,y,p.z,R*.98,.1,R*.98,tint,Math.PI/6,0,0,3);};
  if(this.selection.type==='city'){const p=pos(selected);this.add('ring',p.x,this.heightAt(p.x,p.z)+.10,p.z,2.36,.1,2.36,[.87,.72,.36,1],0,0,0,3);if(this.camera.zoom>.5)for(const t of selected.development)hex(t,[.63,.65,.43,.23]);}
  else if(selected.faction===e.s.player&&!selected.acted){if(this.mode==='move')for(const [k,cost]of this.reach){if(!cost)continue;const [q,r]=k.split(',').map(Number);hex({q,r},[.40,.63,.56,.26]);}
   else{const range=this.mode==='confuse'?2+(e.hasSkill(selected,'귀모')?1:0):this.mode==='fire'?2:D.troops[selected.type].range;for(const t of MAP.tiles)if(distance(t,selected)>0&&distance(t,selected)<=range)hex(t,[.86,.48,.27,.34]);}
  }
  if(this.hover&&this.tile(this.hover))hex(this.hover,[.98,.90,.61,.75]);
 }
 effects(now){for(const f of this.fx){if(now<f.time)continue;const age=(now-f.time)/f.duration;if(age>1)continue;
  if(f.type==='battle'){const a=pos(f.from),b=pos(f.to),ay=this.heightAt(a.x,a.z),by=this.heightAt(b.x,b.z),t=age;
   if(['crossbow','siege'].includes(f.troop)&&f.mode!=='confuse'){for(let i=0;i<18;i++){const v=clamp((t-.02*(i%5))/.56,0,1);if(v<=0||v>=1)continue;const startX=a.x+(i%6-2.5)*.35,startZ=a.z+(Math.floor(i/6)-1)*.4,endX=b.x+(h(i,3)-.5)*1.9,endZ=b.z+(h(i,6)-.5)*1.9,x=startX+(endX-startX)*v,z=startZ+(endZ-startZ)*v,y=ay+1+(by-ay)*v+Math.sin(v*Math.PI)*3.3,dy=(by-ay)+Math.cos(v*Math.PI)*Math.PI*3.3,yaw=Math.atan2(endX-startX,endZ-startZ),pitch=-Math.atan2(dy,Math.hypot(endX-startX,endZ-startZ));this.add('box',x,y,z,.025,.025,.55,f.tactic==='fire'?'#f2bc58':'#c5c7ad',yaw,pitch,0,3);}}
   if(f.mode==='confuse')this.add('ring',b.x,by+.15+t*2,b.z,.4+t*2,.1,.4+t*2,[.65,.47,.85,1-t],t*2,0,0,3);
   if(t>.42){for(let i=0;i<(this.quality==='low'?10:22);i++){const v=(t-.42)/.58,angle=h(i,5)*Math.PI*2,d=v*(1.2+h(i,8)*1.7),x=b.x+Math.cos(angle)*d,z=b.z+Math.sin(angle)*d,y=by+.15+Math.sin(v*Math.PI)*(.2+h(i,9)*1.1);this.add('sphere',x,y,z,.12+v*.35,.12+v*.45,.12+v*.35,[.65,.58,.43,(1-v)*.6],0,0,0,4);}}
  }
 }
 const e=this.getState();for(const fire of e.s.fires){const p=pos(fire),y=this.heightAt(p.x,p.z);for(let i=0;i<7;i++){const x=p.x+Math.sin(i*4)*.7,z=p.z+Math.cos(i*5)*.7,s=.55+Math.sin(now*.008+i)*.2;this.add('cone',x,y+s*.55,z,.38,s*2,.38,[1,.42+i*.045,.08,.85],0,0,.10*Math.sin(now*.004+i),3);this.add('sphere',x,y+1.3+(now*.0007+i*.17)%1.8,z,.45,.7,.45,[.22,.25,.23,.25],0,0,0,4);}}
 }
 flushDynamic(){const out=[];for(const [k,values]of this.dataBuffers){let b=this.dynamicBatches.get(k);if(!b){const [name,kind]=k.split(':');b=this.gpu.batch(this.geo[name],+kind,+kind<3);b.transparent=+kind>=3;this.dynamicBatches.set(k,b);}this.gpu.upload(b,values,true);out.push(b);}return out.sort((a,b)=>+(a.transparent)-+(b.transparent));}
 draw(now){if(!this.active||this.disposed||!this.width||!this.height||this.gpu.contextLost)return;this.drawCount++;const e=this.getState();if(!e)return;this.updateCamera();this.fx=this.fx.filter(f=>now<f.time+f.duration);this.ghosts=this.ghosts.filter(g=>now<g.expires);for(const [id,m]of this.moves)if(now>m.time+m.duration)this.moves.delete(id);this.buildCities(e);this.dataBuffers=new Map();this.drawUnits(e,now);this.tacticalOverlay(e);this.effects(now);const dynamic=this.flushDynamic();let batches=[...this.staticBatches.filter(b=>!b.bounds||this.visibleBounds(b.bounds)),this.water,...this.cityBatches.filter(b=>!b.bounds||this.visibleBounds(b.bounds))];if(this.grid)batches.push(this.gridBatch);batches.push(...dynamic);this.gpu.render(batches,{vp:this.vp,lightVP:this.lightVP,eye:this.eye,sun:this.sun,fog:[.64,.70,.66],time:now/1000,fogFar:Math.max(95,160/this.camera.zoom),shadows:this.quality!=='low'&&this.camera.zoom>.18});this.drawLabels(e,now);this.drawMini(e);this.frameCount++;if(now-this.fpsTime>1000){this.fps=this.frameCount*1000/(now-this.fpsTime);this.frameCount=0;this.fpsTime=now;const fps=document.getElementById('fps-label');if(fps)fps.textContent=Math.round(this.fps)+' FPS';}this.stats={fps:Math.round(this.fps),drawCalls:this.gpu.draws,triangles:this.gpu.triangles,units:e.s.units.length,visibleUnits:this.visibleUnits.length,tiles:MAP.tiles.length};for(const u of e.s.units)this.unitCache.set(u.id,{...u});this.needs=false;const zoom=document.getElementById('zoom-label');if(zoom)zoom.textContent=Math.round(this.camera.zoom*100)+'%';}
 label(text,x,y,tint,selected=false,small=false){const c=this.ctx;c.font=`${selected?'600 ':''}${small?10:12}px "Malgun Gothic","Apple SD Gothic Neo",sans-serif`;c.textAlign='center';const w=c.measureText(text).width+19;c.fillStyle=selected?'rgba(17,29,34,.94)':'rgba(22,37,38,.83)';c.strokeStyle=tint;c.lineWidth=selected?1.3:.7;c.beginPath();c.roundRect(x-w/2,y-12,w,21,3);c.fill();c.stroke();c.fillStyle=selected?'#f4e2ae':'#ece8d4';c.fillText(text,x,y+3);return w;}
 drawLabels(e,now){const c=this.ctx;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);const zoom=this.camera.zoom;const labels=[];for(const city of e.s.cities){const p=pos(city),screen=this.project(p.x,this.heightAt(p.x,p.z)+2.7,p.z);if(!screen.visible)continue;labels.push({city,screen});}labels.sort((a,b)=>b.screen.depth-a.screen.depth);for(const {city,screen:p}of labels){const selected=this.selection?.id===city.id,f=D.factions.find(f=>f.id===city.faction);const w=this.label(city.name,p.x,p.y-8,f.color,selected,zoom<.3);if(zoom>.5){c.fillStyle='#21332e';c.fillRect(p.x-w/2,p.y+5,w,3);c.fillStyle=city.hp<city.maxHP*.6?'#cf9260':f.color;c.fillRect(p.x-w/2,p.y+5,w*city.hp/city.maxHP,3);}}
  for(const {u,b}of this.visibleUnits){const p=this.project(b.x,b.y+2.8,b.z),selected=this.selection?.type==='unit'&&this.selection.id===u.id,f=D.factions.find(f=>f.id===u.faction);if(zoom<.28&&!selected)continue;let text=zoom>.7||selected?u.name.replace(' 부대','')+' · '+(u.troops/1000).toFixed(1)+'k':(u.troops/1000).toFixed(1)+'k';if(u.confused)text+=' 혼란';else if(u.acted)text+=' ✓';const w=this.label(text,p.x,p.y-12,f.color,selected,true);c.fillStyle='#182b29';c.fillRect(p.x-w/2,p.y+1,w,3);c.fillStyle=f.color;c.fillRect(p.x-w/2,p.y+1,w*Math.min(1,u.troops/10000),3);}
  for(const f of this.fx){if(f.type==='battle'||!f.text||now<f.time)continue;const p=this.toScreen(f.at),age=(now-f.time)/f.duration;c.globalAlpha=1-age;c.textAlign='center';c.font='bold 18px "Malgun Gothic",sans-serif';c.lineWidth=4;c.strokeStyle='#1d2f2e';c.strokeText(f.text,p.x,p.y-50-age*45);c.fillStyle=f.color||'#eee0ae';c.fillText(f.text,p.x,p.y-50-age*45);c.globalAlpha=1;}
  // Subtle vignette, not a replacement for the real-time 3D scene.
  const v=c.createRadialGradient(this.width/2,this.height/2,this.width*.18,this.width/2,this.height/2,this.width*.70);v.addColorStop(0,'rgba(12,28,27,0)');v.addColorStop(1,'rgba(12,28,27,.16)');c.fillStyle=v;c.fillRect(0,0,this.width,this.height);
 }
 drawMini(e){const c=this.mc,w=this.mini.width,hh=this.mini.height;c.clearRect(0,0,w,hh);c.drawImage(this.minimapBase,0,0,w,hh);c.fillStyle='#142b3033';c.fillRect(0,0,w,hh);for(const city of e.s.cities){c.fillStyle=D.factions.find(f=>f.id===city.faction).color;c.fillRect(city.q/MAP.cols*w-2,city.r/MAP.rows*hh-2,4,4);}for(const u of e.s.units){c.fillStyle=u.faction===e.s.player?'#ffffde':'#5f2826';c.fillRect(u.q/MAP.cols*w-1,u.r/MAP.rows*hh-1,2,2);}const x=this.camera.x/this.worldW*w,y=this.camera.y/this.worldH*hh,span=22/this.camera.zoom;c.strokeStyle='#fff5ca';c.lineWidth=1;c.strokeRect(x-span/this.worldW*w,y-span/this.worldH*hh,span*2/this.worldW*w,span*2/this.worldH*hh);c.fillStyle='#fff4c5';c.beginPath();c.arc(x,y,2,0,Math.PI*2);c.fill();}
}
// Renderer choice and fallback are owned by view-manager.js.
root.RTK3D={Renderer3D,pos,roundHex,R};
})(window);
