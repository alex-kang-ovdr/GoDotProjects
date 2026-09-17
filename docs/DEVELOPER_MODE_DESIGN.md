# 개발자 모드 소프트웨어 설계

## 구성

- `Main.gd`: `OS.get_cmdline_args()`와 `OS.get_cmdline_user_args()`를 합쳐 개발자 인자를 감지한다. `developer_mode_active` 동안 `_physics_process`를 조기 반환한다.
- `DeveloperModeOverlay.gd`: CanvasLayer 100의 메뉴/편집 패널. 모드 ID와 버튼 신호를 관리하며 CSV·내러티브 검증 목록을 읽기 전용으로 표시한다.
- `Balance.gd` / `part_tuning.csv`: 파트 편집 모드의 SSOT. 편집 UI가 직접 게임 상태를 변경하지 않는다.
- `NarrativeData.gd`: 이벤트 및 퀘스트 편집 모드의 키 목록 공급원이다.

## 상태 전이

`MENU → PART_EDITOR | SHIP_ASSEMBLY | NARRATIVE_EDITOR → MENU` 또는 `MENU → TEST_PILOT → PLAY`.
오버레이는 `mode_selected("test_pilot")` 신호만 Main에 전달하며, 나머지 모드는 오버레이 내부에서 상태를 전환한다.

## 안전성/성능

개발자 UI는 CanvasLayer 한 개와 목록 컨트롤만 생성한다. 메뉴 중 물리·AI·스폰을 정지해 편집 화면에서 불필요한 시뮬레이션 비용과 상태 변이를 차단한다. 런타임 CSV는 기존 로더/패키징 경로를 그대로 사용한다.

## 자동화 수용 기준

`developer_mode_test.gd`가 네 모드 메타데이터, 편집 패널 진입, 테스트 파일럿 선택 신호를 검증한다. 인자 감지는 헤드리스 `-- --edit-mode` 실행으로 구문·초기화 오류가 없는지 확인한다.
