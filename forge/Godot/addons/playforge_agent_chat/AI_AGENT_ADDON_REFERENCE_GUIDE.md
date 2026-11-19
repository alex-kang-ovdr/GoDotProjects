# PlayForge Godot AI Agent 애드온 레퍼런스 가이드 (`playforge_agent_chat`)

본 문서는 첨부된 **`diligent.zip`** 및 **`tool-integration-20261118.zip`**(`tools/lua-framework/_tools/studio-mcp.py`, `tools/local-play/`) 분석을 바탕으로, `forge/Godot/addons/playforge_agent_chat/` 폴더([plugin.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/plugin.gd), [scene_commands.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/scene_commands.gd), [chat_panel.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_panel.gd), [chat_context.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_context.gd), [chat_sessions.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_sessions.gd), [chat_stream.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_stream.gd), [chat_web_dock.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_web_dock.gd))에 적용된 기능과 추가 활용 방안을 정리한 문서입니다.

---

## 1. 에디터 문맥 수집 및 `visibility: "internal"` 주입 패턴

### 1.1 씬·에셋·스토어 팩 통합 문맥 (`chat_context.gd`)
- [chat_context.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_context.gd#L60-L128)의 `request_context()`는 매 턴마다 다음 5가지 에디터 상태를 수집해 시스템 문맥으로 주입합니다:
  1. `scene` & `rootType`: 현재 열린 씬 파일 경로(`res://scenes/main.tscn`)와 루트 노드 클래스(`Node2D`, `Node3D` 등).
  2. `selection`: 사용자가 명시적으로 스테이징한 선택 노드 목록.
  3. `nodes`: 루트 이하 씬 트리 계층 구조(최대 깊이 6, 최대 80개 노드 경로 및 타입).
  4. `assets`: 보호 폴더(`addons/`, `.godot/`, `.playforge-*`)와 현재 열린 씬을 제외한 프로젝트 내 모든 사용자 에셋·스크립트 파일 경로 목록.
  5. `storePacks`: `res://.playforge-store.json`에 등록된 내장 에셋 스토어 팩 메타데이터(`id`, `title`, `fileCount` — 예: `tappy-original`).

### 1.2 `diligent`의 `AgentLoopHook` & 내부 문맥 분리 활용
- `diligent`에서는 에디터 상태 변경을 일반 사용자 메시지로 섞지 않고 `visibility: "internal"` 속성으로 주입한 뒤, UI에는 `context_notice`만 노출합니다.
- 향후 다중 턴 자동 실행(Goal 모드) 도입 시 `before-turn` 훅에서 직전 턴 이후 발생한 에디터 UndoRedo 버전 차이(`_editor_version(root)`)와 파일시스템 변경분만 계산하여 경량 diff 문맥으로 주입할 수 있습니다.

---

## 2. 단일 배치 올인원 편집 및 시연 도구 (`pf_workspace_apply`)

한 번의 요청에 하나의 도구 묶음만 허용하는 안전 규칙을 유지하면서도, **"빈 프로젝트 초기화 → TappyChicken 제작 → Replay로 처음부터 과정 시연"**까지 한 턴에 수행할 수 있도록 [plugin.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/plugin.gd)와 [scene_commands.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/scene_commands.gd)를 구성했습니다.

### 2.1 지원 작업(`kind`) 및 실행 파이프라인 순서
1. **파일·에셋·스크립트 준비 단계 (`FILE_OP_KINDS`)** — 배열 순서대로 먼저 실행되며, `dryRun` 검증 시에는 `staged_files` 맵에 등록되어 후속 `scene_ops`의 텍스처/스크립트 경로 검증을 통과시킵니다:
   - `assets.clear`: 보호 경로(`addons/`, `.godot/`, `project.godot`, 현재 열린 씬)를 제외한 모든 사용자 에셋·스크립트 및 `.import`/`.uid` 사이드카 파일 삭제.
   - `asset.delete`: 지정한 개별 파일 또는 폴더(`res://...`) 재귀 삭제 및 삭제된 `.gd` 스크립트 자동 분리.
   - `pack.import`: `res://.playforge-store.json`에 등록된 에셋 팩(예: `tappy-original`)의 원본 파일들을 즉시 `res://Assets/...`로 복사.
   - `asset.write`: `.svg`, `.tres`, `.gdshader`, `.json`, `.txt`, `.cfg` 에셋 파일 생성.
   - `script.write`: `res://Scripts/...gd` GDScript 파일 작성 (`attach: true` 지정 시 대상 노드에 자동 연결 작업 추가).
2. **씬 노드·속성·스크립트 편집 단계 (`scene_ops`)** — `EditorUndoRedoManager` 및 리플레이 타임라인(`_sessions`)에 기록됩니다:
   - `scene.clear`: 루트(`.`) 하위 모든 자식 노드를 제거해 빈 맵으로 초기화(1단계 Undo로 자식 순서 및 서브트리 `owner` 완전 복원).
   - `node.add`: `ClassDB`에 등록된 모든 인스턴스화 가능 `Node` 파생 클래스 생성.
   - `property.set`: `position`, `size`, `scale`, `rotation`, `rotation_degrees`, `text`, `visible`, `color`, `modulate`, `self_modulate`, `z_index`, `custom_minimum_size`, `offset_*`, `anchor_*`, `mouse_filter`, `horizontal_alignment`, `vertical_alignment`, `texture_filter`, `texture_repeat`, `centered`, `flip_h`, `flip_v`, `region_enabled`, `region_rect`, `texture`(SVG 즉시 디코딩 폴백 포함), `script`(GDScript 즉시 컴파일 폴백 포함), `collision_layer`, `collision_mask`, `gravity_scale` 설정.
   - `script.attach`: 지정한 노드에 `res://...gd` 스크립트를 연결(UndoRedo 및 Replay 지원).
   - `node.delete` / `node.rename` / `editor.undo`.
3. **리플레이 즉시 시연 단계 (`replay.play`)**:
   - 빈 맵에서 새 노드를 구성하기 시작할 때(`root.get_child_count() == 0`) 자동으로 빈 맵을 새로운 `baseline-*.tscn`으로 저장하고, 편집 완료 즉시 `play_recording()`을 호출하여 `PlayForge Showcase`에서 처음부터 제작 과정을 시연합니다.

---

## 3. 응답 유실 방지 및 `StudioMCP` 신뢰성 패턴

### 3.1 스트리밍 후 도구 검증 실패 시 대화 보존 (`preserve_reply_with_error`)
- [chat_panel.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/chat_panel.gd#L406-L535) 및 [plugin.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/plugin.gd#L278-L335):
  - 모델이 텍스트 설명을 스트리밍한 뒤 반환한 도구 호출이 검증에 실패하더라도, `_fail_or_preserve()`가 `preserve_reply_with_error(prose, error_message)`를 호출하여 **사용자의 질문과 모델의 텍스트 답변을 대화 기록에 영구 저장**하고 하단 상태 라벨에만 오류 원인을 표시합니다.
  - 디스크 저장 실패나 64 KiB 초과 응답이 발생하더라도 자동 UTF-8 바이트 안전 절단(`_normalize_reply_text`) 및 메모리 폴백(`_ephemeral_turns`)을 통해 네이티브 UI와 웹 UI(`chat_web_dock.gd`) 양쪽에서 마지막 질문·답변이 절대 사라지지 않도록 보장합니다.

### 3.2 `tool-integration`의 `studio-mcp.py` 패턴 활용
- **지연 등록 흡수 (`--auto-active` 재시도)**:
  - Godot 웹/네이티브 에디터가 처음 부팅되거나 파일시스템 리임포트 중일 때 브리지 명령이 누락되지 않도록 준비 상태를 폴링 후 명령을 디스패치합니다.
- **정본 도구 결과 보존 (`McpToolResult` & `--out`)**:
  - `diligent`의 `metadata.mcpResult` 및 `studio-mcp.py`의 `--out` 패턴처럼, 각 턴의 원본 도구 호출 JSON과 실행 결과를 `_latest`(`latest.json`)에 정본으로 보존하여 에디터 재시작 후에도 동일한 리플레이 시연을 재현합니다.
- **분리된 노드 메모리 정리 (`_free_detached_replay_nodes`)**:
  - `node.delete`나 `scene.clear`로 씬 트리에서 분리되어 Undo 스택에 보관 중인 노드는 플러그인 종료(`_exit_tree()`) 시 안전하게 해제하여 텍스처·셰이더 RID 누수를 방지합니다.
