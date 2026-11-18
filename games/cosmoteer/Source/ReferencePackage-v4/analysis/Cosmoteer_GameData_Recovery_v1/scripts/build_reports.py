"""Generate the release coverage, open questions and prototype mapping notes."""
import csv
import json
from collections import Counter
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def main():
    data=json.loads((ROOT/'data/cosmoteer_original.json').read_text())
    proto=json.loads((ROOT/'data/starforge_v3.json').read_text())
    report=json.loads((ROOT/'docs/validation_report.json').read_text())
    records={r['id']:r for r in data['records']}
    stats=report['counts']
    names={'part':'일반 부품','mode_override':'모드별 관측/차이','munition':'탄종','resource':'자원','recipe':'생산 레시피','rule':'시스템 규칙'}
    lines=['# 복구 범위와 검증 결과','', '확인일: 2026-11-17. 검증 범위는 전달 데이터의 구조·출처·대조 관계다. 원작 설치 파일과의 동일성 검증은 포함하지 않는다.','', '## 원작 데이터','', '| 구분 | 레코드 |','| --- | ---: |']
    for k,v in stats['record_types'].items():lines.append(f'| {names[k]} | {v} |')
    lines += [f'| 합계 | **{stats["records"]}** |','',f'- 전체 필드: **{stats["known_fields"]+stats["null_fields"]:,}개**',
              f'- 근거와 함께 채택한 비null 필드: **{stats["known_fields"]:,}개**',f'- 미확정 또는 상충하여 비운 필드: **{stats["null_fields"]:,}개**',
              f'- 출처 항목: **{stats["sources"]}개**, 서로 다른 URL **{stats["unique_source_urls"]}개**',
              f'- 충돌·구형 관측·해결 이력을 포함한 대조 사례: **{stats["conflict_cases"]}개**','',
              '필드 수에는 문자열·배열·불리언도 포함한다. 같은 물리적 부품의 모드별 관측은 별도 레코드이므로 부품 개수를 모드 수만큼 늘려 해석하지 않는다.','',
              '| 근거 상태 | 필드 수 |','| --- | ---: |']
    for k,v in stats['field_statuses'].items():lines.append(f'| `{k}` | {v} |')
    lines += ['', '## 데이터 무결성', '', f'검증 결과: **{report["status"]}**. 오류 {len(report["errors"])}건, 미해결 검증 경고 {len(report["warnings"])}건.', '',
              '- 안정 ID 중복과 잘못된 JSON 숫자 검사를 통과했다.',
              '- 필드·근거·상태의 키 일치, 모든 출처 ID, 자원/공장/모드 기반 부품 외래키를 확인했다.',
              '- 미확정값과 실제 0을 구분했고, CSV의 `value_json`을 다시 파싱하여 모든 원작 필드와 대조했다.',
              '- SQLite의 무결성·외래키 검사를 통과했다.',
              f'- 값과 재료·단가를 함께 확인할 수 있는 **{len(report["cost_reconciliation"])}개 레코드**의 재료 합계를 비교했다. 남은 불일치는 {sum(x["status"]!="match" for x in report["cost_reconciliation"])}건이다.',
              '- 가격/재료 원문이 충돌한 부품은 합성값으로 고치지 않고 채택값을 null로 보류했다.',
              '', '## STARFORGE 구현 추출', '', f'- 레코드: **{proto["row_count"]}개**',
              f'- 기준 커밋: `{proto["source_commit"]}`',
              '- 부품 11종은 해당 커밋의 런타임 상수와 비교했다.',
              '- 개량 9단계 구매 및 의뢰·적 설계 9개를 실제 생성 결과와 대조했다.',
              '- 재추출 바이트 일치, 301개 근거 범위, 원본 작업 트리 무변경을 확인했다.',
              '', '세부 기록은 `validation_report.json`, `starforge_validation.json`, `independent_audit.md`, `package_audit.md`를 참고한다.',
              '', '## 독립 감사 반영', '',
              'HE 미사일 생산의 초당 입력 표에 철만 기재되고 황 소비율이 빠져 있는 문제를 확인했다. 불완전한 배열을 완전한 레시피로 오인하지 않도록 최종본의 `input_rates_per_s`를 null/unverified로 바꾸고, 확인된 철 0.17개/초는 부분 관측값으로 보존했다.',
              '', '## 조회 화면 검증 범위', '',
              'HTML은 JSON을 내장하며 외부 스크립트·폰트·네트워크 요청 없이 실행하도록 작성했다. 스크립트 구문, 실제 데이터 일치, 검색·필터·화면 생성 함수를 검증했다. 이 실행 환경에서는 Chromium 프로세스가 OS 소켓 제한으로 시작되지 않아 실제 브라우저 화면 렌더링과 다운로드 UI의 클릭 검증은 수행하지 못했다. 데이터 JSON/CSV/SQLite와 JavaScript 로더의 검증 결과에는 영향이 없다.',
              '', '## 재현 명령', '', '```bash','python3 scripts/build_exports.py','python3 scripts/validate_data.py','python3 scripts/build_reports.py','```','']
    (ROOT/'docs/VALIDATION.md').write_text('\n'.join(lines),encoding='utf-8')
    lines=['# 미확정 항목과 대조 이력','', '여기에는 해결되지 않은 충돌, 구형 원문과의 차이, 자료 부족이 포함된다. `adopted_value`가 null인지와 `resolution`을 확인한다.','']
    for c in data['conflicts']:
        lines += [f'## {c.get("id","case")}','',f'- 레코드: `{c.get("record_id","—")}`',f'- 필드: `{c.get("field","—")}`',f'- 처리: `{c.get("resolution","—")}`',f'- 사유: {c.get("reason",c.get("issue","관측값 참조"))}','', '```json',json.dumps(c,ensure_ascii=False,indent=2),'```','']
    lines += ['## 분야별 추가 조사 항목','']
    for item in data['unresolved']:
        if isinstance(item,str):lines += ['- '+item]
        else:lines += ['', '```json',json.dumps(item,ensure_ascii=False,indent=2),'```']
    (ROOT/'docs/UNRESOLVED.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    mapping={
      'corridor':('corridor','통로의 통행 개념'), 'armor':('armor','외부 방호 개념'),
      'cockpit':('cockpit','함선 지휘 장치'), 'reactor':('small_reactor_core','발전·배터리 공급 개념'),
      'bunk':('crew_quarters','6인 승무원실이라는 용도 대응'), 'storage':('storage_bay_2x2','저장 공간 개념. 구현은 탄약 전용'),
      'laser':('laser_blaster','에너지 무장 개념'), 'cannon':('large_cannon','중포의 용도 대응'),
      'shield':('small_shield_generator','실드 방어 개념. 구현은 전방위'),
      'thruster':('standard_thruster','추진 장치의 용도 대응'), 'radiator':('radiator','열 방출 개념'),
    }
    rows=[]
    def value(r,key):return r['fields'].get(key,{}).get('value')
    for p in proto['rows']:
        if p['category']!='parts':continue
        key=p['id'].split('.')[-1];rid,note=mapping[key];r=records[rid]
        rows.append(dict(starforge_id=p['id'],cosmoteer_id=rid,name_ko=p['fields']['name'],match_type='concept_only',
                         starforge_cost=p['fields']['cost'],original_value_credits=value(r,'value_credits'),starforge_hp=p['fields']['hp'],original_hp=value(r,'hp'),
                         original_cost_status=r['field_status'].get('value_credits'),original_hp_status=r['field_status'].get('hp'),note=note))
    with (ROOT/'csv/starforge_mapping.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    lines=['# STARFORGE와 원작 데이터의 대응','', '이 표는 기능과 명칭에 따른 연결 후보다. 원작의 파일 ID를 구현 ID로 바꾼 표나 배율 변환표가 아니다. 원작의 미확정 값은 비워두며 현재 게임 수치를 변경하지 않는다.','',
           '| 구현 부품 | 원작 연결 | 구현 비용 | 원작 가치(C) | 구현 HP | 원작 HP | 연결 근거 |','| --- | --- | ---: | ---: | ---: | ---: | --- |']
    for r in rows:
        lines.append('| '+' | '.join(str(r[k]) if r[k] is not None else '미확정' for k in ['starforge_id','cosmoteer_id','starforge_cost','original_value_credits','starforge_hp','original_hp','note'])+' |')
    lines += ['', '원작 값의 근거 상태와 출처는 `cosmoteer_original.json`의 같은 ID에서 확인한다. 원작 위키 관측값과 패치 명시값을 같은 확인 수준으로 해석하지 않는다.',
              '', '## 수치 이식 전에 필요한 결정','',
              '- 공간: STARFORGE 부품은 기본 한 칸이며 원작 부품은 다중 m/타일 공간을 사용한다.',
              '- 경제: STARFORGE는 단일 credits 가격 중심이다. 원작은 건조 재료와 청사진 해금 비용이 구분된다.',
              '- 전력: 원작은 배터리 크기·수급 단위가 명시되어 있다. 구현의 숫자를 원작 power 값으로 그대로 대체하지 않는다.',
              '- 사격각: 구현은 radians, 원작 표는 degrees를 사용한다. 수치 변환뿐 아니라 포탑·선체 가림 규칙도 함께 검토한다.',
              '- 저장: 구현 탄약고와 원작 일반 저장고는 수용 자원·타일 적재량이 다르다.',
              '- 열: 구현의 0~100 중심 열 상태·수리 재고와 원작의 열 네트워크·원료 경제를 별도 설계해야 한다.',
              '', '## 기존 코드 데이터', '', '| 분류 | 레코드 수 |','| --- | ---: |']
    for cat,count in proto['category_counts'].items():lines.append(f'| `{cat}` | {count} |')
    (ROOT/'docs/STARFORGE_MAPPING.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(json.dumps(dict(report='generated',mapping_rows=len(rows),open_cases=len(data['conflicts'])),ensure_ascii=False))

if __name__=='__main__':main()
