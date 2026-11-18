/* Original procedural artwork. All geometry is authored for this playable adaptation. */
(function(global){
'use strict';
const W=1000,H=620,TAU=Math.PI*2;
const PALETTES={
 forest:{ground:'#71894f',light:'#91a15f',dark:'#4b6a40',grass:'#526f38',tree:'#39623d',treeLight:'#63864a',trunk:'#71563c',road:'#c1a876',roadLight:'#d2bc8a',roadShade:'#987b54',water:'#527d7b',waterLight:'#8bb4a4',rock:'#818d7b',sky:'#dae0aa'},
 snow:{ground:'#b9cfc8',light:'#e2e7d9',dark:'#8eafa8',grass:'#769b8d',tree:'#355e55',treeLight:'#5d8271',trunk:'#5b5145',road:'#a4a99a',roadLight:'#c0bdab',roadShade:'#758b80',water:'#668d9a',waterLight:'#afdae0',rock:'#789494',sky:'#ebf4e8'},
 ash:{ground:'#746452',light:'#96826a',dark:'#504a44',grass:'#5e5245',tree:'#4c4a37',treeLight:'#6b6246',trunk:'#483b34',road:'#ac9070',roadLight:'#c2a77e',roadShade:'#786350',water:'#a75536',waterLight:'#ec9c4e',rock:'#645c57',sky:'#d1a16a'}
};
function hash(s){let x=2166136261;for(let i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,16777619);}return x>>>0;}
function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function clamp(x,a,b){return Math.max(a,Math.min(b,x));}
function circle(c,x,y,r,fill,stroke,lw){c.beginPath();c.arc(x,y,r,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke();}}
function ellipse(c,x,y,rx,ry,fill,stroke,lw){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke();}}
function poly(c,pts,fill,stroke,lw){if(!pts.length)return;c.beginPath();c.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke();}}
function line(c,x1,y1,x2,y2,color,width){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.strokeStyle=color;c.lineWidth=width||1;c.stroke();}
function roundRect(c,x,y,w,h,r,fill,stroke,lw){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=lw||1;c.stroke();}}
function pointSeg(x,y,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],f=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a[0]-f*dx,y-a[1]-f*dy);}
function distRoad(x,y,paths){let d=Infinity;for(const p of paths)for(let i=1;i<p.length;i++)d=Math.min(d,pointSeg(x,y,p[i-1],p[i]));return d;}
function pathStroke(c,paths,color,width){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';for(const p of paths){if(!p.length)continue;c.beginPath();c.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)c.lineTo(p[i][0],p[i][1]);c.stroke();}}
function seedId(v){return typeof v==='number'?v:hash(String(v||''));}

class KRRenderer{
 constructor(canvas,data){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.data=data;this.terrain=null;this.terrainKey='';this.lastWorld=null;this.dpr=1;this.resize();}
 resize(){const r=this.canvas.getBoundingClientRect();const dpr=Math.min(global.devicePixelRatio||1,2);const width=Math.max(1,Math.round((r.width||1000)*dpr));const height=Math.max(1,Math.round((r.height||620)*dpr));if(this.canvas.width!==width||this.canvas.height!==height){this.canvas.width=width;this.canvas.height=height;}this.dpr=dpr;}
 cache(stage){const key=stage.id+'|'+(stage.biome||'forest');if(this.terrainKey===key&&this.terrain)return;const cv=document.createElement('canvas');cv.width=W*2;cv.height=H*2;const c=cv.getContext('2d');c.scale(2,2);this.paintTerrain(c,stage);this.terrain=cv;this.terrainKey=key;}
 paintTerrain(c,stage){
  const pal=PALETTES[stage.biome]||PALETTES.forest;const rng=random(hash(stage.id||'map'));const paths=stage.paths||[];const sites=stage.sites||[];
  c.fillStyle=pal.ground;c.fillRect(0,0,W,H);
  let g=c.createLinearGradient(0,0,1000,620);g.addColorStop(0,pal.light);g.addColorStop(.45,pal.ground);g.addColorStop(1,pal.dark);c.fillStyle=g;c.fillRect(0,0,W,H);
  // Broad mottled hills and thousands of low contrast marks create a painted terrain.
  for(let i=0;i<130;i++){c.globalAlpha=.035+rng()*.075;ellipse(c,rng()*W,rng()*H,25+rng()*130,15+rng()*65,rng()>.5?pal.light:pal.dark);}c.globalAlpha=1;
  for(let i=0;i<3200;i++){let x=rng()*W,y=rng()*H;c.globalAlpha=.08+rng()*.13;line(c,x,y,x+rng()*3-1.5,y-1-rng()*3,rng()>.45?pal.grass:pal.light,.7);}c.globalAlpha=1;
  const creekX=570+(rng()-.5)*100;const hasCreek=stage.biome!=='ash'&&(stage.order||1)%3!==0;
  if(hasCreek){c.save();c.beginPath();c.moveTo(creekX-70,-30);c.bezierCurveTo(creekX+65,120,creekX-40,350,creekX+60,650);c.strokeStyle='rgba(28,58,47,.2)';c.lineWidth=45;c.stroke();c.strokeStyle='#69866b';c.lineWidth=37;c.stroke();c.strokeStyle=pal.water;c.lineWidth=28;c.stroke();c.strokeStyle=pal.waterLight;c.lineWidth=2;c.globalAlpha=.55;c.stroke();c.restore();}
  if(stage.biome==='ash'){
   for(let i=0;i<8;i++){const x=rng()*1000,y=rng()*620;if(distRoad(x,y,paths)<65)continue;ellipse(c,x,y,20+rng()*45,10+rng()*20,'#4d4039');ellipse(c,x,y-2,16+rng()*24,5+rng()*7,'#ad5d32');ellipse(c,x,y-3,9+rng()*13,2+rng()*4,'#df9c51');}
  }
  pathStroke(c,paths,'rgba(35,43,27,.17)',54);pathStroke(c,paths,pal.roadShade,47);pathStroke(c,paths,pal.road,41);pathStroke(c,paths,pal.roadLight,30);
  c.save();c.globalAlpha=.18;pathStroke(c,paths,pal.road,18);c.restore();
  // Small flattened stones and wheel ruts stay away from sites.
  for(let i=0;i<560;i++){let x=rng()*1000,y=rng()*620,d=distRoad(x,y,paths);if(d<18){c.globalAlpha=.17+rng()*.18;ellipse(c,x,y,1+rng()*3,.6+rng()*1.5,rng()>.5?pal.roadShade:'#f6ddb2');}}
  c.globalAlpha=1;
  if(hasCreek){
   for(const p of paths)for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i];const center=creekX+(-70+130*((a[1]+b[1])*.5/620));if((a[0]-center)*(b[0]-center)>0||Math.abs(a[0]-b[0])<20)continue;const t=(center-a[0])/(b[0]-a[0]);if(t<0||t>1)continue;const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;this.bridge(c,x,y,Math.atan2(b[1]-a[1],b[0]-a[0]));}
  }
  // Farmland, stumps, gravestones and scattered rocks.
  const isSafe=(x,y,clear=60)=>distRoad(x,y,paths)>clear&&sites.every(s=>Math.hypot(s.x-x,s.y-y)>62);
  if(stage.biome==='forest'&&(stage.order||1)<5){for(let i=0;i<3;i++){const x=60+i*110,y=520+(i%2)*13;if(isSafe(x+40,y+20,60)){c.save();c.translate(x,y);c.rotate(-.13);roundRect(c,0,0,78,42,3,'#8b8050','#5d6b3c',1.5);for(let j=0;j<6;j++){line(c,6,6+j*6,72,6+j*6,'#b1ae6e',2);for(let k=0;k<8;k++)line(c,9+k*8,6+j*6,10+k*8,2+j*6,'#6b8a42',2);}c.restore();}}}
  for(let i=0;i<48;i++){let x=16+rng()*968,y=25+rng()*565;if(!isSafe(x,y,41))continue;const s=.6+rng()*.7;this.rock(c,x,y,s,pal);}
  for(let i=0;i<42;i++){let x=15+rng()*970,y=24+rng()*570;if(!isSafe(x,y,43))continue;if(rng()>.45)this.grass(c,x,y,pal,rng);else{circle(c,x,y,1.9,stage.biome==='snow'?'#e9efdf':'#dec26e');circle(c,x+4,y-2,1.4,'#e4dbb0');}}
  // Edge forest uses deterministic places and rejects all playable corridors.
  const trees=[];
  for(let i=0;i<330;i++){const x=-15+rng()*1030,y=-15+rng()*660;const edge=Math.min(x,W-x,y,H-y);if(edge>85&&rng()>.24)continue;if(!isSafe(x,y,57))continue;trees.push({x,y,s:.55+rng()*.6,type:rng()});}
  trees.sort((a,b)=>a.y-b.y);for(const t of trees){if(stage.biome==='ash'&&t.type>.42)this.deadTree(c,t.x,t.y,t.s);else this.tree(c,t.x,t.y,t.s,pal,stage.biome==='snow',t.type);}
  // Unbuilt clearings in the static layer; interaction rendering sits on top.
  for(const s of sites){ellipse(c,s.x+2,s.y+5,31,19,'rgba(38,50,27,.21)');ellipse(c,s.x,s.y+1,29,17,pal.roadShade);ellipse(c,s.x,s.y-1,26,15,'#bdac7c');ellipse(c,s.x,s.y-1,22,12,'#cbb987');}
  // Castles protect each unique exit.
  const endings=[];for(const p of paths){const e=p[p.length-1];if(!e)continue;if(endings.every(a=>Math.hypot(a[0]-e[0],a[1]-e[1])>80))endings.push(e);}
  for(const e of endings)this.castle(c,clamp(e[0],28,972),clamp(e[1],44,587),pal);
  for(const p of paths){if(!p.length)continue;this.entry(c,clamp(p[0][0],18,982),clamp(p[0][1],30,590),pal);}
  // Warm light and cool edge shade are composited once, not each frame.
  g=c.createRadialGradient(200,70,15,400,200,640);g.addColorStop(0,'rgba(255,231,166,.14)');g.addColorStop(.6,'rgba(255,231,166,0)');g.addColorStop(1,'rgba(13,29,21,.16)');c.fillStyle=g;c.fillRect(0,0,W,H);
 }
 bridge(c,x,y,a){c.save();c.translate(x,y);c.rotate(a);roundRect(c,-29,-25,58,50,2,'#785e43','#514c37',2);for(let i=0;i<8;i++){let xx=-26+i*7;line(c,xx,-22,xx,22,i%2?'#ae9262':'#c4a673',6);line(c,xx+3,-22,xx+3,22,'#6a5840',.8);}line(c,-31,-25,31,-25,'#4c4635',4);line(c,-31,24,31,24,'#4c4635',4);for(const xx of [-29,29])for(const yy of [-25,24]){roundRect(c,xx-3,yy-7,6,11,1,'#8b7251','#493f2f',1);circle(c,xx,yy-7,3,'#c6aa76');}c.restore();}
 tree(c,x,y,s,p,snow,type){c.save();c.translate(x,y);c.scale(s,s);ellipse(c,5,4,23,11,'rgba(24,43,29,.22)');roundRect(c,-4,-17,8,25,2,p.trunk,'#40503a',1);if(type>.62||snow){poly(c,[[-23,-9],[0,-52],[24,-9]],p.tree,'#2c4d39',1.8);poly(c,[[-20,-24],[0,-66],[20,-24]],p.treeLight,'#2c4d39',1.8);poly(c,[[-16,-41],[0,-78],[16,-41]],p.tree,'#2c4d39',1.6);poly(c,[[-9,-44],[0,-72],[8,-48]],snow?'#d0e0d3':'#7e9957');if(snow){poly(c,[[-17,-25],[0,-58],[9,-39],[2,-42],[-5,-26]],'#c4d9cd');poly(c,[[-20,-10],[-11,-29],[-8,-19],[0,-22],[13,-13]],'#c4d9cd');}}else{ellipse(c,-9,-29,20,20,p.tree,'#33533a',1.5);ellipse(c,11,-27,18,20,p.tree,'#33533a',1.5);ellipse(c,1,-46,24,23,p.treeLight,'#33533a',1.6);ellipse(c,-9,-45,13,15,'#71934f');ellipse(c,-3,-57,14,10,'rgba(173,190,99,.22)');line(c,-9,-17,8,-7,'#3a583b',2);}c.restore();}
 deadTree(c,x,y,s){c.save();c.translate(x,y);c.scale(s,s);ellipse(c,4,3,18,7,'rgba(23,23,20,.2)');poly(c,[[-5,5],[-4,-22],[-14,-38],[-10,-39],[-1,-28],[2,-55],[5,-54],[6,-30],[19,-46],[22,-43],[7,-19],[8,6]],'#5b4c3c','#443c31',1.4);line(c,-4,-26,-19,-25,'#5b4c3c',3);c.restore();}
 rock(c,x,y,s,p){c.save();c.translate(x,y);c.scale(s,s);ellipse(c,3,2,13,6,'rgba(37,46,34,.2)');poly(c,[[-12,0],[-10,-10],[-2,-17],[8,-13],[13,-3],[7,3]],p.rock,'rgba(45,60,47,.7)',1.4);poly(c,[[-10,-10],[-2,-17],[8,-13],[1,-8]],'rgba(224,230,197,.24)');line(c,1,-8,0,1,'rgba(32,43,35,.2)',1);c.restore();}
 grass(c,x,y,p,rng){for(let i=0;i<5;i++){const dx=(i-2)*2;line(c,x,y,x+dx,y-4-(i%2)*4,p.grass,1.1);}if(rng()>.65){circle(c,x-2,y-6,1.6,'#d0c16d');circle(c,x+3,y-7,1.3,'#d9d5a5');}}
 castle(c,x,y,p){c.save();c.translate(x,y);ellipse(c,1,8,34,15,'rgba(23,38,31,.24)');roundRect(c,-27,-35,54,40,3,'#a1aaa0','#455d56',2);roundRect(c,-32,-53,17,56,2,'#bbc0ad','#455d56',2);roundRect(c,15,-53,17,56,2,'#bbc0ad','#455d56',2);for(const xx of [-32,-25,-18,15,22,29])roundRect(c,xx,-59,5,10,1,'#c8cbb7','#455d56',1);roundRect(c,-9,-20,18,25,8,'#3f594e','#526b60',2);for(let i=0;i<3;i++)line(c,-5+i*5,-16,-5+i*5,2,'#8c9a7c',1);for(const xx of [-25,23])roundRect(c,xx-2,-36,4,9,1,'#526a60');line(c,0,-37,0,-77,'#514e38',2);poly(c,[[1,-77],[24,-73],[19,-62],[1,-65]],'#477caa','#264e72',1.4);poly(c,[[10,-72],[13,-68],[10,-65],[7,-68]],'#e5cb82');c.restore();}
 entry(c,x,y,p){c.save();c.translate(x,y);line(c,9,4,9,-31,'#5a4b37',3);poly(c,[[10,-31],[34,-27],[27,-20],[10,-22]],'#9a4c3b','#673e30',1.5);ellipse(c,9,5,7,3,'rgba(26,37,26,.2)');c.restore();}
 draw(world,ui={},wallTime=0){
  if(!world||!world.stage)return;this.lastWorld=world;this.resize();this.cache(world.stage);const c=this.ctx;c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);c.globalAlpha=1;c.clearRect(0,0,W,H);c.drawImage(this.terrain,0,0,W,H);const t=world.time||0,wt=wallTime;
  this.ambient(c,world.stage,wt);
  const selected=world.towers.find(a=>a.id===ui.selectedTowerId);if(selected){const def=this.data.towers[selected.defId]||{};const selectedRange=typeof world.range==='function'?world.range(selected):def.range||130;this.range(c,selected.x,selected.y,selectedRange,'#9de5bd',.1,selected.disabled>0);}
  for(let i=0;i<world.stage.sites.length;i++){const s=world.stage.sites[i];if(!world.towers.some(a=>a.siteIndex===i))this.pad(c,s.x,s.y,ui.selectedSite===i,wt);}
  if(selected&&selected.rally&&(this.data.towers[selected.defId]?.family==='barracks'||(selected.skills?.summon_elemental||0)>0)){this.flag(c,selected.rally.x,selected.rally.y,wt,selected.defId==='sorcerer'?'#83c389':'#6599cc');line(c,selected.x,selected.y+8,selected.rally.x,selected.rally.y,'rgba(177,215,192,.35)',1);}
  const objects=[];for(const a of world.towers)objects.push({y:a.y+12,draw:()=>this.tower(c,a,this.data.towers[a.defId]||{},selected===a,wt)});for(const a of world.enemies){if(a.hp<=0)continue;objects.push({y:a.y+(a.air?30:0),draw:()=>this.enemy(c,a,t,wt)});}for(const a of world.units){if(a.hp<=0)continue;objects.push({y:a.y+1,draw:()=>this.unit(c,a,world,ui,t)});}objects.sort((a,b)=>a.y-b.y);for(const a of objects)a.draw();
  for(const a of world.projectiles)this.projectile(c,a,t);for(const a of world.effects)this.effect(c,a,wt);
  if(world.hero&&world.hero.hp<=0){const h=world.hero;ellipse(c,h.x,h.y,16,9,'rgba(128,177,214,.18)','#83b2cf',1);c.save();c.fillStyle='#bad6e9';c.font='bold 13px system-ui';c.textAlign='center';c.fillText('✦',h.x,h.y-4);c.restore();}
  if(ui.placementMode&&ui.pointer)this.placement(c,ui,world,wt);
  if(ui.selectedHero&&world.hero?.hp>0){const h=world.hero;c.save();c.setLineDash([4,4]);ellipse(c,h.x,h.y+2,19,11,null,'#f0d88c',1.6);c.restore();}
  if(world.state==='ready'&&world.towers.length===0){const s=world.stage.sites[1]||world.stage.sites[0];if(s){const y=s.y-40+Math.sin(wt*3)*3;poly(c,[[s.x-5,y],[s.x+5,y],[s.x,y+7]],'#fff0ba');}}
 }
 renderPreview(stage,wallTime=0){this.draw({stage,towers:[],enemies:[],units:[],projectiles:[],effects:[],time:0,state:'preview'}, {},wallTime);}
 ambient(c,stage,t){const p=PALETTES[stage.biome]||PALETTES.forest;c.save();if(stage.biome==='snow'){c.fillStyle='#f7f4e7';for(let i=0;i<35;i++){const x=(i*83+Math.sin(t*.4+i)*17+t*5)%W,y=(i*97+t*12)%H;c.globalAlpha=.25+(i%3)*.1;circle(c,x,y,1+(i%3)*.35,'#f6f7e8');}}else if(stage.biome==='ash'){for(let i=0;i<14;i++){c.globalAlpha=.12+.15*Math.sin(t+i)**2;circle(c,(i*97+Math.sin(t*.5+i)*10)%W,H-((i*67+t*8)%H),1+(i%2),'#f5bd69');}}else{for(let i=0;i<9;i++){const x=(i*137+60+Math.sin(t*.23+i)*24)%W,y=(i*71+100+Math.cos(t*.27+i)*15)%H;c.globalAlpha=.13+.12*Math.sin(t*2+i)**2;circle(c,x,y,1.6,'#fff7bb');}c.globalAlpha=.022;c.fillStyle='#eef1c9';for(let i=0;i<3;i++){const x=((t*6+i*420)%1500)-300;ellipse(c,x,80+i*80,150,36,'#eef1c9');}}c.restore();}
 range(c,x,y,r,col,alpha,disabled){c.save();c.fillStyle=col;c.globalAlpha=alpha;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.globalAlpha=.62;c.strokeStyle=disabled?'#d8e9ef':col;c.lineWidth=1.5;c.setLineDash([5,6]);c.stroke();c.restore();}
 pad(c,x,y,active,t){c.save();if(active){ellipse(c,x,y,33,20,'rgba(255,227,135,.2)','#ffe7a5',2);for(let i=0;i<4;i++){const a=i*TAU/4+t*.25;line(c,x+Math.cos(a)*34,y+Math.sin(a)*21,x+Math.cos(a)*39,y+Math.sin(a)*24,'#ffe7a5',2);}}ellipse(c,x,y-1,18,10,'#a89669','rgba(79,74,45,.35)',1);line(c,x-5,y-1,x+5,y-1,active?'#fff1bf':'#e8d8a1',2.5);line(c,x,y-6,x,y+4,active?'#fff1bf':'#e8d8a1',2.5);for(const [dx,dy] of [[-24,0],[22,-3],[-13,13],[13,13]])ellipse(c,x+dx,y+dy,3.8,2.5,'#c9bf96','#8b825b',.5);c.restore();}
 flag(c,x,y,t,col){c.save();ellipse(c,x,y+1,9,4,'rgba(44,62,40,.2)');line(c,x,y,x,y-25,'#5a4c32',2);poly(c,[[x,y-25],[x+14,y-23+Math.sin(t*4)*1.5],[x+11,y-16],[x,y-18]],col,'#3f5363',1);c.restore();}
 tower(c,a,def,selected,t){
  const x=a.x,y=a.y,level=def.tier||1,id=a.defId||'',fam=def.family||'archer';c.save();c.translate(x,y);
  if(selected)ellipse(c,0,6,32,18,'rgba(221,242,177,.1)','#dceaaa',1.5);ellipse(c,8,9,31,15,'rgba(26,36,28,.25)');
  const stone=level>=3?'#a8ad98':'#9a9d7b';ellipse(c,0,8,29,16,stone,'#545e45',2);ellipse(c,-2,4,26,13,'#b8b99a','#6a7256',1);
  if(fam==='barracks'){
   const barb=id==='barbarians',holy=id==='holy_order';const wall=barb?'#9a7450':holy?'#d4cbb0':'#c1b99a';const roof=barb?'#a75840':holy?'#d1ad55':'#467e9a';
   roundRect(c,-24,-20,48,28,2,wall,'#52604b',2);poly(c,[[-27,-20],[0,-43],[28,-20]],roof,'#43594c',2);poly(c,[[-27,-20],[0,-43],[0,-20]],barb?'#c17b4f':holy?'#e1c47b':'#6199b1');
   roundRect(c,-8,-9,16,18,7,barb?'#513e2d':'#4f6557','#696e4f',1.5);line(c,0,-7,0,7,'#a1a280',1);
   for(const xx of [-17,16])roundRect(c,xx-3,-11,6,7,1,'#566d5b');
   if(level>=2){for(const xx of [-26,25]){roundRect(c,xx-5,-30,10,36,1,wall,'#59604a',1.7);for(let j=0;j<2;j++)roundRect(c,xx-5+j*6,-35,4,7,.5,wall,'#59604a',1);}}
   if(level>=3){roundRect(c,-14,-28,28,7,1,wall,'#59604a',1.3);for(let j=0;j<4;j++)roundRect(c,-15+j*8,-33,5,7,.4,wall,'#59604a',1);}
   if(holy){circle(c,0,-40,7,'#ecd58e','#786b40',1.5);line(c,0,-45,0,-35,'#fff3be',2.5);line(c,-4,-41,4,-41,'#fff3be',2.5);}else if(barb){line(c,-12,-36,12,-52,'#d9d6b8',3);line(c,12,-36,-12,-52,'#d9d6b8',3);poly(c,[[-13,-54],[-20,-46],[-12,-44],[-8,-49]],'#bfc5ae','#59655a',1);poly(c,[[13,-54],[20,-46],[12,-44],[8,-49]],'#bfc5ae','#59655a',1);}
   this.miniFlag(c,20,-43,roof,t);
  }else if(fam==='archer'){
   const ranger=id==='rangers',musket=id==='musketeer';const wood=musket?'#b4ad8f':'#a68350';const roof=ranger?'#527e4e':musket?'#496b87':'#5d839a';
   if(ranger){roundRect(c,-22,-24,44,31,2,'#8e7950','#4b5940',2);poly(c,[[-30,-24],[-6,-48],[7,-47],[29,-24]],'#547c43','#3b563b',2);poly(c,[[-24,-30],[-7,-48],[8,-45],[3,-33]],'#7d9a4d');line(c,-23,0,23,0,'#b79d61',3);roundRect(c,-7,-17,14,24,5,'#425d3d');this.tinyArcher(c,-13,-27,t);this.tinyArcher(c,15,-27,t+.5);}
   else{
    for(const xx of [-15,15]){poly(c,[[xx-5,7],[xx-4,-28],[xx+4,-28],[xx+5,7]],wood,'#5c5b3c',1.5);}
    line(c,-17,6,16,-23,'#8b7249',3);line(c,17,6,-16,-23,'#8b7249',3);
    roundRect(c,-23,-34,46,15,2,wood,'#4b5b45',2);for(let j=0;j<5;j++)roundRect(c,-23+j*10,-39,6,9,1,'#c3ad79','#4b5b45',1);
    if(level>=2){poly(c,[[-28,-42],[0,-61],[29,-42]],roof,'#3f5960',1.8);poly(c,[[-28,-42],[0,-61],[0,-42]],'#7c9aab');}
    if(level>=3){roundRect(c,-17,-25,34,30,1,musket?'#a6ad96':'#a78c58','#5c654d',1.5);roundRect(c,-4,-10,8,15,2,'#57654e');for(let i=0;i<3;i++)line(c,-16,-19+i*8,16,-19+i*8,'rgba(60,69,48,.3)',1);}
    this.tinyArcher(c,-11,-35,t,musket);this.tinyArcher(c,11,-35,t+.8,musket);if(musket){roundRect(c,-25,-21,50,6,1,'#69869a','#405a61',1.5);this.miniFlag(c,18,-63,'#b1c6cb',t);}
   }
  }else if(fam==='mage'){
   const sorcerer=id==='sorcerer',arcane=id==='arcane';const color=sorcerer?'#6da985':arcane?'#ac80c5':'#8c8cb5';
   poly(c,[[-20,4],[-15,-34],[14,-34],[22,4]],'#b6b6a1','#4d6558',2);poly(c,[[-20,4],[-15,-34],[-4,-34],[-7,4]],'#ced0b4');
   for(let i=0;i<4;i++)line(c,-16+i%2*2,-2-i*8,16-i%2*2,-2-i*8,'rgba(70,88,71,.33)',1);
   roundRect(c,-5,-15,10,19,4,'#486451','#829a7b',1.5);
   poly(c,[[-24,-34],[0,-63],[23,-34]],color,'#4c5267',2);poly(c,[[-24,-34],[0,-63],[-5,-34]],sorcerer?'#8dc5a0':arcane?'#c2a0d9':'#a8aed0');
   if(level>=2){roundRect(c,-21,-31,42,6,1,'#d0ceb3','#5d6e5d',1);circle(c,0,-43,5,'#d8e8b1',color,2);}
   if(level>=3){for(const xx of [-20,20]){roundRect(c,xx-4,-21,8,28,1,'#a6af93','#546851',1);poly(c,[[xx-7,-21],[xx,-34],[xx+7,-21]],color,'#4c5267',1);}}
   if(level===4){const pulse=.7+Math.sin(t*3)*.15;c.save();c.globalAlpha=.2*pulse;circle(c,0,-65,15,color);c.globalAlpha=1;poly(c,[[0,-80],[7,-66],[0,-53],[-7,-66]],sorcerer?'#c4f0a4':'#e1b7f2',color,1.5);line(c,0,-77,0,-57,'#f6e5fa',1);c.restore();}
   else{circle(c,0,-64,3,'#e2de96','#8f9b6f',1);}
  }else{
   const tesla=id==='tesla',bertha=id==='bertha';roundRect(c,-24,-13,48,20,3,'#918d73','#4d5848',2);for(let j=0;j<4;j++)roundRect(c,-26+j*15,-14,9,9,1,'#b7ad87','#5b6250',1);
   if(tesla){roundRect(c,-13,-33,26,27,3,'#6c8d8a','#40585a',2);for(const xx of [-17,17]){roundRect(c,xx-3,-48,6,43,2,'#c1a96b','#5c624b',1);for(let i=0;i<4;i++)ellipse(c,xx,-39+i*6,7,3,'#a8a38c','#50625a',1);circle(c,xx,-50,7,'#b4d8dc','#647b7d',1.6);}roundRect(c,-8,-44,16,11,2,'#657b77','#40585a',1.5);ellipse(c,0,-46,14,5,'#d4dec1','#6b8075',1.5);circle(c,0,-48,5,'#b8e7ec');if(Math.sin(t*7)>.3){c.save();c.shadowColor='#8ae9ec';c.shadowBlur=10;poly(c,[[-17,-51],[-9,-57],[-3,-49],[7,-59],[17,-51]],null,'#bbffff',1.4);c.restore();}}
   else{
    ellipse(c,2,-8,21,11,'#64706a','#3c514b',2);c.save();c.translate(0,-15);c.rotate(-.55);roundRect(c,-8,-12,bertha?49:34,19,5,bertha?'#76928c':'#6f837b','#354d48',2);roundRect(c,(bertha?41:26)-6,-14,8,23,2,'#91a39a','#354d48',2);ellipse(c,bertha?42:27,-2.5,3,8,'#2e4440');line(c,-4,-10,bertha?38:22,-10,'#b2ba9d',2);c.restore();
    if(level>=2){for(const xx of [-21,21]){circle(c,xx,3,8,'#675c40','#394d3d',2);circle(c,xx,3,3,'#a69966');}}
    if(level>=3){roundRect(c,-24,-19,11,10,2,'#b69657','#53604a',1.5);circle(c,-19,-14,2.5,'#e2bf79');}
    if(bertha){roundRect(c,-29,-24,13,21,2,'#6f8e82','#3a594c',1.5);poly(c,[[-26,-23],[-23,-39],[-20,-23]],'#d0a561','#5a6248',1);roundRect(c,14,-20,14,12,2,'#b7a97b','#5c644d',1);}
   }
  }
  if(a.disabled>0){c.save();c.globalAlpha=.55;poly(c,[[-31,7],[-26,-25],[-8,-64],[8,-59],[30,-31],[32,8]],'#b7e6e9','#e7f6e9',2);line(c,-20,-11,-7,-32,'#e9ffff',2);line(c,6,-42,23,-12,'#e9ffff',2);c.restore();}
  // Compact tier pips, and skill ownership glints.
  for(let i=0;i<Math.min(level,4);i++)circle(c,(i-(Math.min(level,4)-1)/2)*6,15,1.8,level===4?'#f4d385':'#e4d6a7');
  if(selected){const total=Object.values(a.skills||{}).reduce((s,n)=>s+(+n||0),0);for(let i=0;i<Math.min(total,7);i++)circle(c,-18+i*6,21,1.4,'#88d7d7');}
  c.restore();
 }
 tinyArcher(c,x,y,t,gun){c.save();c.translate(x,y);circle(c,0,-7,3.5,'#e3c69b','#5d5b3b',.8);roundRect(c,-3,-4,6,6,1,gun?'#516d80':'#577554','#394e3d',.8);poly(c,[[-5,-9],[0,-14],[5,-9]],gun?'#606e7a':'#5b7647','#3c503a',.8);if(gun)line(c,0,-4,12,-8,'#b8c2b8',2);else{c.strokeStyle='#bbaa71';c.lineWidth=1.2;c.beginPath();c.arc(6,-5,5,-1.4,1.4);c.stroke();line(c,7,-10,7,0,'#e0d8ac',.5);}c.restore();}
 miniFlag(c,x,y,col,t){line(c,x,y+24,x,y,'#514f35',1.5);poly(c,[[x,y],[x+13,y+2+Math.sin(t*3)*1.2],[x+10,y+9],[x,y+8]],col,'#50614d',1);}
 enemy(c,e,t,wt){
  const def=this.data.enemies[e.defId]||{},id=e.defId||'',seed=seedId(e.id),air=e.air||def.air,boss=e.boss||def.boss;
  const isSpider=/spider/.test(id),isWolf=/wulf|worg|wolf|hound/.test(id),isDemon=/demon/.test(id),isSkeleton=/skeleton/.test(id),isLarge=/ogre|troll_chieftain|yeti|magma/.test(id),isArmored=/knight|slayer|marauder|brigand/.test(id);
  const radius=e.radius||def.radius|| (boss?28:isLarge?17:isSpider?12:9);let s=radius/10;const bob=(e.root>0?0:Math.sin(t*(isWolf?12:8)+seed)*1.1);const flyingOffset=air?25+Math.sin(wt*3+seed)*3:0;
  c.save();c.translate(e.x,e.y);ellipse(c,2,3,Math.max(7,radius*.75),Math.max(3,radius*.33),air?'rgba(28,37,32,.17)':'rgba(28,37,32,.23)');c.translate(0,-flyingOffset+bob);
  if(e.transformed||e.sheep){ellipse(c,0,-5,10,7,'#e5dfbe','#6d7860',1);circle(c,8,-7,4,'#776650');line(c,-5,0,-5,5,'#655b44',2);line(c,5,0,5,5,'#655b44',2);}
  else if(air){this.flying(c,id,t,seed,s);}
  else if(isSpider){this.spider(c,id,t,seed,s);}
  else if(isWolf){this.wolf(c,id,t,seed,s);}
  else if(boss){this.boss(c,e,id,t);}
  else if(/magma/.test(id)){for(let i=0;i<5;i++){const a=i*TAU/5;poly(c,[[Math.cos(a)*6,-11+Math.sin(a)*7],[Math.cos(a)*17,-11+Math.sin(a)*18],[Math.cos(a+.7)*15,-11+Math.sin(a+.7)*17]],'#67534c','#3d4240',2);}line(c,-7,-14,5,-4,'#fbb357',3);line(c,3,-20,6,-10,'#ed853b',2);circle(c,-3,-16,2,'#ffe9a5');circle(c,5,-16,2,'#ffe9a5');}
  else{c.scale(s,s);const armor=isArmored?'#6c7d78':isDemon?'#9e594c':isSkeleton?'#c1c4a6':/troll/.test(id)?'#698987':/yeti/.test(id)?'#ced6c5':/goblin|orc|shaman/.test(id)?'#79a05c':'#a18660';const head=/goblin|orc|shaman/.test(id)?'#90b66a':isDemon?'#c06a53':isSkeleton?'#ddd7b9':/troll/.test(id)?'#7c9e95':/yeti/.test(id)?'#dedec6':'#c8ad86';const leg=Math.sin(t*9+seed)*2;
   line(c,-4,-1,-4+leg,5,'#495140',3);line(c,4,-1,4-leg,5,'#495140',3);roundRect(c,-7,-13,14,14,3,armor,'#405043',1.3);line(c,-7,-9,-11,-2,head,3);line(c,7,-9,10,-2,head,3);ellipse(c,0,-17,7,6,head,'#405043',1.1);
   if(/goblin|orc/.test(id)){poly(c,[[-6,-20],[-12,-22],[-7,-15]],head,'#405043',.8);poly(c,[[6,-20],[12,-22],[7,-15]],head,'#405043',.8);}
   if(isArmored){roundRect(c,-7,-23,14,9,3,'#879793','#435651',1.1);line(c,-5,-17,5,-17,'#293e3b',2);if(/dark/.test(id)){line(c,0,-28,0,-23,'#b65a55',3);circle(c,-2,-17,1,'#e6bd80');circle(c,3,-17,1,'#e6bd80');}}
   else if(/bandit|shadow|necromancer/.test(id)){poly(c,[[-8,-17],[-5,-25],[4,-24],[8,-16],[4,-14],[-4,-14]],/necromancer/.test(id)?'#75548b':'#6e5642','#3c4b3d',1);roundRect(c,-4,-18,8,4,1,'#bc9672');}
   else{line(c,-4,-17,-2,-17,'#2e4237',1.5);line(c,2,-17,4,-17,'#2e4237',1.5);}
   if(isDemon){poly(c,[[-5,-21],[-9,-29],[-8,-17]],'#dab78b','#704b3f',.8);poly(c,[[5,-21],[9,-29],[8,-17]],'#dab78b','#704b3f',.8);}
   if(/shaman|necromancer/.test(id)){line(c,10,1,12,-28,'#826648',2);circle(c,12,-29,4,/shaman/.test(id)?'#94d9a3':'#a2e1c5','#4f725e',1);if(/shaman/.test(id))poly(c,[[-7,-23],[0,-30],[7,-23]],'#dab579','#66734a',1);}
   else if(/shadow_archer/.test(id)){c.strokeStyle='#b6a77d';c.lineWidth=1.5;c.beginPath();c.arc(11,-8,7,-1.3,1.3);c.stroke();}
   else{line(c,10,0,12,-16,'#aab3a0',2);line(c,7,-9,14,-8,'#706f48',2);if(isArmored)poly(c,[[-10,-12],[-15,-9],[-14,0],[-10,3],[-7,-1],[-7,-9]],'#8f6f58','#3d5146',1);}
   c.scale(1/s,1/s);
  }
  if(e.hitFlash>0){c.save();c.globalAlpha=Math.min(.5,e.hitFlash*3);ellipse(c,0,-13,radius*.8,radius*1.2,'#fff5d2');c.restore();}
  if(e.root>0){c.strokeStyle='#769a4b';c.lineWidth=2;for(let i=0;i<3;i++){c.beginPath();c.moveTo(-13+i*8,5);c.quadraticCurveTo(-15+i*6,-3,1+i*4,-10);c.stroke();}ellipse(c,0,3,13,5,null,'#96ae55',1.5);}
  if(e.poison){c.globalAlpha=.7;circle(c,-radius-2,-15,2,'#b1d760');circle(c,radius+1,-6,2,'#a9ce54');c.globalAlpha=1;}
  if(e.shield>0){ellipse(c,0,-10,radius+6,radius+14,'rgba(184,132,221,.08)','#d0a6e0',1.4);}
  if(e.curse>0){line(c,-4,-32,4,-32,'#a7e3c1',1.3);line(c,0,-36,0,-28,'#a7e3c1',1.3);}
  const healthY=boss?-78:s>1.5?-48:air?-33:-31;if(e.hp<e.maxHp||boss)this.health(c,0,healthY,clamp(e.hp/(e.maxHp||1),0,1),boss?58:Math.max(19,radius*1.8),'#d6745e');c.restore();
 }
 spider(c,id,t,seed,s){c.save();s*=id==='spider_matriarch'?1.35: id==='spider_hatchling'?.6:1;c.scale(s,s);const red=id==='spider_matriarch';for(let side of [-1,1])for(let i=0;i<4;i++){const y=-10+i*4,move=Math.sin(t*12+seed+i)*2;poly(c,[[side*4,y],[side*(13+move),y-7],[side*(19+move),y+4]],null,red?'#5a5046':'#514c3d',1.5);}ellipse(c,0,-6,9,11,red?'#9c5b50':'#786d4e','#3e4a3b',1.4);ellipse(c,0,-14,6,6,red?'#b3745a':'#a1945e','#3e4a3b',1);circle(c,-2,-17,1.1,'#e8c977');circle(c,2,-17,1.1,'#e8c977');c.restore();}
 wolf(c,id,t,seed,s){c.save();c.scale(s,s);const white=/winter/.test(id),demon=/demon/.test(id),col=white?'#d3dbce':demon?'#994f40':'#86775b';const leg=Math.sin(t*15+seed)*3;line(c,-6,-1,-10+leg,5,'#555443',3);line(c,5,-1,9-leg,5,'#555443',3);ellipse(c,-2,-5,12,7,col,'#465041',1.4);poly(c,[[-13,-6],[-22,-12],[-18,-6],[-12,-2]],col,'#465041',1);ellipse(c,10,-9,7,6,col,'#465041',1.4);poly(c,[[7,-12],[6,-20],[12,-14]],col,'#465041',1);poly(c,[[11,-12],[15,-18],[16,-10]],col,'#465041',1);ellipse(c,16,-6,5,3,white?'#aab6a8':'#635744','#465041',1);circle(c,12,-10,1.1,demon?'#ffbf66':'#e8d7a2');c.restore();}
 flying(c,id,t,seed,s){c.save();c.scale(Math.min(s,1.55),Math.min(s,1.55));const flap=Math.sin(t*9+seed)*9,imp=/imp/.test(id),rocket=/rocket/.test(id);if(rocket){ellipse(c,2,0,16,8,'#957a4c','#4b5746',1.5);poly(c,[[18,-1],[25,0],[18,3]],'#dcab61');poly(c,[[-14,-1],[-26,2],[-16,4]],'#e8c576');circle(c,-1,-9,5,'#90a56b','#4b5746',1);poly(c,[[-6,-12],[-3,-18],[5,-14]],'#9e6c49','#4b5746',1);}else{const col=imp?'#a86b58':'#8b9490';poly(c,[[-4,-8],[-17,-18-flap],[-28,-10-flap],[-22,1],[-17,-6],[-12,1],[-6,-1]],col,'#42564d',1.3);poly(c,[[4,-8],[17,-18-flap],[28,-10-flap],[22,1],[17,-6],[12,1],[6,-1]],col,'#42564d',1.3);ellipse(c,0,-4,6,10,col,'#42564d',1.3);circle(c,0,-15,5,col,'#42564d',1);poly(c,[[-4,-17],[-6,-23],[-1,-18]],col,'#42564d',.7);poly(c,[[4,-17],[6,-23],[1,-18]],col,'#42564d',.7);circle(c,-2,-15,1,'#efb96b');circle(c,2,-15,1,'#efb96b');}c.restore();}
 boss(c,e,id,t){const step=Math.sin(t*5+seedId(e.id))*3;if(id==='juggernaut'){for(const x of [-15,15]){roundRect(c,x-8,-4,16,17,4,'#737d75','#3c514a',2);circle(c,x,9,4,'#b0995c');}roundRect(c,-29,-44,58,46,10,'#8e9b8c','#3e544a',3);poly(c,[[-25,-39],[-12,-49],[21,-43],[27,-18],[-20,-15]],'#a7ad94','#536550',2);for(const x of [-22,22]){circle(c,x,-29,5,'#b1a66e','#4c6150',2);line(c,x,-23,x*1.5,-6,'#7c897b',8);}roundRect(c,-14,-62,28,24,5,'#a3ae9c','#3e544a',3);roundRect(c,-9,-51,18,6,2,'#40544c');circle(c,-5,-48,2,'#e7b357');circle(c,5,-48,2,'#e7b357');roundRect(c,-9,-39,18,15,2,'#637b6f','#3d554b',2);}else if(id==='jt'){line(c,-12,1,-14+step,11,'#72968e',9);line(c,12,1,14-step,11,'#72968e',9);ellipse(c,0,-21,27,32,'#d6dfd1','#5e827a',2.5);poly(c,[[-21,-38],[-34,-32],[-35,-5],[-25,1],[-19,-20]],'#c5d6cc','#5e827a',2);poly(c,[[21,-38],[34,-32],[35,-5],[25,1],[19,-20]],'#c5d6cc','#5e827a',2);ellipse(c,0,-47,18,16,'#e0e5d5','#5e827a',2);ellipse(c,0,-44,12,9,'#86aaa4');circle(c,-5,-48,2,'#304f4d');circle(c,5,-48,2,'#304f4d');poly(c,[[-9,-38],[-5,-30],[-2,-38],[4,-30],[8,-38]],'#ece9d5','#7b9a90',1);}else{const phase=e.phase||1;if(phase>=2){poly(c,[[-22,4],[-22,-25],[-9,-54],[9,-54],[23,-25],[23,4]],'#9f624f','#49453c',2.5);poly(c,[[-9,-48],[-27,-77],[-22,-45]],'#d0ae79','#574d3c',2);poly(c,[[9,-48],[27,-77],[22,-45]],'#d0ae79','#574d3c',2);circle(c,0,-44,14,'#ba7b58','#574d3c',2);circle(c,-5,-46,2.5,'#f7d787');circle(c,5,-46,2.5,'#f7d787');}else{poly(c,[[-21,8],[-15,-39],[0,-50],[15,-39],[21,8]],'#715a84','#3d4b46',2.5);ellipse(c,0,-42,9,10,'#b7bda1','#3c544b',1.5);poly(c,[[-14,-47],[0,-67],[13,-47]],'#605276','#3c4745',2);line(c,24,9,25,-58,'#7b7250',4);circle(c,25,-60,9,'#8ecb94','#42644f',2);circle(c,25,-60,4,'#d2f4b6');}}}
 unit(c,u,world,ui,t){const hero=u.kind==='hero',elem=u.kind==='elemental';c.save();c.translate(u.x,u.y);ellipse(c,1,3,hero?13:elem?17:7,hero?6:elem?7:3,'rgba(20,39,30,.25)');if(hero){ellipse(c,0,3,14,7,'rgba(90,170,185,.12)','#b4dce0',1);}
  const seed=seedId(u.id),moving=Math.hypot((u.targetX??u.x)-u.x,(u.targetY??u.y)-u.y)>3;const bob=moving?Math.sin(t*11+seed)*1.3:Math.sin(t*2+seed)*.3;c.translate(0,bob);
  if(elem){for(const [xx,yy,rr] of [[-9,-2,8],[8,-2,8],[-15,-16,9],[15,-16,9],[0,-21,13],[0,-37,8]]){poly(c,[[xx-rr,yy],[xx-rr*.7,yy-rr],[xx+rr*.5,yy-rr*1.1],[xx+rr,yy],[xx+rr*.3,yy+rr*.5]],'#9ba28b','#526654',1.8);}circle(c,-3,-38,2,'#b7edaa');circle(c,3,-38,2,'#b7edaa');}
  else{const owner=world.towers.find(a=>a.id===u.ownerId);const defId=owner?.defId||'';const holy=defId==='holy_order',barb=defId==='barbarians',rein=u.kind==='reinforcement';const scale=hero?1.3:1;c.scale(scale,scale);const armor=hero?'#8eaebe':holy?'#bfc4ad':barb?'#b19263':rein?'#779379':'#859b9b',shirt=hero?'#426f92':holy?'#c6b15f':barb?'#a66b4e':rein?'#496a50':'#497ca1';
   if(hero)poly(c,[[-6,-20],[-13,1],[0,-3],[12,1],[6,-20]],'#3c6d92','#3a5a60',1.3);
   const leg=moving?Math.sin(t*12+seed)*2:0;line(c,-4,-2,-4+leg,5,'#4b5d52',3);line(c,4,-2,4-leg,5,'#4b5d52',3);roundRect(c,-6,-14,12,13,3,shirt,'#3f594d',1.2);roundRect(c,-5,-16,10,9,3,armor,'#456157',1);circle(c,0,-21,5,'#d9bc91','#5b664f',1);if(barb){poly(c,[[-5,-23],[-3,-28],[4,-27],[6,-21]],'#a7784e','#66583e',1);}else{roundRect(c,-6,-26,12,8,3,armor,'#456157',1);line(c,-4,-20,4,-20,'#3f5b54',1.5);if(hero)line(c,0,-31,0,-26,'#ddbd6f',3);}
   poly(c,[[-7,-14],[-12,-12],[-12,-3],[-7,1],[-3,-4],[-3,-12]],hero?'#517f9d':holy?'#cfbc71':rein?'#729071':'#6791a3','#38564c',1);if(holy){line(c,-8,-11,-8,-3,'#f3e7a3',1.4);line(c,-11,-8,-5,-8,'#f3e7a3',1.4);}
   c.save();c.translate(8,-6);c.rotate((u.attackAnim||0)>0?-Math.sin(u.attackAnim/.23*Math.PI)*1.3:0);line(c,0,0,4,-17,barb?'#c6cab0':'#d8e2d1',2);line(c,-2,-5,5,-3,'#b69a60',1.5);if(barb)poly(c,[[2,-18],[10,-18],[9,-11],[3,-12]],'#b7c3b0','#53675b',1);c.restore();
   c.scale(1/scale,1/scale);
  }
  if(u.hp<u.maxHp||hero)this.health(c,0,hero?-44:elem?-52:-32,clamp(u.hp/(u.maxHp||1),0,1),hero?29:22,hero?'#79c6cd':'#9ac075');
  if(hero){c.fillStyle='#f3dfa5';c.font='bold 8px system-ui';c.textAlign='center';c.fillText(String(u.level||1),0,-49);}c.restore();
 }
 health(c,x,y,p,w,color){roundRect(c,x-w/2-1,y-1,w+2,5,2,'rgba(28,42,33,.8)');roundRect(c,x-w/2,y,w*p,3,1,color);if(p>.02){c.fillStyle='rgba(255,255,223,.3)';c.fillRect(x-w/2,y,w*p,1);}}
 projectile(c,p,t){if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;const kind=p.kind||'arrow',progress=p.duration?clamp(p.age/p.duration,0,1):.5;const arc=(kind==='shell'||kind==='missile')?Math.sin(progress*Math.PI)*28:kind==='arrow'?Math.sin(progress*Math.PI)*8:0;const x=p.x,y=p.y-arc;c.save();const dx=(p.tx??x+1)-(p.startX??x),dy=(p.ty??y)-(p.startY??y);c.translate(x,y);c.rotate(Math.atan2(dy,dx));
  if(kind==='arrow'||kind==='axe'){if(kind==='axe'){c.rotate(t*16);line(c,-5,0,5,0,'#b89c69',2);poly(c,[[0,-5],[6,-5],[7,2],[2,2]],'#d4dbc1','#4b6656',.7);}else{line(c,-7,0,4,0,'#d3c291',1.3);poly(c,[[7,0],[2,-2],[2,2]],'#e4e4bd');line(c,-7,-2,-4,0,'#8caa87',1);line(c,-7,2,-4,0,'#8caa87',1);}}
  else if(kind==='bolt'){c.shadowColor='#c2b2ec';c.shadowBlur=9;ellipse(c,0,0,5,2.5,'#e0caf5');line(c,-12,0,-2,0,'rgba(199,169,228,.6)',3);}
  else if(kind==='missile'){line(c,-12,0,-5,0,'#e4bb69',4);poly(c,[[7,0],[-4,-3],[-4,3]],'#b3bdab','#5e6d58',.8);}
  else{ellipse(c,0,0,4.2,4.2,'#65756d','#384d42',1);circle(c,-1,-1,1.5,'#a9b39a');}c.restore();}
 effect(c,e,t){if(!Number.isFinite(e.x)||!Number.isFinite(e.y))return;const age=e.age||0,dur=e.duration||.5,p=clamp(age/dur,0,1),r=e.radius||25,kind=e.kind||'hit';c.save();c.translate(e.x,e.y);c.globalAlpha=1-p;
  if(kind==='text'){c.font='bold '+(e.size||13)+'px system-ui';c.textAlign='center';c.lineWidth=3;c.strokeStyle='rgba(35,52,39,.5)';c.strokeText(e.text||'',0,-20-p*22);c.fillStyle=e.color||'#f5db83';c.fillText(e.text||'',0,-20-p*22);}
  else if(kind==='lightning'){c.translate(-e.x,-e.y);const x2=e.x2??e.x+20,y2=e.y2??e.y;const dx=x2-e.x,dy=y2-e.y;c.beginPath();c.moveTo(e.x,e.y-25);for(let i=1;i<=6;i++)c.lineTo(e.x+dx*i/6+Math.sin(i*19+t*6)*5,e.y-25+(dy+25)*i/6);c.strokeStyle=e.color||'#b9f5eb';c.lineWidth=2.3;c.shadowBlur=7;c.shadowColor='#a8ece7';c.stroke();}
  else if(kind==='meteor'){const yy=-180*(1-p);line(c,-40*(1-p),yy,0,0,'rgba(239,171,79,.5)',8);circle(c,-40*(1-p),yy,11,'#f3c576','#cc7048',3);}
  else if(kind==='blast'){ellipse(c,0,0,r*(.5+p*.7),r*(.3+p*.38),'rgba(227,167,82,.23)',e.color||'#e9c48b',1.7);for(let i=0;i<9;i++){const a=i*TAU/9+seedId(e.id)*.001;circle(c,Math.cos(a)*r*p,Math.sin(a)*r*p*.7-9*(1-p),3*(1-p)+1,i%3?'#e7bd74':'#c98356');}circle(c,0,-6,r*.4*(1-p),'rgba(255,224,154,.7)');}
  else if(kind==='heal'){c.globalAlpha=(1-p)*.7;ellipse(c,0,2,r*.6,r*.3,'rgba(152,214,141,.3)','#bfdfa0',1);line(c,-4,-15-p*15,4,-15-p*15,'#c8eaaa',2);line(c,0,-19-p*15,0,-11-p*15,'#c8eaaa',2);}
  else if(kind==='roots'){for(let i=0;i<4;i++){const x=-r*.6+i*r*.4;c.beginPath();c.moveTo(x,5);c.quadraticCurveTo(x-8,-18,x+8,-r*(.4+p*.3));c.strokeStyle='#a2b567';c.lineWidth=2;c.stroke();}}
  else if(kind==='teleport'){ellipse(c,0,-12,r*(1-p),r*1.2*(1-p),null,'#c1a6eb',2);for(let i=0;i<6;i++){const a=i*TAU/6+p*3;circle(c,Math.cos(a)*r,Math.sin(a)*r-10,2,'#cab3ec');}}
  else if(kind==='death'){for(let i=0;i<5;i++){const a=i*TAU/5;circle(c,Math.cos(a)*10*p,Math.sin(a)*8*p,3*(1-p),e.color||'#9aa374');}}
  else if(kind==='upgrade'||kind==='spawn'){ellipse(c,0,0,r*(.3+p),r*.55*(.3+p),null,e.color||'#e9d897',2);for(let i=0;i<5;i++){const a=i*TAU/5;circle(c,Math.cos(a)*r*p,-10-p*30+Math.sin(a)*10,2,'#f1e1ac');}}
  else if(kind==='ring'){ellipse(c,0,0,r*(.3+p*.7),r*(.3+p*.7)*.7,null,e.color||'#c2e4bc',2);}
  else{for(let i=0;i<4;i++){const a=i*TAU/4;line(c,Math.cos(a)*3,Math.sin(a)*3,Math.cos(a)*(5+p*8),Math.sin(a)*(5+p*8),e.color||'#e8d79e',1.4);}}c.restore();}
 placement(c,ui,world,t){const p=ui.pointer,mode=ui.placementMode;let r=mode==='meteor'?72+3*(world.permanent?.meteor||0):mode==='reinforcements'?32:22,col=mode==='meteor'?'#f4b378':mode==='hero'?'#f1d893':'#9bddba';const tower=world.towers.find(a=>a.id===ui.selectedTowerId);if(mode==='rally'&&tower){r=20;this.range(c,tower.x,tower.y,170,col,.035);}
  c.save();c.globalAlpha=.13;circle(c,p.x,p.y,r,col);c.globalAlpha=.85;c.setLineDash([5,4]);circle(c,p.x,p.y,r,null,col,1.5);c.setLineDash([]);line(c,p.x-7,p.y,p.x+7,p.y,col,1.5);line(c,p.x,p.y-7,p.x,p.y+7,col,1.5);if(mode==='hero'||mode==='rally')this.flag(c,p.x,p.y,t,col);c.restore();}
}
global.KRRenderer=KRRenderer;
})(globalThis);
