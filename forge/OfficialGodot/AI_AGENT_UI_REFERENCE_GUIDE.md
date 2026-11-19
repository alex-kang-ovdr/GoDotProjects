# PlayForge Web AI Agent UI & 에디터 브리지 레퍼런스 가이드 (`OfficialGodot`)

본 문서는 첨부된 **`diligent.zip`**(`packages/protocol`, `packages/runtime`, `apps/vscode-extension`) 및 **`tool-integration-20261118.zip`** 분석 결과를 바탕으로, `forge/OfficialGodot/` 폴더의 웹 에이전트 UI([agent.html](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/agent.html), [agent.css](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/agent.css), [agent.js](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/agent.js))와 Godot 웹 에디터 브리지([editor-bridge.js](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/editor-bridge.js))에 적용된 패턴 및 향후 확장할 UI/프로토콜 설계를 정리한 문서입니다.

---

## 1. Thin-Client 프로토콜 및 뷰 아키텍처

`diligent`의 **Frontend Protocol Philosophy**에 따라 웹 클라이언트는 에이전트 상태를 자체 추정하지 않고 런타임/에디터 브리지의 상태를 투영(Projection)합니다.

### 1.1 상단 헤더 모드 탭 & Config SSOT 구조 (적용 완료)
- **모드 탭 그룹 (`.mode-tab-group`)**:
  - **OpenAI / ChatGPT 로제트 탭 (`#agent-tab-chat`)**: 표준 AI 에이전트 대화 뷰(`#agent-chat-view`) 활성화.
  - **Claude 스타버스트 탭 (`#agent-tab-claude-console`)**: 창 내부의 CLI형 **Claude Console 뷰**(`#agent-claude-console-view`) 활성화 (`/help`, `/status`, `/model <id>`, `/connect`, `/clear` 및 실시간 스트리밍 실행).
- **Config 단일 진실 공급원 (SSOT, `#agent-config-overlay`)**:
  - 상단 헤더의 중복 MCP 아이콘(`>_`)과 Skills 아이콘(`🏛`) 및 별도 `#agent-mcp-dialog` 모달을 제거하고, **Config 오버레이 내부에만** `AI connection`, `MCP & Tools`(에디터 브리지 상태 + Godot AI 47개 MCP 도구 도메인 체크리스트), `Skills`가 순서대로 존재합니다.
- **Connect AI 브랜드 로고 아이콘 (`.provider-logo`)**:
  - `#agent-connect-dialog`의 모든 프로바이더 카드에서 좌측 연결 상태 점(`.status-dot`) 바로 오른쪽에 각 AI 브랜드 SVG 로고(`openai`, `claude`, `gemini`, `zai`, `ollama`)를 렌더링하고, API 키 방식은 제목에 `API`를 명시합니다.

---

## 2. 대화 기록 보존 및 에러 복구 의도 (`RecoveryIntent`) 패턴

`diligent`의 `ARCHITECTURE.md` ("Error diagnostics, presentation, and recovery")와 `session-lifecycle.md`에서 정의한 핵심 불변식입니다.

