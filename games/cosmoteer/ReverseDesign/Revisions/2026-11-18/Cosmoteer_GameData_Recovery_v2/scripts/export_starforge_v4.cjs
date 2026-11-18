#!/usr/bin/env node
'use strict';
// Read-only extraction of the released v4 implementation. This is not original-game data.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const cp = require('node:child_process'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const COMMIT = '6ca48f00f86857f821422619827b617f0de549a3';
const FILES = ['dist/data.js', 'dist/sim.js', 'dist/editor.js', 'data/analysis-snapshot.json'];
const REPO = process.argv[2];
const read = file => REPO
  ? cp.execFileSync('git', ['-C', REPO, 'show', COMMIT + ':' + file], {encoding:'utf8', maxBuffer:8e6})
  : fs.readFileSync(path.join(ROOT, 'reference_code/v4', file), 'utf8');
const source = Object.fromEntries(FILES.map(file => [file, read(file)]));
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const clean = value => JSON.parse(JSON.stringify(value));
const source_files = Object.fromEntries(FILES.map(file => [file, {sha256:hash(source[file]),line_count:source[file].split('\n').length}]));
const dataContext = vm.createContext({module:{exports:{}}});
new vm.Script(source['dist/data.js']).runInContext(dataContext, {timeout:2000});
const data = dataContext.module.exports;
const marker = 'const api = { Game, PARTS, CONTRACTS, CELL, VERSION, DATA, INDUSTRY, CARRY_LIMIT, worldPoint, localPoint };';
assert.equal(source['dist/sim.js'].split(marker).length, 2);
const instrumented = source['dist/sim.js'].replace(marker,
  'const api = { Game, PARTS, CONTRACTS, CELL, VERSION, DATA, INDUSTRY, CARRY_LIMIT, worldPoint, localPoint, TABLES: { MODES, POLICIES, REPAIR_POLICIES, REPAIR_STOCK_MAX, REPAIR_BUNDLE, REPAIR_UNIT_COST, REPAIR_HP_PER_STOCK, REPAIR_RATE, EXTINGUISH_RATE, UPGRADES, TACTICS, PRIORITIES, CREW_RECRUIT_COST, DIRS, CREW_MOVEMENT } };');
