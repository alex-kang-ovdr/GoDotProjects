# PlayHub 0.2.0 — 로컬 IIS 실행형 PoC

로그인 없이 가벼운 게임을 플레이하고, 게임 폴더와 목록 파일로 확장하며, 별도 관리자 사이트에서 노출·클릭·플레이·D1/D7/D30을 확인하는 1차 실행 패키지입니다. 실제 JavaScript 게임 8종, 사용자·관리자 화면, Node API, SQLite 저장, Windows IIS 설치·점검 도구를 포함합니다.

**0.2.0에서는 저장 충돌 복구 화면, 보관 슬롯·이전 진행 복원, 실제/QA 지표 분리, 기간·게임별 분석, 데이터베이스 복원, 통합 수용 검사를 구현했습니다.** 기능과 검사 증거는 `docs/POC_COMPLETION.md`, 실제 실행 결과는 `reports/acceptance.html`을 기준으로 합니다. `planning/`의 28장 기획서는 이전 기획 기준선이며 제품 목표와 당시 구현 상태를 함께 담습니다. 현재 구현 여부는 이 README와 `docs/`를 우선합니다.

## 1. 가장 빠른 설치

권장 대상은 IIS를 사용할 수 있는 **Windows 11 Pro 또는 Windows Server, 64비트 Windows PowerShell 5.1**입니다. IIS 기능 활성화·사이트·작업 스케줄러·방화벽 설정 때문에 설치 명령은 관리자 권한이 필요합니다. 기본 포트 8080·8081·8090·8091이 비어 있어야 합니다.

1. ZIP을 풉니다. 소스 보관 위치의 예는 `D:\Github\UnrealSamples\WebProjects\PlayHub`입니다.
2. `Install.cmd`를 우클릭하여 **관리자 권한으로 실행**합니다. 또는 관리자 Windows PowerShell에서 다음을 실행합니다.
3. 설치 중 관리자 비밀번호를 직접 입력합니다. 12자 이상이며 공용 기본 비밀번호는 없습니다.
4. 설치 결과에 표시된 사용자 주소를 다른 PC에 전달합니다. 같은 네트워크의 Private/Domain 프로필에서 사용자 포트만 공유됩니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Install-IIS.ps1 -ShareHost 192.168.0.10
```

`192.168.0.10`은 **IIS를 설치한 PC의 실제 LAN 주소**로 바꿉니다. `-ShareHost`를 생략하면 기본 게이트웨이가 있는 네트워크의 IPv4 주소를 찾아 사용합니다. VPN·네트워크 카드가 여러 개인 PC에서는 주소를 직접 지정하는 편이 명확합니다. 설치 경로 기본값은 `C:\PlayHubPoC`입니다.

| 화면·서비스 | 기본 주소 | 이용 범위 |
|---|---|---|
| 사용자 사이트 | `http://<서버-PC-IP>:8080` | 같은 네트워크에서 탐색·플레이 |
| 관리자 사이트 | `http://localhost:8081` | 설치한 PC에서 관리자 로그인 |
| 사용자 API | `http://<서버-PC-IP>:8090/api/health` | 사용자 기능용 API |
| 관리자 API | `http://127.0.0.1:8091/api/health` | loopback 전용, 별도 인증 |

포트 번호를 지정할 수도 있습니다. 네 포트는 서로 달라야 합니다.

```powershell
.\scripts\Install-IIS.ps1 -InstallRoot C:\PlayHubPoC -ShareHost 192.168.0.10 -UserPort 8080 -AdminUiPort 8081 -PublicApiPort 8090 -AdminApiPort 8091
```

한 PC에서만 확인하려면 `-LocalOnly`를 사용합니다. 이미 Node.js 24 이상이 있고 서비스 계정이 읽을 수 있다면 `-NodePath 'C:\Program Files\nodejs\node.exe'`를 지정할 수 있습니다. 기본 설치는 공식 nodejs.org의 Windows Node.js 24 ZIP과 SHA-256 목록을 받아 **전용 runtime 폴더**에 준비합니다. 최초 준비에 인터넷 연결이 필요할 수 있지만, 게임·화면·API 실행에 npm 패키지나 외부 CDN은 필요하지 않습니다.

설치 스크립트는 기존 Default Web Site를 바꾸지 않습니다. `PlayHubPoC-8080-User`, `PlayHubPoC-8080-Admin` 사이트와 앱 풀을 만들고, Node API는 Local Service 계정의 시작 작업으로 실행합니다. 관리자 사이트·API에는 LAN 방화벽 포트를 열지 않습니다.

## 2. 설치 후 A–Z 확인 순서

