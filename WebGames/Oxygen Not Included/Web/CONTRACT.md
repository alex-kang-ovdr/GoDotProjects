# BREATH COLONY — implementation contract

An original, Korean-language, ONI-inspired playable 2D colony survival game. Vanilla JS / Canvas, buildless static Site. Product title `숨 · BREATH COLONY`, subtitle `작은 숨에서 시작하는 지하의 세계`. No original game assets or names for characters. Root owns Site, HTML/CSS/app integration and deployment.

## Files and ownership
- `dist/engine.js`: simulation_systems owns. ES module exports `Game`, `BUILDINGS`, `MATERIALS`, `WORLD_W`, `WORLD_H`, `CYCLE_SECONDS`.
- `dist/renderer.js`: colony_people owns. ES module exports `Renderer`. Imports definitions from `./engine.js` if useful.
- `dist/index.html`, `dist/styles.css`, `dist/app.js`: root owns.
- `tests/engine.test.mjs`, `README.md`: production_space owns. Tests only when engine exists; Node simulation checks, no browser automation.
- `package.json`: root owns; `type: module`. No dependencies/build step.

## Simulation scope
48 columns x 28 rows. A carved, readable starter base near center upper-middle, solid platforms/floors, ladder spine, nearby copper/algae/coal veins, one small isolated water pool, warmer deep rock, fog of war for far cells. Three colorful crew automatically execute dig/build/operate/harvest/eat/rest. Simple cells containing scalar O2/CO2/temp/water. Diffusion cannot cross solids. Water falls/spreads; crew can be hindered by deep water. Heat diffuses and affects plants/health. Keep systems playable and forgiving enough for a 5–15 minute loop. Simulation values are purpose-designed, not original ONI constants.

## Game public interface
`new Game(seed = 73)` initializes immediately. `game.step(dt)` advances simulation seconds (root accumulates fixed 0.1 sec step; speed handled outside). Game never owns RAF, DOM or localStorage.
`game.reset(seed = 73)`; `game.serialize()` returns plain JSON object; `game.load(object)` validates and loads object, returning boolean or throws readable Error.
`game.queue(tool, x, y)` returns `{ok:boolean, message:string}`. Tools: `dig`, `cancel`, `deconstruct`, `priority`, `wire`, and BUILDINGS keys. Repeated drag calls must not duplicate tasks or charge twice.
`game.inspect(x,y)` returns `{title:string, lines:string[], building?:object, crew?:object}`.
`game.toggleBuilding(id)` toggles enabled state; `game.setCrewRole(id, role)` with roles `balanced`, `dig`, `build`, `operate`, `farm`.
`game.canPlace(tool,x,y)` returns `{ok:boolean,message:string}` without mutation.
`game.recruit()` adds fourth crew only if criteria/met cost; returns result.

## Exposed state
`game.w`, `game.h` = grid dimensions. `game.cells` flat array, cell = `{solid: string|null, oxygen:number, co2:number, temp:number, water:number, revealed:boolean, wire:boolean}`. Solid keys `rock`, `dirt`, `copper`, `algae`, `coal`, `ice`, `bedrock`, `tile`.
`game.buildings` array `{id, type, x, y, progress:0..1, enabled:boolean, active:boolean, connected:boolean, status:string, ...}`. `progress < 1` means blueprint, uses planned construction task.
`game.tasks` array `{id,type:'dig'|'build'|'deconstruct',x,y,priority:number,progress:0..1,assigned:number|null,...}`.
`game.crew` array `{id,name,color,x,y,health:0..100,hunger:0..100,energy:0..100,stress:0..100,breath:0..100,action:string,role:string,taskId:number|null, ...}`. x/y is float grid position of body center in the passable cell, at x+.5/y+.5. Renderer converts coordinate `crew.x,crew.y` to pixels. Crew cell = floor x/y. No name collisions.
`game.resources` object `{rock:number,metal:number,algae:number,coal:number,water:number,food:number}` all nonnegative, not original game units. User labels 광석/금속/조류/석탄/물/식량.
`game.time`, `game.cycle` (1 based), `game.power` object `{stored,capacity,production,demand}`; energy stays finite and nonnegative.
`game.stats` object `{oxygen:number,temperature:number,foodDays:number,completedDigs:number,completedBuilds:number,research:number,population:number}`. oxygen is average breathability percent around occupied colony, 0..100, not kg/m³. temperature °C.
`game.objectives` array `{id,label,description,done:boolean,progress:number,target:number}`: dig 12 blocks; build 1 diffuser; powered battery; build 3 farms; research 30; survive 5 cycles with 3 crew. Completing objectives awards some resources to prevent deadlocks. Full completion sets won true, play can continue.
`game.events` recent newest-first array `{id,time,text,tone:'info'|'good'|'warn'|'danger'}` bounded 25.
`game.alerts` array `{id,text,tone}` (no duplicate flood).
`game.lost`, `game.won`; `game.version` for serialization.