### 2.1 응답 완료 후 질문·답변 증발 방지
- **불변식**: 스트리밍 도중이나 스트리밍 완료 직후 도구 검증 오류·타임아웃·사용자 중지가 발생하더라도 **이미 화면에 표시된 사용자 질문과 어시스턴트 응답 텍스트는 절대 트랜스크립트에서 삭제하지 않습니다**.
- **현재 적용 ([agent.js](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/agent.js#L1854-L1868))**:
  - 독립 모드(`standaloneChat`)에서 스트리밍 중 `partial` 텍스트가 수신된 상태에서 에러 또는 `AbortController` 중지가 발생하면, `finally`에서 `partial`을 비우기 전에 `session.messages`에 `{ role: 'user', content: prompt }`와 `{ role: 'assistant', content: partial }`를 커밋하고 로컬 스토리지에 저장합니다.
  - 임베디드 모드(`renderStatusBanner`)에서는 Godot 호스트가 작업 중(`host.busy`)일 때 보내는 상태 문구(`"에이전트가 작업 중…"`, `"응답을 받는 중…"`)를 에러 배너(붉은색)가 아닌 정보 배너(`.is-info`)로 구분해 렌더링합니다.

### 2.2 3단계 에러 표현 및 복구 액션 (`RecoveryIntent`) 확장안
| 계층 | 역할 | UI 표현 방식 |
|---|---|---|
| **Core Diagnostic** | HTTP 상태 코드, 프로바이더 에러 코드, 재시도 가능 여부 분류 | 세션 로그에 원시 진단 데이터로 보존 |
| **Runtime Intent** | `configure_provider` / `retry_turn` / `new_thread` 중 단일 복구 의도 결정 | `statusNeedsConnect` 등 의미론적 플래그로 전달 |
| **Client Action** | 유휴 스레드의 마지막 실패 항목에만 인라인 복구 버튼 노출 | `#agent-status-connect` (`Connect AI`) 또는 `Retry` 버튼 표시 (자동 재실행 금지) |

---

## 3. 내부 문맥 주입(`visibility: "internal"`)과 `Studio changes detected` 카드

`diligent`의 `AgentLoopHook` 및 `context_notice` 아키텍처입니다.

1. **문맥과 표시의 분리**:
   - 사용자가 에디터에서 노드를 선택·수정하거나 파일시스템에서 에셋을 추가/삭제하면, 런타임은 모델 프롬프트 체인에는 상세 JSON 문맥(`scene`, `rootType`, `selection`, `nodes`, `assets`, `storePacks`)을 주입하되 `visibility: "internal"`로 표시합니다.
   - 사용자 채팅 화면에는 거대한 JSON 말풍선 대신 `#agent-studio-changes` (**`Studio changes detected · N changes`**) 요약 카드만 표시합니다.
2. **활용 포인트**:
   - 현재 `#agent-studio-changes` 드로어에 스테이징된 선택 노드 칩뿐만 아니라, 직전 턴 이후 에디터에서 직접 변경된 노드/에셋 diff 요약을 `context_notice` 이벤트로 받아 접기/펼치기 형태로 보여줄 수 있습니다.

---

## 4. 구조화된 도구 렌더링 (`ToolRenderPayload`) 도입 설계

`diligent/docs/guide/tool-rendering.md`에 정의된 **`ToolRenderPayload`** 규약을 [agent.js](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/OfficialGodot/agent.js)의 트랜스크립트 렌더러에 도입하면 텍스트 위주의 도구 응답을 풍부한 에디터 카드로 시각화할 수 있습니다.

### 4.1 `ToolRenderPayload` 스키마
```json
{
  "inputSummary": "TappyChicken 씬 노드 6개 구성 및 스크립트 연결",
  "outputSummary": "씬 편집 11개 적용 완료 · Replay 시연 시작",
  "blocks": [
    { "type": "status_badges", "items": [{ "label": "Scene", "value": "res://scenes/main.tscn", "tone": "success" }] },
    { "type": "tree", "title": "Added Nodes", "nodes": ["Sky (ColorRect)", "Bird (Sprite2D)", "Pipes (Node2D)", "Hud/Score (Label)"] },
    { "type": "file", "path": "res://Scripts/Main.gd", "action": "written" },
    { "type": "resource", "resourceType": "agent_replay", "resourceId": "latest", "title": "AI 채팅 제작 과정 Replay 열기" }
  ]
}
```

### 4.2 지원 블록 타입별 PlayForge UI 매핑
- `summary` / `key_value`: 편집된 씬 경로, 적용된 명령 개수, 소요 시간 요약 헤더.
- `tree`: `node.add`, `node.delete`, `node.rename`, `scene.clear` 결과를 씬 계층 트리로 시각화.
- `asset_gallery`: `pack.import` 또는 `asset.write`로 추가된 `res://Assets/*.svg` 썸네일 그리드 미리보기.
- `diff` / `file`: `script.write`로 작성된 `.gd` 스크립트 코드 하이라이팅 및 줄 단위 diff 표시.
- `resource`: 호스트 소유 리소스(예: `resourceType: "agent_replay"`) 클릭 시 `command({ type: 'replay' })`를 호출해 PlayForge Showcase 리플레이를 즉시 실행.

---

## 5. 스레드 히스토리 커서 페이지네이션 & `PendingSteer` 큐잉

1. **비차단 사이드바 및 히스토리 페이지네이션 (`thread/list` & `thread/history`)**:
   - 대화가 길어지거나 이미지 첨부가 많아질 때 `localStorage` 전체 로드로 인한 지연을 막기 위해, 세션 목록(`#agent-session-list`)은 헤더 메타데이터(`id`, `title`, `updated`, `firstUserMessage`)만 먼저 렌더링하고, 대화 본문은 최근 50개(최대 1 MB) 단위로 커서 페이지네이션(`Load earlier history`)을 적용할 수 있습니다.
2. **실행 중 스티어링 (`PendingSteer` & `#agent-queue-list`)**:
   - 현재 구현된 메시지 큐(`queuedMessages`)를 `diligent`의 `turn/steer` 규약과 결합하여, 실행 중 사용자가 `Stop`을 눌렀을 때 대기 중인 첫 번째 큐 메시지(및 첨부 이미지)가 있으면 추가 클릭 없이 즉시 다음 턴으로 자동 전환되도록 확장할 수 있습니다.
