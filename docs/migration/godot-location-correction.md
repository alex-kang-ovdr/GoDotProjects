# Corrected integration location

Canonical integration worktree: D:/Github/GoDotProjects-worktrees/PlayHub-Platform
Repository: D:/Github/GoDotProjects
Branch: PlayHub-Platform

Existing integration history was fetched locally without rewriting commits. Its lineage includes the earlier RobloxProjects integration base; this is not a merge with GoDotProjects main. Existing main and other worktrees were not changed.

The user's manual structure is retained: hub/, forge/, games/, references/, tools/. The engine fork is now a single submodule at godot-engine/, fixed to ed1daf0bf001b61586d9930840f2f1394092c079. No duplicate engine/godot checkout is retained in this worktree. Godot source is not a runnable engine binary: set an explicitly verified GODOT_BIN when runtime prerequisites are ready.

All 5,713 non-engine-checkout files (465,249,888 bytes), including untracked references and ZIP artifacts, were copied and SHA-256 verified. godot-worktree-transfer.json records pre-correction file hashes. The clean engine checkout was recreated from the verified remote commit rather than copying stale .git pointers. User manual changes have not been staged or committed automatically.

Additional references: 2,976 documents/source/image files and 254 reviewed archives copied with original hash verification. 96 archives were retained at their original source and deferred for recorded runtime/unsupported-content/inspection-limit reasons. Read reference-manifest.json together with reference-archive-manifest.json; do not claim complete unqualified reference coverage.

Earlier source ZIPs retain their original layout and are historical artifacts, not updated packages for the corrected paths. Full production runtime, Engine binary package, unified login and deployment validation remain incomplete.

Final cleanup: all 5,713 source files were rechecked unchanged. Ten pre-correction originals were separately preserved and verified under artifacts/pre-path-correction. The old RobloxProjects PlayHub-Platform worktree was then removed with Git; its old path no longer exists. Its branch/history was retained. New worktree remains at commit 066ed3345ac1e54a528b599fc069ca6aace667c1; user layout changes and new reference material remain uncommitted, not silently staged. Final focused tests: Forge 49, Hub 24, path/packaging 11 passed (84 total). Full engine/build/server E2E remains unverified.
