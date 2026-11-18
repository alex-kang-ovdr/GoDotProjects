# 방·연구·정착 성장 고도화 기획

## 1. 방은 조건 검사와 사용 효과를 분리

숨 4.0은 완공된 문으로 경계를 끊고, 내부6~64칸을 침실·식당·온실로 분류한다. 침실은 실제 수면 회복 +25%, 식당은 식사 시 스트레스 -3, 온실은 공급이 맞는 동안 성장 +20%다. 이 규칙은 현재 웹판용이며 원작 방 표와 같지 않다.

다음 구조는 `RoomDefinition`의 판정과 `RoomEffectDefinition`의 실제 사용 보너스를 분리한다. 문이 구조상 방 경계라는 사실, 문이 열려 유체가 이동한다는 사실, 특정 대원이 방의 설비를 사용할 수 있다는 사실은 각각 검사한다.

```text
RoomDefinition
  minCells, maxCells, minimumHeight?, requiredTags[], forbiddenTags[]
  decorationRule?, backgroundCoverage?, exclusivityGroup
RoomInstance
  cells[], buildingIds[], detectedType, requirementResults[]
RoomUseEvent
  crewId, roomId, facilityId, action, completedAt
```

`room.valid=true`만으로 모든 대원에게 효과를 주지 않는다. 수면·식사·용변·통과 이벤트가 실제 발생한 대원에게 효과를 부여한다. 원작의 방 관련 사기 효과는 이용 조건과 배타 그룹을 가진다. [C16 Morale](https://oxygennotincluded.wiki.gg/wiki/Morale)

## 2. 복원한 주요 방 조건

수치와 조건은 현재 공개 DB/위키 참조이며 대상 빌드를 고정한 실행파일 추출값은 아니다. 특정 방에 허용되는 건조물의 전체 태그 목록은 별도 복원 대상이다.

| 방 | 면적범위 | 핵심 필수조건 | 금지조건 | 사기 |
|---|---:|---|---|---:|
| Barracks | 12~64 | 침상≥1 | 산업시설 | +1 |
| Luxury Barracks | 12~64 | 편안한침상≥1, 장식≥1, 높이4 | 기본침상·산업시설 | +2 |
| Private Bedroom | 24~64 | 편안한침상1, 장식≥2, 높이4, 뒷벽피복 | 기본침상·산업시설 | +3 |
| Mess Hall | 12~64 | 식탁≥1 | 산업시설 | +3 |
| Great Hall | 32~120 | 식탁·장식·여가시설 | 산업시설 | +4 |
| Banquet Hall | 32~120 | 공동식탁·장식·여가시설·전시장신구 | 일반식탁·산업시설 | +6 |
| Latrine | 12~64 | 변기·세면설비 | 산업시설 | +1 |
| Washroom | 12~64 | 수세식변기·배관세면설비 | 간이화장실·산업시설 | +2 |
| Park | 12~64 | 공원표지·야생식물2 | 산업시설 | +3 |
| Nature Reserve | 32~120 | 공원표지·야생식물4 | 산업시설 | +6 |
| Greenhouse | 12~96 | Farm Station | 전체금지태그미복원 | 직접사기값미복원 |

면적과 태그는 [C12 Rooms](https://onidb.wiki/rooms), [C13 Sets](https://onidb.wiki/sets), 침실은 [C18 Private Bedroom](https://oxygennotincluded.wiki.gg/wiki/Private_Bedroom), 위생은 [C15 Washroom](https://onidb.wiki/rooms/washroom), 온실은 [C19 Greenhouse](https://onidb.wiki/sets/greenhouse)를 기준으로 했다. 행별 필드 출처는 `colony-records.json`에 있다.

### 버전 구분이 필요한 조건

- Great Hall의 옛 자료는 사기+6·장식20 이상인 단일 항목을 요구한다. 현재 위키·DB는 사기+4와 장식 건조물 범주를 사용한다. `room.great_hall_legacy`는 비교용으로 격리한다.
- 2025년11월700348/700386 업데이트는 Banquet Hall을 추가하고 Laboratory의 조명 요구를 제거했다. Laboratory를 옛 요구로 구현하면 최신 무료 업데이트 기준과 달라진다.
- Great Hall의 개별 위키 필수목록에는 여가시설이 생략되어 있으나 해당 페이지 팁과 현재DB에는 남아 있다. 이번 표는 DB의 작업 가설을 기록하고 `requirements_conflict=true`로 표시한다. 대상 빌드에서 실제 방 판정으로 확정하기 전에는 검증 완료로 표시하지 않는다.

근거: [C25 공식 QoL](https://kleiforums.com/forums/topic/168832-game-update-november-2025-quality-of-life-update-700348-700386/), [C30 이전 Great Hall](https://oxygennotincluded.fandom.com/wiki/Great_Hall), [C37 현재 Great Hall](https://oxygennotincluded.wiki.gg/wiki/Great_Hall), [C14 DB](https://onidb.wiki/rooms/great-hall).

### 침실의 회복 단위

Barracks의`+100% stamina per cycle`, Private Bedroom의`+200% stamina per cycle`은 현재 공개 설명이다. 이를 수면 전체 회복량에 곱하는2배·3배로 바로 변환하면 안 된다. 기본 수면·침상·방의 각 회복 원인을 나눠 정확한 원작 합산 방식을 실측해야 한다. [C17 Barracks](https://oxygennotincluded.wiki.gg/wiki/Barracks), [C18 Private Bedroom](https://oxygennotincluded.wiki.gg/wiki/Private_Bedroom)

## 3. 온실 보너스의 재설계

원작 참조에서는 Farm Station과 대원의 작물관리·비료 흐름이 작물 성장을 가속한다. 방을 지었다는 이유만으로 모든 농장이 자동1.2배 되는 v4와 구조가 다르다. 온실 판정, 작업 가능 여부, 비료 제조, 작물 관리 작업, 시간제 성장 효과를 구분해야 한다. [C19](https://onidb.wiki/sets/greenhouse)

제안 작업 모델:

1. 농장별 식물ID와 성장제약을 평가한다.
2. 작물 관리 가능 종인지 확인한다.
3. 관리 기술이 있는 대원이 비료를 제조·운반한다.
4. 실제 관리 작업을 마친 식물에만 만료 시각이 있는 효과를 적용한다.
5. 만료·수확·성장 정지에서 효과 처리를 명시한다.

이 단계는 제안 계약이다. 원작의 농업 기술별 세부 수치·종별 예외·비료 소모량을 복원한 뒤 구체값을 채운다. 미확정 값을 단순 1.2로 채워 원작 규칙으로 표시하지 않는다.

## 4. 연구를 단일100점에서 의존성 그래프로

현재 웹판은 연구작업 하나가0~100까지 차며,15·35·45·60등 해금 문턱이 여러 설비에 분산되어 있다. 원작 참조는 연구 유형과 물질 비용·기술 선행 관계가 다르다.

| 연구 유형 | 장비 | 확인한 물질비용 | 작업 제약 |
|---|---|---:|---|
| Novice | Research Station | 흙50kg/point | 대원작업과전력 |
| Advanced | Super Computer | 물50kg/point | Advanced Research 기술과대원작업 |

[C23 Research Station](https://oxygennotincluded.wiki.gg/wiki/Research_Station), [C24 Super Computer](https://oxygennotincluded.wiki.gg/wiki/Super_Computer)

원작 계열에서도 Base Game과 Spaced Out의 후반 연구 유형이 다르므로 `researchProfile`로분리해야 한다. 이번 데이터팩은기초·고급 단위를 확보했고 전체 기술 트리 완전 복원을 주장하지 않는다.

공개 DB에 Basic Farming15점 → Meal Preparation20점 → Agriculture50점이표시된다. 그러나 표시 총점만으로 기초/고급 분해를 확정할 수 없으므로`typed_costs=null`로두었다. 해금 목록도 DLC 표식과 방사선 설비가 혼재하여 기본 게임에 전체 일괄 적용하면 안 된다. [C31](https://onidb.wiki/techs/basic-farming), [C32](https://onidb.wiki/techs/meal-preparation), [C33](https://onidb.wiki/techs/agriculture)

### 제안 연구 레코드

```text
TechDefinition
  id, profile, prerequisites[]
  costsByType { novice, advanced, ... }
  unlockBuildingIds[], unlockRecipeIds[], unlockCapabilities[]
ResearchState
  selectedTechId, completedTechIds[], progressByTechAndType
```

연구 UI는 `필요 흙`, `필요 물`, `필요 작업시간`, `필요 대원기술`을 별도로 보여준다. 빠른 연구원이 연구시간을 줄여도 50kg/point라는 물질비용이 자동으로 줄어들지 않도록 진행량과 재료소비를 한 거래로 묶는다. 이 관계는 현재 웹처럼 매초 물을 고정 소모하면서 연구속도만 올리는 방식과 결과가 다르다.

## 5. 생산과 생활을 연결한 성장 단계

다음은 **웹판 고도화를 위한 기획안**이다. 원작의 퀘스트 목록이나 고정 승리 단계를 복사한 것이 아니다.

| 단계 | 사용자의 결정 | 핵심 병목 | 완료를 판단할 실제 증거 |
|---|---|---|---|
| 착륙·응급생존 | 초기산소·식량·화장실위치 | 접근성·초기비축 | 1주기호흡과섭취예산 |
| 농업정착 | 토양작물 또는급수작물 | 흙·물·작업자 | 수확/소비/부패의순생산 |
| 생활분화 | 침실·식당·위생구역배치 | 통근·설비대기·사기 | 실제사용효과·기술유지 |
| 순환생산 | 오수재이용·전해·발전 | 배관역류·열·저장 | 입력/출력/잉여/손실장부 |
| 안전확장 | 장비·구조·고온탐사 | 보급·회복·우회경로 | 왕복산소예산·구조시나리오 |
| 지속운영 | 자원고갈과장기열관리 | 자원원천·폐열·부품 | 30주기추세와최악상태복구 |

기존 20개 목표는 계속 사용할 수 있으나, 방을 만들고 타이머만 채우는 목표에`현재 장기수지`를보조 지표로 추가한다. 흙과 조류를 소모하는 시스템은 당장 안정적이어도 자립이라 부르기 어렵다. 비축 예상 고갈주기, 산소 부족시간, 음식 부패, 전력 중단, 열 상승률을 같이 표시한다.

## 6. 검증용 시나리오

| ID | 준비 | 기대 결과 |
|---|---|---|
| ROOM-01 | 11/12/64/65칸 Barracks | 경계값대로 판정 |
| ROOM-02 | 산업시설사용중지 | 존재태그가금지라면전원상태와무관하게무효 |
| ROOM-03 | 방을통과만하고식사안함 | 식당사기미지급 |
| ROOM-04 | 식당→대식당이용 | 배타보너스교체,누적합산금지 |
| ROOM-05 | 침실뒷벽1칸누락 | 누락위치와실패이유표시 |
| ROOM-06 | 문을열어둠 | 구조방경계와기체교환별도작동 |
| FARM-01 | 온실있으나관리작업없음 | 자동성장배율미지급 |
| TECH-01 | 두연구원이마지막1점동시진행 | 진행·물질소비·해금중복없음 |
| TECH-02 | 과학속성증가 | 시간변화, point당재료불변 |
| SAVE-01 | 버프만료1초전저장 | 로드시남은시간정확히복원 |
| VERSION-01 | legacy방/Waterweed행로딩 | 현행프로필에섞이지않음 |

이는 새로 제안하는 수용 기준이며 기존 4.0의 71개 테스트에 이미 포함되었다고 보고하지 않는다.

## 7. 우선 구현 백로그

**P0:** 원작 참조 프로필과 웹 조정 프로필 분리, 단위 정규화, source 필드 검증, 음식 ID/kcal 재고, 방 정의 데이터 외부화.

**P1:** 사기·관심·기술비용, 24블록 일정, 위치별 식품 보관, 연구 유형·DAG, 실제 욕실 잉여수, 질식 구조.

**P2:** 작물관리·장식·시간제 버프, 고급 요리, 식물별 환경, 특성·질병·가축의 자원 변환.

**P3:** DLC별 확장 레지스트리, 바이오닉 대원, 방사선·돌연변이·수중 전용 콘텐츠. 기반 프로필의 회귀를 통과한 후 별도 플래그로 적용.

기획 완료 조건은 새 설비 개수보다①출처·단위·버전 명시②실제 운반과 작업 소모③위기 원인 설명④복구 가능한 행동⑤저장 일관성이다. 문서와 정규화 테이블을 이 조건에 맞춰 유지한다.
