#!/usr/bin/env node
'use strict';
/*
 * Read-only export of the committed STARFORGE v3 prototype.
 * Usage: node export_starforge.cjs [repository] [output.json]
 * No dependencies, network, checkout, or source edits are required.
 * Lexical constants are exposed ONLY in a disposable in-memory VM copy.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const COMMIT = 'f90387acd3f7ca25a8285423f235352dd47d07e4';
const REPO = process.argv[2] || '/workspace/sites/starforge-drydock-887a';
const OUTPUT = process.argv[3] || path.resolve(__dirname, '..', 'starforge.json');
const SIM = 'dist/sim.js', EDITOR = 'dist/editor.js';
const readCommit = file => cp.execFileSync('git', ['-C', REPO, 'show', COMMIT + ':' + file], {encoding:'utf8', maxBuffer:4e6});
const source = {[SIM]:readCommit(SIM), [EDITOR]:readCommit(EDITOR)};
const lines = Object.fromEntries(Object.entries(source).map(([file,text])=>[file,text.split('\n')]));
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = value => JSON.parse(JSON.stringify(value));
const exported = 'const api = { Game, PARTS, CONTRACTS, CELL, VERSION, worldPoint, localPoint };';
assert.equal(source[SIM].split(exported).length, 2, 'Pinned source export marker must match exactly once.');
const instrumented = source[SIM].replace(exported, 'const api = { Game, PARTS, CONTRACTS, CELL, VERSION, worldPoint, localPoint, TABLES: { MODES, POLICIES, REPAIR_POLICIES, REPAIR_STOCK_MAX, REPAIR_BUNDLE, REPAIR_UNIT_COST, REPAIR_HP_PER_STOCK, REPAIR_RATE, EXTINGUISH_RATE, UPGRADES, TACTICS, PRIORITIES, CREW_RECRUIT_COST, DIRS } };');
const context = vm.createContext({module:{exports:{}}});
new vm.Script(instrumented,{filename:SIM}).runInContext(context,{timeout:2000});
const api = context.module.exports, T = clean(api.TABLES);
const editorContext = vm.createContext({module:{exports:{}}, StarSim:api});
new vm.Script(source[EDITOR],{filename:EDITOR}).runInContext(editorContext,{timeout:2000});
const Editor = editorContext.module.exports;
assert.equal(api.VERSION,3);
assert.equal(Object.keys(api.PARTS).length,11);
assert.equal(Object.keys(T.UPGRADES).length,3);
assert.equal(Object.keys(api.CONTRACTS).length,3);

function range(file,start,end,symbol) {
  assert.ok(start>=1 && end>=start && end<=lines[file].length, file + ':' + start + '-' + end);
  return {source_file:file,source_lines:{start,end},source_symbol:symbol || null};
}
function exact(text,file=SIM) {
  const matches=lines[file].map((line,i)=>line.includes(text)?i+1:0).filter(Boolean);
  assert.equal(matches.length,1,'Unique source anchor: '+text);
  return range(file,matches[0],matches[0],text);
}
function method(name,file=SIM) {
  const start=lines[file].findIndex(line=>line.startsWith('    '+name+'(') || line.startsWith('    get '+name+'('));
  assert.ok(start>=0,'Method exists: '+name);
  let end=start+1;
  while(end<lines[file].length && !/^    (?:get )?[A-Za-z_$][\w$]*\(/.test(lines[file][end]) && !/^  }$/.test(lines[file][end]))end++;
  while(end>start+1 && !lines[file][end-1].trim())end--;
  return range(file,start+1,end,name);
}
function between(startAnchor,endAnchor,file=SIM) {
  const first=exact(startAnchor,file).source_lines.start;
  const end=exact(endAnchor,file).source_lines.start-1;
  return range(file,first,end,startAnchor);
}
function scopedLine(key,scope) {
  const xs=lines[scope.source_file].slice(scope.source_lines.start-1,scope.source_lines.end);
  const offset=xs.findIndex(line=>line.trimStart().startsWith(key+':'));
  assert.ok(offset>=0,'Definition in source: '+key);
  return range(scope.source_file,scope.source_lines.start+offset,scope.source_lines.start+offset,key);
}
function body(name,file=SIM) {
  const r=method(name,file);return lines[file].slice(r.source_lines.start-1,r.source_lines.end).join('\n');
}
function match(name,re,group=1,file=SIM) {
  const result=body(name,file).match(re);assert.ok(result,'Pattern in '+name+': '+re);return result[group];
}
function number(name,re,group=1,file=SIM) {return Number(match(name,re,group,file));}
function literal(name,re,group=1,file=SIM) {
  const expression=match(name,re,group,file);
  return clean(vm.runInNewContext('('+expression+')',Object.create(null),{timeout:100}));
}
const rows=[];
function mapping(names,note='개념명 대응만 기록. 원작 부품 ID·수치·규칙의 동등성은 검증하지 않았다.') {
  return {match_type:'concept_name_match',names:Array.isArray(names)?names:[names],original_definition_id:null,original_value_equivalence:false,note};
}
const prototypeOnly={match_type:'prototype_only',names:[],original_definition_id:null,original_value_equivalence:false,note:'이 이름/콘텐츠/정책은 STARFORGE 구현에서 정의되었다. 원작 데이터 행으로 사용할 수 없다.'};
function add(id,category,fields,refs,map=prototypeOnly,extraction='source_rule') {
  const refsArray=Array.isArray(refs)?refs:[refs];assert.ok(refsArray.length);
  rows.push({id,category,fields:clean(fields),...refsArray[0],source_ranges:refsArray,value_origin:'prototype_code',extraction,cosmoteer_mapping:clean(map)});
}
const partScope=between('  const PARTS = Object.freeze({','  const MODES =');
const upgradeScope=between('  const UPGRADES = Object.freeze({','  const TACTICS =');
const contractScope=between('  const CONTRACTS = Object.freeze({','  const DIRS =');
const starterScope=between('  function starterDesign() {','  class Game {');
const partConcepts={corridor:'Corridor',armor:'Armor',cockpit:'Cockpit',reactor:'Reactor',bunk:'Crew Quarters',storage:'Storage Bay',laser:'Laser',cannon:'Cannon',shield:'Shield',thruster:'Thruster',radiator:'Radiator'};
for(const [id,def] of Object.entries(api.PARTS))add('part.'+id,'parts',def,scopedLine(id,partScope),mapping(partConcepts[id],
  id==='storage'?'Storage Bay 개념 대응. 이 구현은 탄약 전용 1칸 저장고이며 원작의 다품목 저장 공간과 동일하지 않다.':
  '부품군/명칭 대응이다. 이 구현의 한 칸 크기·가격·HP·질량·성능을 원작 값으로 전용하지 않는다.'),'runtime_constant');

const initial=new api.Game();
add('simulation.initial_state','simulation',{
  mode:initial.mode,sector:initial.sector,credits:initial.credits,time:initial.time,speed:initial.speed,paused:initial.paused,
  overclock:initial.overclock,crewPolicy:initial.crewPolicy,repairPolicy:initial.repairPolicy,tactic:initial.tactic,
  targetPriority:initial.targetPriority,contractId:initial.contractId,upgrades:initial.upgrades,
  repairStock:initial.player.repairStock,playerDockPosition:{x:initial.player.x,y:initial.player.y}
},[method('reset'),method('_createShip')],prototypeOnly,'runtime_initialization');
add('simulation.modes','simulation',{modes:T.MODES},exact('  const MODES ='),prototypeOnly,'runtime_constant');
add('simulation.coordinates','simulation',{cell_world_units:api.CELL,rotation_index_directions:T.DIRS,rotation_unit:'quarter_turn_clockwise',forward_axis:'local_negative_y',angle_unit:'radian',mass_unit:'prototype_mass_unit'},[exact('const CELL ='),exact('const DIRS ='),exact('const forward = ship.angle + p.rot * Math.PI / 2;')],mapping(['Tile','Ship']));
add('simulation.fixed_step','simulation',{max_input_delta_seconds:number('update',/Math\.min\(dt, ([\d.]+)\)/),minimum_speed:number('update',/: 1, ([\d.]+),/),maximum_speed:number('update',/: 1, [\d.]+, ([\d.]+)\)/),accumulator_cap_seconds:number('update',/this\._accumulator = Math\.min\(([\d.]+)/),step_seconds:1/number('update',/this\._step\(1 \/ ([\d.]+)\)/),paused_freezes_all:true},method('update'));
add('simulation.random','simulation',{seed:number('reset',/this\._rng = (\d+)/),multiplier:number('_random',/Math\.imul\(this\._rng, (\d+)/),increment:number('_random',/\+ (\d+)\)/),divisor:number('_random',/this\._rng \/ (\d+)/),algorithm:'LCG with uint32 coercion; one shared deterministic stream'},[method('_random'),method('reset')]);
add('construction.limits','construction',{maximum_parts:160,coordinate_min:-10,coordinate_max:10,rotations:[0,1,2,3],maximum_cockpits:1,maximum_bunks:10,orthogonal_attachment_required:true,editing_mode:'dock',all_parts_occupy_single_cell:true},[method('previewPlacement'),method('_makePart')],mapping('Ship Editor'));
add('construction.purchase','construction',{currency:'credits',price_formula:'PARTS[type].cost',construction_duration_seconds:0,material_recipe:null,initial_new_device_buffers:'power=0; ammo=0',new_bunk_includes_initial_crew:true},[method('place'),method('_makePart'),method('_syncCrew')],mapping('Build Mode'));
add('construction.connectivity','construction',{structural_root:'live cockpit',structural_neighbors:T.DIRS,armor_transmits_structure:true,walk_requires:'live + connected + PARTS[type].walkable',doors:'implicit orthogonal access; no separate door object',disconnected_battle_parts:'detach as fragments',crew_on_destroyed_or_detached_cells:'removed; no combat teleport'},method('_topology'),mapping(['Connectivity','Corridor','Door']));
add('construction.blueprint_validation','construction',{part_min:1,part_max:160,coordinate_min:-10,coordinate_max:10,bunk_min:1,bunk_max:10,cockpit_count:1,required_types:['reactor','bunk','laser_or_cannon'],duplicate_cells_allowed:false,all_parts_connected:true,name_max_characters:40},method('_validateDesign',EDITOR),mapping('Saved Ship Design'));
add('construction.refit_allocation','construction',{reuse_order:'same type, highest hp/maxHp first',new_part_cost:'PARTS[type].cost',leftover_refund:'floor(PARTS[type].cost * 0.65 * hp/maxHp)',net_cost:'new_part_cost - leftover_refund',preserves_repair_stock:true,cargo_overflow:'reject entire staged refit if remaining crew cannot hold unsettled cargo'},[method('_plan',EDITOR),method('apply',EDITOR)],mapping('Saved Ship Design'));
const yard=new Editor.Shipyard(initial);
add('construction.history','construction',{maximum_entries:yard.limit,atomic_editing:true,history_boundary_fields:['mode','sector','ship_id','credits','contract','tactic','targetPriority','crewPolicy','repairPolicy','upgrades','repairStock','serviceTargetId','part_hp_and_fire'],undo_redo_scope:'dock; snapshot restoration',preview_is_staged:true},[method('constructor',EDITOR),method('_stamp',EDITOR),method('_transaction',EDITOR),method('undo',EDITOR),method('redo',EDITOR)],mapping('Ship Editor'),'runtime_and_source_rule');

add('economy.refund','economy',{currency:'credits',refund_fraction:0.65,condition_factor:'hp/maxHp',rounding:'floor per module'},method('erase'),mapping('Credits'));
add('economy.dock_repair','economy',{damaged_part_price_fraction:0.35,missing_part_price_fraction:0.55,crew_recruit_cost:T.CREW_RECRUIT_COST,formula:'ceil(sum(cost*(1-hp/maxHp)*0.35 for surviving design parts) + sum(cost*0.55 for missing design parts) + missing_crew*22)',ammo_included:false,field_repair_stock_preserved:true,damaged_blueprint_restored:true},[method('_repairQuote'),method('_crewShortage'),method('_restoreBlueprint'),exact('const CREW_RECRUIT_COST =')],mapping('Repair'));
add('economy.emergency_recovery','economy',{charge:'min(credits,repair_quote)',shortfall:'sponsor subsidy',victory_advances_sector:true,defeat_or_retreat_advances_sector:false,terminal_sector:3,terminal_mode:'complete'},method('returnToDock'),prototypeOnly);
add('manufacturing.scope','manufacturing',{industrial_factory_parts:[],industrial_material_recipes:[],construction_uses_physical_materials:false,implemented_production:'reactor produces power',ammunition_supply:'dock purchase; no factory conversion',repair_material_supply:'dock purchase; abstract shared stock',no_original_recipe_recovery_claim:true},[partScope,method('place'),method('_systems'),method('restock'),method('buyRepairSupplies')],prototypeOnly);
add('manufacturing.power','manufacturing',{producer:'reactor',output:'power',base_units_per_sim_second:api.PARTS.reactor.generation,capacity:api.PARTS.reactor.powerCapacity,input_materials:[],formula:'min(capacity,power + generation * reactor_upgrade_factor * dt)'},[scopedLine('reactor',partScope),method('_systems')],mapping(['Reactor','Battery']));
add('economy.ammo_purchase','economy',{target_part:'storage',maximum_per_store:api.PARTS.storage.ammoCapacity,cost_per_unit:0.45,rounding:'ceil of total missing units * 0.45',quantity:'fill all surviving storage parts to capacity',mode:'dock'},[method('restock'),scopedLine('storage',partScope)],mapping(['Ammunition','Trade']));
add('economy.repair_supplies','economy',{resource:'repairStock',maximum:T.REPAIR_STOCK_MAX,nominal_bundle:T.REPAIR_BUNDLE,cost_per_unit:T.REPAIR_UNIT_COST,quantity_formula:'min(80,max(0,240-current_stock))',cost_formula:'ceil(quantity*2)',partial_bundle_at_cap:true,mode:'dock'},[exact('const REPAIR_STOCK_MAX ='),method('_repairSupplyQuote'),method('buyRepairSupplies')],mapping('Repair','원작 수리의 개념만 대응한다. repairStock이라는 공용 추상 자재와 이 가격·상한은 프로토타입 전용이다.'),'runtime_and_source_rule');
add('economy.debris_and_reward','economy',{fragment_nominal_value_formula:'round(PARTS[type].cost*0.2)',victory_visual_debris_count:18,victory_visual_debris_value_formula:'20+i*2',actual_salvage_payment:'contract.reward + (sector-1)*contract.rewardStep',debris_values_are_not_summed_for_payment:true,reward_once_per_sector:true},[method('_fragment'),method('_checkOutcome'),method('salvage'),method('_contractReward')],mapping('Salvage'));

for(const [id,u] of Object.entries(T.UPGRADES)){
  add('upgrade_family.'+id,'upgrade_families',{...u,maxLevel:3,initialLevel:0,scope:'current expedition; player ships only',reset_clears:true,multiplier_formula:'1 + level * step'},[scopedLine(id,upgradeScope),method('_upgradeFactor'),method('purchaseUpgrade'),method('reset')],prototypeOnly,'runtime_constant');
  for(let level=1;level<=u.costs.length;level++)add('upgrade.'+id+'.'+level,'upgrades',{upgrade_id:id,name:u.name,level,maxLevel:3,cost:u.costs[level-1],increment_per_level:u.step,multiplier:1+level*u.step,effect:u.effect,cumulative_cost:u.costs.slice(0,level).reduce((a,b)=>a+b,0)},[scopedLine(id,upgradeScope),method('_upgradeFactor')],prototypeOnly,'runtime_derived');
}
for(const [id,c] of Object.entries(api.CONTRACTS)){
  add('contract.'+id,'contracts',c,scopedLine(id,contractScope),mapping('Career Missions','명명된 3종 계약은 STARFORGE 창작 콘텐츠이며 원작 의뢰 ID와 연결되지 않는다.'),'runtime_constant');
  for(let sector=1;sector<=3;sector++){
    const game=new api.Game();game.sector=sector;game.selectContract(id);const launch=game.launch();assert.ok(launch.ok);
    add('mission.'+id+'.'+sector,'missions',{contract_id:id,sector,name:c.name,risk:c.risk,enemy_style:c.enemyStyle,reward:game.getStats().reward,enemy_name:game.enemy.name,enemy_design_id:'fleet.enemy.'+id+'.'+sector},[scopedLine(id,contractScope),method('_contractReward'),method('launch')],prototypeOnly,'runtime_derived');
    const ship=game.enemy;
    add('fleet.enemy.'+id+'.'+sector,'fleet',{faction:'enemy',contract_id:id,sector,name:ship.name,parts:ship.parts.map(p=>({type:p.type,x:p.x,y:p.y,rot:p.rot})),part_count:ship.parts.length,part_counts:ship.parts.reduce((a,p)=>(a[p.type]=(a[p.type]||0)+1,a),{}),crew_count:ship.crew.length,total_max_hp:ship.launchHullMax,mass:ship.mass,shield_scale:ship.shieldScale,max_shield:ship.maxShield,initial_repair_stock:ship.repairStock,initial_power:ship.parts.reduce((n,p)=>n+p.power,0),initial_ammo:ship.parts.reduce((n,p)=>n+p.ammo,0),spawn:{x:ship.x,y:ship.y,angle:ship.angle},base_part_cost_sum:ship.parts.reduce((n,p)=>n+api.PARTS[p.type].cost,0)},[method('_enemyDesign'),starterScope,method('_createShip'),method('_makePart'),method('launch'),partScope,method('_topology'),method('_syncCrew'),method('_shieldMax')],mapping('Ship Design','함선 구성 개념만 대응. 함명·설계·적 수치 보정은 STARFORGE 전용이다.'),'runtime_derived');
  }
}
add('fleet.player.starter','fleet',{name:initial.player.name,faction:'player',parts:initial._blueprint,part_count:initial.player.parts.length,part_counts:initial.player.parts.reduce((a,p)=>(a[p.type]=(a[p.type]||0)+1,a),{}),crew_count:initial.player.crew.length,total_max_hp:initial.player.launchHullMax,mass:initial.player.mass,shield_scale:initial.player.shieldScale,max_shield:initial.player.maxShield,initial_repair_stock:initial.player.repairStock,base_part_cost_sum:initial.getStats().shipCost,initial_power:initial.player.parts.reduce((n,p)=>n+p.power,0),initial_ammo:initial.getStats().ammoTotal,grid_bounds:{min_x:Math.min(...initial.player.parts.map(p=>p.x)),max_x:Math.max(...initial.player.parts.map(p=>p.x)),min_y:Math.min(...initial.player.parts.map(p=>p.y)),max_y:Math.max(...initial.player.parts.map(p=>p.y))}},[starterScope,method('reset'),method('_createShip'),method('_makePart'),partScope,method('_topology'),method('_syncCrew'),method('_shieldMax')],mapping('Ship Design','KITE는 STARFORGE 시작 설계이며 원작 제공 함선과 동등하다는 뜻이 아니다.'),'runtime_derived');
for(const preset of yard.getPresets())add('preset.'+preset.id,'presets',preset,[method('getPresets',EDITOR),starterScope],prototypeOnly,'runtime_derived');
add('fleet.enemy_scaling','fleet_rules',{hp_formula:'PARTS[type].hp * (1 + sector*0.12)',shield_sector_multipliers:[2,2.15,2.35],shield_style_multipliers:{patrol:1,siege:1.12,hunter:0.83},initial_player_repair_stock:80,initial_enemy_repair_stock:60},method('_createShip'));
add('fleet.initial_buffers','fleet_rules',{prepared_player_power_fraction:0.72,prepared_enemy_power_fraction:1,prepared_storage_ammo:190,prepared_weapon_ammo:14,new_build_power:0,new_build_ammo:0,initial_heat:0,initial_fire:0,initial_cooldown_uniform_range:[0,0.45],runtime_max_heat:100},method('_makePart'));
add('missions.outcomes','missions_rules',{defeat_condition:'player dead or no live cockpit',victory_condition:'enemy dead OR no live cockpit OR no active laser/cannon',three_sector_campaign:true,manual_salvage_supported:true,return_without_claim:'claims victory reward before dock return',retreat:'same-sector paid/sponsored recovery',automatic_reward_repetition:false},[method('_checkOutcome'),method('salvage'),method('returnToDock')],prototypeOnly);

add('crew.complement','crew',{crew_per_bunk:api.PARTS.bunk.crewCapacity,maximum_crew:60,initial_recruitment:'once per newly purchased bunk',casualties_recruit_cost:T.CREW_RECRUIT_COST,combat_regeneration:false,retirement:'settle cargo; retain occupied carriers; reject berth removal if cargo cannot be held'},[method('_syncCrew'),method('erase'),exact('const CREW_RECRUIT_COST ='),scopedLine('bunk',partScope)],mapping(['Crew','Crew Quarters']));
add('crew.movement','crew',{base_cells_per_sim_second:3.1,noncorridor_multiplier:0.8,crowding_applies_when_occupants_greater_than:2,crowding_multiplier:0.72,burning_cell_threshold:0.2,burning_cell_multiplier:0.65,logistics_upgrade_factor:'1+level*0.08',formula:'3.1 * upgrade * terrain_multiplier * crowd_multiplier * fire_multiplier'},method('_crewUpdate'),mapping('Crew'));
add('logistics.pathfinding','logistics',{algorithm:'orthogonal BFS',allowed_cells:'active and walkable',from_position_rounding:'nearest grid cell; align to cell center before route',goal_required:true,zero_length_path_allowed:true,invalid_destination_behavior:'cancel/replan; retain cargo in flight'},[method('_path'),method('_topology'),method('_cancelJob')],mapping(['Crew','Logistics']));
add('logistics.power_demand','logistics',{source_type:'reactor',consumer_filter:'active walkable powerCapacity device except reactor',deficit_formula:'capacity - local_power - reserved_incoming',request_threshold_formula:'min(4,capacity*0.25)',maximum_packet:6,urgency_formula:'(1-local_power/capacity)*10',shield_priority_bonus:2,minimum_source_available:1,policy_priority_bonuses:{balanced:0,power:8,ammo:-2},distance_score_penalty:0.11},method('_assignJob'),mapping(['Battery','Logistics']));
add('logistics.ammo_demand','logistics',{source_type:'storage',consumer_type:'cannon',deficit_formula:'capacity - local_ammo - reserved_incoming',request_threshold:4,maximum_packet:8,urgency_formula:'(1-local_ammo/capacity)*12',minimum_source_available:1,policy_priority_bonuses:{balanced:0,ammo:10,power:-3},distance_score_penalty:0.11},method('_assignJob'),mapping(['Ammunition','Logistics']));
add('logistics.policy_enumeration','logistics',{policies:T.POLICIES,enemy_policy:'balanced',in_progress_delivery:'finished before ordinary policy reprioritization'},[exact('const POLICIES ='),method('_assignJob'),method('setCrewPolicy')],mapping('Crew Role'),'runtime_and_source_rule');
add('logistics.handling_times','logistics',{pickup_seconds:0.3,delivery_seconds:0.3,minimum_pickup_amount:0.1,idle_after_delivery_seconds:0.06,no_regular_job_retry_seconds:0.28,no_cargo_destination_retry_seconds:0.4,cancel_retry_seconds:0.12},[method('_crewUpdate'),method('_assignJob'),method('_cancelJob')],mapping('Logistics'));
add('logistics.reservations','logistics',{incoming_reserved_at_assignment:true,source_reserved_before_pickup:true,delivery_phase_does_not_reserve_source:true,service_jobs_excluded:true,reconstructed_from_crew_jobs:true,unreachable_high_priority_demands_do_not_block_reachable_demands:true},[method('_reservations'),method('_assignJob')],mapping('Reservation','공급 예약은 이 구현의 알고리즘이다. 원작 내부 예약 데이터 구조와 같다고 검증하지 않았다.'));
add('logistics.carried_resource_fallback','logistics',{candidate_space_min:0.05,consumer_priority_bonus:8,reservoir_priority_bonus:0,available_fraction_weight:4,path_length_penalty:0.1,amount_formula:'min(carried_amount,available_space)',dock_cancellation:'settles into surviving compatible containers where possible',in_flight_cancellation:'cargo remains with carrier; new reachable job assigned'},[method('_assignJob'),method('_settleCargo'),method('_cancelJob')],mapping('Logistics'));

for(const policy of T.REPAIR_POLICIES){
  add('service.policy.'+policy,'service_policies',{policy,crew_limit_formula:policy==='supply'?'crew==0 ? 0 : 1':'crew==0 ? 0 : max(1,floor(crew*'+(policy==='survival'?'0.60':'0.25')+'))',repairs_enabled:policy!=='supply',firefighting_enabled:true,interrupts_unloaded_pickups:policy==='survival',existing_cargo_deliveries_retained:true},[method('_serviceLimit'),method('_serviceNeeded'),method('_prioritizeServices'),method('_crewUpdate')],prototypeOnly);
}
add('service.field_repair','service',{hp_per_sim_second:T.REPAIR_RATE,hp_per_stock_unit:T.REPAIR_HP_PER_STOCK,stock_per_hp:1/T.REPAIR_HP_PER_STOCK,initial_player_stock:initial.player.repairStock,max_stock:T.REPAIR_STOCK_MAX,requires_site_arrival:true,requires_target_alive:true,requires_target_not_burning:true,destroyed_parts_regenerated:false,clamp_formula:'min(8*dt,maxHp-hp,repairStock*4)',damaged_hp_epsilon:0.001,stock_epsilon:1e-7},[exact('const REPAIR_STOCK_MAX ='),method('_serviceNeeded'),method('_serviceWork')],mapping('Repair','수리 개념만 대응한다. 공용 repairStock, 초당 8 HP, 환산 4 HP/자재는 STARFORGE 고유 수치다.'),'runtime_and_source_rule');
add('service.extinguish','service',{fire_reduction_per_sim_second:T.EXTINGUISH_RATE,repair_stock_cost:0,fire_end_threshold:0.001,requires_site_arrival:true,site_max_manhattan_distance:1},[exact('const REPAIR_STOCK_MAX ='),method('_serviceWork'),method('_crewUpdate')],mapping(['Fire','Crew']),'runtime_and_source_rule');
add('service.dispatch_score','service',{fire_base:60,fire_strength_weight:25,damage_fraction_weight:35,manual_target_bonus:100,cockpit_bonus:10,reactor_bonus:6,path_length_penalty:1.1,work_cell_fire_penalty:5,one_worker_per_target:true,work_sites:'target cell or four orthogonal neighbors; must be walkable and reachable',policy_applies_to_manual_target:true},[method('_servicePlan'),method('setServiceTarget')],prototypeOnly);
add('service.persistence_and_accounting','service',{job_kinds:['repair','extinguish'],phase:'service',sourceId:null,amount:0,cargo_types_unchanged:true,work_site_field:'site',visual_effect_interval_seconds:0.35,repair_stock_preserved_by_dock_restore:true,metrics:['firesExtinguished','hullRepaired','repairStockUsed']},[method('_assignServiceJob'),method('_serviceWork'),method('_restoreBlueprint'),method('exportSave')],prototypeOnly);

add('fire.state','fire',{minimum:0,maximum:1,active_threshold:0.001,terminates_on_part_destruction:true,dead_ship_simulation_stops:true,rng:'simulation.random',updates_in_dock:true},[method('_ignite'),method('_fires'),method('_damagePart'),method('_step')],mapping('Fire'));
add('fire.continuous_effects','fire',{strength_growth_per_sim_second:0.035,max_strength:1,heat_per_sim_second_per_strength:8,damage_hp_per_sim_second_per_strength:2.4,heat_cap_applied_by_fire:500},method('_fires'),mapping('Fire'));
add('fire.adjacent_spread','fire',{test_interval_seconds:0.5,source_strength_must_exceed:0.35,probability_per_test:'source.fire*0.075',probability_multiplier:0.075,maximum_selected_neighbors_per_test:1,target_selection:'uniform from live active orthogonal non-burning neighbors',new_strength:0.18},method('_fires'),mapping('Fire'));
add('fire.thermal_ignition','fire',{minimum_heat:100,nonburning_threshold:0.001,test_interval_seconds:0.5,base_probability:0.10,excess_heat_divisor:150,maximum_probability:0.45,probability_formula:'min(0.45,0.10+(heat-100)/150)',new_strength:0.22},method('_fires'),mapping(['Fire','Heat']));
add('fire.hit_ignition','fire',{allowed_causes:['laser','cannon','splash','explosion'],target_must_survive:true,armor_base_probability:0.06,other_base_probability:0.16,damage_fraction_weight:0.55,maximum_damage_probability_bonus:0.26,probability_formula:'base + min(0.26,taken/maxHp*0.55)',initial_strength_base:0.18,initial_strength_damage_weight:0.65,initial_strength_cap:0.6,strength_formula:'min(0.6,0.18+taken/maxHp*0.65)'},method('_damagePart'),mapping('Fire'));

add('power.shield_regeneration','power',{regen_per_module:api.PARTS.shield.shieldRegen,enemy_regen_multiplier:0.7,min_local_power_exclusive:0.6,power_per_shield_hp:0.075,regen_clamps:['missing ship shield','local module power / 0.075'],shield_pool:'sum of active module capacities * ship.shieldScale'},[method('_systems'),method('_shieldMax'),scopedLine('shield',partScope)],mapping('Shield'));
add('power.shield_absorption','power',{active_pool_threshold:0.01,active_module_power_threshold:0.002,power_per_absorbed_damage:0.018,radius_margin_world_units:16,absorption_formula:'min(ship.shield,projectile.damage,total_power/0.018)',coverage:'full circular ship shield'},[method('_shieldState'),method('_projectileUpdate')],mapping('Shield','이 프로토타입은 전방위 원형 실드 풀을 사용한다. 원작 방향성 방어막과 등가라고 보지 않는다.'));
add('thermal.cooling','thermal',{per_radiator_base:api.PARTS.radiator.cooling,passive_loss_per_hot_part_per_sim_second:0.45,formula:'max(0,heat-dt*(0.45+total_connected_cooling*heat/total_hot_heat))',spatial_model:'shared connected-hull cooling; no heat pipe network'},[scopedLine('radiator',partScope),method('_systems')],mapping(['Radiator','Heat']));
add('thermal.thresholds','thermal',{overheat_at_or_above:100,overheat_cleared_below:65,warning_above:85,heat_damage_above:125,heat_damage_hp_per_sim_second:2.5,heat_damage_mode:'battle'},method('_systems'),mapping('Heat'));
add('weapons.overclock','combat',{fire_rate_multiplier:1.65,power_per_shot_multiplier:1.28,heat_per_shot_multiplier:3.3,enemy_only_sector:3,enemy_period_seconds:18,enemy_on_window_seconds:5},method('_weapons'),mapping('Overclocking'));
const enemyDamage=literal('_weapons',/const damageScale = ship\.faction === 'enemy' \? (\{.+\})\[ship\.enemyStyle/);
const enemyInterval=literal('_weapons',/ship\.level === 1 \? (\{.+?\})\[ship\.enemyStyle/);
add('weapons.enemy_modifiers','combat',{damage_by_style_sector_index:enemyDamage,sector_1_interval_multiplier:enemyInterval,enemy_spread_width_sector_1:19,enemy_spread_width_later:11,player_cannon_spread_width:7,player_laser_spread_width:3,spread_offset_formula:'(random()-0.5)*spread_width'},method('_weapons'));
add('weapons.firing_geometry','combat',{aim_lead_fraction:0.85,projectile_spawn_offset_world_units:17,ttl_padding_seconds:0.1,firing_arc:'full radians; absolute angular deviation <= firingArc/2',self_occlusion:'hold fire if a live own part intersects the path',laser_self_block_half_cell:0.50,cannon_self_block_half_cell:0.54,projectiles_ignore_owner_after_launch:true},[method('_weapons'),method('_weaponBlocker'),method('_projectileUpdate')],mapping('Firing Arc'));
add('combat.damage_and_blasts','combat',{projectile_laser_collision_half_cell:0.49,projectile_cannon_collision_half_cell:0.54,cannon_neighbor_splash_fraction:0.12,reactor_blast_radius_cells:2.5,reactor_blast_peak_coefficient:190,reactor_blast_falloff_divisor:3.2,reactor_blast_formula:'190*(1-distance/3.2)',storage_blast_neighbors:'orthogonal only',storage_blast_ammo_coefficient:0.3,storage_blast_hp_cap:65,topology_resolution:'after entire nested destruction cascade'},[method('_projectileUpdate'),method('_damagePart')],mapping(['Damage','Fire']));
add('combat.auto_target','combat',{player_priorities:T.PRIORITIES,enemy_siege_priority:'cockpit',other_enemy_priority:'weapons',retarget_seconds:1.4,score:'distance_to_target + target.hp*0.06',sort:'ascending',manual_target_overrides_automatic:true},method('_chooseTarget'),mapping('Target Part'));

const ranges=literal('_motion',/const desiredRange = player \? (\{.+?\})\[tactic\]/);
for(const tactic of T.TACTICS)add('tactic.'+tactic,'tactics',{tactic,desired_range_world_units:ranges[tactic] ?? null,position_hold:tactic==='hold',range_minimum:'ship.radius+opponent.radius+35',player_strafe_amplitude:tactic==='kite'?28:tactic==='assault'?0:tactic==='balanced'?5:null},[exact('const TACTICS ='),method('_motion')],mapping('Fleet Control'),'source_rule');
add('propulsion.force','propulsion',{base_force_per_thruster:api.PARTS.thruster.thrust,drive_upgrade:'1+level*0.10',power_fraction:'clamp(power/0.6,0,1)',blocked_exhaust_output:0,mass_floor:1,inertia_floor:10,angular_coefficient:0.17,local_acceleration:'direction*force/mass',angular_acceleration:'cross(part_position-center_of_mass,direction)*force/inertia*0.17'},[method('_thrustModel'),scopedLine('thruster',partScope)],mapping('Thruster'));
add('propulsion.autopilot','propulsion',{player_max_commanded_speed:72,enemy_max_commanded_speed:{patrol:64,siege:43,hunter:98},position_to_speed_gain:0.42,velocity_to_acceleration_gain:0.95,angle_to_angular_velocity_gain:1.7,commanded_angular_velocity_limit:0.72,angular_velocity_to_acceleration_gain:2.4,solver_iterations:14,angular_solver_weight:45,translation_drag_per_second:0.018,angular_drag_per_second:0.11,world_boundary_min:-1500,world_boundary_max:1500,cockpit_power_for_controls:0.05,arrival_distance_world_units:12,arrival_speed_world_units_per_second:6},method('_motion'),mapping('Ship Maneuvering'));
add('propulsion.power','propulsion',{idle_power_per_thruster_per_sim_second:0.025,full_throttle_power_per_sim_second:api.PARTS.thruster.powerUse,formula:'dt*(0.025+0.7*throttle)',applied_in:'battle motion update'},[method('_motion'),scopedLine('thruster',partScope)],mapping(['Thruster','Battery']));
add('propulsion.mass_and_inertia','propulsion',{mass:'sum(PARTS[type].mass for live connected parts)',center_of_mass:'mass-weighted average cell coordinates',inertia:'max(10,sum(mass*((x-com.x)^2+(y-com.y)^2+0.35)))',radius:'max(50,max(hypot(cell_x,cell_y)*28+28*0.7))',radius_floor_world_units:50,cell_radius_margin_fraction:0.7,inertia_cell_self_term:0.35},method('_topology'),mapping('Ship'));

add('persistence.version','persistence',{version:api.VERSION,accepted_versions:[1,2,3],game_identifier:'starforge-drydock',maximum_string_characters:600000,maximum_parts_per_ship:160,maximum_crew_per_ship:60,maximum_projectiles:500,maximum_debris:1000,maximum_recent_hits:1000,maximum_job_path_entries:400,atomic_import:true,persisted:['design','progress','resource inventories','crew jobs','projectiles','fire','service jobs','repair stock','upgrades','repair policy','manual service target','random state','fire clock'],not_persisted:['decorative effects','decorative fragments']},[method('exportSave'),method('importSave')],prototypeOnly);

const dataset={
  dataset_id:'starforge_v3',
  title:'STARFORGE v3 implementation data — not Cosmoteer original values',
  schema_version:1,
  source_commit:COMMIT,
  source_revision_verified:cp.execFileSync('git',['-C',REPO,'rev-parse',COMMIT],{encoding:'utf8'}).trim(),
  value_origin:'prototype_code',
  original_game_values:false,
  extraction_date:'2026-11-17',
  extraction_method:'Pinned git blobs, disposable in-memory CommonJS VM, explicit source-rule normalization, runtime-derived layouts and aggregates.',
  source_files:Object.entries(source).map(([file,text])=>({file,sha256:sha256(text),line_count:lines[file].length})),
  units:{time:'simulation seconds',coordinates:'prototype world units; CELL=28 world units per grid cell',angle:'radians unless quarter-turn index is explicit',mass:'abstract prototype mass; not verified tonnes',power:'prototype resource units',ammo:'prototype resource units; not original stack counts',heat:'prototype heat units',fire:'unitless 0..1 intensity',credits:'prototype credits'},
  caveats:[
    'Every numeric balance value belongs to STARFORGE; no row is a recovered Cosmoteer original balance row.',
    'Name/concept mappings are navigation aids. They do not establish original definition IDs, part sizes, resource recipes or numeric equivalence.',
    'This prototype has no industrial factory/material recipe table. Power generation and dock purchases are exported as distinct implemented mechanisms.',
    'Derived layout totals are computed from the committed code; they are not measurements of Cosmoteer.',
    'The extractor never edits or checks out repository files. Its VM instrumentation only exposes constants in memory.'
  ],
  category_counts:rows.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{}),
  row_count:rows.length,
  rows
};
const ids=new Set();
for(const row of rows){
  assert.ok(!ids.has(row.id),'Unique row id: '+row.id);ids.add(row.id);
  assert.equal(row.value_origin,'prototype_code');
  assert.equal(row.cosmoteer_mapping.original_value_equivalence,false);
  for(const ref of row.source_ranges)range(ref.source_file,ref.source_lines.start,ref.source_lines.end);
}
assert.equal(rows.filter(r=>r.category==='parts').length,11);
assert.equal(rows.filter(r=>r.category==='upgrades').length,9);
assert.equal(rows.filter(r=>r.category==='missions').length,9);
assert.equal(rows.filter(r=>r.category==='fleet').length,10);
assert.equal(rows.filter(r=>r.category==='presets').length,3);
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(dataset,null,2)+'\n');
process.stdout.write(JSON.stringify({output:OUTPUT,source_commit:COMMIT,rows:rows.length,categories:dataset.category_counts,bytes:fs.statSync(OUTPUT).size})+'\n');
