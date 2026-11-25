# 15. 팀 협업·버전 관리·잠금·검수

- 원본 계획서: `plans/15_Collaboration_VCS_Review.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-15-collaboration` (부모: `Forge-refactoring`)
- 우선순위: P0/P1 / 본체 공수: 28-46 PW / 착수 단계: R1
- 커밋 영역 성격: Forge

## 저장소에 이미 있는 관련 자산

- forge/Tools/collaboration.cjs, yjs-entry.js (실시간 협업)
- project-drive-sync.cjs, drive-snapshot-store.cjs (snapshot)
- Forge-Publish 브랜치

## 첫 작업 (spike)

- ProjectRevision 스키마를 기존 drive-snapshot-store 기록과 대조해 snapshot/복원 gap 목록화

## 승격 gate

- MVP: snapshot/복원 + UID 검증

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
