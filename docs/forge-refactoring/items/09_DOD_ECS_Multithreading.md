# 09. 데이터 지향 연산·ECS·멀티스레딩

- 원본 계획서: [`plans/09_DOD_ECS_Multithreading.md`](../plans/09_DOD_ECS_Multithreading.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-ISM-profile` — 기존 브랜치 (MultiMesh/인스턴스 벤치마크)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P1/P0 / 본체 공수: 18-30 PW / 착수 단계: R1
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- 기존 Node 권위 서버(brawllabs 등)의 tick 비용과 별개 — Godot 측 hot loop 대상

## 첫 작업 (spike)

- 13 계측으로 hot loop 상위 3개 식별 후 RID/MultiMesh batch로 1건 전환

## 승격 gate

- 측정 이득과 주 스레드 boundary 회귀 없음

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §6 6. 작업분해와 공수 (원본 62행); §7 7. 도입 순서와 게이트 (원본 74행); §8 8. 완료 기준과 검증 방법 (원본 82행)
- 패키지 내 원문 SHA-256: `8704ce4ed89b1a2cef8ba9b59ce4f7a8d8fae76a8c79568b9ab4835ca305879b`
