# HavokProfile — ISMProfile 결정론적 물리 폭파 벤치마크 (Havok Physics vs Jolt Physics)

`Forge-ISM-profile`의 복셀 지형·셰이더·카메라·MultiMesh 파이프라인을 기반으로, 2단계 결정론적 물리 폭파(틱 30 중앙 폭파 + 틱 150 양측 2차 폭파)를 Godot `PhysicsServer3D` 표준 인터페이스로 실행하여 **Jolt Physics**와 **Havok Physics 2025.1.1 GDExtension**의 성능·히치·메모리·결정론을 비교합니다.

- 상세 결과 리포트: [docs/havok/HAVOK_VS_JOLT_BENCHMARK.md](../docs/havok/HAVOK_VS_JOLT_BENCHMARK.md)
- GDExtension 소스 및 빌드 스크립트: [forge/Godot/addons/playforge_havok_physics/](../forge/Godot/addons/playforge_havok_physics/)
