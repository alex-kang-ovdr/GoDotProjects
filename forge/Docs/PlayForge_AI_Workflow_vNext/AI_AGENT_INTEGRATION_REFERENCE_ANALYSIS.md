# 외부 엔진 AI 채팅 및 도구 통합 레퍼런스 심층 분석 (`diligent` & `tool-integration`)

본 문서는 첨부된 두 레퍼런스 아카이브(**`diligent.zip`** 및 **`tool-integration-20261118.zip`**)의 아키텍처, 프로토콜, 도구 연동, 로컬 플레이/리플레이 검증 방식을 분석하고, 이를 **PlayForge (`Forge-AgentReplay`)** 워크트리의 각 모듈에 활용하기 위한 마스터 아키텍처 문서입니다.

---

## 1. 폴더별 상세 문서 인덱스 (SSOT Map)

각 폴더의 책임 경계에 맞춰 즉시 참조·구현할 수 있도록 하위 폴더별로 전용 Markdown 문서를 구성했습니다.

| 대상 폴더 | 문서 경로 | 핵심 다루는 내용 |
|---|---|---|
| `forge/Docs/PlayForge_AI_Workflow_vNext/` | [AI_AGENT_INTEGRATION_REFERENCE_ANALYSIS.md](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Docs/PlayForge_AI_Workflow_vNext/AI_AGENT_INTEGRATION_REFERENCE_ANALYSIS.md) | 두 레퍼런스 전체 아키텍처 분석, PlayForge 매핑 매트릭스, 단계별 도입 로드맵 |
| `forge/OfficialGodot/` | [AI_AGENT_UI_REFERENCE_GUIDE.md](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/AI_AGENT_UI_REFERENCE_GUIDE.md) | Web UI, Thin-Client 프로토콜, `ToolRenderPayload` 블록 렌더링, 컨텍스트 알림 카드, 에러 복구 의도(Recovery Intent) |
| `forge/Tools/` | [AI_PROVIDER_RUNTIME_REFERENCE_GUIDE.md](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/AI_PROVIDER_RUNTIME_REFERENCE_GUIDE.md) | `ModelRef` 복합 식별자, OAuth PKCE/WebSocket 체이닝, Eager/Lazy MCP 프록시, Code Mode(`exec`/`exec_wait`), 멀티 체크아웃 실행기 위임 |
| `forge/Godot/addons/playforge_agent_chat/` | [AI_AGENT_ADDON_REFERENCE_GUIDE.md](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/AI_AGENT_ADDON_REFERENCE_GUIDE.md) | Godot 에디터 브리지, `StudioMCP` 재시도·핸드셰이크 패턴, `visibility: "internal"` 문맥 주입, 정본 `McpToolResult` 보존, 응답 유실 방지 |
| `forge/Godot/addons/playforge_replay/` | [AI_SHOWCASE_REPLAY_REFERENCE_GUIDE.md](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_replay/AI_SHOWCASE_REPLAY_REFERENCE_GUIDE.md) | `local-play` 기반 불변 리플레이 스냅샷, 에셋 마운트 영수증·해시 검증, 씬 재열기(Reopen) 초기화 보장, 중첩 도구 호출 타임라인 |
| `forge/Tests/` | [AI_AGENT_EVAL_TEST_REFERENCE_GUIDE.md](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/AI_AGENT_EVAL_TEST_REFERENCE_GUIDE.md) | 결정론적 E2E(`@diligent/e2e`) vs 실모델 행동 평가(`@diligent/evals`), `preservation.json` 무결성 및 리소스 누수 검증 |

---

## 2. 레퍼런스 1: `diligent.zip` (AI Agent 하네스 & 프로토콜 엔진) 핵심 분석

`diligent`는 OVERDARE AI Agent 창의 실제 백엔드·프론트엔드 기반이 되는 **Bun + TypeScript 엄격 모드 모노레포 에이전트 하네스**입니다.

### 2.1 4-Layer 아키텍처 분리 원칙
```text
[Thin Clients: Web UI / CLI TUI / VS Code Extension / Godot Web Dock]
        │  (stdio NDJSON JSON-RPC 또는 WebSocket JSON-RPC)
        ▼
[@diligent/protocol] ── 스키마 전용 계약 (메서드 상수, 요청/알림 Zod 스키마, ToolRenderPayload)
        │
        ▼
[@diligent/runtime]  ── DiligentAppServer, SessionManager, ApprovalEngine, MCP Client, Code Mode, Skills, Knowledge
        │
        ▼
[@diligent/core]     ── ProviderManager, ModelRegistry, AgentLoop, AgentLoopHook, ToolExecutor
```

- **One Runtime, Multiple Clients**: 세션 수명주기, 프로바이더 인증, 도구 필터링, 모드(`default`/`plan`/`execute`), 추론 강도(`effort`), 승인(`approval`)은 모두 런타임이 소유하며 프론트엔드는 얇은 뷰/트랜스포트 어댑터로만 동작합니다.
- **Product-Owned RPC Interception**: 호스트 제품(예: PlayForge Godot 에디터) 고유의 RPC만 트랜스포트 경계에서 가로채고, 나머지는 공통 에이전트 런타임으로 전달합니다.

