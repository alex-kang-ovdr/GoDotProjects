"""Rebuild JSON, CSV, Markdown, SQLite and a standalone catalogue viewer.

Inputs are the fact observations in authoring/, not downloaded game assets.
Python 3.10+, standard library only. Run from any current directory.
"""
import csv
import html
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ALIASES={
 'cost':'value_credits','cost_credits':'value_credits','credit_value':'value_credits','value':'value_credits',
 'health':'hp','hit_points':'hp','mass_tonnes':'mass_t','size_width_m':'width_m','size_height_m':'height_m',
 'crew_speed_ratio':'crew_speed_multiplier','power_generation':'power_generation_per_s',
 'power_per_second':'power_use_per_s','power_use_per_second':'power_use_per_s',
 'blueprint_cost':'blueprint_cost_credits','price_credits':'base_price_credits','base_value_credits':'base_price_credits',
 'base_price':'base_price_credits','material_cost':'construction_resources','materials':'construction_resources',
 'mass':'mass_t','range':'range_m','firing_arc':'firing_arc_deg','firing_interval':'firing_interval_s',
 'turret_speed':'turret_speed_deg_per_s','projectile_speed':'projectile_speed_m_per_s','heat_per_second':'heat_per_s',
}
STATUS={'wiki_history':'wiki_history_resolved','patch':'patch_confirmed','confirmed_patch':'patch_confirmed',
        'unresolved':'conflict','unresolved_version':'conflict','ambiguous_semantics':'conflict',
        'patch_relation_plus_wiki_snapshot':'derived','wiki_prose_confirmed':'wiki_snapshot',
        'unknown':'unverified','not_restored':'unverified','code_verified':'derived'}
UNITS={'meters':'m','seconds':'s','tonnes':'tonne','degrees':'degree','degrees/sec':'degree/s',
       'meters/sec':'m/s','shots/sec':'shots/s','power':'game_power','power/sec':'game_power/s',
       'power/shot':'game_power/shot','MJ/sec':'MJ/s','command points':'command_point','items':'item'}
RESOURCE_IDS={'diamond':'diamonds','coil':'coils','hyper_coil':'hyper_coils','hypercoil':'hyper_coils',
              'enricheduranium':'enriched_uranium','tristeel':'tri_steel','ammunition':'ammo',
              'he_missile_part':'he_missile_parts','emp_missile_part':'emp_missile_parts',
              'nuclear_missile_part':'nuclear_missile_parts','mine_part':'mine_parts',
              'thermal_canister_missile_part':'thermal_canister_missile_parts'}

def load(name): return json.loads((ROOT/'authoring'/name).read_text(encoding='utf-8'))
def dump(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')
def as_list(value):
    if value is None:return []
    return value if isinstance(value,list) else [value]
def slug(value):return re.sub('[^a-z0-9_]+','_',str(value).lower()).strip('_')
def label(value):
    if value is None:return '미확정'
    if isinstance(value,bool):return 'true' if value else 'false'
    if isinstance(value,(dict,list)):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
    return str(value)
def md(value):return label(value).replace('|','\\|').replace('\n','<br>')
def cell(value):
    if isinstance(value,(list,dict)):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
    if isinstance(value,str) and value.startswith(('=','+','-','@')): return "'"+value
    return '' if value is None else value
def write_csv(path,rows,columns):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=columns);w.writeheader()
        for r in rows:w.writerow({k:r.get(k,'') if k=='value_json' else cell(r.get(k)) for k in columns})

