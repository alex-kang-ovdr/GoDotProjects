# PlayHub 0.3.0 — EXE 하나로 실행하는 웹 게임 플랫폼 PoC

**배포 담당자가 사이트를 준비한 뒤, 사용자는 Rebex Tiny Web Server 옆의 `PlayHub.exe`를 실행합니다.** Node 런타임·SQLite·플랫폼 코드·기본 게임은 EXE 안에 포함되어 있습니다. 사용자 PC에 SQL Server, MySQL, PostgreSQL, Node.js, npm, IIS를 설치하지 않습니다.

사용자 사이트는 Rebex, 관리자 사이트는 별도 localhost 전용 worker가 제공합니다. 두 사이트는 **물리 폴더·서버 프로세스·포트가 분리**됩니다. 로그인 없이 탐색·플레이하고, 첫 플레이에서 게스트를 생성합니다. 관리자는 별도 화면에서 실제/QA 지표, 게임 공개 상태, 오류를 확인합니다.

## 1. 바로 실행

1. 배포 ZIP을 풉니다.
2. `PlayHub.exe`를 기존 `RebexTinyWebServer.exe`가 있는 폴더에 복사합니다.
3. 배포 담당자가 서비스가 종료된 상태에서 `PlayHub.exe --prepare`를 실행해 사이트를 배포합니다. 첫 배포 때 표시되는 관리자 비밀번호를 보관합니다.
4. 사용자는 `PlayHub.exe`를 더블클릭합니다. 기존 Rebex 파일을 못 찾으면 파일 선택 창에서 한 번 선택합니다. 서버가 준비되면 사용자 사이트가 기본 브라우저에서 열립니다.

일반 실행은 배포된 사이트와 설정을 검증한 뒤 서버를 시작합니다. 배포물이 없거나 포트 등 사이트용 설정이 바뀌면 `PORTABLE_DEPLOYMENT_REQUIRED`를 표시합니다.

기존 Rebex 설치 파일·설정은 수정하지 않습니다. 사용자가 보유한 바이너리를 전용 실행 폴더로 복사하여 사용자 사이트용 인스턴스를 시작합니다. 이미 실행 중인 다른 Rebex 프로세스를 종료하지 않습니다. **실행 창을 유지하는 동안 서비스가 동작하며, `Q`를 입력해 종료합니다.** `A`는 관리자 화면, `U`는 사용자 화면을 엽니다.

대상은 **Windows 10/11 x64의 데스크톱 사용 환경**입니다. 기존 Rebex가 요구하는 .NET Framework 4.6 이상과 Windows 기본 PowerShell 5.1이 있어야 합니다. 현재 제공한 Windows EXE는 서명되지 않았습니다. 시스템 정책에 따라 실행 파일 확인·방화벽 확인이 표시될 수 있습니다.

| 구성 | 기본 접속 주소 | 바인딩 및 역할 |
|---|---|---|
| 사용자 사이트 | `http://localhost:8080/` | 기존 Rebex의 정적 사이트, LAN 공유 가능 |
| 관리자 사이트 | `http://127.0.0.1:8081/` | 별도 worker, loopback 전용 |
| 사용자 API | `http://localhost:8090/api/health` | `0.0.0.0`, 게스트·저장·이벤트 |
| 관리자 API | `http://127.0.0.1:8091/api/health` | loopback, 독립 세션·권한 검사 |

포트는 구성에 지정된 값으로 고정됩니다. 기본값은 사용자 사이트/API 8080/8090, 관리자 사이트/API 8081/8091이며 저장된 사용자 지정값도 그대로 유지합니다. 충돌 시 실행 안내에 포트와 PID가 표시됩니다. 충돌 프로세스가 PlayHub임을 확인한 경우에만 종료 여부를 묻습니다. Y는 해당 PlayHub 프로세스를 종료하고 같은 포트로 재시도하며, N 또는 Enter는 실행을 중단합니다. 다른 프로그램은 종료하지 않고 대체 포트로 자동 전환하지 않습니다. **항상 실제 실행 창·시작 보고서에 표시된 주소를 사용합니다.** 다른 PC에서는 localhost 대신 실행 창의 LAN 주소를 사용하고, 해당 PC 방화벽이 사용자 사이트·사용자 API 포트 접근을 허용해야 합니다. PlayHub는 방화벽이나 시스템 서비스를 자동 변경하지 않습니다.

