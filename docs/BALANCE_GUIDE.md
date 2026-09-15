# 밸런스 단일 소스 관리

게임 규칙 밸런스는 [Godot/scripts/balance.gd](../Godot/scripts/balance.gd)에서 관리한다. 물리 수치는 별도 SSOT인 [Godot/scripts/physics_tuning.gd](../Godot/scripts/physics_tuning.gd)에서만 관리하며, 시각 연출은 [Godot/scripts/visual_tuning.gd](../Godot/scripts/visual_tuning.gd)에 둔다. Windows, Android, Web은 같은 GDScript를 내보내며, 헤드리스 테스트도 같은 값을 읽는다. 따라서 CSV 사본이나 플랫폼별 수치표를 만들지 않는다.

## 조정 영역

- `physics_tuning`: 웹 기준 지수 감쇠, CoM 전진 추력 보정 범위, 충돌체 크기·마찰·반발
- `player`: 시작 코어 HP, 모듈 한도, 회수 거리
- `modules`: 모든 파트의 HP·질량·추력·탄약 종류·시작 재고·점유 격자
- `weapons`: 레이저·머신건·레일건·수동 미사일·자동 미니 유도탄의 피해, 속도, 사거리, 소비량, 유도/가속 수치
- `shield`: 레이어 상한, 생성기 커버 질량, 복구 간격
- `upgrades`: Kepler·Lyra 컨트롤 타워·Perseus에서 바뀌는 값

## 안전한 조정 순서

1. `Godot/scripts/balance.gd`에서 한 계열의 값만 바꾼다.
2. `Run-CaptainSalvage-Tests.bat`에서 `runtime`을 실행한다.
3. 대표 전투 구간을 수동으로 플레이해 수치 변경이 30분 항로, 탄약 부족, 방어막 질량 임계점에 미치는 영향을 기록한다.

자동화는 규칙 연결을 확인할 뿐 재미·난이도·최소 기기 성능을 검증하지 않는다. 실제 밸런스 판정은 플레이테스트 기록이 필요하다.

색상·불투명도·화면 피드백 같은 시각 튜닝은 밸런스가 아니며 [Godot/scripts/visual_tuning.gd](../Godot/scripts/visual_tuning.gd)에서만 관리한다.
