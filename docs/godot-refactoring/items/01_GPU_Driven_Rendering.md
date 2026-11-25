# 01. GPU 주도 렌더링과 컬링

- 원본 계획서: `plans/01_GPU_Driven_Rendering.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Godot-Refactoring-01-gpuRendering`
- 분류: 엔진 변경 → Godot-Refactoring 계열
- 우선순위: P2 / 본체 공수: 36-56 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- `godot-engine` 서브모듈(엔진 포크, 현재 pin `ed1daf0`)이 있으나 워크트리에서 초기화되지 않음
- Forge-UnrealPort의 MultiMesh 인스턴스 대량 배치(13,976개)가 측정 대상 장면 후보

## 첫 작업 (spike)

- 대표 장면(UnrealPort MainWorld)에서 draw call·CPU 컬링 시간 baseline 측정 (13 계측 선행)

## 승격 gate

- baseline 대비 CPU 프레임 시간 개선이 측정되고 Mobile/Compatibility fallback 유지

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
