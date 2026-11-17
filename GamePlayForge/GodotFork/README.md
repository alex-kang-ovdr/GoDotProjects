# PlayForge engine fork

Godot 4.7.2의 `playforge-web` 엔진 소스 분기를 `D:/Github/GoDotProjects-worktrees/PlayForge-Engine`에 준비했습니다. 원본 `D:/Github/godot-engine` 작업 트리는 변경하지 않았습니다.

현재는 `platform/web`과 루트 빌드 파일만 제한 체크아웃했습니다(92개 파일, 약 1.12 MiB). 전체 엔진 빌드에 필요한 core/editor 소스는 아직 전개하지 않았습니다. 웹 에디터 진입·임베딩·게임 실행·협업은 현재 저장소의 `OfficialGodot` 웹 코드와 `playforge_platform` 플러그인에서 변경합니다. 실행 엔진은 공식 4.7.2 바이너리이며 C++ 코어 패치와 자체 WASM 재빌드는 아직 없습니다.

상류 버전 고정과 분기 경로는 [upstream.json](upstream.json)에 기록합니다. 엔진 수정이 필요해지면 수정 대상과 빌드 도구를 정하고 해당 소스 범위만 추가합니다.
