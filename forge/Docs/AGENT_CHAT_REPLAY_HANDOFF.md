# AI 채팅과 제작 시연 이관 명세

갱신일 2026-11-18 · 대상 브랜치 `Forge-AgentReplay` · 기준 엔진 Godot 4.7.2

## 사용자 진입점

루트의 `Run_AgentReplay.cmd`를 실행한다. 웹에서는 템플릿에서 **만드는 과정 보기**, Windows 에디터에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**으로 시연을 연다. **작업 로그**는 표시할 역할을 고른다. **화면 추적**은 편집 화면을 움직일 한 역할을 고른다. 한쪽 선택이 다른 쪽 설정이나 작업 진행 속도를 바꾸지 않는다.

| 사용자 동작 | 보이는 결과 |
| --- | --- |
| 자유 보기 | 모든 역할 커서가 원래 밝기로 보인다. |
| 레벨 또는 GUI 추적 | 해당 역할이 고른 씬 노드와 2D 또는 3D 편집 화면이 보인다. 속성 편집 단계에서는 인스펙터 탭을 표시하고 해당 속성 행을 따라간다. |
| 스크립트 추적 | 원본 GDScript 파일을 선택하고, 해당 ScriptEditor의 코드 영역에서 빈 화면과 전체 코드 붙여넣기를 차례로 보여 준다. 사용자 편집 버퍼 보호를 위해 읽기 전용 CodeEdit에서 시연한다. |
| 에셋 추적 | 원본 씬이 참조하는 텍스처·메시·머티리얼을 선택한다. 파일 리소스는 파일시스템 탭을 표시해 선택하고, 씬 내부 리소스는 인스펙터에서 연다. 임포트가 끝나면 가져온 첫 텍스처를 선택한다. |
| 시간 이동 또는 처음부터 | 해당 시각까지의 작업, 로그, 역할별 커서 문구를 다시 계산한다. 같은 시각의 명령은 기록 순서를 따른다. |
| AI 채팅 → 리플레이 재생 | 첫 편집 직전 씬 복사본을 별도 탭에서 열고 채팅 작업 및 Undo·Redo를 재현한다. |

로그 한 줄은 시각, 역할 이름, 커서에 사용한 원문으로 구성한다. 모든 역할 커서는 불투명하게 표시한다. 화면 추적 역할의 커서와 배지만 1.5배로 키운다. 각 역할의 마지막 작업 이후 실제 시간으로 5초가 지나면 Idle이 되어 커서 설명과 대상 강조를 숨긴다. 로그는 그대로 남는다. 역할을 추적하는 동안 그 단계에 필요한 독과 탭을 표시한다. 자유 보기에서는 사용자가 화면 배치를 제어한다.

주인공 커서는 노드 추가 직전의 툴바 버튼, 선택한 씬 트리 행, 속성 행, 파일 항목 또는 스크립트 캐럿의 실제 사각형을 강조한다. 독을 옮기거나 크기를 바꾸면 대상 위젯의 좌표를 다시 읽는다. 설치형에서 독을 별도 창으로 분리하면 해당 창에 커서와 강조를 그린다. 좌표를 얻을 수 없는 동안에도 명령 실행과 기록은 계속된다. 작업 결과 표에는 실제 노드 유형, 적용한 속성값, 열린 리소스 또는 붙여넣은 줄 수를 표시한다.

### 빈 맵에서 에셋 스토어 사용

설치형 런처는 루프백 포트에서 `/api/asset-library`를 제공하고 기본 Godot 에셋 스토어에 **PlayForge Local**을 등록한다. 로컬 웹 편집기는 같은 출처의 저장소를 사용한다. 기본 탭에서는 팩을 찾아 다운로드하고 설치할 수 있다. 시연과 MCP의 가져오기 명령은 같은 저장소의 ZIP에서 파일을 읽고, 수동 설치가 끝난 파일이나 협업자가 수정한 원본은 보존한다. 로컬 서버 없이 따로 준비한 프로젝트는 번들 카탈로그를 사용한다. `tappy-original`은 원작 그래픽과 효과음 전체, `tappy-flight`는 기존 비행 프레임 팩이다.

