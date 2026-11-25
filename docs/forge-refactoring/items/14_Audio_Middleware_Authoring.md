# 14. 적응형 오디오 저작·FMOD/Wwise 연동

- 원본 계획서: `plans/14_Audio_Middleware_Authoring.md` (아직 저장소에 없음 — 원본 패키지 수령 후 이 파일 옆에 추가)
- 통합 대상 브랜치: `Forge-Audio` — 신규 (착수 시 생성)
- 분류: 엔진 무변경 → Forge 계열
- 우선순위: P1/P2 / 본체 공수: 22-36 PW / 착수 단계: R2
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- Forge-UnrealPort MetaSound→PCM 합성 컴파일러

## 첫 작업 (spike)

- 기존 AudioServer 버스로 적응형 음악 1곡 구현 — vendor adapter 필요성 판정

## 승격 gate

- 공통 audio API가 vendor 없이 동작

## 진행 상태

- [ ] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)