def normalize_record(raw,default_type,component):
    row={k:v for k,v in raw.items() if k not in {'fields','evidence','field_status','game_id'}}
    row['id']=slug(row['id']);row['name_en']=str(row.get('name_en') or row.get('name') or row['id'])
    row['name_ko']=str(row.get('name_ko') or row['name_en'])
    kind=row.get('record_type',default_type)
    if kind in {'weapon','defense','thermal','factory','housing','storage','module'}: kind='part'
    if kind in {'overclock','mode','variant'}:kind='mode_override'
    row['record_type']=kind;row['category']=row.get('category',kind)
    row['mode']=row.get('mode','normal' if kind=='part' else 'not_applicable')
    if row.get('base_part_id'):row['base_part_id']=slug(row['base_part_id'])
    row['version_scope']=row.get('version_scope','Modern / Steam; exact build not verified')
    if isinstance(row['version_scope'],dict):
        row['version_details']=row['version_scope']
        row['version_scope']=json.dumps(row['version_scope'],ensure_ascii=False,separators=(',',':'))
    row['value_origin']='public_documentation';row['authoring_component']=component
    row['game_id_reported']=raw.get('game_id')
    row['game_id_authority']='wiki_technical_id' if raw.get('game_id') else None
    row['engine_id']=None
    row['notes']=as_list(row.get('notes'));row['observations']=as_list(row.get('observations'))
    for observation in row['observations']:
        if isinstance(observation,dict) and 'field' in observation:
            observation['field']=ALIASES.get(observation['field'],observation['field'])
    row['fields']={};row['evidence']={};row['field_status']={}
    for key,obs in raw.get('fields',{}).items():
        field=ALIASES.get(key,key)
        if field in row['fields']:raise ValueError(f'alias collision {row["id"]}.{field}')
        if not isinstance(obs,dict) or 'value' not in obs:
            raise ValueError(f'field must be an observation: {row["id"]}.{field}')
        stat=dict(obs);stat['unit']=str(stat.get('unit') or 'not_specified');stat['unit']=UNITS.get(stat['unit'],stat['unit']);stat['raw_label']=str(stat.get('raw_label') or key)
        if field!=key:stat['source_field_name']=key
        if stat['unit']!=obs.get('unit'):stat['source_unit']=obs.get('unit')
        value=stat['value']
        if field=='construction_resources' and isinstance(value,dict):
            value=[dict(resource_id=k,quantity=v) for k,v in value.items()]
            stat['value']=value;stat['unit']='item[]'
        if field in {'construction_resources','inputs','outputs'} and isinstance(value,list):
            for entry in value:
                if 'resource_id' in entry:entry['resource_id']=RESOURCE_IDS.get(entry['resource_id'],entry['resource_id'])
        row['fields'][field]=stat
        row['evidence'][field]=as_list(raw.get('evidence',{}).get(key))
        status=raw.get('field_status',{}).get(key,'wiki_snapshot' if value is not None else 'unverified')
        row['field_status'][field]=STATUS.get(status,status)
        if row['field_status'][field]!=status:row['fields'][field]['source_status']=status
    if 'size' in row['fields'] and row['fields']['size']['unit']=='m':
        size=row['fields']['size']['value']
        if isinstance(size,list) and len(size)==2 and all(isinstance(x,(int,float)) for x in size):
            for field,value in zip(['width_m','height_m'],size):
                if field not in row['fields']:
                    row['fields'][field]=dict(value=value,unit='m',raw_label='Size')
                    row['evidence'][field]=row['evidence']['size'][:];row['field_status'][field]=row['field_status']['size']
    row['source_ids']=sorted({s for ids in row['evidence'].values() for s in ids})
    return row

