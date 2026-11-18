# Iron Tide V1 baseline implementation contract

This document records the V1 baseline. V2 additions and changed rules are defined in `UPGRADE_CONTRACT.md`; current player-facing rules are in `README.md`.

Original, browser-local single-player naval combat inspired by the supplied WoWS reverse-design documents. Vanilla JavaScript + Canvas 2D. No dependencies, no remote assets. All scripts are classic scripts, and merge exports into `globalThis.IronTide`. Must work from local index.html as well as hosted. Korean interface.

## Shared interfaces

`IronTide.CLASSES`: object with keys `destroyer`, `cruiser`, `battleship`. Profiles have `name` (original Korean ship name), `type` (Korean class), `code` (DD/CA/BB), `maxHp`, `maxSpeed`, `length`, `width`, `range`, `reloadMax`, `torpReloadMax`, `armor`, `detectRange`, `description`. Angle radians, x right, y down. Speed/world units deliberately tuned for play, not original game values.

`IronTide.createGame({shipClass='cruiser', difficulty='normal', seed=42})` returns `g`:
- `world:{w:4200,h:3200}`, `islands:[{x,y,rx,ry,rotation,seed}]` (ellipse collision), `zones:[{id:'A',x,y,radius,progress,owner,contested}]`. Team 0 blue, team 1 red, null unowned. Progress -1 red to +1 blue.
- `ships`, `player` (same reference as player's entry), `playerId`, `projectiles`, `effects`, `events` (bounded), `lastKnown` (enemy id -> {x,y,time}).
- `phase:'playing'|'won'|'lost'|'draw'`, `reason` (Korean), `time`, `duration:480`, `score:[250,250]`, `targetScore:800`, `stats:{damage,kills,hits,shots,torpHits,caps,damageTaken}`.
- Ship: `id,name,classId,team,isPlayer,x,y,angle,gunAngle,speed,maxSpeed,length,width,hp,maxHp,armor,range,detectRange,reload,reloadMax,torpReload,torpReloadMax,throttle,visible,detected,fireTime,floodTime,smokeTime,repairTime`. Throttle integer -1..4 (reverse, stop, quarter, half, three-quarter, full). `vx/vy` helpful for aiming. `alive` optional; hp>0 is canonical.
- `player.consumables:{damageControl,repair,ability}`: each `{label,charges,maxCharges,cooldown,maxCooldown,duration,active,kind}`; ability kind smoke on DD, sonar otherwise. damageControl may use charges=-1 for unlimited.
- Projectiles: `{id,kind:'shell'|'torpedo',team,x,y,startX,startY,targetX,targetY,age,life,angle,vx,vy,damage,ammo,ownerId}`. Shell progress age/life, landing impact at end; renderer displays arc. Torpedoes move and collide continuously.
- Effects: `{id,type:'explosion'|'splash'|'hit'|'muzzle'|'smoke',x,y,age,life,radius,team}`. Optional damage/ammo. Events: `{id,time,type,text,team,x,y,damage,shipId}`. No hidden target info in player feedback.

`IronTide.tickGame(g,dt,controls)` advances simulation. controls `{turn:-1..1,throttle:-1..4,aimX,aimY,fire:boolean,ammo:'HE'|'AP'|'TORP'}`. Engine owns AI. dt caller fixed 1/60. Controls may be omitted for tests.
`IronTide.firePlayer(g,ammo,aimX,aimY)` returns success boolean.
`IronTide.useConsumable(g,key)` keys damageControl/repair/ability, returns boolean.
`IronTide.predictIntercept(shooter,target,speed=430)` returns `{x,y,time}`.
`IronTide.isVisible(g,ship)` returns boolean.

## Renderer contract

`new IronTide.Renderer(canvas)` with `resize(width,height,dpr)`, `render(g,view)`, `screenToWorld(x,y)`, `worldToScreen(x,y)`.
`view` includes `{cameraX,cameraY,zoom,time,aimX,aimY,targetId,ammo,menu:boolean,tactical:boolean}`. World units map with `zoom` pixels per world unit. Root controls camera and zoom. renderer draws full canvas scene and world overlays, including ocean, grid, islands, rings, detailed ship silhouettes with rotating turrets, smoke, wakes, shells/torpedoes, impacts, target/lead reticle, visibility. Do not draw DOM HUD. Enemy hull and label ONLY if visible. Last-known contacts only minimap elsewhere. Draw all allied hulls. No image/CSS/UI changes in renderer task.
Use renderer public dimensions `width,height,dpr`. Save latest camera for transforms. Player home harbor/menu render same scene with `view.menu=true` (no HUD labels needed), camera can slowly pan. Rendering must be deterministic visually within animation and efficient for <10 ships, 300 effects/projectiles.

## Experience

3v3 battle: player+2 AI allies vs3 AI enemies. 3 capturable zones A/B/C, first800 points, kill all enemies, player death, or8-minute timeout ends round. Initial enemy encounter in10–25seconds at full throttle. Avoid island-spawn overlaps. Core: inertia & rudder, ammo choice HE/AP, armor angle, citadel/overpen/ricochet simplified, torpedo spreads, fire/flood, damage control, healing, visibility/LoS, smoke/sonar, competent obstacle-avoiding AI and objective play.
Keyboard W/S throttle steps, A/D rudder, mouse aim, left mouse or Space fire,1HE/2AP/3TORP,Q damageControl,R repair,E ability, Tab next visible target,M tactical map,P/Escape pause. Mobile touch steering, throttle, fire, aiming by tap/drag, actionable bottom buttons. Root builds HTML/CSS/game controller/sound/localStorage.
Simulation must not require DOM. Tests load sim.js with Node vm. Synthetic tests permitted for damage, collisions, capture, end conditions, restart determinism, long finite-state run. Do not expose test cheats in normal UI.

## Ownership

Engine agent owns dist/sim.js. Renderer agent owns dist/render.js. Root owns dist/index.html,dist/style.css,dist/game.js, README.md and hosting. QA agent owns tests/simulation.test.cjs and reports fixes to engine/root. Coordinate interface updates explicitly. Never modify another agent's owned files without agreement.
