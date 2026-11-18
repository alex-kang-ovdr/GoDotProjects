# Besiege 원작 데이터 복원·시스템 고도화 기획 R2

**조사일: 2026-11-18 · 문서/데이터 패키지 · 한국어**

원작 공개 자료를 부품·설정·버전별 근거로 재구성하고, 현재 JavaScript 게임 **IRONWOOD 4.0**의 코드와 비교하여 다음 구현의 데이터 구조와 완료 조건을 정리했다. 핵심 결정은 **접속부와 연결 그래프, 부품별 입력, 힘의 단위, 저장 호환성을 먼저 정리한 뒤 이동·무기·자동화를 확장하는 것**이다.

이 패키지는 출처가 있는 역기획과 구현 준비 자료다. 원작 바이너리·설치 파일을 추출하거나 모든 내부 물리값을 복구한 결과가 아니다. 새 스키마와 백로그는 `proposal`/`planned`, 원작 계측 실험은 `not_run` 상태로 제공한다.

## 1. 산출물과 정확한 집계

| 항목 | 규모 | 읽는 방법 |
|---|---:|---|
| 원작 부품 조사 레코드 | 93행 | 동작 설명 확인 66, 명칭·변경 확인 19, 재검증 대기 8. 원작 전체 블록 수를 뜻하지 않음 |
| 공개 설정·역사적 매개변수 | 80행 | 수치·bool·enum·변경 기록 포함. 숫자 80개 또는 현행값 80개가 아님 |
| 콘텐츠/평가 관련 사실 | 12행 | 상점 소개와 패치 증분의 범위를 분리 |
| 외부 연구 기하 후보 | 8행 | 외접 크기 후보. 실제 collider·내부 ID 아님 |
| 선택한 버전 경계 | 13행 | 공식 발표 순서. 전체 패치 연대표 아님 |
| 출처 기록 | 51행 / 40개 URL | 같은 URL의 서로 다른 근거 범위 포함. 나무위키 접근 실패 1행도 기록 |
| 미결 충돌·범위 그룹 | 5개 | 문헌 불일치, 저장/콘텐츠 범위, ID 체계의 차이를 별도 관리 |
| 현재 구현 스냅샷 | 10부품·6프리셋·7임무 | 7임무는 캠페인 6개와 샌드박스 1개. 상수 49개, 소스 해시 12개 |
| 개선 차이 분석 | 21개 | 코드의 현재 동작, 개선안, 수용 기준 |
| 실행 백로그 | 23개 | P0 10개, P1 10개, P2 3개. 의존 관계 포함 |
| 원작 측정 실험 | 40개 | P0 20개, P1 20개. 전부 미실행이며 결과 `null` |
| 과거 역기획 보관본 | Markdown 22개 | 2026-11-13 기준 원본. 최신 검증 결과는 R2 문서에 있음 |

기준 코드: `IRONWOOD 4.0.0`, commit `af19c56113079416b4763ce2c0d4d2148ee1592f`. 각 판단의 파일·심볼·지문은 [코드 감사](docs/06_IRONWOOD_GAP_ANALYSIS.md)와 [스냅샷](data/ironwood_v4_snapshot.json)에 남겼다.

## 2. 먼저 읽을 문서

| 순서 | 문서 | 핵심 질문 |
|---:|---|---|
| 1 | [01 근거와 버전 정책](docs/01_EVIDENCE_AND_VERSION_POLICY.md) | 어떤 사실이 확인됐고 어떤 값이 비어 있는가? |
| 2 | [02 원작 부품·설정 복원](docs/02_ORIGINAL_PARTS_AND_PARAMETERS.md) | 어느 부품의 어느 행동/설정을 문헌으로 복원했는가? |
| 3 | [06 IRONWOOD 구현 차이](docs/06_IRONWOOD_GAP_ANALYSIS.md) | 현재 코드와 원작 분석에서 무엇이 다르고 무엇을 바꿔야 하는가? |
| 4 | [07 시스템 고도화 백로그](docs/07_SYSTEM_UPGRADE_BACKLOG.md) | 무엇부터 구현하고 어떤 조건으로 완료를 판단하는가? |
| 5 | [08 조립 UX·임무 개선](docs/08_ASSEMBLY_UX_AND_MISSION_REDESIGN.md) | 사용자가 조립 결과와 실패 원인을 어떻게 이해하는가? |
| 6 | [10 데이터·저장 이행](docs/10_DATA_SCHEMA_AND_MIGRATION.md) | 기존 설계를 보존하면서 연결·입력·모듈을 어떻게 저장하는가? |

