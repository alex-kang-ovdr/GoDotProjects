# 선택형 Windows/IIS 브라우저 검증

## 현재 검증 상태

**브라우저 E2E 상태는 `not_run`이며 통과를 주장하지 않습니다.** 이 파일을 작성한 환경에서는 Chromium이 AF_UNIX socket `EPERM` 오류로 실행되지 않는다는 기존 확인 결과가 있습니다. 브라우저 재시도나 우회를 하지 않았습니다. 작성한 JavaScript에 수행한 검사는 `node --check qa/browser.e2e.mjs` 구문 검사입니다. 아래 브라우저 검사는 Windows/IIS 설치 환경에서 별도로 실행해야 합니다. PowerShell 스크립트도 실제 Windows에서 실행하지 않았습니다.

`reports/browser-e2e.not-run.json`과 같은 이름의 HTML은 배포 시점의 **미실행 상태 안내**입니다. 실제 실행 보고서는 기본적으로 설치 폴더의 `reports/browser-e2e.json`과 `reports/browser-e2e.html`에 생성됩니다. 미실행 안내 파일은 실행 증거가 아닙니다.

## 준비 조건

- IIS 설치 스크립트로 사용자 사이트, 관리자 사이트, public/admin API가 실제 실행 중이어야 합니다.
- 설치 marker `C:\PlayHubPoC\installation.json`이 해당 release와 Node.js 경로를 가리켜야 합니다.
- Node.js 24 이상, 설치된 Microsoft Edge가 필요합니다. 기본 브라우저 channel은 `msedge`입니다.
- 기본 8개 게임이 모두 공개되어 있어야 기본 8종 전체 검사를 통과할 수 있습니다.
- 관리자 전체 검사는 설치 때 지정한 실제 관리자 비밀번호가 필요합니다. 비밀번호가 없으면 인증 후 검사를 `skip`으로 남기고 전체 상태를 `partial`로 표시합니다.

이 도구는 별도 QA 폴더의 `playwright@1.62.1` 개발 의존성만 사용합니다. API 런타임과 게임은 계속 외부 npm 의존성 없이 실행합니다. QA 의존성을 설치하지 않아도 본 서비스 실행에는 영향이 없습니다.

## Windows 실행

설치된 release의 `scripts` 또는 압축을 푼 패키지의 `scripts`에서 다음처럼 실행합니다.

```powershell
# 최초 1회: 선택형 QA 도구 설치 + 실제 Edge 검사 + 관리자 폼 검사
powershell.exe -NoProfile -File .\scripts\Test-Browser.ps1 `
  -InstallRoot C:\PlayHubPoC -InstallTools -WithAdmin

# 다음 실행: 이미 설치된 QA 도구 사용, Edge 창을 보면서 검사
powershell.exe -NoProfile -File .\scripts\Test-Browser.ps1 `
  -InstallRoot C:\PlayHubPoC -WithAdmin -Headed

# 관리자 자격증명 없이 사용자 및 무인증 경계만 검사
# 인증 후 검사 skip → 전체 상태 partial, 종료 코드 3
powershell.exe -NoProfile -File .\scripts\Test-Browser.ps1 `
  -InstallRoot C:\PlayHubPoC
```

`-InstallTools` 또는 별칭 `-install-tools`를 명시한 때만 `npm install --prefix <release>\qa --include=dev --no-audit --no-fund`를 실행합니다. 이 옵션은 인터넷에서 npm QA 패키지를 설치합니다. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`로 별도 브라우저 다운로드를 막고 설치된 Edge를 사용합니다. 도구가 없을 때 자동 설치하거나 다른 브라우저로 자동 재시도하지 않습니다.

관리자 비밀번호는 PowerShell의 보안 입력으로 받아 Node 프로세스의 stdin JSON에 전달합니다. 명령행 인수, 환경변수, 보고서에 넣지 않습니다. 스크립트에 비밀번호를 직접 적지 마세요. 스크립트는 marker의 `shareHost`와 사용자/API 포트로 공개 주소를 만들고, 관리자 사이트·API는 `127.0.0.1`과 marker의 포트로 접속합니다.

설치 marker와 설정의 접근 권한 때문에 관리자 사용자 권한이 필요할 수 있습니다. 브라우저 프로세스 자체에 권한 우회 플래그를 추가하지 않습니다.

## 브라우저 선택과 다른 환경

Windows에서 특정 실행 파일을 사용할 때:

```powershell
powershell.exe -NoProfile -File .\scripts\Test-Browser.ps1 `
  -InstallRoot C:\PlayHubPoC -WithAdmin `
  -BrowserExecutable 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
```

`-Channel`과 `-BrowserExecutable`은 함께 쓰지 않습니다. Node 실행기는 `PLAYHUB_BROWSER_CHANNEL` 또는 `PLAYHUB_BROWSER_EXECUTABLE` 환경변수도 지원하지만, **자격증명 환경변수는 지원하지 않습니다.** Windows 외 환경에는 명시적인 channel 또는 실행 파일 선택이 필요합니다. 실행 파일 또는 브라우저 배포물의 설치·호환성 확인은 해당 환경에서 수행합니다.

직접 Node 실행 예시는 관리자 인증 없는 부분 검사입니다.

```bash
printf '%s' '{}' | node qa/browser.e2e.mjs \
  --user http://localhost:8080 --admin http://127.0.0.1:8081 \
  --public-api http://localhost:8090 --admin-api http://127.0.0.1:8091 \
  --executable /absolute/path/to/compatible/browser \
  --report /absolute/path/to/reports/browser-e2e.json
```

