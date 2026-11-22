# Unreal Stack O Bot 3D (UE → Godot Port)

PlayForge UnrealConverter로 Unreal Engine 5.4 **Stack O Bot** 샘플을 Godot 4.7.2로 자동 포팅한 3D 퍼즐 플랫포머 템플릿입니다.

## 주요 포팅 내용
- **제트팩 호버 & 연료 시스템**: `UECharacterMovement` (`Space` 점프 + `LeftShift` 제트팩 호버, 연료 소모/지면 자동 회복, `JetpackHover` 애니메이션 상태)
- **비활성 봇 스폰 ("Stack" 퍼즐)**: `E` 키(`IA_SpawnBot`)로 `BP_InactiveBot`을 생성해 압력판(`BP_PressurePlate`)을 누른 상태로 유지
- **복합 Blueprint 변환 (Delegate · Interface · Timeline)**: `BP_PressurePlate` → `on_plate_state_changed` Delegate + `BPI_Interactable.bpi_on_interact` → `BP_Door` Timeline 개폐
- **수집 & 클리어**: 에너지 오브(`BP_EnergyOrb`) 수집 및 목표 패드(`BP_GoalPad`) 도달
- **라이선스 준수**: 재배포 불가 UE 전용 스켈레탈 메시는 제외하고 절차적 캡슐 봇으로 안전 대체
