# 44. 출처·레벨·패치 이력 정합성

문서 버전: **4.0.0**  
기준일: **2026-11-17**  
대상: 공식 패치 이력과 v4 추가 조사 데이터의 오프라인 감사

## 1. 이 문서가 해결하는 문제

공식 공지의 숫자를 많이 수집하더라도 서로 다른 레벨, 카드 형태, 소환물, 날짜의 값을 잘못 합치면 현행 능력치처럼 보이는 잘못된 표가 만들어진다. 같은 URL에 여러 출처 ID를 두거나 재조사 행을 기존 데이터에 연결할 때에는 참조 무결성도 필요하다.

`scripts/reconcile_research.py`는 수집한 사실을 추가로 추정하지 않고 다음 내용을 재계산한다.

- 등록된 모든 출처 ID와 데이터 행 ID가 유일한지, 참조 대상이 실제로 있는지 확인한다.
- 2026년 기존 패치 원장과 확장 원장을 함께 읽어 날짜순 연결을 비교한다.
- 수치가 이어지는 것과 같은 기준 레벨이라는 것을 구분한다.
- `rebuild.py`가 생성한 최신 부분 필드를 원장에서 다시 계산한 기대 결과와 대조한다.
- 경제·모드·카드 동작 조사표의 새 사실, 재확인, 공백, 충돌을 동적으로 집계한다.
- 같은 JSON 입력에서 같은 분석 파일과 보고서가 생성되는지 `--check`로 확인한다.

이 작업은 원작 클라이언트의 실행 검증이 아니다. 원본 데이터, 출처 등록부와 관측 상태는 수정하지 않는다. 알려진 숫자 차이를 맞추기 위해 원값을 보간하거나 교정하지 않는다.

## 2. 입력과 산출물

### 2.1 입력

| 입력 | 사용 목적 |
|---|---|
| `data/tables/balance_patch_ledger_2026.json` | 기존 2026년 이력 61행 |
| `data/tables/official_patch_expansion_2026.json` | 5–8월 공식 숫자 변경 140행 |
| `data/tables/verified_patch_fields_2026.json` | 재생성된 최신 부분뷰와의 비교 |
| `data/tables/economy_research_v4.json` | 존재하면 경제 조사 분류와 참조 집계 |
| `data/tables/mode_research_v4.json` | 존재하면 모드 조사 분류와 참조 집계 |
| `data/tables/card_behavior_research_v4.json` | 존재하면 카드 동작 조사 분류와 참조 집계 |
| `data/tables/*.json` | 전체 행 ID·출처 참조·관련 레코드 참조와 총계 |
| `data/sources/*.json` | 모든 출처 등록부를 합친 ID 집합 |

세 신규 조사표 가운데 아직 없는 표는 오류로 간주하지 않는다. `present=false`, 0행으로 표시한다. 그 외에도 `research_kind`가 있는 테이블이 추가되면 조사 집계에 포함한다. 역사 자료의 추가 필드·참조 복구는 별도 수량으로 집계하며, 공식 현행 숫자 변경과 합쳐 복원율로 표시하지 않는다.

### 2.2 자동 생성 파일

| 파일 | 주요 내용 |
|---|---|
| [patch_lineage_audit.json](data/analysis/patch_lineage_audit.json) | 필드별 변경 연결, 레벨 상태, 수치 차이, 단위 위험, 최신 부분뷰 기대값 |
| [research_v4_summary.json](data/analysis/research_v4_summary.json) | 전체 데이터·출처·조사 분류 집계, 참조 무결성, 관측 상태와 입력 지문 |
| [research_reconstruction_v4.md](reports/research_reconstruction_v4.md) | 위 JSON에서 생성한 읽기용 보고서 |

보고서의 집계값은 실행 시 존재하는 테이블에서 계산한다. 문서 본문의 특정 사례와 현재 수량은 v4에 포함된 원장에 대한 설명이며, 추후 입력을 추가하면 자동 생성 보고서가 우선한다.

## 3. 레벨 상태 계약

`reference_level=null` 하나만으로는 “레벨과 무관함”과 “원문에 레벨이 없음”을 구분할 수 없다. v4는 세 가지 상태를 사용한다.

| `reference_level_status` | `reference_level` | 의미와 처리 |
|---|---|---|
| `specified` | 양의 정수 | 원문이 특정 레벨을 명시했다. 해당 레벨의 주장으로만 조회한다. |
| `not_applicable` | `null` | 시간·거리 등 레벨을 적용하지 않는 필드다. |
| `not_stated` | `null` | 수치는 공개되었지만 기준 레벨이 미기재다. 선택한 레벨의 값으로 자동 적용하지 않는다. |

