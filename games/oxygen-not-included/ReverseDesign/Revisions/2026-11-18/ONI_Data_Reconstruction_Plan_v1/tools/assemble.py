#!/usr/bin/env python3
"""사람이 출처를 확인한 원자료를 정규화한다. 게임 소스/네트워크를 변경하지 않는다."""
from pathlib import Path
import json,csv,hashlib,collections

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
REPORT=ROOT/'reports'
REPORT.mkdir(exist_ok=True)
def read(name):return json.loads((DATA/name).read_text())
def write(path,obj):path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')

sources=[]
for filename in ['root-sources.json','sources-facilities.json','colony-sources.json']:
    obj=read(filename)
    for s in obj if isinstance(obj,list) else obj['sources']:
        sources.append({
            'id':s.get('id',s.get('source_id')),
            'title':s['title'],
            'url':s.get('url',s.get('source_url')),
            'evidence_kind':s.get('evidence_kind',s.get('source_class',s.get('source_kind'))),
            'retrieved_at':s.get('retrieved_at',s.get('observed_date','2026-11-18')),
            'tool_ref':s.get('tool_ref'),
            'source_game_build':s.get('source_build',s.get('game_build')),
            'note':s.get('note',s.get('caveat_ko',s.get('evidence_note',''))),
            'raw_registry':filename,
        })
source_by_id={s['id']:s for s in sources}
if len(source_by_id)!=len(sources):raise ValueError('Duplicate source ID')
write(DATA/'sources.json',{'format_version':'1.0.0','sources':sources})

def walk(obj,path=''):
    if isinstance(obj,dict):
        if 'value' in obj and 'unit' in obj:
            yield path,obj
        else:
            for k,v in obj.items():yield from walk(v,path+'.'+k if path else k)
    elif isinstance(obj,list):
        for i,v in enumerate(obj):yield from walk(v,f'{path}[{i}]')

def canonical_status(raw,value):
    if value is None:
        return 'not_applicable' if raw in ['not_applicable','not_a_fixed_value'] else 'unresolved'
    if 'derived' in raw:return 'derived'
    if 'official' in raw:return 'official_patch'
    if 'rounded' in raw:return 'community_display_rounded'
    if 'uncertain' in raw or 'conflict' in raw:return 'community_reference_uncertain'
    if 'legacy' in raw:return 'legacy_reference'
    if raw in ['unverified','not_verified','unresolved']:return 'unresolved'
    return 'community_reference'

catalog=[];factlist=[];counts={}
for filename,prefix,domain in [('elements.json','','element'),('transport-and-world.json','','transport'),('facilities.json','building.','building'),('reactions.json','reaction.','reaction'),('colony-records.json','','colony')]:
    records=read(filename)['records'];counts[filename]=len(records)
    for r in records:
        eid=prefix+r['id'];d=r.get('domain',domain)
        catalog.append({'id':eid,'domain':d,'label':r.get('name',r.get('name_ko',r.get('name_en',r['id']))),'raw_file':filename,'raw_id':r['id']})
        for path,f in walk(r):
            path=path.removeprefix('fields.')
            src=f.get('source_ids',[])
            if not src and f.get('source_id'):src=[f['source_id']]
            raw=f.get('evidence_status','unresolved')
            unknown=[sid for sid in src if sid not in source_by_id]
            if unknown:raise ValueError(f'{eid}.{path}: unknown sources {unknown}')
            factlist.append({
                'fact_id':eid+'.'+path,'entity_id':eid,'domain':d,'field':path,'value':f['value'],
                'unit':f['unit'],'evidence_status':canonical_status(raw,f['value']),
                'raw_evidence_status':raw,'source_ids':src,'source_urls':[source_by_id[sid]['url'] for sid in src],
                'scope':f.get('scope',r.get('scope','build_unpinned')),
                'observed_at':'2026-11-18','source_game_build':None,'runtime_approved':False,
                'notes':f.get('notes',f.get('note_ko','')),'raw_file':filename,'raw_path':path,
            })
write(DATA/'reference-facts.json',{'schema_version':'1.0.0','dataset_version':'2026.11.18-r1',
    'meaning':'공개 자료 기반 재구성; 고정 빌드 실측/원본 파일 추출 아님. runtime_approved는 모두 false.',
    'entities':catalog,'facts':factlist})

# Keep the specialist flat export in sync with corrected source records as well.
with (DATA/'colony-fields.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f)
    w.writerow(['record_id','domain','field','value_json','unit','evidence_status','scope','source_ids','source_urls','notes'])
    for r in read('colony-records.json')['records']:
        for k,v in r['fields'].items():
            w.writerow([r['id'],r['domain'],k,json.dumps(v['value'],ensure_ascii=False,separators=(',',':')),
                v['unit'],v['evidence_status'],v['scope'],'|'.join(v['source_ids']),
                '|'.join(v['source_urls']),v.get('notes','')])
columns=['fact_id','entity_id','domain','field','value','unit','evidence_status','raw_evidence_status','source_ids','source_urls','scope','observed_at','source_game_build','runtime_approved','notes']
with (DATA/'reference-facts.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
    for row in factlist:
        o={k:row[k] for k in columns}
        for k in ['value','source_ids','source_urls']:
            o[k]=json.dumps(o[k],ensure_ascii=False,separators=(',',':'))
        w.writerow(o)

status=dict(collections.Counter(f['evidence_status'] for f in factlist))
coverage={'dataset_version':'2026.11.18-r1','source_entries':len(sources),
    'unique_source_urls':len({s['url'].rstrip('/') for s in sources}),'record_counts':counts,
    'entities':len(catalog),'facts':len(factlist),'null_fields':sum(f['value'] is None for f in factlist),
    'non_null_fields':sum(f['value'] is not None for f in factlist),'status_counts':status,
    'source_build_pinned_facts':0,'runtime_approved_facts':0,
    'current_web_audit_rows':220,
    'qualification':'팩 전체 구성개수이며 원작 전체에 대한 복원율은 아니다. 같은 물리량의 다른 문맥은 별도 필드다.'}
write(REPORT/'coverage.json',coverage)

lines=['# 출처 목록','', '조회일: 2026-11-18. 소스 ID의 중복 URL은 담당 영역의 기존 연결을 보존하기 위해 유지했다. 공개 DB는 비공식 자료다.','', '| ID | 제목 | 구분 | 출처 |','|---|---|---|---|']
for s in sources:lines.append(f"| {s['id']} | {s['title']} | {s['evidence_kind']} | [열기]({s['url']}) |")
(ROOT/'docs/16_Source_Register.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(coverage,ensure_ascii=False,indent=2))
