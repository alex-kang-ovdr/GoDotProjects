# Captain Salvage

Captain Forever의 전투 중 회수·재조립이라는 아이디어에서 영감을 받은 **독자적인** Godot 게임 프로토타입입니다. 원작과 Cosmoteer의 코드, 에셋, UI, 음원, 명칭 또는 콘텐츠를 포함하지 않습니다.

## GDScript SSOT

실행 규칙과 게임 데이터는 모두 [Godot](Godot/)의 GDScript에 있습니다. Windows, Android, Web은 같은 씬·같은 GDScript를 내보내는 방식이며, HTML Canvas·Electron·Capacitor 구현은 제거했습니다.

- [밸런스](Godot/scripts/balance.gd) — 질량, 무기, 탄약, 방어막 수치
- [시각 튜닝](Godot/scripts/visual_tuning.gd) — 색, 투명도, 흔들림, 배경 밀도
- [이식 계획](docs/GDSCRIPT_SSOT_MIGRATION.md) — 완료 범위와 후속 마일스톤
- [Cosmoteer 시각 분석](References/COSMOTEER_VISUAL_ANALYSIS.md) — 자산 복제 없는 파트·이펙트 레퍼런스

## 실행

Godot 4.7 이상에서 `Godot/project.godot`를 열거나, Windows에서는 [Run-PC-Build.bat](Run-PC-Build.bat)을 실행한다. 빌드 로그 없이 실행하려면 [Run-PC-Build-Silent.bat](Run-PC-Build-Silent.bat)을 사용한다. 로컬 Godot 콘솔 실행 파일 경로는 `GODOT_BIN` 환경 변수로 지정하며, 지정하지 않으면 이 작업 환경의 `D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe`를 사용한다.

현재 M20 세로 슬라이스는 다음을 제공한다.

- `RigidBody2D` 기반 관성·감쇠·메인/후진/RCS 추력과 CoM 보정
- 기울임 없는 탑다운 카메라, 우클릭 드래그 회전, 마우스 휠 줌
- 1·2·3·4칸 빔, 2×2 플레이트, 1·2칸 웨지의 격자 점유와 외곽 전용 라인
- 필드 부품 회수·유효 소켓 장착, `Shift` 장착 부품 이동
- 코어 연결성 분리, 탄약 타입 분리·병합 규칙, 질량 기반 방어막 레이어

M21 이후의 운석 충격, 전체 무기군, 스테이션/보스 항로, Android 터치 UI는 이전 구현을 완료로 간주하지 않으며 [이식 계획](docs/GDSCRIPT_SSOT_MIGRATION.md)의 순서로 이식한다.

## 빌드

- [Build-PC.bat](Build-PC.bat): `Build/PC/CaptainSalvage.exe` Windows 독립 실행 파일
- [Build-Web.bat](Build-Web.bat): `Build/Web/index.html` WebAssembly/WebGL 2 내보내기
- [Build-Android-Debug.bat](Build-Android-Debug.bat): `Build/Android/CaptainSalvage-debug.apk` Android debug APK

Web·Android 내보내기에는 Godot export template가 필요하다. Android는 Godot Editor Settings에 Android SDK, JDK 21, debug keystore를 설정해야 한다.

## 자동화 테스트

[Run-CaptainSalvage-Tests.bat](Run-CaptainSalvage-Tests.bat)을 실행하면 공용 테스트 프레임워크 메뉴에서 GDScript `runtime` 또는 보이는 Godot RHI 수동 실행을 선택한다. 직접 실행은 다음과 같다.

```bat
"D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64_console.exe" --headless --path Godot --script res://tests/test_runner.gd
```
