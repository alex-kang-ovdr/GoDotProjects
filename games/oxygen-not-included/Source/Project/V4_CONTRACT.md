# Breath Colony v4 · Safe Expansion Contract

This contract fixes the public engine/UI/renderer interface for the v4 pass. Internal implementation is owned by engine_v4. Existing v3 behavior must remain equivalent when no new equipment/rooms/allocated skills exist. Save v4, 20 objectives, stage 5. Root owns UI and publication.

## Owners

- engine_v4: dist/engine.js, utilities.js, community.js, new frontier.js.
- render_v4: dist/renderer.js only.
- test_v4: tests/, examples/, README.md, CHANGELOG.md.
- root: app.js, index.html, styles.css, package/build script, START_HERE, QA_REPORT, contract, exports/deployment.

## Buildings

| key | name | cost | unlock | behavior |
|---|---|---|---|---|
| door | 기밀문 | rock6 metal4 | 0 | one cell, requires floor, actual open/closed fluid blocking and locked navigation |
| oxygenDock | 산소 충전소 | rock20 metal12 | 45 | 8W, compresses actual ambient oxygen into its own tank, crew visit to refill |

Every building has `doorMode` ('auto' for door, null otherwise), `doorOpen` (boolean), `oxygenStored` (0 normally), `oxygenCapacity` (18 for oxygenDock, 0 otherwise). Incomplete docks have no usable storage; no phantom production.

`setDoorMode(buildingId, 'auto'|'open'|'locked') -> {ok,message}`. Auto opens for actual nearby/transiting living crew, closes otherwise; open stays open, locked stays shut and impassable. Refuse locking an occupied door cell. Change invalidates path cache and rechecks affected paths. Door cell is not terrain solid. Closed doors stop oxygen/CO2 exchange and terrain water transfer on both sides; they do not erase stored fluids. Heat still conducts. Wire/pipe layers may cross doors. Generic enabled toggle should be hidden for doors (mode is the control). Building/room classification treats every completed door as a structural boundary even while open, like a room entrance.

Dock compresses max0.08 oxygen units/sec from actual nearby revealed open cells (radius2 recommended), leaving at least0.35 oxygen in each source cell. Tank cap18. Requires real power, enabled, not flooded, not overheated. Full tank is normal standby. No water pipe needed. Crew refill by visiting the actual dock cell, transfers max1.5 units/sec from dock to portable tank; stored-oxygen transfer requires completed/enabled/unflooded/reachable tank, but not current electrical power; never creates oxygen. A dock deconstruction must preserve stored oxygen by releasing it into available nearby gas cells or refuse if there is insufficient room; no silent deletion or duplication. Save/interrupt preserves tank and transferred amount.

## Portable oxygen

Every crew has `portableOxygen:0`, `portableCapacity:6`, `maskMode:'auto'|'off'` (defaultauto), `usingPortable:false` (actual current breathing).

`setCrewMaskMode(crewId,mode) -> {ok,message}`.

Auto refills from a reachable active/usable dock when portable oxygen is low; low hunger/energy/emergency ambient breathing remain priorities. Refill is an actual job kind `refillOxygen`, targetId points to dock, no teleport. With modeauto, use portable oxygen only when the current ambient cell is unbreathable (same threshold as base crew breath). Consumption0.055 units/sec, oxygen consumed instead of taking oxygen from current cell; breath recovers normally. Can breathe in flooded cells, but is NOT a heat suit, does not negate temperature or movement cost. Off preserves remaining oxygen and does not refill/use it. Empty portable tank falls back to normal breath loss and emergency retreat. Death preserves portable contents in a physical/validated way (release into gas or retain on body); state must serialize consistently.

`game.equipment={stored,carried,capacity,chargingStations}` derives sums from actual dock/crew tanks, capacity is completed dock capacity, chargingStations counts currently active compressors. `production.oxygenCompressed`, `production.oxygenRefilled`, `production.portableOxygenUsed`, `production.protectedSeconds` are actual cumulative amounts/duration. No double counting transfer as production.

## Actual experience and specialization

Every crew has `experience:0`, `level:0`, `skillPoints:0`, `skills:{dig:0,engineering:0,life:0}`. Threshold60 productive work seconds/XP per level, cap6levels (experience may cap360). Points earned on level-up; each rank costs1, each skill max3. Level/points/ranks consistency checked on load. Existing saves start these fields at0.

`trainCrew(crewId,'dig'|'engineering'|'life') -> {ok,message}`. No free/negative training. Manual spending, no automatic skill allocation. Skills persist through role/schedule changes. Record XP only for real productive work, not walking/idle/unpowered waiting. Explain exact XP-eligible work in README.

