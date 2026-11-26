# 01. GPU 주도 렌더링과 컬링

- 원본 계획서: [`plans/01_GPU_Driven_Rendering.md`](../plans/01_GPU_Driven_Rendering.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Refactoring-01-gpuRendering`
- 분류: 엔진 변경 → Godot-Refactoring 계열
- 우선순위: P2 / 본체 공수: 36-56 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- 엔진 정본 tools/engine/engine-ssot.json (포크 Forge-Refactoring 기준 커밋, 5개 타깃 pending_fork_rebuild) — 서브모듈은 워크트리에서 미초기화
- Forge-UnrealPort의 MultiMesh 인스턴스 대량 배치(13,976개)가 측정 대상 장면 후보

## 첫 작업 (spike)

- 대표 장면(UnrealPort MainWorld)에서 draw call·CPU 컬링 시간 baseline 측정 (13 계측 선행)

## 승격 gate

- baseline 대비 CPU 프레임 시간 개선이 측정되고 Mobile/Compatibility fallback 유지

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §7 7. 작업 분해와 산출물 (원본 72행); §8 8. 단계별 도입 (원본 84행); §9 9. 완료 기준과 검증 절차 (원본 90행)
- 패키지 내 원문 SHA-256: `45c4d8cd371b79cc064cfba7fbd5cec8d890db1ab4b9ba8d66e8b945a668ef60`
