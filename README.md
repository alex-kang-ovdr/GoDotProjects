# PlayHub Platform (RobloxProjects)

Integration branch: PlayHub-Platform. Local service integration; not a production-ready combined service.

- `hub`: Hub and its separate administrator UI (Node 24+).
- `forge`: Godot authoring server and account/Drive implementation, disabled until privately configured (Node 22+).
- `games`: WebGames catalog and selected game sources/assets.
- `tools`: Windows launchers for Engine, Forge, Game and Hub.
- `tools/build`: independent **source ZIP** packaging, not complete runtime installers.
- `docs/migration`: source provenance, exclusions, verified results and remaining work.
- `docs/architecture`: integration decisions, including the [Hub–Forge single-domain plan](docs/architecture/hub-forge-integration.md).

Run `tools\Run_Engine.bat`, `tools\Run_Forge.bat`, `tools\Run_Games.bat`, or `tools\Run_Hub.bat` to launch a component manually. Append `--check` to verify local prerequisites. For the Tappy Chicken creation demo, pass `showcase` to the Engine or Forge launcher. See the [launcher guide](tools/README.md) for configuration and port overrides.

On Windows, `Run_PlayHub_Portable.cmd` starts Hub from the existing `hub/dist` output and proxies the local Forge process (`127.0.0.1:4177`, or an already-active `4173`/`4177` instance) under the same-origin path `/forge/OfficialGodot/` (for example `http://localhost:<userPort>/forge/OfficialGodot/`). When Google OAuth or `forge.enabled` is configured, Forge verifies sessions against Hub's loopback `/internal/session/verify` endpoint. Use `-Check` to verify prerequisites and `-NoBrowser` to skip opening the Hub. Service logs are in `artifacts/local-runtime/platform-logs/`.

Google login, Hub-owned project APIs and creator metadata review are integrated locally. See [account setup and verification limits](docs/GOOGLE_ACCOUNT_DRIVE_SETUP.md) and [site plan implementation scope](docs/FRONTEND_SITE_PLAN.md). User routes include `/?view=browse`, `/?view=wishlist`, `/?view=account` and `/?view=create`. Metadata approval does not publish a game.

The browser editor requires the separately supplied Godot vendor bundle. Local single-domain Hub–Forge proxying and Hub-session authentication are implemented (see [Hub–Forge integration decision](docs/architecture/hub-forge-integration.md)); real Google OAuth/Drive credentials, standalone Engine/Game deployment, updater/rollback, worker/admin service extraction and public deployment remain outside this checkout. The PlayHub-Platform checkout holds the current game integrations, and the Windows launcher serves the existing `hub/dist` output. The superseded GamePlayHub checkout was archived and removed from Git's worktree list. Its previous launcher forwards to the current entry point, and existing private profiles remain available. Public deployment is outside this migration.
