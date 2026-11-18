# IRON TIDE V3 contract — playable surface warfare

Keep vanilla classic JS, Canvas, offline file execution, current Site ID/audience, and V2 career/active saves. Root owns game.js/index.html/docs/packaging/browser. Engine owns sim.js + simulation tests. Progression owns operations.js/training.js + progression/training tests. Renderer owns render.js/style.css. Work only assigned files. No optional features outside this scope.

## Engine

Fix reproduced grounding loops, reverse steering, world-edge velocity consistency and escape. AI prioritizes engageable visible contacts, with modest target hysteresis. Explicit capture orders hold an uncontested zone through actual capture unless genuinely threatened; put AI repair/DCP outside visible-contact-only branch. Tighten turret alignment so rendered barrel and fired direction agree; expose numeric solution.alignmentTime. Document tolerance. Preserve deterministic simulation.

Add g.trainingMode=false (training adapter sets true). checkEnd for training handles player death but skips regular score/timeout/enemy-elimination victory; Training owns lesson completion. serializeGame must return null for training. No campaign metadata required inside engine; root owns separate control envelope.

Player hit events must include ammo:'HE'|'AP'|'TORP', ownerId, result, damage; main shell hits use secondary:false. Existing event schema already supports ammo/ownerId; add secondary to allowlist if emitting. Torpedo hit result is 'torpedo'. This lets lessons use actual damaging hits and UI classify zero-damage ricochets/shatters. Do not add hidden-target positions to UI.

Snapshot V3 adds only necessary new engine fields. Capture real V2 fixture before edits, migrate validated V2 -> defaults for new state, retain projectiles/RNG/matchId/resources. Strict validation remains. Restore V3 roundtrip must be deterministic; tests include V2 fixture, real successful island escape, actual capture completion, engageable-target choice, turret alignment.

## Progression / operations.js

Keep OPERATIONS/LOADOUTS unchanged (three free operations). Career storage key remains iron-tide.career.v2; version becomes3, normalize V2. Existing XP/stars formula unchanged. Extend clean summaries with loadoutId default balanced, sessionType free|campaign|training default free, campaignRunId default null, campaignStage default null. `Career.summarize(game,context={})` accepts these metadata fields. Training reward always0; Career.record rejects training and does not add identity/battle/XP.

Add career.classes[classId] {battles,wins,bestDamage}; operations[id].bestByDifficulty {easy:0..3,normal:0..3,hard:0..3}. Do not guess historic difficulty from aggregate V2bestStars; histories may supply known values. History retains loadout/difficulty.

Campaign is nested in same career write for atomic progression:
`career.campaign={runId:null|string,status:'idle'|'active'|'completed',stage:0..3,difficulty:'easy'|'normal'|'hard',attempts:0,totalDamage:0,totalXp:0,results:[]}`; results contain at most three victory summaries+matchId. Add career.campaignCompletions nonnegative. Export `CAMPAIGN_STAGES=['northern','bastion','openwater']` frozen.
`Career.startCampaign(career,{runId,difficulty})` returns normalized new career; active run is retained, idle/completed creates new run.
`Career.record` updates campaign only when a nonduplicate summary has sessionType campaign, matching active runId, stage and expected operation/difficulty. Loss/draw record attempt but do not advance; win increments stage and stores result. stage3=>completed +campaignCompletions once. Free wins never advance campaign. No bonus XP or power unlock.

## Training / training.js (after sim.js, before render.js)

Export `IronTide.Training` with pure JS functions:
- `create({step=0,seed=711})` -> session `{game,step,stageComplete:false,failed:false,complete:false,...}`. Exactly five lessons, fixed cruiser so all weapons available. game uses real simulation and g.trainingMode=true. Unused ships can be hp0/alivefalse; bots are declared stationary target ships and aiDisabled=true. Each step is a separate fresh scene, explicitly reset on next/retry. No hidden invulnerability or fabricated hits.
- `tick(session,dt,controls)` calls tickGame and evaluates actual movement/damaging player HE hit/damaging AP hit/torpedo hit/actual player zone capture. Wrong ammo/secondary/DOT cannot pass gun lesson. Early target destruction with wrong weapon sets failed and supports retry. Evaluate fresh event IDs including ammo, not merely current selected ammo. No auto-advance; freeze after pass/fail.
- `advance(session)` returns fresh next-step session; final step marks complete. `restart(session)` returns fresh same-step session.
- `brief(session)` -> `{index:1..5,title,instruction,goal,progress:0..1,complete:boolean,failed:boolean,targetId:null|string,checkpoint:null|{x,y,radius}}`. complete means current lesson passed, session.complete means entire course passed. Failed explanatory text may be in instruction.
- `progress(session)` -> `{version:1,step:0..4,completed:boolean}`; `normalizeProgress(value)` validates safe progress. Root saves to iron-tide.training.v1 after lesson/end/harbor; reopens current lesson fresh. Regular active battle is preserved. Training never awards XP/wins or progresses campaign.

Tests exercise all five lessons using actual movement/projectiles/capture; no test-only controls in UI. Reset scenes avoid exhausted targets blocking later lessons. Keep spawn geometry friendly for default viewport; avoid long empty travel. Training metadata does not enter engine snapshots.

## Root controller/UI

Control envelope in existing active-save key: optional `control` containing validated ammo/spread/aimX/aimY/binocular/targetId plus sessionType free|campaign/campaignRunId/campaignStage. V2 envelopes without control resume as free and use saved ship aim. Simulation state unchanged. Retain settings across resume. Training save uses separate progress key only and cannot overwrite regular active battle.

Camera transform computed before pointer world projection; renderer and input use same camera/zoom in current frame. Binocular lead uses chosen ammo speed. Explicit click/tap selects visible projected hull/nameplate with44–56px minimum target; ordinary pointer movement doesn't retarget. Losing contact keeps selected ID/last-known focal position; no silent nearest-target camera switch. Add `targetButton` (Tab) and `leadButton` (L) to select visible target and set aim once to predicted point; no oracle/autofire. Lead sets pointer=null so stable world aim until next manual input. F remains allied focus.

Fresh player hit-event groups drive feedback incl ricochet/shatter0damage; use per-category deltas for quiet ongoing FIRE/FLOOD/SECONDARY totals. Never label DOT using stale last shell result. Root may place this in existing hit headline plus new small sustained label.

Harbor adds trainingButton, campaignButton and campaign progress card. Free operation picker stays. Difficulty easy user label becomes 입문 to distinguish guided training. Show operation mastery per difficulty and class history. Training HUD panel with step/title/instruction/progress; stage pass/fail overlay has trainingContinue/trainingRetry/trainingExit. Training results skip normal result/record. Campaign results explain next/retry/completed and action follows win-only stage. Existing free next-operation remains a choice.

## Renderer/CSS

Renderer accepts view.training=Training.brief(session) or null; draw checkpoint ring+number and visible target training marker. view.contactLost boolean, view.contactLostPoint optional safe last-known point; view.aimAssistHint optional for one-shot lead indicator. Improve readable aim/range/side arc and world-edge/grounding warning using engine state. No unseen enemy tracking. Root owns camera math, input picking, feedback logic. Renderer may add pure method `setViewTransform` if useful; coordinate with root.

CSS for root's planned class/IDs to be communicated before implementation. Keep current dark maritime visual direction; ensure actions reachable at390px and desktop. No new external assets required.
