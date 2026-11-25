# 27. 이동 예측·보정·네트워크 물리

- 원본 계획서: `plans/27_Movement_Prediction_Network_Physics.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-Multiplayer` — 신규 (25와 같은 브랜치)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P0/P1/P2 / 본체 공수: 22-34 PW / 착수 단계: R1
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- 12 물리 snapshot 계약에 의존 (MVP는 정적 월드 캐릭터만)

## 첫 작업 (spike)

- 정적 월드 캐릭터 예측 + 원격 보간, RTT/손실 주입 시험

## 승격 gate

- 입력 history·replay·smoothing 품질 기준

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
