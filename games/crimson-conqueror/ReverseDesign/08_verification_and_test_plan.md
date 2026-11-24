# 08. 검증 및 테스트 계획 (Verification & Test Plan)

## 1. 정적 데이터 무결성 게이트 (Tier 0 — 구현 완료)

`verified_data/validate_data.mjs`가 모든 JSON/CSV 마스터 데이터에 대해 아래 8개 불변식을 자동 검증한다.

| 검증 항목 | 검사 내용 | 기대 결과 |
|---|---|---|
| **파일 존재 & JSON/CSV 파싱** | 6종 JSON, 4종 CSV 구문 오류 및 컬럼 수 정합성 | `0 errors` |
| **ID 유일성** | 세력(10), 영토(29), 병종(14), 캐릭터(33), 이벤트(16), 엔딩(14) 중복 ID 금지 | `0 duplicates` |
| **증거 등급 표준화** | 모든 레코드의 `evidenceLevel`이 4종 표준 enum 내 존재 | `100% valid` |
| **CSV ↔ JSON 동치성** | 4종 CSV와 대응 JSON 간 행 수 및 ID 집합 1:1 일치 | `100% parity` |
| **외래키 참조 무결성** | 세력(지도자/수도), 영토(초기세력/인접), 캐릭터(세력/병종/거점), 이벤트(영토/캐릭터/세력/엔딩), 엔딩(이벤트/캐릭터)의 댕글링 ID 0건 | `0 dangling IDs` |
| **대륙 그래프 대칭성** | 모든 영토 간선 `A -> B`에 대해 역간선 `B -> A` 존재, 자기 루프 및 중복 간선 금지 | `100% symmetric` |
| **대륙 그래프 연결성** | `ter_leazas_castle` 기점 BFS로 29개 모든 영토 도달 가능 | `29 / 29 reachable` |

실행 커맨드:
```powershell
node games/crimson-conqueror/ReverseDesign/verified_data/validate_data.mjs
```

---

## 2. 향후 엔진 구현 시 필수 단위 테스트 스위트 (Unit Tests) `[재구성안]`

| 테스트 그룹 | 테스트 케이스 | 검증 기준 |
|---|---|---|
| **T1. 주간 액션 슬롯** | `troop` 슬롯에서 증원 선택 후 같은 턴 보충 시도 | 거부(택1 제약 준수) |
| **T1. 주간 액션 슬롯** | 침공으로 적 도시 점령 성공 후 추가 침공 시도 | 해당 턴 침공 잠금 확인 |
| **T1. 주간 액션 슬롯** | 닌자 2명 보유 시 각 닌자별 5회 공작 카운터 | 총 10회(각 5회) 독립 차감 |
| **T1. 무패널티 징세** | 동일 도시에 10주 연속 징세 실행 | 민심/반란 패널티 0, 자금 정상 누적 |
| **T2. 전투 행동순** | 아군 300병 vs 적군 300병 vs 아군 150병 | `아군 150` → `아군 300` → `적군 300` 순 행동 |
| **T2. 전열/후열 제한** | 후열(슬롯 2,3)에 배치된 `cls_leazas_knights` 공격 시도 | 불가 판정; `cls_archers`/`cls_mages`만 공격 허용 |
| **T2. 전투역 캡** | 병수 1,000, 전투역 300 전장 교전 | 전선 참가 병수 `300`, 700 후방 대기 |
| **T2. Snipe & 닌자** | `Strikes=35` 지휘관의 `Rance Attack` 1,000회 샘플링 | 병사 피해 `0`, 반격 `0`, 지휘관 피해 `0..6` 범위 |
| **T2. 마인 면역** | `cls_demons` 대상 공격 시 아군 닌자 추격 판정 | 고정 1 피해 무조건 `0` (면역) |
| **T2. 영구 사망** | 아군 일반 지휘관 HP 0 vs `chr_rance` HP 0 | 일반 지휘관 영구 로스터 제거 / 란스 즉시 `end_death` |

---

## 3. 전략 ↔ 시나리오 통합 회귀 시나리오 테스트 (E2E Scenarios) `[재구성안]`

1. **S1 — 도적왕 조기 엔딩 (`end_bandit_king`)**:
   - `BANDIT_PROLOGUE`에서 루베란 격파 → 즉시 `end_bandit_king` 트리거, 본편 미진입 확인.
2. **S2 — 볼고 Z 이중 기한 테스트 (`3/08/3` & `4/01/3`)**:
   - Case A: `LP 3/08/2`에 `ter_volgo_z` 점령 → 소울 + 시일 모두 생존/합류.
   - Case B: `LP 3/09/1`에 점령 → 소울 상실(바운드 체인 잠금), 시일만 구출.
   - Case C: `LP 4/02/1`에 점령 → 소울·시일 모두 상실, `end_bliss` 영구 잠금.
3. **S3 — 제스 4탑 붕괴 & 시즈카/아담/테이프 순서 테스트**:
   - 4탑(`ter_adam_stronghold`, `ter_tape`, `ter_amber_city`, `ter_old_zeth`) 모두 점령 시 잔여 `ter_zeth_west` 자동 병합 검증.
   - 아담 요새 선점령 후 테이프 공략 순서에 따른 시즈카 운명 분기 플래그 검증.
4. **S4 — 사사호 불가역 분기 (`evt_lake_sasa_haniwa_king`)**:
   - 금도끼 선택 시 호저미궁 영구 봉인 확인; 알루미늄 도끼 + B66F 2회 방문 + 줄리아 양도 시 `chr_haniwa_king` 영입 확인.
5. **S5 — 샹그릴라 제외 창조신 페이즈 & 최종 엔딩 4분기**:
   - 1개 비샹그릴라 영토 미점령 상태로 케이브리스 격파 → `end_unification`.
   - `ter_shangri_la`만 남기고 전 영토 점령 후 케이브리스 격파 → `CREATOR_PHASE` 해금.
   - `와그 보유 + 시일 생존` → `end_bliss` / `와그 보유 + 시일 부재` → `end_world_king` / `혼돈 동의 + 시일` → `end_servant` / `패배` → `end_god`.
6. **S6 — 세이브/로드 결정론 테스트**:
   - 50턴 진행 후 JSON 스냅샷 저장 → 로드 → 동일 시드·동일 입력으로 10턴 재실행 시 최종 해시 100% 일치.

---

## 4. 레포지토리 통합 검증 게이트

```powershell
# 1. 적색 정복왕 데이터 무결성 검증
node games/crimson-conqueror/ReverseDesign/verified_data/validate_data.mjs

# 2. 워크트리 소유권 검증
npm run check:ownership

# 3. 에이전트 스킬 정합성 검증
npm run check:skills
```
