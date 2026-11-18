# Fortress War validation

Date: 2026-11-18 (Asia/Seoul). Runtime: Godot 4.7.2, Node 22.16.0, Chrome with software WebGL in the test harness. Workspace: `PlayHub-Platform/forge`.

| Check | Result and evidence |
| --- | --- |
| `npm run test:fortress-war` | 4 tests passed, no skips. Isolated Godot import, engine/UI/remote assertions, source parity and Forge ready/guided HTTP persistence. Logs: `Saved/Tests/fortress-war/{import,engine,ui,remote,parity-probe}.log`. |
| Source comparison | Complete catalog values match. Three terrain/profile/seed cases, spawn positions, wind, charge/angle limits, four flight checkpoints, direct-hit damage/terrain and next-turn state match the original JS. |
| Native simulation | Seeded doubled volleys, hit attribution, one-pixel collision walls, trajectory endpoint, shield/repair/teleport, linear laser wind immunity, BLUE3 rounds and frame-independent AI pass. |
| Native UI/remote projection | Setup, 1v1 and BLUE3 4v4, sliders, Space charge/release, pause, results/restart, Korean font coverage, no input before a network board, room/terrain reset, disconnect and stale snapshot rejection pass. |
| Fortress Web export | Actual Forge-created project exports and runs in Chrome. Readable Korean, visible soil/grass, charging and a projectile after Space release checked. Captures: `Saved/Tests/game-templates/fortress-war-*.png`. |
| Server regression | `node --test Tests/fortress-multiplayer.test.cjs Tests/brawllabs-multiplayer.test.cjs`: 13 passed, no skips. Includes actual sockets, spectator terrain sync, configuration/Origin/build validation, stale/out-of-turn inputs and forfeit. Log: `Saved/Tests/fortress-war/multiplayer-server.log`. |
| Real online clients | `Tests/fortress-multiplayer-browser.test.cjs` passes using two independent Chrome contexts and one actual Godot export. Clipboard invite pins the same build/revision. Inactive-team input produces no action. One shot changes red HP 880→572 and removes 592 terrain pixels (version 2), identically on both clients. Red's Space charge sends a nonzero bounded power; disconnect gives blue a forfeit win. Evidence: `Saved/Tests/fortress-war/multiplayer/{result.json,browser.log,blue.png}`. |
| Shared workspace | Fortress routing, same-room client addition, independent worlds, monotonic observer snapshots and observer reload across same-build worlds pass. Existing Brawl pending-room workspace test also passes. This is a browser UI fixture test; real Godot online behavior is covered separately above. |
| Forge regression | Template bundle and platform store/service suite passed 8 tests during port integration. Existing official Web Editor emits its pre-existing TCP/thread/build warnings, documented by the platform suite; the Fortress game runtime tests report no GDScript errors. |

## Limits

- Online is the Forge/browser workflow with two team controllers plus spectators. Native standalone is offline AI/hotseat. No reconnect reservation, host migration of an active team or network matchmaking service is claimed; a team disconnect forfeits.
- The browser test is local-host execution, not an Internet latency, mobile device, load or long-session certification. No human balance/fun or low-end performance conclusion is implied.
- The Korean starter presentation does not port the Web integration's eight-language selector or audio. Catalog provenance and simulation assumptions remain intact.
- Online rules are authoritative server code. Editing a generated project's visuals is supported; changing online rules requires corresponding server rule changes.
- Validation was performed locally. Remote push and public deployment are outside this record.
