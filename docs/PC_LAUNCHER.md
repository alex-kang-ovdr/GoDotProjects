# PC 빌드 실행기

2026-09-23 수정.

`Run-PC-Build.bat`은 새 빌드를 만든 뒤 그 결과를 실행한다. `Run-PC-Build-Silent.bat`도 같은 경로를 사용하되 출력은 숨긴다. 런타임 인자를 전달할 수 있다.

## 실행 중인 파일 충돌 방지

기존 실행 파일에 바로 내보내면 Godot의 PCK 임베딩 중 파일 교체가 실패할 수 있다. 이제 `Build-PC.bat`은 `Build/PC/CaptainSalvage-build-<고유번호>.exe`에 먼저 완성한다.

- 기본 실행 파일을 교체할 수 있으면 `Build/PC/CaptainSalvage.exe`로 이동한다.
- 기본 파일이 사용 중이거나 교체할 수 없으면 완성된 고유 파일을 그대로 실행한다.
- 성공한 빌드 경로는 `[BUILD]`로 표시하고 호출 배치에 `CAPTAIN_PC_EXE`로 전달한다. 이 값은 종료 코드 0일 때만 사용한다.
- 빌드 실패 시 기존 파일을 대신 실행하지 않는다. 일반 실행기는 오류 코드를 표시하고 키 입력을 기다린다. 자동화에서는 `CI=1`로 대기를 끈다.
- 사용 중인 게임을 강제 종료하지 않는다. 잠금 때문에 남은 고유 빌드 파일은 자동 삭제하지 않는다.

## 회귀 검사

프로젝트 루트에서 PowerShell로 `./Tools/Testing/Test-PCLauncher.ps1` 실행. 실제 PC 내보내기와 5프레임 헤드리스 실행을 사용한다. 일반 실행, 파일 잠금 상태의 대체 실행, 기존 EXE 해시 보존, 엔진 경로 오류 전달을 검증한다.

로그는 `Saved/AutomationTestResults/pc-launcher/`에 저장한다. 배치 파일은 ASCII 메뉴/UTF-8 without BOM/CRLF로 유지한다.
