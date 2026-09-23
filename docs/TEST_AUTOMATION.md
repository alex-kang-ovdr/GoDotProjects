# 공용 테스트 프레임워크

`Run-CaptainSalvage-Tests.bat`은 공용 `game-test-framework`의 Godot 어댑터를 호출한다. 기본 위치는 `D:\Github\GoDotProjects-worktrees\game-test-framework`이며, 다른 위치는 `GAME_TEST_FRAMEWORK_ROOT`로 지정한다.

## 자동 스위트

- `scenario-graph`: `Godot/tests/scenario_graph_test.gd`에서 데이터 스키마·잘못된 입력·분기 합류·전체 목표 도달을 검증한다. BAT 메뉴/직접 인자 `S` 또는 `--suite scenario-graph`로 실행한다. `7` 자동 테스트와 `E` 수동 편집 모드는 유지한다.
- `runtime`: `Godot/tests/test_runner.gd`를 `--headless`로 실행한다. 질량, 방어막, 탄약 타입/소비, 장착, 연결 분리, 탄약고 병합을 검증한다.
- `physics`: `Godot/tests/physics_smoke.gd`를 `--headless`로 실행한다. 실제 `RigidBody2D`의 추력 가속과 웹 기준 지수 감쇠를 검증한다.
- `narrative`: `Godot/tests/narrative_test.gd`를 `--headless`로 실행한다. 출항 선택지, 튜토리얼 이동 임계값, 정거장 이벤트 문구, 선택형 대화 큐 전환과 비선택 대화 닫기를 검증한다.
- `npc-ai`: `Godot/tests/npc_ai_test.gd`를 `--headless`로 실행한다. 로밍 기본 상태, 레이더형 선제 공격 프로필, 피격 반격, 퀘스트/경고 대화 상태 및 선택 액션을 검증한다.
- `grapple`: `Godot/tests/grapple_smoke.gd`를 `--headless`로 실행한다. 갈고리 비행 완료, 실제 `PinJoint2D` 체인 링크 생성, 링크 충돌 비활성을 검증한다.

## 수동 RHI

2026-09-23 추가: `8`은 `core-gameplay` 통합 회귀, `9`는 `flight-metrics` 실제 비행 계측이다. `7` 개발자 모드 자동 테스트와 `E` 수동 실행은 유지한다. BAT는 ASCII 메뉴·UTF-8 without BOM·CRLF로 관리한다.

`core-gameplay`는 CoM/UID/카메라 생존/모달 차단/한글 폰트/조립·병합/탄환 궤적/평화 NPC/정거장·보스·완료를 검사한다. `flight-metrics`는 60Hz 12초 분량의 물리 프레임을 진행하고 속력·각도·도착 잔차를 출력한다.

프로젝트 BAT 메뉴의 `E`에서 `d3d12`, `vulkan`, `opengl3` 중 하나를 선택해 개발자 모드의 `Main.tscn`을 보이는 Godot 창으로 연다. `7`은 기존 `developer-mode` 자동 테스트를 그대로 유지한다. 이 경로는 자동 성공 판정이 아니라 실제 파트 편집 UI·입력·도트 표면·소켓 회전·방어막 가독성 확인용이다.

```bat
Run-CaptainSalvage-Tests.bat
선택: E
RHI: 2
```

직접 헤드리스 실행:

```bat
set GODOT_BIN=D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe
%GODOT_BIN% --headless --path Godot --script res://tests/test_runner.gd
```

## 배포본 시나리오 자동 검증 (M1)

같은 `scenario_graph_cases.gd`를 에디터용 SceneTree 래퍼와 실제 PC/Web 배포본에서 호출한다. 게임 화면을 수동 조작하지 않는다.

- PC: `Build/PC/CaptainSalvage.exe --headless --log-file <절대 로그 경로> -- --automation-scenario-graph`. 테스트 종료 코드와 `[PASS] scenario-graph`를 함께 확인한다.
- Web: `Build-Web.bat`은 `Tools/Testing/web-tests.html`도 빌드 폴더에 복사한다. 프로젝트 루트에서 `py -m http.server 8765 --bind 127.0.0.1 --directory Build/Web` 실행 후 `http://127.0.0.1:8765/web-tests.html`을 연다. 페이지가 자동 실행하며 모든 단언 로그, `PASS`/`FAIL`, `WEB_EXIT_CODE`를 표시한다. 60초 안에 완료하지 않으면 실패한다.
- 웹 하네스는 종료 코드 0, 성공 marker, 오류 출력 없음이 모두 충족돼야 PASS다. 데이터 테스트에는 `Dummy` 오디오 드라이버를 사용하며 오디오·렌더 가독성 테스트를 대신하지 않는다.
- 기본 배포 템플릿에서는 `--script`가 무시되므로 명시적으로 허용한 `--automation-scenario-graph`만 Main에서 처리한다. 임의 경로 실행이나 엔진 보안 설정 변경은 없다. [Godot 명령줄 문서](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html)의 extended 인자 지원 범위를 참고한다.
- 데이터 수치를 JS에 복제하지 않는다. 정상 실행/`--edit-mode` 경로와 테스트 실행 경로를 분리하고 테스트에서는 월드를 생성하지 않는다.
