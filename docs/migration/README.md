# PlayHub Platform migration checkpoint

This is a non-destructive source-snapshot import into RobloxProjects branch PlayHub-Platform. Original GoDotProjects and UnrealSamples worktrees remain authoritative historical records and were not changed, deleted, merged, or pushed. source-manifest.json records imported working-tree hashes, including the previously untracked Google/Drive account implementation. It is import provenance, not a claim of merged Git history.

## Layout actually imported
- apps/hub: complete selected PlayHub Portable source; administrator UI remains inside this app, not a new independent service.
- apps/forge: selected Forge development source and account/Drive modules.
- games: selected WebGames catalog/content; not the separate WebProjects archive library.
- tools/run and tools/build: integration preflight and packaging utilities.

Hub tools/build.mjs and sync-webgames.mjs defaults now resolve ../../games from apps/hub. Other legacy deployment tools may still assume the old repository layout; do not use their release ZIPs without migration validation.

## Intentionally not migrated into source control
OAuth secrets, local configurations, SQLite/user data, logs, caches, node_modules, historical ZIPs, executables and Godot browser vendor bundle. No user data import has taken place. Keep original data backups separate and never overwrite them during updates.

## Validation and limits
49 Forge account/session/Drive/project tests passed from the new worktree. This does not establish full editor, engine, game or Hub E2E parity. Local Node is v22.16.0; Hub requires Node 24. Dependencies are not installed in this new tree. Engine binaries and web editor assets remain prerequisites. The separate account gateway is disabled by default; no real Google/Drive authorization or public deployment was performed.

Hub and Forge retain distinct authentication implementations. SSO, shared identity migration, independent production Engine/Game updater, rollback and running-process coordination remain integration work, not completed services. Source ZIPs are not standalone runnable release packages.

Imported 2,428 files (130,271,476 bytes), with SHA-256 verification. Only two Hub default game-path files differ from the source manifest by intentional edits. Common credential-pattern scan found no matches; this is not a guarantee of exhaustive secret detection. Hub rules/portal-contract tests: 24 passed.

Inherited ignore rules leave 306 copied generated files outside the source commit (Hub catalog/game-cache/locales and Godot import sidecars); see ignored-generated-files.json. Canonical games, including Source/Data design tables, are tracked. Rebuild generated Hub outputs before runtime deployment. Original imported whitespace was preserved; git diff --check reports inherited whitespace warnings, not a clean lint pass.

Windows Check_Components.bat was executed: returns exit 1, correctly blocks Hub/Forge/Engine for missing prerequisites; Game checks entry existence only. Initial source ZIPs dated 2026.11.18 are superseded because design Data tables/build tooling exclusions were discovered during review. Use corrected 2026.11.18.1 artifacts only after their manifest verification.
