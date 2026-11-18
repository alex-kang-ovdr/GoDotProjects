/* Crypt of the Fallen v13 — pure simulation helpers; also usable in Node tests. */
(function(root){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), lerp=(a,b,t)=>a+(b-a)*t;
const V={add:(a,b)=>a.map((v,i)=>v+b[i]),sub:(a,b)=>a.map((v,i)=>v-b[i]),mul:(a,s)=>a.map(v=>v*s),dot:(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],len:a=>Math.hypot(...a),norm:a=>{let l=Math.hypot(...a)||1;return a.map(v=>v/l)},mix:(a,b,t)=>a.map((v,i)=>lerp(v,b[i],t))};
function hashSeed(value){let h=2166136261;for(const c of String(value))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0}
function rng(seed){let a=typeof seed==='number'?seed:hashSeed(seed);return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
function yawAxes(yaw,pitch=0){const f=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch)],r=[Math.cos(yaw),0,Math.sin(yaw)],u=V.cross(r,f);return[r,u,f]}
function localPoint(o,axes,p){return o.map((v,i)=>v+axes[0][i]*p[0]+axes[1][i]*p[1]+axes[2][i]*p[2])}
function segmentSphere(a,b,c,r){const d=V.sub(b,a),m=V.sub(a,c),aa=V.dot(d,d),cc=V.dot(m,m)-r*r;if(cc<=0)return 0;if(aa<1e-10)return null;const bb=V.dot(m,d),disc=bb*bb-aa*cc;if(disc<0)return null;const t=(-bb-Math.sqrt(disc))/aa;return t>=0&&t<=1?t:null}
function segmentAABB(a,b,min,max){let lo=0,hi=1;for(let i=0;i<3;i++){let d=b[i]-a[i];if(Math.abs(d)<1e-9){if(a[i]<min[i]||a[i]>max[i])return null;continue}let x=(min[i]-a[i])/d,y=(max[i]-a[i])/d;if(x>y)[x,y]=[y,x];lo=Math.max(lo,x);hi=Math.min(hi,y);if(lo>hi)return null}return lo}
function segmentOBB(a,b,box,radius=0){const toLocal=p=>box.axes.map(ax=>V.dot(V.sub(p,box.center),ax)),half=box.half.map(x=>x+radius);return segmentAABB(toLocal(a),toLocal(b),half.map(v=>-v),half)}
function mul4(a,b){const r=new Float32Array(16);for(let c=0;c<4;c++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)r[c*4+row]+=a[k*4+row]*b[c*4+k];return r}
function perspective(fov,aspect,near=.035,far=70){const t=1/Math.tan(fov/2),m=new Float32Array(16);m[0]=t/aspect;m[5]=t;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=2*far*near/(near-far);return m}
function viewMatrix(eye,yaw,pitch){const [x,y,f]=yawAxes(yaw,pitch),z=V.mul(f,-1);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-V.dot(x,eye),-V.dot(y,eye),-V.dot(z,eye),1])}