## Definitions
BUILDINGS object keys: `ladder`, `tile`, `diffuser`, `generator`, `battery`, `farm`, `cot`, `research`, `pump`, `scrubber`, `coalgen`. Every definition `{name,icon,description,cost:{resource:amount},power?:number,color:string,unlock?:number}`. Icon is short semantic ASCII name or Unicode; root replaces with its SVG icons. All occupy one grid cell except tile is solid; ladder passable. Buildings normally need floor under them; ladder/tile exception. Common starter infrastructure includes core decoration represented type `core`, 3 cots, a manual generator and tiny farm; starter no built diffuser and battery so tutorial meaningful. Don't expose `core` in build list. Initial stores generous rock~240,metal~140,algae~100,food~35,water~60,coal~30. Start with enough oxygen for 2+ cycles.

Electrical network: 4-neighbor wire cells, most devices' port equals their anchor cell. Starting room has a visible wire bus and power-producing worker station. New devices need connectivity; expose connected/status reasons. Wire tool instant placement consumes small metal, no worker task (clearly explained). Manual generator requires worker physically nearby, produces only while operating. Battery supports buffering. Diffuser consumes algae/power, adds oxygen/heat. Farm consumes water, grows only within temp/atmosphere bounds; harvest requires crew. Research requires worker and power, unlocks scrubber/coalgen. Pump collects adjacent pool water into shared supply, needs power. Scrubber reduces CO2 powered. Food consumed by crew, fatigue restored at cots. Stock/transport is deliberately shared, no pipes or hauling in this core build.

## Renderer public interface
`new Renderer(canvas, game)` with `.game` assignable after load/reset; `resize()` reads canvas CSS bounds and DPR; `render(nowSeconds)` called RAF; `screenToCell(clientX,clientY)` returns `{x,y}`; `pan(dx,dy)` in CSS px; `zoomAt(factor,clientX,clientY)` clamp; `fit()` centers core/starting base; `centerOn(x,y)`.
Renderer fields `.overlay` = `normal`|'oxygen'|'temperature'|'power', `.tool` string, `.hover` = `{x,y}`|null, `.selection` = `{x,y}`|null, `.dragRect` = `{x1,y1,x2,y2}`|null. world coordinates use cells x/y top-left; crew x/y floats. Draw terrain, cave texture, readable wire overlays, cute original crew, machines with motion, ghosts/tasks/work particles, fog and overlays, hovered and selected cell borders. Device art should remain legible at normal fit. Render canvas should take available viewport full bleed, no DOM dependency beyond canvas and window. Minimal aesthetic: deep navy cave, warm ochre terrain, jade/lilac minerals, mint oxygen, coral warnings, subtle stars/dust. No external images/fonts.

## Integration
UI starts live immediately, compact optional help card rather than blocking splash. Root controls pause/speed (0/1/2/4), tooling keyboard (D dig, X cancel, B build, O oxygen, T temperature, P power, Space pause, Escape inspect), drag rectangle dig/cancel/priority; placing buildings on click. WASD/arrows pan except D is dig (use arrows/WAS or middle drag as documented), wheel zoom, right/middle drag pan. Touch supports tap for current tool, two-finger pan/pinch or explicit 이동 tool. Save/load localStorage with guards; export/import JSON; sound toggle procedural sounds optional root.

## Test boundary
Expose `window.colony = {game,renderer,...}` for manual debugging only if useful. Browser QA MUST follow Sites managed preview + CUA; do not start custom HTTP server or use Playwright directly. Node unit/integration simulation tests allowed. Root owns create_site, credential, git workflow, hosting manifest and publication. Agents must not register/deploy/push Site.
