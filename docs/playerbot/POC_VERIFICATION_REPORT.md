# 마지막 불빛(LAST LIGHT) AI 플레이어 봇 PoC 검증 리포트

- **브랜치 / 워크트리**: `Forge-Research-PlayerBot` (`d:\Github\GoDotProjects-worktrees\Forge-Research-PlayerBot`, Base: `PlayHub-Platform` `6a02a6b755`)
- **검증 일시**: 2026-11-23
- **기준 계획서**: [LAST_LIGHT_AI_BOT_POC_PLAN.md](LAST_LIGHT_AI_BOT_POC_PLAN.md)

---

## 1. 구현 완료 산출물 요약

### 게임 런타임 & UI (`games/this-war-of-mine/Web/`)
- `bot-clock.js`: 3중 시계(`game_sim_ms` / `mono_proc_ms` / `utc_server_ms`) — 일시정지·1x/2x 배속 엄격 반영
- `bot-packs.js`: 선언형 `.fnpcpack` v1 3종(`mira`, `yun`, `leo`) + 결정론적 무결성 해시 + 상태 조건 우선 Lorebook(최대 3개, ≤400토큰)
- `bot-commit-gate.js`: Zone 3 2단계 커밋 장벽, 5상태 `ConstraintSpec`(`PENDING_START`→`ACTIVE`→`EXPIRED`/`CANCELLED`/`FAILED_START`), `CommandContext` 권한 순위, `expected_revision` OCC, `(bot_id, user_id, request_key)` 멱등 캐시, `renewal_policy`(최대 2회 / 30초), `offensive` 채널 차단
- `bot-adapter.js`: `LastLightBotAdapter` 5대 최소 어댑터(`observe`/`capabilities`/`affordances`/`execute`/`cancel`) — `Field.getVisibility` 기반 시야 공정성 강제
- `bot-runtime.js`: Zone 2 토큰 0 HFSM + 유틸리티 AI (낮 자율 운영 + 밤 동행 봇 1기, 잠긴 문 복구, `detachBot`/`attachBot` 슬롯 인수)
- `bot-local-nlu.js`: 오프라인/3초 타임아웃/무API키용 결정론적 한국어 NLU + L0/L1 로컬 안전 분류 + 위기 지원 카드(`109`/`마들랜`/`1388`/`1577-0199`)
- `bot-ui.js`: 동료 대화 패널, AI 투명성 배지(EU AI Act 제50조·한국 AI 기본법), 연령별 2트랙 스위치, 전술 퀵 버튼(토큰 0 직결 2PC), 위기 카드, 이의신청 UI, GDPR 하드 삭제 버튼, 실시간 디버그 HUD(**1,500ms 인공 지연 주입 토글** 포함)
- `engine.js`, `expedition.js`, `scene.js`, `app.js`, `styles.css`, `index.html`: `revision` 추적, `nightPlan.companionId` 및 야간 동행 엔티티(`exp.companion`)·캔버스 렌더링 통합 (기존 1인 단독 수색과 100% 하위 호환)

### 플랫폼 대화·안전·기억 게이트웨이 (`tools/playerbot/`)
- `gateway-server.mjs`: Node HTTP 무상태 게이트웨이 + 정적 웹 게임 서버 (`/api/playerbot/{health,chat,appeal,erase,metrics}`)
- `safety-pipeline.mjs`: L0/L1/L2 3계층 안전 필터, 한국어 게임 전투/생존 은어 오탐 방지, 위기 지원 분리, PIPA 제37조의2 이의신청 원복
- `memory-store.mjs`: `<authoritative_game_fact>` vs `<user_claim verified="false">` 분리 저장소 + GDPR 제17조 하드 삭제 & Tombstone 감사 로그
- `provider-router.mjs`: 멀티 LLM 라우터(`gpt-6-luna` `reasoning_effort: "none"`, `gemini-2.5-flash-lite` `thinkingBudget: 0`), 프롬프트 캐시 3블록 정렬, 15% 예산 예비비(headroom), 3초 타임아웃 로컬 NLU 폴백

---

## 2. 자동화 검증 결과

| 검증 항목 | 실행 명령 / 대상 | 결과 | 비고 |
|---|---|---|---|
| **구문 검사 (15개 JS/MJS)** | `node --check` (게임 11 + 게이트웨이 4) | **PASS (15/15)** | 구문 오류 0건 |
| **소유권 검사** | `node tools/worktree-ownership/check-ownership.mjs` | **PASS (ok 21 / warn 2 / fail 0)** | warn 2건은 공유 핫스팟(`owners.json`, `test-catalog.json`) 추가분 |
| **스킬 동기화** | `node tools/agent-skills/sync-skills.mjs --check` | **PASS (4개 파일)** | 불일치 0건 |
| **T01~T06, T15~T17 불변 게이트** | `tools/playerbot/tests/contract.playerbot-invariants.test.mjs` | **PASS (7/7)** | 지연 활성화·공격금지 회피(반격 0건)·멱등성·연장상한·OCC `stale_state`·부분효과·권한격리·시야공정성 |
| **T09~T13 안전·기억·예산** | `tools/playerbot/tests/contract.playerbot-safety.test.mjs` | **PASS (5/5)** | 한국어 게임 은어 FPR **0.0%** (목표 ≤3%), 위기 카드 위반 0건, 이의신청 원복, GDPR 하드 삭제, 15% headroom |
| **T07~T08, T14, E2E 게이트웨이** | `tools/playerbot/tests/regression.lastlight-bot-e2e.test.mjs` | **PASS (3/3)** | 낮 자원보존 자율운영, 잠긴 문 복구, HTTP 게이트웨이 지연 주입 `stale_state`, 쿨다운 중 퀵명령 유지 |
| **라이브 HTTP 스모크** | `GET /api/playerbot/health`, `GET /` (port 18190) | **PASS (200 OK)** | 게이트웨이 및 게임 웹 정상 응답 |

### 미검증 / 환경 제약 사항 (명시)
- **Node 24 런타임**: 현재 머신에 시스템 `node`/`npm` 및 `artifacts/local-runtime/node24/node.exe`가 미설치 상태여서 번들 `node v22.22.0`으로 단위·통합 테스트를 실행함 (`tools/qa/run-suite.mjs`는 Node 24 이상을 요구하므로 Node 24 설치 후 `npm run gate` 전체 실행 필요).
- **외부 실 LLM API 지연·단가 실측**: 환경 변수(`OPENAI_API_KEY` / `GEMINI_API_KEY`) 미설정 상태이므로 `local-nlu-fallback` 경로로 전체 2PC·안전·기억·예산 파이프라인을 검증함. API 키 주입 시 `gpt-6-luna` / `gemini-2.5-flash-lite` 멀티 라우팅이 즉시 활성화됨.
- **트렁크 기존 미등록 테스트**: `contract.gate-hygiene.test.mjs` 실행 시 우리 신규 테스트 3종은 100% 등록 통과했으나, 트렁크 기존 파일 `deploy/cloudrun/prune-ar-images.test.mjs`가 미등록 상태로 남아 있음(타 브랜치 영역이므로 본 브랜치에서 미수정).
