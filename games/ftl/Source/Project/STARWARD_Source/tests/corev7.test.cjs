'use strict';

// Isolated rules use bounded fixtures. Whole campaigns use only public commands
// in tests/playthrough.cjs. Rendering consumes these states without simulation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ctx = vm.createContext({console});
for (const file of ['data.js','engine.js','campaign.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist',file),'utf8'),ctx,{filename:file});
const SW=ctx.Starward,copy=x=>JSON.parse(JSON.stringify(x));
const fresh=(id='argo',seed=42)=>new SW.Game(seed,{loadoutId:id,difficulty:'standard'});
const advance=(g,seconds)=>{for(let i=0;i<Math.ceil(seconds*30);i++)g.tick(1/30);};
function until(g,predicate,seconds=40){for(let i=0;!predicate()&&i<seconds*30;i++)g.tick(1/30);assert.ok(predicate(),'condition reached within '+seconds+'s');}
function quiet(extra={}){const g=fresh();g.startRun();g.startCombat({name:'v7 rule vessel',layoutId:'interceptor_v7',hull:100,reactor:20,shieldLayers:0,engineLevel:0,crewCount:0,weaponDefs:['heavy_laser'],...extra});for(const ship of [g.state.player,g.state.enemy])for(const w of ship.weapons){w.auto=false;w.fireMode='manual';}g.state.enemy.weapons.forEach(w=>w.enabled=false);g.state.enemy.aiTimer=10000;g.setPaused(false);return g;}
function place(g,c,ship,roomId,x,y){const tiles=g.getShipTiles(ship.id).filter(t=>t.roomId===roomId);const tile=x===undefined?tiles.find(t=>!g.getCrewOnShip(ship.id).some(o=>o!==c&&g.getEffectiveFaction(o)===g.getEffectiveFaction(c)&&o.tileX===t.tileX&&o.tileY===t.tileY)):tiles.find(t=>t.tileX===x&&t.tileY===y);assert.ok(tile,'fixture tile');Object.assign(c,{shipId:ship.id,roomId,tileX:tile.tileX,tileY:tile.tileY,x:tile.x,y:tile.y,tilePath:[],targetTile:null,tileTransit:null,legacyTileTransition:null,movePath:[],targetRoomId:null,attackTargetId:null,attackCooldown:0,attackFlash:0});return tile;}
function denied(g,fn){const before=g.serialize();assert.equal(fn().ok,false);assert.equal(g.serialize(),before,'denial is atomic');}
function roundtrip(g){const loaded=fresh();assert.equal(loaded.load(g.serialize()),true);return loaded;}
function reject(g,change){const snapshot=g.serialize(),bad=JSON.parse(snapshot);change(bad);assert.equal(g.load(bad),false);assert.equal(g.serialize(),snapshot);}
function shot(g,roomId,type='missile',damage=1){g.state.projectiles.push({id:g._id('fixture-shot'),from:'player',weaponType:type,sourceRoom:'weapons',targetRoom:roomId,targetRooms:[roomId],progress:.99,travel:.1,damage:type==='ion'?0:damage,ionDamage:type==='ion'?1:0,ionDuration:type==='ion'?5:0,miss:false,shieldPierce:type==='missile',delay:0,beamStart:null,beamEnd:null});advance(g,1/30);}

