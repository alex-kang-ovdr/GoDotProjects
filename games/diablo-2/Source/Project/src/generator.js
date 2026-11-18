// Seeded dungeon builder: BSP rooms, minimum spanning tree, optional loops, validation and fallback.
function dungeon(seed=(Math.random()*4294967296)>>>0){
 let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
 const ri=(a,b)=>a+Math.floor(random()*(b-a+1));
 const map=Array.from({length:NY},()=>Array(NX).fill(1)),rooms=[],leaves=[];
 function split(x,y,w,h,depth){
  if(depth>=4||w<9&&h<9){leaves.push({x,y,w,h});return}
  let vertical=w/h>1.3?true:h/w>1.3?false:random()<.5;
  if(vertical&&w>=10){let cut=ri(5,w-5);split(x,y,cut,h,depth+1);split(x+cut,y,w-cut,h,depth+1)}
  else if(!vertical&&h>=8){let cut=ri(4,h-4);split(x,y,w,cut,depth+1);split(x,y+cut,w,h-cut,depth+1)}
  else leaves.push({x,y,w,h});
 }
 split(1,1,NX-2,NY-2,0);
 for(const l of leaves){let maxw=Math.min(8,l.w-1),maxh=Math.min(6,l.h-1);if(maxw<3||maxh<3)continue;
  let w=ri(3,maxw),h=ri(3,maxh),x=ri(l.x,l.x+l.w-w),y=ri(l.y,l.y+l.h-h);
  let c={x:Math.floor(x+w/2),y:Math.floor(y+h/2)};
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)map[yy][xx]=0;
  rooms.push({x,y,w,h,c,kind:'normal'});
 }
 if(rooms.length<4){ // guaranteed safe fallback, never recurse indefinitely
  return dungeonFallback(seed);
 }
 const edges=[];for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
  let a=rooms[i].c,b=rooms[j].c;edges.push({i,j,d:Math.abs(a.x-b.x)+Math.abs(a.y-b.y)+random()*.25});
 }edges.sort((a,b)=>a.d-b.d);
 const parent=rooms.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i};
 const selected=[];for(const e of edges){let a=root(e.i),b=root(e.j);if(a!==b){parent[a]=b;selected.push(e)}}
 for(const e of edges){if(selected.includes(e))continue;if(random()<.18&&selected.length<rooms.length+3)selected.push(e)}
 function carve(x,y){if(x>0&&x<NX-1&&y>0&&y<NY-1)map[y][x]=0}
 for(const e of selected){let a=rooms[e.i].c,b=rooms[e.j].c,x=a.x,y=a.y,firstX=random()<.5;
  if(firstX){while(x!==b.x){carve(x,y);x+=Math.sign(b.x-x)}while(y!==b.y){carve(x,y);y+=Math.sign(b.y-y)}}
  else{while(y!==b.y){carve(x,y);y+=Math.sign(b.y-y)}while(x!==b.x){carve(x,y);x+=Math.sign(b.x-x)}}carve(b.x,b.y);
 }
 // Pick start and exit at opposite ends of the connected dungeon.
 function distances(c){let q=[c],head=0,dist=Array.from({length:NY},()=>Array(NX).fill(-1));dist[c.y][c.x]=0;
  while(head<q.length){let a=q[head++];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let x=a.x+dx,y=a.y+dy;if(x>0&&y>0&&x<NX-1&&y<NY-1&&!map[y][x]&&dist[y][x]<0){dist[y][x]=dist[a.y][a.x]+1;q.push({x,y})}}}return dist}
 let startRoom=rooms[ri(0,rooms.length-1)],d0=distances(startRoom.c);
 startRoom=rooms.reduce((best,r)=>d0[r.c.y][r.c.x]>d0[best.c.y][best.c.x]?r:best,startRoom);
 let d1=distances(startRoom.c),endRoom=rooms.reduce((best,r)=>d1[r.c.y][r.c.x]>d1[best.c.y][best.c.x]?r:best,startRoom);
 if(d1[endRoom.c.y][endRoom.c.x]<7)return dungeonFallback(seed);
 let ordered=[startRoom,...rooms.filter(r=>r!==startRoom&&r!==endRoom),endRoom];
 ordered[0].kind='start';ordered.at(-1).kind='boss';
 let special=ordered.slice(1,-1);if(special.length)special[0].kind='shrine';if(special.length>2)special[Math.floor(special.length/2)].kind='treasure';
 return {map,rooms:ordered,start:center(startRoom.c),exit:center(endRoom.c),seed,links:selected.length,shortestPath:d1[endRoom.c.y][endRoom.c.x]};
}
function dungeonFallback(seed){
 const map=Array.from({length:NY},()=>Array(NX).fill(1)),rooms=[];
 const specs=[[2,2,5,5],[10,2,5,5],[18,2,5,5],[2,10,5,5],[18,10,5,5]];
 for(const [x,y,w,h] of specs){const c={x:x+2,y:y+2};for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)map[yy][xx]=0;rooms.push({x,y,w,h,c,kind:'normal'});}
 for(let i=1;i<rooms.length;i++){let a=rooms[i-1].c,b=rooms[i].c;for(let x=Math.min(a.x,b.x);x<=Math.max(a.x,b.x);x++)map[a.y][x]=0;for(let y=Math.min(a.y,b.y);y<=Math.max(a.y,b.y);y++)map[y][b.x]=0;}
 rooms[0].kind='start';rooms.at(-1).kind='boss';return {map,rooms,start:center(rooms[0].c),exit:center(rooms.at(-1).c),seed:seed>>>0,links:4,shortestPath:24,fallback:true};
}
function validateDungeon(d){if(!d||!d.rooms?.length)return false;let start=tile(d.start.x,d.start.y),end=tile(d.exit.x,d.exit.y),q=[start],seen=new Set([start.x+','+start.y]);
 for(let i=0;i<q.length;i++){let p=q[i];for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){let x=p.x+dx,y=p.y+dy,k=x+','+y;if(x>=0&&y>=0&&x<NX&&y<NY&&!d.map[y][x]&&!seen.has(k)){seen.add(k);q.push({x,y})}}}
 return seen.has(end.x+','+end.y)&&d.rooms.every(r=>seen.has(r.c.x+','+r.c.y));
}
