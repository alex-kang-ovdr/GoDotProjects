import {
  buildingAttachmentPoint, buildingAttachableCell, buildingBounds, buildingCells, buildingPort
} from './footprint.js';

// Installed base-game values. Web range uses the documented rocket stats
// equation with a thermal-mass proxy; see References/OxygenNotIncluded/ANALYSIS.md.
const ENGINE_FUEL_CAPACITY_KG=900;
const ENGINE_FUEL_RATE_KG_S=10;
const ENGINE_EFFICIENCY=20;
const MODULE_MASS_KG=40;
const ENGINE_MASS_KG=400;
const MASS_PENALTY_DIVISOR_KG=300;
const MASS_PENALTY_EXPONENT=3.2;
const DISTANCE_SCALE=10000;
const MISSION_SECONDS_PER_DISTANCE=1800;
const RESEARCH_OPPORTUNITY_KG=50;
const EVERGREEN_RESEARCH_KG=10;
const RESEARCH_OPPORTUNITIES=5;
const LEGACY_FUEL_KG=100;
const LEGACY_FLIGHT_SECONDS=600;
const FIXED_TARGETS=Object.freeze([
  Object.freeze({id:0,name:'탄소질 소행성 1',distance:1}),
  Object.freeze({id:1,name:'탄소질 소행성 2',distance:1})
]);
const LEGACY_ENGINE_DEFINITION=Object.freeze({
  name:'증기 연구 로켓',icon:'steamRocket',color:'#c18f6e',cost:{metal:160,rock:100},
  description:'증기 엔진과 연구 모듈로 가까운 천체를 탐사합니다. 증기 100 kg을 채우고 출항하면 한 주기 뒤 데이터뱅크를 가져옵니다.'
});
const RESTORED_ENGINE_DEFINITION=Object.freeze({
  name:'증기 엔진',icon:'steamRocket',color:'#c18f6e',cost:{metal:40,rock:30},
  description:'증기 900 kg을 저장하는 7×5 로켓 엔진입니다. 연구 모듈과 조종 모듈을 위에 연결하세요.'
});

export const ROCKET_SPACE_EXIT=Object.freeze({x1:37,x2:43,y:0});

export const EXPEDITION_BUILDINGS=Object.freeze({
  steamRocket:{
    ...LEGACY_ENGINE_DEFINITION
  },
  researchModule:{
    name:'로켓 연구 모듈',icon:'researchModule',color:'#9cbad4',
    cost:{metal:10,rock:10},
    description:'엔진 위의 연결점에 설치해 귀환할 때 천체 연구 데이터를 가져옵니다.'
  },
  commandModule:{
    name:'로켓 조종 모듈',icon:'commandModule',color:'#e6c57a',
    cost:{metal:10,rock:10},
    description:'연구 모듈 위에 연결하세요. 로켓 조종 인증을 받은 대원을 배정해야 발사할 수 있습니다.'
  }
});
// Kept for modules importing the old 4.3 name.
export const EXPEDITION_BUILDING=EXPEDITION_BUILDINGS.steamRocket;

function sameCell(a,b){return !!a&&!!b&&a.x===b.x&&a.y===b.y;}
function expectedAttachedPosition(host,childType){
  const hostPoint=buildingAttachmentPoint(host);
  const childAttach=buildingAttachableCell({type:childType,x:0,y:0});
  if(!hostPoint||!childAttach)return null;
  return {x:hostPoint.x-childAttach.x,y:hostPoint.y+childAttach.y};
}

function attachedAssembly(game,engine){
  const researchModules=[];
  let host=engine,expectedResearchPosition=expectedAttachedPosition(host,'researchModule');
  for(let index=0;expectedResearchPosition&&index<game.h;index++){
    const module=game.buildings.find(b=>b.type==='researchModule'&&b.x===expectedResearchPosition.x&&b.y===expectedResearchPosition.y)||null;
    if(!module)break;
    researchModules.push(module);
    host=module;
    expectedResearchPosition=expectedAttachedPosition(host,'researchModule');
  }
  const expectedCommandPosition=expectedAttachedPosition(host,'commandModule');
  const command=expectedCommandPosition
    ?game.buildings.find(b=>b.type==='commandModule'&&b.x===expectedCommandPosition.x&&b.y===expectedCommandPosition.y)||null
    :null;
  return {engine,researchModules,command,expectedResearchPosition,expectedCommandPosition};
}

function dryMassKg(assembly){
  return ENGINE_MASS_KG+assembly.researchModules.length*MODULE_MASS_KG+(assembly.command?MODULE_MASS_KG:0);
}

function destinationKey(distance,targetId){
  return Number.isInteger(targetId)&&FIXED_TARGETS.some(target=>target.id===targetId)
    ?`fixed:${targetId}`:`distance:${distance}`;
}

function destinationResearchCount(game,distance,targetId){
  const counts=game.resources.researchOpportunitiesByDestination;
  const count=counts?.[destinationKey(distance,targetId)];
  return Number.isSafeInteger(count)?count:0;
}

