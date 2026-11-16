import test from 'node:test';
import assert from 'node:assert/strict';
import * as Core from '../dist/engine.js';
import * as Field from '../dist/expedition.js';
import {SAVE_KEY,BACKUP_KEY,DAWN_KEY,decodeSnapshot,encodeSnapshot,readCampaign,writeCampaign,readDawn,startCampaign} from '../dist/saves.js';

function memory(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};}
function night(){const state=Core.createGame(741);Core.endDay(state);const r=Core.beginNight(state,{scavengerId:'leo',locationId:'cottage',roles:{mira:'sleep',yun:'guard',leo:'scavenge'},loadout:{}});return {state,expedition:Field.createExpedition(r.context,state)};}

test('radio progress and an active distraction survive the shared campaign envelope atomically',()=>{
 const state=Core.createGame(830),storage=memory();
 assert(Core.performAction(state,'yun','buildRadio').ok);Core.endDay(state);assert.equal(state.facilities.radio,1);
 const departure=Core.beginNight(state,{scavengerId:'leo',locationId:'cottage',roles:{mira:'sleep',yun:'guard',leo:'scavenge'},loadout:{parts:2}});assert(departure.ok);
 const expedition=Field.createExpedition(departure.context,state);assert(Field.throwDistraction(expedition,300,0).ok);
 writeCampaign(storage,state,expedition);const snapshot=storage.getItem(SAVE_KEY),restored=decodeSnapshot(snapshot);
 assert.equal(restored.state.facilities.radio,1);assert.equal(restored.state.relief.contacted,false);assert.equal(restored.expedition.stats.distractions,1);assert.equal(restored.expedition.bag.parts,1);assert.equal(restored.expedition.distraction.x,300);
 const forged=JSON.parse(snapshot);forged.state.relief.prepared=true;assert.throws(()=>decodeSnapshot(forged));
 const invalid=structuredClone(expedition);invalid.stats.distractions=101;assert.throws(()=>writeCampaign(storage,state,invalid));assert.equal(storage.getItem(SAVE_KEY),snapshot);
 assert(Field.returnHome(restored.expedition).ok);assert(Core.finishNight(restored.state,Field.expeditionResult(restored.expedition)).ok);assert.equal(restored.state.stats.distractions,1);
 assert.doesNotThrow(()=>encodeSnapshot(restored.state));
});

test('save roundtrip preserves a campaign, its current job and expedition without shared references',()=>{
 const state=Core.createGame(32);Core.performAction(state,'mira','cook');const restored=decodeSnapshot(encodeSnapshot(state));assert.equal(restored.state.characters[0].job.actionId,'cook');restored.state.inventory.wood=0;assert.notEqual(state.inventory.wood,0);
 const n=night();Field.moveTo(n.expedition,400,0);Field.stepExpedition(n.expedition,.1,{});const v=decodeSnapshot(encodeSnapshot(n.state,n.expedition));assert.equal(v.expedition.player.x,n.expedition.player.x);assert.equal(v.expedition.player.id,'leo');
});
test('mismatched expedition identity and inflated capacity are rejected before any stored save changes',()=>{
 const {state,expedition}=night();const v=JSON.parse(encodeSnapshot(state,expedition));v.expedition.player.id='mira';assert.throws(()=>decodeSnapshot(v));v.expedition.player.id='leo';v.expedition.capacity=30;assert.throws(()=>decodeSnapshot(v));
 const s=memory();writeCampaign(s,Core.createGame(2));const before=s.getItem(SAVE_KEY);assert.throws(()=>writeCampaign(s,state));assert.equal(s.getItem(SAVE_KEY),before);
});
test('a corrupted primary recovers a valid prior snapshot and a corrupted backup falls back to dawn',()=>{
 const s=memory(),state=Core.createGame(123);writeCampaign(s,state);Core.performAction(state,'mira','cook');writeCampaign(s,state);s.setItem(SAVE_KEY,'{broken');assert.equal(readCampaign(s).status,'recovered');assert.equal(readCampaign(s).state.clock,360);s.setItem(BACKUP_KEY,'bad');assert.equal(readCampaign(s).state.seed,123);s.setItem(DAWN_KEY,'bad');assert.equal(readCampaign(s).status,'invalid');
});
test('dawn checkpoints are stable during the same day and cannot restore a different campaign',()=>{
 const s=memory(),state=Core.createGame(17);writeCampaign(s,state);const first=s.getItem(DAWN_KEY);state.inventory.wood=20;writeCampaign(s,state);assert.equal(s.getItem(DAWN_KEY),first);assert.equal(readDawn(s,17).state.inventory.wood,12);assert.equal(readDawn(s,18),null);
});
test('blocked storage has an explicit status and invalid JSON does not silently pass',()=>{
 assert.equal(readCampaign({getItem(){throw Error('blocked')}}).status,'unavailable');assert.equal(readCampaign(memory()).status,'empty');for(const v of [null,{},'{','[]','null'])assert.throws(()=>decodeSnapshot(v));
});

test('same-seed campaigns of different difficulties never share dawn recovery',()=>{
 const storage=memory(),standard=Core.createGame(17),siege=Core.createGame(17,{difficulty:'siege'});
 writeCampaign(storage,standard);
 assert.equal(readDawn(storage,17,'siege'),null);
 writeCampaign(storage,siege);
 assert.equal(readDawn(storage,17,'standard'),null);
 assert.equal(readDawn(storage,17,'siege').state.difficulty,'siege');
});

test('starting over explicitly replaces primary, backup and dawn even with the same seed',()=>{
 const storage=memory(),state=Core.createGame(17);writeCampaign(storage,state);
 Core.performAction(state,'mira','eat');writeCampaign(storage,state);
 const fresh=Core.createGame(17);startCampaign(storage,fresh);
 const restored=readDawn(storage,17);
 assert.equal(restored.state.stats.mealsEaten,0);
 assert.equal(restored.state.inventory.meal,fresh.inventory.meal);
 assert.equal(storage.getItem(SAVE_KEY),storage.getItem(BACKUP_KEY));
 assert.equal(storage.getItem(SAVE_KEY),storage.getItem(DAWN_KEY));
 storage.setItem(SAVE_KEY,'corrupt');assert.equal(readCampaign(storage).state.stats.mealsEaten,0);
 Core.performAction(fresh,'mira','cook');assert.throws(()=>startCampaign(storage,fresh));
});