수동·MCP로 팩을 가져오면 새로 만든 파일만 현재 씬의 Undo 이력 한 건에 포함한다. Undo는 원본 SVG, 오디오 리소스, SVG의 `.import` 설정 중 바이트가 작업 직후와 같은 파일을 제거한다. Redo는 같은 소스와 설정을 복원한다. 사용자가 수정했거나 다른 작업이 같은 경로에 만든 파일은 보존하고 결과에 표시한다. 가져오기 전부터 있던 파일만 재임포트한 경우에는 새 Undo 항목이 생기지 않는다. 스토어 열기·닫기와 상품 선택은 보는 화면만 바꾼다.

### Tappy Chicken의 원작 에셋 임포트

새 시연 프로젝트는 `ForgeReplay` 루트 하나와 빈 게임 에셋 목록으로 시작한다. 그래픽 21개와 효과음 8개, 원본 씬 및 그 스크립트는 초기 Godot 리소스 스캔에서 제외한다. 에셋 역할은 스토어에서 전체 팩을 가져오고, Godot이 확인한 텍스처와 오디오 개수만 진행률에 반영한다. 임포트가 끝나면 원본 씬을 읽고 역할별로 노드와 속성을 재현한다.

자연 재생이 끝나면 현재 편집 중인 씬을 `PackedScene`으로 묶어 설치형은 별도 Godot 프로세스, 웹은 게임 뷰의 iframe에서 실행한다. 시간 탐색과 히스토리 Redo는 게임을 자동 실행하지 않는다. Undo는 이전 단계에 남는 노드 인스턴스를 유지하고, 되감은 단계에서 사라질 노드만 제거한다. **처음부터**는 기존 임포트와 사용자 파일을 유지한다. 에셋이 없는 프로젝트에서 다시 시연하려면 런처에서 새 프로젝트를 연다. [원작 에셋과 변환 명세](../References/TappyChicken/ASSET_PORT.md)

## 구성과 배포

| 위치 | 인수할 책임 |
| --- | --- |
| `Godot/addons/playforge_agent_chat/chat_panel.gd`, `plugin.gd` | 대화, 현재 씬·선택 노드 문맥, 모델 응답, 명령 수락, 작업 기록, 재생 탭 열기 |
| `Tools/agent-chat-extension/chat_dock.c`, `build.ps1` | Windows x86-64 단정도 ABI의 `PlayForgeAgentChatDock` 등록 및 대화 이력 관리. 빌드 시 지정한 Godot 실행 파일에서 ABI 헤더를 직접 추출한다. |
| `Godot/addons/playforge_agent_chat/scene_commands.gd` | AI와 MCP의 공용 편집 명령 해석, 타입 검사, Godot Undo와 별도 탭에서의 순방향·역방향 재생 |
| `Godot/addons/playforge_replay/` | 역할별 로그, 독, 커서, 시각별 상태, 원본 템플릿 재구성, 주인공 역할의 에디터 포커스 |
| `Tools/record-agent-mcp.cjs` | 기존 stdio MCP 서버 앞에서 요청과 성공 응답을 대응시켜 JSONL 녹화 생성 |
| `Tools/agent-chat-provider.cjs`, `server.cjs` | 설치형·로컬 웹 편집기의 공급자 연결과 모델 호출 |
| `OfficialGodot/agent.html`, `agent.js`, `agent.css` | 독 안의 웹 채팅 화면, 단독 채팅, 공급자 연결과 Clients / Tool / Skills / Setting |
| `Godot/addons/playforge_agent_chat/chat_web_dock.gd` | 도크 좌표와 채팅 상태 반영, iframe 요청을 같은 씬 편집·Undo 흐름으로 전달 |
| `OfficialGodot/editor-bridge.js`, `guided.js` | 웹 가상 프로젝트에 확장을 주입하고 iframe 바깥의 협업 커서를 같은 좌표와 밝기로 표시 |
| `Tools/prepare-template-showcase.cjs` | 설치형 프로젝트에 에디터 플러그인과 Windows DLL 준비 |

