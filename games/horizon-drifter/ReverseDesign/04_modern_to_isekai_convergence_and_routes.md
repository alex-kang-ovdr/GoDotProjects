# 04. 현세편 루트, 수렴 조건 및 이세계편(데라 그란트) 구조

## 1. 현세편(사카이마치) 6대 히로인 루트 및 권장 공략 흐름 `[확인]`
현세편은 자유 분기 구조이지만, 아이템 계승 의존성과 보옥 회수 효율을 고려할 때 공략 아카이브에서 검증된 표준 순서는 다음과 같다.

| 순서 | 루트 ID | 핵심 테마 및 인물 | 필수 선행 계승물 | 주요 산출물 (보옥 / 아이템) |
|---:|---|---|---|---|
| 1 | `route_prologue` | 코다이 소포·리플렉터 가동·일상 도입 | 없음 | `jewel_found_1`, `item_kodai_letter`, `item_kanna_student_id` |
| 2 | `route_mitsuki` | 류조지 저택 방문·토장 감금 사건 (`char_mitsuki`, `char_ryuzoji`) | 없음 | `jewel_found_2`, `item_rope`, `item_silver_medal`, `item_gold_key` |
| 3 | `route_ayumi` | 지오테크닉스 해안 공사·도요토미의 음모 (`char_ayumi`, `char_toyotomi`) | 없음 | `jewel_found_3`, `item_magnetic_card`, `item_blue_card` |
| 4 | `route_kaori` | 뉴스 캐스터 카오리와 사옥 잠입 취재 (`char_kaori`) | `item_blue_card` (아유미 루트) | `jewel_found_4`, `item_chounenseki`, `item_doc_page20` |
| 5 | `route_mio` | 삼각산 전승·사당 지하 동굴 유적 탐사 (`char_mio`, `char_yuki`) | `item_silver_medal` (미츠키), `item_chounenseki` (카오리) | `jewel_found_5`, `item_white_medal`, `item_black_medal`, `item_mio_notebook`, `item_wooden_sword` |
| 6 | `route_eriko` | 보건교사의 정체(차원 감사관 에이릭 쿼드로)와 류조지 추적 (`char_eriko`) | 없음 (미츠키 이후 권장) | 차원 질서·류조지 정체 글로벌 플래그 (`flag_global_route_eriko_clear`) |
| 7 | `route_kanna` | 옥상 학생수첩 반환·푸른 목걸이의 비밀·붕괴 위기 구명 (`char_kanna`) | `item_kanna_student_id`, `item_chounenseki` (카오리) | `item_study_key` (아버지 서재의 열쇠) |

## 2. 현세편 → 이세계편 최종 수렴 조건 (`route_convergence`) `[확인]`
현세편에서 이세계편(에필로그)으로 전이하기 위해서는 단순 엔딩 1회 클리어가 아니라 **3중 수렴 게이트**를 모두 충족해야 한다.

1. **초기 시간대 서재 개방 (`node_study_unlock`)**:
   - 칸나 루트에서 얻은 `item_study_key`를 보유한 상태로 본편 극초반(`flag_local_study_early_luggage_intact` — 코다이의 짐이 아직 정리되지 않은 1일차 시점)으로 보옥 로드한다.
   - `loc_arima_study`를 개방하여 코다이의 연구 수기를 열람한다. `[확인]`
2. **최종 보옥 6 확보 (`node_study_clock_puzzle`)**:
   - 서재 내 괘종시계 뚜껑을 열고 오프닝 단서에 따라 문자판을 **`6 → 3`** 순서로 조작하여 `jewel_found_6`을 입수한다. `[확인]`
   - 이로써 리플렉터 디바이스의 모든 슬롯이 완충된다 (**PC-98 8/8개**, **SS·리메이크 10/10개** → `flag_global_all_jewels_collected`). `[확인]`
3. **6대 현세 루트 클리어 + 켄노미사키 삼각산 전이 (`node_convergence_cave`)**:
   - 전 보옥 완충 및 주요 현세 루트 진상 수렴 상태에서 켄노미사키(삼각산 동굴)로 이동하면 지진과 함께 시공이 왜곡되며 데라 그란트(`node_dg_arrival`)로 강제 전이된다. `[확인]`