## 2. 단일 EXE와 데이터의 관계

단일 EXE는 실행 진입점입니다. `--prepare`가 게임 작업 폴더·정적 사이트·개인 설정을 준비하고, API가 실행되면 인스턴스의 데이터 폴더에 DB를 엽니다.

| 자동 생성 위치 (`%LOCALAPPDATA%\PlayHub` 아래) | 내용 |
|---|---|
| `app\<payload SHA-256>\` | 해시 검증 후 추출한 앱 코드와 라이선스 |
| `workspace\games\` | 수정·추가 가능한 게임 폴더 |
| `workspace\catalog\games.json` | 중앙 게임 목록 |
| `sites\user\` | Rebex가 제공하는 사용자 전용 정적 파일 |
| `sites\admin\` | 별도 worker가 제공하는 관리자 전용 정적 파일 |
| `private\config\local.json` | 관리자 해시, Google 설정, 포트 등 비공개 설정 |
| `private\data\platform.sqlite` | SQLite 저장·세션·지표 DB |
| `servers\user\` | 사용자가 보유한 Rebex의 전용 실행 복사본 |
| `reports\` | 실제 실행·HTTP·Windows 관측 보고서 |

두 웹 루트 어디에도 서버 소스, 관리자 해시, Google client secret, SQLite DB를 넣지 않습니다. 관리자 화면과 사용자 화면은 각각 별도 서버 프로세스이며, 두 API listener는 하나의 별도 API worker에서 SQLite를 공유합니다. 이 PoC는 하나의 PC·Windows 사용자 계정 안에서 분리되며, 별도 VM·서버·OS 계정으로 격리된 구성은 아닙니다.

새 데이터 폴더는 `PlayHub.exe --prepare --data-dir "D:\PlayHubData"`로 배포하고 `PlayHub.exe --data-dir "D:\PlayHubData"`로 시작합니다. 기존 데이터를 이동할 때는 종료 후 전체 데이터 폴더를 백업하고 절차를 계획해야 합니다. EXE 교체 후 같은 인스턴스에 배포하면 기존 게임·설정·데이터를 유지합니다.

## 3. 구현된 서비스 기능

| 영역 | 구현 내용 |
|---|---|
| 탐색 | 한국어 중심 게임 목록, 검색·장르 필터, 상세·조작 안내 |
| 기본 게임 | 매치 3, 낙하 블록, 버블 분할, 블록 깨기, 슬라이드 퍼즐, 지뢰 퍼즐, 메모리 짝 맞추기, 숫자 합치기 총 8종 |
| 로그인 | 익명 탐색, 첫 플레이 자동 게스트, Google OAuth 연결 코드 |
| 저장 | 서버 저장·자동 불러오기, revision 충돌 처리, 보관 슬롯, 이전 진행 백업·복원 |
| 플랫폼 지표 | 가시 노출, 카드 클릭, 노출 CTR, 플레이 진입·준비, 10초/60초 플레이, 활성 시간, 오류·저장 |
| 리텐션 | 일자별 코호트 D1/D7/D30, 성숙 코호트 분모, 기간·게임 필터 |
| 관리자 | 별도 로그인, 실제/QA/계산 예제 분리, 게임 공개·비공개, 오류·감사 기록 |
| SEO 구조 | 게임별 정적 상세 HTML, 고유 메타 정보, canonical·OG·사이트맵 생성 |
| 확장·검증 | 폴더+manifest+목록 기반 빌드, 게임 SDK 계약, API·패키지·Windows 관측 자동화 |

기본 게임의 실제 규칙과 저장 범위는 `docs/POC_GAMES.md`, API는 `docs/POC_API_CONTRACT.md`에 있습니다. 일반 장르 규칙을 구현한 샘플이며 외부 게임의 자산을 동봉한 것이 아닙니다.

**D1/D7/D30은 실제 날짜가 지나야 실제 이용 코호트에 표시됩니다.** 30일 이용 관찰을 이번 제작 세션에서 수행한 것은 아닙니다. 날짜를 제어한 계산 검사는 별도로 수행하고, 관리자 예제 데이터는 실제 이용 기록과 구분합니다. 익명·게스트 분석은 해당 브라우저 식별을 기준으로 하므로 쿠키 삭제, 다른 브라우저·기기 사용에는 측정 한계가 있습니다.

이 버전은 내부 PoC이므로 `noindex`와 `robots.txt`로 색인을 막습니다. 검색 가능한 URL·HTML 구조를 갖췄다는 의미이며, 실제 검색 노출이 검증되었다는 의미는 아닙니다. 공개 서비스 전환 시 도메인·HTTPS·검색 허용 정책을 별도로 적용합니다.

## 4. 게임 추가

1. 실행 창에서 `Q`를 입력해 정상 종료합니다.
2. `%LOCALAPPDATA%\PlayHub\workspace\games\<id>\`에 새 게임을 넣습니다. 기존 기본 게임의 `game.manifest.json`과 폴더 구조를 참고합니다.
3. `workspace\catalog\games.json`의 `entries` 배열에 다음 항목을 추가합니다.
4. 배포 담당자가 `PlayHub.exe --prepare`로 변경을 배포한 뒤 `PlayHub.exe`를 실행합니다. 성공한 배포의 카드·상세·게임 경로가 제공됩니다.

```json
{"id":"new-puzzle","path":"games/new-puzzle","enabled":true}
```

작업 폴더 편집은 다음 성공한 수동 배포에 반영됩니다. 일반 실행은 마지막에 배포된 카탈로그를 사용합니다. SDK 파일은 각 게임의 vendor 폴더로 배치됩니다. 추가 게임과 수정한 기본 게임은 배포 때 유지합니다. 운영자의 게임 공개 설정은 기존 DB에서 읽습니다.

## 5. Google 로그인과 관리자 비밀번호

Google 로그인 코드는 포함되어 있습니다. **실제 OAuth client ID·secret·redirect URI는 사용자가 발급한 값이 필요합니다.** 값이 없으면 설정 필요 상태를 표시하며 게스트 플레이는 그대로 가능합니다.

종료한 상태에서 `private\config\local.json`의 `google` 객체의 `clientId`, `clientSecret`, `redirectUri`를 설정합니다. 로컬 검증의 redirect 예는 `http://localhost:8090/api/auth/google/callback`이며 실제 선택한 사용자 API 포트로 바꿉니다. 사용자 화면도 localhost 주소로 열어야 합니다. 정확한 필드 구조는 같은 파일의 `google` 객체와 `config/example.json`을 참고하세요. 설정 후 EXE를 다시 실행합니다.