def build():
    components={name:load(name+'.json') for name in ['support','combat','economy']}
    records=[];sources=[];conflicts=[];unresolved=[]
    for name,data in components.items():
        sources.extend(data.get('sources',[]))
        conflicts.extend(data.get('conflicts',[]));unresolved.extend(data.get('unresolved',[]))
        if name in {'support','combat'}:
            records.extend(normalize_record(r,'part',name) for r in data.get('records',[]))
            records.extend(normalize_record(r,'rule',name) for r in data.get('rules',[]))
        else:
            for key,kind in [('resources','resource'),('recipes','recipe'),('crew','rule'),('other_records','rule'),('rules','rule')]:
                records.extend(normalize_record(r,kind,name) for r in data.get(key,[]))
    source_map={}
    for s in sources:
        sid=s['id']
        if sid in source_map and source_map[sid]!=s:raise ValueError(f'duplicate source {sid}')
        s=dict(s);s.setdefault('title',sid);s.setdefault('observed_at','2026-11-17')
        source_map[sid]=s
    sources=sorted(source_map.values(),key=lambda s:s['id'])
    conflict_keys={(c.get('record_id'),ALIASES.get(c.get('field'),c.get('field'))) for c in conflicts}
    for r in records:
        observed=defaultdict(list)
        for obs in r['observations']:
            if isinstance(obs,dict) and obs.get('field') in r['fields']:observed[obs['field']].append(obs)
        for field,observations in observed.items():
            if (r['id'],field) not in conflict_keys:
                status=r['field_status'][field]
                conflicts.append(dict(id='OBS-'+r['id']+'-'+field,record_id=r['id'],field=field,
                                      observations=observations,adopted_value=r['fields'][field]['value'],
                                      resolution='unresolved' if status in {'unverified','conflict'} else 'adopted_'+status,
                                      reason='관측값과 현재 채택값의 차이를 보존. 세부 이유는 observations 및 record notes 참조.'))
    records.sort(key=lambda r:(r['record_type'],r['category'],r['id']))
    data=dict(schema_version='1.0.0',dataset_id='cosmoteer_public_reconstruction_v1',
              title='Cosmoteer 원작 공개자료 기반 게임 데이터 복구',observed_at='2026-11-17',timezone='Asia/Seoul',
              exact_game_build=None,patch_notes_baseline=['0.30.5','0.30.5a'],
              recovery_method='public_documentation_transcription_with_field_provenance',
              scope='Cosmoteer Modern / Steam. Classic 수치는 채택하지 않음.',
              caveats=['설치된 원작 Data/*.rules 또는 실행 파일에서 추출한 데이터가 아니다.',
                       'wiki_snapshot은 문헌 값이다. 정확한 현재 빌드에서 실측했다는 뜻이 아니다.',
                       'mode_override는 확인된 차이만 포함한다. 일반 모드와의 완전한 병합을 보장하지 않는다.',
                       'game_id_reported는 위키 Technical ID 표기다. 전체 엔진 ID/네임스페이스는 미확정이다.',
                       'null은 0이 아니다. 상충하는 관측값은 conflict/observations에 남긴다.',
                       'STARFORGE v3 데이터는 별도 파일에 있고 원작 단위와 자동 호환되지 않는다.'],
              records=records,sources=sources,conflicts=conflicts,unresolved=unresolved)
    dump(ROOT/'data/cosmoteer_original.json',data)
    dump(ROOT/'data/sources.json',sources)
    dump(ROOT/'data/conflicts.json',conflicts)
    prototype=load('starforge.json');dump(ROOT/'data/starforge_v3.json',prototype)
    export_csv(data,prototype)
    export_markdown(data,prototype)
    export_sqlite(data)
    export_viewer(data,prototype)
    counts=Counter(r['record_type'] for r in records)
    print(json.dumps(dict(records=len(records),types=dict(counts),sources=len(sources),conflicts=len(conflicts)),ensure_ascii=False))

def export_csv(data,prototype):
    facts=[];materials=[];recipe_edges=[]
    bytype=defaultdict(list)
    for r in data['records']:
        bytype[r['record_type']].append(r)
        for field,s in r['fields'].items():
            ids=r['evidence'][field]
            urls=[src['url'] for src in data['sources'] if src['id'] in ids]
            facts.append(dict(record_id=r['id'],record_type=r['record_type'],category=r['category'],name_en=r['name_en'],name_ko=r['name_ko'],mode=r['mode'],field=field,value=s['value'],value_json=json.dumps(s['value'],ensure_ascii=False),unit=s['unit'],status=r['field_status'][field],source_ids=';'.join(ids),source_urls=';'.join(urls),raw_label=s['raw_label'],version_scope=s.get('version_scope',r['version_scope'])))
            if field=='construction_resources' and s['value']:
                for item in s['value']:materials.append(dict(part_id=r['id'],**item,status=r['field_status'][field],source_ids=';'.join(ids)))
            if field in {'inputs','outputs'} and isinstance(s['value'],list):
                for item in s['value']:recipe_edges.append(dict(recipe_id=r['id'],direction=field,**item,unit=s['unit'],status=r['field_status'][field],source_ids=';'.join(ids)))
    write_csv(ROOT/'csv/observations.csv',facts,['record_id','record_type','category','name_en','name_ko','mode','field','value','value_json','unit','status','source_ids','source_urls','raw_label','version_scope'])
    for typ,rows in bytype.items():
        fields=sorted({f for r in rows for f in r['fields']})
        out=[]
        for r in rows:
            flat={k:r.get(k) for k in ['id','name_ko','name_en','category','mode','game_id_reported','version_scope']}
            flat.update({f:r['fields'].get(f,{}).get('value') for f in fields})
            flat.update(field_status=r['field_status'],evidence=r['evidence'],notes=r['notes'])
            out.append(flat)
        write_csv(ROOT/f'csv/{typ}s.csv',out,['id','name_ko','name_en','category','mode','game_id_reported','version_scope']+fields+['field_status','evidence','notes'])
    write_csv(ROOT/'csv/construction_resources.csv',materials,['part_id','resource_id','quantity','status','source_ids'])
    recipe_keys=sorted({k for r in recipe_edges for k in r}-{'recipe_id','direction','resource_id','quantity','unit','status','source_ids'})
    write_csv(ROOT/'csv/recipe_resources.csv',recipe_edges,['recipe_id','direction','resource_id','quantity','unit','status','source_ids']+recipe_keys)
    write_csv(ROOT/'csv/sources.csv',data['sources'],['id','title','url','observed_at','access_method','version','notes'])
    proto=[]
    for r in prototype['rows']:
        for k,v in r['fields'].items():
            proto.append(dict(record_id=r['id'],category=r['category'],field=k,value=v,value_json=json.dumps(v,ensure_ascii=False),source_file=r['source_file'],source_lines=r['source_lines'],value_origin=r['value_origin']))
    write_csv(ROOT/f'csv/{prototype["dataset_id"]}_observations.csv',proto,['record_id','category','field','value','value_json','source_file','source_lines','value_origin'])

