# 09. 데이터 지향 연산·ECS·멀티스레딩

- 원본 계획서: `plans/09_DOD_ECS_Multithreading.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-09-dodEcs` (부모: `Forge-refactoring`)
- 우선순위: P1/P0 / 본체 공수: 18-30 PW / 착수 단계: R1
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- 기존 Node 권위 서버(brawllabs 등)의 tick 비용과 별개 — Godot 측 hot loop 대상

## 첫 작업 (spike)

- 13 계측으로 hot loop 상위 3개 식별 후 RID/MultiMesh batch로 1건 전환

## 승격 gate

- 측정 이득과 주 스레드 boundary 회귀 없음

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