시스템별 세부 문서는 [03 연결·기구](docs/03_CONNECTIONS_AND_MECHANISMS.md), [04 육상·공중·수상](docs/04_GROUND_AIR_WATER.md), [05 무기·파괴·자동화](docs/05_WEAPONS_DAMAGE_AUTOMATION.md)다. 원작 검증에는 [09 측정 프로토콜](docs/09_MEASUREMENT_PROTOCOL.md)과 [11 데이터 복원 절차](docs/11_PUBLIC_DATA_AND_RECOVERY_WORKFLOW.md)를 사용한다. 기존 해석의 정정 사항은 [12 정정·미결 질문](docs/12_CORRECTIONS_AND_OPEN_QUESTIONS.md), 원문 링크는 [99 출처](docs/99_SOURCES.md)에 모았다.

## 3. 이번 분석에서 바뀐 설계 판단

### 3.1 부품의 이름보다 힘과 입력의 경로를 우선한다

현재 `propeller`는 입력으로 힘을 내는 통합 추진기다. 원작 Propeller와 이름만 대응시키지 않고, 직접 추진·회전 구동·공력면·수중 저항을 따로 정의한다. 원작 Propeller의 수동성은 설치본 실험 전까지 가설로 둔다. 기존 기체가 쓰는 `propeller`는 호환 프로필에서 의미를 보존한다. [분석04](docs/04_GROUND_AIR_WATER.md)

V4의 보조 OFF에도 남는 코어 직접 토크를 고려해, 새 조종 정책은 `legacy_assisted`, `assisted`, `physical`로 명시한다. 새 `assisted`는 실제 장치에 명령을 분배하며, 장착되지 않은 조종 장치의 힘을 몰래 만들지 않는다. [설계07](docs/07_SYSTEM_UPGRADE_BACKLOG.md)

### 3.2 구조·제어·자원을 분리한다

인접한 블록이라는 사실, 힘을 전달하는 링크가 있다는 사실, 조작 신호와 연료가 도달한다는 사실은 서로 다른 관계다. 연결의 양 끝점, 로컬 좌표계, 가동부, 허용 자유도를 데이터로 저장한다. 피스톤·관절·대포의 전역 입력을 부품별 action/binding으로 바꾸고, 떨어진 장치의 제어 정책도 별도로 둔다. [분석03](docs/03_CONNECTIONS_AND_MECHANISMS.md), [설계10](docs/10_DATA_SCHEMA_AND_MIGRATION.md)

### 3.3 실패를 수정 가능한 정보로 바꾼다

조립 화면은 접속 가능 면·예상 링크·충돌·코어 도달 여부·가동부 우회를 구별해 보여준다. 실행 보고서는 연결 파단, 헛도는 바퀴, 조종 장치 부재, 잠긴 위치, 자원 고갈을 구별한다. 단순히 도착했는지를 넘어서 무엇을 바꾸면 좋아지는지 알려 주는 과제로 재설계한다. [UX08](docs/08_ASSEMBLY_UX_AND_MISSION_REDESIGN.md)

## 4. 데이터 사용 규칙

| 데이터 | 기준 용도 | 자동 적용 제한 |
|---|---|---|
| `original_parts` / `original_parameters` | 원작 공개 근거 원장 | 설치판·저장 범위 검증 전 현행 수치로 승격하지 않음 |
| `campaign_facts` / `release_timeline` | 소개 범위와 변경 순서 | 단순 합산으로 현행 전수 목록을 만들지 않음 |
| `public_geometry_candidates` | 측정 fixture의 기하 후보 | 실제 collider·관성·원작 내부 ID로 변환하지 않음 |
| `ironwood_v4_snapshot` | 현재 독립 게임의 기준 동작 | 원작 질량·HP·힘으로 복사하지 않음 |
| `system_gaps` / `backlog` | 개발 우선순위·수용 기준 | 구현 완료로 집계하지 않음 |
| `experiments` | 원작 관측 계획 | 결과를 생성하거나 측정 완료로 표시하지 않음 |

`null`은 미확정 또는 해당 필드가 설명하는 적용 불가다. 0으로 바꾸면 질량이 없거나 힘이 없다는 물리 의미가 생기므로 대체하지 않는다. `original_block_id`는 모두 `null`; `bsg_*`는 조사용 식별자다. `value`에는 문헌에 나온 값을 보존하고 `current_applicable_value`에는 현재 설치판에서 검증된 값만 넣는 구조다. 이번에는 후자가 전부 `null`이다.

원작 버전 문자열은 SemVer로 정렬하지 않는다. [release_timeline.json](data/release_timeline.json)의 `release_order`는 공식 발표일과 확인된 changeset을 기준으로 부여했다. 구형 저장과 신규 배치의 동작 차이를 별도 축으로 다룬다.

### JSON과 CSV