| 순서 | 행동 | 기대 결과 |
|---|---|---|
| A | 사용자 주소 열기 | 가입 화면 없이 8개 게임 목록 |
| B | 장르·검색·게임 카드 선택 | 게임 상세와 조작 안내 |
| C | 플레이 버튼·게임 내부 시작 | 실제 게임 실행, 별도 로그인 요구 없음 |
| D | 조작 후 저장 표시 확인, 페이지 다시 열기 | 같은 게스트의 진행을 불러옴 |
| D-2 | 저장 관리에서 보관·선택 복원 | 현재 탭 보존, 이전 main을 백업한 뒤 선택한 진행 적용 |
| E | 다른 브라우저로 동일 게임 실행 | 기존 게스트 저장에 접근하지 않음 |
| F | 관리자 주소에서 설치 비밀번호 입력 | 별도 운영 화면 진입 |
| G | 실제 이용 기록 탭 새로고침 | 노출·CTR·실행·준비·10초/60초·저장·활동 지표 |
| G-2 | QA 탭·기간·게임 필터 | 자동 검증 기록을 분리하고 선택 범위의 지표·리텐션·오류 조회 |
| H | 계산 검증용 예제 탭 | 실제 DB와 분리된 D1/D7/D30 가상 코호트 |
| I | 게임 하나를 비공개로 변경 | 새 목록·신규 플레이 세션에서 제외, 다시 공개 가능 |
| J | 다른 PC에서 사용자 주소 열기 | 서버 IP를 사용하는 API에 연결, 게스트 플레이 |
| K | 새 폴더·manifest·목록을 추가 후 재배포 | 카드·상세·정적 SEO·사이트맵 자동 생성 |
| L | API 재시작·백업·명시적 데이터 복원 | 진행 유지, 일관된 백업, 체크섬 확인 후 복원·실패 시 원본 복구 |
| M | OAuth 설정 후 Google 연결 | 실제 계정 인증, 게스트 기록 연결·충돌 선택 |

`localhost`는 **현재 브라우저를 실행하는 PC 자신**입니다. 다른 PC에 공유할 때는 사용자 주소의 서버 IP를 사용합니다. API 주소도 브라우저가 보고 있는 호스트 이름을 사용하므로 다른 PC에서 서버가 아닌 자신의 localhost로 잘못 연결하지 않습니다. 같은 브라우저에서도 localhost와 LAN IP를 번갈아 쓰면 서로 다른 쿠키 공간이므로 한 주소를 일관되게 사용하세요.

## 3. 자동 점검

설치 끝에서 기본 HTTP 점검을 실행합니다. 설치 후 한 번에 확인하려면 **관리자 권한 터미널**에서 다음 명령을 실행합니다. 설치된 Microsoft Edge를 사용하며 `-InstallTools`를 지정한 최초 실행에만 QA용 Playwright 패키지를 설치합니다.

```powershell
.\Validate.cmd -InstallRoot C:\PlayHubPoC -InstallTools
```

이 명령은 실제 IIS 사이트·관리자 loopback·API 작업·설정 ACL을 관측하고, 관리자 인증을 포함한 HTTP 및 브라우저 검사를 실행해 `C:\PlayHubPoC\reports\poc-acceptance.html`과 JSON으로 모읍니다. 독립 검증 프로세스가 각각 관리자 비밀번호를 요청할 수 있습니다. 브라우저 도구를 생략하려면 `-SkipBrowser`를 사용하되 결과는 부분 검증입니다. 실제 Google 로그인·두 번째 LAN PC·재부팅은 자동 통과로 표시하지 않습니다.

HTTP만 별도로 확인하려면 다음 명령으로 비밀번호를 입력합니다.

```powershell
C:\PlayHubPoC\releases\<현재-release>\scripts\Test-IIS.ps1 -InstallRoot C:\PlayHubPoC -WithAdmin
```

정확한 현재 release 경로는 `C:\PlayHubPoC\installation.json`에 있습니다. 편하게 압축을 푼 소스의 같은 스크립트를 실행해도 됩니다.

```powershell
.\scripts\Test-IIS.ps1 -InstallRoot C:\PlayHubPoC -WithAdmin
```

결과는 `C:\PlayHubPoC\reports\iis-smoke.json`과 같은 이름의 HTML에 기록됩니다. 점검은 서버에서 QA로 고정한 새 게스트의 저장·노출·플레이 이벤트를 만듭니다. **0.2 검증 트래픽은 실제 이용 지표에서 제외되며 관리자 QA 탭에서 조회**합니다. 게임 공개 상태 변경은 원래 값으로 복원하고 검사 데이터는 남깁니다. 0.1에서 QA 표시 없이 생성된 과거 기록은 소급 분류하지 못합니다.

