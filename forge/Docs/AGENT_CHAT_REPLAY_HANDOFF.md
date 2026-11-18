# AI 채팅과 제작 시연 이관 명세

갱신일 2026-11-18 · 대상 브랜치 `Forge-AgentReplay` · 기준 엔진 Godot 4.7.2

## 사용자 진입점

루트의 `Run_AgentReplay.cmd`를 실행한다. 웹에서는 템플릿에서 **만드는 과정 보기**, Windows 에디터에서는 **프로젝트 → 도구 → PlayForge Showcase 재생**으로 시연을 연다. **작업 로그**는 표시할 역할을 고른다. **화면 추적**은 편집 화면을 움직일 한 역할을 고른다. 한쪽 선택이 다른 쪽 설정이나 작업 진행 속도를 바꾸지 않는다.

| 사용자 동작 | 보이는 결과 |
| --- | --- |
| 자유 보기 | 모든 역할 커서가 원래 밝기로 보인다. |
| 레벨 또는 GUI 추적 | 해당 역할이 고른 씬 노드와 2D 또는 3D 편집 화면이 보인다. 열린 인스펙터에서 속성을 따라간다. |
| 스크립트 추적 | 원본 GDScript 파일을 선택하고, 해당 ScriptEditor의 코드 영역에서 빈 화면과 전체 코드 붙여넣기를 차례로 보여 준다. 사용자 편집 버퍼 보호를 위해 읽기 전용 CodeEdit에서 시연한다. |
| 에셋 추적 | 현재 노드가 참조하는 외부 리소스가 있고 파일시스템 독이 보이면 그 파일을 선택한다. |
| 시간 이동 또는 처음부터 | 해당 시각까지의 작업, 로그, 역할별 커서 문구를 다시 계산한다. 같은 시각의 명령은 기록 순서를 따른다. |
| AI 채팅 → 리플레이 재생 | 첫 편집 직전 씬 복사본을 별도 탭에서 열고 채팅 작업 및 Undo·Redo를 재현한다. |

로그 한 줄은 시각, 역할 이름, 커서에 사용한 원문으로 구성한다. 한 역할을 추적하면 다른 커서와 설명은 불투명도 30%로 그린다. 숨겨진 인스펙터를 열거나 마우스 입력을 합성하지 않는다. 에디터 레이아웃과 창 크기는 실행 조건에 포함되지 않는다.

## 구성과 배포

| 위치 | 인수할 책임 |
| --- | --- |
| `Godot/addons/playforge_agent_chat/chat_panel.gd`, `plugin.gd` | 대화, 현재 씬·선택 노드 문맥, 모델 응답, 명령 수락, 작업 기록, 재생 탭 열기 |
| `Tools/agent-chat-extension/chat_dock.c`, `build.ps1` | Windows x86-64 단정도 ABI의 `PlayForgeAgentChatDock` 등록 및 대화 이력 관리. 빌드 시 지정한 Godot 실행 파일에서 ABI 헤더를 직접 추출한다. |
| `Godot/addons/playforge_agent_chat/scene_commands.gd` | AI와 MCP의 공용 편집 명령 해석, 타입 검사, Godot Undo와 별도 탭에서의 순방향·역방향 재생 |
| `Godot/addons/playforge_showcase/` | 역할별 로그, 독, 커서, 시각별 상태, 원본 템플릿 재구성, 주인공 역할의 에디터 포커스 |
| `Tools/record-agent-mcp.cjs` | 기존 stdio MCP 서버 앞에서 요청과 성공 응답을 대응시켜 JSONL 녹화 생성 |
| `Tools/agent-chat-provider.cjs`, `server.cjs` | 웹 편집기와 로컬 Ollama 사이에서 모델을 호출하는 서버 경로 |
| `OfficialGodot/editor-bridge.js`, `guided.js` | 웹 가상 프로젝트에 확장을 주입하고 iframe 바깥의 협업 커서를 같은 좌표와 밝기로 표시 |
| `Tools/prepare-template-showcase.cjs` | 설치형 프로젝트에 에디터 플러그인과 Windows DLL 준비 |

Windows에서는 함께 배포하는 GDExtension DLL을 쓴다. 공식 웹 에디터에서는 같은 GDScript 패널과 명령 처리기를 로드하고 대화 이력은 GDScript가 관리한다. Godot 포크 변경은 필요하지 않다.

새 Windows 프로젝트는 첫 임포트 전에 준비 도구가 `.godot/extension_list.cfg`에 DLL 확장 경로를 등록한다. 이 단계를 빼면 Godot 4.7.2의 첫 임포트가 Windows 접근 위반으로 끝나는 사례가 재현됐다. DLL을 다시 빌드할 때는 워크트리 루트에서 다음 명령을 사용한다.

```powershell
& ./forge/Tools/agent-chat-extension/build.ps1 -Godot 'D:/Github/GoDotProjects/Godot_v4.7.2-stable_win64_console.exe'
```

기존 대화창의 참고 위치는 `D:/Git_OVDR/master-sandbox/Sandbox/Source/Sandbox/Private/Editor/AIAgent/AIAgentContextSender.cpp`, `AIAgentSelectionWatcher.cpp` 및 `Editor/SandboxWebView/SandboxWebViewTabManager.cpp`다. 현재 선택을 대화 문맥으로 전달하고 도구 창에서 열어 작업하는 흐름을 적용했다.

## 로컬 모델 연결

