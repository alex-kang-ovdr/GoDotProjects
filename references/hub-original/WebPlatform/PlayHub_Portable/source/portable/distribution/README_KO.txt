# PlayHub 배포 ZIP 빠른 시작

## 실행

1. ZIP을 Windows 10 또는 11 x64 PC에 풉니다.
2. 이미 보유한 `RebexTinyWebServer.exe`를 `PlayHub.exe`와 같은 폴더에 두거나, 처음 실행할 때 표시되는 파일 선택 창에서 해당 파일을 선택합니다. Rebex 실행 파일은 이 ZIP에 포함되지 않습니다. 제품 정보는 [Rebex Tiny Web Server 공식 페이지](https://www.rebex.net/tiny-web-server/), 사용 조건은 [공식 EULA](https://www.rebex.net/Content/doc/freeware-eula.txt)를 확인하세요. EULA는 다른 앱의 런타임 구성 요소로 Rebex를 재배포할 때 Rebex의 명시적 허가를 요구합니다.
3. `Run_PlayHub.cmd` 또는 `PlayHub.exe`를 실행합니다. 콘솔에 `PlayHub 0.3 is running.`이 표시될 때까지 기다립니다.
4. 최초 관리자 비밀번호는 콘솔에 표시됩니다. 안전한 곳에 보관하세요. 분실한 경우 실행을 종료한 뒤 `PlayHub.exe --reset-admin-password`를 명시적으로 실행해 새 비밀번호를 발급합니다.

PlayHub 실행에는 Windows PowerShell 5.1이 필요합니다. 기존 Rebex 실행 파일에는 .NET Framework 4.6 이상이 필요합니다. 별도의 Node.js, npm, SQL 데이터베이스, IIS 설치는 필요하지 않습니다. Node 24 런타임과 SQLite, PlayHub 코드, 기본 게임은 실행 파일에 포함되어 있습니다.

## 포트와 접속

| 서비스 | 기본 포트 | 접속 범위 |
|---|---:|---|
| 사용자 사이트 | 8080 | LAN 접속 가능 |
| 관리자 사이트 | 8081 | 이 PC에서만 접속 |
| 사용자 API | 8090 | LAN 접속 가능 |
| 관리자 API | 8091 | 이 PC에서만 접속 |

포트는 구성에 저장된 값으로 고정되며, 사용자 지정 포트도 다음 실행에서 유지됩니다. 충돌 안내에는 포트와 PID가 표시됩니다. 해당 프로세스가 PlayHub로 확인된 경우에만 `Y`로 종료하고 같은 포트로 재시도할 수 있습니다. `N` 또는 Enter를 누르면 실행을 중단합니다. 다른 프로그램은 자동 종료하지 않으며 대체 포트를 자동 선택하지 않습니다. 다른 프로그램이 점유했다면 직접 종료하거나 설정을 변경한 뒤 다시 실행하세요.

콘솔의 `U`는 사용자 사이트, `A`는 관리자 사이트를 엽니다. `Q`를 입력하면 서비스를 종료합니다. 관리자 서비스는 loopback 전용이므로 다른 PC에서 열 수 없습니다. 다른 PC에서 사용자 사이트에 접속하려면 해당 PC의 LAN 주소와 사용자 포트를 사용하고, Windows 방화벽에서 필요한 LAN 접근을 직접 허용해야 합니다. PlayHub는 외부 공개, 공유기 포트 포워딩, 방화벽 변경을 자동으로 하지 않습니다.

## 데이터와 기능

상단 `PlayForge` 링크는 `/PlayForge/`를 열고 같은 호스트의 `4173/OfficialGodot/`로 이동합니다. PlayForge 설치 폴더의 `START_SERVER.cmd`로 서버를 실행하세요. 기본 주소는 `http://localhost:4173/OfficialGodot/`이며 PlayForge 기본 바인딩은 로컬 PC 전용입니다. 도메인 또는 포트가 다르면 PlayHub의 `private/config/local.json`에 `playforgeUrl`을 전체 HTTP(S) URL로 지정한 뒤 PlayHub를 재시작하세요. PlayForge의 서버·HTTPS 설정은 설치본의 `Deploy/SERVER_README.md`를 따릅니다.

사용자별 데이터와 SQLite 저장소는 `%LOCALAPPDATA%\PlayHub` 아래에 생성됩니다. 같은 PC에서 재실행하거나 ZIP을 업데이트해도 이 데이터는 유지됩니다. 다른 PC나 새 Windows 계정은 별도의 데이터 공간으로 시작하며 기존 사용자의 저장 데이터나 로그인 정보가 자동 이전되지 않습니다.

기본 게임 21종과 한국어·영어·일본어·중국어 간체·프랑스어·스페인어·브라질 포르투갈어·힌디어 UI를 제공합니다. 게임 상세 화면에서는 의견과 개선 제안을 작성할 수 있고, 제안에 공감하거나 신고할 수 있습니다. 관리자는 제안을 접수, 반영 예정, 반영 완료 또는 보류 상태로 관리합니다. 이용자가 작성한 제목과 내용은 번역하지 않습니다.

## 데이터와 로그를 별도로 옮기기

데이터 ZIP과 로그 ZIP은 별도 보관·전달용입니다. ZIP 안의 `Export_PlayHub_Data.cmd`, `Import_PlayHub_Data.cmd`, `Export_PlayHub_Logs.cmd`, `Import_PlayHub_Logs.cmd`를 실행하고, 각 도구의 파일 선택 창에서 입력·출력 위치를 고릅니다. `tools/Transfer_PlayHub.ps1`가 작업을 수행합니다.

- **데이터 내보내기:** 먼저 PlayHub를 정상 종료하세요. 내보내기 도구는 서버를 중지하지만 프로세스를 강제 종료하지 않습니다. 데이터 ZIP에는 `private/config`, `private/data`(계정·저장·찜·커뮤니티 및 SQLite 분석·감사 데이터 포함), 사용자 지정 게임 변경 내용이 포함됩니다.
- **데이터 가져오기:** 대상 PC에서 데이터 가져오기를 실행하고, 기존 데이터를 교체할지 묻는 확인에 `Y`로 응답해야 가져옵니다. 기존 데이터는 날짜가 붙은 백업으로 보존하고 새 PC의 `dataDir`을 알맞게 설정합니다. 브라우저 쿠키는 ZIP에 포함되지 않습니다. 등록 계정은 새 PC에서 다시 로그인해야 합니다. 게스트 기록에 계속 접근하려면 이동 전에 계정을 연결해 기록을 병합하세요.
- **로그 내보내기:** 로그 ZIP에는 진단 보고서, 로그, 임시 파일, 캐시, 생성된 사이트 파일과 앱 캐시가 포함됩니다. 데이터베이스, 비공개 설정, Rebex 실행 파일과 인증서는 제외합니다. 로그에 IP 주소나 이용자가 입력한 텍스트가 남을 수 있으므로 공유 전에 확인하세요.
- **로그 가져오기:** 로그 ZIP은 비어 있는 새 폴더에만 압축을 풉니다. 활성 인스턴스나 기존 파일을 덮어쓰지 않습니다.

데이터 ZIP은 암호화되지 않으며 관리자 비밀번호 해시와 OAuth 설정을 포함합니다. 공개 링크나 공개 저장소에 올리지 말고 신뢰할 수 있는 대상에만 안전한 경로로 전달하세요.

## 검증 범위

PlayHub Portable은 Windows 로컬/LAN 사용을 위한 PoC입니다. 인터넷 공개용 프로덕션 서버로 제공하지 않습니다.

이전 애플리케이션의 Windows EXE 패키지 검사·자체 검사와 HTTP 검증은 54개 통과, 3개 건너뜀입니다. 이전 소스 브라우저 검증에서는 21개 게임과 커뮤니티 UI가 통과했습니다. 최종 ZIP의 Rebex 설치·LAN 접속 및 새 데이터/로그 이전 명령은 아직 실행 검증하지 않았습니다.

이 배포 ZIP에는 `PlayHub.exe`, `Run_PlayHub.cmd`, 데이터·로그 이전용 네 개 `.cmd` 파일, `tools/Transfer_PlayHub.ps1`, `tools/protect-instance.ps1`, `licenses/Node-LICENSE.txt`, `licenses/PORTABLE-NOTICES.txt`, 이 안내 파일, `SHA256SUMS.txt`, `PACKAGE_MANIFEST.json`이 포함됩니다. 소스 코드와 검증 보고서 폴더는 포함하지 않습니다. 실행 파일과 라이선스 파일의 해시 확인에는 동봉된 SHA-256 목록을 사용하세요.
