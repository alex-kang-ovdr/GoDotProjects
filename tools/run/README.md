# Independent local source launchers

These BAT files are source-development launchers, not finished installers. They never download dependencies, kill existing processes, change a firewall, open a public listener, or create login secrets.

- Run_Hub.bat: Node 24+, apps/hub/server/index.mjs and operator-created config/local.json (or PLAYHUB_CONFIG absolute path). Both publicHost/adminHost MUST explicitly be loopback; ports must differ; dataDir must be absolute/private. The example config is not automatically used.
- Run_Forge.bat: Node 22+, installed package dependencies, explicit GODOT_BIN and separately provisioned OfficialGodot/vendor browser engine. HOST is forced to 127.0.0.1. Missing engines fail preflight instead of pretending the editor works.
- Run_Game.bat: choose PLAYHUB_GAME_DIR relative to games (folder containing index.html). Uses a read-only loopback server, port PLAYHUB_GAME_PORT or 4180. No directory listings/writes. Root games index is used only if present. Individual games may still have path/asset dependencies needing repair.
- Run_Engine.bat: GODOT_BIN absolute path, or engine/godot/Godot.exe. Opens the project manager only. The source archive contains no engine binary.

Run Check_Components.bat for a fail-safe inventory. The selected node executable must be on PATH; no bundled runtime is assumed. Node 22 cannot launch Hub. Existing app path repair and full independent operation are NOT certified by these launchers. Readiness checks are prerequisite checks, not execution/build certification.