### 2.2 PlayForge에 즉시 활용 가능한 `diligent` 핵심 메커니즘 7가지

1. **프로바이더 범위 모델 식별자 (`ModelRef = { provider, modelId }`)**
   - 모델 ID 문자열 단독 비교를 금지하고 항상 `{ provider, modelId }` 쌍으로 식별합니다.
   - 예: `openai/gpt-5.4`와 `chatgpt/gpt-6.2-sol`, `anthropic/claude-sonnet-5-5`와 `claude-connect/claude-sonnet-5-5`는 서로 다른 인증·가격·스트리밍·Fast 모드 능력을 가집니다.
2. **Eager vs Lazy MCP 도구 로딩 (`mcp.toolLoading: "auto"`, `lazyThreshold: 20`)**
   - 활성화된 MCP 도구가 임계치(기본 20개) 이하일 때는 개별 함수(`mcp__<server>__<tool>`)로 직접 노출(Eager)하고, 20개를 초과하면 컨텍스트 토큰 폭발을 막기 위해 **`mcp_search_tools`** + **`mcp_run_tool`** 2개의 프록시 도구로 자동 전환(Lazy)합니다.
   - PlayForge의 Godot AI 47개 MCP 도구 카탈로그에 적용하면 프롬프트 토큰을 80% 이상 절감하면서도 전체 47개 도구를 모두 호출할 수 있습니다.
3. **Code Mode (`exec` / `exec_wait` & `ToolGate`)**
   - 턴마다 도구 1개씩 왕복하는 대신, 모델이 top-level `await`가 가능한 JavaScript(또는 배치 스크립트)를 `exec`로 작성해 `await tools.node_create(...)`, `await tools.script_attach(...)`를 연속 호출합니다.
   - `ToolGate`(Reader/Writer 게이트)를 통해 병렬 가능한 읽기 도구(`supportParallel`)와 순차 실행해야 하는 편집 도구의 경합을 방지합니다.
4. **내부 문맥 주입(`visibility: "internal"`)과 `context_notice` 분리**
   - 에디터에서 씬/노드/에셋이 변경되었을 때 모델에게는 상세 변경 문맥을 `visibility: "internal"` 메시지로 전달하고, 사용자 UI에는 대화 말풍선을 오염시키지 않는 **`Studio changes detected (N changes)`** 구조화 배너(`context_notice`)로만 렌더링합니다.
5. **3단계 에러 진단·표현·복구 분리 (Core → Runtime → Client)**
   - **Core**: 원시 에러 상태 코드·재시도 메타데이터 분류 (`ProviderError`).
   - **Runtime**: 사용자용 공통 메시지와 단일 복구 의도(`RecoveryIntent`: 프로바이더 연결, 새 스레드, 턴 재시도) 매핑.
   - **Client**: 실패 지점에 타임스탬프와 함께 인라인 기록하고(기존 질문/답변 삭제 금지), 유휴 스레드의 마지막 실패 항목에만 복구 버튼(`Connect AI`, `Retry`)을 노출합니다.
6. **Append-Only JSONL 세션 트리와 고아 도구 호출 자동 복구**
   - 세션을 `{ id, parentId }` 트리 엔트리 형태의 JSONL로 기록하여 브랜치 분기·컴팩션(`compaction`)·재개(`thread/resume`) 시에도 히스토리가 손실되지 않습니다.
   - 비정상 종료 후 세션 재개 시 완료되지 않은 도구 호출이 있으면 합성 `[Cancelled]` 결과를 자동 추가해 프로바이더 메시지 규약 오류를 방지합니다.
7. **구조화된 도구 결과 렌더링 (`ToolRenderPayload`)**
   - 도구 실행 시작/종료 시 `inputSummary`, `outputSummary`, `blocks`(`summary`, `table`, `tree`, `asset_gallery`, `diff`, `file`, `command`, `status_badges`, `resource`)를 반환하여 Web UI와 콘솔(TUI)이 동일한 의미 구조를 각자의 컴포넌트로 렌더링합니다.

---

## 3. 레퍼런스 2: `tool-integration-20261118.zip` (엔진 에디터·런처·MCP·로컬 플레이 통합) 핵심 분석

`tool-integration-20261118`은 멀티 체크아웃(`Dev-Client`, `Dev-Sandbox`, `master-client`, `master-sandbox`) 환경에서 **Studio 에디터, MCP 브리지, 로컬 맵 쿠킹, 검증 플레이(`local-play`), 루아 프레임워크(`LFW`)**를 원본 훼손 없이 통합 호출하는 아키텍처입니다.

### 3.1 PlayForge에 즉시 활용 가능한 `tool-integration` 핵심 메커니즘 5가지

