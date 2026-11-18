# Fortress BLUE playable implementation contract

Buildless plain browser JS: `dist/data.js`, `dist/engine.js`, `dist/render.js`, `dist/app.js`, `dist/index.html`, `dist/style.css`. No external runtime dependencies. Scripts load in this order and use globals so the downloaded folder runs with file://. Existing data bundle stays immutable.

## Data — `window.FortData`

- `catalogs.classic` and `catalogs.blue3`: arrays of `{id,name,hp,delay,movement,aimMin,aimMax,color,body,description,weapons,passives,provenance}`.
- Weapon `{id,name,kind,attack,radius,terrainRadius,shots,spread,delay,unlockRound,description,role,delivery,behavior,behaviorStatus,attackStatus,sourceSnapshot,sourceRefs,assumptions}`. `kind` is shell/fire/poison/mine/laser/multi/water/homing/shield. `attack` is the model's per-projectile damage input, not a verified final HP loss. Unknown runtime values are implementation tuning, expressly classified in provenance.
- `profiles`: array `{id:'classic'|'blue3',name,description,teamSize,turnLimit,suddenDeathRound,maxRound}`. Classic supports 1/2/4 team size, blue3 4v4. blue3 rounds are implementation interpretation, recorded as such.
- `maps`: array `{id:'highlands'|'islands'|'foundry',name,theme,description,seed}`. These are original prototype maps, not recovered original assets.
- `items`: array `{id:'repair'|'shield'|'double'|'teleport',name,description,value,profileValues?,delay,sourceRefs,assumptions}`. `profileValues` overrides `value` for the current profile. At most one item per turn. Weapon action still ends turn; teleport is a projectile.
- `tuningDefaults`: `{gravity:320,windAcceleration:9,maxLaunchSpeed:1050,minLaunchSpeed:90,damageScale:0.75,terrainScale:1,turnTime:25}`. All are prototype coefficients, never original constants.
- `provenance`: structured global documentation, source URLs and key data source snapshots. Base catalog F2 source stats remain within JP_2003_literature. Optional KR angle bounds live in a separate evidence profile and override only runtime angle limits; they must never overwrite the JP source snapshots. F3 separate roster with sourced HP/delay where available, others marked model values. English ID is analyst key.

### Aiming evidence and runtime resolution, version 1.2

`FortData.aiming` contains:

- `defaultAngleProfile:'jp2003'`.
- `angleProfiles.jp2003` and `angleProfiles.kr_reference`, each `{id,label,status,bounds}`. `bounds[tankId]` has `{min,max,status,sourceRefs,recordId,reportedSpan,arithmeticSpan,spanConsistent,conflictIds}`.
- `powerDefaults:{min:0,max:100,step:1,chargeRate:72,cycle:'ping_pong',status:'simulation_assumption'}`.
- Separate BLUE3 source bounds (unknown `null`) and runtime fallback values. Catalog and weapon-specific BLUE3 ranges remain assumptions.

`config.angleProfile` selects CLASSIC limits. Unknown profile IDs fall back to `defaultAngleProfile`. This is an angle-only override; selecting KR does not reconstruct a complete Korean build. KR records have `community_claim_not_runtime_verified` status. `reportedSpan` must never set an angle limit: the KR cannon reports span25 but min25/max45 imply arithmeticSpan20.

Tank and weapon `aimingRuntime` may supply `{powerMin,powerMax,chargeRate,velocityScale,gravityScale,windScale}`. Non-null weapon values override non-null tank values, then the shared defaults. All existing catalogs omit those per-tank physics overrides because original coefficients are unknown. Null, absent, blank and non-finite values must not become numeric zero. These extension points are implementation values unless separately evidenced; `sourcePower` records never become fallback constants.

The downloadable `dist/datasets/Fortress_AnglePower_Recovery.json` contains angle records30 (JP13/KR13/BLUE3 4) and power records17. Each original power record preserves unknown gauge units, charge rate/time, overflow, velocity curve, gravity, wind and mass as null. Prototype fallback coefficients are outside `sourcePower`.