상태가 `specified`인데 레벨이 없거나, 다른 상태에 숫자 레벨이 있으면 계약 오류다. 새 확장 원장에는 상태가 반드시 있어야 한다.

기존 v3의 61행은 레벨 상태 필드가 없었고 `null`을 레벨 비적용 용도로만 사용했다. 이 원장에 한해서 숫자 레벨은 `specified`, `null`은 `not_applicable`로 읽는다. 이 호환 규칙은 `legacy_status_handling`에 ID와 함께 기록한다. 새 자료의 미기재 레벨을 레벨 11로 바꾸는 규칙은 없다.

피해량·체력·치유량·초당 피해처럼 보통 레벨을 적용하는 단위를 `not_applicable`로 표시하면 재검토 경고를 낸다. 단위 이름만으로 실제 레벨을 정하거나 값을 바꾸지는 않는다.

### 3.1 현재 원장 수량

기존 61행과 추가 140행을 합한 201행 중 `specified` 73행, `not_applicable` 88행, `not_stated` 40행이다. 최신 부분 필드에서는 각각 69행, 82행, 40행이 남아 총 191행이 된다. 91개 카드 키가 포함되지만 각 카드의 전체 프로필이 복구된 것은 아니다. 계산 근거는 [통합 원장 감사](data/analysis/patch_lineage_audit.json)의 `input_tables`, `by_reference_level_status`, `expected_latest_counts`다.

201행 중 199행에는 before와 after가 모두 있고, 기존 2행은 after만 있다. `before=null`은 원문에서 이전 값이 공개되지 않았다는 뜻이다. 특히 공격 지연의 after가 0이라고 해서 before도 0으로 채우지 않는다.

## 4. 비교 단위와 날짜 처리

숫자 연결을 비교하는 필드의 식별자는 다음 다섯 요소다.

```text
(card_key, form, component, key, unit)
```

이 식별자가 같을 때만 날짜순 인접 이벤트를 비교한다. 최신 부분값의 식별자에는 레벨 상태와 레벨도 추가한다.

```text
(card_key, form, component, key, unit, reference_level_status, reference_level)
```

따라서 일반형과 진화형, 히어로형은 독립적인 행으로 남는다. 같은 카드의 본체 HP와 방패 HP, 건물과 소환물, 일반 공격과 고유 능력도 component가 다르면 연결하지 않는다. 기본형의 변경을 진화형에 자동 전파하지 않는다. component는 이 자료의 의미 구분 표지이며 비공개 원작 엔진 ID라는 주장은 하지 않는다.

정렬은 `effective_from`, `record_id` 순으로 결정해 출력 순서를 고정한다. 같은 날짜의 이벤트 순서까지 공식적으로 밝혀졌다는 뜻은 아니다. 같은 필드와 레벨 범위에 같은 날짜 이벤트가 둘 이상이면 중복 위험을 기록하고, 그 사이의 연결을 검증 완료로 표시하지 않는다.

출처의 공지일과 실제 적용일을 새로 추정하지 않는다. 이미 수집한 행의 날짜를 그대로 사용한다. 날짜가 다른 별도 절을 가진 8월 공지는 8월 4일과 8월 26일의 사건으로 보존한다. 원문 기준과 수집 범위는 [문서 40](40_official_patch_reconstruction_2026.md)과 [패치 출처 등록부](data/sources/patch_expansion_sources.json)에 있다.

## 5. 연결 판정

### 5.1 값이 같은 경우에도 레벨 근거를 확인한다

| 분류 | 조건 | 판정 |
|---|---|---|
| `same_known_level_or_level_independent` | 같은 명시 레벨 또는 둘 다 레벨 비적용 | 앞의 after와 뒤의 before가 같으면 공급된 이력 범위의 수치 연속성 확인 |
| `unspecified_level_candidate` | 둘 중 하나라도 레벨 미기재 | 값이 같아도 후보 연결로만 보존 |
| `different_specified_levels` | 서로 다른 명시 레벨 | 같은 능력치의 직접 수치 연속성으로 확인하지 않음 |
| `incompatible_level_status` | 명시 레벨과 비적용 등 의미가 맞지 않음 | 재검토 경고 |
| `same_date_order_unresolved` | 같은 날짜 | 원문에 별도 순서 근거가 없는 한 순서를 확정하지 않음 |
| `missing_endpoint_value` | 후속 이벤트의 before가 없음 | 비교 불가; 0을 대입하지 않음 |

`continuity_verified_within_supplied_ledger=true`는 같은 공개 범위의 인접 수치가 연결되었다는 제한적인 뜻이다. 그 사이에 누락된 패치가 전혀 없다는 주장이나, 현재 원작 클라이언트와 동일하다는 뜻은 아니다.

