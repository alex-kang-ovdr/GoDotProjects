'use strict';
class HarborModels {
 constructor(r){this.r=r;}
 // Draw a rigid bone between two joints. Matrix Y follows the bone; no Euler guesswork.
 bone(a,b,width,depth,color,parent){const d=HM.sub(b,a),length=HM.len(d);if(length<.0001)return;const y=HM.mul(d,1/length),ref=Math.abs(y[2])>.95?[1,0,0]:[0,0,1],x=HM.norm(HM.cross(y,ref)),z=HM.cross(x,y),p=HM.mul(HM.add(a,b),.5),m=new Float32Array([...x,0,...y,0,...z,0,...p,1]);this.r.box([0,0,0],[width,length,depth],color,[0,0,0],HM.mm(parent,m));}
 person(a,time,player=false){
  const r=this.r,dead=a.hp<=0,pose=HarborMotion.pose(a);
  let root=HarborMotion.root(a.pos,a.yaw||0);
  if(dead)root=HM.mm(root,HM.compose([0,.43,0],[0,0,1.48]));
  const pants=a.type==='police'?0x293b50:0x293c48,shirt=player?0x4d8584:a.type==='guard'?0x9e694f:a.type==='police'?0x354d63:a.color||0xa8b6aa,skin=a.skin||0xc69878;
  const part=(p,s,c,rot=[0,0,0],par=root)=>r.box(p,s,c,rot,par),torso=HM.mm(root,pose.torso);
  // Pelvis, tapered jacket, neck and head. Accessories follow the torso, not the root.
  part([0,pose.hip-.03,0],[.40,.19,.27],pants);
  part([0,pose.hip+.04,0],[.42,.065,.29],0x24353b);part([0,pose.hip+.04,-.152],[.07,.05,.025],0xa7b5a5);
  part([0,.27,0],[.46,.49,.30],shirt,[0,0,0],torso);
  part([0,.43,0],[.51,.15,.30],shirt,[0,0,0],torso);
  part([0,.55,0],[.15,.15,.15],skin,[0,0,0],torso);
  // Keep the eyes stable while the torso leans into acceleration / landing.
  const head=HM.mm(root,HM.compose(pose.tp([0,.56,0]),[-pose.torsoPitch*.35,0,-pose.torsoRoll*.5]));
  part([0,.19,0],[.30,.34,.29],skin,[0,0,0],head);
  part([0,.345,.025],[.32,.10,.30],0x263134,[0,0,0],head);
  part([0,.23,-.153],[.255,.046,.025],a.type==='guard'?0x263b40:0x665b4c,[0,0,0],head);
  part([0,.16,-.17],[.055,.08,.045],skin,[0,0,0],head);
  for(const side of[-1,1])part([side*.157,.18,.0],[.045,.09,.07],skin,[0,0,0],head);
  if(a.type==='police'){part([0,.39,0],[.35,.08,.32],0x1b2c3b,[0,0,0],head);part([0,.35,-.17],[.32,.025,.13],0x1b2c3b,[0,0,0],head);part([.13,.39,-.161],[.07,.09,.02],0xd2bc65,[0,0,0],torso);}
  if(player){part([0,.28,-.162],[.32,.37,.035],0x345b60,[0,0,0],torso);part([0,.27,.19],[.29,.38,.11],0x263b45,[0,0,0],torso);for(const side of[-1,1])part([side*.17,.31,-.176],[.045,.42,.025],0x283e44,[0,0,0],torso);}
  for(const leg of pose.legs){
   this.bone(leg.hip,leg.knee,.21,.24,pants,root);this.bone(leg.knee,leg.ankle,.17,.20,pants,root);
   part(leg.knee,[.205,.16,.22],0x304652);
   const foot=leg.ankle,footY=foot[1]-.04+Math.abs(Math.sin(leg.pitch))*.19;
   part([foot[0],footY,foot[2]-.075],[.215,.14,.36],0x1b2c34,[leg.pitch,0,0]);
   part([foot[0],footY-.057,foot[2]-.075],[.22,.035,.37],0x3e4c4c,[leg.pitch,0,0]);
  }
  for(const arm of pose.arms){
   this.bone(arm.shoulder,arm.elbow,.19,.21,shirt,root);this.bone(arm.elbow,arm.hand,.135,.15,skin,root);
   part(arm.elbow,[.16,.15,.17],shirt);part(arm.hand,[.13,.13,.15],player?0x35494a:skin);
  }
  if(pose.armed){
   const gun=HM.mm(root,pose.gun),long=pose.longGun;
   part([0,0,-.10],[.105,.13,long?.44:.23],0x1c3038,[0,0,0],gun);
   part([0,-.105,.065],[.085,.18,.095],0x344750,[-.18,0,0],gun);
   if(long){part([0,0,-.38],[.06,.065,.28],0x263943,[0,0,0],gun);part([0,0,.20],[.10,.13,.22],0x2d4148,[0,0,0],gun);part([0,-.14,-.055],[.075,.21,.10],0x27383c,[.13,0,0],gun);part([0,.095,-.08],[.075,.07,.14],0x14252c,[0,0,0],gun);}
  }
 }
 muzzle(a){const pose=HarborMotion.pose(a),m=HM.mm(HarborMotion.root(a.pos,a.yaw||0),pose.gun);return HM.transform(m,[0,0,pose.longGun?-.53:-.23]).slice(0,3);}
 car(c,time){const r=this.r,root=HM.compose([c.x,c.y||0,c.z],[0,-c.yaw,c.roll||0]),paint=c.hp<=0?0x3e4748:c.color;const box=(p,s,color,rot=[0,0,0],parent=root)=>r.box(p,s,color,rot,parent);let van=c.kind==='van';
  box([0,.55,0],[1.95,.55,4.1],paint);box([0,.86,-1.26],[1.85,.21,1.5],paint,[.04,0,0]);box([0,.8,1.49],[1.86,.2,.94],paint);box([0,.34,0],[1.55,.2,3.7],0x263b40);box([0,1.1,.23],[1.65,.65,van?2.4:1.85],0x3d6576);box([0,1.48,.3],[1.71,.16,van?2.65:1.4],paint);if(van)box([0,1.18,1.15],[1.82,1.12,1.45],paint);
  box([0,1.09,-.71],[1.56,.56,.07],0x587f87,[.27,0,0]);box([0,1.09,1.17],[1.56,.51,.07],0x3d6572,[-.26,0,0]);for(const side of[-1,1]){box([side*.87,1.14,.3],[.075,.68,.08],paint);box([side*.99,.93,-.5],[.18,.15,.23],paint);box([side*.99,.7,.3],[.03,.06,.28],0xb5c5be);box([side*.67,.69,-2.067],[.47,.17,.055],0xf5dfaa);box([side*.67,.68,2.067],[.43,.17,.055],0xc96e54);
   for(const z of[-1.25,1.32]){let w=HM.mm(root,HM.compose([side*.97,.43,z],[0,z<0?-(c.steer||0)*.35:0,0]));r.cylinder([0,0,0],[.8,.3,.8],0x24343b,[0,0,Math.PI/2],w);r.cylinder([side*.165,0,0],[.43,.025,.43],0x93a4a4,[0,0,Math.PI/2],w);box([side*.182,0,0],[.026,.35,.06],0xd0d8cf,[c.wheel||0,0,0],w);}}
  box([0,.5,-2.09],[1.8,.15,.12],0xb9c6be);box([0,.5,2.09],[1.8,.15,.12],0xa6b7b5);box([0,.69,2.16],[.5,.18,.025],0xe5d9af);
  if(c.kind==='police'){box([0,1.63,.3],[1.35,.15,.28],0x273c47);box([-.4,1.74,.3],[.45,.15,.25],Math.sin(time*13)>0?0xff6b64:0x7f4948);box([.4,1.74,.3],[.45,.15,.25],Math.sin(time*13)<0?0x76cfee:0x3a6f89);box([-.992,.7,.27],[.025,.44,1.8],0xdfdfd3);box([.992,.7,.27],[.025,.44,1.8],0xdfdfd3);}
  if(c.doorOpen){let side=HM.mm(root,HM.compose([-1,0,-.5],[0,-.65,0]));box([0,.79,.5],[.09,.55,1.2],paint,[0,0,0],side);box([0,1.16,.5],[.07,.43,1.05],0x5b7f87,[0,0,0],side);}
 }
 beam(a,b,color,width=.025){const d=HM.sub(b,a),l=HM.len(d);if(l<.001)return;const p=HM.mul(HM.add(a,b),.5);this.r.box(p,[width,width,l],color,[-Math.asin(d[1]/l),Math.atan2(d[0],d[2]),0]);}
}
class HarborAudio {
 constructor(){this.ctx=null;this.volume=.3;this.engine=null;this.siren=null;}
 start(){try{if(!this.ctx){this.ctx=new(window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=this.volume;this.master.connect(this.ctx.destination);this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate*.5,this.ctx.sampleRate);const a=this.noise.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
  const osc=this.ctx.createOscillator(),filter=this.ctx.createBiquadFilter(),gain=this.ctx.createGain();osc.type='sawtooth';filter.type='lowpass';filter.frequency.value=300;gain.gain.value=0;osc.connect(filter);filter.connect(gain);gain.connect(this.master);osc.start();this.engine={osc,gain};const so=this.ctx.createOscillator(),sg=this.ctx.createGain();so.type='sine';sg.gain.value=0;so.connect(sg);sg.connect(this.master);so.start();this.siren={osc:so,gain:sg};}this.ctx.resume().catch(()=>{});}catch(e){console.warn('Audio unavailable',e.message);}}
 noiseShot(heavy=false){if(!this.ctx)return;const c=this.ctx,t=c.currentTime,s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=this.noise;f.type='lowpass';f.frequency.value=heavy?1300:2600;g.gain.setValueAtTime(heavy?.55:.25,t);g.gain.exponentialRampToValueAtTime(.001,t+(heavy?.27:.12));s.connect(f);f.connect(g);g.connect(this.master);s.start();s.stop(t+.3);}
 footstep(strength=.5,landing=false){if(!this.ctx)return;const c=this.ctx,t=c.currentTime;if(t-(this.lastStepAt??-10)<.085&&!landing)return;this.lastStepAt=t;
  const src=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();src.buffer=this.noise;f.type='lowpass';f.frequency.value=landing?240:500;g.gain.setValueAtTime((landing?.18:.07)*strength,t);g.gain.exponentialRampToValueAtTime(.001,t+(landing?.14:.075));src.connect(f);f.connect(g);g.connect(this.master);src.start();src.stop(t+.16);
 }
 beep(freq=600,len=.12){if(!this.ctx)return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.08,t);g.gain.exponentialRampToValueAtTime(.001,t+len);o.connect(g);g.connect(this.master);o.start();o.stop(t+len);}
 update(speed,driving,wanted,time,paused){if(!this.ctx)return;const t=this.ctx.currentTime;this.master.gain.setTargetAtTime(this.volume,t,.1);this.engine.osc.frequency.setTargetAtTime(35+Math.abs(speed)*3,t,.12);this.engine.gain.gain.setTargetAtTime(driving&&!paused?.06:0,t,.1);this.siren.osc.frequency.setTargetAtTime(510+Math.sin(time*4)*160,t,.03);this.siren.gain.gain.setTargetAtTime(wanted&&!paused?.017:0,t,.2);}
}
window.HarborModels=HarborModels;window.HarborAudio=HarborAudio;