### Weapon behavior, version 1

```js
{
  role: 'attack', // 'attack' | 'support'
  delivery: 'projectile', // 'projectile' | 'self'
  behavior: {
    trajectory: 'ballistic', // 'ballistic' | 'linear'
    bounces: 0,
    restitution: 0.72,
    lifeSteal: 0,
    role: 'attack', // compatibility field, must equal top-level role
    repeatable: true,
    homingTarget: 'enemy', // 'enemy' | 'all'
    // Optional skill-specific aimMin/aimMax in degrees.
  },
  behaviorStatus: 'simulation_assumption'
}
```

Top-level `role` and `delivery` take precedence. `kind` controls the visual/effect family; it does not determine whether a skill is support. All four BLUE3 support skills have `repeatable:false`, including projectile-delivered `utility_dispel`. Self-delivered support produces zero projectiles even if the preserved legacy `shots` field is 1. UI must use `getActionPreview()` for effective projectile count.

`linear` ignores gravity and wind. Bounce applies to terrain only; tank contact resolves the impact. `lifeSteal` heals from actual enemy HP loss, capped by the owner's missing HP; shield absorption, friendly damage and periodic damage do not count. Homing target policy is independent of explosion friendly-fire policy. Utility dispel removes enemy buffs only, although its normal damage may affect allies.

Current BLUE3 models: vampire bat lifeSteal 0.25; bouncy hit 1 bounce; homing bounce ball 2 bounces; restitution 0.72; pulse laser linear with aimMin −35 and aimMax 75; utility dispel single support projectile. These are simulation assumptions, separate from published attack inputs.

Tank `passives` is an array. Supported IDs are `low_hp_attack_boost` with `hpRatioAtMost` and `attackMultiplier`, and `mine_trigger_exemption` for proximity triggering only. Each entry carries `status:'simulation_assumption'`. Catalog HP/attack/base delay and the 61 deeply frozen `provenance.sourceSnapshots` must remain unchanged by tuning.

## Engine — `window.FortEngine`

`new FortEngine({profile:'classic',angleProfile:'jp2003',map:'highlands',teamSize:2,playerTank:'catapult',opponentTank:'cannon',control:'ai'|'hotseat',difficulty:'normal'|'easy'|'hard',seed:123,tuning:{...},onEvent:(event)=>{}})`.

Properties: `state`, `terrain`, `active` getter, `config`, `tuning`.
`state`: `{phase:'aim'|'projectile'|'settling'|'transition'|'gameover',paused:false,tanks:[],activeId,round,turnNumber,wind,timeLeft,projectiles:[],winner:null,simTime,power:65,weaponIndex:0,feed:[],turnOrder:[],suddenDeath:false,itemUsed:false,lastAction:null}`. `winner` is null while unresolved, 0/1 for a winning team, and −1 for a draw.
Tank: `{uid,typeId,name,team,x,y,vx,vy,hp,maxHp,angle,face,tilt,alive,delay,nextDelay,moveLeft,maxMove,status:{},inventory:{repair:1,shield:1,double:1,teleport:1},def}`. `y` means center of tank. `tilt` is screen rotation radians. Def is catalog entry.
Terrain: `{width:1800,height:820,mask:Uint8Array,version,mapId,seed}` plus `solid(x,y)` and preferably `surfaceAt(x)`.
Projectile: `{x,y,vx,vy,kind,team,ownerId,trail:[],radius}`. Additional engine fields allowed.

