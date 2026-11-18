// Read-only source audit. Usage: node extract-current.mjs PROJECT_ROOT [OUTPUT_DIR]
// This script writes only its output directory and never changes game source files.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const project=resolve(process.argv[2]||'/workspace/sites/breath-colony-30b984');
const out=resolve(process.argv[3]||dirname(fileURLToPath(import.meta.url)));
await mkdir(out,{recursive:true});
const observedAt='2026-11-18';
const fileIds={
  'dist/engine.js':'A_ENGINE', 'dist/utilities.js':'A_UTILITIES',
  'dist/community.js':'A_COMMUNITY','dist/frontier.js':'A_FRONTIER',
  'dist/app.js':'A_APP','dist/renderer.js':'A_RENDERER',
  'package.json':'A_PACKAGE', 'QA_REPORT.md':'A_QA'
};
const files=new Map();
for(const [file,id] of Object.entries(fileIds)){
  const data=await readFile(join(project,file));
  files.set(file,{id,file,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.byteLength,lines:data.toString('utf8').split('\n'),kind:'current_project_source',observed_at:observedAt});
}
const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim();
const status=execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}).trim();
const {Game,BUILDINGS,MATERIALS,WORLD_W,WORLD_H,CYCLE_SECONDS}=await import(pathToFileURL(join(project,'dist/engine.js')));
const game=new Game(73);
function cite(file,needle,additionalLines=0){
  const source=files.get(file),index=source.lines.findIndex(line=>line.includes(needle));
  if(index<0)throw new Error(`Missing source anchor: ${file}: ${needle}`);
  return{source_id:source.id,file,line_start:index+1,line_end:index+1+additionalLines,sha256:source.sha256};
}
function envelope(type,records){return{schema_version:'1.0',dataset:type,scope:'breath-colony-4.0.0-current-implementation',observed_at:observedAt,source_commit:commit,source_tree_dirty:status.length>0,records};}
async function save(name,value){await writeFile(join(out,name),JSON.stringify(value,null,2)+'\n');}
function csvCell(value){const text=value===undefined||value===null?'':typeof value==='object'?JSON.stringify(value):String(value);return '"'+text.replaceAll('"','""')+'"';}
async function csv(name,columns,rows){await writeFile(join(out,name),'\uFEFF'+[columns.map(csvCell).join(','),...rows.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\n')+'\n');}

const buildingRecords=Object.entries(BUILDINGS).map(([id,b])=>{
  const file=Object.keys(fileIds).filter(p=>p.startsWith('dist/')&&p.endsWith('.js')).find(p=>files.get(p).lines.some(l=>new RegExp('^\\s*'+id+':\\s*\\{').test(l)));
  const source=cite(file,files.get(file).lines.find(l=>new RegExp('^\\s*'+id+':\\s*\\{').test(l)).trim());
  return{id:'breath.'+id,code_id:id,label_ko:b.name,cost:b.cost,power_draw_w:Math.max(0,b.power||0),generation_w:Math.max(0,-(b.power||0)),research_unlock_points:b.unlock||0,footprint_cells:[1,1],cost_unit:'legacy_resource_unit; water is displayed as L',evidence_status:'observed_code',provenance:[source,cite('dist/engine.js','if(cell.solid||b||t)return')],original_game_equivalence:'unmapped; not an ONI original datum'};
});
const materialRecords=Object.entries(MATERIALS).map(([id,m])=>({id:'breath.material.'+id,code_id:id,label_ko:m.name,work_divisor_seconds:m.hardness,resource_id:m.yield,yield_units:m.amount,evidence_status:'observed_code',provenance:[cite('dist/engine.js',id+':{name:')],notes:id==='bedrock'?'Placement API refuses digging; 999 is not a supported normal dig duration.':'hardness is the divisor in progress += dt / hardness; yield is game units, not kg.'}));
const objectiveSources=['dist/engine.js','dist/utilities.js','dist/community.js','dist/frontier.js'];
const objectiveRecords=game.objectives.map(o=>{
  const file=objectiveSources.find(p=>files.get(p).lines.some(l=>l.includes("id:'"+o.id+"'")));
  return{id:'breath.objective.'+o.id,code_id:o.id,stage:o.stage,label_ko:o.label,target:o.target,description_ko:o.description,evidence_status:'observed_code',provenance:[cite(file,"id:'"+o.id+"'")]};
});

const rules=[];
function add(id,system,entity,field,value,unit,meaning,file,anchor,extra={}){
  rules.push({id:'audit.'+id,system,entity,field,value,unit,meaning_ko:meaning,evidence_status:'observed_code',scope:'breath-colony-4.0.0-current-implementation',provenance:[cite(file,anchor)],...extra});
}
const E='dist/engine.js',U='dist/utilities.js',C='dist/community.js',F='dist/frontier.js',A='dist/app.js';
add('world.width','clock_world','world','width',WORLD_W,'cell','지도 너비',E,'WORLD_W=48');
add('world.height','clock_world','world','height',WORLD_H,'cell','지도 높이',E,'WORLD_W=48');
add('world.cycle','clock_world','clock','cycle_seconds',CYCLE_SECONDS,'simulation_s','게임 내 한 주기; 원작 주기값과 별개',E,'WORLD_W=48');
add('world.seed','clock_world','world','default_seed',73,'uint32','생성 시 기본 시드; 난수는 월드 생성에서 사용',E,'constructor(seed=73)');
add('world.rng','clock_world','world','rng','seeded integer-mixing PRNG used during reset','algorithm','Math.random 없이 동일 시드 초기 지형 생성',E,'function rngFor(seed)');
add('clock.max_substep','clock_world','clock','max_substep',0.1,'simulation_s','Game.step은 요청 시간을 최대 .1초로 나누며 마지막 잔여분도 즉시 진행',E,'step(dt){');
add('clock.max_step_request','clock_world','clock','accepted_step_dt',[0,3600],'simulation_s','외부 step 인수 유효 범위',E,'step(dt){');
add('clock.environment','clock_world','clock','environment_interval_threshold',0.2,'simulation_s','누적 시간이 .2 이상이면 누적 dt로 환경 업데이트하고 0으로 초기화',E,'if(this._envClock>=.2)');
add('clock.stats','clock_world','clock','stats_interval_threshold',0.5,'simulation_s','누적 시간이 .5 이상이면 통계 갱신 후 0으로 초기화',E,'if(this._statClock>=.5)');
add('clock.ui_fixed_tick','clock_world','browser','simulation_accumulator_tick',0.1,'simulation_s','브라우저 프레임은 .1초 단위로 Game.step을 호출',A,'while(accumulator>=.1)');
add('clock.frame_cap','clock_world','browser','max_wall_frame_elapsed',0.12,'wall_s','긴 프레임의 실제 경과시간을 .12초로 제한; 오프라인 경과시간 보상 없음',A,'const elapsed=lastTime?');
add('clock.background','clock_world','browser','background_policy','pause; reset accumulator on visibility change','policy','숨겨진 탭에서 게임을 진행하지 않고 저장',A,"document.addEventListener('visibilitychange'");
add('clock.autosave','persistence','browser','autosave_interval',15000,'wall_ms','보이는 탭에서 15초마다 자동 저장',A,'setInterval(()=>');
add('clock.history','telemetry','history','sample_interval',10,'simulation_s','산소·식품·물·전력 추세 기록 간격',U,'this.production.energyGenerated+=');
add('clock.history_limit','telemetry','history','max_samples',90,'sample','최대 추세 기록 수',U,'this.production.energyGenerated+=');
add('clock.event_limit','telemetry','events','max_entries',25,'event','최대 이벤트 로그 수',E,'_event(text,tone=');

add('crew.initial_population','crew','crew','initial_population',3,'person','초기 대원 세 명',E,"this._newCrew(21,11)");
add('crew.recruit_limit','crew','recruitment','alive_limit',4,'person','정상 모집 API의 생존 인원 상한',E,'recruit(){');
add('crew.recruit_research','crew','recruitment','research_minimum',12,'point','새 대원 모집 연구 조건',E,'recruit(){');
add('crew.recruit_cost','crew','recruitment','cost',{metal:20,water:10,food:8},'legacy_resource_units','모집 자원 비용',E,'recruit(){');
add('crew.need_range','crew','needs','range',[0,100],'point','건강·포만·기력·스트레스·호흡의 범위',E,'_newCrew(x,y)');
add('crew.initial_needs','crew','needs','initial',{health:100,hunger:88,energy:90,stress:0,breath:100},'point','기본 초기 대원 상태',E,'_newCrew(x,y)');
add('crew.hunger_decay','crew','hunger','decay',0.20,'point/s','기본 포만도 감소율; kcal 수치가 아님',E,'c.hunger=clamp(c.hunger-dt');
add('crew.eat_threshold','crew','hunger','seek_meal_below',48,'point','식량이 있고 포만도가 이 값 미만일 때 식사 탐색',E,'if(c.hunger<48');
add('crew.energy_decay','crew','energy','decay_by_action',{rest:0,walking:0.07,working:0.11,idle:0.025},'point/s','기본 기력 감소율; 쉬기 보충은 별도',E,'c.hunger=clamp(c.hunger-dt');
add('crew.rest_threshold','crew','energy','seek_rest_below',24,'point','기력 부족 시 침상 또는 바닥 휴식',E,'if(c.energy<24)');
add('crew.movement','navigation','crew','walk_speed',2.25,'cell/s','기본 이동 속도',E,'move=dt*2.25');
add('crew.water_slowdown','navigation','crew','water_speed_factor','1 - 0.65 * waterFraction','formula','침수량에 따른 이동 속도 배율',E,'move=dt*2.25');
add('crew.fall_speed','navigation','crew','fall_speed',3,'cell/s','지지대가 없을 때 하강',E,"c.y+dt*3");
add('crew.fall_needs_gap','crew','needs','falling_update_order','returns before hunger/energy/breathing/health update','control_flow','낙하 분기에서는 위생·생활 요구 갱신 뒤 기본 생존 수치 갱신 전에 반환',E,'if(!this._standable(x,y)');
add('crew.suffocation_damage','crew','health','suffocation_damage',3,'health_point/s','호흡 게이지가 0일 때 손상',E,'let hurt=');
add('crew.starvation_damage','crew','health','starvation_damage',0.3,'health_point/s','포만 게이지가 0일 때 손상',E,'let hurt=');
add('crew.heat_damage','crew','health','heat_damage','max(0,temp-46)*0.08','health_point/s','46°C 초과 온도에 선형 손상; 체온 상태 없음',E,'let hurt=');
add('crew.recovery','crew','health','recovery',0.018,'health_point/s','손상 요인이 없고 포만도 >35일 때 회복',E,'let hurt=');
add('crew.roles','labor','roles','allowed',['balanced','dig','build','operate','farm','haul','cook'],'enum','역할은 작업 선호 및 일부 속도 보너스',E,'const ROLES=');
add('crew.stress_penalty','labor','work','stress_efficiency','clamp(1 - max(0,stress-35)*0.008,0.48,1)','ratio','스트레스 35 초과부터 효율 감소; 하한 .48',C,'proto._workEfficiency=function');
add('crew.work_stress','labor','stress','productive_job_increment',0.060,'point/s','작업 종류가 생산 작업이면 이동·대기 중에도 적용될 수 있음; 기본 스트레스 변화와 합산',C,'proto._communityNeeds=function');
add('crew.baseline_stress','crew','stress','baseline_delta',{hurt:0.5,notBreathable:0.16,energyBelow12:0.08,otherwise:-0.035},'point/s','기본 생존상태에 따른 스트레스 변화',E,'c.stress=clamp(c.stress+dt*');

add('gas.cell_model','gas','cell','fields',['oxygen','co2'],'independent_scalar','같은 칸에 산소와 이산화탄소 수치가 동시에 존재',E,'return{solid,oxygen:0,co2:0');
add('gas.clamp','gas','cell','per_species_clamp',[0,3],'gas_unit','환경 업데이트에서 각각 독립적으로 제한',E,'c.oxygen=clamp(c.oxygen+o[i]');
add('gas.oxygen_display','gas','ui','oxygen_display','clamp(oxygen/0.8,0,1)*100','percent_index','부피비/압력이 아닌 포화 지표; 값 .8에서 UI 100%',E,'this.stats.oxygen=cells.length?');
add('gas.breathable_threshold','gas','crew','breathable','oxygen > 0.16 && water < 0.7','predicate','휴대통을 쓰지 않을 때 호흡 가능 조건',E,'const portableFraction=');
add('gas.breath_consumption','gas','crew','oxygen_consumption',0.055,'oxygen_unit/s','주변 칸에서 직접 산소를 소모',E,'const used=Math.min(p.oxygen,.055*dt)');
add('gas.exhalation','gas','crew','ambient_co2_factor',0.65,'co2_unit/oxygen_unit','일반 호흡 산소 소비량의 .65를 CO₂ 값에 더함',E,'const used=Math.min(p.oxygen,.055*dt)');
add('gas.breath_recovery','gas','crew','breath_recovery',18,'point/s','호흡 가능 시 호흡 게이지 회복',E,'const used=Math.min(p.oxygen,.055*dt)');
add('gas.breath_depletion','gas','crew','breath_depletion',7,'point/s','호흡 불가능 시 감소; 휴대통 최종 부분 틱은 비율 보간',E,'if(portableFraction>0)');
add('gas.diffusion_o2','gas','environment','oxygen_pair_diffusion',0.32,'1/s','차이×dt×.32만큼 우측/아래 이웃 쌍에 교환',E,'let f=(a.oxygen-b.oxygen)');
add('gas.diffusion_co2','gas','environment','co2_pair_diffusion',0.30,'1/s','차이×dt×.30 교환',E,'let g=(a.co2-b.co2)');
add('gas.co2_settling','gas','environment','co2_downward_coefficient',0.015,'1/s','CO₂의 추가 하강량=min(a.co2,dt*.015*a.co2)',E,'const fall=Math.min(a.co2');
add('gas.mining_injection','gas','mining','new_air_cell',{oxygen:0.06,co2:0.02},'gas_unit','채굴 완료 시 새 칸에 고정 기체량을 생성',E,"p.solid=null;p.oxygen=.06");
add('gas.tile_displacement','gas','construction','solid_tile_policy','sets oxygen=0,co2=0,water=0','policy','타일 완공은 기존 유체를 이웃으로 밀지 않고 0으로 설정',E,"if(b.type==='tile'){p.solid='tile'");
add('gas.diffuser_algae','production','diffuser','algae_consumption',0.025,'algae_unit/s','산소 확산기 소모',E,"if(b.type==='diffuser'){this.resources.algae");
add('gas.diffuser_output','production','diffuser','oxygen_output',0.35,'oxygen_unit/s','생산 누계는 .35dt 증가; 칸 저장량은 3에 제한',E,"if(b.type==='diffuser'){this.resources.algae");
add('gas.diffuser_pressure','production','diffuser','stop_pressure',2.5,'oxygen_unit + co2_unit','같은 칸의 O₂+CO₂가 2.5를 넘으면 압력 대기',E,"if(p.oxygen+p.co2>2.5)");
add('gas.scrubber','production','scrubber','co2_removal',0.035,'co2_unit/cell/s','주변 3×3 빈 칸의 CO₂를 각각 감소; 청수/오수 레시피 없음',E,"if(b.type==='scrubber')for");

add('liquid.terrain_capacity','liquid','terrain','water_fraction_to_litres',12,'L_display/fraction','취수 변환에서 지형 물 1.0을 12L로 취급',U,'proto._pumpWater=function');
add('liquid.pipe_capacity','liquid','pipe','capacity_each_cell',1,'L_display','각 청수/오수 관 한 칸의 저장 용량',U,'proto._slots=function');
add('liquid.reservoir','liquid','reservoir','capacity_each_layer',80,'L_display','청수 80과 오수 80을 별도 저장; 같은 탱크가 두 층을 지원',U,"b.cleanCapacity=b.type==='core'");
add('liquid.core','liquid','core','initial_capacity',120,'L_display','추가 보급 수입 시 _addWaterStock이 필요하면 용량 자동 확장',U,"b.cleanCapacity=b.type==='core'");
add('liquid.equalization','liquid','network','transport','whole-network capacity-proportional equalization each substep','algorithm','관 방향·속도·패킷 이동 지연이 없고 연결망 전체가 즉시 접근 가능',U,"for(const layer of ['water','waste'])for(const net");
add('liquid.pump_rate','liquid','pump','maximum_rate',0.4,'L_display/s','상하좌우 지형 물을 청수망으로 취수',U,'proto._pumpWater=function');
add('liquid.spring','liquid','spring','maximum_rate',0.30,'L_display/s','지형 water에 .025/s를 더한 뒤 12L로 환산; 무한한 외부 공급원',U,'for(const c of this.cells)if(c.spring');
add('liquid.gravity','liquid','terrain','maximum_vertical_transfer',2,'water_fraction/s','하방 빈 용량이 있을 때 제한',E,'const m=Math.min(a.water,1-down.water,dt*2)');
add('liquid.lateral','liquid','terrain','maximum_lateral_transfer',0.25,'water_fraction/s','인접 수위 차이 절반과 dt*.25 중 작은 값',E,'(a.water-side.water)*.5,dt*.25');
add('liquid.purifier','production','purifier','recipe',{dirty_input_lps:0.16,clean_fraction:0.95,rock_per_dirty_l:0.05},'mixed_legacy','오수 1당 청수 .95, 고체 .05 소모; 부산물 계상 없음',U,"if(b.type==='purifier'){const input");
add('liquid.electrolyzer','production','electrolyzer','recipe',{water_lps:0.18,oxygen_units_ps:0.30,hydrogen_units_ps:0.055},'mixed_legacy','입력에 비례해 출력; 각 종 단위가 달라 kg 보존식으로 합산 불가',U,"if(b.type==='electrolyzer'){const input");
add('liquid.hydrogen_store','production','hydrogen','shared_capacity',40,'hydrogen_unit','배관/탱크 위치와 무관한 공용 수소 저장고',U,"if(b.type==='electrolyzer'&&this.resources.hydrogen>=40)");
add('liquid.cooler_recipe','production','cooler','water_transfer',0.025,'L_display/s','청수를 같은 양의 오수로 변환',U,"if(b.type==='cooler'){const amount");

add('heat.conduction','temperature','environment','pair_coefficient',0.025,'1/s','재질·질량·비열과 무관하게 온도 차를 직접 교환',E,'let h=(a.temp-b.temp)');
add('heat.clamp','temperature','cell','temperature_clamp',[-20,150],'degC_display','환경 업데이트의 온도 제한; 열량 잔액 없음',E,'c.temp=clamp(c.temp+heat[i]');
add('heat.overheat','temperature','powered_consumer','disable_above',58,'degC_display','전력 소비 설비 공통 가동 정지 온도; 내구도 손상 상태 없음',E,"if(p.temp>58)return");
add('heat.diffuser','temperature','diffuser','direct_temperature_rate',0.025,'degC_display/s','주변 열량이 아닌 설비 칸 온도에 직접 가산',E,"p.temp+=.025*dt");
add('heat.coal','temperature','coalgen','direct_temperature_rate',0.12,'degC_display/s','석탄 발전 칸 온도 직접 가산',E,"p.temp+=.12*dt");
add('heat.hydrogen','temperature','hydrogenGen','direct_temperature_rate',0.09,'degC_display/s','수소 발전 칸 온도 직접 가산',U,"temp+=.09*dt");
add('heat.electrolyzer','temperature','electrolyzer','nominal_temperature_rate',0.06,'degC_display/s','input/.18 배율을 통해 실제 처리시간에 비례',U,"p.temp+=.06*ratio");
add('heat.cooler_area','temperature','cooler','area',[9,7],'cell','중심 기준 dx=-4..4,dy=-3..3 범위 빈 칸',U,"for(let dy=-3;dy<=3");
add('heat.cooler_floor','temperature','cooler','minimum_temperature',23,'degC_display','냉각 대상이 23 초과이면 직접 낮춤',U,'p.temp=Math.max(23,p.temp-dt*.10)');
add('heat.cooler_rate','temperature','cooler','per_cell_cooling_rate',0.10,'degC_display/s','수신 냉각수의 온도/질량이나 배출 열 저장 상태가 없음',U,'p.temp=Math.max(23,p.temp-dt*.10)');

add('power.battery','power','battery','capacity',1200,'J','W×s로 적산하는 전기에너지 저장',E,"capacity:type==='battery'?1200");
add('power.coal_input','power','coalgen','fuel_rate',0.025,'coal_unit/s','연료가 조금이라도 있으면 틱 전체 발전 후 재고를 0 이상으로 제한',E,"this.resources.coal-.025*dt");
add('power.coal_co2','power','coalgen','co2_rate',0.03,'co2_unit/s','발전 시 해당 칸에 CO₂ 생성',E,'p.co2+.03*dt');
add('power.hydrogen_input','power','hydrogenGen','fuel_rate',0.04,'hydrogen_unit/s','틱 연료가 충분해야 70W 발전',U,'proto._hydrogenPower=function');
add('power.dispatch','power','network','dispatch','diffuser first; then existing building order; binary per consumer','algorithm','생산×dt+저장 잔량에서 설비별 전력을 순서대로 할당',E,"consumers.sort((a,b)=>");
add('power.loss','power','network','battery_loss_rate',0,'J/s','저장 누수/변환 손실 항이 없으며 용량 초과 에너지는 버림',E,'energy=Math.min(cap,Math.max(0,energy))');
add('power.wire_rating','power','wire','maximum_watts',null,'W','전선 종류/허용 전력/과부하 손상 상태가 정의되지 않음',E,'_rebuildNetworks(){');
add('power.automation_battery','automation','generator','hysteresis',{on_at_or_below:0.25,off_at_or_above:0.90},'capacity_fraction','회로 축전지 총량을 기준으로 자동 제어',U,'proto._automationAllows=function');
add('power.automation_oxygen','automation','oxygen_facility','hysteresis',{on_at_or_below:0.65,off_at_or_above:1.25},'oxygen_unit','주변 7×5 빈 칸 평균 산소로 자동 제어',U,'proto._automationAllows=function');
add('power.automation_temperature','automation','cooler','hysteresis',{on_at_or_above:27,off_at_or_below:23.5},'degC_display','주변 7×5 빈 칸 평균 온도로 자동 제어',U,'proto._automationAllows=function');

add('food.farm_growth','food','farm','growth_duration',120,'simulation_s','보너스 없고 모든 공급 조건이 만족될 때 성장시간; 수확 노동은 별도',E,'b.growth+dt/120');
add('food.farm_water','food','farm','water_rate',0.012,'L_display/s','성장 중 청수 소비',E,'this._consumeWater(b,.012*dt)');
add('food.farm_temperature','food','farm','temperature_range',[12,35],'degC_display','구간 밖에서는 성장 정지',E,"p.temp<12||p.temp>35");
add('food.farm_o2','food','farm','minimum_oxygen',0.12,'oxygen_unit','산소가 .12 미만이면 성장 정지',E,"p.oxygen<.12?'산소 부족'");
add('food.farm_flood','food','farm','maximum_water_fraction',0.5,'water_fraction','water>.5이면 성장 정지',E,"p.water>.5?'침수'");
add('food.harvest','food','farm','harvest',{base_work_seconds:3,yield_food_units:1.5},'mixed_legacy','생활 기술은 수확 작업시간에 적용, 수확량은 고정',E,"if(j.kind==='harvest'){");
add('food.recipe','food','kitchen','recipe',{raw_food_units:2,clean_water_l:0.3,cooked_food_units:3,base_work_seconds:6,power_w:10},'mixed_legacy','완료 시 자원 차감/조리식 생성',C,'b.recipeProgress=Math.min');
add('food.recipe_target','food','kitchen','target_range',[0,60],'cooked_food_unit','기본 목표12, 0이면 멈춤',C,'proto.setKitchenTarget=function');
add('food.meal','food','crew','meal',{work_seconds:2,consumption_units:1,raw_hunger_gain:24,cooked_hunger_gain:30,cooked_stress_reduction:3,table_stress_reduction:4},'mixed_legacy','식사 때 조리식을 우선 사용; kcal 개념 없음',C,"if(j.kind==='eat'){");
add('food.decay_raw','food','raw','decay_fraction',0.00015,'1/s','잔여 원물 식량에 비례한 매틱 부패',C,'const RAW_DECAY=');
add('food.decay_cooked','food','cooked','decay_fraction',0.00030,'1/s','잔여 조리식에 비례한 매틱 부패',C,'const RAW_DECAY=');
add('food.fridge','food','fridge','decay_multiplier',0.2,'ratio','가동 중 냉장고가 하나라도 있으면 공용 전체 식품에 적용; 수용량/위치별 저장 없음',C,'function foodSnapshot(state)');
add('food.fooddays','telemetry','food','food_days_metric','(raw + cooked) / max(1,alive_count)','legacy_servings/person','raw와 cooked가 회복시키는 포만도가 다르지만 동일 가중으로 합산; 정확한 kcal 기반 자급일수는 아님',C,'proto._syncCommunity=function');

add('sanitation.bladder','sanitation','crew','bladder_growth',0.15,'point/s','용변 욕구 증가',U,'proto._sanitationNeeds=function');
add('sanitation.hygiene','sanitation','crew','hygiene_decay',{digging:0.055,other:0.022},'point/s','위생 감소율',U,'proto._sanitationNeeds=function');
add('sanitation.thresholds','sanitation','crew','seek',{toilet_bladder:70,sink_hygiene_below:65,task_preempt_bladder:80},'point','호흡·포만·에너지 조건을 만족하면 위생 우선 선택',U,'proto._choose=function(c)');
add('sanitation.toilet','sanitation','toilet','use',{clean_l:2,waste_l:2.2,seconds:4},'mixed_legacy','이용 완료 시 방광0, 위생-25',U,'if(j.elapsed>=(j.kind===');
add('sanitation.sink','sanitation','sink','use',{clean_l:0.65,waste_l:0.65,seconds:2.5},'mixed_legacy','이용 완료 시 위생100',U,'if(j.elapsed>=(j.kind===');
add('sanitation.accident','sanitation','crew','accident',{at_bladder:100,reset_bladder:15,hygiene_loss:28,stress_gain:12,cooldown:120},'mixed_legacy','기체/지형 오염물 생성 없이 상태값과 알림만 변경',U,'if(c.bladder>=100');
add('sanitation.disease','sanitation','pathogens','state',null,'not_implemented','세균 종·개체수·감염·질병 상태가 대원/칸 데이터에 없음',U,'proto._newCrew=function');

add('logistics.solid_keys','logistics','resources','hauled_solid_types',['rock','metal','algae','coal'],'enum','채굴 고체는 더미→운반→공용비축; 얼음은 청수로 처리',C,'const SOLIDS=');
add('logistics.cargo','logistics','crew','cargo_capacity',12,'legacy_solid_unit','운반 화물 한 종류를 최대12',C,'const RAW_DECAY=');
add('logistics.core','logistics','core','capacity',600,'legacy_solid_unit','공용 고체 저장 용량 기여분',C,'const RAW_DECAY=');
add('logistics.storage','logistics','storage','capacity',240,'legacy_solid_unit','완성된 보관함마다 공용 용량에 추가',C,'const RAW_DECAY=');
add('logistics.handling','logistics','crew','pickup_or_drop_seconds',0.6,'simulation_s','수거 .6초와 하역 .6초; 이동시간 별도',C,"if(j.phase==='pickup'){");
add('logistics.construction_reservation','logistics','build','material_policy','pay global stock immediately at blueprint queue','policy','실제 현장 건설 재료 배송 작업은 없음',E,'if(BUILDINGS[tool]){this._pay');
add('logistics.refund','logistics','deconstruct','refund_fraction',0.75,'ratio_before_floor','각 재료별 비용×.75를 버림하여 공용 재고에 환불',E,'Math.floor(v*.75)');
add('logistics.pipe_wire','logistics','infrastructure','construction','instant placement; metal 1 per cell','policy','전선·청수관·오수관은 노동 없이 즉시 설치',E,"if(tool==='wire'){c.wire=true");
add('labor.build_time','labor','task','base_build_work',4,'simulation_s','역할1.25·스트레스·기술 배율 적용 전',E,"j.kind==='build'?4:2.5");
add('labor.deconstruct_time','labor','task','base_deconstruct_work',2.5,'simulation_s','차단 상태에서는 진행/경험 증가 전 대기',E,"j.kind==='build'?4:2.5");
add('labor.role_bonus','labor','task','matching_role_efficiency',1.25,'ratio','굴착/건설/철거 작업의 role===kind에 적용; deconstruct 역할 enum 없음',E,"c.role===j.kind?1.25:1");
add('labor.priority','labor','task','priority_range',[1,5],'integer','일반 작업 점수 priority*13 + 역할18 - 경로길이*.5',E,'score:t.priority*13');
add('labor.navigation','navigation','pathfinding','algorithm','BFS; horizontal standable cells; vertical requires ladder','algorithm','시작칸과 navRevision 기준 단일 캐시',E,'_path(c,goals){');
add('labor.work_reach','navigation','work','reach','Manhattan distance <=2 with diagonal obstruction guards','algorithm','위아래2칸/좌우1칸 후보의 실제지지 여부 검사',E,'_workGoals(x,y,inside=true)');

add('schedule.modes','schedule','crew','presets',['auto','day','swing','night'],'enum','자율은 항상 work; 나머지는 phase 오프셋',C,'const SCHEDULES=');
add('schedule.phases','schedule','crew','phase_fraction',{work:0.66,break:0.18,sleep:0.16},'cycle_fraction','120초 주기에서 79.2/21.6/19.2초',C,'function phaseAt(');
add('schedule.offsets','schedule','crew','offsets',{day:0,swing:1/3,night:2/3},'cycle_fraction','각 교대의 phase 이동',C,'const offset=');
add('schedule.rest','schedule','crew','rest',{bed_energy_ps:3,floor_energy_ps:1.2,bed_stress_ps:-0.3,floor_stress_ps:-0.08,release_energy:95},'mixed_legacy','침상/바닥 휴식 효과; 방 보너스 별도',C,"if(j.kind==='rest'){");
add('schedule.record','schedule','crew','planned_rest_minimum',6,'simulation_s','교대 수면 구간에서 침상 휴식6초 이후 주기당1회 기록',C,"if(j.kind==='rest'){");
add('schedule.relax','schedule','crew','break',{stress_ps:-0.9,energy_ps:0.22,max_seconds:8},'mixed_legacy','식탁 여가 효과; work 복귀 또는 stress<=1이면 종료',C,"if(j.kind==='relax'){");

add('research.cap','research','research','cap',100,'research_point','하나의 누적연구 스칼라; 노드별 연구 포인트/선행조건 없음',U,"this.research={tier:0,cap:100");
add('research.rate','research','research','base_rate',0.24,'research_point/s','연구원·전력·청수 조건에서 스트레스/공학기술 배율 적용',E,'prev+.24*dt*efficiency');
add('research.water','research','research','water_rate',0.008,'L_display/s','연구 진척속도와 별개로 가동 초당 소비',E,'this._consumeWater(b,.008*dt)');
add('research.tier','research','research','tiers',[15,35,60],'research_point','표시 단계 경계, 시설별 unlock은 개별 테이블 참고',U,'this.research.tier=value>=60');

add('rooms.area','rooms','room','area_range',[6,64],'interior_cell','세 전문 방 모두 같은 면적 조건',F,'if(indices.length<6)');
add('rooms.boundary','rooms','room','boundary','completed door + solid cells; only revealed air flood-filled','policy','완공된 문은 개방 모드와 무관하게 방 경계이며 실제 유체 차단은 별도',F,'for(const b of buildings)if(b.type===');
add('rooms.types','rooms','room','specialized_types',['bedroom','messhall','greenhouse'],'enum','침상 우선, 다음 식탁, 다음 농장 순서로 분류',F,"if(has('cot'))");
add('rooms.greenhouse_farms','rooms','greenhouse','minimum_usable_farms',2,'building','작동 가능한 농장 최소2개',F,"else if(has('farm'))");
add('rooms.bed_bonus','rooms','bedroom','rest_bonus',{energy_ps:0.75,stress_ps:-0.2},'point/s','기본 침상3에 .75를 더해 총3.75/s; 실제 침상 휴식 중에만 적용',F,"c.energy=cap(c.energy+.75*dt)");
add('rooms.mess_bonus','rooms','messhall','meal_stress_bonus',-3,'point/meal','실제 식탁 식사 완료에만 추가 스트레스 감소',F,'c.stress=cap(c.stress-3*eaten)');
add('rooms.greenhouse_bonus','rooms','greenhouse','growth_multiplier',1.2,'ratio','충분한 급수/생장조건에서만 적용; 같은 초당물소모이므로 완료1회 물량은 줄어듦',F,'proto._farmGrowthMultiplier=function');
add('doors.modes','rooms','door','modes',['auto','open','locked'],'enum','잠긴 문은 대원 경로 차단, 닫힌 문은 기체/지형 물 차단',F,'const MODES=');
add('doors.auto_distance','rooms','door','opening_distance',{nearby:1.3,next_path_cell:1.8},'cell','대원이 가까이 있거나 다음 경로칸이면 자동 열림',F,"b.doorOpen=b.doorMode==='open'");

add('equipment.capacity','equipment','portable_oxygen','crew_capacity',6,'oxygen_unit','초기 휴대산소0',F,'const PORTABLE_CAPACITY=');
add('equipment.dock_capacity','equipment','oxygenDock','capacity',18,'oxygen_unit','초기 충전소 재고0',F,'const PORTABLE_CAPACITY=');
add('equipment.compress','equipment','oxygenDock','compression_rate',0.08,'oxygen_unit/s','전력8W가 공급될 때 주변 실제 산소를 이동',F,'const PORTABLE_CAPACITY=');
add('equipment.floor','equipment','oxygenDock','source_floor',0.35,'oxygen_unit/cell','각 출처칸을 .35 미만으로 빨아들이지 않음',F,'const PORTABLE_CAPACITY=');
add('equipment.range','equipment','oxygenDock','source_radius',2,'Manhattan_cell','실제 벽·문을 통과하는 연결성 검사',F,'proto._nearbyGasCells=function');
add('equipment.refill','equipment','oxygenDock','crew_transfer_rate',1.5,'oxygen_unit/s','실제 방문한 대원에게 저장 산소 이동; 압축 외의 전달에 전력 요구 없음',F,'const amount=Math.min(1.5*dt');
add('equipment.refill_threshold','equipment','crew','seek_refill_below',1.5,'oxygen_unit','여러 생존/일정 조건을 만족할 때만 충전작업 선택',F,'c.portableOxygen<1.5');
add('equipment.breath','equipment','portable_oxygen','consumption_rate',0.055,'oxygen_unit/s','주변 호흡이 불가능할 때 자동 모드로만 소비',F,'const PORTABLE_CAPACITY=');
add('equipment.portable_co2','equipment','portable_oxygen','co2_exhaust','no CO2 addition in portable branch','policy','휴대 호흡 분기는 일반 공기 호흡의 CO₂ 배출 분기를 지나지 않음',E,'if(portableFraction>0)');
add('equipment.protection','equipment','portable_oxygen','protection','breathing only','policy','열·이동·내구도/슈트 무게 보정 없음',F,'proto._portableBreath=function');

add('skills.xp_per_level','skills','crew','experience_per_level',60,'productive_work_xp','생산적 작업시간 기반 경험, 자동 포인트 지급 후 수동 배분',F,'const levelFor=');
add('skills.level_cap','skills','crew','max_level',6,'level','경험치 최대360',F,'const levelFor=');
add('skills.rank_cap','skills','skill','max_rank',3,'rank','굴착·공학·생활 각각 최대3',F,'if(c.skills[skill]>=3)');
add('skills.bonuses','skills','skill','rate_per_rank',{dig:0.20,build:0.15,deconstruct:0.15,research:0.10,cook:0.15,harvest:0.15},'ratio_increment','생산량 보너스는 없고 작업속도 배율; 수확은 별도 경과시간 배율',F,'proto._workEfficiency=function');
add('skills.morale','skills','crew','morale_requirement',null,'not_implemented','기술 투자에 사기 요구량/관심/특성이 없고 점수만 필요',F,'proto.trainCrew=function');

add('goals.stability','objectives','utility_stability','duration',180,'continuous_simulation_s','조건 이탈 시 0, 달성 목표 기록은 유지',U,'this.stability={seconds:0,target:180');
add('goals.settlement','objectives','settlement','duration',240,'continuous_simulation_s','기본 자립 조건 + 저장·조리·식사·수면·스트레스 조건',C,'this.settlement={seconds:0,target:240');
add('goals.frontier','objectives','frontier','duration',180,'continuous_simulation_s','정착 건강+방 접근성+기술3+실제휴대호흡30초+충전소 접근성',F,'const emptyFrontier=');
add('goals.reward','objectives','tutorial','rewards',{dig:{rock:40,metal:20},oxygen:{algae:20},battery:{metal:20,water:12},farms:{food:3,water:18},research:{coal:20,metal:20},haul:{metal:12}},'legacy_resource_units','외부 보급 이벤트; 닫힌 물질계 시뮬레이션에서는 별도 수입장부로 처리해야 함',E,'const rewards=');
add('save.version','persistence','save','schema_version',4,'version','현재 serialize 결과 version4; wrapper가 하위버전 계약을 순서대로 검사',F,'result.version=4;result.rooms=');
add('save.legacy','persistence','save','accepted_legacy_versions',[1,2,3,4],'version','v1→v2→v3→v4 순차 변환',U,'if(![1,2,3,4].includes');
add('save.map_fixed','persistence','save','required_map',[48,28],'cell','지도 크기가 상수와 다르면 거절',E,'if(object.version!==2||object.w!==WORLD_W');
add('save.crew_range','persistence','save','crew_array_length',[1,12],'person','불러오기 상한12는 정상 모집 상한4와 다름',E,'object.crew.length>12');
add('save.input_bytes','persistence','browser_import','max_file_bytes',4000000,'byte','UI JSON 파일 가져오기 제한',A,'if(file.size>4000000)');
add('save.profile','persistence','save','balance_profile_id',null,'not_implemented','현재 저장에는 단위체계·콘텐츠버전·데이터해시가 별도 없음',E,'serialize(){return copy(');
add('save.derived_rooms','persistence','save','derived_room_validation','recompute and exact JSON compare','algorithm','구조에서 재계산한 방·장비합계와 저장값의 일치를 검사',F,'const rooms=analyzeRooms(s);if(');
add('save.oxygen_balance','persistence','save','equipment_invariants',['portableUsed == protectedSeconds * .055','oxygenRefilled == carried + portableUsed','oxygenCompressed >= stored + refilled'],'equation','마지막 부등식은 충전소 철거 시 주변 방출량을 누계로 따로 기록하지 않는 데 따른 것',F,'if(Math.abs(s.production.oxygenRefilled');

const extraCitations={
 'audit.liquid.core':[cite(U,'proto._addWaterStock=function')],
 'audit.food.recipe':[cite(C,'kitchen:{name:')],
 'audit.sanitation.thresholds':[cite(U,'if(c.bladder>=80')],
 'audit.rooms.area':[cite(F,'if(indices.length>64)')],
 'audit.skills.level_cap':[cite(F,'c.experience=Math.min(360')],
 'audit.goals.reward':[cite(C,"if(o.id==='haul')this._pay")],
 'audit.save.profile':[cite(U,'proto.serialize=function'),cite(C,'proto.serialize=function'),cite(F,'proto.serialize=function')],
 'audit.save.oxygen_balance':[cite(F,'portableOxygenUsed-s.production.protectedSeconds')]
};
for(const r of rules)if(extraCitations[r.id])r.provenance.push(...extraCitations[r.id]);

const sources=[...files.values()].map(({lines,...v})=>({...v,line_count:lines.length-(lines.at(-1)===''?1:0)}));
await save('source_manifest.json',{schema_version:'1.0',observed_at:observedAt,source_commit:commit,source_tree_dirty:status.length>0,sources});
await save('current_buildings.json',envelope('current_buildings',buildingRecords));
await save('current_materials.json',envelope('current_materials',materialRecords));
await save('current_objectives.json',envelope('current_objectives',objectiveRecords));
await save('current_rules.json',envelope('current_rules',rules));
await save('current_initial_state_summary.json',{
  schema_version:'1.0',scope:'breath-colony-4.0.0-current-implementation',source_commit:commit,seed:73,
  state_version:game.version,initial_resources:game.resources,initial_building_counts:game.buildings.reduce((m,b)=>(m[b.type]=(m[b.type]||0)+1,m),{}),
  objective_count:game.objectives.length,stage_count:new Set(game.objectives.map(o=>o.stage)).size,
  crew_state_keys:Object.keys(game.crew[0]),cell_state_keys:Object.keys(game.cells[0]),building_state_keys:Object.keys(game.buildings[0]),
  serialized_top_level_keys:Object.keys(game.serialize()),note:'Fresh Game(73) inspection; no production code changed.'
});
await csv('current_rules.csv',['id','system','entity','field','value','unit','meaning_ko','evidence_status','provenance'],rules);
await csv('current_buildings.csv',['id','code_id','label_ko','cost','power_draw_w','generation_w','research_unlock_points','footprint_cells','cost_unit','evidence_status','provenance'],buildingRecords);
await csv('current_materials.csv',['id','code_id','label_ko','work_divisor_seconds','resource_id','yield_units','notes','evidence_status','provenance'],materialRecords);
await csv('current_objectives.csv',['id','code_id','stage','label_ko','target','description_ko','evidence_status','provenance'],objectiveRecords);
console.log(JSON.stringify({source_commit:commit,source_tree_dirty:status.length>0,records:{rules:rules.length,buildings:buildingRecords.length,materials:materialRecords.length,objectives:objectiveRecords.length},source_files:sources.length,output_directory:out},null,2));
