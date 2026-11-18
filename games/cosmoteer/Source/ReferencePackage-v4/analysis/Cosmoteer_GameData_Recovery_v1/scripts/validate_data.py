"""Validate recovered observations, units, provenance and cross-table references.
Python 3.10+; no third-party package is required.
"""
import csv
import json
import math
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'wiki_snapshot','wiki_history_resolved','patch_confirmed','derived','conflict','unverified','not_applicable'}

def validate(root=ROOT):
    data = json.loads((root/'data/cosmoteer_original.json').read_text(encoding='utf-8'))
    prototype = json.loads((root/'data/starforge_v3.json').read_text(encoding='utf-8'))
    errors, warnings = [], []
    def check(condition, message):
        if not condition: errors.append(message)
    check(data.get('dataset_id')=='cosmoteer_public_reconstruction_v1', 'wrong original dataset id')
    check(prototype.get('dataset_id',prototype.get('dataset'))=='starforge_v3', 'wrong prototype dataset id')
    check(prototype.get('source_commit')=='f90387acd3f7ca25a8285423f235352dd47d07e4', 'wrong prototype commit')
    records=data['records']; ids=[r['id'] for r in records]; idset=set(ids)
    check(len(ids)==len(idset),'duplicate record ids')
    source_ids=[s['id'] for s in data['sources']]; source_set=set(source_ids)
    check(len(source_ids)==len(source_set),'duplicate source ids')
    types=Counter(); statuses=Counter(); known=unknown=0
    resource_ids={r['id'] for r in records if r['record_type']=='resource'}
    construction_rows=0
    for r in records:
        rid=r['id']; types[r['record_type']]+=1
        check(bool(re.fullmatch('[a-z0-9][a-z0-9_]*',rid)),f'invalid id {rid}')
        check(r.get('value_origin')=='public_documentation',f'wrong value origin {rid}')
        check(r.get('engine_id') is None,f'unverified engine id was asserted {rid}')
        check(r.get('record_type') in {'part','mode_override','resource','recipe','munition','rule'},f'bad type {rid}')
        if r.get('base_part_id'):
            check(r['base_part_id'] in idset,f'missing base part {rid}: {r["base_part_id"]}')
        for f,s in r['fields'].items():
            prefix=f'{rid}.{f}'
            check(isinstance(s,dict) and 'value' in s and isinstance(s.get('unit'),str),f'bad stat {prefix}')
            v=s.get('value'); status=r['field_status'].get(f); statuses[status]+=1
            check(status in ALLOWED,f'bad status {prefix}: {status}')
            check(f in r['evidence'],f'no evidence key {prefix}')
            evidence=r['evidence'].get(f,[])
            check(isinstance(evidence,list),f'evidence must be array {prefix}')
            for sid in evidence: check(sid in source_set,f'unknown source {prefix}: {sid}')
            if v is None:
                unknown+=1
                check(status in {'conflict','unverified','not_applicable'},f'null marked confirmed {prefix}')
            else:
                known+=1
                check(bool(evidence),f'value has no source {prefix}')
                check(status not in {'conflict','unverified'},f'unresolved value was adopted {prefix}')
            if isinstance(v,(int,float)) and not isinstance(v,bool):
                check(math.isfinite(v),f'non-finite {prefix}')
                if s['unit'] in {'credits','HP','m','tonne','s','count','crew','item','game_power','kN','HP/s'} and 'resist' not in f:
                    check(v>=0,f'negative {prefix}')
            if f=='construction_resources' and v is not None:
                check(isinstance(v,list),f'resources not list {prefix}')
                for item in v:
                    construction_rows+=1
                    check(item.get('resource_id') in resource_ids,f'missing material {prefix}: {item.get("resource_id")}')
                    check(isinstance(item.get('quantity'),(int,float)) and item['quantity']>0,f'invalid amount {prefix}')
            if f in {'inputs','outputs','input_rates_per_s','resource_capacity'} and isinstance(v,list):
                for item in v:
                    check(item.get('resource_id') in resource_ids,f'missing recipe resource {prefix}: {item.get("resource_id")}')
                    check(item.get('quantity') is None or isinstance(item.get('quantity'),(int,float)) and item['quantity']>0,f'invalid recipe quantity {prefix}')
            if f=='factory_id' and v is not None:check(v in idset,f'missing factory {prefix}: {v}')
        check(set(r['fields'])==set(r['evidence'])==set(r['field_status']),f'stat/provenance keys differ {rid}')
    # Reconcile exported facts with the canonical JSON, including real zero vs null.
    csv_path=root/'csv/observations.csv'
    if csv_path.exists():
        with csv_path.open(encoding='utf-8-sig',newline='') as f: rows=list(csv.DictReader(f))
        expected={(r['id'],k):v for r in records for k,v in r['fields'].items()}
        check(len(rows)==len(expected),'observations CSV count mismatch')
        seen=set()
        for row in rows:
            key=(row['record_id'],row['field']); seen.add(key)
            check(key in expected,f'unknown CSV observation {key}')
            if key in expected:
                check(json.loads(row['value_json'])==expected[key]['value'],f'CSV roundtrip mismatch {key}')
                check(row['unit']==expected[key]['unit'],f'CSV unit mismatch {key}')
        check(set(expected)==seen,'observations CSV missing/duplicated keys')
    # Check prices as diagnostics, not as an excuse to replace conflicting source values.
    price={r['id']: r['fields'].get('base_price_credits',{}).get('value') for r in records if r['record_type']=='resource'}
    cost_checks=[]
    for r in records:
        fields=r['fields']; materials=fields.get('construction_resources',{}).get('value'); value=fields.get('value_credits',{}).get('value')
        if materials and isinstance(value,(int,float)) and all(isinstance(price.get(m['resource_id']),(int,float)) for m in materials):
            total=sum(price[m['resource_id']]*m['quantity'] for m in materials)
            status='match' if abs(total-value)<1e-9 else 'source_disagreement'
            cost_checks.append(dict(record_id=r['id'],listed_value=value,resource_sum=total,status=status))
            if status!='match': warnings.append(f'{r["id"]}: listed={value}, material sum={total}; source observations preserved')
    return dict(status='passed' if not errors else 'failed', errors=errors,warnings=warnings,
                counts=dict(records=len(records),record_types=dict(sorted(types.items())),known_fields=known,null_fields=unknown,
                            field_statuses=dict(sorted(statuses.items())),sources=len(source_ids),construction_material_rows=construction_rows,
                            conflict_cases=len(data['conflicts']),unique_source_urls=len({s['url'] for s in data['sources']})), cost_reconciliation=cost_checks,
                limitations=['문헌 관측값의 구조·출처·참조 관계를 검증한 결과이다. 원작 바이너리와의 일치 검증은 아니다.',
                             '공개 데이터셋과 STARFORGE 코드는 독립된 단위/밸런스를 가진다. 자동 변환하지 않는다.'])

if __name__=='__main__':
    report=validate()
    (ROOT/'docs/validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    raise SystemExit(0 if report['status']=='passed' else 1)
