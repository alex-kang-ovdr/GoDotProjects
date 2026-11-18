# 29. 카드·개체·레벨 데이터 사전

> **v4 추가 조사 안내:** 아래 본문과 개수는 해당 v2/v3 작성 당시의 범위를 설명한다. 현재 통합 자료, 추가 복원, 레벨 미기재 값의 처리와 실행 명령은 [39번 개요](39_research_reconstruction_v4_overview.md), [44번 근거 조정](44_sources_and_level_reconciliation.md), [최신 검증 보고서](reports/validation_report.md)를 기준으로 한다.

> 범위: RoyaleAPI 공개 자료의 2023-10-18 스냅샷. 한국어 이름·식별자·수치·참조를 재구축했다. 현재 원작 클라이언트와의 일치 보증은 아니다.

## 1. 한 카드와 한 개체를 같게 보지 않는다

카드는 손패에서 사용하는 배치·시전 명령이고, 개체는 그 명령이 만든 전투 대상이다. 여러 병사를 소환하는 카드, 죽으며 다른 병사를 만드는 개체, 주문 투사체, 지속 범위 효과, 버프를 서로 다른 정의로 다룬다. 카드 수와 개체 정의 수가 달라도 오류가 아니다.

이 묶음의 `card_catalog_2023`은 120행이다. `entity_definitions_2023`은 원본의 6개 범주를 그대로 유지한 532행이다. 특히 원본의 `troop`, `building`, `spell`이라는 그룹 이름을 현재 재현 엔진의 클래스 이름으로 바로 사용하지 않는다. 여러 종류의 병합 레코드와 시험용·이벤트용 정의가 포함되어 있다.

| 제공자 범주 | 행 수 | 소비 시 주의 |
|---|---:|---|
| troop | 93 | 카드 배치 정보 및 병합 정보가 포함될 수 있음 |
| building | 89 | 카드 건물뿐 아니라 타워·폭탄·특수 오브젝트 포함 |
| spell | 71 | 지속 효과와 주문 관련 정의 혼재 |
| projectile | 92 | 본체와 분리된 피해·이동·충돌 정보 |
| characters | 125 | 이름 없는 6행은 격리; 유효 유닛으로 만들지 않음 |
| character_buff | 62 | 피해 감소·가속·은신 등 조건 효과 |

## 2. 카드 카탈로그

파일: [JSON](data/tables/card_catalog_2023.json) / [CSV](data/tables/card_catalog_2023.csv).

| 필드 | 의미 | 사용 계약 |
|---|---|---|
| card_id | 공개 원본의 숫자 ID | 라이브 최신 API의 전체 목록이라고 가정하지 않음 |
| card_key | 공개 문자열 키 | 재구축 테이블 간 조회 키 |
| name_en / name_ko | 공개 영문·한국어 이름 | 한국어는 같은 SHA의 i18n 이름만 취득 |
| card_type / rarity / elixir | 스냅샷 메타데이터 | 비용 변경·종류 재편이 있었는지 별도 검토 |
| value.arena | 당시 공개 해금 아레나 | 현재 해금 조건으로 사용하지 않음 |
| value.evolved_spells_sc_key | 공개 진화 연결 문자열 | 비어 있다고 현재 진화가 없다고 단정하지 않음 |
| value.is_evolved | 제공자 원시 플래그 | 이 파일 전체가 false이므로 현행 진화 목록 생성에 부적합 |
| archive_visibility | 다른 공개 정의의 숨김·비활성 플래그로 분류 | 실제 컬렉션 접근성 확정값이 아님 |

가시성 분류는 visible 99행, hidden/event 10행, unverified 11행이다. unverified는 비정규 카드라는 뜻이 아니다. 예를 들어 카드에 해당하는 병합 정의에 가시성 필드가 없으면 정규 카드라도 미확정으로 남는다. 120에서 특정 분류를 빼서 현재 카드 수를 계산하지 않는다.

