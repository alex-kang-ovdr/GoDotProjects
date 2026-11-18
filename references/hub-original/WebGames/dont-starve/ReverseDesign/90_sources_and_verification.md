# 90. 출처·근거 수준·검증 기록

> 자료 확인일: 2026-11-13 | 대상: PC 싱글플레이 Don't Starve 원작 및 Reign of Giants  
> [목차](00_index.md) · [제품 구분](21_dlc_dst_comparison.md) · [검증 계획](20_balance_qa_reproduction.md)

## 1. 조사 방식

이 문서집은 공개 자료를 바탕으로 한 시스템 역기획이다. 게임을 직접 실행하여 프레임·시간·확률을 측정하거나 원본 스크립트·바이너리·세이브 포맷을 대조하지 않았다. 문서의 상세 데이터 모델과 의사코드는 관찰 가능한 규칙을 구현하기 위한 재구성안이다.

사용자가 제공한 실제 링크 대상은 [Don't Starve — 나무위키](https://namu.wiki/w/Don%27t%20Starve)다. 이 페이지는 이번 환경에서 본문을 열 수 없어 원문을 읽었다고 주장하지 않는다. 게임명과 실제 URL을 기준으로 대상을 선정하고 다른 자료로 조사했다.

## 2. 자료 접근 수준

| 자료군 | 역할 | 이번 접근 방식 | 해석할 때의 한계 |
|---|---|---|---|
| Klei 공식 게임 소개 | 제품 정의·확장팩 범위 | 본문 직접 열람 | 세부 수치·확률·내부 코드 근거가 아님 |
| Klei 공식 지원 문서 | 제품 관계·입력·로그·저장 안내 | 대부분 본문 직접 열람, 일부 검색 인덱스 | 오래된 문서의 계획 문구는 현재 약속이 아님 |
| Klei 개발자 패치 공지 | 변경된 규칙의 적용 시점 | 검색 인덱스에 반환된 공지 본문 확인 | 직접 open은 403; 모든 플랫폼 동시 적용을 뜻하지 않음 |
| Don't Starve Wiki (wiki.gg) | 상세 규칙·대표 수치·제품별 차이 | 검색 인덱스 본문·발췌 확인 | 직접 열기가 제한됨. 페이지의 모든 표와 수정 이력을 열람한 것은 아님 |
| 일부 Fandom 자료 | 특정 생물 등 보조 확인 | 검색 결과·문헌 참고 | 오래된 사본일 수 있으므로 패치 민감 수치 확정에 주의 |
| 나무위키 사용자 링크 | 요청 대상 확인 | 접근 시도 실패 | 내용 인용·요약 근거로 사용하지 않음 |
| 직접 플레이·원본 코드 | 세부 경계·실행 순서 | 수행하지 않음 | 미확정 항목을 확정할 후속 검증 수단 |

검색 인덱스에서 반환된 내용을 확인한 것과 해당 페이지 전체를 브라우저에서 읽은 것을 구분한다. 출처가 공식이라고 해서 그 문서에 없는 세부 규칙까지 공식 확인으로 승격하지 않는다.

## 3. 근거 우선순위

1. 대상 제품·플랫폼에 적용되는 공식 변경 공지와 공식 설명.
2. DS·RoG 전용으로 분리된 커뮤니티 문서.
3. 여러 판본을 함께 다루는 문서에서 제품 범위를 구분할 수 있는 부분.
4. 명시적인 설계 해석과 재구성 모델.
5. 실제 빌드를 특정하지 못해 검증이 필요한 가설.

이 순서는 출처의 일반적인 권위를 기계적으로 점수화하는 기준이 아니다. 예를 들어 공식 게임 소개는 개별 음식의 허기 회복량을 설명하지 않으며, 정확한 수치를 직접 확인한 전용 문서가 그 주장에 더 적절할 수 있다.

## 4. 규칙·수치의 추적 위치

| 주제 | 근거 문서의 예 | 본문 위치 | 확정 범위 |
|---|---|---|---|
| 하루 길이·구간 | Time, Day-Night Cycle | [02](02_time_day_night.md) | 대표 시간 단위 |
| 허기·체력·정신력 | Hunger, Health, Sanity, Wilson | [03](03_survival_stats.md) | 기준 캐릭터·기본 상태. 모든 변형 수치 아님 |
| 캐릭터 예외 | 캐릭터별 Don't Starve/RoG 문서 | [04](04_characters.md) | 원작 특성 요약. DST 리워크 제외 |
| 월드·탐험 | Map, Biomes, Road | [05](05_world_generation_exploration.md) | 관찰 가능한 지형·정보 규칙. 실제 생성 알고리즘 아님 |
| 자원·장비·연구 | 채집·도구·Inventory·Crafting 관련 문서 | [06](06_resources_tools_gathering.md)~[08](08_crafting_research_magic.md) | 대표 규칙과 경제 관계 |
| 시설·농사 | 구조물·농장·생물 문서 | [09](09_building_base_fire.md), [11](11_farming_animals_sustainability.md) | 원작 생산 체계 |
| 냄비·신선도 | Crock Pot, Dishes, Spoiling, Ice Box | [10](10_food_cooking_spoilage.md) | 대표 레시피 판정과 음식값 |
| 계절·환경 | Seasons, Freezing, Overheating, Wetness | [12](12_seasons_weather_temperature.md) | DS/RoG 분리. DS 연간 일수 충돌 보류 |
| 방어구 | Armor/DS | [13](13_combat_armor.md) | 정상 내구도에서 순차 흡수. 파손 경계 보류 |
| 생태·보스 | 생물별 문서, Hound 관련 문서 | [14](14_creatures_ecology_ai.md), [15](15_bosses_raids_events.md) | 관계·대표 위협. 정확한 모든 발생 확률 아님 |
| 지하·재생성 | Caves, Ruins, Nightmare Cycle, Seed of Ruin | [16](16_caves_ruins.md) | 지역 구조와 패치 경계 |
| 모험·부활·해금 | Adventure Mode, Death, 부활 아이템, Experience | [17](17_adventure_death_progression.md) | 진행별 큰 계약. 아이템 예외 전수표 아님 |
| UI·저장 | Controls, Map, Saving, 공식 지원 | [18](18_ui_controls_audio_visual.md), [19](19_data_architecture_save.md) | 외부 기능. 내부 클래스·포맷 아님 |

같은 사실을 여러 파일에 반복해서 수치표로 복제하기보다 주 담당 문서로 연결했다. 출처 표기의 식별자는 파일 내부에서만 유효하므로, 다른 문서의 `S1`과 같은 출처라고 가정하지 않는다.

## 5. 자료 충돌과 처리 결정

| 항목 | 발견한 문제 | 문서 처리 | 확정에 필요한 것 |
|---|---|---|---|
| DS 기본 계절 일수 | Seasons와 Day-Night Cycle의 겨울 길이 설명 충돌 | 정확한 연간 길이를 보류 | 대상 빌드의 기본 설정으로 경계 기록 |
| RoG 시작 계절 | DST 기본 가을 시작과 섞이기 쉬움 | 봄·가을 선택 가능을 별도 표기 | 설정·시드에 따른 실제 시작 기록 |
| 패치 이전 규칙 | 오래된 가방·새장·유적 설명이 원작 변화와 충돌 | 관련 파일에 2023+ 경계 표시 | 정확한 빌드·브랜치·플랫폼 |
| 다중 방어구 | 최종 체력 피해와 개별 장비 소모를 혼동 | 정상 흡수식과 파손·내구도 분배 분리 | 장착·로드·파손 경계 실험 |
| 사망과 부활 | 원작 수단과 DST 유령·동료 부활을 혼합 | 원작 수단과 진행 종료를 독립 정의 | 여러 수단·지역별 조합 실험 |
| 모험 경험치 | 모험 실패와 챕터 전환을 일괄 처리하기 쉬움 | 정산 이벤트별로 구분 | 실제 XP 변화 기록 |
| 자원 재생 | 지역의 유한 자원을 세계 전체 영구 비재생으로 오인 | 자연 재생·외부 공급·지역 재생성 구분 | 전환 전후 자원·개체 비교 |

서로 다른 자료의 숫자를 평균 내거나, 최신 DST 수치로 원작의 빈칸을 메우지 않았다.

## 6. 재구성 모델의 범위

다음 요소는 문서 작성자가 제안한 구조다.

- 시스템별 상태 소유권과 이벤트 발행·확정 순서.
- 아이템·액션·캐릭터·세계·진행 데이터 스키마.
- 시드·난수·비활성 지역의 처리 전략.
- 저장 원자성, 참조 복구, 버전 마이그레이션.
- 밸런스 장부·비용식·지표·개발 단계.
- 모든 원본 미확인 수치의 실험 방법과 QA 수용 기준.

이 구조들이 실제 DS 엔진과 동일하다고 주장하지 않는다. 엔진이나 언어가 달라도 규칙을 재현하고 검증할 수 있게 하는 기능 명세로 활용한다.

## 7. 수행한 문서 검토와 미수행 검증

| 항목 | 상태 |
|---|---|
| 제품·DLC 범위 분리 | 수행 |
| 공식 공지와 구형 설명의 차이 확인 | 수행 |
| 시스템별 문서 작성 및 상호 교차 검토 | 수행 |
| 내부 파일 링크·코드 블록·참고문헌 표기 점검 | 수행: 누락 파일 링크·닫히지 않은 코드 블록·미정의 출처 참조 없음 |
| 실제 게임 플레이·시간·전투 수치 계측 | 미수행 |
| 원본 코드·스크립트·바이너리 분석 | 미수행 |
| 모든 아이템·레시피·몬스터 데이터 전수 대조 | 미수행 |
| 전체 DLC·DST 최신 콘텐츠 전수 분석 | 미수행 |

최종 문서집은 Markdown 23개와 Mermaid 코드 블록 21개로 구성했다. 문서 구조 검사는 게임 메커니즘의 실측 검증이나 모든 Markdown 뷰어에서의 다이어그램 렌더링 검증을 대신하지 않는다.

## 8. 출처를 추가하거나 문서를 갱신하는 방법

각 규칙을 바꿀 때는 `대상 제품 / DLC / 플랫폼 / 빌드 / 세계 설정 / 변경 전후 / 근거 / 확인 방법`을 남긴다. 구현에서 확인한 결과와 공개 문헌이 다르면 둘을 함께 보존하고, 자료의 갱신 시점과 실험 조건을 먼저 비교한다.

특정 캐릭터나 아이템의 예외를 공통 시스템으로 확대할 때는 다른 대상에도 같은 규칙이 적용되는지 확인한다. 추정이 맞더라도 근거가 없으면 [설계 해석] 또는 [검증 필요] 표시를 유지한다.

## 9. 출처 색인

아래 색인은 본문에서 실제로 연결한 URL을 모은 목록이다. 접근 방식은 각 문서의 출처 절이 가장 구체적이다. 나무위키는 접근 실패를 기록하기 위한 요청 링크이며 확인된 본문 근거에 포함하지 않는다.

<!-- SOURCE_INDEX_START -->
| 출처 | 사용 문서 | 자료 유형 |
|---|---|---|
| [Mega Update](https://kleiforums.com/forums/topic/147423-the-dont-starve-mega-update-is-now-live/) | [05](05_world_generation_exploration.md), [07](07_inventory_equipment_durability.md), [10](10_food_cooking_spoilage.md), [11](11_farming_animals_sustainability.md), [16](16_caves_ruins.md), [21](21_dlc_dst_comparison.md) | 공식 개발자 공지·인덱스 확인 |
| [What is Don't Starve?](https://support.klei.com/hc/en-us/articles/360029554792-What-is-Don-t-Starve) | [01](01_overview_core_loop.md), [05](05_world_generation_exploration.md), [18](18_ui_controls_audio_visual.md) | 공식 설명·지원 |
| [Klei, Do I need Reign of Giants or Shipwrecked to play Hamlet?](https://support.klei.com/hc/en-us/articles/360029555292-Do-I-need-Reign-or-Giants-or-Shipwrecked-to-play-Hamlet) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Klei, What is Don't Starve Together?](https://support.klei.com/hc/en-us/articles/360029556012-What-is-Don-t-Starve-Together) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Klei, Didn't you say DST was an update to DS?](https://support.klei.com/hc/en-us/articles/360029556992-Didn-t-you-say-DST-was-an-update-to-DS-What-s-the-Deal) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Klei, Logs and Useful Information for Bug Reports for Don't Starve](https://support.klei.com/hc/en-us/articles/360029557252-Logs-and-Useful-Information-for-Bug-Reports-for-Don-t-Starve) | [19](19_data_architecture_save.md) | 공식 설명·지원 |
| [Klei, How do I play Don't Starve with a controller?](https://support.klei.com/hc/en-us/articles/360029557372-How-do-I-play-Don-t-Starve-with-a-controller) | [18](18_ui_controls_audio_visual.md) | 공식 설명·지원 |
| [Klei, What is Don't Starve: Hamlet?](https://support.klei.com/hc/en-us/articles/360029879971-What-is-Don-t-Starve-Hamlet) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Klei, What is Don't Starve Shipwrecked?](https://support.klei.com/hc/en-us/articles/360029880131-What-is-Don-t-Starve-Shipwrecked) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [How do I play Don't Starve?](https://support.klei.com/hc/en-us/articles/360029880331-How-do-I-play-Don-t-Starve) | [01](01_overview_core_loop.md), [20](20_balance_qa_reproduction.md) | 공식 설명·지원 |
| [Klei, Will Hamlet work with Don't Starve Together?](https://support.klei.com/hc/en-us/articles/360029880871-Will-Hamlet-work-with-Don-t-Starve-Together) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Klei, Do I need Reign of Giants for Shipwrecked?](https://support.klei.com/hc/en-us/articles/360029881071-Do-I-need-Reign-of-Giants-for-Shipwrecked) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Klei, Can I still play regular Don't Starve if I have DLC?](https://support.klei.com/hc/en-us/articles/360031045392-Can-I-still-play-regular-Don-t-Starve-if-I-have-DLC-Reign-of-Giants-Shipwrecked-or-Hamlet) | [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Intrinsic vs. Extrinsic rewards](https://support.klei.com/hc/en-us/articles/360035456011-Intrinsic-vs-Extrinsic-rewards) | [01](01_overview_core_loop.md) | 공식 설명·지원 |
| [Klei 공식 게임 소개](https://www.klei.com/games/dont-starve/) | [01](01_overview_core_loop.md), [21](21_dlc_dst_comparison.md) | 공식 설명·지원 |
| [Treeguard](https://dontstarve.fandom.com/wiki/Treeguard) | [14](14_creatures_ecology_ai.md) | 보조 커뮤니티 자료 |
| [Adventure Mode](https://dontstarve.wiki.gg/wiki/Adventure_Mode) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Alchemy Engine](https://dontstarve.wiki.gg/wiki/Alchemy_Engine) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Ancient Guardian](https://dontstarve.wiki.gg/wiki/Ancient_Guardian) | [16](16_caves_ruins.md) | 커뮤니티 위키·인덱스 확인 |
| [Don't Starve Wiki — Armor/DS](https://dontstarve.wiki.gg/wiki/Armor/DS) | [13](13_combat_armor.md) | 커뮤니티 위키·인덱스 확인 |
| [Bearger](https://dontstarve.wiki.gg/wiki/Bearger) | [15](15_bosses_raids_events.md) | 커뮤니티 위키·인덱스 확인 |
| [Bed Roll](https://dontstarve.wiki.gg/wiki/Bed_Roll) | [02](02_time_day_night.md) | 커뮤니티 위키·인덱스 확인 |
| [Bee Box](https://dontstarve.wiki.gg/wiki/Bee_box) | [11](11_farming_animals_sustainability.md) | 커뮤니티 위키·인덱스 확인 |
| [Beefalo](https://dontstarve.wiki.gg/wiki/Beefalo) | [11](11_farming_animals_sustainability.md), [14](14_creatures_ecology_ai.md) | 커뮤니티 위키·인덱스 확인 |
| [Biomes](https://dontstarve.wiki.gg/wiki/Biomes) | [05](05_world_generation_exploration.md) | 커뮤니티 위키·인덱스 확인 |
| [Birdcage](https://dontstarve.wiki.gg/wiki/Birdcage) | [11](11_farming_animals_sustainability.md) | 커뮤니티 위키·인덱스 확인 |
| [Blueprint](https://dontstarve.wiki.gg/wiki/Blueprint) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Bunnyman](https://dontstarve.wiki.gg/wiki/Bunnymen) | [14](14_creatures_ecology_ai.md) | 커뮤니티 위키·인덱스 확인 |
| [Campfire](https://dontstarve.wiki.gg/wiki/Campfire) | [09](09_building_base_fire.md) | 커뮤니티 위키·인덱스 확인 |
| [Sinkhole](https://dontstarve.wiki.gg/wiki/Cave_Entrance) | [16](16_caves_ruins.md) | 커뮤니티 위키·인덱스 확인 |
| [Caves](https://dontstarve.wiki.gg/wiki/Caves) | [16](16_caves_ruins.md) | 커뮤니티 위키·인덱스 확인 |
| [Characters](https://dontstarve.wiki.gg/wiki/Characters) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Charcoal](https://dontstarve.wiki.gg/wiki/Charcoal) | [06](06_resources_tools_gathering.md) | 커뮤니티 위키·인덱스 확인 |
| [Console/Commands](https://dontstarve.wiki.gg/wiki/Console/Commands) | [02](02_time_day_night.md) | 커뮤니티 위키·인덱스 확인 |
| [Controls](https://dontstarve.wiki.gg/wiki/Controls) | [18](18_ui_controls_audio_visual.md) | 커뮤니티 위키·인덱스 확인 |
| [Crafting](https://dontstarve.wiki.gg/wiki/Craftables) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Crock Pot](https://dontstarve.wiki.gg/wiki/Crock_Pot) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [Day-Night Cycle](https://dontstarve.wiki.gg/wiki/Day-Night_Cycle) | [02](02_time_day_night.md), [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Death](https://dontstarve.wiki.gg/wiki/Death) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Deciduous Forest](https://dontstarve.wiki.gg/wiki/Deciduous_Forest) | [05](05_world_generation_exploration.md) | 커뮤니티 위키·인덱스 확인 |
| [Deerclops](https://dontstarve.wiki.gg/wiki/Deerclops) | [15](15_bosses_raids_events.md) | 커뮤니티 위키·인덱스 확인 |
| [Dishes](https://dontstarve.wiki.gg/wiki/Dishes) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [변경 이력 정리](https://dontstarve.wiki.gg/wiki/Don%27t_Starve_Mega_Update) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [Dragonfly](https://dontstarve.wiki.gg/wiki/Dragonfly) | [15](15_bosses_raids_events.md) | 커뮤니티 위키·인덱스 확인 |
| [Durability](https://dontstarve.wiki.gg/wiki/Durability) | [06](06_resources_tools_gathering.md), [07](07_inventory_equipment_durability.md) | 커뮤니티 위키·인덱스 확인 |
| [Experience](https://dontstarve.wiki.gg/wiki/Experience) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Farm](https://dontstarve.wiki.gg/wiki/Farm) | [11](11_farming_animals_sustainability.md) | 커뮤니티 위키·인덱스 확인 |
| [Farming](https://dontstarve.wiki.gg/wiki/Farming) | [06](06_resources_tools_gathering.md), [11](11_farming_animals_sustainability.md) | 커뮤니티 위키·인덱스 확인 |
| [Fire](https://dontstarve.wiki.gg/wiki/Fire) | [09](09_building_base_fire.md), [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Freezing](https://dontstarve.wiki.gg/wiki/Freezing) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Beginner's Guide](https://dontstarve.wiki.gg/wiki/Guides/Beginner%27s_Guide_for_staying_alive) | [09](09_building_base_fire.md) | 커뮤니티 위키·인덱스 확인 |
| [Guides/Crock Pot Dishes](https://dontstarve.wiki.gg/wiki/Guides/Crock_Pot_Dishes) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [Getting Started Guide](https://dontstarve.wiki.gg/wiki/Guides/Getting_Started_Guide) | [18](18_ui_controls_audio_visual.md) | 커뮤니티 위키·인덱스 확인 |
| [Guides/Hound Wave Survival Guide](https://dontstarve.wiki.gg/wiki/Guides/Hound_Wave_Survival_Guide) | [15](15_bosses_raids_events.md) | 커뮤니티 위키·인덱스 확인 |
| [Guides/Managing Wetness](https://dontstarve.wiki.gg/wiki/Guides/Managing_Wetness) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Don't Starve Wiki — Guides/Mob Killing Guide](https://dontstarve.wiki.gg/wiki/Guides/Mob_Killing_Guide) | [13](13_combat_armor.md), [14](14_creatures_ecology_ai.md) | 커뮤니티 위키·인덱스 확인 |
| [Lights Out 안내](https://dontstarve.wiki.gg/wiki/Guides/Surviving_In_Lights_Out) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Health](https://dontstarve.wiki.gg/wiki/Health) | [03](03_survival_stats.md) | 커뮤니티 위키·인덱스 확인 |
| [Hunger](https://dontstarve.wiki.gg/wiki/Hunger) | [03](03_survival_stats.md), [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Ice Box](https://dontstarve.wiki.gg/wiki/Ice_Box) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [Ice Flingomatic](https://dontstarve.wiki.gg/wiki/Ice_Flingomatic) | [09](09_building_base_fire.md) | 커뮤니티 위키·인덱스 확인 |
| [Inventory](https://dontstarve.wiki.gg/wiki/Inventory) | [07](07_inventory_equipment_durability.md) | 커뮤니티 위키·인덱스 확인 |
| [Backpack](https://dontstarve.wiki.gg/wiki/Krampus_Sacks) | [07](07_inventory_equipment_durability.md) | 커뮤니티 위키·인덱스 확인 |
| [Life Giving Amulet](https://dontstarve.wiki.gg/wiki/Life_Giving_Amulet) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Light Tab](https://dontstarve.wiki.gg/wiki/Light_Tab) | [02](02_time_day_night.md) | 커뮤니티 위키·인덱스 확인 |
| [Lightning](https://dontstarve.wiki.gg/wiki/Lightning) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Lightning Rod](https://dontstarve.wiki.gg/wiki/Lightning_Rod) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Map](https://dontstarve.wiki.gg/wiki/Map) | [05](05_world_generation_exploration.md), [18](18_ui_controls_audio_visual.md) | 커뮤니티 위키·인덱스 확인 |
| [Maxwell's Door](https://dontstarve.wiki.gg/wiki/Maxwell%27s_Door) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Maxwell (Don't Starve)](https://dontstarve.wiki.gg/wiki/Maxwell/Don%27t_Starve) | [04](04_characters.md), [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Meat](https://dontstarve.wiki.gg/wiki/Meat) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [Meat Effigy](https://dontstarve.wiki.gg/wiki/Meat_Effigy) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Monster Meat](https://dontstarve.wiki.gg/wiki/Monster_Meat) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Moose/Goose](https://dontstarve.wiki.gg/wiki/Moose_goose) | [15](15_bosses_raids_events.md) | 커뮤니티 위키·인덱스 확인 |
| [Krampus/Naughtiness](https://dontstarve.wiki.gg/wiki/Naughtiness) | [15](15_bosses_raids_events.md) | 커뮤니티 위키·인덱스 확인 |
| [Nightmare Cycle](https://dontstarve.wiki.gg/wiki/Nightmare_Cycle) | [16](16_caves_ruins.md) | 커뮤니티 위키·인덱스 확인 |
| [Overheating](https://dontstarve.wiki.gg/wiki/Overheating) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Pig](https://dontstarve.wiki.gg/wiki/Pig) | [14](14_creatures_ecology_ai.md) | 커뮤니티 위키·인덱스 확인 |
| [Pig House](https://dontstarve.wiki.gg/wiki/Pig_House) | [11](11_farming_animals_sustainability.md) | 커뮤니티 위키·인덱스 확인 |
| [Prestihatitator](https://dontstarve.wiki.gg/wiki/Prestihatitator_Science_Machine) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Reeds](https://dontstarve.wiki.gg/wiki/Reeds) | [05](05_world_generation_exploration.md), [06](06_resources_tools_gathering.md) | 커뮤니티 위키·인덱스 확인 |
| [Road](https://dontstarve.wiki.gg/wiki/Road) | [05](05_world_generation_exploration.md) | 커뮤니티 위키·인덱스 확인 |
| [Boulder](https://dontstarve.wiki.gg/wiki/RockNitre) | [06](06_resources_tools_gathering.md) | 커뮤니티 위키·인덱스 확인 |
| [Ruins](https://dontstarve.wiki.gg/wiki/Ruins) | [16](16_caves_ruins.md) | 커뮤니티 위키·인덱스 확인 |
| [Sanity](https://dontstarve.wiki.gg/wiki/Sanity) | [03](03_survival_stats.md) | 커뮤니티 위키·인덱스 확인 |
| [Saving](https://dontstarve.wiki.gg/wiki/Saving) | [19](19_data_architecture_save.md) | 커뮤니티 위키·인덱스 확인 |
| [Science Machine](https://dontstarve.wiki.gg/wiki/Science_Machine) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Seasons](https://dontstarve.wiki.gg/wiki/Seasons) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Seasons/World](https://dontstarve.wiki.gg/wiki/Seasons/World) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Seed of Ruin](https://dontstarve.wiki.gg/wiki/Seed_of_Ruin) | [16](16_caves_ruins.md) | 커뮤니티 위키·인덱스 확인 |
| [Shadow Creature](https://dontstarve.wiki.gg/wiki/Shadow_Creature) | [03](03_survival_stats.md) | 커뮤니티 위키·인덱스 확인 |
| [Shadow Manipulator](https://dontstarve.wiki.gg/wiki/Shadow_Manipulator) | [08](08_crafting_research_magic.md) | 커뮤니티 위키·인덱스 확인 |
| [Sleeping](https://dontstarve.wiki.gg/wiki/Sleeping) | [02](02_time_day_night.md), [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Don't Starve Wiki — Spider Queen](https://dontstarve.wiki.gg/wiki/Spider_Queen) | [13](13_combat_armor.md) | 커뮤니티 위키·인덱스 확인 |
| [Food / Spoiling](https://dontstarve.wiki.gg/wiki/Spoiling) | [10](10_food_cooking_spoilage.md) | 커뮤니티 위키·인덱스 확인 |
| [Time](https://dontstarve.wiki.gg/wiki/Time) | [02](02_time_day_night.md) | 커뮤니티 위키·인덱스 확인 |
| [Tools Tab](https://dontstarve.wiki.gg/wiki/Tools_Tab) | [06](06_resources_tools_gathering.md) | 커뮤니티 위키·인덱스 확인 |
| [Touch Stone](https://dontstarve.wiki.gg/wiki/Touch_Stone) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [WX-78 (Don't Starve)](https://dontstarve.wiki.gg/wiki/WX-78/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wagstaff (Don't Starve)](https://dontstarve.wiki.gg/wiki/Wagstaff/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Webber (Reign of Giants)](https://dontstarve.wiki.gg/wiki/Webber/Reign_of_Giants) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wendy (Don't Starve)](https://dontstarve.wiki.gg/wiki/Wendy/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wes (Don't Starve)](https://dontstarve.wiki.gg/wiki/Wes/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wetness](https://dontstarve.wiki.gg/wiki/Wetness) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Wickerbottom (Don't Starve)](https://dontstarve.wiki.gg/wiki/Wickerbottom/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wigfrid (Reign of Giants)](https://dontstarve.wiki.gg/wiki/Wigfrid/Reign_of_Giants) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wildfires](https://dontstarve.wiki.gg/wiki/Wildfires) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Willow (Don't Starve)](https://dontstarve.wiki.gg/wiki/Willow/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wilson](https://dontstarve.wiki.gg/wiki/Wilson) | [03](03_survival_stats.md), [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wolfgang (Don't Starve)](https://dontstarve.wiki.gg/wiki/Wolfgang/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [Wooden Thing](https://dontstarve.wiki.gg/wiki/Wooden_Thing) | [17](17_adventure_death_progression.md) | 커뮤니티 위키·인덱스 확인 |
| [Woodie (Don't Starve)](https://dontstarve.wiki.gg/wiki/Woodie/Don%27t_Starve) | [04](04_characters.md) | 커뮤니티 위키·인덱스 확인 |
| [World Customization/Reign of Giants](https://dontstarve.wiki.gg/wiki/World_Customization/Reign_of_Giants) | [12](12_seasons_weather_temperature.md) | 커뮤니티 위키·인덱스 확인 |
| [Don't Starve — 나무위키](https://namu.wiki/w/Don%27t%20Starve) | [00](00_index.md) | 요청 링크·접근 실패 |
<!-- SOURCE_INDEX_END -->