Node 실행기의 유일한 관리자 자격증명 입력은 stdin의 `{"username":"...","password":"..."}` 객체입니다. 실제 비밀번호를 shell 명령행, 저장 파일, CI 로그에 적는 예시는 제공하지 않습니다. Windows에서는 위 PowerShell 보안 입력을 사용하세요.

## 검사 내용

| 영역 | 실제 실행 시 검사 |
|---|---|
| 문서 분리 | 사용자 검색/게임 문서와 관리자 로그인 문서가 다른 사이트인지 확인 |
| API 경계 | public의 관리자 경로 404, admin의 공개 경로 404, 미허용 Origin·누락 CSRF 403, 관리자 무인증 401 |
| 기본 8종 | 카드 클릭 → `/play/<id>/` → 실제 iframe → 시작 버튼 → 게임별 마우스/키보드 입력 |
| iframe | `sandbox="allow-scripts"`만 허용, `allow-same-origin` 없음, `no-referrer`, 예상 entry 경로 |
| 저장 | 게임 pause 후 실제 PUT 성공, 서버 저장 UI, 게스트 save revision 확인 |
| 저장 충돌·복원 | 두 번째 writer로 실제 412 발생 → 현재 탭 보관 → 보관 슬롯을 main으로 복원 → 이전 main 백업 재복원 |
| 재개 | 슬라이드 퍼즐 전체 reload 후 보드·이동 수·runId 유지, 이어서 플레이 후 저장 |
| 모바일 표본 | 390×844 viewport, 가로 넘침, iframe 너비, 숫자 퍼즐 터치 조작·저장 |
| 관리자 인증 | 실제 폼 입력·로그인, 로그인 후 비밀번호 필드 비움, logout 후 401 |
| 관리자 지표 | live/qa/demo 전환, KST 기간·게임 선택, 선택 게임 리텐션, QA·가상 구분과 변경 제한 |
| 게임 공개 상태 | memory-pairs를 잠시 비공개 → 사용자 목록·신규 실행 제외 → 원래 값으로 복원 |
| 실행 오류 | 문서의 처리되지 않은 JavaScript 오류 발생 여부; 오류 원문은 저장하지 않음 |

사용자 UI에는 `data-testid=game-card`와 `data-game-id`, `launch-game`, `game-frame`, `save-status`를 사용합니다. 기존 클래스/ID도 선택자 fallback으로 지원합니다. 게임 내부는 `#primary`, `#pause`, `#save-state`, `#board` 등의 실제 UI를 조작합니다. 관리자 인증은 실제 폼을 사용합니다. 충돌 검사는 같은 QA 게스트의 두 번째 writer로 정상 저장 API를 호출해 revision을 진행시킨 뒤, 실제 게임 조작에서 412와 복원 UI를 확인합니다. 새 익명 세션을 QA로 분류하는 API는 관리자·Google 인증 권한을 부여하지 않습니다.

## 보고서와 종료 코드

| 종료 코드 | 상태 | 의미 |
|---:|---|---|
| 0 | `passed` | 실행한 모든 검사 통과, skip/not_run 없음 |
| 1 | `failed` | 실제 수행한 검사 중 하나 이상 실패 |
| 2 | `not_run` | 입력·도구·브라우저 준비 문제 등으로 전체 검사 미실행 |
| 3 | `partial` | 일부 검사만 실행; 관리자 미입력 등으로 skip 있음 |

모든 상태에 `passed` boolean을 함께 기록합니다. `partial`과 `not_run`은 `passed:false`입니다. 도구 미설치, 브라우저 실행 실패, 연결 실패를 통과로 바꾸지 않습니다. 각 단계는 실제 결과를 기록하며 실패 이후 가능한 독립 단계도 수행합니다.

보고서는 JSON과 외부 자산 없는 HTML로만 저장합니다. **스크린샷, 비디오, trace, HAR, 브라우저 storageState, cookie, CSRF, 관리자 자격증명, 게임 저장 payload는 저장하지 않습니다.** Playwright 예외의 원문에는 입력 값이 포함될 수 있으므로 원문 메시지·stack 대신 제한된 오류 코드를 기록합니다. 보고서는 자동 업로드하지 않습니다.

## 실행 영향과 해석 한계

새 비영구 browser context를 사용하므로 기존 브라우저 프로필의 로그인이나 게임 기록을 가져오지 않습니다. 첫 페이지를 열기 전에 새 익명 세션을 서버에서 QA로 고정합니다. 테스트가 만든 게스트·노출·플레이·저장은 같은 SQLite에 QA로 분류되어 남으며 기본 실제 이용 지표에서 제외됩니다. 관리자 QA 탭에서 확인할 수 있습니다. 기존 0.1 버전에서 분류 없이 만든 QA 데이터는 자동 식별하지 못합니다. 관리자 검사는 게임 공개 상태를 잠시 변경하므로 사용자가 없는 PoC 확인 시간에 실행하세요. 공개 상태 복원에 실패하면 보고서 `BROWSER-ADMIN-RESTORE`가 실패로 남고 해당 게임을 관리자 화면에서 확인해야 합니다.

모바일 viewport 검사는 실제 휴대전화의 성능·발열·오디오·브라우저별 동작을 보장하지 않습니다. 실제 Google OAuth, 다른 LAN 단말 접속, 방화벽, IIS 설치 과정, 게임의 전체 규칙·완주를 대신하지 않습니다. 게임 핵심 규칙 테스트 및 `Test-IIS.ps1` HTTP 점검을 함께 사용하세요.