test('five new hulls have twelve physical rooms, connected cardinal doors and independent mounting bays',()=>{
  for(const hull of ['argo','atlas','wraith','interceptor','flagship']){
    const g=fresh(),ship=hull==='argo'?g.state.player:g.makeShip({enemy:hull==='interceptor'||hull==='flagship',layoutId:hull+'_v7'}),layout=g.getLayout(ship);
    assert.equal(ship.rooms.length,12);assert.equal(g.getSystemSlots(ship).length,6);
    for(const room of layout.rooms){assert.ok(g._path(ship,layout.rooms[0].id,room.id)!==null);assert.ok(g._tileDefinitions(ship).some(t=>t.roomId===room.id));}
    for(const door of layout.doors.filter(d=>!d.airlock)){assert.equal(Math.abs(door.tileA.x-door.tileB.x)+Math.abs(door.tileA.y-door.tileB.y),1);assert.ok(g._tileDoor(ship,door.tileA,door.tileB));}
    const mounted=Object.values(ship.aux).filter(s=>s.level>0);assert.equal(new Set(mounted.map(s=>s.roomId)).size,mounted.length);
    for(const system of mounted){assert.equal(g.getRoomSystem(ship,system.roomId).id,system.id);assert.equal(g.getSystemRoom(ship,system.id),system.roomId);}
    assert.ok(g.getSystemSlots(ship).some(slot=>slot.unlocked&&!slot.systemId));
  }
});

test('explicit historical hulls remain six-room geometry and cannot invent a new mount',()=>{
  const g=fresh();for(const id of ['legacy','argo','atlas','wraith','interceptor','flagship']){const ship=g.makeShip({enemy:true,layoutId:id});assert.equal(ship.layoutId,id);assert.equal(ship.rooms.length,6);assert.deepEqual(copy(g.getSystemSlots(ship)),[]);}
});

test('installation queries are pure and installs cost once, start unpowered and name the actual bay',()=>{
  const g=fresh(),before=g.serialize(),slot=g.getSystemSlots().find(s=>s.unlocked&&!s.systemId);
  assert.equal(g.getSystemInstallStatus(slot.id,'hacking').ok,true);assert.equal(g.getInstallableSystems(slot.id).length,6);assert.equal(g.serialize(),before);
  const scrap=g.state.resources.scrap;assert.equal(g.installSystem(slot.id,'hacking').ok,true);assert.equal(g.state.resources.scrap,scrap-55);
  assert.equal(g.state.player.aux.hacking.level,1);assert.equal(g.state.player.aux.hacking.power,0);assert.equal(g.getRoomSystem('player',slot.roomId).id,'hacking');
  denied(g,()=>g.installSystem(slot.id,'hacking'));
  for(const id of ['constructor','__proto__','missing',null]){denied(g,()=>g.installSystem('bay5',id));denied(g,()=>g.upgradeSystem(id));}
  roundtrip(g);
});

test('ordered expansion consumes 40 then 60 and a locked room is already physically walkable',()=>{
  const g=fresh();g.state.resources.scrap=200;assert.equal(g.getShipTiles().filter(t=>t.roomId==='bay5').length,4);
  denied(g,()=>g.expandSystemSlot('bay6'));assert.equal(g.expandSystemSlot('bay5').ok,true);assert.equal(g.state.resources.scrap,160);
  assert.equal(g.expandSystemSlot('bay6').ok,true);assert.equal(g.state.resources.scrap,100);denied(g,()=>g.expandSystemSlot('bay6'));roundtrip(g);
});

test('combat and events forbid mounting, expansion and upgrades without spending anything',()=>{
  const g=quiet();g.state.resources.scrap=500;
  for(const mode of ['combat','event']){g.state.mode=mode;denied(g,()=>g.installSystem('bay4','hacking'));denied(g,()=>g.expandSystemSlot('bay5'));denied(g,()=>g.upgradeSystem('teleporter'));}
});

test('auxiliary upgrades retain position, obey maxima and leave reactor allocation explicit',()=>{
  const g=fresh();g.state.resources.scrap=500;const s=g.state.player.aux.teleporter,pos=s.roomId,power=s.power;
  assert.equal(g.upgradeSystem('teleporter').ok,true);assert.equal(s.level,2);assert.equal(s.power,power);assert.equal(s.roomId,pos);
  assert.equal(g.upgradeSystem('teleporter').ok,true);assert.equal(s.level,3);denied(g,()=>g.upgradeSystem('teleporter'));assert.equal(g.state.resources.scrap,440);roundtrip(g);
});