Methods: `tick(dtSeconds)`, `setAngle(degrees)`, `setPower(percent0to100)`, `setFacing(-1|1)`, `setWeapon(index)`, `move(direction,dtSeconds)`, `fire()`, `useItem(id)`, `canUseItem(id)`, `skip()`, `setPaused(bool)`, `isHumanTurn()`, `getAimingState()`, `getChargePower(elapsedSeconds)`, `setAimAtWorld(x,y)`, `getActionPreview()`, `getTrajectory()` (array of `{x,y}`), `getSnapshot()` (plain diagnostic object). Invalid human actions while AI/projectiles/paused must be rejected. AI uses private internal action path.

### Shared aiming and charge API

`getAimingState()` is read-only and returns null without an active actor, otherwise:

```js
{
  min, max, localAngle, terrainAngle, actualElevation, face, power,
  powerMin, powerMax, powerStep, chargeRate, chargeCycle,
  angleProfileId, angleProfileLabel, angleProfileStatus,
  angleFallbackApplied, angleSourceRefs, powerStatus,
  velocityScale, gravityScale, windScale
}
```

`localAngle` is clamped against the selected tank/weapon limits. `terrainAngle = -face * tilt * 180 / Math.PI`, and `actualElevation = localAngle + terrainAngle`. This is elevation measured upward from the current facing-side horizontal, not absolute world azimuth. It may be negative or exceed90 on slopes; do not clamp it to the tank's local-angle range. Left-facing absolute azimuth is180 minus this elevation. UI, guide, AI and actual projectile creation must resolve the same range and power quantization.

`setAimAtWorld(x,y)` accepts world coordinates and changes only facing and local angle on a valid human turn. It inverse-rotates the vector from `(tank.x,tank.y-4)` into body coordinates before choosing facing. UI may map pointer distance to power as an explicitly convenient input model; that heuristic is not an original distance/power calibration table.

`getChargePower(elapsedSeconds)` returns a quantized power for the active actor. Default0–100 at72 percentage points/second reaches100 after100/72 seconds and returns to0 after200/72 seconds. Both timing and ping-pong overflow are simulation assumptions. UI must use this API instead of a separate formula. `setPower` applies the same bounds and step;0 is a valid input. The default fallback speed remains `90 + (1050-90)*power/100` world units/second, so0 power does not mean zero speed. Gravity320 and wind acceleration9 remain prototype coefficients. Per-tank runtime scalars default to1 and are not newly recovered original values.

The target power marker is retained independently while charging. The previous-power marker stores each character's last accepted projectile action, including teleport, and is not overwritten by self-support. Both reset on a new match.

### Action and item previews

`canUseItem(id)` is a side-effect-free eligibility check for the current human turn. UI uses it to disable item buttons, including full-HP repair, an already-held shield, an already-prepared double, BLUE3 sudden-death double, item exhaustion, and a second item in the same turn. `useItem(id)` returns false when the action is invalid.

`getActionPreview()` returns null without an active actor, otherwise:

```js
{
  canFire, reason,
  ownerId, team, tankName,
  weaponId, weaponName, kind, role, delivery, isSupport,
  angle, localAngle, terrainAngle, actualElevation, power, face, wind, aimMin, aimMax,
  powerMin, powerMax, powerStep, chargeRate, chargeCycle,
  angleProfileId, angleProfileStatus, angleFallbackApplied, powerStatus,
  repeat, shots, projectileCount,
  itemUsed, doubleArmed, teleportArmed
}
```

`shots` and `projectileCount` are aliases for the effective total, including repeat and spread-count multiplicity. `repeat` counts repetitions of the base skill. Use the preview for selected skill angle limits, support labels, total projectiles and repeat text. Unavailable reasons include `locked_weapon`, `paused`, `ai_turn`, or the current non-aim phase. `setWeapon` and `setAngle` apply the same skill limits; the UI must not invent a separate angle range.

Preparing double immediately deducts one inventory item, applies its item delay and uses that turn's item opportunity. Its prepared status survives support, teleport, skip and timeout. It is cleared only by a repeatable attack. BLUE3 sudden death prevents preparing a new double; an existing double is cleared by the next attack, whose repeat is max(3, double), never a product. All support and teleport actions repeat once.

