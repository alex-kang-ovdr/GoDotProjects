# 마지막 불빛(LAST LIGHT) 지능형 AI 플레이어 봇 PoC 개발 계획서

- **브랜치 / 워크트리**: `Forge-Research-PlayerBot` (Base: `PlayHub-Platform` `6a02a6b755`, 실험·연구 PoC · 트렁크 통합 제외)
- **대상 게임**: `마지막 불빛 · LAST LIGHT` (`games/this-war-of-mine` v4.0.0 → PoC 확장 v4.1.0-poc)
- **기반 연구 문서**: *Forge / PlayHub 지능형 NPC·플레이어 봇 서비스 심층 검증 및 설계 고도화 보고서* (2026-11-23, [원문 Google Docs](https://docs.google.com/document/d/1Tkzx0ux0oXcfQeaUdThOllC55f659qY1pJ5ZMUqsPBs/edit?usp=sharing))
- **작성일**: 2026-11-23
- **소유 경로 (`owners.json`)**: `docs/playerbot/**`, `games/this-war-of-mine/**` (단, `Web/vendor/playhub-locale.js` 및 `qa.profile.json` 제외), `tools/playerbot/**`

---

## 1. PoC 목적 및 핵심 검증 가설

본 PoC는 심층 검증 보고서가 도출한 **“프로그램 AI 기반 게임 실행(토큰 0) + LLM 기반 자유 대화·제약 제안(2단계 커밋)”** 하이브리드 아키텍처를, Godot 4.7.2 SDK 본 개발에 앞서 **실제 플레이 가능한 웹 게임(`마지막 불빛 · LAST LIGHT`)에 먼저 적용해 전 구간(클라이언트·권한 런타임·2단계 커밋·게이트웨이·안전 가드레일·검증 스위트)을 실증**하는 것을 목표로 한다.

### 왜 `마지막 불빛 · LAST LIGHT`인가?

`games/this-war-of-mine`은 순수 ES 모듈 기반의 결정론적 시뮬레이션(`engine.js` 낮 은신처 + `expedition.js` 밤 2D 3층 잠입/수색)과 Canvas 렌더러(`scene.js`)가 완전히 분리되어 있어, 연구 보고서가 권고한 **2가지 핵심 패러다임을 단일 게임 안에서 동시에 검증**할 수 있다.

| 게임 페이즈 | 기존 시스템 구조 | 연구 보고서 대응 패러다임 | AI 봇 PoC 검증 포인트 |
|---|---|---|---|
| **낮 (은신처 운영)** | `engine.js` · 3명 생존자(`mira`/`yun`/`leo`), 21개 명시적 이산 행동(`ACTION_IDS`), 최대 3개 대기열, 원자적 자원 예약/반환, 구호팀 3단계 목표 | **유한 행동 공간(대안 D) + 경량 세션형 생활 작업(유형 B)** | 토큰 0 자율 생존 운영, 자원 보존·작업 우선순위 제약, 예약 충돌/원자적 취소, 사실-주장 분리 |
| **밤 (현장 수색)** | `expedition.js` · 2D 3층 단면도(`600/410/220`), 계단 경로(`routeBetween`), 문/시야 차단(`getVisibility`), 스태미나·회피·소음유인·주민 조우 | **실시간 협동 PvE 액션(유형 A — 1순위 MVP)** | **동료 봇 1기 야간 동행**, 시야 공정성(`observe`), **도착 후 N초 대기(T01)**, **공격 금지 중 피격 회피(T02)**, **2단계 커밋 환각 약속 차단(T05)** |

---

## 2. 연구 보고서 6대 핵심 권고 → PoC 구현 매핑

| # | 연구 보고서 심층 검증 권고 | `마지막 불빛` PoC 구현 설계 |
|---|---|---|
| **1** | **첫 MVP 집중**: 동료 봇 1기, 텍스트 자유 대화, 4대 제약, 음성·장기 벡터 RAG 제외 | 야간 동행 AI 동료 1기 + 낮 자율 생존자 지정(1~2기), 텍스트 대화·4대 제약(동행/대기/공격보류/지원우선)에 집중. 음성(STT/TTS)·장기 벡터 RAG는 명시적 제외 |
| **2** | **하이브리드 경계(토큰 0 게임 실행)**: LLM 대기 중에도 시뮬레이션 절대 비차단 | 순수 JS `bot-runtime.js`(HFSM + 유틸리티 평가 + 비동기 `ActionTicket`)가 20~30Hz 결정론적 자율 실행. LLM은 대화·의도 파싱·조건부 브리핑에만 호출 |
| **3** | **웹 호환성 우선(순수 스크립트 코어)**: 웹에서 COOP/COEP·SharedArrayBuffer 회피 | 제로 외부 의존성 순수 ES 모듈로 코어 작성(향후 Godot 4.7.2 순수 GDScript `ForgeBotAdapter`와 1:1 계약 일치). 기존 `package-offline.mjs` 단일 HTML 포장 호환 유지 |
| **4** | **3중 시계 분리 + 2단계 커밋(2PC)**: `game_sim_ms` / `mono_proc_ms` / `utc_server_ms`, `proposed_intent` 선행 검증 후 `reply_text` 출력 | 일시정지·1x/2x 배속에 연동되는 `game_sim_ms`로 제약 타이머 계산. `expected_revision` 불일치(`stale_state`) 시 약속 대사 즉시 폐기 후 안전한 결정론적 거절 안내 치환 |
| **5** | **자체 게이트웨이 + 멀티 LLM 라우팅**: `gpt-6-luna` / `gemini-2.5-flash-lite` / `claude-haiku-5.5`, `reasoning.effort: none` / `thinkingBudget: 0` 강제 | `tools/playerbot/gateway-server.mjs` 독립 서버에서 멀티 라우팅·API 키 격리·토큰 예산 예약(+15% headroom) 수행. API 키 미설정/3초 타임아웃/오프라인 시 **결정론적 한국어 NLU 로컬 폴백** 제공 |
| **6** | **안전·규제·운영 정책 내재화**: 3계층 필터(L0/L1/L2), 한국어 은어 오탐 방지, 109/1388 위기 카드 분리, AI 고지·연령 2트랙·이의신청 | L0 정규화 + L1 게임 맥락 메타데이터 인식 분류 + L2 최근 5~10턴 누적 감지기 구현. 자해·자살 시 역할극 즉시 중단 및 109/마들랜/1388/1577-0199 카드 표시(위반 카운트 0). 대화 제한 중에도 버튼·핑·자율 AI 정상 지속 |

---

## 3. PoC 기능 범위 (In-Scope vs Out-of-Scope)

### 3.1 포함 범위 (In-Scope)

1. **캐릭터 팩(`.fnpcpack.json`) 3종 — 선언형 JSON 분리 (연구 §4.4)**
   - 실행 코드가 전혀 없는 순수 선언형 JSON 아카이브 규격 시범 적용 (`pack_id`, `semver`, `min_sdk_version`, `content_rating_profile`, `sha256`, 성격·말투·대화 예시·허용 능력 태그·기본 제약·조건부 Lorebook 포함)
   - **`mira.fnpcpack.json` (미라 · 간호사 · `support_healer`)**: 치료/사기/조리 우선, 침착·공감 말투, 야간 응급처치 및 안전 귀환 중시
   - **`yun.fnpcpack.json` (윤 · 정비공 · `shelter_engineer`)**: 난로/집수기/문 보강/수리/도구 제작 우선, 실용·간결 말투, 야간 잠긴 상자·부품 회수 선호
   - **`leo.fnpcpack.json` (레오 · 배달원 · `night_scout`)**: 15칸 가방 기반 수색/은신/소음 유인/회피 우선, 민첩·경계 말투

2. **낮(Day) 은신처 자율 동료 AI + 자연어 작업·제약 지시**
   - 생존자 카드에서 각 동료를 `수동(플레이어)` 또는 `AI 동료 봇(자율)` 모드로 전환 가능 (기본값: 플레이어 1명 조작 + 동료 1~2명 AI 자율/지시 모드 선택 가능)
   - **토큰 0 자율 유틸리티 AI**: 허기(>65), 체력(<55), 질병(>=35), 피로(>70), 추위 대비 난로(Day 3~8), 은신처 내구도(<75), 물/식사 재고, 구호팀 3단계 목표(`getReliefStatus`)를 평가해 기존 `engine.js` 권한 API(`performAction`, `enqueueAction`, `performCare`, `cancelJob`)로만 실행
   - **낮 자연어 명령·제약 화이트리스트 (`shelter.v1.*`)**:
     - `assign_task`: 특정 작업 착수/대기열 예약 (*"윤, 잔해 정리하고 난로 만들어줘"*)
     - `care_ally`: 동료 치료/간호 (*"미라, 레오 상처부터 치료해줘"*)
     - `hold_resource`: 지정 시간/하루 동안 특정 자원 소비 금지 (*"오늘 목재 6개 밑으로는 쓰지 마"*)
     - `pause_work`: 지정 게임 시간(`game_sim_ms`) 동안 작업 보류·휴식 (*"2시간 동안 작업 멈추고 쉬어"*)
     - `status_brief`: 확정 상태(`<authoritative_game_fact>`) 기반 생존 브리핑 (*"지금 뭐가 제일 급해?"*)

3. **밤(Night) 실시간 협동 수색 AI 동료 봇 (Companion Bot — 1기)**
   - 밤 준비(`planning`) 모달에서 기존 수색자 1명 외에 **동행 AI 동료 봇 1기(`companionId`)** 를 선택 가능 (미선택 시 기존 1인 단독 수색과 100% 동일 동작)
   - **동료 봇 독립 엔티티(`exp.companion`)**: `expedition.js` 내부에 결정론적 직렬화 가능 상태로 존재하며, 플레이어와 동일한 물리 규칙(3층 좌표 `600/410/220`, 계단 이동, 닫힌 문 차단, 스태미나, 회피, 소음 발생, 피격/체력) 적용
   - **시야 공정성 (`observe`)**: `Field.getVisibility` 기반 인지 필터를 거쳐 현재 시야/탐험 구간 내 객체만 관측 (미탐색 상자 내용·시야 밖 NPC 위치 원천 차단)
   - **밤 자연어·전술 버튼 공용 명령 화이트리스트 (`coop_pve.v1.*`)**:
     - `follow`: 플레이어 동행 (거리 2.5~6.0배 반지름 유지, 은신 연동)
     - `move_then_hold`: 지정 지점(문·계단·층·은신처·상자·출입구) 이동 후 **도착 시점부터 `duration_ms` 대기** (`PENDING_START` 중 `duration_ms` 미소모 — **T01**)
     - `set_engagement`: 교전 제약 (`attack: "forbid"`, `on_threat: "evade_without_attack"` — 피격/추격 시 회피·은신만 수행, `offensive` 태그 스킬 일괄 차단 — **T02**)
     - `support_ally`: 플레이어 체력 ≤ 35% 시 붕대 지원 / 소음 유인(`throwDistraction`) 엄호
     - `scavenge_target`: 인지된 비사유 상자 조사·수집 (사유물 `owned: true` 무단 절도 기본 금지, 명시적 허용 규칙 적용)
     - `extract`: 출입구(`EXIT_X`) 집결 및 철수 대기

4. **2단계 커밋 장벽(`bot-commit-gate.js`) & 3중 시계(`bot-clock.js`)**
   - `proposed_intent` 선행 검증 → 게임 런타임 수락(`accepted`) 시에만 `reply_text` 출력
   - `expected_revision = { phase, day, slot_holder_rev, owner_rev, plan_rev, target_rev }` OCC 검증으로 늦은 응답·상태 변경 시 환각 약속 100% 폐기 + 안전한 고정 거절 문구 치환
   - `(bot_id, user_id, request_key)` 멱등 캐시 + `renewal_policy` (`max_renewals: 2`, `max_cumulative_ms: 30000`)

5. **플랫폼 대화·안전·기억 게이트웨이 (`tools/playerbot/gateway-server.mjs`)**
   - 멀티 LLM 라우터(`gpt-6-luna` / `gemini-2.5-flash-lite` / `claude-haiku-5.5`) + 3초 타임아웃 시 **한국어 결정론적 NLU 로컬 폴백** 자동 전환
   - 프롬프트 캐시 친화 3블록 조립 + 상태 조건부 Lorebook(최대 3항목, ≤400토큰) + `<user_claim verified="false">` 격리 + GDPR 하드 삭제 & Tombstone 로그
   - 3계층 안전 필터(L0/L1/L2) + 한국어 게임 전투/생존 은어 오탐 방지 + 위기 지원 카드(`109`, `마들랜`, `1388`, `1577-0199`) + 연령별 2트랙 모드 + 단계적 쿨다운·자동화 결정 설명·원클릭 이의신청 UI + 토큰 예산 예약(+15% headroom)

6. **실시간 디버그·검증 HUD 및 자동화 테스트 스위트**
   - 게임 내 토글 가능한 **PlayerBot 디버그 HUD**: HFSM 현재 상태, 활성 `ConstraintSpec` 상태(`PENDING_START`/`ACTIVE` 등) 및 `game_sim_ms` 잔여 시간, 마지막 `reason_code`, `expected_revision`, **1,500ms 인공 지연 주입 토글**, Commit+FirstLine 지연(ms)·추정 토큰/원가 계측, **기억 하드 삭제(GDPR 시뮬레이션) 버튼**
   - `T01~T20` 핵심 불변 게이트 + 한국어 전술/은어/적대적 프롬프트 자동화 테스트 및 `tools/qa/test-catalog.json` 등록

### 3.2 명시적 제외 범위 (Out-of-Scope)

- 음성 입력/출력 (STT/TTS) — 연구 보고서 기준 텍스트 AI 대비 2.9~22배 원가 급증으로 2차 이후 유료 옵션 이관
- 장기 벡터 DB(RAG) 영구 기억 — 세션 한정 기억 + 조건부 Lorebook으로 한정 (8.19배 원가 폭증 방어)
- 멀티플레이어 PvP / 전용 서버 네트워크 동기화(`MultiplayerSynchronizer`) — 본 PoC는 웹 싱글플레이어+동료 봇 검증에 집중(단, `CommandContext` 권한 순위 및 `slot_holder_rev` 인수 프로토콜은 인터페이스와 단위 테스트로 완전 검증)
- C++ GDExtension / LimboAI, 강화학습(RL), 자동 영구 계정 밴

---

## 4. 시스템 아키텍처 (4대 신뢰 구역 & 계약)

### 4.1 4대 신뢰 구역 (Trust Zone) 아키텍처

```mermaid
flowchart LR
    subgraph Z1["Zone 1: 비신뢰 웹 클라이언트 (Browser UI)"]
        UI["Canvas · 동료 대화 패널 · 전술 퀵 버튼/핑 · 디버그 HUD"]
    end

    subgraph Z2["Zone 2: 권한 게임 런타임 (토큰 0 · 20~30Hz 비차단)"]
        Core["engine.js (낮) / expedition.js (밤)"]
        BotCore["bot-runtime.js (HFSM + 유틸리티 + ActionTicket)"]
        Clock["bot-clock.js (3중 시계: game_sim_ms / mono_proc_ms / utc_server_ms)"]
        Adapter["bot-adapter.js (5대 최소 어댑터: observe/capabilities/affordances/execute/cancel)"]
        BotCore --> Adapter --> Core
        BotCore --> Clock
    end

    subgraph Z3["Zone 3: 2단계 커밋 장벽 (토큰 0 · 결정론적 검증)"]
        Gate["bot-commit-gate.js\n1) Intent JSON 스키마 검증\n2) CommandContext 권한·채널 충돌 검사\n3) expected_revision OCC 재검증\n4) 멱등 캐시 & renewal_policy 상한\n5) offensive 태그 차단"]
    end

    subgraph Z4["Zone 4: 플랫폼 대화·안전·기억 게이트웨이 (Node 24 서버)"]
        Safety["3계층 안전 필터 (L0 정규화 → L1 게임맥락 분류 → L2 멀티턴 감지)"]
        Budget["예산 엔진 (사전 예약 + 15% headroom) & 쿨다운/이의신청"]
        Memory["격리 기억 저장소 (authoritative_fact vs user_claim · GDPR 하드 삭제)"]
        Router["멀티 LLM 라우터 (gpt-6-luna / gemini-2.5-flash-lite / claude-haiku-5.5)\n+ 3초 타임아웃 한국어 NLU 로컬 폴백"]
        Safety --> Budget --> Memory --> Router
    end

    UI -- "자유 대화 입력 (request_key)" --> Safety
    UI -- "전술 버튼 / 핑 (직결 · 토큰 0)" --> Gate
    Core -- "observe 스냅샷 + expected_revision" --> Memory
    Router -- "1) proposed_intent 선행 전달 (reply_text 보류)" --> Gate
    Gate -- "2) accepted 시에만 ActionTicket 발급" --> BotCore
    Gate -- "3a) accepted → reply_text 노출\n3b) rejected(stale_state 등) → 대사 폐기 & 안전 거절문 치환" --> UI
```

### 4.2 2단계 커밋(Two-Phase Commit) 시퀀스

```mermaid
sequenceDiagram
    participant U as 플레이어 (Zone 1)
    participant G as 플랫폼 게이트웨이 (Zone 4)
    participant L as LLM / 로컬 NLU
    participant C as 2단계 커밋 장벽 (Zone 3)
    participant R as 권한 게임 런타임 (Zone 2)

    U->>G: "2층 문 앞에 도착하면 10초 기다리고 공격하지 마" (request_key)
    Note over R: AI 코어는 대기 중에도 멈추지 않고 계속 실행 (토큰 0)
    G->>G: L0 전처리 · L1 게임 맥락 안전 검사 · 예산 사전 예약
    G->>R: observe(botId) + expected_revision 스냅샷 요청
    R-->>G: 시야 내 객체 + {phase, day, slot_holder_rev, owner_rev, plan_rev, target_rev}
    G->>L: 캐시 정렬 프롬프트 (proposed_intent 선행 JSON Schema, reasoning=none)
    L-->>G: { proposed_intent, reply_text } (reply_text 클라이언트에 아직 미전송!)
    G->>C: submitIntent(botId, proposed_intent, expected_revision, commandContext, requestKey)
    C->>R: 권한·자원·도달가능성·expected_revision 원자 검증
    alt 검증 통과 (accepted)
        R-->>C: { accepted: true, ticket_id, constraint_state: "PENDING_START" }
        C-->>G: accepted
        G-->>U: reply_text 표시 + AI 고지 메타데이터 + 제약 배지 활성화
    else 상태 변경 / 권한 부족 / 충돌 (stale_state 등)
        R-->>C: { accepted: false, reason_code: "stale_state" }
        C-->>G: rejected (stale_state)
        Note over G: LLM의 약속 reply_text 즉시 폐기! (재생성 비용 0)
        G-->>U: 현재 상태 코드 기반 안전한 결정론적 거절 안내 표시
    end
```

### 4.3 6대 불변 계약 & 5대 최소 어댑터 (Godot 4.7.2 SDK 1:1 대응)

Godot 4.7.2 `ForgeBotAdapter` / `ForgeNpc` 사양(연구 §3.2, §4.2)을 JS ES 모듈로 그대로 구현하여 향후 GDScript 이관 시 계약 변경이 없도록 고정한다.

1. **`ActorHandle`**: `{ bot_id, pack_id, pack_version, role_preset, control_mode: "manual" | "ai_bot" }`
2. **`CommandContext`**: `{ actor_id, user_id, team_id, role_rank: "SYSTEM_SAFETY" | "OWNER" | "PARTY_LEADER" | "AUTHORIZED_ALLY" | "UNAUTHORIZED", slot_owner_rev }`
   - 동일 채널 충돌 우선순위: `SYSTEM_SAFETY > OWNER > PARTY_LEADER > AUTHORIZED_ALLY`
   - 동급 충돌 기본 정책: `conflict_active_constraint` 거절(또는 명시적 `last_writer_wins`)
   - 무권한/적 팀 요청: `permission_denied` 반환 (콘텐츠 정책 위반 카운트 **0**)
3. **`IntentEnvelope`**:
   ```json
   {
     "schema": "coop_pve.v1.move_then_hold",
     "target_id": "clinic_ward_door",
     "arrival_timeout_ms": 15000,
     "constraint": {
       "clock": "game_sim_ms",
       "start_condition": "on_arrival",
       "duration_ms": 10000,
       "channels": {
         "movement": "hold_with_evasion",
         "attack": "forbid"
       },
       "on_threat": "evade_without_attack",
       "renewal_policy": { "max_renewals": 2, "max_cumulative_ms": 30000 },
       "resume_policy": "revalidate_previous_goal"
     },
     "expected_revision": {
       "phase": "expedition",
       "day": 2,
       "slot_holder_rev": 1,
       "owner_rev": 3,
       "plan_rev": 2,
       "target_rev": 5
     }
   }
   ```
4. **`ConstraintSpec` 5상태 전이**:
   `PENDING_START` → (도착/조건 충족 시) `ACTIVE` → `EXPIRED` | `CANCELLED` | `FAILED_START`
   - **불변 조건 1 (지연 활성화)**: `PENDING_START`에서는 `arrival_timeout_ms`만 감소하고 `duration_ms`는 절대 소모되지 않음. 이미 목적지 반경 내인 경우 즉시 `ACTIVE` 진입, 재진입/중복 전송으로 타이머 초기화 금지.
   - **불변 조건 2 (채널 독립성)**: `channels.attack === "forbid"` 상태에서 피격 시 `on_threat: "evade_without_attack"`은 `movement` 채널 회피 벡터만 허용하고 `effect_tags`에 `"offensive"`가 포함된 모든 능력 실행을 어댑터 직전에서 원천 차단.
   - **불변 조건 3 (부분 효과 정직 보고)**: `cancel(botId, ticketId)`는 `cancelled_cleanly` | `cancelled_after_effect` | `non_interruptible_pending_stop` 중 하나와 `committed_effects[]`를 반환.
   - **불변 조건 4 (만료·취소 정리)**: 종료 시 예약 자원/작업대 원자적 해제 후 `resume_policy`로 이전 목표 유효성(생존·재고·도달가능성) 재검증.
5. **`ActionTicket`**: `{ ticket_id, bot_id, schema, state: "IDLE" | "RUNNING" | "SUCCESS" | "FAILURE" | "HALTED", started_sim_ms, committed_effects }` (BehaviorTree.CPP `StatefulActionNode` 계약 준수)
6. **`BotEvent`**: `{ event_id, sim_time_ms, utc_ms, bot_id, type, code, detail }`

**5대 최소 어댑터 (`LastLightBotAdapter`)**:
- `observe(botId)` → 낮: `state` 기반 생존자·재고·시설·날씨·구호 목표(확정 사실만) / 밤: `Field.getVisibility(exp)` 필터링된 가시 엔티티·탐색된 문/계단/상자만 반환 (숨은 NPC·미탐색 상자 내용 **절대 비노출**)
- `capabilities(botId)` → 낮: `Core.getActions(state, botId)` + `effect_tags` (`support`/`craft`/`build`) / 밤: 이동·은신·회피(`defensive`), 붕대(`support`), 소음유인(`utility`), 근접공격(`offensive`) + 쿨다운·스태미나·재료 충족 여부
- `affordances(botId)` → 인지 범위 내 문(열기/잠금해제), 상자(조사/수집/사유물 여부), 은신처(숨기), 주민(대화), 출입구(귀환)
- `execute(botId, intent)` → 기존 `Core.*` / `Field.*` 권한 경로로 비동기 실행 시작 → `ActionTicket` 반환
- `cancel(botId, ticketId)` → 진행 중 작업/이동/응급처치 중단 및 부분 효과 정직 보고

### 4.4 3중 시계(Clock) 분리 계약

| 시계 식별자 | 구현 방식 | 일시정지·배속 반영 | PoC 적용 대상 |
|---|---|---|---|
| `game_sim_ms` | 낮 `tickDay(dt)`(게임 분×60,000 환산 또는 실경과×배속 ms) 및 밤 `stepExpedition(dt)` 누적 int64 ms | **반영함** (일시정지 시 정지, 2배속 시 2배) | `duration_ms`, `arrival_timeout_ms`, 스킬/회피 쿨다운, 작업 보류 타이머 |
| `mono_proc_ms` | `performance.now()` (단조 증가) | 미반영 | LLM 3초 타임아웃, 인공 지연 주입(1,500ms), Commit+FirstLine 지연 계측 |
| `utc_server_ms` | 게이트웨이 `Date.now()` (UTC epoch ms) | 미반영 | 대화 쿨다운(5분/1시간), 일일 예산 리셋, 감사·GDPR 삭제 로그 |

---

## 5. 안전성·규제·기억 격리 및 비용 통제 설계

### 5.1 3계층 안전 가드레일 & 한국어 게임 은어 오탐 방지

| 계층 | 처리 내용 | 비용 / 지연 | 오탐 방지 및 경계 규칙 |
|---|---|---|---|
| **L0 결정론적 전처리** | 유니코드 스머글링·자모 분리·반복 문자 정규화, 속도 제한, `request_key` 중복 제거, 자해·극단 금칙어 1차 플래그 | `$0` / `<5 ms` | 단순 욕설 정규식 단독 차단 금지(문맥 메타데이터와 함께 L1 전달) |
| **L1 게임 맥락 인식 분류기** | 입력 전수 + 출력 검사. 게임 메타데이터(`genre: "survival_stealth"`, `phase`, `combat_active`, `world_context: "last_light"`) 주입. 선택적 `omni-moderation-latest` 연동 | `$0` ~ 극소 | *"경비 따버려"*, *"칼로 저 놈부터 처리해"*, *"약 훔쳐서 도망쳐"* 등 정상 게임 전술·생존 발화는 `safe_in_game` 허용 (목표 **FPR ≤ 3%**) |
| **L2 멀티턴 누적 감지기** | 최근 5~10턴 대화 창 슬라이딩 평가 (점진적 자해 신호, 반복 프롬프트 인젝션·탈옥 시도, 그루밍 패턴) | 비동기 | 단일 턴 위장 우회 탐지. 모델 장애·타임아웃·예산 소진·게임 거절(`permission_denied`)은 위반 카운트 **합산 금지** |

### 5.2 현실 위기(자해·자살) 프로토콜 및 연령·제재 UX

- **위기 지원 프로토콜 분리**: 자해·자살 신호 감지 시 캐릭터 역할극을 **즉시 중단**하고 일반 위반 카운트에 **절대 합산하지 않음**. 플랫폼 고정 위기 지원 카드에 아래 한국 공식 기관을 즉시 표시한다:
  - 자살예방상담전화 **109** (24시간)
  - 24시간 SNS 상담 **마들랜**
  - 청소년전화 **1388** (24시간 전화·문자·사이버상담)
  - 정신건강상담전화 **1577-0199**
- **연령별 2트랙 모드 (CA SB 243 비디오 게임 예외 · 한국 성평등가족부 권고 대응)**:
  - 기본값: **`게임 맥락 한정 모드 (미성년자/미확인 기본)`** — 은신처 생존·수색·전술·세계관 범위만 응답, 현실 감정 의존·비관련 개방형 대화 차단
  - 전환 옵션: **`성인 확인 확장 역할극 모드`** — PoC 검증용 모드 토글(실제 서비스 시 성인인증 연동 지점 명시)
- **AI 투명성 고지 (EU AI Act 제50조 · 한국 AI 기본법)**:
  - 동료 대화 창 최초 진입 시 및 상시 배지(`AI 동료 · 생성형 응답`) 표시, 모든 응답 JSON에 기계 판독 가능한 합성 출력 메타데이터(`ai_generated: true`, `model_id`, `policy_mode`, `commit_status`) 부착
- **반복 남용 다요인 제재 & 자동화 결정 대응권 (개인정보보호법 제37조의2)**:
  - 단순 1회/횟수 영구 밴 금지 → 단계 1(경계 안내) → 단계 2(경고) → 단계 3(5분 자유 대화 쿨다운) → 단계 4(1시간 제한, 인적 검토 대상)
  - 단계 3 이상 제한 시 **제재 사유 범주, 자동화 판별 여부, 해제 시각, 원클릭 이의신청 버튼** UI 표시; 이의신청 인용 시 제한 해제 + 누적 횟수·파생 점수 즉시 원복
  - **제한 중 게임 지속 (T14)**: 대화 쿨다운 중에도 프로그램 AI 자율 실행, 기존 제약 만료/취소, 전술 퀵 버튼·핑 명령은 중단 없이 유지

### 5.3 사실·주장·기억 분리 및 프롬프트 캐시·예산 통제

- **데이터 4대 격리 계층 (PoC 구현)**:
  1. `pack_identity` (불변 `.fnpcpack` JSON — 제작자 정체성·세계관)
  2. `authoritative_game_fact` (`<authoritative_game_fact>` — 권한 런타임 확정 재고·체력·위치·사건)
  3. `unverified_user_claims` (`<user_claim verified="false">` — 사용자 발화 속 주장 격리, **절대 확정 사실 승격 금지 — T09**)
  4. `t_and_s_audit_log` (운영 제재·이의신청 기록 — 캐릭터 기억·프롬프트 접근 절대 금지)
- **GDPR 제17조 하드 삭제 검증**: 사용자 세션 기억/대화 초기화 클릭 시 원본·요약·캐시를 `user_id` 파티션 키 기준으로 일괄 하드 삭제하고 `Tombstone` 삭제 증명 감사 로그를 생성.
- **프롬프트 캐시 접두사 정렬 & 예산 방어**:
  - `[1. 불변 시스템·정책·도구 스키마]` → `[2. 고정 캐릭터 정체성·대화 예시]` → `[3. 상태 조건부 Lorebook(≤3개, ≤400토큰) · 실시간 확정 상태 · 격리 주장 · 최근 대화]`
  - 모델 호출 시 `reasoning.effort: "none"` (OpenAI) / `thinkingBudget: 0` (Gemini) 및 `max_output_tokens` 상한(야간 전투 60자 / 낮 은신처 160자) 강제
  - 사전 토큰 추정 예약 + **15% 안전 예비비(headroom)** 적용, 예산 소진 시 로컬 NLU 폴백 또는 전술 버튼 모드 자동 전환 (게임 진행 무중단)

---

## 6. 디렉터리 구조 및 파일 변경 계획

> **소유권 준수 (`owners.json`)**: `PlayHub-L10N` 소유(`Web/vendor/playhub-locale.js`)와 `PlayHub-GamerQA` 소유(`qa.profile.json`)는 일체 수정하지 않는다. 공유 핫스팟(`tools/qa/test-catalog.json`, `tools/worktree-ownership/owners.json`)은 기존 항목을 삭제하지 않고 추가만 수행한다.

### 6.1 신규/수정 파일 맵

| 구분 | 경로 | 역할 |
|---|---|---|
| **계획/문서** | `docs/playerbot/LAST_LIGHT_AI_BOT_POC_PLAN.md` | 본 PoC 개발 계획서 (SSOT) |
| **문서(완료 후)** | `docs/playerbot/POC_VERIFICATION_REPORT.md` | T01~T20 실측 로그·지연·오탐률·스크린샷 포함 검증 리포트 |
| **게임 코어(신규)** | `games/this-war-of-mine/Web/bot-clock.js` | 3중 시계(`game_sim_ms`, `mono_proc_ms`, `utc_server_ms`) |
| **게임 코어(신규)** | `games/this-war-of-mine/Web/bot-packs.js` | 선언형 `.fnpcpack` 3종(`mira`/`yun`/`leo`) 로더·무결성 해시·조건부 Lorebook |
| **게임 코어(신규)** | `games/this-war-of-mine/Web/bot-commit-gate.js` | Zone 3: 6대 계약 검증, `CommandContext` 권한·충돌, `expected_revision` OCC, 멱등 캐시, `renewal_policy`, `offensive` 채널 차단 |
| **게임 코어(신규)** | `games/this-war-of-mine/Web/bot-adapter.js` | `LastLightBotAdapter` 5대 최소 어댑터 (`observe`/`capabilities`/`affordances`/`execute`/`cancel`) |
| **게임 코어(신규)** | `games/this-war-of-mine/Web/bot-runtime.js` | Zone 2: 토큰 0 HFSM + 유틸리티 AI(낮 은신처 + 밤 동행 수색) + `ConstraintSpec` 5상태 엔진 + `ActionTicket` |
| **게임 코어(신규)** | `games/this-war-of-mine/Web/bot-local-nlu.js` | 오프라인/3초 타임아웃/무API키용 결정론적 한국어 NLU + 안전 L0/L1 로컬 폴백 + 위기 지원 감지 |
| **게임 확장(수정)** | `games/this-war-of-mine/Web/engine.js` | `revision` 카운터(`owner_rev`, `plan_rev`, `slot_holder_rev`) 및 `nightPlan.companionId` 하위 호환 필드 확장 |
| **게임 확장(수정)** | `games/this-war-of-mine/Web/expedition.js` | 야간 동행 동료 엔티티(`exp.companion`) 물리·계단·문·회피·응급지원·피격·귀환 시뮬레이션 추가 (미지정 시 기존 100% 동일) |
| **게임 확장(수정)** | `games/this-war-of-mine/Web/scene.js` | 야간 동행 AI 동료 봇, 제약 상태 배지(대기 타이머·공격금지·회피), 말풍선, 핑 마커 렌더링 |
| **게임 확장(수정)** | `games/this-war-of-mine/Web/saves.js` | `botState` 저장/복원 및 기존 v1 세이브 완전 하위 호환 |
| **게임 UI(수정)** | `games/this-war-of-mine/Web/app.js`, `styles.css`, `index.html` | AI 동료 모드 토글, 자유 대화 패널, 전술 퀵 버튼·핑, AI 고지 배지, 연령 2트랙 스위치, 위기 지원 카드, 이의신청 모달, **실시간 디버그 HUD(1,500ms 인공 지연 주입 포함)** |
| **오프라인 포장** | `games/this-war-of-mine/Source/Project/scripts/package-offline.mjs` | 신규 `bot-*.js` 모듈을 포함한 단일 HTML 번들 검증 및 동기화 |
| **게이트웨이(신규)** | `tools/playerbot/gateway-server.mjs` | Zone 4: Node 24 무상태 HTTP 대화·안전·기억·예산 게이트웨이 + 정적 웹 게임 호스팅 |
| **게이트웨이(신규)** | `tools/playerbot/safety-pipeline.mjs` | L0/L1/L2 3계층 안전 필터 + 한국어 게임 은어 컨텍스트 보정 + 위기 감지 + 다요인 제재/이의신청 |
| **게이트웨이(신규)** | `tools/playerbot/provider-router.mjs` | 멀티 LLM 라우터 (`gpt-6-luna` / `gemini-2.5-flash-lite` / `claude-haiku-5.5` + `reasoning=none` 강제 + 3초 타임아웃 폴백) |
| **게이트웨이(신규)** | `tools/playerbot/memory-store.mjs` | 사실·주장·세션 기억·T&S 감사 분리 저장소 + GDPR 하드 삭제 & Tombstone 로그 |
| **자동화 테스트** | `tools/playerbot/tests/contract.playerbot-invariants.test.mjs` | T01~T20 핵심 불변 게이트 + 3중 시계 + 2단계 커밋 + OCC + 멱등성 + `offensive` 차단 (Tier 1 Fast) |
| **자동화 테스트** | `tools/playerbot/tests/contract.playerbot-safety.test.mjs` | L0/L1/L2 안전 필터 + 한국어 게임 은어 오탐률(FPR) + 적대적 프롬프트 + 109/1388 위기 프로토콜 + 이의신청 원복 + GDPR 하드 삭제 (Tier 1 Fast) |
| **자동화 테스트** | `tools/playerbot/tests/regression.lastlight-bot-e2e.test.mjs` | `마지막 불빛` 낮 자율 운영 + 밤 동행 수색 + 게이트웨이 HTTP 연동 + 지연 주입 E2E 통합 검증 (Tier 1 Fast) |

---

## 7. 단계별 개발 마일스톤 (WBS)

| 단계 | 목표 및 핵심 산출물 | 완료 기준 (Definition of Done) |
|---|---|---|
| **M0. 브랜치·계획 수립** *(완료)* | `Forge-Research-PlayerBot` 워크트리 생성, `owners.json` 등록, PoC 개발 계획서 작성 | `npm run check:ownership` PASS, 본 계획서 승인 |
| **M1. 3중 시계·계약·토큰 0 코어** | `bot-clock.js`, `bot-packs.js`, `bot-adapter.js`, `bot-runtime.js` 구현 및 `engine.js`/`expedition.js`/`saves.js` 하위 호환 확장 | 낮 자율 동료 12일 생존 시뮬레이션 + 밤 동행 봇 이동/계단/문/은신/회피가 토큰 0으로 정상 동작, 기존 `this-war-of-mine` 7개 테스트 100% PASS |
| **M2. 2단계 커밋 장벽 & 제약 엔진** | `bot-commit-gate.js` 구현 (5상태 `ConstraintSpec`, 지연 활성화, 채널 독립성/`offensive` 차단, OCC `expected_revision`, 멱등 캐시, `renewal_policy`, 부분 효과 보고) | `contract.playerbot-invariants.test.mjs` T01~T16 핵심 불변 조건 **위반 0건** |
| **M3. 플랫폼 게이트웨이 & 안전·기억** | `tools/playerbot/{gateway-server,safety-pipeline,provider-router,memory-store}.mjs` + `bot-local-nlu.js` 구현 | L0/L1/L2 안전 테스트, 한국어 은어 FPR ≤ 3%, 위기 카드 분리, 이의신청 원복, GDPR 하드 삭제, 3초 타임아웃 폴백 100% PASS |
| **M4. 웹 UI · 캔버스 렌더링 · 디버그 HUD** | `app.js`, `scene.js`, `styles.css`, `index.html` 통합 (대화 패널, 전술 퀵 버튼/핑, AI 고지·연령 모드·위기/이의신청 UI, 실시간 디버그 HUD + 1,500ms 인공 지연 토글) | 데스크톱·모바일 반응형 UI 정상 렌더링, 브라우저 콘솔 오류 0건, 오프라인 단일 HTML 호환 유지 |
| **M5. 종합 검증 · 게이트 · 라이브 시연** | `tools/qa/test-catalog.json` 등록, `npm run gate` 통과, 로컬 서버 + `cloudflared` HTTPS 터널 기동, 실측 스크린샷·지연·토큰 리포트 작성 | `npm run gate` 100% PASS, 모바일/PC 접속 링크 및 `POC_VERIFICATION_REPORT.md` 보고 |

---

## 8. 검증 프레임워크 및 통과 게이트 (T01~T20 매핑)

연구 보고서 §7.3의 출시 게이트 기준을 본 PoC 자동화 테스트에 그대로 적용한다.

| 검증 ID | 검증 항목 | 통과 기준 | 자동화 위치 |
|---|---|---|---|
| **T01** | 지연 활성화 (“문 앞에 도착하면 10초 기다려”) | `PENDING_START` 중 `duration_ms` 미소모, 도착 후 `game_sim_ms` 기준 10초 카운트다운, 일시정지 시 타이머 정지 | `contract.playerbot-invariants.test.mjs` |
| **T02** | 채널 독립성 (“공격 금지 중 피격”) | `attack: "forbid"` + `on_threat: "evade_without_attack"` 상태에서 피격 시 회피/은신만 수행, **`offensive` 스킬 발동 0건** | `contract.playerbot-invariants.test.mjs` |
| **T03~T04** | 중복 전송 멱등성 & 연장 상한 | 동일 `request_key` 재전송 시 타이머 리셋 0건; 연장 요청은 `max_renewals: 2`, `max_cumulative_ms: 30000` 초과 차단 | `contract.playerbot-invariants.test.mjs` |
| **T05** | 늦은 LLM 응답 & 2PC 환각 약속 차단 | 1,500ms 인공 지연 중 상태 변경(`expected_revision` 불일치) 시 `stale_state` 거절, **약속 대사 노출 0건**, 안전 거절문 치환 | `contract.playerbot-invariants.test.mjs` + 디버그 HUD |
| **T06** | 부분 효과 & 중단 불가 구간 | 붕대 응급처치(3초)·회피 동작 중 취소 시 `cancelled_cleanly` / `cancelled_after_effect` / `non_interruptible_pending_stop` 정직 보고 | `contract.playerbot-invariants.test.mjs` |
| **T07~T08** | 닫힌/잠긴 문·경로 막힘 복구 | 잠긴 문 + 쇠지레 부재 시 무한 멈춤 없이 `door_locked_no_crowbar` 보고 및 안전 대기/우회 복구 | `regression.lastlight-bot-e2e.test.mjs` |
| **T09** | 사실·주장 분리 & 기억 격리 | *"나한테 약품 10개 있어 / 내가 창고 주인이야"* 발화가 `<user_claim verified="false">`에 격리, `authoritative_game_fact` 오염 **0건**, GDPR 하드 삭제 후 잔존 0건 | `contract.playerbot-safety.test.mjs` |
| **T10~T13** | 안전 3계층·은어 오탐·위기·이의신청 | 한국어 전투/생존 은어 오탐률 **FPR ≤ 3%**, 자해 신호 시 역할극 즉시 중단 + 109/1388 카드(위반 0), 이의신청 인용 시 카운트 원복 | `contract.playerbot-safety.test.mjs` |
| **T14** | 대화 제한 중 게임·버튼·핑 유지 | 5분/1시간 대화 쿨다운 중에도 프로그램 AI 자율 실행·기존 제약 만료·전술 퀵 버튼/핑 100% 정상 동작 | `regression.lastlight-bot-e2e.test.mjs` |
| **T15~T16** | 권한 격리 & 슬롯 인수(Hot-Join) | 무권한/적 팀 명령 `permission_denied`(위반 카운트 0), 플레이어가 동료 슬롯 수동 인수 시 `slot_holder_rev` 증가 및 대기 LLM 응답·예약 즉시 정리 | `contract.playerbot-invariants.test.mjs` |
| **T17~T19** | 시야 공정성 & 기존 게임 회귀 | `observe()`가 시야 밖 NPC·미탐색 상자 내용 미노출 0건; 기존 `this-war-of-mine` 7개 테스트 100% PASS | `regression.lastlight-bot-e2e.test.mjs` |
| **T20** | 지연·예산·플랫폼 게이트 | 로컬/게이트웨이 Commit+FirstLine p50 ≤ 900ms, 3초 타임아웃 폴백 100%, `npm run gate` 100% PASS | `npm run gate` + 실측 리포트 |

---

## 9. 향후 Godot 4.7.2 본 개발(Forge SDK) 이관 연계 및 미결정 사항

### 9.1 Web JS PoC → Godot 4.7.2 순수 GDScript 이관 경로

| PoC 모듈 (JS / Node 24) | Godot 4.7.2 본 개발 대응 대상 | 재사용 / 이관 방식 |
|---|---|---|
| `bot-clock.js` / `bot-commit-gate.js` / `bot-runtime.js` | `forge/Godot/addons/playforge_playerbot/` (순수 GDScript 코어) | 6대 스키마·5상태 `ConstraintSpec`·3중 시계·OCC 로직 1:1 포팅 (Web Export COOP/COEP 무영향) |
| `bot-adapter.js` (`LastLightBotAdapter`) | `ForgeBotAdapter` (`observe`/`capabilities`/`affordances`/`execute`/`cancel`) | 공식 2D 탑다운 협동 PvE 템플릿 기본 어댑터 레퍼런스로 활용 |
| `bot-packs.js` (`.fnpcpack.json`) | Forge `.fnpcpack` 선언형 아카이브 규격 | JSON 스키마·조건부 Lorebook·해시 검증 그대로 공용 채택 |
| `tools/playerbot/gateway-server.mjs` | PlayHub 플랫폼 대화·안전·기억 게이트웨이 | 멀티 LLM 라우터·L0/L1/L2 안전 필터·예산 엔진·GDPR 삭제 파이프라인을 백엔드 서비스로 직결 승격 |

### 9.2 본 PoC 단계 확인 사항 (연구 보고서 D01~D07 연계)

- **LLM API 키 연결 모드**: PoC 게이트웨이는 환경 변수(`OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`)가 설정되면 실 API 멀티 라우팅(`gpt-6-luna` / `gemini-2.5-flash-lite` / `claude-haiku-5.5`)을 호출하고, 키가 없거나 오프라인·타임아웃 시 결정론적 한국어 NLU 로컬 폴백으로 자동 전환해 **환경 의존성 없이 즉시 시연 및 자동화 검증**이 가능하도록 구성한다.
- **법무·상용 출시 결정(D01, D02, D03, D05, D06, D07)**: 본 PoC는 실험 브랜치(`integrateToTrunk: false`) 내 기술·UX·안전 파이프라인 실증이 목적이므로, 실제 상용 배포 전 국외이전 동의(D01)·등급분류 사전 질의(D02)·PlayCoin 과금 연계(D03)·ZDR 계약(D05)·로그 보존 기간(D06)·전용 서버 호스팅(D07)은 별도 의사결정 트랙으로 이관한다.