test('an installed bay takes its own damage and the engineer repairs that real host room',()=>{
  const g=quiet({crewCount:2}),enemy=g.state.enemy,engineer=enemy.crew[1],host=g.getSystemRoom(enemy,'drones');
  place(g,engineer,enemy,host);const weaponsDamage=enemy.systems.weapons.damage;shot(g,host,'missile',1);
  assert.equal(enemy.aux.drones.damage,1);assert.equal(enemy.systems.weapons.damage,weaponsDamage);
  until(g,()=>enemy.aux.drones.damage===0,5);assert.equal(engineer.roomId,host);roundtrip(g);
});

test('empty bays accept missiles and beams, while an unshielded ion has no phantom system to lock',()=>{
  const g=quiet(),enemy=g.state.enemy,empty='bay6',hull=enemy.hull,systems=copy({...enemy.systems,...enemy.aux});
  assert.equal(g.getRoomSystem(enemy,empty),null);shot(g,empty,'ion');assert.equal(enemy.hull,hull);assert.deepEqual(copy({...enemy.systems,...enemy.aux}),systems);
  shot(g,empty,'missile',2);assert.equal(enemy.hull,hull-2);
  g.state.player.weapons.push({...copy(SW.DATA.weapons.beam),id:'v7-test-beam',charge:0,enabled:false,powered:false,auto:false,manualQueued:false,fireMode:'manual',target:null,beamFrom:null,beamTo:null,beamStart:null,beamEnd:null,targetRooms:[]});
  const beam=g.state.player.weapons.at(-1);assert.equal(g.targetBeam(beam.id,'bay4','bay6').ok,true);assert.ok(beam.targetRooms.includes('bay5'));roundtrip(g);
  shot(g,empty,'beam',2);assert.equal(enemy.hull,hull-4);roundtrip(g);
});

test('ion target resolution uses the mounted auxiliary system instead of the bay ID',()=>{
  const g=quiet(),enemy=g.state.enemy,host=g.getSystemRoom(enemy,'teleporter');enemy.aux.teleporter.power=1;enemy.aux.teleporter.desiredPower=1;
  shot(g,host,'ion');assert.equal(enemy.aux.teleporter.ionStacks,1);assert.equal(enemy.aux.teleporter.power,0);assert.equal(enemy.systems.medbay.ionStacks,0);roundtrip(g);
});

test('real tile movement stays cardinal, crosses physical rooms and ends on the requested center',()=>{
  const g=quiet(),c=g.state.player.crew[0],goal=g.getShipTiles().find(t=>t.roomId==='bay6'),start={x:c.x,y:c.y};
  g.setPaused(true);assert.equal(g.moveCrewToTile(c.id,goal.tileX,goal.tileY,'player').ok,true);assert.equal(c.x,start.x);assert.equal(c.y,start.y);
  const route=g.getCrewRoute(c.id);assert.ok(route.distance>0);for(let i=1;i<route.points.length;i++)assert.ok(route.points[i].x===route.points[i-1].x||route.points[i].y===route.points[i-1].y);
  g.setPaused(false);for(let i=0;c.movePath.length&&i<1800;i++){const old={x:c.x,y:c.y};g.tick(1/30);assert.ok(Math.abs(c.x-old.x)<1e-7||Math.abs(c.y-old.y)<1e-7);const room=g.state.player.rooms.find(r=>r.id===c.roomId);assert.ok(c.x>=room.x-1e-7&&c.x<=room.x+room.w+1e-7&&c.y>=room.y-1e-7&&c.y<=room.y+room.h+1e-7);}
  assert.equal(c.movePath.length,0);assert.equal(c.x,goal.x);assert.equal(c.y,goal.y);roundtrip(g);
});

