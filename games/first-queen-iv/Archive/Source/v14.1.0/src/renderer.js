(function(root){'use strict';
const {WIDTH:W,HEIGHT:H,CLASSES,REGIONS,clamp}=FQ;
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const mul=(a,b)=>{const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o;};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{let n=Math.hypot(...a)||1;return a.map(x=>x/n);};
function view(eye,target){const z=norm(eye.map((v,i)=>v-target[i])),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1]);}
function model(x,y,z,sx,sy,sz,yaw=0,pitch=0,roll=0){
 const cy=Math.cos(yaw),syaw=Math.sin(yaw),cx=Math.cos(pitch),snx=Math.sin(pitch),cz=Math.cos(roll),snz=Math.sin(roll);
 return [ (cy*cz+syaw*snx*snz)*sx, cx*snz*sx,(-syaw*cz+cy*snx*snz)*sx,0,
 (-cy*snz+syaw*snx*cz)*sy,cx*cz*sy,(syaw*snz+cy*snx*cz)*sy,0,
 syaw*cx*sz,-snx*sz,cy*cx*sz,0,x,y,z,1];
}
const FACES=[{n:[0,1,0],u:[1,0,0],v:[0,0,-1]},{n:[0,-1,0],u:[1,0,0],v:[0,0,1]},
 {n:[0,0,1],u:[1,0,0],v:[0,1,0]},{n:[0,0,-1],u:[-1,0,0],v:[0,1,0]},
 {n:[1,0,0],u:[0,0,-1],v:[0,1,0]},{n:[-1,0,0],u:[0,0,1],v:[0,1,0]}];
