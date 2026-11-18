// Diagnostic white-box probes for a read-only implementation audit.
// These create temporary Game instances in memory. They are NOT normal-play victory tests.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const project=resolve(process.argv[2]||'/workspace/sites/breath-colony-30b984');
const out=resolve(process.argv[3]||dirname(fileURLToPath(import.meta.url)));
const {Game,CYCLE_SECONDS}=await import(pathToFileURL(join(project,'dist/engine.js')));
const clone=x=>JSON.parse(JSON.stringify(x));
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const setup=()=>{const g=new Game(73);for(const [tool,x,y]of[['diffuser',19,11],['battery',19,16],['dig',11,11]]){const r=g.queue(tool,x,y);if(!r.ok)throw new Error(r.message);}return g;};
const a=setup(),b=setup();
for(let i=0;i<300;i++){a.step(.1);b.step(.1);}
const sameTickReplay={description:'Same seed / same public command sequence / same 0.1 s tick sequence',gameSeconds:30,exactStateEqual:JSON.stringify(a.serialize())===JSON.stringify(b.serialize()),stateHash:digest(a.serialize())};
const saved=clone(a.serialize()),restored=new Game(1);restored.load(saved);
for(let i=0;i<100;i++){a.step(.1);restored.step(.1);}
const resumed={gameSecondsAfterResume:10,exactStateEqual:JSON.stringify(a.serialize())===JSON.stringify(restored.serialize()),uninterruptedHash:digest(a.serialize()),resumedHash:digest(restored.serialize())};
const fine=setup(),coarse=setup();
for(let i=0;i<200;i++)fine.step(.06);
for(let i=0;i<120;i++)coarse.step(.1);
const sumO=g=>g.cells.reduce((s,c)=>s+c.oxygen,0);
const partitioning={description:'Same nominal total time, different caller partitions (200×.06 s versus 120×.1 s)',nominalGameSeconds:12,exactStateEqual:JSON.stringify(fine.serialize())===JSON.stringify(coarse.serialize()),fine:{time:fine.time,oxygen:sumO(fine),completedBuilds:fine.stats.completedBuilds,completedDigs:fine.stats.completedDigs,crew: fine.crew.map(c=>({x:c.x,y:c.y,hunger:c.hunger,energy:c.energy}))},coarse:{time:coarse.time,oxygen:sumO(coarse),completedBuilds:coarse.stats.completedBuilds,completedDigs:coarse.stats.completedDigs,crew:coarse.crew.map(c=>({x:c.x,y:c.y,hunger:c.hunger,energy:c.energy}))}};
const clippingGame=new Game(73),e=clippingGame._addBuilding('electrolyzer',26,11,false,1),cell=clippingGame.cell(26,11);
clippingGame._rebuildFluids();e.active=true;cell.oxygen=2.999;
const oxygenBefore=cell.oxygen,producedBefore=clippingGame.production.oxygenProduced;
clippingGame._finishUtilities(.1);
const clippedOxygen={fixture:'White-box active electrolyzer, stocked connected clean-water network, receiving cell oxygen=2.999; one .1 s utility pass.',nominalProduced:clippingGame.production.oxygenProduced-producedBefore,cellStoredIncrease:cell.oxygen-oxygenBefore,difference:(clippingGame.production.oxygenProduced-producedBefore)-(cell.oxygen-oxygenBefore),interpretation:'Production counter is nominal output; clamped overflow has no separate loss record. Units are legacy oxygen units, not kg.'};
const tileGame=new Game(73),tileCell=tileGame.cell(26,10);tileCell.oxygen=.9;tileCell.co2=.1;tileCell.water=.4;
const beforeTile={oxygen:tileCell.oxygen,co2:tileCell.co2,water:tileCell.water};
const queue=tileGame.queue('tile',26,10);if(!queue.ok)throw new Error(queue.message);
tileGame._completeTask(tileGame.tasks.find(t=>t.x===26&&t.y===10));
const displacement={fixture:'White-box completion of an actual queued tile; no environmental or crew passes between snapshots.',before:beforeTile,after:{oxygen:tileCell.oxygen,co2:tileCell.co2,water:tileCell.water},interpretation:'Existing contents are cleared; no neighboring displacement occurs in _completeTask.'};
const fuelGame=new Game(73);fuelGame.buildings.find(b=>b.type==='generator').enabled=false;
fuelGame._addBuilding('coalgen',26,11,false,1);fuelGame._addBuilding('battery',27,11,false,1);fuelGame.resources.coal=.001;fuelGame._rebuildNetworks();
const fuelBefore=fuelGame.resources.coal;fuelGame._buildingStep(.1);
const partialFuel={fixture:'White-box connected coal generator and empty battery, coal=.001 before one .1 s building pass.',coalConsumed:fuelBefore-fuelGame.resources.coal,nominalCoalNeed:.025*.1,powerProducedW:fuelGame.power.production,energyStoredJ:fuelGame.power.stored,interpretation:'The full 60 W tick is generated when coal > 0, even if the final fuel remainder is below the nominal tick requirement.'};
Object.assign(clippedOxygen,{
  setup:{source_clean_water_available:true,active_electrolyzer:true,receiver_oxygen_before:2.999,receiver_capacity:3,simulation_dt:.1},
  observed:{nominal_output:clippedOxygen.nominalProduced,stored_delta:clippedOxygen.cellStoredIncrease,unrecorded_difference:clippedOxygen.difference},
  expected_under_proposed_v5_contract:'Process only receiver headroom, or use an explicitly configured loss/vent policy and record that amount. In all cases nominal production = stored output + explicit loss; no unrecorded 0.029 units.',
  severity:'P0 gate for a conservation-based reconstruction profile; not a claim of normal-play crash or progression failure',
  backlog_ids:['AUD-P0-02','AUD-P0-05']
});
Object.assign(displacement,{
  setup:{tile:[26,10],oxygen:.9,co2:.1,water_fraction:.4,method:'queue tile through the public API, then invoke completion directly with no intervening simulation'},
  expected_under_proposed_v5_contract:'Successful completion must transfer contents to legal neighboring receivers with equal aggregate quantities, or wait when no space exists. A loss policy must be explicit and accounted for.',
  severity:'P0 gate for a conservation-based reconstruction profile; current legacy completion behavior is as coded',
  backlog_ids:['AUD-P0-03','AUD-P0-05']
});
Object.assign(partialFuel,{
  setup:{coal_before:.001,rated_coal_per_s:.025,rated_power_w:60,simulation_dt:.1,other_generators_disabled:true,empty_connected_battery:true},
  observed:{coal_consumed:partialFuel.coalConsumed,energy_generated_and_stored_j:partialFuel.energyStoredJ},
  expected_under_proposed_v5_contract:{runnable_seconds:.001/.025,energy_j:60*(.001/.025),equivalent_average_power_w:60*(.001/.025)/.1},
  severity:'P0 recipe-transaction gate; final partial-fuel edge case, not an assertion of major normal-play balance impact',
  backlog_ids:['AUD-P0-02','AUD-P0-05']
});
Object.assign(partitioning,{
  actual_browser_exposure:'The current browser frame loop already accumulates time and calls game.step(.1). This probe addresses direct Game.step callers and future integrations/replays; it does not show frame-rate-dependent variation in that existing fixed-tick browser path.',
  backlog_ids:['AUD-P0-04'],
  source_references:['dist/engine.js:239','dist/app.js:658-663']
});
const result={schema_version:'1.0',scope:'breath-colony-4.0.0-diagnostic-audit',run_date:'2026-11-18',method:'Temporary memory-only Game instances; no source edits, no persistent save edits. Probes supplement source inspection and do not claim normal-play progression or broad performance guarantees.',same_tick_replay:sameTickReplay,save_resume:resumed,caller_partitioning:partitioning,clipped_oxygen:clippedOxygen,tile_displacement:displacement,partial_coal_fuel:partialFuel,derived_legacy_balance:{cycle_seconds:CYCLE_SECONDS,crew_oxygen_units_per_cycle:.055*CYCLE_SECONDS,diffuser_oxygen_units_per_cycle:.35*CYCLE_SECONDS,diffuser_algae_units_per_cycle:.025*CYCLE_SECONDS,nominal_diffuser_supported_crew:.35/.055,electrolyzer_water_l_per_cycle:.18*CYCLE_SECONDS,electrolyzer_oxygen_units_per_cycle:.30*CYCLE_SECONDS,electrolyzer_hydrogen_units_per_cycle:.055*CYCLE_SECONDS,hydrogen_generator_hydrogen_units_per_cycle:.04*CYCLE_SECONDS,hydrogen_generator_j_per_cycle:70*CYCLE_SECONDS,raw_food_units_per_crew_cycle:.2*CYCLE_SECONDS/24,cooked_food_units_per_crew_cycle:.2*CYCLE_SECONDS/30,farm_water_l_per_growth:120*.012,greenhouse_water_l_per_growth:120/1.2*.012,portable_seconds_per_full_tank:6/.055,full_dock_compression_seconds:18/.08,notes:'Ideal uninterrupted rates only; pathing, outages, growth waits, storage saturation and decay can change observed results. These are current-web calculations, not ONI original values.'}};
await writeFile(join(out,'audit_probe_results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({sameTickReplay:sameTickReplay.exactStateEqual,saveResume:resumed.exactStateEqual,callerPartitionExact:partitioning.exactStateEqual,oxygenClippingDifference:clippedOxygen.difference,tileDisplacement:displacement.after,partialCoal:partialFuel},null,2));