`description`의 긴 소개 문장, 게임 이미지·모델·음원, UI 에셋은 포함하지 않았다. 원본 JSON의 전체 복사본도 산출물에 포함하지 않고, 고정 URL·원본 해시·선별 사실 데이터 해시를 [manifest](data/snapshot_manifest.json)에 남겼다.

## 3. 개체 정의와 원시 단위

파일: [entity_definitions_2023.json](data/tables/entity_definitions_2023.json).

개체 ID는 `category:name`이다. `troop:Knight`와 `characters:Knight`는 같은 이름이어도 다른 레코드다. 이름 없는 행은 `__unnamed_행번호`라는 연구용 ID와 `quarantined=true`를 갖는다. 원작의 유효 개체명을 발명한 것이 아니다.

| 필드 묶음 | 대표 필드 | 해석 |
|---|---|---|
| 전력 | hitpoints, damage, shield_hitpoints | 기초값인지 효과 구성값인지 범주와 함께 해석 |
| 공격 | hit_speed, load_time, range, projectile | 반복 간격·첫 공격·거리·피해 전달 분리 |
| 탐지 | sight_range, target_only_buildings, attacks_air | 탐지 거리와 실제 공격 거리는 별개 |
| 배치 | summon_character, summon_number, summon_deploy_delay | 다중 소환과 각 개체 지연 분리 |
| 사망 | death_damage, death_spawn_character, death_spawn_count | 사망 사건의 후속 효과 |
| 변신 | morph_character, morph_target | 동일 HP 보존·타겟 유지 정책은 추가 검증 |
| 자원 | mana_generate_time_ms, mana_on_death_for_opponent | 생산·사망 지급이 누구의 자원인지 구분 |
| 버프 | damage_reduction, speed_multiplier, invisible | 의미·단위·중첩 정책의 추가 확인 필요 |

원시 `range=1200`, `speed=60`, `hit_speed=1200`을 동일한 단위 체계로 해석하지 않는다. 거리의 1000분할 또는 시간의 밀리초 해석이 관행과 잘 맞더라도 이번 정규화본은 모두 `provider_raw_units`를 보존한다. 구현용 변환은 별도 어댑터에서 근거와 교정 사례를 붙여 실행한다. 검증 없이 이동속도를 임의로 픽셀/초로 변환하지 않는다.

`summon_number=0`도 명확한 예외다. 0이 기본 한 개 소환을 뜻하는 센티널일 가능성이 있어도 재구축 단계에서는 1로 바꾸지 않는다. 원시값을 보존하고 효과적인 소환 개체 수를 별도 관측해야 한다.

## 4. 피해 0이 공격 불가라는 뜻은 아니다

공개 데이터의 Archer 본체는 `damage=0`이고 `projectile=ArcherArrow`를 참조한다. 실제 피해 관련 값은 별도 투사체에 있다. 본체의 0을 결측으로 바꾸거나 공격 불가로 분류하면 원거리 병력의 전력이 사라진다.

같은 이유로 카드 수준 DPS를 계산하려면 개체 수, 투사체 피해, 공격 주기, 연사 횟수, 타겟 수, 지속 효과와 사망 피해를 구분해야 한다. 이 묶음은 원본의 `dps_per_level`을 원시 사실 부분에 보존하되, 그것을 곧바로 카드 전력 지표로 내보내지 않는다. 투사체의 이동 관련 필드가 공격 간격과 같은 뜻인지 확인되지 않았기 때문이다.

재현 도구에서 단순 평타 DPS를 계산한다면 다음 입력을 모두 확정한 뒤 계산한다.

`single_target_sustained_dps = damage_per_successful_attack × successful_attacks_per_second`

첫 공격 지연, 투사체 비행 시간, 이동 시간, 사거리 진입, 보호막, 무적, 광역 적중 수는 위의 지속 DPS와 별도의 분석 축이다. 원작 전투 결과를 DPS 한 값으로 복원하지 않는다.

## 5. 레벨 배열 복구

파일: [level_stats_2023.json](data/tables/level_stats_2023.json) / [CSV](data/tables/level_stats_2023.csv).

