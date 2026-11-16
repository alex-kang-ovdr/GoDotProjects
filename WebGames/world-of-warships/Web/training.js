/* Iron Tide — five independent lessons driven by real simulation outcomes. */
(function(global){
  'use strict';
  const N=global.IronTide=global.IronTide||{};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const validStep=v=>Number.isInteger(v)&&v>=0&&v<5?v:0;
  const LESSONS=Object.freeze([
    Object.freeze({title:'첫 항해',instruction:'W 또는 ＋로 증속하고 A·D 또는 ◀·▶로 조타해 표시된 해역으로 이동하세요.',goal:'표시된 해역에 도착'}),
    Object.freeze({title:'고폭탄 사격',instruction:'1번 고폭탄을 선택하세요. 앞쪽 정지 표적을 조준하고 포탑 정렬을 기다린 뒤 사격하세요.',goal:'주포 고폭탄으로 실제 피해 1회',ammo:'HE'}),
    Object.freeze({title:'철갑탄과 측면',instruction:'2번 철갑탄을 선택해 측면을 보인 정지 표적을 조준하세요. 탄착까지 조준을 유지할 필요는 없습니다.',goal:'주포 철갑탄으로 실제 피해 1회',ammo:'AP'}),
    Object.freeze({title:'측면 어뢰 발사',instruction:'3번 어뢰를 선택하고 오른쪽 표적을 조준하세요. 함선 측면 발사 구역 안에서 발사해 명중시키세요.',goal:'어뢰로 실제 피해 1회',ammo:'TORP'}),
    Object.freeze({title:'거점 확보',instruction:'앞쪽 거점 안으로 이동하세요. S 또는 −로 감속해 거점 안에 머물며 점령을 완료하세요.',goal:'거점 A를 직접 점령'})
  ]);

  function create(options={}){
    if(!options||typeof options!=='object')options={};
    if(typeof N.createGame!=='function')throw new Error('Training requires the naval simulation.');
    const step=validStep(options.step),seed=Number.isFinite(options.seed)?options.seed>>>0:711;
    const game=N.createGame({shipClass:'cruiser',operationId:'northern',loadoutId:'balanced',difficulty:'easy',seed});
    game.trainingMode=true;game.matchId=`training-${seed}-${step}`;
    game.islands=[
      {x:1500,y:1950,rx:100,ry:260,rotation:-.2,seed:511},
      {x:2830,y:1450,rx:160,ry:120,rotation:.2,seed:522}
    ];
    game.zones=[];game.score=[0,0];game.lastKnown={};
    const player=game.player;
    Object.assign(player,{x:2100,y:2200,angle:-Math.PI/2,gunAngle:-Math.PI/2,throttle:0,speed:0,vx:0,vy:0,rudder:0,turn:0,aimX:2100,aimY:1630});
    let target=null,checkpoint=null;
    if(step===1||step===2){
      target=game.ships.find(s=>s.id==='red-ca');
      Object.assign(target,{name:step===1?'고폭탄 정지 표적':'철갑탄 측면 표적',x:2100,y:1630,angle:0,gunAngle:0});
    }else if(step===3){
      target=game.ships.find(s=>s.id==='red-dd');
      Object.assign(target,{name:'어뢰 정지 표적',x:2550,y:2200,angle:Math.PI/2,gunAngle:Math.PI/2});
      player.aimX=target.x;player.aimY=target.y;
    }else if(step===0)checkpoint={x:2100,y:1880,radius:110};
    else{
      const zone={id:'A',x:2100,y:1880,radius:145,progress:0,owner:null,contested:false};
      game.zones=[zone];checkpoint={x:zone.x,y:zone.y,radius:zone.radius};
    }
    if(target){
      // Stationary training targets retain normal hull/armor/HP. Their weapons are
      // inactive by declared scenario setup, not invulnerability or fabricated damage.
      Object.assign(target,{aiDisabled:true,throttle:0,speed:0,vx:0,vy:0,rudder:0,turn:0,secondaryRange:0});
      target.visible=true;target.seenBy=[true,true];target.detected=true;
      game.ships=[player,target];
    }else game.ships=[player];
    // Normal simulation ticks establish vision; lesson completion is never pre-awarded.
    const initialDistance=checkpoint?Math.hypot(player.x-checkpoint.x,player.y-checkpoint.y):0;
    return {game,step,seed,stageComplete:false,failed:false,complete:false,targetId:target?target.id:null,checkpoint,
      failureReason:'',lastEventId:0,movedDistance:0,lastX:player.x,lastY:player.y,initialDistance,hitEvidence:null};
  }

  function tick(session,dt,controls={}){
    if(!session||!session.game||session.stageComplete||session.failed||session.complete||!Number.isFinite(dt)||dt<=0)return session;
    const game=session.game,player=game.player;
    N.tickGame(game,dt,controls);
    session.movedDistance+=Math.hypot(player.x-session.lastX,player.y-session.lastY);
    session.lastX=player.x;session.lastY=player.y;
    const fresh=game.events.filter(e=>Number.isFinite(e.id)&&e.id>session.lastEventId);
    for(const e of fresh)session.lastEventId=Math.max(session.lastEventId,e.id);
    if(player.hp<=0||game.phase==='lost'){
      session.failed=true;session.failureReason='기함이 격침되었습니다. 같은 훈련을 다시 시작할 수 있습니다.';return session;
    }
    const lesson=LESSONS[session.step];
    if(session.step===0){
      const c=session.checkpoint;
      if(session.movedDistance>=30&&Math.hypot(player.x-c.x,player.y-c.y)<=c.radius)session.stageComplete=true;
    }else if(session.step===4){
      if(game.zones[0]&&game.zones[0].owner===0&&game.stats.caps>0)session.stageComplete=true;
    }else{
      const hit=fresh.find(e=>e.type==='hit'&&e.ownerId===game.playerId&&e.ammo===lesson.ammo&&e.secondary===false&&e.damage>0&&e.shipId===session.targetId&&(lesson.ammo!=='TORP'||e.result==='torpedo'));
      if(hit){
        session.hitEvidence={id:hit.id,ammo:hit.ammo,damage:hit.damage,result:hit.result,ownerId:hit.ownerId};
        session.stageComplete=true;
      }else{
        const target=game.ships.find(s=>s.id===session.targetId);
        if(!target||target.hp<=0){session.failed=true;session.failureReason='목표 무장의 명중을 확인하기 전에 표적이 격침되었습니다. 다시 시도해 주세요.';}
      }
    }
    return session;
  }

  function advance(session){
    if(!session||!session.game)return create();
    if(!session.stageComplete||session.failed)return session;
    if(session.step>=LESSONS.length-1)return {...session,complete:true};
    return create({step:session.step+1,seed:session.seed});
  }
  function restart(session){return create({step:session?session.step:0,seed:session?session.seed:711});}
  function brief(session){
    const step=validStep(session&&session.step),lesson=LESSONS[step];
    let value=0;
    if(session&&session.game){
      if(session.stageComplete)value=1;
      else if(step===0&&session.checkpoint){
        const remaining=Math.hypot(session.game.player.x-session.checkpoint.x,session.game.player.y-session.checkpoint.y);
        value=clamp((session.initialDistance-remaining)/Math.max(1,session.initialDistance-session.checkpoint.radius),0,1);
      }else if(step===4&&session.game.zones[0])value=clamp(session.game.zones[0].progress,0,1);
    }
    return {index:step+1,title:lesson.title,instruction:session&&session.failed?session.failureReason:lesson.instruction,goal:lesson.goal,progress:value,
      complete:!!(session&&session.stageComplete),failed:!!(session&&session.failed),targetId:session?session.targetId:null,
      checkpoint:session&&session.checkpoint?{...session.checkpoint}:null};
  }
  function progress(session){
    const step=validStep(session&&session.step),passed=!!(session&&session.stageComplete),completed=!!(session&&(session.complete||step===4&&passed));
    return {version:1,step:completed?4:passed?Math.min(4,step+1):step,completed};
  }
  function normalizeProgress(value){
    if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1)return {version:1,step:0,completed:false};
    const completed=value.completed===true;
    return {version:1,step:completed?4:validStep(value.step),completed};
  }
  function mergeProgress(previous,next){
    const before=normalizeProgress(previous),after=normalizeProgress(next),completed=before.completed||after.completed;
    return {version:1,step:completed?4:Math.max(before.step,after.step),completed};
  }
  N.Training=Object.freeze({create,tick,advance,restart,brief,progress,normalizeProgress,mergeProgress,lessons:LESSONS});
})(typeof globalThis!=='undefined'?globalThis:window);
