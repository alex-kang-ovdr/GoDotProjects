# PlayForge AI 프로바이더 런타임 & 도구 오케스트레이션 레퍼런스 가이드 (`Tools`)

본 문서는 첨부된 **`diligent.zip`**(`packages/core`, `packages/runtime`) 및 **`tool-integration-20261118.zip`**(`tools/game-launcher`, `tools/local-play`, `Batch/`)을 분석하여, `forge/Tools/` 폴더의 프로바이더 백엔드([agent-chat-provider.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/agent-chat-provider.cjs), [agent-chat-codex.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/agent-chat-codex.cjs), [agent-chat-claude-cli.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/agent-chat-claude-cli.cjs), [agent-chat-gemini-cli.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/agent-chat-gemini-cli.cjs), [agent-chat-openai.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/agent-chat-openai.cjs), [agent-chat-claude.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tools/agent-chat-claude.cjs))와 런처 스크립트에 활용할 수 있는 핵심 설계를 정리한 문서입니다.

---

## 1. 프로바이더 인증 및 모델 식별 아키텍처 (`diligent` 기반)

### 1.1 `(provider, modelId)` 복합 식별자 (`ModelRef`) 불변성
- `diligent`는 모델 ID 문자열 단독 사용을 금지하고 항상 `ModelRef = { provider, modelId }` 쌍을 기준으로 모델 카탈로그와 기능(추론 강도, 이미지 첨부, Fast 모드, 스트리밍)을 해석합니다.
- **활용 포인트**:
  - `chatgpt-connect/gpt-6.2-sol` (Codex OAuth)과 `openai-api/gpt-5.4-mini` (OpenAI API Key), `claude-connect/claude-sonnet-5-5` (Claude CLI OAuth)와 `claude-console/claude-sonnet-5-5` (Anthropic API Key)를 명확히 분리하여 모델별 지원 `reasoning_efforts`(`low`, `medium`, `high`, `xhigh`, `max`, `ultra`)와 `service_tier`를 정규화합니다.
- **z.ai Coding Plan 노력도 및 별칭 정규화 (`docs/guide/provider-auth.md`)**:
  - `zai-coding-plan`의 기본 모델은 `glm-5.3`(텍스트 전용, 1M 컨텍스트, 128K 출력, `low`/`high`/`max` effort 지원)이며, 이미지 입력이 포함될 경우 비전 지원 모델인 `glm-5.3-flash`로 라우팅하고 `medium`/`xhigh` effort는 `low`로 자동 정규화합니다.

### 1.2 ChatGPT OAuth WebSocket 체이닝 및 Fast Mode (`service_tier`)
- **Codex WebSocket `previous_response_id` 체이닝**:
  - ChatGPT Codex 엔드포인트는 HTTP에서 `store: false`만 허용하고 `previous_response_id`를 거부하지만, **세션당 단일 WebSocket 연결**을 유지하면 이전 응답 이후 추가된 입력 아이템만 `previous_response_id`와 함께 전송하여 긴 멀티턴 대화의 지연과 페이로드 크기를 줄일 수 있습니다.
  - WebSocket 연속 2회 실패 또는 30초 내 첫 프레임 미수신 시 동일 호출 내에서 전체 입력을 담아 HTTP/SSE(또는 신규 스레드)로 자동 폴백합니다.
- **Fast Mode 표준화**:
  - Fast 모드 활성화 시 OpenAI/ChatGPT 요청에 `service_tier: "priority"`(또는 Codex app-server의 `serviceTierForTurn: "fast"`)를 전달하고, 미지원 모델로 전환 시 설정값은 보존하되 전송 페이로드에서만 생략합니다.

### 1.3 Anthropic Files API 이미지 캐싱 및 Vertex AI ADC 지원
- **Anthropic 이미지 업로드 최적화**:
  - 긴 세션에서 Base64 이미지가 32 MB 요청 한도를 소모하는 것을 막기 위해, 공식 엔드포인트 사용 시 이미지를 `/v1/files` (`files-api-2025-04-14` 베타 헤더)로 프로세스당 1회만 업로드하여 `{ type: "file", file_id: "..." }`로 참조하고, 실패(400/403/404) 시 즉시 인라인 Base64로 폴백합니다.
- **Vertex AI Windows ADC 호출**:
  - Windows 환경에서 PowerShell 실행 정책 문제를 피하기 위해 `cmd.exe /d /s /c "gcloud.cmd auth application-default print-access-token"`으로 액세스 토큰을 획득해 바인딩할 수 있습니다.

---

## 2. Eager vs Lazy MCP 도구 프록시 및 대용량 출력 스필 (`ToolOutputStore`)

