# 30. 서버 권한 검증·안티치트·UGC 격리

- 원본 계획서: `plans/30_AntiCheat_Server_Validation.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 작업 브랜치: `Forge-refactoring-30-antiCheat` (부모: `Forge-refactoring`)
- 우선순위: P0/P1 / 본체 공수: 14-22 PW / 착수 단계: R1
- 커밋 영역 성격: Forge

## 저장소에 이미 있는 관련 자산

- UGC Design v5.9 Content_Safety_AntiCheat 문서
- execution-allowlist.cjs
- 빌드·PIE 격리 부재 (현재 위험)

## 첫 작업 (spike)

- 필수 action validator + 빌드/PIE 실행 격리 요구 정리 (공개 전 P0)

## 승격 gate

- MVP: 필수 validator, UGC OS 격리

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
