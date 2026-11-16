# 21. 원작·DLC·Together의 범위와 규칙 차이

> 작성일: 2026-11-13 | 범위: DS/RoG 본문을 위한 제품 구분과 SW/Hamlet/DST 비교 | 문서 버전: 1.0  
> SW·Hamlet·DST 전체 콘텐츠를 전수 역기획한 문서는 아니다. [목차](00_index.md)

## 1. 제품을 먼저 구분해야 하는 이유

**[자료 확인]** Klei는 Don't Starve Together가 개발 과정에서 원작과 기능적으로 갈라져 별도 제품이 되었다고 설명한다. 따라서 DST를 단순히 플레이어 수만 늘린 DS로 간주하면 안 된다. [S1]

**[설계 해석]** 이름·그래픽·재료가 같아도 식량 생산, 전투 비용, 부활, 캐릭터 성장의 규칙이 달라지면 전체 경제가 달라진다. 역기획에서 제품 구분은 서문에 한 번 쓰는 정보가 아니라 모든 수치와 예외 규칙에 붙어야 하는 키다.

## 2. 이 문서집의 기준 프로필

| 구분 | 본 문서집의 처리 |
|---|---|
| DS | 확장팩을 비활성화한 PC 싱글플레이 원작 |
| RoG | PC 원작에 Reign of Giants를 적용한 규칙 |
| 패치 기준 | 2023 Mega Update에서 확인되는 변경을 반영한 공개 자료 기반 |
| 작성 시점 | 2026-11-13. 설치된 최신 빌드 번호를 직접 확보한 것은 아님 |
| 세계 설정 | 기본 설정을 먼저 설명하되, 예시·실험용 변경은 별도 표시 |
| 캐릭터 | 공통 규칙과 캐릭터 예외를 분리 |
| 모드 | 기본 분석에서 제외. 모드 추가 정보나 기능을 원작으로 간주하지 않음 |
| 플랫폼 | PC 기준. 콘솔·모바일의 패치와 UI가 같은지는 별도 검증 |
| SW/Hamlet | 독립적인 환경·경제 확장의 특징과 확장 설계 관점만 비교 |
| DST | 혼동하기 쉬운 차이를 기록. 최신 전체 리워크·멀티플레이 구현은 범위 밖 |

**[자료 확인]** 공식 안내는 DLC를 소유해도 새 게임의 제품 선택에서 원작 DS만 활성화하여 시작할 수 있다고 설명한다. [S2] DLC의 소유 여부와 특정 저장 세계가 사용하는 규칙을 동일하게 취급하지 않는다.

## 3. 제품별 분석 축

| 제품 | 공개 자료로 확인한 핵심 범위 | [설계 해석] 주요 의사결정 변화 | 본문 처리 |
|---|---|---|---|
| DS | 황야에서 환경·생물을 이용하는 생존 | 시간과 준비 자원을 배분하며 지식을 축적 | 전체 시스템의 기준 |
| RoG | 계절·캐릭터·생물·바이옴 등 확장 [S3] | 환경 대비의 종류가 늘고 기존 거점의 취약점이 바뀜 | 해당 문서의 RoG 분기 |
| Shipwrecked | 열대 군도에서의 생존 [S4] | 분리된 지역의 왕복과 원정 준비가 더 큰 설계 축이 됨 | 이 문서의 비교 설명 |
| Hamlet | 돼지 사회의 상점·거래·주거·유적 탐험 [S5] | 야생 자원 이외에 사회적 교환과 도시 접근을 고려 | 이 문서의 비교 설명 |
| Together | 협력 가능한 독립 멀티플레이 생존 [S6] | 노동·자원·정보를 여러 플레이어가 공유 | 혼동 방지용 비교 |

표의 의사결정 변화는 공식적인 내부 설계 의도를 인용한 것이 아니라 공개된 범위를 바탕으로 한 분석이다.

## 4. 원작과 RoG의 주요 경계

