# 06. 하드웨어 레이트레이싱 통합·확장

- 원본 계획서: [`plans/06_Hardware_Ray_Tracing.md`](../plans/06_Hardware_Ray_Tracing.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Refactoring-06-hwrt`
- 분류: 엔진 변경 → Godot-Refactoring 계열
- 우선순위: R&D/P3 / 본체 공수: 36-61 PW / 착수 단계: R3
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- 4.7 RenderingDevice에 BLAS/TLAS API 존재(일부 Experimental)

## 첫 작업 (spike)

- 4.7 RD RT API로 그림자 1종 프로토타입 — 노출 범위·수명 문제 목록화

## 승격 gate

- R&D gate: 플랫폼·유지보수 인력·효과 측정 통과 시에만 승격

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §7 7. 작업 분해 (원본 70행); §8 8. 단계별 도입 (원본 82행); §9 9. 완료 기준과 검증 (원본 88행)
- 패키지 내 원문 SHA-256: `356293b3102fe2c62b9f66a63fb23044e2424d73a5386be50666c871371eda7c`
