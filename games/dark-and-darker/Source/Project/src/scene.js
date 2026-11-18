/* v15 equipment-aware view models on the v14 procedural graphics pipeline. */
(function(){
'use strict';
const {V,clamp,lerp,yawAxes,localPoint,attackPhase}=CryptCore,{Mesh,IDENT}=CryptRender;
const bone=[.59,.61,.56],iron=[.38,.43,.46],dark=[.10,.12,.13],gold=[.65,.43,.17],leather=[.24,.14,.08];
function blade(m,pose,id,scale=1){
 const a=pose.hilt,b=pose.tip,d=V.norm(V.sub(b,a)),side=V.norm(V.cross(d,pose.axes?.[2]||[0,0,1])),right=V.len(side)>.01?side:[1,0,0],normal=V.norm(V.cross(right,d)),at=(x,y,z=0)=>V.add(a,V.add(V.mul(right,x*scale),V.add(V.mul(d,y*scale),V.mul(normal,z*scale))));
 m.rod(at(0,-.25),a,.050*scale,leather,3,10);m.ellipsoid(at(0,-.28),[.071*scale,.071*scale,.071*scale],gold,IDENT,7,10,5);
 for(let i=0;i<6;i++)m.rod(at(-.047,-.23+i*.035),at(.047,-.21+i*.035),.009*scale,[.48,.36,.20],3,5);
 if(id==='axe'){
  m.rod(a,b,.043*scale,[.35,.22,.10],3,10);const c=V.mix(a,b,.79),pt=(x,y,z)=>V.add(c,V.add(V.mul(right,x*scale),V.add(V.mul(d,y*scale),V.mul(normal,z*scale))));
  const outline=[[-.06,-.10],[.20,-.24],[.42,-.25],[.47,.03],[.39,.23],[.15,.17],[-.06,.12]];
  for(let i=0;i<outline.length;i++){const q=outline[i],r=outline[(i+1)%outline.length];m.tri(pt(0,0,.055),pt(...q,.055),pt(...r,.055),[.57,.62,.64],4);m.tri(pt(0,0,-.055),pt(...r,-.055),pt(...q,-.055),[.38,.44,.47],4);m.quad(pt(...q,-.055),pt(...r,-.055),pt(...r,.055),pt(...q,.055),[.72,.78,.77],4)}
  m.rod(V.mix(a,b,.68),V.mix(a,b,.91),.075*scale,[.43,.40,.32],7,8);
 }else{
  const w=(id==='dagger'?.062:.076)*scale,near=V.mix(a,b,.83),tl=V.add(near,V.mul(right,w*.74)),tr=V.sub(near,V.mul(right,w*.74)),bl=V.add(a,V.mul(right,w)),br=V.sub(a,V.mul(right,w)),ridge=V.add(V.mix(a,b,.48),V.mul(normal,.032*scale));
  m.tri(bl,tl,ridge,[.70,.77,.79],4);m.tri(tl,b,ridge,[.86,.91,.90],4);m.tri(b,tr,ridge,[.58,.66,.70],4);m.tri(tr,br,ridge,[.42,.50,.55],4);m.tri(br,bl,ridge,[.59,.66,.69],4);m.quad(br,tr,tl,bl,[.53,.60,.64],4);m.tri(tr,b,tl,[.75,.82,.83],4);
  const guard=[at(-.21,.015),at(-.14,-.012),at(0,0),at(.14,-.012),at(.21,.015)];m.path(guard,.034*scale,gold,7,8);
  for(const sg of[-1,1])m.ellipsoid(at(sg*.21,.015),[.043*scale,.043*scale,.043*scale],gold,IDENT,7,8,4);
  m.rod(V.add(V.mix(a,b,.15),V.mul(normal,.026*scale)),V.add(V.mix(a,b,.68),V.mul(normal,.035*scale)),.010*scale,[.17,.24,.28],4,4);
  // Short engraved strokes, not a separate fictional damage indicator.
  for(let i=0;i<4;i++){const c=V.add(V.mix(a,b,.18+i*.075),V.mul(normal,.040*scale));m.rod(V.add(c,V.mul(right,-.021*scale)),V.add(c,V.mul(right,.016*scale)),.005*scale,[.65,.54,.31],7,4)}
 }
}
function shield(m,box,timed=false){
 const{center,axes,half}=box,[w,h,d]=half,at=(x,y,z)=>localPoint(center,axes,[x,y,z]),rim=[[-.72,-.96],[.72,-.96],[1,-.72],[1,.65],[.70,.97],[-.70,.97],[-1,.65],[-1,-.72]];
 for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length],A=at(a[0]*w,a[1]*h,d),B=at(b[0]*w,b[1]*h,d),aa=at(a[0]*w,a[1]*h,-d),bb=at(b[0]*w,b[1]*h,-d);m.tri(at(0,0,d+.034),A,B,timed?[.52,.40,.19]:[.26,.31,.34],4);m.tri(at(0,0,-d),bb,aa,[.30,.19,.095],3);m.quad(A,aa,bb,B,gold,7);m.rod(A,B,.022,gold,7,7);m.ellipsoid(at(a[0]*w*.85,a[1]*h*.85,d+.025),[.025,.025,.025],[.66,.58,.38],IDENT,7,6,4)}
 m.ellipsoid(at(0,0,d+.045),[w*.29,h*.21,.085],[.46,.50,.48],axes,4,12,6);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;m.rod(at(Math.sin(a)*w*.32,Math.cos(a)*h*.24,d+.04),at(Math.sin(a)*w*.48,Math.cos(a)*h*.39,d+.04),.012,gold,7,4)}
 // Inner leather handle is visible from the first-person side.
 m.rod(at(-w*.22,0,-d-.025),at(w*.22,0,-d-.025),.045,leather,3,8);
}
function enemyMesh(m,g,e){
 const p=g.player;if(Math.hypot(e.x-p.x,e.z-p.z)>30)return;const s=e.scale,dead=e.hp<=0,fall=dead?clamp(e.deathTime/.7,0,1):0,axes=yawAxes(e.yaw),gait=Math.sin(e.walk)*Math.min(1,e.speedNow),flash=e.hitFlash>0,bc=flash?[.97,.71,.52]:bone;
 const at=(x,y,z=0)=>{if(dead){const a=fall*Math.PI*.48;const yy=y*Math.cos(a)-z*Math.sin(a)+fall*.12,zz=y*Math.sin(a)+z*Math.cos(a);return localPoint([e.x,0,e.z],axes,[x*s,yy*s,zz*s])}return localPoint([e.x,0,e.z],axes,[x*s,(y+(e.stagger>0?-.08:0))*s,z*s])};
 const box=(x,y,z,sz,col,mat=5)=>m.bevelBox(at(x,y,z),sz.map(v=>v*s),col,axes,mat,.035);
 const ell=(x,y,z,r,col=bc,mat=5)=>m.ellipsoid(at(x,y,z),r.map(v=>v*s),col,axes,mat,Math.hypot(e.x-p.x,e.z-p.z)>13?8:12,6);
 // Articulated anatomical silhouette; no gameplay collider changes.
 for(const side of[-1,1])ell(side*.105,.75,0,[.105,.085,.095]);
 m.rod(at(0,.78),at(0,1.42),.058*s,bc,5,8);
 for(let i=0;i<5;i++){const y=.94+i*.096,w=.21-i*.011;for(const side of[-1,1])m.path([at(0,y-.03,.12),at(side*w*.65,y,.17),at(side*w,y+.025,.06),at(side*w*.8,y,-.10),at(0,y,-.12)],.026*s,bc,5,6)}
 for(const side of[-1,1]){const a=gait*side,hip=at(side*.145,.72),knee=at(side*.17,.43,Math.sin(a)*.12),ankle=at(side*.18,.09,Math.sin(a)*.26);m.rod(hip,knee,.059*s,bc,5,8);m.ellipsoid(knee,[.069*s,.075*s,.066*s],bc,axes,5,8,4);m.rod(knee,ankle,.043*s,bc,5,8);m.rod(V.add(knee,V.mul(axes[0],.042*s)),V.add(ankle,V.mul(axes[0],.032*s)),.021*s,bc,5,6);m.bevelBox(V.add(ankle,V.mul(axes[2],.065*s)),[.15*s,.12*s,.27*s],leather,axes,3)}
 m.rod(at(-.28,1.38),at(.28,1.38),.057*s,bc,5,8);m.rod(at(0,1.4),at(0,1.58),.061*s,bc,5,8);
 ell(0,1.77,-.015,[.181,.193,.155]);ell(0,1.63,.045,[.135,.11,.12]);
 for(const side of[-1,1]){ell(side*.083,1.77,.130,[.060,.044,.037],[.022,.027,.026],0);ell(side*.083,1.767,.163,[.012,.010,.008],e.type==='warden'?[.16,.64,1]:[.78,.23,.045],-.5);ell(side*.135,1.685,.103,[.044,.039,.052]);m.rod(at(side*.035,1.827,.145),at(side*.148,1.817,.119),.025*s,bc,5,6)}
 m.tri(at(0,1.72,.170),at(-.032,1.655,.17),at(.032,1.655,.17),[.025,.028,.023]);
 ell(0,1.575,.054,[.135,.046,.101]);for(let i=0;i<6;i++)box(-.097+i*.039,1.597,.147,[.026,.047,.022],[.75,.75,.67],5);
 // Torn tabard / cloak, animated at the hem. Cosmetic only.
 if(e.type==='archer'||e.type==='warden'){const cloth=e.type==='warden'?[.28,.065,.052]:[.18,.24,.21];for(let i=0;i<6;i++){const x=-.26+i*.087,x2=x+.087,flutter=Math.sin(g.time*2.6+i*.8+e.walk)*.055;m.quad(at(x,1.42,-.19),at(x2,1.42,-.19),at(x2,.48+(i%2)*.07,-.23+flutter),at(x,.48+((i+1)%2)*.07,-.23+flutter),cloth,6)}}
 if(e.type==='guardian'||e.type==='warden'){
  ell(0,1.18,-.015,[.29,.31,.20],e.type==='warden'?[.20,.25,.30]:iron,4);for(const side of[-1,1]){ell(side*.32,1.43,0,[.18,.12,.21],iron,4);box(side*.30,1.36,.13,[.20,.07,.13],gold,7)}ell(0,1.91,-.03,[.22,.115,.21],iron,4);box(0,1.90,.14,[.40,.06,.05],gold,7);box(0,1.77,.17,[.045,.25,.04],iron,4);
  if(e.type==='warden'){box(0,1.98,0,[.44,.09,.40],gold,7);for(let i=0;i<5;i++){const a=i*Math.PI*2/5;m.rod(at(Math.cos(a)*.21,1.97,Math.sin(a)*.19),at(Math.cos(a)*.24,2.19+(i===0?.08:0),Math.sin(a)*.22),.047*s,gold,7,6,.005)}box(0,1.19,.195,[.07,.37,.025],gold,7)}
 }
 let weapon=g.getBlade(e,e.attack);const ls=at(-.30,1.38),rs=at(.30,1.38);
 let left=at(-.40,.98,.08),right=weapon.hilt;
 if(dead){left=at(-.46,.92,.1);right=at(.52,.94,.1)}
 if(e.type==='archer'&&!dead){const aim=e.attack?clamp(e.attack.t/e.attack.profile.windup,0,1):0;left=at(-.25,1.34,.42);right=at(.19,1.36,.37-aim*.26);const points=[at(-.26,1.96,.47),at(-.33,1.68,.64),left,at(-.33,1.03,.64),at(-.26,.78,.47)];for(let i=0;i<points.length-1;i++)m.rod(points[i],points[i+1],.033*s,[.40,.25,.12],3);m.rod(points[0],right,.009*s,[.65,.61,.46]);m.rod(right,points[4],.009*s,[.65,.61,.46]);if(e.attack)m.rod(right,at(.1,1.36,1.1),.015*s,iron,4)}
 for(const [shoulder,wrist,side]of[[ls,left,-1],[rs,right,1]]){const elbow=V.add(V.mix(shoulder,wrist,.55),V.add(V.mul(axes[0],.10*side*s),[0,-.12*s,0]));m.rod(shoulder,elbow,.055*s,bc,5,8);m.ellipsoid(elbow,[.066*s,.066*s,.066*s],bc,axes,5,8,4);m.rod(elbow,wrist,.044*s,bc,5,8);m.ellipsoid(wrist,[.063*s,.073*s,.054*s],bc,axes,5,8,4)}
 if(e.type!=='archer'){if(!dead){blade(m,weapon,e.attack?.id||(e.type==='guardian'?'axe':'sword'),s);const b=g.shieldBox(e);if(b)shield(m,b)}else blade(m,{hilt:at(.48,.15,.45),tip:at(.85,.12,1.40),axes},'sword',s)}
 if(!dead&&e.attack&&e.state==='windup'){
  const a=e.attack,progress=clamp(a.t/a.profile.windup,0,1),color=a.kind==='pulse'?[.15,.57,.87]:e.type==='warden'?[.9,.25,.07]:[.86,.5,.12],radius=a.kind==='pulse'?4.5:e.type==='archer'?1:e.range;
  if(a.kind==='pulse')m.ring(e.x,.055,e.z,radius,color,-.6,0,Math.PI*2,.07);
  else if(a.kind!=='shot'){const half=a.kind==='slam'?.32:1.0;m.ring(e.x,.055,e.z,radius,color,-.5,e.yaw-half,e.yaw+half,.07);for(const off of[-half,half])m.rod([e.x,.07,e.z],[e.x+Math.sin(e.yaw+off)*radius,.07,e.z-Math.cos(e.yaw+off)*radius],.022,color,-.5)}
  m.sphere(at(0,2.2,.03),.055+.045*progress,color,-1.2);
 }
}
function hand(m,eye,axes,wrist,side=1){
 const elbow=localPoint(eye,axes,[side*.50,-.60,.42]);m.rod(elbow,wrist,.077,leather,3,9);m.rod(V.mix(elbow,wrist,.12),V.mix(elbow,wrist,.58),.088,[.31,.34,.34],4,8);m.ellipsoid(wrist,[.079,.082,.065],[.36,.25,.16],axes,3,9,5);
}
function staff(m,pose,cast,spellId,t){
 const a=pose.hilt,b=pose.tip,d=V.norm(V.sub(b,a)),bottom=V.sub(a,V.mul(d,.48)),axes=pose.axes||IDENT;
 m.rod(bottom,b,.042,[.28,.17,.085],3,9);m.rod(V.sub(b,V.mul(d,.19)),b,.067,gold,7,9);
 for(let i=0;i<7;i++){const c=V.add(a,V.mul(d,-.12+i*.055));m.ellipsoid(c,[.051,.025,.051],leather,axes,3,7,3)}
 const gem=V.add(b,V.mul(d,.095)),color=spellId==='icebolt'?[.25,.73,.95]:spellId==='zap'?[.70,.67,1]:[.95,.38,.10],strength=cast?clamp(cast.t/cast.duration,0,1):0;
 m.ellipsoid(gem,[.09,.13,.09],cast?color:[.26,.35,.39],axes,cast?-1:4,8,5);
 for(const side of[-1,1]){const claw=V.add(gem,V.mul(axes[0],side*.11));m.rod(V.sub(b,V.mul(d,.1)),claw,.023,gold,7,6);m.rod(claw,V.add(gem,V.mul(d,.08)),.017,gold,7,6)}
 if(cast)for(let i=0;i<4;i++){const angle=t*3+i*Math.PI*.5,orb=V.add(gem,V.add(V.mul(axes[0],Math.cos(angle)*(.13+strength*.07)),V.mul(axes[1],Math.sin(angle)*(.13+strength*.07))));m.ellipsoid(orb,[.017,.017,.017],color,IDENT,-1.2,5,3)}
}
function playerView(m,g,t){
 const p=g.player,axes=yawAxes(p.yaw,p.pitch),eye=g.getEye(),local=(x,y,z)=>localPoint(eye,axes,[x,y,z]),w=g.activeWeapon||g.equipment.weapon;
 m.viewModel={weaponId:w?.id||null,weaponSet:g.weaponSetIndex||0,utility:g.selectedUtility,sheathed:!!p.sheathed,resting:!!p.resting,guard:g.getGuardKind?.()||null,rendered:null};
 if(p.sheathed||p.resting){m.viewModel.rendered='hands';if(p.resting){hand(m,eye,axes,local(.31,-.51,.58),1);hand(m,eye,axes,local(-.31,-.51,.58),-1)}return}
 if(g.selectedUtility!==null&&g.selectedUtility!==undefined){
  if(g.selectedUtility===0){m.viewModel.rendered='potion';const drinking=g.action?.kind==='heal'?Math.sin(clamp(g.action.t/g.action.duration,0,1)*Math.PI):0,c=local(.43-drinking*.18,-.34+drinking*.31,.76-drinking*.18);hand(m,eye,axes,V.add(c,V.mul(axes[1],-.06)));m.ellipsoid(c,[.085,.125,.085],[.32,.13,.12],axes,4,10,6);m.ellipsoid(V.add(c,V.mul(axes[1],-.025)),[.065,.073,.065],[.65,.10,.06],axes,-.35,9,5);const neck=V.add(c,V.mul(axes[1],.16));m.rod(V.add(c,V.mul(axes[1],.08)),neck,.033,[.48,.45,.33],4,8);m.rod(neck,V.add(neck,V.mul(axes[1],.047)),.039,leather,3,7);m.rod(V.add(c,V.mul(axes[0],-.067)),V.add(c,V.mul(axes[0],.067)),.012,gold,7,6)}
  else{m.viewModel.rendered='torch';const bottom=local(.44,-.53,.61),top=local(.39,.05,.91);hand(m,eye,axes,local(.42,-.28,.77));m.rod(bottom,top,.043,[.31,.19,.09],3,8);m.ellipsoid(top,[.075,.10,.075],[.20,.15,.11],axes,3,8,4);m.flame(V.add(top,[0,.025,0]),.42,.12,t,4);for(let i=0;i<4;i++){const a=i*Math.PI*.5;m.rod(V.add(top,[Math.cos(a)*.06,-.11,Math.sin(a)*.06]),V.add(top,[Math.cos(a)*.11,.08,Math.sin(a)*.11]),.015,iron,4,5)}}return;
 }
 if(!w)return;
 const guarding=p.guard&&g.getGuardKind?.()==='weapon';
 if(w.weaponKind==='bow'){
  m.viewModel.rendered='longbow';const draw=p.draw?clamp(p.draw.t/p.draw.duration,0,1):0,guardOffset=guarding?-.23:0,pt=(x,y,z)=>local(x+guardOffset,y+(guarding?.10:0),z),points=[pt(.30,.47,.77),pt(.43,.23,.96),pt(.48,-.13,1.0),pt(.43,-.49,.96),pt(.30,-.72,.77)],nock=pt(.31,-.13,.77-draw*.30);
  m.path(points,.032,[.47,.27,.11],3,9);m.rod(points[0],nock,.007,[.79,.73,.56]);m.rod(nock,points[4],.007,[.79,.73,.56]);hand(m,eye,axes,points[2],1);if(p.draw)hand(m,eye,axes,nock,-1);
  if(p.arrows>0){const tip=V.add(nock,V.mul(axes[2],.96));m.rod(nock,tip,.012,[.42,.29,.14],3,6);m.ellipsoid(tip,[.023,.023,.065],iron,axes,4,6,3);for(const side of[-1,1])m.tri(V.add(nock,V.mul(axes[0],side*.035)),V.add(nock,V.mul(axes[2],.14)),nock,[.59,.56,.45],6)}return;
 }
 if(w.weaponKind==='crossbow'){
  m.viewModel.rendered='crossbow';const lift=guarding?.17:0,pt=(x,y,z)=>local(x,y+lift,z),stockA=pt(.34,-.47,.37),stockB=pt(.34,-.15,1.10),center=pt(.34,-.12,.97),left=pt(-.10,-.10,.83),right=pt(.78,-.10,.83),nock=pt(.34,-.12,p.arrows>0?.61:.91);
  m.rod(stockA,stockB,.072,[.30,.19,.095],3,10,.045);m.path([left,pt(.07,-.11,1.0),center,pt(.61,-.11,1.0),right],.028,iron,4,8);m.rod(left,nock,.008,[.74,.70,.54]);m.rod(nock,right,.008,[.74,.70,.54]);m.rod(pt(.34,-.22,.58),pt(.34,-.39,.58),.035,leather,3,7);m.bevelBox(pt(.34,-.135,.83),[.09,.05,.37],iron,axes,4,.012);hand(m,eye,axes,pt(.34,-.32,.59),1);hand(m,eye,axes,pt(.23,-.23,.91),-1);if(p.arrows>0){m.rod(pt(.34,-.08,.62),pt(.34,-.08,1.24),.012,[.45,.31,.15],3,6);m.ellipsoid(pt(.34,-.08,1.26),[.025,.022,.06],iron,axes,4,6,3)}return;
 }
 const pose=guarding?{hilt:local(.06,-.48,.82),tip:local(.13,.47,.87),axes}:g.getBlade(p,p.attack);
 if(w.weaponKind==='staff'){m.viewModel.rendered='staff';staff(m,pose,p.cast,g.selectedSpellId,t);hand(m,eye,axes,pose.hilt,1);if(guarding||p.attack)hand(m,eye,axes,V.add(pose.hilt,V.mul(V.norm(V.sub(pose.tip,pose.hilt)),.25)),-1)}
 else{m.viewModel.rendered=w.profile;blade(m,pose,w.profile);hand(m,eye,axes,pose.hilt,1);if(w.hands===2)hand(m,eye,axes,V.sub(pose.hilt,V.mul(V.norm(V.sub(pose.tip,pose.hilt)),.13)),-1)}
 if(w.hands===1&&g.equipment.shield){const box=p.guard&&g.getGuardKind?.()==='shield'?g.shieldBox(p):{center:local(-.63,-.68,1.03),axes,half:[.26,.31,.065]};shield(m,box,false)}
}
function scene(g,{debug=false,particles=true,visualTime=g.time}={}){
 const m=new Mesh(),t=visualTime,p=g.player;
 for(const torch of g.map.torches){if(Math.hypot(torch.x-p.x,torch.z-p.z)>24)continue;m.flame([torch.x,torch.y-.04,torch.z],.53,.13,t,torch.phase);if(particles)for(let i=0;i<4;i++){const h=(t*.38+i*.27+torch.phase)%1;m.sphere([torch.x+Math.sin(t+i*3)*.09,torch.y+h*.8,torch.z+Math.cos(t*1.3+i)*.09],.009*(1-h)+.003,[1,.52,.08],-1)}}
 for(const c of g.containers){if(Math.hypot(c.x-p.x,c.z-p.z)>26)continue;if(c.corpse){if(c.items.length||c.gold){m.box([c.x,.18,c.z],[.35,.25,.30],leather);m.ring(c.x,.04,c.z,.46,[.45,.37,.16],-.3,0,Math.PI*2,.02)}continue}
  const satchel=c.name.includes('내려놓은');if(satchel){if(c.items.length){m.sphere([c.x,.22,c.z],.28,leather);m.box([c.x,.4,c.z],[.2,.07,.2],gold)}continue}
  m.bevelBox([c.x,.34,c.z],[.95,.62,.64],[.37,.22,.10],IDENT,3);for(const x of[-.36,.36])m.box([c.x+x,.36,c.z],[.09,.65,.69],c.rare?gold:iron,IDENT,4);
  const angle=c.searched?-.9:0,axes=[[1,0,0],[0,Math.cos(angle),Math.sin(angle)],[0,-Math.sin(angle),Math.cos(angle)]];m.bevelBox([c.x,c.searched?.87:.7,c.z+(c.searched?-.23:0)],[1,.14,.70],c.rare?[.43,.28,.10]:[.39,.25,.12],axes,3);m.box([c.x,.44,c.z+.34],[.17,.2,.065],gold,IDENT,4);
  for(const x of[-.36,.36])for(const y of[.13,.40,.58])m.ellipsoid([c.x+x,y,c.z+.355],[.024,.024,.018],gold,IDENT,7,6,4);
  if(c.searched&&c.items.length)m.sphere([c.x,.75,c.z],.08,[.46,.72,.85],-.8);
 }
 for(const e of g.enemies)enemyMesh(m,g,e);
 const exit=g.map.exit;
 if(Math.hypot(exit.x-p.x,exit.z-p.z)<30){
  m.box([exit.x,.05,exit.z],[2.5,.16,1.7],[.23,.27,.32],IDENT,2);for(let i=0;i<14;i++){const a=i/14*Math.PI,b=(i+1)/14*Math.PI;m.rod([exit.x+Math.cos(a)*1.03,1.4+Math.sin(a)*1.5,exit.z],[exit.x+Math.cos(b)*1.03,1.4+Math.sin(b)*1.5,exit.z],.15,[.28,.35,.41],1,6)}for(const x of[-1.03,1.03])m.box([exit.x+x,.77,exit.z],[.27,1.55,.30],[.30,.36,.42],IDENT,1);
  for(let j=0;j<3;j++){const r=.56+j*.12;for(let i=0;i<24;i++){const a=i/24*Math.PI*2+t*(j%2?1:-1)*.35,b=a+.18;m.rod([exit.x+Math.cos(a)*r,1.47+Math.sin(a)*r*1.7,exit.z+.025*j],[exit.x+Math.cos(b)*r,1.47+Math.sin(b)*r*1.7,exit.z+.025*j],.018+j*.008,[.10,.42+j*.1,.7+j*.08],-.8)}}m.ring(exit.x,.15,exit.z,1.1,[.16,.55,.80],-.8);
 }
 for(const bolt of g.projectiles){if(bolt.spellId==='icebolt'){const d=V.norm(bolt.vel);m.rod(V.sub(bolt.pos,V.mul(d,.42)),bolt.pos,.075,[.22,.64,.92],-.7,6,.012);m.ellipsoid(bolt.pos,[.085,.085,.13],[.57,.86,1],IDENT,-1.1,6,4);if(particles)for(let i=1;i<=4;i++)m.sphere(V.sub(bolt.pos,V.mul(d,i*.12)),.035-i*.005,[.28,.67,.86],-.8)}else if(bolt.magic){m.flame(V.sub(bolt.pos,[0,.12,0]),.42,.16,t,1);if(particles)for(let i=1;i<=6;i++)m.ellipsoid(V.sub(bolt.pos,V.mul(V.norm(bolt.vel),i*.1)),[.13-i*.016,.13-i*.016,.13-i*.016],[1,.42-i*.05,.02],IDENT,-1,6,4)}else{const d=V.norm(bolt.vel);m.rod(V.sub(bolt.pos,V.mul(d,.5)),bolt.pos,.017,[.53,.35,.16],3);m.sphere(bolt.pos,.035,iron,4)}}
 for(const fx of g.effects){if(fx.ring)m.ring(fx.pos[0],.13,fx.pos[2],(1-fx.life/.5)*4.5,fx.color,-1,0,Math.PI*2,.1);else {m.sphere(fx.pos,fx.life*.09,fx.color,-.6);if(particles)for(let i=0;i<7;i++){const a=i*2.4,d=(.5-fx.life)*1.2;m.rod(V.add(fx.pos,[Math.sin(a)*d,Math.cos(a)*d*.7,Math.sin(a*1.7)*d]),V.add(fx.pos,[Math.sin(a)*(d+.07),Math.cos(a)*(d+.07)*.7,Math.sin(a*1.7)*(d+.07)]),.007,fx.color,-1,4)}}}
 if(particles)for(let i=0;i<24;i++){const x=Math.floor(p.x/8)*8+Math.sin(i*17.31)*9,z=Math.floor(p.z/8)*8+Math.cos(i*7.19)*9,y=.35+((t*.05+i*.137)%1)*2.8;if(CryptCore.inside(g.map,x,z)&&Math.hypot(x-p.x,z-p.z)<10)m.ellipsoid([x+Math.sin(t*.18+i)*.15,y,z],[.005,.005,.005],[.24,.29,.31],IDENT,-.15,4,2)}
 m.worldCount=m.data.length/10;
 if(g.running&&!g.ended)playerView(m,g,t);
 if(debug){for(const e of g.enemies.filter(e=>e.hp>0))for(const b of g.bodies(e))m.ring(b.center[0],b.center[1],b.center[2],b.radius,[.15,.85,.65],-.9);if(p.attack){const pose=g.getBlade(p,p.attack);for(let i=0;i<=8;i++)m.sphere(V.mix(pose.hilt,pose.tip,i/8),.07,[.1,1,.6],-1)}}
 return m;
}
window.CryptScene={scene,blade,shield,staff,playerView,enemyMesh};
})();