| 시스템 | 주의할 구분 | 관련 문서 |
|---|---|---|
| 계절 | 원작의 계절과 RoG의 사계절 구조를 분리 | [02](02_time_day_night.md), [12](12_seasons_weather_temperature.md) |
| 시작 조건 | RoG의 기본 시작 계절을 DST의 가을 시작과 혼동하지 않음 | [12](12_seasons_weather_temperature.md) |
| 환경 | RoG의 젖음·과열·환경 위험을 원작 모든 세계에 소급하지 않음 | [03](03_survival_stats.md), [12](12_seasons_weather_temperature.md) |
| 바이옴·재료 | 확장 지역의 자원을 원작 기본 생성물로 쓰지 않음 | [05](05_world_generation_exploration.md), [06](06_resources_tools_gathering.md) |
| 식량 | 확장 재료가 포함된 조합을 원작의 기본 레시피와 구분 | [10](10_food_cooking_spoilage.md) |
| 캐릭터 | 기본 제공·해금·확장 소속과 고유 능력 구분 | [04](04_characters.md) |
| 거대 생물 | 계절과 위협의 연계를 제품별로 구분 | [15](15_bosses_raids_events.md) |

세부 규칙의 출처는 연결 문서에 있다. 이 표는 수치를 다시 복제하는 대신 잘못 섞기 쉬운 경계를 안내한다.

## 5. DS/RoG와 DST를 섞었을 때 생기는 설계 오류

| 혼동 | 왜 문제가 되는가 | 문서에서의 처리 |
|---|---|---|
| 같은 방어구 이름이면 피해 계산도 같다고 가정 | 방어 효율·파손 비용·전투 기대값이 달라짐 | [13](13_combat_armor.md)의 DS 규칙을 사용 |
| DST 농사의 상세 규칙을 원작 농장에 적용 | 성장·투입·관리 노동이 다른 생산 경제가 됨 | [11](11_farming_animals_sustainability.md)의 원작 구조 유지 |
| 캐릭터 리워크·성장 기능을 원작에 적용 | 기본 생존 비용과 고유 능력의 범위가 바뀜 | [04](04_characters.md)에서 원작 고유 능력 분리 |
| DST 보스 수치와 발생 조건을 사용 | 원정 비용·등장 위험·보상 계획이 달라짐 | [15](15_bosses_raids_events.md)에서 제품별 범위 확인 |
| 유령·월드 유지 정책을 원작 사망에 적용 | 세션 종료와 부활의 의미가 달라짐 | [17](17_adventure_death_progression.md)의 진행 분기 사용 |
| 서버 정지·롤백 정책을 싱글플레이 저장으로 사용 | 시간·세계 소유권·복구 경계가 달라짐 | [19](19_data_architecture_save.md)에 별도 구조로 기록 |
| DST의 최신 지상·지하 콘텐츠를 원작에 포함 | 지역·보상·생태 관계가 새로 생김 | 원작 [16](16_caves_ruins.md) 범위를 유지 |

이 표는 DST의 현행 상세 규칙을 확정하는 표가 아니다. 원작을 역기획할 때 가져오면 안 되는 다른 제품의 규칙 범주를 식별한다.

## 6. 2023년 이전 자료의 처리

**[자료 확인]** 2023 Mega Update는 원작에도 게임플레이와 편의 기능 변경을 도입했다. 공식 공지는 이전 규칙을 위한 `pre2023update` 브랜치도 안내한다. [S7]

따라서 오래된 공략과 현재 공개 위키 내용이 다르면 다음 순서로 정리한다.

1. 원작인지 DST인지 먼저 확인한다.
2. DLC와 플랫폼을 확인한다.
3. 2023 이전 브랜치의 설명인지 확인한다.
4. 변경 공지에서 해당 규칙이 바뀌었는지 확인한다.
5. 그래도 불명확하면 특정 빌드의 검증 대상으로 남긴다.

| 영향을 받은 문서 | 문서에서 확인할 것 |
|---|---|
| [07 인벤토리](07_inventory_equipment_durability.md) | 표시 방식과 제작 재료 접근의 버전 경계 |
| [10 음식](10_food_cooking_spoilage.md), [11 생산](11_farming_animals_sustainability.md) | 조리·새장 자료의 적용 시점 |
| [15 보스](15_bosses_raids_events.md), [16 지하](16_caves_ruins.md) | 전투·재생성 관련 변경 |
| [17 진행](17_adventure_death_progression.md) | 저장·진행 설명에서의 구형 자료 배제 |

정확한 변경 규칙은 해당 문서의 근거를 따른다. 2023 공지가 존재한다는 이유로 이후 모든 플랫폼이 같은 시점에 같은 상태가 되었다고 추정하지 않는다.

## 7. Shipwrecked의 확장 설계 관점

