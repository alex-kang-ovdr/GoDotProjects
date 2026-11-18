/* Procedural Harbor District: original geometry, road graph and collision queries. */
'use strict';
class HarborWorld {
 constructor(renderer){this.r=renderer;this.boxes=[];this.surfaces=[];this.buildings=[];this.cover=[];this.signs=[];this.seed=9241;this.roads=GAME_DATA.roads;this.build();this.r.seal();}
 random(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
 box(p,s,c,solid=false,cover=false,r=[0,0,0]){this.r.box(p,s,c,r,null,true);if(!solid&&s[0]>5&&s[2]>5&&s[1]<=.35&&p[1]+s[1]/2>=0&&p[1]+s[1]/2<=.4)this.surfaces.push({min:p.map((v,i)=>v-s[i]/2),max:p.map((v,i)=>v+s[i]/2)});if(solid){const b={min:p.map((v,i)=>v-s[i]/2),max:p.map((v,i)=>v+s[i]/2),cover,id:this.boxes.length};this.boxes.push(b);if(cover)this.cover.push(b);}return p;}
 build(){const R=this.r;
  this.box([0,-1.35,0],[1600,.3,1600],0x377b89);this.box([0,-2.2,0],[360,4.2,360],0x9ca49b);this.box([0,-.14,0],[359,.25,359],0xa6aaa1);
  for(const x of this.roads){this.box([x,.005,0],[15,.025,355],0x3b4851);this.box([0,.006,x],[355,.026,15],0x3b4851);for(let z=-174;z<=174;z+=9){if(!this.roads.some(v=>Math.abs(v-z)<10)){this.box([x,.035,z],[.15,.025,4.5],0xe9cc8f);this.box([z,.036,x],[4.5,.025,.15],0xe9cc8f);}}}
  for(const x of this.roads)for(const z of this.roads){for(let k=-4;k<=4;k++){this.box([x+k*1.1,.045,z+10.4],[.62,.02,2.2],0xd4d9ce);this.box([x+10.4,.046,z+k*1.1],[2.2,.02,.62],0xd4d9ce);}if(Math.abs(x)<100&&Math.abs(z)<100){this.pole(x+9,z+9,true);}}
  for(let i=0;i<4;i++)for(let j=0;j<4;j++){let cx=-108+i*72,cz=-108+j*72;this.box([cx,.06,cz],[57,.14,57],0xbcc0b5);
   if(i===0&&j===3){this.garage();continue;}if(i===3&&j===0){this.harbor();continue;}
   if(i===1&&j===2){this.park(cx,cz);continue;}
   const palette=[0xd8c3a7,0xaabbb6,0xc0bab3,0xcad1c7,0x97b4ba,0xc1b5a8];
   for(let a=-1;a<=1;a+=2)for(let b=-1;b<=1;b+=2){const x=cx+a*14.8,z=cz+b*14.8,w=19+this.random()*3,d=20+this.random()*3,h=8+Math.floor(this.random()*6)*4;this.building(x,z,w,d,h,palette[Math.floor(this.random()*palette.length)]);}
   if((i+j)%2===0){this.palm(cx-27,cz-25);this.palm(cx+26,cz+25);}else{this.tree(cx+26,cz-25);this.tree(cx-26,cz+25);}
  }
  for(let t=-144;t<=144;t+=36){this.pole(t+12,158);this.pole(-158,t+12);if(t%72===0){this.palm(t,-161);this.palm(162,t);}}
  for(let i=0;i<9;i++){const x=-155+i*38;this.box([x,.35,-176],[2,.7,1.4],0xd4cbb3);this.box([x+13,.35,-176],[2,.7,1.4],0xd4cbb3);this.box([x+7,1.1,-176],[15,.12,.12],0x788a86);}
  this.crane(149,-168);this.crane(115,-168);
  for(let i=0;i<12;i++){const x=-270+i*47,z=-270-this.random()*60,h=15+this.random()*65;this.box([x,h/2,z],[20+this.random()*15,h,24],0x99b3b6);}
  // Parking, bollards and low cover. Nonintersecting road geometry stays simple.
  for(const [x,z]of[[-56,63],[56,81],[62,-54],[-82,-56],[-9,82],[83,10]]){this.box([x,.6,z],[4.5,1.2,1.05],0xc4c6ba,true,true);for(let k=-1;k<=1;k++)this.box([x+k*1.25,.78,z-.53],[.55,.25,.02],0xeac45f);}
  this.signs.push({pos:[-108,8.8,115],text:'HARBOR AUTO / 차고',type:'garage'},{pos:[108,10,-80],text:'DOCK 04 / 항만',type:'dock'});
 }
 building(x,z,w,d,h,c){this.box([x,h/2,z],[w,h,d],c,true);this.buildings.push({x,z,w,d,h,c});this.box([x,1.45,z],[w+.25,2.9,d+.25],0x7e9394);this.box([x,h+.25,z],[w+.65,.5,d+.65],0xd3d4c7);
  for(let y=4;y<h-1;y+=3.6){for(let k=-1;k<=1;k++){this.box([x+k*w*.27,y,z-d/2-.026],[w*.17,1.7,.06],0x486d7b);this.box([x+k*w*.27,y,z+d/2+.026],[w*.17,1.7,.06],0x4c7786);this.box([x-w/2-.026,y,z+k*d*.27],[.06,1.7,d*.17],0x527787);this.box([x+w/2+.026,y,z+k*d*.27],[.06,1.7,d*.17],0x446675);}}
  this.box([x,1.4,z+d/2+.15],[w*.65,1.7,.12],0x314d5b);this.box([x,3,z+d/2+.5],[w*.9,.24,1.1],0xb17e62);this.box([x+2,h+1,z-1],[3,1.5,2.8],0x8a9894);this.box([x-4,h+.9,z+3],[2,1.2,2],0x7e8b8c);
 }
 garage(){this.box([-108,.12,104],[52,.2,53],0x687b7c);this.box([-108,4,127],[45,8,19],0xb4c0b6,true);this.buildings.push({x:-108,z:127,w:45,d:19,h:8,c:0xb4c0b6});this.box([-108,6.5,116.9],[45,1,1.3],0x2a555a);for(const x of[-122,-108,-94]){this.box([x,2.5,117.35],[10,4.8,.2],0x647c7d);for(let y=1;y<4.8;y+=.55)this.box([x,y,117.2],[9.6,.045,.04],0xa1b6af);this.box([x,5.35,117],[10,.18,.12],0xd6ed91);}
  for(const x of[-116,-100])this.box([x,.15,103],[.15,.03,16],0xe6e8b5);this.box([-108,.15,111],[16,.03,.18],0xe6e8b5);this.box([-108,.15,95],[16,.03,.18],0xe6e8b5);
  this.box([-126,.7,97],[1.5,1.4,1],0xd78954,true,true);this.box([-126,1.48,97],[1.65,.18,1.1],0xf0e4be);this.palm(-133,113);this.pole(-83,89);
  for(let i=0;i<3;i++){let x=-121-i*4;this.box([x,.5,81.5],[.2,1,.2],0x7b8479);this.box([x,1.45,81.5],[1.05,1.1,.2],0xd5c392,true);this.box([x,1.45,81.36],[.53,.53,.03],0xca6650);this.box([x,1.45,81.33],[.21,.21,.03],0xe4dbc4);}
 }
 harbor(){this.box([108,.16,-108],[57,.2,57],0x8d9b99);this.box([123,4.5,-88],[30,9,18],0x879d9b,true);this.buildings.push({x:123,z:-88,w:30,d:18,h:9,c:0x879d9b});this.box([123,9.15,-88],[31,.4,19],0xb7bcae);for(let k=0;k<8;k++)this.box([109+k*4,4.3,-97.1],[.14,8,.13],0xb0bdb4);
  this.container(84,-116,0xa46549);this.container(84,-129,0xc89748);this.container(127,-129,0x457f83);this.container(127,-116,0x638881);this.box([96,.7,-105],[4,1.4,1.25],0xc6c9ba,true,true);this.box([111,.65,-134],[4.3,1.3,1.3],0xc6c9ba,true,true);this.box([99,.6,-127],[1.4,1.2,1.4],0xb79562,true,true);
  this.pole(101,-140);this.pole(140,-103);for(let i=0;i<5;i++)this.box([95+i*3,.29,-139],[1.5,.02,.45],0xe6cd89);
 }
 container(x,z,c){this.box([x,1.5,z],[4.7,3,10.5],c,true);for(let k=-4;k<=4;k++)this.box([x+2.39,1.5,z+k],[.1,2.8,.16],c);this.box([x,3.1,z],[4.9,.18,10.7],c);}
 park(x,z){this.box([x,.14,z],[53,.18,53],0x7d9c75);this.box([x,.25,z],[7,.15,53],0xc4c2ad);this.box([x,.26,z],[53,.16,7],0xc4c2ad);for(const a of[-17,17])for(const b of[-17,17])this.tree(x+a,z+b);this.box([x,1,z],[8,2,8],0xa6b6ab,true,true);this.box([x,2.05,z],[7,.2,7],0x77a6aa);for(const a of[-9,9]){this.box([x+a,.65,z+7],[3.6,.35,1.2],0x947455,true,true);this.box([x+a,1.1,z+7.6],[3.6,.8,.15],0x947455);}}
 tree(x,z){const r=this.r;r.cylinder([x,2,z],[.6,4,.6],0x76674e,[0,0,0],null,true);r.sphere([x,4.8,z],[5.3,5.2,5.3],0x60947a,[0,this.random(),0],null,true);r.sphere([x+1.2,5.6,z],[3.8,3.5,3.8],0x7eab83,[0,0,0],null,true);}
 palm(x,z){const r=this.r;r.cylinder([x,3,z],[.42,6,.42],0xa59171,[0,0,.04],null,true);for(let i=0;i<6;i++){let a=i*Math.PI/3;const m=HM.compose([x,6,z],[0,a,0]);r.box([0,-.3,1.7],[.65,.14,4.4],0x588f76,[.3,0,0],m,true);r.box([0,-1.1,3],[.48,.1,2.1],0x4e826b,[.6,0,0],m,true);}r.sphere([x,6,z],[1.3,1,1.3],0x598371,[0,0,0],null,true);}
 pole(x,z,signal=false){this.box([x,3.2,z],[.16,6.4,.16],0x667b7d);this.box([x-1.1,6.35,z],[2.3,.18,.18],0x667b7d);this.box([x-2,6.23,z],[.9,.12,.5],0xd7debd);if(signal){this.box([x,4.7,z-.23],[.5,1.2,.45],0x233c43);this.box([x,4.9,z-.47],[.22,.24,.05],0xe5af75);}}
 crane(x,z){this.box([x,7,z],[.7,14,.7],0xc7ac70);this.box([x+7,7,z],[.7,14,.7],0xc7ac70);this.box([x+3.5,14,z],[8.5,.8,1.2],0xc7ac70);this.box([x+3.5,15,z-8],[.8,1,24],0xb8a175);this.box([x+3.5,10,z-18],[.07,10,.07],0x3e6267);this.box([x+3.5,5,z-18],[2,.45,1],0x687975);}
 // Highest support below the supplied ceiling; includes visible pavement, not decals.
 supportHeight(x,z,ceiling=0.35){let y=0;for(const b of [...this.surfaces,...this.boxes])if(b.max[1]<=ceiling+.001&&x>=b.min[0]&&x<=b.max[0]&&z>=b.min[2]&&z<=b.max[2])y=Math.max(y,b.max[1]);return y;}
 ray(origin,dir,max=500,inflate=0){let nearest=max,found=null;for(const b of this.boxes){const t=HarborLogic.rayBox(origin,dir,b,nearest,inflate);if(t!==null&&t<nearest){nearest=t;found=b;}}// ground
  if(dir[1]<-1e-6){const t=-origin[1]/dir[1];if(t>=0&&t<nearest){nearest=t;found={ground:true};}}
  return found?{distance:nearest,box:found,point:HM.add(origin,HM.mul(dir,nearest))}:null;
 }
 los(a,b){const d=HM.sub(b,a),l=HM.len(d);if(l<.01)return true;const hit=this.ray(a,HM.mul(d,1/l),l);return !hit||hit.distance>l-.12;}
 clear(x,z,r=.35,y=0,h=1.7){if(Math.abs(x)>178-r||Math.abs(z)>178-r)return false;for(const b of this.boxes){if(y+h<=b.min[1]+.03||y>=b.max[1]-.03)continue;const px=HM.clamp(x,b.min[0],b.max[0]),pz=HM.clamp(z,b.min[2],b.max[2]);if(Math.hypot(x-px,z-pz)<r)return false;}return true;}
 move(pos,dx,dz,r=.35,h=1.7){let x=HM.clamp(pos[0]+dx,-178+r,178-r),z=HM.clamp(pos[2]+dz,-178+r,178-r),hit=false;
  for(let iter=0;iter<3;iter++)for(const b of this.boxes){if(pos[1]+h<=b.min[1]+.02||pos[1]>=b.max[1]-.03)continue;const px=HM.clamp(x,b.min[0],b.max[0]),pz=HM.clamp(z,b.min[2],b.max[2]),vx=x-px,vz=z-pz,d=Math.hypot(vx,vz);if(d>=r)continue;hit=true;if(d>.0001){x+=vx/d*(r-d+.001);z+=vz/d*(r-d+.001);}else{const edges=[{d:Math.abs(x-b.min[0]),x:b.min[0]-r,z},{d:Math.abs(x-b.max[0]),x:b.max[0]+r,z},{d:Math.abs(z-b.min[2]),x,z:b.min[2]-r},{d:Math.abs(z-b.max[2]),x,z:b.max[2]+r}].sort((a,b)=>a.d-b.d);x=edges[0].x;z=edges[0].z;}}pos[0]=x;pos[2]=z;return hit;
 }
 characterSupport(x,z,ceiling,r=.35){let y=this.supportHeight(x,z,ceiling);for(const [dx,dz]of [[r*.92,0],[-r*.92,0],[0,r*.92],[0,-r*.92]])y=Math.max(y,this.supportHeight(x+dx,z+dz,ceiling));return y;}
 moveCharacter(pos,dx,dz,r=.35,h=1.9,maxStep=.28){const before=pos.slice(),hit=this.move(pos,dx,dz,r,h);if(!hit||maxStep<=0)return hit;
  const requested=Math.hypot(dx,dz),progress=Math.hypot(pos[0]-before[0],pos[2]-before[2]);if(requested<1e-6||progress>=requested*.98)return hit;
  const raised=[before[0],before[1]+maxStep+.008,before[2]];this.move(raised,dx,dz,r,h);
  if(Math.hypot(raised[0]-before[0],raised[2]-before[2])<requested*.95||!this.clear(raised[0],raised[2],r,raised[1],h))return hit;
  // Leading edge support is required: cannot levitate across an empty gap.
  const fx=dx/requested,fz=dz/requested,floor=this.supportHeight(raised[0]+fx*r*.92,raised[2]+fz*r*.92,raised[1]);
  if(floor<=before[1]+.025||floor>before[1]+maxStep+.01||!this.clear(raised[0],raised[2],r,floor+.025,h))return hit;
  pos[0]=raised[0];pos[1]=floor;pos[2]=raised[2];return true;
 }
 findCover(pos){let best=null,bestDist=2.5;for(const b of this.cover){const x=HM.clamp(pos[0],b.min[0],b.max[0]),z=HM.clamp(pos[2],b.min[2],b.max[2]),dx=pos[0]-x,dz=pos[2]-z,dist=Math.hypot(dx,dz);if(dist<bestDist&&dist>.01){bestDist=dist;best={box:b,normal:[dx/dist,0,dz/dist],anchor:[x+dx/dist*.48,0,z+dz/dist*.48]};}}return best;}
 roadPath(a,b){const roads=this.roads,nearest=p=>roads.reduce((v,n)=>Math.abs(n-p)<Math.abs(v-p)?n:v,roads[0]);const ax=nearest(a[0]),az=nearest(a[2]),bx=nearest(b[0]),bz=nearest(b[2]);let pts=[],x=ax,z=az;
  if(Math.abs(a[0]-ax)<Math.abs(a[2]-az)){pts.push([ax,0,a[2]]);pts.push([ax,0,az]);}else{pts.push([a[0],0,az]);pts.push([ax,0,az]);}
  while(x!==bx){x+=Math.sign(bx-x)*72;pts.push([x,0,z]);}while(z!==bz){z+=Math.sign(bz-z)*72;pts.push([x,0,z]);}
  if(Math.abs(b[0]-bx)<Math.abs(b[2]-bz))pts.push([bx,0,b[2]]);else pts.push([b[0],0,bz]);return pts;
 }
 // Coarse A* is only recomputed on intent changes; local collision handles detail.
 path(a,b){const step=4,N=89,toCell=p=>[HM.clamp(Math.round((p[0]+176)/step),0,N-1),HM.clamp(Math.round((p[2]+176)/step),0,N-1)],pos=(x,z)=>[x*step-176,0,z*step-176];const s=toCell(a),t=toCell(b);const key=(x,z)=>z*N+x;const start=key(...s);let open=[{x:s[0],z:s[1],g:0,f:0,k:start}],seen=new Map([[start,{g:0,prev:-1}]]),end=null,iterations=0;
  while(open.length&&iterations++<1600){let bi=0;for(let i=1;i<open.length;i++)if(open[i].f<open[bi].f)bi=i;const cur=open.splice(bi,1)[0];if(Math.abs(cur.x-t[0])+Math.abs(cur.z-t[1])<=1){end=cur.k;break;}for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const x=cur.x+dx,z=cur.z+dz;if(x<0||z<0||x>=N||z>=N)continue;const p=pos(x,z);if(!this.clear(p[0],p[2],.45))continue;const k=key(x,z),g=cur.g+1;if(seen.has(k)&&seen.get(k).g<=g)continue;seen.set(k,{g,prev:cur.k});open.push({x,z,g,f:g+Math.abs(x-t[0])+Math.abs(z-t[1]),k});}}
  if(end===null)return[];const out=[];let k=end;while(k!==start&&k!==-1){out.push(pos(k%N,Math.floor(k/N)));k=seen.get(k).prev;}return out.reverse();
 }
}
window.HarborWorld=HarborWorld;
