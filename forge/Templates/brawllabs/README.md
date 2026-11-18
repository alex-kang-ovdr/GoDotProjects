# BrawlLabs

BrawlLabs is a small, self-contained Godot 4.7.2 top-down arena brawler. It adapts the Brawl Lab reference's readable combat loop into a native 2D starter: move into the center, aim and fire at other players and bots, pick up dropped gems, and hold a lead long enough to secure the match. Everything in this template is original procedural/vector art and local code; it downloads nothing.

## Run and controls

Open this folder in Godot and run `scenes/main.tscn`.

| Action | Input |
| --- | --- |
| Move | W/A/S/D |
| Aim | Mouse |
| Fire | Hold left mouse button |
| Super | E or right mouse button (charges by hitting enemies) |
| Gadget | Q (quick evade and regain one ammo) |
| Pause | P or Escape |
| Restart | R |

The first gem spawns at the center. Additional gems appear nearby during play, and a defeated brawler drops its carried gems. Your team wins by holding at least five gems and a lead for eight seconds. This shorter, deterministic objective supports a quick template play session. Choose a hero by changing `hero` in `scripts/main.gd` (`pin`, `brick`, or `comet`); allies and bots use the other archetypes.

## Scope compared with the reference

The reference's current Brawl Lab v4 documents seven competitive modes and a training mode, three heroes, combat, objectives, and local bots. This Godot starter implements one playable Gem Grab-inspired 3v3 slice: three hero stat profiles, one player with two friendly bots, three enemy bots, aiming, projectiles, ammo/reload, respawns, gem pickup/drop, a possession countdown, one super, and one gadget. It uses a simpler 5-gem / 8-second win rule to make the loop short and easy to extend.

It does not implement the six other modes, training range, the reference's full combat/bot/vision and statistics systems, touch controls, camera modes, menus, persistence, or original Brawl Stars characters/assets. This is a native starter based on the reference's documented interactions, not a claim of full reference-game parity.

## Guide and provenance

The scene is intentionally compact: `scenes/main.tscn` contains the root `Node2D` and a complete, editor-visible `Preview` group. That group has named floor, cover, objective, team-ring, hero, and label nodes that can be moved or replaced visually; the game hides this static preview when it starts and builds its live match. Most behavior and drawing is in `scripts/main.gd`, so a learner can trace the loop in one script. The four original SVGs in `assets/` were authored for this template and are the only entries in `metadata.json`'s `assetPaths`. The reference game and its archived sources remain unchanged in `../../References/Brawl Stars/`.

## Verification

Run the deterministic native input/physics smoke test from this project folder:

```powershell
& 'D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64.exe' --headless --path . --editor --quit
& 'D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64.exe' --headless --path . --script res://tests/brawllabs_smoke.gd
```

The native smoke test uses real movement/mouse input and physics-space projectile hits. It separately seeds lifecycle state to test player respawn, the gem hold countdown, and restart; this is not a full bot match balance test. Simulation updates run on physics ticks. Browser export/start and the mouse-centered editor walkthrough are validated by the platform tests.


## Server-authoritative 3 vs 3 multiplayer

In PlayForge, use the Godot editor's **Game** workspace or the platform Game/Test button. The native Game workspace opens `/OfficialGodot/multiplayer.html?project=<id>` with server/client tabs. Individual clients use `/OfficialGodot/brawllabs-lobby.html?project=<id>`. Share the room invite link, choose Blue or Red, and press Ready. Each team has three slots.

- At least two human players must be Ready and no active player may still be waiting. The room then starts a five-second countdown. Unready/team changes or departures that break the condition cancel it.
- A player waiting without Ready for more than 20 seconds becomes a spectator. Changing teams repeatedly does not reset that waiting period. Spectators can choose an available team again before the match starts.
- Empty slots are bots. During a match a disconnected player is replaced by a bot in the same slot, preserving position, health and carried gems. Late joiners initially spectate and may explicitly take over an available bot on either team after their pinned game build has loaded. The takeover preserves all actor state. Explicit socket closure is immediate; an unresponsive connection is detected by heartbeat.
- Node runs the authoritative simulation, bots and objective. Godot receives state and renders it; clients send bounded input rather than positions or damage. There is no browser-host dependency. Rooms are scoped to this running server and are not persisted across a server restart.
- The game loads before entering the lobby, so asset loading does not consume the 20-second waiting period. The room pins a successful build and revision; all late participants use that exact build even if the source project has since changed. `로비 나가기` leaves the room; a new room is used for the next match.

The standalone native/offline run remains a development smoke harness. PlayForge service entry points use the multiplayer lobby. The networked game currently covers the one Gem Grab-style mode described above.

Validation: `npm run test:brawllabs-multiplayer` checks server timing/team/bot rules and two actual Godot Web game clients. One client's input appears in the other client's shared state, and closing that client replaces its actor with a bot. Six-human occupancy is tested at the room-model level, not with six browser instances. Evidence: `Saved/Tests/brawllabs-multiplayer/`.

## Godot 2D 제작 시연

PlayForge 웹에서 **BrawlLabs → 만드는 과정 보기**를 선택합니다. 설치형 Godot용 시연은 Forge 폴더에서 `node Tools/prepare-template-showcase.cjs brawllabs D:/Demos/BrawlLabsShowcase`로 생성합니다. 생성한 프로젝트에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다.

빈 2D 씬에 원본 전장 바닥과 엄폐물, 중앙 보석, 두 팀의 시작 위치와 캐릭터 이미지, 팀 표식을 차례대로 추가합니다. 보석 위치와 제목, 조작 안내 등 원본 속성이 실제 씬 트리와 2D 뷰포트에 반영됩니다. 씬이 갖춰진 뒤 원본 게임 스크립트를 연결합니다. 실제 경기와 3 대 3 로비는 **완성된 템플릿 열기**에서 시작합니다.
