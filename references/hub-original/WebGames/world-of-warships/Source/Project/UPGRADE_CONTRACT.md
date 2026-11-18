# IRON TIDE V2 — Complete surface-combat loop

Maintain classic JavaScript, no runtime dependency, file:// execution, existing IronTide namespace and APIs. Existing published Site identity/audience unchanged. Root owns index.html/game.js, packaging, browser QA and publication. Engine owns sim.js + simulation.test.cjs. Operations agent owns operations.js + operations.test.cjs + README candidate. Renderer owns render.js + style.css. Do not change another owner's files without agreement.

## Script order

operations.js, sim.js, render.js, game.js. operations defines pure data/helpers before sim, invokes sim only when helper called after all scripts load. Root loads `operations.js` first.

## Operations and loadouts

`IronTide.OPERATIONS`: keys northern, bastion, openwater. Each `{id,name,subtitle,description,mode:'domination'|'control'|'elimination',world:{w,h},islands:[sameellipse],zones:[{id,x,y,radius,progress:0,owner:null,contested:false}],spawns:{blue:[{x,y}],red:[{x,y}]},duration,targetScore,initialScore}`. Exactly3 ships each team. Original northern retains oldmap/spawns. Bastion differentlayout withsinglecentralzone,640points/420s, initial180. Openwater scatteredislands withnozones,eliminationmode/300s,initial0; timeoutuseslivingteam HP share (engine). Allspawns clearislands,objectivesreachable. NamesKorean readable, descriptive distincttactics. Dataimmutable notshare mutablezoneobjectsbetweenrounds.

`IronTide.LOADOUTS`: balanced, artillery, survival, maneuver. Each `{id,name,description,modifiers:{reload:1,maxHp:1,maxSpeed:1,turnRate:1}}`. Balanced1; artillery reload.88/maxSpeed.94; survivalmaxHp1.10/reload1.08; maneuvermaxSpeed1.10/turnRate1.15/maxHp.92. Allunlocked playerchoice withtradeoffs. EnginecreateGame accepts `{shipClass,difficulty,seed,operationId='northern',loadoutId='balanced'}`. It copiesoperationfields and appliesloadout modifiers onlytoplayer, records g.operationId/g.loadoutId/g.mode, preserves all existingcontract state. Profilebasefrozen. Enginecan fallbackoldnorthern ifoperations.js absent (oldtestscompatibility). Dossier rootshowsmodifiedstats.

## Combat engine additions

1. Ship `sections:{bow:{hp,maxHp},mid:{hp,maxHp},stern:{hp,maxHp}}` totrackregionaldamage/saturation. Direct damage reducedaftersectiondepletion, neverimmunity. `recoverableHp` tracksactualrecoverabledamage; repair consumesledger with18%maxHP perchargecap. Damagecategoryfactor documented. Existingrepairtestfixturemustdealreal damageorprovideledger, notimplicitcheatfallback. AddUI-friendly healingpreview.
2. Ship `modules:{engine:{state,time,maxTime},rudder:{state,time,maxTime},guns:{state,time,maxTime}}`, state normal/damaged/critical. Auto recovery. DCPclearsdamaged,criticalrecoversbytime. Engine/rudderpenalties andgunreloadpause; no permanentloss. Damageimpactregion andseededchance trigger. Events type module, fullKoreantext, visiblegated. Timer fieldseconds. Rootreadsonlyplayer modules. Module effects mildenough forplay.
3. `getWeaponSolution(g,ship,ammo,aimX,aimY,spread='narrow')` returns `{ready,reason,inRange,blockedByIsland,barrels,totalBarrels,flightTime,bearing,range,arcValid,reload}`. reason oneof ready/cooldown/traverse/arc/range/obstructed/noammo/disabled. ConsistentwithtryFire androotHUD. Shelloriginalrangeclampcanremain butoutofrange solutiontellsuser (enginepreferfalseuntilwithinrange;documentchoice). Torpssidefiringarc: DDrelativebow30..150degrees onbothsides, CA45..135; narrow/wide spreads.Caller `controls.spread` and `firePlayer(g,ammo,x,y,spread)`. AI steers tobringtorpanglesintovalidsector andonlyfireswhenvalid. Existingtestsaimbroadsidefixture update.
4. Modestautomaticsecondarybattery CA/BB, visibleenemieswithinrange, projectilesmarked`secondary:true`, smallHEdamage, bounded, existingfriendly/visibilityrules. `stats.secondaryDamage` andoptionalhits.
5. `g.stats` add `{penetrations,overpens,ricochets,shatters,citadels,fires,floods,secondaryDamage,potentialDamage}` nonnegativecounters. `g.damageBreakdown:{HE:0,AP:0,TORP:0,FIRE:0,FLOOD:0,SECONDARY:0}` applieddamage only. Neverdamage>remainingHP. hit eventsresultusedribbons. Add `g.warnings:{torpedo:boolean,torpedoBearing?:number,torpedoDistance?:number}` usingonlydetectedhostiletorpedoes withpredictivecourse.
6. `issueOrder(g,{type:'focus'|'capture'|'regroup',targetId?,zoneId?})`: validatesvisibleenemyorrealzone, sets `g.order={type,targetId,zoneId,until:g.time+25}`. AIallies obey whenpossible,do nottrackunseen targetoracle; nohiddenfeedback. Repeatedorders replace. RootFfocus, Gcyclecapture, tacticalmaptapzone capture. Eventsorder.
7. SerializableRNG state and`serializeGame(g)` => `{version:2,data:<JSONstate>,rngState}`. `restoreGame(snapshot)` => game ornull forinvalid; validatedbounds/enums/counts andfiniteworld/ships/projectiles, noexecutionoruncheckedObject.assignoflocalinput. Preserve RNGexactcontinuation,playerreference,allstate/consumabletimers. Trimtransienteffectseventsifneededbutdon'tchangecombat. Saveonlyphaseplaying; restorecanrejectended. Add40+meaningfultests asneeded (countnotmandatory). Keepcurrenttests behaviorexceptexplicitnewrulesfixtures.

