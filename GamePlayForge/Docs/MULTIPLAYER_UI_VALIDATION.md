# Same-server client correction (2026-11-18 KST)

- Root cause confirmed in the native + path: adding a client before Client 1 created its room returned false silently. It did not create a second viewport. Same-world additions now create a pending client, which is bound to Client 1's authoritative room/build when the first join completes. It never opens a separate room while waiting.
- Pending viewport explains that Client 1 must join first. No editor panels were introduced inside the game area.
- Prior test gap: native test only checked iframe creation; actual two-player tests used the standalone harness. New combined native test compares both room IDs/build IDs, waits for both playing states and checks movement replication.
- Public HTTPS: actual native +, two joins, same room/build, playing and replicated movement passed. Separate public two-client/server observer test also passed.
- Separate limitation: on HTTPS the project-sync pluginready flag can fail to arrive even when the native editor/Game UI is operational. Initial full collaboration-readiness test timed out at 210s. The multiplayer-specific test proceeds through the actual Game UI and does not claim project sync is fixed.
- Updated scripts are served by the existing tunnel; reload/reopen the editor to discard old JavaScript. Existing user project contents are preserved; QA projects were separate.

Evidence: Tests/public-native-same-room.test.cjs; Tests/multiplayer-pending-room.test.cjs; Tests/https-multiplayer-live-server.test.cjs; Saved/Tests/https-native-same-room/brawllabs-run.log; Saved/Tests/https-multiplayer-live-server/result.json.

---
# Native viewport correction (2026-11-18 KST)

This section supersedes the earlier Play-adjacent + button and in-viewport workspace design below.

- Removed DOM viewport tabs, diagnostics, runtime inspector, room labels and management buttons from the editor's gameplay surface. Only game lobby/game render remains.
- Native Godot TabBar above the iframe manages Server and Client viewports. Native + menu adds same-world client, new-world client, or selects Server. Client tabs can close.
- The existing Scene tab + still creates scenes; it is not hijacked for sessions. The session strip uses Godot's native tab/menu controls, not the Scene tab manager itself.
- Built-in Inspector shows a read-only runtime snapshot. This is not live remote node editing or full native remote debugger integration. Built-in Output receives runtime messages.
- The prior Play-adjacent custom + is no longer installed.
- Native popup menu temporarily hides the HTML overlay so native popup input is not intercepted by the iframe.

Verified: Tests/editor-native-viewports.test.cjs, Tests/multiplayer-live-server.test.cjs and Tests/multiplayer-workspace-browser.test.cjs all pass (3/3). Actual native + menu creates Client 2, Inspector button opens the built-in Inspector, gameplay surface has no editor DOM panels. Zero JavaScript/GDScript test errors. Screenshot reviewed: Saved/Tests/editor-native-viewports/native-brawllabs.png and native-add-viewport-menu.png.

The existing HTTPS tunnel serves the updated JS and addon immediately. Existing open editor sessions must reload/reopen to load the updated editor plugin; no server restart or game-data migration required. Existing standalone multiplayer.html test harness retains its controls; it is not loaded as a gameplay iframe.

---
Previous implementation record (superseded where noted):

# Godot multiplayer UI validation

## Implementation
- Native Godot Play toolbar: same RunBarButton theme and 28 x 28 size Add Client icon immediately after Play.
- Multiplayer tabs, logs, and runtime inspector mount in the editor host Shadow DOM, not inside the gameplay iframe.
- Server tab renders the same exported Godot build as a read-only observer of authoritative snapshots. No additional player joins.
- Game HUD distinguishes spectators from players: no false HP/ammo/action controls, no observer input.

## Use
Run this checkout's START_GAMEPLAYFORGE.cmd / Launch/PlayForge-Web-Official.exe. Open a BrawlLabs project and the native Game workspace. Join Client 1, use + beside Play, join Client 2, choose teams and Ready. Select Server to watch the live match. Existing projects use pinned builds; create a fresh BrawlLabs project to test template HUD changes.

## Evidence
- Saved/Tests/editor-multiplayer-toolbar: native editor geometry, toolbar and iframe boundary.
- Saved/Tests/multiplayer-live-server: two actual Godot clients and rendered server screenshot.
- Saved/Tests/brawllabs-multiplayer: movement sync, late spectator takeover and disconnect-to-bot evidence.

## Known regression fixture
The HTTP metadata unit fixture in brawllabs-multiplayer.test.cjs creates a fake successful build but no matching BrawlLabs project. Current server validation rejects it. Real exported-project browser tests pass. This unrelated fixture was not weakened or changed.

Final native click E2E passed: same-size Play-adjacent button physically clicked and Client 2 appeared. Server observer E2E passed after HUD fix, including zero outgoing game input. JavaScript syntax checks passed.
