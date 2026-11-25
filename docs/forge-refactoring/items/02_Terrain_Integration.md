# 02. 지형 제작·실행·서버 데이터 통합

- 원본 계획서: `plans/02_Terrain_Integration.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-Terrain` — 신규 (착수 시 생성)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P1 / 본체 공수: 16-26 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- Forge-UnrealPort의 16-bit Landscape heightfield 디코더
- 서버 collision/nav 데이터 계약은 25/28과 공유

## 첫 작업 (spike)

- Terrain3D를 선택 addon으로 실제 target(Windows Forward+, Android Mobile) 1장면 로드·collision 확인

## 승격 gate

- 서버 headless에서 같은 collision 데이터로 판정 일치

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
