/* Harbor Motion v3 — fixed-tick procedural rig, not a frame-rate sine on rigid legs.
 * Gameplay heading: forward=(sin(yaw),0,-cos(yaw)); mesh faces local -Z.
 * Therefore the mesh matrix MUST use -yaw. Keep this conversion at the boundary.
 * Feet are planted in world space during stance. Render/pose sampling is read-only.
 */
'use strict';
const HarborMotion = (() => {
 const M=HM,TAU=Math.PI*2;
 const smooth=t=>{t=M.clamp(t,0,1);return t*t*(3-2*t);};
 // Critically damped spring, integrated analytically (same behaviour at any tick rate).
 function spring(x,v,target,omega,dt){const d=x-target,j=v+omega*d,e=Math.exp(-omega*dt);return [target+(d+j*dt)*e,(v-omega*j*dt)*e];}
 const mix3=(a,b,t)=>a.map((v,i)=>M.lerp(v,b[i],t));
 function root(pos,yaw=0){return M.compose(pos,[0,-yaw,0]);}
 function toWorld(a,p){const c=Math.cos(a.yaw||0),s=Math.sin(a.yaw||0);return[a.pos[0]+c*p[0]-s*p[2],a.pos[1]+p[1],a.pos[2]+s*p[0]+c*p[2]];}
 function toLocal(a,p){const c=Math.cos(a.yaw||0),s=Math.sin(a.yaw||0),dx=p[0]-a.pos[0],dz=p[2]-a.pos[2];return[c*dx+s*dz,p[1]-a.pos[1],-s*dx+c*dz];}
 // Analytic two-bone IK. Clamps the end effector instead of stretching bones.
 function ik(start,target,upper,lower,pole=[0,0,-1]){
  let delta=M.sub(target,start),raw=M.len(delta),dir=raw>1e-7?M.mul(delta,1/raw):[0,-1,0];
  const dist=M.clamp(raw,Math.abs(upper-lower)+1e-5,upper+lower-1e-5),end=M.add(start,M.mul(dir,dist));
  let bend=M.sub(pole,M.mul(dir,M.dot(pole,dir)));
  if(M.len(bend)<1e-5){const fallback=Math.abs(dir[0])<.8?[1,0,0]:[0,0,1];bend=M.sub(fallback,M.mul(dir,M.dot(fallback,dir)));}
  bend=M.norm(bend);const along=(upper*upper-lower*lower+dist*dist)/(2*dist),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  return {joint:M.add(M.add(start,M.mul(dir,along)),M.mul(bend,height)),end};
 }
 function reset(a){
  a.anim={phase:0,speed:0,move:0,run:0,sprint:0,crouch:0,raise:0,air:0,landTime:1,impact:0,leanX:0,leanZ:0,turn:0,
   prev:a.pos.slice(),prevYaw:a.yaw||0,wasGrounded:a.grounded!==false,elapsed:0,feet:[],localFeet:[],state:'idle',pivotPhase:0,pivot:0,landOffset:0,landVelocity:0,prep:0,upperYaw:0,footfall:0,airFeet:[[-.16,.14,-.12],[.16,.13,.12]]};
  for(const side of[-1,1]){const p=toWorld(a,[side*.16,.115,0]);a.anim.feet.push({world:p,anchor:p.slice(),lift:p.slice(),stance:true,pitch:0});a.anim.localFeet.push([side*.16,.115,0]);}
  return a.anim;
 }
 function update(a,dt,ground=null){
  if(!(dt>0&&Number.isFinite(dt)))return;
  let s=a.anim||reset(a);const dx=a.pos[0]-s.prev[0],dz=a.pos[2]-s.prev[2],distance=Math.hypot(dx,dz);
  if(distance>Math.max(3,dt*30)||Math.abs(a.pos[1]-s.prev[1])>3){s=reset(a);return;}
  const grounded=a.grounded!==false,alive=a.hp>0,active=alive&&!a.carId&&!a.transition,actual=active?distance/dt:0;
  const vx=active?dx/dt:0,vz=active?dz/dt:0,c=Math.cos(a.yaw||0),sn=Math.sin(a.yaw||0),localX=vx*c+vz*sn,localForward=vx*sn-vz*c;
  s.elapsed+=dt;s.speed=M.damp(s.speed,actual,13,dt);s.move=M.damp(s.move,actual>.12?1:0,actual>.12?14:19,dt);
  s.run=M.damp(s.run,smooth((s.speed-1.9)/2.6),9,dt);s.sprint=M.damp(s.sprint,smooth((s.speed-4.8)/1.6),10,dt);
  s.crouch=M.damp(s.crouch,a.cover&&!a.aim?1:a.sneak?.4:0,14,dt);
  s.raise=M.damp(s.raise,a.aim||a.weaponReady||((a.type==='guard'||a.type==='police')&&a.alert)?1:0,17,dt);
  s.air=M.damp(s.air,grounded?0:1,grounded?24:20,dt);
  const yawDelta=M.angle(s.prevYaw,a.yaw||0),yawRate=yawDelta/dt;
  const pivoting=active&&grounded&&actual<.12&&Math.abs(yawRate)>.32;
  s.pivot=M.damp(s.pivot,pivoting?1:0,14,dt);
  if(pivoting)s.pivotPhase=(s.pivotPhase+Math.abs(yawDelta)/2.6*TAU)%TAU;
  s.prep=M.damp(s.prep,a.jumpWindup?1:0,a.jumpWindup?25:18,dt);
  s.upperYaw=M.damp(s.upperYaw,a.aim||a.weaponReady?M.clamp(M.angle(a.yaw||0,a.lookYaw??a.yaw??0),-.75,.75):0,18,dt);
  s.turn=M.damp(s.turn,M.clamp(yawRate,-4,4),10,dt);
  s.leanX=M.damp(s.leanX,M.clamp(localForward*.022,-.1,.15),10,dt);
  s.leanZ=M.damp(s.leanZ,M.clamp(-localX*.026-s.turn*s.speed*.008,-.16,.16),10,dt);
  if(grounded&&!s.wasGrounded){s.landTime=0;s.impact=M.clamp((a.landImpact||5)/8,.25,1);s.landVelocity=-6*s.impact;for(const f of s.feet)f.stance=false;}
  else s.landTime+=dt;
  [s.landOffset,s.landVelocity]=spring(s.landOffset,s.landVelocity,0,18,dt);
  // Continuous air pose: no jump-cut when vertical speed crosses +1 or -1 m/s.
  const vy=a.vel?.[1]||0,rise=smooth((vy+.5)/4),fall=smooth((-vy+.2)/4),lead=Math.sin(s.phase)>=0?0:1;
  for(let i=0;i<2;i++){const front=i===lead,side=i===0?-1:1;
   const hang=[side*.17,front?.33:.24,front?-.20:.16],up=[side*.16,front?.31:.23,front?-.28:.18],down=[side*.16,.14,front?-.12:.12];
   const target=mix3(mix3(hang,up,rise),down,fall);s.airFeet[i]=mix3(s.airFeet[i],target,1-Math.exp(-16*dt));
  }
  const stride=M.lerp(1.25,2.60,s.run)+s.sprint*.15,stance=M.lerp(.62,.46,s.run),canGait=active&&grounded&&actual>.12&&!a.jumpWindup;
  // Distance (not wall-clock time or desired velocity) drives footfall frequency.
  if(canGait)s.phase=(s.phase+distance/stride*TAU)%TAU;
  const direction=actual>.1?[vx/actual,0,vz/actual]:[Math.sin(a.yaw||0),0,-Math.cos(a.yaw||0)];
  for(let i=0;i<2;i++){
   const side=i===0?-1:1,f=s.feet[i],q=((pivoting?s.pivotPhase:s.phase)/TAU+i*.5)%1,neutral=toWorld(a,[side*(.16+s.crouch*.025),.115,0]);
   if(pivoting){
    // One foot pivots on a planted contact while the other takes a short replacement step.
    const plant=.52;
    if(q<plant){if(!f.stance){f.anchor=f.world.slice();f.stance=true;s.footfall++;}f.world=f.anchor.slice();}
    else{if(f.stance){f.lift=f.world.slice();f.stance=false;}const u=(q-plant)/(1-plant);f.world=mix3(f.lift,neutral,smooth(u));f.world[1]=neutral[1]+Math.sin(Math.PI*u)*.085;}
    const reach=Math.hypot(f.world[0]-neutral[0],f.world[2]-neutral[2]);if(reach>.43){f.world=mix3(f.world,neutral,1-.43/reach);f.anchor=f.world.slice();}
    f.pitch=M.damp(f.pitch,0,18,dt);
   }else if(!canGait){
    // Airborne feet are handled by pose(). Ground stop settles a partial step.
    const travel=Math.hypot(f.world[0]-neutral[0],f.world[2]-neutral[2]);
    f.world=mix3(f.world,neutral,1-Math.exp(-(grounded?14:22)*dt));
    f.world[1]=neutral[1]+(grounded?Math.min(.05,travel*.12):0);f.anchor=f.world.slice();f.lift=f.world.slice();f.stance=true;f.pitch=M.damp(f.pitch,0,16,dt);
   }else if(q<stance){
    if(!f.stance){const lead=Math.min(.64,stride*stance*.5)-q*stride;f.anchor=[neutral[0]+direction[0]*lead,neutral[1],neutral[2]+direction[2]*lead];f.stance=true;s.footfall++;}
    f.world=f.anchor.slice();
    // A very sharp turn/reversal may exhaust a planted leg; recover rather than stretch.
    const reach=Math.hypot(f.world[0]-neutral[0],f.world[2]-neutral[2]);
    if(reach>.68){const t=1-.68/reach;f.world=mix3(f.world,neutral,t);f.anchor=f.world.slice();}
    if(ground)f.world[1]=ground(f.world[0],f.world[2],a.pos[1]+.28)+.115;else f.world[1]=a.pos[1]+.115;
    const u=q/stance;f.pitch=M.lerp(.13,-.17,smooth((u-.35)/.65));
   }else{
    if(f.stance){f.lift=f.world.slice();f.stance=false;}
    const u=(q-stance)/(1-stance),lead=Math.min(.64,stride*stance*.5),target=[neutral[0]+direction[0]*lead,neutral[1],neutral[2]+direction[2]*lead];
    if(ground)target[1]=ground(target[0],target[2],a.pos[1]+.28)+.115;
    f.world=mix3(f.lift,target,smooth(u));f.world[1]=M.lerp(f.lift[1],target[1],u)+Math.sin(Math.PI*u)*(.11+s.run*.14+s.sprint*.07);
    f.pitch=M.lerp(-.16,.16,smooth(u));
   }
   s.localFeet[i]=toLocal(a,f.world);
  }
  s.state=!alive?'down':a.transition?'transition':a.carId?'seated':a.jumpWindup?'anticipation':!grounded?(a.vel?.[1]>1?'rise':a.vel?.[1]<-1?'fall':'apex'):s.landTime<.22?'land':actual<.12?(pivoting?'pivot':'idle'):a.aim?(localForward<-.25?'aim-back':Math.abs(localX)>Math.abs(localForward)?'aim-strafe':'aim-walk'):s.speed>5?'sprint':s.speed>2.2?'run':'walk';
  s.prev=a.pos.slice();s.prevYaw=a.yaw||0;s.wasGrounded=grounded;
 }
 function pose(a){
  const s=a.anim||{phase:0,speed:0,move:0,run:0,sprint:0,crouch:0,raise:a.aim?1:0,air:0,landTime:1,impact:0,leanX:0,leanZ:0,elapsed:0,localFeet:[[-.16,.115,0],[.16,.115,0]],feet:[{pitch:0},{pitch:0}]};
  const airborne=a.grounded===false,vy=a.vel?.[1]||0,prep=s.prep||0;
  const land=M.clamp(-(s.landOffset||0)/.15,0,1);
  const bob=Math.cos(s.phase*2)*(.010+s.run*.016)*s.move*(1-s.air);
  let hip=.995-s.crouch*.42-prep*.10+(s.landOffset||0)+bob+Math.sin(s.elapsed*2)*.004*(1-s.move);
  const feet=s.localFeet.map((f,i)=>mix3(f,s.airFeet?.[i]||[i===0?-.16:.16,.2,0],s.air));
  // Two 0.47m leg segments, with a small knee reserve, never hyperextend.
  for(let i=0;i<2;i++){
   const x=(i===0?-.16:.16),f=feet[i],horizontal=Math.hypot(f[0]-x,f[2]);
   if(horizontal>.65){const t=.65/horizontal;f[0]=x+(f[0]-x)*t;f[2]*=t;}
   const h2=(f[0]-x)**2+f[2]**2;hip=Math.min(hip,f[1]+Math.sqrt(Math.max(.1,.928**2-h2)));
  }
  const torsoPitch=s.leanX*(1-s.air)+s.crouch*.16+prep*.17+land*.17+s.air*.08,torsoRoll=s.leanZ*(1-s.air),twist=Math.sin(s.phase)*s.run*s.move*.055*(1-s.raise)*(1-s.air);
  const torso=M.compose([0,hip,0],[torsoPitch,twist-(s.upperYaw||0),torsoRoll]);
  const tp=p=>M.transform(torso,p).slice(0,3),longGun=(a.weapon??2)>0;
  const carry=M.lerp(-.70-s.sprint*.14,a.pitch||0,s.raise),recoil=a.recoil||0;
  let gunPos=tp([.19,.32,-.25+recoil*.025]),gunRot=[carry+recoil*.07,twist-(s.upperYaw||0),-.04];
  if(a.reloadProgress!==null&&a.reloadProgress!==undefined){gunPos=tp([.10,.35,-.30]);gunRot=[.2,-.25,-.25];}
  const gun=M.compose(gunPos,gunRot),gp=p=>M.transform(gun,p).slice(0,3);
  const armed=a.type==='player'||a.type==='guard'||a.type==='police'||a.armed;
  const arms=[];
  for(let i=0;i<2;i++){
   const side=i===0?-1:1,shoulder=tp([side*.29,.47,0]);let hand;
   const swing=Math.sin(s.phase+i*Math.PI)*(.12+s.run*.22)*s.move*(1-s.air);
   const freeHand=tp([side*(.35+s.air*.10),.02+s.run*.16+s.air*.25,swing-.06-s.air*.19]);
   if(armed){const grip=gp(side>0?[0,-.10,.08]:longGun?[-.13,-.01,-.20]:[-.07,-.08,.06]);
    let gripWeight=side>0?1:longGun?M.lerp(1-smooth((s.sprint-.12)/.65),1,s.raise):s.raise;
    hand=mix3(freeHand,grip,gripWeight);
    if(side<0&&a.reloadProgress!=null){const reach=Math.sin(Math.PI*M.clamp(a.reloadProgress/.72,0,1));hand=mix3(hand,tp([-.12,.24-reach*.25,-.26]),smooth(reach));}
   }else hand=freeHand;
   const elbow=ik(shoulder,hand,.32,.32,[side,0,.38]);arms.push({shoulder,elbow:elbow.joint,hand:elbow.end});
  }
  const legs=feet.map((foot,i)=>{const hipPoint=[i===0?-.155:.155,hip,0],sol=ik(hipPoint,foot,.47,.47,[0,0,-1]);return{hip:hipPoint,knee:sol.joint,ankle:sol.end,pitch:M.lerp(s.feet[i]?.pitch||0,airborne?-.12:0,s.air)};});
  return {hip,torso,tp,legs,arms,gun,armed,longGun,torsoPitch,torsoRoll,phase:s.phase,state:s.state||'idle'};
 }
 // Snapshot only presentation channels; interpolation never writes simulation state.
 function snapshot(a){const q=a.anim||{};return {pos:a.pos.slice(),yaw:a.yaw||0,pitch:a.pitch||0,anim:{...Object.fromEntries(Object.entries(q).filter(([,v])=>typeof v==='number')),localFeet:q.localFeet?.map(v=>v.slice()),airFeet:q.airFeet?.map(v=>v.slice()),feet:q.feet?.map(f=>({pitch:f.pitch||0}))}};}
 function visual(a,prev,alpha=1){if(!prev||!a.anim||alpha>=1||M.len(M.sub(a.pos,prev.pos))>2)return a;alpha=M.clamp(alpha,0,1);const s={...a.anim},old=prev.anim;
  for(const k of Object.keys(old))if(typeof old[k]==='number'&&typeof s[k]==='number')s[k]=(k==='phase'||k==='pivotPhase')?old[k]+M.angle(old[k],s[k])*alpha:M.lerp(old[k],s[k],alpha);
  for(const k of ['localFeet','airFeet'])if(old[k]&&s[k])s[k]=s[k].map((v,i)=>mix3(old[k][i],v,alpha));
  if(old.feet&&s.feet)s.feet=s.feet.map((v,i)=>({...v,pitch:M.lerp(old.feet[i].pitch,v.pitch,alpha)}));
  return {...a,pos:mix3(prev.pos,a.pos,alpha),yaw:prev.yaw+M.angle(prev.yaw,a.yaw||0)*alpha,pitch:M.lerp(prev.pitch,a.pitch||0,alpha),anim:s};
 }
 return {root,toWorld,toLocal,ik,reset,update,pose,smooth,spring,snapshot,visual};
})();
window.HarborMotion=HarborMotion;