const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
class Renderer{
 constructor(scene,glCanvas,hudCanvas){this.scene=scene;this.ctx=scene.getContext('2d');this.glCanvas=glCanvas;this.hudCanvas=hudCanvas;this.hud=hudCanvas.getContext('2d');this.view3D=true;this.health=true;this.paths=false;this.effects=true;this.camera={yaw:.65,pitch:.86,zoom:1,focusX:480,focusY:300,follow:false};this.boxes=[];this.gl=null;this.error='';this.initGL();}
 initGL(){
  try{const gl=this.glCanvas.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});if(!gl){this.error='WebGL context unavailable';return;}const ext=gl.getExtension('ANGLE_instanced_arrays');this.ext=ext;this.gl=gl;
   const vs=`precision highp float;attribute vec3 aPos;attribute vec3 aNormal;uniform mat4 vp;${ext?'attribute vec4 m0;attribute vec4 m1;attribute vec4 m2;attribute vec4 m3;attribute vec3 tint;':'uniform mat4 model;uniform vec3 tint;'}varying vec3 col;void main(){${ext?'mat4 model=mat4(m0,m1,m2,m3);':''}vec4 world=model*vec4(aPos,1.);vec3 n=normalize(mat3(normalize(model[0].xyz),normalize(model[1].xyz),normalize(model[2].xyz))*aNormal);float d=max(0.,dot(n,normalize(vec3(-.55,1.,.65))));col=tint*(.48+.52*d);gl_Position=vp*world;}`;
   const fs='precision mediump float;varying vec3 col;void main(){gl_FragColor=vec4(col,1.);}';
   const compile=(type,src)=>{let s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
   const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,vs));gl.attachShader(p,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);this.program=p;
   this.loc={vp:gl.getUniformLocation(p,'vp')};for(const n of ['aPos','aNormal'])this.loc[n]=gl.getAttribLocation(p,n);
   if(ext){for(const n of ['m0','m1','m2','m3','tint'])this.loc[n]=gl.getAttribLocation(p,n);}else{this.loc.model=gl.getUniformLocation(p,'model');this.loc.tint=gl.getUniformLocation(p,'tint');}
   const geom=[];for(const f of FACES)for(const [x,y] of [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,-.5],[.5,.5],[-.5,.5]]){for(let i=0;i<3;i++)geom.push(f.n[i]*.5+f.u[i]*x+f.v[i]*y);geom.push(...f.n);}
   this.geom=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.geom);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(geom),gl.STATIC_DRAW);this.instances=gl.createBuffer();this.instanceData=new Float32Array(19*5000);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.clearColor(.48,.60,.61,1);
   this.glCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.gl=null;this.error='WebGL context lost';});this.glCanvas.addEventListener('webglcontextrestored',()=>this.initGL());
  }catch(e){this.error=e.message;this.gl=null;}
 }
 resize(){const target=Math.min(1600,Math.round(this.scene.parentElement.clientWidth*(window.devicePixelRatio||1))),h=Math.round(target*H/W);if(this.scene.width===target)return;for(const c of [this.scene,this.glCanvas,this.hudCanvas]){c.width=target;c.height=h;}this.ctx.setTransform(target/W,0,0,h/H,0,0);this.hud.setTransform(target/W,0,0,h/H,0,0);}
 get span(){return 81*this.camera.zoom;}
 matrices(){const c=this.camera,t=[(c.focusX-480)*.1,0,(c.focusY-300)*.1],e=[t[0]+Math.sin(c.yaw)*130*Math.cos(c.pitch),130*Math.sin(c.pitch),t[2]+Math.cos(c.yaw)*130*Math.cos(c.pitch)];this.vp=mul(ortho(-this.span*W/H/2,this.span*W/H/2,-this.span/2,this.span/2,.1,400),view(e,t));return this.vp;}
 projectWorld(x,y,z){const m=this.vp,px=m[0]*x+m[4]*y+m[8]*z+m[12],py=m[1]*x+m[5]*y+m[9]*z+m[13],pz=m[2]*x+m[6]*y+m[10]*z+m[14];return {x:(px+1)*W/2,y:(1-py)*H/2,depth:pz};}
 project(x,y,z=0){if(!this.view3D)return {x,y:y-z*.65,depth:y};return this.projectWorld((x-480)*.1,z*.1,(y-300)*.1);}
 ground(x,y){if(!this.view3D)return {x,y};const c=this.camera,nx=(x/W*2-1)*this.span*W/H/2,ny=(1-y/H*2)*this.span/2;return {x:c.focusX+(Math.cos(c.yaw)*nx-Math.sin(c.yaw)*ny/Math.sin(c.pitch))*10,y:c.focusY+(-Math.sin(c.yaw)*nx-Math.cos(c.yaw)*ny/Math.sin(c.pitch))*10};}
 movement(horizontal,vertical){if(!this.view3D)return {x:horizontal,y:-vertical};return {x:Math.cos(this.camera.yaw)*horizontal-Math.sin(this.camera.yaw)*vertical,y:-Math.sin(this.camera.yaw)*horizontal-Math.cos(this.camera.yaw)*vertical};}
 pick(b,x,y){let best=null,score=Infinity;for(const u of b.units){if(u.team!=='blue'||!u.alive||u.evacuated)continue;const p=this.project(u.x,u.y,15),d=Math.hypot(p.x-x,p.y-y);if(d<23&&d<score){score=d;best=u;}}return best;}
 box(x,y,z,sx,sy,sz,color,yaw=0,pitch=0,roll=0){this.boxes.push({m:model(x,y,z,sx,sy,sz,yaw,pitch,roll),color:Array.isArray(color)?color:rgb(color)});}
 ring(x,z,r,color){for(let i=0;i<18;i++){const a=i*Math.PI/9;this.box(x+Math.cos(a)*r,.08,z+Math.sin(a)*r,.22,.06,.22,color);}}
 terrain(b){
  this.box(0,-1.1,0,100,2,64,'#424d3c');this.box(0,-.08,0,96,.18,60,b.map.kind==='forest'?'#6f8758':'#83916c');
  for(let i=0;i<11;i++){const x=-46+i*9;this.box(x,.025,0,9,.05,10+(i%3)*.7,'#aa9e7e');}
  for(let i=0;i<45;i++){let x=((i*137)%940-470)*.1,z=((i*89)%560-280)*.1;if(Math.abs(z)<6||b.nav.blocks.some(r=>Math.abs((x*10+480)-r.x)<r.w/2+15&&Math.abs((z*10+300)-r.y)<r.h/2+15))continue;this.box(x,.12,z,.16,.25,.6,'#697f50',i*.7);}
  for(const r of b.map.obstacles){const x=(r.x-480)*.1,z=(r.y-300)*.1,h=r.height*.1;
   this.box(x,h/2,z,r.w*.1,h,r.h*.1,r.kind==='rock'?'#7c8780':'#b5b49f');
   if(r.kind==='wall'){this.box(x,h+.15,z,r.w*.1+.4,.3,r.h*.1,'#d3ccae');for(let zz=-r.h*.05+1;zz<r.h*.05;zz+=3)this.box(x,h+.55,z+zz,r.w*.1+.4,.85,1.3,'#a5a58f');for(let yy=1;yy<h;yy+=1.6)this.box(x-1.42,yy,z,.06,.06,r.h*.1,'#909582');}
   if(r.kind==='tower'){this.box(x,h-.4,z,r.w*.1+.6,1,r.h*.1+.6,'#d1c8ad');for(const xx of [-1,1])for(const zz of [-1,1])this.box(x+xx*r.w*.035,h+.35,z+zz*r.h*.035,1.2,1.2,1.2,'#b9b89c');this.box(x,h+1.4,z,.15,2.8,.15,'#775e49');this.box(x+.7,h+2,z,1.3,.9,.08,'#984e50');}
   if(r.kind==='rock')this.box(x-.4,h+.25,z-.4,r.w*.075,.5,r.h*.07,'#a4aaa0',.2);
  }
  const g=b.map.gate;if(g){const x=(g.x-480)*.1,z=(g.y-300)*.1;
   if(!g.open){this.box(x,2.4,z,1.1,4.8,g.h*.1,'#806342');for(let zz=-6.9;zz<7;zz+=1.3)this.box(x-.6,2.4,z+zz,.15,4.8,.08,'#b99964');for(let yy of [1,3.7])this.box(x-.65,yy,z,.18,.18,g.h*.1,'#48565a');}
   else if(g.destroyed){for(let i=0;i<8;i++)this.box(x+Math.sin(i*3)*2,.18,z+(i-4)*1.7,1.7,.35,.45,'#887553',i*.75);}
  }
  // Decorative trees are outside playable bounds and cannot obstruct navigation.
  for(let i=0;i<10;i++){const x=-45+i*10,z=i%2?-33:33;this.box(x,1.1,z,.6,2.2,.6,'#6d5a40');this.box(x,3,z,3,2.6,3,'#4e704f',.3*i);this.box(x+.4,4.4,z,2,1.5,2,'#678557',.5*i);}
 }
 unit(u,b,selected){
  if(u.evacuated)return;const dead=u.deadAt!==null?clamp((b.tick-u.deadAt)/45,0,1):0;if(!u.alive&&b.tick-u.deadAt>120)return;
  const x=(u.x-480)*.1,z=(u.y-300)*.1,yaw=u.yaw;let team=u.team==='blue'?rgb('#4b8eac'):rgb('#a85b59'),accent=rgb(CLASSES[u.type].color),skin=rgb('#d4b28d');if(dead){team=mix(team,rgb('#7b8270'),dead*.6);accent=mix(accent,rgb('#6c7763'),dead*.65);}
  if(u.hitFlash>0){team=mix(team,[1,1,.8],.65);accent=mix(accent,[1,1,.8],.65);}
  const walk=Math.hypot(u.vx,u.vy)>2?Math.sin(u.phase)*.6:0,act=u.action?clamp((b.tick-u.action.start)/(u.action.end-u.action.start),0,1):0,swing=u.action?Math.sin(act*Math.PI)*1.7:0,bob=Math.abs(walk)*.08;
  const part=(ox,oy,oz,w,h,d,col,pitch=0,roll=0)=>{const fall=dead*Math.PI*.48,dx=ox*Math.cos(fall)+oy*Math.sin(fall),dy=-ox*Math.sin(fall)+oy*Math.cos(fall);this.box(x+dx*Math.cos(yaw)+oz*Math.sin(yaw),Math.max(.1,dy)+bob,z-dx*Math.sin(yaw)+oz*Math.cos(yaw),w,h,d,col,yaw,pitch,roll-fall);};
  this.box(x,.025,z,1.5,.04,1.15,'#59674f',yaw);if(selected&&u.alive)this.ring(x,z,1.2,'#f0d594');
  part(-.3,.5,0,.4,.9,.46,'#354650',walk);part(.3,.5,0,.4,.9,.46,'#354650',-walk);
  part(0,1.45,0,1.05,1.2,.7,team);part(0,1.12,.02,1.14,.16,.75,'#68594a');part(0,2.38,0,.71,.68,.71,skin);part(0,2.75,-.03,.77,.18,.77,accent);
  part(-.67,1.55,0,.29,.86,.32,team,-walk*.6);part(.67,1.55,.07,.29,.86,.32,team,u.action?-swing:walk*.6);
  if(u.type==='knight'){part(0,2.55,-.04,.82,.48,.8,'#b7c5c2');part(0,2.86,-.02,.22,.32,.6,accent);part(-.85,1.5,.12,.18,.92,.75,team);part(.85,1.7+Math.sin(swing)*.2,.34, .14,1.8,.14,'#d5dfd6',-swing);part(.85,1.03,.34,.52,.10,.14,'#b99c63',-swing);part(0,1.5,-.45,.85,1.6,.08,accent,.1);}
  else if(u.type==='archer'){part(.85,1.6,.22,.13,1.25,.13,'#b99763',-.2);part(.84,2.25,.23,.14,.2,.4,'#b99763',.7);part(0,1.55,-.48,.42,.85,.36,'#6b624a');}
  else if(u.type==='healer'){part(.81,1.65,.14,.13,2.45,.13,'#b3a075');part(.81,2.98,.14,.44,.4,.44,'#b5d7ba',0,.3);part(0,1.2,-.4,.95,1.8,.09,accent);}
  else{part(-.85,1.48,.12,.16,.91,.75,'#a6b5ad');part(-.96,1.48,.12,.06,.54,.5,team);part(.85,1.6,.24,.12,1.2,.12,'#cad7d2',-swing);}
  if(u.action&&u.action.kind==='heal')this.box(x,3.4,z,.35,.35,.35,'#ace2af',b.time*3);
 }
 buildScene(game){const b=game.battle;this.boxes=[];this.terrain(b);for(const u of b.units)this.unit(u,b,u.id===game.selectedUnitId);
  for(const p of b.projectiles){const yaw=Math.atan2(p.dx,p.dy);this.box((p.x-480)*.1,p.z*.1,(p.y-300)*.1,.1,.1,.95,'#e6d7a8',yaw);}
  if(this.effects)for(const p of b.particles)this.box((p.x-480)*.1,Math.max(.1,p.z*.1),(p.y-300)*.1,.23,.23,.23,p.color,b.time*3);
 }
 drawGL(){const gl=this.gl;gl.viewport(0,0,this.glCanvas.width,this.glCanvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.loc.vp,false,this.vp);gl.bindBuffer(gl.ARRAY_BUFFER,this.geom);for(const [n,offset] of [['aPos',0],['aNormal',12]]){gl.enableVertexAttribArray(this.loc[n]);gl.vertexAttribPointer(this.loc[n],3,gl.FLOAT,false,24,offset);}
  if(this.ext){if(this.boxes.length*19>this.instanceData.length)this.instanceData=new Float32Array(this.boxes.length*19);for(let i=0;i<this.boxes.length;i++){this.instanceData.set(this.boxes[i].m,i*19);this.instanceData.set(this.boxes[i].color,i*19+16);}gl.bindBuffer(gl.ARRAY_BUFFER,this.instances);gl.bufferData(gl.ARRAY_BUFFER,this.instanceData.subarray(0,this.boxes.length*19),gl.DYNAMIC_DRAW);
   for(const [i,n] of ['m0','m1','m2','m3'].entries()){gl.enableVertexAttribArray(this.loc[n]);gl.vertexAttribPointer(this.loc[n],4,gl.FLOAT,false,76,i*16);this.ext.vertexAttribDivisorANGLE(this.loc[n],1);}gl.enableVertexAttribArray(this.loc.tint);gl.vertexAttribPointer(this.loc.tint,3,gl.FLOAT,false,76,64);this.ext.vertexAttribDivisorANGLE(this.loc.tint,1);this.ext.drawArraysInstancedANGLE(gl.TRIANGLES,0,36,this.boxes.length);
  }else for(const box of this.boxes){gl.uniformMatrix4fv(this.loc.model,false,new Float32Array(box.m));gl.uniform3fv(this.loc.tint,box.color);gl.drawArrays(gl.TRIANGLES,0,36);}
 }
 drawSoftware(){const ctx=this.ctx;ctx.fillStyle='#7c999a';ctx.fillRect(0,0,W,H);const faces=[];const light=norm([-.55,1,.65]);const eye=[Math.sin(this.camera.yaw)*Math.cos(this.camera.pitch),Math.sin(this.camera.pitch),Math.cos(this.camera.yaw)*Math.cos(this.camera.pitch)];
  for(const box of this.boxes){const m=box.m;for(const f of FACES){const n=norm([m[0]*f.n[0]/Math.hypot(m[0],m[1],m[2])+m[4]*f.n[1]/Math.hypot(m[4],m[5],m[6])+m[8]*f.n[2]/Math.hypot(m[8],m[9],m[10]),m[1]*f.n[0]/Math.hypot(m[0],m[1],m[2])+m[5]*f.n[1]/Math.hypot(m[4],m[5],m[6])+m[9]*f.n[2]/Math.hypot(m[8],m[9],m[10]),m[2]*f.n[0]/Math.hypot(m[0],m[1],m[2])+m[6]*f.n[1]/Math.hypot(m[4],m[5],m[6])+m[10]*f.n[2]/Math.hypot(m[8],m[9],m[10])]);if(dot(n,eye)<=0)continue;
    const pts=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>this.projectWorld(...transform(m,f.n.map((x,i)=>x*.5+f.u[i]*u+f.v[i]*v))));if(pts.every(p=>p.x<0)||pts.every(p=>p.x>W)||pts.every(p=>p.y<0)||pts.every(p=>p.y>H))continue;const intensity=.48+.52*Math.max(0,dot(n,light));faces.push({pts,z:pts.reduce((a,p)=>a+p.depth,0)/4,c:`rgb(${box.color.map(v=>Math.round(v*intensity*255)).join(',')})`});}}
  faces.sort((a,b)=>b.z-a.z);for(const f of faces){ctx.fillStyle=f.c;ctx.beginPath();f.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();}
 }
 draw2D(game){const b=game.battle,c=this.ctx;c.fillStyle='#788968';c.fillRect(0,0,W,H);c.fillStyle='#a89e80';c.fillRect(0,252,W,96);c.strokeStyle='#ffffff09';for(let x=0;x<W;x+=24){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke();}for(let y=0;y<H;y+=24){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke();}
  for(const r of [...b.map.obstacles,...(b.map.gate&&!b.map.gate.open?[b.map.gate]:[])]){c.fillStyle=r.kind==='gate'?'#806342':r.kind==='rock'?'#69756c':'#bab7a0';c.fillRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h);c.strokeStyle='#49594c';c.strokeRect(r.x-r.w/2,r.y-r.h/2,r.w,r.h);}
  for(const u of b.units){if(!u.alive||u.evacuated)continue;c.save();c.translate(u.x,u.y);c.rotate(-u.yaw);c.fillStyle='#0004';c.beginPath();c.ellipse(2,3,10,7,0,0,7);c.fill();c.fillStyle=u.team==='blue'?CLASSES[u.type].color:'#bd7670';if(u.hitFlash)c.fillStyle='#fff1b1';c.fillRect(-7,-9,14,18);c.fillStyle='#dcc29b';c.fillRect(-5,3,10,7);c.restore();if(u.id===game.selectedUnitId){c.strokeStyle='#ffdf8e';c.lineWidth=2;c.beginPath();c.arc(u.x,u.y,14,0,7);c.stroke();}}
  for(const p of b.projectiles){c.fillStyle='#f4e5b5';c.fillRect(p.x-2,p.y-2,4,4);}if(this.effects)for(const p of b.particles){c.fillStyle=p.color;c.fillRect(p.x,p.y-p.z*.3,3,3);}
 }
 world(game){const c=this.ctx,w=game.world;c.fillStyle='#233e3e';c.fillRect(0,0,W,H);
  for(let i=0;i<70;i++){const x=(i*113+34)%960,y=(i*173+58)%600;c.fillStyle=i%3?'#2b4944':'#314e48';c.beginPath();c.moveTo(x-19,y+18);c.lineTo(x,y-13-i%14);c.lineTo(x+22,y+18);c.fill();}
  c.fillStyle='#1d3335';c.beginPath();c.moveTo(440,0);c.bezierCurveTo(370,190,710,310,640,600);c.lineTo(665,600);c.bezierCurveTo(720,280,400,170,466,0);c.fill();
  c.font='600 13px system-ui';c.fillStyle='#a6c0b6';c.fillText('GAIA  /  CAMPAIGN MAP',28,34);c.fillStyle='#f2e7c7';c.font='bold 28px system-ui';c.fillText('가이아 전선',28,71);c.font='13px system-ui';c.fillStyle='#aec7bd';c.fillText(`전략 턴 ${String(w.turn).padStart(2,'0')}  ·  아군 거점 ${w.regions.filter(r=>r.owner==='blue').length} / 6`,29,98);
  c.lineWidth=3;c.setLineDash([6,7]);for(const r of REGIONS)for(const id of r.links)if(r.id<id){c.strokeStyle='#8f977a';c.beginPath();c.moveTo(r.x,r.y);c.lineTo(REGIONS[id].x,REGIONS[id].y);c.stroke();}c.setLineDash([]);
  for(const r of w.regions){const p=REGIONS[r.id],selected=game.selectedRegion===r.id,active=game.activeArmy.region===r.id;c.fillStyle='#0e2425';c.beginPath();c.arc(p.x,p.y,33,0,7);c.fill();c.strokeStyle=selected?'#ecd59b':active?'#91c8db':'#526d65';c.lineWidth=selected?3:1;c.stroke();c.fillStyle=r.owner==='blue'?'#5d9da9':r.owner==='red'?'#b86c61':'#b3b48c';c.fillRect(p.x-15,p.y-10,30,22);for(let i=0;i<3;i++)c.fillRect(p.x-17+i*13,p.y-17,8,10);c.fillStyle='#294743';c.fillRect(p.x-4,p.y+2,8,10);c.textAlign='center';c.fillStyle='#f3e9d1';c.font='600 15px system-ui';c.fillText(p.name,p.x,p.y+55);c.fillStyle='#a0b8af';c.font='11px system-ui';const count=r.garrison.length;c.fillText(r.owner==='red'?`수비대 ${count}명`:r.owner==='blue'?'아군 거점':'중립 지역',p.x,p.y+72);
   const friend=w.armies.filter(a=>a.region===r.id);for(const [i,a]of friend.entries()){const xx=p.x-27+i*25,yy=p.y-56;c.fillStyle=a.id===w.activeArmyId?'#f0d692':'#97c4cd';c.fillRect(xx-9,yy-9,22,20);c.fillStyle='#183436';c.font='bold 11px system-ui';c.fillText(String(a.id+1),xx+2,yy+5);}
   const enemy=w.enemyArmies.filter(e=>e.region===r.id);if(enemy.length){c.fillStyle='#c7786c';c.beginPath();c.arc(p.x+36,p.y-20,12,0,7);c.fill();c.fillStyle='#fff2da';c.font='bold 11px system-ui';c.fillText(String(enemy.reduce((s,e)=>s+e.roster.length,0)),p.x+36,p.y-16);}
  }
  c.textAlign='left';c.fillStyle='#152e30dc';c.fillRect(19,548,430,32);c.font='12px system-ui';c.fillStyle='#d4ded1';c.fillText('거점 선택 → 이동 / 출전   ·   깃발 숫자는 군단 번호',32,569);
 }
 label(text,x,y,color='#f4ead4',size=13,align='left'){const c=this.hud;c.font=`600 ${size}px system-ui`;c.textAlign=align;c.lineWidth=3;c.strokeStyle='#182b2cce';c.strokeText(text,x,y);c.fillStyle=color;c.fillText(text,x,y);}
 drawHUD(game){const b=game.battle,c=this.hud;c.clearRect(0,0,W,H);if(!b)return;
  if(this.paths)for(const u of b.units.filter(u=>u.team==='blue'&&u.groupId===game.selectedGroupId&&u.alive)){const p=this.project(u.x,u.y);c.strokeStyle='#e1c99b99';c.lineWidth=1;c.beginPath();c.moveTo(p.x,p.y);for(const q of u.path.slice(u.pathIndex)){const v=this.project(q.x,q.y);c.lineTo(v.x,v.y);}c.stroke();}
  for(const u of b.units){if(!u.alive||u.evacuated)continue;const p=this.project(u.x,u.y,34);if(this.health||u.id===game.selectedUnitId){c.fillStyle='#163236d0';c.fillRect(p.x-11,p.y-4,22,4);c.fillStyle=u.team==='blue'?'#9bceb0':'#e0aa8e';c.fillRect(p.x-11,p.y-4,22*u.hp/u.maxHp,4);}if(u.id===game.selectedUnitId)this.label(`${CLASSES[u.type].name} · ${game.direct?'직접':'자동'}`,p.x,p.y-12,'#ffe1a0',11,'center');}
  if(this.effects)for(const e of b.effects){const p=this.project(e.x,e.y,40+(1-e.life)*18);c.globalAlpha=clamp(e.life*2,0,1);this.label(e.text,p.x,p.y,e.color,12,'center');}c.globalAlpha=1;
  const allies=b.units.filter(u=>u.team==='blue'&&u.alive&&!u.evacuated).length,enemies=b.units.filter(u=>u.team==='red'&&u.alive&&!u.evacuated).length;
  c.fillStyle='#153033e8';c.fillRect(15,13,930,40);this.label(`아군 ${allies}`,30,39,'#b0d6dd',16);this.label(`적군 ${enemies}`,927,39,'#efb5a5',16,'right');this.label(`${b.training?'공성 연습':REGIONS[b.regionId].name}  /  ${String(Math.floor(b.time/60)).padStart(2,'0')}:${String(Math.floor(b.time%60)).padStart(2,'0')}`,480,39,'#eddfb9',14,'center');
  const gate=b.map.gate;if(gate){c.fillStyle='#233735da';c.fillRect(385,61,190,28);this.label(gate.destroyed?'성문 파괴':gate.open?'성문 개방':`성문 ${Math.ceil(gate.hp)} / ${gate.maxHp}`,480,80,'#e5cfaa',12,'center');}
  const g=game.selectedGroup;if(g){this.label(`${g.name}  ·  ${FQ.ORDERS[g.order]}`,22,565,'#e4d5ad',14);this.label(`우클릭 이동  /  F ${game.selected?CLASSES[game.selected.type].skill:'고유 스킬'}  /  H 회복`,22,585,'#d3dfd3',11);}
  const pending=b.groups.filter(g=>g.team==='blue'&&!g.spawned);if(pending.length)this.label(`지원군 ${Math.ceil((pending[0].arrival-b.tick)/60)}초 후 도착`,25,77,'#aaddcf',12);
  const mx=773,my=468,mw=164,mh=102;c.fillStyle='#173132e8';c.fillRect(mx-6,my-6,mw+12,mh+12);c.fillStyle='#657c62';c.fillRect(mx,my,mw,mh);for(const r of b.nav.blocks){c.fillStyle='#bcbaa0';c.fillRect(mx+(r.x-r.w/2)/W*mw,my+(r.y-r.h/2)/H*mh,r.w/W*mw,r.h/H*mh);}for(const u of b.units){if(!u.alive||u.evacuated)continue;c.fillStyle=u.id===game.selectedUnitId?'#ffe59e':u.team==='blue'?'#a6dae0':'#e8a08b';c.fillRect(mx+u.x/W*mw,my+u.y/H*mh,3,3);}
  if(game.paused){c.fillStyle='#132b31aa';c.fillRect(0,0,W,H);this.label('일시정지',W/2,H/2,'#f2e7c8',36,'center');this.label('P 또는 계속 버튼',W/2,H/2+32,'#c5d8d0',14,'center');}
 }
 render(game){this.resize();const active=game.mode==='battle',gpu=active&&this.view3D&&!!this.gl;this.scene.style.display=gpu?'none':'block';this.glCanvas.style.display=gpu?'block':'none';this.hudCanvas.style.display=active?'block':'none';this.hud.clearRect(0,0,W,H);
  if(!active){this.world(game);return;}
  if(this.camera.follow&&game.selected?.alive){this.camera.focusX+=(game.selected.x-this.camera.focusX)*.09;this.camera.focusY+=(game.selected.y-this.camera.focusY)*.09;}
  this.matrices();if(this.view3D){this.buildScene(game);if(this.gl)this.drawGL();else this.drawSoftware();}else this.draw2D(game);this.drawHUD(game);
 }
 resetCamera(){Object.assign(this.camera,{yaw:.65,pitch:.86,zoom:1,focusX:480,focusY:300,follow:false});}
}
root.FQRenderer=Renderer;
})(globalThis);
