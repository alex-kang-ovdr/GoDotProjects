# 90. 통합 출처·사실 점검·추가 검증 목록

> 확인일: **2026-11-13**. 본 문서는 근거의 성격과 한계를 공개하고, 구현 전에 다시 확인할 항목을 추적한다.

## 1. 조사 방식

공식 Steam 제품 설명과 Subset Games의 소개·FAQ·개발자 기록으로 제품 범위와 핵심 구조를 확인했다. 세부 수치와 예외는 FTL 커뮤니티 위키의 개별 메커니즘·종족·함선 페이지, 일부 직접 실험 기반 플레이 자료와 교차 비교했다.

제공된 [나무위키 FTL 문서](https://namu.wiki/w/FTL:%20Faster%20Than%20Light)는 본문 직접 열기에 실패했으므로 그 내용을 확인한 근거로 사용하지 않았다. Fandom의 여러 페이지도 직접 열기가 제한되어 **검색 도구가 제공한 색인 본문·표**로 확인했다. 출처 URL을 적었다는 것만으로 원문 전체를 열람했다는 뜻은 아니다.

원작 실행 파일, 개발사 내부 기획서, 원본 소스 코드는 확인하지 않았다. 실제 게임을 실행해 시간·확률·픽셀을 계측한 작업도 아니다. 따라서 이 문서 묶음에서 “확인”은 기본적으로 **공개 문헌으로 확인**했다는 의미다.

## 2. 근거의 우선순위

| 종류 | 채택 범위 | 주의점 |
|---|---|---|
| 공식 제품 설명 | 일시정지·승무원 명령·전력·무작위 런·영구 사망·AE의 성격 | 개별 수치까지 설명하는 자료는 아님 |
| 개발자 작성 글·패치노트 | 기능 의도·수정 이력·입력 정책 | 과거 수정 기록을 현재 버그로 표현하지 않음 |
| 커뮤니티 규칙 문서 | 수치·조건·예외 | 빌드·편집 시점·문서 간 불일치 검사 |
| 직접 플레이·실험 자료 | AI·레이아웃·특수 사례 교차 확인 | 난이도·버전·저자의 관찰 범위 유지 |
| 이 역기획서의 분석 | 기획 의도·실제 운용 비용·구조적 설명 | 개발자의 공식 의도로 인용하지 않음 |
| 이 역기획서의 재구성안 | JSON·상태 기계·저장·알고리즘·도구 | 원작 내부 구조로 오인하지 않음 |

공식 포럼에 올라온 글도 작성자가 일반 사용자면 개발사 공식 명세가 아니다. 또한 서로 다른 URL이 같은 위키 문서의 페이지 분할인 경우 독립적인 근거 두 개로 세지 않는다.

## 3. 주요 사실 대조

다음은 상세 문서의 기준을 요약한 표다. 모든 수치의 전체 목록이 아니며 적용 조건은 해당 문서를 우선한다.

| 항목 | 채택한 기준 | 상세 문서·근거 |
|---|---|---|
| 게임 진행 | PC판 본편 + AE, 단일 플레이어의 런 | [00](00_scope_evidence_and_glossary.md), 공식 제품 설명·FAQ |
| 항해 계층 | 표준 1~8섹터, 마지막 섹터는 특수 규칙 | [02](02_sector_map_navigation_pursuit.md), Sectors |
| 시간 축 | 전투 시간과 항해 턴을 분리 | [01](01_core_loop_run_state.md), Beacons·Rebel Fleet |
| 상점 기준가 | 연료 3, 미사일 6, 드론 부품 8 스크랩 | [04](04_economy_shops_and_progression.md), Stores and resources |
| 선체 수리 | 섹터 1~3/4~6/7~8에서 1점당 2/3/4 스크랩 | [04](04_economy_shops_and_progression.md), Stores and resources |
| 승무원 | 최대 8명, AE 포함 8종족 | [10](10_crew_species_and_training.md), Crew·종족별 문서 |
| 함선 | 10함종, 기본 8함종 A/B/C + Crystal·Lanius A/B = 28레이아웃 | [14](14_ships_loadouts_and_unlocks.md), Ship·함종별 문서 |
| 일반 실드와 특수 실드 | 일반 실드의 층과 졸탄 실드의 HP는 다른 방어 구조 | [08](08_weapons_shields_and_targeting.md), Shields·Zoltan Shield |
| 의료 기능 | 의료실과 클론실은 상호 배타적이며 교체가 가능 | [13](13_advanced_edition_systems.md), Clone Bay·Systems |
| 시스템 한도 | 주요 시스템 8, 서브시스템은 별도 | [06](06_power_systems_and_subsystems.md), Systems |
| 강화장치 | 3개, 일반 화물칸에 보관 불가 | [09](09_drones_and_augments.md), Augmentations |
| 엔진 숙련 | 엔진 운용과 숙련은 FTL 충전에 영향. 조종 숙련의 회피 보너스와 구분 | [06](06_power_systems_and_subsystems.md), [10](10_crew_species_and_training.md), Engines·Crew skills·Piloting |
| C형 해금 | AE on + 대응 B형으로 섹터 8 도달, 최종 승리 조건과 구분 | [14](14_ships_loadouts_and_unlocks.md), Ship |
| 반군 기함 | 3단계, 선체 20/22/20. 마지막 특수 실드는 12 HP 채택 | [16](16_rebel_flagship.md), 기함·특수 실드·FAQ 대조 |
| 시작 스크랩 | Easy 30 / Normal 10 / Hard 0 | [18](18_balance_difficulty_and_rng.md), Score |
| QA 상태 | 통합 64개는 미실행 검증 계획 | [21](21_qa_and_acceptance_tests.md) |

## 4. 충돌·오해 가능성이 큰 항목

### 4.1 화재의 승무원 피해율

커뮤니티 `Boarding`과 `Fires`에 각각 1.2 HP/s와 2.128 HP/s가 제시되어 있다. **어느 값도 확정 상수로 채택하지 않았다.** 평균을 내거나 정확한 원작 값처럼 선택하지 않고 [12번](12_atmosphere_fire_breach_repair.md)과 QA O-01에 관찰 항목으로 남겼다.

### 4.2 기함의 마지막 특수 실드

일부 오래된 공략의 10 HP 표기와 개별 위키·다른 FAQ의 12 HP가 달랐다. 이번 문서는 개별 특수 실드 항목과 기함 자료를 대조해 **12 HP**를 채택했고, [16번](16_rebel_flagship.md)에 채택·배제한 근거를 모두 기록했다. 특정 빌드의 완전 재현에서는 실행 결과로 최종 고정한다.

### 4.3 FTL 충전 표시와 실제 효과

엔진 운용·숙련·가동 레벨은 FTL 충전에 영향을 주지만 공개 문헌은 인게임 충전 보너스 표시의 부정확성을 지적한다. 이를 근거로 “숙련은 충전에 영향이 없다”라고 바꾸지 않았으며, 실제 계수 전체를 역산한 확정 공식도 싣지 않았다.

### 4.4 해킹 지속시간과 실드 제거량

해킹 펄스 시간은 정리했지만 1레벨의 4초를 언제나 정확히 두 층 제거와 동일시하지 않았다. 경계 프레임, 펄스 시작 시점, 초기 실드 상태를 확인해야 한다. [13번](13_advanced_edition_systems.md)

### 4.5 충전 시간 감소와 속도 증가

무기 운용의 충전 시간 보너스와 Automated Re-loader의 재장전 속도 증가는 같은 산술 연산이 아니다. 문서에서는 각각의 의미를 구분한다. 같은 “10%”라도 곱하는 대상이 다르면 결과가 달라진다. [09번](09_drones_and_augments.md)

### 4.6 적 데이터의 난이도 범위

Mike Hopley의 적 레이아웃 자료는 Hard 기준이다. 해당 수치를 모든 난이도의 고정값으로 확장하지 않는다. AI 확률과 우선순위도 공개 실험의 범위를 표시하고, 원본 코드가 확인된 것처럼 쓰지 않았다. [15번](15_enemy_generation_and_ai.md)

### 4.7 출처로 채택하지 않은 범위

Multiverse·Captain's Edition 등 모드의 수치와 이벤트는 본편의 근거로 사용하지 않았다. 검색 중 발견한 파생 재구현 저장소는 일부 종족·장비 설명에 혼동이 있어 확정 근거로 채택하지 않았다. 과거 버그·초기 AE 설명·현재 규칙이 섞이지 않도록 출시 전 제안과 실제 제공 조건을 분리했다.

## 5. 실행 비교가 필요한 항목

| 우선순위 | 항목 | 고정할 실험 조건 | 산출할 결과 |
|---|---|---|---|
| 높음 | 화재·질식 피해의 정확한 주기 | 버전·FPS·종족·위험원·타일 위치 | 시간별 HP 기록 |
| 높음 | 실드 충전과 탄착 동시성 | 무기·초기 충전·일시정지 해제 시점 | 판정 순서·허용 오차 |
| 높음 | 무기 탈락·졸탄·배터리 | 슬롯 순서·공급원·손상·이온 | 실제 전력 장부와 충전 상태 |
| 높음 | 클론실 생존·큐 소실 | 사망 시점·전원·손상·보호 장비 | 부활 또는 영구 손실 조건 |
| 높음 | 기함 전환·철수 | 페이즈·적 생존 인원·분리 구역 | 유지·초기화 상태 목록 |
| 중간 | 환경별 추격 적용 시점 | 출발·도착 성운, 이벤트 지연 | 지도 전진값과 적용 순서 |
| 중간 | 적 AI 표적 분포 | 난이도·함선 구조·시스템 상태 | 빈도·표본 수·신뢰구간 |
| 중간 | 이벤트 조건의 보유 판정 | 화물칸·설치·전원·손상·인원 위치 | 선택지 가용 조건 |
| 중간 | 상점·이벤트 저장 확정 시점 | 진입·선택·구매 전후 저장 | 재추첨 여부·중복 보상 유무 |
| 중간 | 전체 장비·초기 구성 | 특정 게임 빌드·AE 옵션 | 검증한 원본 데이터 표 |
| 낮음 | 플랫폼별 UI 차이 | PC·iPad, 해상도·입력 방식 | 입력·피드백 차이 |

우선순위는 **이번 재구현 분석을 위한 제안**이다. 원작의 결함 심각도나 개발사의 공식 우선순위를 뜻하지 않는다.

## 6. 문서 검증의 의미

문서 수준 검증은 Markdown 파일 존재·내부 링크·코드 펜스·JSON 예시·QA ID·ZIP 무결성을 대상으로 한다. 이 작업으로 게임 규칙의 모든 예외를 실행 검증하거나 재구현 게임의 테스트를 통과한 것으로 표현하지 않는다.

| 수행한 검사 | 결과 |
|---|---|
| Markdown 파일 구성 | 24개, 00~21·90·README 모두 존재 |
| 내부 파일 링크 | 262개 참조의 대상 파일 존재 확인 |
| 코드 펜스·표 구조 | 닫히지 않은 코드 블록과 표 열 수 불일치 없음 |
| JSON 예시 | 11개 블록 문법 파싱 완료 |
| 통합 QA ID | G 16개, R 36개, O 12개; 그룹 내 중복 없음 |
| ZIP | 문서 24개 수록, CRC 검사 정상 |
| 게임 실행 검증 | 미수행. QA는 검증 계획으로 제공 |

Mermaid 도식의 소스 구조를 점검하되, 최종 표시 형태는 사용 중인 Markdown 뷰어의 지원 수준에 따라 달라질 수 있다. 모든 링크는 전체 문서 폴더 안의 상대 파일명을 기준으로 작성했다.

## 7. 통합 출처 목록

아래 목록은 각 문서에 실제 기재된 URL을 모았다. 공식 제품 자료, 개발자 글, 커뮤니티 규칙, 플레이 관찰 자료를 함께 포함하며, 행의 존재가 같은 신뢰 수준을 뜻하지 않는다. 같은 위키 문서의 페이지 분할은 하나로 묶었다. 접근 범위와 채택 여부는 각 상세 문서의 출처 절을 따른다.

정리한 출처 항목은 84개다. 이 수는 독립적인 실험이나 공식 문서의 개수를 뜻하지 않는다.

| ID | 출처 | 성격 | 참조 문서 |
|---|---|---|---|
| SRC-01 | [S14 개발자 AE 해금 사전 논의](https://new.subsetgames.com/forum/viewtopic.php?p=61003) | 개발사 사이트·포럼; 글 작성자 확인 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-02 | [Subset Games의 Steam 공식 제품 설명](https://store.steampowered.com/app/212680/FTL_Faster_Than_Light/) | 공식 제품 설명 | [00](00_scope_evidence_and_glossary.md), [01](01_core_loop_run_state.md), [03](03_events_quests_and_choices.md), [07](07_combat_timing_and_damage.md) |
| SRC-03 | [Subset Games FAQ](https://subsetgames.com/faq.html) | 개발사 사이트·포럼; 글 작성자 확인 | [00](00_scope_evidence_and_glossary.md), [13](13_advanced_edition_systems.md) |
| SRC-04 | [개발자 Matthew의 AE 1.5.10 패치노트](https://subsetgames.com/forum/viewtopic.php?t=23727) | 개발사 사이트·포럼; 글 작성자 확인 | [00](00_scope_evidence_and_glossary.md), [03](03_events_quests_and_choices.md), [04](04_economy_shops_and_progression.md), [13](13_advanced_edition_systems.md) |
| SRC-05 | [B06 FTL guide to boarding](https://subsetgames.com/forum/viewtopic.php?t=2510) | 개발사 사이트·포럼; 글 작성자 확인 | [11](11_boarding_and_personal_combat.md) |
| SRC-06 | [A08 Enemy ships site explanation](https://ftl-layouts.mikehopley.org/) | 커뮤니티 분석·플레이·대조 자료 | [15](15_enemy_generation_and_ai.md) |
| SRC-07 | [B05 Automated ships](https://ftl-layouts.mikehopley.org/auto) | 커뮤니티 분석·플레이·대조 자료 | [11](11_boarding_and_personal_combat.md), [15](15_enemy_generation_and_ai.md) |
| SRC-08 | [A05 Stealth B guide](https://ftl-ships-guide.netlify.app/stealth-b/) | 커뮤니티 분석·플레이·대조 자료 | [15](15_enemy_generation_and_ai.md) |
| SRC-09 | [Augmentations](https://ftl.fandom.com/wiki/Augmentations) | 커뮤니티 규칙 문서 | [04](04_economy_shops_and_progression.md), [08](08_weapons_shields_and_targeting.md), [09](09_drones_and_augments.md) |
| SRC-10 | [FTL Wiki — Backup Battery](https://ftl.fandom.com/wiki/Backup_Battery) | 커뮤니티 규칙 문서 | [06](06_power_systems_and_subsystems.md), [13](13_advanced_edition_systems.md) |
| SRC-11 | [Beacons](https://ftl.fandom.com/wiki/Beacons) | 커뮤니티 규칙 문서 | [01](01_core_loop_run_state.md), [02](02_sector_map_navigation_pursuit.md), [03](03_events_quests_and_choices.md) |
| SRC-12 | [FTL Wiki — Beam Weapons](https://ftl.fandom.com/wiki/Beam_(Weapons)) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md), [08](08_weapons_shields_and_targeting.md) |
| SRC-13 | [Blue Options](https://ftl.fandom.com/wiki/Blue_Options) | 커뮤니티 규칙 문서 | [03](03_events_quests_and_choices.md) |
| SRC-14 | [FTL Wiki — Boarding](https://ftl.fandom.com/wiki/Boarding) | 커뮤니티 규칙 문서 | [05](05_ship_rooms_and_pathfinding.md), [06](06_power_systems_and_subsystems.md), [11](11_boarding_and_personal_combat.md), [12](12_atmosphere_fire_breach_repair.md), [15](15_enemy_generation_and_ai.md) |
| SRC-15 | [FTL Wiki — Bomb Weapons](https://ftl.fandom.com/wiki/Bomb_(Weapons)) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md), [08](08_weapons_shields_and_targeting.md) |
| SRC-16 | [Events: Risks and Hazards](https://ftl.fandom.com/wiki/Category:Events:_Risks_and_Hazards) | 커뮤니티 규칙 문서 | [03](03_events_quests_and_choices.md) |
| SRC-17 | [Hull Repair Rewards](https://ftl.fandom.com/wiki/Category:Hull_Repair_Rewards) | 커뮤니티 규칙 문서 | [04](04_economy_shops_and_progression.md) |
| SRC-18 | [FTL Wiki — Cloaking](https://ftl.fandom.com/wiki/Cloaking) | 커뮤니티 규칙 문서 | [06](06_power_systems_and_subsystems.md), [07](07_combat_timing_and_damage.md), [13](13_advanced_edition_systems.md) |
| SRC-19 | [FTL Wiki — Clone Bay](https://ftl.fandom.com/wiki/Clone_Bay) | 커뮤니티 규칙 문서 | [05](05_ship_rooms_and_pathfinding.md), [11](11_boarding_and_personal_combat.md), [13](13_advanced_edition_systems.md) |
| SRC-20 | [C01 Crew](https://ftl.fandom.com/wiki/Crew) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-21 | [C11 Crew Teleporter](https://ftl.fandom.com/wiki/Crew_Teleporter) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md), [11](11_boarding_and_personal_combat.md) |
| SRC-22 | [FTL Wiki — Crew Skills](https://ftl.fandom.com/wiki/Crew_skills) | 커뮤니티 규칙 문서 | [09](09_drones_and_augments.md), [10](10_crew_species_and_training.md) |
| SRC-23 | [C08 Crystal](https://ftl.fandom.com/wiki/Crystal) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-24 | [FTL Wiki — Drone Control](https://ftl.fandom.com/wiki/Drone_Control) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md), [09](09_drones_and_augments.md) |
| SRC-25 | [A01 Enemy Ships](https://ftl.fandom.com/wiki/Enemy_Ships) | 커뮤니티 규칙 문서 | [15](15_enemy_generation_and_ai.md) |
| SRC-26 | [C03 Engi](https://ftl.fandom.com/wiki/Engi) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-27 | [FTL Wiki — Engines](https://ftl.fandom.com/wiki/Engines) | 커뮤니티 규칙 문서 | [06](06_power_systems_and_subsystems.md), [10](10_crew_species_and_training.md) |
| SRC-28 | [Environmental Hazards](https://ftl.fandom.com/wiki/Environmental_Hazards) | 커뮤니티 규칙 문서 | [02](02_sector_map_navigation_pursuit.md) |
| SRC-29 | [FTL Wiki — Advanced Edition](https://ftl.fandom.com/wiki/FTL:_Advanced_Edition) | 커뮤니티 규칙 문서 | [13](13_advanced_edition_systems.md) |
| SRC-30 | [E03 Fires](https://ftl.fandom.com/wiki/Fires) | 커뮤니티 규칙 문서 | [12](12_atmosphere_fire_breach_repair.md) |
| SRC-31 | [FTL Wiki — Flak Weapons](https://ftl.fandom.com/wiki/Flak_(Weapons)) | 커뮤니티 규칙 문서 | [08](08_weapons_shields_and_targeting.md) |
| SRC-32 | [F01 Game Over](https://ftl.fandom.com/wiki/Game_Over) | 커뮤니티 규칙 문서 | [16](16_rebel_flagship.md) |
| SRC-33 | [Giant alien spiders](https://ftl.fandom.com/wiki/Giant_alien_spiders) | 커뮤니티 규칙 문서 | [03](03_events_quests_and_choices.md) |
| SRC-34 | [S02 Guides and tips](https://ftl.fandom.com/wiki/Guides_and_tips) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-35 | [FTL Wiki — Hacking](https://ftl.fandom.com/wiki/Hacking) | 커뮤니티 규칙 문서 | [05](05_ship_rooms_and_pathfinding.md), [13](13_advanced_edition_systems.md) |
| SRC-36 | [C02 Humans](https://ftl.fandom.com/wiki/Humans) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-37 | [FTL Wiki — Ion Weapons](https://ftl.fandom.com/wiki/Ion_(Weapons)) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md), [08](08_weapons_shields_and_targeting.md) |
| SRC-38 | [C09 Lanius](https://ftl.fandom.com/wiki/Lanius) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-39 | [A02 Lanius Ships](https://ftl.fandom.com/wiki/Lanius_Ships) | 커뮤니티 규칙 문서 | [15](15_enemy_generation_and_ai.md) |
| SRC-40 | [FTL Wiki — Laser Weapons](https://ftl.fandom.com/wiki/Laser_(Weapons)) | 커뮤니티 규칙 문서 | [08](08_weapons_shields_and_targeting.md) |
| SRC-41 | [C04 Mantis](https://ftl.fandom.com/wiki/Mantis) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-42 | [FTL Wiki — Mind Control](https://ftl.fandom.com/wiki/Mind_Control) | 커뮤니티 규칙 문서 | [13](13_advanced_edition_systems.md) |
| SRC-43 | [FTL Wiki — Missile Weapons](https://ftl.fandom.com/wiki/Missile_(Weapons)) | 커뮤니티 규칙 문서 | [08](08_weapons_shields_and_targeting.md) |
| SRC-44 | [E02 Oxygen](https://ftl.fandom.com/wiki/Oxygen) | 커뮤니티 규칙 문서 | [12](12_atmosphere_fire_breach_repair.md) |
| SRC-45 | [FTL Wiki — Piloting](https://ftl.fandom.com/wiki/Piloting) | 커뮤니티 규칙 문서 | [05](05_ship_rooms_and_pathfinding.md), [06](06_power_systems_and_subsystems.md) |
| SRC-46 | [Random Events](https://ftl.fandom.com/wiki/Random_Events) | 커뮤니티 규칙 문서 | [03](03_events_quests_and_choices.md) |
| SRC-47 | [Rebel Fleet](https://ftl.fandom.com/wiki/Rebel_Fleet) | 커뮤니티 규칙 문서 | [01](01_core_loop_run_state.md), [02](02_sector_map_navigation_pursuit.md) |
| SRC-48 | [Repair station](https://ftl.fandom.com/wiki/Repair_station) | 커뮤니티 규칙 문서 | [04](04_economy_shops_and_progression.md) |
| SRC-49 | [Rewards](https://ftl.fandom.com/wiki/Rewards) | 커뮤니티 규칙 문서 | [01](01_core_loop_run_state.md), [04](04_economy_shops_and_progression.md) |
| SRC-50 | [C05 Rockmen](https://ftl.fandom.com/wiki/Rockmen) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-51 | [Scrap](https://ftl.fandom.com/wiki/Scrap) | 커뮤니티 규칙 문서 | [04](04_economy_shops_and_progression.md) |
| SRC-52 | [Sectors](https://ftl.fandom.com/wiki/Sectors) | 커뮤니티 규칙 문서 | [01](01_core_loop_run_state.md), [02](02_sector_map_navigation_pursuit.md) |
| SRC-53 | [FTL Wiki — Shields](https://ftl.fandom.com/wiki/Shields) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md) |
| SRC-54 | [FTL Wiki — Ship](https://ftl.fandom.com/wiki/Ship) | 커뮤니티 규칙 문서 | [06](06_power_systems_and_subsystems.md), [12](12_atmosphere_fire_breach_repair.md), [14](14_ships_loadouts_and_unlocks.md) |
| SRC-55 | [A03 Slug Ships](https://ftl.fandom.com/wiki/Slug_Ships) | 커뮤니티 규칙 문서 | [15](15_enemy_generation_and_ai.md) |
| SRC-56 | [C07 Slugs](https://ftl.fandom.com/wiki/Slugs) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-57 | [Stores and resources](https://ftl.fandom.com/wiki/Stores_and_resources) | 커뮤니티 규칙 문서 | [02](02_sector_map_navigation_pursuit.md), [04](04_economy_shops_and_progression.md), [09](09_drones_and_augments.md) |
| SRC-58 | [FTL Wiki — Systems](https://ftl.fandom.com/wiki/Systems) | 커뮤니티 규칙 문서 | [05](05_ship_rooms_and_pathfinding.md), [06](06_power_systems_and_subsystems.md), [09](09_drones_and_augments.md) |
| SRC-59 | [S12 The Crystal Cruiser](https://ftl.fandom.com/wiki/The_Crystal_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-60 | [S04 The Engi Cruiser](https://ftl.fandom.com/wiki/The_Engi_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-61 | [S05 The Federation Cruiser](https://ftl.fandom.com/wiki/The_Federation_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-62 | [S03 The Kestrel Cruiser](https://ftl.fandom.com/wiki/The_Kestrel_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-63 | [S11 The Lanius Cruiser](https://ftl.fandom.com/wiki/The_Lanius_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-64 | [S07 The Mantis Cruiser](https://ftl.fandom.com/wiki/The_Mantis_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-65 | [F02 The Rebel Flagship](https://ftl.fandom.com/wiki/The_Rebel_Flagship) | 커뮤니티 규칙 문서 | [16](16_rebel_flagship.md) |
| SRC-66 | [S09 The Rock Cruiser](https://ftl.fandom.com/wiki/The_Rock_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-67 | [S08 The Slug Cruiser](https://ftl.fandom.com/wiki/The_Slug_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-68 | [S10 The Stealth Cruiser](https://ftl.fandom.com/wiki/The_Stealth_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-69 | [S06 The Zoltan Cruiser](https://ftl.fandom.com/wiki/The_Zoltan_Cruiser) | 커뮤니티 규칙 문서 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-70 | [FTL Wiki — Weapon Control](https://ftl.fandom.com/wiki/Weapon_Control) | 커뮤니티 규칙 문서 | [06](06_power_systems_and_subsystems.md), [08](08_weapons_shields_and_targeting.md) |
| SRC-71 | [FTL Wiki — Weapons](https://ftl.fandom.com/wiki/Weapons) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md), [08](08_weapons_shields_and_targeting.md) |
| SRC-72 | [FTL Wiki — Weapon Tables](https://ftl.fandom.com/wiki/Weapons_(tables)) | 커뮤니티 규칙 문서 | [08](08_weapons_shields_and_targeting.md) |
| SRC-73 | [F03 Zoltan Shield](https://ftl.fandom.com/wiki/Zoltan_Shield) | 커뮤니티 규칙 문서 | [16](16_rebel_flagship.md) |
| SRC-74 | [FTL Wiki — Zoltan Ships](https://ftl.fandom.com/wiki/Zoltan_Ships) | 커뮤니티 규칙 문서 | [07](07_combat_timing_and_damage.md), [08](08_weapons_shields_and_targeting.md) |
| SRC-75 | [C06 Zoltans](https://ftl.fandom.com/wiki/Zoltans) | 커뮤니티 규칙 문서 | [10](10_crew_species_and_training.md) |
| SRC-76 | [F04 FTL FAQ, GameFAQs](https://gamefaqs.gamespot.com/pc/664216-ftl-faster-than-light/faqs/70999?page=6) | 커뮤니티 분석·플레이·대조 자료 | [16](16_rebel_flagship.md) |
| SRC-77 | [Arqade — Full Arsenal](https://gaming.stackexchange.com/questions/219319/how-can-the-full-arsenal-achievement-in-ftl-be-achieved) | 커뮤니티 분석·플레이·대조 자료 | [06](06_power_systems_and_subsystems.md) |
| SRC-78 | [F05 일본어 FTL FAQ](https://seesaawiki.jp/ftl/d/FAQ) | 커뮤니티 분석·플레이·대조 자료 | [16](16_rebel_flagship.md) |
| SRC-79 | [E05 How do I repair weapon systems?](https://steamcommunity.com/app/212680/discussions/0/594026463740618697/) | 커뮤니티 분석·플레이·대조 자료 | [12](12_atmosphere_fire_breach_repair.md) |
| SRC-80 | [S13 Quick reference on unlocking ships](https://steamcommunity.com/sharedfiles/filedetails/?id=153931618) | 커뮤니티 분석·플레이·대조 자료 | [14](14_ships_loadouts_and_unlocks.md) |
| SRC-81 | [A04 Calculated FTL](https://steamcommunity.com/sharedfiles/filedetails/?id=2127539536) | 커뮤니티 분석·플레이·대조 자료 | [15](15_enemy_generation_and_ai.md) |
| SRC-82 | [B04 Practical FTL](https://steamcommunity.com/sharedfiles/filedetails?id=266502670) | 커뮤니티 분석·플레이·대조 자료 | [11](11_boarding_and_personal_combat.md) |
| SRC-83 | [F06 Sullla의 과거 기함 공략](https://sullla.com/FTL/ftlintro.html) | 커뮤니티 분석·플레이·대조 자료 | [16](16_rebel_flagship.md) |
| SRC-84 | [S15 Stealth C 플레이 기록](https://sullla.com/FTL/stealthc.html) | 커뮤니티 분석·플레이·대조 자료 | [14](14_ships_loadouts_and_unlocks.md) |

[목차로 돌아가기](README.md)
