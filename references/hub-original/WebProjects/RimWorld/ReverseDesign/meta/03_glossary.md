---
doc_id: META-03
title: 용어집과 혼동하기 쉬운 개념
layer: meta
target_version: RimWorld PC 1.6 계열
research_date: 2026-11-13
status: 문서 용어 정리
---

# 용어집과 혼동하기 쉬운 개념

[전체 목차](../README.md)

각 용어는 문서 묶음에서 사용하는 의미다. 한국어 번역은 게임의 설치 언어·번역 패치에 따라 다를 수 있으므로 영문을 함께 적었다. 구체적인 규칙의 근거는 연결된 시스템 문서에서 확인한다. 제안용 데이터 명칭을 원작의 실제 클래스명으로 해석하지 않는다.

## 1. 기본 게임 용어

| 한국어·문서 용어 | 영문 | 의미와 구분 | 상세 |
| --- | --- | --- | --- |
| 개체 | Entity | 독립 구현에서 지속 ID를 갖는 대상의 공통 표현 | [기반](../systems/18_simulation_save_mods.md) |
| 폰 | Pawn | 주민·동물 등 행동하는 개체를 설명할 때 쓰는 용어 | [주민](../systems/02_colonists_skills_relationships.md) |
| 정착민·주민 | Colonist | 플레이어 정착지의 구성원 | [주민](../systems/02_colonists_skills_relationships.md) |
| 배경 | Backstory | 인물의 능력·업무 자격과 연결되는 과거 정보 | [주민](../systems/02_colonists_skills_relationships.md) |
| 특성 | Trait | 개인의 성향과 규칙 예외 | [주민](../systems/02_colonists_skills_relationships.md) |
| 기술·숙련 | Skill | 노동·전투 등 수행 능력의 성장 축 | [주민](../systems/02_colonists_skills_relationships.md) |
| 열정 | Passion | 해당 기술 성장·선호를 구분하는 축 | [주민](../systems/02_colonists_skills_relationships.md) |
| 업무 불가 | Incapable | 숙련이 낮음과 다른 수행 자격 제한 | [작업](../systems/04_work_priorities_jobs.md) |
| 욕구 | Need | 식사·수면·여가처럼 유지해야 하는 상태 | [기분](../systems/03_needs_mood_mental_breaks.md) |
| 생각·감정 효과 | Thought / Moodlet | 사건·환경을 평가한 기분 효과 | [기분](../systems/03_needs_mood_mental_breaks.md) |
| 현재 무드·기분 | Current mood | 현재 반응 상태; 목표값과 구분 | [기분](../systems/03_needs_mood_mental_breaks.md) |
| 정신 이상 | Mental break | 통상 통제·작업에서 벗어나는 행동 상태 | [기분](../systems/03_needs_mood_mental_breaks.md) |
| 징집 | Drafting | 자율 생활보다 전술 명령을 우선하는 조작 | [전투](../systems/10_combat_defense_equipment.md) |
| 업무 종류 | Work type | 작업표에서 배정하는 업무 범주 | [작업](../systems/04_work_priorities_jobs.md) |
| 일감·작업 | Job | 특정 대상에 대해 수행하는 행동 단위 | [작업](../systems/04_work_priorities_jobs.md) |
| 작업 지시서·주문 | Bill | 제작대에서 반복·목표량 등을 지정하는 생산 의도 | [생산](../systems/07_food_agriculture_production.md) |
| 예약 | Reservation | 재구현에서 자원·목표를 중복 사용하지 않도록 확보하는 계약 | [의존성](02_system_dependencies.md) |
| 시간표 | Schedule | 시간대에 따른 생활 우선 행동 | [작업](../systems/04_work_priorities_jobs.md) |
| 허용 구역 | Allowed area | 행동 목적지를 제한하는 공간 정책; 절대 통행 금지와 구분 | [작업](../systems/04_work_priorities_jobs.md) |
| 홈 구역 | Home area | 청소·수리·화재 대응 등의 운영 범위와 연결 | [건설](../systems/05_building_rooms_zones.md) |
| 청사진 | Blueprint | 아직 완성되지 않은 건축 계획 | [건설](../systems/05_building_rooms_zones.md) |
| 방 | Room | 경계와 구조에서 판정되는 공간 단위 | [건설](../systems/05_building_rooms_zones.md) |
| 저장 구역 | Stockpile | 품목 필터와 우선순위가 있는 저장 위치 | [물류](../systems/06_items_storage_logistics.md) |
| 스택 | Stack | 동일한 조건의 물품을 수량으로 묶은 개체 | [물류](../systems/06_items_storage_logistics.md) |
| 열화 | Deterioration | 노출 등으로 인한 물건의 내구도 저하 | [물류](../systems/06_items_storage_logistics.md) |
| 부패 | Rot / Spoilage | 시간·온도와 관련된 유기물 보존 상태 변화 | [식량](../systems/07_food_agriculture_production.md) |
| 영양 | Nutrition | 음식 섭취·동물 사료 수요 계산에 쓰는 양 | [식량](../systems/07_food_agriculture_production.md) |
| 출력·소비 전력 | W | 순간적인 전력 공급·수요 | [전력](../systems/08_power_temperature_fire.md) |
| 저장 에너지 | Wd | 게임 내 하루 기준의 전력×시간 단위 | [전력](../systems/08_power_temperature_fire.md) |
| 신체 능력 | Capacity | 이동·조작·의식 등 건강에서 파생되는 기능 | [건강](../systems/09_health_medical_body.md) |
| 치료 | Tend | 상처·질환에 대한 처치; 즉시 완치와 구분 | [건강](../systems/09_health_medical_body.md) |
| 엄폐 | Cover | 사격 상황에서 몸을 보호하는 공간 요소 | [전투](../systems/10_combat_defense_equipment.md) |
| 방어구 관통력 | Armor penetration | 방어 판정에 영향을 주는 공격 속성 | [전투](../systems/10_combat_defense_equipment.md) |
| 우리 | Pen | 해당 동물을 관리하는 울타리·문·관리 영역 | [동물](../systems/11_animals_taming_ranching.md) |
| 스토리텔러 | Storyteller | 사건의 성향·간격·강도에 관여하는 진행 장치 | [사건](../systems/12_storyteller_incidents_difficulty.md) |
| 사건 | Incident | 습격·방문·기상 등 발생 단위 | [사건](../systems/12_storyteller_incidents_difficulty.md) |
| 자산 | Wealth | 위협 산정 등에 쓰이는 정착지 가치; 은 잔액과 다름 | [사건](../systems/12_storyteller_incidents_difficulty.md) |
| 습격 포인트 | Raid points | 위협 규모를 구성하는 계산 기준; 적 수와 일대일 대응 아님 | [사건](../systems/12_storyteller_incidents_difficulty.md) |
| 연구 진행 | Research progress | 해금 전 누적 연구량 | [연구](../systems/13_research_technology_progression.md) |
| 시장가치 | Market value | 물건의 기준 가치 평가; 실제 거래 가격과 다름 | [물류](../systems/06_items_storage_logistics.md) |
| 우호도 | Goodwill | 세력 사이 관계 평가 | [외교](../systems/14_factions_trade_prisoners.md) |
| 포로 저항 | Resistance | 모집 시도를 시작하기 전 낮춰야 하는 값 | [포로](../systems/14_factions_trade_prisoners.md) |
| 상단 | Caravan | 인원·동물·물자를 묶은 월드 여행 집단 | [이동](../systems/15_caravans_world_travel.md) |
| 캠프 | Camp | 상단이 임시로 활동하는 로컬 맵 | [이동](../systems/15_caravans_world_travel.md) |
| 수송 포드 | Transport pod | 기본 게임의 일회용 운송 수단 | [이동](../systems/15_caravans_world_travel.md) |
| 임무 | Quest | 목표·조건·보상이 연결된 도전 | [임무](../systems/16_quests_endings.md) |
| 임무 수락 기한 | Offer expiry | 임무를 시작하기로 결정할 수 있는 기한 | [임무](../systems/16_quests_endings.md) |
| 논리 틱 | Simulation tick | 제안 데이터에서 사용하는 게임 진행 시간 단위 | [기반](../systems/18_simulation_save_mods.md) |

