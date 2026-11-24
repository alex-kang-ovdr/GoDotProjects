# 08. 검증 전략 및 QA 테스트 계획

## 1. 검증 목표 및 계층 `[재구성안]`

본 역기획서와 향후 구현될 PlayHub 멀티 사이트 엔진의 품질은 다음 4개 계층에서 자동·수동으로 검증한다.

| 검증 계층 | 대상 | 실행 도구 / 방식 | 통과 기준 |
| --- | --- | --- | --- |
| **L1. 정적 데이터 무결성** | `verified_data/*.json`, `*.csv` | `node games/twin-sight-paradox/ReverseDesign/verified_data/validate_data.mjs` | JSON/CSV 100% 일치, 중복 ID 0건, 댕글링 참조 0건 |
| **L2. 동기화 그래프 무교착성** | `timeline_chapters.json` + `sync_barriers.json` | `validate_data.mjs` 내 Kahn 위상 정렬 + 도달성·진행성 시뮬레이터 | 유향 사이클 0건, `M_D0_01` → `C_D6_01` 100% 도달, 모든 중간 상태에서 최소 1명 진행 가능 |
| **L3. 정보 비대칭·엔진 단위 테스트** | `MultiSightReducer`, `EpistemicFilter`, `CulpritDeductionValidator` | Node ESM 단위 테스트 (향후 구현 시) | 인벤토리/단서 누수 0건, DBMS 데드락(`SB_05`→`SB_06`) 재현, 범인 입력 다국어 정규화 통과 |
| **L4. 플레이스루 & 워크트리 게이트** | 전체 골든 패스 + 레포 소유권/스킬 | `npm run check:ownership`, `npm run check:skills`, E2E 리플레이 | `fail 0`, Day 0 → True Ending 최단/역순 교차 경로 모두 클리어 |

## 2. 정적 데이터 자동 검증 규칙 (`validate_data.mjs`) `[재구성안]`

`validate_data.mjs`는 다음 7대 검증 스위트를 실행하며 1건이라도 실패 시 비영(Non-zero) 종료 코드를 반환한다.

1. **스키마·필수 필드 검증**: 모든 JSON 배열/객체 레코드에 필수 키와 유효한 `verification_status`(`확인` / `해석` / `재구성안` / `검증 필요`) 존재 확인.
2. **JSON ↔ CSV 양방향 정합성**: `characters.json` vs `characters.csv`, `locations.json` vs `locations.csv`의 레코드 수, ID 집합, 주요 문자열(한/일/영명, 소속/접근권한) 완전 일치 검사.
3. **참조 무결성 (Zero Dangling IDs)**:
   - `timeline_chapters.json`의 `location_ids`, `character_ids`, `prev_scene_ids`가 실존 ID인지 확인.
   - `sync_barriers.json`의 `blocked_scene`, `unlocking_scene`, `unlocking_event_id`, `required_event_ids`가 실존 씬 및 씬의 `emits_event_ids`에 등록돼 있는지 확인.
   - `clues_and_asymmetry.json`의 `acquired_at_scene`, `shared_at_scene`, `related_character_ids`, `related_location_ids` 참조 확인.
   - `items_and_endings.json`의 `acquired_scene`, `used_scene`, `trigger_scene`, `culprit_character_id` 참조 확인.
4. **동기화 장벽 방향성 및 교차성 검증**: `final_convergence`(`SB_08`)를 제외한 모든 장벽에서 `blocked_protagonist !== unlocking_protagonist`임을 보장(자기 자신이 자신을 막는 모순 차단).
5. **DAG 비순환성 (Kahn's Topological Sort)**: 내부 선행 간선(`prev_scene_ids`)과 교차 동기화 간선(`unlocking_scene -> blocked_scene`)을 통합한 전체 유향 그래프에 사이클이 0개임을 수학적으로 증명.
6. **결정론적 워크스루 시뮬레이션 (Deadlock-Freedom Proof)**: 초기 상태(`completed = {}`, `events = {}`)에서 매 스텝마다 해금 가능한 씬을 탐색해, 교착 없이 전체 16개 씬과 최종 합류 `C_D6_01`까지 도달하고 8개 동기화 장벽이 모두 해제됨을 증명.
7. **정보 비대칭 계약 검증**: `clues_and_asymmetry.json`의 모든 단서에 대해 `perceived_meaning_kojiro`, `perceived_meaning_marina`, `true_meaning`이 비어 있지 않으며, 비대칭 단서는 양측 인지 중 최소 하나가 `true_meaning`과 구별됨을 확인.

## 3. 향후 엔진 구현 시 필수 테스트 케이스 목록 `[재구성안]`

| 테스트 ID | 시나리오 | 기대 결과 |
| --- | --- | --- |
| `TC-MS-01` | Day 0 (`M_D0_01`)에서 `SIGHT CHANGE` 시도 | 전환 거부 (`sight_change_allowed=false`), 마리나 시점 유지 |
| `TC-MS-02` | `M_D0_02` 완료 직후 `SB_01` 해제 확인 | `K_D1_01` 해금, 자유 `SIGHT CHANGE` 활성화 |
| `TC-MS-03` | `M_D4_01`에서 코지로 미진행 상태로 `M_D4_02` 진입 시도 | `SB_06` 봉쇄(`SYNC_BARRIER_WAIT`), 마리나 단독 돌파 불가 |
| `TC-MS-04` | `M_D4_01` 봉쇄 → 코지로 `K_D4_01` 실행 → 마리나 복귀 | `evt_kojiro_dbms_deadlock_sync` 발행 → `SB_06` 해제 → `M_D4_02` 진입 성공 |
| `TC-IA-01` | 마리나가 `M_D2_01`에서 `스즈키 겐자부로` 단서 획득 후 코지로로 전환 | 코지로 `knownClueIds`에 `clue_suzuki_alias` 미포함, `TALK`/`THINK` 누수 없음 |
| `TC-IA-02` | 코지로 인벤토리 아이템을 마리나 시점에서 `ITEM` 사용 시도 | 접근 불가 (인벤토리 완전 격리) |
| `TC-IA-03` | `C_D6_01` 합류 직전(`K_D5_01`만 완료, `M_D5_01` 미완료) 진입 시도 | `SB_08` 봉쇄, 양측 모두 완료 시에만 `CONVERGENCE_LOCK` 전이 |
| `TC-END-01` | `C_D6_01` 범인 입력에 `"御堂真弥子"`, `"미도 마야코"`, `"Mayako Mido"` 입력 | 모두 정규화 통과 → `END_TRUE_RESCUE` 진입 |
| `TC-END-02` | `C_D6_01` 범인 입력에 `"ロス＝御堂"` 또는 `"ディーブ"` 입력 | 오답 판정 → `END_BAD_WRONG_CULPRIT` (Classic/SS/R 모드) |
| `TC-SAV-01` | `M_D4_01` 봉쇄 상태에서 저장 → 초기화 → 로드 | 코지로·마리나 위치, 인벤토리, `SB_05` 해제 상태, `SB_06` 잠금 상태 비트 단위 복원 |
