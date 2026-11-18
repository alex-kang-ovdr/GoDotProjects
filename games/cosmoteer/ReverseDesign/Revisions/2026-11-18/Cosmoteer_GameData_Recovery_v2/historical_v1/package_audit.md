# 데이터 복구 패키지 독립 검수

## 판정

**통과. 현재 패키지에서 배포를 막는 구조·변환·로더 결함을 발견하지 않았습니다.** 최초 검수에서 발견한 로더 경계 조건 2건은 제작 담당자가 수정했고, 수정본 재검사에서 모두 해결됐습니다.

- 검수 대상: `/workspace/scratch/887a0260e417/Cosmoteer_GameData_Recovery_v1`
- 검수 시각: 2026-11-17 15:15 UTC
- 검수 범위: 로컬 JSON·CSV·SQLite 일치성과 JavaScript 로더 경계 조건. 실제 원작 게임 바이너리의 수치 정확성을 재검증한 결과는 아닙니다.
- 작업 방식: 프로덕션 파일을 수정하지 않았습니다. SQLite는 `mode=ro`로 열었습니다. 검수 코드와 결과만 `data_recovery_work`에 작성했습니다.
- README·VALIDATION·MAPPING 문서와 브라우저 UI는 제작 담당자의 별도 검수 범위입니다.

## 결과

| 항목 | 결과 |
|---|---|
| 원작 JSON | 196 records / 1,950 observations |
| STARFORGE JSON | 109 rows / 937 observations |
| JSON Schema | Draft 2020-12 스키마 자체 검사 및 날짜 format 검사 포함 검증 통과 |
| 원작 long CSV | 1,950개 `value_json` 값·타입·단위·상태가 원본 JSON과 일치 |
| STARFORGE long CSV | 937개 `value_json` 값·타입·원산지 정보가 원본 JSON과 일치 |
| SQLite `integrity_check` | `ok` |
| SQLite `foreign_key_check` | 위반 0건 |
| SQLite 원본 일치 | 196 records / 1,950 observations / 110 sources / 1,663 evidence edges / 66 conflict entries 일치 |
| SQLite `numeric_stats` | 숫자 관측치 1,251개와 일치; bool 제외 |
| 패키지 포함 검증기 | 통과, 오류 0건 / 경고 0건 |
| JS helper | 7개 검수 그룹 통과, 전체 1,950개 필드의 기본 숫자·상태 게이트 검사 통과 |

## null·0 및 타입 왕복

원작 long CSV에서 숫자 0 **18개**, null **433개**를 각각 구별해 복원했습니다. STARFORGE long CSV에서도 숫자 0 **18개**, null **4개**를 구별해 복원했습니다. bool과 숫자 0도 JSON 직렬화 비교로 분리했습니다. 문자열·숫자·불리언·배열·객체·null의 타입이 모두 보존됐습니다.

타입 보존의 기준은 long CSV의 `value_json`입니다. 표시용 `value` 열에서 null은 빈 문자열이므로, 이 열만 숫자로 변환하면 0과 혼동할 수 있습니다. wide CSV만으로 타입을 추정하는 방식은 이번 왕복 검증의 기준이 아닙니다. CSV는 UTF-8 BOM을 포함하며 `utf-8-sig`로 읽었습니다.

## JavaScript 로더 검수

- 실제 원작의 null 433개와 충돌 상태 필드 58개는 숫자로 채택되지 않습니다. 실제 충돌 필드 값은 모두 null입니다.
- 기본 허용 상태 `patch_confirmed`에서 숫자 31개를 채택했습니다. 그 외 상태는 명시 허용이 필요한지를 전체 필드에 대해 확인했습니다.
- 허용한 상태에서 숫자 0이 보존되며, 숫자 문자열·불리언·무한대·NaN·null은 거부됩니다.
- 요청 단위와 실제 단위가 정확히 일치해야 합니다.
- type/category/mode 필터는 각각 정확한 값과 일치하며, 복합 필터는 교집합입니다.
- 없는 필드는 null/unverified 관측치로 반환되고, 없는 record ID는 거부됩니다.
- 중복 ID와 비유한 숫자가 거부됩니다.

### 발견 후 해결된 경계 조건

1. **필수 구조 없는 객체 수락:** 최초 `validateCatalogue`는 dataset ID만 있는 객체를 통과시켰습니다. 제작 담당자가 필수 메타데이터·배열·관측치 및 참조 검증을 강화했습니다. 수정본에서는 해당 불완전 객체가 거부됨을 재검사했습니다.
2. **명시적 conflict 화이트리스트 우회:** 최초 `requireNumber`는 합성 숫자 충돌값에 `allowedStatuses: ['conflict']`를 지정하면 값을 반환했습니다. 제작 담당자가 미확정 상태를 허용 목록 검사 전에 거부하도록 수정했습니다. 수정본에서는 같은 합성 conflict 입력이 거부됨을 재검사했습니다.

**남은 중요 결함: 없음.** 위 결과는 확인 시점의 데이터와 로더에 대한 검수이며, 원작에 없는 값의 추정·보충이나 버전 간 충돌 해결을 의미하지 않습니다.

## 재현 자료

- `package_audit.mjs`: Node 로더 검수
- `package_audit_js.json`: 수정본 JS 검수 결과
- `package_audit.py`: JSON Schema / CSV / SQLite 읽기 전용 검수
- `package_audit_python.json`: 데이터 검수 결과
