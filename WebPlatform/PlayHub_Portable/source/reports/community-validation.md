# 게임별 커뮤니티 검증

검증일: 2026-11-16. Windows, Node.js v24.22.1, 설치된 Chrome. 작업 위치는 `D:\Github\UnrealSamples-worktrees\GamePlayHub`이며 이전 `d3c7d45e`의 Rebex 종료 수정은 보존했다.

## 기능과 저장 방식

- 게임 상세 화면에 댓글·개선 제안 필터, 작성, 수정·삭제, 더 보기, 제안 공감/취소, 사유를 입력하는 신고를 추가했다.
- 댓글 본문은 1~2,000자, 제안 제목은 1~100자, 신고 사유는 1~500자다. 공백만 있는 값과 잘못된 유형·필드는 서버에서 거부한다.
- 기존 세션·CSRF 검증을 사용하며 익명 작성자는 게스트로 전환한다. 작성자만 수정·삭제할 수 있다. 계정 병합은 작성권을 이전하고 중복 공감·신고를 정리한다.
- `community_items`, `community_votes`, `community_reports`를 기존 DB에 추가한다. 기존 저장·회원 자료를 초기화하지 않는다. 백업 검증기는 새 테이블과 커뮤니티 도입 전 백업을 모두 처리한다.
- 관리자 화면에서 게임·종류·공개 여부로 조회하고 최근 신고 사유 10개와 전체 신고 수를 확인한다. 숨김·복원, 제안의 접수됨/반영 예정/반영 완료/보류 상태 변경은 운영 감사 기록에 남는다.
- 공개 API는 숨긴 글과 비공개 게임의 글을 노출하지 않는다. 글 조회에 작성자 내부 ID·신고자·신고 사유를 포함하지 않는다. 쓰기에는 IP·세션·사용자 단위 횟수 제한이 있다.
- HTML 실행 없이 `textContent`로 사용자 글을 표시한다. 사용자 제목·본문·표시 이름은 원문을 유지한다. 커뮤니티 안내·상태·입력 안내는 기존 8개 언어를 지원한다.

## 실제 검증 결과

1. 커뮤니티 HTTP 회귀 7개를 포함한 서버/찜/백업/복원 모음: 80개 통과, 실패 0개, Windows 심볼릭 링크 권한 관련 1개 건너뜀. 세션 만료 중인 요청, 작성권·게임별 분리, 숨김 글의 변경 경로, 중복 공감·신고, 관리자 권한, 계정 병합, 백업 내용을 단언했다.
2. 기존 포털 계약·저장·게임 규칙·관리자 지표·언어·가져오기 집중 회귀: 50개 통과, 실패 0개. 위 서버 모음과 일부 테스트가 겹치므로 단순 합산하지 않는다.
3. `qa/community-browser.mjs`: 작성자·독자·관리자 시나리오 3개 통과, 처리되지 않은 JavaScript 예외 0개. 실제 UI로 댓글 작성/수정/삭제, 제안과 공감, 새 게스트의 신고, 관리자 숨김/복원/상태 변경을 확인했다. 사용자 글의 HTML 비실행·원문 보존, 8개 언어 입력 안내, 느린 요청 중 필터 전환 및 초안 유지, 게임 iframe 유지, 390px 모바일 가로 넘침 없음도 단언했다.
4. `qa/webgames-browser.mjs`: 포털·게임 21개·관리자 총 23개 검사 통과, 처리되지 않은 JavaScript 예외 0개. 별도 임시 DB와 포트에서 실행했으며 사용자의 실행 중인 서버를 종료하지 않았다.
5. 커뮤니티 사용자 모바일 화면과 관리자 화면 스크린샷을 직접 확인했다. 새 테스트 도중 발견한 커뮤니티/게임 장르 필터 이벤트 충돌과 요청 경합, 입력 안내의 언어 미적용을 수정하고 같은 시나리오로 재검증했다.
6. 포터블 패키징 회귀 11개 통과, Windows 심볼릭 링크 관련 2개 건너뜀. EXE 교체 중 발생한 일시적인 Windows `EPERM`에는 기존 빌드 도구의 제한된 재시도 함수를 적용했다. 새 EXE의 실제 `--package-check` 및 격리 `--self-test`를 통과했으며 HTTP 검사 54개 통과/실패 0개/환경 관련 3개 건너뜀이었다. 자체 검사는 실제 Rebex 대신 테스트용 정적 서버를 사용한다.

## 재현

소스 폴더에서 Node.js 24 이상으로 실행한다.

```powershell
node tools/sync-webgames.mjs
node --test tests/community.http.test.mjs tests/wishlist.http.test.mjs tests/preferences.backup.test.mjs tests/backend.http.test.mjs tests/restore.data.test.mjs tests/restore.operations.test.mjs
node qa/community-browser.mjs
node qa/webgames-browser.mjs
```

환경별 자료는 Git에서 제외한 `reports/local-community-browser.json`, `reports/local-community-regression.log`, `reports/local-community-desktop.png`, `reports/local-community-mobile.png`, `reports/local-community-admin.png`에 있다. 서버 80개 검사의 요약은 이 문서에 기록했고 원출력은 작업 도구 기록에 있다.

새 로컬 포터블 EXE는 `.local-build/PlayHub.exe`이며 루트 `Run_PlayHub_Portable.cmd`로 실행한다. 크기는 125,763,584바이트, SHA-256은 `d6756cf729673e9092cb181621954fb8d381dfae55e1856910b53e9cb398fd81`, 번들은 339개 파일이다. 실행 파일은 Git에서 제외했다. 실제 EXE 검사 로그는 `reports/local-community-package-check.log`, `reports/local-community-exe-selftest.log`에 저장했다.

## 적용과 한계

`Run_PlayHub_Preview.cmd`를 재실행하면 소스 수정분으로 페이지를 생성한다. 실행 중인 기존 PlayHub가 포트를 점유하면 기존 안내대로 Y/N을 선택한다. 게스트 쿠키를 지우면 이전 글의 작성권을 복구할 수 없다. 실시간 채팅, 대댓글, 첨부파일, 외부 알림과 실제 외부 네트워크 접속은 이번 검증 범위에 포함하지 않았다. 전체 저장소 테스트 모음을 통과했다고 주장하지 않는다.