test('friendly occupancy and destination reservations reject duplicate tile orders atomically',()=>{
  const g=quiet(),[a,b]=g.state.player.crew,goal=g.getShipTiles().find(t=>t.roomId==='bay4');
  denied(g,()=>g.moveCrewToTile(a.id,b.tileX,b.tileY,'player'));assert.equal(g.moveCrewToTile(a.id,goal.tileX,goal.tileY,'player').ok,true);
  denied(g,()=>g.moveCrewToTile(b.id,goal.tileX,goal.tileY,'player'));assert.equal(g.getShipTiles().find(t=>t.id===goal.id).reservedBy,a.id);
  until(g,()=>!a.movePath.length);assert.equal(g.moveCrew(b.id,'bay4'),true);until(g,()=>!b.movePath.length);assert.notEqual(a.tileX+','+a.tileY,b.tileX+','+b.tileY);roundtrip(g);
});

test('paused in-flight retargeting preserves coordinates and the next tick resumes the same edge',()=>{
  const g=quiet(),c=g.state.player.crew[0];g.moveCrew(c.id,'bay6');advance(g,.4);g.setPaused(true);const pos={x:c.x,y:c.y};
  assert.equal(g.moveCrew(c.id,'engines'),true);assert.equal(c.x,pos.x);assert.equal(c.y,pos.y);const restored=roundtrip(g);restored.setPaused(false);restored.tick(1/30);const moved=restored.state.player.crew.find(x=>x.id===c.id);assert.ok(Math.hypot(moved.x-pos.x,moved.y-pos.y)<=SW.DATA.crewTypes[c.species].moveSpeed/30+1e-7);
});

test('new teleporter staging belongs to its physical bay and sends distinct occupied tile positions',()=>{
  const g=quiet(),ship=g.state.player,party=ship.crew.slice(0,2);g.allocatePower('engines',-2);assert.equal(g.allocatePower('teleporter',1),true);
  for(const c of party)place(g,c,ship,'medbay');assert.equal(g.getTeleportStatus('send',party.map(c=>c.id),'bay4').code,'NOT_STAGED');
  assert.equal(g.stageTeleport(party.map(c=>c.id)).ok,true);until(g,()=>party.every(c=>!c.movePath.length),20);
  assert.ok(party.every(c=>c.roomId===ship.teleportRoomId));assert.equal(g.teleportCrew(party.map(c=>c.id),'bay4').ok,true);assert.equal(new Set(party.map(c=>c.tileX+','+c.tileY)).size,2);roundtrip(g);
});

test('explicit melee approaches diagonally separated opponents before the first actual strike',()=>{
  const g=quiet({crewCount:2}),ship=g.state.player,c=ship.crew[0],enemy=g.state.enemy.crew[1],room=ship.rooms.find(r=>r.id==='bay4');
  place(g,c,ship,room.id,room.x,room.y);place(g,enemy,ship,room.id,room.x+1,room.y+1);const hp=enemy.hp,xp=c.skills.combat;
  assert.equal(g.attackCrew(c.id,enemy.id).ok,true);advance(g,1/30);assert.equal(enemy.hp,hp,'no remote diagonal hit');
  until(g,()=>enemy.hp<hp,3);assert.ok(Math.abs(c.x-enemy.x)+Math.abs(c.y-enemy.y)<=1.000001);assert.ok(c.skills.combat>xp);assert.ok(c.attackFlash>0);assert.equal(g.getCrewCombatStatus(c.id).state,'attacking');roundtrip(g);
});

test('a wall and closed door cannot transmit melee, and actual passage enables contact',()=>{
  const g=quiet({crewCount:2}),ship=g.state.player,c=ship.crew[0],enemy=g.state.enemy.crew[1],door=ship.doors.find(d=>d.a==='bay4'&&d.b==='bay5');
  place(g,c,ship,door.a,door.tileA.x,door.tileA.y);place(g,enemy,ship,door.b,door.tileB.x,door.tileB.y);const hp=enemy.hp;
  advance(g,.1);assert.equal(enemy.hp,hp);assert.equal(c.attackFlash,0);
  assert.equal(g.attackCrew(c.id,enemy.id).ok,true);advance(g,.1);assert.equal(enemy.hp,hp,'cannot hit through the closed leaf');until(g,()=>enemy.hp<hp,3);assert.ok(door.open||door.hp===0);
});

