(function(root){
'use strict';
const {MAP,DATA:D,distance,neighbors,axial,clamp,key}=root.RTK;
const R=22,SQ=Math.sqrt(3),PAD=45;
const COLORS={plain:'#59664f',forest:'#425a48',hill:'#756f50',mountain:'#535e57',water:'#304c55',ford:'#4f6360'};
const h=(q,r)=>{let x=Math.imul(q+381,1274126177)^Math.imul(r+47,668265263);return((x^(x>>>13))>>>0)/4294967296;};
function pos(p){return {x:PAD+SQ*R*(p.q+(p.r%2)/2),y:PAD+1.5*R*p.r};}
function hex(ctx,x,y,r=R){ctx.beginPath();for(let i=0;i<6;i++){const a=(60*i-30)*Math.PI/180;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();}
function roundRect(ctx,x,y,w,hh,r){ctx.beginPath();ctx.roundRect(x,y,w,hh,r);}
class Renderer{
 constructor(canvas,mini,getState,options={}){
  canvas.__rtkRenderer=this;this.is3D=false;this.active=false;this.disposed=false;this.frame=0;this.drawCount=0;this.sound=false;this.stats={};this.ghosts=[];this.headings=new Map();this.unitCache=new Map();
  this.canvas=canvas;this.ctx=canvas.getContext('2d');this.mini=mini;this.mc=mini.getContext('2d');this.getState=getState;
  this.worldW=PAD*2+SQ*R*(MAP.cols+.5);this.worldH=PAD*2+1.5*R*(MAP.rows-1)+R;
  this.camera={x:this.worldW/2,y:this.worldH/2,zoom:.85};this.grid=false;this.selection=null;this.hover=null;this.mode='move';this.reach=new Map();this.fx=[];this.moves=new Map();this.last=0;this.needs=true;
  this.terrain=document.createElement('canvas');this.terrain.width=this.worldW;this.terrain.height=this.worldH;this.paintTerrain();
  this.observer=new ResizeObserver(()=>{this.resize();});this.observer.observe(canvas);
  this.loop=t=>{this.frame=0;if(!this.active||this.disposed)return;this.frame=requestAnimationFrame(this.loop);if(document.hidden)return;if(t-this.last>30){this.last=t;this.draw(t);}};this.resize();if(options.autoStart!==false)this.setActive(true);
 }
 setActive(value){if(this.disposed)return;this.active=!!value;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;this.canvas.hidden=!this.active;if(this.active){this.resize();this.needs=true;this.last=0;this.frame=requestAnimationFrame(this.loop);}}
 dispose(){if(this.disposed)return;this.setActive(false);this.disposed=true;this.observer?.disconnect();this.terrain.width=1;this.terrain.height=1;}
 reset(){this.fx=[];this.moves.clear();this.ghosts=[];this.headings.clear();this.unitCache.clear();this.hover=null;this.needs=true;}
 preset(name){this.camera.zoom=name==='battle'?2:.98;this.needs=true;}
 orbit(){} // A north-up 2D atlas has no camera yaw.
 playSound(effect){root.RTK3D?.Renderer3D.prototype.playSound.call(this,effect);}
 resize(){const b=this.canvas.getBoundingClientRect();if(!b.width||!b.height)return;this.width=b.width;this.height=b.height;this.dpr=Math.min(2,devicePixelRatio||1);this.canvas.width=Math.round(b.width*this.dpr);this.canvas.height=Math.round(b.height*this.dpr);this.needs=true;}
 toScreen(p){const w=pos(p);return {x:(w.x-this.camera.x)*this.camera.zoom+this.width/2,y:(w.y-this.camera.y)*this.camera.zoom+this.height/2};}
 toHex(x,y){const wx=(x-this.width/2)/this.camera.zoom+this.camera.x-PAD,wy=(y-this.height/2)/this.camera.zoom+this.camera.y-PAD;let aq=SQ/3*wx/R-wy/(3*R),ar=2*wy/(3*R),cx=aq,cz=ar,cy=-cx-cz,rx=Math.round(cx),ry=Math.round(cy),rz=Math.round(cz);const dx=Math.abs(rx-cx),dy=Math.abs(ry-cy),dz=Math.abs(rz-cz);if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;const p={q:rx+Math.floor(rz/2),r:rz};return p.q>=0&&p.r>=0&&p.q<MAP.cols&&p.r<MAP.rows?p:null;}
 focus(p,zoom=null){const w=pos(p);this.camera.x=w.x;this.camera.y=w.y;if(zoom!==null)this.camera.zoom=zoom;this.needs=true;}
 fit(){this.camera.x=this.worldW/2;this.camera.y=this.worldH/2;this.camera.zoom=clamp(Math.min(this.width/this.worldW,this.height/this.worldH)*.94,.04,8);this.needs=true;}
 zoom(factor,x=this.width/2,y=this.height/2){const before={x:(x-this.width/2)/this.camera.zoom+this.camera.x,y:(y-this.height/2)/this.camera.zoom+this.camera.y};this.camera.zoom=clamp(this.camera.zoom*factor,.04,8);this.camera.x=before.x-(x-this.width/2)/this.camera.zoom;this.camera.y=before.y-(y-this.height/2)/this.camera.zoom;this.needs=true;}
 pan(dx,dy){this.camera.x-=dx/this.camera.zoom;this.camera.y-=dy/this.camera.zoom;this.camera.x=clamp(this.camera.x,-150,this.worldW+150);this.camera.y=clamp(this.camera.y,-150,this.worldH+150);this.needs=true;}
 select(type,id,mode='move',reach=null){this.selection={type,id};this.mode=mode;this.reach=reach||new Map();this.needs=true;}
 consume(effects){const now=performance.now();for(const f of effects){
   if(f.type==='move'){const path=f.path||[f.from,f.to],a=pos(path.at(-2)),b=pos(path.at(-1));this.headings.set(f.unit,Math.atan2(b.x-a.x,b.y-a.y));this.moves.set(f.unit,{...f,path,time:now,duration:Math.min(2400,Math.max(500,(path.length-1)*270))});}
   else if(f.type==='battle'){const move=this.moves.get(f.unit),time=move?Math.max(now,move.time+move.duration):now;this.fx.push({...f,time,duration:1900});this.playSound(f);}
   else if(f.at){const battle=[...this.fx].reverse().find(b=>b.type==='battle'&&b.target===f.target);this.fx.push({...f,at:{...f.at},time:battle?battle.time+850:now,duration:1550});}
  }this.needs=true;}
 drawBattle(c,f,now){if(now<f.time||now>f.time+f.duration)return;const t=clamp((now-f.time)/f.duration,0,1),a=this.toScreen(f.from),b=this.toScreen(f.to);c.save();c.globalAlpha=1-t*.55;
  if(['crossbow','siege'].includes(f.troop)&&f.mode!=='confuse'){c.strokeStyle='#efdbaf';c.lineWidth=1.5;for(let i=0;i<10;i++){const v=(t-(i%5)*.025)/.57;if(v<=0||v>=1)continue;const dx=b.x-a.x,dy=b.y-a.y,l=Math.max(1,Math.hypot(dx,dy)),x=a.x+dx*v+(i%3-1)*5,y=a.y+dy*v-Math.sin(v*Math.PI)*24;c.beginPath();c.moveTo(x-dx/l*8,y-dy/l*8);c.lineTo(x,y);c.stroke();}}
  else{c.strokeStyle=f.mode==='confuse'?'#cfa9e6':'#ecd094';c.lineWidth=3;c.setLineDash([8,5]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(a.x+(b.x-a.x)*Math.min(1,t*2),a.y+(b.y-a.y)*Math.min(1,t*2));c.stroke();c.setLineDash([]);}
  if(t>.4){c.globalAlpha=(1-t)*.7;c.strokeStyle=f.mode==='confuse'?'#cfa9e6':'#efb879';c.lineWidth=3;c.beginPath();c.arc(b.x,b.y,10+(t-.4)*35,0,Math.PI*2);c.stroke();}c.restore();}

 paintTerrain(){
  const c=this.terrain.getContext('2d');c.fillStyle='#263b3d';c.fillRect(0,0,this.worldW,this.worldH);
  for(const t of MAP.tiles){const p=pos(t),hh=h(t.q,t.r);hex(c,p.x,p.y,R+.5);c.fillStyle=COLORS[t.terrain];c.fill();c.fillStyle=hh>.5?'#d0c49806':'#142d1b08';c.fill();
   if(t.terrain==='forest'){
    for(let j=0;j<3;j++){const x=p.x-10+j*8+(hh*5),y=p.y+(j%2)*7-4;c.fillStyle='#233d3155';c.beginPath();c.ellipse(x+2,y+5,6,3,0,0,Math.PI*2);c.fill();c.fillStyle=j%2?'#36523c':'#304d3c';c.beginPath();c.moveTo(x,y-8);c.lineTo(x+5,y+4);c.lineTo(x-5,y+4);c.fill();c.strokeStyle='#74886b55';c.beginPath();c.moveTo(x,y-8);c.lineTo(x-5,y+4);c.stroke();}
   }else if(t.terrain==='mountain'){
    c.fillStyle='#253f3770';c.beginPath();c.ellipse(p.x+3,p.y+7,15,6,0,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(p.x-15,p.y+9);c.lineTo(p.x-3,p.y-14);c.lineTo(p.x+14,p.y+9);c.closePath();c.fillStyle='#798074';c.fill();c.beginPath();c.moveTo(p.x-3,p.y-14);c.lineTo(p.x+2,p.y+7);c.lineTo(p.x+14,p.y+9);c.closePath();c.fillStyle='#535f57';c.fill();c.strokeStyle='#b0b09b55';c.beginPath();c.moveTo(p.x-15,p.y+9);c.lineTo(p.x-3,p.y-14);c.stroke();
   }else if(t.terrain==='hill'){
    c.strokeStyle='#b3a87d37';c.lineWidth=1;c.beginPath();c.moveTo(p.x-13,p.y+4);c.quadraticCurveTo(p.x-5,p.y-9,p.x+4,p.y+2);c.quadraticCurveTo(p.x+11,p.y-3,p.x+14,p.y+4);c.stroke();
   }else if(t.terrain==='water'){
    c.strokeStyle='#99b4af17';c.beginPath();c.moveTo(p.x-12,p.y-3);c.quadraticCurveTo(p.x-4,p.y-6,p.x+6,p.y-3);c.moveTo(p.x-5,p.y+5);c.lineTo(p.x+12,p.y+5);c.stroke();
   }else if(hh>.65){
    c.strokeStyle='#9aab7a25';c.beginPath();c.moveTo(p.x-8,p.y+3);c.lineTo(p.x-10,p.y-2);c.moveTo(p.x-8,p.y+3);c.lineTo(p.x-6,p.y-3);c.moveTo(p.x+6,p.y-4);c.lineTo(p.x+7,p.y);c.stroke();
   }
  }
  // Connected roads / bridges; draw each link once.
  c.lineCap='round';
  for(const t of MAP.tiles.filter(x=>x.road)){const a=pos(t);for(const n of neighbors(t)){if(n.q<0||n.r<0||n.q>=MAP.cols||n.r>=MAP.rows)continue;const other=MAP.tiles[n.r*MAP.cols+n.q];if(!other.road||n.r<t.r||(n.r===t.r&&n.q<t.q))continue;const b=pos(n);c.strokeStyle='#c2b98a39';c.lineWidth=t.terrain==='ford'||other.terrain==='ford'?3:1.7;c.setLineDash(t.terrain==='ford'?[4,3]:[]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();}}
  c.setLineDash([]);
  // Map labels are a stylized layout, not geographic coordinates.
  c.font='29px Georgia,serif';c.textAlign='center';c.fillStyle='#e0dec72b';for(const [name,q,r]of[['서 량',6,3],['하 북',30,1],['중 원',26,18],['익 주',5,24],['형 주',20,29],['강 동',36,29]]){const p=pos({q:q*2,r:r*2});c.fillText(name,p.x,p.y);}
  c.font='15px Georgia,serif';c.fillStyle='#b6c9c34d';const sea=pos({q:82,r:38});c.save();c.translate(sea.x,sea.y);c.rotate(Math.PI/2);c.fillText('東 海',0,0);c.restore();
 }
 draw(now){
  if(!this.active||this.disposed||!this.width||!this.height)return;
  this.fx=this.fx.filter(f=>now<f.time+(f.duration||1550));for(const [id,m]of this.moves)if(now>m.time+(m.duration||500))this.moves.delete(id);
  if(!this.needs&&!this.fx.length&&!this.moves.size)return;this.needs=false;this.drawCount++;
  const e=this.getState();if(!e)return;const s=e.s,c=this.ctx,cam=this.camera;c.setTransform(this.dpr,0,0,this.dpr,0,0);c.clearRect(0,0,this.width,this.height);c.fillStyle='#2c4142';c.fillRect(0,0,this.width,this.height);
  c.save();c.translate(this.width/2,this.height/2);c.scale(cam.zoom,cam.zoom);c.translate(-cam.x,-cam.y);c.drawImage(this.terrain,0,0);
  const visible=p=>{const a=pos(p);return Math.abs((a.x-cam.x)*cam.zoom)<this.width/2+100&&Math.abs((a.y-cam.y)*cam.zoom)<this.height/2+100;};
  // Gentle faction aura around fortified cities.
  for(const city of s.cities.filter(visible)){const p=pos(city),f=D.factions.find(f=>f.id===city.faction);const g=c.createRadialGradient(p.x,p.y,5,p.x,p.y,100);g.addColorStop(0,f.color+'32');g.addColorStop(1,f.color+'00');c.fillStyle=g;c.fillRect(p.x-100,p.y-100,200,200);}
  if(this.grid){c.strokeStyle='#dbdab318';c.lineWidth=.6/cam.zoom;for(const t of MAP.tiles.filter(visible)){const p=pos(t);hex(c,p.x,p.y);c.stroke();}}
  const selected=this.selection?.type==='unit'?e.unit(this.selection.id):this.selection?.type==='city'?e.city(this.selection.id):null;
  if(selected&&this.selection.type==='city')for(const d of selected.development){const p=pos(d);hex(c,p.x,p.y,R-2);c.fillStyle='#ddd0960b';c.fill();c.strokeStyle='#e6d59340';c.lineWidth=1;c.stroke();}
  if(selected?.officers&&selected.faction===s.player&&!selected.acted){
   if(this.mode==='move')for(const [k,cost]of this.reach){if(cost===0)continue;const [q,r]=k.split(',').map(Number),p=pos({q,r});hex(c,p.x,p.y,R-1);c.fillStyle='#b8d6a432';c.fill();c.strokeStyle='#d0e1ac42';c.lineWidth=.8;c.stroke();}
   if(['attack','tactic','confuse','fire'].includes(this.mode)){
    const range=this.mode==='confuse'?2+(e.hasSkill(selected,'귀모')?1:0):this.mode==='fire'?2:D.troops[selected.type].range;
    for(const t of MAP.tiles.filter(t=>distance(t,selected)>0&&distance(t,selected)<=range)){const p=pos(t);hex(c,p.x,p.y,R-2);c.fillStyle='#d9aa7b16';c.fill();c.strokeStyle='#d8aa7b38';c.stroke();}
   }
  }
  // City development appears on the map when close enough or when selected.
  if(cam.zoom>.65)for(const city of s.cities.filter(visible))for(const b of city.buildings){const t=city.development[b.slot],p=pos(t);if(b.remaining){c.strokeStyle='#c8b77d7a';c.setLineDash([2,2]);c.strokeRect(p.x-6,p.y-5,12,10);c.setLineDash([]);continue;}if(b.type==='farm'){c.fillStyle='#a9a06788';c.fillRect(p.x-7,p.y-5,14,10);c.strokeStyle='#4f653b';for(let j=0;j<4;j++){c.beginPath();c.moveTo(p.x-6+j*4,p.y-5);c.lineTo(p.x-6+j*4,p.y+5);c.stroke();}}else{c.fillStyle='#252f25b0';c.fillRect(p.x-5,p.y-1,11,7);c.fillStyle=b.type==='market'?'#c5b187':'#9b9b7a';c.fillRect(p.x-6,p.y-4,12,6);c.fillStyle='#4a5145';c.beginPath();c.moveTo(p.x-8,p.y-4);c.lineTo(p.x,p.y-10);c.lineTo(p.x+8,p.y-4);c.closePath();c.fill();}}
  for(const city of s.cities.filter(visible))this.cityDrawing(c,city,selected?.id===city.id);
  for(const u of s.units.filter(visible))this.unitDrawing(c,u,selected?.id===u.id,now);
  for(const f of s.fires.filter(visible)){const p=pos(f);c.fillStyle='#f0b064b0';c.beginPath();c.moveTo(p.x-6,p.y+5);c.quadraticCurveTo(p.x-10,p.y-1,p.x-2,p.y-15);c.quadraticCurveTo(p.x+1,p.y-4,p.x+5,p.y-10);c.quadraticCurveTo(p.x+14,p.y+8,p.x-6,p.y+5);c.fill();c.fillStyle='#eb7a4ac0';c.beginPath();c.ellipse(p.x+2,p.y+2,5,7,0,0,Math.PI*2);c.fill();}
  if(this.hover&&e.tile(this.hover)){const p=pos(this.hover);hex(c,p.x,p.y,R-1);c.strokeStyle='#eee1b0aa';c.lineWidth=1.3/cam.zoom;c.stroke();if(selected?.officers&&this.mode!=='move'){const a=pos(selected);c.strokeStyle='#e0c29199';c.lineWidth=1.2/cam.zoom;c.setLineDash([4,4]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(p.x,p.y);c.stroke();c.setLineDash([]);}}
  c.restore();
  // Screen-space labels retain legibility while zoomed out.
  for(const city of s.cities.filter(visible))this.cityLabel(c,city,selected?.id===city.id);
  for(const u of s.units.filter(visible))this.unitLabel(c,u,selected?.id===u.id,now);
  for(const f of this.fx){if(f.type==='battle'){this.drawBattle(c,f,now);continue;}if(!f.at||now<f.time)continue;const p=this.toScreen(f.at),age=clamp((now-f.time)/(f.duration||1550),0,1);c.globalAlpha=1-age;c.font='bold 15px "Malgun Gothic",sans-serif';c.textAlign='center';c.strokeStyle='#172329';c.lineWidth=4;c.strokeText(f.text||'',p.x,p.y-20-age*40);c.fillStyle=f.color||'#eedba5';c.fillText(f.text||'',p.x,p.y-20-age*40);c.globalAlpha=1;}
  const v=c.createRadialGradient(this.width/2,this.height/2,this.width*.2,this.width/2,this.height/2,this.width*.75);v.addColorStop(0,'#132b2400');v.addColorStop(1,'#0a1c203f');c.fillStyle=v;c.fillRect(0,0,this.width,this.height);
  this.drawMini(e);this.stats={mode:'2d',tiles:MAP.tiles.length,units:s.units.length,drawCount:this.drawCount};for(const u of s.units)this.unitCache.set(u.id,{...u});root.document.getElementById('zoom-label').textContent=Math.round(cam.zoom*100)+'%';
 }
 cityDrawing(c,city,selected){const p=pos(city),f=D.factions.find(f=>f.id===city.faction);c.save();c.translate(p.x,p.y);c.fillStyle='#0e231f70';c.beginPath();c.ellipse(3,8,23,10,0,0,Math.PI*2);c.fill();if(selected){hex(c,0,0,R+4);c.strokeStyle='#edd494';c.lineWidth=2.2;c.stroke();}c.fillStyle='#7f8270';c.fillRect(-16,-8,32,21);c.strokeStyle='#b1ad8b';c.lineWidth=1;c.strokeRect(-16,-8,32,21);c.fillStyle='#3b4e42';c.fillRect(-12,-5,24,16);c.fillStyle='#aba58a';c.fillRect(-8,-11,16,13);c.fillStyle='#35473f';c.beginPath();c.moveTo(-13,-11);c.lineTo(0,-18);c.lineTo(13,-11);c.closePath();c.fill();c.strokeStyle='#c3b68c';c.beginPath();c.moveTo(-13,-11);c.lineTo(0,-18);c.lineTo(13,-11);c.stroke();c.fillStyle='#283c34';c.fillRect(-4,4,8,9);for(const x of [-18,12]){c.fillStyle='#b0ab8d';c.fillRect(x,-11,7,7);c.fillRect(x,9,7,7);c.fillStyle='#4c5b4a';c.fillRect(x-1,-14,9,4);}c.strokeStyle='#c7bc8d';c.beginPath();c.moveTo(14,-6);c.lineTo(14,-35);c.stroke();c.fillStyle=f.color;c.beginPath();c.moveTo(14,-34);c.lineTo(32,-34);c.lineTo(29,-18);c.lineTo(14,-21);c.closePath();c.fill();c.fillStyle='#24302b';c.font='11px serif';c.textAlign='center';c.fillText(f.banner,22,-23);c.restore();}
 unitWorld(u,now){const m=this.moves.get(u.id);if(!m)return pos(u);const path=m.path||[m.from,m.to],total=path.length-1;if(total<1)return pos(u);const progress=clamp((now-m.time)/(m.duration||500),0,1)*total,k=Math.min(total-1,Math.floor(progress)),a=pos(path[k]),b=pos(path[k+1]),t=progress-k;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
 unitDrawing(c,u,selected,now){const p=this.unitWorld(u,now),f=D.factions.find(f=>f.id===u.faction);c.save();c.translate(p.x,p.y);c.fillStyle='#0c211e70';c.beginPath();c.ellipse(1,8,16,7,0,0,Math.PI*2);c.fill();if(selected){c.strokeStyle='#f4dc99';c.lineWidth=2;c.beginPath();c.arc(0,-2,19,0,Math.PI*2);c.stroke();}c.fillStyle=u.acted?'#31413d':f.color;c.strokeStyle='#152a25';c.lineWidth=2;c.beginPath();c.arc(0,-2,13,0,Math.PI*2);c.fill();c.stroke();c.fillStyle=u.acted?f.color:'#243029';c.font='bold 16px serif';c.textAlign='center';c.fillText(D.troops[u.type].glyph,0,4);c.fillStyle='#142925';c.fillRect(-14,15,28,3);c.fillStyle=f.color;c.fillRect(-14,15,28*Math.min(1,u.troops/10000),3);if(u.confused){c.fillStyle='#d7b2db';c.font='bold 12px sans-serif';c.fillText('?',14,-12);}else if(u.acted){c.fillStyle='#c0cbb1';c.font='11px sans-serif';c.fillText('✓',13,-12);}c.restore();}
 cityLabel(c,city,selected){const p=this.toScreen(city),zoom=this.camera.zoom;const yy=p.y+(zoom>.55?25:16),f=D.factions.find(f=>f.id===city.faction);c.font=(selected?'600 ':'')+(zoom<.45?'10':'12')+'px "Malgun Gothic","Apple SD Gothic Neo",sans-serif';c.textAlign='center';const w=c.measureText(city.name).width+17;c.fillStyle=selected?'#16262af5':'#182c2be8';c.strokeStyle=selected?'#d2b77888':f.color+'50';c.lineWidth=1;roundRect(c,p.x-w/2,yy-11,w,19,3);c.fill();c.stroke();c.fillStyle=selected?'#efdcaa':'#d4d7bc';c.fillText(city.name,p.x,yy+2);if(zoom>.85){c.font='9px "Segoe UI",sans-serif';c.fillStyle='#d7d1ae';c.shadowColor='#142e27';c.shadowBlur=4;c.fillText((city.troops/1000).toFixed(1)+'k',p.x,yy+21);c.shadowBlur=0;}if(city.hp<city.maxHP){c.fillStyle='#122826';c.fillRect(p.x-w/2,yy+10,w,2);c.fillStyle='#ca9b6e';c.fillRect(p.x-w/2,yy+10,w*city.hp/city.maxHP,2);}}
 unitLabel(c,u,selected,now){if(this.camera.zoom<.5&&!selected)return;const w=this.unitWorld(u,now),p={x:(w.x-this.camera.x)*this.camera.zoom+this.width/2,y:(w.y-this.camera.y)*this.camera.zoom+this.height/2};c.font='9px "Segoe UI","Malgun Gothic",sans-serif';c.textAlign='center';const text=(selected?u.name.replace(' 부대','')+' · ':'')+(u.troops/1000).toFixed(1)+'k',width=c.measureText(text).width+10;c.fillStyle='#142725e8';roundRect(c,p.x-width/2,p.y-32,width,16,2);c.fill();c.fillStyle=selected?'#efdaa3':'#cad2b9';c.fillText(text,p.x,p.y-21);}
 drawMini(e){const c=this.mc,w=this.mini.width,hh=this.mini.height;c.clearRect(0,0,w,hh);c.fillStyle='#263b39';c.fillRect(0,0,w,hh);const sx=w/this.worldW,sy=hh/this.worldH;c.drawImage(this.terrain,0,0,w,hh);c.fillStyle='#132c3266';c.fillRect(0,0,w,hh);for(const city of e.s.cities){const p=pos(city);c.fillStyle=D.factions.find(f=>f.id===city.faction).color;c.fillRect(p.x*sx-2,p.y*sy-2,4,4);}for(const u of e.ownUnits()){const p=pos(u);c.fillStyle='#f0e3b8';c.fillRect(p.x*sx-1,p.y*sy-1,2,2);}const cam=this.camera;c.strokeStyle='#eddeb68f';c.lineWidth=1;c.strokeRect((cam.x-this.width/2/cam.zoom)*sx,(cam.y-this.height/2/cam.zoom)*sy,this.width/cam.zoom*sx,this.height/cam.zoom*sy);}
}
root.RTK2DRenderer=Renderer;
})(window);
