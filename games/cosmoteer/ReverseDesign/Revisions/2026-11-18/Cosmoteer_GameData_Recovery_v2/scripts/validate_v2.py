"""Validate the delivered v2 reconstruction and proposed design contracts.

This checks data integrity and specification consistency, not future gameplay.
"""
import csv, hashlib, json, math, re, sqlite3, subprocess
from pathlib import Path
from collections import Counter
from validate_data import validate
ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))

def main():
    report=validate();errors=report['errors'];checks=[]
    def check(test,name):
        checks.append(name)
        if not test:errors.append(name)
    data=read('data/cosmoteer_original.json');base=read('authoring/original_v1.json');delta=read('data/revision_v2.json')
    idx={r['id']:r for r in data['records']};bidx={r['id']:r for r in base['records']}
    check(data['schema_version']=='1.1.0','v2 schema version')
    check(data['exact_game_build'] is None,'exact installed build remains unknown')
    check(hashlib.sha256((ROOT/'authoring/original_v1.json').read_bytes()).hexdigest()==data['baseline_sha256'],'immutable baseline hash')
    changed={(c['record_id'],c['field']):c for c in delta['changes']}
    for rid,r in bidx.items():
        check(rid in idx,'baseline record retained '+rid)
        for f,s in r['fields'].items():
            if (rid,f) not in changed:
                check(idx[rid]['fields'][f]==s and idx[rid]['field_status'][f]==r['field_status'][f] and idx[rid]['evidence'][f]==r['evidence'][f],'unchanged baseline field '+rid+'.'+f)
    for key,c in changed.items():
        rid,f=key;r=idx[rid];old=bidx[rid]['fields'].get(f)
        check(c['before']==old and c['before_status']==bidx[rid]['field_status'].get(f),'change old state '+str(key))
        check(c['before_source_ids']==bidx[rid]['evidence'].get(f,[]),'change old evidence '+str(key))
        check(c['after']==r['fields'][f] and c['after_status']==r['field_status'][f] and c['after_source_ids']==r['evidence'][f],'change new state '+str(key))
        check(bool(c['after'].get('version_scope')) and bool(c.get('rationale')),'change version and rationale '+str(key))
    check(set(idx)-set(bidx)==set(delta['new_record_ids']),'new record ID delta')
    check(dict(Counter(c['operation'] for c in delta['changes']))==delta['operations'],'operation counts')
    check(idx['nuclear_missile_factory']['fields']['value_credits']['value']==25000,'nuclear factory price restored')
    check(idx['nuclear_missile_factory']['fields']['construction_resources']['value'] is None,'nuclear material conflict preserved')
    check(any('25,000' in n for n in idx['nuclear_missile_factory']['notes']),'current price note updated')
    check(len(idx['nuclear_missile_factory'].get('note_history',[]))==1,'prior nuclear note retained')
    check(idx['railgun_accelerator_overclock']['fields']['buff_formula']['value'] is None,'unknown complete railgun formula remains null')
    check(idx['recipe_emp_missile_parts']['fields']['inputs']['value'] is None,'EMP input conflict preserved')
    check(idx['recipe_mine_parts']['fields']['inputs']['value'] is None,'mine input conflict preserved')
    check(idx['recipe_he_missile_parts']['fields']['input_rates_per_s']['value'] is None,'incomplete HE rate is not promoted')
    # EAV exports preserve JSON types, negative values, actual zero, and null.
    con=sqlite3.connect(ROOT/'data/cosmoteer_tables.sqlite')
    check(con.execute('PRAGMA integrity_check').fetchone()[0]=='ok','SQLite integrity')
    check(not con.execute('PRAGMA foreign_key_check').fetchall(),'SQLite foreign keys')
    sqlrows={(rid,f):(json.loads(v),unit,status) for rid,f,v,unit,status in con.execute('SELECT record_id,field,value_json,unit,status FROM observations')}
    expected={(r['id'],f):(s['value'],s['unit'],r['field_status'][f]) for r in data['records'] for f,s in r['fields'].items()}
    check(sqlrows==expected,'SQLite observations equal all canonical fields')
    check({rid:json.loads(raw) for rid,raw in con.execute('SELECT id,record_json FROM records')}==idx,'SQLite full record JSON equality')
    actual_ev=set(con.execute('SELECT record_id,field,source_id FROM evidence'))
    expect_ev={(r['id'],f,sid) for r in data['records'] for f,ss in r['evidence'].items() for sid in ss}
    check(actual_ev==expect_ev,'SQLite all field evidence equality');con.close()
    # Offline viewer contains the exact current and historical datasets.
    html=(ROOT/'index.html').read_text();payload=re.search(r'const DATA=(.*?);\nconst \$',html,re.S)
    check(payload is not None,'viewer embedded payload exists')
    if payload:
        packed=json.loads(payload.group(1));check(packed['original']==data,'viewer canonical equality')
        check(packed['prototype']==read('data/starforge_v4.json'),'viewer current v4 equality')
        check(packed['historical']==read('data/starforge_v3.json'),'viewer historical v3 equality')
    check(not re.search(r'<script[^>]+src=|<link[^>]+href=["\']https?://',html),'viewer no external scripts or styles')
    # Read-only v4 extraction evidence.
    v4=read('data/starforge_v4.json');check(v4['source_commit']=='6ca48f00f86857f821422619827b617f0de549a3','v4 pinned commit')
    range_count=0
    for file,meta in v4['source_files'].items():
        raw=(ROOT/'reference_code/v4'/file).read_bytes()
        check(hashlib.sha256(raw).hexdigest()==meta['sha256'],'v4 source hash '+file)
        check(len(raw.decode().split('\n'))==meta['line_count'],'v4 source line count '+file)
    for row in v4['rows']:
        for span in row['source_ranges']:
            range_count+=1;lines=span['source_lines'];check(1<=lines['start']<=lines['end']<=v4['source_files'][span['source_file']]['line_count'],'v4 evidence range '+row['id'])
    snapshot_before=(ROOT/'data/starforge_v4.json').read_bytes()
    proc=subprocess.run(['node',str(ROOT/'scripts/export_starforge_v4.cjs')],capture_output=True,text=True)
    check(proc.returncode==0,'v4 extractor runs from bundled source')
    check((ROOT/'data/starforge_v4.json').read_bytes()==snapshot_before,'v4 deterministic re-extraction')
    # Plans are proposals with sound references, not executed gameplay tests.
    plan=read('planning/implementation_backlog.json');reqs={r['id']:r for r in plan['requirements']}
    cases=read('planning/acceptance_cases.json');cidx={c['id']:c for c in cases['cases']}
    check(len(reqs)==len(plan['requirements']) and len(cidx)==len(cases['cases']),'unique planning IDs')
    check(cases['execution_status']=='not_executed','planned tests not represented as gameplay results')
    def visit(rid,stack):
        check(rid not in stack,'acyclic requirement '+rid)
        if rid in stack:return
        for dep in reqs[rid]['dependencies']:
            check(dep in reqs,'requirement dependency '+dep)
            if dep in reqs:visit(dep,stack|{rid})
    for rid,r in reqs.items():
        visit(rid,set());check((ROOT/r['document']).exists(),'requirement document '+rid)
        check(all(x in idx for x in r['original_record_ids']),'requirement original record FK '+rid)
        check(all(cid in cidx and cidx[cid]['requirement_id']==rid for cid in r['acceptance_case_ids']),'requirement acceptance FK '+rid)
    for c in cidx.values():check(c['requirement_id'] in reqs and c['status']=='planned_not_executed','planned case scope '+c['id'])
    roadmap=read('data/roadmap_observations.json')
    check(roadmap['included_in_released_catalogue'] is False,'roadmap excluded from released data')
    check(not(set(r['id'] for r in roadmap['records'])&set(idx)),'roadmap ID separation')
    # Contract fixture invariants (not a gameplay implementation).
    fx=read('fixtures/runtime_contract_example.json')
    for d in fx['definitions']:
        occ={tuple(c) for c in d['occupied_cells']};walk={tuple(c) for c in d['walk_cells']}
        check(len(occ)==len(d['occupied_cells']) and walk<=occ,'fixture occupied and walk cells')
        check(all(0<=x<d['width'] and 0<=y<d['height'] for x,y in occ),'fixture cell bounds')
        for p in d['ports']:check(tuple(p['cell']) in walk and tuple(p['normal']) in {(1,0),(-1,0),(0,1),(0,-1)},'fixture door port')
    containers={x['id']:x for x in fx['containers']}
    for rid,c in containers.items():
        check(0<=c['reserved_out']<=c['actual']<=c['capacity'] and c['actual']+c['reserved_in']<=c['capacity'],'fixture inventory invariants '+rid)
        out=sum(r['amount'] for r in fx['reservations'] if r['source']==rid and r['state']=='reserved')
        incoming=sum(r['amount'] for r in fx['reservations'] if r['destination']==rid and r['state']=='reserved')
        check(out==c['reserved_out'] and incoming==c['reserved_in'],'fixture reservation ownership '+rid)
    schema_check='not_run_optional_dependency_missing'
    try:
        import jsonschema
        for schema_path,obj,label in [('schemas/catalogue.schema.json',data,'catalogue'),('planning/runtime_contract.schema.json',fx,'proposed contract')]:
            validator=jsonschema.Draft202012Validator(read(schema_path));schema_errors=list(validator.iter_errors(obj))
            check(not schema_errors,'JSON schema '+label)
            for e in schema_errors[:5]:errors.append(label+': '+e.message)
        schema_check='passed' if not errors else 'completed_with_errors'
    except ImportError:pass
    # All six displayed economy margins are derived again from canonical inputs.
    diags=read('analysis/recipe_diagnostics.json');margin=next(f for f in diags['cases'] if f['id']=='V2-ECO-F10')
    for row in margin['rows']:
        r=idx[row['recipe_id']];inputs=r['fields']['inputs']['value'];outputs=r['fields']['outputs']['value']
        cost=sum(x['quantity']*idx[x['resource_id']]['fields']['base_price_credits']['value'] for x in inputs)
        value=sum(x['quantity']*idx[x['resource_id']]['fields']['base_price_credits']['value'] for x in outputs)
        check(math.isclose(cost,row['input_cost_credits_per_output_ratio']) and math.isclose(value,row['output_base_value_credits']),'derived recipe base cost '+r['id'])
        for eid,result in row['margins_by_economy'].items():
            rate=idx[eid]['fields']['resource_sell_buy_ratio']['value'];computed=value*rate-cost
            check(math.isclose(computed,result['margin_credits_per_output_ratio']),'derived margin '+r['id']+'/'+eid)
    # Current docs links must resolve. Historical packages intentionally retain their old wording.
    for folder in ['design','docs','analysis']:
        for p in (ROOT/folder).glob('*.md'):
            for link in re.findall(r'\[[^\]\n]+\]\(([^)\n]+)\)',p.read_text()):
                if re.match(r'(https?://|#|mailto:|sandbox:)',link):continue
                target=link.split('#',1)[0]
                if target:check((p.parent/target).exists(),'local link '+str(p.relative_to(ROOT))+' -> '+link)
    report.update(status='passed' if not errors else 'failed',errors=errors,integrity_checks=len(checks),
                  revision_operations=delta['operations'],prototype_v4={'rows':v4['row_count'],'parts':sum(r['category']=='parts' for r in v4['rows']),'source_files':len(v4['source_files']),'evidence_ranges':range_count,'deterministic_reextract':proc.returncode==0},
                  planning={'requirements':len(reqs),'acceptance_specifications':len(cidx),'execution_status':'not_executed'},
                  schema_validation=schema_check,roadmap_observations=len(roadmap['records']))
    (ROOT/'docs/validation_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    lines=['# v2 검증 결과','','검증 범위: 공개 문헌 복구 데이터·표현 형식·출처 연결·기획 명세의 일관성. 원작 실행 검증이나 제안 v5 게임 플레이 검증은 아니다.','',
           f'- 데이터 검사: **{report["status"]}**, 오류 {len(errors)}건.',f'- 원작 필드: {len(expected):,}개에 대해 JSON↔CSV↔SQLite↔조회 HTML을 대조.',
           f'- v1에 있던 필드의 무승인 변경을 검사하고 모든 교정의 이전 값·근거·상태를 확인.',
           f'- v4: {v4["row_count"]}개 선택 추출 행, 14종 부품, 4개 소스 파일 해시, {range_count}개 근거 범위. 동봉 코드 재추출 바이트 일치 확인.',
           '- 스키마: '+schema_check+'.',
           f'- 기획: 요구사항 {len(reqs)}개·수용 명세 {len(cidx)}개의 ID·의존성·문서 참조 검사. 이 수용 명세는 **실행 전**이다.',
           '- 경제 공헌이익 6개 생산물의 입력 단가·난이도 판매 비율을 별도로 재계산.',
           '- 독립 검토의 핵공장 과거 메모·생산 예약 용어·v4 상수 출처 범위 지적을 반영.',
           '', '## 조회 화면 검증', '', '조회 화면 JavaScript와 실제 브라우저 점검 여부는 [viewer_validation.json](viewer_validation.json)에 기록한다. 구조 검증을 화면 렌더링 성공으로 표현하지 않는다.',
           '', '## 재현', '', '```bash','python3 scripts/validate_v2.py','node scripts/validate_loader.mjs','node scripts/validate_viewer.cjs','```','',
           '상세 결과는 [validation_report.json](validation_report.json), 연구 검토는 [independent_v2_audit.md](independent_v2_audit.md) 참조.']
    (ROOT/'docs/VALIDATION.md').write_text('\n'.join(lines)+'\n')
    print(json.dumps({'status':report['status'],'errors':errors,'checks':len(checks),'counts':report['counts'],'prototype_v4':report['prototype_v4'],'planning':report['planning']},ensure_ascii=False))
    raise SystemExit(0 if not errors else 1)

if __name__=='__main__':main()
