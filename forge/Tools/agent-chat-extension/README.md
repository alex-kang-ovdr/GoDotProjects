# Godot 에이전트 채팅 독

Windows x86-64 단정밀도 Godot 4.7 에디터는 `PlayForgeAgentChatDock` GDExtension을 로드합니다. 독마다 완료된 최근 12개 문답을 메모리에 보관하며 다음 요청에 독립된 복사본을 전달합니다. 실패한 요청은 대화 기록에 추가하지 않고 입력창에서 수정하거나 다시 보낼 수 있습니다.

공식 Web 에디터는 `chat_panel.gd`에 구현한 동일한 입력창과 대화 기록을 사용합니다. 프로젝트 동기화는 채팅 플러그인과 재생용 임시 장면을 제외합니다.

## Windows DLL 빌드

LLVM의 `clang.exe`와 `lld-link.exe`, Godot 4.7 콘솔 실행 파일이 필요합니다. 저장소 루트에서 다음 명령을 실행합니다.

```powershell
.\forge\Tools\agent-chat-extension\build.ps1 -Godot 'D:\Tools\Godot_v4.7.2-stable_win64_console.exe'
```

빌드 스크립트는 지정한 에디터에서 C 헤더와 클래스 API를 추출하고 ABI를 확인한 뒤 `forge/Godot/addons/playforge_agent_chat/bin/playforge_agent_chat.windows.x86_64.dll`을 생성합니다. Windows 시연 프로젝트를 준비하면 이 DLL도 함께 복사합니다.
