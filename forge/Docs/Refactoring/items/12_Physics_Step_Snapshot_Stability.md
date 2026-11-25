# 12. 물리 수동 스텝·상태 복구·조인트 안정성

- 원본 계획서: `plans/12_Physics_Step_Snapshot_Stability.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-12-physicsStep` (부모: `Forge-refactoring`)
- 우선순위: P1/P2/R&D / 본체 공수: 32-56 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- Forge-UnrealPort PhysicalBoneSimulator3D 래그돌
- 27 네트워크 물리의 선행 계약

## 첫 작업 (spike)

- Jolt/GodotPhysics 각각 수동 step·snapshot 가능 범위를 capability 표로 작성

## 승격 gate

- 27이 요구하는 snapshot/journal 계약 충족

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
