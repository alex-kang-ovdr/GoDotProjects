# IRONWOOD 3.0 integration contract

Goal: retain V2 siege and extend physically assembled boats and airplanes with playable route objectives. No direct position/quaternion/velocity driving to fake movement. Simplified, tuned lift/buoyancy plus optional force/torque stabilization is acceptable and documented.

## Ownership

- mechanical_physics: dist/physics.js, tests/physics_v3.test.mjs. Preserve all V1/V2 physical regressions.
- flight_water_weapons: dist/parts.js, dist/campaign.js, dist/editor.js, tests/parts.test.mjs, tests/campaign.test.mjs, tests/editor.test.mjs. Tune new presets in coordination with physics owner.
- assembly_ux: dist/scene.js only. Root owns HTML/CSS/main/docs/package.
- root: dist/main.js, dist/index.html, dist/styles.css, docs, build/packaging, integration/publication.

## Catalogue and schema

Retain original 6 parts. Add `float` (mass .7, cost 3, HP65), `propeller` (mass1.5, cost5, HP55), `wing` (mass .6, cost3, HP45). All are ordinary fixed-face connections. Power .3..2 for propeller/wing. Existing `elevation` is wing incidence as well as cannon elevation; wing presets/new placements default6deg. Accept same -10..45 schema; aerodynamic behavior must stall/clamp sanely. No new serialized field required. Preserve format1 blueprints and progress version1.

Add `boat` and `plane` presets to makePreset; each must be connected, nonoverlapping and within its mission budget. Boat uses separated floats for righting, engine and rudder control via thrust/drag. Plane uses propeller, spanwise wings, tail surfaces and wheels for physical takeoff. Default shape is one cell; visual extensions must not create false attachment semantics. Only data owner edits preset file; physics owner requests tuning.

## Mission metadata

Existing missions receive `objective:'destroy'` (sandbox `'sandbox'`), `environment:'land'`, `recommendedPreset:'rover'` (gate may ram).
New campaigns appended after citadel, before sandbox:
- harbor / 해협 항로 / environment:'water' / objective:'route' / recommendedPreset:'boat' / targetCount0 / checkpointCount3 / budget65 / ammo0 / timeLimit150 / parTime55 / parShots:null.
- skyway / 하늘 회랑 / environment:'air' / objective:'route' / recommendedPreset:'plane' / targetCount0 / checkpointCount3 / budget70 / ammo0 / timeLimit150 / parTime45 / parShots:null.
All selectable. nextCampaignMission: outpost→gate→citadel→harbor→skyway→null. Route score third star only integrity>=.75 (no shots criterion). Preserve old records and independently best times/shots. Metadata owns names/hints; physics owns geometry.

## Shared physics/layout API

getMissionLayout always returns `{targets,obstacles,enemies,environment,checkpoints}`.
environment: `{kind:'land'|'water'|'air',groundY:number,waterLevel:number|null}` (extra bounds optional). Land/air ground0. Water seabed about-5, waterLevel about.45; tune as needed.
checkpoints: ordered `[{id,position:{x,y,z},radius:number}]`. Harbor three gates roughly z-12,-26,-40. Air three gates roughly (0,5,-22),(0,8,-38),(0,10,-54). Tune to reachable authentic takeoff with a broad fair gate. Passage requires actual core path/current core location; ordered and once only, no skipping future gates. Route completion should not rely on destroyed target counts. Use swept segment check to avoid tunneling through a gate; vertical air criterion prevents ground car completing flight mission. Document final exact geometry.

Simulation adds:
- `environment` same layout environment.
- `checkpoints` descriptors (may add passed).
- `checkpointIndex`: completed count.
- `objectiveProgress` getter `{kind:'destroy'|'route'|'sandbox',completed,total,label,next:null|checkpoint}`.
- `telemetry` getter `{altitude,verticalSpeed,airspeed,submerged,throttle,pitch,roll}`. Degrees for pitch/roll; submerged 0..1; altitude world y from ground/water surface, not arbitrary displayed flight progress. Must be finite before tick.
- `getPropellerPower(partId)`: signed effective drive -1..1 (or normalized chosen power; document). 0 when disconnected/dead.
- step input preserves forward/turn/turret/aim/brake/fire and adds `pitch` + nose up, `roll` + left bank, `assist` boolean defaulttrue. W/S drives wheel + propeller. A/D yaw/steer. ArrowUp/Down pitch; ArrowLeft/Right bank. Existing no-wing ground arrow aliases can remain at UI level. B brakes/cuts thrust. Float passive buoyancy works while alive even detached; wing passive lift while alive; control/propeller only core-connected. Destruction disables float lift and wing lift so design damage matters. Assist uses finite torques, never transform overrides.
- event `checkpoint` with index/completed/total/position; existing win/fail etc unchanged.
- Fail when core remains submerged deeply for a short grace interval. No drowning on land; terminal once. Route result adds optional checkpoints/total but existing stats preserved. Original end checks/tests remain.

## Scene contract

Keep public API. Add visuals for all3 types incl propeller spin/wing incidence. Use shared environment and checkpoints in build and play. Water plane with shoreline/platform or visible seabed, buoys for water and upright hoops for air; completed, current and future gates visually distinct. Design grid still at y0; free edit works identically. Hide/reposition ground decorations that conflict with water. Flight camera must follow movement/height without aiming at obsolete siege targets. Same water level and mission geometry as physics. No external assets/network necessary.

## Root UI

9-part palette, 5 presets. Mission-specific recommended-design action (explicit click backs up current design; changing mission alone preserves current design). Input context, route HUD, altitude/airspeed/next gate distance, assist control, checkpoint notifications, meaningful result/score text, compact mobile flight controls. Design diagnostics add wing/float/propeller counts and useful warnings; recommendations not hard locks. Source/HTML rebuilt and private existing Site deployed.

## Acceptance

Existing40 tests must continue, with intentional catalogue/campaign expectation updates only. Add meaningful physics tests: stationary float vs no-float sinking, engine force/orientation/disconnected stop, plane lift/takeoff plus digital pitch/bank signs, authentic boat route completion and plane route completion with ordinary controls (no teleports/HP edits), ordered gates/swept crossing, one-shot terminal and finite telemetry. Keep added tests bounded. Data tests cover 5 connected presets, new scoring and old-save compatibility.

Browser QA only supported managed Sites preview/CUA; no standalone Playwright/browser workaround. Report limits honestly if route remains unavailable. Do not publish or change audience from agents.
