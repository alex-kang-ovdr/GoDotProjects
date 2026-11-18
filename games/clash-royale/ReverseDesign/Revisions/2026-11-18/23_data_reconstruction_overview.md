# 23. 원작 데이터 재구축 범위와 근거 체계

> **v4 추가 조사 안내:** 아래 본문과 개수는 해당 v2/v3 작성 당시의 범위를 설명한다. 현재 통합 자료, 추가 복원, 레벨 미기재 값의 처리와 실행 명령은 [39번 개요](39_research_reconstruction_v4_overview.md), [44번 근거 조정](44_sources_and_level_reconciliation.md), [최신 검증 보고서](reports/validation_report.md)를 기준으로 한다.

> 패키지 2.0.0 · 조사 기준 2026-11-17 · 공개 자료를 구현·검증 가능한 계약으로 정리한 역기획이다. 비공개 원본 데이터베이스, 서버 코드, 게임 클라이언트를 복구한 결과로 해석하지 않는다.

## 1. 이번 고도화의 결과

기존 23개 시스템 문서가 규칙과 설계 의도를 설명했다면, 이번 확장판은 규칙을 식별 가능한 데이터 레코드로 만들고 수치·출처·시점·미확정 사항을 함께 조회하도록 구성한다. 기본 자료는 Supercell의 공식 패치·지원·보상표이며, 수치 배열을 넓게 복원할 수 있는 RoyaleAPI 공개 저장소는 역사 데이터로 분리했다.

| 자료 층 | 실제 제공물 | 사용할 수 있는 판단 | 대신할 수 없는 판단 |
|---|---|---|---|
| 공식 공개 규칙 | 전투63, 성장103, 경제324, 모드45, 소셜49, Merge106 레코드 | 문서에 명시된 조건·수치·예외 확인 | 미공개 서버 처리 순서, 계정별 적용 여부 |
| 공식 확률 표 | 98레코드, 24개 명시적 확률 그룹 | 조건별 분포와 공개 반올림 확인 | 모든 계정의 개인화 필터 및 보장 상태 |
| 공식 패치 원장 | 61개 변경 행, 최신 필드 조회60행 | 선택한 9~10월 패치에 기록된 값 추적 | 최신 전체 카드 프로필의 완전성 |
| 역사 카드 아카이브 | 카드120행, 구성 정의532행, 레벨 수치4,956행 | 2023 공개 자료의 구조·값 재구축 | 2026 현재 카드 수와 모든 현재 수치 |
| 참조 관계 | 카드 연결120행, 개체 연결428행 | 카드·본체·투사체·사망 소환 관계 추적 | 공개 자료에서 빠진 정의의 자동 복구 |
| 실험 명세 | 상호작용44개 | 무엇을 어떤 조건으로 측정할지 합의 | 실험 통과·실게임 일치 주장 |
| 자체 구현 대조 | Crownfall 카드19행 | 현재 구현과 원작 역할의 차이 검토 | 원작 카드 수치 또는 정식 카드 목록 |

전체 16개 표의 행 수 합계는 **7,128**이다. 같은 사실의 정규화·참조·최신 조회가 포함되므로 이를 7,128개의 독립적인 최신 게임 수치로 세지 않는다. 실제 검사 결과는 [검증 보고서](reports/validation_report.md), 원본 배열과 출처 범위는 [데이터 사전](29_card_entity_level_dictionary.md)에 있다.

## 2. 가장 중요한 버전 경계

