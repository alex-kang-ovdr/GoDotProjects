# PlayForge Showcase & Replay 시연 엔진 레퍼런스 가이드 (`playforge_showcase`)

본 문서는 첨부된 **`tool-integration-20261118.zip`**(`tools/local-play/INTEGRATION.md`, `tools/game-launcher/DESIGN.md`) 및 **`diligent.zip`**(`docs/guide/code-mode.md`, `docs/guide/tool-rendering.md`) 분석 결과를 바탕으로, `forge/Godot/addons/playforge_showcase/` 폴더([plugin.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/plugin.gd), [showcase_timeline.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/showcase_timeline.gd), [showcase_scene_replay.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/showcase_scene_replay.gd), [showcase_import.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/showcase_import.gd), [showcase_store.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/showcase_store.gd), [showcase_game_launch.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/showcase_game_launch.gd))의 리플레이 시연 및 검증 기능을 고도화하기 위한 기술 문서입니다.

---

## 1. 비파괴 격리 리플레이 실행 (`local-play`의 `--replay-from` 아키텍처)

`tool-integration`의 `tools/local-play/INTEGRATION.md`에서 강조하는 핵심 원칙은 **"기존 작업 공간이나 이전 실행 디렉터리를 리플레이 작업 공간으로 재사용하지 않는다"**입니다.

### 1.1 PlayForge의 격리 리플레이 파이프라인
1. **원본 씬 보호**:
   - 사용자가 작업 중인 `res://scenes/main.tscn`은 절대 리플레이 재생기로 직접 덮어쓰지 않습니다.
   - 첫 편집 시작 시(또는 빈 맵 초기화 후 새 게임 제작 시작 시) 원본 씬의 초기 상태를 `baseline-<uid>.tscn`으로 스냅샷 저장합니다.
2. **새 리플레이 인스턴스 생성**:
   - 리플레이 시작(`play_recording()` 또는 `replay.play` 작업) 시 `res://.godot/playforge_agent_replays/AgentReplay-<uid>.tscn`에 기준선 씬을 새로 복사해 열고, 그 위에서 타임라인 큐(`schemaVersion: 4`)를 재생합니다.
   - 타임라인 스크러빙(되감기/빨리감기)은 `scene_commands.gd`의 `apply_snapshot()`과 `_reverse_edit()`를 통해 격리된 리플레이 씬 안에서만 결정론적으로 수행됩니다.

---

## 2. 씬 재열기(Reopen) 시 리소스·텍스처·스크립트 즉시 바인딩 보장

`tool-integration`의 `INTEGRATION.md`에서 해결한 **"Studio에서 저장된 맵을 재열 때 실시간 뷰포트 타이머에만 맡기면 메시·재질 초기화가 멈추는 문제"**와 동일한 패턴이 Godot 에디터 리플레이에서도 중요합니다.

### 2.1 즉시 리소스 바인딩 메커니즘 (적용 완료)
- AI가 한 턴 안에서 에셋 스토어 팩(`pack.import`)이나 신규 SVG(`asset.write`), 신규 스크립트(`script.write`)를 생성하고 곧바로 노드에 연결한 뒤 `replay.play`를 실행할 때, Godot의 백그라운드 파일시스템 스캔(`EditorFileSystem.scan()`)이 끝나기 전에 리플레이가 시작될 수 있습니다.
- 이를 해결하기 위해 [scene_commands.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_agent_chat/scene_commands.gd#L77-L112)의 `decode_property()`는 2단계 바인딩을 수행합니다:
  1. `ResourceLoader.exists(path, "Texture2D")`가 아직 `false`인 신규 `.svg` 파일은 `Image.load_svg_from_buffer()` + `ImageTexture.create_from_image()`로 즉시 메모리에 디코딩하여 뷰포트와 리플레이 화면에 첫 프레임부터 텍스처가 표시되게 합니다.
  2. 신규 작성된 `.gd` 스크립트는 `ResourceLoader.load(path, "Script", ResourceLoader.CACHE_MODE_REPLACE)` 실패 시 `GDScript.new()`에 소스를 주입하고 `reload(true)` 및 `take_over_path(path)`를 호출하여 리플레이 완료 즉시 스크립트가 노드에 정상 바인딩되도록 보장합니다.

---

## 3. 에셋 스토어 마운트 영수증 및 해시 검증 (`local-play` Receipt 패턴)

`tool-integration`의 로컬 플레이는 223개 에셋 마운트 시 **446개 receipt와 1,338개 파일 SHA-256 해시**를 검증하고 `reopen-verification.json`을 남깁니다.

### 3.1 `showcase_import.gd` & `showcase_store.gd` 활용 및 확장
- 현재 `showcase_import.gd`는 파일 복사 시 `created[path] = FileAccess.get_sha256(path)`를 기록하고 실패 시 롤백하며 `receipt = {"state": "done", "count": ..., "first": ..., "files": ...}`를 발행합니다.
- **확장 포인트**:
  - AI 에이전트가 `pack.import` 또는 `asset.write`를 통해 에셋을 준비한 뒤 리플레이를 마쳤을 때, 모든 `Sprite2D.texture` 및 `Node.script` 참조가 유효한지 검사하는 `reopen_diagnostics()` 메서드를 추가하여 리플레이 완료 후 자동 게임 실행(`playOnCompletion: true`) 전 무결성을 검증할 수 있습니다.

---

## 4. Schema v4 리플레이 액션 및 `Code Mode` 중첩 호출 시각화

### 4.1 Schema v4 지원 액션 ([showcase_timeline.gd](file:///d:/Github/GoDotProjects-worktrees/Forge-AgentReplay/forge/Godot/addons/playforge_showcase/showcase_timeline.gd#L131-L135))
- 현재 Schema v4는 다음 6가지 씬 편집 액션을 타임라인 큐로 검증·재생합니다:
  - `add` (`node.add`)
  - `set` (`property.set` 및 `script.attach`)
  - `delete` (`node.delete`)
  - `rename` (`node.rename`)
  - `clear` (`scene.clear`)
  - `revert` (Undo 되돌리기 단계)
- 각 큐는 4가지 역할(`gui` → 인스펙터, `level` → 뷰포트, `script` → 스크립트/씬, `assets` → 파일시스템)의 커서 이동 및 캡션 오버레이와 동기화됩니다.

### 4.2 `diligent` Code Mode 중첩 호출(`parentToolCallId`) 타임라인 확장안
- 향후 `Code Mode`(`exec`)로 여러 편집 도구를 스크립트 루프 안에서 실행할 때, 각 중첩 호출에 `parentToolCallId`와 `role`을 부여하면 `showcase_panel.gd` 타임라인 바에서 상위 목표(예: `"파이프 장애물 쌍 배치"`) 아래에 하위 스텝들을 그룹화하여 시각적으로 훨씬 이해하기 쉬운 제작 시연을 제공할 수 있습니다.
