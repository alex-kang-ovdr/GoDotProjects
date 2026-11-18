# 30. 패치 이력과 규칙 버전 경계

> **v4 추가 조사 안내:** 아래 본문과 개수는 해당 v2/v3 작성 당시의 범위를 설명한다. 현재 통합 자료, 추가 복원, 레벨 미기재 값의 처리와 실행 명령은 [39번 개요](39_research_reconstruction_v4_overview.md), [44번 근거 조정](44_sources_and_level_reconciliation.md), [최신 검증 보고서](reports/validation_report.md)를 기준으로 한다.

> 기준: 2026-11-17 · 이 문서는 공개 패치에서 확인한 필드를 추적하는 재구축 설계다. 전체 실게임 빌드 데이터의 복제본이 아니다.

## 1. 날짜 하나로 모든 수치를 묶지 않는다

같은 페이지에 최초 공지, 중간 수정, 다음 적용일의 변경이 함께 들어갈 수 있다. 검색 결과의 게시 날짜, 웹 페이지 URL의 연도, 문서 본문의 적용일은 각각 다른 데이터다. 이 묶음은 공식 본문에 적힌 변경 절을 기준으로 수치 적용 시점을 분리했다.

| 자료 | 본문·표시 시점 | 수치 처리 |
|---|---|---|
| RoyaleAPI 고정 SHA | 2023-10-18 커밋 | 역사 스냅샷으로 고정 |
| September Balance Changes | 상단2026-09-23, 변경 절09-08/09-16 | 절별 effective_from 사용 |
| October Balance Changes | 상단2026-10-06, 변경 절10-06/10-19 | 중간 추가된10-19를 별도 변경으로 기록 |
| New Season: King vs. King! | 2026-10-27 공지 | 시즌 기능·버그 수정; 명확하지 않은 적용일은 null |
| 상시 지원 문서 | 조회2026-11-17 | 게시·수정일이 없으면 조회 시점만 보존 |

9월 공식 영어 URL에 `2027`이 포함되어 있어도 [본문](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/)은 2026년이다. URL의 숫자로 적용 연도를 추출하는 크롤러는 이 사례에서 잘못된 미래 규칙을 만든다.

## 2. 패치 원장의 식별 단위

파일: [balance_patch_ledger_2026.json](data/tables/balance_patch_ledger_2026.json) / [CSV](data/tables/balance_patch_ledger_2026.csv).

한 변경의 정체성은 다음 조합으로 정한다.

`card_key + form + component + key + reference_level`

예를 들어 `wizard / base / unit / damage / 11`과 `wizard / evolution / shield / hitpoints / 11`은 다른 값이다. `void / base / two_to_four_targets / damage_per_hit / 11`도 다른 타겟 수 분기와 합치지 않는다. 카드 이름과 필드만으로 키를 만들면 형태·소환물·타겟 분기의 데이터가 서로 덮어써진다.

| 필드 | 계약 |
|---|---|
| before / after | 공지에 있는 변경 전·후 값. 이전값 미기재는 null |
| value | after와 같은 조회용 값 |
| reference_level | HP·피해의 공지 기준 레벨. 시간·거리·비율은 null |
| form | base, evolution, hero, ground, air 등 해당 범위 |
| component | 본체·투사체·방패·능력·사망 효과 등 적용 부위 |
| effective_from | 본문에 명시된 적용일 |
| source_ids | 정확한 공식 페이지와 연결 |

거리·시간은 공식 본문에서 단위가 명시된 경우 tiles·seconds로 입력한다. 이 단위는 2023 공개 원시 필드의 `provider_raw_units`와 다르다. 비교 단계에서 같은 이름만 보고 단위를 통합하지 않는다.

## 3. 최신 필드 조회의 의미

파일: [verified_patch_fields_2026.json](data/tables/verified_patch_fields_2026.json).

61개 변경 행에서 동일한 식별 조합의 마지막 변경만 선택해60행을 만든다. Minion Giant의 피해는9월168에서10월153으로 바뀌므로 해당 조합에 대해 후자가 선택된다. 이 파일의 ‘최신’은 **제공된 원장 안에서 최신**이라는 뜻이다. 모든 과거 패치·임시 조정·서버 수정이 포함되었다는 뜻이 아니다.

각 행에는 `lineage_patch_id`, `verification_scope=latest_in_supplied_patch_ledger_only`, `full_current_card_profile=false`가 있다. 원장을 조회한 소비자는 미기재 필드를 null로 유지하고 완전한 카드 생성 요청을 거절할 수 있어야 한다.

```bash
python scripts/query_data.py card minion-giant
python scripts/query_data.py card fireball --level 11
python scripts/query_data.py card knight
```

세 번째 조회에서 HP 목록이 비어 있는 것은 Knight의 HP가0이라는 뜻이 아니다. 이 패치 묶음에 해당 수치가 없다는 뜻이다. 기본 조회에 2023 수치로 되돌아가는 폴백은 없다.