### 5.2 Void: 294와 296을 그대로 남긴다

공식 8월 공지는 Void의 2–4대상 구간 공격당 피해를 `161→294`로 제시한다. 10월 공지는 같은 의미 필드를 `296→307`로 제시한다. 8월 행은 기준 레벨 미기재이고, 10월 행은 레벨 11 명시다.

이 자료는 `294`와 `296`의 차이를 발견하되 어느 쪽도 고치지 않는다. 레벨 차이, 중간 업데이트 누락, 표시 정밀도, 원문 오류 중 무엇이 원인인지 현재 근거만으로 판별할 수 없다. `numeric_mismatch_edges`에는 1건으로 남고, 같은 확정 레벨 범위에서의 불일치에는 포함하지 않는다.

근거: [8월 공식 공지](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/), [10월 공식 공지](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes-2026/), 기존 `OFFICIAL_PATCH_2026_10` 출처와 `PATCH_20261019_037`. 출처 범위는 [card_sources.json](data/sources/card_sources.json), 두 숫자 레코드와 판정은 [패치 감사](data/analysis/patch_lineage_audit.json)에 있다.

### 5.3 Hero Tombstone: 이전 레벨 11 값의 시점을 표시한다

7월 Tomb Queen HP는 레벨 11 기준 `3379→4044`이며, 8월에는 기준 레벨 미기재 `4044→4224`가 나온다. 최신 부분뷰에는 다음 두 주장을 별도로 남긴다.

| 날짜 | 레벨 상태 | 보존 값 | 해석 |
|---|---|---:|---|
| 2026-07-06 | `specified`, 11 | 4044 | 레벨 11에서 공개된 이전 주장. 이후 미기재 레벨 변경이 있으므로 현행 레벨 11 값으로 단정하지 않음. |
| 2026-08-04 | `not_stated`, null | 4224 | 레벨 미기재 변경값. 레벨 11 필드에 자동 덮어쓰지 않음. |

