# 27. 출처·버전·확인 범위

> **조사 기준일:** 2026-11-13  
> **문서 기준:** 공개 자료 기반 역기획. 특정 설치 빌드를 실행하거나 원작 데이터·소스 코드를 추출하지 않았다.  
> [전체 목차](00_README.md)

## 1. 사용자가 제공한 출발 자료

[나무위키 – Oxygen Not Included](https://namu.wiki/w/Oxygen%20Not%20Included)를 직접 열었으나 조사 환경에서 본문 접근이 되지 않았다. 따라서 해당 문서를 읽거나 전체 하위 문서를 검토했다고 주장하지 않는다. 검색에서 나타난 미러·요약 페이지를 원문 확인으로 대체하지 않았다.

주요 근거는 Klei 공식 제품 설명, 공식 지원 문서, 개발자 업데이트와 공식 Steam 공지로 구성했다. 기획 분석·수지 계산·상태 모델은 공개 사실을 바탕으로 독자적으로 작성했으며 특정 위키 문장을 재구성해 대량 번역하지 않았다.

## 2. 근거 수준과 해석 원칙

| 근거 유형 | 사용 범위 | 인정하지 않는 확대 해석 |
|---|---|---|
| 공식 제품·지원 문서 | 제품 기능·DLC의 구조·브랜치 성격 | 개별 건물의 모든 수치까지 검증되었다는 해석 |
| 공식 개발자 업데이트 | 게시 시점의 기능·수정·적용 모드 | 당시 버그와 수치를 영구적 규칙으로 취급 |
| 검색 색인에 노출된 공식 본문 | 명시적으로 표시된 해당 문장·항목 | 접근하지 못한 전체 본문을 읽은 것으로 취급 |
| 직접 플레이·실험 기록 | 당시 환경의 관찰 결과 | 개발자의 내부 사양 또는 최신 빌드 보증 |
| 기획적 분석 | 플레이어 선택과 기능 간 인과관계 | 공식적으로 발표된 개발 의도 |
| 재구현 제안 | 엔티티·데이터·알고리즘·시험 계획 | 원작 소스 코드 복원 |

일부 Klei 포럼은 검색 색인으로 공식 본문이 확인되지만 직접 열기는 제한되었다. 이 경우 확인 가능한 주장만 짧게 사용하고, 가능한 경우 공식 Steam 게시본을 함께 기록했다. 출처는 문서별 각주에서 주장 가까이에 배치했다.

## 3. 현재 문서에 영향을 준 주요 버전 경계

| 시점 | 문서에 반영한 경계 | 관련 문서 | 1차 근거 |
|---|---|---|---|
| 2025-11 정식 QoL | 방·생태·연구의 옛 규칙을 그대로 적용하지 않음 | 05, 12, 15, 19~21 | [700348 / 700386](https://kleiforums.com/forums/topic/168832-game-update-november-2025-quality-of-life-update-700348-700386/) |
| 2026-03 정식 수정 | 열·재배·연구 정보의 과거 설명을 재검토 | 06~08, 11, 15, 19~20 | [719533](https://kleiforums.com/game-updates/oni-alpha/719533-r2701) |
| 2026-06 Aquatic 출시 | 새 수중 콘텐츠와 공통 패치를 구별 | 09, 12, 22 | [공식 출시 공지](https://steamcommunity.com/games/457140/announcements/detail/686381746058429913) |
| 2026-10-29 공개테스트 시작 | 11월 QoL 예정 규칙을 안정판과 분리 | 03, 07, 12, 22, 23 | [761015](https://kleiforums.com/game-updates/oni-alpha/761015-r2830/page/2/) |

이 표는 모든 패치의 완전한 이력이 아니다. 이 문서 세트에서 오류를 만들기 쉬운 경계를 기록한 것이다. 정확한 현재 설치 버전은 게임의 빌드 정보로 확인해야 한다.

## 4. 상수와 알고리즘을 다룬 방법

### 4.1 확정하지 않은 것

- 모든 건물의 최신 전력·질량·온도·입출력 수치
- 물질별 비열·열전도율·상변화 임계값의 전수 목록
- 작업 선택의 내부 비교 순서와 동률 처리
- 질병별 최신 감염 임계값·확률·지속시간
- 모든 작물·생물의 성장·번식·수율과 공간 요구값
- 배관 합류 우선순위·극소 패킷 예외·내부 틱 처리
- 원작의 클래스 구조·자료구조·스레딩·저장 포맷

이 항목은 빠진 값을 추정으로 채우는 대신 각 시스템의 **[검증 필요]**와 [검증 계획](26_validation_rebuild_plan.md)으로 남겼다. 계산 예시에는 가정을 명시했으며 원작 확정값으로 쓰지 않았다.

### 4.2 확인을 위해 기록할 것

```text
규칙 식별자 / 대상 빌드 / 브랜치 / 규칙 모드 / DLC / 난이도 / 모드
자료 URL 또는 인게임 화면 / 초기 상태 / 변경한 입력 / 관측한 결과
원작 값인지 분석 가정인지 / 반복 여부 / 남은 불확실성
```

같은 값이라도 일반 복제체와 바이오닉, 기본 게임과 Spaced Out!, 안정판과 테스트를 구분해야 한다.

## 5. 대표 근거를 읽는 순서

| 목적 | 우선 자료 |
|---|---|
| 제품의 핵심 범위 | [Klei 게임 소개](https://www.klei.com/games/oxygen-not-included), [공식 Steam 소개](https://store.steampowered.com/app/457140/Oxygen_Not_Included/) |
| Spaced Out!의 구조 | [Klei 지원 설명](https://support.klei.com/hc/en-us/articles/360053456331-What-is-Oxygen-Not-Included-Spaced-Out) |
| 업데이트 적용 범위 | 각 문서가 인용한 개발자 공지의 날짜와 Base / All versions / Spaced Out! 구분 |
| 공개테스트의 의미 | [Klei Public Testing 안내](https://support.klei.com/hc/en-us/articles/4404626280852-Oxygen-Not-Included-How-to-access-the-Public-Testing-Branch) |
| 콘텐츠 팩의 기능 | [22번 DLC 매트릭스](22_dlc_content_matrix.md)의 개별 공식 제품 링크 |

## 6. 문서 검토와 실제 게임 시험

이 산출물에서 수행한 검토는 파일 구성, 문서 간 연결, 표·상태 모델의 일관성, 가정 계산의 산술과 단위, 공개 자료의 버전 구분이다. 실제 플레이로 모든 규칙을 실측한 것은 아니다. [26번](26_validation_rebuild_plan.md)은 향후 같은 조건에서 검증할 수 있도록 만든 시험 계획이다.

또한 세부 설명이 출처의 한 문장보다 길다고 해서 전부 그 출처에서 가져온 내용은 아니다. 입출력 분석, 병목 비교, 실패 연쇄, 데이터 스키마와 테스트는 별도 **[해석]** 또는 **[설계 제안]**이다.

## 7. 문서별 출처 통합 목록

아래 목록은 각 문서의 외부 링크를 중복 제거한 색인이다. 실제로 어떤 주장을 뒷받침하는지는 해당 문서의 각주 문맥을 따른다. 공식 도메인에 있는 이용자 게시물은 개발자 문서와 구분하며, 알려진 직접 관찰 자료는 별도 표시했다.

| ID | 출처 | 사용 문서 | 자료 성격 |
|---|---|---|---|
| S01 | [Klei 포럼: Suction Piping and Gravity Pumping](https://forums.kleientertainment.com/forums/topic/79436-suction-piping-and-gravity-pumping/) | [06](06_atmosphere_oxygen.md), [07](07_liquids_plumbing_sanitation.md) | 역사적 이용자 직접 관찰 |
| S02 | [Ranching Upgrade Mark II 266730](https://forums.kleientertainment.com/game-updates/oni-alpha/266730-r429/) | [12](12_ranching_ecosystems.md) | 공식 제품·지원 또는 개발자 자료 |
| S03 | [Klei — A Breath of Fresh Air, 471618, 2021-07-15](https://kleiforums.com/forums/topic/131854-a-breath-of-fresh-air-update-available-now-471618/) | [13](13_health_germs_suits.md) | 공식 제품·지원 또는 개발자 자료 |
| S04 | [Rocketry Renovation 476059](https://kleiforums.com/forums/topic/132992-game-update-rocketry-renovation-476059/) | [21](21_multicolony_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S05 | [Game Update 483944](https://kleiforums.com/forums/topic/134860-game-update-483944/) | [15](15_research_progression.md) | 공식 제품·지원 또는 개발자 자료 |
| S06 | [525812 – Sweet Dreams / Story Traits](https://kleiforums.com/forums/topic/143553-game-update-525812/) | [02](02_world_biomes_exploration.md) | 공식 제품·지원 또는 개발자 자료 |
| S07 | [Klei 공식 Hot Shots 개발 로그, 2022-12-15](https://kleiforums.com/forums/topic/145229-game-update-hot-shots-535720-535842/) | [18](18_geysers_hazards_renewables.md) | 공식 제품·지원 또는 개발자 자료 |
| S08 | [Klei 개발자 — 660272/660455, 2025-03](https://kleiforums.com/forums/topic/164873-game-update-660272-660455/) | [13](13_health_germs_suits.md) | 공식 제품·지원 또는 개발자 자료 |
| S09 | [Klei — November 2025 QoL, 700348/700386](https://kleiforums.com/forums/topic/168832-game-update-november-2025-quality-of-life-update-700348-700386/) | [05](05_construction_rooms_access.md), [12](12_ranching_ecosystems.md), [15](15_research_progression.md), [21](21_multicolony_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S10 | [Klei 포럼: Automation and Smart Battery Help](https://kleiforums.com/forums/topic/87794-automation-and-smart-battery-help/) | [09](09_power_networks.md) | 역사적 이용자 직접 관찰 |
| S11 | [Space Industry Upgrade 290148](https://kleiforums.com/forums/topic/96908-space-industry-upgrade-available-now-game-update-290148/) | [15](15_research_progression.md), [19](19_space_rocketry_base.md) | 공식 제품·지원 또는 개발자 자료 |
| S12 | [Occupational Upgrade 254439](https://kleiforums.com/game-updates/oni-alpha/254439-r375/) | [11](11_food_farming.md), [16](16_logistics_storage_conveyors.md) | 공식 제품·지원 또는 개발자 자료 |
| S13 | [Klei — Expressive Upgrade, 279457](https://kleiforums.com/game-updates/oni-alpha/279457-r525/) | [04](04_tasks_priorities_schedules.md), [14](14_morale_stress_decor.md) | 공식 제품·지원 또는 개발자 자료 |
| S14 | [Klei — QoL Mk III, 326232, 2019-04-16](https://kleiforums.com/game-updates/oni-alpha/326232-r734/) | [03](03_duplicants_attributes_skills.md), [04](04_tasks_priorities_schedules.md), [13](13_health_germs_suits.md), [14](14_morale_stress_decor.md) | 공식 제품·지원 또는 개발자 자료 |
| S15 | [Klei — Launch Upgrade, 346893, 2019-06-27](https://kleiforums.com/game-updates/oni-alpha/346893-r789) | [03](03_duplicants_attributes_skills.md) | 공식 제품·지원 또는 개발자 자료 |
| S16 | [Klei — 356355, 2019 출시 업데이트](https://kleiforums.com/game-updates/oni-alpha/356355-r847/) | [05](05_construction_rooms_access.md), [13](13_health_germs_suits.md), [23](23_ui_ux_information.md) | 공식 제품·지원 또는 개발자 자료 |
| S17 | [Klei — Recreation Content Pack, 381414, 2019](https://kleiforums.com/game-updates/oni-alpha/381414-r964/) | [14](14_morale_stress_decor.md) | 공식 제품·지원 또는 개발자 자료 |
| S18 | [481350 – Unexplained Traits](https://kleiforums.com/game-updates/oni-alpha/481350-r1677/) | [02](02_world_biomes_exploration.md) | 공식 제품·지원 또는 개발자 자료 |
| S19 | [Sweet Dreams 525812](https://kleiforums.com/game-updates/oni-alpha/525812-r1877/) | [12](12_ranching_ecosystems.md) | 공식 제품·지원 또는 개발자 자료 |
| S20 | [Klei — 643502, 2024-11-25](https://kleiforums.com/game-updates/oni-alpha/643502-r2427/) | [04](04_tasks_priorities_schedules.md) | 공식 제품·지원 또는 개발자 자료 |
| S21 | [Klei — Bionic Booster Pack 출시, 646687, 2024-12-12](https://kleiforums.com/game-updates/oni-alpha/646687-r2443) | [03](03_duplicants_attributes_skills.md), [14](14_morale_stress_decor.md), [23](23_ui_ux_information.md) | 공식 제품·지원 또는 개발자 자료 |
| S22 | [Klei — 648807, 2025-01-09](https://kleiforums.com/game-updates/oni-alpha/648807-r2455/) | [23](23_ui_ux_information.md) | 공식 제품·지원 또는 개발자 자료 |
| S23 | [March 2026 Bug Fix Update 719533](https://kleiforums.com/game-updates/oni-alpha/719533-r2701) | [11](11_food_farming.md), [12](12_ranching_ecosystems.md), [15](15_research_progression.md) | 공식 제품·지원 또는 개발자 자료 |
| S24 | [Klei — 761015, 2026-10-29 공개테스트](https://kleiforums.com/game-updates/oni-alpha/761015-r2830/page/2/) | [03](03_duplicants_attributes_skills.md), [07](07_liquids_plumbing_sanitation.md), [22](22_dlc_content_matrix.md), [23](23_ui_ux_information.md) | 공식 제품·지원 또는 개발자 자료 |
| S25 | [Spaced Out! 449549](https://kleiforums.com/game-updates/oni-so/449549-r1424/) | [13](13_health_germs_suits.md) | 공식 제품·지원 또는 개발자 자료 |
| S26 | [Radiation Update 455425](https://kleiforums.com/game-updates/oni-so/455425-r1482) | [20](20_radiation_nuclear_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S27 | [Spaced Out! 457903](https://kleiforums.com/game-updates/oni-so/457903-r1507/) | [21](21_multicolony_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S28 | [Spaced Out! 458389](https://kleiforums.com/game-updates/oni-so/458389-r1509/) | [21](21_multicolony_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S29 | [Peculiar Plants 463874](https://kleiforums.com/game-updates/oni-so/463874-r1546/) | [11](11_food_farming.md), [16](16_logistics_storage_conveyors.md), [20](20_radiation_nuclear_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S30 | [공식 Steam 공지 목록 — March 2026 Bug Fix Update, 2026-03-31](https://steamcommunity.com/app/457140/announcements/) | [06](06_atmosphere_oxygen.md), [08](08_temperature_phase_change.md) | 공식 제품·지원 또는 개발자 자료 |
| S31 | [Agricultural Upgrade & Early Access](https://steamcommunity.com/app/457140/discussions/4/1471969431584062835/) | [11](11_food_farming.md) | 공식 제품·지원 또는 개발자 자료 |
| S32 | [공식 Update Log — Ranching Upgrade Mark I, 2018-03-22](https://steamcommunity.com/app/457140/discussions/4/1694920442947303381/) | [04](04_tasks_priorities_schedules.md), [23](23_ui_ux_information.md) | 공식 제품·지원 또는 개발자 자료 |
| S33 | [공식 Aquatic 출시·무료 업데이트 공지, 2026-06-11](https://steamcommunity.com/games/457140/announcements/detail/686381746058429913) | [09](09_power_networks.md), [22](22_dlc_content_matrix.md) | 공식 제품·지원 또는 개발자 자료 |
| S34 | [Spaced Out! 공식 Steam 설명](https://store.steampowered.com/app/1452490/Oxygen_Not_Included__Spaced_Out/) | [20](20_radiation_nuclear_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S35 | [Frosty Planet Pack 공식 Steam 페이지](https://store.steampowered.com/app/2952300/Oxygen_Not_Included_The_Frosty_Planet_Pack/) | [22](22_dlc_content_matrix.md) | 공식 제품·지원 또는 개발자 자료 |
| S36 | [Bionic Booster Pack 공식 Steam 페이지](https://store.steampowered.com/app/3302470/Oxygen_Not_Included_The_Bionic_Booster_Pack/) | [22](22_dlc_content_matrix.md) | 공식 제품·지원 또는 개발자 자료 |
| S37 | [Prehistoric Planet Pack 공식 Steam 페이지](https://store.steampowered.com/app/3655420/Oxygen_Not_Included_The_Prehistoric_Planet_Pack/) | [22](22_dlc_content_matrix.md) | 공식 제품·지원 또는 개발자 자료 |
| S38 | [Aquatic Planet Pack 공식 Steam 페이지](https://store.steampowered.com/app/4310080/Oxygen_Not_Included_The_Aquatic_Planet_Pack/) | [22](22_dlc_content_matrix.md) | 공식 제품·지원 또는 개발자 자료 |
| S39 | [Oxygen Not Included](https://store.steampowered.com/app/457140/Oxygen_Not_Included/) | [01](01_overview_core_loop.md), [02](02_world_biomes_exploration.md), [25](25_data_model_reconstruction.md) | 공식 제품·지원 또는 개발자 자료 |
| S40 | [November 2025 QoL 공식 Steam 공지 묶음](https://store.steampowered.com/news/posts/?appgroupname=Oxygen+Not+Included&appids=457140&enddate=1768254000&feed=steam_community_announcements) | [20](20_radiation_nuclear_spaced_out.md) | 공식 제품·지원 또는 개발자 자료 |
| S41 | [공식 Oil Upgrade 발표](https://store.steampowered.com/news/posts/?appids=457140&enddate=1510271099) | [09](09_power_networks.md), [10](10_materials_industry.md) | 공식 제품·지원 또는 개발자 자료 |
| S42 | [공식 Automation Upgrade 발표, 2017-11-16](https://store.steampowered.com/news/posts/?appids=457140&enddate=1517595794&feed=steam_community_announcements) | [17](17_automation.md) | 공식 제품·지원 또는 개발자 자료 |
| S43 | [공식 Steam 공지 — Game Update 535720, Hot Shots, 2022-12-15](https://store.steampowered.com/news/posts/?appids=457140&enddate=1686352137&feed=steam_community_announcements) | [08](08_temperature_phase_change.md), [18](18_geysers_hazards_renewables.md) | 공식 제품·지원 또는 개발자 자료 |
| S44 | [공식 Steam 공지 모음](https://store.steampowered.com/news/posts/?appids=457140&enddate=1751493046&feed=steam_community_announcements) | [13](13_health_germs_suits.md) | 공식 제품·지원 또는 개발자 자료 |
| S45 | [Klei Steam 개발자 공지 모음 — 2025년 11~12월 핫픽스](https://store.steampowered.com/news/posts/?appids=457140&enddate=1768593671&feed=steam_community_announcements) | [04](04_tasks_priorities_schedules.md), [05](05_construction_rooms_access.md) | 공식 제품·지원 또는 개발자 자료 |
| S46 | [What is Oxygen Not Included – Spaced Out?](https://support.klei.com/hc/en-us/articles/360053456331-What-is-Oxygen-Not-Included-Spaced-Out) | [01](01_overview_core_loop.md), [02](02_world_biomes_exploration.md), [15](15_research_progression.md), [19](19_space_rocketry_base.md), [21](21_multicolony_spaced_out.md), [22](22_dlc_content_matrix.md) | 공식 제품·지원 또는 개발자 자료 |
| S47 | [How to access the Public Testing Branch](https://support.klei.com/hc/en-us/articles/4404626280852-Oxygen-Not-Included-How-to-access-the-Public-Testing-Branch) | [26](26_validation_rebuild_plan.md) | 공식 제품·지원 또는 개발자 자료 |
| S48 | [Klei 공식 게임 소개](https://www.klei.com/games/oxygen-not-included) | [06](06_atmosphere_oxygen.md), [22](22_dlc_content_matrix.md), [24](24_balance_failure_scenarios.md) | 공식 제품·지원 또는 개발자 자료 |