function predictedResearchReward(game,distance,moduleCount,targetId){
  if(!game.restoredRules)return 10+((game.resources.researchFlights||0)<RESEARCH_OPPORTUNITIES?RESEARCH_OPPORTUNITY_KG:0);
  let used=destinationResearchCount(game,distance,targetId),reward=0;
  for(let index=0;index<moduleCount;index++){
    reward+=EVERGREEN_RESEARCH_KG;
    if(used<RESEARCH_OPPORTUNITIES){reward+=RESEARCH_OPPORTUNITY_KG;used++;}
  }
  return reward;
}

function collectResearchReward(game,distance,moduleCount,targetId){
  if(!game.restoredRules){
    const reward=predictedResearchReward(game,distance,moduleCount);
    game.resources.dataBank=(game.resources.dataBank||0)+reward;
    game.resources.researchFlights=(game.resources.researchFlights||0)+1;
    return reward;
  }
  const key=destinationKey(distance,targetId),used=destinationResearchCount(game,distance,targetId);
  let discoveries=used,reward=0;
  for(let index=0;index<moduleCount;index++){
    reward+=EVERGREEN_RESEARCH_KG;
    if(discoveries<RESEARCH_OPPORTUNITIES){reward+=RESEARCH_OPPORTUNITY_KG;discoveries++;}
  }
  if(moduleCount>0){
    game.resources.researchOpportunitiesByDestination??={};
    game.resources.researchOpportunitiesByDestination[key]=discoveries;
  }
  game.resources.dataBank=(game.resources.dataBank||0)+reward;
  game.resources.researchFlights=(game.resources.researchFlights||0)+1;
  return reward;
}

function maxDistanceUnits(steamKg,dryKg){
  const fuel=Math.max(0,steamKg||0);
  const totalMass=dryKg+fuel;
  const massPenalty=Math.max(totalMass,Math.pow(totalMass/MASS_PENALTY_DIVISOR_KG,MASS_PENALTY_EXPONENT));
  return Math.max(0,fuel*ENGINE_EFFICIENCY-massPenalty);
}

function arrivalCell(game,engine){
  const bounds=buildingBounds(engine);
  const candidates=[
    {x:bounds.x+bounds.width,y:engine.y},
    {x:bounds.x-1,y:engine.y},
    {x:engine.x+3,y:engine.y+1},
    {x:engine.x+3,y:engine.y-1}
  ];
  return candidates.find(pos=>game._standable(pos.x,pos.y))||{x:engine.x+3,y:engine.y};
}

function isRocketStructure(building){
  return ['steamRocket','researchModule','commandModule'].includes(building?.type);
}

function hasAttachedRocketChild(game,parent){
  if(!['steamRocket','researchModule'].includes(parent?.type))return false;
  const researchPosition=expectedAttachedPosition(parent,'researchModule');
  const commandPosition=expectedAttachedPosition(parent,'commandModule');
  return game.buildings.some(building=>(building.type==='researchModule'
    &&sameCell(building,researchPosition))||(building.type==='commandModule'
    &&sameCell(building,commandPosition)));
}