**[자료 확인]** Shipwrecked는 Don't Starve의 확장이며 열대 군도를 배경으로 한다. RoG가 반드시 필요한 것은 아니다. [S4], [S8]

**[설계 해석]** 지역이 분리된 생존 환경을 설계하면 이동은 단순히 목적지까지의 거리가 아니라 출발 준비·중간 보급·돌아올 여유의 문제로 확장된다. 하나의 대형 거점에 모든 기능을 모으는 전략과 여러 중간 기점을 갖는 전략의 비교가 중요해진다.

**[재구성 설계] SW를 상세 확장할 때 필요한 별도 문서:**

- 지역 간 이동 수단의 상태·장비·소비·손실 규칙.
- 육지와 수상에서 사용 가능한 행동의 차이.
- 새로운 환경 주기와 자산 손상·대피 방식.
- 수상 자원 생산과 보존·운반의 비용.
- 지역 전환 때 캐릭터·아이템·날씨를 유지하는 규칙.

이 항목들은 후속 분석의 분해 기준이며 본 문서집에서 SW의 세부 수치까지 검증했다는 의미가 아니다.

## 8. Hamlet의 확장 설계 관점

**[자료 확인]** 공식 Hamlet 소개는 돼지 사회와의 거래, 집 구매·수리, 함정이 있는 유적 탐험, 새로운 생물·계절을 제시한다. [S5] Hamlet은 기본 Don't Starve가 필요하며 RoG나 SW가 필수는 아니다. [S9]

**[설계 해석]** 상점과 주거가 존재하면 물자의 가치는 직접 생존에 쓰는 가치와 다른 자원으로 교환하는 가치로 나뉜다. 안전한 경제 활동을 위해 사회적 환경을 이해해야 하며, 도시가 편리하더라도 모든 야생 위험을 대체하지 않는 균형이 필요하다.

**[재구성 설계] Hamlet을 상세 확장할 때 필요한 별도 문서:**

| 분석 대상 | 답해야 할 질문 |
|---|---|
| 거래 | 무엇이 통화가 되고 가격·재고·갱신은 어떻게 작동하는가? |
| 소유권과 반응 | NPC·시설의 소유권을 침해했을 때 누가 어떻게 반응하는가? |
| 주거·실내 | 실내외의 환경과 시설 규칙이 어디서 달라지는가? |
| 유적·함정 | 정보·도구·건강을 어떤 보상과 교환하는가? |
| 주기적 위험 | 장기 주기와 일상 경제가 어떻게 충돌하는가? |

## 9. 멀티플레이로 옮길 때 달라지는 설계 질문

아래는 **[재구성 설계]**이며 DST의 실제 네트워크 구현 설명이 아니다.

| 질문 | 싱글플레이 중심 모형 | 여러 플레이어를 고려할 때 |
|---|---|---|
| 시간 | 한 사람의 준비·정지 | 누가 정지 권한을 가지는가? |
| 노동 | 한 사람의 동선 | 분업으로 생산량이 얼마나 늘어나는가? |
| 자원 | 한 사람의 수요와 보관 | 공동 재고·사적 소비·경합을 어떻게 처리하는가? |
| 위협 | 한 사람의 생존 압력 | 인원·분산·역할에 따라 위험이 어떻게 변하는가? |
| 사망 | 진행 종료·부활 | 남은 플레이어와 유령·복귀를 어떻게 연결하는가? |
| 세계 | 한 진행의 소유 | 호스트·서버·접속 종료의 영향을 어떻게 정의하는가? |
| 지식 | 개인의 발견 | 정보 공유가 난도를 얼마나 낮추는가? |

원작의 모든 숫자를 유지하고 접속 인원만 늘리면 분업으로 해소되는 비용과 공유할 수 없는 비용의 균형이 달라질 수 있다. 이를 조절하려면 네트워크 기능 구현과 함께 게임 경제를 다시 검토해야 한다.

## 10. 데이터·문서 확장 규약

```text
RuleKey = Product / DLCProfile / PatchBaseline / Platform / WorldSettings
ContentKey = RuleKey + LocalContentId
```

**[재구성 설계]** 같은 아이템 이름을 공유하더라도 규칙 키가 다르면 개별 데이터로 관리한다. 다만 완전히 같은 부분은 공통 정의로 두고 차이를 덮어쓰는 형태를 사용할 수 있다. 덮어쓰기의 우선순위는 [19번 문서](19_data_architecture_save.md)에 정의한다.

