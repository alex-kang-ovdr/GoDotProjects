# PlayHub Platform (RobloxProjects)

## Forge-AgentReplay 수동 실행

Windows에서 [Run_AgentReplay.cmd](Run_AgentReplay.cmd)를 더블클릭합니다. `1`은 웹 에디터를 열고, `2`·`3`·`4`는 각각 설치형 Godot에서 Tappy Chicken, Iron Wood, BrawlLabs의 새 시연 프로젝트를 엽니다. `5`는 에셋 스토어를 직접 사용해 볼 빈 맵을 엽니다.

웹에서는 템플릿과 **만드는 과정 보기**를 선택합니다. 설치형에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. 웹 서버는 콘솔에 로컬 주소를 표시하며 `Ctrl+C`로 종료할 수 있습니다.

**AI 애드온 비교**는 설치형 Godot에서 실행합니다. 런처에서 처음 선택하면 해당 배포본을 받아 체크섬을 확인하고 빈 비교 프로젝트에 설치·활성화합니다. 다음 실행은 같은 프로젝트를 엽니다. 활성 상태는 **프로젝트 → 프로젝트 설정 → 플러그인**에서 확인할 수 있습니다.

| 번호 | 애드온 | 첫 사용 |
| --- | --- | --- |
| **6** | Godot AI 4.3.1 | **Godot AI → Clients & Tools**에서 사용할 MCP 클라이언트를 설정하고, 그 클라이언트에서 “현재 씬 트리를 보여 줘”라고 요청합니다. [Godot AI 배포 페이지](https://store.godotengine.org/asset/dlight/godot-ai/) |
| **7** | GDMCP 1.1.0 | 하단 **GDMCP → Settings**에서 제공자·모델·API 키를 설정하고 **Chat**에서 요청합니다. **Bridge**에서 로컬 WebSocket 상태를 확인할 수 있습니다. [GDMCP 배포 페이지](https://godotengine.org/asset-library/asset/5403) |

두 프로젝트에서 **프로젝트 → 도구 → PlayForge AI 채팅**도 열 수 있습니다. 같은 씬에서 외부 MCP 클라이언트, GDMCP 내장 채팅, PlayForge의 편집 기록·Undo·역할별 재생을 비교할 수 있습니다.

**Tappy Chicken을 처음부터 보려면** 런처에서 **2**를 누르고 Godot의 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. 새 프로젝트의 파일시스템에는 게임 에셋이 없고 씬에는 루트 하나만 있습니다. 에셋 역할이 **Tappy Chicken 원작 그래픽과 효과음** 팩을 가져옵니다. 그래픽 21개와 효과음 8개의 임포트 진행률을 확인한 뒤 레벨·GUI·스크립트·에셋 역할이 씬을 조립하고, 마지막에 조립한 씬으로 게임이 열립니다. 웹에서는 게임이 에디터의 **게임** 뷰에 열립니다.

기본 Godot **에셋 스토어(Asset Store)** 탭에서 직접 가져오려면 런처의 **5**로 빈 프로젝트를 열고 저장소 **PlayForge Local**을 선택합니다. 에디터가 오프라인이면 **온라인으로 전환**을 누릅니다. Tappy Chicken 팩을 열고 **다운로드 → 설치**를 선택하면 프로젝트의 `Assets/`에 그래픽, `Assets/Audio/`에 효과음이 생깁니다. 설치형 런처는 해당 편집기 세션 동안만 로컬 저장소를 실행하고 콘솔에 주소를 표시합니다. 기존 프로젝트의 **처음부터**는 가져온 파일과 사용자 수정을 보존합니다. 다시 에셋 0개에서 시작하려면 런처 **2**로 새 시연 프로젝트를 엽니다. [게임과 조작법](forge/Templates/tappy-chicken/README.md) · [원작 에셋 대응표](forge/References/TappyChicken/ASSET_PORT.md)

공식 웹 에디터에서는 시연 패널의 **에셋 스토어** 또는 **프로젝트 → 도구 → PlayForge 에셋 스토어**를 사용합니다. 로컬 웹 런처에서는 설치형과 같은 저장소의 ZIP을 받습니다.

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