- dig (굴착): +20% dig speed/rank.
- engineering (공학): +15% build/deconstruct speed/rank and +10% research speed/rank.
- life (생활): +15% cook/harvest work speed/rank.
- Multiply existing stress efficiency; no skill changes base yields or grants resources. Default ranks0 preserve baseline.
- `production.trainingPointsSpent` actual allocation count (or validated sum of all ranks, deaths included); `stats.totalSkillRanks` is available.

## Rooms and bonuses

`game.rooms` is a list of structural connected components derived from terrain and completed doors. Cells are numeric flat indices `y*w+x`. Room.id is stable (minimum cell index, does not consume global IDs). Return meaningful components that contain revealed cells/buildings; no hidden-map spoilers. Walls are natural solid or completed tiles, completed doors separate components. World edge touching is unsealed. Recommended qualifying area6..64, >=1 door boundary.

Each room: `{id,type,name,cells,area,bounds:{x1,y1,x2,y2},buildingIds,doorIds,sealed,valid,reasons:[],bonus}`. `type` is 'bedroom'|'messhall'|'greenhouse'|'generic'. `valid` means a specialized usable room; generic/unsealed/too large gets clear reasons. `bonus` is a short human-readable description. `game.roomAt(x,y)` returns room or null. Recompute/cache after relevant structure changes, never write game state from renderer.

- bedroom / 침실: >=1 completed enabled cot; no farm, kitchen, toilet or industrial machine. +25% bed energy recovery; extra stress recovery0.2/sec during actual rest.
- messhall / 식당: >=1 completed enabled mess; no cot/farm/toilet/industrial machine. Kitchen/fridge/storage allowed. Actual table meals get extra stress reduction3.
- greenhouse / 온실: >=2 completed enabled farms; no cot/mess/kitchen/industrial machine. +20% actual farm growth while base supply/temperature/oxygen/water conditions pass; no free water/harvest.
- Industrial disallowed list: generator,coalgen,hydrogenGen,research,purifier,electrolyzer,pump. Explain classification and structural-open-door distinction.

Counters `production.bedroomRestSeconds`, `production.messhallMeals`, `production.greenhouseHarvests` reflect actual use, not buildings existing. `stats.validRooms` count, `stats.specializedRoomTypes` count available. New overlay `'rooms'`, hotkeyR; actual cells/boundaries, type colors, chosen-room emphasis, useful unclassified reasons. Oxygen overlay unchanged.

## Progression

Preserve all16 old objectives and add:
- `rooms`, stage5, target2: usable bedroom AND messhall (number of those unique types, not two identical rooms), tooldoor.
- `training`, stage5, target3: 3 skill ranks manually allocated across crew, no required role. toolnull.
- `portable`, stage5, target30: actual portable-oxygen breathing time summed across crew, 30seconds; tooloxygenDock.
- `frontier`, stage5, target180: current safe expansion conditions180seconds continuously.

`game.frontier={seconds:0,target:180,healthy:false,reasons:[]}`. Current conditions require community.settlement.healthy, usable bedroom+messhall, allocated ranks>=3, protectedSeconds>=30, a completed enabled power-connected unflooded dock; do NOT require compressor active when its tank is full. Ensure all living crew can access relevant rooms/dock. Reason list honest. New final win only20done; v3won becomesfalse while preserving old completed objectives. Once achieved, goals/win remain historical; current timers still update and may reset.

## Saving and validation

Version4 serialization and v1/v2/v3 migrations. Existing fixtures preserved. New field validation, enum/range/ID checks, portable/dock mass summaries and XP consistency, rooms derived consistency, objective/win consistency. Failed load is atomic for both current game and caller input. Keep structural room and current environment caches derived; no UI-only values trusted. Existing chains can expose `_prepareCommunitySave` to reuse v1/v2 migration before appending v4 goals. UI saves to breath-colony-save-v4, migrates v3/v2/v1 in that order and pauses on migration; legacy keys remain.

## Verification and normal route

Existing48tests remain with intended version/goal expectation adjustments. Add meaningful tests for actual door flow/navigation/open modes, room boundary/breach and real bonuses, compressor and refill/use conservation, interruptions/empty retreat, XP no-idle and effect, migration and corrupt-save atomicity. Public API only normal newGame→20goals; additional10cycles survival/production; report current timer behavior honestly.

V3 extension ends with limited ore; acquire additional reachable resources through actual mining/hauling. Low rooms are buildable without teleport/scaffolding: top bedroom ceilingy9, insidey10..11; lower messhall ceilingy14, insidey15..16. Existing bedscots15..17,11; mess20,16. Need actual planned wall/door construction and safe worker access. If contract tuning is necessary for a reproducible route, communicate reason before adjusting shared interface; no cheating fixtures for normal route.
