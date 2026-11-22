# 08. 검증 전략 및 테스트 계획

## 1. 정적 데이터 무결성 검증 (1차 게이트 — 구현 완료)

`verified_data/validate_data.mjs`가 매 변경 시 자동으로 다음 6대 불변식을 검증한다:

| 검증 영역 | 검사 항목 | 현재 결과 |
|---|---|---|
| 캐릭터 정합성 | 15인 공략 히로인 카운트, 중복 ID 금지, `characters.csv ↔ characters.json` 1:1 일치, 유효한 `home_location_id` | **PASS (22명 / 15히로인)** |
| 맵 그래프 무결성 | 4존·41장소 중복/자기루프 금지, 모든 `target_id` 실존, 5분 양자 이동 시간, `locations.csv ↔ locations.json` 일치 | **PASS (4존 / 41장소)** |
| 캘린더 연속성 | 17일(`12-22` ~ `01-07`) `day_index` 1..17 연속성, 활성 존 유효성 | **PASS (17일)** |
| 이벤트·플래그 DAG | 60플래그·51이벤트 참조 무결성, 5분 양자 시간 창, **DFS 사이클 탐지(비순환성)**, 선행 이벤트 연대순(`pre.day_start <= ev.day_end`) | **PASS (0 cycles, 0 errors)** |
| 스케줄 커버리지 | 57개 스케줄의 시간 창·플래그·이벤트 참조 무결성 및 **15/15 히로인 전원 커버리지** | **PASS (57슬롯, 15/15)** |
| 엔딩 커버리지 | 19종 엔딩의 플래그 참조 무결성 및 **15/15 히로인 전원 엔딩 도달 경로 정의** | **PASS (19종, 15/15)** |

## 2. 결정론적 엔진 단위·시뮬레이션 테스트 계획 (2차 게이트 — 구현 단계) `[재구성안]`

엔진 구현 착수 시 다음 자동화 테스트 스위트를 추가한다:

1. **T1. 15인 히로인 전수 완주 봇 테스트 (Headless Walkthrough Suite)**:
   - 각 히로인별 최소 입력 스크립트를 순수 엔진에 주입하여 `day_index: 1`에서 `day_index: 17`까지 실행했을 때 목표 `end_<heroine>`에 100% 도달하는지 검증.
2. **T2. 12월 28일 동지온천 마크로 분기 배타성 테스트**:
   - `flg_onsen_trip_joined` 활성화 상태에서 `evt_mirei_nye_hotel`, `evt_minori_dec29_rescue`, `evt_misa_tennis_match`가 절대 발동하지 않는지 검증.
   - `flg_onsen_trip_declined` 상태에서 `evt_izumi_onsen_climax`, `evt_misato_onsen_bus`, `evt_sachiko_ryokan_met`, `evt_kumiko_ryokan_met`가 차단되는지 검증.
3. **T3. 12월 29일 미노리 vs 미사 일정 충돌 테스트**:
   - 마을 잔류 분기에서 `evt_misa_tennis_match` 완료 후 동일 회차에서 `evt_minori_dec29_rescue`가 `blocked_by_flags`로 차단되는지 확인.
4. **T4. 사쿠라코 → 미사코 교차 의존성 테스트**:
   - `evt_sakurako_jan1_misunderstanding` 미경유 시 `evt_misako_jan1_bath`가 발동하지 않음을 검증.
5. **T5. 특수 함정·우선권 테스트**:
   - `flg_yui_route_complete`와 `flg_youko_ending_override_active`가 동시에 참일 때 `evaluateEnding`이 `end_youko_main`(1000)을 반환하는지 검증.
   - 온천 연계 루트 완주 직후 `flg_onsen_jan6_home_broken` 설정 시 해당 히로인 엔딩이 차단되고 `end_onsen_jan6_home_fail`로 폴백되는지 검증.
6. **T6. 세이브/로드 라운드트립 및 시간 경계 테스트**:
   - 직렬화→역직렬화 후 `resolvePresence` 결과가 비트 단위로 동일한지, 자정 경계(`day 16 02:00` 미사코 이벤트)에서 시계가 역행하지 않는지 검증.

## 3. 워크트리 거버넌스 검증

저장소 규칙에 따라 다음 명령으로 브랜치 소유권 및 스킬 동기화 상태를 확인한다:

```bash
node games/doukyuusei-2/ReverseDesign/verified_data/validate_data.mjs
npm run check:ownership
npm run check:skills
```