export function installExpeditions(Game,{BUILDINGS}){
  const p=Game.prototype;
  const base={
    add:p._addBuilding,crewStep:p._crewStep,finish:p._finishUtilities,
    place:p.canPlace,reset:p.reset,load:p.load,inspect:p.inspect
  };

  p.buildingDefinition=function(type){
    if(type==='steamRocket'&&this.restoredRules)return RESTORED_ENGINE_DEFINITION;
    return BUILDINGS[type]||null;
  };

  p._addBuilding=function(...args){
    const b=base.add.apply(this,args);
    if(b.type==='steamRocket'){
      b.steamFuel=0;
      b.fuelCapacityKg=this.restoredRules?ENGINE_FUEL_CAPACITY_KG:LEGACY_FUEL_KG;
      b.returnAt=0;
      if(this.restoredRules){b.selectedDistance=1;b.targetId=0;b.missionState='grounded';b.flightPilotId=null;}
    }
    if(b.type==='commandModule')b.pilotId=null;
    return b;
  };

  p.reset=function(...args){
    const result=base.reset.apply(this,args);
    if(this.modernRules){this.resources.dataBank=0;this.resources.researchFlights=0;}
    if(this.restoredRules)this.resources.researchOpportunitiesByDestination={};
    if(this.restoredRules){
      // The opening in the permanent ceiling is the 4.4 map's outer-space exit.
      // Other terrain stays intact for players to excavate and pump themselves.
      for(let x=ROCKET_SPACE_EXIT.x1;x<=ROCKET_SPACE_EXIT.x2;x++){
        const cell=this.cell(x,ROCKET_SPACE_EXIT.y);
        cell.solid=null;cell.oxygen=0;cell.co2=0;cell.hydrogen=0;cell.steam=0;cell.revealed=true;
      }
    }
    return result;
  };

  p._rocketAssemblyForEngine=function(engine){
    if(!this.restoredRules||engine?.type!=='steamRocket')return null;
    return attachedAssembly(this,engine);
  };

  p._rocketEngineForBuilding=function(building){
    if(!this.restoredRules||!isRocketStructure(building))return null;
    if(building.type==='steamRocket')return building;
    for(const engine of this.buildings.filter(b=>b.type==='steamRocket')){
      const assembly=this._rocketAssemblyForEngine(engine);
      if(assembly.researchModules.some(module=>module.id===building.id)||assembly.command?.id===building.id)return engine;
    }
    return null;
  };

  p._rocketFlightPathClear=function(assembly){
    if(!assembly.command)return false;
    const bounds=buildingBounds(assembly.command);
    const left=bounds.x-1,right=bounds.x+bounds.width;
    for(let x=left;x<=right;x++){
      for(let y=bounds.y-1;y>=0;y--){
        const cell=this.cell(x,y);
        if(!cell||cell.solid)return false;
        if(this.buildings.some(b=>!['steamRocket','researchModule','commandModule'].includes(b.type)
          &&buildingCells(b).some(pos=>pos.x===x&&pos.y===y)))return false;
      }
    }
    return true;
  };

  p.getRocketState=function(buildingId){
    const selected=this.buildings.find(b=>b.id===buildingId);
    if(!selected)return null;
    const engine=this.restoredRules?this._rocketEngineForBuilding(selected):selected.type==='steamRocket'?selected:null;
    if(!engine)return null;

    if(!this.restoredRules){
      const fuel=engine.steamFuel||0;
      const inFlight=engine.returnAt>0;
      const ready=engine.progress>=1&&engine.enabled&&!inFlight&&fuel>=LEGACY_FUEL_KG-1e-8;
      return {
        engineId:engine.id,researchId:null,commandId:null,pilotId:null,targetId:null,targetName:null,targetOptions:[],selectedDistance:1,
        maxDistance:fuel>=LEGACY_FUEL_KG?1:0,steamFuelKg:fuel,fuelCapacityKg:LEGACY_FUEL_KG,
        missionState:inFlight?'inFlight':'grounded',returnAt:engine.returnAt||0,
        timeLeftSeconds:inFlight?Math.max(0,engine.returnAt-this.time):0,
        rewardKg:inFlight?0:predictedResearchReward(this,1,1),
        ready,reason:inFlight?'천체 탐사 중':fuel<LEGACY_FUEL_KG?'연료 포트에 증기 100 kg을 공급하세요.':ready?'':'로켓을 완공하고 가동하세요.'
      };
    }

    const assembly=this._rocketAssemblyForEngine(engine);
    const command=assembly.command;
    const crew=command?.pilotId==null?null:this.crew.find(c=>c.id===command.pilotId)||null;
    const fuel=engine.steamFuel||0;
    const distanceUnits=maxDistanceUnits(fuel,dryMassKg(assembly));
    const maxDistance=Math.floor(distanceUnits/DISTANCE_SCALE);
    const selectedDistance=Number.isInteger(engine.selectedDistance)?engine.selectedDistance:1;
    const targetId=Number.isInteger(engine.targetId)?engine.targetId:0;
    const target=FIXED_TARGETS.find(item=>item.id===targetId&&item.distance===selectedDistance)||null;
    const inFlight=engine.returnAt>0;
    const pilotBoarded=crew?.rocketBoardedId===engine.id;
    const pilotBoarding=crew?.rocketBoardingId===engine.id;
    const pilotBoardBlocked=crew?.rocketBoardBlocked===true;
    const flightPathClear=this._rocketFlightPathClear(assembly);
    let reason='';
    if(engine.progress<1)reason='증기 엔진을 완공하세요.';
    else if(assembly.researchModules.some(module=>module.progress<1))reason='연결된 연구 모듈을 모두 완공하세요.';
    else if(!command||command.progress<1)reason='엔진 또는 최상단 연구 모듈 위에 조종 모듈을 연결하세요.';
    else if(inFlight)reason='천체 탐사 중입니다.';
    else if(!engine.enabled||!command.enabled)reason='엔진과 조종 모듈을 가동하세요.';
    else if(this.tasks.some(task=>task.type==='deconstruct'
      &&[engine.id,...assembly.researchModules.map(module=>module.id),command.id].includes(task.buildingId)))
      reason='조립 부품의 해체 작업을 취소하세요.';
    else if(!flightPathClear)reason='조종 모듈 위부터 우주 출구까지 7칸 비행 통로를 비우세요.';
    else if(!crew)reason='조종 모듈에 인증된 대원을 배정하세요.';
    else if(!crew.rocketPilotCertified)reason='조종 대원에게 로켓 조종 인증을 부여하세요.';
    else if(crew.health<=0)reason='조종 대원이 작업할 수 있는 상태가 아닙니다.';
    else if(!pilotBoarded)reason=pilotBoardBlocked?'조종 대원이 로켓 입구에 접근할 수 없습니다.'
      :pilotBoarding?'조종 대원이 로켓 입구로 이동 중입니다.':'조종 대원이 로켓에 탑승해야 합니다.';
    else if(maxDistance<1)reason='증기 연료를 더 공급하세요. 목적지 한 구간에 필요한 추력이 부족합니다.';
    else if(selectedDistance<1||selectedDistance>maxDistance)reason='선택한 목적지가 현재 연료로 도달할 수 없습니다.';
    const ready=!reason;
    const flightDuration=selectedDistance*MISSION_SECONDS_PER_DISTANCE;
    return {
      engineId:engine.id,researchId:assembly.researchModules[0]?.id??null,
      researchIds:assembly.researchModules.map(module=>module.id),researchModuleCount:assembly.researchModules.length,
      commandId:command?.id??null,
      pilotId:command?.pilotId??null,pilotName:crew?.name??null,pilotQualified:!!crew?.rocketPilotCertified,
      targetId:target?.id??null,targetName:target?.name??`거리 ${selectedDistance}`,
      targetOptions:FIXED_TARGETS.filter(item=>item.distance<=maxDistance).map(item=>({...item})),
      pilotBoarded,pilotBoarding,pilotBoardBlocked,boardingCell:crew?.rocketBoardCell??null,
      selectedDistance,maxDistance,rangeUnits:distanceUnits,steamFuelKg:fuel,
      fuelCapacityKg:engine.fuelCapacityKg||ENGINE_FUEL_CAPACITY_KG,
      missionState:inFlight?'inFlight':'grounded',returnAt:engine.returnAt||0,
      timeLeftSeconds:inFlight?Math.max(0,engine.returnAt-this.time):0,
      flightDurationSeconds:flightDuration,
      rewardKg:predictedResearchReward(this,selectedDistance,assembly.researchModules.length,target?.id),
      flightPathClear,expectedResearchPosition:assembly.expectedResearchPosition,
      expectedResearchPositions:assembly.researchModules.map(module=>({x:module.x,y:module.y})),
      expectedCommandPosition:assembly.expectedCommandPosition,ready,reason
    };
  };

  p.certifyRocketPilot=function(crewId){
    if(!this.restoredRules)return{ok:false,message:'로켓 조종 인증은 4.4 기지에서 사용할 수 있어요.'};
    const crew=this.crew.find(c=>c.id===crewId);
    if(!crew||crew.health<=0)return{ok:false,message:'조종할 수 있는 대원을 선택하세요.'};
    if(crew.rocketPilotCertified)return{ok:false,message:'이미 로켓 조종 인증을 받았습니다.'};
    if((crew.skillPoints||0)<1)return{ok:false,message:'로켓 조종 인증에 기술 포인트 1이 필요합니다.'};
    if(crew.rocketFlightId)return{ok:false,message:'탐사 중인 대원은 인증할 수 없습니다.'};
    crew.skillPoints--;crew.rocketPilotCertified=true;
    this._event(`${crew.name} 대원이 로켓 조종 인증을 받았습니다.`,'good');
    return{ok:true,message:`${crew.name} 대원이 로켓을 조종할 수 있습니다.`};
  };

  p.assignRocketPilot=function(commandModuleId,crewId){
    if(!this.restoredRules)return{ok:false,message:'조종사 배정은 4.4 기지에서 사용할 수 있어요.'};
    const command=this.buildings.find(b=>b.id===commandModuleId&&b.type==='commandModule');
    if(!command)return{ok:false,message:'로켓 조종 모듈을 선택하세요.'};
    if(command.pilotId!=null){
      const previous=this.crew.find(c=>c.id===command.pilotId);
      if(previous?.rocketFlightId)return{ok:false,message:'탐사 중인 조종사는 교대할 수 없습니다.'};
      if(previous){
        delete previous.rocketBoardedId;
        delete previous.rocketBoardingId;
        delete previous.rocketBoardBlocked;
        delete previous.rocketBoardCell;
        if(previous._job?.kind==='rocketBoard')this._release(previous);
      }
    }
    if(crewId==null){
      const previous=this.crew.find(c=>c.id===command.pilotId);
      if(previous?.rocketBoardedId){delete previous.rocketBoardedId;}
      if(previous?.rocketBoardingId){delete previous.rocketBoardingId;}
      if(previous?.rocketBoardBlocked){delete previous.rocketBoardBlocked;}
      if(previous?.rocketBoardCell){delete previous.rocketBoardCell;}
      if(previous?._job?.kind==='rocketBoard')this._release(previous);
      command.pilotId=null;
      return{ok:true,message:'조종사 배정을 해제했습니다.'};
    }
    const crew=this.crew.find(c=>c.id===crewId);
    if(!crew||crew.health<=0||!crew.rocketPilotCertified)return{ok:false,message:'로켓 조종 인증을 받은 대원을 선택하세요.'};
    if(crew.rocketFlightId)return{ok:false,message:'탐사 중인 대원은 다른 모듈에 배정할 수 없습니다.'};
    const assigned=this.buildings.find(b=>b.type==='commandModule'&&b.pilotId===crewId&&b.id!==command.id);
    if(assigned)return{ok:false,message:'이 대원은 다른 조종 모듈에 배정되어 있습니다.'};
    command.pilotId=crewId;
    delete crew.rocketBoardedId;
    delete crew.rocketBoardingId;
    delete crew.rocketBoardBlocked;
    delete crew.rocketBoardCell;
    return{ok:true,message:`${crew.name} 대원을 조종사로 배정했습니다.`};
  };

  p.setRocketDestination=function(buildingId,distance){
    if(!this.restoredRules||!Number.isInteger(distance)||distance<1)
      return{ok:false,message:'목적지는 1 이상의 정수 거리로 지정하세요.'};
    const state=this.getRocketState(buildingId),engine=state&&this.buildings.find(b=>b.id===state.engineId);
    if(!state||!engine)return{ok:false,message:'연결된 증기 엔진을 찾을 수 없습니다.'};
    if(state.missionState==='inFlight')return{ok:false,message:'탐사 중에는 목적지를 바꿀 수 없습니다.'};
    if(distance>state.maxDistance)return{ok:false,message:'현재 연료와 엔진 추력으로는 그 거리에 도달할 수 없습니다.'};
    engine.selectedDistance=distance;
    if(distance!==1)engine.targetId=null;
    else if(!FIXED_TARGETS.some(target=>target.id===engine.targetId))engine.targetId=0;
    return{ok:true,message:`${distance}번째 거리 목적지를 설정했습니다.`};
  };

  p.setRocketTarget=function(buildingId,targetId){
    if(!this.restoredRules)return{ok:false,message:'4.4 기지에서만 로켓 목적지를 선택할 수 있습니다.'};
    targetId=Number(targetId);
    if(!Number.isInteger(targetId))return{ok:false,message:'선택할 수 없는 천체입니다.'};
    const state=this.getRocketState(buildingId);
    const engine=state&&this.buildings.find(building=>building.id===state.engineId);
    const target=FIXED_TARGETS.find(item=>item.id===targetId);
    if(!engine||!target)return{ok:false,message:'선택할 수 없는 천체입니다.'};
    if(state.missionState==='inFlight')return{ok:false,message:'탐사 중에는 목적지를 바꿀 수 없습니다.'};
    if(target.distance>state.maxDistance)return{ok:false,message:'현재 연료와 엔진 추력으로는 그 천체에 도달할 수 없습니다.'};
    engine.targetId=target.id;
    engine.selectedDistance=target.distance;
    return{ok:true,message:`${target.name} 목적지를 설정했습니다.`};
  };

  p.launchResearchFlight=function(buildingId,distance){
    if(!this.modernRules||this.lost)return{ok:false,message:'가동 가능한 연구 로켓이 필요합니다.'};
    if(this.restoredRules){
      const state=this.getRocketState(buildingId);
      const engine=state&&this.buildings.find(b=>b.id===state.engineId);
      if(!engine||!state)return{ok:false,message:'연결된 증기 엔진을 찾을 수 없습니다.'};
      if(distance!==undefined){const selected=this.setRocketDestination(engine.id,distance);if(!selected.ok)return selected;}
      const current=this.getRocketState(engine.id);
      if(!current.ready)return{ok:false,message:current.reason};
      const assembly=this._rocketAssemblyForEngine(engine),pilot=this.crew.find(c=>c.id===assembly.command.pilotId);
      this._release(pilot);
      delete pilot.rocketBoardedId;
      delete pilot.rocketBoardingId;
      delete pilot.rocketBoardBlocked;
      delete pilot.rocketBoardCell;
      pilot.rocketFlightId=engine.id;
      pilot.rocketDeparture={x:pilot.x,y:pilot.y};
      engine.flightPilotId=pilot.id;
      engine.flightStartedAt=this.time;
      engine.flightDistance=current.selectedDistance;
      engine.flightTargetId=current.targetId;
      engine.flightDurationSeconds=current.flightDurationSeconds;
      engine.flightFuelKg=engine.steamFuel||0;
      engine.returnAt=this.time+current.flightDurationSeconds;
      engine.missionState='inFlight';
      engine.status='천체 탐사 중';
      this._event(`연구 로켓 출항 · 거리 ${current.selectedDistance} · 귀환까지 ${Math.round(current.flightDurationSeconds)}초`,'good');
      return{ok:true,message:'로켓이 우주로 출항했습니다.',engineId:engine.id,returnAt:engine.returnAt};
    }

    const b=this.buildings.find(item=>item.id===buildingId);
    if(!b||b.type!=='steamRocket'||b.progress<1||!b.enabled)return{ok:false,message:'가동 가능한 연구 로켓이 필요합니다.'};
    if(b.returnAt>0)return{ok:false,message:'천체 탐사 중입니다.'};
    if(this.tasks.some(t=>t.type==='deconstruct'&&t.buildingId===b.id))return{ok:false,message:'해체 예정인 로켓입니다.'};
    if((b.steamFuel||0)<LEGACY_FUEL_KG-1e-8)return{ok:false,message:'연료 포트에 증기 100 kg을 공급하세요.'};
    b.steamFuel=0;b.returnAt=this.time+LEGACY_FLIGHT_SECONDS;
    return{ok:true,message:'연구 로켓이 출항했습니다.'};
  };

  p._finishUtilities=function(dt){
    base.finish.call(this,dt);
    if(!this.modernRules)return;
    for(const engine of this.buildings.filter(b=>b.type==='steamRocket'&&b.progress>=1)){
      if(!this.restoredRules){
        if(engine.returnAt>0){
          if(this.time+1e-8<engine.returnAt){engine.active=true;engine.status='천체 탐사 중';continue;}
          const reward=collectResearchReward(this,1,1);
          engine.returnAt=0;
          this._event(`연구 로켓 귀환 · 데이터뱅크 ${reward} kg`,'good');
        }
        if(!engine.enabled||this.tasks.some(t=>t.type==='deconstruct'&&t.buildingId===engine.id))continue;
        const port=buildingPort(engine,'gasIn'),pipe=port&&this.cell(port.x,port.y),packet=pipe?.gasPacket;
        if(packet?.element==='steam'&&pipe.gasPipe){
          const used=Math.min(packet.mass,10*dt,LEGACY_FUEL_KG-(engine.steamFuel||0));
          engine.steamFuel=(engine.steamFuel||0)+used;packet.mass-=used;
          if(packet.mass<=1e-9)pipe.gasPacket=null;
        }
        engine.status=engine.steamFuel>=LEGACY_FUEL_KG-1e-8?'출항 준비 완료':'증기 연료 대기';
        continue;
      }

      const assembly=this._rocketAssemblyForEngine(engine);
      if(engine.returnAt>0){
        if(this.time+1e-8<engine.returnAt){engine.active=true;engine.missionState='inFlight';engine.status='천체 탐사 중';continue;}
          const reward=collectResearchReward(this,engine.flightDistance||engine.selectedDistance||1,
            assembly.researchModules.length,engine.flightTargetId??engine.targetId);
        engine.steamFuel=0;engine.flightFuelKg=0;engine.returnAt=0;engine.missionState='grounded';engine.active=false;
        engine.flightTargetId=null;
        const pilot=this.crew.find(c=>c.id===engine.flightPilotId);
        if(pilot){
          const landing=arrivalCell(this,engine);
          pilot.x=landing.x+.5;pilot.y=landing.y+.5;
          delete pilot.rocketFlightId;delete pilot.rocketDeparture;
          pilot.action='탐사를 마치고 귀환';
        }
        engine.flightPilotId=null;
        this._event(`연구 로켓 귀환 · 데이터뱅크 ${reward} kg`,'good');
      }

      if(!engine.enabled||engine.returnAt>0||this.tasks.some(t=>t.type==='deconstruct'&&t.buildingId===engine.id))continue;
      const port=buildingPort(engine,'gasIn'),pipe=port&&this.cell(port.x,port.y),packet=pipe?.gasPacket;
      if(packet?.element==='steam'&&pipe.gasPipe){
        const capacity=engine.fuelCapacityKg||ENGINE_FUEL_CAPACITY_KG;
        const used=Math.min(packet.mass,ENGINE_FUEL_RATE_KG_S*dt,capacity-(engine.steamFuel||0));
        engine.steamFuel=(engine.steamFuel||0)+used;packet.mass-=used;
        if(packet.mass<=1e-9)pipe.gasPacket=null;
      }
      const state=this.getRocketState(engine.id);
      engine.status=state?.ready?'출항 준비 완료':state?.reason||'로켓 점검 중';
    }
  };

  p._crewStep=function(crew,dt){
    if(this.restoredRules&&crew.rocketFlightId){
      const engine=this.buildings.find(b=>b.id===crew.rocketFlightId&&b.type==='steamRocket');
      if(engine?.returnAt>this.time){crew.action='우주 탐사 중';return;}
      delete crew.rocketFlightId;delete crew.rocketDeparture;
    }
    if(this.restoredRules&&crew.rocketBoardedId!=null){
      const command=this.buildings.find(b=>b.type==='commandModule'&&b.pilotId===crew.id);
      const engine=command&&this._rocketEngineForBuilding(command);
      if(engine?.id===crew.rocketBoardedId){crew.action='로켓 승선 대기';return;}
      delete crew.rocketBoardedId;
    }
    if(this.restoredRules&&crew.health>0){
      const command=this.buildings.find(b=>b.type==='commandModule'&&b.pilotId===crew.id);
      const engine=command&&this._rocketEngineForBuilding(command);
      if(command&&engine&&command.progress>=1){
        const goals=this._workGoals(command.x,command.y,false);
        const path=this._path(crew,goals);
        if(path===null){
          delete crew.rocketBoardingId;
          delete crew.rocketBoardCell;
          crew.rocketBoardBlocked=true;
          if(crew._job?.kind==='rocketBoard')this._release(crew);
          return base.crewStep.call(this,crew,dt);
        }

        delete crew.rocketBoardBlocked;
        crew.rocketBoardingId=engine.id;
        crew.rocketBoardCell=path.at(-1)||{x:Math.floor(crew.x),y:Math.floor(crew.y)};
        if(crew.rocketBoardedId===engine.id){
          if(crew._job?.kind!=='rocketBoard')this._assign(crew,'rocketBoard',[],{targetId:command.id});
          crew.action='로켓 승선 대기';
          const result=base.crewStep.call(this,crew,dt);
          if(crew._job?.kind!=='rocketBoard')delete crew.rocketBoardedId;
          return result;
        }

        if(['breathe','eat','rest'].includes(crew._job?.kind))
          return base.crewStep.call(this,crew,dt);
        if(crew._job?.kind!=='rocketBoard'||crew._job.targetId!==command.id){
          this._release(crew);
          this._assign(crew,'rocketBoard',path,{targetId:command.id});
        }else{
          crew._job.path=path;
          crew.path=path;
        }
        const atBoardingCell=path.length===0;
        if(atBoardingCell){
          crew.rocketBoardedId=engine.id;
          crew.action='로켓 승선 대기';
        }
        const result=base.crewStep.call(this,crew,dt);
        if(crew._job?.kind!=='rocketBoard')delete crew.rocketBoardedId;
        return result;
      }
    }
    return base.crewStep.call(this,crew,dt);
  };

  p.canPlace=function(tool,x,y,...args){
    if(!this.modernRules&&(tool==='steamRocket'||tool==='researchModule'||tool==='commandModule'))
      return{ok:false,message:'로켓 설비는 원작 규칙 기지에서만 설치할 수 있어요.'};
    if(this.modernRules&&!this.restoredRules&&(tool==='researchModule'||tool==='commandModule'))
      return{ok:false,message:'연구·조종 모듈은 4.4 기지에서 사용할 수 있어요.'};
    if(this.restoredRules&&(tool==='researchModule'||tool==='commandModule')){
      const parentTypes=['steamRocket','researchModule'];
      const target={type:tool,x,y,rotation:args[0]||0};
      const attachable=buildingAttachableCell(target);
      const host=this.buildings.find(b=>parentTypes.includes(b.type)&&b.progress>0
        &&!this.tasks.some(task=>task.type==='deconstruct'&&task.buildingId===b.id)
        &&sameCell(buildingAttachmentPoint(b),attachable));
      if(!host)return{ok:false,message:tool==='researchModule'
        ?'증기 엔진 위 연결점에 로켓 연구 모듈을 설치하세요.'
        :'연구 모듈 위 연결점에 로켓 조종 모듈을 설치하세요.'};
    }
    const selected=this._buildingAt(x,y);
    if(this.restoredRules&&['cancel','deconstruct'].includes(tool)&&isRocketStructure(selected)
      &&hasAttachedRocketChild(this,selected))
      return{ok:false,message:'위쪽 로켓 부품과 도면부터 취소하거나 해체하세요.'};
    if(this.modernRules&&tool==='deconstruct'&&isRocketStructure(selected)){
      const engine=this._rocketEngineForBuilding(selected);
      const state=engine&&this.getRocketState(engine.id);
      if(engine?.returnAt>0||this.restoredRules&&(engine?.steamFuel>0||state?.missionState==='inFlight'))
        return{ok:false,message:'연료를 사용하고 로켓이 귀환한 후 해체하세요.'};
    }
    return base.place.call(this,tool,x,y,...args);
  };

  p.inspect=function(x,y){
    const result=base.inspect.call(this,x,y),building=result.building;
    if(isRocketStructure(building)){
      const state=this.getRocketState(building.id);
      if(this.restoredRules&&state){
        result.lines.unshift(`증기 ${state.steamFuelKg.toFixed(1)} / ${state.fuelCapacityKg} kg`);
        result.lines.push(state.missionState==='inFlight'?`귀환까지 ${Math.ceil(state.timeLeftSeconds)}초`:`로켓 상태 · ${state.reason||'발사 가능'}`);
        if(state.commandId)result.lines.push(`목적지 ${state.selectedDistance} · 최대 거리 ${state.maxDistance}`);
        result.lines.push(`데이터뱅크 ${Number(this.resources.dataBank||0).toFixed(1)} kg · 탐사 ${this.resources.researchFlights||0}회`);
      }else if(building.type==='steamRocket'){
        result.lines.unshift(`증기 ${(building.steamFuel||0).toFixed(1)} / ${LEGACY_FUEL_KG} kg`);
        result.lines.push(`데이터뱅크 비축 ${(this.resources.dataBank||0).toFixed(1)} kg · 탐사 ${this.resources.researchFlights||0}회`);
      }
    }
    return result;
  };

  p.load=function(save){
    if(save?.ruleset==='oni-4.3'){
      const {dataBank=0,researchFlights=0}=save.resources||{};
      if(!Number.isFinite(dataBank)||dataBank<0||!Number.isSafeInteger(researchFlights)||researchFlights<0)
        throw new Error('우주 탐사 기록이 올바르지 않습니다.');
      for(const b of save.buildings||[])if(b.type==='steamRocket'){
        const {steamFuel=0,returnAt=0}=b;
        if(!Number.isFinite(steamFuel)||steamFuel<0||steamFuel>LEGACY_FUEL_KG+1e-8
          ||!Number.isFinite(returnAt)||returnAt<0||returnAt>save.time+LEGACY_FLIGHT_SECONDS+1e-6
          ||returnAt>0&&steamFuel>0)throw new Error('연구 로켓 상태가 올바르지 않습니다.');
      }
    }
    if(save?.ruleset==='oni-4.4'){
      const {dataBank=0,researchFlights=0}=save.resources||{};
      if(!Number.isFinite(dataBank)||dataBank<0||!Number.isSafeInteger(researchFlights)||researchFlights<0)
        throw new Error('우주 탐사 기록이 올바르지 않습니다.');
      const opportunities=save.resources?.researchOpportunitiesByDestination||{};
      if(!opportunities||typeof opportunities!=='object'||Array.isArray(opportunities)
        ||Object.entries(opportunities).some(([key,count])=>!(/^(fixed:[01]|distance:[1-9]\d*)$/.test(key))
          ||!Number.isSafeInteger(count)||count<0||count>RESEARCH_OPPORTUNITIES))
        throw new Error('목적지 연구 기회 정보가 올바르지 않습니다.');
      const ids=new Set((save.crew||[]).map(c=>c.id));
      const engines=(save.buildings||[]).filter(b=>b.type==='steamRocket');
      for(const b of engines){
        const capacity=b.fuelCapacityKg??ENGINE_FUEL_CAPACITY_KG,returnAt=b.returnAt??0;
        if(!Number.isFinite(b.steamFuel)||b.steamFuel<0||!Number.isFinite(capacity)||capacity!==ENGINE_FUEL_CAPACITY_KG
          ||b.steamFuel>capacity+1e-8||!Number.isFinite(returnAt)||returnAt<0
          ||returnAt>save.time+1e9||!Number.isInteger(b.selectedDistance)||b.selectedDistance<1
          ||!['grounded','inFlight'].includes(b.missionState??'grounded')
          ||b.targetId!=null&&!FIXED_TARGETS.some(target=>target.id===b.targetId)
          ||b.flightTargetId!=null&&!FIXED_TARGETS.some(target=>target.id===b.flightTargetId)
          ||(returnAt>0)!==(b.missionState==='inFlight')||returnAt>0&&(!ids.has(b.flightPilotId)||b.steamFuel<=0))
          throw new Error('4.4 로켓 상태가 올바르지 않습니다.');
      }
      for(const b of (save.buildings||[]))if(b.type==='commandModule'
        &&b.pilotId!=null&&!ids.has(b.pilotId))throw new Error('로켓 조종사 정보가 올바르지 않습니다.');
      for(const c of (save.crew||[])){
        if('rocketPilotCertified'in c&&typeof c.rocketPilotCertified!=='boolean')throw new Error('조종 인증 정보가 올바르지 않습니다.');
        if(c.rocketFlightId!=null&&!engines.some(b=>b.id===c.rocketFlightId&&b.flightPilotId===c.id))
          throw new Error('탐사 중인 대원 정보가 올바르지 않습니다.');
        for(const field of ['rocketBoardedId','rocketBoardingId'])if(c[field]!=null){
          const engine=engines.find(item=>item.id===c[field]);
          const command=(save.buildings||[]).find(item=>item.type==='commandModule'&&item.pilotId===c.id);
          const assembly=engine?attachedAssembly({buildings:save.buildings||[],h:save.h},engine):null;
          if(!engine||assembly?.command?.id!==command?.id
            ||field==='rocketBoardedId'&&c.rocketFlightId!=null)
            throw new Error('로켓 승선 정보가 올바르지 않습니다.');
        }
        if('rocketBoardBlocked'in c&&typeof c.rocketBoardBlocked!=='boolean')
          throw new Error('로켓 입구 경로 정보가 올바르지 않습니다.');
        if(c.rocketBoardCell!=null&&(!Number.isInteger(c.rocketBoardCell.x)
          ||!Number.isInteger(c.rocketBoardCell.y)||c.rocketBoardCell.x<0||c.rocketBoardCell.y<0
          ||c.rocketBoardCell.x>=save.w||c.rocketBoardCell.y>=save.h))
          throw new Error('로켓 입구 좌표가 올바르지 않습니다.');
      }
    }
    const result=base.load.call(this,save);
    if(result&&this.restoredRules){
      for(const b of this.buildings){
        if(b.type==='steamRocket'){
          b.fuelCapacityKg??=ENGINE_FUEL_CAPACITY_KG;b.steamFuel??=0;b.returnAt??=0;
          b.selectedDistance??=1;b.targetId??=0;b.missionState??='grounded';b.flightPilotId??=null;
          b.flightTargetId??=null;
        }
        if(b.type==='commandModule')b.pilotId??=null;
      }
      this.resources.researchOpportunitiesByDestination??={};
    }
    return result;
  };
}
