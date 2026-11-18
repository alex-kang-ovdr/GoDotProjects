# Fortress War: Godot port reference

Investigated/updated: 2026-11-18 (Asia/Seoul). Source platform: local Canvas 2D prototype, source bundle 1.2.0, PlayHub integration 1.4.0. Target: native Godot 4.7.2 and Godot Web export, Forge template `fortress-war`.

## Evidence and boundaries

Directly inspected local sources: `games/fortress-blue/Source/Project/dist/engine.js`, `data.js`, `IMPLEMENTATION_CONTRACT.md`, `docs/DATA_PROVENANCE_KO.md`, plus `games/fortress-blue/README.md`. The source game remains under the stable `fortress-blue` Hub ID. The new Forge template ID is separate.

The supplied catalog cites [classic tank documentation](https://www.4gamer.net/specials/fortress2/05.html), [later tank documentation](https://www.4gamer.net/specials/fortress2/06.html), [delay documentation](https://www.4gamer.net/specials/fortress2/12.html), and [BLUE3 guide](https://sites.google.com/view/fortress3blueguide/3blue). These URLs are preserved source metadata, not newly browsed or independently verified evidence in this port. All 61 source snapshots, unknown/null values, conflict notes and source-vs-simulation classifications are retained in `data/catalog.json`.

## Observed source structure

The source implements 13 Classic tanks and four BLUE3 characters, three original terrain layouts, angle/power/facing controls, a per-pixel destructible world, wind-sensitive ballistics, delay-based turn ordering, round/sudden-death limits, items, AI and same-device play. Source coefficients such as gravity 320, wind acceleration 9 and maximum launch speed 1050 are prototype tuning; they are not verified commercial-client constants.

Strengths observed in code: rules are separate from rendering, seeded simulation is testable, weapon/support attribution and data provenance are explicit. Porting risks: null-as-zero conversion, frame-dependent charging/AI, pixel collision tunneling, slope-relative aim, and a late Space release firing for the next actor. The native tests target these boundaries where applicable.

## Godot adaptation

Native GDScript owns match state and simulation. A mask texture and canvas shader show craters; procedural silhouettes and trails replace Canvas rendering. The setup/HUD exposes profile, team, map, tank, difficulty, angle reference, action and match outcome. Input guards cancel charge on pause, settings, focus loss and actor changes. This presentation is an implementation choice, not original-game evidence.

Online play reuses BrawlLabs' Forge room/build/lobby/workspace pattern. The bundled original JS rules run on the Node server; the Godot remote adapter renders authoritative snapshots and sends constrained actions. Two clients own opposing teams, with late spectator access. Terrain is transmitted as versioned RLE runs; new observers receive the current terrain. Match/build pinning and turn/sequence checks prevent clients from applying a second shot or controlling the opponent. Disconnect is a forfeit. This is an adaptation for this project, not a claim about the commercial game's networking.

No commercial-game textures, sprites or audio were copied. The template uses new procedural visuals and the repository's existing code/data. Korean text uses a subset of [Nanum Gothic from Google Fonts](https://github.com/google/fonts/tree/main/ofl/nanumgothic), licensed under SIL OFL 1.1. The subset is renamed **Fortress UI**, retains copyright/license metadata, and ships with `fonts/OFL.txt`. The base64 text representation fits Forge's existing text-file catalog and requires no runtime download. `Tools/prepare-fortress-font.py` rebuilds it from the upstream font when UI/data text changes.

Repository code is under the root MIT license, included in the template as `LICENSE.txt`; the font has its separate OFL terms. Historical data/source references retain their existing attribution; the port grants no additional rights to commercial brands or outside source material. Referencing a source is not permission to redistribute its assets.

Implementation and executable verification are tracked in [template validation](../../Templates/fortress-war/VALIDATION.md). Automated behavior and browser rendering must be distinguished from human playtesting, balance approval, eight-language presentation, and low-end device performance, which have not been established by this task.
