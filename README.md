# PlayHub Platform (RobloxProjects)

Integration branch: PlayHub-Platform. Local service integration; not a production-ready combined service.

- `hub`: Hub and its separate administrator UI (Node 24+).
- `forge`: Godot authoring server and account/Drive implementation, disabled until privately configured (Node 22+).
- `games`: WebGames catalog and selected game sources/assets.
- `tools`: Windows launchers for Engine, Forge, Game and Hub.
- `tools/build`: independent **source ZIP** packaging, not complete runtime installers.
- `docs/migration`: source provenance, exclusions, verified results and remaining work.

Run `tools\Run_Engine.bat`, `tools\Run_Forge.bat`, `tools\Run_Games.bat`, or `tools\Run_Hub.bat` to launch a component manually. Append `--check` to verify local prerequisites. For the Tappy Chicken creation demo, pass `showcase` to the Engine or Forge launcher. See the [launcher guide](tools/README.md) for configuration and port overrides.

On Windows, `Run_PlayHub_Portable.cmd` starts Hub from the existing `hub/dist` output and connects the local Forge editor at `http://localhost:4173/OfficialGodot/`. If Forge is already running on port 4177, the launcher redirects port 4173 to it. Use `-Check` to verify prerequisites and `-NoBrowser` to skip opening the Hub. Service logs are in `artifacts/local-runtime/platform-logs/`.

Google login, Hub-owned project APIs and creator metadata review are integrated locally. See [account setup and verification limits](docs/GOOGLE_ACCOUNT_DRIVE_SETUP.md) and [site plan implementation scope](docs/FRONTEND_SITE_PLAN.md). User routes include `/?view=browse`, `/?view=wishlist`, `/?view=account` and `/?view=create`. Metadata approval does not publish a game.

The browser editor requires the separately supplied Godot vendor bundle. Standalone Engine/Game deployment, full editor single sign-on, updater/rollback, worker/admin service extraction and full Hub/Forge runtime compatibility remain incomplete. Original worktrees and history are preserved. No remote push or public deployment was performed.