Events through onEvent include `shot`, `bounce`, `explosion`, `damage`, `heal`, `death`, `turn`, `end`, `item`, `message`, `actionStart`, and `actionEnd`. Position/effect events may include `{x,y,value,text,team,kind,radius,tankId}`. Root sends supported events to renderer and sound. Projectile events carry `ownerId`, `sourceTeam`, `shotId`, `volleyId` where applicable; consumers must not infer the attacker from the current active actor because delayed effects can outlive a turn.

### Whole-action events

An accepted attack or support action emits `actionStart` once and `actionEnd` once after resolution. A volley includes all simultaneous and repeated projectiles. The event payload is:

```js
{
  type, volleyId, ownerId, team, sourceTeam,
  tankName, weaponName, weaponId, role, delivery,
  angle, power, face, wind, shots,
  damageToEnemy, friendlyDamage, kills, hits, heal, terrainRemoved,
  reason
}
```

At action start, `shots` is the planned effective projectile count and totals start at zero. At action end, `shots` is the count actually released, and the other totals describe that action. `hits` counts distinct affected targets, not repeated hit events. `reason` describes the resolved outcome, such as support, hit, terrain or miss. `state.lastAction` stores the final payload for HUD feedback. Use `actionEnd` for a whole-shot summary; use per-projectile `shot` for projectile counts and visual effects.

Gameplay: fixed timestep flight with substep collision; circle explosions destroy mask; tank ground settling and void KO; radial damage with source attack used as input, not a claim of exact damage formula; delay turn scheduler; wind per turn; movement budget; 25-second default timeout; shot resolves before next turn; win/draw and restart; same-device hotseat; bounded tactical AI. Classic two weapons, blue3 four weapons / unlock-round model and 7+3 round model. If multiple projectiles/repetitions, end only after all resolve. Robust no NaN, no off-map active turn, no timer during flight. Recoverable deterministic seed. Both teams eliminated or equal round-limit scores produce a draw; seed parity does not break ties.

AI scope for this revision: evaluate available weapons, aim candidates and situational support from the current position. Safe-movement planning and teleport repositioning are outside this revision. Do not describe those tactics as implemented.

## Renderer — `window.FortRenderer`

`new FortRenderer(canvas,game)`; methods `setGame(game)`, `render(dtSeconds,{guide:true,quality:'high',zoom:1,reduceMotion:false,feedbackBounds:null})`, `handleEvent(event)`, `screenToWorld(clientX,clientY)`, `destroy()` optional.

`feedbackBounds` is an optional `{x,y,width,height}` rectangle in canvas CSS pixels for the visible DOM action summary. The app caches it on content/visibility/size changes. HP labels, damage numbers and impact labels avoid this rectangle; world impact markers retain their actual coordinates. Use `null` when the summary is hidden.
Static `FortRenderer.drawPortrait(canvas,tankDef,team=0)` for roster buttons.

Canvas resizes using getBoundingClientRect and DPR capped2; fits world by default, zoom follows active tank or projectile. Renderer does not mutate gameplay. Terrain cached per version and theme; layered sky, far scenery, floating land cutaway, plants/rock edges; expressive original vector tanks distinct silhouettes; rotating barrel, tracks, team accent, HP shields, projectile trails, blast/rings/debris/damage numbers. Camera shake bounded, no effect artifacts after reset. Reduced motion supported. Render entire meaningful combat at all screen sizes.

## Root app/UI

Root owns index/style/app; menu with profile, tank, team size, map, difficulty/control. HUD round/wind/order; side team HP cards; canvas; weapon buttons, angle/power sliders, facing, movement, item buttons, charge fire, skip/pause/sound/fullscreen, restart. Touch and keyboard, responsive landscape/portrait. Collapsible data/tuning panel classifies published values versus model constants outside main player flow. Save preferences locally; no online multiplayer claim.