LAN의 임의 IP를 localhost callback과 섞으면 다른 기기에서 올바르게 돌아오지 않습니다. 공유 Google 로그인은 Google이 허용하는 도메인·HTTPS redirect 구성이 추가로 필요합니다. [Google 공식 웹 서버 OAuth 문서](https://developers.google.com/identity/protocols/oauth2/web-server)를 기준으로 등록합니다.

관리자 ID의 기본값은 `admin`입니다. 최초 비밀번호는 난수로 생성해 실행 창에만 표시하고 설정에는 scrypt 해시를 보관합니다. 잊었으면 종료 후 다음 명령으로 재발급합니다. 기존 관리자 세션도 무효화합니다.

```powershell
.\PlayHub.exe --reset-admin-password
```

## 6. 실제 PC 자동 점검

서비스가 실행 중일 때 별도 PowerShell 창에서 배포 ZIP의 검사 스크립트를 실행합니다. 별도 npm 패키지나 SQL 설치가 필요하지 않습니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\windows-acceptance.ps1 -WithHttpSmoke -WithAdmin
```

`-WithAdmin`은 비밀번호를 숨겨진 입력으로 받고 stdin으로만 검사 프로세스에 전달합니다. 비밀번호를 명령행·보고서에 기록하지 않습니다. 검사기는 실행 중인 프로세스·웹 루트·loopback 포트·비공개 경로를 관측하고, 선택 HTTP 검사에서 QA 전용 게스트·저장·이벤트를 생성합니다. 그 기록은 실제 이용 지표에서 제외됩니다. 공개 상태를 시험 변경하면 원래 상태로 복구합니다.

결과는 데이터 폴더의 `reports\portable-acceptance.json`, HTML 및 `portable-http.json`, HTML에 남습니다. 정확한 결과 파일명은 검사 출력도 함께 확인합니다. `--self-test`는 임시 DB·Node 정적 서버로 기능을 확인하는 검사이며 실제 Rebex 실행 증거를 대신하지 않습니다.

브라우저 입력·Google 실제 로그인·다른 PC의 LAN 접근은 자동 HTTP 검사와 구분합니다. 이 제작 환경은 Linux이므로 **Windows/Rebex의 실실행은 not_run**입니다. 실제 실행 전 확인할 항목과 관측 근거는 `docs/PORTABLE_DESIGN.md`에 정리했습니다.

## 7. A–Z 사용 확인

| 순서 | 확인 행동 | 기대 결과 |
|---|---|---|
| A | EXE 실행 | 설정·게임·DB 준비, 주소 표시 |
| B | 사용자 화면 열기 | 로그인 없이 기본 게임 목록 |
| C | 검색·카드·플레이 | 조작 안내와 게임 실행 |
| D | 플레이 후 저장, 같은 주소 재방문 | 같은 게스트의 저장 재개 |
| E | 저장 관리에서 보관·복원 | 이전 main 백업과 revision 처리 |
| F | 관리자 사이트 로그인 | 별도 운영 화면 |
| G | 실제/QA/예제 전환 | 데이터 출처가 구분된 지표 |
| H | 게임 비공개 후 사용자 목록 갱신 | 새 목록·진입에서 제외 |
| I | 종료 후 새 게임 폴더·목록 추가 및 수동 배포 | 배포된 사이트와 API 카탈로그에 반영 |
| J | EXE 종료·재실행 | 기존 게임·설정·저장 유지 |
| K | 다른 PC에서 LAN 주소 방문 | 허용된 사용자 포트로 플레이 |
| L | OAuth 설정 후 Google 로그인 | 실계정 인증과 게스트 기록 연결 |

백업은 `Q`로 정상 종료한 뒤 데이터 폴더 전체를 날짜별 다른 폴더로 복사하면 됩니다. SQLite WAL/SHM 파일이 남아 있다면 함께 보관합니다. 실행 중 파일 하나만 복사하지 마세요. 전체 DB 복원은 현재 데이터를 먼저 별도로 보관하고 종료 상태에서 시행해야 하며, 백업 시점 이후의 진행·지표는 되돌아갑니다. 소스 개발 도구의 `tools/backup.mjs`, `tools/restore-data.mjs`는 별도 개발 환경용 온라인 백업·검증·복원 기능을 유지합니다.

## 8. 소스 개발과 검증 근거

일반 사용자는 아래 명령을 실행할 필요가 없습니다. 개발 환경에서는 Node 24.22.1로 다음과 같이 검사할 수 있습니다.

```text
node --test tests/*.mjs
node portable/launch.mjs --self-test --data-dir <검사-출력-폴더>
```

EXE 빌드는 `portable/build-sea.mjs`, 재현 절차는 `portable/BUILD.md`를 참고합니다. 외부 npm 런타임 의존성은 없고 postject는 빌드 때만 사용합니다. Windows와 Linux 검증용 SEA는 동일한 앱 payload를 사용합니다.

배포의 최신 증거는 `reports/portable-release.json`과 관련 보고서입니다. `reports/legacy-iis-v02/`, `docs/legacy-iis-v02/`, 기존 `Install.cmd`·`scripts/Install-IIS.ps1`은 이전 IIS 버전의 참고 자료입니다. **포터블 실행에 IIS 설치 절차를 사용하지 않습니다.** `planning/`의 28장 기획·레퍼런스, `specs/`, `automation/`은 원래 제품 기획과 확장 도구를 보존한 자료이며 실행 배포 방식은 이 README와 portable 문서를 우선합니다.

## 9. 공식 근거와 배포 구성

- [Rebex 제품·설정·요구 사항](https://www.rebex.net/tiny-web-server/)
- [Rebex 정적 서버 범위](https://forum.rebex.net/22547/tiny-web-server-can-run-php)
- [Rebex EULA](https://www.rebex.net/Content/doc/freeware-eula.txt)
- [Node 24.22.1 단일 실행 파일](https://nodejs.org/download/release/v24.22.1/docs/api/single-executable-applications.html)
- [SQLite serverless 동작](https://www.sqlite.org/serverless.html)

Rebex의 런타임 구성 요소 재배포에는 명시적 허가가 필요하므로 이 ZIP/EXE에는 **Rebex 바이너리를 넣지 않았습니다.** 사용자가 이미 보유한 로컬 사본을 연결합니다. Node와 동봉 컴포넌트의 전체 라이선스는 배포의 `licenses/Node-LICENSE.txt` 및 추출한 앱의 동일 파일에 있습니다.