4,956행은 제공자가 이미 계산해 공개한 HP·피해 배열을 긴 표로 펼친 결과다. 우리가 현재 레벨별 수치를 실측하거나 단순 10% 공식으로 새로 생성한 값이 아니다.

| 희귀도 | relative_level | 배열0의 표시 레벨 | 당시 정규 업그레이드 상한 |
|---|---:|---:|---:|
| Common | 0 | 1 | 15 |
| Rare | 2 | 3 | 15 |
| Epic | 5 | 6 | 15 |
| Legendary | 8 | 9 | 15 |
| Champion | 10 | 11 | 15 |
| Experimental | 8 | 9 | 16 — 시험 범주 그대로 보존 |

변환식은 `display_level = provider_array_index + relative_level + 1`이다. 희귀 카드의 배열8은 표시 레벨11이다. 희귀도를 무시하고 배열10을 모든 카드의 11레벨로 읽으면 잘못된 값을 얻게 된다.

배열에는 정규 성장 상한보다 높은 값이 포함된다. `within_archive_upgrade_range=false`로 표시해 보존하며, 그 레벨이 당시 실제 컬렉션에서 강화 가능했다는 뜻으로 해석하지 않는다. 레벨 증가 효과·시험용 수치·제공자 계산 범위 중 어떤 원인인지 개별 확인이 필요하다.

회귀 확인에는 Knight HP1766, Giant HP4091, FireballSpell 피해689의 **아카이브 표시 레벨11** 값이 사용된다. 이 숫자는 현재 2026 기본 밸런스의 추천값이 아니다.

## 6. 카드·개체 연결

[card_bindings_2023.json](data/tables/card_bindings_2023.json)은 같은 공개 `key`로 연결된 정의만 참조한다. 92개 카드는 단일 레코드, 18개는 복수 레코드, 10개는 연결 누락이다. 복수 연결은 모호해서 아무것도 못 쓴다는 뜻이 아니라 카드 정의와 유닛 정의 등 여러 범주가 함께 존재한다는 뜻이다.

누락 카드: Elixir Collector, Fireball, Arrows, Rocket, Goblin Barrel, Mirror, The Log, Barbarian Barrel, Giant Snowball, Party Rocket. 이름이 비슷한 투사체를 찾아 연결하는 방식은 이번 확정 테이블에 사용하지 않았다.

[entity_links_2023.json](data/tables/entity_links_2023.json)은 소환·투사체·버프·사망 소환 등428개 명시적 문자열 참조를 연결한다. 현재 선별 데이터에서는 모두 하나의 대상에 해석된다. 이 사실이 카드 루트의 누락까지 해결한다는 뜻은 아니다.

조회기는 방문 집합을 사용해 연결을 끝까지 탐색한다. 예를 들어 Super Lava Hound처럼 사망 소환이 여러 단계인 경우 고정3홉으로 제한하면 Lava Pup의 투사체 피해가 빠질 수 있으므로 깊이 제한을 제거했다. 순환 참조는 방문 집합으로 종료한다.

## 7. 후속 데이터 추가 기준

새로운 원작 프로필을 만들 때는 출처·패치·레벨·형상·소환 부위가 모두 같은 자료를 사용한다. 기존 행의 값을 덮어쓰기 전에 새 스냅샷 ID를 만들고 이전 결과와 차이를 낸다. 현재 아카이브는 학습·회귀·구조 이해에 유지하고, 실제 웹게임에 적용할 정규화된 카드 프로필은 별도 승인 가능한 버전으로 생성한다.

원문: [카드 카탈로그](https://royaleapi.github.io/cr-api-data/json/cards.json), [구성 수치](https://royaleapi.github.io/cr-api-data/json/cards_stats.json), [희귀도](https://royaleapi.github.io/cr-api-data/json/rarities.json). 재현 시에는 이동 가능한 master URL 대신 [manifest의 SHA 고정 URL](data/snapshot_manifest.json)을 사용한다.