모든 신규 문서는 적용 제품, 대표 규칙, 원본과의 차이, 근거 접근 방식, 검증하지 못한 항목을 포함한다. 검증되지 않은 타제품 규칙을 공통 규칙으로 승격하지 않는다.

## 11. 출처

- [S1 — Klei, Didn't you say DST was an update to DS?](https://support.klei.com/hc/en-us/articles/360029556992-Didn-t-you-say-DST-was-an-update-to-DS-What-s-the-Deal): 제품 분리의 공식 설명. 본문 직접 열람.
- [S2 — Klei, Can I still play regular Don't Starve if I have DLC?](https://support.klei.com/hc/en-us/articles/360031045392-Can-I-still-play-regular-Don-t-Starve-if-I-have-DLC-Reign-of-Giants-Shipwrecked-or-Hamlet): 원작과 DLC의 시작 설정. 본문 직접 열람.
- [S3 — Klei, Don't Starve 공식 게임 소개](https://www.klei.com/games/dont-starve/): RoG 제품 범위. 본문 직접 열람.
- [S4 — Klei, What is Don't Starve Shipwrecked?](https://support.klei.com/hc/en-us/articles/360029880131-What-is-Don-t-Starve-Shipwrecked): 제품 정의. 본문 직접 열람.
- [S5 — Klei, What is Don't Starve: Hamlet?](https://support.klei.com/hc/en-us/articles/360029879971-What-is-Don-t-Starve-Hamlet): 도시·거래·주거·유적의 공식 소개. 본문 직접 열람.
- [S6 — Klei, What is Don't Starve Together?](https://support.klei.com/hc/en-us/articles/360029556012-What-is-Don-t-Starve-Together): 협력 멀티플레이 제품 정의. 검색 인덱스 확인.
- [S7 — Klei 개발자 공지, The Don't Starve Mega Update is now live!](https://kleiforums.com/forums/topic/147423-the-dont-starve-mega-update-is-now-live/): 2023-04-27 패치 경계. 검색 인덱스에서 공지 본문 확인; 직접 열기는 403.
- [S8 — Klei, Do I need Reign of Giants for Shipwrecked?](https://support.klei.com/hc/en-us/articles/360029881071-Do-I-need-Reign-of-Giants-for-Shipwrecked): 확장팩 의존 관계. 본문 직접 열람.
- [S9 — Klei, Do I need Reign of Giants or Shipwrecked to play Hamlet?](https://support.klei.com/hc/en-us/articles/360029555292-Do-I-need-Reign-or-Giants-or-Shipwrecked-to-play-Hamlet): Hamlet 의존 관계. 검색 인덱스 확인.
- [S10 — Klei, Will Hamlet work with Don't Starve Together?](https://support.klei.com/hc/en-us/articles/360029880871-Will-Hamlet-work-with-Don-t-Starve-Together): 제품 대상 구분. 본문 직접 열람. 과거의 계획 진술을 향후 약속으로 해석하지 않음.

[S1]: https://support.klei.com/hc/en-us/articles/360029556992-Didn-t-you-say-DST-was-an-update-to-DS-What-s-the-Deal
[S2]: https://support.klei.com/hc/en-us/articles/360031045392-Can-I-still-play-regular-Don-t-Starve-if-I-have-DLC-Reign-of-Giants-Shipwrecked-or-Hamlet
[S3]: https://www.klei.com/games/dont-starve/
[S4]: https://support.klei.com/hc/en-us/articles/360029880131-What-is-Don-t-Starve-Shipwrecked
[S5]: https://support.klei.com/hc/en-us/articles/360029879971-What-is-Don-t-Starve-Hamlet
[S6]: https://support.klei.com/hc/en-us/articles/360029556012-What-is-Don-t-Starve-Together
[S7]: https://kleiforums.com/forums/topic/147423-the-dont-starve-mega-update-is-now-live/
[S8]: https://support.klei.com/hc/en-us/articles/360029881071-Do-I-need-Reign-of-Giants-for-Shipwrecked
[S9]: https://support.klei.com/hc/en-us/articles/360029555292-Do-I-need-Reign-or-Giants-or-Shipwrecked-to-play-Hamlet
[S10]: https://support.klei.com/hc/en-us/articles/360029880871-Will-Hamlet-work-with-Don-t-Starve-Together
