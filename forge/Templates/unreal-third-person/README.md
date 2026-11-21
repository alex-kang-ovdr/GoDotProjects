# Unreal Third Person 3D (UE → Godot Port)

PlayForge UnrealConverter로 Unreal Engine 5.4 Third Person Template을 Godot 4.7.2로 자동 포팅한 3D 템플릿입니다.

## 주요 포팅 내용
- **좌표·단위 변환**: UE 센티미터(왼손 Z-Up) → Godot 미터(오른손 Y-Up)
- **캐릭터 이동 호환**: `UECharacterMovement` (`max_walk_speed_cm=500`, `jump_z_velocity_cm=700`, `gravity_scale=1.75`, `air_control=0.35`, 경사각 44.7°)
- **Blueprint → GDScript 컴파일**: `BP_ThirdPersonCharacter` 이벤트 그래프 및 Enhanced Input (`WASD`, `Space`, 마우스 시점) 자동 변환
- **라이선스 준수**: 재배포 불가 UE 전용 스켈레탈 메시는 제외하고 절차적 캡슐 마네킹으로 안전 대체
