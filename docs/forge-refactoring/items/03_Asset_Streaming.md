# 03. 텍스처 중심 자산 스트리밍

- 원본 계획서: `plans/03_Asset_Streaming.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-Refactoring-03-assetStreaming`
- 분류: 엔진 변경 → Forge-Refactoring 계열
- 우선순위: P1/P2/P3 / 본체 공수: 26-42 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Core

## 저장소에 이미 있는 관련 자산

- texture mip streaming PR #113429가 upstream master 병합 — 4.7.2 tag 포함 여부 미확인

## 첫 작업 (spike)

- 현재 pin 커밋에 #113429 포함 여부 확인 후, 미포함이면 backport 비용 산정

## 승격 gate

- VRAM 예산 하에서 resident/unload가 실측으로 확인

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