실제 브라우저 조작을 자동 확인하는 선택 도구도 있습니다. Microsoft Edge를 기본 사용하며, Playwright는 검증 도구에만 설치합니다.

```powershell
.\scripts\Test-Browser.ps1 -InstallRoot C:\PlayHubPoC -InstallTools -WithAdmin
```

`-WithAdmin`은 관리자 기능까지 검사하며 비밀번호를 숨겨진 입력으로 받습니다. 이 옵션을 생략하면 관리자 검사는 skip이고 전체 결과는 partial입니다. 브라우저·IIS·실제 Google 계정 검증은 서로 다른 결과입니다. 어느 한 검사의 통과를 전체 출시 완료로 바꾸지 않습니다.

## 4. 개발 PC에서 설치 전에 검사

Node.js 24 이상에서 아래 명령을 실행합니다. `check-stack`은 임시 디렉터리·임시 DB·임시 포트를 사용하므로 설치된 서비스 데이터에 영향을 주지 않습니다.

```text
node tools/acceptance.mjs
# Python 검증 도구도 설치된 개발 환경
node tools/acceptance.mjs --with-python
```

빌드 → 파일·구문·전체 Node 회귀 → 두 정적 사이트와 두 API의 실제 HTTP → 기존 비공개 게임이 있는 운영 상태 → 선택형 Python 검사 순서로 실행합니다. `reports/acceptance.html`에 새 결과만 모으며 검사 도중 코드가 바뀌면 실패 처리합니다. `npm run check:all`도 같은 Node 검사 진입점입니다. HTTP 검사는 Node 개발 서버 결과이며 Windows IIS 자체의 실행 증거는 아닙니다.

Python 전체 스키마·파일·ZIP 검증을 사용하려면 `automation/README.md`를 참고하세요. Python은 선택 검증 도구에만 필요하고 IIS PoC 실행에는 필요하지 않습니다. `specs/openapi.yaml`과 `specs/retention_query.sql`은 제품 목표용 계약·PostgreSQL 예시이며, 실제 PoC API는 `docs/POC_API_CONTRACT.md`를 기준으로 합니다.

## 5. 게임 추가

각 게임은 `games/<id>/game.manifest.json`, `index.html`, 실행 코드, `assets/`를 갖습니다. 중앙 `catalog/games.json`의 `entries`에 다음 형태로 추가합니다.

```json
{"id":"new-puzzle","path":"games/new-puzzle","enabled":true}
```

manifest에는 한국어·영어 제목·소개·조작법, 태그, 입력, 화면 비율, 저장·SEO·미디어를 작성합니다. `node tools/build.mjs`가 검사하고, 공용 SDK는 게임별 vendor 폴더로 포함해 배포 게임을 독립 패키지로 만듭니다. 실제 카드·상세·사이트맵 반영은 **빌드와 IIS 배포가 성공한 뒤**입니다.

소스에서 폴더·목록을 바꾼 다음 `Install-IIS.ps1`을 같은 설치 경로·포트로 다시 실행하면 새 release로 배포합니다. 기존 설정·사용자 DB는 유지합니다. 새 release 전환이 실패하면 이전 release와 설정 복구를 시도합니다. 운영자 비공개 설정은 별도 DB에 남아 있으므로 catalog를 다시 빌드했다고 강제로 공개되지 않습니다.

현재 8개 게임의 실제 규칙·저장 범위는 `docs/POC_GAMES.md`에 있습니다. 여러 스테이지·상점·랭킹 등 제품 계획의 모든 확장 기능을 구현한 버전은 아닙니다.

## 6. Google 로그인

Google 로그인을 가장하려고 로컬 가짜 계정을 만들지 않습니다. OAuth client가 없으면 설정 필요 상태로 표시하고 게스트 플레이를 제공합니다.

1. Google Cloud에서 웹 애플리케이션 OAuth client를 만듭니다.
2. 호스트 PC의 localhost 검증을 위해 `http://localhost:8090/api/auth/google/callback`을 정확히 등록합니다.
3. 아래 스크립트로 client ID를 지정하고 client secret은 숨겨진 입력으로 넣습니다.
4. 사용자 화면도 `http://localhost:8080`에서 열어 로그인합니다.

```powershell
.\scripts\Set-GoogleOAuth.ps1 -InstallRoot C:\PlayHubPoC -ClientId '<발급받은-client-id>'
```

