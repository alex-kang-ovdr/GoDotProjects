# 22. 에셋 스토어 결제·정산·평가·탐색

- 원본 계획서: [`plans/22_Asset_Store_Commerce.md`](../plans/22_Asset_Store_Commerce.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `PlayHub-Store` — 기존 브랜치 (결제는 Hub-Billing)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P1 / 본체 공수: 26-42 PW / 착수 단계: R2
- 커밋 영역 성격: Forge

## 저장소에 이미 있는 관련 자산

- Forge-AssetStore (로컬 스토어·팩 설치)
- PlayHub-Store (Store 웹·API·Publisher)
- Hub-Billing (결제)

## 첫 작업 (spike)

- 기존 PlayHub-Store/Hub-Billing에 정산·리뷰가 어디까지 있는지 gap 분석 — 중복 구현 금지

## 승격 gate

- PSP·정산 상태 복구 시험

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §6 6. 작업 분해 (원본 77행); §7 7. 단계별 출시 gate (원본 89행); §8 8. 완료 기준 (원본 95행)
- 패키지 내 원문 SHA-256: `5e3735b08c6122dbf30143c885c5eb6aefeae8f0a71fd830515f5d8dac15cedb`
