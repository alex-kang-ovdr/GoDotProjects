# PlayHub Platform (RobloxProjects)

## Forge-AgentReplay 수동 실행

Windows에서 [Run_AgentReplay.cmd](Run_AgentReplay.cmd)를 더블클릭합니다. `1`은 웹 에디터를 열고, `2`·`3`·`4`는 각각 설치형 Godot에서 Tappy Chicken, Iron Wood, BrawlLabs의 새 시연 프로젝트를 엽니다. `5`는 에셋 스토어를 직접 사용해 볼 빈 맵을 엽니다.

웹에서는 템플릿과 **만드는 과정 보기**를 선택합니다. 설치형에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. 웹 서버는 콘솔에 로컬 주소를 표시하며 `Ctrl+C`로 종료할 수 있습니다.

웹 실행 메뉴 **1번**은 이 PC의 `http://127.0.0.1` 주소와 같은 Wi-Fi에서 사용할 **PlayForge Wi-Fi (HTTPS)** 주소를 콘솔에 표시합니다. 두 주소로 접속한 편집기는 같은 프로젝트를 봅니다. LAN 주소에서 Godot 웹 편집기를 실행하려면 접속 기기가 HTTPS 인증서를 신뢰해야 합니다. 자체 인증서를 쓰면 콘솔의 **LAN certificate** 경로에 공개 인증서가 표시됩니다. 신뢰하는 PEM 인증서와 키가 있다면 `PLAYFORGE_LAN_CERT`, `PLAYFORGE_LAN_KEY`로 지정할 수 있습니다. 자동 선택과 다른 어댑터를 쓰려면 `PLAYFORGE_LAN_IP`에 PC에 할당된 IPv4 주소를 지정합니다. `PLAYFORGE_LAN=0`은 Wi-Fi 링크를 끕니다.

**AI 애드온 비교**는 설치형 Godot에서 실행합니다. 런처에서 처음 선택하면 해당 배포본을 받아 체크섬을 확인하고 빈 비교 프로젝트에 설치·활성화합니다. 다음 실행은 같은 프로젝트를 엽니다. 활성 상태는 **프로젝트 → 프로젝트 설정 → 플러그인**에서 확인할 수 있습니다.

