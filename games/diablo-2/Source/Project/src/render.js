const C=$('#game'),g=C.getContext('2d'),gfx=$('#view3d'),hud=$('#hud'),h=hud.getContext('2d');
let GL=null,glProg,glBuf,glPos,glCol,vertexCount=0;
try{GL=gfx.getContext('webgl',{antialias:true,alpha:false});if(GL){const vs='attribute vec3 p;attribute vec3 c;varying vec3 v;void main(){gl_Position=vec4(p,1.);v=c;}',fs='precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.);}';
 const shader=(type,source)=>{const sh=GL.createShader(type);GL.shaderSource(sh,source);GL.compileShader(sh);if(!GL.getShaderParameter(sh,GL.COMPILE_STATUS))throw Error(GL.getShaderInfoLog(sh));return sh;};
 glProg=GL.createProgram();GL.attachShader(glProg,shader(GL.VERTEX_SHADER,vs));GL.attachShader(glProg,shader(GL.FRAGMENT_SHADER,fs));GL.linkProgram(glProg);if(!GL.getProgramParameter(glProg,GL.LINK_STATUS))throw Error(GL.getProgramInfoLog(glProg));GL.useProgram(glProg);glBuf=GL.createBuffer();glPos=GL.getAttribLocation(glProg,'p');glCol=GL.getAttribLocation(glProg,'c');GL.enable(GL.DEPTH_TEST);GL.depthFunc(GL.LEQUAL);
 }}catch(err){console.warn('WebGL unavailable; falling back to Canvas 2D.',err.message);GL=null;}
if(!GL)renderMode='2d';
gfx.addEventListener('webglcontextlost',e=>{e.preventDefault();renderMode='2d';gfx.style.display='none';paused=true;log('그래픽 컨텍스트가 중단되어 2D 모드로 전환했습니다. P로 계속하세요.');refresh();});
function cameraUpdate(dt){if(!S)return;const blend=1-Math.exp(-dt*7),halfW=13.5*T/camera.zoom,halfH=8.9*T/camera.zoom;
 const tx=halfW>=NX*T/2?NX*T/2:clamp(S.p.x,halfW,NX*T-halfW),ty=halfH>=NY*T/2?NY*T/2:clamp(S.p.y,halfH,NY*T-halfH);camera.x+=(tx-camera.x)*blend;camera.y+=(ty-camera.y)*blend;screenShake=Math.max(0,screenShake-dt*18);}