Godot AI의 28개 도메인(47개 도구)과 외부 MCP 서버를 연결할 때 프롬프트 토큰 비용과 응답 속도를 최적화하는 핵심 구조입니다.

### 2.1 `mcp.toolLoading: "auto"` (`lazyThreshold: 20`)
- **Eager 모드 (활성 도구 ≤ 20개)**: 각 도구를 개별 함수 스키마로 모델에 직접 전달합니다.
- **Lazy 모드 (활성 도구 > 20개)**: 모델에 전체 47개 스키마를 매번 보내는 대신 아래 2개의 프록시 도구만 노출합니다.
  1. `mcp_search_tools({ query?, domain? })`: 설명란에 `domain → tool names` 압축 인덱스를 포함하며, 호출 시 매칭되는 도구의 정확한 입력 JSON 스키마를 온디맨드로 반환합니다.
  2. `mcp_run_tool({ domain, tool, args })`: 검색한 도구를 실행하고 동일한 승인(`approval`) 및 리플레이 기록 파이프라인을 거칩니다.
- Config에서 비활성화된 도메인(`excluded_mcp_domains`)은 `mcp_search_tools` 결과와 `mcp_run_tool` 실행 대상에서 모두 제외됩니다.

### 2.2 도구 출력 토큰 상한 (`maxOutputTokens: 25000`) 및 스필 파일
- 단일 도구 호출 결과가 25,000 토큰(약 100 KB)을 초과할 경우 Head + Tail 방식으로 잘라 컨텍스트 윈도우 오버플로를 방지하고, 전체 원본 출력은 로컬 `ToolOutputStore` 임시 파일에 저장한 뒤 `fullOutputPath` 참조만 남깁니다.

---

## 3. Code Mode (`exec` / `exec_wait` & `ToolGate`) 도입 설계

`diligent/docs/guide/code-mode.md`의 **Code Mode**는 복잡한 씬 생성(예: `"TappyChicken 만들고 Replay로 처음부터 시연"`)의 정확도와 속도를 극대화하는 방법입니다.

- **단일 배치 vs 스크립트 오케스트레이션**:
  - 현재 PlayForge는 `pf_workspace_apply`의 `operations` 배열 안에 `assets.clear` → `pack.import` → `script.write` → `node.add` → `property.set` → `script.attach` → `replay.play`를 한 번에 담아 실행할 수 있습니다.
  - 이를 한 단계 더 확장하여 `exec` 도구를 제공하면, 모델이 워커(`node:vm`) 안에서 `const state = JSON.parse(await tools.editor_state());`로 현재 씬을 조회한 뒤 조건부로 노드를 생성하고 속성을 검증하는 루프를 **단 한 번의 모델 턴** 안에서 수행할 수 있습니다.
- **`ToolGate` 동시성 제어**:
  - 읽기 전용 도구(`editor_state`, `scene_get_hierarchy`, `node_get_properties`)는 `Promise.all` 병렬 실행을 허용하고, 씬 변경 도구(`pf_workspace_apply`)는 배타적 Writer 락을 획득해 순서대로 실행합니다.

---

## 4. 멀티 체크아웃 실행기 위임 및 프로세스 수명주기 (`tool-integration` 기반)

`tool-integration-20261118`의 `tools/game-launcher/workflows.py`와 `tools/local-play/owned_job.py`에서 검증된 런처 엔지니어링 원칙입니다.

1. **소유 루트 명시 위임 및 `--dry-run` 계획 검증**:
   - 여러 워크트리(`GoDotProjects`, `GoDotProjects-worktrees/Forge-AgentReplay`)나 데모 프로젝트(`Saved/Demos/*`)를 다룰 때 파일을 암묵적으로 복사·덮어쓰지 않고, 대상 루트 경로를 명시하여 실행기를 호출하며 `--dry-run` 플래그로 실행 명령과 인자를 사전 검증합니다.
2. **Windows `owned_job` 기반 자식 프로세스 정리**:
   - Codex app-server, Claude CLI, Gemini CLI, 혹은 헤드리스 Godot 프로세스를 스폰할 때 부모 서버 종료 또는 타임아웃 시 고아 프로세스가 남지 않도록 Job Object / 프로세스 트리 단위로 정리하고, `Ctrl+C` 인터럽트 시 자식 실행기의 정리 루틴이 끝날 때까지 대기합니다.
3. **원자적 작업 공간 백업·복원 원장 (`workspace-plan.json`)**:
   - 프로젝트 에셋 전체 초기화(`assets.clear`)나 템플릿 재준비 시 `workspace-plan.json`과 임시 백업 폴더(동일 볼륨 내 rename)를 먼저 기록해 두면, 작업 실패나 사용자 취소 시 `workspace-restored.json` 절차에 따라 손실 없이 즉시 원복할 수 있습니다.
