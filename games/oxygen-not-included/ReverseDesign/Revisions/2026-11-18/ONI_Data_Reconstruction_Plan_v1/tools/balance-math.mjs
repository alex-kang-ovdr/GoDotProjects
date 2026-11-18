// 공개 참조 데이터의 파생 계산. 게임 시뮬레이션/원작 실행 결과가 아니다.
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const load=n=>JSON.parse(readFileSync(resolve(root,'data',n),'utf8'));
const c=load('colony-records.json').records;
const b=load('facilities.json').records;
const r=load('reactions.json').records;
const e=load('elements.json').records;
function field(list,id,key){const f=list.find(x=>x.id===id)?.fields?.[key];assert(f&&f.value!==null,`missing ${id}.${key}`);return f.value;}
function flow(id,side,element){const f=r.find(x=>x.id===id)?.[side]?.find(x=>x.element_id===element)?.amount;assert(f&&typeof f.value==='number');assert.equal(f.unit,'kg/s');return f.value;}
const seconds=field(c,'colony.time','cycle_seconds');
const breath=field(c,'colony.standard_duplicant','oxygen_kg_s');
const calories=field(c,'colony.standard_duplicant','calorie_kcal_cycle');
const ox=flow('electrolysis','outputs','oxygen');
const hy=flow('electrolysis','outputs','hydrogen');
const water=flow('electrolysis','inputs','water');
const genFuel=flow('hydrogen_generation','inputs','hydrogen');
const genPower=-field(b,'hydrogen_generator','electricity_w');
const pumpGas=field(b,'gas_pump','electricity_w');
const pumpWater=field(b,'liquid_pump','electricity_w');
const pumpGasRate=field(b,'gas_pump','max_throughput_kg_s');
const pumpWaterRate=field(b,'liquid_pump','max_throughput_kg_s');
const electroPower=field(b,'electrolyzer','electricity_w');
const checks=[];
function eq(id,actual,expected,tol=1e-8){assert(Math.abs(actual-expected)<=tol,`${id}: ${actual} vs ${expected}`);checks.push({id,actual,expected,tolerance:tol,passed:true});}
const populations=[3,8,12].map(n=>({population:n,oxygenKgCycle:n*breath*seconds,kcalCycle:n*calories,
  equivalentElectrolyzers:n*breath/ox,minimumFullSizeElectrolyzers:Math.ceil(n*breath/ox),
  waterKgCycleAtExactDemand:n*breath/ox*water*seconds}));
eq('three_dupes_oxygen',populations[0].oxygenKgCycle,180);
eq('eight_dupes_oxygen',populations[1].oxygenKgCycle,480);
eq('electrolyzer_oxygen_cycle',ox*seconds,532.8);
eq('electrolyzer_hydrogen_cycle',hy*seconds,67.2);
eq('electrolyzer_mass',water,ox+hy);
const pumpingLoad=ox/pumpGasRate*pumpGas+hy/pumpGasRate*pumpGas+water/pumpWaterRate*pumpWater+electroPower;
const hydrogenPotential=hy/genFuel*genPower;
eq('ideal_full_flow_load_w',pumpingLoad,624);
eq('hydrogen_potential_multiple_generators_w',hydrogenPotential,896);
eq('one_generator_surplus_kg_cycle',(hy-genFuel)*seconds,7.2);
const mealwoodYield=field(c,'food.meal_lice','calories')*field(c,'plant.mealwood','harvest_amount')/field(c,'plant.mealwood','domesticated_growth_cycles');
const mealwoodMin=3*calories/mealwoodYield;
eq('mealwood_kcal_cycle',mealwoodYield,200);
eq('mealwood_3_people_min',mealwoodMin,15);
const wheatHarvest=field(c,'plant.sleet_wheat','harvest_amount');
const wheatRecipe=field(c,'recipe.frost_bun','inputs').sleet_wheat_grain;
const wheatYield=wheatHarvest/wheatRecipe*field(c,'recipe.frost_bun','output_calories')/field(c,'plant.sleet_wheat','domesticated_growth_cycles');
eq('wheat_to_bread_kcal_cycle',wheatYield,400);
const addedWater=field(c,'sanitation.lavatory','polluted_water_output')-field(c,'sanitation.lavatory','water_input');
eq('lavatory_source_kg_use',addedWater,6.7);
const cp=field(e,'element.water','specific_heat');
const cooling=field(b,'thermo_aquatuner','nominal_packet_kg')*1000*cp*Math.abs(field(b,'thermo_aquatuner','temperature_delta_c'));
eq('aquatuner_heat_dtu',cooling,585060);
const result={kind:'derived_math_not_gameplay_run',datasetVersion:'2026.11.18-r1',passed:true,checks,
  assumptions:['standard organic duplicants; no traits; default hunger','continuous nominal flow or ideal duty cycling','no outages, travel/harvest delays, spoilage, or cooling power unless stated'],
  populations,oxygenModule:{oxygenKgCycle:ox*seconds,hydrogenKgCycle:hy*seconds,dupeEquivalent:ox/breath,
  minimumUptimeForEight:8*breath/ox,idealLoadW:pumpingLoad,potentialGenerationMultipleUnitsW:hydrogenPotential,
  singleGeneratorCapW:genPower,netSingleGeneratorW:genPower-pumpingLoad,netMultipleGeneratorW:hydrogenPotential-pumpingLoad,
  singleGeneratorSurplusHydrogenKgCycle:(hy-genFuel)*seconds},
  farming:{mealwoodKcalPerCycle:mealwoodYield,mealwoodForThreeTheoretical:mealwoodMin,
  proposedEfficiencyAssumption:.85,mealwoodForThreeWithProposedEfficiency:Math.ceil(mealwoodMin/.85),wheatToBreadKcalPerCycle:wheatYield},
  sanitation:{lavatoryAddedKgPerUse:addedWater,threeUsesAddedKg:addedWater*3},heat:{waterPacketCoolingDTU:cooling}};
writeFileSync(resolve(root,'reports/balance-math.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({kind:result.kind,checksPassed:checks.length,populations,oxygenModule:result.oxygenModule,farming:result.farming,heat:result.heat},null,2));
