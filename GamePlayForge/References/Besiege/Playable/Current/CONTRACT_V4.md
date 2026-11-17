# IRONWOOD 4.0 integration contract

V4 closes the experiment → diagnose → revise loop, adds a real linear actuator, grouped construction and a steering trial. Preserve V1–V3 machines, missions and saved blueprints. Never drive physical bodies by editing their transforms or velocities to simulate an actuator or pass a mission.

## Ownership

- mechanical_physics: `dist/physics.js`, optional `dist/linear-actuator.js`, `tests/physics_v4.test.mjs`; piston mechanism and switchback geometry. Coordinate preset tuning with data owner.
- flight_water_weapons: `dist/parts.js`, `dist/editor.js`, `dist/campaign.js`, new `dist/designs.js`, their tests. Group transforms, named design slots, piston catalogue/preset and mission metadata.
- assembly_ux: `dist/scene.js` only; piston rendering, multi selection, play-mode selection, separated stress/damage overlays, report highlights, land route markers.
- root: main/index/styles/input, report module/tests, docs, packaging and publication.

## Piston

Type `piston`: mass1.8, cost4, HP70, categorymechanism. Body is the moving head. One support at `(x,y-1,z)` forms a `piston` connection, one ordinary upper payload at `(x,y+1,z)` is fixed. Side contacts do not weld it. Wheel cannot support it. Mechanical stacks should be consistent with hinge stacks. Power uses existing .3..2. Optional `stroke` .25..2 metres, default1.5; omitted in older saves is accepted. Explicit invalid/null is rejected. New/imported/copied piston receives default. Other part properties remain compatible. Strength1800.

Input adds `actuate` -1..1: positive extends along support-local +Y, negative retracts. UI Z/X in play, dedicated touch buttons. Neutral holds target with finite force. Disconnected actuator loses powered holding/motion; its intact guide may stay. Breaking the guide removes it. Travel must respect bounded target and force limits; no body transform/velocity overrides. Changing a constraint target/pivot with finite force is acceptable; document the exact implementation and approximation.

`getPistonState(partId)` returns null for non-piston, otherwise serializable `{extension,target,stroke,load,connected}`; extension is actual measured travel, load is normalized actuator effort 0..1, connected is active core connection. Scene derives actual endpoints from simulation bodies and connection a→b, so it follows a rotated support and does not fake motion. Ensure normal stacks and lower output do not explode or fall apart at startup. Tests cover extension, retraction, neutral holding, bounded force/stall under heavy load, disconnect, and old regression compatibility.

Preset `lift` is a connected, stable small lift rig with support, piston and visible upper payload, no firearm required; recommended sandbox. Data owner creates; physics owner requests/tunes through owner. It should work with ordinary Z/X controls and show real payload raising.

## Steering mission

Add `switchback` / 굴곡 주행 / land / route / recommendedPreset `ram` / 4 checkpoints / budget55 / ammo0 / timeLimit150 / parTime45 / parShotsnull, after skyway before sandbox. Existing five campaign order retained, skyway→switchback→null. Geometry owned by physics: fair alternating X offsets, all Z decrease within bounds; gates cannot all be passed by W only. Avoid compulsory impact damage; show ordinary obstacle markers where useful. Real completion test uses ordinary forward/turn/brake inputs only. Existing straight beginner routes unchanged.

## Group editing

`planGroupTransform(parts, selectedIds, options)` pure atomic planner, returns `{ok,parts,selectedIds,error}`. Options: `kind:'move'|'copy'|'rotate'|'mirror'|'delete'`, `delta:{x,y,z}` (move/copy), `pivot:{x,y,z}` (rotate), `turns:1` default for rotate, `createId`. Mirror around world X=0 using existing mirrorPart. Rotation about integer pivot, Y positive quarter turns maps `(dx,dz)` to `(dz,-dx)` and increments rot. Reject any mutation including a core; preserve source array/objects. Reject no/missing IDs, overlaps, bounds, schema and >100 parts before returning. Disconnection is allowed for drafts. Return moved IDs or copied fresh IDs; delete returns empty. A failed command never consumes history or changes a subset. Root provides 6 nudge buttons and copy using a chosen nudge direction, rotate, mirror, delete; pointer relocation remains for one part only.

## Named design storage

New `dist/designs.js` pure schema, max8 named slots, each stable slot ID, name<=40 chars, timestamp and blueprint; authoritative normalization via normalizeBlueprint, known mission fallback. Keep draft/backup/legacy quick save. Provide normalize/save/delete helpers and migrate a legacy quick save only once into an empty new collection. Never overwrite another slot silently; when full return an actionable error. Root displays a list with load, rename, explicit replace, delete; no confirmation needed for load because existing backup remains. Exact helper signatures must be messaged to root before implementation ends. Treat stored names/IDs as untrusted text; root uses textContent, no interpolated HTML.

## Scene API

- `setSelections(ids, primaryId)` preserves existing `setSelection(id)`; gold primary, teal others.
- `onSelect(id, {additive})` sends Shift/Ctrl/Meta state; play clicks allowed, root pauses and shows a read-only inspector.
- `setStressMode('load'|'damage')` keeps setStressVisible; load colors only instantaneous stress ratio, damage colors only 1-health. No max() conflation.
- `setReviewHighlights(ids)` marks affected original design parts when back in build, separate from current selection and disconnected diagnostics.
- Render piston from real moving head and support endpoints; broken links disappear appropriately.
- Existing land route now gets sensible grounded gates; water/air unchanged. Group camera/selection stays bounded. CPU scene checks allowed; no browser workaround.

## Report and UI

Root creates a bounded, serializable test report from actual physics events/samples: per-part damage, first break, reason, peak connection load, summary and suggestions linked to exact part IDs. Include sample cadence when describing peaks. Preserve most recent run across return-to-build in session, and mark whether current design has changed. Report does not restore or mutate simulation. Clicking report part selects it in play or original design when still present. Paused inspection exposes HP, connected/dead, attached connections, stress, health, piston actual/target travel. A 1/60-second single-step is allowed only while paused and without held input. Mobile gets accessible test controls and report button. Terminal/record guards remain.

## Acceptance and release

Run original60 tests plus meaningful new physics/data/report/input gates. Do not add superficial implementation-mirroring tests. Old JSON/progress remains compatible. Validate DOM IDs and self-contained HTML and source ZIP. Browser GPU disabled in the prior managed preview; if still unavailable report that limit, no alternate browser bypass. Root alone owns source helper, build/package, owner-private Site deployment. Reuse project ID and audience.
