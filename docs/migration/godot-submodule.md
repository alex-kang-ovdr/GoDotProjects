# Existing Godot fork submodule

- Path: engine/godot
- Fork: git@github.com:alex-kang-ovdr/godot-engine.git
- Fixed commit: ed1daf0bf001b61586d9930840f2f1394092c079 (4.7.2-stable)
- Existing sources inspected: D:/Github/godot-engine and D:/Github/GoDotProjects-worktrees/PlayForge-Engine. Both had no reported working-tree changes.
- Original Forge GodotFork/upstream.json identifies this exact commit and reports no engine core patches, no fork binary build.

The fixed commit was fetched directly from the fork into a new isolated probe and then into this submodule. Submodule init/update and detached checkout completed successfully. Fork HEAD is a different commit; this submodule intentionally follows the existing Forge pin, not latest HEAD. SSH access to the fork is required on another machine. Do not silently switch to upstream or latest.

Only .gitmodules, the engine/godot gitlink and this note belong to this change. Existing user moves from apps/hub and apps/forge into hub and forge, and tools/run into tools, remain unstaged and unmodified. Original checkouts are unchanged. This is engine SOURCE registration, not native/WASM binaries, an Engine deployment ZIP or a build/test pass.

The isolated remote probe remains under ignored artifacts/godot-remote-probe-20261118; no existing data was deleted.
