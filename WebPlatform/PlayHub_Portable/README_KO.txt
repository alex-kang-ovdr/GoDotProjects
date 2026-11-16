PlayHub Portable 0.3.0 - 먼저 읽어 주세요

1. 기존 RebexTinyWebServer.exe가 있는 폴더에 PlayHub.exe를 복사합니다.
2. PlayHub.exe를 더블클릭합니다. 못 찾으면 파일 선택 창에서 기존 Rebex EXE를 선택합니다.
3. 처음 표시되는 관리자 비밀번호를 보관합니다. 준비 후 사용자 화면이 열립니다.

SQL 서버, Node.js, npm, IIS를 별도 설치하지 않습니다.
Windows 10/11 x64 및 기존 Rebex의 .NET Framework 4.6 이상 환경을 전제로 합니다.
내장 게임과 설정·SQLite DB는 %LOCALAPPDATA%\PlayHub 아래에 자동 준비합니다.
사용자·관리자 사이트는 물리 폴더, 서버 프로세스, 포트가 분리되어 있습니다.

실행 창: U 사용자 화면 / A 관리자 화면 / Q 종료.
기본 주소: 사용자 http://localhost:8080/, 관리자 http://127.0.0.1:8081/
포트는 기본 8080/8081/8090/8091 또는 저장된 사용자 지정값으로 고정됩니다. 충돌 시 포트와 PID를 표시합니다. PlayHub로 확인된 프로세스만 Y로 종료한 뒤 같은 포트로 재시도할 수 있습니다. N 또는 Enter는 종료하며, 다른 프로그램은 종료하지 않고 대체 포트도 자동 선택하지 않습니다. 실제 출력 주소를 따르세요.
다른 PC는 출력된 LAN 주소를 사용하며 Windows 방화벽 허용이 필요할 수 있습니다.

게임 추가: 정상 종료 후 workspace\games 폴더에 넣고 workspace\catalog\games.json에 추가한 뒤 재실행합니다.
Google 로그인: 사용자 발급 client ID/secret 및 callback 설정이 필요합니다.
최초 관리자 비밀번호를 잊으면 종료 후 PlayHub.exe --reset-admin-password로 재발급합니다.

실행·설계·검증·개발 상세: START_HERE.html
전체 소스와 기존 상세 기획·PDF: source 폴더
검증 결과: evidence 및 source\reports
Node 전체 라이선스: licenses\Node-LICENSE.txt

Windows 실제 관측(실행 중 별도 PowerShell):
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows-acceptance.ps1 -WithHttpSmoke -WithAdmin

제작 환경에서 실제 Windows/Rebex 실행, 실브라우저, 다른 기기 LAN, Google 실인증은 수행하지 않았습니다.
Linux 동일 payload SEA 및 HTTP, Node 회귀, Windows PE 구조·해시 검사 결과를 동봉했습니다.
최종 Windows EXE는 서명되지 않았습니다.
Rebex 바이너리는 동봉하지 않으며 기존 로컬 사본을 사용합니다.
