# 27. 이동 예측·보정·네트워크 물리

- 원본 계획서: [`plans/27_Movement_Prediction_Network_Physics.md`](../plans/27_Movement_Prediction_Network_Physics.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
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

- [x] 원본 계획서 반입
- [x] 첫 spike 이슈 분해 (`Forge-Multiplayer`: `prediction/fg_*.gd`, `prediction_validator_selftest.gd`, `run-r1-matrix.cjs`)
- [x] spike 결과 기록 (정적 월드 예측·reconcile/replay·화면 smoothing 분리·teleport/epoch 리셋·원격 보간 ring 구현; 실 UDP 프록시 LAN/150ms+1%/300ms+5% 모두 수렴 오차 0.000·hard correction 0건 실측; 동적 물리 resim/hit rewind·Android 실기기 미검증)

## 원본 계획 대조

- 원본 WBS 참조: §9 9. WBS와 예상 공수 (원본 111행); §10 10. 완료 기준과 측정 방법 (원본 126행)
- 패키지 내 원문 SHA-256: `b621608484c85b10140fb1ccedc80890eae3eb644ded8b839150fe001dd5df6a`
- SSOT 적용: 물리 결정성은 같은 기기 반복 실행에서만 확인됐다. 기기 간 동일 결과를 전제하지 않고 서버 보정 계약으로 검증한다(SSOT.md §2).
