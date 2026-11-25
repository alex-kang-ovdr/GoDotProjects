# 15. 팀 협업·버전 관리·잠금·검수

- 원본 계획서: [`plans/15_Collaboration_VCS_Review.md`](../plans/15_Collaboration_VCS_Review.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Collaboration` — 신규 (착수 시 생성)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P0/P1 / 본체 공수: 28-46 PW / 착수 단계: R1
- 커밋 영역 성격: Forge

## 저장소에 이미 있는 관련 자산

- HTML/JS Studio와 Yjs 실시간 협업(collaboration.cjs)은 2026-11-25 폐기 — 협업은 웹 Godot 편집기 기준으로 새로 설계
- project-drive-sync.cjs, drive-snapshot-store.cjs (snapshot)
- Forge-Publish 브랜치

## 첫 작업 (spike)

- ProjectRevision 스키마를 기존 drive-snapshot-store 기록과 대조해 snapshot/복원 gap 목록화

## 승격 gate

- MVP: snapshot/복원 + UID 검증

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §8 8. 작업분해와 공수 (원본 83행); §9 9. 도입 단계 (원본 95행); §10 10. 완료 기준·재현 실험 (원본 101행)
- 패키지 내 원문 SHA-256: `eb1566f19589fbaf91685c5bc71751cf4f3b903063d79bd6370a43326aaa57bf`
- SSOT 적용: HTML/JS Studio와 Yjs 협업은 폐기됐다. 이 항목은 웹 Godot 편집기 기준으로 scene/text 변경 의미론을 새로 설계하며, 사례 입력은 충돌·undo·reconnect 규칙에 한정한다(RESEARCH_INPUTS.md §3; REVIEW.md §3.1).
