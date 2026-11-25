# 18. 모바일 결제·광고·분석 SDK와 터치 입력

- 원본 계획서: `plans/18_Mobile_Live_SDK_Input.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-MobileSDK` — 신규 — 터치 입력·가상 조이스틱 addon만. godot-sdk/** 는 Hub-AOS, IAP 서버는 Hub-IOS, 원장은 Hub-Billing 소유
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P1/P0 / 본체 공수: 18-30 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- Hub-Billing (국내 간편결제·Toss)
- Hub-AdGame (실험 분류)
- TouchScreenButton 기존 API

## 첫 작업 (spike)

- Hub-Billing 원장과 게임 내 IAP 검증 경계 정의 + 가상 조이스틱 addon

## 승격 gate

- billing 서버 검증·SDK version matrix

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
