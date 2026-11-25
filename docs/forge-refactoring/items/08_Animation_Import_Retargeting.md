# 08. 애니메이션 임포트·리타게팅·본 제어

- 원본 계획서: `plans/08_Animation_Import_Retargeting.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-Avatar` — 기존 브랜치 (Forge-UnrealPort·Forge-Tripo 리타게팅과 수렴)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P1/P2 / 본체 공수: 20-32 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- Forge-UnrealPort: 53본 스켈레톤, ControlRig→SkeletonModifier3D 컴파일
- Forge-Avatar: 아바타 듀얼 런타임
- 4.7 RetargetModifier3D 공식 존재 → 신규 클래스 개발 아님

## 첫 작업 (spike)

- UnrealPort·Avatar의 리타게팅 경로를 RetargetModifier3D 기반 공통 workflow로 묶을 수 있는지 조사

## 승격 gate

- 재임포트 시 mapping·override 보존 회귀 테스트

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
