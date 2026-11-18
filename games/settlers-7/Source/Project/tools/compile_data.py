"""Compile the explicit playable profile; v23 evidence stays unchanged."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
t=json.loads((ROOT/'reference/reference_master_v23.json').read_text(encoding='utf-8'))['tables'];P=[]
def record(entity,field,value,basis,source,note=''):
 P.append(dict(entity=entity,field=field,value=value,basis=basis,source=source,note=note))
R={r['id']:{'id':r['id'],'name':r['name_ko']} for r in t['resources']}; B={}
for b in t['buildings']:
 if b['id']=='constructor':continue
 cost=b['base_cost'] if b['base_cost'] is not None else {'plank':3,'stone':2}
 B[b['id']]={'id':b['id'],'name':b['name_ko'],'cost':cost,'housing':b['base_living_space'] or 0,'slots':3 if b['kind']=='base' else 0,'seconds':8,'levels':{}}
 record(b['id'],'cost',cost,'documented' if b['base_cost'] is not None else 'playable_override',b['source_id'])
 record(b['id'],'seconds',8,'playable_override','V24','원작 건설 시간 미확인')
for l in t['building_levels']:
 if l['building_id'] in B:B[l['building_id']]['levels'][str(l['upgrade_index'])]={'cost':l['cost'],'housing':l['living_space']}
C={'woodcutter':12,'forester':24,'quarry':16,'coal_miner':16,'iron_miner':18,'gold_miner':24,'sawmill':14,'grain_barn':18,'windmill':12,'bakery':16,'fisher':20,'hunter':24,'piggery':26,'shepherd':22,'stable':28,'iron_smelter':18,'toolmaker':20,'blacksmith':24,'coking_plant':18,'papermill':16,'weaving_mill':20,'brewery':18,'bookbindery':22,'mint':24,'goldsmith':26,'tailor':22,'butcher':18,'wheelwright':20}
W={}
for w in t['workshops']:
 q=next((r for r in t['recipe_quantity_claims'] if r['workshop_id']==w['id']),None);ins={}
 for r in t['recipe_input_claims']:
  if not q or r['claim_id']!=q['id'] or r['requirement_kind']=='food_group':continue
  rid=r['resource_id'] or 'wood';ins[rid]=r['reported_qty'];record(w['id'],'input.'+rid,r['reported_qty'],'community_candidate' if r['resource_id'] else 'playable_override',r['id'],'모호한 목재는 실행 프로필에서만 통나무 선택' if not r['resource_id'] else '')
 W[w['id']]={'id':w['id'],'name':w['name_ko'],'parent':w['parent_building_id'],'foodClass':w['food_class'],'input':ins,'output':q['output_resource_id'] if q else None,'qty':q['reported_output_qty'] if q else 0,'environment':q['environment_requirement'] if q else 'forestry','seconds':C[w['id']],'tool':w['startup_tool_qty'],'source':q['id'] if q else w['source_id']}
 record(w['id'],'seconds',C[w['id']],'playable_override','V24','생산 시간 미복원; 수량 후보 사용')
W['well_water']={'id':'well_water','name':'우물 물 긷기','parent':'well','foodClass':'forester_exception','input':{},'output':'water','qty':1,'environment':None,'seconds':8,'tool':0,'source':'V24'}
U={}
for u in t['units']:
 cost={r['requirement_id']:r['qty'] for r in t['unit_costs'] if r['unit_id']==u['id']}
 patch=[r for r in t['versioned_unit_costs'] if r['unit_id']==u['id'] and r['recruitment_location']==u['training_building_id'] and r['profile_id']=='patch_108_documented']
 if patch:cost={r['requirement_id']:r['qty'] for r in patch}
 U[u['id']]={'id':u['id'],'name':u['name_ko'],'branch':u['branch'],'building':u['training_building_id'],'level':u['min_upgrade_index'],'population':u['population_cost'],'cost':cost,'seconds':16+6*u['min_upgrade_index'],'trades':u['trades_per_trip'] or 0}
 record(u['id'],'cost',cost,'documented_patch_mirror' if patch else 'documented','P108' if patch else u['source_id'],'수련자 식량 1은 BLD 참고 프로필' if u['id']=='novice' else '')
 record(u['id'],'seconds',U[u['id']]['seconds'],'playable_override','V24')
for uid,hp,damage,ranged in [('pikeman',26,4,False),('musketeer',20,6,True),('cavalier',42,8,False),('cannon',30,12,True),('standard_bearer',24,0,False)]:
 U[uid]['combat']={'hp':hp,'damage':damage,'range':ranged};record(uid,'combat',U[uid]['combat'],'playable_override','V24','표시 수치 후보를 HP·DPS로 전용하지 않음')
T={}
for i,(tid,cost,effect) in enumerate([('engineering',{'novice':2},'새 작업장 도구 소비 없음'),('hygiene',{'novice':3},'주택 +2 / 귀족 주택 +4 인구'),('architecture',{'novice':2,'brother':1},'신규 건설 속도 2배'),('scarecrow',{'novice':3,'brother':1},'농사·제분 작업자 이동 속도 2배'),('ballistics',{'novice':3,'brother':2},'총병·포병 공격 보너스 33%'),('forced_march',{'novice':2,'father':1},'군사 원정 이동 속도 2배')]):
 src=next(r for r in t['technologies'] if r['id']==tid);T[tid]={'id':tid,'name':src['name_ko'],'cost':cost,'seconds':40+i*8,'description':effect,'source':src['source_id']};record(tid,'research_cost',cost,'playable_override','V24','기술 이름별 원작 연구비 미확정')
O=[]
for oid,name,give,get in [('plank_sale','건축 자재 판매',{'plank':4},{'coin':3}),('cloth_sale','직물 무역',{'cloth':2},{'coin':4}),('food_sale','곡물 운송',{'grain':4},{'coin':2}),('tool_import','비상 도구 조달',{'coin':4},{'tool':2}),('iron_import','철괴 수입',{'coin':3},{'iron':2}),('book_import','책 수입',{'coin':4},{'book':2}),('garment_import','의복 수입',{'coin':4},{'garment':2}),('beer_import','맥주 수입',{'coin':3},{'beer':3}),('jewelry_import','장신구 수입',{'coin':5},{'jewelry':1})]:O.append(dict(id=oid,name=name,give=give,get=get));record(oid,'exchange',{'give':give,'get':get},'playable_override','V24','캠페인 원작 교역로가 아닌 샘플 시나리오')
profile={'id':'v24_playable_hybrid','referenceVersion':'23.0','notOriginalRuntime':True,'capacity':3,'warehouseCapacity':600,'bufferCapacity':9,'workerSpeed':1.8,'carrierSpeed':2.2,'initialPopulationBase':16,'foodPerCycle':1,'conversionRounding':'ceil_playable_only','winPoints':6,'winHoldSeconds':30,'roadCost':{},'worldWidth':60,'worldHeight':36,'tickSeconds':.25}
for k,v in profile.items():
 if k not in ['id','referenceVersion']:record('profile',k,v,'playable_override','V24')
D={'profile':profile,'resources':R,'buildings':B,'workshops':W,'units':U,'techs':T,'offers':O,'formulas':t['expansion_formulas'],'provenance':P}
(ROOT/'data/playable_profile.json').write_text(json.dumps(D,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'game/data.js').write_text('(function(g){const D='+json.dumps(D,ensure_ascii=False,separators=(',',':'))+';if(typeof module!=="undefined"&&module.exports)module.exports=D;else g.S7DATA=D;})(globalThis);',encoding='utf-8')
print('Compiled',len(R),'resources,',len(W)-1,'workyards,',len(U),'units,',len(T),'techs')
