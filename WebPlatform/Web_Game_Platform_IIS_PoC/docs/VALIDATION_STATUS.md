# 0.2.0 제공 시점의 실제 검증 상태

기준일: **2026-11-16**. 실행 환경: **Linux, Node.js 24.22.1**. 최종 검사 명령은 `node tools/acceptance.mjs --with-python`이며, 완료 시각은 **2026-11-16 03:24:31 UTC**다.

최종 통합 결과는 **`code_verified_environment_pending`**, `coreVerified:true`다. 수행한 코드 검증 단계 7개가 모두 통과했다. 이 결과는 사용자 PC의 Windows IIS 설치·브라우저·실제 Google 인증이 끝났다는 뜻이 아니다. 실행한 범위와 별도 환경 확인을 아래와 같이 구분한다.

## 1. 이번 최종 실행 결과

| 검사 범위 | 실제 결과 | 증거 |
|---|---|---|
| 전체 Node 회귀 | **109개 통과, 실패 0** | `reports/verification.json`, Node 테스트 6개 파일 |
| 파일·구문·SEO·배포 경계 | **19 pass / 0 fail / 2 skip**. 위 Node 회귀 포함 | `reports/verification.json` / HTML |
| 기본 8종 공개 상태의 HTTP 흐름 | **41 pass / 0 fail / 3 skip** | `reports/stack-smoke.json` / HTML |
| 기존 비공개 게임이 있는 HTTP 흐름 | **41 pass / 0 fail / 3 skip** | `reports/disabled-game-smoke.json` / HTML |
| JSON Schema·카탈로그·자산 계약 | **79 pass / 0 fail / 2 skip** | `reports/python-static.json` / HTML / XML |
| Python 검사기 회귀 | **76개 통과, 실패 0** | `reports/python-regression.json` |
| 복구·설정·게임 추가 회귀 | **18 pass / 0 fail / Windows not_run 1**. 위 Node 109개에 포함 | `reports/restore-validation.json` / HTML / TAP |
| 최종 코드 지문 | 시작·종료 시점의 **91개 소스 동일** | `reports/acceptance.json` / HTML |

검사 단위가 다르고 일부 회귀는 상위 검사에 포함된다. 위 숫자를 더해 전체 테스트 개수로 표시하지 않는다. 최종 통합 보고서의 7 pass는 검사 단계 수이며, HTTP의 skip이나 환경 미실행을 모두 통과로 바꾼 값이 아니다.

최종 소스 SHA-256:

```text
c0b45667d2f33152b6a71145f9801acca52acfbdc9989373e9667d85c62d77ee
```

지문은 런타임·화면·게임·목록·설치 도구·테스트 등 지정된 소스를 대상으로 한다. PDF·HTML 가이드·검사 결과·ZIP 전체의 해시와는 다른 값이다. ZIP 내부 파일의 개별 SHA-256은 `CONTENTS.sha256`에 있다.

## 2. 109개 Node 회귀의 구성

| 범위 | 개수 | 확인한 핵심 동작 |
|---|---:|---|
| 백엔드 HTTP·SQLite·정책 | 54 | 세션·CSRF·권한·Google 토큰 경계, 저장 충돌·멱등·슬롯 복구·제거, QA 분리, 날짜·게임 필터, 리텐션, 세션 수명 |
| 8게임 규칙 | 15 | 기본 보드·입력·완료·충돌·저장 구조의 핵심 규칙 |
| 포털·관리자 순수 계약 | 8 | 지표 필터·선택 리텐션·복구 요청·계정 경계 |
| 실제 포털 저장·세션 함수 | 14 | 412 이후 최신 탭 진행, 같은 키 재시도, 계정 전이·늦은 응답 차단, 보관·복원·제거 |
| 데이터 복구·운영 | 18 | 실제 SQLite 교체·실패·강제 종료·복구, 게스트 이어하기, 설정 보존, 새 게임 자동 등록 |

포털 함수 검사는 실제 `web/user/app.js` 함수를 VM에서 실행한다. 브라우저 레이아웃·iframe 렌더링·터치·네이티브 dialog 검증으로 표시하지 않는다. Google 검사는 제어된 전송과 테스트 RSA 서명을 사용한다. 실제 Google 계정 선택·동의 화면은 수행하지 않았다.

### D30 검증에서 확인한 사항

최초 게스트 플레이 후 과거 30일 세션 만료 시각을 지난 D30으로 서버 시간을 이동하고, 같은 주체와 저장을 다시 읽었다. 재방문 활성 플레이와 코호트 성숙 이후 **D30 retained=1**을 확인했다. 익명/게스트 90일, 첫 승격·재방문 갱신, 정확한 만료 경계, 로그아웃 비부활, Google 30일·관리자 8시간 수명도 확인했다.

이는 시간 제어 회귀다. 실제 서비스에서 30일간 이용자를 관측한 성과 자료는 아니다. 실제 이용자의 D1/D7/D30은 코호트가 성숙한 뒤 해당 화면에서 확인한다.

## 3. 실제 HTTP 통합에서 확인한 사항

