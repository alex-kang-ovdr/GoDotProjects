# Fortress War — Godot template

`fortress-war` is the native Godot port of this repository's Fortress War prototype (`games/fortress-blue`, integrated Web release 1.4.0). Offline play uses GDScript and a destructible pixel mask without external assets or services. Online play follows BrawlLabs' Forge lobby, WebSocket server and Godot Web game bridge.

## Open and play

In Forge, open **My projects → Fortress War → Open ready project** (완성본 열기), then run the project. The standard guided creation flow also bundles the data and terrain shader before assembling scripts and the scene. Alternatively import this folder's `project.godot` into Godot 4.7.2 and press F6/F5.

## Online multiplayer

The Forge editor's **Game** workspace opens the multiplayer lobby. Enter a name, choose the match settings and create a room. Share **초대 링크 복사**, choose opposing teams and press **Ready** on both clients. The workspace's **+ 클라이언트** / separate-window action opens another client in the same room, as in BrawlLabs. The standalone lobby is `/OfficialGodot/fortress-war-lobby.html` on the Forge server.

Two players each control one team's tanks (Classic 1/2/4 per team; BLUE3 4 per team). Late arrivals can spectate. The server owns the clock, turn, flight, damage, terrain and result; the inactive team and spectators cannot issue gameplay commands. A departing team controller forfeits to the other team. Finished matches stay available for spectators; create a new room to replay. Network matches cannot be paused by one client.

Rooms pin one successful Fortress War project build and revision. Both clients and observers load that build, even if the project is edited later. The authoritative rules are in `Tools/fortress-engine.cjs` and `Tools/fortress-multiplayer.cjs`; customized online rules need corresponding server changes, not only edits to a project's visual GDScript. This browser/Forge Game workflow is the supported network client; standalone native projects retain offline AI/hotseat play.

Choose Classic or BLUE3, a map, AI or same-device two-player control, team size, tanks, AI difficulty and angle reference. Enter starts a match. Classic supports 1/2/4 tanks per team; BLUE3 uses 4 per team.

| Input | Action |
| --- | --- |
| A/D or Left/Right | Move within the current tank's allowance |
| W/S or Up/Down | Change local barrel angle |
| Space held / released | Charge / fire |
| 1–4 | Select an unlocked weapon |
| Mouse/touch on battlefield | Aim at world position |
| Angle / power sliders | Set angle and target power |
| 발사 | Fire with the slider's target power |
| Item buttons | Repair, shield, double or teleport; one item per turn |
| P | Pause / resume |
| R on results | Restart with the same settings |

Screen buttons support touch. Losing application focus pauses the match and cancels charging. Settings and the last 20 completed results are stored in Godot `user://fortress-war-settings.json`; current battles are not saved. This is separate from the Web game's browser save keys.

## Editing

- `data/catalog.json`: complete original `FortData` values, including provenance and explicit simulation assumptions.
- `scripts/fort_engine.gd`: deterministic simulation, terrain, turns, weapons/items and AI.
- `scripts/fort_remote.gd`: server-state projection, RLE terrain sync, ownership checks and action commands for online play.
- `scripts/battle_view.gd` and `materials/terrain.gdshader`: procedural terrain/tank/projectile rendering.
- `fonts/fortress-ui.txt`: bundled OFL Korean font subset, so Web builds do not depend on installed fonts; rebuild with `Tools/prepare-fortress-font.py` when adding characters.
- `scripts/main.gd`: Korean setup, input, HUD, results and local preferences.
- `scenes/main.tscn`: editable scene entry point.

The Godot presentation is newly implemented. The Web integration's eight-language selector, browser history UI and audio presentation are not ported into this Korean starter UI. Historical commercial-game equivalence is not claimed. See [source and design notes](../../References/FortressWar/PORT.md).

## Validation

From `forge`, run `npm run test:fortress-war` for isolated Godot import, deterministic simulation, actual input-path and Forge HTTP/template checks. Run `node --test Tests/fortress-war-parity.test.cjs` for source comparison. Set `PLAYFORGE_RUNTIME_TEMPLATE=fortress-war` and run `node --test Tests/game-template-runtime.test.cjs` for Godot Web export and headless Chrome play. Logs and captures are saved under `Saved/Tests/fortress-war` and `Saved/Tests/game-templates`.

`npm run test:fortress-multiplayer` checks the authoritative server, two real Godot Web clients and the shared multi-client workspace. It includes build pinning, out-of-turn/replayed input rejection, terrain synchronization, spectators, stale snapshots and disconnect/forfeit.

These automated checks do not establish player enjoyment or device performance. Current results are recorded in `VALIDATION.md` after execution.