JSON이 권위 있는 데이터 원본이다. 목록형 데이터마다 같은 이름의 UTF-8 BOM CSV를 제공하며, 스냅샷은 부품·임무·상수 CSV로도 제공한다. CSV의 배열/객체는 셀 안의 JSON 문자열, bool은 `true`/`false`, 미확정값은 문자 `null`이다. 빠진 선택 필드도 CSV에서는 `null`로 표시한다. CSV만으로 문자열 `null`과 JSON null을 역추론하지 말고 원본 JSON의 필드 자료형을 따른다.

연결 키는 `source_ids → sources.source_id`, `part_record_id → original_parts.record_id`, `gap_ids → system_gaps.gap_id`, `dependencies → task_id 또는 같은 표의 gap_id`, `conflict_group → conflicts.conflict_id`다. 배열 필드를 쉼표로 단순 분리하면 안 된다.

## 5. 바로 실행 가능한 도구

Python 3 환경에서 압축을 풀고 이 폴더를 작업 경로로 사용한다. 검사 스크립트는 표준 라이브러리로 동작한다. JSON Schema의 전체 규격 검사는 `jsonschema`가 설치되어 있을 때 추가로 수행하며, 실행 여부가 검증 결과에 표시된다.

```bash
python3 scripts/validate_pack.py
python3 scripts/inspect_bsg.py examples/xml_inspection_fixture.xml
```

실제 보유한 XML 저장 파일의 구조만 읽으려면 다음처럼 별도 출력 파일을 지정한다. 원본을 수정하지 않으며 이미 존재하는 출력 파일도 덮어쓰지 않는다.

```bash
python3 scripts/inspect_bsg.py path/to/machine.bsg --out machine-inspection.json
```

`inspect_bsg.py`는 범용 XML 검사 도구다. 실제 Besiege 저장본이 이번 작업에 제공되지 않았으므로 특정 게임 빌드와의 완전한 호환성을 검증한 importer가 아니다. 합성 fixture를 실제 원작 저장으로 사용하지 않는다.

CSV를 원본 JSON에서 다시 생성할 때만 다음 명령을 사용한다.

```bash
python3 scripts/export_csv.py
```

제공된 [V2 JSON Schema](data/design_v2_proposal.schema.json)와 [예제](examples/design_v2_proposal.json)는 구현 계약 제안이다. IRONWOOD 4.0이 이를 이미 읽을 수 있다는 뜻은 아니다. V1→V2 이행에서 기존 instance ID, 좌표, 회전, 입력 의미, legacy 프로필을 보존하는 규칙은 문서10을 따른다.

## 6. 구현 착수 순서

| 단계 | 작업 | 다음 단계 진입 조건 |
|---|---|---|
| A | TASK-001~003, 010: 원장·V1 호환·솔버 단위·브라우저 완료 기준 | 출처와 튜닝이 분리되고 기존 저장 재생 결과를 비교 가능 |
| B | TASK-004~007, 011: 포트·끝점 보강·부품별 입력·연결 정책·혼합값 편집 | 두 독립 기구를 각기 조작하고 연결 관계를 설명 가능 |
| C | TASK-008~009, 012~015: 추진·제어·정밀 조립·현가·매질·조종면 | 실제 부품에서 힘이 발생하고 한 부품의 손실이 예상 가능한 차이를 만듦 |
| D | TASK-016~020: 독립 무기·목표 그래프·보고서·모듈·재현 시험 | 제작→시험→실패 분석→수정의 루프를 저장 후 반복 가능 |
| E | TASK-021~023: 논리·열/재질·점수 정책 | 핵심 입력·시간·물리 계약을 재사용하는 확장 |

순서표는 개요이며 실제 선행 작업은 [backlog.json](data/backlog.json)의 `dependencies`를 따른다. S/M/L은 상대 규모 추정이며 일정 약속이 아니다.

## 7. 검증과 한계

검증 내용과 결과는 [VALIDATION.md](VALIDATION.md), 기계 판독 결과는 [validation_report.json](validation_report.json), 파일 무결성 정보는 [manifest.json](manifest.json)에 제공한다. 패키지 검증은 출처 참조·관계 키·의존 그래프·스키마 예제·CSV 대응·XML 검사 도구의 동작을 확인한다. 원작 실측이나 새로운 게임플레이의 브라우저 실행을 대신하지 않는다.

나무위키 지정 문서는 이번 환경에서 본문 접근에 실패해 해당 내용의 직접 근거로 쓰지 않았다. 개발사 공지·공식 상점·연구 저자 공개 자료를 대조했다. 출처 원장에는 접근 실패도 남겨 어떤 자료를 읽었는지 추적할 수 있게 했다.

이 ZIP에는 R2 연구 문서, 데이터, 예제, 검사 도구와 과거 기획 보관본을 담았다. 기존 게임 소스와 배포 파일은 별도의 V4 산출물이다. 이번 작업에서 게임 런타임의 기능 완료를 새로 주장하지 않는다.
