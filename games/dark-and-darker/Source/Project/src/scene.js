/* Procedural articulated rigs: the visible weapon and the collision path share endpoints. */
(function(){
'use strict';
const {V,clamp,lerp,yawAxes,localPoint,attackPhase}=CryptCore,{Mesh,IDENT}=CryptRender;
const bone=[.77,.72,.57],iron=[.38,.43,.46],dark=[.10,.12,.13],gold=[.65,.43,.17],leather=[.24,.14,.08];
function blade(m,pose,id,scale=1){const a=pose.hilt,b=pose.tip,d=V.norm(V.sub(b,a)),length=V.len(V.sub(b,a)),side=V.norm(V.cross(d,pose.axes?.[2]||[0,0,1]));let right=V.len(side)>.01?side:[1,0,0],normal=V.norm(V.cross(right,d));const base=a;
 m.rod(V.sub(a,V.mul(d,.25*scale)),a,.052*scale,leather,3,8);m.sphere(V.sub(a,V.mul(d,.27*scale)),.074*scale,gold,4);
 if(id==='axe'){m.rod(a,b,.045*scale,[.38,.25,.13],3,8);const c=V.mix(a,b,.83);m.box(c,[.55*scale,.27*scale,.10*scale],[.55,.58,.59],[right,d,normal],4);m.rod(V.add(c,V.mul(right,.29*scale)),V.add(c,V.mul(right,-.29*scale)),.035*scale,[.75,.78,.77],4)}else{
  const w=(id==='dagger'?.065:.078)*scale,near=V.mix(a,b,.8),tl=V.add(near,V.mul(right,w*.8)),tr=V.sub(near,V.mul(right,w*.8)),bl=V.add(base,V.mul(right,w)),br=V.sub(base,V.mul(right,w)),ridge=V.add(V.mix(a,b,.48),V.mul(normal,.035*scale));
  m.tri(bl,tl,ridge,[.69,.75,.77],4);m.tri(tl,b,ridge,[.88,.91,.89],4);m.tri(b,tr,ridge,[.54,.62,.65],4);m.tri(tr,br,ridge,[.44,.51,.54],4);m.tri(br,bl,ridge,[.58,.64,.67],4);m.quad(br,tr,tl,bl,[.55,.63,.66],4);m.tri(tr,b,tl,[.7,.77,.78],4);
  m.rod(V.add(a,V.mul(right,.17*scale)),V.sub(a,V.mul(right,.17*scale)),.042*scale,gold,4,8);
 }
}
function shield(m,box,timed=false){const {center,axes,half}=box;const size=half.map(x=>x*2);m.box(center,size,[.24,.28,.30],axes,4);const front=localPoint(center,axes,[0,0,half[2]+.015]);m.box(front,[size[0]*.75,size[1]*.83,.035],timed?[.67,.51,.22]:[.25,.19,.13],axes,3);for(const x of[-size[0]/2,size[0]/2])m.box(localPoint(front,axes,[x,0,0]),[.045,size[1],.045],gold,axes,4);for(const y of[-size[1]/2,size[1]/2])m.box(localPoint(front,axes,[0,y,0]),[size[0],.045,.045],gold,axes,4);m.sphere(localPoint(front,axes,[0,0,.035]),.14,[.47,.48,.44],4)}
function enemyMesh(m,g,e){
 const p=g.player;if(Math.hypot(e.x-p.x,e.z-p.z)>30)return;const s=e.scale,dead=e.hp<=0,fall=dead?clamp(e.deathTime/.7,0,1):0,axes=yawAxes(e.yaw),gait=Math.sin(e.walk)*Math.min(1,e.speedNow),flash=e.hitFlash>0,bc=flash?[.97,.71,.52]:bone;
 const at=(x,y,z=0)=>{if(dead){const a=fall*Math.PI*.48;const yy=y*Math.cos(a)-z*Math.sin(a)+fall*.12,zz=y*Math.sin(a)+z*Math.cos(a);return localPoint([e.x,0,e.z],axes,[x*s,yy*s,zz*s])}return localPoint([e.x,0,e.z],axes,[x*s,(y+(e.stagger>0?-.08:0))*s,z*s])};
 const box=(x,y,z,sz,col,mat=0)=>m.box(at(x,y,z),sz.map(v=>v*s),col,axes,mat);
 // Pelvis, spine, six rib segments; jointed arms and legs rather than overlapping duplicate meshes.
 box(0,.73,0,[.40,.17,.24],bc);m.rod(at(0,.76),at(0,1.40),.065*s,bc);
 for(let i=0;i<4;i++){let y=.94+i*.125,w=.22-i*.018;m.rod(at(-w,y,.08),at(w,y,.08),.036*s,bc);m.rod(at(-w,y,.08),at(-w*.8,y,-.12),.03*s,bc);m.rod(at(w,y,.08),at(w*.8,y,-.12),.03*s,bc)}
 for(const side of[-1,1]){const a=gait*side,hip=at(side*.145,.72),knee=at(side*.17,.43,Math.sin(a)*.12),ankle=at(side*.18,.09,Math.sin(a)*.26);m.rod(hip,knee,.062*s,bc);m.sphere(knee,.075*s,bc);m.rod(knee,ankle,.05*s,bc);m.box(V.add(ankle,V.mul(axes[2],.065*s)),[.15*s,.12*s,.27*s],dark,axes)}
 m.rod(at(-.28,1.38),at(.28,1.38),.065*s,bc);m.rod(at(0,1.4),at(0,1.58),.067*s,bc);
 box(0,1.74,0,[.34,.29,.30],bc);box(0,1.57,.04,[.25,.10,.23],bc);
 for(const side of[-1,1]){box(side*.093,1.76,.156,[.098,.073,.027],dark);box(side*.093,1.76,.173,[.045,.027,.013],e.type==='warden'?[.2,.65,1]:[.91,.24,.08],-.8)}
 for(let i=0;i<4;i++)box(-.075+i*.05,1.57,.17,[.035,.055,.04],[.88,.84,.7]);box(0,1.66,.16,[.038,.052,.025],dark);
 if(e.type==='guardian'||e.type==='warden'){
  box(0,1.18,-.025,[.52,.52,.31],e.type==='warden'?[.20,.25,.30]:iron,4);for(const side of[-1,1])box(side*.32,1.43,0,[.28,.20,.37],iron,4);box(0,1.89,-.03,[.42,.10,.40],iron,4);
  if(e.type==='warden'){box(0,1.94,0,[.44,.12,.41],gold,4);for(const side of[-1,1])m.rod(at(side*.19,1.96),at(side*.32,2.2),.06*s,gold,4,5,.005);box(0,1.06,-.24,[.5,1.05,.08],[.25,.07,.06],3)}
 }
 let weapon=g.getBlade(e,e.attack);const ls=at(-.30,1.38),rs=at(.30,1.38);
 let left=at(-.40,.98,.08),right=weapon.hilt;
 if(dead){left=at(-.46,.92,.1);right=at(.52,.94,.1)}
 if(e.type==='archer'&&!dead){const aim=e.attack?clamp(e.attack.t/e.attack.profile.windup,0,1):0;left=at(-.25,1.34,.42);right=at(.19,1.36,.37-aim*.26);const points=[at(-.26,1.96,.47),at(-.33,1.68,.64),left,at(-.33,1.03,.64),at(-.26,.78,.47)];for(let i=0;i<points.length-1;i++)m.rod(points[i],points[i+1],.033*s,[.40,.25,.12],3);m.rod(points[0],right,.009*s,[.65,.61,.46]);m.rod(right,points[4],.009*s,[.65,.61,.46]);if(e.attack)m.rod(right,at(.1,1.36,1.1),.015*s,iron,4)}
 for(const [shoulder,wrist,side]of[[ls,left,-1],[rs,right,1]]){const elbow=V.add(V.mix(shoulder,wrist,.55),V.add(V.mul(axes[0],.10*side*s),[0,-.12*s,0]));m.rod(shoulder,elbow,.058*s,bc);m.sphere(elbow,.065*s,bc);m.rod(elbow,wrist,.047*s,bc);m.sphere(wrist,.065*s,bc)}
 if(e.type!=='archer'){if(!dead){blade(m,weapon,e.attack?.id||(e.type==='guardian'?'axe':'sword'),s);const b=g.shieldBox(e);if(b)shield(m,b)}else blade(m,{hilt:at(.48,.15,.45),tip:at(.85,.12,1.40),axes},'sword',s)}
 if(!dead&&e.attack&&e.state==='windup'){
  const a=e.attack,progress=clamp(a.t/a.profile.windup,0,1),color=a.kind==='pulse'?[.15,.57,.87]:e.type==='warden'?[.9,.25,.07]:[.86,.5,.12],radius=a.kind==='pulse'?4.5:e.type==='archer'?1:e.range;
  if(a.kind==='pulse')m.ring(e.x,.055,e.z,radius,color,-.6,0,Math.PI*2,.07);
  else if(a.kind!=='shot'){const half=a.kind==='slam'?.32:1.0;m.ring(e.x,.055,e.z,radius,color,-.5,e.yaw-half,e.yaw+half,.07);for(const off of[-half,half])m.rod([e.x,.07,e.z],[e.x+Math.sin(e.yaw+off)*radius,.07,e.z-Math.cos(e.yaw+off)*radius],.022,color,-.5)}
  m.sphere(at(0,2.2,.03),.055+.045*progress,color,-1.2);
 }
}
function scene(g,{debug=false}={}){
 const m=new Mesh(),t=g.time,p=g.player;
 for(const torch of g.map.torches){if(Math.hypot(torch.x-p.x,torch.z-p.z)>24)continue;const f=.85+Math.sin(t*8+torch.phase)*.08;m.sphere([torch.x,torch.y,torch.z],.16*f,[1,.35,.035],-1);m.sphere([torch.x+.018,torch.y+.17*f,torch.z],.1*f,[1,.7,.14],-.8);m.sphere([torch.x,torch.y-.03,torch.z],.08,[1,.86,.48],-1)}
 for(const c of g.containers){if(Math.hypot(c.x-p.x,c.z-p.z)>26)continue;if(c.corpse){if(c.items.length||c.gold){m.box([c.x,.18,c.z],[.35,.25,.30],leather);m.ring(c.x,.04,c.z,.46,[.45,.37,.16],-.3,0,Math.PI*2,.02)}continue}
  const satchel=c.name.includes('내려놓은');if(satchel){if(c.items.length){m.sphere([c.x,.22,c.z],.28,leather);m.box([c.x,.4,c.z],[.2,.07,.2],gold)}continue}
  m.box([c.x,.34,c.z],[.95,.62,.64],[.37,.22,.10],IDENT,3);for(const x of[-.36,.36])m.box([c.x+x,.36,c.z],[.09,.65,.69],c.rare?gold:iron,IDENT,4);
  const angle=c.searched?-.9:0,axes=[[1,0,0],[0,Math.cos(angle),Math.sin(angle)],[0,-Math.sin(angle),Math.cos(angle)]];m.box([c.x,c.searched?.87:.7,c.z+(c.searched?-.23:0)],[1,.14,.70],c.rare?[.43,.28,.10]:[.39,.25,.12],axes,3);m.box([c.x,.44,c.z+.34],[.17,.2,.065],gold,IDENT,4);
  if(c.searched&&c.items.length)m.sphere([c.x,.75,c.z],.08,[.46,.72,.85],-.8);
 }
 for(const e of g.enemies)enemyMesh(m,g,e);
 const exit=g.map.exit;
 if(Math.hypot(exit.x-p.x,exit.z-p.z)<30){
  m.box([exit.x,.05,exit.z],[2.5,.16,1.7],[.23,.27,.32],IDENT,2);for(let i=0;i<14;i++){const a=i/14*Math.PI,b=(i+1)/14*Math.PI;m.rod([exit.x+Math.cos(a)*1.03,1.4+Math.sin(a)*1.5,exit.z],[exit.x+Math.cos(b)*1.03,1.4+Math.sin(b)*1.5,exit.z],.15,[.28,.35,.41],1,6)}for(const x of[-1.03,1.03])m.box([exit.x+x,.77,exit.z],[.27,1.55,.30],[.30,.36,.42],IDENT,1);
  for(let j=0;j<3;j++){const r=.56+j*.12;for(let i=0;i<24;i++){const a=i/24*Math.PI*2+t*(j%2?1:-1)*.35,b=a+.18;m.rod([exit.x+Math.cos(a)*r,1.47+Math.sin(a)*r*1.7,exit.z+.025*j],[exit.x+Math.cos(b)*r,1.47+Math.sin(b)*r*1.7,exit.z+.025*j],.018+j*.008,[.10,.42+j*.1,.7+j*.08],-.8)}}m.ring(exit.x,.15,exit.z,1.1,[.16,.55,.80],-.8);
 }
 for(const bolt of g.projectiles){if(bolt.magic){m.sphere(bolt.pos,.16,[1,.42,.07],-1.2);m.sphere(V.sub(bolt.pos,V.mul(V.norm(bolt.vel),.20)),.10,[.9,.20,.02],-1)}else{const d=V.norm(bolt.vel);m.rod(V.sub(bolt.pos,V.mul(d,.5)),bolt.pos,.017,[.53,.35,.16],3);m.sphere(bolt.pos,.035,iron,4)}}
 for(const fx of g.effects){if(fx.ring)m.ring(fx.pos[0],.13,fx.pos[2],(1-fx.life/.5)*4.5,fx.color,-1,0,Math.PI*2,.1);else m.sphere(fx.pos,fx.life*.09,fx.color,-.6)}
 if(g.running&&!g.ended){const axes=yawAxes(p.yaw,p.pitch),eye=g.getEye();if(g.mode==='melee'){
   const wp=g.getBlade(p,p.attack);blade(m,wp,g.profileId);const elbow=localPoint(eye,axes,[.50,-.57,.48]);m.rod(elbow,wp.hilt,.085,[.26,.18,.13],3);m.sphere(wp.hilt,.08,[.42,.29,.18]);
   if(g.profileId!=='axe'){const b=g.shieldBox(p)||{center:localPoint(eye,axes,[-.63,-.68,1.03]),axes,half:[.26,.31,.065]};shield(m,b,p.guard&&g.time-p.guardAt<.23)}
  }else if(g.mode==='bow'){
   const local=(x,y,z)=>localPoint(eye,axes,[x,y,z]),points=[local(.3,.46,.72),local(.43,.23,.93),local(.48,-.13,1.0),local(.43,-.49,.93),local(.3,-.72,.72)];for(let i=0;i<4;i++)m.rod(points[i],points[i+1],.033,[.48,.28,.10],3);m.rod(points[0],points[4],.008,[.8,.73,.57]);m.rod(local(.43,-.48,.45),points[2],.085,leather);if(p.arrows)m.rod(local(.35,-.13,.52),local(.3,-.13,1.48),.015,iron,4);
  }else{const hand=localPoint(eye,axes,[.43,-.30,.65]);m.rod(localPoint(eye,axes,[.48,-.6,.45]),hand,.085,leather);m.sphere(hand,.105,[.49,.32,.19]);m.sphere(V.add(hand,[0,.20,0]),.15+Math.sin(t*4)*.02,[1,.36,.04],-1);for(let i=0;i<5;i++){let a=t*2+i*Math.PI*2/5;m.sphere(V.add(hand,[Math.cos(a)*.21,.15+Math.sin(a)*.08,Math.sin(a)*.21]),.023,[1,.7,.12],-1)}}
 }
 if(debug){for(const e of g.enemies.filter(e=>e.hp>0))for(const b of g.bodies(e))m.ring(b.center[0],b.center[1],b.center[2],b.radius,[.15,.85,.65],-.9);if(p.attack){const pose=g.getBlade(p,p.attack);for(let i=0;i<=8;i++)m.sphere(V.mix(pose.hilt,pose.tip,i/8),.07,[.1,1,.6],-1)}}
 return m;
}
window.CryptScene={scene,blade,shield,enemyMesh};
})();
