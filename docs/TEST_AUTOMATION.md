# 공용 테스트 프레임워크

`Run-CaptainSalvage-Tests.bat`은 공용 `game-test-framework`의 Godot 어댑터를 호출한다. 기본 위치는 `D:\Github\GoDotProjects-worktrees\game-test-framework`이며, 다른 위치는 `GAME_TEST_FRAMEWORK_ROOT`로 지정한다.

## 자동 스위트

- `runtime`: `Godot/tests/test_runner.gd`를 `--headless`로 실행한다. 질량, 방어막, 탄약 타입/소비, 장착, 연결 분리, 탄약고 병합을 검증한다.

## 수동 RHI

메뉴의 `M`에서 `d3d12`, `vulkan`, `opengl3` 중 하나를 선택해 `Main.tscn`을 보이는 Godot 창으로 연다. 이 경로는 자동 성공 판정이 아니라 실제 입력·도트 표면·소켓 회전·방어막 가독성 확인용이다.

직접 헤드리스 실행:

```bat
set GODOT_BIN=D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe
%GODOT_BIN% --headless --path Godot --script res://tests/test_runner.gd
```
