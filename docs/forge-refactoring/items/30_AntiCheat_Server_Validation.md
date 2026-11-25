# 30. 서버 권한 검증·안티치트·UGC 격리

- 원본 계획서: [`plans/30_AntiCheat_Server_Validation.md`](../plans/30_AntiCheat_Server_Validation.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Multiplayer` — 게임 내 validator — 빌드/PIE 격리는 Forge-BuildExport
- 분류: 엔진 무변경 → Forge 계열
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

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §8 8. WBS와 공수 (원본 95행); §9 9. 완료 기준과 검증 (원본 107행)
- 패키지 내 원문 SHA-256: `693894d7e1e09885dafe0e68a5e02242642a77ea3148593ee879da4f38ef3222`
- SSOT 적용: EAC는 보류다. 이 항목은 서버 행동 검증·입력 제한·UGC 격리만 다루며, 빌드/PIE 격리는 Forge-BuildExport 소유다(SSOT.md §2).