## 2. DLC 관련 용어

| 용어 | 영문 | 문서에서의 의미 | 상세 |
| --- | --- | --- | --- |
| 명예·작위 | Honor / Title | 개인의 제국 관련 성장·지위 | [Royalty](../dlc/01_royalty.md) |
| 초집중 | Psyfocus | 명상으로 준비하는 초능력 자원 | [Royalty](../dlc/01_royalty.md) |
| 신경열 | Neural heat | 연속 초능력 사용의 단기 부담 | [Royalty](../dlc/01_royalty.md) |
| 제국 허가 | Permit | 특정 지원을 이용할 권한 | [Royalty](../dlc/01_royalty.md) |
| 신념 체계 | Ideoligion | 집단·인물의 가치와 생활 규범 | [Ideology](../dlc/02_ideology.md) |
| 밈·교리 | Meme / Precept | 핵심 신념 축과 세부 규범 | [Ideology](../dlc/02_ideology.md) |
| 의례 | Ritual | 신념 체계의 사회적 활동 | [Ideology](../dlc/02_ideology.md) |
| 이종형 | Xenotype | 유전자 구성과 관련된 인물 유형 | [Biotech](../dlc/03_biotech.md) |
| 유전자 팩 | Genepack | 조합·이식에 활용하는 유전자 정보 | [Biotech](../dlc/03_biotech.md) |
| 메카니터 | Mechanitor | 메카노이드를 통제하는 인간 | [Biotech](../dlc/03_biotech.md) |
| 통제 대역폭 | Bandwidth | 메카노이드 통제량 제약 | [Biotech](../dlc/03_biotech.md) |
| 독성 오염 | Pollution | 폐기물과 연결되는 환경 변화; 일반 오물과 다름 | [Biotech](../dlc/03_biotech.md) |
| 격리 강도 | Containment strength | 이상 개체의 수용 환경을 평가하는 요소 | [Anomaly](../dlc/04_anomaly.md) |
| 초능력 의식 | Psychic ritual | Anomaly의 초자연적 효과 수행 구조 | [Anomaly](../dlc/04_anomaly.md) |
| 중력선 | Gravship | 생활 시설을 포함해 이동하는 정착지 | [Odyssey](../dlc/05_odyssey.md) |
| 중력 닻 | Grav anchor | 중력선 이륙 후 출발 맵 보존과 관련된 시설 | [Odyssey](../dlc/05_odyssey.md) |
| 랜드마크 | Landmark | 탐험 장소의 특징을 구성하는 요소 | [Odyssey](../dlc/05_odyssey.md) |