1. **직접 에디터 MCP 브리지 및 지연 등록 재시도 (`studio-mcp.py`)**
   - 에디터 플러그인이 로컬 프록시에 등록되기까지 발생하는 초기 지연을 흡수하기 위해 `--auto-active` 모드에서 에디터 인스턴스 조회(`list_studios` → `set_active_studio`)를 재시도(backoff)하고, 한 프로세스 안에서 여러 도구 호출을 연속 실행하며 **응답 원본 JSON(`--out`)을 별도 아티팩트로 보존**합니다.
2. **원자적 로컬 플레이·내보내기 및 비파괴 실행 디렉터리 (`tools/local-play/INTEGRATION.md`)**
   - 에디터에서 현재 작업 중인 맵을 `level.export.local`로 내보낸 뒤, **절대 기존 실행 폴더를 재사용하지 않고** 매 실행마다 새 디렉터리(`runs/<run-id>`)를 생성합니다.
   - `--replay-from`은 이전 검증 산출물을 새 실행 폴더로 복사해 재생하므로 원본 씬이나 이전 리플레이 증거를 덮어쓰지 않습니다(PlayForge의 `REPLAY_DIR/AgentReplay-<uid>.tscn` 격리 방식과 동일한 철학).
3. **안전한 작업 공간 백업·복구 원장 (`workspace-plan.json` & `recovery-required.json`)**
   - 파일 시스템 변경(쿠킹, 에셋 일괄 교체, `assets.clear`) 전 `workspace-plan.json`과 `command.json`을 기록하고, 비정상 종료 시 `recovery-required.json` 및 락 파일을 통해 부분 변경 상태를 감지·복원합니다.
   - 자식 프로세스는 Windows `owned_job`으로 묶어 부모 종료 시 고아 프로세스가 남지 않도록 보장합니다.
4. **씬 재열기(Reopen) 시 일회성 에디터 코어 티커 초기화**
   - 저장된 씬이나 리플레이 씬을 에디터에서 다시 열 때 실시간 뷰포트 타이머에만 의존하면 메시·머티리얼·스크립트 초기화가 누락될 수 있으므로, 에디터 월드 유효성을 확인하는 일회성 코어 티커(PlayForge의 `EditorFilesystem.scan()` + `SVG ImageTexture` / `GDScript.reload()` 즉시 폴백)로 리소스 바인딩을 보장합니다.
5. **체크아웃 격리 위임(`workflows.py`)과 무결성 증거 기반 검증 (`preservation.json`)**
   - 여러 브랜치/워크트리의 도구를 통합할 때 파일을 덮어쓰지 않고 소유 루트(`--client-root`, `--sandbox-root`)를 명시해 위임 호출하며, `--dry-run`으로 실행 계획을 먼저 검증합니다.
   - 작업 전후 모든 추적 파일의 SHA-256 해시(`preservation.json`), CLI 스모크 비교(`checkout-smoke.json`), 런타임 종료 영수증(`runtime-exit.json`, `server/ready.json`, `client/ready.json`)을 남겨 회귀를 증명합니다.

---

## 4. PlayForge (`Forge-AgentReplay`) 현재 적용 상태 및 단계별 확장 로드맵

| 구분 | 항목 | 현재 PlayForge 반영 상태 | 향후 확장 포인트 (vNext) |
|---|---|---|---|
| **UI / UX** | 상단 모드 탭 (Chat ↔ Claude Console), Config SSOT, Connect AI 브랜드 로고 | **반영 완료** (`agent.html`, `agent.css`, `agent.js`) | `ToolRenderPayload` 블록(`tree`, `diff`, `asset_gallery`) 카드 렌더러 추가 |
| **대화 안정성** | 스트리밍 후 도구 검증 실패/중단 시 질문·답변 증발 방지 (`preserve_reply_with_error`) | **반영 완료** (`chat_panel.gd`, `plugin.gd`, `agent.js`) | Append-only JSONL 트리 세션 및 `thread/history` 페이지네이션 도입 |
| **씬·에셋·스크립트** | `node.add/delete/rename`, `scene.clear`, `asset.write/delete`, `assets.clear`, `pack.import`, `script.write/attach`, `replay.play` | **반영 완료** (`plugin.gd`, `scene_commands.gd`) | `assets.clear` 실행 전 `workspace-plan.json` 스냅샷 백업으로 에셋 삭제 Undo 지원 |
| **MCP 스케일링** | Godot AI 47개 도구 도메인별 체크리스트 (Config SSOT) | **반영 완료** (`agent.js`, `agent.html`) | `lazyThreshold: 20` 기반 `mcp_search_tools` / `mcp_run_tool` Lazy 프록시 모드 추가 |
| **리플레이 검증** | 빈 맵 기준선(`baseline-*.tscn`)부터 전체 제작 과정 `AgentReplay-*.tscn` 자동 시연 | **반영 완료** (`plugin.gd`, `playforge_replay/plugin.gd`) | `Code Mode` 중첩 호출 타임라인 커서 및 `reopen-verification.json` 영수증 출력 |