## Operations progression helpers

Expose `IronTide.Career` object with:
- `empty()` => `{version:2,xp:0,battles:0,wins:0,bestDamage:0,history:[],operations:{}}`
- `normalize(value)` => safevalidatedcareer; importv1stats handledrootoptional. historymax20, operationskeysvalid. rankderivefromXP.
- `rank(xp)` => `{name,level,current,next,progress}` (currentxpwithinlevel,nextxpneeded,progress0..1). Koreanranks e.g소위/중위/대위/소령/중령/대령.
- `summarize(g)` => `{operationId,shipClass,difficulty,won,phase,damage,kills,hits,shots,caps,time,hpRatio,accuracy,xp,stars,score:[x,y],damageBreakdown,achievements:[{id,label}]}`. Accuracyratio0..1. Stars0..3: win1,damage>=ownbaseHP*.5one, remainingHP>=.35orcap>=1one; capat3anddefeatmax1 toretainmeaning. XPdamage+win+caps thresholdfinite nooversizedreward. achievementrealrequirements (citadel>=1, torphits>=2, caps>=2 etc).
- `record(career,summary,matchId)` returnsnewcareer andisidempotentonmatchId; engine sets uniqueg.matchId? rootsetsoncreatewithseed+date, ensure restoredsame. History entrysummary+id+dateISOrootmayprovide? `record` usesDate.nowonlymeta, deterministicstate testsnotdependdate.
- `read(storage)` / `write(storage,career)` optional noDOM global. rootcanJSONlocalstoragecatch.
Operationsagentmustcoordinateexactnameswithengineandroot. Noexternal APIs. WriteREADME-v2 candidate withverifiedscope,controlsrootannounced.

## Renderer V2

ReadnewgetWeaponSolution ifexists; colorreticlemintready,amberreload/traverse,redarc/obstructed/range. Showreadybarrels,totalbarrels andflighttime nearreticle instead ofsilentlyclamp. Torpactualsidearcvisuals plusnarrow/widecone; defaultprofilesmissinggraceful. sectionvisualdamage/darkens,smallmodulewarningiconsnearplayerONLY,secondarytracerssmaller, enemyhiddeninformationnotshown. `view` add `spread`, `binocular`, `solution`. Binocularvisualframeandreticles; rootcontrolscamera/zoom. Renderoperationpalette ifdataoptional. G.ordercapture/focusrouteindicator onlyknownpositions. NewUIstylesforrootIDsbelow.

## Root UI additions (renderer CSS support)

Harbor `.operation-settings` 2selectfields: #operationSelect, #loadoutSelect; #operationDescription briefline; #resumeBattle secondaryfullbuttonwith#resumeLabel; #careerPanel rank/xp; `.career-fill` #careerFill; #careerRank/#careerXp. Harborcontentscrollatshortheight keepdeployvisible. Missiondynamic #missionName/#missionGoal/#missionDetail. Battle `.tactical-tools` #binocularButton (V), #spreadButton(C), #focusButton(F), #captureButton(G). New #weaponSolution smallstatus. #moduleStatus compact3modules inship-panel. #damageRibbons aboveweapons (counts5). #torpedoAlert optionalstatus. New #autosaveNotice inpausemodal. Result #resultStars #resultXp #resultAccuracy #damageBreakdown #resultAchievements and#nextOperation button. Rootmayaddmatchhistorymodal ifneededaftercorefirst.

Controls retained; additionsVbinocular/Ctorpspread/Ffocus/Gcapture. Phonebuttonswork. Pausealwaysfreezesallgameplay;helpdoesnotresumeunderneath. AutoSaveevery3s andonpause/visibilityexit; finishclearsactiveSaveandrecordsresultonce. Reloadreturnsportwithresume. Root preservesv1stats duringcareerupgrade. SourceZIPmustregeneratedfromexactfinalstate anddeploymentpublished.