## 3. 이세계편: 데라 그란트 (デラ＝グラント) 진행 구조 `[확인]`
이세계편에 돌입하면 A.D.M.S. 병렬 점프 기능이 비활성화되며, 게임플레이는 **서사 중심의 선형 커맨드 어드벤처**로 전환된다. `[확인]`

### 3.1 5단계 챕터 구조
1. **1장: 국경 보더 도착 & 세레스·아이리아 조우 (`node_dg_arrival`)**
   - 괴물이 배회하는 변경 국경(`loc_dg_border`)에 떨어진 타쿠야가 목소리를 잃은 여성 **세레스(`char_celes`)**를 구하고, 국경 여기사 **아이리아(`char_ailia`)**의 집(`loc_dg_ailia_house`)에 의탁한다. `[확인]`
2. **2장: 변경 정착, 유노의 탄생 & 성석 채굴장 (`node_dg_frontier_yuno`)**
   - 타쿠야와 세레스 사이에서 딸 **유노(`char_yuno`)**가 태어나고 생물 동료 **쿤쿤(`char_kunkun`)**이 합류한다. 이후 제도 체제의 습격·분리 과정을 거쳐 감독관 **바즈(`char_buzz`)**가 지배하는 성석 채굴장(`loc_dg_quarry`)의 강제노동과 탈출을 겪는다. `[확인]`
3. **3장: 사막 횡단 & 오아시스 (`node_dg_desert_trek`)**
   - 성장한 유노와 함께 사막(`loc_dg_desert_oasis`)을 횡단하며 오아시스에서 **사라(`char_sarah`)**와 조우한다.
   - **원작 진행 메커니즘**: 사막에서는 방향 선택보다 **유노에게 `대화하기`와 `주변 보기` 커맨드를 반복 실행**해야 숨겨진 진행 카운터(`flag_local_dg_desert_talk_complete`)가 충족된다. `[확인]`
4. **4장: 지하도 돌파, 레지스탕스 & 신제의 정체 (`node_dg_underground_capital`)**
   - 제도(`loc_dg_imperial_city`) 진입 과정에서 아이리아의 여동생이자 레지스탕스 리더인 **아만다(`char_amanda`)**와 합류하며, 데라 그란트의 최고 통치자 **신제(神帝)**의 정체가 현세에서 사라진 의붓어머니 **아리마 아유미(`char_ayumi`)**임이 밝혀진다. `[확인]`
   - **원작 지하도 공간 퍼즐 규칙** `[확인]`:
     - **지하도 1 (거리 → 성)**: 계속 전진 → 막다른 길 도달 시 **1칸 후퇴 → 우측 방향 진행**으로 목적지 도착.
     - **지하도 2 (류조지 추적)**: 거리 방면(정면)으로 직진 추적.
5. **5장: 성당 결전, 사상의 틈새 & 트루 엔딩 (`node_dg_sanctuary_climax` → `node_true_end`)**
   - 현세(지구)와 이세계(데라 그란트)가 인과 순환의 끝에 **사상 충돌(소멸)**을 맞이하려는 위기 속에서, 성당(`loc_dg_sanctuary`)의 무녀 의식과 류조지(정신 기생체)의 야망이 충돌한다. `[확인]`
   - **그란티아(`char_grantia`)**의 분령인 유노의 숙명, 친어머니 **아리마 케이코/케이티아(`char_keiko`)**와 아버지 **아리마 코다이(`char_kodai`)**의 진실, 차원 감사관 **다케다 에리코(`char_eriko`)**의 개입이 모두 수렴한다. `[확인]`
   - **최종방 탈출 기믹**: `loc_dg_horizon_end`(사상의 틈새 / 부린더의 나무) 최종방에서 진행이 막힐 경우, **"누군가에게 맡겨둔(위탁한) 물건이 빛나고 있는지"**(`item_entrusted_light`)를 확인해야 탈출 및 트루 엔딩(`node_true_end`)이 발동한다. `[확인]`

> **생존/식량 시스템 여부 검증 주석 `[확인]` `[검증 필요]`**: 이세계편 초반의 변경 생활·채굴장·사막 횡단은 서사적으로 가혹한 생존 극한 상황을 다루지만, 원작 PC-98/SS/리메이크의 실제 플레이 메커니즘은 RPG식 HP·공복 게이지 관리가 아니라 **커맨드 총공격·플래그 카운터·지하도 방향 퍼즐 기반 ADV**이다. 세부 커맨드 횟수 임계치는 `DATA_GAPS.md`에 기록한다.