const TILE=2,N=31,CEILING=3.8;
function generateDungeon(seed='CRYPT-13',training=false){
 const random=rng(seed),ri=(a,b)=>a+Math.floor(random()*(b-a+1));
 const grid=Array.from({length:N},()=>Array(N).fill(1)),rooms=[];
 const carve=(x,z,w,h)=>{const r={x,z,w,h,cx:x+Math.floor(w/2),cz:z+Math.floor(h/2)};rooms.push(r);for(let j=z;j<z+h;j++)for(let i=x;i<x+w;i++)grid[j][i]=0;return r};
 if(training){carve(9,9,12,12)}else{
  carve(2,21,5,6);
  for(let k=0;k<150&&rooms.length<9;k++){const w=ri(4,6),h=ri(4,6),x=ri(1,N-w-2),z=ri(1,N-h-2);if(!rooms.some(r=>x<r.x+r.w+1&&x+w+1>r.x&&z<r.z+r.h+1&&z+h+1>r.z))carve(x,z,w,h)}
  for(let i=1;i<rooms.length;i++){const a=rooms[i-1],b=rooms[i];let x=a.cx,z=a.cz;const horiz=()=>{while(x!==b.cx){grid[z][x]=0;x+=Math.sign(b.cx-x)}grid[z][x]=0},vert=()=>{while(z!==b.cz){grid[z][x]=0;z+=Math.sign(b.cz-z)}grid[z][x]=0};if(random()<.5){horiz();vert()}else{vert();horiz()}}
  // A few cross-links produce alternatives without adding unreachable modules.
  if(rooms.length>3){let a=rooms[0],b=rooms[2];for(let x=Math.min(a.cx,b.cx);x<=Math.max(a.cx,b.cx);x++)grid[a.cz][x]=0;for(let z=Math.min(a.cz,b.cz);z<=Math.max(a.cz,b.cz);z++)grid[z][b.cx]=0}
 }
 const start=rooms[0],spawn={x:(start.cx+.5)*TILE,z:(start.cz+.5)*TILE};
 const distances=distanceField(grid,start.cx,start.cz),last=rooms.reduce((a,b)=>(distances[b.cz*N+b.cx]||0)>(distances[a.cz*N+a.cx]||0)?b:a,start);
 const exit={x:(last.cx+1.5)*TILE,z:(last.cz+.5)*TILE};if(training){exit.x=39;exit.z=21}
 const torches=[];
 for(let z=1;z<N-1;z++)for(let x=1;x<N-1;x++){if(grid[z][x]!==0||(x*11+z*7)%7!==0)continue;const edge=[[0,-1],[1,0],[0,1],[-1,0]].find(([dx,dz])=>grid[z+dz][x+dx]===1);if(edge)torches.push({x:(x+.5)*TILE+edge[0]*.85,z:(z+.5)*TILE+edge[1]*.85,y:2.15,phase:random()*6})}
 // Ensure a lit entrance and supply chest, independent of random decoration.
 torches.push({x:(start.x+.15)*TILE,z:(start.cz+.5)*TILE,y:2.15,phase:0});
 return{seed:String(seed),grid,rooms,spawn,exit,torches,bossRoom:last,training};
}
function distanceField(grid,x,z){const out=new Int32Array(N*N).fill(-1),q=[z*N+x];out[q[0]]=0;for(let i=0;i<q.length;i++){const k=q[i],cx=k%N,cz=Math.floor(k/N);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,nz=cz+dz,nk=nz*N+nx;if(nx<0||nz<0||nx>=N||nz>=N||grid[nz][nx]||out[nk]>=0)continue;out[nk]=out[k]+1;q.push(nk)}}return out}
function inside(map,x,z){return map.grid[Math.floor(z/TILE)]?.[Math.floor(x/TILE)]===0}
function free(map,x,z,r=.26){return [[-r,-r],[r,-r],[-r,r],[r,r]].every(([a,b])=>inside(map,x+a,z+b))}
function wallHit(map,a,b,r=.02){
 let best=null;const x0=clamp(Math.floor((Math.min(a[0],b[0])-r)/TILE),0,N-1),x1=clamp(Math.floor((Math.max(a[0],b[0])+r)/TILE),0,N-1),z0=clamp(Math.floor((Math.min(a[2],b[2])-r)/TILE),0,N-1),z1=clamp(Math.floor((Math.max(a[2],b[2])+r)/TILE),0,N-1);
 for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++)if(map.grid[z][x]){const t=segmentAABB(a,b,[x*TILE-r,-1,z*TILE-r],[(x+1)*TILE+r,CEILING+1,(z+1)*TILE+r]);if(t!==null&&(best===null||t<best))best=t}
 for(const h of [r,CEILING-r])if((a[1]-h)*(b[1]-h)<0){let t=(h-a[1])/(b[1]-a[1]);if(best===null||t<best)best=t}
 return best;
}
function lineClear(map,ax,az,bx,bz,r=0){return wallHit(map,[ax,1.2,az],[bx,1.2,bz],r)===null}
function findPath(map,ax,az,bx,bz){
 const sx=Math.floor(ax/TILE),sz=Math.floor(az/TILE),tx=Math.floor(bx/TILE),tz=Math.floor(bz/TILE);if(!inside(map,ax,az)||!inside(map,bx,bz))return[];
 const start=sz*N+sx,goal=tz*N+tx;if(start===goal)return[[bx,bz]];
 const open=[start],cost=new Map([[start,0]]),from=new Map(),closed=new Set();
 while(open.length){let bi=0,bv=Infinity;for(let i=0;i<open.length;i++){const k=open[i],v=cost.get(k)+Math.abs(k%N-tx)+Math.abs(Math.floor(k/N)-tz);if(v<bv){bv=v;bi=i}}const cur=open.splice(bi,1)[0];if(cur===goal){const path=[];let k=cur;while(k!==start){path.push([(k%N+.5)*TILE,(Math.floor(k/N)+.5)*TILE]);k=from.get(k)}return path.reverse()}closed.add(cur);const x=cur%N,z=Math.floor(cur/N);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,k=nz*N+nx;if(nx<0||nz<0||nx>=N||nz>=N||map.grid[nz][nx]||closed.has(k))continue;const n=cost.get(cur)+1;if(n<(cost.get(k)??Infinity)){cost.set(k,n);from.set(k,cur);if(!open.includes(k))open.push(k)}}}return[];
}

