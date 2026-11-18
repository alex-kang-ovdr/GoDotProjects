# IRONWOOD implementation contract

Original Korean 3D physics building game inspired by Besiege. Static browser ES modules, Three 0.180 + cannon-es 0.20 vendored under dist/vendor. Forward is negative Z; Y is up. Grid unit 1; body centers world {x:part.x,y:part.y+0.72,z:part.z}. Part ids stable strings. Maximum 100 parts.

## Data (parts.js)
`PARTS` object keyed `core`, `wood`, `wheel`, `cannon`, `brace`, `hinge`.
Each `{name, short, description, mass, color, cost, category}`. Part `{id,type,x,y,z,rot:0|1|2|3,power:1,binding:'all'|'left'|'right'}`. Rot is yaw quarter turns. Wheel axle X at rot0; cannon forward -Z at rot0. Structure has size .92. Wheel radius .65; width .34.
Export `makePreset(name='rover') -> parts[]`, `MISSIONS` array with `{id,name,subtitle,description,targetCount,timeHint}`, `cloneParts`, `validateDesign`, `getConnections(parts)` returning `{a,b,kind:'fixed'|'hinge'|'wheel',strength}`. Validation returns `{valid:boolean,errors:string[],warnings:string[]}`. The physics owner may instead implement its internal adjacency; interface data remains.

## Physics (physics.js)
Import CANNON from './vendor/cannon-es.js'. Export `Simulation`.
constructor({parts,mission='outpost',onEvent=(event)=>{}}).
`step(dt,input={forward:0,turn:0,turret:0,fire:false})` fixed stepping with max substeps. `fire()` explicit edge-triggered fire (return bool). `dispose()`.
Public `.bodies`: Map partId -> CANNON.Body; `.targets`: array objects `{id,body,hp,maxHp,kind,dead}`; `.projectiles`: array `{id,body,life}`; `.connections`: array objects `{a,b,broken,constraint}`; `.elapsed`; `.shots`; `.brokenCount`; `.destroyedCount`; `.targetCount`; `.won`; `.corePosition` getter returning {x,y,z}; `.speed` getter.
Each body userData {id,type,part}; targets are physical dynamic stone boxes. Each target also `.size` {x,y,z}. Public `.obstacles` optional array {body,size,kind}.
Events `{type:'fire'|'hit'|'break'|'destroy'|'win',position?:{x,y,z},...}` for effects/audio/UI.
Fire cannon front is negative Z rotated yaw, velocity ~18; cannon recoil. Physical wheel hinge motors for forward/turn; hinge turret via Q/E. Breakable constraints, separate hitpoint damage for target blocks. Avoid locking wheel to all neighbors. Reset means dispose and instantiate fresh snapshot.

## Renderer (scene.js)
Import * as THREE from 'three' and OrbitControls from './vendor/OrbitControls.js'. Export `GameScene`.
constructor(container HTMLElement,{onCellClick,onSelect,onHover}={}).
`setDesign(parts)` rebuild static parts; `setTool(type)` sets placing type or null for select; `setRotation(rot)`; `setSelection(partId)`; `setMode('build'|'play')`; `setSimulation(simulation|null)`; `setConnectionsVisible(bool)`; `setView('iso'|'top'|'front')`; `focus()`; `resize()`; `update(dt)`; `effect(event)`; `dispose()`.
Callbacks onCellClick({x,y,z}) for empty adjacent cell/ground, onSelect(id) when selecting mode (or root can delete), onHover({cell,valid}) optional. Build ghost under pointer snapped to hit face, grid y>=0 and <=10, bounds x/z +/-12. Orbit camera right drag or middle, wheel zoom; left click building/select. Orbit touch two-finger or controlled to avoid accidental edits. Build negative Z faces goal. Draw woodbeam cross details, metal wheels with treads/spokes, cannonbarrel, hinge ring, X steel brace. Ground grass islands/rocks, distant hills, training targets; aesthetically polished warm natural palette.
Update maps sim body transforms, targets/projectiles and removed targets; effect with lightweight particles. Build mode shows mission scenery from static simulation? `setMission(id)` optional for scene preview targets. Scene owns geometry/materials and target visual lifecycle. Expose `.renderer`, `.camera`, `.controls` if needed for integration.

## Owner assignments
Root owns index.html, styles.css, main.js, source packaging, integration/tests/deploy.
mechanical_physics owns dist/physics.js (+ physics tests if meaningful).
assembly_ux owns dist/scene.js.
flight_water_weapons owns dist/parts.js, README.md, dist/help.md. No other files unless coordinated.

Report discrepancies immediately; use this exact API to avoid integration drift. Implement robust actual interactions, not mocks. This is a playable limited prototype, no aircraft or naval simulation claimed.
