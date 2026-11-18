# PlayHub Platform (RobloxProjects)

Integration branch: PlayHub-Platform. Source import only; not a production-ready combined service.

- `apps/hub`: Hub and its existing administrator UI (Node 24+).
- `apps/forge`: Godot authoring server and disabled account/Drive implementation (Node 22+).
- `games`: WebGames catalog and selected game sources/assets.
- `tools/run`: Windows BAT preflight/launch entry points. Missing prerequisites fail closed.
- `tools/build`: independent **source ZIP** packaging, not complete runtime installers.
- `docs/migration`: source provenance, exclusions, verified results and remaining work.

Start by running `tools\run\Check_Components.bat`. Existing user databases, OAuth configuration, downloaded engines, dependencies and private project storage have not been copied. Do not point test instances at production data.

The browser editor requires the separately supplied Godot vendor bundle. Standalone Engine/Game deployment, unified sign-on, updater/rollback, worker/admin service extraction and full Hub/Forge runtime compatibility remain incomplete. Original worktrees and history are preserved. No remote push or public deployment was performed.
