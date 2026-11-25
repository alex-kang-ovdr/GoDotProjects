# Existing Godot fork submodule

- Path: `godot-engine` (submodule name `godot` in `.gitmodules`). Originally registered at `engine/godot`; moved during the location correction, see [godot-location-correction.md](godot-location-correction.md).
- Fork: git@github.com:alex-kang-ovdr/godot-engine.git
- Fixed commit: engine-ssot.json `pinnedForkCommit` 이 정본이다 (2026-11-25 기준 `e7a83dd7`, upstream base `ed1daf0bf001b61586d9930840f2f1394092c079` 4.7.2-stable 위 코어 패치 7건 포함). 패치 목록은 [docs/godot-refactoring/SSOT.md](../godot-refactoring/SSOT.md) §3.
- Existing sources inspected: D:/Github/godot-engine and D:/Github/GoDotProjects-worktrees/PlayForge-Engine. Both had no reported working-tree changes.
- Original Forge GodotFork/upstream.json identifies this exact commit and reports no engine core patches, no fork binary build.

The fixed commit was fetched directly from the fork into a new isolated probe and then into this submodule. Submodule init/update and detached checkout completed successfully. Fork HEAD is a different commit; this submodule intentionally follows the existing Forge pin, not latest HEAD. SSH access to the fork is required on another machine. Do not silently switch to upstream or latest.

Only .gitmodules, the engine/godot gitlink (now `godot-engine`) and this note belonged to the original change. At that time the user moves from apps/hub and apps/forge into hub and forge, and tools/run into tools, were still unstaged; they have since been committed as the current layout. Original checkouts are unchanged. This is engine SOURCE registration, not native/WASM binaries, an Engine deployment ZIP or a build/test pass.

The isolated remote probe remains under ignored artifacts/godot-remote-probe-20261118; no existing data was deleted.
