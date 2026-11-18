# Offline Edition 28.1 검증 실행

## 실제 실행한 검사

Node VM에서 `index.html`의 실제 인라인 게임 스크립트를 실행한다. DOM·Canvas·Storage·WebGL·파일 다운로드는 대역이다. 게임 코드를 가짜 전투나 가짜 저장으로 바꾸지 않는다. 이번 결과는 `QA_REPORT.md`와 `_v28_1.json` 결과 파일을 확인한다.

프로젝트 루트에서 실행한다. 이번 실행 환경은 Node.js v24.22.1이다.

```sh
python3 build.py
node --check tests/runtime_check.js
node tests/run_engine_cases.cjs . tests/engine_results_v28_1.json tests/cases_v27.js tests/cases_combat_v28.js tests/cases_encounters_v28.js tests/cases_persistence_v28.js tests/cases_feedback_v28.js
node tests/offline_runtime.cjs
node tests/normal_combat_smoke.cjs . tests/normal_combat_results_v28_1.json
node tests/verify_legacy_v26.cjs .
```

**플레이에는 Python·Node·npm이 필요 없다.** Python은 소스 수정 후 단일 HTML을 다시 만드는 도구이며, Node는 검사 도구다. 테스트에 별도 npm 패키지가 필요하지 않다. 실패 시 검사 프로세스는 실패 종료한다. 결과에는 검사한 HTML SHA256을 기록한다.

## 오프라인 검사

`offline_runtime.cjs`는 생성 HTML의 실제 이벤트 처리기를 실행한다. 부팅 전에 localStorage 대역을 주입하고, 네트워크 API를 모두 예외 대역으로 차단한다. 시작 선택 전 저장 금지, 직전 정상 저장 백업, 손상 저장 보존, 저장 용량/접근 거부, JSON 파일·텍스트 가져오기와 다운로드 대체 경로, 한국어 물리 키 처리, 탭 숨김·페이지 이탈 처리, WebGL 실패와 프레임 오류를 검사한다.

대역은 브라우저 구현이나 레이아웃 엔진이 아니다. 실제 파일 다운로드 완료, 네이티브 대화상자 포커스, HTML 파일별 영속 저장, GPU 렌더 결과, 오디오, 휴대폰 화면을 검증하지 않는다.

## 브라우저 검사 준비 — 이번에는 미실행

`regression.py`는 Playwright와 Chromium을 사용할 수 있는 환경에서 시스템 케이스를 실행하기 위한 스크립트다.

```sh
python3 tests/regression.py
```

`DD_HEADED=1`이면 창을 띄우며 `BROWSER_EXECUTABLE`로 실행 경로를 지정한다. 이 검사도 페이지에 HTML을 넣는 시스템 검사이므로 file:// 직접 열기와 사용자의 OS 파일 동작을 대신하지 않는다. 현재 제공 환경의 제한을 우회하기 위해 이 스크립트를 실행하지 않았다.

`browser_ui.py`와 `smoke.py`는 이전 UI 검사 자료다. 28.1 시작 메뉴와 OS 파일 동작은 추가 대응 및 실행이 필요하며, 이번 통과 증거로 사용하지 않는다. 이전 스크린샷/브라우저 결과는 새 패키지 증거로 동봉하지 않는다.

## 진행·밸런스 검사 제한

기존 회귀의 5액트 진행은 직접 지역 진입과 진단용 큰 피해로 실제 퀘스트·보스·봉인 핸들러를 검사한다. 정상 이동과 일반 피해로 캠페인을 완주한 검사가 아니다. 별도 초기 전투 7직업 검사는 시작 능력치·장비로 고립한 적 1마리와 싸운 짧은 검사다. 군집 전투와 장기 밸런스는 별도 확인 항목이다.