test('manual retreat cancels pursuit and friendly or offship attack commands are atomic failures',()=>{
  const g=quiet({crewCount:2}),c=g.state.player.crew[0],other=g.state.player.crew[1],target=g.state.enemy.crew[1];
  denied(g,()=>g.attackCrew(c.id,other.id));denied(g,()=>g.attackCrew(c.id,target.id));place(g,target,g.state.player,'bay6');assert.equal(g.attackCrew(c.id,target.id).ok,true);
  const safe=g.getShipTiles().find(t=>t.roomId==='oxygen'&&!t.occupiedBy&&!t.reservedBy);assert.equal(g.moveCrewToTile(c.id,safe.tileX,safe.tileY).ok,true);assert.equal(c.attackTargetId,null);roundtrip(g);
});

test('melee uses species damage, one-second cooldown, actual death and no remote repair during combat',()=>{
  const g=quiet({crewCount:3}),ship=g.state.player,c=ship.crew[2],target=g.state.enemy.crew[1],room=ship.rooms.find(r=>r.id==='bay4');
  place(g,c,ship,room.id,room.x,room.y);place(g,target,ship,room.id,room.x+1,room.y);target.hp=3;
  assert.equal(g.attackCrew(c.id,target.id).ok,true);advance(g,1/30);assert.equal(target.hp,0);assert.equal(c.attackTargetId,null);assert.ok(c.skills.combat>0);assert.equal(target.tilePath.length,0);roundtrip(g);
});

test('hacking rejects empty bays and locks the actual auxiliary doorway host',()=>{
  const g=fresh('atlas');g.state.player.reactor=20;g.allocatePower('hacking',1);g.startRun();g.state.enemy.weapons.forEach(w=>w.enabled=false);g.state.enemy.aiTimer=10000;g.setPaused(false);
  denied(g,()=>g.launchHacking('bay6'));const host=g.getSystemRoom(g.state.enemy,'teleporter');assert.equal(g.launchHacking(host).ok,true);until(g,()=>g.state.player.hacking.phase==='attached',3);
  assert.ok(g.state.enemy.doors.filter(d=>d.a===host||d.b===host).every(d=>g.getDoorLockOwner('enemy',d.id)==='player'));assert.equal(g.activateHacking().ok,true);roundtrip(g);
});

test('malformed room mounts, movement shortcuts, tile coordinates and attack references are rejected atomically',()=>{
  const g=quiet({crewCount:2});
  for(const change of [s=>s.player.aux.drones.roomId='weapons',s=>s.player.aux.teleporter.roomId='bay1',s=>s.player.aux.mind.roomId='bay4',s=>s.player.systemSlots[0].unlocked=false,s=>s.player.systemSlots[5].unlocked=true,s=>s.player.crew[0].tileX=.5,s=>s.player.crew[0].x+=.3,s=>s.player.crew[0].attackCooldown=2,s=>s.player.crew[0].attackTargetId=s.player.crew[1].id,s=>{const c=s.player.crew[0];c.tilePath=[{x:0,y:7}];c.targetTile={x:0,y:7};c.movePath=['bay4'];c.targetRoomId='bay4';},s=>s.player.crew[0].legacyTileTransition={roomId:'bridge',targetRoomId:null,pending:true,originX:0,originY:0}])reject(g,change);
});

test('actual tile pursuit roundtrips with its target, movement clocks and RNG intact',()=>{
  const g=quiet({crewCount:2}),c=g.state.player.crew[0],target=g.state.enemy.crew[1];place(g,target,g.state.player,'bay6');assert.equal(g.attackCrew(c.id,target.id).ok,true);advance(g,.3);
  const h=roundtrip(g);assert.equal(h.serialize(),g.serialize());advance(g,.5);advance(h,.5);assert.equal(h.serialize(),g.serialize());
});

