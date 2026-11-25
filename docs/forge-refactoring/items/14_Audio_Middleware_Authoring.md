# 14. 적응형 오디오 저작·FMOD/Wwise 연동

- 원본 계획서: [`plans/14_Audio_Middleware_Authoring.md`](../plans/14_Audio_Middleware_Authoring.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
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

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §8 8. 작업분해와 공수 (원본 83행); §9 9. 완료 기준 (원본 95행)
- 패키지 내 원문 SHA-256: `1a506bd6df26da74709acef48cfe715063cabc607587781bc608b64d629fae1f`