도구 호출을 지원하는 Ollama 모델을 실행한 뒤 `ollama list`에서 설치 이름을 확인한다. PowerShell에서 `$env:PLAYFORGE_AGENT_MODEL = '<설치한 모델 이름>'`을 설정한 뒤 같은 셸에서 런처를 시작한다. 기본 주소는 `http://127.0.0.1:11434/api/chat`이다. 다른 로컬 주소는 `PLAYFORGE_OLLAMA_URL`로 지정한다. 설치형은 직접 호출하고 웹은 `POST /api/agent-chat`을 거친다. 이 웹 경로는 루프백의 로컬 운영용이다. 클라우드에서 여러 사용자가 모델을 공유하려면 사용자 인증, 권한 및 사용량 제한을 갖춘 중계 경로가 별도 이관 과제다.

모델에 보내는 문맥은 씬 경로와 루트 유형, 현재 선택한 노드의 상대 경로와 유형, 이전 대화다. 요청 도중 씬이나 해당 편집 이력이 바뀌면 이전 응답으로 씬을 수정하지 않고 재요청을 안내한다. 모델 서비스가 없어도 아래 호출을 한 줄 JSON으로 채팅창에 입력해 편집과 녹화를 사용할 수 있다. [Ollama Chat API](https://docs.ollama.com/api/chat)

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

## 상태와 되감기

기본 템플릿은 기존 v3 매니페스트와 보존된 원본 PackedScene을 사용한다. Tappy Chicken·BrawlLabs는 2D, Iron Wood는 3D다. 녹화 세션은 v4에서 `add`, `set`, `revert` 각각에 실제 노드 경로, 역할, 설명과 순서를 보존한다. 같은 속성을 여러 번 바꾸면 각 중간 값을 순서대로 재현한다. v4는 명령 순서를 보기 쉬운 0.8초 간격으로 재생한다.

| 템플릿 | 완료 시 루트 아래의 누적 노드 수 | 선택할 원본 스크립트 |
| --- | ---: | --- |
| Tappy Chicken | 10 | `res://Scripts/Main.gd` |
| Iron Wood | 13 | `res://scripts/iron_wood.gd` |
| BrawlLabs | 31 | `res://scripts/main.gd` |

세 기본 타임라인은 6.5초에 파일을 선택하고 8.5초에 전체 내용을 붙여넣으며 9.5초에 완성된 씬의 루트 스크립트를 연결한다. 테스트에서는 표시 시간과 파일 선택, 붙여넣기 횟수, 최종 씬 일치를 따로 검사한다.

원본 편집 이력은 Godot의 씬별 `EditorUndoRedoManager`가 소유한다. Undo 때는 해당 묶음을 역순으로 기록하고 Redo 때는 다시 정순으로 기록한다. Undo 뒤에 새 작업을 하면 Godot의 Redo 분기는 닫히고 녹화에는 실제 일어난 Undo와 새 작업이 모두 남는다. 채팅 녹화의 0초 기준은 **첫 편집 직전의 씬**이다.

기본 템플릿에서는 같은 시각에 실행된 편집을 한 Undo 단위로 묶는다. 커서 문구만 바뀐 시각에는 씬 편집 이력을 추가하지 않는다. 재생 중 에디터의 Undo·Redo를 실행하면 시계가 멈추고 씬과 패널을 같은 시각으로 복원한다. 사용자가 직접 시간을 건너뛰거나 다시 시작한 동작도 위치 이동 한 건으로 기록한다.

시작 스냅샷과 최근 기록은 프로젝트 경로별 `user://forge-agent-*/`에 저장한다. 다시 보기용 씬은 `res://.godot/playforge_agent_replays/`에 생성한다. 이 파일들은 공동 편집 프로젝트 파일에 포함하지 않는다. 녹화 사이에 사용자가 다른 수단으로 한 임의 편집은 채팅 기록에 들어가지 않는다.

## 이관 검증

워크트리 루트에서 다음과 같이 확인한다. 실제 WASM 경로는 프로젝트의 웹 에디터 번들과 Playwright가 필요하다.

```powershell
$env:PLAYFORGE_REAL_SHOWCASE = '1'
node --test --test-concurrency=1 forge/Tests/template-showcase.test.cjs forge/Tests/agent-chat.test.cjs forge/Tests/agent-chat-conversation.test.cjs forge/Tests/agent-provider.test.cjs forge/Tests/record-agent-mcp.test.cjs
```

1. 세 템플릿에서 자유 보기, 로그 필터, 역할 추적을 각각 사용한다. 한 역할을 추적해도 나머지 역할의 씬 편집이 끝까지 진행되어야 한다.
2. 스크립트 역할로 파일 열기와 전체 붙여넣기를 본다. 소스 파일과 편집 중인 버퍼의 내용은 보존되어야 한다.
3. 위 예시를 빈 씬과 기존 노드가 있는 씬에서 각각 실행한다. Undo로 최초 상태, Redo로 같은 이름·부모·소유자·속성이 복원되어야 한다.
4. Undo 후 다른 편집을 하고 시연을 연다. 시연의 마지막 상태와 실제 씬이 같고, 시연을 처음으로 되돌려도 원본 편집 탭은 바뀌지 않아야 한다.
5. 외부 녹화는 성공·실패·재시도가 섞인 호출로 확인한다. 잘못된 후반 명령이 있는 파일은 원본을 부분 수정하지 않아야 한다.

설치형 통합 검증은 실제 채팅 패널에서 선택한 `Hud/Status`를 수정하는 도구 응답과 일반 대화 응답을 순서대로 받아 확인했다. 도구 응답만 편집 이력에 남고 실제 Undo와 별도 재생 탭이 원래 문구를 복원했다. 이 검증에서는 루프백 Ollama 호환 테스트 서버가 응답했다. 운영 모델의 한국어 명령 해석과 도구 선택 품질은 배포할 모델로 별도 확인해야 한다.