## 3. 반드시 구분할 개념

| 서로 다른 것 | 구분 이유 |
| --- | --- |
| 낮은 기술 / 업무 불가 | 전자는 성능, 후자는 수행 자격의 문제 |
| 낮은 기분의 위험 / 실제 정신 이상 | 경고 진입과 통제 상실의 시점이 다름 |
| 높은 우선순위 / 동일 우선순위 | 동일 값에서는 별도 선택 순서가 작동 |
| 전체 재고 / 가용 재고 / 예약 재고 | 존재하는 물건이 모두 새 작업에 사용 가능한 것은 아님 |
| 열화 방지 / 부패 방지 | 내구도와 식품 보존을 다른 상태로 취급 |
| 치료 질 / 수술 성공 / 면역 진행 | 서로 다른 과정과 결과를 측정 |
| 시장가치 / 거래 가격 / 정착지 자산 | 개체 평가·교역 조건·위협 맥락이 다름 |
| 저항 0 / 모집 성공 | 모집 시도 자격과 실제 합류가 다름 |
| 전력 W / 에너지 Wd | 공급률과 누적 저장량이 다름 |
| 기본 게임의 캠프 / Odyssey 중력선 | 임시 현장과 이동식 생활 기반의 차이 |
| 공식 무료 업데이트 / 유료 DLC | 출시 시기가 같아도 기능 소유 범위가 다름 |
| 문헌 확인 / 직접 실행 검증 | 근거 수준이 다르며 같은 통과 표시를 쓰면 안 됨 |
