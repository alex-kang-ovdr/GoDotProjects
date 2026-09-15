# 플랫폼 타겟 계약

## 공통

- 게임 규칙: GDScript SSOT. 플랫폼마다 질량, 피격, 방어막, 연결성, 탄약 결과가 달라지면 안 된다.
- 렌더: 기울임 없는 탑다운 `CanvasItem` 표현과 `RigidBody2D` 물리. 우주선 본체만 흔들고 카메라·HUD는 고정한다. Box2D v3 후보의 Godot 4.7 호환성 상태는 [PHYSICS_BACKEND.md](PHYSICS_BACKEND.md)를 따른다.
- 데이터: `balance.gd`는 규칙 수치, `visual_tuning.gd`는 시각 수치만 가진다.

## 입력

- PC: `W/A/S/D`, `Space`, 좌클릭 회수·장착, `Shift` + 클릭 이동, 우클릭 회전/미사일 표적, 휠 줌.
- Android: M24에서 같은 InputMap 액션을 누르는 동안만 발생시키는 가로형 터치 조종계를 추가한다. 독자 규칙을 만들지 않는다.
- Web: PC 입력을 우선 지원하며, 터치 조종계가 추가되면 Android와 같은 InputMap을 사용한다.

## 미검증 경계

Windows·Web·Android 내보내기는 검증됐다. Android 실기기 설치·장시간 안정성, 목표 기기 성능은 아직 검증되지 않았다. Box2D v3 후보의 알려진 위험과 회귀 기준은 [PHYSICS_BACKEND.md](PHYSICS_BACKEND.md)를 따른다.
