# PlayForge AI Agent 테스트 및 실모델 평가(Evals) 레퍼런스 가이드 (`Tests`)

본 문서는 첨부된 **`diligent.zip`**(`packages/e2e`, `packages/evals`) 및 **`tool-integration-20261118.zip`**(`.agent-work/integration/`, `tools/local-play/test_*.py`, `Batch/Tests/`)의 검증 아키텍처를 분석하여, `forge/Tests/` 폴더의 테스트 스위트([agent-chat-conversation.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-chat-conversation.test.cjs), [agent-iframe.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-iframe.test.cjs), [agent-provider.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-provider.test.cjs), [agent-codex-protocol.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-codex-protocol.test.cjs), [agent-chat.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-chat.test.cjs), [agent-chat-workspace.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-chat-workspace.test.cjs), [agent-chat-settings.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-chat-settings.test.cjs))를 체계적으로 확장하기 위한 가이드입니다.

---

## 1. 결정론적 E2E(`@diligent/e2e`)와 실모델 행동 평가(`@diligent/evals`)의 이원화

`diligent`는 에이전트 품질 검증을 두 개의 명확히 분리된 레이어로 운영합니다.

| 구분 | 결정론적 E2E 스위트 (`forge/Tests/agent-*.test.cjs`) | 실모델 행동 평가 스위트 (`@diligent/evals` 패턴) |
|---|---|---|
| **목적** | 프로토콜, UI 상태 전이, Undo/Redo, 파일/에셋 보호, 리플레이 타임라인의 **100% 재현 가능한 회귀 검증** | 실제 LLM(ChatGPT Codex, Claude, Gemini, Ollama)이 시스템 프롬프트와 도구 스키마를 보고 **올바른 도구와 인자를 선택하는지** 평가 |
| **스트림 소스** | 로컬 Mock HTTP/NDJSON 서버 (`fake-stream`) | 실제 연결된 프로바이더 프로필 (`chatgpt-oauth`, `claude-connect`, `gemini-connect`) |
| **검증 방식** | 정확한 DOM/GDScript 상태 단언, `SCRIPT ERROR:` 및 RID 리소스 누수 제로 검증 | 격리된 임시 워크스페이스(`runtime-workspace`), 예산 정책(`budget-policy`), 결정론적 채점기(`invariants` & `grading`) |

---

## 2. `diligent/packages/evals`에서 PlayForge로 도입할 핵심 평가 태스크 8종

`diligent/packages/evals/src/tasks/`의 35개 평가 시나리오 중 PlayForge Godot AI 에이전트에 직접 대응하는 8가지 핵심 평가 항목입니다.

1. **`structured-tool-args` (구조화된 복합 도구 인자 생성)**:
   - `"TappyChicken 만들고 Replay로 처음부터 과정 시연"` 프롬프트 입력 시 `pf_workspace_apply` 단일 호출 내에 `pack.import`/`asset.write`, `script.write`, `node.add`, `property.set`, `script.attach`, `replay.play`를 유효한 스키마와 부모→자식 순서로 생성하는지 평가합니다.
2. **`recover-tool-error` (도구 검증 오류 복구 및 대화 보존)**:
   - 잘못된 노드 경로 또는 보호된 파일(`res://project.godot`) 삭제 시도로 검증 오류가 반환되었을 때, 이전 질문·답변이 대화창에 보존되고 다음 턴에서 올바른 경로로 수정 호출하는지 검증합니다.
3. **`plan-readonly` & `plan-to-execute` (모드별 읽기 전용 불변식)**:
   - `Plan` 모드에서는 어떤 씬/에셋 변경 도구도 실행되지 않아야 하며, 이후 `Default` 또는 `Auto` 모드로 전환했을 때 계획한 내용을 정확히 실행하는지 검증합니다.
4. **`mcp-lazy-tool` (도구 필터링 및 도메인 게이팅)**:
   - Config에서 특정 도구(`pf_workspace_apply`) 또는 MCP 도메인을 비활성화했을 때 요청 페이로드와 실행기 양쪽에서 차단되는지 검증합니다.
5. **`steer-during-fix` (실행 중 메시지 큐잉 및 인터럽트)**:
   - 첫 번째 응답 스트리밍 중 두 번째 메시지를 `Queue`에 넣었을 때 첫 턴 완료 직후 순서대로 자동 실행되는지 검증합니다([agent-iframe.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-iframe.test.cjs#L285-L315)에 반영 완료).
6. **`session-resume` (세션 전환·이름 변경·재개 일관성)**:
   - 여러 대화 스레드를 오가며 초안(draft)과 대화 기록이 섞이지 않고 복원되는지 검증합니다([agent-chat-workspace.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-chat-workspace.test.cjs)에 반영 완료).
7. **`file-roundtrip` (스크립트·에셋 생성 및 삭제 라운드트립)**:
   - `asset.write` / `script.write`로 생성한 파일이 실제 디스크와 Godot `ResourceLoader`에서 읽히고, `asset.delete` / `assets.clear` 시 사이드카(`.import`, `.uid`)까지 깨끗이 정리되는지 검증합니다([agent-chat-conversation.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-chat-conversation.test.cjs)에 반영 완료).
8. **`image-tool-result` (비전 첨부 및 프로바이더별 가드)**:
   - PNG/JPEG/WebP 512 KiB 제한 및 매직 바이트 시그니처 검증이 동작하는지 확인합니다([agent-provider.test.cjs](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Tests/agent-provider.test.cjs)에 반영 완료).

---

## 3. `tool-integration`의 3단계 증거 기반 검증 규약

`tool-integration-20261118`(`.agent-work/integration/`)이 사용한 증거 아티팩트 규약으로, PlayForge의 `forge/Saved/Tests/` 로그 수집과 결합하여 활용할 수 있습니다.

1. **원본 보존 증명 (`preservation.json` 패턴)**:
   - 리플레이 시연이나 테스트 실행 전후 원본 씬(`res://scenes/main.tscn`)과 보호된 프로젝트 설정 파일의 바이트/SHA-256 해시가 100% 동일한지 단언합니다(`assert.deepEqual(fs.readFileSync(scene), original)`).
2. **정상 종료 및 리소스 누수 제로 증명 (`runtime-exit.json` 패턴)**:
   - Godot 헤드리스 에디터 종료 시 종료 코드 `0`뿐만 아니라 표준 출력/에러 로그에 `/SCRIPT ERROR:|Parse Error|^ERROR:/m`(분리된 노드, `DummyTexture`, `DummyShader` RID 누수 포함)가 단 한 건도 없음을 검증합니다.
3. **사전 적용 검사 (`--dry-run` 패턴)**:
   - 실제 씬이나 파일시스템을 변경하기 전 `preview["dryRun"] = true`로 `_call_scene_edit(preview)`를 먼저 통과시켜, 부분 적용 상태로 인해 씬이나 Undo 히스토리가 오염되는 것을 원천 차단합니다.
