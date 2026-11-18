// One source of truth for wall / gate queries. Never ignore a closed gate in pathfinding.
function gateTiles(d){const r=d.rooms.at(-1),out=[];if(!r)return out;const inside=(x,y)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h;
 for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){if(d.map[y]?.[x]!==0)continue;if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>!inside(x+dx,y+dy)&&d.map[y+dy]?.[x+dx]===0))out.push({x,y});}return out;}
function tileOpen(map,x,y,locked){return x>=0&&y>=0&&x<NX&&y<NY&&map[y][x]===0&&!(locked&&locked.has(y*NX+x));}
function reachTiles(map,start,locked){const a=tile(start.x,start.y),seen=new Set(),q=[];if(!tileOpen(map,a.x,a.y,locked))return {seen,q};seen.add(a.y*NX+a.x);q.push(a);for(let i=0;i<q.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=q[i].x+dx,y=q[i].y+dy,k=y*NX+x;if(tileOpen(map,x,y,locked)&&!seen.has(k)){seen.add(k);q.push({x,y});}}return {seen,q};}
function gatesLocked(){return S&&S.keyCount<1?new Set((S.director?.gates||[]).map(a=>a.y*NX+a.x)):null;}
function gateBlocked(x,y){const t=tile(x,y);return S?.keyCount<1&&!!S.director?.gates.some(a=>a.x===t.x&&a.y===t.y);}
function walk(x,y,r=10,ignoreGate=false){const minX=Math.floor((x-r)/T),maxX=Math.floor((x+r)/T),minY=Math.floor((y-r)/T),maxY=Math.floor((y+r)/T);
 for(let ty=minY;ty<=maxY;ty++)for(let tx=minX;tx<=maxX;tx++){const solid=tx<0||ty<0||tx>=NX||ty>=NY||S.map[ty][tx]!==0||(!ignoreGate&&S.keyCount<1&&S.director?.gates.some(a=>a.x===tx&&a.y===ty));if(!solid)continue;const cx=clamp(x,tx*T,(tx+1)*T),cy=clamp(y,ty*T,(ty+1)*T);if((cx-x)**2+(cy-y)**2<r*r-.001)return false;}return true;}
