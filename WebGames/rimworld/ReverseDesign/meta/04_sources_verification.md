---
doc_id: META-04
title: 출처와 검증 범위
layer: meta
target_version: RimWorld PC 1.6 계열
research_date: 2026-11-13
status: 문헌 확인 기록
---

# 출처와 검증 범위

[전체 목차](../README.md) · [공통 양식](01_document_template.md) · [검증 계획](05_acceptance_tests.md)

## 1. 사용자가 제시한 자료의 처리

기준 URL은 [나무위키 — 림월드](https://namu.wiki/w/%EB%A6%BC%EC%9B%94%EB%93%9C)다. 조사 시 직접 열기가 실패하여 본문을 확인하지 못했다. 본 문서 묶음은 해당 페이지를 읽고 발췌하거나 문장 순서를 재구성한 결과가 아니다. 같은 제목의 비공식 미러는 최종 근거로 사용하지 않았다.

대신 게임 공식 소개, Ludeon의 개발·출시 공지, RimWorld Wiki의 개별 시스템 문서를 사용했다. 공식 소개로 기능의 존재와 DLC 경계를 확인하고, 구체적인 플레이 규칙은 커뮤니티 문헌을 보조 근거로 삼았다.

## 2. 근거 수준

| 등급 | 자료·상태 | 사용 방법 |
| --- | --- | --- |
| A | 공식 소개·출시·개발 공지 | 콘텐츠 범위, 버전 경계, 명시된 기능·변경 |
| B | 커뮤니티 Wiki의 구체적인 규칙 | 간접 확인으로 인용, 패치·예외·갱신 표시 확인 |
| C | 여러 규칙을 결합한 기획 분석 | `[해석]` 표시, 개발자 발언처럼 단정하지 않음 |
| D | 재구현용 상태·데이터·수식·테스트 | `[제안]` 표시, 원작 소스 구조와 구분 |
| U | 접근 실패·상수 미검증·자료 충돌 | `[미확인]` 또는 범위 제한, 확정값으로 사용하지 않음 |

`[확인]`은 A·B 문헌에서 확인했다는 뜻이다. 모든 세부 동작을 실제 PC 빌드에서 실행 확인했다는 뜻이 아니다. 공식 발표에 기재된 성능·호환도 직접 측정 또는 모든 구성의 보증으로 바꾸지 않았다.

## 3. 접근 방식과 버전 한계

- 조사일은 **2026-11-13**이다. 문서 자체의 게시일과 조사일을 혼동하지 않는다.
- 분석 대상은 **PC 1.6 계열**로 고정했다. 1.7 관련 공식 발표는 버전 경계 설명에만 사용했다.
- 일부 공식 블로그는 직접 열기에서 접근 제한이 발생했다. 해당 자료는 검색 서비스가 제공한 공식 도메인의 본문으로 확인했으며, 개별 문서에 이를 표시했다.
- 게임·DLC의 소개 글 중 발매 전 preview는 기능 구조의 근거다. 정확한 현재 상수·발매 후 예외는 별도 확인 대상으로 남겼다.
- Wiki의 `stub`, `verify`, `rewrite` 등 보완 표시가 있는 부분을 그대로 확정 수치로 복제하지 않았다.
- 라이브 서비스·설치 파일·게임 내부 코드를 읽지 않았다. 콘솔판·모드의 규칙도 기본 분석에 혼합하지 않았다.

## 4. 중요하게 보류한 항목

| 분야 | 확인하지 못한 내용 | 처리 |
| --- | --- | --- |
| 무드·정신 이상 | 패치별 정확한 발동 확률·선택 가중치 | 위험·발동 상태는 분리, 상수는 미확인 |
| 작업 | 실제 내부 선택 클래스·탐색·예약 자료구조 | 독립 설계 제안만 작성 |
| 공간·설비 | 방별 모든 효과·열전달·시설별 정밀 계수 | 관찰 가능한 기능을 우선 |
| 건강·전투 | 모든 수술 예외·특수 피해·다층 방어 조합 | 기본 구조와 예제 범위를 명시 |
| 사건 | 모든 스토리텔러별 주기·적응·난도 설정 조합 | 구조와 영향 요인을 설명 |
| 경제 | 전체 가격표·선물 환산·모집 성공식 | 시장가치·거래·관계 역할을 분리 |
| 상단 | 날씨·휴식·짐·부상 상태별 이동 상수 | 확정 수치 대신 조건과 예외 명시 |
| UI | 자료 간 다른 최고 가속 배율 | 특정 배율을 사양에 채택하지 않음 |
| DLC | 유전자 조합·격리·착륙·맵 보존의 모든 예외 | 각 DLC 마지막 절에 구체적으로 기록 |
| 엔진 | 실제 Tick·직렬화·스레드 경계 | 원작 구조라는 주장을 하지 않음 |

## 5. 문서별 출처를 읽는 방법

각 시스템의 `[S1]` 등은 그 파일 안에서만 유효하다. 아래 REF 번호는 전체 묶음에서 URL을 찾기 위한 색인이다. 서로 번호가 일치하지 않아도 오류가 아니다. 개별 주장과 근거의 대응은 해당 시스템 마지막 절과 규칙표에서 확인한다.

본문은 독자적으로 재작성한 설명이며, 외부 페이지의 대량 원문·원작 데이터·코드를 포함하지 않는다. 제안 데이터의 ID·상수·이벤트명은 실제 게임 파일에서 추출한 값이 아니다.

## 6. 통합 출처 색인

모든 항목은 2026-11-13에 본문 또는 검색 서비스의 본문 제공 결과를 확인했다. 링크가 이후 갱신되면 내용이 바뀔 수 있다.

개요와 23개 시스템·DLC 문서에 사용한 고유 출처 URL은 **86개**다. 나무위키 접근 실패 URL은 위에 별도로 기록했으며 이 수에 포함하지 않는다.

| 색인 | 출처 | 종류 | 사용 문서 |
| --- | --- | --- | --- |
| REF-001 | [RimWorld free update 1.1 and Royalty expansion released](https://ludeon.com/blog/2020/02/rimworld-free-update-1-1-and-royalty-expansion-released/) | 공식 | [DLC-01](../dlc/01_royalty.md) |
| REF-002 | [Update 1.1.2647 adds psychic meditation, new psycasts, and tons more](https://ludeon.com/blog/2020/05/update-may-2020/) | 공식 | [DLC-01](../dlc/01_royalty.md) |
| REF-003 | [Update 1.2 adds new quests, psycasts, gear, and more](https://ludeon.com/blog/2020/08/1-2-update-with-new-quests-psycasts-gear-and-more/) | 공식 | [DLC-01](../dlc/01_royalty.md) |
| REF-004 | [Announcing update 1.3 and the Ideology expansion](https://ludeon.com/blog/2021/07/announcing-update-1-3-and-the-ideology-expansion/) | 공식 | [DLC-02](../dlc/02_ideology.md) |
| REF-005 | [Ideology adds social roles and rituals](https://ludeon.com/blog/2021/07/ideology-adds-social-roles-and-rituals/) | 공식 | [DLC-02](../dlc/02_ideology.md) |
| REF-006 | [Update 1.3.3101 adds ideoligion development during play, and more](https://ludeon.com/blog/2021/08/update-1-3-3101-adds-ideoligion-development-during-play-and-more/) | 공식 | [DLC-02](../dlc/02_ideology.md) |
| REF-007 | [Biotech expansion announced! Update 1.4 on unstable branch](https://ludeon.com/blog/2022/10/biotech-expansion-announced-update-1-4-on-unstable-branch/) | 공식 | [DLC-03](../dlc/03_biotech.md) |
| REF-008 | [Biotech preview #1: Mechanitor infrastructure and labor mechs](https://ludeon.com/blog/2022/10/biotech-preview-1-mechanitor-infrastructure-and-labor-mechs/) | 공식 | [DLC-03](../dlc/03_biotech.md) |
| REF-009 | [Biotech preview #2: Combat mechanoids, pollution, and super-mechanoid bosses](https://ludeon.com/blog/2022/10/biotech-preview-2-combat-mechanoids-pollution-and-super-mechanoid-bosses/) | 공식 | [DLC-03](../dlc/03_biotech.md) |
| REF-010 | [Biotech preview #3: Reproduction, children, genetic modification, & release date](https://ludeon.com/blog/2022/10/biotech-preview-3-reproduction-children-genetic-modification-release-date/) | 공식 | [DLC-03](../dlc/03_biotech.md) |
| REF-011 | [Ludeon — Anomaly expansion and update 1.5 announced](https://ludeon.com/blog/2024/03/anomaly-expansion-and-update-1-5-announced/) | 공식 | [SYS-13](../systems/13_research_technology_progression.md), [DLC-04](../dlc/04_anomaly.md) |
| REF-012 | [Anomaly preview #2: Containment facilities, creatures, and release date](https://ludeon.com/blog/2024/03/anomaly-preview-2-containment-facilities-creatures-and-release-date/) | 공식 | [DLC-04](../dlc/04_anomaly.md) |
| REF-013 | [Anomaly preview #3: Cultists, hate chanters and rituals](https://ludeon.com/blog/2024/04/anomaly-preview-3-cultists-hate-chanters-and-rituals/) | 공식 | [DLC-04](../dlc/04_anomaly.md) |
| REF-014 | [New ambient horror setting and tribal Anomaly support](https://ludeon.com/blog/2024/05/new-ambient-horror-setting-and-tribal-anomaly-support/) | 공식 | [DLC-04](../dlc/04_anomaly.md) |
| REF-015 | [Announcing Odyssey and update 1.6!](https://ludeon.com/blog/2025/06/announcing-odyssey-and-update-1-6/) | 공식 | [SYS-05](../systems/05_building_rooms_zones.md), [SYS-17](../systems/17_ui_controls_feedback.md), [SYS-18](../systems/18_simulation_save_mods.md) |
| REF-016 | [Odyssey preview #2: Gravships and space](https://ludeon.com/blog/2025/06/odyssey-preview-2-gravships-and-space/) | 공식 | [DLC-05](../dlc/05_odyssey.md) |
| REF-017 | [Odyssey preview #3: Animals, training, and fishing](https://ludeon.com/blog/2025/07/odyssey-preview-3-animals-training-and-fishing/) | 공식 | [DLC-05](../dlc/05_odyssey.md) |
| REF-018 | [Odyssey preview #4: Quests, the mechhive endgame, drones, and more](https://ludeon.com/blog/2025/07/odyssey-preview-4-quests-the-mechhive-endgame-drones-and-more/) | 공식 | [DLC-05](../dlc/05_odyssey.md) |
| REF-019 | [Ludeon — Odyssey expansion is out now](https://ludeon.com/blog/2025/07/the-rimworld-odyssey-expansion-is-out-now/) | 공식 | [OVERVIEW](../00_overview.md), [SYS-18](../systems/18_simulation_save_mods.md), [DLC-05](../dlc/05_odyssey.md) |
| REF-020 | [Ludeon — Waylith Engine and Update 1.7 발표](https://ludeon.com/blog/2026/10/announcing-the-waylith-engine-and-update-1-7/) | 공식 | [OVERVIEW](../00_overview.md), [SYS-18](../systems/18_simulation_save_mods.md) |
| REF-021 | [RimWorld 공식 소개](https://rimworldgame.com/) | 공식 | [OVERVIEW](../00_overview.md), [SYS-01](../systems/01_world_map_environment.md), [SYS-02](../systems/02_colonists_skills_relationships.md), [SYS-12](../systems/12_storyteller_incidents_difficulty.md) |
| REF-022 | [RimWorld Anomaly Expansion Pack](https://rimworldgame.com/anomaly/) | 공식 | [DLC-04](../dlc/04_anomaly.md) |
| REF-023 | [RimWorld Biotech Expansion Pack](https://rimworldgame.com/biotech/) | 공식 | [DLC-03](../dlc/03_biotech.md) |
| REF-024 | [RimWorld Ideology Expansion Pack](https://rimworldgame.com/ideology/) | 공식 | [DLC-02](../dlc/02_ideology.md) |
| REF-025 | [RimWorld Odyssey Expansion Pack](https://rimworldgame.com/odyssey/) | 공식 | [DLC-05](../dlc/05_odyssey.md) |
| REF-026 | [RimWorld Royalty Expansion Pack](https://rimworldgame.com/royalty/) | 공식 | [DLC-01](../dlc/01_royalty.md) |
| REF-027 | [AI Storytellers](https://rimworldwiki.com/wiki/AI_Storytellers) | 커뮤니티 | [SYS-12](../systems/12_storyteller_incidents_difficulty.md) |
| REF-028 | [Allowed area](https://rimworldwiki.com/wiki/Allowed_area) | 커뮤니티 | [SYS-04](../systems/04_work_priorities_jobs.md), [SYS-05](../systems/05_building_rooms_zones.md) |
| REF-029 | [Animal husbandry](https://rimworldwiki.com/wiki/Animal_husbandry) | 커뮤니티 | [SYS-11](../systems/11_animals_taming_ranching.md) |
| REF-030 | [Animals](https://rimworldwiki.com/wiki/Animals) | 커뮤니티 | [SYS-11](../systems/11_animals_taming_ranching.md) |
| REF-031 | [Apparel](https://rimworldwiki.com/wiki/Apparel) | 커뮤니티 | [SYS-10](../systems/10_combat_defense_equipment.md) |
| REF-032 | [Bill](https://rimworldwiki.com/wiki/Bill) | 커뮤니티 | [SYS-07](../systems/07_food_agriculture_production.md) |
| REF-033 | [RimWorld Wiki — Camping](https://rimworldwiki.com/wiki/Camping) | 커뮤니티 | [SYS-15](../systems/15_caravans_world_travel.md) |
| REF-034 | [RimWorld Wiki — Caravan](https://rimworldwiki.com/wiki/Caravan) | 커뮤니티 | [SYS-15](../systems/15_caravans_world_travel.md) |
| REF-035 | [Combat](https://rimworldwiki.com/wiki/Combat) | 커뮤니티 | [SYS-10](../systems/10_combat_defense_equipment.md) |
| REF-036 | [RimWorld Wiki: Containment](https://www.rimworldwiki.com/wiki/Containment) | 커뮤니티 | [DLC-04](../dlc/04_anomaly.md) |
| REF-037 | [RimWorld Wiki — Controls](https://rimworldwiki.com/wiki/Controls) | 커뮤니티 | [SYS-17](../systems/17_ui_controls_feedback.md), [SYS-18](../systems/18_simulation_save_mods.md) |
| REF-038 | [Cover](https://rimworldwiki.com/wiki/Cover) | 커뮤니티 | [SYS-10](../systems/10_combat_defense_equipment.md) |
| REF-039 | [Deterioration](https://rimworldwiki.com/wiki/Deterioration) | 커뮤니티 | [SYS-06](../systems/06_items_storage_logistics.md) |
| REF-040 | [Disease](https://rimworldwiki.com/wiki/Disease) | 커뮤니티 | [SYS-09](../systems/09_health_medical_body.md) |
| REF-041 | [Doctoring](https://rimworldwiki.com/wiki/Doctoring) | 커뮤니티 | [SYS-09](../systems/09_health_medical_body.md) |
| REF-042 | [RimWorld Wiki — Endings](https://rimworldwiki.com/wiki/Endings) | 커뮤니티 | [SYS-16](../systems/16_quests_endings.md) |
| REF-043 | [Environment](https://rimworldwiki.com/wiki/Environment) | 커뮤니티 | [SYS-01](../systems/01_world_map_environment.md) |
| REF-044 | [Events](https://rimworldwiki.com/wiki/Events) | 커뮤니티 | [SYS-12](../systems/12_storyteller_incidents_difficulty.md) |
| REF-045 | [Events](https://rimworldwiki.com/wiki/Events#Zzztt) | 커뮤니티 | [SYS-08](../systems/08_power_temperature_fire.md) |
| REF-046 | [RimWorld Wiki — Factions](https://rimworldwiki.com/wiki/Factions) | 커뮤니티 | [SYS-14](../systems/14_factions_trade_prisoners.md) |
| REF-047 | [Fire](https://rimworldwiki.com/wiki/Fire) | 커뮤니티 | [SYS-08](../systems/08_power_temperature_fire.md) |
| REF-048 | [Food](https://rimworldwiki.com/wiki/Food) | 커뮤니티 | [SYS-07](../systems/07_food_agriculture_production.md) |
| REF-049 | [Food production](https://rimworldwiki.com/wiki/Food_production) | 커뮤니티 | [SYS-07](../systems/07_food_agriculture_production.md) |
| REF-050 | [RimWorld Wiki: Grav anchor](https://www.rimworldwiki.com/wiki/Gravanchor) | 커뮤니티 | [DLC-05](../dlc/05_odyssey.md) |
| REF-051 | [Health](https://rimworldwiki.com/wiki/Health) | 커뮤니티 | [SYS-09](../systems/09_health_medical_body.md) |
| REF-052 | [Injury](https://rimworldwiki.com/wiki/Injury) | 커뮤니티 | [SYS-09](../systems/09_health_medical_body.md) |
| REF-053 | [Market Value](https://rimworldwiki.com/wiki/Market_Value) | 커뮤니티 | [SYS-06](../systems/06_items_storage_logistics.md) |
| REF-054 | [Mental break](https://rimworldwiki.com/wiki/Mental_break) | 커뮤니티 | [SYS-03](../systems/03_needs_mood_mental_breaks.md) |
| REF-055 | [Menus — Schedule](https://rimworldwiki.com/wiki/Menus#Schedule) | 커뮤니티 | [SYS-04](../systems/04_work_priorities_jobs.md) |
| REF-056 | [Mood](https://rimworldwiki.com/wiki/Mood) | 커뮤니티 | [SYS-03](../systems/03_needs_mood_mental_breaks.md) |
| REF-057 | [Needs](https://rimworldwiki.com/wiki/Needs) | 커뮤니티 | [SYS-03](../systems/03_needs_mood_mental_breaks.md) |
| REF-058 | [Pen](https://rimworldwiki.com/wiki/Pen) | 커뮤니티 | [SYS-11](../systems/11_animals_taming_ranching.md) |
| REF-059 | [RimWorld Wiki: Permits](https://rimworldwiki.com/wiki/Permits) | 커뮤니티 | [DLC-01](../dlc/01_royalty.md) |
| REF-060 | [Plants](https://rimworldwiki.com/wiki/Plants) | 커뮤니티 | [SYS-07](../systems/07_food_agriculture_production.md) |
| REF-061 | [Power](https://rimworldwiki.com/wiki/Power) | 커뮤니티 | [SYS-08](../systems/08_power_temperature_fire.md) |
| REF-062 | [RimWorld Wiki — Prisoner](https://rimworldwiki.com/wiki/Prisoner) | 커뮤니티 | [SYS-14](../systems/14_factions_trade_prisoners.md) |
| REF-063 | [Quality](https://rimworldwiki.com/wiki/Quality) | 커뮤니티 | [SYS-07](../systems/07_food_agriculture_production.md) |
| REF-064 | [RimWorld Wiki — Quests](https://rimworldwiki.com/wiki/Quests) | 커뮤니티 | [SYS-16](../systems/16_quests_endings.md) |
| REF-065 | [Raid points](https://rimworldwiki.com/wiki/Raid_points) | 커뮤니티 | [SYS-12](../systems/12_storyteller_incidents_difficulty.md) |
| REF-066 | [Recreation](https://rimworldwiki.com/wiki/Recreation) | 커뮤니티 | [SYS-03](../systems/03_needs_mood_mental_breaks.md) |
| REF-067 | [RimWorld Wiki — Research](https://rimworldwiki.com/wiki/Research) | 커뮤니티 | [SYS-13](../systems/13_research_technology_progression.md) |
| REF-068 | [Roof](https://rimworldwiki.com/wiki/Roof) | 커뮤니티 | [SYS-05](../systems/05_building_rooms_zones.md) |
| REF-069 | [Rooms](https://rimworldwiki.com/wiki/Rooms) | 커뮤니티 | [SYS-05](../systems/05_building_rooms_zones.md) |
| REF-070 | [Scaria](https://rimworldwiki.com/wiki/Scaria) | 커뮤니티 | [SYS-09](../systems/09_health_medical_body.md) |
| REF-071 | [Shelf](https://rimworldwiki.com/wiki/Shelf) | 커뮤니티 | [SYS-06](../systems/06_items_storage_logistics.md) |
| REF-072 | [RimWorld Wiki — Ship](https://rimworldwiki.com/wiki/Ship) | 커뮤니티 | [SYS-16](../systems/16_quests_endings.md) |
| REF-073 | [Shooting Accuracy](https://rimworldwiki.com/wiki/Shooting_Accuracy) | 커뮤니티 | [SYS-10](../systems/10_combat_defense_equipment.md) |
| REF-074 | [Skills](https://rimworldwiki.com/wiki/Skills) | 커뮤니티 | [SYS-02](../systems/02_colonists_skills_relationships.md) |
| REF-075 | [Social](https://rimworldwiki.com/wiki/Social) | 커뮤니티 | [SYS-02](../systems/02_colonists_skills_relationships.md) |
| REF-076 | [Stockpile zone](https://rimworldwiki.com/wiki/Stockpile_zone) | 커뮤니티 | [SYS-06](../systems/06_items_storage_logistics.md) |
| REF-077 | [Structure](https://rimworldwiki.com/wiki/Structure) | 커뮤니티 | [SYS-05](../systems/05_building_rooms_zones.md) |
| REF-078 | [Temperature](https://rimworldwiki.com/wiki/Temperature) | 커뮤니티 | [SYS-08](../systems/08_power_temperature_fire.md) |
| REF-079 | [Thoughts](https://rimworldwiki.com/wiki/Thoughts) | 커뮤니티 | [SYS-03](../systems/03_needs_mood_mental_breaks.md) |
| REF-080 | [RimWorld Wiki — Trade](https://rimworldwiki.com/wiki/Trade) | 커뮤니티 | [SYS-14](../systems/14_factions_trade_prisoners.md) |
| REF-081 | [Traits](https://rimworldwiki.com/wiki/Traits) | 커뮤니티 | [SYS-02](../systems/02_colonists_skills_relationships.md) |
| REF-082 | [RimWorld Wiki — Transport pod](https://rimworldwiki.com/wiki/Transport_pod) | 커뮤니티 | [SYS-15](../systems/15_caravans_world_travel.md) |
| REF-083 | [RimWorld Wiki — User interface](https://rimworldwiki.com/wiki/User_interface) | 커뮤니티 | [SYS-17](../systems/17_ui_controls_feedback.md) |
| REF-084 | [Weapons](https://rimworldwiki.com/wiki/Weapons) | 커뮤니티 | [SYS-10](../systems/10_combat_defense_equipment.md) |
| REF-085 | [Work](https://rimworldwiki.com/wiki/Work) | 커뮤니티 | [SYS-04](../systems/04_work_priorities_jobs.md) |
| REF-086 | [World generation](https://rimworldwiki.com/wiki/World_generation) | 커뮤니티 | [SYS-01](../systems/01_world_map_environment.md) |