client secret은 웹 루트 밖의 접근 제한된 config에 저장합니다. 다른 PC의 LAN IP 방문에서 localhost callback을 사용하면 다른 PC 자신으로 돌아가므로 지원하지 않습니다. **LAN 밖을 포함한 실제 Google 공유 로그인은 HTTPS의 등록 가능한 도메인·인증서·정확한 redirect URI 구성**을 별도로 해야 합니다. Google은 일반 웹 redirect에 HTTPS와 호스트 제한을 적용하며 localhost만 예외를 허용합니다.

공식 기준: <https://developers.google.com/identity/protocols/oauth2/web-server>

## 7. 관리자 사이트와 권한

관리자 화면은 사용자 사이트의 숨겨진 탭이 아니라 별도 물리 웹 루트·IIS 사이트·앱 풀입니다. API도 두 listener를 사용하며 public API에서 `/api/admin/*`는 제공하지 않습니다. 관리자 cookie와 CSRF, scrypt 비밀번호, Origin 검사, 로그인·공개 상태 변경 감사 기록을 사용합니다.

사용자와 관리자의 API는 같은 Node 프로세스와 SQLite를 사용합니다. 이것은 PoC의 운영 단순화를 위한 선택이며 독립된 OS 서비스나 별도 데이터베이스로 배포된 구조라는 뜻은 아닙니다. 런타임은 소규모 단일 호스트 검증용이고, 제품화 시 PostgreSQL·배포 작업자·운영 인증 체계로 확장합니다.

## 8. 데이터·복구·검색

- `C:\PlayHubPoC\data\platform.sqlite`: 사용자·세션·저장·이벤트·운영 기록. 웹 루트 밖에 있습니다.
- `C:\PlayHubPoC\config\local.json`: 비공개 서버 설정. client secret·관리자 해시는 사용자 사이트에 복사하지 않습니다.
- `scripts/Backup-Data.ps1`: 실행 중 SQLite 온라인 백업과 integrity_check, SHA-256 기록.
- `scripts/Restore-Data.ps1`: 백업 검증·API 중지·원본 별도 보존·DB 적용·실패 복구·재시작 점검. `-VerifyOnly`는 중지 없이 백업만 검사합니다.
- `scripts/Restart-API.ps1`: 설정 변경 뒤 API 재시작.
- `scripts/Restore-PreviousRelease.ps1`: 이전 애플리케이션과 설정 복원. DB를 과거 상태로 되돌리지는 않습니다.
- `scripts/Stop-IIS.ps1`: 두 사이트·API 중지. 파일과 저장 데이터를 지우지 않습니다.

진행 복원에는 두 종류가 있습니다. 사용자 화면의 저장 관리에서는 **한 게임의 보관 슬롯/이전 진행을 현재 저장으로 복원**합니다. 관리자 PowerShell의 데이터 복원은 **플랫폼 전체 DB를 선택한 백업 시점으로 되돌리므로 백업 이후의 저장과 지표가 현재 DB에서 사라집니다.** 교체 전 원본 파일은 보호된 `data\recovery`에 보존합니다. 적용 예와 중단 복구 절차는 `docs/INSTALLATION_AND_RECOVERY.md`를 참고하세요.

데이터 복원 후 Google·관리자 계정은 다시 로그인합니다. 현재 유효한 일반 게스트 세션은 백업에도 같은 미연결 게스트가 있을 때만 유지합니다. 이미 로그아웃한 과거 세션은 백업에서 되살리지 않습니다. 백업 이후 처음 만들어진 게스트나 손상된 현재 DB의 세션까지 자동 복구하는 기능은 아닙니다.

PoC의 게임 상세는 정적 HTML에 고유 제목·설명·조작법·canonical·OG·링크를 포함합니다. 기본 robots와 응답 헤더는 내부 PoC가 외부 검색에 색인되지 않도록 설정합니다. 검색 구조 검사와 실제 Search Console·검색 유입 성과 확인은 별도입니다.

## 9. 이번 제공물의 검증 상태

실제 수행 결과는 `reports/`와 `docs/VALIDATION_STATUS.md`에서 확인합니다. Node HTTP·SQLite·게임 규칙·계약 검사를 실행했고, Windows PowerShell·실제 IIS·실제 Google 계정·실브라우저 결과는 수행 여부를 따로 표시합니다. 자동 점검 스크립트를 제공한 것과 대상 환경에서 그 점검이 통과한 것을 혼동하지 않습니다.

HTTP LAN은 내부 PoC 환경입니다. 외부 서비스 공개 전에는 HTTPS·도메인 격리·검색 설정·운영 정책·부하·복구 검증을 제품 계획의 별도 게이트로 진행합니다.
