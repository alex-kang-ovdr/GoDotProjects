# Last Light implementation contract

Buildless ES-module vanilla JavaScript game. dist/index.html, styles.css, app.js by root. engine.js by economy agent. expedition.js by night agent. scene.js by visual agent. Never edit another owner's files. All assets original code/vector/canvas. Korean UI. No dependencies.

## Core engine exports (engine.js)

export ITEMS object: keys wood, parts, water, raw, meal, fuel, meds, bandage, cloth, crowbar, knife; each {name, short, color, stack, description}. Export FACILITIES, RECIPES if useful.
export createGame(seed=number): state.
state {version:1,seed,rng,day:1,phase:'day'|'planning'|'expedition'|'report'|'ended',clock:360,paused:true,speed:1,selectedId:'mira',inventory:{item:count},characters:[{id:'mira'|'yun'|'leo',name,role,trait,color,capacity,health:100,hunger:0..100,fatigue:0..100,morale:0..100,illness:0..100,alive:true,job:null}], facilities:{bed:1,stove:1,workshop:1,collector:0,heater:0,barricade:0,trap:0}, cleared:0, visitor:null, logs:[],stats:{},report:null, ending:null, history:[],nightPlan:null}.
Provide useful balanced stocks (day1 raw4 meal3 water8 wood12 parts14 fuel4 meds1 bandage1 cloth3, no weapon).
Jobs {id,label,target,remaining,total}; target codes kitchen,bed,water,workshop,radio,door,rubble,heater. Day job durations in game minutes, tick advances ~12 game min/sec. Don't run until unpaused; actions may unpause.
getActions(state,charId) -> array {id,name,description,cost:{},duration,target,category:'survival'|'craft'|'build',available:boolean,reason:string}. Include eat,rest,cook,water,fuel,heal,bandage,talk,clear,craftCrowbar,craftKnife,buildBed,buildCollector,buildHeater,buildBarricade,buildTrap,upgradeStove. Immediate eat okay. Insufficient resource checks transactional. A running job blocks other jobs.
performAction(state,charId,actionId) -> {ok,reason?}; mutates.
cancelJob(state,charId) -> {ok,reason?}.
tickDay(state,deltaSeconds) -> {changed,phaseChanged?}; don't progress day while overlay visitor user choices open? Root pause via state.paused. Jobs complete by elapsed min. At20:00 phase planning.
endDay(state) -> {ok,reason?}; completes appropriate elapsed jobs to20:00 then phase planning.
beginNight(state,plan) -> {ok,reason?,context}; plan={scavengerId:string|null,locationId:string|null,roles:{id:'guard'|'sleep'|'scavenge'},loadout:{item:qty}}. Validate unique role, present character, bag capacity, quantities. Remove loadout ONCE. Store nightPlan incl pre-night inventory/roles. phase expedition (even if no scavenger root immediately finishes).
finishNight(state,result) -> {ok,reason?}; result={bag:{},health:number,injury:number?,fatigue:number,moraleDelta:number,dead:boolean,late:boolean,events:[],locationId,lootTaken:{},killed:number,theft:number,escaped:boolean}. Resolve raids USING REMAINING INVENTORY, then add returned bag once, update characters needs/recovery/food not auto consume prepared meals unless documented, cold days4–8, visitor choice days, report. phase report, no new day yet.
nextDay(state): from report day++,clock360; if day>12 end victory if alive, if all dead defeat; else phase day paused true, new visitor schedule. No arbitrary permanent locking.
chooseVisitor(state,choice) -> {ok,reason?}; visitor object {id,title,body,kind:'trade'|'choice',options:[{id,label,description,cost?}]}.
trade(state,offerId) -> {ok,reason?}; visitor.offers:[{id,label,give:{},receive:{}}] validates resources.
usedSlots(items) -> ceil count/ITEM.stack summed; state clone/export/validate imports handled root but export isValidSave(state) if possible. Export serializeGame and restoreGame with strict validation (optional).
logs item {day,text,type:'info'|'good'|'bad'} newest first max50. Reports {title,summary,items:[{text,type}],loot:{},raid:{occurred,damage,stolen},deaths:[]} (additional allowed). ending {kind:'victory'|'defeat',title,body}.
Engine no DOM and testable Node ESM. Seeded random. All balance/recipes are ORIGINAL adaptation.