Windows에서는 함께 배포하는 GDExtension DLL과 Godot 독을 쓴다. 공식 웹 에디터에서는 같은 출처의 Agent iframe이 실제 독 영역을 채우며, 전용 메시지 채널을 통해 GDScript가 관리하는 대화와 씬 상태를 표시한다. 변경 승인, 씬 편집, Undo와 시연 기록은 에디터에서 처리한다. `Run_AgentReplay.cmd agent`는 Godot 런타임 없이 같은 페이지를 열고 단독 대화를 브라우저에 저장한다.

새 Windows 프로젝트는 첫 임포트 전에 준비 도구가 `.godot/extension_list.cfg`에 DLL 확장 경로를 등록한다. 이 단계를 빼면 Godot 4.7.2의 첫 임포트가 Windows 접근 위반으로 끝나는 사례가 재현됐다. DLL을 다시 빌드할 때는 워크트리 루트에서 다음 명령을 사용한다.

```powershell
& ./forge/Tools/agent-chat-extension/build.ps1 -Godot 'D:/Github/GoDotProjects/Godot_v4.7.2-stable_win64_console.exe'
```

기존 대화창은 `D:/Git_OVDR/master-sandbox/Sandbox/Source/Sandbox/Private/Editor/AIAgent/`에서 객체 선택과 첨부를 처리하고, `Editor/SandboxWebView/`에서 AI 채팅 독을 연다. 대화 목록·검색, 입력·중단, 모델 설정, 이미지 첨부는 OVERDARE v0.14.2 배포본의 동작을 기준으로 확인했다. PlayForge는 에디터 테마를 따르는 Godot 독에서 같은 흐름을 제공한다.

### 대화와 씬 편집

- **새 대화**와 대화 선택 메뉴에서 작업을 나눈다. 제목과 본문을 검색하고 대화 이름을 바꾸거나 삭제할 수 있다. 완료한 메시지는 프로젝트별 로컬 저장소에 남는다. 웹에서는 같은 브라우저 프로필과 주소에서 복원한다. 전송하지 않은 초안은 현재 편집기 세션에 유지한다.
- **AI 채팅에 추가**로 선택한 노드를 첨부한다. 첨부는 전송 전에 개별로 뺄 수 있다. 씬 경로와 첨부한 노드의 상대 경로·유형을 공급자에 전달한다. ChatGPT Connect에서는 직접 고른 PNG·JPEG·WebP를 파일당 512 KiB, 최대 2개까지 첨부할 수 있다.
- **확인 후 편집**은 적용·거절을 기다린다. **계획만**은 첨부한 씬 문맥을 바탕으로 계획을 답하며, **바로 편집**은 유효한 제안을 즉시 적용한다. 적용 전 현재 씬과 편집 이력을 다시 확인한다. 실제 변경은 기존 MCP 기록과 Undo·Redo에 포함된다.
- 여러 줄을 작성할 수 있다. Enter는 전송, Shift+Enter는 줄바꿈이다. **중지**는 진행 중 요청을 취소한다. 다음 요청을 작성한 뒤 Ctrl+Enter 또는 Command+Enter를 누르면 진행 중인 요청을 중지하고 새 요청을 보낸다.

## 모델과 계정 연결

Sandbox의 C++ 연결부와 로그인 GUI, 저장·재연결 흐름은 [Sandbox AI 채팅 인증 및 GUI 참고 스펙](SANDBOX_AI_CHAT_AUTH_REFERENCE.md)에 기록했다.