def export_markdown(data,prototype):
    groups=defaultdict(list)
    for r in data['records']:groups[(r['record_type'],r['category'])].append(r)
    contents=['# 시스템별 복구 테이블','', '확인일: 2026-11-18. 값은 원작 설치 파일이 아닌 공개 문헌에서 복구했다. `미확정`을 0으로 사용하지 않는다.','', '| 파일 | 구분 | 레코드 수 |','| --- | --- | ---: |']
    for i,((kind,cat),rows) in enumerate(sorted(groups.items()),1):
        fname=f'{i:02d}_{slug(kind)}_{slug(cat)}.md'
        contents.append(f'| [{fname}]({fname}) | {kind} / {cat} | {len(rows)} |')
        lines=[f'# {cat} · {kind}','', '[전체 목차](README.md)','', '각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.','']
        for r in rows:
            lines.extend([f'## {r["name_ko"]} ({r["name_en"]})','',f'- ID: `{r["id"]}`',f'- 모드: `{r["mode"]}`',f'- 버전 범위: {r["version_scope"]}','', '| 필드 | 값 | 단위 | 상태 | 출처 |','| --- | --- | --- | --- | --- |'])
            for f,s in r['fields'].items():
                refs=', '.join(f'[{sid}]({next(x["url"] for x in data["sources"] if x["id"]==sid)})' for sid in r['evidence'][f]) or '미확보'
                lines.append(f'| `{f}` | {md(s["value"])} | {md(s["unit"])} | {r["field_status"][f]} | {refs} |')
            if r['notes']:lines.extend(['','### 적용 메모','']+['- '+md(n) for n in r['notes']])
            if r.get('observations'):lines.extend(['','### 대조 관측값','', '```json',json.dumps(r['observations'],ensure_ascii=False,indent=2),'```'])
            lines.append('')
        (ROOT/'tables').mkdir(exist_ok=True)
        (ROOT/'tables'/fname).write_text('\n'.join(lines)+'\n',encoding='utf-8')
    (ROOT/'tables/README.md').write_text('\n'.join(contents)+'\n',encoding='utf-8')
    lines=['# 출처 목록','', '위키는 검색 색인에서 읽은 범위만 사용했다. 직접 열기 403을 본문 열람 성공으로 표시하지 않았다. 정식 개발자 공지가 명시하는 변경은 RC와 위키의 구형 수치보다 우선한다.','', '| ID | 자료 | URL | 확인일 | 접근 |','| --- | --- | --- | --- | --- |']
    for s in data['sources']:lines.append(f'| {s["id"]} | {md(s["title"])} | [{s["title"]}]({s["url"]}) | {s.get("observed_at","")} | {s.get("access_method",s.get("source_kind",""))} |')
    (ROOT/'docs').mkdir(exist_ok=True)
    (ROOT/'docs/SOURCES.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    fields=defaultdict(lambda:dict(units=set(),labels=set(),count=0))
    for r in data['records']:
        for f,s in r['fields'].items():fields[f]['units'].add(s['unit']);fields[f]['labels'].add(s['raw_label']);fields[f]['count']+=1
    lines=['# 필드 사전','', '단위는 원문의 게임 단위를 보존한다. `game_power`는 W가 아니며, 질량 tonne·거리 m를 STARFORGE의 임의 단위로 자동 치환하지 않는다.','', '| 키 | 단위 | 원문 표제 | 사용 수 |','| --- | --- | --- | ---: |']
    for k,v in sorted(fields.items()):lines.append(f'| `{k}` | {md(sorted(v["units"]))} | {md(sorted(v["labels"]))} | {v["count"]} |')
    (ROOT/'docs/FIELD_DICTIONARY.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')

def export_sqlite(data):
    path=ROOT/'data/cosmoteer_tables.sqlite'
    if path.exists():path.unlink()
    con=sqlite3.connect(path);con.execute('PRAGMA foreign_keys=ON')
    con.executescript('''
      CREATE TABLE metadata(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
      CREATE TABLE records(id TEXT PRIMARY KEY,name_en TEXT NOT NULL,name_ko TEXT NOT NULL,record_type TEXT NOT NULL,category TEXT NOT NULL,mode TEXT NOT NULL,version_scope TEXT NOT NULL,record_json TEXT NOT NULL);
      CREATE TABLE sources(id TEXT PRIMARY KEY,title TEXT NOT NULL,url TEXT NOT NULL,source_json TEXT NOT NULL);
      CREATE TABLE observations(record_id TEXT NOT NULL REFERENCES records(id),field TEXT NOT NULL,value_json TEXT NOT NULL,unit TEXT NOT NULL,status TEXT NOT NULL,raw_label TEXT NOT NULL,PRIMARY KEY(record_id,field));
      CREATE TABLE evidence(record_id TEXT NOT NULL,field TEXT NOT NULL,source_id TEXT NOT NULL REFERENCES sources(id),PRIMARY KEY(record_id,field,source_id),FOREIGN KEY(record_id,field) REFERENCES observations(record_id,field));
      CREATE TABLE conflicts(id INTEGER PRIMARY KEY,conflict_json TEXT NOT NULL);
      CREATE INDEX record_category ON records(category,record_type);
      CREATE INDEX observation_field ON observations(field,status);
      CREATE VIEW numeric_stats AS SELECT record_id,field,json_extract(value_json,'$') AS value,unit,status FROM observations WHERE json_type(value_json) IN ('integer','real');
    ''')
    con.executemany('INSERT INTO metadata VALUES (?,?)',[(k,json.dumps(v,ensure_ascii=False)) for k,v in data.items() if k not in {'records','sources','conflicts'}])
    con.executemany('INSERT INTO sources VALUES (?,?,?,?)',[(s['id'],s['title'],s['url'],json.dumps(s,ensure_ascii=False)) for s in data['sources']])
    for r in data['records']:
        con.execute('INSERT INTO records VALUES (?,?,?,?,?,?,?,?)',tuple(r[k] for k in ['id','name_en','name_ko','record_type','category','mode','version_scope'])+(json.dumps(r,ensure_ascii=False),))
        for f,s in r['fields'].items():
            con.execute('INSERT INTO observations VALUES (?,?,?,?,?,?)',(r['id'],f,json.dumps(s['value'],ensure_ascii=False),s['unit'],r['field_status'][f],s['raw_label']))
            con.executemany('INSERT INTO evidence VALUES (?,?,?)',[(r['id'],f,sid) for sid in r['evidence'][f]])
    con.executemany('INSERT INTO conflicts(conflict_json) VALUES (?)',[(json.dumps(c,ensure_ascii=False),) for c in data['conflicts']])
    con.commit()
    assert con.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
    assert not con.execute('PRAGMA foreign_key_check').fetchall()
    con.close()

def export_viewer(data,prototype):
    template=(ROOT/'scripts/viewer_template.html').read_text(encoding='utf-8')
    historical=json.loads((ROOT/'data/starforge_v3.json').read_text(encoding='utf-8'))
    payload=json.dumps(dict(original=data,prototype=prototype,historical=historical),ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    (ROOT/'index.html').write_text(template.replace('/*__DATA__*/',payload),encoding='utf-8')

if __name__=='__main__':
    from build_revision import build as rebuild_v2
    rebuild_v2()
