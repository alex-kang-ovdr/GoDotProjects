"""Generate current documentation and plan indexes from the v2 data."""
import csv, json
from pathlib import Path
from collections import Counter
import build_exports as exports
ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
def put(name,text):(ROOT/name).write_text(text.rstrip()+'\n',encoding='utf-8')
def short(v):
    if v is None:return '미확정'
    return json.dumps(v,ensure_ascii=False).replace('|','\\|') if not isinstance(v,str) else v.replace('|','\\|')

def main():
    data=read('data/cosmoteer_original.json');delta=read('data/revision_v2.json');v4=read('data/starforge_v4.json')
    index={r['id']:r for r in data['records']};before=delta['baseline'];now=delta['current']
    req=read('planning/implementation_backlog.json')['requirements'];cases=read('planning/acceptance_cases.json')['cases']
    rows=['# v2 복구 변경 요약','','기준일: 2026-11-18. 설치 파일 추출이 아닌 공개 문헌 복구와 기존 값의 재검토 결과다.','',
          '| 집계 | v1 | v2 | 변화 |','| --- | ---: | ---: | ---: |']
    for key,label in [('records','레코드'),('fields','전체 필드'),('known','비null 필드'),('null','미확정·상충 필드'),('sources','출처 항목'),('unique_urls','서로 다른 출처 URL')]:
        rows.append(f'| {label} | {before[key]:,} | {now[key]:,} | {now[key]-before[key]:+,} |')
    rows+=['','숫자뿐 아니라 불리언·문자열·배열도 필드 수에 포함한다. 신규 레코드 23개는 시스템 규칙이며 부품 종류가 23개 늘었다는 뜻이 아니다. 원작 부품 90개, 모드 관측 20개, 탄종 6개, 자원 22개, 생산식 13개는 유지한다. 규칙은 45개에서 68개로 늘었다.','',
           '## 실제 채택 변화','','- 기존 null 복구: 4개.','- 기존 수치 교정: 2개.','- 범위가 과도하거나 구형인 기존 값 철회: 2개.','- 기존 레코드에 새 필드 추가: 43개.','- 새 규칙 23개에 포함된 필드: 114개.','',
           '새로 식별한 미확정 필드를 포함하므로 null 수는 433→452로 늘었다. 이를 복구 실패나 0 값으로 해석하지 않는다. 미확정 면적을 숨기지 않고 기록한 결과다.','',
           '## 기존 필드의 복구·교정·철회','','| 레코드 · 필드 | 이전 | 채택 | 상태 | 근거 버전 |','| --- | --- | --- | --- | --- |']
    for c in delta['changes']:
        if c['operation']!='new_field':rows.append(f'| `{c["record_id"]}.{c["field"]}` | {short(c["before"]["value"])} | {short(c["after"]["value"])} | {c["after_status"]} | {c["after"]["version_scope"]} |')
    rows+=['','전값·단위·근거 상태·출처 ID·사유 전체는 [revision_v2.json](../data/revision_v2.json)에 있다. 핵공장 가격 25,000을 채택해도 재료표는 계속 null이다. 레일건의 지수 0.9가 확인되었다고 전체 함수를 합성하지 않는다.','',
           '## 새 규칙 레코드','','| ID | 한국어 이름 | 필드 수 |','| --- | --- | ---: |']
    for rid in delta['new_record_ids']:r=index[rid];rows.append(f'| `{rid}` | {r["name_ko"]} | {len(r["fields"])} |')
    rows+=['','## 별도 관리 자료','','- [개발 예정 관측](../data/roadmap_observations.json): Career 2.0/2.5 6건. 출시 규칙 수에 포함하지 않음.','- [v4 추출](../data/starforge_v4.json): 고정 커밋에서 선택한 29행·14종 부품. 전체 코드 데이터의 완전 추출을 뜻하지 않음.','- [경제 진단](../analysis/recipe_diagnostics.json): 원료비·단위 혼합·반올림에 대한 연구자 계산. 원작 채택 필드를 변경하지 않음.']
    put('docs/REVISION_V2.md','\n'.join(rows))
    # Current unknowns come from actual null fields; past conflicts remain separately visible.
    rows=['# 현재 미확정 필드와 역사 대조','','현재 채택값의 null 목록이다. 과거 관측·판정은 [conflicts.json](../data/conflicts.json), 새 변경 이력은 [revision_v2.json](../data/revision_v2.json)에 남긴다.','',
          '우선 확인: 원작 부품별 문·작업장·충돌 좌표, 대형 실드의 피격 전지 소모, 레일건 전체 식, 선체 열 함수, 스택 유폭 반올림, 미사일 부품/완성탄 단위, 일부 재료·가격 및 고용 함수.','',
          '| 레코드 | 필드 | 상태 | 단위 | 비고 |','| --- | --- | --- | --- | --- |']
    for u in data['unresolved']:
        r=index[u['record_id']];rows.append(f'| `{r["id"]}` | `{u["field"]}` | {u["status"]} | {r["fields"][u["field"]]["unit"]} | {"구 필드 철회·대체 규칙 참조" if u["deprecated"] else "추가 근거 필요"} |')
    put('docs/UNRESOLVED.md','\n'.join(rows))
    # Use the runtime adapter's current concept mapping, not old v3 mapping guesses.
    adapter=next(r for r in v4['rows'] if r['id']=='analysis.adapter')['fields'];mapped=[]
    for part in [r for r in v4['rows'] if r['category']=='parts']:
        key=part['id'].split('.')[-1];rid=adapter['part_references'][key];orig=index[rid]
        mapped.append({'starforge_id':key,'cosmoteer_id':rid,'prototype_cost':part['fields']['cost'],'original_value_credits':orig['fields'].get('value_credits',{}).get('value'),
                       'prototype_hp':part['fields']['hp'],'original_hp':orig['fields'].get('hp',{}).get('value'),'geometry_equivalent':False,'numeric_equivalent':False,'source_commit':v4['source_commit']})
    exports.write_csv(ROOT/'csv/starforge_v4_mapping.csv',mapped,list(mapped[0]))
    exports.dump(ROOT/'analysis/starforge_v4_adapter_mappings.json',{'value_origin':'prototype_code','source_commit':v4['source_commit'],'mappings':adapter['mappings']})
    if (ROOT/'csv/starforge_mapping.csv').exists():(ROOT/'csv/starforge_mapping.csv').rename(ROOT/'csv/starforge_v3_mapping.csv')
    rows=['# 현재 STARFORGE v4와 원작의 대응','','기준 커밋: `'+v4['source_commit']+'`. 현재 어댑터의 개념 연결을 추출했다. 수치·형상 동등성을 뜻하지 않는다. v3 연결표와 다른 무장·추진기 연결도 v4 코드를 우선한다.','',
          '| 웹 부품 | 원작 연결 | 웹 비용 | 원작 가치 | 웹 HP | 원작 HP |','| --- | --- | ---: | ---: | ---: | ---: |']
    for row in mapped:rows.append('| '+' | '.join(short(row[k]) for k in ['starforge_id','cosmoteer_id','prototype_cost','original_value_credits','prototype_hp','original_hp'])+' |')
    rows+=['','현재 발전기에서 전지 팩은 6배, 발전량은 7배, 버퍼는 12.5배라는 서로 다른 조정 계수를 사용한다. 이를 보편적인 전력 단위 변환으로 일반화하지 않는다. 정확한 필드별 매핑은 [어댑터 매핑](../analysis/starforge_v4_adapter_mappings.json)에 있다.','',
           '공간·경로·실드·열·경제의 차이는 [구현 계획](../design/08_Implementation_and_Acceptance.md)에서 우선순위와 연결한다.']
    put('docs/STARFORGE_MAPPING.md','\n'.join(rows))
    rows=['# 구현 순서와 수용 명세','','모든 항목은 **다음 구현 제안**이다. 이번 데이터 개정에서 해당 게임 기능을 구현하거나 수용 사례를 실행했다고 주장하지 않는다. 기획 ID·의존성과 테스트 명세는 JSON으로도 제공한다.','',
          '## 순서와 의존성','','```mermaid','flowchart TD','  A["데이터 승인 · 저장 경계"] --> B["공간 · 문 · 구조"]','  A --> C["재고 · 예약 원장"]','  B --> D["운용 · 운송 · 전지"]','  C --> D','  D --> E["발생기별 실드"]','  B --> F["열망 · 관통"]','  E --> G["피해 · 자원 유폭"]','  F --> G','  C --> H["생산 · 거래 · 건조"]','  D --> H','  H --> I["임무 · 명성 · 자연 완주"]','  G --> I','```','',
          'P0는 수치가 손실 없이 이동할 기반, P1은 플레이어가 공간·인력의 효과를 확인할 첫 수직 단면, P2는 열·파괴·재료 경제의 확장, P3는 지속 진행과 밸런스 검증이다. 날짜나 개발 인일은 추정하지 않았다. 각 단계가 앞 단계의 수용 조건을 통과한 뒤 진행한다.','',
          '## 요구사항','','| ID | 우선 | 내용 | 선행 | 수용 사례 |','| --- | --- | --- | --- | --- |']
    for r in req:rows.append(f'| {r["id"]} | {r["priority"]} | [{r["title"]}]({Path(r["document"]).name}) | {", ".join(r["dependencies"]) or "없음"} | {", ".join(r["acceptance_case_ids"])} |')
    rows+=['','## 수용 사례 — 실행 전 명세','','| ID | 요구사항 | 입력·조작 | 기대 결과 |','| --- | --- | --- | --- |']
    for c in cases:rows.append(f'| {c["id"]} | {c["requirement_id"]} · {c["title"]} | {short(c["setup"])} → {c["action"]} | {short(c["expected"])} |')
    rows+=['','## 단계별 종료 조건','','기반 단계는 같은 quote의 재적용·취소·저장 왕복에서 원장과 ID가 변하지 않아야 끝난다. 첫 플레이 단계는 문·통로·조작자·전지 때문에 실제 장치 가동률이 변하고 그 원인을 화면이 설명할 수 있어야 끝난다. 확장 단계는 열망 분리·탄약 유폭·거래 취소와 정상 귀환이 같은 저장 파일에서 재현되어야 끝난다. 마지막 단계는 유료 보급을 포함한 자연 전투·패배 회복 경로를 측정한 뒤 종료한다.','',
           '이미 제공된 v4 자연 완주 결과를 새 규칙 세트의 성공 결과로 대신 쓰지 않는다. 멀티플레이·다중 섹터·동적 시장·고급 함대 AI는 이 수직 단면의 종료 조건에 포함하지 않았다. 이들은 로드맵·기능 의존성·원작 자료 확보에 맞춰 후속 범위를 결정한다.','',
           '[요구사항 JSON](../planning/implementation_backlog.json) · [수용 명세 JSON](../planning/acceptance_cases.json) · [계약 예제](../fixtures/runtime_contract_example.json)']
    put('design/08_Implementation_and_Acceptance.md','\n'.join(rows))
    rows=['# 시스템별 개선 기획','','2026-11-18 개정. **원작 문헌 관측 / 현재 v4 구현 / 연구자 계산 / 다음 구현 제안**을 구분한다. 수치 변경 요약은 [복구 변경](../docs/REVISION_V2.md)을 먼저 읽는다.','',
          '| 문서 | 다루는 결정 |','| --- | --- |']
    for p in sorted((ROOT/'design').glob('[0-9][0-9]_*.md')):
        title=p.read_text().splitlines()[0].removeprefix('# ');rows.append(f'| [{p.name}]({p.name}) | {title} |')
    rows+=['','기존 시스템별 25개 MD는 [이전 역기획](../reverse_design_v1/README.md)에 보존했다. 이번 개선은 공간·물류·방어·열·경제·성장·저장 계약에 집중한다. 함대 명령·센서·초공간·도장·멀티플레이의 상세 배경은 이전 문서를 참고하되, 현행 구현 여부는 v4 추출과 새 기획을 기준으로 확인한다.','',
           '권장 읽기 순서: **00 → 01 → 02 → 03/04 → 05/06 → 07 → 08 → 10**. 정확한 원본 데이터 확보 절차는 09다.']
    put('design/README.md','\n'.join(rows))
    rows=['# Cosmoteer 데이터 복구·시스템 개선 v2','','원작 공개 문헌 재분석, 복구 테이블 개정, 현재 STARFORGE v4와의 차이 분석, 다음 구현 기획을 묶었다. **게임 실행 파일의 새 배포가 아니라 데이터·기획 개정본**이다.','',
          '## 먼저 열 파일','','- [index.html](index.html): 인터넷 없이 원작 v2·STARFORGE v4·이전 v3 데이터를 검색·비교하는 조회 화면.','- [design/README.md](design/README.md): 시스템별 개선 기획 11개 본문과 목차.','- [docs/REVISION_V2.md](docs/REVISION_V2.md): 실제로 채운 값·교정한 값·철회한 값.','- [docs/VALIDATION.md](docs/VALIDATION.md): 데이터와 전달 형식 검증 범위·결과.','',
          f'## 이번 복구 범위\n\n원작 레코드 **{now["records"]}개**, 전체 필드 **{now["fields"]:,}개**, 근거가 있는 비null 필드 **{now["known"]:,}개**, 미확정·상충 필드 **{now["null"]}개**다. v1의 196개 레코드·1,517개 비null 필드에서 시스템 규칙과 근거를 보강했다. 기존 null 4개 복구, 구형 수치 2개 교정, 과도한 값 2개 철회, 신규 필드 157개가 포함된다.','',
          '원작 설치 데이터와 exact build는 미확보다. 패치 확인은 각 패치 당시의 명시 관측이며, 위키는 조회 스냅샷이다. null을 0으로 치환하지 않는다. 원작 전체 복구율이나 바이너리 일치를 주장하지 않는다.','',
          '## 폴더 구성','','| 경로 | 내용 |','| --- | --- |','| `data/` | 원작 v2 JSON·SQLite, 출처·변경 이력, v4/v3 구현 추출, 별도 로드맵 |','| `csv/` | 필드별 무손실 `value_json`, 부품·자원·생산식·규칙 표, v4 매핑 |','| `tables/` | 시스템/종류별 조회용 Markdown 테이블 |','| `design/` | 시스템별 개선 설계, 의존 순서, 저장 전환, UX·밸런스 |','| `planning/` | 제안 요구사항 18개·수용 명세 34개·계약 스키마 |','| `analysis/` | 분야별 연구 전문, 별도 경제 파생 분석, v4 매핑 |','| `authoring/` | 변하지 않는 v1 기준 JSON과 검토된 v2 수정 입력 |','| `reference_code/v4/` | 검토 기준이 된 4개 소스 파일과 SHA-256; 완성 게임 배포물은 별도 v4 산출물 |','| `reverse_design_v1/` | 기존 시스템별 역기획 25개 MD |','| `historical_v1/` | 이전 감사·검증·설명 자료; 이번 결과와 구분 |','| `scripts/` | 재생성·검증·읽기 전용 데이터 로더 |','',
          '## 재현','','Python 3.10+와 Node.js가 필요하다. 기본 데이터 재생성에는 외부 라이브러리나 네트워크를 사용하지 않는다.','',
          '```bash','node scripts/export_starforge_v4.cjs','python3 scripts/build_revision.py','python3 scripts/build_reports_v2.py','python3 scripts/validate_v2.py','node scripts/validate_loader.mjs','node scripts/validate_viewer.cjs','```','',
          'v4 추출은 동봉된 고정 커밋 소스를 읽는다. 실제 저장소를 첫 인자로 지정하면 같은 커밋을 `git show`로 읽으며 체크아웃·게임 편집을 하지 않는다. catalogue 스키마의 추가 검사는 `jsonschema`가 설치된 환경에서 검증기에 의해 함께 실행된다.','',
          '웹 게임은 기존 v4 산출물을 사용한다. 이 패키지의 `index.html`은 게임이 아니라 데이터 조회 화면이다. 제안 v5 계약·수용 명세는 구현 완료된 게임 기능이 아니다.']
    put('README.md','\n'.join(rows))
    print(json.dumps({'reports':'generated','requirements':len(req),'acceptance_cases':len(cases),'current_mapping_parts':len(mapped)},ensure_ascii=False))

if __name__=='__main__':main()
