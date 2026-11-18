# PlayHub Platform (RobloxProjects)

## Forge-AgentReplay 수동 실행

Windows에서 [Run_AgentReplay.cmd](Run_AgentReplay.cmd)를 더블클릭합니다. `1`은 웹 에디터를 열고, `2`·`3`·`4`는 각각 설치형 Godot에서 Tappy Chicken, Iron Wood, BrawlLabs의 새 시연 프로젝트를 엽니다.

웹에서는 템플릿과 **만드는 과정 보기**를 선택합니다. 설치형에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. 웹 서버는 콘솔에 로컬 주소를 표시하며 `Ctrl+C`로 종료할 수 있습니다.

AI 채팅은 **프로젝트 → 도구 → PlayForge AI 채팅**에서 엽니다. 모델 연결, MCP 녹화, 역할 추적과 되감기 절차는 [AI 채팅·제작 시연 이관 명세](forge/Docs/AGENT_CHAT_REPLAY_HANDOFF.md)에 정리했습니다.

Integration branch: PlayHub-Platform. Source import only; not a production-ready combined service.

- `apps/hub`: Hub and its existing administrator UI (Node 24+).
- `apps/forge`: Godot authoring server and disabled account/Drive implementation (Node 22+).
- `games`: WebGames catalog and selected game sources/assets.
- `tools/run`: Windows BAT preflight/launch entry points. Missing prerequisites fail closed.
- `tools/build`: independent **source ZIP** packaging, not complete runtime installers.
- `docs/migration`: source provenance, exclusions, verified results and remaining work.

Start by running `tools\run\Check_Components.bat`. Existing user databases, OAuth configuration, downloaded engines, dependencies and private project storage have not been copied. Do not point test instances at production data.

The browser editor requires the separately supplied Godot vendor bundle. Standalone Engine/Game deployment, unified sign-on, updater/rollback, worker/admin service extraction and full Hub/Forge runtime compatibility remain incomplete. Original worktrees and history are preserved. No remote push or public deployment was performed.