| 번호 | 애드온 | 첫 사용 |
| --- | --- | --- |
| **6** | Godot AI 4.3.1 | **Godot AI → Clients & Tools**에서 사용할 MCP 클라이언트를 설정하고, 그 클라이언트에서 “현재 씬 트리를 보여 줘”라고 요청합니다. [Godot AI 배포 페이지](https://store.godotengine.org/asset/dlight/godot-ai/) |
| **7** | GDMCP 1.1.0 | 하단 **GDMCP → Settings**에서 제공자·모델·API 키를 설정하고 **Chat**에서 요청합니다. **Bridge**에서 로컬 WebSocket 상태를 확인할 수 있습니다. [GDMCP 배포 페이지](https://godotengine.org/asset-library/asset/5403) |
| **8** | AI Assistant Hub 2.1.0 | 하단 **AI Hub → PlayForge Godot**에서 Ollama 채팅을 시작합니다. 등록된 유형이 없으면 **Ollama → 설치 모델 → New assistant type**에서 만들 수 있습니다. [AI Assistant Hub 배포 페이지](https://godotengine.org/asset-library/asset/3427) |

두 프로젝트에서 **프로젝트 → 도구 → PlayForge AI 채팅**도 열 수 있습니다. 같은 씬에서 외부 MCP 클라이언트, GDMCP 내장 채팅, PlayForge의 편집 기록·Undo·역할별 재생을 비교할 수 있습니다.

**Tappy Chicken을 처음부터 보려면** 런처에서 **2**를 누르고 Godot의 **프로젝트 → 도구 → PlayForge Showcase 재생**을 선택합니다. 새 프로젝트의 파일시스템에는 게임 에셋이 없고 씬에는 루트 하나만 있습니다. 에셋 역할이 **Tappy Chicken 원작 그래픽과 효과음** 팩을 가져옵니다. 그래픽 21개와 효과음 8개의 임포트 진행률을 확인한 뒤 레벨·GUI·스크립트·에셋 역할이 씬을 조립하고, 마지막에 조립한 씬으로 게임이 열립니다. 웹에서는 게임이 에디터의 **게임** 뷰에 열립니다.

기본 Godot **에셋 스토어(Asset Store)** 탭에서 직접 가져오려면 런처의 **5**로 빈 프로젝트를 열고 저장소 **PlayForge Local**을 선택합니다. 에디터가 오프라인이면 **온라인으로 전환**을 누릅니다. Tappy Chicken 팩을 열고 **다운로드 → 설치**를 선택하면 프로젝트의 `Assets/`에 그래픽, `Assets/Audio/`에 효과음이 생깁니다. 설치형 런처는 해당 편집기 세션 동안만 로컬 저장소를 실행하고 콘솔에 주소를 표시합니다. 기존 프로젝트의 **처음부터**는 가져온 파일과 사용자 수정을 보존합니다. 다시 에셋 0개에서 시작하려면 런처 **2**로 새 시연 프로젝트를 엽니다. [게임과 조작법](forge/Templates/tappy-chicken/README.md) · [원작 에셋 대응표](forge/References/TappyChicken/ASSET_PORT.md)

공식 웹 에디터에서는 시연 패널의 **에셋 스토어** 또는 **프로젝트 → 도구 → PlayForge 에셋 스토어**를 사용합니다. 로컬 웹 런처에서는 설치형과 같은 저장소의 ZIP을 받습니다.

AI 채팅은 **프로젝트 → 도구 → PlayForge AI 채팅**에서 엽니다. **설정**에서 계정을 연결하고 채팅 입력창 위에서 요청에 사용할 모델과 편집 방식을 고릅니다. 씬 노드를 문맥에 넣으려면 노드를 선택하고 **AI 채팅에 추가**를 누릅니다. 기본 **확인 후 편집** 모드에서는 적용할 노드와 속성값을 검토하고 **편집 적용**을 누를 수 있습니다. [AI 채팅·제작 시연 이관 명세](forge/Docs/AGENT_CHAT_REPLAY_HANDOFF.md)

웹에서는 **PlayForge AI Agent** 독이 열리면 iframe 안에서 채팅합니다. 설정은 **Clients / Tool / Skills / Setting** 탭으로 나뉩니다. 도구 설정은 다음 요청부터 모델에 제공하는 도구와 허용할 씬 작업에 반영됩니다. **9번** 또는 `Run_AgentReplay.cmd agent`는 같은 Agent 화면을 단독으로 엽니다. 단독 모드에서는 Godot을 실행하지 않고 계정 연결과 대화를 테스트할 수 있습니다. 씬 편집, 노드 문맥, 제작 시연은 프로젝트 안에서 사용합니다.

**1번**은 웹 편집기와 단독 Agent 탭을 같은 서버에서 열고 **8번의 AI Assistant Hub** 프로젝트도 설치형 Godot으로 시작합니다. Hub가 이미 열려 있으면 그 창을 사용합니다. 세 화면은 실행 중인 로컬 Ollama를 재사용합니다. Hub의 씬 작업은 설치형 Hub 프로젝트에 적용되고, 웹 씬 작업은 웹 편집기의 Agent 독에서 승인합니다.

Integration branch: PlayHub-Platform. Source import only; not a production-ready combined service.

- `apps/hub`: Hub and its existing administrator UI (Node 24+).
- `apps/forge`: Godot authoring server and disabled account/Drive implementation (Node 22+).
- `games`: WebGames catalog and selected game sources/assets.
- `tools/run`: Windows BAT preflight/launch entry points. Missing prerequisites fail closed.
- `tools/build`: independent **source ZIP** packaging, not complete runtime installers.
- `docs/migration`: source provenance, exclusions, verified results and remaining work.

Start by running `tools\run\Check_Components.bat`. Existing user databases, OAuth configuration, downloaded engines, dependencies and private project storage have not been copied. Do not point test instances at production data.

The browser editor requires the separately supplied Godot vendor bundle. Standalone Engine/Game deployment, unified sign-on, updater/rollback, worker/admin service extraction and full Hub/Forge runtime compatibility remain incomplete. Original worktrees and history are preserved. No remote push or public deployment was performed.