두 정적 사이트와 두 API를 임시 폴더·DB·포트로 실제 시작했다. 사용자 목록·8게임 자산·무가입 guest·조건부 저장·슬롯 목록·복원·이전 백업 재복원·가시 노출·중복 제거·클릭·ready·실시간 10초 heartbeat·관리자 로그인·기간/게임/QA 필터·공개 상태 변경·상태 복구·로그아웃을 HTTP로 확인했다.

QA 분리 결과는 기본 시나리오에서 **live 이벤트 0건·live play session 0건, QA 이벤트 15건·QA play session 1건**이었다. 별도 시나리오에서는 기존 `memory-pairs` 비공개 상태가 검사 후에도 유지됐다. Node 개발 서버에서의 결과이며 실제 IIS MIME·ACL·사이트 설정을 관측한 결과는 아니다.

HTTP 보고서의 세 skip은 실제 브라우저, 실제 Google, 실제 IIS 설치 증거다. `Test-PoC.ps1`은 현장에서 정확히 이 세 항목의 원래 skip을 보존한 채 각각 브라우저 검사·Windows 실제 관측·Google 수동 확인으로 연결한다. 다른 skip과 필수 HTTP 검사 누락은 완료로 처리하지 않는다.

## 4. 데이터 복구와 운영 검사

복구 테스트는 실제 SQLite DB와 HTTP, 별도 자식 프로세스를 사용했다. 체크섬 불일치·다른 DB·미래 스키마·트리거·실행 중 포트·writer lock을 거부하고, 교체 실패 시 원본 복원, 프로세스 강제 종료 후 maintenance lock 복구를 확인했다.

현재 유효한 게스트의 같은 쿠키로 복구된 진행을 이어가는 동작을 확인했다. 과거 백업의 로그아웃 세션은 되살리지 않았다. 0.1 스키마에서 현재 스키마 1로의 마이그레이션과 `save_slot_versions` 보존을 확인했다.

설정 재실행의 포트·Origin·Google·관리자 해시 보존과, 임시 아홉 번째 게임을 폴더·manifest·목록에만 추가한 뒤 API·정적 상세·사이트맵·vendor 자산이 생성되는 것을 확인했다. 제공 게임 수는 8종이다.

## 5. 아직 수행하지 않은 대상 환경 검사

| 대상 | 상태 | 실행 방법 |
|---|---|---|
| 실제 Windows PowerShell 5.1 설치·갱신 | `not_run` | 관리자 권한 `Install.cmd` 또는 `Install-IIS.ps1` |
| 실제 IIS 사이트·바인딩·ACL·작업 | `not_run` | 설치 PC에서 `Validate.cmd` |
| 실제 Edge·8게임 입력·충돌 복구 UI | `not_run` | `Validate.cmd -InstallTools` 또는 `Test-Browser.ps1 -WithAdmin` |
| 실제 Google 계정·콜백·기록 병합 | `not_run` | OAuth client 설정 후 호스트 localhost에서 수동 확인 |
| 두 번째 LAN PC의 접속·관리자 차단 | `not_run` | 다른 PC의 브라우저에서 서버 IP 주소 확인 |
| Windows 재부팅·작업 자동 시작 | `not_run` | 재부팅 후 사이트·저장 재개 확인 |
| Windows 데이터 복원·NTFS 권한·이전 release 복구 | `not_run` | 운영 가이드의 대상 환경 복구 시나리오 |
| 실제 이용자의 D1/D7/D30 성과 | 데이터와 기간 필요 | 실제 코호트 성숙 후 관측 |

작성 환경에서는 브라우저 프로세스 시작 제한이 있었고 재시도나 우회를 하지 않았다. `qa/browser.e2e.mjs`는 JavaScript 구문만 검증했다. 배포 시점의 브라우저 안내는 `qa/reports/browser-e2e.not-run.json` / HTML에 **`not_run`, `passed:false`**로 있다. 실제 Windows에서 실행하면 새 결과를 설치 폴더의 reports에 만든다.

## 6. 제공물의 판정과 해석

**기능 코드와 작성 환경에서 실행 가능한 통합 검증을 완료했다. 실제 Windows/IIS 서비스 전체 수용은 현장 결과가 필요하다.** `Test-PoC.ps1`이 자동 검사에 성공해도 `automated_passed_manual_pending`, `overallFullyAccepted:false`로 표시한다. Google·두 번째 PC·재부팅은 자동 서명하지 않는다.

0.2의 HTTP·브라우저 점검 기록은 QA로 분리되어 기본 실제 지표에서 제외된다. 0.1에서 분류 없이 만든 과거 검증 기록은 소급 분리하지 않는다. 가상 예제는 read-only 계산 자료이며 실제 이용 성과가 아니다.

기본 PoC는 내부 LAN HTTP와 noindex다. 정적 SEO 구조가 있다는 사실은 검색 엔진에 공개되거나 색인됐다는 뜻이 아니다. `specs`의 OpenAPI·PostgreSQL SQL은 제품 목표이며 현행 실행 계약은 `docs/POC_API_CONTRACT.md`를 사용한다.
