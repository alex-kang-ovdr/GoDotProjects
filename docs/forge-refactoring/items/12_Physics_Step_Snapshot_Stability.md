# 12. 물리 수동 스텝·상태 복구·조인트 안정성

- 원본 계획서: [`plans/12_Physics_Step_Snapshot_Stability.md`](../plans/12_Physics_Step_Snapshot_Stability.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Refactoring-JoltPhysics` — Jolt 성능 패치 4건과 함께 관리. Forge-HavokPhysics와 capability 계약 공유
- 분류: 엔진 변경 → Godot-Refactoring 계열
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

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §7 7. 작업분해와 공수 (원본 69행); §8 8. 도입 게이트 (원본 81행); §9 9. 완료 기준·검증 조건 (원본 87행)
- 패키지 내 원문 SHA-256: `aecbe8200877c50b25eb112175c29305d67845b46cd905759f5d66255bd97cff`
- SSOT 적용: 현재 사용자 결정 D4에 따라 기존 Jolt 성능 패치 4건은 포크 `Forge-Refactoring-JoltPhysics`에서 항목 12와 함께 유지한다. 원본의 upstream Jolt 기준 후보는 비교 기준으로만 읽고, 물리 결정성은 같은 기기 반복 시험까지만 확인된 상태다(SSOT.md §2-3, §5 D4).