test('mind control clears other crew pursuit references and separates a newly friendly shared tile by walking',()=>{
  const g=fresh();assert.equal(g.installSystem('bay4','mind').ok,true);g.allocatePower('engines',-1);g.allocatePower('mind',1);g.startRun();
  const hero=g.state.player.crew[0],foe=g.state.enemy.crew[0];place(g,foe,g.state.player,hero.roomId,hero.tileX,hero.tileY);
  assert.equal(g.attackCrew(hero.id,foe.id).ok,true);const location={x:foe.x,y:foe.y};assert.equal(g.activateMindControl(foe.id).ok,true);
  assert.equal(hero.attackTargetId,null);assert.equal(foe.x,location.x);assert.equal(foe.y,location.y);assert.ok(foe.tilePath.length>0);roundtrip(g);
  g.setPaused(false);until(g,()=>!foe.movePath.length,3);assert.notEqual(hero.tileX+','+hero.tileY,foe.tileX+','+foe.tileY);roundtrip(g);
});

test('a changed allegiance reverses a blocked in-flight approach without teleporting or getting stuck',()=>{
  const g=fresh();g.installSystem('bay4','mind');g.allocatePower('engines',-1);g.allocatePower('mind',1);g.startRun();
  const ship=g.state.player,hero=ship.crew[0],foe=g.state.enemy.crew[0],room=ship.rooms.find(r=>r.id==='bay4');
  place(g,hero,ship,room.id,room.x,room.y);place(g,foe,ship,room.id,room.x+1,room.y);
  // A hostile unit may approach an enemy-occupied tile. Conversion changes that reservation's faction.
  assert.equal(g._orderTile(ship,foe,hero.tileX,hero.tileY,false),true);g._advanceCrew(ship,foe,.2,SW.DATA.crewTypes[foe.species]);
  const location={x:foe.x,y:foe.y};assert.ok(foe.tileTransit);assert.equal(g.activateMindControl(foe.id).ok,true);assert.equal(foe.x,location.x);assert.equal(foe.y,location.y);roundtrip(g);
  g.setPaused(false);until(g,()=>!foe.tileTransit&&!foe.tilePath.length,3);assert.notEqual(hero.tileX+','+hero.tileY,foe.tileX+','+foe.tileY);roundtrip(g);
});

test('recall clears the enemy pursuer immediately so a paused post-transport save remains valid',()=>{
  const g=quiet({crewCount:2}),boarder=g.state.player.crew[0],guard=g.state.enemy.crew[0];
  place(g,boarder,g.state.enemy,guard.roomId);guard.attackTargetId=boarder.id;g.allocatePower('engines',-1);g.allocatePower('teleporter',1);g.setPaused(true);roundtrip(g);
  assert.equal(g.recallCrew([boarder.id]).ok,true);assert.equal(boarder.shipId,'player');assert.equal(guard.attackTargetId,null);assert.equal(boarder.roomId,g.state.player.teleportRoomId);roundtrip(g);
});

