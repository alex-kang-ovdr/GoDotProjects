# 04. Compositor·렌더 패스·셰이더 확장

- 원본 계획서: `plans/04_Compositor_Render_Passes.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-Refactoring-04-compositor`
- 분류: 엔진 변경 → Forge-Refactoring 계열
- 우선순위: P2 / 본체 공수: 26-42 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- 기존 CompositorEffect hook 재사용 우선

## 첫 작업 (spike)

- 필요한 다중 패스 1건을 CompositorEffect만으로 구현 시도해 공개 API 한계 기록

## 승격 gate

- 공개 API로 불가한 지점만 최소 patch로 분리

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