const ITEMS={
 rustSword:{name:'낡은 장검',type:'weapon',profile:'sword',w:1,h:3,damage:28,value:0,rarity:0,icon:'sword'},
 steelSword:{name:'성채의 장검',type:'weapon',profile:'sword',w:1,h:3,damage:36,value:85,rarity:2,icon:'sword'},
 dagger:{name:'도굴꾼의 단검',type:'weapon',profile:'dagger',w:1,h:2,damage:20,value:48,rarity:1,icon:'dagger'},
 axe:{name:'파수꾼의 전투도끼',type:'weapon',profile:'axe',w:2,h:3,damage:52,value:110,rarity:2,icon:'axe'},
 cloth:{name:'여행자의 외투',type:'armor',w:2,h:2,armor:0,value:0,rarity:0,icon:'armor'},
 leather:{name:'강화 가죽갑옷',type:'armor',w:2,h:2,armor:10,value:55,rarity:1,icon:'armor'},
 plate:{name:'기사의 흉갑',type:'armor',w:2,h:3,armor:22,value:100,rarity:2,icon:'armor'},
 amulet:{name:'잿불의 부적',type:'trinket',w:1,h:1,value:75,rarity:2,icon:'gem'},
 gem:{name:'깊은 밤의 사파이어',type:'treasure',w:1,h:1,value:65,rarity:2,icon:'gem'},
 relic:{name:'봉인된 고대 유물',type:'treasure',w:2,h:1,value:90,rarity:2,icon:'relic'},
 crown:{name:'몰락한 군주의 왕관',type:'treasure',w:2,h:2,value:350,rarity:3,icon:'crown'},
 silver:{name:'은으로 만든 성배',type:'treasure',w:1,h:2,value:38,rarity:1,icon:'chalice'},
 potion:{name:'치유 물약',type:'consumable',w:1,h:1,value:15,rarity:0,icon:'potion'},
 arrows:{name:'화살 묶음 ×8',type:'consumable',w:1,h:2,value:12,rarity:0,icon:'arrow'}
};
// v15 item identities: source weapon membership; UI economy values are prototype.
const allClasses=['fighter','ranger','wizard'];
Object.assign(ITEMS,{
 armingSword:{name:'아밍 소드',type:'weapon',profile:'sword',weaponKind:'melee',hands:1,w:1,h:3,damage:27,value:50,rarity:0,icon:'sword',moveSpeed:-20,blockResistance:3,allowedClasses:['fighter','ranger']},
 rondelDagger:{name:'론델 대거',type:'weapon',profile:'dagger',weaponKind:'melee',hands:1,w:1,h:2,damage:15,value:35,rarity:0,icon:'dagger',moveSpeed:-10,blockResistance:3,allowedClasses:['wizard']},
 battleAxe:{name:'배틀 액스',type:'weapon',profile:'axe',weaponKind:'melee',hands:2,w:2,h:3,damage:35,value:80,rarity:0,icon:'axe',moveSpeed:-45,blockResistance:4,allowedClasses:['fighter']},
 longbow:{name:'롱보우',type:'weapon',profile:'sword',weaponKind:'bow',hands:2,w:2,h:4,damage:26,value:70,rarity:0,icon:'bow',moveSpeed:-50,blockResistance:3,quiver:5,drawTime:1.2,reloadTime:2.5,allowedClasses:['ranger']},
 crossbow:{name:'크로스보우',type:'weapon',profile:'sword',weaponKind:'crossbow',hands:2,w:2,h:3,damage:29,value:70,rarity:0,icon:'bow',moveSpeed:-50,blockResistance:4,quiver:1,reloadTime:3.2,allowedClasses:allClasses},
 magicStaff:{name:'마법 지팡이',type:'weapon',profile:'staff',weaponKind:'staff',hands:2,w:1,h:4,damage:15,value:45,rarity:0,icon:'flame',moveSpeed:-20,blockResistance:3,allowedClasses:['wizard']},
 roundShield:{name:'라운드 실드',type:'shield',w:2,h:2,value:30,rarity:0,icon:'shield',moveSpeed:-15,blockResistance:4,allowedClasses:['fighter']}
});
Object.assign(ITEMS.rustSword,ITEMS.armingSword,{id:'rustSword',name:'아밍 소드',value:0});
Object.assign(ITEMS.steelSword,ITEMS.armingSword,{id:'steelSword',name:'강철 아밍 소드',damage:33,value:85,rarity:2});
Object.assign(ITEMS.dagger,ITEMS.rondelDagger,{id:'dagger',name:'론델 대거',damage:18,value:48,rarity:1});
Object.assign(ITEMS.axe,ITEMS.battleAxe,{id:'axe',name:'배틀 액스',damage:42,value:110,rarity:2});
ITEMS.cloth.allowedClasses=allClasses;ITEMS.cloth.moveSpeed=0;
ITEMS.leather.allowedClasses=['fighter','ranger'];ITEMS.leather.moveSpeed=-8;
ITEMS.plate.allowedClasses=['fighter'];ITEMS.plate.moveSpeed=-20;
ITEMS.amulet.allowedClasses=allClasses;
let itemSerial=0;
function makeItem(id){if(!Object.prototype.hasOwnProperty.call(ITEMS,id))throw Error('Unknown item '+id);const serial=++itemSerial;return{...ITEMS[id],id,uid:'i'+serial,instanceId:'item-'+Date.now().toString(36)+'-'+serial+'-'+Math.random().toString(36).slice(2,8),state:'Looted',supplied:false,rotated:false,x:-1,y:-1}}
function hydrateItem(raw){if(!raw||!Object.prototype.hasOwnProperty.call(ITEMS,raw.id))return null;const it=makeItem(raw.id);if(typeof raw.instanceId==='string'&&raw.instanceId.length<160)it.instanceId=raw.instanceId;it.supplied=!!raw.supplied||raw.state==='Supplied';it.state=it.supplied?'Supplied':raw.state==='Handled'?'Handled':'Looted';it.rotated=!!raw.rotated;if(it.supplied)it.value=0;return it}
function canEquipItem(item,classId,slot){if(!item||!Object.prototype.hasOwnProperty.call(ITEMS,item.id))return false;const data=ITEMS[item.id];if(data.allowedClasses&&!data.allowedClasses.includes(classId))return false;if(slot==='weapon'||slot==='secondary')return data.type==='weapon';if(slot)return data.type===slot;return ['weapon','shield','armor','trinket'].includes(data.type)}
function sizeOf(item,rotated=item.rotated){return rotated?[item.h,item.w]:[item.w,item.h]}
class Inventory{
 constructor(w=6,h=4){this.w=w;this.h=h;this.items=[]}
 fits(item,x,y,rotated=item.rotated,ignoreUid=item.uid){const[w,h]=sizeOf(item,rotated);if(x<0||y<0||x+w>this.w||y+h>this.h)return false;return !this.items.some(o=>{if(o.uid===ignoreUid)return false;const[ow,oh]=sizeOf(o);return x<o.x+ow&&x+w>o.x&&y<o.y+oh&&y+h>o.y})}
 place(item,x,y,rotated=item.rotated){if(!this.fits(item,x,y,rotated))return false;Object.assign(item,{x,y,rotated});if(!this.items.some(o=>o.uid===item.uid))this.items.push(item);return true}
 add(item){for(const rot of [item.rotated,!item.rotated])for(let y=0;y<this.h;y++)for(let x=0;x<this.w;x++)if(this.place(item,x,y,rot))return true;return false}
 remove(uid){let i=this.items.findIndex(o=>o.uid===uid);return i<0?null:this.items.splice(i,1)[0]}
 get(uid){return this.items.find(o=>o.uid===uid)}
 rotate(uid){let it=this.get(uid);return !!it&&this.place(it,it.x,it.y,!it.rotated)}
 equip(uid,equipment){const item=this.get(uid);if(!item||!['weapon','armor','trinket'].includes(item.type))return false;const previous=equipment[item.type],saved=this.items.map(o=>({...o}));this.remove(uid);if(previous&&!this.add(previous)){this.items=saved;return false}equipment[item.type]=item;return true}
 validate(){const ids=new Set();for(const it of this.items){if(ids.has(it.uid)||!this.fits(it,it.x,it.y))return false;ids.add(it.uid)}return true}
 used(){return this.items.reduce((n,it)=>n+it.w*it.h,0)}
 value(){return this.items.reduce((n,it)=>n+it.value,0)}
}
const PROFILES={
 staff:{name:'마법 지팡이',windup:.5,active:.25,recovery:.7,length:1.25,cost:0,reach:1.8},
 sword:{name:'아밍 소드',windup:.24,active:.28,recovery:.32,length:1.12,cost:11,reach:1.8},
 dagger:{name:'단검',windup:.12,active:.18,recovery:.22,length:.63,cost:7,reach:1.35},
 axe:{name:'전투도끼',windup:.43,active:.32,recovery:.49,length:1.28,cost:20,reach:2.05}
};
// Both rendering and collision use these same blade endpoints, in camera-local space.
function bladePose(profile,index,phase,t){
 const p=PROFILES[profile]||PROFILES.sword,side=index%2===0?1:-1;
 let h=[.38,-.36,.50],tip=[.45,.48,1.14];
 if(profile==='dagger'||profile==='sword'&&index%3===2){
  const u=phase==='windup'?-Math.sin(t*Math.PI/2)*.18:phase==='active'?Math.sin(t*Math.PI)*.70:0;
  h=[.30,-.30,.48+u];tip=[.16,-.16,1.10+u];
 }else if(index%3===2||profile==='axe'){
  const a=phase==='windup'?lerp(.2,1.45,t):phase==='active'?lerp(1.45,-.80,t):lerp(-.80,.2,t);
  h=[.27,Math.sin(a)*.30-.25,.65];tip=[.18,h[1]+Math.sin(a)*p.length,.65+Math.cos(a)*p.length];
 }else{
  const a=phase==='windup'?lerp(.3,1.10,t)*side:phase==='active'?lerp(1.10,-1.05,t)*side:lerp(-1.05,.3,t)*side;
  h=[Math.sin(a)*.44,-.30+Math.cos(a)*.14,.66];tip=[h[0]+Math.sin(a)*p.length,h[1]+.30-.38*(phase==='active'?t:0),h[2]+Math.cos(a)*p.length];
 }
 return{hilt:h,tip};
}
function attackPhase(a){const p=a.profile,activeStart=p.windup,activeEnd=p.windup+p.active;if(a.t<activeStart)return['windup',a.t/p.windup];if(a.t<activeEnd)return['active',(a.t-activeStart)/p.active];return['recovery',clamp((a.t-activeEnd)/p.recovery,0,1)]}
const exports={V,clamp,lerp,rng,hashSeed,angleDelta,yawAxes,localPoint,segmentSphere,segmentAABB,segmentOBB,mul4,perspective,viewMatrix,TILE,N,CEILING,generateDungeon,distanceField,inside,free,wallHit,lineClear,findPath,ITEMS,makeItem,hydrateItem,canEquipItem,sizeOf,Inventory,PROFILES,bladePose,attackPhase};
if(typeof module!=='undefined'&&module.exports)module.exports=exports;else root.CryptCore=exports;
})(typeof window!=='undefined'?window:globalThis);