function project(x,y,z=0){const scale=camera.zoom,shake=screenShake&&!motionReduced?Math.sin(anim*67)*screenShake:0;return {x:W/2+(x-camera.x)/T/13.5*W/2*scale+shake,y:H/2-( -(y-camera.y)/T*.84+z*.66)/8.9*H/2*scale,depth:-(y-camera.y)/T*.027-z*.037};}
function unproject(x,y){return {x:camera.x+(x-W/2)*2/W*13.5*T/camera.zoom,y:camera.y+(y-H/2)*2/H*8.9*T/(.84*camera.zoom)};}
function color(hex){return [parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255];}
function render3D(){if(!GL||renderMode!=='3d')return;const verts=[],theme=themes[S.floor-1];
 function tri(a,b,c,col,shade=1){for(const v of [a,b,c]){const p=project(v[0]*T,v[1]*T,v[2]);verts.push(p.x/W*2-1,1-p.y/H*2,p.depth,Math.min(1,col[0]*shade),Math.min(1,col[1]*shade),Math.min(1,col[2]*shade));}}
 function quad(a,b,c,d,col,shade=1){tri(a,b,c,col,shade);tri(a,c,d,col,shade);}
 function box(x,y,z,w,ht,d,col,angle=0){const ca=Math.cos(angle),sa=Math.sin(angle),v=(xx,yy,zz)=>[x+xx*ca-yy*sa,y+xx*sa+yy*ca,zz],a=v(-w/2,-d/2,z),b=v(w/2,-d/2,z),c=v(w/2,d/2,z),dd=v(-w/2,d/2,z),at=v(-w/2,-d/2,z+ht),bt=v(w/2,-d/2,z+ht),ct=v(w/2,d/2,z+ht),dt=v(-w/2,d/2,z+ht);
 quad(at,bt,ct,dt,col,1.25);quad(a,b,bt,at,col,.62);quad(b,c,ct,bt,col,.84);quad(c,dd,dt,ct,col,.94);quad(dd,a,at,dt,col,.7);}
 function disk(x,y,z,r,col,segments=20){for(let i=0;i<segments;i++){const a=i*TAU/segments,b=(i+1)*TAU/segments;tri([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],col);}}
 function ring(x,y,z,r,th,col,progress=1,start=0){const n=Math.max(3,Math.floor(40*progress));for(let i=0;i<n;i++){const a=start+i/n*TAU*progress,b=start+(i+1)/n*TAU*progress;quad([x+Math.cos(a)*r,y+Math.sin(a)*r,z],[x+Math.cos(b)*r,y+Math.sin(b)*r,z],[x+Math.cos(b)*(r-th),y+Math.sin(b)*(r-th),z],[x+Math.cos(a)*(r-th),y+Math.sin(a)*(r-th),z],col);}}
 for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){const discovered=S.discovered[y]?.[x],now=S.visible[y]?.[x],b=discovered?(now?1:.43):.18;
 if(!discovered){box(x+.5,y+.5,-.12,1,.06,1,[.035,.043,.057]);continue;}
 const variation=.91+((x*17+y*31)%8)*.018;box(x+.5,y+.5,-.13,.99,.13,.99,theme.floor.map(c=>c*b*variation));
 if(S.map[y][x]){const px=S.p.x/T,py=S.p.y/T,cut=Math.abs(x+.5-px)<1.7&&y+.5>py&&y+.5-py<3.1;const ht=cut?.24:.92;box(x+.5,y+.5,0,.96,ht,.96,theme.wall.map(c=>c*b));box(x+.5,y+.5,ht,.97,.09,.97,theme.wall.map(c=>c*b*1.16));if(!cut&&(x+y*3)%4===0)box(x+.5,y+.5,ht+.09,.74,.12,.74,theme.wall.map(c=>c*b*.8));}
 else{if((x*13+y*7)%19===0)box(x+.22,y+.28,0,.22,.035,.16,[.31*b,.30*b,.26*b]);}}
 for(const r of S.rooms){if(!S.discovered[r.c.y]?.[r.c.x])continue;const room=S.director.rooms[r.index??S.rooms.indexOf(r)];if(room?.kind==='start'){ring(r.c.x+.5,r.c.y+.5,.04,.95,.07,[.25,.52,.59]);}
 const tx=r.x+.7,ty=r.y+.7;if(S.visible[Math.floor(ty)]?.[Math.floor(tx)]){box(tx,ty,.04,.16,.58,.16,[.3,.26,.22]);const flick=.03*Math.sin(anim*8+tx);box(tx,ty,.65,.13,.24+flick,.13,theme.light);}}
 for(const o of S.director.objects){if(!seen(o))continue;const x=o.x/T,y=o.y/T,dimmer=visible(o)?1:.45;
 if(o.kind==='chest'){box(x,y,.03,.72,.34,.49,[.31*dimmer,.19*dimmer,.12*dimmer]);box(x+(o.used?.28:0),y,.4,.75,.16,.52,[.68*dimmer,.45*dimmer,.18*dimmer],o.used?.6:0);box(x,y,.17,.12,.26,.53,[.85*dimmer,.69*dimmer,.37*dimmer]);}
 else if(o.kind==='key'&&!o.used){ring(x,y,.4+Math.sin(anim*2)*.06,.23,.07,[1*dimmer,.81*dimmer,.3*dimmer]);box(x+.24,y,.4,.4,.07,.09,[1*dimmer,.81*dimmer,.3*dimmer]);box(x+.4,y+.09,.4,.07,.07,.2,[1*dimmer,.81*dimmer,.3*dimmer]);ring(x,y,.015,.58,.04,[.48*dimmer,.37*dimmer,.14*dimmer]);}
 else if(o.kind==='shrine'){box(x,y,0,.79,.22,.79,[.27*dimmer,.36*dimmer,.38*dimmer]);box(x,y,.22,.5,.44,.5,[.35*dimmer,.44*dimmer,.46*dimmer]);box(x,y,.75,.27,.27,.27,o.used?[.2,.25,.25]:[.25*dimmer,.9*dimmer,.78*dimmer],anim*.5);}
 else if(o.kind==='trap'){box(x,y,.005,.9,.025,.9,o.used?[.21,.21,.22]:[.42*dimmer,.24*dimmer,.2*dimmer]);for(let i=-1;i<=1;i++)box(x+i*.22,y,.035,.06,.05,.66,[.47*dimmer,.43*dimmer,.4*dimmer]);}}
 for(const a of S.director.gates){if(!S.discovered[a.y]?.[a.x])continue;const x=a.x+.5,y=a.y+.5;if(S.keyCount<1){box(x-.39,y,0,.16,1.4,.22,[.54,.41,.26]);box(x+.39,y,0,.16,1.4,.22,[.54,.41,.26]);box(x,y,1.34,.94,.18,.26,[.72,.57,.31]);for(let k=-1;k<=1;k++)box(x+k*.21,y,0,.065,1.32,.12,[.87,.67,.24]);}else{box(x-.42,y,0,.13,.65,.19,[.38,.34,.29]);box(x+.42,y,0,.13,.65,.19,[.38,.34,.29]);}}
 if(seen(S.exit)){const x=S.exit.x/T,y=S.exit.y/T;for(let i=0;i<4;i++)box(x,y+(i-1.5)*.18,.025+i*.04,.82,.08,.16,S.bossDead?[.71,.55,.28]:[.37,.31,.36]);if(S.bossDead)ring(x,y,.04,.8,.07,[.94,.72,.33],1,anim);}
 for(const d of S.drops){if(!seen(d))continue;const col=d.item.rarity==='rare'?[1,.76,.25]:d.item.rarity==='magic'?[.4,.66,1]:[.77,.79,.74];box(d.x/T,d.y/T,.09,.23,.18,.23,col,anim*.7);if(d.item.rarity==='rare')box(d.x/T,d.y/T,.3,.04,.75,.04,col.map(c=>c*.7));}
 for(const hazard of S.hazards){if(!seen(hazard))continue;const x=hazard.x/T,y=hazard.y/T,r=hazard.r/T,prog=1-hazard.delay/(hazard.total||1);disk(x,y,.016,r,[.24,.07,.07]);ring(x,y,.025,r,.06,[1,.33,.2]);ring(x,y,.026,r*.93,.10,[1,.76,.39],prog,-Math.PI/2);}
 function actor(o,hero=false){const x=o.x/T,y=o.y/T,scale=hero?1:o.type==='boss'?1.48:o.type==='elite'?1.1:.95,face=o.face||0,ca=Math.cos(face),sa=Math.sin(face),step=Math.sin(o.walkPhase||0)*.12,atk=o.attackAnim>0?Math.sin((1-o.attackAnim/(o.attackTotal||.3))*Math.PI)*.5:0;const body=hero?(S.hero==='knight'?[.33,.53,.63]:S.hero==='ranger'?[.3,.51,.37]:[.43,.34,.62]):o.type==='boss'?[.57,.26,.21]:o.type==='elite'?[.49,.29,.59]:o.type==='caster'?[.34,.35,.53]:[.46,.3,.31];const co=o.flash>0?[.94,.91,.79]:body;
 const part=(f,side,z,w,ht,dep,col)=>box(x+(f*ca-side*sa)*scale,y+(f*sa+side*ca)*scale,z*scale,w*scale,ht*scale,dep*scale,col,face);
 disk(x,y,.004,.43*scale,[.06,.075,.08]);part(step,-.16,.04,.18,.35,.19,[.18,.2,.24]);part(-step,.16,.04,.18,.35,.19,[.18,.2,.24]);part(0,0,.35,.44,.5,.5,co);part(-.16,0,.34,.13,.58,.58,body.map(c=>c*.68));part(0,0,.86,.34,.32,.33,hero?[.81,.69,.53]:[.62,.61,.56]);part(.18,-.09,1.04,.045,.045,.05,[.95,.76,.31]);part(.18,.09,1.04,.045,.045,.05,[.95,.76,.31]);part(.05+atk,-.33,.5,.16,.39,.16,co);part(-.05,.33,.5,.17,.39,.17,co);
 if(hero&&S.hero==='ranger'){part(.32+atk,-.34,.63,.07,.52,.47,[.63,.43,.26]);part(.36+atk,-.34,.65,.035,.48,.32,[.84,.77,.59]);}
 else if(hero&&S.hero==='mage'||o.type==='caster'){part(.15+atk,-.38,.15,.08,1.1,.08,[.57,.4,.27]);part(.15+atk,-.38,1.2,.18,.22,.18,[.44,.75,.91]);}
 else{part(.4+atk,-.32,.63,.66,.07,.09,[.82,.83,.78]);part(.12,.4,.48,.13,.5,.43,hero?[.36,.54,.6]:[.43,.38,.3]);}
 if(o.type==='boss'){part(0,0,1.19,.46,.16,.47,[.75,.56,.26]);part(0,-.18,1.35,.1,.16,.1,[.92,.7,.32]);part(0,.18,1.35,.1,.16,.1,[.92,.7,.32]);}
 if(hero){ring(x,y,.01,.48,.045,p.guard>0?[.79,.86,.69]:[.28,.73,.79]);if(p.invuln>0)ring(x,y,.08,.65,.08,[.6,.87,1]);}
 if(o.windup){const pr=1-o.windup.left/o.windup.total;ring(x,y,.02,.62*scale,.075,[1,.45,.22],pr,-Math.PI/2);}
 }
 const p=S.p;for(const e of S.enemies)if(visible(e))actor(e);actor(p,true);
 if(!S.keyCount){const b=S.enemies.find(e=>e.type==='boss');if(b&&seen(b))ring(b.x/T,b.y/T,.05,1,.09,[.75,.56,.22],1,anim);}
 for(const s of S.shots){if(!visible(s))continue;const col=s.kind==='fire'?[1,.51,.16]:s.kind==='arrow'?[.94,.83,.58]:s.friendly?[.4,.85,.97]:[.74,.45,.97],a=Math.atan2(s.vy,s.vx);box(s.x/T,s.y/T,.53,s.kind==='arrow'?.44:.19,.12,.12,col,a);}
 for(const f of S.vfx){if(!seen(f))continue;const k=1-f.life/f.total,col=color(f.color).map(c=>c*(.7+.3*(1-k))),r=f.r/T*(f.kind==='impact'?.3+k*.7:1);if(f.kind==='slash')ring(f.x/T,f.y/T,.42,r,.14,col,.33,f.angle-Math.PI/3);else if(f.kind==='ring')ring(f.x/T,f.y/T,.06,r*(.3+k*.7),.075,col);else if(f.kind==='impact')ring(f.x/T,f.y/T,.2,r,.1,col);}
 GL.viewport(0,0,W,H);GL.clearColor(.026,.035,.047,1);GL.clear(GL.COLOR_BUFFER_BIT|GL.DEPTH_BUFFER_BIT);GL.useProgram(glProg);GL.bindBuffer(GL.ARRAY_BUFFER,glBuf);GL.bufferData(GL.ARRAY_BUFFER,new Float32Array(verts),GL.DYNAMIC_DRAW);GL.vertexAttribPointer(glPos,3,GL.FLOAT,false,24,0);GL.vertexAttribPointer(glCol,3,GL.FLOAT,false,24,12);GL.enableVertexAttribArray(glPos);GL.enableVertexAttribArray(glCol);GL.drawArrays(GL.TRIANGLES,0,verts.length/6);vertexCount=verts.length/6;
}
function render2D(){g.clearRect(0,0,W,H);g.fillStyle='#080d13';g.fillRect(0,0,W,H);const q=(x,y)=>project(x,y,0);
 for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){const a=q(x*T,y*T),b=q((x+1)*T,(y+1)*T);g.fillStyle=!S.discovered[y]?.[x]?'#10161f':S.map[y][x]?(S.visible[y]?.[x]?'#465159':'#242f39'):(S.visible[y]?.[x]?'#25383d':'#17242d');g.fillRect(a.x,a.y,b.x-a.x-.7,b.y-a.y-.7);}
 for(const a of S.director.gates)if(!S.keyCount&&S.discovered[a.y]?.[a.x]){const t=q((a.x+.5)*T,(a.y+.5)*T);g.fillStyle='#e1b665';g.fillRect(t.x-9,t.y-9,18,18);}
 for(const o of S.director.objects)if(!o.used&&seen(o)){const p=q(o.x,o.y);g.fillStyle=({key:'#efd38d',chest:'#d4a35c',shrine:'#72cfbd',trap:'#d87569'})[o.kind];g.font='bold 22px sans-serif';g.textAlign='center';g.fillText(({key:'⚿',chest:'▣',shrine:'✦',trap:'△'})[o.kind],p.x,p.y+7);}
 if(seen(S.exit)){const p=q(S.exit.x,S.exit.y);g.fillStyle=S.bossDead?'#f4d48c':'#7b6579';g.font='26px sans-serif';g.fillText('⇩',p.x,p.y+8);}
 for(const d of S.drops)if(seen(d)){const p=q(d.x,d.y);g.fillStyle=d.item.rarity==='rare'?'#e9c77c':d.item.rarity==='magic'?'#86bafb':'#c6d1cf';g.fillRect(p.x-4,p.y-4,8,8);}
 for(const s of S.shots){const p=q(s.x,s.y);g.fillStyle=s.friendly?'#f6d79c':'#b7a0e8';g.beginPath();g.arc(p.x,p.y,4,0,TAU);g.fill();}
 const actors=[...S.enemies.filter(visible),S.p];for(const e of actors){const p=q(e.x,e.y),hero=e===S.p,r=e.type==='boss'?19:hero?12:11;g.fillStyle=hero?'#9ac7cf':e.flash>0?'#f6e7c1':e.type==='boss'?'#b95e4b':e.type==='caster'?'#8474aa':'#a76c70';g.beginPath();g.arc(p.x,p.y,r,0,TAU);g.fill();g.strokeStyle=hero?'#d0edf0':'#e7bba1';g.lineWidth=2;g.stroke();g.beginPath();g.moveTo(p.x,p.y);g.lineTo(p.x+Math.cos(e.face||0)*(r+9),p.y+Math.sin(e.face||0)*(r+9));g.stroke();}
}
function label(text,x,y,size=12,col='#d3dee2',align='center'){h.font=`${size>=16?'600':'500'} ${size}px system-ui`;h.textAlign=align;h.textBaseline='middle';h.shadowColor='#000';h.shadowBlur=4;h.fillStyle=col;h.fillText(text,x,y);h.shadowBlur=0;}
function roundRect(ctx,x,y,w,ht,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,ht,r);ctx.fillStyle=fill;ctx.fill();}
function drawMinimap(){const unit=mapExpanded?13:5.4,ww=NX*unit,hh=NY*unit,x0=mapExpanded?(W-ww)/2:W-ww-19,y0=mapExpanded?(H-hh)/2:18;roundRect(h,x0-8,y0-8,ww+16,hh+16,6,'#09121bea');
 for(let y=0;y<NY;y++)for(let x=0;x<NX;x++)if(S.discovered[y]?.[x]){h.fillStyle=S.map[y][x]?'#3d4d57':S.visible[y]?.[x]?'#839999':'#4e626c';h.fillRect(x0+x*unit,y0+y*unit,unit-.5,unit-.5);}
 for(const a of S.director.gates)if(!S.keyCount&&S.discovered[a.y]?.[a.x]){h.fillStyle='#e4b86d';h.fillRect(x0+a.x*unit,y0+a.y*unit,unit,unit);}
 for(const o of S.director.objects)if(!o.used&&seen(o)){const t=tile(o.x,o.y);h.fillStyle=o.kind==='key'?'#ffe0a1':o.kind==='shrine'?'#69d9c3':'#c2a38c';h.fillRect(x0+t.x*unit,y0+t.y*unit,unit,unit);}
 if(seen(S.exit)){const t=tile(S.exit.x,S.exit.y);h.fillStyle=S.bossDead?'#f9d779':'#cf7b78';h.fillRect(x0+t.x*unit,y0+t.y*unit,unit,unit);}
 const t=tile(S.p.x,S.p.y);h.fillStyle='#8ff2f3';h.beginPath();h.arc(x0+(t.x+.5)*unit,y0+(t.y+.5)*unit,unit*.65,0,TAU);h.fill();if(!mapExpanded)label('TAB · 지도',x0+ww/2,y0+hh+18,10,'#91a6b2');
}
function renderHUD(){h.clearRect(0,0,W,H);if(!S)return;
 label(`FLOOR ${String(S.floor).padStart(2,'0')} / 05`,22,26,11,'#d1af73','left');label(themes[S.floor-1].name,22,50,20,'#f2e5cc','left');label(!S.keyCount?'봉인 열쇠를 탐색하세요':!S.bossDead?'관문이 열렸습니다 · 수호자 처치':'황금 계단에서 F · 다음 층',22,77,12,'#9eb6bd','left');
 for(const hazard of S.hazards){if(!seen(hazard))continue;const p=project(hazard.x,hazard.y,0),sx=hazard.r/T/13.5*W/2*camera.zoom,sy=hazard.r/T*.84/8.9*H/2*camera.zoom;h.beginPath();h.ellipse(p.x,p.y,sx,sy,0,0,TAU);h.strokeStyle='#ffb177';h.lineWidth=2;h.setLineDash([5,4]);h.stroke();h.setLineDash([]);if(renderMode==='2d'){h.fillStyle='#ff573333';h.fill();}label(hazard.delay.toFixed(1),p.x,p.y,12,'#ffdbab');}
 for(const e of S.enemies){if(!visible(e))continue;const pos=project(e.x,e.y,renderMode==='3d'?(e.type==='boss'?2.2:1.45):.5),width=e.type==='boss'?70:35;roundRect(h,pos.x-width/2,pos.y-3,width,5,2,'#121c25');roundRect(h,pos.x-width/2,pos.y-3,width*clamp(e.hp/e.maxHp,0,1),5,2,e.type==='boss'?'#ddb27b':'#d57e7a');
 if(e.windup){label(e.windup.kind==='melee'?'!':'◆',pos.x,pos.y-17,17,'#ffd58b');}
 if(e.type==='boss')label(e.bossName,pos.x,pos.y-18,12,'#f5d4a3');
 if(squadDebug&&e.squadId){label(`${roleLabels[e.tactic]||'졸개'} · ${orderLabels[e.squadOrder]||'경계'} ${Math.round((e.squadMorale??1)*100)}%`,pos.x,pos.y-18,10,'#8ce5ce');if(e.path?.length){h.strokeStyle=e.squadOrder==='retreat'?'#ef9e8d99':'#77d8cb77';h.lineWidth=1;h.beginPath();const p=project(e.x,e.y,.05);h.moveTo(p.x,p.y);for(const n of e.path){const q=project(n.x,n.y,.05);h.lineTo(q.x,q.y);}h.stroke();}}
 }
 for(const f of S.fx){const pos=project(f.x,f.y,renderMode==='3d'?1.3:.4);h.globalAlpha=clamp(f.t/.4,0,1);label(f.text,pos.x,pos.y-(f.total-f.t)*30,15,f.color);h.globalAlpha=1;}
 if(clickGoal){const p=project(clickGoal.x,clickGoal.y,.02);h.strokeStyle='#94e2dd';h.beginPath();h.ellipse(p.x,p.y,8,5,0,0,TAU);h.stroke();}
 const obj=interactionTarget();if(obj&&active()){const p=project(obj.x,obj.y,.85);const text='H · '+({key:'열쇠 획득',chest:'상자 열기',shrine:'회복',trap:'함정 해체'})[obj.kind];roundRect(h,p.x-58,p.y-13,116,26,5,'#0c1822e8');label(text,p.x,p.y,12,'#ffe0a0');}
 drawMinimap();
 if(squadDebug){roundRect(h,16,H-46,365,31,4,'#09131be8');label(`60 Hz SIM · ${Math.round(fps)} FPS · ${S.enemies.length} ENEMIES · ${Math.round(vertexCount/3)} TRI`,27,H-30,11,'#8fc9c4','left');}
 if(paused||S.p.dead||S.completed){roundRect(h,0,0,W,H,0,'#06101bd6');label(S.completed?'THE ABYSS IS SILENT':S.p.dead?'YOU HAVE FALLEN':'PAUSED',W/2,H/2-30,35,S.completed?'#f5d394':S.p.dead?'#e59c93':'#d7e7e9');label(S.completed?'5층 정복 완료 · 새로운 Seed와 직업으로 다시 도전하세요':S.p.dead?'아래 부활 버튼으로 탐험을 계속하세요':'P 또는 일시정지 버튼으로 계속',W/2,H/2+18,16,'#a9bec9');}
}
function render(dt){if(!S)return;cameraUpdate(dt);gfx.style.display=renderMode==='3d'&&GL?'block':'none';if(renderMode==='3d'&&GL)render3D();else render2D();renderHUD();}
