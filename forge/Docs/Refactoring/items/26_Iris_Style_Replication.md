# 26. Iris 방식 상태 복제

- 원본 계획서: `plans/26_Iris_Style_Replication.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-26-replication` (부모: `Forge-refactoring`)
- 우선순위: P0/P1 / 본체 공수: 26-40 PW / 착수 단계: R1
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- MultiplayerSynchronizer 기존 기능 재사용 우선

## 첫 작업 (spike)

- MVP 범위: typed full snapshot·수명·owner/거리 필터만

## 승격 gate

- late join·역순 snapshot·tombstone 시험

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
