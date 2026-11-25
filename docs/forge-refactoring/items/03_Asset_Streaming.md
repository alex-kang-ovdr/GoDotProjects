# 03. 텍스처 중심 자산 스트리밍

- 원본 계획서: [`plans/03_Asset_Streaming.md`](../plans/03_Asset_Streaming.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Refactoring-03-assetStreaming`
- 분류: 엔진 변경 → Godot-Refactoring 계열
- 우선순위: P1/P2/P3 / 본체 공수: 26-42 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- texture mip streaming PR #113429가 upstream master 병합 — 4.7.2 tag 포함 여부 미확인

## 첫 작업 (spike)

- 현재 pin 커밋에 #113429 포함 여부 확인 후, 미포함이면 backport 비용 산정

## 승격 gate

- VRAM 예산 하에서 resident/unload가 실측으로 확인

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §7 7. 작업 분해 (원본 76행); §8 8. 단계별 도입 (원본 88행); §9 9. 완료 기준과 검증 (원본 94행)
- 패키지 내 원문 SHA-256: `5ede4598f9c9c059e4b869ec8add819321fba8121883d60c701b1659011f8541`
