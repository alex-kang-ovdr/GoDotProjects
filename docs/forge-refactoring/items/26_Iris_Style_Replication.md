# 26. Iris 방식 상태 복제

- 원본 계획서: [`plans/26_Iris_Style_Replication.md`](../plans/26_Iris_Style_Replication.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Multiplayer` — 신규 (25와 같은 브랜치)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P0/P1 / 본체 공수: 26-40 PW / 착수 단계: R1
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- MultiplayerSynchronizer 기존 기능 재사용 우선

## 첫 작업 (spike)

- MVP 범위: typed full snapshot·수명·owner/거리 필터만

## 승격 gate

- late join·역순 snapshot·tombstone 시험

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §9 9. WBS와 예상 공수 (원본 110행); §10 10. 시험 프로파일과 완료 기준 (원본 125행)
- 패키지 내 원문 SHA-256: `30d9eb771a487fe5f1ce546ed1d47a334ee6783284b5e70872e979600d635fab`
- SSOT 적용: Iris식 복제는 엔진 패치 없이 addon/GDExtension으로 구현한다. 방 1개=프로세스 1개이며 네트워크 schema와 Ready Barrier는 엔진 밖 계약이다(SSOT.md §2).