레벨 11 행에는 `has_later_unspecified_level_change=true`와 후속 패치 ID를 기록한다. `claim_scope`도 `earlier_level_value_with_later_unspecified_change`로 제한한다. 근거: [7월 공식 공지](https://supercell.com/en/games/clashroyale/blog/release-notes/july-balance-changes-2026/), [8월 공식 공지](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/).

Hero Mega Minion의 Warp 피해도 명시 레벨 → 미기재 → 명시 레벨의 순서를 가진다. 중간 미기재 이벤트를 건너뛰어 두 명시 레벨 숫자만 비교하면 가짜 불일치를 만들 수 있다. 감사는 원래 시간순 인접 연결을 유지한다.

## 6. 단위·중복·관련 참조

### 6.1 원문 단위를 보존한다

X-Bow 투사체 속도 `1400→1600`, Goblin Machine 로켓 속도 `250→350`, Battle Healer 치유 반경 `4000→3000`은 공개 문서에서 해당 숫자가 제시된 형태를 보존한다. 각각 `source_speed_unit`, `source_speed_unit`, `source_radius_unit`이며 타일 단위로 변환하지 않는다. 기존 원장의 `source_mass_unit`도 유지한다. 단위 변환 근거가 없으면 1000으로 나누는 등의 환산을 적용하지 않는다. 근거: [8월 공식 공지](https://supercell.com/en/games/clashroyale/blog/news/final-august-balance-changes-826/), [확장 원장](data/tables/official_patch_expansion_2026.json).

동일 카드·형태·component·필드에 단위가 둘 이상 있으면 `unit_conflicts`에 기록한다. 단위가 다른 값은 같은 숫자처럼 보여도 직접 연결하지 않는다.

### 6.2 같은 날짜의 중복

필드·단위·레벨 상태·레벨·날짜가 모두 같은 이벤트가 여러 개면 `duplicate_events`에 표시한다. before와 after까지 같은 중복인지, 같은 범위에 다른 숫자가 있는지도 함께 남긴다. 출력 순서용 ID 정렬을 사건의 선후 근거로 사용하지 않는다.

### 6.3 출처와 관련 레코드

모든 `data/sources/*.json`을 읽어 source ID 집합을 만들며, 특정 파일에 출처가 추가되었다는 이유로 조사에서 누락하지 않는다. 모든 테이블의 `source_ids`가 이 집합 안에 있는지 확인한다. source ID와 record ID 중복은 오류다.

모든 `related_record_ids`는 전체 테이블의 record ID에 연결되어야 한다. 빈 배열 `[]`은 허용한다. 기존 행에 직접 대응하지 않는 새 사실이나 명칭 분석도 정당한 독립 조사 행이기 때문이다. 미지의 ID가 적혀 있는 경우와 연결할 대상이 없어 빈 배열인 경우는 다르게 처리한다.

동일 URL을 가리키는 서로 다른 source ID는 제거하지 않는다. 동일 원문이 전투·모드·경제 문맥에서 다른 범위를 뒷받침할 수 있다. 보고서는 정확히 같은 URL 문자열을 기준으로 별칭 목록을 제공한다. 리다이렉트나 온라인 접근 상태를 이 스크립트에서 검사하지 않는다.

## 7. 조사 분류와 수량의 의미

| `research_kind` | 집계 의미 | 피해야 할 해석 |
|---|---|---|
| `new_fact` | 이번 조사 데이터에 추가된 근거 있는 주장 행 | 새로 출시된 기능 수 또는 완전한 수치 복구 수 |
| `rechecked_claim` | 기존 주장을 재조사한 행 | 기존 행과 독립적인 두 개의 게임 기능 |
| `unresolved_gap` | 재조사 후에도 해결되지 않은 공백 | 복구 완료 항목 |
| `conflict` | 출처·시점·범위의 차이를 해결하지 못해 보존한 충돌 | 임의 선택한 하나의 확정값 |

각 조사표는 자체 `research_kind`와 `evidence_status`를 유지한다. 공백과 충돌의 수가 증가한 것은 더 많은 경계를 발견했다는 뜻일 수 있다. 따라서 전체 행 수나 공식 출처 수만으로 재구축 정확도나 완료율을 계산하지 않는다. `reconstruction_percentage`는 null이다.

`official_confirmed`도 해당 문서의 범위에서 확인되었다는 의미다. 과거 시즌의 공식 이벤트 규칙, 변경 전 경제 표, 종료된 모드에 관한 사실을 현재 전체 게임 규칙으로 일반화하지 않는다. `historical_only`, 날짜, 버전 주석과 관련 원표를 함께 읽어야 한다.

## 8. 재현 절차와 실패 조건

프로젝트 루트에서 실행한다. Python 표준 라이브러리만 사용하며 네트워크에 접근하지 않는다.

```bash
python scripts/rebuild.py
python scripts/reconcile_research.py
python scripts/reconcile_research.py --check
python -m unittest discover -s tests -p test_reconciliation.py
```

프로젝트 밖에서 실행할 때에는 스크립트 절대경로를 사용하거나 `--root`로 입력 루트를 지정할 수 있다. 먼저 `rebuild.py`를 실행해야 확장 원장의 최신 부분뷰가 감사 입력과 일치한다.

일반 실행은 세 분석 산출물을 생성한다. `--check`는 재계산한 바이트와 저장된 파일을 비교하며 파일을 생성하거나 수정하지 않는다. 입력 JSON 내용의 SHA-256 지문도 보고서에 기록한다. 실행 시각, 무작위 값, 온라인 응답은 출력에 들어가지 않는다.

다음은 오류이며 종료 코드는 1이다.

- JSON 입력 형식, 숫자 값, 레벨 상태 계약이 유효하지 않음.
- 필수 패치 원장이나 최신 부분뷰 테이블이 없음.
- source ID·record ID 중복 또는 존재하지 않는 출처·관련 레코드를 참조함.
- 새 조사표에 알 수 없는 `research_kind`가 있음.
- 원장에서 기대하는 최신 부분뷰와 저장된 `verified_patch_fields_2026`이 다름.
- `--check`에서 분석 산출물이 없거나 내용이 재계산 결과와 다름.

반면 이미 알려진 Void 숫자 차이와 Tombstone의 후속 미기재 레벨 변경은 근거 한계 경고로 보존한다. 경고를 없애기 위해 입력을 바꾸지 않으며, 검증 성공이 경고까지 해소되었다는 뜻은 아니다.

## 9. 회귀 검사가 보장하는 범위

[test_reconciliation.py](tests/test_reconciliation.py)는 실제 수집 사례의 의미 경계를 검사한다. 레벨 미기재 숫자가 레벨 11로 들어가지 않는지, Tombstone의 두 주장이 남는지, Void의 차이가 수정되지 않는지, Hero Mega Minion의 중간 미기재 이벤트를 건너뛰지 않는지 확인한다. 원문 단위 유지, null before 보존, 단위 변경과 중복 이벤트 위험, 빈 관련 참조의 허용, 미지 참조의 검출도 검사한다.

추가로 최신 부분뷰의 값을 바꾼 입력이 탐지되는지, 분석이 원표를 변경하지 않는지, `--check`가 오래된 산출물을 고치지 않고 실패시키는지 확인한다. 이 검사는 도구와 데이터 연결의 회귀 검사이며 실제 전투 공식, 렌더링, 네트워크 동기화, 원작 카드 상호작용의 실행 검증을 대신하지 않는다.
