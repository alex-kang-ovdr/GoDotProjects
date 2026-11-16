# GamePlayHub 통합 검증

검증일: 2026-11-16. 작업 위치: `D:\Github\UnrealSamples-worktrees\GamePlayHub`. Windows, Node.js v24.22.1, 설치된 Chrome을 사용했다. 기존 계정·저장 데이터와 실행 중인 서버를 변경하지 않도록 브라우저 검사는 임시 데이터베이스와 별도 포트에서 실행했다.

## 확인한 결과

- 플랫폼 게임 21개: 새 게임 13개 우선 노출, 기존 퍼즐 8개. 요청한 제외 게임 8개는 로컬 원본을 유지하고 플랫폼에서 제외했다.
- 활성 게임 21개의 제목·소개·조작·규칙에 8개 언어 값이 모두 존재한다. 번역 사전은 공통 게임 97개, 플랫폼 434개, 추가 게임 그룹별 719/1178/674개의 키를 포함한다. 키 수는 번역의 완전성을 뜻하지 않는다.
- `qa/webgames-browser.mjs`: 포털, 게임 21개, 관리자 로그인 총 23개 검사 통과. 모든 게임이 SDK ready를 보고했으며, 영어 자동 적용 후 힌디어로 바꿔도 같은 iframe 실행 인스턴스를 유지했다. 수집된 처리되지 않은 JavaScript 예외는 0개다.
- 브라우저에서 찜의 데이터베이스 저장, 플랫폼 8개 언어 선택, 390×844 모바일 가로 넘침 없음, Match3 게임의 실제 시작·일시정지 후 서버 저장을 확인했다. 데스크톱·모바일 화면을 캡처해 확인했다.
- 찜/언어 HTTP, 포털 계약/저장, 기본 게임 규칙, 백업 호환성, 관리자 지표, 언어 브라우저 검사, WebGames 가져오기 집중 테스트 50개 통과, 실패/건너뜀 0개.
- 포터블 런타임·패키징·Windows ACL·이미지 자산 검사 26개 통과, 실패 0개, Windows 심볼릭 링크 권한 관련 2개 건너뜀. 두 프로세스의 동시 재시작 잠금 충돌도 검증했다.
- 최종 Windows x64 EXE를 실제 실행한 `--package-check`와 `--self-test --self-test-ports 28080,28081,28090,28091` 통과. 별도 임시 인스턴스의 HTTP 검사 54개 통과, 실패 0개, 적용 대상이 아닌 환경 검사 3개 건너뜀. 이 검사는 실제 Rebex 대신 테스트용 정적 서버를 사용한다.
- 포트 충돌은 지정 포트와 PID를 표시한다. 확인된 PlayHub 서버에만 Y/N을 묻는다. Y는 같은 포트 재시도, N/Enter·비대화 실행은 기존 서버를 유지하고 종료한다. 다른 프로그램과 PID 재사용은 강제 종료하지 않는다. 강제 종료 분기는 모의 프로세스로 검증했으며 실행 중인 사용자 서버는 종료하지 않았다.
- 미리보기 사전 점검은 실제 LAN/공인 IP와 포트를 포함한 HTML 접속 목록 및 `.url` 바로가기를 생성했다. 공인 IP 조회 실패는 로컬 실행을 막지 않는다.

## 재현 및 증거

소스 폴더에서 Node.js 24로 실행한다.

```powershell
node tools/sync-webgames.mjs
node --test tests/wishlist.http.test.mjs tests/games.portal-contract.test.mjs tests/games.portal-save-flow.test.mjs tests/games.rules.test.mjs tests/preferences.backup.test.mjs tests/admin.metrics.test.mjs tests/localization.browser.test.mjs tests/webgames.import.test.mjs
node qa/webgames-browser.mjs
node --test tests/portable.runtime.test.mjs tests/portable.packaging.test.mjs tests/portable.acl.windows.test.mjs tests/smoke.assets.test.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools/preview.ps1 -CheckOnly
```

환경별 로그·스크린샷은 Git에서 제외한 `reports/local-final-tests.log`, `reports/local-browser-integration.json`, `reports/local-portal-desktop.png`, `reports/local-portal-mobile.png`, `reports/local-admin-desktop.png`, `reports/local-game-hindi.png`에 저장했다.

## 범위와 남은 확인

전체 기존 테스트 모음, 21개 게임의 완주와 모든 이벤트 문구, 실제 휴대전화, 다른 LAN 단말, 인터넷 외부 접근은 검증하지 않았다. 게임 고유명사와 아직 사전에 없는 문구는 원문으로 남는다. 공인 IP 링크 생성은 포트 전달·방화벽·Origin 설정이나 외부 접근 성공을 보장하지 않는다. 기존 사용자 서버를 강제로 종료하는 실제 Y 입력은 수행하지 않았다.

포터블 로컬 빌드는 `source/.local-build/PlayHub.exe`에 저장하고 Git에서 제외한다. 기존 추적 중인 배포 EXE와 구분하며, 루트의 `Run_PlayHub_Portable.cmd`가 새 빌드를 실행한다. 미리보기는 `Run_PlayHub_Preview.cmd`를 사용한다.

최종 EXE: 125,721,088바이트, SHA-256 `b029e46674251b929696d796c8f9de8553da6355221ecfd84ba53be08c185a07`. 번들 336개 파일. 빌드 매니페스트는 `.local-build/PlayHub.exe.build.json`, 자체 검사 로그는 `reports/local-exe-selftest.log`, 포터블 테스트 로그는 `reports/local-portable-tests.log`에 있다. 실제 Rebex의 최종 EXE 실행 및 외부 네트워크 접근은 별도 확인 대상이다.