test('teleport reception reserves in-flight endpoints as well as stationary and final destination tiles',()=>{
  const g=quiet(),ship=g.state.player;while(ship.crew.length<6)assert.equal(g.addCrew('human').ok,true);
  const boarder=ship.crew[0];place(g,boarder,g.state.enemy,'weapons');g.allocatePower('engines',-1);g.allocatePower('teleporter',1);
  const pad=ship.teleportRoomId,tiles=g.getShipTiles().filter(t=>t.roomId===pad),door=ship.doors.find(d=>!d.airlock&&((d.a===pad)||(d.b===pad)));
  const incoming=door.a===pad?door.tileA:door.tileB,origin=door.a===pad?door.tileB:door.tileA,originRoom=door.a===pad?door.b:door.a;
  const mover=ship.crew[1];place(g,mover,ship,originRoom,origin.x,origin.y);const beyond=g.getShipTiles().find(t=>t.roomId===pad&&(t.tileX!==incoming.x||t.tileY!==incoming.y));
  assert.equal(g.moveCrewToTile(mover.id,beyond.tileX,beyond.tileY).ok,true);g._advanceCrew(ship,mover,.1,SW.DATA.crewTypes[mover.species]);assert.ok(mover.tileTransit);
  let index=2;for(const tile of tiles.filter(t=>t.tileX!==incoming.x||t.tileY!==incoming.y))place(g,ship.crew[index++],ship,pad,tile.tileX,tile.tileY);
  // The mover's final target is occupied in this bounded congestion fixture. Its transit endpoint remains a reservation.
  g.setPaused(true);assert.equal(g.getTeleportStatus('recall',[boarder.id]).code,'CAPACITY');denied(g,()=>g.recallCrew([boarder.id]));
});

test('a stationary station operator yields within the same room so a real corridor queue can finish',()=>{
  const g=fresh('atlas');g.startRun();for(const ship of [g.state.player,g.state.enemy])for(const w of ship.weapons){w.enabled=false;w.auto=false;w.fireMode='manual';}g.state.enemy.aiTimer=10000;
  const ship=g.state.player,[pilot,engineer,mover]=ship.crew;place(g,pilot,ship,'bridge',4,2);place(g,engineer,ship,'shields',4,0);place(g,mover,ship,'shields',4,1);
  // This is the bounded queue observed in an actual public-command Atlas run.
  Object.assign(engineer,{tilePath:[{x:4,y:1}],targetTile:{x:4,y:1},movePath:['shields'],targetRoomId:'shields'});
  Object.assign(mover,{tilePath:[{x:4,y:2},{x:3,y:2}],targetTile:{x:3,y:2},movePath:['bridge','medbay'],targetRoomId:'medbay'});
  roundtrip(g);const original={x:pilot.x,y:pilot.y};advance(g,1);assert.equal(pilot.x,original.x);assert.equal(pilot.y,original.y,'paused queue never moves');
  g.setPaused(false);until(g,()=>!engineer.tilePath.length&&!mover.tilePath.length&&!pilot.tilePath.length,8);
  assert.equal(pilot.roomId,'bridge');assert.equal(engineer.tileX,4);assert.equal(engineer.tileY,1);assert.equal(mover.tileX,3);assert.equal(mover.tileY,2);roundtrip(g);
});

test('two friendly travellers cross one doorway in opposite directions without permanent reservation deadlock',()=>{
  const g=quiet({crewCount:2}),ship=g.state.enemy,[a,b]=ship.crew,door=ship.doors.find(d=>d.a==='bay4'&&d.b==='bay5');
  place(g,a,ship,door.a,door.tileA.x,door.tileA.y);place(g,b,ship,door.b,door.tileB.x,door.tileB.y);
  Object.assign(a,{tilePath:[copy(door.tileB)],targetTile:copy(door.tileB),movePath:[door.b],targetRoomId:door.b});
  Object.assign(b,{tilePath:[copy(door.tileA)],targetTile:copy(door.tileA),movePath:[door.a],targetRoomId:door.a});
  roundtrip(g);for(let i=0;(a.tilePath.length||b.tilePath.length)&&i<150;i++){
    const old=[{x:a.x,y:a.y},{x:b.x,y:b.y}];g.tick(1/30);
    [a,b].forEach((c,index)=>assert.ok(Math.hypot(c.x-old[index].x,c.y-old[index].y)<=SW.DATA.crewTypes[c.species].moveSpeed/30+1e-7));
    if(!a.tileTransit&&!b.tileTransit)assert.notEqual(a.tileX+','+a.tileY,b.tileX+','+b.tileY);
  }
  assert.equal(a.roomId,door.b);assert.equal(b.roomId,door.a);assert.equal(a.tilePath.length+b.tilePath.length,0);roundtrip(g);
});
