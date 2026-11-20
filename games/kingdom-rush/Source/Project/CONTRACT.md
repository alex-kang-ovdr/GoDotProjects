# Archived implementation contract — KR playable v15

> Historical v15 design handoff. The current v16 data, ruleset, geometry, engine API and rendering behavior are documented in `README.md`, `docs/ENGINE_V16_NOTES.md`, and `docs/LEVEL_RECONSTRUCTION_v16.md`. Statements below describe the original v15 implementation, not the active v16 contract.

Buildless JS, concatenated into one offline HTML. No imports/CDN/fetch. Source data is a documented candidate, maps/timing/runtime approximations are explicit custom reconstruction.

## Data (agent data owns src/data.js)
`globalThis.KR_DATA = {stages: [...], enemies: {id:...}, towers: {id:...}, abilities:{id:...}, sources:..., provenance:...}`.
World coordinates **1000 × 620**, map playable area entire canvas, UI is outside. Stage `{id,order,name,nameKo,subtitle,biome:'forest'|'snow'|'ash',startingGold,paths:[[[x,y],...],...],sites:[{x,y},...],waves:{campaign:[[{enemy,count,path?},...],...],heroic:[...],iron:[...]},modes:{campaign:{startingGold,lives,allowedFamilies,maxTier},...},bossId?}`. Paths are original authored substitute geometry, must have tower sites within useful range and no overlap. Default family tier3 cap early? Prefer all tiers available in this adaptation; no original unlock fidelity claim.
Enemy `{id,name,nameKo,hp,armor,resist,speed,damage,attackTime,gold,lifeCost,air,behaviors:[...],radius?,boss?}`. HP normal; speed in world px/s explicit gameplay tuning. `armor,resist` fractions. Definition keys cover all wave references. Boss IDs juggernaut/jt/veznan.
Tower `{id,name,nameKo,family:'archer'|'barracks'|'mage'|'artillery',tier,cost,damageMin,damageMax,interval,range,kind:'arrow'|'bolt'|'shell'|'chain'|'barracks',upgrades:[id...],abilities:[skillId...],soldierHp?,armor?,respawn?,soldierCount?}`. Skill `{id,nameKo,description,costs:[...],maxLevel,type,values:[...]}`. Data adapter may normalize existing structures. Cost is incremental.

## Engine (agent engine owns src/engine.js)
`globalThis.KRWorld` constructor `(data, stageId, {mode:'campaign',difficulty:'normal',upgrades:{archer:0,barracks:0,mage:0,artillery:0,meteor:0,reinforcements:0},seed})`.
Fields: `state:'ready'|'playing'|'won'|'lost'`, `time`, `wave` activated count, `totalWaves`, `gold`, `lives`, `maxLives`, `stage`, `towers`, `enemies`, `units`, `projectiles`, `effects`, `hero`, `spells`, `stats`, `nextWaveIn`, `canCallWave` boolean, `result` on completion.
Towers `{id,siteIndex,defId,x,y,cd,skills:{id:rank},rally:{x,y},invested}`. Enemies `{id,defId,x,y,hp,maxHp,pathIndex,progress,air,boss,slow?,root?,poison?}`. Units `{id,kind:'soldier'|'hero'|'reinforcement'|'elemental',ownerId,x,y,hp,maxHp,targetX,targetY,deadUntil?,level?}`. Hero included in units and referenced as world.hero. Projectiles `{x,y,kind,tx?,ty?,targetId?,...}`. Effects `{kind,x,y,age,duration,radius?,text?,color?,x2?,y2?}`; renderer tolerates extras.
Spells `{reinforcements:{remaining,total},meteor:{remaining,total}}`; stats `{kills,damage,leaks,spent,cheated,duration?}`. `result:{won,stars,lives,kills,duration,gold,cheated}`.
Methods `update(dt)` (fixed dt=1/60 from app); `build(siteIndex,defId)`; `upgrade(towerId,nextDefId)`; `buySkill(towerId,skillId)`; `sell(towerId)`; `setRally(towerId,x,y)`; `moveHero(x,y)`; `cast(spellId,x,y)`; `callWave()`; `cheat(action,value)`.
Mutations return `{ok:boolean,message?:string}`. Invalid calls leave resources unchanged. Build tier1 only; upgrade checks graph/cost. Defeat at lives0. Allow manual wave call once first wave ready, later with bounded wait and bonus; no deadlock. Victory accounts for pending spawns + boss phases + summons. Engine emits effects for feedback and a `notifications` queue of short strings optionally consumed by app.
App owns pause/speed and wall time. Engine updates only in playing state; ready permits builds and first call. Independent PRNG engine seed. DOM-free so Node testable.

## Renderer (agent render owns src/render.js)
`globalThis.KRRenderer` constructor `(canvas,data)`; methods `draw(world,ui,wallTime)`, `renderPreview(stage,wallTime)` optional. `ui:{selectedSite:number|null,selectedTowerId:number|null,placementMode:null|'meteor'|'reinforcements'|'hero'|'rally',pointer:{x,y}|null,selectedHero:boolean,range?:number}`.
Canvas backing managed by renderer via `resize()`; uses rect devicePixelRatio and 1000x620 virtual coords. App input maps to these coordinates. Landscape canvas aspect ratio fixed 1000/620; never stretch. Beautiful original hand drawn/vector fantasy map: layered forest/snow/ash terrain, road, creek/bridges, building pads, camp entrance, castle exit, tower silhouettes, units, effects, ambient particles. Cache static terrain keyed stage, no external assets. Tower levels visual, hero clearly recognizable, health bars only injured, distinct enemy types/size, air shadows.
May expose `drawTowerIcon(ctx,def,x,y,scale)` if useful but not needed. Do not implement UI in renderer.

Root owns src/app.js, HTML/CSS, build, tests integration, publication. Coordinate any schema changes by messages; do not edit other agents' files.