## 4. 수치와 규칙의 호환성을 함께 본다

카드 평타 수치가 같더라도 전투 규칙 버전이 다르면 결과가 달라질 수 있다. 손패 순환, 능력 사용 횟수, 진화 슬롯, 레벨 상한, 소환 타이밍이 대표적이다. 따라서 재현 프로필은 다음 요소를 함께 고정해야 한다.

| 버전 축 | 필요한 내용 | 누락 시 결과 |
|---|---|---|
| 콘텐츠 | 카드·형상·개체 관계 | 신규 카드나 사망 소환 누락 |
| 수치 | 레벨별 HP·피해·시간·거리 | 타수 임계·유인 범위 변화 |
| 전투 규칙 | 회전·능력 소유·승패·효과 순서 | 같은 입력에도 다른 전개 |
| 모드 | 덱 수·금지·레벨 정책·배수 | 비교 대상의 조건 불일치 |
| 성장 | 해금·비용·전환 | 같은 소유 상태의 전투 전력 차이 |
| 실행 | 좌표·시간 단위·시뮬레이션 버전 | 저장·리플레이 재현 실패 |

최신 능력 사용 정책을 적용하면서 오래된 재사용 대기시간을 일반 Hero의 현행 필드로 남기지 않는다. 과거 능력을 재현하는 모드가 필요하면 `historical` 프로필에서 별도로 선택하도록 한다. 관련 확인 내용은 [25번](25_card_forms_and_ability_contracts.md)에 있다.

## 5. 효과적인 수치 계산 순서 — 재현 설계

다음은 엔진을 만들 때 사용할 수 있는 제안이며 원작 내부 함수 순서가 아니다.

1. 모드와 콘텐츠 버전을 선택하고 덱의 형상 자격을 검사한다.
2. 모드별 소유 레벨·고정 레벨·상한 정책을 계산한다.
3. 카드의 배치 효과를 개체·투사체·버프 정의에 연결한다.
4. 해당 레벨의 확정 수치 프로필을 찾는다.
5. 전투 중 변신·레벨 증가·일시 버프를 별도 인스턴스로 적용한다.
6. 이벤트 로그에 프로필 ID와 변경 원인을 기록한다.

Mirror의 +1레벨과 모드 상한, 전투 부스트가 어느 순서로 적용되는지는 이번에 완전하게 확인하지 못했다. 따라서 위 순서를 원작의 정답으로 채택하지 않고 [계측 작업](33_observation_protocol_and_reconstruction_backlog.md)으로 남긴다.

## 6. 공식 문서가 충돌할 때

문서의 우선순위는 모든 경우에 ‘더 최근에 열어본 문서’로 정하지 않는다. 날짜가 없는 지원 문서가 오래된 내용을 유지할 수 있고, 패치가 특정 시즌·모드에만 적용될 수 있기 때문이다. 다음 정보를 함께 비교한다.

- 적용 대상이 같은 모드·시즌·형상인지.
- 실제 적용일인지 단순 공지일인지.
- 원문이 구버전 설명을 과거형으로 제시했는지.
- 계정별 실험 또는 단계 배포가 명시되었는지.
- 공식 표에서 행이나 열이 생략되었는지.

충돌이 해결되지 않으면 두 레코드를 유지한다. Merge Tactics의 수입4/5처럼 값 자체가 다른 경우 `conflict_group`과 조건을 남긴다. 지원 문서에 미기재된 카드 수60 경계처럼 양쪽 구간 사이가 빠진 경우 새로운 중간값을 발명하지 않는다.

## 7. 변경 영향 검토와 저장 호환

후속 구현에서 패치를 반영할 때는 행의 숫자뿐 아니라 그 숫자를 소비하는 모든 시스템을 점검한다. 범위가 바뀌면 배치 미리보기·타겟 탐색·공격 판정·디테일 UI가 같은 프로필을 사용해야 한다. 소환 수가 바뀌면 개체 생성·통계·엘릭서 효율·리플레이 검증을 확인한다.

저장된 전투에는 당시 콘텐츠 해시와 규칙 버전을 기록하는 편이 안전하다. 새 수치를 과거 리플레이에 자동 적용하면 입력 기록은 같아도 전투 결과가 달라진다. Crownfall의 기존 저장 호환 정책을 원작의 내부 리플레이 형식으로 설명하지 않는다.

이번 배포는 연구 자료·정규화 데이터의 변경이다. 실제 웹게임의 규칙 버전4나 플레이 데이터는 변경하지 않았다. 원작 수치를 적용하는 다음 구현에서는 별도 프로필과 변환 검증을 먼저 마련해야 한다.

## 근거

- [9월 공식 밸런스](https://supercell.com/en/games/clashroyale/blog/release-notes/september-balance-changes-2027/)
- [10월 공식 밸런스](https://supercell.com/en/games/clashroyale/blog/release-notes/october-balance-changes-2026/)
- [11월 시즌 공지](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-king-vs-king/)
- [전체 출처 레코드](data/sources/card_sources.json)