RoyaleAPI의 [공개 저장소](https://github.com/RoyaleAPI/cr-api-data)는 조회 당시 HEAD가 `d5461b0a59bff33c4da2fc845b07275b66b2d6ff`였고 커밋 시각은 2023-10-18이었다. JSON 파일 4개를 해당 SHA의 고정 URL로 다시 확인하고 해시를 기록했다. 조회 날짜가 2026년이라는 이유로 내용을 최신으로 표시하지 않는다.

공식 2026년 [9월](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/)·[10월](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes-2026/) 패치는 바뀐 일부 필드만 알려준다. 누락된 나머지 값을 2023 아카이브로 채우면 검증되지 않은 혼합 프로필이 된다. 따라서 `verified_patch_fields_2026`은 해당 필드만 반환하고 `full_current_card_profile=false`를 유지한다.

예를 들어 과거 자료의 Fireball 일반 피해와 2026 패치의 크라운 피해를 결합해 현재 크라운 피해 배율을 계산하지 않는다. 같은 시점·레벨의 두 값이 확보되어야 배율을 복구할 수 있다. Three Musketeers 소환 총사의 HP 변경을 단일 Musketeer 카드에 자동 전파하지 않는 것도 같은 원칙이다.

## 3. 근거 상태를 읽는 방법

| evidence_status | 의미 | 값 처리 |
|---|---|---|
| `official_confirmed` | 지정한 공식 문서에서 확인 | 문서의 날짜·모드·레벨 범위에서만 사용 |
| `community_snapshot` | 공개 커뮤니티 데이터 파일에서 확인 | 스냅샷 ID와 고정 SHA를 함께 사용 |
| `derived` | 입력 사실과 명시된 식에서 계산 | 입력 버전과 계산식 추적 |
| `reproduction_design` | 재현 시스템을 위한 설계 제안 | 원작 내부 구조로 인용하지 않음 |
| `unverified` | 정보 부족·충돌·경계 미기재 | 값은 null 또는 명시적인 미확정 객체 |
| `custom_only` | Crownfall의 자체 규칙·카드 | 원작 테이블 집계에서 제외 |

공식 확인은 실제 계정에서 관찰했다는 뜻이 아니다. 또한 한 레코드 안의 일부 필드만 미확정일 수 있다. 예를 들어 공식 업그레이드 레시피의 카드 복제본 수는 알려져도 골드 칸이 비어 있으면 그 필드만 null을 유지한다. 레코드를 통째로 삭제하거나 옆 레벨에서 숫자를 추정하지 않는다.

## 4. 레코드 공통 계약

`record_id`는 이 묶음 안에서 고유한 연구용 식별자다. Supercell 내부 ID와 같다고 가정하지 않는다. 원작 공개 카드 ID는 `card_id`에 따로 기록한다. `system`과 `key`는 조회용이며, `value`는 숫자·불리언·문자열·객체·배열·null이 될 수 있다.

`source_ids`는 [출처 파일](data/sources/card_sources.json) 등의 source_id를 참조한다. `effective_from`은 적용 시작일을 확인했을 때만 채운다. 공지일과 적용일이 다르면 source의 `published_at`과 레코드의 적용일을 나눈다. `effective_to=null`은 종료일이 알려지지 않았다는 뜻이며 무기한 유효를 보장하지 않는다.

상한 0, 무제한, 해당 없음, 미확정은 다른 상태다. 모드 상한이 없다는 사실은 `kind=owned_uncapped` 같은 정책과 함께 표현한다. 보상 수량 0은 명시적으로 지급하지 않는다는 값이고, null은 수량을 확인하지 못했다는 값이다. 소비자는 `value || default`를 사용하면 안 되며 결측과 0을 따로 처리해야 한다.

## 5. 정확하게 보존한 불완전성

| 발견 | 처리 | 다음 확인 방법 |
|---|---|---|
| 역사 카드120행에 이벤트·숨김 자료 포함 | 가시성 별도 분류; 정규 카드 수로 사용 금지 | 해당 시점 정규 컬렉션 화면 또는 공식 API 스냅샷 대조 |
| 개체 이름이 없는 6행 | 행 번호를 보존하고 격리 | 추가 출처 확보 전 실행 정의에서 제외 |
| 10개 카드의 공개 key 연결 누락 | `missing_public_key` 유지 | 카드 정의·투사체 연결을 별도 근거로 확인 |
| 2026 전체 카드 프로필 부재 | 패치 필드만 별도 제공 | 같은 빌드·레벨의 카드별 정보 화면 기록 |
| 업그레이드·전환 표의 빈 구간 | null과 사유 기록 | 공식 정정 또는 실제 해당 계정 확인 |
| 시즌 공지와 상시 지원 문서 충돌 | 두 값·출처·범위를 보존 | 실제 시즌 클라이언트 실측 |
| 44개 상호작용 실험 | 전부 `observed=false` | [33번 계측 프로토콜](33_observation_protocol_and_reconstruction_backlog.md) 실행 |

누락을 잘 드러내는 데이터가 잘못 채워진 완전한 표보다 후속 구현에 유용하다. 결측이 남아 있어도 원작에 관한 여러 독립적인 사실을 정확하게 재구축할 수 있다.

## 6. 읽기와 실행 경로

기획 검토는 [24 전투](24_combat_rules_and_interaction_lab.md) → [25 형상·능력](25_card_forms_and_ability_contracts.md) → [26 성장·경제](26_progression_economy_reconstruction.md) → [27 모드·소셜](27_modes_matchmaking_social_contracts.md) → [28 Merge](28_merge_tactics_reconstructed_tables.md) 순서가 적합하다.

데이터를 사용할 개발자는 [29 사전](29_card_entity_level_dictionary.md), [30 패치·버전](30_patch_history_and_version_boundaries.md), [31 구현 차이](31_implementation_gap_matrix.md), [32 파이프라인](32_data_pipeline_and_validation.md)을 읽는다. JSON이 기준 데이터이고 CSV는 같은 행을 표 도구에서 읽기 쉽게 만든 파생 파일이다. 중첩 객체는 CSV 셀 안에서 JSON 문자열로 유지한다.

```bash
python scripts/rebuild.py
python scripts/validate.py
python scripts/query_data.py card minion-giant
python scripts/query_data.py card knight --scope archive-2023 --level 11
```

앞의 두 명령은 네트워크 없이 실행된다. `fetch_snapshot.py`만 고정된 역사 자료를 다시 받는 선택 기능이다. 실행 가능한 웹게임 v4.4.0은 별도 산출물이며 이번 연구 데이터가 게임 밸런스를 자동으로 덮어쓰지 않는다.
