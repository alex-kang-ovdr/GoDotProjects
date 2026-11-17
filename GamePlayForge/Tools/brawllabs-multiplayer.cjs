'use strict';
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const unit = (x, y) => { const n = Math.hypot(x, y); return n > 0 ? [x / n, y / n] : [1, 0]; };
const WALLS = [[0,0,1280,24],[0,776,1280,24],[0,0,24,800],[1256,0,24,800],[516,270,90,66],[516,464,90,66],[674,270,90,66],[674,464,90,66],[310,180,54,54],[916,566,54,54]];
const profiles = { pin: [140,255,30,.58], brick: [205,218,42,.92], comet: [128,232,36,.76] };
const segmentHit = (x1,y1,x2,y2,cx,cy,r) => { const dx=x2-x1,dy=y2-y1,t=clamp(((cx-x1)*dx+(cy-y1)*dy)/(dx*dx+dy*dy||1),0,1); return Math.hypot(x1+t*dx-cx,y1+t*dy-cy)<=r ? t : Infinity; };
function wallHit(x1,y1,x2,y2,w) {
  let low=0, high=1;
  for(const [p,d,min,max] of [[x1,x2-x1,w[0],w[0]+w[2]],[y1,y2-y1,w[1],w[1]+w[3]]]) {
    if(Math.abs(d)<1e-9){if(p<min||p>max)return Infinity;continue;}
    const a=(min-p)/d,b=(max-p)/d;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));if(low>high)return Infinity;
  }return low;
}
function moveActor(a,dx,dy) {
  for(const axis of ['x','y']){
    a[axis]+=axis==='x'?dx:dy;
    for(const [x,y,w,h] of WALLS){
      const nearX=clamp(a.x,x,x+w),nearY=clamp(a.y,y,y+h);
      if(Math.hypot(a.x-nearX,a.y-nearY)>=22)continue;
      if(axis==='x'&&a.y>y-22&&a.y<y+h+22)a.x=a.x<x+w/2?x-22:x+w+22;
      if(axis==='y'&&a.x>x-22&&a.x<x+w+22)a.y=a.y<y+h/2?y-22:y+h+22;
    }
  }a.x=clamp(a.x,46,1234);a.y=clamp(a.y,46,754);
}
class BrawlRoom {
  constructor(id, projectId, now=Date.now) { this.id=id;this.projectId=projectId;this.now=now;this.phase='lobby';this.players=new Map();this.countdownEndsAt=null;this.game=null;this.lastStep=now(); }
  join(name, team) {
    if(this.players.size>=18)throw Error('로비가 가득 찼습니다.');
    const occupied=t=>[...this.players.values()].filter(p=>!p.spectator&&p.team===t).length;
    if(![0,1].includes(team))team=occupied(0)<=occupied(1)?0:1;
    const spectator=['playing','finished'].includes(this.phase)||occupied(team)>=3;
    const p={id:crypto.randomBytes(10).toString('hex'),name:String(name||'Player').trim().slice(0,24)||'Player',team,ready:false,spectator,waitingSince:this.now(),seq:-1,input:null};
    this.players.set(p.id,p);this.reconsider();return p;
  }
  command(id, m) {
    const p=this.players.get(id);if(!p)throw Error('참가자를 찾을 수 없습니다.');
    if(m.type==='input'){
      if(this.phase!=='playing'||p.spectator)return;
      if(!Number.isSafeInteger(m.seq)||m.seq<=p.seq)return;
      if(!['moveX','moveY','aimX','aimY'].every(k=>Number.isFinite(m[k])))throw Error('잘못된 게임 입력입니다.');
      p.seq=m.seq;const n=Math.max(1,Math.hypot(m.moveX,m.moveY));
      p.input={moveX:clamp(m.moveX/n,-1,1),moveY:clamp(m.moveY/n,-1,1),aimX:clamp(m.aimX,0,1280),aimY:clamp(m.aimY,0,800),fire:m.fire===true,super:m.super===true,gadget:m.gadget===true,at:this.now()};return;
    }
    if(!['lobby','countdown'].includes(this.phase))throw Error('경기 중에는 팀이나 준비 상태를 바꿀 수 없습니다.');
    if(m.type==='team'){
      if(![0,1].includes(m.team))throw Error('팀을 선택하세요.');
      if([...this.players.values()].filter(q=>q.id!==id&&!q.spectator&&q.team===m.team).length>=3)throw Error('해당 팀은 3명이 모두 찼습니다.');
      if(p.ready||p.spectator)p.waitingSince=this.now();
      p.team=m.team;p.spectator=false;p.ready=false;
    }else if(m.type==='ready'){
      if(p.spectator)throw Error('팀을 선택한 뒤 준비할 수 있습니다.');
      if(typeof m.ready!=='boolean')throw Error('잘못된 준비 상태입니다.');
      if(p.ready&&!m.ready)p.waitingSince=this.now();p.ready=m.ready;
    }else if(m.type==='spectate'){p.spectator=true;p.ready=false;}
    else throw Error('지원하지 않는 요청입니다.');
    this.reconsider();
  }
  leave(id) {
    this.players.delete(id);
    if(this.game)for(const a of this.game.actors)if(a.controllerId===id){a.controllerId=null;a.isBot=true;a.name+=' · BOT';}
    this.reconsider();
  }
  reconsider() {
    if(!['lobby','countdown'].includes(this.phase))return;
    const active=[...this.players.values()].filter(p=>!p.spectator);
    const canStart=active.length>=2&&active.every(p=>p.ready);
    if(!canStart){this.phase='lobby';this.countdownEndsAt=null;}
    else if(this.phase!=='countdown'){this.phase='countdown';this.countdownEndsAt=this.now()+5000;}
  }
  start() {
    const actors=[];
    for(let team=0;team<2;team++){
      const people=[...this.players.values()].filter(p=>!p.spectator&&p.ready&&p.team===team);
      for(let lane=0;lane<3;lane++){
        const p=people[lane],hero=['pin','brick','comet'][lane],stats=profiles[hero];
        actors.push({slot:team*3+lane,team,name:p?.name||`BOT ${team*3+lane+1}`,hero,x:team===0?260:1020,y:260+lane*140,hp:stats[0],maxHp:stats[0],alive:true,respawn:0,gems:0,ammo:3,aimX:team===0?1:-1,aimY:0,isBot:!p,controllerId:p?.id||null,cooldown:0,reload:0,superCharge:0,gadgetCooldown:0});
      }
    }
    this.game={tick:0,elapsed:0,actors,shots:[],gems:[{x:640,y:400}],secureTeam:-1,secureRemaining:0,result:'',gemClock:0};this.phase='playing';this.countdownEndsAt=null;
  }
  tick() {
    const now=this.now();
    if(['lobby','countdown'].includes(this.phase)){
      for(const p of this.players.values())if(!p.spectator&&!p.ready&&now-p.waitingSince>20000){p.spectator=true;p.ready=false;}
      this.reconsider();if(this.phase==='countdown'&&now>=this.countdownEndsAt)this.start();
    }
    const seconds=Math.min(.25,Math.max(0,(now-this.lastStep)/1000));this.lastStep=now;
    if(this.phase==='playing')this.simulate(seconds);
  }
  simulate(dt) {
    const g=this.game;g.tick++;g.elapsed+=dt;g.gemClock+=dt;
    if(g.gemClock>=4&&g.gems.length<7){g.gemClock=0;g.gems.push({x:640+Math.sin(g.tick)*40,y:400+Math.cos(g.tick)*45});}
    for(const a of g.actors){
      a.cooldown=Math.max(0,a.cooldown-dt);a.gadgetCooldown=Math.max(0,a.gadgetCooldown-dt);
      if(!a.alive){a.respawn-=dt;if(a.respawn<=0){a.alive=true;a.hp=a.maxHp;a.x=a.team===0?260:1020;a.y=260+(a.slot%3)*140;a.ammo=3;}continue;}
      const enemies=g.actors.filter(b=>b.team!==a.team&&b.alive).sort((b,c)=>Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(c.x-a.x,c.y-a.y));
      const enemy=enemies[0];let input={moveX:0,moveY:0,aimX:a.x+a.aimX,aimY:a.y+a.aimY,fire:false};
      if(a.isBot&&enemy){
        const gem=g.gems.slice().sort((b,c)=>Math.hypot(b.x-a.x,b.y-a.y)-Math.hypot(c.x-a.x,c.y-a.y))[0];
        const target=gem||{x:640,y:400};const direction=unit(target.x-a.x,target.y-a.y);
        input={moveX:Math.hypot(target.x-a.x,target.y-a.y)>25?direction[0]*.75:0,moveY:Math.hypot(target.x-a.x,target.y-a.y)>25?direction[1]*.75:0,aimX:enemy.x,aimY:enemy.y,fire:Math.hypot(enemy.x-a.x,enemy.y-a.y)<500};
      }else {const received=this.players.get(a.controllerId)?.input;if(received&&this.now()-received.at<500)input=received;}
      const stats=profiles[a.hero];moveActor(a,input.moveX*stats[1]*dt,input.moveY*stats[1]*dt);
      [a.aimX,a.aimY]=unit(input.aimX-a.x,input.aimY-a.y);
      if(input.gadget&&a.gadgetCooldown<=0){moveActor(a,a.aimX*70,a.aimY*70);a.ammo=Math.min(3,a.ammo+1);a.gadgetCooldown=8;}
      if(input.fire&&a.cooldown<=0&&a.ammo>0){g.shots.push({x:a.x+a.aimX*28,y:a.y+a.aimY*28,dx:a.aimX,dy:a.aimY,team:a.team,owner:a.slot,damage:stats[2],life:.8});a.ammo--;a.cooldown=stats[3];}
      if(input.super&&a.superCharge>=1){for(const b of enemies){const [x,y]=unit(b.x-a.x,b.y-a.y);if(Math.hypot(b.x-a.x,b.y-a.y)<390&&x*a.aimX+y*a.aimY>.58)this.damage(b,75,a);}a.superCharge=0;}
      if(a.ammo<3){a.reload+=dt;if(a.reload>=.75){a.ammo++;a.reload=0;}}else a.reload=0;
      for(let i=g.gems.length-1;i>=0;i--)if(Math.hypot(g.gems[i].x-a.x,g.gems[i].y-a.y)<34){a.gems++;g.gems.splice(i,1);}
    }
    for(let i=g.shots.length-1;i>=0;i--){
      const s=g.shots[i];s.life-=dt;const x=s.x+s.dx*720*dt,y=s.y+s.dy*720*dt;let first=Infinity,target=null;
      for(const w of WALLS)first=Math.min(first,wallHit(s.x,s.y,x,y,w));
      for(const a of g.actors){if(!a.alive||a.team===s.team)continue;const hit=segmentHit(s.x,s.y,x,y,a.x,a.y,25);if(hit<first){first=hit;target=a;}}
      if(target)this.damage(target,s.damage,g.actors[s.owner]);
      if(first!==Infinity||s.life<=0)g.shots.splice(i,1);else{s.x=x;s.y=y;}
    }
    const counts=[0,0];for(const a of g.actors)if(a.alive)counts[a.team]+=a.gems;
    const team=counts[0]>=5&&counts[0]>counts[1]?0:counts[1]>=5&&counts[1]>counts[0]?1:-1;
    if(team<0){g.secureTeam=-1;g.secureRemaining=0;}else if(g.secureTeam!==team){g.secureTeam=team;g.secureRemaining=8;}else {g.secureRemaining-=dt;if(g.secureRemaining<=0){g.result=team===0?'BLUE WINS':'RED WINS';this.phase='finished';}}
  }
  damage(a,amount,attacker){if(!a.alive)return;a.hp=Math.max(0,a.hp-amount);attacker.superCharge=Math.min(1,attacker.superCharge+.19);if(a.hp===0){a.alive=false;a.respawn=2.8;for(let n=0;n<a.gems;n++)this.game.gems.push({x:a.x+(n%3-1)*12,y:a.y+Math.floor(n/3)*8});a.gems=0;}}
  snapshot(){return {type:'state',roomId:this.id,projectId:this.projectId,phase:this.phase,serverTime:this.now(),countdownEndsAt:this.countdownEndsAt,players:[...this.players.values()].map(({input,seq,...p})=>p),game:this.game};}
}
function attachBrawlLabs(server,{originAllowed,now=Date.now}={}) {
  const rooms=new Map(),peers=new Map();const wss=new WebSocketServer({noServer:true,maxPayload:4096});
  const send=(socket,data)=>{if(socket.readyState===WebSocket.OPEN&&socket.bufferedAmount<1000000)socket.send(JSON.stringify(data));};
  const upgrade=(req,socket,head)=>{if(req.url!=='/brawllabs')return;if(!originAllowed(req)){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));};
  server.on('upgrade',upgrade);
  wss.on('connection',socket=>{
    socket.alive=true;socket.on('pong',()=>socket.alive=true);let rateAt=now(),count=0;
    const timeout=setTimeout(()=>{if(!peers.has(socket))socket.close(1008,'Join required');},5000);timeout.unref();
    socket.on('message',raw=>{
      try{
        if(now()-rateAt>1000){rateAt=now();count=0;}if(++count>80)throw Error('요청이 너무 빠릅니다.');
        const m=JSON.parse(raw.toString());if(!m||typeof m!=='object'||Array.isArray(m))throw Error('잘못된 메시지입니다.');
        if(m.type==='join'){
          if(peers.has(socket))throw Error('이미 참가했습니다.');
          let room;
          if(m.roomId){room=rooms.get(m.roomId);if(!room)throw Error('로비를 찾을 수 없습니다.');}
          else{if(rooms.size>=64)throw Error('현재 로비가 가득 찼습니다.');if(!/^[a-f0-9]{24}$/.test(m.projectId||''))throw Error('프로젝트를 선택하세요.');const id=crypto.randomBytes(6).toString('hex');room=new BrawlRoom(id,m.projectId,now);rooms.set(id,room);}
          const player=room.join(m.name,m.team);peers.set(socket,{room,player});clearTimeout(timeout);send(socket,{type:'welcome',roomId:room.id,playerId:player.id,projectId:room.projectId});send(socket,room.snapshot());
        }else{const peer=peers.get(socket);if(!peer)throw Error('먼저 참가하세요.');peer.room.command(peer.player.id,m);}
      }catch(error){send(socket,{type:'error',error:error.message});}
    });
    socket.on('close',()=>{clearTimeout(timeout);const p=peers.get(socket);if(p){p.room.leave(p.player.id);peers.delete(socket);if(p.room.players.size===0)rooms.delete(p.room.id);}});
  });
  const timer=setInterval(()=>{for(const room of rooms.values())room.tick();for(const [socket,{room}] of peers)send(socket,room.snapshot());},50);timer.unref();
  const heartbeat=setInterval(()=>{for(const socket of wss.clients){if(!socket.alive){socket.terminate();continue;}socket.alive=false;socket.ping();}},2000);heartbeat.unref();
  return {rooms,close(){clearInterval(timer);clearInterval(heartbeat);server.off('upgrade',upgrade);for(const s of wss.clients)s.terminate();wss.close();rooms.clear();}};
}
module.exports={BrawlRoom,attachBrawlLabs};