const context = vm.createContext({module:{exports:{}},require:name=>{assert.equal(name,'./data.js');return data;}});
new vm.Script(instrumented).runInContext(context, {timeout:2000});
const api = context.module.exports, tables = clean(api.TABLES), game = new api.Game();
assert.equal(api.VERSION,4); assert.equal(Object.keys(api.PARTS).length,14);
function span(file,start,end,symbol) {return {source_file:file,source_lines:{start,end},source_symbol:symbol};}
function exact(text,file='dist/sim.js') {
  const hits = source[file].split('\n').map((line,i)=>line.includes(text)?i+1:0).filter(Boolean);
  assert.equal(hits.length,1,'unique anchor: '+text);return span(file,hits[0],hits[0],text);
}
function method(name,file='dist/sim.js') {
  const lines=source[file].split('\n'), start=lines.findIndex(line=>line.startsWith('    '+name+'('));
  assert.ok(start>=0,'method: '+name); let end=start+1;
  while(end<lines.length&&!/^    (?:get )?[A-Za-z_$][\w$]*\(/.test(lines[end])&&!/^  }$/.test(lines[end]))end++;
  return span(file,start+1,end,name);
}
const rows=[];
function add(id,category,fields,ranges,extraction='runtime_constant') {
  ranges=Array.isArray(ranges)?ranges:[ranges];
  rows.push({id,category,fields:clean(fields),...ranges[0],source_ranges:ranges,value_origin:'prototype_code',extraction_method:extraction,
    cosmoteer_mapping:{match_type:'concept_only',original_value_equivalence:false}});
}
for(const [id,part] of Object.entries(api.PARTS)) {
  const line=source['dist/sim.js'].split('\n').findIndex(s=>s.startsWith('    '+id+': {'))+1;
  assert.ok(line>=10&&line<=30,'PARTS declaration range');
  const ranges=[span('dist/sim.js',line,line,'PARTS.'+id)];
  if(['reactor','reactor_medium','reactor_large','ammo_factory','storage'].includes(id)) ranges.push(span('dist/data.js',1,source_files['dist/data.js'].line_count,'DATA.PART_OVERRIDES'));
  add('part.'+id,'parts',part,ranges);
}
add('simulation.constants','simulation',{VERSION:api.VERSION,CELL:api.CELL,...tables},[span('dist/sim.js',3,49,'top-level constants'),span('dist/data.js',1,source_files['dist/data.js'].line_count,'CREW_MOVEMENT')]);
add('simulation.initial_state','simulation',{mode:game.mode,sector:game.sector,credits:game.credits,crew:game.player.crew.length,part_count:game.player.parts.length,upgrades:game.upgrades,repairStock:game.player.repairStock},[method('reset'),method('_createShip'),method('_syncCrew')],'runtime_initialization');
add('analysis.adapter','data',{schema_version:data.SCHEMA_VERSION,adapter_version:data.ADAPTER_VERSION,snapshot_digest:data.SNAPSHOT_DIGEST,part_references:data.PART_REFERENCES,mappings:data.MAPPINGS},span('dist/data.js',1,source_files['dist/data.js'].line_count,'StarData'));
add('industry.constants','manufacturing',api.INDUSTRY,span('dist/data.js',1,source_files['dist/data.js'].line_count,'INDUSTRY'));
add('logistics.carry','crew',{carry_limit:api.CARRY_LIMIT,movement:tables.CREW_MOVEMENT},[exact('  const CARRY_LIMIT ='),method('_crewUpdate'),span('dist/data.js',1,source_files['dist/data.js'].line_count,'CREW_MOVEMENT')]);
for(const [id,contract] of Object.entries(api.CONTRACTS))add('contract.'+id,'career',contract,exact('    '+id+': Object.freeze'));
add('construction.geometry','construction',{occupancy:'one cell per part including all reactor sizes',coordinates:'integer local grid',structure:'orthogonal reachability from cockpit',walk_graph:'active walkable parts, implicit orthogonal access',explicit_doors:false,original_footprints_applied:false},[method('_makePart'),method('_topology')],'source_review');
add('crew.task_model','crew',{logistics:true,field_repair:true,firefighting:true,dedicated_device_operators:false,path_algorithm:'unweighted BFS',crew_roles:'global supply and service policies',original_room_speed_multipliers_applied:true},[method('_assignJob'),method('_path'),method('_crewUpdate')],'source_review');
add('combat.shields','combat',{geometry:'one ship-wide circle',per_generator_arc:false,pool:'aggregated ship.shield',recharge:'power-limited HP regeneration',full_battery_restart_gate:false},[method('_shieldMax'),method('_shieldState'),method('_systems'),method('_projectileUpdate')],'source_review');
add('thermal.model','thermal',{part_heat_state:true,heat_pipe_graph:false,cooling:'ship-wide weighted distribution',overheated_on:100,overheated_off_below:65,heat_damage_above:125,heat_unit:'prototype_heat'},method('_systems'),'source_review');
add('damage.explosions','damage',{reactor:'fixed radius damage',storage:'adjacent damage based on ammo; capped at 65',general_resource_explosion_table:false,fire_and_heat_local:true},method('_damagePart'),'source_review');
add('career.loop','career',{contracts:3,sectors:3,market_stations:false,faction_relations:false,fame_hiring_cap:false,reward_claim_once:true},[method('reset'),method('returnToDock'),method('salvage')],'source_review');
add('persistence.version','save',{version:4,accepted_legacy:[1,2,3],factory_progress_saved:true,old_save_sulfur_default:0,production_input_reserved_at_batch_start:true},[method('exportSave'),method('importSave'),method('_production')],'source_review');
const out={dataset_id:'starforge_v4',title:'STARFORGE v4 implementation snapshot',observed_at:'2026-11-18',source_commit:COMMIT,
  value_origin:'prototype_code',scope:'Selected runtime constants and selected source-reviewed behavior; not an exhaustive code-data export and not recovered Cosmoteer numerical equivalence.',
  source_files,rows,row_count:rows.length,category_counts:rows.reduce((a,r)=>(a[r.category]=(a[r.category]||0)+1,a),{})};
for(const [file,text]of Object.entries(source)) {const dest=path.join(ROOT,'reference_code/v4',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);}
fs.writeFileSync(path.join(ROOT,'data/starforge_v4.json'),JSON.stringify(out,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'reference_code/v4/SOURCE.json'),JSON.stringify({commit:COMMIT,files:source_files},null,2)+'\n');
console.log(JSON.stringify({dataset:out.dataset_id,rows:out.row_count,parts:Object.keys(api.PARTS).length,commit:COMMIT}));