function move(o,dx,dy){const n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/5)),sx=dx/n,sy=dy/n,ox=o.x,oy=o.y;for(let i=0;i<n;i++){if(walk(o.x+sx,o.y,o.r||10))o.x+=sx;if(walk(o.x,o.y+sy,o.r||10))o.y+=sy;}const m=Math.hypot(o.x-ox,o.y-oy);if(m>.01){o.walkPhase=(o.walkPhase||0)+m*.13;if(!o.attackAnim)o.face=Math.atan2(o.y-oy,o.x-ox);}return m;}
function lineClear(a,b,r=2){const d=distance(a,b),n=Math.max(1,Math.ceil(d/5));for(let i=0;i<=n;i++)if(!walk(a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,r))return false;return true;}
function route(from,to,r=10){const a=tile(from.x,from.y),want=tile(to.x,to.y),lock=gatesLocked(),q=[a],seen=new Set([a.y*NX+a.x]),prev=new Map();let end=null,best=a,bestDist=Infinity;
 for(let h=0;h<q.length;h++){const p=q[h],k=p.y*NX+p.x,d=(p.x-want.x)**2+(p.y-want.y)**2;if(d<bestDist){bestDist=d;best=p;}if(p.x===want.x&&p.y===want.y){end=p;break;}for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const x=p.x+dx,y=p.y+dy,j=y*NX+x;if(!tileOpen(S.map,x,y,lock)||seen.has(j)||!walk((x+.5)*T,(y+.5)*T,r))continue;seen.add(j);prev.set(j,k);q.push({x,y});}}
 end=end||best;const out=[];let k=end.y*NX+end.x,st=a.y*NX+a.x;while(k!==st&&prev.has(k)){out.push(center({x:k%NX,y:Math.floor(k/NX)}));k=prev.get(k);}out.reverse();
 if(tileOpen(S.map,want.x,want.y,lock)&&end.x===want.x&&end.y===want.y&&walk(to.x,to.y,r)){if(out.length)out[out.length-1]={x:to.x,y:to.y};else if(distance(from,to)>2)out.push({x:to.x,y:to.y});}return out;
}
function navigate(e,goal,dt,speed){e.pathTime=(e.pathTime||0)-dt;const movedGoal=!e.pathGoal||distance(e.pathGoal,goal)>22;if(e.pathTime<=0||e.navVersion!==navVersion||movedGoal){e.path=route(e,goal,e.r||10);e.pathGoal={x:goal.x,y:goal.y};e.pathTime=.28+(e.id%5)*.035;e.navVersion=navVersion;}
 while(e.path?.length&&distance(e,e.path[0])<4)e.path.shift();let dest=e.path?.[0];if(!dest)return;
 const d=distance(e,dest),step=Math.min(speed*dt,d),vx=(dest.x-e.x)/(d||1),vy=(dest.y-e.y)/(d||1);const walked=move(e,vx*step,vy*step);if(walked<step*.15)e.pathTime=0;
}
function tacticalPoint(e,target,mode){const reachable=reachTiles(S.map,e,gatesLocked()).q;let best={x:e.x,y:e.y},score=-Infinity;const player=S.p;
 for(const t of reachable){const p=center(t),selfDist=distance(e,p),pd=distance(player,p);if(selfDist>modeRadius(mode)||!walk(p.x,p.y,e.r))continue;let val;
 if(mode==='retreat')val=Math.min(pd,230)*1.6-selfDist*.38+(lineClear(p,player)?0:38);
 else if(mode==='kite')val=-Math.abs(pd-145)*1.5-selfDist*.3+(lineClear(p,player)?30:-45);
 else val=-distance(p,target)-selfDist*.12;
 if(val>score){score=val;best=p;}}
 return best;
}
function modeRadius(mode){return mode==='retreat'?180:mode==='kite'?140:230;}
// Geometry, locked-state reachability and key placement are checked on the SAME compiled data.
function compileDungeon(seed,floor=1){let d=dungeon(seed);if(!validateDungeon(d))d=dungeonFallback(seed);let content=compileContent(d,floor);
 if(!content.validation.ok){d=dungeonFallback(seed);content=compileContent(d,floor);}
 return {...d,content};
}
function compileContent(d,floor){const rng=seedRng((d.seed^Math.imul(floor,2654435761))>>>0),gates=gateTiles(d),locked=new Set(gates.map(a=>a.y*NX+a.x)),reach=reachTiles(d.map,d.start,locked),full=reachTiles(d.map,d.start,null),end=tile(d.exit.x,d.exit.y);
 const rooms=d.rooms.map((r,i)=>({...r,index:i,kind:i===0?'start':i===d.rooms.length-1?'boss':'combat'}));
 const optional=rooms.slice(1,-1);for(let i=optional.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[optional[i],optional[j]]=[optional[j],optional[i]];}
 const kinds=['treasure','elite','shrine','trap','combat'];optional.forEach((r,i)=>r.kind=kinds[i%kinds.length]);
 const candidates=rooms.slice(1,-1).filter(r=>reach.seen.has(r.c.y*NX+r.c.x));let keyRoom=candidates.find(r=>r.kind==='treasure')||candidates[0]||rooms[0];
 const objects=[];for(const r of rooms){let kind=({treasure:'chest',shrine:'shrine',trap:'trap'})[r.kind];if(kind)objects.push({id:`${kind}-${r.index}`,kind,...center(r.c),used:false,room:r.index});}
 let keyPos=center(keyRoom.c);if(objects.some(o=>distance(o,keyPos)<20)){const options=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>({x:keyRoom.c.x+dx,y:keyRoom.c.y+dy})).filter(t=>reach.seen.has(t.y*NX+t.x));if(options.length)keyPos=center(options[0]);}
 objects.push({id:`key-${keyRoom.index}`,kind:'key',...keyPos,used:false,room:keyRoom.index});
 const encounters=rooms.filter(r=>r.kind!=='start'&&r.kind!=='boss').map(r=>({room:r.index,kind:r.kind,budget:3+floor+(r.kind==='elite'?3:0),count:r.kind==='shrine'?0:r.kind==='treasure'?2:Math.min(5,2+Math.floor(floor/2)+(r.kind==='elite'?1:0))}));
 const kp=tile(keyPos.x,keyPos.y),validKey=reach.seen.has(kp.y*NX+kp.x),exitOpen=full.seen.has(end.y*NX+end.x),exitLocked=!reach.seen.has(end.y*NX+end.x);
 return {rooms,objects,gates,encounters,validation:{ok:validKey&&exitOpen&&exitLocked&&gates.length>0,keyReachable:validKey,exitOpen,exitLocked},keyRoom:keyRoom.index};
}
function makeEnemy(x,y,type='grunt',extra={}){const f=S.floor,boss=type==='boss',elite=type==='elite',caster=type==='caster';const hp=boss?220+f*82:elite?64+f*20:caster?28+f*10:36+f*12;
 return {id:S.nextId++,x,y,r:boss?12:10,visualRadius:boss?20:elite?14:12,type,hp,maxHp:hp,speed:boss?39:elite?58:caster?49:54,atk:boss?15+f*3:elite?8+f*2:6+f*2,modifier:elite?choose(['swift','armored','vampiric','volatile','frost']):null,cd:.3+random(),skillCd:2,phase:0,stun:0,activated:false,aggro:0,path:[],pathTime:0,face:1.57,walkPhase:0,attackAnim:0,flash:0,windup:null,...extra};
}
function applyContent(d){S.map=d.map;S.rooms=d.rooms;S.exit=d.exit;S.dungeonSeed=d.seed;S.director=d.content||compileContent(d,S.floor);S.keyCount=0;S.squads={};S.enemies=[];S.shrines=[];navVersion++;
 const rng=seedRng((d.seed^0x45d9f3b)>>>0);
 for(const enc of S.director.encounters){const r=S.rooms[enc.room],places=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const p=center({x,y});if(walk(p.x,p.y,10)&&distance(p,S.p)>80&&!S.director.objects.some(o=>distance(o,p)<24))places.push(p);}
 for(let i=places.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[places[i],places[j]]=[places[j],places[i]];}
 const n=Math.min(enc.count,places.length),id=`f${S.floor}r${enc.room}`;
 if(!n)continue;S.squads[id]={id,initialSize:n,room:enc.room,order:'dormant',morale:1,orderTime:0,retreatUntil:0,leaderLost:false};
 for(let j=0;j<n;j++){const type=j===0&&enc.kind==='elite'?'elite':j===n-1&&n>2?'caster':'grunt';S.enemies.push(makeEnemy(places[j].x,places[j].y,type,{squadId:id,encounterRoom:enc.room,tactic:j===0?'captain':type==='caster'?'skirmisher':j%2?'flanker':'guardian',formationIndex:j,home:center(r.c)}));}}
 S.enemies.push(makeEnemy(S.exit.x,S.exit.y,'boss',{home:{...S.exit},bossName:bossNames[S.floor-1]}));S.bossDead=false;S.questKills=0;S.questTarget=Math.min(8,Math.max(3,S.enemies.length-1));S.questRewarded=false;
}
function verifyDirector(count=1000){let failures=0,minRooms=99,maxRooms=0,fallbacks=0,firstFailure=null,repeatOK=true;const start=performance.now();for(let i=0;i<count;i++){const seed=(Math.imul(i,7919)+23)>>>0,d=compileDungeon(seed,1+i%5),b=compileDungeon(seed,1+i%5);const valid=validateDungeon(d)&&d.content.validation.ok&&JSON.stringify(d)===JSON.stringify(b);if(!valid){failures++;firstFailure??=seed;}if(d.fallback)fallbacks++;if(JSON.stringify(d)!==JSON.stringify(b))repeatOK=false;minRooms=Math.min(minRooms,d.rooms.length);maxRooms=Math.max(maxRooms,d.rooms.length);}
 return {count,failures,firstFailure,deterministic:repeatOK,minRooms,maxRooms,fallbacks,ms:Math.round(performance.now()-start)};
}