## Expedition exports (expedition.js)

import {ITEMS,usedSlots} from './engine.js' allowed, core does not import expedition.
export LOCATIONS array {id,name,subtitle,description,risk:'낮음'|'보통'|'높음',riskLevel:1..3,lootHint,unlockDay,kind}.
createExpedition(context,state) -> exp. context from engine {character?,scavenger?,loadout,locationId,capacity} preferably use state.nightPlan with charId as fallback. Always uses locationId from state.nightPlan. char find from state.characters.
exp {locationId,name,width:1280,height:720,time:0,duration:100,player:{x:100,floor:0,health,fatigue,noise,hidden:false,facing:1},floors:[600,410,220],stairs:[{x,from,to}],loot:[{id,x,floor,label,items:{},locked,owned,searched}],npcs:[{id,x,floor,health,state,facing,kind,alert}],bag:{},capacity,activeLootId:null,events:[],done:false,result:null,notice:string,stats:{},progress:null}. y=floors[floor], standing foot baseline.
stepExpedition(exp,dt,input) input {left,right,up,down,sneak,interact:false}; clamp dt0.1; don't use DOM. Move walking/running & stairs; targeting via moveTo supported. AI patrol/hear/chase/attack/flee. No graphic violence.
moveTo(exp,x,floor) -> target, route via stairs automatically.
interact(exp) -> {ok,reason?,lootId?} starts search/ opens near loot or toggles hiding. Locked loot requires crowbar.
takeLoot(exp,lootId,itemId,qty=1), dropItem(exp,itemId,qty=1) -> {ok,reason?}. enforce slot cap, persistence of taken amounts, theft morale.
attack(exp) -> {ok,reason?}; weapon gives advantage, cooldown, health consequences; non-lethal flee possible. Root click attack button.
returnHome(exp,force=false) -> {ok,reason?}; normal only near exit x<130 floor0; force rescue/timeout applies limited hurt+late penalties. On done exp.result standardized finishNight result. Auto timeout returns with late penalty. Exit action near exit creates result.
getNearby(exp) -> {loot:object|null,exit:boolean,hide:boolean,stairs:object|null}. export expeditionResult(exp) -> standardized result.
Location inventories must persist across visits: state.locations[id]={remaining:{lootId:{item:qty}},...}; createExpedition stores persistent updates into state.locations by reference or result. Clearly coordinate engine if needed.

## Renderer (scene.js)

export createRenderer(canvas) returns {render({state,expedition:null|exp,time:number,selectedId}),hitTest(clientX,clientY):{type:'facility'|'character'|'ground'|'loot'|'exit'|'hide',id?,x?,floor?}|null,destroy()}.
Canvas uses CSS dimensions and device pixel ratio; drawing world1280x720 letterboxed. Underlying game coords1280x720, floors600,410,220. Render original atmospheric charcoal/blue cutaway shelter, orange warm windows/lamps, rain skyline, meaningful stations and moving survivor silhouettes. Facility points kitchen(580,410),bed(350,220),water(980,600),workshop(330,600),radio(980,410),door(120,600),rubble(940,220),heater(700,600). Characters interpolate toward job target or idle points; animations cosmetic only. Selected circle and readable facility labels. Night draw supplied exp world/NPCs/loot/player/hiding/exit, fog+warm lights+cone if possible. No external imagery/copyright assets. hitTest in logical coords returns actionable facility/character or ground, loot/night. Root handles game actions.

## Integration

Default interface loads complete shelter scene and first objective. Root controls DOM, pause/speed/save/report/night plan, mouse+keyboard+touch. Game must progress all12days and end. Save localStorage after mutation and regular checkpoints; export/import JSON. No network runtime dependencies. Provide precise APIs above. Notify root early of API deviations.