**PlayForge AI 채팅 → 설정**에서 공급자를 선택한다. ChatGPT Connect는 공식 Codex CLI가 제공하는 브라우저 로그인 링크를 열고, 에디터가 인증 결과를 확인하면 대화할 수 있다. Claude Console, OpenAI API, Gemini 및 z.ai Coding Plan은 마스킹된 키 입력을 제공한다. 연결 후 모델 목록에서 선택하거나 모델 이름을 입력해 적용한다. API 키는 로컬 중계 프로세스의 메모리에 두고 ChatGPT 로그인은 전용 Codex 프로필에 보관한다. z.ai는 첫 채팅 요청에서 실제 인증 결과를 확인한다. 원본 OVERDARE 배포본 v0.14.2의 계정 연결 화면을 기준으로 공급자를 대조했다. [Codex App Server](https://developers.openai.com/codex/app-server/)

도구 호출을 지원하는 Ollama 모델을 실행한 뒤 `ollama list`에서 설치 이름을 확인한다. PowerShell에서 `$env:PLAYFORGE_AGENT_MODEL = '<설치한 모델 이름>'`을 설정한 뒤 같은 셸에서 런처를 시작한다. 기본 주소는 `http://127.0.0.1:11434/api/chat`이다. 다른 로컬 주소는 `PLAYFORGE_OLLAMA_URL`로 지정한다. 런처로 연 설치형과 로컬 웹은 `POST /api/agent-chat`을 사용한다. 독립 실행한 설치형에서는 환경 변수로 지정한 Ollama를 직접 호출할 수 있다. 이 웹 경로는 루프백의 로컬 운영용이다. 클라우드에서 여러 사용자가 모델을 공유하려면 사용자 인증, 권한 및 사용량 제한을 갖춘 중계 경로가 별도 이관 과제다.

모델에는 씬 경로와 루트 유형, 채팅에 추가한 노드의 상대 경로와 유형, 최근 대화 최대 12회가 전달된다. 설정에서 공급자를 연결한 뒤 요청별 모델을 고를 수 있다. ChatGPT Connect는 모델이 제공하는 추론 강도와 빠른 응답을 지원하고, 생성 중인 답변을 문장 조각이 도착할 때마다 표시한다. 편집 제안은 응답이 완료된 뒤 승인 대상을 표시한다. 모델 서비스가 없어도 편집 모드에서 아래 MCP 호출을 채팅창에 입력해 편집과 녹화를 사용할 수 있다. [Ollama Chat API](https://docs.ollama.com/api/chat)

## 공용 편집 명령과 외부 녹화

다음은 레이블을 추가하고 글자를 채우는 하나의 작업이다. 실제 Godot에서 두 단계가 실행되고 한 번의 Undo로 묶인다.

```json
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"pf_workspace_apply","arguments":{"idempotencyKey":"hud-title-1","operations":[{"kind":"node.add","objectId":"Title","type":"Label","role":"gui","description":"제목 레이블을 추가합니다"},{"kind":"property.set","objectId":"Title","propertyId":"text","value":"시작","role":"gui","description":"제목을 시작으로 바꿉니다"}]}}}
```

- `objectId`는 현재 씬 루트 기준 경로다. 루트 자체는 `.`이다. 역할은 `gui`, `level`, `script`, `assets` 중 하나다.
- `node.add`는 부모가 존재해야 한다. `property.set`은 대상 속성의 Godot 유형에 맞춰 JSON 벡터 배열, HTML 색상, 실수, 문자열, 불리언을 해석한다. 타입·속성 허용 목록은 `scene_commands.gd`의 `TYPES`, `PROPERTIES`가 기준이다.
- 전체 묶음을 먼저 검사한다. 실패한 묶음과 `dryRun`은 원본 씬과 시연 이력에 영향을 주지 않는다. 멱등 키는 열린 씬 세션 안에서 중복 적용을 방지한다. 외부 컴포넌트 ID나 속성 리비전을 쓰는 도구는 씬 경로·속성으로 해결하는 어댑터가 필요하다.
- 자유로운 스크립트 파일 쓰기, 파일 삭제, 외부 MCP 도구 전체의 자동 번역은 지원 범위 밖이다. 세 기본 템플릿의 스크립트 붙여넣기는 각 템플릿의 원본 GDScript를 참조한다.

기존 MCP 클라이언트의 stdio 실행 명령을 다음처럼 감싼다. 서버 자체의 인자는 실행 파일 뒤에 그대로 둔다. `세션.jsonl`에는 성공 응답을 받은 `pf_workspace_apply`가 승인 응답 순서대로 남는다. 통신 오류와 도구 오류, dry run, 같은 멱등 키 재시도는 빠진다. 다른 도구가 씬을 수정한 세션은 해당 변경을 포함하도록 어댑터를 확장해야 한다. [MCP 도구 호출 형식](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)

동시에 실행한 호출의 응답 순서와 실제 커밋 순서가 다를 수 있다. 서버가 성공 결과의 `structuredContent.revision`에 워크스페이스 리비전을 넣으면 녹화기가 이를 보존하고 가져오기에서 리비전 순서로 재생한다. 리비전이 일부 누락되거나 중복되면 원본 씬에 손대기 전에 오류를 표시한다. 리비전을 제공하지 않는 서버에서는 응답 순서가 실행 순서인 호출을 녹화한다. 한 파일에는 한 워크스페이스의 작업을 담는다.

```powershell
node forge/Tools/record-agent-mcp.cjs 세션.jsonl -- <MCP서버실행파일> <서버인자>
```

외부 녹화에는 프로젝트 에셋이나 시작 씬이 들어 있지 않다. 같은 에셋과 **명령 실행 전 씬**을 연 뒤 **프로젝트 → 도구 → MCP 녹화로 제작 시연 열기**에서 파일을 선택한다. 먼저 복제본에서 전체 명령을 확인한 다음 독립된 시연 탭을 연다. 별도의 타임라인 작성 작업은 필요하지 않다. 가져오기는 파일당 4 MB, 총 512개 편집, 한 호출당 256개 편집을 받는다.

### 에셋 스토어 MCP 호출

에디터의 AI 채팅 또는 `playforge_agent_chat` 플러그인의 `apply_call`로 다음 JSON을 보낸다. `packId`는 프로젝트의 스토어 카탈로그에 등록된 상품 ID를 사용한다. 예제의 `tappy-original`은 그래픽 21개와 효과음 8개를 포함한다.

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pf_asset_pack_import","arguments":{"packId":"tappy-original","operationId":"original-pack-1","dryRun":true}}}
```

`dryRun`을 켜면 `preview`와 파일 목록을 반환한다. 실제 가져오기는 `dryRun`을 끄고 같은 작업 ID를 보내면 된다. `queued`와 `importing`은 진행 중이며, 아래 상태 요청에서 `done`이 오면 `files`, `count`, `first`로 실제 임포트한 파일, 전체 개수, 새로 추가한 개수를 확인한다.

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pf_asset_pack_status","arguments":{"operationId":"original-pack-1"}}}
```

작업 ID에는 영문자, 숫자, 밑줄, 하이픈을 최대 128자까지 사용할 수 있다. 에디터가 열린 동안 같은 팩과 작업 ID로 재시도하면 기존 상태를 반환한다. `busy`는 대기열에 들어가지 않은 요청이므로 앞선 임포트가 끝나면 같은 작업 ID로 재시도할 수 있다. `error`로 끝난 가져오기를 원인 해결 후 다시 실행하려면 새 작업 ID를 사용한다.

이 도구는 스토어 버튼과 같은 임포터와 Godot 씬의 Undo·Redo 이력을 사용한다. 외부 stdio 녹화와 채팅의 별도 씬 리플레이에는 `pf_workspace_apply`의 씬 편집만 들어간다. 스토어 호출과 상태 조회는 현재 프로젝트의 파일을 대상으로 하므로 녹화된 씬을 열기 전에 그 프로젝트에서 필요한 팩을 가져온다.

## 상태와 되감기

기본 템플릿은 기존 v3 매니페스트와 보존된 원본 PackedScene을 사용한다. Tappy Chicken·BrawlLabs는 2D, Iron Wood는 3D다. 녹화 세션은 v4에서 `add`, `set`, `revert` 각각에 실제 노드 경로, 역할, 설명과 순서를 보존한다. 같은 속성을 여러 번 바꾸면 각 중간 값을 순서대로 재현한다. v4는 명령 순서를 보기 쉬운 0.8초 간격으로 재생한다.

| 템플릿 | 완료 시 루트 아래의 누적 노드 수 | 선택할 원본 스크립트 |
| --- | ---: | --- |
| Tappy Chicken | 26 | `res://Scripts/Main.gd` |
| Iron Wood | 13 | `res://scripts/iron_wood.gd` |
| BrawlLabs | 31 | `res://scripts/main.gd` |

Tappy Chicken은 빈 씬에서 스토어를 보여 주고 1.25초에 가져오기를 요청한다. 첫 노드를 추가하는 시각은 3.35초다. 9.5초에 스크립트를 열고 11.5초에 붙여넣으며 12.5초에 연결한다. Iron Wood와 BrawlLabs의 스크립트 단계는 각각 6.5초, 8.5초, 9.5초다.

원본 편집 이력은 Godot의 씬별 `EditorUndoRedoManager`가 소유한다. Undo 때는 해당 묶음을 역순으로 기록하고 Redo 때는 다시 정순으로 기록한다. Undo 뒤에 새 작업을 하면 Godot의 Redo 분기는 닫히고 녹화에는 실제 일어난 Undo와 새 작업이 모두 남는다. 채팅 녹화의 0초 기준은 **첫 편집 직전의 씬**이다.

기본 템플릿에서는 같은 시각에 실행된 편집을 한 Undo 단위로 묶는다. 커서 문구만 바뀐 시각에는 씬 편집 이력을 추가하지 않는다. 재생 중 에디터의 Undo·Redo를 실행하면 시계가 멈추고 씬과 패널을 같은 시각으로 복원한다. 사용자가 직접 시간을 건너뛰거나 다시 시작한 동작도 위치 이동 한 건으로 기록한다.

시작 스냅샷과 최근 기록은 프로젝트 경로별 `user://forge-agent-*/`에 저장한다. 다시 보기용 씬은 `res://.godot/playforge_agent_replays/`에 생성한다. 이 파일들은 공동 편집 프로젝트 파일에 포함하지 않는다. 녹화 사이에 사용자가 다른 수단으로 한 임의 편집은 채팅 기록에 들어가지 않는다.

## 커서 효과와 에디터 설정

시연의 설치형 오버레이와 웹 커서는 Godot이 보낸 같은 `effect` 상태를 사용한다. 각 역할은 현재 작업의 상태를 이름과 아이콘으로 표시한다. 상태 전환과 새 시연은 각각 효과를 다시 시작한다.

- `search`는 대상을 찾는 동안, `target`은 실제로 보이는 버튼·행·캐럿을 찾았을 때 표시한다. 추적 중인 대상이 가려지면 `hidden` 대기 표시만 남기고 대상 강조와 드래그·와이어 경로를 지운다.
- `execute`는 임포트가 접수된 순간이다. `progress`는 Godot이 확인한 파일 수를 기준으로 갱신한다. 분모를 확인할 수 없는 동안은 진행 상태만 표시한다. 실제 임포트 완료는 `success`, 오류는 사유를 붙인 `failure`로 표시한다.
- `change`는 현재 큐가 적용한 실제 속성값을 `이전 → 이후`로 표시한다. 노드 추가의 `success`는 실제 노드가 붙었을 때 표시한다. `undo`와 `redo`는 시연 이력의 방향과 팩 복원 결과를 표시한다.
- `drag`는 선언된 2D 위치 변경의 실제 노드 좌표 또는 컨트롤 두 곳의 좌표를 쓴다. `wire`는 GraphEdit의 실제 출력·입력 핀 위치를 따라간다. 드롭 검증이나 그래프 연결이 성공한 후에 완료 표시가 나온다. 시작점과 끝점이 보이는 동안만 경로를 그린다.

템플릿의 `gesture: "drag"`는 Node2D의 `position`을 바꾸는 큐에서 쓴다. 에디터 확장에서는 `playforge_showcase_player`의 `track_drag_gesture(role, origin, destination, verify_drop)` 또는 `track_wire_gesture(role, graph, origin, output, destination, input)`을 호출한다. 시연이 열려 있고 `role`이 등록되어 있어야 한다. `verify_drop`은 실제 편집 결과를 읽고 성공을 불리언으로 반환한다. 씬 속성·그래프 연결의 변경은 해당 편집 명령이 실행하며, 커서 효과는 그 결과를 관찰한다. Tappy Chicken 시연에서 와이어는 사용하지 않는다.

Godot **편집기 → 편집기 설정 → PlayForge → Showcase** 아래에서 다음 값을 바꿀 수 있다.

- `strength`는 효과 강도다. 기본값은 `0.65`이며 범위는 `0`–`1`이다.
- `duration_ms`는 기본 효과 길이로 `200` ms다. 범위는 `50`–`1000` ms다.
- `speed`는 애니메이션 재생 배율이다. 기본값은 `1`이며 범위는 `0.25`–`4`다.
- `reduce_motion`을 켜면 상태 이름과 아이콘을 유지하면서 움직임을 줄인다. 웹에서는 운영체제의 동작 줄이기 설정도 적용한다.
- `events`는 위 상태 ID를 키로 하는 딕셔너리다. 상태별 `icon`, `pulse`, `squash`, `shake`, `drag`, `wire`, `durationMs`, `speed`, `strength`를 조정할 수 있다. 생략한 값은 해당 상태와 전체 설정의 기본값을 쓴다.

Unreal 참고 구현의 `SAIAgentContextOverlay`는 팝업의 시작 위치와 실제 드래그 델타로 새 위치를 계산하고, 현재 오버레이·팝업 크기로 경계를 맞춘다. 빈 영역의 입력은 뷰포트로 보낸다. `ConnectionDrawingPolicy`는 양쪽 핀의 위젯 지오메트리가 있을 때 연결선을 그리고 렌더 범위 밖 연결을 걸러낸다. 연결 중에는 미리보기 끝점으로 스플라인을 그린다. PlayForge는 이와 같은 방식으로 현재 편집기 지오메트리를 읽어 경로를 표시한다. [SAIAgentContextOverlay.cpp](D:/Git_OVDR/master-sandbox/Sandbox/Source/Sandbox/Private/Editor/AIAgent/SAIAgentContextOverlay.cpp:14) · [ConnectionDrawingPolicy.cpp](D:/Git_OVDR/master-sandbox/unreal-engine/Engine/Source/Editor/GraphEditor/Private/ConnectionDrawingPolicy.cpp:459)

## 이관 검증

워크트리 루트에서 다음과 같이 확인한다. 실제 WASM 경로는 프로젝트의 웹 에디터 번들과 Playwright가 필요하다.

```powershell
$env:PLAYFORGE_REAL_SHOWCASE = '1'
node --test --test-concurrency=1 forge/Tests/playforge_replay/template-showcase.test.cjs forge/Tests/playforge_agent_chat/agent-chat.test.cjs forge/Tests/playforge_agent_chat/agent-chat-conversation.test.cjs forge/Tests/playforge_agent_chat/agent-provider.test.cjs forge/Tests/playforge_agent_chat/record-agent-mcp.test.cjs
node --test forge/Tests/playforge_replay/showcase-feedback.test.cjs forge/Tests/playforge_replay/showcase-gestures.test.cjs
```

1. 세 템플릿에서 자유 보기, 로그 필터, 역할 추적을 각각 사용한다. 한 역할을 추적해도 나머지 역할의 씬 편집이 끝까지 진행되어야 한다.
2. 스크립트 역할로 파일 열기와 전체 붙여넣기를 본다. 소스 파일과 편집 중인 버퍼의 내용은 보존되어야 한다.
3. 위 예시를 빈 씬과 기존 노드가 있는 씬에서 각각 실행한다. Undo로 최초 상태, Redo로 같은 이름·부모·소유자·속성이 복원되어야 한다.
4. Undo 후 다른 편집을 하고 시연을 연다. 시연의 마지막 상태와 실제 씬이 같고, 시연을 처음으로 되돌려도 원본 편집 탭은 바뀌지 않아야 한다.
5. 외부 녹화는 성공·실패·재시도가 섞인 호출로 확인한다. 잘못된 후반 명령이 있는 파일은 원본을 부분 수정하지 않아야 한다.

설치형 통합 검증은 실제 채팅 패널에서 선택한 `Hud/Status`를 수정하는 도구 응답과 일반 대화 응답을 순서대로 받아 확인했다. 도구 응답만 편집 이력에 남고 실제 Undo와 별도 재생 탭이 원래 문구를 복원했다. 이 검증에서는 루프백 Ollama 호환 테스트 서버가 응답했다. 운영 모델의 한국어 명령 해석과 도구 선택 품질은 배포할 모델로 별도 확인해야 한다.
